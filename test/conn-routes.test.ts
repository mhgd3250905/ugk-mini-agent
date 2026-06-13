import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

test("POST /v1/conns accepts cron timezone and runtime profile ids", async () => {
	const createdInputs: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async (input: {
				title: string;
				prompt: string;
				target: { type: "conversation"; conversationId: string };
				schedule: { kind: "cron"; expression: string; timezone?: string };
				assetRefs?: string[];
				profileId?: string;
				agentSpecId?: string;
				skillSetId?: string;
				modelPolicyId?: string;
				modelProvider?: string;
				modelId?: string;
				upgradePolicy?: "latest" | "pinned" | "manual";
				maxRunMs?: number;
				execution?: { type: "agent_prompt" } | { type: "team_group"; groupId: string };
			}) => {
				createdInputs.push(input);
				return {
					connId: "conn-1",
					title: input.title,
					prompt: input.prompt,
					target: input.target,
					schedule: input.schedule,
					assetRefs: input.assetRefs ?? [],
					profileId: input.profileId,
					agentSpecId: input.agentSpecId,
					skillSetId: input.skillSetId,
					modelPolicyId: input.modelPolicyId,
					modelProvider: input.modelProvider,
					modelId: input.modelId,
					upgradePolicy: input.upgradePolicy,
					maxRunMs: input.maxRunMs,
					execution: input.execution ?? { type: "agent_prompt" },
					status: "active",
					createdAt: "2026-04-21T00:00:00.000Z",
					updatedAt: "2026-04-21T00:00:00.000Z",
				};
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
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/conns",
		payload: {
			title: " morning digest ",
			prompt: " run every day ",
			target: { type: "conversation", conversationId: "manual:digest" },
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
			assetRefs: ["asset-1", " asset-2 "],
			profileId: "background.zh",
			agentSpecId: "agent.daily",
			skillSetId: "skills.research",
			modelPolicyId: "model.stable",
			modelProvider: "xiaomi-mimo-cn",
			modelId: "mimo-v2.5-pro",
			upgradePolicy: "pinned",
			maxRunMs: 120000,
		},
	});

	assert.equal(response.statusCode, 201);
	assert.deepEqual(createdInputs, [
		{
			title: "morning digest",
			prompt: "run every day",
			target: { type: "conversation", conversationId: "manual:digest" },
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
			assetRefs: ["asset-1", "asset-2"],
			profileId: "background.zh",
			agentSpecId: "agent.daily",
			skillSetId: "skills.research",
			modelPolicyId: "model.stable",
			modelProvider: "xiaomi-mimo-cn",
			modelId: "mimo-v2.5-pro",
			upgradePolicy: "pinned",
			maxRunMs: 120000,
			execution: { type: "agent_prompt" },
		},
	]);
	assert.deepEqual(response.json(), {
		conn: {
			connId: "conn-1",
			title: "morning digest",
			prompt: "run every day",
			target: { type: "conversation", conversationId: "manual:digest" },
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
			assetRefs: ["asset-1", "asset-2"],
			profileId: "background.zh",
			agentSpecId: "agent.daily",
			skillSetId: "skills.research",
			modelPolicyId: "model.stable",
			modelProvider: "xiaomi-mimo-cn",
			modelId: "mimo-v2.5-pro",
			upgradePolicy: "pinned",
			maxRunMs: 120000,
			execution: { type: "agent_prompt" },
			status: "active",
			createdAt: "2026-04-21T00:00:00.000Z",
			updatedAt: "2026-04-21T00:00:00.000Z",
		},
	});
	await app.close();
});

