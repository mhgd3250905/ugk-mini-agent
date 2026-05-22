import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentService } from "../src/agent/agent-service.js";
import { AgentBusyError } from "../src/agent/agent-errors.js";
import type {
	AgentSessionFactory,
	AgentSessionLike,
	MessageUpdateEventLike,
	PromptOptionsLike,
	RawAgentSessionEventLike,
	RecentSessionMessagesInput,
	RecentSessionMessagesResult,
} from "../src/agent/agent-session-factory.js";
import type { AssetRecord, ChatAttachment } from "../src/agent/asset-store.js";
import { ConversationStore } from "../src/agent/conversation-store.js";
import { buildPromptWithAssetContext } from "../src/agent/file-artifacts.js";
import { readBrowserScopeRoute } from "../src/browser/browser-scope-routes.js";
import { getCurrentAgentScope } from "../src/agent/agent-scope-context.js";
import type { ChatStreamEvent, ConversationStateResponseBody } from "../src/types/api.js";

function restoreEnvValue(key: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}

class FakeSession implements AgentSessionLike {
	public prompts: Array<{ message: string; options?: PromptOptionsLike }> = [];
	public abortCalls = 0;
	public messages: Array<{
		role: string;
		content?: Array<{ type: string; text?: string }>;
		stopReason?: string;
		errorMessage?: string;
	}> = [];

	constructor(
		public sessionFile: string | undefined,
		private readonly events: RawAgentSessionEventLike[],
		private readonly finalAssistantText?: string,
		private readonly finalAssistantError?: string,
	) {}

	subscribe(listener: (event: RawAgentSessionEventLike) => void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}

	async prompt(message: string, options?: PromptOptionsLike): Promise<void> {
		this.prompts.push({ message, options });
		for (const event of this.events) {
			this.listener?.(event);
		}

		this.messages.push({
			role: "assistant",
			content: this.finalAssistantText
				? [
						{
							type: "text",
							text: this.finalAssistantText,
						},
					]
				: [],
			stopReason: this.finalAssistantError ? "error" : "stop",
			errorMessage: this.finalAssistantError,
		});
	}

	async abort(): Promise<void> {
		this.abortCalls += 1;
	}

	emit(event: RawAgentSessionEventLike): void {
		this.listener?.(event);
	}

	private listener?: (event: RawAgentSessionEventLike) => void;
}

class DeferredSession extends FakeSession {
	private resolvePrompt?: () => void;
	public promptStarted?: Promise<void>;
	private resolvePromptStarted?: () => void;
	public steerCalls: string[] = [];
	public followUpCalls: string[] = [];

	constructor(sessionFile: string | undefined) {
		super(sessionFile, []);
		this.promptStarted = new Promise((resolve) => {
			this.resolvePromptStarted = resolve;
		});
	}

	override async prompt(message: string, options?: PromptOptionsLike): Promise<void> {
		this.prompts.push({ message, options });
		if (options?.streamingBehavior) {
			return;
		}
		this.resolvePromptStarted?.();
		await new Promise<void>((resolve) => {
			this.resolvePrompt = resolve;
		});
		this.messages.push({
			role: "assistant",
			content: [{ type: "text", text: "done after control" }],
			stopReason: this.abortCalls > 0 ? "aborted" : "stop",
		});
	}

	finish(): void {
		this.resolvePrompt?.();
	}

	override async abort(): Promise<void> {
		this.abortCalls += 1;
		this.finish();
	}

	async steer(message: string): Promise<void> {
		this.steerCalls.push(message);
	}

	async followUp(message: string): Promise<void> {
		this.followUpCalls.push(message);
	}
}

class TerminalOverlapSession extends FakeSession {
	private resolvePrompt?: () => void;
	public promptStarted?: Promise<void>;
	private resolvePromptStarted?: () => void;

	constructor(
		sessionFile: string | undefined,
		private readonly persistedUserText: string,
		private readonly persistedAssistantText: string,
	) {
		super(sessionFile, []);
		this.promptStarted = new Promise((resolve) => {
			this.resolvePromptStarted = resolve;
		});
	}

	override async prompt(message: string, options?: PromptOptionsLike): Promise<void> {
		this.prompts.push({ message, options });
		if (options?.streamingBehavior) {
			return;
		}
		this.resolvePromptStarted?.();
		await new Promise<void>((resolve) => {
			this.resolvePrompt = resolve;
		});
		this.messages.push(
			{
				role: "user",
				content: buildPromptWithAssetContext(this.persistedUserText),
			} as never,
			{
				role: "assistant",
				content: [{ type: "text", text: this.persistedAssistantText }],
				stopReason: "stop",
			},
		);
	}

	finish(): void {
		this.resolvePrompt?.();
	}
}

class TerminalNoPersistSession extends FakeSession {
	private resolvePrompt?: () => void;
	public promptStarted?: Promise<void>;
	private resolvePromptStarted?: () => void;

	constructor(sessionFile: string | undefined) {
		super(sessionFile, []);
		this.promptStarted = new Promise((resolve) => {
			this.resolvePromptStarted = resolve;
		});
	}

	override async prompt(message: string, options?: PromptOptionsLike): Promise<void> {
		this.prompts.push({ message, options });
		if (options?.streamingBehavior) {
			return;
		}
		this.resolvePromptStarted?.();
		await new Promise<void>((resolve) => {
			this.resolvePrompt = resolve;
		});
	}

	finish(): void {
		this.resolvePrompt?.();
	}
}

class EnvAwareSession extends FakeSession {
	public observedAgentScope?: string;

	override async prompt(message: string, options?: PromptOptionsLike): Promise<void> {
		this.observedAgentScope = getCurrentAgentScope()?.scope;
		await super.prompt(message, options);
	}
}

class RouteObservingSession extends FakeSession {
	public observedRoute: unknown;

	constructor(
		sessionFile: string | undefined,
		events: RawAgentSessionEventLike[],
		finalAssistantText: string | undefined,
		private readonly routeCachePath: string,
		private readonly scope: string,
	) {
		super(sessionFile, events, finalAssistantText);
	}

	override async prompt(message: string, options?: PromptOptionsLike): Promise<void> {
		this.observedRoute = await readBrowserScopeRoute(this.scope, { cachePath: this.routeCachePath });
		await super.prompt(message, options);
	}
}

class StrictQueueSession extends DeferredSession {
	override async prompt(message: string, options?: PromptOptionsLike): Promise<void> {
		if (options?.streamingBehavior) {
			throw new Error(`queueMessage must use explicit queue APIs, got prompt(${options.streamingBehavior}) for ${message}`);
		}
		await super.prompt(message, options);
	}
}

class InterruptHistorySession implements AgentSessionLike {
	public prompts: Array<{ message: string; options?: PromptOptionsLike }> = [];
	public abortCalls = 0;
	public messages: Array<{
		role: string;
		content?: Array<{ type: string; text?: string }> | string;
		stopReason?: string;
		errorMessage?: string;
	}> = [];
	public steerCalls: string[] = [];
	public promptStarted: Promise<void>;

	private resolvePrompt?: () => void;
	private resolvePromptStarted?: () => void;
	private listener?: (event: RawAgentSessionEventLike) => void;

	constructor(public sessionFile: string | undefined) {
		this.promptStarted = new Promise((resolve) => {
			this.resolvePromptStarted = resolve;
		});
	}

	subscribe(listener: (event: RawAgentSessionEventLike) => void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}

	async prompt(message: string, options?: PromptOptionsLike): Promise<void> {
		this.prompts.push({ message, options });
		if (options?.streamingBehavior) {
			return;
		}

		this.messages.push({
			role: "user",
			content: buildPromptWithAssetContext(message),
		});
		this.resolvePromptStarted?.();
		await new Promise<void>((resolve) => {
			this.resolvePrompt = resolve;
		});
	}

	async abort(): Promise<void> {
		this.abortCalls += 1;
		this.finish();
	}

	async steer(message: string): Promise<void> {
		this.steerCalls.push(message);
		this.messages.push({
			role: "user",
			content: buildPromptWithAssetContext(message),
		});
	}

	emit(event: RawAgentSessionEventLike): void {
		this.listener?.(event);
	}

	finish(): void {
		this.resolvePrompt?.();
	}

	appendAssistant(text: string): void {
		this.messages.push({
			role: "assistant",
			content: [{ type: "text", text }],
			stopReason: "stop",
		});
	}
}

class FakeAgentSessionFactory implements AgentSessionFactory {
	public calls: Array<{ browserId?: string; browserScope?: string; conversationId: string; sessionFile?: string }> = [];
	public readCalls: string[] = [];
	public readRecentCalls: Array<{ sessionFile: string; input: RecentSessionMessagesInput }> = [];
	public availableSkills: Array<{ name: string; path?: string }> = [];
	public skillFingerprint?: string;
	public readonly persistedMessages = new Map<
		string,
		NonNullable<AgentSessionLike["messages"]>
	>();
	public readonly recentMessages = new Map<string, RecentSessionMessagesResult>();

	constructor(private readonly buildSession: (callIndex: number) => AgentSessionLike) {}

	async createSession(input: { browserId?: string; browserScope?: string; conversationId: string; sessionFile?: string }): Promise<AgentSessionLike> {
		this.calls.push(input);
		return this.buildSession(this.calls.length - 1);
	}

	async readSessionMessages(sessionFile: string): Promise<NonNullable<AgentSessionLike["messages"]> | undefined> {
		this.readCalls.push(sessionFile);
		return this.persistedMessages.get(sessionFile);
	}

	async readRecentSessionMessages(
		sessionFile: string,
		input: RecentSessionMessagesInput,
	): Promise<RecentSessionMessagesResult | undefined> {
		this.readRecentCalls.push({ sessionFile, input });
		return this.recentMessages.get(sessionFile);
	}

	async getAvailableSkills(): Promise<{
		skills: Array<{ name: string; path?: string }>;
		source: "fresh" | "cache";
		cachedAt: string;
	}> {
		return {
			skills: this.availableSkills,
			source: "fresh",
			cachedAt: "2026-04-24T00:00:00.000Z",
		};
	}

	async getSkillFingerprint(): Promise<string | undefined> {
		return this.skillFingerprint;
	}

	getDefaultModelContext() {
		return {
			provider: "zhipu-glm",
			model: "glm-5.1",
			contextWindow: 128000,
			maxResponseTokens: 16384,
			reserveTokens: 16384,
		};
	}
}

class FakeAssetStore {
	public savedAttachments: Array<{
		conversationId: string;
		attachments: readonly ChatAttachment[];
	}> = [];
	public saved: Array<{
		conversationId: string;
		files: Array<{ fileName: string; mimeType: string; content: string }>;
	}> = [];
	private readonly assets = new Map<string, AssetRecord>();
	private readonly assetTexts = new Map<string, string>();

	async registerAttachments(conversationId: string, attachments: readonly ChatAttachment[]): Promise<AssetRecord[]> {
		this.savedAttachments.push({ conversationId, attachments });
		return attachments.map((attachment, index) => {
			const asset = {
				assetId: `asset-upload-${index + 1}`,
				reference: `@asset[asset-upload-${index + 1}]`,
				fileName: attachment.fileName,
				mimeType: attachment.mimeType ?? "application/octet-stream",
				sizeBytes: attachment.sizeBytes ?? 0,
				kind: typeof attachment.text === "string" ? ("text" as const) : ("metadata" as const),
				hasContent: typeof attachment.text === "string",
				source: "user_upload" as const,
				conversationId,
				createdAt: "2026-04-18T00:00:00.000Z",
				...(typeof attachment.text === "string" ? { textPreview: attachment.text } : {}),
				...(typeof attachment.text === "string" ? { downloadUrl: `/v1/files/asset-upload-${index + 1}` } : {}),
			} satisfies AssetRecord;
			this.assets.set(asset.assetId, asset);
			if (typeof attachment.text === "string") {
				this.assetTexts.set(asset.assetId, attachment.text);
			}
			return asset;
		});
	}

