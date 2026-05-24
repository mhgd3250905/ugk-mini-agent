import { useState, useEffect, useCallback, useMemo } from "react";
import { LiveTeamApi } from "../api/team-api";
import type { AgentChatMessage, AgentSummary, TeamPlan, RunDetail, TeamApiError, TeamRunState, TeamAttemptMetadata } from "../api/team-types";
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

type CanvasViewport = { x: number; y: number; scale: number };

type AgentFocusState = {
  kind: "agent";
  agentId: string;
  nodeId: string;
  previousViewport: CanvasViewport;
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
  const [canvasViewport, setCanvasViewport] = useState<CanvasViewport>({ x: 0, y: 0, scale: 1 });
  const [agentFocus, setAgentFocus] = useState<AgentFocusState | null>(null);
  const [agentMessagesById, setAgentMessagesById] = useState<Record<string, AgentChatMessage[]>>({});
  const [agentMessageInput, setAgentMessageInput] = useState("");
  const [agentChatPendingAgentId, setAgentChatPendingAgentId] = useState<string | null>(null);
  const [agentChatError, setAgentChatError] = useState<string | null>(null);

  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents]);
  const addedAgentIds = useMemo(() => new Set(agentNodes.map((node) => node.agentId)), [agentNodes]);
  const focusedNode = agentFocus ? agentNodes.find((node) => node.nodeId === agentFocus.nodeId) ?? null : null;
  const focusedAgent = focusedNode ? agentsById.get(focusedNode.agentId) ?? null : null;
  const isAgentFocused = Boolean(focusedNode && focusedAgent);
  const focusedAgentMessages = focusedAgent ? agentMessagesById[focusedAgent.agentId] ?? [] : [];
  const isAgentChatPending = Boolean(focusedAgent && agentChatPendingAgentId === focusedAgent.agentId);

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

  const focusAgentNode = useCallback((node: AgentNode) => {
    setAgentPickerOpen(false);
    setAgentMessageInput("");
    setAgentChatError(null);
    setAgentFocus({
      kind: "agent",
      agentId: node.agentId,
      nodeId: node.nodeId,
      previousViewport: canvasViewport,
    });
    setCanvasViewport({
      x: 24 - node.position.x,
      y: 18 - node.position.y,
      scale: 1.08,
    });
  }, [canvasViewport]);

  const collapseAgentFocus = useCallback(() => {
    if (agentFocus) {
      setCanvasViewport(agentFocus.previousViewport);
    }
    setAgentMessageInput("");
    setAgentChatError(null);
    setAgentFocus(null);
  }, [agentFocus]);

  const sendFocusedAgentMessage = useCallback(async () => {
    if (!focusedAgent || isAgentChatPending) return;
    const message = agentMessageInput.trim();
    if (!message) return;

    const agentId = focusedAgent.agentId;
    setAgentMessageInput("");
    setAgentChatError(null);
    setAgentMessagesById((current) => ({
      ...current,
      [agentId]: [
        ...(current[agentId] ?? []),
        { role: "user", text: message },
      ],
    }));
    setAgentChatPendingAgentId(agentId);

    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
    try {
      const response = await api.sendAgentMessage(agentId, message);
      setAgentMessagesById((current) => ({
        ...current,
        [agentId]: [
          ...(current[agentId] ?? []),
          { role: "assistant", text: response.text },
        ],
      }));
    } catch (e) {
      setAgentChatError(errorMessage(e));
    } finally {
      setAgentChatPendingAgentId((current) => current === agentId ? null : current);
    }
  }, [agentMessageInput, dataSource, focusedAgent, isAgentChatPending]);

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

                <div
                  className="agent-canvas-board"
                  data-testid="agent-canvas"
                  data-state={isAgentFocused ? "focus" : "normal"}
                  data-viewport={`${canvasViewport.x},${canvasViewport.y},${canvasViewport.scale}`}
                >
                  {isAgentFocused && focusedNode && focusedAgent ? (
                    <div className="agent-focus-stage">
                      <button
                        type="button"
                        className="agent-card agent-focus-card"
                        aria-current="true"
                      >
                        <span className="agent-card-kicker">Agent</span>
                        <span className="agent-card-name">{focusedAgent.name}</span>
                        <code>{focusedAgent.agentId}</code>
                        <span className="agent-card-description">{focusedAgent.description}</span>
                        <span className="agent-card-binding">{formatAgentBinding(focusedAgent)}</span>
                      </button>
                      <section className="agent-chat-panel" aria-label={`Agent Chat Panel ${focusedAgent.name}`}>
                        <div className="agent-chat-panel-header">
                          <div>
                            <span className="agent-chat-panel-kicker">Agent Chat Panel</span>
                            <h2>{focusedAgent.name} / {focusedAgent.agentId}</h2>
                          </div>
                          <button type="button" className="agent-collapse-btn" onClick={collapseAgentFocus}>
                            收起
                          </button>
                        </div>
                        <div className="agent-chat-messages" aria-label="Agent messages">
                          {focusedAgentMessages.length === 0 ? (
                            <div className="agent-chat-empty">暂无消息</div>
                          ) : (
                            focusedAgentMessages.map((message, index) => (
                              <div
                                key={`${message.role}-${index}`}
                                className={`agent-chat-message ${message.role}`}
                              >
                                <span className="agent-chat-role">{message.role === "user" ? "User" : "Agent"}</span>
                                <p>{message.text}</p>
                              </div>
                            ))
                          )}
                          {isAgentChatPending && <div className="agent-chat-loading">发送中...</div>}
                          {agentChatError && <div className="agent-chat-error" role="alert">{agentChatError}</div>}
                        </div>
                        <form
                          className="agent-chat-composer"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void sendFocusedAgentMessage();
                          }}
                        >
                          <label className="sr-only" htmlFor="agent-chat-input">Agent message</label>
                          <textarea
                            id="agent-chat-input"
                            value={agentMessageInput}
                            onChange={(event) => setAgentMessageInput(event.target.value)}
                            aria-label="Agent message"
                            rows={2}
                          />
                          <button
                            type="submit"
                            disabled={!agentMessageInput.trim() || isAgentChatPending}
                          >
                            发送
                          </button>
                        </form>
                      </section>
                    </div>
                  ) : (
                    agentNodes.map((node) => {
                      const agent = agentsById.get(node.agentId);
                      if (!agent) return null;
                      return (
                        <button
                          key={node.nodeId}
                          type="button"
                          className="agent-card"
                          style={{ left: node.position.x, top: node.position.y }}
                          onClick={() => focusAgentNode(node)}
                        >
                          <span className="agent-card-kicker">Agent</span>
                          <span className="agent-card-name">{agent.name}</span>
                          <code>{agent.agentId}</code>
                          <span className="agent-card-description">{agent.description}</span>
                          <span className="agent-card-binding">{formatAgentBinding(agent)}</span>
                        </button>
                      );
                    })
                  )}
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
