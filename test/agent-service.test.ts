import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { AgentService } from "../src/agent/agent-service.js";
import { AgentBusyError } from "../src/agent/agent-errors.js";
import type { MessageUpdateEventLike } from "../src/agent/agent-session-factory.js";
import { loadDefaultNativeEnv } from "../src/native-default-env.js";
import type { ChatStreamEvent } from "../src/types/api.js";
import {
	DeferredSession,
	FakeAgentSessionFactory,
	FakeSession,
	InterruptHistorySession,
	StrictQueueSession,
	createStore,
	textDelta,
} from "./agent-service-helpers.js";

const TEST_PUBLIC_BASE_URL = loadDefaultNativeEnv().PUBLIC_BASE_URL;

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

test("subscribeRunEvents replays terminal events after a run has just completed", async () => {
	const store = await createStore();
	const factory = new FakeAgentSessionFactory(
		() =>
			new FakeSession(
				"E:/sessions/terminal-reattach.jsonl",
				[textDelta("terminal answer")],
				"terminal answer",
			),
	);
	const service = new AgentService({ conversationStore: store, sessionFactory: factory });

	await service.streamChat(
		{
			conversationId: "manual:terminal-reattach",
			message: "start",
		},
		() => undefined,
	);

	const reattachedEvents: ChatStreamEvent[] = [];
	const subscription = service.subscribeRunEvents("manual:terminal-reattach", (event) => {
		reattachedEvents.push(event);
	});

	assert.equal(subscription.running, true);
	assert.equal(reattachedEvents.at(-1)?.type, "done");
	assert.equal(
		reattachedEvents.some((event) => event.type === "done" && event.conversationId === "manual:terminal-reattach"),
		true,
	);
	subscription.unsubscribe();
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
			agentRunScope: "manual-existing",
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
		`请打开 ${TEST_PUBLIC_BASE_URL}/v1/local-file?path=%2Fapp%2Fpublic%2Fzhihu-hot-share.html`,
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
		result: `准备打开 ${TEST_PUBLIC_BASE_URL}/v1/local-file?path=%2Fapp%2Fpublic%2Fzhihu-hot-share.html`,
	});
	assert.deepEqual(events[2], {
		type: "text_delta",
		textDelta: `现在给你 ${TEST_PUBLIC_BASE_URL}/v1/local-file?path=%2Fapp%2Fpublic%2Fzhihu-hot-share.html`,
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
