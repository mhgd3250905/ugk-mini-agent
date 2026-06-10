import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TeamOrchestrator } from "../src/team/orchestrator.js";
import { PlanStore } from "../src/team/plan-store.js";
import { TeamUnitStore } from "../src/team/team-unit-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { MockRoleRunner } from "../src/team/role-runner.js";

test("P25: fallback report matches summary semantics with skipped tasks", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p25-t4-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "fallback test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
				{ id: "task_2", title: "t2", input: { text: "do 2" }, acceptance: { rules: ["r2"] } },
				{ id: "task_3", title: "t3", input: { text: "do 3" }, acceptance: { rules: ["r3"] } },
			],
			outputContract: { text: "output" },
		});

		// Runner that succeeds for worker but throws in finalizer
		class FinalizerCrashRunner extends MockRoleRunner {
			override async runFinalizer(): Promise<import("../src/team/role-runner.js").FinalizerOutput> {
				throw new Error("finalizer OOM");
			}
		}

		const runner = new FinalizerCrashRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		// First run: both succeed, then mark task_2 as skip and rerun
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		// Mark task_2 as skip
		const afterRun = (await workspace.getState(state.runId))!;
		afterRun.taskStates.task_2!.manualDisposition = "skip";
		afterRun.taskStates.task_2!.manualDispositionUpdatedAt = new Date().toISOString();
		await workspace.saveState(afterRun);

		// Rerun with skip
		await orchestrator.rerunRun(state.runId);
		const finalState = await orchestrator.runToCompletion(state.runId);

		// Run should complete_with_failures (because finalizer crashed)
		assert.equal(finalState.status, "completed_with_failures");
		assert.equal(finalState.summary.failedTasks, 0, "no tasks should be failed");
		assert.equal(finalState.summary.skippedTasks, 1, "one task should be skipped");
		assert.equal(finalState.summary.succeededTasks, 2, "two tasks should be succeeded");

		// Read fallback report
		const report = await readFile(join(root, "runs", state.runId, "final-report.md"), "utf8");

		// Verify fallback report content
		assert.ok(report.includes("task_1"), "report must mention task_1");
		assert.ok(report.includes("task_2"), "report must mention task_2");
		assert.ok(report.includes("task_3"), "report must mention task_3");
		assert.ok(report.includes("跳过"), "report must show skipped");
		const task2Lines = report.split("\n").filter(l => l.includes("task_2"));
		assert.ok(task2Lines.length > 0, "report must contain task_2 lines");
		assert.ok(task2Lines.some(l => l.includes("跳过")), "task_2 must show as skipped");
		assert.ok(task2Lines.every(l => !l.includes("失败")), "task_2 must NOT show as failed");
		assert.ok(report.includes("fallback"), "report must indicate it is a fallback");
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P25 review fix: fallback report includes generated/decomposed children ──
test("P25: fallback report includes generated child task not in plan.tasks", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p25-fallback-gen-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "fallback gen child test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "task_1", title: "parent", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
			],
			outputContract: { text: "output" },
		});

		class FinalizerCrashRunner extends MockRoleRunner {
			override async runFinalizer(): Promise<import("../src/team/role-runner.js").FinalizerOutput> {
				throw new Error("finalizer crash");
			}
		}

		const runner = new FinalizerCrashRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		// Inject a generated child task not in plan.tasks
		const afterRun = (await workspace.getState(state.runId))!;
		afterRun.taskStates["task_1__item_0"] = {
			status: "succeeded",
			attemptCount: 1,
			activeAttemptId: null,
			resultRef: "tasks/task_1__item_0/result.md",
			errorSummary: null,
			progress: { phase: "succeeded", message: "done", updatedAt: new Date().toISOString() },
		};
		afterRun.summary.totalTasks = 2;
		afterRun.summary.succeededTasks = 2;
		await workspace.saveState(afterRun);

		// Re-run finalizer path via rerunRun (task_1 succeeded so default keeps it)
		// Actually just force a finalizer crash by writing state and calling runToCompletion
		// But we need the finalizer to run — easiest: manually set status to trigger it
		const rerunState = await orchestrator.rerunRun(state.runId);
		const finalState = await orchestrator.runToCompletion(state.runId);

		const report = await readFile(join(root, "runs", state.runId, "final-report.md"), "utf8");
		assert.ok(report.includes("task_1__item_0"), "fallback report must include generated child task");
		assert.ok(report.includes("task_1"), "fallback report must include parent task");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("P25: fallback report includes previousErrorSummary for skipped tasks", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p25-fallback-prev-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "fallback prev error test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
				{ id: "task_2", title: "t2", input: { text: "do 2" }, acceptance: { rules: ["r2"] } },
			],
			outputContract: { text: "output" },
		});

		class FinalizerCrashRunner extends MockRoleRunner {
			override async runFinalizer(): Promise<import("../src/team/role-runner.js").FinalizerOutput> {
				throw new Error("finalizer crash");
			}
		}

		const runner = new FinalizerCrashRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		// Simulate failed task_2, mark skip, rerun
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

		await orchestrator.rerunRun(state.runId);
		await orchestrator.runToCompletion(state.runId);

		const report = await readFile(join(root, "runs", state.runId, "final-report.md"), "utf8");
		assert.ok(report.includes("task_2"), "fallback report must include task_2");
		assert.ok(report.includes("跳过"), "fallback report must show skipped status");
		assert.ok(report.includes("worker timeout"), "fallback report must show previousErrorSummary for skipped task");
	} finally {
		await rm(root, { recursive: true });
	}
});
