export interface ChatRequestBody {
	conversationId?: string;
	message: string;
	userId?: string;
	browserId?: string;
	attachments?: ChatAttachmentBody[];
	assetRefs?: string[];
}

export interface ChatResponseBody {
	conversationId: string;
	text: string;
	sessionFile?: string;
	inputAssets?: ChatAssetBody[];
	files?: ChatFileBody[];
}

export interface ChatAttachmentBody {
	fileName: string;
	mimeType?: string;
	sizeBytes?: number;
	text?: string;
	base64?: string;
}

export interface ChatAssetBody {
	assetId: string;
	reference: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	kind: "text" | "binary" | "metadata";
	hasContent: boolean;
	source: "user_upload" | "agent_output";
	conversationId: string;
	createdAt: string;
	sha256?: string;
	textPreview?: string;
	downloadUrl?: string;
}

export interface ChatFileBody {
	id: string;
	assetId: string;
	reference: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	downloadUrl: string;
}

export interface AssetListResponseBody {
	assets: ChatAssetBody[];
}

export interface AssetDetailResponseBody {
	asset: ChatAssetBody;
}

export interface CreateAssetResponseBody {
	assets: ChatAssetBody[];
}

export interface DeleteAssetResponseBody {
	assetId: string;
	deleted: boolean;
}

export type ConnTargetBody =
	| {
			type: "task_inbox";
	  }
	| {
			type: "conversation";
			conversationId: string;
	  };

export type ConnScheduleBody =
	| {
			kind: "once";
			at: string;
			timezone?: string;
	  }
	| {
			kind: "interval";
			everyMs: number;
			startAt?: string;
			timezone?: string;
	  }
	| {
			kind: "cron";
			expression: string;
			timezone?: string;
	  };

export type ConnExecutionBody =
	| {
			type: "agent_prompt";
	  }
	| {
			type: "team_group";
			groupId: string;
	  };

export interface ConnBody {
	connId: string;
	title: string;
	prompt: string;
	target: ConnTargetBody;
	schedule: ConnScheduleBody;
	execution: ConnExecutionBody;
	assetRefs: string[];
	maxRunMs?: number;
	profileId?: string;
	browserId?: string;
	agentSpecId?: string;
	skillSetId?: string;
	modelPolicyId?: string;
	modelProvider?: string;
	modelId?: string;
	upgradePolicy?: "latest" | "pinned" | "manual";
	publicSiteId?: string;
	artifactDelivery?: import("../agent/artifact-contract.js").ArtifactDeliveryConfig;
	status: "active" | "paused" | "completed";
	createdAt: string;
	updatedAt: string;
	lastRunAt?: string;
	nextRunAt?: string;
	lastRunId?: string;
	latestRun?: ConnRunBody | null;
}

export interface ConnListResponseBody {
	conns: ConnBody[];
	unreadRunCountsByConnId: Record<string, number>;
	unreadLatestRunTimesByConnId?: Record<string, string>;
	totalUnreadRuns: number;
}

export interface ConnDetailResponseBody {
	conn: ConnBody;
}

export interface ConnBulkDeleteRequestBody {
	connIds: string[];
}

export interface ConnBulkDeleteResponseBody {
	deletedConnIds: string[];
	missingConnIds: string[];
}

export interface ConnRunBody {
	runId: string;
	connId: string;
	status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
	scheduledAt: string;
	claimedAt?: string;
	startedAt?: string;
	leaseOwner?: string;
	leaseUntil?: string;
	finishedAt?: string;
	workspacePath: string;
	sessionFile?: string;
	resolvedSnapshot?: Record<string, unknown>;
	resultSummary?: string;
	resultText?: string;
	errorText?: string;
	deliveredAt?: string;
	retryOfRunId?: string;
	createdAt: string;
	updatedAt: string;
	readAt?: string;
}

export interface ConnRunDetailResponseBody {
	run: ConnRunBody;
	files?: ConnRunFileBody[];
	reused?: boolean;
}

export interface ConnRunListResponseBody {
	runs: ConnRunBody[];
	hasMore?: boolean;
	nextBefore?: string;
	limit?: number;
}

export interface ConnRunFileBody {
	fileId: string;
	runId: string;
	kind: string;
	relativePath: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	createdAt: string;
	url?: string;
	latestUrl?: string;
}

export interface ConnRunEventBody {
	eventId: string;
	runId: string;
	seq: number;
	eventType: string;
	event: Record<string, unknown>;
	createdAt: string;
}

export interface ConnRunEventsResponseBody {
	events: ConnRunEventBody[];
	hasMore?: boolean;
	nextBefore?: string;
	limit?: number;
}


export interface AgentActivityFileBody {
	fileName: string;
	downloadUrl: string;
	mimeType?: string;
	sizeBytes?: number;
}

