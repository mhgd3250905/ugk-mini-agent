import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

test("POST /v1/conns/:connId/runs/:runId/cancel cancels an active background run", async () => {
	const run = {
		runId: "run-active",
		connId: "conn-1",
		status: "running" as const,
		scheduledAt: "2026-05-19T07:30:02.000Z",
		claimedAt: "2026-05-19T07:30:09.000Z",
		startedAt: "2026-05-19T07:30:09.000Z",
		leaseOwner: "worker-a",
		leaseUntil: "2026-05-19T07:35:09.000Z",
		workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-active",
		createdAt: "2026-05-19T07:30:02.000Z",
		updatedAt: "2026-05-19T07:30:09.000Z",
	};
	let cancelInput: unknown;
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
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async (runId: string) => (runId === run.runId ? run : undefined),
			cancelRun: async (input: { runId: string; summary: string; text?: string }) => {
				cancelInput = input;
				return {
					...run,
					status: "cancelled",
					finishedAt: "2026-05-19T07:35:11.000Z",
					leaseOwner: undefined,
					leaseUntil: undefined,
					resultSummary: input.summary,
					resultText: input.text,
					updatedAt: "2026-05-19T07:35:11.000Z",
				} as const;
			},
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
			markAllRunsRead: async () => 0,
		} as never,
		backgroundDataDir: "E:/AII/ugk-pi/.data/agent/background",
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/conns/conn-1/runs/run-active/cancel",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(cancelInput, {
		runId: "run-active",
		summary: "Manually cancelled by operator",
		text: "Manually cancelled by operator",
	});
	const body = response.json();
	assert.equal(body.run.status, "cancelled");
	assert.equal(body.run.leaseOwner, undefined);
	assert.equal(body.run.resultSummary, "Manually cancelled by operator");
	await app.close();
});
