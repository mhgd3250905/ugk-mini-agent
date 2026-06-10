import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

test("POST /v1/conns/:connId/run enqueues a background run without invoking the foreground agent", async () => {
	const createdRuns: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			chat: async () => {
				throw new Error("foreground agent should not be called");
			},
		}),
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
							assetRefs: ["asset-1"],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
							nextRunAt: "2026-04-18T00:01:00.000Z",
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
			createRun: async (input: { runId?: string; connId: string; scheduledAt: string; workspacePath: string }) => {
				createdRuns.push(input);
				return {
					runId: input.runId ?? "run-1",
					connId: input.connId,
					status: "pending",
					scheduledAt: input.scheduledAt,
					workspacePath: input.workspacePath,
					createdAt: "2026-04-21T00:00:00.000Z",
					updatedAt: "2026-04-21T00:00:00.000Z",
				};
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
		backgroundDataDir: "E:/AII/ugk-pi/.data/agent/background",
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/conns/conn-1/run",
	});

	assert.equal(response.statusCode, 202);
	const body = response.json();
	assert.equal(body.run.connId, "conn-1");
	assert.equal(body.run.status, "pending");
	assert.equal(body.run.scheduledAt <= new Date().toISOString(), true);
	assert.match(body.run.workspacePath, /[\\/]background[\\/]runs[\\/][0-9a-f-]+$/);
	assert.deepEqual(createdRuns, [
		{
			runId: body.run.runId,
			connId: "conn-1",
			scheduledAt: body.run.scheduledAt,
			workspacePath: body.run.workspacePath,
		},
	]);
	await app.close();
});

test("POST /v1/conns/:connId/run reuses an active run instead of creating duplicates", async () => {
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
							target: { type: "task_inbox" },
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
				throw new Error("duplicate run should not be created");
			},
			getActiveRunForConn: async (connId: string) =>
				connId === "conn-1"
					? {
							runId: "run-active",
							connId: "conn-1",
							status: "running",
							scheduledAt: "2026-05-11T07:30:02.000Z",
							claimedAt: "2026-05-11T07:30:09.000Z",
							startedAt: "2026-05-11T07:30:09.000Z",
							workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-active",
							createdAt: "2026-05-11T07:30:02.000Z",
							updatedAt: "2026-05-11T07:30:09.000Z",
						}
					: undefined,
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
		backgroundDataDir: "E:/AII/ugk-pi/.data/agent/background",
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/conns/conn-1/run",
	});

	assert.equal(response.statusCode, 202);
	const body = response.json();
	assert.equal(body.run.runId, "run-active");
	assert.equal(body.run.status, "running");
	assert.equal(body.reused, true);
	await app.close();
});
