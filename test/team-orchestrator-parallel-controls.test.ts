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

// ── Step 4: parallel for_each controls ──

test("pause active parallel run interrupts active children and stops admitting new ones", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "parallel pause test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "discover", type: "discovery", title: "find items", input: { text: "find" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "items" } },
				{
					id: "process", type: "for_each", title: "process items", input: { text: "placeholder" },
					acceptance: { rules: ["ok"] },
					forEach: { itemsFrom: "discover.items", mode: "parallel", taskTemplate: { title: "item", input: { text: "process" }, acceptance: { rules: ["ok"] } } },
				},
				],
			outputContract: { text: "output" },
		});

		let workerCalls = 0;
		class HangingParallelRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput): Promise<import("../src/team/role-runner.js").WorkerOutput> {
				if (input.task.type === "discovery") {
					return { content: JSON.stringify({ items: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] }), artifactRefs: [] };
				}
				workerCalls++;
				if (!input.signal) return super.runWorker(input);
				return await new Promise<never>((_, reject) => {
					input.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
				});
			}
			override async runChecker(input: import("../src/team/role-runner.js").CheckerInput): Promise<import("../src/team/role-runner.js").CheckerOutput> {
				if (input.task.type === "discovery") {
					return { verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] }) };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted" };
			}
		}

		const runner = new HangingParallelRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		const state = await orchestrator.createRun(plan.planId);
		const runPromise = orchestrator.runToCompletion(state.runId);

		// Wait for some children to start
		await new Promise<void>((resolve) => {
			const check = () => { if (workerCalls >= 1) resolve(); else setTimeout(check, 10); };
			check();
		});

		// Pause
		await orchestrator.pauseRun(state.runId, "user pause");

		const final = await runPromise;

		assert.equal(final.status, "paused");
		const childIds = ["process__a", "process__b", "process__c", "process__d"];
		for (const cid of childIds) {
			const cs = final.taskStates[cid];
			assert.ok(cs, `child ${cid} must exist in task states`);
			assert.notEqual(cs!.status, "running", `child ${cid} must not be running after pause`);
		}
		// No running tasks at all
		for (const [tid, ts] of Object.entries(final.taskStates)) {
			assert.notEqual(ts.status, "running", `task ${tid} must not be running after pause`);
		}
	} finally {
		await rm(root, { recursive: true });
	}
});

test("cancel active parallel run marks unfinished children consistently cancelled", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "parallel cancel test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "discover", type: "discovery", title: "find items", input: { text: "find" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "items" } },
				{
					id: "process", type: "for_each", title: "process items", input: { text: "placeholder" },
					acceptance: { rules: ["ok"] },
					forEach: { itemsFrom: "discover.items", mode: "parallel", taskTemplate: { title: "item", input: { text: "process" }, acceptance: { rules: ["ok"] } } },
				},
				],
			outputContract: { text: "output" },
		});

		let workerCalls = 0;
		class HangingParallelRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput): Promise<import("../src/team/role-runner.js").WorkerOutput> {
				if (input.task.type === "discovery") {
					return { content: JSON.stringify({ items: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] }), artifactRefs: [] };
				}
				workerCalls++;
				if (!input.signal) return super.runWorker(input);
				return await new Promise<never>((_, reject) => {
					input.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
				});
			}
			override async runChecker(input: import("../src/team/role-runner.js").CheckerInput): Promise<import("../src/team/role-runner.js").CheckerOutput> {
				if (input.task.type === "discovery") {
					return { verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] }) };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted" };
			}
		}

		const runner = new HangingParallelRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		const state = await orchestrator.createRun(plan.planId);
		const runPromise = orchestrator.runToCompletion(state.runId);

		// Wait for some children to start
		await new Promise<void>((resolve) => {
			const check = () => { if (workerCalls >= 1) resolve(); else setTimeout(check, 10); };
			check();
		});

		// Cancel
		await orchestrator.cancelRun(state.runId, "user cancel");

		const final = await runPromise;

		assert.equal(final.status, "cancelled");
		const childIds = ["process__a", "process__b", "process__c", "process__d"];
		for (const cid of childIds) {
			const cs = final.taskStates[cid];
			assert.ok(cs, `child ${cid} must exist in task states`);
			assert.equal(cs!.status, "cancelled", `child ${cid} must be cancelled after cancel`);
		}
	} finally {
		await rm(root, { recursive: true });
	}
});

