import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentActivityStore } from "../src/agent/agent-activity-store.js";
import { ConnDatabase } from "../src/agent/conn-db.js";
import { ConnRunStore } from "../src/agent/conn-run-store.js";
import { ConnSqliteStore } from "../src/agent/conn-sqlite-store.js";
import type { ConnDefinition } from "../src/agent/conn-store.js";
import { ConnWorker } from "../src/workers/conn-worker.js";
import { TeamGroupConnRunner } from "../src/workers/team-group-conn-runner.js";

async function createStores() {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-conn-team-group-"));
	const database = new ConnDatabase({ dbPath: join(root, "conn.sqlite") });
	await database.initialize();
	const connStore = new ConnSqliteStore({ database });
	const runStore = new ConnRunStore({ database });
	const activityStore = new AgentActivityStore({ database });
	return { root, database, connStore, runStore, activityStore };
}

async function createTeamGroupConn(connStore: ConnSqliteStore, input: Partial<ConnDefinition> = {}) {
	return await connStore.create({
		title: input.title ?? "Team Group Schedule",
		prompt: input.prompt ?? "legacy placeholder",
		target: input.target ?? { type: "task_inbox" },
		schedule: input.schedule ?? { kind: "once", at: "2026-06-05T10:01:00.000Z" },
		execution: { type: "team_group", groupId: "group-1" },
		now: new Date("2026-06-05T10:00:00.000Z"),
	});
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

test("TeamGroupConnRunner posts a GroupRun, polls detail, records events, and completes the ConnRun", async () => {
	const { database, connStore, runStore } = await createStores();
	const calls: Array<{ method: string; url: string; body?: RequestInit["body"]; contentType?: string }> = [];
	const runner = new TeamGroupConnRunner({
		runStore,
		apiBaseUrl: "http://team-api.test",
		pollIntervalMs: 1,
		fetchFn: async (url, init) => {
			const headers = init?.headers && !(init.headers instanceof Headers) && !Array.isArray(init.headers)
				? init.headers as Record<string, string>
				: {};
			calls.push({
				method: init?.method ?? "GET",
				url: String(url),
				body: init?.body,
				contentType: headers["content-type"],
			});
			if (String(url).endsWith("/v1/team/task-groups/group-1/runs")) {
				return jsonResponse(201, {
					groupRun: {
						groupRunId: "group-run-1",
						groupId: "group-1",
						status: "running",
					},
				});
			}
			return jsonResponse(200, {
				groupRun: {
					groupRunId: "group-run-1",
					groupId: "group-1",
					status: "completed",
					observedRuns: [],
				},
			});
		},
	});
	const conn = await createTeamGroupConn(connStore);
	const run = await runStore.createRun({
		connId: conn.connId,
		scheduledAt: "2026-06-05T10:01:00.000Z",
		workspacePath: join("tmp", "run-team"),
		now: new Date("2026-06-05T10:01:00.000Z"),
	});
	const claimed = await runStore.claimNextDue({
		workerId: "worker-a",
		now: new Date("2026-06-05T10:01:00.000Z"),
		leaseMs: 30_000,
	});

	const completed = await runner.run(conn, claimed!, new Date("2026-06-05T10:01:00.000Z"));

	assert.equal(completed?.status, "succeeded");
	assert.deepEqual(calls, [
		{ method: "POST", url: "http://team-api.test/v1/team/task-groups/group-1/runs", body: undefined, contentType: undefined },
		{ method: "GET", url: "http://team-api.test/v1/team/task-group-runs/group-run-1", body: undefined, contentType: undefined },
	]);
	const stored = await runStore.getRun(run.runId);
	assert.equal(stored?.resultSummary, "Team GroupRun completed: group-run-1");
	assert.deepEqual(stored?.resolvedSnapshot, {
		executionType: "team_group",
		groupId: "group-1",
		groupRunId: "group-run-1",
		groupRunStatus: "completed",
	});
	assert.deepEqual(
		(await runStore.listEvents(run.runId)).map((event) => event.eventType),
		["team_group_run_starting", "team_group_run_started"],
	);
	database.close();
});

test("ConnWorker routes team_group conns without calling the background agent runner", async () => {
	const { database, connStore, runStore, activityStore } = await createStores();
	let backgroundCalls = 0;
	let teamCalls = 0;
	const conn = await createTeamGroupConn(connStore);
	const worker = new ConnWorker({
		workerId: "worker-a",
		backgroundDataDir: join("tmp", "background"),
		connStore,
		runStore,
		activityStore,
		runner: {
			async run() {
				backgroundCalls += 1;
				throw new Error("background runner should not be called");
			},
		},
		teamGroupRunner: {
			async run(_conn, run, now) {
				teamCalls += 1;
				return await runStore.completeRun({
					runId: run.runId,
					leaseOwner: run.leaseOwner,
					summary: "Team GroupRun completed: group-run-1",
					text: "Team GroupRun completed: group-run-1",
					finishedAt: now,
				});
			},
		},
		leaseMs: 30_000,
	});

	await worker.tick(new Date("2026-06-05T10:01:05.000Z"));

	const runs = await runStore.listRunsForConn(conn.connId);
	assert.equal(backgroundCalls, 0);
	assert.equal(teamCalls, 1);
	assert.equal(runs[0].status, "succeeded");
	database.close();
});

test("TeamGroupConnRunner treats active guard 409 as succeeded skipped", async () => {
	const { database, connStore, runStore } = await createStores();
	const runner = new TeamGroupConnRunner({
		runStore,
		apiBaseUrl: "http://team-api.test",
		pollIntervalMs: 1,
		fetchFn: async () =>
			jsonResponse(409, {
				error: "active task group run already exists: group-run-active",
			}),
	});
	const conn = await createTeamGroupConn(connStore);
	const run = await runStore.createRun({
		connId: conn.connId,
		scheduledAt: "2026-06-05T10:01:00.000Z",
		workspacePath: join("tmp", "run-skip"),
		now: new Date("2026-06-05T10:01:00.000Z"),
	});
	const claimed = await runStore.claimNextDue({
		workerId: "worker-a",
		now: new Date("2026-06-05T10:01:00.000Z"),
		leaseMs: 30_000,
	});

	const completed = await runner.run(conn, claimed!, new Date("2026-06-05T10:01:00.000Z"));

	assert.equal(completed?.status, "succeeded");
	assert.match(completed?.resultSummary ?? "", /^Skipped:/);
	assert.deepEqual(completed?.resolvedSnapshot, {
		executionType: "team_group",
		groupId: "group-1",
		skipped: true,
	});
	assert.deepEqual((await runStore.listEvents(run.runId)).map((event) => event.eventType), ["team_group_run_starting"]);
	database.close();
});

test("TeamGroupConnRunner fails invalid GroupRun start with Team Group diagnostics", async () => {
	const { database, connStore, runStore } = await createStores();
	const runner = new TeamGroupConnRunner({
		runStore,
		apiBaseUrl: "http://team-api.test",
		pollIntervalMs: 1,
		fetchFn: async () =>
			jsonResponse(400, {
				error: {
					message: "invalid task group: Group has no head task",
				},
			}),
	});
	const conn = await createTeamGroupConn(connStore);
	const run = await runStore.createRun({
		connId: conn.connId,
		scheduledAt: "2026-06-05T10:01:00.000Z",
		workspacePath: join("tmp", "run-invalid-group"),
		now: new Date("2026-06-05T10:01:00.000Z"),
	});
	const claimed = await runStore.claimNextDue({
		workerId: "worker-a",
		now: new Date("2026-06-05T10:01:00.000Z"),
		leaseMs: 30_000,
	});

	const failed = await runner.run(conn, claimed!, new Date("2026-06-05T10:01:00.000Z"));

	assert.equal(failed?.status, "failed");
	assert.equal(failed?.resultSummary, "Team GroupRun start failed with 400");
	assert.doesNotMatch(failed?.resultSummary ?? "", /^Skipped:/);
	assert.match(failed?.errorText ?? "", /invalid task group/);
	assert.match(failed?.errorText ?? "", /Group has no head task/);
	const stored = await runStore.getRun(run.runId);
	assert.deepEqual(stored?.resolvedSnapshot, {
		executionType: "team_group",
		groupId: "group-1",
		groupRunStartStatus: 400,
		groupRunStartError: "invalid task group: Group has no head task",
	});
	assert.deepEqual((await runStore.listEvents(run.runId)).map((event) => event.eventType), ["team_group_run_starting"]);
	database.close();
});

test("TeamGroupConnRunner maps failed GroupRun statuses to failed ConnRun", async () => {
	const { database, connStore, runStore } = await createStores();
	const runner = new TeamGroupConnRunner({
		runStore,
		apiBaseUrl: "http://team-api.test",
		pollIntervalMs: 1,
		fetchFn: async (url, init) => {
			if (init?.method === "POST") {
				return jsonResponse(201, {
					groupRun: { groupRunId: "group-run-failed", groupId: "group-1", status: "running" },
				});
			}
			return jsonResponse(200, {
				groupRun: {
					groupRunId: "group-run-failed",
					groupId: "group-1",
					status: "completed_with_failures",
					lastError: "downstream failed",
				},
			});
		},
	});
	const conn = await createTeamGroupConn(connStore);
	const run = await runStore.createRun({
		connId: conn.connId,
		scheduledAt: "2026-06-05T10:01:00.000Z",
		workspacePath: join("tmp", "run-failed"),
		now: new Date("2026-06-05T10:01:00.000Z"),
	});
	const claimed = await runStore.claimNextDue({
		workerId: "worker-a",
		now: new Date("2026-06-05T10:01:00.000Z"),
		leaseMs: 30_000,
	});

	const failed = await runner.run(conn, claimed!, new Date("2026-06-05T10:01:00.000Z"));

	assert.equal(failed?.status, "failed");
	assert.equal(failed?.errorText, "Team GroupRun completed_with_failures: downstream failed");
	assert.equal((await runStore.getRun(run.runId))?.status, "failed");
	database.close();
});

test("TeamGroupConnRunner requests GroupRun cancellation when aborted after start", async () => {
	const { database, connStore, runStore } = await createStores();
	const calls: Array<{ method: string; url: string }> = [];
	const controller = new AbortController();
	const runner = new TeamGroupConnRunner({
		runStore,
		apiBaseUrl: "http://team-api.test",
		pollIntervalMs: 50,
		fetchFn: async (url, init) => {
			calls.push({ method: init?.method ?? "GET", url: String(url) });
			if (String(url).endsWith("/runs")) {
				return jsonResponse(201, {
					groupRun: { groupRunId: "group-run-cancel", groupId: "group-1", status: "running" },
				});
			}
			if (String(url).endsWith("/cancel")) {
				return jsonResponse(200, {
					groupRun: { groupRunId: "group-run-cancel", groupId: "group-1", status: "cancelled" },
				});
			}
			controller.abort(new Error("external cancel"));
			return jsonResponse(200, {
				groupRun: { groupRunId: "group-run-cancel", groupId: "group-1", status: "running" },
			});
		},
	});
	const conn = await createTeamGroupConn(connStore);
	const run = await runStore.createRun({
		connId: conn.connId,
		scheduledAt: "2026-06-05T10:01:00.000Z",
		workspacePath: join("tmp", "run-cancel"),
		now: new Date("2026-06-05T10:01:00.000Z"),
	});
	const claimed = await runStore.claimNextDue({
		workerId: "worker-a",
		now: new Date("2026-06-05T10:01:00.000Z"),
		leaseMs: 30_000,
	});

	await assert.rejects(
		() => runner.run(conn, claimed!, new Date("2026-06-05T10:01:00.000Z"), controller.signal),
		/external cancel/,
	);
	assert.deepEqual(calls.map((call) => call.url), [
		"http://team-api.test/v1/team/task-groups/group-1/runs",
		"http://team-api.test/v1/team/task-group-runs/group-run-cancel",
		"http://team-api.test/v1/team/task-group-runs/group-run-cancel/cancel",
	]);
	assert.deepEqual(
		(await runStore.listEvents(run.runId)).map((event) => event.eventType),
		["team_group_run_starting", "team_group_run_started", "team_group_run_cancel_requested"],
	);
	database.close();
});
