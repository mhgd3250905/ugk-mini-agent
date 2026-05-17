import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TeamOrchestrator } from "../src/team/orchestrator.js";
import { PlanStore } from "../src/team/plan-store.js";
import { TeamUnitStore } from "../src/team/team-unit-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { MockRoleRunner, type DecomposerInput, type DecomposerOutput, type MockRoleRunnerConfig, type WorkerInput } from "../src/team/role-runner.js";
import type { TeamTask } from "../src/team/types.js";

class DecompositionCaptureRunner extends MockRoleRunner {
	readonly events: string[] = [];
	readonly workerTaskIds: string[] = [];
	readonly decomposerTaskIds: string[] = [];

	constructor(private readonly outputs: DecomposerOutput[] = [], config: MockRoleRunnerConfig = {}) {
		super(config);
	}

	override async runDecomposer(input: DecomposerInput): Promise<DecomposerOutput> {
		this.events.push(`decomposer:${input.task.id}`);
		this.decomposerTaskIds.push(input.task.id);
		return this.outputs.shift() ?? { decision: "no_split", reason: "small enough", children: [] };
	}

	override async runWorker(input: WorkerInput) {
		this.events.push(`worker:${input.task.id}`);
		this.workerTaskIds.push(input.task.id);
		return super.runWorker(input);
	}
}

async function setup(task: TeamTask, runner: DecompositionCaptureRunner) {
	const root = await mkdtemp(join(tmpdir(), "team-decomp-"));
	const planStore = new PlanStore(root);
	const unitStore = new TeamUnitStore(root);
	const workspace = new RunWorkspace(root);
	const unit = await unitStore.create({
		title: "unit",
		description: "unit",
		watcherProfileId: "watcher",
		workerProfileId: "worker",
		checkerProfileId: "checker",
		finalizerProfileId: "finalizer",
		decomposerProfileId: "decomposer",
	});
	const plan = await planStore.create({
		title: "decomposition plan",
		defaultTeamUnitId: unit.teamUnitId,
		goal: { text: "test decomposition" },
		tasks: [task],
		outputContract: { text: "final report" },
	});
	const orchestrator = new TeamOrchestrator({
		planStore,
		teamUnitStore: unitStore,
		workspace,
		roleRunner: runner,
		dataDir: root,
		maxCheckerRevisions: 3,
		maxWatcherRevisions: 1,
		maxRunDurationMinutes: 60,
	});
	return { root, plan, orchestrator, workspace };
}

