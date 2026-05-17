import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TeamOrchestrator } from "../src/team/orchestrator.js";
import { PlanStore } from "../src/team/plan-store.js";
import { TeamUnitStore } from "../src/team/team-unit-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { MockRoleRunner, type TeamRoleRunner, type WorkerInput, type CheckerInput, type WatcherInput, type FinalizerInput } from "../src/team/role-runner.js";

async function setup() {
	const root = await mkdtemp(join(tmpdir(), "team-timeout-"));
	const planStore = new PlanStore(root);
	const unitStore = new TeamUnitStore(root);
	const workspace = new RunWorkspace(root);
	const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
	const plan = await planStore.create({
		title: "timeout test",
		defaultTeamUnitId: unit.teamUnitId,
		goal: { text: "test" },
		tasks: [{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } }],
		outputContract: { text: "output" },
	});
	return { root, plan, planStore, unitStore, workspace };
}

function readTimings(root: string, runId: string): Promise<string> {
	return readFile(join(root, "runs", runId, "timings.jsonl"), "utf8").catch(() => "");
}

/** Rejects with signal.reason when aborted, matching real AgentProfileRoleRunner behavior */
function hangOnSignal(signal: AbortSignal | undefined): Promise<never> {
	return new Promise<never>((_, reject) => {
		if (!signal) return reject(new Error("no signal"));
		if (signal.aborted) {
			reject(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason)));
			return;
		}
		signal.addEventListener("abort", () => {
			reject(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason)));
		}, { once: true });
	});
}

