import type { TaskGroupStore } from "./task-group-store.js";
import { isTerminalTaskGroupRunStatus, TaskGroupRunStore } from "./task-group-run-store.js";
import type { TaskConnectionStore } from "./task-connection-store.js";
import type { TaskDependencyStore } from "./task-dependency-store.js";
import type { CanvasTaskRunService } from "./task-run-service.js";
import type {
	TeamAttemptMetadata,
	TeamTaskDeliveryOutcome,
	TeamRunState,
	TeamTaskGroup,
	TeamTaskGroupRun,
	TeamTaskGroupRunObservedRun,
	TeamTaskGroupRunSource,
	TeamTaskGroupRunStatus,
} from "./types.js";
import type { RunWorkspace } from "./run-workspace.js";

export interface StartTaskGroupRunInput {
	source?: TeamTaskGroupRunSource;
	publicBaseUrl?: string;
}

const ACTIVE_TASK_RUN_STATUSES = new Set(["queued", "running", "paused"]);
const ACTIVE_GROUP_RUN_STATUSES = new Set<TeamTaskGroupRunStatus>(["queued", "running"]);
const TERMINAL_TASK_RUN_STATUSES = new Set(["completed", "completed_with_failures", "failed", "cancelled"]);

const now = () => new Date().toISOString();

type TaskGroupRunConnectionReader = Pick<TaskConnectionStore, "listResolved">;
type TaskGroupRunDependencyReader = Pick<TaskDependencyStore, "listResolved">;
type TaskGroupRunAttemptReader = Pick<RunWorkspace, "listAttempts">;

type InternalGroupEdge =
	| { kind: "typed-connection"; id: string; fromTaskId: string; toTaskId: string }
	| { kind: "control-dependency"; id: string; fromTaskId: string; toTaskId: string };

export class TaskGroupRunService {
	constructor(
		private readonly groupStore: TaskGroupStore,
		private readonly groupRunStore: TaskGroupRunStore,
		private readonly taskRunService: CanvasTaskRunService,
		private readonly connectionStore: TaskGroupRunConnectionReader,
		private readonly dependencyStore: TaskGroupRunDependencyReader,
		private readonly attemptReader: TaskGroupRunAttemptReader,
	) {}

	async startGroupRun(groupId: string, input: StartTaskGroupRunInput = {}): Promise<TeamTaskGroupRun> {
		const group = await this.groupStore.get(groupId);
		if (!group) throw new Error(`task group not found: ${groupId}`);
		if (group.archived) throw new Error(`task group archived: ${groupId}`);

		const activeGroupRun = await this.groupRunStore.findActiveForGroup(groupId);
		if (activeGroupRun) {
			throw new Error(`active task group run already exists: ${activeGroupRun.groupRunId}`);
		}

		const resolved = await this.groupStore.resolve(group);
		if (resolved.status !== "valid" || resolved.headTaskIds.length === 0) {
			throw new Error(`invalid task group: ${resolved.validation.errors.map(error => error.code).join(", ")}`);
		}

		const activeTaskRun = await this.findActiveTaskRunInGroup(resolved.taskIds);
		if (activeTaskRun?.source?.type === "canvas-task") {
			throw new Error(`group contains active task run: ${activeTaskRun.source.taskId} ${activeTaskRun.runId}`);
		}

		const groupRun = await this.groupRunStore.create({
			groupId,
			source: input.source ?? { type: "manual" },
			definitionSnapshot: {
				taskIds: resolved.taskIds,
				headTaskIds: resolved.headTaskIds,
			},
		});
		const entryRuns: TeamTaskGroupRun["entryRuns"] = [];
		try {
			for (const taskId of resolved.headTaskIds) {
				const run = await this.taskRunService.createRun(taskId, {
					includeSourceBindings: true,
					publicBaseUrl: input.publicBaseUrl,
				});
				entryRuns.push({ taskId, runId: run.runId });
			}
			const timestamp = now();
			return await this.groupRunStore.patch(groupRun.groupRunId, {
				status: "running",
				startedAt: timestamp,
				entryRuns,
				observedRuns: entryRuns.map(run => ({ ...run, role: "entry" })),
			});
		} catch (error) {
			const reason = `task group entry start failed: ${error instanceof Error ? error.message : String(error)}`;
			for (const entry of entryRuns) {
				await this.taskRunService.cancelRun(entry.runId, reason).catch(() => {});
			}
			await this.groupRunStore.patch(groupRun.groupRunId, {
				status: "failed",
				entryRuns,
				observedRuns: entryRuns.map(run => ({ ...run, role: "entry" })),
				finishedAt: now(),
				lastError: reason,
			});
			throw new Error(reason);
		}
	}

