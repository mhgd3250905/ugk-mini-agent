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
export type AttemptStatus = "running" | "succeeded" | "failed" | "interrupted" | "cancelled";

export type TaskType = "normal" | "discovery" | "for_each";
export type GeneratedSource = "for_each" | "decomposition";

export type AttemptLifecyclePhase =
  | "created"
  | "worker_running"
  | "worker_completed"
  | "checker_reviewing"
  | "checker_passed"
  | "checker_revising"
  | "checker_failed"
  | "watcher_reviewing"
  | "watcher_accepted"
  | "watcher_revision_requested"
  | "watcher_confirmed_failed"
  | "succeeded"
  | "failed"
  | "interrupted"
  | "cancelled";

export type CheckerVerdict = "pass" | "revise" | "fail";
export type WatcherDecision = "accept_task" | "confirm_failed" | "request_revision";
export type WatcherRevisionMode = "amend" | "redo";

export interface TeamRoleRuntimeContext {
  requestedProfileId: string;
  resolvedProfileId: string;
  fallbackUsed: boolean;
  fallbackReason?: "profile_not_found" | "profile_archived" | "legacy_profile";
  browserId: string | null;
  browserScope: string;
}

export interface TeamAttemptWorkerSummary {
  outputRef: string | null;
  outputIndex: number;
  runtimeContext?: TeamRoleRuntimeContext;
}

export interface TeamAttemptCheckerSummary {
  verdict: CheckerVerdict;
  reason: string;
  feedback?: string;
  resultContentRef?: string | null;
  revisionIndex: number;
  recordRef: string | null;
  feedbackRef: string | null;
  runtimeContext?: TeamRoleRuntimeContext;
}

export interface TeamAttemptWatcherSummary {
  decision: WatcherDecision;
  reason: string;
  revisionMode?: WatcherRevisionMode;
  feedback?: string;
  recordRef: string | null;
  runtimeContext?: TeamRoleRuntimeContext;
}

export interface TeamAttemptMetadata {
  attemptId: string;
  taskId: string;
  status: AttemptStatus;
  phase: AttemptLifecyclePhase;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  worker: TeamAttemptWorkerSummary[];
  checker: TeamAttemptCheckerSummary[];
  watcher: TeamAttemptWatcherSummary | null;
  resultRef: string | null;
  errorSummary: string | null;
  files: string[];
}

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

export interface SourceItemData {
  id: string;
  name: string;
  description: string;
  searchKeywords: string;
  estimatedCount: string;
}

export interface TaskDefinition extends TeamTask {
  generatedSource?: GeneratedSource;
  sourceItem?: { id: string; data: SourceItemData };
}

export interface RunDetail extends TeamRunState {
  taskDefinitions?: TaskDefinition[];
}

export interface AgentSummary {
  agentId: string;
  name: string;
  description: string;
  defaultBrowserId?: string;
  defaultModelProvider?: string;
  defaultModelId?: string;
}

export interface AgentCatalogResponse {
  agents: AgentSummary[];
}

export interface AgentChatMessage {
  role: "user" | "assistant";
  text: string;
}

export type AgentAssetKind = "text" | "binary" | "metadata";

export interface AgentAssetSummary {
  assetId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: AgentAssetKind;
  createdAt?: string;
  downloadUrl?: string;
}

export interface AgentChatResponse {
  conversationId?: string;
  text: string;
}

export interface AgentConversationResponse {
  conversationId: string;
  currentConversationId: string;
  created: boolean;
  reason?: "running";
}

export interface AgentContextUsage {
  provider: string;
  model: string;
  currentTokens: number;
  contextWindow: number;
  reserveTokens: number;
  maxResponseTokens: number;
  availableTokens: number;
  percent: number;
  status: "safe" | "caution" | "warning" | "danger";
  mode: "usage" | "estimate";
}

export interface AgentChatStatus {
  conversationId: string;
  running: boolean;
  contextUsage: AgentContextUsage;
}

export interface AgentInterruptResponse {
  conversationId: string;
  interrupted: boolean;
  reason?: "not_running" | "abort_not_supported";
}

export interface TeamApiError {
  message: string;
  status?: number;
}
