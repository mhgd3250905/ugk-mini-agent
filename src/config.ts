import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface AppConfig {
	host: string;
	port: number;
	publicBaseUrl?: string;
	projectRoot: string;
	dataDir: string;
	agentDataDir: string;
	agentsDataDir: string;
	agentSessionsDir: string;
	conversationIndexPath: string;
	agentAssetsDir: string;
	agentAssetBlobsDir: string;
	assetIndexPath: string;
	connDataDir: string;
	connDatabasePath: string;
	backgroundDataDir: string;
	feishuDataDir: string;
	feishuConversationMapPath: string;
	feishuSettingsPath: string;
	teamRuntimeEnabled: boolean;
	teamDataDir: string;
	teamWorkerPollIntervalMs: number;
	teamWorkerLeaseTtlMs: number;
	teamWorkerHeartbeatIntervalMs: number;
	teamMaxConcurrentRuns: number;
	teamWorkerPhaseTimeoutMs: number;
	teamCheckerPhaseTimeoutMs: number;
	teamWatcherPhaseTimeoutMs: number;
	teamFinalizerPhaseTimeoutMs: number;
	teamMaxRunDurationMinutes: number;
}

export function loadApiKeyFromApiTxt(
	projectRoot: string,
	envVarName: string = "ZHIPU_GLM_API_KEY",
	fileName: string = "zhipu-api.txt",
): string | undefined {
	const existingValue = process.env[envVarName];
	if (existingValue && existingValue.trim().length > 0) {
		return existingValue;
	}

	const apiTxtPath = join(projectRoot, fileName);
	if (!existsSync(apiTxtPath)) {
		return undefined;
	}

	const content = readFileSync(apiTxtPath, "utf8");
	const apiKey = readApiKeyFromText(content, envVarName);
	if (!apiKey) {
		return undefined;
	}

	process.env[envVarName] = apiKey;
	return apiKey;
}

function readApiKeyFromText(content: string, envVarName: string): string | undefined {
	const match = content.match(/(?:api-?key|apikey|akikey)\s*[:=]\s*(\S+)/i);
	const apiKey = match?.[1]?.trim();
	if (apiKey) {
		return apiKey;
	}

	try {
		const parsed = JSON.parse(content) as { env?: Record<string, unknown> } & Record<string, unknown>;
		const value = parsed.env?.[envVarName] ?? parsed[envVarName];
		return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
	} catch {
		return undefined;
	}
}

export function getAppConfig(projectRoot: string = process.cwd()): AppConfig {
	if (process.env.UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP === "true") {
		loadApiKeyFromApiTxt(projectRoot);
		loadApiKeyFromApiTxt(projectRoot, "DEEPSEEK_API_KEY", "deepseek-api.txt");
		loadApiKeyFromApiTxt(projectRoot, "XIAOMI_MIMO_API_KEY", "小米api.txt");
		loadApiKeyFromApiTxt(projectRoot, "ALI_CODEPLAN_API_KEY", "阿里codeplan-api-2026-5.txt");
	}
	const dataDir = join(projectRoot, ".data");
	const agentDataDir = join(dataDir, "agent");
	const agentsDataDir = join(dataDir, "agents");
	const agentSessionsDir = join(agentDataDir, "sessions");
	const conversationIndexPath = join(agentDataDir, "conversation-index.json");
	const agentAssetsDir = join(agentDataDir, "assets");
	const agentAssetBlobsDir = join(agentAssetsDir, "blobs");
	const assetIndexPath = join(agentDataDir, "asset-index.json");
	const connDataDir = join(agentDataDir, "conn");
	const connDatabasePath = process.env.CONN_DATABASE_PATH?.trim() || join(connDataDir, "conn.sqlite");
	const backgroundDataDir = join(agentDataDir, "background");
	const feishuDataDir = join(agentDataDir, "feishu");
	const feishuConversationMapPath = join(feishuDataDir, "conversation-map.json");
	const feishuSettingsPath = join(feishuDataDir, "settings.json");

	return {
		host: process.env.HOST ?? "127.0.0.1",
		port: Number(process.env.PORT ?? "3000"),
		publicBaseUrl: process.env.PUBLIC_BASE_URL?.trim() || undefined,
		projectRoot,
		dataDir,
		agentDataDir,
		agentsDataDir,
		agentSessionsDir,
		conversationIndexPath,
		agentAssetsDir,
		agentAssetBlobsDir,
		assetIndexPath,
		connDataDir,
		connDatabasePath,
		backgroundDataDir,
		feishuDataDir,
		feishuConversationMapPath,
		feishuSettingsPath,
		teamRuntimeEnabled: process.env.TEAM_RUNTIME_ENABLED === "true",
		teamDataDir: process.env.TEAM_DATA_DIR?.trim() || join(dataDir, "team"),
		teamWorkerPollIntervalMs: Number(process.env.TEAM_WORKER_POLL_INTERVAL_MS ?? "3000"),
		teamWorkerLeaseTtlMs: Number(process.env.TEAM_WORKER_LEASE_TTL_MS ?? "60000"),
		teamWorkerHeartbeatIntervalMs: Number(process.env.TEAM_WORKER_HEARTBEAT_INTERVAL_MS ?? "10000"),
		teamMaxConcurrentRuns: Number(process.env.TEAM_MAX_CONCURRENT_RUNS ?? "1"),
		teamWorkerPhaseTimeoutMs: Number(process.env.TEAM_WORKER_PHASE_TIMEOUT_MS ?? "900000"),
		teamCheckerPhaseTimeoutMs: Number(process.env.TEAM_CHECKER_PHASE_TIMEOUT_MS ?? "300000"),
		teamWatcherPhaseTimeoutMs: Number(process.env.TEAM_WATCHER_PHASE_TIMEOUT_MS ?? "300000"),
		teamFinalizerPhaseTimeoutMs: Number(process.env.TEAM_FINALIZER_PHASE_TIMEOUT_MS ?? "300000"),
		teamMaxRunDurationMinutes: Number(process.env.TEAM_MAX_RUN_DURATION_MINUTES ?? "100"),
	};
}
