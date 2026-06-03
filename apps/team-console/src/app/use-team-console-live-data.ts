import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { LiveTeamApi } from "../api/team-api";
import type { AgentRunStatus, AgentSummary, TeamCanvasSourceConnection, TeamCanvasSourceNode, TeamCanvasTask, TeamPlan, RunDetail, TeamApiError, TeamRunState, TeamAttemptMetadata, TeamTaskConnection, TeamTaskDependency, TeamTaskState } from "../api/team-types";
import { ALL_FIXTURES, MOCK_AGENTS, MOCK_AGENT_RUN_STATUSES, mockDiscoveryGeneratedTasks, mockDiscoveryRootTask, mockTeamTasks, MockTeamApi } from "../fixtures/team-fixtures";
import { ROOT_ID } from "../graph/execution-map-layout";
import { isActiveRun } from "../shared/status";

export type DataSource = "mock" | "live";
export type TeamConsoleUiResetReason =
  | "mock-fixture"
  | "mock-workspace"
  | "live-workspace-loading";

const DATA_SOURCE_STORAGE_KEY = "ugk-team-console:data-source";
const DISCOVERY_CATALOG_REFRESH_DELAYS_MS = [350, 1200, 3000, 8000, 15000, 30000, 60000, 120000, 180000, 300000];

export const CLEAN_AGENT_WORKSPACE_ID = "agent-workspace";

export type TeamDiscoveryStage =
  | "idle"
  | "discovering"
  | "dispatching"
  | "auto-running"
  | "aggregating"
  | "completed"
  | "cancelled";

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

function selectLatestRun(runs: TeamRunState[]): TeamRunState | null {
  if (!runs.length) return null;
  return runs.reduce((latest, run) => {
    const latestTime = Date.parse(latest.createdAt);
    const runTime = Date.parse(run.createdAt);
    if (!Number.isFinite(runTime)) return latest;
    if (!Number.isFinite(latestTime)) return run;
    return runTime >= latestTime ? run : latest;
  }, runs[0]);
}

function sortRunsByCreatedAt(runs: TeamRunState[]): TeamRunState[] {
  return [...runs].sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);
    if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
    if (!Number.isFinite(aTime)) return 1;
    if (!Number.isFinite(bTime)) return -1;
    return bTime - aTime;
  });
}

function sameReferenceArray<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function generatedSourceIdentityKey(task: TeamCanvasTask): string {
  const source = task.generatedSource;
  if (!source) return "";
  const canResetToManaged = Boolean(
    source.latestManagedWorkUnit || (source as { canResetToManaged?: boolean }).canResetToManaged,
  );
  return [
    source.sourceDiscoveryTaskId,
    source.sourceItemId,
    source.itemStatus,
    source.latestDiscoveryRunId ?? "",
    source.latestDiscoveryAttemptId ?? "",
    source.latestDiscoveredAt ?? "",
    source.workUnitMode,
    canResetToManaged,
  ].join("|");
}

function taskCatalogIdentityKey(task: TeamCanvasTask): string {
  return [
    task.taskId,
    task.canvasKind ?? "",
    task.title,
    task.leaderAgentId,
    task.status,
    task.updatedAt,
    task.archived,
    generatedSourceIdentityKey(task),
  ].join("|");
}

function mergeTaskCatalog(current: TeamCanvasTask[], incoming: TeamCanvasTask[]): TeamCanvasTask[] {
  if (current.length === 0) return incoming;
  const currentById = new Map(current.map((task) => [task.taskId, task]));
  const next = incoming.map((task) => {
    const existing = currentById.get(task.taskId);
    return existing && taskCatalogIdentityKey(existing) === taskCatalogIdentityKey(task) ? existing : task;
  });
  return sameReferenceArray(current, next) ? current : next;
}

