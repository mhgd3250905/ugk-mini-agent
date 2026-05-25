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
	process.env.UGK_AGENT_DATA_DIR = join(root, "agent");
	process.env.CONN_DATABASE_PATH = join(root, "conn", "conn.sqlite");
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

function withPorts(
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

async function waitForTaskRunCount(app: Awaited<ReturnType<typeof buildServer>>, taskId: string, minCount: number): Promise<TeamRunState[]> {
	for (let i = 0; i < 40; i++) {
		const res = await app.inject({ method: "GET", url: `/v1/team/tasks/${taskId}/runs` });
		assert.equal(res.statusCode, 200);
		const runs = res.json().runs as TeamRunState[];
		if (runs.length >= minCount) return runs;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`task ${taskId} did not reach run count ${minCount}`);
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
		assert.equal(attempts[0].roleProcesses.worker.status, "succeeded");
		assert.equal(attempts[0].roleProcesses.worker.profileId, "search");
		assert.equal(attempts[0].roleProcesses.worker.process.isComplete, true);
		assert.equal(attempts[0].roleProcesses.checker.status, "succeeded");
		assert.equal(attempts[0].roleProcesses.checker.profileId, "main");
		assert.equal(attempts[0].roleProcesses.checker.process.isComplete, true);

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

test("successful typed Task output creates an artifact and auto-starts connected downstream Task", async () => {
	const { app, root } = await buildTestServer();
	try {
		const collectRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown 文稿", type: "md" }],
			}),
		});
		const htmlRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "HTML 制作 Task" }, {
				inputPorts: [{ id: "source_md", label: "Markdown 文稿", type: "md" }],
				outputPorts: [{ id: "page_html", label: "HTML 页面", type: "html" }],
			}),
		});
		assert.equal(collectRes.statusCode, 201);
		assert.equal(htmlRes.statusCode, 201);
		const collect = collectRes.json().task;
		const html = htmlRes.json().task;

		const connectionRes = await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: collect.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: html.taskId,
				toInputPortId: "source_md",
			},
		});
		assert.equal(connectionRes.statusCode, 201);
		const connection = connectionRes.json().connection;

		const runRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${collect.taskId}/runs` });
		assert.equal(runRes.statusCode, 201);
		const upstreamRun = runRes.json() as TeamRunState;
		const upstreamFinished = await waitForTerminalRun(app, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");
		const upstreamTaskState = upstreamFinished.taskStates[collect.taskId]!;
		assert.equal(upstreamTaskState.status, "succeeded");
		assert.ok(upstreamTaskState.resultRef);

		const downstreamRuns = await waitForTaskRunCount(app, html.taskId, 1);
		const downstream = await waitForTerminalRun(app, downstreamRuns[0]!.runId);
		assert.equal(downstream.status, "completed");
		assert.equal(downstream.source?.taskId, html.taskId);
		assert.equal(downstream.source?.triggeredBy?.connectionId, connection.connectionId);
		assert.equal(downstream.source?.triggeredBy?.fromTaskId, collect.taskId);
		assert.equal(downstream.source?.triggeredBy?.fromRunId, upstreamRun.runId);
		assert.equal(downstream.source?.boundInputs?.[0]?.inputPortId, "source_md");
		assert.equal(downstream.source?.boundInputs?.[0]?.artifact.type, "md");
		assert.equal(downstream.source?.boundInputs?.[0]?.artifact.sourceTaskId, collect.taskId);
		assert.equal(downstream.source?.boundInputs?.[0]?.artifact.sourceRunId, upstreamRun.runId);
		assert.equal(downstream.source?.boundInputs?.[0]?.artifact.fileRef, upstreamTaskState.resultRef);
		assert.match(downstream.source?.boundInputs?.[0]?.artifact.preview ?? "", /accepted result/);
		assert.match(downstream.source?.boundInputs?.[0]?.artifact.content ?? "", /accepted result/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("typed Task trigger skips stale downstream input ports", async () => {
	const { app, root } = await buildTestServer();
	try {
		const collectRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown 鏂囩", type: "md" }],
			}),
		});
		const htmlRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "HTML 鍒朵綔 Task" }, {
				inputPorts: [{ id: "source_md", label: "Markdown 鏂囩", type: "md" }],
				outputPorts: [{ id: "page_html", label: "HTML 椤甸潰", type: "html" }],
			}),
		});
		assert.equal(collectRes.statusCode, 201);
		assert.equal(htmlRes.statusCode, 201);
		const collect = collectRes.json().task;
		const html = htmlRes.json().task;

		const connectionRes = await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: collect.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: html.taskId,
				toInputPortId: "source_md",
			},
		});
		assert.equal(connectionRes.statusCode, 201);

		const stalePortRes = await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${html.taskId}`,
			payload: {
				workUnit: {
					...html.workUnit,
					inputPorts: [{ id: "source_md", label: "HTML input", type: "html" }],
				},
			},
		});
		assert.equal(stalePortRes.statusCode, 200);

		const runRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${collect.taskId}/runs` });
		assert.equal(runRes.statusCode, 201);
		const upstreamRun = runRes.json() as TeamRunState;
		const upstreamFinished = await waitForTerminalRun(app, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");

		await new Promise(resolve => setTimeout(resolve, 100));
		const downstreamRunsRes = await app.inject({ method: "GET", url: `/v1/team/tasks/${html.taskId}/runs` });
		assert.equal(downstreamRunsRes.statusCode, 200);
		assert.deepEqual(downstreamRunsRes.json().runs, []);
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
