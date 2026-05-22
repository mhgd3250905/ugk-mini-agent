import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConnDatabase } from "../src/agent/conn-db.js";
import { ConnRunStore } from "../src/agent/conn-run-store.js";
import { ConnSqliteStore } from "../src/agent/conn-sqlite-store.js";

async function createStores(): Promise<{
	connStore: ConnSqliteStore;
	runStore: ConnRunStore;
	database: ConnDatabase;
}> {
	const dir = await mkdtemp(join(tmpdir(), "ugk-pi-conn-run-store-"));
	const database = new ConnDatabase({ dbPath: join(dir, "conn.sqlite") });
	await database.initialize();
	return {
		database,
		connStore: new ConnSqliteStore({ database }),
		runStore: new ConnRunStore({ database }),
	};
}

test("ConnRunStore creates due runs and leases them to one worker at a time", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "daily digest",
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
	const run = await runStore.createRun({
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-1",
		resolvedSnapshot: {
			profileId: "background.default",
			skillSetId: "skills.default",
		},
		now: new Date("2026-04-21T10:00:59.000Z"),
	});

	assert.equal(run.status, "pending");

	const firstClaim = await runStore.claimNextDue({
		workerId: "worker-a",
		now: new Date("2026-04-21T10:01:00.000Z"),
		leaseMs: 30_000,
	});
	assert.equal(firstClaim?.runId, run.runId);
	assert.equal(firstClaim?.status, "running");
	assert.equal(firstClaim?.leaseOwner, "worker-a");
	assert.equal(firstClaim?.leaseUntil, "2026-04-21T10:01:30.000Z");
	assert.deepEqual(firstClaim?.resolvedSnapshot, {
		profileId: "background.default",
		skillSetId: "skills.default",
	});

	const secondClaim = await runStore.claimNextDue({
		workerId: "worker-b",
		now: new Date("2026-04-21T10:01:15.000Z"),
		leaseMs: 30_000,
	});
	assert.equal(secondClaim, undefined);

	const recoveredClaim = await runStore.claimNextDue({
		workerId: "worker-b",
		now: new Date("2026-04-21T10:01:31.000Z"),
		leaseMs: 30_000,
	});
	assert.equal(recoveredClaim?.runId, run.runId);
	assert.equal(recoveredClaim?.leaseOwner, "worker-b");
	assert.equal(recoveredClaim?.leaseUntil, "2026-04-21T10:02:01.000Z");

	database.close();
});

test("ConnRunStore tolerates malformed optional JSON fields when reading runs and events", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "daily digest",
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
	await runStore.createRun({
		runId: "run-bad-json",
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-bad-json",
		resolvedSnapshot: {
			profileId: "background.default",
		},
		now: new Date("2026-04-21T10:00:59.000Z"),
	});
	database.run(
		"UPDATE conn_runs SET resolved_snapshot_json = ? WHERE run_id = ?",
		"{not-json",
		"run-bad-json",
	);
	database.run(
		"INSERT INTO conn_run_events (event_id, run_id, seq, event_type, event_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		"event-bad-json",
		"run-bad-json",
		1,
		"log",
		"{not-json",
		"2026-04-21T10:01:00.000Z",
	);

	const run = await runStore.getRun("run-bad-json");
	assert.equal(run?.runId, "run-bad-json");
	assert.equal(run?.resolvedSnapshot, undefined);
	assert.deepEqual(await runStore.listEvents("run-bad-json"), [
		{
			eventId: "event-bad-json",
			runId: "run-bad-json",
			seq: 1,
			eventType: "log",
			event: {},
			createdAt: "2026-04-21T10:01:00.000Z",
		},
	]);

	database.close();
});

