import type { FastifyInstance } from "fastify";
import type { ConnDatabase } from "../agent/conn-db.js";
import type { CleanupDebugResponseBody } from "../types/api.js";

interface CleanupDebugRouteDependencies {
	database?: ConnDatabase;
	now?: () => Date;
}

interface ConnTargetRow {
	target_json: string;
	status: string;
	deleted_at?: string | null;
}

interface CountRow {
	count: number;
}

interface NotificationStatsRow {
	total: number;
	conn_source_total: number;
	latest_created_at?: string | null;
}

interface RecentRunRow {
	run_id: string;
	conn_id: string;
	status: string;
}

const WINDOW_DAYS = 7;
const KNOWN_CONN_TARGET_TYPES = ["task_inbox", "conversation"] as const;

export function registerCleanupDebugRoutes(app: FastifyInstance, deps: CleanupDebugRouteDependencies = {}): void {
	app.get<{ Querystring: { since?: string } }>("/v1/debug/cleanup", async (request): Promise<CleanupDebugResponseBody> => {
		if (!deps.database) {
			return {
				ok: false,
				connTargets: emptyConnTargets(),
				legacyConversationNotifications: {
					total: 0,
					connSourceTotal: 0,
				},
				recentRuns: emptyRecentRuns(),
				risks: ["cleanup debug database is unavailable"],
			};
		}

		const now = deps.now?.() ?? new Date();
		const since = parseSinceQuery(request.query.since) ?? new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
		const connTargets = readConnTargetStats(deps.database);
		const legacyConversationNotifications = readConversationNotificationStats(deps.database);
		const recentRuns = readRecentRunStats(deps.database, since);
		const risks = buildCleanupRisks(connTargets, legacyConversationNotifications, recentRuns);

		return {
			ok: risks.length === 0,
			connTargets,
			legacyConversationNotifications,
			recentRuns,
			risks,
		};
	});
}

function emptyConnTargets(): CleanupDebugResponseBody["connTargets"] {
	return {
		total: 0,
		active: 0,
		byType: {
			task_inbox: 0,
			conversation: 0,
			invalid: 0,
		},
	};
}

function emptyRecentRuns(): CleanupDebugResponseBody["recentRuns"] {
	return {
		windowDays: WINDOW_DAYS,
		total: 0,
		succeeded: 0,
		failed: 0,
		cancelled: 0,
		withActivity: 0,
		withoutActivity: 0,
		withOutputFiles: 0,
		withoutOutputFiles: 0,
		succeededWithoutOutputFiles: 0,
		failedWithoutOutputFiles: 0,
		cancelledWithoutOutputFiles: 0,
	};
}

function parseSinceQuery(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	const timestamp = new Date(value);
	return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
}

function readConnTargetStats(database: ConnDatabase): CleanupDebugResponseBody["connTargets"] {
	const rows = database.all<ConnTargetRow>("SELECT target_json, status, deleted_at FROM conns WHERE deleted_at IS NULL");
	const stats = emptyConnTargets();
	stats.total = rows.length;
	for (const row of rows) {
		if (row.status === "active") {
			stats.active += 1;
		}
		const targetType = readConnTargetType(row.target_json);
		if (targetType && isKnownTargetType(targetType)) {
			stats.byType[targetType] += 1;
		} else {
			stats.byType.invalid += 1;
		}
	}
	return stats;
}

function readConversationNotificationStats(
	database: ConnDatabase,
): CleanupDebugResponseBody["legacyConversationNotifications"] {
	if (!database.hasTable("conversation_notifications")) {
		return {
			total: 0,
			connSourceTotal: 0,
		};
	}
	const row = database.get<NotificationStatsRow>(
		[
			"SELECT",
			"COUNT(*) AS total,",
			"COALESCE(SUM(CASE WHEN source = 'conn' THEN 1 ELSE 0 END), 0) AS conn_source_total,",
			"MAX(created_at) AS latest_created_at",
			"FROM conversation_notifications",
		].join(" "),
	);
	return {
		total: Number(row?.total ?? 0),
		connSourceTotal: Number(row?.conn_source_total ?? 0),
		...(row?.latest_created_at ? { latestCreatedAt: row.latest_created_at } : {}),
	};
}

