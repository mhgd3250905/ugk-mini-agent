import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentService } from "../src/agent/agent-service.js";
import { buildPromptWithAssetContext } from "../src/agent/file-artifacts.js";
import type { ConversationStateResponseBody } from "../src/types/api.js";
import {
	DeferredSession,
	FakeAgentSessionFactory,
	FakeSession,
	TerminalNoPersistSession,
	TerminalOverlapSession,
	createStore,
	restoreEnvValue,
	textDelta,
} from "./agent-service-helpers.js";

const originalBrowserScopeRouteCachePath = process.env.UGK_BROWSER_SCOPE_ROUTE_CACHE_PATH;
process.env.UGK_BROWSER_SCOPE_ROUTE_CACHE_PATH = join(
	await mkdtemp(join(tmpdir(), "ugk-pi-agent-service-conversation-state-browser-routes-")),
	"routes.json",
);

test.after(() => {
	restoreEnvValue("UGK_BROWSER_SCOPE_ROUTE_CACHE_PATH", originalBrowserScopeRouteCachePath);
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

