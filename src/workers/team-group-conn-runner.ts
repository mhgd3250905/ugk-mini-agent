import type { ConnRunRecord, ConnRunStore } from "../agent/conn-run-store.js";
import type { ConnDefinition } from "../agent/conn-store.js";
import type { ConnWorkerRunner } from "./conn-worker.js";

type TeamTaskGroupRunStatus =
	| "queued"
	| "running"
	| "completed"
	| "completed_with_failures"
	| "failed"
	| "cancelled";

interface TeamTaskGroupRunBody {
	groupRunId: string;
	groupId: string;
	status: TeamTaskGroupRunStatus;
	lastError?: string | null;
}

interface TeamGroupConnRunnerOptions {
	runStore: Pick<ConnRunStore, "appendEvent" | "updateRuntimeInfo" | "completeRun" | "failRun" | "cancelRun">;
	apiBaseUrl: string;
	fetchFn?: typeof fetch;
	pollIntervalMs?: number;
}

const TERMINAL_GROUP_RUN_STATUSES = new Set<TeamTaskGroupRunStatus>([
	"completed",
	"completed_with_failures",
	"failed",
	"cancelled",
]);

export class TeamGroupConnRunner implements ConnWorkerRunner {
	private readonly fetchFn: typeof fetch;
	private readonly pollIntervalMs: number;
	private readonly apiBaseUrl: string;

	constructor(private readonly options: TeamGroupConnRunnerOptions) {
		this.fetchFn = options.fetchFn ?? fetch;
		this.pollIntervalMs = Math.max(1, Math.trunc(options.pollIntervalMs ?? 2_000));
		this.apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, "");
	}

	async run(conn: ConnDefinition, run: ConnRunRecord, now: Date, signal?: AbortSignal): Promise<ConnRunRecord | undefined> {
		if (conn.execution?.type !== "team_group") {
			throw new Error(`Unsupported conn execution for TeamGroupConnRunner: ${conn.execution?.type ?? "agent_prompt"}`);
		}
		const groupId = conn.execution.groupId;
		let groupRunId: string | undefined;

		await this.options.runStore.appendEvent({
			runId: run.runId,
			leaseOwner: run.leaseOwner,
			eventType: "team_group_run_starting",
			event: {
				connId: conn.connId,
				runId: run.runId,
				groupId,
			},
			createdAt: now,
		});

		try {
			this.throwIfAborted(signal);
			const startResponse = await this.fetchJson(`/v1/team/task-groups/${encodeURIComponent(groupId)}/runs`, {
				method: "POST",
				signal,
			});

			if (startResponse.status === 409) {
				const summary = resolveSkippedSummary(startResponse.body);
				await this.options.runStore.updateRuntimeInfo({
					runId: run.runId,
					leaseOwner: run.leaseOwner,
					resolvedSnapshot: {
						executionType: "team_group",
						groupId,
						skipped: true,
					},
				});
				return await this.options.runStore.completeRun({
					runId: run.runId,
					leaseOwner: run.leaseOwner,
					summary,
					text: summary,
					finishedAt: new Date(),
				});
			}

			if (!isSuccessStatus(startResponse.status)) {
				const summary = `Team GroupRun start failed with ${startResponse.status}`;
				const startError = readErrorMessage(startResponse.body);
				await this.options.runStore.updateRuntimeInfo({
					runId: run.runId,
					leaseOwner: run.leaseOwner,
					resolvedSnapshot: {
						executionType: "team_group",
						groupId,
						groupRunStartStatus: startResponse.status,
						groupRunStartError: startError,
					},
				});
				return await this.options.runStore.failRun({
					runId: run.runId,
					leaseOwner: run.leaseOwner,
					summary,
					errorText: `${summary}: ${startError}`,
					finishedAt: new Date(),
				});
			}

			const startedGroupRun = readGroupRun(startResponse.body);
			groupRunId = startedGroupRun.groupRunId;
			await this.options.runStore.updateRuntimeInfo({
				runId: run.runId,
				leaseOwner: run.leaseOwner,
				resolvedSnapshot: {
					executionType: "team_group",
					groupId,
					groupRunId,
					groupRunStatus: startedGroupRun.status,
				},
			});
			await this.options.runStore.appendEvent({
				runId: run.runId,
				leaseOwner: run.leaseOwner,
				eventType: "team_group_run_started",
				event: {
					connId: conn.connId,
					runId: run.runId,
					groupId,
					groupRunId,
				},
				createdAt: new Date(),
			});

			let groupRun = startedGroupRun;
			while (!TERMINAL_GROUP_RUN_STATUSES.has(groupRun.status)) {
				this.throwIfAborted(signal);
				const detailResponse = await this.fetchJson(`/v1/team/task-group-runs/${encodeURIComponent(groupRunId)}`, {
					method: "GET",
					signal,
				});
				if (!isSuccessStatus(detailResponse.status)) {
					const summary = `Team GroupRun poll failed with ${detailResponse.status}`;
					return await this.options.runStore.failRun({
						runId: run.runId,
						leaseOwner: run.leaseOwner,
						summary,
						errorText: `${summary}: ${readErrorMessage(detailResponse.body)}`,
						finishedAt: new Date(),
					});
				}
				groupRun = readGroupRun(detailResponse.body);
				await this.options.runStore.updateRuntimeInfo({
					runId: run.runId,
					leaseOwner: run.leaseOwner,
					resolvedSnapshot: {
						executionType: "team_group",
						groupId,
						groupRunId,
						groupRunStatus: groupRun.status,
					},
				});
				this.throwIfAborted(signal);
				if (!TERMINAL_GROUP_RUN_STATUSES.has(groupRun.status)) {
					await delay(this.pollIntervalMs, signal);
				}
			}

			return await this.finishFromGroupRun(run, groupId, groupRun);
		} catch (error) {
			if (groupRunId && isAbortLike(error, signal)) {
				await this.requestCancel(run, groupId, groupRunId);
			}
			throw error;
		}
	}

	private async finishFromGroupRun(
		run: ConnRunRecord,
		groupId: string,
		groupRun: TeamTaskGroupRunBody,
	): Promise<ConnRunRecord | undefined> {
		await this.options.runStore.updateRuntimeInfo({
			runId: run.runId,
			leaseOwner: run.leaseOwner,
			resolvedSnapshot: {
				executionType: "team_group",
				groupId,
				groupRunId: groupRun.groupRunId,
				groupRunStatus: groupRun.status,
			},
		});
		if (groupRun.status === "completed") {
			const summary = `Team GroupRun completed: ${groupRun.groupRunId}`;
			return await this.options.runStore.completeRun({
				runId: run.runId,
				leaseOwner: run.leaseOwner,
				summary,
				text: summary,
				finishedAt: new Date(),
			});
		}
		if (groupRun.status === "cancelled") {
			const summary = `Team GroupRun cancelled: ${groupRun.groupRunId}`;
			return await this.options.runStore.cancelRun({
				runId: run.runId,
				summary,
				text: summary,
				finishedAt: new Date(),
			});
		}
		const summary = `Team GroupRun ${groupRun.status}: ${groupRun.lastError ?? groupRun.groupRunId}`;
		return await this.options.runStore.failRun({
			runId: run.runId,
			leaseOwner: run.leaseOwner,
			summary,
			errorText: summary,
			finishedAt: new Date(),
		});
	}

	private async requestCancel(run: ConnRunRecord, groupId: string, groupRunId: string): Promise<void> {
		await this.options.runStore.appendEvent({
			runId: run.runId,
			leaseOwner: run.leaseOwner,
			eventType: "team_group_run_cancel_requested",
			event: {
				groupId,
				groupRunId,
			},
		}).catch(() => undefined);
		await this.fetchJson(`/v1/team/task-group-runs/${encodeURIComponent(groupRunId)}/cancel`, {
			method: "POST",
		}).catch(() => undefined);
	}

	private async fetchJson(path: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
		const hasBody = init.body !== undefined && init.body !== null;
		const response = await this.fetchFn(`${this.apiBaseUrl}${path}`, {
			...init,
			headers: {
				...(hasBody ? { "content-type": "application/json" } : {}),
				...(init.headers ?? {}),
			},
		});
		const text = await response.text();
		if (!text.trim()) {
			return { status: response.status, body: {} };
		}
		try {
			return { status: response.status, body: JSON.parse(text) as unknown };
		} catch {
			return { status: response.status, body: { error: text } };
		}
	}

	private throwIfAborted(signal: AbortSignal | undefined): void {
		if (!signal?.aborted) {
			return;
		}
		throw signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason ?? "aborted"));
	}
}

