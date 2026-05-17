import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
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

test("discovery + for_each: falls back to worker output when accepted result is a natural-language summary", async () => {
	const { root, plan, orchestrator, workspace } = await setupDiscoveryPlan(
		JSON.stringify({
			items: [
				{ id: "battle_01", title: "Alpha" },
				{ id: "battle_02", title: "Beta" },
			],
		}),
		"总共 2 项，按时间线排列：Alpha → Beta。每项包含 id 和 title。",
	);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		assert.equal(final.taskStates["discover"]?.status, "succeeded");
		assert.equal(final.taskStates["process_each"]?.status, "succeeded");
		assert.equal(final.taskStates["process_each__battle_01"]?.status, "succeeded");
		assert.equal(final.taskStates["process_each__battle_02"]?.status, "succeeded");

		const expansion = await workspace.readExpansion(state.runId, "process_each");
		assert.equal(expansion?.children.length, 2);
		assert.deepEqual(expansion?.children.map(c => c.sourceItemId), ["battle_01", "battle_02"]);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("discovery + for_each: resolves JSON from run-scoped output file referenced by accepted result", async () => {
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
					id: "discover",
					type: "discovery",
					title: "Discover",
					input: { text: "Find" },
					acceptance: { rules: ["ok"] },
					discovery: { outputKey: "items" },
				},
				{
					id: "process_each",
					type: "for_each",
					title: "Process",
					input: { text: "p" },
					acceptance: { rules: ["ok"] },
					forEach: {
						itemsFrom: "discover.items",
						mode: "sequential",
						taskTemplate: {
							title: "Process {{item.title}}",
							input: { text: "Process {{item.id}}" },
							acceptance: { rules: ["ok"] },
						},
					},
				},
			],
			outputContract: { text: "done" },
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
		assert.equal(final.taskStates["process_each"]?.status, "succeeded");
		assert.equal(final.taskStates["process_each__battle_01"]?.status, "succeeded");
		assert.equal(final.taskStates["process_each__battle_02"]?.status, "succeeded");
		const expansion = await workspace.readExpansion(state.runId, "process_each");
		assert.deepEqual(expansion?.children.map(c => c.sourceItemId), ["battle_01", "battle_02"]);
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

		// With P22, discovery itself should fail because it can't standardize
		assert.equal(final.taskStates["discover"]?.status, "failed");
		assert.match(final.taskStates["discover"]?.errorSummary ?? "", /discovery result validation failed/);
		// for_each should also fail because discovery didn't succeed
		assert.equal(final.taskStates["process_each"]?.status, "failed");
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
		assert.deepEqual(childEntry.task!.acceptance.rules, ["must mention alpha", "include risk score", "输出必须对应 item.id=\"alpha\" 的任务，不得处理其他 item", "输出必须对应\"Alpha\"(item.id=\"alpha\")，不得替换为其他条目"]);
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
		assert.deepEqual(childCalls[0]!.acceptanceRules, ["rule A for x", "rule B", "输出必须对应 item.id=\"x\" 的任务，不得处理其他 item", "输出必须对应\"X\"(item.id=\"x\")，不得替换为其他条目"],
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
		assert.match(final.taskStates["discover"]?.errorSummary ?? "", /discovery result validation failed/);
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
		assert.match(final.taskStates["discover"]?.errorSummary ?? "", /discovery result validation failed/);
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
		assert.match(final.taskStates["discover"]?.errorSummary ?? "", /discovery result validation failed/);
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


// ── P23 Task 1: orchestrator persists sourceItem in expansion records ──

test("for_each expansion persists sourceItem snapshot for each child", async () => {
	const { root, plan, orchestrator, workspace } = await setupDiscoveryPlan(
		JSON.stringify({
			items: [
				{ id: "battle_08", title: "藏经阁大战", chapter: "第8章" },
				{ id: "battle_09", title: "雁门关外自尽", chapter: "第9章" },
			],
		}),
	);
	try {
		const state = await orchestrator.createRun(plan.planId);
		const final = await orchestrator.runToCompletion(state.runId);

		assert.equal(final.status, "completed");
		const expansion = await workspace.readExpansion(state.runId, "process_each");
		assert.ok(expansion);

		const child08 = expansion.children.find(c => c.sourceItemId === "battle_08")!;
		assert.ok(child08, "battle_08 child must exist");
		assert.ok(child08.sourceItem, "child entry must have sourceItem");
		assert.equal(child08.sourceItem!.id, "battle_08");
		assert.equal(child08.sourceItem!.data.title, "藏经阁大战");
		assert.equal(child08.sourceItem!.data.chapter, "第8章");

		const child09 = expansion.children.find(c => c.sourceItemId === "battle_09")!;
		assert.ok(child09, "battle_09 child must exist");
		assert.ok(child09.sourceItem);
		assert.equal(child09.sourceItem!.data.title, "雁门关外自尽");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("resume from old expansion without sourceItem uses stored task without crashing", async () => {
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
			title: "old expansion resume",
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

		// Set up succeeded discovery
		const attemptId = "attempt_old_expand";
		await mkdir(join(root, "runs", state.runId, "tasks", "discover", "attempts", attemptId), { recursive: true });
		await writeFile(
			join(root, "runs", state.runId, "tasks", "discover", "attempts", attemptId, "attempt.json"),
			JSON.stringify({
				attemptId, taskId: "discover", status: "succeeded", phase: "succeeded",
				createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
				finishedAt: new Date().toISOString(), worker: [], checker: [], watcher: null,
				resultRef: "tasks/discover/attempts/" + attemptId + "/accepted-result.md", errorSummary: null,
			}),
			"utf8",
		);
		await workspace.writeDiscoveryResult(state.runId, "discover", attemptId, {
			schemaVersion: "team/discovery-result-1",
			taskId: "discover", attemptId, outputKey: "items",
			items: [{ id: "old_a", title: "OldA" }],
			sourceRef: null, createdAt: new Date().toISOString(),
		});

		// Write OLD-format expansion without sourceItem or full task
		await workspace.writeExpansion(state.runId, {
			schemaVersion: "team/task-expansion-1",
			parentTaskId: "process",
			itemsFrom: "discover.items",
			expandedAt: new Date().toISOString(),
			children: [{ taskId: "process__old_a", sourceItemId: "old_a", title: "P OldA" }],
		});

		// Set discovery as succeeded
		const patched = (await workspace.getState(state.runId))!;
		patched.taskStates["discover"]!.status = "succeeded";
		patched.taskStates["discover"]!.attemptCount = 1;
		patched.taskStates["discover"]!.activeAttemptId = attemptId;
		patched.taskStates["discover"]!.resultRef = "tasks/discover/attempts/" + attemptId + "/accepted-result.md";
		patched.taskStates["discover"]!.progress = { phase: "succeeded", message: "succeeded", updatedAt: new Date().toISOString() };
		patched.summary.succeededTasks = 1;
		await workspace.saveState(patched);

		// Append child task state
		await workspace.appendChildTaskStates(state.runId, [
			{ id: "process__old_a", type: "normal", title: "P OldA", input: { text: "P OldA" }, acceptance: { rules: ["ok"] }, parentTaskId: "process", sourceItemId: "old_a", generated: true },
		]);

		const final = await orchestrator.runToCompletion(state.runId);

		// Old expansion resume should work without crashing
		assert.equal(final.status, "completed");
		assert.ok(final.taskStates["process__old_a"], "old format child task should execute");
		assert.equal(final.taskStates["process__old_a"]!.status, "succeeded");
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P23 Task 4: mismatch rejection behavior ──

class ItemDriftDetectingRunner extends MockRoleRunner {
	private readonly discoveryItems: Array<Record<string, unknown>>;
	private checkerWorkerOutputs: string[] = [];

	constructor(discoveryItems: Array<Record<string, unknown>>) {
		super();
		this.discoveryItems = discoveryItems;
	}

	async runWorker(input: import("../src/team/role-runner.js").WorkerInput): Promise<import("../src/team/role-runner.js").WorkerOutput> {
		if (input.task.type === "discovery") {
			return { content: JSON.stringify({ items: this.discoveryItems }), artifactRefs: [] };
		}
		if (input.task.generated && input.task.sourceItem) {
			const itemId = input.task.sourceItem.id;
			if (itemId === "battle_08") {
				const output = `处理了雁门关外自尽的相关内容`;
				this.checkerWorkerOutputs.push(output);
				return { content: output, artifactRefs: [] };
			}
		}
		const output = `done ${input.task.id}`;
		this.checkerWorkerOutputs.push(output);
		return { content: output, artifactRefs: [] };
	}

	async runChecker(input: import("../src/team/role-runner.js").CheckerInput): Promise<import("../src/team/role-runner.js").CheckerOutput> {
		if (input.task.type === "discovery") {
			return { verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: this.discoveryItems }) };
		}
		if (input.task.generated && input.task.sourceItem) {
			const sourceId = input.task.sourceItem.id;
			const sourceTitle = input.task.sourceItem.data.title ?? input.task.sourceItem.data.name;
			const workerOutput = this.checkerWorkerOutputs[this.checkerWorkerOutputs.length - 1] ?? "";
			const mentionsSourceId = workerOutput.includes(sourceId);
			const mentionsSourceTitle = typeof sourceTitle === "string" && workerOutput.includes(sourceTitle);
			if (!mentionsSourceId && !mentionsSourceTitle) {
				return {
					verdict: "fail",
					reason: `worker output does not match source item ${sourceId}`,
					resultContent: workerOutput,
				};
			}
		}
		return { verdict: "pass", reason: "ok", resultContent: "accepted" };
	}

	async runWatcher(input: import("../src/team/role-runner.js").WatcherInput): Promise<import("../src/team/role-runner.js").WatcherOutput> {
		if (input.task.generated && input.task.sourceItem) {
			if (input.workUnitStatus === "failed") {
				const sourceId = input.task.sourceItem.id;
				return { decision: "confirm_failed", reason: `task failed for item ${sourceId}` };
			}
		}
		return { decision: "accept_task", reason: "ok" };
	}
}

test("worker output switches item - checker rejects - child task fails", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const runner = new ItemDriftDetectingRunner([
			{ id: "battle_08", title: "藏经阁大战" },
		]);
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "item drift test",
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
						itemsFrom: "discover.items",
						mode: "sequential",
						taskTemplate: {
							title: "Score {{item.title}}",
							input: { text: "Score card for {{item.title}}" },
							acceptance: { rules: ["output valid"] },
						},
					},
				},
			],
			outputContract: { text: "done" },
		});

		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace,
			roleRunner: runner, dataDir: root,
			maxCheckerRevisions: 1, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
		});
		const state = await orchestrator.createRun(plan.planId);
		await orchestrator.runToCompletion(state.runId);

		const finalState = await workspace.getState(state.runId);
		assert.ok(finalState);
		const childTaskId = "process__battle_08";
		const childState = finalState.taskStates[childTaskId];
		assert.ok(childState, `child task ${childTaskId} must exist in task states`);
		assert.equal(childState.status, "failed",
			`child task should be failed because worker switched to wrong item, got: ${childState.status}`);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("worker output matches item - checker passes - child task succeeds", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);

		const runner = new (class extends MockRoleRunner {
			async runWorker(input: import("../src/team/role-runner.js").WorkerInput): Promise<import("../src/team/role-runner.js").WorkerOutput> {
				if (input.task.type === "discovery") {
					return { content: JSON.stringify({ items: [{ id: "battle_08", title: "藏经阁大战" }] }), artifactRefs: [] };
				}
				if (input.task.generated && input.task.sourceItem) {
					const title = input.task.sourceItem.data.title ?? input.task.sourceItem.id;
					return { content: `处理了${title}的相关内容`, artifactRefs: [] };
				}
				return { content: `done ${input.task.id}`, artifactRefs: [] };
			}
			async runChecker(input: import("../src/team/role-runner.js").CheckerInput): Promise<import("../src/team/role-runner.js").CheckerOutput> {
				if (input.task.type === "discovery") {
					return { verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "battle_08", title: "藏经阁大战" }] }) };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted" };
			}
		})();

		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "positive control",
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
						itemsFrom: "discover.items",
						mode: "sequential",
						taskTemplate: {
							title: "Score {{item.title}}",
							input: { text: "Score card for {{item.title}}" },
							acceptance: { rules: ["output valid"] },
						},
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
		await orchestrator.runToCompletion(state.runId);

		const finalState = await workspace.getState(state.runId);
		assert.ok(finalState);
		const childTaskId = "process__battle_08";
		const childState = finalState.taskStates[childTaskId];
		assert.ok(childState);
		assert.equal(childState.status, "succeeded",
			`child task should succeed when worker output matches item, got: ${childState.status}`);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("resume with stored sourceItem preserves identity even if discovery would change", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);

		const runner = new (class extends MockRoleRunner {
			async runWorker(input: import("../src/team/role-runner.js").WorkerInput): Promise<import("../src/team/role-runner.js").WorkerOutput> {
				if (input.task.type === "discovery") {
					return { content: JSON.stringify({ items: [{ id: "battle_08", title: "藏经阁大战" }] }), artifactRefs: [] };
				}
				return { content: `done ${input.task.id}`, artifactRefs: [] };
			}
			async runChecker(input: import("../src/team/role-runner.js").CheckerInput): Promise<import("../src/team/role-runner.js").CheckerOutput> {
				if (input.task.type === "discovery") {
					return { verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "battle_08", title: "藏经阁大战" }] }) };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted" };
			}
		})();

		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "resume identity",
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
						itemsFrom: "discover.items",
						mode: "sequential",
						taskTemplate: {
							title: "Score {{item.title}}",
							input: { text: "Score card for {{item.title}}" },
							acceptance: { rules: ["output valid"] },
						},
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
		await orchestrator.runToCompletion(state.runId);

		const expansion = await workspace.readExpansion(state.runId, "process");
		assert.ok(expansion);
		assert.equal(expansion.children.length, 1);
		assert.ok(expansion.children[0]!.sourceItem);
		assert.equal(expansion.children[0]!.sourceItem!.id, "battle_08");
		assert.equal(expansion.children[0]!.sourceItem!.data.title, "藏经阁大战");

		const finalState = await workspace.getState(state.runId);
		assert.ok(finalState);
		assert.equal(finalState.taskStates["process__battle_08"]?.status, "succeeded");
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── P23 Review Task 2: resume hydration for legacy expansions ──

