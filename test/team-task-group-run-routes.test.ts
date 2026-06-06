import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildServer } from "../src/server.js";
import type { AgentService } from "../src/agent/agent-service.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { TaskGroupRunStore } from "../src/team/task-group-run-store.js";
import { TaskStore } from "../src/team/task-store.js";
import type { TeamPlan, TeamRunState, TeamTaskGroupRun } from "../src/team/types.js";

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
	const root = await mkdtemp(join(tmpdir(), "team-task-group-run-api-"));
	const teamDir = join(root, "team");
	process.env.TEAM_RUNTIME_ENABLED = "true";
	process.env.TEAM_DATA_DIR = teamDir;
	process.env.UGK_AGENT_DATA_DIR = join(root, "agent");
	process.env.CONN_DATABASE_PATH = join(root, "conn", "conn.sqlite");
	const app = await buildServer({ agentService: createAgentServiceStub() });
	return { app, root, teamDir };
}

async function removeTempRoot(root: string): Promise<void> {
	await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

const taskPayload = {
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

function singleTaskPlan(taskId: string, title = "task run fixture"): TeamPlan {
	return {
		schemaVersion: "team/plan-1",
		planId: `canvas_task_${taskId}`,
		title,
		defaultTeamUnitId: `canvas_task_unit_${taskId}`,
		goal: { text: title },
		tasks: [{ id: taskId, title, input: { text: title }, acceptance: { rules: ["ok"] } }],
		outputContract: { text: "output" },
		archived: false,
		createdAt: "2026-06-05T00:00:00.000Z",
		updatedAt: "2026-06-05T00:00:00.000Z",
		runCount: 0,
	};
}

async function createTask(app: Awaited<ReturnType<typeof buildTestServer>>["app"], title: string, options: {
	status?: string;
	inputPorts?: Array<{ id: string; label: string; type: string }>;
	outputPorts?: Array<{ id: string; label: string; type: string }>;
} = {}) {
	const res = await app.inject({
		method: "POST",
		url: "/v1/team/tasks",
		payload: withPorts({ ...taskPayload, title, status: (options.status ?? "ready") as "ready" }, {
			inputPorts: options.inputPorts,
			outputPorts: options.outputPorts,
		}),
	});
	assert.equal(res.statusCode, 201);
	return res.json().task;
}

async function connectTasks(app: Awaited<ReturnType<typeof buildTestServer>>["app"], fromTaskId: string, toTaskId: string) {
	const res = await app.inject({
		method: "POST",
		url: "/v1/team/task-connections",
		payload: {
			fromTaskId,
			fromOutputPortId: "out_md",
			toTaskId,
			toInputPortId: "in_md",
		},
	});
	assert.equal(res.statusCode, 201);
	return res.json().connection;
}

async function dependTasks(app: Awaited<ReturnType<typeof buildTestServer>>["app"], fromTaskId: string, toTaskId: string) {
	const res = await app.inject({
		method: "POST",
		url: "/v1/team/task-dependencies",
		payload: { fromTaskId, toTaskId },
	});
	assert.equal(res.statusCode, 201);
	return res.json().dependency;
}

async function createGroup(app: Awaited<ReturnType<typeof buildTestServer>>["app"], title: string, taskIds: string[]) {
	const res = await app.inject({
		method: "POST",
		url: "/v1/team/task-groups",
		payload: { title, taskIds },
	});
	assert.equal(res.statusCode, 201);
	return res.json().group;
}

async function createCanvasRun(workspace: RunWorkspace, taskId: string, input: {
	status: TeamRunState["status"];
	triggeredBy?: NonNullable<TeamRunState["source"]>["triggeredBy"];
}): Promise<TeamRunState> {
	const run = await workspace.createRun(singleTaskPlan(taskId), `canvas_task_unit_${taskId}`);
	run.source = {
		type: "canvas-task",
		taskId,
		...(input.triggeredBy ? { triggeredBy: input.triggeredBy } : {}),
	};
	await workspace.saveState(run);
	return workspace.patchState(run.runId, (state) => {
		const timestamp = new Date().toISOString();
		state.status = input.status;
		state.startedAt = input.status === "queued" ? null : timestamp;
		state.finishedAt = input.status === "completed" || input.status === "completed_with_failures" || input.status === "failed" || input.status === "cancelled"
			? timestamp
			: null;
		if (state.taskStates[taskId]) {
			state.taskStates[taskId]!.status = input.status === "completed" ? "succeeded" : input.status === "running" ? "running" : "pending";
		}
		state.updatedAt = timestamp;
	});
}

async function attachCompletedAttempt(workspace: RunWorkspace, runId: string, taskId: string): Promise<string> {
	const { attemptId } = await workspace.createAttempt(runId, taskId);
	await workspace.patchState(runId, (state) => {
		const timestamp = new Date().toISOString();
		const taskState = state.taskStates[taskId];
		if (taskState) {
			taskState.status = "succeeded";
			taskState.activeAttemptId = attemptId;
			taskState.resultRef = `tasks/${taskId}/attempts/${attemptId}/accepted-result.md`;
			taskState.progress = { phase: "succeeded", message: "succeeded", updatedAt: timestamp };
		}
		state.status = "completed";
		state.finishedAt = timestamp;
		state.updatedAt = timestamp;
	});
	return attemptId;
}

async function waitForGroupRun(
	app: Awaited<ReturnType<typeof buildTestServer>>["app"],
	groupRunId: string,
	predicate: (groupRun: TeamTaskGroupRun) => boolean,
): Promise<TeamTaskGroupRun> {
	for (let i = 0; i < 40; i++) {
		const res = await app.inject({ method: "GET", url: `/v1/team/task-group-runs/${groupRunId}` });
		assert.equal(res.statusCode, 200);
		const groupRun = res.json().groupRun as TeamTaskGroupRun;
		if (predicate(groupRun)) return groupRun;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`task group run did not reach expected state: ${groupRunId}`);
}

test("POST /v1/team/task-groups/:groupId/runs starts all independent heads as entry runs", async () => {
	const { app, root } = await buildTestServer();
	try {
		const first = await createTask(app, "A1");
		const second = await createTask(app, "B1");
		const group = await createGroup(app, "Two heads", [first.taskId, second.taskId]);

		const res = await app.inject({ method: "POST", url: `/v1/team/task-groups/${group.groupId}/runs` });

		assert.equal(res.statusCode, 201);
		const groupRun = res.json().groupRun as TeamTaskGroupRun;
		assert.equal(groupRun.status, "running");
		assert.equal(groupRun.entryRuns.length, 2);
		assert.deepEqual(new Set(groupRun.entryRuns.map(run => run.taskId)), new Set([first.taskId, second.taskId]));
		assert.deepEqual(new Set(groupRun.observedRuns.map(run => `${run.role}:${run.taskId}`)), new Set([`entry:${first.taskId}`, `entry:${second.taskId}`]));
		assert.deepEqual(groupRun.definitionSnapshot, {
			taskIds: [first.taskId, second.taskId],
			headTaskIds: [first.taskId, second.taskId],
		});
	} finally {
		await app.close();
		await removeTempRoot(root);
	}
});

test("POST /v1/team/task-groups/:groupId/runs rejects an empty Group with 400 and no entry runs", async () => {
	const { app, root } = await buildTestServer();
	try {
		const group = await createGroup(app, "Empty group", []);

		const res = await app.inject({ method: "POST", url: `/v1/team/task-groups/${group.groupId}/runs` });

		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /invalid task group/);
		const list = await app.inject({ method: "GET", url: `/v1/team/task-groups/${group.groupId}/runs` });
		assert.equal(list.statusCode, 200);
		assert.deepEqual(list.json().groupRuns, []);
	} finally {
		await app.close();
		await removeTempRoot(root);
	}
});

test("POST /v1/team/task-groups/:groupId/runs rejects a boundary-invalid Group with 400", async () => {
	const { app, root } = await buildTestServer();
	try {
		const inside = await createTask(app, "Inside", { outputPorts: [{ id: "out_md", label: "Out", type: "md" }] });
		const external = await createTask(app, "External", { inputPorts: [{ id: "in_md", label: "In", type: "md" }] });
		await connectTasks(app, inside.taskId, external.taskId);
		const group = await createGroup(app, "Boundary invalid", [inside.taskId]);
		assert.equal(group.status, "invalid");

		const res = await app.inject({ method: "POST", url: `/v1/team/task-groups/${group.groupId}/runs` });

		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /invalid task group/);
	} finally {
		await app.close();
		await removeTempRoot(root);
	}
});