export interface AgentActivityItemBody {
	activityId: string;
	scope: "agent";
	source: string;
	sourceId: string;
	runId?: string;
	conversationId?: string;
	kind: string;
	title: string;
	text: string;
	files: AgentActivityFileBody[];
	createdAt: string;
	readAt?: string;
}

export interface AgentActivityListResponseBody {
	activities: AgentActivityItemBody[];
	hasMore: boolean;
	nextBefore?: string;
	unreadCount: number;
}

export interface AgentActivityReadResponseBody {
	activity: AgentActivityItemBody;
	unreadCount: number;
}

export interface AgentActivityMarkAllReadResponseBody {
	markedCount: number;
	unreadCount: number;
}

export interface AgentActivitySummaryResponseBody {
	unreadCount: number;
}

export interface DebugSkillsResponseBody {
	skills: Array<{
		name: string;
		path?: string;
	}>;
	source: "fresh" | "cache";
	cachedAt: string;
}

export interface AgentSkillBody {
	name: string;
	path?: string;
	enabled: boolean;
	required?: boolean;
	storageKind?: "system" | "agent";
	storageRoot?: string;
}

export interface AgentSkillListResponseBody {
	agentId: string;
	skills: AgentSkillBody[];
}

export interface UpdateAgentSkillRequestBody {
	enabled: boolean;
}

export interface UpdateAgentSkillResponseBody {
	agentId: string;
	skillName: string;
	enabled: boolean;
}

export interface AgentRunStatusBody {
	agentId: string;
	name: string;
	status: "idle" | "busy";
	activeConversationId?: string;
	activeSince?: string;
}

export interface AgentRunStatusListResponseBody {
	agents: AgentRunStatusBody[];
}

export interface RuntimeDebugCheckBody {
	name: string;
	ok: boolean;
	message?: string;
}

export interface RuntimeDebugResponseBody {
	ok: boolean;
	checks: RuntimeDebugCheckBody[];
	config: {
		publicBaseUrl?: string;
		browserProvider?: string;
		webAccessBrowserPublicBaseUrl?: string;
	};
}

export interface BrowserInstanceBody {
	browserId: string;
	name: string;
	cdpHost: string;
	cdpPort: number;
	guiUrl?: string;
	profileLabel?: string;
	isDefault?: boolean;
}

export interface BrowserListResponseBody {
	defaultBrowserId: string;
	browsers: BrowserInstanceBody[];
}

export interface BrowserDetailResponseBody {
	browser: BrowserInstanceBody;
}

export interface BrowserTargetStatusBody {
	targetId: string;
	type: string;
	title: string;
	url: string;
	attached?: boolean;
	usage?: BrowserTargetUsageBody;
}

export interface BrowserTargetUsageBody {
	jsHeapUsedBytes?: number;
	jsHeapTotalBytes?: number;
	domNodes?: number;
	documents?: number;
	eventListeners?: number;
	available: boolean;
}

export interface BrowserRuntimeStatusBody {
	browser: BrowserInstanceBody;
	online: boolean;
	cdpUrl: string;
	version?: {
		browser?: string;
		protocolVersion?: string;
		webSocketDebuggerUrl?: string;
	};
	targets: BrowserTargetStatusBody[];
	capabilities: {
		closeTarget: boolean;
		start: boolean;
		restart: boolean;
		memory: boolean;
	};
	message?: string;
}

export interface BrowserStatusResponseBody {
	status: BrowserRuntimeStatusBody;
}

export interface BrowserCloseTargetResponseBody {
	closed: boolean;
	targetId: string;
}

export interface BrowserStartResponseBody {
	started: boolean;
	supported: boolean;
	message: string;
}

export interface CleanupDebugResponseBody {
	ok: boolean;
	connTargets: {
		total: number;
		active: number;
		byType: {
			task_inbox: number;
			conversation: number;
			invalid: number;
		};
	};
	legacyConversationNotifications: {
		total: number;
		connSourceTotal: number;
		latestCreatedAt?: string;
	};
	recentRuns: {
		windowDays: number;
		total: number;
		succeeded: number;
		failed: number;
		cancelled: number;
		withActivity: number;
		withoutActivity: number;
		withOutputFiles: number;
		withoutOutputFiles: number;
		succeededWithoutOutputFiles: number;
		failedWithoutOutputFiles: number;
		cancelledWithoutOutputFiles: number;
	};
	risks: string[];
}

