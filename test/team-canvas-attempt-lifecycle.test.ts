import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { CanvasTaskAttemptRunner } from "../src/team/canvas-task-attempt-runner.js";
import type {
	CheckerInput,
	CheckerOutput,
	DecomposerInput,
	DecomposerOutput,
	FinalizerInput,
	FinalizerOutput,
	TeamRoleRunner,
	WatcherInput,
	WatcherOutput,
	WorkerInput,
	WorkerOutput,
} from "../src/team/role-runner.js";
import type { TeamTask } from "../src/team/types.js";

const defaultPhaseTimeouts = { workerMs: 30_000, checkerMs: 15_000 };

function makeTask(overrides: Partial<TeamTask> = {}): TeamTask {
	return {
		id: "task_001",
		type: "normal",
		title: "Test task",
		input: { text: "Do something useful." },
		acceptance: { rules: ["output must be valid"] },
		...overrides,
	};
}

function makeWorkspace(root: string): RunWorkspace {
	return new RunWorkspace(join(root, "task-runs"));
}

async function setupAttempt(root: string, task: TeamTask = makeTask()): Promise<{ workspace: RunWorkspace; runId: string; attemptId: string; attemptRoot: string }> {
	const workspace = makeWorkspace(root);
	const plan = {
		schemaVersion: "team/plan-1" as const,
		planId: "test_plan",
		title: "Test",
		defaultTeamUnitId: "test_unit",
		goal: { text: "Test" },
		tasks: [task],
		outputContract: { text: "Output" },
		archived: false,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		runCount: 0,
	};
	const state = await workspace.createRun(plan, plan.defaultTeamUnitId);
	await workspace.saveState({ ...state, taskStates: { [task.id]: { ...state.taskStates[task.id]!, status: "running" } } });
	const { attemptId, attemptRoot } = await workspace.createAttempt(state.runId, task.id);
	await workspace.patchState(state.runId, (latest) => {
		const ts = latest.taskStates[task.id];
		if (ts) {
			ts.attemptCount += 1;
			ts.activeAttemptId = attemptId;
		}
	});
	return { workspace, runId: state.runId, attemptId, attemptRoot };
}

class PassRunner implements TeamRoleRunner {
	constructor(private readonly workerContent = "worker result", private readonly checkerVerdict: "pass" | "fail" | "revise" = "pass", private readonly checkerResultContent?: string) {}
	async runWorker(_input: WorkerInput): Promise<WorkerOutput> {
		return { content: this.workerContent, artifactRefs: [] };
	}
	async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
		return { verdict: this.checkerVerdict, reason: "ok", resultContent: this.checkerResultContent, feedback: this.checkerVerdict === "revise" ? "please fix" : undefined };
	}
	async runWatcher(_input: WatcherInput): Promise<WatcherOutput> { return { decision: "accept_task", reason: "ok" }; }
	async runFinalizer(_input: FinalizerInput): Promise<FinalizerOutput> { return { finalReport: "ok" }; }
	async runDecomposer(_input: DecomposerInput): Promise<DecomposerOutput> { return { decision: "no_split", reason: "ok", children: [] }; }
}

