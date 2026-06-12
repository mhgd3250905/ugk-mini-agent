import type {
	ResolvedSourceConnection,
	ResolvedTaskConnection,
	ResolvedTaskDependency,
	TeamAttemptMetadata,
	TeamAttemptRoleProcess,
	TeamCanvasSourceNode,
	TeamCanvasTask,
	TeamDiscoveryGeneratedTaskSummary,
	TeamRunState,
} from "./types.js";
import { getGeneratedSourceKind, getGeneratedSourceLatestAt, getGeneratedSourceLatestAttemptId, getGeneratedSourceLatestRunId, getGeneratedSourceParentTaskId } from "./generated-source.js";
import type { CanvasTaskRunService } from "./task-run-service.js";
import type { RunWorkspace } from "./run-workspace.js";
import type { SourceConnectionStore } from "./source-connection-store.js";
import type { SourceNodeStore } from "./source-node-store.js";
import type { TaskConnectionStore } from "./task-connection-store.js";
import type { TaskDependencyStore } from "./task-dependency-store.js";
import type { TaskStore } from "./task-store.js";

function maxUpdatedAt(items: Array<{ updatedAt?: string }>): string | null {
	let latest: string | null = null;
	for (const item of items) {
		if (typeof item.updatedAt !== "string") continue;
		if (latest === null || item.updatedAt > latest) latest = item.updatedAt;
	}
	return latest;
}

function summarizeRoleProcess(roleProcess: TeamAttemptRoleProcess | undefined): TeamAttemptRoleProcess | undefined {
	if (!roleProcess) return undefined;
	return {
		...roleProcess,
		process: roleProcess.process
			? {
				...roleProcess.process,
				entries: [],
			}
			: null,
	};
}

function summarizeAttemptProcessSummary(attempt: TeamAttemptMetadata): TeamAttemptMetadata {
	return {
		...attempt,
		roleProcesses: attempt.roleProcesses
			? {
				worker: summarizeRoleProcess(attempt.roleProcesses.worker),
				checker: summarizeRoleProcess(attempt.roleProcesses.checker),
			}
			: undefined,
	};
}

function toGeneratedTaskSummary(task: TeamCanvasTask): TeamDiscoveryGeneratedTaskSummary {
	const source = task.generatedSource;
	if (!source) throw new Error("generated task summary requires generatedSource");
	return {
		taskId: task.taskId,
		canvasKind: task.canvasKind,
		title: task.title,
		leaderAgentId: task.leaderAgentId,
		status: task.status,
		createdAt: task.createdAt,
		updatedAt: task.updatedAt,
		archived: task.archived,
		generatedSource: {
			schemaVersion: source.schemaVersion,
			sourceKind: getGeneratedSourceKind(source),
			sourceTaskId: getGeneratedSourceParentTaskId(source),
			...(source.schemaVersion === "team/generated-task-source-1" ? { sourceDiscoveryTaskId: source.sourceDiscoveryTaskId } : {}),
			sourceItemId: source.sourceItemId,
			itemStatus: source.itemStatus,
			latestSourceRunId: getGeneratedSourceLatestRunId(source),
			latestSourceAttemptId: getGeneratedSourceLatestAttemptId(source),
			latestSourceAt: getGeneratedSourceLatestAt(source),
			...(source.schemaVersion === "team/generated-task-source-1" ? {
				latestDiscoveryRunId: source.latestDiscoveryRunId,
				latestDiscoveryAttemptId: source.latestDiscoveryAttemptId,
				latestDiscoveredAt: source.latestDiscoveredAt,
			} : {}),
			workUnitMode: source.workUnitMode,
			canResetToManaged: Boolean(source.latestManagedWorkUnit),
		},
	};
}

export function summarizeRunState(state: TeamRunState, taskId?: string): TeamRunState {
	const taskStates = taskId && state.taskStates[taskId]
		? { [taskId]: state.taskStates[taskId] }
		: state.taskStates;
	return {
		...state,
		taskStates,
		source: state.source
			? {
				...state.source,
				...(state.source.boundInputs ? { boundInputs: undefined } : {}),
			}
			: undefined,
	};
}

export function summarizeAttemptDispatchDiagnostics(attempt: TeamAttemptMetadata): TeamAttemptMetadata {
	return {
		attemptId: attempt.attemptId,
		taskId: attempt.taskId,
		status: attempt.status,
		phase: attempt.phase,
		createdAt: attempt.createdAt,
		updatedAt: attempt.updatedAt,
		finishedAt: attempt.finishedAt,
		worker: [],
		checker: [],
		watcher: null,
		resultRef: attempt.resultRef,
		errorSummary: attempt.errorSummary,
		...(attempt.discoveryDispatch ? { discoveryDispatch: attempt.discoveryDispatch } : {}),
	};
}

