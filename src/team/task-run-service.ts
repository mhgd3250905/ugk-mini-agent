import { join } from "node:path";
import { TaskStore } from "./task-store.js";
import { RunWorkspace } from "./run-workspace.js";
import { computeTeamRunSummary } from "./team-summary.js";
import { progressMessages } from "./progress.js";
import { runWithTimeout } from "./task-attempt-runner.js";
import { validateTeamOutput } from "./output-validator.js";
import { writeTimingSpan } from "./timing.js";
import { TeamRoleProcessRecorder } from "./task-run-process-recorder.js";
import type { ProfileAwareTeamRoleRunner, TeamRoleRunner, WorkerOutput, CheckerOutput } from "./role-runner.js";
import type { TeamCanvasTask, TeamOutputValidationResult, TeamPlan, TeamRunState, TeamTask } from "./types.js";

export interface CanvasTaskRunServiceOptions {
	taskStore: TaskStore;
	workspace: RunWorkspace;
	createRoleRunner: () => TeamRoleRunner;
	dataDir: string;
	maxCheckerRevisions?: number;
	phaseTimeouts?: {
		workerMs: number;
		checkerMs: number;
	};
	maxConcurrentRuns?: number;
	maxRunDurationMinutes?: number;
}

const now = () => new Date().toISOString();
const ACTIVE_RUN_STATUSES = new Set(["queued", "running", "paused"]);
const TERMINAL_RUN_STATUSES = new Set(["completed", "completed_with_failures", "failed", "cancelled"]);

const DEFAULT_TASK_RUN_TIMEOUTS = {
	workerMs: 900_000,
	checkerMs: 300_000,
};

function canvasTaskToTeamTask(task: TeamCanvasTask): TeamTask {
	return {
		id: task.taskId,
		type: "normal",
		title: task.workUnit.title || task.title,
		input: { text: task.workUnit.input.text },
		acceptance: { rules: task.workUnit.acceptance.rules },
	};
}

function canvasTaskToPlan(task: TeamCanvasTask): TeamPlan {
	const teamTask = canvasTaskToTeamTask(task);
	const timestamp = now();
	return {
		schemaVersion: "team/plan-1",
		planId: `canvas_task_${task.taskId}`,
		title: task.title,
		defaultTeamUnitId: `canvas_task_unit_${task.taskId}`,
		goal: { text: task.workUnit.input.text },
		tasks: [teamTask],
		outputContract: { text: task.workUnit.outputContract.text },
		archived: false,
		createdAt: timestamp,
		updatedAt: timestamp,
		runCount: 0,
	};
}

function summarizeOutputValidationFailure(result: TeamOutputValidationResult): string {
	const failed = result.checks.find(check => !check.ok && check.name !== "json_parse")
		?? result.checks.find(check => !check.ok);
	return `output validation failed: ${failed?.message ?? failed?.name ?? "unknown validation failure"}`;
}

function isAbortLike(error: unknown): boolean {
	return error instanceof Error && /abort|cancel/i.test(error.message);
}

export class CanvasTaskRunService {
	private readonly activeControllers = new Map<string, AbortController>();
	private readonly activeRoleRecorders = new Map<string, Set<TeamRoleProcessRecorder>>();
	private readonly maxCheckerRevisions: number;
	private readonly phaseTimeouts: { workerMs: number; checkerMs: number };

	constructor(private readonly options: CanvasTaskRunServiceOptions) {
		this.maxCheckerRevisions = Math.max(1, Math.floor(options.maxCheckerRevisions ?? 3));
		this.phaseTimeouts = options.phaseTimeouts ?? DEFAULT_TASK_RUN_TIMEOUTS;
	}