test("ConnRunStore lists the latest run for each requested conn in one batch", async () => {
	const { connStore, runStore, database } = await createStores();
	const firstConn = await connStore.create({
		title: "first digest",
		prompt: "summarize first",
		target: {
			type: "conversation",
			conversationId: "manual:first",
		},
		schedule: {
			kind: "interval",
			everyMs: 60_000,
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});
	const secondConn = await connStore.create({
		title: "second digest",
		prompt: "summarize second",
		target: {
			type: "conversation",
			conversationId: "manual:second",
		},
		schedule: {
			kind: "interval",
			everyMs: 60_000,
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});
	await runStore.createRun({
		runId: "run-first-old",
		connId: firstConn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-first-old",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});
	await runStore.createRun({
		runId: "run-first-new",
		connId: firstConn.connId,
		scheduledAt: "2026-04-21T10:02:00.000Z",
		workspacePath: "/tmp/conn/run-first-new",
		now: new Date("2026-04-21T10:01:59.000Z"),
	});
	await runStore.createRun({
		runId: "run-second",
		connId: secondConn.connId,
		scheduledAt: "2026-04-21T10:01:30.000Z",
		workspacePath: "/tmp/conn/run-second",
		now: new Date("2026-04-21T10:01:29.000Z"),
	});

	const latestRuns = await runStore.listLatestRunsForConns([
		firstConn.connId,
		secondConn.connId,
		"conn-missing",
	]);

	assert.equal(latestRuns[firstConn.connId]?.runId, "run-first-new");
	assert.equal(latestRuns[secondConn.connId]?.runId, "run-second");
	assert.equal(latestRuns["conn-missing"], undefined);
	database.close();
});

test("ConnRunStore returns the newest active run for a conn", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "active digest",
		prompt: "summarize active",
		target: { type: "task_inbox" },
		schedule: { kind: "interval", everyMs: 60_000 },
		now: new Date("2026-04-21T10:00:00.000Z"),
	});
	await runStore.createRun({
		runId: "run-pending-old",
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-pending-old",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});
	await runStore.createRun({
		runId: "run-pending-new",
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:02:00.000Z",
		workspacePath: "/tmp/conn/run-pending-new",
		now: new Date("2026-04-21T10:01:59.000Z"),
	});
	await runStore.createRun({
		runId: "run-finished",
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:03:00.000Z",
		workspacePath: "/tmp/conn/run-finished",
		now: new Date("2026-04-21T10:02:59.000Z"),
	});
	database.run("UPDATE conn_runs SET status = ?, finished_at = ? WHERE run_id = ?", "succeeded", "2026-04-21T10:04:00.000Z", "run-finished");

	assert.equal((await runStore.getActiveRunForConn(conn.connId))?.runId, "run-pending-new");
	assert.equal(await runStore.getActiveRunForConn("missing-conn"), undefined);

	database.close();
});

test("ConnRunStore atomically reuses an active run when creating manually", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "manual digest",
		prompt: "summarize manual",
		target: { type: "task_inbox" },
		schedule: { kind: "interval", everyMs: 60_000 },
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	const first = await runStore.createRunUnlessActive({
		runId: "run-first",
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-first",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});
	const second = await runStore.createRunUnlessActive({
		runId: "run-second",
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:02:00.000Z",
		workspacePath: "/tmp/conn/run-second",
		now: new Date("2026-04-21T10:01:59.000Z"),
	});

	assert.equal(first.reused, false);
	assert.equal(first.run.runId, "run-first");
	assert.equal(second.reused, true);
	assert.equal(second.run.runId, "run-first");
	assert.deepEqual(
		(await runStore.listRunsForConn(conn.connId)).map((run) => run.runId),
		["run-first"],
	);

	database.close();
});

test("ConnRunStore scopes total unread counts and mark-all-read to requested conns", async () => {
	const { connStore, runStore, database } = await createStores();
	const visibleConn = await connStore.create({
		title: "visible digest",
		prompt: "summarize visible",
		target: { type: "task_inbox" },
		schedule: { kind: "interval", everyMs: 60_000 },
		now: new Date("2026-04-21T10:00:00.000Z"),
	});
	const deletedConn = await connStore.create({
		title: "deleted digest",
		prompt: "summarize deleted",
		target: { type: "task_inbox" },
		schedule: { kind: "interval", everyMs: 60_000 },
		now: new Date("2026-04-21T10:00:00.000Z"),
	});
	await runStore.createRun({
		runId: "run-visible",
		connId: visibleConn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-visible",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});
	await runStore.createRun({
		runId: "run-deleted",
		connId: deletedConn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-deleted",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});
	database.run("UPDATE conn_runs SET status = ?, finished_at = ? WHERE run_id = ?", "succeeded", "2026-04-21T10:02:00.000Z", "run-visible");
	database.run("UPDATE conn_runs SET status = ?, finished_at = ? WHERE run_id = ?", "failed", "2026-04-21T10:02:00.000Z", "run-deleted");
	await connStore.delete(deletedConn.connId);

	assert.equal(await runStore.getTotalUnreadCount(), 2);
	assert.equal(await runStore.getTotalUnreadCount([visibleConn.connId]), 1);
	assert.equal(await runStore.markAllRunsRead([visibleConn.connId]), 1);
	assert.equal(await runStore.getTotalUnreadCount([visibleConn.connId]), 0);
	assert.equal(await runStore.getTotalUnreadCount(), 1);

	database.close();
});

test("ConnRunStore uses run ids as stable timestamp tie-breakers for run lists and claims", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "daily digest",
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
	for (const runId of ["run-a", "run-b", "run-c"]) {
		await runStore.createRun({
			runId,
			connId: conn.connId,
			scheduledAt: "2026-04-21T10:01:00.000Z",
			workspacePath: `/tmp/conn/${runId}`,
			now: new Date("2026-04-21T10:00:59.000Z"),
		});
	}

	assert.deepEqual(
		(await runStore.listRunsForConn(conn.connId)).map((run) => run.runId),
		["run-c", "run-b", "run-a"],
	);
	assert.equal((await runStore.listLatestRunsForConns([conn.connId]))[conn.connId]?.runId, "run-c");
	assert.equal(
		(await runStore.claimNextDue({
			workerId: "worker-a",
			now: new Date("2026-04-21T10:01:00.000Z"),
			leaseMs: 30_000,
		}))?.runId,
		"run-a",
	);

	database.close();
});

test("ConnRunStore paginates run lists with stable scheduled-created-runId cursors", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "daily digest",
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
	for (const input of [
		{
			runId: "run-old",
			scheduledAt: "2026-04-21T10:01:00.000Z",
			now: "2026-04-21T10:00:01.000Z",
		},
		{
			runId: "run-tie-b",
			scheduledAt: "2026-04-21T10:02:00.000Z",
			now: "2026-04-21T10:00:02.000Z",
		},
		{
			runId: "run-tie-c",
			scheduledAt: "2026-04-21T10:02:00.000Z",
			now: "2026-04-21T10:00:02.000Z",
		},
		{
			runId: "run-new",
			scheduledAt: "2026-04-21T10:03:00.000Z",
			now: "2026-04-21T10:00:03.000Z",
		},
	]) {
		await runStore.createRun({
			runId: input.runId,
			connId: conn.connId,
			scheduledAt: input.scheduledAt,
			workspacePath: `/tmp/conn/${input.runId}`,
			now: new Date(input.now),
		});
	}

	const firstPage = await runStore.listRunsForConn(conn.connId, { limit: 2 });
	const secondPage = await runStore.listRunsForConn(conn.connId, {
		limit: 2,
		before: {
			scheduledAt: firstPage[1].scheduledAt,
			createdAt: firstPage[1].createdAt,
			runId: firstPage[1].runId,
		},
	});

	assert.deepEqual(
		firstPage.map((run) => run.runId),
		["run-new", "run-tie-c"],
	);
	assert.deepEqual(
		secondPage.map((run) => run.runId),
		["run-tie-b", "run-old"],
	);

	database.close();
});

test("ConnRunStore finalizes a run even when the owning conn schedule JSON is malformed", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "daily digest",
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
	const run = await runStore.createRun({
		runId: "run-bad-schedule",
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-bad-schedule",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});
	await runStore.claimNextDue({
		workerId: "worker-a",
		now: new Date("2026-04-21T10:01:00.000Z"),
		leaseMs: 30_000,
	});
	database.run(
		"UPDATE conns SET schedule_json = ? WHERE conn_id = ?",
		"{not-json",
		conn.connId,
	);

	const completed = await runStore.completeRun({
		runId: run.runId,
		leaseOwner: "worker-a",
		summary: "done",
		text: "full result",
		finishedAt: new Date("2026-04-21T10:01:05.000Z"),
	});

	assert.equal(completed?.status, "succeeded");
	assert.equal(completed?.resultSummary, "done");
	const updatedConnRow = database.get<{ status: string; last_run_id?: string; next_run_at?: string | null }>(
		"SELECT status, last_run_id, next_run_at FROM conns WHERE conn_id = ?",
		conn.connId,
	);
	assert.equal(updatedConnRow?.last_run_id, run.runId);
	assert.equal(updatedConnRow?.status, "completed");
	assert.equal(updatedConnRow?.next_run_at, null);

	database.close();
});

test("ConnRunStore heartbeatRun refreshes updatedAt and leaseUntil for the owning worker", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "daily digest",
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
	await runStore.createRun({
		runId: "run-heartbeat",
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-heartbeat",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});

	const claimed = await runStore.claimNextDue({
		workerId: "worker-a",
		now: new Date("2026-04-21T10:01:00.000Z"),
		leaseMs: 30_000,
	});
	assert.equal(claimed?.leaseUntil, "2026-04-21T10:01:30.000Z");

	const heartbeated = await runStore.heartbeatRun({
		runId: "run-heartbeat",
		workerId: "worker-a",
		now: new Date("2026-04-21T10:01:20.000Z"),
		leaseMs: 30_000,
	});
	assert.equal(heartbeated?.updatedAt, "2026-04-21T10:01:20.000Z");
	assert.equal(heartbeated?.leaseUntil, "2026-04-21T10:01:50.000Z");

	const rejectedHeartbeat = await runStore.heartbeatRun({
		runId: "run-heartbeat",
		workerId: "worker-b",
		now: new Date("2026-04-21T10:01:25.000Z"),
		leaseMs: 30_000,
	});
	assert.equal(rejectedHeartbeat?.updatedAt, "2026-04-21T10:01:20.000Z");
	assert.equal(rejectedHeartbeat?.leaseUntil, "2026-04-21T10:01:50.000Z");

	database.close();
});

test("ConnRunStore cancelRun cancels active runs and clears the worker lease", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "daily digest",
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
	const run = await runStore.createRun({
		runId: "run-cancel",
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-cancel",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});
	await runStore.claimNextDue({
		workerId: "worker-a",
		now: new Date("2026-04-21T10:01:00.000Z"),
		leaseMs: 30_000,
	});

	const cancelled = await runStore.cancelRun({
		runId: run.runId,
		summary: "Manually cancelled by operator",
		text: "Manually cancelled by operator",
		finishedAt: new Date("2026-04-21T10:01:10.000Z"),
	});

	assert.equal(cancelled?.status, "cancelled");
	assert.equal(cancelled?.finishedAt, "2026-04-21T10:01:10.000Z");
	assert.equal(cancelled?.leaseOwner, undefined);
	assert.equal(cancelled?.leaseUntil, undefined);
	assert.equal(cancelled?.resultSummary, "Manually cancelled by operator");
	assert.equal(cancelled?.resultText, "Manually cancelled by operator");
	assert.equal(cancelled?.errorText, undefined);
	const connAfterCancel = await connStore.get(conn.connId);
	assert.equal(connAfterCancel?.lastRunId, run.runId);
	assert.equal(connAfterCancel?.lastRunAt, "2026-04-21T10:01:10.000Z");
	assert.equal(await runStore.cancelRun({ runId: run.runId, summary: "again" }), undefined);

	database.close();
});

test("ConnRunStore rejects finishing a run when the lease owner no longer matches", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "daily digest",
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
	const run = await runStore.createRun({
		runId: "run-lease-owner",
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-lease-owner",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});

	await runStore.claimNextDue({
		workerId: "worker-a",
		now: new Date("2026-04-21T10:01:00.000Z"),
		leaseMs: 30_000,
	});
	await runStore.claimNextDue({
		workerId: "worker-b",
		now: new Date("2026-04-21T10:01:31.000Z"),
		leaseMs: 30_000,
	});

	const staleCompletion = await runStore.completeRun({
		runId: run.runId,
		leaseOwner: "worker-a",
		summary: "stale done",
		text: "stale result",
		finishedAt: new Date("2026-04-21T10:01:35.000Z"),
	});

	assert.equal(staleCompletion, undefined);
	const currentRun = await runStore.getRun(run.runId);
	assert.equal(currentRun?.status, "running");
	assert.equal(currentRun?.leaseOwner, "worker-b");
	assert.equal(currentRun?.resultSummary, undefined);
	assert.equal((await connStore.get(conn.connId))?.lastRunId, undefined);

	database.close();
});

test("ConnRunStore rejects stale lease owner runtime metadata, events, and files", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "daily digest",
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
	const run = await runStore.createRun({
		runId: "run-stale-metadata",
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-stale-metadata",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});

	await runStore.claimNextDue({
		workerId: "worker-a",
		now: new Date("2026-04-21T10:01:00.000Z"),
		leaseMs: 30_000,
	});
	await runStore.claimNextDue({
		workerId: "worker-b",
		now: new Date("2026-04-21T10:01:31.000Z"),
		leaseMs: 30_000,
	});

	assert.equal(
		await runStore.updateRuntimeInfo({
			runId: run.runId,
			leaseOwner: "worker-a",
			sessionFile: "/tmp/stale-session.jsonl",
		}),
		undefined,
	);
	assert.equal(
		await runStore.appendEvent({
			runId: run.runId,
			leaseOwner: "worker-a",
			eventType: "stale_progress",
			event: { message: "too late" },
		}),
		undefined,
	);
	assert.equal(
		await runStore.recordFile({
			runId: run.runId,
			leaseOwner: "worker-a",
			kind: "output",
			relativePath: "output/stale.txt",
			fileName: "stale.txt",
			mimeType: "text/plain",
			sizeBytes: 10,
		}),
		undefined,
	);

	const currentRun = await runStore.getRun(run.runId);
	assert.equal(currentRun?.leaseOwner, "worker-b");
	assert.equal(currentRun?.sessionFile, undefined);
	assert.deepEqual(await runStore.listEvents(run.runId), []);
	assert.deepEqual(await runStore.listFiles(run.runId), []);

	database.close();
});

test("ConnRunStore ignores unowned event writes after the owning conn has been deleted", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "deleted digest",
		prompt: "summarize",
		target: {
			type: "conversation",
			conversationId: "manual:conn",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});
	const run = await runStore.createRun({
		runId: "run-deleted-conn",
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-deleted-conn",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});
	await runStore.claimNextDue({
		workerId: "worker-a",
		now: new Date("2026-04-21T10:01:00.000Z"),
		leaseMs: 30_000,
	});
	await connStore.delete(conn.connId);

	const event = await runStore.appendEvent({
		runId: run.runId,
		eventType: "late_progress",
		event: { message: "too late" },
	});

	assert.equal(event, undefined);
	assert.deepEqual(await runStore.listEvents(run.runId), []);

	database.close();
});

test("ConnRunStore appends ordered run events and output file records", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "daily digest",
		prompt: "summarize",
		target: {
			type: "conversation",
			conversationId: "manual:conn",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});
	const run = await runStore.createRun({
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-2",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});

	const started = await runStore.appendEvent({
		runId: run.runId,
		eventType: "log",
		event: { message: "started" },
		createdAt: new Date("2026-04-21T10:01:00.000Z"),
	});
	const finished = await runStore.appendEvent({
		runId: run.runId,
		eventType: "log",
		event: { message: "finished" },
		createdAt: new Date("2026-04-21T10:01:05.000Z"),
	});
	assert.ok(started);
	assert.ok(finished);
	assert.equal(started.seq, 1);
	assert.equal(finished.seq, 2);
	assert.deepEqual(await runStore.listEvents(run.runId), [started, finished]);

	const file = await runStore.recordFile({
		runId: run.runId,
		kind: "output",
		relativePath: "output/report.md",
		fileName: "report.md",
		mimeType: "text/markdown",
		sizeBytes: 123,
		createdAt: new Date("2026-04-21T10:01:05.000Z"),
	});
	assert.ok(file);
	assert.deepEqual(await runStore.listFiles(run.runId), [file]);

	database.close();
});

test("ConnRunStore skips pure text delta message_update events", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "chatty digest",
		prompt: "summarize",
		target: {
			type: "conversation",
			conversationId: "manual:conn",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});
	const run = await runStore.createRun({
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-text-delta",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});

	const skipped = await runStore.appendEvent({
		runId: run.runId,
		eventType: "message_update",
		event: {
			type: "message_update",
			assistantMessageEvent: {
				type: "text_delta",
				delta: "hello",
			},
		},
		createdAt: new Date("2026-04-21T10:01:00.000Z"),
	});
	const toolUpdate = await runStore.appendEvent({
		runId: run.runId,
		eventType: "tool_execution_update",
		event: {
			type: "tool_execution_update",
			toolCallId: "call-1",
			partialResult: "started",
		},
		createdAt: new Date("2026-04-21T10:01:01.000Z"),
	});

	assert.equal(skipped, undefined);
	assert.ok(toolUpdate);
	assert.deepEqual(await runStore.listEvents(run.runId), [toolUpdate]);

	database.close();
});

test("ConnRunStore truncates oversized run events before storing them", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "large event digest",
		prompt: "summarize",
		target: {
			type: "conversation",
			conversationId: "manual:conn",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});
	const run = await runStore.createRun({
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-large-event",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});

	const event = await runStore.appendEvent({
		runId: run.runId,
		eventType: "tool_finished",
		event: {
			type: "tool_finished",
			result: "x".repeat(120_000),
			nested: {
				output: "y".repeat(120_000),
			},
		},
		createdAt: new Date("2026-04-21T10:01:00.000Z"),
	});
	const row = database.get<{ event_json: string }>(
		"SELECT event_json FROM conn_run_events WHERE run_id = ?",
		run.runId,
	);

	assert.ok(event);
	assert.equal(event.event.truncated, true);
	assert.equal(typeof event.event.result, "string");
	assert.match(String(event.event.result), /\[truncated/);
	assert.ok((row?.event_json.length ?? 0) < 80_000);

	database.close();
});

test("ConnRunStore retains only the newest bounded run events", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "chatty digest",
		prompt: "summarize",
		target: {
			type: "conversation",
			conversationId: "manual:conn",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});
	const run = await runStore.createRun({
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-chatty",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});

	for (let index = 0; index < 2_005; index += 1) {
		await runStore.appendEvent({
			runId: run.runId,
			eventType: "log",
			event: { message: `event-${index}` },
			createdAt: new Date("2026-04-21T10:01:00.000Z"),
		});
	}

	const rows = await runStore.listEvents(run.runId);
	assert.equal(rows.length, 2_000);
	assert.equal(rows[0]?.seq, 6);
	assert.equal(rows.at(-1)?.seq, 2005);

	database.close();
});

test("ConnRunStore completing a run updates the owning conn schedule state", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "daily digest",
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
	const run = await runStore.createRun({
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-3",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});
	await runStore.claimNextDue({
		workerId: "worker-a",
		now: new Date("2026-04-21T10:01:00.000Z"),
		leaseMs: 30_000,
	});

	const completed = await runStore.completeRun({
		runId: run.runId,
		summary: "done",
		text: "full result",
		finishedAt: new Date("2026-04-21T10:01:05.000Z"),
	});
	assert.equal(completed?.status, "succeeded");
	assert.equal(completed?.resultSummary, "done");
	assert.equal(completed?.resultText, "full result");
	assert.equal(completed?.leaseOwner, undefined);

	const updatedConn = await connStore.get(conn.connId);
	assert.equal(updatedConn?.lastRunAt, "2026-04-21T10:01:05.000Z");
	assert.equal(updatedConn?.lastRunId, run.runId);
	assert.equal(updatedConn?.nextRunAt, "2026-04-21T10:02:05.000Z");
	assert.equal(updatedConn?.status, "active");

	database.close();
});

test("ConnRunStore failing a once run marks the owning conn completed", async () => {
	const { connStore, runStore, database } = await createStores();
	const conn = await connStore.create({
		title: "one shot",
		prompt: "run once",
		target: {
			type: "conversation",
			conversationId: "manual:conn",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});
	const run = await runStore.createRun({
		connId: conn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-4",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});

	const failed = await runStore.failRun({
		runId: run.runId,
		summary: "boom",
		errorText: "background worker failed",
		finishedAt: new Date("2026-04-21T10:01:05.000Z"),
	});
	assert.equal(failed?.status, "failed");
	assert.equal(failed?.errorText, "background worker failed");

	const updatedConn = await connStore.get(conn.connId);
	assert.equal(updatedConn?.lastRunAt, "2026-04-21T10:01:05.000Z");
	assert.equal(updatedConn?.lastRunId, run.runId);
	assert.equal(updatedConn?.nextRunAt, undefined);
	assert.equal(updatedConn?.status, "completed");

	database.close();
});
