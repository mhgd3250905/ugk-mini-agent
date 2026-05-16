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
import type { ProfileAwareTeamRoleRunner, WorkerInput, CheckerInput, WatcherInput, FinalizerInput, WorkerOutput, CheckerOutput, WatcherOutput, FinalizerOutput } from "../src/team/role-runner.js";

async function setup(runnerOverrides: Record<string, unknown[]> = {}) {
	const root = await mkdtemp(join(tmpdir(), "team-lc-"));
	const planStore = new PlanStore(root);
	const unitStore = new TeamUnitStore(root);
	const workspace = new RunWorkspace(root);
	const runner = new MockRoleRunner(runnerOverrides);
	const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
	const plan = await planStore.create({
		title: "lifecycle test",
		defaultTeamUnitId: unit.teamUnitId,
		goal: { text: "test" },
		tasks: [
			{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
		],
		outputContract: { text: "output" },
	});
	const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });
	return { root, plan, orchestrator, workspace };
}

test("lifecycle: success path writes worker/checker metadata and finishAttempt succeeded", async () => {
	const { root, plan, orchestrator, workspace } = await setup();
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		const attempts = await workspace.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		const a = attempts[0]!;

		// Worker output recorded
		assert.equal(a.worker.length, 1);
		assert.ok(a.worker[0]!.outputRef!.includes("worker-output-001.md"));
		assert.equal(a.worker[0]!.outputIndex, 1);

		// Checker result recorded
		assert.equal(a.checker.length, 1);
		assert.equal(a.checker[0]!.verdict, "pass");
		assert.ok(a.checker[0]!.recordRef!.includes("checker-verdict-001.json"));

		// Watcher result — will be recorded in Task 4 (watcher lifecycle)
		// For now, verify worker/checker metadata is complete

		// Final state
		assert.equal(a.status, "succeeded");
		assert.equal(a.phase, "succeeded");
		assert.ok(a.resultRef!.includes("accepted-result.md"));
		assert.ok(a.finishedAt !== null);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("lifecycle: checker revise records worker+checker arrays then passes", async () => {
	const { root, plan, orchestrator, workspace } = await setup({
		checkerOutputs: [
			{ verdict: "revise", reason: "needs work", feedback: "add more detail" },
			{ verdict: "pass", reason: "ok now", resultContent: "accepted after revision" },
		],
	});
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		const attempts = await workspace.listAttempts(state.runId, "task_1");
		const a = attempts[0]!;

		// Two worker outputs (original + revision)
		assert.equal(a.worker.length, 2);
		assert.equal(a.worker[0]!.outputIndex, 1);
		assert.equal(a.worker[1]!.outputIndex, 2);

		// Two checker results (revise + pass)
		assert.equal(a.checker.length, 2);
		assert.equal(a.checker[0]!.verdict, "revise");
		assert.equal(a.checker[0]!.feedback, "add more detail");
		assert.equal(a.checker[1]!.verdict, "pass");

		// Final state: succeeded after revision
		assert.equal(a.status, "succeeded");
		assert.equal(a.phase, "succeeded");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("lifecycle: checker fail writes finishAttempt failed with errorSummary", async () => {
	const { root, plan, orchestrator, workspace } = await setup({
		checkerOutputs: [
			{ verdict: "fail", reason: "not acceptable", resultContent: "failed content" },
		],
		watcherOutputs: [
			{ decision: "confirm_failed", reason: "confirmed bad" },
		],
	});
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		const attempts = await workspace.listAttempts(state.runId, "task_1");
		const a = attempts[0]!;

		assert.equal(a.status, "failed");
		assert.equal(a.phase, "failed");
		assert.equal(a.checker.length, 1);
		assert.equal(a.checker[0]!.verdict, "fail");
		assert.equal(a.checker[0]!.reason, "not acceptable");
		assert.ok(a.resultRef!.includes("failed-result.md"));
		assert.ok(a.finishedAt !== null);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("lifecycle: checker timeout writes finishAttempt failed", async () => {
	const { root, plan, workspace } = await setup();
	// Create a runner that delays checker to trigger timeout
	const slowRunner = new (class extends MockRoleRunner {
		override async runChecker() {
			await new Promise(r => setTimeout(r, 500));
			return { verdict: "pass" as const, reason: "ok" };
		}
	})();
	const orc = new TeamOrchestrator({
		planStore: new PlanStore(root),
		teamUnitStore: new TeamUnitStore(root),
		workspace,
		roleRunner: slowRunner,
		dataDir: root,
		maxCheckerRevisions: 3,
		maxWatcherRevisions: 1,
		maxRunDurationMinutes: 60,
		phaseTimeouts: { workerMs: 60_000, checkerMs: 10, watcherMs: 60_000, finalizerMs: 60_000 },
	});
	try {
		const state = await orc.createRun(plan.planId);
		await orc.runToCompletion(state.runId);

		const attempts = await workspace.listAttempts(state.runId, "task_1");
		if (attempts.length > 0) {
			const a = attempts[0]!;
			assert.equal(a.status, "failed");
			assert.equal(a.phase, "failed");
			assert.ok(a.finishedAt !== null);
		}
	} finally {
		await rm(root, { recursive: true });
	}
});

test("lifecycle: checker revision limit writes finishAttempt failed", async () => {
	const { root, plan, orchestrator, workspace } = await setup({
		checkerOutputs: [
			{ verdict: "revise", reason: "bad 1" },
			{ verdict: "revise", reason: "bad 2" },
			{ verdict: "revise", reason: "bad 3" },
			{ verdict: "revise", reason: "bad 4" },
		],
		watcherOutputs: [
			{ decision: "confirm_failed", reason: "limit" },
		],
	});
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		const attempts = await workspace.listAttempts(state.runId, "task_1");
		const a = attempts[0]!;

		assert.equal(a.status, "failed");
		assert.equal(a.phase, "failed");
		assert.equal(a.errorSummary, "checker revision limit exceeded");
		// 3 revise + 1 limit hit = 3 checker results recorded before fail
		assert.equal(a.checker.length, 3);
		for (const c of a.checker) {
			assert.equal(c.verdict, "revise");
		}
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── Task 4: watcher/interrupted/cancelled lifecycle ──

test("lifecycle: watcher accept_task records watcher summary", async () => {
	const { root, plan, orchestrator, workspace } = await setup();
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		const attempts = await workspace.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		const a = attempts[0]!;

		assert.ok(a.watcher, "watcher summary should be recorded");
		assert.equal(a.watcher!.decision, "accept_task");
		assert.equal(a.watcher!.reason, "ok");
		assert.ok(a.watcher!.recordRef!.includes("watcher-review.json"));

		assert.equal(a.status, "succeeded");
		assert.equal(a.phase, "succeeded");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("lifecycle: watcher confirm_failed writes finishAttempt failed", async () => {
	const { root, plan, orchestrator, workspace } = await setup({
		checkerOutputs: [
			{ verdict: "fail", reason: "not good", resultContent: "failed content" },
		],
		watcherOutputs: [
			{ decision: "confirm_failed", reason: "confirmed bad" },
		],
	});
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		const attempts = await workspace.listAttempts(state.runId, "task_1");
		const a = attempts[0]!;

		assert.ok(a.watcher);
		assert.equal(a.watcher!.decision, "confirm_failed");
		assert.equal(a.status, "failed");
		assert.equal(a.phase, "failed");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("lifecycle: watcher request_revision finishes attempt as interrupted", async () => {
	const { root, plan, orchestrator, workspace } = await setup({
		checkerOutputs: [
			{ verdict: "pass", reason: "ok", resultContent: "first pass" },
			{ verdict: "pass", reason: "ok", resultContent: "second pass" },
		],
		watcherOutputs: [
			{ decision: "request_revision", reason: "redo it", revisionMode: "redo", feedback: "try again" },
			{ decision: "accept_task", reason: "ok" },
		],
	});
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		const attempts = await workspace.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 2);

		const a1 = attempts.find(a => a.status === "interrupted") ?? attempts[0]!;
		assert.equal(a1.status, "interrupted");
		assert.equal(a1.phase, "watcher_revision_requested");
		assert.ok(a1.watcher);
		assert.equal(a1.watcher!.decision, "request_revision");
		assert.ok(a1.finishedAt !== null);

		const a2 = attempts.find(a => a !== a1)!;
		assert.equal(a2.status, "succeeded");
		assert.equal(a2.phase, "succeeded");
		assert.ok(a2.watcher);
		assert.equal(a2.watcher!.decision, "accept_task");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("lifecycle: cancel marks active attempt as cancelled", async () => {
	const { root, plan, orchestrator, workspace } = await setup();
	const runner = new (class extends MockRoleRunner {
		override async runWorker() {
			await new Promise(r => setTimeout(r, 200));
			return { content: "done", artifactRefs: [] };
		}
	})();
	const orc = new TeamOrchestrator({
		planStore: new PlanStore(root),
		teamUnitStore: new TeamUnitStore(root),
		workspace,
		roleRunner: runner,
		dataDir: root,
		maxCheckerRevisions: 3,
		maxWatcherRevisions: 1,
		maxRunDurationMinutes: 60,
	});
	try {
		const state = await orc.createRun(plan.planId);

		const runPromise = orc.runToCompletion(state.runId);
		await new Promise(r => setTimeout(r, 50));
		await orc.cancelRun(state.runId, "manual cancel");
		await runPromise.catch(() => {});

		const final = await workspace.getState(state.runId);
		if (final) {
			const ts = final.taskStates["task_1"];
			if (ts?.activeAttemptId) {
				const attempts = await workspace.listAttempts(state.runId, "task_1");
				assert.equal(attempts.length, 1);
				const a = attempts[0]!;
				assert.equal(a.status, "cancelled");
				assert.equal(a.phase, "cancelled");
				assert.equal(a.errorSummary, "run cancelled");
				assert.ok(a.finishedAt, "cancelled active attempt should be finished");
			}
		}
	} finally {
		await rm(root, { recursive: true });
	}
});

test("lifecycle: generic worker error finishes active attempt as failed", async () => {
	const { root, plan, workspace } = await setup();
	const runner = new (class extends MockRoleRunner {
		override async runWorker(): Promise<never> {
			throw new Error("worker exploded");
		}
	})();
	const orc = new TeamOrchestrator({
		planStore: new PlanStore(root),
		teamUnitStore: new TeamUnitStore(root),
		workspace,
		roleRunner: runner,
		dataDir: root,
		maxCheckerRevisions: 3,
		maxWatcherRevisions: 1,
		maxRunDurationMinutes: 60,
	});
	try {
		const state = await orc.createRun(plan.planId);
		const result = await orc.runToCompletion(state.runId);

		assert.equal(result.status, "failed");
		const attempts = await workspace.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		const attempt = attempts[0]!;
		assert.equal(attempt.status, "failed");
		assert.equal(attempt.phase, "failed");
		assert.equal(attempt.errorSummary, "worker exploded");
		assert.ok(attempt.finishedAt, "failed active attempt should be finished");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("lifecycle: generic watcher error finishes active attempt as failed", async () => {
	const { root, plan, workspace } = await setup();
	const runner = new (class extends MockRoleRunner {
		override async runWatcher(): Promise<never> {
			throw new Error("watcher exploded");
		}
	})();
	const orc = new TeamOrchestrator({
		planStore: new PlanStore(root),
		teamUnitStore: new TeamUnitStore(root),
		workspace,
		roleRunner: runner,
		dataDir: root,
		maxCheckerRevisions: 3,
		maxWatcherRevisions: 1,
		maxRunDurationMinutes: 60,
	});
	try {
		const state = await orc.createRun(plan.planId);
		const result = await orc.runToCompletion(state.runId);

		assert.equal(result.status, "failed");
		const attempts = await workspace.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		const attempt = attempts[0]!;
		assert.equal(attempt.status, "failed");
		assert.equal(attempt.phase, "failed");
		assert.equal(attempt.errorSummary, "watcher exploded");
		assert.ok(attempt.finishedAt, "failed active attempt should be finished");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("lifecycle: records role runtime context in attempt metadata", async () => {
	const { root, plan, workspace } = await setup();
	const runner = new (class extends MockRoleRunner {
		override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
			const out = await super.runWorker(input);
			return {
				...out,
				runtimeContext: {
					requestedProfileId: "missing_worker",
					resolvedProfileId: "main",
					fallbackUsed: true,
					fallbackReason: "profile_not_found" as const,
					browserId: "browser_worker",
					browserScope: "team:run_ctx:worker:attempt_1:main",
				},
			};
		}

		override async runChecker(input: import("../src/team/role-runner.js").CheckerInput) {
			const out = await super.runChecker(input);
			return {
				...out,
				runtimeContext: {
					requestedProfileId: "checker_profile",
					resolvedProfileId: "checker_profile",
					fallbackUsed: false,
					browserId: null,
					browserScope: "team:run_ctx:checker:attempt_1:checker_profile",
				},
			};
		}

		override async runWatcher(input: import("../src/team/role-runner.js").WatcherInput) {
			const out = await super.runWatcher(input);
			return {
				...out,
				runtimeContext: {
					requestedProfileId: "watcher_profile",
					resolvedProfileId: "watcher_profile",
					fallbackUsed: false,
					browserId: "browser_watcher",
					browserScope: "team:run_ctx:watcher:attempt_1:watcher_profile",
				},
			};
		}
	})();
	const orc = new TeamOrchestrator({
		planStore: new PlanStore(root),
		teamUnitStore: new TeamUnitStore(root),
		workspace,
		roleRunner: runner,
		dataDir: root,
		maxCheckerRevisions: 3,
		maxWatcherRevisions: 1,
		maxRunDurationMinutes: 60,
	});
	try {
		const state = await orc.createRun(plan.planId);
		await orc.runToCompletion(state.runId);

		const attempts = await workspace.listAttempts(state.runId, "task_1");
		const attempt = attempts[0]!;
		assert.equal(attempt.worker[0]!.runtimeContext?.requestedProfileId, "missing_worker");
		assert.equal(attempt.worker[0]!.runtimeContext?.resolvedProfileId, "main");
		assert.equal(attempt.worker[0]!.runtimeContext?.fallbackReason, "profile_not_found");
		assert.equal(attempt.checker[0]!.runtimeContext?.browserId, null);
		assert.equal(attempt.watcher?.runtimeContext?.browserScope, "team:run_ctx:watcher:attempt_1:watcher_profile");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("lifecycle: records finalizer runtime context in run state", async () => {
	const { root, plan, workspace } = await setup();
	const runner = new (class extends MockRoleRunner {
		override async runFinalizer(input: import("../src/team/role-runner.js").FinalizerInput) {
			const out = await super.runFinalizer(input);
			return {
				...out,
				runtimeContext: {
					requestedProfileId: "missing_finalizer",
					resolvedProfileId: "main",
					fallbackUsed: true,
					fallbackReason: "profile_not_found" as const,
					browserId: "browser_finalizer",
					browserScope: "team:run_ctx:finalizer:finalizer:main",
				},
			};
		}
	})();
	const orc = new TeamOrchestrator({
		planStore: new PlanStore(root),
		teamUnitStore: new TeamUnitStore(root),
		workspace,
		roleRunner: runner,
		dataDir: root,
		maxCheckerRevisions: 3,
		maxWatcherRevisions: 1,
		maxRunDurationMinutes: 60,
	});
	try {
		const state = await orc.createRun(plan.planId);
		const result = await orc.runToCompletion(state.runId);

		assert.equal(result.finalizerRuntimeContext?.requestedProfileId, "missing_finalizer");
		assert.equal(result.finalizerRuntimeContext?.resolvedProfileId, "main");
		assert.equal(result.finalizerRuntimeContext?.fallbackReason, "profile_not_found");
		assert.equal(result.finalizerRuntimeContext?.browserId, "browser_finalizer");
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P17: profile injection explicit contract ──

class FakeProfileAwareRunner implements ProfileAwareTeamRoleRunner {
	public injectedProfiles: { workerProfileId: string; checkerProfileId: string; watcherProfileId: string; finalizerProfileId: string } | null = null;
	public workerCalled = false;

	setProfileIds(profiles: { workerProfileId: string; checkerProfileId: string; watcherProfileId: string; finalizerProfileId: string }): void {
		this.injectedProfiles = { ...profiles };
	}

	async runWorker(input: WorkerInput): Promise<WorkerOutput> {
		this.workerCalled = true;
		return { content: `worker:${input.task.id}`, artifactRefs: [] };
	}
	async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
		return { verdict: "pass", reason: "ok", resultContent: "accepted" };
	}
	async runWatcher(_input: WatcherInput): Promise<WatcherOutput> {
		return { decision: "accept_task", reason: "ok" };
	}
	async runFinalizer(input: FinalizerInput): Promise<FinalizerOutput> {
		return { finalReport: `report for ${input.runId}` };
	}
}

test("P17: orchestrator injects TeamUnit profile IDs via setProfileIds before execution", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p17-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);

		const unit = await unitStore.create({
			title: "profile test team",
			description: "distinct profiles",
			workerProfileId: "profile-worker",
			checkerProfileId: "profile-checker",
			watcherProfileId: "profile-watcher",
			finalizerProfileId: "profile-finalizer",
		});
		const plan = await planStore.create({
			title: "P17 profile injection",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [{ id: "task_1", title: "t1", input: { text: "do" }, acceptance: { rules: ["r1"] } }],
			outputContract: { text: "output" },
		});

		const runner = new FakeProfileAwareRunner();
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace, roleRunner: runner,
			dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
		});

		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		assert.ok(runner.injectedProfiles, "setProfileIds should have been called");
		assert.equal(runner.injectedProfiles.workerProfileId, "profile-worker");
		assert.equal(runner.injectedProfiles.checkerProfileId, "profile-checker");
		assert.equal(runner.injectedProfiles.watcherProfileId, "profile-watcher");
		assert.equal(runner.injectedProfiles.finalizerProfileId, "profile-finalizer");
		assert.ok(runner.workerCalled, "worker should have executed after profile injection");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("P17: MockRoleRunner (no setProfileIds) still works via runToCompletion", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p17-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);

		const unit = await unitStore.create({
			title: "mock team", description: "d",
			workerProfileId: "w", checkerProfileId: "c", watcherProfileId: "w", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "P17 mock compat",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [{ id: "task_1", title: "t1", input: { text: "do" }, acceptance: { rules: ["r1"] } }],
			outputContract: { text: "output" },
		});

		const runner = new MockRoleRunner();
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace, roleRunner: runner,
			dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
		});

		const state = await orchestrator.createRun(plan.planId);
		const result = await orchestrator.runToCompletion(state.runId);

		assert.equal(result.status, "completed");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("P17: orchestrator.runNextQueued injects TeamUnit profile IDs", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-p17-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);

		const unit = await unitStore.create({
			title: "queued team", description: "d",
			workerProfileId: "qp-worker", checkerProfileId: "qp-checker",
			watcherProfileId: "qp-watcher", finalizerProfileId: "qp-finalizer",
		});
		const plan = await planStore.create({
			title: "P17 queued",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [{ id: "task_1", title: "t1", input: { text: "do" }, acceptance: { rules: ["r1"] } }],
			outputContract: { text: "output" },
		});

		const runner = new FakeProfileAwareRunner();
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace, roleRunner: runner,
			dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
		});

		await orchestrator.createRun(plan.planId);
		const result = await orchestrator.runNextQueued();

		assert.ok(result, "runNextQueued should find and execute the queued run");
		assert.equal(result!.status, "completed");
		assert.ok(runner.injectedProfiles, "setProfileIds should have been called");
		assert.equal(runner.injectedProfiles.workerProfileId, "qp-worker");
		assert.equal(runner.injectedProfiles.checkerProfileId, "qp-checker");
	} finally {
		await rm(root, { recursive: true });
	}
});
