import { join } from "node:path";
import type { TeamRoleRunner, WorkerOutput, CheckerOutput } from "./role-runner.js";
import type { TeamTask, TeamOutputValidationResult } from "./types.js";
import type { RunWorkspace } from "./run-workspace.js";
import { runWithTimeout } from "./task-attempt-runner.js";
import { validateTeamOutput } from "./output-validator.js";
import { writeTimingSpan } from "./timing.js";
import { progressMessages } from "./progress.js";
import { TeamRoleProcessRecorder } from "./task-run-process-recorder.js";

export interface CanvasTaskAttemptRunnerOptions {
	workspace: RunWorkspace;
	dataDir: string;
	maxCheckerRevisions: number;
	phaseTimeouts: { workerMs: number; checkerMs: number };
}

export interface CanvasTaskAttemptInput {
	runId: string;
	task: TeamTask;
	attemptId: string;
	attemptRoot: string;
	roleRunner: TeamRoleRunner;
	signal: AbortSignal;
	workerProfileId: string;
	checkerProfileId: string;
}

export interface CanvasTaskAttemptOutcome {
	status: "succeeded" | "failed";
	resultRef: string | null;
	errorSummary: string | null;
}

function isAbortLike(error: unknown): boolean {
	return error instanceof Error && /abort|cancel/i.test(error.message);
}

function summarizeOutputValidationFailure(result: TeamOutputValidationResult): string {
	const failed = result.checks.find(check => !check.ok && check.name !== "json_parse")
		?? result.checks.find(check => !check.ok);
	return `output validation failed: ${failed?.message ?? failed?.name ?? "unknown validation failure"}`;
}

export class CanvasTaskAttemptRunner {
	private readonly activeRecorders = new Map<string, Set<TeamRoleProcessRecorder>>();
	private readonly maxCheckerRevisions: number;
	private readonly phaseTimeouts: { workerMs: number; checkerMs: number };

	constructor(private readonly options: CanvasTaskAttemptRunnerOptions) {
		this.maxCheckerRevisions = options.maxCheckerRevisions;
		this.phaseTimeouts = options.phaseTimeouts;
	}