test("POST /v1/team/task-groups/:groupId/runs rejects a generated child Group with 400", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const discovery = await createTask(app, "Discovery root");
		const store = new TaskStore(teamDir, { getAgentIds: () => ["main", "search"] });
		const generated = await store.create({
			...taskPayload,
			title: "Generated child",
			generatedSource: {
				schemaVersion: "team/generated-task-source-1",
				sourceDiscoveryTaskId: discovery.taskId,
				sourceItemId: "item_1",
				itemStatus: "active",
				itemPayload: { id: "item_1" },
				workUnitMode: "managed",
			},
		});
		const group = await createGroup(app, "Generated child group", [generated.taskId]);
		assert.equal(group.status, "invalid");

		const res = await app.inject({ method: "POST", url: `/v1/team/task-groups/${group.groupId}/runs` });

		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /invalid task group/);
	} finally {
		await app.close();
		await removeTempRoot(root);
	}
});

test("POST /v1/team/task-groups/:groupId/runs rejects when any Group task has an active Task run", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const task = await createTask(app, "Active task");
		const group = await createGroup(app, "Active guard", [task.taskId]);
		const workspace = new RunWorkspace(join(teamDir, "task-runs"));
		await createCanvasRun(workspace, task.taskId, { status: "running" });

		const res = await app.inject({ method: "POST", url: `/v1/team/task-groups/${group.groupId}/runs` });

		assert.equal(res.statusCode, 409);
		assert.match(res.json().error, /active task run/);
		const list = await app.inject({ method: "GET", url: `/v1/team/task-groups/${group.groupId}/runs` });
		assert.equal(list.statusCode, 200);
		assert.deepEqual(list.json().groupRuns, []);
	} finally {
		await app.close();
		await removeTempRoot(root);
	}
});

