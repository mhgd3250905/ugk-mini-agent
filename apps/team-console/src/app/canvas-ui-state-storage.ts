import { CLEAN_AGENT_WORKSPACE_ID, type DataSource } from "./use-team-console-live-data";
import type { TaskBranchDetailMode, TaskBranchGeneratedObserverState, TaskBranchState } from "./use-task-branch-stack";
import type { StoredTaskGroupDisplayState } from "./team-console-task-group-projection";
import type { AtlasAgentNode, AtlasBranchLayoutState, AtlasSourceNode, AtlasTaskGroup, AtlasTaskNode } from "../graph/ExecutionMap";
import { normalizeAtlasViewport, type AtlasViewport } from "../graph/AtlasCanvasShell";

export const LIVE_AGENT_LAYOUT_STORAGE_KEY = "ugk-team-console:live-agent-layout:v1";
export const LIVE_TASK_LAYOUT_STORAGE_KEY = "ugk-team-console:live-task-layout:v1";
export const LIVE_SOURCE_LAYOUT_STORAGE_KEY = "ugk-team-console:live-source-layout:v1";
export const CANVAS_UI_STATE_STORAGE_KEY = "ugk-team-console:canvas-ui-state:v1";
export const CANVAS_UI_STATE_BY_CONTEXT_STORAGE_KEY = "ugk-team-console:canvas-ui-state-by-context:v1";
export const DATA_SOURCE_STORAGE_KEY = "ugk-team-console:data-source";

export type AgentBranchMode = "chat" | "task-create";
export type RootNodeFilter = "all" | "agent" | "task" | "source";
export type AgentBranchState = {
  nodeId: string;
  agentId: string;
  mode: AgentBranchMode;
};
export type StoredCanvasUiState = {
  schemaVersion: 1;
  dataSource: DataSource;
  selectedFixtureId?: string;
  viewport?: AtlasViewport;
  agentNodes?: StoredAgentNodePosition[];
  taskNodePositions?: StoredTaskPosition[];
  sourceNodePositions?: StoredSourcePosition[];
  taskGroups?: AtlasTaskGroup[];
  taskGroupDisplayStates?: StoredTaskGroupDisplayState[];
  expandedAgentBranch?: AgentBranchState | null;
  expandedTaskBranches?: TaskBranchState[];
  branchLayout?: AtlasBranchLayoutState;
  minimizedAgentNodeIds?: string[];
  minimizedTaskNodeIds?: string[];
  minimizedSourceNodeIds?: string[];
  minimizedTaskGroupIds?: string[];
  rootNodeFilter?: RootNodeFilter;
  loadedTaskRunSelections?: StoredLoadedTaskRunSelection[];
};
export type StoredCanvasUiStateByContext = {
  schemaVersion: 1;
  states: Record<string, StoredCanvasUiState>;
};
export type StoredAgentNodePosition = {
  agentId: string;
  position: { x: number; y: number };
};
export type StoredTaskPosition = {
  taskId: string;
  position: { x: number; y: number };
};
export type StoredLoadedTaskRunSelection = {
  taskId: string;
  runId: string;
};
export type StoredSourcePosition = {
  sourceNodeId: string;
  position: { x: number; y: number };
};

export function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = typeof item === "string" ? item.trim() : "";
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

export function readStoredGeneratedObserver(value: unknown): TaskBranchGeneratedObserverState | undefined {
  const record = readRecord(value);
  if (!record) return undefined;
  const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
  const runId = typeof record.runId === "string" ? record.runId.trim() : "";
  if (!taskId || !runId) return undefined;
  const selectedFileKeys = readStringArray(record.selectedFileKeys);
  return {
    taskId,
    runId,
    ...(selectedFileKeys.length > 0 ? { selectedFileKeys } : {}),
  };
}

export function readStoredViewport(value: unknown): AtlasViewport | undefined {
  const record = readRecord(value);
  if (!record) return undefined;
  const x = Number(record.x);
  const y = Number(record.y);
  const scale = Number(record.scale);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(scale) || scale <= 0) {
    return undefined;
  }
  return normalizeAtlasViewport({ x, y, scale });
}

export function readStoredAgentBranch(value: unknown): AgentBranchState | null {
  const record = readRecord(value);
  if (!record) return null;
  const nodeId = typeof record.nodeId === "string" ? record.nodeId.trim() : "";
  const agentId = typeof record.agentId === "string" ? record.agentId.trim() : "";
  const mode = record.mode === "task-create" ? "task-create" : record.mode === "chat" ? "chat" : null;
  if (!nodeId || !agentId || !mode) return null;
  return { nodeId, agentId, mode };
}