test("POST /v1/conns defaults target to the task inbox when target is omitted", async () => {
	const createdInputs: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			getConversationCatalog: async () => ({
				currentConversationId: "manual:current-thread",
				conversations: [
					{
						conversationId: "manual:current-thread",
						title: "Current thread",
						preview: "",
						messageCount: 3,
						createdAt: "2026-04-21T00:00:00.000Z",
						updatedAt: "2026-04-21T00:00:00.000Z",
						running: false,
					},
				],
			}),
		}),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async (input: {
				title: string;
				prompt: string;
				target: { type: "task_inbox" };
				schedule: { kind: "cron"; expression: string; timezone?: string };
				assetRefs?: string[];
				profileId?: string;
				agentSpecId?: string;
				skillSetId?: string;
				modelPolicyId?: string;
			upgradePolicy?: "latest" | "pinned" | "manual";
				execution?: { type: "agent_prompt" } | { type: "team_group"; groupId: string };
			}) => {
				createdInputs.push(input);
				return {
					connId: "conn-default-target",
					title: input.title,
					prompt: input.prompt,
					target: input.target,
					schedule: input.schedule,
					assetRefs: input.assetRefs ?? [],
					profileId: input.profileId,
					agentSpecId: input.agentSpecId,
					skillSetId: input.skillSetId,
					modelPolicyId: input.modelPolicyId,
					upgradePolicy: input.upgradePolicy,
					execution: input.execution ?? { type: "agent_prompt" },
					status: "active",
					createdAt: "2026-04-21T00:00:00.000Z",
					updatedAt: "2026-04-21T00:00:00.000Z",
				};
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
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/conns",
		payload: {
			title: " current digest ",
			prompt: " follow current conversation ",
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
		},
	});

	assert.equal(response.statusCode, 201);
	assert.deepEqual(createdInputs, [
		{
			title: "current digest",
			prompt: "follow current conversation",
			target: { type: "task_inbox" },
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
			assetRefs: undefined,
			profileId: undefined,
			agentSpecId: undefined,
			skillSetId: undefined,
			modelPolicyId: undefined,
			modelProvider: undefined,
			modelId: undefined,
			upgradePolicy: undefined,
			execution: { type: "agent_prompt" },
		},
	]);
	assert.deepEqual(response.json(), {
		conn: {
			connId: "conn-default-target",
			title: "current digest",
			prompt: "follow current conversation",
			target: { type: "task_inbox" },
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
			assetRefs: [],
			execution: { type: "agent_prompt" },
			status: "active",
			createdAt: "2026-04-21T00:00:00.000Z",
			updatedAt: "2026-04-21T00:00:00.000Z",
		},
	});
	await app.close();
});

test("POST /v1/conns accepts team_group execution and returns normalized execution", async () => {
	const createdInputs: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async (input: Record<string, unknown>) => {
				createdInputs.push(input);
				return {
					connId: "conn-team-group",
					title: input.title as string,
					prompt: input.prompt as string,
					target: input.target as { type: "task_inbox" },
					schedule: input.schedule as { kind: "cron"; expression: string; timezone?: string },
					assetRefs: [],
					execution: input.execution as { type: "team_group"; groupId: string },
					status: "active",
					createdAt: "2026-06-05T00:00:00.000Z",
					updatedAt: "2026-06-05T00:00:00.000Z",
				};
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
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/conns",
		payload: {
			title: " group schedule ",
			prompt: " legacy placeholder ",
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
			execution: { type: "team_group", groupId: " group-1 " },
		},
	});

	assert.equal(response.statusCode, 201);
	assert.deepEqual(createdInputs, [
		{
			title: "group schedule",
			prompt: "legacy placeholder",
			target: { type: "task_inbox" },
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
			assetRefs: undefined,
			profileId: undefined,
			agentSpecId: undefined,
			skillSetId: undefined,
			modelPolicyId: undefined,
			modelProvider: undefined,
			modelId: undefined,
			upgradePolicy: undefined,
			execution: { type: "team_group", groupId: "group-1" },
		},
	]);
	assert.equal(response.json().conn.execution.type, "team_group");
	assert.equal(response.json().conn.execution.groupId, "group-1");
	await app.close();
});

test("PATCH /v1/conns/:connId accepts team_group execution", async () => {
	const updateCalls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async (connId: string, patch: Record<string, unknown>) => {
				updateCalls.push({ connId, patch });
				return {
					connId,
					title: "existing",
					prompt: "existing prompt",
					target: { type: "task_inbox" },
					schedule: { kind: "interval", everyMs: 60000 },
					assetRefs: [],
					execution: patch.execution,
					status: "active",
					createdAt: "2026-06-05T00:00:00.000Z",
					updatedAt: "2026-06-05T00:00:00.000Z",
				};
			},
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "PATCH",
		url: "/v1/conns/conn-edit-1",
		payload: {
			execution: { type: "team_group", groupId: " group-2 " },
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(updateCalls, [
		{
			connId: "conn-edit-1",
			patch: {
				execution: { type: "team_group", groupId: "group-2" },
			},
		},
	]);
	assert.deepEqual(response.json().conn.execution, { type: "team_group", groupId: "group-2" });
	await app.close();
});

test("POST /v1/conns rejects invalid execution payloads", async () => {
	const createCalls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async (input: unknown) => {
				createCalls.push(input);
				throw new Error("should not create");
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
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});
	const basePayload = {
		title: "bad execution",
		prompt: "run",
		schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
	};

	for (const execution of [
		null,
		"team_group",
		{ type: "unknown" },
		{ type: "team_group" },
		{ type: "team_group", groupId: "   " },
	]) {
		const response = await app.inject({
			method: "POST",
			url: "/v1/conns",
			payload: { ...basePayload, execution },
		});
		assert.equal(response.statusCode, 400);
		assert.match(response.json().error.message, /execution/);
	}
	assert.deepEqual(createCalls, []);
	await app.close();
});

