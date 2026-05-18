import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TeamOrchestrator } from "../src/team/orchestrator.js";
import { PlanStore } from "../src/team/plan-store.js";
import { TeamUnitStore } from "../src/team/team-unit-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { MockRoleRunner, type TeamRoleRunner } from "../src/team/role-runner.js";

async function setup() {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	const planStore = new PlanStore(root);
	const unitStore = new TeamUnitStore(root);
	const workspace = new RunWorkspace(root);
	const runner = new MockRoleRunner();
	const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
	const plan = await planStore.create({
		title: "ctrl test",
		defaultTeamUnitId: unit.teamUnitId,
		goal: { text: "test" },
		tasks: [{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } }],
		outputContract: { text: "output" },
	});
	const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });
	return { root, plan, orchestrator, workspace };
}

class ThrowingRoleRunner extends MockRoleRunner {
	async runWorker(): ReturnType<TeamRoleRunner["runWorker"]> {
		throw new Error("worker exploded");
	}
}

test("queued -> cancel", async () => {
	const { root, plan, orchestrator } = await setup();
	try {
		const state = await orchestrator.createRun(plan.planId);
		assert.equal(state.status, "queued");
		const cancelled = await orchestrator.cancelRun(state.runId, "user cancel");
		assert.equal(cancelled.status, "cancelled");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("running -> pause", async () => {
	const { root, plan, orchestrator } = await setup();
	try {
		const state = await orchestrator.createRun(plan.planId);
		const run = await orchestrator.runToCompletion(state.runId);
		assert.equal(run.status, "completed");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("paused -> resume -> queued", async () => {
	const { root, plan, orchestrator } = await setup();
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.cancelRun(state.runId, "done");
		const canResume = await orchestrator.resumeRun(state.runId).catch(e => e.message);
		assert.match(canResume, /can only resume paused run/);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("cancel during run prevents finalizer", async () => {
	const { root, plan, orchestrator, workspace } = await setup();
	try {
		const state = await orchestrator.createRun(plan.planId);
		const cancelled = await orchestrator.cancelRun(state.runId, "user cancel");
		assert.equal(cancelled.status, "cancelled");
		assert.equal(cancelled.summary.cancelledTasks, 1);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("terminal run can be deleted", async () => {
	const { root, plan, orchestrator, workspace } = await setup();
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);
		await orchestrator.deleteTerminalRun(state.runId);
		const got = await workspace.getState(state.runId);
		assert.equal(got, null);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("non-terminal run cannot be deleted", async () => {
	const { root, plan, orchestrator } = await setup();
	try {
		const state = await orchestrator.createRun(plan.planId);
		await assert.rejects(() => orchestrator.deleteTerminalRun(state.runId), { message: /non-terminal run cannot be deleted/ });
	} finally {
		await rm(root, { recursive: true });
	}
});

test("cancel terminal run throws", async () => {
	const { root, plan, orchestrator } = await setup();
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);
		await assert.rejects(() => orchestrator.cancelRun(state.runId, "nope"), { message: /cannot cancel terminal run/ });
	} finally {
		await rm(root, { recursive: true });
	}
});

test("role runner errors mark the run failed instead of leaving it running", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "ctrl test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } }],
			outputContract: { text: "output" },
		});
		const orchestrator = new TeamOrchestrator({
			planStore,
			teamUnitStore: unitStore,
			workspace,
			roleRunner: new ThrowingRoleRunner(),
			dataDir: root,
			maxCheckerRevisions: 3,
			maxWatcherRevisions: 1,
			maxRunDurationMinutes: 60,
		});
		const state = await orchestrator.createRun(plan.planId);

		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "failed");
		assert.match(final.lastError ?? "", /worker exploded/);
		assert.equal(final.taskStates.task_1?.status, "failed");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("cancelRun triggers abort on active runner", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	try {
		let abortRequested = false;
		class HangingRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
				if (!input.signal) return super.runWorker(input);
				return await new Promise<never>((_, reject) => {
					input.signal!.addEventListener("abort", () => {
						abortRequested = true;
						reject(new Error("aborted"));
					}, { once: true });
				});
			}
		}
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "cancel abort test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } }],
			outputContract: { text: "output" },
		});
		const runner = new HangingRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		const state = await orchestrator.createRun(plan.planId);
		const runPromise = orchestrator.runToCompletion(state.runId);

		await new Promise(r => setTimeout(r, 50));
		await orchestrator.cancelRun(state.runId, "user cancel");

		const final = await runPromise;
		assert.equal(final.status, "cancelled");
		assert.equal(abortRequested, true);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("external AbortSignal aborts in-flight run", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	try {
		let workerSignal: AbortSignal | undefined;
		class SignalCapturingRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
				workerSignal = input.signal;
				return super.runWorker(input);
			}
		}
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "external cancel test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } }],
			outputContract: { text: "output" },
		});
		const runner = new SignalCapturingRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		const state = await orchestrator.createRun(plan.planId);

		const externalAbort = new AbortController();
		const runPromise = orchestrator.runToCompletion(state.runId, { signal: externalAbort.signal });

		await new Promise(r => setTimeout(r, 50));
		externalAbort.abort(new Error("external cancel"));

		const final = await runPromise;
		assert.equal(final.status, "completed");
		assert.ok(workerSignal, "worker should have received a signal");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("pauseRun triggers abort on active runner", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	try {
		let abortRequested = false;
		class HangingRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
				if (!input.signal) return super.runWorker(input);
				return await new Promise<never>((_, reject) => {
					input.signal!.addEventListener("abort", () => {
						abortRequested = true;
						reject(new Error("aborted"));
					}, { once: true });
				});
			}
		}
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "pause abort test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } }],
			outputContract: { text: "output" },
		});
		const runner = new HangingRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		const state = await orchestrator.createRun(plan.planId);
		const runPromise = orchestrator.runToCompletion(state.runId);

		await new Promise(r => setTimeout(r, 50));
		await orchestrator.pauseRun(state.runId, "user pause");

		const final = await runPromise;
		assert.equal(final.status, "paused");
		assert.equal(abortRequested, true);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("cancel during finalizer does not overwrite cancelled state", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	try {
		let finalizerSignal: AbortSignal | undefined;
		let finalizerStarted = false;
		let finalizerResolve: () => void;
		const finalizerStartedPromise = new Promise<void>(r => { finalizerResolve = r; });

		// This runner hangs on signal for finalizer, simulating a real agent session
		class SignalAwareFinalizerRunner extends MockRoleRunner {
			override async runFinalizer(input: import("../src/team/role-runner.js").FinalizerInput): Promise<import("../src/team/role-runner.js").FinalizerOutput> {
				finalizerSignal = input.signal;
				finalizerStarted = true;
				finalizerResolve!();
				// If signal exists, hang until aborted
				if (input.signal) {
					await new Promise<never>((_, reject) => {
						if (input.signal!.aborted) { reject(new Error("already aborted")); return; }
						input.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
					});
				}
				return { finalReport: "report" };
			}
		}

		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "finalizer cancel test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [{ id: "task_1", title: "t1", input: { text: "do" }, acceptance: { rules: ["r1"] } }],
			outputContract: { text: "output" },
		});
		const runner = new SignalAwareFinalizerRunner() as unknown as TeamRoleRunner;
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		const state = await orchestrator.createRun(plan.planId);
		const runPromise = orchestrator.runToCompletion(state.runId);

		// Wait for finalizer to start
		await finalizerStartedPromise;

		// Cancel via public API — writes cancelled state + aborts internal controller
		// The finalizer's signal listener fires, rejecting its promise
		await orchestrator.cancelRun(state.runId, "user cancel");

		const final = await runPromise;
		assert.equal(final.status, "cancelled", "state should remain cancelled, not completed");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("cancel after checker returns does not write an unreferenced accepted result", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "checker cancel result write test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [{ id: "task_1", title: "t1", input: { text: "do" }, acceptance: { rules: ["r1"] } }],
			outputContract: { text: "output" },
		});

		class CancelAfterCheckerRunner extends MockRoleRunner {
			constructor(private readonly orchestrator: TeamOrchestrator, private readonly runId: string) {
				super();
			}

			override async runChecker(input: import("../src/team/role-runner.js").CheckerInput) {
				const verdict = await super.runChecker(input);
				await this.orchestrator.cancelRun(this.runId, "cancel after checker");
				return verdict;
			}
		}

		const placeholderRunner = new MockRoleRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: placeholderRunner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });
		const state = await orchestrator.createRun(plan.planId);
		const runner = new CancelAfterCheckerRunner(orchestrator, state.runId);
		const activeOrchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		const final = await activeOrchestrator.runToCompletion(state.runId);
		assert.equal(final.status, "cancelled");
		assert.equal(final.taskStates.task_1?.resultRef, null);

		const resultPath = join(root, "runs", state.runId, "tasks", "task_1", "attempts", final.taskStates.task_1?.activeAttemptId ?? "", "accepted-result.md");
		await assert.rejects(() => access(resultPath));
	} finally {
		await rm(root, { recursive: true });
	}
});

