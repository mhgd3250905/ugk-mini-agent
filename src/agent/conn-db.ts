import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export const CONN_DATABASE_TABLES = [
	"agent_activity_items",
	"conns",
	"conn_runs",
	"conn_run_events",
	"conn_run_files",
] as const;

export interface ConnDatabaseOptions {
	dbPath: string;
	legacyDbPath?: string;
}

export function isWalUnavailableError(error: unknown): boolean {
	if (typeof error !== "object" || error === null || !("errcode" in error)) return false;
	const code = Number((error as { errcode: unknown }).errcode);
	if (code === 14) return true;
	// SQLITE_IOERR base=10, extended codes = 10 + N*256 (N=0..18, max=4618)
	return code >= 10 && code <= 4618 && (code - 10) % 256 === 0;
}

function configureJournalMode(db: DatabaseSync, dbPath: string): void {
	try {
		const row = db.prepare("PRAGMA journal_mode = WAL").get() as { journal_mode: string } | undefined;
		if (row?.journal_mode === "wal") return;
		// Succeeded but mode isn't wal — unusual, log and keep going
		console.warn("[conn-db] WAL requested but mode is:", row?.journal_mode, { dbPath });
		return;
	} catch (error) {
		if (!isWalUnavailableError(error)) throw error;
		console.warn("[conn-db] WAL unavailable (likely NTFS bind mount); falling back to DELETE", {
			dbPath,
			errcode: (error as { errcode?: unknown }).errcode,
			errstr: (error as { errstr?: unknown }).errstr,
		});
	}

	const fallback = db.prepare("PRAGMA journal_mode = DELETE").get() as { journal_mode: string } | undefined;
	if (fallback?.journal_mode !== "delete") {
		console.warn("[conn-db] Fallback DELETE mode not confirmed, actual mode:", fallback?.journal_mode, { dbPath });
	}
}

export class ConnDatabase {
	private db?: DatabaseSync;

	constructor(private readonly options: ConnDatabaseOptions) {}

	async initialize(): Promise<void> {
		await this.prepareDatabasePath();
		this.applySchema();
	}

	initializeSync(): void {
		this.prepareDatabasePathSync();
		this.applySchema();
	}

	exec(sql: string): void {
		this.open().exec(sql);
	}

	run(sql: string, ...params: unknown[]): void {
		this.open().prepare(sql).run(...normalizeSqlParams(params));
	}

	get<T>(sql: string, ...params: unknown[]): T | undefined {
		return normalizeRow(this.open().prepare(sql).get(...normalizeSqlParams(params))) as T | undefined;
	}

	all<T>(sql: string, ...params: unknown[]): T[] {
		return this.open().prepare(sql).all(...normalizeSqlParams(params)).map(normalizeRow) as T[];
	}

