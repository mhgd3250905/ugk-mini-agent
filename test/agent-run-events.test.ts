import assert from "node:assert/strict";
import test from "node:test";
import {
	cloneChatStreamEvent,
	deliverChatStreamEvent,
	emitBufferedRunEvent,
	isTerminalChatStreamEvent,
} from "../src/agent/agent-run-events.js";
import { createActiveRunView } from "../src/agent/agent-active-run-view.js";
import type { ChatStreamEvent } from "../src/types/api.js";

test("cloneChatStreamEvent deep copies mutable done event fields", () => {
	const event: ChatStreamEvent = {
		type: "done",
		conversationId: "manual:run",
		runId: "run-1",
		text: "ok",
		inputAssets: [
			{
				assetId: "asset-1",
				reference: "@asset[asset-1]",
				fileName: "note.txt",
				mimeType: "text/plain",
				sizeBytes: 4,
				kind: "text",
				hasContent: true,
				source: "user_upload",
				conversationId: "manual:run",
				createdAt: "2026-04-26T00:00:00.000Z",
			},
		],
		files: [
			{
				id: "file-1",
				assetId: "file-1",
				reference: "@asset[file-1]",
				fileName: "report.md",
				mimeType: "text/markdown",
				sizeBytes: 12,
				downloadUrl: "/v1/files/file-1",
			},
		],
	};

	const cloned = cloneChatStreamEvent(event);
	assert.deepEqual(cloned, event);
	assert.notEqual(cloned, event);
	assert.notEqual(cloned.type === "done" ? cloned.files : undefined, event.files);
	assert.notEqual(cloned.type === "done" ? cloned.inputAssets : undefined, event.inputAssets);
});

test("cloneChatStreamEvent preserves reasoning heartbeats", () => {
	const event: ChatStreamEvent = { type: "heartbeat", phase: "reasoning" };
	const cloned = cloneChatStreamEvent(event);

	assert.deepEqual(cloned, event);
	assert.notEqual(cloned, event);
});

test("isTerminalChatStreamEvent identifies events that close run streams", () => {
	assert.equal(isTerminalChatStreamEvent({ type: "done", conversationId: "c", runId: "r", text: "" }), true);
	assert.equal(isTerminalChatStreamEvent({ type: "interrupted", conversationId: "c", runId: "r" }), true);
	assert.equal(isTerminalChatStreamEvent({ type: "error", conversationId: "c", runId: "r", message: "x" }), true);
	assert.equal(isTerminalChatStreamEvent({ type: "text_delta", textDelta: "still running" }), false);
	assert.equal(isTerminalChatStreamEvent({ type: "heartbeat", phase: "reasoning" }), false);
});

test("deliverChatStreamEvent is best-effort for missing and failed sinks", () => {
	const event: ChatStreamEvent = { type: "text_delta", textDelta: "hello" };
	const delivered: ChatStreamEvent[] = [];

	assert.doesNotThrow(() => deliverChatStreamEvent(undefined, event));
	deliverChatStreamEvent((incoming) => delivered.push(incoming), event);
	assert.deepEqual(delivered, [event]);
	assert.doesNotThrow(() => deliverChatStreamEvent(() => {
		throw new Error("client disconnected");
	}, event));
});

test("emitBufferedRunEvent updates the active view, truncates the buffer, and delivers to sinks", () => {
	const view = createActiveRunView("manual:run", "hello", []);
	const events: ChatStreamEvent[] = [
		{ type: "text_delta", textDelta: "old-1" },
		{ type: "text_delta", textDelta: "old-2" },
	];
	const primaryDelivered: ChatStreamEvent[] = [];
	const subscriberDelivered: ChatStreamEvent[] = [];
	const failingSubscriber = () => {
		throw new Error("subscriber gone");
	};
	const subscribers = new Set([
		(event: ChatStreamEvent) => subscriberDelivered.push(event),
		failingSubscriber,
	]);
	const incoming: ChatStreamEvent = { type: "text_delta", textDelta: "new" };

	assert.doesNotThrow(() => emitBufferedRunEvent({
		view,
		events,
		subscribers,
		primarySink: (event) => primaryDelivered.push(event),
		event: incoming,
		maxBufferedEvents: 2,
	}));

	assert.equal(view.text, "new");
	assert.deepEqual(events, [
		{ type: "text_delta", textDelta: "old-2" },
		{ type: "text_delta", textDelta: "new" },
	]);
	assert.deepEqual(primaryDelivered, [incoming]);
	assert.deepEqual(subscriberDelivered, [incoming]);
});
