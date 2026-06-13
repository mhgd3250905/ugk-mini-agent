import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { RunArtifactStore } from "../src/team/run-workspace-artifacts.js";
import { RunAttemptStore } from "../src/team/run-workspace-attempts.js";
import { RunRecordStore } from "../src/team/run-workspace-records.js";
import { RunStateStore } from "../src/team/run-workspace-state.js";
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

test("RunWorkspace adapters preserve existing paths and facade compatibility", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const stateStore = new RunStateStore(root);
		const attemptStore = new RunAttemptStore(root);
		const artifactStore = new RunArtifactStore(root);
		const recordStore = new RunRecordStore(root, stateStore);
		const facade = new RunWorkspace(root);

		const state = await stateStore.createRun(plan, "team_1");
		const { attemptId } = await attemptStore.createAttempt(state.runId, "task_1");
		const acceptedRef = await attemptStore.writeAcceptedResult(state.runId, "task_1", attemptId, "accepted via adapter");
		assert.equal(acceptedRef, `tasks/task_1/attempts/${attemptId}/accepted-result.md`);
		assert.equal(await facade.readAttemptFile(state.runId, "task_1", attemptId, "accepted-result.md"), "accepted via adapter");

		const finalRef = await artifactStore.writeFinalReport(state.runId, "# Adapter final");
		assert.equal(finalRef, "final-report.md");
		assert.equal(await facade.readFinalReport(state.runId), "# Adapter final");

		const expansion: import("../src/team/types.js").TaskExpansionRecord = {
			schemaVersion: "team/task-expansion-1",
			parentTaskId: "task_1",
			itemsFrom: "discover.items",
			expandedAt: "2026-05-21T00:00:00.000Z",
			children: [{ taskId: "task_1__a", sourceItemId: "a", title: "A" }],
		};
		await recordStore.writeExpansion(state.runId, expansion);
		assert.deepEqual(await facade.readExpansion(state.runId, "task_1"), expansion);

		const updated = await recordStore.appendChildTaskStates(state.runId, [
			{ id: "task_1__a", title: "A", input: { text: "a" }, acceptance: { rules: ["ok"] }, parentTaskId: "task_1", generated: true },
		]);
		assert.equal(updated.summary.totalTasks, 3);
		assert.equal((await facade.getState(state.runId))?.taskStates["task_1__a"]?.status, "pending");
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

test("concurrent saveState calls keep state readable and do not share temp files", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const writes = Array.from({ length: 20 }, (_, index) => {
			const next = {
				...state,
				status: "running" as const,
				currentTaskId: index % 2 === 0 ? "task_1" : "task_2",
				updatedAt: `2026-05-17T00:00:${String(index).padStart(2, "0")}.000Z`,
			};
			return ws.saveState(next);
		});

		await Promise.all(writes);

		const got = await ws.getState(state.runId);
		assert.ok(got);
		assert.equal(got.runId, state.runId);
		assert.equal(got.status, "running");
		assert.ok(got.taskStates["task_1"]);
		assert.ok(got.taskStates["task_2"]);
		const files = await import("node:fs/promises").then(fs => fs.readdir(join(root, "runs", state.runId)));
		assert.equal(files.filter(file => file.includes("state.json.") && file.endsWith(".tmp")).length, 0);
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
		assert.equal("roleProcesses" in a, false);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("recordAttemptRoleProcess persists worker/checker process snapshots", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");

		await ws.recordAttemptRoleProcess(state.runId, "task_1", attemptId, {
			role: "worker",
			profileId: "search",
			status: "running",
			startedAt: "2026-05-25T00:00:00.000Z",
			updatedAt: "2026-05-25T00:00:00.100Z",
			finishedAt: null,
			assistantText: {
				content: "我先搜索 GitHub 热榜。",
				updatedAt: "2026-05-25T00:00:00.090Z",
			},
			process: {
				title: "Worker process",
				narration: ["工具开始 · x-search"],
				currentAction: "工具开始 · x-search",
				kind: "tool",
				isComplete: false,
				entries: [{
					id: "process-1",
					kind: "tool",
					title: "工具开始",
					detail: "{\"q\":\"github trending\"}",
					createdAt: "2026-05-25T00:00:00.050Z",
					toolCallId: "tool_1",
					toolName: "x-search",
				}],
			},
		});
		await ws.recordAttemptRoleProcess(state.runId, "task_1", attemptId, {
			role: "checker",
			profileId: "main",
			status: "waiting",
			startedAt: null,
			updatedAt: "2026-05-25T00:00:00.100Z",
			finishedAt: null,
			process: null,
		});

		const attempts = await ws.listAttempts(state.runId, "task_1");
		const roleProcesses = attempts[0]!.roleProcesses;
		assert.equal(roleProcesses?.worker?.profileId, "search");
		assert.equal(roleProcesses?.worker?.status, "running");
		assert.equal(roleProcesses?.worker?.assistantText?.content, "我先搜索 GitHub 热榜。");
		assert.equal(roleProcesses?.worker?.process?.entries[0]?.toolName, "x-search");
		assert.equal(roleProcesses?.checker?.profileId, "main");
		assert.equal(roleProcesses?.checker?.status, "waiting");
		assert.equal(roleProcesses?.checker?.process, null);
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

test("expansion record file names encode parent task ids", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const record: import("../src/team/types.js").TaskExpansionRecord = {
			schemaVersion: "team/task-expansion-1",
			parentTaskId: "../escape",
			itemsFrom: "discover.items",
			expandedAt: new Date().toISOString(),
			children: [],
		};
		await ws.writeExpansion(state.runId, record);

		const loaded = await ws.readExpansion(state.runId, "../escape");
		assert.equal(loaded?.parentTaskId, "../escape");
		const raw = await readFile(join(root, "runs", state.runId, "expansions", "..%2Fescape.json"), "utf8");
		assert.match(raw, /discover\.items/);
		await assert.rejects(() => readFile(join(root, "runs", state.runId, "escape.json"), "utf8"));
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

// ── P15 Review Fix: Full child task persistence ──

test("expansion record persists full generated child task definitions", async () => {
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
				{
					taskId: "task_1__a",
					sourceItemId: "a",
					title: "Process Alpha",
					task: {
						id: "task_1__a",
						type: "normal",
						title: "Process Alpha",
						input: { text: "Detailed analysis for item Alpha with context" },
						acceptance: { rules: ["report mentions Alpha", "includes risk score"] },
						parentTaskId: "task_1",
						sourceItemId: "a",
						generated: true,
					},
				},
			],
		};
		await ws.writeExpansion(state.runId, record);
		const loaded = await ws.readExpansion(state.runId, "task_1");
		assert.ok(loaded);
		assert.equal(loaded.children[0]!.taskId, "task_1__a");
		const child = loaded.children[0];
		assert.ok("task" in child && child.task, "expansion record should include full task definition");
		assert.equal(child.task!.input.text, "Detailed analysis for item Alpha with context");
		assert.deepEqual(child.task!.acceptance.rules, ["report mentions Alpha", "includes risk score"]);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("expansion record with old minimal shape still reads without crashing", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		// Write old-format expansion without task field
		const record: import("../src/team/types.js").TaskExpansionRecord = {
			schemaVersion: "team/task-expansion-1",
			parentTaskId: "task_1",
			itemsFrom: "discover.items",
			expandedAt: new Date().toISOString(),
			children: [
				{ taskId: "task_1__old", sourceItemId: "old", title: "Old Format" },
			],
		};
		await ws.writeExpansion(state.runId, record);
		const loaded = await ws.readExpansion(state.runId, "task_1");
		assert.ok(loaded);
		assert.equal(loaded.children[0]!.taskId, "task_1__old");
		assert.equal(loaded.children[0]!.title, "Old Format");
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P21-B: decomposition record persistence ──

test("writeDecomposition writes record under decompositions directory", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const record: import("../src/team/types.js").TaskDecompositionRecord = {
			schemaVersion: "team/task-decomposition-1",
			parentTaskId: "task_1",
			mode: "leaf",
			decision: "split",
			reason: "task is too broad",
			decomposedAt: "2026-05-17T00:00:00.000Z",
			children: [
				{
					taskId: "task_1__child",
					title: "Child",
					task: { id: "task_1__child", title: "Child", input: { text: "do child" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
				},
			],
		};
		await ws.writeDecomposition(state.runId, record);
		const raw = await readFile(join(root, "runs", state.runId, "decompositions", "task_1.json"), "utf8");
		assert.match(raw, /team\/task-decomposition-1/);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("readDecomposition returns full child task definitions and runtime context", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const record: import("../src/team/types.js").TaskDecompositionRecord = {
			schemaVersion: "team/task-decomposition-1",
			parentTaskId: "task_1",
			mode: "propagate",
			decision: "split",
			reason: "needs independent evidence collection",
			decomposedAt: "2026-05-17T00:00:00.000Z",
			children: [
				{
					taskId: "task_1__collect_ips",
					title: "Collect IPs",
					task: {
						id: "task_1__collect_ips",
						title: "Collect IPs",
						input: { text: "Collect known IPs", payload: { source: "seed" } },
						acceptance: { rules: ["IPs listed", "sources cited"] },
						decomposer: { mode: "leaf", maxChildren: 3 },
						parentTaskId: "task_1",
						generated: true,
					},
				},
			],
			runtimeContext: {
				requestedProfileId: "decomposer-profile",
				resolvedProfileId: "main",
				fallbackUsed: true,
				fallbackReason: "profile_not_found",
			},
		};
		await ws.writeDecomposition(state.runId, record);
		const loaded = await ws.readDecomposition(state.runId, "task_1");
		assert.ok(loaded);
		assert.equal(loaded.children[0]!.task.input.text, "Collect known IPs");
		assert.deepEqual(loaded.children[0]!.task.acceptance.rules, ["IPs listed", "sources cited"]);
		assert.equal(loaded.children[0]!.task.decomposer?.mode, "leaf");
		assert.equal(loaded.runtimeContext?.requestedProfileId, "decomposer-profile");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("decomposition record file names encode parent task ids", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const record: import("../src/team/types.js").TaskDecompositionRecord = {
			schemaVersion: "team/task-decomposition-1",
			parentTaskId: "../escape",
			mode: "leaf",
			decision: "no_split",
			reason: "already small",
			decomposedAt: "2026-05-17T00:00:00.000Z",
			children: [],
		};
		await ws.writeDecomposition(state.runId, record);

		const loaded = await ws.readDecomposition(state.runId, "../escape");
		assert.equal(loaded?.parentTaskId, "../escape");
		const raw = await readFile(join(root, "runs", state.runId, "decompositions", "..%2Fescape.json"), "utf8");
		assert.match(raw, /already small/);
		await assert.rejects(() => readFile(join(root, "runs", state.runId, "escape.json"), "utf8"));
	} finally {
		await rm(root, { recursive: true });
	}
});

test("readDecomposition returns null for missing decomposition", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const loaded = await ws.readDecomposition(state.runId, "missing");
		assert.equal(loaded, null);
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P22: discovery result persistence ──

test("writeDiscoveryResult and readDiscoveryResult round-trip", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		const record: import("../src/team/types.js").TeamDiscoveryResultRecord = {
			schemaVersion: "team/discovery-result-1",
			taskId: "task_1",
			attemptId,
			outputKey: "items",
			items: [{ id: "battle_01", title: "Alpha" }, { id: "battle_02", title: "Beta" }],
			sourceRef: `tasks/task_1/attempts/${attemptId}/accepted-result.md`,
			createdAt: new Date().toISOString(),
		};
		const ref = await ws.writeDiscoveryResult(state.runId, "task_1", attemptId, record);
		assert.equal(ref, `tasks/task_1/attempts/${attemptId}/discovery-result.json`);

		const loaded = await ws.readDiscoveryResult(state.runId, "task_1", attemptId);
		assert.ok(loaded);
		assert.equal(loaded.schemaVersion, "team/discovery-result-1");
		assert.equal(loaded.taskId, "task_1");
		assert.equal(loaded.attemptId, attemptId);
		assert.equal(loaded.outputKey, "items");
		assert.equal(loaded.items.length, 2);
		assert.equal(loaded.items[0]!.id, "battle_01");
		assert.equal(loaded.sourceRef, `tasks/task_1/attempts/${attemptId}/accepted-result.md`);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("readDiscoveryResult returns null for missing file", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		const loaded = await ws.readDiscoveryResult(state.runId, "task_1", attemptId);
		assert.equal(loaded, null);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("discovery result file names encode task and attempt safely", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		const record: import("../src/team/types.js").TeamDiscoveryResultRecord = {
			schemaVersion: "team/discovery-result-1",
			taskId: "task_1",
			attemptId,
			outputKey: "items",
			items: [],
			sourceRef: null,
			createdAt: new Date().toISOString(),
		};
		const ref = await ws.writeDiscoveryResult(state.runId, "task_1", attemptId, record);
		assert.ok(ref.includes("task_1"));
		assert.ok(ref.includes(attemptId));
		assert.ok(ref.endsWith("discovery-result.json"));

		// File exists at expected location
		const raw = await readFile(join(root, "runs", state.runId, "tasks", "task_1", "attempts", attemptId, "discovery-result.json"), "utf8");
		assert.ok(raw.includes("team/discovery-result-1"));
	} finally {
		await rm(root, { recursive: true });
	}
});

test("old run without discovery result remains readable", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		// Write accepted result without discovery result
		await ws.writeAcceptedResult(state.runId, "task_1", attemptId, JSON.stringify({ items: [{ id: "a", title: "A" }] }));
		// readDiscoveryResult returns null, but attempt is still valid
		const discoveryResult = await ws.readDiscoveryResult(state.runId, "task_1", attemptId);
		assert.equal(discoveryResult, null);
		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		assert.equal(attempts[0]!.attemptId, attemptId);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("old run without decompositions directory still reads state and attempts", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		const loadedState = await ws.getState(state.runId);
		const attempts = await ws.listAttempts(state.runId, "task_1");
		const decomposition = await ws.readDecomposition(state.runId, "task_1");
		assert.equal(loadedState?.runId, state.runId);
		assert.equal(attempts[0]!.attemptId, attemptId);
		assert.equal(decomposition, null);
	} finally {
		await rm(root, { recursive: true });
	}
});


// ── P23 Task 1: sourceItem in expansion record ──

test("expansion record persists sourceItem on children", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const record: import("../src/team/types.js").TaskExpansionRecord = {
			schemaVersion: "team/task-expansion-1",
			parentTaskId: "task_1",
			itemsFrom: "discover.items",
			expandedAt: new Date().toISOString(),
			children: [{
				taskId: "task_1__battle_08",
				sourceItemId: "battle_08",
				sourceItem: { id: "battle_08", data: { id: "battle_08", title: "藏经阁大战" } },
				title: "Process battle_08",
				task: {
					id: "task_1__battle_08", type: "normal", title: "Process battle_08",
					input: { text: "Score battle_08" }, acceptance: { rules: ["ok"] },
					parentTaskId: "task_1", sourceItemId: "battle_08",
					sourceItem: { id: "battle_08", data: { id: "battle_08", title: "藏经阁大战" } },
					generated: true,
				},
			}],
		};
		await ws.writeExpansion(state.runId, record);
		const loaded = await ws.readExpansion(state.runId, "task_1");
		assert.ok(loaded);
		const child = loaded.children[0]!;
		assert.ok(child.sourceItem, "child entry should have sourceItem");
		assert.equal(child.sourceItem!.id, "battle_08");
		assert.equal(child.sourceItem!.data.title, "藏经阁大战");
		assert.ok(child.task?.sourceItem, "child task should have sourceItem");
		assert.equal(child.task!.sourceItem!.id, "battle_08");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("old expansion record without sourceItem still reads correctly", async () => {
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
				{ taskId: "task_1__old", sourceItemId: "old_item", title: "Old Format" },
			],
		};
		await ws.writeExpansion(state.runId, record);
		const loaded = await ws.readExpansion(state.runId, "task_1");
		assert.ok(loaded);
		assert.equal(loaded.children[0]!.taskId, "task_1__old");
		assert.equal(loaded.children[0]!.sourceItemId, "old_item");
		assert.equal(loaded.children[0]!.sourceItem, undefined, "old records have no sourceItem");
	} finally {
		await rm(root, { recursive: true });
	}
});