test("POST /v1/team/task-groups/:groupId/runs rejects when the Group already has an active GroupRun", async () => {
	const { app, root } = await buildTestServer();
	try {
		const task = await createTask(app, "Single head");
		const group = await createGroup(app, "Single group", [task.taskId]);
		const first = await app.inject({ method: "POST", url: `/v1/team/task-groups/${group.groupId}/runs` });
		assert.equal(first.statusCode, 201);

		const second = await app.inject({ method: "POST", url: `/v1/team/task-groups/${group.groupId}/runs` });

		assert.equal(second.statusCode, 409);
		assert.match(second.json().error, /active task group run/);
	} finally {
		await app.close();
		await removeTempRoot(root);
	}
});

test("POST /v1/team/task-groups/:groupId/runs returns active guard when live Group became invalid", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const task = await createTask(app, "Mutable active guard");
		const group = await createGroup(app, "Mutable guard group", [task.taskId]);
		const store = new TaskGroupRunStore(teamDir);
		const activeRun = await store.create({
			groupId: group.groupId,
			definitionSnapshot: {
				taskIds: [task.taskId],
				headTaskIds: [task.taskId],
			},
		});
		await store.patch(activeRun.groupRunId, {
			status: "running",
			startedAt: new Date().toISOString(),
			entryRuns: [{ taskId: task.taskId, runId: "run_existing_entry" }],
			observedRuns: [{ taskId: task.taskId, runId: "run_existing_entry", role: "entry" }],
		});
		const patch = await app.inject({
			method: "PATCH",
			url: `/v1/team/task-groups/${group.groupId}`,
			payload: { taskIds: [] },
		});
		assert.equal(patch.statusCode, 200);
		assert.equal(patch.json().group.status, "invalid");

		const res = await app.inject({ method: "POST", url: `/v1/team/task-groups/${group.groupId}/runs` });

		assert.equal(res.statusCode, 409);
		assert.match(res.json().error, /active task group run/);
	} finally {
		await app.close();
		await removeTempRoot(root);
	}
});