export function readStoredTaskBranches(value: unknown): TaskBranchState[] {
  if (!Array.isArray(value)) return [];
  const result: TaskBranchState[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record = readRecord(item);
    if (!record) continue;
    const nodeId = typeof record.nodeId === "string" ? record.nodeId.trim() : "";
    const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
    if (!nodeId || !taskId || seen.has(nodeId)) continue;
    seen.add(nodeId);
    const rawDetailMode = record.detailMode;
    const detailMode: TaskBranchDetailMode | null =
      rawDetailMode === "leader-chat" || rawDetailMode === "edit" || rawDetailMode === "clone" || rawDetailMode === "parameters" || rawDetailMode === "run-history" || rawDetailMode === "run-observer" || rawDetailMode === "discovery-subcanvas"
        ? rawDetailMode
        : null;
    const observedRunId = typeof record.observedRunId === "string" && record.observedRunId.trim()
      ? record.observedRunId.trim()
      : undefined;
    const runHistoryTaskId = typeof record.runHistoryTaskId === "string" && record.runHistoryTaskId.trim()
      ? record.runHistoryTaskId.trim()
      : undefined;
    const selectedFileKeys = readStringArray(record.selectedFileKeys);
    const discoveryGeneratedObserver = readStoredGeneratedObserver(record.discoveryGeneratedObserver);
    const discoveryGeneratedEditTaskId = typeof record.discoveryGeneratedEditTaskId === "string" && record.discoveryGeneratedEditTaskId.trim()
      ? record.discoveryGeneratedEditTaskId.trim()
      : undefined;
    const discoveryGeneratedRunHistoryTaskId = typeof record.discoveryGeneratedRunHistoryTaskId === "string" && record.discoveryGeneratedRunHistoryTaskId.trim()
      ? record.discoveryGeneratedRunHistoryTaskId.trim()
      : undefined;
    const discoveryQueueExpanded = record.discoveryQueueExpanded === true;
    const discoveryStaleExpanded = record.discoveryStaleExpanded === true;
    result.push({
      nodeId,
      taskId,
      detailMode,
      ...(observedRunId ? { observedRunId } : {}),
      ...(runHistoryTaskId ? { runHistoryTaskId } : {}),
      ...(selectedFileKeys.length > 0 ? { selectedFileKeys } : {}),
      ...(discoveryGeneratedObserver ? { discoveryGeneratedObserver } : {}),
      ...(discoveryGeneratedEditTaskId ? { discoveryGeneratedEditTaskId } : {}),
      ...(discoveryGeneratedRunHistoryTaskId ? { discoveryGeneratedRunHistoryTaskId } : {}),
      ...(discoveryQueueExpanded ? { discoveryQueueExpanded } : {}),
      ...(discoveryStaleExpanded ? { discoveryStaleExpanded } : {}),
    });
  }
  return result;
}

export function readStoredLoadedTaskRunSelections(value: unknown): StoredLoadedTaskRunSelection[] {
  if (!Array.isArray(value)) return [];
  const result: StoredLoadedTaskRunSelection[] = [];
  const seenTaskIds = new Set<string>();
  for (const item of value) {
    const record = readRecord(item);
    if (!record) continue;
    const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
    const runId = typeof record.runId === "string" ? record.runId.trim() : "";
    if (!taskId || !runId || seenTaskIds.has(taskId)) continue;
    seenTaskIds.add(taskId);
    result.push({ taskId, runId });
  }
  return result;
}

export function filterLoadedTaskRunSelectionsByTaskIds(
  selections: StoredLoadedTaskRunSelection[],
  taskIds: ReadonlySet<string>,
): StoredLoadedTaskRunSelection[] {
  return selections.filter((selection) => taskIds.has(selection.taskId));
}

export function filterLoadedTaskRunByTaskId(
  selectionsByTaskId: Record<string, string>,
  taskIds: ReadonlySet<string>,
): Record<string, string> {
  let changed = false;
  const result: Record<string, string> = {};
  for (const [taskId, runId] of Object.entries(selectionsByTaskId)) {
    if (!taskIds.has(taskId)) {
      changed = true;
      continue;
    }
    result[taskId] = runId;
  }
  return changed ? result : selectionsByTaskId;
}