	listTableNames(): string[] {
		const rows = this.all<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
		);
		const existing = new Set(rows.map((row) => row.name));
		return CONN_DATABASE_TABLES.filter((tableName) => existing.has(tableName));
	}

	hasTable(tableName: string): boolean {
		const row = this.get<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
			tableName,
		);
		return row?.name === tableName;
	}

	getUserVersion(): number {
		const row = this.get<{ user_version: number }>("PRAGMA user_version");
		return row?.user_version ?? 0;
	}

	close(): void {
		this.db?.close();
		this.db = undefined;
	}

	private open(): DatabaseSync {
		if (!this.db) {
			this.db = new DatabaseSync(this.options.dbPath);
			configureJournalMode(this.db, this.options.dbPath);
			this.db.exec("PRAGMA synchronous = NORMAL");
			this.db.exec("PRAGMA foreign_keys = ON");
			this.db.exec("PRAGMA busy_timeout = 5000");
		}
		return this.db;
	}

	private applySchema(): void {
		const db = this.open();
		db.exec(SCHEMA_SQL);
		this.applyMigrations(db);
		db.exec("PRAGMA user_version = 11");
	}

	private async prepareDatabasePath(): Promise<void> {
		await mkdir(dirname(this.options.dbPath), { recursive: true });
		await this.copyLegacyDatabaseIfNeeded();
	}

	private prepareDatabasePathSync(): void {
		mkdirSync(dirname(this.options.dbPath), { recursive: true });
		this.copyLegacyDatabaseIfNeededSync();
	}

	private async copyLegacyDatabaseIfNeeded(): Promise<void> {
		const legacyDbPath = this.options.legacyDbPath;
		if (!legacyDbPath || legacyDbPath === this.options.dbPath || existsSync(this.options.dbPath) || !existsSync(legacyDbPath)) {
			return;
		}

		await copyFile(legacyDbPath, this.options.dbPath);
		await this.copySidecarFileIfExists(`${legacyDbPath}-wal`, `${this.options.dbPath}-wal`);
		await this.copySidecarFileIfExists(`${legacyDbPath}-shm`, `${this.options.dbPath}-shm`);
	}

	private copyLegacyDatabaseIfNeededSync(): void {
		const legacyDbPath = this.options.legacyDbPath;
		if (!legacyDbPath || legacyDbPath === this.options.dbPath || existsSync(this.options.dbPath) || !existsSync(legacyDbPath)) {
			return;
		}

		copyFileSync(legacyDbPath, this.options.dbPath);
		this.copySidecarFileIfExistsSync(`${legacyDbPath}-wal`, `${this.options.dbPath}-wal`);
		this.copySidecarFileIfExistsSync(`${legacyDbPath}-shm`, `${this.options.dbPath}-shm`);
	}

	private async copySidecarFileIfExists(sourcePath: string, targetPath: string): Promise<void> {
		if (!existsSync(sourcePath)) {
			return;
		}
		await copyFile(sourcePath, targetPath);
	}

	private copySidecarFileIfExistsSync(sourcePath: string, targetPath: string): void {
		if (!existsSync(sourcePath)) {
			return;
		}
		copyFileSync(sourcePath, targetPath);
	}

	private applyMigrations(db: DatabaseSync): void {
		const userVersion = this.getUserVersion();
		if (userVersion < 2 && !this.hasColumn("conns", "max_run_ms")) {
			db.exec("ALTER TABLE conns ADD COLUMN max_run_ms INTEGER");
		}
		if (userVersion < 4) {
			if (!this.hasColumn("conns", "model_provider")) {
				db.exec("ALTER TABLE conns ADD COLUMN model_provider TEXT");
			}
			if (!this.hasColumn("conns", "model_id")) {
				db.exec("ALTER TABLE conns ADD COLUMN model_id TEXT");
			}
		}
		if (userVersion < 5 && !this.hasColumn("conns", "deleted_at")) {
			db.exec("ALTER TABLE conns ADD COLUMN deleted_at TEXT");
		}
		if (userVersion < 6) {
			db.exec("DROP TABLE IF EXISTS conversation_notifications");
		}
		if (userVersion < 7 && !this.hasColumn("conns", "public_site_id")) {
			db.exec("ALTER TABLE conns ADD COLUMN public_site_id TEXT");
		}
		if (userVersion < 8 && !this.hasColumn("conns", "browser_id")) {
			db.exec("ALTER TABLE conns ADD COLUMN browser_id TEXT");
		}
		if (userVersion < 9 && !this.hasColumn("conn_runs", "read_at")) {
			db.exec("ALTER TABLE conn_runs ADD COLUMN read_at TEXT");
			db.exec("CREATE INDEX IF NOT EXISTS idx_conn_runs_unread ON conn_runs(conn_id, status, read_at)");
		}
		if (userVersion < 10 && !this.hasColumn("conns", "artifact_delivery_json")) {
			db.exec("ALTER TABLE conns ADD COLUMN artifact_delivery_json TEXT");
		}
		if (userVersion < 11 && !this.hasColumn("conns", "execution_json")) {
			db.exec("ALTER TABLE conns ADD COLUMN execution_json TEXT");
		}
		db.exec("CREATE INDEX IF NOT EXISTS idx_conns_deleted_at ON conns(deleted_at, created_at DESC)");
		if (userVersion < 3) {
			db.exec(
				[
					"DELETE FROM agent_activity_items",
					"WHERE run_id IS NOT NULL",
					"AND rowid NOT IN (",
					"SELECT MIN(rowid)",
					"FROM agent_activity_items",
					"WHERE run_id IS NOT NULL",
					"GROUP BY source, source_id, run_id",
					")",
				].join(" "),
			);
		}
		db.exec(
			[
				"CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_activity_source_run_unique",
				"ON agent_activity_items(source, source_id, run_id)",
				"WHERE run_id IS NOT NULL",
			].join(" "),
		);	}

	private hasColumn(tableName: string, columnName: string): boolean {
		const rows = this.all<{ name: string }>(`PRAGMA table_info(${tableName})`);
		return rows.some((row) => row.name === columnName);
	}
}

