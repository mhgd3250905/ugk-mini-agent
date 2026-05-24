import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildServer } from "../src/server.js";
import type { AgentService } from "../src/agent/agent-service.js";
import type { TeamRunState } from "../src/team/types.js";

function createAgentServiceStub() {
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

async function buildTestServer() {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-api-"));
	process.env.TEAM_RUNTIME_ENABLED = "true";
	process.env.TEAM_DATA_DIR = join(root, "team");
	const app = await buildServer({ agentService: createAgentServiceStub() });
	return { app, root };
}

const taskPayload = {
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

async function waitForTerminalRun(app: Awaited<ReturnType<typeof buildServer>>, runId: string): Promise<TeamRunState> {
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

test("POST /v1/team/tasks/:taskId/runs executes a Canvas Task without creating a Plan run", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createTask = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		assert.equal(createTask.statusCode, 201);
		const task = createTask.json().task;

		const runRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${task.taskId}/runs` });
		assert.equal(runRes.statusCode, 201);
		const created = runRes.json() as TeamRunState;
		assert.ok(created.runId.startsWith("run_"));
		assert.equal(created.source?.type, "canvas-task");
		assert.equal(created.source?.taskId, task.taskId);
		assert.equal(created.taskStates[task.taskId]?.status, "pending");

		const duplicateRun = await app.inject({ method: "POST", url: `/v1/team/tasks/${task.taskId}/runs` });
		assert.equal(duplicateRun.statusCode, 409);
		assert.match(duplicateRun.json().error, /active/);

		const finished = await waitForTerminalRun(app, created.runId);
		assert.equal(finished.status, "completed");
		assert.equal(finished.source?.taskId, task.taskId);
		assert.equal(finished.taskStates[task.taskId]?.status, "succeeded");
		assert.ok(finished.taskStates[task.taskId]?.resultRef);

		const attemptsRes = await app.inject({ method: "GET", url: `/v1/team/task-runs/${created.runId}/tasks/${task.taskId}/attempts` });
		assert.equal(attemptsRes.statusCode, 200);
		const attempts = attemptsRes.json().attempts;
		assert.equal(attempts.length, 1);
		assert.equal(attempts[0].worker.length, 1);
		assert.equal(attempts[0].checker.length, 1);
		assert.equal(attempts[0].watcher, null);

		const taskRunsRes = await app.inject({ method: "GET", url: `/v1/team/tasks/${task.taskId}/runs` });
		assert.equal(taskRunsRes.statusCode, 200);
		assert.deepEqual(taskRunsRes.json().runs.map((run: TeamRunState) => run.runId), [created.runId]);

		const planRunsRes = await app.inject({ method: "GET", url: "/v1/team/runs" });
		assert.equal(planRunsRes.statusCode, 200);
		assert.deepEqual(planRunsRes.json(), []);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/tasks/:taskId/runs rejects non-ready or archived tasks", async () => {
	const { app, root } = await buildTestServer();
	try {
		const draftRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: { ...taskPayload, status: "drafting" } });
		const draft = draftRes.json().task;
		const draftRun = await app.inject({ method: "POST", url: `/v1/team/tasks/${draft.taskId}/runs` });
		assert.equal(draftRun.statusCode, 409);
		assert.match(draftRun.json().error, /ready/);

		const readyRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		const ready = readyRes.json().task;
		await app.inject({ method: "POST", url: `/v1/team/tasks/${ready.taskId}/archive` });
		const archivedRun = await app.inject({ method: "POST", url: `/v1/team/tasks/${ready.taskId}/runs` });
		assert.equal(archivedRun.statusCode, 409);
		assert.match(archivedRun.json().error, /archived/);

		const missingRun = await app.inject({ method: "POST", url: "/v1/team/tasks/task_missing/runs" });
		assert.equal(missingRun.statusCode, 404);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});
