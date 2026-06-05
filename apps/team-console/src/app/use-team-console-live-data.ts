import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { LiveTeamApi } from "../api/team-api";
import type { AgentRunStatus, AgentSummary, ResolvedTeamTaskGroup, TeamCanvasSourceConnection, TeamCanvasSourceNode, TeamCanvasTask, TeamPlan, RunDetail, TeamApiError, TeamRunState, TeamAttemptMetadata, TeamTaskConnection, TeamTaskDependency } from "../api/team-types";
import { ALL_FIXTURES, MOCK_AGENTS, MOCK_AGENT_RUN_STATUSES, mockDiscoveryGeneratedTasks, mockDiscoveryRootTask, mockTeamTasks, MockTeamApi } from "../fixtures/team-fixtures";
import { ROOT_ID } from "../graph/execution-map-layout";
import { isActiveRun } from "../shared/status";
import {
  mergeTaskCatalog,
  mergeTaskCatalogIncremental,
  sortRunsByCreatedAt,
  mergeTaskRunMapIncremental,
  mergeRootTaskRunMap,
  mergeTaskRun,
} from "./team-console-live-refresh-state";
import {
  hasTaskDetail,
  mergeGeneratedTaskCatalogIncremental,
  mergeGeneratedTaskCatalogForRefresh,
} from "./team-console-generated-detail-policy";
import type {
  TeamDiscoveryDispatchDiagnostic,
  TeamDiscoveryDispatchProgress,
  TeamDiscoverySummary,
} from "./team-console-discovery-refresh";
import {
  discoveryRootTasks,
  flattenGeneratedTasks,
  readDiscoveryDispatchForTasks,
  summarizeDiscoveryCatalogs,
} from "./team-console-discovery-refresh";
import {
  selectOpenDiscoveryRootIds,
  selectDiscoveryCatalogTaskIdsToLoad,
  pruneDiscoverySubscriptionStateForOpenIds,
} from "./team-console-discovery-subscription";

export { mergeTaskRun } from "./team-console-live-refresh-state";
export type { TeamDiscoveryDispatchDiagnostic, TeamDiscoveryStage, TeamDiscoverySummary } from "./team-console-discovery-refresh";

export type DataSource = "mock" | "live";
export type TeamConsoleUiResetReason =
  | "mock-fixture"
  | "mock-workspace"
  | "live-workspace-loading";

const DATA_SOURCE_STORAGE_KEY = "ugk-team-console:data-source";
const DISCOVERY_CATALOG_REFRESH_DELAYS_MS = [350, 1200, 3000, 8000, 15000, 30000, 60000, 120000, 180000, 300000];

export const CLEAN_AGENT_WORKSPACE_ID = "agent-workspace";

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as TeamApiError).message);
  }
  if (error instanceof Error) return error.message;
  return "未知错误";
}

function readStoredDataSource(): DataSource {
  try {
    return globalThis.localStorage?.getItem(DATA_SOURCE_STORAGE_KEY) === "live" ? "live" : "mock";
  } catch {
    return "mock";
  }
}

function agentRunStatusRecord(statuses: AgentRunStatus[]): Record<string, AgentRunStatus> {
  return Object.fromEntries(statuses.map((status) => [status.agentId, status]));
}

type TeamConsoleTaskRunSummaryApi = Pick<LiveTeamApi, "listTaskRunsByTaskIds">;

type TeamConsoleRootSummaryApi = Pick<LiveTeamApi,
  | "getRootSummary"
  | "listTaskCatalog"
  | "listTaskConnections"
  | "listTaskDependencies"
  | "listTaskGroups"
  | "listSourceNodes"
  | "listSourceConnections"
  | "listTaskRunsByTaskIds"
>;

type TeamConsoleDiscoveryCatalogApi = Pick<LiveTeamApi,
  | "listGeneratedTaskSummaryCatalog"
  | "listTaskRunsByTaskIds"
  | "listTaskRunAttempts"
>;

type DiscoveryCatalogLoadResult = {
  generatedTasksByDiscoveryTaskId: Record<string, TeamCanvasTask[]>;
  deletedGeneratedTaskIdsByDiscoveryTaskId: Record<string, string[]>;
  generatedCatalogServerVersionByTaskId: Record<string, string | null>;
  generatedRunSummaryServerVersionByTaskId: Record<string, string | null>;
  taskRunsByTaskId: Record<string, TeamRunState[]>;
  deletedRunIdsByTaskId: Record<string, string[]>;
  discoveryDispatchDiagnosticsByTaskId: Record<string, TeamDiscoveryDispatchDiagnostic[]>;
  discoveryDispatchProgressByTaskId: Record<string, TeamDiscoveryDispatchProgress>;
  error: string | null;
};

type TaskRunLoadResult = {
  runsByTaskId: Record<string, TeamRunState[]>;
  deletedRunIdsByTaskId: Record<string, string[]>;
  serverVersion: string | null;
};

type RootSummaryLoadResult = {
  taskCatalog: {
    tasks: TeamCanvasTask[];
    deletedTaskIds: string[];
    serverVersion: string | null;
  };
  taskRuns: TaskRunLoadResult;
  taskConnections: TeamTaskConnection[];
  taskDependencies: TeamTaskDependency[];
  teamTaskGroups: ResolvedTeamTaskGroup[];
  sourceNodes: TeamCanvasSourceNode[];
  sourceConnections: TeamCanvasSourceConnection[];
};

export interface UseTeamConsoleLiveDataOptions {
  onApplyLiveTasks: (tasks: TeamCanvasTask[]) => void;
  onApplyLiveSources: (sources: TeamCanvasSourceNode[]) => void;
  onCloseBranches: () => void;
  onResetContextUi: (reason: TeamConsoleUiResetReason) => void;
  selectedTaskId: string | null;
  openDiscoveryTaskIds: string[];
}