	async saveFiles(
		conversationId: string,
		files: Array<{ fileName: string; mimeType: string; content: string }>,
	): Promise<Array<{ id: string; assetId: string; reference: string; fileName: string; mimeType: string; sizeBytes: number; downloadUrl: string }>> {
		this.saved.push({ conversationId, files });
		return files.map((file, index) => ({
			id: `file-${index + 1}`,
			assetId: `file-${index + 1}`,
			reference: `@asset[file-${index + 1}]`,
			fileName: file.fileName,
			mimeType: file.mimeType,
			sizeBytes: Buffer.byteLength(file.content, "utf8"),
			downloadUrl: `/v1/files/file-${index + 1}`,
		}));
	}

	async listAssets(): Promise<AssetRecord[]> {
		return [...this.assets.values()];
	}

	async getAsset(assetId: string): Promise<AssetRecord | undefined> {
		return this.assets.get(assetId);
	}

	async resolveAssets(assetIds: readonly string[]): Promise<AssetRecord[]> {
		return assetIds.map((assetId) => this.assets.get(assetId)).filter((asset): asset is AssetRecord => Boolean(asset));
	}

	async readText(assetId: string): Promise<string | undefined> {
		return this.assetTexts.get(assetId);
	}

	async getFile(assetId: string): Promise<
		| {
				assetId: string;
				reference: string;
				fileName: string;
				mimeType: string;
				sizeBytes: number;
				kind: "text";
				hasContent: true;
				source: "agent_output";
				conversationId: string;
				createdAt: string;
				downloadUrl: string;
				content: Buffer;
		  }
		| undefined
	> {
		if (assetId !== "file-1") {
			return undefined;
		}
		return {
			assetId: "file-1",
			reference: "@asset[file-1]",
			fileName: "hello.txt",
			mimeType: "text/plain",
			sizeBytes: 16,
			kind: "text",
			hasContent: true,
			source: "agent_output",
			conversationId: "manual:file-output",
			createdAt: "2026-04-18T00:00:00.000Z",
			downloadUrl: "/v1/files/file-1",
			content: Buffer.from("hello from agent", "utf8"),
		};
	}

	seedAsset(asset: AssetRecord, text?: string): void {
		this.assets.set(asset.assetId, asset);
		if (typeof text === "string") {
			this.assetTexts.set(asset.assetId, text);
		}
	}
}

async function createStore(): Promise<ConversationStore> {
	const dir = await mkdtemp(join(tmpdir(), "ugk-pi-agent-service-"));
	return new ConversationStore(join(dir, "conversation-index.json"));
}

function textDelta(delta: string): MessageUpdateEventLike {
	return {
		type: "message_update",
		assistantMessageEvent: {
			type: "text_delta",
			delta,
		},
	};
}

function sendFileToolFinished(file: {
	assetId: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	downloadUrl: string;
}): RawAgentSessionEventLike {
	return {
		type: "tool_execution_end",
		toolCallId: "tool-send-file",
		toolName: "send_file",
		isError: false,
		result: {
			content: [{ type: "text", text: `File ready: ${file.fileName}` }],
			details: {
				action: "send",
				file: {
					id: file.assetId,
					assetId: file.assetId,
					reference: `@asset[${file.assetId}]`,
					fileName: file.fileName,
					mimeType: file.mimeType,
					sizeBytes: file.sizeBytes,
					downloadUrl: file.downloadUrl,
				},
			},
		},
	};
}

test("creates a new conversation, prompts the session, and persists the session file", async () => {
	const store = await createStore();
	const factory = new FakeAgentSessionFactory(
		() => new FakeSession("E:/sessions/new.jsonl", [textDelta("你好"), textDelta("，世界")]),
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const result = await service.chat({
		message: "你好",
	});

	assert.match(result.conversationId, /^manual:/);
	assert.equal(result.text, "你好，世界");
	assert.equal(result.sessionFile, "E:/sessions/new.jsonl");
	assert.deepEqual(factory.calls, [
		{
			browserScope: result.conversationId.replace(/[^a-zA-Z0-9_-]+/g, "-"),
			conversationId: result.conversationId,
			sessionFile: undefined,
		},
	]);
	assert.deepEqual(factory.calls.length, 1);
	const storedConversation = await store.get(result.conversationId);
	assert.equal(storedConversation?.sessionFile, "E:/sessions/new.jsonl");
	assert.equal(storedConversation?.title, "新会话");
	assert.equal(storedConversation?.preview, "");
	assert.equal(storedConversation?.messageCount, 0);
});

test("chat closes scoped browser targets after the run finishes", async () => {
	const originalFetch = globalThis.fetch;
	const originalClaudeAgentId = process.env.CLAUDE_AGENT_ID;
	delete process.env.CLAUDE_AGENT_ID;
	const cleanupCalls: Array<{ url: string; init?: RequestInit }> = [];
	globalThis.fetch = (async (url, init) => {
		cleanupCalls.push({ url: String(url), init });
		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;

	try {
		const store = await createStore();
		const session = new EnvAwareSession("E:/sessions/browser-cleanup.jsonl", [textDelta("done")]);
		const factory = new FakeAgentSessionFactory(() => session);
		const service = new AgentService({ agentId: "search", conversationStore: store, sessionFactory: factory });

		const result = await service.chat({
			conversationId: "manual:browser-cleanup",
			message: "open a browser page",
		});

		assert.equal(result.text, "done");
		assert.equal(session.observedAgentScope, "search-manual-browser-cleanup");
		assert.equal(cleanupCalls.length, 2);
		assert.equal(
			cleanupCalls[0]?.url,
			"http://127.0.0.1:3456/session/close-all?metaAgentScope=search-manual-browser-cleanup",
		);
		assert.equal(
			cleanupCalls[1]?.url,
			`http://127.0.0.1:3456/session/close-all?metaAgentScope=${encodeURIComponent(session.observedAgentScope ?? "")}`,
		);
		assert.equal(cleanupCalls[0]?.init?.method, "POST");
		assert.equal(cleanupCalls[1]?.init?.method, "POST");
		assert.equal(process.env.CLAUDE_AGENT_ID, undefined);
	} finally {
		globalThis.fetch = originalFetch;
		if (originalClaudeAgentId === undefined) {
			delete process.env.CLAUDE_AGENT_ID;
		} else {
			process.env.CLAUDE_AGENT_ID = originalClaudeAgentId;
		}
	}
});

test("chat includes uploaded file attachments in the session prompt", async () => {
	const store = await createStore();
	const session = new FakeSession("E:/sessions/attachments.jsonl", [textDelta("read file")]);
	const factory = new FakeAgentSessionFactory(() => session);
	const assetStore = new FakeAssetStore();
	const service = new AgentService({ conversationStore: store, sessionFactory: factory, assetStore });

	const result = await service.chat({
		conversationId: "manual:attachments",
		message: "Please inspect this file",
		attachments: [
			{
				fileName: "notes.txt",
				mimeType: "text/plain",
				sizeBytes: 18,
				text: "alpha\nbeta",
			},
		],
	});

	assert.equal(session.prompts.length, 1);
	assert.match(session.prompts[0]?.message ?? "", /Please inspect this file/);
	assert.match(session.prompts[0]?.message ?? "", /<user_assets>/);
	assert.match(session.prompts[0]?.message ?? "", /assetId: asset-upload-1/);
	assert.match(session.prompts[0]?.message ?? "", /reference: @asset\[asset-upload-1\]/);
	assert.match(session.prompts[0]?.message ?? "", /fileName: notes\.txt/);
	assert.match(session.prompts[0]?.message ?? "", /mimeType: text\/plain/);
	assert.match(session.prompts[0]?.message ?? "", /alpha\nbeta/);
	assert.match(session.prompts[0]?.message ?? "", /```ugk-file name="example\.txt"/);
	assert.deepEqual(result.inputAssets, [
		{
			assetId: "asset-upload-1",
			reference: "@asset[asset-upload-1]",
			fileName: "notes.txt",
			mimeType: "text/plain",
			sizeBytes: 18,
			kind: "text",
			hasContent: true,
			source: "user_upload",
			conversationId: "manual:attachments",
			createdAt: "2026-04-18T00:00:00.000Z",
			textPreview: "alpha\nbeta",
			downloadUrl: "/v1/files/asset-upload-1",
		},
	]);
});

test("chat prepends the current time context before sending the prompt to the agent", async () => {
	const store = await createStore();
	const session = new FakeSession("E:/sessions/time-prefix.jsonl", [textDelta("收到")]);
	const factory = new FakeAgentSessionFactory(() => session);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	await service.chat({
		conversationId: "manual:time-prefix",
		message: "三分钟后提醒我看一下日志",
	});

	assert.equal(session.prompts.length, 1);
	assert.match(session.prompts[0]?.message ?? "", /\[当前时间：[^\]]+\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/);
	assert.match(session.prompts[0]?.message ?? "", /三分钟后提醒我看一下日志/);
});

test("chat converts ugk-file blocks from the assistant into downloadable files", async () => {
	const store = await createStore();
	const assetStore = new FakeAssetStore();
	const factory = new FakeAgentSessionFactory(
		() =>
			new FakeSession(
				"E:/sessions/files.jsonl",
				[],
				[
					"Here is the file.",
					"",
					'```ugk-file name="hello.txt" mime="text/plain"',
					"hello from agent",
					"```",
					"",
					"Use it well.",
				].join("\n"),
			),
	);
	const service = new AgentService({
		conversationStore: store,
		sessionFactory: factory,
		assetStore,
	});

	const result = await service.chat({
		conversationId: "manual:file-output",
		message: "send me a file",
	});

	assert.equal(result.text, "Here is the file.\n\nUse it well.");
	assert.deepEqual(assetStore.saved, [
		{
			conversationId: "manual:file-output",
			files: [
				{
					fileName: "hello.txt",
					mimeType: "text/plain",
					content: "hello from agent",
				},
			],
		},
	]);
	assert.deepEqual(result.files, [
		{
			id: "file-1",
			assetId: "file-1",
			reference: "@asset[file-1]",
			fileName: "hello.txt",
			mimeType: "text/plain",
			sizeBytes: 16,
			downloadUrl: "/v1/files/file-1",
		},
	]);
});

test("chat returns empty visible text when the assistant only sends a ugk-file block", async () => {
	const store = await createStore();
	const assetStore = new FakeAssetStore();
	const factory = new FakeAgentSessionFactory(
		() =>
			new FakeSession(
				"E:/sessions/file-only.jsonl",
				[],
				['```ugk-file name="report.png" mime="image/png"', "iVBORw0KGgo=", "```"].join("\n"),
			),
	);
	const service = new AgentService({
		conversationStore: store,
		sessionFactory: factory,
		assetStore,
	});

	const events: Array<Record<string, unknown>> = [];
	const result = await service.streamChat(
		{
			conversationId: "manual:file-only",
			message: "send only the image",
		},
		(event) => {
			events.push(event as unknown as Record<string, unknown>);
		},
	);

	assert.equal(result, undefined);
	const doneEvent = events.find((event) => event.type === "done");
	assert.equal(doneEvent?.type, "done");
	assert.equal(doneEvent?.conversationId, "manual:file-only");
	assert.equal(typeof doneEvent?.runId, "string");
	assert.equal(doneEvent?.text, "");
	assert.equal(doneEvent?.sessionFile, "E:/sessions/file-only.jsonl");
	assert.deepEqual(doneEvent?.files, [
		{
			id: "file-1",
			assetId: "file-1",
			reference: "@asset[file-1]",
			fileName: "report.png",
			mimeType: "image/png",
			sizeBytes: 12,
			downloadUrl: "/v1/files/file-1",
		},
	]);
});

test("chat includes files returned by the send_file tool in the final done event", async () => {
	const store = await createStore();
	const factory = new FakeAgentSessionFactory(
		() =>
			new FakeSession(
				"E:/sessions/send-file-tool.jsonl",
				[
					sendFileToolFinished({
						assetId: "file-tool-1",
						fileName: "report.png",
						mimeType: "image/png",
						sizeBytes: 8,
						downloadUrl: "/v1/files/file-tool-1",
					}),
				],
				"文件已发送。",
			),
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });
	const events: Array<Record<string, unknown>> = [];

	const result = await service.chat({
		conversationId: "manual:send-file-tool",
		message: "send the report",
	});
	await service.streamChat(
		{
			conversationId: "manual:send-file-tool-stream",
			message: "send the report",
		},
		(event) => {
			events.push(event as unknown as Record<string, unknown>);
		},
	);

	const expectedFiles = [
		{
			id: "file-tool-1",
			assetId: "file-tool-1",
			reference: "@asset[file-tool-1]",
			fileName: "report.png",
			mimeType: "image/png",
			sizeBytes: 8,
			downloadUrl: "/v1/files/file-tool-1",
		},
	];
	assert.deepEqual(result.files, expectedFiles);
	assert.deepEqual(events.find((event) => event.type === "done")?.files, expectedFiles);
});

