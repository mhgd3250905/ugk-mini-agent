import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FeishuConversationMapStore } from "../src/integrations/feishu/conversation-map-store.js";
import { FeishuDeliveryService } from "../src/integrations/feishu/delivery.js";
import { FeishuService } from "../src/integrations/feishu/service.js";
import type { FeishuClientLike, FeishuDeliveryTarget } from "../src/integrations/feishu/types.js";

function makeContextUsage() {
	return {
		provider: "zhipu-glm",
		model: "glm-5.1",
		currentTokens: 0,
		contextWindow: 128000,
		reserveTokens: 16384,
		maxResponseTokens: 16384,
		availableTokens: 111616,
		percent: 0,
		status: "safe" as const,
		mode: "estimate" as const,
	};
}

function makeFeishuTextWebhook(chatId: string, messageId: string, text: string): Record<string, unknown> {
	return {
		header: { event_type: "im.message.receive_v1" },
		event: {
			message: {
				chat_id: chatId,
				message_id: messageId,
				message_type: "text",
				content: JSON.stringify({ text }),
			},
		},
	};
}

async function createConversationMapStore(): Promise<FeishuConversationMapStore> {
	const { store } = await createConversationMapStoreWithPath();
	return store;
}

async function createConversationMapStoreWithPath(): Promise<{ store: FeishuConversationMapStore; indexPath: string }> {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-feishu-"));
	await mkdir(join(root, ".data", "agent", "feishu"), { recursive: true });
	const indexPath = join(root, ".data", "agent", "feishu", "conversation-map.json");
	return {
		store: new FeishuConversationMapStore({
			indexPath,
		}),
		indexPath,
	};
}