function readGroupRun(body: unknown): TeamTaskGroupRunBody {
	const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
	const groupRun = record.groupRun && typeof record.groupRun === "object" ? record.groupRun as Record<string, unknown> : {};
	const groupRunId = typeof groupRun.groupRunId === "string" ? groupRun.groupRunId.trim() : "";
	const groupId = typeof groupRun.groupId === "string" ? groupRun.groupId.trim() : "";
	const status = typeof groupRun.status === "string" ? groupRun.status : "";
	if (!groupRunId || !groupId || !isTeamTaskGroupRunStatus(status)) {
		throw new Error("Team GroupRun response is invalid");
	}
	return {
		groupRunId,
		groupId,
		status,
		lastError: typeof groupRun.lastError === "string" ? groupRun.lastError : null,
	};
}

function isTeamTaskGroupRunStatus(value: string): value is TeamTaskGroupRunStatus {
	return (
		value === "queued" ||
		value === "running" ||
		value === "completed" ||
		value === "completed_with_failures" ||
		value === "failed" ||
		value === "cancelled"
	);
}

function isSuccessStatus(status: number): boolean {
	return status >= 200 && status < 300;
}

function readErrorMessage(body: unknown): string {
	const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
	if (typeof record.error === "string") {
		return record.error;
	}
	const nestedError = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : {};
	if (typeof nestedError.message === "string") {
		return nestedError.message;
	}
	return JSON.stringify(body);
}

function resolveSkippedSummary(body: unknown): string {
	const message = readErrorMessage(body);
	if (/group contains active task run/i.test(message)) {
		return "Skipped: group contains active task run";
	}
	if (/active task group run|group already running/i.test(message)) {
		return "Skipped: group already running";
	}
	return `Skipped: ${message || "team group active guard"}`;
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
	if (!signal) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
	if (signal.aborted) {
		return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason ?? "aborted")));
	}
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason ?? "aborted")));
			},
			{ once: true },
		);
	});
}

function isAbortLike(error: unknown, signal: AbortSignal | undefined): boolean {
	return signal?.aborted || (error instanceof Error && /abort|cancel/i.test(error.message));
}