test("POST /v1/conns returns 400 when the once schedule is already in the past", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {} as never,
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async () => {
				throw new Error("Invalid conn schedule: once.at is in the past");
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
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/conns",
		payload: {
			title: "late job",
			prompt: "run once",
			schedule: {
				kind: "once",
				at: "2026-04-21T09:59:00.000Z",
			},
		},
	});

	assert.equal(response.statusCode, 400);
	assert.deepEqual(response.json(), {
		error: {
			code: "BAD_REQUEST",
			message: "Invalid conn schedule: once.at is in the past",
		},
	});
	await app.close();
});

test("PATCH /v1/conns/:connId rejects a blank title when the field is provided", async () => {
	const updateCalls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async (connId: string, patch: Record<string, unknown>) => {
				updateCalls.push({ connId, patch });
				return {
					connId,
					title: "existing title",
					prompt: "existing prompt",
					target: { type: "conversation", conversationId: "manual:existing" },
					schedule: { kind: "once", at: "2026-04-22T09:00:00.000Z" },
					assetRefs: [],
					status: "active",
					createdAt: "2026-04-22T08:00:00.000Z",
					updatedAt: "2026-04-22T08:30:00.000Z",
				};
			},
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "PATCH",
		url: "/v1/conns/conn-blank-title",
		payload: {
			title: "   ",
		},
	});

	assert.equal(response.statusCode, 400);
	assert.match(response.body, /title/);
	assert.deepEqual(updateCalls, []);
	await app.close();
});

