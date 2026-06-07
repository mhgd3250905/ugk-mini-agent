import type { ChatProcessBody } from "../types/api.js";

export type RunStatus = "queued" | "running" | "paused" | "completed" | "completed_with_failures" | "failed" | "cancelled";
export type TaskStatus = "pending" | "running" | "interrupted" | "succeeded" | "failed" | "cancelled" | "skipped";
export type TaskManualDisposition = "default" | "skip" | "force_rerun";
export type AttemptStatus = "running" | "succeeded" | "failed" | "interrupted" | "cancelled";

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

export interface TeamRoleRuntimeContext {
	requestedProfileId: string;
	resolvedProfileId: string;
	fallbackUsed: boolean;
	fallbackReason?: "profile_not_found" | "profile_archived" | "legacy_profile";
	browserId: string | null;
	browserScope: string;
}

export type TeamAttemptRoleProcessStatus = "waiting" | "running" | "succeeded" | "failed" | "cancelled";

export interface TeamAttemptRoleProcess {
	role: "worker" | "checker";
	profileId: string;
	status: TeamAttemptRoleProcessStatus;
	startedAt: string | null;
	updatedAt: string | null;
	finishedAt: string | null;
	assistantText?: {
		content: string;
		updatedAt: string;
	};
	process: ChatProcessBody | null;
}

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

export type TeamTaskDeliveryOutcome = TeamTaskTypedConnectionDeliveryOutcome | TeamTaskControlDependencyDeliveryOutcome;

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

export interface TeamDiscoveryChannelSetItem {
	generatedTaskId: string;
	sourceItemId: string;
	title: string;
	itemPayload: Record<string, unknown>;
	workUnitSnapshot: TeamWorkUnitDefinition;
	workUnitMode: TeamGeneratedTaskWorkUnitMode;
	latestDiscoveryRunId?: string;
	latestDiscoveryAttemptId?: string;
	latestDiscoveredAt?: string;
}

export interface TeamDiscoveryChannelSet {
	schemaVersion: "team/discovery-channel-set-1";
	channelSetId: string;
	sourceDiscoveryTaskId: string;
	title: string;
	items: TeamDiscoveryChannelSetItem[];
	archived: boolean;
	createdAt: string;
	updatedAt: string;
}

export type TeamDiscoveryAggregationResultStatus = "succeeded" | "failed" | "cancelled" | "skipped" | "missing";

export interface TeamDiscoveryAggregationRecord {
	schemaVersion: "team/discovery-aggregation-1";
	discoveryTaskId: string;
	discoveryRunId: string;
	discoveryAttemptId: string;
	outputKey: string;
	sourceResultRef: string | null;
	createdAt: string;
	summary: {
		totalItems: number;
		generatedTasks: number;
		succeeded: number;
		failed: number;
		cancelled: number;
		skipped: number;
		missingResult: number;
	};
	items: Array<{
		itemId: string;
		itemPayload: Record<string, unknown>;
		dispatch: TeamDiscoveryDispatchOutcome | null;
		generatedTaskId?: string;
		generatedRunId?: string;
		generatedRunStatus?: RunStatus;
		result: {
			status: TeamDiscoveryAggregationResultStatus;
			resultRef?: string | null;
			content?: string;
			errorSummary?: string | null;
		};
	}>;
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
	roleProcesses?: {
		worker?: TeamAttemptRoleProcess;
		checker?: TeamAttemptRoleProcess;
	};
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
	hasMore: boolean;
	runs: TeamTaskRunHistoryItem[];
}
export type CheckerVerdict = "pass" | "revise" | "fail";
export type WatcherDecision = "accept_task" | "confirm_failed" | "request_revision";
export type WatcherRevisionMode = "amend" | "redo";
export type ProgressPhase =
	| "pending"
	| "creating_workunit"
	| "creating_worker_session"
	| "worker_running"
	| "checker_reviewing"
	| "worker_revising"
	| "watcher_reviewing"
	| "finalizer_running"
	| "writing_result"
	| "succeeded"
	| "failed"
	| "interrupted"
	| "cancelled"
	| "skipped";

export interface TeamUnit {
	schemaVersion: "team/team-unit-1";
	teamUnitId: string;
	title: string;
	description: string;
	watcherProfileId: string;
	workerProfileId: string;
	checkerProfileId: string;
	finalizerProfileId: string;
	decomposerProfileId: string;
	archived: boolean;
	createdAt: string;
	updatedAt: string;
}

export type TeamTaskType = "normal" | "discovery" | "for_each";
export type TeamTaskDecomposerMode = "none" | "leaf" | "propagate";

