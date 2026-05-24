import { useState, useEffect, useCallback, useMemo } from "react";
import { LiveTeamApi } from "../api/team-api";
import type { AgentRunStatus, AgentSummary, TeamCanvasTask, TeamPlan, RunDetail, TeamApiError, TeamRunState, TeamAttemptMetadata } from "../api/team-types";
import { ALL_FIXTURES, MOCK_AGENTS, MOCK_AGENT_RUN_STATUSES, mockTeamTasks, MockTeamApi } from "../fixtures/team-fixtures";
import { ExecutionMap, type AtlasAgentNode, type AtlasTaskNode } from "../graph/ExecutionMap";
import { ROOT_ID } from "../graph/execution-map-layout";
import type { AtlasViewport } from "../graph/AtlasCanvasShell";
import "./app.css";

export type DataSource = "mock" | "live";
type LiveRunMode = "workspace" | "latest";

const CLEAN_AGENT_WORKSPACE_ID = "agent-workspace";
const DEFAULT_PLAYGROUND_BASE_URL = "http://127.0.0.1:3000";
const DATA_SOURCE_STORAGE_KEY = "ugk-team-console:data-source";
const LIVE_AGENT_LAYOUT_STORAGE_KEY = "ugk-team-console:live-agent-layout:v1";
const LIVE_TASK_LAYOUT_STORAGE_KEY = "ugk-team-console:live-task-layout:v1";

type AgentBranchState = {
  nodeId: string;
  agentId: string;
};

type TaskBranchState = {
  nodeId: string;
  taskId: string;
};

type StoredTaskPosition = {
  taskId: string;
  position: { x: number; y: number };
};

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as TeamApiError).message);
  }
  if (error instanceof Error) return error.message;
  return "未知错误";
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

function playgroundBaseUrl(): string {
  const configured =
    import.meta.env.VITE_TEAM_CONSOLE_PLAYGROUND_BASE_URL ||
    import.meta.env.VITE_TEAM_CONSOLE_API_TARGET;
  const raw = typeof configured === "string" && configured.trim()
    ? configured.trim()
    : DEFAULT_PLAYGROUND_BASE_URL;
  return raw.replace(/\/+$/, "");
}

function buildAgentPlaygroundUrl(agentId: string): string {
  const url = new URL("/playground", playgroundBaseUrl());
  url.searchParams.set("view", "chat");
  url.searchParams.set("agentId", agentId);
  url.searchParams.set("embed", "team-console");
  return url.toString();
}

function buildTaskLeaderPlaygroundUrl(task: TeamCanvasTask): string {
  const url = new URL("/playground", playgroundBaseUrl());
  url.searchParams.set("view", "chat");
  url.searchParams.set("agentId", task.leaderAgentId);
  url.searchParams.set("embed", "team-console");
  url.searchParams.set("teamTaskId", task.taskId);
  return url.toString();
}

function agentRunStatusRecord(statuses: AgentRunStatus[]): Record<string, AgentRunStatus> {
  return Object.fromEntries(statuses.map((status) => [status.agentId, status]));
}

function readStoredDataSource(): DataSource {
  try {
    return globalThis.localStorage?.getItem(DATA_SOURCE_STORAGE_KEY) === "live" ? "live" : "mock";
  } catch {
    return "mock";
  }
}