test("PATCH /v1/conns/:connId trims and forwards editable conn fields", async () => {
	const updateCalls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async (connId: string, patch: Record<string, unknown>) => {
				updateCalls.push({ connId, patch });
				return {
					connId,
					title: String(patch.title ?? "existing title"),
					prompt: String(patch.prompt ?? "existing prompt"),
					target: (patch.target as Record<string, unknown>) ?? { type: "conversation", conversationId: "manual:existing" },
					schedule:
						(patch.schedule as Record<string, unknown>) ?? { kind: "once", at: "2026-04-22T09:00:00.000Z" },
					assetRefs: (patch.assetRefs as string[]) ?? [],
					profileId: patch.profileId as string | undefined,
					agentSpecId: patch.agentSpecId as string | undefined,
					skillSetId: patch.skillSetId as string | undefined,
					modelPolicyId: patch.modelPolicyId as string | undefined,
					upgradePolicy: patch.upgradePolicy as "latest" | "pinned" | "manual" | undefined,
					maxRunMs: patch.maxRunMs as number | undefined,
					status: "active",
					createdAt: "2026-04-22T08:00:00.000Z",
					updatedAt: "2026-04-22T08:30:00.000Z",
				};
			},
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "PATCH",
		url: "/v1/conns/conn-edit-1",
		payload: {
			title: " updated title ",
			prompt: " updated prompt ",
			target: { type: "conversation", conversationId: "manual:patched" },
			schedule: { kind: "interval", everyMs: 120000, startAt: "2026-04-22T09:00:00.000Z" },
			assetRefs: ["asset-1", " asset-2 "],
			profileId: "background.patched",
			agentSpecId: "agent.patched",
			skillSetId: "skills.patched",
			modelPolicyId: "model.patched",
			upgradePolicy: "manual",
			maxRunMs: 90000,
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(updateCalls, [
		{
			connId: "conn-edit-1",
			patch: {
				title: "updated title",
				prompt: "updated prompt",
				target: { type: "conversation", conversationId: "manual:patched" },
				schedule: { kind: "interval", everyMs: 120000, startAt: "2026-04-22T09:00:00.000Z" },
				assetRefs: ["asset-1", "asset-2"],
				profileId: "background.patched",
				agentSpecId: "agent.patched",
				skillSetId: "skills.patched",
				modelPolicyId: "model.patched",
				upgradePolicy: "manual",
				maxRunMs: 90000,
			},
		},
	]);
	assert.match(response.body, /updated title/);
	await app.close();
});


test("GET /v1/conns returns scheduled conn tasks", async () => {
	const latestRunCalls: string[][] = [];
	const runHistoryCalls: string[] = [];
	const latestUnreadCalls: string[][] = [];
	const totalUnreadCalls: string[][] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [
				{
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
				},
			],
			get: async () => undefined,
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
			listRunsForConn: async (connId: string) => {
				runHistoryCalls.push(connId);
				return [];
			},
			listLatestRunsForConns: async (connIds: readonly string[]) => {
				latestRunCalls.push([...connIds]);
				return {
					"conn-1": {
						runId: "run-latest",
						connId: "conn-1",
						status: "succeeded",
						scheduledAt: "2026-04-18T00:00:00.000Z",
						startedAt: "2026-04-18T00:00:01.000Z",
						finishedAt: "2026-04-18T00:00:20.000Z",
						workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-latest",
						resultSummary: "done",
						createdAt: "2026-04-18T00:00:00.000Z",
						updatedAt: "2026-04-18T00:00:20.000Z",
					},
				};
			},
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getLatestUnreadTimesByConn: async (connIds: readonly string[]) => {
				latestUnreadCalls.push([...connIds]);
				return {};
			},
			getTotalUnreadCount: async (connIds?: readonly string[]) => {
				totalUnreadCalls.push([...(connIds ?? [])]);
				return 0;
			},
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/conns",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conns: [
			{
				connId: "conn-1",
				title: "digest",
				prompt: "summarize",
				target: { type: "conversation", conversationId: "manual:digest" },
				schedule: { kind: "interval", everyMs: 60000 },
				execution: { type: "agent_prompt" },
				assetRefs: ["asset-1"],
				status: "active",
				createdAt: "2026-04-18T00:00:00.000Z",
				updatedAt: "2026-04-18T00:00:00.000Z",
				nextRunAt: "2026-04-18T00:01:00.000Z",
				latestRun: {
					runId: "run-latest",
					connId: "conn-1",
					status: "succeeded",
					scheduledAt: "2026-04-18T00:00:00.000Z",
					startedAt: "2026-04-18T00:00:01.000Z",
					finishedAt: "2026-04-18T00:00:20.000Z",
					workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-latest",
					resultSummary: "done",
					createdAt: "2026-04-18T00:00:00.000Z",
					updatedAt: "2026-04-18T00:00:20.000Z",
				},
			},
		],
		totalUnreadRuns: 0,
		unreadLatestRunTimesByConnId: {},
		unreadRunCountsByConnId: {},
	});
	assert.deepEqual(latestRunCalls, [["conn-1"]]);
	assert.deepEqual(latestUnreadCalls, [["conn-1"]]);
	assert.deepEqual(totalUnreadCalls, [["conn-1"]]);
	assert.deepEqual(runHistoryCalls, []);
	await app.close();
});

test("DELETE /v1/conns/:connId deletes a scheduled conn task", async () => {
	const deletedConnIds: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async (connId: string) => {
				deletedConnIds.push(connId);
				return connId === "conn-1";
			},
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "DELETE",
		url: "/v1/conns/conn-1",
	});

	assert.equal(response.statusCode, 204);
	assert.deepEqual(deletedConnIds, ["conn-1"]);
	await app.close();
});

test("POST /v1/conns/bulk-delete deletes multiple scheduled conn tasks", async () => {
	const deletedConnIds: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async (connId: string) => {
				deletedConnIds.push(connId);
				return connId !== "missing";
			},
			deleteMany: async (connIds: string[]) => {
				deletedConnIds.push(...connIds);
				return {
					deletedConnIds: connIds.filter((connId) => connId !== "missing"),
					missingConnIds: connIds.filter((connId) => connId === "missing"),
				};
			},
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/conns/bulk-delete",
		payload: {
			connIds: ["conn-1", "conn-1", "missing", "conn-2"],
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		deletedConnIds: ["conn-1", "conn-2"],
		missingConnIds: ["missing"],
	});
	assert.deepEqual(deletedConnIds, ["conn-1", "missing", "conn-2"]);
	await app.close();
});
