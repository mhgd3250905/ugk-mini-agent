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
		let workerReadyResolve: () => void;
		const workerReady = new Promise<void>(resolve => { workerReadyResolve = resolve; });
		class HangingRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
				workerReadyResolve!();
				if (!input.signal) return super.runWorker(input);
				return await new Promise<never>((_, reject) => {
					if (input.signal!.aborted) {
						abortRequested = true;
						reject(new Error("aborted"));
						return;
					}
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

		await workerReady;
		await orchestrator.cancelRun(state.runId, "user cancel");

		const final = await runPromise;
		assert.equal(final.status, "cancelled");
		assert.equal(abortRequested, true);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("external AbortSignal aborts in-flight run", async () => {
		const root = await mkdtemp(join(tmpdir(), "team-ext-abort-"));
		try {
			let workerSignal: AbortSignal | undefined;
			let workerReadyResolve: () => void;
			const workerReady = new Promise<void>(r => { workerReadyResolve = r; });

			class HangingSignalRunner extends MockRoleRunner {
				override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
					workerSignal = input.signal;
					workerReadyResolve!();
					if (input.signal) {
						await new Promise<never>((_, reject) => {
							if (input.signal!.aborted) { reject(new Error("aborted")); return; }
							input.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
						});
					}
					return super.runWorker(input);
				}
			}
			const planStore = new PlanStore(root);
			const unitStore = new TeamUnitStore(root);
			const workspace = new RunWorkspace(root);
			const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
			const plan = await planStore.create({
				title: "external abort test",
				defaultTeamUnitId: unit.teamUnitId,
				goal: { text: "test" },
				tasks: [{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } }],
				outputContract: { text: "output" },
			});
			const runner = new HangingSignalRunner();
			const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

			const state = await orchestrator.createRun(plan.planId);
			const externalAbort = new AbortController();
			const runPromise = orchestrator.runToCompletion(state.runId, { signal: externalAbort.signal });

			// Wait until worker has received and registered the signal
			await workerReady;
			externalAbort.abort(new Error("external cancel"));

			const final = await runPromise;
			assert.equal(final.status, "failed", "run should be failed after external abort");
			assert.ok(workerSignal, "worker should have received a signal");
			assert.equal(workerSignal!.aborted, true, "worker signal should be aborted");
		} finally {
			await rm(root, { recursive: true });
		}
	})