async function waitForAsyncWebhookSideEffects(predicate: () => boolean): Promise<void> {
	const deadline = Date.now() + 1000;
	while (Date.now() < deadline) {
		if (predicate()) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

test("FeishuService routes incoming messages to the current web conversation in current mode", async () => {
	const chatCalls: Array<Record<string, unknown>> = [];
	const deliveries: Array<{ target: FeishuDeliveryTarget; text: string }> = [];
	const mapStore = await createConversationMapStore();

	const service = new FeishuService({
		conversationMode: "current",
		agentService: {
			async getCurrentConversationId() {
				return "web-current-conversation";
			},
			async getRunStatus(conversationId) {
				return {
					conversationId,
					running: false,
					contextUsage: makeContextUsage(),
				};
			},
			async queueMessage() {
				throw new Error("queueMessage should not run while idle");
			},
			async chat(input) {
				chatCalls.push(input as Record<string, unknown>);
				return { conversationId: input.conversationId, text: "ok" };
			},
		},
		conversationMapStore: mapStore,
		client: {
			isConfigured() {
				return true;
			},
			async sendTextMessage() {},
			async sendFileMessage() {},
			async downloadMessageResource() {
				throw new Error("download should not run for pure text");
			},
		},
		deliveryService: {
			async deliverText(target, text) {
				deliveries.push({ target, text });
			},
		},
	});

	await service.handleWebhook(makeFeishuTextWebhook("chat-1", "msg-current-1", "hello"));
	await waitForAsyncWebhookSideEffects(() => chatCalls.length === 1 && deliveries.length === 1);

	assert.equal(chatCalls.length, 1);
	assert.equal(chatCalls[0]?.conversationId, "web-current-conversation");
	assert.equal(chatCalls[0]?.message, "hello");
	assert.equal(deliveries[0]?.text, "ok");
});

test("FeishuService sends throttled progress updates while a new chat run is active", async () => {
	const deliveries: Array<{ target: FeishuDeliveryTarget; text: string }> = [];
	const mapStore = await createConversationMapStore();
	let resolveChat: ((value: { conversationId: string; text: string }) => void) | undefined;
	let stateCalls = 0;

	const service = new FeishuService({
		progressUpdates: {
			enabled: true,
			intervalMs: 1,
		},
		agentService: {
			async getCurrentConversationId() {
				return "web-current-conversation";
			},
			async getRunStatus(conversationId) {
				return {
					conversationId,
					running: false,
					contextUsage: makeContextUsage(),
				};
			},
			async getConversationState(conversationId) {
				stateCalls += 1;
				return {
					conversationId,
					running: true,
					contextUsage: makeContextUsage(),
					messages: [],
					viewMessages: [],
					activeRun: {
						runId: "run-1",
						status: "running",
						assistantMessageId: "assistant-1",
						input: {
							message: "hello",
							inputAssets: [],
						},
						text: stateCalls === 1 ? "" : "已经整理出初步结论",
						process: {
							title: "处理飞书消息",
							narration: [],
							entries: [],
							currentAction: stateCalls === 1 ? "读取项目文件" : "生成回答",
							isComplete: false,
						},
						queue: null,
						loading: false,
						startedAt: "2026-04-29T00:00:00.000Z",
						updatedAt: "2026-04-29T00:00:00.000Z",
					},
					historyPage: {
						hasMore: false,
						limit: 8,
					},
					updatedAt: "2026-04-29T00:00:00.000Z",
				};
			},
			async queueMessage() {
				throw new Error("queueMessage should not run while idle");
			},
			async chat(input) {
				return await new Promise((resolve) => {
					resolveChat = () => resolve({ conversationId: input.conversationId, text: "final answer" });
				});
			},
		},
		conversationMapStore: mapStore,
		client: {
			isConfigured() {
				return true;
			},
			async sendTextMessage() {},
			async sendFileMessage() {},
			async downloadMessageResource() {
				throw new Error("download should not run for pure text");
			},
		},
		deliveryService: {
			async deliverText(target, text) {
				deliveries.push({ target, text });
			},
		},
	});

	await service.handleWebhook(makeFeishuTextWebhook("chat-1", "msg-progress-1", "hello"));
	await waitForAsyncWebhookSideEffects(() => deliveries.some((delivery) => delivery.text.includes("读取项目文件")));
	resolveChat?.({ conversationId: "web-current-conversation", text: "final answer" });
	await waitForAsyncWebhookSideEffects(() => deliveries.some((delivery) => delivery.text === "final answer"));

	assert.equal(deliveries[0]?.text, "收到，正在处理...");
	assert.ok(deliveries.some((delivery) => delivery.text === "正在处理：读取项目文件"));
	assert.equal(deliveries.at(-1)?.text, "final answer");
});

test("FeishuService queues incoming text onto the active run with steer mode", async () => {
	const queueCalls: Array<Record<string, unknown>> = [];
	const deliveries: Array<{ target: FeishuDeliveryTarget; text: string }> = [];
	const mapStore = await createConversationMapStore();

	const service = new FeishuService({
		agentService: {
			async getCurrentConversationId() {
				return "web-current-conversation";
			},
			async getRunStatus(conversationId) {
				return {
					conversationId,
					running: true,
					contextUsage: {
						provider: "zhipu-glm",
						model: "glm-5.1",
						currentTokens: 0,
						contextWindow: 128000,
						reserveTokens: 16384,
						maxResponseTokens: 16384,
						availableTokens: 111616,
						percent: 0,
						status: "safe",
						mode: "estimate",
					},
				};
			},
			async queueMessage(input) {
				queueCalls.push(input as Record<string, unknown>);
				return { conversationId: input.conversationId, mode: input.mode, queued: true };
			},
			async chat() {
				throw new Error("chat should not run while the conversation is active");
			},
		},
		conversationMapStore: mapStore,
		client: {
			isConfigured() {
				return true;
			},
			async sendTextMessage() {},
			async sendFileMessage() {},
			async downloadMessageResource() {
				throw new Error("download should not run for pure text");
			},
		},
		deliveryService: {
			async deliverText(target, text) {
				deliveries.push({ target, text });
			},
		},
	});

	const response = await service.handleWebhook({
		header: { event_type: "im.message.receive_v1" },
		event: {
			message: {
				chat_id: "chat-1",
				message_id: "msg-1",
				message_type: "text",
				content: JSON.stringify({ text: "继续做这个任务" }),
			},
		},
	});
	assert.equal(response.accepted, true);
	await waitForAsyncWebhookSideEffects(() => queueCalls.length === 1 && deliveries.length === 1);

	assert.equal(queueCalls.length, 1);
	assert.equal(queueCalls[0]?.conversationId, "web-current-conversation");
	assert.equal(queueCalls[0]?.mode, "steer");
	assert.equal(queueCalls[0]?.message, "继续做这个任务");
	assert.equal(deliveries.length, 1);
	assert.equal(deliveries[0]?.text, "已收到你的补充消息，我会把它接到当前处理流程里。");
});

test("FeishuService keeps mapped conversation mode available for compatibility", async () => {
	const chatCalls: Array<Record<string, unknown>> = [];
	const mapStore = await createConversationMapStore();

	const service = new FeishuService({
		conversationMode: "mapped",
		agentService: {
			async getRunStatus(conversationId) {
				return {
					conversationId,
					running: false,
					contextUsage: makeContextUsage(),
				};
			},
			async queueMessage(input) {
				return { conversationId: input.conversationId, mode: input.mode, queued: false };
			},
			async chat(input) {
				chatCalls.push(input as Record<string, unknown>);
				return { conversationId: input.conversationId, text: "ok" };
			},
		},
		conversationMapStore: mapStore,
		client: {
			isConfigured() {
				return true;
			},
			async sendTextMessage() {},
			async sendFileMessage() {},
			async downloadMessageResource() {
				throw new Error("download should not run for pure text");
			},
		},
		deliveryService: {
			async deliverText() {},
		},
	});

	await service.handleWebhook(makeFeishuTextWebhook("chat-legacy", "msg-mapped-1", "first"));
	await service.handleWebhook(makeFeishuTextWebhook("chat-legacy", "msg-mapped-2", "second"));
	await waitForAsyncWebhookSideEffects(() => chatCalls.length === 2);

	assert.equal(chatCalls.length, 2);
	assert.equal(chatCalls[0]?.conversationId, "feishu:chat:chat-legacy");
	assert.equal(chatCalls[1]?.conversationId, "feishu:chat:chat-legacy");
});

test("FeishuService answers /status with the current active run summary", async () => {
	const chatCalls: Array<Record<string, unknown>> = [];
	const deliveries: Array<{ target: FeishuDeliveryTarget; text: string }> = [];
	const mapStore = await createConversationMapStore();

	const service = new FeishuService({
		agentService: {
			async getCurrentConversationId() {
				return "web-current-conversation";
			},
			async getConversationState(conversationId) {
				return {
					conversationId,
					running: true,
					contextUsage: makeContextUsage(),
					messages: [],
					viewMessages: [],
					activeRun: {
						runId: "run-1",
						status: "running",
						assistantMessageId: "assistant-1",
						input: {
							message: "正在部署服务",
							inputAssets: [],
						},
						text: "已经完成构建，正在重启容器",
						process: null,
						queue: null,
						loading: true,
						startedAt: "2026-04-29T00:00:00.000Z",
						updatedAt: "2026-04-29T00:01:00.000Z",
					},
					historyPage: {
						hasMore: false,
						limit: 8,
					},
					updatedAt: "2026-04-29T00:01:00.000Z",
				};
			},
			async getRunStatus(conversationId) {
				return {
					conversationId,
					running: true,
					contextUsage: makeContextUsage(),
				};
			},
			async queueMessage(input) {
				return { conversationId: input.conversationId, mode: input.mode, queued: false };
			},
			async chat(input) {
				chatCalls.push(input as Record<string, unknown>);
				return { conversationId: input.conversationId, text: "should not chat" };
			},
		},
		conversationMapStore: mapStore,
		client: {
			isConfigured() {
				return true;
			},
			async sendTextMessage() {},
			async sendFileMessage() {},
			async downloadMessageResource() {
				throw new Error("download should not run for status command");
			},
		},
		deliveryService: {
			async deliverText(target, text) {
				deliveries.push({ target, text });
			},
		},
	});

	await service.handleWebhook(makeFeishuTextWebhook("chat-status", "msg-status", "/status"));
	await waitForAsyncWebhookSideEffects(() => deliveries.length === 1);

	assert.equal(chatCalls.length, 0);
	assert.match(deliveries[0]?.text ?? "", /状态：正在运行/);
	assert.match(deliveries[0]?.text ?? "", /当前输入：正在部署服务/);
	assert.match(deliveries[0]?.text ?? "", /当前输出：已经完成构建/);
});

test("FeishuService handles /stop by interrupting the current web run", async () => {
	const chatCalls: Array<Record<string, unknown>> = [];
	const queueCalls: Array<Record<string, unknown>> = [];
	const interruptCalls: Array<Record<string, unknown>> = [];
	const deliveries: Array<{ target: FeishuDeliveryTarget; text: string }> = [];
	const mapStore = await createConversationMapStore();

	const service = new FeishuService({
		agentService: {
			async getCurrentConversationId() {
				return "web-current-conversation";
			},
			async interruptChat(input) {
				interruptCalls.push(input as unknown as Record<string, unknown>);
				return {
					conversationId: input.conversationId,
					interrupted: true,
				};
			},
			async getRunStatus(conversationId) {
				return {
					conversationId,
					running: true,
					contextUsage: makeContextUsage(),
				};
			},
			async queueMessage(input) {
				queueCalls.push(input as Record<string, unknown>);
				return { conversationId: input.conversationId, mode: input.mode, queued: true };
			},
			async chat(input) {
				chatCalls.push(input as Record<string, unknown>);
				return { conversationId: input.conversationId, text: "should not chat" };
			},
		},
		conversationMapStore: mapStore,
		client: {
			isConfigured() {
				return true;
			},
			async sendTextMessage() {},
			async sendFileMessage() {},
			async downloadMessageResource() {
				throw new Error("download should not run for stop command");
			},
		},
		deliveryService: {
			async deliverText(target, text) {
				deliveries.push({ target, text });
			},
		},
	});

	await service.handleWebhook(makeFeishuTextWebhook("chat-stop", "msg-stop", "/stop"));
	await waitForAsyncWebhookSideEffects(() => interruptCalls.length === 1 && deliveries.length === 1);

	assert.equal(chatCalls.length, 0);
	assert.equal(queueCalls.length, 0);
	assert.equal(interruptCalls[0]?.conversationId, "web-current-conversation");
	assert.match(deliveries[0]?.text ?? "", /已打断当前 Web 任务：web-current-conversation/);
});

test("FeishuService handles /new as a real current web conversation switch", async () => {
	const chatCalls: Array<Record<string, unknown>> = [];
	const deliveries: Array<{ target: FeishuDeliveryTarget; text: string }> = [];
	const mapStore = await createConversationMapStore();

	const service = new FeishuService({
		agentService: {
			async getCurrentConversationId() {
				return "old-conversation";
			},
			async createConversation() {
				return {
					conversationId: "new-conversation",
					currentConversationId: "new-conversation",
					created: true,
				};
			},
			async getRunStatus(conversationId) {
				return {
					conversationId,
					running: false,
					contextUsage: makeContextUsage(),
				};
			},
			async queueMessage(input) {
				return { conversationId: input.conversationId, mode: input.mode, queued: false };
			},
			async chat(input) {
				chatCalls.push(input as Record<string, unknown>);
				return { conversationId: input.conversationId, text: "should not chat" };
			},
		},
		conversationMapStore: mapStore,
		client: {
			isConfigured() {
				return true;
			},
			async sendTextMessage() {},
			async sendFileMessage() {},
			async downloadMessageResource() {
				throw new Error("download should not run for new command");
			},
		},
		deliveryService: {
			async deliverText(target, text) {
				deliveries.push({ target, text });
			},
		},
	});

	await service.handleWebhook(makeFeishuTextWebhook("chat-new", "msg-new", "/new"));
	await waitForAsyncWebhookSideEffects(() => deliveries.length === 1);

	assert.equal(chatCalls.length, 0);
	assert.match(deliveries[0]?.text ?? "", /已新建并切换 Web 当前会话：new-conversation/);
});

test("FeishuService answers /whoami with chat and sender ids for notification setup", async () => {
	const chatCalls: Array<Record<string, unknown>> = [];
	const deliveries: Array<{ target: FeishuDeliveryTarget; text: string }> = [];
	const mapStore = await createConversationMapStore();

	const service = new FeishuService({
		agentService: {
			async getCurrentConversationId() {
				return "web-current-conversation";
			},
			async getRunStatus(conversationId) {
				return {
					conversationId,
					running: false,
					contextUsage: makeContextUsage(),
				};
			},
			async queueMessage(input) {
				return { conversationId: input.conversationId, mode: input.mode, queued: false };
			},
			async chat(input) {
				chatCalls.push(input as Record<string, unknown>);
				return { conversationId: input.conversationId, text: "should not chat" };
			},
		},
		conversationMapStore: mapStore,
		client: {
			isConfigured() {
				return true;
			},
			async sendTextMessage() {},
			async sendFileMessage() {},
			async downloadMessageResource() {
				throw new Error("download should not run for whoami command");
			},
		},
		deliveryService: {
			async deliverText(target, text) {
				deliveries.push({ target, text });
			},
		},
	});

	await service.handleWebhook({
		header: { event_type: "im.message.receive_v1" },
		event: {
			sender: {
				sender_id: {
					open_id: "ou-user",
				},
			},
			message: {
				chat_id: "oc-private-chat",
				message_id: "msg-whoami",
				message_type: "text",
				content: JSON.stringify({ text: "/whoami" }),
			},
		},
	});
	await waitForAsyncWebhookSideEffects(() => deliveries.length === 1);

	assert.equal(chatCalls.length, 0);
	assert.match(deliveries[0]?.text ?? "", /chat_id：oc-private-chat/);
	assert.match(deliveries[0]?.text ?? "", /open_id：ou-user/);
	assert.match(deliveries[0]?.text ?? "", /FEISHU_ACTIVITY_OPEN_IDS/);
});

test("FeishuService queues incoming files onto the current active run with followUp mode", async () => {
	const queueCalls: Array<Record<string, unknown>> = [];
	const mapStore = await createConversationMapStore();

	const service = new FeishuService({
		agentService: {
			async getCurrentConversationId() {
				return "web-current-conversation";
			},
			async getRunStatus(conversationId) {
				return {
					conversationId,
					running: true,
					contextUsage: makeContextUsage(),
				};
			},
			async queueMessage(input) {
				queueCalls.push(input as Record<string, unknown>);
				return { conversationId: input.conversationId, mode: input.mode, queued: true };
			},
			async chat() {
				throw new Error("chat should not run while the conversation is active");
			},
		},
		conversationMapStore: mapStore,
		client: {
			isConfigured() {
				return true;
			},
			async sendTextMessage() {},
			async sendFileMessage() {},
			async downloadMessageResource() {
				return {
					fileName: "running-source.txt",
					mimeType: "text/plain",
					bytes: new TextEncoder().encode("running file"),
				};
			},
		},
		deliveryService: {
			async deliverText() {},
		},
	});

	await service.handleWebhook({
		header: { event_type: "im.message.receive_v1" },
		event: {
			message: {
				chat_id: "chat-running-file",
				message_id: "msg-running-file",
				message_type: "file",
				content: JSON.stringify({
					file_key: "file-key-running",
					file_name: "running-source.txt",
				}),
			},
		},
	});
	await waitForAsyncWebhookSideEffects(() => queueCalls.length === 1);

	assert.equal(queueCalls.length, 1);
	assert.equal(queueCalls[0]?.conversationId, "web-current-conversation");
	assert.equal(queueCalls[0]?.mode, "followUp");
	assert.equal(queueCalls[0]?.message, "请结合我通过飞书发送的附件一起处理。");
	const attachments = queueCalls[0]?.attachments as Array<{ fileName: string; base64?: string }>;
	assert.equal(attachments.length, 1);
	assert.equal(attachments[0]?.fileName, "running-source.txt");
	assert.equal(Buffer.from(String(attachments[0]?.base64), "base64").toString("utf8"), "running file");
});

test("FeishuService ignores duplicate message ids before invoking the agent", async () => {
	const chatCalls: Array<Record<string, unknown>> = [];
	const mapStore = await createConversationMapStore();

	const service = new FeishuService({
		agentService: {
			async getCurrentConversationId() {
				return "web-current-conversation";
			},
			async getRunStatus(conversationId) {
				return {
					conversationId,
					running: false,
					contextUsage: makeContextUsage(),
				};
			},
			async queueMessage(input) {
				return { conversationId: input.conversationId, mode: input.mode, queued: false };
			},
			async chat(input) {
				chatCalls.push(input as Record<string, unknown>);
				return { conversationId: input.conversationId, text: "ok" };
			},
		},
		conversationMapStore: mapStore,
		client: {
			isConfigured() {
				return true;
			},
			async sendTextMessage() {},
			async sendFileMessage() {},
			async downloadMessageResource() {
				throw new Error("download should not run for pure text");
			},
		},
		deliveryService: {
			async deliverText() {},
		},
	});

	await service.handleWebhook(makeFeishuTextWebhook("chat-dup", "msg-dup", "hello"));
	await service.handleWebhook(makeFeishuTextWebhook("chat-dup", "msg-dup", "hello again"));
	await waitForAsyncWebhookSideEffects(() => chatCalls.length >= 1);

	assert.equal(chatCalls.length, 1);
	assert.equal(chatCalls[0]?.message, "hello");
});

test("FeishuService ignores messages from chats outside the allowlist", async () => {
	const chatCalls: Array<Record<string, unknown>> = [];
	const queueCalls: Array<Record<string, unknown>> = [];
	const mapStore = await createConversationMapStore();

	const service = new FeishuService({
		allowedChatIds: ["chat-allowed"],
		agentService: {
			async getCurrentConversationId() {
				return "web-current-conversation";
			},
			async getRunStatus(conversationId) {
				return {
					conversationId,
					running: false,
					contextUsage: makeContextUsage(),
				};
			},
			async queueMessage(input) {
				queueCalls.push(input as Record<string, unknown>);
				return { conversationId: input.conversationId, mode: input.mode, queued: true };
			},
			async chat(input) {
				chatCalls.push(input as Record<string, unknown>);
				return { conversationId: input.conversationId, text: "ok" };
			},
		},
		conversationMapStore: mapStore,
		client: {
			isConfigured() {
				return true;
			},
			async sendTextMessage() {},
			async sendFileMessage() {},
			async downloadMessageResource() {
				throw new Error("download should not run for denied chat");
			},
		},
		deliveryService: {
			async deliverText() {
				throw new Error("denied chat should not receive a delivery");
			},
		},
	});

	const response = await service.handleWebhook(makeFeishuTextWebhook("chat-denied", "msg-denied", "hello"));
	await new Promise((resolve) => setTimeout(resolve, 20));

	assert.equal(response.accepted, true);
	assert.equal(chatCalls.length, 0);
	assert.equal(queueCalls.length, 0);
});

test("FeishuConversationMapStore preserves concurrent chat mappings", async () => {
	const { store, indexPath } = await createConversationMapStoreWithPath();
	const entries = Array.from({ length: 24 }, (_, index) => ({
		key: `chat:concurrent-${index}`,
		conversationId: `feishu:chat:concurrent-${index}`,
	}));

	const results = await Promise.all(
		entries.map((entry) => store.getOrCreate(entry.key, () => entry.conversationId)),
	);

	assert.deepEqual(
		results.sort(),
		entries.map((entry) => entry.conversationId).sort(),
	);
	const persisted = JSON.parse(await readFile(indexPath, "utf8")) as Record<string, string>;
	for (const entry of entries) {
		assert.equal(persisted[entry.key], entry.conversationId);
	}
	assert.equal(Object.keys(persisted).length, entries.length);
});

test("FeishuConversationMapStore retries transient file replacement failures", async () => {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-feishu-"));
	const indexPath = join(root, ".data", "agent", "feishu", "conversation-map.json");
	let attempts = 0;
	const store = new FeishuConversationMapStore({
		indexPath,
		renameFile: async (source, target) => {
			attempts += 1;
			if (attempts === 1) {
				const error = new Error("temporary file replacement lock") as NodeJS.ErrnoException;
				error.code = "EBUSY";
				throw error;
			}
			await rename(source, target);
		},
		renameRetryDelayMs: 0,
	});

	await store.getOrCreate("chat:retry", () => "feishu:chat:retry");

	assert.equal(attempts, 2);
	const persisted = JSON.parse(await readFile(indexPath, "utf8")) as Record<string, string>;
	assert.equal(persisted["chat:retry"], "feishu:chat:retry");
});

test("FeishuService downloads incoming file resources and passes them to the agent", async () => {
	const chatCalls: Array<Record<string, unknown>> = [];
	const deliveries: Array<{ target: FeishuDeliveryTarget; text: string; files?: Array<{ fileName: string; downloadUrl: string; mimeType?: string }> }> = [];
	const mapStore = await createConversationMapStore();

	const service = new FeishuService({
		agentService: {
			async getCurrentConversationId() {
				return "web-current-conversation";
			},
			async getRunStatus(conversationId) {
				return {
					conversationId,
					running: false,
					contextUsage: {
						provider: "zhipu-glm",
						model: "glm-5.1",
						currentTokens: 0,
						contextWindow: 128000,
						reserveTokens: 16384,
						maxResponseTokens: 16384,
						availableTokens: 111616,
						percent: 0,
						status: "safe",
						mode: "estimate",
					},
				};
			},
			async queueMessage(input) {
				return { conversationId: input.conversationId, mode: input.mode, queued: false };
			},
			async chat(input) {
				chatCalls.push(input as Record<string, unknown>);
				return {
					conversationId: input.conversationId,
					text: "文件处理完成",
					files: [
						{
							id: "file-1",
							assetId: "asset-file-1",
							reference: "result.txt",
							fileName: "result.txt",
							downloadUrl: "/v1/files/file-1",
							mimeType: "text/plain",
							sizeBytes: 16,
						},
					],
				};
			},
		},
		conversationMapStore: mapStore,
		client: {
			isConfigured() {
				return true;
			},
			async sendTextMessage() {},
			async sendFileMessage() {},
			async downloadMessageResource() {
				return {
					fileName: "source.txt",
					mimeType: "text/plain",
					bytes: new TextEncoder().encode("hello from feishu"),
				};
			},
		},
		deliveryService: {
			async deliverText(target, text, options) {
				deliveries.push({ target, text, files: options?.files });
			},
		},
	});

	await service.handleWebhook({
		header: { event_type: "im.message.receive_v1" },
		event: {
			message: {
				chat_id: "chat-2",
				message_id: "msg-file-1",
				message_type: "file",
				content: JSON.stringify({
					file_key: "file-key-1",
					file_name: "source.txt",
				}),
			},
		},
	});
	await waitForAsyncWebhookSideEffects(() => chatCalls.length === 1 && deliveries.length === 1);

	assert.equal(chatCalls.length, 1);
	assert.equal(chatCalls[0]?.conversationId, "web-current-conversation");
	assert.equal(chatCalls[0]?.message, "请结合我通过飞书发送的附件一起处理。");
	const attachments = chatCalls[0]?.attachments as Array<{ fileName: string; mimeType: string; base64?: string }>;
	assert.equal(attachments.length, 1);
	assert.equal(attachments[0]?.fileName, "source.txt");
	assert.equal(Buffer.from(String(attachments[0]?.base64), "base64").toString("utf8"), "hello from feishu");
	assert.equal(deliveries.length, 1);
	assert.equal(deliveries[0]?.text, "文件处理完成");
	assert.deepEqual(deliveries[0]?.files, [
		{
			fileName: "result.txt",
			downloadUrl: "/v1/files/file-1",
			mimeType: "text/plain",
		},
	]);
});

test("FeishuDeliveryService sends text first and uploads result files back to Feishu", async () => {
	const sentTexts: string[] = [];
	const sentFiles: Array<{ fileName: string; mimeType?: string; bytes: Uint8Array }> = [];
	const client: FeishuClientLike = {
		isConfigured() {
			return true;
		},
		async sendTextMessage(input) {
			sentTexts.push(input.text);
		},
		async sendFileMessage(input) {
			sentFiles.push({
				fileName: input.fileName,
				mimeType: input.mimeType,
				bytes: input.bytes,
			});
		},
		async downloadMessageResource() {
			throw new Error("not used");
		},
	};

	const delivery = new FeishuDeliveryService({
		client,
		publicBaseUrl: "http://127.0.0.1:3000",
		fetchImpl: async () =>
			new Response(new TextEncoder().encode("downloaded result"), {
				status: 200,
				headers: {
					"content-type": "text/plain",
				},
			}),
	});

	await delivery.deliver(
		{
			type: "feishu_chat",
			chatId: "chat-3",
		},
		"处理完成",
		{
			files: [
				{
					fileName: "result.txt",
					downloadUrl: "/v1/files/file-2",
					mimeType: "text/plain",
				},
			],
		},
	);

	assert.deepEqual(sentTexts, ["处理完成"]);
	assert.equal(sentFiles.length, 1);
	assert.equal(sentFiles[0]?.fileName, "result.txt");
	assert.equal(Buffer.from(sentFiles[0]?.bytes ?? new Uint8Array()).toString("utf8"), "downloaded result");
});
