import { AsyncLocalStorage } from "node:async_hooks";
import type { TeamRunState, TeamTask, TeamTaskState, TeamPlan, TeamDiscoveryResultRecord, TaskManualDisposition, TeamOutputValidationResult } from "./types.js";
import { PlanStore } from "./plan-store.js";
import { TeamUnitStore } from "./team-unit-store.js";
import { RunWorkspace } from "./run-workspace.js";
import { computeTeamRunSummary } from "./team-summary.js";
import type { TeamRoleRunner, ProfileAwareTeamRoleRunner } from "./role-runner.js";
import { writeTimingSpan } from "./timing.js";
import { progressMessages } from "./progress.js";
import { TaskExpansionPlanner, TemplateTaskExpansionPlanner } from "./task-expansion-planner.js";
import { validateTeamOutput } from "./output-validator.js";

export interface PhaseTimeouts {
	workerMs: number;
	checkerMs: number;
	watcherMs: number;
	finalizerMs: number;
}

export const DEFAULT_PHASE_TIMEOUTS: PhaseTimeouts = {
	workerMs: 900_000,
	checkerMs: 300_000,
	watcherMs: 300_000,
	finalizerMs: 300_000,
};

export interface TeamOrchestratorOptions {
	planStore: PlanStore;
	teamUnitStore: TeamUnitStore;
	workspace: RunWorkspace;
	roleRunner: TeamRoleRunner;
	dataDir: string;
	maxCheckerRevisions: number;
	maxWatcherRevisions: number;
	maxRunDurationMinutes: number;
	maxConcurrentRuns?: number;
	phaseTimeouts?: PhaseTimeouts;
	taskExpansionPlanner?: TaskExpansionPlanner;
}

const now = () => new Date().toISOString();
const parallelTaskId = new AsyncLocalStorage<string>();

function clearSuccessfulForceRerunDispositions(state: TeamRunState): boolean {
	let changed = false;
	for (const ts of Object.values(state.taskStates)) {
		if (ts.manualDisposition === "force_rerun" && ts.status === "succeeded") {
			ts.manualDisposition = "default";
			ts.manualDispositionUpdatedAt = now();
			changed = true;
		}
	}
	return changed;
}

const TERMINAL_TASK_STATUSES = new Set(["succeeded", "failed", "cancelled", "skipped"]);

interface WorkUnitRunResult {
	status: "passed" | "failed";
	outputValidation: TeamOutputValidationResult;
}

export function getManualDisposition(taskState: TeamTaskState): TaskManualDisposition {
	return taskState.manualDisposition ?? "default";
}

export function shouldExecuteOnRerun(taskState: TeamTaskState): boolean {
	const d = getManualDisposition(taskState);
	if (d === "skip") return false;
	if (d === "force_rerun") return true;
	return taskState.status !== "succeeded";
}
const DEFAULT_DECOMPOSER_MAX_CHILDREN = 8;
const PARALLEL_FOR_EACH_CONCURRENCY = 3;
const MAX_TOTAL_TASKS_PER_RUN = 50;

function isRunExternallyStopped(status: string): boolean {
	return status === "cancelled" || status === "paused";
}

function noOutputValidation(): TeamOutputValidationResult {
	return { ok: true, kind: "none", sourceRef: null, checks: [{ name: "no_output_check", ok: true }], normalizedRef: null };
}

function summarizeOutputValidationFailure(result: TeamOutputValidationResult): string {
	const failed = result.checks.find(check => !check.ok && check.name !== "json_parse")
		?? result.checks.find(check => !check.ok);
	const detail = failed?.message ?? failed?.name ?? "unknown validation failure";
	return `output validation failed: ${detail}`;
}

function generateFallbackReport(
	plan: import("./types.js").TeamPlan,
	state: TeamRunState,
	error: unknown,
): string {
	const message = error instanceof Error ? error.message : String(error);
	const statusLabel = (s: string) => s === "succeeded" ? "成功" : s === "skipped" ? "跳过" : s === "cancelled" ? "取消" : s === "failed" ? "失败" : s;
	const lines: string[] = [
		"# 系统汇总报告",
		"",
		"> 注意：这是系统自动生成的 fallback 报告，不是 finalizer Agent 原始输出。",
		`> finalizer 执行失败：${message}`,
		"",
		"## 运行汇总",
		`- 总任务数：${state.summary.totalTasks}`,
		`- 成功：${state.summary.succeededTasks}`,
		`- 失败：${state.summary.failedTasks}`,
		`- 跳过：${state.summary.skippedTasks}`,
		`- 取消：${state.summary.cancelledTasks}`,
		"",
		"## 任务执行结果",
		"",
	];
	const taskTitleLookup = new Map(plan.tasks.map(t => [t.id, t.title]));
	for (const [taskId, ts] of Object.entries(state.taskStates)) {
		const title = taskTitleLookup.get(taskId) ?? taskId;
		lines.push(`- ${taskId}（${title}）：${statusLabel(ts.status)}`);
		if (ts.resultRef) lines.push(`  - 结果：${ts.resultRef}`);
		if (ts.errorSummary) lines.push(`  - 错误：${ts.errorSummary}`);
		if (ts.previousErrorSummary) lines.push(`  - 原始错误（跳过前）：${ts.previousErrorSummary}`);
	}
	lines.push("", `生成时间：${now()}`, "");
	return lines.join("\n");
}

async function runWithTimeout<T>(
	phase: string,
	timeoutMs: number,
	parentSignal: AbortSignal,
	fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	const controller = new AbortController();
	let timeout: NodeJS.Timeout | null = null;
	let removeParentListener = (): void => {};
	try {
		if (parentSignal.aborted) {
			throw parentSignal.reason instanceof Error ? parentSignal.reason : new Error("aborted");
		}
		const onParentAbort = () => controller.abort(parentSignal.reason instanceof Error ? parentSignal.reason : new Error("aborted"));
		parentSignal.addEventListener("abort", onParentAbort, { once: true });
		removeParentListener = () => parentSignal.removeEventListener("abort", onParentAbort);
		const timeoutPromise = new Promise<never>((_, reject) => {
			timeout = setTimeout(() => {
				const error = new Error(`${phase} timeout`);
				controller.abort(error);
				reject(error);
			}, timeoutMs);
		});
		return await Promise.race([fn(controller.signal), timeoutPromise]);
	} finally {
		removeParentListener();
		if (timeout) clearTimeout(timeout);
	}
}

export class TeamOrchestrator {
	private readonly planStore: PlanStore;
	private readonly teamUnitStore: TeamUnitStore;
	private readonly workspace: RunWorkspace;
	private readonly roleRunner: TeamRoleRunner;
	private readonly dataDir: string;
	private readonly maxCheckerRevisions: number;
	private readonly maxWatcherRevisions: number;
	private readonly maxRunDurationMs: number;
	private readonly phaseTimeouts: PhaseTimeouts;
	private readonly maxConcurrentRuns: number;
	private readonly taskExpansionPlanner: TaskExpansionPlanner;
	private elapsedOffset = 0;
	private abortController: AbortController | null = null;
	private leaseOwnerId: string | null = null;

	constructor(options: TeamOrchestratorOptions) {
		this.planStore = options.planStore;
		this.teamUnitStore = options.teamUnitStore;
		this.workspace = options.workspace;
		this.roleRunner = options.roleRunner;
		this.dataDir = options.dataDir;
		this.maxCheckerRevisions = options.maxCheckerRevisions;
		this.maxWatcherRevisions = options.maxWatcherRevisions;
		this.maxRunDurationMs = options.maxRunDurationMinutes * 60 * 1000;
		this.phaseTimeouts = options.phaseTimeouts ?? DEFAULT_PHASE_TIMEOUTS;
		this.maxConcurrentRuns = Math.max(1, Math.floor(options.maxConcurrentRuns ?? 1));
		this.taskExpansionPlanner = options.taskExpansionPlanner ?? new TemplateTaskExpansionPlanner();
	}

	async createRun(planId: string, options?: { maxRunDurationMinutes?: number }): Promise<TeamRunState> {
		const plan = await this.planStore.get(planId);
		if (!plan) throw new Error(`plan not found: ${planId}`);

		const teamUnit = await this.teamUnitStore.get(plan.defaultTeamUnitId);
		if (!teamUnit) throw new Error(`team unit not found: ${plan.defaultTeamUnitId}`);
		if (teamUnit.archived) throw new Error("archived team unit cannot be used");

		const state = await this.workspace.createRunWithAdmission(plan, teamUnit.teamUnitId, this.maxConcurrentRuns, options);
		await this.planStore.incrementRunCount(planId);
		return state;
	}

	async runNextQueued(): Promise<TeamRunState | null> {
		const states = await this.workspace.listStates();
		const queued = states.find(s => s.status === "queued");
		if (!queued) return null;
		return this.runToCompletion(queued.runId);
	}

