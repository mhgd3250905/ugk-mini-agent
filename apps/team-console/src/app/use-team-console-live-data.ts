import { useState, useEffect, useCallback, useRef } from "react";
import { LiveTeamApi } from "../api/team-api";
import type { AgentRunStatus, AgentSummary, TeamCanvasSourceConnection, TeamCanvasSourceNode, TeamCanvasTask, TeamPlan, RunDetail, TeamApiError, TeamRunState, TeamAttemptMetadata, TeamTaskConnection, TeamTaskDependency } from "../api/team-types";
import { ALL_FIXTURES, MOCK_AGENTS, MOCK_AGENT_RUN_STATUSES, mockTeamTasks, MockTeamApi } from "../fixtures/team-fixtures";
import { ROOT_ID } from "../graph/execution-map-layout";
import { isActiveRun } from "../shared/status";

export type DataSource = "mock" | "live";
export type TeamConsoleUiResetReason =
  | "mock-fixture"
  | "mock-workspace"
  | "live-workspace-loading";

const DATA_SOURCE_STORAGE_KEY = "ugk-team-console:data-source";

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

export function mergeTaskRun(
  current: Record<string, TeamRunState[]>,
  taskId: string,
  runState: TeamRunState,
): Record<string, TeamRunState[]> {
  const runs = current[taskId] ?? [];
  const nextRuns = runs.some((run) => run.runId === runState.runId)
    ? runs.map((run) => run.runId === runState.runId ? runState : run)
    : [runState, ...runs];
  return {
    ...current,
    [taskId]: sortRunsByCreatedAt(nextRuns),
  };
}

export interface UseTeamConsoleLiveDataOptions {
  onApplyLiveTasks: (tasks: TeamCanvasTask[]) => void;
  onApplyLiveSources: (sources: TeamCanvasSourceNode[]) => void;
  onCloseBranches: () => void;
  onResetContextUi: (reason: TeamConsoleUiResetReason) => void;
  selectedTaskId: string | null;
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

  refreshLiveTasks: () => Promise<void>;
  scheduleLiveTaskDiscoveryRefresh: () => void;
  refreshLiveTasksAfterLeavingTaskCreateBranch: (branch: { mode?: string } | null) => void;
  readAttemptFile: (runId: string, taskId: string, attemptId: string, fileName: string) => Promise<string>;
  setTaskRunsByTaskId: React.Dispatch<React.SetStateAction<Record<string, TeamRunState[]>>>;
  setTaskConnections: React.Dispatch<React.SetStateAction<TeamTaskConnection[]>>;
  setTaskDependencies: React.Dispatch<React.SetStateAction<TeamTaskDependency[]>>;
  setSourceNodes: React.Dispatch<React.SetStateAction<TeamCanvasSourceNode[]>>;
  setSourceConnections: React.Dispatch<React.SetStateAction<TeamCanvasSourceConnection[]>>;
  setTasks: React.Dispatch<React.SetStateAction<TeamCanvasTask[]>>;
}