	async createRun(taskId: string, runOptions: { maxRunDurationMinutes?: number } = {}): Promise<TeamRunState> {
		const task = await this.options.taskStore.get(taskId);
		if (!task) throw new Error(`task not found: ${taskId}`);
		if (task.archived || task.status === "archived") throw new Error("archived task cannot be run");
		if (task.status !== "ready") throw new Error("task must be ready before run");

		const activeRun = (await this.listRuns(taskId)).find(run => ACTIVE_RUN_STATUSES.has(run.status));
		if (activeRun) throw new Error(`active task run already exists: ${activeRun.runId}`);

		const plan = canvasTaskToPlan(task);
		const createOptions = runOptions.maxRunDurationMinutes != null
			? { maxRunDurationMinutes: runOptions.maxRunDurationMinutes }
			: this.options.maxRunDurationMinutes != null
				? { maxRunDurationMinutes: this.options.maxRunDurationMinutes }
				: undefined;
		const state = this.options.maxConcurrentRuns
			? await this.options.workspace.createRunWithAdmission(plan, plan.defaultTeamUnitId, this.options.maxConcurrentRuns, createOptions)
			: await this.options.workspace.createRun(plan, plan.defaultTeamUnitId, createOptions);
		state.source = { type: "canvas-task", taskId: task.taskId };
		await this.options.workspace.saveState(state);

		this.startBackgroundRun(state.runId);
		return state;
	}

	async listRuns(taskId?: string): Promise<TeamRunState[]> {
		const states = await this.options.workspace.listStates();
		return taskId ? states.filter(state => state.source?.type === "canvas-task" && state.source.taskId === taskId) : states;
	}

	async getRun(runId: string): Promise<TeamRunState | null> {
		const state = await this.options.workspace.getState(runId);
		return state?.source?.type === "canvas-task" ? state : null;
	}

	async cancelRun(runId: string, reason = "user cancel"): Promise<TeamRunState> {
		const state = await this.getRun(runId);
		if (!state) throw new Error(`run not found: ${runId}`);
		if (TERMINAL_RUN_STATUSES.has(state.status)) throw new Error(`cannot cancel terminal run: ${state.status}`);

		const timestamp = now();
		state.status = "cancelled";
		state.finishedAt = timestamp;
		state.currentTaskId = null;
		state.lastError = reason;
		state.activeElapsedMs = this.accumulateElapsed(state);
		state.lease = null;
		await this.cancelActiveRoleProcesses(runId, reason);
		for (const [taskId, taskState] of Object.entries(state.taskStates)) {
			if (taskState.status === "pending" || taskState.status === "running" || taskState.status === "interrupted") {
				taskState.status = "cancelled";
				taskState.progress = { phase: "cancelled", message: progressMessages.cancelled, updatedAt: timestamp };
			}
			if (taskState.activeAttemptId) {
				await this.options.workspace.finishAttempt(runId, taskId, taskState.activeAttemptId, {
					status: "cancelled",
					phase: "cancelled",
					errorSummary: "run cancelled",
				}).catch(() => {});
			}
		}
		state.summary = computeTeamRunSummary(state.taskStates);
		state.updatedAt = timestamp;
		await this.options.workspace.saveState(state);

		this.activeControllers.get(runId)?.abort(new Error(reason));
		this.activeControllers.delete(runId);
		return state;
	}

	private startBackgroundRun(runId: string): void {
		const controller = new AbortController();
		this.activeControllers.set(runId, controller);
		void this.runToCompletion(runId, controller.signal)
			.catch(() => {})
			.finally(() => {
				this.activeControllers.delete(runId);
			});
	}

