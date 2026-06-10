import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PlanStore } from "../src/team/plan-store.js";
import { TeamUnitStore } from "../src/team/team-unit-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";

// ── Step 2: safe state patch helper ──

test("patchState: two concurrent patches for different tasks both survive in persisted state", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-patch-"));
	try {
		const workspace = new RunWorkspace(root);
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "patch concurrency",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test patchState" },
			tasks: [
				{ id: "t1", title: "Task 1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
				{ id: "t2", title: "Task 2", input: { text: "do 2" }, acceptance: { rules: ["r2"] } },
			],
			outputContract: { text: "output" },
		});
		const state = await workspace.createRun(plan, unit.teamUnitId);

		const [r1, r2] = await Promise.all([
			workspace.patchState(state.runId, async (s) => {
				await new Promise(r => setTimeout(r, 20));
				s.taskStates["t1"]!.status = "running";
			}),
			workspace.patchState(state.runId, async (s) => {
				await new Promise(r => setTimeout(r, 20));
				s.taskStates["t2"]!.status = "succeeded";
			}),
		]);

		assert.ok(r1);
		assert.ok(r2);

		const final = await workspace.getState(state.runId);
		assert.ok(final);
		assert.equal(final!.taskStates["t1"]!.status, "running", "t1 patch must survive");
		assert.equal(final!.taskStates["t2"]!.status, "succeeded", "t2 patch must survive");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("patchState: auto-updates updatedAt when caller does not set it", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-patch-"));
	try {
		const workspace = new RunWorkspace(root);
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "updatedAt test",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "t1", title: "Task 1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
			],
			outputContract: { text: "output" },
		});
		const state = await workspace.createRun(plan, unit.teamUnitId);
		const originalUpdatedAt = state.updatedAt;

		const patched = await workspace.patchState(state.runId, (s) => {
			s.taskStates["t1"]!.status = "succeeded";
			s.summary.succeededTasks = 1;
		});

		assert.equal(patched.taskStates["t1"]!.status, "succeeded");
		assert.equal(patched.summary.succeededTasks, 1);
		assert.notEqual(patched.updatedAt, originalUpdatedAt, "updatedAt must be auto-bumped");

		const reloaded = await workspace.getState(state.runId);
		assert.equal(reloaded!.taskStates["t1"]!.status, "succeeded");
		assert.equal(reloaded!.updatedAt, patched.updatedAt);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("patchState: updatedAt advances even within same millisecond", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-patch-"));
	try {
		const workspace = new RunWorkspace(root);
		const planStore = new PlanStore(root);
		const unitStore = new TeamUnitStore(root);
		const unit = await unitStore.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		const plan = await planStore.create({
			title: "updatedAt monotonic",
			defaultTeamUnitId: unit.teamUnitId,
			goal: { text: "test" },
			tasks: [
				{ id: "t1", title: "Task 1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
			],
			outputContract: { text: "output" },
		});
		const state = await workspace.createRun(plan, unit.teamUnitId);

		const patched1 = await workspace.patchState(state.runId, (s) => {
			s.taskStates["t1"]!.status = "running";
		});
		const patched2 = await workspace.patchState(state.runId, (s) => {
			s.taskStates["t1"]!.status = "succeeded";
			s.summary.succeededTasks = 1;
		});

		assert.notEqual(patched2.updatedAt, patched1.updatedAt,
			"updatedAt must advance between two rapid patchState calls");
		const reloaded = await workspace.getState(state.runId);
		assert.equal(reloaded!.updatedAt, patched2.updatedAt);
	} finally {
		await rm(root, { recursive: true });
	}
});
