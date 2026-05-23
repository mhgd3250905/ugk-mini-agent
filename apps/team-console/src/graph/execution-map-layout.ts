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
const SPINE_Y_GAP = 72;
const BRANCH_X_OFFSET = 320;
const BRANCH_Y_GAP = 56;
const ROOT_ID = "__root__";

export { NODE_WIDTH, NODE_HEIGHT, ROOT_ID };

function nodePos(id: string, x: number, y: number, w = NODE_WIDTH, h = NODE_HEIGHT): NodePosition {
  return { nodeId: id, x, y, width: w, height: h };
}

function elbowPath(sx: number, sy: number, tx: number, ty: number): string {
  const dy = ty - sy;
  const cp = Math.abs(dy) * 0.4;
  return `M${sx},${sy} C${sx},${sy + cp} ${tx},${ty - cp} ${tx},${ty}`;
}

function straightPath(sx: number, sy: number, tx: number, ty: number): string {
  const midX = sx + (tx - sx) * 0.35;
  return `M${sx},${sy} L${midX},${sy} L${midX},${ty} L${tx},${ty}`;
}

export function layoutExecutionMap(model: ExecutionMapModel): ExecutionMapLayout {
  const positions = new Map<string, NodePosition>();
  const links: LayoutLink[] = [];
  const mainTaskNodes: NodePosition[] = [];
  const orphanNodes: NodePosition[] = [];
  const collapsedNodes: NodePosition[] = [];

  const rootPos = nodePos(ROOT_ID, 0, 0, NODE_WIDTH, NODE_HEIGHT);
  positions.set(ROOT_ID, rootPos);

  let currentY = NODE_HEIGHT + SPINE_Y_GAP;

  for (let i = 0; i < model.mainTasks.length; i++) {
    const task = model.mainTasks[i];
    const pos = nodePos(task.taskId, 0, currentY);
    positions.set(task.taskId, pos);
    mainTaskNodes.push(pos);

    if (i === 0) {
      const halfW = NODE_WIDTH / 2;
      links.push({ sourceId: ROOT_ID, targetId: task.taskId, path: elbowPath(halfW, NODE_HEIGHT, halfW, currentY) });
    } else {
      const prevPos = mainTaskNodes[i - 1];
      const halfW = NODE_WIDTH / 2;
      links.push({ sourceId: model.mainTasks[i - 1].taskId, targetId: task.taskId, path: elbowPath(halfW, prevPos.y + NODE_HEIGHT, halfW, currentY) });
    }

    const children = task.children;
    const needsCollapse = children.length > CHILD_COLLAPSE_THRESHOLD;

    if (needsCollapse) {
      const collapsedId = `${task.taskId}__collapsed`;
      const childStartY = currentY + BRANCH_Y_GAP * 0.5;
      const collapsedPos = nodePos(collapsedId, BRANCH_X_OFFSET, childStartY, NODE_WIDTH, NODE_HEIGHT);
      positions.set(collapsedId, collapsedPos);
      collapsedNodes.push(collapsedPos);

      links.push({
        sourceId: task.taskId,
        targetId: collapsedId,
        path: straightPath(NODE_WIDTH, currentY + NODE_HEIGHT / 2, BRANCH_X_OFFSET, childStartY + NODE_HEIGHT / 2),
      });

      currentY += NODE_HEIGHT + SPINE_Y_GAP;

      currentY += NODE_HEIGHT + SPINE_Y_GAP;
    } else if (children.length > 0) {
      let childY = currentY + BRANCH_Y_GAP;
      for (const child of children) {
        const childPos = nodePos(child.taskId, BRANCH_X_OFFSET, childY);
        positions.set(child.taskId, childPos);

        links.push({
          sourceId: task.taskId,
          targetId: child.taskId,
          path: straightPath(NODE_WIDTH, currentY + NODE_HEIGHT / 2, BRANCH_X_OFFSET, childY + NODE_HEIGHT / 2),
        });

        childY += NODE_HEIGHT + BRANCH_Y_GAP * 0.5;
      }
      currentY = childY + SPINE_Y_GAP;
    } else {
      currentY += NODE_HEIGHT + SPINE_Y_GAP;
    }
  }

  if (model.orphanGroup.length > 0) {
    currentY += SPINE_Y_GAP;
    for (const orphan of model.orphanGroup) {
      const pos = nodePos(orphan.taskId, 0, currentY);
      positions.set(orphan.taskId, pos);
      orphanNodes.push(pos);
      currentY += NODE_HEIGHT + BRANCH_Y_GAP;
    }
  }

  return { rootNode: rootPos, mainTaskNodes, orphanNodes, collapsedNodes, nodePositions: positions, links };
}
