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

class DiscoveryMockRunner extends MockRoleRunner {
	private callIndex = 0;
	private readonly discoveryOutput: string;
	private readonly discoveryAcceptedResult: string;

	constructor(discoveryOutput: string, discoveryAcceptedResult = discoveryOutput) {
		super();
		this.discoveryOutput = discoveryOutput;
		this.discoveryAcceptedResult = discoveryAcceptedResult;
	}

	async runWorker(input: import("../src/team/role-runner.js").WorkerInput): Promise<import("../src/team/role-runner.js").WorkerOutput> {
		this.callIndex++;
		if (input.task.type === "discovery") {
			return { content: this.discoveryOutput, artifactRefs: [] };
		}
		return { content: `任务 ${input.task.id} 完成`, artifactRefs: [] };
	}

	async runChecker(input: import("../src/team/role-runner.js").CheckerInput): Promise<import("../src/team/role-runner.js").CheckerOutput> {
		if (input.task.type === "discovery") {
			return { verdict: "pass", reason: "ok", resultContent: this.discoveryAcceptedResult };
		}
		return { verdict: "pass", reason: "ok", resultContent: "accepted result" };
	}
}

// ── P22 Review Fix: outputKey-specific error messages ──

test("discovery validation error includes actual outputKey not hardcoded 'items'", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const runner = new DiscoveryMockRunner(JSON.stringify({ wrong: [{ id: "a" }] }));
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "custom outputKey",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{
					id: "discover", type: "discovery", title: "Discover battles",
					input: { text: "Find" }, acceptance: { rules: ["ok"] },
					discovery: { outputKey: "battles" },
				},
			],
			outputContract: { text: "report" },
		});
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace,
			roleRunner: runner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
		});

		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates["discover"]?.status, "failed");
		const errSummary = final.taskStates["discover"]?.errorSummary ?? "";
		assert.match(errSummary, /battles/, "error must mention actual outputKey 'battles'");
		assert.doesNotMatch(errSummary, /expected outputKey 'items'/, "error must not contain hardcoded 'items'");
	} finally {
		await rm(root, { recursive: true });
	}
});