	async runToCompletion(runId: string, options?: { signal?: AbortSignal; leaseOwnerId?: string }): Promise<TeamRunState> {
		let state = await this.workspace.getState(runId);
		if (!state) throw new Error(`run not found: ${runId}`);

		this.leaseOwnerId = options?.leaseOwnerId ?? null;
		this.abortController = new AbortController();
		if (options?.signal) {
			if (options.signal.aborted) {
				this.abortController = null;
				throw options.signal.reason instanceof Error ? options.signal.reason : new Error("aborted before start");
			}
			options.signal.addEventListener("abort", () => {
				this.abortController?.abort(options.signal!.reason);
			}, { once: true });
		}
		const signal = this.abortController.signal;

		const teamUnit = await this.teamUnitStore.get(state.teamUnitId);
		if (teamUnit && "setProfileIds" in this.roleRunner && typeof (this.roleRunner as ProfileAwareTeamRoleRunner).setProfileIds === "function") {
			(this.roleRunner as ProfileAwareTeamRoleRunner).setProfileIds({
				workerProfileId: teamUnit.workerProfileId,
				checkerProfileId: teamUnit.checkerProfileId,
				watcherProfileId: teamUnit.watcherProfileId,
				finalizerProfileId: teamUnit.finalizerProfileId,
				decomposerProfileId: teamUnit.decomposerProfileId,
			});
		}

		try {
			state = await this.transitionToRunning(state);
			this.elapsedOffset = state.activeElapsedMs;

			const plan = await this.planStore.get(state.planId);
			if (!plan) throw new Error(`plan not found: ${state.planId}`);

			const discoveryResults: Record<string, { outputKey: string; items: Array<Record<string, unknown>> }> = {};

			for (const task of plan.tasks) {
				state = (await this.workspace.getState(runId))!;
				if (state.status !== "running" || this.shouldStop(state)) break;

				const taskState = state.taskStates[task.id];
				if (taskState && TERMINAL_TASK_STATUSES.has(taskState.status)) {
					if (task.type === "discovery" && taskState.status === "succeeded") {
						await this.loadDiscoveryResult(state.runId, task, discoveryResults);
					}
					if (taskState.status === "skipped") {
						await this.skipGeneratedChildren(state, task);
					} else if (task.type === "for_each") {
						await this.executeExpandedChildren(state, task, plan, signal);
					}
					continue;
				}

				if (this.isTimedOut(state)) {
					await this.handleTimeout(state, plan);
					return (await this.workspace.getState(runId))!;
				}

				if (signal.aborted) break;

				const taskType = task.type ?? "normal";
				if (taskType === "normal" || taskType === "discovery") {
					await this.executeMaybeDecomposedTask(state, task, plan, signal);
					state = (await this.workspace.getState(runId))!;
					if (taskType === "discovery" && state.taskStates[task.id]?.status === "succeeded") {
						await this.loadDiscoveryResult(state.runId, task, discoveryResults);
					}
				} else if (taskType === "for_each") {
					await this.executeForEachTask(state, task, plan, discoveryResults, signal);
				}
			}

			state = (await this.workspace.getState(runId))!;
			if (state.status === "running" && !this.shouldStop(state)) {
				await this.runFinalizer(state, plan, signal);
			}

			return (await this.workspace.getState(runId))!;
		} catch (error) {
			if (signal.aborted) {
				const current = await this.workspace.getState(runId);
				if (current && this.shouldStop(current)) {
					return current;
				}
			}
			return await this.failRun(runId, error);
		} finally {
			this.abortController = null;
			this.leaseOwnerId = null;
		}
	}

	async pauseRun(runId: string, reason: string): Promise<TeamRunState> {
		const state = await this.workspace.getState(runId);
		if (!state) throw new Error(`run not found: ${runId}`);
		if (state.status !== "running") throw new Error(`can only pause running run, current: ${state.status}`);

		state.status = "paused";
		state.pauseReason = reason;
		state.lastError = reason;
		state.activeElapsedMs = this.accumulateElapsed(state);
		state.lease = null;
		state.updatedAt = now();

		// Mark ALL running tasks as interrupted (covers parallel children)
		const runningTaskIds: string[] = [];
		for (const [tid, ts] of Object.entries(state.taskStates)) {
			if (ts.status === "running") {
				ts.status = "interrupted";
				ts.progress = { phase: "interrupted", message: progressMessages.interrupted, updatedAt: now() };
				runningTaskIds.push(tid);
			}
		}

		state.summary = computeTeamRunSummary(state.taskStates);
		await this.workspace.saveState(state);

		// Best-effort: mark active attempts as interrupted
		for (const tid of runningTaskIds) {
			const ts = state.taskStates[tid];
			if (ts?.activeAttemptId) {
				await this.workspace.finishAttempt(runId, tid, ts.activeAttemptId, { status: "interrupted", phase: "interrupted", errorSummary: "run paused" }).catch(() => {});
			}
		}

		this.abortController?.abort(new Error(reason));

		return state;
	}

	async resumeRun(runId: string): Promise<TeamRunState> {
		const state = await this.workspace.getState(runId);
		if (!state) throw new Error(`run not found: ${runId}`);
		if (state.status !== "paused") throw new Error(`can only resume paused run, current: ${state.status}`);

		// Reset interrupted tasks to pending so they can execute on resume
		for (const ts of Object.values(state.taskStates)) {
			if (ts.status === "interrupted") {
				ts.status = "pending";
				ts.progress = { phase: "pending", message: progressMessages.pending, updatedAt: now() };
			}
		}

		this.elapsedOffset = state.activeElapsedMs;
		state.status = "queued";
		state.lease = null;
		state.pauseReason = null;
		state.updatedAt = now();
		state.summary = computeTeamRunSummary(state.taskStates);
		await this.workspace.saveState(state);
		return state;
	}

	async cancelRun(runId: string, reason: string): Promise<TeamRunState> {
		const state = await this.workspace.getState(runId);
		if (!state) throw new Error(`run not found: ${runId}`);
		if (state.status === "completed" || state.status === "failed" || state.status === "cancelled" || state.status === "completed_with_failures") {
			throw new Error(`cannot cancel terminal run: ${state.status}`);
		}

		state.status = "cancelled";
		state.lastError = reason;
		state.activeElapsedMs = this.accumulateElapsed(state);
		state.finishedAt = now();
		state.lease = null;
		state.updatedAt = now();

		for (const [tid, ts] of Object.entries(state.taskStates)) {
			if (ts.status === "running" || ts.status === "pending" || ts.status === "interrupted") {
				ts.status = "cancelled";
				ts.progress = { phase: "cancelled", message: progressMessages.cancelled, updatedAt: now() };
				}
		}

		state.summary = computeTeamRunSummary(state.taskStates);
		await this.workspace.saveState(state);

		// Best-effort: mark active attempts as cancelled
		for (const [tid, ts] of Object.entries(state.taskStates)) {
			if (ts.activeAttemptId) {
				await this.workspace.finishAttempt(runId, tid, ts.activeAttemptId, { status: "cancelled", phase: "cancelled", errorSummary: "run cancelled" }).catch(() => {});
			}
		}

		this.abortController?.abort(new Error(reason));

		return state;
	}

	async deleteTerminalRun(runId: string): Promise<void> {
		const state = await this.workspace.getState(runId);
		if (!state) throw new Error(`run not found: ${runId}`);
		const terminal = ["completed", "completed_with_failures", "failed", "cancelled"] as const;
		if (!terminal.includes(state.status as (typeof terminal)[number])) {
			throw new Error("non-terminal run cannot be deleted");
		}
		await this.workspace.deleteRun(runId);
	}

	async rerunRun(runId: string): Promise<TeamRunState> {
		const state = await this.workspace.getState(runId);
		if (!state) throw new Error(`run not found: ${runId}`);
		const rerunnable = ["completed", "completed_with_failures", "failed", "cancelled"] as const;
		if (!rerunnable.includes(state.status as (typeof rerunnable)[number])) {
			throw new Error(`cannot rerun run with status: ${state.status}`);
		}

		// Reset task states based on rerun semantics
		for (const [taskId, ts] of Object.entries(state.taskStates)) {
			const disposition = getManualDisposition(ts);
			if (disposition === "skip") {
				ts.status = "skipped";
				if (ts.errorSummary) ts.previousErrorSummary = ts.errorSummary;
				ts.errorSummary = null;
				ts.progress = { phase: "skipped", message: progressMessages.skipped, updatedAt: now() };
			} else if (shouldExecuteOnRerun(ts)) {
				ts.status = "pending";
				ts.activeAttemptId = null;
				ts.resultRef = null;
				ts.errorSummary = null;
				ts.previousErrorSummary = null;
				ts.progress = { phase: "pending", message: progressMessages.pending, updatedAt: now() };
			}
			// else: default+succeeded → preserve resultRef, status stays succeeded
		}

		// Reset parent tasks whose children were modified
		const parentsToReset = new Set<string>();
		for (const [taskId, ts] of Object.entries(state.taskStates)) {
			if (ts.status === "pending" || ts.status === "skipped") {
				for (const [parentId] of Object.entries(state.taskStates)) {
					const expansion = await this.workspace.readExpansion(runId, parentId).catch(() => null);
					if (expansion?.children.some(c => c.taskId === taskId)) {
						parentsToReset.add(parentId);
					}
					const decomposition = await this.workspace.readDecomposition(runId, parentId).catch(() => null);
					if (decomposition?.children.some(c => c.taskId === taskId)) {
						parentsToReset.add(parentId);
					}
				}
			}
		}
		for (const parentId of parentsToReset) {
			const pts = state.taskStates[parentId];
			if (pts && pts.status !== "pending" && pts.status !== "skipped") {
				pts.status = "pending";
				pts.activeAttemptId = null;
				pts.resultRef = null;
				pts.errorSummary = null;
				pts.progress = { phase: "pending", message: progressMessages.pending, updatedAt: now() };
			}
		}

		// Recompute summary
		state.summary = computeTeamRunSummary(state.taskStates);

		// Reset run-level terminal fields
		state.status = "queued";
		state.finishedAt = null;
		state.lastError = null;
		state.pauseReason = null;
		state.currentTaskId = null;
		state.finalizerRuntimeContext = null;
		state.lease = null;
		state.startedAt = null;
		state.activeElapsedMs = 0;
		state.queuedAt = now();
		state.updatedAt = now();
		await this.workspace.saveState(state);

		// Remove stale final report so it cannot be served as fresh
		await this.workspace.removeFinalReport(runId);

		return state;
	}

