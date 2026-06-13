import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConnDatabase } from "../src/agent/conn-db.js";
import { ConnSqliteStore } from "../src/agent/conn-sqlite-store.js";

async function createConnSqliteStore(): Promise<{ store: ConnSqliteStore; database: ConnDatabase }> {
	const dir = await mkdtemp(join(tmpdir(), "ugk-pi-conn-sqlite-store-"));
	const database = new ConnDatabase({ dbPath: join(dir, "conn.sqlite") });
	await database.initialize();
	return {
		database,
		store: new ConnSqliteStore({ database }),
	};
}

test("ConnSqliteStore creates, gets, and lists conn definitions with runtime profile ids", async () => {
	const { store, database } = await createConnSqliteStore();

	const created = await store.create({
		title: " daily digest ",
		prompt: " Summarize the latest notes ",
		target: {
			type: "conversation",
			conversationId: "manual:conn",
		},
		schedule: {
			kind: "interval",
			everyMs: 60_000,
		},
		assetRefs: [" asset-1 ", "asset-1", "asset-2"],
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	assert.equal(created.title, "daily digest");
	assert.equal(created.prompt, "Summarize the latest notes");
	assert.deepEqual(created.assetRefs, ["asset-1", "asset-2"]);
	assert.equal(created.profileId, "background.default");
	assert.equal(created.agentSpecId, "agent.default");
	assert.equal(created.skillSetId, "skills.default");
	assert.equal(created.modelPolicyId, "model.default");
	assert.equal(created.upgradePolicy, "latest");
	assert.equal(created.nextRunAt, "2026-04-21T10:01:00.000Z");

	const found = await store.get(created.connId);
	assert.deepEqual(found, created);

	const listed = await store.list();
	assert.deepEqual(listed, [created]);

	database.close();
});

test("ConnSqliteStore persists task-level model selection", async () => {
	const { store, database } = await createConnSqliteStore();

	const created = await store.create({
		title: "model scoped task",
		prompt: "run with selected model",
		target: {
			type: "conversation",
			conversationId: "manual:model",
		},
		schedule: {
			kind: "interval",
			everyMs: 60_000,
		},
		modelProvider: "xiaomi-mimo-cn",
		modelId: "mimo-v2.5-pro",
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	assert.equal(created.modelProvider, "xiaomi-mimo-cn");
	assert.equal(created.modelId, "mimo-v2.5-pro");
	assert.equal((await store.get(created.connId))?.modelProvider, "xiaomi-mimo-cn");
	assert.equal((await store.get(created.connId))?.modelId, "mimo-v2.5-pro");

	const updated = await store.update(created.connId, {
		modelProvider: "zhipu-glm",
		modelId: "glm-5.1",
		now: new Date("2026-04-21T10:01:00.000Z"),
	});

	assert.equal(updated?.modelProvider, "zhipu-glm");
	assert.equal(updated?.modelId, "glm-5.1");

	database.close();
});

test("ConnSqliteStore persists and validates public site ids", async () => {
	const { store, database } = await createConnSqliteStore();

	const created = await store.create({
		title: "site task",
		prompt: "publish site",
		target: {
			type: "task_inbox",
		},
		schedule: {
			kind: "interval",
			everyMs: 60_000,
		},
		publicSiteId: "team-site",
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	assert.equal(created.publicSiteId, "team-site");
	assert.equal((await store.get(created.connId))?.publicSiteId, "team-site");
	await assert.rejects(
		() =>
			store.update(created.connId, {
				publicSiteId: "../team-site",
				now: new Date("2026-04-21T10:01:00.000Z"),
			}),
		/Invalid conn publicSiteId/,
	);

	database.close();
});

test("ConnSqliteStore skips malformed JSON conn rows instead of breaking list and detail reads", async () => {
	const { store, database } = await createConnSqliteStore();
	const healthy = await store.create({
		title: "healthy",
		prompt: "run",
		target: {
			type: "conversation",
			conversationId: "manual:healthy",
		},
		schedule: {
			kind: "interval",
			everyMs: 60_000,
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});
	database.run(
		[
			"INSERT INTO conns (",
			"conn_id, title, prompt, target_json, schedule_json, asset_refs_json,",
			"profile_id, agent_spec_id, skill_set_id, model_policy_id, upgrade_policy,",
			"status, created_at, updated_at",
			") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		].join(" "),
		"conn-bad-json",
		"bad",
		"run",
		"{not-json",
		JSON.stringify({ kind: "interval", everyMs: 60_000 }),
		"[]",
		"background.default",
		"agent.default",
		"skills.default",
		"model.default",
		"latest",
		"active",
		"2026-04-21T10:01:00.000Z",
		"2026-04-21T10:01:00.000Z",
	);

	assert.deepEqual(await store.list(), [healthy]);
	assert.equal(await store.get("conn-bad-json"), undefined);

	database.close();
});

test("ConnSqliteStore lists same-timestamp conn definitions with a stable id tie-breaker", async () => {
	const { store, database } = await createConnSqliteStore();
	for (const connId of ["conn-a", "conn-b", "conn-c"]) {
		database.run(
			[
				"INSERT INTO conns (",
				"conn_id, title, prompt, target_json, schedule_json, asset_refs_json,",
				"profile_id, agent_spec_id, skill_set_id, model_policy_id, upgrade_policy,",
				"status, created_at, updated_at",
				") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			].join(" "),
			connId,
			connId,
			"run",
			JSON.stringify({ type: "conversation", conversationId: `manual:${connId}` }),
			JSON.stringify({ kind: "interval", everyMs: 60_000 }),
			"[]",
			"background.default",
			"agent.default",
			"skills.default",
			"model.default",
			"latest",
			"active",
			"2026-04-21T10:00:00.000Z",
			"2026-04-21T10:00:00.000Z",
		);
	}

	assert.deepEqual(
		(await store.list()).map((conn) => conn.connId),
		["conn-c", "conn-b", "conn-a"],
	);

	database.close();
});

test("ConnSqliteStore updates, pauses, resumes, and deletes conn definitions", async () => {
	const { store, database } = await createConnSqliteStore();
	const created = await store.create({
		title: "digest",
		prompt: "summarize",
		target: {
			type: "conversation",
			conversationId: "manual:conn",
		},
		schedule: {
			kind: "interval",
			everyMs: 60_000,
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	const updated = await store.update(created.connId, {
		title: "weekly digest",
		assetRefs: ["asset-3"],
		schedule: {
			kind: "once",
			at: "2026-04-22T09:00:00.000Z",
		},
		now: new Date("2026-04-21T10:05:00.000Z"),
	});
	assert.equal(updated?.title, "weekly digest");
	assert.deepEqual(updated?.assetRefs, ["asset-3"]);
	assert.equal(updated?.nextRunAt, "2026-04-22T09:00:00.000Z");

	const paused = await store.pause(created.connId, new Date("2026-04-21T10:06:00.000Z"));
	assert.equal(paused?.status, "paused");
	assert.equal(paused?.nextRunAt, undefined);

	const resumed = await store.resume(created.connId, new Date("2026-04-21T10:07:00.000Z"));
	assert.equal(resumed?.status, "active");
	assert.equal(resumed?.nextRunAt, "2026-04-22T09:00:00.000Z");

	assert.equal(await store.delete(created.connId), true);
	assert.equal(await store.get(created.connId), undefined);

	database.close();
});

test("ConnSqliteStore soft delete hides conn and removes stale activity items", async () => {
	const { store, database } = await createConnSqliteStore();
	const created = await store.create({
		title: "test cleanup",
		prompt: "summarize",
		target: {
			type: "conversation",
			conversationId: "manual:conn",
		},
		schedule: {
			kind: "interval",
			everyMs: 60_000,
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	database.run(
		"INSERT INTO agent_activity_items (activity_id, scope, source, source_id, run_id, conversation_id, kind, title, text, files_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		"activity-1",
		"agent",
		"conn",
		created.connId,
		"run-1",
		"manual:conn",
		"conn_result",
		"done",
		"ok",
		"[]",
		"2026-04-21T10:01:00.000Z",
	);

	assert.equal(await store.delete(created.connId), true);
	assert.equal(await store.get(created.connId), undefined);
	assert.equal((await store.list()).some((conn) => conn.connId === created.connId), false);
	assert.match(
		database.get<{ deleted_at: string | null }>("SELECT deleted_at FROM conns WHERE conn_id = ?", created.connId)?.deleted_at ?? "",
		/^202/,
	);
	assert.equal(
		database.get<{ activity_id: string }>("SELECT activity_id FROM agent_activity_items WHERE source_id = ?", created.connId),
		undefined,
	);

	database.close();
});

test("ConnSqliteStore soft delete keeps long-lived run history rows out of the request path", async () => {
	const { store, database } = await createConnSqliteStore();
	const created = await store.create({
		title: "long lived",
		prompt: "run",
		target: {
			type: "conversation",
			conversationId: "manual:conn",
		},
		schedule: {
			kind: "interval",
			everyMs: 60_000,
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});
	database.run(
		"INSERT INTO conn_runs (run_id, conn_id, status, scheduled_at, workspace_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		"run-old",
		created.connId,
		"succeeded",
		"2026-04-21T10:01:00.000Z",
		"/tmp/run-old",
		"2026-04-21T10:01:00.000Z",
		"2026-04-21T10:02:00.000Z",
	);
	database.run(
		"INSERT INTO conn_run_events (event_id, run_id, seq, event_type, event_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		"event-old",
		"run-old",
		1,
		"run_succeeded",
		"{}",
		"2026-04-21T10:02:00.000Z",
	);

	assert.equal(await store.delete(created.connId), true);
	assert.equal(await store.get(created.connId), undefined);
	assert.equal(database.get<{ run_id: string }>("SELECT run_id FROM conn_runs WHERE run_id = ?", "run-old")?.run_id, "run-old");
	assert.equal(database.get<{ event_id: string }>("SELECT event_id FROM conn_run_events WHERE event_id = ?", "event-old")?.event_id, "event-old");

	database.close();
});

test("ConnSqliteStore bulk delete reports deleted and missing conn ids", async () => {
	const { store, database } = await createConnSqliteStore();
	const first = await store.create({
		title: "first",
		prompt: "run",
		target: {
			type: "conversation",
			conversationId: "manual:first",
		},
		schedule: {
			kind: "interval",
			everyMs: 60_000,
		},
	});
	const second = await store.create({
		title: "second",
		prompt: "run",
		target: {
			type: "conversation",
			conversationId: "manual:second",
		},
		schedule: {
			kind: "interval",
			everyMs: 60_000,
		},
	});

	const result = await store.deleteMany([first.connId, "missing", first.connId, second.connId]);

	assert.deepEqual(result, {
		deletedConnIds: [first.connId, second.connId],
		missingConnIds: ["missing"],
	});
	assert.equal(await store.get(first.connId), undefined);
	assert.equal(await store.get(second.connId), undefined);

	database.close();
});

test("ConnSqliteStore rejects invalid schedules with a clear validation error", async () => {
	const { store, database } = await createConnSqliteStore();

	await assert.rejects(
		() =>
			store.create({
				title: "bad schedule",
				prompt: "run",
				target: {
					type: "conversation",
					conversationId: "manual:conn",
				},
				schedule: {
					kind: "once",
					at: "not-a-date",
				},
			}),
		/Invalid conn schedule/,
	);

	database.close();
});

test("ConnSqliteStore rejects once schedules that are already in the past", async () => {
	const { store, database } = await createConnSqliteStore();

	await assert.rejects(
		() =>
			store.create({
				title: "past schedule",
				prompt: "run",
				target: {
					type: "conversation",
					conversationId: "manual:conn",
				},
				schedule: {
					kind: "once",
					at: "2026-04-21T09:59:00.000Z",
				},
				now: new Date("2026-04-21T10:00:00.000Z"),
			}),
		/once\.at .*past|past/i,
	);

	database.close();
});

test("ConnSqliteStore persists cron timezone and explicit runtime ids", async () => {
	const { store, database } = await createConnSqliteStore();

	const created = await store.create({
		title: "morning digest",
		prompt: "run every morning",
		target: {
			type: "conversation",
			conversationId: "manual:conn",
		},
		schedule: {
			kind: "cron",
			expression: "0 9 * * *",
			timezone: "Asia/Shanghai",
		},
		profileId: "background.zh",
		agentSpecId: "agent.daily",
		skillSetId: "skills.research",
		modelPolicyId: "model.stable",
		upgradePolicy: "pinned",
		maxRunMs: 120_000,
		now: new Date("2026-04-21T00:30:00.000Z"),
	});

	assert.deepEqual(created.schedule, {
		kind: "cron",
		expression: "0 9 * * *",
		timezone: "Asia/Shanghai",
	});
	assert.equal(created.profileId, "background.zh");
	assert.equal(created.agentSpecId, "agent.daily");
	assert.equal(created.skillSetId, "skills.research");
	assert.equal(created.modelPolicyId, "model.stable");
	assert.equal(created.upgradePolicy, "pinned");
	assert.equal(created.maxRunMs, 120_000);
	assert.equal(created.nextRunAt, "2026-04-21T01:00:00.000Z");

	database.close();
});

test("ConnSqliteStore defaults cron schedules to the user timezone instead of the host timezone", async () => {
	const previousTz = process.env.TZ;
	process.env.TZ = "UTC";
	const { store, database } = await createConnSqliteStore();
	try {
		const created = await store.create({
			title: "下午提醒",
			prompt: "北京时间下午 1 点提醒我",
			target: {
				type: "conversation",
				conversationId: "manual:conn",
			},
			schedule: {
				kind: "cron",
				expression: "0 13 * * *",
			},
			now: new Date("2026-04-23T04:30:00.000Z"),
		});

		assert.deepEqual(created.schedule, {
			kind: "cron",
			expression: "0 13 * * *",
			timezone: "Asia/Shanghai",
		});
		assert.equal(created.nextRunAt, "2026-04-23T05:00:00.000Z");
	} finally {
		database.close();
		if (previousTz === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = previousTz;
		}
	}
});

test("ConnSqliteStore interprets one-time wall-clock schedules in the provided timezone", async () => {
	const previousTz = process.env.TZ;
	process.env.TZ = "UTC";
	const { store, database } = await createConnSqliteStore();
	try {
		const created = await store.create({
			title: "一次性提醒",
			prompt: "北京时间下午 1 点提醒我",
			target: {
				type: "conversation",
				conversationId: "manual:conn",
			},
			schedule: {
				kind: "once",
				at: "2099-04-23T13:00:00",
				timezone: "Asia/Shanghai",
			} as never,
			now: new Date("2099-04-23T04:30:00.000Z"),
		});

		assert.equal(created.schedule.kind, "once");
		assert.equal(created.schedule.at, "2099-04-23T05:00:00.000Z");
		assert.equal(created.nextRunAt, "2099-04-23T05:00:00.000Z");
	} finally {
		database.close();
		if (previousTz === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = previousTz;
		}
	}
});

test("ConnSqliteStore rejects invalid maxRunMs values with a clear validation error", async () => {
	const { store, database } = await createConnSqliteStore();

	await assert.rejects(
		() =>
			store.create({
				title: "bad maxRunMs",
				prompt: "run",
				target: {
					type: "conversation",
					conversationId: "manual:conn",
				},
				schedule: {
					kind: "once",
					at: "2026-04-25T10:31:00.000Z",
				},
				maxRunMs: 0,
				now: new Date("2026-04-25T10:30:00.000Z"),
			}),
		/Invalid conn maxRunMs/,
	);

	database.close();
});

test("ConnSqliteStore rejects invalid cron timezones with a clear validation error", async () => {
	const { store, database } = await createConnSqliteStore();

	await assert.rejects(
		() =>
			store.create({
				title: "bad timezone",
				prompt: "run",
				target: {
					type: "conversation",
					conversationId: "manual:conn",
				},
				schedule: {
					kind: "cron",
					expression: "0 9 * * *",
					timezone: "Mars/Olympus",
				},
			}),
		/Invalid conn schedule: cron.timezone is invalid/,
	);

	database.close();
});
