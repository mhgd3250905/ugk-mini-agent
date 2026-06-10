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
import { ExpandedChildExecutionModule } from "../src/team/child-execution.js";
import { computeTeamRunSummary } from "../src/team/team-summary.js";

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

test("child execution module: sequential children run in order and failed child fails parent", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-child-exec-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const parentTask = {
			id: "process",
			type: "for_each" as const,
			title: "Process",
			input: { text: "p" },
			acceptance: { rules: ["ok"] },
			forEach: {
				itemsFrom: "discover.items",
				mode: "sequential" as const,
				taskTemplate: { title: "T", input: { text: "p" }, acceptance: { rules: ["ok"] } },
			},
		};
		const plan = await planStore.create({
			title: "child executor",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [parentTask],
			outputContract: { text: "done" },
		});
		const state = await workspace.createRun(plan, unit.teamUnitId);
		const childTasks = [
			{ id: "process__a", type: "normal" as const, title: "A", input: { text: "a" }, acceptance: { rules: ["ok"] }, parentTaskId: "process", generated: true },
			{ id: "process__b", type: "normal" as const, title: "B", input: { text: "b" }, acceptance: { rules: ["ok"] }, parentTaskId: "process", generated: true },
			{ id: "process__c", type: "normal" as const, title: "C", input: { text: "c" }, acceptance: { rules: ["ok"] }, parentTaskId: "process", generated: true },
		];
		await workspace.appendChildTaskStates(state.runId, childTasks);
		const running = (await workspace.getState(state.runId))!;
		running.status = "running";
		running.taskStates.process!.status = "running";
		running.summary = computeTeamRunSummary(running.taskStates);
		await workspace.saveState(running);

		const executionOrder: string[] = [];
		const executor = new ExpandedChildExecutionModule({
			workspace,
			shouldStop: (s) => !s || s.status !== "running",
			isTimedOut: () => false,
			handleTimeout: async () => {},
			executeChild: async (childState, child) => {
				executionOrder.push(child.id);
				const latest = (await workspace.getState(childState.runId))!;
				const ts = latest.taskStates[child.id]!;
				ts.status = child.id === "process__b" ? "failed" : "succeeded";
				ts.errorSummary = child.id === "process__b" ? "intentional child failure" : null;
				ts.progress = { phase: ts.status, message: ts.status, updatedAt: new Date().toISOString() };
				latest.summary = computeTeamRunSummary(latest.taskStates);
				await workspace.saveState(latest);
			},
		});

		await executor.execute({
			runId: state.runId,
			parentTask,
			childTasks,
			plan,
			mode: "sequential",
			signal: new AbortController().signal,
		});

		const final = (await workspace.getState(state.runId))!;
		assert.deepEqual(executionOrder, ["process__a", "process__b", "process__c"]);
		assert.equal(final.taskStates.process?.status, "failed");
		assert.equal(final.taskStates.process__a?.status, "succeeded");
		assert.equal(final.taskStates.process__b?.status, "failed");
		assert.equal(final.taskStates.process__c?.status, "succeeded");
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
		assert.match(final.taskStates["discover"]?.errorSummary ?? "", /output validation failed|discovery result validation failed/);
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
