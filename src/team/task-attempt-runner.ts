import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { TeamOutputValidationResult, TeamRunState, TeamTask } from "./types.js";
import type { TeamRoleRunner, CheckerOutput, WatcherOutput, WorkerOutput } from "./role-runner.js";
import type { RunWorkspace } from "./run-workspace.js";
import { computeTeamRunSummary } from "./team-summary.js";
import { progressMessages } from "./progress.js";
import { writeTimingSpan } from "./timing.js";
import { validateTeamOutput } from "./output-validator.js";
import type { TeamOutputWorkspaceReader } from "./output-validator.js";
import type { TeamStateWriter } from "./child-execution.js";

export interface TaskAttemptPhaseTimeouts {
	workerMs: number;
	checkerMs: number;
	watcherMs: number;
}

export type AdaptivePhaseTimeoutType = "idle" | "hard_cap";

export interface AdaptivePhaseTimeoutInput {
	phase: string;
	idleMs: number;
	hardCapMs: number;
	parentSignal: AbortSignal;
	activityDirs?: string[];
	pollMs?: number;
}

export type StructuralActivityMarker = (reason: string) => void;

export class AdaptivePhaseTimeoutError extends Error {
	readonly timeoutType: AdaptivePhaseTimeoutType;
	readonly phase: string;
	readonly idleMs: number;
	readonly hardCapMs: number;
	readonly startedAt: string;
	readonly elapsedMs: number;
	readonly lastStructuralActivityAt: string;
	readonly lastStructuralActivityReason: string;

	constructor(input: {
		phase: string;
		timeoutType: AdaptivePhaseTimeoutType;
		idleMs: number;
		hardCapMs: number;
		startedAtMs: number;
		elapsedMs: number;
		lastStructuralActivityAtMs: number;
		lastStructuralActivityReason: string;
	}) {
		super(`${input.phase} timeout`);
		this.name = "AdaptivePhaseTimeoutError";
		this.phase = input.phase;
		this.timeoutType = input.timeoutType;
		this.idleMs = input.idleMs;
		this.hardCapMs = input.hardCapMs;
		this.startedAt = new Date(input.startedAtMs).toISOString();
		this.elapsedMs = input.elapsedMs;
		this.lastStructuralActivityAt = new Date(input.lastStructuralActivityAtMs).toISOString();
		this.lastStructuralActivityReason = input.lastStructuralActivityReason;
	}
}

export function isAdaptivePhaseTimeoutError(error: unknown): error is AdaptivePhaseTimeoutError {
	return error instanceof AdaptivePhaseTimeoutError;
}

interface WorkUnitRunResult {
	status: "passed" | "failed";
	outputValidation: TeamOutputValidationResult;
}

export type TaskAttemptLifecycleWorkspace = TeamOutputWorkspaceReader & Pick<RunWorkspace,
	| "getState"
	| "createAttempt"
	| "finishAttempt"
	| "listAttempts"
	| "patchState"
	| "saveState"
	| "updateAttemptPhase"
	| "writeFailedResult"
	| "writeWorkerOutput"
	| "recordAttemptWorkerOutput"
	| "writeCheckerVerdict"
	| "writeCheckerOutput"
	| "recordAttemptCheckerResult"
	| "writeAcceptedResult"
	| "writeWatcherReview"
	| "recordAttemptWatcherResult"
>;

export interface TaskAttemptLifecycleRunnerOptions {
	workspace: TaskAttemptLifecycleWorkspace;
	roleRunner: TeamRoleRunner;
	dataDir: string;
	maxCheckerRevisions: number;
	maxWatcherRevisions: number;
	phaseTimeouts: TaskAttemptPhaseTimeouts;
	shouldStop: (state: TeamRunState | null | undefined) => boolean;
	standardizeDiscoveryResult: (runId: string, task: TeamTask, attemptId: string) => Promise<boolean>;
}