function normalizeSqlParams(params: unknown[]): SQLInputValue[] {
	return params.map((value) => (value === undefined ? null : value)) as SQLInputValue[];
}

function normalizeRow(row: unknown): Record<string, unknown> | undefined {
	if (!row || typeof row !== "object") {
		return undefined;
	}
	return Object.fromEntries(Object.entries(row));
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS conns (
	conn_id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	prompt TEXT NOT NULL,
	target_json TEXT NOT NULL,
	schedule_json TEXT NOT NULL,
	execution_json TEXT,
	asset_refs_json TEXT NOT NULL DEFAULT '[]',
	max_run_ms INTEGER,
	profile_id TEXT NOT NULL,
	browser_id TEXT,
	agent_spec_id TEXT NOT NULL,
	skill_set_id TEXT NOT NULL,
	model_policy_id TEXT NOT NULL,
	model_provider TEXT,
	model_id TEXT,
	upgrade_policy TEXT NOT NULL DEFAULT 'latest',
	public_site_id TEXT,
	artifact_delivery_json TEXT,
	status TEXT NOT NULL DEFAULT 'active',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	last_run_at TEXT,
	next_run_at TEXT,
	last_run_id TEXT,
	deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS conn_runs (
	run_id TEXT PRIMARY KEY,
	conn_id TEXT NOT NULL,
	status TEXT NOT NULL,
	scheduled_at TEXT NOT NULL,
	claimed_at TEXT,
	started_at TEXT,
	finished_at TEXT,
	lease_owner TEXT,
	lease_until TEXT,
	workspace_path TEXT NOT NULL,
	session_file TEXT,
	resolved_snapshot_json TEXT,
	result_summary TEXT,
	result_text TEXT,
	error_text TEXT,
	delivered_at TEXT,
	retry_of_run_id TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
		read_at TEXT,
	FOREIGN KEY (conn_id) REFERENCES conns(conn_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conn_run_events (
	event_id TEXT PRIMARY KEY,
	run_id TEXT NOT NULL,
	seq INTEGER NOT NULL,
	event_type TEXT NOT NULL,
	event_json TEXT NOT NULL,
	created_at TEXT NOT NULL,
	FOREIGN KEY (run_id) REFERENCES conn_runs(run_id) ON DELETE CASCADE,
	UNIQUE (run_id, seq)
);

CREATE TABLE IF NOT EXISTS conn_run_files (
	file_id TEXT PRIMARY KEY,
	run_id TEXT NOT NULL,
	kind TEXT NOT NULL,
	relative_path TEXT NOT NULL,
	file_name TEXT NOT NULL,
	mime_type TEXT NOT NULL,
	size_bytes INTEGER NOT NULL,
	created_at TEXT NOT NULL,
	FOREIGN KEY (run_id) REFERENCES conn_runs(run_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_activity_items (
	activity_id TEXT PRIMARY KEY,
	scope TEXT NOT NULL,
	source TEXT NOT NULL,
	source_id TEXT NOT NULL,
	run_id TEXT,
	conversation_id TEXT,
	kind TEXT NOT NULL,
	title TEXT NOT NULL,
	text TEXT NOT NULL,
	files_json TEXT NOT NULL DEFAULT '[]',
	created_at TEXT NOT NULL,
	read_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_conns_next_run_at ON conns(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_conn_runs_conn_id ON conn_runs(conn_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_conn_runs_claim ON conn_runs(status, lease_until, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_conn_run_events_run_id ON conn_run_events(run_id, seq);
CREATE INDEX IF NOT EXISTS idx_conn_run_files_run_id ON conn_run_files(run_id, kind);
CREATE INDEX IF NOT EXISTS idx_agent_activity_created_at ON agent_activity_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_conversation_id ON agent_activity_items(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_read_at ON agent_activity_items(read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_source_run ON agent_activity_items(source, source_id, run_id);
`;
