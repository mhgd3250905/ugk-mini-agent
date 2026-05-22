import assert from "node:assert/strict";
import test from "node:test";
import {
	createAgentSessionEventAdapter,
	type AgentSessionEventAdapterState,
} from "../src/agent/agent-session-event-adapter.js";
import type { RawAgentSessionEventLike } from "../src/agent/agent-session-factory.js";
import type { ChatStreamEvent } from "../src/types/api.js";

function collectEvents(state: AgentSessionEventAdapterState = {}) {
	const events: ChatStreamEvent[] = [];
	const adapter = createAgentSessionEventAdapter((event) => {
		events.push(event);
	}, state);
	return { adapter, events };
}

test("agent session event adapter accumulates text deltas and emits rewritten stream deltas", () => {
	const { adapter, events } = collectEvents();

	adapter.handle({
		type: "message_update",
		assistantMessageEvent: {
			type: "text_delta",
			delta: "see /app/runtime/report.html",
		},
	});
	adapter.handle({
		type: "message_update",
		assistantMessageEvent: {
			type: "text_delta",
			delta: " done",
		},
	});

	assert.equal(adapter.getRawText(), "see /app/runtime/report.html done");
	assert.deepEqual(events, [
		{
			type: "text_delta",
			textDelta: "see http://127.0.0.1:3000/v1/local-file?path=%2Fapp%2Fruntime%2Freport.html",
		},
		{
			type: "text_delta",
			textDelta: " done",
		},
	]);
});

test("agent session event adapter emits reasoning heartbeats without appending thinking text", () => {
	const { adapter, events } = collectEvents();

	adapter.handle({
		type: "message_update",
		assistantMessageEvent: {
			type: "thinking_start",
		},
	});
	adapter.handle({
		type: "message_update",
		assistantMessageEvent: {
			type: "thinking_delta",
			delta: "private reasoning",
		},
	});
	adapter.handle({
		type: "message_update",
		assistantMessageEvent: {
			type: "thinking_end",
		},
	});

	assert.equal(adapter.getRawText(), "");
	assert.deepEqual(events, [
		{ type: "heartbeat", phase: "reasoning" },
		{ type: "heartbeat", phase: "reasoning" },
		{ type: "heartbeat", phase: "reasoning" },
	]);
});

test("agent session event adapter converts tool and queue events", () => {
	const { adapter, events } = collectEvents();

	adapter.handle({
		type: "tool_execution_start",
		toolCallId: "tool-1",
		toolName: "bash",
		args: { command: "npm test" },
	});
	adapter.handle({
		type: "tool_execution_update",
		toolCallId: "tool-1",
		toolName: "bash",
		partialResult: { output: "running" },
	});
	adapter.handle({
		type: "tool_execution_end",
		toolCallId: "tool-1",
		toolName: "bash",
		isError: false,
		result: { output: "ok" },
	});
	adapter.handle({
		type: "queue_update",
		steering: ["change course"],
		followUp: ["next"],
	});

	assert.deepEqual(events.map((event) => event.type), [
		"tool_started",
		"tool_updated",
		"tool_finished",
		"queue_updated",
	]);
	assert.equal(events[0]?.type === "tool_started" ? events[0].toolName : undefined, "bash");
	assert.deepEqual(events[3], {
		type: "queue_updated",
		steering: ["change course"],
		followUp: ["next"],
	});
});

test("agent session event adapter collects send_file artifacts and ignores invalid events", () => {
	const { adapter, events } = collectEvents();

	adapter.handle({
		type: "message_update",
		assistantMessageEvent: {
			type: "metadata",
			delta: "ignored",
		},
	});
	adapter.handle({ type: "tool_execution_start", toolName: "missing id" } as RawAgentSessionEventLike);
	adapter.handle({
		type: "tool_execution_end",
		toolCallId: "tool-send-file",
		toolName: "send_file",
		isError: false,
		result: {
			content: [{ type: "text", text: "File ready" }],
			details: {
				file: {
					id: "file-1",
					assetId: "file-1",
					reference: "@asset[file-1]",
					fileName: "report.md",
					mimeType: "text/markdown",
					sizeBytes: 12,
					downloadUrl: "/v1/files/file-1",
				},
			},
		},
	});

	assert.equal(adapter.getRawText(), "");
	assert.deepEqual(adapter.getSentFiles().map((file) => file.assetId), ["file-1"]);
	assert.deepEqual(events.map((event) => event.type), ["tool_finished"]);
});