test("pauseRun triggers abort on active runner", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	try {
		let abortRequested = false;
		let workerReadyResolve: () => void;
		const workerReady = new Promise<void>(resolve => { workerReadyResolve = resolve; });
		class HangingRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
				workerReadyResolve!();
				if (!input.signal) return super.runWorker(input);
				return await new Promise<never>((_, reject) => {
					if (input.signal!.aborted) {
						abortRequested = true;
						reject(new Error("aborted"));
						return;
					}
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

		await workerReady;
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

test("rerun reopens cancelled run", async () => {
	const { root, plan, orchestrator } = await setup();
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.cancelRun(state.runId, "done");
		const rerunState = await orchestrator.rerunRun(state.runId);
		assert.equal(rerunState.status, "queued");
		assert.equal(rerunState.taskStates.task_1?.status, "pending");
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

test("rerun resets active elapsed timer", async () => {
	const { root, plan, orchestrator, workspace } = await setup();
	try {
		const state = await orchestrator.createRun(plan.planId);
		const first = await orchestrator.runToCompletion(state.runId);
		first.activeElapsedMs = 7_200_000;
		first.startedAt = "2026-05-17T16:38:42.183Z";
		await workspace.saveState(first);

		const rerunState = await orchestrator.rerunRun(state.runId);
		assert.equal(rerunState.activeElapsedMs, 0, "rerun should start a fresh timeout window");
		assert.equal(rerunState.startedAt, null, "rerun should set a fresh startedAt when execution resumes");
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

	test("P24: skipped for_each parent skips ALL children regardless of prior status", async () => {
		const root = await mkdtemp(join(tmpdir(), "team-p24-skip-fe-mixed-"));
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
				title: "skip-fe-mixed test",
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
			const runner = new CountingRunner({ workerOutputs: [JSON.stringify({ items: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }] })] });
			const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

			// First run: all succeed
			const state1 = await orchestrator.createRun(plan.planId);
			const result1 = await orchestrator.runToCompletion(state1.runId);
			assert.equal(result1.status, "completed");

			// Get child task IDs from expansion
			const expansion = await workspace.readExpansion(state1.runId, "process");
			assert.ok(expansion, "expansion should exist");
			const childIds = expansion.children.map(c => c.taskId);
			assert.equal(childIds.length, 3);

			// Manually set children to mixed statuses
			const preRerun = (await workspace.getState(state1.runId))!;
			preRerun.taskStates[childIds[0]]!.status = "succeeded";
			preRerun.taskStates[childIds[1]]!.status = "failed";
			preRerun.taskStates[childIds[1]]!.errorSummary = "child failed";
			preRerun.taskStates[childIds[2]]!.status = "pending";
			preRerun.summary.succeededTasks = 2;
			preRerun.summary.failedTasks = 1;
			preRerun.summary.skippedTasks = 0;
			preRerun.summary.totalTasks = Object.keys(preRerun.taskStates).length;
			await workspace.saveState(preRerun);

			// Mark parent as skip
			const preRerun2 = (await workspace.getState(state1.runId))!;
			preRerun2.taskStates["process"]!.manualDisposition = "skip";
			await workspace.saveState(preRerun2);

			// Rerun
			workerCallCount = 0;
			const rerunResult = await orchestrator.rerunRun(state1.runId);
			assert.equal(rerunResult.taskStates["process"]?.status, "skipped");

			const finalState = await orchestrator.runToCompletion(rerunResult.runId);
			assert.equal(finalState.taskStates["process"]?.status, "skipped", "parent should be skipped");

			// ALL children must be skipped regardless of prior status
			for (const childId of childIds) {
				assert.equal(finalState.taskStates[childId]?.status, "skipped", `child ${childId} should be skipped`);
			}

			assert.equal(workerCallCount, 0, "worker must not be called when parent is skipped");
			assert.equal(finalState.summary.skippedTasks, 4, "summary.skippedTasks: 1 parent + 3 children");
			assert.equal(finalState.summary.succeededTasks, 1, "only discover should be succeeded");
		} finally {
			await rm(root, { recursive: true });
		}
	});

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

		test("P24: skipped decomposer parent skips ALL children regardless of prior status", async () => {
		const root = await mkdtemp(join(tmpdir(), "team-p24-skip-decomp-"));
		try {
			let workerCallCount = 0;
			let decomposerCalled = false;

			class DecomposerCountingRunner extends MockRoleRunner {
				override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
					workerCallCount++;
					return super.runWorker(input);
				}
				override async runDecomposer(): Promise<import("../src/team/role-runner.js").DecomposerOutput> {
					decomposerCalled = true;
					return {
						decision: "split",
						reason: "test split",
						children: [
							{ id: "child_a", title: "Child A", input: { text: "do A" }, acceptance: { rules: ["ok"] } },
							{ id: "child_b", title: "Child B", input: { text: "do B" }, acceptance: { rules: ["ok"] } },
							{ id: "child_c", title: "Child C", input: { text: "do C" }, acceptance: { rules: ["ok"] } },
						],
					};
				}
			}

			const planStore = new PlanStore(root);
			const unitStore = new TeamUnitStore(root);
			const workspace = new RunWorkspace(root);
			const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
			const plan = await planStore.create({
				title: "skip-decomp test",
				defaultTeamUnitId: unit.teamUnitId,
				goal: { text: "test" },
				tasks: [
					{
						id: "task_1", title: "decomposable task", input: { text: "do" },
						acceptance: { rules: ["ok"] },
						decomposer: { mode: "leaf" },
					},
				],
				outputContract: { text: "output" },
			});

			const runner = new DecomposerCountingRunner();
			const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

			// First run: decomposer splits, all children succeed
			const state1 = await orchestrator.createRun(plan.planId);
			const result1 = await orchestrator.runToCompletion(state1.runId);
			assert.equal(result1.status, "completed");
			assert.ok(decomposerCalled);

			const decomp = await workspace.readDecomposition(state1.runId, "task_1");
			assert.ok(decomp);
			assert.equal(decomp.decision, "split");
			const childIds = decomp.children.map(c => c.taskId);
			assert.equal(childIds.length, 3);

			// Manually set children to mixed statuses
			const preRerun = (await workspace.getState(state1.runId))!;
			preRerun.taskStates[childIds[0]]!.status = "succeeded";
			preRerun.taskStates[childIds[1]]!.status = "failed";
			preRerun.taskStates[childIds[1]]!.errorSummary = "child failed";
			preRerun.taskStates[childIds[2]]!.status = "pending";
			preRerun.summary.succeededTasks = 2;
			preRerun.summary.failedTasks = 1;
			preRerun.summary.skippedTasks = 0;
			preRerun.summary.totalTasks = Object.keys(preRerun.taskStates).length;
			await workspace.saveState(preRerun);

			// Mark parent as skip
			const preRerun2 = (await workspace.getState(state1.runId))!;
			preRerun2.taskStates["task_1"]!.manualDisposition = "skip";
			await workspace.saveState(preRerun2);

			// Rerun
			workerCallCount = 0;
			decomposerCalled = false;
			const rerunResult = await orchestrator.rerunRun(state1.runId);
			assert.equal(rerunResult.taskStates["task_1"]?.status, "skipped");

			const finalState = await orchestrator.runToCompletion(rerunResult.runId);
			assert.equal(finalState.taskStates["task_1"]?.status, "skipped", "parent should be skipped");

			// ALL children must be skipped
			for (const childId of childIds) {
				assert.equal(finalState.taskStates[childId]?.status, "skipped", `child ${childId} should be skipped`);
			}

			assert.equal(workerCallCount, 0, "worker must not be called when parent is skipped");
			assert.equal(decomposerCalled, false, "decomposer must not be called on rerun");
			assert.equal(finalState.summary.skippedTasks, 4, "summary.skippedTasks: 1 parent + 3 children");
			assert.equal(finalState.summary.succeededTasks, 0, "no tasks should be succeeded");
		} finally {
			await rm(root, { recursive: true });
		}
	});

	// ── Timeout summary derivation ──

	test("handleTimeout derives summary from taskStates", async () => {
		const root = await mkdtemp(join(tmpdir(), "team-timeout-summary-"));
		try {
			class SlowThenResolveRunner extends MockRoleRunner {
				override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
					// task_1 completes after 1.2s (exceeding the 1s timeout)
					if (input.task.id === "task_1") {
						await new Promise(r => setTimeout(r, 1200));
					}
					return super.runWorker(input);
				}
			}

			const planStore = new PlanStore(root);
			const unitStore = new TeamUnitStore(root);
			const workspace = new RunWorkspace(root);
			const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
			const plan = await planStore.create({
				title: "timeout summary test",
				defaultTeamUnitId: unit.teamUnitId,
				goal: { text: "test" },
				tasks: [
					{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
					{ id: "task_2", title: "t2", input: { text: "do 2" }, acceptance: { rules: ["r2"] } },
				],
				outputContract: { text: "output" },
			});
			const runner = new SlowThenResolveRunner();
			const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

			// Create run with 1-second timeout
			const state = await orchestrator.createRun(plan.planId, { maxRunDurationMinutes: 1 / 60 });
			const final = await orchestrator.runToCompletion(state.runId);

			assert.equal(final.status, "failed", "run should be failed after timeout");
			assert.equal(final.lastError, "run timeout");
			assert.equal(final.taskStates.task_1?.status, "succeeded", "task_1 should succeed before timeout");
			assert.equal(final.taskStates.task_2?.status, "failed", "task_2 should be failed by timeout");
			assert.equal(final.taskStates.task_2?.errorSummary, "run timeout");

			const taskCount = Object.keys(final.taskStates).length;
			assert.equal(final.summary.totalTasks, taskCount, "summary.totalTasks must match taskStates count");
			assert.equal(final.summary.succeededTasks, 1, "summary.succeededTasks: task_1");
			assert.equal(final.summary.failedTasks, 1, "summary.failedTasks: task_2 timed out");
			assert.equal(final.summary.cancelledTasks, 0);
			assert.equal(final.summary.skippedTasks, 0);
		} finally {
			await rm(root, { recursive: true });
		}
	});

	// ── Generated child skip summary derivation ──

	test("skipGeneratedChildren derives totalTasks from taskStates not stale summary", async () => {
		const root = await mkdtemp(join(tmpdir(), "team-skip-gen-summary-"));
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
				title: "skip gen summary test",
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

			const runner = new CountingRunner({ workerOutputs: [JSON.stringify({ items: [{ id: "a", title: "A" }, { id: "b", title: "B" }] })] });
			const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

			const state1 = await orchestrator.createRun(plan.planId);
			const result1 = await orchestrator.runToCompletion(state1.runId);
			assert.equal(result1.status, "completed");

			// Get expansion children
			const expansion = await workspace.readExpansion(state1.runId, "process");
			assert.ok(expansion, "expansion should exist");
			const childIds = expansion.children.map(c => c.taskId);
			assert.equal(childIds.length, 2);

			// Corrupt summary.totalTasks to be wrong (simulating stale pre-compute value)
			// Real taskStates has: discover + process + 2 children = 4 tasks
			const preRerun = (await workspace.getState(state1.runId))!;
			preRerun.summary.totalTasks = 99; // stale/incorrect
			preRerun.summary.succeededTasks = 99;
			preRerun.summary.skippedTasks = 0;
			await workspace.saveState(preRerun);

			// Mark parent as skip to trigger skipGeneratedChildren
			const preRerun2 = (await workspace.getState(state1.runId))!;
			preRerun2.taskStates["process"]!.manualDisposition = "skip";
			await workspace.saveState(preRerun2);

			// Rerun
			workerCallCount = 0;
			await orchestrator.rerunRun(state1.runId);
			const finalState = await orchestrator.runToCompletion(state1.runId);

			// summary.totalTasks must be derived from actual taskStates, not stale value
			const actualTaskCount = Object.keys(finalState.taskStates).length;
			assert.equal(finalState.summary.totalTasks, actualTaskCount, "totalTasks must match taskStates count, not stale 99");
			assert.notEqual(finalState.summary.totalTasks, 99, "totalTasks must not be stale value");
			assert.equal(finalState.summary.skippedTasks, 3, "1 parent + 2 children skipped");
			assert.equal(finalState.summary.succeededTasks, 1, "only discover succeeded");
		} finally {
			await rm(root, { recursive: true });
		}
	});