test("getConversationState preserves files delivered by send_file tool results in canonical history", async () => {
	const store = await createStore();
	await store.set("manual:send-file-history", "E:/sessions/send-file-history.jsonl");
	const session = new FakeSession("E:/sessions/send-file-history.jsonl", []);
	session.messages.push(
		{
			role: "user",
			content: buildPromptWithAssetContext("send the report"),
			timestamp: Date.parse("2026-04-23T10:00:00.000Z"),
		} as never,
		{
			role: "assistant",
			content: [{ type: "text", text: "报告已经准备好了。" }],
			stopReason: "stop",
			timestamp: Date.parse("2026-04-23T10:00:05.000Z"),
		} as never,
		{
			role: "toolResult",
			toolCallId: "tool-send-file",
			toolName: "send_file",
			content: [{ type: "text", text: "File ready: report.md" }],
			details: {
				action: "send",
				file: {
					id: "file-tool-history-1",
					assetId: "file-tool-history-1",
					reference: "@asset[file-tool-history-1]",
					fileName: "report.md",
					mimeType: "text/markdown",
					sizeBytes: 128,
					downloadUrl: "/v1/files/file-tool-history-1",
				},
			},
			isError: false,
			timestamp: Date.parse("2026-04-23T10:00:06.000Z"),
		} as never,
	);
	const factory = new FakeAgentSessionFactory(() => session);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const state = await service.getConversationState("manual:send-file-history");
	const history = await service.getConversationHistory("manual:send-file-history");
	const assistantMessage = state.messages.find((message) => message.kind === "assistant");

	assert.deepEqual(assistantMessage?.files, [
		{
			fileName: "report.md",
			mimeType: "text/markdown",
			sizeBytes: 128,
			downloadUrl: "/v1/files/file-tool-history-1",
		},
	]);
	assert.deepEqual(history.messages, state.messages);
});

test("getConversationState preserves send_file results even when the tool output has no assistant text message", async () => {
	const store = await createStore();
	await store.set("manual:send-file-only-history", "E:/sessions/send-file-only-history.jsonl");
	const session = new FakeSession("E:/sessions/send-file-only-history.jsonl", []);
	session.messages.push(
		{
			role: "user",
			content: buildPromptWithAssetContext("send the generated csv"),
			timestamp: Date.parse("2026-04-23T11:00:00.000Z"),
		} as never,
		{
			role: "toolResult",
			toolCallId: "tool-send-file-only",
			toolName: "send_file",
			content: [{ type: "text", text: "File ready: report.csv" }],
			details: {
				action: "send",
				file: {
					id: "file-tool-history-2",
					assetId: "file-tool-history-2",
					reference: "@asset[file-tool-history-2]",
					fileName: "report.csv",
					mimeType: "text/csv",
					sizeBytes: 96,
					downloadUrl: "/v1/files/file-tool-history-2",
				},
			},
			isError: false,
			timestamp: Date.parse("2026-04-23T11:00:02.000Z"),
		} as never,
	);
	const factory = new FakeAgentSessionFactory(() => session);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const state = await service.getConversationState("manual:send-file-only-history");
	const assistantMessages = state.messages.filter((message) => message.kind === "assistant");

	assert.deepEqual(assistantMessages, [
		{
			id: "session-message-file-2",
			kind: "assistant",
			title: "助手",
			text: "",
			createdAt: "2026-04-23T11:00:02.000Z",
			files: [
				{
					fileName: "report.csv",
					mimeType: "text/csv",
					sizeBytes: 96,
					downloadUrl: "/v1/files/file-tool-history-2",
				},
			],
		},
	]);
});

test("chat can reference previously stored assets without re-uploading them", async () => {
	const store = await createStore();
	const session = new FakeSession("E:/sessions/reuse.jsonl", [textDelta("reused asset")]);
	const factory = new FakeAgentSessionFactory(() => session);
	const assetStore = new FakeAssetStore();
	assetStore.seedAsset(
		{
			assetId: "asset-existing",
			reference: "@asset[asset-existing]",
			fileName: "plan.md",
			mimeType: "text/markdown",
			sizeBytes: 12,
			kind: "text",
			hasContent: true,
			source: "user_upload",
			conversationId: "manual:seed",
			createdAt: "2026-04-18T00:00:00.000Z",
			textPreview: "hello plan",
			downloadUrl: "/v1/files/asset-existing",
		},
		"hello plan",
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory, assetStore });

	await service.chat({
		conversationId: "manual:reuse",
		message: "Reuse that plan",
		assetRefs: ["asset-existing"],
	});

	assert.match(session.prompts[0]?.message ?? "", /assetId: asset-existing/);
	assert.match(session.prompts[0]?.message ?? "", /reference: @asset\[asset-existing\]/);
	assert.match(session.prompts[0]?.message ?? "", /hello plan/);
});

test("queueMessage steers into the active session while a run is streaming", async () => {
	const store = await createStore();
	const activeSession = new DeferredSession("E:/sessions/active.jsonl");
	const factory = new FakeAgentSessionFactory(() => activeSession);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });
	const events: Array<Record<string, unknown>> = [];

	const run = service.streamChat(
		{
			conversationId: "manual:active",
			message: "start",
		},
		(event) => events.push(event as unknown as Record<string, unknown>),
	);
	await activeSession.promptStarted;

	const queued = await service.queueMessage({
		conversationId: "manual:active",
		message: "插嘴",
		mode: "steer",
	});

	assert.deepEqual(queued, {
		conversationId: "manual:active",
		mode: "steer",
		queued: true,
	});
	assert.equal(activeSession.prompts.length, 1);
	assert.equal(activeSession.steerCalls.length, 1);
	assert.match(activeSession.steerCalls[0] ?? "", /插嘴/);
	assert.deepEqual(activeSession.followUpCalls, []);

	activeSession.finish();
	await run;
	assert.equal(events.at(-1)?.type, "done");
});

test("queueMessage rejects browser changes during an active run", async () => {
	const store = await createStore();
	const activeSession = new DeferredSession("E:/sessions/active-browser.jsonl");
	const factory = new FakeAgentSessionFactory(() => activeSession);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const run = service.streamChat(
		{
			conversationId: "manual:active-browser",
			message: "start",
			browserId: "work-01",
		},
		() => undefined,
	);
	await activeSession.promptStarted;

	const queued = await service.queueMessage({
		conversationId: "manual:active-browser",
		message: "不要换窗口",
		mode: "steer",
		browserId: "work-02",
	});

	assert.deepEqual(queued, {
		conversationId: "manual:active-browser",
		mode: "steer",
		queued: false,
		reason: "browser_changed",
	});
	assert.deepEqual(activeSession.steerCalls, []);

	activeSession.finish();
	await run;
});

test("runChat passes browser scope and browserId into the session factory", async () => {
	const store = await createStore();
	const session = new FakeSession("E:/sessions/browser-context.jsonl", [], "ok");
	const factory = new FakeAgentSessionFactory(() => session);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	await service.chat({
		conversationId: "manual:browser-context",
		message: "用指定浏览器",
		browserId: "chrome-01",
	});

	assert.equal(factory.calls[0]?.conversationId, "manual:browser-context");
	assert.equal(factory.calls[0]?.browserScope, "manual-browser-context");
	assert.equal(factory.calls[0]?.browserId, "chrome-01");
});

test("runChat clears the scoped browser route after the run finishes", async () => {
	const originalFetch = globalThis.fetch;
	const originalRouteCachePath = process.env.UGK_BROWSER_SCOPE_ROUTE_CACHE_PATH;
	const routeCachePath = join(await mkdtemp(join(tmpdir(), "ugk-pi-chat-browser-routes-")), "routes.json");
	globalThis.fetch = (async () =>
		new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { "content-type": "application/json" },
		})) as typeof fetch;
	process.env.UGK_BROWSER_SCOPE_ROUTE_CACHE_PATH = routeCachePath;

	try {
		const store = await createStore();
		const session = new FakeSession("E:/sessions/browser-route-clear.jsonl", [], "ok");
		const factory = new FakeAgentSessionFactory(() => session);
		const service = new AgentService({ conversationStore: store, sessionFactory: factory });

		await service.chat({
			conversationId: "manual:browser-route-clear",
			message: "用指定浏览器",
			browserId: "chrome-01",
		});

		assert.equal(await readBrowserScopeRoute("manual-browser-route-clear", { cachePath: routeCachePath }), undefined);
	} finally {
		globalThis.fetch = originalFetch;
		if (originalRouteCachePath === undefined) {
			delete process.env.UGK_BROWSER_SCOPE_ROUTE_CACHE_PATH;
		} else {
			process.env.UGK_BROWSER_SCOPE_ROUTE_CACHE_PATH = originalRouteCachePath;
		}
	}
});