	private async runToCompletion(runId: string, signal: AbortSignal): Promise<void> {
		const initialState = await this.getRun(runId);
		if (!initialState) return;
		const taskId = initialState.source?.taskId;
		if (!taskId) return;
		const canvasTask = await this.options.taskStore.get(taskId);
		if (!canvasTask || canvasTask.archived) {
			await this.failRun(runId, "task no longer exists or has been archived");
			return;
		}

		const task = canvasTaskToTeamTask(canvasTask);
		const roleRunner = this.options.createRoleRunner();
		if ("setProfileIds" in roleRunner && typeof (roleRunner as ProfileAwareTeamRoleRunner).setProfileIds === "function") {
			(roleRunner as ProfileAwareTeamRoleRunner).setProfileIds({
				workerProfileId: canvasTask.workUnit.workerAgentId,
				checkerProfileId: canvasTask.workUnit.checkerAgentId,
				watcherProfileId: canvasTask.workUnit.checkerAgentId,
				finalizerProfileId: canvasTask.workUnit.checkerAgentId,
				decomposerProfileId: canvasTask.workUnit.workerAgentId,
			});
		}

		try {
			let state = await this.transitionToRunning(runId, task.id);
			const { attemptId, attemptRoot } = await this.options.workspace.createAttempt(runId, task.id);
			state = await this.options.workspace.patchState(runId, (latest) => {
				const taskState = latest.taskStates[task.id];
				if (!taskState) return;
				taskState.attemptCount += 1;
				taskState.activeAttemptId = attemptId;
				latest.summary = computeTeamRunSummary(latest.taskStates);
			});

			await this.runWorkerCheckerLoop(state, task, attemptId, attemptRoot, roleRunner, signal, canvasTask);
		} catch (error) {
			const current = await this.getRun(runId);
			if (current && current.status === "cancelled") return;
			await this.failRun(runId, isAbortLike(error) ? "run cancelled" : error instanceof Error ? error.message : String(error));
		}
	}

	private async transitionToRunning(runId: string, taskId: string): Promise<TeamRunState> {
		const timestamp = now();
		return this.options.workspace.patchState(runId, (state) => {
			if (state.status !== "queued") return;
			state.status = "running";
			state.startedAt = state.startedAt ?? timestamp;
			state.currentTaskId = taskId;
			const taskState = state.taskStates[taskId];
			if (taskState) {
				taskState.status = "running";
				taskState.progress = { phase: "worker_running", message: progressMessages.worker_running, updatedAt: timestamp };
			}
			state.summary = computeTeamRunSummary(state.taskStates);
			state.updatedAt = timestamp;
		});
	}

