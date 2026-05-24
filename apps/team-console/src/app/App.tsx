import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { LiveTeamApi } from "../api/team-api";
import type { AgentAssetSummary, AgentChatActiveRun, AgentChatMessage, AgentChatStreamEvent, AgentContextUsage, AgentConversationState, AgentSummary, TeamPlan, RunDetail, TeamApiError, TeamRunState, TeamAttemptMetadata } from "../api/team-types";
import { ALL_FIXTURES, MOCK_AGENTS, MockTeamApi } from "../fixtures/team-fixtures";
import { ExecutionMap, type AtlasAgentNode } from "../graph/ExecutionMap";
import { ROOT_ID } from "../graph/execution-map-layout";
import type { AtlasViewport } from "../graph/AtlasCanvasShell";
import "./app.css";

export type DataSource = "mock" | "live";

const CLEAN_AGENT_WORKSPACE_ID = "agent-workspace";
const AGENT_DRAFT_CONVERSATION_ID = "__draft__";
const MAX_FOCUSED_ASSETS = 20;

type AgentFocusState = {
  kind: "agent";
  agentId: string;
  nodeId: string;
  previousViewport: AtlasViewport;
};

type FocusPanel = "assets" | "context" | null;

const FALLBACK_CONTEXT_USAGE: AgentContextUsage = {
  provider: "zhipu-glm",
  model: "glm-5.1",
  currentTokens: 0,
  contextWindow: 128000,
  reserveTokens: 16384,
  maxResponseTokens: 16384,
  availableTokens: 111616,
  percent: 0,
  status: "safe",
  mode: "estimate",
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

function formatFileSize(size: number): string {
  if (!Number.isFinite(size)) return "unknown";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function estimateDraftTokens(message: string, assets: AgentAssetSummary[]): number {
  const messageTokens = Math.ceil(String(message || "").length / 4);
  const assetTokens = assets.reduce((sum, asset) => {
    if (asset.kind === "text") {
      return sum + Math.max(64, Math.ceil(Math.min(asset.sizeBytes || 0, 24000) / 4));
    }
    return sum + Math.max(128, Math.ceil((asset.sizeBytes || 0) / 16));
  }, 0);
  return messageTokens + assetTokens;
}

function contextStatusFor(currentTokens: number, contextWindow: number, reserveTokens: number): AgentContextUsage["status"] {
  const usableWindow = Math.max(1, contextWindow - reserveTokens);
  const ratio = currentTokens / usableWindow;
  if (ratio >= 1) return "danger";
  if (ratio >= 0.9) return "warning";
  if (ratio >= 0.72) return "caution";
  return "safe";
}

function projectContextUsage(baseUsage: AgentContextUsage | undefined, draftTokens: number): AgentContextUsage & { draftTokens: number } {
  const base = baseUsage ?? FALLBACK_CONTEXT_USAGE;
  const currentTokens = Math.max(0, base.currentTokens + draftTokens);
  const contextWindow = Math.max(1, base.contextWindow);
  const reserveTokens = Math.max(0, base.reserveTokens);
  return {
    ...base,
    currentTokens,
    availableTokens: Math.max(0, contextWindow - reserveTokens - currentTokens),
    percent: Math.max(0, Math.min(100, Math.round((currentTokens / contextWindow) * 100))),
    status: contextStatusFor(currentTokens, contextWindow, reserveTokens),
    mode: draftTokens > 0 ? "estimate" : base.mode,
    draftTokens,
  };
}

function agentConversationKey(agentId: string, conversationId: string | undefined): string {
  return `${agentId}:${conversationId || AGENT_DRAFT_CONVERSATION_ID}`;
}

function messagesFromConversationState(state: AgentConversationState): AgentChatMessage[] {
  const messages = state.viewMessages.length > 0 ? state.viewMessages : state.messages;
  const renderedMessages: AgentChatMessage[] = messages
    .filter((message) => message.kind === "user" || message.kind === "assistant" || message.kind === "error")
    .map((message) => ({
      role: message.kind === "user" ? "user" : "assistant",
      text: message.text,
      assetRefs: message.assetRefs ?? [],
    }));
  const activeRun = state.activeRun;
  if (!activeRun) {
    return renderedMessages;
  }

  const activeMessages = [...renderedMessages];
  const activeInput = activeRun.input?.message?.trim() ?? "";
  if (activeInput && !activeMessages.some((message) => message.role === "user" && message.text === activeInput)) {
    activeMessages.push({
      role: "user",
      text: activeInput,
      assetRefs: activeRun.input?.inputAssets ?? [],
    });
  }
  const activeText = activeRun.text?.trim() ?? "";
  if (activeText && !activeMessages.some((message) => message.role === "assistant" && message.text === activeText)) {
    activeMessages.push({ role: "assistant", text: activeRun.text });
  } else if (activeRun.status === "interrupted" && !activeMessages.some((message) => message.text === "本轮已中断")) {
    activeMessages.push({ role: "assistant", text: "本轮已中断" });
  }
  return activeMessages;
}

function appendAssistantDelta(messages: AgentChatMessage[], textDelta: string): AgentChatMessage[] {
  if (!textDelta) return messages;
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role !== "assistant") {
    return [...messages, { role: "assistant", text: textDelta }];
  }
  return [
    ...messages.slice(0, -1),
    { ...lastMessage, text: `${lastMessage.text}${textDelta}` },
  ];
}

function finishAssistantMessage(messages: AgentChatMessage[], text: string): AgentChatMessage[] {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role !== "assistant") {
    return [...messages, { role: "assistant", text }];
  }
  return [
    ...messages.slice(0, -1),
    { ...lastMessage, text },
  ];
}

