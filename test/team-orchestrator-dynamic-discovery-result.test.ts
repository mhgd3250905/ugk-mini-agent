import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

class ReferencedFileDiscoveryRunner extends MockRoleRunner {
	constructor(private readonly root: string) {
		super();
	}

	async runWorker(input: import("../src/team/role-runner.js").WorkerInput): Promise<import("../src/team/role-runner.js").WorkerOutput> {
		if (input.task.type === "discovery") {
			const outputDir = join(this.root, "runs", input.runId, "agent-workspaces", input.attemptId, "worker", "output");
			await mkdir(outputDir, { recursive: true });
			await writeFile(join(outputDir, "items.md"), [
				"# Items",
				"",
				"```json",
				JSON.stringify({ items: [{ id: "battle_01", title: "Alpha" }, { id: "battle_02", title: "Beta" }] }),
				"```",
				"",
			].join("\n"), "utf8");
			return { content: "JSON written to output/items.md", artifactRefs: [] };
		}
		return { content: `任务 ${input.task.id} 完成`, artifactRefs: [] };
	}

	async runChecker(input: import("../src/team/role-runner.js").CheckerInput): Promise<import("../src/team/role-runner.js").CheckerOutput> {
		if (input.task.type === "discovery") {
			return {
				verdict: "pass",
				reason: "ok",
				resultContent: `输出文件位于 \`/app/.data/team/runs/${input.runId}/agent-workspaces/${input.attemptId}/worker/output/items.md\`，JSON结构完整可解析。`,
			};
		}
		return { verdict: "pass", reason: "ok", resultContent: "accepted result" };
	}
}

async function setupDiscoveryPlan(discoveryOutput: string, discoveryAcceptedResult?: string) {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	const planStore = new PlanStore(root);
	const unitStore = new TeamUnitStore(root);
	const workspace = new RunWorkspace(root);
	const runner = new DiscoveryMockRunner(discoveryOutput, discoveryAcceptedResult);
	const unit = await unitStore.create({
		title: "t", description: "d",
		watcherProfileId: "w", workerProfileId: "wo",
		checkerProfileId: "c", finalizerProfileId: "f",
	});
	const plan = await planStore.create({
		title: "discovery + for_each",
		defaultTeamUnitId: unit.teamUnitId,
		goal: { text: "discover and process" },
		tasks: [
			{
				id: "discover",
				type: "discovery",
				title: "Discover items",
				input: { text: "Find all items" },
				acceptance: { rules: ["output contains items"] },
				discovery: { outputKey: "items" },
			},
			{
				id: "process_each",
				type: "for_each",
				title: "Process each item",
				input: { text: "Placeholder" },
				acceptance: { rules: ["ok"] },
				forEach: {
					itemsFrom: "discover.items",
					mode: "sequential",
					taskTemplate: {
						title: "Process {{item.title}}",
						input: { text: "Process item {{item.id}}" },
						acceptance: { rules: ["output is valid"] },
					},
				},
			},
		],
		outputContract: { text: "summary report" },
	});
	const orchestrator = new TeamOrchestrator({
		planStore, teamUnitStore: unitStore, workspace,
		roleRunner: runner, dataDir: root,
		maxCheckerRevisions: 3, maxWatcherRevisions: 1,
		maxRunDurationMinutes: 60,
	});
	return { root, plan, orchestrator, workspace, planStore };
}

// ── P22 Task 2: standardize discovery results before success ──

