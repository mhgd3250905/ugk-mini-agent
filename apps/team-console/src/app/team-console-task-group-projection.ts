import type { TeamCanvasTask, TeamRunState, ResolvedTeamTaskGroup, TeamTaskGroupRun } from "../api/team-types";
import type { AtlasTaskGroup, AtlasTaskNode } from "../graph/ExecutionMap";
import { isActiveRun } from "../shared/status";

export type TaskGroupRunUiState = {
  latestByGroupId: Record<string, TeamTaskGroupRun>;
  savingByGroupId: Record<string, boolean>;
};

export type StoredTaskGroupDisplayState = {
  groupId: string;
  collapsed: boolean;
  locked: boolean;
};

export interface BuildLiveTaskGroupsInput {
  groups: ResolvedTeamTaskGroup[];
  taskNodes: AtlasTaskNode[];
  selectedTaskIds: string[];
  displayStates: StoredTaskGroupDisplayState[];
  runUiState: TaskGroupRunUiState;
  taskRunsByTaskId: Record<string, TeamRunState[]>;
  tasksById: Map<string, TeamCanvasTask>;
}

export function buildLiveTaskGroups(input: BuildLiveTaskGroupsInput): AtlasTaskGroup[] {
  const nodeIdByTaskId = new Map(input.taskNodes.map((node) => [node.taskId, node.nodeId]));
  const displayStateByGroupId = new Map(input.displayStates.map((state) => [state.groupId, state]));
  return input.groups.flatMap((group) => {
    if (group.archived) return [];
    const taskNodeIds = group.taskIds.flatMap((taskId) => {
      const nodeId = nodeIdByTaskId.get(taskId);
      return nodeId ? [nodeId] : [];
    });
    const displayState = displayStateByGroupId.get(group.groupId);
    const latestGroupRun = input.runUiState.latestByGroupId[group.groupId];
    const blockedByActiveTask = group.taskIds.some((taskId) => (
      (input.taskRunsByTaskId[taskId] ?? []).some((taskRun) => isActiveRun(taskRun.status))
    ));
    const currentTaskIds = new Set(group.taskIds);
    return [{
      groupId: group.groupId,
      title: group.title,
      taskNodeIds,
      taskIds: group.taskIds,
      headTaskIds: group.headTaskIds,
      status: group.status,
      validationErrors: group.validation.errors,
      members: group.taskIds.map((taskId) => ({
        taskId,
        title: input.tasksById.get(taskId)?.title ?? taskId,
      })),
      canAddSelectedTasks: input.selectedTaskIds.some((taskId) => !currentTaskIds.has(taskId)),
      collapsed: displayState?.collapsed ?? false,
      locked: displayState?.locked ?? false,
      groupRun: {
        status: latestGroupRun?.status ?? "idle",
        groupRunId: latestGroupRun?.groupRunId,
        entryCount: latestGroupRun?.entryRuns.length ?? 0,
        observedCount: latestGroupRun?.observedRuns.length ?? 0,
        saving: Boolean(input.runUiState.savingByGroupId[group.groupId]),
        blockedByActiveTask,
      },
    }];
  });
}