function isTerminalAgentChatStreamEvent(event: AgentChatStreamEvent): boolean {
  return event.type === "done" || event.type === "error" || event.type === "interrupted";
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
  const [agentFocus, setAgentFocus] = useState<AgentFocusState | null>(null);
  const [agentMessagesByConversationKey, setAgentMessagesByConversationKey] = useState<Record<string, AgentChatMessage[]>>({});
  const [agentRecoveryRunsByConversationKey, setAgentRecoveryRunsByConversationKey] = useState<Record<string, AgentChatActiveRun>>({});
  const [agentConversationIds, setAgentConversationIds] = useState<Record<string, string>>({});
  const [agentMessageInput, setAgentMessageInput] = useState("");
  const [agentChatPendingAgentId, setAgentChatPendingAgentId] = useState<string | null>(null);
  const [agentChatError, setAgentChatError] = useState<string | null>(null);
  const [agentChatNotice, setAgentChatNotice] = useState<string | null>(null);
  const [agentSelectedAssetsById, setAgentSelectedAssetsById] = useState<Record<string, AgentAssetSummary[]>>({});
  const [agentContextUsageById, setAgentContextUsageById] = useState<Record<string, AgentContextUsage>>({});
  const [focusPanel, setFocusPanel] = useState<FocusPanel>(null);
  const [assetLibrary, setAssetLibrary] = useState<AgentAssetSummary[]>([]);
  const [assetLibraryLoading, setAssetLibraryLoading] = useState(false);
  const [assetLibraryError, setAssetLibraryError] = useState<string | null>(null);
  const [composerUploading, setComposerUploading] = useState(false);
  const [conversationCreatePendingAgentId, setConversationCreatePendingAgentId] = useState<string | null>(null);
  const [interruptPendingAgentId, setInterruptPendingAgentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const focusLoadGenerationRef = useRef(0);
  const agentConversationIdsRef = useRef<Record<string, string>>({});

  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents]);
  const addedAgentIds = useMemo(() => new Set(agentNodes.map((node) => node.agentId)), [agentNodes]);
  const focusedNode = agentFocus ? agentNodes.find((node) => node.nodeId === agentFocus.nodeId) ?? null : null;
  const focusedAgent = focusedNode ? agentsById.get(focusedNode.agentId) ?? null : null;
  const isAgentFocused = Boolean(focusedNode && focusedAgent);
  const focusedAgentAssets = focusedAgent ? agentSelectedAssetsById[focusedAgent.agentId] ?? [] : [];
  const focusedConversationId = focusedAgent ? agentConversationIds[focusedAgent.agentId] : undefined;
  const focusedConversationKey = focusedAgent ? agentConversationKey(focusedAgent.agentId, focusedConversationId) : null;
  const focusedAgentMessages = focusedConversationKey ? agentMessagesByConversationKey[focusedConversationKey] ?? [] : [];
  const focusedRecoveryRun = focusedConversationKey ? agentRecoveryRunsByConversationKey[focusedConversationKey] : undefined;
  const isAgentChatPending = Boolean(focusedAgent && agentChatPendingAgentId === focusedAgent.agentId);
  const isConversationCreatePending = Boolean(focusedAgent && conversationCreatePendingAgentId === focusedAgent.agentId);
  const isInterruptPending = Boolean(focusedAgent && interruptPendingAgentId === focusedAgent.agentId);
  const focusedContextUsage = projectContextUsage(
    focusedAgent ? agentContextUsageById[focusedAgent.agentId] : undefined,
    estimateDraftTokens(agentMessageInput, focusedAgentAssets),
  );

  const selectTask = useCallback((taskId: string) => {
    setSelectedTaskId((current) => current === taskId ? null : taskId);
  }, []);

  useEffect(() => {
    agentConversationIdsRef.current = agentConversationIds;
  }, [agentConversationIds]);

  const loadFixture = useCallback((fixtureId: string) => {
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
    setAgentConversationIds({});
    setAgentRecoveryRunsByConversationKey({});
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

  const createApi = useCallback(() => dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi(), [dataSource]);

  const applyAgentConversationState = useCallback((
    agentId: string,
    state: AgentConversationState,
    options?: { preserveLocalMessagesOnEmpty?: boolean },
  ) => {
    const conversationId = state.conversationId;
    const conversationKey = agentConversationKey(agentId, conversationId);
    const nextMessages = messagesFromConversationState(state);
    setAgentConversationIds((current) => ({ ...current, [agentId]: conversationId }));
    setAgentMessagesByConversationKey((current) => {
      if (options?.preserveLocalMessagesOnEmpty && nextMessages.length === 0) {
        return current;
      }
      return {
        ...current,
        [conversationKey]: nextMessages,
      };
    });
    setAgentRecoveryRunsByConversationKey((current) => {
      const next = { ...current };
      if (state.running && state.activeRun?.loading) {
        next[conversationKey] = state.activeRun;
      } else {
        delete next[conversationKey];
      }
      return next;
    });
    setAgentContextUsageById((current) => ({ ...current, [agentId]: state.contextUsage }));
    setAgentChatPendingAgentId((current) => (
      state.running ? agentId : current === agentId ? null : current
    ));
  }, []);

  const refreshAgentConversationState = useCallback(async (agentId: string, conversationId: string, generation: number) => {
    try {
      const conversationState = await createApi().getAgentConversationState(agentId, conversationId, 80);
      if (focusLoadGenerationRef.current !== generation) return;
      if (conversationState.conversationId !== conversationId) return;
      applyAgentConversationState(agentId, conversationState, { preserveLocalMessagesOnEmpty: true });
    } catch (e) {
      if (focusLoadGenerationRef.current !== generation) return;
      setAgentChatError(errorMessage(e));
      setAgentContextUsageById((current) => ({
        ...current,
        [agentId]: current[agentId] ?? FALLBACK_CONTEXT_USAGE,
      }));
    }
  }, [applyAgentConversationState, createApi]);

  const loadFocusedAgentConversation = useCallback(async (agentId: string, generation: number) => {
    const api = createApi();
    try {
      const catalog = await api.listAgentConversations(agentId);
      if (focusLoadGenerationRef.current !== generation) return;
      const currentConversationId = catalog.currentConversationId || catalog.conversations.find((conversation) => conversation.running)?.conversationId || "";
      if (!currentConversationId) {
        if (!agentConversationIdsRef.current[agentId]) return;
        setAgentConversationIds((current) => {
          if (!current[agentId]) return current;
          const next = { ...current };
          delete next[agentId];
          return next;
        });
        return;
      }
      setAgentConversationIds((current) => ({ ...current, [agentId]: currentConversationId }));
      const conversationState = await api.getAgentConversationState(agentId, currentConversationId, 80);
      if (focusLoadGenerationRef.current !== generation) return;
      applyAgentConversationState(agentId, conversationState);
    } catch (e) {
      if (focusLoadGenerationRef.current !== generation) return;
      setAgentChatError(errorMessage(e));
      setAgentContextUsageById((current) => ({
        ...current,
        [agentId]: current[agentId] ?? FALLBACK_CONTEXT_USAGE,
      }));
    }
  }, [applyAgentConversationState, createApi]);

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

  const focusAgentNode = useCallback((node: AtlasAgentNode) => {
    if (agentFocus) return;
    setAgentPickerOpen(false);
    setAgentMessageInput("");
    setAgentChatError(null);
    setAgentChatNotice(null);
    setFocusPanel(null);
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
  }, [agentFocus, canvasViewport]);

  const collapseAgentFocus = useCallback(() => {
    focusLoadGenerationRef.current += 1;
    if (agentFocus) {
      setCanvasViewport(agentFocus.previousViewport);
    }
    setAgentMessageInput("");
    setAgentChatError(null);
    setAgentChatNotice(null);
    setFocusPanel(null);
    setAgentFocus(null);
  }, [agentFocus]);

  useEffect(() => {
    if (!focusedAgent) return;
    const generation = focusLoadGenerationRef.current + 1;
    focusLoadGenerationRef.current = generation;
    void loadFocusedAgentConversation(focusedAgent.agentId, generation);
    return () => {
      focusLoadGenerationRef.current += 1;
    };
  }, [focusedAgent?.agentId, loadFocusedAgentConversation]);

  const syncAgentContextUsage = useCallback(async (agentId: string, conversationId: string | undefined) => {
    if (!conversationId) {
      return;
    }
    try {
      const status = await createApi().getAgentChatStatus(agentId, conversationId);
      setAgentContextUsageById((current) => ({
        ...current,
        [agentId]: status.contextUsage,
      }));
      if (status.running) {
        setAgentChatPendingAgentId(agentId);
      }
    } catch (e) {
      setAgentContextUsageById((current) => ({
        ...current,
        [agentId]: current[agentId] ?? FALLBACK_CONTEXT_USAGE,
      }));
    }
  }, [createApi]);

  useEffect(() => {
    if (!focusedAgent) return;
    void syncAgentContextUsage(focusedAgent.agentId, focusedConversationId);
  }, [focusedAgent, focusedConversationId, syncAgentContextUsage]);

  const updateFocusedAssets = useCallback((agentId: string, updater: (assets: AgentAssetSummary[]) => AgentAssetSummary[]) => {
    setAgentSelectedAssetsById((current) => ({
      ...current,
      [agentId]: updater(current[agentId] ?? []),
    }));
  }, []);

  const removeFocusedAsset = useCallback((agentId: string, assetId: string) => {
    updateFocusedAssets(agentId, (assets) => assets.filter((asset) => asset.assetId !== assetId));
  }, [updateFocusedAssets]);

  const mergeAssetLibrary = useCallback((assets: AgentAssetSummary[]) => {
    if (assets.length === 0) return;
    setAssetLibrary((current) => {
      const byId = new Map<string, AgentAssetSummary>();
      for (const asset of [...assets, ...current]) {
        byId.set(asset.assetId, asset);
      }
      return [...byId.values()];
    });
  }, []);

  const loadAssetLibrary = useCallback(async () => {
    setAssetLibraryLoading(true);
    setAssetLibraryError(null);
    try {
      const assets = await createApi().listAssets(40);
      setAssetLibrary(assets);
    } catch (e) {
      setAssetLibraryError(errorMessage(e));
    } finally {
      setAssetLibraryLoading(false);
    }
  }, [createApi]);

  const openAssetLibrary = useCallback(() => {
    setFocusPanel((current) => current === "assets" ? null : "assets");
    void loadAssetLibrary();
  }, [loadAssetLibrary]);

  const selectAssetForFocusedAgent = useCallback((asset: AgentAssetSummary) => {
    if (!focusedAgent) return;
    if (focusedAgentAssets.some((current) => current.assetId === asset.assetId)) {
      setFocusPanel(null);
      return;
    }
    if (focusedAgentAssets.length >= MAX_FOCUSED_ASSETS) {
      setAgentChatError(`最多选择 ${MAX_FOCUSED_ASSETS} 个文件`);
      return;
    }
    updateFocusedAssets(focusedAgent.agentId, (assets) => (
      assets.some((current) => current.assetId === asset.assetId) ? assets : [...assets, asset]
    ));
    setFocusPanel(null);
  }, [focusedAgent, focusedAgentAssets, updateFocusedAssets]);

  const handleFocusFilesSelected = useCallback(async (files: FileList | null) => {
    if (!focusedAgent) return;
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) return;
    const remainingSlots = MAX_FOCUSED_ASSETS - focusedAgentAssets.length;
    if (selectedFiles.length > remainingSlots) {
      setAgentChatError(`最多选择 ${MAX_FOCUSED_ASSETS} 个文件`);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
    setComposerUploading(true);
    setAgentChatError(null);
    try {
      const assets = await createApi().uploadFilesAsAssets(selectedFiles, focusedConversationId);
      mergeAssetLibrary(assets);
      updateFocusedAssets(focusedAgent.agentId, (current) => {
        const byId = new Map(current.map((asset) => [asset.assetId, asset]));
        for (const asset of assets) {
          byId.set(asset.assetId, asset);
        }
        return [...byId.values()];
      });
    } catch (e) {
      setAgentChatError(errorMessage(e));
    } finally {
      setComposerUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [createApi, focusedAgent, focusedAgentAssets.length, focusedConversationId, mergeAssetLibrary, updateFocusedAssets]);

  const startFocusedAgentConversation = useCallback(async () => {
    if (!focusedAgent || isConversationCreatePending || isAgentChatPending) return;
    const agentId = focusedAgent.agentId;
    setConversationCreatePendingAgentId(agentId);
    setAgentChatError(null);
    try {
      const response = await createApi().createAgentConversation(agentId);
      const conversationId = response.currentConversationId || response.conversationId;
      const generation = focusLoadGenerationRef.current + 1;
      focusLoadGenerationRef.current = generation;
      setAgentConversationIds((current) => ({ ...current, [agentId]: conversationId }));
      setAgentMessagesByConversationKey((current) => ({
        ...current,
        [agentConversationKey(agentId, conversationId)]: [],
      }));
      setAgentSelectedAssetsById((current) => ({ ...current, [agentId]: [] }));
      setAgentMessageInput("");
      setFocusPanel(null);
      try {
        const conversationState = await createApi().getAgentConversationState(agentId, conversationId, 80);
        if (focusLoadGenerationRef.current === generation) {
          applyAgentConversationState(agentId, conversationState);
        }
      } catch (e) {
        if (focusLoadGenerationRef.current === generation) {
          setAgentChatError(errorMessage(e));
          await syncAgentContextUsage(agentId, conversationId);
        }
      }
    } catch (e) {
      setAgentChatError(errorMessage(e));
    } finally {
      setConversationCreatePendingAgentId((current) => current === agentId ? null : current);
    }
  }, [applyAgentConversationState, createApi, focusedAgent, isAgentChatPending, isConversationCreatePending, syncAgentContextUsage]);

  const interruptFocusedAgentRun = useCallback(async () => {
    if (!focusedAgent || !focusedConversationId || isInterruptPending) return;
    const agentId = focusedAgent.agentId;
    setInterruptPendingAgentId(agentId);
    setAgentChatError(null);
    try {
      const response = await createApi().interruptAgentChat(agentId, focusedConversationId);
      if (response.interrupted || response.reason === "not_running") {
        setAgentChatPendingAgentId((current) => current === agentId ? null : current);
      }
      await syncAgentContextUsage(agentId, focusedConversationId);
    } catch (e) {
      setAgentChatError(errorMessage(e));
    } finally {
      setInterruptPendingAgentId((current) => current === agentId ? null : current);
    }
  }, [createApi, focusedAgent, focusedConversationId, isInterruptPending, syncAgentContextUsage]);

  const applyFocusedStreamEvent = useCallback((
    agentId: string,
    generation: number,
    initialConversationId: string | undefined,
    currentConversationId: string | undefined,
    event: AgentChatStreamEvent,
  ) => {
    if (focusLoadGenerationRef.current !== generation) return;
    const eventConversationId = "conversationId" in event ? event.conversationId : undefined;
    const conversationId = eventConversationId || currentConversationId || initialConversationId;
    const currentKey = agentConversationKey(agentId, conversationId);

    if (event.type === "run_started") {
      const initialKey = agentConversationKey(agentId, initialConversationId);
      setAgentConversationIds((current) => ({ ...current, [agentId]: event.conversationId }));
      setAgentMessagesByConversationKey((current) => {
        if (initialKey === currentKey) return current;
        const initialMessages = current[initialKey] ?? [];
        const currentMessages = current[currentKey] ?? [];
        const next = {
          ...current,
          [currentKey]: [...currentMessages, ...initialMessages],
        };
        delete next[initialKey];
        return next;
      });
      setAgentChatPendingAgentId(agentId);
      return;
    }

    if (event.type === "text_delta") {
      setAgentMessagesByConversationKey((current) => ({
        ...current,
        [currentKey]: appendAssistantDelta(current[currentKey] ?? [], event.textDelta),
      }));
      return;
    }

    if (event.type === "done") {
      setAgentConversationIds((current) => ({ ...current, [agentId]: event.conversationId }));
      setAgentMessagesByConversationKey((current) => ({
        ...current,
        [currentKey]: finishAssistantMessage(current[currentKey] ?? [], event.text),
      }));
      setAgentSelectedAssetsById((current) => ({ ...current, [agentId]: [] }));
      setAgentRecoveryRunsByConversationKey((current) => {
        const next = { ...current };
        delete next[currentKey];
        return next;
      });
      setAgentChatPendingAgentId((current) => current === agentId ? null : current);
      void refreshAgentConversationState(agentId, event.conversationId, generation);
      return;
    }

    if (event.type === "interrupted") {
      setAgentConversationIds((current) => ({ ...current, [agentId]: event.conversationId }));
      setAgentMessagesByConversationKey((current) => ({
        ...current,
        [currentKey]: finishAssistantMessage(current[currentKey] ?? [], "本轮已中断"),
      }));
      setAgentRecoveryRunsByConversationKey((current) => {
        const next = { ...current };
        delete next[currentKey];
        return next;
      });
      setAgentChatPendingAgentId((current) => current === agentId ? null : current);
      void refreshAgentConversationState(agentId, event.conversationId, generation);
      return;
    }

    if (event.type === "queue_updated") {
      setAgentChatNotice("消息已加入队列");
      return;
    }

    if (event.type === "error") {
      setAgentChatError(event.message);
      setAgentRecoveryRunsByConversationKey((current) => {
        const next = { ...current };
        delete next[currentKey];
        return next;
      });
      setAgentChatPendingAgentId((current) => current === agentId ? null : current);
      void refreshAgentConversationState(agentId, event.conversationId, generation);
    }
  }, [refreshAgentConversationState]);

  useEffect(() => {
    if (!focusedAgent || !focusedConversationId || !focusedRecoveryRun?.loading) return;
    const agentId = focusedAgent.agentId;
    const conversationId = focusedConversationId;
    const generation = focusLoadGenerationRef.current;
    const controller = new AbortController();
    const api = createApi();
    let streamConversationId = conversationId;
    let terminalEventReceived = false;

    void api.streamAgentConversationEvents(agentId, {
      conversationId,
      ...(Number.isFinite(focusedRecoveryRun.eventCursor) && focusedRecoveryRun.eventCursor! > 0
        ? { afterEventCursor: Math.trunc(focusedRecoveryRun.eventCursor!) }
        : {}),
      signal: controller.signal,
    }, (event) => {
      if ("conversationId" in event) {
        streamConversationId = event.conversationId;
      }
      terminalEventReceived ||= isTerminalAgentChatStreamEvent(event);
      applyFocusedStreamEvent(agentId, generation, conversationId, streamConversationId, event);
    }).catch((e) => {
      if (controller.signal.aborted || focusLoadGenerationRef.current !== generation) return;
      setAgentChatError(errorMessage(e));
    }).finally(() => {
      if (controller.signal.aborted || focusLoadGenerationRef.current !== generation || terminalEventReceived) return;
      void refreshAgentConversationState(agentId, conversationId, generation);
    });

    return () => {
      controller.abort();
    };
  }, [
    applyFocusedStreamEvent,
    createApi,
    focusedAgent,
    focusedConversationId,
    focusedRecoveryRun?.eventCursor,
    focusedRecoveryRun?.loading,
    focusedRecoveryRun?.runId,
    refreshAgentConversationState,
  ]);

  const sendFocusedAgentMessage = useCallback(async () => {
    if (!focusedAgent) return;
    const message = agentMessageInput.trim();
    const assetRefs = focusedAgentAssets.map((asset) => asset.assetId);
    const outboundMessage = message || (assetRefs.length > 0 ? "请结合我引用的资产一起处理" : "");
    if (!outboundMessage) return;

    const agentId = focusedAgent.agentId;
    const conversationId = agentConversationIds[agentId];
    const messageKey = agentConversationKey(agentId, conversationId);
    const api = createApi();

    if (isAgentChatPending) {
      if (!conversationId) {
        setAgentChatError("当前没有可排队的运行会话");
        return;
      }
      setAgentMessageInput("");
      setAgentChatError(null);
      setAgentChatNotice(null);
      setAgentMessagesByConversationKey((current) => ({
        ...current,
        [messageKey]: [
          ...(current[messageKey] ?? []),
          { role: "user", text: outboundMessage, assetRefs: focusedAgentAssets },
        ],
      }));
      try {
        const response = await api.queueAgentMessage(agentId, {
          conversationId,
          message: outboundMessage,
          mode: "steer",
          ...(assetRefs.length > 0 ? { assetRefs } : {}),
        });
        if (response.queued) {
          setAgentChatNotice("消息已加入队列");
        } else {
          setAgentChatError(response.reason === "not_running" ? "当前会话没有正在运行的任务" : "消息未能加入队列");
        }
      } catch (e) {
        setAgentChatError(errorMessage(e));
      }
      return;
    }

    const generation = focusLoadGenerationRef.current + 1;
    focusLoadGenerationRef.current = generation;
    setAgentMessageInput("");
    setAgentChatError(null);
    setAgentChatNotice(null);
    setAgentMessagesByConversationKey((current) => ({
      ...current,
      [messageKey]: [
        ...(current[messageKey] ?? []),
        { role: "user", text: outboundMessage, assetRefs: focusedAgentAssets },
      ],
    }));
    setAgentChatPendingAgentId(agentId);

    let streamConversationId = conversationId;
    try {
      await api.streamAgentMessage(agentId, {
        message: outboundMessage,
        ...(conversationId ? { conversationId } : {}),
        ...(assetRefs.length > 0 ? { assetRefs } : {}),
      }, (event) => {
        if ("conversationId" in event) {
          streamConversationId = event.conversationId;
        }
        applyFocusedStreamEvent(agentId, generation, conversationId, streamConversationId, event);
      });
    } catch (e) {
      if (focusLoadGenerationRef.current === generation) {
        setAgentChatError(errorMessage(e));
      }
    } finally {
      if (focusLoadGenerationRef.current === generation) {
        setAgentChatPendingAgentId((current) => current === agentId ? null : current);
      }
    }
  }, [agentConversationIds, agentMessageInput, applyFocusedStreamEvent, createApi, focusedAgent, focusedAgentAssets, isAgentChatPending]);

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

  const focusedAgentWorkspace = isAgentFocused && focusedNode && focusedAgent ? (
    <section className="agent-focus-workspace" aria-label={`Agent Focus Workspace ${focusedAgent.name}`}>
      <header className="agent-focus-topbar" aria-label="Agent Focus topbar">
        <div className="agent-focus-topbar-actions">
          <button
            type="button"
            className="agent-focus-topbar-action"
            aria-label="新会话"
            onClick={() => void startFocusedAgentConversation()}
            disabled={isConversationCreatePending || isAgentChatPending}
          >
            <span>全新的记忆</span>
            <strong>{isConversationCreatePending ? "创建中" : "新会话"}</strong>
          </button>
          <button
            type="button"
            className="agent-focus-topbar-action"
            aria-label="文件库"
            onClick={openAssetLibrary}
            disabled={assetLibraryLoading}
            data-active={focusPanel === "assets" ? "true" : "false"}
          >
            <span>{assetLibraryLoading ? "读取中" : "复用项目文件"}</span>
            <strong>文件库</strong>
          </button>
        </div>
        <button
          type="button"
          className="agent-focus-context-shell"
          data-status={focusedContextUsage.status}
          data-active={focusPanel === "context" ? "true" : "false"}
          aria-label={`上下文使用 ${focusedContextUsage.percent}%`}
          onClick={() => setFocusPanel((current) => current === "context" ? null : "context")}
        >
          <span className="agent-focus-context-battery">
            <span
              className="agent-focus-context-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={focusedContextUsage.percent}
              style={{ width: `${focusedContextUsage.percent}%` }}
            />
          </span>
          <span className="agent-focus-context-summary">{focusedContextUsage.percent}%</span>
          <span className="agent-focus-context-toggle">上下文详情</span>
        </button>
      </header>

      <article className="agent-focus-card" data-agent-id={focusedAgent.agentId}>
        <div className="agent-focus-card-status" />
        <div className="agent-focus-card-content">
          <div className="agent-focus-card-header">
            <span className="agent-focus-card-kind">Agent</span>
            <span className="agent-focus-card-pill">已锁定</span>
          </div>
          <div className="agent-focus-card-body">
            <span className="agent-focus-card-title">{focusedAgent.name}</span>
            <span className="agent-focus-card-meta">{focusedAgent.agentId}</span>
            <span className="agent-focus-card-description">{focusedAgent.description}</span>
            <span className="agent-focus-card-binding">{formatAgentBinding(focusedAgent)}</span>
          </div>
        </div>
        <button type="button" className="agent-collapse-btn" onClick={collapseAgentFocus}>
          收起
        </button>
      </article>

      {focusPanel === "assets" && (
        <section className="agent-focus-panel" role="dialog" aria-label="文件库">
          <header className="agent-focus-panel-head">
            <div>
              <strong>文件库</strong>
              <span>{assetLibraryLoading ? "正在加载可复用文件" : `${assetLibrary.length} 个可复用文件`}</span>
            </div>
            <button type="button" onClick={() => setFocusPanel(null)}>关闭</button>
          </header>
          <div className="agent-focus-panel-body">
            {assetLibraryError && <div className="agent-focus-error" role="alert">{assetLibraryError}</div>}
            {assetLibraryLoading ? (
              <div className="agent-focus-panel-empty">文件库加载中...</div>
            ) : assetLibrary.length === 0 ? (
              <div className="agent-focus-panel-empty">暂无可复用文件。</div>
            ) : (
              <div className="agent-focus-asset-list">
                {assetLibrary.map((asset) => {
                  const selected = focusedAgentAssets.some((current) => current.assetId === asset.assetId);
                  return (
                    <div key={asset.assetId} className={`agent-focus-asset-row ${selected ? "active" : ""}`}>
                      <div className="agent-focus-asset-copy">
                        <strong>{asset.fileName}</strong>
                        <span>{asset.kind} / {asset.mimeType || "application/octet-stream"} / {formatFileSize(asset.sizeBytes)}</span>
                      </div>
                      <button
                        type="button"
                        disabled={selected}
                        aria-label={`复用 ${asset.fileName}`}
                        onClick={() => selectAssetForFocusedAgent(asset)}
                      >
                        {selected ? "已选" : "复用"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {focusPanel === "context" && (
        <section className="agent-focus-panel agent-focus-panel-compact" role="dialog" aria-label="上下文使用情况">
          <header className="agent-focus-panel-head">
            <div>
              <strong>上下文使用情况</strong>
              <span>{focusedContextUsage.mode === "usage" ? "基于最近一次 usage" : "按当前输入估算"}</span>
            </div>
            <button type="button" onClick={() => setFocusPanel(null)}>关闭</button>
          </header>
          <div className="agent-focus-context-detail">
            <strong>{focusedContextUsage.percent}%</strong>
            <span>{Math.round(focusedContextUsage.currentTokens).toLocaleString("en-US")} / {Math.round(focusedContextUsage.contextWindow).toLocaleString("en-US")} tokens</span>
            <span>待发 {focusedContextUsage.draftTokens.toLocaleString("en-US")} · 可用 {Math.round(focusedContextUsage.availableTokens).toLocaleString("en-US")}</span>
          </div>
        </section>
      )}

      <section className="agent-focus-chat-stage" aria-label={`Agent Chat ${focusedAgent.name}`}>
        <div className="agent-focus-watermark" aria-hidden="true">UGK CLAW</div>
        <header className="agent-focus-chat-head">
          <strong>对话流</strong>
          <span>{focusedAgent.name} / {focusedAgent.agentId}</span>
        </header>
        <div className="agent-focus-transcript" aria-label="Agent messages">
          {focusedAgentMessages.length === 0 ? (
            <div className="agent-focus-empty">当前 Agent 会话尚未开始。</div>
          ) : (
            focusedAgentMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`agent-focus-message ${message.role}`}
              >
                <div className="agent-focus-message-meta">
                  <strong>{message.role === "user" ? "User" : "Agent"}</strong>
                </div>
                <div className="agent-focus-message-body">
                  <p className="agent-focus-message-content">{message.text}</p>
                  {message.assetRefs && message.assetRefs.length > 0 && (
                    <div className="agent-focus-message-assets" aria-label="Message attachments">
                      {message.assetRefs.map((asset) => (
                        <span key={asset.assetId} className="agent-focus-message-asset">
                          <span className="agent-focus-file-badge">{asset.kind === "text" ? "TXT" : "FILE"}</span>
                          <span className="agent-focus-file-name">{asset.fileName}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {isAgentChatPending && <div className="agent-focus-loading">发送中...</div>}
          {agentChatNotice && <div className="agent-focus-loading">{agentChatNotice}</div>}
          {agentChatError && <div className="agent-focus-error" role="alert">{agentChatError}</div>}
        </div>
        <form
          className="agent-focus-command-deck"
          onSubmit={(event) => {
            event.preventDefault();
            void sendFocusedAgentMessage();
          }}
        >
          <div className={`agent-focus-selected-assets ${focusedAgentAssets.length > 0 || composerUploading ? "visible" : ""}`} aria-live="polite">
            {composerUploading && <span className="agent-focus-uploading">上传中</span>}
            {focusedAgentAssets.map((asset) => (
              <div key={asset.assetId} className="agent-focus-file-chip">
                <span className="agent-focus-file-badge">{asset.kind === "text" ? "TXT" : "FILE"}</span>
                <span className="agent-focus-file-name">{asset.fileName}</span>
                <button type="button" aria-label={`移除 ${asset.fileName}`} onClick={() => removeFocusedAsset(focusedAgent.agentId, asset.assetId)}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <section className="agent-focus-composer">
            <input
              id="agent-focus-file-input"
              ref={fileInputRef}
              className="agent-focus-file-input"
              name="agentFocusFiles"
              type="file"
              multiple
              onChange={(event) => void handleFocusFilesSelected(event.currentTarget.files)}
            />
            <button
              type="button"
              className="agent-focus-file-action"
              aria-label="选择文件"
              title="选择文件"
              disabled={composerUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <span aria-hidden="true">+</span>
            </button>
            <label className="sr-only" htmlFor="agent-chat-input">Agent message</label>
            <div className="agent-focus-composer-main">
              <div className="agent-focus-composer-header">
                <span>消息</span>
              </div>
              <textarea
                id="agent-chat-input"
                value={agentMessageInput}
                onChange={(event) => setAgentMessageInput(event.target.value)}
                aria-label="Agent message"
                placeholder={`和 ${focusedAgent.name} 聊聊吧`}
                rows={2}
              />
            </div>
            <div className="agent-focus-composer-side">
              <button
                type="button"
                disabled={!isAgentChatPending || isInterruptPending || !focusedConversationId}
                onClick={() => void interruptFocusedAgentRun()}
              >
                {isInterruptPending ? "中断中" : "打断"}
              </button>
              <button
                type="submit"
                disabled={(!agentMessageInput.trim() && focusedAgentAssets.length === 0) || composerUploading}
              >
                发送
              </button>
            </div>
          </section>
        </form>
      </section>
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
          <button
            className={`fixture-btn ${selectedFixtureId === CLEAN_AGENT_WORKSPACE_ID ? "active" : ""}`}
            onClick={() => setSelectedFixtureId(CLEAN_AGENT_WORKSPACE_ID)}
          >
            Agent workspace
          </button>
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
                focusedAgentNodeId={focusedNode?.nodeId ?? null}
                onSelectAgent={focusAgentNode}
                onMoveAgent={moveAgentNode}
                canMoveAgents={!agentFocus}
                agentFocusWorkspace={focusedAgentWorkspace}
                viewport={canvasViewport}
                onViewportChange={setCanvasViewport}
                toolbarStart={agentToolbar}
                interactionMode={agentFocus ? "locked" : "free"}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