test("runChat writes the scoped browser route with the resolved CDP endpoint during the run", async () => {
	const originalFetch = globalThis.fetch;
	const originalRouteCachePath = process.env.UGK_BROWSER_SCOPE_ROUTE_CACHE_PATH;
	const originalInstances = process.env.UGK_BROWSER_INSTANCES_JSON;
	const routeCachePath = join(await mkdtemp(join(tmpdir(), "ugk-pi-chat-browser-route-endpoint-")), "routes.json");
	globalThis.fetch = (async () =>
		new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { "content-type": "application/json" },
		})) as typeof fetch;
	process.env.UGK_BROWSER_SCOPE_ROUTE_CACHE_PATH = routeCachePath;
	process.env.UGK_BROWSER_INSTANCES_JSON = JSON.stringify([
		{ browserId: "chrome-01", cdpHost: "172.31.250.11", cdpPort: 9223 },
		{ browserId: "chrome-02", cdpHost: "172.31.250.12", cdpPort: 9223 },
	]);

	try {
		const store = await createStore();
		const session = new RouteObservingSession(
			"E:/sessions/browser-route-endpoint.jsonl",
			[],
			"ok",
			routeCachePath,
			"manual-browser-route-endpoint",
		);
		const factory = new FakeAgentSessionFactory(() => session);
		const service = new AgentService({ conversationStore: store, sessionFactory: factory });

		await service.chat({
			conversationId: "manual:browser-route-endpoint",
			message: "用指定浏览器",
			browserId: "chrome-01",
		});

		const observedRoute = session.observedRoute as {
			browserId?: string;
			cdpHost?: string;
			cdpPort?: number;
			updatedAt?: string;
		};
		assert.deepEqual(observedRoute, {
			browserId: "chrome-01",
			cdpHost: "172.31.250.11",
			cdpPort: 9223,
			updatedAt: observedRoute.updatedAt,
		});
		assert.equal(typeof observedRoute.updatedAt, "string");
	} finally {
		globalThis.fetch = originalFetch;
		restoreEnvValue("UGK_BROWSER_SCOPE_ROUTE_CACHE_PATH", originalRouteCachePath);
		restoreEnvValue("UGK_BROWSER_INSTANCES_JSON", originalInstances);
	}
});

test("queueMessage can enqueue a follow-up after the active turn", async () => {
	const store = await createStore();
	const activeSession = new DeferredSession("E:/sessions/active-follow-up.jsonl");
	const factory = new FakeAgentSessionFactory(() => activeSession);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const run = service.streamChat(
		{
			conversationId: "manual:active-follow-up",
			message: "start",
		},
		() => undefined,
	);
	await activeSession.promptStarted;

	const queued = await service.queueMessage({
		conversationId: "manual:active-follow-up",
		message: "等会继续",
		mode: "followUp",
	});

	assert.equal(queued.queued, true);
	assert.equal(activeSession.prompts.length, 1);
	assert.deepEqual(activeSession.steerCalls, []);
	assert.equal(activeSession.followUpCalls.length, 1);
	assert.match(activeSession.followUpCalls[0] ?? "", /\[当前时间：[^\]]+\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/);
	assert.match(activeSession.followUpCalls[0] ?? "", /等会继续/);

	activeSession.finish();
	await run;
});

test("getRunStatus reports whether a conversation is actively streaming", async () => {
	const store = await createStore();
	const activeSession = new DeferredSession("E:/sessions/status.jsonl");
	activeSession.messages.push({
		role: "assistant",
		content: [{ type: "text", text: "已有上下文" }],
		usage: { totalTokens: 45231 },
		stopReason: "stop",
	} as never);
	const factory = new FakeAgentSessionFactory(() => activeSession);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const run = service.streamChat(
		{
			conversationId: "manual:status",
			message: "start",
		},
		() => undefined,
	);
	await activeSession.promptStarted;

	assert.deepEqual(await service.getRunStatus("manual:status"), {
		conversationId: "manual:status",
		running: true,
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
			mode: "usage",
		},
	});

	activeSession.finish();
	await run;

	assert.deepEqual(await service.getRunStatus("manual:status"), {
		conversationId: "manual:status",
		running: false,
		contextUsage: {
			provider: "zhipu-glm",
			model: "glm-5.1",
			currentTokens: 45236,
			contextWindow: 128000,
			reserveTokens: 16384,
			maxResponseTokens: 16384,
			availableTokens: 66380,
			percent: 35,
			status: "safe",
			mode: "usage",
		},
	});
});

test("idle conversation reads status, history, and state from persisted messages without opening an agent session", async () => {
	const store = await createStore();
	const sessionFile = "E:/sessions/historic.jsonl";
	await store.set("manual:historic", sessionFile, {
		title: "Historic thread",
		preview: "Persisted answer",
		messageCount: 2,
	});
	const factory = new FakeAgentSessionFactory(() => {
		throw new Error("idle history reads must not create an agent session");
	});
	factory.persistedMessages.set(sessionFile, [
		{
			role: "user",
			content: buildPromptWithAssetContext("previous question"),
			timestamp: "2026-04-24T01:00:00.000Z",
		} as never,
		{
			role: "assistant",
			content: [{ type: "text", text: "Persisted answer" }],
			stopReason: "stop",
			timestamp: "2026-04-24T01:00:05.000Z",
			usage: { totalTokens: 2048 },
		} as never,
	]);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const status = await service.getRunStatus("manual:historic");
	const history = await service.getConversationHistory("manual:historic");
	const state = await service.getConversationState("manual:historic");

	assert.deepEqual(factory.calls, []);
	assert.deepEqual(factory.readCalls, [sessionFile, sessionFile, sessionFile]);
	assert.equal(status.running, false);
	assert.equal(status.contextUsage.currentTokens, 2048);
	assert.deepEqual(
		history.messages.map((message) => ({ kind: message.kind, text: message.text })),
		[
			{ kind: "user", text: "previous question" },
			{ kind: "assistant", text: "Persisted answer" },
		],
	);
	assert.equal(state.running, false);
	assert.equal(state.activeRun, null);
	assert.deepEqual(
		state.viewMessages.map((message) => ({ kind: message.kind, text: message.text })),
		[
			{ kind: "user", text: "previous question" },
			{ kind: "assistant", text: "Persisted answer" },
		],
	);
});

