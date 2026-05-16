import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RunWorkspace } from "../src/team/run-workspace.js";
import type { TeamPlan } from "../src/team/types.js";

const plan: TeamPlan = {
	schemaVersion: "team/plan-1",
	planId: "plan_test",
	title: "test",
	defaultTeamUnitId: "team_1",
	goal: { text: "test goal" },
	tasks: [
		{ id: "task_1", title: "t1", input: { text: "do t1" }, acceptance: { rules: ["rule1"] } },
		{ id: "task_2", title: "t2", input: { text: "do t2" }, acceptance: { rules: ["rule2"] } },
	],
	outputContract: { text: "output" },
	archived: false,
	createdAt: "",
	updatedAt: "",
	runCount: 0,
};

test("createRun copies plan.json and initializes state", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		assert.ok(state.runId.startsWith("run_"));
		assert.equal(state.status, "queued");
		assert.equal(state.planId, "plan_test");
		assert.equal(state.teamUnitId, "team_1");
		assert.equal(state.summary.totalTasks, 2);
		assert.equal(state.taskStates["task_1"]?.status, "pending");
		assert.equal(state.taskStates["task_2"]?.status, "pending");

		const planData = await readFile(join(root, "runs", state.runId, "plan.json"), "utf8");
		assert.ok(planData.includes("plan_test"));
	} finally {
		await rm(root, { recursive: true });
	}
});

test("createAttempt creates work and output dirs", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId, attemptRoot } = await ws.createAttempt(state.runId, "task_1");
		assert.ok(attemptId.startsWith("attempt_"));
		assert.ok(attemptRoot.includes("task_1"));
		assert.ok(attemptRoot.includes(attemptId));

		const { stat } = await import("node:fs/promises");
		await stat(join(attemptRoot, "work"));
		await stat(join(attemptRoot, "output"));
	} finally {
		await rm(root, { recursive: true });
	}
});

test("writeWorkerOutput returns run-relative ref", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		const ref = await ws.writeWorkerOutput(state.runId, "task_1", attemptId, 1, "worker result");
		assert.equal(ref, `tasks/task_1/attempts/${attemptId}/worker-output-001.md`);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("writeAcceptedResult and writeFailedResult", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		const accRef = await ws.writeAcceptedResult(state.runId, "task_1", attemptId, "accepted!");
		assert.ok(accRef.endsWith("accepted-result.md"));
		const failRef = await ws.writeFailedResult(state.runId, "task_1", attemptId, "failed!");
		assert.ok(failRef.endsWith("failed-result.md"));
	} finally {
		await rm(root, { recursive: true });
	}
});

