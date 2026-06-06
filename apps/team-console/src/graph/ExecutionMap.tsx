import { useMemo, useLayoutEffect, useEffect, useRef, useState, useCallback, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { AgentRunStatus, AgentSummary, RunDetail, TeamCanvasSourceConnection, TeamCanvasSourceNode, TeamCanvasTask, TeamPlan, TaskStatus, TeamAttemptMetadata, TeamTaskState, TeamRunState, TeamTaskConnection, TeamTaskDependency, TeamTaskGroupRunStatus, TeamTaskInputPort, TeamTaskOutputPort } from "../api/team-types";
import type { ExecutionNode, NodeKind } from "./execution-map-model";
import { buildExecutionMapModel, CHILD_COLLAPSE_THRESHOLD } from "./execution-map-model";
import { layoutExecutionMap, ROOT_ID, NODE_WIDTH, straightPath, type ExecutionMapLayout } from "./execution-map-layout";
import { RUN_STATUS_LABELS, TASK_STATUS_LABELS } from "../shared/status";
import { AtlasCanvasShell, type AtlasInteractionMode, type AtlasSelectionRect, type AtlasViewport } from "./AtlasCanvasShell";
import {
  AGENT_NODE_HEIGHT,
  CANVAS_SOURCE_NODE_HEIGHT,
  canvasTaskNodeHeight,
  canvasTaskPortRowCount,
  isDiscoveryRootTask,
  atlasDragEntryHeight,
  taskNodeRect,
  rightMiddleAnchor,
  connectorAnchors,
  agentBranchConnectorPath,
  taskBranchConnectorPath,
  taskChildBranchConnectorPath,
  taskConnectionPoints,
  sourceConnectionPoints,
  type AtlasRect,
} from "./atlas-geometry";
import { linkMidpoint } from "./link-layout";
import "./execution-map.css";

const KIND_LABELS: Record<NodeKind | "collapsed" | "orphan_group", string> = {
  root: "运行",
  task: "任务",
  discovery: "发现",
  for_each: "逐项处理",
  child_for_each: "动态子任务",
  child_decomposition: "拆分子任务",
  child_prefix_fallback: "动态子任务",
  orphan: "未归属",
  collapsed: "折叠",
  orphan_group: "未归属子任务",
};

const TASK_GROUP_RUN_STATUS_LABELS: Record<"idle" | TeamTaskGroupRunStatus, string> = {
  idle: "Idle",
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  completed_with_failures: "Partial",
  failed: "Failed",
  cancelled: "Cancelled",
};

function isActiveTaskGroupRunView(groupRun: AtlasTaskGroupRunView | undefined): boolean {
  return groupRun?.status === "queued" || groupRun?.status === "running";
}

interface ExecutionMapProps {
  theme?: "light" | "dark";
  plan?: TeamPlan | null;
  run?: RunDetail | null;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  attemptsByTaskId?: Record<string, TeamAttemptMetadata[]>;
  readAttemptFile?: (runId: string, taskId: string, attemptId: string, fileName: string) => Promise<string>;
  agentNodes?: AtlasAgentNode[];
  agentsById?: Map<string, AgentSummary>;
  agentRunStatusById?: Map<string, AgentRunStatus>;
  focusedAgentNodeId?: string | null;
  onSelectAgent?: (node: AtlasAgentNode) => void;
  onMoveAgent?: (nodeId: string, position: { x: number; y: number }) => void;
  minimizedAgentNodeIds?: string[];
  onMinimizeAgent?: (node: AtlasAgentNode) => void;
  onRestoreAgent?: (node: AtlasAgentNode) => void;
  canMoveAgents?: boolean;
  agentBranchPanel?: ReactNode;
  taskNodes?: AtlasTaskNode[];
  tasksById?: Map<string, TeamCanvasTask>;
  taskConnections?: TeamTaskConnection[];
  taskConnectionDraft?: { fromTaskId: string; fromOutputPortId: string; type: string } | null;
  taskDependencies?: TeamTaskDependency[];
  taskDependencyDraft?: { fromTaskId: string } | null;
  onTaskDependencySourceSelect?: (taskId: string) => void;
  onTaskDependencyTargetSelect?: (taskId: string) => void;
  sourceNodes?: AtlasSourceNode[];
  sourceNodesById?: Map<string, TeamCanvasSourceNode>;
  sourceConnections?: TeamCanvasSourceConnection[];
  sourceConnectionDraft?: { fromSourceNodeId: string; fromOutputPortId: string; type: string } | null;
  taskRunsByTaskId?: Record<string, TeamRunState[]>;
  focusedTaskNodeId?: string | null;
  onSelectCanvasTask?: (node: AtlasTaskNode) => void;
  onMoveCanvasTask?: (nodeId: string, position: { x: number; y: number }) => void;
  minimizedTaskNodeIds?: string[];
  onMinimizeCanvasTask?: (node: AtlasTaskNode) => void;
  onRestoreCanvasTask?: (node: AtlasTaskNode) => void;
  taskGroups?: AtlasTaskGroup[];
  minimizedTaskGroupIds?: string[];
  onMinimizeTaskGroup?: (group: AtlasTaskGroup) => void;
  onRestoreTaskGroup?: (group: AtlasTaskGroup) => void;
  onToggleTaskGroup?: (groupId: string) => void;
  onToggleTaskGroupLock?: (groupId: string) => void;
  onDeleteTaskGroup?: (groupId: string) => void;
  onRunTaskGroup?: (groupId: string) => void;
  onCancelTaskGroupRun?: (groupId: string, groupRunId: string) => void;
  onAddSelectedTasksToTaskGroup?: (groupId: string) => void;
  onRemoveTaskFromTaskGroup?: (groupId: string, taskId: string) => void;
  onAtlasSelectionChange?: (entries: AtlasSelectedNodeEntry[]) => void;
  onTaskOutputPortSelect?: (taskId: string, port: TeamTaskOutputPort) => void;
  onTaskInputPortSelect?: (taskId: string, port: TeamTaskInputPort) => void;
  onMoveSourceNode?: (nodeId: string, position: { x: number; y: number }) => void;
  minimizedSourceNodeIds?: string[];
  onMinimizeSourceNode?: (node: AtlasSourceNode) => void;
  onRestoreSourceNode?: (node: AtlasSourceNode) => void;
  onSourceOutputPortSelect?: (sourceNodeId: string, port: TeamCanvasSourceNode["outputPort"]) => void;
  onSourceTextChange?: (sourceNodeId: string, text: string) => void;
  canMoveTasks?: boolean;
  canMoveSourceNodes?: boolean;
  taskBranchPanels?: Array<{
    id: string;
    nodeId: string;
    panel: ReactNode;
  }>;
  taskChildBranchPanels?: Array<{
    id: string;
    panel: ReactNode;
    width?: number;
    height?: number;
    sourceId?: string;
    interactive?: boolean;
    autoHeight?: boolean;
    resizable?: boolean;
    maximizable?: boolean;
    minWidth?: number;
    minHeight?: number;
  }>;
  viewport?: AtlasViewport;
  onViewportChange?: (viewport: AtlasViewport) => void;
  branchLayout?: AtlasBranchLayoutState;
  onBranchLayoutChange?: (layout: AtlasBranchLayoutState) => void;
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
  interactionMode?: AtlasInteractionMode;
  onRootTrashDrop?: (entries: AtlasNodeDragEntry[]) => void;
  rootNodeFilter?: "all" | "agent" | "task" | "source";
  onDeleteTaskConnection?: (connectionId: string) => void;
  onDeleteSourceConnection?: (connectionId: string) => void;
  onDeleteTaskDependency?: (dependencyId: string) => void;
  pendingDeleteConnectionId?: string | null;
  pendingDeleteSourceConnectionId?: string | null;
  pendingDeleteDependencyId?: string | null;
  discoverySummariesByTaskId?: Record<string, {
    stage?: "idle" | "discovering" | "dispatching" | "auto-running" | "aggregating" | "completed" | "cancelled";
    generatedTaskCount: number;
    activeGeneratedTaskCount: number;
    staleGeneratedTaskCount: number;
    runningGeneratedRunCount: number;
    completedGeneratedRunCount?: number;
    failedDispatchCount: number;
    dispatchProcessedCount?: number;
    latestDispatchRunId?: string;
    latestDispatchAttemptId?: string;
  }>;
}

type TaskChildBranchPanelDescriptor = NonNullable<ExecutionMapProps["taskChildBranchPanels"]>[number];

type MaximizedPanelState =
  | { kind: "agent" }
  | { kind: "task-panel"; panelId: string }
  | null;

type RenderNode = Omit<ExecutionNode, "kind"> & { kind: NodeKind | "collapsed" };

export type AtlasAgentNode = {
  nodeId: string;
  kind: "agent";
  agentId: string;
  position: { x: number; y: number };
};

export type AtlasTaskNode = {
  nodeId: string;
  kind: "canvas-task";
  taskId: string;
  position: { x: number; y: number };
};

export type AtlasTaskGroup = {
  groupId: string;
  title: string;
  taskNodeIds: string[];
  taskIds?: string[];
  headTaskIds?: string[];
  status?: "valid" | "invalid";
  validationErrors?: Array<{ code: string; message: string }>;
  members?: Array<{ taskId: string; title: string }>;
  canAddSelectedTasks?: boolean;
  collapsed: boolean;
  locked?: boolean;
  groupRun?: AtlasTaskGroupRunView;
};

type AtlasTaskGroupMemberChip = { taskId: string; title: string };
type AtlasTaskGroupMemberRow = AtlasTaskGroupMemberChip[];

export type AtlasTaskGroupRunView = {
  status: "idle" | TeamTaskGroupRunStatus;
  groupRunId?: string;
  entryCount?: number;
  observedCount?: number;
  saving?: boolean;
  blockedByActiveTask?: boolean;
};

export type AtlasSelectedNodeEntry =
  | { kind: "agent"; nodeId: string; agentId: string }
  | { kind: "task"; nodeId: string; taskId: string }
  | { kind: "source"; nodeId: string; sourceNodeId: string };

export type AtlasSourceNode = {
  nodeId: string;
  kind: "canvas-source";
  sourceNodeId: string;
  position: { x: number; y: number };
};

export type AtlasBranchLayoutState = {
  agentBranchRects?: Record<string, AtlasRect>;
  taskBranchPositions?: Record<string, { x: number; y: number }>;
  taskChildPanelPositions?: Record<string, { x: number; y: number }>;
  taskChildPanelSizes?: Record<string, { width: number; height: number }>;
};

const EVIDENCE_W = 240;
const EVIDENCE_GAP = 12;
const PREVIEW_W = 360;
const PREVIEW_GAP = 40;
const PREVIEW_FALLBACK_HEIGHT = 180;
const DOCK_FLIGHT_PHASE_DELAY_MS = 48;
const DOCK_FLIGHT_TRANSITION_MS = 240;
const DOCK_FLIGHT_SETTLE_MS = 56;
const DOCK_FLIGHT_DURATION_MS = DOCK_FLIGHT_PHASE_DELAY_MS + DOCK_FLIGHT_TRANSITION_MS + DOCK_FLIGHT_SETTLE_MS;
const DOCK_FILLED_COLLAPSE_MS = 3000;
const AGENT_BRANCH_WIDTH = 960;
const AGENT_BRANCH_HEIGHT = 680;
const AGENT_BRANCH_MIN_WIDTH = 520;
const AGENT_BRANCH_MIN_HEIGHT = 360;
const AGENT_BRANCH_GAP = 48;
const AGENT_DRAG_THRESHOLD = 4;
const TASK_MENU_BRANCH_WIDTH = 280;
const TASK_MENU_BRANCH_MIN_WIDTH = 220;
const TASK_MENU_BRANCH_HEIGHT = 190;
const TASK_CHILD_BRANCH_WIDTH = 820;
const TASK_CHILD_BRANCH_HEIGHT = 620;
const TASK_BRANCH_GAP = 48;
const TASK_CHILD_BRANCH_GAP = 32;
const TASK_GROUP_HEADER_BAND_HEIGHT = 76;
const TASK_GROUP_COLLAPSED_HEADER_BAND_HEIGHT = 42;
const TASK_GROUP_MIN_WIDTH = 560;
const TASK_GROUP_BOTTOM_PADDING = 58;
const TASK_GROUP_MEMBER_TOP = 42;
const TASK_GROUP_MEMBER_ROW_HEIGHT = 24;
const TASK_GROUP_MEMBER_ROW_GAP = 6;
const TASK_GROUP_HEADER_BOTTOM_GAP = 10;
type CopyableNodeKind = "agent" | "task" | "group";
type EvidenceKind = "result" | "error" | "attempt" | "progress" | "worker" | "checker" | "watcher";

interface EvidenceEntry {
  id: string;
  kind: EvidenceKind;
  title: string;
  content: string;
  tag?: string;
  tagClass?: string;
  path?: string;
  previewFile?: AttemptFileRef;
}

type ArtifactPreviewState =
  | { status: "loading"; fileName: string }
  | { status: "loaded"; fileName: string; content: string }
  | { status: "error"; fileName: string; message: string };

type AtlasNodeDragEntry = {
  nodeId: string;
  kind: "agent" | "task" | "source";
  startPosition: { x: number; y: number };
  height: number;
};

type CachedDomRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type AtlasDragHitTestRects = {
  dock: CachedDomRect | null;
  trash: CachedDomRect | null;
  nodes: CachedDomRect | null;
};

let atlasDragHitTestRectsCache: { pointerId: number; rects: AtlasDragHitTestRects } | null = null;

type DockFlightRootKind = "agent" | "task" | "source";

type DockFlightTaskPort = {
  id: string;
  label: string;
  type: string;
  direction: "input" | "output";
  stateClass?: string;
};

type DockFlightAnimation = {
  id: number;
  phase: "from" | "to";
  fromX: number;
  fromY: number;
  fromW: number;
  fromH: number;
  toX: number;
  toY: number;
  toW: number;
  toH: number;
  kind: "minimize" | "restore";
  rootKind: DockFlightRootKind;
  label: string;
  meta: string;
  targetNodeClass: string;
  targetState?: "idle" | "busy" | "unknown";
  targetPillClass: string;
  targetPill: string;
  targetLines: string[];
  targetTaskPorts?: {
    inputs: DockFlightTaskPort[];
    outputs: DockFlightTaskPort[];
  };
  targetTaskDepHandleClass?: string;
  contentScale: number;
};

const DOCK_FLIGHT_KIND_LABELS: Record<DockFlightRootKind, string> = {
  agent: "Agent",
  task: "Task",
  source: "Source",
};

type AtlasNodeDragState = {
  primaryNodeId: string;
  primaryKind: "agent" | "task" | "source" | "task-group";
  groupId?: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  entries: AtlasNodeDragEntry[];
  hasMoved: boolean;
  copyOnClick?: { kind: "agent" | "task"; id: string };
  lastTreeDx?: number;
  lastTreeDy?: number;
};

type AgentBranchInteractionState = {
  kind: "drag" | "resize";
  nodeId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startRect: AtlasRect;
  hasMoved?: boolean;
  capturedTarget?: HTMLDivElement | null;
};

type TaskBranchMeasuredSizeMap = Record<string, { width: number; height: number }>;

type TaskSubtreeScope = "root" | "menu" | { panelId: string };

function evidenceHeight(kind: EvidenceKind): number {
  switch (kind) {
    case "worker": return 56;
    case "checker": return 72;
    case "watcher": return 64;
    case "result": return 48;
    case "error": return 72;
    case "attempt": return 40;
    case "progress": return 56;
  }
}

type MeasuredHeights = Record<string, number>;

interface AttemptFileRef {
  taskId: string;
  attemptId: string;
  fileName: string;
}

function taskGroupHeaderBandHeight(collapsed: boolean, memberRowCount: number): number {
  if (collapsed) return TASK_GROUP_COLLAPSED_HEADER_BAND_HEIGHT;
  const memberBandHeight = memberRowCount > 0
    ? TASK_GROUP_MEMBER_TOP
      + memberRowCount * TASK_GROUP_MEMBER_ROW_HEIGHT
      + Math.max(0, memberRowCount - 1) * TASK_GROUP_MEMBER_ROW_GAP
      + TASK_GROUP_HEADER_BOTTOM_GAP
    : TASK_GROUP_HEADER_BAND_HEIGHT;
  return Math.max(TASK_GROUP_HEADER_BAND_HEIGHT, memberBandHeight);
}

function buildTaskGroupMemberRows(
  group: AtlasTaskGroup,
  nodes: AtlasTaskNode[],
  taskConnections: TeamTaskConnection[],
  tasksById: Map<string, TeamCanvasTask> | undefined,
): AtlasTaskGroupMemberRow[] {
  const memberByTaskId = new Map((group.members ?? []).map((member) => [member.taskId, member]));
  const taskIds = group.taskIds?.length
    ? group.taskIds
    : group.members?.length
      ? group.members.map((member) => member.taskId)
      : nodes.map((node) => node.taskId);
  const taskIdSet = new Set(taskIds);
  const taskIdOrder = new Map(taskIds.map((taskId, index) => [taskId, index]));
  const toMember = (taskId: string): AtlasTaskGroupMemberChip => ({
    taskId,
    title: memberByTaskId.get(taskId)?.title ?? tasksById?.get(taskId)?.title ?? taskId,
  });
  const internalConnections = taskConnections.filter((connection) => (
    connection.status !== "stale"
    && taskIdSet.has(connection.fromTaskId)
    && taskIdSet.has(connection.toTaskId)
  ));
  const incomingTaskIds = new Set(internalConnections.map((connection) => connection.toTaskId));
  const outgoingByTaskId = new Map<string, TeamTaskConnection[]>();
  for (const connection of internalConnections) {
    const outgoing = outgoingByTaskId.get(connection.fromTaskId) ?? [];
    outgoing.push(connection);
    outgoingByTaskId.set(connection.fromTaskId, outgoing);
  }
  for (const outgoing of outgoingByTaskId.values()) {
    outgoing.sort((a, b) => (taskIdOrder.get(a.toTaskId) ?? Number.MAX_SAFE_INTEGER) - (taskIdOrder.get(b.toTaskId) ?? Number.MAX_SAFE_INTEGER));
  }

  const validHeadTaskIds = (group.headTaskIds ?? []).filter((taskId) => taskIdSet.has(taskId));
  const derivedHeadTaskIds = taskIds.filter((taskId) => !incomingTaskIds.has(taskId));
  const headTaskIds = validHeadTaskIds.length > 0
    ? validHeadTaskIds
    : derivedHeadTaskIds.length > 0
      ? derivedHeadTaskIds
      : taskIds.slice(0, 1);
  const visitedTaskIds = new Set<string>();
  const rows: AtlasTaskGroupMemberRow[] = [];
  for (const headTaskId of headTaskIds) {
    const row: AtlasTaskGroupMemberRow = [];
    const rowVisitedTaskIds = new Set<string>();
    let currentTaskId: string | undefined = headTaskId;
    while (currentTaskId && taskIdSet.has(currentTaskId) && !rowVisitedTaskIds.has(currentTaskId)) {
      row.push(toMember(currentTaskId));
      rowVisitedTaskIds.add(currentTaskId);
      visitedTaskIds.add(currentTaskId);
      const nextConnection: TeamTaskConnection | undefined = (outgoingByTaskId.get(currentTaskId) ?? []).find((connection) => !rowVisitedTaskIds.has(connection.toTaskId));
      currentTaskId = nextConnection?.toTaskId;
    }
    if (row.length > 0) rows.push(row);
  }

  const fallbackRow = taskIds
    .filter((taskId) => !visitedTaskIds.has(taskId))
    .map(toMember);
  if (fallbackRow.length > 0) rows.push(fallbackRow);
  return rows;
}

function statusClass(status: TaskStatus | RunDetail["status"]): string {
  switch (status) {
    case "running": case "queued": return "status-running";
    case "pending": return "status-pending";
    case "succeeded": case "completed": return "status-succeeded";
    case "failed": return "status-failed";
    case "paused": case "interrupted": return "status-paused";
    case "cancelled": case "skipped": return "status-dimmed";
    case "completed_with_failures": return "status-paused";
    default: return "";
  }
}

async function copyPlainText(text: string): Promise<boolean> {
  const clipboard = globalThis.navigator?.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the textarea fallback for non-secure local origins.
    }
  }

  const doc = globalThis.document;
  if (!doc?.body) return false;
  const textarea = doc.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("data-copy-fallback", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  doc.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return Boolean(doc.execCommand?.("copy"));
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

function selectLatestCanvasTaskRun(runs: TeamRunState[] | undefined): TeamRunState | null {
  if (!runs?.length) return null;
  return runs.reduce((latest, run) => {
    const latestTime = Date.parse(latest.createdAt);
    const runTime = Date.parse(run.createdAt);
    if (!Number.isFinite(runTime)) return latest;
    if (!Number.isFinite(latestTime)) return run;
    return runTime >= latestTime ? run : latest;
  }, runs[0]);
}

type DiscoveryStage = "idle" | "discovering" | "dispatching" | "auto-running" | "aggregating" | "completed" | "cancelled";

function discoveryStageLabel(stage: DiscoveryStage | undefined): string {
  switch (stage) {
    case "discovering": return "Discovery";
    case "dispatching": return "Dispatch";
    case "auto-running": return "Auto-run";
    case "aggregating": return "Aggregation";
    case "completed": return "Aggregation";
    case "cancelled": return "Cancelled";
    default: return "Idle";
  }
}

function createEmptyLayout(): ExecutionMapLayout {
  return {
    rootNode: { nodeId: ROOT_ID, x: 0, y: 0, width: NODE_WIDTH, height: 56 },
    mainTaskNodes: [],
    orphanNodes: [],
    collapsedNodes: [],
    nodePositions: new Map(),
    links: [],
  };
}

function formatAgentBinding(agent: AgentSummary): string {
  const model = agent.defaultModelProvider && agent.defaultModelId
    ? `${agent.defaultModelProvider}/${agent.defaultModelId}`
    : "model default";
  const browser = agent.defaultBrowserId ? `browser ${agent.defaultBrowserId}` : "browser default";
  return `${model} · ${browser}`;
}

function formatAgentRunStatus(status: AgentRunStatus | undefined): {
  state: "idle" | "busy" | "unknown";
  label: string;
  nodeClass: string;
  pillClass: string;
  title?: string;
} {
  if (status?.status === "busy") {
    return {
      state: "busy",
      label: "运行中",
      nodeClass: "status-running",
      pillClass: "running",
      title: status.activeConversationId
        ? `运行中 · ${status.activeConversationId}`
        : "运行中",
    };
  }
  if (status?.status === "idle") {
    return {
      state: "idle",
      label: "空闲",
      nodeClass: "status-succeeded",
      pillClass: "succeeded",
      title: "空闲",
    };
  }
  return {
    state: "unknown",
    label: "状态未知",
    nodeClass: "status-pending",
    pillClass: "pending",
    title: "状态未知",
  };
}

function targetToElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node && target.parentElement) return target.parentElement;
  return null;
}