test("rerun with force_rerun disposition re-executes parallel child and reuses expansion", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "parallel rerun test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "discover", type: "discovery", title: "find items", input: { text: "find" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "items" } },
				{
					id: "process", type: "for_each", title: "process items", input: { text: "placeholder" },
					acceptance: { rules: ["ok"] },
					forEach: { itemsFrom: "discover.items", mode: "parallel", taskTemplate: { title: "item", input: { text: "process" }, acceptance: { rules: ["ok"] } } },
				},
				],
			outputContract: { text: "output" },
		});

		let workerCallCount = 0;
		class CountingParallelRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput): Promise<import("../src/team/role-runner.js").WorkerOutput> {
				if (input.task.type === "discovery") {
					return { content: JSON.stringify({ items: [{ id: "a" }, { id: "b" }] }), artifactRefs: [] };
				}
				workerCallCount++;
				return { content: `done ${input.task.id}`, artifactRefs: [] };
			}
			override async runChecker(input: import("../src/team/role-runner.js").CheckerInput): Promise<import("../src/team/role-runner.js").CheckerOutput> {
				if (input.task.type === "discovery") {
					return { verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "a" }, { id: "b" }] }) };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted" };
			}
		}

		const runner = new CountingParallelRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		// First run
		const state = await orchestrator.createRun(plan.planId);
		const result1 = await orchestrator.runToCompletion(state.runId);
		assert.equal(result1.status, "completed");

		// Verify expansion exists
		const expansion1 = await workspace.readExpansion(state.runId, "process");
		assert.ok(expansion1, "expansion should exist after first run");
		assert.equal(expansion1.children.length, 2);

		// Set one child to force_rerun
		const preRerun = (await workspace.getState(state.runId))!;
		preRerun.taskStates["process__a"]!.manualDisposition = "force_rerun";
		preRerun.taskStates["process__a"]!.manualDispositionUpdatedAt = new Date().toISOString();
		await workspace.saveState(preRerun);

		// Rerun
		workerCallCount = 0;
		await orchestrator.rerunRun(state.runId);
		const finalState = await orchestrator.runToCompletion(state.runId);

		assert.equal(finalState.status, "completed");
		assert.equal(finalState.taskStates["process__a"]!.status, "succeeded", "force_rerun child should execute again");
		assert.equal(finalState.taskStates["process__b"]!.status, "succeeded", "other child should remain succeeded");
		assert.equal(workerCallCount, 1, "only force_rerun child should be re-executed");

		// Expansion should be reused
		const expansion2 = await workspace.readExpansion(state.runId, "process");
		assert.ok(expansion2, "expansion should exist after rerun");
		assert.equal(expansion2!.children.length, 2, "expansion should not be duplicated");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("rerun with skip disposition keeps parallel child skipped and reuses expansion", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "parallel skip test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "discover", type: "discovery", title: "find items", input: { text: "find" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "items" } },
				{
					id: "process", type: "for_each", title: "process items", input: { text: "placeholder" },
					acceptance: { rules: ["ok"] },
					forEach: { itemsFrom: "discover.items", mode: "parallel", taskTemplate: { title: "item", input: { text: "process" }, acceptance: { rules: ["ok"] } } },
				},
				],
			outputContract: { text: "output" },
		});

		let workerCallCount = 0;
		class CountingParallelRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput): Promise<import("../src/team/role-runner.js").WorkerOutput> {
				if (input.task.type === "discovery") {
					return { content: JSON.stringify({ items: [{ id: "a" }, { id: "b" }] }), artifactRefs: [] };
				}
				workerCallCount++;
				return { content: `done ${input.task.id}`, artifactRefs: [] };
			}
			override async runChecker(input: import("../src/team/role-runner.js").CheckerInput): Promise<import("../src/team/role-runner.js").CheckerOutput> {
				if (input.task.type === "discovery") {
					return { verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "a" }, { id: "b" }] }) };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted" };
			}
		}

		const runner = new CountingParallelRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		// First run
		const state = await orchestrator.createRun(plan.planId);
		const result1 = await orchestrator.runToCompletion(state.runId);
		assert.equal(result1.status, "completed");

		// Set one child to skip
		const preRerun = (await workspace.getState(state.runId))!;
		preRerun.taskStates["process__a"]!.manualDisposition = "skip";
		preRerun.taskStates["process__a"]!.manualDispositionUpdatedAt = new Date().toISOString();
		await workspace.saveState(preRerun);

		// Rerun
		workerCallCount = 0;
		await orchestrator.rerunRun(state.runId);
		const finalState = await orchestrator.runToCompletion(state.runId);

		assert.equal(finalState.status, "completed");
		assert.equal(finalState.taskStates["process__a"]!.status, "skipped", "skip child should remain skipped");
		assert.equal(finalState.taskStates["process__b"]!.status, "succeeded", "other child should remain succeeded");
		assert.equal(workerCallCount, 0, "no worker should run for skipped child");

		// Expansion should be reused
		const expansion2 = await workspace.readExpansion(state.runId, "process");
		assert.ok(expansion2, "expansion should exist after rerun");
		assert.equal(expansion2!.children.length, 2, "expansion should not be duplicated");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("parallel pause -> resume lets interrupted children reach terminal states", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "parallel pause-resume test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "discover", type: "discovery", title: "find items", input: { text: "find" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "items" } },
				{
					id: "process", type: "for_each", title: "process items", input: { text: "placeholder" },
					acceptance: { rules: ["ok"] },
					forEach: { itemsFrom: "discover.items", mode: "parallel", taskTemplate: { title: "item", input: { text: "process" }, acceptance: { rules: ["ok"] } } },
				},
				],
			outputContract: { text: "output" },
		});

		let workerCalls = 0;
		class HangingParallelRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput): Promise<import("../src/team/role-runner.js").WorkerOutput> {
				if (input.task.type === "discovery") {
					return { content: JSON.stringify({ items: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] }), artifactRefs: [] };
				}
				workerCalls++;
				if (!input.signal) return super.runWorker(input);
				return await new Promise<never>((_, reject) => {
					input.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
				});
			}
			override async runChecker(input: import("../src/team/role-runner.js").CheckerInput): Promise<import("../src/team/role-runner.js").CheckerOutput> {
				if (input.task.type === "discovery") {
					return { verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] }) };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted" };
			}
		}

		const runner = new HangingParallelRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		const state = await orchestrator.createRun(plan.planId);
		const runPromise = orchestrator.runToCompletion(state.runId);

		// Wait for some children to start
		await new Promise<void>((resolve) => {
			const check = () => { if (workerCalls >= 1) resolve(); else setTimeout(check, 10); };
			check();
		});

		// Pause
		await orchestrator.pauseRun(state.runId, "user pause");
		const paused = await runPromise;
		assert.equal(paused.status, "paused");

		// No running tasks after pause
		for (const [tid, ts] of Object.entries(paused.taskStates)) {
			assert.notEqual(ts.status, "running", `task ${tid} must not be running after pause`);
		}

		// Resume - use a non-hanging runner so children can actually complete
		workerCalls = 0;
		class ResumingParallelRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput): Promise<import("../src/team/role-runner.js").WorkerOutput> {
				if (input.task.type === "discovery") {
					return { content: JSON.stringify({ items: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] }), artifactRefs: [] };
				}
				workerCalls++;
				return { content: `done ${input.task.id}`, artifactRefs: [] };
			}
			override async runChecker(input: import("../src/team/role-runner.js").CheckerInput): Promise<import("../src/team/role-runner.js").CheckerOutput> {
				if (input.task.type === "discovery") {
					return { verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] }) };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted" };
			}
		}
		const resumingRunner = new ResumingParallelRunner();

		await orchestrator.resumeRun(state.runId);

		const orchestrator2 = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: resumingRunner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		const finalState = await orchestrator2.runToCompletion(state.runId);

		// All children should reach terminal states
		assert.equal(finalState.status, "completed");
		const childIds = ["process__a", "process__b", "process__c", "process__d"];
		for (const cid of childIds) {
			const cs = finalState.taskStates[cid];
			assert.ok(cs, `child ${cid} must exist`);
			assert.ok(cs!.status === "succeeded" || cs!.status === "skipped" || cs!.status === "failed", `child ${cid} should be terminal (${cs!.status}), not interrupted/pending/running`);
		}
		for (const [tid, ts] of Object.entries(finalState.taskStates)) {
			assert.notEqual(ts.status, "interrupted", `task ${tid} must not be interrupted after resume completion`);
			assert.notEqual(ts.status, "pending", `task ${tid} must not be pending after resume completion`);
			assert.notEqual(ts.status, "running", `task ${tid} must not be running after resume completion`);
		}
		// Expansion not duplicated
		const expansion = await workspace.readExpansion(state.runId, "process");
		assert.ok(expansion, "expansion should exist");
		assert.equal(expansion!.children.length, 4, "expansion should have 4 children, not duplicated");
	} finally {
		await rm(root, { recursive: true });
	}
});