	private async transitionToRunning(state: TeamRunState): Promise<TeamRunState> {
		if (state.status === "running") return state;
		state.status = "running";
		state.startedAt = state.startedAt ?? now();
		state.updatedAt = now();
		await this.workspace.saveState(state);
		return state;
	}

	private async executeMaybeDecomposedTask(
		initialState: TeamRunState,
		task: TeamTask,
		plan: TeamPlan,
		signal: AbortSignal,
	): Promise<void> {
		const mode = task.decomposer?.mode ?? "none";
		if (mode === "none") {
			await this.executeTask(initialState, task, signal);
			return;
		}

		const existing = await this.workspace.readDecomposition(initialState.runId, task.id);
		if (existing) {
			let state = (await this.workspace.getState(initialState.runId))!;
			if (this.shouldStop(state)) return;
			if (existing.decision === "no_split") {
				await this.executeTask(state, task, signal);
				return;
			}
			const childTasks = existing.children.map(child => child.task);
			await this.workspace.appendChildTaskStates(state.runId, childTasks);
			state = (await this.workspace.getState(state.runId))!;
			if (this.shouldStop(state)) return;
			await this.executeDecomposedChildren(state, task, plan, childTasks, signal);
			return;
		}

		let state = initialState;
		state.currentTaskId = task.id;
		state.taskStates[task.id]!.status = "running";
		state.taskStates[task.id]!.progress = { phase: "worker_running", message: "running decomposer", updatedAt: now() };
		state.updatedAt = now();
		state.summary = computeTeamRunSummary(state.taskStates);
		await this.workspace.saveState(state);

		const output = await runWithTimeout("decomposer", this.phaseTimeouts.workerMs, signal, async (localSignal) => {
			return this.roleRunner.runDecomposer({
				runId: state.runId,
				plan,
				task,
				maxChildren: task.decomposer?.maxChildren ?? DEFAULT_DECOMPOSER_MAX_CHILDREN,
				signal: localSignal,
			});
		});

		state = (await this.workspace.getState(initialState.runId))!;
		if (this.shouldStop(state)) return;

		if (output.decision === "no_split") {
			await this.workspace.writeDecomposition(state.runId, {
				schemaVersion: "team/task-decomposition-1",
				parentTaskId: task.id,
				mode,
				decision: "no_split",
				reason: output.reason,
				decomposedAt: now(),
				children: [],
				runtimeContext: output.runtimeContext,
			});
			await this.executeTask(state, task, signal);
			return;
		}

		const childTasks = (output.children ?? []).map(child => ({
			...child,
			type: child.type ?? "normal",
			parentTaskId: task.id,
			generated: true,
		}));
		const validationError = this.validateDecomposedChildren(state, task, childTasks);
		if (validationError) {
			await this.failTaskSafely(state.runId, task.id, validationError);
			return;
		}
		await this.workspace.writeDecomposition(state.runId, {
			schemaVersion: "team/task-decomposition-1",
			parentTaskId: task.id,
			mode,
			decision: "split",
			reason: output.reason,
			decomposedAt: now(),
			children: childTasks.map(child => ({
				taskId: child.id,
				title: child.title,
				task: child,
			})),
			runtimeContext: output.runtimeContext,
		});
		await this.workspace.appendChildTaskStates(state.runId, childTasks);
		state = (await this.workspace.getState(state.runId))!;
		if (this.shouldStop(state)) return;
		await this.executeDecomposedChildren(state, task, plan, childTasks, signal);
	}

	private validateDecomposedChildren(state: TeamRunState, parentTask: TeamTask, childTasks: TeamTask[]): string | null {
		const maxChildren = parentTask.decomposer?.maxChildren ?? DEFAULT_DECOMPOSER_MAX_CHILDREN;
		if (childTasks.length > maxChildren) {
			return `decomposer returned ${childTasks.length} children, exceeds maxChildren ${maxChildren}`;
		}
		if (Object.keys(state.taskStates).length + childTasks.length > MAX_TOTAL_TASKS_PER_RUN) {
			return `decomposer would exceed total task limit ${MAX_TOTAL_TASKS_PER_RUN}`;
		}

		const seen = new Set<string>();
		const parentMode = parentTask.decomposer?.mode ?? "none";
		for (const child of childTasks) {
			if (!child.id.trim()) return "decomposer child task id is required";
			if (seen.has(child.id) || state.taskStates[child.id]) {
				return `duplicate child task id: ${child.id}`;
			}
			seen.add(child.id);
			if ((child.type ?? "normal") !== "normal") {
				return `decomposer child task must be normal: ${child.id}`;
			}
			const childMode = child.decomposer?.mode ?? "none";
			if (parentMode === "leaf" && childMode !== "none") {
				return `leaf child must use decomposer mode none: ${child.id}`;
			}
			if (parentMode === "propagate" && childMode === "propagate") {
				return `propagate child cannot use decomposer mode propagate: ${child.id}`;
			}
		}
		return null;
	}

	private async failTaskSafely(runId: string, taskId: string, errorSummary: string): Promise<void> {
		const state = (await this.workspace.getState(runId))!;
		if (this.shouldStop(state)) return;
		const ts = state.taskStates[taskId];
		if (!ts || TERMINAL_TASK_STATUSES.has(ts.status)) return;
		ts.status = "failed";
		ts.errorSummary = errorSummary;
		ts.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
		state.updatedAt = now();
		state.summary = computeTeamRunSummary(state.taskStates);
		await this.workspace.saveState(state);
	}

	private async executeDecomposedChildren(
		initialState: TeamRunState,
		parentTask: TeamTask,
		plan: TeamPlan,
		childTasks: TeamTask[],
		signal: AbortSignal,
	): Promise<void> {
		let state = initialState;
		state.currentTaskId = parentTask.id;
		state.taskStates[parentTask.id]!.status = "running";
		state.taskStates[parentTask.id]!.progress = {
			phase: "worker_running",
			message: `decomposed into ${childTasks.length} child tasks`,
			updatedAt: now(),
		};
		state.updatedAt = now();
		state.summary = computeTeamRunSummary(state.taskStates);
		await this.workspace.saveState(state);

		if (childTasks.length === 0) {
			state = (await this.workspace.getState(state.runId))!;
			state.taskStates[parentTask.id]!.status = "succeeded";
			state.taskStates[parentTask.id]!.progress = { phase: "succeeded", message: "no child tasks returned", updatedAt: now() };
			state.updatedAt = now();
			state.summary = computeTeamRunSummary(state.taskStates);
			await this.workspace.saveState(state);
			return;
		}

		for (const child of childTasks) {
			state = (await this.workspace.getState(state.runId))!;
			if (state.status !== "running" || this.shouldStop(state)) break;
			if (TERMINAL_TASK_STATUSES.has(state.taskStates[child.id]?.status ?? "pending")) continue;
			if (signal.aborted) break;
			if (this.isTimedOut(state)) {
				await this.handleTimeout(state, plan);
				return;
			}
			await this.executeMaybeDecomposedTask(state, child, plan, signal);
		}

		state = (await this.workspace.getState(initialState.runId))!;
		if (state.status !== "running" || this.shouldStop(state)) return;
		const allDone = childTasks.every(child => {
			const childState = state.taskStates[child.id];
			return childState && TERMINAL_TASK_STATUSES.has(childState.status);
		});
		if (!allDone) return;

		const failedChild = childTasks.find(child => state.taskStates[child.id]?.status === "failed");
		const ts = state.taskStates[parentTask.id]!;
		if (failedChild) {
			const childState = state.taskStates[failedChild.id]!;
			ts.status = "failed";
			ts.errorSummary = `decomposed child ${failedChild.id} failed: ${childState.errorSummary ?? "unknown error"}`;
			ts.resultRef = childState.resultRef;
			ts.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
		} else {
			const allSkipped = childTasks.every(child => state.taskStates[child.id]?.status === "skipped");
			if (allSkipped) {
				ts.status = "skipped";
				ts.errorSummary = null;
				ts.progress = { phase: "skipped", message: progressMessages.skipped, updatedAt: now() };
				} else {
				ts.status = "succeeded";
				ts.errorSummary = null;
				ts.progress = { phase: "succeeded", message: progressMessages.succeeded, updatedAt: now() };
				}
		}
		state.updatedAt = now();
		state.summary = computeTeamRunSummary(state.taskStates);
		await this.workspace.saveState(state);
	}