export function useTeamConsoleLiveData(options: UseTeamConsoleLiveDataOptions): UseTeamConsoleLiveDataReturn {
  const { onApplyLiveTasks, onApplyLiveSources, onCloseBranches, onResetContextUi, selectedTaskId } = options;

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
  const [liveTasksRefreshing, setLiveTasksRefreshing] = useState(false);
  const liveTasksRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const liveTaskDiscoveryRefreshTimersRef = useRef<ReturnType<typeof globalThis.setTimeout>[]>([]);
  const liveTaskDiscoveryRefreshRunIdsRef = useRef<Set<string>>(new Set());

  // Persist dataSource to localStorage
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(DATA_SOURCE_STORAGE_KEY, dataSource);
    } catch {}
  }, [dataSource]);

  const applyLiveTasks = useCallback((nextTasks: TeamCanvasTask[]) => {
    setTasks(nextTasks);
    onApplyLiveTasks(nextTasks);
  }, [onApplyLiveTasks]);

  const applyLiveSources = useCallback((nextSources: TeamCanvasSourceNode[]) => {
    const activeSources = nextSources.filter((sourceNode) => !sourceNode.archived);
    setSourceNodes(activeSources);
    onApplyLiveSources(activeSources);
  }, [onApplyLiveSources]);

  const loadTaskRunsForTasks = useCallback(async (
    api: Pick<LiveTeamApi, "listTaskRuns">,
    nextTasks: TeamCanvasTask[],
  ) => {
    const entries = await Promise.all(nextTasks.map(async (task) => {
      const runs = await api.listTaskRuns(task.taskId).catch(() => []);
      return [task.taskId, sortRunsByCreatedAt(runs)] as const;
    }));
    setTaskRunsByTaskId(Object.fromEntries(entries));
  }, []);

  const refreshLiveTasks = useCallback(async () => {
    if (liveTasksRefreshInFlightRef.current) {
      return liveTasksRefreshInFlightRef.current;
    }

    const refresh = (async () => {
      setLiveTasksRefreshing(true);
      try {
        const api = new LiveTeamApi();
        const [nextTasks, nextConnections, nextDeps, nextSourceNodes, nextSourceConns] = await Promise.all([
          api.listTasks(),
          api.listTaskConnections(),
          api.listTaskDependencies(),
          api.listSourceNodes(),
          api.listSourceConnections(),
        ]);
        applyLiveTasks(nextTasks);
        setTaskConnections(nextConnections);
        setTaskDependencies(nextDeps);
        applyLiveSources(nextSourceNodes);
        setSourceConnections(nextSourceConns);
        await loadTaskRunsForTasks(api, nextTasks);
        setError(null);
      } finally {
        liveTasksRefreshInFlightRef.current = null;
        setLiveTasksRefreshing(false);
      }
    })();
    liveTasksRefreshInFlightRef.current = refresh;
    return refresh;
  }, [applyLiveSources, applyLiveTasks, loadTaskRunsForTasks]);

  const scheduleLiveTaskDiscoveryRefresh = useCallback(() => {
    if (dataSource !== "live") return;
    for (const delayMs of [350, 1200]) {
      const timer = globalThis.setTimeout(() => {
        liveTaskDiscoveryRefreshTimersRef.current = liveTaskDiscoveryRefreshTimersRef.current.filter((item) => item !== timer);
        void refreshLiveTasks().catch((e) => setError(errorMessage(e)));
      }, delayMs);
      liveTaskDiscoveryRefreshTimersRef.current.push(timer);
    }
  }, [dataSource, refreshLiveTasks]);

  // Cleanup discovery timers on unmount
  useEffect(() => () => {
    for (const timer of liveTaskDiscoveryRefreshTimersRef.current) {
      globalThis.clearTimeout(timer);
    }
    liveTaskDiscoveryRefreshTimersRef.current = [];
  }, []);

  // Clear discovery timers when switching away from live
  useEffect(() => {
    if (dataSource === "live") return;
    for (const timer of liveTaskDiscoveryRefreshTimersRef.current) {
      globalThis.clearTimeout(timer);
    }
    liveTaskDiscoveryRefreshTimersRef.current = [];
    liveTaskDiscoveryRefreshRunIdsRef.current.clear();
  }, [dataSource]);

  const refreshLiveTasksAfterLeavingTaskCreateBranch = useCallback((branch: { mode?: string } | null) => {
    if (dataSource !== "live" || branch?.mode !== "task-create") return;
    void refreshLiveTasks().catch((e) => setError(errorMessage(e)));
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
      setAgents(MOCK_AGENTS);
      setAgentRunStatusById(agentRunStatusRecord(MOCK_AGENT_RUN_STATUSES));
      setTasks(mockTeamTasks);
      onApplyLiveTasks(mockTeamTasks);
      setTaskConnections([]);
      setTaskDependencies([]);
      setSourceNodes([]);
      setSourceConnections([]);
      setTaskRunsByTaskId({});
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

    async function loadLiveWorkspace() {
      try {
        const [nextAgents, nextStatuses, nextTasks, nextConnections, nextDeps, nextSourceNodes, nextSourceConns] = await Promise.all([
          api.listAgents(),
          api.listAgentRunStatuses(),
          api.listTasks(),
          api.listTaskConnections(),
          api.listTaskDependencies(),
          api.listSourceNodes(),
          api.listSourceConnections(),
        ]);
        if (!cancelled) {
          setAgents(nextAgents);
          setAgentRunStatusById(agentRunStatusRecord(nextStatuses));
          applyLiveTasks(nextTasks);
          setTaskConnections(nextConnections);
          setTaskDependencies(nextDeps);
          applyLiveSources(nextSourceNodes);
          setSourceConnections(nextSourceConns);
          void loadTaskRunsForTasks(api, nextTasks);
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
  }, [applyLiveSources, applyLiveTasks, onCloseBranches, onResetContextUi, dataSource, loadTaskRunsForTasks, onApplyLiveTasks, onApplyLiveSources]);

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
          const fresh = await api.getTaskRun(active.runId);
          if (!cancelled) {
            setTaskRunsByTaskId((current) => mergeTaskRun(current, active.taskId, fresh));
            if (dataSource === "live" && !isActiveRun(fresh.status) && !liveTaskDiscoveryRefreshRunIdsRef.current.has(fresh.runId)) {
              liveTaskDiscoveryRefreshRunIdsRef.current.add(fresh.runId);
              void refreshLiveTasks().catch((e) => {
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

    refreshLiveTasks,
    scheduleLiveTaskDiscoveryRefresh,
    refreshLiveTasksAfterLeavingTaskCreateBranch,
    readAttemptFile,
    setTaskRunsByTaskId,
    setTaskConnections,
    setTaskDependencies,
    setSourceNodes,
    setSourceConnections,
    setTasks,
  };
}
