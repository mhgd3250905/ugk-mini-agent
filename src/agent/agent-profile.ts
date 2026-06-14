import { join } from "node:path";
import {
	getDefaultAllowedSkillPaths,
	getDefaultRuntimeAgentRulesPath,
	getProjectAgentDirPath,
} from "./agent-session-factory.js";

export interface AgentProfile {
	agentId: string;
	name: string;
	description: string;
	defaultModelProvider?: string;
	defaultModelId?: string;
	dataDir: string;
	sessionsDir: string;
	conversationIndexPath: string;
	agentDir: string;
	runtimeAgentRulesPath: string;
	mcpCatalogPath: string;
	workspaceDir: string;
	allowedSkillPaths: string[];
	disabledSkillNames?: string[];
}

export const DEFAULT_AGENT_ID = "main";
export const SEARCH_AGENT_ID = "search";
export const TEAM_WORKER_AGENT_ID = "team-worker";
export const TEAM_CHECKER_AGENT_ID = "team-checker";
export const TEAM_DISPATCHER_AGENT_ID = "team-dispatcher";
export const TEAM_TASK_AGENT_IDS = [
	TEAM_WORKER_AGENT_ID,
	TEAM_CHECKER_AGENT_ID,
	TEAM_DISPATCHER_AGENT_ID,
] as const;

export interface AgentProfileSummaryInput {
	agentId: string;
	name: string;
	description: string;
	defaultModelProvider?: string;
	defaultModelId?: string;
}

export function isValidAgentId(agentId: string): boolean {
	return /^[a-z][a-z0-9-]*$/.test(agentId);
}

export function createAgentProfileFromSummary(
	projectRoot: string,
	input: AgentProfileSummaryInput,
): AgentProfile {
	const dataDir = join(projectRoot, ".data", "agents", input.agentId);
	return {
		agentId: input.agentId,
		name: input.name,
		description: input.description,
		...(input.defaultModelProvider && input.defaultModelId
			? { defaultModelProvider: input.defaultModelProvider, defaultModelId: input.defaultModelId }
			: {}),
		dataDir,
		sessionsDir: join(dataDir, "sessions"),
		conversationIndexPath: join(dataDir, "conversation-index.json"),
		agentDir: join(dataDir, "pi-agent"),
		runtimeAgentRulesPath: join(dataDir, "AGENTS.md"),
		mcpCatalogPath: join(dataDir, "mcp", "servers.json"),
		workspaceDir: join(dataDir, "workspace"),
		allowedSkillPaths: [
			join(dataDir, "pi", "skills"),
			join(dataDir, "user-skills"),
		],
	};
}

export function createDefaultAgentProfiles(
	projectRoot: string,
	customProfiles: AgentProfileSummaryInput[] = [],
): AgentProfile[] {
	const mainDataDir = join(projectRoot, ".data", "agent");
	const seen = new Set([DEFAULT_AGENT_ID, SEARCH_AGENT_ID, ...TEAM_TASK_AGENT_IDS]);
	const searchProfileSummary = customProfiles.find((profile) => profile.agentId === SEARCH_AGENT_ID) ?? {
		agentId: SEARCH_AGENT_ID,
		name: "搜索 Agent",
		description: "用于搜索、查证和资料整理的独立 agent。",
	};
	const builtinProfileSummaries: AgentProfileSummaryInput[] = [
		searchProfileSummary,
		customProfiles.find((profile) => profile.agentId === TEAM_WORKER_AGENT_ID) ?? {
			agentId: TEAM_WORKER_AGENT_ID,
			name: "Team Worker Agent",
			description: "用于 Team Canvas Task 执行任务、读取输入并产出可验收结果的专职 agent。",
		},
		customProfiles.find((profile) => profile.agentId === TEAM_CHECKER_AGENT_ID) ?? {
			agentId: TEAM_CHECKER_AGENT_ID,
			name: "Team Checker Agent",
			description: "用于 Team Canvas Task 独立验收 worker 输出、判断是否满足契约和验收规则的专职 agent。",
		},
		customProfiles.find((profile) => profile.agentId === TEAM_DISPATCHER_AGENT_ID) ?? {
			agentId: TEAM_DISPATCHER_AGENT_ID,
			name: "Team Dispatcher Agent",
			description: "用于 Discovery Task 分发发现 item、生成 child Task 语义补丁的专职 agent。",
		},
	];
	const custom = customProfiles
		.filter((profile) => isValidAgentId(profile.agentId) && !seen.has(profile.agentId))
		.map((profile) => {
			seen.add(profile.agentId);
			return createAgentProfileFromSummary(projectRoot, profile);
		});

	return [
		{
			agentId: DEFAULT_AGENT_ID,
			name: "主 Agent",
			description: "默认综合 agent，保持现有会话、技能和运行方式。",
			dataDir: mainDataDir,
			sessionsDir: join(mainDataDir, "sessions"),
			conversationIndexPath: join(mainDataDir, "conversation-index.json"),
			agentDir: getProjectAgentDirPath(projectRoot),
			runtimeAgentRulesPath: getDefaultRuntimeAgentRulesPath(projectRoot),
			mcpCatalogPath: join(mainDataDir, "mcp", "servers.json"),
			workspaceDir: join(mainDataDir, "workspace"),
			allowedSkillPaths: getDefaultAllowedSkillPaths(projectRoot),
		},
		...builtinProfileSummaries.map((summary) => createAgentProfileFromSummary(projectRoot, summary)),
		...custom,
	];
}

export function resolveAgentProfile(
	profiles: readonly AgentProfile[],
	agentId: string | undefined,
): AgentProfile | undefined {
	if (!agentId || !isValidAgentId(agentId)) {
		return undefined;
	}
	return profiles.find((profile) => profile.agentId === agentId);
}