	private async executeTask(initialState: TeamRunState, task: TeamTask, signal: AbortSignal): Promise<void> {
		let state = initialState;
		state.currentTaskId = task.id;
		state.taskStates[task.id]!.status = "running";
		state.taskStates[task.id]!.progress = { phase: "worker_running", message: progressMessages.worker_running, updatedAt: now() };
		state.updatedAt = now();
		state.summary = computeTeamRunSummary(state.taskStates);
		await this.workspace.saveState(state);

		let attemptCount = state.taskStates[task.id]!.attemptCount;
		let watcherRevisions = 0;
		let taskDone = false;

		while (!taskDone && watcherRevisions <= this.maxWatcherRevisions) {
			attemptCount++;
			state = (await this.workspace.getState(state.runId))!;
			if (this.shouldStop(state)) return;
			state.taskStates[task.id]!.attemptCount = attemptCount;
			const { attemptId, attemptRoot } = await this.workspace.createAttempt(state.runId, task.id);
			state.taskStates[task.id]!.activeAttemptId = attemptId;
			state.summary = computeTeamRunSummary(state.taskStates);
			await this.workspace.saveState(state);

			const workUnitResult = await this.runWorkUnit(state, task, attemptId, attemptRoot, signal);

			state = (await this.workspace.getState(state.runId))!;
			const currentTs = state.taskStates[task.id]!;

			if (currentTs.status === "interrupted" || currentTs.status === "cancelled") return;
			if (this.shouldStop(state)) return;

			const watcherResult = await this.runWatcherPhase(state, task, attemptId, workUnitResult, signal);

			// Re-read state after watcher returns — external cancel may have landed
			state = (await this.workspace.getState(state.runId))!;
			if (this.shouldStop(state)) return;
			const ts = state.taskStates[task.id]!;

			if (watcherResult.decision === "accept_task") {
				if (workUnitResult.status === "passed") {
					if (task.type === "discovery" && task.discovery) {
						const standardized = await this.writeStandardDiscoveryResult(state.runId, task, attemptId);
						const valErr = `discovery result validation failed: expected outputKey '${task.discovery.outputKey}' to be an array with stable item ids`;
						if (!standardized) {
							await this.workspace.finishAttempt(state.runId, task.id, attemptId, { status: "failed", phase: "failed", errorSummary: valErr });
							ts.status = "failed";
							ts.errorSummary = valErr;
							ts.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
											taskDone = true;
							state.updatedAt = now();
							state.summary = computeTeamRunSummary(state.taskStates);
							await this.workspace.saveState(state);
							return;
						}
					}
					await this.workspace.finishAttempt(state.runId, task.id, attemptId, { status: "succeeded", phase: "succeeded", resultRef: ts.resultRef });
					ts.status = "succeeded";
					ts.progress = { phase: "succeeded", message: progressMessages.succeeded, updatedAt: now() };
						} else {
					await this.workspace.finishAttempt(state.runId, task.id, attemptId, { status: "failed", phase: "failed", errorSummary: "watcher accepted failed work unit" });
					ts.status = "failed";
					ts.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
						}
				taskDone = true;
			} else if (watcherResult.decision === "confirm_failed") {
				const attList = await this.workspace.listAttempts(state.runId, task.id);
				const att = attList.find(a => a.attemptId === attemptId);
				if (!att?.finishedAt) {
					await this.workspace.finishAttempt(state.runId, task.id, attemptId, { status: "failed", phase: "failed", errorSummary: "watcher confirmed failed" });
				}
				ts.status = "failed";
				ts.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
					taskDone = true;
			} else if (watcherResult.decision === "request_revision") {
				watcherRevisions++;
				if (watcherRevisions > this.maxWatcherRevisions) {
					const attListW = await this.workspace.listAttempts(state.runId, task.id);
					const attW = attListW.find(a => a.attemptId === attemptId);
					if (!attW?.finishedAt) {
						await this.workspace.finishAttempt(state.runId, task.id, attemptId, { status: "failed", phase: "failed", errorSummary: "exceeded max watcher revisions" });
					}
					ts.status = "failed";
					ts.errorSummary = "exceeded max watcher revisions";
					ts.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
							taskDone = true;
				} else {
					await this.workspace.finishAttempt(state.runId, task.id, attemptId, { status: "interrupted", phase: "watcher_revision_requested", errorSummary: "watcher requested revision" });
				}
			}

			state.updatedAt = now();
			state.summary = computeTeamRunSummary(state.taskStates);
			await this.workspace.saveState(state);
		}
	}

	private async runWorkUnit(state: TeamRunState, task: TeamTask, attemptId: string, attemptRoot: string, signal: AbortSignal): Promise<WorkUnitRunResult> {
		const runId = state.runId;
		let checkerRevision = 0;
		let lastFeedback: string | undefined;

		while (true) {
			const freshState = await this.workspace.getState(runId);
			if (!freshState || freshState.status !== "running" || this.shouldStop(freshState)) return { status: "failed", outputValidation: noOutputValidation() };

			await this.workspace.updateAttemptPhase(runId, task.id, attemptId, "worker_running");

			const workerStarted = new Date();
			let workerOut: import("./role-runner.js").WorkerOutput;
			try {
				workerOut = await runWithTimeout("worker", this.phaseTimeouts.workerMs, signal, async (localSignal) => {
					return this.roleRunner.runWorker({
						runId, task, attemptId,
						workDir: `${attemptRoot}/work`,
						outputDir: `${attemptRoot}/output`,
						acceptanceRules: task.acceptance.rules,
						feedback: lastFeedback,
						signal: localSignal,
					});
				});
			} catch (error) {
				const workerFinished = new Date();
				await writeTimingSpan(this.dataDir, {
					runId, taskId: task.id, attemptId, phase: "worker",
					startedAt: workerStarted.toISOString(), finishedAt: workerFinished.toISOString(),
					durationMs: workerFinished.getTime() - workerStarted.getTime(),
				});
				if (error instanceof Error && error.message === "worker timeout") {
					const s = (await this.workspace.getState(runId))!;
					if (this.shouldStop(s)) return { status: "failed", outputValidation: noOutputValidation() };
					const failRef = await this.workspace.writeFailedResult(runId, task.id, attemptId, "worker timeout");
					await this.workspace.finishAttempt(runId, task.id, attemptId, { status: "failed", phase: "failed", resultRef: failRef, errorSummary: "worker timeout" });
					s.taskStates[task.id]!.resultRef = failRef;
					s.taskStates[task.id]!.errorSummary = "worker timeout";
					await this.workspace.saveState(s);
					return { status: "failed", outputValidation: noOutputValidation() };
				}
				throw error;
			}

			// Re-read after worker returns — cancel may have landed during execution
			if (this.shouldStop((await this.workspace.getState(runId)))) return { status: "failed", outputValidation: noOutputValidation() };

			const workerOutputIdx = checkerRevision + 1;
			const workerRef = await this.workspace.writeWorkerOutput(runId, task.id, attemptId, workerOutputIdx, workerOut.content);
			await this.workspace.recordAttemptWorkerOutput(runId, task.id, attemptId, {
				outputRef: workerRef,
				outputIndex: workerOutputIdx,
				runtimeContext: workerOut.runtimeContext,
			});
			await this.workspace.updateAttemptPhase(runId, task.id, attemptId, "worker_completed");
			const workerValidation = await validateTeamOutput({
				workspace: this.workspace,
				runId,
				task,
				attemptId,
				contents: [{ ref: workerRef, content: workerOut.content }],
			});

			const workerFinished = new Date();
			await writeTimingSpan(this.dataDir, {
				runId, taskId: task.id, attemptId, phase: "worker",
				startedAt: workerStarted.toISOString(), finishedAt: workerFinished.toISOString(),
				durationMs: workerFinished.getTime() - workerStarted.getTime(),
			});

			await this.workspace.updateAttemptPhase(runId, task.id, attemptId, "checker_reviewing");

			const checkingState = await this.workspace.getState(runId);
			if (checkingState && !this.shouldStop(checkingState)) {
				checkingState.taskStates[task.id]!.progress = { phase: "checker_reviewing", message: progressMessages.checker_reviewing, updatedAt: now() };
				checkingState.updatedAt = now();
				await this.workspace.saveState(checkingState);
			}

			const checkerStarted = new Date();
			let checkerOut: import("./role-runner.js").CheckerOutput;
			try {
				checkerOut = await runWithTimeout("checker", this.phaseTimeouts.checkerMs, signal, async (localSignal) => {
					return this.roleRunner.runChecker({
						runId, task, attemptId,
						workerOutputRef: workerRef,
						acceptanceRules: task.acceptance.rules,
						outputValidation: workerValidation,
						signal: localSignal,
					});
				});
			} catch (error) {
				const checkerFinished = new Date();
				await writeTimingSpan(this.dataDir, {
					runId, taskId: task.id, attemptId, phase: "checker",
					startedAt: checkerStarted.toISOString(), finishedAt: checkerFinished.toISOString(),
					durationMs: checkerFinished.getTime() - checkerStarted.getTime(),
				});
				if (error instanceof Error && error.message === "checker timeout") {
					const s = (await this.workspace.getState(runId))!;
					if (this.shouldStop(s)) return { status: "failed", outputValidation: workerValidation };
					const failRef = await this.workspace.writeFailedResult(runId, task.id, attemptId, "checker timeout");
					await this.workspace.finishAttempt(runId, task.id, attemptId, { status: "failed", phase: "failed", resultRef: failRef, errorSummary: "checker timeout" });
					s.taskStates[task.id]!.resultRef = failRef;
					s.taskStates[task.id]!.errorSummary = "checker timeout";
					await this.workspace.saveState(s);
					return { status: "failed", outputValidation: workerValidation };
				}
				throw error;
			}

			// Re-read after checker returns — cancel may have landed during execution
			if (this.shouldStop((await this.workspace.getState(runId)))) return { status: "failed", outputValidation: workerValidation };

			const checkerIdx = checkerRevision + 1;
			await this.workspace.writeCheckerVerdict(runId, task.id, attemptId, checkerIdx, checkerOut);
			let checkerFeedbackRef: string | null = null;
			if (checkerOut.feedback) {
				checkerFeedbackRef = await this.workspace.writeCheckerOutput(runId, task.id, attemptId, checkerIdx, checkerOut.feedback);
			}
			await this.workspace.recordAttemptCheckerResult(runId, task.id, attemptId, {
				verdict: checkerOut.verdict,
				reason: checkerOut.reason,
				feedback: checkerOut.feedback,
				revisionIndex: checkerIdx,
				recordRef: `tasks/${task.id}/attempts/${attemptId}/checker-verdict-${String(checkerIdx).padStart(3, "0")}.json`,
				feedbackRef: checkerFeedbackRef,
				runtimeContext: checkerOut.runtimeContext,
			});

			const checkerFinished = new Date();
			await writeTimingSpan(this.dataDir, {
				runId, taskId: task.id, attemptId, phase: "checker",
				startedAt: checkerStarted.toISOString(), finishedAt: checkerFinished.toISOString(),
				durationMs: checkerFinished.getTime() - checkerStarted.getTime(),
			});

			if (checkerOut.verdict === "pass") {
				const resultContent = checkerOut.resultContent ?? workerOut.content;
				const s = (await this.workspace.getState(runId))!;
				if (this.shouldStop(s)) return { status: "failed", outputValidation: workerValidation };
				const acceptedValidation = await validateTeamOutput({
					workspace: this.workspace,
					runId,
					task,
					attemptId,
					contents: [
						{ ref: "checker.resultContent", content: resultContent },
						{ ref: workerRef, content: workerOut.content },
					],
				});
				if (!acceptedValidation.ok) {
					const errorSummary = summarizeOutputValidationFailure(acceptedValidation);
					const failRef = await this.workspace.writeFailedResult(runId, task.id, attemptId, errorSummary);
					s.taskStates[task.id]!.resultRef = failRef;
					s.taskStates[task.id]!.errorSummary = errorSummary;
					await this.workspace.saveState(s);
					return { status: "failed", outputValidation: acceptedValidation };
				}
				const resultRef = await this.workspace.writeAcceptedResult(runId, task.id, attemptId, resultContent);
				await this.workspace.updateAttemptPhase(runId, task.id, attemptId, "checker_passed");
				s.taskStates[task.id]!.resultRef = resultRef;
				await this.workspace.saveState(s);
				return { status: "passed", outputValidation: acceptedValidation };
			}

			if (checkerOut.verdict === "fail") {
				const failContent = checkerOut.resultContent ?? checkerOut.reason;
				const s = (await this.workspace.getState(runId))!;
				if (this.shouldStop(s)) return { status: "failed", outputValidation: workerValidation };
				const failRef = await this.workspace.writeFailedResult(runId, task.id, attemptId, failContent);
				await this.workspace.finishAttempt(runId, task.id, attemptId, { status: "failed", phase: "failed", resultRef: failRef, errorSummary: checkerOut.reason });
				s.taskStates[task.id]!.resultRef = failRef;
				s.taskStates[task.id]!.errorSummary = checkerOut.reason;
				await this.workspace.saveState(s);
				return { status: "failed", outputValidation: workerValidation };
			}

			await this.workspace.updateAttemptPhase(runId, task.id, attemptId, "checker_revising");
			checkerRevision++;
			lastFeedback = checkerOut.feedback;
			if (checkerRevision >= this.maxCheckerRevisions) {
				const s = (await this.workspace.getState(runId))!;
				if (this.shouldStop(s)) return { status: "failed", outputValidation: workerValidation };
				const failRef = await this.workspace.writeFailedResult(runId, task.id, attemptId, `checker revision limit (${this.maxCheckerRevisions}) exceeded`);
				await this.workspace.finishAttempt(runId, task.id, attemptId, { status: "failed", phase: "failed", resultRef: failRef, errorSummary: "checker revision limit exceeded" });
				s.taskStates[task.id]!.resultRef = failRef;
				s.taskStates[task.id]!.errorSummary = "checker revision limit exceeded";
				await this.workspace.saveState(s);
				return { status: "failed", outputValidation: workerValidation };
			}
		}
	}

