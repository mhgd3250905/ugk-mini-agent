import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RunWorkspace } from "../src/team/run-workspace.js";
import type { TeamDiscoveryGeneratedRunOutcome, TeamPlan } from "../src/team/types.js";

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

// ── Step07: discovery generated run launch diagnostics ──

test("recordAttemptDiscoveryGeneratedRunOutcomes persists generated run launch outcomes", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");

		const outcomes: TeamDiscoveryGeneratedRunOutcome[] = [
			{
				itemId: "vultr",
				generatedTaskId: "task_generated_vultr",
				status: "started",
				generatedRunId: "run_generated_vultr",
				createdAt: "2026-05-31T00:00:00.000Z",
			},
			{
				itemId: "hetzner",
				generatedTaskId: "task_generated_hetzner",
				status: "skipped_already_running",
				generatedRunId: "run_existing_hetzner",
				createdAt: "2026-05-31T00:00:00.000Z",
			},
			{
				itemId: "broken",
				generatedTaskId: "task_generated_broken",
				status: "failed",
				error: "launch failed",
				createdAt: "2026-05-31T00:00:00.000Z",
			},
		];
		await ws.recordAttemptDiscoveryGeneratedRunOutcomes(state.runId, "task_1", attemptId, outcomes);

		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		const discoveryGeneratedRuns = attempts[0]!.discoveryGeneratedRuns;
		assert.ok(discoveryGeneratedRuns, "discoveryGeneratedRuns must be present");
		assert.deepEqual(discoveryGeneratedRuns, outcomes);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("listAttempts reads old attempt metadata without discovery generated runs", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const attemptDir = join(root, "runs", state.runId, "tasks", "task_1", "attempts", "attempt_oldgeneratedruns");
		await mkdir(attemptDir, { recursive: true });
		await writeFile(join(attemptDir, "attempt.json"), JSON.stringify({
			attemptId: "attempt_oldgeneratedruns",
			taskId: "task_1",
			status: "succeeded",
			createdAt: "2026-05-15T00:00:00.000Z",
		}), "utf8");

		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		assert.equal("discoveryGeneratedRuns" in attempts[0]!, false, "old attempts must not have discoveryGeneratedRuns key");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("recordAttemptDiscoveryGeneratedRunOutcomes is a no-op for empty outcome arrays", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const { attemptId } = await ws.createAttempt(state.runId, "task_1");
		await ws.recordAttemptDiscoveryGeneratedRunOutcomes(state.runId, "task_1", attemptId, []);
		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		assert.equal("discoveryGeneratedRuns" in attempts[0]!, false, "empty outcomes must not add discoveryGeneratedRuns key");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("listAttempts ignores malformed discovery generated run metadata", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-ws-"));
	try {
		const ws = new RunWorkspace(root);
		const state = await ws.createRun(plan, "team_1");
		const attemptDir = join(root, "runs", state.runId, "tasks", "task_1", "attempts", "attempt_badgeneratedruns");
		await mkdir(attemptDir, { recursive: true });
		await writeFile(join(attemptDir, "attempt.json"), JSON.stringify({
			attemptId: "attempt_badgeneratedruns",
			taskId: "task_1",
			status: "succeeded",
			createdAt: "2026-05-15T00:00:00.000Z",
			discoveryGeneratedRuns: [{ itemId: "", generatedTaskId: "", status: "nonsense", createdAt: 123 }],
		}), "utf8");

		const attempts = await ws.listAttempts(state.runId, "task_1");
		assert.equal(attempts.length, 1);
		assert.equal("discoveryGeneratedRuns" in attempts[0]!, false, "malformed discoveryGeneratedRuns must be absent");
	} finally {
		await rm(root, { recursive: true });
	}
});