test("getConversationState returns a bounded recent history page by default", async () => {
	const store = await createStore();
	const sessionFile = "E:/sessions/long-state.jsonl";
	await store.set("manual:long-state", sessionFile, {
		title: "Long state",
		preview: "message 200",
		messageCount: 200,
	});
	const factory = new FakeAgentSessionFactory(() => {
		throw new Error("idle state reads must not create an agent session");
	});
	factory.persistedMessages.set(
		sessionFile,
		Array.from({ length: 200 }, (_, index) => ({
			role: "user",
			content: [{ type: "text", text: `message ${index + 1}` }],
			timestamp: Date.parse(`2026-04-24T00:${String(index % 60).padStart(2, "0")}:00.000Z`),
		})),
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const state = await service.getConversationState("manual:long-state");

	assert.deepEqual(factory.calls, []);
	assert.equal(state.messages.length, 160);
	assert.equal(state.viewMessages.length, 160);
	assert.equal(state.messages[0]?.id, "session-message-41");
	assert.equal(state.messages[0]?.text, "message 41");
	assert.equal(state.messages.at(-1)?.text, "message 200");
	assert.deepEqual(state.historyPage, {
		hasMore: true,
		nextBefore: "session-message-41",
		limit: 160,
	});
});

test("getConversationState can hydrate an idle conversation from a recent session window", async () => {
	const store = await createStore();
	const sessionFile = "E:/sessions/recent-state.jsonl";
	await store.set("manual:recent-state", sessionFile, {
		title: "Recent state",
		preview: "message 200",
		messageCount: 200,
	});
	const factory = new FakeAgentSessionFactory(() => {
		throw new Error("recent state reads must not create an agent session");
	});
	factory.recentMessages.set(sessionFile, {
		messages: [
			{
				role: "user",
				content: [{ type: "text", text: "message 199" }],
				timestamp: "2026-04-24T01:00:01.000Z",
			} as never,
			{
				role: "assistant",
				content: [{ type: "text", text: "message 200" }],
				timestamp: "2026-04-24T01:00:02.000Z",
			} as never,
		],
		contextMessages: [
			{
				role: "assistant",
				content: [{ type: "text", text: "usage anchor" }],
				stopReason: "stop",
				usage: { totalTokens: 8192 },
				timestamp: "2026-04-24T01:00:00.000Z",
			} as never,
			{
				role: "user",
				content: [{ type: "text", text: "message 199" }],
				timestamp: "2026-04-24T01:00:01.000Z",
			} as never,
			{
				role: "assistant",
				content: [{ type: "text", text: "message 200" }],
				timestamp: "2026-04-24T01:00:02.000Z",
			} as never,
		],
		messageIndexOffset: 198,
		reachedStart: false,
	});
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const state = await service.getConversationState("manual:recent-state", { viewLimit: 2 });

	assert.deepEqual(factory.calls, []);
	assert.deepEqual(factory.readCalls, []);
	assert.deepEqual(factory.readRecentCalls, [
		{
			sessionFile,
			input: {
				limit: 2,
				includeContextUsageAnchor: true,
			},
		},
	]);
	assert.equal(state.contextUsage.mode, "usage");
	assert.equal(state.contextUsage.currentTokens, 8198);
	assert.deepEqual(
		state.messages.map((message) => ({ id: message.id, kind: message.kind, text: message.text })),
		[
			{ id: "session-message-199", kind: "user", text: "message 199" },
			{ id: "session-message-200", kind: "assistant", text: "message 200" },
		],
	);
	assert.deepEqual(state.historyPage, {
		hasMore: true,
		nextBefore: "session-message-199",
		limit: 2,
	});
});

test("getConversationHistory returns paged history before a message cursor", async () => {
	const store = await createStore();
	const sessionFile = "E:/sessions/paged-history.jsonl";
	await store.set("manual:paged-history", sessionFile);
	const factory = new FakeAgentSessionFactory(() => {
		throw new Error("paged history reads must not create an agent session");
	});
	factory.persistedMessages.set(
		sessionFile,
		Array.from({ length: 10 }, (_, index) => ({
			role: "user",
			content: [{ type: "text", text: `history ${index + 1}` }],
			timestamp: Date.parse(`2026-04-24T01:00:${String(index).padStart(2, "0")}.000Z`),
		})),
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const newestPage = await service.getConversationHistory("manual:paged-history", { limit: 3 });
	const previousPage = await service.getConversationHistory("manual:paged-history", {
		limit: 3,
		before: newestPage.nextBefore,
	});

	assert.deepEqual(
		newestPage.messages.map((message) => message.text),
		["history 8", "history 9", "history 10"],
	);
	assert.deepEqual(newestPage.hasMore, true);
	assert.equal(newestPage.nextBefore, "session-message-8");
	assert.deepEqual(
		previousPage.messages.map((message) => message.text),
		["history 5", "history 6", "history 7"],
	);
	assert.deepEqual(previousPage.hasMore, true);
	assert.equal(previousPage.nextBefore, "session-message-5");
});

test("getConversationState exposes the active run snapshot for refresh observers", async () => {
	const store = await createStore();
	const activeSession = new DeferredSession("E:/sessions/state.jsonl");
	activeSession.messages.push(
		{
			role: "user",
			content: buildPromptWithAssetContext("previous user"),
		} as never,
		{
			role: "assistant",
			content: [{ type: "text", text: "previous assistant" }],
			stopReason: "stop",
		},
	);
	const factory = new FakeAgentSessionFactory(() => activeSession);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const run = service.streamChat(
		{
			conversationId: "manual:state",
			message: "current task",
		},
		() => undefined,
	);
	await activeSession.promptStarted;
	activeSession.emit({
		type: "tool_execution_start",
		toolCallId: "tool-state",
		toolName: "bash",
		args: { command: "echo state" },
	});
	activeSession.emit(textDelta("partial answer"));
	activeSession.emit({
		type: "queue_update",
		steering: ["queued steer"],
		followUp: ["queued follow-up"],
	});

	const state = await (
		service as AgentService & {
			getConversationState(conversationId: string): Promise<Record<string, unknown>>;
		}
	).getConversationState("manual:state");

	assert.equal(state.conversationId, "manual:state");
	assert.equal(state.running, true);
	assert.deepEqual(
		state.messages.map((message) => ({
			kind: message.kind,
			text: message.text,
		})),
		[
			{ kind: "user", text: "previous user" },
			{ kind: "assistant", text: "previous assistant" },
		],
	);
	assert.deepEqual(
		state.viewMessages.map((message) => ({
			kind: message.kind,
			text: message.text,
		})),
		[
			{ kind: "user", text: "previous user" },
			{ kind: "assistant", text: "previous assistant" },
			{ kind: "user", text: "current task" },
			{ kind: "assistant", text: "partial answer" },
		],
	);
	assert.ok(state.activeRun);
	const activeRun = state.activeRun;
	assert.equal(activeRun.status, "running");
	assert.equal(activeRun.text, "partial answer");
	assert.equal(activeRun.eventCursor, 4);
	assert.deepEqual(activeRun.input, {
		message: "current task",
		inputAssets: [],
	});
	assert.deepEqual(activeRun.queue, {
		steering: ["queued steer"],
		followUp: ["queued follow-up"],
	});
	assert.match(
		activeRun.assistantMessageId,
		/^active-run-manual-state-/,
	);
	assert.equal(state.viewMessages.at(-1)?.id, activeRun.assistantMessageId);
	assert.ok(activeRun.process);
	const process = activeRun.process;
	assert.equal(process.isComplete, false);
	assert.equal(process.currentAction, "工具开始 · bash");
	assert.equal(
		process.entries.find((entry) => entry.toolName === "bash")?.toolName,
		"bash",
	);

	activeSession.finish();
	await run;
	const finishedState = await (
		service as AgentService & {
			getConversationState(conversationId: string): Promise<Record<string, unknown>>;
		}
	).getConversationState("manual:state");
	assert.equal(finishedState.running, false);
	assert.equal(finishedState.activeRun?.status, "done");
	assert.equal(finishedState.activeRun?.loading, false);
	assert.equal(finishedState.activeRun?.text, "partial answer");
});

test("getConversationState keeps in-flight persisted run tail out of canonical history", async () => {
	const store = await createStore();
	const activeSession = new DeferredSession("E:/sessions/state-in-flight-tail.jsonl");
	activeSession.messages.push(
		{
			role: "user",
			content: buildPromptWithAssetContext("previous user"),
		} as never,
		{
			role: "assistant",
			content: [{ type: "text", text: "previous assistant" }],
			stopReason: "stop",
		} as never,
	);
	const factory = new FakeAgentSessionFactory(() => activeSession);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const run = service.streamChat(
		{
			conversationId: "manual:state-in-flight-tail",
			message: "current task",
		},
		() => undefined,
	);
	await activeSession.promptStarted;
	activeSession.messages.push(
		{
			role: "user",
			content: buildPromptWithAssetContext("current task"),
		} as never,
		{
			role: "assistant",
			content: [{ type: "text", text: "partial answer" }],
			stopReason: "stop",
		} as never,
	);
	activeSession.emit(textDelta("partial answer"));

	const state = await service.getConversationState("manual:state-in-flight-tail");

	assert.equal(state.running, true);
	assert.deepEqual(
		state.messages.map((message) => ({
			kind: message.kind,
			text: message.text,
		})),
		[
			{ kind: "user", text: "previous user" },
			{ kind: "assistant", text: "previous assistant" },
		],
	);
	assert.deepEqual(
		state.viewMessages.map((message) => ({
			kind: message.kind,
			text: message.text,
		})),
		[
			{ kind: "user", text: "previous user" },
			{ kind: "assistant", text: "previous assistant" },
			{ kind: "user", text: "current task" },
			{ kind: "assistant", text: "partial answer" },
		],
	);

	activeSession.finish();
	await run;
});

test("getConversationState hides the current active input from persisted history so repeated prompts still render on observer pages", async () => {
	const store = await createStore();
	const activeSession = new DeferredSession("E:/sessions/repeat.jsonl");
	activeSession.messages.push(
		{
			role: "user",
			content: buildPromptWithAssetContext("继续"),
		} as never,
		{
			role: "assistant",
			content: [{ type: "text", text: "上一轮回复" }],
			stopReason: "stop",
		} as never,
		{
			role: "user",
			content: buildPromptWithAssetContext("继续"),
		} as never,
	);
	const factory = new FakeAgentSessionFactory(() => activeSession);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const run = service.streamChat(
		{
			conversationId: "manual:repeat",
			message: "继续",
		},
		() => undefined,
	);
	await activeSession.promptStarted;

	const state = await (
		service as AgentService & {
			getConversationState(conversationId: string): Promise<ConversationStateResponseBody>;
		}
	).getConversationState("manual:repeat");

	assert.equal(state.running, true);
	assert.deepEqual(
		state.messages.map((message) => ({
			kind: message.kind,
			text: message.text,
		})),
		[
			{ kind: "user", text: "继续" },
			{ kind: "assistant", text: "上一轮回复" },
		],
	);
	assert.equal(state.activeRun?.input?.message, "继续");
	assert.deepEqual(
		state.viewMessages.slice(-2).map((message) => ({
			kind: message.kind,
			text: message.text,
		})),
		[
			{ kind: "user", text: "继续" },
			{ kind: "assistant", text: "" },
		],
	);

	activeSession.finish();
	await run;
});

test("getConversationState returns deduplicated viewMessages when terminal activeRun overlaps persisted history", async () => {
	const store = await createStore();
	const session = new TerminalOverlapSession("E:/sessions/view-overlap.jsonl", "current task", "final answer");
	const factory = new FakeAgentSessionFactory(() => session);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });
	let resolveDoneState: (state: ConversationStateResponseBody) => void = () => undefined;
	const doneStatePromise = new Promise<ConversationStateResponseBody>((resolve) => {
		resolveDoneState = resolve;
	});

	const run = service.streamChat(
		{
			conversationId: "manual:view-overlap",
			message: "current task",
		},
		(event) => {
			if (event.type === "done") {
				void (
					service as AgentService & {
						getConversationState(conversationId: string): Promise<ConversationStateResponseBody>;
					}
				)
					.getConversationState("manual:view-overlap")
					.then(resolveDoneState);
			}
		},
	);
	await session.promptStarted;
	session.emit(textDelta("final answer"));
	session.finish();

	const state = await doneStatePromise;
	await run;
	assert.ok(state);
	assert.equal(state.activeRun?.status, "done");
	assert.deepEqual(
		state.messages.map((message) => ({
			kind: message.kind,
			text: message.text,
		})),
		[
			{ kind: "user", text: "current task" },
			{ kind: "assistant", text: "final answer" },
		],
	);
	assert.deepEqual(
		state.viewMessages.map((message) => ({
			kind: message.kind,
			text: message.text,
		})),
		[
			{ kind: "user", text: "current task" },
			{ kind: "assistant", text: "final answer" },
		],
	);
});

test("getConversationState deduplicates terminal turns by turn coverage instead of brittle assistant text spacing", async () => {
	const store = await createStore();
	const streamedAssistantText = [
		"我来帮你获取知乎热榜 top 3。需要使用 web-access 技能来访问知乎。",
		"浏览器已就绪。现在访问知乎热榜并提取 top 3。",
		"已获取到知乎热榜 top 3。关闭标签页：## 知乎热榜 Top 3（2026-04-24）",
	].join("");
	const persistedAssistantText = [
		"我来帮你获取知乎热榜 top 3。需要使用 web-access 技能来访问知乎。",
		"",
		"浏览器已就绪。现在访问知乎热榜并提取 top 3。",
		"",
		"已获取到知乎热榜 top 3。关闭标签页：",
		"",
		"## 知乎热榜 Top 3（2026-04-24）",
	].join("\n\n");
	const session = new TerminalOverlapSession(
		"E:/sessions/view-overlap-spacing.jsonl",
		"知乎热榜top3",
		persistedAssistantText,
	);
	const factory = new FakeAgentSessionFactory(() => session);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });
	let resolveDoneState: (state: ConversationStateResponseBody) => void = () => undefined;
	const doneStatePromise = new Promise<ConversationStateResponseBody>((resolve) => {
		resolveDoneState = resolve;
	});

	const run = service.streamChat(
		{
			conversationId: "manual:view-overlap-spacing",
			message: "知乎热榜top3",
		},
		(event) => {
			if (event.type === "done") {
				void (
					service as AgentService & {
						getConversationState(conversationId: string): Promise<ConversationStateResponseBody>;
					}
				)
					.getConversationState("manual:view-overlap-spacing")
					.then(resolveDoneState);
			}
		},
	);
	await session.promptStarted;
	session.emit(textDelta(streamedAssistantText));
	session.finish();

	const state = await doneStatePromise;
	await run;
	assert.equal(state.activeRun?.status, "done");
	assert.deepEqual(
		state.viewMessages.map((message) => ({
			kind: message.kind,
			text: message.text,
			runId: "runId" in message ? message.runId : undefined,
		})),
		[
			{ kind: "user", text: "知乎热榜top3", runId: undefined },
			{
				kind: "assistant",
				text: persistedAssistantText,
				runId: state.activeRun?.runId,
			},
		],
	);
});

test("getConversationState keeps repeated terminal input visible when the current turn is not persisted yet", async () => {
	const store = await createStore();
	const session = new TerminalNoPersistSession("E:/sessions/repeated-terminal.jsonl");
	session.messages.push(
		{
			role: "user",
			content: buildPromptWithAssetContext("continue"),
		} as never,
		{
			role: "assistant",
			content: [{ type: "text", text: "previous answer" }],
			stopReason: "stop",
		} as never,
	);
	const factory = new FakeAgentSessionFactory(() => session);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });
	let resolveDoneState: (state: ConversationStateResponseBody) => void = () => undefined;
	const doneStatePromise = new Promise<ConversationStateResponseBody>((resolve) => {
		resolveDoneState = resolve;
	});

	const run = service.streamChat(
		{
			conversationId: "manual:repeated-terminal",
			message: "continue",
		},
		(event) => {
			if (event.type === "done") {
				void service.getConversationState("manual:repeated-terminal").then(resolveDoneState);
			}
		},
	);
	await session.promptStarted;
	session.emit(textDelta("fresh answer"));
	session.finish();

	const state = await doneStatePromise;
	await run;
	assert.equal(state.activeRun?.status, "done");
	assert.deepEqual(
		state.messages.map((message) => ({
			kind: message.kind,
			text: message.text,
		})),
		[
			{ kind: "user", text: "continue" },
			{ kind: "assistant", text: "previous answer" },
		],
	);
	assert.deepEqual(
		state.viewMessages.map((message) => ({
			kind: message.kind,
			text: message.text,
		})),
		[
			{ kind: "user", text: "continue" },
			{ kind: "assistant", text: "previous answer" },
			{ kind: "user", text: "continue" },
			{ kind: "assistant", text: "fresh answer" },
		],
	);
});

test("getConversationState coalesces consecutive assistant messages from one completed turn", async () => {
	const store = await createStore();
	await store.set("manual:coalesced", "E:/sessions/coalesced.jsonl");
	const session = new FakeSession("E:/sessions/coalesced.jsonl", []);
	session.messages.push(
		{
			role: "user",
			content: buildPromptWithAssetContext("find a price"),
		} as never,
		{
			role: "assistant",
			content: [{ type: "text", text: "I will check the browser." }],
			stopReason: "stop",
		} as never,
		{
			role: "assistant",
			content: [{ type: "text", text: "The first site needs login." }],
			stopReason: "stop",
		} as never,
		{
			role: "assistant",
			content: [{ type: "text", text: "Here is the final answer." }],
			stopReason: "stop",
		} as never,
	);
	const factory = new FakeAgentSessionFactory(() => session);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const state = await (
		service as AgentService & {
			getConversationState(conversationId: string): Promise<Record<string, unknown>>;
		}
	).getConversationState("manual:coalesced");
	const history = await service.getConversationHistory("manual:coalesced");

	assert.deepEqual(
		state.messages.map((message) => ({
			kind: message.kind,
			text: message.text,
		})),
		[
			{ kind: "user", text: "find a price" },
			{
				kind: "assistant",
				text: [
					"I will check the browser.",
					"The first site needs login.",
					"Here is the final answer.",
				].join("\n\n"),
			},
		],
	);
	assert.deepEqual(history.messages, state.messages);
});

