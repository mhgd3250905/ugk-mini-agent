import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RunWorkspace } from "../src/team/run-workspace.js";
import type { TeamDiscoveryDispatchOutcome, TeamPlan } from "../src/team/types.js";

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

// ── Step06: discovery dispatch outcome diagnostics ──

test("recordAttemptDiscoveryDispatchOutcomes persists discovery dispatch outcomes", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");

		const outcomes: TeamDiscoveryDispatchOutcome[] = [
			{
				itemId: "vultr",
				status: "created",
				generatedTaskId: "task_generated_vultr",
				workUnitMode: "managed",
				createdAt: "2026-05-31T00:00:00.000Z",
			},
			{
				itemId: "hetzner",
				status: "blocked",
				error: "discovery dispatcher output parse error: invalid JSON",
				createdAt: "2026-05-31T00:00:00.000Z",
			},
		];
		await ws.recordAttemptDiscoveryDispatchOutcomes(state.runId, "task_1", attemptId, outcomes);

		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		const discoveryDispatch = attempts[0]!.discoveryDispatch;
		assert.ok(discoveryDispatch, "discoveryDispatch must be present");
		assert.deepEqual(discoveryDispatch, outcomes);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("listAttempts reads old attempt metadata without discovery dispatch", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const attemptDir = join(root, "runs", state.runId, "tasks", "task_1", "attempts", "attempt_olddispatch");
		await mkdir(attemptDir, { recursive: true });
		await writeFile(join(attemptDir, "attempt.json"), JSON.stringify({
			attemptId: "attempt_olddispatch",
			taskId: "task_1",
			status: "succeeded",
			createdAt: "2026-05-15T00:00:00.000Z",
		}), "utf8");

		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		assert.equal("discoveryDispatch" in attempts[0]!, false, "old attempts must not have discoveryDispatch key");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("recordAttemptDiscoveryDispatchOutcomes is a no-op for empty outcome arrays", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		await ws.recordAttemptDiscoveryDispatchOutcomes(state.runId, "task_1", attemptId, []);
		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		assert.equal("discoveryDispatch" in attempts[0]!, false, "empty outcomes must not add discoveryDispatch key");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("listAttempts ignores malformed discovery dispatch metadata", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const attemptDir = join(root, "runs", state.runId, "tasks", "task_1", "attempts", "attempt_baddispatch");
		await mkdir(attemptDir, { recursive: true });
		await writeFile(join(attemptDir, "attempt.json"), JSON.stringify({
			attemptId: "attempt_baddispatch",
			taskId: "task_1",
			status: "succeeded",
			createdAt: "2026-05-15T00:00:00.000Z",
			discoveryDispatch: [{ itemId: "", status: "nonsense", createdAt: 123 }],
		}), "utf8");

		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		assert.equal("discoveryDispatch" in attempts[0]!, false, "malformed discoveryDispatch must be absent");
	} finally {
		await rm(root, { recursive: true });
	}
});
