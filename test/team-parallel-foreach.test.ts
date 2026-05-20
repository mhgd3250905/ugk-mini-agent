import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TeamOrchestrator } from "../src/team/orchestrator.js";
import { PlanStore } from "../src/team/plan-store.js";
import { TeamUnitStore } from "../src/team/team-unit-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { MockRoleRunner } from "../src/team/role-runner.js";
import type { WorkerInput, CheckerInput, WatcherInput, FinalizerInput } from "../src/team/role-runner.js";

// ── Parallel for_each test runner ──

class ParallelTestRunner extends MockRoleRunner {
	activeWorkers = 0;
	maxActiveWorkers = 0;
	readonly startTimes = new Map<string, number>();
	readonly endTimes = new Map<string, number>();

	constructor(
		private readonly discoveryItems: Array<Record<string, unknown>>,
		private readonly options: {
			workerDelayMs?: number | ((taskId: string) => number);
			failTaskIds?: Set<string>;
			throwTaskIds?: Set<string>;
		} = {},
	) {
		super();
	}

	async runWorker(input: WorkerInput) {
		if (input.task.type === "discovery") {
			return { content: JSON.stringify({ items: this.discoveryItems }), artifactRefs: [] };
		}

		if (this.options.throwTaskIds?.has(input.task.id)) {
			throw new Error(`unexpected error in ${input.task.id}`);
		}

		this.activeWorkers++;
		this.startTimes.set(input.task.id, Date.now());
		if (this.activeWorkers > this.maxActiveWorkers) {
			this.maxActiveWorkers = this.activeWorkers;
		}

		const delayFn = this.options.workerDelayMs;
		const delay = typeof delayFn === "function" ? delayFn(input.task.id) : (delayFn ?? 30);
		await new Promise(r => setTimeout(r, delay));

		this.endTimes.set(input.task.id, Date.now());
		this.activeWorkers--;

		return { content: `done ${input.task.id}`, artifactRefs: [] };
	}

	async runChecker(input: CheckerInput) {
		if (input.task.type === "discovery") {
			return { verdict: "pass" as const, reason: "ok", resultContent: JSON.stringify({ items: this.discoveryItems }) };
		}

		if (this.options.failTaskIds?.has(input.task.id)) {
			return { verdict: "fail" as const, reason: "intentional failure", resultContent: "failed output" };
		}

		return { verdict: "pass" as const, reason: "ok", resultContent: "accepted" };
	}

	async runWatcher(input: WatcherInput) {
		if (input.workUnitStatus === "failed") {
			return { decision: "confirm_failed" as const, reason: "task failed" };
		}
		return { decision: "accept_task" as const, reason: "ok" };
	}

	async runFinalizer(_input: FinalizerInput) {
		return { finalReport: "parallel test final report" };
	}
}

async function setupParallelForEach(
	items: Array<{ id: string; title: string }>,
	runnerOptions?: ConstructorParameters<typeof ParallelTestRunner>[1],
) {
	const root = await mkdtemp(join(tmpdir(), "team-parallel-"));
	const planStore = new PlanStore(root);
	const unitStore = new TeamUnitStore(root);
	const workspace = new RunWorkspace(root);
	const discoveryItems = items.map(i => ({ id: i.id, title: i.title }));
	const runner = new ParallelTestRunner(discoveryItems, runnerOptions);
	const unit = await unitStore.create({
		title: "t", description: "d",
		watcherProfileId: "w", workerProfileId: "wo",
		checkerProfileId: "c", finalizerProfileId: "f",
	});
	const plan = await planStore.create({
		title: "parallel for_each",
		defaultTeamUnitId: unit.teamUnitId,
		goal: { text: "test parallel" },
		tasks: [
			{
				id: "discover",
				type: "discovery",
				title: "Discover items",
				input: { text: "Find items" },
				acceptance: { rules: ["ok"] },
				discovery: { outputKey: "items" },
			},
			{
				id: "process",
				type: "for_each",
				title: "Process each",
				input: { text: "p" },
				acceptance: { rules: ["ok"] },
				forEach: {
					itemsFrom: "discover.items",
					mode: "parallel",
					taskTemplate: {
						title: "Process {{item.title}}",
						input: { text: "Process {{item.id}}" },
						acceptance: { rules: ["ok"] },
					},
				},
			},
		],
		outputContract: { text: "report" },
	});
	const orchestrator = new TeamOrchestrator({
		planStore, teamUnitStore: unitStore, workspace,
		roleRunner: runner, dataDir: root,
		maxCheckerRevisions: 3, maxWatcherRevisions: 1,
		maxRunDurationMinutes: 60,
	});
	return { root, plan, orchestrator, workspace, runner };
}

