import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TeamOrchestrator } from "../src/team/orchestrator.js";
import { PlanStore } from "../src/team/plan-store.js";
import { TeamUnitStore } from "../src/team/team-unit-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { MockRoleRunner } from "../src/team/role-runner.js";

// ── P25 Task 2: skipped task error semantics ──

test("P25: rerun skips previously failed task and clears errorSummary", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p25-t2-"));
	try {
		let workerCallCount = 0;
		class CountingRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
				workerCallCount++;
				return super.runWorker(input);
			}
		}

		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "skip error test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
				{ id: "task_2", title: "t2", input: { text: "do 2" }, acceptance: { rules: ["r2"] } },
			],
			outputContract: { text: "output" },
		});

		const runner = new CountingRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		// First run: complete successfully
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		// Simulate: set task_2 to failed with errorSummary, then mark skip
		const afterRun = (await workspace.getState(state.runId))!;
		afterRun.taskStates.task_2!.status = "failed";
		afterRun.taskStates.task_2!.errorSummary = "worker timeout";
		afterRun.taskStates.task_2!.resultRef = "tasks/task_2/attempts/att_old/result.md";
		afterRun.summary.succeededTasks = 1;
		afterRun.summary.failedTasks = 1;
		afterRun.summary.skippedTasks = 0;
		await workspace.saveState(afterRun);

		// Mark task_2 as skip
		const preRerun = (await workspace.getState(state.runId))!;
		preRerun.taskStates.task_2!.manualDisposition = "skip";
		preRerun.taskStates.task_2!.manualDispositionUpdatedAt = new Date().toISOString();
		await workspace.saveState(preRerun);

		// Rerun
		workerCallCount = 0;
		const rerunState = await orchestrator.rerunRun(state.runId);

		// Verify rerun state
		assert.equal(rerunState.taskStates.task_2!.status, "skipped", "task should be skipped after rerun");
		assert.equal(rerunState.taskStates.task_2!.errorSummary, null, "current errorSummary should be null for skipped task");
		assert.equal(rerunState.taskStates.task_2!.previousErrorSummary, "worker timeout", "previous error must be preserved as audit");
		assert.equal(rerunState.summary.skippedTasks, 1, "skipped count should be 1");
		assert.equal(rerunState.summary.failedTasks, 0, "failed count should be 0 since task was moved to skipped");
		assert.equal(rerunState.summary.succeededTasks, 1, "succeeded count unchanged");

		// Execute rerun to completion — verify final state
		const finalState = await orchestrator.runToCompletion(state.runId);
		assert.equal(finalState.status, "completed");
		assert.equal(finalState.taskStates.task_2!.status, "skipped");
		assert.equal(finalState.taskStates.task_2!.errorSummary, null, "skipped task must not have current errorSummary");
		assert.equal(finalState.taskStates.task_2!.previousErrorSummary, "worker timeout", "previous error must survive full run cycle");
		assert.equal(finalState.summary.failedTasks, 0, "no tasks should be failed");
		assert.equal(finalState.summary.skippedTasks, 1, "one task should be skipped");
		assert.equal(workerCallCount, 0, "no worker should run for skipped task");
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P25 review fix: old data without previousErrorSummary ──

test("P25: skipped task without previousErrorSummary field loads and runs", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p25-old-data-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "old data compat",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
			],
			outputContract: { text: "output" },
		});

		const runner = new MockRoleRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		// Simulate old persisted state: task_1 is skipped but has no previousErrorSummary field
		const afterRun = (await workspace.getState(state.runId))!;
		afterRun.taskStates.task_1!.status = "skipped";
		afterRun.taskStates.task_1!.errorSummary = null;
		// Explicitly delete to simulate old data
		delete (afterRun.taskStates.task_1! as unknown as Record<string, unknown>).previousErrorSummary;
		await workspace.saveState(afterRun);

		// Re-run should not throw
		const loaded = (await workspace.getState(state.runId))!;
		assert.equal(loaded.taskStates.task_1!.status, "skipped");
		// previousErrorSummary should be undefined (old data), not throw
		assert.equal(loaded.taskStates.task_1!.previousErrorSummary ?? null, null, "old data without previousErrorSummary should be null-safe");
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P25 review fix: finalizer receives previousErrorSummary via real rerun path ──

test("P25: finalizer input receives previousErrorSummary from real rerun path", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p25-finalizer-capture-"));
	try {
		let capturedInput: import("../src/team/role-runner.js").FinalizerInput | null = null;

		class CapturingFinalizerRunner extends MockRoleRunner {
			override async runFinalizer(input: import("../src/team/role-runner.js").FinalizerInput): Promise<import("../src/team/role-runner.js").FinalizerOutput> {
				capturedInput = input;
				return super.runFinalizer(input);
			}
		}

		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "finalizer capture test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
				{ id: "task_2", title: "t2", input: { text: "do 2" }, acceptance: { rules: ["r2"] } },
			],
			outputContract: { text: "output" },
		});

		const runner = new CapturingFinalizerRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		// First run: complete successfully
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		// Simulate: task_2 failed with error, then mark skip
		const afterRun = (await workspace.getState(state.runId))!;
		afterRun.taskStates.task_2!.status = "failed";
		afterRun.taskStates.task_2!.errorSummary = "worker timeout";
		afterRun.summary.succeededTasks = 1;
		afterRun.summary.failedTasks = 1;
		await workspace.saveState(afterRun);

		const preRerun = (await workspace.getState(state.runId))!;
		preRerun.taskStates.task_2!.manualDisposition = "skip";
		preRerun.taskStates.task_2!.manualDispositionUpdatedAt = new Date().toISOString();
		await workspace.saveState(preRerun);

		// Rerun and complete - finalizer will capture input
		await orchestrator.rerunRun(state.runId);
		await orchestrator.runToCompletion(state.runId);

		// Verify finalizer received the correct data
		assert.ok(capturedInput, "finalizer must have been called");
		const ci: import("../src/team/role-runner.js").FinalizerInput = capturedInput!;
		const task2Result = ci.taskResults.find((r: { taskId: string }) => r.taskId === "task_2");
		assert.ok(task2Result, "finalizer input must contain task_2");
		assert.equal(task2Result!.status, "skipped", "task_2 status in finalizer input");
		assert.equal(task2Result!.errorSummary, null, "task_2 errorSummary must be null in finalizer input");
		assert.equal(task2Result!.previousErrorSummary, "worker timeout", "task_2 previousErrorSummary must contain the original error");
		assert.equal(task2Result!.manualDisposition, "skip", "task_2 manualDisposition in finalizer input");
	} finally {
		await rm(root, { recursive: true });
	}
});
