import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildServer } from "../src/server.js";
import type { AgentService } from "../src/agent/agent-service.js";
import type { TeamPlan, TeamRunState, TeamTaskDeliveryOutcome } from "../src/team/types.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { TaskStore } from "../src/team/task-store.js";

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
	const teamDir = join(root, "team");
	process.env.TEAM_RUNTIME_ENABLED = "true";
	process.env.TEAM_DATA_DIR = teamDir;
	process.env.UGK_AGENT_DATA_DIR = join(root, "agent");
	process.env.CONN_DATABASE_PATH = join(root, "conn", "conn.sqlite");
	const app = await buildServer({ agentService: createAgentServiceStub() });
	return { app, root, teamDir };
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

function singleTaskPlan(taskId: string, title = "summary heavy"): TeamPlan {
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

async function waitForAttemptDelivery(app: Awaited<ReturnType<typeof buildServer>>, runId: string, taskId: string, expectedLength = 1): Promise<TeamTaskDeliveryOutcome[]> {
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

test("GET/PATCH /v1/team/console-layout persists Team Console canvas UI state", async () => {
	const { app, root } = await buildTestServer();
	try {
		const empty = await app.inject({ method: "GET", url: "/v1/team/console-layout" });
		assert.equal(empty.statusCode, 200);
		assert.equal(empty.json().state, null);

		const state = {
			schemaVersion: 1,
			states: {
				live: {
					schemaVersion: 1,
					dataSource: "live",
					taskNodePositions: [{ taskId: "task_shared_layout", position: { x: 420, y: 260 } }],
					viewport: { x: 12, y: 24, scale: 0.9 },
				},
			},
		};
		const patch = await app.inject({
			method: "PATCH",
			url: "/v1/team/console-layout",
			payload: { state },
		});
		assert.equal(patch.statusCode, 200);
		assert.deepEqual(patch.json().state, state);

		const loaded = await app.inject({ method: "GET", url: "/v1/team/console-layout" });
		assert.equal(loaded.statusCode, 200);
		assert.deepEqual(loaded.json().state, state);
		assert.match(loaded.json().updatedAt, /^\d{4}-\d{2}-\d{2}T/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("PATCH /v1/team/console-layout rejects malformed canvas UI state", async () => {
	const { app, root } = await buildTestServer();
	try {
		const res = await app.inject({
			method: "PATCH",
			url: "/v1/team/console-layout",
			payload: { state: { schemaVersion: 2, states: {} } },
		});
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /invalid console layout state/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/console/root-summary returns root tasks with latest run summaries", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const createTask = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		assert.equal(createTask.statusCode, 201);
		const task = createTask.json().task;
		const taskRunWorkspace = new RunWorkspace(join(teamDir, "task-runs"));
		const run = await taskRunWorkspace.createRun(singleTaskPlan(task.taskId, "root summary"), `canvas_task_unit_${task.taskId}`);
		run.source = { type: "canvas-task", taskId: task.taskId };
		await taskRunWorkspace.saveState(run);
		await taskRunWorkspace.patchState(run.runId, (state) => {
			state.status = "running";
			state.updatedAt = new Date().toISOString();
		});

		const res = await app.inject({ method: "GET", url: "/v1/team/console/root-summary" });

		assert.equal(res.statusCode, 200);
		const body = res.json();
		assert.deepEqual(body.tasks.map((item: { taskId: string }) => item.taskId), [task.taskId]);
		assert.deepEqual(body.taskRunsByTaskId[task.taskId].map((item: TeamRunState) => item.runId), [run.runId]);
		assert.equal(body.taskRunsByTaskId[task.taskId][0].status, "running");
		assert.deepEqual(body.deletedTaskIds, []);
		assert.deepEqual(body.deletedRunIdsByTaskId[task.taskId], []);
		assert.equal(typeof body.serverVersion.taskCatalog, "string");
		assert.equal(typeof body.serverVersion.taskRunSummary, "string");
		assert.ok(Array.isArray(body.sourceNodes));
		assert.ok(Array.isArray(body.sourceConnections));
		assert.ok(Array.isArray(body.taskConnections));
		assert.ok(Array.isArray(body.taskDependencies));
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/console/root-summary supports independent task and run since cursors", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const createTask = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		assert.equal(createTask.statusCode, 201);
		const task = createTask.json().task;
		const taskRunWorkspace = new RunWorkspace(join(teamDir, "task-runs"));
		const run = await taskRunWorkspace.createRun(singleTaskPlan(task.taskId, "root summary since"), `canvas_task_unit_${task.taskId}`);
		run.source = { type: "canvas-task", taskId: task.taskId };
		await taskRunWorkspace.saveState(run);
		const initial = await app.inject({ method: "GET", url: "/v1/team/console/root-summary" });
		assert.equal(initial.statusCode, 200);
		const taskSince = initial.json().serverVersion.taskCatalog;
		const runSince = initial.json().serverVersion.taskRunSummary;

		const unchanged = await app.inject({
			method: "GET",
			url: `/v1/team/console/root-summary?taskSince=${encodeURIComponent(taskSince)}&runSince=${encodeURIComponent(runSince)}`,
		});

		assert.equal(unchanged.statusCode, 200);
		assert.deepEqual(unchanged.json().tasks, []);
		assert.deepEqual(unchanged.json().taskRunsByTaskId[task.taskId], []);
		assert.equal(unchanged.json().serverVersion.taskCatalog, taskSince);
		assert.equal(unchanged.json().serverVersion.taskRunSummary, runSince);

		await new Promise(resolve => setTimeout(resolve, 2));
		await taskRunWorkspace.patchState(run.runId, (state) => {
			state.status = "running";
			state.updatedAt = new Date().toISOString();
		});

		const changedRun = await app.inject({
			method: "GET",
			url: `/v1/team/console/root-summary?taskSince=${encodeURIComponent(taskSince)}&runSince=${encodeURIComponent(runSince)}`,
		});

		assert.equal(changedRun.statusCode, 200);
		assert.deepEqual(changedRun.json().tasks, []);
		assert.deepEqual(changedRun.json().taskRunsByTaskId[task.taskId].map((item: TeamRunState) => item.runId), [run.runId]);
		assert.equal(changedRun.json().taskRunsByTaskId[task.taskId][0].status, "running");
		assert.equal(changedRun.json().serverVersion.taskCatalog, taskSince);
		assert.notEqual(changedRun.json().serverVersion.taskRunSummary, runSince);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/tasks/:taskId/generated-tasks view=summary supports since cursor and deleted ids", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const createDiscovery = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: {
				...taskPayload,
				canvasKind: "discovery",
				title: "Discovery summary since root",
				workUnit: {
					...taskPayload.workUnit,
					outputCheck: { type: "json_items", outputKey: "items", requiredFields: ["id"] },
				},
				discoverySpec: {
					schemaVersion: "team/discovery-spec-1",
					discoveryGoal: "discover smoke items",
					outputKey: "items",
					itemIdField: "id",
					requiredItemFields: ["id"],
					dispatchGoal: "dispatch each item",
					dispatcherAgentId: "search",
					generatedWorkerAgentId: "search",
					generatedCheckerAgentId: "main",
					autoRun: { enabled: true, concurrency: 3 },
				},
			},
		});
		assert.equal(createDiscovery.statusCode, 201);
		const discoveryTask = createDiscovery.json().task;
		const taskStore = new TaskStore(teamDir);
		const first = await taskStore.create({
			title: "Generated first",
			leaderAgentId: "main",
			status: "ready",
			workUnit: taskPayload.workUnit,
			generatedSource: {
				schemaVersion: "team/generated-task-source-1",
				sourceDiscoveryTaskId: discoveryTask.taskId,
				sourceItemId: "first",
				itemStatus: "active",
				itemPayload: { id: "first" },
				latestDiscoveryRunId: "run_discovery_1",
				latestDiscoveryAttemptId: "attempt_discovery_1",
				latestDiscoveredAt: "2026-06-03T00:00:00.000Z",
				workUnitMode: "managed",
				latestManagedWorkUnit: taskPayload.workUnit,
			},
		});

		const initial = await app.inject({
			method: "GET",
			url: `/v1/team/tasks/${discoveryTask.taskId}/generated-tasks?view=summary`,
		});
		assert.equal(initial.statusCode, 200);
		assert.deepEqual(initial.json().tasks.map((task: { taskId: string }) => task.taskId), [first.taskId]);
		assert.deepEqual(initial.json().deletedTaskIds, []);
		const since = initial.json().serverVersion;

		const unchanged = await app.inject({
			method: "GET",
			url: `/v1/team/tasks/${discoveryTask.taskId}/generated-tasks?view=summary&since=${encodeURIComponent(since)}`,
		});
		assert.equal(unchanged.statusCode, 200);
		assert.deepEqual(unchanged.json().tasks, []);
		assert.deepEqual(unchanged.json().deletedTaskIds, []);
		assert.equal(unchanged.json().serverVersion, since);

		await new Promise(resolve => setTimeout(resolve, 2));
		const updated = await taskStore.update(first.taskId, { title: "Generated first updated" });
		const changed = await app.inject({
			method: "GET",
			url: `/v1/team/tasks/${discoveryTask.taskId}/generated-tasks?view=summary&since=${encodeURIComponent(since)}`,
		});
		assert.equal(changed.statusCode, 200);
		assert.deepEqual(changed.json().tasks.map((task: { taskId: string; title: string }) => [task.taskId, task.title]), [[first.taskId, updated.title]]);
		assert.deepEqual(changed.json().deletedTaskIds, []);
		assert.notEqual(changed.json().serverVersion, since);

		await new Promise(resolve => setTimeout(resolve, 2));
		await taskStore.archive(first.taskId);
		const deleted = await app.inject({
			method: "GET",
			url: `/v1/team/tasks/${discoveryTask.taskId}/generated-tasks?view=summary&since=${encodeURIComponent(changed.json().serverVersion)}`,
		});
		assert.equal(deleted.statusCode, 200);
		assert.deepEqual(deleted.json().tasks, []);
		assert.deepEqual(deleted.json().deletedTaskIds, [first.taskId]);
		assert.notEqual(deleted.json().serverVersion, changed.json().serverVersion);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/:runId/tasks/:taskId/attempts view=dispatch-diagnostics omits heavy process fields", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const taskId = "task_dispatch_diagnostics";
		const taskRunWorkspace = new RunWorkspace(join(teamDir, "task-runs"));
		const state = await taskRunWorkspace.createRun(singleTaskPlan(taskId, "dispatch diagnostics"), `canvas_task_unit_${taskId}`);
		state.source = { type: "canvas-task", taskId };
		await taskRunWorkspace.saveState(state);

		const { attemptId } = await taskRunWorkspace.createAttempt(state.runId, taskId);
		await taskRunWorkspace.recordAttemptRoleProcess(state.runId, taskId, attemptId, {
			role: "worker",
			profileId: "search",
			status: "succeeded",
			startedAt: "2026-06-02T00:00:01.000Z",
			updatedAt: "2026-06-02T00:00:02.000Z",
			finishedAt: "2026-06-02T00:00:02.000Z",
			assistantText: { content: "x".repeat(4096), updatedAt: "2026-06-02T00:00:02.000Z" },
			process: {
				title: "Worker process",
				narration: ["heavy"],
				isComplete: true,
				entries: [{
					id: "entry_heavy",
					kind: "tool",
					title: "heavy",
					detail: "y".repeat(4096),
					createdAt: "2026-06-02T00:00:02.000Z",
				}],
			},
		});
		await taskRunWorkspace.recordAttemptDiscoveryDispatchOutcomes(state.runId, taskId, attemptId, [{
			itemId: "item_blocked",
			status: "blocked",
			error: "missing id",
			createdAt: "2026-06-02T00:00:03.000Z",
		}]);

		const summaryRes = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/${state.runId}/tasks/${taskId}/attempts?view=dispatch-diagnostics`,
		});
		assert.equal(summaryRes.statusCode, 200);
		const summaryAttempt = summaryRes.json().attempts[0];
		assert.equal(summaryAttempt.attemptId, attemptId);
		assert.equal(summaryAttempt.roleProcesses, undefined, "dispatch diagnostics view must omit roleProcesses");
		assert.deepEqual(summaryAttempt.worker, []);
		assert.deepEqual(summaryAttempt.checker, []);
		assert.equal(summaryAttempt.discoveryDispatch[0].status, "blocked");

		const fullRes = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/${state.runId}/tasks/${taskId}/attempts`,
		});
		assert.equal(fullRes.statusCode, 200);
		const fullAttempt = fullRes.json().attempts[0];
		assert.equal(fullAttempt.roleProcesses.worker.assistantText.content, "x".repeat(4096));
		assert.equal(fullAttempt.roleProcesses.worker.process.entries[0].detail, "y".repeat(4096));
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/:runId/tasks/:taskId/attempts rejects unknown view parameter", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const taskId = "task_attempt_bad_view";
		const taskRunWorkspace = new RunWorkspace(join(teamDir, "task-runs"));
		const state = await taskRunWorkspace.createRun(singleTaskPlan(taskId, "bad view"), `canvas_task_unit_${taskId}`);
		state.source = { type: "canvas-task", taskId };
		await taskRunWorkspace.saveState(state);

		const res = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/${state.runId}/tasks/${taskId}/attempts?view=compact`,
		});
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /unknown view parameter/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/tasks/:taskId/runs stores request-derived public base URL for Task artifacts", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createTask = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		assert.equal(createTask.statusCode, 201);
		const task = createTask.json().task;

		const runRes = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${task.taskId}/runs`,
			headers: {
				host: "team.example.test:8443",
				"x-forwarded-proto": "https",
			},
		});
		assert.equal(runRes.statusCode, 201);
		const created = runRes.json() as TeamRunState;
		assert.equal(created.source?.publicBaseUrl, "https://team.example.test:8443");
		await waitForTerminalRun(app, created.runId);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/:runId/artifacts serves files from role output directories", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createTask = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		assert.equal(createTask.statusCode, 201);
		const task = createTask.json().task;

		const runRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${task.taskId}/runs` });
		assert.equal(runRes.statusCode, 201);
		const created = runRes.json() as TeamRunState;
		const finished = await waitForTerminalRun(app, created.runId);
		assert.equal(finished.status, "completed");

		const attemptsRes = await app.inject({ method: "GET", url: `/v1/team/task-runs/${created.runId}/tasks/${task.taskId}/attempts` });
		assert.equal(attemptsRes.statusCode, 200);
		const attemptId = attemptsRes.json().attempts[0].attemptId as string;
		const outputDir = join(root, "team", "task-runs", "runs", created.runId, "agent-workspaces", attemptId, "worker", "output");
		await mkdir(outputDir, { recursive: true });
		await writeFile(join(outputDir, "report.html"), "<h1>Team report</h1>", "utf8");

		const response = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/${created.runId}/artifacts/${attemptId}/worker/report.html`,
		});
		assert.equal(response.statusCode, 200);
		assert.match(response.headers["content-type"] as string, /text\/html/);
		assert.equal(response.body, "<h1>Team report</h1>");

		const traversal = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/${created.runId}/artifacts/${attemptId}/worker/..%2Fattempt.json`,
		});
		assert.equal(traversal.statusCode, 400);
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
		assert.ok(upstreamFinished.startedAt, "upstream run must have startedAt");
		assert.ok(upstreamFinished.finishedAt, "upstream run must have finishedAt");
		assert.ok(upstreamFinished.activeElapsedMs >= 0, "upstream run must have activeElapsedMs >= 0");

		const downstreamRuns = await waitForTaskRunCount(app, html.taskId, 1);
		const downstream = await waitForTerminalRun(app, downstreamRuns[0]!.runId);
		assert.equal(downstream.status, "completed");
		assert.ok(downstream.startedAt, "downstream run must have startedAt");
		assert.ok(downstream.finishedAt, "downstream run must have finishedAt");
		assert.ok(downstream.activeElapsedMs >= 0, "downstream run must have activeElapsedMs >= 0");
		assert.equal(downstream.source?.taskId, html.taskId);
		assert.equal((downstream.source?.triggeredBy as { type: string; connectionId: string })?.connectionId, connection.connectionId);
		assert.equal(downstream.source?.triggeredBy?.fromTaskId, collect.taskId);
		assert.equal(downstream.source?.triggeredBy?.fromRunId, upstreamRun.runId);
		const boundInput = downstream.source?.boundInputs?.[0];
		assert.ok(boundInput, "downstream run must have one bound input");
		if (boundInput.source === "canvas-source") {
			assert.fail("downstream task connection must bind a task artifact, not a canvas source");
		}
		assert.equal(boundInput.connectionId, connection.connectionId);
		assert.equal(boundInput.inputPortId, "source_md");
		assert.equal(boundInput.artifact.type, "md");
		assert.equal(boundInput.artifact.sourceTaskId, collect.taskId);
		assert.equal(boundInput.artifact.sourceRunId, upstreamRun.runId);
		assert.ok(boundInput.artifact.sourceAttemptId, "bound artifact must have sourceAttemptId");
		assert.equal(boundInput.artifact.sourceOutputPortId, "draft_md");
		assert.equal(boundInput.artifact.fileRef, upstreamTaskState.resultRef);
		assert.match(boundInput.artifact.preview ?? "", /accepted result/);
		assert.match(boundInput.artifact.content ?? "", /accepted result/);

		const chainedPlanRunsRes = await app.inject({ method: "GET", url: "/v1/team/runs" });
		assert.equal(chainedPlanRunsRes.statusCode, 200);
		assert.deepEqual(chainedPlanRunsRes.json(), []);
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

		// Wait until delivery loop completes (records skipped outcome for stale connection)
		await waitForAttemptDelivery(app, upstreamRun.runId, collect.taskId);
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
		assert.deepEqual(missingRun.json(), { error: "task not found" });
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("archived task rejects new run creation and does not trigger downstream", async () => {
	const { app, root } = await buildTestServer();
	try {
		const collectRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			}),
		});
		const htmlRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "HTML Task" }, {
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputPorts: [{ id: "page_html", label: "HTML", type: "html" }],
			}),
		});
		assert.equal(collectRes.statusCode, 201);
		assert.equal(htmlRes.statusCode, 201);
		const collect = collectRes.json().task;
		const html = htmlRes.json().task;

		await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: collect.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: html.taskId,
				toInputPortId: "source_md",
			},
		});

		await app.inject({ method: "POST", url: `/v1/team/tasks/${collect.taskId}/archive` });

		const runRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${collect.taskId}/runs` });
		assert.equal(runRes.statusCode, 409);

		const downstreamRunsRes = await app.inject({ method: "GET", url: `/v1/team/tasks/${html.taskId}/runs` });
		assert.equal(downstreamRunsRes.statusCode, 200);
		assert.deepEqual(downstreamRunsRes.json().runs, []);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("stale downstream connection does not make upstream accepted run fail", async () => {
	const { app, root } = await buildTestServer();
	try {
		const collectRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			}),
		});
		const htmlRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "HTML Task" }, {
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			}),
		});
		assert.equal(collectRes.statusCode, 201);
		assert.equal(htmlRes.statusCode, 201);
		const collect = collectRes.json().task;
		const html = htmlRes.json().task;

		await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: collect.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: html.taskId,
				toInputPortId: "source_md",
			},
		});

		await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${html.taskId}`,
			payload: {
				workUnit: {
					...html.workUnit,
					inputPorts: [{ id: "source_md", label: "Changed", type: "html" }],
				},
			},
		});

		const runRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${collect.taskId}/runs` });
		assert.equal(runRes.statusCode, 201);
		const upstreamRun = runRes.json() as TeamRunState;
		const upstreamFinished = await waitForTerminalRun(app, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");
		assert.equal(upstreamFinished.taskStates[collect.taskId]?.status, "succeeded");

		await waitForAttemptDelivery(app, upstreamRun.runId, collect.taskId);
		const downstreamRunsRes = await app.inject({ method: "GET", url: `/v1/team/tasks/${html.taskId}/runs` });
		assert.equal(downstreamRunsRes.statusCode, 200);
		assert.deepEqual(downstreamRunsRes.json().runs, []);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("typed Task chain records delivered downstream outcome in upstream attempt metadata", async () => {
	const { app, root } = await buildTestServer();
	try {
		const collectRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			}),
		});
		const htmlRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "HTML Task" }, {
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
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

		const downstreamRuns = await waitForTaskRunCount(app, html.taskId, 1);
		await waitForTerminalRun(app, downstreamRuns[0]!.runId);

		const delivery = await waitForAttemptDelivery(app, upstreamRun.runId, collect.taskId);
		assert.equal(delivery.length, 1);
		const outcome = delivery[0]!;
		assert.equal(outcome.status, "delivered");
		assert.equal((outcome as import("../src/team/types.js").TeamTaskTypedConnectionDeliveryOutcome).connectionId, connection.connectionId);
		assert.equal(outcome.toTaskId, html.taskId);
		assert.equal((outcome as import("../src/team/types.js").TeamTaskTypedConnectionDeliveryOutcome).toInputPortId, "source_md");
		assert.equal(outcome.downstreamRunId, downstreamRuns[0]!.runId);
		assert.equal(outcome.staleReason, undefined);
		assert.equal(outcome.error, undefined);
		assert.ok(outcome.createdAt);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("stale downstream connection records skipped outcome with staleReason", async () => {
	const { app, root } = await buildTestServer();
	try {
		const collectRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			}),
		});
		const htmlRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "HTML Task" }, {
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			}),
		});
		assert.equal(collectRes.statusCode, 201);
		assert.equal(htmlRes.statusCode, 201);
		const collect = collectRes.json().task;
		const html = htmlRes.json().task;

		await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: collect.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: html.taskId,
				toInputPortId: "source_md",
			},
		});

		// Change target port type to make connection stale
		await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${html.taskId}`,
			payload: {
				workUnit: {
					...html.workUnit,
					inputPorts: [{ id: "source_md", label: "HTML input", type: "html" }],
				},
			},
		});

		const runRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${collect.taskId}/runs` });
		assert.equal(runRes.statusCode, 201);
		const upstreamRun = runRes.json() as TeamRunState;
		const upstreamFinished = await waitForTerminalRun(app, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");

		const delivery = await waitForAttemptDelivery(app, upstreamRun.runId, collect.taskId);
		assert.equal(delivery.length, 1);
		const outcome = delivery[0]!;
		assert.equal(outcome.status, "skipped");
		assert.equal(outcome.staleReason, "target_input_port_type_mismatch");
		assert.equal(outcome.downstreamRunId, undefined);
		assert.equal(outcome.error, undefined);

		// No downstream run was created
		const downstreamRunsRes = await app.inject({ method: "GET", url: `/v1/team/tasks/${html.taskId}/runs` });
		assert.deepEqual(downstreamRunsRes.json().runs, []);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("source node and source connection APIs inject bound inputs into direct Task run", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				inputPorts: [{ id: "source_text", label: "Source text", type: "string" }],
			}),
		});
		assert.equal(taskRes.statusCode, 201);
		const task = taskRes.json().task;

		const sourceRes = await app.inject({
			method: "POST",
			url: "/v1/team/source-nodes",
			payload: {
				title: "需求说明",
				nodeType: "text",
				content: { text: "API 注入的 source 文本。" },
			},
		});
		assert.equal(sourceRes.statusCode, 201);
		const sourceNode = sourceRes.json().sourceNode;
		assert.equal(sourceNode.outputPort.type, "string");

		const patchRes = await app.inject({
			method: "PATCH",
			url: `/v1/team/source-nodes/${sourceNode.sourceNodeId}`,
			payload: {
				content: { text: "PATCH 后的 source 文本。" },
			},
		});
		assert.equal(patchRes.statusCode, 200);

		const connectionRes = await app.inject({
			method: "POST",
			url: "/v1/team/source-connections",
			payload: {
				fromSourceNodeId: sourceNode.sourceNodeId,
				fromOutputPortId: "value",
				toTaskId: task.taskId,
				toInputPortId: "source_text",
			},
		});
		assert.equal(connectionRes.statusCode, 201);
		const sourceConnection = connectionRes.json().connection;

		const listNodesRes = await app.inject({ method: "GET", url: "/v1/team/source-nodes" });
		assert.equal(listNodesRes.statusCode, 200);
		assert.equal(listNodesRes.json().sourceNodes.length, 1);

		const listConnectionsRes = await app.inject({ method: "GET", url: "/v1/team/source-connections" });
		assert.equal(listConnectionsRes.statusCode, 200);
		assert.equal(listConnectionsRes.json().connections[0].status, "active");

		const runRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${task.taskId}/runs` });
		assert.equal(runRes.statusCode, 201);
		const created = runRes.json() as TeamRunState;
		assert.equal(created.source?.boundInputs?.[0]?.source, "canvas-source");
		assert.equal(created.source?.boundInputs?.[0]?.connectionId, sourceConnection.connectionId);
		assert.equal(created.source?.boundInputs?.[0]?.inputPortId, "source_text");
		assert.equal(created.source?.boundInputs?.[0]?.artifact.sourceNodeId, sourceNode.sourceNodeId);
		assert.equal(created.source?.boundInputs?.[0]?.artifact.content, "PATCH 后的 source 文本。");

		const finished = await waitForTerminalRun(app, created.runId);
		assert.equal(finished.status, "completed");
		assert.equal(finished.source?.boundInputs?.[0]?.artifact.content, "PATCH 后的 source 文本。");

		const archiveRes = await app.inject({ method: "POST", url: `/v1/team/source-nodes/${sourceNode.sourceNodeId}/archive` });
		assert.equal(archiveRes.statusCode, 200);
		const activeNodesAfterArchive = await app.inject({ method: "GET", url: "/v1/team/source-nodes" });
		assert.equal(activeNodesAfterArchive.statusCode, 200);
		assert.equal(activeNodesAfterArchive.json().sourceNodes.length, 0);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("source connection API rejects source-to-task type mismatch", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				inputPorts: [{ id: "source_html", label: "HTML source", type: "html" }],
			}),
		});
		assert.equal(taskRes.statusCode, 201);
		const task = taskRes.json().task;
		const sourceRes = await app.inject({
			method: "POST",
			url: "/v1/team/source-nodes",
			payload: {
				title: "Markdown 文件",
				nodeType: "file",
				content: { fileName: "brief.md", text: "# Brief" },
			},
		});
		assert.equal(sourceRes.statusCode, 201);
		const sourceNode = sourceRes.json().sourceNode;

		const connectionRes = await app.inject({
			method: "POST",
			url: "/v1/team/source-connections",
			payload: {
				fromSourceNodeId: sourceNode.sourceNodeId,
				fromOutputPortId: "value",
				toTaskId: task.taskId,
				toInputPortId: "source_html",
			},
		});

		assert.equal(connectionRes.statusCode, 400);
		assert.match(connectionRes.json().error, /port type mismatch: md -> html/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/by-task returns runs grouped by taskId", async () => {
	const { app, root } = await buildTestServer();
	try {
		const task1Res = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		const task2Res = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: { ...taskPayload, title: "第二个任务" } });
		assert.equal(task1Res.statusCode, 201);
		assert.equal(task2Res.statusCode, 201);
		const task1 = task1Res.json().task;
		const task2 = task2Res.json().task;

		const run1Res = await app.inject({ method: "POST", url: `/v1/team/tasks/${task1.taskId}/runs` });
		assert.equal(run1Res.statusCode, 201);
		const run1 = run1Res.json() as TeamRunState;
		await waitForTerminalRun(app, run1.runId);

		const run2Res = await app.inject({ method: "POST", url: `/v1/team/tasks/${task2.taskId}/runs` });
		assert.equal(run2Res.statusCode, 201);
		const run2 = run2Res.json() as TeamRunState;
		await waitForTerminalRun(app, run2.runId);

		const res = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/by-task?taskIds=${task1.taskId},${task2.taskId}`,
		});
		assert.equal(res.statusCode, 200);
		const body = res.json() as { runsByTaskId: Record<string, TeamRunState[]> };
		assert.ok(body.runsByTaskId[task1.taskId], "should contain task1 key");
		assert.ok(body.runsByTaskId[task2.taskId], "should contain task2 key");
		assert.equal(body.runsByTaskId[task1.taskId].length, 1);
		assert.equal(body.runsByTaskId[task2.taskId].length, 1);
		assert.equal(body.runsByTaskId[task1.taskId][0].runId, run1.runId);
		assert.equal(body.runsByTaskId[task2.taskId][0].runId, run2.runId);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/by-task applies limit per task", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		assert.equal(taskRes.statusCode, 201);
		const task = taskRes.json().task;

		const runIds: string[] = [];
		for (let i = 0; i < 3; i++) {
			const runRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${task.taskId}/runs` });
			assert.equal(runRes.statusCode, 201);
			const run = runRes.json() as TeamRunState;
			runIds.push(run.runId);
			await waitForTerminalRun(app, run.runId);
		}

		const res = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/by-task?taskIds=${task.taskId}&limit=2`,
		});
		assert.equal(res.statusCode, 200);
		const body = res.json() as { runsByTaskId: Record<string, TeamRunState[]> };
		assert.equal(body.runsByTaskId[task.taskId].length, 2);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/by-task view=summary omits heavy bound input content", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const taskId = "task_summary_heavy";
		const taskRunWorkspace = new RunWorkspace(join(teamDir, "task-runs"));
		const plan = singleTaskPlan(taskId);
		const fullState = await taskRunWorkspace.createRun(plan, plan.defaultTeamUnitId);
		fullState.source = {
			type: "canvas-task",
			taskId,
			boundInputs: [{
				connectionId: "conn_heavy",
				inputPortId: "raw_json",
				artifact: {
					schemaVersion: "team/task-artifact-1",
					artifactId: "artifact_heavy",
					type: "json",
					sourceTaskId: "task_source",
					sourceRunId: "run_source",
					sourceAttemptId: "attempt_source",
					sourceOutputPortId: "json",
					fileRef: "tasks/task_source/attempts/attempt_source/result.json",
					preview: "x".repeat(2048),
					content: "y".repeat(4096),
					createdAt: "2026-06-02T00:00:04.000Z",
				},
			}],
		};
		await taskRunWorkspace.saveState(fullState);

		const summaryRes = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/by-task?taskIds=${taskId}&limit=1&view=summary`,
		});
		assert.equal(summaryRes.statusCode, 200);
		const summaryRun = summaryRes.json().runsByTaskId[taskId][0] as TeamRunState;
		assert.equal(summaryRun.runId, fullState.runId);
		assert.equal(summaryRun.source?.taskId, taskId);
		assert.equal(summaryRun.source?.boundInputs, undefined, "summary view must not include boundInputs");

		const fullRes = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/by-task?taskIds=${taskId}&limit=1`,
		});
		assert.equal(fullRes.statusCode, 200);
		const fullRun = fullRes.json().runsByTaskId[taskId][0] as TeamRunState;
		assert.equal(fullRun.source?.boundInputs?.[0]?.artifact.preview, "x".repeat(2048));
		assert.equal(fullRun.source?.boundInputs?.[0]?.artifact.content, "y".repeat(4096));
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/by-task supports since cursor for changed run summaries", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const taskId = "task_run_summary_since";
		const taskRunWorkspace = new RunWorkspace(join(teamDir, "task-runs"));
		const plan = singleTaskPlan(taskId, "run summary since");
		const first = await taskRunWorkspace.createRun(plan, plan.defaultTeamUnitId);
		first.source = { type: "canvas-task", taskId };
		await taskRunWorkspace.saveState(first);

		const initial = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/by-task?taskIds=${taskId}&limit=1&view=summary`,
		});
		assert.equal(initial.statusCode, 200);
		assert.equal(initial.json().serverVersion, first.updatedAt);
		assert.deepEqual(initial.json().runsByTaskId[taskId].map((run: TeamRunState) => run.runId), [first.runId]);

		const unchanged = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/by-task?taskIds=${taskId}&limit=1&view=summary&since=${encodeURIComponent(initial.json().serverVersion)}`,
		});
		assert.equal(unchanged.statusCode, 200);
		assert.deepEqual(unchanged.json().runsByTaskId[taskId], []);
		assert.deepEqual(unchanged.json().deletedRunIdsByTaskId[taskId], []);
		assert.equal(unchanged.json().serverVersion, initial.json().serverVersion);

		await new Promise(resolve => setTimeout(resolve, 2));
		await taskRunWorkspace.patchState(first.runId, (state) => {
			state.status = "running";
			state.currentTaskId = taskId;
			state.taskStates[taskId]!.status = "running";
			state.taskStates[taskId]!.progress = {
				phase: "worker_running",
				message: "working",
				updatedAt: new Date().toISOString(),
			};
		});
		const changed = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/by-task?taskIds=${taskId}&limit=1&view=summary&since=${encodeURIComponent(initial.json().serverVersion)}`,
		});
		assert.equal(changed.statusCode, 200);
		assert.deepEqual(changed.json().runsByTaskId[taskId].map((run: TeamRunState) => run.runId), [first.runId]);
		assert.equal(changed.json().runsByTaskId[taskId][0].status, "running");
		assert.notEqual(changed.json().serverVersion, initial.json().serverVersion);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/:runId view=summary returns lightweight run state", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const taskId = "task_run_summary_view";
		const taskRunWorkspace = new RunWorkspace(join(teamDir, "task-runs"));
		const plan = singleTaskPlan(taskId, "run summary view");
		const fullState = await taskRunWorkspace.createRun(plan, plan.defaultTeamUnitId);
		fullState.source = {
			type: "canvas-task",
			taskId,
			boundInputs: [{
				connectionId: "conn_heavy",
				inputPortId: "raw_json",
				artifact: {
					schemaVersion: "team/task-artifact-1",
					artifactId: "artifact_heavy",
					type: "json",
					sourceTaskId: "task_source",
					sourceRunId: "run_source",
					sourceAttemptId: "attempt_source",
					sourceOutputPortId: "json",
					fileRef: "tasks/task_source/attempts/attempt_source/result.json",
					preview: "x".repeat(2048),
					content: "y".repeat(4096),
					createdAt: "2026-06-02T00:00:04.000Z",
				},
			}],
		};
		await taskRunWorkspace.saveState(fullState);

		const summaryRes = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/${fullState.runId}?view=summary&taskId=${taskId}`,
		});
		assert.equal(summaryRes.statusCode, 200);
		const summary = summaryRes.json() as TeamRunState;
		assert.equal(summary.runId, fullState.runId);
		assert.equal(summary.source?.taskId, taskId);
		assert.equal(summary.source?.boundInputs, undefined, "summary view must not include boundInputs");
		assert.deepEqual(Object.keys(summary.taskStates), [taskId], "summary view should keep only the requested task state");

		const fullRes = await app.inject({ method: "GET", url: `/v1/team/task-runs/${fullState.runId}` });
		assert.equal(fullRes.statusCode, 200);
		const full = fullRes.json() as TeamRunState;
		assert.equal(full.source?.boundInputs?.[0]?.artifact.content, "y".repeat(4096));
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/:runId view=process-summary returns run and latest process attempts without heavy inputs", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const taskId = "task_process_summary_view";
		const taskRunWorkspace = new RunWorkspace(join(teamDir, "task-runs"));
		const plan = singleTaskPlan(taskId, "process summary view");
		const state = await taskRunWorkspace.createRun(plan, plan.defaultTeamUnitId);
		state.source = {
			type: "canvas-task",
			taskId,
			boundInputs: [{
				connectionId: "conn_heavy",
				inputPortId: "raw_json",
				artifact: {
					schemaVersion: "team/task-artifact-1",
					artifactId: "artifact_heavy",
					type: "json",
					sourceTaskId: "task_source",
					sourceRunId: "run_source",
					sourceAttemptId: "attempt_source",
					sourceOutputPortId: "json",
					fileRef: "tasks/task_source/attempts/attempt_source/result.json",
					preview: "x".repeat(2048),
					content: "y".repeat(4096),
					createdAt: "2026-06-02T00:00:04.000Z",
				},
			}],
		};
		await taskRunWorkspace.saveState(state);

		const { attemptId } = await taskRunWorkspace.createAttempt(state.runId, taskId);
		await taskRunWorkspace.recordAttemptRoleProcess(state.runId, taskId, attemptId, {
			role: "worker",
			profileId: "search",
			status: "running",
			startedAt: "2026-06-02T00:00:01.000Z",
			updatedAt: "2026-06-02T00:00:02.000Z",
			finishedAt: null,
			assistantText: { content: "worker visible process", updatedAt: "2026-06-02T00:00:02.000Z" },
			process: {
				title: "Worker process",
				narration: ["visible narration"],
				currentAction: "visible action",
				isComplete: false,
				entries: [{
					id: "entry_heavy",
					kind: "tool",
					title: "heavy",
					detail: "z".repeat(4096),
					createdAt: "2026-06-02T00:00:02.000Z",
				}],
			},
		});

		const summaryRes = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/${state.runId}?view=process-summary&taskId=${taskId}`,
		});
		assert.equal(summaryRes.statusCode, 200);
		const body = summaryRes.json();
		assert.equal(body.run.runId, state.runId);
		assert.equal(body.run.source.boundInputs, undefined, "process summary run must not include boundInputs");
		assert.equal(body.attempts.length, 1);
		assert.equal(body.attempts[0].attemptId, attemptId);
		assert.equal(body.attempts[0].roleProcesses.worker.assistantText.content, "worker visible process");
		assert.deepEqual(body.attempts[0].roleProcesses.worker.process.entries, [], "process summary must omit heavy tool entries");
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/by-task rejects unknown view parameter", async () => {
	const { app, root } = await buildTestServer();
	try {
		const res = await app.inject({
			method: "GET",
			url: "/v1/team/task-runs/by-task?taskIds=t1&view=compact",
		});
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /unknown view parameter/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/by-task returns empty arrays for taskIds with no runs", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		assert.equal(taskRes.statusCode, 201);
		const task = taskRes.json().task;

		const res = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/by-task?taskIds=${task.taskId}`,
		});
		assert.equal(res.statusCode, 200);
		const body = res.json() as { runsByTaskId: Record<string, TeamRunState[]> };
		assert.ok(Array.isArray(body.runsByTaskId[task.taskId]));
		assert.equal(body.runsByTaskId[task.taskId].length, 0);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/by-task validates taskIds is required", async () => {
	const { app, root } = await buildTestServer();
	try {
		const res = await app.inject({
			method: "GET",
			url: "/v1/team/task-runs/by-task",
		});
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /taskIds.*required/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/by-task validates max 100 taskIds", async () => {
	const { app, root } = await buildTestServer();
	try {
		const ids = Array.from({ length: 101 }, (_, i) => `id_${i}`).join(",");
		const res = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/by-task?taskIds=${ids}`,
		});
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /maximum 100/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/by-task validates limit is positive", async () => {
	const { app, root } = await buildTestServer();
	try {
		const res = await app.inject({
			method: "GET",
			url: "/v1/team/task-runs/by-task?taskIds=t1&limit=-1",
		});
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /positive/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/by-task with single taskId", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		assert.equal(taskRes.statusCode, 201);
		const task = taskRes.json().task;

		const runRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${task.taskId}/runs` });
		assert.equal(runRes.statusCode, 201);
		const run = runRes.json() as TeamRunState;
		await waitForTerminalRun(app, run.runId);

		const res = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/by-task?taskIds=${task.taskId}`,
		});
		assert.equal(res.statusCode, 200);
		const body = res.json() as { runsByTaskId: Record<string, TeamRunState[]> };
		const keys = Object.keys(body.runsByTaskId);
		assert.equal(keys.length, 1);
		assert.equal(keys[0], task.taskId);
		assert.equal(body.runsByTaskId[task.taskId].length, 1);
		assert.equal(body.runsByTaskId[task.taskId][0].runId, run.runId);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});


test("GET /v1/team/task-runs/by-task deduplicates taskIds before checking limit", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		assert.equal(taskRes.statusCode, 201);
		const task = taskRes.json().task;

		const runRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${task.taskId}/runs` });
		assert.equal(runRes.statusCode, 201);
		await waitForTerminalRun(app, runRes.json().runId);

		const ids = Array.from({ length: 102 }, () => task.taskId).join(",");
		const res = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/by-task?taskIds=${ids}`,
		});
		assert.equal(res.statusCode, 200);
		const body = res.json() as { runsByTaskId: Record<string, TeamRunState[]> };
		const keys = Object.keys(body.runsByTaskId);
		assert.equal(keys.length, 1);
		assert.equal(keys[0], task.taskId);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/by-task with limit=1 returns the latest run by createdAt", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		assert.equal(taskRes.statusCode, 201);
		const task = taskRes.json().task;

		const runIds: string[] = [];
		for (let i = 0; i < 3; i++) {
			const runRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${task.taskId}/runs` });
			assert.equal(runRes.statusCode, 201);
			runIds.push(runRes.json().runId);
			await waitForTerminalRun(app, runRes.json().runId);
		}

		const res = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/by-task?taskIds=${task.taskId}&limit=1`,
		});
		assert.equal(res.statusCode, 200);
		const body = res.json() as { runsByTaskId: Record<string, TeamRunState[]> };
		assert.equal(body.runsByTaskId[task.taskId].length, 1);
		assert.equal(body.runsByTaskId[task.taskId][0].runId, runIds[runIds.length - 1],
			"limit=1 should return the latest run by createdAt");
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-runs/by-task returns 400 for more than 100 unique taskIds", async () => {
	const { app, root } = await buildTestServer();
	try {
		const ids = Array.from({ length: 101 }, (_, i) => `unique_id_${i}`).join(",");
		const res = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/by-task?taskIds=${ids}`,
		});
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /maximum 100/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/tasks/:taskId/run-history returns paged task run summaries with annotations", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		assert.equal(taskRes.statusCode, 201);
		const task = taskRes.json().task;

		const runIds: string[] = [];
		for (let i = 0; i < 3; i++) {
			const runRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${task.taskId}/runs` });
			assert.equal(runRes.statusCode, 201);
			const run = runRes.json() as TeamRunState;
			runIds.push(run.runId);
			await waitForTerminalRun(app, run.runId);
		}

		const bestRes = await app.inject({
			method: "PATCH",
			url: `/v1/team/task-runs/${runIds[1]}/annotation`,
			payload: { best: true, note: "质量最好" },
		});
		assert.equal(bestRes.statusCode, 200);

		const historyRes = await app.inject({
			method: "GET",
			url: `/v1/team/tasks/${task.taskId}/run-history?limit=2&offset=0`,
		});
		assert.equal(historyRes.statusCode, 200);
		const body = historyRes.json() as {
			total: number;
			limit: number;
			offset: number;
			runs: Array<{ run: TeamRunState; annotation: { best: boolean; archived: boolean; note?: string } }>;
		};
		assert.equal(body.total, 3);
		assert.equal(body.limit, 2);
		assert.equal(body.offset, 0);
		assert.equal(body.runs.length, 2);
		assert.deepEqual(body.runs.map(item => item.run.runId), [runIds[2], runIds[1]]);
		assert.equal(body.runs[1]!.annotation.best, true);
		assert.equal(body.runs[1]!.annotation.note, "质量最好");
		assert.equal(body.runs[0]!.run.source?.boundInputs, undefined, "history summaries must omit heavy boundInputs");
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("PATCH /v1/team/task-runs/:runId/annotation keeps one best run per task", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		assert.equal(taskRes.statusCode, 201);
		const task = taskRes.json().task;

		const firstRunRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${task.taskId}/runs` });
		assert.equal(firstRunRes.statusCode, 201);
		const firstRun = firstRunRes.json() as TeamRunState;
		await waitForTerminalRun(app, firstRun.runId);

		const secondRunRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${task.taskId}/runs` });
		assert.equal(secondRunRes.statusCode, 201);
		const secondRun = secondRunRes.json() as TeamRunState;
		await waitForTerminalRun(app, secondRun.runId);

		assert.equal((await app.inject({
			method: "PATCH",
			url: `/v1/team/task-runs/${firstRun.runId}/annotation`,
			payload: { best: true },
		})).statusCode, 200);
		assert.equal((await app.inject({
			method: "PATCH",
			url: `/v1/team/task-runs/${secondRun.runId}/annotation`,
			payload: { best: true },
		})).statusCode, 200);

		const historyRes = await app.inject({ method: "GET", url: `/v1/team/tasks/${task.taskId}/run-history` });
		assert.equal(historyRes.statusCode, 200);
		const bestRuns = historyRes.json().runs.filter((item: { annotation: { best: boolean } }) => item.annotation.best);
		assert.equal(bestRuns.length, 1);
		assert.equal(bestRuns[0].run.runId, secondRun.runId);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("run annotation soft archive hides history rows without deleting attempts", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		assert.equal(taskRes.statusCode, 201);
		const task = taskRes.json().task;

		const runRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${task.taskId}/runs` });
		assert.equal(runRes.statusCode, 201);
		const run = runRes.json() as TeamRunState;
		await waitForTerminalRun(app, run.runId);

		const archiveRes = await app.inject({
			method: "PATCH",
			url: `/v1/team/task-runs/${run.runId}/annotation`,
			payload: { archived: true },
		});
		assert.equal(archiveRes.statusCode, 200);

		const hiddenRes = await app.inject({ method: "GET", url: `/v1/team/tasks/${task.taskId}/run-history` });
		assert.equal(hiddenRes.statusCode, 200);
		assert.equal(hiddenRes.json().total, 0);
		assert.equal(hiddenRes.json().runs.length, 0);

		const visibleRes = await app.inject({
			method: "GET",
			url: `/v1/team/tasks/${task.taskId}/run-history?includeArchived=1`,
		});
		assert.equal(visibleRes.statusCode, 200);
		assert.equal(visibleRes.json().total, 1);
		assert.equal(visibleRes.json().runs[0].annotation.archived, true);

		const attemptsRes = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/${run.runId}/tasks/${task.taskId}/attempts`,
		});
		assert.equal(attemptsRes.statusCode, 200);
		assert.equal(attemptsRes.json().attempts.length, 1, "soft archive must not delete attempt records");
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("task run annotation rejects missing and non Canvas Task runs", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const missingRes = await app.inject({
			method: "PATCH",
			url: "/v1/team/task-runs/run_missing/annotation",
			payload: { best: true },
		});
		assert.equal(missingRes.statusCode, 404);

		const workspace = new RunWorkspace(teamDir);
		const plan = singleTaskPlan("plan_task");
		const planRun = await workspace.createRun(plan, plan.defaultTeamUnitId);
		const res = await app.inject({
			method: "PATCH",
			url: `/v1/team/task-runs/${planRun.runId}/annotation`,
			payload: { best: true },
		});
		assert.equal(res.statusCode, 404);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});
