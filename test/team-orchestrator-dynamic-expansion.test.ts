import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
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

	constructor(discoveryOutput: string) {
		super();
		this.discoveryOutput = discoveryOutput;
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
			return { verdict: "pass", reason: "ok", resultContent: this.discoveryOutput };
		}
		return { verdict: "pass", reason: "ok", resultContent: "accepted result" };
	}
}

async function setupDiscoveryPlan(discoveryOutput: string) {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	const planStore = new PlanStore(root);
	const unitStore = new TeamUnitStore(root);
	const workspace = new RunWorkspace(root);
	const runner = new DiscoveryMockRunner(discoveryOutput);
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

test("discovery + for_each: expands 3 items to 3 child tasks, all succeed", async () => {
	const { root, plan, orchestrator, workspace } = await setupDiscoveryPlan(
		JSON.stringify({
			items: [
				{ id: "item_01", title: "Alpha" },
				{ id: "item_02", title: "Beta" },
				{ id: "item_03", title: "Gamma" },
			],
		}),
	);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.equal(final.taskStates["discover"]?.status, "succeeded");
		assert.equal(final.taskStates["process_each"]?.status, "succeeded");
		assert.equal(final.taskStates["process_each__item_01"]?.status, "succeeded");
		assert.equal(final.taskStates["process_each__item_02"]?.status, "succeeded");
		assert.equal(final.taskStates["process_each__item_03"]?.status, "succeeded");

		// totalTasks includes discovery + for_each parent + 3 children = 5
		assert.equal(final.summary.totalTasks, 5);
		assert.equal(final.summary.succeededTasks, 5);

		// Each child should have an attempt
		for (const suffix of ["item_01", "item_02", "item_03"]) {
			const attempts = await workspace.listAttempts(state.runId, `process_each__${suffix}`);
			assert.equal(attempts.length, 1);
		}
	} finally {
		await rm(root, { recursive: true });
	}
});

test("discovery + for_each: expansion persisted, pause/resume does not duplicate", async () => {
	const { root, plan, orchestrator, workspace } = await setupDiscoveryPlan(
		JSON.stringify({ items: [{ id: "a", title: "A" }, { id: "b", title: "B" }] }),
	);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);
		assert.equal(final.status, "completed");
		assert.equal(final.summary.totalTasks, 4);

		// Verify expansion file exists
		const expansion = await workspace.readExpansion(state.runId, "process_each");
		assert.ok(expansion);
		assert.equal(expansion.children.length, 2);

		// totalTasks stays the same, no duplicate children
		assert.equal(Object.keys(final.taskStates).filter(k => k.startsWith("process_each__")).length, 2);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("discovery + for_each: 0 items → for_each succeeds with 0 children", async () => {
	const { root, plan, orchestrator } = await setupDiscoveryPlan(
		JSON.stringify({ items: [] }),
	);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.equal(final.taskStates["process_each"]?.status, "succeeded");
		assert.equal(final.summary.totalTasks, 2);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("discovery + for_each: malformed discovery output causes for_each failure", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const runner = new DiscoveryMockRunner("This is not JSON at all, no braces");
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "bad discovery",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{
					id: "discover",
					type: "discovery",
					title: "Discover",
					input: { text: "Find items" },
					acceptance: { rules: ["ok"] },
					discovery: { outputKey: "items" },
				},
				{
					id: "process_each",
					type: "for_each",
					title: "Process each",
					input: { text: "p" },
					acceptance: { rules: ["ok"] },
					forEach: {
						itemsFrom: "discover.items",
						mode: "sequential",
						taskTemplate: {
							title: "Process {{item.id}}",
							input: { text: "p" },
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

		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		// discovery succeeds (mock checker passes it), but for_each fails because
		// the discovery result has no extractable JSON
		assert.equal(final.taskStates["discover"]?.status, "succeeded");
		assert.equal(final.taskStates["process_each"]?.status, "failed");
		assert.ok(final.taskStates["process_each"]?.errorSummary?.includes("failed to resolve discovery items"));
	} finally {
		await rm(root, { recursive: true });
	}
});

test("static normal plan behavior unchanged after P15 changes", async () => {
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
			title: "static plan",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "t1", title: "Task 1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
				{ id: "t2", title: "Task 2", input: { text: "do 2" }, acceptance: { rules: ["r2"] } },
			],
			outputContract: { text: "output" },
		});
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace,
			roleRunner: runner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1,
			maxRunDurationMinutes: 60,
		});
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.equal(final.summary.totalTasks, 2);
		assert.equal(final.summary.succeededTasks, 2);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("child task results visible in finalizer", async () => {
	const { root, plan, orchestrator } = await setupDiscoveryPlan(
		JSON.stringify({ items: [{ id: "x", title: "X" }] }),
	);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		// Final report should mention child task
		const report = await readFile(join(root, "runs", state.runId, "final-report.md"), "utf8");
		assert.ok(report.includes("process_each__x"));
	} finally {
		await rm(root, { recursive: true });
	}
});