export interface RootSummaryResult {
	tasks: TeamCanvasTask[];
	deletedTaskIds: string[];
	taskRunsByTaskId: Record<string, TeamRunState[]>;
	deletedRunIdsByTaskId: Record<string, string[]>;
	sourceNodes: TeamCanvasSourceNode[];
	sourceConnections: ResolvedSourceConnection[];
	taskConnections: ResolvedTaskConnection[];
	taskDependencies: ResolvedTaskDependency[];
	serverVersion: {
		taskCatalog: string | null;
		taskRunSummary: string | null;
	};
}

export interface TaskListResult {
	tasks: TeamCanvasTask[];
	deletedTaskIds: string[];
	serverVersion: string | null;
}

export interface GeneratedTaskListResult {
	tasks: TeamCanvasTask[] | TeamDiscoveryGeneratedTaskSummary[];
	deletedTaskIds: string[];
	serverVersion: string | null;
}

export interface RunsByTaskResult {
	runsByTaskId: Record<string, TeamRunState[]>;
	deletedRunIdsByTaskId: Record<string, string[]>;
	serverVersion: string | null;
}

export type RunViewResult =
	| { status: "run_not_found" }
	| { status: "task_id_required" }
	| { status: "task_not_found" }
	| { status: "ok"; view: "full"; state: TeamRunState }
	| { status: "ok"; view: "summary"; state: TeamRunState }
	| { status: "ok"; view: "process-summary"; data: { run: TeamRunState; attempts: TeamAttemptMetadata[] } };

export type TeamConsoleSummaryTaskStore = Pick<TaskStore, "list" | "listGeneratedForSourceTask">;
export type TeamConsoleSummaryTaskRunService = Pick<CanvasTaskRunService, "listRunSummariesByTaskIds" | "listRunsByTaskIds" | "getRun">;
export type TeamConsoleSummaryAttemptStore = Pick<RunWorkspace, "listAttempts">;
export type TeamConsoleSummarySourceNodeStore = Pick<SourceNodeStore, "list">;
export type TeamConsoleSummarySourceConnectionStore = Pick<SourceConnectionStore, "listResolved">;
export type TeamConsoleSummaryTaskConnectionStore = Pick<TaskConnectionStore, "listResolved">;
export type TeamConsoleSummaryTaskDependencyStore = Pick<TaskDependencyStore, "listResolved">;
export type TeamConsoleSummaryReadModelDeps = {
	taskStore: TeamConsoleSummaryTaskStore;
	taskRunService: TeamConsoleSummaryTaskRunService;
	taskRunWorkspace: TeamConsoleSummaryAttemptStore;
	sourceNodeStore: TeamConsoleSummarySourceNodeStore;
	sourceConnectionStore: TeamConsoleSummarySourceConnectionStore;
	taskConnectionStore: TeamConsoleSummaryTaskConnectionStore;
	taskDependencyStore: TeamConsoleSummaryTaskDependencyStore;
};

export class TeamConsoleSummaryReadModel {
	constructor(private readonly deps: TeamConsoleSummaryReadModelDeps) {}

	async getRootSummary(input: { taskSince?: string; runSince?: string }): Promise<RootSummaryResult> {
		const { taskSince, runSince } = input;

		const allRootTasks = await this.deps.taskStore.list({
			includeArchived: true,
			includeGenerated: false,
		});
		const visibleRootTasks = allRootTasks.filter((task) => !task.archived);
		const tasks = taskSince ? visibleRootTasks.filter((task) => task.updatedAt > taskSince) : visibleRootTasks;
		const deletedTaskIds = taskSince
			? allRootTasks.filter((task) => task.archived && task.updatedAt > taskSince).map((task) => task.taskId)
			: [];

		const rootTaskIds = visibleRootTasks.map((task) => task.taskId);
		const runsByTaskId = rootTaskIds.length > 0
			? await this.deps.taskRunService.listRunSummariesByTaskIds(rootTaskIds, { limit: 1 })
			: {};

		const taskRunSummaryServerVersion = maxUpdatedAt(Object.values(runsByTaskId).flat());

		const filteredRunsByTaskId = Object.fromEntries(
			rootTaskIds.map((taskId) => {
				const runs = runsByTaskId[taskId] ?? [];
				const filtered = runSince ? runs.filter((run) => run.updatedAt > runSince) : runs;
				return [taskId, filtered.map(run => summarizeRunState(run, taskId))];
			}),
		);

		const deletedRunIdsByTaskId = Object.fromEntries(rootTaskIds.map((taskId) => [taskId, [] as string[]]));

		const [sourceNodes, sourceConnections, taskConnections, taskDependencies] = await Promise.all([
			this.deps.sourceNodeStore.list(),
			this.deps.sourceConnectionStore.listResolved(),
			this.deps.taskConnectionStore.listResolved(),
			this.deps.taskDependencyStore.listResolved(),
		]);

		return {
			tasks,
			deletedTaskIds,
			taskRunsByTaskId: filteredRunsByTaskId,
			deletedRunIdsByTaskId,
			sourceNodes,
			sourceConnections,
			taskConnections,
			taskDependencies,
			serverVersion: {
				taskCatalog: maxUpdatedAt(allRootTasks),
				taskRunSummary: taskRunSummaryServerVersion,
			},
		};
	}