test("getConversationState keeps background task results out of the conversation transcript", async () => {
	const store = await createStore();
	await store.set("manual:notifications", "E:/sessions/notifications.jsonl");
	const session = new FakeSession("E:/sessions/notifications.jsonl", []);
	session.messages.push(
		{
			role: "user",
			content: buildPromptWithAssetContext("original prompt"),
		} as never,
		{
			role: "assistant",
			content: [{ type: "text", text: "foreground answer" }],
		} as never,
	);
	const factory = new FakeAgentSessionFactory(() => session);
	const service = new AgentService({
		conversationStore: store,
		sessionFactory: factory,
	});

	const state = await service.getConversationState("manual:notifications");
	const history = await service.getConversationHistory("manual:notifications");

	assert.deepEqual(
		state.messages.map((message) => ({
			id: message.id,
			kind: message.kind,
			title: message.title,
			text: message.text,
			source: "source" in message ? message.source : undefined,
			sourceId: "sourceId" in message ? message.sourceId : undefined,
			runId: "runId" in message ? message.runId : undefined,
			files: message.files,
		})),
		[
			{
				id: "session-message-1",
				kind: "user",
				title: "agent:global",
				text: "original prompt",
				source: undefined,
				sourceId: undefined,
				runId: undefined,
				files: undefined,
			},
			{
				id: "session-message-2",
				kind: "assistant",
				title: "助手",
				text: "foreground answer",
				source: undefined,
				sourceId: undefined,
				runId: undefined,
				files: undefined,
			},
		],
	);
	assert.deepEqual(history.messages, state.messages);
});

test("getConversationHistory returns the original user text without internal prompt protocols", async () => {
	const store = await createStore();
	await store.set("manual:history-clean", "E:/sessions/history-clean.jsonl");
	const session = new FakeSession("E:/sessions/history-clean.jsonl", [], "讨论的是第一条热点");
	session.messages.push(
		{
			role: "user",
			content: buildPromptWithAssetContext("帮我查询一下第一条大家都在讨论什么"),
		} as never,
		{
			role: "assistant",
			content: [{ type: "text", text: "讨论的是第一条热点" }],
			stopReason: "stop",
		},
	);
	const factory = new FakeAgentSessionFactory(() => session);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const history = await service.getConversationHistory("manual:history-clean");

	assert.deepEqual(history.messages[0], {
		id: "session-message-1",
		kind: "user",
		title: "agent:global",
		text: "帮我查询一下第一条大家都在讨论什么",
		createdAt: new Date(0).toISOString(),
	});
	assert.equal(history.messages[1]?.text, "讨论的是第一条热点");
assert.equal(history.messages.some((message) => message.text.includes("<asset_reference_protocol>")), false);
assert.equal(history.messages.some((message) => message.text.includes("<file_response_protocol>")), false);
});

test("getConversationHistory preserves session message timestamps when available", async () => {
	const store = await createStore();
	await store.set("manual:history-timestamps", "E:/sessions/history-timestamps.jsonl");
	const session = new FakeSession("E:/sessions/history-timestamps.jsonl", []);
	session.messages.push(
		{
			role: "user",
			content: [{ type: "text", text: "first prompt" }],
			timestamp: Date.parse("2026-04-22T14:08:07.000Z"),
		} as never,
		{
			role: "assistant",
			content: [{ type: "text", text: "first answer" }],
			stopReason: "stop",
			timestamp: Date.parse("2026-04-22T14:08:10.000Z"),
		} as never,
	);
	const factory = new FakeAgentSessionFactory(() => session);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const history = await service.getConversationHistory("manual:history-timestamps");

	assert.equal(history.messages[0]?.createdAt, "2026-04-22T14:08:07.000Z");
	assert.equal(history.messages[1]?.createdAt, "2026-04-22T14:08:10.000Z");
});

test("resetConversation clears the persisted conversation state when no run is active", async () => {
	const store = await createStore();
	await store.set("agent:global", "E:/sessions/reset-source.jsonl");
	const existingSession = new FakeSession("E:/sessions/reset-source.jsonl", []);
	existingSession.messages.push(
		{
			role: "user",
			content: [{ type: "text", text: "old prompt" }],
		} as never,
		{
			role: "assistant",
			content: [{ type: "text", text: "old answer" }],
			stopReason: "stop",
		},
	);
	const factory = new FakeAgentSessionFactory(() => existingSession);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const reset = await service.resetConversation({
		conversationId: "agent:global",
	});

	assert.deepEqual(reset, {
		conversationId: "agent:global",
		reset: true,
	});
	assert.equal(await store.get("agent:global"), undefined);

	const state = await service.getConversationState("agent:global");
	assert.equal(state.running, false);
	assert.equal(state.activeRun, null);
	assert.deepEqual(state.messages, []);
});

test("createConversation creates and activates a new empty conversation when idle", async () => {
	const store = await createStore();
	const factory = new FakeAgentSessionFactory(() => new FakeSession(undefined, []));
	const service = new AgentService({ conversationStore: store, sessionFactory: factory }) as AgentService & {
		createConversation(): Promise<{ conversationId: string; currentConversationId: string; created: boolean; reason?: string }>;
		getConversationCatalog(): Promise<{ currentConversationId: string; conversations: Array<{ conversationId: string }> }>;
	};

	const result = await service.createConversation();

	assert.equal(result.created, true);
	assert.equal(result.conversationId, result.currentConversationId);
	assert.match(result.conversationId, /^manual:/);
	assert.equal(await store.getCurrentConversationId(), result.conversationId);
	const catalog = await service.getConversationCatalog();
	assert.equal(catalog.currentConversationId, result.conversationId);
	assert.equal(catalog.conversations[0]?.conversationId, result.conversationId);
});

test("switchConversation activates an existing conversation when idle", async () => {
	const store = await createStore();
	await store.set("manual:older", "E:/sessions/older.jsonl");
	await store.set("manual:newer", "E:/sessions/newer.jsonl");
	await store.setCurrentConversationId("manual:newer");
	const factory = new FakeAgentSessionFactory(() => new FakeSession(undefined, []));
	const service = new AgentService({ conversationStore: store, sessionFactory: factory }) as AgentService & {
		switchConversation(conversationId: string): Promise<{
			conversationId: string;
			currentConversationId: string;
			switched: boolean;
			reason?: string;
		}>;
	};

	const result = await service.switchConversation("manual:older");

	assert.deepEqual(result, {
		conversationId: "manual:older",
		currentConversationId: "manual:older",
		switched: true,
	});
	assert.equal(await store.getCurrentConversationId(), "manual:older");
});

test("getConversationCatalog leaves background task notifications out of ordering and preview", async () => {
	const store = await createStore();
	await store.set("manual:older", "E:/sessions/older.jsonl", {
		title: "older",
		preview: "older preview",
		messageCount: 2,
	});
	await store.set("manual:newer", "E:/sessions/newer.jsonl", {
		title: "newer",
		preview: "foreground preview",
		messageCount: 1,
	});
	await store.setCurrentConversationId("manual:newer");
	const factory = new FakeAgentSessionFactory(() => new FakeSession(undefined, []));
	const service = new AgentService({
		conversationStore: store,
		sessionFactory: factory,
	}) as AgentService & {
		getConversationCatalog(): Promise<{
			currentConversationId: string;
			conversations: Array<{
				conversationId: string;
				preview: string;
				messageCount: number;
				updatedAt: string;
			}>;
		}>;
	};

	const catalog = await service.getConversationCatalog();
	const newerConversation = catalog.conversations.find((conversation) => conversation.conversationId === "manual:newer");
	const olderConversation = catalog.conversations.find((conversation) => conversation.conversationId === "manual:older");

	assert.equal(catalog.currentConversationId, "manual:newer");
	assert.deepEqual(
		catalog.conversations.map((conversation) => conversation.conversationId).sort(),
		["manual:newer", "manual:older"].sort(),
	);
	assert.equal(newerConversation?.preview, "foreground preview");
	assert.equal(newerConversation?.messageCount, 1);
	assert.equal(olderConversation?.preview, "older preview");
	assert.equal(olderConversation?.messageCount, 2);
});

test("deleteConversation leaves background task notification storage untouched", async () => {
	const store = await createStore();
	await store.set("manual:older", "E:/sessions/older.jsonl");
	await store.set("manual:newer", "E:/sessions/newer.jsonl");
	await store.setCurrentConversationId("manual:newer");
	const factory = new FakeAgentSessionFactory(() => new FakeSession(undefined, []));
	const service = new AgentService({
		conversationStore: store,
		sessionFactory: factory,
	}) as AgentService & {
		deleteConversation(conversationId: string): Promise<{
			conversationId: string;
			currentConversationId: string;
			deleted: boolean;
			reason?: string;
		}>;
	};

	const result = await service.deleteConversation("manual:newer");

	assert.deepEqual(result, {
		conversationId: "manual:newer",
		currentConversationId: "manual:older",
		deleted: true,
	});
	assert.equal(await store.get("manual:newer"), undefined);
	assert.equal(await store.getCurrentConversationId(), "manual:older");
});

test("createConversation refuses to switch lines while any run is active", async () => {
	const store = await createStore();
	await store.setCurrentConversationId("manual:busy");
	const activeSession = new DeferredSession("E:/sessions/busy.jsonl");
	const factory = new FakeAgentSessionFactory(() => activeSession);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory }) as AgentService & {
		createConversation(): Promise<{ conversationId: string; currentConversationId: string; created: boolean; reason?: string }>;
	};

	const run = service.streamChat(
		{
			conversationId: "manual:busy",
			message: "start",
		},
		() => undefined,
	);
	await activeSession.promptStarted;

	const result = await service.createConversation();

	assert.deepEqual(result, {
		conversationId: "manual:busy",
		currentConversationId: "manual:busy",
		created: false,
		reason: "running",
	});

	activeSession.finish();
	await run;
});

test("streamChat blocks starting another conversation while one line is already running", async () => {
	const store = await createStore();
	const activeSession = new DeferredSession("E:/sessions/line-1.jsonl");
	const factory = new FakeAgentSessionFactory(() => activeSession);
	const service = new AgentService({ agentId: "main", conversationStore: store, sessionFactory: factory });

	const run = service.streamChat(
		{
			conversationId: "manual:line-1",
			message: "start",
		},
		() => undefined,
	);
	await activeSession.promptStarted;

	await assert.rejects(
		() =>
			service.streamChat(
				{
					conversationId: "manual:line-2",
					message: "should wait",
				},
				() => undefined,
			),
		(error: unknown) =>
			error instanceof AgentBusyError &&
			error.agentId === "main" &&
			error.activeConversationId === "manual:line-1",
	);

	activeSession.finish();
	await run;
});

