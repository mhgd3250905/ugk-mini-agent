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
	source?: { type: "canvas-task"; taskId: string };
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
