import { useMemo, useLayoutEffect, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { AgentRunStatus, AgentSummary, RunDetail, TeamCanvasSourceConnection, TeamCanvasSourceNode, TeamCanvasTask, TeamPlan, TaskStatus, TeamAttemptMetadata, TeamTaskState, TeamRunState, TeamTaskConnection, TeamTaskInputPort, TeamTaskOutputPort } from "../api/team-types";
import type { ExecutionNode, NodeKind } from "./execution-map-model";
import { buildExecutionMapModel, CHILD_COLLAPSE_THRESHOLD } from "./execution-map-model";
import { layoutExecutionMap, ROOT_ID, NODE_WIDTH, straightPath, type ExecutionMapLayout } from "./execution-map-layout";
import { RUN_STATUS_LABELS, TASK_STATUS_LABELS } from "../shared/status";
import { AtlasCanvasShell, type AtlasInteractionMode, type AtlasSelectionRect, type AtlasViewport } from "./AtlasCanvasShell";
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

interface ExecutionMapProps {
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
  onRemoveAgent?: (node: AtlasAgentNode, agent: AgentSummary) => void;
  canMoveAgents?: boolean;
  agentBranchPanel?: ReactNode;
  taskNodes?: AtlasTaskNode[];
  tasksById?: Map<string, TeamCanvasTask>;
  taskConnections?: TeamTaskConnection[];
  taskConnectionDraft?: { fromTaskId: string; fromOutputPortId: string; type: string } | null;
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
  onArchiveCanvasTask?: (node: AtlasTaskNode, task: TeamCanvasTask) => void;
  onTaskOutputPortSelect?: (taskId: string, port: TeamTaskOutputPort) => void;
  onTaskInputPortSelect?: (taskId: string, port: TeamTaskInputPort) => void;
  onMoveSourceNode?: (nodeId: string, position: { x: number; y: number }) => void;
  minimizedSourceNodeIds?: string[];
  onMinimizeSourceNode?: (node: AtlasSourceNode) => void;
  onRestoreSourceNode?: (node: AtlasSourceNode) => void;
  onArchiveSourceNode?: (node: AtlasSourceNode, sourceNode: TeamCanvasSourceNode) => void;
  onSourceOutputPortSelect?: (sourceNodeId: string, port: TeamCanvasSourceNode["outputPort"]) => void;
  onSourceTextChange?: (sourceNodeId: string, text: string) => void;
  canMoveTasks?: boolean;
  canMoveSourceNodes?: boolean;
  taskBranchPanel?: ReactNode;
  taskBranchPanels?: Array<{
    id: string;
    nodeId: string;
    panel: ReactNode;
  }>;
  taskChildBranchPanel?: ReactNode;
  taskChildBranchInteractive?: boolean;
  taskChildBranchPanels?: Array<{
    id: string;
    panel: ReactNode;
    width?: number;
    height?: number;
    sourceId?: string;
    interactive?: boolean;
    autoHeight?: boolean;
    resizable?: boolean;
    minWidth?: number;
    minHeight?: number;
  }>;
  viewport?: AtlasViewport;
  onViewportChange?: (viewport: AtlasViewport) => void;
  toolbarStart?: ReactNode;
  interactionMode?: AtlasInteractionMode;
}

type TaskChildBranchPanelDescriptor = NonNullable<ExecutionMapProps["taskChildBranchPanels"]>[number];

type MaximizedPanelState =
  | { kind: "agent" }
  | { kind: "task-child" }
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

export type AtlasSourceNode = {
  nodeId: string;
  kind: "canvas-source";
  sourceNodeId: string;
  position: { x: number; y: number };
};

const EVIDENCE_W = 240;
const EVIDENCE_GAP = 12;
const PREVIEW_W = 360;
const PREVIEW_GAP = 40;
const PREVIEW_FALLBACK_HEIGHT = 180;
const AGENT_NODE_HEIGHT = 112;
const CANVAS_TASK_NODE_HEIGHT = 168;
const CANVAS_SOURCE_NODE_HEIGHT = 166;
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
};

type AtlasNodeDragState = {
  primaryNodeId: string;
  primaryKind: "agent" | "task" | "source";
  pointerId: number;
  startClientX: number;
  startClientY: number;
  entries: AtlasNodeDragEntry[];
  hasMoved: boolean;
  lastTreeDx?: number;
  lastTreeDy?: number;
};

type AgentBranchRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type AgentBranchInteractionState = {
  kind: "drag" | "resize";
  nodeId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startRect: AgentBranchRect;
  hasMoved?: boolean;
  capturedTarget?: HTMLDivElement | null;
};

type TaskBranchMeasuredSize = {
  nodeId: string;
  width: number;
  height: number;
};

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

function canStartAgentBranchDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (!target.closest(".agent-playground-branch-head") && !target.closest(".task-leader-branch-head")) return false;
  return !target.closest("button, input, textarea, select, a, iframe, summary, details");
}

function canTogglePanelMaximize(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (
    !target.closest(".agent-playground-branch-head")
    && !target.closest(".task-leader-branch-head")
    && !target.closest(".emap-observer-node-head")
  ) {
    return false;
  }
  return !target.closest("button, input, textarea, select, a, iframe, summary, details, .emap-panel-resize-handle, .emap-agent-branch-resize-handle");
}

function viewportScale(viewport: AtlasViewport | undefined): number {
  return viewport && Number.isFinite(viewport.scale) && viewport.scale > 0 ? viewport.scale : 1;
}