export type TeamTaskOutputCheck =
	| { type: "json_items"; outputKey?: string; allowDirectArray?: boolean; requiredFields?: string[] }
	| { type: "json_object"; requiredFields?: string[] }
	| { type: "html_fragment"; requiredSubstrings?: string[]; requiredSelectors?: string[]; forbiddenTags?: string[]; requireFence?: boolean }
	| { type: "file_exists"; path?: string };

export interface TeamOutputValidationResult {
	ok: boolean;
	kind: "none" | "discovery" | "json_object" | "json_items" | "html_fragment" | "file_exists";
	sourceRef: string | null;
	checks: Array<{ name: string; ok: boolean; message?: string; path?: string }>;
	normalizedRef?: string | null;
	items?: Array<Record<string, unknown>>;
}

export interface TeamTaskDecomposerPolicy {
	mode: TeamTaskDecomposerMode;
	maxChildren?: number;
}

export interface TeamTask {
	id: string;
	type?: TeamTaskType;
	title: string;
	input: { text: string; payload?: Record<string, unknown> };
	acceptance: { rules: string[] };
	decomposer?: TeamTaskDecomposerPolicy;
	outputCheck?: TeamTaskOutputCheck;
	discovery?: {
		outputKey: string;
	};
	forEach?: {
		itemsFrom: string;
		mode: "sequential" | "parallel";
		taskTemplate: {
			title: string;
			input: { text: string; payload?: Record<string, unknown> };
			acceptance: { rules: string[] };
			decomposer?: TeamTaskDecomposerPolicy;
			outputCheck?: TeamTaskOutputCheck;
		};
	};
	parentTaskId?: string;
	sourceItemId?: string;
	sourceItem?: TeamTaskSourceItem;
	generated?: boolean;
}

