import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentActivityStore } from "../src/agent/agent-activity-store.js";
import { ConnDatabase } from "../src/agent/conn-db.js";
import type { ConnRunRecord } from "../src/agent/conn-run-store.js";
import { ConnRunStore } from "../src/agent/conn-run-store.js";
import { ConnSqliteStore } from "../src/agent/conn-sqlite-store.js";
import type { ConnDefinition } from "../src/agent/conn-store.js";
import type { NotificationBroadcastEvent } from "../src/agent/notification-hub.js";
import { ConnWorker } from "../src/workers/conn-worker.js";

class FakeRunner {
	calls: Array<{ conn: ConnDefinition; run: ConnRunRecord }> = [];

	async run(conn: ConnDefinition, run: ConnRunRecord, now: Date): Promise<ConnRunRecord | undefined> {
		this.calls.push({ conn, run });
		return {
			...run,
			status: "succeeded",
			resultSummary: `summary for ${conn.title}`,
			resultText: `result for ${conn.title}`,
			resolvedSnapshot: {
				provider: conn.modelProvider ?? "xiaomi-mimo-cn",
				model: conn.modelId ?? "mimo-v2.5-pro",
			},
			finishedAt: now.toISOString(),
		};
	}
}

async function createWorkerWithOptions(
	runner: FakeRunner | { run(conn: ConnDefinition, run: ConnRunRecord, now: Date, signal?: AbortSignal): Promise<ConnRunRecord | undefined> },
	options: {
		maxConcurrency?: number;
		leaseMs?: number;
		heartbeatMs?: number;
		activityNotifications?: string[];
	},
): Promise<{
	database: ConnDatabase;
	connStore: ConnSqliteStore;
	runStore: ConnRunStore;
	activityStore: AgentActivityStore;
	broadcasts: NotificationBroadcastEvent[];
	worker: ConnWorker;
}> {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-conn-worker-"));
	const database = new ConnDatabase({ dbPath: join(root, "conn.sqlite") });
	await database.initialize();
	const connStore = new ConnSqliteStore({ database });
	const runStore = new ConnRunStore({ database });
	const activityStore = new AgentActivityStore({ database });
	const broadcasts: NotificationBroadcastEvent[] = [];
	return {
		database,
		connStore,
		runStore,
		activityStore,
		broadcasts,
		worker: new ConnWorker({
			workerId: "worker-a",
			backgroundDataDir: join(root, "background"),
			connStore,
			runStore,
			activityStore,
			notificationBroadcaster: {
				broadcast: async (event) => {
					broadcasts.push(event);
				},
			},
			activityNotifier: options.activityNotifications
				? {
						notify: async (activity) => {
							options.activityNotifications?.push(`${activity.title}\n${activity.text}`);
						},
					}
				: undefined,
			runner,
			leaseMs: options.leaseMs ?? 30_000,
			heartbeatMs: options.heartbeatMs,
			maxConcurrency: options.maxConcurrency ?? 1,
		}),
	};
}