function readStoredLiveAgentNodes(): AtlasAgentNode[] {
  try {
    const raw = globalThis.localStorage?.getItem(LIVE_AGENT_LAYOUT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const rawNodes = Array.isArray((parsed as { nodes?: unknown }).nodes)
      ? (parsed as { nodes: unknown[] }).nodes
      : [];
    const seen = new Set<string>();
    const nodes: AtlasAgentNode[] = [];
    for (const item of rawNodes) {
      const record = item as { agentId?: unknown; x?: unknown; y?: unknown };
      const agentId = typeof record.agentId === "string" ? record.agentId.trim() : "";
      const x = Number(record.x);
      const y = Number(record.y);
      if (!agentId || seen.has(agentId) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      seen.add(agentId);
      nodes.push({
        nodeId: `agent-${agentId}`,
        kind: "agent",
        agentId,
        position: { x, y },
      });
    }
    return nodes;
  } catch {
    return [];
  }
}

function writeStoredLiveAgentNodes(nodes: AtlasAgentNode[]) {
  try {
    globalThis.localStorage?.setItem(LIVE_AGENT_LAYOUT_STORAGE_KEY, JSON.stringify({
      version: 1,
      nodes: nodes.map((node) => ({
        agentId: node.agentId,
        x: node.position.x,
        y: node.position.y,
      })),
    }));
  } catch {}
}

function readStoredLiveTaskPositions(): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  try {
    const raw = globalThis.localStorage?.getItem(LIVE_TASK_LAYOUT_STORAGE_KEY);
    if (!raw) return positions;
    const parsed = JSON.parse(raw) as { schemaVersion?: unknown; tasks?: unknown };
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.tasks)) return positions;
    for (const item of parsed.tasks) {
      const record = item as { taskId?: unknown; position?: { x?: unknown; y?: unknown } };
      const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
      const x = Number(record.position?.x);
      const y = Number(record.position?.y);
      if (!taskId || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      positions.set(taskId, { x, y });
    }
  } catch {}
  return positions;
}

function writeStoredLiveTaskNodes(nodes: AtlasTaskNode[]) {
  try {
    const tasks: StoredTaskPosition[] = nodes.map((node) => ({
      taskId: node.taskId,
      position: { x: node.position.x, y: node.position.y },
    }));
    globalThis.localStorage?.setItem(LIVE_TASK_LAYOUT_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      tasks,
    }));
  } catch {}
}

function makeTaskNode(
  task: TeamCanvasTask,
  index: number,
  storedPosition?: { x: number; y: number },
): AtlasTaskNode {
  return {
    nodeId: `task-node-${task.taskId}`,
    kind: "canvas-task",
    taskId: task.taskId,
    position: storedPosition ?? {
      x: 280 + (index % 3) * 320,
      y: 220 + Math.floor(index / 3) * 180,
    },
  };
}

function makeTaskNodes(tasks: TeamCanvasTask[], storedPositions = new Map<string, { x: number; y: number }>()): AtlasTaskNode[] {
  return tasks.map((task, index) => makeTaskNode(task, index, storedPositions.get(task.taskId)));
}

