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

export type TeamTaskOutputCheck =
  | { type: "json_items"; outputKey?: string; allowDirectArray?: boolean; requiredFields?: string[] }
  | { type: "json_object"; requiredFields?: string[] }
  | {
      type: "html_fragment";
      requiredSubstrings?: string[];
      requiredSelectors?: string[];
      forbiddenTags?: string[];
      requireFence?: boolean;
    }
  | { type: "file_exists"; path?: string };

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
  assistantText?: { content: string; updatedAt: string } | null;
}

export type TeamAttemptRoleProcesses = Partial<Record<TeamAttemptRoleProcessRole, TeamAttemptRoleProcess>>;

export type TeamTaskDeliveryOutcomeStatus = "delivered" | "skipped" | "failed";

export interface TeamTaskTypedConnectionDeliveryOutcome {
  edgeKind?: "typed-connection";
  connectionId: string;
  toTaskId: string;
  toInputPortId: string;
  status: TeamTaskDeliveryOutcomeStatus;
  staleReason?: TaskConnectionStaleReason;
  downstreamRunId?: string;
  error?: string;
  createdAt: string;
}

export type TaskDependencyStaleReason =
  | "source_task_missing"
  | "source_task_archived"
  | "target_task_missing"
  | "target_task_archived";

export interface TeamTaskControlDependencyDeliveryOutcome {
  edgeKind: "control-dependency";
  dependencyId: string;
  toTaskId: string;
  status: TeamTaskDeliveryOutcomeStatus;
  staleReason?: TaskDependencyStaleReason;
  downstreamRunId?: string;
  error?: string;
  createdAt: string;
}

export type TeamTaskDeliveryOutcome =
  | TeamTaskTypedConnectionDeliveryOutcome
  | TeamTaskControlDependencyDeliveryOutcome;

export type TeamDiscoveryDispatchOutcomeStatus = "created" | "updated" | "blocked" | "stale_marked";

export interface TeamDiscoveryDispatchOutcome {
  itemId: string;
  status: TeamDiscoveryDispatchOutcomeStatus;
  generatedTaskId?: string;
  workUnitMode?: TeamGeneratedTaskWorkUnitMode;
  error?: string;
  createdAt: string;
}

export type TeamDiscoveryGeneratedRunOutcomeStatus =
  | "started"
  | "skipped_already_running"
  | "skipped_not_runnable"
  | "failed";

export interface TeamDiscoveryGeneratedRunOutcome {
  itemId: string;
  generatedTaskId: string;
  status: TeamDiscoveryGeneratedRunOutcomeStatus;
  generatedRunId?: string;
  error?: string;
  createdAt: string;
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
  roleProcesses?: TeamAttemptRoleProcesses;
  downstreamDelivery?: TeamTaskDeliveryOutcome[];
  discoveryDispatch?: TeamDiscoveryDispatchOutcome[];
  discoveryGeneratedRuns?: TeamDiscoveryGeneratedRunOutcome[];
}

export interface TeamTaskRunAnnotation {
  runId: string;
  taskId: string;
  best: boolean;
  archived: boolean;
  note?: string;
  updatedAt: string;
}

export interface TeamTaskRunHistoryItem {
  run: TeamRunState;
  annotation: TeamTaskRunAnnotation;
}

export interface TeamTaskRunHistoryResponse {
  taskId: string;
  total: number;
  limit: number;
  offset: number;
  runs: TeamTaskRunHistoryItem[];
}

export interface TeamTaskRunAnnotationMutationResponse {
  annotation: TeamTaskRunAnnotation;
}

