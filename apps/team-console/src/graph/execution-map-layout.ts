import type { ExecutionMapModel } from "./execution-map-model";
import { CHILD_COLLAPSE_THRESHOLD } from "./execution-map-model";

export interface NodePosition {
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutLink {
  sourceId: string;
  targetId: string;
  path: string;
}

export interface LayoutOptions {
  selectedTaskId?: string;
  selectedReservedHeight?: number;
  expandedTaskIds?: Set<string>;
}

export interface ExecutionMapLayout {
  rootNode: NodePosition;
  mainTaskNodes: NodePosition[];
  orphanNodes: NodePosition[];
  collapsedNodes: NodePosition[];
  nodePositions: Map<string, NodePosition>;
  links: LayoutLink[];
}

const NODE_WIDTH = 280;
const NODE_HEIGHT = 56;
const ERROR_NODE_HEIGHT = 72;
const SPINE_Y_GAP = 72;
const BRANCH_X_OFFSET = 320;
const BRANCH_Y_GAP = 56;
const ROOT_ID = "__root__";

export { NODE_WIDTH, NODE_HEIGHT, ERROR_NODE_HEIGHT, ROOT_ID };

function nodePos(id: string, x: number, y: number, w = NODE_WIDTH, h = NODE_HEIGHT): NodePosition {
  return { nodeId: id, x, y, width: w, height: h };
}

function elbowPath(sx: number, sy: number, tx: number, ty: number): string {
  const dy = ty - sy;
  const cp = Math.abs(dy) * 0.4;
  return `M${sx},${sy} C${sx},${sy + cp} ${tx},${ty - cp} ${tx},${ty}`;
}

export function straightPath(sx: number, sy: number, tx: number, ty: number): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const horizontalTension = Math.max(32, Math.abs(dx) * 0.42);
  const verticalTension = Math.max(32, Math.abs(dy) * 0.42);
  const cp1x = Math.abs(dx) >= Math.abs(dy) ? sx + Math.sign(dx || 1) * horizontalTension : sx;
  const cp1y = Math.abs(dx) >= Math.abs(dy) ? sy : sy + Math.sign(dy || 1) * verticalTension;
  const cp2x = Math.abs(dx) >= Math.abs(dy) ? tx - Math.sign(dx || 1) * horizontalTension : tx;
  const cp2y = Math.abs(dx) >= Math.abs(dy) ? ty : ty - Math.sign(dy || 1) * verticalTension;
  return `M${sx},${sy} C${cp1x},${cp1y} ${cp2x},${cp2y} ${tx},${ty}`;
}

export function layoutExecutionMap(
  model: ExecutionMapModel,
  options?: LayoutOptions,
): ExecutionMapLayout {
  const positions = new Map<string, NodePosition>();
  const links: LayoutLink[] = [];
  const mainTaskNodes: NodePosition[] = [];
  const orphanNodes: NodePosition[] = [];
  const collapsedNodes: NodePosition[] = [];
  const baseNodeHeight = (taskId: string) => model.allNodes.get(taskId)?.errorFirstLine ? ERROR_NODE_HEIGHT : NODE_HEIGHT;

  const rootPos = nodePos(ROOT_ID, 0, 0, NODE_WIDTH, NODE_HEIGHT);
  positions.set(ROOT_ID, rootPos);

  let currentY = NODE_HEIGHT + SPINE_Y_GAP;

  for (let i = 0; i < model.mainTasks.length; i++) {
    const task = model.mainTasks[i];
    const pos = nodePos(task.taskId, 0, currentY, NODE_WIDTH, baseNodeHeight(task.taskId));
    positions.set(task.taskId, pos);
    mainTaskNodes.push(pos);

    if (i === 0) {
      const halfW = NODE_WIDTH / 2;
      links.push({ sourceId: ROOT_ID, targetId: task.taskId, path: elbowPath(halfW, rootPos.y + rootPos.height, halfW, pos.y) });
    } else {
      const prevPos = mainTaskNodes[i - 1];
      const halfW = NODE_WIDTH / 2;
      links.push({ sourceId: model.mainTasks[i - 1].taskId, targetId: task.taskId, path: elbowPath(halfW, prevPos.y + prevPos.height, halfW, pos.y) });
    }

    const children = task.children;
    const isExpanded = options?.expandedTaskIds?.has(task.taskId) ?? false;
    const needsCollapse = children.length > CHILD_COLLAPSE_THRESHOLD && !isExpanded;

    if (needsCollapse) {
      const collapsedId = `${task.taskId}__collapsed`;
      const childStartY = currentY + (pos.height === NODE_HEIGHT ? BRANCH_Y_GAP * 0.5 : pos.height);
      const collapsedPos = nodePos(collapsedId, BRANCH_X_OFFSET, childStartY, NODE_WIDTH, NODE_HEIGHT);
      positions.set(collapsedId, collapsedPos);
      collapsedNodes.push(collapsedPos);

      links.push({
        sourceId: task.taskId,
        targetId: collapsedId,
        path: straightPath(pos.x + pos.width, pos.y + pos.height / 2, BRANCH_X_OFFSET, collapsedPos.y + collapsedPos.height / 2),
      });

      const effH = (options?.selectedTaskId === task.taskId && options?.selectedReservedHeight)
        ? Math.max(pos.height, options.selectedReservedHeight)
        : pos.height;
      currentY += effH + SPINE_Y_GAP;
    } else if (children.length > 0) {
      let childY = currentY + pos.height;
      for (const child of children) {
        const childPos = nodePos(child.taskId, BRANCH_X_OFFSET, childY, NODE_WIDTH, baseNodeHeight(child.taskId));
        positions.set(child.taskId, childPos);

        links.push({
          sourceId: task.taskId,
          targetId: child.taskId,
          path: straightPath(pos.x + pos.width, pos.y + pos.height / 2, BRANCH_X_OFFSET, childPos.y + childPos.height / 2),
        });

        childY += childPos.height + BRANCH_Y_GAP * 0.5;
      }
      if (isExpanded && children.length > CHILD_COLLAPSE_THRESHOLD) {
        const collapseId = `${task.taskId}__collapse_control`;
        const collapsePos = nodePos(collapseId, BRANCH_X_OFFSET, childY, NODE_WIDTH, NODE_HEIGHT);
        positions.set(collapseId, collapsePos);
        childY += collapsePos.height + BRANCH_Y_GAP * 0.5;
      }
      currentY = childY + SPINE_Y_GAP;
    } else {
      const effH = (options?.selectedTaskId === task.taskId && options?.selectedReservedHeight)
        ? Math.max(pos.height, options.selectedReservedHeight)
        : pos.height;
      currentY += effH + SPINE_Y_GAP;
    }
  }

  if (model.orphanGroup.length > 0) {
    currentY += SPINE_Y_GAP;
    for (const orphan of model.orphanGroup) {
      const pos = nodePos(orphan.taskId, 0, currentY, NODE_WIDTH, baseNodeHeight(orphan.taskId));
      positions.set(orphan.taskId, pos);
      orphanNodes.push(pos);
      currentY += pos.height + BRANCH_Y_GAP;
    }
  }

  return { rootNode: rootPos, mainTaskNodes, orphanNodes, collapsedNodes, nodePositions: positions, links };
}
