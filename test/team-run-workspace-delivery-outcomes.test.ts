import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RunWorkspace } from "../src/team/run-workspace.js";
import type { TeamPlan, TeamTaskDeliveryOutcome } from "../src/team/types.js";

const plan: TeamPlan = {
	schemaVersion: "team/plan-1",
	planId: "plan_test",
	title: "test",
	defaultTeamUnitId: "team_1",
	goal: { text: "test goal" },
	tasks: [
		{ id: "task_1", title: "t1", input: { text: "do t1" }, acceptance: { rules: ["rule1"] } },
		{ id: "task_2", title: "t2", input: { text: "do t2" }, acceptance: { rules: ["rule2"] } },
	],
	outputContract: { text: "output" },
	archived: false,
	createdAt: "",
	updatedAt: "",
	runCount: 0,
};

// ── P24: downstream delivery outcome diagnostics ──

test("recordAttemptDeliveryOutcomes persists downstream delivery outcomes", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");

		const outcomes: TeamTaskDeliveryOutcome[] = [
			{
				connectionId: "conn_1",
				toTaskId: "task_2",
				toInputPortId: "source_md",
				status: "delivered",
				downstreamRunId: "run_downstream_1",
				createdAt: "2026-05-26T00:00:00.000Z",
			},
			{
				connectionId: "conn_2",
				toTaskId: "task_3",
				toInputPortId: "source_html",
				status: "skipped",
				staleReason: "target_input_port_type_mismatch",
				createdAt: "2026-05-26T00:00:00.000Z",
			},
		];
		await ws.recordAttemptDeliveryOutcomes(state.runId, "task_1", attemptId, outcomes);

		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		const delivery = attempts[0]!.downstreamDelivery;
		assert.ok(delivery, "downstreamDelivery must be present");
		assert.equal(delivery!.length, 2);
		assert.equal((delivery![0] as import("../src/team/types.js").TeamTaskTypedConnectionDeliveryOutcome).connectionId, "conn_1");
		assert.equal(delivery![0]!.toTaskId, "task_2");
		assert.equal((delivery![0] as import("../src/team/types.js").TeamTaskTypedConnectionDeliveryOutcome).toInputPortId, "source_md");
		assert.equal(delivery![0]!.status, "delivered");
		assert.equal(delivery![0]!.downstreamRunId, "run_downstream_1");
		assert.equal(delivery![0]!.staleReason, undefined);
		assert.equal(delivery![0]!.error, undefined);
		assert.equal((delivery![1] as import("../src/team/types.js").TeamTaskTypedConnectionDeliveryOutcome).connectionId, "conn_2");
		assert.equal(delivery![1]!.status, "skipped");
		assert.equal(delivery![1]!.staleReason, "target_input_port_type_mismatch");
		assert.equal(delivery![1]!.downstreamRunId, undefined);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("listAttempts reads old attempt metadata without downstream delivery", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		// Manually create old-format attempt without downstreamDelivery
		const attemptDir = join(root, "runs", state.runId, "tasks", "task_1", "attempts", "attempt_olddl");
		await mkdir(attemptDir, { recursive: true });
		await writeFile(join(attemptDir, "attempt.json"), JSON.stringify({
			attemptId: "attempt_olddl",
			taskId: "task_1",
			status: "succeeded",
			createdAt: "2026-05-15T00:00:00.000Z",
		}), "utf8");
		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		const a = attempts[0]!;
		assert.equal(a.attemptId, "attempt_olddl");
		assert.equal("downstreamDelivery" in a, false, "old attempts must not have downstreamDelivery key");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("recordAttemptDeliveryOutcomes is a no-op for non-existent attempt", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		// Should not throw
		await ws.recordAttemptDeliveryOutcomes(state.runId, "task_1", "attempt_ghost", [
			{
				connectionId: "conn_x",
				toTaskId: "task_2",
				toInputPortId: "in",
				status: "delivered",
				downstreamRunId: "run_x",
				createdAt: "2026-05-26T00:00:00.000Z",
			},
		]);
		// No attempt created
		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 0);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("recordAttemptDeliveryOutcomes is a no-op for empty outcomes array", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		await ws.recordAttemptDeliveryOutcomes(state.runId, "task_1", attemptId, []);
		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		assert.equal("downstreamDelivery" in attempts[0]!, false, "empty outcomes must not add downstreamDelivery key");
	} finally {
		await rm(root, { recursive: true });
	}
});