	async getGroupRun(groupRunId: string): Promise<TeamTaskGroupRun | null> {
		const groupRun = await this.groupRunStore.get(groupRunId);
		if (!groupRun) return null;
		if (isTerminalTaskGroupRunStatus(groupRun.status)) return groupRun;
		return this.refreshGroupRun(groupRunId);
	}

	async listGroupRuns(groupId: string): Promise<TeamTaskGroupRun[]> {
		const runs = await this.groupRunStore.list({ groupId });
		const refreshed: TeamTaskGroupRun[] = [];
		for (const run of runs) {
			refreshed.push(isTerminalTaskGroupRunStatus(run.status) ? run : await this.refreshGroupRun(run.groupRunId));
		}
		return refreshed;
	}

	async refreshGroupRun(groupRunId: string): Promise<TeamTaskGroupRun> {
		const groupRun = await this.groupRunStore.get(groupRunId);
		if (!groupRun) throw new Error(`task group run not found: ${groupRunId}`);
		if (isTerminalTaskGroupRunStatus(groupRun.status)) return groupRun;

		const group = await this.groupStore.get(groupRun.groupId);
		const groupTaskIds = getGroupRunTaskIds(groupRun, group);
		if (!group && !groupRun.definitionSnapshot) {
			return this.groupRunStore.patch(groupRunId, {
				status: "failed",
				finishedAt: now(),
				lastError: `task group not found: ${groupRun.groupId}`,
			});
		}

		const allRuns = await this.taskRunService.listRuns();
		const observedRuns = this.collectObservedRuns(groupTaskIds, groupRun.entryRuns, allRuns);
		const groupTaskIdSet = new Set(groupTaskIds);
		const observedStates = observedRuns
			.map(observed => allRuns.find(run => run.runId === observed.runId) ?? null)
			.filter((run): run is TeamRunState => run !== null);
		const groupPipelineStates = observedStates.filter(run => (
			run.source?.type === "canvas-task" && groupTaskIdSet.has(run.source.taskId)
		));

		if (groupPipelineStates.length === 0) {
			return this.groupRunStore.patch(groupRunId, { observedRuns, status: "running" });
		}

		if (groupPipelineStates.some(run => ACTIVE_TASK_RUN_STATUSES.has(run.status))) {
			return this.groupRunStore.patch(groupRunId, { observedRuns, status: "running" });
		}

		if (!groupPipelineStates.every(run => TERMINAL_TASK_RUN_STATUSES.has(run.status))) {
			return this.groupRunStore.patch(groupRunId, { observedRuns, status: "running" });
		}

		const deliveryState = await this.inspectPendingInternalDeliveries(groupTaskIds, groupPipelineStates, allRuns);
		if (deliveryState.hasPendingDelivery) {
			return this.groupRunStore.patch(groupRunId, { observedRuns, status: "running" });
		}

		const status = aggregateTerminalStatus(groupPipelineStates, deliveryState.hasFailedDelivery);
		return this.groupRunStore.patch(groupRunId, {
			observedRuns,
			status,
			finishedAt: now(),
			lastError: status === "completed" ? null : firstRunError(groupPipelineStates) ?? deliveryState.firstDeliveryError,
		});
	}

