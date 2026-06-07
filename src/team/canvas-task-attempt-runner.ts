import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import type { TeamRoleRunner, WorkerOutput, CheckerOutput } from "./role-runner.js";
import type { TeamTask, TeamOutputValidationResult } from "./types.js";
import type { RunWorkspace } from "./run-workspace.js";
import {
	AdaptivePhaseTimeoutError,
	isAdaptivePhaseTimeoutError,
	runWithAdaptivePhaseTimeout,
	type StructuralActivityMarker,
} from "./task-attempt-runner.js";
import { validateTeamOutput } from "./output-validator.js";
import { writeTimingSpan } from "./timing.js";
import { progressMessages } from "./progress.js";
import { TeamRoleProcessRecorder } from "./task-run-process-recorder.js";
import { materializeBoundInputFilesForWorkspace } from "./task-bound-input-materialization.js";
import type { RawAgentSessionEventLike } from "../agent/agent-session-factory.js";

export interface CanvasTaskPhaseTimeouts {
	workerMs?: number;
	checkerMs?: number;
	workerIdleMs?: number;
	checkerIdleMs?: number;
	workerHardCapMs?: number;
	checkerHardCapMs?: number;
}

export type CanvasTaskAttemptWorkspace = Pick<RunWorkspace,
	| "writeWorkerOutput"
	| "recordAttemptWorkerOutput"
	| "updateAttemptPhase"
	| "writeFailedResult"
	| "finishAttempt"
	| "writeAcceptedResult"
	| "writeDiscoveryResult"
	| "writeCheckerVerdict"
	| "writeCheckerOutput"
	| "recordAttemptCheckerResult"
	| "patchState"
	| "recordAttemptRoleProcess"
	| "readAttemptFile"
	| "readAttemptRoleWorkspaceFile"
	| "readRunScopedFile"
>;

export interface CanvasTaskAttemptRunnerOptions {
	workspace: CanvasTaskAttemptWorkspace;
	dataDir: string;
	maxCheckerRevisions: number;
	phaseTimeouts: CanvasTaskPhaseTimeouts;
}

export interface CanvasTaskAttemptInput {
	runId: string;
	task: TeamTask;
	attemptId: string;
	attemptRoot: string;
	publicBaseUrl?: string;
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

function buildTeamRoleArtifactBaseUrl(
	publicBaseUrl: string | undefined,
	runId: string,
	roleKey: string,
	role: string,
): string | undefined {
	const normalizedBaseUrl = publicBaseUrl?.trim().replace(/\/+$/, "");
	if (!normalizedBaseUrl) return undefined;
	return `${normalizedBaseUrl}/v1/team/task-runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(roleKey)}/${encodeURIComponent(role)}`;
}

export class CanvasTaskAttemptRunner {
	private readonly activeRecorders = new Map<string, Set<TeamRoleProcessRecorder>>();
	private readonly maxCheckerRevisions: number;
	private readonly phaseTimeouts: CanvasTaskPhaseTimeouts;

	constructor(private readonly options: CanvasTaskAttemptRunnerOptions) {
		this.maxCheckerRevisions = options.maxCheckerRevisions;
		this.phaseTimeouts = options.phaseTimeouts;
	}

