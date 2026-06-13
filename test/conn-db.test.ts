import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConnDatabase, CONN_DATABASE_TABLES, isWalUnavailableError } from "../src/agent/conn-db.js";

async function createTempDbPath(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ugk-pi-conn-db-"));
	return join(dir, "nested", "conn.sqlite");
}

test("ConnDatabase initializes the sqlite schema and creates missing parent directories", async () => {
	const dbPath = await createTempDbPath();
	const database = new ConnDatabase({ dbPath });

	await database.initialize();

	assert.deepEqual(database.listTableNames(), CONN_DATABASE_TABLES);
	assert.equal(database.getUserVersion(), 11);
	assert.equal(
		database.all<{ name: string }>("PRAGMA table_info(conns)").some((column) => column.name === "max_run_ms"),
		true,
	);
	assert.equal(
		database.all<{ name: string }>("PRAGMA table_info(conns)").some((column) => column.name === "public_site_id"),
		true,
	);
	assert.equal(
		database.all<{ name: string }>("PRAGMA table_info(conns)").some((column) => column.name === "browser_id"),
		false,
	);

	database.close();
});

test("ConnDatabase initialization is idempotent and preserves existing rows", async () => {
	const dbPath = await createTempDbPath();
	const database = new ConnDatabase({ dbPath });

	await database.initialize();
	database.exec("INSERT INTO conns (conn_id, title, prompt, target_json, schedule_json, asset_refs_json, profile_id, agent_spec_id, skill_set_id, model_policy_id, upgrade_policy, status, created_at, updated_at) VALUES ('conn-1', 'Digest', 'Summarize', '{}', '{}', '[]', 'background.default', 'agent.default', 'skills.default', 'model.default', 'latest', 'active', '2026-04-21T00:00:00.000Z', '2026-04-21T00:00:00.000Z')");
	await database.initialize();

	const row = database.get<{ title: string }>("SELECT title FROM conns WHERE conn_id = ?", "conn-1");
	assert.deepEqual(row, { title: "Digest" });
	assert.deepEqual(database.listTableNames(), CONN_DATABASE_TABLES);

	database.close();
});

test("ConnDatabase enables WAL mode and busy timeout for worker-safe multi-process writes", async () => {
	const dbPath = await createTempDbPath();
	const database = new ConnDatabase({ dbPath });

	await database.initialize();

	const journalMode = database.get<{ journal_mode: string }>("PRAGMA journal_mode");
	const busyTimeout = database.get<{ timeout: number }>("PRAGMA busy_timeout");

	assert.equal(journalMode?.journal_mode?.toLowerCase(), "wal");
	assert.equal(busyTimeout?.timeout, 5000);

	database.close();
});

test("ConnDatabase treats WAL CANTOPEN errors as fallback-safe on Windows bind mounts", () => {
	assert.equal(isWalUnavailableError({ errcode: 14, errstr: "unable to open database file" }), true);
	assert.equal(isWalUnavailableError({ errcode: 4618, errstr: "disk I/O error" }), true);
	assert.equal(isWalUnavailableError({ errcode: 8, errstr: "attempt to write a readonly database" }), false);
});

test("ConnDatabase initializes the agent activity timeline schema", async () => {
	const dbPath = await createTempDbPath();
	const database = new ConnDatabase({ dbPath });

	await database.initialize();

	assert.equal(database.listTableNames().includes("agent_activity_items"), true);
	assert.equal(database.listTableNames().includes("conversation_notifications"), false);
	assert.equal(database.hasTable("conversation_notifications"), false);
	const connColumns = database.all<{ name: string }>("PRAGMA table_info(conns)");
	assert.equal(connColumns.some((column) => column.name === "deleted_at"), true);

	const activityColumns = database.all<{ name: string }>("PRAGMA table_info(agent_activity_items)");
	assert.deepEqual(
		activityColumns.map((column) => column.name),
		[
			"activity_id",
			"scope",
			"source",
			"source_id",
			"run_id",
			"conversation_id",
			"kind",
			"title",
			"text",
			"files_json",
			"created_at",
			"read_at",
		],
	);

	const indexes = database.all<{ name: string }>("PRAGMA index_list(agent_activity_items)");
	assert.equal(indexes.some((index) => index.name === "idx_agent_activity_created_at"), true);
	assert.equal(indexes.some((index) => index.name === "idx_agent_activity_conversation_id"), true);
	assert.equal(indexes.some((index) => index.name === "idx_agent_activity_source_run"), true);
	assert.equal(indexes.some((index) => index.name === "idx_agent_activity_source_run_unique"), true);

	database.close();
});

