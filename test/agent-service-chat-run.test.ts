import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentService } from "../src/agent/agent-service.js";
import { LARGE_SESSION_MESSAGE_TEXT_BYTES } from "../src/agent/session-message-compactor.js";
import { buildPromptWithAssetContext } from "../src/agent/file-artifacts.js";
import {
	DeferredSession,
	EnvAwareSession,
	FakeAgentSessionFactory,
	FakeAssetStore,
	FakeSession,
	createStore,
	sendFileToolFinished,
	textDelta,
} from "./agent-service-helpers.js";

class PersistingLargeToolResultSession extends FakeSession {
	constructor(
		sessionFile: string,
		private readonly oversizedText: string,
	) {
		super(sessionFile, []);
	}

	override async prompt(message: string): Promise<void> {
		this.prompts.push({ message });
		this.messages.push(
			{
				role: "user",
				content: buildPromptWithAssetContext(message),
				timestamp: "2026-06-14T00:00:00.000Z",
			} as never,
			{
				role: "toolResult",
				toolCallId: "tool-large",
				toolName: "conn",
				content: [{ type: "text", text: this.oversizedText }],
				isError: false,
				timestamp: "2026-06-14T00:00:01.000Z",
			} as never,
			{
				role: "assistant",
				content: [{ type: "text", text: "large output handled" }],
				stopReason: "stop",
				timestamp: "2026-06-14T00:00:02.000Z",
			} as never,
		);
		await writeFile(
			this.sessionFile!,
			this.messages.map((persistedMessage) => {
				const message = persistedMessage as typeof persistedMessage & { timestamp?: string | number };
				return JSON.stringify({
					type: "message",
					timestamp: message.timestamp,
					message,
				});
			}).join("\n") + "\n",
			"utf8",
		);
	}
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
			agentRunScope: result.conversationId.replace(/[^a-zA-Z0-9_-]+/g, "-"),
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

test("chat exposes the scoped agent run id during the run", async () => {
	const originalClaudeAgentId = process.env.CLAUDE_AGENT_ID;
	delete process.env.CLAUDE_AGENT_ID;

	try {
		const store = await createStore();
		const session = new EnvAwareSession("E:/sessions/agent-scope.jsonl", [textDelta("done")]);
		const factory = new FakeAgentSessionFactory(() => session);
		const service = new AgentService({ agentId: "search", conversationStore: store, sessionFactory: factory });

		const result = await service.chat({
			conversationId: "manual:agent-scope",
			message: "run scoped task",
		});

		assert.equal(result.text, "done");
		assert.equal(session.observedAgentScope, "search-manual-agent-scope");
		assert.equal(process.env.CLAUDE_AGENT_ID, undefined);
	} finally {
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

test("chat compacts oversized persisted tool results into downloadable artifacts after a run", async () => {
	const store = await createStore();
	const tempDir = await mkdtemp(join(tmpdir(), "ugk-large-session-"));
	const sessionFile = join(tempDir, "large.jsonl");
	const oversizedText = "x".repeat(LARGE_SESSION_MESSAGE_TEXT_BYTES + 1024);
	const session = new PersistingLargeToolResultSession(sessionFile, oversizedText);
	const factory = new FakeAgentSessionFactory(() => session);
	const assetStore = new FakeAssetStore();
	const service = new AgentService({ conversationStore: store, sessionFactory: factory, assetStore });

	const result = await service.chat({
		conversationId: "manual:large-session",
		message: "inspect conn run",
	});

	const compactedSession = await readFile(sessionFile, "utf8");
	assert.equal(result.text, "large output handled");
	assert.equal(assetStore.saved.length, 1);
	assert.equal(assetStore.saved[0]?.files[0]?.content, oversizedText);
	assert.ok(Buffer.byteLength(compactedSession, "utf8") < oversizedText.length / 2);
	assert.match(compactedSession, /Large tool output omitted from session history/);
	assert.match(compactedSession, /\/v1\/files\/file-1/);
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

test("runChat passes agent run scope into the session factory", async () => {
	const store = await createStore();
	const session = new FakeSession("E:/sessions/agent-context.jsonl", [], "ok");
	const factory = new FakeAgentSessionFactory(() => session);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	await service.chat({
		conversationId: "manual:agent-context",
		message: "scope this run",
	});

	assert.equal(factory.calls[0]?.conversationId, "manual:agent-context");
	assert.equal(factory.calls[0]?.agentRunScope, "manual-agent-context");
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
