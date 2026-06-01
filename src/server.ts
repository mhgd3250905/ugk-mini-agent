import Fastify, { type FastifyInstance } from "fastify";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getAppConfig } from "./config.js";
import { AgentService } from "./agent/agent-service.js";
import { AgentActivityStore } from "./agent/agent-activity-store.js";
import { AssetStore, type AssetStoreLike } from "./agent/asset-store.js";
import {
	createBrowserRegistryFromEnv,
	type BrowserRegistry,
} from "./browser/browser-registry.js";
import { BrowserControlService } from "./browser/browser-control.js";
import { JsonlBrowserBindingAuditLog, type BrowserBindingAuditLog } from "./browser/browser-binding-audit-log.js";
import {
	DEFAULT_AGENT_ID,
	type AgentProfile,
} from "./agent/agent-profile.js";
import { loadAgentProfilesSync } from "./agent/agent-profile-catalog.js";
import { ensureAgentProfileRuntimeSync } from "./agent/agent-profile-bootstrap.js";
import { AgentServiceRegistry } from "./agent/agent-service-registry.js";
import { AgentTemplateRegistry } from "./agent/agent-template-registry.js";
import { createDefaultAgentSessionFactory } from "./agent/agent-session-factory.js";
import { ConversationStore } from "./agent/conversation-store.js";
import { ConnDatabase } from "./agent/conn-db.js";
import { ConnRunStore } from "./agent/conn-run-store.js";
import { ConnSqliteStore } from "./agent/conn-sqlite-store.js";
import type { ModelConfigStore, ModelSelectionValidator } from "./agent/model-config.js";
import { createFileModelConfigStore, createLiveModelSelectionValidator } from "./agent/model-config.js";
import { NotificationHub } from "./agent/notification-hub.js";
import { registerAssetRoutes } from "./routes/assets.js";
import { registerActivityRoutes } from "./routes/activity.js";
import { registerBrowserRoutes } from "./routes/browsers.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerCleanupDebugRoutes } from "./routes/cleanup-debug.js";
import { registerConnRoutes } from "./routes/conns.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerFeishuSettingsRoutes } from "./routes/feishu-settings.js";
import { registerModelConfigRoutes } from "./routes/model-config.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerPlaygroundRoute } from "./routes/playground.js";
import { registerPublicSiteRoutes } from "./routes/public-site.js";
import { registerRuntimeDebugRoutes } from "./routes/runtime-debug.js";
import { registerStaticRoutes } from "./routes/static.js";
import { registerArtifactRoutes } from "./routes/artifacts.js";
import { FeishuSettingsStore } from "./integrations/feishu/settings-store.js";

export interface BuildServerOptions {
	agentService?: AgentService;
	agentServiceRegistry?: AgentServiceRegistry<AgentService>;
	agentTemplateRegistry?: AgentTemplateRegistry;
	agentProfileProjectRoot?: string;
	assetStore?: AssetStoreLike;
	connStore?: ConnSqliteStore;
	connRunStore?: ConnRunStore;
	activityStore?: AgentActivityStore;
	notificationHub?: NotificationHub;
	browserRegistry?: BrowserRegistry;
	browserControl?: BrowserControlService;
	browserBindingAuditLog?: BrowserBindingAuditLog;
	backgroundDataDir?: string;
	modelConfigStore?: ModelConfigStore;
	modelSelectionValidator?: ModelSelectionValidator;
	feishuSettingsStore?: FeishuSettingsStore;
}

function createDefaultAssetStore(): AssetStore {
	const config = getAppConfig();
	return new AssetStore({
		blobsDir: config.agentAssetBlobsDir,
		indexPath: config.assetIndexPath,
	});
}

function createDefaultConnDatabase(dbPath: string): ConnDatabase {
	const config = getAppConfig();
	const legacyDbPath = join(config.connDataDir, "conn.sqlite");
	const normalizedDbPath = dbPath.replace(/\\/g, "/");
	const normalizedLegacyDbPath = legacyDbPath.replace(/\\/g, "/");
	const database = new ConnDatabase({
		dbPath,
		legacyDbPath: normalizedLegacyDbPath !== normalizedDbPath ? legacyDbPath : undefined,
	});
	database.initializeSync();
	return database;
}

interface ResolvedConnStores {
	connDatabase?: ConnDatabase;
	connStore: ConnSqliteStore;
	connRunStore: ConnRunStore;
	activityStore: AgentActivityStore;
}

function resolveConnStores(options: BuildServerOptions, dbPath: string): ResolvedConnStores {
	const hasCompleteInjectedStores = Boolean(options.connStore && options.connRunStore && options.activityStore);
	const connDatabase = hasCompleteInjectedStores ? undefined : createDefaultConnDatabase(dbPath);
	const getDefaultDatabase = (): ConnDatabase => {
		if (!connDatabase) {
			throw new Error("Default conn database is unavailable when all conn stores are injected.");
		}
		return connDatabase;
	};

	return {
		connDatabase,
		connStore: options.connStore ?? new ConnSqliteStore({ database: getDefaultDatabase() }),
		connRunStore: options.connRunStore ?? new ConnRunStore({ database: getDefaultDatabase() }),
		activityStore: options.activityStore ?? new AgentActivityStore({ database: getDefaultDatabase() }),
	};
}

