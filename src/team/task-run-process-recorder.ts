import { createActiveRunView, applyChatStreamEventToActiveRunView } from "../agent/agent-active-run-view.js";
import { createAgentSessionEventAdapter } from "../agent/agent-session-event-adapter.js";
import type { RawAgentSessionEventLike } from "../agent/agent-session-factory.js";
import type { ChatProcessBody, ChatProcessEntryBody, ChatStreamEvent } from "../types/api.js";
import type { RunWorkspace } from "./run-workspace.js";
import type { TeamAttemptRoleProcess, TeamAttemptRoleProcessStatus } from "./types.js";

export type TeamRoleProcessRecorderWorkspace = Pick<RunWorkspace, "recordAttemptRoleProcess">;

export interface TeamRoleProcessRecorderOptions {
	workspace: TeamRoleProcessRecorderWorkspace;
	runId: string;
	taskId: string;
	attemptId: string;
	role: "worker" | "checker";
	profileId: string;
	throttleMs?: number;
}

const PROCESS_DETAIL_LIMIT = 8_000;
const DEFAULT_THROTTLE_MS = 400;

function truncateProcessText(value: string): string {
	if (value.length <= PROCESS_DETAIL_LIMIT) return value;
	return `${value.slice(0, PROCESS_DETAIL_LIMIT)}\n...[truncated]`;
}

function cloneProcessForPersistence(process: ChatProcessBody | null): ChatProcessBody | null {
	if (!process) return null;
	return {
		...process,
		narration: process.narration.map(truncateProcessText),
		entries: process.entries.map((entry): ChatProcessEntryBody => ({
			...entry,
			detail: truncateProcessText(entry.detail),
		})),
	};
}

function roleProcessTitle(role: "worker" | "checker"): string {
	return role === "worker" ? "Worker process" : "Checker process";
}

function isTerminalRoleProcessStatus(status: TeamAttemptRoleProcessStatus): boolean {
	return status === "succeeded" || status === "failed" || status === "cancelled";
}

function completionEvent(input: {
	status: TeamAttemptRoleProcessStatus;
	conversationId: string;
	runId: string;
	message?: string;
	text?: string;
}): ChatStreamEvent {
	if (input.status === "cancelled") {
		return { type: "interrupted", conversationId: input.conversationId, runId: input.runId };
	}
	if (input.status === "failed") {
		return { type: "error", conversationId: input.conversationId, runId: input.runId, message: input.message ?? "role failed" };
	}
	return {
		type: "done",
		conversationId: input.conversationId,
		runId: input.runId,
		text: input.text ?? "",
	};
}

export class TeamRoleProcessRecorder {
	private readonly throttleMs: number;
	private readonly conversationId: string;
	private readonly activeRunView;
	private readonly adapter;
	private status: TeamAttemptRoleProcessStatus = "waiting";
	private startedAt: string | null = null;
	private updatedAt: string | null = null;
	private finishedAt: string | null = null;
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private lastFlushAt = 0;
	private pendingWrite: Promise<void> = Promise.resolve();
	private finishPromise: Promise<void> | null = null;

	constructor(private readonly options: TeamRoleProcessRecorderOptions) {
		this.throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
		this.conversationId = `${options.runId}:${options.taskId}:${options.attemptId}:${options.role}`;
		this.activeRunView = createActiveRunView(this.conversationId, roleProcessTitle(options.role), []);
		if (this.activeRunView.process) {
			this.activeRunView.process.title = roleProcessTitle(options.role);
		}
		this.adapter = createAgentSessionEventAdapter((event) => this.handleChatStreamEvent(event));
	}

	async start(): Promise<void> {
		const timestamp = new Date().toISOString();
		this.status = "running";
		this.startedAt = timestamp;
		this.updatedAt = timestamp;
		await this.flushNow();
	}

	handleRawEvent(event: RawAgentSessionEventLike): void {
		if (isTerminalRoleProcessStatus(this.status)) return;
		this.adapter.handle(event);
	}

	async succeed(): Promise<void> {
		await this.finish("succeeded", { text: this.activeRunView.text || this.adapter.getRawText() });
	}

	async fail(message: string): Promise<void> {
		await this.finish("failed", { message });
	}

	async cancel(message = "run cancelled"): Promise<void> {
		await this.finish("cancelled", { message });
	}

	async flush(): Promise<void> {
		if (isTerminalRoleProcessStatus(this.status)) {
			if (this.flushTimer) {
				clearTimeout(this.flushTimer);
				this.flushTimer = null;
			}
			await (this.finishPromise ?? this.pendingWrite);
			return;
		}
		await this.flushNow();
	}

	private handleChatStreamEvent(event: ChatStreamEvent): void {
		if (isTerminalRoleProcessStatus(this.status)) return;
		applyChatStreamEventToActiveRunView(this.activeRunView, event);
		if (this.activeRunView.process) {
			this.activeRunView.process.title = roleProcessTitle(this.options.role);
		}
		this.updatedAt = new Date().toISOString();
		if (event.type === "tool_started" || event.type === "tool_finished") {
			void this.flushNow();
			return;
		}
		this.scheduleFlush();
	}

	private async finish(status: TeamAttemptRoleProcessStatus, input: { message?: string; text?: string } = {}): Promise<void> {
		if (this.finishPromise) {
			await this.finishPromise;
			return;
		}
		if (isTerminalRoleProcessStatus(this.status)) {
			await this.pendingWrite;
			return;
		}
		this.finishPromise = this.finishOnce(status, input);
		await this.finishPromise;
	}

	private async finishOnce(status: TeamAttemptRoleProcessStatus, input: { message?: string; text?: string } = {}): Promise<void> {
		const timestamp = new Date().toISOString();
		this.status = status;
		this.updatedAt = timestamp;
		this.finishedAt = timestamp;
		applyChatStreamEventToActiveRunView(this.activeRunView, completionEvent({
			status,
			conversationId: this.conversationId,
			runId: this.options.runId,
			message: input.message,
			text: input.text,
		}));
		if (this.activeRunView.process) {
			this.activeRunView.process.title = roleProcessTitle(this.options.role);
			this.activeRunView.process.isComplete = true;
		}
		await this.flushNow();
	}

	private scheduleFlush(): void {
		const nowMs = Date.now();
		const elapsed = nowMs - this.lastFlushAt;
		if (elapsed >= this.throttleMs) {
			void this.flushNow();
			return;
		}
		if (this.flushTimer) return;
		this.flushTimer = setTimeout(() => {
			this.flushTimer = null;
			void this.flushNow();
		}, this.throttleMs - elapsed);
	}

	private async flushNow(): Promise<void> {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		this.lastFlushAt = Date.now();
		const snapshot = this.snapshot();
		this.pendingWrite = this.pendingWrite.then(() => this.options.workspace.recordAttemptRoleProcess(
			this.options.runId,
			this.options.taskId,
			this.options.attemptId,
			snapshot,
		));
		await this.pendingWrite;
	}

	private snapshot(): TeamAttemptRoleProcess {
		const assistantContent = truncateProcessText(this.activeRunView.text || this.adapter.getRawText());
		const assistantUpdatedAt = this.updatedAt ?? this.startedAt ?? new Date().toISOString();
		return {
			role: this.options.role,
			profileId: this.options.profileId,
			status: this.status,
			startedAt: this.startedAt,
			updatedAt: this.updatedAt,
			finishedAt: this.finishedAt,
			...(assistantContent ? { assistantText: { content: assistantContent, updatedAt: assistantUpdatedAt } } : {}),
			process: cloneProcessForPersistence(this.activeRunView.process),
		};
	}
}