function mergeTaskCatalogIncremental(
  current: TeamCanvasTask[],
  incoming: TeamCanvasTask[],
  deletedTaskIds: string[] = [],
): TeamCanvasTask[] {
  if (current.length === 0) return incoming;
  const deleted = new Set(deletedTaskIds);
  const incomingById = new Map(incoming.map((task) => [task.taskId, task]));
  const mergedById = new Map<string, TeamCanvasTask>();
  for (const existing of current) {
    if (deleted.has(existing.taskId)) continue;
    const incomingTask = incomingById.get(existing.taskId);
    if (!incomingTask) {
      mergedById.set(existing.taskId, existing);
      continue;
    }
    mergedById.set(
      existing.taskId,
      taskCatalogIdentityKey(existing) === taskCatalogIdentityKey(incomingTask) ? existing : incomingTask,
    );
    incomingById.delete(existing.taskId);
  }
  for (const task of incomingById.values()) {
    if (!deleted.has(task.taskId)) mergedById.set(task.taskId, task);
  }
  const next = [...mergedById.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return sameReferenceArray(current, next) ? current : next;
}

function taskStateIdentityKey(state: TeamTaskState): string {
  return [
    state.status,
    state.manualDisposition ?? "",
    state.attemptCount,
    state.activeAttemptId ?? "",
    state.resultRef ?? "",
    state.errorSummary ?? "",
    state.progress.phase,
    state.progress.message,
    state.progress.updatedAt,
  ].join("|");
}

function runStateIdentityKey(run: TeamRunState): string {
  const taskStateKeys = Object.entries(run.taskStates)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([taskId, state]) => `${taskId}:${taskStateIdentityKey(state)}`)
    .join(";");
  return [
    run.runId,
    run.status,
    run.startedAt ?? "",
    run.finishedAt ?? "",
    run.currentTaskId ?? "",
    run.summary.totalTasks,
    run.summary.succeededTasks,
    run.summary.failedTasks,
    run.summary.cancelledTasks,
    run.summary.skippedTasks,
    taskStateKeys,
  ].join("|");
}

function mergeRunArray(current: TeamRunState[], incoming: TeamRunState[]): TeamRunState[] {
  const currentById = new Map(current.map((run) => [run.runId, run]));
  const next = sortRunsByCreatedAt(incoming.map((run) => {
    const existing = currentById.get(run.runId);
    return existing && runStateIdentityKey(existing) === runStateIdentityKey(run) ? existing : run;
  }));
  return sameReferenceArray(current, next) ? current : next;
}

function mergeTaskRunMap(
  current: Record<string, TeamRunState[]>,
  incoming: Record<string, TeamRunState[]>,
): Record<string, TeamRunState[]> {
  let changed = false;
  const next = { ...current };
  for (const [taskId, runs] of Object.entries(incoming)) {
    const mergedRuns = mergeRunArray(current[taskId] ?? [], runs);
    if (current[taskId] !== mergedRuns) {
      next[taskId] = mergedRuns;
      changed = true;
    }
  }
  return changed ? next : current;
}

function mergeTaskRunMapIncremental(
  current: Record<string, TeamRunState[]>,
  incoming: Record<string, TeamRunState[]>,
  deletedRunIdsByTaskId: Record<string, string[]> = {},
): Record<string, TeamRunState[]> {
  let changed = false;
  const next = { ...current };
  for (const [taskId, runIds] of Object.entries(deletedRunIdsByTaskId)) {
    if (runIds.length === 0 || !next[taskId]) continue;
    const deleted = new Set(runIds);
    const filtered = next[taskId].filter((run) => !deleted.has(run.runId));
    if (!sameReferenceArray(next[taskId], filtered)) {
      next[taskId] = filtered;
      changed = true;
    }
  }
  for (const [taskId, runs] of Object.entries(incoming)) {
    if (runs.length === 0) continue;
    const mergedRuns = mergeRunArray(next[taskId] ?? [], runs);
    if (next[taskId] !== mergedRuns) {
      next[taskId] = mergedRuns;
      changed = true;
    }
  }
  return changed ? next : current;
}

function mergeRootTaskRunMap(
  current: Record<string, TeamRunState[]>,
  incoming: Record<string, TeamRunState[]>,
  previousRootTaskIds: Set<string>,
  nextRootTaskIds: Set<string>,
): Record<string, TeamRunState[]> {
  let changed = false;
  const next = { ...current };
  for (const taskId of previousRootTaskIds) {
    if (!nextRootTaskIds.has(taskId) && taskId in next) {
      delete next[taskId];
      changed = true;
    }
  }
  const merged = mergeTaskRunMap(next, incoming);
  return changed || merged !== next ? merged : current;
}