	private async runWorkerCheckerLoop(
		state: TeamRunState,
		task: TeamTask,
		attemptId: string,
		attemptRoot: string,
		roleRunner: TeamRoleRunner,
		signal: AbortSignal,
		canvasTask: TeamCanvasTask,
	): Promise<void> {
		let feedback: string | undefined;
		for (let revisionIndex = 1; revisionIndex <= this.maxCheckerRevisions; revisionIndex++) {
			this.throwIfAborted(signal);
			const workerOut = await this.runWorker(state.runId, task, attemptId, attemptRoot, revisionIndex, feedback, roleRunner, signal, canvasTask.workUnit.workerAgentId);
			this.throwIfAborted(signal);
			const workerRef = await this.options.workspace.writeWorkerOutput(state.runId, task.id, attemptId, revisionIndex, workerOut.content);
			await this.options.workspace.recordAttemptWorkerOutput(state.runId, task.id, attemptId, {
				outputRef: workerRef,
				outputIndex: revisionIndex,
				runtimeContext: workerOut.runtimeContext,
			});
			await this.options.workspace.updateAttemptPhase(state.runId, task.id, attemptId, "worker_completed");

			const workerValidation = await validateTeamOutput({
				workspace: this.options.workspace,
				runId: state.runId,
				task,
				attemptId,
				contents: [{ ref: workerRef, content: workerOut.content }],
			});

			await this.markTaskProgress(state.runId, task.id, "checker_reviewing", progressMessages.checker_reviewing);
			const checkerOut = await this.runChecker(state.runId, task, attemptId, workerRef, workerValidation, roleRunner, signal, canvasTask.workUnit.checkerAgentId);
			this.throwIfAborted(signal);
			await this.recordCheckerResult(state.runId, task.id, attemptId, revisionIndex, checkerOut);

			if (checkerOut.verdict === "pass") {
				const resultContent = checkerOut.resultContent ?? workerOut.content;
				const acceptedValidation = await validateTeamOutput({
					workspace: this.options.workspace,
					runId: state.runId,
					task,
					attemptId,
					contents: [
						{ ref: "checker.resultContent", content: resultContent },
						{ ref: workerRef, content: workerOut.content },
					],
				});
				if (!acceptedValidation.ok) {
					await this.finishTaskFailed(state.runId, task.id, attemptId, summarizeOutputValidationFailure(acceptedValidation));
					return;
				}
				const resultRef = await this.options.workspace.writeAcceptedResult(state.runId, task.id, attemptId, resultContent);
				await this.options.workspace.updateAttemptPhase(state.runId, task.id, attemptId, "checker_passed");
				await this.finishTaskSucceeded(state.runId, task.id, attemptId, resultRef);
				return;
			}

			if (checkerOut.verdict === "fail") {
				const failRef = await this.options.workspace.writeFailedResult(state.runId, task.id, attemptId, checkerOut.resultContent ?? checkerOut.reason);
				await this.finishTaskFailed(state.runId, task.id, attemptId, checkerOut.reason, failRef);
				return;
			}

			await this.options.workspace.updateAttemptPhase(state.runId, task.id, attemptId, "checker_revising");
			feedback = checkerOut.feedback;
			if (revisionIndex >= this.maxCheckerRevisions) {
				const failRef = await this.options.workspace.writeFailedResult(state.runId, task.id, attemptId, `checker revision limit (${this.maxCheckerRevisions}) exceeded`);
				await this.finishTaskFailed(state.runId, task.id, attemptId, "checker revision limit exceeded", failRef);
				return;
			}
			await this.markTaskProgress(state.runId, task.id, "worker_revising", progressMessages.worker_revising);
		}
	}

	private async runWorker(
		runId: string,
		task: TeamTask,
		attemptId: string,
		attemptRoot: string,
		outputIndex: number,
		feedback: string | undefined,
		roleRunner: TeamRoleRunner,
		signal: AbortSignal,
		profileId: string,
	): Promise<WorkerOutput> {
		await this.options.workspace.updateAttemptPhase(runId, task.id, attemptId, "worker_running");
		const started = new Date();
		const recorder = this.createRoleProcessRecorder(runId, task.id, attemptId, "worker", profileId);
		try {
			await recorder.start();
			const output = await runWithTimeout("worker", this.phaseTimeouts.workerMs, signal, async (localSignal) => roleRunner.runWorker({
				runId,
				task,
				attemptId,
				workDir: join(attemptRoot, "work"),
				outputDir: join(attemptRoot, "output"),
				acceptanceRules: task.acceptance.rules,
				feedback,
				signal: localSignal,
				onSessionEvent: (event) => recorder.handleRawEvent(event),
			}));
			await recorder.succeed();
			return output;
		} catch (error) {
			if (isAbortLike(error)) {
				await recorder.cancel("run cancelled");
			} else {
				await recorder.fail(error instanceof Error ? error.message : String(error));
			}
			throw error;
		} finally {
			await recorder.flush().catch(() => {});
			this.releaseRoleProcessRecorder(runId, recorder);
			const finished = new Date();
			await writeTimingSpan(this.options.dataDir, {
				runId,
				taskId: task.id,
				attemptId,
				phase: `worker_${outputIndex}`,
				startedAt: started.toISOString(),
				finishedAt: finished.toISOString(),
				durationMs: finished.getTime() - started.getTime(),
			});
		}
	}

