import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server.js";
import type { AgentService } from "../src/agent/agent-service.js";
import { TaskStore } from "../src/team/task-store.js";

export function createAgentServiceStub() {
	return {
		chat: async () => ({ reply: "ok", conversationId: "c1", runId: "r1" }),
		streamChat: async () => {},
		queueMessage: async () => ({ reply: "ok", conversationId: "c1", runId: "r1" }),
		interruptChat: async () => {},
		resetConversation: async () => {},
		getAgentRunStatus: async () => ({ conversationId: "c1", running: false }),
		getRunStatus: async () => ({ conversationId: "c1", running: false, contextUsage: { provider: "p", model: "m", currentTokens: 0, contextWindow: 128000, reserveTokens: 16000, maxResponseTokens: 8000, availableTokens: 112000, percent: 0, status: "safe" as const, mode: "usage" as const } }),
		subscribeRunEvents: () => ({ conversationId: "c1", running: false, unsubscribe: () => {} }),
		getRunEvents: async () => [],
		getConversations: async () => [],
		getConversation: async () => null,
		createConversation: async () => ({ id: "c1", title: "t", createdAt: "", updatedAt: "" }),
		switchConversation: async () => {},
		deleteConversation: async () => {},
	} as unknown as AgentService;
}

export async function buildTestServer() {
	const root = await mkdtemp(join(tmpdir(), "team-task-api-"));
	const teamDir = join(root, "team");
	process.env.TEAM_RUNTIME_ENABLED = "true";
	process.env.TEAM_DATA_DIR = teamDir;
	process.env.UGK_AGENT_DATA_DIR = join(root, "agent");
	process.env.CONN_DATABASE_PATH = join(root, "conn", "conn.sqlite");
	const app = await buildServer({ agentService: createAgentServiceStub() });
	return { app, root, teamDir };
}

export const taskPayload = {
	title: "调查 Medtrum 相关云服务器资产",
	leaderAgentId: "main",
	status: "ready" as const,
	workUnit: {
		title: "调查 Medtrum 相关云服务器资产",
		input: { text: "围绕 Medtrum 相关公开云服务器资产进行搜索和证据整理。" },
		outputContract: { text: "输出中文 Markdown 报告，包含发现列表、证据来源和风险说明。" },
		acceptance: { rules: ["每条发现必须包含来源", "不确定项不能编造成结论"] },
		workerAgentId: "search",
		checkerAgentId: "main",
	},
};

export const discoverySpec = {
	schemaVersion: "team/discovery-spec-1" as const,
	discoveryGoal: "发现 Medtrum 相关公开域名资产。",
	outputKey: "items",
	itemIdField: "id" as const,
	requiredItemFields: ["id"],
	recommendedItemFields: ["title", "type"],
	dispatchGoal: "逐项核查每个域名的归属、证据和风险。",
	dispatcherAgentId: "main",
	generatedWorkerAgentId: "search",
	generatedCheckerAgentId: "main",
	autoRun: { enabled: true as const, concurrency: 3 as const },
};

export const templateConfig = {
	schemaVersion: "team/task-template-1" as const,
	parameters: [
		{ id: "keyword", label: "关键词", required: true as const },
	],
};

export function discoveryTaskPayload(overrides: Record<string, unknown> = {}) {
	return {
		...taskPayload,
		canvasKind: "discovery",
		discoverySpec,
		...overrides,
	};
}

export function generatedSource(
	sourceDiscoveryTaskId: string,
	sourceItemId: string,
	itemStatus: "active" | "stale" = "active",
	options: { latestManagedWorkUnit?: typeof taskPayload.workUnit; workUnitMode?: "managed" | "customized" } = {},
) {
	return {
		schemaVersion: "team/generated-task-source-1" as const,
		sourceDiscoveryTaskId,
		sourceItemId,
		itemStatus,
		itemPayload: { id: sourceItemId, title: `Item ${sourceItemId}`, type: "domain" },
		latestDiscoveryRunId: `run_${sourceItemId}`,
		latestDiscoveryAttemptId: `attempt_${sourceItemId}`,
		latestDiscoveredAt: "2026-05-30T00:00:00.000Z",
		workUnitMode: options.workUnitMode ?? "managed" as const,
		...(options.latestManagedWorkUnit ? { latestManagedWorkUnit: options.latestManagedWorkUnit } : {}),
	};
}

export async function seedGeneratedTask(
	teamDir: string,
	sourceDiscoveryTaskId: string,
	sourceItemId: string,
	itemStatus: "active" | "stale" = "active",
	options: { latestManagedWorkUnit?: typeof taskPayload.workUnit; workUnitMode?: "managed" | "customized" } = {},
) {
	const store = new TaskStore(teamDir, { getAgentIds: () => ["main", "search"] });
	return store.create({
		...taskPayload,
		title: `Generated ${sourceItemId}`,
		workUnit: { ...taskPayload.workUnit, title: `Generated ${sourceItemId}` },
		generatedSource: generatedSource(sourceDiscoveryTaskId, sourceItemId, itemStatus, options),
	});
}

export function withPorts(
	payload: typeof taskPayload,
	ports: {
		inputPorts?: Array<{ id: string; label: string; type: string }>;
		outputPorts?: Array<{ id: string; label: string; type: string }>;
	},
) {
	return {
		...payload,
		workUnit: {
			...payload.workUnit,
			...ports,
		},
	};
}
