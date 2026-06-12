import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { LiveTeamApi } from "../api/team-api";
import type { TeamCanvasSourceNode, TeamCanvasTask, TeamApiError, TeamRunState, TeamAttemptMetadata, TeamTaskRunHistoryItem, TeamTaskUpdateRequest, TeamTaskInputPort, TeamTaskOutputPort, TeamTaskConnection, TeamManualUpstreamRunSelection, TeamTaskRunCreateRequest, TeamDiscoveryChannelSet } from "../api/team-types";
import { MockTeamApi } from "../fixtures/team-fixtures";
import { useTeamConsoleLiveData, type DataSource, type TeamConsoleUiResetReason, CLEAN_AGENT_WORKSPACE_ID, mergeTaskRun } from "./use-team-console-live-data";
import { useTaskBranchStack } from "./use-task-branch-stack";
import { buildDiscoveryChannelSetLookup, buildDiscoveryChannelSetSelectionSummary } from "./discovery-channel-set-view-model";
import { mergeRunHistoryItems, buildRunHistoryAnalysisContext, buildTaskRunFileDescriptors, selectLatestAttempt, type TaskRunObserverFileDescriptor, type RunHistoryAnalysisTask } from "./run-history-observer-model";
import { deriveManualUpstreamInputMetadata, formatRunTimestamp, renderFileDetailContent, renderRoleProcessNode, taskRunAttempts, taskRunElapsed, taskRunMessage, taskRunObserverFileDetailPanelIdPrefix, taskRunObserverPanelId, taskRunPhase, type TaskRunObserverPanelKind, type TaskRunObserverState } from "./team-console-run-observer-rendering";
import { hasDirtyTaskEditConflict, useTaskEditState } from "./use-task-edit-state";
import { useTaskLeaderCopy } from "./use-task-leader-copy";
import { hasMissingRequiredTemplateBindings, normalizedTemplateBindings, renderTemplateParameterControl, templateBindingsForTask, type TaskCloneDraft, type TaskParameterDraft } from "./team-console-task-template-parameters";
import { discoveryGeneratedVisualState, discoveryStageMeta, selectActiveDiscoveryRootRun, selectLatestRun, sortDiscoveryGeneratedTasksForSubcanvas, visibleDiscoveryGeneratedRuns } from "./team-console-discovery-run-state";
import { hasSameTaskGroupRunPollingSignature, isActiveTaskGroupRun, selectLatestTaskGroupRun } from "./team-console-task-group-run-state";
import { buildLiveTaskGroups, type StoredTaskGroupDisplayState, type TaskGroupRunUiState } from "./team-console-task-group-projection";
import {
  filterLoadedTaskRunByTaskId,
  filterLoadedTaskRunSelectionsByTaskIds,
  liveSourceRefreshPositions,
  liveTaskRefreshPositions,
  parseStoredCanvasUiStateByContext,
  readInitialRootNodeFilter,
  readStoredCanvasUiState,
  readStoredInitialDataSource,
  readStoredLiveAgentNodes,
  writeStoredCanvasUiState,
  writeStoredLiveAgentNodes,
  writeStoredLiveSourceNodes,
  writeStoredLiveTaskNodes,
  type AgentBranchMode,
  type AgentBranchState,
  type StoredCanvasUiState,
  type StoredCanvasUiStateByContext,
} from "./canvas-ui-state-storage";
import { inferSourceFileType, makeAgentNode, makeSourceNodes, makeTaskNodes, mergeStoredAgentNodes, mergeStoredSourceNodePositions, mergeStoredTaskNodePositions, sameAgentNodes, sameSourceNodes, sameTaskNodes } from "./team-console-canvas-node-projection";
import { ExecutionMap, type AtlasAgentNode, type AtlasBranchLayoutState, type AtlasSelectedNodeEntry, type AtlasSourceNode, type AtlasTaskGroup, type AtlasTaskNode } from "../graph/ExecutionMap";
import type { AtlasViewport } from "../graph/AtlasCanvasShell";
import { RUN_STATUS_LABELS, isActiveRun } from "../shared/status";
import "./app.css";

const TEAM_CONSOLE_THEME_STORAGE_KEY = "ugk-team-console:theme:v1";
const TEAM_CONSOLE_VISUAL_THEME_STORAGE_KEY = "ugk-team-console:visual-theme:v1";
const DISCOVERY_QUEUE_INITIAL_CARD_LIMIT = 18;
const RUN_HISTORY_PAGE_SIZE = 3;

type RunHistoryPanelState = {
  items: TeamTaskRunHistoryItem[];
  total: number;
  loading: boolean;
  error: string | null;
  savingRunId: string | null;
};

const emptyRunHistoryPanelState: RunHistoryPanelState = {
  items: [],
  total: 0,
  loading: false,
  error: null,
  savingRunId: null,
};
const CANVAS_LOADING_MIN_VISIBLE_MS = 160;

type TeamConsoleTheme = "light" | "dark";
type TeamConsoleVisualTheme = "default" | "dell-1996";
type RootNodeFilter = "all" | "agent" | "task" | "source";
type DiscoveryChannelSetRunOptions = {
  discoveryChannelSetId?: string;
};

type DiscoveryChannelSetSaveOptions = {
  forceCreate?: boolean;
};

type TaskConnectionDraft = {
  fromTaskId: string;
  fromOutputPortId: string;
  type: string;
};

type SourceConnectionDraft = {
  fromSourceNodeId: string;
  fromOutputPortId: string;
  type: string;
};

type RootArchiveConfirm =
  | { kind: "source"; sourceNodeId: string; nodeId: string; title: string }
  | { kind: "task"; task: TeamCanvasTask; nodeId: string }
  | { kind: "agent"; nodeId: string; agentId: string; name: string }
  | { kind: "batch"; items: Array<RootArchiveConfirm> };

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as TeamApiError).message);
  }
  if (error instanceof Error) return error.message;
  return "未知错误";
}

function playgroundBaseUrlPrefix(): string {
  const configured = import.meta.env.VITE_TEAM_CONSOLE_PLAYGROUND_BASE_URL;
  return typeof configured === "string" && configured.trim()
    ? configured.trim().replace(/\/+$/, "")
    : "";
}

type AgentPlaygroundEmbedMode = "mini" | "full";

function buildAgentPlaygroundUrl(agentId: string, mode: AgentBranchMode = "chat", embedMode: AgentPlaygroundEmbedMode = "full"): string {
  const params = new URLSearchParams({
    view: "chat",
    agentId,
    embed: "team-console",
    embedMode,
  });
  if (mode === "task-create") {
    params.set("teamTaskMode", "create");
  }
  return `${playgroundBaseUrlPrefix()}/playground?${params.toString()}`;
}

function formatTaskLeaderContext(task: TeamCanvasTask): string {
  const wu = task.workUnit;
  const formatPorts = (ports: TeamTaskInputPort[] | TeamTaskOutputPort[] | undefined) => {
    if (!ports || ports.length === 0) return "- none";
    return ports.map((p) => `- ${p.id} [${p.type}] ${p.label ?? ""}`).join("\n");
  };
  const rulesText = wu.acceptance.rules.length > 0
    ? wu.acceptance.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")
    : "- none";
  return [
    "Team Console 当前 Task 上下文",
    "",
    "请先理解这个 Task，不要运行 Task。我要修改它的定义/规则时，请基于 taskId 使用 /team-task 更新，并在写入前展示完整变更让我确认。",
    "",
    `taskId: ${task.taskId}`,
    `title: ${task.title}`,
    `status: ${task.status}`,
    `leaderAgentId: ${task.leaderAgentId}`,
    `workerAgentId: ${wu.workerAgentId}`,
    `checkerAgentId: ${wu.checkerAgentId}`,
    `teamTaskMode: edit`,
    `teamTaskId: ${task.taskId}`,
    "",
    "workUnit.input.text:",
    wu.input.text || "(empty)",
    "",
    "workUnit.inputPorts:",
    formatPorts(wu.inputPorts),
    "",
    "workUnit.outputPorts:",
    formatPorts(wu.outputPorts),
    "",
    "workUnit.outputContract.text:",
    wu.outputContract.text || "(empty)",
    "",
    "workUnit.acceptance.rules:",
    rulesText,
  ].join("\n");
}

function buildTaskLeaderPlaygroundUrl(task: TeamCanvasTask, embedMode: AgentPlaygroundEmbedMode = "full"): string {
  const params = new URLSearchParams({
    view: "chat",
    agentId: task.leaderAgentId,
    embed: "team-console",
    embedMode,
    teamTaskId: task.taskId,
    teamTaskMode: "edit",
  });
  return `${playgroundBaseUrlPrefix()}/playground?${params.toString()}`;
}

function taskMenuPanelId(nodeId: string): string {
  return `task-menu-${nodeId}`;
}

function taskRunHistoryPanelId(nodeId: string, generated: boolean): string {
  return `${generated ? "generated-run-history" : "run-history"}-${nodeId}`;
}