function canStartAgentBranchDrag(target: EventTarget | null): boolean {
  const el = targetToElement(target);
  if (!el) return false;
  if (!el.closest(".agent-playground-branch-head") && !el.closest(".task-leader-branch-head")) return false;
  return !el.closest("button, input, textarea, select, a, iframe, summary, details");
}

function canTogglePanelMaximize(target: EventTarget | null): boolean {
  const el = targetToElement(target);
  if (!el) return false;
  if (
    !el.closest(".agent-playground-branch-head")
    && !el.closest(".task-leader-branch-head")
    && !el.closest(".emap-observer-node-head")
  ) {
    return false;
  }
  return !el.closest("button, input, textarea, select, a, iframe, summary, details, .emap-panel-resize-handle, .emap-agent-branch-resize-handle");
}

function viewportScale(viewport: AtlasViewport | undefined): number {
  return viewport && Number.isFinite(viewport.scale) && viewport.scale > 0 ? viewport.scale : 1;
}

function clampAtlasRect(rect: AtlasRect): AtlasRect {
  return {
    x: rect.x,
    y: rect.y,
    width: Math.max(AGENT_BRANCH_MIN_WIDTH, rect.width),
    height: Math.max(AGENT_BRANCH_MIN_HEIGHT, rect.height),
  };
}

function atlasSelectionKey(kind: "agent" | "task" | "source", nodeId: string): string {
  return `${kind}:${nodeId}`;
}

function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function pointInDomRect(x: number, y: number, rect: Pick<DOMRect, "left" | "right" | "top" | "bottom">): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function domRectToRect(rect: Pick<DOMRect, "left" | "top" | "width" | "height">): AtlasRect {
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function cacheDomRect(element: HTMLElement | null, options: { allowZeroSize?: boolean } = {}): CachedDomRect | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const width = Number.isFinite(rect.width) ? rect.width : 0;
  const height = Number.isFinite(rect.height) ? rect.height : 0;
  if (!options.allowZeroSize && (width <= 0 || height <= 0)) {
    return null;
  }
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width,
    height,
  };
}

function renderConnectorSourceSocket(
  key: string,
  source: { x: number; y: number },
  className = "",
): ReactNode {
  const r = 6;
  return (
    <g key={key} className={`emap-connector-sockets ${className}`} aria-hidden="true">
      <path
        className="emap-connector-source-socket"
        d={`M${source.x},${source.y - r} A${r},${r} 0 0 1 ${source.x},${source.y + r}`}
      />
    </g>
  );
}

function taskMenuPanelId(nodeId: string): string {
  return `task-menu-${nodeId}`;
}

function taskPortLabel(port: TeamTaskInputPort | TeamTaskOutputPort): string {
  return port.label?.trim() || port.id;
}

function sourcePortLabel(port: TeamCanvasSourceNode["outputPort"]): string {
  return port.label?.trim() || port.id;
}

function TaskDependencyHandleIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="8" cy="8" r="4.5" />
      <line x1="8" y1="0" x2="8" y2="3" />
      <line x1="8" y1="13" x2="8" y2="16" />
      <line x1="0" y1="8" x2="3" y2="8" />
      <line x1="13" y1="8" x2="16" y2="8" />
    </svg>
  );
}

export function summarizeCollapsedTaskStatus(children: Pick<ExecutionNode, "status">[]): TaskStatus {
  const statuses = children.map((child) => child.status);
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("interrupted")) return "interrupted";
  if (statuses.includes("running")) return "running";
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("cancelled")) return "cancelled";
  if (statuses.includes("skipped")) return "skipped";
  return "succeeded";
}

function extractFilename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function parseAttemptFileRef(path: string | undefined): AttemptFileRef | null {
  if (!path) return null;
  const match = /^tasks\/([^/]+)\/attempts\/([^/]+)\/([^/]+)$/.exec(path);
  if (!match) return null;
  const [, taskId, attemptId, fileName] = match;
  if (!taskId || !attemptId || !fileName) return null;
  return { taskId, attemptId, fileName };
}

function previewFileFromAttempt(attempt: TeamAttemptMetadata, path: string | undefined): AttemptFileRef | undefined {
  const parsed = parseAttemptFileRef(path);
  if (!parsed) return undefined;
  if (parsed.taskId !== attempt.taskId || parsed.attemptId !== attempt.attemptId) return undefined;
  return attempt.files.includes(parsed.fileName) ? parsed : undefined;
}

function measureObservedLayoutHeight(fallback: number, entry?: ResizeObserverEntry): number {
  const borderBox = entry?.borderBoxSize;
  const borderBoxSize = Array.isArray(borderBox) ? borderBox[0] : borderBox;
  const borderBoxHeight = Math.round(borderBoxSize?.blockSize ?? 0);
  if (Number.isFinite(borderBoxHeight) && borderBoxHeight > 0) return borderBoxHeight;

  const contentHeight = Math.round(entry?.contentRect.height ?? 0);
  if (Number.isFinite(contentHeight) && contentHeight > 0) return contentHeight;

  return fallback;
}

function measureFallbackLayoutHeight(node: HTMLElement, fallback: number): number {
  const offsetHeight = Math.round(node.offsetHeight);
  if (Number.isFinite(offsetHeight) && offsetHeight > 0) return offsetHeight;

  const scrollHeight = Math.round(node.scrollHeight);
  if (Number.isFinite(scrollHeight) && scrollHeight > 0) return scrollHeight;

  return fallback;
}

function straightSegmentPath(sx: number, sy: number, tx: number, ty: number): string {
  return `M${sx},${sy} L${tx},${ty}`;
}

function artifactTypeLabel(filename: string): string {
  if (filename.includes("accepted")) return "已接受";
  if (filename.includes("failed")) return "失败";
  return "结果";
}

function resultArtifactTitle(filename: string): string {
  if (filename.includes("failed")) return "失败结果";
  if (filename.includes("discovery")) return "发现结果";
  return "最终结果";
}

function verdictLabel(verdict: string): string {
  if (verdict === "pass") return "通过";
  if (verdict === "revise") return "需修改";
  if (verdict === "fail") return "失败";
  return verdict;
}

function verdictTagClass(verdict: string): string {
  if (verdict === "pass") return "tag-accepted";
  if (verdict === "fail") return "tag-failed";
  return "tag-result";
}

function watcherDecisionLabel(decision: string): string {
  if (decision === "accept_task") return "接受";
  if (decision === "confirm_failed") return "确认失败";
  if (decision === "request_revision") return "要求重做";
  return decision;
}

function formatJsonPreview(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

function previewKind(fileName: string): "json" | "html" | "text" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  return "text";
}

function renderPreviewContent(state: ArtifactPreviewState) {
  if (state.status === "loading") {
    return <div className="emap-artifact-preview-message">正在加载预览...</div>;
  }
  if (state.status === "error") {
    return <div className="emap-artifact-preview-message error">加载失败: {state.message}</div>;
  }

  const kind = previewKind(state.fileName);
  if (kind === "json") {
    return <pre className="emap-artifact-preview-text">{formatJsonPreview(state.content)}</pre>;
  }
  if (kind === "html") {
    return (
      <div className="emap-artifact-preview-html">
        <iframe className="emap-artifact-iframe" title={`HTML preview: ${state.fileName}`} sandbox="" srcDoc={state.content} />
        <details className="emap-artifact-source">
          <summary>查看源码</summary>
          <pre>{state.content}</pre>
        </details>
      </div>
    );
  }
  return <pre className="emap-artifact-preview-text">{state.content}</pre>;
}

function isFinalReportTask(taskId: string, taskTitle: string, planTasks: TeamPlan["tasks"]): boolean {
  const lastTask = planTasks[planTasks.length - 1];
  if (!lastTask || lastTask.id !== taskId) return false;
  return /汇总|报告|report|assemble/i.test(taskTitle + taskId);
}

function selectDisplayAttempt(state: TeamTaskState | undefined, attempts: TeamAttemptMetadata[]): TeamAttemptMetadata | null {
  if (attempts.length === 0) return null;
  const active = state?.activeAttemptId
    ? attempts.find((attempt) => attempt.attemptId === state.activeAttemptId)
    : undefined;
  if (active) return active;
  return attempts.reduce((latest, attempt) => {
    const latestTime = Date.parse(latest.updatedAt || latest.createdAt);
    const attemptTime = Date.parse(attempt.updatedAt || attempt.createdAt);
    if (!Number.isFinite(attemptTime)) return latest;
    if (!Number.isFinite(latestTime)) return attempt;
    return attemptTime >= latestTime ? attempt : latest;
  }, attempts[0]);
}

export function buildArtifactBranches(
  node: ExecutionNode,
  state: TeamTaskState | undefined,
  attempts: TeamAttemptMetadata[],
): EvidenceEntry[] {
  const attempt = selectDisplayAttempt(state, attempts);
  if (!attempt) return [];

  const entries: EvidenceEntry[] = [];

  if (attempt.resultRef) {
    const filename = extractFilename(attempt.resultRef);
    entries.push({
      id: `artifact__result__${node.taskId}__${attempt.attemptId}`,
      kind: "result",
      title: resultArtifactTitle(filename),
      content: filename,
      tag: filename,
      tagClass: filename.includes("failed") ? "tag-failed" : filename.includes("accepted") ? "tag-accepted" : "tag-result",
      path: attempt.resultRef,
      previewFile: previewFileFromAttempt(attempt, attempt.resultRef),
    });
  }

  attempt.worker.forEach((worker, index) => {
    if (!worker.outputRef) return;
    entries.push({
      id: `artifact__worker__${node.taskId}__${attempt.attemptId}__${index}`,
      kind: "worker",
      title: `Worker 输出 ${worker.outputIndex || index + 1}`,
      content: extractFilename(worker.outputRef),
      tag: `输出 ${worker.outputIndex || index + 1}`,
      tagClass: "tag-result",
      path: worker.outputRef,
      previewFile: previewFileFromAttempt(attempt, worker.outputRef),
    });
  });

  attempt.checker.forEach((checker, index) => {
    const path = checker.recordRef ?? checker.resultContentRef ?? checker.feedbackRef ?? undefined;
    if (!path && !checker.reason && !checker.feedback) return;
    entries.push({
      id: `artifact__checker__${node.taskId}__${attempt.attemptId}__${index}`,
      kind: "checker",
      title: `Checker 验收 ${checker.revisionIndex || index + 1}`,
      content: checker.reason || checker.feedback || "",
      tag: verdictLabel(checker.verdict),
      tagClass: verdictTagClass(checker.verdict),
      path,
      previewFile: previewFileFromAttempt(attempt, path),
    });
  });

  if (attempt.watcher && (attempt.watcher.recordRef || attempt.watcher.reason || attempt.watcher.feedback)) {
    entries.push({
      id: `artifact__watcher__${node.taskId}__${attempt.attemptId}`,
      kind: "watcher",
      title: "Watcher 复盘",
      content: attempt.watcher.reason || attempt.watcher.feedback || "",
      tag: watcherDecisionLabel(attempt.watcher.decision),
      tagClass: attempt.watcher.decision === "accept_task" ? "tag-accepted" : attempt.watcher.decision === "confirm_failed" ? "tag-failed" : "tag-result",
      path: attempt.watcher.recordRef ?? undefined,
      previewFile: previewFileFromAttempt(attempt, attempt.watcher.recordRef ?? undefined),
    });
  }

  const errorSummary = state?.errorSummary ?? attempt.errorSummary;
  if (errorSummary) {
    entries.push({
      id: `artifact__error__${node.taskId}__${attempt.attemptId}`,
      kind: "error",
      title: "错误摘要",
      content: errorSummary,
    });
  }

  return entries;
}