function readRecentRunStats(database: ConnDatabase, since: string): CleanupDebugResponseBody["recentRuns"] {
	const runs = database.all<RecentRunRow>(
		[
			"SELECT run_id, conn_id, status",
			"FROM conn_runs",
			"WHERE created_at >= ? OR scheduled_at >= ? OR finished_at >= ?",
		].join(" "),
		since,
		since,
		since,
	);
	const runIds = runs.map((run) => run.run_id);
	const activityRunIds = readExistingRunIds(database, "agent_activity_items", runIds);
	const outputFileRunIds = readExistingRunIds(database, "conn_run_files", runIds);
	const stats = emptyRecentRuns();
	stats.total = runs.length;
	for (const run of runs) {
		if (run.status === "succeeded") {
			stats.succeeded += 1;
		} else if (run.status === "failed") {
			stats.failed += 1;
		} else if (run.status === "cancelled") {
			stats.cancelled += 1;
		}
		if (activityRunIds.has(run.run_id)) {
			stats.withActivity += 1;
		} else {
			stats.withoutActivity += 1;
		}
		const hasOutputFiles = outputFileRunIds.has(run.run_id);
		if (hasOutputFiles) {
			stats.withOutputFiles += 1;
		} else {
			stats.withoutOutputFiles += 1;
			if (run.status === "succeeded") {
				stats.succeededWithoutOutputFiles += 1;
			} else if (run.status === "failed") {
				stats.failedWithoutOutputFiles += 1;
			} else if (run.status === "cancelled") {
				stats.cancelledWithoutOutputFiles += 1;
			}
		}
	}
	return stats;
}

function readExistingRunIds(database: ConnDatabase, tableName: "agent_activity_items" | "conn_run_files", runIds: string[]): Set<string> {
	if (runIds.length === 0) {
		return new Set();
	}
	const placeholders = runIds.map(() => "?").join(", ");
	const rows = database.all<{ run_id: string }>(
		`SELECT DISTINCT run_id FROM ${tableName} WHERE run_id IN (${placeholders})`,
		...runIds,
	);
	return new Set(rows.map((row) => row.run_id));
}

function buildCleanupRisks(
	connTargets: CleanupDebugResponseBody["connTargets"],
	legacyConversationNotifications: CleanupDebugResponseBody["legacyConversationNotifications"],
	recentRuns: CleanupDebugResponseBody["recentRuns"],
): string[] {
	const risks: string[] = [];
	if (connTargets.byType.conversation > 0) {
		risks.push(`legacy conversation conn targets still exist: ${connTargets.byType.conversation}`);
	}
	if (connTargets.byType.invalid > 0) {
		risks.push(`invalid conn target rows found: ${connTargets.byType.invalid}`);
	}
	if (legacyConversationNotifications.connSourceTotal > 0) {
		risks.push(`legacy conn conversation notifications still exist: ${legacyConversationNotifications.connSourceTotal}`);
	}
	if (recentRuns.withoutActivity > 0) {
		risks.push(`recent conn runs without task inbox activity: ${recentRuns.withoutActivity}`);
	}
	if (recentRuns.succeededWithoutOutputFiles > 0) {
		risks.push(`recent succeeded conn runs without indexed output files: ${recentRuns.succeededWithoutOutputFiles}`);
	}
	return risks;
}

function readConnTargetType(targetJson: string): string | undefined {
	try {
		const target = JSON.parse(targetJson) as { type?: unknown };
		return typeof target.type === "string" ? target.type : undefined;
	} catch {
		return undefined;
	}
}

function isKnownTargetType(value: string): value is (typeof KNOWN_CONN_TARGET_TYPES)[number] {
	return (KNOWN_CONN_TARGET_TYPES as readonly string[]).includes(value);
}
