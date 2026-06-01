import { mkdir } from "node:fs/promises";
import { TaskStore } from "./task-store.js";
import { RunWorkspace } from "./run-workspace.js";
import { computeTeamRunSummary } from "./team-summary.js";
import { progressMessages } from "./progress.js";
import { buildTeamCanvasSourceArtifact, buildTeamTaskTypedArtifact, formatBoundInputsForPrompt } from "./task-artifact-handoff.js";
import type { TaskConnectionStore } from "./task-connection-store.js";
import type { TaskDependencyStore } from "./task-dependency-store.js";
import { resolveSourceConnectionStaleReason, type SourceConnectionStore } from "./source-connection-store.js";
import type { SourceNodeStore } from "./source-node-store.js";
import type { ProfileAwareTeamRoleRunner, TeamRoleRunner } from "./role-runner.js";
import type { TeamCanvasTask, TeamDiscoveryAggregationRecord, TeamDiscoveryDispatchOutcome, TeamDiscoveryGeneratedRunOutcome, TeamPlan, TeamRunState, TeamTask, TeamTaskBoundInput, TeamTaskDeliveryOutcome } from "./types.js";
import { planDownstreamDelivery } from "./downstream-delivery.js";
import { CanvasTaskAttemptRunner } from "./canvas-task-attempt-runner.js";

export interface CanvasTaskRunServiceOptions {
	taskStore: TaskStore;
	workspace: RunWorkspace;
	createRoleRunner: () => TeamRoleRunner;
	connectionStore?: TaskConnectionStore;
	dependencyStore?: TaskDependencyStore;
	sourceNodeStore?: SourceNodeStore;
	sourceConnectionStore?: SourceConnectionStore;
	dataDir: string;
	maxCheckerRevisions?: number;
	phaseTimeouts?: {
		workerMs: number;
		checkerMs: number;
	};
	/** Canvas Task runs intentionally ignore Plan-level global run admission. */
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

const DELIVERY_ERROR_LIMIT = 500;
const GENERATED_TASK_AUTORUN_CONCURRENCY = 3;
const GENERATED_TASK_AUTORUN_POLL_MS = 25;

type TaskRunSource = NonNullable<TeamRunState["source"]>;
type DiscoveryGeneratedTaskCandidate = { itemId: string; task: TeamCanvasTask };
type DiscoveryGeneratedTaskDispatchResult = {
	autoRunCandidates: DiscoveryGeneratedTaskCandidate[];
	outcomes: TeamDiscoveryDispatchOutcome[];
};

export interface CanvasTaskRunOptions {
	maxRunDurationMinutes?: number;
	boundInputs?: TeamTaskBoundInput[];
	triggeredBy?: TaskRunSource["triggeredBy"];
	includeSourceBindings?: boolean;
	publicBaseUrl?: string;
}

function canvasTaskToTeamTask(task: TeamCanvasTask, boundInputs: TeamTaskBoundInput[] = []): TeamTask {
	const boundInputText = formatBoundInputsForPrompt(boundInputs);
	const isDiscovery = task.canvasKind === "discovery";
	return {
		id: task.taskId,
		type: isDiscovery ? "discovery" : "normal",
		title: task.workUnit.title || task.title,
		input: {
			text: boundInputText ? `${task.workUnit.input.text}\n\n${boundInputText}` : task.workUnit.input.text,
			...(boundInputs.length > 0 ? { payload: { boundInputs } } : {}),
		},
		acceptance: { rules: task.workUnit.acceptance.rules },
		...(task.workUnit.outputCheck ? { outputCheck: task.workUnit.outputCheck } : {}),
		...(isDiscovery && task.discoverySpec ? { discovery: { outputKey: task.discoverySpec.outputKey } } : {}),
	};
}

function canvasTaskToPlan(task: TeamCanvasTask, boundInputs: TeamTaskBoundInput[] = []): TeamPlan {
	const teamTask = canvasTaskToTeamTask(task, boundInputs);
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

function isAbortLike(error: unknown): boolean {
	return error instanceof Error && /abort|cancel/i.test(error.message);
}

function sanitizeDeliveryError(error: unknown): string {
	const raw = error instanceof Error ? error.message : String(error);
	const trimmed = raw.trim();
	if (!trimmed) return "unknown downstream delivery error";
	return trimmed.slice(0, DELIVERY_ERROR_LIMIT);
}

function parseActiveTaskRunError(error: unknown): string | null {
	const message = error instanceof Error ? error.message : String(error);
	const match = /^active task run already exists: (.+)$/.exec(message.trim());
	return match?.[1] ?? null;
}

function isNotRunnableLaunchError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /task not found|archived task cannot be run|task must be ready before run/i.test(message);
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
	if (signal.aborted) return Promise.reject(new Error("run cancelled"));
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timeout);
			reject(new Error("run cancelled"));
		};
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