export function ExecutionMap({
  theme = "light",
  plan,
  run,
  selectedTaskId,
  onSelectTask,
  attemptsByTaskId = {},
  readAttemptFile,
  agentNodes = [],
  agentsById,
  agentRunStatusById,
  focusedAgentNodeId,
  onSelectAgent,
  onMoveAgent,
  minimizedAgentNodeIds = [],
  onMinimizeAgent,
  onRestoreAgent,
  canMoveAgents = true,
  agentBranchPanel,
  taskNodes = [],
  tasksById,
  taskConnections = [],
  taskConnectionDraft = null,
  taskDependencies = [],
  taskDependencyDraft = null,
  onTaskDependencySourceSelect,
  onTaskDependencyTargetSelect,
  sourceNodes = [],
  sourceNodesById,
  sourceConnections = [],
  sourceConnectionDraft = null,
  taskRunsByTaskId = {},
  focusedTaskNodeId,
  onSelectCanvasTask,
  onMoveCanvasTask,
  minimizedTaskNodeIds = [],
  onMinimizeCanvasTask,
  onRestoreCanvasTask,
  taskGroups = [],
  minimizedTaskGroupIds = [],
  onMinimizeTaskGroup,
  onRestoreTaskGroup,
  onToggleTaskGroup,
  onToggleTaskGroupLock,
  onDeleteTaskGroup,
  onRunTaskGroup,
  onCancelTaskGroupRun,
  onAddSelectedTasksToTaskGroup,
  onRemoveTaskFromTaskGroup,
  onAtlasSelectionChange,
  onTaskOutputPortSelect,
  onTaskInputPortSelect,
  onMoveSourceNode,
  minimizedSourceNodeIds = [],
  onMinimizeSourceNode,
  onRestoreSourceNode,
  onSourceOutputPortSelect,
  onSourceTextChange,
  canMoveTasks = true,
  canMoveSourceNodes = true,
  taskBranchPanels,
  taskChildBranchPanels,
  viewport,
  onViewportChange,
  branchLayout,
  onBranchLayoutChange,
  toolbarStart,
  toolbarEnd,
  interactionMode = "free",
  onRootTrashDrop,
  rootNodeFilter = "all",
  onDeleteTaskConnection,
  onDeleteSourceConnection,
  onDeleteTaskDependency,
  pendingDeleteConnectionId,
  pendingDeleteSourceConnectionId,
  pendingDeleteDependencyId,
  discoverySummariesByTaskId = {},
}: ExecutionMapProps) {
  const evidenceContainerRef = useRef<HTMLDivElement | null>(null);
  const [measuredHeights, setMeasuredHeights] = useState<MeasuredHeights>({});
  const [previewHeights, setPreviewHeights] = useState<MeasuredHeights>({});
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [artifactPreviewState, setArtifactPreviewState] = useState<Record<string, ArtifactPreviewState>>({});
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [agentBranchRects, setAtlasRects] = useState<Record<string, AtlasRect>>(() => branchLayout?.agentBranchRects ?? {});
  const [taskBranchMeasuredSizes, setTaskBranchMeasuredSizes] = useState<TaskBranchMeasuredSizeMap>({});
  const [selectedAtlasNodeKeys, setSelectedAtlasNodeKeys] = useState<Set<string>>(new Set());
  const [rootDropTarget, setRootDropTarget] = useState<"dock" | "trash" | null>(null);
  const [isAtlasDragging, setIsAtlasDragging] = useState(false);
  const [isDockExpanded, setIsDockExpanded] = useState(false);
  const [hoveredLinkCutKey, setHoveredLinkCutKey] = useState<string | null>(null);
  const [flightAnimation, setFlightAnimation] = useState<DockFlightAnimation | null>(null);
  const [maximizedBranch, setMaximizedBranch] = useState<MaximizedPanelState>(null);
  const [panelSizeOverrides, setPanelSizeOverrides] = useState<Record<string, { width: number; height: number }>>(() => branchLayout?.taskChildPanelSizes ?? {});
  const [panelPositionOverrides, setPanelPositionOverrides] = useState<Record<string, { x: number; y: number }>>(() => branchLayout?.taskChildPanelPositions ?? {});
  const [taskBranchPositionOverrides, setTaskBranchPositionOverrides] = useState<Record<string, { x: number; y: number }>>(() => branchLayout?.taskBranchPositions ?? {});
  const [panelMeasuredHeights, setPanelMeasuredHeights] = useState<Record<string, number>>({});
  const [pendingRestoreRootKeys, setPendingRestoreRootKeys] = useState<Set<string>>(new Set());
  const [nodeIdCopyState, setNodeIdCopyState] = useState<{ key: string; status: "copied" | "failed" } | null>(null);
  const prevSelectionRef = useRef<string | null>(null);
  const flightIdRef = useRef(0);
  const flightTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const flightPhaseTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const dockIdleTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const nodeIdCopyTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const dockDragHitRef = useRef(false);
  const taskBranchShellRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const atlasNodeDragRef = useRef<AtlasNodeDragState | null>(null);
  const dockRef = useRef<HTMLElement | null>(null);
  const dockItemsRef = useRef<HTMLDivElement | null>(null);
  const trashRef = useRef<HTMLDivElement | null>(null);
  const pendingNodeIdCopyPointerRef = useRef<{ pointerId: number; kind: "agent" | "task"; id: string } | null>(null);
  const suppressAgentClickRef = useRef<string | null>(null);
  const suppressTaskClickRef = useRef<string | null>(null);
  const suppressTaskGroupClickRef = useRef<string | null>(null);
  const agentBranchInteractionRef = useRef<AgentBranchInteractionState | null>(null);
  const agentBranchDragSuppressClickRef = useRef(false);
  const panelResizeRef = useRef<{ panelId: string; pointerId: number; startClientX: number; startClientY: number; startWidth: number; startHeight: number; minWidth: number; minHeight: number } | null>(null);
  const panelDragRef = useRef<{ panelId: string; pointerId: number; startClientX: number; startClientY: number; startRect: AtlasRect; hasMoved: boolean; capturedTarget: HTMLDivElement | null; lastDx: number; lastDy: number } | null>(null);
  const panelDragSuppressClickRef = useRef(false);
  const taskBranchDragRef = useRef<{ nodeId: string; pointerId: number; startClientX: number; startClientY: number; startRect: AtlasRect; hasMoved: boolean; capturedTarget: HTMLDivElement | null; lastDx: number; lastDy: number } | null>(null);
  const taskBranchDragSuppressClickRef = useRef(false);
  const translateTaskSubtreeRef = useRef<(scope: TaskSubtreeScope, dx: number, dy: number, nodeId?: string) => void>(() => {});
  const hasTaskBranchTree = Boolean(taskBranchPanels?.length);
  const minimizedAgentNodeIdSet = useMemo(() => new Set(minimizedAgentNodeIds), [minimizedAgentNodeIds]);
  const minimizedTaskNodeIdSet = useMemo(() => new Set(minimizedTaskNodeIds), [minimizedTaskNodeIds]);
  const minimizedSourceNodeIdSet = useMemo(() => new Set(minimizedSourceNodeIds), [minimizedSourceNodeIds]);
  const minimizedTaskGroupIdSet = useMemo(() => new Set(minimizedTaskGroupIds), [minimizedTaskGroupIds]);
  const activeTaskGroups = useMemo(
    () => taskGroups.filter((group) => !minimizedTaskGroupIdSet.has(group.groupId)),
    [minimizedTaskGroupIdSet, taskGroups],
  );
  const hubTaskGroups = useMemo(
    () => taskGroups.filter((group) => minimizedTaskGroupIdSet.has(group.groupId)),
    [minimizedTaskGroupIdSet, taskGroups],
  );
  const groupedTaskNodeIdSet = useMemo(() => {
    const nodeIds = new Set<string>();
    for (const group of activeTaskGroups) {
      for (const nodeId of group.taskNodeIds) nodeIds.add(nodeId);
    }
    return nodeIds;
  }, [activeTaskGroups]);
  const unfilteredVisibleAgentNodes = useMemo(
    () => agentNodes.filter((node) => !minimizedAgentNodeIdSet.has(node.nodeId)),
    [agentNodes, minimizedAgentNodeIdSet],
  );
  const unfilteredVisibleTaskNodes = useMemo(
    () => taskNodes.filter((node) => !minimizedTaskNodeIdSet.has(node.nodeId)),
    [minimizedTaskNodeIdSet, taskNodes],
  );
  const unfilteredVisibleSourceNodes = useMemo(
    () => sourceNodes.filter((node) => !minimizedSourceNodeIdSet.has(node.nodeId)),
    [minimizedSourceNodeIdSet, sourceNodes],
  );
  const showAgents = rootNodeFilter === "all" || rootNodeFilter === "agent";
  const showTasks = rootNodeFilter === "all" || rootNodeFilter === "task";
  const showSources = rootNodeFilter === "all" || rootNodeFilter === "source";
  const collapsedTaskGroupNodeIdSet = useMemo(() => {
    const nodeIds = new Set<string>();
    for (const group of taskGroups) {
      if (!group.collapsed && !minimizedTaskGroupIdSet.has(group.groupId)) continue;
      for (const nodeId of group.taskNodeIds) {
        nodeIds.add(nodeId);
      }
    }
    return nodeIds;
  }, [minimizedTaskGroupIdSet, taskGroups]);
  const lockedTaskGroupNodeIdSet = useMemo(() => {
    const nodeIds = new Set<string>();
    for (const group of taskGroups) {
      if (!group.locked) continue;
      for (const nodeId of group.taskNodeIds) {
        nodeIds.add(nodeId);
      }
    }
    return nodeIds;
  }, [taskGroups]);
  const visibleAgentNodes = useMemo(
    () => showAgents ? unfilteredVisibleAgentNodes : [],
    [showAgents, unfilteredVisibleAgentNodes],
  );
  const visibleTaskNodes = useMemo(
    () => showTasks ? unfilteredVisibleTaskNodes.filter((node) => !collapsedTaskGroupNodeIdSet.has(node.nodeId)) : [],
    [collapsedTaskGroupNodeIdSet, showTasks, unfilteredVisibleTaskNodes],
  );
  const visibleSourceNodes = useMemo(
    () => showSources ? unfilteredVisibleSourceNodes : [],
    [showSources, unfilteredVisibleSourceNodes],
  );
  const hubAgentNodes = useMemo(
    () => agentNodes.filter((node) => minimizedAgentNodeIdSet.has(node.nodeId)),
    [agentNodes, minimizedAgentNodeIdSet],
  );
  const hubTaskNodes = useMemo(
    () => taskNodes.filter((node) => minimizedTaskNodeIdSet.has(node.nodeId)),
    [minimizedTaskNodeIdSet, taskNodes],
  );
  const hubSourceNodes = useMemo(
    () => sourceNodes.filter((node) => minimizedSourceNodeIdSet.has(node.nodeId)),
    [minimizedSourceNodeIdSet, sourceNodes],
  );
  const dockNodeCount = hubAgentNodes.length + hubTaskNodes.length + hubSourceNodes.length + hubTaskGroups.length;
  const [dockPageState, setDockPageState] = useState({ canPageLeft: false, canPageRight: false });

  const updateDockPageState = useCallback(() => {
    const el = dockItemsRef.current;
    if (!el) {
      setDockPageState({ canPageLeft: false, canPageRight: false });
      return;
    }
    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    const canPageLeft = el.scrollLeft > 1;
    const canPageRight = el.scrollLeft < maxScrollLeft - 1;
    setDockPageState((current) => (
      current.canPageLeft === canPageLeft && current.canPageRight === canPageRight
        ? current
        : { canPageLeft, canPageRight }
    ));
  }, []);

  const pageDock = useCallback((direction: "left" | "right") => {
    const el = dockItemsRef.current;
    if (!el) return;
    const pageWidth = Math.max(120, Math.floor(el.clientWidth * 0.82));
    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    el.scrollLeft = Math.max(
      0,
      Math.min(maxScrollLeft, el.scrollLeft + (direction === "left" ? -pageWidth : pageWidth)),
    );
    updateDockPageState();
  }, [updateDockPageState]);

  const clearDockIdleTimer = useCallback(() => {
    if (dockIdleTimerRef.current != null) {
      globalThis.clearTimeout(dockIdleTimerRef.current);
      dockIdleTimerRef.current = null;
    }
  }, []);

  const scheduleDockCollapse = useCallback((nodeCount = dockNodeCount) => {
    clearDockIdleTimer();
    if (nodeCount === 0) {
      setIsDockExpanded(false);
      return;
    }
    dockIdleTimerRef.current = globalThis.setTimeout(() => {
      dockIdleTimerRef.current = null;
      setIsDockExpanded(false);
    }, DOCK_FILLED_COLLAPSE_MS);
  }, [clearDockIdleTimer, dockNodeCount]);

  const wakeDock = useCallback(() => {
    clearDockIdleTimer();
    setIsDockExpanded(true);
  }, [clearDockIdleTimer]);

  useEffect(() => {
    const frame = globalThis.requestAnimationFrame?.(() => {
      updateDockPageState();
    });
    return () => {
      if (frame != null) {
        globalThis.cancelAnimationFrame?.(frame);
      }
    };
  }, [dockNodeCount, isDockExpanded, updateDockPageState]);

  useLayoutEffect(() => {
    if (!branchLayout) return;
    const nextAgentRects = branchLayout.agentBranchRects ?? {};
    const nextTaskBranchPositions = branchLayout.taskBranchPositions ?? {};
    const nextPanelPositions = branchLayout.taskChildPanelPositions ?? {};
    const nextPanelSizes = branchLayout.taskChildPanelSizes ?? {};
    setAtlasRects((current) => JSON.stringify(current) === JSON.stringify(nextAgentRects) ? current : nextAgentRects);
    setTaskBranchPositionOverrides((current) => JSON.stringify(current) === JSON.stringify(nextTaskBranchPositions) ? current : nextTaskBranchPositions);
    setPanelPositionOverrides((current) => JSON.stringify(current) === JSON.stringify(nextPanelPositions) ? current : nextPanelPositions);
    setPanelSizeOverrides((current) => JSON.stringify(current) === JSON.stringify(nextPanelSizes) ? current : nextPanelSizes);
  }, [branchLayout]);

  useLayoutEffect(() => {
    onBranchLayoutChange?.({
      agentBranchRects,
      taskBranchPositions: taskBranchPositionOverrides,
      taskChildPanelPositions: panelPositionOverrides,
      taskChildPanelSizes: panelSizeOverrides,
    });
  }, [agentBranchRects, onBranchLayoutChange, panelPositionOverrides, panelSizeOverrides, taskBranchPositionOverrides]);

  const revealLinkCut = useCallback((key: string) => {
    setHoveredLinkCutKey(key);
  }, []);

  const hideLinkCut = useCallback((key: string) => {
    setHoveredLinkCutKey((currentKey) => (currentKey === key ? null : currentKey));
  }, []);

  const clearNodeIdCopyTimer = useCallback(() => {
    if (nodeIdCopyTimerRef.current != null) {
      globalThis.clearTimeout(nodeIdCopyTimerRef.current);
      nodeIdCopyTimerRef.current = null;
    }
  }, []);

  const copyCanvasNodeId = useCallback(async (kind: CopyableNodeKind, id: string) => {
    const key = `${kind}:${id}`;
    const copied = await copyPlainText(id);
    clearNodeIdCopyTimer();
    setNodeIdCopyState({ key, status: copied ? "copied" : "failed" });
    nodeIdCopyTimerRef.current = globalThis.setTimeout(() => {
      nodeIdCopyTimerRef.current = null;
      setNodeIdCopyState((current) => (current?.key === key ? null : current));
    }, 1400);
  }, [clearNodeIdCopyTimer]);

  const renderNodeIdCopyButton = (kind: CopyableNodeKind, id: string): ReactNode => {
    const key = `${kind}:${id}`;
    const state = nodeIdCopyState?.key === key ? nodeIdCopyState.status : null;
    const label = kind === "agent" ? "Agent ID" : kind === "task" ? "Task ID" : "Group ID";
    return (
      <button
        type="button"
        className={`emap-node-id-copy${state ? ` is-${state}` : ""}`}
        aria-label={`复制 ${label} ${id}`}
        title={`复制 ${id}`}
        onPointerDownCapture={(event) => {
          if (kind === "group") {
            event.stopPropagation();
            return;
          }
          pendingNodeIdCopyPointerRef.current = { pointerId: event.pointerId, kind, id };
        }}
        onKeyDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          void copyCanvasNodeId(kind, id);
        }}
      >
        <code>{state === "copied" ? "已复制" : state === "failed" ? "失败" : id}</code>
      </button>
    );
  };

  const syncHoveredLinkCutFromPoint = useCallback((clientX: number, clientY: number) => {
    const elements = globalThis.document?.elementsFromPoint?.(clientX, clientY) ?? [];
    const linkCutElement = elements.find((element) => element.hasAttribute("data-link-cut-key") || element.hasAttribute("data-link-cut-button-key"));
    const nextKey = linkCutElement?.getAttribute("data-link-cut-key") ?? linkCutElement?.getAttribute("data-link-cut-button-key") ?? null;
    setHoveredLinkCutKey((currentKey) => (currentKey === nextKey ? currentKey : nextKey));
  }, []);

  useLayoutEffect(() => () => {
    clearDockIdleTimer();
    clearNodeIdCopyTimer();
  }, [clearDockIdleTimer, clearNodeIdCopyTimer]);

  useLayoutEffect(() => {
    const handleLinkCutPointerMove = (event: PointerEvent | MouseEvent) => {
      syncHoveredLinkCutFromPoint(event.clientX, event.clientY);
    };

    globalThis.addEventListener("pointermove", handleLinkCutPointerMove);
    globalThis.addEventListener("mousemove", handleLinkCutPointerMove);
    return () => {
      globalThis.removeEventListener("pointermove", handleLinkCutPointerMove);
      globalThis.removeEventListener("mousemove", handleLinkCutPointerMove);
    };
  }, [syncHoveredLinkCutFromPoint]);

  useLayoutEffect(() => {
    if (!isDockExpanded) return undefined;

    const handleDockPointerPosition = (event: PointerEvent | MouseEvent) => {
      const dock = dockRef.current;
      if (!dock) return;
      const rect = dock.getBoundingClientRect();
      const isInsideDock = event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (isInsideDock) {
        clearDockIdleTimer();
        return;
      }
      if (dockDragHitRef.current) {
        clearDockIdleTimer();
        return;
      }
      if (dockIdleTimerRef.current == null || dockNodeCount === 0) {
        scheduleDockCollapse(dockNodeCount);
      }
    };

    globalThis.addEventListener("pointermove", handleDockPointerPosition);
    globalThis.addEventListener("mousemove", handleDockPointerPosition);
    return () => {
      globalThis.removeEventListener("pointermove", handleDockPointerPosition);
      globalThis.removeEventListener("mousemove", handleDockPointerPosition);
    };
  }, [clearDockIdleTimer, dockNodeCount, isDockExpanded, scheduleDockCollapse]);

  const hasActiveTaskLayoutInteraction = () => {
    const atlasDrag = atlasNodeDragRef.current;
    return Boolean(
      taskBranchDragRef.current
      || panelDragRef.current
      || panelResizeRef.current
      || atlasDrag?.entries.some((entry) => entry.kind === "task" || entry.kind === "source"),
    );
  };

  if (prevSelectionRef.current !== selectedTaskId) {
    prevSelectionRef.current = selectedTaskId;
    if (Object.keys(measuredHeights).length > 0) {
      setMeasuredHeights({});
    }
    if (Object.keys(previewHeights).length > 0) {
      setPreviewHeights({});
    }
    if (selectedArtifactId) {
      setSelectedArtifactId(null);
    }
    if (Object.keys(artifactPreviewState).length > 0) {
      setArtifactPreviewState({});
    }
  }

  useLayoutEffect(() => {
    const validKeys = new Set([
      ...visibleAgentNodes.map((node) => atlasSelectionKey("agent", node.nodeId)),
      ...visibleTaskNodes.map((node) => atlasSelectionKey("task", node.nodeId)),
      ...visibleSourceNodes.map((node) => atlasSelectionKey("source", node.nodeId)),
    ]);
    setSelectedAtlasNodeKeys((current) => {
      const next = new Set([...current].filter((key) => validKeys.has(key)));
      const unchanged = next.size === current.size && [...next].every((key) => current.has(key));
      return unchanged ? current : next;
    });
  }, [visibleAgentNodes, visibleSourceNodes, visibleTaskNodes]);

  const selectedAtlasEntries = useMemo<AtlasSelectedNodeEntry[]>(() => {
    const entries: AtlasSelectedNodeEntry[] = [];
    for (const node of visibleAgentNodes) {
      if (selectedAtlasNodeKeys.has(atlasSelectionKey("agent", node.nodeId))) {
        entries.push({ kind: "agent", nodeId: node.nodeId, agentId: node.agentId });
      }
    }
    for (const node of visibleTaskNodes) {
      if (selectedAtlasNodeKeys.has(atlasSelectionKey("task", node.nodeId))) {
        entries.push({ kind: "task", nodeId: node.nodeId, taskId: node.taskId });
      }
    }
    for (const node of visibleSourceNodes) {
      if (selectedAtlasNodeKeys.has(atlasSelectionKey("source", node.nodeId))) {
        entries.push({ kind: "source", nodeId: node.nodeId, sourceNodeId: node.sourceNodeId });
      }
    }
    return entries;
  }, [selectedAtlasNodeKeys, visibleAgentNodes, visibleSourceNodes, visibleTaskNodes]);

  useEffect(() => {
    onAtlasSelectionChange?.(selectedAtlasEntries);
  }, [onAtlasSelectionChange, selectedAtlasEntries]);

  const model = useMemo(() => plan && run ? buildExecutionMapModel(plan, run) : null, [plan, run]);

  const evidence = useMemo<EvidenceEntry[]>(() => {
    if (!model || !plan || !run) return [];
    if (!selectedTaskId || selectedTaskId === ROOT_ID) return [];
    const node = model.allNodes.get(selectedTaskId);
    if (!node) return [];
    const hasVisibleChildren = node.children.length > 0 && (node.children.length <= CHILD_COLLAPSE_THRESHOLD || expandedTaskIds.has(node.taskId));
    if (hasVisibleChildren) return [];
    const state = run.taskStates[selectedTaskId];
    const attemptEntries = buildArtifactBranches(node, state, attemptsByTaskId[selectedTaskId] ?? []);
    if (attemptEntries.length > 0 || (attemptsByTaskId[selectedTaskId]?.length ?? 0) > 0) {
      return attemptEntries;
    }

    const entries: EvidenceEntry[] = [];

    const ref = node.resultRef;
    if (ref) {
      const filename = extractFilename(ref);
      const isReport = isFinalReportTask(node.taskId, node.title, plan.tasks);
      entries.push({
        id: `evidence__result__${node.taskId}`,
        kind: "result",
        title: filename || "结果",
        content: "",
        tag: isReport ? "最终汇报" : artifactTypeLabel(filename),
        tagClass: isReport ? "tag-report" : filename.includes("accepted") ? "tag-accepted" : filename.includes("failed") ? "tag-failed" : "tag-result",
        path: ref,
      });
    }

    if (state) {
      if (state.errorSummary) {
        entries.push({
          id: `evidence__error__${selectedTaskId}`,
          kind: "error",
          title: "错误",
          content: state.errorSummary,
        });
      }
      if (state.activeAttemptId) {
        entries.push({
          id: `evidence__attempt__${selectedTaskId}`,
          kind: "attempt",
          title: "尝试",
          content: state.activeAttemptId,
        });
      }
      if (state.progress.phase || state.progress.message) {
        const parts: string[] = [];
        if (state.progress.phase) parts.push(state.progress.phase);
        if (state.progress.message) parts.push(state.progress.message);
        entries.push({
          id: `evidence__progress__${selectedTaskId}`,
          kind: "progress",
          title: "进度",
          content: parts.join(": "),
        });
      }
    }

    return entries;
  }, [selectedTaskId, model, run, plan, expandedTaskIds, attemptsByTaskId]);

  const evidenceReservedHeight = useMemo(() => {
    if (evidence.length === 0) return 0;
    return evidence.reduce((sum, entry, i) => {
      const h = measuredHeights[entry.id] ?? evidenceHeight(entry.kind);
      const previewH = selectedArtifactId === entry.id ? previewHeights[entry.id] ?? PREVIEW_FALLBACK_HEIGHT : 0;
      return sum + Math.max(h, previewH) + (i < evidence.length - 1 ? EVIDENCE_GAP : 0);
    }, 0);
  }, [evidence, measuredHeights, selectedArtifactId, previewHeights]);

  const layout = useMemo(() => model ? layoutExecutionMap(model, {
    selectedTaskId: selectedTaskId ?? undefined,
    selectedReservedHeight: evidenceReservedHeight > 0 ? evidenceReservedHeight : undefined,
    expandedTaskIds,
  }) : createEmptyLayout(), [model, selectedTaskId, evidenceReservedHeight, expandedTaskIds]);

  const taskNodeByTaskId = useMemo(() => new Map(visibleTaskNodes.map((node) => [node.taskId, node])), [visibleTaskNodes]);
  const sourceNodeBySourceId = useMemo(() => new Map(visibleSourceNodes.map((node) => [node.sourceNodeId, node])), [visibleSourceNodes]);
  const taskConnectionLinks = useMemo(() => (
    taskConnections
      .filter((connection) => connection.status !== "stale")
      .map((connection) => {
        const points = taskConnectionPoints(connection, taskNodeByTaskId, tasksById);
        return points ? { connection, path: straightPath(points.source.x, points.source.y, points.target.x, points.target.y), source: points.source, target: points.target } : null;
      })
      .filter((entry): entry is { connection: TeamTaskConnection; path: string; source: { x: number; y: number }; target: { x: number; y: number } } => Boolean(entry))
  ), [taskConnections, taskNodeByTaskId, tasksById]);
  const sourceConnectionLinks = useMemo(() => (
    sourceConnections
      .filter((connection) => connection.status !== "stale")
      .map((connection) => {
        const points = sourceConnectionPoints(connection, sourceNodeBySourceId, taskNodeByTaskId, sourceNodesById, tasksById);
        return points ? { connection, path: straightPath(points.source.x, points.source.y, points.target.x, points.target.y), source: points.source, target: points.target } : null;
      })
      .filter((entry): entry is { connection: TeamCanvasSourceConnection; path: string; source: { x: number; y: number }; target: { x: number; y: number } } => Boolean(entry))
  ), [sourceConnections, sourceNodeBySourceId, sourceNodesById, taskNodeByTaskId, tasksById]);

  const taskDependencyLinks = useMemo(() => (
    taskDependencies
      .filter((dep) => dep.status !== "stale")
      .map((dep) => {
        const sourceNode = taskNodeByTaskId.get(dep.fromTaskId);
        const targetNode = taskNodeByTaskId.get(dep.toTaskId);
        if (!sourceNode || !targetNode) return null;
        const sourceRect = taskNodeRect(sourceNode, tasksById?.get(dep.fromTaskId));
        const targetRect = taskNodeRect(targetNode, tasksById?.get(dep.toTaskId));
        const points = connectorAnchors(sourceRect, targetRect);
        return { dep, path: straightPath(points.source.x, points.source.y, points.target.x, points.target.y), source: points.source, target: points.target };
      })
      .filter((entry): entry is { dep: TeamTaskDependency; path: string; source: { x: number; y: number }; target: { x: number; y: number } } => Boolean(entry))
  ), [taskDependencies, taskNodeByTaskId, tasksById]);

  const selectedChain = useMemo(() => {
    if (!model) return new Set<string>();
    if (!selectedTaskId) return new Set<string>();
    const incomingLink = new Map(layout.links.map((link) => [link.targetId, link.sourceId]));
    const chain = model.parentChainLookup.get(selectedTaskId) ?? [];
    const selectedPath = new Set([...chain, selectedTaskId]);
    let cursor = selectedTaskId;
    while (incomingLink.has(cursor)) {
      const sourceId = incomingLink.get(cursor);
      if (!sourceId || selectedPath.has(sourceId)) break;
      selectedPath.add(sourceId);
      cursor = sourceId;
    }
    return selectedPath;
  }, [layout, model, selectedTaskId]);

  const evidenceLayout = useMemo(() => {
    type Position = EvidenceEntry & { x: number; y: number; width: number; height: number };
    type PreviewPosition = { entry: EvidenceEntry; x: number; y: number; width: number; height: number; state: ArtifactPreviewState };
    type EvidenceLink = { id: string; path: string; preview?: boolean; source?: { x: number; y: number }; socketClassName?: string };
    const empty = { positions: [] as Position[], preview: null as PreviewPosition | null, links: [] as EvidenceLink[] };
    if (evidence.length === 0) return empty;
    const taskPos = layout.nodePositions.get(selectedTaskId!);
    if (!taskPos) return empty;
    const evidenceX = taskPos.x + taskPos.width + 40;
    const previewX = evidenceX + EVIDENCE_W + PREVIEW_GAP;

    let y = taskPos.y;
    const positions: Position[] = [];
    let preview: PreviewPosition | null = null;
    const previewLinks: EvidenceLink[] = [];

    for (const entry of evidence) {
      const fallback = evidenceHeight(entry.kind);
      const h = measuredHeights[entry.id] ?? fallback;
      positions.push({ ...entry, x: evidenceX, y, width: EVIDENCE_W, height: h });
      let rowHeight = h;
      const state = artifactPreviewState[entry.id];
      if (selectedArtifactId === entry.id && state) {
        const previewH = previewHeights[entry.id] ?? PREVIEW_FALLBACK_HEIGHT;
        preview = { entry, x: previewX, y, width: PREVIEW_W, height: previewH, state };
        previewLinks.push({
          id: `${entry.id}__preview`,
          path: straightPath(evidenceX + EVIDENCE_W, y + h / 2, previewX, y + previewH / 2),
          preview: true,
          source: { x: evidenceX + EVIDENCE_W, y: y + h / 2 },
          socketClassName: "emap-connector-socket-evidence",
        });
        rowHeight = Math.max(rowHeight, previewH);
      }
      y += rowHeight + EVIDENCE_GAP;
    }

    const sourceX = taskPos.x + taskPos.width;
    const sourceY = taskPos.y + taskPos.height / 2;
    const trunkX = sourceX + (evidenceX - sourceX) * 0.35;
    const targetCenters = positions.map((entry) => ({ id: entry.id, y: entry.y + entry.height / 2 }));
    const centerYs = [sourceY, ...targetCenters.map((entry) => entry.y)];
    const trunkTop = Math.min(...centerYs);
    const trunkBottom = Math.max(...centerYs);
    const evidenceLinks: EvidenceLink[] = [
      {
        id: `${selectedTaskId}__evidence-source`,
        path: straightSegmentPath(sourceX, sourceY, trunkX, sourceY),
        source: { x: sourceX, y: sourceY },
        socketClassName: "emap-connector-socket-evidence",
      },
    ];

    if (Math.abs(trunkBottom - trunkTop) > 0.5) {
      evidenceLinks.push({
        id: `${selectedTaskId}__evidence-trunk`,
        path: straightSegmentPath(trunkX, trunkTop, trunkX, trunkBottom),
      });
    }

    for (const target of targetCenters) {
      evidenceLinks.push({
        id: `${target.id}__evidence-stub`,
        path: straightSegmentPath(trunkX, target.y, evidenceX, target.y),
      });
    }

    const links = [...evidenceLinks, ...previewLinks];
    return { positions, preview, links };
  }, [evidence, layout.nodePositions, selectedTaskId, measuredHeights, selectedArtifactId, artifactPreviewState, previewHeights]);

  useEffect(() => {
    if (evidence.length === 0 || !evidenceContainerRef.current) return;
    const container = evidenceContainerRef.current;
    const nodes = Array.from(container.querySelectorAll<HTMLElement>(".emap-evidence-node"));
    if (nodes.length === 0) return;

    const fallbackHeights = new Map(evidence.map((entry) => [entry.id, evidenceHeight(entry.kind)]));
    if (typeof ResizeObserver === "undefined") {
      const updated: MeasuredHeights = {};
      for (const node of nodes) {
        const id = node.dataset.evidenceId;
        if (!id) continue;
        const h = measureFallbackLayoutHeight(node, fallbackHeights.get(id) ?? 0);
        if (!Number.isFinite(h) || h <= 0) continue;
        updated[id] = h;
      }
      if (Object.keys(updated).length === 0) return;
      setMeasuredHeights((current) => {
        let changed = false;
        const next = { ...current };
        for (const [id, h] of Object.entries(updated)) {
          if ((current[id] ?? 0) !== h) {
            next[id] = h;
            changed = true;
          }
        }
        return changed ? next : current;
      });
      return;
    }

    const updateHeights = (entries: ResizeObserverEntry[]) => {
      const updated: MeasuredHeights = {};
      for (const entry of entries) {
        const node = entry.target instanceof HTMLElement ? entry.target : null;
        const id = node?.dataset.evidenceId;
        if (!node || !id) continue;
        const h = measureObservedLayoutHeight(fallbackHeights.get(id) ?? 0, entry);
        if (!Number.isFinite(h) || h <= 0) continue;
        updated[id] = h;
      }
      if (Object.keys(updated).length === 0) return;
      setMeasuredHeights((current) => {
        let changed = false;
        const next = { ...current };
        for (const [id, h] of Object.entries(updated)) {
          if ((current[id] ?? 0) !== h) {
            next[id] = h;
            changed = true;
          }
        }
        return changed ? next : current;
      });
    };
    const observer = new ResizeObserver(updateHeights);
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [evidence]);

  useEffect(() => {
    if (!evidenceContainerRef.current) return;
    const nodes = Array.from(evidenceContainerRef.current.querySelectorAll<HTMLElement>(".emap-artifact-preview"));
    if (nodes.length === 0) return;

    if (typeof ResizeObserver === "undefined") {
      const updated: MeasuredHeights = {};
      for (const node of nodes) {
        const id = node.dataset.previewId;
        if (!id) continue;
        const h = measureFallbackLayoutHeight(node, PREVIEW_FALLBACK_HEIGHT);
        if (!Number.isFinite(h) || h <= 0) continue;
        updated[id] = h;
      }
      if (Object.keys(updated).length === 0) return;
      setPreviewHeights((current) => {
        let changed = false;
        const next = { ...current };
        for (const [id, h] of Object.entries(updated)) {
          if ((current[id] ?? 0) !== h) {
            next[id] = h;
            changed = true;
          }
        }
        return changed ? next : current;
      });
      return;
    }

    const updateHeights = (entries: ResizeObserverEntry[]) => {
      const updated: MeasuredHeights = {};
      for (const entry of entries) {
        const node = entry.target instanceof HTMLElement ? entry.target : null;
        const id = node?.dataset.previewId;
        if (!node || !id) continue;
        const h = measureObservedLayoutHeight(PREVIEW_FALLBACK_HEIGHT, entry);
        if (!Number.isFinite(h) || h <= 0) continue;
        updated[id] = h;
      }
      if (Object.keys(updated).length === 0) return;
      setPreviewHeights((current) => {
        let changed = false;
        const next = { ...current };
        for (const [id, h] of Object.entries(updated)) {
          if ((current[id] ?? 0) !== h) {
            next[id] = h;
            changed = true;
          }
        }
        return changed ? next : current;
      });
    };
    const observer = new ResizeObserver(updateHeights);
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [evidenceLayout.preview]);

  const toggleExpand = useCallback((parentTaskId: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentTaskId)) {
        next.delete(parentTaskId);
      } else {
        next.add(parentTaskId);
      }
      return next;
    });
  }, []);

  const handleArtifactClick = useCallback((entry: EvidenceEntry) => {
    if (!entry.previewFile || !readAttemptFile) return;

    if (selectedArtifactId === entry.id) {
      setSelectedArtifactId(null);
      return;
    }

    setSelectedArtifactId(entry.id);

    const parsed = entry.previewFile;
    if (!selectedTaskId || !run || parsed.taskId !== selectedTaskId) return;

    const existing = artifactPreviewState[entry.id];
    if (existing?.status === "loaded") return;

    setArtifactPreviewState((current) => ({
      ...current,
      [entry.id]: { status: "loading", fileName: parsed.fileName },
    }));

    readAttemptFile(run.runId, parsed.taskId, parsed.attemptId, parsed.fileName)
      .then((content) => {
        setArtifactPreviewState((current) => ({
          ...current,
          [entry.id]: { status: "loaded", fileName: parsed.fileName, content },
        }));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setArtifactPreviewState((current) => ({
          ...current,
          [entry.id]: { status: "error", fileName: parsed.fileName, message },
        }));
      });
  }, [artifactPreviewState, readAttemptFile, run, selectedArtifactId, selectedTaskId]);

  const handleAtlasSelectionComplete = useCallback((rect: AtlasSelectionRect) => {
    const next = new Set<string>();
    for (const node of visibleAgentNodes) {
      if (rectsIntersect(rect, {
        x: node.position.x,
        y: node.position.y,
        width: NODE_WIDTH,
        height: AGENT_NODE_HEIGHT,
      })) {
        next.add(atlasSelectionKey("agent", node.nodeId));
      }
    }
    for (const node of visibleTaskNodes) {
      if (rectsIntersect(rect, {
        x: node.position.x,
        y: node.position.y,
        width: NODE_WIDTH,
        height: canvasTaskNodeHeight(tasksById?.get(node.taskId)),
      })) {
        next.add(atlasSelectionKey("task", node.nodeId));
      }
    }
    for (const node of visibleSourceNodes) {
      if (rectsIntersect(rect, {
        x: node.position.x,
        y: node.position.y,
        width: NODE_WIDTH,
        height: CANVAS_SOURCE_NODE_HEIGHT,
      })) {
        next.add(atlasSelectionKey("source", node.nodeId));
      }
    }
    setSelectedAtlasNodeKeys(next);
  }, [tasksById, visibleAgentNodes, visibleSourceNodes, visibleTaskNodes]);

  const clearAtlasSelection = useCallback(() => {
    setSelectedAtlasNodeKeys((current) => current.size === 0 ? current : new Set());
  }, []);

  const buildAtlasDragEntries = useCallback((primary: AtlasAgentNode | AtlasTaskNode | AtlasSourceNode, kind: "agent" | "task" | "source"): AtlasNodeDragEntry[] => {
    const entryHeight = (node: AtlasAgentNode | AtlasTaskNode | AtlasSourceNode, nodeKind: AtlasNodeDragEntry["kind"]) => (
      nodeKind === "task"
        ? atlasDragEntryHeight(nodeKind, tasksById?.get((node as AtlasTaskNode).taskId))
        : atlasDragEntryHeight(nodeKind)
    );
    const primaryKey = atlasSelectionKey(kind, primary.nodeId);
    if (!selectedAtlasNodeKeys.has(primaryKey)) {
      return [{ nodeId: primary.nodeId, kind, startPosition: primary.position, height: entryHeight(primary, kind) }];
    }

    const entries: AtlasNodeDragEntry[] = [];
    for (const node of visibleAgentNodes) {
      if (selectedAtlasNodeKeys.has(atlasSelectionKey("agent", node.nodeId))) {
        entries.push({ nodeId: node.nodeId, kind: "agent", startPosition: node.position, height: entryHeight(node, "agent") });
      }
    }
    for (const node of visibleTaskNodes) {
      if (selectedAtlasNodeKeys.has(atlasSelectionKey("task", node.nodeId)) && !lockedTaskGroupNodeIdSet.has(node.nodeId)) {
        entries.push({ nodeId: node.nodeId, kind: "task", startPosition: node.position, height: entryHeight(node, "task") });
      }
    }
    for (const node of visibleSourceNodes) {
      if (selectedAtlasNodeKeys.has(atlasSelectionKey("source", node.nodeId))) {
        entries.push({ nodeId: node.nodeId, kind: "source", startPosition: node.position, height: entryHeight(node, "source") });
      }
    }
    return entries.length > 0 ? entries : [{ nodeId: primary.nodeId, kind, startPosition: primary.position, height: entryHeight(primary, kind) }];
  }, [lockedTaskGroupNodeIdSet, selectedAtlasNodeKeys, tasksById, visibleAgentNodes, visibleSourceNodes, visibleTaskNodes]);

  const buildTaskGroupDragEntries = useCallback((group: AtlasTaskGroup): AtlasNodeDragEntry[] => {
    return group.taskNodeIds.flatMap((nodeId) => {
      const node = unfilteredVisibleTaskNodes.find((candidate) => candidate.nodeId === nodeId);
      if (!node) return [];
      return [{
        nodeId: node.nodeId,
        kind: "task" as const,
        startPosition: node.position,
        height: atlasDragEntryHeight("task", tasksById?.get(node.taskId)),
      }];
    });
  }, [tasksById, unfilteredVisibleTaskNodes]);

  const beginAtlasNodeDrag = useCallback((
    node: AtlasAgentNode | AtlasTaskNode | AtlasSourceNode,
    kind: "agent" | "task" | "source",
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    event.stopPropagation();
    if ((event.button ?? 0) !== 0) return;
    const primaryKey = atlasSelectionKey(kind, node.nodeId);
    if (selectedAtlasNodeKeys.size > 0 && !selectedAtlasNodeKeys.has(primaryKey)) {
      clearAtlasSelection();
    }
    if (kind === "task" && lockedTaskGroupNodeIdSet.has(node.nodeId)) return;
    if (kind === "agent" && (!canMoveAgents || !onMoveAgent)) return;
    if (kind === "task" && (!canMoveTasks || !onMoveCanvasTask)) return;
    if (kind === "source" && (!canMoveSourceNodes || !onMoveSourceNode)) return;
    const pendingCopyPointer = pendingNodeIdCopyPointerRef.current?.pointerId === event.pointerId
      ? pendingNodeIdCopyPointerRef.current
      : null;
    const copyButton = event.target instanceof Element ? event.target.closest(".emap-node-id-copy") : null;
    const copyOnClick = pendingCopyPointer && pendingCopyPointer.kind === kind
      ? pendingCopyPointer
      : copyButton && kind !== "source"
        ? { kind, id: kind === "agent" ? (node as AtlasAgentNode).agentId : (node as AtlasTaskNode).taskId }
        : null;
    atlasNodeDragRef.current = {
      primaryNodeId: node.nodeId,
      primaryKind: kind,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      entries: buildAtlasDragEntries(node, kind),
      hasMoved: false,
      ...(copyOnClick && kind !== "source" ? { copyOnClick: copyOnClick as { kind: "agent" | "task"; id: string } } : {}),
    };
    dockDragHitRef.current = false;
    atlasDragHitTestRectsCache = null;
    setIsAtlasDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [buildAtlasDragEntries, canMoveAgents, canMoveSourceNodes, canMoveTasks, clearAtlasSelection, lockedTaskGroupNodeIdSet, onMoveAgent, onMoveCanvasTask, onMoveSourceNode, selectedAtlasNodeKeys]);

  const handleAgentPointerDown = useCallback((node: AtlasAgentNode, event: ReactPointerEvent<HTMLElement>) => {
    beginAtlasNodeDrag(node, "agent", event);
  }, [beginAtlasNodeDrag]);

  const getAtlasDragHitTestRects = useCallback((drag: AtlasNodeDragState): AtlasDragHitTestRects => {
    const current = atlasDragHitTestRectsCache?.pointerId === drag.pointerId
      ? atlasDragHitTestRectsCache.rects
      : undefined;
    if (current?.dock && current.trash && current.nodes) return current;
    const hitTestRects = {
      dock: current?.dock ?? cacheDomRect(dockRef.current, { allowZeroSize: true }),
      trash: current?.trash ?? cacheDomRect(trashRef.current),
      nodes: current?.nodes ?? cacheDomRect(evidenceContainerRef.current, { allowZeroSize: true }),
    };
    atlasDragHitTestRectsCache = { pointerId: drag.pointerId, rects: hitTestRects };
    return hitTestRects;
  }, []);

  const getDockHitForDrag = useCallback((drag: AtlasNodeDragState, event: ReactPointerEvent<HTMLElement>) => {
    const { dock: dockRect, nodes: nodesRect } = getAtlasDragHitTestRects(drag);
    if (!dockRect) return null;
    if (pointInDomRect(event.clientX, event.clientY, dockRect)) {
      return { dockRect };
    }

    if (!nodesRect) return null;
    const scale = viewportScale(viewport);
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    const dockHitRect = domRectToRect(dockRect);
    const hit = drag.entries.some((entry) => rectsIntersect(
      {
        x: nodesRect.left + entry.startPosition.x * scale + dx,
        y: nodesRect.top + entry.startPosition.y * scale + dy,
        width: NODE_WIDTH * scale,
        height: entry.height * scale,
      },
      dockHitRect,
    ));
    return hit ? { dockRect } : null;
  }, [getAtlasDragHitTestRects, viewport]);

  const canDockDrag = useCallback((drag: AtlasNodeDragState): boolean => {
    if (drag.primaryKind === "task-group") return false;
    return !drag.entries.some((entry) => entry.kind === "task" && groupedTaskNodeIdSet.has(entry.nodeId));
  }, [groupedTaskNodeIdSet]);

  const isPointerOverTrash = useCallback((drag: AtlasNodeDragState, event: ReactPointerEvent<HTMLElement>): boolean => {
    const { trash } = getAtlasDragHitTestRects(drag);
    return trash ? pointInDomRect(event.clientX, event.clientY, trash) : false;
  }, [getAtlasDragHitTestRects]);

  const handleAgentPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = atlasNodeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    const hasMoved = drag.hasMoved || Math.hypot(dx, dy) >= AGENT_DRAG_THRESHOLD;
    if (!hasMoved) return;

    const overTrash = isPointerOverTrash(drag, event);
    const dockHit = overTrash || !canDockDrag(drag) ? null : getDockHitForDrag(drag, event);
    dockDragHitRef.current = Boolean(dockHit);
    if (dockHit) {
      wakeDock();
      setRootDropTarget("dock");
    } else if (rootDropTarget === "dock") {
      setRootDropTarget(null);
      scheduleDockCollapse();
    }
    if (overTrash) {
      setRootDropTarget("trash");
    } else if (rootDropTarget === "trash") {
      setRootDropTarget(null);
    }

    const scale = viewportScale(viewport);
    atlasNodeDragRef.current = { ...drag, hasMoved };
    for (const entry of drag.entries) {
      const nextPosition = {
        x: entry.startPosition.x + dx / scale,
        y: entry.startPosition.y + dy / scale,
      };
      if (entry.kind === "agent") {
        onMoveAgent?.(entry.nodeId, nextPosition);
      } else if (entry.kind === "task") {
        onMoveCanvasTask?.(entry.nodeId, nextPosition);
      } else {
        onMoveSourceNode?.(entry.nodeId, nextPosition);
      }
      if (entry.kind === "task" && hasTaskBranchTree) {
        const treeDx = dx / scale - (drag.lastTreeDx ?? 0);
        const treeDy = dy / scale - (drag.lastTreeDy ?? 0);
        if (treeDx !== 0 || treeDy !== 0) {
          translateTaskSubtreeRef.current("root", treeDx, treeDy, entry.nodeId);
        }
        atlasNodeDragRef.current = { ...atlasNodeDragRef.current!, lastTreeDx: dx / scale, lastTreeDy: dy / scale };
      }
    }
  }, [canDockDrag, getDockHitForDrag, hasTaskBranchTree, isPointerOverTrash, onMoveAgent, onMoveCanvasTask, onMoveSourceNode, rootDropTarget, scheduleDockCollapse, viewport, wakeDock]);

  const suppressNextAgentClick = useCallback((nodeId: string) => {
    suppressAgentClickRef.current = nodeId;
    globalThis.setTimeout(() => {
      if (suppressAgentClickRef.current === nodeId) {
        suppressAgentClickRef.current = null;
      }
    }, 0);
  }, []);

  const flightOnCompleteRef = useRef<(() => void) | null>(null);

  const startDockFlight = useCallback((flight: Omit<DockFlightAnimation, "id" | "phase">, options?: { onComplete?: () => void }) => {
    const id = ++flightIdRef.current;
    if (flightTimerRef.current != null) globalThis.clearTimeout(flightTimerRef.current);
    if (flightPhaseTimerRef.current != null) globalThis.clearTimeout(flightPhaseTimerRef.current);

    const prevCallback = flightOnCompleteRef.current;
    if (prevCallback) {
      flightOnCompleteRef.current = null;
      prevCallback();
    }

    flightOnCompleteRef.current = options?.onComplete ?? null;
    setFlightAnimation({ ...flight, id, phase: "from" });
    flightPhaseTimerRef.current = globalThis.setTimeout(() => {
      flightPhaseTimerRef.current = null;
      setFlightAnimation((current) => (
        current?.id === id ? { ...current, phase: "to" } : current
      ));
    }, DOCK_FLIGHT_PHASE_DELAY_MS);
    flightTimerRef.current = globalThis.setTimeout(() => {
      flightTimerRef.current = null;
      if (flightPhaseTimerRef.current != null) {
        globalThis.clearTimeout(flightPhaseTimerRef.current);
        flightPhaseTimerRef.current = null;
      }
      const isCurrent = flightIdRef.current === id;
      setFlightAnimation((current) => current?.id === id ? null : current);
      if (isCurrent) {
        const cb = flightOnCompleteRef.current;
        flightOnCompleteRef.current = null;
        if (cb) cb();
      }
    }, DOCK_FLIGHT_DURATION_MS);
  }, []);

  const rollbackAtlasDragPositions = useCallback((drag: AtlasNodeDragState) => {
    for (const entry of drag.entries) {
      if (entry.kind === "agent") {
        onMoveAgent?.(entry.nodeId, entry.startPosition);
      } else if (entry.kind === "task") {
        onMoveCanvasTask?.(entry.nodeId, entry.startPosition);
        if (drag.lastTreeDx !== undefined || drag.lastTreeDy !== undefined) {
          translateTaskSubtreeRef.current("root", -(drag.lastTreeDx ?? 0), -(drag.lastTreeDy ?? 0), entry.nodeId);
        }
      } else {
        onMoveSourceNode?.(entry.nodeId, entry.startPosition);
      }
    }
  }, [onMoveAgent, onMoveCanvasTask, onMoveSourceNode]);

  const checkDockDrop = useCallback((drag: AtlasNodeDragState, event: ReactPointerEvent<HTMLElement>): boolean => {
    if (!drag.hasMoved) return false;
    if (!canDockDrag(drag)) return false;
    const dockHit = getDockHitForDrag(drag, event);
    if (!dockHit) return false;
    const { dockRect } = dockHit;

    // Roll back positions to pre-drag start so restore returns to original location.
    rollbackAtlasDragPositions(drag);

    for (const entry of drag.entries) {
      if (entry.kind === "agent") {
        onMinimizeAgent?.(visibleAgentNodes.find((n) => n.nodeId === entry.nodeId) ?? { nodeId: entry.nodeId, kind: "agent", agentId: entry.nodeId, position: entry.startPosition });
      } else if (entry.kind === "task") {
        onMinimizeCanvasTask?.(visibleTaskNodes.find((n) => n.nodeId === entry.nodeId) ?? { nodeId: entry.nodeId, kind: "canvas-task", taskId: entry.nodeId, position: entry.startPosition });
      } else {
        onMinimizeSourceNode?.(visibleSourceNodes.find((n) => n.nodeId === entry.nodeId) ?? { nodeId: entry.nodeId, kind: "canvas-source", sourceNodeId: entry.nodeId, position: entry.startPosition });
      }
    }
    setSelectedAtlasNodeKeys((prev) => {
      const next = new Set(prev);
      for (const entry of drag.entries) {
        next.delete(atlasSelectionKey(entry.kind, entry.nodeId));
      }
      return next;
    });

    const primaryEl = (event.currentTarget as HTMLElement).closest?.(`[data-node-id="${drag.primaryNodeId}"]`) as HTMLElement | null;
    if (primaryEl) {
      const fromRect = primaryEl.getBoundingClientRect();
      const primaryEntry = drag.entries[0];
      let flightLabel = "";
      let flightMeta = "";
      const flightRootKind: DockFlightRootKind = primaryEntry?.kind ?? "agent";
      if (primaryEntry) {
        if (primaryEntry.kind === "agent") {
          const agent = agentsById?.get(primaryEntry.nodeId);
          flightLabel = agent?.name ?? primaryEntry.nodeId;
          flightMeta = agent?.agentId ?? primaryEntry.nodeId;
        } else if (primaryEntry.kind === "task") {
          const task = tasksById?.get(primaryEntry.nodeId);
          flightLabel = task?.title ?? primaryEntry.nodeId;
          flightMeta = task?.taskId ?? primaryEntry.nodeId;
        } else {
          const srcNode = sourceNodesById?.get(primaryEntry.nodeId);
          flightLabel = srcNode?.title ?? primaryEntry.nodeId;
          flightMeta = srcNode?.outputPort.type ?? primaryEntry.nodeId;
        }
      }
      startDockFlight({
        fromX: fromRect.left, fromY: fromRect.top, fromW: fromRect.width, fromH: fromRect.height,
        toX: dockRect.left + dockRect.width / 2 - 45, toY: dockRect.top + 4, toW: 90, toH: 48,
        kind: "minimize", rootKind: flightRootKind, label: flightLabel, meta: flightMeta,
        targetNodeClass: "", targetPillClass: "pending", targetPill: DOCK_FLIGHT_KIND_LABELS[flightRootKind],
        targetLines: flightMeta ? [flightMeta] : [],
        contentScale: viewportScale(viewport),
      });
    }

    return true;
  }, [canDockDrag, getDockHitForDrag, onMinimizeAgent, onMinimizeCanvasTask, onMinimizeSourceNode, rollbackAtlasDragPositions, startDockFlight, agentsById, tasksById, sourceNodesById, visibleAgentNodes, visibleSourceNodes, visibleTaskNodes, viewport]);

  const endAgentPointer = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = atlasNodeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    atlasNodeDragRef.current = null;
    if (pendingNodeIdCopyPointerRef.current?.pointerId === event.pointerId) {
      pendingNodeIdCopyPointerRef.current = null;
    }
    dockDragHitRef.current = false;
    setIsAtlasDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setRootDropTarget(null);

    if (drag.hasMoved) {
      suppressNextAgentClick(drag.primaryNodeId);
      if (isPointerOverTrash(drag, event)) {
        rollbackAtlasDragPositions(drag);
        onRootTrashDrop?.(drag.entries);
        atlasDragHitTestRectsCache = null;
        return;
      }
      if (checkDockDrop(drag, event)) {
        atlasDragHitTestRectsCache = null;
        return;
      }
      atlasDragHitTestRectsCache = null;
      return;
    }

    if (drag.copyOnClick?.kind === "agent") {
      suppressNextAgentClick(drag.primaryNodeId);
      void copyCanvasNodeId("agent", drag.copyOnClick.id);
      atlasDragHitTestRectsCache = null;
      return;
    }

    const node = visibleAgentNodes.find((candidate) => candidate.nodeId === drag.primaryNodeId);
    if (drag.primaryKind === "agent" && node) {
      suppressNextAgentClick(drag.primaryNodeId);
      onSelectAgent?.(node);
    }
    atlasDragHitTestRectsCache = null;
  }, [checkDockDrop, copyCanvasNodeId, isPointerOverTrash, onRootTrashDrop, onSelectAgent, rollbackAtlasDragPositions, suppressNextAgentClick, visibleAgentNodes]);

  const handleAgentClick = useCallback((node: AtlasAgentNode) => {
    if (suppressAgentClickRef.current === node.nodeId) {
      suppressAgentClickRef.current = null;
      return;
    }
    onSelectAgent?.(node);
  }, [onSelectAgent]);

  const handleTaskPointerDown = useCallback((node: AtlasTaskNode, event: ReactPointerEvent<HTMLElement>) => {
    beginAtlasNodeDrag(node, "task", event);
  }, [beginAtlasNodeDrag]);

  const handleTaskPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    handleAgentPointerMove(event);
  }, [handleAgentPointerMove]);

  const suppressNextTaskClick = useCallback((nodeId: string) => {
    suppressTaskClickRef.current = nodeId;
    globalThis.setTimeout(() => {
      if (suppressTaskClickRef.current === nodeId) {
        suppressTaskClickRef.current = null;
      }
    }, 0);
  }, []);

  const endTaskPointer = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = atlasNodeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    atlasNodeDragRef.current = null;
    if (pendingNodeIdCopyPointerRef.current?.pointerId === event.pointerId) {
      pendingNodeIdCopyPointerRef.current = null;
    }
    dockDragHitRef.current = false;
    setIsAtlasDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setRootDropTarget(null);

    if (drag.hasMoved) {
      suppressNextTaskClick(drag.primaryNodeId);
      if (isPointerOverTrash(drag, event)) {
        rollbackAtlasDragPositions(drag);
        onRootTrashDrop?.(drag.entries);
        atlasDragHitTestRectsCache = null;
        return;
      }
      if (checkDockDrop(drag, event)) {
        atlasDragHitTestRectsCache = null;
        return;
      }
      atlasDragHitTestRectsCache = null;
      return;
    }

    if (drag.copyOnClick?.kind === "task") {
      suppressNextTaskClick(drag.primaryNodeId);
      void copyCanvasNodeId("task", drag.copyOnClick.id);
      atlasDragHitTestRectsCache = null;
      return;
    }

    const node = visibleTaskNodes.find((candidate) => candidate.nodeId === drag.primaryNodeId);
    if (drag.primaryKind === "task" && node) {
      suppressNextTaskClick(drag.primaryNodeId);
      onSelectCanvasTask?.(node);
    }
    atlasDragHitTestRectsCache = null;
  }, [checkDockDrop, copyCanvasNodeId, isPointerOverTrash, onRootTrashDrop, onSelectCanvasTask, rollbackAtlasDragPositions, suppressNextTaskClick, visibleTaskNodes]);

  const suppressNextTaskGroupClick = useCallback((groupId: string) => {
    suppressTaskGroupClickRef.current = groupId;
    globalThis.setTimeout(() => {
      if (suppressTaskGroupClickRef.current === groupId) {
        suppressTaskGroupClickRef.current = null;
      }
    }, 0);
  }, []);

  const beginTaskGroupDrag = useCallback((group: AtlasTaskGroup, event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation();
    if ((event.button ?? 0) !== 0 || group.locked) return;
    const entries = buildTaskGroupDragEntries(group);
    if (entries.length === 0) return;
    atlasNodeDragRef.current = {
      primaryNodeId: group.groupId,
      primaryKind: "task-group",
      groupId: group.groupId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      entries,
      hasMoved: false,
    };
    dockDragHitRef.current = false;
    atlasDragHitTestRectsCache = null;
    setIsAtlasDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [buildTaskGroupDragEntries]);

  const endTaskGroupPointer = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = atlasNodeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.primaryKind !== "task-group") return;
    event.stopPropagation();
    atlasNodeDragRef.current = null;
    dockDragHitRef.current = false;
    setIsAtlasDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setRootDropTarget(null);

    if (drag.hasMoved) {
      suppressNextTaskGroupClick(drag.primaryNodeId);
      if (isPointerOverTrash(drag, event)) {
        rollbackAtlasDragPositions(drag);
        if (drag.groupId) onDeleteTaskGroup?.(drag.groupId);
      }
      atlasDragHitTestRectsCache = null;
      return;
    }

    atlasDragHitTestRectsCache = null;
  }, [isPointerOverTrash, onDeleteTaskGroup, rollbackAtlasDragPositions, suppressNextTaskGroupClick]);

  const handleTaskGroupClick = useCallback((groupId: string) => {
    if (suppressTaskGroupClickRef.current === groupId) {
      suppressTaskGroupClickRef.current = null;
      return;
    }
    onToggleTaskGroup?.(groupId);
  }, [onToggleTaskGroup]);

  const handleTaskClick = useCallback((node: AtlasTaskNode) => {
    if (suppressTaskClickRef.current === node.nodeId) {
      suppressTaskClickRef.current = null;
      return;
    }
    onSelectCanvasTask?.(node);
  }, [onSelectCanvasTask]);

  const handleSourcePointerDown = useCallback((node: AtlasSourceNode, event: ReactPointerEvent<HTMLElement>) => {
    beginAtlasNodeDrag(node, "source", event);
  }, [beginAtlasNodeDrag]);

  const allNodes: RenderNode[] = model ? model.mainTasks.flatMap((t) => {
    const result: RenderNode[] = [t];
    const isExpanded = expandedTaskIds.has(t.taskId);
    if (t.children.length > CHILD_COLLAPSE_THRESHOLD && !isExpanded) {
      result.push({
        nodeId: `${t.taskId}__collapsed`,
        taskId: `${t.taskId}__collapsed`,
        title: `+ ${t.children.length} 个子任务`,
        kind: "collapsed",
        status: summarizeCollapsedTaskStatus(t.children),
        errorFirstLine: "",
        attemptCount: t.children.length,
        activeAttemptId: null,
        resultRef: null,
        children: [],
        depth: 1,
      });
    } else if (t.children.length > CHILD_COLLAPSE_THRESHOLD && isExpanded) {
      result.push(...t.children);
      result.push({
        nodeId: `${t.taskId}__collapse_control`,
        taskId: `${t.taskId}__collapse_control`,
        title: `收起 ${t.children.length} 个子任务`,
        kind: "collapsed",
        status: summarizeCollapsedTaskStatus(t.children),
        errorFirstLine: "",
        attemptCount: t.children.length,
        activeAttemptId: null,
        resultRef: null,
        children: [],
        depth: 1,
      });
    } else {
      result.push(...t.children);
    }
    return result;
  }) : [];

  if (model) {
    for (const o of model.orphanGroup) {
      allNodes.push(o);
    }
  }

  const evidenceRight = evidenceLayout.positions.length > 0
    ? Math.max(...evidenceLayout.positions.map((p) => p.x + p.width))
    : 0;
  const previewRight = evidenceLayout.preview ? evidenceLayout.preview.x + evidenceLayout.preview.width : 0;
  const agentRight = visibleAgentNodes.length > 0
    ? Math.max(...visibleAgentNodes.map((node) => node.position.x + NODE_WIDTH))
    : 0;
  const taskRight = visibleTaskNodes.length > 0
    ? Math.max(...visibleTaskNodes.map((node) => node.position.x + NODE_WIDTH))
    : 0;
  const sourceRight = visibleSourceNodes.length > 0
    ? Math.max(...visibleSourceNodes.map((node) => node.position.x + NODE_WIDTH))
    : 0;
  const focusedAgentNode = focusedAgentNodeId
    ? visibleAgentNodes.find((node) => node.nodeId === focusedAgentNodeId) ?? null
    : null;
  const agentBranchNode = focusedAgentNode && agentBranchPanel
    ? agentBranchRects[focusedAgentNode.nodeId] ?? {
      x: focusedAgentNode.position.x + NODE_WIDTH + AGENT_BRANCH_GAP,
      y: Math.max(0, focusedAgentNode.position.y - 16),
      width: AGENT_BRANCH_WIDTH,
      height: AGENT_BRANCH_HEIGHT,
    }
    : null;
  const focusedTaskNode = focusedTaskNodeId
    ? visibleTaskNodes.find((node) => node.nodeId === focusedTaskNodeId) ?? null
    : null;
  const taskBranchEntries = useMemo(() => (
    (taskBranchPanels ?? []).map((entry) => {
      const node = visibleTaskNodes.find((candidate) => candidate.nodeId === entry.nodeId);
      if (!node) return null;
      const measuredSize = taskBranchMeasuredSizes[entry.id] ?? null;
      const base = {
        x: node.position.x + NODE_WIDTH + TASK_BRANCH_GAP,
        y: Math.max(0, node.position.y - 16),
        width: measuredSize?.width ?? TASK_MENU_BRANCH_WIDTH,
        height: measuredSize?.height ?? TASK_MENU_BRANCH_HEIGHT,
      };
      const posOverride = taskBranchPositionOverrides[node.nodeId];
      return {
        ...entry,
        node,
        rect: posOverride ? { ...base, x: posOverride.x, y: posOverride.y } : base,
      };
    }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  ), [taskBranchPanels, taskBranchPositionOverrides, taskBranchMeasuredSizes, visibleTaskNodes]);
  const primaryTaskBranchEntry = (
    taskBranchEntries.find((entry) => entry.node.nodeId === focusedTaskNodeId)
    ?? taskBranchEntries[0]
    ?? null
  );
  const taskBranchNode = primaryTaskBranchEntry?.rect ?? null;
  const taskChildBranchPanelsLayout = useMemo(() => {
    if (!taskBranchNode || !taskChildBranchPanels?.length) return [];
    const panelGap = 8;
    const activePanelIds = new Set(taskChildBranchPanels.map((p) => p.id));
    const taskBranchRectById = new Map(taskBranchEntries.map((entry) => [entry.id, entry.rect]));
    type Entry = {
      panel: TaskChildBranchPanelDescriptor;
      rect: AtlasRect;
      sourceRect: AtlasRect;
      parentKey: string;
    };
    const entries: Entry[] = [];
    const finalRectByPanelId = new Map<string, AtlasRect>();
    const bottomByParent = new Map<string, number>();
    let pendingPanels = [...taskChildBranchPanels];
    while (pendingPanels.length > 0) {
      const deferredPanels: TaskChildBranchPanelDescriptor[] = [];
      let placedCount = 0;
      for (const p of pendingPanels) {
        let parentKey: string;
        let sourceRect: AtlasRect;
        if (p.sourceId) {
          parentKey = p.sourceId;
          const found = finalRectByPanelId.get(p.sourceId) ?? taskBranchRectById.get(p.sourceId);
          if (!found) {
            deferredPanels.push(p);
            continue;
          }
          sourceRect = found;
        } else {
          parentKey = "__menu__";
          sourceRect = taskBranchNode;
        }
        const sizeOverride = activePanelIds.has(p.id) ? panelSizeOverrides[p.id] : undefined;
        const baseW = p.width ?? TASK_CHILD_BRANCH_WIDTH;
        const baseH = p.autoHeight
          ? (panelMeasuredHeights[p.id] ?? (p.height ?? 120))
          : (p.height ?? TASK_CHILD_BRANCH_HEIGHT);
        const w = sizeOverride?.width ?? baseW;
        const h = sizeOverride?.height ?? baseH;
        const x = sourceRect.x + sourceRect.width + TASK_CHILD_BRANCH_GAP;
        const prevBottom = bottomByParent.get(parentKey) ?? sourceRect.y;
        const y = prevBottom === sourceRect.y ? sourceRect.y : prevBottom + panelGap;
        const baseRect: AtlasRect = { x, y, width: w, height: h };
        const posOverride = activePanelIds.has(p.id) ? panelPositionOverrides[p.id] : undefined;
        const rectWithOverride = posOverride ? { ...baseRect, x: posOverride.x, y: posOverride.y } : baseRect;
        const rect = {
          ...rectWithOverride,
          x: Math.max(0, rectWithOverride.x),
          y: Math.max(0, rectWithOverride.y),
        };
        entries.push({ panel: p, rect, sourceRect, parentKey });
        finalRectByPanelId.set(p.id, rect);
        bottomByParent.set(parentKey, y + h);
        placedCount += 1;
      }
      if (placedCount === 0) break;
      pendingPanels = deferredPanels;
    }
    return entries.map((entry) => {
      return {
        ...entry.panel,
        rect: entry.rect,
        sourceRect: entry.parentKey === "__menu__" ? taskBranchNode : entry.sourceRect,
      };
    });
  }, [taskBranchNode, taskBranchEntries, taskChildBranchPanels, panelSizeOverrides, panelMeasuredHeights, panelPositionOverrides]);
  const agentBranchRight = agentBranchNode ? agentBranchNode.x + agentBranchNode.width : 0;
  const taskBranchRight = Math.max(
    0,
    ...taskBranchEntries.map((entry) => entry.rect.x + entry.rect.width),
    ...taskChildBranchPanelsLayout.map((p) => p.rect.x + p.rect.width),
  );
  const baseSvgWidth = Math.max(700, evidenceRight + 28, previewRight + 28, agentRight + 28, taskRight + 28, sourceRight + 28, agentBranchRight + 28, taskBranchRight + 28);
  const baseMaxY = Math.max(
    ...Array.from(layout.nodePositions.values()).map((n) => n.y + n.height),
    ...evidenceLayout.positions.map((p) => p.y + p.height),
    evidenceLayout.preview ? evidenceLayout.preview.y + evidenceLayout.preview.height : 0,
    ...visibleAgentNodes.map((node) => node.position.y + AGENT_NODE_HEIGHT),
    ...visibleTaskNodes.map((node) => node.position.y + canvasTaskNodeHeight(tasksById?.get(node.taskId))),
    ...visibleSourceNodes.map((node) => node.position.y + CANVAS_SOURCE_NODE_HEIGHT),
    agentBranchNode ? agentBranchNode.y + agentBranchNode.height : 0,
    ...taskBranchEntries.map((entry) => entry.rect.y + entry.rect.height),
    ...taskChildBranchPanelsLayout.map((p) => p.rect.y + p.rect.height),
    200,
  );
  const agentBranchPath = focusedAgentNode && agentBranchNode
    ? agentBranchConnectorPath(focusedAgentNode, agentBranchNode, NODE_WIDTH)
    : null;
  const agentBranchAnchors = focusedAgentNode && agentBranchNode
    ? connectorAnchors({
      x: focusedAgentNode.position.x,
      y: focusedAgentNode.position.y,
      width: NODE_WIDTH,
      height: AGENT_NODE_HEIGHT,
    }, agentBranchNode)
    : null;
  const taskBranchConnectors = taskBranchEntries.map((entry) => ({
    id: entry.id,
    path: taskBranchConnectorPath(entry.node, entry.rect, tasksById?.get(entry.node.taskId)),
    anchors: connectorAnchors(taskNodeRect(entry.node, tasksById?.get(entry.node.taskId)), entry.rect),
  }));
  const maximizedTaskPanel = maximizedBranch?.kind === "task-panel"
    ? taskChildBranchPanelsLayout.find((p) => p.id === maximizedBranch.panelId)?.panel ?? null
    : null;
  const maximizedBranchPanel = maximizedBranch?.kind === "agent" && agentBranchPanel
    ? agentBranchPanel
    : maximizedTaskPanel;
  const maximizedOverlay = maximizedBranchPanel ? createPortal(
    <div
      className="emap-maximized-branch-shell"
      data-theme={theme}
      onDoubleClick={(event) => {
        if (!canTogglePanelMaximize(event.target)) return;
        event.stopPropagation();
        setMaximizedBranch(null);
      }}
    >
      {maximizedBranchPanel}
    </div>,
    document.body
  ) : null;
  const dockActiveClass = rootDropTarget === "dock" ? " is-drop-active is-drop-hover" : "";
  const rootNodeScreenRect = (position: { x: number; y: number }, width: number, height: number) => {
    const nodesRect = evidenceContainerRef.current?.getBoundingClientRect();
    if (!nodesRect) return null;
    const scale = viewportScale(viewport);
    return {
      x: nodesRect.left + position.x * scale,
      y: nodesRect.top + position.y * scale,
      width: width * scale,
      height: height * scale,
    };
  };
  const agentFlightDetails = (node: AtlasAgentNode) => {
    const agent = agentsById?.get(node.agentId);
    const runStatus = formatAgentRunStatus(agentRunStatusById?.get(node.agentId));
    return {
      label: agent?.name ?? node.agentId,
      meta: node.agentId,
      targetNodeClass: runStatus.nodeClass,
      targetState: runStatus.state,
      targetPillClass: runStatus.pillClass,
      targetPill: runStatus.label,
      targetLines: [node.agentId, agent?.description ?? "", agent ? formatAgentBinding(agent) : ""].filter(Boolean),
    };
  };
  const taskFlightDetails = (node: AtlasTaskNode) => {
    const task = tasksById?.get(node.taskId);
    const latestTaskRun = task ? selectLatestCanvasTaskRun(taskRunsByTaskId[node.taskId]) : null;
    const inputPorts = task?.workUnit.inputPorts ?? [];
    const outputPorts = task?.workUnit.outputPorts ?? [];
    return {
      label: task?.title ?? node.taskId,
      meta: node.taskId,
      targetNodeClass: latestTaskRun ? statusClass(latestTaskRun.status) : task ? `status-${task.status}` : "",
      targetPillClass: latestTaskRun?.status ?? task?.status ?? "pending",
      targetPill: latestTaskRun ? RUN_STATUS_LABELS[latestTaskRun.status] : task?.status ?? "Task",
      targetLines: [
        `leader: ${agentsById?.get(task?.leaderAgentId ?? "")?.name ?? task?.leaderAgentId ?? node.taskId}`,
        task ? `worker: ${agentsById?.get(task.workUnit.workerAgentId)?.name ?? task.workUnit.workerAgentId}` : "",
        task ? `checker: ${agentsById?.get(task.workUnit.checkerAgentId)?.name ?? task.workUnit.checkerAgentId}` : "",
      ].filter(Boolean),
      targetTaskPorts: task
        ? {
            inputs: inputPorts.map((port) => ({
              id: port.id,
              label: taskPortLabel(port),
              type: port.type,
              direction: "input" as const,
              stateClass: taskConnectionDraft?.type === port.type || sourceConnectionDraft?.type === port.type ? "is-compatible" : undefined,
            })),
            outputs: outputPorts.map((port) => ({
              id: port.id,
              label: taskPortLabel(port),
              type: port.type,
              direction: "output" as const,
              stateClass: taskConnectionDraft?.fromTaskId === task.taskId && taskConnectionDraft.fromOutputPortId === port.id ? "is-selected" : undefined,
            })),
          }
        : undefined,
      targetTaskDepHandleClass: taskDependencyDraft?.fromTaskId === node.taskId ? "is-selected" : undefined,
    };
  };
  const sourceFlightDetails = (node: AtlasSourceNode) => {
    const sourceNode = sourceNodesById?.get(node.sourceNodeId);
    return {
      label: sourceNode?.title ?? node.sourceNodeId,
      meta: sourceNode?.outputPort.type ?? node.sourceNodeId,
      targetNodeClass: "",
      targetPillClass: "source",
      targetPill: sourceNode?.nodeType === "file" ? "file" : "text",
      targetLines: [
        sourceNode?.nodeType === "file" ? sourceNode.content?.fileName ?? sourceNode.title : sourceNode?.content?.text ?? "",
        sourceNode?.outputPort.type ?? "",
      ].filter(Boolean),
    };
  };
  const taskGroupRenderItems = useMemo(() => {
    if (!showTasks) return [];
    let emptyIndex = 0;
    return activeTaskGroups.flatMap((group) => {
      const nodes = group.taskNodeIds
        .map((nodeId) => unfilteredVisibleTaskNodes.find((node) => node.nodeId === nodeId) ?? null)
        .filter((node): node is AtlasTaskNode => Boolean(node));
      const taskCount = group.taskIds?.length ?? group.members?.length ?? nodes.length;
      const memberRows = buildTaskGroupMemberRows(group, nodes, taskConnections, tasksById);
      if (nodes.length === 0) {
        const index = emptyIndex;
        emptyIndex += 1;
        return [{
          group,
          taskCount,
          memberRows,
          isEmpty: true,
          rect: {
            x: 24,
            y: 24 + index * 96,
            width: group.collapsed ? 280 : TASK_GROUP_MIN_WIDTH,
            height: group.collapsed ? 78 : 92,
          },
        }];
      }
      const minX = Math.min(...nodes.map((node) => node.position.x));
      const minY = Math.min(...nodes.map((node) => node.position.y));
      const maxX = Math.max(...nodes.map((node) => node.position.x + NODE_WIDTH));
      const maxY = Math.max(...nodes.map((node) => node.position.y + canvasTaskNodeHeight(tasksById?.get(node.taskId))));
      const headerBandHeight = taskGroupHeaderBandHeight(group.collapsed, memberRows.length);
      return [{
        group,
        taskCount,
        memberRows,
        isEmpty: false,
        rect: {
          x: minX - 18,
          y: minY - headerBandHeight,
          width: Math.max(group.collapsed ? 220 : TASK_GROUP_MIN_WIDTH, maxX - minX + 36),
          height: group.collapsed ? 78 : maxY - minY + headerBandHeight + TASK_GROUP_BOTTOM_PADDING,
        },
      }];
    });
  }, [activeTaskGroups, showTasks, taskConnections, tasksById, unfilteredVisibleTaskNodes]);
  const taskGroupRight = taskGroupRenderItems.length > 0
    ? Math.max(...taskGroupRenderItems.map((item) => item.rect.x + item.rect.width))
    : 0;
  const taskGroupBottom = taskGroupRenderItems.length > 0
    ? Math.max(...taskGroupRenderItems.map((item) => item.rect.y + item.rect.height))
    : 0;
  const svgWidth = Math.max(baseSvgWidth, taskGroupRight + 28);
  const maxY = Math.max(baseMaxY, taskGroupBottom + 28);
  const nodeHub = (
    <aside
      ref={dockRef}
      className={`emap-root-dock${dockActiveClass}`}
      aria-label="Root node dock"
      style={{ "--emap-root-dock-min-width": `${NODE_WIDTH}px` } as CSSProperties & Record<"--emap-root-dock-min-width", string>}
      data-dock-state={isDockExpanded ? "expanded" : "collapsed"}
      data-empty={dockNodeCount === 0 ? "true" : "false"}
      onPointerEnter={wakeDock}
      onPointerMove={wakeDock}
      onFocus={wakeDock}
      onPointerLeave={() => scheduleDockCollapse()}
      onBlur={() => scheduleDockCollapse()}
    >
      {dockNodeCount > 0 && (
        <button
          type="button"
          className="emap-root-dock-page-btn emap-root-dock-page-btn-left"
          aria-label="Dock 向左翻页"
          disabled={!dockPageState.canPageLeft}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            wakeDock();
            pageDock("left");
          }}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M12.5 4.5 7 10l5.5 5.5" />
          </svg>
        </button>
      )}
      <div ref={dockItemsRef} className="emap-root-dock-items" onScroll={updateDockPageState}>
        {hubAgentNodes.map((node) => {
        const flightDetails = agentFlightDetails(node);
        const label = flightDetails.label;
        const restoreKey = atlasSelectionKey("agent", node.nodeId);
        const isRestoring = pendingRestoreRootKeys.has(restoreKey);
        return (
          <button
            key={`dock-${node.nodeId}`}
            type="button"
            className="emap-root-dock-item emap-root-dock-item-agent"
            data-kind="agent"
            data-restoring={isRestoring ? "true" : undefined}
            aria-label={`复原 Agent ${label}`}
            aria-disabled={isRestoring || undefined}
            disabled={isRestoring}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              wakeDock();
              if (isRestoring) return;
              const itemRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
              const targetRect = rootNodeScreenRect(node.position, NODE_WIDTH, AGENT_NODE_HEIGHT);
              const doRestore = () => {
                onRestoreAgent?.(node);
                setPendingRestoreRootKeys((prev) => {
                  const next = new Set(prev);
                  next.delete(restoreKey);
                  return next;
                });
              };
              if (targetRect) {
                setPendingRestoreRootKeys((prev) => new Set(prev).add(restoreKey));
                startDockFlight({
                  fromX: itemRect.left, fromY: itemRect.top, fromW: itemRect.width, fromH: itemRect.height,
                  toX: targetRect.x, toY: targetRect.y, toW: targetRect.width, toH: targetRect.height,
                  kind: "restore", rootKind: "agent", ...flightDetails, contentScale: viewportScale(viewport),
                }, { onComplete: doRestore });
              } else {
                doRestore();
              }
            }}
          >
            <span className="emap-root-dock-icon" aria-hidden="true">A</span>
            <span className="emap-root-dock-copy">
              <span className="emap-root-dock-kind">Agent</span>
              <span className="emap-root-dock-title">{label}</span>
              <span className="emap-root-dock-meta">{node.agentId}</span>
              <span className={`emap-root-dock-state ${flightDetails.targetPillClass}`}>{flightDetails.targetPill}</span>
            </span>
          </button>
        );
        })}
        {hubTaskNodes.map((node) => {
        const flightDetails = taskFlightDetails(node);
        const label = flightDetails.label;
        const restoreKey = atlasSelectionKey("task", node.nodeId);
        const isRestoring = pendingRestoreRootKeys.has(restoreKey);
        return (
          <button
            key={`dock-${node.nodeId}`}
            type="button"
            className="emap-root-dock-item emap-root-dock-item-task"
            data-kind="task"
            data-task-run-status={flightDetails.targetPillClass}
            data-restoring={isRestoring ? "true" : undefined}
            aria-label={`复原 Task ${label} ${flightDetails.targetPill}`}
            aria-disabled={isRestoring || undefined}
            disabled={isRestoring}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              wakeDock();
              if (isRestoring) return;
              const itemRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
              const targetRect = rootNodeScreenRect(node.position, NODE_WIDTH, canvasTaskNodeHeight(tasksById?.get(node.taskId)));
              const doRestore = () => {
                onRestoreCanvasTask?.(node);
                setPendingRestoreRootKeys((prev) => {
                  const next = new Set(prev);
                  next.delete(restoreKey);
                  return next;
                });
              };
              if (targetRect) {
                setPendingRestoreRootKeys((prev) => new Set(prev).add(restoreKey));
                startDockFlight({
                  fromX: itemRect.left, fromY: itemRect.top, fromW: itemRect.width, fromH: itemRect.height,
                  toX: targetRect.x, toY: targetRect.y, toW: targetRect.width, toH: targetRect.height,
                  kind: "restore", rootKind: "task", ...flightDetails, contentScale: viewportScale(viewport),
                }, { onComplete: doRestore });
              } else {
                doRestore();
              }
            }}
          >
            <span className="emap-root-dock-icon" aria-hidden="true">T</span>
            <span className="emap-root-dock-copy">
              <span className="emap-root-dock-kind">Task</span>
              <span className="emap-root-dock-title">{label}</span>
              <span className="emap-root-dock-meta">{node.taskId}</span>
              <span className={`emap-root-dock-state ${flightDetails.targetPillClass}`}>{flightDetails.targetPill}</span>
            </span>
          </button>
        );
        })}
        {hubSourceNodes.map((node) => {
        const sourceNode = sourceNodesById?.get(node.sourceNodeId);
        const flightDetails = sourceFlightDetails(node);
        const label = flightDetails.label;
        const restoreKey = atlasSelectionKey("source", node.nodeId);
        const isRestoring = pendingRestoreRootKeys.has(restoreKey);
        return (
          <button
            key={`dock-${node.nodeId}`}
            type="button"
            className="emap-root-dock-item emap-root-dock-item-source"
            data-kind="source"
            data-restoring={isRestoring ? "true" : undefined}
            aria-label={`复原 Source ${label}`}
            aria-disabled={isRestoring || undefined}
            disabled={isRestoring}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              wakeDock();
              if (isRestoring) return;
              const itemRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
              const targetRect = rootNodeScreenRect(node.position, NODE_WIDTH, CANVAS_SOURCE_NODE_HEIGHT);
              const doRestore = () => {
                onRestoreSourceNode?.(node);
                setPendingRestoreRootKeys((prev) => {
                  const next = new Set(prev);
                  next.delete(restoreKey);
                  return next;
                });
              };
              if (targetRect) {
                setPendingRestoreRootKeys((prev) => new Set(prev).add(restoreKey));
                startDockFlight({
                  fromX: itemRect.left, fromY: itemRect.top, fromW: itemRect.width, fromH: itemRect.height,
                  toX: targetRect.x, toY: targetRect.y, toW: targetRect.width, toH: targetRect.height,
                  kind: "restore", rootKind: "source", ...flightDetails, contentScale: viewportScale(viewport),
                }, { onComplete: doRestore });
              } else {
                doRestore();
              }
            }}
          >
            <span className="emap-root-dock-icon" aria-hidden="true">S</span>
            <span className="emap-root-dock-copy">
              <span className="emap-root-dock-kind">Source</span>
              <span className="emap-root-dock-title">{label}</span>
              <span className="emap-root-dock-meta">{sourceNode?.outputPort.type ?? node.sourceNodeId}</span>
            </span>
          </button>
        );
        })}
        {hubTaskGroups.map((group) => {
        const taskCount = group.taskIds?.length ?? group.members?.length ?? group.taskNodeIds.length;
        return (
          <button
            key={`dock-group-${group.groupId}`}
            type="button"
            className="emap-root-dock-item emap-root-dock-item-group"
            data-kind="task-group"
            aria-label={`复原 Group ${group.title}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              wakeDock();
              onRestoreTaskGroup?.(group);
            }}
          >
            <span className="emap-root-dock-icon" aria-hidden="true">G</span>
            <span className="emap-root-dock-copy">
              <span className="emap-root-dock-kind">Group</span>
              <span className="emap-root-dock-title">{group.title}</span>
              <span className="emap-root-dock-meta">{taskCount} {taskCount === 1 ? "Task" : "Tasks"}</span>
              <span className={`emap-root-dock-state ${group.status}`}>{group.status}</span>
            </span>
          </button>
        );
        })}
      </div>
      {dockNodeCount > 0 && (
        <button
          type="button"
          className="emap-root-dock-page-btn emap-root-dock-page-btn-right"
          aria-label="Dock 向右翻页"
          disabled={!dockPageState.canPageRight}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            wakeDock();
            pageDock("right");
          }}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7.5 4.5 13 10l-5.5 5.5" />
          </svg>
        </button>
      )}
    </aside>
  );
  const flightOverlay = flightAnimation ? (() => {
    const safeFromW = Math.max(flightAnimation.fromW, 1);
    const safeFromH = Math.max(flightAnimation.fromH, 1);
    const safeToW = Math.max(flightAnimation.toW, 1);
    const safeToH = Math.max(flightAnimation.toH, 1);
    const restore = flightAnimation.kind === "restore";
    const baseX = restore ? flightAnimation.toX : flightAnimation.fromX;
    const baseY = restore ? flightAnimation.toY : flightAnimation.fromY;
    const baseW = restore ? safeToW : safeFromW;
    const baseH = restore ? safeToH : safeFromH;
    const fromTransform = restore
      ? `translate3d(${flightAnimation.fromX - flightAnimation.toX}px, ${flightAnimation.fromY - flightAnimation.toY}px, 0) scale(${safeFromW / safeToW}, ${safeFromH / safeToH})`
      : "translate3d(0, 0, 0) scale(1)";
    const toTransform = restore
      ? "translate3d(0, 0, 0) scale(1)"
      : `translate3d(${flightAnimation.toX - flightAnimation.fromX}px, ${flightAnimation.toY - flightAnimation.fromY}px, 0) scale(${Math.max(flightAnimation.toW / safeFromW, 0.3)}, ${Math.max(flightAnimation.toH / safeFromH, 0.3)})`;
    const style: CSSProperties = {
      left: `${baseX}px`,
      top: `${baseY}px`,
      width: `${baseW}px`,
      height: `${baseH}px`,
      transform: flightAnimation.phase === "to" ? toTransform : fromTransform,
      opacity: restore ? 1 : flightAnimation.phase === "to" ? 0.36 : 1,
    };
    (style as CSSProperties & Record<"--emap-flight-content-scale", string>)["--emap-flight-content-scale"] = String(Math.max(flightAnimation.contentScale, 0.3));
    const targetKindClass = flightAnimation.rootKind === "agent"
      ? "emap-agent-node"
      : flightAnimation.rootKind === "task"
        ? "emap-canvas-task-node"
        : "emap-source-node";
    return (
      <div
        className={`emap-root-dock-flight emap-root-dock-flight-${flightAnimation.rootKind}`}
        data-flight-kind={flightAnimation.kind}
        data-flight-phase={flightAnimation.phase}
        data-root-kind={flightAnimation.rootKind}
        style={style}
      >
        <div className="emap-root-dock-flight-face emap-root-dock-flight-dock-face" aria-hidden="true">
          <span className="emap-root-dock-icon">{DOCK_FLIGHT_KIND_LABELS[flightAnimation.rootKind][0]}</span>
          <span className="emap-root-dock-copy">
            <span className="emap-root-dock-kind">{DOCK_FLIGHT_KIND_LABELS[flightAnimation.rootKind]}</span>
            <span className="emap-root-dock-title">{flightAnimation.label}</span>
            {flightAnimation.meta && <span className="emap-root-dock-meta">{flightAnimation.meta}</span>}
          </span>
        </div>
        <div
          className={`emap-root-dock-flight-face emap-root-dock-flight-node-face emap-node emap-atlas-card ${targetKindClass} ${flightAnimation.targetNodeClass}`}
          data-agent-run-state={flightAnimation.targetState}
          aria-hidden="true"
        >
          <div className="emap-node-status-bar" />
          <div className="emap-node-content">
            <div className="emap-node-header">
              <span className="emap-node-kind">{DOCK_FLIGHT_KIND_LABELS[flightAnimation.rootKind]}</span>
              <span className={`emap-node-state-pill ${flightAnimation.targetPillClass}`}>{flightAnimation.targetPill}</span>
            </div>
            <div className="emap-node-body">
              <span className="emap-node-title">{flightAnimation.label}</span>
              {flightAnimation.targetLines.map((line, index) => (
                <span key={`${flightAnimation.id}-${index}`} className="emap-node-meta">{line}</span>
              ))}
            </div>
            {flightAnimation.targetTaskPorts && (flightAnimation.targetTaskPorts.inputs.length > 0 || flightAnimation.targetTaskPorts.outputs.length > 0) && (
              <div className="emap-task-ports" aria-hidden="true">
                {flightAnimation.targetTaskPorts.inputs.length > 0 && (
                  <div className="emap-task-port-row emap-task-port-row-input">
                    <span className="emap-task-port-direction">in</span>
                    {flightAnimation.targetTaskPorts.inputs.map((port) => (
                      <span
                        key={`${flightAnimation.id}-input-${port.id}`}
                        className={`emap-task-port-chip emap-task-port-input ${port.stateClass ?? ""}`}
                        data-port-id={port.id}
                        data-port-type={port.type}
                      >
                        <span>{port.label}</span>
                        <strong>{port.type}</strong>
                      </span>
                    ))}
                  </div>
                )}
                {flightAnimation.targetTaskPorts.outputs.length > 0 && (
                  <div className="emap-task-port-row emap-task-port-row-output">
                    <span className="emap-task-port-direction">out</span>
                    {flightAnimation.targetTaskPorts.outputs.map((port) => (
                      <span
                        key={`${flightAnimation.id}-output-${port.id}`}
                        className={`emap-task-port-chip emap-task-port-output ${port.stateClass ?? ""}`}
                        data-port-id={port.id}
                        data-port-type={port.type}
                      >
                        <span>{port.label}</span>
                        <strong>{port.type}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {flightAnimation.rootKind === "task" && onTaskDependencySourceSelect && (
            <span className={`emap-task-dep-handle ${flightAnimation.targetTaskDepHandleClass ?? ""}`} aria-hidden="true">
              <TaskDependencyHandleIcon />
            </span>
          )}
          <span className="emap-root-dock-flight-minimize">收</span>
        </div>
      </div>
    );
  })() : null;

  const trashEl = isAtlasDragging ? (
    <div
      ref={trashRef}
      className={`emap-root-trash${rootDropTarget === "trash" ? " is-visible is-hover" : " is-visible"}`}
      aria-label="移除根节点"
    >
      🗑
    </div>
  ) : null;

  const overlay = nodeHub || flightOverlay || trashEl ? (
    <>
      {nodeHub}
      {trashEl}
      {flightOverlay}
    </>
  ) : nodeHub;

  useLayoutEffect(() => {
    if (
      (maximizedBranch?.kind === "agent" && !agentBranchPanel)
      || (maximizedBranch?.kind === "task-panel" && !taskChildBranchPanelsLayout.some((p) => p.id === maximizedBranch.panelId))
    ) {
      setMaximizedBranch(null);
    }
  }, [agentBranchPanel, maximizedBranch, taskChildBranchPanelsLayout]);

  useEffect(() => {
    if (hasActiveTaskLayoutInteraction()) return;

    if (!taskBranchEntries.length) {
      setTaskBranchMeasuredSizes((current) => (Object.keys(current).length > 0 ? {} : current));
      return;
    }

    if (typeof ResizeObserver === "undefined") {
      const updates: TaskBranchMeasuredSizeMap = {};
      for (const entry of taskBranchEntries) {
        const element = taskBranchShellRefs.current[entry.id];
        if (!element) continue;
        const width = element.offsetWidth || TASK_MENU_BRANCH_WIDTH;
        const height = element.offsetHeight || TASK_MENU_BRANCH_HEIGHT;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
        updates[entry.id] = { width, height };
      }
      if (Object.keys(updates).length === 0) return;
      setTaskBranchMeasuredSizes((current) => {
        let changed = false;
        const next = { ...current };
        for (const [id, size] of Object.entries(updates)) {
          if (next[id]?.width !== size.width || next[id]?.height !== size.height) {
            next[id] = size;
            changed = true;
          }
        }
        return changed ? next : current;
      });
      return;
    }

    const elementIds = new Map<Element, string>();
    const observer = new ResizeObserver((entries) => {
      const updates: TaskBranchMeasuredSizeMap = {};
      for (const entry of entries) {
        const id = elementIds.get(entry.target);
        if (!id) continue;
        const width = Math.round(entry.contentRect.width) || TASK_MENU_BRANCH_WIDTH;
        const height = Math.round(entry.contentRect.height) || TASK_MENU_BRANCH_HEIGHT;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
        updates[id] = { width, height };
      }
      if (Object.keys(updates).length === 0) return;
      setTaskBranchMeasuredSizes((current) => {
        let changed = false;
        const next = { ...current };
        for (const [id, size] of Object.entries(updates)) {
          if (next[id]?.width !== size.width || next[id]?.height !== size.height) {
            next[id] = size;
            changed = true;
          }
        }
        return changed ? next : current;
      });
    });

    for (const entry of taskBranchEntries) {
      const element = taskBranchShellRefs.current[entry.id];
      if (!element) continue;
      elementIds.set(element, entry.id);
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [taskBranchEntries]);

  useEffect(() => {
    if (hasActiveTaskLayoutInteraction()) return;

    if (!taskChildBranchPanels?.length) {
      setPanelMeasuredHeights((current) => (Object.keys(current).length > 0 ? {} : current));
      return;
    }
    const autoPanels = taskChildBranchPanels.filter((p) => p.autoHeight);
    if (autoPanels.length === 0) return;
    const nodes = evidenceContainerRef.current?.querySelectorAll<HTMLElement>("[data-panel-id]");
    if (!nodes?.length) return;

    const autoPanelIds = new Set(autoPanels.map((p) => p.id));
    if (typeof ResizeObserver === "undefined") {
      const updated: Record<string, number> = {};
      for (const node of nodes) {
        const id = node.dataset.panelId;
        if (!id || !autoPanelIds.has(id)) continue;
        const panel = autoPanels.find((p) => p.id === id);
        const h = measureFallbackLayoutHeight(node, panel?.height ?? 120);
        if (!Number.isFinite(h) || h <= 0) continue;
        updated[id] = h;
      }
      if (Object.keys(updated).length === 0) return;
      setPanelMeasuredHeights((current) => {
        let changed = false;
        const next = { ...current };
        for (const [id, h] of Object.entries(updated)) {
          if ((current[id] ?? 0) !== h) {
            next[id] = h;
            changed = true;
          }
        }
        return changed ? next : current;
      });
      return;
    }

    const elementIds = new Map<Element, string>();
    const observer = new ResizeObserver((entries) => {
      const updated: Record<string, number> = {};
      for (const entry of entries) {
        const id = elementIds.get(entry.target);
        if (!id) continue;
        const h = Math.round(entry.contentRect.height);
        if (!Number.isFinite(h) || h <= 0) continue;
        updated[id] = h;
      }
      if (Object.keys(updated).length === 0) return;
      setPanelMeasuredHeights((current) => {
        let changed = false;
        const next = { ...current };
        for (const [id, h] of Object.entries(updated)) {
          if ((next[id] ?? 0) !== h) {
            next[id] = h;
            changed = true;
          }
        }
        return changed ? next : current;
      });
    });

    for (const node of nodes) {
      const id = node.dataset.panelId;
      if (!id) continue;
      if (!autoPanelIds.has(id)) continue;
      elementIds.set(node, id);
      observer.observe(node);
    }

    return () => observer.disconnect();
  }, [taskChildBranchPanels, taskChildBranchPanelsLayout]);

  const translateTaskSubtree = useCallback((
    scope: TaskSubtreeScope,
    dx: number,
    dy: number,
    nodeId?: string,
  ) => {
    const targetNodeId = nodeId ?? focusedTaskNode?.nodeId;
    if (!targetNodeId) return;

    const targetTaskBranchNode = (
      taskBranchEntries.find((entry) => entry.node.nodeId === targetNodeId)?.rect
      ?? (targetNodeId === focusedTaskNode?.nodeId ? taskBranchNode : null)
    );

    let panelIds: string[];
    if (scope === "root" || scope === "menu") {
      panelIds = [];
      const collectDescendants = (parentId: string) => {
        for (const p of taskChildBranchPanelsLayout) {
          if (p.sourceId === parentId) {
            panelIds.push(p.id);
            collectDescendants(p.id);
          }
        }
      };
      collectDescendants(taskMenuPanelId(targetNodeId));
    } else {
      panelIds = [];
      const collectDescendants = (parentId: string) => {
        for (const p of taskChildBranchPanelsLayout) {
          if (p.sourceId === parentId) {
            panelIds.push(p.id);
            collectDescendants(p.id);
          }
        }
      };
      collectDescendants(scope.panelId);
    }

    if (panelIds.length > 0) {
      setPanelPositionOverrides((prev) => {
        const next = { ...prev };
        for (const panelId of panelIds) {
          const layout = taskChildBranchPanelsLayout.find((p) => p.id === panelId);
          if (layout) {
            next[panelId] = { x: layout.rect.x + dx, y: layout.rect.y + dy };
          }
        }
        return next;
      });
    }

    if (scope === "root" && targetTaskBranchNode) {
      setTaskBranchPositionOverrides((prev) => ({
        ...prev,
        [targetNodeId]: { x: targetTaskBranchNode.x + dx, y: targetTaskBranchNode.y + dy },
      }));
    }
  }, [focusedTaskNode, taskBranchEntries, taskBranchNode, taskChildBranchPanelsLayout]);

  translateTaskSubtreeRef.current = translateTaskSubtree;

  const canStartTaskBranchDrag = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    if (!target.closest(".task-leader-branch-head")) return false;
    return !target.closest("button, input, textarea, select, a, iframe, summary, details, .task-action-menu-button, .task-leader-branch-collapse");
  }, []);

  const beginTaskBranchDrag = useCallback((entry: (typeof taskBranchEntries)[number], event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canStartTaskBranchDrag(event.target)) return;
    taskBranchDragRef.current = {
      nodeId: entry.node.nodeId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: { ...entry.rect },
      hasMoved: false,
      capturedTarget: null,
      lastDx: 0,
      lastDy: 0,
    };
  }, [canStartTaskBranchDrag]);

  const moveTaskBranchDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = taskBranchDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const scale = viewportScale(viewport);
    const dx = (event.clientX - drag.startClientX) / scale;
    const dy = (event.clientY - drag.startClientY) / scale;
    if (!drag.hasMoved && Math.abs(dx) < AGENT_DRAG_THRESHOLD && Math.abs(dy) < AGENT_DRAG_THRESHOLD) return;
    event.preventDefault();
    event.stopPropagation();
    if (!drag.hasMoved) {
      drag.hasMoved = true;
      const target = event.currentTarget;
      target.setPointerCapture?.(event.pointerId);
      drag.capturedTarget = target;
    }
    setTaskBranchPositionOverrides((prev) => {
      return { ...prev, [drag.nodeId]: { x: drag.startRect.x + dx, y: drag.startRect.y + dy } };
    });
    const incDx = dx - drag.lastDx;
    const incDy = dy - drag.lastDy;
    drag.lastDx = dx;
    drag.lastDy = dy;
    translateTaskSubtree("menu", incDx, incDy, drag.nodeId);
  }, [viewport, translateTaskSubtree]);

  const endTaskBranchDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = taskBranchDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.hasMoved) {
      event.preventDefault();
      event.stopPropagation();
      taskBranchDragSuppressClickRef.current = true;
    }
    if (drag.capturedTarget) {
      drag.capturedTarget.releasePointerCapture?.(event.pointerId);
    }
    taskBranchDragRef.current = null;
  }, []);

  const beginAgentBranchDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!focusedAgentNode || !agentBranchNode || !canStartAgentBranchDrag(event.target)) return;
    agentBranchInteractionRef.current = {
      kind: "drag",
      nodeId: focusedAgentNode.nodeId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: agentBranchNode,
      hasMoved: false,
      capturedTarget: null,
    };
  }, [agentBranchNode, focusedAgentNode]);

  const beginAgentBranchResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!focusedAgentNode || !agentBranchNode) return;
    event.preventDefault();
    event.stopPropagation();
    agentBranchInteractionRef.current = {
      kind: "resize",
      nodeId: focusedAgentNode.nodeId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: agentBranchNode,
    };
    event.currentTarget.parentElement?.setPointerCapture?.(event.pointerId);
  }, [agentBranchNode, focusedAgentNode]);

  const moveAgentBranch = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = agentBranchInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    const scale = viewportScale(viewport);
    const dx = (event.clientX - interaction.startClientX) / scale;
    const dy = (event.clientY - interaction.startClientY) / scale;

    if (interaction.kind === "drag") {
      if (!interaction.hasMoved && Math.abs(dx) < AGENT_DRAG_THRESHOLD && Math.abs(dy) < AGENT_DRAG_THRESHOLD) return;
      if (!interaction.hasMoved) {
        interaction.hasMoved = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        interaction.capturedTarget = event.currentTarget;
      }
    }

    event.preventDefault();
    event.stopPropagation();

    const nextRect = interaction.kind === "drag"
      ? clampAtlasRect({
        ...interaction.startRect,
        x: interaction.startRect.x + dx,
        y: interaction.startRect.y + dy,
      })
      : clampAtlasRect({
        ...interaction.startRect,
        width: interaction.startRect.width + dx,
        height: interaction.startRect.height + dy,
      });

    setAtlasRects((current) => ({
      ...current,
      [interaction.nodeId]: nextRect,
    }));
  }, [viewport]);

  const endAgentBranchInteraction = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = agentBranchInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.kind === "drag" && interaction.hasMoved) {
      event.preventDefault();
      event.stopPropagation();
      agentBranchDragSuppressClickRef.current = true;
    } else if (interaction.kind === "resize") {
      event.preventDefault();
      event.stopPropagation();
    }
    if (interaction.capturedTarget) {
      interaction.capturedTarget.releasePointerCapture?.(event.pointerId);
    }
    agentBranchInteractionRef.current = null;
  }, []);

  const beginPanelResize = useCallback((panelId: string, minWidth: number, minHeight: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const layoutEntry = taskChildBranchPanelsLayout.find((p) => p.id === panelId);
    const currentRect = layoutEntry?.rect;
    if (!currentRect) return;
    panelResizeRef.current = {
      panelId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: currentRect.width,
      startHeight: currentRect.height,
      minWidth: Math.max(360, minWidth),
      minHeight: Math.max(240, minHeight),
    };
    event.currentTarget.parentElement?.setPointerCapture?.(event.pointerId);
  }, [taskChildBranchPanelsLayout]);

  const movePanelResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panelResizeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const scale = viewportScale(viewport);
    const dx = (event.clientX - drag.startClientX) / scale;
    const dy = (event.clientY - drag.startClientY) / scale;
    setPanelSizeOverrides((current) => ({
      ...current,
      [drag.panelId]: {
        width: Math.max(drag.minWidth, drag.startWidth + dx),
        height: Math.max(drag.minHeight, drag.startHeight + dy),
      },
    }));
  }, [viewport]);

  const endPanelResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panelResizeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    panelResizeRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const canStartPanelDrag = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    return !target.closest("input, textarea, select, a, iframe, summary, details, .emap-panel-resize-handle");
  }, []);

  const beginPanelDrag = useCallback((panelId: string, event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canStartPanelDrag(event.target)) return;
    const layoutEntry = taskChildBranchPanelsLayout.find((p) => p.id === panelId);
    if (!layoutEntry) return;
    panelDragRef.current = {
      panelId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: { ...layoutEntry.rect },
      hasMoved: false,
      capturedTarget: null,
      lastDx: 0,
      lastDy: 0,
    };
  }, [canStartPanelDrag, taskChildBranchPanelsLayout]);

  const movePanelDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const scale = viewportScale(viewport);
    const dx = (event.clientX - drag.startClientX) / scale;
    const dy = (event.clientY - drag.startClientY) / scale;
    if (!drag.hasMoved && Math.abs(dx) < AGENT_DRAG_THRESHOLD && Math.abs(dy) < AGENT_DRAG_THRESHOLD) return;
    event.preventDefault();
    event.stopPropagation();
    if (!drag.hasMoved) {
      drag.hasMoved = true;
      const target = event.currentTarget;
      target.setPointerCapture?.(event.pointerId);
      drag.capturedTarget = target;
    }
    setPanelPositionOverrides((current) => ({
      ...current,
      [drag.panelId]: {
        x: drag.startRect.x + dx,
        y: drag.startRect.y + dy,
      },
    }));
    const incDx = dx - drag.lastDx;
    const incDy = dy - drag.lastDy;
    drag.lastDx = dx;
    drag.lastDy = dy;
    if (incDx !== 0 || incDy !== 0) {
      translateTaskSubtreeRef.current({ panelId: drag.panelId }, incDx, incDy);
    }
  }, [viewport]);

  const endPanelDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.hasMoved) {
      event.preventDefault();
      event.stopPropagation();
      panelDragSuppressClickRef.current = true;
    }
    if (drag.capturedTarget) {
      drag.capturedTarget.releasePointerCapture?.(event.pointerId);
    }
    panelDragRef.current = null;
  }, []);

  const isCollapsed = (id: string) => id.endsWith("__collapsed") || id.endsWith("__collapse_control");
  const parentOfCollapsed = (id: string) => id.replace(/__collapsed$|__collapse_control$/, "");
  return (
    <>
    {maximizedOverlay}
    <AtlasCanvasShell
      viewport={viewport}
      onViewportChange={onViewportChange}
      toolbarStart={toolbarStart}
      toolbarEnd={toolbarEnd}
      agentFocusId={focusedAgentNode?.agentId ?? null}
      interactionMode={interactionMode}
      onSelectionComplete={handleAtlasSelectionComplete}
      onCanvasPointerDown={clearAtlasSelection}
      overlay={overlay}
    >
        <svg
          className="execution-map-links"
          width={svgWidth}
          height={maxY + 40}
          viewBox={`-8 0 ${svgWidth} ${maxY + 40}`}
        >
          {layout.links.map((link) => {
            const highlighted = selectedChain.has(link.sourceId) && selectedChain.has(link.targetId);
            const sourcePos = layout.nodePositions.get(link.sourceId);
            const targetPos = layout.nodePositions.get(link.targetId);
            const linkType = sourcePos && targetPos && sourcePos.x === targetPos.x ? "emap-link-main" : "emap-link-branch";
            const sourceSocket = sourcePos && targetPos && sourcePos.x !== targetPos.x
              ? rightMiddleAnchor(sourcePos)
              : null;
            const path = (
              <path
                key={`${link.sourceId}-${link.targetId}`}
                d={link.path}
                className={`emap-link ${linkType} ${highlighted ? "emap-link-highlighted" : ""}`}
                fill="none"
                strokeWidth={2}
              />
            );
            if (!sourceSocket) return path;
            return (
              <g key={`${link.sourceId}-${link.targetId}`}>
                {path}
                {renderConnectorSourceSocket(
                  `${link.sourceId}-${link.targetId}-source-socket`,
                  sourceSocket,
                  "emap-connector-socket-task-branch",
                )}
              </g>
            );
          })}
          {evidenceLayout.links.map((link) => {
            const path = (
              <path
                key={link.id}
                d={link.path}
                className={`emap-link ${link.preview ? "emap-link-artifact-preview" : "emap-link-evidence"}`}
                fill="none"
                strokeWidth={1.5}
              />
            );
            if (!link.source) return path;
            return (
              <g key={link.id}>
                {path}
                {renderConnectorSourceSocket(
                  `${link.id}-source-socket`,
                  link.source,
                  link.socketClassName ?? "emap-connector-socket-evidence",
                )}
              </g>
            );
          })}
          {taskConnectionLinks.map(({ connection, path, source }) => {
            const linkCutKey = `task:${connection.connectionId}`;
            return (
              <g key={connection.connectionId}>
                <path
                  d={path}
                  className="emap-link emap-link-task-connection"
                  data-task-connection-id={connection.connectionId}
                  data-port-type={connection.type}
                  fill="none"
                  strokeWidth={2}
                />
                <path
                  d={path}
                  className="emap-link-hit-area"
                  data-link-cut-key={linkCutKey}
                  fill="none"
                  strokeWidth={18}
                  onMouseEnter={() => revealLinkCut(linkCutKey)}
                  onMouseLeave={() => hideLinkCut(linkCutKey)}
                  onPointerEnter={() => revealLinkCut(linkCutKey)}
                  onPointerLeave={() => hideLinkCut(linkCutKey)}
                />
                {renderConnectorSourceSocket(
                  `${connection.connectionId}-source-socket`,
                  source,
                  "emap-connector-socket-task-connection",
                )}
              </g>
            );
          })}
          {taskDependencyLinks.map(({ dep, path, source }) => {
            const linkCutKey = `dep:${dep.dependencyId}`;
            return (
              <g key={dep.dependencyId}>
                <path
                  d={path}
                  className="emap-link emap-link-task-dependency"
                  data-task-dependency-id={dep.dependencyId}
                  fill="none"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                />
                <path
                  d={path}
                  className="emap-link-hit-area"
                  data-link-cut-key={linkCutKey}
                  fill="none"
                  strokeWidth={18}
                  onMouseEnter={() => revealLinkCut(linkCutKey)}
                  onMouseLeave={() => hideLinkCut(linkCutKey)}
                  onPointerEnter={() => revealLinkCut(linkCutKey)}
                  onPointerLeave={() => hideLinkCut(linkCutKey)}
                />
                {renderConnectorSourceSocket(
                  `${dep.dependencyId}-source-socket`,
                  source,
                  "emap-connector-socket-task-dependency",
                )}
              </g>
            );
          })}
          {sourceConnectionLinks.map(({ connection, path, source }) => {
            const linkCutKey = `source:${connection.connectionId}`;
            return (
              <g key={connection.connectionId}>
                <path
                  d={path}
                  className="emap-link emap-link-source-connection"
                  data-source-connection-id={connection.connectionId}
                  data-port-type={connection.type}
                  fill="none"
                  strokeWidth={2}
                />
                <path
                  d={path}
                  className="emap-link-hit-area"
                  data-link-cut-key={linkCutKey}
                  fill="none"
                  strokeWidth={18}
                  onMouseEnter={() => revealLinkCut(linkCutKey)}
                  onMouseLeave={() => hideLinkCut(linkCutKey)}
                  onPointerEnter={() => revealLinkCut(linkCutKey)}
                  onPointerLeave={() => hideLinkCut(linkCutKey)}
                />
                {renderConnectorSourceSocket(
                  `${connection.connectionId}-source-socket`,
                  source,
                  "emap-connector-socket-source-connection",
                )}
              </g>
            );
          })}
          {agentBranchPath && (
            <path
              key="agent-playground-branch"
              d={agentBranchPath}
              className="emap-link emap-link-agent-branch"
              fill="none"
              strokeWidth={2}
            />
          )}
          {agentBranchAnchors && renderConnectorSourceSocket("agent-playground-branch-source-socket", agentBranchAnchors.source, "emap-connector-socket-agent-branch")}
          {taskBranchConnectors.map((connector) => (
            <g key={`task-leader-branch-${connector.id}`}>
              <path
                d={connector.path}
                className="emap-link emap-link-task-branch"
                fill="none"
                strokeWidth={2}
              />
              {renderConnectorSourceSocket(
                `task-leader-branch-source-socket-${connector.id}`,
                connector.anchors.source,
                "emap-connector-socket-task-branch",
              )}
            </g>
          ))}
          {taskChildBranchPanelsLayout.map((p) => (
            <g key={`task-child-panel-${p.id}`}>
              <path
                d={taskChildBranchConnectorPath(p.sourceRect, p.rect)}
                className="emap-link emap-link-task-branch emap-link-task-child-branch"
                fill="none"
                strokeWidth={2}
              />
              {renderConnectorSourceSocket(
                `task-child-panel-${p.id}-source-socket`,
                rightMiddleAnchor(p.sourceRect),
                "emap-connector-socket-task-child-branch",
              )}
            </g>
          ))}
        </svg>

        <div className="execution-map-nodes" ref={evidenceContainerRef} style={{ width: svgWidth, minHeight: maxY + 40 }}>
          {taskGroupRenderItems.map(({ group, rect, taskCount, memberRows, isEmpty }) => {
            const taskCountLabel = `${taskCount} ${taskCount === 1 ? "Task" : "Tasks"}`;
            const validationMessage = group.taskIds?.length === 0
              ? "Group 当前不可运行"
              : group.status === "invalid"
                ? group.validationErrors?.[0]?.message ?? "Group 当前不可运行"
                : "";
            const groupRunDisabled = group.groupRun
              ? group.groupRun.saving
                || isActiveTaskGroupRunView(group.groupRun)
                || Boolean(group.groupRun.blockedByActiveTask)
                || Boolean(validationMessage)
              : false;
            const runTitle = group.groupRun?.blockedByActiveTask
              ? "Group 内部已有 Task run 运行中"
              : validationMessage || "启动 GroupRun";
            return group.collapsed ? (
              <button
                key={group.groupId}
                type="button"
                className={`emap-task-group-card is-collapsed ${group.locked ? "is-locked" : ""}`}
                style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
                aria-label={`展开 ${group.title} ${taskCountLabel}`}
                data-task-group-id={group.groupId}
                data-task-group-empty={isEmpty ? "true" : "false"}
                data-task-group-locked={group.locked ? "true" : "false"}
                data-task-group-run-status={group.groupRun?.status ?? "mock"}
                onPointerDown={(event) => beginTaskGroupDrag(group, event)}
                onPointerMove={handleAgentPointerMove}
                onPointerUp={endTaskGroupPointer}
                onPointerCancel={endTaskGroupPointer}
                onClick={() => handleTaskGroupClick(group.groupId)}
              >
                <span className="emap-task-group-card-main">
                  <span className="emap-task-group-kicker">{group.locked ? "Locked Group" : "Group"}</span>
                  <strong>{group.title}</strong>
                </span>
                {group.groupRun && (
                  <span className={`emap-task-group-run-badge is-${group.groupRun.status}`}>
                    {TASK_GROUP_RUN_STATUS_LABELS[group.groupRun.status]}
                  </span>
                )}
                <span className="emap-task-group-count"><strong>{taskCount}</strong><span>{taskCount === 1 ? "Task" : "Tasks"}</span></span>
              </button>
            ) : (
              <div
                key={group.groupId}
                role="group"
                className={`emap-task-group-frame ${group.locked ? "is-locked" : ""}`}
                aria-label={group.title}
                style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
                data-task-group-id={group.groupId}
                data-task-group-empty={isEmpty ? "true" : "false"}
                data-task-group-locked={group.locked ? "true" : "false"}
                data-task-group-run-status={group.groupRun?.status ?? "mock"}
                onPointerDown={(event) => beginTaskGroupDrag(group, event)}
                onPointerMove={handleAgentPointerMove}
                onPointerUp={endTaskGroupPointer}
                onPointerCancel={endTaskGroupPointer}
              >
                <div className="emap-task-group-head">
                  <span className="emap-task-group-kicker">{group.locked ? "Locked Group" : "Group"}</span>
                  <strong>{group.title}</strong>
                  <span className="emap-task-group-task-count">{taskCountLabel}</span>
                  {group.groupRun && (
                    <>
                      <span className={`emap-task-group-run-badge is-${group.groupRun.status}`}>
                        {TASK_GROUP_RUN_STATUS_LABELS[group.groupRun.status]}
                      </span>
                      <span className="emap-task-group-run-count">
                        {group.groupRun.blockedByActiveTask ? "内部运行中" : `${group.groupRun.observedCount ?? 0} runs`}
                      </span>
                      <button
                        type="button"
                        aria-label={`运行 ${group.title}`}
                        className="emap-task-group-run-button"
                        disabled={groupRunDisabled}
                        title={runTitle}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!groupRunDisabled) onRunTaskGroup?.(group.groupId);
                        }}
                      >
                        {group.groupRun.saving ? "处理中" : "运行"}
                      </button>
                      {isActiveTaskGroupRunView(group.groupRun) && group.groupRun.groupRunId && (
                        <button
                          type="button"
                          aria-label={`终止 ${group.title}`}
                          className="emap-task-group-cancel-button"
                          disabled={group.groupRun.saving}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            onCancelTaskGroupRun?.(group.groupId, group.groupRun!.groupRunId!);
                          }}
                        >
                          终止
                        </button>
                      )}
                    </>
                  )}
                  {onAddSelectedTasksToTaskGroup && (
                    <button
                      type="button"
                      aria-label={`添加选中 ${group.title}`}
                      className="emap-task-group-add-selected-button"
                      disabled={group.locked || !group.canAddSelectedTasks}
                      title={group.locked ? "Group 已上锁" : "添加当前选中的 Task"}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!group.locked && group.canAddSelectedTasks) onAddSelectedTasksToTaskGroup(group.groupId);
                      }}
                    >
                      添加选中
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`${group.locked ? "解锁" : "上锁"} ${group.title}`}
                    className="emap-task-group-lock-button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleTaskGroupLock?.(group.groupId);
                    }}
                  >
                    {group.locked ? "解锁" : "上锁"}
                  </button>
                  <button
                    type="button"
                    aria-label={`移除 ${group.title}`}
                    className="emap-task-group-remove-button"
                    disabled={group.locked}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!group.locked) onDeleteTaskGroup?.(group.groupId);
                    }}
                  >
                    移除
                  </button>
                  {onMinimizeTaskGroup && (
                    <button
                      type="button"
                      aria-label={`收纳 ${group.title}`}
                      className="emap-task-group-dock-button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        onMinimizeTaskGroup(group);
                      }}
                    >
                      收纳
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`折叠 ${group.title}`}
                    className="emap-task-group-collapse-button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleTaskGroup?.(group.groupId);
                    }}
                  >
                    折叠
                  </button>
                </div>
                {memberRows.length > 0 && (
                  <div className="emap-task-group-members" aria-label={`${group.title} members`}>
                    {memberRows.map((row, rowIndex) => (
                      <div key={`${group.groupId}-member-row-${rowIndex}`} className="emap-task-group-member-row">
                        {row.map((member) => (
                          <span key={member.taskId} className="emap-task-group-member-chip">
                            <span>{member.title}</span>
                            {onRemoveTaskFromTaskGroup && (
                              <button
                                type="button"
                                aria-label={`移除成员 ${member.title}`}
                                disabled={group.locked}
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (!group.locked) onRemoveTaskFromTaskGroup(group.groupId, member.taskId);
                                }}
                              >
                                ×
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                <div className="emap-task-group-footer">
                  {renderNodeIdCopyButton("group", group.groupId)}
                  {validationMessage && (
                    <span className="emap-task-group-validation" role="status">{validationMessage}</span>
                  )}
                </div>
              </div>
            )
          })}
          {model && run && (
            <button
              type="button"
              className={`emap-node emap-root ${statusClass(run.status)} ${selectedTaskId === ROOT_ID ? "selected" : ""}`}
              style={{ left: layout.rootNode.x, top: layout.rootNode.y, width: NODE_WIDTH, height: layout.rootNode.height }}
              onClick={() => onSelectTask(ROOT_ID)}
            >
              <div className="emap-node-status-bar" />
              <div className="emap-node-content">
                <div className="emap-node-header">
                  <span className="emap-node-kind">{KIND_LABELS.root}</span>
                  <span className="emap-node-state-pill">{RUN_STATUS_LABELS[run.status]}</span>
                </div>
                <div className="emap-node-body">
                  <span className="emap-node-title">执行运行</span>
                  <span className="emap-node-summary">
                    {model.rootNode.succeeded}/{model.rootNode.totalTasks} 检查点
                  </span>
                </div>
              </div>
            </button>
          )}

          {visibleAgentNodes.map((node) => {
            const agent = agentsById?.get(node.agentId);
            if (!agent) return null;
            const isFocused = node.nodeId === focusedAgentNodeId;
            const isAtlasSelected = selectedAtlasNodeKeys.has(atlasSelectionKey("agent", node.nodeId));
            const runStatus = formatAgentRunStatus(agentRunStatusById?.get(agent.agentId));
            return (
              <div
                key={node.nodeId}
                role="button"
                tabIndex={0}
                className={`emap-node emap-atlas-card emap-agent-node ${runStatus.nodeClass} ${isFocused ? "selected" : ""} ${isAtlasSelected ? "is-atlas-selected" : ""}`}
                data-kind="agent"
                data-agent-id={agent.agentId}
                data-agent-run-state={runStatus.state}
                aria-label={agent.name}
                title={runStatus.title}
                style={{ left: node.position.x, top: node.position.y, width: NODE_WIDTH, height: AGENT_NODE_HEIGHT }}
                onPointerDown={(event) => handleAgentPointerDown(node, event)}
                onPointerMove={handleAgentPointerMove}
                onPointerUp={endAgentPointer}
                onPointerCancel={endAgentPointer}
                onClick={() => handleAgentClick(node)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  handleAgentClick(node);
                }}
              >
                <div className="emap-node-status-bar" />
                <div className="emap-node-content">
                  <div className="emap-node-header">
                    <span className="emap-node-kind">Agent</span>
                    <span className={`emap-node-state-pill ${runStatus.pillClass}`}>{runStatus.label}</span>
                  </div>
                  <div className="emap-node-body">
                    <span className="emap-node-title">{agent.name}</span>
                    {renderNodeIdCopyButton("agent", agent.agentId)}
                    <span className="emap-agent-description">{agent.description}</span>
                    <span className="emap-agent-binding">{formatAgentBinding(agent)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {visibleSourceNodes.map((node) => {
            const sourceNode = sourceNodesById?.get(node.sourceNodeId);
            if (!sourceNode) return null;
            const isAtlasSelected = selectedAtlasNodeKeys.has(atlasSelectionKey("source", node.nodeId));
            const outputPort = sourceNode.outputPort;
            const selected = Boolean(
              sourceConnectionDraft
              && sourceConnectionDraft.fromSourceNodeId === sourceNode.sourceNodeId
              && sourceConnectionDraft.fromOutputPortId === outputPort.id,
            );
            const textValue = sourceNode.content?.text ?? "";
            const fileName = sourceNode.content?.fileName ?? sourceNode.title;
            return (
              <div
                key={node.nodeId}
                role="group"
                className={`emap-node emap-atlas-card emap-source-node ${isAtlasSelected ? "is-atlas-selected" : ""}`}
                data-kind="canvas-source"
                data-source-node-id={sourceNode.sourceNodeId}
                aria-label={sourceNode.title}
                style={{ left: node.position.x, top: node.position.y, width: NODE_WIDTH, height: CANVAS_SOURCE_NODE_HEIGHT }}
                onPointerDown={(event) => handleSourcePointerDown(node, event)}
                onPointerMove={handleAgentPointerMove}
                onPointerUp={endAgentPointer}
                onPointerCancel={endAgentPointer}
              >
                <div className="emap-node-status-bar" />
                <div className="emap-node-content">
                  <div className="emap-node-header">
                    <span className="emap-node-kind">Source</span>
                    <span className="emap-node-state-pill source">{sourceNode.nodeType === "file" ? "file" : "text"}</span>
                  </div>
                  <div className="emap-node-body">
                    <span className="emap-node-title">{sourceNode.title}</span>
                    {sourceNode.nodeType === "text" ? (
                      <textarea
                        className="emap-source-text-input"
                        aria-label="文本输出内容"
                        defaultValue={textValue}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                        onBlur={(event) => onSourceTextChange?.(sourceNode.sourceNodeId, event.currentTarget.value)}
                      />
                    ) : (
                      <>
                        <span className="emap-node-meta">{fileName}</span>
                        {typeof sourceNode.content?.size === "number" && (
                          <span className="emap-node-meta">{sourceNode.content.size} bytes</span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="emap-task-ports emap-source-ports" aria-label={`${sourceNode.title} ports`}>
                    <div className="emap-task-port-row emap-task-port-row-output">
                      <span className="emap-task-port-direction">out</span>
                      <button
                        type="button"
                        className={`emap-task-port-chip emap-task-port-output emap-source-port-output ${selected ? "is-selected" : ""}`}
                        data-port-id={outputPort.id}
                        data-port-type={outputPort.type}
                        aria-label={`输出 ${sourcePortLabel(outputPort)} ${outputPort.type}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSourceOutputPortSelect?.(sourceNode.sourceNodeId, outputPort);
                        }}
                      >
                        <span>{sourcePortLabel(outputPort)}</span>
                        <strong>{outputPort.type}</strong>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {visibleTaskNodes.map((node) => {
            const task = tasksById?.get(node.taskId);
            if (!task) return null;
            const leader = agentsById?.get(task.leaderAgentId);
            const worker = agentsById?.get(task.workUnit.workerAgentId);
            const checker = agentsById?.get(task.workUnit.checkerAgentId);
            const isFocused = node.nodeId === focusedTaskNodeId;
            const isAtlasSelected = selectedAtlasNodeKeys.has(atlasSelectionKey("task", node.nodeId));
            const latestTaskRun = selectLatestCanvasTaskRun(taskRunsByTaskId[task.taskId]);
            const nodeStatusClass = latestTaskRun ? statusClass(latestTaskRun.status) : `status-${task.status}`;
            const isDiscoveryRoot = isDiscoveryRootTask(task);
            const discoverySummary = isDiscoveryRoot
              ? discoverySummariesByTaskId[task.taskId] ?? {
                generatedTaskCount: 0,
                activeGeneratedTaskCount: 0,
                staleGeneratedTaskCount: 0,
                runningGeneratedRunCount: 0,
                completedGeneratedRunCount: 0,
                failedDispatchCount: 0,
                dispatchProcessedCount: 0,
                stage: latestTaskRun?.status === "cancelled"
                  ? "cancelled"
                  : latestTaskRun && (latestTaskRun.status === "running" || latestTaskRun.status === "queued")
                    ? "discovering"
                    : "idle",
              }
              : null;
            const failedDispatchCount = discoverySummary?.failedDispatchCount ?? 0;
            const discoveryStage = discoverySummary?.stage ?? "idle";
            const inputPorts = task.workUnit.inputPorts ?? [];
            const outputPorts = task.workUnit.outputPorts ?? [];
            const portRowCount = canvasTaskPortRowCount(task);
            const nodeHeight = canvasTaskNodeHeight(task);
            const hasPorts = portRowCount > 0;
            return (
              <div
                key={node.nodeId}
                role="button"
                tabIndex={0}
                className={`emap-node emap-atlas-card emap-canvas-task-node ${isDiscoveryRoot ? "emap-discovery-task-node" : ""} ${nodeStatusClass} ${isFocused ? "selected" : ""} ${isAtlasSelected ? "is-atlas-selected" : ""}`}
                data-kind="canvas-task"
                data-canvas-kind={isDiscoveryRoot ? "discovery" : undefined}
                data-discovery-failed-dispatch-count={isDiscoveryRoot ? String(failedDispatchCount) : undefined}
                data-discovery-stage={isDiscoveryRoot ? discoveryStage : undefined}
                data-task-id={task.taskId}
                data-port-row-count={portRowCount}
                data-task-run-status={latestTaskRun?.status ?? "none"}
                aria-label={task.title}
                style={{ left: node.position.x, top: node.position.y, width: NODE_WIDTH, height: nodeHeight }}
                onPointerDown={(event) => handleTaskPointerDown(node, event)}
                onPointerMove={handleTaskPointerMove}
                onPointerUp={endTaskPointer}
                onPointerCancel={endTaskPointer}
                onClick={() => handleTaskClick(node)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  handleTaskClick(node);
                }}
              >
                <div className="emap-node-status-bar" />
                <div className="emap-node-content">
                  <div className="emap-node-header">
                    <span className="emap-node-kind">{isDiscoveryRoot ? "Discovery" : "Task"}</span>
                    <span className={`emap-node-state-pill ${latestTaskRun?.status ?? task.status}`}>
                      {latestTaskRun ? RUN_STATUS_LABELS[latestTaskRun.status] : task.status}
                    </span>
                  </div>
                  <div className="emap-node-body">
                    <span className="emap-node-title">{task.title}</span>
                    {renderNodeIdCopyButton("task", task.taskId)}
                    <div className="emap-task-agent-grid" aria-label={`${task.title} agents`}>
                      <span className="emap-task-agent-row role-leader" data-role="leader">
                        <b>Leader</b>
                        <em>{leader?.name ?? task.leaderAgentId}</em>
                      </span>
                      <span className="emap-task-agent-row role-worker" data-role="worker">
                        <b>Worker</b>
                        <em>{worker?.name ?? task.workUnit.workerAgentId}</em>
                      </span>
                      <span className="emap-task-agent-row role-checker" data-role="checker">
                        <b>Checker</b>
                        <em>{checker?.name ?? task.workUnit.checkerAgentId}</em>
                      </span>
                    </div>
                  </div>
                  {discoverySummary && (
                    <div className="emap-discovery-summary-row" aria-label={`${task.title} Discovery summary`}>
                      <span className={`emap-discovery-stage-pill stage-${discoveryStage}`}>{discoveryStageLabel(discoveryStage)}</span>
                      {discoverySummary.dispatchProcessedCount ? (
                        <span>{discoverySummary.dispatchProcessedCount} processed</span>
                      ) : null}
                      <span>{discoverySummary.generatedTaskCount} items</span>
                      <span>{discoverySummary.activeGeneratedTaskCount} active</span>
                      <span>{discoverySummary.staleGeneratedTaskCount} stale</span>
                      <span>{discoverySummary.runningGeneratedRunCount} running</span>
                      {failedDispatchCount > 0 && (
                        <span className="emap-discovery-summary-failed">{failedDispatchCount} blocked</span>
                      )}
                    </div>
                  )}
                  {hasPorts && (
                    <div className="emap-task-ports" aria-label={`${task.title} ports`}>
                      {inputPorts.length > 0 && (
                        <div className="emap-task-port-row emap-task-port-row-input">
                          <span className="emap-task-port-direction">in</span>
                          {inputPorts.map((port) => {
                            const compatible = taskConnectionDraft?.type === port.type || sourceConnectionDraft?.type === port.type;
                            return (
                              <button
                                key={port.id}
                                type="button"
                                className={`emap-task-port-chip emap-task-port-input ${compatible ? "is-compatible" : ""}`}
                                data-port-id={port.id}
                                data-port-type={port.type}
                                aria-label={`输入 ${taskPortLabel(port)} ${port.type}`}
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onTaskInputPortSelect?.(task.taskId, port);
                                }}
                              >
                                <span>{taskPortLabel(port)}</span>
                                <strong>{port.type}</strong>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {outputPorts.length > 0 && (
                        <div className="emap-task-port-row emap-task-port-row-output">
                          <span className="emap-task-port-direction">out</span>
                          {outputPorts.map((port) => {
                            const selected = taskConnectionDraft?.fromTaskId === task.taskId && taskConnectionDraft.fromOutputPortId === port.id;
                            return (
                              <button
                                key={port.id}
                                type="button"
                                className={`emap-task-port-chip emap-task-port-output ${selected ? "is-selected" : ""}`}
                                data-port-id={port.id}
                                data-port-type={port.type}
                                aria-label={`输出 ${taskPortLabel(port)} ${port.type}`}
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onTaskOutputPortSelect?.(task.taskId, port);
                                }}
                              >
                                <span>{taskPortLabel(port)}</span>
                                <strong>{port.type}</strong>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {onTaskDependencySourceSelect && (
                  <button
                    type="button"
                    className={`emap-task-dep-handle ${taskDependencyDraft?.fromTaskId === task.taskId ? "is-selected" : ""}`}
                    aria-label={
                      taskDependencyDraft?.fromTaskId === task.taskId
                        ? `已选依赖源: ${task.title}`
                        : taskDependencyDraft
                          ? `设为依赖目标: ${task.title}`
                          : `设为依赖源: ${task.title}`
                    }
                    title={
                      taskDependencyDraft?.fromTaskId === task.taskId
                        ? `已选依赖源: ${task.title}`
                        : taskDependencyDraft
                          ? `设为依赖目标: ${task.title}`
                          : `设为依赖源: ${task.title}`
                    }
                    data-dep-handle={taskDependencyDraft?.fromTaskId === task.taskId ? "selected-source" : taskDependencyDraft ? "target" : "source"}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (taskDependencyDraft && taskDependencyDraft.fromTaskId !== task.taskId) {
                        onTaskDependencyTargetSelect?.(task.taskId);
                      } else {
                        onTaskDependencySourceSelect(task.taskId);
                      }
                    }}
                  >
                    <TaskDependencyHandleIcon />
                  </button>
                )}
              </div>
            );
          })}

          {allNodes.flatMap((node) => {
            const pos = layout.nodePositions.get(node.nodeId);
            if (!pos) return [];

            const collapsed = isCollapsed(node.taskId);
            const chainSelected = collapsed
              ? selectedChain.has(parentOfCollapsed(node.taskId))
              : selectedChain.has(node.taskId);
            const isSelected = !collapsed && node.taskId === selectedTaskId;

            const nodeContent = (
              <>
                <div className="emap-node-status-bar" />
                <div className="emap-node-content">
                  <div className="emap-node-header">
                    <span className={`emap-node-kind ${node.kind === "orphan" ? "kind-orphan" : ""}`}>
                      {KIND_LABELS[collapsed ? "collapsed" : node.kind]}
                    </span>
                    <span className={`emap-node-state-pill ${node.status}`}>{TASK_STATUS_LABELS[node.status]}</span>
                  </div>
                  <div className="emap-node-body">
                    <span className="emap-node-title">{node.title}</span>
                    {node.errorFirstLine ? (
                      <span className="emap-node-error">{node.errorFirstLine}</span>
                    ) : (
                      <span className="emap-node-meta">
                        {node.resultRef ? "已有结果" : node.attemptCount > 0 ? `尝试 ${node.attemptCount}` : "等待中"}
                      </span>
                    )}
                  </div>
                </div>
              </>
            );

            const className = `emap-node ${statusClass(node.status)} ${isSelected ? "selected" : ""} ${chainSelected ? "chain-selected" : ""} ${collapsed ? "emap-collapsed" : ""}`;
            const style = { left: pos.x, top: pos.y, width: pos.width, height: pos.height };

            const taskElement = collapsed ? (
              <button
                type="button"
                key={node.nodeId}
                className={className}
                data-kind="collapsed"
                style={style}
                onClick={() => toggleExpand(parentOfCollapsed(node.taskId))}
                aria-label={node.taskId.endsWith("__collapse_control") ? `收起 ${node.attemptCount} 个子任务` : `展开 ${node.attemptCount} 个子任务`}
              >
                {nodeContent}
              </button>
            ) : (
              <button
                key={node.nodeId}
                type="button"
                className={className}
                data-kind={node.kind}
                style={style}
                onClick={() => onSelectTask(node.taskId)}
              >
                {nodeContent}
              </button>
            );

            if (!isSelected) return [taskElement];

            const evidenceElements = evidenceLayout.positions.map((e) => {
              const canPreview = Boolean(e.previewFile && readAttemptFile);
              const className = `emap-evidence-node ${canPreview ? "emap-artifact-node" : "emap-evidence-static"} emap-evidence-${e.kind}`;
              const style = { left: e.x, top: e.y, width: e.width, minHeight: e.height };
              const content = (
                <>
                <div className="emap-evidence-header">
                  <span className="emap-evidence-title">{e.title}</span>
                  {e.tag && e.tagClass && <span className={`emap-evidence-tag ${e.tagClass}`}>{e.tag}</span>}
                </div>
                {e.content && <span className="emap-evidence-content">{e.content}</span>}
                {e.path && <span className="emap-evidence-path">{e.path}</span>}
                </>
              );

              if (!canPreview) {
                return (
                  <div
                    key={e.id}
                    data-evidence-id={e.id}
                    className={className}
                    style={style}
                  >
                    {content}
                  </div>
                );
              }

              return (
                <button
                  type="button"
                  key={e.id}
                  data-evidence-id={e.id}
                  className={className}
                  style={style}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleArtifactClick(e);
                  }}
                >
                  {content}
                </button>
              );
            });

            const previewElement = evidenceLayout.preview ? (
              <div
                key={`${evidenceLayout.preview.entry.id}__preview`}
                data-testid="artifact-preview"
                data-preview-id={evidenceLayout.preview.entry.id}
                className="emap-artifact-preview"
                style={{
                  left: evidenceLayout.preview.x,
                  top: evidenceLayout.preview.y,
                  width: evidenceLayout.preview.width,
                  minHeight: evidenceLayout.preview.height,
                }}
              >
                <div className="emap-artifact-preview-header">
                  <span>预览</span>
                  <code>{evidenceLayout.preview.state.fileName}</code>
                </div>
                {renderPreviewContent(evidenceLayout.preview.state)}
              </div>
            ) : null;

            return previewElement ? [taskElement, ...evidenceElements, previewElement] : [taskElement, ...evidenceElements];
          })}
          {agentBranchNode && agentBranchPanel && maximizedBranch?.kind !== "agent" && (
            <div
              className="emap-agent-branch-shell"
              onPointerDownCapture={beginAgentBranchDrag}
              onPointerMove={moveAgentBranch}
              onPointerUp={endAgentBranchInteraction}
              onPointerCancel={endAgentBranchInteraction}
              onDoubleClick={(event) => {
                if (!canTogglePanelMaximize(event.target)) return;
                event.stopPropagation();
                setMaximizedBranch({ kind: "agent" });
              }}
              onClickCapture={(e) => {
                if (agentBranchDragSuppressClickRef.current) {
                  agentBranchDragSuppressClickRef.current = false;
                  if (!(e.target instanceof Element && e.target.closest("button, input, textarea, select, a, iframe, summary, details"))) {
                    e.stopPropagation();
                  }
                }
              }}
              style={{
                left: agentBranchNode.x,
                top: agentBranchNode.y,
                width: agentBranchNode.width,
                height: agentBranchNode.height,
              }}
            >
              {agentBranchPanel}
              <button
                type="button"
                className="emap-agent-branch-maximize-button"
                aria-label="最大化对话分支"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setMaximizedBranch({ kind: "agent" });
                }}
              >
                ⛶
              </button>
              <button
                type="button"
                className="emap-agent-branch-resize-handle"
                aria-label="调整对话分支大小"
                onPointerDown={beginAgentBranchResize}
              />
            </div>
          )}
          {taskBranchEntries.map((entry) => {
            return (
              <div
                key={`task-branch-${entry.id}`}
                ref={(el: HTMLDivElement | null) => { taskBranchShellRefs.current[entry.id] = el; }}
                className="emap-task-branch-shell"
                onPointerDownCapture={(event) => beginTaskBranchDrag(entry, event)}
                onPointerMove={moveTaskBranchDrag}
                onPointerUp={endTaskBranchDrag}
                onPointerCancel={endTaskBranchDrag}
                onClickCapture={(e) => {
                  if (taskBranchDragSuppressClickRef.current) {
                    taskBranchDragSuppressClickRef.current = false;
                    e.stopPropagation();
                  }
                }}
                style={{
                  left: entry.rect.x,
                  top: entry.rect.y,
                  width: "max-content",
                  minWidth: TASK_MENU_BRANCH_MIN_WIDTH,
                  height: "auto",
                }}
              >
                {entry.panel}
              </div>
            );
          })}
          {taskChildBranchPanelsLayout.filter((p) => !(maximizedBranch?.kind === "task-panel" && maximizedBranch.panelId === p.id)).map((p) => (
            <div
              key={`task-child-panel-${p.id}`}
              data-panel-id={p.id}
              data-panel-source-id={p.sourceId ?? ""}
              className={`emap-task-child-branch-shell${p.resizable ? " emap-panel-resizable" : ""}`}
              onPointerDownCapture={(e) => beginPanelDrag(p.id, e)}
              onPointerMove={(e) => { movePanelDrag(e); if (p.resizable) movePanelResize(e); }}
              onPointerUp={(e) => { endPanelDrag(e); if (p.resizable) endPanelResize(e); }}
              onPointerCancel={(e) => { endPanelDrag(e); if (p.resizable) endPanelResize(e); }}
              onDoubleClick={(event) => {
                if (!canTogglePanelMaximize(event.target)) return;
                event.stopPropagation();
                setMaximizedBranch({ kind: "task-panel", panelId: p.id });
              }}
              onClickCapture={(e) => {
                if (panelDragSuppressClickRef.current) {
                  panelDragSuppressClickRef.current = false;
                  const target = e.target instanceof Element ? e.target : null;
                  const allowPanelControlClick = target?.closest(
                    ".emap-agent-branch-maximize-button, .emap-panel-resize-handle, .emap-observer-node-close, .task-leader-branch-collapse, .agent-playground-branch-collapse, .task-action-menu-button, input, textarea, select, a, iframe, summary, details",
                  );
                  if (!allowPanelControlClick) {
                    e.stopPropagation();
                  }
                }
              }}
              style={{
                left: p.rect.x,
                top: p.rect.y,
                width: p.rect.width,
                ...(p.autoHeight ? {} : { height: p.rect.height }),
              }}
            >
              {p.panel}
              {p.maximizable && (
                <button
                  type="button"
                  className="emap-agent-branch-maximize-button"
                  aria-label="最大化对话分支"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setMaximizedBranch({ kind: "task-panel", panelId: p.id });
                  }}
                >
                  ⛶
                </button>
              )}
              {p.resizable && (
                <button
                  type="button"
                  className="emap-panel-resize-handle"
                  aria-label="调整面板大小"
                  onPointerDown={(event) => beginPanelResize(p.id, p.minWidth ?? 360, p.minHeight ?? 240, event)}
                />
              )}
            </div>
          ))}
          {taskConnectionLinks.map(({ connection, source, target }) => {
            const sourceTitle = tasksById?.get(connection.fromTaskId)?.title ?? connection.fromTaskId;
            const targetTitle = tasksById?.get(connection.toTaskId)?.title ?? connection.toTaskId;
            const { x: mx, y: my } = linkMidpoint(source, target);
            const isPending = pendingDeleteConnectionId === connection.connectionId;
            const linkCutKey = `task:${connection.connectionId}`;
            const isVisible = hoveredLinkCutKey === linkCutKey || isPending;
            return (
              <button
                key={`cut-tc-${connection.connectionId}`}
                type="button"
                className={`emap-link-cut-button emap-link-cut-task${isVisible ? " is-visible" : ""}${isPending ? " is-pending" : ""}`}
                style={{ left: mx, top: my }}
                data-link-cut-button-key={linkCutKey}
                data-visible={isVisible ? "true" : "false"}
                aria-label={`切断 Task 连接: ${sourceTitle} -> ${targetTitle}`}
                aria-busy={isPending || undefined}
                disabled={isPending}
                onMouseEnter={() => revealLinkCut(linkCutKey)}
                onMouseLeave={() => hideLinkCut(linkCutKey)}
                onPointerEnter={() => revealLinkCut(linkCutKey)}
                onPointerLeave={() => hideLinkCut(linkCutKey)}
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteTaskConnection?.(connection.connectionId);
                }}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="3" y1="3" x2="13" y2="13" />
                  <line x1="13" y1="3" x2="3" y2="13" />
                </svg>
              </button>
            );
          })}
          {sourceConnectionLinks.map(({ connection, source, target }) => {
            const srcNode = sourceNodesById?.get(connection.fromSourceNodeId);
            const sourceTitle = srcNode?.title ?? connection.fromSourceNodeId;
            const targetTitle = tasksById?.get(connection.toTaskId)?.title ?? connection.toTaskId;
            const { x: mx, y: my } = linkMidpoint(source, target);
            const isPending = pendingDeleteSourceConnectionId === connection.connectionId;
            const linkCutKey = `source:${connection.connectionId}`;
            const isVisible = hoveredLinkCutKey === linkCutKey || isPending;
            return (
              <button
                key={`cut-sc-${connection.connectionId}`}
                type="button"
                className={`emap-link-cut-button emap-link-cut-source${isVisible ? " is-visible" : ""}${isPending ? " is-pending" : ""}`}
                style={{ left: mx, top: my }}
                data-link-cut-button-key={linkCutKey}
                data-visible={isVisible ? "true" : "false"}
                aria-label={`切断 Source 连接: ${sourceTitle} -> ${targetTitle}`}
                aria-busy={isPending || undefined}
                disabled={isPending}
                onMouseEnter={() => revealLinkCut(linkCutKey)}
                onMouseLeave={() => hideLinkCut(linkCutKey)}
                onPointerEnter={() => revealLinkCut(linkCutKey)}
                onPointerLeave={() => hideLinkCut(linkCutKey)}
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteSourceConnection?.(connection.connectionId);
                }}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="3" y1="3" x2="13" y2="13" />
                  <line x1="13" y1="3" x2="3" y2="13" />
                </svg>
              </button>
            );
          })}
          {taskDependencyLinks.map(({ dep, source, target }) => {
            const sourceTitle = tasksById?.get(dep.fromTaskId)?.title ?? dep.fromTaskId;
            const targetTitle = tasksById?.get(dep.toTaskId)?.title ?? dep.toTaskId;
            const { x: mx, y: my } = linkMidpoint(source, target);
            const isPending = pendingDeleteDependencyId === dep.dependencyId;
            const linkCutKey = `dep:${dep.dependencyId}`;
            const isVisible = hoveredLinkCutKey === linkCutKey || isPending;
            return (
              <button
                key={`cut-dep-${dep.dependencyId}`}
                type="button"
                className={`emap-link-cut-button emap-link-cut-dep${isVisible ? " is-visible" : ""}${isPending ? " is-pending" : ""}`}
                style={{ left: mx, top: my }}
                data-link-cut-button-key={linkCutKey}
                data-visible={isVisible ? "true" : "false"}
                aria-label={`切断依赖: ${sourceTitle} -> ${targetTitle}`}
                aria-busy={isPending || undefined}
                disabled={isPending}
                onMouseEnter={() => revealLinkCut(linkCutKey)}
                onMouseLeave={() => hideLinkCut(linkCutKey)}
                onPointerEnter={() => revealLinkCut(linkCutKey)}
                onPointerLeave={() => hideLinkCut(linkCutKey)}
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteTaskDependency?.(dep.dependencyId);
                }}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="3" y1="3" x2="13" y2="13" />
                  <line x1="13" y1="3" x2="3" y2="13" />
                </svg>
              </button>
            );
          })}
        </div>
    </AtlasCanvasShell>
    </>
  );
}
