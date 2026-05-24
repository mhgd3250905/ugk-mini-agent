import { useState, useEffect, useCallback, useMemo } from "react";
import { LiveTeamApi } from "../api/team-api";
import type { AgentSummary, TeamPlan, RunDetail, TeamApiError, TeamRunState, TeamAttemptMetadata } from "../api/team-types";
import { ALL_FIXTURES, MOCK_AGENTS, MockTeamApi } from "../fixtures/team-fixtures";
import { ExecutionMap, type AtlasAgentNode } from "../graph/ExecutionMap";
import { ROOT_ID } from "../graph/execution-map-layout";
import type { AtlasViewport } from "../graph/AtlasCanvasShell";
import "./app.css";

export type DataSource = "mock" | "live";

const CLEAN_AGENT_WORKSPACE_ID = "agent-workspace";
const DEFAULT_PLAYGROUND_BASE_URL = "http://127.0.0.1:3000";

type AgentBranchState = {
  nodeId: string;
  agentId: string;
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

export function App() {
  const [dataSource, setDataSource] = useState<DataSource>("mock");
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>(CLEAN_AGENT_WORKSPACE_ID);
  const [plan, setPlan] = useState<TeamPlan | null>(null);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [attemptsByTaskId, setAttemptsByTaskId] = useState<Record<string, TeamAttemptMetadata[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [agents, setAgents] = useState<AgentSummary[]>(MOCK_AGENTS);
  const [agentNodes, setAgentNodes] = useState<AtlasAgentNode[]>([]);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [canvasViewport, setCanvasViewport] = useState<AtlasViewport>({ x: 0, y: 0, scale: 1 });
  const [expandedAgentBranch, setExpandedAgentBranch] = useState<AgentBranchState | null>(null);

  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents]);
  const addedAgentIds = useMemo(() => new Set(agentNodes.map((node) => node.agentId)), [agentNodes]);
  const expandedAgentNode = expandedAgentBranch
    ? agentNodes.find((node) => node.nodeId === expandedAgentBranch.nodeId) ?? null
    : null;
  const expandedAgent = expandedAgentNode ? agentsById.get(expandedAgentNode.agentId) ?? null : null;

  const selectTask = useCallback((taskId: string) => {
    setSelectedTaskId((current) => current === taskId ? null : taskId);
  }, []);

  const loadFixture = useCallback((fixtureId: string) => {
    setExpandedAgentBranch(null);
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
    if (dataSource === "mock") {
      setAgents(MOCK_AGENTS);
      return;
    }

    let cancelled = false;
    const api = new LiveTeamApi();

    setAgents([]);
    setAgentPickerOpen(false);

    async function loadLiveAgents() {
      try {
        const nextAgents = await api.listAgents();
        if (!cancelled) {
          setAgents(nextAgents);
        }
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e));
        }
      }
    }

    void loadLiveAgents();

    return () => {
      cancelled = true;
    };
  }, [dataSource]);

  useEffect(() => {
    if (dataSource !== "live") return;

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
  }, [dataSource]);

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

  const toggleAgentBranch = useCallback((node: AtlasAgentNode) => {
    setAgentPickerOpen(false);
    setExpandedAgentBranch((current) => (
      current?.nodeId === node.nodeId ? null : { nodeId: node.nodeId, agentId: node.agentId }
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
            onChange={(event) => setDataSource(event.target.value as DataSource)}
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
                focusedAgentNodeId={expandedAgentNode?.nodeId ?? null}
                onSelectAgent={toggleAgentBranch}
                onMoveAgent={moveAgentNode}
                agentBranchPanel={expandedAgentBranchPanel}
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
