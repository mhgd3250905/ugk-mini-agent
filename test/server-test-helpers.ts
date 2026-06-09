import type { AgentService } from "../src/agent/agent-service.js";
import type { ModelConfigBody, ModelConfigSelection, ModelConfigStore } from "../src/agent/model-config.js";

type StreamEvent = Record<string, unknown>;

export function createAgentServiceStub(overrides?: {
	chat?: AgentService["chat"];
	streamChat?: (
		input: { conversationId?: string; message: string; userId?: string; attachments?: unknown[]; assetRefs?: string[] },
		onEvent: (event: StreamEvent) => void,
	) => Promise<void>;
	queueMessage?: AgentService["queueMessage"];
	interruptChat?: AgentService["interruptChat"];
	resetConversation?: AgentService["resetConversation"];
	getAgentRunStatus?: AgentService["getAgentRunStatus"];
	getRunStatus?: (
		conversationId: string,
	) => Promise<{
		conversationId: string;
		running: boolean;
		contextUsage: {
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
		};
	}>;
	subscribeRunEvents?: (
		conversationId: string,
		onEvent: (event: StreamEvent) => void,
		options?: { afterEventCursor?: number },
	) => {
		conversationId: string;
		running: boolean;
		unsubscribe: () => void;
	};
	getRunEvents?: (
		conversationId: string,
		runId: string,
	) => Promise<Array<StreamEvent>>;
	getConversationHistory?: (
		conversationId: string,
		options?: { limit?: number; before?: string },
	) => Promise<{
		conversationId: string;
		messages: Array<{
			id: string;
			kind: "user" | "assistant" | "system" | "error";
			title: string;
			text: string;
			createdAt: string;
		}>;
		hasMore?: boolean;
		nextBefore?: string;
		limit?: number;
	}>;
	getConversationState?: (conversationId: string, options?: { viewLimit?: number }) => Promise<Record<string, unknown>>;
	getConversationCatalog?: () => Promise<{
		currentConversationId: string;
		conversations: Array<{
			conversationId: string;
			title: string;
			preview: string;
			messageCount: number;
			createdAt: string;
			updatedAt: string;
			running: boolean;
		}>;
	}>;
	createConversation?: () => Promise<{
		conversationId: string;
		currentConversationId: string;
		created: boolean;
		reason?: "running";
	}>;
	deleteConversation?: (
		conversationId: string,
	) => Promise<{
		conversationId: string;
		currentConversationId: string;
		deleted: boolean;
		reason?: "running" | "not_found";
	}>;
	switchConversation?: (
		conversationId: string,
	) => Promise<{
		conversationId: string;
		currentConversationId: string;
		switched: boolean;
		reason?: "running" | "not_found";
	}>;
	updateConversation?: (
		conversationId: string,
		patch: { title?: string; pinned?: boolean; backgroundColor?: string },
	) => Promise<{
		conversationId: string;
		updated: boolean;
		conversation?: {
			conversationId: string;
			title: string;
			preview: string;
			messageCount: number;
			createdAt: string;
			updatedAt: string;
			running: boolean;
			pinned?: boolean;
			backgroundColor?: string;
		};
		reason?: "not_found";
	}>;
	getAvailableSkills?: () => Promise<{
		skills: Array<{ name: string; path?: string }>;
		source: "fresh" | "cache";
		cachedAt: string;
	}>;
}): AgentService {
	return {
		chat:
			overrides?.chat ??
			(async (input) => ({
				conversationId: input.conversationId ?? "manual:test-1",
				text: `echo:${input.message}`,
				sessionFile: "E:/sessions/test.jsonl",
			})),
		streamChat:
			overrides?.streamChat ??
			(async (input, onEvent) => {
				onEvent({
					type: "run_started",
					conversationId: input.conversationId ?? "manual:test-1",
				});
				onEvent({
					type: "tool_started",
					toolCallId: "tool-1",
					toolName: "read",
					args: '{"path":"README.md"}',
				});
				onEvent({
					type: "text_delta",
					textDelta: `echo:${input.message}`,
				});
				onEvent({
					type: "done",
					conversationId: input.conversationId ?? "manual:test-1",
					text: `echo:${input.message}`,
					sessionFile: "E:/sessions/test.jsonl",
				});
			}),
		queueMessage:
			overrides?.queueMessage ??
			(async (input) => ({
				conversationId: input.conversationId,
				mode: input.mode,
				queued: true,
			})),
		interruptChat:
			overrides?.interruptChat ??
			(async (input) => ({
				conversationId: input.conversationId,
				interrupted: true,
			})),
		resetConversation:
			overrides?.resetConversation ??
			(async (input) => ({
				conversationId: input.conversationId,
				reset: true,
			})),
		getRunStatus:
			overrides?.getRunStatus ??
			(async (conversationId) => ({
				conversationId,
				running: false,
				contextUsage: {
					provider: "zhipu-glm",
					model: "glm-5.1",
					currentTokens: 45231,
					contextWindow: 128000,
					reserveTokens: 16384,
					maxResponseTokens: 16384,
					availableTokens: 66385,
					percent: 35,
					status: "safe",
					mode: "estimate",
				},
			})),
		subscribeRunEvents:
			overrides?.subscribeRunEvents ??
			((conversationId) => ({
				conversationId,
				running: false,
				unsubscribe: () => undefined,
			})),
		getAgentRunStatus:
			overrides?.getAgentRunStatus ??
			(() => ({
				agentId: "main",
				status: "idle",
			})),
		getRunEvents:
			overrides?.getRunEvents ??
			(async () => []),
		getConversationHistory:
			overrides?.getConversationHistory ??
			(async (conversationId) => ({
				conversationId,
				messages: [],
			})),
		getConversationState:
			overrides?.getConversationState ??
			(async (conversationId) => ({
				conversationId,
				running: false,
				contextUsage: {
					provider: "zhipu-glm",
					model: "glm-5.1",
					currentTokens: 45231,
					contextWindow: 128000,
					reserveTokens: 16384,
					maxResponseTokens: 16384,
					availableTokens: 66385,
					percent: 35,
					status: "safe",
					mode: "estimate",
				},
				messages: [],
				viewMessages: [],
				activeRun: null,
				updatedAt: "2026-04-20T00:00:00.000Z",
			})),
		getConversationCatalog:
			overrides?.getConversationCatalog ??
			(async () => ({
				currentConversationId: "manual:catalog-1",
				conversations: [
					{
						conversationId: "manual:catalog-1",
						title: "Catalog 1",
						preview: "preview",
						messageCount: 0,
						createdAt: "2026-04-20T00:00:00.000Z",
						updatedAt: "2026-04-20T00:00:00.000Z",
						running: false,
					},
				],
			})),
		createConversation:
			overrides?.createConversation ??
			(async () => ({
				conversationId: "manual:new-1",
				currentConversationId: "manual:new-1",
				created: true,
			})),
		deleteConversation:
			overrides?.deleteConversation ??
			(async (conversationId) => ({
				conversationId,
				currentConversationId: "manual:test-1",
				deleted: true,
			})),
		switchConversation:
			overrides?.switchConversation ??
			(async (conversationId) => ({
				conversationId,
				currentConversationId: conversationId,
				switched: true,
			})),
		updateConversation:
			overrides?.updateConversation ??
			(async (conversationId, patch) => ({
				conversationId,
				updated: true,
				conversation: {
					conversationId,
					title: patch.title ?? "Catalog 1",
					preview: "preview",
					messageCount: 1,
					createdAt: "2026-04-20T00:00:00.000Z",
					updatedAt: "2026-04-20T00:00:00.000Z",
					running: false,
					pinned: patch.pinned ?? false,
					backgroundColor: patch.backgroundColor ?? "",
				},
			})),
		getAvailableSkills:
			overrides?.getAvailableSkills ??
			(async () => ({
				skills: [
					{ name: "using-superpowers", path: "E:/AII/ugk-pi/.pi/skills/superpowers/using-superpowers/SKILL.md" },
					{ name: "web-access", path: "E:/AII/ugk-pi/runtime/skills-user/web-access/SKILL.md" },
				],
				source: "cache",
				cachedAt: "2026-04-24T00:00:00.000Z",
			})),
	} as unknown as AgentService;
}

