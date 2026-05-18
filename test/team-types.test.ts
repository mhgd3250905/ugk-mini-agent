import test from "node:test";
import assert from "node:assert/strict";
import type { TeamPlan, TeamRunState, TeamUnit, TeamAttemptMetadata, AttemptLifecyclePhase, AttemptStatus, TeamTask, TeamTaskType } from "../src/team/types.js";
import { getManualDisposition, shouldExecuteOnRerun } from "../src/team/orchestrator.js";
import type { TeamTaskState } from "../src/team/types.js";

test("TeamUnit has five role profile slots", () => {
	const team: TeamUnit = {
		schemaVersion: "team/team-unit-1",
		teamUnitId: "team_web_research",
		title: "网页调研团队",
		description: "适合公开网页调研和证据整理",
		watcherProfileId: "profile_watcher",
		workerProfileId: "profile_worker",
		checkerProfileId: "profile_checker",
		finalizerProfileId: "profile_finalizer",
		decomposerProfileId: "profile_decomposer",
		archived: false,
		createdAt: "2026-05-15T00:00:00.000Z",
		updatedAt: "2026-05-15T00:00:00.000Z",
	};
	assert.equal(team.workerProfileId, "profile_worker");
	assert.equal(team.watcherProfileId, "profile_watcher");
	assert.equal(team.checkerProfileId, "profile_checker");
	assert.equal(team.finalizerProfileId, "profile_finalizer");
	assert.equal(team.decomposerProfileId, "profile_decomposer");
});

test("Plan stores ordered human readable tasks", () => {
	const plan: TeamPlan = {
		schemaVersion: "team/plan-1",
		planId: "plan_medtrum_domains",
		title: "Medtrum 域名调查",
		defaultTeamUnitId: "team_web_research",
		goal: { text: "调查 Medtrum 相关域名并输出中文汇总。" },
		tasks: [{
			id: "task_medtrum_com",
			title: "核查 medtrum.com",
			input: { text: "核查 medtrum.com 与 Medtrum 的关系。", payload: { domain: "medtrum.com" } },
			acceptance: { rules: ["必须说明查过哪些公开来源", "必须说明证据和不确定性"] },
		}],
		outputContract: { text: "输出中文汇总，区分已完成任务、失败任务和下次准备建议。" },
		archived: false,
		createdAt: "2026-05-15T00:00:00.000Z",
		updatedAt: "2026-05-15T00:00:00.000Z",
		runCount: 0,
	};
	assert.equal(plan.tasks[0]?.title, "核查 medtrum.com");
	assert.equal(plan.tasks.length, 1);
});

