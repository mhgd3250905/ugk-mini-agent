import { ConversationStore } from "./conversation-store.js";
import { AgentBusyError } from "./agent-errors.js";
import { createActiveRunView } from "./agent-active-run-view.js";
import {
	buildConversationHistoryMessages,
	derivePersistedTurnCoverageFromRunTail,
	paginateConversationHistoryMessages,
	type ConversationHistoryMessage,
	type PersistedTurnCoverage,
} from "./agent-conversation-history.js";
import {
	buildConversationCatalog,
	buildConversationMetadata,
} from "./agent-conversation-catalog.js";
import {
	createConversationCommand,
	deleteConversationCommand,
	resetConversationCommand,
	switchConversationCommand,
} from "./agent-conversation-commands.js";
import { queueActiveMessage } from "./agent-queue-message.js";
import {
	resolveConversationContextMessages,
	resolveConversationStateContext,
} from "./agent-conversation-context.js";
import {
	createEmptyConversation,
	ensureCurrentConversationId,
	openConversationSession,
	resolveDefaultModelContext,
} from "./agent-conversation-session.js";
import { buildConversationStatePage } from "./agent-conversation-state.js";
import {
	cloneChatStreamEvent,
	deliverChatStreamEvent,
	emitBufferedRunEvent,
	isTerminalChatStreamEvent,
	type ChatStreamEventSink,
} from "./agent-run-events.js";
import {
	assertAssistantMessageSucceeded,
	buildAgentRunResult,
	buildDoneChatStreamEvent,
	findLastAssistantMessage,
} from "./agent-run-result.js";
import {
	createAgentRunScope,
	runWithScopedAgentEnvironment,
} from "./agent-run-scope.js";
import {
	buildTerminalRunSnapshot,
	buildRenderableTerminalRun,
	type TerminalRunSnapshot,
} from "./agent-terminal-run.js";
import { createAgentSessionEventAdapter } from "./agent-session-event-adapter.js";
import { preparePromptAssets } from "./agent-prompt-assets.js";
import type { AssetRecord, AssetStoreLike, ChatAttachment } from "./asset-store.js";
import type {
	AgentSessionFactory,
	AgentSessionLike,
	AgentSessionMessageLike,
	RuntimeSkillInfo,
	RuntimeSkillListResult,
} from "./agent-session-factory.js";
import {
	compactLargeSessionMessages,
	rewriteSessionFileMessages,
} from "./session-message-compactor.js";
import {
	buildContextUsageSnapshot,
	type AgentMessageLike,
} from "./context-usage.js";
import type {
	ChatActiveRunBody,
	ChatContextUsageBody,
	ChatStreamEvent,
	ConversationStateResponseBody,
	QueueMessageMode,
} from "../types/api.js";
import {
	buildPromptWithAssetContext,
	prependCurrentTimeContext,
	type AgentFileArtifact,
} from "./file-artifacts.js";

export interface ChatInput {
	conversationId?: string;
	message: string;
	userId?: string;
	attachments?: ChatAttachment[];
	assetRefs?: string[];
}

export interface ChatResult {
	conversationId: string;
	text: string;
	sessionFile?: string;
	inputAssets?: AssetRecord[];
	files?: AgentFileArtifact[];
}

export interface QueueMessageInput {
	conversationId: string;
	message: string;
	mode: QueueMessageMode;
	userId?: string;
	attachments?: ChatAttachment[];
	assetRefs?: string[];
}

export interface QueueMessageResult {
	conversationId: string;
	mode: QueueMessageMode;
	queued: boolean;
	reason?: "not_running";
}

export interface InterruptChatInput {
	conversationId: string;
}

export interface InterruptChatResult {
	conversationId: string;
	interrupted: boolean;
	reason?: "not_running" | "abort_not_supported";
}

export interface ResetConversationInput {
	conversationId: string;
}

export interface ResetConversationResult {
	conversationId: string;
	reset: boolean;
	reason?: "running";
}