export function mergeTaskRun(
  current: Record<string, TeamRunState[]>,
  taskId: string,
  runState: TeamRunState,
): Record<string, TeamRunState[]> {
  const runs = current[taskId] ?? [];
  const nextRuns = runs.some((run) => run.runId === runState.runId)
    ? runs.map((run) => {
        if (run.runId !== runState.runId) return run;
        return runStateIdentityKey(run) === runStateIdentityKey(runState) ? run : runState;
      })
    : [runState, ...runs];
  const sortedRuns = sortRunsByCreatedAt(nextRuns);
  return sameReferenceArray(runs, sortedRuns) ? current : { ...current, [taskId]: sortedRuns };
}

export interface TeamDiscoverySummary {
  stage: TeamDiscoveryStage;
  generatedTaskCount: number;
  activeGeneratedTaskCount: number;
  staleGeneratedTaskCount: number;
  runningGeneratedRunCount: number;
  completedGeneratedRunCount: number;
  failedDispatchCount: number;
  dispatchProcessedCount: number;
  latestDispatchRunId?: string;
  latestDispatchAttemptId?: string;
}

export interface TeamDiscoveryDispatchDiagnostic {
  itemId: string;
  status: "blocked";
  error: string | null;
  createdAt: string;
  runId: string;
  attemptId: string;
}

type TeamDiscoveryDispatchProgress = {
  processedCount: number;
  blockedCount: number;
  latestRunId?: string;
  latestAttemptId?: string;
};

type DiscoveryCatalogLoadResult = {
  generatedTasksByDiscoveryTaskId: Record<string, TeamCanvasTask[]>;
  taskRunsByTaskId: Record<string, TeamRunState[]>;
  discoveryDispatchDiagnosticsByTaskId: Record<string, TeamDiscoveryDispatchDiagnostic[]>;
  discoveryDispatchProgressByTaskId: Record<string, TeamDiscoveryDispatchProgress>;
  error: string | null;
};

type TaskRunLoadResult = {
  runsByTaskId: Record<string, TeamRunState[]>;
  deletedRunIdsByTaskId: Record<string, string[]>;
  serverVersion: string | null;
};

function discoveryRootTasks(tasks: TeamCanvasTask[]): TeamCanvasTask[] {
  return tasks.filter((task) => task.canvasKind === "discovery" && !task.generatedSource);
}

function flattenGeneratedTasks(generatedTasksByDiscoveryTaskId: Record<string, TeamCanvasTask[]>): TeamCanvasTask[] {
  return Object.values(generatedTasksByDiscoveryTaskId).flat();
}

function hasTaskDetail(task: TeamCanvasTask): boolean {
  return Boolean((task as Partial<TeamCanvasTask>).workUnit);
}

function mergeGeneratedTaskSummaryIntoFullTask(existing: TeamCanvasTask, incoming: TeamCanvasTask): TeamCanvasTask {
  return {
    ...existing,
    canvasKind: incoming.canvasKind ?? existing.canvasKind,
    title: incoming.title,
    leaderAgentId: incoming.leaderAgentId,
    status: incoming.status,
    createdAt: incoming.createdAt,
    updatedAt: incoming.updatedAt,
    archived: incoming.archived,
    generatedSource: existing.generatedSource && incoming.generatedSource
      ? {
          ...existing.generatedSource,
          ...incoming.generatedSource,
        }
      : existing.generatedSource,
  };
}

