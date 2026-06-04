import { mkdir } from "node:fs/promises";
import { applyBindingsToDiscoverySpec, applyBindingsToWorkUnit, buildTemplateRunBindings, replaceTemplatePlaceholders } from "./task-store.js";
import type { TaskStore } from "./task-store.js";
import type { RunWorkspace } from "./run-workspace.js";
import { computeTeamRunSummary } from "./team-summary.js";
import { progressMessages } from "./progress.js";
import { buildTeamCanvasSourceArtifact, buildTeamTaskTypedArtifact, formatBoundInputsForPrompt } from "./task-artifact-handoff.js";
import type { TaskConnectionStore } from "./task-connection-store.js";
import type { TaskDependencyStore } from "./task-dependency-store.js";
import { resolveSourceConnectionStaleReason, type SourceConnectionStore } from "./source-connection-store.js";
import type { SourceNodeStore } from "./source-node-store.js";
import type { ProfileAwareTeamRoleRunner, TeamRoleRunner } from "./role-runner.js";
import type { TeamCanvasTask, TeamPlan, TeamRunState, TeamTask, TeamTaskBoundInput, TeamTaskDeliveryOutcome } from "./types.js";
import { DiscoveryRunLifecycle } from "./discovery-run-lifecycle.js";
import { planDownstreamDelivery } from "./downstream-delivery.js";
import { CanvasTaskAttemptRunner, type CanvasTaskAttemptWorkspace, type CanvasTaskPhaseTimeouts } from "./canvas-task-attempt-runner.js";

export type CanvasTaskRunWorkspace = CanvasTaskAttemptWorkspace & Pick<RunWorkspace,
	| "createRun"
	| "saveState"
	| "listStates"
	| "listStateSummaries"
	| "getState"
	| "createAttempt"
	| "finishAttempt"
	| "patchState"
	| "writeFailedResult"
	| "recordAttemptDeliveryOutcomes"
	| "readDiscoveryAggregation"
	| "readDiscoveryResult"
	| "readRunScopedFile"
	| "recordAttemptDiscoveryDispatchOutcomes"
	| "recordAttemptDiscoveryGeneratedRunOutcomes"
	| "writeDiscoveryAggregation"
>;

export type CanvasTaskRunTaskStore = Pick<TaskStore,
	| "get"
	| "updateTemplateCurrentBindings"
	| "upsertGeneratedTaskFromDiscovery"
	| "markGeneratedTasksStaleForDiscovery"
	| "listGeneratedForDiscoveryTask"
>;

export interface CanvasTaskRunServiceOptions {
	taskStore: CanvasTaskRunTaskStore;
	workspace: CanvasTaskRunWorkspace;
	createRoleRunner: () => TeamRoleRunner;
	connectionStore?: TaskConnectionStore;
	dependencyStore?: TaskDependencyStore;
	sourceNodeStore?: SourceNodeStore;
	sourceConnectionStore?: SourceConnectionStore;
	dataDir: string;
	maxCheckerRevisions?: number;
	phaseTimeouts?: CanvasTaskPhaseTimeouts;
	/** Canvas Task runs intentionally ignore Plan-level global run admission. */
	maxConcurrentRuns?: number;
	maxRunDurationMinutes?: number;
}

const now = () => new Date().toISOString();
const ACTIVE_RUN_STATUSES = new Set(["queued", "running", "paused"]);
const TERMINAL_RUN_STATUSES = new Set(["completed", "completed_with_failures", "failed", "cancelled"]);

function sortRunsByCreatedAtDesc(runs: TeamRunState[]): TeamRunState[] {
	return [...runs].sort((a, b) => {
		const aTime = Date.parse(a.createdAt);
		const bTime = Date.parse(b.createdAt);
		if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
		if (!Number.isFinite(aTime)) return 1;
		if (!Number.isFinite(bTime)) return -1;
		return bTime - aTime;
	});
}

function groupCanvasRunsByTaskIds(states: TeamRunState[], taskIds: string[], opts?: { limit?: number }): Record<string, TeamRunState[]> {
	const canvasRuns = states.filter(state => state.source?.type === "canvas-task");
	const byTaskId = new Map<string, TeamRunState[]>();
	for (const state of canvasRuns) {
		const tid = state.source!.taskId;
		let arr = byTaskId.get(tid);
		if (!arr) { arr = []; byTaskId.set(tid, arr); }
		arr.push(state);
	}
	const result: Record<string, TeamRunState[]> = {};
	const limit = opts?.limit;
	for (const taskId of taskIds) {
		let runs = byTaskId.get(taskId) ?? [];
		if (limit != null && limit > 0) {
			runs = sortRunsByCreatedAtDesc(runs).slice(0, limit);
		}
		result[taskId] = runs;
	}
	return result;
}

const DEFAULT_TASK_RUN_TIMEOUTS = {
	workerMs: 900_000,
	checkerMs: 300_000,
	workerHardCapMs: 3_600_000,
	checkerHardCapMs: 1_800_000,
};

const DELIVERY_ERROR_LIMIT = 500;

type TaskRunSource = NonNullable<TeamRunState["source"]>;

export interface CanvasTaskRunOptions {
	maxRunDurationMinutes?: number;
	boundInputs?: TeamTaskBoundInput[];
	templateBindings?: Record<string, string>;
	triggeredBy?: TaskRunSource["triggeredBy"];
	includeSourceBindings?: boolean;
	publicBaseUrl?: string;
}

