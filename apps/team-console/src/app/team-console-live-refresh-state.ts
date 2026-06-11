import type { TeamCanvasTask, TeamRunState, TeamTaskState } from "../api/team-types";
import { generatedSourceLatestAt, generatedSourceLatestRunId, generatedSourceParentTaskId } from "./team-console-generated-source";

function sameReferenceArray<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function generatedSourceIdentityKey(task: TeamCanvasTask): string {
  const source = task.generatedSource;
  if (!source) return "";
  const canResetToManaged = Boolean(
    source.latestManagedWorkUnit || (source as { canResetToManaged?: boolean }).canResetToManaged,
  );
  return [
    source.schemaVersion,
    generatedSourceParentTaskId(source) ?? "",
    source.sourceItemId,
    source.itemStatus,
    generatedSourceLatestRunId(source) ?? "",
    source.schemaVersion === "team/generated-task-source-2" ? source.latestSourceAttemptId ?? "" : source.latestDiscoveryAttemptId ?? "",
    generatedSourceLatestAt(source) ?? "",
    source.workUnitMode,
    canResetToManaged,
  ].join("|");
}

export function taskCatalogIdentityKey(task: TeamCanvasTask): string {
  return [
    task.taskId,
    task.canvasKind ?? "",
    task.title,
    task.leaderAgentId,
    task.status,
    task.updatedAt,
    task.archived,
    generatedSourceIdentityKey(task),
  ].join("|");
}

export function mergeTaskCatalog(current: TeamCanvasTask[], incoming: TeamCanvasTask[]): TeamCanvasTask[] {
  if (current.length === 0) return incoming;
  const currentById = new Map(current.map((task) => [task.taskId, task]));
  const next = incoming.map((task) => {
    const existing = currentById.get(task.taskId);
    return existing && taskCatalogIdentityKey(existing) === taskCatalogIdentityKey(task) ? existing : task;
  });
  return sameReferenceArray(current, next) ? current : next;
}

export function mergeTaskCatalogIncremental(
  current: TeamCanvasTask[],
  incoming: TeamCanvasTask[],
  deletedTaskIds: string[] = [],
): TeamCanvasTask[] {
  if (current.length === 0) return incoming;
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
    mergedById.set(
      existing.taskId,
      taskCatalogIdentityKey(existing) === taskCatalogIdentityKey(incomingTask) ? existing : incomingTask,
    );
    incomingById.delete(existing.taskId);
  }
  for (const task of incomingById.values()) {
    if (!deleted.has(task.taskId)) mergedById.set(task.taskId, task);
  }
  const next = [...mergedById.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return sameReferenceArray(current, next) ? current : next;
}

function taskStateIdentityKey(state: TeamTaskState): string {
  return [
    state.status,
    state.manualDisposition ?? "",
    state.attemptCount,
    state.activeAttemptId ?? "",
    state.resultRef ?? "",
    state.errorSummary ?? "",
    state.progress.phase,
    state.progress.message,
    state.progress.updatedAt,
  ].join("|");
}

function runStateIdentityKey(run: TeamRunState): string {
  const taskStateKeys = Object.entries(run.taskStates)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([taskId, state]) => `${taskId}:${taskStateIdentityKey(state)}`)
    .join(";");
  return [
    run.runId,
    run.status,
    run.startedAt ?? "",
    run.finishedAt ?? "",
    run.currentTaskId ?? "",
    run.summary.totalTasks,
    run.summary.succeededTasks,
    run.summary.failedTasks,
    run.summary.cancelledTasks,
    run.summary.skippedTasks,
    taskStateKeys,
  ].join("|");
}

export function sortRunsByCreatedAt(runs: TeamRunState[]): TeamRunState[] {
  return [...runs].sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);
    if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
    if (!Number.isFinite(aTime)) return 1;
    if (!Number.isFinite(bTime)) return -1;
    return bTime - aTime;
  });
}

function mergeRunArray(current: TeamRunState[], incoming: TeamRunState[]): TeamRunState[] {
  const currentById = new Map(current.map((run) => [run.runId, run]));
  const next = sortRunsByCreatedAt(incoming.map((run) => {
    const existing = currentById.get(run.runId);
    return existing && runStateIdentityKey(existing) === runStateIdentityKey(run) ? existing : run;
  }));
  return sameReferenceArray(current, next) ? current : next;
}

function mergeTaskRunMap(
  current: Record<string, TeamRunState[]>,
  incoming: Record<string, TeamRunState[]>,
): Record<string, TeamRunState[]> {
  let changed = false;
  const next = { ...current };
  for (const [taskId, runs] of Object.entries(incoming)) {
    const mergedRuns = mergeRunArray(current[taskId] ?? [], runs);
    if (current[taskId] !== mergedRuns) {
      next[taskId] = mergedRuns;
      changed = true;
    }
  }
  return changed ? next : current;
}

export function mergeTaskRunMapIncremental(
  current: Record<string, TeamRunState[]>,
  incoming: Record<string, TeamRunState[]>,
  deletedRunIdsByTaskId: Record<string, string[]> = {},
): Record<string, TeamRunState[]> {
  let changed = false;
  const next = { ...current };
  for (const [taskId, runIds] of Object.entries(deletedRunIdsByTaskId)) {
    if (runIds.length === 0 || !next[taskId]) continue;
    const deleted = new Set(runIds);
    const filtered = next[taskId].filter((run) => !deleted.has(run.runId));
    if (!sameReferenceArray(next[taskId], filtered)) {
      next[taskId] = filtered;
      changed = true;
    }
  }
  for (const [taskId, runs] of Object.entries(incoming)) {
    if (runs.length === 0) continue;
    const mergedRuns = mergeRunArray(next[taskId] ?? [], runs);
    if (next[taskId] !== mergedRuns) {
      next[taskId] = mergedRuns;
      changed = true;
    }
  }
  return changed ? next : current;
}

export function mergeRootTaskRunMap(
  current: Record<string, TeamRunState[]>,
  incoming: Record<string, TeamRunState[]>,
  previousRootTaskIds: Set<string>,
  nextRootTaskIds: Set<string>,
): Record<string, TeamRunState[]> {
  let changed = false;
  const next = { ...current };
  for (const taskId of previousRootTaskIds) {
    if (!nextRootTaskIds.has(taskId) && taskId in next) {
      delete next[taskId];
      changed = true;
    }
  }
  const merged = mergeTaskRunMap(next, incoming);
  return changed || merged !== next ? merged : current;
}

export function mergeTaskRun(
  current: Record<string, TeamRunState[]>,
  taskId: string,
  runState: TeamRunState,
): Record<string, TeamRunState[]> {
  const runs = current[taskId] ?? [];
  const nextRuns = runs.some((run) => run.runId === runState.runId)
    ? runs.map((run) => {
        if (run.runId !== runState.runId) return run;
        return runStateIdentityKey(run) === runStateIdentityKey(runState) ? run : runState;
      })
    : [runState, ...runs];
  const sortedRuns = sortRunsByCreatedAt(nextRuns);
  return sameReferenceArray(runs, sortedRuns) ? current : { ...current, [taskId]: sortedRuns };
}
