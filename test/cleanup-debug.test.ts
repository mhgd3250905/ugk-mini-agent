import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConnDatabase } from "../src/agent/conn-db.js";
import { registerCleanupDebugRoutes } from "../src/routes/cleanup-debug.js";

async function createCleanupDebugApp() {
	const root = await mkdtemp(join(tmpdir(), "ugk-cleanup-debug-"));
	const database = new ConnDatabase({ dbPath: join(root, "conn.sqlite") });
	await database.initialize();
	const app = Fastify({ logger: false });
	registerCleanupDebugRoutes(app, {
		database,
		now: () => new Date("2026-05-05T12:00:00.000Z"),
	});
	return { app, database };
}

test("GET /v1/debug/cleanup reports legacy conn cleanup signals", async () => {
	const { app, database } = await createCleanupDebugApp();
	try {
		insertConn(database, {
			connId: "conn-task-inbox",
			targetJson: JSON.stringify({ type: "task_inbox" }),
			status: "active",
		});
		insertConn(database, {
			connId: "conn-conversation",
			targetJson: JSON.stringify({ type: "conversation", conversationId: "manual:old" }),
			status: "active",
		});
		insertConn(database, {
			connId: "conn-invalid",
			targetJson: "{bad-json",
			status: "paused",
		});
		insertRun(database, {
			runId: "run-with-activity-output",
			connId: "conn-task-inbox",
			status: "succeeded",
			createdAt: "2026-05-05T11:00:00.000Z",
		});
		insertRun(database, {
			runId: "run-missing-activity-output",
			connId: "conn-conversation",
			status: "failed",
			createdAt: "2026-05-05T11:10:00.000Z",
		});
		insertRun(database, {
			runId: "run-old",
			connId: "conn-task-inbox",
			status: "succeeded",
			createdAt: "2026-04-01T00:00:00.000Z",
		});
		database.run(
			"INSERT INTO agent_activity_items (activity_id, scope, source, source_id, run_id, conversation_id, kind, title, text, files_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			"activity-1",
			"agent",
			"conn",
			"conn-task-inbox",
			"run-with-activity-output",
			undefined,
			"conn_result",
			"Done",
			"ok",
			"[]",
			"2026-05-05T11:00:01.000Z",
		);
		database.run(
			"INSERT INTO conn_run_files (file_id, run_id, kind, relative_path, file_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			"file-1",
			"run-with-activity-output",
			"output",
			"output/report.html",
			"report.html",
			"text/html; charset=utf-8",
			128,
			"2026-05-05T11:00:02.000Z",
		);
		createLegacyConversationNotificationsTable(database);
		database.run(
			"INSERT INTO conversation_notifications (notification_id, conversation_id, source, source_id, run_id, kind, title, text, files_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			"notification-1",
			"manual:old",
			"conn",
			"conn-conversation",
			"run-missing-activity-output",
			"conn_result",
			"Old",
			"legacy",
			"[]",
			"2026-05-05T11:10:00.000Z",
		);

		const response = await app.inject({
			method: "GET",
			url: "/v1/debug/cleanup",
		});

		assert.equal(response.statusCode, 200);
		assert.deepEqual(response.json(), {
			ok: false,
			connTargets: {
				total: 3,
				active: 2,
				byType: {
					task_inbox: 1,
					conversation: 1,
					invalid: 1,
				},
			},
			legacyConversationNotifications: {
				total: 1,
				connSourceTotal: 1,
				latestCreatedAt: "2026-05-05T11:10:00.000Z",
			},
			recentRuns: {
				windowDays: 7,
				total: 2,
				succeeded: 1,
				failed: 1,
				cancelled: 0,
				withActivity: 1,
				withoutActivity: 1,
				withOutputFiles: 1,
				withoutOutputFiles: 1,
				succeededWithoutOutputFiles: 0,
				failedWithoutOutputFiles: 1,
				cancelledWithoutOutputFiles: 0,
			},
			risks: [
				"legacy conversation conn targets still exist: 1",
				"invalid conn target rows found: 1",
				"legacy conn conversation notifications still exist: 1",
				"recent conn runs without task inbox activity: 1",
			],
		});
	} finally {
		await app.close();
		database.close();
	}
});

test("GET /v1/debug/cleanup returns an explicit unavailable status without a database", async () => {
	const app = Fastify({ logger: false });
	registerCleanupDebugRoutes(app);
	try {
		const response = await app.inject({
			method: "GET",
			url: "/v1/debug/cleanup",
		});

		assert.equal(response.statusCode, 200);
		assert.equal(response.json().ok, false);
		assert.deepEqual(response.json().risks, ["cleanup debug database is unavailable"]);
	} finally {
		await app.close();
	}
});

