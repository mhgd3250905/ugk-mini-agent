import { useMemo } from "react";
import type { RunDetail, TeamPlan, TaskStatus } from "../api/team-types";
import type { ExecutionNode, NodeKind } from "./execution-map-model";
import { buildExecutionMapModel, CHILD_COLLAPSE_THRESHOLD } from "./execution-map-model";
import { layoutExecutionMap, ROOT_ID, NODE_WIDTH } from "./execution-map-layout";
import { RUN_STATUS_LABELS } from "../shared/status";
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
}

type RenderNode = Omit<ExecutionNode, "kind"> & { kind: NodeKind | "collapsed" };

function statusClass(status: TaskStatus | RunDetail["status"]): string {
  switch (status) {
    case "running": case "queued": return "status-running";
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
  if (statuses.includes("running") || statuses.includes("pending")) return "running";
  if (statuses.includes("cancelled")) return "cancelled";
  if (statuses.includes("skipped")) return "skipped";
  return "succeeded";
}

export function ExecutionMap({ plan, run, selectedTaskId, onSelectTask }: ExecutionMapProps) {
  const { model, layout } = useMemo(() => {
    const m = buildExecutionMapModel(plan, run);
    const l = layoutExecutionMap(m);
    return { model: m, layout: l };
  }, [plan, run]);

  const selectedChain = useMemo(() => {
    if (!selectedTaskId) return new Set<string>();
    const chain = model.parentChainLookup.get(selectedTaskId) ?? [];
    return new Set([...chain, selectedTaskId]);
  }, [model, selectedTaskId]);

  const allNodes: RenderNode[] = model.mainTasks.flatMap((t) => {
    const result: RenderNode[] = [t];
    if (t.children.length > CHILD_COLLAPSE_THRESHOLD) {
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
    } else {
      result.push(...t.children);
    }
    return result;
  });

  for (const o of model.orphanGroup) {
    allNodes.push(o);
  }

  const svgWidth = 700;
  const maxY = Math.max(
    ...layout.mainTaskNodes.map((n) => n.y + n.height),
    ...layout.orphanNodes.map((n) => n.y + n.height),
    layout.rootNode.y + layout.rootNode.height,
    200,
  );

  const isCollapsed = (id: string) => id.endsWith("__collapsed");
  const parentOfCollapsed = (id: string) => id.replace("__collapsed", "");

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
            return (
              <path
                key={`${link.sourceId}-${link.targetId}`}
                d={link.path}
                className={`emap-link ${highlighted ? "emap-link-highlighted" : ""}`}
                fill="none"
                strokeWidth={2}
              />
            );
          })}
        </svg>

        <div className="execution-map-nodes" style={{ width: svgWidth, minHeight: maxY + 40 }}>
          <div
            className={`emap-node emap-root ${statusClass(run.status)} ${selectedTaskId === ROOT_ID ? "selected" : ""}`}
            style={{ left: layout.rootNode.x, top: layout.rootNode.y, width: NODE_WIDTH }}
            onClick={() => onSelectTask(ROOT_ID)}
          >
            <div className="emap-node-status-bar" />
            <div className="emap-node-content">
              <span className="emap-node-kind">{KIND_LABELS.root}</span>
              <span className="emap-node-title">{RUN_STATUS_LABELS[run.status]}</span>
              <span className="emap-node-summary">
                {model.rootNode.succeeded}/{model.rootNode.totalTasks}
              </span>
            </div>
          </div>

          {allNodes.map((node) => {
            const pos = layout.nodePositions.get(node.nodeId);
            if (!pos) return null;

            const collapsed = isCollapsed(node.taskId);
            const chainSelected = collapsed
              ? selectedChain.has(parentOfCollapsed(node.taskId))
              : selectedChain.has(node.taskId);
            const isSelected = !collapsed && node.taskId === selectedTaskId;

            return (
              <div
                key={node.nodeId}
                className={`emap-node ${statusClass(node.status)} ${isSelected ? "selected" : ""} ${chainSelected ? "chain-selected" : ""} ${collapsed ? "emap-collapsed" : ""}`}
                style={{ left: pos.x, top: pos.y, width: pos.width }}
                onClick={() => !collapsed && onSelectTask(node.taskId)}
              >
                <div className="emap-node-status-bar" />
                <div className="emap-node-content">
                  <span className={`emap-node-kind ${node.kind === "orphan" ? "kind-orphan" : ""}`}>
                    {KIND_LABELS[collapsed ? "collapsed" : node.kind]}
                  </span>
                  <span className="emap-node-title">{node.title}</span>
                  {node.errorFirstLine && (
                    <span className="emap-node-error">{node.errorFirstLine}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