function clampAgentBranchRect(rect: AgentBranchRect): AgentBranchRect {
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

function agentBranchConnectorPath(agentNode: AtlasAgentNode, branchRect: AgentBranchRect): string {
  const agentRect = {
    x: agentNode.position.x,
    y: agentNode.position.y,
    width: NODE_WIDTH,
    height: AGENT_NODE_HEIGHT,
  };
  return rightMiddleToLeftTopPath(agentRect, branchRect);
}

function rightMiddleToLeftTopPath(sourceRect: AgentBranchRect, targetRect: AgentBranchRect): string {
  const sx = sourceRect.x + sourceRect.width;
  const sy = sourceRect.y + sourceRect.height / 2;
  const tx = targetRect.x;
  const ty = targetRect.y;
  return straightPath(sx, sy, tx, ty);
}

function taskNodeRect(taskNode: AtlasTaskNode): AgentBranchRect {
  return {
    x: taskNode.position.x,
    y: taskNode.position.y,
    width: NODE_WIDTH,
    height: CANVAS_TASK_NODE_HEIGHT,
  };
}

function sourceNodeRect(sourceNode: AtlasSourceNode): AgentBranchRect {
  return {
    x: sourceNode.position.x,
    y: sourceNode.position.y,
    width: NODE_WIDTH,
    height: CANVAS_SOURCE_NODE_HEIGHT,
  };
}

function rightMiddleAnchor(rect: AgentBranchRect): { x: number; y: number } {
  return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
}

function leftTopAnchor(rect: AgentBranchRect): { x: number; y: number } {
  return { x: rect.x, y: rect.y };
}

function connectorAnchors(sourceRect: AgentBranchRect, targetRect: AgentBranchRect) {
  return {
    source: rightMiddleAnchor(sourceRect),
    target: leftTopAnchor(targetRect),
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

function taskBranchConnectorPath(taskNode: AtlasTaskNode, branchRect: AgentBranchRect): string {
  return rightMiddleToLeftTopPath(taskNodeRect(taskNode), branchRect);
}

function taskChildBranchConnectorPath(menuRect: AgentBranchRect, childRect: AgentBranchRect): string {
  return rightMiddleToLeftTopPath(menuRect, childRect);
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

function taskConnectionPoints(
  connection: TeamTaskConnection,
  taskNodeByTaskId: Map<string, AtlasTaskNode>,
  tasksById: Map<string, TeamCanvasTask> | undefined,
): { source: { x: number; y: number }; target: { x: number; y: number } } | null {
  const sourceNode = taskNodeByTaskId.get(connection.fromTaskId);
  const targetNode = taskNodeByTaskId.get(connection.toTaskId);
  const sourceTask = tasksById?.get(connection.fromTaskId);
  const targetTask = tasksById?.get(connection.toTaskId);
  if (!sourceNode || !targetNode || !sourceTask || !targetTask) return null;
  const outputPorts = sourceTask.workUnit.outputPorts ?? [];
  const inputPorts = targetTask.workUnit.inputPorts ?? [];
  const sourcePort = outputPorts.find((port) => port.id === connection.fromOutputPortId);
  const targetPort = inputPorts.find((port) => port.id === connection.toInputPortId);
  if (!sourcePort || sourcePort.type !== connection.type) return null;
  if (!targetPort || targetPort.type !== connection.type) return null;
  return connectorAnchors(taskNodeRect(sourceNode), taskNodeRect(targetNode));
}

function sourceConnectionPoints(
  connection: TeamCanvasSourceConnection,
  sourceNodeBySourceId: Map<string, AtlasSourceNode>,
  taskNodeByTaskId: Map<string, AtlasTaskNode>,
  sourceNodesById: Map<string, TeamCanvasSourceNode> | undefined,
  tasksById: Map<string, TeamCanvasTask> | undefined,
): { source: { x: number; y: number }; target: { x: number; y: number } } | null {
  const sourceNode = sourceNodeBySourceId.get(connection.fromSourceNodeId);
  const targetNode = taskNodeByTaskId.get(connection.toTaskId);
  const source = sourceNodesById?.get(connection.fromSourceNodeId);
  const targetTask = tasksById?.get(connection.toTaskId);
  if (!sourceNode || !targetNode || !source || !targetTask) return null;
  const targetPort = targetTask.workUnit.inputPorts?.find((port) => port.id === connection.toInputPortId);
  if (source.outputPort.id !== connection.fromOutputPortId || source.outputPort.type !== connection.type) return null;
  if (!targetPort || targetPort.type !== connection.type) return null;
  return connectorAnchors(sourceNodeRect(sourceNode), taskNodeRect(targetNode));
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

function measureLayoutHeight(node: HTMLElement, fallback: number): number {
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
  onRemoveAgent,
  canMoveAgents = true,
  agentBranchPanel,
  taskNodes = [],
  tasksById,
  taskConnections = [],
  taskConnectionDraft = null,
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
  onArchiveCanvasTask,
  onTaskOutputPortSelect,
  onTaskInputPortSelect,
  onMoveSourceNode,
  minimizedSourceNodeIds = [],
  onMinimizeSourceNode,
  onRestoreSourceNode,
  onArchiveSourceNode,
  onSourceOutputPortSelect,
  onSourceTextChange,
  canMoveTasks = true,
  canMoveSourceNodes = true,
  taskBranchPanel,
  taskBranchPanels,
  taskChildBranchPanel,
  taskChildBranchInteractive = false,
  taskChildBranchPanels,
  viewport,
  onViewportChange,
  toolbarStart,
  interactionMode = "free",
}: ExecutionMapProps) {
  const evidenceContainerRef = useRef<HTMLDivElement | null>(null);
  const [measuredHeights, setMeasuredHeights] = useState<MeasuredHeights>({});
  const [previewHeights, setPreviewHeights] = useState<MeasuredHeights>({});
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [artifactPreviewState, setArtifactPreviewState] = useState<Record<string, ArtifactPreviewState>>({});
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [agentBranchRects, setAgentBranchRects] = useState<Record<string, AgentBranchRect>>({});
  const [taskChildBranchRects, setTaskChildBranchRects] = useState<Record<string, AgentBranchRect>>({});
  const [taskBranchMeasuredSize, setTaskBranchMeasuredSize] = useState<TaskBranchMeasuredSize | null>(null);
  const [selectedAtlasNodeKeys, setSelectedAtlasNodeKeys] = useState<Set<string>>(new Set());
  const [maximizedBranch, setMaximizedBranch] = useState<MaximizedPanelState>(null);
  const [panelSizeOverrides, setPanelSizeOverrides] = useState<Record<string, { width: number; height: number }>>({});
  const [panelPositionOverrides, setPanelPositionOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [taskBranchPositionOverrides, setTaskBranchPositionOverrides] = useState<Record<string, { x: number; y: number }>>({});
  const [panelMeasuredHeights, setPanelMeasuredHeights] = useState<Record<string, number>>({});
  const prevSelectionRef = useRef<string | null>(null);
  const taskBranchShellRef = useRef<HTMLDivElement | null>(null);
  const atlasNodeDragRef = useRef<AtlasNodeDragState | null>(null);
  const suppressAgentClickRef = useRef<string | null>(null);
  const suppressTaskClickRef = useRef<string | null>(null);
  const agentBranchInteractionRef = useRef<AgentBranchInteractionState | null>(null);
  const taskChildBranchInteractionRef = useRef<AgentBranchInteractionState | null>(null);
  const taskChildDragSuppressClickRef = useRef(false);
  const panelResizeRef = useRef<{ panelId: string; pointerId: number; startClientX: number; startClientY: number; startWidth: number; startHeight: number; minWidth: number; minHeight: number } | null>(null);
  const panelDragRef = useRef<{ panelId: string; pointerId: number; startClientX: number; startClientY: number; startRect: AgentBranchRect; hasMoved: boolean; capturedTarget: HTMLDivElement | null; lastDx: number; lastDy: number } | null>(null);
  const panelDragSuppressClickRef = useRef(false);
  const taskBranchDragRef = useRef<{ nodeId: string; pointerId: number; startClientX: number; startClientY: number; startRect: AgentBranchRect; hasMoved: boolean; capturedTarget: HTMLDivElement | null; lastDx: number; lastDy: number } | null>(null);
  const taskBranchDragSuppressClickRef = useRef(false);
  const translateTaskSubtreeRef = useRef<(scope: TaskSubtreeScope, dx: number, dy: number, nodeId?: string) => void>(() => {});
  const minimizedAgentNodeIdSet = useMemo(() => new Set(minimizedAgentNodeIds), [minimizedAgentNodeIds]);
  const minimizedTaskNodeIdSet = useMemo(() => new Set(minimizedTaskNodeIds), [minimizedTaskNodeIds]);
  const minimizedSourceNodeIdSet = useMemo(() => new Set(minimizedSourceNodeIds), [minimizedSourceNodeIds]);
  const visibleAgentNodes = useMemo(
    () => agentNodes.filter((node) => !minimizedAgentNodeIdSet.has(node.nodeId)),
    [agentNodes, minimizedAgentNodeIdSet],
  );
  const visibleTaskNodes = useMemo(
    () => taskNodes.filter((node) => !minimizedTaskNodeIdSet.has(node.nodeId)),
    [minimizedTaskNodeIdSet, taskNodes],
  );
  const visibleSourceNodes = useMemo(
    () => sourceNodes.filter((node) => !minimizedSourceNodeIdSet.has(node.nodeId)),
    [minimizedSourceNodeIdSet, sourceNodes],
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

  const hasActiveTaskLayoutInteraction = () => {
    const atlasDrag = atlasNodeDragRef.current;
    return Boolean(
      taskBranchDragRef.current
      || taskChildBranchInteractionRef.current
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
        return points ? { connection, path: straightPath(points.source.x, points.source.y, points.target.x, points.target.y), source: points.source } : null;
      })
      .filter((entry): entry is { connection: TeamTaskConnection; path: string; source: { x: number; y: number } } => Boolean(entry))
  ), [taskConnections, taskNodeByTaskId, tasksById]);
  const sourceConnectionLinks = useMemo(() => (
    sourceConnections
      .filter((connection) => connection.status !== "stale")
      .map((connection) => {
        const points = sourceConnectionPoints(connection, sourceNodeBySourceId, taskNodeByTaskId, sourceNodesById, tasksById);
        return points ? { connection, path: straightPath(points.source.x, points.source.y, points.target.x, points.target.y), source: points.source } : null;
      })
      .filter((entry): entry is { connection: TeamCanvasSourceConnection; path: string; source: { x: number; y: number } } => Boolean(entry))
  ), [sourceConnections, sourceNodeBySourceId, sourceNodesById, taskNodeByTaskId, tasksById]);

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

  useLayoutEffect(() => {
    if (evidence.length === 0 || !evidenceContainerRef.current) return;
    const container = evidenceContainerRef.current;
    const nodes = container.querySelectorAll<HTMLElement>(".emap-evidence-node");
    if (nodes.length === 0) return;

    const updated: MeasuredHeights = {};
    let changed = false;
    const fallbackHeights = new Map(evidence.map((entry) => [entry.id, evidenceHeight(entry.kind)]));
    for (const node of nodes) {
      const id = node.dataset.evidenceId;
      if (!id) continue;
      const h = measureLayoutHeight(node, fallbackHeights.get(id) ?? 0);
      if (!Number.isFinite(h) || h <= 0) continue;
      updated[id] = h;
      if ((measuredHeights[id] ?? 0) !== h) changed = true;
    }
    if (changed) setMeasuredHeights(updated);
  }, [evidence, evidenceLayout, measuredHeights]);

  useLayoutEffect(() => {
    if (!evidenceContainerRef.current) return;
    const nodes = evidenceContainerRef.current.querySelectorAll<HTMLElement>(".emap-artifact-preview");
    if (nodes.length === 0) return;

    const updated: MeasuredHeights = {};
    let changed = false;
    for (const node of nodes) {
      const id = node.dataset.previewId;
      if (!id) continue;
      const h = measureLayoutHeight(node, PREVIEW_FALLBACK_HEIGHT);
      if (!Number.isFinite(h) || h <= 0) continue;
      updated[id] = h;
      if ((previewHeights[id] ?? 0) !== h) changed = true;
    }
    if (changed) setPreviewHeights((current) => ({ ...current, ...updated }));
  }, [evidenceLayout.preview, previewHeights]);

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
        height: CANVAS_TASK_NODE_HEIGHT,
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
  }, [visibleAgentNodes, visibleSourceNodes, visibleTaskNodes]);

  const buildAtlasDragEntries = useCallback((primary: AtlasAgentNode | AtlasTaskNode | AtlasSourceNode, kind: "agent" | "task" | "source"): AtlasNodeDragEntry[] => {
    const primaryKey = atlasSelectionKey(kind, primary.nodeId);
    if (!selectedAtlasNodeKeys.has(primaryKey)) {
      return [{ nodeId: primary.nodeId, kind, startPosition: primary.position }];
    }

    const entries: AtlasNodeDragEntry[] = [];
    for (const node of visibleAgentNodes) {
      if (selectedAtlasNodeKeys.has(atlasSelectionKey("agent", node.nodeId))) {
        entries.push({ nodeId: node.nodeId, kind: "agent", startPosition: node.position });
      }
    }
    for (const node of visibleTaskNodes) {
      if (selectedAtlasNodeKeys.has(atlasSelectionKey("task", node.nodeId))) {
        entries.push({ nodeId: node.nodeId, kind: "task", startPosition: node.position });
      }
    }
    for (const node of visibleSourceNodes) {
      if (selectedAtlasNodeKeys.has(atlasSelectionKey("source", node.nodeId))) {
        entries.push({ nodeId: node.nodeId, kind: "source", startPosition: node.position });
      }
    }
    return entries.length > 0 ? entries : [{ nodeId: primary.nodeId, kind, startPosition: primary.position }];
  }, [selectedAtlasNodeKeys, visibleAgentNodes, visibleSourceNodes, visibleTaskNodes]);

  const beginAtlasNodeDrag = useCallback((
    node: AtlasAgentNode | AtlasTaskNode | AtlasSourceNode,
    kind: "agent" | "task" | "source",
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    event.stopPropagation();
    if ((event.button ?? 0) !== 0) return;
    if (kind === "agent" && (!canMoveAgents || !onMoveAgent)) return;
    if (kind === "task" && (!canMoveTasks || !onMoveCanvasTask)) return;
    if (kind === "source" && (!canMoveSourceNodes || !onMoveSourceNode)) return;
    atlasNodeDragRef.current = {
      primaryNodeId: node.nodeId,
      primaryKind: kind,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      entries: buildAtlasDragEntries(node, kind),
      hasMoved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [buildAtlasDragEntries, canMoveAgents, canMoveSourceNodes, canMoveTasks, onMoveAgent, onMoveCanvasTask, onMoveSourceNode]);

  const handleAgentPointerDown = useCallback((node: AtlasAgentNode, event: ReactPointerEvent<HTMLElement>) => {
    beginAtlasNodeDrag(node, "agent", event);
  }, [beginAtlasNodeDrag]);

  const handleAgentPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = atlasNodeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    const hasMoved = drag.hasMoved || Math.hypot(dx, dy) >= AGENT_DRAG_THRESHOLD;
    if (!hasMoved) return;

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
      if (entry.kind === "task" && taskBranchPanel) {
        const treeDx = dx / scale - (drag.lastTreeDx ?? 0);
        const treeDy = dy / scale - (drag.lastTreeDy ?? 0);
        if (treeDx !== 0 || treeDy !== 0) {
          translateTaskSubtreeRef.current("root", treeDx, treeDy, entry.nodeId);
        }
        atlasNodeDragRef.current = { ...atlasNodeDragRef.current!, lastTreeDx: dx / scale, lastTreeDy: dy / scale };
      }
    }
  }, [onMoveAgent, onMoveCanvasTask, onMoveSourceNode, taskBranchPanel, viewport]);

  const suppressNextAgentClick = useCallback((nodeId: string) => {
    suppressAgentClickRef.current = nodeId;
    globalThis.setTimeout(() => {
      if (suppressAgentClickRef.current === nodeId) {
        suppressAgentClickRef.current = null;
      }
    }, 0);
  }, []);

  const endAgentPointer = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const drag = atlasNodeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    atlasNodeDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (drag.hasMoved) {
      suppressNextAgentClick(drag.primaryNodeId);
      return;
    }

    const node = visibleAgentNodes.find((candidate) => candidate.nodeId === drag.primaryNodeId);
    if (drag.primaryKind === "agent" && node) {
      suppressNextAgentClick(drag.primaryNodeId);
      onSelectAgent?.(node);
    }
  }, [onSelectAgent, suppressNextAgentClick, visibleAgentNodes]);

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
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (drag.hasMoved) {
      suppressNextTaskClick(drag.primaryNodeId);
      return;
    }

    const node = visibleTaskNodes.find((candidate) => candidate.nodeId === drag.primaryNodeId);
    if (drag.primaryKind === "task" && node) {
      suppressNextTaskClick(drag.primaryNodeId);
      onSelectCanvasTask?.(node);
    }
  }, [onSelectCanvasTask, suppressNextTaskClick, visibleTaskNodes]);

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
  const taskBranchEntries = (taskBranchPanels?.length
    ? taskBranchPanels
    : focusedTaskNode && taskBranchPanel
      ? [{ id: "task-branch", nodeId: focusedTaskNode.nodeId, panel: taskBranchPanel }]
      : []
  ).map((entry) => {
    const node = visibleTaskNodes.find((candidate) => candidate.nodeId === entry.nodeId);
    if (!node) return null;
    const measuredSize = taskBranchMeasuredSize?.nodeId === node.nodeId ? taskBranchMeasuredSize : null;
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
  }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const primaryTaskBranchEntry = (
    taskBranchEntries.find((entry) => entry.node.nodeId === focusedTaskNodeId)
    ?? taskBranchEntries[0]
    ?? null
  );
  const taskBranchNode = primaryTaskBranchEntry?.rect ?? null;
  const taskChildBranchDefaultNode = taskBranchNode
    ? {
      x: taskBranchNode.x + taskBranchNode.width + TASK_CHILD_BRANCH_GAP,
      y: taskBranchNode.y,
      width: TASK_CHILD_BRANCH_WIDTH,
      height: TASK_CHILD_BRANCH_HEIGHT,
    }
    : null;
  const taskChildBranchNode = taskBranchNode && taskChildBranchPanel
    ? taskChildBranchInteractive && focusedTaskNode
      ? taskChildBranchRects[focusedTaskNode.nodeId] ?? taskChildBranchDefaultNode
      : taskChildBranchDefaultNode
    : null;
  const taskChildBranchPanelsLayout = useMemo(() => {
    if (!taskBranchNode || !taskChildBranchPanels?.length) return [];
    const panelGap = 8;
    const activePanelIds = new Set(taskChildBranchPanels.map((p) => p.id));
    const taskBranchRectById = new Map(taskBranchEntries.map((entry) => [entry.id, entry.rect]));
    type Entry = {
      panel: TaskChildBranchPanelDescriptor;
      rect: AgentBranchRect;
      sourceRect: AgentBranchRect;
      parentKey: string;
    };
    const entries: Entry[] = [];
    const finalRectByPanelId = new Map<string, AgentBranchRect>();
    const bottomByParent = new Map<string, number>();
    for (const p of taskChildBranchPanels) {
      let parentKey: string;
      let sourceRect: AgentBranchRect;
      if (p.sourceId) {
        parentKey = p.sourceId;
        sourceRect = finalRectByPanelId.get(p.sourceId) ?? taskBranchRectById.get(p.sourceId) ?? taskBranchNode;
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
      const baseRect: AgentBranchRect = { x, y, width: w, height: h };
      const posOverride = activePanelIds.has(p.id) ? panelPositionOverrides[p.id] : undefined;
      const rect = posOverride ? { ...baseRect, x: posOverride.x, y: posOverride.y } : baseRect;
      entries.push({ panel: p, rect, sourceRect, parentKey });
      finalRectByPanelId.set(p.id, rect);
      bottomByParent.set(parentKey, y + h);
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
    ...taskBranchEntries.map((entry) => entry.rect.x + entry.rect.width),
    taskChildBranchNode ? taskChildBranchNode.x + taskChildBranchNode.width : 0,
    ...taskChildBranchPanelsLayout.map((p) => p.rect.x + p.rect.width),
  );
  const svgWidth = Math.max(700, evidenceRight + 28, previewRight + 28, agentRight + 28, taskRight + 28, sourceRight + 28, agentBranchRight + 28, taskBranchRight + 28);
  const maxY = Math.max(
    ...Array.from(layout.nodePositions.values()).map((n) => n.y + n.height),
    ...evidenceLayout.positions.map((p) => p.y + p.height),
    evidenceLayout.preview ? evidenceLayout.preview.y + evidenceLayout.preview.height : 0,
    ...visibleAgentNodes.map((node) => node.position.y + AGENT_NODE_HEIGHT),
    ...visibleTaskNodes.map((node) => node.position.y + CANVAS_TASK_NODE_HEIGHT),
    ...visibleSourceNodes.map((node) => node.position.y + CANVAS_SOURCE_NODE_HEIGHT),
    agentBranchNode ? agentBranchNode.y + agentBranchNode.height : 0,
    ...taskBranchEntries.map((entry) => entry.rect.y + entry.rect.height),
    taskChildBranchNode ? taskChildBranchNode.y + taskChildBranchNode.height : 0,
    ...taskChildBranchPanelsLayout.map((p) => p.rect.y + p.rect.height),
    200,
  );
  const agentBranchPath = focusedAgentNode && agentBranchNode
    ? agentBranchConnectorPath(focusedAgentNode, agentBranchNode)
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
    path: taskBranchConnectorPath(entry.node, entry.rect),
    anchors: connectorAnchors(taskNodeRect(entry.node), entry.rect),
  }));
  const taskChildBranchPath = taskBranchNode && taskChildBranchNode
    ? taskChildBranchConnectorPath(taskBranchNode, taskChildBranchNode)
    : null;
  const taskChildBranchAnchors = taskBranchNode && taskChildBranchNode
    ? connectorAnchors(taskBranchNode, taskChildBranchNode)
    : null;
  const maximizedTaskPanel = maximizedBranch?.kind === "task-panel"
    ? taskChildBranchPanelsLayout.find((p) => p.id === maximizedBranch.panelId)?.panel ?? null
    : null;
  const maximizedBranchPanel = maximizedBranch?.kind === "agent" && agentBranchPanel
    ? agentBranchPanel
    : maximizedBranch?.kind === "task-child" && taskChildBranchPanel
      ? taskChildBranchPanel
      : maximizedTaskPanel;
  const maximizedOverlay = maximizedBranchPanel ? (
    <div
      className="emap-maximized-branch-shell"
      onDoubleClick={(event) => {
        if (!canTogglePanelMaximize(event.target)) return;
        event.stopPropagation();
        setMaximizedBranch(null);
      }}
    >
      <button
        type="button"
        className="emap-branch-restore-button"
        aria-label="还原对话分支"
        onClick={() => setMaximizedBranch(null)}
      >
        还原
      </button>
      {maximizedBranchPanel}
    </div>
  ) : null;
  const nodeHub = hubAgentNodes.length > 0 || hubTaskNodes.length > 0 || hubSourceNodes.length > 0 ? (
    <aside className="emap-node-hub" aria-label="Root node hub">
      <div className="emap-node-hub-head">
        <span>Hub</span>
        <strong>{hubAgentNodes.length + hubTaskNodes.length + hubSourceNodes.length}</strong>
      </div>
      <div className="emap-node-hub-list">
        {hubAgentNodes.map((node) => {
          const agent = agentsById?.get(node.agentId);
          const label = agent?.name ?? node.agentId;
          return (
            <button
              key={`hub-${node.nodeId}`}
              type="button"
              className="emap-node-hub-item"
              aria-label={`复原 Agent ${label}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onRestoreAgent?.(node);
              }}
            >
              <span className="emap-node-hub-kind">Agent</span>
              <span className="emap-node-hub-title">{label}</span>
              <span className="emap-node-hub-meta">{node.agentId}</span>
            </button>
          );
        })}
        {hubTaskNodes.map((node) => {
          const task = tasksById?.get(node.taskId);
          const label = task?.title ?? node.taskId;
          return (
            <button
              key={`hub-${node.nodeId}`}
              type="button"
              className="emap-node-hub-item"
              aria-label={`复原 Task ${label}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onRestoreCanvasTask?.(node);
              }}
            >
              <span className="emap-node-hub-kind">Task</span>
              <span className="emap-node-hub-title">{label}</span>
              <span className="emap-node-hub-meta">{node.taskId}</span>
            </button>
          );
        })}
        {hubSourceNodes.map((node) => {
          const sourceNode = sourceNodesById?.get(node.sourceNodeId);
          const label = sourceNode?.title ?? node.sourceNodeId;
          return (
            <button
              key={`hub-${node.nodeId}`}
              type="button"
              className="emap-node-hub-item"
              aria-label={`复原 Source ${label}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onRestoreSourceNode?.(node);
              }}
            >
              <span className="emap-node-hub-kind">Source</span>
              <span className="emap-node-hub-title">{label}</span>
              <span className="emap-node-hub-meta">{sourceNode?.outputPort.type ?? node.sourceNodeId}</span>
            </button>
          );
        })}
      </div>
    </aside>
  ) : null;
  const overlay = nodeHub || maximizedOverlay ? (
    <>
      {nodeHub}
      {maximizedOverlay}
    </>
  ) : null;

  useLayoutEffect(() => {
    if (
      (maximizedBranch?.kind === "agent" && !agentBranchPanel)
      || (maximizedBranch?.kind === "task-child" && !taskChildBranchPanel)
      || (maximizedBranch?.kind === "task-panel" && !taskChildBranchPanelsLayout.some((p) => p.id === maximizedBranch.panelId))
    ) {
      setMaximizedBranch(null);
    }
  }, [agentBranchPanel, maximizedBranch, taskChildBranchPanel, taskChildBranchPanelsLayout]);

  useLayoutEffect(() => {
    if (hasActiveTaskLayoutInteraction()) return;

    const nodeId = focusedTaskNode?.nodeId ?? null;
    if (!nodeId || !taskBranchPanel) {
      setTaskBranchMeasuredSize((current) => current ? null : current);
      return;
    }

    const element = taskBranchShellRef.current;
    if (!element) return;

    const width = element.offsetWidth || TASK_MENU_BRANCH_WIDTH;
    const height = element.offsetHeight || TASK_MENU_BRANCH_HEIGHT;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;

    setTaskBranchMeasuredSize((current) => (
      current?.nodeId === nodeId && current.width === width && current.height === height
        ? current
        : { nodeId, width, height }
    ));
  });

  useLayoutEffect(() => {
    if (hasActiveTaskLayoutInteraction()) return;

    if (!taskChildBranchPanels?.length) {
      if (Object.keys(panelMeasuredHeights).length > 0) setPanelMeasuredHeights({});
      return;
    }
    const autoPanels = taskChildBranchPanels.filter((p) => p.autoHeight);
    if (autoPanels.length === 0) return;
    const nodes = evidenceContainerRef.current?.querySelectorAll<HTMLElement>("[data-panel-id]");
    if (!nodes?.length) return;
    const updated: Record<string, number> = {};
    let changed = false;
    for (const node of nodes) {
      const id = node.dataset.panelId;
      if (!id) continue;
      const panel = autoPanels.find((p) => p.id === id);
      if (!panel) continue;
      const h = measureLayoutHeight(node, panel.height ?? 120);
      if (!Number.isFinite(h) || h <= 0) continue;
      updated[id] = h;
      if ((panelMeasuredHeights[id] ?? 0) !== h) changed = true;
    }
    if (changed) setPanelMeasuredHeights((current) => ({ ...current, ...updated }));
  });

  useLayoutEffect(() => {
    if (!taskChildBranchPanels?.length && Object.keys(panelSizeOverrides).length > 0) {
      setPanelSizeOverrides({});
    }
    if (!taskChildBranchPanels?.length && Object.keys(panelPositionOverrides).length > 0) {
      setPanelPositionOverrides({});
      return;
    }
    if (!taskChildBranchPanels?.length) return;
    const activeIds = new Set(taskChildBranchPanels.map((p) => p.id));
    const staleSize = Object.keys(panelSizeOverrides).filter((id) => !activeIds.has(id));
    if (staleSize.length > 0) {
      setPanelSizeOverrides((current) => {
        const next = { ...current };
        for (const id of staleSize) delete next[id];
        return next;
      });
    }
    const stalePos = Object.keys(panelPositionOverrides).filter((id) => !activeIds.has(id));
    if (stalePos.length > 0) {
      setPanelPositionOverrides((current) => {
        const next = { ...current };
        for (const id of stalePos) delete next[id];
        return next;
      });
    }
  }, [taskChildBranchPanels, panelSizeOverrides, panelPositionOverrides]);

  useLayoutEffect(() => {
    if (!taskBranchPanel && Object.keys(taskBranchPositionOverrides).length > 0) {
      setTaskBranchPositionOverrides({});
    }
  }, [taskBranchPanel, taskBranchPositionOverrides]);

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

    if ((scope === "root" || scope === "menu") && taskChildBranchNode && targetNodeId === focusedTaskNode?.nodeId) {
      setTaskChildBranchRects((prev) => {
        const current = prev[targetNodeId] ?? taskChildBranchNode;
        return { ...prev, [targetNodeId]: { ...current, x: current.x + dx, y: current.y + dy } };
      });
    }

    if (scope === "root" && targetTaskBranchNode) {
      setTaskBranchPositionOverrides((prev) => ({
        ...prev,
        [targetNodeId]: { x: targetTaskBranchNode.x + dx, y: targetTaskBranchNode.y + dy },
      }));
    }
  }, [focusedTaskNode, taskBranchEntries, taskBranchNode, taskChildBranchNode, taskChildBranchPanelsLayout]);

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
    event.preventDefault();
    event.stopPropagation();
    agentBranchInteractionRef.current = {
      kind: "drag",
      nodeId: focusedAgentNode.nodeId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: agentBranchNode,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
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
    event.preventDefault();
    event.stopPropagation();

    const scale = viewportScale(viewport);
    const dx = (event.clientX - interaction.startClientX) / scale;
    const dy = (event.clientY - interaction.startClientY) / scale;
    const nextRect = interaction.kind === "drag"
      ? clampAgentBranchRect({
        ...interaction.startRect,
        x: interaction.startRect.x + dx,
        y: interaction.startRect.y + dy,
      })
      : clampAgentBranchRect({
        ...interaction.startRect,
        width: interaction.startRect.width + dx,
        height: interaction.startRect.height + dy,
      });

    setAgentBranchRects((current) => ({
      ...current,
      [interaction.nodeId]: nextRect,
    }));
  }, [viewport]);

  const endAgentBranchInteraction = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = agentBranchInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    agentBranchInteractionRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const beginTaskChildBranchDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!taskChildBranchInteractive || !focusedTaskNode || !taskChildBranchNode || !canStartAgentBranchDrag(event.target)) return;
    taskChildBranchInteractionRef.current = {
      kind: "drag",
      nodeId: focusedTaskNode.nodeId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: taskChildBranchNode,
      hasMoved: false,
      capturedTarget: null,
    };
  }, [focusedTaskNode, taskChildBranchInteractive, taskChildBranchNode]);

  const beginTaskChildBranchResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!taskChildBranchInteractive || !focusedTaskNode || !taskChildBranchNode) return;
    event.preventDefault();
    event.stopPropagation();
    taskChildBranchInteractionRef.current = {
      kind: "resize",
      nodeId: focusedTaskNode.nodeId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: taskChildBranchNode,
    };
    event.currentTarget.parentElement?.setPointerCapture?.(event.pointerId);
  }, [focusedTaskNode, taskChildBranchInteractive, taskChildBranchNode]);

  const moveTaskChildBranch = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = taskChildBranchInteractionRef.current;
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
      ? clampAgentBranchRect({
        ...interaction.startRect,
        x: interaction.startRect.x + dx,
        y: interaction.startRect.y + dy,
      })
      : clampAgentBranchRect({
        ...interaction.startRect,
        width: interaction.startRect.width + dx,
        height: interaction.startRect.height + dy,
      });

    setTaskChildBranchRects((current) => ({
      ...current,
      [interaction.nodeId]: nextRect,
    }));
  }, [viewport]);

  const endTaskChildBranchInteraction = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = taskChildBranchInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.kind === "drag" && interaction.hasMoved) {
      event.preventDefault();
      event.stopPropagation();
      taskChildDragSuppressClickRef.current = true;
    } else if (interaction.kind === "resize") {
      event.preventDefault();
      event.stopPropagation();
    }
    if (interaction.capturedTarget) {
      interaction.capturedTarget.releasePointerCapture?.(event.pointerId);
    } else if (interaction.kind === "resize") {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    taskChildBranchInteractionRef.current = null;
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
    <AtlasCanvasShell
      viewport={viewport}
      onViewportChange={onViewportChange}
      toolbarStart={toolbarStart}
      agentFocusId={focusedAgentNode?.agentId ?? null}
      interactionMode={interactionMode}
      onSelectionComplete={handleAtlasSelectionComplete}
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
          {taskConnectionLinks.map(({ connection, path, source }) => (
            <g key={connection.connectionId}>
              <path
                d={path}
                className="emap-link emap-link-task-connection"
                data-task-connection-id={connection.connectionId}
                data-port-type={connection.type}
                fill="none"
                strokeWidth={2}
              />
              {renderConnectorSourceSocket(
                `${connection.connectionId}-source-socket`,
                source,
                "emap-connector-socket-task-connection",
              )}
            </g>
          ))}
          {sourceConnectionLinks.map(({ connection, path, source }) => (
            <g key={connection.connectionId}>
              <path
                d={path}
                className="emap-link emap-link-source-connection"
                data-source-connection-id={connection.connectionId}
                data-port-type={connection.type}
                fill="none"
                strokeWidth={2}
              />
              {renderConnectorSourceSocket(
                `${connection.connectionId}-source-socket`,
                source,
                "emap-connector-socket-source-connection",
              )}
            </g>
          ))}
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
          {taskChildBranchPath && (
            <path
              key="task-child-branch"
              d={taskChildBranchPath}
              className="emap-link emap-link-task-branch emap-link-task-child-branch"
              fill="none"
              strokeWidth={2}
            />
          )}
          {taskChildBranchAnchors && renderConnectorSourceSocket("task-child-branch-source-socket", taskChildBranchAnchors.source, "emap-connector-socket-task-child-branch")}
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
                    <span className="emap-node-meta">{agent.agentId}</span>
                    <span className="emap-agent-description">{agent.description}</span>
                    <span className="emap-agent-binding">{formatAgentBinding(agent)}</span>
                  </div>
                </div>
                {onMinimizeAgent && (
                  <button
                    type="button"
                    className="emap-node-minimize-button"
                    aria-label="收纳 Agent"
                    title={`收纳 ${agent.name}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onMinimizeAgent(node);
                    }}
                  >
                    收
                  </button>
                )}
                {onRemoveAgent && (
                  <button
                    type="button"
                    className="emap-node-action-button emap-node-archive-button"
                    aria-label={`移出画布 Agent ${agent.name}`}
                    title={`移出画布 ${agent.name}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveAgent(node, agent);
                    }}
                  >
                    移除
                  </button>
                )}
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
                {onMinimizeSourceNode && (
                  <button
                    type="button"
                    className="emap-node-minimize-button"
                    aria-label="收纳 Source"
                    title={`收纳 ${sourceNode.title}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onMinimizeSourceNode(node);
                    }}
                  >
                    收
                  </button>
                )}
                {onArchiveSourceNode && (
                  <button
                    type="button"
                    className="emap-node-action-button emap-node-archive-button"
                    aria-label={`归档 Source ${sourceNode.title}`}
                    title={`归档 ${sourceNode.title}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onArchiveSourceNode(node, sourceNode);
                    }}
                  >
                    归档
                  </button>
                )}
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
            const inputPorts = task.workUnit.inputPorts ?? [];
            const outputPorts = task.workUnit.outputPorts ?? [];
            const hasPorts = inputPorts.length > 0 || outputPorts.length > 0;
            return (
              <div
                key={node.nodeId}
                role="button"
                tabIndex={0}
                className={`emap-node emap-atlas-card emap-canvas-task-node ${nodeStatusClass} ${isFocused ? "selected" : ""} ${isAtlasSelected ? "is-atlas-selected" : ""}`}
                data-kind="canvas-task"
                data-task-id={task.taskId}
                data-task-run-status={latestTaskRun?.status ?? "none"}
                aria-label={task.title}
                style={{ left: node.position.x, top: node.position.y, width: NODE_WIDTH, height: CANVAS_TASK_NODE_HEIGHT }}
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
                    <span className="emap-node-kind">Task</span>
                    <span className={`emap-node-state-pill ${latestTaskRun?.status ?? task.status}`}>
                      {latestTaskRun ? RUN_STATUS_LABELS[latestTaskRun.status] : task.status}
                    </span>
                  </div>
                  <div className="emap-node-body">
                    <span className="emap-node-title">{task.title}</span>
                    <span className="emap-node-meta">leader: {leader?.name ?? task.leaderAgentId}</span>
                    <span className="emap-node-meta">worker: {worker?.name ?? task.workUnit.workerAgentId}</span>
                    <span className="emap-node-meta">checker: {checker?.name ?? task.workUnit.checkerAgentId}</span>
                  </div>
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
                {onMinimizeCanvasTask && (
                  <button
                    type="button"
                    className="emap-node-minimize-button"
                    aria-label="收纳 Task"
                    title={`收纳 ${task.title}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onMinimizeCanvasTask(node);
                    }}
                  >
                    收
                  </button>
                )}
                {onArchiveCanvasTask && (
                  <button
                    type="button"
                    className="emap-node-action-button emap-node-archive-button"
                    aria-label={`归档 Task ${task.title}`}
                    title={`归档 ${task.title}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onArchiveCanvasTask(node, task);
                    }}
                  >
                    归档
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
            const isPrimary = entry.id === primaryTaskBranchEntry?.id;
            return (
              <div
                key={`task-branch-${entry.id}`}
                ref={isPrimary ? taskBranchShellRef : undefined}
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
          {taskChildBranchNode && taskChildBranchPanel && maximizedBranch?.kind !== "task-child" && (
            <div
              className="emap-task-child-branch-shell"
              onPointerDownCapture={taskChildBranchInteractive ? beginTaskChildBranchDrag : undefined}
              onPointerMove={taskChildBranchInteractive ? moveTaskChildBranch : undefined}
              onPointerUp={taskChildBranchInteractive ? endTaskChildBranchInteraction : undefined}
              onPointerCancel={taskChildBranchInteractive ? endTaskChildBranchInteraction : undefined}
              onDoubleClick={(event) => {
                if (!canTogglePanelMaximize(event.target)) return;
                event.stopPropagation();
                setMaximizedBranch({ kind: "task-child" });
              }}
              onClickCapture={(e) => {
                if (taskChildDragSuppressClickRef.current) {
                  taskChildDragSuppressClickRef.current = false;
                  if (!(e.target instanceof Element && e.target.closest("button, input, textarea, select, a, iframe, summary, details"))) {
                    e.stopPropagation();
                  }
                }
              }}
              style={{
                left: taskChildBranchNode.x,
                top: taskChildBranchNode.y,
                width: taskChildBranchNode.width,
                height: taskChildBranchNode.height,
              }}
            >
              {taskChildBranchPanel}
              {taskChildBranchInteractive && (
                <>
                  <button
                    type="button"
                    className="emap-agent-branch-maximize-button"
                    aria-label="最大化对话分支"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMaximizedBranch({ kind: "task-child" });
                    }}
                  >
                    ⛶
                  </button>
                  <button
                    type="button"
                    className="emap-agent-branch-resize-handle"
                    aria-label="调整对话分支大小"
                    onPointerDown={beginTaskChildBranchResize}
                  />
                </>
              )}
            </div>
          )}
          {taskChildBranchPanelsLayout.filter((p) => !(maximizedBranch?.kind === "task-panel" && maximizedBranch.panelId === p.id)).map((p) => (
            <div
              key={`task-child-panel-${p.id}`}
              data-panel-id={p.id}
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
                  e.stopPropagation();
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
        </div>
    </AtlasCanvasShell>
  );
}
