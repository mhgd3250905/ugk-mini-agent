import test from "node:test";
import assert from "node:assert/strict";
import { computeTeamRunSummary } from "../src/team/team-summary.js";
import type { TeamTaskState } from "../src/team/types.js";

const NOW = new Date().toISOString();

function taskState(
	status: TeamTaskState["status"],
	overrides: Partial<TeamTaskState> = {},
): TeamTaskState {
	return {
		status,
		attemptCount: 0,
		activeAttemptId: null,
		resultRef: null,
		errorSummary: null,
		progress: { phase: "pending", message: "", updatedAt: NOW },
		...overrides,
	};
}

test("computeTeamRunSummary counts all terminal states", () => {
	const summary = computeTeamRunSummary({
		t1: taskState("succeeded", { attemptCount: 1 }),
		t2: taskState("failed", { attemptCount: 1, errorSummary: "err" }),
		t3: taskState("cancelled"),
		t4: taskState("skipped"),
		t5: taskState("pending"),
		t6: taskState("running", { attemptCount: 1, activeAttemptId: "a1" }),
	});
	assert.equal(summary.totalTasks, 6);
	assert.equal(summary.succeededTasks, 1);
	assert.equal(summary.failedTasks, 1);
	assert.equal(summary.cancelledTasks, 1);
	assert.equal(summary.skippedTasks, 1);
});

test("computeTeamRunSummary handles empty taskStates", () => {
	const summary = computeTeamRunSummary({});
	assert.equal(summary.totalTasks, 0);
	assert.equal(summary.succeededTasks, 0);
	assert.equal(summary.failedTasks, 0);
	assert.equal(summary.cancelledTasks, 0);
	assert.equal(summary.skippedTasks, 0);
});

test("computeTeamRunSummary handles generated children correctly", () => {
	const summary = computeTeamRunSummary({
		parent: taskState("succeeded"),
		"parent__a": taskState("succeeded", { attemptCount: 1 }),
		"parent__b": taskState("failed", { attemptCount: 1, errorSummary: "err" }),
	});
	assert.equal(summary.totalTasks, 3);
	assert.equal(summary.succeededTasks, 2);
	assert.equal(summary.failedTasks, 1);
});

test("computeTeamRunSummary for_each parent all skipped", () => {
	const summary = computeTeamRunSummary({
		fe: taskState("skipped"),
		"fe__x": taskState("skipped"),
		"fe__y": taskState("skipped"),
	});
	assert.equal(summary.totalTasks, 3);
	assert.equal(summary.skippedTasks, 3);
	assert.equal(summary.succeededTasks, 0);
});

test("computeTeamRunSummary decomposition parent failed child", () => {
	const summary = computeTeamRunSummary({
		decomp: taskState("failed", { errorSummary: "child failed" }),
		"decomp_c1": taskState("succeeded", { attemptCount: 1 }),
		"decomp_c2": taskState("failed", { attemptCount: 1, errorSummary: "err" }),
	});
	assert.equal(summary.totalTasks, 3);
	assert.equal(summary.succeededTasks, 1);
	assert.equal(summary.failedTasks, 2);
});

test("computeTeamRunSummary rerun with mixed dispositions", () => {
	const summary = computeTeamRunSummary({
		t1: taskState("succeeded", { attemptCount: 1 }),
		t2: taskState("skipped", { manualDisposition: "skip" }),
		t3: taskState("failed", { attemptCount: 1, errorSummary: "err", manualDisposition: "force_rerun" }),
	});
	assert.equal(summary.totalTasks, 3);
	assert.equal(summary.succeededTasks, 1);
	assert.equal(summary.skippedTasks, 1);
	assert.equal(summary.failedTasks, 1);
});