export class CanvasTaskRunService {
	private readonly activeControllers = new Map<string, AbortController>();
	private readonly cancellingRunIds = new Set<string>();
	private readonly attemptRunner: CanvasTaskAttemptRunner;

	constructor(private readonly options: CanvasTaskRunServiceOptions) {
		const maxCheckerRevisions = Math.max(1, Math.floor(options.maxCheckerRevisions ?? 3));
		const phaseTimeouts = options.phaseTimeouts ?? DEFAULT_TASK_RUN_TIMEOUTS;
		this.attemptRunner = new CanvasTaskAttemptRunner({
			workspace: options.workspace,
			dataDir: options.dataDir,
			maxCheckerRevisions,
			phaseTimeouts,
		});
	}

	async createRun(taskId: string, runOptions: CanvasTaskRunOptions = {}): Promise<TeamRunState> {
		const task = await this.options.taskStore.get(taskId);
		if (!task) throw new Error(`task not found: ${taskId}`);
		if (task.archived || task.status === "archived") throw new Error("archived task cannot be run");
		if (task.status !== "ready") throw new Error("task must be ready before run");

		const activeRun = (await this.listRuns(taskId)).find(run => ACTIVE_RUN_STATUSES.has(run.status));
		if (activeRun) throw new Error(`active task run already exists: ${activeRun.runId}`);

		const boundInputs = [
			...(runOptions.boundInputs ?? []),
			...(runOptions.includeSourceBindings ? await this.buildSourceBoundInputs(task) : []),
		];
		const plan = canvasTaskToPlan(task, boundInputs);
		const createOptions = runOptions.maxRunDurationMinutes != null
			? { maxRunDurationMinutes: runOptions.maxRunDurationMinutes }
			: this.options.maxRunDurationMinutes != null
				? { maxRunDurationMinutes: this.options.maxRunDurationMinutes }
				: undefined;
		const state = await this.options.workspace.createRun(plan, plan.defaultTeamUnitId, createOptions);
		state.source = {
			type: "canvas-task",
			taskId: task.taskId,
			...(runOptions.publicBaseUrl ? { publicBaseUrl: runOptions.publicBaseUrl } : {}),
			...(runOptions.triggeredBy ? { triggeredBy: runOptions.triggeredBy } : {}),
			...(boundInputs.length > 0 ? { boundInputs } : {}),
		};
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

	private async buildSourceBoundInputs(task: TeamCanvasTask): Promise<TeamTaskBoundInput[]> {
		const sourceNodeStore = this.options.sourceNodeStore;
		const sourceConnectionStore = this.options.sourceConnectionStore;
		if (!sourceNodeStore || !sourceConnectionStore) return [];
		const connections = await sourceConnectionStore.listToTask(task.taskId);
		const boundInputs: TeamTaskBoundInput[] = [];
		for (const connection of connections) {
			const sourceNode = await sourceNodeStore.get(connection.fromSourceNodeId);
			const staleReason = resolveSourceConnectionStaleReason(sourceNode, task, connection);
			if (staleReason) continue;
			const artifact = buildTeamCanvasSourceArtifact({
				type: connection.type,
				sourceNodeId: sourceNode!.sourceNodeId,
				sourceOutputPortId: connection.fromOutputPortId,
				title: sourceNode!.title,
				content: sourceNode!.content?.text,
				fileName: sourceNode!.content?.fileName,
				mimeType: sourceNode!.content?.mimeType,
				size: sourceNode!.content?.size,
				storageRef: sourceNode!.content?.storageRef,
			});
			boundInputs.push({
				source: "canvas-source",
				connectionId: connection.connectionId,
				inputPortId: connection.toInputPortId,
				artifact,
			});
		}
		return boundInputs;
	}

	async cancelRun(runId: string, reason = "user cancel"): Promise<TeamRunState> {
		const state = await this.getRun(runId);
		if (!state) throw new Error(`run not found: ${runId}`);
		if (TERMINAL_RUN_STATUSES.has(state.status)) throw new Error(`cannot cancel terminal run: ${state.status}`);
		const sourceTask = state.source?.taskId ? await this.options.taskStore.get(state.source.taskId) : null;
		const shouldCancelDiscoveryGeneratedRuns = sourceTask?.canvasKind === "discovery" && !sourceTask.generatedSource;

		this.cancellingRunIds.add(runId);
		this.activeControllers.get(runId)?.abort(new Error(reason));
		this.activeControllers.delete(runId);

		try {
			const timestamp = now();
			state.status = "cancelled";
			state.finishedAt = timestamp;
			state.lastError = reason;
			state.activeElapsedMs = this.accumulateElapsed(state);
			state.lease = null;
			await this.attemptRunner.cancelActiveProcesses(runId, reason);
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
			if (shouldCancelDiscoveryGeneratedRuns) {
				await this.cancelDiscoveryGeneratedRunsForRun(runId, reason);
			}

			return state;
		} finally {
			this.cancellingRunIds.delete(runId);
		}
	}

	private async cancelDiscoveryGeneratedRunsForRun(discoveryRunId: string, reason: string): Promise<void> {
		const runs = await this.listRuns();
		const generatedRuns = runs.filter(run =>
			ACTIVE_RUN_STATUSES.has(run.status)
			&& run.source?.triggeredBy?.type === "discovery-generated-task"
			&& run.source.triggeredBy.discoveryRunId === discoveryRunId
		);
		for (const run of generatedRuns) {
			await this.cancelRun(run.runId, reason).catch(() => {});
		}
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

		const task = canvasTaskToTeamTask(canvasTask, initialState.source?.boundInputs ?? []);
		const roleRunner = this.options.createRoleRunner();
		if ("setProfileIds" in roleRunner && typeof (roleRunner as ProfileAwareTeamRoleRunner).setProfileIds === "function") {
			(roleRunner as ProfileAwareTeamRoleRunner).setProfileIds({
				workerProfileId: canvasTask.workUnit.workerAgentId,
				checkerProfileId: canvasTask.workUnit.checkerAgentId,
				watcherProfileId: canvasTask.workUnit.checkerAgentId,
				finalizerProfileId: canvasTask.workUnit.checkerAgentId,
				decomposerProfileId: canvasTask.workUnit.workerAgentId,
				...(canvasTask.discoverySpec ? { dispatcherProfileId: canvasTask.discoverySpec.dispatcherAgentId } : {}),
			});
		}

		try {
			await this.transitionToRunning(runId, task.id);
			const { attemptId, attemptRoot } = await this.options.workspace.createAttempt(runId, task.id);
			await this.options.workspace.patchState(runId, (latest) => {
				const taskState = latest.taskStates[task.id];
				if (!taskState) return;
				taskState.attemptCount += 1;
				taskState.activeAttemptId = attemptId;
				latest.summary = computeTeamRunSummary(latest.taskStates);
			});

			const outcome = await this.attemptRunner.runAttempt({
				runId,
				task,
				attemptId,
				attemptRoot,
				publicBaseUrl: initialState.source?.publicBaseUrl,
				roleRunner,
				signal,
				workerProfileId: canvasTask.workUnit.workerAgentId,
				checkerProfileId: canvasTask.workUnit.checkerAgentId,
			});

			if (outcome.status === "succeeded") {
				await this.completeRunSucceeded(runId, task.id, attemptId, outcome.resultRef!, canvasTask, roleRunner, signal);
			} else {
				await this.completeRunFailed(runId, task.id, outcome.errorSummary!, outcome.resultRef ?? undefined);
			}
		} catch (error) {
			const current = await this.getRun(runId);
			if (this.cancellingRunIds.has(runId) || (current && current.status === "cancelled")) return;
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

	private async completeRunSucceeded(
		runId: string,
		taskId: string,
		attemptId: string,
		resultRef: string,
		canvasTask: TeamCanvasTask,
		roleRunner: TeamRoleRunner,
		signal: AbortSignal,
	): Promise<void> {
		if (canvasTask.canvasKind === "discovery") {
			await this.markDiscoveryRunWaitingForGeneratedTasks(runId, taskId, resultRef);
			let discoveryDispatchResult: DiscoveryGeneratedTaskDispatchResult | null = null;
			try {
				discoveryDispatchResult = await this.dispatchDiscoveryGeneratedTasks(runId, canvasTask, attemptId, roleRunner, signal);
			} catch {
				// Discovery dispatch diagnostics must not fail an accepted Discovery run.
			}
			if (signal.aborted || await this.isRunCancelledOrMissing(runId)) return;
			let generatedRunOutcomes: TeamDiscoveryGeneratedRunOutcome[] = [];
			if (discoveryDispatchResult) {
				generatedRunOutcomes = await this.autoRunDiscoveryGeneratedTasks(
					runId,
					canvasTask,
					attemptId,
					discoveryDispatchResult.autoRunCandidates,
					signal,
				).catch(() => []);
			}
			if (signal.aborted || await this.isRunCancelledOrMissing(runId)) return;
			await this.writeDiscoveryAggregation(
				runId,
				canvasTask,
				attemptId,
				discoveryDispatchResult?.outcomes ?? [],
				generatedRunOutcomes,
			).catch(() => {});
			await this.markRunSucceeded(runId, taskId, resultRef);
			try {
				await this.triggerDownstreamRuns(runId, taskId, attemptId, resultRef);
			} catch {
				// Downstream delivery setup/diagnostics must not fail an accepted upstream run.
			}
			return;
		}

		await this.markRunSucceeded(runId, taskId, resultRef);
		try {
			await this.triggerDownstreamRuns(runId, taskId, attemptId, resultRef);
		} catch {
			// Downstream delivery setup/diagnostics must not fail an accepted upstream run.
		}
	}

	private async isRunCancelledOrMissing(runId: string): Promise<boolean> {
		const state = await this.getRun(runId);
		return !state || state.status === "cancelled";
	}

	private async markDiscoveryRunWaitingForGeneratedTasks(runId: string, taskId: string, resultRef: string): Promise<void> {
		const timestamp = now();
		await this.options.workspace.patchState(runId, (state) => {
			const taskState = state.taskStates[taskId];
			if (taskState) {
				taskState.status = "running";
				taskState.resultRef = resultRef;
				taskState.errorSummary = null;
				taskState.progress = {
					phase: "writing_result",
					message: "正在派发并运行 Discovery generated Tasks",
					updatedAt: timestamp,
				};
			}
			state.status = "running";
			state.currentTaskId = taskId;
			state.summary = computeTeamRunSummary(state.taskStates);
			state.updatedAt = timestamp;
		});
	}

	private async markRunSucceeded(runId: string, taskId: string, resultRef: string): Promise<void> {
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

	private async dispatchDiscoveryGeneratedTasks(
		runId: string,
		canvasTask: TeamCanvasTask,
		attemptId: string,
		roleRunner: TeamRoleRunner,
		signal: AbortSignal,
	): Promise<DiscoveryGeneratedTaskDispatchResult | null> {
		if (canvasTask.canvasKind !== "discovery") return null;
		const discoverySpec = canvasTask.discoverySpec;
		if (!discoverySpec) return null;
		const createdAt = now();
		const discoveryResult = await this.options.workspace.readDiscoveryResult(runId, canvasTask.taskId, attemptId);
		if (!discoveryResult) {
			const outcomes: TeamDiscoveryDispatchOutcome[] = [{
				itemId: "__discovery_result__",
				status: "blocked",
				error: "discovery-result.json was not found for accepted Discovery run",
				createdAt,
			}];
			await this.options.workspace.recordAttemptDiscoveryDispatchOutcomes(runId, canvasTask.taskId, attemptId, outcomes);
			return { autoRunCandidates: [], outcomes };
		}

		const outcomes: TeamDiscoveryDispatchOutcome[] = [];
		const autoRunCandidates: DiscoveryGeneratedTaskCandidate[] = [];
		const activeItemIds = new Set<string>();
		const runDispatcher = typeof roleRunner.runDiscoveryDispatcher === "function"
			? roleRunner.runDiscoveryDispatcher.bind(roleRunner)
			: null;
		if (!runDispatcher) {
			for (const item of discoveryResult.items) {
				const itemId = typeof item.id === "string" && item.id.trim() ? item.id : "__invalid_item_id__";
				if (itemId !== "__invalid_item_id__") activeItemIds.add(itemId);
				outcomes.push({
					itemId,
					status: "blocked",
					error: "role runner does not implement runDiscoveryDispatcher",
					createdAt,
				});
			}
		} else {
			for (const item of discoveryResult.items) {
				const itemId = typeof item.id === "string" && item.id.trim() ? item.id : "";
				if (!itemId) {
					outcomes.push({
						itemId: "__invalid_item_id__",
						status: "blocked",
						error: "discovery item id is invalid",
						createdAt,
					});
					continue;
				}
				activeItemIds.add(itemId);
				try {
					const dispatch = await runDispatcher({
						runId,
						discoveryTaskId: canvasTask.taskId,
						discoveryTaskTitle: canvasTask.title,
						discoveryGoal: discoverySpec.discoveryGoal,
						dispatchGoal: discoverySpec.dispatchGoal,
						outputKey: discoveryResult.outputKey,
						itemId,
						itemPayload: item,
						requiredItemFields: discoverySpec.requiredItemFields,
						...(discoverySpec.recommendedItemFields ? { recommendedItemFields: discoverySpec.recommendedItemFields } : {}),
						generatedWorkerAgentId: discoverySpec.generatedWorkerAgentId,
						generatedCheckerAgentId: discoverySpec.generatedCheckerAgentId,
						signal,
					});
					if (!dispatch.ok) {
						outcomes.push({
							itemId,
							status: "blocked",
							error: dispatch.error,
							createdAt,
						});
						continue;
					}
					if (dispatch.itemId !== itemId) {
						outcomes.push({
							itemId,
							status: "blocked",
							error: `discovery dispatcher item mismatch: expected ${itemId}, got ${dispatch.itemId}`,
							createdAt,
						});
						continue;
					}
					const upsert = await this.options.taskStore.upsertGeneratedTaskFromDiscovery({
						sourceDiscoveryTaskId: canvasTask.taskId,
						sourceItemId: itemId,
						itemPayload: item,
						latestDiscoveryRunId: runId,
						latestDiscoveryAttemptId: attemptId,
						latestDiscoveredAt: createdAt,
						leaderAgentId: canvasTask.leaderAgentId,
						generatedWorkerAgentId: discoverySpec.generatedWorkerAgentId,
						generatedCheckerAgentId: discoverySpec.generatedCheckerAgentId,
						workUnit: dispatch.workUnit,
					});
					outcomes.push({
						itemId,
						status: upsert.created ? "created" : "updated",
						generatedTaskId: upsert.task.taskId,
						workUnitMode: upsert.task.generatedSource?.workUnitMode,
						createdAt,
					});
					if (upsert.task.generatedSource?.itemStatus === "active") {
						autoRunCandidates.push({ itemId, task: upsert.task });
					}
				} catch (error) {
					outcomes.push({
						itemId,
						status: "blocked",
						error: sanitizeDeliveryError(error),
						createdAt,
					});
				}
			}
		}

		const staleTasks = await this.options.taskStore.markGeneratedTasksStaleForDiscovery(
			canvasTask.taskId,
			activeItemIds,
			{
				latestDiscoveryRunId: runId,
				latestDiscoveryAttemptId: attemptId,
				latestDiscoveredAt: createdAt,
			},
		);
		for (const task of staleTasks) {
			outcomes.push({
				itemId: task.generatedSource!.sourceItemId,
				status: "stale_marked",
				generatedTaskId: task.taskId,
				workUnitMode: task.generatedSource!.workUnitMode,
				createdAt,
			});
		}
		await this.options.workspace.recordAttemptDiscoveryDispatchOutcomes(runId, canvasTask.taskId, attemptId, outcomes);
		return { autoRunCandidates, outcomes };
	}

	private async autoRunDiscoveryGeneratedTasks(
		discoveryRunId: string,
		discoveryTask: TeamCanvasTask,
		discoveryAttemptId: string,
		candidates: DiscoveryGeneratedTaskCandidate[],
		signal: AbortSignal,
	): Promise<TeamDiscoveryGeneratedRunOutcome[]> {
		const autoRun = discoveryTask.discoverySpec?.autoRun;
		if (autoRun?.enabled !== true) return [];
		if (candidates.length === 0) return [];

		const concurrency = autoRun.concurrency === GENERATED_TASK_AUTORUN_CONCURRENCY
			? GENERATED_TASK_AUTORUN_CONCURRENCY
			: GENERATED_TASK_AUTORUN_CONCURRENCY;
		const outcomes: Array<TeamDiscoveryGeneratedRunOutcome | undefined> = new Array(candidates.length);
		let nextIndex = 0;
		const runWorker = async (): Promise<void> => {
			while (nextIndex < candidates.length) {
				if (signal.aborted) return;
				const index = nextIndex;
				nextIndex++;
				const candidate = candidates[index]!;
				outcomes[index] = await this.launchDiscoveryGeneratedTaskRun({
					discoveryRunId,
					discoveryTaskId: discoveryTask.taskId,
					discoveryAttemptId,
					candidate,
					signal,
				});
				if (signal.aborted) return;
			}
		};

		await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => runWorker()));
		const compactOutcomes = outcomes.filter((outcome): outcome is TeamDiscoveryGeneratedRunOutcome => Boolean(outcome));
		await this.options.workspace.recordAttemptDiscoveryGeneratedRunOutcomes(
			discoveryRunId,
			discoveryTask.taskId,
			discoveryAttemptId,
			compactOutcomes,
		);
		return compactOutcomes;
	}

	private async launchDiscoveryGeneratedTaskRun(input: {
		discoveryRunId: string;
		discoveryTaskId: string;
		discoveryAttemptId: string;
		candidate: DiscoveryGeneratedTaskCandidate;
		signal: AbortSignal;
	}): Promise<TeamDiscoveryGeneratedRunOutcome> {
		const { discoveryRunId, discoveryTaskId, discoveryAttemptId, candidate, signal } = input;
		const createdAt = now();
		const latestTask = await this.options.taskStore.get(candidate.task.taskId);
		const discoveryRun = await this.getRun(discoveryRunId);
		if (!latestTask || latestTask.archived || latestTask.generatedSource?.itemStatus !== "active") {
			return {
				itemId: candidate.itemId,
				generatedTaskId: candidate.task.taskId,
				status: "skipped_not_runnable",
				error: "generated task is not active or no longer exists",
				createdAt,
			};
		}
		if (latestTask.status !== "ready") {
			return {
				itemId: candidate.itemId,
				generatedTaskId: latestTask.taskId,
				status: "skipped_not_runnable",
				error: `generated task must be ready before auto-run: ${latestTask.status}`,
				createdAt,
			};
		}

		const activeRun = (await this.listRuns(latestTask.taskId)).find(run => ACTIVE_RUN_STATUSES.has(run.status));
		if (activeRun) {
			return {
				itemId: candidate.itemId,
				generatedTaskId: latestTask.taskId,
				status: "skipped_already_running",
				generatedRunId: activeRun.runId,
				createdAt,
			};
		}

		try {
			const generatedRun = await this.createRun(latestTask.taskId, {
				publicBaseUrl: discoveryRun?.source?.publicBaseUrl,
				triggeredBy: {
					type: "discovery-generated-task",
					discoveryTaskId,
					discoveryRunId,
					discoveryAttemptId,
					sourceItemId: candidate.itemId,
				},
			});
			try {
				await this.waitForTerminalGeneratedRun(generatedRun.runId, signal);
			} catch {
				// The launch succeeded; waiting is only used to enforce the v1 pool.
				if (signal.aborted) {
					await this.cancelRun(generatedRun.runId, "discovery root run cancelled").catch(() => {});
				}
			}
			return {
				itemId: candidate.itemId,
				generatedTaskId: latestTask.taskId,
				status: "started",
				generatedRunId: generatedRun.runId,
				createdAt,
			};
		} catch (error) {
			const activeRunId = parseActiveTaskRunError(error);
			if (activeRunId) {
				return {
					itemId: candidate.itemId,
					generatedTaskId: latestTask.taskId,
					status: "skipped_already_running",
					generatedRunId: activeRunId,
					createdAt,
				};
			}
			if (isNotRunnableLaunchError(error)) {
				return {
					itemId: candidate.itemId,
					generatedTaskId: latestTask.taskId,
					status: "skipped_not_runnable",
					error: sanitizeDeliveryError(error),
					createdAt,
				};
			}
			return {
				itemId: candidate.itemId,
				generatedTaskId: latestTask.taskId,
				status: "failed",
				error: sanitizeDeliveryError(error),
				createdAt,
			};
		}
	}

	private async waitForTerminalGeneratedRun(runId: string, signal: AbortSignal): Promise<void> {
		while (true) {
			if (signal.aborted) throw new Error("run cancelled");
			const run = await this.getRun(runId);
			if (!run) throw new Error(`generated run disappeared: ${runId}`);
			if (TERMINAL_RUN_STATUSES.has(run.status)) return;
			await delay(GENERATED_TASK_AUTORUN_POLL_MS, signal);
		}
	}

	private async writeDiscoveryAggregation(
		discoveryRunId: string,
		discoveryTask: TeamCanvasTask,
		discoveryAttemptId: string,
		dispatchOutcomes: TeamDiscoveryDispatchOutcome[],
		generatedRunOutcomes: TeamDiscoveryGeneratedRunOutcome[],
	): Promise<string | null> {
		const discoveryResult = await this.options.workspace.readDiscoveryResult(discoveryRunId, discoveryTask.taskId, discoveryAttemptId);
		if (!discoveryResult) return null;

		const dispatchByItemId = new Map(dispatchOutcomes.map(outcome => [outcome.itemId, outcome]));
		const launchByItemId = new Map(generatedRunOutcomes.map(outcome => [outcome.itemId, outcome]));
		const generatedTasks = await this.options.taskStore.listGeneratedForDiscoveryTask(discoveryTask.taskId);
		const generatedTaskByItemId = new Map(generatedTasks.map(task => [task.generatedSource!.sourceItemId, task]));
		const summary: TeamDiscoveryAggregationRecord["summary"] = {
			totalItems: discoveryResult.items.length,
			generatedTasks: 0,
			succeeded: 0,
			failed: 0,
			cancelled: 0,
			skipped: 0,
			missingResult: 0,
		};
		const items: TeamDiscoveryAggregationRecord["items"] = [];

		for (const itemPayload of discoveryResult.items) {
			const itemId = typeof itemPayload.id === "string" ? itemPayload.id : "";
			const dispatch = itemId ? dispatchByItemId.get(itemId) ?? null : null;
			const launch = itemId ? launchByItemId.get(itemId) : undefined;
			const generatedTaskId = dispatch?.generatedTaskId ?? (itemId ? generatedTaskByItemId.get(itemId)?.taskId : undefined);
			const generatedRunId = launch?.generatedRunId;
			let generatedRunStatus: TeamRunState["status"] | undefined;
			let result: TeamDiscoveryAggregationRecord["items"][number]["result"] = {
				status: "missing",
				errorSummary: "generated child run result was not found",
			};

			if (generatedTaskId) summary.generatedTasks += 1;

			if (!generatedTaskId || dispatch?.status === "blocked") {
				result = {
					status: "skipped",
					errorSummary: dispatch?.error ?? "discovery item was not dispatched to a generated task",
				};
			} else if (!generatedRunId) {
				result = {
					status: launch?.status === "failed" ? "failed" : "skipped",
					errorSummary: launch?.error ?? "generated child run was not started",
				};
			} else {
				const generatedRun = await this.getRun(generatedRunId);
				generatedRunStatus = generatedRun?.status;
				const taskState = generatedRun?.taskStates[generatedTaskId];
				const resultRef = taskState?.resultRef ?? null;
				const content = resultRef ? await this.options.workspace.readRunScopedFile(generatedRunId, resultRef) : null;
				if (taskState?.status === "succeeded" && content) {
					result = { status: "succeeded", resultRef, content, errorSummary: null };
				} else if (taskState?.status === "failed" || generatedRun?.status === "failed" || generatedRun?.status === "completed_with_failures") {
					result = {
						status: "failed",
						resultRef,
						...(content ? { content } : {}),
						errorSummary: taskState?.errorSummary ?? generatedRun?.lastError ?? null,
					};
				} else if (taskState?.status === "cancelled" || generatedRun?.status === "cancelled") {
					result = {
						status: "cancelled",
						resultRef,
						...(content ? { content } : {}),
						errorSummary: taskState?.errorSummary ?? generatedRun?.lastError ?? null,
					};
				} else {
					result = {
						status: "missing",
						resultRef,
						errorSummary: taskState?.errorSummary ?? "generated child run did not produce a readable result",
					};
				}
			}

			if (result.status === "succeeded") summary.succeeded += 1;
			if (result.status === "failed") summary.failed += 1;
			if (result.status === "cancelled") summary.cancelled += 1;
			if (result.status === "skipped") summary.skipped += 1;
			if (result.status === "missing") summary.missingResult += 1;

			items.push({
				itemId,
				itemPayload,
				dispatch,
				...(generatedTaskId ? { generatedTaskId } : {}),
				...(generatedRunId ? { generatedRunId } : {}),
				...(generatedRunStatus ? { generatedRunStatus } : {}),
				result,
			});
		}

		return this.options.workspace.writeDiscoveryAggregation(discoveryRunId, discoveryTask.taskId, discoveryAttemptId, {
			schemaVersion: "team/discovery-aggregation-1",
			discoveryTaskId: discoveryTask.taskId,
			discoveryRunId,
			discoveryAttemptId,
			outputKey: discoveryResult.outputKey,
			sourceResultRef: `tasks/${discoveryTask.taskId}/attempts/${discoveryAttemptId}/discovery-result.json`,
			createdAt: now(),
			summary,
			items,
		});
	}

	private async completeRunFailed(runId: string, taskId: string, errorSummary: string, resultRef?: string): Promise<void> {
		const effectiveResultRef = resultRef ?? await this.options.workspace.writeFailedResult(runId, taskId, "", errorSummary);
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

	private async triggerDownstreamRuns(runId: string, taskId: string, attemptId: string, resultRef: string): Promise<void> {
		const connectionStore = this.options.connectionStore;
		const dependencyStore = this.options.dependencyStore;
		if (!connectionStore && !dependencyStore) return;

		const connections = connectionStore ? await connectionStore.listFromTask(taskId) : [];
		const dependencies = dependencyStore ? await dependencyStore.listFromTask(taskId) : [];
		if (connections.length === 0 && dependencies.length === 0) return;

		const sourceRun = await this.getRun(runId);
		const sourceTask = await this.options.taskStore.get(taskId);
		const artifactSource = sourceTask && !sourceTask.archived
			? await this.resolveDownstreamArtifactSource(runId, taskId, attemptId, resultRef, sourceTask)
			: { resultRef, content: "" };

		const targetTaskIds = new Set([
			...connections.map(c => c.toTaskId),
			...dependencies.map(d => d.toTaskId),
		]);
		const taskCache = new Map<string, TeamCanvasTask | null>();
		for (const id of targetTaskIds) {
			taskCache.set(id, await this.options.taskStore.get(id));
		}

		const actions = planDownstreamDelivery(
			{ runId, taskId, attemptId, resultRef: artifactSource.resultRef, resultContent: artifactSource.content },
			{ sourceTask, connections, dependencies, getTask: (id) => taskCache.get(id) ?? null },
		);

		const outcomes: TeamTaskDeliveryOutcome[] = [];
		for (const action of actions) {
			switch (action.type) {
				case "skip_typed":
					outcomes.push({
						connectionId: action.connectionId,
						toTaskId: action.toTaskId,
						toInputPortId: action.toInputPortId,
						status: "skipped",
						staleReason: action.staleReason,
						createdAt: now(),
					});
					break;
				case "skip_control":
					outcomes.push({
						edgeKind: "control-dependency",
						dependencyId: action.dependencyId,
						toTaskId: action.toTaskId,
						status: "skipped",
						staleReason: action.staleReason,
						createdAt: now(),
					});
					break;
				case "trigger_typed_run":
					try {
						const artifact = buildTeamTaskTypedArtifact(action.artifactParams);
						const downstreamRun = await this.createRun(action.targetTask.taskId, {
							boundInputs: [{
								connectionId: action.connection.connectionId,
								inputPortId: action.connection.toInputPortId,
								artifact,
							}],
							publicBaseUrl: sourceRun?.source?.publicBaseUrl,
							triggeredBy: action.triggeredBy,
						});
						outcomes.push({
							connectionId: action.connection.connectionId,
							toTaskId: action.targetTask.taskId,
							toInputPortId: action.connection.toInputPortId,
							status: "delivered",
							downstreamRunId: downstreamRun.runId,
							createdAt: now(),
						});
					} catch (error) {
						outcomes.push({
							connectionId: action.connection.connectionId,
							toTaskId: action.targetTask.taskId,
							toInputPortId: action.connection.toInputPortId,
							status: "failed",
							error: sanitizeDeliveryError(error),
							createdAt: now(),
						});
					}
					break;
				case "trigger_control_run":
					try {
						const downstreamRun = await this.createRun(action.targetTask.taskId, {
							publicBaseUrl: sourceRun?.source?.publicBaseUrl,
							triggeredBy: action.triggeredBy,
						});
						outcomes.push({
							edgeKind: "control-dependency",
							dependencyId: action.dependency.dependencyId,
							toTaskId: action.targetTask.taskId,
							status: "delivered",
							downstreamRunId: downstreamRun.runId,
							createdAt: now(),
						});
					} catch (error) {
						outcomes.push({
							edgeKind: "control-dependency",
							dependencyId: action.dependency.dependencyId,
							toTaskId: action.targetTask.taskId,
							status: "failed",
							error: sanitizeDeliveryError(error),
							createdAt: now(),
						});
					}
					break;
			}
		}

		try {
			await this.options.workspace.recordAttemptDeliveryOutcomes(runId, taskId, attemptId, outcomes);
		} catch {
			// Diagnostic persistence must not fail the accepted upstream run.
		}
	}

	private async resolveDownstreamArtifactSource(
		runId: string,
		taskId: string,
		attemptId: string,
		resultRef: string,
		sourceTask: TeamCanvasTask,
	): Promise<{ resultRef: string; content: string }> {
		if (sourceTask.canvasKind === "discovery") {
			const discoveryAggregation = await this.options.workspace.readDiscoveryAggregation(runId, taskId, attemptId);
			if (discoveryAggregation) {
				const discoveryAggregationRef = `tasks/${taskId}/attempts/${attemptId}/discovery-aggregation.json`;
				const discoveryAggregationContent = await this.options.workspace.readRunScopedFile(runId, discoveryAggregationRef);
				if (discoveryAggregationContent) {
					return { resultRef: discoveryAggregationRef, content: discoveryAggregationContent };
				}
			}
			const discoveryResult = await this.options.workspace.readDiscoveryResult(runId, taskId, attemptId);
			if (discoveryResult) {
				const discoveryResultRef = `tasks/${taskId}/attempts/${attemptId}/discovery-result.json`;
				const discoveryContent = await this.options.workspace.readRunScopedFile(runId, discoveryResultRef);
				if (discoveryContent) {
					return { resultRef: discoveryResultRef, content: discoveryContent };
				}
			}
		}
		return {
			resultRef,
			content: await this.options.workspace.readRunScopedFile(runId, resultRef) ?? "",
		};
	}

	private async failRun(runId: string, message: string): Promise<void> {
		const timestamp = now();
		await this.attemptRunner.failActiveProcesses(runId, message);
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
}