	async cancelGroupRun(groupRunId: string, reason = "user cancel"): Promise<TeamTaskGroupRun> {
		const existing = await this.groupRunStore.get(groupRunId);
		if (!existing) throw new Error(`task group run not found: ${groupRunId}`);
		if (isTerminalTaskGroupRunStatus(existing.status)) {
			throw new Error(`cannot cancel terminal task group run: ${existing.status}`);
		}

		const refreshed = await this.refreshGroupRun(groupRunId);
		if (isTerminalTaskGroupRunStatus(refreshed.status)) {
			throw new Error(`cannot cancel terminal task group run: ${refreshed.status}`);
		}

		const group = await this.groupStore.get(refreshed.groupId);
		const groupTaskIds = new Set(getGroupRunTaskIds(refreshed, group));
		const observedRunIds = new Set(refreshed.observedRuns.map(run => run.runId));
		const activeRuns = (await this.taskRunService.listRuns()).filter(run => {
			if (!ACTIVE_TASK_RUN_STATUSES.has(run.status)) return false;
			const taskId = run.source?.type === "canvas-task" ? run.source.taskId : "";
			return groupTaskIds.has(taskId) || observedRunIds.has(run.runId);
		});

		for (const run of activeRuns) {
			await this.taskRunService.cancelRun(run.runId, reason).catch(() => {});
		}

		return this.groupRunStore.patch(groupRunId, {
			status: "cancelled",
			observedRuns: this.collectObservedRuns([...groupTaskIds], refreshed.entryRuns, await this.taskRunService.listRuns()),
			finishedAt: now(),
			lastError: reason,
		});
	}

	private async findActiveTaskRunInGroup(taskIds: string[]): Promise<TeamRunState | null> {
		const taskIdSet = new Set(taskIds);
		const runs = await this.taskRunService.listRuns();
		return runs.find(run =>
			run.source?.type === "canvas-task"
			&& taskIdSet.has(run.source.taskId)
			&& ACTIVE_TASK_RUN_STATUSES.has(run.status)
		) ?? null;
	}

	private collectObservedRuns(
		groupTaskIds: string[],
		entryRuns: TeamTaskGroupRun["entryRuns"],
		allRuns: TeamRunState[],
	): TeamTaskGroupRunObservedRun[] {
		const groupTaskIdSet = new Set(groupTaskIds);
		const observed = new Map<string, TeamTaskGroupRunObservedRun>();
		for (const entry of entryRuns) {
			observed.set(entry.runId, { ...entry, role: "entry" });
		}

		let changed = true;
		while (changed) {
			changed = false;
			const observedRunIds = new Set(observed.keys());
			for (const run of allRuns) {
				if (observed.has(run.runId) || run.source?.type !== "canvas-task") continue;
				const triggeredBy = run.source.triggeredBy;
				if (!triggeredBy) continue;
				if (
					triggeredBy.type === "discovery-generated-task"
					&& observedRunIds.has(triggeredBy.discoveryRunId)
				) {
					observed.set(run.runId, { taskId: run.source.taskId, runId: run.runId, role: "discovery-generated" });
					changed = true;
					continue;
				}
				if (
					triggeredBy.type === "split-generated-task"
					&& observedRunIds.has(triggeredBy.splitRunId)
				) {
					observed.set(run.runId, { taskId: run.source.taskId, runId: run.runId, role: "split-generated" });
					changed = true;
					continue;
				}
				if (
					(triggeredBy.type === "task-connection" || triggeredBy.type === "task-dependency")
					&& observedRunIds.has(triggeredBy.fromRunId)
					&& groupTaskIdSet.has(run.source.taskId)
				) {
					observed.set(run.runId, { taskId: run.source.taskId, runId: run.runId, role: "downstream" });
					changed = true;
				}
			}
		}
		return [...observed.values()];
	}

	private async inspectPendingInternalDeliveries(
		groupTaskIds: string[],
		observedStates: TeamRunState[],
		allRuns: TeamRunState[],
	): Promise<{ hasPendingDelivery: boolean; hasFailedDelivery: boolean; firstDeliveryError: string | null }> {
		const groupTaskIdSet = new Set(groupTaskIds);
		const edges = await this.listActiveInternalEdges(groupTaskIdSet);
		let hasFailedDelivery = false;
		let firstDeliveryError: string | null = null;

		for (const run of observedStates) {
			if (run.status !== "completed" || run.source?.type !== "canvas-task") continue;
			const sourceTaskId = run.source.taskId;
			const outgoingEdges = edges.filter(edge => edge.fromTaskId === sourceTaskId);
			if (outgoingEdges.length === 0) continue;

			const taskAttemptId = run.taskStates[sourceTaskId]?.activeAttemptId;
			const deliveryOutcomes = taskAttemptId
				? await this.readAttemptDeliveryOutcomes(run.runId, sourceTaskId, taskAttemptId)
				: null;

			for (const edge of outgoingEdges) {
				const downstreamRun = allRuns.find(candidate => isRunTriggeredByEdge(candidate, run.runId, edge));
				if (downstreamRun) continue;

				const outcome = deliveryOutcomes?.find(item => deliveryOutcomeMatchesEdge(item, edge));
				if (!outcome) {
					return { hasPendingDelivery: true, hasFailedDelivery, firstDeliveryError };
				}
				if (outcome.status === "delivered") {
					return { hasPendingDelivery: true, hasFailedDelivery, firstDeliveryError };
				}
				if (outcome.status === "failed") {
					hasFailedDelivery = true;
					firstDeliveryError = firstDeliveryError ?? outcome.error ?? `downstream delivery failed: ${edge.id}`;
				}
			}
		}

		return { hasPendingDelivery: false, hasFailedDelivery, firstDeliveryError };
	}