export interface TeamPlan {
	schemaVersion: "team/plan-1";
	planId: string;
	title: string;
	defaultTeamUnitId: string;
	goal: { text: string };
	tasks: TeamTask[];
	outputContract: { text: string };
	archived: boolean;
	createdAt: string;
	updatedAt: string;
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

export interface TeamTaskConnection {
	schemaVersion: "team/task-connection-1";
	connectionId: string;
	fromTaskId: string;
	fromOutputPortId: string;
	toTaskId: string;
	toInputPortId: string;
	type: string;
	createdAt: string;
	updatedAt: string;
}

export type TaskConnectionStaleReason =
	| "source_task_missing"
	| "source_task_archived"
	| "target_task_missing"
	| "target_task_archived"
	| "source_output_port_missing"
	| "target_input_port_missing"
	| "source_output_port_type_mismatch"
	| "target_input_port_type_mismatch";

export interface ResolvedTaskConnection extends TeamTaskConnection {
	status: "active" | "stale";
	staleReason?: TaskConnectionStaleReason;
}

export interface TeamTaskGroup {
	schemaVersion: "team/task-group-1";
	groupId: string;
	title: string;
	taskIds: string[];
	archived: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface TeamTaskGroupValidationIssue {
	code:
		| "task_not_found"
		| "task_archived"
		| "generated_task_not_supported"
		| "external_incoming_task_edge"
		| "external_outgoing_task_edge"
		| "no_head_task";
	message: string;
	taskId?: string;
	connectionId?: string;
	dependencyId?: string;
}

export interface ResolvedTeamTaskGroup extends TeamTaskGroup {
	status: "valid" | "invalid";
	headTaskIds: string[];
	validation: { errors: TeamTaskGroupValidationIssue[] };
}

export type TeamTaskGroupRunStatus =
	| "queued"
	| "running"
	| "completed"
	| "completed_with_failures"
	| "failed"
	| "cancelled";

export type TeamTaskGroupRunSource =
	| { type: "manual" }
	| { type: "conn"; connId: string; connRunId: string };

export interface TeamTaskGroupRunObservedRun {
	taskId: string;
	runId: string;
	role: "entry" | "downstream" | "discovery-generated";
}

export interface TeamTaskGroupRunDefinitionSnapshot {
	taskIds: string[];
	headTaskIds: string[];
}

export interface TeamTaskGroupRun {
	schemaVersion: "team/task-group-run-1";
	groupRunId: string;
	groupId: string;
	status: TeamTaskGroupRunStatus;
	source: TeamTaskGroupRunSource;
	definitionSnapshot: TeamTaskGroupRunDefinitionSnapshot | null;
	entryRuns: Array<{ taskId: string; runId: string }>;
	observedRuns: TeamTaskGroupRunObservedRun[];
	startedAt: string | null;
	finishedAt: string | null;
	lastError: string | null;
	createdAt: string;
	updatedAt: string;
}

export type TeamCanvasSourceNodeType = "text" | "file";
export type TeamCanvasSourcePortType = "string" | "md" | "json" | "html" | "file";

export interface TeamTaskDependency {
	schemaVersion: "team/task-dependency-1";
	dependencyId: string;
	fromTaskId: string;
	toTaskId: string;
	trigger: "on_success";
	createdAt: string;
	updatedAt: string;
}

export type TaskDependencyStaleReason =
	| "source_task_missing"
	| "source_task_archived"
	| "target_task_missing"
	| "target_task_archived";

export interface ResolvedTaskDependency extends TeamTaskDependency {
	status: "active" | "stale";
	staleReason?: TaskDependencyStaleReason;
}

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

export interface TeamCanvasSourceConnection {
	schemaVersion: "team/source-connection-1";
	connectionId: string;
	fromSourceNodeId: string;
	fromOutputPortId: string;
	toTaskId: string;
	toInputPortId: string;
	type: string;
	createdAt: string;
	updatedAt: string;
}

export type SourceConnectionStaleReason =
	| "source_node_missing"
	| "source_node_archived"
	| "target_task_missing"
	| "target_task_archived"
	| "source_output_port_missing"
	| "target_input_port_missing"
	| "source_output_port_type_mismatch"
	| "target_input_port_type_mismatch";

export interface ResolvedSourceConnection extends TeamCanvasSourceConnection {
	status: "active" | "stale";
	staleReason?: SourceConnectionStaleReason;
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
	contentTruncated?: boolean;
	originalContentLength?: number;
	workspaceFileRef?: string;
	workspaceFilePath?: string;
	createdAt: string;
}

export interface TeamManualUpstreamRunSelection {
	connectionId: string;
	fromRunId: string;
}

export interface TeamManualUpstreamRunSelectionRecord {
	connectionId: string;
	fromTaskId: string;
	fromRunId: string;
	fromAttemptId: string;
	fromOutputPortId: string;
	toInputPortId: string;
	artifactId: string;
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

export interface TeamProgress {
	phase: ProgressPhase;
	message: string;
	updatedAt: string;
}

export interface TeamTaskState {
	status: TaskStatus;
	manualDisposition?: TaskManualDisposition;
	manualDispositionUpdatedAt?: string | null;
	attemptCount: number;
	activeAttemptId: string | null;
	resultRef: string | null;
	errorSummary: string | null;
	previousErrorSummary?: string | null;
	progress: TeamProgress;
}

export interface TeamRunState {
	schemaVersion: "team/state-1";
	runId: string;
	planId: string;
	source?: {
		type: "canvas-task";
		taskId: string;
		publicBaseUrl?: string;
		triggeredBy?:
			| { type: "task-connection"; connectionId: string; fromTaskId: string; fromRunId: string; fromAttemptId: string }
			| { type: "task-dependency"; dependencyId: string; fromTaskId: string; fromRunId: string; fromAttemptId: string }
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
		manualUpstreamSelections?: TeamManualUpstreamRunSelectionRecord[];
		templateBindings?: Record<string, string>;
	};
	teamUnitId: string;
	status: RunStatus;
	createdAt: string;
	queuedAt: string;
	startedAt: string | null;
	finishedAt: string | null;
	activeElapsedMs: number;
	currentTaskId: string | null;
	taskStates: Record<string, TeamTaskState>;
	summary: { totalTasks: number; succeededTasks: number; failedTasks: number; cancelledTasks: number; skippedTasks: number };
	pauseReason: string | null;
	lastError: string | null;
	finalizerRuntimeContext?: TeamRoleRuntimeContext | null;
	maxRunDurationMinutes?: number;
	lease?: TeamRunLease | null;
	updatedAt: string;
}

export interface TeamRunLease {
	ownerId: string;
	acquiredAt: string;
	heartbeatAt: string;
	expiresAt: string;
}

export interface TeamTaskSourceItem {
	id: string;
	data: Record<string, unknown>;
}

export interface TaskExpansionChildEntry {
	taskId: string;
	sourceItemId: string;
	sourceItem?: TeamTaskSourceItem;
	title: string;
	task?: TeamTask;
}

export interface TaskExpansionRecord {
	schemaVersion: "team/task-expansion-1";
	parentTaskId: string;
	itemsFrom: string;
	expandedAt: string;
	children: Array<TaskExpansionChildEntry>;
}

export interface TaskDecompositionRecord {
	schemaVersion: "team/task-decomposition-1";
	parentTaskId: string;
	mode: "leaf" | "propagate";
	decision: "split" | "no_split";
	reason: string;
	decomposedAt: string;
	children: Array<{
		taskId: string;
		title: string;
		task: TeamTask;
	}>;
	runtimeContext?: TeamRoleRuntimeContext;
}

export interface TeamDiscoveryResultRecord {
	schemaVersion: "team/discovery-result-1";
	taskId: string;
	attemptId: string;
	outputKey: string;
	items: Array<Record<string, unknown>>;
	sourceRef: string | null;
	createdAt: string;
}
