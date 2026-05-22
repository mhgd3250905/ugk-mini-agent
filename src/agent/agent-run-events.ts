import type { ChatActiveRunBody, ChatStreamEvent } from "../types/api.js";
import {
	applyChatStreamEventToActiveRunView,
} from "./agent-active-run-view.js";

export type ChatStreamEventSink = (event: ChatStreamEvent) => void;

export interface BufferedRunEventTarget {
	view: ChatActiveRunBody;
	events: ChatStreamEvent[];
	subscribers: ReadonlySet<ChatStreamEventSink>;
	primarySink?: ChatStreamEventSink;
	event: ChatStreamEvent;
	maxBufferedEvents: number;
}

export function emitBufferedRunEvent(target: BufferedRunEventTarget): void {
	applyChatStreamEventToActiveRunView(target.view, target.event);
	target.events.push(target.event);
	if (target.events.length > target.maxBufferedEvents) {
		target.events.shift();
	}

	deliverChatStreamEvent(target.primarySink, target.event);
	for (const subscriber of target.subscribers) {
		deliverChatStreamEvent(subscriber, target.event);
	}
}

export function cloneChatStreamEvent(event: ChatStreamEvent): ChatStreamEvent {
	switch (event.type) {
		case "run_started":
			return {
				type: "run_started",
				conversationId: event.conversationId,
				runId: event.runId,
			};
		case "text_delta":
			return {
				type: "text_delta",
				textDelta: event.textDelta,
			};
		case "heartbeat":
			return {
				type: "heartbeat",
				phase: event.phase,
			};
		case "tool_started":
			return {
				type: "tool_started",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
			};
		case "tool_updated":
			return {
				type: "tool_updated",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				partialResult: event.partialResult,
			};
		case "tool_finished":
			return {
				type: "tool_finished",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				isError: event.isError,
				result: event.result,
			};
		case "queue_updated":
			return {
				type: "queue_updated",
				steering: [...event.steering],
				followUp: [...event.followUp],
			};
		case "interrupted":
			return {
				type: "interrupted",
				conversationId: event.conversationId,
				runId: event.runId,
			};
		case "done":
			return {
				type: "done",
				conversationId: event.conversationId,
				runId: event.runId,
				text: event.text,
				...(event.sessionFile ? { sessionFile: event.sessionFile } : {}),
				...(event.inputAssets ? { inputAssets: event.inputAssets.map((asset) => ({ ...asset })) } : {}),
				...(event.files ? { files: event.files.map((file) => ({ ...file })) } : {}),
			};
		case "error":
			return {
				type: "error",
				conversationId: event.conversationId,
				runId: event.runId,
				message: event.message,
			};
		default:
			return event;
	}
}

export function isTerminalChatStreamEvent(event: ChatStreamEvent): boolean {
	return event.type === "done" || event.type === "interrupted" || event.type === "error";
}

export function deliverChatStreamEvent(onEvent: ChatStreamEventSink | undefined, event: ChatStreamEvent): void {
	if (!onEvent) {
		return;
	}

	try {
		onEvent(event);
	} catch {
		// Event delivery is best-effort; a dead SSE client must not cancel the agent run.
	}
}
