import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

test("GET /v1/conns/:connId/runs returns background run history for the conn", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async (connId: string) =>
				connId === "conn-1"
					? [
							{
								runId: "run-2",
								connId: "conn-1",
								status: "succeeded",
								scheduledAt: "2026-04-21T09:00:00.000Z",
								startedAt: "2026-04-21T09:00:01.000Z",
								finishedAt: "2026-04-21T09:00:30.000Z",
								workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-2",
								resultSummary: "done",
								resultText: "daily result",
								createdAt: "2026-04-21T09:00:00.000Z",
								updatedAt: "2026-04-21T09:00:30.000Z",
							},
						]
					: [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		runs: [
			{
				runId: "run-2",
				connId: "conn-1",
				status: "succeeded",
				scheduledAt: "2026-04-21T09:00:00.000Z",
				startedAt: "2026-04-21T09:00:01.000Z",
				finishedAt: "2026-04-21T09:00:30.000Z",
				workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-2",
				resultSummary: "done",
				resultText: "daily result",
				createdAt: "2026-04-21T09:00:00.000Z",
				updatedAt: "2026-04-21T09:00:30.000Z",
			},
		],
	});
	await app.close();
});

test("GET /v1/conns/:connId/runs supports bounded run history pagination", async () => {
	const calls: unknown[] = [];
	const runs = Array.from({ length: 11 }, (_, index) => {
		const ordinal = 11 - index;
		const id = String(ordinal).padStart(2, "0");
		return {
			runId: `run-${id}`,
			connId: "conn-1",
			status: "succeeded",
			scheduledAt: `2026-04-21T09:${id}:00.000Z`,
			workspacePath: `E:/AII/ugk-pi/.data/agent/background/runs/run-${id}`,
			createdAt: `2026-04-21T09:${id}:00.000Z`,
			updatedAt: `2026-04-21T09:${id}:30.000Z`,
		};
	});
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async (connId: string, options?: unknown) => {
				calls.push({ connId, options });
				return runs;
			},
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs?limit=10",
	});
	const cursorResponse = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs?limit=10&before=2026-04-21T09%3A02%3A00.000Z%7C2026-04-21T09%3A02%3A00.000Z%7Crun-02",
	});

	assert.equal(response.statusCode, 200);
	const body = response.json();
	assert.equal(body.runs.length, 10);
	assert.equal(body.hasMore, true);
	assert.equal(body.limit, 10);
	assert.equal(body.nextBefore, "2026-04-21T09:02:00.000Z|2026-04-21T09:02:00.000Z|run-02");
	assert.equal(cursorResponse.statusCode, 200);
	assert.deepEqual(calls, [
		{ connId: "conn-1", options: { limit: 11 } },
		{
			connId: "conn-1",
			options: {
				limit: 11,
				before: {
					scheduledAt: "2026-04-21T09:02:00.000Z",
					createdAt: "2026-04-21T09:02:00.000Z",
					runId: "run-02",
				},
			},
		},
	]);
	await app.close();
});

test("GET /v1/conns/:connId/runs rejects invalid pagination query", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async (_connId: string, options?: unknown) => {
				calls.push(options);
				return [];
			},
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	for (const url of [
		"/v1/conns/conn-1/runs?limit=nope",
		"/v1/conns/conn-1/runs?limit=0",
		"/v1/conns/conn-1/runs?limit=10&before=not-a-stable-cursor",
	]) {
		const response = await app.inject({
			method: "GET",
			url,
		});
		assert.equal(response.statusCode, 400);
	}
	assert.deepEqual(calls, []);
	await app.close();
});