export function createModelConfigStoreStub(): ModelConfigStore {
	let current: ModelConfigSelection = {
		provider: "zhipu-glm",
		model: "glm-5.1",
	};
	const config = (): ModelConfigBody => ({
		current,
		providers: [
			{
				id: "zhipu-glm",
				name: "Zhipu GLM",
				vendor: "zhipu",
				region: "cn",
				priority: 10,
				models: [{ id: "glm-5.1", name: "GLM-5.1" }],
				auth: {
					configured: true,
					envVar: "ZHIPU_GLM_API_KEY",
					source: "environment",
				},
			},
			{
				id: "deepseek",
				name: "DeepSeek",
				vendor: "deepseek",
				region: "global",
				priority: 20,
				models: [
					{ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: 1000000, maxTokens: 384000 },
					{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 1000000, maxTokens: 384000 },
				],
				auth: {
					configured: true,
					envVar: "DEEPSEEK_API_KEY",
					source: "environment",
				},
			},
			{
				id: "xiaomi-mimo-cn",
				models: [
					{ id: "mimo-v2.5-pro", name: "MiMo V2.5 Pro (Xiaomi CN)", contextWindow: 1048576, maxTokens: 16384 },
				],
				name: "Xiaomi MiMo China",
				vendor: "xiaomi",
				region: "cn",
				priority: 31,
				auth: {
					configured: true,
					envVar: "XIAOMI_MIMO_API_KEY",
					source: "environment",
				},
			},
		],
	});
	return {
		async getConfig() {
			return config();
		},
		async setDefault(selection) {
			current = selection;
			return config();
		},
		async hasModel(selection) {
			return Boolean(
				config()
					.providers.find((provider) => provider.id === selection.provider)
					?.models.some((model) => model.id === selection.model),
			);
		},
	};
}