export interface RunStatusResult {
	conversationId: string;
	running: boolean;
	contextUsage: ChatContextUsageBody;
}

export type AgentRunStatusResult =
	| {
			agentId: string;
			status: "idle";
	  }
	| {
			agentId: string;
			status: "busy";
			activeConversationId: string;
			activeSince: string;
	  };

export interface ConversationCatalogItem {
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

export interface ConversationCatalogResult {
	currentConversationId: string;
	conversations: ConversationCatalogItem[];
}

export interface CreateConversationResult {
	conversationId: string;
	currentConversationId: string;
	created: boolean;
	reason?: "running";
}

export interface DeleteConversationResult {
	conversationId: string;
	currentConversationId: string;
	deleted: boolean;
	reason?: "running" | "not_found";
}

export interface SwitchConversationResult {
	conversationId: string;
	currentConversationId: string;
	switched: boolean;
	reason?: "running" | "not_found";
}

export interface UpdateConversationResult {
	conversationId: string;
	updated: boolean;
	conversation?: ConversationCatalogItem;
	reason?: "not_found";
}

export interface ConversationHistoryResult {
	conversationId: string;
	messages: ConversationHistoryMessage[];
	hasMore: boolean;
	nextBefore?: string;
	limit: number;
}

export type ConversationStateResult = ConversationStateResponseBody;

export interface ConversationHistoryPageOptions {
	limit?: number;
	before?: string;
}

export interface ConversationStateOptions {
	viewLimit?: number;
}

export interface RunEventSubscription {
	conversationId: string;
	running: boolean;
	unsubscribe: () => void;
}

export interface RunEventSubscriptionOptions {
	afterEventCursor?: number;
}

export interface AgentServiceOptions {
	agentId?: string;
	conversationStore: ConversationStore;
	sessionFactory: AgentSessionFactory;
	assetStore?: AssetStoreLike;
}

interface ActiveRunState {
	session: AgentSessionLike;
	interrupted: boolean;
	events: ChatStreamEvent[];
	eventCursor: number;
	subscribers: Set<ChatStreamEventSink>;
	view: ChatActiveRunBody;
	sessionMessageCountBeforeRun: number;
	historyMessageCountBeforeRun: number;
	persistedTurnCoverage: PersistedTurnCoverage | null;
}

type TerminalRunState = TerminalRunSnapshot;

const MAX_BUFFERED_RUN_EVENTS = 300;
const DEFAULT_CONVERSATION_STATE_VIEW_LIMIT = 160;
const DEFAULT_CONVERSATION_HISTORY_LIMIT = 80;

export class AgentService {
	private readonly activeRuns = new Map<string, ActiveRunState>();
	private readonly terminalRuns = new Map<string, TerminalRunState>();

	constructor(private readonly options: AgentServiceOptions) {}

	private get agentId(): string {
		return this.options.agentId ?? "main";
	}

	async chat(input: ChatInput): Promise<ChatResult> {
		return await this.runChat(input);
	}

	async streamChat(input: ChatInput, onEvent: (event: ChatStreamEvent) => void): Promise<void> {
		await this.runChat(input, onEvent);
	}

	async getAvailableSkills(): Promise<RuntimeSkillListResult> {
		const result = await this.options.sessionFactory.getAvailableSkills?.();
		if (result) {
			return {
				skills: result.skills.map((skill: RuntimeSkillInfo) => ({ ...skill })),
				source: result.source,
				cachedAt: result.cachedAt,
			};
		}

		return {
			skills: [],
			source: "fresh",
			cachedAt: new Date(0).toISOString(),
		};
	}

	async getConversationCatalog(): Promise<ConversationCatalogResult> {
		const currentConversationId = await this.ensureCurrentConversationId();
		const conversationEntries = await this.options.conversationStore.list();
		return buildConversationCatalog({
			currentConversationId,
			entries: conversationEntries,
			runningConversationIds: new Set(this.activeRuns.keys()),
		});
	}