test("CanvasTaskAttemptRunner: success — worker and checker pass", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-canvas-attempt-"));
	try {
		const task = makeTask();
		const { workspace, runId, attemptId, attemptRoot } = await setupAttempt(root, task);
		const runner = new CanvasTaskAttemptRunner({
			workspace,
			dataDir: join(root, "task-runs"),
			maxCheckerRevisions: 3,
			phaseTimeouts: defaultPhaseTimeouts,
		});
		const controller = new AbortController();
		const outcome = await runner.runAttempt({
			runId, task, attemptId, attemptRoot,
			roleRunner: new PassRunner("worker output", "pass", "accepted content"),
			signal: controller.signal,
			workerProfileId: "worker_1",
			checkerProfileId: "checker_1",
		});
		assert.equal(outcome.status, "succeeded");
		assert.ok(outcome.resultRef);
		assert.equal(outcome.errorSummary, null);

		const attempts = await workspace.listAttempts(runId, task.id);
		assert.equal(attempts.length, 1);
		assert.equal(attempts[0]!.status, "succeeded");
		assert.equal(attempts[0]!.phase, "succeeded");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("CanvasTaskAttemptRunner: worker failure — worker throws error", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-canvas-attempt-"));
	try {
		const task = makeTask();
		const { workspace, runId, attemptId, attemptRoot } = await setupAttempt(root, task);
		const runner = new CanvasTaskAttemptRunner({
			workspace,
			dataDir: join(root, "task-runs"),
			maxCheckerRevisions: 3,
			phaseTimeouts: defaultPhaseTimeouts,
		});

		class FailWorkerRunner implements TeamRoleRunner {
			async runWorker(): Promise<WorkerOutput> { throw new Error("worker exploded"); }
			async runChecker(): Promise<CheckerOutput> { return { verdict: "pass", reason: "ok" }; }
			async runWatcher(): Promise<WatcherOutput> { return { decision: "accept_task", reason: "ok" }; }
			async runFinalizer(): Promise<FinalizerOutput> { return { finalReport: "ok" }; }
			async runDecomposer(): Promise<DecomposerOutput> { return { decision: "no_split", reason: "ok", children: [] }; }
		}

		const controller = new AbortController();
		await assert.rejects(
			() => runner.runAttempt({
				runId, task, attemptId, attemptRoot,
				roleRunner: new FailWorkerRunner(),
				signal: controller.signal,
				workerProfileId: "worker_1",
				checkerProfileId: "checker_1",
			}),
			/worker exploded/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("CanvasTaskAttemptRunner: checker rejection — revise then pass on second attempt", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-canvas-attempt-"));
	try {
		const task = makeTask();
		const { workspace, runId, attemptId, attemptRoot } = await setupAttempt(root, task);
		const runner = new CanvasTaskAttemptRunner({
			workspace,
			dataDir: join(root, "task-runs"),
			maxCheckerRevisions: 3,
			phaseTimeouts: defaultPhaseTimeouts,
		});

		let checkerCallCount = 0;
		class ReviseThenPassRunner implements TeamRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				return { content: input.feedback ? `revised: ${input.feedback}` : "initial output", artifactRefs: [] };
			}
			async runChecker(): Promise<CheckerOutput> {
				checkerCallCount++;
				if (checkerCallCount === 1) {
					return { verdict: "revise", reason: "needs improvement", feedback: "add more detail" };
				}
				return { verdict: "pass", reason: "looks good now" };
			}
			async runWatcher(): Promise<WatcherOutput> { return { decision: "accept_task", reason: "ok" }; }
			async runFinalizer(): Promise<FinalizerOutput> { return { finalReport: "ok" }; }
			async runDecomposer(): Promise<DecomposerOutput> { return { decision: "no_split", reason: "ok", children: [] }; }
		}

		const controller = new AbortController();
		const outcome = await runner.runAttempt({
			runId, task, attemptId, attemptRoot,
			roleRunner: new ReviseThenPassRunner(),
			signal: controller.signal,
			workerProfileId: "worker_1",
			checkerProfileId: "checker_1",
		});
		assert.equal(outcome.status, "succeeded");
		assert.equal(checkerCallCount, 2);

		const attempts = await workspace.listAttempts(runId, task.id);
		const attempt = attempts[0]!;
		assert.equal(attempt.worker!.length, 2, "two worker outputs (initial + revision)");
		assert.equal(attempt.checker!.length, 2, "two checker verdicts (revise + pass)");
		assert.equal(attempt.checker![0]!.verdict, "revise");
		assert.equal(attempt.checker![1]!.verdict, "pass");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("CanvasTaskAttemptRunner: checker revision limit exceeded", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-canvas-attempt-"));
	try {
		const task = makeTask();
		const { workspace, runId, attemptId, attemptRoot } = await setupAttempt(root, task);
		const runner = new CanvasTaskAttemptRunner({
			workspace,
			dataDir: join(root, "task-runs"),
			maxCheckerRevisions: 2,
			phaseTimeouts: defaultPhaseTimeouts,
		});

		class AlwaysReviseRunner implements TeamRoleRunner {
			async runWorker(): Promise<WorkerOutput> { return { content: "output", artifactRefs: [] }; }
			async runChecker(): Promise<CheckerOutput> { return { verdict: "revise", reason: "not good enough", feedback: "try again" }; }
			async runWatcher(): Promise<WatcherOutput> { return { decision: "accept_task", reason: "ok" }; }
			async runFinalizer(): Promise<FinalizerOutput> { return { finalReport: "ok" }; }
			async runDecomposer(): Promise<DecomposerOutput> { return { decision: "no_split", reason: "ok", children: [] }; }
		}

		const controller = new AbortController();
		const outcome = await runner.runAttempt({
			runId, task, attemptId, attemptRoot,
			roleRunner: new AlwaysReviseRunner(),
			signal: controller.signal,
			workerProfileId: "worker_1",
			checkerProfileId: "checker_1",
		});
		assert.equal(outcome.status, "failed");
		assert.equal(outcome.errorSummary, "checker revision limit exceeded");
		assert.ok(outcome.resultRef);

		const attempts = await workspace.listAttempts(runId, task.id);
		assert.equal(attempts[0]!.errorSummary, "checker revision limit exceeded");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("CanvasTaskAttemptRunner: checker fail verdict", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-canvas-attempt-"));
	try {
		const task = makeTask();
		const { workspace, runId, attemptId, attemptRoot } = await setupAttempt(root, task);
		const runner = new CanvasTaskAttemptRunner({
			workspace,
			dataDir: join(root, "task-runs"),
			maxCheckerRevisions: 3,
			phaseTimeouts: defaultPhaseTimeouts,
		});

		const controller = new AbortController();
		const outcome = await runner.runAttempt({
			runId, task, attemptId, attemptRoot,
			roleRunner: new PassRunner("output", "fail"),
			signal: controller.signal,
			workerProfileId: "worker_1",
			checkerProfileId: "checker_1",
		});
		assert.equal(outcome.status, "failed");
		assert.equal(outcome.errorSummary, "ok");
		assert.ok(outcome.resultRef);

		const attempts = await workspace.listAttempts(runId, task.id);
		assert.equal(attempts[0]!.status, "failed");
		assert.equal(attempts[0]!.checker!.length, 1);
		assert.equal(attempts[0]!.checker![0]!.verdict, "fail");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("CanvasTaskAttemptRunner: cancel — aborted signal returns failed outcome", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-canvas-attempt-"));
	try {
		const task = makeTask();
		const { workspace, runId, attemptId, attemptRoot } = await setupAttempt(root, task);
		const runner = new CanvasTaskAttemptRunner({
			workspace,
			dataDir: join(root, "task-runs"),
			maxCheckerRevisions: 3,
			phaseTimeouts: defaultPhaseTimeouts,
		});

		const controller = new AbortController();

		class HangingWorkerRunner implements TeamRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				return new Promise<never>((_, reject) => {
					if (input.signal?.aborted) { reject(new Error("aborted")); return; }
					input.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
				});
			}
			async runChecker(): Promise<CheckerOutput> { return { verdict: "pass", reason: "ok" }; }
			async runWatcher(): Promise<WatcherOutput> { return { decision: "accept_task", reason: "ok" }; }
			async runFinalizer(): Promise<FinalizerOutput> { return { finalReport: "ok" }; }
			async runDecomposer(): Promise<DecomposerOutput> { return { decision: "no_split", reason: "ok", children: [] }; }
		}

		const runPromise = runner.runAttempt({
			runId, task, attemptId, attemptRoot,
			roleRunner: new HangingWorkerRunner(),
			signal: controller.signal,
			workerProfileId: "worker_1",
			checkerProfileId: "checker_1",
		});

		await new Promise(resolve => setTimeout(resolve, 25));
		controller.abort(new Error("user cancel"));

		await assert.rejects(() => runPromise, /cancel|abort/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("CanvasTaskAttemptRunner: cancel active processes flushes recorder state", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-canvas-attempt-"));
	try {
		const task = makeTask();
		const { workspace, runId, attemptId, attemptRoot } = await setupAttempt(root, task);
		const runner = new CanvasTaskAttemptRunner({
			workspace,
			dataDir: join(root, "task-runs"),
			maxCheckerRevisions: 3,
			phaseTimeouts: defaultPhaseTimeouts,
		});

		const controller = new AbortController();

		class SlowWorkerRunner implements TeamRoleRunner {
			async runWorker(): Promise<WorkerOutput> {
				await new Promise(resolve => setTimeout(resolve, 2000));
				return { content: "late result", artifactRefs: [] };
			}
			async runChecker(): Promise<CheckerOutput> { return { verdict: "pass", reason: "ok" }; }
			async runWatcher(): Promise<WatcherOutput> { return { decision: "accept_task", reason: "ok" }; }
			async runFinalizer(): Promise<FinalizerOutput> { return { finalReport: "ok" }; }
			async runDecomposer(): Promise<DecomposerOutput> { return { decision: "no_split", reason: "ok", children: [] }; }
		}

		const runPromise = runner.runAttempt({
			runId, task, attemptId, attemptRoot,
			roleRunner: new SlowWorkerRunner(),
			signal: controller.signal,
			workerProfileId: "worker_1",
			checkerProfileId: "checker_1",
		});

		await new Promise(resolve => setTimeout(resolve, 25));
		await runner.cancelActiveProcesses(runId, "user cancel");
		controller.abort(new Error("user cancel"));

		await assert.rejects(() => runPromise, /cancel|abort/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("CanvasTaskAttemptRunner: role process metadata preserved in attempt", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-canvas-attempt-"));
	try {
		const task = makeTask();
		const { workspace, runId, attemptId, attemptRoot } = await setupAttempt(root, task);
		const runner = new CanvasTaskAttemptRunner({
			workspace,
			dataDir: join(root, "task-runs"),
			maxCheckerRevisions: 3,
			phaseTimeouts: defaultPhaseTimeouts,
		});

		class ProcessEmitRunner implements TeamRoleRunner {
			async runWorker(input: import("../src/team/role-runner.js").WorkerInput & { onSessionEvent?: (event: unknown) => void }): Promise<WorkerOutput> {
				input.onSessionEvent?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Worker thinking..." } });
				return { content: "done", artifactRefs: [] };
			}
			async runChecker(input: import("../src/team/role-runner.js").CheckerInput & { onSessionEvent?: (event: unknown) => void }): Promise<CheckerOutput> {
				input.onSessionEvent?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Checker reviewing..." } });
				return { verdict: "pass", reason: "ok" };
			}
			async runWatcher(): Promise<WatcherOutput> { return { decision: "accept_task", reason: "ok" }; }
			async runFinalizer(): Promise<FinalizerOutput> { return { finalReport: "ok" }; }
			async runDecomposer(): Promise<DecomposerOutput> { return { decision: "no_split", reason: "ok", children: [] }; }
		}

		const controller = new AbortController();
		const outcome = await runner.runAttempt({
			runId, task, attemptId, attemptRoot,
			roleRunner: new ProcessEmitRunner(),
			signal: controller.signal,
			workerProfileId: "worker_profile",
			checkerProfileId: "checker_profile",
		});
		assert.equal(outcome.status, "succeeded");

		const attempts = await workspace.listAttempts(runId, task.id);
		const attempt = attempts[0]!;
		const workerProcess = attempt.roleProcesses?.worker;
		assert.equal(workerProcess?.profileId, "worker_profile");
		assert.equal(workerProcess?.status, "succeeded");
		assert.match(workerProcess?.assistantText?.content ?? "", /Worker thinking/);
		assert.ok(workerProcess?.process?.isComplete);

		const checkerProcess = attempt.roleProcesses?.checker;
		assert.equal(checkerProcess?.profileId, "checker_profile");
		assert.equal(checkerProcess?.status, "succeeded");
		assert.match(checkerProcess?.assistantText?.content ?? "", /Checker reviewing/);
		assert.ok(checkerProcess?.process?.isComplete);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