function summarizeDiscoveryCatalogs(
  generatedTasksByDiscoveryTaskId: Record<string, TeamCanvasTask[]>,
  taskRunsByTaskId: Record<string, TeamRunState[]>,
  discoveryDispatchDiagnosticsByTaskId: Record<string, TeamDiscoveryDispatchDiagnostic[]> = {},
  discoveryDispatchProgressByTaskId: Record<string, TeamDiscoveryDispatchProgress> = {},
): Record<string, TeamDiscoverySummary> {
  return Object.fromEntries(Object.entries(generatedTasksByDiscoveryTaskId).map(([discoveryTaskId, generatedTasks]) => [
    discoveryTaskId,
    (() => {
      const diagnostics = discoveryDispatchDiagnosticsByTaskId[discoveryTaskId] ?? [];
      const progress = discoveryDispatchProgressByTaskId[discoveryTaskId];
      const latestRootRun = selectLatestRun(taskRunsByTaskId[discoveryTaskId] ?? []);
      const runningGeneratedRunCount = generatedTasks.reduce((count, task) => (
        count + (taskRunsByTaskId[task.taskId] ?? []).filter((run) => isActiveRun(run.status)).length
      ), 0);
      const completedGeneratedRunCount = generatedTasks.reduce((count, task) => (
        count + (taskRunsByTaskId[task.taskId] ?? []).filter((run) => run.status === "completed").length
      ), 0);
      const dispatchProcessedCount = progress?.processedCount ?? diagnostics.length;
      const stage = discoveryStage({
        latestRootRun,
        generatedTaskCount: generatedTasks.length,
        runningGeneratedRunCount,
        dispatchProcessedCount,
      });
      return {
        stage,
        generatedTaskCount: generatedTasks.length,
        activeGeneratedTaskCount: generatedTasks.filter((task) => task.generatedSource?.itemStatus === "active").length,
        staleGeneratedTaskCount: generatedTasks.filter((task) => task.generatedSource?.itemStatus === "stale").length,
        runningGeneratedRunCount,
        completedGeneratedRunCount,
        failedDispatchCount: diagnostics.length,
        dispatchProcessedCount,
        ...(progress?.latestRunId ? { latestDispatchRunId: progress.latestRunId } : diagnostics[0]?.runId ? { latestDispatchRunId: diagnostics[0].runId } : {}),
        ...(progress?.latestAttemptId ? { latestDispatchAttemptId: progress.latestAttemptId } : diagnostics[0]?.attemptId ? { latestDispatchAttemptId: diagnostics[0].attemptId } : {}),
      };
    })(),
  ]));
}

function discoveryStage(input: {
  latestRootRun: TeamRunState | null;
  generatedTaskCount: number;
  runningGeneratedRunCount: number;
  dispatchProcessedCount: number;
}): TeamDiscoveryStage {
  const status = input.latestRootRun?.status;
  if (status === "cancelled") return "cancelled";
  if (status === "completed" || status === "completed_with_failures" || status === "failed") return "completed";
  if (input.runningGeneratedRunCount > 0) return "auto-running";
  if (input.generatedTaskCount > 0 && input.latestRootRun && isActiveRun(input.latestRootRun.status)) return "aggregating";
  if (input.dispatchProcessedCount > 0) return "dispatching";
  if (input.latestRootRun && isActiveRun(input.latestRootRun.status)) return "discovering";
  return "idle";
}

function attemptTime(attempt: TeamAttemptMetadata): number {
  const updatedAt = Date.parse(attempt.updatedAt);
  if (Number.isFinite(updatedAt)) return updatedAt;
  const createdAt = Date.parse(attempt.createdAt);
  return Number.isFinite(createdAt) ? createdAt : Number.NEGATIVE_INFINITY;
}

function selectLatestAttempt(attempts: TeamAttemptMetadata[]): TeamAttemptMetadata | null {
  if (!attempts.length) return null;
  return attempts.reduce((latest, attempt) => {
    const latestTime = attemptTime(latest);
    const currentTime = attemptTime(attempt);
    return currentTime >= latestTime ? attempt : latest;
  }, attempts[0]);
}

function blockedDispatchDiagnosticsFromAttempt(
  run: TeamRunState,
  attempt: TeamAttemptMetadata | null,
): TeamDiscoveryDispatchDiagnostic[] {
  if (!attempt || !Array.isArray(attempt.discoveryDispatch)) return [];
  return attempt.discoveryDispatch
    .filter((outcome) => outcome.status === "blocked")
    .map((outcome) => {
      const itemId = typeof outcome.itemId === "string" ? outcome.itemId.trim() : "";
      const error = typeof outcome.error === "string" && outcome.error.trim() ? outcome.error : null;
      const createdAt = typeof outcome.createdAt === "string" && outcome.createdAt
        ? outcome.createdAt
        : attempt.updatedAt || attempt.createdAt;
      return {
        itemId,
        status: "blocked" as const,
        error,
        createdAt,
        runId: run.runId,
        attemptId: attempt.attemptId,
      };
    })
    .filter((diagnostic) => diagnostic.itemId.length > 0);
}

