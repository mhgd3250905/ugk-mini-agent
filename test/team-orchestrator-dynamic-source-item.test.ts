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