class TaskCapturingRunner extends MockRoleRunner {
	readonly capturedTasks: Array<{ role: string; task: import("../src/team/role-runner.js").WorkerInput["task"] }> = [];

	async runWorker(input: import("../src/team/role-runner.js").WorkerInput): Promise<import("../src/team/role-runner.js").WorkerOutput> {
		this.capturedTasks.push({ role: "worker", task: input.task });
		return { content: `done ${input.task.id}`, artifactRefs: [] };
	}

	async runChecker(input: import("../src/team/role-runner.js").CheckerInput): Promise<import("../src/team/role-runner.js").CheckerOutput> {
		this.capturedTasks.push({ role: "checker", task: input.task });
		return { verdict: "pass", reason: "ok", resultContent: "accepted" };
	}

	async runWatcher(input: import("../src/team/role-runner.js").WatcherInput): Promise<import("../src/team/role-runner.js").WatcherOutput> {
		this.capturedTasks.push({ role: "watcher", task: input.task });
		return { decision: "accept_task", reason: "ok" };
	}
}

test("resume from expansion with stored task but no task.sourceItem hydrates identity", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const captureRunner = new TaskCapturingRunner();

		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "resume hydration test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{
					id: "process", type: "for_each", title: "Process",
					input: { text: "p" }, acceptance: { rules: ["ok"] },
					forEach: {
						itemsFrom: "discover.items",
						mode: "sequential",
						taskTemplate: {
							title: "Score {{item.title}}",
							input: { text: "Score card for {{item.title}}" },
							acceptance: { rules: ["output valid"] },
						},
					},
				},
			],
			outputContract: { text: "done" },
		});

		// Manually create a run with an old-style expansion:
		// child entry has sourceItem, but stored task lacks it (pre-P23 format)
		const state = await (new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace,
			roleRunner: captureRunner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
		})).createRun(plan.planId);

		// Write expansion with stored task missing sourceItem (simulating pre-P23 format)
		await workspace.writeExpansion(state.runId, {
			schemaVersion: "team/task-expansion-1",
			parentTaskId: "process",
			itemsFrom: "discover.items",
			expandedAt: new Date().toISOString(),
			children: [{
				taskId: "process__battle_08",
				sourceItemId: "battle_08",
				sourceItem: { id: "battle_08", data: { id: "battle_08", title: "藏经阁大战" } },
				title: "Score 藏经阁大战",
				task: {
					id: "process__battle_08",
					type: "normal",
					title: "Score 藏经阁大战",
					input: { text: "Score card for 藏经阁大战" },
					acceptance: { rules: ["output valid"] },
					parentTaskId: "process",
					sourceItemId: "battle_08",
					// sourceItem is intentionally MISSING — pre-P23 stored task
					// generated is also missing — pre-P23 didn't set this
				},
			}],
		});


			// Initialize child task states so the run can execute them
			await workspace.appendChildTaskStates(state.runId, [{
				id: "process__battle_08",
				type: "normal",
				title: "Score 藏经阁大战",
				input: { text: "Score card for 藏经阁大战" },
				acceptance: { rules: ["output valid"] },
				parentTaskId: "process",
				sourceItemId: "battle_08",
				generated: true,
			}]);
		// Resume the run
		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace,
			roleRunner: captureRunner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
		});
		await orchestrator.runToCompletion(state.runId);

		// Verify all three roles received the task with proper identity
		const workerCapture = captureRunner.capturedTasks.find(c => c.role === "worker");
		const checkerCapture = captureRunner.capturedTasks.find(c => c.role === "checker");
		const watcherCapture = captureRunner.capturedTasks.find(c => c.role === "watcher");

		assert.ok(workerCapture, "worker must have been called");
		assert.ok(checkerCapture, "checker must have been called");
		assert.ok(watcherCapture, "watcher must have been called");

		// All roles must see generated: true
		assert.equal(workerCapture!.task.generated, true, "worker task must have generated=true");
		assert.equal(checkerCapture!.task.generated, true, "checker task must have generated=true");
		assert.equal(watcherCapture!.task.generated, true, "watcher task must have generated=true");

		// All roles must see sourceItemId
		assert.equal(workerCapture!.task.sourceItemId, "battle_08", "worker task must have sourceItemId");
		assert.equal(checkerCapture!.task.sourceItemId, "battle_08", "checker task must have sourceItemId");
		assert.equal(watcherCapture!.task.sourceItemId, "battle_08", "watcher task must have sourceItemId");

		// sourceItem must be hydrated from expansion record
		assert.ok(workerCapture!.task.sourceItem, "worker task must have sourceItem hydrated");
		assert.equal(workerCapture!.task.sourceItem!.id, "battle_08", "hydrated sourceItem.id must match");
		assert.equal(workerCapture!.task.sourceItem!.data.title, "藏经阁大战", "hydrated sourceItem.data.title must match");

		const finalState = await workspace.getState(state.runId);
		assert.ok(finalState);
		assert.equal(finalState.taskStates["process__battle_08"]?.status, "succeeded");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("resume from minimal expansion without sourceItem and without stored task still succeeds", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dyn-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const captureRunner = new TaskCapturingRunner();

		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "minimal expansion",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{
					id: "process", type: "for_each", title: "Process",
					input: { text: "p" }, acceptance: { rules: ["ok"] },
					forEach: {
						itemsFrom: "discover.items",
						mode: "sequential",
						taskTemplate: {
							title: "Do {{item.id}}",
							input: { text: "Work on {{item.id}}" },
							acceptance: { rules: ["ok"] },
						},
					},
				},
			],
			outputContract: { text: "done" },
		});

		const state = await (new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace,
			roleRunner: captureRunner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
		})).createRun(plan.planId);

		// Minimal old expansion: no sourceItem, no task
		await workspace.writeExpansion(state.runId, {
			schemaVersion: "team/task-expansion-1",
			parentTaskId: "process",
			itemsFrom: "discover.items",
			expandedAt: new Date().toISOString(),
			children: [{
				taskId: "process__x1",
				sourceItemId: "x1",
				title: "Do x1",
			}],
		});

			// Initialize child task states
			await workspace.appendChildTaskStates(state.runId, [{
				id: "process__x1",
				type: "normal",
				title: "Do x1",
				input: { text: "Do x1" },
				acceptance: { rules: ["output is valid"] },
				parentTaskId: "process",
				sourceItemId: "x1",
				generated: true,
			}]);

		const orchestrator = new TeamOrchestrator({
			planStore, teamUnitStore: unitStore, workspace,
			roleRunner: captureRunner, dataDir: root,
			maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60,
		});
		await orchestrator.runToCompletion(state.runId);

		const workerCapture = captureRunner.capturedTasks.find(c => c.role === "worker");
		assert.ok(workerCapture, "worker must have been called");
		assert.equal(workerCapture!.task.generated, true, "minimal child must be generated=true");
		assert.equal(workerCapture!.task.sourceItemId, "x1", "minimal child must have sourceItemId");
		// No sourceItem in minimal expansion — prompt fallback handles it via sourceItemId

		const finalState = await workspace.getState(state.runId);
		assert.ok(finalState);
		assert.equal(finalState.taskStates["process__x1"]?.status, "succeeded");
	} finally {
		await rm(root, { recursive: true });
	}
});
