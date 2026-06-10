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
