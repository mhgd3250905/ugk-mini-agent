import { useMemo, useLayoutEffect, useEffect, useRef, useState, useCallback, type PointerEvent } from "react";
import type { RunDetail, TeamPlan, TaskStatus, TeamAttemptMetadata, TeamTaskState } from "../api/team-types";
import type { ExecutionNode, NodeKind } from "./execution-map-model";
import { buildExecutionMapModel, CHILD_COLLAPSE_THRESHOLD } from "./execution-map-model";
import { layoutExecutionMap, ROOT_ID, NODE_WIDTH, straightPath } from "./execution-map-layout";
import { RUN_STATUS_LABELS, TASK_STATUS_LABELS } from "../shared/status";
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
  plan: TeamPlan;
  run: RunDetail;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  attemptsByTaskId?: Record<string, TeamAttemptMetadata[]>;
  readAttemptFile?: (runId: string, taskId: string, attemptId: string, fileName: string) => Promise<string>;
}

type RenderNode = Omit<ExecutionNode, "kind"> & { kind: NodeKind | "collapsed" };

const EVIDENCE_W = 240;
const EVIDENCE_GAP = 12;
const PREVIEW_W = 360;
const PREVIEW_GAP = 40;
const PREVIEW_FALLBACK_HEIGHT = 180;
const MIN_SCALE = 0.45;
const MAX_SCALE = 1.8;
const ZOOM_STEP = 1.1;

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

interface CanvasDragOrigin {
  pointerId: number;
  startX: number;
  startY: number;
  panX: number;
  panY: number;
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

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(2))));
}

function formatCanvasNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

function canStartCanvasPan(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return !target.closest(".emap-node, .emap-evidence-node, .emap-artifact-preview, .execution-map-toolbar, button, select, input, textarea, a, iframe, summary, details");
}

