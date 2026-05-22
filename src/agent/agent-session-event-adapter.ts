import { extractSendFileArtifact } from "./agent-file-history.js";
import { deliverChatStreamEvent, type ChatStreamEventSink } from "./agent-run-events.js";
import {
	isMessageUpdateEvent,
	isQueueUpdateEvent,
	isToolExecutionEndEvent,
	isToolExecutionStartEvent,
	isToolExecutionUpdateEvent,
} from "./agent-session-event-guards.js";
import type {
	MessageUpdateEventLike,
	RawAgentSessionEventLike,
	ToolExecutionEndEventLike,
	ToolExecutionStartEventLike,
	ToolExecutionUpdateEventLike,
} from "./agent-session-factory.js";
import { formatProcessPayload } from "./agent-process-text.js";
import { rewriteUserVisibleLocalArtifactLinks, type AgentFileArtifact } from "./file-artifacts.js";
import type { ChatStreamEvent } from "../types/api.js";

export interface AgentSessionEventAdapterState {
	rawText?: string;
	sentFiles?: AgentFileArtifact[];
}

export interface AgentSessionEventAdapter {
	handle: (event: RawAgentSessionEventLike) => void;
	getRawText: () => string;
	getSentFiles: () => AgentFileArtifact[];
}

export function createAgentSessionEventAdapter(
	onEvent: ChatStreamEventSink | undefined,
	initialState: AgentSessionEventAdapterState = {},
): AgentSessionEventAdapter {
	let rawText = initialState.rawText ?? "";
	const sentFiles = [...(initialState.sentFiles ?? [])];

	return {
		handle(event: RawAgentSessionEventLike): void {
			switch (event.type) {
				case "message_update":
					if (isMessageUpdateEvent(event)) {
						rawText = handleMessageUpdate(event, rawText, onEvent);
					}
					break;
				case "tool_execution_start":
					if (isToolExecutionStartEvent(event)) {
						deliverChatStreamEvent(onEvent, toToolExecutionStartEvent(event));
					}
					break;
				case "tool_execution_update":
					if (isToolExecutionUpdateEvent(event)) {
						deliverChatStreamEvent(onEvent, toToolExecutionUpdateEvent(event));
					}
					break;
				case "tool_execution_end":
					if (isToolExecutionEndEvent(event)) {
						const sentFile = extractSendFileArtifact(event);
						if (sentFile) {
							sentFiles.push(sentFile);
						}
						deliverChatStreamEvent(onEvent, toToolExecutionEndEvent(event));
					}
					break;
				case "queue_update":
					if (isQueueUpdateEvent(event)) {
						deliverChatStreamEvent(onEvent, {
							type: "queue_updated",
							steering: event.steering,
							followUp: event.followUp,
						});
					}
					break;
				default:
					break;
			}
		},
		getRawText(): string {
			return rawText;
		},
		getSentFiles(): AgentFileArtifact[] {
			return sentFiles.map((file) => ({ ...file }));
		},
	};
}

function handleMessageUpdate(
	event: MessageUpdateEventLike,
	currentText: string,
	onEvent: ChatStreamEventSink | undefined,
): string {
	if (isThinkingAssistantMessageEvent(event.assistantMessageEvent.type)) {
		deliverChatStreamEvent(onEvent, {
			type: "heartbeat",
			phase: "reasoning",
		});
		return currentText;
	}

	if (event.assistantMessageEvent.type !== "text_delta" || typeof event.assistantMessageEvent.delta !== "string") {
		return currentText;
	}

	const delta = event.assistantMessageEvent.delta;
	deliverChatStreamEvent(onEvent, {
		type: "text_delta",
		textDelta: rewriteUserVisibleLocalArtifactLinks(delta),
	});
	return currentText + delta;
}

function isThinkingAssistantMessageEvent(type: string): boolean {
	return type === "thinking_delta" || type === "thinking_start" || type === "thinking_end";
}

function toToolExecutionStartEvent(event: ToolExecutionStartEventLike): ChatStreamEvent {
	return {
		type: "tool_started",
		toolCallId: event.toolCallId,
		toolName: event.toolName,
		args: formatProcessPayload(event.args),
	};
}

function toToolExecutionUpdateEvent(event: ToolExecutionUpdateEventLike): ChatStreamEvent {
	return {
		type: "tool_updated",
		toolCallId: event.toolCallId,
		toolName: event.toolName,
		partialResult: formatProcessPayload(event.partialResult),
	};
}

function toToolExecutionEndEvent(event: ToolExecutionEndEventLike): ChatStreamEvent {
	return {
		type: "tool_finished",
		toolCallId: event.toolCallId,
		toolName: event.toolName,
		isError: event.isError,
		result: formatProcessPayload(event.result),
	};
}