export interface CanvasTaskDetachedRunRecoveryResult {
	startedRunIds: string[];
	failedRunIds: string[];
}

function applyTemplateBindingsToTask(task: TeamCanvasTask, bindings: Record<string, string>): TeamCanvasTask {
	return {
		...task,
		title: replaceTemplatePlaceholders(task.title, bindings),
		workUnit: applyBindingsToWorkUnit(task.workUnit, bindings),
		...(task.discoverySpec ? { discoverySpec: applyBindingsToDiscoverySpec(task.discoverySpec, bindings) } : {}),
	};
}

function resolveTemplateBindings(task: TeamCanvasTask, inputBindings: Record<string, string> | undefined): Record<string, string> | undefined {
	if (!task.templateConfig) {
		if (inputBindings && Object.keys(inputBindings).length > 0) {
			throw new Error("template bindings require a template task");
		}
		return undefined;
	}
	return buildTemplateRunBindings(task.templateConfig, task.templateState, inputBindings);
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


export class CanvasTaskRunService {
	private readonly activeControllers = new Map<string, AbortController>();
	private readonly cancellingRunIds = new Set<string>();
	private readonly attemptRunner: CanvasTaskAttemptRunner;
	private _discoveryLifecycle: DiscoveryRunLifecycle | null = null;

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

	private get discoveryLifecycle(): DiscoveryRunLifecycle {
		if (!this._discoveryLifecycle) {
			this._discoveryLifecycle = new DiscoveryRunLifecycle({
				taskStore: this.options.taskStore,
				workspace: this.options.workspace,
				runs: {
					getRun: (runId) => this.getRun(runId),
					listRuns: (taskId) => this.listRuns(taskId),
					createRun: (taskId, options) => this.createRun(taskId, options),
					cancelRun: (runId, reason) => this.cancelRun(runId, reason),
				},
			});
		}
		return this._discoveryLifecycle;
	}

	async createRun(taskId: string, runOptions: CanvasTaskRunOptions = {}): Promise<TeamRunState> {
		const task = await this.options.taskStore.get(taskId);
		if (!task) throw new Error(`task not found: ${taskId}`);
		if (task.archived || task.status === "archived") throw new Error("archived task cannot be run");
		if (task.status !== "ready") throw new Error("task must be ready before run");

		const activeRun = (await this.listRuns(taskId)).find(run => ACTIVE_RUN_STATUSES.has(run.status));
		if (activeRun) throw new Error(`active task run already exists: ${activeRun.runId}`);

		const templateBindings = resolveTemplateBindings(task, runOptions.templateBindings);
		const storedTask = templateBindings && runOptions.templateBindings
			? await this.options.taskStore.updateTemplateCurrentBindings(task.taskId, templateBindings)
			: task;
		const runnableTask = templateBindings ? applyTemplateBindingsToTask(storedTask, templateBindings) : storedTask;
		const boundInputs = [
			...(runOptions.boundInputs ?? []),
			...(runOptions.includeSourceBindings ? await this.buildSourceBoundInputs(runnableTask) : []),
		];
		const plan = canvasTaskToPlan(runnableTask, boundInputs);
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
			...(templateBindings ? { templateBindings } : {}),
		};
		await this.options.workspace.saveState(state);

		this.startBackgroundRun(state.runId);
		return state;
	}

	async listRuns(taskId?: string): Promise<TeamRunState[]> {
		const states = await this.options.workspace.listStates();
		return taskId ? states.filter(state => state.source?.type === "canvas-task" && state.source.taskId === taskId) : states;
	}

	async listRunsByTaskIds(taskIds: string[], opts?: { limit?: number }): Promise<Record<string, TeamRunState[]>> {
		const states = await this.options.workspace.listStates();
		return groupCanvasRunsByTaskIds(states, taskIds, opts);
	}

	async listRunSummariesByTaskIds(taskIds: string[], opts?: { limit?: number }): Promise<Record<string, TeamRunState[]>> {
		const states = await this.options.workspace.listStateSummaries();
		return groupCanvasRunsByTaskIds(states, taskIds, opts);
	}

	async recoverDetachedRuns(): Promise<CanvasTaskDetachedRunRecoveryResult> {
		const startedRunIds: string[] = [];
		const failedRunIds: string[] = [];
		const runs = await this.listRuns();
		for (const run of runs) {
			if (!ACTIVE_RUN_STATUSES.has(run.status)) continue;
			if (this.activeControllers.has(run.runId)) continue;
			if (run.status === "queued") {
				this.startBackgroundRun(run.runId);
				startedRunIds.push(run.runId);
				continue;
			}
			if (run.status === "running") {
				await this.failRun(run.runId, "canvas task run interrupted before completion");
				failedRunIds.push(run.runId);
			}
		}
		return { startedRunIds, failedRunIds };
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
		const storedTask = await this.options.taskStore.get(taskId);
		if (!storedTask || storedTask.archived) {
			await this.failRun(runId, "task no longer exists or has been archived");
			return;
		}
		const canvasTask = initialState.source?.templateBindings
			? applyTemplateBindingsToTask(storedTask, initialState.source.templateBindings)
			: storedTask;

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
			const lifecycleResult = await this.discoveryLifecycle.runAcceptedDiscoveryRoot({
				runId,
				discoveryTask: canvasTask,
				attemptId,
				resultRef,
				roleRunner,
				signal,
			});
			if (lifecycleResult.status === "cancelled-or-missing") return;
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