test("getAgentRunStatus reports idle and busy agent state", async () => {
	const store = await createStore();
	const activeSession = new DeferredSession("E:/sessions/agent-status.jsonl");
	const factory = new FakeAgentSessionFactory(() => activeSession);
	const service = new AgentService({ agentId: "search", conversationStore: store, sessionFactory: factory });

	assert.deepEqual(service.getAgentRunStatus(), {
		agentId: "search",
		status: "idle",
	});

	const run = service.streamChat(
		{
			conversationId: "manual:agent-status",
			message: "start",
		},
		() => undefined,
	);
	await activeSession.promptStarted;

	const status = service.getAgentRunStatus();
	assert.equal(status.agentId, "search");
	assert.equal(status.status, "busy");
	if (status.status === "busy") {
		assert.equal(status.activeConversationId, "manual:agent-status");
		assert.match(status.activeSince, /^\d{4}-\d{2}-\d{2}T/);
	}

	activeSession.finish();
	await run;
	assert.deepEqual(service.getAgentRunStatus(), {
		agentId: "search",
		status: "idle",
	});
});

test("subscribeRunEvents replays buffered events and keeps streaming live active run updates", async () => {
	const store = await createStore();
	const activeSession = new DeferredSession("E:/sessions/reattach.jsonl");
	const factory = new FakeAgentSessionFactory(() => activeSession);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });
	const originalEvents: Array<Record<string, unknown>> = [];
	const reattachedEvents: Array<Record<string, unknown>> = [];

	const run = service.streamChat(
		{
			conversationId: "manual:reattach",
			message: "start",
		},
		(event) => {
			originalEvents.push(event as unknown as Record<string, unknown>);
		},
	);
	await activeSession.promptStarted;

	const subscription = service.subscribeRunEvents("manual:reattach", (event) => {
		reattachedEvents.push(event as unknown as Record<string, unknown>);
	});

	assert.equal(subscription.running, true);
	assert.equal(reattachedEvents[0]?.type, "run_started");
	assert.equal(reattachedEvents[0]?.conversationId, "manual:reattach");
	assert.equal(typeof reattachedEvents[0]?.runId, "string");

	activeSession.emit(textDelta("after refresh"));
	assert.deepEqual(reattachedEvents.at(-1), {
		type: "text_delta",
		textDelta: "after refresh",
	});
	assert.deepEqual(originalEvents.at(-1), {
		type: "text_delta",
		textDelta: "after refresh",
	});

	subscription.unsubscribe();
	activeSession.emit(textDelta("after unsubscribe"));
	assert.equal(
		reattachedEvents.some((event) => event.textDelta === "after unsubscribe"),
		false,
	);

	activeSession.finish();
	await run;
});

test("subscribeRunEvents can resume after a rendered active run cursor without replaying covered text", async () => {
	const store = await createStore();
	const activeSession = new DeferredSession("E:/sessions/reattach-cursor.jsonl");
	const factory = new FakeAgentSessionFactory(() => activeSession);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const run = service.streamChat(
		{
			conversationId: "manual:reattach-cursor",
			message: "start",
		},
		() => undefined,
	);
	await activeSession.promptStarted;
	activeSession.emit(textDelta("already rendered"));

	const state = await service.getConversationState("manual:reattach-cursor");
	const afterEventCursor = state.activeRun?.eventCursor;
	assert.equal(afterEventCursor, 2);

	const reattachedEvents: ChatStreamEvent[] = [];
	const subscription = service.subscribeRunEvents(
		"manual:reattach-cursor",
		(event) => {
			reattachedEvents.push(event);
		},
		{ afterEventCursor },
	);

	assert.equal(subscription.running, true);
	assert.deepEqual(reattachedEvents, []);

	activeSession.emit(textDelta(" live only"));
	assert.deepEqual(reattachedEvents, [
		{
			type: "text_delta",
			textDelta: " live only",
		},
	]);

	subscription.unsubscribe();
	activeSession.finish();
	await run;
});

test("queueMessage uses explicit steer API instead of prompt(streamingBehavior)", async () => {
	const store = await createStore();
	const activeSession = new StrictQueueSession("E:/sessions/strict-steer.jsonl");
	const factory = new FakeAgentSessionFactory(() => activeSession);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const run = service.streamChat(
		{
			conversationId: "manual:strict-steer",
			message: "start",
		},
		() => undefined,
	);
	await activeSession.promptStarted;

	await assert.doesNotReject(() =>
		service.queueMessage({
			conversationId: "manual:strict-steer",
			message: "steer now",
			mode: "steer",
		}),
	);
	assert.equal(activeSession.steerCalls.length, 1);
	assert.match(activeSession.steerCalls[0] ?? "", /\[当前时间：[^\]]+\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/);
	assert.match(activeSession.steerCalls[0] ?? "", /steer now/);
	assert.deepEqual(activeSession.followUpCalls, []);

	activeSession.finish();
	await run;
});

test("queueMessage uses explicit followUp API instead of prompt(streamingBehavior)", async () => {
	const store = await createStore();
	const activeSession = new StrictQueueSession("E:/sessions/strict-follow-up.jsonl");
	const factory = new FakeAgentSessionFactory(() => activeSession);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const run = service.streamChat(
		{
			conversationId: "manual:strict-follow-up",
			message: "start",
		},
		() => undefined,
	);
	await activeSession.promptStarted;

	await assert.doesNotReject(() =>
		service.queueMessage({
			conversationId: "manual:strict-follow-up",
			message: "follow up later",
			mode: "followUp",
		}),
	);
	assert.deepEqual(activeSession.steerCalls, []);
	assert.equal(activeSession.followUpCalls.length, 1);
	assert.match(activeSession.followUpCalls[0] ?? "", /\[当前时间：[^\]]+\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/);
	assert.match(activeSession.followUpCalls[0] ?? "", /follow up later/);

	activeSession.finish();
	await run;
});

test("interruptChat aborts the active session and reports interruption to the stream", async () => {
	const store = await createStore();
	const activeSession = new DeferredSession("E:/sessions/interrupt.jsonl");
	const factory = new FakeAgentSessionFactory(() => activeSession);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });
	const events: Array<Record<string, unknown>> = [];

	const run = service.streamChat(
		{
			conversationId: "manual:interrupt",
			message: "start",
		},
		(event) => events.push(event as unknown as Record<string, unknown>),
	);
	await activeSession.promptStarted;

	const interrupted = await service.interruptChat({
		conversationId: "manual:interrupt",
	});

	assert.deepEqual(interrupted, {
		conversationId: "manual:interrupt",
		interrupted: true,
	});
	assert.equal(activeSession.abortCalls, 1);
	await run;
	assert.equal(events.some((event) => event.type === "interrupted"), true);
	assert.equal(events.at(-1)?.type, "interrupted");
	const state = await (
		service as AgentService & {
			getConversationState(conversationId: string): Promise<Record<string, unknown>>;
		}
	).getConversationState("manual:interrupt");
	assert.equal(state.running, false);
	assert.equal(state.activeRun?.status, "interrupted");
	assert.equal(state.activeRun?.loading, false);
});

test("getConversationState does not return a duplicate interrupted terminal snapshot when history already contains the partial reply and queued steer", async () => {
	const store = await createStore();
	const session = new InterruptHistorySession("E:/sessions/interrupted-history.jsonl");
	const factory = new FakeAgentSessionFactory(() => session);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const run = service.streamChat(
		{
			conversationId: "manual:interrupted-history",
			message: "帮我查询知乎热榜",
		},
		() => undefined,
	);
	await session.promptStarted;

	session.emit(textDelta("我来帮你查询知乎热榜。"));
	session.appendAssistant("我来帮你查询知乎热榜。");
	await service.queueMessage({
		conversationId: "manual:interrupted-history",
		message: "就查三条就好",
		mode: "steer",
	});
	await service.interruptChat({
		conversationId: "manual:interrupted-history",
	});
	await run;

	const state = await (
		service as AgentService & {
			getConversationState(conversationId: string): Promise<Record<string, unknown>>;
		}
	).getConversationState("manual:interrupted-history");

	assert.equal(state.running, false);
	assert.deepEqual(
		state.messages.map((message) => ({
			kind: message.kind,
			text: message.text,
		})),
		[
			{ kind: "user", text: "帮我查询知乎热榜" },
			{ kind: "assistant", text: "我来帮你查询知乎热榜。" },
			{ kind: "user", text: "就查三条就好" },
		],
	);
	assert.equal(state.activeRun, null);
});

test("getConversationState keeps terminal interrupted status without re-echoing the original input when only queued user messages remain in history", async () => {
	const store = await createStore();
	const session = new InterruptHistorySession("E:/sessions/interrupted-empty-text.jsonl");
	const factory = new FakeAgentSessionFactory(() => session);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const run = service.streamChat(
		{
			conversationId: "manual:interrupted-empty-text",
			message: "帮我查询知乎热榜",
		},
		() => undefined,
	);
	await session.promptStarted;

	await service.queueMessage({
		conversationId: "manual:interrupted-empty-text",
		message: "就查三条就好",
		mode: "steer",
	});
	await service.interruptChat({
		conversationId: "manual:interrupted-empty-text",
	});
	await run;

	const state = await (
		service as AgentService & {
			getConversationState(conversationId: string): Promise<Record<string, unknown>>;
		}
	).getConversationState("manual:interrupted-empty-text");

	assert.equal(state.running, false);
	assert.deepEqual(
		state.messages.map((message) => ({
			kind: message.kind,
			text: message.text,
		})),
		[
			{ kind: "user", text: "帮我查询知乎热榜" },
			{ kind: "user", text: "就查三条就好" },
		],
	);
	assert.equal(state.activeRun?.status, "interrupted");
	assert.equal(state.activeRun?.input?.message, "");
});

test("streamChat emits a canonical error event and keeps a terminal error snapshot for refresh observers", async () => {
	const store = await createStore();
	const factory = new FakeAgentSessionFactory(
		() => new FakeSession("E:/sessions/error-stream.jsonl", [], undefined, "401 invalid access token"),
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });
	const events: Array<Record<string, unknown>> = [];

	await assert.rejects(
		() =>
			service.streamChat(
				{
					conversationId: "manual:error-stream",
					message: "触发 provider 错误",
				},
				(event) => events.push(event as unknown as Record<string, unknown>),
			),
		/401 invalid access token/,
	);

	assert.equal(events.at(-1)?.type, "error");
	assert.equal(events.at(-1)?.conversationId, "manual:error-stream");
	assert.equal(typeof events.at(-1)?.runId, "string");
	assert.equal(events.at(-1)?.message, "401 invalid access token");
	const state = await (
		service as AgentService & {
			getConversationState(conversationId: string): Promise<Record<string, unknown>>;
		}
	).getConversationState("manual:error-stream");
	assert.equal(state.running, false);
	assert.equal(state.activeRun?.status, "error");
	assert.equal(state.activeRun?.loading, false);
	assert.equal(state.activeRun?.process?.isComplete, true);
});

test("queueMessage reports inactive conversations without creating a session", async () => {
	const store = await createStore();
	const factory = new FakeAgentSessionFactory(() => new FakeSession("E:/sessions/unused.jsonl", []));
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const queued = await service.queueMessage({
		conversationId: "manual:inactive",
		message: "nobody is running",
		mode: "steer",
	});

	assert.deepEqual(queued, {
		conversationId: "manual:inactive",
		mode: "steer",
		queued: false,
		reason: "not_running",
	});
	assert.equal(factory.calls.length, 0);
});

