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
	let childStarted!: () => void;
	const childStartedPromise = new Promise<void>(resolve => {
		childStarted = resolve;
	});
	class SlowFirstChildRunner extends DecompositionCaptureRunner {
		override async runWorker(input: WorkerInput) {
			if (input.task.id === "task_1__a") {
				childStarted();
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
		const runPromise = orchestrator.runToCompletion(state.runId);
		await childStartedPromise;
		const patched = (await workspace.getState(state.runId))!;
		patched.maxRunDurationMinutes = 0.0001;
		await workspace.saveState(patched);

		const final = await runPromise;

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