	private async runWatcherPhase(state: TeamRunState, task: TeamTask, attemptId: string, workUnitResult: WorkUnitRunResult, signal: AbortSignal) {
		const preAttempts = await this.workspace.listAttempts(state.runId, task.id);
		const preAttempt = preAttempts.find(a => a.attemptId === attemptId);
		if (preAttempt && !preAttempt.finishedAt) {
			await this.workspace.updateAttemptPhase(state.runId, task.id, attemptId, "watcher_reviewing");
		}

		const current = await this.workspace.getState(state.runId);
		if (current && !this.shouldStop(current)) {
			current.taskStates[task.id]!.progress = { phase: "watcher_reviewing", message: progressMessages.watcher_reviewing, updatedAt: now() };
			current.updatedAt = now();
			await this.workspace.saveState(current);
		}
		const ts = state.taskStates[task.id];

		const watcherStarted = new Date();
		let watcherOut: import("./role-runner.js").WatcherOutput;
		try {
			watcherOut = await runWithTimeout("watcher", this.phaseTimeouts.watcherMs, signal, async (localSignal) => {
				return this.roleRunner.runWatcher({
					runId: state.runId,
					task,
					attemptId,
					workUnitStatus: workUnitResult.status,
					resultRef: ts?.resultRef ?? null,
					errorSummary: ts?.errorSummary ?? null,
					outputValidation: workUnitResult.outputValidation,
					signal: localSignal,
				});
			});
		} catch (error) {
			const watcherFinished = new Date();
			await writeTimingSpan(this.dataDir, {
				runId: state.runId, taskId: task.id, attemptId, phase: "watcher",
				startedAt: watcherStarted.toISOString(), finishedAt: watcherFinished.toISOString(),
				durationMs: watcherFinished.getTime() - watcherStarted.getTime(),
			});
			if (error instanceof Error && error.message === "watcher timeout") {
				watcherOut = { decision: "confirm_failed", reason: "watcher timeout" };
				await this.workspace.writeWatcherReview(state.runId, task.id, attemptId, watcherOut);
				await this.workspace.recordAttemptWatcherResult(state.runId, task.id, attemptId, {
					decision: "confirm_failed", reason: "watcher timeout",
					recordRef: `tasks/${task.id}/attempts/${attemptId}/watcher-review.json`,
					runtimeContext: watcherOut.runtimeContext,
				});
				return watcherOut;
			}
			throw error;
		}

		await this.workspace.writeWatcherReview(state.runId, task.id, attemptId, watcherOut);
		await this.workspace.recordAttemptWatcherResult(state.runId, task.id, attemptId, {
			decision: watcherOut.decision,
			reason: watcherOut.reason,
			revisionMode: watcherOut.revisionMode,
			feedback: watcherOut.feedback,
			recordRef: `tasks/${task.id}/attempts/${attemptId}/watcher-review.json`,
			runtimeContext: watcherOut.runtimeContext,
		});

		const watcherFinished = new Date();
		await writeTimingSpan(this.dataDir, {
			runId: state.runId, taskId: task.id, attemptId, phase: "watcher",
			startedAt: watcherStarted.toISOString(), finishedAt: watcherFinished.toISOString(),
			durationMs: watcherFinished.getTime() - watcherStarted.getTime(),
		});

		return watcherOut;
	}

	private async runFinalizer(staleState: TeamRunState, plan: import("./types.js").TeamPlan, signal: AbortSignal): Promise<void> {
		const state = (await this.workspace.getState(staleState.runId))!;
		if (this.shouldStop(state)) return;

		const taskResults = Object.entries(state.taskStates).map(([taskId, ts]) => {
			const isSkipped = ts.status === "skipped";
			return {
				taskId,
				status: (ts.status === "succeeded" ? "succeeded" : ts.status === "skipped" ? "skipped" : ts.status === "cancelled" ? "cancelled" : "failed") as "succeeded" | "failed" | "cancelled" | "skipped",
				resultRef: ts.resultRef,
				errorSummary: isSkipped ? null : ts.errorSummary,
				previousErrorSummary: ts.previousErrorSummary ?? undefined,
				manualDisposition: ts.manualDisposition,
			};
		});

		let finalReport: string;
		let finalizerError: string | null = null;
		let finalizerRuntimeContext: import("./types.js").TeamRoleRuntimeContext | null = null;
		const finalizerStarted = new Date();
		try {
			const finalizerOut = await runWithTimeout("finalizer", this.phaseTimeouts.finalizerMs, signal, async (localSignal) => {
				return this.roleRunner.runFinalizer({ runId: state.runId, plan, taskResults, runSummary: state.summary, signal: localSignal });
			});
			finalReport = finalizerOut.finalReport;
			finalizerRuntimeContext = finalizerOut.runtimeContext ?? null;
		} catch (error) {
			finalizerError = error instanceof Error ? error.message : String(error);
			finalReport = generateFallbackReport(plan, state, error);
		}
		const finalizerFinished = new Date();
		await writeTimingSpan(this.dataDir, {
			runId: state.runId, taskId: null, attemptId: null, phase: "finalizer",
			startedAt: finalizerStarted.toISOString(), finishedAt: finalizerFinished.toISOString(),
			durationMs: finalizerFinished.getTime() - finalizerStarted.getTime(),
		});

		// Re-read state after finalizer returns — external cancel may have landed
		const freshState = (await this.workspace.getState(staleState.runId))!;
		if (this.shouldStop(freshState)) return;

		await this.workspace.writeFinalReport(freshState.runId, finalReport);

		freshState.currentTaskId = null;
		freshState.finalizerRuntimeContext = finalizerRuntimeContext;
		const hasTaskFailures = taskResults.some(r => r.status === "failed" || r.status === "cancelled");
		if (finalizerError) {
			freshState.status = "completed_with_failures";
			freshState.lastError = finalizerError;
		} else {
			freshState.status = hasTaskFailures ? "completed_with_failures" : "completed";
		}
		freshState.activeElapsedMs = this.accumulateElapsed(freshState);
		freshState.finishedAt = now();
		freshState.lease = null;
		freshState.updatedAt = now();
		clearSuccessfulForceRerunDispositions(freshState);
		await this.workspace.saveState(freshState);
	}