export interface UseTeamConsoleLiveDataReturn {
  dataSource: DataSource;
  setDataSource: React.Dispatch<React.SetStateAction<DataSource>>;
  selectedFixtureId: string;
  setSelectedFixtureId: React.Dispatch<React.SetStateAction<string>>;

  loading: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  liveTasksRefreshing: boolean;

  agents: AgentSummary[];
  agentRunStatusById: Record<string, AgentRunStatus>;
  plan: TeamPlan | null;
  run: RunDetail | null;
  attemptsByTaskId: Record<string, TeamAttemptMetadata[]>;
  tasks: TeamCanvasTask[];
  taskConnections: TeamTaskConnection[];
  taskDependencies: TeamTaskDependency[];
  teamTaskGroups: ResolvedTeamTaskGroup[];
  sourceNodes: TeamCanvasSourceNode[];
  sourceConnections: TeamCanvasSourceConnection[];
  taskRunsByTaskId: Record<string, TeamRunState[]>;
  generatedTasksByDiscoveryTaskId: Record<string, TeamCanvasTask[]>;
  discoverySummariesByTaskId: Record<string, TeamDiscoverySummary>;
  discoveryDispatchDiagnosticsByTaskId: Record<string, TeamDiscoveryDispatchDiagnostic[]>;

  refreshLiveTasks: (options?: { silent?: boolean }) => Promise<void>;
  scheduleLiveTaskDiscoveryRefresh: () => void;
  refreshLiveTasksAfterLeavingTaskCreateBranch: (branch: { mode?: string } | null) => void;
  readAttemptFile: (runId: string, taskId: string, attemptId: string, fileName: string) => Promise<string>;
  setTaskRunsByTaskId: React.Dispatch<React.SetStateAction<Record<string, TeamRunState[]>>>;
  setGeneratedTasksByDiscoveryTaskId: React.Dispatch<React.SetStateAction<Record<string, TeamCanvasTask[]>>>;
  setTaskConnections: React.Dispatch<React.SetStateAction<TeamTaskConnection[]>>;
  setTaskDependencies: React.Dispatch<React.SetStateAction<TeamTaskDependency[]>>;
  setTeamTaskGroups: React.Dispatch<React.SetStateAction<ResolvedTeamTaskGroup[]>>;
  setSourceNodes: React.Dispatch<React.SetStateAction<TeamCanvasSourceNode[]>>;
  setSourceConnections: React.Dispatch<React.SetStateAction<TeamCanvasSourceConnection[]>>;
  setTasks: React.Dispatch<React.SetStateAction<TeamCanvasTask[]>>;
  markGeneratedTaskReplaced: (taskId: string) => void;
  markGeneratedTaskArchived: (taskId: string) => void;
  ensureGeneratedTaskDetail: (taskId: string) => Promise<TeamCanvasTask | null>;
}