export function readStoredTaskGroups(value: unknown): AtlasTaskGroup[] {
  if (!Array.isArray(value)) return [];
  const result: AtlasTaskGroup[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record = readRecord(item);
    if (!record) continue;
    const groupId = typeof record.groupId === "string" ? record.groupId.trim() : "";
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const taskNodeIds = readStringArray(record.taskNodeIds);
    const headTaskIds = readStringArray(record.headTaskIds);
    if (!groupId || !title || taskNodeIds.length === 0 || seen.has(groupId)) continue;
    seen.add(groupId);
    result.push({
      groupId,
      title,
      taskNodeIds,
      ...(headTaskIds.length > 0 ? { headTaskIds } : {}),
      collapsed: record.collapsed === true,
      locked: record.locked === true,
    });
  }
  return result;
}

export function readStoredTaskGroupDisplayStates(value: unknown): StoredTaskGroupDisplayState[] {
  if (!Array.isArray(value)) return [];
  const result: StoredTaskGroupDisplayState[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record = readRecord(item);
    if (!record) continue;
    const groupId = typeof record.groupId === "string" ? record.groupId.trim() : "";
    if (!groupId || seen.has(groupId)) continue;
    seen.add(groupId);
    result.push({
      groupId,
      collapsed: record.collapsed === true,
      locked: record.locked === true,
    });
  }
  return result;
}

