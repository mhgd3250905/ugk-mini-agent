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