test("Run state stores refs instead of large outputs", () => {
	const state: TeamRunState = {
		schemaVersion: "team/state-1",
		runId: "run_001",
		planId: "plan_medtrum_domains",
		teamUnitId: "team_web_research",
		status: "running",
		createdAt: "2026-05-15T00:00:00.000Z",
		queuedAt: "2026-05-15T00:00:00.000Z",
		startedAt: "2026-05-15T00:00:01.000Z",
		finishedAt: null,
		activeElapsedMs: 0,
		currentTaskId: "task_medtrum_com",
		taskStates: {
			task_medtrum_com: {
				status: "running",
				attemptCount: 1,
				activeAttemptId: "attempt_001",
				resultRef: null,
				errorSummary: null,
				progress: {
					phase: "worker_running",
					message: "执行 Agent 正在处理",
					updatedAt: "2026-05-15T00:00:02.000Z",
				},
			},
		},
		summary: { totalTasks: 1, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
		pauseReason: null,
		lastError: null,
		finalizerRuntimeContext: {
			requestedProfileId: "finalizer_profile",
			resolvedProfileId: "main",
			fallbackUsed: true,
			fallbackReason: "profile_not_found",
			browserId: "browser_finalizer",
			browserScope: "team:run_001:finalizer:finalizer:main",
		},
		updatedAt: "2026-05-15T00:00:02.000Z",
	};
	assert.equal(state.taskStates.task_medtrum_com?.activeAttemptId, "attempt_001");
	assert.equal(state.status, "running");
	assert.equal(state.finalizerRuntimeContext?.resolvedProfileId, "main");
});

test("RunStatus covers all expected statuses", () => {
	const nonTerminal: string[] = ["queued", "running", "paused"];
	const terminal: string[] = ["completed", "completed_with_failures", "failed", "cancelled"];
	assert.equal(nonTerminal.length + terminal.length, 7);
});

test("CheckerVerdict is pass revise or fail", () => {
	const verdicts: string[] = ["pass", "revise", "fail"];
	assert.equal(verdicts.length, 3);
});

test("WatcherDecision is accept_task confirm_failed or request_revision", () => {
	const decisions: string[] = ["accept_task", "confirm_failed", "request_revision"];
	assert.equal(decisions.length, 3);
});

// ── P5: Attempt lifecycle metadata types ──

test("TeamAttemptMetadata has lifecycle fields", () => {
	const meta: TeamAttemptMetadata = {
		attemptId: "attempt_001",
		taskId: "task_1",
		status: "running",
		phase: "created",
		createdAt: "2026-05-16T00:00:00.000Z",
		updatedAt: "2026-05-16T00:00:00.000Z",
		finishedAt: null,
		worker: [],
		checker: [],
		watcher: null,
		resultRef: null,
		errorSummary: null,
	};
	assert.equal(meta.phase, "created");
	assert.deepEqual(meta.worker, []);
	assert.deepEqual(meta.checker, []);
	assert.equal(meta.watcher, null);
	assert.equal(meta.resultRef, null);
	assert.equal(meta.errorSummary, null);
	assert.equal(meta.finishedAt, null);
});

test("AttemptLifecyclePhase covers worker/checker/watcher/succeeded/failed", () => {
	const phases: AttemptLifecyclePhase[] = [
		"created", "worker_running", "worker_completed",
		"checker_reviewing", "checker_passed", "checker_revising", "checker_failed",
		"watcher_reviewing", "watcher_accepted", "watcher_revision_requested", "watcher_confirmed_failed",
		"succeeded", "failed", "interrupted", "cancelled",
	];
	assert.equal(phases.length, 15);
	assert.ok(phases.includes("worker_running"));
	assert.ok(phases.includes("checker_reviewing"));
	assert.ok(phases.includes("watcher_reviewing"));
	assert.ok(phases.includes("succeeded"));
	assert.ok(phases.includes("failed"));
});

test("AttemptStatus covers all terminal and non-terminal states", () => {
	const statuses: AttemptStatus[] = ["running", "succeeded", "failed", "interrupted", "cancelled"];
	assert.equal(statuses.length, 5);
});

test("TeamAttemptMetadata worker and checker are arrays", () => {
	const meta: TeamAttemptMetadata = {
		attemptId: "a1", taskId: "t1", status: "running", phase: "worker_running",
		createdAt: "", updatedAt: "", finishedAt: null,
		worker: [{
			outputRef: "ref.md",
			outputIndex: 1,
			runtimeContext: {
				requestedProfileId: "worker_profile",
				resolvedProfileId: "main",
				fallbackUsed: true,
				fallbackReason: "profile_not_found",
				browserId: "browser_a",
				browserScope: "team:run_1:worker:attempt_1:main",
			},
		}],
		checker: [{
			verdict: "pass",
			reason: "ok",
			revisionIndex: 1,
			recordRef: "v.json",
			feedbackRef: null,
			runtimeContext: {
				requestedProfileId: "checker_profile",
				resolvedProfileId: "checker_profile",
				fallbackUsed: false,
				browserId: null,
				browserScope: "team:run_1:checker:attempt_1:checker_profile",
			},
		}],
		watcher: null, resultRef: null, errorSummary: null,
	};
	assert.equal(Array.isArray(meta.worker), true);
	assert.equal(Array.isArray(meta.checker), true);
	assert.equal(meta.worker.length, 1);
	assert.equal(meta.checker.length, 1);
	assert.equal(meta.worker[0]!.runtimeContext?.fallbackReason, "profile_not_found");
	assert.equal(meta.checker[0]!.runtimeContext?.browserId, null);
});

test("TeamAttemptMetadata watcher can be set to a summary object", () => {
	const meta: TeamAttemptMetadata = {
		attemptId: "a1", taskId: "t1", status: "succeeded", phase: "watcher_accepted",
		createdAt: "", updatedAt: "", finishedAt: "2026-05-16T01:00:00.000Z",
		worker: [], checker: [],
		watcher: {
			decision: "accept_task",
			reason: "looks good",
			recordRef: "w.json",
			runtimeContext: {
				requestedProfileId: "watcher_profile",
				resolvedProfileId: "watcher_profile",
				fallbackUsed: false,
				browserId: "browser_b",
				browserScope: "team:run_1:watcher:attempt_1:watcher_profile",
			},
		},
		resultRef: "accepted-result.md", errorSummary: null,
	};
	assert.ok(meta.watcher);
	assert.equal(meta.watcher.decision, "accept_task");
	assert.equal(meta.watcher.runtimeContext?.browserScope, "team:run_1:watcher:attempt_1:watcher_profile");
	assert.equal(meta.finishedAt, "2026-05-16T01:00:00.000Z");
});

// ── P15: Dynamic task expansion types ──

test("P15: old task without type is valid and treated as normal", () => {
	const task: TeamTask = {
		id: "task_1",
		title: "Test task",
		input: { text: "Do something" },
		acceptance: { rules: ["output is valid"] },
	};
	assert.equal(task.type, undefined);
	assert.equal(task.discovery, undefined);
	assert.equal(task.forEach, undefined);
	assert.equal(task.parentTaskId, undefined);
	assert.equal(task.sourceItemId, undefined);
	assert.equal(task.generated, undefined);
});

test("P15: normal task with explicit type is valid", () => {
	const task: TeamTask = {
		id: "task_1",
		type: "normal",
		title: "Test task",
		input: { text: "Do something" },
		acceptance: { rules: ["output is valid"] },
	};
	assert.equal(task.type, "normal");
});

test("P15: discovery task with outputKey is valid", () => {
	const task: TeamTask = {
		id: "discover_items",
		type: "discovery",
		title: "Discover items",
		input: { text: "Find all items" },
		acceptance: { rules: ["output contains JSON with items array"] },
		discovery: { outputKey: "items" },
	};
	assert.equal(task.type, "discovery");
	assert.equal(task.discovery?.outputKey, "items");
});

test("P15: for_each task with sequential mode is valid", () => {
	const task: TeamTask = {
		id: "process_each",
		type: "for_each",
		title: "Process each item",
		input: { text: "Placeholder" },
		acceptance: { rules: ["placeholder"] },
		forEach: {
			itemsFrom: "discover_items.items",
			mode: "sequential",
			taskTemplate: {
				title: "Process {{item.title}}",
				input: { text: "Process item {{item.id}}" },
				acceptance: { rules: ["output is valid"] },
			},
		},
	};
	assert.equal(task.type, "for_each");
	assert.equal(task.forEach?.mode, "sequential");
	assert.equal(task.forEach?.itemsFrom, "discover_items.items");
});

test("P15: generated child task has parent metadata", () => {
	const task: TeamTask = {
		id: "process_each__item_01",
		type: "normal",
		title: "Process item 01",
		input: { text: "Process item 01" },
		acceptance: { rules: ["output is valid"] },
		parentTaskId: "process_each",
		sourceItemId: "item_01",
		generated: true,
	};
	assert.equal(task.parentTaskId, "process_each");
	assert.equal(task.sourceItemId, "item_01");
	assert.equal(task.generated, true);
});

// ── P24: Manual disposition and rerun decision table ──

function makeTaskState(overrides: Partial<TeamTaskState> = {}): TeamTaskState {
	return {
		status: "pending",
		attemptCount: 0,
		activeAttemptId: null,
		resultRef: null,
		errorSummary: null,
		progress: { phase: "pending", message: "等待执行", updatedAt: new Date().toISOString() },
		...overrides,
	};
}

test("P24: getManualDisposition returns default when undefined", () => {
	assert.equal(getManualDisposition(makeTaskState()), "default");
});

test("P24: getManualDisposition returns default when explicitly default", () => {
	assert.equal(getManualDisposition(makeTaskState({ manualDisposition: "default" })), "default");
});

test("P24: getManualDisposition returns skip", () => {
	assert.equal(getManualDisposition(makeTaskState({ manualDisposition: "skip" })), "skip");
});

test("P24: getManualDisposition returns force_rerun", () => {
	assert.equal(getManualDisposition(makeTaskState({ manualDisposition: "force_rerun" })), "force_rerun");
});

test("P24: default+succeeded → reuse", () => {
	assert.equal(shouldExecuteOnRerun(makeTaskState({ status: "succeeded" })), false);
});

test("P24: default+pending → execute", () => {
	assert.equal(shouldExecuteOnRerun(makeTaskState({ status: "pending" })), true);
});

test("P24: default+failed → execute", () => {
	assert.equal(shouldExecuteOnRerun(makeTaskState({ status: "failed" })), true);
});

test("P24: default+interrupted → execute", () => {
	assert.equal(shouldExecuteOnRerun(makeTaskState({ status: "interrupted" })), true);
});

test("P24: default+cancelled → execute", () => {
	assert.equal(shouldExecuteOnRerun(makeTaskState({ status: "cancelled" })), true);
});

test("P24: skip overrides succeeded → do not execute", () => {
	assert.equal(shouldExecuteOnRerun(makeTaskState({ status: "succeeded", manualDisposition: "skip" })), false);
});

test("P24: skip overrides failed → do not execute", () => {
	assert.equal(shouldExecuteOnRerun(makeTaskState({ status: "failed", manualDisposition: "skip" })), false);
});

test("P24: force_rerun overrides succeeded → execute", () => {
	assert.equal(shouldExecuteOnRerun(makeTaskState({ status: "succeeded", manualDisposition: "force_rerun" })), true);
});

test("P24: force_rerun on pending → execute", () => {
	assert.equal(shouldExecuteOnRerun(makeTaskState({ status: "pending", manualDisposition: "force_rerun" })), true);
});

test("P24: RunState summary includes skippedTasks", () => {
	const state: TeamRunState = {
		schemaVersion: "team/state-1",
		runId: "run_p24",
		planId: "plan_1",
		teamUnitId: "team_1",
		status: "completed",
		createdAt: "",
		queuedAt: "",
		startedAt: null,
		finishedAt: null,
		activeElapsedMs: 0,
		currentTaskId: null,
		taskStates: {},
		summary: { totalTasks: 3, succeededTasks: 1, failedTasks: 1, cancelledTasks: 0, skippedTasks: 1 },
		pauseReason: null,
		lastError: null,
		updatedAt: "",
	};
	assert.equal(state.summary.skippedTasks, 1);
});
