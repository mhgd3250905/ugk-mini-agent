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
  const taskDefMap = new Map<string, TaskDefinition>();
  const planTaskMap = new Map<string, TeamTask>();

  for (const t of plan.tasks) {
    planTaskMap.set(t.id, t);
  }

  for (const td of run.taskDefinitions ?? []) {
    taskDefMap.set(td.id, td);
  }

  const mainTasks: ExecutionNode[] = [];

  const childrenByParent = new Map<string, TaskDefinition[]>();
  const assignedChildren = new Set<string>();
  const prefixFallbackIds = new Set<string>();

  for (const td of run.taskDefinitions ?? []) {
    const pid = td.parentTaskId;
    if (pid) {
      const list = childrenByParent.get(pid) ?? [];
      list.push(td);
      childrenByParent.set(pid, list);
      assignedChildren.add(td.id);
    }
  }

  for (const td of run.taskDefinitions ?? []) {
    if (assignedChildren.has(td.id)) continue;
    if (planTaskMap.has(td.id)) continue;

    for (const planTask of plan.tasks) {
      const prefix = planTask.id + "__";
      if (td.id.startsWith(prefix)) {
        td.parentTaskId = planTask.id;
        td.generatedSource = td.generatedSource ?? "for_each";
        const list = childrenByParent.get(planTask.id) ?? [];
        list.push(td);
        childrenByParent.set(planTask.id, list);
        assignedChildren.add(td.id);
        prefixFallbackIds.add(td.id);
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
    for (const childDef of children) {
      const childState = run.taskStates[childDef.id];
      if (!childState) continue;

      const fallback = prefixFallbackIds.has(childDef.id);
      const effectiveParentId = childDef.parentTaskId ?? planTask.id;
      childDef.parentTaskId = effectiveParentId;

      const childKind = taskKind(childDef, true, childDef.generatedSource, fallback);
      const childNode = toNode(childDef, childState.status, childState, childKind, 1, childDef.generatedSource, fallback);
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