function createDefaultAgentService(assetStore: AssetStoreLike, profile?: AgentProfile): AgentService {
	const config = getAppConfig();
	const conversationStore = new ConversationStore(profile?.conversationIndexPath ?? config.conversationIndexPath);
	const sessionFactory = createDefaultAgentSessionFactory({
		projectRoot: config.projectRoot,
		sessionDir: profile?.sessionsDir ?? config.agentSessionsDir,
		...(profile?.agentDir ? { agentDir: profile.agentDir } : {}),
		...(profile?.allowedSkillPaths ? { allowedSkillPaths: profile.allowedSkillPaths } : {}),
		...(profile?.runtimeAgentRulesPath ? { runtimeAgentRulesPath: profile.runtimeAgentRulesPath } : {}),
		...(profile?.defaultModelProvider ? { defaultModelProvider: profile.defaultModelProvider } : {}),
		...(profile?.defaultModelId ? { defaultModelId: profile.defaultModelId } : {}),
		...(profile?.disabledSkillNames ? { disabledSkillNames: profile.disabledSkillNames } : {}),
	});

	return new AgentService({
		agentId: profile?.agentId ?? DEFAULT_AGENT_ID,
		conversationStore,
		sessionFactory,
		assetStore,
	});
}

function createDefaultAgentServiceRegistry(assetStore: AssetStoreLike): AgentServiceRegistry<AgentService> {
	const config = getAppConfig();
	return new AgentServiceRegistry({
		profiles: loadAgentProfilesSync(config.projectRoot),
		createService: (profile) => {
			ensureAgentProfileRuntimeSync(profile);
			return createDefaultAgentService(assetStore, profile);
		},
	});
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
	const app = Fastify({
		logger: false,
	});
	const assetStore = options.assetStore ?? createDefaultAssetStore();
	const config = getAppConfig();
	const { connDatabase, connStore, connRunStore, activityStore } = resolveConnStores(options, config.connDatabasePath);
	const notificationHub = options.notificationHub ?? new NotificationHub();
	const browserRegistry = options.browserRegistry ?? createBrowserRegistryFromEnv();
	const browserBindingAuditLog =
		options.browserBindingAuditLog ?? new JsonlBrowserBindingAuditLog(join(config.projectRoot, ".data", "audit", "browser-bindings.jsonl"));
	const agentServiceRegistry = options.agentServiceRegistry ?? createDefaultAgentServiceRegistry(assetStore);
	const agentProfileProjectRoot = options.agentProfileProjectRoot ?? config.projectRoot;
	const agentTemplateRegistry = options.agentTemplateRegistry ?? new AgentTemplateRegistry({ projectRoot: agentProfileProjectRoot });
	const modelConfigStore = options.modelConfigStore ?? createFileModelConfigStore(config.projectRoot);
	const modelSelectionValidator = options.modelSelectionValidator ?? createLiveModelSelectionValidator(config.projectRoot);
	const agentService = options.agentService ?? agentServiceRegistry.get(DEFAULT_AGENT_ID) ?? createDefaultAgentService(assetStore);

	app.get("/healthz", async () => {
		return { ok: true };
	});

	app.addHook("onClose", async () => {
		connDatabase?.close();
	});

	registerAssetRoutes(app, { projectRoot: config.projectRoot });
	registerFileRoutes(app, {
		assetStore,
		projectRoot: config.projectRoot,
	});
	registerPublicSiteRoutes(app, { projectRoot: config.projectRoot });
	registerPlaygroundRoute(app, { projectRoot: config.projectRoot });
	registerStaticRoutes(app, { projectRoot: config.projectRoot });
	registerActivityRoutes(app, { activityStore });
	registerBrowserRoutes(app, { browserRegistry, browserControl: options.browserControl });
	registerChatRoutes(app, {
		agentService,
		agentServiceRegistry,
		browserRegistry,
		browserBindingAuditLog,
		agentTemplateRegistry,
		projectRoot: agentProfileProjectRoot,
		modelConfigStore,
		modelSelectionValidator,
	});
	registerRuntimeDebugRoutes(app, { projectRoot: config.projectRoot });
	registerCleanupDebugRoutes(app, { database: connDatabase });
	registerModelConfigRoutes(app, {
		projectRoot: config.projectRoot,
		store: modelConfigStore,
		validator: modelSelectionValidator,
	});
	registerNotificationRoutes(app, { notificationHub });
	registerFeishuSettingsRoutes(app, {
		settingsStore: options.feishuSettingsStore ?? new FeishuSettingsStore({ settingsPath: config.feishuSettingsPath }),
	});
	registerConnRoutes(app, {
		connStore,
		connRunStore,
		backgroundDataDir: options.backgroundDataDir ?? config.backgroundDataDir,
		browserRegistry,
		browserBindingAuditLog,
		publicBaseUrl: config.publicBaseUrl,
	});
	registerArtifactRoutes(app, {
		connStore,
		connRunStore,
		backgroundDataDir: options.backgroundDataDir ?? config.backgroundDataDir,
		publicBaseUrl: config.publicBaseUrl,
	});

	if (config.teamRuntimeEnabled) {
		const { registerTeamRoutes } = await import("./team/routes.js");
		registerTeamRoutes(app, { teamDataDir: config.teamDataDir, projectRoot: config.projectRoot, publicBaseUrl: config.publicBaseUrl, maxConcurrentRuns: config.teamMaxConcurrentRuns, maxRunDurationMinutes: config.teamMaxRunDurationMinutes });
	}

	return app;
}

async function main(): Promise<void> {
	const config = getAppConfig();
	const app = await buildServer();

	try {
		await app.listen({
			host: config.host,
			port: config.port,
		});
	} catch (error) {
		app.log.error(error);
		process.exitCode = 1;
	}
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (entrypoint && import.meta.url === entrypoint) {
	await main();
}
