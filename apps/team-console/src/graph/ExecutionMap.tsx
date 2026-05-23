import { useMemo, useLayoutEffect, useRef, useState, useCallback } from "react";
import type { RunDetail, TeamPlan, TaskStatus, TeamAttemptMetadata, TeamTaskState } from "../api/team-types";
import type { ExecutionNode, NodeKind } from "./execution-map-model";
import { buildExecutionMapModel, CHILD_COLLAPSE_THRESHOLD } from "./execution-map-model";
import { layoutExecutionMap, ROOT_ID, NODE_WIDTH, straightPath } from "./execution-map-layout";
import { RUN_STATUS_LABELS, TASK_STATUS_LABELS } from "../shared/status";
import "./execution-map.css";

const KIND_LABELS: Record<NodeKind | "collapsed" | "orphan_group", string> = {
  root: "Run",
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
}

type RenderNode = Omit<ExecutionNode, "kind"> & { kind: NodeKind | "collapsed" };

const EVIDENCE_W = 240;
const EVIDENCE_GAP = 12;

type EvidenceKind = "result" | "error" | "attempt" | "progress" | "worker" | "checker" | "watcher";

interface EvidenceEntry {
  id: string;
  kind: EvidenceKind;
  title: string;
  content: string;
  tag?: string;
  tagClass?: string;
  path?: string;
}

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

function artifactTypeLabel(filename: string): string {
  if (filename.includes("accepted")) return "Accepted";
  if (filename.includes("failed")) return "Failed";
  return "Result";
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

export function ExecutionMap({ plan, run, selectedTaskId, onSelectTask, attemptsByTaskId = {} }: ExecutionMapProps) {
  const evidenceContainerRef = useRef<HTMLDivElement | null>(null);
  const [measuredHeights, setMeasuredHeights] = useState<MeasuredHeights>({});
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const prevSelectionRef = useRef<string | null>(null);

  if (prevSelectionRef.current !== selectedTaskId) {
    prevSelectionRef.current = selectedTaskId;
    if (Object.keys(measuredHeights).length > 0) {
      setMeasuredHeights({});
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
        title: filename || "Result",
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
          title: "Error",
          content: state.errorSummary,
        });
      }
      if (state.activeAttemptId) {
        entries.push({
          id: `evidence__attempt__${selectedTaskId}`,
          kind: "attempt",
          title: "Attempt",
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
          title: "Progress",
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
      return sum + h + (i < evidence.length - 1 ? EVIDENCE_GAP : 0);
    }, 0);
  }, [evidence, measuredHeights]);

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
    const empty = { positions: [] as Position[], links: [] as { sourceId: string; targetId: string; path: string }[] };
    if (evidence.length === 0) return empty;
    const taskPos = layout.nodePositions.get(selectedTaskId!);
    if (!taskPos) return empty;
    const evidenceX = taskPos.x + taskPos.width + 40;

    let y = taskPos.y;
    const positions: Position[] = [];
    const links: { sourceId: string; targetId: string; path: string }[] = [];

    for (const entry of evidence) {
      const fallback = evidenceHeight(entry.kind);
      const h = measuredHeights[entry.id] ?? fallback;
      positions.push({ ...entry, x: evidenceX, y, width: EVIDENCE_W, height: h });
      links.push({
        sourceId: selectedTaskId!,
        targetId: entry.id,
        path: straightPath(taskPos.x + taskPos.width, taskPos.y + taskPos.height / 2, evidenceX, y + h / 2),
      });
      y += h + EVIDENCE_GAP;
    }

    return { positions, links };
  }, [evidence, layout.nodePositions, selectedTaskId, measuredHeights]);

  useLayoutEffect(() => {
    if (evidence.length === 0 || !evidenceContainerRef.current) return;
    const container = evidenceContainerRef.current;
    const nodes = container.querySelectorAll<HTMLElement>(".emap-evidence-node");
    if (nodes.length === 0) return;

    const updated: MeasuredHeights = {};
    let changed = false;
    for (const node of nodes) {
      const id = node.dataset.evidenceId;
      if (!id) continue;
      const h = Math.round(node.getBoundingClientRect().height);
      if (!Number.isFinite(h) || h <= 0) continue;
      updated[id] = h;
      if ((measuredHeights[id] ?? 0) !== h) changed = true;
    }
    if (changed) setMeasuredHeights(updated);
  }, [evidence, evidenceLayout, measuredHeights]);

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
  const svgWidth = Math.max(700, evidenceRight + 28);
  const maxY = Math.max(
    ...Array.from(layout.nodePositions.values()).map((n) => n.y + n.height),
    ...evidenceLayout.positions.map((p) => p.y + p.height),
    200,
  );

  const isCollapsed = (id: string) => id.endsWith("__collapsed") || id.endsWith("__collapse_control");
  const parentOfCollapsed = (id: string) => id.replace(/__collapsed$|__collapse_control$/, "");

  return (
    <div className="execution-map-container">
      <div className="execution-map-scroll">
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
              key={link.targetId}
              d={link.path}
              className="emap-link emap-link-evidence"
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
                <span className="emap-node-title">Execution Run</span>
                <span className="emap-node-summary">
                  {model.rootNode.succeeded}/{model.rootNode.totalTasks} checkpoints
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
                        {node.resultRef ? "result linked" : node.attemptCount > 0 ? `attempt ${node.attemptCount}` : "waiting"}
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

            const evidenceElements = evidenceLayout.positions.map((e) => (
              <button
                type="button"
                key={e.id}
                data-evidence-id={e.id}
                className={`emap-evidence-node emap-artifact-node emap-evidence-${e.kind}`}
                style={{ left: e.x, top: e.y, width: e.width, minHeight: e.height }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="emap-evidence-header">
                  <span className="emap-evidence-title">{e.title}</span>
                  {e.tag && e.tagClass && <span className={`emap-evidence-tag ${e.tagClass}`}>{e.tag}</span>}
                </div>
                {e.content && <span className="emap-evidence-content">{e.content}</span>}
                {e.path && <span className="emap-evidence-path">{e.path}</span>}
              </button>
            ));

            return [taskElement, ...evidenceElements];
          })}
        </div>
      </div>
    </div>
  );
}