	async getCurrentConversationId(): Promise<string> {
		return await this.ensureCurrentConversationId();
	}

	async createConversation(): Promise<CreateConversationResult> {
		return await createConversationCommand({
			conversationStore: this.options.conversationStore,
			hasActiveRun: this.activeRuns.size > 0,
		});
	}

	async deleteConversation(conversationId: string): Promise<DeleteConversationResult> {
		return await deleteConversationCommand({
			conversationStore: this.options.conversationStore,
			conversationId,
			hasActiveRun: this.activeRuns.size > 0,
			deleteTerminalRun: (terminalConversationId) => {
				this.terminalRuns.delete(terminalConversationId);
			},
		});
	}

	async switchConversation(conversationId: string): Promise<SwitchConversationResult> {
		return await switchConversationCommand({
			conversationStore: this.options.conversationStore,
			conversationId,
			hasActiveRun: this.activeRuns.size > 0,
		});
	}

	async updateConversation(
		conversationId: string,
		patch: { title?: string; pinned?: boolean; backgroundColor?: string },
	): Promise<UpdateConversationResult> {
		const updatedEntry = await this.options.conversationStore.updateMetadata(conversationId, patch);
		if (!updatedEntry) {
			return {
				conversationId,
				updated: false,
				reason: "not_found",
			};
		}
		const catalog = buildConversationCatalog({
			currentConversationId: await this.ensureCurrentConversationId(),
			entries: [{ conversationId, ...updatedEntry }],
			runningConversationIds: new Set(this.activeRuns.keys()),
		});
		return {
			conversationId,
			updated: true,
			conversation: catalog.conversations[0],
		};
	}

	async queueMessage(input: QueueMessageInput): Promise<QueueMessageResult> {
		const activeRun = this.activeRuns.get(input.conversationId);
		if (!activeRun) {
			return {
				conversationId: input.conversationId,
				mode: input.mode,
				queued: false,
				reason: "not_running",
			};
		}
		await queueActiveMessage({
			conversationId: input.conversationId,
			message: input.message,
			mode: input.mode,
			session: activeRun.session,
			attachments: input.attachments,
			assetRefs: input.assetRefs,
			assetStore: this.options.assetStore,
		});

		return {
			conversationId: input.conversationId,
			mode: input.mode,
			queued: true,
		};
	}

	async interruptChat(input: InterruptChatInput): Promise<InterruptChatResult> {
		const activeRun = this.activeRuns.get(input.conversationId);
		if (!activeRun) {
			return {
				conversationId: input.conversationId,
				interrupted: false,
				reason: "not_running",
			};
		}

		if (!activeRun.session.abort) {
			return {
				conversationId: input.conversationId,
				interrupted: false,
				reason: "abort_not_supported",
			};
		}

		activeRun.interrupted = true;
		await activeRun.session.abort();

		return {
			conversationId: input.conversationId,
			interrupted: true,
		};
	}

	async resetConversation(input: ResetConversationInput): Promise<ResetConversationResult> {
		return await resetConversationCommand({
			conversationStore: this.options.conversationStore,
			conversationId: input.conversationId,
			hasActiveRun: this.activeRuns.has(input.conversationId),
			deleteTerminalRun: (conversationId) => {
				this.terminalRuns.delete(conversationId);
			},
		});
	}

	async getRunStatus(conversationId: string): Promise<RunStatusResult> {
		const activeRun = this.activeRuns.get(conversationId);
		const running = Boolean(activeRun);
		const messages = await this.getRunStatusContextMessages(conversationId, activeRun);
		const modelContext = this.getDefaultModelContext();
		const contextUsage = buildContextUsageSnapshot(modelContext, messages);

		return {
			conversationId,
			running,
			contextUsage,
		};
	}