	private async runChecker(
		runId: string,
		task: TeamTask,
		attemptId: string,
		workerRef: string,
		outputValidation: TeamOutputValidationResult,
		roleRunner: TeamRoleRunner,
		signal: AbortSignal,
		profileId: string,
	): Promise<CheckerOutput> {
		await this.options.workspace.updateAttemptPhase(runId, task.id, attemptId, "checker_reviewing");
		const started = new Date();
		const recorder = this.createRoleProcessRecorder(runId, task.id, attemptId, "checker", profileId);
		try {
			await recorder.start();
			const output = await runWithTimeout("checker", this.phaseTimeouts.checkerMs, signal, async (localSignal) => roleRunner.runChecker({
				runId,
				task,
				attemptId,
				workerOutputRef: workerRef,
				acceptanceRules: task.acceptance.rules,
				outputValidation,
				signal: localSignal,
				onSessionEvent: (event) => recorder.handleRawEvent(event),
			}));
			await recorder.succeed();
			return output;
		} catch (error) {
			if (isAbortLike(error)) {
				await recorder.cancel("run cancelled");
			} else {
				await recorder.fail(error instanceof Error ? error.message : String(error));
			}
			throw error;
		} finally {
			await recorder.flush().catch(() => {});
			this.releaseRoleProcessRecorder(runId, recorder);
			const finished = new Date();
			await writeTimingSpan(this.options.dataDir, {
				runId,
				taskId: task.id,
				attemptId,
				phase: "checker",
				startedAt: started.toISOString(),
				finishedAt: finished.toISOString(),
				durationMs: finished.getTime() - started.getTime(),
			});
		}
	}

	private async recordCheckerResult(runId: string, taskId: string, attemptId: string, revisionIndex: number, checkerOut: CheckerOutput): Promise<void> {
		const recordRef = await this.options.workspace.writeCheckerVerdict(runId, taskId, attemptId, revisionIndex, checkerOut);
		let feedbackRef: string | null = null;
		if (checkerOut.feedback) {
			feedbackRef = await this.options.workspace.writeCheckerOutput(runId, taskId, attemptId, revisionIndex, checkerOut.feedback);
		}
		await this.options.workspace.recordAttemptCheckerResult(runId, taskId, attemptId, {
			verdict: checkerOut.verdict,
			reason: checkerOut.reason,
			feedback: checkerOut.feedback,
			resultContentRef: null,
			revisionIndex,
			recordRef,
			feedbackRef,
			runtimeContext: checkerOut.runtimeContext,
		});
	}

	private async markTaskProgress(runId: string, taskId: string, phase: "checker_reviewing" | "worker_revising", message: string): Promise<void> {
		const timestamp = now();
		await this.options.workspace.patchState(runId, (state) => {
			const taskState = state.taskStates[taskId];
			if (!taskState || state.status !== "running") return;
			taskState.progress = { phase, message, updatedAt: timestamp };
			state.updatedAt = timestamp;
		});
	}

	private async finishTaskSucceeded(runId: string, taskId: string, attemptId: string, resultRef: string): Promise<void> {
		await this.options.workspace.finishAttempt(runId, taskId, attemptId, { status: "succeeded", phase: "succeeded", resultRef });
		const timestamp = now();
		await this.options.workspace.patchState(runId, (state) => {
			const taskState = state.taskStates[taskId];
			if (taskState) {
				taskState.status = "succeeded";
				taskState.resultRef = resultRef;
				taskState.errorSummary = null;
				taskState.progress = { phase: "succeeded", message: progressMessages.succeeded, updatedAt: timestamp };
			}
			state.status = "completed";
			state.currentTaskId = null;
			state.activeElapsedMs = this.accumulateElapsed(state);
			state.finishedAt = timestamp;
			state.lease = null;
			state.summary = computeTeamRunSummary(state.taskStates);
			state.updatedAt = timestamp;
		});
	}