	async runAttempt(input: CanvasTaskAttemptInput): Promise<CanvasTaskAttemptOutcome> {
		const { workspace, dataDir } = this.options;
		const { runId, task, attemptId, attemptRoot, publicBaseUrl, roleRunner, signal, workerProfileId, checkerProfileId } = input;

		let feedback: string | undefined;
		for (let revisionIndex = 1; revisionIndex <= this.maxCheckerRevisions; revisionIndex++) {
			this.throwIfAborted(signal);

			const workerOut = await this.runWorker(runId, task, attemptId, attemptRoot, publicBaseUrl, revisionIndex, feedback, roleRunner, signal, workerProfileId);
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
			const checkerOut = await this.runChecker(runId, task, attemptId, workerRef, workerValidation, publicBaseUrl, roleRunner, signal, checkerProfileId);
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
				const discoveryErrorSummary = await this.writeDiscoveryResultIfNeeded(runId, task, attemptId, acceptedValidation, resultRef);
				if (discoveryErrorSummary) {
					const failRef = await workspace.writeFailedResult(runId, task.id, attemptId, discoveryErrorSummary);
					await workspace.finishAttempt(runId, task.id, attemptId, { status: "failed", phase: "failed", resultRef: failRef, errorSummary: discoveryErrorSummary });
					return { status: "failed", resultRef: failRef, errorSummary: discoveryErrorSummary };
				}
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

	private async writeDiscoveryResultIfNeeded(
		runId: string,
		task: TeamTask,
		attemptId: string,
		acceptedValidation: TeamOutputValidationResult,
		acceptedResultRef: string,
	): Promise<string | null> {
		if (task.type !== "discovery") return null;
		const outputKey = task.discovery?.outputKey?.trim();
		if (!outputKey) return "output validation failed: discovery outputKey is required";
		const items = acceptedValidation.items;
		if (!items) return "output validation failed: discovery items were not parsed";
		for (let i = 0; i < items.length; i++) {
			const id = items[i]?.id;
			if (typeof id !== "string" || !id.trim()) {
				return `output validation failed: item ${i} missing required field 'id'`;
			}
		}
		const sourceRef = acceptedValidation.sourceRef === "checker.resultContent"
			? acceptedResultRef
			: acceptedValidation.normalizedRef ?? acceptedValidation.sourceRef ?? acceptedResultRef;
		await this.options.workspace.writeDiscoveryResult(runId, task.id, attemptId, {
			schemaVersion: "team/discovery-result-1",
			taskId: task.id,
			attemptId,
			outputKey,
			items,
			sourceRef,
			createdAt: new Date().toISOString(),
		});
		return null;
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
		publicBaseUrl: string | undefined,
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
			const artifactPublicDir = join(dataDir, "runs", runId, "agent-workspaces", attemptId, "worker", "output");
			await mkdir(artifactPublicDir, { recursive: true });
			const workerWorkDir = join(attemptRoot, "work");
			const taskForWorker = await materializeBoundInputFilesForWorkspace(task, {
				teamDataDir: dataDir,
				runId,
				workDir: workerWorkDir,
			});
			const timeout = this.resolveRoleTimeout("worker");
			const output = await runWithAdaptivePhaseTimeout({
				phase: "worker",
				idleMs: timeout.idleMs,
				hardCapMs: timeout.hardCapMs,
				parentSignal: signal,
				activityDirs: [artifactPublicDir],
			}, async (localSignal, markStructuralActivity) => roleRunner.runWorker({
				runId,
				task: taskForWorker,
				attemptId,
				workDir: workerWorkDir,
				outputDir: artifactPublicDir,
				artifactPublicDir,
				artifactPublicBaseUrl: buildTeamRoleArtifactBaseUrl(publicBaseUrl, runId, attemptId, "worker"),
				acceptanceRules: taskForWorker.acceptance.rules,
				feedback,
				signal: localSignal,
				onSessionEvent: (event) => this.handleRoleSessionEvent(recorder, markStructuralActivity, event),
			}));
			await recorder.succeed();
			return output;
		} catch (error) {
			if (isAbortLike(error)) {
				await recorder.cancel("run cancelled");
			} else {
				await recorder.fail(error instanceof Error ? error.message : String(error));
			}
			if (isAdaptivePhaseTimeoutError(error)) {
				await this.persistTimeoutFailure(runId, task.id, attemptId, error);
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
		publicBaseUrl: string | undefined,
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
			const checkerArtifactPublicDir = join(this.options.dataDir, "runs", runId, "agent-workspaces", attemptId, "checker", "output");
			await mkdir(checkerArtifactPublicDir, { recursive: true });
			const timeout = this.resolveRoleTimeout("checker");
			const output = await runWithAdaptivePhaseTimeout({
				phase: "checker",
				idleMs: timeout.idleMs,
				hardCapMs: timeout.hardCapMs,
				parentSignal: signal,
				activityDirs: [checkerArtifactPublicDir],
			}, async (localSignal, markStructuralActivity) => roleRunner.runChecker({
				runId,
				task,
				attemptId,
				workerOutputRef: workerRef,
				artifactPublicDir: checkerArtifactPublicDir,
				artifactPublicBaseUrl: buildTeamRoleArtifactBaseUrl(publicBaseUrl, runId, attemptId, "checker"),
				acceptanceRules: task.acceptance.rules,
				outputValidation,
				signal: localSignal,
				onSessionEvent: (event) => this.handleRoleSessionEvent(recorder, markStructuralActivity, event),
			}));
			await recorder.succeed();
			return output;
		} catch (error) {
			if (isAbortLike(error)) {
				await recorder.cancel("run cancelled");
			} else {
				await recorder.fail(error instanceof Error ? error.message : String(error));
			}
			if (isAdaptivePhaseTimeoutError(error)) {
				await this.persistTimeoutFailure(runId, task.id, attemptId, error);
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

	private resolveRoleTimeout(role: "worker" | "checker"): { idleMs: number; hardCapMs: number } {
		if (role === "worker") {
			const idleMs = this.phaseTimeouts.workerIdleMs ?? this.phaseTimeouts.workerMs ?? 900_000;
			const hardCapMs = this.phaseTimeouts.workerHardCapMs ?? Math.max(idleMs, 3_600_000);
			return { idleMs, hardCapMs };
		}
		const idleMs = this.phaseTimeouts.checkerIdleMs ?? this.phaseTimeouts.checkerMs ?? 600_000;
		const hardCapMs = this.phaseTimeouts.checkerHardCapMs ?? Math.max(idleMs, 1_800_000);
		return { idleMs, hardCapMs };
	}

	private handleRoleSessionEvent(
		recorder: TeamRoleProcessRecorder,
		markStructuralActivity: StructuralActivityMarker,
		event: RawAgentSessionEventLike,
	): void {
		recorder.handleRawEvent(event);
		if (event.type !== "tool_execution_end") return;
		const toolName = typeof event.toolName === "string" ? event.toolName : "unknown";
		markStructuralActivity(`tool_finished ${toolName}`);
	}

	private async persistTimeoutFailure(
		runId: string,
		taskId: string,
		attemptId: string,
		error: AdaptivePhaseTimeoutError,
	): Promise<void> {
		const timeoutEvidence = [
			`${error.phase} timeout`,
			"",
			`timeoutType: ${error.timeoutType}`,
			`phase: ${error.phase}`,
			`idleMs: ${error.idleMs}`,
			`hardCapMs: ${error.hardCapMs}`,
			`startedAt: ${error.startedAt}`,
			`elapsedMs: ${error.elapsedMs}`,
			`lastStructuralActivityAt: ${error.lastStructuralActivityAt}`,
			`lastStructuralActivityReason: ${error.lastStructuralActivityReason}`,
		].join("\n");
		const failRef = await this.options.workspace.writeFailedResult(runId, taskId, attemptId, timeoutEvidence);
		await this.options.workspace.finishAttempt(runId, taskId, attemptId, {
			status: "failed",
			phase: "failed",
			resultRef: failRef,
			errorSummary: error.message,
		});
	}
}
