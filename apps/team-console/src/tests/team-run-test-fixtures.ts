import type { TeamAttemptMetadata, TeamCanvasTask, TeamRunState } from "../api/team-types";

export function makeLiveTaskRunFixture(task: TeamCanvasTask, runId = "live-task-run-1"): TeamRunState {
  return {
    runId,
    planId: `canvas_task_${task.taskId}`,
    source: { type: "canvas-task", taskId: task.taskId },
    teamUnitId: `canvas_task_unit_${task.taskId}`,
    status: "completed",
    createdAt: "2026-05-25T00:00:00.000Z",
    startedAt: "2026-05-25T00:00:01.000Z",
    finishedAt: "2026-05-25T00:00:05.000Z",
    currentTaskId: null,
    taskStates: {
      [task.taskId]: {
        status: "succeeded",
        attemptCount: 1,
        activeAttemptId: "legacy-attempt-1",
        resultRef: null,
        errorSummary: null,
        progress: {
          phase: "succeeded",
          message: "已通过",
          updatedAt: "2026-05-25T00:00:05.000Z",
        },
      },
    },
    summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
  };
}

export function makeLegacyAttemptFixture(task: TeamCanvasTask): TeamAttemptMetadata {
  return {
    attemptId: "legacy-attempt-1",
    taskId: task.taskId,
    status: "succeeded",
    phase: "succeeded",
    createdAt: "2026-05-25T00:00:01.000Z",
    updatedAt: "2026-05-25T00:00:05.000Z",
    finishedAt: "2026-05-25T00:00:05.000Z",
    worker: [],
    checker: [],
    watcher: null,
    resultRef: null,
    errorSummary: null,
    files: [],
  };
}