	private async finishTaskFailed(runId: string, taskId: string, attemptId: string, errorSummary: string, resultRef?: string): Promise<void> {
		const effectiveResultRef = resultRef ?? await this.options.workspace.writeFailedResult(runId, taskId, attemptId, errorSummary);
		await this.options.workspace.finishAttempt(runId, taskId, attemptId, { status: "failed", phase: "failed", resultRef: effectiveResultRef, errorSummary });
		const timestamp = now();
		await this.options.workspace.patchState(runId, (state) => {
			const taskState = state.taskStates[taskId];
			if (taskState) {
				taskState.status = "failed";
				taskState.resultRef = effectiveResultRef;
				taskState.errorSummary = errorSummary;
				taskState.progress = { phase: "failed", message: progressMessages.failed, updatedAt: timestamp };
			}
			state.status = "completed_with_failures";
			state.currentTaskId = null;
			state.lastError = errorSummary;
			state.activeElapsedMs = this.accumulateElapsed(state);
			state.finishedAt = timestamp;
			state.lease = null;
			state.summary = computeTeamRunSummary(state.taskStates);
			state.updatedAt = timestamp;
		});
	}

	private async failRun(runId: string, message: string): Promise<void> {
		const timestamp = now();
		await this.failActiveRoleProcesses(runId, message);
		await this.options.workspace.patchState(runId, async (state) => {
			for (const [taskId, taskState] of Object.entries(state.taskStates)) {
				if (taskState.status === "pending" || taskState.status === "running" || taskState.status === "interrupted") {
					taskState.status = "failed";
					taskState.errorSummary = taskState.errorSummary ?? message;
					taskState.progress = { phase: "failed", message: progressMessages.failed, updatedAt: timestamp };
				}
				if (taskState.activeAttemptId) {
					await this.options.workspace.finishAttempt(runId, taskId, taskState.activeAttemptId, {
						status: "failed",
						phase: "failed",
						errorSummary: message,
					}).catch(() => {});
				}
			}
			state.status = "failed";
			state.currentTaskId = null;
			state.lastError = message;
			state.activeElapsedMs = this.accumulateElapsed(state);
			state.finishedAt = timestamp;
			state.lease = null;
			state.summary = computeTeamRunSummary(state.taskStates);
			state.updatedAt = timestamp;
		});
	}

	private accumulateElapsed(state: TeamRunState): number {
		if (!state.startedAt) return state.activeElapsedMs;
		return Math.max(0, Date.now() - new Date(state.startedAt).getTime());
	}

	private throwIfAborted(signal: AbortSignal): void {
		if (!signal.aborted) return;
		throw signal.reason instanceof Error ? signal.reason : new Error("run cancelled");
	}

	private createRoleProcessRecorder(
		runId: string,
		taskId: string,
		attemptId: string,
		role: "worker" | "checker",
		profileId: string,
	): TeamRoleProcessRecorder {
		const recorder = new TeamRoleProcessRecorder({
			workspace: this.options.workspace,
			runId,
			taskId,
			attemptId,
			role,
			profileId,
		});
		const recorders = this.activeRoleRecorders.get(runId) ?? new Set<TeamRoleProcessRecorder>();
		recorders.add(recorder);
		this.activeRoleRecorders.set(runId, recorders);
		return recorder;
	}

	private releaseRoleProcessRecorder(runId: string, recorder: TeamRoleProcessRecorder): void {
		const recorders = this.activeRoleRecorders.get(runId);
		if (!recorders) return;
		recorders.delete(recorder);
		if (recorders.size === 0) {
			this.activeRoleRecorders.delete(runId);
		}
	}

	private async cancelActiveRoleProcesses(runId: string, reason: string): Promise<void> {
		const recorders = [...(this.activeRoleRecorders.get(runId) ?? [])];
		await Promise.all(recorders.map((recorder) => recorder.cancel(reason).catch(() => {})));
	}

	private async failActiveRoleProcesses(runId: string, message: string): Promise<void> {
		const recorders = [...(this.activeRoleRecorders.get(runId) ?? [])];
		await Promise.all(recorders.map((recorder) => recorder.fail(message).catch(() => {})));
	}
}