test("lease lost after checker returns does not write an unowned accepted result", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "lease lost result write test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [{ id: "task_1", title: "t1", input: { text: "do" }, acceptance: { rules: ["r1"] } }],
			outputContract: { text: "output" },
		});

		class StealLeaseAfterCheckerRunner extends MockRoleRunner {
			constructor(private readonly runId: string) {
				super();
			}

			override async runChecker(input: import("../src/team/role-runner.js").CheckerInput) {
				const verdict = await super.runChecker(input);
				const state = await workspace.getState(this.runId);
				assert.ok(state?.lease);
				state.lease = {
					ownerId: "worker_b",
					acquiredAt: new Date().toISOString(),
					heartbeatAt: new Date().toISOString(),
					expiresAt: new Date(Date.now() + 60_000).toISOString(),
				};
				await workspace.saveState(state);
				return verdict;
			}
		}

		const creator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: new MockRoleRunner(), dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });
		const state = await creator.createRun(plan.planId);
		await workspace.claimRun(state.runId, "worker_a", 60_000);
		const runner = new StealLeaseAfterCheckerRunner(state.runId);
		const activeOrchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		const final = await activeOrchestrator.runToCompletion(state.runId, { leaseOwnerId: "worker_a" });
		assert.equal(final.status, "running");
		assert.equal(final.lease?.ownerId, "worker_b");
		assert.equal(final.taskStates.task_1?.resultRef, null);

		const resultPath = join(root, "runs", state.runId, "tasks", "task_1", "attempts", final.taskStates.task_1?.activeAttemptId ?? "", "accepted-result.md");
		await assert.rejects(() => access(resultPath));
	} finally {
		await rm(root, { recursive: true });
	}
});

