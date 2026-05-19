import test from "node:test";
import assert from "node:assert/strict";
import { computeTeamRunSummary } from "../src/team/team-summary.js";

test("computeTeamRunSummary counts all terminal states", () => {
	const summary = computeTeamRunSummary({
		t1: { status: "succeeded", attemptCount: 1, activeAttemptId: null, progress: null },
		t2: { status: "failed", attemptCount: 1, activeAttemptId: null, progress: null, errorSummary: "err" },
		t3: { status: "cancelled", attemptCount: 0, activeAttemptId: null, progress: null },
		t4: { status: "skipped", attemptCount: 0, activeAttemptId: null, progress: null },
		t5: { status: "pending", attemptCount: 0, activeAttemptId: null, progress: null },
		t6: { status: "running", attemptCount: 1, activeAttemptId: "a1", progress: null },
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
		parent: { status: "succeeded", attemptCount: 0, activeAttemptId: null, progress: null },
		"parent__a": { status: "succeeded", attemptCount: 1, activeAttemptId: null, progress: null },
		"parent__b": { status: "failed", attemptCount: 1, activeAttemptId: null, progress: null, errorSummary: "err" },
	});
	assert.equal(summary.totalTasks, 3);
	assert.equal(summary.succeededTasks, 2);
	assert.equal(summary.failedTasks, 1);
});

test("computeTeamRunSummary for_each parent all skipped", () => {
	const summary = computeTeamRunSummary({
		fe: { status: "skipped", attemptCount: 0, activeAttemptId: null, progress: null },
		"fe__x": { status: "skipped", attemptCount: 0, activeAttemptId: null, progress: null },
		"fe__y": { status: "skipped", attemptCount: 0, activeAttemptId: null, progress: null },
	});
	assert.equal(summary.totalTasks, 3);
	assert.equal(summary.skippedTasks, 3);
	assert.equal(summary.succeededTasks, 0);
});

test("computeTeamRunSummary decomposition parent failed child", () => {
	const summary = computeTeamRunSummary({
		decomp: { status: "failed", attemptCount: 0, activeAttemptId: null, progress: null, errorSummary: "child failed" },
		"decomp_c1": { status: "succeeded", attemptCount: 1, activeAttemptId: null, progress: null },
		"decomp_c2": { status: "failed", attemptCount: 1, activeAttemptId: null, progress: null, errorSummary: "err" },
	});
	assert.equal(summary.totalTasks, 3);
	assert.equal(summary.succeededTasks, 1);
	assert.equal(summary.failedTasks, 2);
});

test("computeTeamRunSummary rerun with mixed dispositions", () => {
	const summary = computeTeamRunSummary({
		t1: { status: "succeeded", attemptCount: 1, activeAttemptId: null, progress: null },
		t2: { status: "skipped", attemptCount: 0, activeAttemptId: null, progress: null, manualDisposition: "skip" },
		t3: { status: "failed", attemptCount: 1, activeAttemptId: null, progress: null, errorSummary: "err", manualDisposition: "force_rerun" },
	});
	assert.equal(summary.totalTasks, 3);
	assert.equal(summary.succeededTasks, 1);
	assert.equal(summary.skippedTasks, 1);
	assert.equal(summary.failedTasks, 1);
});