function pointerPoint(event: PointerEvent<HTMLDivElement>): { x: number; y: number } {
  const native = event.nativeEvent as globalThis.PointerEvent & { clientX?: number; clientY?: number };
  const x = Number.isFinite(event.clientX) ? event.clientX : Number.isFinite(native.clientX) ? native.clientX! : 0;
  const y = Number.isFinite(event.clientY) ? event.clientY : Number.isFinite(native.clientY) ? native.clientY! : 0;
  return { x, y };
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

export function ExecutionMap({ plan, run, selectedTaskId, onSelectTask, attemptsByTaskId = {}, readAttemptFile }: ExecutionMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const evidenceContainerRef = useRef<HTMLDivElement | null>(null);
  const dragOriginRef = useRef<CanvasDragOrigin | null>(null);
  const [measuredHeights, setMeasuredHeights] = useState<MeasuredHeights>({});
  const [previewHeights, setPreviewHeights] = useState<MeasuredHeights>({});
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [artifactPreviewState, setArtifactPreviewState] = useState<Record<string, ArtifactPreviewState>>({});
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const prevSelectionRef = useRef<string | null>(null);

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

  const model = useMemo(() => buildExecutionMapModel(plan, run), [plan, run]);

  const evidence = useMemo<EvidenceEntry[]>(() => {
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
  }, [selectedTaskId, model, run.taskStates, plan.tasks, expandedTaskIds, attemptsByTaskId]);

  const evidenceReservedHeight = useMemo(() => {
    if (evidence.length === 0) return 0;
    return evidence.reduce((sum, entry, i) => {
      const h = measuredHeights[entry.id] ?? evidenceHeight(entry.kind);
      const previewH = selectedArtifactId === entry.id ? previewHeights[entry.id] ?? PREVIEW_FALLBACK_HEIGHT : 0;
      return sum + Math.max(h, previewH) + (i < evidence.length - 1 ? EVIDENCE_GAP : 0);
    }, 0);
  }, [evidence, measuredHeights, selectedArtifactId, previewHeights]);

  const layout = useMemo(() => layoutExecutionMap(model, {
    selectedTaskId: selectedTaskId ?? undefined,
    selectedReservedHeight: evidenceReservedHeight > 0 ? evidenceReservedHeight : undefined,
    expandedTaskIds,
  }), [model, selectedTaskId, evidenceReservedHeight, expandedTaskIds]);

  const selectedChain = useMemo(() => {
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
    if (!selectedTaskId || parsed.taskId !== selectedTaskId) return;

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
  }, [artifactPreviewState, readAttemptFile, run.runId, selectedArtifactId, selectedTaskId]);

  const handleCanvasWheel = useCallback((event: globalThis.WheelEvent) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const nextScale = clampScale(scale * direction);
    if (nextScale === scale) return;

    const container = mapContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const worldX = (cursorX - pan.x) / scale;
    const worldY = (cursorY - pan.y) / scale;

    setScale(nextScale);
    setPan({
      x: cursorX - worldX * nextScale,
      y: cursorY - worldY * nextScale,
    });
  }, [pan.x, pan.y, scale]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleCanvasWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleCanvasWheel);
    };
  }, [handleCanvasWheel]);

  const zoomIn = useCallback(() => {
    setScale((current) => clampScale(current * ZOOM_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((current) => clampScale(current / ZOOM_STEP));
  }, []);

  const resetView = useCallback(() => {
    dragOriginRef.current = null;
    setIsPanning(false);
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleCanvasPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if ((event.button ?? 0) !== 0 || !canStartCanvasPan(event.target)) return;
    const point = pointerPoint(event);
    dragOriginRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      panX: pan.x,
      panY: pan.y,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [pan.x, pan.y]);

  const handleCanvasPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const origin = dragOriginRef.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    const point = pointerPoint(event);
    setPan({
      x: origin.panX + point.x - origin.startX,
      y: origin.panY + point.y - origin.startY,
    });
  }, []);

  const endCanvasPan = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const origin = dragOriginRef.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    dragOriginRef.current = null;
    setIsPanning(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const allNodes: RenderNode[] = model.mainTasks.flatMap((t) => {
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
  });

  for (const o of model.orphanGroup) {
    allNodes.push(o);
  }

  const evidenceRight = evidenceLayout.positions.length > 0
    ? Math.max(...evidenceLayout.positions.map((p) => p.x + p.width))
    : 0;
  const previewRight = evidenceLayout.preview ? evidenceLayout.preview.x + evidenceLayout.preview.width : 0;
  const svgWidth = Math.max(700, evidenceRight + 28, previewRight + 28);
  const maxY = Math.max(
    ...Array.from(layout.nodePositions.values()).map((n) => n.y + n.height),
    ...evidenceLayout.positions.map((p) => p.y + p.height),
    evidenceLayout.preview ? evidenceLayout.preview.y + evidenceLayout.preview.height : 0,
    200,
  );

  const isCollapsed = (id: string) => id.endsWith("__collapsed") || id.endsWith("__collapse_control");
  const parentOfCollapsed = (id: string) => id.replace(/__collapsed$|__collapse_control$/, "");
  const canvasTransform = `translate(${formatCanvasNumber(pan.x)}px, ${formatCanvasNumber(pan.y)}px) scale(${formatCanvasNumber(scale)})`;
  const zoomPercent = `${Math.round(scale * 100)}%`;

  return (
    <div
      ref={mapContainerRef}
      className={`execution-map-container ${isPanning ? "is-panning" : ""}`}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={endCanvasPan}
      onPointerCancel={endCanvasPan}
    >
      <div className="execution-map-toolbar" aria-label="视图工具">
        <button type="button" onClick={zoomIn}>放大</button>
        <button type="button" onClick={zoomOut}>缩小</button>
        <button type="button" onClick={resetView}>重置视图</button>
        <span className="execution-map-zoom">{zoomPercent}</span>
      </div>
      <div className="execution-map-scroll" style={{ transform: canvasTransform }}>
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
        </svg>

        <div className="execution-map-nodes" ref={evidenceContainerRef} style={{ width: svgWidth, minHeight: maxY + 40 }}>
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
        </div>
      </div>
    </div>
  );
}
