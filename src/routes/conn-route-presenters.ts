import type { ConnRunEventRecord, ConnRunFileRecord, ConnRunRecord } from "../agent/conn-run-store.js";
import type { ConnDefinition, ConnExecution } from "../agent/conn-store.js";
import type { ConnBody, ConnRunDetailResponseBody, ConnRunEventsResponseBody } from "../types/api.js";

export function toConnBody(conn: ConnDefinition): ConnBody {
	return {
		...conn,
		execution: normalizeConnExecution(conn.execution),
	};
}

export function toConnListBody(
	conn: ConnDefinition,
	latestRunsByConnId: Record<string, ConnRunRecord | undefined> | undefined,
): ConnBody {
	const latestRun = latestRunsByConnId?.[conn.connId];
	return {
		...toConnBody(conn),
		...(latestRunsByConnId ? { latestRun: latestRun ? toConnRunBody(latestRun) : null } : {}),
	};
}

export function sortConnListBodiesByRecentRun(conns: readonly ConnBody[]): ConnBody[] {
	return [...conns].sort(compareConnListBodiesByRecentRun);
}

function compareConnListBodiesByRecentRun(left: ConnBody, right: ConnBody): number {
	const leftTime = getConnRecentCompletedRunTimeMs(left);
	const rightTime = getConnRecentCompletedRunTimeMs(right);
	if (leftTime > 0 !== rightTime > 0) {
		return leftTime > 0 ? -1 : 1;
	}
	if (leftTime !== rightTime) {
		return rightTime - leftTime;
	}
	const leftFallbackTime = getConnFallbackTimeMs(left);
	const rightFallbackTime = getConnFallbackTimeMs(right);
	if (leftFallbackTime !== rightFallbackTime) {
		return rightFallbackTime - leftFallbackTime;
	}
	const titleCompare = String(left.title || "").localeCompare(String(right.title || ""), "zh-CN");
	if (titleCompare !== 0) {
		return titleCompare;
	}
	return String(left.connId || "").localeCompare(String(right.connId || ""));
}

function getConnRecentCompletedRunTimeMs(conn: ConnBody): number {
	const latestRun = conn.latestRun || undefined;
	const candidates = [latestRun?.finishedAt, conn.lastRunAt];
	return getFirstValidTimeMs(candidates);
}

function getConnFallbackTimeMs(conn: ConnBody): number {
	const latestRun = conn.latestRun || undefined;
	return getFirstValidTimeMs([latestRun?.updatedAt, latestRun?.createdAt, conn.updatedAt, conn.createdAt]);
}

function getFirstValidTimeMs(candidates: readonly unknown[]): number {
	for (const value of candidates) {
		const time = Date.parse(String(value || ""));
		if (Number.isFinite(time)) {
			return time;
		}
	}
	return 0;
}

function normalizeConnExecution(execution: ConnExecution | undefined): ConnExecution {
	if (execution?.type === "team_group" && typeof execution.groupId === "string" && execution.groupId.trim()) {
		return { type: "team_group", groupId: execution.groupId.trim() };
	}
	return { type: "agent_prompt" };
}

export function toConnRunBody(run: ConnRunRecord): ConnRunDetailResponseBody["run"] {
	return {
		runId: run.runId,
		connId: run.connId,
		status: run.status,
		scheduledAt: run.scheduledAt,
		...(run.claimedAt ? { claimedAt: run.claimedAt } : {}),
		...(run.startedAt ? { startedAt: run.startedAt } : {}),
		...(run.leaseOwner ? { leaseOwner: run.leaseOwner } : {}),
		...(run.leaseUntil ? { leaseUntil: run.leaseUntil } : {}),
		...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
		workspacePath: run.workspacePath,
		...(run.sessionFile ? { sessionFile: run.sessionFile } : {}),
		...(run.resolvedSnapshot ? { resolvedSnapshot: run.resolvedSnapshot } : {}),
		...(run.resultSummary ? { resultSummary: run.resultSummary } : {}),
		...(run.resultText ? { resultText: run.resultText } : {}),
		...(run.errorText ? { errorText: run.errorText } : {}),
		...(run.deliveredAt ? { deliveredAt: run.deliveredAt } : {}),
		...(run.retryOfRunId ? { retryOfRunId: run.retryOfRunId } : {}),
		createdAt: run.createdAt,
		updatedAt: run.updatedAt,
		...(run.readAt ? { readAt: run.readAt } : {}),
	};
}

export function toConnRunFileBody(
	file: ConnRunFileRecord,
	links?: { url?: string; latestUrl?: string },
): NonNullable<ConnRunDetailResponseBody["files"]>[number] {
	return {
		fileId: file.fileId,
		runId: file.runId,
		kind: file.kind,
		relativePath: file.relativePath,
		fileName: file.fileName,
		mimeType: file.mimeType,
		sizeBytes: file.sizeBytes,
		createdAt: file.createdAt,
		...(links?.url ? { url: links.url } : {}),
		...(links?.latestUrl ? { latestUrl: links.latestUrl } : {}),
	};
}

export function toConnRunEventBody(event: ConnRunEventRecord): ConnRunEventsResponseBody["events"][number] {
	return {
		eventId: event.eventId,
		runId: event.runId,
		seq: event.seq,
		eventType: event.eventType,
		event: event.event,
		createdAt: event.createdAt,
	};
}
