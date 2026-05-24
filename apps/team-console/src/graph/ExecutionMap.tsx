import { useMemo, useLayoutEffect, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { AgentRunStatus, AgentSummary, RunDetail, TeamCanvasTask, TeamPlan, TaskStatus, TeamAttemptMetadata, TeamTaskState } from "../api/team-types";
import type { ExecutionNode, NodeKind } from "./execution-map-model";
import { buildExecutionMapModel, CHILD_COLLAPSE_THRESHOLD } from "./execution-map-model";
import { layoutExecutionMap, ROOT_ID, NODE_WIDTH, straightPath, type ExecutionMapLayout } from "./execution-map-layout";
import { RUN_STATUS_LABELS, TASK_STATUS_LABELS } from "../shared/status";
import { AtlasCanvasShell, type AtlasInteractionMode, type AtlasViewport } from "./AtlasCanvasShell";
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
  canMoveAgents?: boolean;
  agentBranchPanel?: ReactNode;
  taskNodes?: AtlasTaskNode[];
  tasksById?: Map<string, TeamCanvasTask>;
  focusedTaskNodeId?: string | null;
  onSelectCanvasTask?: (node: AtlasTaskNode) => void;
  onMoveCanvasTask?: (nodeId: string, position: { x: number; y: number }) => void;
  canMoveTasks?: boolean;
  taskBranchPanel?: ReactNode;
  taskChildBranchPanel?: ReactNode;
  viewport?: AtlasViewport;
  onViewportChange?: (viewport: AtlasViewport) => void;
  toolbarStart?: ReactNode;
  interactionMode?: AtlasInteractionMode;
}

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

const EVIDENCE_W = 240;
const EVIDENCE_GAP = 12;
const PREVIEW_W = 360;
const PREVIEW_GAP = 40;
const PREVIEW_FALLBACK_HEIGHT = 180;
const AGENT_NODE_HEIGHT = 112;
const CANVAS_TASK_NODE_HEIGHT = 136;
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

type AgentDragState = {
  nodeId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startPosition: { x: number; y: number };
  hasMoved: boolean;
};

type TaskDragState = {
  nodeId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startPosition: { x: number; y: number };
  hasMoved: boolean;
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
};

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
  if (!target.closest(".agent-playground-branch-head")) return false;
  return !target.closest("button, input, textarea, select, a, iframe, summary, details");
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function agentBranchConnectorPath(agentNode: AtlasAgentNode, branchRect: AgentBranchRect): string {
  const agentRect = {
    x: agentNode.position.x,
    y: agentNode.position.y,
    width: NODE_WIDTH,
    height: AGENT_NODE_HEIGHT,
  };
  const agentCenter = {
    x: agentRect.x + agentRect.width / 2,
    y: agentRect.y + agentRect.height / 2,
  };
  const branchCenter = {
    x: branchRect.x + branchRect.width / 2,
    y: branchRect.y + branchRect.height / 2,
  };
  const dx = branchCenter.x - agentCenter.x;
  const dy = branchCenter.y - agentCenter.y;

  if (Math.abs(dy) > Math.abs(dx)) {
    const sourceY = dy >= 0 ? agentRect.y + agentRect.height : agentRect.y;
    const targetY = dy >= 0 ? branchRect.y : branchRect.y + branchRect.height;
    const targetX = clampNumber(agentCenter.x, branchRect.x, branchRect.x + branchRect.width);
    return straightPath(agentCenter.x, sourceY, targetX, targetY);
  }

  const sourceX = dx >= 0 ? agentRect.x + agentRect.width : agentRect.x;
  const targetX = dx >= 0 ? branchRect.x : branchRect.x + branchRect.width;
  const targetY = clampNumber(agentCenter.y, branchRect.y, branchRect.y + branchRect.height);
  return straightPath(sourceX, agentCenter.y, targetX, targetY);
}

function taskBranchConnectorPath(taskNode: AtlasTaskNode, branchRect: AgentBranchRect): string {
  const sourceX = taskNode.position.x + NODE_WIDTH;
  const sourceY = taskNode.position.y + CANVAS_TASK_NODE_HEIGHT / 2;
  const targetY = clampNumber(sourceY, branchRect.y, branchRect.y + branchRect.height);
  return straightPath(sourceX, sourceY, branchRect.x, targetY);
}