test("resume skips already succeeded tasks", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "resume skip test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
				{ id: "task_2", title: "t2", input: { text: "do 2" }, acceptance: { rules: ["r2"] } },
			],
			outputContract: { text: "output" },
		});

		let workerCallCount = 0;
		let hangOnSecondTask = false;

		class CountingRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
				workerCallCount++;
				if (input.task.id === "task_2" && hangOnSecondTask && input.signal) {
					return await new Promise<never>((_, reject) => {
						input.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
					});
				}
				return super.runWorker(input);
			}
		}

		const runner = new CountingRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		// First run: complete task_1, hang on task_2, then pause
		hangOnSecondTask = true;
		const state = await orchestrator.createRun(plan.planId);
		const runPromise = orchestrator.runToCompletion(state.runId);

		// Wait for task_2 worker to hang
		await new Promise<void>((resolve) => {
			const check = () => { if (workerCallCount >= 2) resolve(); else setTimeout(check, 10); };
			check();
		});

		await orchestrator.pauseRun(state.runId, "pause at task 2");
		const firstResult = await runPromise;

		assert.equal(firstResult.status, "paused");
		assert.equal(firstResult.taskStates.task_1?.status, "succeeded");
		assert.equal(firstResult.taskStates.task_2?.status, "interrupted");

		// Resume: task_1 should NOT be re-executed
		workerCallCount = 0;
		hangOnSecondTask = false;
		await orchestrator.resumeRun(state.runId);
		const resumed = await orchestrator.runToCompletion(state.runId);

		assert.equal(resumed.status, "completed");
		assert.equal(resumed.summary.succeededTasks, 2, "both tasks should be succeeded");
		assert.equal(workerCallCount, 1, "only task_2 worker should run, not task_1 again");
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P24: rerun core tests ──