	getAgentRunStatus(): AgentRunStatusResult {
		const activeRunEntry = this.activeRuns.entries().next().value as [string, ActiveRunState] | undefined;
		if (!activeRunEntry) {
			return {
				agentId: this.agentId,
				status: "idle",
			};
		}
		const [activeConversationId, activeRun] = activeRunEntry;
		return {
			agentId: this.agentId,
			status: "busy",
			activeConversationId,
			activeSince: activeRun.view.startedAt,
		};
	}

	async getConversationHistory(
		conversationId: string,
		options?: ConversationHistoryPageOptions,
	): Promise<ConversationHistoryResult> {
		const activeRun = this.activeRuns.get(conversationId);
		const contextMessages = this.getStableContextMessagesForHistory(
			await this.getContextMessages(conversationId),
			activeRun,
		);
		const messages = buildConversationHistoryMessages(contextMessages);
		const page = paginateConversationHistoryMessages(messages, {
			limit: options?.limit,
			before: options?.before,
			defaultLimit: DEFAULT_CONVERSATION_HISTORY_LIMIT,
		});

		return {
			conversationId,
			messages: page.messages,
			hasMore: page.hasMore,
			nextBefore: page.nextBefore,
			limit: page.limit,
		};
	}

	async getConversationState(
		conversationId: string,
		options?: ConversationStateOptions,
	): Promise<ConversationStateResult> {
		const activeRun = this.activeRuns.get(conversationId);
		const existingConversation = await this.options.conversationStore.get(conversationId);
		const stateContext = await this.getConversationStateContext(conversationId, options?.viewLimit);
		const rawContextMessages = stateContext.contextUsageMessages;
		const contextMessages = this.getStableContextMessagesForHistory(stateContext.historyMessages, activeRun);
		const modelContext = this.getDefaultModelContext();
		const contextUsage = buildContextUsageSnapshot(modelContext, rawContextMessages);
		const sessionMessages = buildConversationHistoryMessages(
			contextMessages,
			activeRun?.view,
			stateContext.messageIndexOffset,
		);
		const terminalRun = activeRun ? undefined : this.getRenderableTerminalRun(conversationId, sessionMessages);
		const statePage = buildConversationStatePage({
			conversationId,
			sessionMessages,
			activeRunView: activeRun?.view,
			terminalRunView: terminalRun?.view,
			persistedTurnCoverage: activeRun?.persistedTurnCoverage ?? terminalRun?.historyCoverage,
			viewLimit: options?.viewLimit,
			defaultLimit: DEFAULT_CONVERSATION_STATE_VIEW_LIMIT,
			hasMoreBeforeWindow: stateContext.hasMoreBeforeWindow,
		});

		return {
			conversationId,
			running: Boolean(activeRun),
			contextUsage,
			messages: statePage.messages,
			viewMessages: statePage.viewMessages,
			activeRun: statePage.activeRun,
			historyPage: statePage.historyPage,
			updatedAt:
				activeRun?.view.updatedAt ??
				terminalRun?.view.updatedAt ??
				existingConversation?.updatedAt ??
				new Date(0).toISOString(),
		};
	}

	private getRenderableTerminalRun(
		conversationId: string,
		sessionMessages: readonly ConversationHistoryMessage[],
	): TerminalRunState | undefined {
		return buildRenderableTerminalRun({
			terminalRun: this.terminalRuns.get(conversationId),
			sessionMessages,
		});
	}

	async getRunEvents(conversationId: string, runId: string): Promise<ChatStreamEvent[]> {
		const activeRun = this.activeRuns.get(conversationId);
		if (activeRun?.view.runId === runId) {
			return activeRun.events.map(cloneChatStreamEvent);
		}

		const terminalRun = this.terminalRuns.get(conversationId);
		if (terminalRun?.view.runId === runId) {
			return terminalRun.events.map(cloneChatStreamEvent);
		}

		return [];
	}

