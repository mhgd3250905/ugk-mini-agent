import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildServer } from "../src/server.js";
import type { AgentService } from "../src/agent/agent-service.js";
import type { TeamPlan, TeamRunState, TeamTaskDeliveryOutcome } from "../src/team/types.js";

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
	const root = await mkdtemp(join(tmpdir(), "team-task-run-api-"));
	const teamDir = join(root, "team");
	process.env.TEAM_RUNTIME_ENABLED = "true";
	process.env.TEAM_DATA_DIR = teamDir;
	process.env.UGK_AGENT_DATA_DIR = join(root, "agent");
	process.env.CONN_DATABASE_PATH = join(root, "conn", "conn.sqlite");
	const app = await buildServer({ agentService: createAgentServiceStub() });
	return { app, root, teamDir };
}

export const taskPayload = {
	title: "获取 GitHub 热榜前 10 名",
	leaderAgentId: "main",
	status: "ready",
	workUnit: {
		title: "获取 GitHub 热榜前 10 名",
		input: { text: "搜索并整理 GitHub 当前热门仓库前 10 名。" },
		outputContract: { text: "输出中文 Markdown 列表，包含仓库名、链接和简短理由。" },
		acceptance: { rules: ["必须包含 10 个条目", "每个条目必须包含链接"] },
		workerAgentId: "search",
		checkerAgentId: "main",
	},
};

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

export function singleTaskPlan(taskId: string, title = "summary heavy"): TeamPlan {
	return {
		schemaVersion: "team/plan-1",
		planId: `canvas_task_${taskId}`,
		title,
		defaultTeamUnitId: `canvas_task_unit_${taskId}`,
		goal: { text: title },
		tasks: [{ id: taskId, title, input: { text: title }, acceptance: { rules: ["ok"] } }],
		outputContract: { text: "output" },
		archived: false,
		createdAt: "2026-06-02T00:00:00.000Z",
		updatedAt: "2026-06-02T00:00:00.000Z",
		runCount: 0,
	};
}

export async function waitForTerminalRun(app: Awaited<ReturnType<typeof buildServer>>, runId: string): Promise<TeamRunState> {
	const terminal = new Set(["completed", "completed_with_failures", "failed", "cancelled"]);
	for (let i = 0; i < 40; i++) {
		const res = await app.inject({ method: "GET", url: `/v1/team/task-runs/${runId}` });
		assert.equal(res.statusCode, 200);
		const state = res.json() as TeamRunState;
		if (terminal.has(state.status)) return state;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`task run did not reach terminal state: ${runId}`);
}

export async function waitForTaskRunCount(app: Awaited<ReturnType<typeof buildServer>>, taskId: string, minCount: number): Promise<TeamRunState[]> {
	for (let i = 0; i < 40; i++) {
		const res = await app.inject({ method: "GET", url: `/v1/team/tasks/${taskId}/runs` });
		assert.equal(res.statusCode, 200);
		const runs = res.json().runs as TeamRunState[];
		if (runs.length >= minCount) return runs;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`task ${taskId} did not reach run count ${minCount}`);
}

export async function waitForAttemptDelivery(app: Awaited<ReturnType<typeof buildServer>>, runId: string, taskId: string, expectedLength = 1): Promise<TeamTaskDeliveryOutcome[]> {
	for (let i = 0; i < 80; i++) {
		const res = await app.inject({ method: "GET", url: `/v1/team/task-runs/${runId}/tasks/${taskId}/attempts` });
		assert.equal(res.statusCode, 200);
		const attempts = res.json().attempts as Array<{ downstreamDelivery?: TeamTaskDeliveryOutcome[] }>;
		const delivery = attempts[0]?.downstreamDelivery;
		if (delivery && delivery.length >= expectedLength) return delivery;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`attempt delivery outcomes did not reach length ${expectedLength} for run ${runId} task ${taskId}`);
}