test("GET /v1/team/task-group-runs/:groupRunId keeps running while downstream is active and completes after downstream terminal", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const a = await createTask(app, "A", { outputPorts: [{ id: "out_md", label: "Out", type: "md" }] });
		const b = await createTask(app, "B", { inputPorts: [{ id: "in_md", label: "In", type: "md" }] });
		const connection = await connectTasks(app, a.taskId, b.taskId);
		const group = await createGroup(app, "A to B", [a.taskId, b.taskId]);
		const workspace = new RunWorkspace(join(teamDir, "task-runs"));
		const entry = await createCanvasRun(workspace, a.taskId, { status: "completed" });
		const downstream = await createCanvasRun(workspace, b.taskId, {
			status: "running",
			triggeredBy: {
				type: "task-connection",
				connectionId: connection.connectionId,
				fromTaskId: a.taskId,
				fromRunId: entry.runId,
				fromAttemptId: "attempt_entry",
			},
		});
		const store = new TaskGroupRunStore(teamDir);
		const groupRun = await store.create({ groupId: group.groupId });
		await store.patch(groupRun.groupRunId, {
			status: "running",
			startedAt: new Date().toISOString(),
			entryRuns: [{ taskId: a.taskId, runId: entry.runId }],
			observedRuns: [{ taskId: a.taskId, runId: entry.runId, role: "entry" }],
		});

		const running = await app.inject({ method: "GET", url: `/v1/team/task-group-runs/${groupRun.groupRunId}` });
		assert.equal(running.statusCode, 200);
		assert.equal(running.json().groupRun.status, "running");
		assert.ok((running.json().groupRun.observedRuns as TeamTaskGroupRun["observedRuns"]).some(run => run.runId === downstream.runId && run.role === "downstream"));

		await workspace.patchState(downstream.runId, (state) => {
			state.status = "completed";
			state.finishedAt = new Date().toISOString();
			state.updatedAt = new Date().toISOString();
		});
		const completed = await app.inject({ method: "GET", url: `/v1/team/task-group-runs/${groupRun.groupRunId}` });
		assert.equal(completed.statusCode, 200);
		assert.equal(completed.json().groupRun.status, "completed");
		assert.ok(completed.json().groupRun.finishedAt);
	} finally {
		await app.close();
		await removeTempRoot(root);
	}
});

test("GET /v1/team/task-group-runs/:groupRunId completes when Group pipeline completes even if a Discovery generated child failed", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const discovery = await createTask(app, "Discovery", { outputPorts: [{ id: "out_md", label: "Out", type: "md" }] });
		const downstreamTask = await createTask(app, "Downstream", { inputPorts: [{ id: "in_md", label: "In", type: "md" }] });
		const connection = await connectTasks(app, discovery.taskId, downstreamTask.taskId);
		const group = await createGroup(app, "Discovery pipeline", [discovery.taskId, downstreamTask.taskId]);
		const workspace = new RunWorkspace(join(teamDir, "task-runs"));
		const entry = await createCanvasRun(workspace, discovery.taskId, { status: "completed" });
		const failedGenerated = await createCanvasRun(workspace, "task_generated_failed", {
			status: "failed",
			triggeredBy: {
				type: "discovery-generated-task",
				discoveryTaskId: discovery.taskId,
				discoveryRunId: entry.runId,
				discoveryAttemptId: "attempt_discovery",
				sourceItemId: "generated-item",
			},
		});
		const downstream = await createCanvasRun(workspace, downstreamTask.taskId, {
			status: "completed",
			triggeredBy: {
				type: "task-connection",
				connectionId: connection.connectionId,
				fromTaskId: discovery.taskId,
				fromRunId: entry.runId,
				fromAttemptId: "attempt_entry",
			},
		});
		const store = new TaskGroupRunStore(teamDir);
		const groupRun = await store.create({ groupId: group.groupId });
		await store.patch(groupRun.groupRunId, {
			status: "running",
			startedAt: new Date().toISOString(),
			entryRuns: [{ taskId: discovery.taskId, runId: entry.runId }],
			observedRuns: [{ taskId: discovery.taskId, runId: entry.runId, role: "entry" }],
		});

		const completed = await app.inject({ method: "GET", url: `/v1/team/task-group-runs/${groupRun.groupRunId}` });
		assert.equal(completed.statusCode, 200);
		const completedGroupRun = completed.json().groupRun as TeamTaskGroupRun;
		assert.equal(completedGroupRun.status, "completed");
		assert.equal(completedGroupRun.lastError, null);
		assert.ok(completedGroupRun.observedRuns.some(run => run.runId === downstream.runId && run.role === "downstream"));
		assert.ok(completedGroupRun.observedRuns.some(run => run.runId === failedGenerated.runId && run.role === "discovery-generated"));
	} finally {
		await app.close();
		await removeTempRoot(root);
	}
});

