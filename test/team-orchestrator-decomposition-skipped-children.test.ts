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
