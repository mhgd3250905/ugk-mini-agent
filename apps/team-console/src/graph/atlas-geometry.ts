import type { TeamCanvasSourceConnection, TeamCanvasSourceNode, TeamCanvasTask, TeamTaskConnection } from "../api/team-types";
import type { AtlasAgentNode, AtlasSourceNode, AtlasTaskNode } from "./ExecutionMap";
import { straightPath, NODE_WIDTH } from "./execution-map-layout";

// ── Node sizing constants ──────────────────────────────────────────

export const AGENT_NODE_HEIGHT = 132;
export const CANVAS_TASK_NODE_HEIGHT = 184;
export const CANVAS_TASK_PORT_ROW_EXTRA_HEIGHT = 28;
export const CANVAS_TASK_DISCOVERY_SUMMARY_EXTRA_HEIGHT = 56;
export const CANVAS_SOURCE_NODE_HEIGHT = 166;

// ── Rect type ──────────────────────────────────────────────────────

export type AtlasRect = { x: number; y: number; width: number; height: number };

// ── Task port row / node height ────────────────────────────────────

export function canvasTaskPortRowCount(task: TeamCanvasTask | undefined): number {
  if (!task) return 0;
  return (task.workUnit.inputPorts?.length ? 1 : 0) + (task.workUnit.outputPorts?.length ? 1 : 0);
}

export function isDiscoveryRootTask(task: TeamCanvasTask | undefined): boolean {
  return task?.canvasKind === "discovery" && !task.generatedSource;
}

export function canvasTaskNodeHeight(task: TeamCanvasTask | undefined): number {
  return CANVAS_TASK_NODE_HEIGHT
    + canvasTaskPortRowCount(task) * CANVAS_TASK_PORT_ROW_EXTRA_HEIGHT
    + (isDiscoveryRootTask(task) ? CANVAS_TASK_DISCOVERY_SUMMARY_EXTRA_HEIGHT : 0);
}

export function atlasDragEntryHeight(kind: "agent" | "task" | "source", task?: TeamCanvasTask): number {
  if (kind === "agent") return AGENT_NODE_HEIGHT;
  if (kind === "source") return CANVAS_SOURCE_NODE_HEIGHT;
  return canvasTaskNodeHeight(task);
}

// ── Rect builders ──────────────────────────────────────────────────

export function taskNodeRect(taskNode: AtlasTaskNode, task?: TeamCanvasTask): AtlasRect {
  return {
    x: taskNode.position.x,
    y: taskNode.position.y,
    width: NODE_WIDTH,
    height: canvasTaskNodeHeight(task),
  };
}

export function sourceNodeRect(sourceNode: AtlasSourceNode): AtlasRect {
  return {
    x: sourceNode.position.x,
    y: sourceNode.position.y,
    width: NODE_WIDTH,
    height: CANVAS_SOURCE_NODE_HEIGHT,
  };
}

// ── Anchor helpers ─────────────────────────────────────────────────

export function rightMiddleAnchor(rect: AtlasRect): { x: number; y: number } {
  return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
}

export function leftTopAnchor(rect: AtlasRect): { x: number; y: number } {
  return { x: rect.x, y: rect.y };
}

export function connectorAnchors(sourceRect: AtlasRect, targetRect: AtlasRect) {
  return {
    source: rightMiddleAnchor(sourceRect),
    target: leftTopAnchor(targetRect),
  };
}

// ── Connector paths ────────────────────────────────────────────────

export function rightMiddleToLeftTopPath(sourceRect: AtlasRect, targetRect: AtlasRect): string {
  const sx = sourceRect.x + sourceRect.width;
  const sy = sourceRect.y + sourceRect.height / 2;
  const tx = targetRect.x;
  const ty = targetRect.y;
  return straightPath(sx, sy, tx, ty);
}

export function agentBranchConnectorPath(agentNode: AtlasAgentNode, branchRect: AtlasRect, nodeWidth: number): string {
  const agentRect: AtlasRect = {
    x: agentNode.position.x,
    y: agentNode.position.y,
    width: nodeWidth,
    height: AGENT_NODE_HEIGHT,
  };
  return rightMiddleToLeftTopPath(agentRect, branchRect);
}

export function taskBranchConnectorPath(taskNode: AtlasTaskNode, branchRect: AtlasRect, task?: TeamCanvasTask): string {
  return rightMiddleToLeftTopPath(taskNodeRect(taskNode, task), branchRect);
}

export function taskChildBranchConnectorPath(menuRect: AtlasRect, childRect: AtlasRect): string {
  return rightMiddleToLeftTopPath(menuRect, childRect);
}

// ── Connection point resolvers ─────────────────────────────────────

export function taskConnectionPoints(
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
  return connectorAnchors(taskNodeRect(sourceNode, sourceTask), taskNodeRect(targetNode, targetTask));
}

export function sourceConnectionPoints(
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
  return connectorAnchors(sourceNodeRect(sourceNode), taskNodeRect(targetNode, targetTask));
}

// ── Zoom snapping ──────────────────────────────────────────────────

const MIN_SCALE = 0.45;
const MAX_SCALE = 1.8;
export const ATLAS_ZOOM_LEVELS = [0.45, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.8] as const;

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(2))));
}

export function nearestZoomLevel(value: number): number {
  const clamped = clampScale(value);
  return ATLAS_ZOOM_LEVELS.reduce((closest, level) => (
    Math.abs(level - clamped) < Math.abs(closest - clamped) ? level : closest
  ), ATLAS_ZOOM_LEVELS[0]);
}

export function nextZoomLevel(value: number, direction: "in" | "out"): number {
  const clamped = clampScale(value);
  if (direction === "in") {
    return ATLAS_ZOOM_LEVELS.find((level) => level > clamped + 0.001) ?? MAX_SCALE;
  }
  return [...ATLAS_ZOOM_LEVELS].reverse().find((level) => level < clamped - 0.001) ?? MIN_SCALE;
}

// ── Device-pixel pan snapping ──────────────────────────────────────

export function snapCanvasOffset(value: number): number {
  const ratio = globalThis.window?.devicePixelRatio ?? 1;
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return Math.round(value * safeRatio) / safeRatio;
}

export function normalizeAtlasViewport(viewport: { x: number; y: number; scale: number }): { x: number; y: number; scale: number } {
  return {
    x: snapCanvasOffset(viewport.x),
    y: snapCanvasOffset(viewport.y),
    scale: nearestZoomLevel(viewport.scale),
  };
}