export function useTeamConsoleLiveData(options: UseTeamConsoleLiveDataOptions): UseTeamConsoleLiveDataReturn {
  const { onApplyLiveTasks, onApplyLiveSources, onCloseBranches, onResetContextUi, selectedTaskId, openDiscoveryTaskIds } = options;

  const [dataSource, setDataSource] = useState<DataSource>(() => readStoredDataSource());
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>(CLEAN_AGENT_WORKSPACE_ID);
  const [plan, setPlan] = useState<TeamPlan | null>(null);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [attemptsByTaskId, setAttemptsByTaskId] = useState<Record<string, TeamAttemptMetadata[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [agents, setAgents] = useState<AgentSummary[]>(MOCK_AGENTS);
  const [agentRunStatusById, setAgentRunStatusById] = useState<Record<string, AgentRunStatus>>(
    () => agentRunStatusRecord(MOCK_AGENT_RUN_STATUSES),
  );
  const [tasks, setTasks] = useState<TeamCanvasTask[]>([]);
  const [taskConnections, setTaskConnections] = useState<TeamTaskConnection[]>([]);
  const [taskDependencies, setTaskDependencies] = useState<TeamTaskDependency[]>([]);
  const [teamTaskGroups, setTeamTaskGroups] = useState<ResolvedTeamTaskGroup[]>([]);
  const [sourceNodes, setSourceNodes] = useState<TeamCanvasSourceNode[]>([]);
  const [sourceConnections, setSourceConnections] = useState<TeamCanvasSourceConnection[]>([]);
  const [taskRunsByTaskId, setTaskRunsByTaskId] = useState<Record<string, TeamRunState[]>>({});
  const [generatedTasksByDiscoveryTaskId, setGeneratedTasksByDiscoveryTaskId] = useState<Record<string, TeamCanvasTask[]>>({});
  const [discoveryDispatchDiagnosticsByTaskId, setDiscoveryDispatchDiagnosticsByTaskId] = useState<Record<string, TeamDiscoveryDispatchDiagnostic[]>>({});
  const [discoveryDispatchProgressByTaskId, setDiscoveryDispatchProgressByTaskId] = useState<Record<string, TeamDiscoveryDispatchProgress>>({});
  const [liveTasksRefreshing, setLiveTasksRefreshing] = useState(false);
  const liveTasksRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const liveTaskCatalogVersionRef = useRef<string | null>(null);
  const liveTaskRunSummaryVersionRef = useRef<string | null>(null);
  const lastCatalogErrorRef = useRef<string | null>(null);
  const liveTaskDiscoveryRefreshTimersRef = useRef<ReturnType<typeof globalThis.setTimeout>[]>([]);
  const liveTaskDiscoveryRefreshRunIdsRef = useRef<Set<string>>(new Set());
  const openDiscoveryTaskIdsRef = useRef<string[]>(openDiscoveryTaskIds);
  openDiscoveryTaskIdsRef.current = openDiscoveryTaskIds;
  const tasksRef = useRef<TeamCanvasTask[]>(tasks);
  tasksRef.current = tasks;
  const recentlyReplacedGeneratedTaskIdsRef = useRef<Set<string>>(new Set());
  const locallyArchivedGeneratedTaskIdsRef = useRef<Set<string>>(new Set());
  const loadedDiscoveryCatalogTaskIdsRef = useRef<Set<string>>(new Set());
  const loadingDiscoveryCatalogTaskIdsRef = useRef<Set<string>>(new Set());
  const generatedCatalogVersionByDiscoveryTaskIdRef = useRef<Record<string, string | null>>({});
  const generatedRunSummaryVersionByDiscoveryTaskIdRef = useRef<Record<string, string | null>>({});
  const generatedTaskDetailInFlightRef = useRef<Map<string, Promise<TeamCanvasTask | null>>>(new Map());
  const generatedTaskDetailCacheRef = useRef<Map<string, TeamCanvasTask>>(new Map());
  const generatedTasksByDiscoveryTaskIdRef = useRef<Record<string, TeamCanvasTask[]>>(generatedTasksByDiscoveryTaskId);
  generatedTasksByDiscoveryTaskIdRef.current = generatedTasksByDiscoveryTaskId;
  const discoverySummariesByTaskId = useMemo(() => summarizeDiscoveryCatalogs(
    generatedTasksByDiscoveryTaskId,
    taskRunsByTaskId,
    discoveryDispatchDiagnosticsByTaskId,
    discoveryDispatchProgressByTaskId,
  ), [discoveryDispatchDiagnosticsByTaskId, discoveryDispatchProgressByTaskId, generatedTasksByDiscoveryTaskId, taskRunsByTaskId]);

  // Persist dataSource to localStorage
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(DATA_SOURCE_STORAGE_KEY, dataSource);
    } catch {}
  }, [dataSource]);

  const applyLiveTasks = useCallback((nextTasks: TeamCanvasTask[]) => {
    const mergedTasks = mergeTaskCatalog(tasksRef.current, nextTasks);
    tasksRef.current = mergedTasks;
    setTasks(mergedTasks);
    onApplyLiveTasks(mergedTasks);
  }, [onApplyLiveTasks]);

  const applyLiveSources = useCallback((nextSources: TeamCanvasSourceNode[]) => {
    const activeSources = nextSources.filter((sourceNode) => !sourceNode.archived);
    setSourceNodes(activeSources);
    onApplyLiveSources(activeSources);
  }, [onApplyLiveSources]);

  const readTaskRunsForTasks = useCallback(async (
    api: TeamConsoleTaskRunSummaryApi,
    nextTasks: TeamCanvasTask[],
    since?: string | null,
  ): Promise<TaskRunLoadResult> => {
    if (nextTasks.length === 0) return { runsByTaskId: {}, deletedRunIdsByTaskId: {}, serverVersion: null };
    const taskIds = nextTasks.map((task) => task.taskId);
    try {
      const { runsByTaskId, deletedRunIdsByTaskId, serverVersion } = await api.listTaskRunsByTaskIds(taskIds, {
        limit: 1,
        view: "summary",
        ...(since ? { since } : {}),
      });
      const sorted: Record<string, TeamRunState[]> = {};
      if (since) {
        for (const [taskId, runs] of Object.entries(runsByTaskId)) {
          if (runs.length > 0) sorted[taskId] = sortRunsByCreatedAt(runs);
        }
      } else {
        for (const taskId of taskIds) {
          sorted[taskId] = sortRunsByCreatedAt(runsByTaskId[taskId] ?? []);
        }
      }
      return {
        runsByTaskId: sorted,
        deletedRunIdsByTaskId: deletedRunIdsByTaskId ?? {},
        serverVersion: serverVersion ?? null,
      };
    } catch {
      return {
        runsByTaskId: since ? {} : Object.fromEntries(taskIds.map((taskId) => [taskId, [] as TeamRunState[]])),
        deletedRunIdsByTaskId: {},
        serverVersion: null,
      };
    }
  }, []);

  const readTaskGroups = useCallback(async (
    api: Pick<LiveTeamApi, "listTaskGroups">,
  ): Promise<ResolvedTeamTaskGroup[]> => {
    try {
      return await api.listTaskGroups();
    } catch {
      return [];
    }
  }, []);

  const readRootSummary = useCallback(async (
    api: TeamConsoleRootSummaryApi,
    taskSince?: string | null,
    runSince?: string | null,
  ): Promise<RootSummaryLoadResult> => {
    try {
      const [summary, nextGroups] = await Promise.all([
        api.getRootSummary({
          ...(taskSince ? { taskSince } : {}),
          ...(runSince ? { runSince } : {}),
        }),
        readTaskGroups(api),
      ]);
      return {
        taskCatalog: {
          tasks: summary.tasks,
          deletedTaskIds: summary.deletedTaskIds ?? [],
          serverVersion: summary.serverVersion.taskCatalog ?? null,
        },
        taskRuns: {
          runsByTaskId: summary.taskRunsByTaskId,
          deletedRunIdsByTaskId: summary.deletedRunIdsByTaskId ?? {},
          serverVersion: summary.serverVersion.taskRunSummary ?? null,
        },
        taskConnections: summary.taskConnections,
        taskDependencies: summary.taskDependencies,
        teamTaskGroups: nextGroups,
        sourceNodes: summary.sourceNodes,
        sourceConnections: summary.sourceConnections,
      };
    } catch {
      const [taskCatalog, nextConnections, nextDeps, nextGroups, nextSourceNodes, nextSourceConns] = await Promise.all([
        api.listTaskCatalog(taskSince ? { since: taskSince } : undefined),
        api.listTaskConnections(),
        api.listTaskDependencies(),
        readTaskGroups(api),
        api.listSourceNodes(),
        api.listSourceConnections(),
      ]);
      const currentTasks = taskSince
        ? mergeTaskCatalogIncremental(tasksRef.current, taskCatalog.tasks, taskCatalog.deletedTaskIds ?? [])
        : taskCatalog.tasks;
      return {
        taskCatalog: {
          tasks: taskCatalog.tasks,
          deletedTaskIds: taskCatalog.deletedTaskIds ?? [],
          serverVersion: taskCatalog.serverVersion ?? null,
        },
        taskRuns: await readTaskRunsForTasks(api, currentTasks, runSince),
        taskConnections: nextConnections,
        taskDependencies: nextDeps,
        teamTaskGroups: nextGroups,
        sourceNodes: nextSourceNodes,
        sourceConnections: nextSourceConns,
      };
    }
  }, [readTaskGroups, readTaskRunsForTasks]);

  const loadDiscoveryCatalogsForTaskIds = useCallback(async (
    api: TeamConsoleDiscoveryCatalogApi,
    rootTasks: TeamCanvasTask[],
    discoveryTaskIds: string[],
  ): Promise<DiscoveryCatalogLoadResult> => {
    const allDiscoveryRoots = discoveryRootTasks(rootTasks);
    const requestedRoots = allDiscoveryRoots.filter((task) => discoveryTaskIds.includes(task.taskId));
    if (requestedRoots.length === 0) {
      return {
        generatedTasksByDiscoveryTaskId: {},
        deletedGeneratedTaskIdsByDiscoveryTaskId: {},
        generatedCatalogServerVersionByTaskId: {},
        generatedRunSummaryServerVersionByTaskId: {},
        taskRunsByTaskId: {},
        deletedRunIdsByTaskId: {},
        discoveryDispatchDiagnosticsByTaskId: {},
        discoveryDispatchProgressByTaskId: {},
        error: null,
      };
    }

    let firstCatalogError: string | null = null;
    const generatedEntries = await Promise.all(requestedRoots.map(async (task) => {
      try {
        const since = loadedDiscoveryCatalogTaskIdsRef.current.has(task.taskId)
          ? generatedCatalogVersionByDiscoveryTaskIdRef.current[task.taskId]
          : null;
        const catalog = await api.listGeneratedTaskSummaryCatalog(task.taskId, {
          ...(since ? { since } : {}),
        });
        return [task.taskId, {
          tasks: catalog.tasks as unknown as TeamCanvasTask[],
          deletedTaskIds: catalog.deletedTaskIds ?? [],
          serverVersion: catalog.serverVersion ?? null,
          incremental: Boolean(since),
        }] as const;
      } catch (e) {
        firstCatalogError ??= errorMessage(e);
        return [task.taskId, {
          tasks: [] as TeamCanvasTask[],
          deletedTaskIds: [] as string[],
          serverVersion: null,
          incremental: loadedDiscoveryCatalogTaskIdsRef.current.has(task.taskId),
        }] as const;
      }
    }));
    const nextGeneratedTasksByDiscoveryTaskId = Object.fromEntries(generatedEntries.map(([taskId, result]) => {
      const current = generatedTasksByDiscoveryTaskIdRef.current[taskId] ?? [];
      const next = result.incremental
        ? mergeGeneratedTaskCatalogIncremental(current, result.tasks, result.deletedTaskIds)
        : result.tasks;
      return [taskId, next];
    }));
    const deletedGeneratedTaskIdsByDiscoveryTaskId = Object.fromEntries(
      generatedEntries.map(([taskId, result]) => [taskId, result.deletedTaskIds]),
    );
    const generatedCatalogServerVersionByTaskId = Object.fromEntries(
      generatedEntries.map(([taskId, result]) => [taskId, result.serverVersion]),
    );
    const allGenerated = flattenGeneratedTasks(nextGeneratedTasksByDiscoveryTaskId);
    const runSinceValues = requestedRoots
      .map((task) => generatedRunSummaryVersionByDiscoveryTaskIdRef.current[task.taskId])
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    const runSince = runSinceValues.length > 0 ? runSinceValues.sort().at(0) : null;
    const nextTaskRunLoad = await readTaskRunsForTasks(api, [...requestedRoots, ...allGenerated], runSince);
    const nextDiscoveryDispatch = await readDiscoveryDispatchForTasks(
      api,
      requestedRoots,
      nextTaskRunLoad.runsByTaskId,
    );
    const generatedRunSummaryServerVersionByTaskId = Object.fromEntries(
      requestedRoots.map((task) => [task.taskId, nextTaskRunLoad.serverVersion]),
    );
    return {
      generatedTasksByDiscoveryTaskId: nextGeneratedTasksByDiscoveryTaskId,
      deletedGeneratedTaskIdsByDiscoveryTaskId,
      generatedCatalogServerVersionByTaskId,
      generatedRunSummaryServerVersionByTaskId,
      taskRunsByTaskId: nextTaskRunLoad.runsByTaskId,
      deletedRunIdsByTaskId: nextTaskRunLoad.deletedRunIdsByTaskId,
      discoveryDispatchDiagnosticsByTaskId: nextDiscoveryDispatch.diagnosticsByTaskId,
      discoveryDispatchProgressByTaskId: nextDiscoveryDispatch.progressByTaskId,
      error: firstCatalogError,
    };
  }, [readTaskRunsForTasks]);

  const loadAllDiscoveryCatalogs = useCallback(async (
    api: TeamConsoleDiscoveryCatalogApi,
    nextTasks: TeamCanvasTask[],
  ): Promise<DiscoveryCatalogLoadResult> => {
    const discoveryTasks = discoveryRootTasks(nextTasks);
    return loadDiscoveryCatalogsForTaskIds(api, nextTasks, discoveryTasks.map((t) => t.taskId));
  }, [loadDiscoveryCatalogsForTaskIds]);

  const mergeDiscoveryCatalogLoadResult = useCallback((result: DiscoveryCatalogLoadResult) => {
    const replaced = recentlyReplacedGeneratedTaskIdsRef.current;
    const archivedIds = locallyArchivedGeneratedTaskIdsRef.current;
    setGeneratedTasksByDiscoveryTaskId((current) => {
      const merged = { ...current };
      for (const [discoveryId, incomingTasks] of Object.entries(result.generatedTasksByDiscoveryTaskId)) {
        const deletedIds = result.deletedGeneratedTaskIdsByDiscoveryTaskId[discoveryId] ?? [];
        const existingTasks = current[discoveryId] ?? [];
        merged[discoveryId] = mergeGeneratedTaskCatalogForRefresh(existingTasks, incomingTasks, {
          deletedTaskIds: deletedIds.length > 0 ? deletedIds : undefined,
          locallyArchivedTaskIds: archivedIds,
          recentlyReplacedTaskIds: replaced,
        });
      }
      return merged;
    });
    setTaskRunsByTaskId((current) => {
      let next = current;
      const deletedGeneratedIds = Object.values(result.deletedGeneratedTaskIdsByDiscoveryTaskId).flat();
      if (deletedGeneratedIds.length > 0) {
        const copy = { ...next };
        let changed = false;
        for (const taskId of deletedGeneratedIds) {
          if (taskId in copy) {
            delete copy[taskId];
            changed = true;
          }
        }
        if (changed) next = copy;
      }
      return mergeTaskRunMapIncremental(next, result.taskRunsByTaskId, result.deletedRunIdsByTaskId);
    });
    setDiscoveryDispatchDiagnosticsByTaskId((current) => ({
      ...current,
      ...result.discoveryDispatchDiagnosticsByTaskId,
    }));
    setDiscoveryDispatchProgressByTaskId((current) => ({
      ...current,
      ...result.discoveryDispatchProgressByTaskId,
    }));
    for (const [taskId, version] of Object.entries(result.generatedCatalogServerVersionByTaskId)) {
      if (version) generatedCatalogVersionByDiscoveryTaskIdRef.current[taskId] = version;
    }
    for (const [taskId, version] of Object.entries(result.generatedRunSummaryServerVersionByTaskId)) {
      if (version) generatedRunSummaryVersionByDiscoveryTaskIdRef.current[taskId] = version;
    }
    if (result.error) {
      lastCatalogErrorRef.current = result.error;
      setError(result.error);
    } else {
      setError((current) => current === lastCatalogErrorRef.current ? null : current);
      lastCatalogErrorRef.current = null;
    }
  }, []);

  const refreshDiscoveryCatalogForTaskId = useCallback((
    api: TeamConsoleDiscoveryCatalogApi,
    rootTasks: TeamCanvasTask[],
    discoveryTaskId: string,
  ) => {
    void loadDiscoveryCatalogsForTaskIds(api, rootTasks, [discoveryTaskId])
      .then((discoveryCatalogResult) => {
        if (!openDiscoveryTaskIdsRef.current.includes(discoveryTaskId)) return;
        mergeDiscoveryCatalogLoadResult(discoveryCatalogResult);
        if (!discoveryCatalogResult.error && discoveryCatalogResult.generatedTasksByDiscoveryTaskId[discoveryTaskId]) {
          loadedDiscoveryCatalogTaskIdsRef.current.add(discoveryTaskId);
        }
      })
      .catch((e) => setError(errorMessage(e)));
  }, [loadDiscoveryCatalogsForTaskIds, mergeDiscoveryCatalogLoadResult]);

  const refreshOpenDiscoveryCatalogs = useCallback((
    api: TeamConsoleDiscoveryCatalogApi,
    rootTasks: TeamCanvasTask[],
    discoveryTaskIds: string[],
  ) => {
    const validOpenIds = selectOpenDiscoveryRootIds(rootTasks, discoveryTaskIds);
    if (validOpenIds.length === 0) return;
    for (const discoveryTaskId of validOpenIds) {
      refreshDiscoveryCatalogForTaskId(api, rootTasks, discoveryTaskId);
    }
  }, [refreshDiscoveryCatalogForTaskId]);

  const refreshLiveTasks = useCallback(async (options: { silent?: boolean } = {}) => {
    const showRefreshState = options.silent !== true;
    if (liveTasksRefreshInFlightRef.current) {
      if (showRefreshState) setLiveTasksRefreshing(true);
      try {
        return await liveTasksRefreshInFlightRef.current;
      } finally {
        if (showRefreshState) setLiveTasksRefreshing(false);
      }
    }

    const refresh = (async () => {
      try {
        const api = new LiveTeamApi();
        const taskCatalogSince = liveTaskCatalogVersionRef.current;
        const runSummarySince = liveTaskRunSummaryVersionRef.current;
        const rootSummary = await readRootSummary(api, taskCatalogSince, runSummarySince);
        const taskCatalog = rootSummary.taskCatalog;
        const previousRootTaskIds = new Set(tasksRef.current.map((task) => task.taskId));
        const nextTasks = taskCatalogSince
          ? mergeTaskCatalogIncremental(tasksRef.current, taskCatalog.tasks, taskCatalog.deletedTaskIds ?? [])
          : taskCatalog.tasks;
        if (taskCatalog.serverVersion) {
          liveTaskCatalogVersionRef.current = taskCatalog.serverVersion;
        }
        applyLiveTasks(nextTasks);
        setTaskConnections(rootSummary.taskConnections);
        setTaskDependencies(rootSummary.taskDependencies);
        setTeamTaskGroups(rootSummary.teamTaskGroups.filter((group) => !group.archived));
        applyLiveSources(rootSummary.sourceNodes);
        setSourceConnections(rootSummary.sourceConnections);
        setError(null);
        const rootRunLoad = rootSummary.taskRuns;
        if (rootRunLoad.serverVersion) {
          liveTaskRunSummaryVersionRef.current = rootRunLoad.serverVersion;
        }
        setTaskRunsByTaskId((current) => {
          const nextRootTaskIds = new Set(nextTasks.map((task) => task.taskId));
          const withoutDeletedRootTasks = mergeRootTaskRunMap(current, {}, previousRootTaskIds, nextRootTaskIds);
          if (runSummarySince) {
            return mergeTaskRunMapIncremental(
              withoutDeletedRootTasks,
              rootRunLoad.runsByTaskId,
              rootRunLoad.deletedRunIdsByTaskId,
            );
          }
          return mergeRootTaskRunMap(current, rootRunLoad.runsByTaskId, previousRootTaskIds, nextRootTaskIds);
        });
        refreshOpenDiscoveryCatalogs(api, nextTasks, openDiscoveryTaskIdsRef.current);
      } finally {
        liveTasksRefreshInFlightRef.current = null;
      }
    })();
    liveTasksRefreshInFlightRef.current = refresh;
    if (showRefreshState) setLiveTasksRefreshing(true);
    try {
      return await refresh;
    } finally {
      if (showRefreshState) setLiveTasksRefreshing(false);
    }
  }, [applyLiveSources, applyLiveTasks, readRootSummary, refreshOpenDiscoveryCatalogs]);

  const scheduleLiveTaskDiscoveryRefresh = useCallback(() => {
    if (dataSource !== "live") return;
    for (const timer of liveTaskDiscoveryRefreshTimersRef.current) {
      globalThis.clearTimeout(timer);
    }
    liveTaskDiscoveryRefreshTimersRef.current = [];
    for (const delayMs of DISCOVERY_CATALOG_REFRESH_DELAYS_MS) {
      const timer = globalThis.setTimeout(() => {
        liveTaskDiscoveryRefreshTimersRef.current = liveTaskDiscoveryRefreshTimersRef.current.filter((item) => item !== timer);
        if (openDiscoveryTaskIdsRef.current.length === 0) return;
        const currentTasks = tasksRef.current;
        if (currentTasks.length === 0) return;
        const validOpenIds = selectOpenDiscoveryRootIds(currentTasks, openDiscoveryTaskIdsRef.current);
        if (validOpenIds.length === 0) return;
        const api = new LiveTeamApi();
        for (const discoveryTaskId of validOpenIds) {
          refreshDiscoveryCatalogForTaskId(api, currentTasks, discoveryTaskId);
        }
      }, delayMs);
      liveTaskDiscoveryRefreshTimersRef.current.push(timer);
    }
  }, [dataSource, refreshDiscoveryCatalogForTaskId]);

  // Cleanup discovery timers on unmount
  useEffect(() => () => {
    for (const timer of liveTaskDiscoveryRefreshTimersRef.current) {
      globalThis.clearTimeout(timer);
    }
    liveTaskDiscoveryRefreshTimersRef.current = [];
  }, []);

  const markGeneratedTaskReplaced = useCallback((taskId: string) => {
    recentlyReplacedGeneratedTaskIdsRef.current.add(taskId);
  }, []);

  const markGeneratedTaskArchived = useCallback((taskId: string) => {
    locallyArchivedGeneratedTaskIdsRef.current.add(taskId);
  }, []);

  const ensureGeneratedTaskDetail = useCallback(async (taskId: string): Promise<TeamCanvasTask | null> => {
    const detailKey = `${dataSource}:${taskId}`;
    const cached = generatedTaskDetailCacheRef.current.get(detailKey);
    if (cached) return cached;
    const allGenerated = Object.values(generatedTasksByDiscoveryTaskIdRef.current).flat();
    const existing = allGenerated.find((task) => task.taskId === taskId);
    if (existing && hasTaskDetail(existing)) return existing;
    const inFlight = generatedTaskDetailInFlightRef.current.get(detailKey);
    if (inFlight) return inFlight;
    const request = Promise.resolve().then(async () => {
      try {
        const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
        const fullTask = await api.getTask(taskId);
        if (!fullTask) return null;
        generatedTaskDetailCacheRef.current.set(detailKey, fullTask);
        const sourceDiscoveryTaskId = fullTask.generatedSource?.sourceDiscoveryTaskId;
        if (sourceDiscoveryTaskId) {
          setGeneratedTasksByDiscoveryTaskId((current) => {
            const catalog = current[sourceDiscoveryTaskId] ?? [];
            if (!catalog.some((task) => task.taskId === taskId)) return current;
            const next = {
              ...current,
              [sourceDiscoveryTaskId]: catalog.map((task) =>
                task.taskId === taskId ? fullTask : task
              ),
            };
            generatedTasksByDiscoveryTaskIdRef.current = next;
            return next;
          });
        }
        return fullTask;
      } catch (e) {
        setError(errorMessage(e));
        return null;
      } finally {
        globalThis.setTimeout(() => {
          generatedTaskDetailInFlightRef.current.delete(detailKey);
        }, 0);
      }
    });
    generatedTaskDetailInFlightRef.current.set(detailKey, request);
    return request;
  }, [dataSource]);

  // Clear discovery timers when switching away from live
  useEffect(() => {
    if (dataSource === "live") return;
    for (const timer of liveTaskDiscoveryRefreshTimersRef.current) {
      globalThis.clearTimeout(timer);
    }
    liveTaskDiscoveryRefreshTimersRef.current = [];
    liveTaskDiscoveryRefreshRunIdsRef.current.clear();
    loadedDiscoveryCatalogTaskIdsRef.current.clear();
    loadingDiscoveryCatalogTaskIdsRef.current.clear();
    generatedCatalogVersionByDiscoveryTaskIdRef.current = {};
    generatedRunSummaryVersionByDiscoveryTaskIdRef.current = {};
  }, [dataSource]);

  const refreshLiveTasksAfterLeavingTaskCreateBranch = useCallback((branch: { mode?: string } | null) => {
    if (dataSource !== "live" || branch?.mode !== "task-create") return;
    void refreshLiveTasks({ silent: true }).catch((e) => setError(errorMessage(e)));
  }, [dataSource, refreshLiveTasks]);

  // Mock fixture loading
  useEffect(() => {
    if (dataSource === "mock") {
      if (selectedFixtureId === CLEAN_AGENT_WORKSPACE_ID) {
        onResetContextUi("mock-workspace");
        setPlan(null);
        setRun(null);
        setAttemptsByTaskId({});
        setError(null);
        setLoading(false);
      } else {
        const entry = ALL_FIXTURES.find((fixture) => fixture.id === selectedFixtureId);
        if (entry) {
          onResetContextUi("mock-fixture");
          setPlan(entry.plan);
          setRun(entry.run);
          setAttemptsByTaskId({});
          setError(null);
          setLoading(false);
        }
      }
    }
  }, [dataSource, onResetContextUi, selectedFixtureId]);

  // Initial data load + agent run status polling
  useEffect(() => {
    onCloseBranches();
    let cancelled = false;
    let refreshTimer: ReturnType<typeof globalThis.setInterval> | undefined;
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();

    async function loadAgentRunStatuses() {
      try {
        const statuses = await api.listAgentRunStatuses();
        if (!cancelled) {
          setAgentRunStatusById(agentRunStatusRecord(statuses));
        }
      } catch {
        // Keep the last known status on transient polling failures.
      }
    }

    if (dataSource === "mock") {
      const mockGeneratedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
      const mockGeneratedTasksByDiscoveryTaskId = {
        [mockDiscoveryRootTask.taskId]: mockGeneratedTasks,
      };
      const mockRootTasks = [...mockTeamTasks, mockDiscoveryRootTask];
      const mockApi = new MockTeamApi();
      setAgents(MOCK_AGENTS);
      setAgentRunStatusById(agentRunStatusRecord(MOCK_AGENT_RUN_STATUSES));
      setTasks(mockRootTasks);
      onApplyLiveTasks(mockRootTasks);
      setTaskConnections([]);
      setTaskDependencies([]);
      setTeamTaskGroups([]);
      setSourceNodes([]);
      setSourceConnections([]);
      setTaskRunsByTaskId({});
      setGeneratedTasksByDiscoveryTaskId(mockGeneratedTasksByDiscoveryTaskId);
      setDiscoveryDispatchDiagnosticsByTaskId({});
      setDiscoveryDispatchProgressByTaskId({});
      void loadAllDiscoveryCatalogs(mockApi, mockRootTasks).then((discoveryCatalogResult) => {
        if (cancelled) return;
        if (Object.keys(discoveryCatalogResult.discoveryDispatchDiagnosticsByTaskId).length > 0) {
          setDiscoveryDispatchDiagnosticsByTaskId(discoveryCatalogResult.discoveryDispatchDiagnosticsByTaskId);
        }
        if (Object.keys(discoveryCatalogResult.discoveryDispatchProgressByTaskId).length > 0) {
          setDiscoveryDispatchProgressByTaskId(discoveryCatalogResult.discoveryDispatchProgressByTaskId);
        }
        if (discoveryCatalogResult.error) {
          setError(discoveryCatalogResult.error);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    onResetContextUi("live-workspace-loading");
    setPlan(null);
    setRun(null);
    setAttemptsByTaskId({});
    setError(null);
    setLoading(false);
    setAgents([]);
    setAgentRunStatusById({});
    setTasks([]);
    setTaskConnections([]);
    setTaskDependencies([]);
    setTeamTaskGroups([]);
    setSourceNodes([]);
    setSourceConnections([]);
    setTaskRunsByTaskId({});
    setGeneratedTasksByDiscoveryTaskId({});
    setDiscoveryDispatchDiagnosticsByTaskId({});
    setDiscoveryDispatchProgressByTaskId({});
    liveTaskCatalogVersionRef.current = null;
    liveTaskRunSummaryVersionRef.current = null;
    generatedCatalogVersionByDiscoveryTaskIdRef.current = {};
    generatedRunSummaryVersionByDiscoveryTaskIdRef.current = {};

    async function loadLiveWorkspace() {
      try {
        const [nextAgents, nextStatuses, rootSummary] = await Promise.all([
          api.listAgents(),
          api.listAgentRunStatuses(),
          readRootSummary(api),
        ]);
        if (!cancelled) {
          const nextTasks = rootSummary.taskCatalog.tasks;
          if (rootSummary.taskCatalog.serverVersion) {
            liveTaskCatalogVersionRef.current = rootSummary.taskCatalog.serverVersion;
          }
          setAgents(nextAgents);
          setAgentRunStatusById(agentRunStatusRecord(nextStatuses));
          applyLiveTasks(nextTasks);
          setTaskConnections(rootSummary.taskConnections);
          setTaskDependencies(rootSummary.taskDependencies);
          setTeamTaskGroups(rootSummary.teamTaskGroups.filter((group) => !group.archived));
          applyLiveSources(rootSummary.sourceNodes);
          setSourceConnections(rootSummary.sourceConnections);
          if (rootSummary.taskRuns.serverVersion) {
            liveTaskRunSummaryVersionRef.current = rootSummary.taskRuns.serverVersion;
          }
          setTaskRunsByTaskId(rootSummary.taskRuns.runsByTaskId);
        }
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e));
        }
      }
    }

    void loadLiveWorkspace();
    refreshTimer = globalThis.setInterval(() => {
      void loadAgentRunStatuses();
    }, 3000);

    return () => {
      cancelled = true;
      if (refreshTimer !== undefined) {
        globalThis.clearInterval(refreshTimer);
      }
    };
  }, [applyLiveSources, applyLiveTasks, onCloseBranches, onResetContextUi, dataSource, onApplyLiveTasks, onApplyLiveSources, readRootSummary]);

  // Clear discovery refresh timers when all subcanvases close
  useEffect(() => {
    if (dataSource !== "live") return;
    const pruned = pruneDiscoverySubscriptionStateForOpenIds(
      {
        loadedTaskIds: loadedDiscoveryCatalogTaskIdsRef.current,
        loadingTaskIds: loadingDiscoveryCatalogTaskIdsRef.current,
        generatedCatalogVersionByTaskId: generatedCatalogVersionByDiscoveryTaskIdRef.current,
        generatedRunSummaryVersionByTaskId: generatedRunSummaryVersionByDiscoveryTaskIdRef.current,
      },
      openDiscoveryTaskIds,
    );
    loadedDiscoveryCatalogTaskIdsRef.current = pruned.loadedTaskIds;
    loadingDiscoveryCatalogTaskIdsRef.current = pruned.loadingTaskIds;
    generatedCatalogVersionByDiscoveryTaskIdRef.current = pruned.generatedCatalogVersionByTaskId;
    generatedRunSummaryVersionByDiscoveryTaskIdRef.current = pruned.generatedRunSummaryVersionByTaskId;
    if (pruned.shouldClearTimers) {
      for (const timer of liveTaskDiscoveryRefreshTimersRef.current) {
        globalThis.clearTimeout(timer);
      }
      liveTaskDiscoveryRefreshTimersRef.current = [];
    }
  }, [dataSource, openDiscoveryTaskIds]);

  // Lazy load Discovery generated catalogs for open subcanvases
  useEffect(() => {
    if (dataSource !== "live") return;
    if (openDiscoveryTaskIds.length === 0) return;
    if (tasks.length === 0) return;

    const idsToLoad = selectDiscoveryCatalogTaskIdsToLoad({
      rootTasks: tasks,
      openDiscoveryTaskIds,
      loadedTaskIds: loadedDiscoveryCatalogTaskIdsRef.current,
      loadingTaskIds: loadingDiscoveryCatalogTaskIdsRef.current,
    });
    if (idsToLoad.length === 0) return;

    const api = new LiveTeamApi();
    for (const taskId of idsToLoad) {
      loadingDiscoveryCatalogTaskIdsRef.current.add(taskId);
    }

    for (const discoveryTaskId of idsToLoad) {
      void loadDiscoveryCatalogsForTaskIds(api, tasks, [discoveryTaskId])
        .then((result) => {
          if (!openDiscoveryTaskIdsRef.current.includes(discoveryTaskId)) return;
          mergeDiscoveryCatalogLoadResult(result);
          if (!result.error && result.generatedTasksByDiscoveryTaskId[discoveryTaskId]) {
            loadedDiscoveryCatalogTaskIdsRef.current.add(discoveryTaskId);
          }
        })
        .catch(() => {
          // Transient failure during scoped Discovery catalog load.
        })
        .finally(() => {
          loadingDiscoveryCatalogTaskIdsRef.current.delete(discoveryTaskId);
        });
    }
  }, [dataSource, openDiscoveryTaskIds, tasks, loadDiscoveryCatalogsForTaskIds, mergeDiscoveryCatalogLoadResult]);

  // Attempts loading for selected task
  useEffect(() => {
    if (!run || !selectedTaskId || selectedTaskId === ROOT_ID) return;
    if (attemptsByTaskId[selectedTaskId]) return;

    let cancelled = false;
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();

    async function loadAttempts() {
      try {
        const attempts = await api.listAttempts(run!.runId, selectedTaskId!);
        if (!cancelled && attempts.length > 0) {
          setAttemptsByTaskId((current) => ({
            ...current,
            [selectedTaskId!]: attempts,
          }));
        }
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e));
        }
      }
    }

    void loadAttempts();

    return () => {
      cancelled = true;
    };
  }, [dataSource, run, selectedTaskId, attemptsByTaskId]);

  const readAttemptFile = useCallback(
    (runId: string, taskId: string, attemptId: string, fileName: string) => {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      return api.readAttemptFile(runId, taskId, attemptId, fileName);
    },
    [dataSource],
  );

  // Active task run polling
  useEffect(() => {
    const activeRunIds = Object.values(taskRunsByTaskId)
      .flat()
      .filter((taskRun) => isActiveRun(taskRun.status) && taskRun.source?.taskId)
      .map((taskRun) => ({ runId: taskRun.runId, taskId: taskRun.source!.taskId }));

    if (activeRunIds.length === 0) return;

    let cancelled = false;
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();

    async function refreshActiveTaskRuns() {
      for (const active of activeRunIds) {
        try {
          const fresh = await api.getTaskRun(active.runId, { view: "summary", taskId: active.taskId });
          if (!cancelled) {
            setTaskRunsByTaskId((current) => mergeTaskRun(current, active.taskId, fresh));
            if (dataSource === "live" && !isActiveRun(fresh.status) && !liveTaskDiscoveryRefreshRunIdsRef.current.has(fresh.runId)) {
              liveTaskDiscoveryRefreshRunIdsRef.current.add(fresh.runId);
              void refreshLiveTasks({ silent: true }).catch((e) => {
                if (!cancelled) setError(errorMessage(e));
              });
              scheduleLiveTaskDiscoveryRefresh();
            }
          }
        } catch {
          // Keep the last visible task run state on transient polling failures.
        }
      }
    }

    const timer = globalThis.setInterval(() => {
      void refreshActiveTaskRuns();
    }, 2000);
    void refreshActiveTaskRuns();

    return () => {
      cancelled = true;
      globalThis.clearInterval(timer);
    };
  }, [dataSource, refreshLiveTasks, scheduleLiveTaskDiscoveryRefresh, taskRunsByTaskId]);

  return {
    dataSource,
    setDataSource,
    selectedFixtureId,
    setSelectedFixtureId,
    loading,
    error,
    setError,
    liveTasksRefreshing,

    agents,
    agentRunStatusById,
    plan,
    run,
    attemptsByTaskId,
    tasks,
    taskConnections,
    taskDependencies,
    teamTaskGroups,
    sourceNodes,
    sourceConnections,
    taskRunsByTaskId,
    generatedTasksByDiscoveryTaskId,
    discoverySummariesByTaskId,
    discoveryDispatchDiagnosticsByTaskId,

    refreshLiveTasks,
    scheduleLiveTaskDiscoveryRefresh,
    refreshLiveTasksAfterLeavingTaskCreateBranch,
    readAttemptFile,
    setTaskRunsByTaskId,
    setGeneratedTasksByDiscoveryTaskId,
    setTaskConnections,
    setTaskDependencies,
    setTeamTaskGroups,
    setSourceNodes,
    setSourceConnections,
    setTasks,
    markGeneratedTaskReplaced,
    markGeneratedTaskArchived,
    ensureGeneratedTaskDetail,
  };
}