test("ConnWorker aborts an in-flight runner after an external run cancellation", async () => {
	let runStore: ConnRunStore;
	let activeRunId = "";
	let aborted = false;
	const runner = {
		run: async (_conn: ConnDefinition, run: ConnRunRecord, _now: Date, signal?: AbortSignal): Promise<ConnRunRecord | undefined> => {
			activeRunId = run.runId;
			await new Promise<void>((resolve, reject) => {
				signal?.addEventListener("abort", () => {
					aborted = true;
					reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
				}, { once: true });
				setTimeout(resolve, 1_000);
			});
			return undefined;
		},
	};
	const created = await createWorkerWithOptions(runner, {
		leaseMs: 60,
		heartbeatMs: 20,
	});
	const { database, connStore, worker } = created;
	runStore = created.runStore;
	const conn = await connStore.create({
		title: "Cancelable Run",
		prompt: "Summarize",
		target: {
			type: "conversation",
			conversationId: "manual:cancel",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	const tickPromise = worker.tick(new Date("2026-04-21T10:01:05.000Z"));
	await new Promise((resolve) => setTimeout(resolve, 30));
	assert.ok(activeRunId);
	const cancelled = await runStore.cancelRun({
		runId: activeRunId,
		summary: "Manually cancelled by operator",
		text: "Manually cancelled by operator",
		finishedAt: new Date("2026-04-21T10:01:10.000Z"),
	});
	assert.equal(cancelled?.status, "cancelled");

	await tickPromise;

	const finalRun = await runStore.getRun(activeRunId);
	assert.equal(aborted, true);
	assert.equal(finalRun?.status, "cancelled");
	assert.equal(finalRun?.resultSummary, "Manually cancelled by operator");

	database.close();
});

test("ConnWorker keeps external cancellation authoritative when a runner returns after abort", async () => {
	let runStore: ConnRunStore;
	let activeRunId = "";
	const runner = {
		run: async (_conn: ConnDefinition, run: ConnRunRecord, now: Date, signal?: AbortSignal): Promise<ConnRunRecord | undefined> => {
			activeRunId = run.runId;
			await new Promise<void>((resolve) => {
				signal?.addEventListener("abort", () => resolve(), { once: true });
			});
			return {
				...run,
				status: "succeeded",
				resultSummary: "late success",
				resultText: "late success",
				finishedAt: now.toISOString(),
			};
		},
	};
	const created = await createWorkerWithOptions(runner, {
		leaseMs: 60,
		heartbeatMs: 20,
	});
	const { database, connStore, activityStore, worker } = created;
	runStore = created.runStore;
	const conn = await connStore.create({
		title: "Cancel Wins",
		prompt: "Summarize",
		target: {
			type: "task_inbox",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	const tickPromise = worker.tick(new Date("2026-04-21T10:01:05.000Z"));
	await new Promise((resolve) => setTimeout(resolve, 30));
	await runStore.cancelRun({
		runId: activeRunId,
		summary: "Manually cancelled by operator",
		text: "Manually cancelled by operator",
		finishedAt: new Date("2026-04-21T10:01:10.000Z"),
	});

	await tickPromise;

	const finalRun = await runStore.getRun(activeRunId);
	const activities = await activityStore.list();
	assert.equal(finalRun?.status, "cancelled");
	assert.equal(activities[0]?.title, "Cancel Wins cancelled");
	assert.equal(activities[0]?.text, "Manually cancelled by operator");

	database.close();
});

test("ConnWorker fails stale leased runs before claiming fresh due work", async () => {
	const runner = new FakeRunner();
	const { database, connStore, runStore, activityStore, broadcasts, worker } = await createWorkerWithOptions(runner, {
		maxConcurrency: 1,
	});

	const staleConn = await connStore.create({
		title: "Stale Run",
		prompt: "Summarize stale",
		target: {
			type: "conversation",
			conversationId: "manual:stale",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});
	await runStore.createRun({
		runId: "run-stale",
		connId: staleConn.connId,
		scheduledAt: "2026-04-21T10:01:00.000Z",
		workspacePath: "/tmp/conn/run-stale",
		now: new Date("2026-04-21T10:00:59.000Z"),
	});
	await runStore.claimNextDue({
		workerId: "worker-old",
		now: new Date("2026-04-21T10:01:00.000Z"),
		leaseMs: 30_000,
	});

	const freshConn = await connStore.create({
		title: "Fresh Run",
		prompt: "Summarize fresh",
		target: {
			type: "conversation",
			conversationId: "manual:fresh",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	await worker.tick(new Date("2026-04-21T10:01:40.000Z"));

	const staleRun = await runStore.getRun("run-stale");
	assert.equal(staleRun?.status, "failed");
	assert.match(staleRun?.errorText ?? "", /lease expired/i);
	assert.deepEqual(
		(await runStore.listEvents("run-stale")).map((event) => event.eventType),
		["run_stale"],
	);

	const freshRuns = await runStore.listRunsForConn(freshConn.connId);
	assert.equal(freshRuns.length, 1);
	assert.equal(freshRuns[0].status, "running");
	assert.equal(runner.calls.length, 1);
	assert.equal(runner.calls[0].conn.connId, freshConn.connId);
	const activities = await activityStore.list();
	assert.deepEqual(activities.map((activity) => activity.title).sort(), ["Fresh Run completed", "Stale Run failed"].sort());
	assert.deepEqual(
		broadcasts.map((event) => event.title).sort(),
		["Fresh Run completed", "Stale Run failed"].sort(),
	);

	database.close();
});

test("ConnWorker fails runs that exceed conn maxRunMs and delivers a failure activity", async () => {
	const runner = {
		run: async (_conn: ConnDefinition, _run: ConnRunRecord, _now: Date, signal?: AbortSignal): Promise<ConnRunRecord | undefined> =>
			await new Promise<ConnRunRecord>((_resolve, reject) => {
				signal?.addEventListener(
					"abort",
					() => {
						reject(signal.reason instanceof Error ? signal.reason : new Error(String(signal?.reason ?? "aborted")));
					},
					{ once: true },
				);
			}),
	};
	const { database, connStore, runStore, activityStore, broadcasts, worker } = await createWorkerWithOptions(runner, {
		maxConcurrency: 1,
	});

	const conn = await connStore.create({
		title: "Timed Run",
		prompt: "Summarize forever",
		target: {
			type: "conversation",
			conversationId: "manual:timeout",
		},
		schedule: {
			kind: "once",
			at: "2026-04-21T10:01:00.000Z",
		},
		maxRunMs: 25,
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	await worker.tick(new Date("2026-04-21T10:01:05.000Z"));

	const runs = await runStore.listRunsForConn(conn.connId);
	assert.equal(runs.length, 1);
	assert.equal(runs[0].status, "failed");
	assert.match(runs[0].errorText ?? "", /exceeded maxRunMs/i);
	assert.deepEqual(
		(await runStore.listEvents(runs[0].runId)).map((event) => event.eventType),
		["run_timed_out"],
	);
	const activities = await activityStore.list();
	assert.deepEqual(
		activities.map((activity) => ({
			source: activity.source,
			sourceId: activity.sourceId,
			runId: activity.runId,
			title: activity.title,
			text: activity.text,
		})),
		[
			{
				source: "conn",
				sourceId: conn.connId,
				runId: runs[0].runId,
				title: "Timed Run failed",
				text: "Conn run exceeded maxRunMs (25ms)",
			},
		],
	);
	assert.deepEqual(broadcasts, [
		{
			activityId: activities[0]?.activityId,
			source: "conn",
			sourceId: conn.connId,
			runId: runs[0].runId,
			kind: "conn_result",
			title: "Timed Run failed",
			createdAt: runs[0].finishedAt,
		},
	]);
	assert.deepEqual(
		activities.map((activity) => ({
			source: activity.source,
			sourceId: activity.sourceId,
			runId: activity.runId,
			conversationId: activity.conversationId,
			title: activity.title,
			text: activity.text,
		})),
		[
			{
				source: "conn",
				sourceId: conn.connId,
				runId: runs[0].runId,
				conversationId: undefined,
				title: "Timed Run failed",
				text: "Conn run exceeded maxRunMs (25ms)",
			},
		],
	);

	database.close();
});