function useMinimumVisibleFlag(active: boolean, minVisibleMs: number): boolean {
  const [visible, setVisible] = useState(active && minVisibleMs > 0);
  const visibleSinceRef = useRef<number | null>(active && minVisibleMs > 0 ? Date.now() : null);

  useEffect(() => {
    if (active) {
      visibleSinceRef.current = minVisibleMs > 0 ? Date.now() : null;
      setVisible(minVisibleMs > 0);
      return undefined;
    }

    if (!visible) return undefined;

    const visibleSince = visibleSinceRef.current ?? Date.now();
    const remainingMs = Math.max(0, minVisibleMs - (Date.now() - visibleSince));
    const timer = globalThis.setTimeout(() => {
      visibleSinceRef.current = null;
      setVisible(false);
    }, remainingMs);

    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [active, minVisibleMs, visible]);

  return visible;
}

function readStoredTheme(): TeamConsoleTheme {
  try {
    const value = globalThis.localStorage?.getItem(TEAM_CONSOLE_THEME_STORAGE_KEY);
    return value === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function storeTheme(theme: TeamConsoleTheme): void {
  try {
    globalThis.localStorage?.setItem(TEAM_CONSOLE_THEME_STORAGE_KEY, theme);
  } catch {
    // Theme persistence is best-effort; the UI state still updates in memory.
  }
}

function readStoredVisualTheme(): TeamConsoleVisualTheme {
  try {
    const value = globalThis.localStorage?.getItem(TEAM_CONSOLE_VISUAL_THEME_STORAGE_KEY);
    return value === "dell-1996" ? "dell-1996" : "default";
  } catch {
    return "default";
  }
}

function storeVisualTheme(visualTheme: TeamConsoleVisualTheme): void {
  try {
    globalThis.localStorage?.setItem(TEAM_CONSOLE_VISUAL_THEME_STORAGE_KEY, visualTheme);
  } catch {
    // Theme persistence is best-effort; the UI state still updates in memory.
  }
}

type LoadedTaskRunSnapshot = {
  taskId: string;
  runId: string;
  status: TeamRunState["status"];
};

function buildLoadedUpstreamRunSelections(
  targetTask: TeamCanvasTask,
  taskConnections: TeamTaskConnection[],
  loadedTaskRunByTaskId: Record<string, string>,
  loadedTaskRunSnapshotByTaskId: Record<string, LoadedTaskRunSnapshot>,
  taskRunsByTaskId: Record<string, TeamRunState[]>,
): TeamManualUpstreamRunSelection[] {
  const selections: TeamManualUpstreamRunSelection[] = [];
  for (const connection of taskConnections) {
    if (connection.toTaskId !== targetTask.taskId || connection.status === "stale") continue;
    const loadedRunId = loadedTaskRunByTaskId[connection.fromTaskId];
    if (!loadedRunId) continue;
    const loadedSnapshot = loadedTaskRunSnapshotByTaskId[connection.fromTaskId];
    if (loadedSnapshot?.runId === loadedRunId && loadedSnapshot.status !== "completed") continue;
    const knownRuns = taskRunsByTaskId[connection.fromTaskId] ?? [];
    if (knownRuns.some((run) => isActiveRun(run.status))) continue;
    const knownLoadedRun = knownRuns.find((run) => run.runId === loadedRunId);
    if (knownLoadedRun && knownLoadedRun.status !== "completed") continue;
    selections.push({ connectionId: connection.connectionId, fromRunId: loadedRunId });
  }
  return selections;
}

export function App() {
  const initialDataSourceRef = useRef<DataSource>(readStoredInitialDataSource());
  const [theme, setTheme] = useState<TeamConsoleTheme>(() => readStoredTheme());
  const [visualTheme, setVisualTheme] = useState<TeamConsoleVisualTheme>(() => readStoredVisualTheme());
  const effectiveTheme: TeamConsoleTheme = visualTheme === "dell-1996" ? "light" : theme;
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [focusedTaskNodeId, setFocusedTaskNodeId] = useState<string | null>(null);
  const [agentNodes, setAgentNodes] = useState<AtlasAgentNode[]>([]);
  const [liveAgentNodesHydrated, setLiveAgentNodesHydrated] = useState(false);
  const [taskConnectionDraft, setTaskConnectionDraft] = useState<TaskConnectionDraft | null>(null);
  const [taskDependencyDraft, setTaskDependencyDraft] = useState<{ fromTaskId: string } | null>(null);
  const [sourceConnectionDraft, setSourceConnectionDraft] = useState<SourceConnectionDraft | null>(null);
  const [taskRunSavingByTaskId, setTaskRunSavingByTaskId] = useState<Record<string, boolean>>({});
  const [generatedResetSavingByTaskId, setGeneratedResetSavingByTaskId] = useState<Record<string, boolean>>({});
  const [generatedArchiveConfirmTaskId, setGeneratedArchiveConfirmTaskId] = useState<string | null>(null);
  const [generatedArchiveSavingByTaskId, setGeneratedArchiveSavingByTaskId] = useState<Record<string, boolean>>({});
  const [generatedActionMenuTaskId, setGeneratedActionMenuTaskId] = useState<string | null>(null);
  const [selectedDiscoveryChannelTaskIdsByTaskId, setSelectedDiscoveryChannelTaskIdsByTaskId] = useState<Record<string, string[]>>({});
  const [selectedDiscoveryChannelSetIdByTaskId, setSelectedDiscoveryChannelSetIdByTaskId] = useState<Record<string, string | null>>({});
  const [discoveryChannelSetTitleByTaskId, setDiscoveryChannelSetTitleByTaskId] = useState<Record<string, string>>({});
  const [discoveryChannelSetsByTaskId, setDiscoveryChannelSetsByTaskId] = useState<Record<string, TeamDiscoveryChannelSet[]>>({});
  const [discoveryChannelSetLoadingByTaskId, setDiscoveryChannelSetLoadingByTaskId] = useState<Record<string, boolean>>({});
  const [discoveryChannelSetSavingByTaskId, setDiscoveryChannelSetSavingByTaskId] = useState<Record<string, boolean>>({});
  const [discoveryChannelSetArchivingById, setDiscoveryChannelSetArchivingById] = useState<Record<string, boolean>>({});
  const [discoveryRunPolicySavingByTaskId, setDiscoveryRunPolicySavingByTaskId] = useState<Record<string, boolean>>({});
  const discoveryChannelSetLoadKeysRef = useRef<Set<string>>(new Set());
  const [taskRunObserverByRunId, setTaskRunObserverByRunId] = useState<Record<string, TaskRunObserverState>>({});
  const taskRunObserverByRunIdRef = useRef(taskRunObserverByRunId);
  const [runHistoryTaskId, setRunHistoryTaskId] = useState<string | null>(null);
  const [runHistoryByTaskId, setRunHistoryByTaskId] = useState<Record<string, RunHistoryPanelState>>({});
  const runHistoryRequestKeyByTaskIdRef = useRef<Record<string, string>>({});
  const [runHistoryIncludeArchived, setRunHistoryIncludeArchived] = useState(false);
  const [runHistoryAnalysisCopyState, setRunHistoryAnalysisCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [runHistoryAnalysisManualText, setRunHistoryAnalysisManualText] = useState<string | null>(null);
  const [loadedTaskRunByTaskId, setLoadedTaskRunByTaskId] = useState<Record<string, string>>({});
  const [loadedTaskRunSnapshotByTaskId, setLoadedTaskRunSnapshotByTaskId] = useState<Record<string, LoadedTaskRunSnapshot>>({});
  const [taskNodes, setTaskNodes] = useState<AtlasTaskNode[]>([]);
  const [mockTaskGroups, setMockTaskGroups] = useState<AtlasTaskGroup[]>([]);
  const [taskGroupDisplayStates, setTaskGroupDisplayStates] = useState<StoredTaskGroupDisplayState[]>([]);
  const [taskGroupRunUiState, setTaskGroupRunUiState] = useState<TaskGroupRunUiState>({
    latestByGroupId: {},
    savingByGroupId: {},
  });
  const [selectedAtlasEntries, setSelectedAtlasEntries] = useState<AtlasSelectedNodeEntry[]>([]);
  const updateSelectedAtlasEntries = useCallback((entries: AtlasSelectedNodeEntry[]) => {
    setSelectedAtlasEntries((current) => {
      if (current.length !== entries.length) return entries;
      const same = current.every((entry, index) => {
        const next = entries[index];
        if (!next || entry.kind !== next.kind || entry.nodeId !== next.nodeId) return false;
        if (entry.kind === "agent" && next.kind === "agent") return entry.agentId === next.agentId;
        if (entry.kind === "task" && next.kind === "task") return entry.taskId === next.taskId;
        if (entry.kind === "source" && next.kind === "source") return entry.sourceNodeId === next.sourceNodeId;
        return false;
      });
      return same ? current : entries;
    });
  }, []);
  const [taskCloneDraftByTaskId, setTaskCloneDraftByTaskId] = useState<Record<string, TaskCloneDraft>>({});
  const [taskCloneSavingByTaskId, setTaskCloneSavingByTaskId] = useState<Record<string, boolean>>({});
  const [taskParameterDraftByTaskId, setTaskParameterDraftByTaskId] = useState<Record<string, TaskParameterDraft>>({});
  const [taskParameterSavingByTaskId, setTaskParameterSavingByTaskId] = useState<Record<string, boolean>>({});
  const [liveTaskNodesHydrated, setLiveTaskNodesHydrated] = useState(false);
  const [sourceAtlasNodes, setSourceAtlasNodes] = useState<AtlasSourceNode[]>([]);
  const [liveSourceNodesHydrated, setLiveSourceNodesHydrated] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [taskLeaderPickerOpen, setTaskLeaderPickerOpen] = useState(false);
  const sourceFileInputRef = useRef<HTMLInputElement | null>(null);
  const runHistoryAnalysisManualCopyRef = useRef<HTMLTextAreaElement | null>(null);
  const [canvasViewport, setCanvasViewport] = useState<AtlasViewport>({ x: 0, y: 0, scale: 1 });
  const [expandedAgentBranch, setExpandedAgentBranch] = useState<AgentBranchState | null>(null);
  const [canvasBranchLayout, setCanvasBranchLayout] = useState<AtlasBranchLayoutState>({});
  const updateCanvasBranchLayout = useCallback((layout: AtlasBranchLayoutState) => {
    setCanvasBranchLayout((current) => (
      JSON.stringify(current) === JSON.stringify(layout) ? current : layout
    ));
  }, []);
  const [minimizedAgentNodeIds, setMinimizedAgentNodeIds] = useState<string[]>([]);
  const [minimizedTaskNodeIds, setMinimizedTaskNodeIds] = useState<string[]>([]);
  const [minimizedSourceNodeIds, setMinimizedSourceNodeIds] = useState<string[]>([]);
  const [minimizedTaskGroupIds, setMinimizedTaskGroupIds] = useState<string[]>([]);

  useEffect(() => {
    taskRunObserverByRunIdRef.current = taskRunObserverByRunId;
  }, [taskRunObserverByRunId]);

  useEffect(() => {
    if (!focusedTaskNodeId) return;
    if (taskNodes.some((node) => node.nodeId === focusedTaskNodeId)) return;
    setFocusedTaskNodeId(null);
  }, [focusedTaskNodeId, taskNodes]);

  useEffect(() => {
    if (runHistoryAnalysisCopyState !== "failed" || !runHistoryAnalysisManualText) return;
    runHistoryAnalysisManualCopyRef.current?.focus();
    runHistoryAnalysisManualCopyRef.current?.select();
  }, [runHistoryAnalysisCopyState, runHistoryAnalysisManualText]);
  const [canvasUiStateHydrated, setCanvasUiStateHydrated] = useState(false);
  const [canvasUiStateRestoreHasStoredState, setCanvasUiStateRestoreHasStoredState] = useState(
    () => readStoredCanvasUiState(readStoredInitialDataSource(), CLEAN_AGENT_WORKSPACE_ID) !== null,
  );
  const [sharedCanvasUiState, setSharedCanvasUiState] = useState<StoredCanvasUiStateByContext | null>(null);
  const [sharedCanvasUiStateLoaded, setSharedCanvasUiStateLoaded] = useState(false);
  const sharedCanvasUiStateSaveTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const sharedCanvasUiStatePersistedJsonRef = useRef<string | null>(null);
  const liveCanvasUiStateHydratingRef = useRef(false);
  const {
    taskEditDraftByTaskId,
    taskEditSavingByTaskId,
    taskEditWarningByTaskId,
    openTaskEditDraft,
    updateTaskEditDraft,
    replaceTaskEditDraft,
    clearTaskEditState,
    clearTaskEditWarning,
    setTaskEditWarning,
    setTaskEditSaving,
  } = useTaskEditState();
  const [taskArchiveConfirmNodeId, setTaskArchiveConfirmNodeId] = useState<string | null>(null);
  const [taskArchiveSavingNodeId, setTaskArchiveSavingNodeId] = useState<string | null>(null);
  const [rootArchiveConfirm, setRootArchiveConfirm] = useState<RootArchiveConfirm | null>(null);
  const [rootArchiveSaving, setRootArchiveSaving] = useState(false);
  const [rootNodeFilter, setRootNodeFilter] = useState<RootNodeFilter>(() => readInitialRootNodeFilter());
  const {
    taskLeaderCopyByTaskId,
    copyTaskLeaderContext,
    clearTaskLeaderCopy,
    registerTaskLeaderManualCopyRef,
  } = useTaskLeaderCopy();

  const clearTaskCloneState = useCallback((taskId?: string) => {
    if (!taskId) {
      setTaskCloneDraftByTaskId({});
      setTaskCloneSavingByTaskId({});
      return;
    }
    setTaskCloneDraftByTaskId((current) => {
      if (!(taskId in current)) return current;
      const next = { ...current };
      delete next[taskId];
      return next;
    });
    setTaskCloneSavingByTaskId((current) => {
      if (!(taskId in current)) return current;
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }, []);

  const clearTaskParameterState = useCallback((taskId?: string) => {
    if (!taskId) {
      setTaskParameterDraftByTaskId({});
      setTaskParameterSavingByTaskId({});
      return;
    }
    setTaskParameterDraftByTaskId((current) => {
      if (!(taskId in current)) return current;
      const next = { ...current };
      delete next[taskId];
      return next;
    });
    setTaskParameterSavingByTaskId((current) => {
      if (!(taskId in current)) return current;
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }, []);

  const openTaskParameterDraft = useCallback((task: TeamCanvasTask) => {
    setTaskParameterDraftByTaskId((current) => ({
      ...current,
      [task.taskId]: {
        templateBindings: templateBindingsForTask(task),
      },
    }));
  }, []);

  const updateTaskParameterBinding = useCallback((taskId: string, parameterId: string, value: string) => {
    setTaskParameterDraftByTaskId((current) => {
      const draft = current[taskId];
      if (!draft) return current;
      return {
        ...current,
        [taskId]: {
          templateBindings: {
            ...draft.templateBindings,
            [parameterId]: value,
          },
        },
      };
    });
  }, []);

  const openTaskCloneDraft = useCallback((task: TeamCanvasTask) => {
    const templateBindings = Object.fromEntries(
      (task.templateConfig?.parameters ?? []).map((parameter) => [parameter.id, parameter.defaultValue ?? ""]),
    );
    setTaskCloneDraftByTaskId((current) => ({
      ...current,
      [task.taskId]: {
        title: `${task.title} 副本`,
        templateBindings,
      },
    }));
  }, []);

  const updateTaskCloneTitle = useCallback((taskId: string, title: string) => {
    setTaskCloneDraftByTaskId((current) => {
      const draft = current[taskId];
      if (!draft) return current;
      return {
        ...current,
        [taskId]: { ...draft, title },
      };
    });
  }, []);

  const updateTaskCloneBinding = useCallback((taskId: string, parameterId: string, value: string) => {
    setTaskCloneDraftByTaskId((current) => {
      const draft = current[taskId];
      if (!draft) return current;
      return {
        ...current,
        [taskId]: {
          ...draft,
          templateBindings: {
            ...draft.templateBindings,
            [parameterId]: value,
          },
        },
      };
    });
  }, []);

  const clearTaskPanelState = useCallback((taskId?: string) => {
    clearTaskEditState(taskId);
    clearTaskCloneState(taskId);
    clearTaskParameterState(taskId);
    setTaskArchiveConfirmNodeId(null);
    setTaskArchiveSavingNodeId(null);
  }, [clearTaskCloneState, clearTaskEditState, clearTaskParameterState]);

  useEffect(() => {
    storeTheme(theme);
  }, [theme]);

  const clearGeneratedArchiveUiForTasks = useCallback((taskIds: string[]) => {
    if (taskIds.length === 0) return;
    const taskIdSet = new Set(taskIds);
    setGeneratedArchiveConfirmTaskId((current) => (
      current && taskIdSet.has(current) ? null : current
    ));
    setGeneratedArchiveSavingByTaskId((current) => {
      let changed = false;
      const next = { ...current };
      for (const taskId of taskIdSet) {
        if (taskId in next) {
          delete next[taskId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);

  const closeTaskPickersBeforeTaskBranch = useCallback(() => {
    setAgentPickerOpen(false);
    setTaskLeaderPickerOpen(false);
  }, []);

  const {
    expandedTaskBranches,
    setExpandedTaskBranches,
    closeTaskBranch,
    openOrToggleTaskBranch,
    pruneTaskBranches,
  } = useTaskBranchStack({
    onClearTaskPanelState: clearTaskPanelState,
    onBeforeOpenTaskBranch: closeTaskPickersBeforeTaskBranch,
  });

  const resetContextUi = useCallback((reason: TeamConsoleUiResetReason) => {
    setSelectedTaskId(null);
    setTaskConnectionDraft(null);
    setTaskDependencyDraft(null);
    setSourceConnectionDraft(null);
    setMockTaskGroups([]);
    setMinimizedTaskGroupIds([]);
    setTaskGroupDisplayStates([]);
    setTaskGroupRunUiState({ latestByGroupId: {}, savingByGroupId: {} });
    setSelectedAtlasEntries([]);
    setTaskRunSavingByTaskId({});
    setTaskCloneDraftByTaskId({});
    setTaskCloneSavingByTaskId({});
    setTaskParameterDraftByTaskId({});
    setTaskParameterSavingByTaskId({});
    setGeneratedResetSavingByTaskId({});
    setGeneratedArchiveConfirmTaskId(null);
    setGeneratedArchiveSavingByTaskId({});
    setSelectedDiscoveryChannelTaskIdsByTaskId({});
    setSelectedDiscoveryChannelSetIdByTaskId({});
    setDiscoveryChannelSetTitleByTaskId({});
    setDiscoveryChannelSetsByTaskId({});
    setDiscoveryChannelSetLoadingByTaskId({});
    setDiscoveryChannelSetSavingByTaskId({});
    setDiscoveryChannelSetArchivingById({});
    discoveryChannelSetLoadKeysRef.current.clear();
    setTaskRunObserverByRunId({});
    setRunHistoryTaskId(null);
    setRunHistoryByTaskId({});
    runHistoryRequestKeyByTaskIdRef.current = {};
    setRunHistoryIncludeArchived(false);
    setRunHistoryAnalysisCopyState("idle");
    setRunHistoryAnalysisManualText(null);

    if (reason === "mock-fixture" || reason === "mock-workspace" || reason === "live-workspace-loading") {
      setSourceAtlasNodes([]);
    }

    if (reason === "live-workspace-loading") {
      setAgentPickerOpen(false);
      setTaskLeaderPickerOpen(false);
      setTaskNodes([]);
      setLiveTaskNodesHydrated(false);
      setLiveSourceNodesHydrated(false);
    }

    if (reason === "mock-workspace") {
      setCanvasViewport({ x: 0, y: 0, scale: 1 });
      setCanvasBranchLayout({});
    }
  }, []);

  const openDiscoveryTaskIds = useMemo(() => {
    const ids: string[] = [];
    for (const branch of expandedTaskBranches) {
      if (branch.detailMode !== "discovery-subcanvas") continue;
      ids.push(branch.taskId);
    }
    return ids;
  }, [expandedTaskBranches]);

  const liveData = useTeamConsoleLiveData({
    onApplyLiveTasks: useCallback((nextTasks: TeamCanvasTask[]) => {
      setTaskNodes((current) => makeTaskNodes(nextTasks, liveTaskRefreshPositions(current)));
      setLiveTaskNodesHydrated(true);
    }, []),
    onApplyLiveSources: useCallback((nextSources: TeamCanvasSourceNode[]) => {
      setSourceAtlasNodes((current) => makeSourceNodes(nextSources, liveSourceRefreshPositions(current)));
      setLiveSourceNodesHydrated(true);
    }, []),
    onCloseBranches: useCallback(() => {
      setTaskLeaderPickerOpen(false);
      setExpandedAgentBranch(null);
      closeTaskBranch();
    }, [closeTaskBranch]),
    onResetContextUi: resetContextUi,
    selectedTaskId,
    openDiscoveryTaskIds,
  });
  const {
    dataSource, setDataSource,
    selectedFixtureId,
    loading, error, setError,
    liveTasksRefreshing,
    agents, agentRunStatusById,
    plan, run, attemptsByTaskId,
    tasks, taskConnections, taskDependencies,
    teamTaskGroups, setTeamTaskGroups,
    sourceNodes, sourceConnections,
    taskRunsByTaskId, generatedTasksByDiscoveryTaskId, discoverySummariesByTaskId, discoveryDispatchDiagnosticsByTaskId, setTaskRunsByTaskId, setGeneratedTasksByDiscoveryTaskId,
    refreshLiveTasks,
    scheduleLiveTaskDiscoveryRefresh,
    refreshLiveTasksAfterLeavingTaskCreateBranch,
    readAttemptFile,
    setTaskConnections, setTaskDependencies,
    setSourceNodes, setSourceConnections,
    setTasks,
    markGeneratedTaskReplaced,
    markGeneratedTaskArchived,
    ensureGeneratedTaskDetail,
  } = liveData;

  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents]);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.taskId, task])), [tasks]);
  const generatedTasksById = useMemo(() => new Map(
    Object.values(generatedTasksByDiscoveryTaskId).flat().map((task) => [task.taskId, task]),
  ), [generatedTasksByDiscoveryTaskId]);
  useEffect(() => {
    for (const taskId of openDiscoveryTaskIds) {
      const loadKey = `${dataSource}:${taskId}`;
      if (discoveryChannelSetLoadKeysRef.current.has(loadKey)) continue;
      discoveryChannelSetLoadKeysRef.current.add(loadKey);
      setDiscoveryChannelSetLoadingByTaskId((current) => ({ ...current, [taskId]: true }));
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      void api.listDiscoveryChannelSets(taskId)
        .then((channelSets) => {
          setDiscoveryChannelSetsByTaskId((current) => ({ ...current, [taskId]: channelSets }));
          setError(null);
        })
        .catch((e) => {
          discoveryChannelSetLoadKeysRef.current.delete(loadKey);
          setError(errorMessage(e));
        })
        .finally(() => {
          setDiscoveryChannelSetLoadingByTaskId((current) => ({ ...current, [taskId]: false }));
        });
    }
  }, [dataSource, openDiscoveryTaskIds, setError]);
  const taskRunsByTaskIdRef = useRef(taskRunsByTaskId);
  taskRunsByTaskIdRef.current = taskRunsByTaskId;
  const taskConnectionsRef = useRef(taskConnections);
  taskConnectionsRef.current = taskConnections;
  const loadedTaskRunByTaskIdRef = useRef(loadedTaskRunByTaskId);
  loadedTaskRunByTaskIdRef.current = loadedTaskRunByTaskId;
  const loadedTaskRunSnapshotByTaskIdRef = useRef(loadedTaskRunSnapshotByTaskId);
  loadedTaskRunSnapshotByTaskIdRef.current = loadedTaskRunSnapshotByTaskId;
  const runObserverInitialRefreshKeysRef = useRef<Set<string>>(new Set());
  const runObserverOpenTargetKeysRef = useRef<Set<string>>(new Set());
  const generatedEditDetailHandledTaskIdsRef = useRef<Set<string>>(new Set());
  const sourceNodesById = useMemo(() => new Map(sourceNodes.map((node) => [node.sourceNodeId, node])), [sourceNodes]);
  const agentRunStatusesById = useMemo(() => new Map(Object.entries(agentRunStatusById)), [agentRunStatusById]);
  const addedAgentIds = useMemo(() => new Set(agentNodes.map((node) => node.agentId)), [agentNodes]);
  const canvasUiContextKey = dataSource === "mock" ? `mock:${selectedFixtureId}` : "live";
  const taskGroups = useMemo<AtlasTaskGroup[]>(() => {
    if (dataSource !== "live") return mockTaskGroups;
    const selectedTaskIds = selectedAtlasEntries
      .filter((entry): entry is Extract<AtlasSelectedNodeEntry, { kind: "task" }> => entry.kind === "task")
      .map((entry) => entry.taskId);
    return buildLiveTaskGroups({
      groups: teamTaskGroups,
      taskNodes,
      selectedTaskIds,
      displayStates: taskGroupDisplayStates,
      runUiState: taskGroupRunUiState,
      taskRunsByTaskId,
      tasksById,
    });
  }, [dataSource, mockTaskGroups, selectedAtlasEntries, taskGroupDisplayStates, taskGroupRunUiState, taskNodes, taskRunsByTaskId, tasksById, teamTaskGroups]);
  const activeRunHistoryTaskId = useMemo(() => {
    const branch = [...expandedTaskBranches].reverse().find((item) => (
      item.detailMode === "run-history" || Boolean(item.discoveryGeneratedRunHistoryTaskId)
    ));
    return branch?.discoveryGeneratedRunHistoryTaskId ?? branch?.runHistoryTaskId ?? (branch ? branch.taskId : runHistoryTaskId);
  }, [expandedTaskBranches, runHistoryTaskId]);
  const openRunHistoryTaskIds = useMemo(() => {
    const taskIds: string[] = [];
    const addTaskId = (taskId: string | null | undefined) => {
      if (taskId && !taskIds.includes(taskId)) taskIds.push(taskId);
    };
    for (const branch of expandedTaskBranches) {
      if (branch.detailMode === "run-history") {
        addTaskId(branch.runHistoryTaskId ?? branch.taskId);
      }
      if (branch.detailMode === "discovery-subcanvas") {
        addTaskId(branch.discoveryGeneratedRunHistoryTaskId);
      }
    }
    addTaskId(runHistoryTaskId);
    return taskIds;
  }, [expandedTaskBranches, runHistoryTaskId]);
  const hydratedCanvasUiContextKeyRef = useRef<string | null>(null);
  const expandedAgentNode = expandedAgentBranch
    ? agentNodes.find((node) => node.nodeId === expandedAgentBranch.nodeId) ?? null
    : null;
  const expandedAgent = expandedAgentNode ? agentsById.get(expandedAgentNode.agentId) ?? null : null;
  const runObserverTargets = useMemo(() => expandedTaskBranches.flatMap((branch) => {
    const rootTargets = (() => {
      const discoveryRunHistoryTaskId = branch.detailMode === "discovery-subcanvas"
        ? branch.discoveryGeneratedRunHistoryTaskId
        : undefined;
      const isRunHistoryMode = branch.detailMode === "run-history" || Boolean(discoveryRunHistoryTaskId);
      if ((branch.detailMode !== "run-observer" && !isRunHistoryMode) || !branch.observedRunId) return [];
      const node = taskNodes.find((candidate) => candidate.nodeId === branch.nodeId) ?? null;
      const task = node ? tasksById.get(node.taskId) ?? null : null;
      if (!task) return [];
      const targetTaskId = isRunHistoryMode
        ? discoveryRunHistoryTaskId ?? branch.runHistoryTaskId ?? activeRunHistoryTaskId ?? task.taskId
        : task.taskId;
      const taskRun = (taskRunsByTaskId[targetTaskId] ?? []).find((run) => run.runId === branch.observedRunId)
        ?? (isRunHistoryMode
          ? runHistoryByTaskId[targetTaskId]?.items.find((item) => item.annotation.taskId === targetTaskId && item.run.runId === branch.observedRunId)?.run ?? null
          : null);
      if (!taskRun) return [];
      return [{ taskId: targetTaskId, runId: taskRun.runId, status: taskRun.status }];
    })();
    if (branch.detailMode !== "discovery-subcanvas" || !branch.discoveryGeneratedObserver) return rootTargets;
    const generatedTask = generatedTasksById.get(branch.discoveryGeneratedObserver.taskId) ?? null;
    if (!generatedTask) return rootTargets;
    const node = taskNodes.find((candidate) => candidate.nodeId === branch.nodeId) ?? null;
    const discoveryTask = node ? tasksById.get(node.taskId) ?? null : null;
    if (!discoveryTask || discoveryTask.canvasKind !== "discovery" || discoveryTask.generatedSource) return rootTargets;
    const activeDiscoveryRun = selectActiveDiscoveryRootRun(discoveryTask.taskId, taskRunsByTaskId);
    const taskRun = visibleDiscoveryGeneratedRuns(generatedTask, discoveryTask.taskId, activeDiscoveryRun, taskRunsByTaskId)
      .find((run) => run.runId === branch.discoveryGeneratedObserver?.runId) ?? null;
    if (!taskRun) return rootTargets;
    return [
      ...rootTargets,
      { taskId: generatedTask.taskId, runId: taskRun.runId, status: taskRun.status },
    ];
  }), [activeRunHistoryTaskId, expandedTaskBranches, generatedTasksById, runHistoryByTaskId, taskNodes, taskRunsByTaskId, tasksById]);
  const runObserverTargetSignature = useMemo(() => runObserverTargets
    .map((target) => `${target.taskId}\u0000${target.runId}\u0000${target.status}`)
    .join("\u0001"), [runObserverTargets]);
  runObserverOpenTargetKeysRef.current = new Set(
    runObserverTargets.map((target) => `${dataSource}\u0000${target.taskId}\u0000${target.runId}`),
  );
  const openDiscoverySubcanvasGeneratedTaskIds = useMemo(() => {
    const taskIds = new Set<string>();
    for (const branch of expandedTaskBranches) {
      if (branch.detailMode !== "discovery-subcanvas") continue;
      for (const generatedTask of generatedTasksByDiscoveryTaskId[branch.taskId] ?? []) {
        if (!generatedTask.archived) {
          taskIds.add(generatedTask.taskId);
        }
      }
    }
    return taskIds;
  }, [expandedTaskBranches, generatedTasksByDiscoveryTaskId]);

  const selectTask = useCallback((taskId: string) => {
    setSelectedTaskId((current) => current === taskId ? null : taskId);
  }, []);

  const setRunHistoryTaskState = useCallback((
    taskId: string,
    updater: (current: RunHistoryPanelState) => RunHistoryPanelState,
  ) => {
    setRunHistoryByTaskId((current) => {
      const previous = current[taskId] ?? emptyRunHistoryPanelState;
      return {
        ...current,
        [taskId]: updater(previous),
      };
    });
  }, []);

  const openTaskRunHistory = useCallback((
    taskId: string,
    nodeId?: string,
    seedRuns: TeamRunState[] = [],
    options: { keepDiscoverySubcanvas?: boolean } = {},
  ) => {
    const initialItems = mergeRunHistoryItems([], seedRuns, taskId, false);
    setRunHistoryTaskId(taskId);
    setRunHistoryIncludeArchived(false);
    setRunHistoryTaskState(taskId, () => ({
      items: initialItems,
      total: initialItems.length,
      loading: true,
      error: null,
      savingRunId: null,
    }));
    setRunHistoryAnalysisCopyState("idle");
    setRunHistoryAnalysisManualText(null);
    if (nodeId) {
      setExpandedTaskBranches((current) => current.map((item) => (
        item.nodeId === nodeId
          ? item.detailMode === "discovery-subcanvas" && options.keepDiscoverySubcanvas
            ? {
                ...item,
                discoveryGeneratedRunHistoryTaskId: taskId,
                observedRunId: undefined,
                selectedFileKeys: [],
              }
            : {
                ...item,
                detailMode: "run-history",
                runHistoryTaskId: taskId,
                observedRunId: undefined,
                selectedFileKeys: [],
                discoveryGeneratedObserver: undefined,
                discoveryGeneratedEditTaskId: undefined,
                discoveryGeneratedRunHistoryTaskId: undefined,
                discoveryQueueExpanded: false,
                discoveryStaleExpanded: false,
              }
          : item
      )));
    }
  }, [setExpandedTaskBranches, setRunHistoryTaskState]);

  const closeTaskRunHistory = useCallback((taskId?: string) => {
    if (taskId) {
      setRunHistoryByTaskId((current) => {
        if (!current[taskId]) return current;
        const next = { ...current };
        delete next[taskId];
        return next;
      });
      delete runHistoryRequestKeyByTaskIdRef.current[taskId];
      setRunHistoryTaskId((current) => current === taskId ? null : current);
    } else {
      setRunHistoryTaskId(null);
      setRunHistoryByTaskId({});
      runHistoryRequestKeyByTaskIdRef.current = {};
    }
    setRunHistoryAnalysisCopyState("idle");
    setRunHistoryAnalysisManualText(null);
  }, []);

  const copyRunHistoryAnalysisContext = useCallback(async (
    task: RunHistoryAnalysisTask,
    run: TeamRunState,
    attempts: TeamAttemptMetadata[],
    fileDescriptors: TaskRunObserverFileDescriptor[],
  ) => {
    const text = buildRunHistoryAnalysisContext(task, run, attempts, fileDescriptors);
    setRunHistoryAnalysisCopyState("idle");
    setRunHistoryAnalysisManualText(null);
    try {
      const clipboard = globalThis.navigator?.clipboard;
      if (clipboard?.writeText) {
        try {
          await clipboard.writeText(text);
          setRunHistoryAnalysisCopyState("copied");
          return;
        } catch { /* fall through to textarea fallback */ }
      }

      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("data-copy-fallback", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      const prev = document.activeElement as HTMLElement | null;
      ta.focus();
      ta.select();
      try {
        const execCopy = document.execCommand?.bind(document);
        if (!execCopy?.("copy")) throw new Error("execCommand copy returned false");
        setRunHistoryAnalysisCopyState("copied");
      } finally {
        ta.remove();
        prev?.focus();
      }
    } catch {
      setRunHistoryAnalysisCopyState("failed");
      setRunHistoryAnalysisManualText(text);
    }
  }, []);

  useEffect(() => {
    if (openRunHistoryTaskIds.length === 0) return;
    let cancelled = false;
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
    const openTaskIdSet = new Set(openRunHistoryTaskIds);
    for (const taskId of Object.keys(runHistoryRequestKeyByTaskIdRef.current)) {
      if (!openTaskIdSet.has(taskId)) {
        delete runHistoryRequestKeyByTaskIdRef.current[taskId];
      }
    }
    for (const taskId of openRunHistoryTaskIds) {
      const requestKey = `${dataSource}:${runHistoryIncludeArchived ? "archived" : "visible"}`;
      if (runHistoryRequestKeyByTaskIdRef.current[taskId] === requestKey) continue;
      runHistoryRequestKeyByTaskIdRef.current[taskId] = requestKey;
      setRunHistoryTaskState(taskId, (current) => ({ ...current, loading: true, error: null }));

      void Promise.resolve().then(() => api.listTaskRunHistory(taskId, {
        limit: RUN_HISTORY_PAGE_SIZE,
        offset: 0,
        includeArchived: runHistoryIncludeArchived,
      })).then((response) => {
        if (cancelled) return;
        const merged = mergeRunHistoryItems(
          response.runs,
          taskRunsByTaskIdRef.current[taskId] ?? [],
          taskId,
          runHistoryIncludeArchived,
        );
        setRunHistoryTaskState(taskId, (current) => ({
          ...current,
          items: merged,
          total: Math.max(response.total, merged.length),
          loading: false,
          error: null,
        }));
      }).catch((e) => {
        if (cancelled) return;
        setRunHistoryTaskState(taskId, (current) => ({
          ...current,
          items: [],
          total: 0,
          loading: false,
          error: errorMessage(e),
        }));
      });
    }

    return () => {
      cancelled = true;
    };
  }, [dataSource, openRunHistoryTaskIds, runHistoryIncludeArchived, setRunHistoryTaskState, taskRunsByTaskId]);

  const loadMoreRunHistory = useCallback(async (taskId: string) => {
    const state = runHistoryByTaskId[taskId] ?? emptyRunHistoryPanelState;
    if (state.loading || state.items.length >= state.total) return;
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
    setRunHistoryTaskState(taskId, (current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await api.listTaskRunHistory(taskId, {
        limit: RUN_HISTORY_PAGE_SIZE,
        offset: state.items.length,
        includeArchived: runHistoryIncludeArchived,
      });
      setRunHistoryTaskState(taskId, (current) => ({
        ...current,
        items: mergeRunHistoryItems(
          [...current.items, ...response.runs],
          [],
          taskId,
          runHistoryIncludeArchived,
        ),
        total: Math.max(response.total, response.offset + response.runs.length),
      }));
    } catch (e) {
      setRunHistoryTaskState(taskId, (current) => ({ ...current, error: errorMessage(e) }));
    } finally {
      setRunHistoryTaskState(taskId, (current) => ({ ...current, loading: false }));
    }
  }, [dataSource, runHistoryByTaskId, runHistoryIncludeArchived, setRunHistoryTaskState]);

  const loadRunHistoryItem = useCallback((item: TeamTaskRunHistoryItem) => {
    setLoadedTaskRunByTaskId((current) => ({
      ...current,
      [item.annotation.taskId]: item.run.runId,
    }));
    setLoadedTaskRunSnapshotByTaskId((current) => ({
      ...current,
      [item.annotation.taskId]: {
        taskId: item.annotation.taskId,
        runId: item.run.runId,
        status: item.run.status,
      },
    }));
  }, []);

  const unloadRunHistoryItem = useCallback((item: TeamTaskRunHistoryItem) => {
    setLoadedTaskRunByTaskId((current) => {
      if (current[item.annotation.taskId] !== item.run.runId) return current;
      const next = { ...current };
      delete next[item.annotation.taskId];
      return next;
    });
    setLoadedTaskRunSnapshotByTaskId((current) => {
      if (current[item.annotation.taskId]?.runId !== item.run.runId) return current;
      const next = { ...current };
      delete next[item.annotation.taskId];
      return next;
    });
  }, []);

  const patchRunHistoryAnnotation = useCallback(async (
    item: TeamTaskRunHistoryItem,
    patch: { best?: boolean; archived?: boolean },
  ) => {
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
    setRunHistoryTaskState(item.annotation.taskId, (current) => ({
      ...current,
      savingRunId: item.run.runId,
      error: null,
    }));
    try {
      const response = await api.updateTaskRunAnnotation(item.run.runId, patch);
      setRunHistoryTaskState(response.annotation.taskId, (current) => {
        const next = current.items.map((historyItem) => {
          if (historyItem.annotation.taskId !== response.annotation.taskId) return historyItem;
          if (historyItem.run.runId === response.annotation.runId) {
            return { ...historyItem, annotation: response.annotation };
          }
          return response.annotation.best
            ? { ...historyItem, annotation: { ...historyItem.annotation, best: false } }
            : historyItem;
        });
        const items = runHistoryIncludeArchived || !response.annotation.archived
          ? next
          : next.filter((historyItem) => historyItem.run.runId !== response.annotation.runId);
        return {
          ...current,
          items,
          total: !runHistoryIncludeArchived && response.annotation.archived
            ? Math.max(0, current.total - 1)
            : current.total,
        };
      });
    } catch (e) {
      setRunHistoryTaskState(item.annotation.taskId, (current) => ({ ...current, error: errorMessage(e) }));
    } finally {
      setRunHistoryTaskState(item.annotation.taskId, (current) => ({ ...current, savingRunId: null }));
    }
  }, [dataSource, runHistoryIncludeArchived, setRunHistoryTaskState]);

  useEffect(() => {
    if (generatedArchiveConfirmTaskId && !openDiscoverySubcanvasGeneratedTaskIds.has(generatedArchiveConfirmTaskId)) {
      setGeneratedArchiveConfirmTaskId(null);
    }
    if (dataSource === "live" && generatedActionMenuTaskId && !generatedTasksById.has(generatedActionMenuTaskId)) {
      setGeneratedActionMenuTaskId(null);
    }
    setGeneratedArchiveSavingByTaskId((current) => {
      let changed = false;
      const next = { ...current };
      for (const taskId of Object.keys(next)) {
        if (!openDiscoverySubcanvasGeneratedTaskIds.has(taskId)) {
          delete next[taskId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [dataSource, generatedActionMenuTaskId, generatedArchiveConfirmTaskId, generatedTasksById, openDiscoverySubcanvasGeneratedTaskIds]);

  useEffect(() => {
    if (!generatedActionMenuTaskId) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(`[data-generated-task-id="${generatedActionMenuTaskId}"]`)) return;
      setGeneratedActionMenuTaskId(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [generatedActionMenuTaskId]);

  useEffect(() => {
    if (dataSource !== "live") {
      setSharedCanvasUiState(null);
      setSharedCanvasUiStateLoaded(false);
      return;
    }
    let cancelled = false;
    setSharedCanvasUiStateLoaded(false);
    void new LiveTeamApi().getConsoleLayout()
      .then((response) => {
        if (cancelled) return;
        const parsed = response.state ? parseStoredCanvasUiStateByContext(response.state) : null;
        sharedCanvasUiStatePersistedJsonRef.current = JSON.stringify(parsed);
        setSharedCanvasUiState(parsed);
      })
      .catch(() => {
        if (!cancelled) {
          sharedCanvasUiStatePersistedJsonRef.current = JSON.stringify(null);
          setSharedCanvasUiState(null);
        }
      })
      .finally(() => {
        if (!cancelled) setSharedCanvasUiStateLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [dataSource]);

  useEffect(() => {
    return () => {
      if (sharedCanvasUiStateSaveTimerRef.current) {
        globalThis.clearTimeout(sharedCanvasUiStateSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setCanvasUiStateHydrated(false);
    setCanvasUiStateRestoreHasStoredState(readStoredCanvasUiState(dataSource, selectedFixtureId) !== null);
  }, [canvasUiContextKey, dataSource, selectedFixtureId]);

  useEffect(() => {
    if (dataSource === "live" && !liveAgentNodesHydrated) return;
    setMinimizedAgentNodeIds((current) => {
      const nodeIds = new Set(agentNodes.filter((node) => agentsById.has(node.agentId)).map((node) => node.nodeId));
      const next = current.filter((nodeId) => nodeIds.has(nodeId));
      return next.length === current.length ? current : next;
    });
  }, [agentNodes, agentsById, dataSource, liveAgentNodesHydrated]);

  useEffect(() => {
    if (dataSource === "live" && !liveTaskNodesHydrated) return;
    setMinimizedTaskNodeIds((current) => {
      const nodeIds = new Set(taskNodes.map((node) => node.nodeId));
      const next = current.filter((nodeId) => nodeIds.has(nodeId));
      return next.length === current.length ? current : next;
    });
  }, [dataSource, liveTaskNodesHydrated, taskNodes]);

  useEffect(() => {
    if (dataSource !== "mock") return;
    const nodeIds = new Set(taskNodes.map((node) => node.nodeId));
    setMockTaskGroups((current) => {
      const next = current.flatMap((group) => {
        const taskNodeIds = group.taskNodeIds.filter((nodeId) => nodeIds.has(nodeId));
        return taskNodeIds.length > 0 ? [{ ...group, taskNodeIds }] : [];
      });
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [dataSource, taskNodes]);

  useEffect(() => {
    if (dataSource === "live" && !liveSourceNodesHydrated) return;
    setMinimizedSourceNodeIds((current) => {
      const nodeIds = new Set(sourceAtlasNodes.map((node) => node.nodeId));
      const next = current.filter((nodeId) => nodeIds.has(nodeId));
      return next.length === current.length ? current : next;
    });
  }, [dataSource, liveSourceNodesHydrated, sourceAtlasNodes]);

  useEffect(() => {
    if (canvasUiStateHydrated) return;
    const ready = dataSource === "live"
      ? liveAgentNodesHydrated && liveTaskNodesHydrated && liveSourceNodesHydrated && sharedCanvasUiStateLoaded
      : taskNodes.length > 0;
    if (!ready) return;

    const stored = readStoredCanvasUiState(dataSource, selectedFixtureId, sharedCanvasUiState);
    if (!stored) {
      setCanvasUiStateRestoreHasStoredState(false);
      setCanvasBranchLayout({});
      setMockTaskGroups([]);
      setTaskGroupDisplayStates([]);
      setLoadedTaskRunByTaskId({});
      setLoadedTaskRunSnapshotByTaskId({});
      hydratedCanvasUiContextKeyRef.current = canvasUiContextKey;
      liveCanvasUiStateHydratingRef.current = dataSource === "live";
      setCanvasUiStateHydrated(true);
      return;
    }
    setCanvasUiStateRestoreHasStoredState(true);

    const nextAgentNodes = mergeStoredAgentNodes(agentNodes, stored.agentNodes, agentsById);
    const nextTaskNodes = mergeStoredTaskNodePositions(taskNodes, stored.taskNodePositions);
    const nextSourceNodes = mergeStoredSourceNodePositions(sourceAtlasNodes, stored.sourceNodePositions);
    if (!sameAgentNodes(agentNodes, nextAgentNodes)) {
      setAgentNodes(nextAgentNodes);
    }
    if (!sameTaskNodes(taskNodes, nextTaskNodes)) {
      setTaskNodes(nextTaskNodes);
    }
    if (!sameSourceNodes(sourceAtlasNodes, nextSourceNodes)) {
      setSourceAtlasNodes(nextSourceNodes);
    }

    const validAgentNodes = nextAgentNodes.filter((node) => agentsById.has(node.agentId));
    const agentNodeIds = new Set(validAgentNodes.map((node) => node.nodeId));
    const agentIds = new Set(validAgentNodes.map((node) => node.agentId));
    const taskNodeIds = new Set(nextTaskNodes.map((node) => node.nodeId));
    const taskIds = new Set(nextTaskNodes.map((node) => node.taskId));
    const loadedTaskIds = new Set(taskIds);
    for (const taskId of generatedTasksById.keys()) loadedTaskIds.add(taskId);
    const sourceNodeIds = new Set(nextSourceNodes.map((node) => node.nodeId));
    const nextTaskGroups = (stored.taskGroups ?? []).flatMap((group) => {
      const taskGroupNodeIds = group.taskNodeIds.filter((nodeId) => taskNodeIds.has(nodeId));
      return taskGroupNodeIds.length > 0 ? [{ ...group, taskNodeIds: taskGroupNodeIds }] : [];
    });
    const nextTaskGroupDisplayStates = stored.taskGroupDisplayStates ?? [];
    const activeTaskGroupIds = new Set(
      dataSource === "mock"
        ? nextTaskGroups.map((group) => group.groupId)
        : teamTaskGroups.filter((group) => !group.archived).map((group) => group.groupId),
    );
    const nextAgentBranch = stored.expandedAgentBranch
      && agentNodeIds.has(stored.expandedAgentBranch.nodeId)
      && agentIds.has(stored.expandedAgentBranch.agentId)
      ? stored.expandedAgentBranch
      : null;
    const nextTaskBranches = (stored.expandedTaskBranches ?? []).filter((branch) => (
      taskNodeIds.has(branch.nodeId) && taskIds.has(branch.taskId)
    ));

    if (stored.viewport) {
      setCanvasViewport(stored.viewport);
    }
    setExpandedAgentBranch(nextAgentBranch);
    setExpandedTaskBranches(nextTaskBranches);
    setMockTaskGroups(dataSource === "mock" ? nextTaskGroups : []);
    setTaskGroupDisplayStates(dataSource === "live" ? nextTaskGroupDisplayStates : []);
    setCanvasBranchLayout(stored.branchLayout ?? {});
    setLoadedTaskRunByTaskId(Object.fromEntries(filterLoadedTaskRunSelectionsByTaskIds(
      stored.loadedTaskRunSelections ?? [],
      loadedTaskIds,
    ).map((selection) => [
      selection.taskId,
      selection.runId,
    ])));
    setLoadedTaskRunSnapshotByTaskId({});
    setMinimizedAgentNodeIds((stored.minimizedAgentNodeIds ?? []).filter((nodeId) => agentNodeIds.has(nodeId)));
    setMinimizedTaskNodeIds((stored.minimizedTaskNodeIds ?? []).filter((nodeId) => taskNodeIds.has(nodeId)));
    setMinimizedSourceNodeIds((stored.minimizedSourceNodeIds ?? []).filter((nodeId) => sourceNodeIds.has(nodeId)));
    setMinimizedTaskGroupIds((stored.minimizedTaskGroupIds ?? []).filter((groupId) => activeTaskGroupIds.has(groupId)));
    if (stored.rootNodeFilter) setRootNodeFilter(stored.rootNodeFilter);
    hydratedCanvasUiContextKeyRef.current = canvasUiContextKey;
    liveCanvasUiStateHydratingRef.current = dataSource === "live";
    setCanvasUiStateHydrated(true);
  }, [
    agentNodes,
    agentsById,
    canvasUiContextKey,
    canvasUiStateHydrated,
    dataSource,
    generatedTasksById,
    liveAgentNodesHydrated,
    liveSourceNodesHydrated,
    liveTaskNodesHydrated,
    selectedFixtureId,
    sharedCanvasUiState,
    sharedCanvasUiStateLoaded,
    sourceAtlasNodes,
    teamTaskGroups,
    taskNodes,
  ]);

  useEffect(() => {
    if (!canvasUiStateHydrated || dataSource !== "live") return;
    const timer = globalThis.setTimeout(() => {
      liveCanvasUiStateHydratingRef.current = false;
    }, 0);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [canvasUiContextKey, canvasUiStateHydrated, dataSource]);

  useEffect(() => {
    if (!canvasUiStateHydrated) return;
    const taskIds = new Set(taskNodes.map((node) => node.taskId));
    for (const taskId of generatedTasksById.keys()) taskIds.add(taskId);
    setLoadedTaskRunByTaskId((current) => filterLoadedTaskRunByTaskId(current, taskIds));
    setLoadedTaskRunSnapshotByTaskId((current) => {
      let changed = false;
      const next: Record<string, LoadedTaskRunSnapshot> = {};
      for (const [taskId, snapshot] of Object.entries(current)) {
        if (!taskIds.has(taskId)) {
          changed = true;
          continue;
        }
        next[taskId] = snapshot;
      }
      return changed ? next : current;
    });
  }, [canvasUiStateHydrated, generatedTasksById, taskNodes]);

  useEffect(() => {
    if (!canvasUiStateHydrated || dataSource !== "live") return;
    const activeGroupIds = new Set(teamTaskGroups.filter((group) => !group.archived).map((group) => group.groupId));
    setTaskGroupDisplayStates((current) => {
      let changed = false;
      const next = current.filter((state) => {
        const keep = activeGroupIds.has(state.groupId);
        if (!keep) changed = true;
        return keep;
      });
      return changed ? next : current;
    });
    setMinimizedTaskGroupIds((current) => {
      const next = current.filter((groupId) => activeGroupIds.has(groupId));
      return next.length === current.length ? current : next;
    });
    setTaskGroupRunUiState((current) => {
      let changed = false;
      const latestByGroupId: TaskGroupRunUiState["latestByGroupId"] = {};
      for (const [groupId, groupRun] of Object.entries(current.latestByGroupId)) {
        if (!activeGroupIds.has(groupId)) {
          changed = true;
          continue;
        }
        latestByGroupId[groupId] = groupRun;
      }
      const savingByGroupId: Record<string, boolean> = {};
      for (const [groupId, saving] of Object.entries(current.savingByGroupId)) {
        if (!activeGroupIds.has(groupId)) {
          changed = true;
          continue;
        }
        savingByGroupId[groupId] = saving;
      }
      return changed ? { latestByGroupId, savingByGroupId } : current;
    });
  }, [canvasUiStateHydrated, dataSource, teamTaskGroups]);

  useEffect(() => {
    if (dataSource !== "live" || teamTaskGroups.length === 0) return;
    let cancelled = false;
    const api = new LiveTeamApi();
    const activeGroups = teamTaskGroups.filter((group) => !group.archived);

    async function loadTaskGroupRuns() {
      const entries = await Promise.all(activeGroups.map(async (group) => {
        try {
          const groupRuns = await api.listTaskGroupRuns(group.groupId);
          return [group.groupId, selectLatestTaskGroupRun(groupRuns)] as const;
        } catch {
          return [group.groupId, null] as const;
        }
      }));
      if (cancelled) return;
      setTaskGroupRunUiState((current) => {
        const latestByGroupId = { ...current.latestByGroupId };
        let changed = false;
        for (const [groupId, groupRun] of entries) {
          if (groupRun) {
            if (!hasSameTaskGroupRunPollingSignature(latestByGroupId[groupId], groupRun)) {
              latestByGroupId[groupId] = groupRun;
              changed = true;
            }
          } else if (latestByGroupId[groupId]) {
            delete latestByGroupId[groupId];
            changed = true;
          }
        }
        return changed ? { ...current, latestByGroupId } : current;
      });
    }

    void loadTaskGroupRuns();

    return () => {
      cancelled = true;
    };
  }, [dataSource, teamTaskGroups]);

  useEffect(() => {
    if (!canvasUiStateHydrated) return;
    if (hydratedCanvasUiContextKeyRef.current !== canvasUiContextKey) return;
    const validLoadedTaskIds = new Set(taskNodes.map((node) => node.taskId));
    for (const taskId of generatedTasksById.keys()) validLoadedTaskIds.add(taskId);
    const nextState: StoredCanvasUiState = {
      schemaVersion: 1,
      dataSource,
      ...(dataSource === "mock" ? { selectedFixtureId } : {}),
      viewport: canvasViewport,
      agentNodes: agentNodes.map((node) => ({
        agentId: node.agentId,
        position: { x: node.position.x, y: node.position.y },
      })),
      taskNodePositions: taskNodes.map((node) => ({
        taskId: node.taskId,
        position: { x: node.position.x, y: node.position.y },
      })),
      sourceNodePositions: sourceAtlasNodes.map((node) => ({
        sourceNodeId: node.sourceNodeId,
        position: { x: node.position.x, y: node.position.y },
      })),
      ...(dataSource === "mock" ? { taskGroups: mockTaskGroups } : {
        taskGroupDisplayStates: taskGroupDisplayStates.filter((state) => (
          teamTaskGroups.some((group) => !group.archived && group.groupId === state.groupId)
        )),
      }),
      expandedAgentBranch,
      expandedTaskBranches,
      branchLayout: canvasBranchLayout,
      minimizedAgentNodeIds,
      minimizedTaskNodeIds,
      minimizedSourceNodeIds,
      minimizedTaskGroupIds,
      rootNodeFilter,
      loadedTaskRunSelections: filterLoadedTaskRunSelectionsByTaskIds(
        Object.entries(loadedTaskRunByTaskId).map(([taskId, runId]) => ({ taskId, runId })),
        validLoadedTaskIds,
      ),
    };
    const nextByContext = writeStoredCanvasUiState(nextState);
    if (dataSource === "live" && nextByContext) {
      const nextJson = JSON.stringify(parseStoredCanvasUiStateByContext(nextByContext));
      if (liveCanvasUiStateHydratingRef.current) {
        sharedCanvasUiStatePersistedJsonRef.current = nextJson;
        setSharedCanvasUiState(nextByContext);
        return;
      }
      if (nextJson === sharedCanvasUiStatePersistedJsonRef.current) return;
      setSharedCanvasUiState(nextByContext);
      if (sharedCanvasUiStateSaveTimerRef.current) {
        globalThis.clearTimeout(sharedCanvasUiStateSaveTimerRef.current);
      }
      sharedCanvasUiStateSaveTimerRef.current = globalThis.setTimeout(() => {
        sharedCanvasUiStateSaveTimerRef.current = null;
        void new LiveTeamApi().saveConsoleLayout(nextByContext)
          .then(() => {
            sharedCanvasUiStatePersistedJsonRef.current = nextJson;
          })
          .catch(() => {});
      }, 250);
    }
  }, [
    canvasUiContextKey,
    canvasUiStateHydrated,
    canvasBranchLayout,
    canvasViewport,
    dataSource,
    agentNodes,
    expandedAgentBranch,
    expandedTaskBranches,
    generatedTasksById,
    loadedTaskRunByTaskId,
    minimizedAgentNodeIds,
    minimizedTaskGroupIds,
    minimizedSourceNodeIds,
    minimizedTaskNodeIds,
    rootNodeFilter,
    selectedFixtureId,
    sourceAtlasNodes,
    mockTaskGroups,
    taskGroupDisplayStates,
    teamTaskGroups,
    taskNodes,
  ]);

  useEffect(() => {
    if (dataSource !== "live") {
      setLiveAgentNodesHydrated(false);
      setLiveTaskNodesHydrated(false);
      setLiveSourceNodesHydrated(false);
      return;
    }
    setAgentNodes(readStoredLiveAgentNodes());
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
    if (dataSource !== "live" || !liveSourceNodesHydrated) return;
    writeStoredLiveSourceNodes(sourceAtlasNodes);
  }, [dataSource, liveSourceNodesHydrated, sourceAtlasNodes]);

  useEffect(() => {
    pruneTaskBranches(tasksById);
  }, [pruneTaskBranches, tasksById]);

  const clearGeneratedEditDetailFailure = useCallback((nodeId: string, taskId: string) => {
    generatedEditDetailHandledTaskIdsRef.current.delete(taskId);
    clearTaskEditState(taskId);
    setExpandedTaskBranches((current) => current.map((item) => (
      item.nodeId === nodeId && item.discoveryGeneratedEditTaskId === taskId
        ? { ...item, discoveryGeneratedEditTaskId: undefined }
        : item
    )));
  }, [clearTaskEditState, setExpandedTaskBranches]);

  useEffect(() => {
    for (const branch of expandedTaskBranches) {
      if (branch.detailMode !== "discovery-subcanvas" || !branch.discoveryGeneratedEditTaskId) continue;
      const generatedTask = generatedTasksById.get(branch.discoveryGeneratedEditTaskId);
      if (generatedTask && !taskEditDraftByTaskId[generatedTask.taskId]) {
        if (generatedEditDetailHandledTaskIdsRef.current.has(generatedTask.taskId)) continue;
        if ((generatedTask as TeamCanvasTask).workUnit) {
          openTaskEditDraft(generatedTask as TeamCanvasTask);
        } else {
          void ensureGeneratedTaskDetail(generatedTask.taskId).then((fullTask) => {
            if (fullTask) {
              openTaskEditDraft(fullTask);
            } else {
              clearGeneratedEditDetailFailure(branch.nodeId, generatedTask.taskId);
            }
          });
        }
      }
    }
  }, [
    clearGeneratedEditDetailFailure,
    ensureGeneratedTaskDetail,
    expandedTaskBranches,
    generatedTasksById,
    openTaskEditDraft,
    taskEditDraftByTaskId,
  ]);

  useEffect(() => {
    setSourceConnections((current) => (
      current.filter((connection) => sourceNodesById.has(connection.fromSourceNodeId) && tasksById.has(connection.toTaskId))
    ));
  }, [sourceNodesById, tasksById]);

  const addAgentNode = useCallback((agentId: string) => {
    setAgentNodes((current) => {
      if (current.some((node) => node.agentId === agentId)) return current;
      return [...current, makeAgentNode(agentId, current.length)];
    });
    setAgentPickerOpen(false);
    setTaskLeaderPickerOpen(false);
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

  const moveSourceNode = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setSourceAtlasNodes((current) => current.map((node) => (
      node.nodeId === nodeId ? { ...node, position } : node
    )));
  }, []);

  const minimizeAgentNode = useCallback((node: AtlasAgentNode) => {
    setMinimizedAgentNodeIds((current) => (
      current.includes(node.nodeId) ? current : [...current, node.nodeId]
    ));
  }, []);

  const restoreAgentNode = useCallback((node: AtlasAgentNode) => {
    setMinimizedAgentNodeIds((current) => current.filter((nodeId) => nodeId !== node.nodeId));
  }, []);

  const minimizeTaskNode = useCallback((node: AtlasTaskNode) => {
    setMinimizedTaskNodeIds((current) => (
      current.includes(node.nodeId) ? current : [...current, node.nodeId]
    ));
  }, []);

  const restoreTaskNode = useCallback((node: AtlasTaskNode) => {
    setMinimizedTaskNodeIds((current) => current.filter((nodeId) => nodeId !== node.nodeId));
  }, []);

  const minimizeSourceNode = useCallback((node: AtlasSourceNode) => {
    setMinimizedSourceNodeIds((current) => (
      current.includes(node.nodeId) ? current : [...current, node.nodeId]
    ));
  }, []);

  const restoreSourceNode = useCallback((node: AtlasSourceNode) => {
    setMinimizedSourceNodeIds((current) => current.filter((nodeId) => nodeId !== node.nodeId));
  }, []);

  const minimizeTaskGroup = useCallback((group: AtlasTaskGroup) => {
    setMinimizedTaskGroupIds((current) => (
      current.includes(group.groupId) ? current : [...current, group.groupId]
    ));
  }, []);

  const restoreTaskGroup = useCallback((group: AtlasTaskGroup) => {
    setMinimizedTaskGroupIds((current) => current.filter((groupId) => groupId !== group.groupId));
    if (dataSource === "live") {
      setTaskGroupDisplayStates((current) => (
        current.some((state) => state.groupId === group.groupId)
          ? current.map((state) => state.groupId === group.groupId ? { ...state, collapsed: false } : state)
          : [...current, { groupId: group.groupId, collapsed: false, locked: group.locked ?? false }]
      ));
      return;
    }
    setMockTaskGroups((current) => current.map((candidate) => (
      candidate.groupId === group.groupId ? { ...candidate, collapsed: false } : candidate
    )));
  }, [dataSource]);

  const toggleAgentBranch = useCallback((node: AtlasAgentNode) => {
    setAgentPickerOpen(false);
    setTaskLeaderPickerOpen(false);
    refreshLiveTasksAfterLeavingTaskCreateBranch(expandedAgentBranch);
    setExpandedAgentBranch(
      expandedAgentBranch?.nodeId === node.nodeId && expandedAgentBranch.mode === "chat"
        ? null
        : { nodeId: node.nodeId, agentId: node.agentId, mode: "chat" },
    );
  }, [expandedAgentBranch, refreshLiveTasksAfterLeavingTaskCreateBranch]);

  const toggleTaskBranch = useCallback((node: AtlasTaskNode) => {
    setFocusedTaskNodeId(node.nodeId);
    openOrToggleTaskBranch(node);
  }, [openOrToggleTaskBranch]);

  const openTaskCreateBranch = useCallback((leaderAgentId: string) => {
    const nodeId = `agent-${leaderAgentId}`;
    setAgentNodes((current) => (
      current.some((node) => node.agentId === leaderAgentId)
        ? current
        : [...current, makeAgentNode(leaderAgentId, current.length)]
    ));
    setAgentPickerOpen(false);
    setTaskLeaderPickerOpen(false);
    setExpandedAgentBranch({ nodeId, agentId: leaderAgentId, mode: "task-create" });
  }, []);

  const replaceGeneratedTaskInCatalog = useCallback((nextTask: TeamCanvasTask) => {
    const sourceDiscoveryTaskId = nextTask.generatedSource?.sourceDiscoveryTaskId;
    if (!sourceDiscoveryTaskId) return;
    markGeneratedTaskReplaced(nextTask.taskId);
    setGeneratedTasksByDiscoveryTaskId((current) => {
      const currentTasks = current[sourceDiscoveryTaskId] ?? [];
      if (!currentTasks.some((task) => task.taskId === nextTask.taskId)) return current;
      return {
        ...current,
        [sourceDiscoveryTaskId]: currentTasks.map((task) =>
          task.taskId === nextTask.taskId ? nextTask : task
        ),
      };
    });
  }, [setGeneratedTasksByDiscoveryTaskId, markGeneratedTaskReplaced]);

  const clearGeneratedTaskPanelState = useCallback((taskId: string) => {
    clearGeneratedArchiveUiForTasks([taskId]);
    clearTaskEditState(taskId);
    clearTaskEditWarning(taskId);
    setExpandedTaskBranches((current) => current.map((item) => {
      const nextEditTaskId = item.discoveryGeneratedEditTaskId === taskId ? undefined : item.discoveryGeneratedEditTaskId;
      const nextGeneratedObserver = item.discoveryGeneratedObserver?.taskId === taskId
        ? undefined
        : item.discoveryGeneratedObserver;
      if (nextEditTaskId === item.discoveryGeneratedEditTaskId && nextGeneratedObserver === item.discoveryGeneratedObserver) {
        return item;
      }
      return {
        ...item,
        discoveryGeneratedEditTaskId: nextEditTaskId,
        discoveryGeneratedObserver: nextGeneratedObserver,
      };
    }));
  }, [clearGeneratedArchiveUiForTasks, clearTaskEditState, clearTaskEditWarning, setExpandedTaskBranches]);

  const saveTaskEdit = useCallback(async (taskId: string) => {
    const task = tasksById.get(taskId) ?? generatedTasksById.get(taskId);
    const draft = taskEditDraftByTaskId[taskId];
    if (!task || !draft || draft.taskId !== taskId) return;

    const patch: TeamTaskUpdateRequest = {};
    let nextWorkUnit: TeamCanvasTask["workUnit"] | undefined;
    const ensureWorkUnitPatch = () => {
      nextWorkUnit ??= { ...task.workUnit };
      return nextWorkUnit;
    };
    const dirty = draft.dirtyFields;
    const title = draft.title.trim();

    if (hasDirtyTaskEditConflict(task, draft)) {
      setTaskEditWarning(taskId, "Task 已经在后台更新，请重新打开编辑节点后再保存。");
      return;
    }

    if (dirty.title && title !== task.title) {
      patch.title = title;
      if (task.generatedSource) {
        ensureWorkUnitPatch().title = title;
      }
    }
    if (dirty.leaderAgentId && draft.leaderAgentId !== task.leaderAgentId) {
      patch.leaderAgentId = draft.leaderAgentId;
    }
    const workerChanged = Boolean(dirty.workerAgentId) && draft.workerAgentId !== task.workUnit.workerAgentId;
    const checkerChanged = Boolean(dirty.checkerAgentId) && draft.checkerAgentId !== task.workUnit.checkerAgentId;
    if (workerChanged || checkerChanged) {
      const workUnit = ensureWorkUnitPatch();
      if (workerChanged) workUnit.workerAgentId = draft.workerAgentId;
      if (checkerChanged) workUnit.checkerAgentId = draft.checkerAgentId;
    }
    if (nextWorkUnit) {
      patch.workUnit = nextWorkUnit;
    }
    if (Object.keys(patch).length === 0) {
      clearTaskEditWarning(taskId);
      return;
    }

    setTaskEditSaving(taskId, true);
    clearTaskEditWarning(taskId);
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const response = await api.updateTask(taskId, patch);
      if (response.task.generatedSource) {
        replaceGeneratedTaskInCatalog(response.task);
      } else if (dataSource === "live") {
        await refreshLiveTasks();
      } else {
        const nextTasks = await api.listTasks();
        setTasks(nextTasks);
        setTaskNodes((current) => makeTaskNodes(nextTasks, liveTaskRefreshPositions(current)));
      }
      replaceTaskEditDraft(response.task);
      setTaskEditWarning(taskId, response.warnings?.join(" ") ?? null);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTaskEditSaving(taskId, false);
    }
  }, [clearTaskEditWarning, dataSource, generatedTasksById, refreshLiveTasks, replaceGeneratedTaskInCatalog, replaceTaskEditDraft, setTaskEditSaving, setTaskEditWarning, taskEditDraftByTaskId, tasksById]);

  const cloneTask = useCallback(async (task: TeamCanvasTask, nodeId: string): Promise<void> => {
    const draft = taskCloneDraftByTaskId[task.taskId];
    if (!draft || task.generatedSource) return;
    const title = draft.title.trim();
    const templateBindings = task.templateConfig
      ? Object.fromEntries(
          (task.templateConfig.parameters ?? []).map((parameter) => [
            parameter.id,
            (draft.templateBindings[parameter.id] ?? "").trim(),
          ]),
        )
      : undefined;

    setTaskCloneSavingByTaskId((current) => ({ ...current, [task.taskId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      await api.cloneTask(task.taskId, {
        ...(title ? { title } : {}),
        ...(templateBindings ? { templateBindings } : {}),
      });
      if (dataSource === "live") {
        await refreshLiveTasks();
      } else {
        const nextTasks = await api.listTasks();
        setTasks(nextTasks);
        setTaskNodes((current) => makeTaskNodes(nextTasks, liveTaskRefreshPositions(current)));
      }
      clearTaskCloneState(task.taskId);
      setExpandedTaskBranches((current) =>
        current.map((item) =>
          item.nodeId === nodeId ? { ...item, detailMode: null } : item
        )
      );
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTaskCloneSavingByTaskId((current) => {
        if (!(task.taskId in current)) return current;
        const next = { ...current };
        delete next[task.taskId];
        return next;
      });
    }
  }, [clearTaskCloneState, dataSource, refreshLiveTasks, setTasks, taskCloneDraftByTaskId]);

  const applyTaskParameterStateLocally = useCallback((taskId: string, templateBindings: Record<string, string>) => {
    const updatedAt = new Date().toISOString();
    setTasks((current) => current.map((task) => (
      task.taskId === taskId
        ? {
            ...task,
            templateState: {
              schemaVersion: "team/task-template-state-1",
              currentBindings: templateBindings,
              updatedAt,
            },
            updatedAt,
          }
        : task
    )));
  }, [setTasks]);

  const saveTaskParameters = useCallback(async (task: TeamCanvasTask): Promise<Record<string, string> | null> => {
    const draft = taskParameterDraftByTaskId[task.taskId];
    if (!draft || !task.templateConfig) return null;
    const templateBindings = normalizedTemplateBindings(task, draft.templateBindings);
    if (hasMissingRequiredTemplateBindings(task, templateBindings)) {
      setError("请先填写必填模板参数。");
      return null;
    }

    setTaskParameterSavingByTaskId((current) => ({ ...current, [task.taskId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const response = await api.updateTask(task.taskId, {
        templateState: {
          schemaVersion: "team/task-template-state-1",
          currentBindings: templateBindings,
          updatedAt: new Date().toISOString(),
        },
      });
      if (response.task.generatedSource) {
        replaceGeneratedTaskInCatalog(response.task);
      } else if (dataSource === "live") {
        applyTaskParameterStateLocally(task.taskId, templateBindings);
      } else {
        const nextTasks = await api.listTasks();
        setTasks(nextTasks);
        setTaskNodes((current) => makeTaskNodes(nextTasks, liveTaskRefreshPositions(current)));
      }
      openTaskParameterDraft(response.task);
      setError(null);
      return templateBindings;
    } catch (e) {
      setError(errorMessage(e));
      return null;
    } finally {
      setTaskParameterSavingByTaskId((current) => ({ ...current, [task.taskId]: false }));
    }
  }, [applyTaskParameterStateLocally, dataSource, openTaskParameterDraft, replaceGeneratedTaskInCatalog, setTasks, taskParameterDraftByTaskId]);

  const archiveTask = useCallback(async (task: TeamCanvasTask, nodeId?: string): Promise<boolean> => {
    const savingKey = nodeId ?? task.taskId;
    setTaskArchiveSavingNodeId(savingKey);
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      await api.archiveTask(task.taskId);
      if (dataSource === "live") {
        await refreshLiveTasks();
      } else {
        const nextTasks = await api.listTasks();
        setTasks(nextTasks);
        setTaskNodes((current) => makeTaskNodes(nextTasks, liveTaskRefreshPositions(current)));
      }
      closeTaskBranch(nodeId);
      setError(null);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setTaskArchiveSavingNodeId((current) => current === savingKey ? null : current);
    }
  }, [closeTaskBranch, dataSource, refreshLiveTasks]);

  const archiveGeneratedTask = useCallback(async (task: TeamCanvasTask): Promise<void> => {
    const taskId = task.taskId;
    const sourceDiscoveryTaskId = task.generatedSource?.sourceDiscoveryTaskId;
    if (!sourceDiscoveryTaskId) {
      setError("generated Task archive requires a Discovery source");
      return;
    }
    setGeneratedArchiveSavingByTaskId((current) => ({ ...current, [taskId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const response = await api.archiveTask(taskId);
      if (response.task.archived || response.task.status === "archived") {
        setGeneratedTasksByDiscoveryTaskId((current) => ({
          ...current,
          [sourceDiscoveryTaskId]: (current[sourceDiscoveryTaskId] ?? []).filter((generatedTask) => generatedTask.taskId !== taskId),
        }));
        setSelectedDiscoveryChannelTaskIdsByTaskId((current) => ({
          ...current,
          [sourceDiscoveryTaskId]: (current[sourceDiscoveryTaskId] ?? []).filter((selectedTaskId) => selectedTaskId !== taskId),
        }));
        clearGeneratedTaskPanelState(taskId);
        markGeneratedTaskArchived(taskId);
      }
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGeneratedArchiveSavingByTaskId((current) => {
        if (!(taskId in current)) return current;
        const next = { ...current };
        delete next[taskId];
        return next;
      });
    }
  }, [clearGeneratedTaskPanelState, dataSource, markGeneratedTaskArchived, setGeneratedTasksByDiscoveryTaskId]);

  const confirmRootArchive = useCallback(async () => {
    if (!rootArchiveConfirm || rootArchiveSaving) return;
    setRootArchiveSaving(true);
    const pending = rootArchiveConfirm;
    try {
      const items = pending.kind === "batch" ? pending.items : [pending];
      for (const item of items) {
        if (item.kind === "source") {
          const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
          await api.archiveSourceNode(item.sourceNodeId);
          if (dataSource === "live") {
            await refreshLiveTasks();
          } else {
            const [nextSources, nextConnections] = await Promise.all([
              api.listSourceNodes(),
              api.listSourceConnections(),
            ]);
            setSourceNodes(nextSources);
            setSourceAtlasNodes((current) => current.filter((node) =>
              nextSources.some((source) => source.sourceNodeId === node.sourceNodeId),
            ));
            setSourceConnections(nextConnections);
          }
          setMinimizedSourceNodeIds((current) => current.filter((id) => id !== item.nodeId));
        } else if (item.kind === "task") {
          const ok = await archiveTask(item.task, item.nodeId);
          if (!ok) return;
        } else if (item.kind === "agent") {
          setAgentNodes((current) => current.filter((node) => node.nodeId !== item.nodeId));
          setMinimizedAgentNodeIds((current) => current.filter((id) => id !== item.nodeId));
          setExpandedAgentBranch((current) => current?.nodeId === item.nodeId ? null : current);
        }
      }
      setRootArchiveConfirm(null);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRootArchiveSaving(false);
    }
  }, [archiveTask, dataSource, refreshLiveTasks, rootArchiveConfirm, rootArchiveSaving]);

  const cancelRootArchive = useCallback(() => {
    if (!rootArchiveSaving) {
      setRootArchiveConfirm(null);
    }
  }, [rootArchiveSaving]);

  useEffect(() => {
    if (!rootArchiveConfirm || rootArchiveSaving) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setRootArchiveConfirm(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [rootArchiveConfirm, rootArchiveSaving]);

  const toggleDiscoveryChannelTaskSelection = useCallback((discoveryTaskId: string, generatedTaskId: string) => {
    setSelectedDiscoveryChannelTaskIdsByTaskId((current) => {
      const selected = current[discoveryTaskId] ?? [];
      const next = selected.includes(generatedTaskId)
        ? selected.filter((taskId) => taskId !== generatedTaskId)
        : [...selected, generatedTaskId];
      return { ...current, [discoveryTaskId]: next };
    });
  }, []);

  const setAllActiveDiscoveryChannelTaskSelection = useCallback((
    discoveryTaskId: string,
    activeGeneratedTaskIds: string[],
    selected: boolean,
  ) => {
    setSelectedDiscoveryChannelTaskIdsByTaskId((current) => ({
      ...current,
      [discoveryTaskId]: selected ? activeGeneratedTaskIds : [],
    }));
  }, []);

  const clearDiscoveryChannelTaskSelection = useCallback((discoveryTaskId: string) => {
    setSelectedDiscoveryChannelTaskIdsByTaskId((current) => ({ ...current, [discoveryTaskId]: [] }));
    setSelectedDiscoveryChannelSetIdByTaskId((current) => ({ ...current, [discoveryTaskId]: null }));
  }, []);

  const selectDiscoveryChannelSet = useCallback((discoveryTaskId: string, channelSet: TeamDiscoveryChannelSet) => {
    setSelectedDiscoveryChannelTaskIdsByTaskId((current) => ({
      ...current,
      [discoveryTaskId]: channelSet.items.map((item) => item.generatedTaskId),
    }));
    setSelectedDiscoveryChannelSetIdByTaskId((current) => ({
      ...current,
      [discoveryTaskId]: channelSet.channelSetId,
    }));
    setDiscoveryChannelSetTitleByTaskId((current) => ({
      ...current,
      [discoveryTaskId]: channelSet.title,
    }));
  }, []);

  const saveDiscoveryChannelSet = useCallback(async (task: TeamCanvasTask, options?: DiscoveryChannelSetSaveOptions) => {
    const taskId = task.taskId;
    const generatedTaskIds = selectedDiscoveryChannelTaskIdsByTaskId[taskId] ?? [];
    if (generatedTaskIds.length === 0) {
      setError("请先选择至少一个 generated Task 作为渠道");
      return;
    }
    const title = (discoveryChannelSetTitleByTaskId[taskId] ?? "").trim() || `${task.title} 渠道集`;
    setDiscoveryChannelSetSavingByTaskId((current) => ({ ...current, [taskId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const selectedChannelSetId = options?.forceCreate ? null : selectedDiscoveryChannelSetIdByTaskId[taskId] ?? null;
      if (selectedChannelSetId) {
        const channelSet = await api.updateDiscoveryChannelSet(taskId, selectedChannelSetId, { title, generatedTaskIds });
        setDiscoveryChannelSetsByTaskId((current) => ({
          ...current,
          [taskId]: (current[taskId] ?? []).map((item) => (
            item.channelSetId === channelSet.channelSetId ? channelSet : item
          )),
        }));
        setSelectedDiscoveryChannelTaskIdsByTaskId((current) => ({
          ...current,
          [taskId]: channelSet.items.map((item) => item.generatedTaskId),
        }));
        setDiscoveryChannelSetTitleByTaskId((current) => ({ ...current, [taskId]: channelSet.title }));
      } else {
        const channelSet = await api.createDiscoveryChannelSet(taskId, { title, generatedTaskIds });
        setDiscoveryChannelSetsByTaskId((current) => ({
          ...current,
          [taskId]: [channelSet, ...(current[taskId] ?? []).filter((item) => item.channelSetId !== channelSet.channelSetId)],
        }));
        setSelectedDiscoveryChannelTaskIdsByTaskId((current) => ({ ...current, [taskId]: [] }));
        setSelectedDiscoveryChannelSetIdByTaskId((current) => ({ ...current, [taskId]: null }));
        setDiscoveryChannelSetTitleByTaskId((current) => ({ ...current, [taskId]: "" }));
      }
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDiscoveryChannelSetSavingByTaskId((current) => ({ ...current, [taskId]: false }));
    }
  }, [dataSource, discoveryChannelSetTitleByTaskId, selectedDiscoveryChannelSetIdByTaskId, selectedDiscoveryChannelTaskIdsByTaskId, setError]);

  const archiveDiscoveryChannelSet = useCallback(async (taskId: string, channelSetId: string) => {
    setDiscoveryChannelSetArchivingById((current) => ({ ...current, [channelSetId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const archived = await api.archiveDiscoveryChannelSet(taskId, channelSetId);
      setDiscoveryChannelSetsByTaskId((current) => ({
        ...current,
        [taskId]: (current[taskId] ?? []).filter((item) => item.channelSetId !== archived.channelSetId),
      }));
      setSelectedDiscoveryChannelSetIdByTaskId((current) => (
        current[taskId] === archived.channelSetId ? { ...current, [taskId]: null } : current
      ));
      setSelectedDiscoveryChannelTaskIdsByTaskId((current) => (
        selectedDiscoveryChannelSetIdByTaskId[taskId] === archived.channelSetId ? { ...current, [taskId]: [] } : current
      ));
      setDiscoveryChannelSetTitleByTaskId((current) => (
        selectedDiscoveryChannelSetIdByTaskId[taskId] === archived.channelSetId ? { ...current, [taskId]: "" } : current
      ));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDiscoveryChannelSetArchivingById((current) => ({ ...current, [channelSetId]: false }));
    }
  }, [dataSource, selectedDiscoveryChannelSetIdByTaskId, setError]);

  const updateDiscoveryRunPolicy = useCallback(async (task: TeamCanvasTask, channelSetId: string | null) => {
    const taskId = task.taskId;
    setDiscoveryRunPolicySavingByTaskId((current) => ({ ...current, [taskId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const response = await api.updateTask(taskId, {
        discoveryRunPolicy: channelSetId
          ? { mode: "channel_set", channelSetId }
          : { mode: "rediscover" },
      });
      setTasks((current) => current.map((item) => item.taskId === taskId ? response.task : item));
      setTaskNodes((current) => current.map((node) => (
        node.taskId === taskId ? { ...node, title: response.task.title, status: response.task.status } : node
      )));
      if (dataSource === "live") {
        await refreshLiveTasks();
        setTasks((current) => current.map((item) => item.taskId === taskId ? response.task : item));
      }
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDiscoveryRunPolicySavingByTaskId((current) => ({ ...current, [taskId]: false }));
    }
  }, [dataSource, refreshLiveTasks, setTaskNodes, setTasks, setError]);

  const runTask = useCallback(async (
    task: TeamCanvasTask,
    nodeId?: string,
    overrideBindings?: Record<string, string>,
    runOptions?: DiscoveryChannelSetRunOptions,
  ) => {
    const taskId = task.taskId;
    if (task.templateConfig && !overrideBindings && hasMissingRequiredTemplateBindings(task)) {
      openTaskParameterDraft(task);
      if (nodeId) {
        setExpandedTaskBranches((current) => current.map((item) =>
          item.nodeId === nodeId ? { ...item, detailMode: "parameters" } : item
        ));
      }
      setError(null);
      return;
    }
    setTaskRunSavingByTaskId((current) => ({ ...current, [taskId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      let selectionTaskConnections = taskConnectionsRef.current;
      let selectionTaskRunsByTaskId = taskRunsByTaskIdRef.current;
      if (api instanceof LiveTeamApi) {
        try {
          const rootSummary = await api.getRootSummary();
          selectionTaskConnections = rootSummary.taskConnections;
          selectionTaskRunsByTaskId = rootSummary.taskRunsByTaskId;
        } catch {
          selectionTaskConnections = taskConnectionsRef.current;
          selectionTaskRunsByTaskId = taskRunsByTaskIdRef.current;
        }
      }
      const upstreamRunSelections = buildLoadedUpstreamRunSelections(
        task,
        selectionTaskConnections,
        loadedTaskRunByTaskIdRef.current,
        loadedTaskRunSnapshotByTaskIdRef.current,
        selectionTaskRunsByTaskId,
      );
      const createRequest: TeamTaskRunCreateRequest | undefined = overrideBindings || upstreamRunSelections.length > 0 || runOptions?.discoveryChannelSetId
        ? {
            ...(overrideBindings ? { templateBindings: overrideBindings } : {}),
            ...(upstreamRunSelections.length > 0 ? { upstreamRunSelections } : {}),
            ...(runOptions?.discoveryChannelSetId ? { discoveryChannelSetId: runOptions.discoveryChannelSetId } : {}),
          }
        : undefined;
      const taskRun = await api.createTaskRun(taskId, createRequest);
      if (task.templateConfig && overrideBindings) {
        applyTaskParameterStateLocally(taskId, overrideBindings);
      }
      setTaskRunsByTaskId((current) => mergeTaskRun(current, taskId, taskRun));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTaskRunSavingByTaskId((current) => ({ ...current, [taskId]: false }));
    }
  }, [applyTaskParameterStateLocally, dataSource, openTaskParameterDraft]);

  const resetGeneratedTaskWorkUnit = useCallback(async (task: TeamCanvasTask) => {
    const taskId = task.taskId;
    if (!task.generatedSource) {
      setError("generated WorkUnit reset requires a generated task");
      return;
    }
    setGeneratedResetSavingByTaskId((current) => ({ ...current, [taskId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const response = await api.resetGeneratedTaskWorkUnit(taskId);
      replaceGeneratedTaskInCatalog(response.task);
      if (taskEditDraftByTaskId[taskId]) {
        replaceTaskEditDraft(response.task);
      }
      setTaskEditWarning(taskId, response.warnings?.join(" ") ?? null);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGeneratedResetSavingByTaskId((current) => ({ ...current, [taskId]: false }));
    }
  }, [dataSource, replaceGeneratedTaskInCatalog, replaceTaskEditDraft, setTaskEditWarning, taskEditDraftByTaskId]);

  const beginTaskPortConnection = useCallback((taskId: string, port: TeamTaskOutputPort) => {
    setTaskConnectionDraft({
      fromTaskId: taskId,
      fromOutputPortId: port.id,
      type: port.type,
    });
    setSourceConnectionDraft(null);
    setError(null);
  }, []);

  const beginSourcePortConnection = useCallback((sourceNodeId: string, sourcePort: TeamCanvasSourceNode["outputPort"]) => {
    setSourceConnectionDraft({
      fromSourceNodeId: sourceNodeId,
      fromOutputPortId: sourcePort.id,
      type: sourcePort.type,
    });
    setTaskConnectionDraft(null);
    setError(null);
  }, []);

  const completeTaskPortConnection = useCallback(async (taskId: string, port: TeamTaskInputPort) => {
    if (!taskConnectionDraft && !sourceConnectionDraft) {
      setError("请先选择一个输出端口");
      return;
    }
    if (taskConnectionDraft?.fromTaskId === taskId) {
      setError("不能把 Task 输出连接回自己");
      return;
    }
    const draftType = taskConnectionDraft?.type ?? sourceConnectionDraft!.type;
    if (draftType !== port.type) {
      setError(`端口类型不匹配: ${draftType} -> ${port.type}`);
      return;
    }
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      if (taskConnectionDraft) {
        const connection = await api.createTaskConnection({
          fromTaskId: taskConnectionDraft.fromTaskId,
          fromOutputPortId: taskConnectionDraft.fromOutputPortId,
          toTaskId: taskId,
          toInputPortId: port.id,
        });
        setTaskConnections((current) => [
          ...current.filter((candidate) => candidate.connectionId !== connection.connectionId),
          connection,
        ]);
      } else if (sourceConnectionDraft && api instanceof LiveTeamApi) {
        const connection = await api.createSourceConnection({
          fromSourceNodeId: sourceConnectionDraft.fromSourceNodeId,
          fromOutputPortId: sourceConnectionDraft.fromOutputPortId,
          toTaskId: taskId,
          toInputPortId: port.id,
        });
        setSourceConnections((current) => [
          ...current.filter((candidate) => candidate.connectionId !== connection.connectionId),
          connection,
        ]);
      }
      setTaskConnectionDraft(null);
      setSourceConnectionDraft(null);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [dataSource, sourceConnectionDraft, taskConnectionDraft]);

  const beginTaskDependency = useCallback((taskId: string) => {
    if (taskDependencyDraft?.fromTaskId === taskId) {
      setTaskDependencyDraft(null);
    } else {
      setTaskDependencyDraft({ fromTaskId: taskId });
      setTaskConnectionDraft(null);
      setSourceConnectionDraft(null);
    }
  }, [taskDependencyDraft]);

  const completeTaskDependency = useCallback(async (toTaskId: string) => {
    if (!taskDependencyDraft) return;
    if (taskDependencyDraft.fromTaskId === toTaskId) {
      setTaskDependencyDraft(null);
      return;
    }
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const dep = await api.createTaskDependency({
        fromTaskId: taskDependencyDraft.fromTaskId,
        toTaskId,
      });
      setTaskDependencies((current) => {
        if (current.some((d) => d.dependencyId === dep.dependencyId)) return current;
        return [...current, dep];
      });
    } catch (error) {
      const message = error && typeof error === "object" && "message" in error ? String(error.message) : "创建依赖失败";
      setError(message);
    } finally {
      setTaskDependencyDraft(null);
    }
  }, [dataSource, taskDependencyDraft]);

  const [pendingDeleteTaskConnectionId, setPendingDeleteTaskConnectionId] = useState<string | null>(null);
  const [pendingDeleteSourceConnectionId, setPendingDeleteSourceConnectionId] = useState<string | null>(null);
  const [pendingDeleteDependencyId, setPendingDeleteDependencyId] = useState<string | null>(null);

  const deleteTaskConnection = useCallback(async (connectionId: string) => {
    setPendingDeleteTaskConnectionId(connectionId);
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      await api.deleteTaskConnection(connectionId);
      setTaskConnections((current) => current.filter((c) => c.connectionId !== connectionId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPendingDeleteTaskConnectionId(null);
    }
  }, [dataSource]);

  const deleteSourceConnectionAction = useCallback(async (connectionId: string) => {
    setPendingDeleteSourceConnectionId(connectionId);
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      await api.deleteSourceConnection(connectionId);
      setSourceConnections((current) => current.filter((c) => c.connectionId !== connectionId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPendingDeleteSourceConnectionId(null);
    }
  }, [dataSource]);

  const deleteTaskDependencyAction = useCallback(async (dependencyId: string) => {
    setPendingDeleteDependencyId(dependencyId);
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      await api.deleteTaskDependency(dependencyId);
      setTaskDependencies((current) => current.filter((d) => d.dependencyId !== dependencyId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPendingDeleteDependencyId(null);
    }
  }, [dataSource]);

  const createTextSourceNode = useCallback(async () => {
    if (dataSource !== "live") return;
    try {
      const api = new LiveTeamApi();
      const sourceNode = await api.createSourceNode({
        title: "文本输出",
        nodeType: "text",
        outputPort: { id: "value", label: "文本", type: "string" },
        content: { text: "" },
      });
      setSourceNodes((current) => {
        const next = [...current.filter((candidate) => candidate.sourceNodeId !== sourceNode.sourceNodeId), sourceNode];
        setSourceAtlasNodes((nodes) => makeSourceNodes(next, liveSourceRefreshPositions(nodes)));
        return next;
      });
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [dataSource]);

  const createFileSourceNode = useCallback(async (file: File) => {
    if (dataSource !== "live") return;
    const type = inferSourceFileType(file);
    try {
      const api = new LiveTeamApi();
      const sourceNode = await api.createSourceNode({
        title: file.name,
        nodeType: "file",
        outputPort: { id: "value", label: "文件", type },
        content: {
          fileName: file.name,
          mimeType: file.type || undefined,
          size: file.size,
        },
      });
      setSourceNodes((current) => {
        const next = [...current.filter((candidate) => candidate.sourceNodeId !== sourceNode.sourceNodeId), sourceNode];
        setSourceAtlasNodes((nodes) => makeSourceNodes(next, liveSourceRefreshPositions(nodes)));
        return next;
      });
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [dataSource]);

  const updateTextSourceNode = useCallback(async (sourceNodeId: string, text: string) => {
    const currentNode = sourceNodesById.get(sourceNodeId);
    if (!currentNode || currentNode.nodeType !== "text" || currentNode.content?.text === text) return;
    try {
      const api = new LiveTeamApi();
      const sourceNode = await api.updateSourceNode(sourceNodeId, {
        content: {
          ...currentNode.content,
          text,
        },
      });
      setSourceNodes((current) => current.map((candidate) => (
        candidate.sourceNodeId === sourceNode.sourceNodeId ? sourceNode : candidate
      )));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [sourceNodesById]);

  const cancelTaskRun = useCallback(async (task: TeamCanvasTask, taskRun: TeamRunState) => {
    const taskId = task.taskId;
    setTaskRunSavingByTaskId((current) => ({ ...current, [taskId]: true }));
    try {
      const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
      const cancelledRun = await api.cancelTaskRun(taskRun.runId);
      setTaskRunsByTaskId((current) => mergeTaskRun(current, taskId, cancelledRun));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTaskRunSavingByTaskId((current) => ({ ...current, [taskId]: false }));
    }
  }, [dataSource]);

  const runTaskGroup = useCallback(async (groupId: string) => {
    if (dataSource !== "live") return;
    const group = teamTaskGroups.find((candidate) => candidate.groupId === groupId && !candidate.archived);
    if (!group) return;
    if (group.status === "invalid" || group.taskIds.length === 0) return;
    const currentGroupRun = taskGroupRunUiState.latestByGroupId[groupId];
    if (isActiveTaskGroupRun(currentGroupRun)) return;
    const blockedByActiveTask = group.taskIds.some((taskId) => (
      (taskRunsByTaskIdRef.current[taskId] ?? []).some((taskRun) => isActiveRun(taskRun.status))
    ));
    if (blockedByActiveTask) return;
    setTaskGroupRunUiState((current) => ({
      ...current,
      savingByGroupId: { ...current.savingByGroupId, [groupId]: true },
    }));
    try {
      const api = new LiveTeamApi();
      const groupRun = await api.startTaskGroupRun(groupId);
      setTaskGroupRunUiState((current) => ({
        latestByGroupId: { ...current.latestByGroupId, [groupId]: groupRun },
        savingByGroupId: { ...current.savingByGroupId, [groupId]: false },
      }));
      await refreshLiveTasks({ silent: true });
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTaskGroupRunUiState((current) => ({
        ...current,
        savingByGroupId: { ...current.savingByGroupId, [groupId]: false },
      }));
    }
  }, [dataSource, refreshLiveTasks, setError, taskGroupRunUiState.latestByGroupId, teamTaskGroups]);

  const patchLiveTaskGroupMembership = useCallback(async (groupId: string, taskIds: string[]) => {
    if (dataSource !== "live") return;
    const currentGroup = taskGroups.find((group) => group.groupId === groupId);
    if (currentGroup?.locked) return;
    try {
      const nextGroup = await new LiveTeamApi().patchTaskGroup(groupId, { taskIds });
      setTeamTaskGroups((current) => current.map((group) => (
        group.groupId === nextGroup.groupId ? nextGroup : group
      )));
      setTaskGroupDisplayStates((current) => (
        current.some((state) => state.groupId === nextGroup.groupId)
          ? current
          : [...current, { groupId: nextGroup.groupId, collapsed: false, locked: false }]
      ));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [dataSource, setError, setTeamTaskGroups, taskGroups]);

  const renameTaskGroup = useCallback((groupId: string, title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const currentGroup = taskGroups.find((group) => group.groupId === groupId);
    if (currentGroup?.locked || currentGroup?.title === trimmedTitle) return;

    if (dataSource === "live") {
      void new LiveTeamApi().patchTaskGroup(groupId, { title: trimmedTitle }).then((nextGroup) => {
        setTeamTaskGroups((current) => current.map((group) => (
          group.groupId === nextGroup.groupId ? nextGroup : group
        )));
        setError(null);
      }).catch((e) => setError(errorMessage(e)));
      return;
    }

    setMockTaskGroups((current) => current.map((group) => (
      group.groupId === groupId ? { ...group, title: trimmedTitle } : group
    )));
  }, [dataSource, setError, setTeamTaskGroups, taskGroups]);

  const addSelectedTasksToTaskGroup = useCallback((groupId: string) => {
    if (dataSource !== "live") return;
    const group = teamTaskGroups.find((candidate) => candidate.groupId === groupId && !candidate.archived);
    if (!group) return;
    const taskIds = [...group.taskIds];
    for (const entry of selectedAtlasEntries) {
      if (entry.kind !== "task") continue;
      if (!taskIds.includes(entry.taskId)) taskIds.push(entry.taskId);
    }
    if (taskIds.length === group.taskIds.length) return;
    void patchLiveTaskGroupMembership(groupId, taskIds);
  }, [dataSource, patchLiveTaskGroupMembership, selectedAtlasEntries, teamTaskGroups]);

  const removeTaskFromTaskGroup = useCallback((groupId: string, taskId: string) => {
    if (dataSource !== "live") return;
    const group = teamTaskGroups.find((candidate) => candidate.groupId === groupId && !candidate.archived);
    if (!group) return;
    const taskIds = group.taskIds.filter((candidate) => candidate !== taskId);
    if (taskIds.length === group.taskIds.length) return;
    void patchLiveTaskGroupMembership(groupId, taskIds);
  }, [dataSource, patchLiveTaskGroupMembership, teamTaskGroups]);

  const cancelTaskGroupRun = useCallback(async (groupId: string, groupRunId: string) => {
    if (dataSource !== "live") return;
    setTaskGroupRunUiState((current) => ({
      ...current,
      savingByGroupId: { ...current.savingByGroupId, [groupId]: true },
    }));
    try {
      const api = new LiveTeamApi();
      const groupRun = await api.cancelTaskGroupRun(groupRunId);
      setTaskGroupRunUiState((current) => ({
        latestByGroupId: { ...current.latestByGroupId, [groupId]: groupRun },
        savingByGroupId: { ...current.savingByGroupId, [groupId]: false },
      }));
      await refreshLiveTasks({ silent: true });
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTaskGroupRunUiState((current) => ({
        ...current,
        savingByGroupId: { ...current.savingByGroupId, [groupId]: false },
      }));
    }
  }, [dataSource, refreshLiveTasks, setError]);

  useEffect(() => {
    if (dataSource !== "live") return;
    const groupIds = new Set(teamTaskGroups.filter((group) => !group.archived).map((group) => group.groupId));
    const activeEntries = Object.entries(taskGroupRunUiState.latestByGroupId)
      .filter(([groupId, groupRun]) => groupIds.has(groupId) && isActiveTaskGroupRun(groupRun));
    if (activeEntries.length === 0) return;

    let cancelled = false;
    const api = new LiveTeamApi();

    async function refreshActiveTaskGroupRuns() {
      for (const [groupId, groupRun] of activeEntries) {
        try {
          const fresh = await api.getTaskGroupRun(groupRun.groupRunId);
          if (cancelled) continue;
          setTaskGroupRunUiState((current) => {
            if (hasSameTaskGroupRunPollingSignature(current.latestByGroupId[groupId], fresh)) {
              return current;
            }
            return {
              ...current,
              latestByGroupId: { ...current.latestByGroupId, [groupId]: fresh },
            };
          });
          if (!isActiveTaskGroupRun(fresh)) {
            void refreshLiveTasks({ silent: true }).catch((e) => {
              if (!cancelled) setError(errorMessage(e));
            });
          }
        } catch {
          // Keep the last visible GroupRun state on transient polling failures.
        }
      }
    }

    const timer = globalThis.setInterval(() => {
      void refreshActiveTaskGroupRuns();
    }, 2000);
    void refreshActiveTaskGroupRuns();

    return () => {
      cancelled = true;
      globalThis.clearInterval(timer);
    };
  }, [dataSource, refreshLiveTasks, setError, taskGroupRunUiState.latestByGroupId, teamTaskGroups]);

  useEffect(() => {
    if (runObserverTargets.length === 0) return;

    let cancelled = false;
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();

    async function refreshTaskRunObserver(target: typeof runObserverTargets[number]) {
      const runId = target.runId;
      const observedTaskId = target.taskId;
      setTaskRunObserverByRunId((current) => ({
        ...current,
        [runId]: {
          loading: true,
          attempts: current[runId]?.attempts ?? [],
          files: current[runId]?.files ?? {},
          manualUpstreamInputMetadataByKey: current[runId]?.manualUpstreamInputMetadataByKey ?? {},
          manualUpstreamInputMetadataAttempted: current[runId]?.manualUpstreamInputMetadataAttempted ?? false,
          error: null,
          lastUpdatedAt: current[runId]?.lastUpdatedAt ?? null,
        },
      }));

      try {
        const { run: freshRun, attempts } = await api.getTaskRunProcessSummary(runId, observedTaskId);
        if (cancelled) return;
        const hasManualUpstreamSelections = (freshRun.source?.manualUpstreamSelections ?? []).length > 0;
        const currentObserverState = taskRunObserverByRunIdRef.current[runId];
        let manualUpstreamInputMetadataByKey = hasManualUpstreamSelections
          ? (currentObserverState?.manualUpstreamInputMetadataByKey ?? {})
          : {};
        let manualUpstreamInputMetadataAttempted = hasManualUpstreamSelections
          ? (currentObserverState?.manualUpstreamInputMetadataAttempted ?? false)
          : false;

        if (hasManualUpstreamSelections && !manualUpstreamInputMetadataAttempted) {
          manualUpstreamInputMetadataAttempted = true;
          const stateBeforeFullDetail = taskRunObserverByRunIdRef.current[runId];
          taskRunObserverByRunIdRef.current = {
            ...taskRunObserverByRunIdRef.current,
            [runId]: {
              loading: stateBeforeFullDetail?.loading ?? true,
              attempts: stateBeforeFullDetail?.attempts ?? [],
              files: stateBeforeFullDetail?.files ?? {},
              manualUpstreamInputMetadataByKey,
              manualUpstreamInputMetadataAttempted,
              error: stateBeforeFullDetail?.error ?? null,
              lastUpdatedAt: stateBeforeFullDetail?.lastUpdatedAt ?? null,
            },
          };
          setTaskRunObserverByRunId((current) => ({
            ...current,
            [runId]: {
              loading: current[runId]?.loading ?? true,
              attempts: current[runId]?.attempts ?? [],
              files: current[runId]?.files ?? {},
              manualUpstreamInputMetadataByKey: current[runId]?.manualUpstreamInputMetadataByKey ?? {},
              manualUpstreamInputMetadataAttempted,
              error: current[runId]?.error ?? null,
              lastUpdatedAt: current[runId]?.lastUpdatedAt ?? null,
            },
          }));
          try {
            const fullDetailRun = await api.getTaskRun(runId);
            if (!cancelled) {
              manualUpstreamInputMetadataByKey = deriveManualUpstreamInputMetadata(fullDetailRun);
            }
          } catch {
            manualUpstreamInputMetadataByKey = {};
          }
        }
        if (cancelled) return;

        setTaskRunsByTaskId((current) => mergeTaskRun(current, observedTaskId, freshRun));
        if (dataSource === "live" && isActiveRun(target.status) && !isActiveRun(freshRun.status)) {
          void refreshLiveTasks({ silent: true }).catch((e) => {
            if (!cancelled) setError(errorMessage(e));
          });
          scheduleLiveTaskDiscoveryRefresh();
        }
        setTaskRunObserverByRunId((current) => ({
          ...current,
          [runId]: {
            loading: false,
            attempts,
            files: current[runId]?.files ?? {},
            manualUpstreamInputMetadataByKey,
            manualUpstreamInputMetadataAttempted,
            error: null,
            lastUpdatedAt: new Date().toISOString(),
          },
        }));

        const descriptors = buildTaskRunFileDescriptors(attempts);
        const fileEntries = await Promise.all(descriptors.map(async (descriptor) => {
          try {
            const content = await api.readTaskRunAttemptFile(
              runId,
              observedTaskId,
              descriptor.attemptId,
              descriptor.fileName,
            );
            return [descriptor.key, { content }] as const;
          } catch (e) {
            return [descriptor.key, { error: errorMessage(e) }] as const;
          }
        }));
        if (
          fileEntries.length === 0 ||
          !runObserverOpenTargetKeysRef.current.has(`${dataSource}\u0000${observedTaskId}\u0000${runId}`)
        ) return;
        setTaskRunObserverByRunId((current) => ({
          ...current,
          [runId]: {
            loading: false,
            attempts: current[runId]?.attempts ?? attempts,
            files: {
              ...(current[runId]?.files ?? {}),
              ...Object.fromEntries(fileEntries),
            },
            manualUpstreamInputMetadataByKey: current[runId]?.manualUpstreamInputMetadataByKey ?? manualUpstreamInputMetadataByKey,
            manualUpstreamInputMetadataAttempted: current[runId]?.manualUpstreamInputMetadataAttempted ?? manualUpstreamInputMetadataAttempted,
            error: null,
            lastUpdatedAt: current[runId]?.lastUpdatedAt ?? new Date().toISOString(),
          },
        }));
      } catch (e) {
        if (cancelled) return;
        const isActiveObserverPoll = isActiveRun(target.status);
        setTaskRunObserverByRunId((current) => ({
          ...current,
          [runId]: {
            loading: false,
            attempts: current[runId]?.attempts ?? [],
            files: current[runId]?.files ?? {},
            manualUpstreamInputMetadataByKey: current[runId]?.manualUpstreamInputMetadataByKey ?? {},
            manualUpstreamInputMetadataAttempted: current[runId]?.manualUpstreamInputMetadataAttempted ?? false,
            error: isActiveObserverPoll ? null : errorMessage(e),
            lastUpdatedAt: current[runId]?.lastUpdatedAt ?? null,
          },
        }));
      }
    }

    const targetRefreshKey = (target: typeof runObserverTargets[number]) => (
      `${dataSource}\u0000${target.taskId}\u0000${target.runId}\u0000${target.status}`
    );

    const initialRefreshTargets = runObserverTargets.filter((target) => {
      const key = targetRefreshKey(target);
      if (runObserverInitialRefreshKeysRef.current.has(key)) return false;
      runObserverInitialRefreshKeysRef.current.add(key);
      return true;
    });

    async function refreshTaskRunObservers(targets = runObserverTargets) {
      await Promise.all(targets.map((target) => refreshTaskRunObserver(target)));
    }

    const shouldPoll = runObserverTargets.some((target) => isActiveRun(target.status));
    if (initialRefreshTargets.length > 0) {
      void refreshTaskRunObservers(initialRefreshTargets);
    }
    if (!shouldPoll) {
      return () => {
        cancelled = true;
      };
    }

    const timer = globalThis.setInterval(() => {
      void refreshTaskRunObservers();
    }, 2000);

    return () => {
      cancelled = true;
      globalThis.clearInterval(timer);
    };
  }, [dataSource, refreshLiveTasks, runObserverTargetSignature, scheduleLiveTaskDiscoveryRefresh, setError]);

  const canCreateTask = dataSource === "live" && agents.length > 0;
  const canRefreshTasks = dataSource === "live" && !liveTasksRefreshing;
  const selectedTaskNodeEntries = selectedAtlasEntries.filter((entry): entry is Extract<AtlasSelectedNodeEntry, { kind: "task" }> => entry.kind === "task");
  const canCreateTaskGroup = selectedTaskNodeEntries.length >= 2;
  const createTaskGroupFromSelection = useCallback(() => {
    if (dataSource === "live") {
      const taskIds = Array.from(new Set(selectedTaskNodeEntries.map((entry) => entry.taskId)));
      if (taskIds.length < 2) return;
      const nextIndex = teamTaskGroups.filter((group) => !group.archived).length + 1;
      void new LiveTeamApi().createTaskGroup({
        title: `Group ${nextIndex}`,
        taskIds,
      }).then((createdGroup) => {
        setTeamTaskGroups((current) => [
          ...current.filter((group) => group.groupId !== createdGroup.groupId),
          createdGroup,
        ]);
        setTaskGroupDisplayStates((current) => [
          ...current.filter((state) => state.groupId !== createdGroup.groupId),
          { groupId: createdGroup.groupId, collapsed: false, locked: false },
        ]);
      }).catch((e) => setError(errorMessage(e)));
      return;
    }

    const taskNodeIds = Array.from(new Set(selectedTaskNodeEntries.map((entry) => entry.nodeId)));
    if (taskNodeIds.length < 2) return;
    setMockTaskGroups((current) => {
      const nextIndex = current.length + 1;
      return [
        ...current,
        {
          groupId: `task-group-${Date.now().toString(36)}-${nextIndex}`,
          title: `Group ${nextIndex}`,
          taskNodeIds,
          collapsed: false,
          locked: false,
        },
      ];
    });
  }, [dataSource, selectedTaskNodeEntries, setError, setTeamTaskGroups, teamTaskGroups]);

  const toggleTaskGroup = useCallback((groupId: string) => {
    if (dataSource === "live") {
      setTaskGroupDisplayStates((current) => {
        const existing = current.find((state) => state.groupId === groupId);
        if (!existing) return [...current, { groupId, collapsed: true, locked: false }];
        return current.map((state) => (
          state.groupId === groupId ? { ...state, collapsed: !state.collapsed } : state
        ));
      });
      return;
    }
    setMockTaskGroups((current) => current.map((group) => (
      group.groupId === groupId ? { ...group, collapsed: !group.collapsed } : group
    )));
  }, [dataSource]);

  const toggleTaskGroupLock = useCallback((groupId: string) => {
    if (dataSource === "live") {
      setTaskGroupDisplayStates((current) => {
        const existing = current.find((state) => state.groupId === groupId);
        if (!existing) return [...current, { groupId, collapsed: false, locked: true }];
        return current.map((state) => (
          state.groupId === groupId ? { ...state, locked: !state.locked } : state
        ));
      });
      return;
    }
    setMockTaskGroups((current) => current.map((group) => (
      group.groupId === groupId ? { ...group, locked: !group.locked } : group
    )));
  }, [dataSource]);

  const deleteTaskGroup = useCallback((groupId: string) => {
    const currentGroup = taskGroups.find((group) => group.groupId === groupId);
    if (currentGroup?.locked) return;
    if (dataSource === "live") {
      void new LiveTeamApi().archiveTaskGroup(groupId).then((archivedGroup) => {
        setTeamTaskGroups((current) => current.filter((group) => group.groupId !== archivedGroup.groupId));
        setTaskGroupDisplayStates((current) => current.filter((state) => state.groupId !== archivedGroup.groupId));
        setMinimizedTaskGroupIds((current) => current.filter((id) => id !== archivedGroup.groupId));
      }).catch((e) => setError(errorMessage(e)));
      return;
    }
    setMockTaskGroups((current) => current.filter((group) => group.groupId !== groupId || group.locked));
    setMinimizedTaskGroupIds((current) => current.filter((id) => id !== groupId));
  }, [dataSource, setError, setTeamTaskGroups, taskGroups]);

  const agentToolbar = (
    <div className="agent-atlas-actions">
      <div className="root-filter-segment" data-active-filter={rootNodeFilter} role="tablist" aria-label="根节点显示">
        <button type="button" role="tab" aria-pressed={rootNodeFilter === "all"} className={`root-filter-btn${rootNodeFilter === "all" ? " is-active" : ""}`} onClick={() => setRootNodeFilter("all")}>
          <span className="root-filter-label">ALL</span>
          <span className="root-filter-count">{agentNodes.length + tasks.length + sourceNodes.length}</span>
        </button>
        <button type="button" role="tab" aria-pressed={rootNodeFilter === "agent"} className={`root-filter-btn${rootNodeFilter === "agent" ? " is-active" : ""}`} onClick={() => setRootNodeFilter("agent")}>
          <span className="root-filter-label">Agent</span>
          <span className="root-filter-count">{agentNodes.length}</span>
        </button>
        <button type="button" role="tab" aria-pressed={rootNodeFilter === "task"} className={`root-filter-btn${rootNodeFilter === "task" ? " is-active" : ""}`} onClick={() => setRootNodeFilter("task")}>
          <span className="root-filter-label">Task</span>
          <span className="root-filter-count">{tasks.length}</span>
        </button>
        <button type="button" role="tab" aria-pressed={rootNodeFilter === "source"} className={`root-filter-btn${rootNodeFilter === "source" ? " is-active" : ""}`} onClick={() => setRootNodeFilter("source")}>
          <span className="root-filter-label">Source</span>
          <span className="root-filter-count">{sourceNodes.length}</span>
        </button>
      </div>
      <div className="agent-toolbar-group agent-toolbar-agent-group">
        <button
          type="button"
          className="agent-add-btn"
          onClick={() => {
            setTaskLeaderPickerOpen(false);
            setAgentPickerOpen((open) => !open);
          }}
          aria-expanded={agentPickerOpen}
        >
          添加 Agent
        </button>
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
      <div className="agent-toolbar-group task-toolbar-group" aria-label="Task 操作">
        <button
          type="button"
          className="agent-add-btn task-create-btn"
          disabled={!canCreateTask}
          onClick={() => {
            setAgentPickerOpen(false);
            setTaskLeaderPickerOpen((open) => !open);
          }}
          aria-expanded={taskLeaderPickerOpen}
        >
          创建 Task
        </button>
        <button
          type="button"
          className="agent-add-btn task-refresh-btn"
          disabled={!canRefreshTasks}
          onClick={() => {
            void refreshLiveTasks().catch((e) => setError(errorMessage(e)));
          }}
        >
          {liveTasksRefreshing ? "刷新中..." : "刷新 Task"}
        </button>
        <button
          type="button"
          className="agent-add-btn task-group-create-btn"
          disabled={!canCreateTaskGroup}
          onClick={createTaskGroupFromSelection}
        >
          创建 Group{selectedTaskNodeEntries.length > 0 ? ` (${selectedTaskNodeEntries.length})` : ""}
        </button>
        {taskLeaderPickerOpen && (
          <div className="agent-picker task-leader-picker" aria-label="Task leader catalog">
            {agents.map((agent) => (
              <button
                key={agent.agentId}
                type="button"
                className="agent-picker-option"
                onClick={() => openTaskCreateBranch(agent.agentId)}
              >
                <span className="agent-picker-name">{agent.name}</span>
                <code>{agent.agentId}</code>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="agent-toolbar-group source-toolbar-group" aria-label="输出节点">
        <button
          type="button"
          className="agent-add-btn source-create-btn"
          disabled={dataSource !== "live"}
          onClick={() => void createTextSourceNode()}
        >
          文本输出
        </button>
        <button
          type="button"
          className="agent-add-btn source-create-btn"
          disabled={dataSource !== "live"}
          onClick={() => sourceFileInputRef.current?.click()}
        >
          文件输出
        </button>
        <input
          ref={sourceFileInputRef}
          type="file"
          className="sr-only"
          aria-label="选择输出文件"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void createFileSourceNode(file);
            }
            event.currentTarget.value = "";
          }}
        />
      </div>
    </div>
  );

  const mapToolbarControls = (
    <div className="map-toolbar-controls" aria-label="全局视图设置">
      <button
        type="button"
        className="theme-toggle-btn"
        aria-label="切换主题"
        aria-pressed={effectiveTheme === "dark"}
        disabled={visualTheme === "dell-1996"}
        title={visualTheme === "dell-1996" ? "Dell 1996 仅支持浅色模式" : undefined}
        onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
      >
        <span className="theme-toggle-track" aria-hidden="true">
          <span className="theme-toggle-icon theme-toggle-sun">☀</span>
          <span className="theme-toggle-icon theme-toggle-moon">☾</span>
          <span className="theme-toggle-thumb" />
        </span>
      </button>
      <button
        type="button"
        className="visual-theme-toggle-btn"
        aria-label="切换视觉主题"
        aria-pressed={visualTheme === "dell-1996"}
        onClick={() => setVisualTheme((current) => {
          const next = current === "default" ? "dell-1996" : "default";
          storeVisualTheme(next);
          return next;
        })}
      >
        {visualTheme === "dell-1996" ? "Dell 1996" : "默认样式"}
      </button>
      <select
        id="team-console-data-source"
        name="teamConsoleDataSource"
        value={dataSource}
        onChange={(event) => {
          const nextSource = event.target.value as DataSource;
          setDataSource(nextSource);
        }}
        className="datasource-select"
        aria-label="数据来源"
      >
        <option value="mock">示例数据</option>
        <option value="live">实时 API</option>
      </select>
    </div>
  );

  const expandedAgentBranchMode = expandedAgentBranch?.mode ?? "chat";
  const expandedAgentBranchLabel = expandedAgentBranchMode === "task-create" ? "创建 Task" : "主项目对话";
  const expandedAgentIframeTitle = expandedAgentBranchMode === "task-create"
    ? `${expandedAgent?.name ?? ""} Task 创建`
    : `${expandedAgent?.name ?? ""} 主项目对话`;

  const renderExpandedAgentBranchPanel = (embedMode: AgentPlaygroundEmbedMode) => expandedAgentNode && expandedAgent ? (
    <section className="agent-playground-branch emap-dialog-branch" aria-label={`${expandedAgent.name} ${expandedAgentBranchLabel}`}>
      <header className="agent-playground-branch-head">
        <div className="agent-playground-branch-title">
          <span>{expandedAgentBranchLabel}</span>
          <strong>{expandedAgent.name}</strong>
          <code>{expandedAgent.agentId}</code>
        </div>
        <button
          type="button"
          className="agent-playground-branch-collapse"
          onClick={() => {
            refreshLiveTasksAfterLeavingTaskCreateBranch(expandedAgentBranch);
            setExpandedAgentBranch(null);
          }}
          aria-label={`收起 ${expandedAgent.name} ${expandedAgentBranchLabel}分支`}
        >
          收起
        </button>
      </header>
      {expandedAgentBranchMode === "task-create" && (
        <div className="task-leader-branch-hint">
          在对话中使用 <code>/team-task</code> 创建 Task。Team Console 只负责打开 leader 对话。
        </div>
      )}
      <iframe
        className="agent-playground-iframe"
        title={expandedAgentIframeTitle}
        src={buildAgentPlaygroundUrl(expandedAgent.agentId, expandedAgentBranchMode, embedMode)}
        referrerPolicy="no-referrer"
        allow="clipboard-write; clipboard-read"
      />
    </section>
  ) : null;
  const expandedAgentBranchPanel = renderExpandedAgentBranchPanel(
    expandedAgentBranchMode === "chat" ? "mini" : "full",
  );
  const maximizedAgentBranchPanel = renderExpandedAgentBranchPanel("full");

  const taskBranchPanelItems = expandedTaskBranches.flatMap((branch) => {
    const node = taskNodes.find((candidate) => candidate.nodeId === branch.nodeId) ?? null;
    const task = node ? tasksById.get(node.taskId) ?? null : null;
    if (!node || !task) return [];
    const runs = taskRunsByTaskId[task.taskId] ?? [];
    const latestRun = selectLatestRun(runs);
    const activeRun = runs.find((taskRun) => isActiveRun(taskRun.status)) ?? null;
    const runSaving = Boolean(taskRunSavingByTaskId[task.taskId]);
    const detailMode = branch.detailMode ?? null;
    const runButtonLabel = runSaving ? "\u542f\u52a8\u4e2d..." : activeRun ? "\u8fd0\u884c\u4e2d" : latestRun ? "\u91cd\u65b0\u8fd0\u884c" : "\u8fd0\u884c";
    const runSummaryLabel = latestRun && isActiveRun(latestRun.status) ? "\u8fd0\u884c\u4e2d" : "\u6700\u8fd1\u8fd0\u884c";
    const latestRunIsObserved = Boolean(
      latestRun
        && detailMode === "run-observer"
        && branch.observedRunId === latestRun.runId,
    );
    const taskDeleteConfirming = taskArchiveConfirmNodeId === branch.nodeId;
    const taskDeleteSaving = taskArchiveSavingNodeId === branch.nodeId;
    const anyTaskArchiveSaving = Boolean(taskArchiveSavingNodeId);
    return [{
      id: taskMenuPanelId(branch.nodeId),
      nodeId: branch.nodeId,
      panel: (
        <section className="task-leader-branch task-action-branch emap-menu-branch" aria-label={`${task.title} Task \u64cd\u4f5c`}>
          <header className="task-leader-branch-head">
            <div className="task-leader-branch-title">
              <span>{"Task \u64cd\u4f5c"}</span>
              <strong>{task.title}</strong>
              <code>{task.taskId}</code>
            </div>
            <button
              type="button"
              className="task-leader-branch-collapse"
              onClick={() => closeTaskBranch(branch.nodeId)}
              aria-label={`\u6536\u8d77 ${task.title} Task \u64cd\u4f5c`}
            >
              {"\u6536\u8d77"}
            </button>
          </header>
          <div className="task-action-menu" aria-label={`${task.title} \u64cd\u4f5c\u83dc\u5355`}>
            <button
              type="button"
              className="task-action-menu-button"
              disabled={runSaving || Boolean(activeRun) || task.status !== "ready"}
              title={task.status === "ready" ? "\u542f\u52a8\u8fd9\u4e2a Task \u7684 WorkUnit run" : "\u53ea\u6709 ready Task \u53ef\u4ee5\u8fd0\u884c"}
              onClick={() => {
                void runTask(task, branch.nodeId);
              }}
            >
              {runButtonLabel}
            </button>
            {activeRun && (
              <button
                type="button"
                className="task-action-menu-button"
                disabled={runSaving}
                onClick={() => {
                  void cancelTaskRun(task, activeRun);
                }}
              >
                {"\u505c\u6b62"}
              </button>
            )}
            {latestRun && (
              <button
                type="button"
                className="task-run-summary"
                aria-label={`${task.title} ${runSummaryLabel} ${RUN_STATUS_LABELS[latestRun.status]} phase ${taskRunPhase(latestRun, task.taskId)}`}
                onClick={() => (
                  latestRunIsObserved
                    ? setExpandedTaskBranches((current) => current.map((item) => (
                      item.nodeId === branch.nodeId
                        ? { ...item, detailMode: null, observedRunId: undefined, selectedFileKeys: [] }
                        : item
                    )))
                    : setExpandedTaskBranches((current) =>
                      current.map((item) =>
                        item.nodeId === branch.nodeId
                          ? { ...item, detailMode: "run-observer", observedRunId: latestRun.runId, selectedFileKeys: [] }
                          : item
                      )
                    )
                )}
              >
                <span className="task-run-summary-kicker">{runSummaryLabel}</span>
                <span className="task-run-summary-head">
                  <strong>{RUN_STATUS_LABELS[latestRun.status]}</strong>
                  <em>{latestRunIsObserved ? "\u6536\u8d77\u8f93\u51fa" : "\u67e5\u770b\u8f93\u51fa"}</em>
                </span>
                <span className="task-run-summary-metrics">
                  <span><b>{"\u9636\u6bb5"}</b><strong>{taskRunPhase(latestRun, task.taskId)}</strong></span>
                  <span><b>{"\u8017\u65f6"}</b><strong>{taskRunElapsed(latestRun)}</strong></span>
                  <span><b>Attempts</b><strong>{taskRunAttempts(latestRun, task.taskId)}</strong></span>
                </span>
                <span className="task-run-summary-message">{taskRunMessage(latestRun, task.taskId)}</span>
                <code>{latestRun.runId}</code>
              </button>
            )}
            <button
              type="button"
              className="task-action-menu-button"
              onClick={() => {
                if (detailMode === "run-history") {
                  setExpandedTaskBranches((current) => current.map((item) => (
                    item.nodeId === branch.nodeId
                      ? { ...item, detailMode: null, runHistoryTaskId: undefined, observedRunId: undefined, selectedFileKeys: [] }
                      : item
                  )));
                  closeTaskRunHistory(task.taskId);
                } else {
                  openTaskRunHistory(task.taskId, branch.nodeId);
                }
              }}
            >
              运行记录
            </button>
            <button
              type="button"
              className="task-action-menu-button"
              onClick={() => {
                if (detailMode === "clone") {
                  clearTaskCloneState(task.taskId);
                  setExpandedTaskBranches((current) =>
                    current.map((item) =>
                      item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                    )
                  );
                } else {
                  openTaskCloneDraft(task);
                  setTaskArchiveConfirmNodeId(null);
                  setExpandedTaskBranches((current) =>
                    current.map((item) =>
                      item.nodeId === branch.nodeId
                        ? { ...item, detailMode: "clone" }
                        : item
                    )
                  );
                }
              }}
            >
              复制
            </button>
            {task.templateConfig && (
              <button
                type="button"
                className="task-action-menu-button"
                onClick={() => {
                  if (detailMode === "parameters") {
                    clearTaskParameterState(task.taskId);
                    setExpandedTaskBranches((current) =>
                      current.map((item) =>
                        item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                      )
                    );
                  } else {
                    openTaskParameterDraft(task);
                    setTaskArchiveConfirmNodeId(null);
                    setExpandedTaskBranches((current) =>
                      current.map((item) =>
                        item.nodeId === branch.nodeId
                          ? { ...item, detailMode: "parameters" }
                          : item
                      )
                    );
                  }
                }}
              >
                参数
              </button>
            )}
            <button
              type="button"
              className="task-action-menu-button"
              onClick={() => {
                if (detailMode === "edit") {
                  setExpandedTaskBranches((current) =>
                    current.map((item) =>
                      item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                    )
                  );
                } else {
                  openTaskEditDraft(task);
                  setTaskArchiveConfirmNodeId(null);
                  setExpandedTaskBranches((current) =>
                    current.map((item) =>
                      item.nodeId === branch.nodeId
                        ? { ...item, detailMode: "edit" }
                        : item
                    )
                  );
                }
              }}
            >
              {"\u7f16\u8f91"}
            </button>
            <button
              type="button"
              className="task-action-menu-button"
              onClick={() => {
                if (detailMode === "leader-chat") {
                  setExpandedTaskBranches((current) =>
                    current.map((item) =>
                      item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                    )
                  );
                } else {
                  setTaskArchiveConfirmNodeId(null);
                  setExpandedTaskBranches((current) =>
                    current.map((item) =>
                      item.nodeId === branch.nodeId
                        ? { ...item, detailMode: "leader-chat" }
                        : item
                    )
                  );
                  clearTaskLeaderCopy(task.taskId);
                }
              }}
            >
              {"\u5bf9\u8bdd Leader"}
            </button>
            {task.canvasKind === "discovery" && !task.generatedSource && (
              <button
                type="button"
                className="task-action-menu-button"
                onClick={() => {
                  if (branch.discoveryGeneratedEditTaskId) {
                    clearTaskEditState(branch.discoveryGeneratedEditTaskId);
                  }
                  const nextDetailMode = detailMode === "discovery-subcanvas" ? null : "discovery-subcanvas";
                  if (detailMode === "discovery-subcanvas") {
                    clearGeneratedArchiveUiForTasks(
                      (generatedTasksByDiscoveryTaskId[task.taskId] ?? []).map((generatedTask) => generatedTask.taskId),
                    );
                  }
                  setTaskArchiveConfirmNodeId(null);
                  setExpandedTaskBranches((current) =>
                    current.map((item) =>
                      item.nodeId === branch.nodeId
                        ? {
                            ...item,
                            detailMode: nextDetailMode,
                            observedRunId: undefined,
                            selectedFileKeys: [],
                            discoveryGeneratedObserver: undefined,
                            discoveryGeneratedEditTaskId: undefined,
                            discoveryGeneratedRunHistoryTaskId: undefined,
                            discoveryQueueExpanded: false,
                            discoveryStaleExpanded: false,
                          }
                        : item
                    )
                  );
                }}
              >
                Discovery 子画布
              </button>
            )}
            {taskDeleteConfirming ? (
              <div className="task-delete-confirm" role="group" aria-label={`${task.title} \u5220\u9664\u786e\u8ba4`}>
                <p>{"\u5220\u9664\u4f1a\u8c03\u7528 archive \u8f6f\u5f52\u6863\uff0c\u4e0d\u4f1a\u542f\u52a8 Task run\uff0c\u4e5f\u4e0d\u4f1a\u628a Task \u5b9a\u4e49\u5199\u5165 localStorage\u3002"}</p>
                <div className="task-delete-actions">
                  <button
                    type="button"
                    className="task-action-menu-button"
                    disabled={anyTaskArchiveSaving}
                    onClick={() => setTaskArchiveConfirmNodeId(null)}
                  >
                    {"\u53d6\u6d88"}
                  </button>
                  <button
                    type="button"
                    className="task-action-menu-button danger"
                    disabled={anyTaskArchiveSaving}
                    onClick={() => {
                      void archiveTask(task, branch.nodeId);
                    }}
                  >
                    {taskDeleteSaving ? "\u5220\u9664\u4e2d..." : "\u786e\u8ba4\u5220\u9664"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="task-action-menu-button danger"
                disabled={anyTaskArchiveSaving}
                onClick={() => {
                  setTaskArchiveConfirmNodeId(branch.nodeId);
                }}
              >
                {"\u5220\u9664"}
              </button>
            )}
          </div>
        </section>
      ),
    }];
  });
  const taskChildBranchPanels = useMemo(() => {
    const panels: Array<{
      id: string;
      panel: ReactNode;
      width?: number;
      height?: number;
      sourceId?: string;
      autoHeight?: boolean;
      resizable?: boolean;
      maximizable?: boolean;
      maximizedPanel?: ReactNode;
      interactive?: boolean;
      minWidth?: number;
      minHeight?: number;
    }> = [];

    for (const branch of expandedTaskBranches) {
      const node = taskNodes.find((candidate) => candidate.nodeId === branch.nodeId) ?? null;
      const task = node ? tasksById.get(node.taskId) ?? null : null;
      if (!node || !task) continue;
      const menuPanelId = taskMenuPanelId(branch.nodeId);

      const discoveryRunHistoryTaskId = branch.detailMode === "discovery-subcanvas"
        ? branch.discoveryGeneratedRunHistoryTaskId
        : undefined;
      const isRunHistoryPanelOpen = branch.detailMode === "run-history" || Boolean(discoveryRunHistoryTaskId);
      const runHistoryPanelId = taskRunHistoryPanelId(branch.nodeId, Boolean(discoveryRunHistoryTaskId));

      if (isRunHistoryPanelOpen) {
        const historyTaskId = discoveryRunHistoryTaskId ?? branch.runHistoryTaskId ?? task.taskId;
        const historyTask = historyTaskId
          ? tasksById.get(historyTaskId) ?? generatedTasksById.get(historyTaskId) ?? task
          : task;
        const historyState = historyTaskId
          ? runHistoryByTaskId[historyTaskId] ?? emptyRunHistoryPanelState
          : emptyRunHistoryPanelState;
        panels.push({
          id: runHistoryPanelId,
          width: 620,
          autoHeight: true,
          sourceId: discoveryRunHistoryTaskId ? `discovery-subcanvas-${branch.nodeId}` : menuPanelId,
          panel: (
            <section className="emap-run-history-panel" aria-label={`${historyTask.title} 运行记录`}>
              <header className="emap-run-history-head">
                <div className="emap-run-history-title">
                  <span>运行记录</span>
                  <strong>{historyTask.title}</strong>
                  <code>{historyTask.taskId}</code>
                </div>
                <button
                  type="button"
                  className="emap-run-history-close"
                  onClick={() => {
                    setExpandedTaskBranches((current) => current.map((item) => (
                      item.nodeId === branch.nodeId
                        ? discoveryRunHistoryTaskId
                          ? {
                              ...item,
                              discoveryGeneratedRunHistoryTaskId: undefined,
                              observedRunId: undefined,
                              selectedFileKeys: [],
                            }
                          : { ...item, detailMode: null, runHistoryTaskId: undefined, observedRunId: undefined, selectedFileKeys: [] }
                        : item
                    )));
                    closeTaskRunHistory(historyTaskId);
                  }}
                  aria-label={`收起 ${historyTask.title} 运行记录`}
                >
                  收起
                </button>
              </header>
              <div className="emap-run-history-toolbar">
                <label className="emap-run-history-archive-toggle">
                  <input
                    type="checkbox"
                    checked={runHistoryIncludeArchived}
                    onChange={(event) => setRunHistoryIncludeArchived(event.currentTarget.checked)}
                  />
                  显示已归档
                </label>
                <span className="emap-run-history-count">{historyState.items.length} / {historyState.total}</span>
              </div>
              {historyState.error && (
                <div className="emap-run-history-error" role="status">{historyState.error}</div>
              )}
              <div className="emap-run-history-list" aria-label={`${historyTask.title} run history list`}>
                {historyState.items.map((item) => {
                  const run = item.run;
                  const selected = branch.observedRunId === run.runId;
                  const saving = historyState.savingRunId === run.runId;
                  const loadedRunId = loadedTaskRunByTaskId[item.annotation.taskId];
                  const loaded = loadedRunId === run.runId;
                  const loadedSuppressedByActiveRun = loaded && (taskRunsByTaskId[item.annotation.taskId] ?? []).some((candidate) => isActiveRun(candidate.status));
                  const loadedState = loaded ? loadedSuppressedByActiveRun ? "suppressed" : "loaded" : "none";
                  const toggleRunHistoryObserver = () => {
                    setExpandedTaskBranches((current) => current.map((item) => (
                      item.nodeId === branch.nodeId
                        ? { ...item, observedRunId: selected ? undefined : run.runId, selectedFileKeys: [] }
                        : item
                    )));
                  };
                  return (
                    <article
                      key={run.runId}
                      className={`emap-run-history-item status-${run.status} ${selected ? "selected" : ""} ${item.annotation.best ? "best" : ""} ${item.annotation.archived ? "archived" : ""} ${loaded ? "loaded" : ""}`}
                      data-run-id={run.runId}
                      data-run-status={run.status}
                      data-loaded-run={loaded ? "true" : "false"}
                      data-loaded-run-state={loadedState}
                      data-run-best={item.annotation.best ? "true" : "false"}
                      data-run-archived={item.annotation.archived ? "true" : "false"}
                      data-run-observer-card-action="toggle"
                      onClick={toggleRunHistoryObserver}
                    >
                      <button
                        type="button"
                        className="emap-run-history-row"
                        aria-label={selected ? "收起运行过程" : "查看运行过程"}
                        aria-current={selected ? "true" : undefined}
                        aria-pressed={selected}
                        data-run-observer-action="toggle"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleRunHistoryObserver();
                        }}
                      >
                        <span className="emap-run-history-started">
                          <small>开始时间</small>
                          <time dateTime={run.startedAt ?? run.createdAt}>
                            {formatRunTimestamp(run.startedAt ?? run.createdAt)}
                          </time>
                        </span>
                        <span className="emap-run-history-status">
                          <small>状态</small>
                          <strong>{RUN_STATUS_LABELS[run.status]}</strong>
                        </span>
                        <span className="emap-run-history-duration">
                          <small>执行时间</small>
                          <strong>{taskRunElapsed(run)}</strong>
                        </span>
                      </button>
                      <div className="emap-run-history-actions">
                        {loaded ? (
                          <button
                            type="button"
                            data-run-load-action="unload"
                            onClick={(event) => {
                              event.stopPropagation();
                              unloadRunHistoryItem(item);
                            }}
                          >
                            取消装载
                          </button>
                        ) : (
                          <button
                            type="button"
                            data-run-load-action="load"
                          disabled={isActiveRun(run.status)}
                          onClick={(event) => {
                            event.stopPropagation();
                            loadRunHistoryItem(item);
                          }}
                        >
                          装载记录
                        </button>
                        )}
                        <button
                          type="button"
                          disabled={saving}
                          onClick={(event) => {
                            event.stopPropagation();
                            void patchRunHistoryAnnotation(item, { best: !item.annotation.best });
                          }}
                        >
                          {item.annotation.best ? "取消最佳" : "标为最佳"}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={(event) => {
                            event.stopPropagation();
                            void patchRunHistoryAnnotation(item, { archived: !item.annotation.archived });
                          }}
                        >
                          {item.annotation.archived ? "恢复记录" : "归档记录"}
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!historyState.loading && historyState.items.length === 0 && (
                  <div className="emap-run-history-empty">暂无可见运行记录。</div>
                )}
                {historyState.loading && (
                  <div className="emap-run-history-empty" role="status">正在加载运行记录...</div>
                )}
                {historyState.items.length < historyState.total && (
                  <button
                    type="button"
                    className="emap-run-history-load-more"
                    disabled={historyState.loading}
                    onClick={() => { if (historyTaskId) void loadMoreRunHistory(historyTaskId); }}
                  >
                    加载更多
                  </button>
                )}
              </div>
            </section>
          ),
        });
      }

      if (branch.detailMode === "discovery-subcanvas" && task.canvasKind === "discovery" && !task.generatedSource) {
        const activeDiscoveryRun = selectActiveDiscoveryRootRun(task.taskId, taskRunsByTaskId);
        const latestDiscoveryRun = selectLatestRun(taskRunsByTaskId[task.taskId] ?? []);
        const discoveryStage = discoveryStageMeta(discoverySummariesByTaskId[task.taskId], latestDiscoveryRun);
        const generatedTasks = sortDiscoveryGeneratedTasksForSubcanvas(
          (generatedTasksByDiscoveryTaskId[task.taskId] ?? []).filter((generatedTask) => !generatedTask.archived),
          taskRunsByTaskId,
          task.taskId,
          activeDiscoveryRun,
        );
        const dispatchDiagnostics = discoveryDispatchDiagnosticsByTaskId[task.taskId] ?? [];
        const discoveryConcurrency = Math.max(1, task.discoverySpec?.autoRun?.concurrency ?? 3);
        const discoverySubcanvasStyle = {
          "--discovery-queue-columns": String(discoveryConcurrency * 2),
        } as CSSProperties;
        const selectedDiscoveryChannelTaskIds = selectedDiscoveryChannelTaskIdsByTaskId[task.taskId] ?? [];
        const selectedDiscoveryChannelTaskIdSet = new Set(selectedDiscoveryChannelTaskIds);
        const channelSetLookup = buildDiscoveryChannelSetLookup({
          task,
          activeDiscoveryRun,
          selectedChannelSetId: selectedDiscoveryChannelSetIdByTaskId[task.taskId] ?? null,
          channelSets: discoveryChannelSetsByTaskId[task.taskId] ?? [],
          channelSetTitle: discoveryChannelSetTitleByTaskId[task.taskId] ?? "",
          channelSetLoading: Boolean(discoveryChannelSetLoadingByTaskId[task.taskId]),
          channelSetSaving: Boolean(discoveryChannelSetSavingByTaskId[task.taskId]),
          runPolicySaving: Boolean(discoveryRunPolicySavingByTaskId[task.taskId]),
        });
        const discoveryChannelSets = discoveryChannelSetsByTaskId[task.taskId] ?? [];
        const selectedDiscoveryChannelSetId = channelSetLookup.selectedChannelSetId;
        const selectedDiscoveryChannelSet = channelSetLookup.selectedChannelSet;
        const activeDiscoveryChannelSet = channelSetLookup.activeChannelSet;
        const defaultDiscoveryChannelSetId = channelSetLookup.defaultChannelSetId;
        const defaultDiscoveryChannelSet = channelSetLookup.defaultChannelSet;
        const discoveryRunPolicySaving = channelSetLookup.runPolicySaving;
        const activeDiscoveryChannelTaskIdSet = channelSetLookup.activeChannelTaskIdSet;
        const activeDiscoveryRunUsesChannelSet = channelSetLookup.activeRunUsesChannelSet;
        const generatedTaskCards = generatedTasks.map((generatedTask, generatedTaskIndex) => {
          const generatedSource = generatedTask.generatedSource;
          const itemStatus = generatedSource?.itemStatus ?? "active";
          const workUnitMode = generatedSource?.workUnitMode ?? "managed";
          const generatedRuns = visibleDiscoveryGeneratedRuns(generatedTask, task.taskId, activeDiscoveryRun, taskRunsByTaskId);
          const latestGeneratedRun = selectLatestRun(generatedRuns);
          const activeGeneratedRun = generatedRuns.find((taskRun) => isActiveRun(taskRun.status)) ?? null;
          const runSaving = Boolean(taskRunSavingByTaskId[generatedTask.taskId]);
          const resetSaving = Boolean(generatedResetSavingByTaskId[generatedTask.taskId]);
          const archiveSaving = Boolean(generatedArchiveSavingByTaskId[generatedTask.taskId]);
          const latestRunStatus = latestGeneratedRun?.status ?? "none";
          const generatedIsEditing = branch.discoveryGeneratedEditTaskId === generatedTask.taskId;
          const archiveConfirmOpen = generatedArchiveConfirmTaskId === generatedTask.taskId;
          const summaryResetAvailable = (generatedSource as { canResetToManaged?: boolean } | undefined)?.canResetToManaged === true;
          const canResetToManaged = workUnitMode === "customized"
            && (Boolean(generatedSource?.latestManagedWorkUnit) || summaryResetAvailable);
          const waitingForCurrentDiscoveryRun = Boolean(activeDiscoveryRun) && (
            activeDiscoveryRunUsesChannelSet
              ? Boolean(activeDiscoveryChannelSet)
                && activeDiscoveryChannelTaskIdSet.has(generatedTask.taskId)
                && !latestGeneratedRun
              : generatedSource?.latestDiscoveryRunId !== activeDiscoveryRun?.runId
          );
          const visualState = discoveryGeneratedVisualState(itemStatus, latestGeneratedRun, activeGeneratedRun, waitingForCurrentDiscoveryRun);
          const generatedOrdinal = String(generatedTaskIndex + 1).padStart(2, "0");
          const generatedRunIsObserved = Boolean(
            latestGeneratedRun
              && branch.discoveryGeneratedObserver?.taskId === generatedTask.taskId
              && branch.discoveryGeneratedObserver?.runId === latestGeneratedRun.runId,
          );
          const generatedRunButtonLabel = runSaving
            ? "启动中..."
            : activeGeneratedRun
              ? "运行中"
              : latestGeneratedRun
                ? "重新运行"
                : "运行";
          return {
            activeGeneratedRun,
            archiveConfirmOpen,
            archiveSaving,
            canResetToManaged,
            generatedIsEditing,
            generatedOrdinal,
            generatedRunButtonLabel,
            generatedRunIsObserved,
            generatedTask,
            itemStatus,
            latestGeneratedRun,
            latestRunStatus,
            resetSaving,
            runSaving,
            visualState,
            waitingForCurrentDiscoveryRun,
            workUnitMode,
          };
        });
        const forceVisibleQueuedTaskIds = new Set([
          branch.discoveryGeneratedObserver?.taskId,
          branch.discoveryGeneratedEditTaskId,
          generatedArchiveConfirmTaskId,
        ].filter((taskId): taskId is string => typeof taskId === "string" && taskId.length > 0));
        const activeGeneratedTaskCards = generatedTaskCards.filter((card) => card.itemStatus !== "stale");
        const staleGeneratedTaskCards = generatedTaskCards.filter((card) => card.itemStatus === "stale");
        const activeGeneratedTaskIds = activeGeneratedTaskCards.map((card) => card.generatedTask.taskId);
        const selectionSummary = buildDiscoveryChannelSetSelectionSummary(activeGeneratedTaskIds, selectedDiscoveryChannelTaskIdSet);
        const selectedActiveGeneratedTaskCount = selectionSummary.selectedActiveGeneratedTaskCount;
        const allActiveGeneratedTasksSelected = selectionSummary.allActiveGeneratedTasksSelected;
        const forceVisibleStaleTaskCards = staleGeneratedTaskCards.filter((card) => forceVisibleQueuedTaskIds.has(card.generatedTask.taskId));
        const staleGeneratedTaskCardsVisible = branch.discoveryStaleExpanded || forceVisibleStaleTaskCards.length > 0;
        const generatedPreviewCards = branch.discoveryQueueExpanded
          ? activeGeneratedTaskCards
          : activeGeneratedTaskCards.filter((card, index) => (
              index < DISCOVERY_QUEUE_INITIAL_CARD_LIMIT || forceVisibleQueuedTaskIds.has(card.generatedTask.taskId)
            ));
        const stalePreviewCards = staleGeneratedTaskCardsVisible ? staleGeneratedTaskCards : [];
        const hiddenGeneratedTaskCount = activeGeneratedTaskCards.length - generatedPreviewCards.length;
        const runningGeneratedTaskCount = activeGeneratedTaskCards.filter((card) => card.visualState === "running").length;
        const doneGeneratedTaskCount = activeGeneratedTaskCards.filter((card) => card.visualState === "done").length;
        const failedGeneratedTaskCount = activeGeneratedTaskCards.filter((card) => card.visualState === "failed").length;
        const waitingGeneratedTaskCount = activeGeneratedTaskCards.filter((card) => card.visualState === "queued").length;
        const discoveryChannelSetTitle = channelSetLookup.title;
        const discoveryChannelSetsLoading = channelSetLookup.loading;
        const discoveryChannelSetSaving = channelSetLookup.saving;
        const renderGeneratedCard = (card: (typeof generatedTaskCards)[number]) => {
          const {
            activeGeneratedRun,
            archiveConfirmOpen,
            archiveSaving,
            canResetToManaged,
            generatedIsEditing,
            generatedOrdinal,
            generatedRunButtonLabel,
            generatedRunIsObserved,
            generatedTask,
            itemStatus,
            latestGeneratedRun,
            latestRunStatus,
            resetSaving,
            runSaving,
            visualState,
            waitingForCurrentDiscoveryRun,
            workUnitMode,
          } = card;
          const generatedActionMenuOpen = generatedActionMenuTaskId === generatedTask.taskId;
          const generatedRunHistoryOpen = branch.discoveryGeneratedRunHistoryTaskId === generatedTask.taskId;
          const generatedChannelSelected = selectedDiscoveryChannelTaskIdSet.has(generatedTask.taskId);
          const generatedActionMenuId = `generated-action-menu-${branch.nodeId}-${generatedTask.taskId}`;
          const toggleGeneratedRunHistory = () => {
            setGeneratedActionMenuTaskId(null);
            if (generatedRunHistoryOpen) {
              setExpandedTaskBranches((current) => current.map((item) =>
                item.nodeId === branch.nodeId
                  ? {
                      ...item,
                      discoveryGeneratedRunHistoryTaskId: undefined,
                      observedRunId: undefined,
                      selectedFileKeys: [],
                    }
                  : item
              ));
              closeTaskRunHistory(generatedTask.taskId);
              return;
            }
            openTaskRunHistory(generatedTask.taskId, branch.nodeId, latestGeneratedRun ? [latestGeneratedRun] : [], {
              keepDiscoverySubcanvas: true,
            });
          };
          return (
            <article
              key={generatedTask.taskId}
              className={`discovery-generated-card state-${visualState} is-${itemStatus} ${generatedRunIsObserved ? "is-observed" : ""} ${generatedIsEditing ? "is-editing" : ""} ${generatedActionMenuOpen ? "is-action-menu-open" : ""} ${generatedRunHistoryOpen ? "is-history-open" : ""} ${generatedChannelSelected ? "is-channel-selected" : ""}`}
              data-generated-task-id={generatedTask.taskId}
              data-generated-item-status={itemStatus}
              data-generated-workunit-mode={workUnitMode}
              data-generated-run-status={latestRunStatus}
              data-generated-visual-state={visualState}
              data-generated-ordinal={generatedOrdinal}
              data-generated-run-scope={waitingForCurrentDiscoveryRun ? "pending-current-discovery" : "current"}
              data-generated-editing={generatedIsEditing ? "true" : "false"}
              data-generated-reset-saving={resetSaving ? "true" : "false"}
              data-generated-archive-saving={archiveSaving ? "true" : "false"}
              data-generated-run-history-open={generatedRunHistoryOpen ? "true" : "false"}
              data-generated-channel-selected={generatedChannelSelected ? "true" : "false"}
              onClick={(event) => {
                const target = event.target;
                if (target instanceof HTMLElement && target.closest(".discovery-generated-channel-checkbox")) return;
                toggleGeneratedRunHistory();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setGeneratedActionMenuTaskId((current) => current === generatedTask.taskId ? null : current);
                }
                if ((event.key === "Enter" || event.key === " ") && event.currentTarget === event.target) {
                  event.preventDefault();
                  toggleGeneratedRunHistory();
                }
              }}
            >
              <span className="discovery-generated-card-watermark" aria-hidden="true">{generatedOrdinal}</span>
              <button
                type="button"
                role="checkbox"
                className="discovery-generated-channel-checkbox"
                aria-label={`选择 ${generatedTask.title} 作为 Discovery 渠道`}
                aria-checked={generatedChannelSelected}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleDiscoveryChannelTaskSelection(task.taskId, generatedTask.taskId);
                }}
              >
                <span aria-hidden="true" />
              </button>
              <div className="discovery-generated-card-head">
                <strong>{generatedTask.title}</strong>
              </div>
              <button
                type="button"
                className="discovery-generated-menu-trigger"
                data-generated-action="menu"
                aria-label={`${generatedTask.title} 操作菜单`}
                aria-expanded={generatedActionMenuOpen}
                aria-controls={generatedActionMenuId}
                onClick={(event) => {
                  event.stopPropagation();
                  setGeneratedActionMenuTaskId((current) =>
                    current === generatedTask.taskId ? null : generatedTask.taskId
                  );
                }}
              >
                <span aria-hidden="true">⋮</span>
              </button>
              <div
                id={generatedActionMenuId}
                className="discovery-generated-card-actions"
                role="menu"
                aria-label={`${generatedTask.title} 操作`}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className={`discovery-generated-action ${generatedIsEditing ? "selected" : ""}`}
                  data-generated-action="edit"
                  role="menuitem"
                  aria-label={`${generatedTask.title} ${generatedIsEditing ? "收起 generated Task 浅编辑" : "打开 generated Task 浅编辑"}`}
                  onClick={() => {
                    setGeneratedActionMenuTaskId(null);
                    if (generatedIsEditing) {
                      clearTaskEditState(generatedTask.taskId);
                    } else {
                      generatedEditDetailHandledTaskIdsRef.current.add(generatedTask.taskId);
                      if ((generatedTask as TeamCanvasTask).workUnit) {
                        openTaskEditDraft(generatedTask as TeamCanvasTask);
                      } else {
                        void ensureGeneratedTaskDetail(generatedTask.taskId).then((fullTask) => {
                          if (fullTask) {
                            openTaskEditDraft(fullTask);
                          } else {
                            clearGeneratedEditDetailFailure(branch.nodeId, generatedTask.taskId);
                          }
                        });
                      }
                    }
                    setExpandedTaskBranches((current) => current.map((item) =>
                      item.nodeId === branch.nodeId
                        ? {
                            ...item,
                            detailMode: "discovery-subcanvas",
                            discoveryGeneratedEditTaskId: generatedIsEditing ? undefined : generatedTask.taskId,
                          }
                        : item
                    ));
                  }}
                >
                  {generatedIsEditing ? "收起编辑" : "编辑"}
                </button>
                {canResetToManaged && (
                  <button
                    type="button"
                    className="discovery-generated-action reset"
                    data-generated-action="reset-workunit"
                    role="menuitem"
                    disabled={resetSaving}
                    title="恢复为 Discovery 派发器最新 managed WorkUnit"
                    onClick={() => {
                      setGeneratedActionMenuTaskId(null);
                      void resetGeneratedTaskWorkUnit(generatedTask);
                    }}
                  >
                    {resetSaving ? "恢复中..." : "恢复 managed"}
                  </button>
                )}
                <button
                  type="button"
                  className="discovery-generated-action danger"
                  data-generated-action="archive"
                  role="menuitem"
                  disabled={archiveSaving}
                  title="通过现有 Canvas Task 归档接口软归档这个 generated Task"
                  onClick={() => {
                    setGeneratedActionMenuTaskId(null);
                    setGeneratedArchiveConfirmTaskId(generatedTask.taskId);
                  }}
                >
                  {archiveSaving ? "归档中..." : "归档"}
                </button>
                <button
                  type="button"
                  className="discovery-generated-action"
                  data-generated-action="run"
                  role="menuitem"
                  disabled={runSaving || Boolean(activeGeneratedRun) || generatedTask.status !== "ready"}
                  title={generatedTask.status === "ready" ? "启动这个 generated Task 的 WorkUnit run" : "只有 ready generated Task 可以运行"}
                  onClick={() => {
                    setGeneratedActionMenuTaskId(null);
                    void runTask(generatedTask);
                  }}
                >
                  {generatedRunButtonLabel}
                </button>
                {activeGeneratedRun && (
                  <button
                    type="button"
                    className="discovery-generated-action"
                    data-generated-action="cancel"
                    role="menuitem"
                    disabled={runSaving}
                    onClick={() => {
                      setGeneratedActionMenuTaskId(null);
                      void cancelTaskRun(generatedTask, activeGeneratedRun);
                    }}
                  >
                    停止
                  </button>
                )}
                {latestGeneratedRun && (
                  <button
                    type="button"
                    className={`discovery-generated-action summary ${generatedRunIsObserved ? "selected" : ""}`}
                    data-generated-action="observe-run"
                    role="menuitem"
                    aria-label={`${generatedTask.title} ${generatedRunIsObserved ? "收起 generated run observer" : "打开 generated run observer"}`}
                    onClick={() => {
                      setGeneratedActionMenuTaskId(null);
                      setExpandedTaskBranches((current) => current.map((item) => {
                        if (item.nodeId !== branch.nodeId) return item;
                        const isSameObserver = item.discoveryGeneratedObserver?.taskId === generatedTask.taskId
                          && item.discoveryGeneratedObserver?.runId === latestGeneratedRun.runId;
                        return {
                          ...item,
                          detailMode: "discovery-subcanvas",
                          observedRunId: undefined,
                          selectedFileKeys: [],
                          discoveryGeneratedObserver: isSameObserver
                            ? undefined
                            : {
                                taskId: generatedTask.taskId,
                                runId: latestGeneratedRun.runId,
                                selectedFileKeys: [],
                              },
                        };
                      }));
                    }}
                  >
                    {generatedRunIsObserved ? "收起输出" : "查看输出"}
                  </button>
                )}
              </div>
              {archiveConfirmOpen && (
                <div
                  className="discovery-generated-archive-confirm"
                  data-generated-archive-confirm-for={generatedTask.taskId}
                  onClick={(event) => event.stopPropagation()}
                >
                  <span>确认软归档这个 generated Task？</span>
                  <div className="discovery-generated-archive-confirm-actions">
                    <button
                      type="button"
                      className="discovery-generated-action danger"
                      data-generated-action="archive-confirm"
                      disabled={archiveSaving}
                      onClick={() => {
                        void archiveGeneratedTask(generatedTask);
                      }}
                    >
                      确认归档
                    </button>
                    <button
                      type="button"
                      className="discovery-generated-action"
                      data-generated-action="archive-cancel"
                      disabled={archiveSaving}
                      onClick={() => setGeneratedArchiveConfirmTaskId(null)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        };
        panels.push({
          id: `discovery-subcanvas-${branch.nodeId}`,
          width: 620,
          autoHeight: true,
          sourceId: menuPanelId,
          panel: (
            <section
              className="task-leader-branch emap-panel-branch discovery-subcanvas-panel"
              data-discovery-subcanvas-for={task.taskId}
              aria-label={`${task.title} Discovery 子画布`}
              style={discoverySubcanvasStyle}
            >
              <header className="task-leader-branch-head">
                <div className="task-leader-branch-title">
                  <span>Discovery 子画布</span>
                  <strong>{task.title}</strong>
                  <code>{task.taskId}</code>
                </div>
                <button
                  type="button"
                  className="task-leader-branch-collapse"
                  onClick={() => {
                    if (branch.discoveryGeneratedEditTaskId) {
                      clearTaskEditState(branch.discoveryGeneratedEditTaskId);
                    }
                    clearGeneratedArchiveUiForTasks(generatedTasks.map((generatedTask) => generatedTask.taskId));
                    setExpandedTaskBranches((current) =>
                      current.map((item) =>
                        item.nodeId === branch.nodeId
                          ? {
                              ...item,
                              detailMode: null,
                            discoveryGeneratedObserver: undefined,
                            discoveryGeneratedEditTaskId: undefined,
                            discoveryGeneratedRunHistoryTaskId: undefined,
                            discoveryQueueExpanded: false,
                            discoveryStaleExpanded: false,
                          }
                        : item
                      )
                    );
                  }}
                  aria-label={`收起 ${task.title} Discovery 子画布`}
                >
                  收起
                </button>
              </header>
              <div
                className={`discovery-stage-strip stage-${discoveryStage.stage}`}
                data-discovery-stage-for={task.taskId}
                data-discovery-stage={discoveryStage.stage}
                aria-label={`${task.title} Discovery stage ${discoveryStage.label}`}
              >
                <strong>{discoveryStage.label}</strong>
                {discoveryStage.processed > 0 && <span>{discoveryStage.processed} processed</span>}
                {discoveryStage.running > 0 && <span>{discoveryStage.running} running</span>}
                {discoveryStage.completed > 0 && <span>{discoveryStage.completed} completed</span>}
                {discoveryStage.generated > 0 && <span>{discoveryStage.generated} generated</span>}
                {discoveryStage.blocked > 0 && <span className="danger">{discoveryStage.blocked} blocked</span>}
              </div>
              <section
                className="discovery-channel-set-panel"
                data-discovery-channel-sets-for={task.taskId}
                aria-label={`${task.title} Discovery 渠道集`}
              >
                <div className="discovery-channel-set-head">
                  <span>渠道集</span>
                  <strong>{selectedDiscoveryChannelTaskIds.length} selected</strong>
                </div>
                <div
                  className="discovery-run-policy-row"
                  data-discovery-run-policy={defaultDiscoveryChannelSetId ? "channel_set" : "rediscover"}
                >
                  <span>
                    默认运行：
                    <strong>{defaultDiscoveryChannelSet?.title ?? (defaultDiscoveryChannelSetId ? "渠道集缺失" : "正常重新发现")}</strong>
                  </span>
                  {defaultDiscoveryChannelSetId ? (
                    <button
                      type="button"
                      className="discovery-channel-set-action"
                      disabled={discoveryRunPolicySaving}
                      onClick={() => {
                        void updateDiscoveryRunPolicy(task, null);
                      }}
                    >
                      {discoveryRunPolicySaving ? "保存中..." : "恢复正常运行"}
                    </button>
                  ) : null}
                </div>
                <div className="discovery-channel-set-composer">
                  <label className="discovery-channel-set-title-field">
                    <span>名称</span>
                    <input
                      aria-label={`${task.title} 渠道集名称`}
                      value={discoveryChannelSetTitle}
                      placeholder={`${task.title} 渠道集`}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setDiscoveryChannelSetTitleByTaskId((current) => ({
                          ...current,
                          [task.taskId]: value,
                        }));
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="discovery-channel-set-action primary"
                    disabled={selectedDiscoveryChannelTaskIds.length === 0 || discoveryChannelSetSaving}
                    onClick={() => {
                      void saveDiscoveryChannelSet(task);
                    }}
                  >
                    {discoveryChannelSetSaving
                      ? (selectedDiscoveryChannelSet ? "更新中..." : "保存中...")
                      : (selectedDiscoveryChannelSet ? "更新渠道集" : "保存渠道集")}
                  </button>
                  {selectedDiscoveryChannelSet ? (
                    <button
                      type="button"
                      className="discovery-channel-set-action"
                      disabled={selectedDiscoveryChannelTaskIds.length === 0 || discoveryChannelSetSaving}
                      onClick={() => {
                        void saveDiscoveryChannelSet(task, { forceCreate: true });
                      }}
                    >
                      {discoveryChannelSetSaving ? "保存中..." : "另存为新集合"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="discovery-channel-set-action"
                    disabled={selectedDiscoveryChannelTaskIds.length === 0 || discoveryChannelSetSaving}
                    onClick={() => clearDiscoveryChannelTaskSelection(task.taskId)}
                  >
                    清空选择
                  </button>
                </div>
                {discoveryChannelSetsLoading ? (
                  <div className="discovery-channel-set-empty">正在加载渠道集...</div>
                ) : discoveryChannelSets.length > 0 ? (
                  <div className="discovery-channel-set-list" aria-label={`${task.title} 已保存渠道集`}>
                    {discoveryChannelSets.map((channelSet) => {
                      const archiving = Boolean(discoveryChannelSetArchivingById[channelSet.channelSetId]);
                      const runningFromSet = Boolean(taskRunSavingByTaskId[task.taskId]);
                      const channelSetSelected = selectedDiscoveryChannelSetId === channelSet.channelSetId;
                      const defaultForRun = defaultDiscoveryChannelSetId === channelSet.channelSetId;
                      return (
                        <div
                          key={channelSet.channelSetId}
                          className={`discovery-channel-set-row ${channelSetSelected ? "is-selected" : ""} ${defaultForRun ? "is-default-run" : ""}`}
                          data-discovery-channel-set-id={channelSet.channelSetId}
                          data-discovery-channel-set-items={channelSet.items.length}
                          data-discovery-channel-set-selected={channelSetSelected ? "true" : "false"}
                          data-discovery-channel-set-default-run={defaultForRun ? "true" : "false"}
                        >
                          <button
                            type="button"
                            className="discovery-channel-set-row-main"
                            aria-label={`选中渠道集 ${channelSet.title}`}
                            aria-pressed={channelSetSelected}
                            onClick={() => selectDiscoveryChannelSet(task.taskId, channelSet)}
                          >
                            <strong>{channelSet.title}</strong>
                            <span>{channelSet.items.length} channels</span>
                          </button>
                          <div className="discovery-channel-set-row-actions">
                            <button
                              type="button"
                              className="discovery-channel-set-action"
                              aria-label={`${defaultForRun ? "默认运行渠道集" : "设为默认运行"} ${channelSet.title}`}
                              disabled={defaultForRun || discoveryRunPolicySaving || archiving || channelSet.items.length === 0}
                              onClick={() => {
                                void updateDiscoveryRunPolicy(task, channelSet.channelSetId);
                              }}
                            >
                              {defaultForRun ? "默认运行" : (discoveryRunPolicySaving ? "保存中..." : "设为默认")}
                            </button>
                            <button
                              type="button"
                              className="discovery-channel-set-action primary"
                              aria-label={`使用渠道集 ${channelSet.title}`}
                              disabled={runningFromSet || archiving || channelSet.items.length === 0}
                              onClick={() => {
                                void runTask(task, branch.nodeId, undefined, { discoveryChannelSetId: channelSet.channelSetId });
                              }}
                            >
                              使用渠道集
                            </button>
                            <button
                              type="button"
                              className="discovery-channel-set-action danger"
                              aria-label={`归档渠道集 ${channelSet.title}`}
                              disabled={archiving || runningFromSet}
                              onClick={() => {
                                void archiveDiscoveryChannelSet(task.taskId, channelSet.channelSetId);
                              }}
                            >
                              {archiving ? "归档中..." : "归档"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="discovery-channel-set-empty">暂无保存的渠道集。</div>
                )}
              </section>
              {dispatchDiagnostics.length > 0 && (
                <section
                  className="discovery-dispatch-diagnostics"
                  data-discovery-dispatch-diagnostics-for={task.taskId}
                  data-dispatch-blocked-count={dispatchDiagnostics.length}
                  aria-label={`${task.title} dispatch diagnostics`}
                >
                  <div className="discovery-dispatch-diagnostics-head">
                    <span>派发阻塞</span>
                    <strong>{dispatchDiagnostics.length} blocked</strong>
                  </div>
                  <div className="discovery-dispatch-diagnostic-list">
                    {dispatchDiagnostics.map((diagnostic) => (
                      <article
                        key={`${diagnostic.attemptId}:${diagnostic.itemId}:${diagnostic.createdAt}`}
                        className="discovery-dispatch-diagnostic-item"
                        data-dispatch-item-id={diagnostic.itemId}
                      >
                        <code>{diagnostic.itemId}</code>
                        <span>{diagnostic.error ?? "Dispatcher blocked without error message."}</span>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              <div className="discovery-subcanvas-list" aria-label={`${task.title} generated Task catalog`}>
                {generatedTasks.length === 0 ? (
                  <div className="discovery-subcanvas-empty">暂无 generated Tasks。</div>
                ) : (
                  <section
                    className="discovery-subcanvas-lane discovery-subcanvas-lane-queue"
                    aria-label={`${task.title} generated Task 网格`}
                  >
                    <div className="discovery-subcanvas-lane-head">
                      <span>generated Task 网格</span>
                      <div className="discovery-subcanvas-lane-head-actions">
                        <strong>
                          {runningGeneratedTaskCount} running · {waitingGeneratedTaskCount} queued · {doneGeneratedTaskCount} done
                          {failedGeneratedTaskCount > 0 ? ` · ${failedGeneratedTaskCount} failed` : ""}
                          {staleGeneratedTaskCards.length > 0 ? ` · ${staleGeneratedTaskCards.length} stale hidden` : ""}
                        </strong>
                        {activeGeneratedTaskIds.length > 0 ? (
                          <span className="discovery-subcanvas-selection-count">
                            selected {selectedActiveGeneratedTaskCount}/{activeGeneratedTaskIds.length}
                          </span>
                        ) : null}
                        {activeGeneratedTaskIds.length > 0 ? (
                          <button
                            type="button"
                            className="discovery-subcanvas-select-all"
                            aria-label={`${allActiveGeneratedTasksSelected ? "取消全选" : "全选"} ${task.title} 有效 generated Task`}
                            aria-pressed={allActiveGeneratedTasksSelected}
                            data-generated-action={allActiveGeneratedTasksSelected ? "clear-active-selection" : "select-active-all"}
                            onClick={() => {
                              setAllActiveDiscoveryChannelTaskSelection(
                                task.taskId,
                                activeGeneratedTaskIds,
                                !allActiveGeneratedTasksSelected,
                              );
                            }}
                          >
                            {allActiveGeneratedTasksSelected ? "取消全选" : "全选有效项"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {activeGeneratedTaskCards.length === 0 ? (
                      <div className="discovery-subcanvas-empty compact">本轮没有 active generated Task。</div>
                    ) : (
                      <div
                        className="discovery-subcanvas-queue-grid"
                        data-generated-queue-visible-count={generatedPreviewCards.length}
                        data-generated-queue-total-count={activeGeneratedTaskCards.length}
                      >
                        {generatedPreviewCards.map(renderGeneratedCard)}
                      </div>
                    )}
                    {hiddenGeneratedTaskCount > 0 && (
                      <button
                        type="button"
                        className="discovery-subcanvas-show-all"
                        data-generated-action="show-all-queued"
                        onClick={() => {
                          setExpandedTaskBranches((current) => current.map((item) =>
                            item.nodeId === branch.nodeId
                              ? { ...item, discoveryQueueExpanded: true }
                              : item
                          ));
                        }}
                      >
                        显示全部 {activeGeneratedTaskCards.length} 个 generated Task
                      </button>
                    )}
                    {staleGeneratedTaskCards.length > 0 && !staleGeneratedTaskCardsVisible && (
                      <button
                        type="button"
                        className="discovery-subcanvas-show-all stale"
                        data-generated-action="show-stale-generated"
                        onClick={() => {
                          setExpandedTaskBranches((current) => current.map((item) =>
                            item.nodeId === branch.nodeId
                              ? { ...item, discoveryStaleExpanded: true }
                              : item
                          ));
                        }}
                      >
                        显示 {staleGeneratedTaskCards.length} 个旧项
                      </button>
                    )}
                    {stalePreviewCards.length > 0 && (
                      <section
                        className="discovery-subcanvas-lane discovery-subcanvas-lane-stale"
                        aria-label={`${task.title} stale generated Task 旧项`}
                      >
                        <div className="discovery-subcanvas-lane-head">
                          <span>旧项</span>
                          <strong>{staleGeneratedTaskCards.length} stale</strong>
                        </div>
                        <div
                          className="discovery-subcanvas-queue-grid stale"
                          data-generated-stale-visible-count={stalePreviewCards.length}
                          data-generated-stale-total-count={staleGeneratedTaskCards.length}
                        >
                          {stalePreviewCards.map(renderGeneratedCard)}
                        </div>
                      </section>
                    )}
                  </section>
                )}
              </div>
            </section>
          ),
        });
        const generatedEditTask = branch.discoveryGeneratedEditTaskId
          ? generatedTasks.find((generatedTask) => generatedTask.taskId === branch.discoveryGeneratedEditTaskId) ?? null
          : null;
        if (generatedEditTask) {
          const draft = taskEditDraftByTaskId[generatedEditTask.taskId];
          const warning = taskEditWarningByTaskId[generatedEditTask.taskId] ?? null;
          const saving = Boolean(taskEditSavingByTaskId[generatedEditTask.taskId]);
          if (draft) {
            panels.push({
              id: `generated-task-edit-${branch.nodeId}-${generatedEditTask.taskId}`,
              width: 500,
              height: 430,
              autoHeight: true,
              sourceId: `discovery-subcanvas-${branch.nodeId}`,
              resizable: true,
              interactive: true,
              panel: (
                <section
                  className="task-leader-branch emap-panel-branch task-edit-branch generated-task-edit-branch"
                  data-generated-edit-task-id={generatedEditTask.taskId}
                  aria-label={`${generatedEditTask.title} Generated Task 浅编辑`}
                >
                  <header className="task-leader-branch-head">
                    <div className="task-leader-branch-title">
                      <span>Generated Task 浅编辑</span>
                      <strong>{generatedEditTask.title}</strong>
                      <code>{generatedEditTask.taskId}</code>
                    </div>
                    <button
                      type="button"
                      className="task-leader-branch-collapse"
                      onClick={() => {
                        clearTaskEditState(generatedEditTask.taskId);
                        setExpandedTaskBranches((current) =>
                          current.map((item) =>
                            item.nodeId === branch.nodeId
                              ? { ...item, discoveryGeneratedEditTaskId: undefined }
                              : item
                          )
                        );
                      }}
                      aria-label={`收起 ${generatedEditTask.title} Generated Task 浅编辑`}
                    >
                      收起
                    </button>
                  </header>
                  <form
                    className="task-edit-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveTaskEdit(generatedEditTask.taskId);
                    }}
                  >
                    <div className="task-edit-note">
                      只允许修改名称和执行 Agent；sourceDiscoveryTaskId / sourceItemId / item payload 由 Discovery 维护。
                    </div>
                    {warning && <div className="task-edit-warning" role="status">{warning}</div>}
                    <div className="task-edit-grid">
                      <label className="task-edit-field">
                        <span>Task 名称</span>
                        <input
                          value={draft.title}
                          onChange={(event) => updateTaskEditDraft(generatedEditTask.taskId, "title", event.target.value)}
                        />
                      </label>
                      <label className="task-edit-field">
                        <span>Leader Agent</span>
                        <select
                          value={draft.leaderAgentId}
                          onChange={(event) => updateTaskEditDraft(generatedEditTask.taskId, "leaderAgentId", event.target.value)}
                        >
                          {agents.map((agent) => (
                            <option key={agent.agentId} value={agent.agentId}>
                              {agent.name} ({agent.agentId})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="task-edit-field">
                        <span>Worker Agent</span>
                        <select
                          value={draft.workerAgentId}
                          onChange={(event) => updateTaskEditDraft(generatedEditTask.taskId, "workerAgentId", event.target.value)}
                        >
                          {agents.map((agent) => (
                            <option key={agent.agentId} value={agent.agentId}>
                              {agent.name} ({agent.agentId})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="task-edit-field">
                        <span>Checker Agent</span>
                        <select
                          value={draft.checkerAgentId}
                          onChange={(event) => updateTaskEditDraft(generatedEditTask.taskId, "checkerAgentId", event.target.value)}
                        >
                          {agents.map((agent) => (
                            <option key={agent.agentId} value={agent.agentId}>
                              {agent.name} ({agent.agentId})
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="task-edit-actions">
                      <button
                        type="button"
                        className="task-action-menu-button"
                        onClick={() => {
                          clearTaskEditState(generatedEditTask.taskId);
                          setExpandedTaskBranches((current) =>
                            current.map((item) =>
                              item.nodeId === branch.nodeId
                                ? { ...item, discoveryGeneratedEditTaskId: undefined }
                                : item
                            )
                          );
                        }}
                      >
                        返回子画布
                      </button>
                      <button type="submit" className="task-action-menu-button primary" disabled={saving}>
                        {saving ? "保存中..." : "保存"}
                      </button>
                    </div>
                  </form>
                </section>
              ),
            });
          }
        }
        continue;
      }

      if (branch.detailMode === "clone") {
        const draft = taskCloneDraftByTaskId[task.taskId];
        const saving = Boolean(taskCloneSavingByTaskId[task.taskId]);
        if (draft) {
          const templateParameters = task.templateConfig?.parameters ?? [];
          panels.push({
            id: `task-clone-${branch.nodeId}`,
            width: 520,
            height: task.templateConfig ? 560 : 400,
            sourceId: menuPanelId,
            resizable: true,
            interactive: true,
            panel: (
              <section className="task-leader-branch emap-panel-branch task-edit-branch" aria-label={`${task.title} Task 复制`}>
                <header className="task-leader-branch-head">
                  <div className="task-leader-branch-title">
                    <span>Task 复制</span>
                    <strong>{task.title}</strong>
                    <code>{task.taskId}</code>
                  </div>
                  <button
                    type="button"
                    className="task-leader-branch-collapse"
                    onClick={() => {
                      clearTaskCloneState(task.taskId);
                      setExpandedTaskBranches((current) =>
                        current.map((item) =>
                          item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                        )
                      );
                    }}
                    aria-label={`收起 ${task.title} Task 复制`}
                  >
                    收起
                  </button>
                </header>
                <form
                  className="task-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void cloneTask(task, branch.nodeId);
                  }}
                >
                  <div className="task-edit-note">
                    复制只复制 Task 定义，不复制运行记录、进行中的 run 或 generated 子任务。
                  </div>
                  <div className="task-edit-grid">
                    <label className="task-edit-field">
                      <span>新 Task 名称</span>
                      <input
                        value={draft.title}
                        onChange={(event) => updateTaskCloneTitle(task.taskId, event.target.value)}
                      />
                    </label>
                    {templateParameters.map((parameter) => (
                      <label key={parameter.id} className="task-edit-field">
                        <span>{parameter.label}{parameter.required ? " *" : ""}</span>
                        {renderTemplateParameterControl(
                          parameter,
                          draft.templateBindings[parameter.id] ?? "",
                          (value) => updateTaskCloneBinding(task.taskId, parameter.id, value),
                        )}
                      </label>
                    ))}
                  </div>
                  <div className="task-edit-actions">
                    <button
                      type="button"
                      className="task-action-menu-button"
                      onClick={() => {
                        clearTaskCloneState(task.taskId);
                        setExpandedTaskBranches((current) =>
                          current.map((item) =>
                            item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                          )
                        );
                      }}
                    >
                      返回菜单
                    </button>
                    <button type="submit" className="task-action-menu-button primary" disabled={saving}>
                      {saving ? "创建中..." : "创建复制"}
                    </button>
                  </div>
                </form>
              </section>
            ),
          });
        }
        continue;
      }

      if (branch.detailMode === "parameters") {
        const draft = taskParameterDraftByTaskId[task.taskId];
        const saving = Boolean(taskParameterSavingByTaskId[task.taskId]);
        const runSaving = Boolean(taskRunSavingByTaskId[task.taskId]);
        const templateParameters = task.templateConfig?.parameters ?? [];
        if (draft && task.templateConfig) {
          panels.push({
            id: `task-parameters-${branch.nodeId}`,
            width: 520,
            height: 460,
            sourceId: menuPanelId,
            resizable: true,
            interactive: true,
            panel: (
              <section className="task-leader-branch emap-panel-branch task-edit-branch" aria-label={`${task.title} Task 参数`}>
                <header className="task-leader-branch-head">
                  <div className="task-leader-branch-title">
                    <span>Task 参数</span>
                    <strong>{task.title}</strong>
                    <code>{task.taskId}</code>
                  </div>
                  <button
                    type="button"
                    className="task-leader-branch-collapse"
                    onClick={() => {
                      clearTaskParameterState(task.taskId);
                      setExpandedTaskBranches((current) =>
                        current.map((item) =>
                          item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                        )
                      );
                    }}
                    aria-label={`收起 ${task.title} Task 参数`}
                  >
                    收起
                  </button>
                </header>
                <form
                  className="task-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveTaskParameters(task);
                  }}
                >
                  <div className="task-edit-note">
                    参数会保存为该模板 Task 的当前值；每次运行仍会在 run source 中记录当次快照。
                  </div>
                  <div className="task-edit-grid">
                    {templateParameters.map((parameter) => (
                      <label key={parameter.id} className="task-edit-field">
                        <span>{parameter.label}{parameter.required !== false ? " *" : ""}</span>
                        {renderTemplateParameterControl(
                          parameter,
                          draft.templateBindings[parameter.id] ?? "",
                          (value) => updateTaskParameterBinding(task.taskId, parameter.id, value),
                        )}
                      </label>
                    ))}
                  </div>
                  <div className="task-edit-actions">
                    <button
                      type="button"
                      className="task-action-menu-button"
                      onClick={() => {
                        clearTaskParameterState(task.taskId);
                        setExpandedTaskBranches((current) =>
                          current.map((item) =>
                            item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                          )
                        );
                      }}
                    >
                      返回菜单
                    </button>
                    <button type="submit" className="task-action-menu-button" disabled={saving || runSaving}>
                      {saving ? "保存中..." : "保存参数"}
                    </button>
                    <button
                      type="button"
                      className="task-action-menu-button primary"
                      disabled={saving || runSaving || task.status !== "ready"}
                      onClick={async () => {
                        const bindings = await saveTaskParameters(task);
                        if (bindings) {
                          await runTask(task, branch.nodeId, bindings);
                        }
                      }}
                    >
                      {runSaving ? "启动中..." : "保存并运行"}
                    </button>
                  </div>
                </form>
              </section>
            ),
          });
        }
        continue;
      }

      if (branch.detailMode === "edit") {
        const draft = taskEditDraftByTaskId[task.taskId];
        const warning = taskEditWarningByTaskId[task.taskId] ?? null;
        const saving = Boolean(taskEditSavingByTaskId[task.taskId]);
        if (draft) {
          panels.push({
            id: `task-edit-${branch.nodeId}`,
            width: 520,
            height: 480,
            sourceId: menuPanelId,
            resizable: true,
            interactive: true,
            panel: (
              <section className="task-leader-branch emap-panel-branch task-edit-branch" aria-label={`${task.title} Task 编辑`}>
                <header className="task-leader-branch-head">
                  <div className="task-leader-branch-title">
                    <span>Task 编辑</span>
                    <strong>{task.title}</strong>
                    <code>{task.taskId}</code>
                  </div>
                  <button
                    type="button"
                    className="task-leader-branch-collapse"
                    onClick={() => setExpandedTaskBranches((current) =>
                      current.map((item) =>
                        item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                      )
                    )}
                    aria-label={`收起 ${task.title} Task 编辑`}
                  >
                    收起
                  </button>
                </header>
                <form
                  className="task-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveTaskEdit(task.taskId);
                  }}
                >
                  <div className="task-edit-note">
                    复杂需求和验收规则继续通过 Leader 对话里的 <code>/team-task</code> 更新；这里仅做 Task 名称和执行 Agent 的浅编辑。
                  </div>
                  {warning && <div className="task-edit-warning" role="status">{warning}</div>}
                  <div className="task-edit-grid">
                    <label className="task-edit-field">
                      <span>Task 名称</span>
                      <input
                        value={draft.title}
                        onChange={(event) => updateTaskEditDraft(task.taskId, "title", event.target.value)}
                      />
                    </label>
                    <label className="task-edit-field">
                      <span>Leader Agent</span>
                      <select
                        value={draft.leaderAgentId}
                        onChange={(event) => updateTaskEditDraft(task.taskId, "leaderAgentId", event.target.value)}
                      >
                        {agents.map((agent) => (
                          <option key={agent.agentId} value={agent.agentId}>
                            {agent.name} ({agent.agentId})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="task-edit-field">
                      <span>Worker Agent</span>
                      <select
                        value={draft.workerAgentId}
                        onChange={(event) => updateTaskEditDraft(task.taskId, "workerAgentId", event.target.value)}
                      >
                        {agents.map((agent) => (
                          <option key={agent.agentId} value={agent.agentId}>
                            {agent.name} ({agent.agentId})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="task-edit-field">
                      <span>Checker Agent</span>
                      <select
                        value={draft.checkerAgentId}
                        onChange={(event) => updateTaskEditDraft(task.taskId, "checkerAgentId", event.target.value)}
                      >
                        {agents.map((agent) => (
                          <option key={agent.agentId} value={agent.agentId}>
                            {agent.name} ({agent.agentId})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="task-edit-actions">
                    <button
                      type="button"
                      className="task-action-menu-button"
                      onClick={() => {
                        clearTaskEditWarning(task.taskId);
                        setExpandedTaskBranches((current) =>
                          current.map((item) =>
                            item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                          )
                        );
                      }}
                    >
                      返回菜单
                    </button>
                    <button type="submit" className="task-action-menu-button primary" disabled={saving}>
                      {saving ? "保存中..." : "保存"}
                    </button>
                  </div>
                </form>
              </section>
            ),
          });
        }
        continue;
      }

      if (branch.detailMode === "leader-chat") {
        const copyEntry = taskLeaderCopyByTaskId[task.taskId] ?? null;
        const copyState = copyEntry?.state ?? "idle";
        const manualCopyText = copyEntry?.manualCopyText ?? null;
        const renderTaskLeaderChatPanel = (embedMode: AgentPlaygroundEmbedMode) => (
          <section className="agent-playground-branch emap-dialog-branch task-leader-chat-branch" aria-label={`${task.title} leader 对话`}>
            <header className="agent-playground-branch-head">
              <div className="agent-playground-branch-title">
                <span>Leader 对话</span>
                <strong>{task.title}</strong>
                <code>{task.taskId}</code>
              </div>
              <div className="agent-playground-branch-actions">
                <button
                  type="button"
                  className="task-action-menu-button"
                  onClick={() => { void copyTaskLeaderContext(task.taskId, formatTaskLeaderContext(task)); }}
                  aria-label="复制 Task 上下文"
                >
                  复制 Task 上下文
                </button>
                {copyState !== "idle" && (
                  <span role="status" className="task-leader-copy-status">
                    {copyState === "copied" ? "已复制" : "复制失败"}
                  </span>
                )}
                <button
                  type="button"
                  className="agent-playground-branch-collapse"
                  onClick={() => setExpandedTaskBranches((current) =>
                    current.map((item) =>
                      item.nodeId === branch.nodeId ? { ...item, detailMode: null } : item
                    )
                  )}
                  aria-label={`收起 ${task.title} leader 对话`}
                >
                  收起
                </button>
              </div>
            </header>
            <div className="task-leader-branch-hint">
              在对话中使用 <code>/team-task</code> 创建或更新这个 Task。Task 数据必须通过后端 API 写入。
            </div>
            {copyState === "failed" && manualCopyText && (
              <div className="task-leader-copy-fallback" role="group" aria-label="Task 上下文手动复制">
                <p>自动复制失败。下面文本已选中，按 Ctrl+C 后再粘贴到 Leader 对话。</p>
                <textarea
                  ref={(node) => registerTaskLeaderManualCopyRef(task.taskId, node)}
                  aria-label="手动复制 Task 上下文"
                  readOnly
                  value={manualCopyText}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </div>
            )}
            <iframe
              className="agent-playground-iframe"
              title={`${task.title} leader 对话`}
              src={buildTaskLeaderPlaygroundUrl(task, embedMode)}
              referrerPolicy="no-referrer"
              allow="clipboard-write; clipboard-read"
            />
          </section>
        );
        panels.push({
          id: `task-leader-chat-${branch.nodeId}`,
          width: 820,
          height: 620,
          sourceId: menuPanelId,
          resizable: true,
          maximizable: true,
          interactive: true,
          panel: renderTaskLeaderChatPanel("mini"),
          maximizedPanel: renderTaskLeaderChatPanel("full"),
        });
        continue;
      }
    }

    const pushTaskRunObserverPanels = ({
      observedTaskRun,
      selectedFileKeys,
      sourceId,
      runObserverPanelId,
      fileDetailPanelIdPrefix,
      toggleFile,
      generatedTaskId,
      historyTask,
    }: {
      observedTaskRun: TeamRunState;
      selectedFileKeys: string[];
      sourceId: string;
      runObserverPanelId: string;
      fileDetailPanelIdPrefix: string;
      toggleFile: (key: string) => void;
      generatedTaskId?: string;
      historyTask?: RunHistoryAnalysisTask;
    }) => {
      const observerState = taskRunObserverByRunId[observedTaskRun.runId] ?? null;
      const attempts = observerState?.attempts ?? [];
      const fileDescriptors = attempts.length > 0 ? buildTaskRunFileDescriptors(attempts) : [];
      const latestAttempt = selectLatestAttempt(attempts);
      const selectedFileKeySet = new Set(selectedFileKeys);
      const selectedFileDescriptors = selectedFileKeys
        .map((key) => fileDescriptors.find((descriptor) => descriptor.key === key) ?? null)
        .filter((descriptor): descriptor is TaskRunObserverFileDescriptor => Boolean(descriptor));
      const observedTaskRunIsActive = isActiveRun(observedTaskRun.status);
      const manualUpstreamSelections = observedTaskRun.source?.manualUpstreamSelections ?? [];
      const inputSourceLabel = manualUpstreamSelections.length > 0 ? "手动上游输入" : "自然运行流入";
      const inputSourceKind = manualUpstreamSelections.length > 0 ? "manual" : "natural";

      const renderFileRow = (descriptor: TaskRunObserverFileDescriptor) => {
        const isSelected = selectedFileKeySet.has(descriptor.key);
        const agentName = descriptor.runtimeContext
          ? (agentsById.get(descriptor.runtimeContext.resolvedProfileId)?.name ?? descriptor.runtimeContext.resolvedProfileId)
          : descriptor.kind === "result"
            ? (descriptor.fileName.includes("accepted") ? "Accepted result" : "Result")
            : descriptor.kind;
        return (
          <button
            type="button"
            key={descriptor.key}
            className={`emap-observer-file-row ${descriptor.kind} ${isSelected ? "selected" : ""}`}
            data-file-kind={descriptor.kind}
            onClick={() => toggleFile(descriptor.key)}
          >
            <span className="emap-observer-file-row-agent">{agentName}</span>
            <code className="emap-observer-file-row-name">{descriptor.fileName}</code>
            <span className="emap-observer-file-row-path">{descriptor.path}</span>
          </button>
        );
      };

      const renderFileSection = (label: string, descriptors: TaskRunObserverFileDescriptor[]) => {
        if (descriptors.length === 0) return null;
        return (
          <div className="emap-run-observer-file-section">
            <span className="emap-run-observer-file-kicker">{label}</span>
            <div className="emap-run-observer-file-list">
              {descriptors.map(renderFileRow)}
            </div>
          </div>
        );
      };

      const workerFiles = fileDescriptors.filter((d) => d.kind === "worker");
      const checkerFiles = fileDescriptors.filter((d) => d.kind === "checker");
      const resultFiles = fileDescriptors.filter((d) => d.kind === "result");
      const hasFiles = fileDescriptors.length > 0;
      const emptyFilesMessage = attempts.length === 0
        ? "该运行没有 attempt 记录。可能是子任务未启动、已跳过，或旧运行未保存 attempt。"
        : latestAttempt?.status === "failed"
          ? "该 attempt 未产生可展示文件。请查看 Worker / Checker 过程或错误摘要。"
          : "该 attempt 未产生可展示文件。";

      panels.push({
        id: runObserverPanelId,
        width: 480,
        autoHeight: true,
        sourceId,
        panel: (
          <div
            className={`emap-run-observer-panel ${observedTaskRunIsActive ? "active" : "terminal"}`}
            data-observer-run-id={observedTaskRun.runId}
            data-generated-observer-task-id={generatedTaskId}
            data-generated-observer-run-id={generatedTaskId ? observedTaskRun.runId : undefined}
          >
            <header className="emap-run-observer-head">
              <span>{"\u8fd0\u884c\u89c2\u5bdf"}</span>
              <span className="emap-run-observer-head-meta">
                <span
                  className={`emap-run-observer-input-source ${inputSourceKind}`}
                  data-input-source-kind={inputSourceKind}
                >
                  {inputSourceLabel}
                </span>
                <strong>{RUN_STATUS_LABELS[observedTaskRun.status]}</strong>
              </span>
            </header>
            {historyTask && (
              <section className="emap-run-observer-history-summary" aria-label="历史运行摘要">
                <div className="emap-run-observer-history-times">
                  <span>
                    <small>开始时间</small>
                    <time dateTime={observedTaskRun.startedAt ?? observedTaskRun.createdAt}>
                      {formatRunTimestamp(observedTaskRun.startedAt ?? observedTaskRun.createdAt)}
                    </time>
                  </span>
                  <span>
                    <small>结束时间</small>
                    <time dateTime={observedTaskRun.finishedAt ?? undefined}>
                      {formatRunTimestamp(observedTaskRun.finishedAt, isActiveRun(observedTaskRun.status) ? "未结束" : "未记录")}
                    </time>
                  </span>
                </div>
                <button
                  type="button"
                  className="emap-run-observer-copy-analysis"
                  onClick={() => {
                    void copyRunHistoryAnalysisContext(historyTask, observedTaskRun, attempts, fileDescriptors);
                  }}
                >
                  复制给 Agent 分析
                </button>
                {runHistoryAnalysisCopyState !== "idle" && (
                  <span role="status" className="emap-run-observer-copy-status">
                    {runHistoryAnalysisCopyState === "copied" ? "已复制" : "复制失败"}
                  </span>
                )}
                {runHistoryAnalysisCopyState === "failed" && runHistoryAnalysisManualText && (
                  <textarea
                    ref={runHistoryAnalysisManualCopyRef}
                    className="emap-run-observer-copy-fallback"
                    aria-label="手动复制历史运行分析上下文"
                    readOnly
                    value={runHistoryAnalysisManualText}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                )}
              </section>
            )}
            <div className="emap-run-observer-stage worker" data-observer-section="worker-process">
              {renderRoleProcessNode("worker", latestAttempt?.roleProcesses?.worker)}
            </div>
            <div className="emap-run-observer-stage-files worker" data-observer-section="worker-files">
              {renderFileSection("Worker \u8f93\u51fa", workerFiles)}
            </div>
            <div className="emap-run-observer-stage checker" data-observer-section="checker-process">
              {renderRoleProcessNode("checker", latestAttempt?.roleProcesses?.checker)}
            </div>
            <div className="emap-run-observer-stage-files checker" data-observer-section="checker-files">
              {renderFileSection("Checker \u8f93\u51fa", checkerFiles)}
            </div>
            <div className="emap-run-observer-stage-files result" data-observer-section="result-files">
              {renderFileSection("\u9a8c\u6536\u7ed3\u679c", resultFiles)}
            </div>
            {!hasFiles && !observerState?.loading && !observedTaskRunIsActive && (
              <div className="emap-observer-empty">{emptyFilesMessage}</div>
            )}
          </div>
        ),
      });

      for (const descriptor of selectedFileDescriptors) {
        const fileState = observerState?.files[descriptor.key];
        panels.push({
          id: `${fileDetailPanelIdPrefix}-${descriptor.key}`.replace(/[^A-Za-z0-9_-]/g, "-"),
          width: 460,
          height: 420,
          sourceId: runObserverPanelId,
          resizable: true,
          minWidth: 360,
          minHeight: 280,
          panel: (
            <section className="emap-observer-node emap-observer-file-detail-node" aria-label={descriptor.title}>
              <header className="emap-observer-node-head">
                <span className="emap-observer-node-label">{descriptor.title}</span>
                <code className="emap-observer-file-name">{descriptor.fileName}</code>
                <button
                  type="button"
                  className="emap-observer-node-close"
                  onClick={() => toggleFile(descriptor.key)}
                  aria-label="\u6536\u8d77\u6587\u4ef6\u8be6\u60c5"
                >
                  {"\u6536\u8d77"}
                </button>
              </header>
              <div className="emap-observer-file-detail-body">
                {fileState?.error ? (
                  <div className="emap-observer-file-error">{fileState.error}</div>
                ) : fileState?.content ? (
                  renderFileDetailContent(descriptor.fileName, fileState.content)
                ) : (
                  <div className="emap-observer-file-loading">{"\u6b63\u5728\u8bfb\u53d6\u6587\u4ef6..."}</div>
                )}
              </div>
            </section>
          ),
        });
      }
    };

    for (const branch of expandedTaskBranches) {
      const discoveryRunHistoryTaskId = branch.detailMode === "discovery-subcanvas"
        ? branch.discoveryGeneratedRunHistoryTaskId
        : undefined;
      const isRunHistoryMode = branch.detailMode === "run-history" || Boolean(discoveryRunHistoryTaskId);
      if ((branch.detailMode !== "run-observer" && !isRunHistoryMode) || !branch.observedRunId) continue;
      const node = taskNodes.find((candidate) => candidate.nodeId === branch.nodeId) ?? null;
      const task = node ? tasksById.get(node.taskId) ?? null : null;
      if (!node || !task) continue;
      const targetTaskId = isRunHistoryMode
        ? discoveryRunHistoryTaskId ?? branch.runHistoryTaskId ?? activeRunHistoryTaskId ?? task.taskId
        : task.taskId;
      const observedTaskRun = (taskRunsByTaskId[targetTaskId] ?? []).find((taskRun) => taskRun.runId === branch.observedRunId)
        ?? (isRunHistoryMode
          ? runHistoryByTaskId[targetTaskId]?.items.find((item) => item.annotation.taskId === targetTaskId && item.run.runId === branch.observedRunId)?.run ?? null
          : null);
      if (!observedTaskRun) continue;
      const historyTask = isRunHistoryMode
        ? tasksById.get(targetTaskId) ?? generatedTasksById.get(targetTaskId) ?? task
        : undefined;
      const runHistoryPanelId = taskRunHistoryPanelId(branch.nodeId, Boolean(discoveryRunHistoryTaskId));
      const observerPanelKind: TaskRunObserverPanelKind = discoveryRunHistoryTaskId
        ? "generated-run-history"
        : branch.detailMode === "run-history"
          ? "run-history"
          : "task";

      const toggleFile = (key: string) => {
        setExpandedTaskBranches((current) => current.map((item) => {
          if (item.nodeId !== branch.nodeId) return item;
          const currentKeys = item.selectedFileKeys ?? [];
          return {
            ...item,
            selectedFileKeys: currentKeys.includes(key)
              ? currentKeys.filter((fileKey) => fileKey !== key)
              : [...currentKeys, key],
          };
        }));
      };

      pushTaskRunObserverPanels({
        observedTaskRun,
        selectedFileKeys: branch.selectedFileKeys ?? [],
        sourceId: isRunHistoryMode ? runHistoryPanelId : taskMenuPanelId(branch.nodeId),
        runObserverPanelId: taskRunObserverPanelId(branch.nodeId, observerPanelKind),
        fileDetailPanelIdPrefix: taskRunObserverFileDetailPanelIdPrefix(branch.nodeId, observerPanelKind),
        toggleFile,
        historyTask,
      });
    }

    for (const branch of expandedTaskBranches) {
      if (branch.detailMode !== "discovery-subcanvas" || !branch.discoveryGeneratedObserver) continue;
      const node = taskNodes.find((candidate) => candidate.nodeId === branch.nodeId) ?? null;
      const discoveryTask = node ? tasksById.get(node.taskId) ?? null : null;
      if (!node || !discoveryTask || discoveryTask.canvasKind !== "discovery" || discoveryTask.generatedSource) continue;

      const generatedObserver = branch.discoveryGeneratedObserver;
      const generatedTask = generatedTasksById.get(generatedObserver.taskId) ?? null;
      if (!generatedTask || generatedTask.generatedSource?.sourceDiscoveryTaskId !== discoveryTask.taskId) continue;
      const activeDiscoveryRun = selectActiveDiscoveryRootRun(discoveryTask.taskId, taskRunsByTaskId);
      const observedTaskRun = visibleDiscoveryGeneratedRuns(generatedTask, discoveryTask.taskId, activeDiscoveryRun, taskRunsByTaskId)
        .find((taskRun) => taskRun.runId === generatedObserver.runId) ?? null;
      if (!observedTaskRun) continue;

      const toggleFile = (key: string) => {
        setExpandedTaskBranches((current) => current.map((item) => {
          if (item.nodeId !== branch.nodeId) return item;
          const currentObserver = item.discoveryGeneratedObserver;
          if (!currentObserver || currentObserver.taskId !== generatedTask.taskId || currentObserver.runId !== observedTaskRun.runId) {
            return item;
          }
          const currentKeys = currentObserver.selectedFileKeys ?? [];
          return {
            ...item,
            discoveryGeneratedObserver: {
              ...currentObserver,
              selectedFileKeys: currentKeys.includes(key)
                ? currentKeys.filter((fileKey) => fileKey !== key)
                : [...currentKeys, key],
            },
          };
        }));
      };

      pushTaskRunObserverPanels({
        observedTaskRun,
        selectedFileKeys: generatedObserver.selectedFileKeys ?? [],
        sourceId: `discovery-subcanvas-${branch.nodeId}`,
        runObserverPanelId: `generated-run-observer-${branch.nodeId}-${generatedTask.taskId}`,
        fileDetailPanelIdPrefix: `generated-file-detail-${branch.nodeId}-${generatedTask.taskId}`,
        toggleFile,
        generatedTaskId: generatedTask.taskId,
      });
    }

    return panels;
  }, [activeRunHistoryTaskId, agents, agentsById, archiveDiscoveryChannelSet, archiveGeneratedTask, archiveTask, cancelTaskRun, clearDiscoveryChannelTaskSelection, clearGeneratedArchiveUiForTasks, clearGeneratedEditDetailFailure, clearTaskCloneState, clearTaskEditState, clearTaskEditWarning, clearTaskParameterState, cloneTask, closeTaskRunHistory, copyRunHistoryAnalysisContext, copyTaskLeaderContext, dataSource, discoveryChannelSetArchivingById, discoveryChannelSetLoadingByTaskId, discoveryChannelSetSavingByTaskId, discoveryChannelSetTitleByTaskId, discoveryChannelSetsByTaskId, discoveryDispatchDiagnosticsByTaskId, discoveryRunPolicySavingByTaskId, ensureGeneratedTaskDetail, expandedTaskBranches, generatedActionMenuTaskId, generatedArchiveConfirmTaskId, generatedArchiveSavingByTaskId, generatedResetSavingByTaskId, generatedTasksByDiscoveryTaskId, generatedTasksById, loadMoreRunHistory, loadRunHistoryItem, loadedTaskRunByTaskId, openTaskEditDraft, openTaskParameterDraft, openTaskRunHistory, patchRunHistoryAnnotation, refreshLiveTasks, registerTaskLeaderManualCopyRef, resetGeneratedTaskWorkUnit, runHistoryAnalysisCopyState, runHistoryAnalysisManualText, runHistoryByTaskId, runHistoryIncludeArchived, runTask, saveDiscoveryChannelSet, saveTaskEdit, saveTaskParameters, scheduleLiveTaskDiscoveryRefresh, selectDiscoveryChannelSet, selectedDiscoveryChannelSetIdByTaskId, selectedDiscoveryChannelTaskIdsByTaskId, setError, taskArchiveConfirmNodeId, taskArchiveSavingNodeId, taskCloneDraftByTaskId, taskCloneSavingByTaskId, taskEditDraftByTaskId, taskEditSavingByTaskId, taskEditWarningByTaskId, taskLeaderCopyByTaskId, taskNodes, taskParameterDraftByTaskId, taskParameterSavingByTaskId, taskRunObserverByRunId, taskRunSavingByTaskId, taskRunsByTaskId, tasksById, toggleDiscoveryChannelTaskSelection, unloadRunHistoryItem, updateDiscoveryRunPolicy, updateTaskCloneBinding, updateTaskCloneTitle, updateTaskEditDraft, updateTaskParameterBinding]);
  const canvasStateRestorePending = !loading && !canvasUiStateHydrated;
  const canvasLoadingMinimumMs = loading || canvasUiStateRestoreHasStoredState
    ? CANVAS_LOADING_MIN_VISIBLE_MS
    : dataSource === "live" && initialDataSourceRef.current === "live" && !sharedCanvasUiStateLoaded
      ? 1
      : 0;
  const canvasLoadingVisible = useMinimumVisibleFlag(
    loading || canvasStateRestorePending,
    canvasLoadingMinimumMs,
  );
  const canvasLoadingText = loading ? "正在加载实时运行..." : "正在恢复画布状态...";

  return (
    <div className="app-shell" data-theme={effectiveTheme} data-visual-theme={visualTheme}>
      {error && (
        <div className="error-banner">{error}</div>
      )}

      {rootArchiveConfirm && (
        <div className="root-archive-modal-overlay">
          <div className="root-archive-modal" role="dialog" aria-modal="true" aria-labelledby="root-archive-modal-title">
            <h3 className="root-archive-modal-title" id="root-archive-modal-title">
              {rootArchiveConfirm.kind === "batch" ? "批量移除/归档" : rootArchiveConfirm.kind === "source" ? "归档 Source" : rootArchiveConfirm.kind === "task" ? "归档 Task" : "移出 Agent"}
            </h3>
            <p className="root-archive-modal-body">
              {rootArchiveConfirm.kind === "batch"
                ? `确认移除/归档 ${rootArchiveConfirm.items.length} 个节点？Agent 只从画布移出，Task/Source 将软归档。`
                : rootArchiveConfirm.kind === "source"
                  ? `确认归档 Source "${rootArchiveConfirm.title}"？归档后无法恢复。`
                  : rootArchiveConfirm.kind === "task"
                    ? `确认归档 Task "${rootArchiveConfirm.task.title}"？归档后无法恢复。`
                    : `确认将 Agent "${rootArchiveConfirm.name}" 移出画布？不会删除真实 Agent。`}
            </p>
            <div className="root-archive-modal-actions">
              <button
                type="button"
                className="root-archive-modal-cancel"
                onClick={cancelRootArchive}
                disabled={rootArchiveSaving}
              >
                取消
              </button>
              <button
                type="button"
                className="root-archive-modal-confirm"
                onClick={confirmRootArchive}
                disabled={rootArchiveSaving}
                aria-label={rootArchiveConfirm.kind === "agent" ? "确认移出画布" : "确认归档"}
              >
                {rootArchiveSaving
                  ? "处理中..."
                  : rootArchiveConfirm.kind === "agent"
                    ? "确认移出画布"
                    : "确认归档"}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="app-main">
        {canvasLoadingVisible ? (
          <div key="canvas-loading" className="empty-state canvas-loading-state" role="status" aria-live="polite">
            <div className="canvas-loading-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p>{canvasLoadingText}</p>
            <div className="canvas-loading-bar" aria-hidden="true" />
          </div>
        ) : (
          <div key="workspace" className="workspace">
            <div className="workspace-map">
              <ExecutionMap
                theme={theme}
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
                minimizedAgentNodeIds={minimizedAgentNodeIds}
                onMinimizeAgent={minimizeAgentNode}
                onRestoreAgent={restoreAgentNode}
                agentBranchPanel={expandedAgentBranchPanel}
                maximizedAgentBranchPanel={maximizedAgentBranchPanel}
                taskNodes={taskNodes}
                tasksById={tasksById}
                taskConnections={taskConnections}
                taskConnectionDraft={taskConnectionDraft}
                taskDependencies={taskDependencies}
                taskDependencyDraft={taskDependencyDraft}
                onTaskDependencySourceSelect={beginTaskDependency}
                onTaskDependencyTargetSelect={completeTaskDependency}
                onDeleteTaskConnection={deleteTaskConnection}
                onDeleteSourceConnection={deleteSourceConnectionAction}
                onDeleteTaskDependency={deleteTaskDependencyAction}
                pendingDeleteConnectionId={pendingDeleteTaskConnectionId}
                pendingDeleteSourceConnectionId={pendingDeleteSourceConnectionId}
                pendingDeleteDependencyId={pendingDeleteDependencyId}
                sourceNodes={sourceAtlasNodes}
                sourceNodesById={sourceNodesById}
                sourceConnections={sourceConnections}
                sourceConnectionDraft={sourceConnectionDraft}
                taskRunsByTaskId={taskRunsByTaskId}
                discoverySummariesByTaskId={discoverySummariesByTaskId}
                focusedTaskNodeId={focusedTaskNodeId}
                onSelectCanvasTask={toggleTaskBranch}
                onMoveCanvasTask={moveTaskNode}
                minimizedTaskNodeIds={minimizedTaskNodeIds}
                onMinimizeCanvasTask={minimizeTaskNode}
                onRestoreCanvasTask={restoreTaskNode}
                taskGroups={taskGroups}
                minimizedTaskGroupIds={minimizedTaskGroupIds}
                onMinimizeTaskGroup={minimizeTaskGroup}
                onRestoreTaskGroup={restoreTaskGroup}
                onToggleTaskGroup={toggleTaskGroup}
                onToggleTaskGroupLock={toggleTaskGroupLock}
                onRenameTaskGroup={renameTaskGroup}
                onDeleteTaskGroup={deleteTaskGroup}
                onRunTaskGroup={runTaskGroup}
                onCancelTaskGroupRun={cancelTaskGroupRun}
                onAddSelectedTasksToTaskGroup={addSelectedTasksToTaskGroup}
                onRemoveTaskFromTaskGroup={removeTaskFromTaskGroup}
                onAtlasSelectionChange={updateSelectedAtlasEntries}
                onMoveSourceNode={moveSourceNode}
                minimizedSourceNodeIds={minimizedSourceNodeIds}
                onMinimizeSourceNode={minimizeSourceNode}
                onRestoreSourceNode={restoreSourceNode}
                onSourceOutputPortSelect={beginSourcePortConnection}
                onSourceTextChange={updateTextSourceNode}
                onTaskOutputPortSelect={beginTaskPortConnection}
                onTaskInputPortSelect={completeTaskPortConnection}
                taskBranchPanels={taskBranchPanelItems}
                taskChildBranchPanels={taskChildBranchPanels}
                viewport={canvasViewport}
                onViewportChange={setCanvasViewport}
                branchLayout={canvasBranchLayout}
                onBranchLayoutChange={updateCanvasBranchLayout}
                toolbarStart={agentToolbar}
                toolbarEnd={mapToolbarControls}
                rootNodeFilter={rootNodeFilter}
                onRootTrashDrop={(entries) => {
                  const items: Array<RootArchiveConfirm> = [];
                  for (const entry of entries) {
                    if (entry.kind === "agent") {
                      const agentNode = agentNodes.find((n) => n.nodeId === entry.nodeId);
                      const agent = agentNode ? agentsById?.get(agentNode.agentId) : undefined;
                      if (agent) items.push({ kind: "agent", nodeId: entry.nodeId, agentId: agent.agentId, name: agent.name });
                    } else if (entry.kind === "task") {
                      const taskNode = taskNodes.find((n) => n.nodeId === entry.nodeId);
                      const task = taskNode ? tasksById?.get(taskNode.taskId) : undefined;
                      if (task) items.push({ kind: "task", task, nodeId: entry.nodeId });
                    } else {
                      const srcNode = sourceAtlasNodes.find((n) => n.nodeId === entry.nodeId);
                      const source = srcNode ? sourceNodesById?.get(srcNode.sourceNodeId) : undefined;
                      if (source) items.push({ kind: "source", sourceNodeId: source.sourceNodeId, nodeId: entry.nodeId, title: source.title });
                    }
                  }
                  if (items.length === 1) {
                    setRootArchiveConfirm(items[0]!);
                  } else if (items.length > 1) {
                    setRootArchiveConfirm({ kind: "batch", items });
                  }
                }}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
