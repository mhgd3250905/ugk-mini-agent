import { useState, useEffect, useCallback, useMemo } from "react";
import { LiveTeamApi } from "../api/team-api";
import type { AgentSummary, TeamPlan, RunDetail, TeamApiError, TeamRunState, TeamAttemptMetadata } from "../api/team-types";
import { ALL_FIXTURES, MOCK_AGENTS, MockTeamApi } from "../fixtures/team-fixtures";
import { ExecutionMap } from "../graph/ExecutionMap";
import { ROOT_ID } from "../graph/execution-map-layout";
import "./app.css";

export type DataSource = "mock" | "live";

type AgentNode = {
  nodeId: string;
  kind: "agent";
  agentId: string;
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

function formatAgentBinding(agent: AgentSummary): string {
  const model = agent.defaultModelProvider && agent.defaultModelId
    ? `${agent.defaultModelProvider}/${agent.defaultModelId}`
    : "model default";
  const browser = agent.defaultBrowserId ? `browser ${agent.defaultBrowserId}` : "browser default";
  return `${model} · ${browser}`;
}

export function App() {
  const [dataSource, setDataSource] = useState<DataSource>("mock");
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>(ALL_FIXTURES[0].id);
  const [plan, setPlan] = useState<TeamPlan | null>(null);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [attemptsByTaskId, setAttemptsByTaskId] = useState<Record<string, TeamAttemptMetadata[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [agents, setAgents] = useState<AgentSummary[]>(MOCK_AGENTS);
  const [agentNodes, setAgentNodes] = useState<AgentNode[]>([]);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);

  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents]);
  const addedAgentIds = useMemo(() => new Set(agentNodes.map((node) => node.agentId)), [agentNodes]);

  const selectTask = useCallback((taskId: string) => {
    setSelectedTaskId((current) => current === taskId ? null : taskId);
  }, []);

  const loadFixture = useCallback((fixtureId: string) => {
    const entry = ALL_FIXTURES.find((f) => f.id === fixtureId);
    if (entry) {
      setPlan(entry.plan);
      setRun(entry.run);
      setSelectedTaskId(null);
      setAttemptsByTaskId({});
      setError(null);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dataSource === "mock") {
      loadFixture(selectedFixtureId);
    }
  }, [dataSource, selectedFixtureId, loadFixture]);

  useEffect(() => {
    if (dataSource === "mock") {
      setAgents(MOCK_AGENTS);
      return;
    }
    setAgents([]);
    setAgentPickerOpen(false);
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
            setError("没有可显示的 live run");
          }
          return;
        }

        const runDetail = await api.getRunDetail(selectedRun.runId);
        const runPlan = plans.find((p) => p.planId === runDetail.planId);
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
        if (!cancelled) {
          if (attempts.length === 0) return;
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
          position: { x: 24 + index * 260, y: 28 },
        },
      ];
    });
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <h1 className="app-title">团队控制台</h1>
          <span className="app-subtitle">执行地图预览</span>
        </div>
        <div className="app-header-right">
          <select
            value={dataSource}
            onChange={(e) => setDataSource(e.target.value as DataSource)}
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
          {ALL_FIXTURES.map((f) => (
            <button
              key={f.id}
              className={`fixture-btn ${selectedFixtureId === f.id ? "active" : ""}`}
              onClick={() => setSelectedFixtureId(f.id)}
            >
              {f.label}
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
        ) : plan && run ? (
          <div className="workspace">
            <div className="workspace-map">
              <section className="agent-canvas-panel" aria-label="Agent Canvas">
                <div className="agent-canvas-toolbar">
                  <div className="agent-canvas-title">
                    <span>Agent Canvas</span>
                    <code>{agentNodes.length}</code>
                  </div>
                  <button
                    type="button"
                    className="agent-add-btn"
                    onClick={() => setAgentPickerOpen((open) => !open)}
                    aria-expanded={agentPickerOpen}
                  >
                    添加 Agent
                  </button>
                </div>

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

                <div className="agent-canvas-board" data-testid="agent-canvas">
                  {agentNodes.map((node) => {
                    const agent = agentsById.get(node.agentId);
                    if (!agent) return null;
                    return (
                      <button
                        key={node.nodeId}
                        type="button"
                        className="agent-card"
                        style={{ left: node.position.x, top: node.position.y }}
                      >
                        <span className="agent-card-kicker">Agent</span>
                        <span className="agent-card-name">{agent.name}</span>
                        <code>{agent.agentId}</code>
                        <span className="agent-card-description">{agent.description}</span>
                        <span className="agent-card-binding">{formatAgentBinding(agent)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
              <ExecutionMap
                plan={plan}
                run={run}
                selectedTaskId={selectedTaskId}
                onSelectTask={selectTask}
                attemptsByTaskId={attemptsByTaskId}
                readAttemptFile={readAttemptFile}
              />
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <p>未选择运行。请选择一个运行查看执行地图。</p>
          </div>
        )}
      </main>
    </div>
  );
}
