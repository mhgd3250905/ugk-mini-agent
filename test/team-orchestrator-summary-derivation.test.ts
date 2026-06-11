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

	// ── Timeout summary derivation ──

	test("handleTimeout derives summary from taskStates", async () => {
		const root = await mkdtemp(join(tmpdir(), "team-timeout-summary-"));
		try {
			class SlowThenResolveRunner extends MockRoleRunner {
				override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
					// task_1 completes after 1.2s (exceeding the 1s timeout)
					if (input.task.id === "task_1") {
						await new Promise(r => setTimeout(r, 1200));
					}
					return super.runWorker(input);
				}
			}

			const planStore = new PlanStore(root);
			const unitStore = new TeamUnitStore(root);
			const workspace = new RunWorkspace(root);
			const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
			const plan = await planStore.create({
				title: "timeout summary test",
				defaultTeamUnitId: unit.teamUnitId,
				goal: { text: "test" },
				tasks: [
					{ id: "task_1", title: "t1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
					{ id: "task_2", title: "t2", input: { text: "do 2" }, acceptance: { rules: ["r2"] } },
				],
				outputContract: { text: "output" },
			});
			const runner = new SlowThenResolveRunner();
			const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

			// Create run with 1-second timeout
			const state = await orchestrator.createRun(plan.planId, { maxRunDurationMinutes: 1 / 60 });
			const final = await orchestrator.runToCompletion(state.runId);

			assert.equal(final.status, "failed", "run should be failed after timeout");
			assert.equal(final.lastError, "run timeout");
			assert.equal(final.taskStates.task_1?.status, "succeeded", "task_1 should succeed before timeout");
			assert.equal(final.taskStates.task_2?.status, "failed", "task_2 should be failed by timeout");
			assert.equal(final.taskStates.task_2?.errorSummary, "run timeout");

			const taskCount = Object.keys(final.taskStates).length;
			assert.equal(final.summary.totalTasks, taskCount, "summary.totalTasks must match taskStates count");
			assert.equal(final.summary.succeededTasks, 1, "summary.succeededTasks: task_1");
			assert.equal(final.summary.failedTasks, 1, "summary.failedTasks: task_2 timed out");
			assert.equal(final.summary.cancelledTasks, 0);
			assert.equal(final.summary.skippedTasks, 0);
		} finally {
			await rm(root, { recursive: true });
		}
	});

	// ── Generated child skip summary derivation ──

	test("skipGeneratedChildren derives totalTasks from taskStates not stale summary", async () => {
		const root = await mkdtemp(join(tmpdir(), "team-skip-gen-summary-"));
		try {
			let workerCallCount = 0;
			class CountingRunner extends MockRoleRunner {
				override async runWorker(input: import("../src/team/role-runner.js").WorkerInput) {
					workerCallCount++;
					return super.runWorker(input);
				}
			}
			const planStore = new PlanStore(root);
			const unitStore = new TeamUnitStore(root);
			const workspace = new RunWorkspace(root);
			const unit = await unitStore.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "wo", checkerProfileId: "c", finalizerProfileId: "f" });
			const plan = await planStore.create({
				title: "skip gen summary test",
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

			const runner = new CountingRunner({ workerOutputs: [JSON.stringify({ items: [{ id: "a", title: "A" }, { id: "b", title: "B" }] })] });
			const orchestrator = new TeamOrchestrator({ planStore, teamUnitStore: unitStore, workspace, roleRunner: runner, dataDir: root, maxCheckerRevisions: 3, maxWatcherRevisions: 1, maxRunDurationMinutes: 60 });

			const state1 = await orchestrator.createRun(plan.planId);
			const result1 = await orchestrator.runToCompletion(state1.runId);
			assert.equal(result1.status, "completed");

			// Get expansion children
			const expansion = await workspace.readExpansion(state1.runId, "process");
			assert.ok(expansion, "expansion should exist");
			const childIds = expansion.children.map(c => c.taskId);
			assert.equal(childIds.length, 2);

			// Corrupt summary.totalTasks to be wrong (simulating stale pre-compute value)
			// Real taskStates has: discover + process + 2 children = 4 tasks
			const preRerun = (await workspace.getState(state1.runId))!;
			preRerun.summary.totalTasks = 99; // stale/incorrect
			preRerun.summary.succeededTasks = 99;
			preRerun.summary.skippedTasks = 0;
			await workspace.saveState(preRerun);

			// Mark parent as skip to trigger skipGeneratedChildren
			const preRerun2 = (await workspace.getState(state1.runId))!;
			preRerun2.taskStates["process"]!.manualDisposition = "skip";
			await workspace.saveState(preRerun2);

			// Rerun
			workerCallCount = 0;
			await orchestrator.rerunRun(state1.runId);
			const finalState = await orchestrator.runToCompletion(state1.runId);

			// summary.totalTasks must be derived from actual taskStates, not stale value
			const actualTaskCount = Object.keys(finalState.taskStates).length;
			assert.equal(finalState.summary.totalTasks, actualTaskCount, "totalTasks must match taskStates count, not stale 99");
			assert.notEqual(finalState.summary.totalTasks, 99, "totalTasks must not be stale value");
			assert.equal(finalState.summary.skippedTasks, 3, "1 parent + 2 children skipped");
			assert.equal(finalState.summary.succeededTasks, 1, "only discover succeeded");
		} finally {
			await rm(root, { recursive: true });
		}
	});