test("writeFinalReport writes to run root", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const ref = await ws.writeFinalReport(state.runId, "# Final");
		assert.equal(ref, "final-report.md");
		const content = await readFile(join(root, "runs", state.runId, "final-report.md"), "utf8");
		assert.equal(content, "# Final");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("deleteRun removes run directory", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		await ws.deleteRun(state.runId);
		const got = await ws.getState(state.runId);
		assert.equal(got, null);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("listStates returns created runs", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		await ws.createRun(plan, "team_1");
		await ws.createRun(plan, "team_1");
		const list = await ws.listStates();
		assert.equal(list.length, 2);
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P5: attempt metadata tests ──

test("createAttempt writes full metadata defaults", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		const a = attempts[0]!;
		assert.equal(a.attemptId, attemptId);
		assert.equal(a.taskId, "task_1");
		assert.equal(a.status, "running");
		assert.equal(a.phase, "created");
		assert.equal(a.finishedAt, null);
		assert.deepEqual(a.worker, []);
		assert.deepEqual(a.checker, []);
		assert.equal(a.watcher, null);
		assert.equal(a.resultRef, null);
		assert.equal(a.errorSummary, null);
		assert.ok(a.updatedAt.length > 0);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("listAttempts reads old format attempt.json with defaults", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		// Manually create old-format attempt
		const attemptDir = join(root, "runs", state.runId, "tasks", "task_1", "attempts", "attempt_old123");
		await mkdir(attemptDir, { recursive: true });
		await writeFile(join(attemptDir, "attempt.json"), JSON.stringify({
			attemptId: "attempt_old123",
			taskId: "task_1",
			status: "succeeded",
			createdAt: "2026-05-15T00:00:00.000Z",
		}), "utf8");
		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		const a = attempts[0]!;
		assert.equal(a.attemptId, "attempt_old123");
		assert.equal(a.status, "succeeded");
		assert.equal(a.phase, "succeeded"); // fallback from status
		assert.equal(a.finishedAt, null);
		assert.deepEqual(a.worker, []);
		assert.deepEqual(a.checker, []);
		assert.equal(a.watcher, null);
		assert.equal(a.resultRef, null);
		assert.equal(a.errorSummary, null);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("updateAttemptStatus preserves metadata fields", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		await ws.updateAttemptStatus(state.runId, "task_1", attemptId, "succeeded");
		const attempts = await ws.listAttempts(state.runId, "task_1");
		const a = attempts[0]!;
		assert.equal(a.status, "succeeded");
		// Metadata fields preserved
		assert.deepEqual(a.worker, []);
		assert.deepEqual(a.checker, []);
		assert.equal(a.watcher, null);
		assert.equal(a.resultRef, null);
		assert.equal(a.errorSummary, null);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("listAttempts handles missing attempt.json with fallback", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		// Create directory without attempt.json
		const attemptDir = join(root, "runs", state.runId, "tasks", "task_1", "attempts", "attempt_nofile");
		await mkdir(attemptDir, { recursive: true });
		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		const a = attempts[0]!;
		assert.equal(a.attemptId, "attempt_nofile");
		assert.equal(a.status, "running"); // default
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P5 Task 2: lifecycle write API tests ──

test("updateAttemptPhase writes phase and updatedAt", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		await ws.updateAttemptPhase(state.runId, "task_1", attemptId, "worker_running");
		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts[0]!.phase, "worker_running");
		assert.ok(attempts[0]!.updatedAt.length > 0);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("recordAttemptWorkerOutput appends to worker array", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		await ws.recordAttemptWorkerOutput(state.runId, "task_1", attemptId, { outputRef: "w1.md", outputIndex: 1 });
		await ws.recordAttemptWorkerOutput(state.runId, "task_1", attemptId, { outputRef: "w2.md", outputIndex: 2 });
		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts[0]!.worker.length, 2);
		assert.equal(attempts[0]!.worker[0]!.outputRef, "w1.md");
		assert.equal(attempts[0]!.worker[1]!.outputIndex, 2);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("recordAttemptCheckerResult appends to checker array", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		await ws.recordAttemptCheckerResult(state.runId, "task_1", attemptId, {
			verdict: "revise", reason: "fix X", feedback: "do Y", revisionIndex: 1, recordRef: "v1.json", feedbackRef: "f1.md",
		});
		await ws.recordAttemptCheckerResult(state.runId, "task_1", attemptId, {
			verdict: "pass", reason: "ok", revisionIndex: 2, recordRef: "v2.json", feedbackRef: null,
		});
		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts[0]!.checker.length, 2);
		assert.equal(attempts[0]!.checker[0]!.verdict, "revise");
		assert.equal(attempts[0]!.checker[0]!.feedback, "do Y");
		assert.equal(attempts[0]!.checker[1]!.verdict, "pass");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("recordAttemptWatcherResult sets watcher (not append)", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		await ws.recordAttemptWatcherResult(state.runId, "task_1", attemptId, {
			decision: "accept_task", reason: "good", recordRef: "w.json",
		});
		let attempts = await ws.listAttempts(state.runId, "task_1");
		assert.ok(attempts[0]!.watcher);
		assert.equal(attempts[0]!.watcher!.decision, "accept_task");
		// Second call overwrites
		await ws.recordAttemptWatcherResult(state.runId, "task_1", attemptId, {
			decision: "confirm_failed", reason: "bad", recordRef: "w2.json",
		});
		attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts[0]!.watcher!.decision, "confirm_failed");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("finishAttempt writes finishedAt and terminal fields", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		await ws.finishAttempt(state.runId, "task_1", attemptId, {
			status: "succeeded", phase: "succeeded", resultRef: "accepted.md", errorSummary: null,
		});
		const attempts = await ws.listAttempts(state.runId, "task_1");
		const a = attempts[0]!;
		assert.equal(a.status, "succeeded");
		assert.equal(a.phase, "succeeded");
		assert.equal(a.resultRef, "accepted.md");
		assert.ok(a.finishedAt !== null);
		assert.ok(a.finishedAt!.length > 0);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("lifecycle methods are no-op for non-existent attempt", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		// These should not throw
		await ws.updateAttemptPhase(state.runId, "task_1", "attempt_ghost", "worker_running");
		await ws.recordAttemptWorkerOutput(state.runId, "task_1", "attempt_ghost", { outputRef: "x", outputIndex: 1 });
		await ws.recordAttemptCheckerResult(state.runId, "task_1", "attempt_ghost", { verdict: "pass", reason: "ok", revisionIndex: 1, recordRef: "v.json", feedbackRef: null });
		await ws.recordAttemptWatcherResult(state.runId, "task_1", "attempt_ghost", { decision: "accept_task", reason: "ok", recordRef: "w.json" });
		await ws.finishAttempt(state.runId, "task_1", "attempt_ghost", { status: "succeeded", phase: "succeeded" });
		// No attempt created, listAttempts should be empty
		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 0);
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P15: Expansion persistence ──

test("writeExpansion and readExpansion round-trip", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const record: import("../src/team/types.js").TaskExpansionRecord = {
			schemaVersion: "team/task-expansion-1",
			parentTaskId: "task_1",
			itemsFrom: "discover.items",
			expandedAt: new Date().toISOString(),
			children: [
				{ taskId: "task_1__item_01", sourceItemId: "item_01", title: "Process item_01" },
			],
		};
		await ws.writeExpansion(state.runId, record);
		const loaded = await ws.readExpansion(state.runId, "task_1");
		assert.ok(loaded);
		assert.equal(loaded.parentTaskId, "task_1");
		assert.equal(loaded.children.length, 1);
		assert.equal(loaded.children[0]!.taskId, "task_1__item_01");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("readExpansion returns null for missing expansion", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const loaded = await ws.readExpansion(state.runId, "nonexistent");
		assert.equal(loaded, null);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("expansion is stable across workspace re-instantiation", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws1 = new RunWorkspace(root);
		const state = await ws1.createRun(plan, "team_1");
		const record: import("../src/team/types.js").TaskExpansionRecord = {
			schemaVersion: "team/task-expansion-1",
			parentTaskId: "task_1",
			itemsFrom: "discover.items",
			expandedAt: new Date().toISOString(),
			children: [
				{ taskId: "task_1__x", sourceItemId: "x", title: "X" },
			],
		};
		await ws1.writeExpansion(state.runId, record);

		const ws2 = new RunWorkspace(root);
		const loaded = await ws2.readExpansion(state.runId, "task_1");
		assert.ok(loaded);
		assert.equal(loaded.children[0]!.taskId, "task_1__x");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("appendChildTaskStates adds child states and updates totalTasks", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		assert.equal(state.summary.totalTasks, 2);

		const children: import("../src/team/types.js").TeamTask[] = [
			{ id: "task_1__a", title: "A", input: { text: "a" }, acceptance: { rules: ["ok"] }, parentTaskId: "task_1", sourceItemId: "a", generated: true },
			{ id: "task_1__b", title: "B", input: { text: "b" }, acceptance: { rules: ["ok"] }, parentTaskId: "task_1", sourceItemId: "b", generated: true },
		];
		const updated = await ws.appendChildTaskStates(state.runId, children);
		assert.equal(updated.summary.totalTasks, 4);
		assert.equal(updated.taskStates["task_1__a"]?.status, "pending");
		assert.equal(updated.taskStates["task_1__b"]?.status, "pending");
		assert.equal(updated.taskStates["task_1"]?.status, "pending");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("appendChildTaskStates is idempotent for duplicate child ids", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const child: import("../src/team/types.js").TeamTask = {
			id: "task_1__dup", title: "Dup", input: { text: "d" }, acceptance: { rules: ["ok"] },
		};
		const u1 = await ws.appendChildTaskStates(state.runId, [child]);
		assert.equal(u1.summary.totalTasks, 3);
		const u2 = await ws.appendChildTaskStates(state.runId, [child]);
		assert.equal(u2.summary.totalTasks, 3);
	} finally {
		await rm(root, { recursive: true });
	}
});
