import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildServer } from "../src/server.js";
import type { AgentService } from "../src/agent/agent-service.js";

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
	const root = await mkdtemp(join(tmpdir(), "team-task-api-"));
	const teamDir = join(root, "team");
	process.env.TEAM_RUNTIME_ENABLED = "true";
	process.env.TEAM_DATA_DIR = teamDir;
	const app = await buildServer({ agentService: createAgentServiceStub() });
	return { app, root };
}

const taskPayload = {
	title: "调查 Medtrum 相关云服务器资产",
	leaderAgentId: "main",
	status: "ready",
	workUnit: {
		title: "调查 Medtrum 相关云服务器资产",
		input: { text: "围绕 Medtrum 相关公开云服务器资产进行搜索和证据整理。" },
		outputContract: { text: "输出中文 Markdown 报告，包含发现列表、证据来源和风险说明。" },
		acceptance: { rules: ["每条发现必须包含来源", "不确定项不能编造成结论"] },
		workerAgentId: "search",
		checkerAgentId: "main",
	},
};

test("POST /v1/team/tasks creates an independent Task resource", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		assert.equal(createRes.statusCode, 201);
		const body = createRes.json();
		assert.ok(body.task.taskId.startsWith("task_"));
		assert.equal(body.task.leaderAgentId, "main");
		assert.equal(body.task.workUnit.workerAgentId, "search");
		assert.equal(body.task.status, "ready");
		assert.equal(body.task.archived, false);
		assert.equal(body.task.planId, undefined, "Task must not be represented as a single-task Plan");

		const plansRes = await app.inject({ method: "GET", url: "/v1/team/plans" });
		assert.equal(plansRes.statusCode, 200);
		assert.equal(plansRes.json().length, 0, "creating a Task must not create a Plan");

		await app.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/tasks lists non-archived tasks and GET by id returns one task", async () => {
	const { app, root } = await buildTestServer();
	try {
		const firstRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		const secondRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: { ...taskPayload, title: "第二个 Task" } });
		const first = firstRes.json().task;
		const second = secondRes.json().task;
		await app.inject({ method: "POST", url: `/v1/team/tasks/${first.taskId}/archive` });

		const listRes = await app.inject({ method: "GET", url: "/v1/team/tasks" });
		assert.equal(listRes.statusCode, 200);
		assert.deepEqual(listRes.json().tasks.map((task: any) => task.taskId), [second.taskId]);

		const includeArchivedRes = await app.inject({ method: "GET", url: "/v1/team/tasks?includeArchived=1" });
		assert.equal(includeArchivedRes.statusCode, 200);
		assert.equal(includeArchivedRes.json().tasks.length, 2);

		const getRes = await app.inject({ method: "GET", url: `/v1/team/tasks/${second.taskId}` });
		assert.equal(getRes.statusCode, 200);
		assert.equal(getRes.json().task.taskId, second.taskId);
		await app.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("PATCH /v1/team/tasks/:taskId updates draft fields", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: { ...taskPayload, status: "drafting" } });
		const task = createRes.json().task;
		const patchRes = await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${task.taskId}`,
			payload: {
				title: "更新后的 Task",
				workUnit: { ...taskPayload.workUnit, input: { text: "更新输入" } },
				status: "ready",
			},
		});

		assert.equal(patchRes.statusCode, 200);
		assert.equal(patchRes.json().task.title, "更新后的 Task");
		assert.equal(patchRes.json().task.workUnit.input.text, "更新输入");
		assert.equal(patchRes.json().task.status, "ready");
		await app.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/tasks/:taskId/archive soft archives a task", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		const task = createRes.json().task;
		const archiveRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${task.taskId}/archive` });

		assert.equal(archiveRes.statusCode, 200);
		assert.equal(archiveRes.json().task.archived, true);
		assert.equal(archiveRes.json().task.status, "archived");

		const listRes = await app.inject({ method: "GET", url: "/v1/team/tasks" });
		assert.equal(listRes.json().tasks.length, 0);
		await app.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Task routes return 400 for invalid payload or Agent profile and 404 for missing task", async () => {
	const { app, root } = await buildTestServer();
	try {
		const invalidPayload = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: { ...taskPayload, title: "" } });
		assert.equal(invalidPayload.statusCode, 400);
		assert.match(invalidPayload.json().error, /task title is required/);

		const invalidAgent = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: { ...taskPayload, workUnit: { ...taskPayload.workUnit, workerAgentId: "missing-worker" } },
		});
		assert.equal(invalidAgent.statusCode, 400);
		assert.match(invalidAgent.json().error, /agent profile not found: missing-worker/);

		const missingGet = await app.inject({ method: "GET", url: "/v1/team/tasks/task_missing" });
		assert.equal(missingGet.statusCode, 404);

		const missingPatch = await app.inject({ method: "PATCH", url: "/v1/team/tasks/task_missing", payload: { title: "x" } });
		assert.equal(missingPatch.statusCode, 404);
		await app.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Task API warns when worker and checker are the same Agent", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: {
				...taskPayload,
				workUnit: { ...taskPayload.workUnit, workerAgentId: "search", checkerAgentId: "search" },
			},
		});
		assert.equal(createRes.statusCode, 201);
		assert.match(createRes.json().warnings[0], /self-checking weakens independent acceptance/);
		await app.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