function dispatchProgressFromAttempt(
  run: TeamRunState,
  attempt: TeamAttemptMetadata | null,
): TeamDiscoveryDispatchProgress {
  if (!attempt || !Array.isArray(attempt.discoveryDispatch)) return { processedCount: 0, blockedCount: 0 };
  return {
    processedCount: attempt.discoveryDispatch.length,
    blockedCount: attempt.discoveryDispatch.filter((outcome) => outcome.status === "blocked").length,
    latestRunId: run.runId,
    latestAttemptId: attempt.attemptId,
  };
}

async function readDiscoveryDispatchForTasks(
  api: Pick<LiveTeamApi, "listTaskRunAttempts">,
  discoveryTasks: TeamCanvasTask[],
  taskRunsByTaskId: Record<string, TeamRunState[]>,
): Promise<{
  diagnosticsByTaskId: Record<string, TeamDiscoveryDispatchDiagnostic[]>;
  progressByTaskId: Record<string, TeamDiscoveryDispatchProgress>;
}> {
  const entries = await Promise.all(discoveryTasks.map(async (task) => {
    const latestRun = selectLatestRun(taskRunsByTaskId[task.taskId] ?? []);
    if (!latestRun) {
      return [task.taskId, { diagnostics: [] as TeamDiscoveryDispatchDiagnostic[], progress: { processedCount: 0, blockedCount: 0 } }] as const;
    }
    try {
      const attempts = await api.listTaskRunAttempts(latestRun.runId, task.taskId, { view: "dispatch-diagnostics" });
      const latestAttempt = selectLatestAttempt(attempts);
      return [
        task.taskId,
        {
          diagnostics: blockedDispatchDiagnosticsFromAttempt(latestRun, latestAttempt),
          progress: dispatchProgressFromAttempt(latestRun, latestAttempt),
        },
      ] as const;
    } catch {
      return [task.taskId, { diagnostics: [] as TeamDiscoveryDispatchDiagnostic[], progress: { processedCount: 0, blockedCount: 0 } }] as const;
    }
  }));
  return {
    diagnosticsByTaskId: Object.fromEntries(entries.map(([taskId, result]) => [taskId, result.diagnostics])),
    progressByTaskId: Object.fromEntries(entries.map(([taskId, result]) => [taskId, result.progress])),
  };
}

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
    api: Pick<LiveTeamApi, "listTaskRunsByTaskIds">,
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

  const loadDiscoveryCatalogsForTaskIds = useCallback(async (
    api: Pick<LiveTeamApi, "listGeneratedTaskSummaries" | "listTaskRunsByTaskIds" | "listTaskRunAttempts">,
    rootTasks: TeamCanvasTask[],
    discoveryTaskIds: string[],
  ): Promise<DiscoveryCatalogLoadResult> => {
    const allDiscoveryRoots = discoveryRootTasks(rootTasks);
    const requestedRoots = allDiscoveryRoots.filter((task) => discoveryTaskIds.includes(task.taskId));
    if (requestedRoots.length === 0) {
      return {
        generatedTasksByDiscoveryTaskId: {},
        taskRunsByTaskId: {},
        discoveryDispatchDiagnosticsByTaskId: {},
        discoveryDispatchProgressByTaskId: {},
        error: null,
      };
    }

    let firstCatalogError: string | null = null;
    const generatedEntries = await Promise.all(requestedRoots.map(async (task) => {
      try {
        const summaries = await api.listGeneratedTaskSummaries(task.taskId);
        return [task.taskId, summaries as unknown as TeamCanvasTask[]] as const;
      } catch (e) {
        firstCatalogError ??= errorMessage(e);
        return [task.taskId, []] as const;
      }
    }));
    const nextGeneratedTasksByDiscoveryTaskId = Object.fromEntries(generatedEntries);
    const allGenerated = flattenGeneratedTasks(nextGeneratedTasksByDiscoveryTaskId);
    const nextTaskRunLoad = await readTaskRunsForTasks(api, [...requestedRoots, ...allGenerated]);
    const nextDiscoveryDispatch = await readDiscoveryDispatchForTasks(
      api,
      requestedRoots,
      nextTaskRunLoad.runsByTaskId,
    );
    return {
      generatedTasksByDiscoveryTaskId: nextGeneratedTasksByDiscoveryTaskId,
      taskRunsByTaskId: nextTaskRunLoad.runsByTaskId,
      discoveryDispatchDiagnosticsByTaskId: nextDiscoveryDispatch.diagnosticsByTaskId,
      discoveryDispatchProgressByTaskId: nextDiscoveryDispatch.progressByTaskId,
      error: firstCatalogError,
    };
  }, [readTaskRunsForTasks]);

  const loadAllDiscoveryCatalogs = useCallback(async (
    api: Pick<LiveTeamApi, "listGeneratedTaskSummaries" | "listTaskRunsByTaskIds" | "listTaskRunAttempts">,
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
        const existingTasks = current[discoveryId] ?? [];
        merged[discoveryId] = incomingTasks
          .filter((incoming) => !archivedIds.has(incoming.taskId))
          .map((incoming) => {
            const existing = existingTasks.find((t) => t.taskId === incoming.taskId);
            if (replaced.has(incoming.taskId) && existing && existing.updatedAt >= incoming.updatedAt) {
              return existing;
            }
            if (existing && taskCatalogIdentityKey(existing) === taskCatalogIdentityKey(incoming)) {
              return existing;
            }
            if (existing && hasTaskDetail(existing) && !hasTaskDetail(incoming)) {
              return mergeGeneratedTaskSummaryIntoFullTask(existing, incoming);
            }
            return incoming;
          });
      }
      return merged;
    });
    setTaskRunsByTaskId((current) => mergeTaskRunMap(current, result.taskRunsByTaskId));
    setDiscoveryDispatchDiagnosticsByTaskId((current) => ({
      ...current,
      ...result.discoveryDispatchDiagnosticsByTaskId,
    }));
    setDiscoveryDispatchProgressByTaskId((current) => ({
      ...current,
      ...result.discoveryDispatchProgressByTaskId,
    }));
    if (result.error) {
      lastCatalogErrorRef.current = result.error;
      setError(result.error);
    } else {
      setError((current) => current === lastCatalogErrorRef.current ? null : current);
      lastCatalogErrorRef.current = null;
    }
  }, []);

  const refreshDiscoveryCatalogForTaskId = useCallback((
    api: Pick<LiveTeamApi, "listGeneratedTaskSummaries" | "listTaskRunsByTaskIds" | "listTaskRunAttempts">,
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
    api: Pick<LiveTeamApi, "listGeneratedTaskSummaries" | "listTaskRunsByTaskIds" | "listTaskRunAttempts">,
    rootTasks: TeamCanvasTask[],
    discoveryTaskIds: string[],
  ) => {
    const discoveryRootIdSet = new Set(discoveryRootTasks(rootTasks).map((task) => task.taskId));
    const validOpenIds = discoveryTaskIds.filter((taskId) => discoveryRootIdSet.has(taskId));
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
        const [taskCatalog, nextConnections, nextDeps, nextSourceNodes, nextSourceConns] = await Promise.all([
          api.listTaskCatalog(taskCatalogSince ? { since: taskCatalogSince } : undefined),
          api.listTaskConnections(),
          api.listTaskDependencies(),
          api.listSourceNodes(),
          api.listSourceConnections(),
        ]);
        const previousRootTaskIds = new Set(tasksRef.current.map((task) => task.taskId));
        const nextTasks = taskCatalogSince
          ? mergeTaskCatalogIncremental(tasksRef.current, taskCatalog.tasks, taskCatalog.deletedTaskIds ?? [])
          : taskCatalog.tasks;
        if (taskCatalog.serverVersion) {
          liveTaskCatalogVersionRef.current = taskCatalog.serverVersion;
        }
        applyLiveTasks(nextTasks);
        setTaskConnections(nextConnections);
        setTaskDependencies(nextDeps);
        applyLiveSources(nextSourceNodes);
        setSourceConnections(nextSourceConns);
        setError(null);
        const runSummarySince = liveTaskRunSummaryVersionRef.current;
        const rootRunLoad = await readTaskRunsForTasks(api, nextTasks, runSummarySince);
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
  }, [applyLiveSources, applyLiveTasks, readTaskRunsForTasks, refreshOpenDiscoveryCatalogs]);

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
        const discoveryRootIdSet = new Set(discoveryRootTasks(currentTasks).map((t) => t.taskId));
        const validOpenIds = openDiscoveryTaskIdsRef.current.filter((id) => discoveryRootIdSet.has(id));
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
    setSourceNodes([]);
    setSourceConnections([]);
    setTaskRunsByTaskId({});
    setGeneratedTasksByDiscoveryTaskId({});
    setDiscoveryDispatchDiagnosticsByTaskId({});
    setDiscoveryDispatchProgressByTaskId({});
    liveTaskCatalogVersionRef.current = null;
    liveTaskRunSummaryVersionRef.current = null;

    async function loadLiveWorkspace() {
      try {
        const [nextAgents, nextStatuses, taskCatalog, nextConnections, nextDeps, nextSourceNodes, nextSourceConns] = await Promise.all([
          api.listAgents(),
          api.listAgentRunStatuses(),
          api.listTaskCatalog(),
          api.listTaskConnections(),
          api.listTaskDependencies(),
          api.listSourceNodes(),
          api.listSourceConnections(),
        ]);
        if (!cancelled) {
          const nextTasks = taskCatalog.tasks;
          if (taskCatalog.serverVersion) {
            liveTaskCatalogVersionRef.current = taskCatalog.serverVersion;
          }
          setAgents(nextAgents);
          setAgentRunStatusById(agentRunStatusRecord(nextStatuses));
          applyLiveTasks(nextTasks);
          setTaskConnections(nextConnections);
          setTaskDependencies(nextDeps);
          applyLiveSources(nextSourceNodes);
          setSourceConnections(nextSourceConns);
          const rootRunLoad = await readTaskRunsForTasks(api, nextTasks);
          if (!cancelled) {
            if (rootRunLoad.serverVersion) {
              liveTaskRunSummaryVersionRef.current = rootRunLoad.serverVersion;
            }
            setTaskRunsByTaskId(rootRunLoad.runsByTaskId);
          }
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
  }, [applyLiveSources, applyLiveTasks, onCloseBranches, onResetContextUi, dataSource, onApplyLiveTasks, onApplyLiveSources, readTaskRunsForTasks]);

  // Clear discovery refresh timers when all subcanvases close
  useEffect(() => {
    if (dataSource !== "live") return;
    const openSet = new Set(openDiscoveryTaskIds);
    for (const taskId of Array.from(loadedDiscoveryCatalogTaskIdsRef.current)) {
      if (!openSet.has(taskId)) loadedDiscoveryCatalogTaskIdsRef.current.delete(taskId);
    }
    for (const taskId of Array.from(loadingDiscoveryCatalogTaskIdsRef.current)) {
      if (!openSet.has(taskId)) loadingDiscoveryCatalogTaskIdsRef.current.delete(taskId);
    }
    if (openDiscoveryTaskIds.length === 0) {
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

    const discoveryRootIdSet = new Set(discoveryRootTasks(tasks).map((t) => t.taskId));
    const idsToLoad = openDiscoveryTaskIds.filter((id) =>
      discoveryRootIdSet.has(id)
      && !loadedDiscoveryCatalogTaskIdsRef.current.has(id)
      && !loadingDiscoveryCatalogTaskIdsRef.current.has(id)
    );
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
    setSourceNodes,
    setSourceConnections,
    setTasks,
    markGeneratedTaskReplaced,
    markGeneratedTaskArchived,
    ensureGeneratedTaskDetail,
  };
}