test("discovery writes discovery-result.json when accepted result contains items object", async () => {
	const { root, plan, orchestrator, workspace } = await setupDiscoveryPlan(
		JSON.stringify({ items: [{ id: "alpha", title: "Alpha" }] }),
	);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates["discover"]?.status, "succeeded");
		const ts = final.taskStates["discover"]!;
		assert.ok(ts.activeAttemptId);
		const discoveryResult = await workspace.readDiscoveryResult(state.runId, "discover", ts.activeAttemptId!);
		assert.ok(discoveryResult, "discovery-result.json should exist for standard accepted result");
		assert.equal(discoveryResult!.outputKey, "items");
		assert.equal(discoveryResult!.items.length, 1);
		assert.equal(discoveryResult!.items[0]!.id, "alpha");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("discovery writes discovery-result.json when accepted result is summary but worker output has JSON", async () => {
	const { root, plan, orchestrator, workspace } = await setupDiscoveryPlan(
		JSON.stringify({ items: [{ id: "battle_01", title: "Alpha" }] }),
		"总共 1 项，按时间线排列。每项包含 id 和 title。",
	);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates["discover"]?.status, "succeeded");
		const ts = final.taskStates["discover"]!;
		assert.ok(ts.activeAttemptId);
		const discoveryResult = await workspace.readDiscoveryResult(state.runId, "discover", ts.activeAttemptId!);
		assert.ok(discoveryResult, "discovery-result.json should exist when worker output provides items");
		assert.equal(discoveryResult!.items[0]!.id, "battle_01");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("discovery writes discovery-result.json when accepted result references run-scoped file", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const runner = new ReferencedFileDiscoveryRunner(root);
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "referenced discovery",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "discover and process" },
			tasks: [
				{
					id: "discover", type: "discovery", title: "Discover",
					input: { text: "Find" }, acceptance: { rules: ["ok"] },
					discovery: { outputKey: "items" },
				},
				{
					id: "process_each", type: "for_each", title: "Process",
					input: { text: "p" }, acceptance: { rules: ["ok"] },
					forEach: {
						itemsFrom: "discover.items", mode: "sequential",
						taskTemplate: { title: "P", input: { text: "p" }, acceptance: { rules: ["ok"] } },
					},
				},
			],
			outputContract: { text: "done" },
		});
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace,
			roleRunner: runner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
		});

		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates["discover"]?.status, "succeeded");
		const ts = final.taskStates["discover"]!;
		assert.ok(ts.activeAttemptId);
		const discoveryResult = await workspace.readDiscoveryResult(state.runId, "discover", ts.activeAttemptId!);
		assert.ok(discoveryResult, "discovery-result.json should exist for referenced file discovery");
		assert.equal(discoveryResult!.items.length, 2);
		assert.equal(discoveryResult!.items[0]!.id, "battle_01");
		assert.equal(discoveryResult!.items[1]!.id, "battle_02");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("discovery task fails when outputKey not found in result", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const runner = new DiscoveryMockRunner(JSON.stringify({ wrong_key: [{ id: "a", title: "A" }] }));
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "missing outputKey",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{
					id: "discover", type: "discovery", title: "Discover",
					input: { text: "Find" }, acceptance: { rules: ["ok"] },
					discovery: { outputKey: "items" },
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
		assert.match(final.taskStates["discover"]?.errorSummary ?? "", /output validation failed|discovery result validation failed/);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("discovery task fails when items lack string id", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const runner = new DiscoveryMockRunner(JSON.stringify({ items: [{ title: "NoId" }, { id: "", title: "EmptyId" }] }));
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "missing ids",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{
					id: "discover", type: "discovery", title: "Discover",
					input: { text: "Find" }, acceptance: { rules: ["ok"] },
					discovery: { outputKey: "items" },
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
		assert.match(final.taskStates["discover"]?.errorSummary ?? "", /output validation failed|discovery result validation failed/);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("discovery task fails when items contain non-object values", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const runner = new DiscoveryMockRunner(JSON.stringify({ items: ["string_item", null, [1, 2], { id: "ok", title: "OK" }] }));
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "non-object items",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{
					id: "discover", type: "discovery", title: "Discover",
					input: { text: "Find" }, acceptance: { rules: ["ok"] },
					discovery: { outputKey: "items" },
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
		assert.match(final.taskStates["discover"]?.errorSummary ?? "", /output validation failed|discovery result validation failed/);
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P22 Task 3: for_each prefers standard discovery results ──

test("for_each uses discovery-result.json even when accepted result is unparseable summary", async () => {
	// Simulate a pre-existing run where discovery already succeeded with
	// discovery-result.json written, but accepted-result.md is a natural-language
	// summary. On resume/reclaim, for_each should use the standard file.
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
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
			title: "standard result priority",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{
					id: "discover", type: "discovery", title: "Discover",
					input: { text: "Find" }, acceptance: { rules: ["ok"] },
					discovery: { outputKey: "items" },
				},
				{
					id: "process", type: "for_each", title: "Process",
					input: { text: "p" }, acceptance: { rules: ["ok"] },
					forEach: {
						itemsFrom: "discover.items", mode: "sequential",
						taskTemplate: { title: "P {{item.title}}", input: { text: "p" }, acceptance: { rules: ["ok"] } },
					},
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

		// Manually set up a succeeded discovery task with standard result file
		// but an unparseable accepted-result.md
		const attemptId = "attempt_std_test";
		await mkdir(join(root, "runs", state.runId, "tasks", "discover", "attempts", attemptId), { recursive: true });
		await writeFile(
			join(root, "runs", state.runId, "tasks", "discover", "attempts", attemptId, "attempt.json"),
			JSON.stringify({
				attemptId, taskId: "discover", status: "succeeded", phase: "succeeded",
				createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
				finishedAt: new Date().toISOString(), worker: [], checker: [], watcher: null,
				resultRef: `tasks/discover/attempts/${attemptId}/accepted-result.md`, errorSummary: null,
			}),
			"utf8",
		);
		await writeFile(
			join(root, "runs", state.runId, "tasks", "discover", "attempts", attemptId, "accepted-result.md"),
			"这是一个纯文本摘要，没有任何 JSON。",
			"utf8",
		);
		await workspace.writeDiscoveryResult(state.runId, "discover", attemptId, {
			schemaVersion: "team/discovery-result-1",
			taskId: "discover",
			attemptId,
			outputKey: "items",
			items: [{ id: "std_a", title: "StdA" }, { id: "std_b", title: "StdB" }],
			sourceRef: `tasks/discover/attempts/${attemptId}/accepted-result.md`,
			createdAt: new Date().toISOString(),
		});

		// Set discovery task state to succeeded
		const patched = (await workspace.getState(state.runId))!;
		patched.taskStates["discover"]!.status = "succeeded";
		patched.taskStates["discover"]!.attemptCount = 1;
		patched.taskStates["discover"]!.activeAttemptId = attemptId;
		patched.taskStates["discover"]!.resultRef = `tasks/discover/attempts/${attemptId}/accepted-result.md`;
		patched.taskStates["discover"]!.progress = { phase: "succeeded", message: "succeeded", updatedAt: new Date().toISOString() };
		patched.summary.succeededTasks = 1;
		await workspace.saveState(patched);

		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates["discover"]?.status, "succeeded");
		assert.equal(final.taskStates["process"]?.status, "succeeded");
		assert.ok(final.taskStates["process__std_a"], "should use standardized items from discovery-result.json");
		assert.ok(final.taskStates["process__std_b"], "should use standardized items from discovery-result.json");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("for_each falls back to legacy parsing when discovery-result.json does not exist", async () => {
	const { root, plan, orchestrator } = await setupDiscoveryPlan(
		JSON.stringify({ items: [{ id: "legacy_a", title: "LegacyA" }] }),
		"总共 1 项：LegacyA。每项包含 id 和 title。",
	);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates["discover"]?.status, "succeeded");
		assert.equal(final.taskStates["process_each"]?.status, "succeeded");
		assert.ok(final.taskStates["process_each__legacy_a"]);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("for_each with wrong itemsFrom outputKey does not use discovery result", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const runner = new DiscoveryMockRunner(JSON.stringify({ items: [{ id: "a", title: "A" }] }));
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "wrong itemsFrom key",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{
					id: "discover", type: "discovery", title: "Discover",
					input: { text: "Find" }, acceptance: { rules: ["ok"] },
					discovery: { outputKey: "items" },
				},
				{
					id: "process", type: "for_each", title: "Process",
					input: { text: "p" }, acceptance: { rules: ["ok"] },
					forEach: {
						itemsFrom: "discover.wrong_key", mode: "sequential",
						taskTemplate: { title: "P", input: { text: "p" }, acceptance: { rules: ["ok"] } },
					},
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

		assert.equal(final.taskStates["discover"]?.status, "succeeded");
		assert.equal(final.taskStates["process"]?.status, "failed");
		assert.match(final.taskStates["process"]?.errorSummary ?? "", /failed to resolve discovery items/);
	} finally {
		await rm(root, { recursive: true });
	}
});