	private async listActiveInternalEdges(groupTaskIdSet: Set<string>): Promise<InternalGroupEdge[]> {
		const edges: InternalGroupEdge[] = [];
		const connections = await this.connectionStore.listResolved();
		for (const connection of connections) {
			if (connection.status !== "active") continue;
			if (!groupTaskIdSet.has(connection.fromTaskId) || !groupTaskIdSet.has(connection.toTaskId)) continue;
			edges.push({
				kind: "typed-connection",
				id: connection.connectionId,
				fromTaskId: connection.fromTaskId,
				toTaskId: connection.toTaskId,
			});
		}
		const dependencies = await this.dependencyStore.listResolved();
		for (const dependency of dependencies) {
			if (dependency.status !== "active") continue;
			if (!groupTaskIdSet.has(dependency.fromTaskId) || !groupTaskIdSet.has(dependency.toTaskId)) continue;
			edges.push({
				kind: "control-dependency",
				id: dependency.dependencyId,
				fromTaskId: dependency.fromTaskId,
				toTaskId: dependency.toTaskId,
			});
		}
		return edges;
	}

	private async readAttemptDeliveryOutcomes(runId: string, taskId: string, attemptId: string): Promise<TeamTaskDeliveryOutcome[] | null> {
		const attempts = await this.attemptReader.listAttempts(runId, taskId).catch(() => []);
		const attempt = attempts.find(item => item.attemptId === attemptId);
		return attempt ? getAttemptDeliveryOutcomes(attempt) : null;
	}
}

function getGroupRunTaskIds(groupRun: TeamTaskGroupRun, group: TeamTaskGroup | null): string[] {
	return groupRun.definitionSnapshot?.taskIds ?? group?.taskIds ?? [];
}

function aggregateTerminalStatus(runs: TeamRunState[], hasFailedDelivery: boolean): TeamTaskGroupRunStatus {
	if (hasFailedDelivery || runs.some(run => run.status === "failed" || run.status === "completed_with_failures")) {
		return "completed_with_failures";
	}
	if (runs.some(run => run.status === "cancelled")) {
		return "cancelled";
	}
	return "completed";
}

function firstRunError(runs: TeamRunState[]): string | null {
	const failed = runs.find(run => run.lastError);
	return failed?.lastError ?? null;
}

function isRunTriggeredByEdge(run: TeamRunState, fromRunId: string, edge: InternalGroupEdge): boolean {
	if (run.source?.type !== "canvas-task") return false;
	if (run.source.taskId !== edge.toTaskId) return false;
	const triggeredBy = run.source.triggeredBy;
	if (!triggeredBy || triggeredBy.fromRunId !== fromRunId) return false;
	if (edge.kind === "typed-connection") {
		return triggeredBy.type === "task-connection" && triggeredBy.connectionId === edge.id;
	}
	return triggeredBy.type === "task-dependency" && triggeredBy.dependencyId === edge.id;
}

function deliveryOutcomeMatchesEdge(outcome: TeamTaskDeliveryOutcome, edge: InternalGroupEdge): boolean {
	if (edge.kind === "typed-connection") {
		return "connectionId" in outcome && outcome.connectionId === edge.id;
	}
	return "dependencyId" in outcome && outcome.dependencyId === edge.id;
}

function getAttemptDeliveryOutcomes(attempt: TeamAttemptMetadata): TeamTaskDeliveryOutcome[] | null {
	const maybe = attempt as TeamAttemptMetadata & { downstreamDelivery?: TeamTaskDeliveryOutcome[] };
	return Array.isArray(maybe.downstreamDelivery) ? maybe.downstreamDelivery : null;
}