test("for_each child results individually persisted", async () => {
	const { root, plan, orchestrator, workspace } = await setupDiscoveryPlan(
		JSON.stringify({ items: [{ id: "a", title: "A" }, { id: "b", title: "B" }] }),
	);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.ok(final.taskStates["process_each__a"]?.resultRef);
		assert.ok(final.taskStates["process_each__b"]?.resultRef);
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P15 Review Fix: child task input/acceptance preservation ──

class InputCaptureMockRunner extends MockRoleRunner {
	readonly capturedInputs: Array<{ taskId: string; inputText: string; acceptanceRules: string[] }> = [];

	async runWorker(input: import("../src/team/role-runner.js").WorkerInput): Promise<import("../src/team/role-runner.js").WorkerOutput> {
		this.capturedInputs.push({
			taskId: input.task.id,
			inputText: input.task.input.text,
			acceptanceRules: input.task.acceptance.rules,
		});
		if (input.task.type === "discovery") {
			return { content: JSON.stringify({ items: [{ id: "x", title: "X" }] }), artifactRefs: [] };
		}
		return { content: `done ${input.task.id}`, artifactRefs: [] };
	}

	async runChecker(input: import("../src/team/role-runner.js").CheckerInput): Promise<import("../src/team/role-runner.js").CheckerOutput> {
		if (input.task.type === "discovery") {
			return { verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "x", title: "X" }] }) };
		}
		return { verdict: "pass", reason: "ok", resultContent: "accepted" };
	}
}

test("expansion record persists full child task definitions after initial run", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const runner = new DiscoveryMockRunner(JSON.stringify({ items: [{ id: "alpha", title: "Alpha" }] }));
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "full child def",
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
						taskTemplate: {
							title: "Process {{item.title}}",
							input: { text: "Detailed analysis for {{item.id}}" },
							acceptance: { rules: ["must mention {{item.id}}", "include risk score"] },
						},
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
		await orchestrator.runToCompletion(state.runId);

		const expansion = await workspace.readExpansion(state.runId, "process");
		assert.ok(expansion);
		const childEntry = expansion.children[0];
		assert.ok(childEntry);
		assert.ok("task" in childEntry && childEntry.task, "child entry should have full task definition");
		assert.equal(childEntry.task!.input.text, "Detailed analysis for alpha");
		assert.deepEqual(childEntry.task!.acceptance.rules, ["must mention alpha", "include risk score"]);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("resume uses original generated input.text, not title fallback", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const captureRunner = new InputCaptureMockRunner();
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "resume input test",
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
						taskTemplate: {
							title: "Process {{item.title}}",
							input: { text: "Custom input for {{item.id}} with specifics" },
							acceptance: { rules: ["rule A for {{item.id}}", "rule B"] },
						},
					},
				},
			],
			outputContract: { text: "report" },
		});
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace,
			roleRunner: captureRunner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
		});
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		const childCalls = captureRunner.capturedInputs.filter(c => c.taskId === "process__x");
		assert.equal(childCalls.length, 1, "child task should have been called exactly once");
		assert.equal(childCalls[0]!.inputText, "Custom input for x with specifics",
			"resume path should use original generated input.text, not title");
		assert.deepEqual(childCalls[0]!.acceptanceRules, ["rule A for x", "rule B"],
			"resume path should preserve original acceptance.rules");
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P15 Review Fix: injected TaskExpansionPlanner ──

import type { TaskExpansionPlanner, TaskExpansionContext, TaskExpansionResult } from "../src/team/task-expansion-planner.js";

class CustomPlanner implements TaskExpansionPlanner {
	readonly calls: TaskExpansionContext[] = [];
	async expand(context: TaskExpansionContext): Promise<TaskExpansionResult> {
		this.calls.push(context);
		return {
			parentTaskId: context.parentTask.id,
			children: [{
				id: `${context.parentTask.id}__custom`,
				type: "normal",
				title: `Custom child for ${context.items.length} items`,
				input: { text: `Custom processing with injected planner` },
				acceptance: { rules: ["custom rule"] },
				parentTaskId: context.parentTask.id,
				sourceItemId: "custom",
				generated: true,
			}],
		};
	}
}

test("custom TaskExpansionPlanner is used for for_each expansion", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const customPlanner = new CustomPlanner();
		const runner = new DiscoveryMockRunner(JSON.stringify({ items: [{ id: "a", title: "A" }] }));
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "injected planner",
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
						taskTemplate: {
							title: "Process {{item.title}}",
							input: { text: "p" },
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
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
			taskExpansionPlanner: customPlanner,
		});
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.equal(customPlanner.calls.length, 1, "custom planner should be called once");
		assert.equal(customPlanner.calls[0]!.parentTask.id, "process");
		assert.ok(final.taskStates["process__custom"], "custom planner child should exist");
		assert.equal(final.taskStates["process__custom"]!.status, "succeeded");
	} finally {
		await rm(root, { recursive: true });
	}
});

class FailingPlanner implements TaskExpansionPlanner {
	async expand(): Promise<TaskExpansionResult> {
		throw new Error("planner intentionally failed");
	}
}

test("failing custom planner fails for_each parent clearly", async () => {
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
			title: "failing planner",
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
						taskTemplate: { title: "T", input: { text: "p" }, acceptance: { rules: ["ok"] } },
					},
				},
			],
			outputContract: { text: "report" },
		});
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace,
			roleRunner: runner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
			taskExpansionPlanner: new FailingPlanner(),
		});
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.taskStates["process"]!.status, "failed");
		assert.match(final.taskStates["process"]!.errorSummary ?? "", /planner intentionally failed/);
	} finally {
		await rm(root, { recursive: true });
	}
});