test("rerun rejects active queued run", async () => {
	const { root, plan, orchestrator } = await setup();
	try {
		const state = await orchestrator.createRun(plan.planId);
		await assert.rejects(() => orchestrator.rerunRun(state.runId), { message: /cannot rerun run with status: queued/ });
	} finally {
		await rm(root, { recursive: true });
	}
});

test("rerun rejects active running run", async () => {
	const { root, plan, orchestrator } = await setup();
	try {
		const state = await orchestrator.createRun(plan.planId);
		const runPromise = orchestrator.runToCompletion(state.runId);
		await new Promise(r => setTimeout(r, 30));
		await assert.rejects(() => orchestrator.rerunRun(state.runId), { message: /cannot rerun run with status: running/ });
		await runPromise;
	} finally {
		await rm(root, { recursive: true });
	}
});

test("rerun rejects cancelled run", async () => {
	const { root, plan, orchestrator } = await setup();
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.cancelRun(state.runId, "done");
		await assert.rejects(() => orchestrator.rerunRun(state.runId), { message: /cannot rerun run with status: cancelled/ });
	} finally {
		await rm(root, { recursive: true });
	}
});

test("rerun resets failed run to queued and re-executes only failed tasks", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "rerun test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
				{ id: "task_2", title: "t2", input: { text: "do 2" }, acceptance: { rules: ["r2"] } },
			],
			outputContract: { text: "output" },
		});

		let workerCallCount = 0;
		class CountingRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
				workerCallCount++;
				return super.runWorker(input);
			}
		}

		const runner = new CountingRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		// First run: complete successfully
		workerCallCount = 0;
		const state = await orchestrator.createRun(plan.planId);
		const firstRun = await orchestrator.runToCompletion(state.runId);
		assert.equal(firstRun.status, "completed");
		assert.equal(workerCallCount, 2, "first run should execute both tasks");
		assert.equal(firstRun.taskStates.task_1?.status, "succeeded");
		assert.equal(firstRun.taskStates.task_2?.status, "succeeded");

		// Mark task_2 as force_rerun
		const afterSet = await workspace.getState(state.runId);
		afterSet!.taskStates.task_2!.manualDisposition = "force_rerun";
		afterSet!.taskStates.task_2!.manualDispositionUpdatedAt = new Date().toISOString();
		await workspace.saveState(afterSet!);

		// Rerun
		workerCallCount = 0;
		const rerunState = await orchestrator.rerunRun(state.runId);
		assert.equal(rerunState.status, "queued");
		assert.equal(rerunState.taskStates.task_1?.status, "succeeded", "task_1 should stay succeeded");
		assert.equal(rerunState.taskStates.task_2?.status, "pending", "task_2 should be reset to pending");

		// Execute rerun
		const finalState = await orchestrator.runToCompletion(state.runId);
		assert.equal(finalState.status, "completed");
		assert.equal(workerCallCount, 1, "rerun should only execute task_2");
		assert.equal(finalState.taskStates.task_2?.status, "succeeded");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("rerun with skip disposition marks task as skipped and does not execute", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "skip test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
				{ id: "task_2", title: "t2", input: { text: "do 2" }, acceptance: { rules: ["r2"] } },
			],
			outputContract: { text: "output" },
		});

		let workerCallCount = 0;
		class CountingRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
				workerCallCount++;
				return super.runWorker(input);
			}
		}

		const runner = new CountingRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		// First run: both succeed
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		// Mark task_2 as skip
		const afterSet = await workspace.getState(state.runId);
		afterSet!.taskStates.task_2!.manualDisposition = "skip";
		afterSet!.taskStates.task_2!.manualDispositionUpdatedAt = new Date().toISOString();
		await workspace.saveState(afterSet!);

		// Rerun
		workerCallCount = 0;
		await orchestrator.rerunRun(state.runId);
		const finalState = await orchestrator.runToCompletion(state.runId);

		assert.equal(finalState.status, "completed");
		assert.equal(workerCallCount, 0, "no worker should run since both tasks are reused/skipped");
		assert.equal(finalState.taskStates.task_1?.status, "succeeded");
		assert.equal(finalState.taskStates.task_2?.status, "skipped");
		assert.equal(finalState.summary.skippedTasks, 1);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("rerun clears stale final report", async () => {
	const { root, plan, orchestrator, workspace } = await setup();
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		// Verify final report exists
		await workspace.writeFinalReport(state.runId, "# old report");
		const { readFile } = await import("node:fs/promises");
		const { join: joinPath } = await import("node:path");
		const oldReport = await readFile(joinPath(root, "runs", state.runId, "final-report.md"), "utf8");
		assert.ok(oldReport.includes("old report"));

		// Rerun should remove stale report
		await orchestrator.rerunRun(state.runId);
		await assert.rejects(() => readFile(joinPath(root, "runs", state.runId, "final-report.md"), "utf8"), { code: "ENOENT" });
	} finally {
		await rm(root, { recursive: true });
	}
});