test("GET /v1/team/task-group-runs/:groupRunId uses definitionSnapshot after Group membership changes", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const a = await createTask(app, "Snapshot A", { outputPorts: [{ id: "out_md", label: "Out", type: "md" }] });
		const b = await createTask(app, "Snapshot B", { inputPorts: [{ id: "in_md", label: "In", type: "md" }] });
		const replacement = await createTask(app, "Replacement");
		const connection = await connectTasks(app, a.taskId, b.taskId);
		const group = await createGroup(app, "Snapshot group", [a.taskId, b.taskId]);
		const workspace = new RunWorkspace(join(teamDir, "task-runs"));
		const entry = await createCanvasRun(workspace, a.taskId, { status: "completed" });
		const downstream = await createCanvasRun(workspace, b.taskId, {
			status: "running",
			triggeredBy: {
				type: "task-connection",
				connectionId: connection.connectionId,
				fromTaskId: a.taskId,
				fromRunId: entry.runId,
				fromAttemptId: "attempt_entry",
			},
		});
		const store = new TaskGroupRunStore(teamDir);
		const groupRun = await store.create({
			groupId: group.groupId,
			definitionSnapshot: {
				taskIds: [a.taskId, b.taskId],
				headTaskIds: [a.taskId],
			},
		});
		await store.patch(groupRun.groupRunId, {
			status: "running",
			startedAt: new Date().toISOString(),
			entryRuns: [{ taskId: a.taskId, runId: entry.runId }],
			observedRuns: [{ taskId: a.taskId, runId: entry.runId, role: "entry" }],
		});
		const patch = await app.inject({
			method: "PATCH",
			url: `/v1/team/task-groups/${group.groupId}`,
			payload: { taskIds: [replacement.taskId] },
		});
		assert.equal(patch.statusCode, 200);

		const running = await app.inject({ method: "GET", url: `/v1/team/task-group-runs/${groupRun.groupRunId}` });
		assert.equal(running.statusCode, 200);
		assert.equal(running.json().groupRun.status, "running");
		assert.ok((running.json().groupRun.observedRuns as TeamTaskGroupRun["observedRuns"]).some(run => run.runId === downstream.runId && run.role === "downstream"));

		await workspace.patchState(downstream.runId, (state) => {
			state.status = "completed";
			state.finishedAt = new Date().toISOString();
			state.updatedAt = new Date().toISOString();
		});
		const completed = await app.inject({ method: "GET", url: `/v1/team/task-group-runs/${groupRun.groupRunId}` });
		assert.equal(completed.statusCode, 200);
		assert.equal(completed.json().groupRun.status, "completed");
		assert.deepEqual(completed.json().groupRun.definitionSnapshot, {
			taskIds: [a.taskId, b.taskId],
			headTaskIds: [a.taskId],
		});
	} finally {
		await app.close();
		await removeTempRoot(root);
	}
});

