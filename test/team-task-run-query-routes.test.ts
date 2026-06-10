import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { TeamRunState } from "../src/team/types.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import {
	buildTestServer,
	singleTaskPlan,
	taskPayload,
	waitForTaskRunCount,
	waitForTerminalRun,
	withPorts,
} from "./team-task-run-routes-helpers.js";

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
			hasMore: boolean;
			runs: Array<{ run: TeamRunState; annotation: { best: boolean; archived: boolean; note?: string } }>;
		};
		assert.equal(body.total, 3);
		assert.equal(body.limit, 2);
		assert.equal(body.offset, 0);
		assert.equal(body.hasMore, true);
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

test("POST /v1/team/tasks/:taskId/runs with valid upstreamRunSelections creates run with manual upstream trace", async () => {
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

		const upstreamRunRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${collect.taskId}/runs` });
		assert.equal(upstreamRunRes.statusCode, 201);
		const upstreamRun = upstreamRunRes.json() as TeamRunState;
		const upstreamFinished = await waitForTerminalRun(app, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");
		const autoDownstreamRuns = await waitForTaskRunCount(app, html.taskId, 1);
		await waitForTerminalRun(app, autoDownstreamRuns[0]!.runId);

		const runRes = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${html.taskId}/runs`,
			payload: {
				upstreamRunSelections: [{ connectionId: connection.connectionId, fromRunId: upstreamRun.runId }],
			},
		});
		assert.equal(runRes.statusCode, 201);
		const created = runRes.json() as TeamRunState;
		assert.equal(created.source?.boundInputs?.length, 1);
		assert.equal(created.source?.boundInputs?.[0]?.connectionId, connection.connectionId);
		const typedArtifact = created.source?.boundInputs?.[0]?.artifact as import("../src/team/types.js").TeamTaskTypedArtifact;
		assert.equal(typedArtifact.sourceRunId, upstreamRun.runId);
		assert.equal(created.source?.manualUpstreamSelections?.length, 1);
		assert.equal(created.source?.manualUpstreamSelections?.[0]?.fromRunId, upstreamRun.runId);
		assert.equal(created.source?.triggeredBy, undefined);

		const fullDetailRes = await app.inject({ method: "GET", url: `/v1/team/task-runs/${created.runId}` });
		assert.equal(fullDetailRes.statusCode, 200);
		const fullDetail = fullDetailRes.json() as TeamRunState;
		assert.equal(fullDetail.source?.boundInputs?.length, 1, "full run detail must include boundInputs");
		assert.equal(fullDetail.source?.manualUpstreamSelections?.[0]?.fromRunId, upstreamRun.runId);
		assert.equal(fullDetail.source?.triggeredBy, undefined, "manual run detail must not invent triggeredBy");

		const byTaskSummaryRes = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/by-task?taskIds=${html.taskId}&limit=1&view=summary`,
		});
		assert.equal(byTaskSummaryRes.statusCode, 200);
		const byTaskSummary = byTaskSummaryRes.json().runsByTaskId[html.taskId][0] as TeamRunState;
		assert.equal(byTaskSummary.runId, created.runId);
		assert.equal(byTaskSummary.source?.boundInputs, undefined, "by-task summary must omit heavy boundInputs");
		assert.equal(byTaskSummary.source?.manualUpstreamSelections?.[0]?.fromRunId, upstreamRun.runId);

		const singleSummaryRes = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/${created.runId}?view=summary&taskId=${html.taskId}`,
		});
		assert.equal(singleSummaryRes.statusCode, 200);
		const singleSummary = singleSummaryRes.json() as TeamRunState;
		assert.equal(singleSummary.source?.boundInputs, undefined, "single summary must omit heavy boundInputs");
		assert.equal(singleSummary.source?.manualUpstreamSelections?.[0]?.fromRunId, upstreamRun.runId);
		assert.deepEqual(Object.keys(singleSummary.taskStates), [html.taskId]);

		const processSummaryRes = await app.inject({
			method: "GET",
			url: `/v1/team/task-runs/${created.runId}?view=process-summary&taskId=${html.taskId}`,
		});
		assert.equal(processSummaryRes.statusCode, 200);
		const processSummary = processSummaryRes.json();
		assert.equal(processSummary.run.source?.boundInputs, undefined, "process summary must omit heavy boundInputs");
		assert.equal(processSummary.run.source?.manualUpstreamSelections?.[0]?.fromRunId, upstreamRun.runId);

		const historyRes = await app.inject({
			method: "GET",
			url: `/v1/team/tasks/${html.taskId}/run-history?limit=1`,
		});
		assert.equal(historyRes.statusCode, 200);
		const historyRun = historyRes.json().runs[0].run as TeamRunState;
		assert.equal(historyRun.runId, created.runId);
		assert.equal(historyRun.source?.boundInputs, undefined, "run history must omit heavy boundInputs");
		assert.equal(historyRun.source?.manualUpstreamSelections?.[0]?.fromRunId, upstreamRun.runId);

		const rootSummaryRes = await app.inject({ method: "GET", url: "/v1/team/console/root-summary" });
		assert.equal(rootSummaryRes.statusCode, 200);
		const rootSummaryRun = rootSummaryRes.json().taskRunsByTaskId[html.taskId][0] as TeamRunState;
		assert.equal(rootSummaryRun.runId, created.runId);
		assert.equal(rootSummaryRun.source?.boundInputs, undefined, "root summary must omit heavy boundInputs");
		assert.equal(rootSummaryRun.source?.manualUpstreamSelections?.[0]?.fromRunId, upstreamRun.runId);

		await waitForTerminalRun(app, created.runId);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/tasks/:taskId/runs rejects bad upstreamRunSelections shape", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: taskPayload,
		});
		assert.equal(taskRes.statusCode, 201);
		const task = taskRes.json().task;

		const notArray = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${task.taskId}/runs`,
			payload: { upstreamRunSelections: "bad" },
		});
		assert.equal(notArray.statusCode, 400);
		assert.match(notArray.json().error, /must be an array/);

		const badShape = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${task.taskId}/runs`,
			payload: { upstreamRunSelections: [{ connectionId: 123 }] },
		});
		assert.equal(badShape.statusCode, 400);
		assert.match(badShape.json().error, /connectionId and fromRunId/);

		const unknownConn = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${task.taskId}/runs`,
			payload: { upstreamRunSelections: [{ connectionId: "conn_unknown", fromRunId: "run_1" }] },
		});
		assert.equal(unknownConn.statusCode, 400);
		assert.match(unknownConn.json().error, /connection not found/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/tasks/:taskId/runs rejects upstreamRunSelections with connection targeting different task", async () => {
	const { app, root } = await buildTestServer();
	try {
		const task1Res = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			}),
		});
		const task2Res = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "Task 2" }, {
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			}),
		});
		const task3Res = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "Task 3" }, {
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			}),
		});
		assert.equal(task1Res.statusCode, 201);
		assert.equal(task2Res.statusCode, 201);
		assert.equal(task3Res.statusCode, 201);
		const task1 = task1Res.json().task;
		const task2 = task2Res.json().task;
		const task3 = task3Res.json().task;

		const connectionRes = await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: task1.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: task2.taskId,
				toInputPortId: "source_md",
			},
		});
		assert.equal(connectionRes.statusCode, 201);
		const connection = connectionRes.json().connection;

		const wrongTarget = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${task3.taskId}/runs`,
			payload: { upstreamRunSelections: [{ connectionId: connection.connectionId, fromRunId: "run_fake" }] },
		});
		assert.equal(wrongTarget.statusCode, 400);
		assert.match(wrongTarget.json().error, /does not target task/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/tasks/:taskId/runs rejects duplicate upstreamRunSelections connectionId", async () => {
	const { app, root } = await buildTestServer();
	try {
		const task1Res = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			}),
		});
		const task2Res = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "Task 2" }, {
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			}),
		});
		assert.equal(task1Res.statusCode, 201);
		assert.equal(task2Res.statusCode, 201);
		const task1 = task1Res.json().task;
		const task2 = task2Res.json().task;

		const connectionRes = await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: task1.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: task2.taskId,
				toInputPortId: "source_md",
			},
		});
		assert.equal(connectionRes.statusCode, 201);
		const connection = connectionRes.json().connection;

		const duplicate = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${task2.taskId}/runs`,
			payload: {
				upstreamRunSelections: [
					{ connectionId: connection.connectionId, fromRunId: "run_first" },
					{ connectionId: connection.connectionId, fromRunId: "run_second" },
				],
			},
		});
		assert.equal(duplicate.statusCode, 400);
		assert.match(duplicate.json().error, new RegExp("duplicate upstreamRunSelections connectionId: " + connection.connectionId));
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});
