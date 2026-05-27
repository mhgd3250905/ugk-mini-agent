import type {
  TeamPlan,
  RunDetail,
  TaskDefinition,
  TaskStatus,
  GeneratedSource,
  TeamTask,
} from "../api/team-types";
import { errorFirstLine } from "../shared/format";

export type NodeKind =
  | "root"
  | "task"
  | "discovery"
  | "for_each"
  | "child_for_each"
  | "child_decomposition"
  | "child_prefix_fallback"
  | "orphan";

export interface ExecutionNode {
  nodeId: string;
  taskId: string;
  title: string;
  kind: NodeKind;
  status: TaskStatus;
  errorFirstLine: string;
  attemptCount: number;
  activeAttemptId: string | null;
  resultRef: string | null;
  generatedSource?: GeneratedSource;
  fallback?: boolean;
  children: ExecutionNode[];
  depth: number;
}

export interface RunRootNode {
  runId: string;
  status: RunDetail["status"];
  totalTasks: number;
  succeeded: number;
  failed: number;
}

export interface ExecutionMapModel {
  rootNode: RunRootNode;
  mainTasks: ExecutionNode[];
  orphanGroup: ExecutionNode[];
  allNodes: Map<string, ExecutionNode>;
  parentChainLookup: Map<string, string[]>;
}

const CHILD_COLLAPSE_THRESHOLD = 6;

export { CHILD_COLLAPSE_THRESHOLD };

interface ChildAssignment {
  definition: TaskDefinition;
  parentId: string;
  generatedSource?: GeneratedSource;
  fallback?: boolean;
}

function taskKind(task: TeamTask, isChild: boolean, source?: GeneratedSource, fallback?: boolean): NodeKind {
  if (fallback) return "child_prefix_fallback";
  if (isChild && source === "for_each") return "child_for_each";
  if (isChild && source === "decomposition") return "child_decomposition";
  if (task.type === "discovery") return "discovery";
  if (task.type === "for_each") return "for_each";
  return "task";
}

function toNode(
  task: TeamTask,
  status: TaskStatus,
  state: {
    attemptCount: number;
    activeAttemptId: string | null;
    resultRef: string | null;
    errorSummary: string | null;
  },
  kind: NodeKind,
  depth: number,
  source?: GeneratedSource,
  fallback?: boolean,
): ExecutionNode {
  return {
    nodeId: task.id,
    taskId: task.id,
    title: task.title,
    kind,
    status,
    errorFirstLine: errorFirstLine(state.errorSummary),
    attemptCount: state.attemptCount,
    activeAttemptId: state.activeAttemptId,
    resultRef: state.resultRef,
    generatedSource: source,
    fallback,
    children: [],
    depth,
  };
}

export function buildExecutionMapModel(plan: TeamPlan, run: RunDetail): ExecutionMapModel {
  const allNodes = new Map<string, ExecutionNode>();
  const parentChainLookup = new Map<string, string[]>();
  const planTaskMap = new Map<string, TeamTask>();

  for (const t of plan.tasks) {
    planTaskMap.set(t.id, t);
  }

  const mainTasks: ExecutionNode[] = [];

  const childrenByParent = new Map<string, ChildAssignment[]>();
  const assignedChildren = new Set<string>();

  function addChild(assignment: ChildAssignment): boolean {
    if (!planTaskMap.has(assignment.parentId)) return false;
    const list = childrenByParent.get(assignment.parentId) ?? [];
    list.push(assignment);
    childrenByParent.set(assignment.parentId, list);
    assignedChildren.add(assignment.definition.id);
    return true;
  }

  for (const td of run.taskDefinitions ?? []) {
    const pid = td.parentTaskId;
    if (pid) {
      addChild({
        definition: td,
        parentId: pid,
        generatedSource: td.generatedSource,
      });
    }
  }

  const forEachParents = plan.tasks.filter((task) => task.type === "for_each" || task.forEach);
  for (const td of run.taskDefinitions ?? []) {
    if (assignedChildren.has(td.id)) continue;
    if (planTaskMap.has(td.id)) continue;
    if (!td.sourceItemId) continue;

    if (forEachParents.length === 1) {
      addChild({
        definition: td,
        parentId: forEachParents[0].id,
        generatedSource: td.generatedSource ?? "for_each",
      });
    }
  }

  for (const td of run.taskDefinitions ?? []) {
    if (assignedChildren.has(td.id)) continue;
    if (planTaskMap.has(td.id)) continue;

    for (const planTask of plan.tasks) {
      const prefix = planTask.id + "__";
      if (td.id.startsWith(prefix)) {
        addChild({
          definition: td,
          parentId: planTask.id,
          generatedSource: td.generatedSource ?? "for_each",
          fallback: true,
        });
        break;
      }
    }
  }

  for (const planTask of plan.tasks) {
    const state = run.taskStates[planTask.id];
    if (!state) continue;

    const kind = taskKind(planTask, false);
    const node = toNode(planTask, state.status, state, kind, 0);
    allNodes.set(node.nodeId, node);
    parentChainLookup.set(node.nodeId, []);

    const children = childrenByParent.get(planTask.id) ?? [];
    for (const child of children) {
      const childDef = child.definition;
      const childState = run.taskStates[childDef.id];
      if (!childState) continue;

      const fallback = child.fallback === true;
      const childKind = taskKind(childDef, true, child.generatedSource, fallback);
      const childNode = toNode(childDef, childState.status, childState, childKind, 1, child.generatedSource, fallback);
      childNode.nodeId = childDef.id;
      childNode.fallback = fallback || undefined;
      node.children.push(childNode);
      allNodes.set(childNode.nodeId, childNode);
      parentChainLookup.set(childNode.nodeId, [planTask.id]);
    }

    mainTasks.push(node);
  }

  const orphanGroup: ExecutionNode[] = [];
  for (const td of run.taskDefinitions ?? []) {
    if (planTaskMap.has(td.id) || assignedChildren.has(td.id)) continue;

    const state = run.taskStates[td.id];
    if (!state) continue;

    const node = toNode(td, state.status, state, "orphan", 1, td.generatedSource);
    node.nodeId = td.id;
    orphanGroup.push(node);
    allNodes.set(node.nodeId, node);
    parentChainLookup.set(node.nodeId, []);
  }

  const rootNode: RunRootNode = {
    runId: run.runId,
    status: run.status,
    totalTasks: run.summary.totalTasks,
    succeeded: run.summary.succeededTasks,
    failed: run.summary.failedTasks,
  };

  return { rootNode, mainTasks, orphanGroup, allNodes, parentChainLookup };
}