export interface ChatContextUsageBody {
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

export interface ChatStatusResponseBody {
	conversationId: string;
	running: boolean;
	contextUsage: ChatContextUsageBody;
}

export interface ChatHistoryFileBody {
	fileName: string;
	downloadUrl: string;
	mimeType?: string;
	sizeBytes?: number;
}

export interface ChatHistoryMessageBody {
	id: string;
	kind: "user" | "assistant" | "system" | "error" | "notification";
	title: string;
	text: string;
	createdAt: string;
	source?: string;
	sourceId?: string;
	runId?: string;
	assetRefs?: ChatAssetBody[];
	files?: ChatHistoryFileBody[];
}

export interface ChatHistoryResponseBody {
	conversationId: string;
	messages: ChatHistoryMessageBody[];
	hasMore: boolean;
	nextBefore?: string;
	limit: number;
}

export interface ConversationCatalogItemBody {
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

export interface ConversationCatalogResponseBody {
	currentConversationId: string;
	conversations: ConversationCatalogItemBody[];
}

export interface CreateConversationResponseBody {
	conversationId: string;
	currentConversationId: string;
	created: boolean;
	reason?: "running";
}

export interface DeleteConversationResponseBody {
	conversationId: string;
	currentConversationId: string;
	deleted: boolean;
	reason?: "running" | "not_found";
}

export interface SwitchConversationRequestBody {
	conversationId: string;
}

export interface SwitchConversationResponseBody {
	conversationId: string;
	currentConversationId: string;
	switched: boolean;
	reason?: "running" | "not_found";
}

export interface UpdateConversationRequestBody {
	title?: string;
	pinned?: boolean;
	backgroundColor?: string;
}

export interface UpdateConversationResponseBody {
	conversationId: string;
	updated: boolean;
	conversation?: ConversationCatalogItemBody;
	reason?: "not_found";
}

export interface ChatProcessEntryBody {
	id: string;
	kind: "system" | "tool" | "ok" | "error";
	title: string;
	detail: string;
	createdAt: string;
	toolCallId?: string;
	toolName?: string;
	isError?: boolean;
}

export interface ChatProcessBody {
	title: string;
	narration: string[];
	currentAction?: string;
	kind?: "system" | "tool" | "ok" | "error";
	isComplete: boolean;
	entries: ChatProcessEntryBody[];
}

export interface ChatActiveRunInputBody {
	message: string;
	inputAssets: ChatAssetBody[];
}

export interface ChatActiveRunBody {
	runId: string;
	status: "running" | "interrupted" | "done" | "error";
	assistantMessageId: string;
	eventCursor?: number;
	input: ChatActiveRunInputBody;
	text: string;
	process: ChatProcessBody | null;
	queue: {
		steering: string[];
		followUp: string[];
	} | null;
	loading: boolean;
	startedAt: string;
	updatedAt: string;
}

export interface ConversationStateResponseBody {
	conversationId: string;
	running: boolean;
	contextUsage: ChatContextUsageBody;
	messages: ChatHistoryMessageBody[];
	viewMessages: ChatHistoryMessageBody[];
	activeRun: ChatActiveRunBody | null;
	historyPage: {
		hasMore: boolean;
		nextBefore?: string;
		limit: number;
	};
	updatedAt: string;
}

export interface ChatRunEventsResponseBody {
	conversationId: string;
	runId: string;
	events: ChatStreamEvent[];
	hasMore?: boolean;
	nextBefore?: string;
	limit?: number;
}

export type QueueMessageMode = "steer" | "followUp";

export interface QueueMessageRequestBody {
	conversationId: string;
	message: string;
	mode: QueueMessageMode;
	userId?: string;
	browserId?: string;
	attachments?: ChatAttachmentBody[];
	assetRefs?: string[];
}

export interface QueueMessageResponseBody {
	conversationId: string;
	mode: QueueMessageMode;
	queued: boolean;
	reason?: "not_running" | "browser_changed";
}

export interface InterruptChatRequestBody {
	conversationId: string;
}

export interface InterruptChatResponseBody {
	conversationId: string;
	interrupted: boolean;
	reason?: "not_running" | "abort_not_supported";
}

export interface ResetConversationRequestBody {
	conversationId: string;
}

export interface ResetConversationResponseBody {
	conversationId: string;
	reset: boolean;
	reason?: "running";
}

export type ChatStreamEvent =
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
			inputAssets?: ChatAssetBody[];
			files?: ChatFileBody[];
	  }
	| {
			type: "error";
			conversationId: string;
			runId: string;
			message: string;
	  };

export interface ErrorResponseBody {
	error: {
		code:
			| "BAD_REQUEST"
			| "PAYLOAD_TOO_LARGE"
			| "INTERNAL_ERROR"
			| "AGENT_BUSY"
			| "NOT_FOUND"
			| "CONFLICT"
			| "NOT_IMPLEMENTED";
		message: string;
		agentId?: string;
		activeConversationId?: string;
		suggestedAgents?: string[];
	};
}
