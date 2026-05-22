export type RunStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "completed_with_failures"
  | "failed"
  | "cancelled";

export type TaskStatus =
  | "pending"
  | "running"
  | "interrupted"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "skipped";

export type TaskManualDisposition = "default" | "skip" | "force_rerun";

export type TaskType = "normal" | "discovery" | "for_each";
export type GeneratedSource = "for_each" | "decomposition";

export interface TeamTask {
  id: string;
  type?: TaskType;
  title: string;
  input: { text: string };
  acceptance: { rules: string[] };
  parentTaskId?: string;
  sourceItemId?: string;
  generated?: boolean;
  decomposer?: { mode: "none" | "leaf" | "propagate"; maxChildren?: number };
  discovery?: { outputKey: string };
  forEach?: {
    itemsFrom: string;
    mode: "sequential" | "parallel";
    taskTemplate: {
      title: string;
      input: { text: string };
      acceptance: { rules: string[] };
    };
  };
}

export interface TeamPlan {
  planId: string;
  title: string;
  defaultTeamUnitId: string;
  goal: { text: string };
  tasks: TeamTask[];
  outputContract: { text: string };
  archived: boolean;
  runCount: number;
}

export interface TeamTaskState {
  status: TaskStatus;
  manualDisposition?: TaskManualDisposition;
  attemptCount: number;
  activeAttemptId: string | null;
  resultRef: string | null;
  errorSummary: string | null;
  progress: { phase: string; message: string; updatedAt: string };
}

export interface TeamRunState {
  runId: string;
  planId: string;
  teamUnitId: string;
  status: RunStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  currentTaskId: string | null;
  taskStates: Record<string, TeamTaskState>;
  summary: {
    totalTasks: number;
    succeededTasks: number;
    failedTasks: number;
    cancelledTasks: number;
    skippedTasks: number;
  };
}

export interface TaskDefinition extends TeamTask {
  generatedSource?: GeneratedSource;
}

export interface RunDetail extends TeamRunState {
  taskDefinitions?: TaskDefinition[];
}

export interface TeamApiError {
  message: string;
  status?: number;
}