test("ConnDatabase drops the legacy conversation notifications table during migration", async () => {
	const dbPath = await createTempDbPath();
	const database = new ConnDatabase({ dbPath });

	await database.initialize();
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
PRAGMA user_version = 5;
`);
	assert.equal(database.hasTable("conversation_notifications"), true);

	await database.initialize();

	assert.equal(database.hasTable("conversation_notifications"), false);
	assert.equal(database.getUserVersion(), 11);

	database.close();
});

test("ConnDatabase migrates existing conn tables without restoring removed browser ids", async () => {
	const dbPath = await createTempDbPath();
	const database = new ConnDatabase({ dbPath });

	await database.initialize();
	database.exec(`
CREATE TABLE conns_legacy (
	conn_id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	prompt TEXT NOT NULL,
	target_json TEXT NOT NULL,
	schedule_json TEXT NOT NULL,
	asset_refs_json TEXT NOT NULL DEFAULT '[]',
	max_run_ms INTEGER,
	profile_id TEXT NOT NULL,
	agent_spec_id TEXT NOT NULL,
	skill_set_id TEXT NOT NULL,
	model_policy_id TEXT NOT NULL,
	model_provider TEXT,
	model_id TEXT,
	upgrade_policy TEXT NOT NULL DEFAULT 'latest',
	public_site_id TEXT,
	status TEXT NOT NULL DEFAULT 'active',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	last_run_at TEXT,
	next_run_at TEXT,
	last_run_id TEXT,
	deleted_at TEXT
);
INSERT INTO conns_legacy SELECT conn_id, title, prompt, target_json, schedule_json, asset_refs_json, max_run_ms, profile_id, agent_spec_id, skill_set_id, model_policy_id, model_provider, model_id, upgrade_policy, public_site_id, status, created_at, updated_at, last_run_at, next_run_at, last_run_id, deleted_at FROM conns;
DROP TABLE conns;
ALTER TABLE conns_legacy RENAME TO conns;
INSERT INTO conns (conn_id, title, prompt, target_json, schedule_json, asset_refs_json, profile_id, agent_spec_id, skill_set_id, model_policy_id, upgrade_policy, status, created_at, updated_at)
VALUES ('conn-legacy', 'Digest', 'Summarize', '{}', '{}', '[]', 'background.default', 'agent.default', 'skills.default', 'model.default', 'latest', 'active', '2026-04-21T00:00:00.000Z', '2026-04-21T00:00:00.000Z');
PRAGMA user_version = 7;
`);

	await database.initialize();

	const columns = database.all<{ name: string }>("PRAGMA table_info(conns)");
	assert.equal(columns.some((column) => column.name === "browser_id"), false);
	assert.equal(database.getUserVersion(), 11);
	assert.deepEqual(
		database.get<{ title: string }>(
			"SELECT title FROM conns WHERE conn_id = ?",
			"conn-legacy",
		),
		{ title: "Digest" },
	);

	database.close();
});

test("ConnDatabase enforces one agent activity item per source run", async () => {
	const dbPath = await createTempDbPath();
	const database = new ConnDatabase({ dbPath });

	await database.initialize();
	database.run(
		"INSERT INTO agent_activity_items (activity_id, scope, source, source_id, run_id, conversation_id, kind, title, text, files_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		"activity-1",
		"agent",
		"conn",
		"conn-1",
		"run-1",
		undefined,
		"conn_result",
		"first",
		"first text",
		"[]",
		"2026-04-22T10:01:05.000Z",
	);

	assert.throws(
		() =>
			database.run(
				"INSERT INTO agent_activity_items (activity_id, scope, source, source_id, run_id, conversation_id, kind, title, text, files_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
				"activity-2",
				"agent",
				"conn",
				"conn-1",
				"run-1",
				undefined,
				"conn_result",
				"second",
				"second text",
				"[]",
				"2026-04-22T10:02:05.000Z",
			),
		/UNIQUE constraint failed/,
	);

	database.close();
});

test("ConnDatabase migrates an existing legacy database into a new runtime path when configured", async () => {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-conn-db-migrate-"));
	const legacyDbPath = join(root, "legacy", "conn.sqlite");
	const runtimeDbPath = join(root, "runtime", "conn.sqlite");
	const legacyDatabase = new ConnDatabase({ dbPath: legacyDbPath });

	await legacyDatabase.initialize();
	legacyDatabase.exec(
		"INSERT INTO conns (conn_id, title, prompt, target_json, schedule_json, asset_refs_json, profile_id, agent_spec_id, skill_set_id, model_policy_id, upgrade_policy, status, created_at, updated_at) VALUES ('conn-legacy', 'Digest', 'Summarize', '{}', '{}', '[]', 'background.default', 'agent.default', 'skills.default', 'model.default', 'latest', 'active', '2026-04-21T00:00:00.000Z', '2026-04-21T00:00:00.000Z')",
	);
	legacyDatabase.close();
	await writeFile(`${legacyDbPath}-wal`, "legacy-wal", "utf8");

	const runtimeDatabase = new ConnDatabase({
		dbPath: runtimeDbPath,
		legacyDbPath,
	});

	await runtimeDatabase.initialize();

	const row = runtimeDatabase.get<{ title: string }>("SELECT title FROM conns WHERE conn_id = ?", "conn-legacy");
	assert.deepEqual(row, { title: "Digest" });
	assert.equal(runtimeDatabase.listTableNames().includes("conns"), true);
	assert.equal(
		runtimeDatabase.all<{ name: string }>("PRAGMA table_info(conns)").some((column) => column.name === "max_run_ms"),
		true,
	);
	runtimeDatabase.close();
});