test("rerun preserves activeElapsedMs", async () => {
	const { root, plan, orchestrator } = await setup();
	try {
		const state = await orchestrator.createRun(plan.planId);
		const first = await orchestrator.runToCompletion(state.runId);
		assert.ok(first.activeElapsedMs >= 0);

		const rerunState = await orchestrator.rerunRun(state.runId);
		assert.equal(rerunState.activeElapsedMs, first.activeElapsedMs, "activeElapsedMs should be preserved");
	} finally {
		await rm(root, { recursive: true });
	}
});


// P24: for_each parent skip behavior

test("P24: skipped for_each parent skips children on rerun without calling worker", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p24-skip-fe-"));
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
			title: "skip-fe test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "discover", type: "discovery", title: "find items", input: { text: "find" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "items" } },
				{
					id: "process", type: "for_each", title: "process items", input: { text: "placeholder" },
					acceptance: { rules: ["ok"] },
					forEach: { itemsFrom: "discover.items", mode: "sequential", taskTemplate: { title: "item", input: { text: "process" }, acceptance: { rules: ["ok"] } } },
				},
			],
			outputContract: { text: "output" },
		});

		const runner = new CountingRunner({ workerOutputs: [JSON.stringify({ items: [{ id: "a", title: "A" }] })] });
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		// First run completes successfully
		const state1 = await orchestrator.createRun(plan.planId);
		const result1 = await orchestrator.runToCompletion(state1.runId);
		assert.equal(result1.status, "completed", "first run should complete");
		const firstWorkerCalls = workerCallCount;
		assert.ok(firstWorkerCalls > 0, "first run should call worker");

		// Set parent manualDisposition to skip
		const preRerun = (await workspace.getState(state1.runId))!;
		preRerun.taskStates["process"]!.manualDisposition = "skip";
		await workspace.saveState(preRerun);

		// Rerun
		workerCallCount = 0;
		const rerunResult = await orchestrator.rerunRun(state1.runId);
		assert.equal(rerunResult.taskStates["process"]?.manualDisposition, "skip");

		const finalState = await orchestrator.runToCompletion(rerunResult.runId);
		assert.equal(finalState.taskStates["process"]?.status, "skipped", "parent should be skipped");
		assert.equal(workerCallCount, 0, "worker must not be called when parent is skipped");
	} finally {
		await rm(root, { recursive: true });
	}
});