export interface RunTaskAttemptLifecycleInput {
	state: TeamRunState;
	task: TeamTask;
	signal: AbortSignal;
	writer: TeamStateWriter;
}

const now = () => new Date().toISOString();

function noOutputValidation(): TeamOutputValidationResult {
	return { ok: true, kind: "none", sourceRef: null, checks: [{ name: "no_output_check", ok: true }], normalizedRef: null };
}

function summarizeOutputValidationFailure(result: TeamOutputValidationResult): string {
	const failed = result.checks.find(check => !check.ok && check.name !== "json_parse")
		?? result.checks.find(check => !check.ok);
	const detail = failed?.message ?? failed?.name ?? "unknown validation failure";
	return `output validation failed: ${detail}`;
}

export async function runWithTimeout<T>(
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

export async function runWithAdaptivePhaseTimeout<T>(
	input: AdaptivePhaseTimeoutInput,
	fn: (signal: AbortSignal, markStructuralActivity: StructuralActivityMarker) => Promise<T>,
): Promise<T> {
	const idleMs = Math.max(1, Math.floor(input.idleMs));
	const hardCapMs = Math.max(idleMs, Math.floor(input.hardCapMs));
	const startedAtMs = Date.now();
	let lastStructuralActivityAtMs = startedAtMs;
	let lastStructuralActivityReason = "phase started";
	const controller = new AbortController();
	let interval: ReturnType<typeof setInterval> | null = null;
	let removeParentListener = (): void => {};
	let timeoutReject: ((error: Error) => void) | null = null;
	let settled = false;
	let polling = false;
	const activityDirs = [...new Set(input.activityDirs ?? [])];
	let directorySignatures = await collectDirectorySignatures(activityDirs);

	const markStructuralActivity: StructuralActivityMarker = (reason) => {
		lastStructuralActivityAtMs = Date.now();
		lastStructuralActivityReason = reason.trim() || "structural activity";
	};

	function rejectWith(error: Error): void {
		if (settled) return;
		settled = true;
		controller.abort(error);
		timeoutReject?.(error);
	}

	function rejectWithTimeout(timeoutType: AdaptivePhaseTimeoutType): void {
		const nowMs = Date.now();
		rejectWith(new AdaptivePhaseTimeoutError({
			phase: input.phase,
			timeoutType,
			idleMs,
			hardCapMs,
			startedAtMs,
			elapsedMs: nowMs - startedAtMs,
			lastStructuralActivityAtMs,
			lastStructuralActivityReason,
		}));
	}

	async function pollStructuralFiles(): Promise<void> {
		if (activityDirs.length === 0 || polling) return;
		polling = true;
		try {
			const nextSignatures = await collectDirectorySignatures(activityDirs);
			for (const [filePath, signature] of nextSignatures) {
				if (directorySignatures.get(filePath) !== signature) {
					markStructuralActivity(`artifact file changed ${filePath}`);
					break;
				}
			}
			directorySignatures = nextSignatures;
		} finally {
			polling = false;
		}
	}

	function checkTimeouts(): void {
		if (settled || controller.signal.aborted) return;
		const nowMs = Date.now();
		if (nowMs - startedAtMs >= hardCapMs) {
			rejectWithTimeout("hard_cap");
			return;
		}
		if (nowMs - lastStructuralActivityAtMs >= idleMs) {
			rejectWithTimeout("idle");
		}
	}

	if (input.parentSignal.aborted) {
		throw input.parentSignal.reason instanceof Error ? input.parentSignal.reason : new Error("aborted");
	}
	const onParentAbort = () => {
		const reason = input.parentSignal.reason instanceof Error ? input.parentSignal.reason : new Error("aborted");
		rejectWith(reason);
	};
	input.parentSignal.addEventListener("abort", onParentAbort, { once: true });
	removeParentListener = () => input.parentSignal.removeEventListener("abort", onParentAbort);

	const pollMs = input.pollMs ?? Math.max(5, Math.min(1_000, Math.floor(idleMs / 4)));
	const timeoutPromise = new Promise<never>((_resolve, reject) => {
		timeoutReject = reject;
		interval = setInterval(() => {
			if (activityDirs.length === 0) {
				checkTimeouts();
				return;
			}
			void pollStructuralFiles().finally(checkTimeouts);
		}, pollMs);
	});

	try {
		const result = await Promise.race([fn(controller.signal, markStructuralActivity), timeoutPromise]);
		settled = true;
		return result;
	} finally {
		settled = true;
		removeParentListener();
		if (interval) clearInterval(interval);
	}
}

async function collectDirectorySignatures(dirs: string[]): Promise<Map<string, string>> {
	const signatures = new Map<string, string>();
	for (const dir of dirs) {
		await collectDirectorySignature(dir, dir, signatures);
	}
	return signatures;
}

async function collectDirectorySignature(rootDir: string, currentDir: string, signatures: Map<string, string>): Promise<void> {
	let entries: Dirent<string>[];
	try {
		entries = await readdir(currentDir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const filePath = join(currentDir, entry.name);
		if (entry.isDirectory()) {
			await collectDirectorySignature(rootDir, filePath, signatures);
			continue;
		}
		if (!entry.isFile()) continue;
		try {
			const fileStat = await stat(filePath);
			const relativePath = filePath.slice(rootDir.length + 1).replace(/\\/g, "/");
			signatures.set(relativePath || entry.name, `${fileStat.size}:${fileStat.mtimeMs}`);
		} catch {
			// File changed between readdir and stat; the next poll will observe it.
		}
	}
}

export class TaskAttemptLifecycleRunner {
	constructor(private readonly options: TaskAttemptLifecycleRunnerOptions) {}

	async runTask(input: RunTaskAttemptLifecycleInput): Promise<void> {
		const { workspace, shouldStop, maxWatcherRevisions, standardizeDiscoveryResult } = this.options;
		const { task, signal, writer } = input;
		let state = input.state;
		state.currentTaskId = task.id;
		state.taskStates[task.id]!.status = "running";
		state.taskStates[task.id]!.progress = { phase: "worker_running", message: progressMessages.worker_running, updatedAt: now() };
		state.updatedAt = now();
		state.summary = computeTeamRunSummary(state.taskStates);
		await writer.saveState(state);

		let attemptCount = state.taskStates[task.id]!.attemptCount;
		let watcherRevisions = 0;
		let taskDone = false;

		while (!taskDone && watcherRevisions <= maxWatcherRevisions) {
			attemptCount++;
			state = (await workspace.getState(state.runId))!;
			if (shouldStop(state)) return;
			state.taskStates[task.id]!.attemptCount = attemptCount;
			const { attemptId, attemptRoot } = await workspace.createAttempt(state.runId, task.id);
			state.taskStates[task.id]!.activeAttemptId = attemptId;
			state.summary = computeTeamRunSummary(state.taskStates);
			state = (await this.saveCurrentTaskState(state, task.id, writer)) ?? state;
			if (shouldStop(state)) {
				await this.finishAttemptForStoppedRun(state, task.id, attemptId);
				return;
			}

			const workUnitResult = await this.runWorkUnit(state, task, attemptId, attemptRoot, signal, writer);

			state = (await workspace.getState(state.runId))!;
			const currentTs = state.taskStates[task.id]!;

			if (currentTs.status === "interrupted" || currentTs.status === "cancelled") return;
			if (shouldStop(state)) return;

			const watcherResult = await this.runWatcherPhase(state, task, attemptId, workUnitResult, signal, writer);

			state = (await workspace.getState(state.runId))!;
			if (shouldStop(state)) return;
			const ts = state.taskStates[task.id]!;

			if (watcherResult.decision === "accept_task") {
				if (workUnitResult.status === "passed") {
					if (task.type === "discovery" && task.discovery) {
						const standardized = await standardizeDiscoveryResult(state.runId, task, attemptId);
						const valErr = `discovery result validation failed: expected outputKey '${task.discovery.outputKey}' to be an array with stable item ids`;
						if (!standardized) {
							await workspace.finishAttempt(state.runId, task.id, attemptId, { status: "failed", phase: "failed", errorSummary: valErr });
							ts.status = "failed";
							ts.errorSummary = valErr;
							ts.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
							taskDone = true;
							state.updatedAt = now();
							state.summary = computeTeamRunSummary(state.taskStates);
							await writer.saveState(state);
							return;
						}
					}
					await workspace.finishAttempt(state.runId, task.id, attemptId, { status: "succeeded", phase: "succeeded", resultRef: ts.resultRef });
					ts.status = "succeeded";
					ts.progress = { phase: "succeeded", message: progressMessages.succeeded, updatedAt: now() };
				} else {
					await workspace.finishAttempt(state.runId, task.id, attemptId, { status: "failed", phase: "failed", errorSummary: "watcher accepted failed work unit" });
					ts.status = "failed";
					ts.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
				}
				taskDone = true;
			} else if (watcherResult.decision === "confirm_failed") {
				const attList = await workspace.listAttempts(state.runId, task.id);
				const att = attList.find(a => a.attemptId === attemptId);
				if (!att?.finishedAt) {
					await workspace.finishAttempt(state.runId, task.id, attemptId, { status: "failed", phase: "failed", errorSummary: "watcher confirmed failed" });
				}
				ts.status = "failed";
				ts.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
				taskDone = true;
			} else if (watcherResult.decision === "request_revision") {
				watcherRevisions++;
				if (watcherRevisions > maxWatcherRevisions) {
					const attListW = await workspace.listAttempts(state.runId, task.id);
					const attW = attListW.find(a => a.attemptId === attemptId);
					if (!attW?.finishedAt) {
						await workspace.finishAttempt(state.runId, task.id, attemptId, { status: "failed", phase: "failed", errorSummary: "exceeded max watcher revisions" });
					}
					ts.status = "failed";
					ts.errorSummary = "exceeded max watcher revisions";
					ts.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
					taskDone = true;
				} else {
					await workspace.finishAttempt(state.runId, task.id, attemptId, { status: "interrupted", phase: "watcher_revision_requested", errorSummary: "watcher requested revision" });
				}
			}

			state.updatedAt = now();
			state.summary = computeTeamRunSummary(state.taskStates);
			await writer.saveState(state);
		}
	}

	private async saveCurrentTaskState(state: TeamRunState, taskId: string, writer: TeamStateWriter): Promise<TeamRunState | null> {
		const { workspace, shouldStop } = this.options;
		if (writer !== workspace) {
			await writer.saveState(state);
			return workspace.getState(state.runId);
		}
		return workspace.patchState(state.runId, (latest) => {
			if (shouldStop(latest)) return;
			const taskState = state.taskStates[taskId];
			if (!taskState) return;
			latest.currentTaskId = state.currentTaskId;
			latest.taskStates[taskId] = taskState;
			latest.summary = computeTeamRunSummary(latest.taskStates);
			latest.updatedAt = state.updatedAt;
		});
	}

	private async finishAttemptForStoppedRun(state: TeamRunState, taskId: string, attemptId: string): Promise<void> {
		const { workspace } = this.options;
		const taskStatus = state.taskStates[taskId]?.status;
		if (state.status === "cancelled" || taskStatus === "cancelled") {
			await workspace.finishAttempt(state.runId, taskId, attemptId, {
				status: "cancelled",
				phase: "cancelled",
				errorSummary: "run cancelled",
			}).catch(() => {});
			return;
		}
		if (state.status === "paused" || taskStatus === "interrupted") {
			await workspace.finishAttempt(state.runId, taskId, attemptId, {
				status: "interrupted",
				phase: "interrupted",
				errorSummary: "run paused",
			}).catch(() => {});
		}
	}

	private async runWorkUnit(state: TeamRunState, task: TeamTask, attemptId: string, attemptRoot: string, signal: AbortSignal, writer: TeamStateWriter): Promise<WorkUnitRunResult> {
		const { workspace, roleRunner, phaseTimeouts, maxCheckerRevisions, dataDir, shouldStop } = this.options;
		const runId = state.runId;
		let checkerRevision = 0;
		let lastFeedback: string | undefined;

		while (true) {
			const freshState = await workspace.getState(runId);
			if (!freshState || freshState.status !== "running" || shouldStop(freshState)) return { status: "failed", outputValidation: noOutputValidation() };

			await workspace.updateAttemptPhase(runId, task.id, attemptId, "worker_running");

			const workerStarted = new Date();
			let workerOut: WorkerOutput;
			try {
				workerOut = await runWithTimeout("worker", phaseTimeouts.workerMs, signal, async (localSignal) => {
					return roleRunner.runWorker({
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
				await writeTimingSpan(dataDir, {
					runId, taskId: task.id, attemptId, phase: "worker",
					startedAt: workerStarted.toISOString(), finishedAt: workerFinished.toISOString(),
					durationMs: workerFinished.getTime() - workerStarted.getTime(),
				});
				if (error instanceof Error && error.message === "worker timeout") {
					const s = (await workspace.getState(runId))!;
					if (shouldStop(s)) return { status: "failed", outputValidation: noOutputValidation() };
					const failRef = await workspace.writeFailedResult(runId, task.id, attemptId, "worker timeout");
					await workspace.finishAttempt(runId, task.id, attemptId, { status: "failed", phase: "failed", resultRef: failRef, errorSummary: "worker timeout" });
					s.taskStates[task.id]!.resultRef = failRef;
					s.taskStates[task.id]!.errorSummary = "worker timeout";
					await writer.saveState(s);
					return { status: "failed", outputValidation: noOutputValidation() };
				}
				throw error;
			}

			if (shouldStop((await workspace.getState(runId)))) return { status: "failed", outputValidation: noOutputValidation() };

			const workerOutputIdx = checkerRevision + 1;
			const workerRef = await workspace.writeWorkerOutput(runId, task.id, attemptId, workerOutputIdx, workerOut.content);
			await workspace.recordAttemptWorkerOutput(runId, task.id, attemptId, {
				outputRef: workerRef,
				outputIndex: workerOutputIdx,
				runtimeContext: workerOut.runtimeContext,
			});
			await workspace.updateAttemptPhase(runId, task.id, attemptId, "worker_completed");
			const workerValidation = await validateTeamOutput({
				workspace,
				runId,
				task,
				attemptId,
				contents: [{ ref: workerRef, content: workerOut.content }],
			});

			const workerFinished = new Date();
			await writeTimingSpan(dataDir, {
				runId, taskId: task.id, attemptId, phase: "worker",
				startedAt: workerStarted.toISOString(), finishedAt: workerFinished.toISOString(),
				durationMs: workerFinished.getTime() - workerStarted.getTime(),
			});

			await workspace.updateAttemptPhase(runId, task.id, attemptId, "checker_reviewing");

			const checkingState = await workspace.getState(runId);
			if (checkingState && !shouldStop(checkingState)) {
				checkingState.taskStates[task.id]!.progress = { phase: "checker_reviewing", message: progressMessages.checker_reviewing, updatedAt: now() };
				checkingState.updatedAt = now();
				await writer.saveState(checkingState);
			}

			const checkerStarted = new Date();
			let checkerOut: CheckerOutput;
			try {
				checkerOut = await runWithTimeout("checker", phaseTimeouts.checkerMs, signal, async (localSignal) => {
					return roleRunner.runChecker({
						runId, task, attemptId,
						workerOutputRef: workerRef,
						acceptanceRules: task.acceptance.rules,
						outputValidation: workerValidation,
						signal: localSignal,
					});
				});
			} catch (error) {
				const checkerFinished = new Date();
				await writeTimingSpan(dataDir, {
					runId, taskId: task.id, attemptId, phase: "checker",
					startedAt: checkerStarted.toISOString(), finishedAt: checkerFinished.toISOString(),
					durationMs: checkerFinished.getTime() - checkerStarted.getTime(),
				});
				if (error instanceof Error && error.message === "checker timeout") {
					const s = (await workspace.getState(runId))!;
					if (shouldStop(s)) return { status: "failed", outputValidation: workerValidation };
					const failRef = await workspace.writeFailedResult(runId, task.id, attemptId, "checker timeout");
					await workspace.finishAttempt(runId, task.id, attemptId, { status: "failed", phase: "failed", resultRef: failRef, errorSummary: "checker timeout" });
					s.taskStates[task.id]!.resultRef = failRef;
					s.taskStates[task.id]!.errorSummary = "checker timeout";
					await writer.saveState(s);
					return { status: "failed", outputValidation: workerValidation };
				}
				throw error;
			}

			if (shouldStop((await workspace.getState(runId)))) return { status: "failed", outputValidation: workerValidation };

			const checkerIdx = checkerRevision + 1;
			await workspace.writeCheckerVerdict(runId, task.id, attemptId, checkerIdx, checkerOut);
			let checkerFeedbackRef: string | null = null;
			if (checkerOut.feedback) {
				checkerFeedbackRef = await workspace.writeCheckerOutput(runId, task.id, attemptId, checkerIdx, checkerOut.feedback);
			}
			await workspace.recordAttemptCheckerResult(runId, task.id, attemptId, {
				verdict: checkerOut.verdict,
				reason: checkerOut.reason,
				feedback: checkerOut.feedback,
				revisionIndex: checkerIdx,
				recordRef: `tasks/${task.id}/attempts/${attemptId}/checker-verdict-${String(checkerIdx).padStart(3, "0")}.json`,
				feedbackRef: checkerFeedbackRef,
				runtimeContext: checkerOut.runtimeContext,
			});

			const checkerFinished = new Date();
			await writeTimingSpan(dataDir, {
				runId, taskId: task.id, attemptId, phase: "checker",
				startedAt: checkerStarted.toISOString(), finishedAt: checkerFinished.toISOString(),
				durationMs: checkerFinished.getTime() - checkerStarted.getTime(),
			});

			if (checkerOut.verdict === "pass") {
				const resultContent = checkerOut.resultContent ?? workerOut.content;
				const s = (await workspace.getState(runId))!;
				if (shouldStop(s)) return { status: "failed", outputValidation: workerValidation };
				const acceptedValidation = await validateTeamOutput({
					workspace,
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
					const failRef = await workspace.writeFailedResult(runId, task.id, attemptId, errorSummary);
					s.taskStates[task.id]!.resultRef = failRef;
					s.taskStates[task.id]!.errorSummary = errorSummary;
					await writer.saveState(s);
					return { status: "failed", outputValidation: acceptedValidation };
				}
				const resultRef = await workspace.writeAcceptedResult(runId, task.id, attemptId, resultContent);
				await workspace.updateAttemptPhase(runId, task.id, attemptId, "checker_passed");
				s.taskStates[task.id]!.resultRef = resultRef;
				await writer.saveState(s);
				return { status: "passed", outputValidation: acceptedValidation };
			}

			if (checkerOut.verdict === "fail") {
				const failContent = checkerOut.resultContent ?? checkerOut.reason;
				const s = (await workspace.getState(runId))!;
				if (shouldStop(s)) return { status: "failed", outputValidation: workerValidation };
				const failRef = await workspace.writeFailedResult(runId, task.id, attemptId, failContent);
				await workspace.finishAttempt(runId, task.id, attemptId, { status: "failed", phase: "failed", resultRef: failRef, errorSummary: checkerOut.reason });
				s.taskStates[task.id]!.resultRef = failRef;
				s.taskStates[task.id]!.errorSummary = checkerOut.reason;
				await writer.saveState(s);
				return { status: "failed", outputValidation: workerValidation };
			}

			await workspace.updateAttemptPhase(runId, task.id, attemptId, "checker_revising");
			checkerRevision++;
			lastFeedback = checkerOut.feedback;
			if (checkerRevision >= maxCheckerRevisions) {
				const s = (await workspace.getState(runId))!;
				if (shouldStop(s)) return { status: "failed", outputValidation: workerValidation };
				const failRef = await workspace.writeFailedResult(runId, task.id, attemptId, `checker revision limit (${maxCheckerRevisions}) exceeded`);
				await workspace.finishAttempt(runId, task.id, attemptId, { status: "failed", phase: "failed", resultRef: failRef, errorSummary: "checker revision limit exceeded" });
				s.taskStates[task.id]!.resultRef = failRef;
				s.taskStates[task.id]!.errorSummary = "checker revision limit exceeded";
				await writer.saveState(s);
				return { status: "failed", outputValidation: workerValidation };
			}
		}
	}

	private async runWatcherPhase(state: TeamRunState, task: TeamTask, attemptId: string, workUnitResult: WorkUnitRunResult, signal: AbortSignal, writer: TeamStateWriter): Promise<WatcherOutput> {
		const { workspace, roleRunner, phaseTimeouts, dataDir, shouldStop } = this.options;
		const preAttempts = await workspace.listAttempts(state.runId, task.id);
		const preAttempt = preAttempts.find(a => a.attemptId === attemptId);
		if (preAttempt && !preAttempt.finishedAt) {
			await workspace.updateAttemptPhase(state.runId, task.id, attemptId, "watcher_reviewing");
		}

		const current = await workspace.getState(state.runId);
		if (current && !shouldStop(current)) {
			current.taskStates[task.id]!.progress = { phase: "watcher_reviewing", message: progressMessages.watcher_reviewing, updatedAt: now() };
			current.updatedAt = now();
			await writer.saveState(current);
		}
		const ts = state.taskStates[task.id];

		const watcherStarted = new Date();
		let watcherOut: WatcherOutput;
		try {
			watcherOut = await runWithTimeout("watcher", phaseTimeouts.watcherMs, signal, async (localSignal) => {
				return roleRunner.runWatcher({
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
			await writeTimingSpan(dataDir, {
				runId: state.runId, taskId: task.id, attemptId, phase: "watcher",
				startedAt: watcherStarted.toISOString(), finishedAt: watcherFinished.toISOString(),
				durationMs: watcherFinished.getTime() - watcherStarted.getTime(),
			});
			if (error instanceof Error && error.message === "watcher timeout") {
				watcherOut = { decision: "confirm_failed", reason: "watcher timeout" };
				await workspace.writeWatcherReview(state.runId, task.id, attemptId, watcherOut);
				await workspace.recordAttemptWatcherResult(state.runId, task.id, attemptId, {
					decision: "confirm_failed", reason: "watcher timeout",
					recordRef: `tasks/${task.id}/attempts/${attemptId}/watcher-review.json`,
					runtimeContext: watcherOut.runtimeContext,
				});
				return watcherOut;
			}
			throw error;
		}

		await workspace.writeWatcherReview(state.runId, task.id, attemptId, watcherOut);
		await workspace.recordAttemptWatcherResult(state.runId, task.id, attemptId, {
			decision: watcherOut.decision,
			reason: watcherOut.reason,
			revisionMode: watcherOut.revisionMode,
			feedback: watcherOut.feedback,
			recordRef: `tasks/${task.id}/attempts/${attemptId}/watcher-review.json`,
			runtimeContext: watcherOut.runtimeContext,
		});

		const watcherFinished = new Date();
		await writeTimingSpan(dataDir, {
			runId: state.runId, taskId: task.id, attemptId, phase: "watcher",
			startedAt: watcherStarted.toISOString(), finishedAt: watcherFinished.toISOString(),
			durationMs: watcherFinished.getTime() - watcherStarted.getTime(),
		});

		return watcherOut;
	}
}