test("GET /v1/team/task-group-runs/:groupRunId stays running when entry completed before downstream delivery evidence", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const a = await createTask(app, "A", { outputPorts: [{ id: "out_md", label: "Out", type: "md" }] });
		const b = await createTask(app, "B", { inputPorts: [{ id: "in_md", label: "In", type: "md" }] });
		const c = await createTask(app, "C");
		const connection = await connectTasks(app, a.taskId, b.taskId);
		const dependency = await dependTasks(app, a.taskId, c.taskId);
		const group = await createGroup(app, "A to B and C", [a.taskId, b.taskId, c.taskId]);
		const workspace = new RunWorkspace(join(teamDir, "task-runs"));
		const entry = await createCanvasRun(workspace, a.taskId, { status: "completed" });
		const attemptId = await attachCompletedAttempt(workspace, entry.runId, a.taskId);
		const store = new TaskGroupRunStore(teamDir);
		const groupRun = await store.create({ groupId: group.groupId });
		await store.patch(groupRun.groupRunId, {
			status: "running",
			startedAt: new Date().toISOString(),
			entryRuns: [{ taskId: a.taskId, runId: entry.runId }],
			observedRuns: [{ taskId: a.taskId, runId: entry.runId, role: "entry" }],
		});

		const beforeDelivery = await app.inject({ method: "GET", url: `/v1/team/task-group-runs/${groupRun.groupRunId}` });
		assert.equal(beforeDelivery.statusCode, 200);
		assert.equal(beforeDelivery.json().groupRun.status, "running");
		assert.equal(beforeDelivery.json().groupRun.finishedAt, null);

		const downstream = await createCanvasRun(workspace, b.taskId, {
			status: "running",
			triggeredBy: {
				type: "task-connection",
				connectionId: connection.connectionId,
				fromTaskId: a.taskId,
				fromRunId: entry.runId,
				fromAttemptId: attemptId,
			},
		});
		await workspace.recordAttemptDeliveryOutcomes(entry.runId, a.taskId, attemptId, [
			{
				connectionId: connection.connectionId,
				toTaskId: b.taskId,
				toInputPortId: "in_md",
				status: "delivered",
				downstreamRunId: downstream.runId,
				createdAt: new Date().toISOString(),
			},
			{
				edgeKind: "control-dependency",
				dependencyId: dependency.dependencyId,
				toTaskId: c.taskId,
				status: "skipped",
				createdAt: new Date().toISOString(),
			},
		]);

		const whileDownstreamRunning = await app.inject({ method: "GET", url: `/v1/team/task-group-runs/${groupRun.groupRunId}` });
		assert.equal(whileDownstreamRunning.statusCode, 200);
		assert.equal(whileDownstreamRunning.json().groupRun.status, "running");
		assert.ok((whileDownstreamRunning.json().groupRun.observedRuns as TeamTaskGroupRun["observedRuns"]).some(run => run.runId === downstream.runId && run.role === "downstream"));

		await workspace.patchState(downstream.runId, (state) => {
			state.status = "completed";
			state.finishedAt = new Date().toISOString();
			state.updatedAt = new Date().toISOString();
		});
		const completed = await app.inject({ method: "GET", url: `/v1/team/task-group-runs/${groupRun.groupRunId}` });
		assert.equal(completed.statusCode, 200);
		assert.equal(completed.json().groupRun.status, "completed");
		assert.ok(completed.json().groupRun.finishedAt);
	} finally {
		await app.close();
		await removeTempRoot(root);
	}
});

test("POST /v1/team/task-group-runs/:groupRunId/cancel cancels downstream active Task runs, not only entries", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const a = await createTask(app, "A", { outputPorts: [{ id: "out_md", label: "Out", type: "md" }] });
		const b = await createTask(app, "B", { inputPorts: [{ id: "in_md", label: "In", type: "md" }] });
		const connection = await connectTasks(app, a.taskId, b.taskId);
		const group = await createGroup(app, "Cancel downstream", [a.taskId, b.taskId]);
		const workspace = new RunWorkspace(join(teamDir, "task-runs"));
		const entry = await createCanvasRun(workspace, a.taskId, { status: "completed" });
		const downstream = await createCanvasRun(workspace, b.taskId, {
			status: "running",
			triggeredBy: {
				type: "task-connection",
				connectionId: connection.connectionId,
				fromTaskId: a.taskId,
				fromRunId: entry.runId,
				fromAttemptId: "attempt_entry",
			},
		});
		const store = new TaskGroupRunStore(teamDir);
		const groupRun = await store.create({ groupId: group.groupId });
		await store.patch(groupRun.groupRunId, {
			status: "running",
			startedAt: new Date().toISOString(),
			entryRuns: [{ taskId: a.taskId, runId: entry.runId }],
			observedRuns: [{ taskId: a.taskId, runId: entry.runId, role: "entry" }],
		});

		const cancel = await app.inject({ method: "POST", url: `/v1/team/task-group-runs/${groupRun.groupRunId}/cancel` });

		assert.equal(cancel.statusCode, 200);
		assert.equal(cancel.json().groupRun.status, "cancelled");
		const cancelledDownstream = await app.inject({ method: "GET", url: `/v1/team/task-runs/${downstream.runId}` });
		assert.equal(cancelledDownstream.statusCode, 200);
		assert.equal(cancelledDownstream.json().status, "cancelled");
	} finally {
		await app.close();
		await removeTempRoot(root);
	}
});

