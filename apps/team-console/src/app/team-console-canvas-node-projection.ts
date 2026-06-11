import type { TeamCanvasSourceNode, TeamCanvasSourcePortType, TeamCanvasTask } from "../api/team-types";
import type { AtlasAgentNode, AtlasSourceNode, AtlasTaskNode } from "../graph/ExecutionMap";
import type { StoredAgentNodePosition, StoredSourcePosition, StoredTaskPosition } from "./canvas-ui-state-storage";

export function makeTaskNode(
  task: TeamCanvasTask,
  index: number,
  storedPosition?: { x: number; y: number },
): AtlasTaskNode {
  return {
    nodeId: `task-node-${task.taskId}`,
    kind: "canvas-task",
    taskId: task.taskId,
    position: storedPosition ?? {
      x: 280 + (index % 3) * 320,
      y: 220 + Math.floor(index / 3) * 180,
    },
  };
}

export function makeTaskNodes(tasks: TeamCanvasTask[], storedPositions = new Map<string, { x: number; y: number }>()): AtlasTaskNode[] {
  return tasks.map((task, index) => makeTaskNode(task, index, storedPositions.get(task.taskId)));
}

export function makeSourceNode(
  sourceNode: TeamCanvasSourceNode,
  index: number,
  storedPosition?: { x: number; y: number },
): AtlasSourceNode {
  return {
    nodeId: `source-node-${sourceNode.sourceNodeId}`,
    kind: "canvas-source",
    sourceNodeId: sourceNode.sourceNodeId,
    position: storedPosition ?? {
      x: 280 + (index % 3) * 320,
      y: 34 + Math.floor(index / 3) * 180,
    },
  };
}

export function makeSourceNodes(sources: TeamCanvasSourceNode[], storedPositions = new Map<string, { x: number; y: number }>()): AtlasSourceNode[] {
  return sources.map((source, index) => makeSourceNode(source, index, storedPositions.get(source.sourceNodeId)));
}

export function inferSourceFileType(file: File): TeamCanvasSourcePortType {
  const name = file.name.toLowerCase();
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "md";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".html") || name.endsWith(".htm")) return "html";
  if (name.endsWith(".txt") || file.type.startsWith("text/")) return "string";
  return "file";
}

export function makeAgentNode(agentId: string, index: number): AtlasAgentNode {
  return {
    nodeId: `agent-${agentId}`,
    kind: "agent",
    agentId,
    position: { x: 360 + index * 320, y: 0 },
  };
}

export function sameAgentNodes(left: AtlasAgentNode[], right: AtlasAgentNode[]): boolean {
  return left.length === right.length
    && left.every((node, index) => {
      const other = right[index];
      return other
        && node.nodeId === other.nodeId
        && node.agentId === other.agentId
        && node.position.x === other.position.x
        && node.position.y === other.position.y;
    });
}

export function sameTaskNodes(left: AtlasTaskNode[], right: AtlasTaskNode[]): boolean {
  return left.length === right.length
    && left.every((node, index) => {
      const other = right[index];
      return other
        && node.nodeId === other.nodeId
        && node.taskId === other.taskId
        && node.position.x === other.position.x
        && node.position.y === other.position.y;
    });
}

export function sameSourceNodes(left: AtlasSourceNode[], right: AtlasSourceNode[]): boolean {
  return left.length === right.length
    && left.every((node, index) => {
      const other = right[index];
      return other
        && node.nodeId === other.nodeId
        && node.sourceNodeId === other.sourceNodeId
        && node.position.x === other.position.x
        && node.position.y === other.position.y;
    });
}

export function mergeStoredAgentNodes(agentNodes: AtlasAgentNode[], storedNodes: StoredAgentNodePosition[] | undefined, agentsById: Map<string, unknown>): AtlasAgentNode[] {
  if (!storedNodes?.length) return agentNodes;
  const byAgentId = new Map(agentNodes.map((node) => [node.agentId, node]));
  const nextNodes = [...agentNodes];
  for (const stored of storedNodes) {
    if (!agentsById.has(stored.agentId)) continue;
    const existingIndex = nextNodes.findIndex((node) => node.agentId === stored.agentId);
    if (existingIndex >= 0) {
      nextNodes[existingIndex] = { ...nextNodes[existingIndex]!, position: stored.position };
      continue;
    }
    if (!byAgentId.has(stored.agentId)) {
      nextNodes.push({
        nodeId: `agent-${stored.agentId}`,
        kind: "agent",
        agentId: stored.agentId,
        position: stored.position,
      });
    }
  }
  return nextNodes;
}

export function mergeStoredTaskNodePositions(taskNodes: AtlasTaskNode[], storedPositions: StoredTaskPosition[] | undefined): AtlasTaskNode[] {
  if (!storedPositions?.length) return taskNodes;
  const positions = new Map(storedPositions.map((item) => [item.taskId, item.position]));
  return taskNodes.map((node) => {
    const position = positions.get(node.taskId);
    return position ? { ...node, position } : node;
  });
}

export function mergeStoredSourceNodePositions(sourceNodes: AtlasSourceNode[], storedPositions: StoredSourcePosition[] | undefined): AtlasSourceNode[] {
  if (!storedPositions?.length) return sourceNodes;
  const positions = new Map(storedPositions.map((item) => [item.sourceNodeId, item.position]));
  return sourceNodes.map((node) => {
    const position = positions.get(node.sourceNodeId);
    return position ? { ...node, position } : node;
  });
}