export function readStoredAgentNodePositions(value: unknown): StoredAgentNodePosition[] {
  if (!Array.isArray(value)) return [];
  const result: StoredAgentNodePosition[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record = item as { agentId?: unknown; position?: { x?: unknown; y?: unknown } };
    const agentId = typeof record.agentId === "string" ? record.agentId.trim() : "";
    const x = Number(record.position?.x);
    const y = Number(record.position?.y);
    if (!agentId || seen.has(agentId) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    seen.add(agentId);
    result.push({ agentId, position: { x, y } });
  }
  return result;
}

export function readStoredTaskNodePositions(value: unknown): StoredTaskPosition[] {
  if (!Array.isArray(value)) return [];
  const result: StoredTaskPosition[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record = item as { taskId?: unknown; position?: { x?: unknown; y?: unknown } };
    const taskId = typeof record.taskId === "string" ? record.taskId.trim() : "";
    const x = Number(record.position?.x);
    const y = Number(record.position?.y);
    if (!taskId || seen.has(taskId) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    seen.add(taskId);
    result.push({ taskId, position: { x, y } });
  }
  return result;
}

export function readStoredSourceNodePositions(value: unknown): StoredSourcePosition[] {
  if (!Array.isArray(value)) return [];
  const result: StoredSourcePosition[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const record = item as { sourceNodeId?: unknown; position?: { x?: unknown; y?: unknown } };
    const sourceNodeId = typeof record.sourceNodeId === "string" ? record.sourceNodeId.trim() : "";
    const x = Number(record.position?.x);
    const y = Number(record.position?.y);
    if (!sourceNodeId || seen.has(sourceNodeId) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    seen.add(sourceNodeId);
    result.push({ sourceNodeId, position: { x, y } });
  }
  return result;
}

export function readStoredPositionMap(value: unknown): Record<string, { x: number; y: number }> {
  const record = readRecord(value);
  if (!record) return {};
  const result: Record<string, { x: number; y: number }> = {};
  for (const [key, raw] of Object.entries(record)) {
    const item = readRecord(raw);
    const x = Number(item?.x);
    const y = Number(item?.y);
    if (!key || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    result[key] = { x, y };
  }
  return result;
}

export function readStoredSizeMap(value: unknown): Record<string, { width: number; height: number }> {
  const record = readRecord(value);
  if (!record) return {};
  const result: Record<string, { width: number; height: number }> = {};
  for (const [key, raw] of Object.entries(record)) {
    const item = readRecord(raw);
    const width = Number(item?.width);
    const height = Number(item?.height);
    if (!key || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
    result[key] = { width, height };
  }
  return result;
}

export function readStoredRectMap(value: unknown): NonNullable<AtlasBranchLayoutState["agentBranchRects"]> {
  const record = readRecord(value);
  if (!record) return {};
  const result: NonNullable<AtlasBranchLayoutState["agentBranchRects"]> = {};
  for (const [key, raw] of Object.entries(record)) {
    const item = readRecord(raw);
    const x = Number(item?.x);
    const y = Number(item?.y);
    const width = Number(item?.width);
    const height = Number(item?.height);
    if (!key || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
    result[key] = { x, y, width, height };
  }
  return result;
}

export function readStoredBranchLayout(value: unknown): AtlasBranchLayoutState {
  const record = readRecord(value);
  if (!record) return {};
  return {
    agentBranchRects: readStoredRectMap(record.agentBranchRects),
    taskBranchPositions: readStoredPositionMap(record.taskBranchPositions),
    taskChildPanelPositions: readStoredPositionMap(record.taskChildPanelPositions),
    taskChildPanelSizes: readStoredSizeMap(record.taskChildPanelSizes),
  };
}

export function canvasUiContextKeyFor(dataSource: DataSource, selectedFixtureId: string): string {
  return dataSource === "mock" ? `mock:${selectedFixtureId}` : "live";
}

export function parseStoredCanvasUiState(value: unknown): StoredCanvasUiState | null {
  const parsed = readRecord(value);
  if (!parsed || parsed.schemaVersion !== 1) return null;
  const dataSource = parsed.dataSource === "live" ? "live" : parsed.dataSource === "mock" ? "mock" : null;
  if (!dataSource) return null;
  const selectedFixtureId = typeof parsed.selectedFixtureId === "string" ? parsed.selectedFixtureId : undefined;
  const viewport = readStoredViewport(parsed.viewport);
  return {
    schemaVersion: 1,
    dataSource,
    ...(selectedFixtureId ? { selectedFixtureId } : {}),
    ...(viewport ? { viewport } : {}),
    agentNodes: readStoredAgentNodePositions(parsed.agentNodes),
    taskNodePositions: readStoredTaskNodePositions(parsed.taskNodePositions),
    sourceNodePositions: readStoredSourceNodePositions(parsed.sourceNodePositions),
    taskGroups: readStoredTaskGroups(parsed.taskGroups),
    taskGroupDisplayStates: readStoredTaskGroupDisplayStates(parsed.taskGroupDisplayStates ?? parsed.taskGroups),
    expandedAgentBranch: readStoredAgentBranch(parsed.expandedAgentBranch),
    expandedTaskBranches: readStoredTaskBranches(parsed.expandedTaskBranches),
    branchLayout: readStoredBranchLayout(parsed.branchLayout),
    minimizedAgentNodeIds: readStringArray(parsed.minimizedAgentNodeIds),
    minimizedTaskNodeIds: readStringArray(parsed.minimizedTaskNodeIds),
    minimizedSourceNodeIds: readStringArray(parsed.minimizedSourceNodeIds),
    minimizedTaskGroupIds: readStringArray(parsed.minimizedTaskGroupIds),
    rootNodeFilter: parsed.rootNodeFilter === "agent" || parsed.rootNodeFilter === "task" || parsed.rootNodeFilter === "source" ? parsed.rootNodeFilter : undefined,
    loadedTaskRunSelections: readStoredLoadedTaskRunSelections(parsed.loadedTaskRunSelections),
  };
}

export function parseStoredCanvasUiStateByContext(value: unknown): StoredCanvasUiStateByContext {
  const parsed = readRecord(value);
  if (!parsed || parsed.schemaVersion !== 1) return { schemaVersion: 1, states: {} };
  const rawStates = readRecord(parsed.states);
  if (!rawStates) return { schemaVersion: 1, states: {} };
  const states: Record<string, StoredCanvasUiState> = {};
  for (const [key, value] of Object.entries(rawStates)) {
    const state = parseStoredCanvasUiState(value);
    if (state && canvasUiContextMatches(state, state.dataSource, state.selectedFixtureId ?? CLEAN_AGENT_WORKSPACE_ID)) {
      states[key] = state;
    }
  }
  return { schemaVersion: 1, states };
}

export function readStoredCanvasUiStateByContext(): StoredCanvasUiStateByContext {
  try {
    const raw = globalThis.localStorage?.getItem(CANVAS_UI_STATE_BY_CONTEXT_STORAGE_KEY);
    if (!raw) return { schemaVersion: 1, states: {} };
    return parseStoredCanvasUiStateByContext(JSON.parse(raw));
  } catch {
    return { schemaVersion: 1, states: {} };
  }
}

export function mergeCanvasUiStateByContext(
  localState: StoredCanvasUiStateByContext,
  sharedState: StoredCanvasUiStateByContext | null,
): StoredCanvasUiStateByContext {
  if (!sharedState) return localState;
  return {
    schemaVersion: 1,
    states: {
      ...localState.states,
      ...sharedState.states,
    },
  };
}

export function readStoredCanvasUiState(
  dataSource: DataSource,
  selectedFixtureId: string,
  sharedState: StoredCanvasUiStateByContext | null = null,
): StoredCanvasUiState | null {
  const contextKey = canvasUiContextKeyFor(dataSource, selectedFixtureId);
  const byContext = mergeCanvasUiStateByContext(readStoredCanvasUiStateByContext(), sharedState);
  const scopedState = byContext.states[contextKey];
  if (scopedState && canvasUiContextMatches(scopedState, dataSource, selectedFixtureId)) {
    return scopedState;
  }

  try {
    const raw = globalThis.localStorage?.getItem(CANVAS_UI_STATE_STORAGE_KEY);
    if (!raw) return null;
    const legacyState = parseStoredCanvasUiState(JSON.parse(raw));
    if (!legacyState || !canvasUiContextMatches(legacyState, dataSource, selectedFixtureId)) return null;
    return legacyState;
  } catch {
    return null;
  }
}

export function readStoredInitialDataSource(): DataSource {
  try {
    return globalThis.localStorage?.getItem(DATA_SOURCE_STORAGE_KEY) === "live" ? "live" : "mock";
  } catch {
    return "mock";
  }
}

export function readInitialRootNodeFilter(): RootNodeFilter {
  const dataSource = readStoredInitialDataSource();
  const state = readStoredCanvasUiState(dataSource, CLEAN_AGENT_WORKSPACE_ID);
  return state?.rootNodeFilter ?? "all";
}

export function writeStoredCanvasUiState(state: StoredCanvasUiState): StoredCanvasUiStateByContext | null {
  try {
    globalThis.localStorage?.setItem(CANVAS_UI_STATE_STORAGE_KEY, JSON.stringify(state));
    const contextKey = canvasUiContextKeyFor(state.dataSource, state.selectedFixtureId ?? CLEAN_AGENT_WORKSPACE_ID);
    const byContext = readStoredCanvasUiStateByContext();
    byContext.states[contextKey] = state;
    globalThis.localStorage?.setItem(CANVAS_UI_STATE_BY_CONTEXT_STORAGE_KEY, JSON.stringify(byContext));
    return byContext;
  } catch {
    return null;
  }
}

export function canvasUiContextMatches(state: StoredCanvasUiState, dataSource: DataSource, selectedFixtureId: string): boolean {
  if (state.dataSource !== dataSource) return false;
  if (dataSource === "mock") {
    return (state.selectedFixtureId ?? CLEAN_AGENT_WORKSPACE_ID) === selectedFixtureId;
  }
  return true;
}

export function readStoredLiveAgentNodes(): AtlasAgentNode[] {
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

export function writeStoredLiveAgentNodes(nodes: AtlasAgentNode[]) {
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

export function readStoredLiveTaskPositions(): Map<string, { x: number; y: number }> {
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

export function writeStoredLiveTaskNodes(nodes: AtlasTaskNode[]) {
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

export function liveTaskRefreshPositions(currentNodes: AtlasTaskNode[]): Map<string, { x: number; y: number }> {
  const positions = readStoredLiveTaskPositions();
  for (const node of currentNodes) {
    positions.set(node.taskId, { x: node.position.x, y: node.position.y });
  }
  return positions;
}

export function readStoredLiveSourcePositions(): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  try {
    const raw = globalThis.localStorage?.getItem(LIVE_SOURCE_LAYOUT_STORAGE_KEY);
    if (!raw) return positions;
    const parsed = JSON.parse(raw) as { schemaVersion?: unknown; sources?: unknown };
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.sources)) return positions;
    for (const item of parsed.sources) {
      const record = item as { sourceNodeId?: unknown; position?: { x?: unknown; y?: unknown } };
      const sourceNodeId = typeof record.sourceNodeId === "string" ? record.sourceNodeId.trim() : "";
      const x = Number(record.position?.x);
      const y = Number(record.position?.y);
      if (!sourceNodeId || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      positions.set(sourceNodeId, { x, y });
    }
  } catch {}
  return positions;
}

export function writeStoredLiveSourceNodes(nodes: AtlasSourceNode[]) {
  try {
    const sources: StoredSourcePosition[] = nodes.map((node) => ({
      sourceNodeId: node.sourceNodeId,
      position: { x: node.position.x, y: node.position.y },
    }));
    globalThis.localStorage?.setItem(LIVE_SOURCE_LAYOUT_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      sources,
    }));
  } catch {}
}

export function liveSourceRefreshPositions(currentNodes: AtlasSourceNode[]): Map<string, { x: number; y: number }> {
  const positions = readStoredLiveSourcePositions();
  for (const node of currentNodes) {
    positions.set(node.sourceNodeId, { x: node.position.x, y: node.position.y });
  }
  return positions;
}
