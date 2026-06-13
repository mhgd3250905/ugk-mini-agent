import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SKILL_PATH = ".pi/skills/conn-maintenance/SKILL.md";

test("conn-maintenance skill requires dry-run and confirmation before cleanup", async () => {
	const skill = await readFile(SKILL_PATH, "utf8");

	assert.match(skill, /name: conn-maintenance/);
	assert.match(skill, /--dry-run/);
	assert.match(skill, /请确认是否执行正式清理/);
	assert.match(skill, /maintain-conn-db\.mjs/);
	assert.match(skill, /Get-Date -Format "yyyyMMdd-HHmmss"/);
	assert.match(skill, /conn-pre-maintenance-\$stamp/);
	assert.match(skill, /runs `VACUUM` and `PRAGMA wal_checkpoint\(TRUNCATE\)` by default/);
	assert.match(skill, /conn_run_events/);
	assert.match(skill, /Never delete `conn\.sqlite`/);
	assert.match(skill, /Never delete `conn_runs`/);
	assert.match(skill, /Never delete `conn_run_files`/);
	assert.match(skill, /GET \/v1\/debug\/runtime/);
	assert.match(skill, /GET \/v1\/conns/);
});