	subscribeRunEvents(
		conversationId: string,
		onEvent: ChatStreamEventSink,
		options?: RunEventSubscriptionOptions,
	): RunEventSubscription {
		const activeRun = this.activeRuns.get(conversationId);
		if (!activeRun) {
			const terminalRun = this.terminalRuns.get(conversationId);
			if (terminalRun) {
				const replayableEvents = getReplayableRunEvents(
					{
						events: terminalRun.events,
						eventCursor: terminalRun.view.eventCursor ?? terminalRun.events.length,
					},
					options?.afterEventCursor,
				);
				for (const event of replayableEvents) {
					deliverChatStreamEvent(onEvent, event);
				}
				return {
					conversationId,
					running: replayableEvents.length > 0,
					unsubscribe: () => undefined,
				};
			}
			return {
				conversationId,
				running: false,
				unsubscribe: () => undefined,
			};
		}

		let replayedTerminalEvent = false;
		for (const event of getReplayableRunEvents(activeRun, options?.afterEventCursor)) {
			deliverChatStreamEvent(onEvent, event);
			replayedTerminalEvent ||= isTerminalChatStreamEvent(event);
		}
		if (replayedTerminalEvent) {
			return {
				conversationId,
				running: true,
				unsubscribe: () => undefined,
			};
		}
		activeRun.subscribers.add(onEvent);

		return {
			conversationId,
			running: true,
			unsubscribe: () => {
				activeRun.subscribers.delete(onEvent);
			},
		};
	}

	private async runChat(
		input: ChatInput,
		onEvent?: ChatStreamEventSink,
	): Promise<ChatResult> {
		const conversationId = input.conversationId ?? await createEmptyConversation({
			conversationStore: this.options.conversationStore,
		});
		const agentRunScope = createAgentRunScope(conversationId, this.options.agentId);
		if (this.activeRuns.has(conversationId)) {
			throw new Error(`Conversation ${conversationId} is already running`);
		}
		if (this.activeRuns.size > 0) {
			throw new AgentBusyError(this.agentId, this.activeRuns.keys().next().value);
		}
		const { session, skillFingerprint } = await this.openSession(conversationId, agentRunScope);
		const preparedAssets = await preparePromptAssets({
			conversationId,
			attachments: input.attachments,
			assetRefs: input.assetRefs,
			assetStore: this.options.assetStore,
		});
		const sessionMessagesBeforeRun = ((session.messages as AgentMessageLike[] | undefined) ?? []);
		const sessionMessageCountBeforeRun = sessionMessagesBeforeRun.length;
		const historyMessageCountBeforeRun = buildConversationHistoryMessages(sessionMessagesBeforeRun).length;
		this.terminalRuns.delete(conversationId);
		await this.options.conversationStore.setCurrentConversationId(conversationId);
		const activeRun = {
			session,
			interrupted: false,
			events: [],
			eventCursor: 0,
			subscribers: new Set<ChatStreamEventSink>(),
			view: createActiveRunView(conversationId, input.message, preparedAssets.uploadedAssets),
			sessionMessageCountBeforeRun,
			historyMessageCountBeforeRun,
			persistedTurnCoverage: null,
		};
		this.activeRuns.set(conversationId, activeRun);

		this.emitRunEvent(activeRun, onEvent, {
			type: "run_started",
			conversationId,
			runId: activeRun.view.runId,
		});

		const sessionEventAdapter = createAgentSessionEventAdapter((event) => {
			this.emitRunEvent(activeRun, onEvent, event);
		});
		const unsubscribe = session.subscribe(sessionEventAdapter.handle);

		try {
			await runWithScopedAgentEnvironment(agentRunScope, async () => {
				await session.prompt(
					buildPromptWithAssetContext(prependCurrentTimeContext(input.message), preparedAssets.promptAssets),
				);
			});

			const lastAssistantMessage = findLastAssistantMessage(session.messages);
			assertAssistantMessageSucceeded(lastAssistantMessage);

			const result = await buildAgentRunResult({
				conversationId,
				rawText: sessionEventAdapter.getRawText(),
				lastAssistantMessage,
				sessionFile: session.sessionFile,
				inputAssets: preparedAssets.uploadedAssets,
				sentFiles: sessionEventAdapter.getSentFiles(),
				assetStore: this.options.assetStore,
			});

			if (session.sessionFile) {
				await this.options.conversationStore.set(conversationId, session.sessionFile, {
					skillFingerprint,
					...buildConversationMetadata(session.messages),
				});
			}

			if (activeRun.interrupted) {
				this.refreshPersistedTurnCoverage(activeRun);
				this.emitRunEvent(activeRun, onEvent, {
					type: "interrupted",
					conversationId,
					runId: activeRun.view.runId,
				});
				return result;
			}

			this.refreshPersistedTurnCoverage(activeRun);
			this.emitRunEvent(activeRun, onEvent, buildDoneChatStreamEvent(result, activeRun.view.runId));

			return result;
		} catch (error) {
			const normalizedError = toError(error);
			this.refreshPersistedTurnCoverage(activeRun);
			this.emitRunEvent(activeRun, onEvent, {
				type: "error",
				conversationId,
				runId: activeRun.view.runId,
				message: normalizedError.message,
			});
			(normalizedError as Error & { chatStreamEventEmitted?: boolean }).chatStreamEventEmitted = true;
			throw normalizedError;
		} finally {
			unsubscribe();
			try {
				await this.compactSessionAfterRun(conversationId, session);
			} catch (error) {
				console.error(
					`[session-compaction] failed conversation=${conversationId} sessionFile=${session.sessionFile ?? ""}`,
					error,
				);
			}
			if (session.sessionFile) {
				await this.options.conversationStore.set(conversationId, session.sessionFile, {
					skillFingerprint,
					...buildConversationMetadata(session.messages),
				});
			}
			if (this.activeRuns.get(conversationId) === activeRun) {
				this.activeRuns.delete(conversationId);
			}
			const terminalRun = buildTerminalRunSnapshot({
				view: activeRun.view,
				events: activeRun.events,
				sessionMessages: ((session.messages as AgentMessageLike[] | undefined) ?? []),
				historyMessageCountBeforeRun: activeRun.historyMessageCountBeforeRun,
				persistedTurnCoverage: activeRun.persistedTurnCoverage,
			});
			if (terminalRun) {
				this.terminalRuns.set(conversationId, terminalRun);
			} else {
				this.terminalRuns.delete(conversationId);
			}
			activeRun.subscribers.clear();
		}
	}