	async listRootTasks(input: { since?: string; includeArchived: boolean; includeGenerated: boolean }): Promise<TaskListResult> {
		const { since, includeArchived, includeGenerated } = input;

		const allMatchingTasks = await this.deps.taskStore.list({
			includeArchived: true,
			includeGenerated,
		});
		const visibleTasks = allMatchingTasks.filter((task) => includeArchived || !task.archived);
		const tasks = since ? visibleTasks.filter((task) => task.updatedAt > since) : visibleTasks;
		const deletedTaskIds = since && !includeArchived
			? allMatchingTasks.filter((task) => task.archived && task.updatedAt > since).map((task) => task.taskId)
			: [];

		return {
			tasks,
			deletedTaskIds,
			serverVersion: maxUpdatedAt(allMatchingTasks),
		};
	}

	async listGeneratedTasks(input: {
		sourceKind: "discovery" | "split-task";
		sourceTaskId: string;
		since?: string;
		includeArchived: boolean;
		view: "full" | "summary";
	}): Promise<GeneratedTaskListResult> {
		const { sourceKind, sourceTaskId, since, includeArchived, view } = input;

		const allGeneratedTasks = await this.deps.taskStore.listGeneratedForSourceTask(sourceKind, sourceTaskId, {
			includeArchived: true,
		});
		const visibleTasks = allGeneratedTasks.filter((generatedTask) => includeArchived || !generatedTask.archived);
		const tasks = since ? visibleTasks.filter((generatedTask) => generatedTask.updatedAt > since) : visibleTasks;
		const deletedTaskIds = since && !includeArchived
			? allGeneratedTasks.filter((generatedTask) => generatedTask.archived && generatedTask.updatedAt > since).map((generatedTask) => generatedTask.taskId)
			: [];
		const serverVersion = maxUpdatedAt(allGeneratedTasks);

		if (view === "summary") {
			const summaries: TeamDiscoveryGeneratedTaskSummary[] = tasks.map(toGeneratedTaskSummary);
			return { tasks: summaries, deletedTaskIds, serverVersion };
		}
		return { tasks, deletedTaskIds, serverVersion };
	}

	async listRunsByTaskIds(input: {
		taskIds: string[];
		limit?: number;
		view: "full" | "summary";
		since?: string;
	}): Promise<RunsByTaskResult> {
		const { taskIds, limit, view, since } = input;

		const runsByTaskId = view === "summary"
			? await this.deps.taskRunService.listRunSummariesByTaskIds(taskIds, limit != null ? { limit } : undefined)
			: await this.deps.taskRunService.listRunsByTaskIds(taskIds, limit != null ? { limit } : undefined);

		const serverVersion = maxUpdatedAt(Object.values(runsByTaskId).flat());

		const filteredRunsByTaskId = since
			? Object.fromEntries(
				Object.entries(runsByTaskId).map(([taskId, runs]) => [taskId, runs.filter((run) => run.updatedAt > since)]),
			)
			: runsByTaskId;

		const deletedRunIdsByTaskId = Object.fromEntries(taskIds.map((taskId) => [taskId, [] as string[]]));

		if (view === "summary") {
			return {
				runsByTaskId: Object.fromEntries(
					Object.entries(filteredRunsByTaskId).map(([taskId, runs]) => [taskId, runs.map(run => summarizeRunState(run, taskId))]),
				),
				deletedRunIdsByTaskId,
				serverVersion,
			};
		}
		return {
			runsByTaskId: filteredRunsByTaskId,
			deletedRunIdsByTaskId,
			serverVersion,
		};
	}

	async getRunView(input: {
		runId: string;
		taskId: string;
		view: "full" | "summary" | "process-summary";
	}): Promise<RunViewResult> {
		const { runId, taskId, view } = input;

		const state = await this.deps.taskRunService.getRun(runId);
		if (!state) return { status: "run_not_found" };

		if (view === "summary") {
			if (taskId && !state.taskStates[taskId]) return { status: "task_not_found" };
			return { status: "ok", view: "summary", state: summarizeRunState(state, taskId || undefined) };
		}
		if (view === "process-summary") {
			if (!taskId) return { status: "task_id_required" };
			if (!state.taskStates[taskId]) return { status: "task_not_found" };
			try {
				const attempts = await this.deps.taskRunWorkspace.listAttempts(runId, taskId);
				return {
					status: "ok",
					view: "process-summary",
					data: { run: summarizeRunState(state, taskId), attempts: attempts.map(summarizeAttemptProcessSummary) },
				};
			} catch {
				return {
					status: "ok",
					view: "process-summary",
					data: { run: summarizeRunState(state, taskId), attempts: [] },
				};
			}
		}
		return { status: "ok", view: "full", state };
	}
}
