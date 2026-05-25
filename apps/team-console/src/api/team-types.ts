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

export type TeamAttemptRoleProcessRole = "worker" | "checker";
export type TeamAttemptRoleProcessStatus = "waiting" | "running" | "succeeded" | "failed" | "cancelled";

export interface TeamAttemptRoleProcess {
  role: TeamAttemptRoleProcessRole;
  profileId: string;
  status: TeamAttemptRoleProcessStatus;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
  process: AgentChatProcess | null;
}

export type TeamAttemptRoleProcesses = Partial<Record<TeamAttemptRoleProcessRole, TeamAttemptRoleProcess>>;

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
  roleProcesses?: TeamAttemptRoleProcesses;
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

export type TeamCanvasTaskStatus = "drafting" | "ready" | "locked" | "archived";

export interface TeamWorkUnitDefinition {
  title: string;
  input: { text: string };
  outputContract: { text: string };
  acceptance: { rules: string[] };
  workerAgentId: string;
  checkerAgentId: string;
}

export interface TeamCanvasTask {
  taskId: string;
  title: string;
  leaderAgentId: string;
  workUnit: TeamWorkUnitDefinition;
  status: TeamCanvasTaskStatus;
  createdAt: string;
  updatedAt: string;
  createdByAgentId?: string;
  archived: boolean;
}

export interface TeamCanvasTaskListResponse {
  tasks: TeamCanvasTask[];
}

export interface TeamTaskMutationResponse {
  task: TeamCanvasTask;
  warnings?: string[];
}

export interface TeamTaskUpdateRequest {
  title?: string;
  leaderAgentId?: string;
  workUnit?: TeamWorkUnitDefinition;
  status?: TeamCanvasTaskStatus;
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
  source?: { type: "canvas-task"; taskId: string };
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

export interface TeamCanvasTaskRunListResponse {
  runs: TeamRunState[];
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

export type AgentRunState = "idle" | "busy";

export interface AgentRunStatus {
  agentId: string;
  name: string;
  status: AgentRunState;
  activeConversationId?: string;
  activeSince?: string;
}

export interface AgentRunStatusListResponse {
  agents: AgentRunStatus[];
}

export interface AgentChatMessage {
  role: "user" | "assistant";
  text: string;
  assetRefs?: AgentAssetSummary[];
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

export interface AgentChatStreamRequest {
  conversationId?: string;
  message: string;
  userId?: string;
  browserId?: string;
  assetRefs?: string[];
}

export interface AgentConversationEventsRequest {
  conversationId: string;
  afterEventCursor?: number;
  signal?: AbortSignal;
}

export interface AgentQueueMessageRequest {
  conversationId: string;
  message: string;
  mode: "steer" | "followUp";
  userId?: string;
  browserId?: string;
  assetRefs?: string[];
}

export interface AgentQueueMessageResponse {
  conversationId: string;
  mode: "steer" | "followUp";
  queued: boolean;
  reason?: "not_running" | "browser_changed";
}

export interface AgentConversationResponse {
  conversationId: string;
  currentConversationId: string;
  created: boolean;
  reason?: "running";
}

export interface AgentConversationCatalogItem {
  conversationId: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  running: boolean;
  pinned?: boolean;
  backgroundColor?: string;
}

export interface AgentConversationCatalogResponse {
  currentConversationId: string;
  conversations: AgentConversationCatalogItem[];
}

export interface AgentSwitchConversationResponse {
  conversationId: string;
  currentConversationId: string;
  switched: boolean;
  reason?: "running" | "not_found";
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

export interface AgentChatHistoryFile {
  fileName: string;
  downloadUrl: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface AgentChatHistoryMessage {
  id: string;
  kind: "user" | "assistant" | "system" | "error" | "notification";
  title: string;
  text: string;
  createdAt: string;
  source?: string;
  sourceId?: string;
  runId?: string;
  assetRefs?: AgentAssetSummary[];
  files?: AgentChatHistoryFile[];
}

export interface AgentChatProcessEntry {
  id: string;
  kind: "system" | "tool" | "ok" | "error";
  title: string;
  detail: string;
  createdAt: string;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
}

export interface AgentChatProcess {
  title: string;
  narration: string[];
  currentAction?: string;
  kind?: "system" | "tool" | "ok" | "error";
  isComplete: boolean;
  entries: AgentChatProcessEntry[];
}

export interface AgentChatActiveRun {
  runId: string;
  status: "running" | "interrupted" | "done" | "error";
  assistantMessageId: string;
  eventCursor?: number;
  input: {
    message: string;
    inputAssets: AgentAssetSummary[];
  };
  text: string;
  process: AgentChatProcess | null;
  queue: {
    steering: string[];
    followUp: string[];
  } | null;
  loading: boolean;
  startedAt: string;
  updatedAt: string;
}

export interface AgentConversationState {
  conversationId: string;
  running: boolean;
  contextUsage: AgentContextUsage;
  messages: AgentChatHistoryMessage[];
  viewMessages: AgentChatHistoryMessage[];
  activeRun: AgentChatActiveRun | null;
  historyPage: {
    hasMore: boolean;
    nextBefore?: string;
    limit: number;
  };
  updatedAt: string;
}

export type AgentChatStreamEvent =
  | {
      type: "run_started";
      conversationId: string;
      runId: string;
    }
  | {
      type: "text_delta";
      textDelta: string;
    }
  | {
      type: "heartbeat";
      phase: "reasoning";
    }
  | {
      type: "tool_started";
      toolCallId: string;
      toolName: string;
      args: string;
    }
  | {
      type: "tool_updated";
      toolCallId: string;
      toolName: string;
      partialResult: string;
    }
  | {
      type: "tool_finished";
      toolCallId: string;
      toolName: string;
      isError: boolean;
      result: string;
    }
  | {
      type: "queue_updated";
      steering: readonly string[];
      followUp: readonly string[];
    }
  | {
      type: "interrupted";
      conversationId: string;
      runId: string;
    }
  | {
      type: "done";
      conversationId: string;
      runId: string;
      text: string;
      sessionFile?: string;
      inputAssets?: AgentAssetSummary[];
      files?: Array<{
        id: string;
        assetId: string;
        reference: string;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
        downloadUrl: string;
      }>;
    }
  | {
      type: "error";
      conversationId: string;
      runId: string;
      message: string;
    };

export interface AgentInterruptResponse {
  conversationId: string;
  interrupted: boolean;
  reason?: "not_running" | "abort_not_supported";
}

export interface TeamApiError {
  message: string;
  status?: number;
}