// ── force_rerun autoclear tests ──

test("force_rerun: successful rerun clears manualDisposition back to default", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-fr-autoclear-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "fr autoclear test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
				{ id: "task_2", title: "t2", input: { text: "do 2" }, acceptance: { rules: ["r2"] } },
			],
			outputContract: { text: "output" },
		});

		let workerCallCount = 0;
		class CountingRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
				workerCallCount++;
				return super.runWorker(input);
			}
		}

		const runner = new CountingRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		// First run: complete successfully
		workerCallCount = 0;
		const state = await orchestrator.createRun(plan.planId);
		const firstRun = await orchestrator.runToCompletion(state.runId);
		assert.equal(firstRun.status, "completed");
		assert.equal(firstRun.taskStates.task_2?.status, "succeeded");

		// Mark task_2 as force_rerun
		const afterSet = (await workspace.getState(state.runId))!;
		afterSet.taskStates.task_2!.manualDisposition = "force_rerun";
		afterSet.taskStates.task_2!.manualDispositionUpdatedAt = new Date().toISOString();
		await workspace.saveState(afterSet);

		// Rerun
		workerCallCount = 0;
		await orchestrator.rerunRun(state.runId);
		const finalState = await orchestrator.runToCompletion(state.runId);

		assert.equal(finalState.status, "completed");
		assert.equal(finalState.taskStates.task_2?.status, "succeeded");
		assert.equal(finalState.taskStates.task_2?.manualDisposition, "default", "successful forced task should have disposition cleared to default");
		assert.equal(workerCallCount, 1, "rerun should only execute task_2");

		// Second rerun: task_2 should NOT be re-executed since disposition is now default and status is succeeded
		workerCallCount = 0;
		await orchestrator.rerunRun(state.runId);
		const secondRerun = await orchestrator.runToCompletion(state.runId);
		assert.equal(secondRerun.status, "completed");
		assert.equal(secondRerun.taskStates.task_2?.status, "succeeded");
		assert.equal(workerCallCount, 0, "second rerun should not re-execute task_2 since force_rerun was cleared");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("force_rerun: failed forced task keeps manualDisposition as force_rerun", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-fr-fail-keep-"));
	try {
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "fr fail keep test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
				{ id: "task_2", title: "t2", input: { text: "do 2" }, acceptance: { rules: ["r2"] } },
			],
			outputContract: { text: "output" },
		});

		// First run with normal runner to succeed both tasks
		const normalRunner = new MockRoleRunner();
		const normalOrchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: normalRunner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });
		const state = await normalOrchestrator.createRun(plan.planId);
		await normalOrchestrator.runToCompletion(state.runId);

		// Mark task_2 as force_rerun
		const afterSet = (await workspace.getState(state.runId))!;
		afterSet.taskStates.task_2!.manualDisposition = "force_rerun";
		afterSet.taskStates.task_2!.manualDispositionUpdatedAt = new Date().toISOString();
		await workspace.saveState(afterSet);

		// Rerun with a runner that fails task_2
		class FailOnTask2Runner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
				if (input.task.id === "task_2") throw new Error("task_2 fails on rerun");
				return super.runWorker(input);
			}
		}
		const failRunner = new FailOnTask2Runner();
		const failOrchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: failRunner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });
		await failOrchestrator.rerunRun(state.runId);
		const finalState = await failOrchestrator.runToCompletion(state.runId);

		assert.equal(finalState.taskStates.task_2?.status, "failed");
		assert.equal(finalState.taskStates.task_2?.manualDisposition, "force_rerun", "failed forced task must keep force_rerun marker");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("force_rerun: for_each generated child autoclears after success", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-fr-fe-child-"));
	try {
		let workerCallCount = 0;
		class CountingRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput): Promise<import("../src/team/role-runner.js").WorkerOutput> {
				if (input.task.type === "discovery") {
					return { content: JSON.stringify({ items: [{ id: "a", title: "A" }] }), artifactRefs: [] };
				}
				workerCallCount++;
				return { content: "done " + input.task.id, artifactRefs: [] };
			}
			override async runChecker(input: import("../src/team/role-runner.js").CheckerInput): Promise<import("../src/team/role-runner.js").CheckerOutput> {
				if (input.task.type === "discovery") {
					return { verdict: "pass", reason: "ok", resultContent: JSON.stringify({ items: [{ id: "a", title: "A" }] }) };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted" };
			}
		}

		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "fr fe child autoclear",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "discover", type: "discovery", title: "find items", input: { text: "find" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "items" } },
				{
					id: "process", type: "for_each", title: "process items", input: { text: "placeholder" },
					acceptance: { rules: ["ok"] },
					forEach: { itemsFrom: "discover.items", mode: "sequential", taskTemplate: { title: "item", input: { text: "process" }, acceptance: { rules: ["ok"] } } },
				},
			],
			outputContract: { text: "output" },
		});

		const runner = new CountingRunner();
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		// First run: complete
		const state1 = await orchestrator.createRun(plan.planId);
		const result1 = await orchestrator.runToCompletion(state1.runId);
		assert.equal(result1.status, "completed");

		// Get child task IDs
		const expansion = await workspace.readExpansion(state1.runId, "process");
		assert.ok(expansion, "expansion should exist");
		const childId = expansion.children[0]!.taskId;

		// Mark generated child as force_rerun
		const preRerun = (await workspace.getState(state1.runId))!;
		preRerun.taskStates[childId]!.manualDisposition = "force_rerun";
		preRerun.taskStates[childId]!.manualDispositionUpdatedAt = new Date().toISOString();
		await workspace.saveState(preRerun);

		// Rerun and complete
		workerCallCount = 0;
		await orchestrator.rerunRun(state1.runId);
		const finalState = await orchestrator.runToCompletion(state1.runId);

		assert.equal(finalState.status, "completed");
		assert.equal(finalState.taskStates[childId]?.status, "succeeded");
		assert.equal(finalState.taskStates[childId]?.manualDisposition, "default", "successful forced child task should clear disposition to default");
		assert.equal(workerCallCount, 1, "only forced child should be re-executed");

		// Expansion not duplicated
		const expansion2 = await workspace.readExpansion(state1.runId, "process");
		assert.ok(expansion2);
		assert.equal(expansion2!.children.length, 1, "expansion should not be duplicated");
	} finally {
		await rm(root, { recursive: true });
	}
});
test("cancel during parallel for_each: no child left in running state", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ctrl-par-"));
	try {
		let workerStarted = false;
		let workerReadyResolve: () => void;
		const workerReady = new Promise<void>(r => { workerReadyResolve = r; });

		class HangingParallelRunner extends MockRoleRunner {
			override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
				if (input.task.type === "discovery") {
					return { content: JSON.stringify({ items: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }] }), artifactRefs: [] };
				}
				workerStarted = true;
				workerReadyResolve!();
				if (input.signal) {
					await new Promise<never>((_, reject) => {
						if (input.signal!.aborted) { reject(new Error("aborted")); return; }
						input.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
					});
				}
				return super.runWorker(input);
			}

			override async runChecker(input: import("../src/team/role-runner.js").CheckerInput) {
				if (input.task.type === "discovery") {
					return { verdict: "pass" as const, reason: "ok", resultContent: JSON.stringify({ items: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }] }) };
				}
				return { verdict: "pass" as const, reason: "ok", resultContent: "accepted" };
			}
		}

		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const workspace = new RunWorkspace(root);
		const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
		const plan = await planStore.create({
			title: "cancel parallel test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "discover", type: "discovery", title: "Discover items", input: { text: "Find items" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "items" } },
				{
					id: "process", type: "for_each", title: "Process each", input: { text: "p" },
					acceptance: { rules: ["ok"] },
					forEach: { itemsFrom: "discover.items", mode: "parallel", taskTemplate: { title: "Process {{item.title}}", input: { text: "Process {{item.id}}" }, acceptance: { rules: ["ok"] } } },
				},
			],
			outputContract: { text: "report" },
		});
		const runner = new HangingParallelRunner() as unknown as import("../src/team/role-runner.js").TeamRoleRunner;
		const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

		const state = await orchestrator.createRun(plan.planId);
		const runPromise = orchestrator.runToCompletion(state.runId);

		// Wait for at least one parallel child worker to start
		await workerReady;

		// Cancel mid-execution
		const cancelled = await orchestrator.cancelRun(state.runId, "user cancel during parallel");

		const final = await runPromise;
		assert.equal(final.status, "cancelled", "run should be cancelled");

		// No child should be left in "running" state after cancel
		for (const [taskId, ts] of Object.entries(final.taskStates)) {
			if (taskId.startsWith("process__")) {
				assert.ok(
					ts.status !== "running" && ts.status !== "pending",
					"parallel child " + taskId + " should not be running/pending after cancel, got " + ts.status,
				);
			}
		}
	} finally {
		await rm(root, { recursive: true });
	}
});