test("GET /v1/debug/cleanup flags succeeded runs without output files", async () => {
	const { app, database } = await createCleanupDebugApp();
	try {
		insertConn(database, {
			connId: "conn-task-inbox",
			targetJson: JSON.stringify({ type: "task_inbox" }),
			status: "active",
		});
		insertRun(database, {
			runId: "run-succeeded-no-output",
			connId: "conn-task-inbox",
			status: "succeeded",
			createdAt: "2026-05-05T11:00:00.000Z",
		});

		const response = await app.inject({
			method: "GET",
			url: "/v1/debug/cleanup",
		});

		assert.equal(response.statusCode, 200);
		const body = response.json();
		assert.equal(body.recentRuns.succeededWithoutOutputFiles, 1);
		assert.equal(body.recentRuns.failedWithoutOutputFiles, 0);
		assert.ok(body.risks.includes("recent succeeded conn runs without indexed output files: 1"));
	} finally {
		await app.close();
		database.close();
	}
});

test("GET /v1/debug/cleanup supports a since filter for recent runs", async () => {
	const { app, database } = await createCleanupDebugApp();
	try {
		insertConn(database, {
			connId: "conn-task-inbox",
			targetJson: JSON.stringify({ type: "task_inbox" }),
			status: "active",
		});
		insertRun(database, {
			runId: "run-before-fix-no-output",
			connId: "conn-task-inbox",
			status: "succeeded",
			createdAt: "2026-05-05T05:00:00.000Z",
		});
		insertRun(database, {
			runId: "run-after-fix-with-output",
			connId: "conn-task-inbox",
			status: "succeeded",
			createdAt: "2026-05-05T06:00:01.000Z",
		});
		database.run(
			"INSERT INTO agent_activity_items (activity_id, scope, source, source_id, run_id, conversation_id, kind, title, text, files_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			"activity-after-fix",
			"agent",
			"conn",
			"conn-task-inbox",
			"run-after-fix-with-output",
			undefined,
			"conn_result",
			"Done",
			"ok",
			"[]",
			"2026-05-05T06:00:02.000Z",
		);
		database.run(
			"INSERT INTO conn_run_files (file_id, run_id, kind, relative_path, file_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			"file-after-fix",
			"run-after-fix-with-output",
			"output",
			"output/report.md",
			"report.md",
			"text/plain; charset=utf-8",
			256,
			"2026-05-05T06:00:03.000Z",
		);

		const response = await app.inject({
			method: "GET",
			url: "/v1/debug/cleanup?since=2026-05-05T06:00:00.000Z",
		});

		assert.equal(response.statusCode, 200);
		const body = response.json();
		assert.equal(body.ok, true);
		assert.equal(body.recentRuns.total, 1);
		assert.equal(body.recentRuns.succeededWithoutOutputFiles, 0);
		assert.deepEqual(body.risks, []);
	} finally {
		await app.close();
		database.close();
	}
});

function insertConn(
	database: ConnDatabase,
	input: {
		connId: string;
		targetJson: string;
		status: string;
	},
): void {
	database.run(
		"INSERT INTO conns (conn_id, title, prompt, target_json, schedule_json, asset_refs_json, profile_id, agent_spec_id, skill_set_id, model_policy_id, upgrade_policy, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		input.connId,
		input.connId,
		"Prompt",
		input.targetJson,
		JSON.stringify({ kind: "once", at: "2026-05-05T12:00:00.000Z" }),
		"[]",
		"background.default",
		"agent.default",
		"skills.default",
		"model.default",
		"latest",
		input.status,
		"2026-05-05T10:00:00.000Z",
		"2026-05-05T10:00:00.000Z",
	);
}

function insertRun(
	database: ConnDatabase,
	input: {
		runId: string;
		connId: string;
		status: string;
		createdAt: string;
	},
): void {
	database.run(
		"INSERT INTO conn_runs (run_id, conn_id, status, scheduled_at, finished_at, workspace_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		input.runId,
		input.connId,
		input.status,
		input.createdAt,
		input.createdAt,
		`/tmp/${input.runId}`,
		input.createdAt,
		input.createdAt,
	);
}

function createLegacyConversationNotificationsTable(database: ConnDatabase): void {
	database.exec(`
CREATE TABLE conversation_notifications (
	notification_id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL,
	source TEXT NOT NULL,
	source_id TEXT NOT NULL,
	run_id TEXT,
	kind TEXT NOT NULL,
	title TEXT NOT NULL,
	text TEXT NOT NULL,
	files_json TEXT NOT NULL DEFAULT '[]',
	created_at TEXT NOT NULL,
	read_at TEXT,
	UNIQUE (source, source_id, run_id)
);
`);
}
