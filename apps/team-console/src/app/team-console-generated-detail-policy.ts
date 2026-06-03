import type { TeamCanvasTask } from "../api/team-types";
import { taskCatalogIdentityKey } from "./team-console-live-refresh-state";

function sameReferenceArray<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export type GeneratedTaskCatalogRefreshMergeOptions = {
  deletedTaskIds?: string[];
  locallyArchivedTaskIds?: ReadonlySet<string>;
  recentlyReplacedTaskIds?: ReadonlySet<string>;
};

export function hasTaskDetail(task: TeamCanvasTask): boolean {
  return Boolean((task as Partial<TeamCanvasTask>).workUnit);
}

export function mergeGeneratedTaskSummaryIntoFullTask(existing: TeamCanvasTask, incoming: TeamCanvasTask): TeamCanvasTask {
  return {
    ...existing,
    canvasKind: incoming.canvasKind ?? existing.canvasKind,
    title: incoming.title,
    leaderAgentId: incoming.leaderAgentId,
    status: incoming.status,
    createdAt: incoming.createdAt,
    updatedAt: incoming.updatedAt,
    archived: incoming.archived,
    generatedSource: existing.generatedSource && incoming.generatedSource
      ? {
          ...existing.generatedSource,
          ...incoming.generatedSource,
        }
      : existing.generatedSource,
  };
}

export function mergeGeneratedTaskCatalogIncremental(
  current: TeamCanvasTask[],
  incoming: TeamCanvasTask[],
  deletedTaskIds: string[] = [],
): TeamCanvasTask[] {
  const deleted = new Set(deletedTaskIds);
  const incomingById = new Map(incoming.map((task) => [task.taskId, task]));
  const mergedById = new Map<string, TeamCanvasTask>();
  for (const existing of current) {
    if (deleted.has(existing.taskId)) continue;
    const incomingTask = incomingById.get(existing.taskId);
    if (!incomingTask) {
      mergedById.set(existing.taskId, existing);
      continue;
    }
    if (existing && taskCatalogIdentityKey(existing) === taskCatalogIdentityKey(incomingTask)) {
      mergedById.set(existing.taskId, existing);
    } else if (hasTaskDetail(existing) && !hasTaskDetail(incomingTask)) {
      mergedById.set(existing.taskId, mergeGeneratedTaskSummaryIntoFullTask(existing, incomingTask));
    } else {
      mergedById.set(existing.taskId, incomingTask);
    }
    incomingById.delete(existing.taskId);
  }
  for (const task of incomingById.values()) {
    if (!deleted.has(task.taskId)) mergedById.set(task.taskId, task);
  }
  const next = [...mergedById.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return sameReferenceArray(current, next) ? current : next;
}

export function mergeGeneratedTaskCatalogForRefresh(
  current: TeamCanvasTask[],
  incoming: TeamCanvasTask[],
  options?: GeneratedTaskCatalogRefreshMergeOptions,
): TeamCanvasTask[] {
  const archivedIds = options?.locallyArchivedTaskIds;
  const replacedIds = options?.recentlyReplacedTaskIds;
  const existingById = new Map(current.map((task) => [task.taskId, task]));
  const next = incoming
    .filter((task) => !archivedIds?.has(task.taskId))
    .map((task) => {
      const existing = existingById.get(task.taskId);
      if (!existing) return task;
      if (replacedIds?.has(task.taskId) && existing.updatedAt >= task.updatedAt) {
        return existing;
      }
      if (taskCatalogIdentityKey(existing) === taskCatalogIdentityKey(task)) {
        return existing;
      }
      if (hasTaskDetail(existing) && !hasTaskDetail(task)) {
        return mergeGeneratedTaskSummaryIntoFullTask(existing, task);
      }
      return task;
    });
  const deletedIds = options?.deletedTaskIds;
  if (deletedIds && deletedIds.length > 0) {
    const deleted = new Set(deletedIds);
    const filtered = next.filter((task) => !deleted.has(task.taskId));
    return sameReferenceArray(current, filtered) ? current : filtered;
  }
  return sameReferenceArray(current, next) ? current : next;
}