test("reuses the stored session file for an existing conversation", async () => {
	const store = await createStore();
	await store.set("manual:existing", "E:/sessions/existing.jsonl");

	const factory = new FakeAgentSessionFactory(
		() => new FakeSession("E:/sessions/existing.jsonl", [textDelta("继续对话")]),
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const result = await service.chat({
		conversationId: "manual:existing",
		message: "继续",
	});

	assert.equal(result.conversationId, "manual:existing");
	assert.equal(result.text, "继续对话");
	assert.deepEqual(factory.calls, [
		{
			browserScope: "manual-existing",
			conversationId: "manual:existing",
			sessionFile: "E:/sessions/existing.jsonl",
		},
	]);
});

test("returns empty text when the agent produces no text deltas", async () => {
	const store = await createStore();
	const factory = new FakeAgentSessionFactory(() => new FakeSession("E:/sessions/empty.jsonl", []));
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const result = await service.chat({
		conversationId: "manual:empty",
		message: "没有输出也别炸",
	});

	assert.equal(result.text, "");
	assert.equal(result.sessionFile, "E:/sessions/empty.jsonl");
});

test("falls back to the final assistant message text when no deltas were emitted", async () => {
	const store = await createStore();
	const factory = new FakeAgentSessionFactory(
		() => new FakeSession("E:/sessions/final.jsonl", [], "FINAL_TEXT"),
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const result = await service.chat({
		conversationId: "manual:final-text",
		message: "给我最终文本",
	});

	assert.equal(result.text, "FINAL_TEXT");
});

test("rewrites supported local artifact paths before returning assistant text to the user", async () => {
	const store = await createStore();
	const factory = new FakeAgentSessionFactory(
		() =>
			new FakeSession(
				"E:/sessions/final-local-artifact.jsonl",
				[],
				"请打开 file:///app/public/zhihu-hot-share.html",
			),
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const result = await service.chat({
		conversationId: "manual:final-local-artifact",
		message: "把地址给我",
	});

	assert.equal(
		result.text,
		"请打开 http://127.0.0.1:3000/v1/local-file?path=%2Fapp%2Fpublic%2Fzhihu-hot-share.html",
	);
});

test("rewrites supported local artifact paths in streamed tool output and final done text", async () => {
	const store = await createStore();
	const factory = new FakeAgentSessionFactory(
		() =>
			new FakeSession(
				"E:/sessions/stream-local-artifact.jsonl",
				[
					{
						type: "tool_execution_end",
						toolCallId: "tool-open-local",
						toolName: "browser_open",
						result: {
							message: "准备打开 file:///app/public/zhihu-hot-share.html",
						},
						isError: false,
					} as unknown as MessageUpdateEventLike,
					textDelta("现在给你 file:///app/public/zhihu-hot-share.html"),
				],
				"现在给你 file:///app/public/zhihu-hot-share.html",
			),
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });
	const events: Array<Record<string, unknown>> = [];

	await service.streamChat(
		{
			conversationId: "manual:stream-local-artifact",
			message: "把地址给我",
		},
		(event) => {
			events.push(event as unknown as Record<string, unknown>);
		},
	);

	assert.deepEqual(events[1], {
		type: "tool_finished",
		toolCallId: "tool-open-local",
		toolName: "browser_open",
		isError: false,
		result: "准备打开 http://127.0.0.1:3000/v1/local-file?path=%2Fapp%2Fpublic%2Fzhihu-hot-share.html",
	});
	assert.deepEqual(events[2], {
		type: "text_delta",
		textDelta: "现在给你 http://127.0.0.1:3000/v1/local-file?path=%2Fapp%2Fpublic%2Fzhihu-hot-share.html",
	});
	assert.equal(events[3]?.type, "done");
	assert.equal(events[3]?.conversationId, "manual:stream-local-artifact");
	assert.equal(typeof events[3]?.runId, "string");
	assert.equal(events[3]?.text, events[2]?.textDelta);
	assert.equal(events[3]?.sessionFile, "E:/sessions/stream-local-artifact.jsonl");
});

test("throws when the final assistant message indicates an upstream provider error", async () => {
	const store = await createStore();
	const factory = new FakeAgentSessionFactory(
		() => new FakeSession("E:/sessions/error.jsonl", [], undefined, "401 invalid access token"),
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	await assert.rejects(
		() =>
			service.chat({
				conversationId: "manual:error",
				message: "触发 provider 错误",
			}),
		/401 invalid access token/,
	);
});

test("streamChat emits process events and final result while persisting the session file", async () => {
	const store = await createStore();
	const factory = new FakeAgentSessionFactory(
		() =>
			new FakeSession("E:/sessions/stream.jsonl", [
				{
					type: "tool_execution_start",
					toolCallId: "tool-1",
					toolName: "read",
					args: {
						path: "README.md",
					},
				} as unknown as MessageUpdateEventLike,
				textDelta("STREAM_TEXT"),
				{
					type: "tool_execution_end",
					toolCallId: "tool-1",
					toolName: "read",
					result: {
						ok: true,
					},
					isError: false,
				} as unknown as MessageUpdateEventLike,
			]),
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });
	const streamChat = (
		service as AgentService & {
			streamChat?: (
				input: { conversationId?: string; message: string; userId?: string },
				onEvent: (event: Record<string, unknown>) => void,
			) => Promise<void>;
		}
	).streamChat;

	assert.equal(typeof streamChat, "function");

	const events: Array<Record<string, unknown>> = [];
	await streamChat!.call(
		service,
		{
			conversationId: "manual:stream",
			message: "stream it",
		},
		(event) => {
			events.push(event);
		},
	);

	assert.deepEqual(
		events.map((event) => event.type),
		["run_started", "tool_started", "text_delta", "tool_finished", "done"],
	);
	assert.equal(events[0]?.type, "run_started");
	assert.equal(events[0]?.conversationId, "manual:stream");
	assert.equal(typeof events[0]?.runId, "string");
	assert.deepEqual(events[1], {
		type: "tool_started",
		toolCallId: "tool-1",
		toolName: "read",
		args: '{\n  "path": "README.md"\n}',
	});
	assert.deepEqual(events[2], {
		type: "text_delta",
		textDelta: "STREAM_TEXT",
	});
	assert.deepEqual(events[3], {
		type: "tool_finished",
		toolCallId: "tool-1",
		toolName: "read",
		isError: false,
		result: '{\n  "ok": true\n}',
	});
	assert.equal(events[4]?.type, "done");
	assert.equal(events[4]?.conversationId, "manual:stream");
	assert.equal(typeof events[4]?.runId, "string");
	assert.equal(events[4]?.text, "STREAM_TEXT");
	assert.equal(events[4]?.sessionFile, "E:/sessions/stream.jsonl");
	const storedConversation = await store.get("manual:stream");
	assert.equal(storedConversation?.sessionFile, "E:/sessions/stream.jsonl");
	assert.equal(storedConversation?.title, "新会话");
	assert.equal(storedConversation?.preview, "");
	assert.equal(storedConversation?.messageCount, 0);
});

test("streamChat ignores event sink failures so disconnected clients do not kill the run", async () => {
	const store = await createStore();
	const factory = new FakeAgentSessionFactory(
		() =>
			new FakeSession(
				"E:/sessions/disconnected.jsonl",
				[
					{
						type: "message_update",
						assistantMessageEvent: {
							type: "text_delta",
							delta: "still running",
						},
					},
				],
				"still running",
			),
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	await assert.doesNotReject(() =>
		service.streamChat(
			{
				conversationId: "manual:disconnected",
				message: "start",
			},
			(event) => {
				if (event.type === "text_delta") {
					throw new Error("client closed");
				}
			},
		),
	);

	const storedConversation = await store.get("manual:disconnected");
	assert.equal(storedConversation?.sessionFile, "E:/sessions/disconnected.jsonl");
	assert.equal(storedConversation?.title, "新会话");
	assert.equal(storedConversation?.preview, "still running");
	assert.equal(storedConversation?.messageCount, 1);
});

test("streamChat strips null characters and extracts readable text from tool results", async () => {
	const store = await createStore();
	const factory = new FakeAgentSessionFactory(
		() =>
			new FakeSession("E:/sessions/wsl.jsonl", [
				{
					type: "tool_execution_end",
					toolCallId: "tool-wsl",
					toolName: "bash",
					result: {
						content: [
							{
								type: "text",
								text: "w\u0000s\u0000l\u0000:\u0000 \u0000localhost\r\n<3>WSL error",
							},
						],
					},
					isError: true,
				} as unknown as MessageUpdateEventLike,
			]),
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });
	const events: Array<Record<string, unknown>> = [];

	await service.streamChat(
		{
			conversationId: "manual:wsl",
			message: "run bash",
		},
		(event) => {
			events.push(event as unknown as Record<string, unknown>);
		},
	);

	assert.deepEqual(events[1], {
		type: "tool_finished",
		toolCallId: "tool-wsl",
		toolName: "bash",
		isError: true,
		result: "wsl: localhost\n<3>WSL error",
	});
});

test("getRunEvents returns buffered events for a completed chat run", async () => {
	const store = await createStore();
	const factory = new FakeAgentSessionFactory(
		() =>
			new FakeSession(
				"E:/sessions/run-events.jsonl",
				[
					{
						type: "tool_execution_start",
						toolCallId: "tool-readme",
						toolName: "read",
						args: '{\n  "path": "README.md"\n}',
					},
					{
						type: "message_update",
						assistantMessageEvent: {
							type: "text_delta",
							delta: "weather summary",
						},
					},
					{
						type: "tool_execution_end",
						toolCallId: "tool-readme",
						toolName: "read",
						isError: false,
						result: '{\n  "ok": true\n}',
					},
				],
				"weather summary",
			),
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const streamedEvents: Array<Record<string, unknown>> = [];
	await service.streamChat({
		conversationId: "manual:run-events",
		message: "query weather",
	}, (event) => {
		streamedEvents.push(event as unknown as Record<string, unknown>);
	});
	const runStarted = streamedEvents.find((event) => event.type === "run_started");
	assert.equal(typeof runStarted?.runId, "string");
	const events = await service.getRunEvents("manual:run-events", String(runStarted?.runId || ""));
	assert.deepEqual(
		events.map((event) => event.type),
		["run_started", "tool_started", "text_delta", "tool_finished", "done"],
	);
	const doneEvent = events.at(-1) as ChatStreamEvent | undefined;
	assert.ok(doneEvent && doneEvent.type === "done");
	assert.equal(doneEvent.conversationId, "manual:run-events");
	assert.equal(doneEvent.runId, runStarted?.runId);
	assert.equal(doneEvent.text, "weather summary");
	assert.equal(doneEvent.sessionFile, "E:/sessions/run-events.jsonl");
});

test("reuses an existing session when the skill fingerprint changes", async () => {
	const store = await createStore();
	await store.set("manual:existing", "E:/sessions/existing.jsonl", {
		skillFingerprint: "skills-v1",
	});

	const factory = new FakeAgentSessionFactory(
		() => new FakeSession("E:/sessions/new-after-skill-change.jsonl", [textDelta("新的技能集")]),
	);
	factory.skillFingerprint = "skills-v2";
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	const result = await service.chat({
		conversationId: "manual:existing",
		message: "继续",
	});

	assert.equal(result.sessionFile, "E:/sessions/new-after-skill-change.jsonl");
	assert.deepEqual(factory.calls, [
		{
			browserScope: "manual-existing",
			conversationId: "manual:existing",
			sessionFile: "E:/sessions/existing.jsonl",
		},
	]);
	const storedConversation = await store.get("manual:existing");
	assert.equal(storedConversation?.sessionFile, "E:/sessions/new-after-skill-change.jsonl");
	assert.equal(storedConversation?.skillFingerprint, "skills-v2");
	assert.equal(storedConversation?.title, "新会话");
	assert.equal(storedConversation?.preview, "");
	assert.equal(storedConversation?.messageCount, 0);
});