	private async compactSessionAfterRun(conversationId: string, session: AgentSessionLike): Promise<void> {
		if (!session.sessionFile || !this.options.assetStore) {
			return;
		}
		const messages = ((session.messages as AgentSessionMessageLike[] | undefined) ?? []);
		if (messages.length === 0) {
			return;
		}

		const result = await compactLargeSessionMessages({
			conversationId,
			messages,
			saveFiles: async (targetConversationId, files) =>
				await this.options.assetStore!.saveFiles(targetConversationId, files),
		});
		if (!result.changed) {
			return;
		}

		session.messages = result.messages;
		await rewriteSessionFileMessages({
			sessionFile: session.sessionFile,
			messages: result.messages,
		});
		console.info(
			`[session-compaction] conversation=${conversationId} artifacts=${result.artifactCount} originalBytes=${result.originalBytes} compactedBytes=${result.compactedBytes}`,
		);
	}

	private emitRunEvent(
		activeRun: ActiveRunState,
		primarySink: ChatStreamEventSink | undefined,
		event: ChatStreamEvent,
	): void {
		activeRun.eventCursor += 1;
		activeRun.view.eventCursor = activeRun.eventCursor;
		emitBufferedRunEvent({
			view: activeRun.view,
			events: activeRun.events,
			subscribers: activeRun.subscribers,
			primarySink,
			event,
			maxBufferedEvents: MAX_BUFFERED_RUN_EVENTS,
		});
	}