// ── Tests ──

test("parallel for_each: 4 items succeed", async () => {
	const { root, plan, orchestrator } = await setupParallelForEach([
		{ id: "a", title: "Alpha" },
		{ id: "b", title: "Beta" },
		{ id: "c", title: "Gamma" },
		{ id: "d", title: "Delta" },
	]);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.equal(final.taskStates["discover"]?.status, "succeeded");
		assert.equal(final.taskStates["process"]?.status, "succeeded");
		for (const suffix of ["a", "b", "c", "d"]) {
			assert.equal(final.taskStates[`process__${suffix}`]?.status, "succeeded");
		}
	} finally {
		await rm(root, { recursive: true });
	}
});

test("parallel for_each: pool respects concurrency limit of 3", async () => {
	const { root, plan, orchestrator, runner } = await setupParallelForEach([
		{ id: "a", title: "A" },
		{ id: "b", title: "B" },
		{ id: "c", title: "C" },
		{ id: "d", title: "D" },
		{ id: "e", title: "E" },
		{ id: "f", title: "F" },
	], { workerDelayMs: 50 });
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.equal(final.taskStates["process"]?.status, "succeeded");
		assert.ok(runner.maxActiveWorkers <= 3,
			`maxActiveWorkers should never exceed 3, got ${runner.maxActiveWorkers}`);
		assert.ok(runner.maxActiveWorkers >= 2,
			`maxActiveWorkers should show some parallelism, got ${runner.maxActiveWorkers}`);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("parallel for_each: refills pool when child completes, not batch", async () => {
	const { root, plan, orchestrator, runner } = await setupParallelForEach([
		{ id: "fast", title: "Fast" },
		{ id: "slow1", title: "Slow1" },
		{ id: "slow2", title: "Slow2" },
		{ id: "next", title: "Next" },
	], {
		workerDelayMs: (taskId) => {
			if (taskId.includes("fast")) return 10;
			return 200;
		},
	});
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");

		const fastEnd = runner.endTimes.get("process__fast")!;
		const nextStart = runner.startTimes.get("process__next")!;
		const slow1End = runner.endTimes.get("process__slow1")!;
		const slow2End = runner.endTimes.get("process__slow2")!;

		// "next" should start after "fast" finishes but before slow1/slow2 finish
		assert.ok(nextStart >= fastEnd - 20,
			`next should start after fast finishes: nextStart=${nextStart} fastEnd=${fastEnd}`);
		assert.ok(nextStart < Math.min(slow1End, slow2End) - 50,
			`next should start before slow children finish: nextStart=${nextStart} slow1End=${slow1End} slow2End=${slow2End}`);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("parallel for_each: partial failure - parent succeeded with failed child audit", async () => {
	const { root, plan, orchestrator, workspace } = await setupParallelForEach(
		[
			{ id: "ok1", title: "OK1" },
			{ id: "fail1", title: "Fail1" },
			{ id: "ok2", title: "OK2" },
		],
		{ failTaskIds: new Set(["process__fail1"]) },
	);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		// Parent should succeed because at least one child succeeded
		assert.equal(final.taskStates["process"]?.status, "succeeded",
			"parent should succeed when at least one child succeeds");
		// Failed child should keep its audit
		assert.equal(final.taskStates["process__fail1"]?.status, "failed");
		assert.ok(final.taskStates["process__fail1"]?.errorSummary,
			"failed child should have errorSummary");
		// Successful children
		assert.equal(final.taskStates["process__ok1"]?.status, "succeeded");
		assert.equal(final.taskStates["process__ok2"]?.status, "succeeded");

		// Failed child should have attempt files
		const attempts = await workspace.listAttempts(state.runId, "process__fail1");
		assert.ok(attempts.length > 0, "failed child should have attempt records");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("parallel for_each: all children failed - parent failed", async () => {
	const { root, plan, orchestrator } = await setupParallelForEach(
		[
			{ id: "fail1", title: "Fail1" },
			{ id: "fail2", title: "Fail2" },
		],
		{ failTaskIds: new Set(["process__fail1", "process__fail2"]) },
	);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates["process"]?.status, "failed",
			"parent should fail when all children fail");
		assert.equal(final.taskStates["process__fail1"]?.status, "failed");
		assert.equal(final.taskStates["process__fail2"]?.status, "failed");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("parallel for_each: all children skipped - parent skipped", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-parallel-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const runner = new MockRoleRunner();
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "all skipped parallel",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [{
				id: "process",
				type: "for_each",
				title: "Process",
				input: { text: "p" },
				acceptance: { rules: ["ok"] },
				forEach: {
					itemsFrom: "discover.items",
					mode: "parallel",
					taskTemplate: { title: "T {{item.id}}", input: { text: "p" }, acceptance: { rules: ["ok"] } },
				},
			}],
			outputContract: { text: "report" },
		});
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace,
			roleRunner: runner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
		});

		const state = await orchestrator.createRun(plan.planId);

		// Write expansion with 2 children
		await workspace.writeExpansion(state.runId, {
			schemaVersion: "team/task-expansion-1",
			parentTaskId: "process",
			itemsFrom: "discover.items",
			expandedAt: new Date().toISOString(),
			children: [
				{ taskId: "process__a", sourceItemId: "a", title: "T a" },
				{ taskId: "process__b", sourceItemId: "b", title: "T b" },
			],
		});
		await workspace.appendChildTaskStates(state.runId, [
			{ id: "process__a", type: "normal", title: "T a", input: { text: "p" }, acceptance: { rules: ["ok"] }, parentTaskId: "process", sourceItemId: "a", generated: true },
			{ id: "process__b", type: "normal", title: "T b", input: { text: "p" }, acceptance: { rules: ["ok"] }, parentTaskId: "process", sourceItemId: "b", generated: true },
		]);

		// Manually skip both children
		const patched = (await workspace.getState(state.runId))!;
		patched.taskStates["process__a"]!.status = "skipped";
		patched.taskStates["process__a"]!.progress = { phase: "skipped", message: "skipped", updatedAt: new Date().toISOString() };
		patched.taskStates["process__b"]!.status = "skipped";
		patched.taskStates["process__b"]!.progress = { phase: "skipped", message: "skipped", updatedAt: new Date().toISOString() };
		patched.taskStates["process"]!.status = "running";
		patched.summary = { totalTasks: 3, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 2 };
		await workspace.saveState(patched);

		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates["process"]?.status, "skipped",
			"parent should be skipped when all children are skipped");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("parallel for_each: 0 items - parent succeeded", async () => {
	const { root, plan, orchestrator } = await setupParallelForEach([]);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.equal(final.taskStates["process"]?.status, "succeeded");
		assert.equal(final.summary.totalTasks, 2);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("parallel for_each: expansion written once, reused on rerun", async () => {
	const { root, plan, orchestrator, workspace } = await setupParallelForEach([
		{ id: "x", title: "X" },
		{ id: "y", title: "Y" },
	]);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		const expansion = await workspace.readExpansion(state.runId, "process");
		assert.ok(expansion);
		assert.equal(expansion.children.length, 2);

		// Rerun
		await orchestrator.rerunRun(state.runId);
		const final2 = await orchestrator.runToCompletion(state.runId);

		assert.equal(final2.status, "completed");
		// Same number of children, no duplication
		const childCount = Object.keys(final2.taskStates).filter(k => k.startsWith("process__")).length;
		assert.equal(childCount, 2, "rerun should not duplicate children");

		// Expansion file unchanged
		const expansion2 = await workspace.readExpansion(state.runId, "process");
		assert.equal(expansion2?.children.length, 2);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("parallel for_each: unexpected child throw becomes deterministic failure", async () => {
	const { root, plan, orchestrator } = await setupParallelForEach(
		[
			{ id: "ok1", title: "OK1" },
			{ id: "boom", title: "Boom" },
			{ id: "ok2", title: "OK2" },
		],
		{ throwTaskIds: new Set(["process__boom"]) },
	);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		// Throwing child should be failed with error summary
		assert.equal(final.taskStates["process__boom"]?.status, "failed");
		assert.match(final.taskStates["process__boom"]?.errorSummary ?? "", /unexpected error/);

		// Other children should succeed
		assert.equal(final.taskStates["process__ok1"]?.status, "succeeded");
		assert.equal(final.taskStates["process__ok2"]?.status, "succeeded");

		// Parent should succeed (partial success)
		assert.equal(final.taskStates["process"]?.status, "succeeded",
			"parent should succeed when at least one child succeeds");

		// Run should be terminal (not stuck)
		assert.ok(
			final.status === "completed" || final.status === "completed_with_failures",
			"run should be terminal, got " + final.status,
		);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("parallel for_each: timeout preserves run-level terminal state", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-parallel-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const runner = new ParallelTestRunner(
			[
				{ id: "a", title: "A" },
				{ id: "b", title: "B" },
				{ id: "c", title: "C" },
				{ id: "d", title: "D" },
			],
			{ workerDelayMs: 200 },
		);
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "timeout parallel",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test timeout" },
			tasks: [
				{
					id: "discover",
					type: "discovery",
					title: "Discover items",
					input: { text: "Find items" },
					acceptance: { rules: ["ok"] },
					discovery: { outputKey: "items" },
				},
				{
					id: "process",
					type: "for_each",
					title: "Process each",
					input: { text: "p" },
					acceptance: { rules: ["ok"] },
					forEach: {
						itemsFrom: "discover.items",
						mode: "parallel",
						taskTemplate: {
							title: "Process {{item.title}}",
							input: { text: "Process {{item.id}}" },
							acceptance: { rules: ["ok"] },
						},
					},
				},
			],
			outputContract: { text: "report" },
		});
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace,
			roleRunner: runner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1,
			maxRunDurationMinutes: 60,
		});

		const state = await orchestrator.createRun(plan.planId, { maxRunDurationMinutes: 0.001 });
		const final = await orchestrator.runToCompletion(state.runId);

		// Run should be terminal failed due to timeout
		assert.ok(
			final.status === "failed" || final.status === "completed_with_failures",
			"expected terminal failure status, got " + final.status,
		);
		assert.ok(final.lastError?.includes("timeout"),
			"lastError should mention timeout, got: " + final.lastError);

		// No children should be left running or pending
		for (const [taskId, ts] of Object.entries(final.taskStates)) {
			if (taskId.startsWith("process__")) {
				assert.ok(
					ts.status !== "running" && ts.status !== "pending",
					"child " + taskId + " should not be left running/pending, got " + ts.status,
				);
			}
		}
	} finally {
		await rm(root, { recursive: true });
	}
});

test("parallel for_each: fatal state-write failure restores saveState and fails run", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-parallel-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const runner = new ParallelTestRunner(
			[{ id: "a", title: "A" }, { id: "b", title: "B" }],
			{ throwTaskIds: new Set(["process__a"]) },
		);
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "fatal state-write",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{
					id: "discover",
					type: "discovery",
					title: "Discover items",
					input: { text: "Find items" },
					acceptance: { rules: ["ok"] },
					discovery: { outputKey: "items" },
				},
				{
					id: "process",
					type: "for_each",
					title: "Process each",
					input: { text: "p" },
					acceptance: { rules: ["ok"] },
					forEach: {
						itemsFrom: "discover.items",
						mode: "parallel",
						taskTemplate: {
							title: "Process {{item.title}}",
							input: { text: "Process {{item.id}}" },
							acceptance: { rules: ["ok"] },
						},
					},
				},
			],
			outputContract: { text: "report" },
		});
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace,
			roleRunner: runner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1,
			maxRunDurationMinutes: 60,
		});

		// Monkey-patch patchState to throw when recording the child failure
		const origPatchState = workspace.patchState.bind(workspace);
		let patchCallCount = 0;
		workspace.patchState = async function(runId: string, mutator: (s: any) => void | Promise<void>) {
			patchCallCount++;
			// Throw only when recording unexpected child failure (the mutator sets status "failed" with "unexpected error")
			// All other patchState calls (summary, timeout, etc.) should work normally
			const isChildFailurePatch = await detectChildFailurePatch.call(this, runId, mutator);
			if (isChildFailurePatch) {
				throw new Error("simulated state-write failure");
			}
			return origPatchState(runId, mutator);
		};

		// Helper: run the mutator on a clone to detect if it's recording a child failure
		async function detectChildFailurePatch(runId: string, mutator: (s: any) => void | Promise<void>) {
			const state = await workspace.getState(runId);
			if (!state) return false;
			const clone = JSON.parse(JSON.stringify(state));
			await mutator(clone);
			// Check if the mutator set any task to failed with an "unexpected error" prefix
			for (const ts of Object.values(clone.taskStates) as Array<{ status: string; errorSummary?: string }>) {
				if (ts.status === "failed" && ts.errorSummary && ts.errorSummary.startsWith("unexpected error")) {
					return true;
				}
			}
			return false;
		}

		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		// Run should be failed (not stuck running)
		assert.ok(
			final.status === "failed" || final.status === "completed_with_failures",
			"run should be terminal failed, got " + final.status,
		);
		assert.ok(final.lastError, "run should have lastError");

		// Restore patchState and verify saveState is not narrowed
		workspace.patchState = origPatchState;

		// Prove that a normal full-state saveState write works correctly
		// (not narrowed by the parallel override which should have been restored)
		const freshState = await workspace.getState(state.runId);
		assert.ok(freshState, "state should be readable");
		freshState!.lastError = "post-failure verification write";
		freshState!.updatedAt = new Date().toISOString();
		await workspace.saveState(freshState!);

		const reloaded = await workspace.getState(state.runId);
		assert.equal(reloaded!.lastError, "post-failure verification write",
			"full-state saveState must persist lastError — if still narrowed, this would be lost");
	} finally {
		await rm(root, { recursive: true });
	}
});
