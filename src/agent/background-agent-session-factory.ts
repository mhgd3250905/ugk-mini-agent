import {
	AuthStorage,
	createAgentSession,
	createBashToolDefinition,
	ModelRegistry,
	SessionManager,
	type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { prepareBrowserBoundBashEnvironment } from "../browser/browser-bound-bash.js";
import { buildRuntimeDependencyEnvironment } from "./runtime-dependencies.js";
import {
	createProjectSettingsManager,
	createSkillRestrictedResourceLoader,
	getProjectAgentDirPath,
	getProjectModelsPath,
	type AgentSessionLike,
} from "./agent-session-factory.js";
import { getCurrentBackgroundWorkspaceEnvironment } from "./background-workspace-context.js";
import type { BackgroundAgentSessionFactory } from "./background-agent-runner.js";
import type { RunWorkspace } from "./background-workspace.js";
import type { ResolvedBackgroundAgentSnapshot } from "./background-agent-profile.js";

export class ProjectBackgroundSessionFactory implements BackgroundAgentSessionFactory {
	constructor(private readonly projectRoot: string) {}

	async createSession(input: {
		runId: string;
		connId: string;
		workspace: RunWorkspace;
		snapshot: ResolvedBackgroundAgentSnapshot;
		browserId?: string;
		browserScope?: string;
		sessionFile?: string;
		customTools?: ToolDefinition[];
	}): Promise<AgentSessionLike> {
		const sessionManager = input.sessionFile
			? SessionManager.open(input.sessionFile, input.workspace.sessionDir)
			: SessionManager.create(input.workspace.rootPath, input.workspace.sessionDir);
		const authStorage = AuthStorage.create();
		const modelRegistry = ModelRegistry.create(authStorage, getProjectModelsPath(this.projectRoot));
		const model = resolveBackgroundSessionModel(modelRegistry, input.snapshot);
		const skillPaths = input.snapshot.skillPaths?.length
			? input.snapshot.skillPaths
			: Array.from(new Set(input.snapshot.skills.map((skill) => skill.path.replace(/[\\/][^\\/]+[\\/]SKILL\.md$/, ""))));
		const resourceLoader = createBackgroundResourceLoader({
			projectRoot: this.projectRoot,
			workspaceRoot: input.workspace.rootPath,
			agentDir: input.snapshot.agentDir,
			runtimeAgentRulesPath: input.snapshot.rulesPath,
			skillPaths,
		});
		await resourceLoader.reload();
		const settingsManager = createProjectSettingsManager(this.projectRoot);
		const runtimeDependencyEnv = buildRuntimeDependencyEnvironment(this.projectRoot);
		const browserEnv = await prepareBrowserBoundBashEnvironment({
			workspaceRoot: input.workspace.rootPath,
			browserId: input.browserId,
			browserScope: input.browserScope,
			env: { ...process.env, ...runtimeDependencyEnv },
		});

		const { session } = await createAgentSession({
			cwd: input.workspace.rootPath,
			agentDir: input.snapshot.agentDir ?? getProjectAgentDirPath(this.projectRoot),
			authStorage,
			customTools: [
				createBashToolDefinition(input.workspace.rootPath, {
					commandPrefix: settingsManager.getShellCommandPrefix(),
					shellPath: settingsManager.getShellPath(),
					spawnHook: (context) => ({
						...context,
						env: {
							...context.env,
							...runtimeDependencyEnv,
							...getCurrentBackgroundWorkspaceEnvironment(),
							...browserEnv,
						},
					}),
				}) as never,
				...(input.customTools ?? []),
			],
			modelRegistry,
			model,
			settingsManager,
			sessionManager,
			resourceLoader,
		});

		return session;
	}
}

export function createBackgroundResourceLoader(input: {
	projectRoot: string;
	workspaceRoot: string;
	agentDir?: string;
	runtimeAgentRulesPath?: string;
	skillPaths: string[];
}) {
	return createSkillRestrictedResourceLoader({
		projectRoot: input.projectRoot,
		agentDir: input.agentDir ?? getProjectAgentDirPath(input.projectRoot),
		allowedSkillPaths: input.skillPaths,
		runtimeAgentRulesPath: input.runtimeAgentRulesPath,
	});
}

interface DeprecatedBackgroundModelAlias {
	provider: string;
	model: string;
	replacementProvider: string;
	replacementModel: string;
}

const DEPRECATED_BACKGROUND_MODEL_ALIASES: DeprecatedBackgroundModelAlias[] = [
	{
		provider: "deepseek-anthropic",
		model: "deepseek-v4-pro",
		replacementProvider: "deepseek",
		replacementModel: "deepseek-v4-pro",
	},
	{
		provider: "deepseek-anthropic",
		model: "deepseek-v4-flash",
		replacementProvider: "deepseek",
		replacementModel: "deepseek-v4-flash",
	},
];

function findDeprecatedBackgroundModelAlias(
	snapshot: Pick<ResolvedBackgroundAgentSnapshot, "provider" | "model">,
): DeprecatedBackgroundModelAlias | undefined {
	return DEPRECATED_BACKGROUND_MODEL_ALIASES.find(
		(alias) => alias.provider === snapshot.provider && alias.model === snapshot.model,
	);
}

export function resolveBackgroundSessionModel(
	modelRegistry: Pick<ModelRegistry, "find">,
	snapshot: Pick<ResolvedBackgroundAgentSnapshot, "provider" | "model">,
): NonNullable<ReturnType<ModelRegistry["find"]>> {
	const model = modelRegistry.find(snapshot.provider, snapshot.model);
	if (model) {
		return model;
	}
	const alias = findDeprecatedBackgroundModelAlias(snapshot);
	if (alias) {
		const replacement = modelRegistry.find(alias.replacementProvider, alias.replacementModel);
		if (replacement) {
			return replacement;
		}
		throw new Error(
			`Background agent model not found: ${snapshot.provider}/${snapshot.model}; deprecated alias replacement missing: ${alias.replacementProvider}/${alias.replacementModel}`,
		);
	}
	throw new Error(`Background agent model not found: ${snapshot.provider}/${snapshot.model}`);
}