test("worker timing records real duration", async () => {
	const { root, plan, planStore, unitStore, workspace } = await setup();
	try {
		class DelayedWorker extends MockRoleRunner {
			override async runWorker(input: WorkerInput) {
				await new Promise(r => setTimeout(r, 30));
				return super.runWorker(input);
			}
		}
		const runner = new DelayedWorker();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });
		const state = await orchestrator.createRun(plan.planId);
		const result = await orchestrator.runToCompletion(state.runId);
		assert.equal(result.status, "completed");

		const timings = await readTimings(root, state.runId);
		const lines = timings.trim().split("\n").filter(Boolean);
		const workerSpan = lines.map(l => JSON.parse(l)).find((s: any) => s.phase === "worker");
		assert.ok(workerSpan, "worker timing span should exist");
		assert.ok(workerSpan.durationMs >= 15, `worker durationMs should be >= 15, got ${workerSpan.durationMs}`);
		assert.ok(workerSpan.startedAt !== workerSpan.finishedAt, "startedAt and finishedAt should differ");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("checker timing records real duration", async () => {
	const { root, plan, planStore, unitStore, workspace } = await setup();
	try {
		class DelayedChecker extends MockRoleRunner {
			override async runChecker(input: CheckerInput) {
				await new Promise(r => setTimeout(r, 30));
				return super.runChecker(input);
			}
		}
		const runner = new DelayedChecker();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });
		const state = await orchestrator.createRun(plan.planId);
		const result = await orchestrator.runToCompletion(state.runId);
		assert.equal(result.status, "completed");

		const timings = await readTimings(root, state.runId);
		const lines = timings.trim().split("\n").filter(Boolean);
		const checkerSpan = lines.map(l => JSON.parse(l)).find((s: any) => s.phase === "checker");
		assert.ok(checkerSpan, "checker timing span should exist");
		assert.ok(checkerSpan.durationMs >= 15, `checker durationMs should be >= 15, got ${checkerSpan.durationMs}`);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("watcher timing records real duration", async () => {
	const { root, plan, planStore, unitStore, workspace } = await setup();
	try {
		class DelayedWatcher extends MockRoleRunner {
			override async runWatcher(input: WatcherInput) {
				await new Promise(r => setTimeout(r, 30));
				return super.runWatcher(input);
			}
		}
		const runner = new DelayedWatcher();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });
		const state = await orchestrator.createRun(plan.planId);
		const result = await orchestrator.runToCompletion(state.runId);
		assert.equal(result.status, "completed");

		const timings = await readTimings(root, state.runId);
		const lines = timings.trim().split("\n").filter(Boolean);
		const watcherSpan = lines.map(l => JSON.parse(l)).find((s: any) => s.phase === "watcher");
		assert.ok(watcherSpan, "watcher timing span should exist");
		assert.ok(watcherSpan.durationMs >= 15, `watcher durationMs should be >= 15, got ${watcherSpan.durationMs}`);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("finalizer timing records real duration", async () => {
	const { root, plan, planStore, unitStore, workspace } = await setup();
	try {
		class DelayedFinalizer extends MockRoleRunner {
			override async runFinalizer(input: FinalizerInput) {
				await new Promise(r => setTimeout(r, 30));
				return super.runFinalizer(input);
			}
		}
		const runner = new DelayedFinalizer();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });
		const state = await orchestrator.createRun(plan.planId);
		const result = await orchestrator.runToCompletion(state.runId);
		assert.equal(result.status, "completed");

		const timings = await readTimings(root, state.runId);
		const lines = timings.trim().split("\n").filter(Boolean);
		const finalizerSpan = lines.map(l => JSON.parse(l)).find((s: any) => s.phase === "finalizer");
		assert.ok(finalizerSpan, "finalizer timing span should exist");
		assert.ok(finalizerSpan.durationMs >= 15, `finalizer durationMs should be >= 15, got ${finalizerSpan.durationMs}`);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("checker timeout writes failed state and does not hang", async () => {
	const { root, plan, planStore, unitStore, workspace } = await setup();
	try {
		class HangingChecker extends MockRoleRunner {
			override async runChecker(input: CheckerInput): Promise<any> {
				await hangOnSignal(input.signal);
			}
		}
		const runner = new HangingChecker();
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
			phaseTimeouts: { workerMs: 600_000, checkerMs: 100, watcherMs: 600_000, finalizerMs: 600_000 },
		});
		const state = await orchestrator.createRun(plan.planId);
		const result = await orchestrator.runToCompletion(state.runId);
		assert.equal(result.status, "completed_with_failures");
		assert.equal(result.taskStates.task_1?.status, "failed");
		assert.equal(result.taskStates.task_1?.errorSummary, "checker timeout");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("checker timeout resolves even when runner ignores AbortSignal", async () => {
	const { root, plan, planStore, unitStore, workspace } = await setup();
	try {
		class SignalIgnoringChecker extends MockRoleRunner {
			override async runChecker(_input: CheckerInput): Promise<any> {
				await new Promise(() => {});
			}
		}
		const runner = new SignalIgnoringChecker();
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
			phaseTimeouts: { workerMs: 600_000, checkerMs: 100, watcherMs: 600_000, finalizerMs: 600_000 },
		});
		const state = await orchestrator.createRun(plan.planId);
		const result = await orchestrator.runToCompletion(state.runId);
		assert.equal(result.status, "completed_with_failures");
		assert.equal(result.taskStates.task_1?.status, "failed");
		assert.equal(result.taskStates.task_1?.errorSummary, "checker timeout");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("watcher timeout resolves as confirm_failed and does not hang", async () => {
	const { root, plan, planStore, unitStore, workspace } = await setup();
	try {
		class HangingWatcher extends MockRoleRunner {
			override async runWatcher(input: WatcherInput): Promise<any> {
				await hangOnSignal(input.signal);
			}
		}
		const runner = new HangingWatcher();
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
			phaseTimeouts: { workerMs: 600_000, checkerMs: 600_000, watcherMs: 100, finalizerMs: 600_000 },
		});
		const state = await orchestrator.createRun(plan.planId);
		const result = await orchestrator.runToCompletion(state.runId);
		assert.equal(result.status, "completed_with_failures");
		assert.equal(result.taskStates.task_1?.status, "failed");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("finalizer timeout writes fallback report", async () => {
	const { root, plan, planStore, unitStore, workspace } = await setup();
	try {
		class HangingFinalizer extends MockRoleRunner {
			override async runFinalizer(input: FinalizerInput): Promise<any> {
				await hangOnSignal(input.signal);
			}
		}
		const runner = new HangingFinalizer();
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
			phaseTimeouts: { workerMs: 600_000, checkerMs: 600_000, watcherMs: 600_000, finalizerMs: 100 },
		});
		const state = await orchestrator.createRun(plan.planId);
		const result = await orchestrator.runToCompletion(state.runId);
		assert.equal(result.status, "completed_with_failures");
		assert.match(result.lastError ?? "", /finalizer timeout/);
		assert.equal(result.finalizerRuntimeContext, null);

		const report = await readFile(join(root, "runs", state.runId, "final-report.md"), "utf8");
		assert.ok(report.includes("fallback"), "should contain fallback report marker");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("cancel takes priority over watcher timeout", async () => {
	const { root, plan, planStore, unitStore, workspace } = await setup();
	try {
		let watcherStarted = false;
		let watcherResolve: () => void;
		const watcherStartedPromise = new Promise<void>(r => { watcherResolve = r; });

		class CancelWatcherRunner extends MockRoleRunner {
			override async runWatcher(input: WatcherInput): Promise<any> {
				watcherStarted = true;
				watcherResolve!();
				await hangOnSignal(input.signal);
			}
		}

		const runner = new CancelWatcherRunner() as unknown as TeamRoleRunner;
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
			phaseTimeouts: { workerMs: 600_000, checkerMs: 600_000, watcherMs: 600_000, finalizerMs: 600_000 },
		});
		const state = await orchestrator.createRun(plan.planId);
		const runPromise = orchestrator.runToCompletion(state.runId);

		await watcherStartedPromise;
		await orchestrator.cancelRun(state.runId, "user cancel");

		const result = await runPromise;
		assert.equal(result.status, "cancelled", "cancel should take priority, not timeout");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("pause takes priority over checker timeout", async () => {
	const { root, plan, planStore, unitStore, workspace } = await setup();
	try {
		let checkerStarted = false;
		let checkerResolve: () => void;
		const checkerStartedPromise = new Promise<void>(r => { checkerResolve = r; });

		class HangingCheckerRunner extends MockRoleRunner {
			override async runChecker(input: CheckerInput): Promise<any> {
				checkerStarted = true;
				checkerResolve!();
				await hangOnSignal(input.signal);
			}
		}

		const runner = new HangingCheckerRunner() as unknown as TeamRoleRunner;
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
			phaseTimeouts: { workerMs: 600_000, checkerMs: 600_000, watcherMs: 600_000, finalizerMs: 600_000 },
		});
		const state = await orchestrator.createRun(plan.planId);
		const runPromise = orchestrator.runToCompletion(state.runId);

		await checkerStartedPromise;
		await orchestrator.pauseRun(state.runId, "user pause");

		const result = await runPromise;
		assert.equal(result.status, "paused", "pause should take priority, not timeout");
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P20 Task 3: per-run timeout ──

test("state-level maxRunDurationMinutes overrides constructor default", async () => {
	const { root, planStore, unitStore, workspace } = await setup();
	try {
		// Create a 2-task plan so timeout can hit between tasks
		const plan = await planStore.create({
			title: "timeout override", defaultTeamUnitId: (await unitStore.list())[0]!.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
				{ id: "task_2", title: "t2", input: { text: "do 2" }, acceptance: { rules: ["r2"] } },
			],
			outputContract: { text: "output" },
		});
		// Slow worker to ensure elapsed time accumulates past the short timeout
		class SlowWorker extends MockRoleRunner {
			override async runWorker(input: WorkerInput) {
				await new Promise(r => setTimeout(r, 80));
				return super.runWorker(input);
			}
		}
		const runner = new SlowWorker();
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
		});
		const state = await orchestrator.createRun(plan.planId);
		// Patch state to set a very short timeout (0.003 min = 180ms, enough for 1 slow task but not 2)
		const patched = (await workspace.getState(state.runId))!;
		patched.maxRunDurationMinutes = 0.003;
		await workspace.saveState(patched);

		const result = await orchestrator.runToCompletion(state.runId);
		assert.equal(result.status, "failed");
		assert.equal(result.lastError, "run timeout");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("old state without maxRunDurationMinutes falls back to constructor default", async () => {
	const { root, plan, planStore, unitStore, workspace } = await setup();
	try {
		const runner = new MockRoleRunner();
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
		});
		const state = await orchestrator.createRun(plan.planId);
		// Old state: no maxRunDurationMinutes field
		const patched = (await workspace.getState(state.runId))!;
		delete (patched as any).maxRunDurationMinutes;
		await workspace.saveState(patched);

		const result = await orchestrator.runToCompletion(state.runId);
		assert.equal(result.status, "completed", "should complete normally with constructor default 60 min");
	} finally {
		await rm(root, { recursive: true });
	}
});