	private isTimedOut(state: TeamRunState): boolean {
		const elapsed = this.accumulateElapsed(state);
		const limitMs = state.maxRunDurationMinutes != null
			? state.maxRunDurationMinutes * 60 * 1000
			: this.maxRunDurationMs;
		return elapsed >= limitMs;
	}

	private async handleTimeout(state: TeamRunState, plan: import("./types.js").TeamPlan): Promise<void> {
		for (const [tid, ts] of Object.entries(state.taskStates)) {
			if (ts.status === "running" || ts.status === "pending") {
				ts.status = "failed";
				ts.errorSummary = "run timeout";
				ts.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
				}
		}
		state.status = "failed";
		state.lastError = "run timeout";
		state.activeElapsedMs = this.accumulateElapsed(state);
		state.finishedAt = now();
		state.lease = null;
		state.updatedAt = now();
		await this.finishUnfinishedActiveAttempts(state, "run timeout");
		state.summary = computeTeamRunSummary(state.taskStates);
		clearSuccessfulForceRerunDispositions(state);
		await this.workspace.saveState(state);
	}

	private async failRun(runId: string, error: unknown): Promise<TeamRunState> {
		const state = await this.workspace.getState(runId);
		if (!state) {
			throw error instanceof Error ? error : new Error("run failed");
		}
		const message = error instanceof Error ? error.message : String(error);
		if (state.status === "completed" || state.status === "completed_with_failures" || state.status === "failed" || state.status === "cancelled") {
			return state;
		}
		for (const taskState of Object.values(state.taskStates)) {
			if (taskState.status === "pending" || taskState.status === "running" || taskState.status === "interrupted") {
				taskState.status = "failed";
				taskState.errorSummary = taskState.errorSummary ?? message;
				taskState.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
			}
		}
		state.summary = computeTeamRunSummary(state.taskStates);
			state.status = state.summary.succeededTasks > 0 ? "completed_with_failures" : "failed";
		state.lastError = message;
		state.activeElapsedMs = this.accumulateElapsed(state);
		state.finishedAt = now();
		state.lease = null;
		state.updatedAt = now();
		await this.finishUnfinishedActiveAttempts(state, message);
		clearSuccessfulForceRerunDispositions(state);
		await this.workspace.saveState(state);
		return state;
	}

	private async finishUnfinishedActiveAttempts(state: TeamRunState, errorSummary: string): Promise<void> {
		for (const [taskId, taskState] of Object.entries(state.taskStates)) {
			const attemptId = taskState.activeAttemptId;
			if (!attemptId) continue;
			const attempts = await this.workspace.listAttempts(state.runId, taskId);
			const attempt = attempts.find(a => a.attemptId === attemptId);
			if (!attempt || attempt.finishedAt) continue;
			await this.workspace.finishAttempt(state.runId, taskId, attemptId, {
				status: "failed",
				phase: "failed",
				errorSummary,
			});
		}
	}

	private async loadDiscoveryResult(runId: string, task: TeamTask, results: Record<string, { outputKey: string; items: Array<Record<string, unknown>> }>): Promise<void> {
		if (!task.discovery) return;
		const outputKey = task.discovery.outputKey;
		const decomposition = await this.workspace.readDecomposition(runId, task.id);
		if (decomposition?.decision === "split") {
			// Prefer existing parent standard result (resume/reclaim path)
			const state = await this.workspace.getState(runId);
			const parentTs = state?.taskStates[task.id];
			const existingAttemptId = parentTs?.activeAttemptId;
			if (existingAttemptId) {
				const existingResult = await this.workspace.readDiscoveryResult(runId, task.id, existingAttemptId);
				if (existingResult && existingResult.outputKey === outputKey) {
					results[task.id] = { outputKey, items: existingResult.items };
					return;
				}
			}

			// Aggregate child outputs
			const aggregated = await this.loadDecomposedDiscoveryResult(runId, task, decomposition.children.map(child => child.task));
			if (!aggregated) {
				return;
			}

			// Create parent aggregation attempt and persist standard result
			await this.writeAggregatedDiscoveryResult(runId, task, aggregated, `decompositions/${task.id}.json`);
			results[task.id] = { outputKey, items: aggregated };
			return;
		}

		const state = await this.workspace.getState(runId);
		if (!state) return;
		const ts = state.taskStates[task.id];
		if (!ts?.activeAttemptId) return;
		const attemptId = ts.activeAttemptId;

		// Prefer standardized discovery-result.json
		const standardResult = await this.workspace.readDiscoveryResult(runId, task.id, attemptId);
		if (standardResult && standardResult.outputKey === outputKey) {
			results[task.id] = { outputKey, items: standardResult.items };
			return;
		}

		// Fallback to legacy parsing for old runs/attempts
		const items = await this.readDiscoveryItemsFromAttempt(runId, task.id, attemptId, outputKey);
		if (items) {
			results[task.id] = { outputKey, items };
		}
	}

	private async loadDecomposedDiscoveryResult(runId: string, parentTask: TeamTask, childTasks: TeamTask[]): Promise<Array<Record<string, unknown>> | null> {
		if (!parentTask.discovery) return null;
		const items: Array<Record<string, unknown>> = [];
		for (const child of childTasks) {
			const state = await this.workspace.getState(runId);
			const attemptId = state?.taskStates[child.id]?.activeAttemptId;
			const childItems = attemptId
				? await this.readDiscoveryItemsFromAttempt(
					runId,
					child.id,
					attemptId,
					parentTask.discovery.outputKey,
					{ allowDirectArray: true, strictItems: true },
				)
				: null;
			if (!childItems) {
				await this.failDecomposedDiscoveryAggregation(runId, parentTask.id, child.id);
				return null;
			}
			if (!this.hasStableDiscoveryItemIds(childItems)) {
				await this.failDecomposedDiscoveryAggregation(runId, parentTask.id, child.id);
				return null;
			}
			items.push(...childItems);
		}
		return items;
	}

	private async readDiscoveryItemsFromAttempt(
		runId: string,
		taskId: string,
		attemptId: string,
		outputKey: string,
		options: { allowDirectArray?: boolean; strictItems?: boolean } = {},
	): Promise<Array<Record<string, unknown>> | null> {
		for (const fileName of ["accepted-result.md", "worker-output-001.md"]) {
			const content = await this.workspace.readAttemptFile(runId, taskId, attemptId, fileName);
			if (!content) continue;
			const items = this.extractDiscoveryItems(content, outputKey, options);
			if (items) return items;
			const referencedItems = await this.readDiscoveryItemsFromReferencedFiles(runId, attemptId, content, outputKey, options);
			if (referencedItems) return referencedItems;
		}
		return null;
	}

	private async readDiscoveryItemsFromReferencedFiles(
		runId: string,
		attemptId: string,
		content: string,
		outputKey: string,
		options: { allowDirectArray?: boolean; strictItems?: boolean } = {},
	): Promise<Array<Record<string, unknown>> | null> {
		for (const ref of this.extractRunScopedRefs(runId, content)) {
			const roleMatch = ref.match(/^(worker|checker|watcher)\/(.+)$/);
			const workerRelativeMatch = ref.match(/^(output|work)\/(.+)$/);
			const referencedContent = roleMatch
				? (await this.workspace.readAttemptRoleWorkspaceFile(runId, attemptId, roleMatch[1] as "worker" | "checker" | "watcher", roleMatch[2]!))?.content ?? null
				: workerRelativeMatch
					? (await this.workspace.readAttemptRoleWorkspaceFile(runId, attemptId, "worker", ref))?.content ?? null
					: await this.workspace.readRunScopedFile(runId, ref);
			if (!referencedContent) continue;
			const items = this.extractDiscoveryItems(referencedContent, outputKey, options);
			if (items) return items;
		}
		return null;
	}

