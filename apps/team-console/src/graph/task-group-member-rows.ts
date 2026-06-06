import type { TeamTaskConnection } from "../api/team-types";

const TASK_GROUP_HEADER_BAND_HEIGHT = 76;
const TASK_GROUP_COLLAPSED_HEADER_BAND_HEIGHT = 42;
const TASK_GROUP_MEMBER_TOP = 42;
const TASK_GROUP_MEMBER_ROW_HEIGHT = 24;
const TASK_GROUP_MEMBER_ROW_GAP = 6;
const TASK_GROUP_HEADER_BOTTOM_GAP = 10;

export type TaskGroupMemberChip = { taskId: string; title: string };
export type TaskGroupMemberRow = TaskGroupMemberChip[];

export interface TaskGroupMemberRowsGroup {
  taskIds?: string[];
  headTaskIds?: string[];
  members?: TaskGroupMemberChip[];
}

export interface TaskGroupMemberRowsNode {
  taskId: string;
}

export interface TaskGroupMemberRowsTaskTitle {
  title: string;
}

export function taskGroupHeaderBandHeight(collapsed: boolean, memberRowCount: number): number {
  if (collapsed) return TASK_GROUP_COLLAPSED_HEADER_BAND_HEIGHT;
  const memberBandHeight = memberRowCount > 0
    ? TASK_GROUP_MEMBER_TOP
      + memberRowCount * TASK_GROUP_MEMBER_ROW_HEIGHT
      + Math.max(0, memberRowCount - 1) * TASK_GROUP_MEMBER_ROW_GAP
      + TASK_GROUP_HEADER_BOTTOM_GAP
    : TASK_GROUP_HEADER_BAND_HEIGHT;
  return Math.max(TASK_GROUP_HEADER_BAND_HEIGHT, memberBandHeight);
}

export function buildTaskGroupMemberRows(
  group: TaskGroupMemberRowsGroup,
  nodes: TaskGroupMemberRowsNode[],
  taskConnections: TeamTaskConnection[],
  tasksById: Map<string, TaskGroupMemberRowsTaskTitle> | undefined,
): TaskGroupMemberRow[] {
  const memberByTaskId = new Map((group.members ?? []).map((member) => [member.taskId, member]));
  const taskIds = group.taskIds?.length
    ? group.taskIds
    : group.members?.length
      ? group.members.map((member) => member.taskId)
      : nodes.map((node) => node.taskId);
  const taskIdSet = new Set(taskIds);
  const taskIdOrder = new Map(taskIds.map((taskId, index) => [taskId, index]));
  const toMember = (taskId: string): TaskGroupMemberChip => ({
    taskId,
    title: memberByTaskId.get(taskId)?.title ?? tasksById?.get(taskId)?.title ?? taskId,
  });
  const internalConnections = taskConnections.filter((connection) => (
    connection.status !== "stale"
    && taskIdSet.has(connection.fromTaskId)
    && taskIdSet.has(connection.toTaskId)
  ));
  const incomingTaskIds = new Set(internalConnections.map((connection) => connection.toTaskId));
  const outgoingByTaskId = new Map<string, TeamTaskConnection[]>();
  for (const connection of internalConnections) {
    const outgoing = outgoingByTaskId.get(connection.fromTaskId) ?? [];
    outgoing.push(connection);
    outgoingByTaskId.set(connection.fromTaskId, outgoing);
  }
  for (const outgoing of outgoingByTaskId.values()) {
    outgoing.sort((a, b) => (taskIdOrder.get(a.toTaskId) ?? Number.MAX_SAFE_INTEGER) - (taskIdOrder.get(b.toTaskId) ?? Number.MAX_SAFE_INTEGER));
  }

  const validHeadTaskIds = (group.headTaskIds ?? []).filter((taskId) => taskIdSet.has(taskId));
  const derivedHeadTaskIds = taskIds.filter((taskId) => !incomingTaskIds.has(taskId));
  const headTaskIds = validHeadTaskIds.length > 0
    ? validHeadTaskIds
    : derivedHeadTaskIds.length > 0
      ? derivedHeadTaskIds
      : taskIds.slice(0, 1);
  const visitedTaskIds = new Set<string>();
  const rows: TaskGroupMemberRow[] = [];
  for (const headTaskId of headTaskIds) {
    const row: TaskGroupMemberRow = [];
    const rowVisitedTaskIds = new Set<string>();
    let currentTaskId: string | undefined = headTaskId;
    while (currentTaskId && taskIdSet.has(currentTaskId) && !rowVisitedTaskIds.has(currentTaskId)) {
      row.push(toMember(currentTaskId));
      rowVisitedTaskIds.add(currentTaskId);
      visitedTaskIds.add(currentTaskId);
      const nextConnection: TeamTaskConnection | undefined = (outgoingByTaskId.get(currentTaskId) ?? []).find((connection) => !rowVisitedTaskIds.has(connection.toTaskId));
      currentTaskId = nextConnection?.toTaskId;
    }
    if (row.length > 0) rows.push(row);
  }

  const fallbackRow = taskIds
    .filter((taskId) => !visitedTaskIds.has(taskId))
    .map(toMember);
  if (fallbackRow.length > 0) rows.push(fallbackRow);
  return rows;
}