	async runAttempt(input: CanvasTaskAttemptInput): Promise<CanvasTaskAttemptOutcome> {
		const { workspace, dataDir } = this.options;
		const { runId, task, attemptId, attemptRoot, roleRunner, signal, workerProfileId, checkerProfileId } = input;

		let feedback: string | undefined;
		for (let revisionIndex = 1; revisionIndex <= this.maxCheckerRevisions; revisionIndex++) {
			this.throwIfAborted(signal);

			const workerOut = await this.runWorker(runId, task, attemptId, attemptRoot, revisionIndex, feedback, roleRunner, signal, workerProfileId);
			this.throwIfAborted(signal);

			const workerRef = await workspace.writeWorkerOutput(runId, task.id, attemptId, revisionIndex, workerOut.content);
			await workspace.recordAttemptWorkerOutput(runId, task.id, attemptId, {
				outputRef: workerRef,
				outputIndex: revisionIndex,
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

			await this.markTaskProgress(runId, task.id, "checker_reviewing", progressMessages.checker_reviewing);
			const checkerOut = await this.runChecker(runId, task, attemptId, workerRef, workerValidation, roleRunner, signal, checkerProfileId);
			this.throwIfAborted(signal);

			await this.recordCheckerResult(runId, task.id, attemptId, revisionIndex, checkerOut);

			if (checkerOut.verdict === "pass") {
				const resultContent = checkerOut.resultContent ?? workerOut.content;
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
					await workspace.finishAttempt(runId, task.id, attemptId, { status: "failed", phase: "failed", resultRef: failRef, errorSummary });
					return { status: "failed", resultRef: failRef, errorSummary };
				}
				const resultRef = await workspace.writeAcceptedResult(runId, task.id, attemptId, resultContent);
				await workspace.updateAttemptPhase(runId, task.id, attemptId, "checker_passed");
				await workspace.finishAttempt(runId, task.id, attemptId, { status: "succeeded", phase: "succeeded", resultRef });
				return { status: "succeeded", resultRef, errorSummary: null };
			}

			if (checkerOut.verdict === "fail") {
				const failContent = checkerOut.resultContent ?? checkerOut.reason;
				const failRef = await workspace.writeFailedResult(runId, task.id, attemptId, failContent);
				await workspace.finishAttempt(runId, task.id, attemptId, { status: "failed", phase: "failed", resultRef: failRef, errorSummary: checkerOut.reason });
				return { status: "failed", resultRef: failRef, errorSummary: checkerOut.reason };
			}

			await workspace.updateAttemptPhase(runId, task.id, attemptId, "checker_revising");
			feedback = checkerOut.feedback;
			if (revisionIndex >= this.maxCheckerRevisions) {
				const failContent = `checker revision limit (${this.maxCheckerRevisions}) exceeded`;
				const errorSummary = "checker revision limit exceeded";
				const failRef = await workspace.writeFailedResult(runId, task.id, attemptId, failContent);
				await workspace.finishAttempt(runId, task.id, attemptId, { status: "failed", phase: "failed", resultRef: failRef, errorSummary });
				return { status: "failed", resultRef: failRef, errorSummary };
			}
			await this.markTaskProgress(runId, task.id, "worker_revising", progressMessages.worker_revising);
		}

		return { status: "failed", resultRef: null, errorSummary: "unexpected loop exit" };
	}

	async cancelActiveProcesses(runId: string, reason: string): Promise<void> {
		const recorders = [...(this.activeRecorders.get(runId) ?? [])];
		await Promise.all(recorders.map(r => r.cancel(reason).catch(() => {})));
	}

	async failActiveProcesses(runId: string, message: string): Promise<void> {
		const recorders = [...(this.activeRecorders.get(runId) ?? [])];
		await Promise.all(recorders.map(r => r.fail(message).catch(() => {})));
	}

	private throwIfAborted(signal: AbortSignal): void {
		if (!signal.aborted) return;
		throw signal.reason instanceof Error ? signal.reason : new Error("run cancelled");
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
		const { workspace, dataDir } = this.options;
		await workspace.updateAttemptPhase(runId, task.id, attemptId, "worker_running");
		const started = new Date();
		const recorder = this.createProcessRecorder(runId, task.id, attemptId, "worker", profileId);
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
			this.releaseProcessRecorder(runId, recorder);
			const finished = new Date();
			await writeTimingSpan(dataDir, {
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
		const { workspace, dataDir } = this.options;
		await workspace.updateAttemptPhase(runId, task.id, attemptId, "checker_reviewing");
		const started = new Date();
		const recorder = this.createProcessRecorder(runId, task.id, attemptId, "checker", profileId);
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
			this.releaseProcessRecorder(runId, recorder);
			const finished = new Date();
			await writeTimingSpan(dataDir, {
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
		const { workspace } = this.options;
		const recordRef = await workspace.writeCheckerVerdict(runId, taskId, attemptId, revisionIndex, checkerOut);
		let feedbackRef: string | null = null;
		if (checkerOut.feedback) {
			feedbackRef = await workspace.writeCheckerOutput(runId, taskId, attemptId, revisionIndex, checkerOut.feedback);
		}
		await workspace.recordAttemptCheckerResult(runId, taskId, attemptId, {
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
		const { workspace } = this.options;
		const timestamp = new Date().toISOString();
		await workspace.patchState(runId, (state) => {
			const taskState = state.taskStates[taskId];
			if (!taskState || state.status !== "running") return;
			taskState.progress = { phase, message, updatedAt: timestamp };
			state.updatedAt = timestamp;
		});
	}

	private createProcessRecorder(
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
		const recorders = this.activeRecorders.get(runId) ?? new Set<TeamRoleProcessRecorder>();
		recorders.add(recorder);
		this.activeRecorders.set(runId, recorders);
		return recorder;
	}

	private releaseProcessRecorder(runId: string, recorder: TeamRoleProcessRecorder): void {
		const recorders = this.activeRecorders.get(runId);
		if (!recorders) return;
		recorders.delete(recorder);
		if (recorders.size === 0) {
			this.activeRecorders.delete(runId);
		}
	}
}