export interface TeamTaskRunAnnotationPatchRequest {
  best?: boolean;
  archived?: boolean;
  note?: string | null;
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
export type TeamCanvasTaskKind = "task" | "discovery";
export type TeamGeneratedTaskItemStatus = "active" | "stale";
export type TeamGeneratedTaskWorkUnitMode = "managed" | "customized";

export interface TeamDiscoverySpec {
  schemaVersion: "team/discovery-spec-1";
  discoveryGoal: string;
  outputKey: string;
  itemIdField: "id";
  requiredItemFields: string[];
  recommendedItemFields?: string[];
  dispatchGoal: string;
  dispatcherAgentId: string;
  generatedWorkerAgentId: string;
  generatedCheckerAgentId: string;
  autoRun: {
    enabled: true;
    concurrency: 3;
  };
}

export interface TeamGeneratedTaskSource {
  schemaVersion: "team/generated-task-source-1";
  sourceDiscoveryTaskId: string;
  sourceItemId: string;
  itemStatus: TeamGeneratedTaskItemStatus;
  itemPayload: Record<string, unknown>;
  latestDiscoveryRunId?: string;
  latestDiscoveryAttemptId?: string;
  latestDiscoveredAt?: string;
  workUnitMode: TeamGeneratedTaskWorkUnitMode;
  latestManagedWorkUnit?: TeamWorkUnitDefinition;
}

export interface TeamTaskTemplateParameter {
  id: string;
  label: string;
  description?: string;
  required?: boolean;
  defaultValue?: string;
}

export interface TeamTaskTemplateConfig {
  schemaVersion: "team/task-template-1";
  parameters: TeamTaskTemplateParameter[];
}

export interface TeamTaskTemplateInstance {
  schemaVersion: "team/task-template-instance-1";
  sourceTaskId: string;
  bindings: Record<string, string>;
}

export interface TeamTaskTemplateState {
  schemaVersion: "team/task-template-state-1";
  currentBindings: Record<string, string>;
  updatedAt: string;
}

export interface TeamWorkUnitDefinition {
  title: string;
  input: { text: string };
  inputPorts?: TeamTaskInputPort[];
  outputPorts?: TeamTaskOutputPort[];
  outputContract: { text: string };
  outputCheck?: TeamTaskOutputCheck;
  acceptance: { rules: string[] };
  workerAgentId: string;
  checkerAgentId: string;
}

export interface TeamTaskPortBase {
  id: string;
  label?: string;
  type: string;
}

export interface TeamTaskInputPort extends TeamTaskPortBase {}

export interface TeamTaskOutputPort extends TeamTaskPortBase {}

export type TaskConnectionStaleReason =
  | "source_task_missing"
  | "source_task_archived"
  | "target_task_missing"
  | "target_task_archived"
  | "source_output_port_missing"
  | "target_input_port_missing"
  | "source_output_port_type_mismatch"
  | "target_input_port_type_mismatch";

export interface TeamTaskConnection {
  schemaVersion: "team/task-connection-1";
  connectionId: string;
  fromTaskId: string;
  fromOutputPortId: string;
  toTaskId: string;
  toInputPortId: string;
  type: string;
  status?: "active" | "stale";
  staleReason?: TaskConnectionStaleReason;
  createdAt: string;
  updatedAt: string;
}

export interface TeamTaskConnectionListResponse {
  connections: TeamTaskConnection[];
}

export interface TeamTaskConnectionMutationResponse {
  connection: TeamTaskConnection;
}

export interface TeamTaskConnectionCreateRequest {
  fromTaskId: string;
  fromOutputPortId: string;
  toTaskId: string;
  toInputPortId: string;
}

export interface TeamTaskDependency {
  schemaVersion: "team/task-dependency-1";
  dependencyId: string;
  fromTaskId: string;
  toTaskId: string;
  trigger: "on_success";
  status?: "active" | "stale";
  staleReason?: TaskDependencyStaleReason;
  createdAt: string;
  updatedAt: string;
}

export interface TeamTaskDependencyListResponse {
  dependencies: TeamTaskDependency[];
}

export interface TeamTaskDependencyMutationResponse {
  dependency: TeamTaskDependency;
}

export interface TeamTaskDependencyCreateRequest {
  fromTaskId: string;
  toTaskId: string;
}

export type TeamCanvasSourceNodeType = "text" | "file";
export type TeamCanvasSourcePortType = "string" | "md" | "json" | "html" | "file";

export interface TeamCanvasSourceNode {
  schemaVersion: "team/source-node-1";
  sourceNodeId: string;
  title: string;
  nodeType: TeamCanvasSourceNodeType;
  outputPort: {
    id: "value";
    label?: string;
    type: string;
  };
  content?: {
    text?: string;
    fileName?: string;
    mimeType?: string;
    size?: number;
    storageRef?: string;
  };
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
}

export interface TeamCanvasSourceNodeListResponse {
  sourceNodes: TeamCanvasSourceNode[];
}

export interface TeamCanvasSourceNodeMutationResponse {
  sourceNode: TeamCanvasSourceNode;
}

export interface TeamCanvasSourceNodeCreateRequest {
  title: string;
  nodeType: TeamCanvasSourceNodeType;
  outputPort?: {
    id?: string;
    label?: string;
    type?: string;
  };
  content?: TeamCanvasSourceNode["content"];
}

export interface TeamCanvasSourceNodeUpdateRequest {
  title?: string;
  nodeType?: TeamCanvasSourceNodeType;
  outputPort?: {
    id?: string;
    label?: string;
    type?: string;
  };
  content?: TeamCanvasSourceNode["content"];
}

export interface TeamCanvasSourceConnection {
  schemaVersion: "team/source-connection-1";
  connectionId: string;
  fromSourceNodeId: string;
  fromOutputPortId: string;
  toTaskId: string;
  toInputPortId: string;
  type: string;
  status?: "active" | "stale";
  staleReason?:
    | "source_node_missing"
    | "source_node_archived"
    | "target_task_missing"
    | "target_task_archived"
    | "source_output_port_missing"
    | "target_input_port_missing"
    | "source_output_port_type_mismatch"
    | "target_input_port_type_mismatch";
  createdAt: string;
  updatedAt: string;
}

export interface TeamCanvasSourceConnectionListResponse {
  connections: TeamCanvasSourceConnection[];
}

export interface TeamCanvasSourceConnectionMutationResponse {
  connection: TeamCanvasSourceConnection;
}

export interface TeamCanvasSourceConnectionCreateRequest {
  fromSourceNodeId: string;
  fromOutputPortId: string;
  toTaskId: string;
  toInputPortId: string;
}

export interface TeamTaskTypedArtifact {
  schemaVersion: "team/task-artifact-1";
  artifactId: string;
  type: string;
  sourceTaskId: string;
  sourceRunId: string;
  sourceAttemptId: string;
  sourceOutputPortId: string;
  fileRef: string;
  preview: string;
  content?: string;
  createdAt: string;
}

export interface TeamCanvasSourceArtifact {
  schemaVersion: "team/source-artifact-1";
  artifactId: string;
  type: string;
  sourceNodeId: string;
  sourceOutputPortId: string;
  title?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  storageRef?: string;
  preview: string;
  content?: string;
  createdAt: string;
}

export interface TeamTaskArtifactBoundInput {
  source?: "task-artifact";
  connectionId: string;
  inputPortId: string;
  artifact: TeamTaskTypedArtifact;
}

export interface TeamCanvasSourceBoundInput {
  source: "canvas-source";
  connectionId: string;
  inputPortId: string;
  artifact: TeamCanvasSourceArtifact;
}

export type TeamTaskBoundInput = TeamTaskArtifactBoundInput | TeamCanvasSourceBoundInput;

export interface TeamCanvasTask {
  taskId: string;
  canvasKind?: TeamCanvasTaskKind;
  title: string;
  leaderAgentId: string;
  workUnit: TeamWorkUnitDefinition;
  discoverySpec?: TeamDiscoverySpec;
  generatedSource?: TeamGeneratedTaskSource;
  templateConfig?: TeamTaskTemplateConfig;
  templateState?: TeamTaskTemplateState;
  templateInstance?: TeamTaskTemplateInstance;
  status: TeamCanvasTaskStatus;
  createdAt: string;
  updatedAt: string;
  createdByAgentId?: string;
  archived: boolean;
}

export interface TeamCanvasTaskListResponse {
  tasks: TeamCanvasTask[];
  deletedTaskIds?: string[];
  serverVersion?: string | null;
}

export interface TeamDiscoveryGeneratedTaskSummary {
  taskId: string;
  canvasKind?: TeamCanvasTaskKind;
  title: string;
  leaderAgentId: string;
  status: TeamCanvasTaskStatus;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  generatedSource: {
    schemaVersion: "team/generated-task-source-1";
    sourceDiscoveryTaskId: string;
    sourceItemId: string;
    itemStatus: TeamGeneratedTaskItemStatus;
    latestDiscoveryRunId?: string;
    latestDiscoveryAttemptId?: string;
    latestDiscoveredAt?: string;
    workUnitMode: TeamGeneratedTaskWorkUnitMode;
    canResetToManaged?: boolean;
  };
}

export interface TeamDiscoveryGeneratedTaskSummaryCatalogResponse {
  tasks: TeamDiscoveryGeneratedTaskSummary[];
  deletedTaskIds?: string[];
  serverVersion?: string | null;
}

export interface TeamConsoleRootSummaryResponse {
  tasks: TeamCanvasTask[];
  deletedTaskIds?: string[];
  taskRunsByTaskId: Record<string, TeamRunState[]>;
  deletedRunIdsByTaskId?: Record<string, string[]>;
  sourceNodes: TeamCanvasSourceNode[];
  sourceConnections: TeamCanvasSourceConnection[];
  taskConnections: TeamTaskConnection[];
  taskDependencies: TeamTaskDependency[];
  serverVersion: {
    taskCatalog?: string | null;
    taskRunSummary?: string | null;
  };
}

export interface TeamTaskMutationResponse {
  task: TeamCanvasTask;
  warnings?: string[];
}

export interface TeamTaskUpdateRequest {
  title?: string;
  leaderAgentId?: string;
  workUnit?: TeamWorkUnitDefinition;
  templateConfig?: TeamTaskTemplateConfig;
  templateState?: TeamTaskTemplateState;
  status?: TeamCanvasTaskStatus;
}

export interface TeamTaskCloneRequest {
  title?: string;
  templateBindings?: Record<string, string>;
}

export interface TeamManualUpstreamRunSelection {
  connectionId: string;
  fromRunId: string;
}

export interface TeamTaskRunCreateRequest {
  templateBindings?: Record<string, string>;
  upstreamRunSelections?: TeamManualUpstreamRunSelection[];
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
  schemaVersion?: "team/state-1";
  runId: string;
  planId: string;
  source?: {
    type: "canvas-task";
    taskId: string;
    publicBaseUrl?: string;
    triggeredBy?:
      | {
          type: "task-connection";
          connectionId: string;
          fromTaskId: string;
          fromRunId: string;
          fromAttemptId: string;
        }
      | {
          type: "task-dependency";
          dependencyId: string;
          fromTaskId: string;
          fromRunId: string;
          fromAttemptId: string;
        }
      | {
          type: "discovery-generated-task";
          discoveryTaskId: string;
          discoveryRunId: string;
          discoveryAttemptId: string;
          sourceItemId: string;
          fromTaskId?: never;
          fromRunId?: never;
          fromAttemptId?: never;
    };
    boundInputs?: TeamTaskBoundInput[];
    templateBindings?: Record<string, string>;
  };
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
  updatedAt?: string;
}

export interface TeamCanvasTaskRunListResponse {
  runs: TeamRunState[];
}

export interface TeamCanvasTaskRunByTaskListResponse {
  runsByTaskId: Record<string, TeamRunState[]>;
  deletedRunIdsByTaskId?: Record<string, string[]>;
  serverVersion?: string | null;
}

export interface TeamTaskRunProcessSummaryResponse {
  run: TeamRunState;
  attempts: TeamAttemptMetadata[];
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
