import test from "node:test";
import assert from "node:assert/strict";
import { computeTeamConfigLocks, activeRunStatuses } from "../src/team/config-locks.js";
import type { TeamRunState, TeamUnit } from "../src/team/types.js";

function makeState(status: TeamRunState["status"], planId: string, teamUnitId: string): TeamRunState {
	return {
		schemaVersion: "team/state-1",
		runId: "run_1", planId, teamUnitId, status,
		createdAt: "", queuedAt: "", startedAt: null, finishedAt: null,
		activeElapsedMs: 0, currentTaskId: null, taskStates: {},
		summary: { totalTasks: 0, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0 },
		pauseReason: null, lastError: null, updatedAt: "",
	};
}

function makeTeam(teamUnitId: string, profileBase: string): TeamUnit {
	return {
		schemaVersion: "team/team-unit-1",
		teamUnitId,
		title: "", description: "",
		watcherProfileId: `${profileBase}_w`,
		workerProfileId: `${profileBase}_wo`,
		checkerProfileId: `${profileBase}_c`,
		finalizerProfileId: `${profileBase}_f`,
		decomposerProfileId: `${profileBase}_d`,
		archived: false, createdAt: "", updatedAt: "",
	};
}

test("active run locks Plan, TeamUnit, and all five profiles", () => {
	const states = [makeState("running", "plan_1", "team_1")];
	const teams = [makeTeam("team_1", "p")];
	const locks = computeTeamConfigLocks(states, teams);
	assert.ok(locks.lockedPlanIds.has("plan_1"));
	assert.ok(locks.lockedTeamUnitIds.has("team_1"));
	assert.ok(locks.lockedProfileIds.has("p_w"));
	assert.ok(locks.lockedProfileIds.has("p_wo"));
	assert.ok(locks.lockedProfileIds.has("p_c"));
	assert.ok(locks.lockedProfileIds.has("p_f"));
});

test("terminal run does not lock anything", () => {
	for (const status of ["completed", "failed", "cancelled", "completed_with_failures"] as const) {
		const states = [makeState(status, "plan_1", "team_1")];
		const teams = [makeTeam("team_1", "p")];
		const locks = computeTeamConfigLocks(states, teams);
		assert.equal(locks.lockedPlanIds.size, 0, `${status} should not lock`);
	}
});

test("paused run locks", () => {
	const states = [makeState("paused", "plan_1", "team_1")];
	const teams = [makeTeam("team_1", "p")];
	const locks = computeTeamConfigLocks(states, teams);
	assert.ok(locks.lockedPlanIds.has("plan_1"));
});

test("activeRunStatuses contains queued running paused", () => {
	assert.ok(activeRunStatuses.has("queued"));
	assert.ok(activeRunStatuses.has("running"));
	assert.ok(activeRunStatuses.has("paused"));
	assert.ok(!activeRunStatuses.has("completed"));
});