	private async ensureCurrentConversationId(): Promise<string> {
		return await ensureCurrentConversationId({
			conversationStore: this.options.conversationStore,
		});
	}

	private async openSession(
		conversationId: string,
		agentRunScope?: string,
	): Promise<{ session: AgentSessionLike; skillFingerprint?: string }> {
		return await openConversationSession({
			conversationId,
			agentRunScope,
			conversationStore: this.options.conversationStore,
			sessionFactory: this.options.sessionFactory,
		});
	}

	private async getContextMessages(conversationId: string): Promise<AgentMessageLike[]> {
		const activeRun = this.activeRuns.get(conversationId);
		const existingConversation = await this.options.conversationStore.get(conversationId);
		return await resolveConversationContextMessages({
			conversationId,
			activeSession: activeRun?.session,
			sessionFile: existingConversation?.sessionFile,
			sessionFactory: this.options.sessionFactory,
		});
	}

	private async getRunStatusContextMessages(
		conversationId: string,
		activeRun: ActiveRunState | undefined,
	): Promise<AgentMessageLike[]> {
		if (activeRun) {
			return await this.getContextMessages(conversationId);
		}

		const existingConversation = await this.options.conversationStore.get(conversationId);
		const stateContext = await resolveConversationStateContext({
			conversationId,
			sessionFile: existingConversation?.sessionFile,
			sessionFactory: this.options.sessionFactory,
			viewLimit: 1,
			defaultViewLimit: 1,
		});
		return stateContext.contextUsageMessages;
	}

	private async getConversationStateContext(
		conversationId: string,
		viewLimit: number | undefined,
	): Promise<{
		historyMessages: AgentMessageLike[];
		contextUsageMessages: AgentMessageLike[];
		messageIndexOffset: number;
		hasMoreBeforeWindow: boolean;
	}> {
		const activeRun = this.activeRuns.get(conversationId);
		const existingConversation = await this.options.conversationStore.get(conversationId);
		return await resolveConversationStateContext({
			conversationId,
			activeSession: activeRun?.session,
			sessionFile: existingConversation?.sessionFile,
			sessionFactory: this.options.sessionFactory,
			forceFullContext: this.terminalRuns.has(conversationId),
			viewLimit,
			defaultViewLimit: DEFAULT_CONVERSATION_STATE_VIEW_LIMIT,
		});
	}

	private getStableContextMessagesForHistory(
		messages: readonly AgentMessageLike[],
		activeRun: ActiveRunState | undefined,
	): AgentMessageLike[] {
		if (!activeRun?.view.loading) {
			return [...messages];
		}

		return messages.slice(0, activeRun.sessionMessageCountBeforeRun);
	}

	private getDefaultModelContext() {
		return resolveDefaultModelContext(this.options.sessionFactory);
	}

	private refreshPersistedTurnCoverage(activeRun: ActiveRunState): void {
		activeRun.persistedTurnCoverage = derivePersistedTurnCoverageFromRunTail(
			buildConversationHistoryMessages(((activeRun.session.messages as AgentMessageLike[] | undefined) ?? [])),
			activeRun.historyMessageCountBeforeRun,
			activeRun.view,
		);
	}
}

function getReplayableRunEvents(
	activeRun: Pick<ActiveRunState, "events" | "eventCursor">,
	afterEventCursor: number | undefined,
): ChatStreamEvent[] {
	if (typeof afterEventCursor !== "number" || !Number.isInteger(afterEventCursor) || afterEventCursor <= 0) {
		return activeRun.events;
	}
	const cursor = afterEventCursor;
	const bufferStartCursor = Math.max(0, activeRun.eventCursor - activeRun.events.length);
	const startIndex = Math.min(
		activeRun.events.length,
		Math.max(0, cursor - bufferStartCursor),
	);
	return activeRun.events.slice(startIndex);
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error("Unknown internal error");
}