test("task with no decomposer executes worker normally", async () => {
	const runner = new DecompositionCaptureRunner();
	const { root, plan, orchestrator } = await setup({
		id: "task_1",
		title: "Task 1",
		input: { text: "do task" },
		acceptance: { rules: ["ok"] },
	}, runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.deepEqual(runner.decomposerTaskIds, []);
		assert.deepEqual(runner.workerTaskIds, ["task_1"]);
		assert.equal(final.taskStates.task_1?.status, "succeeded");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("leaf decomposer no_split executes original worker normally", async () => {
	const runner = new DecompositionCaptureRunner([
		{ decision: "no_split", reason: "already atomic", children: [] },
	]);
	const { root, plan, orchestrator } = await setup({
		id: "task_1",
		title: "Task 1",
		input: { text: "do task" },
		acceptance: { rules: ["ok"] },
		decomposer: { mode: "leaf" },
	}, runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.deepEqual(runner.decomposerTaskIds, ["task_1"]);
		assert.deepEqual(runner.workerTaskIds, ["task_1"]);
		assert.equal(final.taskStates.task_1?.status, "succeeded");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("split decision does not execute parent worker", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "needs children",
			children: [
				{
					id: "task_1__child",
					title: "Child",
					input: { text: "do child" },
					acceptance: { rules: ["ok"] },
					decomposer: { mode: "none" },
				},
			],
		},
	]);
	const { root, plan, orchestrator } = await setup({
		id: "task_1",
		title: "Task 1",
		input: { text: "do task" },
		acceptance: { rules: ["ok"] },
		decomposer: { mode: "leaf" },
	}, runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		assert.deepEqual(runner.decomposerTaskIds, ["task_1"]);
		assert.ok(!runner.workerTaskIds.includes("task_1"));
	} finally {
		await rm(root, { recursive: true });
	}
});

test("decomposer runs before worker for decomposable task", async () => {
	const runner = new DecompositionCaptureRunner([
		{ decision: "no_split", reason: "small enough", children: [] },
	]);
	const { root, plan, orchestrator } = await setup({
		id: "task_1",
		title: "Task 1",
		input: { text: "do task" },
		acceptance: { rules: ["ok"] },
		decomposer: { mode: "leaf" },
	}, runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		assert.deepEqual(runner.events.slice(0, 2), ["decomposer:task_1", "worker:task_1"]);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("split writes decomposition record", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "needs independent work",
			children: [
				{ id: "task_1__a", title: "Child A", input: { text: "do a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
			],
		},
	]);
	const { root, plan, orchestrator, workspace } = await setup({
		id: "task_1",
		title: "Task 1",
		input: { text: "do task" },
		acceptance: { rules: ["ok"] },
		decomposer: { mode: "leaf" },
	}, runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		const record = await workspace.readDecomposition(state.runId, "task_1");
		assert.ok(record);
		assert.equal(record.decision, "split");
		assert.equal(record.reason, "needs independent work");
		assert.equal(record.children[0]?.task.id, "task_1__a");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("split appends child task states", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split",
			children: [
				{ id: "task_1__a", title: "Child A", input: { text: "do a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
				{ id: "task_1__b", title: "Child B", input: { text: "do b" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
			],
		},
	]);
	const { root, plan, orchestrator } = await setup({
		id: "task_1",
		title: "Task 1",
		input: { text: "do task" },
		acceptance: { rules: ["ok"] },
		decomposer: { mode: "leaf" },
	}, runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.summary.totalTasks, 3);
		assert.equal(final.taskStates["task_1__a"]?.status, "succeeded");
		assert.equal(final.taskStates["task_1__b"]?.status, "succeeded");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("decomposed children execute sequentially in persisted order", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split",
			children: [
				{ id: "task_1__a", title: "Child A", input: { text: "do a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
				{ id: "task_1__b", title: "Child B", input: { text: "do b" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
			],
		},
	]);
	const { root, plan, orchestrator } = await setup({
		id: "task_1",
		title: "Task 1",
		input: { text: "do task" },
		acceptance: { rules: ["ok"] },
		decomposer: { mode: "leaf" },
	}, runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		assert.deepEqual(runner.events.filter(e => e.startsWith("worker:")), ["worker:task_1__a", "worker:task_1__b"]);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("decomposed parent succeeds when all children succeed", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split",
			children: [
				{ id: "task_1__a", title: "Child A", input: { text: "do a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
				{ id: "task_1__b", title: "Child B", input: { text: "do b" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
			],
		},
	]);
	const { root, plan, orchestrator } = await setup({
		id: "task_1",
		title: "Task 1",
		input: { text: "do task" },
		acceptance: { rules: ["ok"] },
		decomposer: { mode: "leaf" },
	}, runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.equal(final.taskStates.task_1?.status, "succeeded");
		assert.equal(final.summary.succeededTasks, 3);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("decomposed parent fails when any child fails and points to child outcome", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split",
			children: [
				{ id: "task_1__a", title: "Child A", input: { text: "do a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
				{ id: "task_1__b", title: "Child B", input: { text: "do b" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
			],
		},
	], {
		checkerOutputs: [
			{ verdict: "fail", reason: "child failure", resultContent: "bad result" },
			{ verdict: "pass", reason: "ok", resultContent: "accepted result" },
		],
	});
	const { root, plan, orchestrator } = await setup({
		id: "task_1",
		title: "Task 1",
		input: { text: "do task" },
		acceptance: { rules: ["ok"] },
		decomposer: { mode: "leaf" },
	}, runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed_with_failures");
		assert.equal(final.taskStates.task_1?.status, "failed");
		assert.match(final.taskStates.task_1?.errorSummary ?? "", /task_1__a/);
		assert.match(final.taskStates.task_1?.errorSummary ?? "", /child failure/);
	} finally {
		await rm(root, { recursive: true });
	}
});