export function App() {
  const [dataSource, setDataSource] = useState<DataSource>(() => readStoredDataSource());
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>(CLEAN_AGENT_WORKSPACE_ID);
  const [liveRunMode, setLiveRunMode] = useState<LiveRunMode>("workspace");
  const [plan, setPlan] = useState<TeamPlan | null>(null);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [attemptsByTaskId, setAttemptsByTaskId] = useState<Record<string, TeamAttemptMetadata[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [agents, setAgents] = useState<AgentSummary[]>(MOCK_AGENTS);
  const [agentRunStatusById, setAgentRunStatusById] = useState<Record<string, AgentRunStatus>>(
    () => agentRunStatusRecord(MOCK_AGENT_RUN_STATUSES),
  );
  const [agentNodes, setAgentNodes] = useState<AtlasAgentNode[]>([]);
  const [liveAgentNodesHydrated, setLiveAgentNodesHydrated] = useState(false);
  const [tasks, setTasks] = useState<TeamCanvasTask[]>([]);
  const [taskNodes, setTaskNodes] = useState<AtlasTaskNode[]>([]);
  const [liveTaskNodesHydrated, setLiveTaskNodesHydrated] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [canvasViewport, setCanvasViewport] = useState<AtlasViewport>({ x: 0, y: 0, scale: 1 });
  const [expandedAgentBranch, setExpandedAgentBranch] = useState<AgentBranchState | null>(null);
  const [expandedTaskBranch, setExpandedTaskBranch] = useState<TaskBranchState | null>(null);

  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents]);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.taskId, task])), [tasks]);
  const agentRunStatusesById = useMemo(() => new Map(Object.entries(agentRunStatusById)), [agentRunStatusById]);
  const addedAgentIds = useMemo(() => new Set(agentNodes.map((node) => node.agentId)), [agentNodes]);
  const expandedAgentNode = expandedAgentBranch
    ? agentNodes.find((node) => node.nodeId === expandedAgentBranch.nodeId) ?? null
    : null;
  const expandedAgent = expandedAgentNode ? agentsById.get(expandedAgentNode.agentId) ?? null : null;
  const expandedTaskNode = expandedTaskBranch
    ? taskNodes.find((node) => node.nodeId === expandedTaskBranch.nodeId) ?? null
    : null;
  const expandedTask = expandedTaskNode ? tasksById.get(expandedTaskNode.taskId) ?? null : null;

  const selectTask = useCallback((taskId: string) => {
    setSelectedTaskId((current) => current === taskId ? null : taskId);
  }, []);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(DATA_SOURCE_STORAGE_KEY, dataSource);
    } catch {}
  }, [dataSource]);

  useEffect(() => {
    if (dataSource !== "live") {
      setLiveAgentNodesHydrated(false);
      setLiveTaskNodesHydrated(false);
      return;
    }
    setAgentNodes(readStoredLiveAgentNodes());
    setExpandedAgentBranch(null);
    setExpandedTaskBranch(null);
    setLiveAgentNodesHydrated(true);
  }, [dataSource]);

  useEffect(() => {
    if (dataSource !== "live" || !liveAgentNodesHydrated) return;
    writeStoredLiveAgentNodes(agentNodes);
  }, [dataSource, liveAgentNodesHydrated, agentNodes]);

  useEffect(() => {
    if (dataSource !== "live" || !liveTaskNodesHydrated) return;
    writeStoredLiveTaskNodes(taskNodes);
  }, [dataSource, liveTaskNodesHydrated, taskNodes]);

  useEffect(() => {
    if (expandedTaskBranch && !tasksById.has(expandedTaskBranch.taskId)) {
      setExpandedTaskBranch(null);
    }
  }, [expandedTaskBranch, tasksById]);

  const loadFixture = useCallback((fixtureId: string) => {
    setExpandedAgentBranch(null);
    setExpandedTaskBranch(null);
    if (fixtureId === CLEAN_AGENT_WORKSPACE_ID) {
      setPlan(null);
      setRun(null);
      setSelectedTaskId(null);
      setAttemptsByTaskId({});
      setError(null);
      setLoading(false);
      setCanvasViewport({ x: 0, y: 0, scale: 1 });
      return;
    }

    const entry = ALL_FIXTURES.find((fixture) => fixture.id === fixtureId);
    if (!entry) return;
    setPlan(entry.plan);
    setRun(entry.run);
    setSelectedTaskId(null);
    setAttemptsByTaskId({});
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (dataSource === "mock") {
      loadFixture(selectedFixtureId);
    }
  }, [dataSource, selectedFixtureId, loadFixture]);

  useEffect(() => {
    setExpandedAgentBranch(null);
    setExpandedTaskBranch(null);
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
      setTaskNodes(makeTaskNodes(mockTeamTasks));
      return () => {
        cancelled = true;
      };
    }

    setAgents([]);
    setAgentPickerOpen(false);
    setAgentRunStatusById({});
    setTasks([]);
    setTaskNodes([]);
    setLiveTaskNodesHydrated(false);

    async function loadLiveWorkspace() {
      try {
        const [nextAgents, nextStatuses, nextTasks] = await Promise.all([
          api.listAgents(),
          api.listAgentRunStatuses(),
          api.listTasks(),
        ]);
        if (!cancelled) {
          setAgents(nextAgents);
          setAgentRunStatusById(agentRunStatusRecord(nextStatuses));
          setTasks(nextTasks);
          setTaskNodes(makeTaskNodes(nextTasks, readStoredLiveTaskPositions()));
          setLiveTaskNodesHydrated(true);
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
  }, [dataSource]);

  useEffect(() => {
    if (dataSource !== "live") return;

    setExpandedAgentBranch(null);
    setExpandedTaskBranch(null);
    if (liveRunMode === "workspace") {
      setPlan(null);
      setRun(null);
      setSelectedTaskId(null);
      setAttemptsByTaskId({});
      setError(null);
      setLoading(false);
      setCanvasViewport({ x: 0, y: 0, scale: 1 });
      return;
    }

    let cancelled = false;
    const api = new LiveTeamApi();

    setPlan(null);
    setRun(null);
    setSelectedTaskId(null);
    setAttemptsByTaskId({});
    setError(null);
    setLoading(true);

    async function loadLiveData() {
      try {
        const [plans, runs] = await Promise.all([
          api.listPlans(),
          api.listRuns(),
        ]);
        const selectedRun = selectLatestRun(runs);
        if (!selectedRun) {
          if (!cancelled) {
            setPlan(null);
            setRun(null);
          }
          return;
        }

        const runDetail = await api.getRunDetail(selectedRun.runId);
        const runPlan = plans.find((candidate) => candidate.planId === runDetail.planId);
        if (!runPlan) {
          throw { message: `Plan not found for run: ${runDetail.runId}` };
        }

        if (!cancelled) {
          setPlan(runPlan);
          setRun(runDetail);
        }
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadLiveData();

    return () => {
      cancelled = true;
    };
  }, [dataSource, liveRunMode]);

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

  const addAgentNode = useCallback((agentId: string) => {
    setAgentNodes((current) => {
      if (current.some((node) => node.agentId === agentId)) return current;
      const index = current.length;
      return [
        ...current,
        {
          nodeId: `agent-${agentId}`,
          kind: "agent",
          agentId,
          position: { x: 360 + index * 320, y: 0 },
        },
      ];
    });
    setAgentPickerOpen(false);
  }, []);

  const moveAgentNode = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setAgentNodes((current) => current.map((node) => (
      node.nodeId === nodeId ? { ...node, position } : node
    )));
  }, []);

  const moveTaskNode = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setTaskNodes((current) => current.map((node) => (
      node.nodeId === nodeId ? { ...node, position } : node
    )));
  }, []);

  const toggleAgentBranch = useCallback((node: AtlasAgentNode) => {
    setAgentPickerOpen(false);
    setExpandedTaskBranch(null);
    setExpandedAgentBranch((current) => (
      current?.nodeId === node.nodeId ? null : { nodeId: node.nodeId, agentId: node.agentId }
    ));
  }, []);

  const toggleTaskBranch = useCallback((node: AtlasTaskNode) => {
    setAgentPickerOpen(false);
    setExpandedAgentBranch(null);
    setExpandedTaskBranch((current) => (
      current?.nodeId === node.nodeId ? null : { nodeId: node.nodeId, taskId: node.taskId }
    ));
  }, []);

  const agentToolbar = (
    <div className="agent-atlas-actions">
      <button
        type="button"
        className="agent-add-btn"
        onClick={() => setAgentPickerOpen((open) => !open)}
        aria-expanded={agentPickerOpen}
      >
        添加 Agent
      </button>
      <span className="agent-atlas-count">{agentNodes.length}</span>
      {agentPickerOpen && (
        <div className="agent-picker" aria-label="Agent catalog">
          {agents.map((agent) => {
            const joined = addedAgentIds.has(agent.agentId);
            return (
              <button
                key={agent.agentId}
                type="button"
                className="agent-picker-option"
                disabled={joined}
                onClick={() => addAgentNode(agent.agentId)}
              >
                <span className="agent-picker-name">{agent.name}</span>
                <code>{agent.agentId}</code>
                {joined && <span className="agent-picker-status">已加入</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const expandedAgentBranchPanel = expandedAgentNode && expandedAgent ? (
    <section className="agent-playground-branch" aria-label={`${expandedAgent.name} 主项目对话`}>
      <header className="agent-playground-branch-head">
        <div className="agent-playground-branch-title">
          <span>主项目对话</span>
          <strong>{expandedAgent.name}</strong>
          <code>{expandedAgent.agentId}</code>
        </div>
        <button
          type="button"
          className="agent-playground-branch-collapse"
          onClick={() => setExpandedAgentBranch(null)}
          aria-label={`收起 ${expandedAgent.name} 对话分支`}
        >
          收起
        </button>
      </header>
      <iframe
        className="agent-playground-iframe"
        title={`${expandedAgent.name} 主项目对话`}
        src={buildAgentPlaygroundUrl(expandedAgent.agentId)}
        referrerPolicy="no-referrer"
      />
    </section>
  ) : null;

  const expandedTaskBranchPanel = expandedTaskNode && expandedTask ? (
    <section className="task-leader-branch" aria-label={`${expandedTask.title} leader 对话`}>
      <header className="task-leader-branch-head">
        <div className="task-leader-branch-title">
          <span>leader</span>
          <strong>{expandedTask.title}</strong>
          <code>{expandedTask.taskId}</code>
        </div>
        <button
          type="button"
          className="task-leader-branch-collapse"
          onClick={() => setExpandedTaskBranch(null)}
          aria-label={`收起 ${expandedTask.title} leader 对话`}
        >
          收起
        </button>
      </header>
      <div className="task-leader-branch-hint">
        在对话中使用 <code>/team-task</code> 创建或更新这个 Task。Task 数据必须通过后端 API 写入。
      </div>
      <iframe
        className="task-leader-iframe"
        title={`${expandedTask.title} leader 对话`}
        src={buildTaskLeaderPlaygroundUrl(expandedTask)}
        referrerPolicy="no-referrer"
      />
    </section>
  ) : null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <h1 className="app-title">团队控制台</h1>
          <span className="app-subtitle">执行地图预览</span>
        </div>
        <div className="app-header-right">
          <select
            id="team-console-data-source"
            name="teamConsoleDataSource"
            value={dataSource}
            onChange={(event) => {
              const nextSource = event.target.value as DataSource;
              setDataSource(nextSource);
              if (nextSource === "live") {
                setLiveRunMode("workspace");
              }
            }}
            className="datasource-select"
          >
            <option value="mock">示例数据</option>
            <option value="live">实时 API</option>
          </select>
        </div>
      </header>

      {dataSource === "mock" && (
        <div className="fixture-bar">
          <span className="fixture-label">示例：</span>
          <button
            className={`fixture-btn ${selectedFixtureId === CLEAN_AGENT_WORKSPACE_ID ? "active" : ""}`}
            onClick={() => setSelectedFixtureId(CLEAN_AGENT_WORKSPACE_ID)}
          >
            Agent workspace
          </button>
          {ALL_FIXTURES.map((fixture) => (
            <button
              key={fixture.id}
              className={`fixture-btn ${selectedFixtureId === fixture.id ? "active" : ""}`}
              onClick={() => setSelectedFixtureId(fixture.id)}
            >
              {fixture.label}
            </button>
          ))}
        </div>
      )}

      {dataSource === "live" && (
        <div className="fixture-bar live-run-bar">
          <span className="fixture-label">运行图：</span>
          <button
            className={`fixture-btn ${liveRunMode === "workspace" ? "active" : ""}`}
            onClick={() => setLiveRunMode("workspace")}
          >
            Agent workspace
          </button>
          <button
            className={`fixture-btn ${liveRunMode === "latest" ? "active" : ""}`}
            onClick={() => setLiveRunMode("latest")}
          >
            最新 Run
          </button>
        </div>
      )}

      {error && (
        <div className="error-banner">{error}</div>
      )}

      <main className="app-main">
        {loading ? (
          <div className="empty-state">
            <p>正在加载实时运行...</p>
          </div>
        ) : (
          <div className="workspace">
            <div className="workspace-map">
              <ExecutionMap
                plan={plan}
                run={run}
                selectedTaskId={selectedTaskId}
                onSelectTask={selectTask}
                attemptsByTaskId={attemptsByTaskId}
                readAttemptFile={readAttemptFile}
                agentNodes={agentNodes}
                agentsById={agentsById}
                agentRunStatusById={agentRunStatusesById}
                focusedAgentNodeId={expandedAgentNode?.nodeId ?? null}
                onSelectAgent={toggleAgentBranch}
                onMoveAgent={moveAgentNode}
                agentBranchPanel={expandedAgentBranchPanel}
                taskNodes={taskNodes}
                tasksById={tasksById}
                focusedTaskNodeId={expandedTaskNode?.nodeId ?? null}
                onSelectCanvasTask={toggleTaskBranch}
                onMoveCanvasTask={moveTaskNode}
                taskBranchPanel={expandedTaskBranchPanel}
                viewport={canvasViewport}
                onViewportChange={setCanvasViewport}
                toolbarStart={agentToolbar}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