function taskChildBranchConnectorPath(menuRect: AgentBranchRect, childRect: AgentBranchRect): string {
  const sourceX = menuRect.x + menuRect.width;
  const sourceY = menuRect.y + menuRect.height / 2;
  const targetY = clampNumber(sourceY, childRect.y, childRect.y + childRect.height);
  return straightPath(sourceX, sourceY, childRect.x, targetY);
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
  canMoveAgents = true,
  agentBranchPanel,
  taskNodes = [],
  tasksById,
  focusedTaskNodeId,
  onSelectCanvasTask,
  onMoveCanvasTask,
  canMoveTasks = true,
  taskBranchPanel,
  taskChildBranchPanel,
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
  const prevSelectionRef = useRef<string | null>(null);
  const agentDragRef = useRef<AgentDragState | null>(null);
  const taskDragRef = useRef<TaskDragState | null>(null);
  const suppressAgentClickRef = useRef<string | null>(null);
  const suppressTaskClickRef = useRef<string | null>(null);
  const agentBranchInteractionRef = useRef<AgentBranchInteractionState | null>(null);

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
    type EvidenceLink = { id: string; path: string; preview?: boolean };
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

  const handleAgentPointerDown = useCallback((node: AtlasAgentNode, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if ((event.button ?? 0) !== 0 || !canMoveAgents || !onMoveAgent) return;
    agentDragRef.current = {
      nodeId: node.nodeId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: node.position,
      hasMoved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [canMoveAgents, onMoveAgent]);

  const handleAgentPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = agentDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !onMoveAgent) return;
    event.stopPropagation();
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    const hasMoved = drag.hasMoved || Math.hypot(dx, dy) >= AGENT_DRAG_THRESHOLD;
    if (!hasMoved) return;

    const scale = viewport && Number.isFinite(viewport.scale) && viewport.scale > 0
      ? viewport.scale
      : 1;
    agentDragRef.current = { ...drag, hasMoved };
    onMoveAgent(drag.nodeId, {
      x: drag.startPosition.x + dx / scale,
      y: drag.startPosition.y + dy / scale,
    });
  }, [onMoveAgent, viewport]);

  const suppressNextAgentClick = useCallback((nodeId: string) => {
    suppressAgentClickRef.current = nodeId;
    globalThis.setTimeout(() => {
      if (suppressAgentClickRef.current === nodeId) {
        suppressAgentClickRef.current = null;
      }
    }, 0);
  }, []);

  const endAgentPointer = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = agentDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    agentDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (drag.hasMoved) {
      suppressNextAgentClick(drag.nodeId);
      return;
    }

    const node = agentNodes.find((candidate) => candidate.nodeId === drag.nodeId);
    if (node) {
      suppressNextAgentClick(drag.nodeId);
      onSelectAgent?.(node);
    }
  }, [agentNodes, onSelectAgent, suppressNextAgentClick]);

  const handleAgentClick = useCallback((node: AtlasAgentNode) => {
    if (suppressAgentClickRef.current === node.nodeId) {
      suppressAgentClickRef.current = null;
      return;
    }
    onSelectAgent?.(node);
  }, [onSelectAgent]);

  const handleTaskPointerDown = useCallback((node: AtlasTaskNode, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if ((event.button ?? 0) !== 0 || !canMoveTasks || !onMoveCanvasTask) return;
    taskDragRef.current = {
      nodeId: node.nodeId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: node.position,
      hasMoved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [canMoveTasks, onMoveCanvasTask]);

  const handleTaskPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = taskDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !onMoveCanvasTask) return;
    event.stopPropagation();
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    const hasMoved = drag.hasMoved || Math.hypot(dx, dy) >= AGENT_DRAG_THRESHOLD;
    if (!hasMoved) return;

    taskDragRef.current = { ...drag, hasMoved };
    const scale = viewportScale(viewport);
    onMoveCanvasTask(drag.nodeId, {
      x: drag.startPosition.x + dx / scale,
      y: drag.startPosition.y + dy / scale,
    });
  }, [onMoveCanvasTask, viewport]);

  const suppressNextTaskClick = useCallback((nodeId: string) => {
    suppressTaskClickRef.current = nodeId;
    globalThis.setTimeout(() => {
      if (suppressTaskClickRef.current === nodeId) {
        suppressTaskClickRef.current = null;
      }
    }, 0);
  }, []);

  const endTaskPointer = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = taskDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    taskDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (drag.hasMoved) {
      suppressNextTaskClick(drag.nodeId);
      return;
    }

    const node = taskNodes.find((candidate) => candidate.nodeId === drag.nodeId);
    if (node) {
      suppressNextTaskClick(drag.nodeId);
      onSelectCanvasTask?.(node);
    }
  }, [onSelectCanvasTask, suppressNextTaskClick, taskNodes]);

  const handleTaskClick = useCallback((node: AtlasTaskNode) => {
    if (suppressTaskClickRef.current === node.nodeId) {
      suppressTaskClickRef.current = null;
      return;
    }
    onSelectCanvasTask?.(node);
  }, [onSelectCanvasTask]);

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
  const agentRight = agentNodes.length > 0
    ? Math.max(...agentNodes.map((node) => node.position.x + NODE_WIDTH))
    : 0;
  const taskRight = taskNodes.length > 0
    ? Math.max(...taskNodes.map((node) => node.position.x + NODE_WIDTH))
    : 0;
  const focusedAgentNode = focusedAgentNodeId
    ? agentNodes.find((node) => node.nodeId === focusedAgentNodeId) ?? null
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
    ? taskNodes.find((node) => node.nodeId === focusedTaskNodeId) ?? null
    : null;
  const taskBranchNode = focusedTaskNode && taskBranchPanel
    ? {
      x: focusedTaskNode.position.x + NODE_WIDTH + TASK_BRANCH_GAP,
      y: Math.max(0, focusedTaskNode.position.y - 16),
      width: TASK_MENU_BRANCH_WIDTH,
      height: TASK_MENU_BRANCH_HEIGHT,
    }
    : null;
  const taskChildBranchNode = taskBranchNode && taskChildBranchPanel
    ? {
      x: taskBranchNode.x + taskBranchNode.width + TASK_CHILD_BRANCH_GAP,
      y: taskBranchNode.y,
      width: TASK_CHILD_BRANCH_WIDTH,
      height: TASK_CHILD_BRANCH_HEIGHT,
    }
    : null;
  const agentBranchRight = agentBranchNode ? agentBranchNode.x + agentBranchNode.width : 0;
  const taskBranchRight = Math.max(
    taskBranchNode ? taskBranchNode.x + taskBranchNode.width : 0,
    taskChildBranchNode ? taskChildBranchNode.x + taskChildBranchNode.width : 0,
  );
  const svgWidth = Math.max(700, evidenceRight + 28, previewRight + 28, agentRight + 28, taskRight + 28, agentBranchRight + 28, taskBranchRight + 28);
  const maxY = Math.max(
    ...Array.from(layout.nodePositions.values()).map((n) => n.y + n.height),
    ...evidenceLayout.positions.map((p) => p.y + p.height),
    evidenceLayout.preview ? evidenceLayout.preview.y + evidenceLayout.preview.height : 0,
    ...agentNodes.map((node) => node.position.y + AGENT_NODE_HEIGHT),
    ...taskNodes.map((node) => node.position.y + CANVAS_TASK_NODE_HEIGHT),
    agentBranchNode ? agentBranchNode.y + agentBranchNode.height : 0,
    taskBranchNode ? taskBranchNode.y + taskBranchNode.height : 0,
    taskChildBranchNode ? taskChildBranchNode.y + taskChildBranchNode.height : 0,
    200,
  );
  const agentBranchPath = focusedAgentNode && agentBranchNode
    ? agentBranchConnectorPath(focusedAgentNode, agentBranchNode)
    : null;
  const taskBranchPath = focusedTaskNode && taskBranchNode
    ? taskBranchConnectorPath(focusedTaskNode, taskBranchNode)
    : null;
  const taskChildBranchPath = taskBranchNode && taskChildBranchNode
    ? taskChildBranchConnectorPath(taskBranchNode, taskChildBranchNode)
    : null;

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

  const isCollapsed = (id: string) => id.endsWith("__collapsed") || id.endsWith("__collapse_control");
  const parentOfCollapsed = (id: string) => id.replace(/__collapsed$|__collapse_control$/, "");
  return (
    <AtlasCanvasShell
      viewport={viewport}
      onViewportChange={onViewportChange}
      toolbarStart={toolbarStart}
      agentFocusId={focusedAgentNode?.agentId ?? null}
      interactionMode={interactionMode}
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
            return (
              <path
                key={`${link.sourceId}-${link.targetId}`}
                d={link.path}
                className={`emap-link ${linkType} ${highlighted ? "emap-link-highlighted" : ""}`}
                fill="none"
                strokeWidth={2}
              />
            );
          })}
          {evidenceLayout.links.map((link) => (
            <path
              key={link.id}
              d={link.path}
              className={`emap-link ${link.preview ? "emap-link-artifact-preview" : "emap-link-evidence"}`}
              fill="none"
              strokeWidth={1.5}
            />
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
          {taskBranchPath && (
            <path
              key="task-leader-branch"
              d={taskBranchPath}
              className="emap-link emap-link-task-branch"
              fill="none"
              strokeWidth={2}
            />
          )}
          {taskChildBranchPath && (
            <path
              key="task-child-branch"
              d={taskChildBranchPath}
              className="emap-link emap-link-task-branch emap-link-task-child-branch"
              fill="none"
              strokeWidth={2}
            />
          )}
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

          {agentNodes.map((node) => {
            const agent = agentsById?.get(node.agentId);
            if (!agent) return null;
            const isFocused = node.nodeId === focusedAgentNodeId;
            const runStatus = formatAgentRunStatus(agentRunStatusById?.get(agent.agentId));
            return (
              <button
                key={node.nodeId}
                type="button"
                className={`emap-node emap-agent-node ${runStatus.nodeClass} ${isFocused ? "selected" : ""}`}
                data-kind="agent"
                data-agent-id={agent.agentId}
                data-agent-run-state={runStatus.state}
                title={runStatus.title}
                style={{ left: node.position.x, top: node.position.y, width: NODE_WIDTH, height: AGENT_NODE_HEIGHT }}
                onPointerDown={(event) => handleAgentPointerDown(node, event)}
                onPointerMove={handleAgentPointerMove}
                onPointerUp={endAgentPointer}
                onPointerCancel={endAgentPointer}
                onClick={() => handleAgentClick(node)}
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
              </button>
            );
          })}

          {taskNodes.map((node) => {
            const task = tasksById?.get(node.taskId);
            if (!task) return null;
            const leader = agentsById?.get(task.leaderAgentId);
            const worker = agentsById?.get(task.workUnit.workerAgentId);
            const checker = agentsById?.get(task.workUnit.checkerAgentId);
            const isFocused = node.nodeId === focusedTaskNodeId;
            return (
              <button
                key={node.nodeId}
                type="button"
                className={`emap-node emap-canvas-task-node status-${task.status} ${isFocused ? "selected" : ""}`}
                data-kind="canvas-task"
                data-task-id={task.taskId}
                aria-label={task.title}
                style={{ left: node.position.x, top: node.position.y, width: NODE_WIDTH, height: CANVAS_TASK_NODE_HEIGHT }}
                onPointerDown={(event) => handleTaskPointerDown(node, event)}
                onPointerMove={handleTaskPointerMove}
                onPointerUp={endTaskPointer}
                onPointerCancel={endTaskPointer}
                onClick={() => handleTaskClick(node)}
              >
                <div className="emap-node-status-bar" />
                <div className="emap-node-content">
                  <div className="emap-node-header">
                    <span className="emap-node-kind">Task</span>
                    <span className={`emap-node-state-pill ${task.status}`}>{task.status}</span>
                  </div>
                  <div className="emap-node-body">
                    <span className="emap-node-title">{task.title}</span>
                    <span className="emap-node-meta">leader: {leader?.name ?? task.leaderAgentId}</span>
                    <span className="emap-node-meta">worker: {worker?.name ?? task.workUnit.workerAgentId}</span>
                    <span className="emap-node-meta">checker: {checker?.name ?? task.workUnit.checkerAgentId}</span>
                  </div>
                </div>
              </button>
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
          {agentBranchNode && agentBranchPanel && (
            <div
              className="emap-agent-branch-shell"
              onPointerDownCapture={beginAgentBranchDrag}
              onPointerMove={moveAgentBranch}
              onPointerUp={endAgentBranchInteraction}
              onPointerCancel={endAgentBranchInteraction}
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
                className="emap-agent-branch-resize-handle"
                aria-label="调整对话分支大小"
                onPointerDown={beginAgentBranchResize}
              />
            </div>
          )}
          {taskBranchNode && taskBranchPanel && (
            <div
              className="emap-task-branch-shell"
              style={{
                left: taskBranchNode.x,
                top: taskBranchNode.y,
                width: "max-content",
                minWidth: TASK_MENU_BRANCH_MIN_WIDTH,
                height: "auto",
              }}
            >
              {taskBranchPanel}
            </div>
          )}
          {taskChildBranchNode && taskChildBranchPanel && (
            <div
              className="emap-task-child-branch-shell"
              style={{
                left: taskChildBranchNode.x,
                top: taskChildBranchNode.y,
                width: taskChildBranchNode.width,
                height: taskChildBranchNode.height,
              }}
            >
              {taskChildBranchPanel}
            </div>
          )}
        </div>
    </AtlasCanvasShell>
  );
}