test("POST /v1/team/task-groups/:groupId/runs maps task group run lock busy to 409", async () => {
	const { app, root, teamDir } = await buildTestServer();
	const lockDir = join(teamDir, ".task-group-runs.lock");
	try {
		const task = await createTask(app, "Lock busy task");
		const group = await createGroup(app, "Lock busy group", [task.taskId]);
		await mkdir(lockDir, { recursive: true });

		const res = await app.inject({ method: "POST", url: `/v1/team/task-groups/${group.groupId}/runs` });

		assert.equal(res.statusCode, 409);
		assert.match(res.json().error, /lock busy/);
	} finally {
		await rm(lockDir, { recursive: true, force: true }).catch(() => {});
		await app.close();
		await removeTempRoot(root);
	}
});

test("POST /v1/team/task-groups/:groupId/runs rejects archived Groups", async () => {
	const { app, root } = await buildTestServer();
	try {
		const task = await createTask(app, "Archived group task");
		const group = await createGroup(app, "Archived group", [task.taskId]);
		const archive = await app.inject({ method: "POST", url: `/v1/team/task-groups/${group.groupId}/archive` });
		assert.equal(archive.statusCode, 200);

		const res = await app.inject({ method: "POST", url: `/v1/team/task-groups/${group.groupId}/runs` });

		assert.equal(res.statusCode, 409);
		assert.match(res.json().error, /archived/);
	} finally {
		await app.close();
		await removeTempRoot(root);
	}
});

test("POST /v1/team/task-groups/:groupId/runs returns 400 for invalid stored Group data", async () => {
	const { app, root } = await buildTestServer();
	try {
		const task = await createTask(app, "Invalid old group task");
		const group = await createGroup(app, "Old group", [task.taskId]);
		const archiveTask = await app.inject({ method: "POST", url: `/v1/team/tasks/${task.taskId}/archive` });
		assert.equal(archiveTask.statusCode, 200);

		const res = await app.inject({ method: "POST", url: `/v1/team/task-groups/${group.groupId}/runs` });

		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /invalid task group/);
	} finally {
		await app.close();
		await removeTempRoot(root);
	}
});

test("GET /v1/team/task-groups/:groupId/runs lists only runs for that Group", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const first = await createTask(app, "First group task");
		const second = await createTask(app, "Second group task");
		const firstGroup = await createGroup(app, "First group", [first.taskId]);
		const secondGroup = await createGroup(app, "Second group", [second.taskId]);
		const store = new TaskGroupRunStore(teamDir);
		const firstRun = await store.create({ groupId: firstGroup.groupId });
		const secondRun = await store.create({ groupId: secondGroup.groupId });
		await store.patch(firstRun.groupRunId, { status: "completed", finishedAt: new Date().toISOString() });
		await store.patch(secondRun.groupRunId, { status: "completed", finishedAt: new Date().toISOString() });

		const res = await app.inject({ method: "GET", url: `/v1/team/task-groups/${firstGroup.groupId}/runs` });

		assert.equal(res.statusCode, 200);
		assert.deepEqual(res.json().groupRuns.map((run: TeamTaskGroupRun) => run.groupRunId), [firstRun.groupRunId]);
	} finally {
		await app.close();
		await removeTempRoot(root);
	}
});

test("POST /v1/team/task-groups/:groupId/runs marks GroupRun failed and cancels started entries when a later entry fails", async () => {
	const { app, root } = await buildTestServer();
	try {
		const ready = await createTask(app, "Ready head");
		const drafting = await createTask(app, "Drafting head", { status: "drafting" });
		const group = await createGroup(app, "Partial start rollback", [ready.taskId, drafting.taskId]);

		const res = await app.inject({ method: "POST", url: `/v1/team/task-groups/${group.groupId}/runs` });

		assert.equal(res.statusCode, 409);
		assert.match(res.json().error, /entry start failed|ready/);
		const list = await app.inject({ method: "GET", url: `/v1/team/task-groups/${group.groupId}/runs` });
		assert.equal(list.statusCode, 200);
		assert.equal(list.json().groupRuns.length, 1);
		const groupRun = list.json().groupRuns[0] as TeamTaskGroupRun;
		assert.equal(groupRun.status, "failed");
		assert.equal(groupRun.entryRuns.length, 1);
		const entry = await waitForGroupRun(app, groupRun.groupRunId, run => run.status === "failed");
		const entryRun = await app.inject({ method: "GET", url: `/v1/team/task-runs/${entry.entryRuns[0]!.runId}` });
		assert.equal(entryRun.statusCode, 200);
		assert.equal(entryRun.json().status, "cancelled");
	} finally {
		await app.close();
		await removeTempRoot(root);
	}
});
