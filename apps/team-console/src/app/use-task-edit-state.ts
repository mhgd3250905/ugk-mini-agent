import { useCallback, useState } from "react";
import type { TeamCanvasTask } from "../api/team-types";

export type TaskEditDirtyField = "title" | "leaderAgentId" | "workerAgentId" | "checkerAgentId";

export type TaskEditBaseSnapshot = {
  title: string;
  leaderAgentId: string;
  workerAgentId: string;
  checkerAgentId: string;
  updatedAt: string;
};

export type TaskEditDraft = {
  taskId: string;
  title: string;
  leaderAgentId: string;
  workerAgentId: string;
  checkerAgentId: string;
  base: TaskEditBaseSnapshot;
  dirtyFields: Partial<Record<TaskEditDirtyField, true>>;
};

export function makeTaskEditDraft(task: TeamCanvasTask): TaskEditDraft {
  const base = {
    title: task.title,
    leaderAgentId: task.leaderAgentId,
    workerAgentId: task.workUnit.workerAgentId,
    checkerAgentId: task.workUnit.checkerAgentId,
    updatedAt: task.updatedAt,
  };
  return {
    taskId: task.taskId,
    title: base.title,
    leaderAgentId: base.leaderAgentId,
    workerAgentId: base.workerAgentId,
    checkerAgentId: base.checkerAgentId,
    base,
    dirtyFields: {},
  };
}

export function hasDirtyTaskEditConflict(task: TeamCanvasTask, draft: TaskEditDraft): boolean {
  const dirty = draft.dirtyFields;
  return Boolean(
    (dirty.title && task.title !== draft.base.title && draft.title.trim() !== task.title) ||
    (dirty.leaderAgentId && task.leaderAgentId !== draft.base.leaderAgentId && draft.leaderAgentId !== task.leaderAgentId) ||
    (dirty.workerAgentId && task.workUnit.workerAgentId !== draft.base.workerAgentId && draft.workerAgentId !== task.workUnit.workerAgentId) ||
    (dirty.checkerAgentId && task.workUnit.checkerAgentId !== draft.base.checkerAgentId && draft.checkerAgentId !== task.workUnit.checkerAgentId)
  );
}

function clearTaskRecordEntry<T>(current: Record<string, T>, taskId: string): Record<string, T> {
  if (!(taskId in current)) return current;
  const next = { ...current };
  delete next[taskId];
  return next;
}

export function useTaskEditState() {
  const [taskEditDraftByTaskId, setTaskEditDraftByTaskId] = useState<Record<string, TaskEditDraft>>({});
  const [taskEditSavingByTaskId, setTaskEditSavingByTaskId] = useState<Record<string, boolean>>({});
  const [taskEditWarningByTaskId, setTaskEditWarningByTaskId] = useState<Record<string, string | null>>({});

  const openTaskEditDraft = useCallback((task: TeamCanvasTask) => {
    setTaskEditDraftByTaskId((current) => ({
      ...current,
      ...(current[task.taskId] ? {} : { [task.taskId]: makeTaskEditDraft(task) }),
    }));
    setTaskEditWarningByTaskId((current) => clearTaskRecordEntry(current, task.taskId));
  }, []);

  const updateTaskEditDraft = useCallback((taskId: string, field: TaskEditDirtyField, value: string) => {
    setTaskEditDraftByTaskId((current) => {
      const existing = current[taskId];
      return existing ? {
        ...current,
        [taskId]: {
          ...existing,
          [field]: value,
          dirtyFields: { ...existing.dirtyFields, [field]: true },
        },
      } : current;
    });
  }, []);

  const replaceTaskEditDraft = useCallback((task: TeamCanvasTask) => {
    setTaskEditDraftByTaskId((current) => ({
      ...current,
      [task.taskId]: makeTaskEditDraft(task),
    }));
  }, []);

  const clearTaskEditState = useCallback((taskId?: string) => {
    if (taskId) {
      setTaskEditDraftByTaskId((current) => clearTaskRecordEntry(current, taskId));
      setTaskEditWarningByTaskId((current) => clearTaskRecordEntry(current, taskId));
      setTaskEditSavingByTaskId((current) => clearTaskRecordEntry(current, taskId));
    } else {
      setTaskEditDraftByTaskId({});
      setTaskEditWarningByTaskId({});
      setTaskEditSavingByTaskId({});
    }
  }, []);

  const clearTaskEditWarning = useCallback((taskId: string) => {
    setTaskEditWarningByTaskId((current) => clearTaskRecordEntry(current, taskId));
  }, []);

  const setTaskEditWarning = useCallback((taskId: string, warning: string | null) => {
    setTaskEditWarningByTaskId((current) => ({
      ...current,
      [taskId]: warning,
    }));
  }, []);

  const setTaskEditSaving = useCallback((taskId: string, saving: boolean) => {
    setTaskEditSavingByTaskId((current) => ({ ...current, [taskId]: saving }));
  }, []);

  return {
    taskEditDraftByTaskId,
    taskEditSavingByTaskId,
    taskEditWarningByTaskId,
    openTaskEditDraft,
    updateTaskEditDraft,
    replaceTaskEditDraft,
    clearTaskEditState,
    clearTaskEditWarning,
    setTaskEditWarning,
    setTaskEditSaving,
  };
}
