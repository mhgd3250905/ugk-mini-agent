import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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

async function setupTasks(tasks: TeamTask[], runner: DecompositionCaptureRunner) {
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
		tasks,
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

function decomposedDiscoveryPlan(): TeamTask[] {
	return [
		{
			id: "discover",
			type: "discovery",
			title: "Discover items",
			input: { text: "discover items" },
			acceptance: { rules: ["output items"] },
			discovery: { outputKey: "items" },
			decomposer: { mode: "leaf" },
		},
		{
			id: "process_each",
			type: "for_each",
			title: "Process each item",
			input: { text: "process each" },
			acceptance: { rules: ["ok"] },
			forEach: {
				itemsFrom: "discover.items",
				mode: "sequential",
				taskTemplate: {
					title: "Process {{item.title}}",
					input: { text: "Process item {{item.id}}" },
					acceptance: { rules: ["processed {{item.id}}"] },
				},
			},
		},
	];
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

test("leaf parent rejects child leaf", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split",
			children: [
				{ id: "task_1__a", title: "Child A", input: { text: "do a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "leaf" } },
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

		assert.equal(final.taskStates.task_1?.status, "failed");
		assert.match(final.taskStates.task_1?.errorSummary ?? "", /leaf child must use decomposer mode none/);
		assert.deepEqual(runner.workerTaskIds, []);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("leaf parent rejects child propagate", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split",
			children: [
				{ id: "task_1__a", title: "Child A", input: { text: "do a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "propagate" } },
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

		assert.equal(final.taskStates.task_1?.status, "failed");
		assert.match(final.taskStates.task_1?.errorSummary ?? "", /leaf child must use decomposer mode none/);
		assert.deepEqual(runner.workerTaskIds, []);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("propagate parent accepts child leaf", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split",
			children: [
				{ id: "task_1__a", title: "Child A", input: { text: "do a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "leaf" } },
			],
		},
		{ decision: "no_split", reason: "leaf child is small", children: [] },
	]);
	const { root, plan, orchestrator } = await setup({
		id: "task_1",
		title: "Task 1",
		input: { text: "do task" },
		acceptance: { rules: ["ok"] },
		decomposer: { mode: "propagate" },
	}, runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates.task_1?.status, "succeeded");
		assert.equal(final.taskStates["task_1__a"]?.status, "succeeded");
		assert.deepEqual(runner.decomposerTaskIds, ["task_1", "task_1__a"]);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("propagate parent rejects child propagate", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split",
			children: [
				{ id: "task_1__a", title: "Child A", input: { text: "do a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "propagate" } },
			],
		},
	]);
	const { root, plan, orchestrator } = await setup({
		id: "task_1",
		title: "Task 1",
		input: { text: "do task" },
		acceptance: { rules: ["ok"] },
		decomposer: { mode: "propagate" },
	}, runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates.task_1?.status, "failed");
		assert.match(final.taskStates.task_1?.errorSummary ?? "", /propagate child cannot use decomposer mode propagate/);
		assert.deepEqual(runner.workerTaskIds, []);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("too many decomposed children fails parent safely", async () => {
	const children = Array.from({ length: 3 }, (_, index) => ({
		id: `task_1__${index}`,
		title: `Child ${index}`,
		input: { text: `do ${index}` },
		acceptance: { rules: ["ok"] },
		decomposer: { mode: "none" as const },
	}));
	const runner = new DecompositionCaptureRunner([{ decision: "split", reason: "split", children }]);
	const { root, plan, orchestrator } = await setup({
		id: "task_1",
		title: "Task 1",
		input: { text: "do task" },
		acceptance: { rules: ["ok"] },
		decomposer: { mode: "leaf", maxChildren: 2 },
	}, runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates.task_1?.status, "failed");
		assert.match(final.taskStates.task_1?.errorSummary ?? "", /exceeds maxChildren 2/);
		assert.equal(final.summary.totalTasks, 1);
		assert.deepEqual(runner.workerTaskIds, []);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("total generated task limit fails parent safely", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split",
			children: [
				{ id: "task_1__overflow", title: "Overflow", input: { text: "overflow" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
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
		const fillerTasks = Array.from({ length: 49 }, (_, index) => ({
			id: `existing_${index}`,
			title: `Existing ${index}`,
			input: { text: "already generated" },
			acceptance: { rules: ["ok"] },
			generated: true,
		}));
		await workspace.appendChildTaskStates(state.runId, fillerTasks);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates.task_1?.status, "failed");
		assert.match(final.taskStates.task_1?.errorSummary ?? "", /total task limit 50/);
		assert.equal(final.taskStates["task_1__overflow"], undefined);
		assert.deepEqual(runner.workerTaskIds, []);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("duplicate decomposed child ids are rejected", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split",
			children: [
				{ id: "task_1__dup", title: "Child A", input: { text: "do a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
				{ id: "task_1__dup", title: "Child B", input: { text: "do b" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
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

		assert.equal(final.taskStates.task_1?.status, "failed");
		assert.match(final.taskStates.task_1?.errorSummary ?? "", /duplicate child task id/);
		assert.deepEqual(runner.workerTaskIds, []);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("decomposer split rejects non-normal child tasks", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split",
			children: [
				{
					id: "task_1__discover",
					type: "discovery",
					title: "Discovery Child",
					input: { text: "discover" },
					acceptance: { rules: ["ok"] },
					discovery: { outputKey: "items" },
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
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates.task_1?.status, "failed");
		assert.match(final.taskStates.task_1?.errorSummary ?? "", /decomposer child task must be normal/);
		assert.deepEqual(runner.workerTaskIds, []);
	} finally {
		await rm(root, { recursive: true });
	}
});

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

test("existing decomposition record skips decomposer and resumes children", async () => {
	const runner = new DecompositionCaptureRunner([
		{ decision: "no_split", reason: "should not be called", children: [] },
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
		await workspace.writeDecomposition(state.runId, {
			schemaVersion: "team/task-decomposition-1",
			parentTaskId: "task_1",
			mode: "leaf",
			decision: "split",
			reason: "persisted split",
			decomposedAt: new Date().toISOString(),
			children: [
				{
					taskId: "task_1__a",
					title: "Child A",
					task: { id: "task_1__a", title: "Child A", input: { text: "do a" }, acceptance: { rules: ["ok"] }, parentTaskId: "task_1", generated: true, decomposer: { mode: "none" } },
				},
			],
		});

		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.deepEqual(runner.decomposerTaskIds, []);
		assert.deepEqual(runner.workerTaskIds, ["task_1__a"]);
		assert.equal(final.taskStates["task_1__a"]?.status, "succeeded");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("resume continues remaining decomposed child tasks without rerunning decomposer", async () => {
	let hangChildB = true;
	class ResumeRunner extends DecompositionCaptureRunner {
		override async runWorker(input: WorkerInput) {
			if (input.task.id === "task_1__b" && hangChildB) {
				this.events.push(`worker:${input.task.id}`);
				this.workerTaskIds.push(input.task.id);
				await hangOnSignal(input.signal);
			}
			return super.runWorker(input);
		}
	}
	const runner = new ResumeRunner([
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
		const runPromise = orchestrator.runToCompletion(state.runId);
		await new Promise<void>((resolve) => {
			const check = () => runner.workerTaskIds.includes("task_1__b") ? resolve() : setTimeout(check, 10);
			check();
		});
		await orchestrator.pauseRun(state.runId, "pause at child b");
		const paused = await runPromise;
		assert.equal(paused.status, "paused");
		assert.equal(paused.taskStates["task_1__a"]?.status, "succeeded");

		hangChildB = false;
		runner.workerTaskIds.length = 0;
		await orchestrator.resumeRun(state.runId);
		const resumed = await orchestrator.runToCompletion(state.runId);

		assert.equal(resumed.status, "completed");
		assert.equal(resumed.taskStates.task_1?.status, "succeeded");
		assert.deepEqual(runner.decomposerTaskIds, ["task_1"]);
		assert.deepEqual(runner.workerTaskIds, ["task_1__b"]);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("pause during decomposer leaves interrupted state without stale decomposition write", async () => {
	let decomposerStartedResolve: () => void;
	const decomposerStarted = new Promise<void>(resolve => { decomposerStartedResolve = resolve; });
	class HangingDecomposerRunner extends DecompositionCaptureRunner {
		override async runDecomposer(input: DecomposerInput): Promise<DecomposerOutput> {
			this.decomposerTaskIds.push(input.task.id);
			decomposerStartedResolve();
			return await hangOnSignal(input.signal);
		}
	}
	const runner = new HangingDecomposerRunner();
	const { root, plan, orchestrator, workspace } = await setup({
		id: "task_1",
		title: "Task 1",
		input: { text: "do task" },
		acceptance: { rules: ["ok"] },
		decomposer: { mode: "leaf" },
	}, runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const runPromise = orchestrator.runToCompletion(state.runId);
		await decomposerStarted;
		await orchestrator.pauseRun(state.runId, "pause during decomposer");
		const paused = await runPromise;

		assert.equal(paused.status, "paused");
		assert.equal(paused.taskStates.task_1?.status, "interrupted");
		assert.equal(await workspace.readDecomposition(state.runId, "task_1"), null);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("cancel during decomposed child task wins over timeout", async () => {
	let childStartedResolve: () => void;
	const childStarted = new Promise<void>(resolve => { childStartedResolve = resolve; });
	class HangingChildRunner extends DecompositionCaptureRunner {
		override async runWorker(input: WorkerInput) {
			if (input.task.id === "task_1__a") {
				this.workerTaskIds.push(input.task.id);
				childStartedResolve();
				await hangOnSignal(input.signal);
			}
			return super.runWorker(input);
		}
	}
	const runner = new HangingChildRunner([
		{
			decision: "split",
			reason: "split",
			children: [
				{ id: "task_1__a", title: "Child A", input: { text: "do a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
			],
		},
	]);
	const { root, plan, workspace } = await setup({
		id: "task_1",
		title: "Task 1",
		input: { text: "do task" },
		acceptance: { rules: ["ok"] },
		decomposer: { mode: "leaf" },
	}, runner);
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const orchestrator = new TeamOrchestrator({
			planStore,
			teamUnitStore: unitStore,
			workspace,
			roleRunner: runner,
			dataDir: root,
			maxCheckerRevisions: 3,
			maxWatcherRevisions: 1,
			maxRunDurationMinutes: 60,
			phaseTimeouts: { workerMs: 60_000, checkerMs: 60_000, watcherMs: 60_000, finalizerMs: 60_000 },
		});
		const state = await orchestrator.createRun(plan.planId);
		const runPromise = orchestrator.runToCompletion(state.runId);
		await childStarted;
		await orchestrator.cancelRun(state.runId, "user cancel");
		const final = await runPromise;

		assert.equal(final.status, "cancelled");
		assert.equal(final.taskStates.task_1?.status, "cancelled");
		assert.equal(final.taskStates["task_1__a"]?.status, "cancelled");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("run timeout fails unfinished decomposed children and parent", async () => {
	class SlowFirstChildRunner extends DecompositionCaptureRunner {
		override async runWorker(input: WorkerInput) {
			if (input.task.id === "task_1__a") {
				await new Promise(resolve => setTimeout(resolve, 80));
			}
			return super.runWorker(input);
		}
	}
	const runner = new SlowFirstChildRunner([
		{
			decision: "split",
			reason: "split",
			children: [
				{ id: "task_1__a", title: "Child A", input: { text: "do a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
				{ id: "task_1__b", title: "Child B", input: { text: "do b" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
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
		const patched = (await workspace.getState(state.runId))!;
		patched.maxRunDurationMinutes = 0.0005;
		await workspace.saveState(patched);

		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "failed");
		assert.equal(final.taskStates.task_1?.status, "failed");
		assert.equal(final.taskStates["task_1__b"]?.status, "failed");
		assert.equal(final.taskStates.task_1?.errorSummary, "run timeout");
		assert.equal(final.taskStates["task_1__b"]?.errorSummary, "run timeout");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("decomposed child results are visible in finalizer report", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split",
			children: [
				{ id: "task_1__a", title: "Child A", input: { text: "do a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
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
		const report = await readFile(join(root, "runs", state.runId, "final-report.md"), "utf8");
		assert.match(report, /task_1__a: succeeded/);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("decomposed discovery parent feeds downstream for_each from child object outputs", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split discovery",
			children: [
				{ id: "discover__a", title: "Discover A", input: { text: "discover a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
				{ id: "discover__b", title: "Discover B", input: { text: "discover b" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
			],
		},
	], {
		checkerOutputs: [
			{ verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "a", title: "A" }] }) },
			{ verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "b", title: "B" }] }) },
		],
	});
	const { root, plan, orchestrator } = await setupTasks(decomposedDiscoveryPlan(), runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.equal(final.taskStates.discover?.status, "succeeded");
		assert.equal(final.taskStates.process_each?.status, "succeeded");
		assert.equal(final.taskStates["process_each__a"]?.status, "succeeded");
		assert.equal(final.taskStates["process_each__b"]?.status, "succeeded");
		assert.ok(!runner.workerTaskIds.includes("discover"), "split discovery parent must not run worker");
		assert.deepEqual(runner.workerTaskIds, ["discover__a", "discover__b", "process_each__a", "process_each__b"]);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("decomposed discovery aggregation falls back to worker output when accepted child result is a summary", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split discovery",
			children: [
				{ id: "discover__a", title: "Discover A", input: { text: "discover a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
			],
		},
	], {
		workerOutputs: [
			JSON.stringify({ items: [{ id: "a", title: "A" }] }),
			"processed A",
		],
		checkerOutputs: [
			{ verdict: "pass", reason: "summary accepted", resultContent: "总共 1 项：A。每项包含 id 和 title。" },
		],
	});
	const { root, plan, orchestrator, workspace } = await setupTasks(decomposedDiscoveryPlan(), runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.equal(final.taskStates.discover?.status, "succeeded");
		assert.equal(final.taskStates.process_each?.status, "succeeded");
		assert.equal(final.taskStates["process_each__a"]?.status, "succeeded");

		const expansion = await workspace.readExpansion(state.runId, "process_each");
		assert.equal(expansion?.children.length, 1);
		assert.equal(expansion?.children[0]?.sourceItemId, "a");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("decomposed discovery aggregation supports direct array child output", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split discovery",
			children: [
				{ id: "discover__a", title: "Discover A", input: { text: "discover a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
			],
		},
	], {
		checkerOutputs: [
			{ verdict: "pass", reason: "ok", resultContent: JSON.stringify([{ id: "a", title: "A" }]) },
		],
	});
	const { root, plan, orchestrator } = await setupTasks(decomposedDiscoveryPlan(), runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.equal(final.taskStates.process_each?.status, "succeeded");
		assert.equal(final.taskStates["process_each__a"]?.status, "succeeded");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("malformed decomposed discovery child output fails parent without partial for_each expansion", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split discovery",
			children: [
				{ id: "discover__a", title: "Discover A", input: { text: "discover a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
				{ id: "discover__b", title: "Discover B", input: { text: "discover b" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
			],
		},
	], {
		checkerOutputs: [
			{ verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "a", title: "A" }] }) },
			{ verdict: "pass", reason: "ok", resultContent: JSON.stringify({ nope: [{ id: "b", title: "B" }] }) },
		],
	});
	const { root, plan, orchestrator, workspace } = await setupTasks(decomposedDiscoveryPlan(), runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates.discover?.status, "failed");
		assert.match(final.taskStates.discover?.errorSummary ?? "", /failed to aggregate decomposed discovery output from child discover__b/);
		assert.equal(final.taskStates.process_each?.status, "failed");
		assert.equal(final.taskStates["process_each__a"], undefined);
		const expansion = await workspace.readExpansion(state.runId, "process_each");
		assert.equal(expansion, null);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("existing decomposed discovery record aggregates on resume path without rerunning decomposer", async () => {
	const runner = new DecompositionCaptureRunner([
		{ decision: "no_split", reason: "should not run", children: [] },
	], {
		checkerOutputs: [
			{ verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "a", title: "A" }] }) },
			{ verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "b", title: "B" }] }) },
		],
	});
	const { root, plan, orchestrator, workspace } = await setupTasks(decomposedDiscoveryPlan(), runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		await workspace.writeDecomposition(state.runId, {
			schemaVersion: "team/task-decomposition-1",
			parentTaskId: "discover",
			mode: "leaf",
			decision: "split",
			reason: "persisted split",
			decomposedAt: new Date().toISOString(),
			children: [
				{
					taskId: "discover__a",
					title: "Discover A",
					task: { id: "discover__a", title: "Discover A", input: { text: "discover a" }, acceptance: { rules: ["ok"] }, parentTaskId: "discover", generated: true, decomposer: { mode: "none" } },
				},
				{
					taskId: "discover__b",
					title: "Discover B",
					task: { id: "discover__b", title: "Discover B", input: { text: "discover b" }, acceptance: { rules: ["ok"] }, parentTaskId: "discover", generated: true, decomposer: { mode: "none" } },
				},
			],
		});

		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.deepEqual(runner.decomposerTaskIds, []);
		assert.equal(final.taskStates.process_each?.status, "succeeded");
		assert.equal(final.taskStates["process_each__a"]?.status, "succeeded");
		assert.equal(final.taskStates["process_each__b"]?.status, "succeeded");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("reclaimed decomposed discovery aggregates existing child results without duplicating child states", async () => {
	const runner = new DecompositionCaptureRunner([
		{ decision: "no_split", reason: "should not run", children: [] },
	]);
	const { root, plan, orchestrator, workspace } = await setupTasks(decomposedDiscoveryPlan(), runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const childTasks: TeamTask[] = [
			{ id: "discover__a", title: "Discover A", input: { text: "discover a" }, acceptance: { rules: ["ok"] }, parentTaskId: "discover", generated: true, decomposer: { mode: "none" } },
			{ id: "discover__b", title: "Discover B", input: { text: "discover b" }, acceptance: { rules: ["ok"] }, parentTaskId: "discover", generated: true, decomposer: { mode: "none" } },
		];
		await workspace.writeDecomposition(state.runId, {
			schemaVersion: "team/task-decomposition-1",
			parentTaskId: "discover",
			mode: "leaf",
			decision: "split",
			reason: "persisted split",
			decomposedAt: new Date().toISOString(),
			children: childTasks.map(task => ({ taskId: task.id, title: task.title, task })),
		});
		await workspace.appendChildTaskStates(state.runId, childTasks);
		const attemptA = await workspace.createAttempt(state.runId, "discover__a");
		const resultA = await workspace.writeAcceptedResult(state.runId, "discover__a", attemptA.attemptId, JSON.stringify({ items: [{ id: "a", title: "A" }] }));
		await workspace.finishAttempt(state.runId, "discover__a", attemptA.attemptId, { status: "succeeded", phase: "succeeded", resultRef: resultA });
		const attemptB = await workspace.createAttempt(state.runId, "discover__b");
		const resultB = await workspace.writeAcceptedResult(state.runId, "discover__b", attemptB.attemptId, JSON.stringify({ items: [{ id: "b", title: "B" }] }));
		await workspace.finishAttempt(state.runId, "discover__b", attemptB.attemptId, { status: "succeeded", phase: "succeeded", resultRef: resultB });
		const reclaimed = (await workspace.getState(state.runId))!;
		reclaimed.taskStates["discover__a"]!.status = "succeeded";
		reclaimed.taskStates["discover__a"]!.attemptCount = 1;
		reclaimed.taskStates["discover__a"]!.activeAttemptId = attemptA.attemptId;
		reclaimed.taskStates["discover__a"]!.resultRef = resultA;
		reclaimed.taskStates["discover__b"]!.status = "succeeded";
		reclaimed.taskStates["discover__b"]!.attemptCount = 1;
		reclaimed.taskStates["discover__b"]!.activeAttemptId = attemptB.attemptId;
		reclaimed.taskStates["discover__b"]!.resultRef = resultB;
		reclaimed.summary.succeededTasks = 2;
		await workspace.saveState(reclaimed);

		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.deepEqual(runner.decomposerTaskIds, []);
		assert.deepEqual(runner.workerTaskIds, ["process_each__a", "process_each__b"]);
		assert.equal(final.taskStates.process_each?.status, "succeeded");
		assert.equal(final.taskStates["process_each__a"]?.status, "succeeded");
		assert.equal(final.taskStates["process_each__b"]?.status, "succeeded");
		assert.equal(Object.keys(final.taskStates).filter(taskId => taskId.startsWith("discover__")).length, 2);
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P22 Task 4: decomposed discovery standard aggregation ──

test("decomposed discovery parent writes discovery-result.json after aggregating child outputs", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split discovery",
			children: [
				{ id: "discover__a", title: "Discover A", input: { text: "discover a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
				{ id: "discover__b", title: "Discover B", input: { text: "discover b" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
			],
		},
	], {
		checkerOutputs: [
			{ verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "a", title: "A" }] }) },
			{ verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "b", title: "B" }] }) },
		],
	});
	const { root, plan, orchestrator, workspace } = await setupTasks(decomposedDiscoveryPlan(), runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.equal(final.taskStates.discover?.status, "succeeded");
		assert.equal(final.taskStates.process_each?.status, "succeeded");
		assert.equal(final.taskStates["process_each__a"]?.status, "succeeded");
		assert.equal(final.taskStates["process_each__b"]?.status, "succeeded");

		// P22 review: directly assert parent discovery-result.json
		const parentAttemptId = final.taskStates.discover?.activeAttemptId;
		assert.ok(parentAttemptId, "parent must have an activeAttemptId pointing to aggregation attempt");
		const record = await workspace.readDiscoveryResult(state.runId, "discover", parentAttemptId);
		assert.ok(record, "parent discovery-result.json must exist");
		assert.equal(record.schemaVersion, "team/discovery-result-1");
		assert.equal(record.taskId, "discover");
		assert.equal(record.attemptId, parentAttemptId);
		assert.equal(record.outputKey, "items");
		assert.deepEqual(record.items.map(i => i.id), ["a", "b"]);
		assert.ok(record.sourceRef, "sourceRef should identify aggregation source");

		// Parent aggregation attempt: succeeded, no worker/checker/watcher
		const attemptRaw = await workspace.readAttemptFile(state.runId, "discover", parentAttemptId, "attempt.json");
		assert.ok(attemptRaw);
		const attemptMeta = JSON.parse(attemptRaw);
		assert.equal(attemptMeta.status, "succeeded");
		assert.equal(attemptMeta.worker.length, 0, "parent aggregation attempt must not have worker entries");
		assert.equal(attemptMeta.checker.length, 0, "parent aggregation attempt must not have checker entries");
		assert.equal(attemptMeta.watcher, null, "parent aggregation attempt must not have watcher entry");

		assert.ok(!runner.workerTaskIds.includes("discover"), "split discovery parent must not run worker");

		const expansion = await workspace.readExpansion(state.runId, "process_each");
		assert.ok(expansion);
		assert.equal(expansion.children.length, 2);
		assert.deepEqual(expansion.children.map(c => c.sourceItemId), ["a", "b"]);
	} finally {
		await rm(root, { recursive: true });
	}
});

// -- P24: decomposer parent aggregation with skipped children --

test("P24: decomposed parent with all skipped children becomes skipped", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-decomp-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const runner = new DecompositionCaptureRunner([{
			decision: "split",
			reason: "two subtasks",
			children: [
				{ id: "child_a", title: "A", input: { text: "a" }, acceptance: { rules: ["ok"] } },
				{ id: "child_b", title: "B", input: { text: "b" }, acceptance: { rules: ["ok"] } },
			],
		}]);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "skip parent",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [{ id: "parent", title: "P", input: { text: "p" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "leaf" } }],
			outputContract: { text: "out" },
		});
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		const afterSet = await workspace.getState(state.runId);
		afterSet!.taskStates.child_a!.manualDisposition = "skip";
		afterSet!.taskStates.child_b!.manualDisposition = "skip";
		await workspace.saveState(afterSet!);

		await orchestrator.rerunRun(state.runId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates.child_a?.status, "skipped");
		assert.equal(final.taskStates.child_b?.status, "skipped");
		assert.equal(final.taskStates.parent?.status, "skipped", "parent should be skipped when all children are skipped");
		assert.ok(final.summary.skippedTasks >= 3, "should count all skipped tasks");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("P24: decomposed parent with mixed succeeded+skipped children becomes succeeded", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-decomp-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const runner = new DecompositionCaptureRunner([{
			decision: "split",
			reason: "two subtasks",
			children: [
				{ id: "child_a", title: "A", input: { text: "a" }, acceptance: { rules: ["ok"] } },
				{ id: "child_b", title: "B", input: { text: "b" }, acceptance: { rules: ["ok"] } },
			],
		}]);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "mixed skip",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [{ id: "parent", title: "P", input: { text: "p" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "leaf" } }],
			outputContract: { text: "out" },
		});
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		const afterSet = await workspace.getState(state.runId);
		afterSet!.taskStates.child_b!.manualDisposition = "skip";
		await workspace.saveState(afterSet!);

		await orchestrator.rerunRun(state.runId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates.child_a?.status, "succeeded", "child_a should be reused");
		assert.equal(final.taskStates.child_b?.status, "skipped");
		assert.equal(final.taskStates.parent?.status, "succeeded", "parent should succeed when at least one child succeeded and no child failed");
	} finally {
		await rm(root, { recursive: true });
	}
});


test("decomposed discovery aggregation falls back to worker output and writes parent standard result", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split discovery",
			children: [
				{ id: "discover__a", title: "Discover A", input: { text: "discover a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
			],
		},
	], {
		workerOutputs: [
			JSON.stringify({ items: [{ id: "a", title: "A" }] }),
			"processed A",
		],
		checkerOutputs: [
			{ verdict: "pass", reason: "summary accepted", resultContent: "总共 1 项：A。" },
		],
	});
	const { root, plan, orchestrator, workspace } = await setupTasks(decomposedDiscoveryPlan(), runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.equal(final.taskStates.discover?.status, "succeeded");
		assert.equal(final.taskStates.process_each?.status, "succeeded");
		assert.equal(final.taskStates["process_each__a"]?.status, "succeeded");

		// P22 review: directly assert parent standard result
		const parentAttemptId = final.taskStates.discover?.activeAttemptId;
		assert.ok(parentAttemptId, "parent must have activeAttemptId");
		const record = await workspace.readDiscoveryResult(state.runId, "discover", parentAttemptId);
		assert.ok(record, "parent discovery-result.json must exist");
		assert.equal(record.outputKey, "items");
		assert.deepEqual(record.items.map(i => i.id), ["a"]);

		const expansion = await workspace.readExpansion(state.runId, "process_each");
		assert.equal(expansion?.children.length, 1);
		assert.equal(expansion?.children[0]?.sourceItemId, "a");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("malformed decomposed child output fails parent without writing partial standard result", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split discovery",
			children: [
				{ id: "discover__a", title: "Discover A", input: { text: "discover a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
				{ id: "discover__b", title: "Discover B", input: { text: "discover b" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
			],
		},
	], {
		checkerOutputs: [
			{ verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "a", title: "A" }] }) },
			{ verdict: "pass", reason: "ok", resultContent: JSON.stringify({ nope: [{ id: "b", title: "B" }] }) },
		],
	});
	const { root, plan, orchestrator, workspace } = await setupTasks(decomposedDiscoveryPlan(), runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates.discover?.status, "failed");
		assert.match(final.taskStates.discover?.errorSummary ?? "", /failed to aggregate decomposed discovery output from child discover__b/);
		assert.equal(final.taskStates.process_each?.status, "failed");

		// P22 review: no parent standard result written on malformed child
		const parentAttemptId = final.taskStates.discover?.activeAttemptId;
		if (parentAttemptId) {
			const record = await workspace.readDiscoveryResult(state.runId, "discover", parentAttemptId);
			assert.equal(record, null, "no parent discovery-result.json must exist on malformed child output");
		}

		const expansion = await workspace.readExpansion(state.runId, "process_each");
		assert.equal(expansion, null);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("decomposed discovery child item without stable id fails parent without standard result", async () => {
	const runner = new DecompositionCaptureRunner([
		{
			decision: "split",
			reason: "split discovery",
			children: [
				{ id: "discover__a", title: "Discover A", input: { text: "discover a" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "none" } },
			],
		},
	], {
		checkerOutputs: [
			{ verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ title: "No stable id" }] }) },
		],
	});
	const { root, plan, orchestrator, workspace } = await setupTasks(decomposedDiscoveryPlan(), runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates.discover?.status, "failed");
		assert.match(final.taskStates.discover?.errorSummary ?? "", /failed to aggregate decomposed discovery output from child discover__a/);
		assert.equal(final.taskStates.process_each?.status, "failed");
		const parentAttemptId = final.taskStates.discover?.activeAttemptId;
		if (parentAttemptId) {
			const record = await workspace.readDiscoveryResult(state.runId, "discover", parentAttemptId);
			assert.equal(record, null, "no parent discovery-result.json must exist when child item lacks a stable id");
		}
		const expansion = await workspace.readExpansion(state.runId, "process_each");
		assert.equal(expansion, null);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("reclaimed decomposed discovery aggregates existing child results into standard result", async () => {
	const runner = new DecompositionCaptureRunner([
		{ decision: "no_split", reason: "should not run", children: [] },
	], {
		checkerOutputs: [
			{ verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "a", title: "A" }] }) },
			{ verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "b", title: "B" }] }) },
		],
	});
	const { root, plan, orchestrator, workspace } = await setupTasks(decomposedDiscoveryPlan(), runner);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const childTasks: TeamTask[] = [
			{ id: "discover__a", title: "Discover A", input: { text: "discover a" }, acceptance: { rules: ["ok"] }, parentTaskId: "discover", generated: true, decomposer: { mode: "none" } },
			{ id: "discover__b", title: "Discover B", input: { text: "discover b" }, acceptance: { rules: ["ok"] }, parentTaskId: "discover", generated: true, decomposer: { mode: "none" } },
		];
		await workspace.writeDecomposition(state.runId, {
			schemaVersion: "team/task-decomposition-1",
			parentTaskId: "discover",
			mode: "leaf",
			decision: "split",
			reason: "persisted split",
			decomposedAt: new Date().toISOString(),
			children: childTasks.map(task => ({ taskId: task.id, title: task.title, task })),
		});
		await workspace.appendChildTaskStates(state.runId, childTasks);

		const attemptA = await workspace.createAttempt(state.runId, "discover__a");
		const resultA = await workspace.writeAcceptedResult(state.runId, "discover__a", attemptA.attemptId, JSON.stringify({ items: [{ id: "a", title: "A" }] }));
		await workspace.finishAttempt(state.runId, "discover__a", attemptA.attemptId, { status: "succeeded", phase: "succeeded", resultRef: resultA });
		const attemptB = await workspace.createAttempt(state.runId, "discover__b");
		const resultB = await workspace.writeAcceptedResult(state.runId, "discover__b", attemptB.attemptId, JSON.stringify({ items: [{ id: "b", title: "B" }] }));
		await workspace.finishAttempt(state.runId, "discover__b", attemptB.attemptId, { status: "succeeded", phase: "succeeded", resultRef: resultB });

		const reclaimed = (await workspace.getState(state.runId))!;
		reclaimed.taskStates["discover__a"]!.status = "succeeded";
		reclaimed.taskStates["discover__a"]!.attemptCount = 1;
		reclaimed.taskStates["discover__a"]!.activeAttemptId = attemptA.attemptId;
		reclaimed.taskStates["discover__a"]!.resultRef = resultA;
		reclaimed.taskStates["discover__b"]!.status = "succeeded";
		reclaimed.taskStates["discover__b"]!.attemptCount = 1;
		reclaimed.taskStates["discover__b"]!.activeAttemptId = attemptB.attemptId;
		reclaimed.taskStates["discover__b"]!.resultRef = resultB;
		reclaimed.summary.succeededTasks = 2;
		await workspace.saveState(reclaimed);

		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.equal(final.taskStates.discover?.status, "succeeded");
		assert.equal(final.taskStates.process_each?.status, "succeeded");
		assert.equal(final.taskStates["process_each__a"]?.status, "succeeded");
		assert.equal(final.taskStates["process_each__b"]?.status, "succeeded");

		// P22 review: reclaimed run must have parent standard result
		const parentAttemptId = final.taskStates.discover?.activeAttemptId;
		assert.ok(parentAttemptId, "parent must have activeAttemptId after reclaim");
		const record = await workspace.readDiscoveryResult(state.runId, "discover", parentAttemptId);
		assert.ok(record, "parent discovery-result.json must exist after reclaim");
		assert.equal(record.outputKey, "items");
		assert.deepEqual(record.items.map(i => i.id), ["a", "b"]);

		assert.deepEqual(runner.decomposerTaskIds, [], "decomposer must not rerun on reclaim");

		const expansion = await workspace.readExpansion(state.runId, "process_each");
		assert.ok(expansion);
		assert.equal(expansion.children.length, 2);
		assert.deepEqual(expansion.children.map(c => c.sourceItemId), ["a", "b"]);
	} finally {
		await rm(root, { recursive: true });
	}
});
