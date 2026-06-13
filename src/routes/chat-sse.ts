import type { ChatStreamEvent } from "../types/api.js";

interface SseResponse {
	destroyed: boolean;
	writableEnded: boolean;
	write: (chunk: string) => unknown;
	end: () => unknown;
}

interface SseHeaderResponse {
	setHeader: (name: string, value: string) => unknown;
	flushHeaders?: () => unknown;
}

export function configureSseResponse(raw: SseHeaderResponse): void {
	raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
	raw.setHeader("Cache-Control", "no-cache, no-transform");
	raw.setHeader("Connection", "keep-alive");
	raw.setHeader("X-Accel-Buffering", "no");
	raw.flushHeaders?.();
}

export function writeSseEvent<T = ChatStreamEvent>(raw: SseResponse, event: T): void {
	if (raw.destroyed || raw.writableEnded) {
		return;
	}

	try {
		raw.write(`data: ${JSON.stringify(event)}\n\n`);
	} catch {
		// Page refresh closes the SSE response, but the agent run should keep working.
	}
}

export function writeSseComment(raw: SseResponse, comment: string = "ping"): void {
	if (raw.destroyed || raw.writableEnded) {
		return;
	}

	try {
		raw.write(`: ${comment}\n\n`);
	} catch {
		// Page refresh closes the SSE response, but the agent run should keep working.
	}
}

export function startSseHeartbeat(raw: SseResponse, intervalMs: number = 25_000): { stop(): void } {
	const normalizedIntervalMs = Number.isFinite(intervalMs) && intervalMs > 0 ? Math.trunc(intervalMs) : 25_000;
	const timer = setInterval(() => {
		writeSseComment(raw);
	}, normalizedIntervalMs);
	timer.unref?.();

	return {
		stop(): void {
			clearInterval(timer);
		},
	};
}

export function endSseResponse(raw: SseResponse): void {
	if (!raw.destroyed && !raw.writableEnded) {
		raw.end();
	}
}

export function isTerminalChatStreamEvent(event: ChatStreamEvent): boolean {
	return event.type === "done" || event.type === "interrupted" || event.type === "error";
}