	private extractRunScopedRefs(runId: string, content: string): string[] {
		const refs: string[] = [];
		const seen = new Set<string>();
		const add = (ref: string) => {
		const clean = ref.trim().replace(/^["'`]+|["'`,.;:，。；：（）)]+$/g, "");
			if (!clean || seen.has(clean)) return;
			seen.add(clean);
			refs.push(clean);
		};
		const absolutePattern = new RegExp(`/app/\\.data/team/runs/${runId}/[^\\s\\])"'` + "`" + `，。；：]+`, "g");
		for (const match of content.matchAll(absolutePattern)) add(match[0]!);
		const relativePattern = new RegExp(`runs/${runId}/[^\\s\\])"'` + "`" + `，。；：]+`, "g");
		for (const match of content.matchAll(relativePattern)) add(match[0]!);
		const rolePattern = /(?:^|[\s（(：:])((?:worker|checker|watcher|output|work)\/[^\s（）\])"'`，。；：]+)/g;
		for (const match of content.matchAll(rolePattern)) add(match[1]!);
		return refs;
	}

	private async failDecomposedDiscoveryAggregation(runId: string, parentTaskId: string, childTaskId: string): Promise<void> {
		const state = await this.workspace.getState(runId);
		if (!state || this.shouldStop(state)) return;
		const ts = state.taskStates[parentTaskId];
		if (!ts) return;
		ts.status = "failed";
		ts.errorSummary = `failed to aggregate decomposed discovery output from child ${childTaskId}`;
		ts.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
		state.updatedAt = now();
		state.summary = computeTeamRunSummary(state.taskStates);
		await this.workspace.saveState(state);
	}

	private extractDiscoveryItems(
		content: string,
		outputKey: string,
		options: { allowDirectArray?: boolean; strictItems?: boolean } = {},
	): Array<Record<string, unknown>> | null {
		const parsed = this.extractJsonFromContent(content);
		if (parsed == null) return null;
		const arr = options.allowDirectArray && Array.isArray(parsed)
			? parsed
			: typeof parsed === "object" && !Array.isArray(parsed)
				? (parsed as Record<string, unknown>)[outputKey]
				: null;
		if (!Array.isArray(arr)) return null;
		if (options.strictItems && arr.some(item => typeof item !== "object" || item === null || Array.isArray(item))) {
			return null;
		}
		return arr.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item));
	}

	private extractJsonFromContent(content: string): unknown | null {
		try { return JSON.parse(content); } catch { /* not pure JSON */ }
		const fenceMatch = content.match(/```json\s*([\s\S]*?)```/);
		if (fenceMatch) {
			try { return JSON.parse(fenceMatch[1]!); } catch { /* fenced parse failed */ }
		}
		const braceStart = content.indexOf("{");
		const braceEnd = content.lastIndexOf("}");
		if (braceStart !== -1 && braceEnd > braceStart) {
			try { return JSON.parse(content.slice(braceStart, braceEnd + 1)); } catch { /* brace extract failed */ }
		}
		const bracketStart = content.indexOf("[");
		const bracketEnd = content.lastIndexOf("]");
		if (bracketStart !== -1 && bracketEnd > bracketStart) {
			try { return JSON.parse(content.slice(bracketStart, bracketEnd + 1)); } catch { /* bracket extract failed */ }
		}
		return null;
	}

	private async writeAggregatedDiscoveryResult(runId: string, parentTask: TeamTask, items: Array<Record<string, unknown>>, sourceRef: string): Promise<void> {
		if (!parentTask.discovery) return;
		const outputKey = parentTask.discovery.outputKey;

		// Create parent aggregation attempt
		const { attemptId } = await this.workspace.createAttempt(runId, parentTask.id);

		const record: TeamDiscoveryResultRecord = {
			schemaVersion: "team/discovery-result-1",
			taskId: parentTask.id,
			attemptId,
			outputKey,
			items,
			sourceRef,
			createdAt: now(),
		};
		await this.workspace.writeDiscoveryResult(runId, parentTask.id, attemptId, record);

		// Finish the attempt as succeeded (no worker/checker/watcher)
		await this.workspace.finishAttempt(runId, parentTask.id, attemptId, {
			status: "succeeded",
			phase: "succeeded",
			resultRef: `tasks/${parentTask.id}/attempts/${attemptId}/discovery-result.json`,
		});

		// Update parent task state
		const state = (await this.workspace.getState(runId))!;
		const ts = state.taskStates[parentTask.id];
		if (ts) {
			ts.activeAttemptId = attemptId;
			ts.attemptCount = (ts.attemptCount ?? 0) + 1;
			ts.resultRef = `tasks/${parentTask.id}/attempts/${attemptId}/discovery-result.json`;
		}
		state.updatedAt = now();
		state.summary = computeTeamRunSummary(state.taskStates);
		await this.workspace.saveState(state);
	}

	private async writeStandardDiscoveryResult(runId: string, task: TeamTask, attemptId: string): Promise<boolean> {
		if (!task.discovery) return false;
		const outputKey = task.discovery.outputKey;
		const validation = await validateTeamOutput({
			workspace: this.workspace,
			runId,
			task,
			attemptId,
		});
		if (!validation.ok) return false;
		const items = await this.readDiscoveryItemsFromAttempt(runId, task.id, attemptId, outputKey, { strictItems: true });
		if (!items) return false;
		if (!this.hasStableDiscoveryItemIds(items)) return false;
		const state = await this.workspace.getState(runId);
		const resultRef = state?.taskStates[task.id]?.resultRef ?? null;
		const record: TeamDiscoveryResultRecord = {
			schemaVersion: "team/discovery-result-1",
			taskId: task.id,
			attemptId,
			outputKey,
			items,
			sourceRef: validation.sourceRef ?? resultRef,
			createdAt: now(),
		};
		await this.workspace.writeDiscoveryResult(runId, task.id, attemptId, record);
		return true;
	}

	private hasStableDiscoveryItemIds(items: Array<Record<string, unknown>>): boolean {
		return items.every(item => typeof item.id === "string" && item.id.trim().length > 0);
	}

		private async executeForEachTask(
			state: TeamRunState,
			task: TeamTask,
			plan: TeamPlan,
			discoveryResults: Record<string, { outputKey: string; items: Array<Record<string, unknown>> }>,
			signal: AbortSignal,
		): Promise<void> {
			if (!task.forEach) return;

			const existing = await this.workspace.readExpansion(state.runId, task.id);
			let childTasks: TeamTask[];

			if (existing) {
				childTasks = existing.children.map(c => {
					if (c.task) {
						const t = c.task;
						return {
							...t,
							generated: t.generated ?? true,
							sourceItemId: t.sourceItemId ?? c.sourceItemId,
							sourceItem: t.sourceItem ?? c.sourceItem,
						};
					}
					return {
						id: c.taskId,
						type: "normal" as const,
						title: c.title,
						input: { text: c.title },
						acceptance: { rules: ["output is valid"] },
						parentTaskId: task.id,
						sourceItemId: c.sourceItemId,
						sourceItem: c.sourceItem,
						generated: true,
					};
				});
			} else {
				const items = this.resolveDiscoveryItems(task.forEach.itemsFrom, discoveryResults);
				if (items === null) {
					const s = (await this.workspace.getState(state.runId))!;
					s.taskStates[task.id]!.status = "failed";
					s.taskStates[task.id]!.errorSummary = `failed to resolve discovery items from '${task.forEach.itemsFrom}'`;
					s.taskStates[task.id]!.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
					s.updatedAt = now();
					s.summary = computeTeamRunSummary(s.taskStates);
					await this.workspace.saveState(s);
					return;
				}

				const planner = this.taskExpansionPlanner;
				const result = await planner.expand({
					runId: state.runId,
					planId: plan.planId,
					parentTask: task,
					items,
				});
				childTasks = result.children;

				await this.workspace.writeExpansion(state.runId, {
					schemaVersion: "team/task-expansion-1",
					parentTaskId: task.id,
					itemsFrom: task.forEach.itemsFrom,
					expandedAt: now(),
					children: childTasks.map(c => ({
						taskId: c.id,
						sourceItemId: c.sourceItemId ?? "",
						sourceItem: c.sourceItem,
						title: c.title,
						task: c,
					})),
				});
				await this.workspace.appendChildTaskStates(state.runId, childTasks);
			}

			state = (await this.workspace.getState(state.runId))!;
			state.currentTaskId = task.id;
			state.taskStates[task.id]!.status = "running";
			state.taskStates[task.id]!.progress = { phase: "worker_running", message: `expanding ${childTasks.length} child tasks`, updatedAt: now() };
			state.updatedAt = now();
			state.summary = computeTeamRunSummary(state.taskStates);
			await this.workspace.saveState(state);

			if (childTasks.length === 0) {
				state = (await this.workspace.getState(state.runId))!;
				state.taskStates[task.id]!.status = "succeeded";
				state.taskStates[task.id]!.progress = { phase: "succeeded", message: "no items to expand", updatedAt: now() };
					state.updatedAt = now();
				state.summary = computeTeamRunSummary(state.taskStates);
				await this.workspace.saveState(state);
				return;
			}

			if ((task.forEach.mode ?? "sequential") === "parallel") {
				await this.executeChildrenParallel(state.runId, task, childTasks, plan, signal);
				return;
			}

			for (const child of childTasks) {
				state = (await this.workspace.getState(state.runId))!;
				if (state.status !== "running" || this.shouldStop(state)) break;
				if (TERMINAL_TASK_STATUSES.has(state.taskStates[child.id]?.status ?? "pending")) continue;
				if (signal.aborted) break;
				if (this.isTimedOut(state)) {
					await this.handleTimeout(state, plan);
					return;
				}
				await this.executeMaybeDecomposedTask(state, child, plan, signal);
			}

			state = (await this.workspace.getState(state.runId))!;
			if (state.status !== "running" || this.shouldStop(state)) return;
			const allDone = childTasks.every(c => {
				const cs = state.taskStates[c.id];
				return cs && TERMINAL_TASK_STATUSES.has(cs.status);
			});
			if (!allDone) return;
			const anyFailed = childTasks.some(c => state.taskStates[c.id]?.status === "failed");
			if (anyFailed) {
				state.taskStates[task.id]!.status = "failed";
				state.taskStates[task.id]!.errorSummary = "one or more child tasks failed";
				state.taskStates[task.id]!.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
				} else {
				const allSkipped = childTasks.every(c => state.taskStates[c.id]?.status === "skipped");
				if (allSkipped) {
					state.taskStates[task.id]!.status = "skipped";
					state.taskStates[task.id]!.errorSummary = null;
					state.taskStates[task.id]!.progress = { phase: "skipped", message: progressMessages.skipped, updatedAt: now() };
						} else {
					state.taskStates[task.id]!.status = "succeeded";
					state.taskStates[task.id]!.errorSummary = null;
					state.taskStates[task.id]!.progress = { phase: "succeeded", message: progressMessages.succeeded, updatedAt: now() };
						}
			}
			state.updatedAt = now();
			state.summary = computeTeamRunSummary(state.taskStates);
			await this.workspace.saveState(state);
		}

		private async executeChildrenParallel(
			runId: string,
			parentTask: TeamTask,
			childTasks: TeamTask[],
			plan: TeamPlan,
			signal: AbortSignal,
		): Promise<void> {
			let state = (await this.workspace.getState(runId))!;
			const queue: TeamTask[] = [];
			for (const child of childTasks) {
				const cs = state.taskStates[child.id];
				if (!cs || !TERMINAL_TASK_STATUSES.has(cs.status)) {
					queue.push(child);
				}
			}

			if (queue.length > 0) {
				// Override saveState to use patchState for concurrent safety
				const origSave = this.workspace.saveState.bind(this.workspace);
				const ws = this.workspace;
				this.workspace.saveState = async function(s: TeamRunState) {
					const taskId = parallelTaskId.getStore();
					if (taskId) {
						await ws.patchState(s.runId, (latest) => {
							if (latest.status !== "running") return;
							const latestTask = latest.taskStates[taskId];
							if (latestTask && (TERMINAL_TASK_STATUSES.has(latestTask.status) || latestTask.status === "interrupted")) {
								return;
							}
							latest.taskStates[taskId] = s.taskStates[taskId]!;
							latest.summary = computeTeamRunSummary(latest.taskStates);
						});
					} else {
						await origSave(s);
					}
				};

				try {
					const active = new Set<Promise<void>>();
					let nextIdx = 0;

					const startChild = async (child: TeamTask): Promise<void> => {
						let needsTimeout = false;
						await parallelTaskId.run(child.id, async () => {
							try {
								const current = await ws.getState(runId);
								if (!current || current.status !== "running" || this.shouldStop(current) || signal.aborted) return;
								if (this.isTimedOut(current)) {
									needsTimeout = true;
									return;
								}
								const cs = current.taskStates[child.id];
								if (cs && TERMINAL_TASK_STATUSES.has(cs.status)) return;
								await this.executeMaybeDecomposedTask(current, child, plan, signal);
							} catch (err) {
								// Mark child as failed; if state write fails, error propagates
								const msg = err instanceof Error ? err.message : String(err);
								await ws.patchState(runId, (latest) => {
									if (latest.status !== "running") return;
									const childState = latest.taskStates[child.id];
									if (childState && !TERMINAL_TASK_STATUSES.has(childState.status)) {
										childState.status = "failed";
										childState.errorSummary = `unexpected error: ${msg}`;
										childState.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
									}
									latest.summary = computeTeamRunSummary(latest.taskStates);
								});
							}
						});
						// Handle timeout outside parallelTaskId scope so run-level writes are not narrowed
						if (needsTimeout) {
							await this.handleTimeout((await ws.getState(runId))!, plan);
						}
					};

					const launch = (child: TeamTask) => {
						const p = startChild(child).finally(() => { active.delete(p); });
						active.add(p);
					};

					while (nextIdx < queue.length && active.size < PARALLEL_FOR_EACH_CONCURRENCY) {
						const current = await ws.getState(runId);
						if (!current || current.status !== "running" || this.shouldStop(current) || signal.aborted) break;
						if (this.isTimedOut(current)) {
							await this.handleTimeout(current, plan);
							break;
						}
						launch(queue[nextIdx]!);
						nextIdx++;
					}

					let fatalError: unknown = null;

					while (active.size > 0 && !fatalError) {
						try {
							await Promise.race(active);
						} catch (err) {
							fatalError = err;
							break;
						}
						while (nextIdx < queue.length && active.size < PARALLEL_FOR_EACH_CONCURRENCY) {
							const current = await ws.getState(runId);
							if (!current || current.status !== "running" || this.shouldStop(current) || signal.aborted) break;
							if (this.isTimedOut(current)) {
								await this.handleTimeout(current, plan);
								break;
							}
							launch(queue[nextIdx]!);
							nextIdx++;
						}
					}

					// Drain any remaining active children before restoring saveState
					if (active.size > 0) {
						await Promise.allSettled(Array.from(active));
					}

					// If a fatal error occurred, rethrow after drain so failRun handles it
					if (fatalError) {
						throw fatalError;
					}
				} finally {
					// Always restore original saveState, even if pool execution throws
					this.workspace.saveState = origSave;
				}
			}

			// Apply parent summary using patchState
			await this.workspace.patchState(runId, (s) => {
				if (s.status !== "running" || this.shouldStop(s)) return;
				const allDone = childTasks.every(c => {
					const cs = s.taskStates[c.id];
					return cs && TERMINAL_TASK_STATUSES.has(cs.status);
				});
				if (!allDone) return;
				const anySucceeded = childTasks.some(c => s.taskStates[c.id]?.status === "succeeded");
				const allSkipped = childTasks.every(c => s.taskStates[c.id]?.status === "skipped");
				const ts = s.taskStates[parentTask.id]!;
				if (anySucceeded) {
					ts.status = "succeeded";
					ts.errorSummary = null;
					ts.progress = { phase: "succeeded", message: progressMessages.succeeded, updatedAt: now() };
				} else if (allSkipped) {
					ts.status = "skipped";
					ts.errorSummary = null;
					ts.progress = { phase: "skipped", message: progressMessages.skipped, updatedAt: now() };
				} else {
					ts.status = "failed";
					ts.errorSummary = "one or more child tasks failed";
					ts.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
				}
				s.summary = computeTeamRunSummary(s.taskStates);
			});
		}
		private async skipGeneratedChildren(state: TeamRunState, task: TeamTask): Promise<void> {
			const childTaskIds: string[] = [];

			const expansion = await this.workspace.readExpansion(state.runId, task.id);
			if (expansion) {
				for (const child of expansion.children) {
					childTaskIds.push(child.taskId);
				}
			}

			const decomposition = await this.workspace.readDecomposition(state.runId, task.id);
			if (decomposition) {
				for (const child of decomposition.children) {
					childTaskIds.push(child.taskId);
				}
			}

			if (childTaskIds.length === 0) return;

			for (const childId of childTaskIds) {
				const cs = state.taskStates[childId];
				if (cs) {
					cs.status = "skipped";
					cs.progress = { phase: "skipped", message: progressMessages.skipped, updatedAt: now() };
					cs.errorSummary = null;
				}
			}

			state.summary = computeTeamRunSummary(state.taskStates);
			state.updatedAt = now();
			await this.workspace.saveState(state);
		}


		private async executeExpandedChildren(
			state: TeamRunState,
			task: TeamTask,
			plan: TeamPlan,
			signal: AbortSignal,
		): Promise<void> {
			const existing = await this.workspace.readExpansion(state.runId, task.id);
			if (!existing) return;
			const childTasks: TeamTask[] = existing.children.map(c => {
				if (c.task) {
					const t = c.task;
					return {
						...t,
						generated: t.generated ?? true,
						sourceItemId: t.sourceItemId ?? c.sourceItemId,
						sourceItem: t.sourceItem ?? c.sourceItem,
					};
				}
				return {
					id: c.taskId,
					type: "normal" as const,
					title: c.title,
					input: { text: c.title },
					acceptance: { rules: ["output is valid"] },
					parentTaskId: task.id,
					sourceItemId: c.sourceItemId,
					sourceItem: c.sourceItem,
					generated: true,
				};
			});
			if ((task.forEach?.mode ?? "sequential") === "parallel") {
				await this.executeChildrenParallel(state.runId, task, childTasks, plan, signal);
				return;
			}
			for (const child of childTasks) {
				state = (await this.workspace.getState(state.runId))!;
				if (state.status !== "running" || this.shouldStop(state)) break;
				if (TERMINAL_TASK_STATUSES.has(state.taskStates[child.id]?.status ?? "pending")) continue;
				if (signal.aborted) break;
				await this.executeMaybeDecomposedTask(state, child, plan, signal);
			}
			state = (await this.workspace.getState(state.runId))!;
			if (state.status !== "running" || this.shouldStop(state)) return;
			const allDone = childTasks.every(c => {
				const cs = state.taskStates[c.id];
				return cs && TERMINAL_TASK_STATUSES.has(cs.status);
			});
			if (!allDone) return;
			const anyFailed = childTasks.some(c => state.taskStates[c.id]?.status === "failed");
			const ts = state.taskStates[task.id]!;
			if (TERMINAL_TASK_STATUSES.has(ts.status)) return;
			if (anyFailed) {
				ts.status = "failed";
				ts.errorSummary = "one or more child tasks failed";
				ts.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
				} else {
				const allSkipped = childTasks.every(c => state.taskStates[c.id]?.status === "skipped");
				if (allSkipped) {
					ts.status = "skipped";
					ts.errorSummary = null;
					ts.progress = { phase: "skipped", message: progressMessages.skipped, updatedAt: now() };
						} else {
					ts.status = "succeeded";
					ts.errorSummary = null;
					ts.progress = { phase: "succeeded", message: progressMessages.succeeded, updatedAt: now() };
						}
			}
			state.updatedAt = now();
			state.summary = computeTeamRunSummary(state.taskStates);
			await this.workspace.saveState(state);
		}

		private resolveDiscoveryItems(
			itemsFrom: string,
			discoveryResults: Record<string, { outputKey: string; items: Array<Record<string, unknown>> }>,
		): Array<Record<string, unknown>> | null {
			const parts = itemsFrom.split(".");
			if (parts.length < 2) return null;
			const taskId = parts[0]!;
			const requestedOutputKey = parts[1]!;
			const entry = discoveryResults[taskId];
			if (!entry) return null;
			if (entry.outputKey !== requestedOutputKey) return null;
			return entry.items;
		}

		private shouldStop(state: TeamRunState | null | undefined): boolean {
		if (!state) return true;
		if (isRunExternallyStopped(state.status)) return true;
		if (this.leaseOwnerId && state.lease?.ownerId !== this.leaseOwnerId) return true;
		return false;
	}

	private accumulateElapsed(state: TeamRunState): number {
		if (!state.startedAt) return this.elapsedOffset;
		const started = new Date(state.startedAt).getTime();
		const current = Date.now();
		return this.elapsedOffset + (current - started);
	}
}
