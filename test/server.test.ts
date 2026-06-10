import test from "node:test";
import assert from "node:assert/strict";
import { NotificationHub } from "../src/agent/notification-hub.js";
import { buildServer } from "../src/server.js";
import type {
	ModelConfigSelection,
	ModelSelectionValidator,
} from "../src/agent/model-config.js";
import { createAgentServiceStub, createModelConfigStoreStub } from "./server-test-helpers.js";

test("POST /v1/chat returns aggregated chat response", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat",
		payload: {
			conversationId: "manual:test-2",
			message: "hello",
			userId: "u-001",
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:test-2",
		text: "echo:hello",
		sessionFile: "E:/sessions/test.jsonl",
	});
	await app.close();
});

test("POST /v1/chat passes uploaded file attachments to the agent service", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			chat: async (input) => {
				calls.push(input);
				return {
					conversationId: input.conversationId ?? "manual:file-input",
					text: "ok",
					sessionFile: "E:/sessions/test.jsonl",
				};
			},
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat",
		payload: {
			conversationId: "manual:file-input",
			message: "inspect attached file",
			attachments: [
				{
					fileName: "brief.txt",
					mimeType: "text/plain",
					sizeBytes: 11,
					text: "hello file",
				},
			],
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(calls, [
		{
			conversationId: "manual:file-input",
			message: "inspect attached file",
			userId: undefined,
			attachments: [
				{
					base64: undefined,
					fileName: "brief.txt",
					mimeType: "text/plain",
					sizeBytes: 11,
					text: "hello file",
				},
			],
		},
	]);
	await app.close();
});

test("POST /v1/chat passes reusable asset references to the agent service", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			chat: async (input) => {
				calls.push(input);
				return {
					conversationId: input.conversationId ?? "manual:asset-ref",
					text: "ok",
					sessionFile: "E:/sessions/test.jsonl",
				};
			},
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat",
		payload: {
			conversationId: "manual:asset-ref",
			message: "reuse it",
			assetRefs: ["asset-1", "asset-2"],
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(calls, [
		{
			conversationId: "manual:asset-ref",
			message: "reuse it",
			userId: undefined,
			assetRefs: ["asset-1", "asset-2"],
		},
	]);
	await app.close();
});

test("GET /v1/debug/skills returns the runtime skill registry", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/debug/skills",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		skills: [
			{ name: "using-superpowers", path: "E:/AII/ugk-pi/.pi/skills/superpowers/using-superpowers/SKILL.md" },
			{ name: "web-access", path: "E:/AII/ugk-pi/runtime/skills-user/web-access/SKILL.md" },
		],
		source: "cache",
		cachedAt: "2026-04-24T00:00:00.000Z",
	});
	await app.close();
});

test("GET /v1/debug/runtime is registered on the main server", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/debug/runtime",
	});

	assert.equal(response.statusCode, 200);
	const body = response.json();
	assert.equal(typeof body.ok, "boolean");
	assert.ok(Array.isArray(body.checks));
	assert.ok(body.checks.some((check: { name?: string }) => check.name === "agent data dir"));
	assert.ok(body.checks.some((check: { name?: string }) => check.name === "agents data dir"));
	assert.equal(typeof body.config, "object");
	assert.doesNotMatch(response.body, /API_KEY|SECRET|ANTHROPIC_AUTH_TOKEN/i);
	await app.close();
});

test("GET /v1/debug/cleanup is registered on the main server", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/debug/cleanup",
	});

	assert.equal(response.statusCode, 200);
	const body = response.json();
	assert.equal(typeof body.ok, "boolean");
	assert.equal(typeof body.connTargets.total, "number");
	assert.equal(typeof body.legacyConversationNotifications.total, "number");
	assert.equal(body.recentRuns.windowDays, 7);
	assert.ok(Array.isArray(body.risks));
	assert.doesNotMatch(response.body, /API_KEY|SECRET|ANTHROPIC_AUTH_TOKEN/i);
	await app.close();
});

test("GET /v1/model-config returns current provider and selectable models", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		modelConfigStore: createModelConfigStoreStub(),
		modelSelectionValidator: async () => ({ ok: true }),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/model-config",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		current: {
			provider: "zhipu-glm",
			model: "glm-5.1",
		},
		providers: [
			{
				id: "zhipu-glm",
				name: "Zhipu GLM",
				vendor: "zhipu",
				region: "cn",
				priority: 10,
				models: [{ id: "glm-5.1", name: "GLM-5.1" }],
				auth: {
					configured: true,
					envVar: "ZHIPU_GLM_API_KEY",
					source: "environment",
				},
			},
			{
				id: "deepseek",
				name: "DeepSeek",
				vendor: "deepseek",
				region: "global",
				priority: 20,
				models: [
					{ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: 1000000, maxTokens: 384000 },
					{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 1000000, maxTokens: 384000 },
				],
				auth: {
					configured: true,
					envVar: "DEEPSEEK_API_KEY",
					source: "environment",
				},
			},
			{
				id: "xiaomi-mimo-cn",
				models: [
					{ id: "mimo-v2.5-pro", name: "MiMo V2.5 Pro (Xiaomi CN)", contextWindow: 1048576, maxTokens: 16384 },
				],
				name: "Xiaomi MiMo China",
				vendor: "xiaomi",
				region: "cn",
				priority: 31,
				auth: {
					configured: true,
					envVar: "XIAOMI_MIMO_API_KEY",
					source: "environment",
				},
			},
		],
	});
	await app.close();
});

test("PUT /v1/model-config/default validates before switching default model", async () => {
	const calls: ModelConfigSelection[] = [];
	const validator: ModelSelectionValidator = async (selection) => {
		calls.push(selection);
		return { ok: true };
	};
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		modelConfigStore: createModelConfigStoreStub(),
		modelSelectionValidator: validator,
	});

	const response = await app.inject({
		method: "PUT",
		url: "/v1/model-config/default",
		payload: {
			provider: "deepseek",
			model: "deepseek-v4-pro",
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(calls, [{ provider: "deepseek", model: "deepseek-v4-pro" }]);
	assert.deepEqual(response.json(), {
		ok: true,
		current: {
			provider: "deepseek",
			model: "deepseek-v4-pro",
		},
		effective: "new_sessions",
	});
	await app.close();
});

test("PUT /v1/model-config/default does not switch when validation fails", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		modelConfigStore: createModelConfigStoreStub(),
		modelSelectionValidator: async () => ({
			ok: false,
			code: "provider_validation_failed",
			message: "provider failed",
		}),
	});

	const response = await app.inject({
		method: "PUT",
		url: "/v1/model-config/default",
		payload: {
			provider: "deepseek",
			model: "deepseek-v4-pro",
		},
	});

	assert.equal(response.statusCode, 400);
	assert.deepEqual(response.json(), {
		error: {
			code: "PROVIDER_VALIDATION_FAILED",
			message: "provider failed",
		},
	});
	const configResponse = await app.inject({
		method: "GET",
		url: "/v1/model-config",
	});
	assert.equal(configResponse.json().current.provider, "zhipu-glm");
	assert.equal(configResponse.json().current.model, "glm-5.1");
	await app.close();
});

test("GET /v1/chat/status returns whether the conversation is currently running", async () => {
	const calls: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			getRunStatus: async (conversationId) => {
				calls.push(conversationId);
				return {
					conversationId,
					running: true,
					contextUsage: {
						provider: "zhipu-glm",
						model: "glm-5.1",
						currentTokens: 45231,
						contextWindow: 128000,
						reserveTokens: 16384,
						maxResponseTokens: 16384,
						availableTokens: 66385,
						percent: 35,
						status: "safe",
						mode: "estimate",
					},
				};
			},
		}),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/chat/status?conversationId=manual:refresh-run",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:refresh-run",
		running: true,
		contextUsage: {
			provider: "zhipu-glm",
			model: "glm-5.1",
			currentTokens: 45231,
			contextWindow: 128000,
			reserveTokens: 16384,
			maxResponseTokens: 16384,
			availableTokens: 66385,
			percent: 35,
			status: "safe",
			mode: "estimate",
		},
	});
	assert.deepEqual(calls, ["manual:refresh-run"]);
	await app.close();
});

test("GET /v1/chat/events resumes after an active run event cursor", async () => {
	const calls: Array<{ conversationId: string; afterEventCursor?: number }> = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			subscribeRunEvents: (conversationId, onEvent, options) => {
				calls.push({ conversationId, afterEventCursor: options?.afterEventCursor });
				onEvent({
					type: "text_delta",
					textDelta: "live",
				});
				onEvent({
					type: "done",
					conversationId,
					runId: "run-events",
					text: "live",
				});
				return {
					conversationId,
					running: true,
					unsubscribe: () => undefined,
				};
			},
		}),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/chat/events?conversationId=manual:events&afterEventCursor=7",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /"textDelta":"live"/);
	assert.deepEqual(calls, [{ conversationId: "manual:events", afterEventCursor: 7 }]);
	await app.close();
});

test("GET /v1/chat/events attaches to the current active run event stream", async () => {
	const calls: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			subscribeRunEvents: (conversationId, onEvent) => {
				calls.push(conversationId);
				onEvent({
					type: "run_started",
					conversationId,
				});
				onEvent({
					type: "text_delta",
					textDelta: "after refresh",
				});
				onEvent({
					type: "done",
					conversationId,
					text: "after refresh",
					sessionFile: "E:/sessions/events.jsonl",
				});
				return {
					conversationId,
					running: true,
					unsubscribe: () => {
						calls.push("unsubscribed");
					},
				};
			},
		}),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/chat/events?conversationId=manual:events",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/event-stream/);
	assert.match(response.body, /"type":"run_started"/);
	assert.match(response.body, /"type":"text_delta"/);
	assert.match(response.body, /"type":"done"/);
	assert.deepEqual(calls, ["manual:events", "unsubscribed"]);
	await app.close();
});

test("GET /v1/chat/runs/:runId/events returns buffered chat run events", async () => {
	const calls: Array<{ conversationId: string; runId: string }> = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			getRunEvents: async (conversationId, runId) => {
				calls.push({ conversationId, runId });
				return [
					{
						type: "run_started",
						conversationId,
					},
					{
						type: "text_delta",
						textDelta: "ignored incremental body",
					},
					{
						type: "heartbeat",
						phase: "reasoning",
					},
					{
						type: "tool_started",
						toolCallId: "tool-1",
						toolName: "weather",
						args: '{"city":"Shanghai"}',
					},
					{
						type: "done",
						conversationId,
						text: "sunny",
					},
				];
			},
		}),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/chat/runs/run-chat-1/events?conversationId=manual:events",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:events",
		runId: "run-chat-1",
		events: [
			{
				type: "done",
				conversationId: "manual:events",
				text: "sunny",
			},
			{
				type: "tool_started",
				toolCallId: "tool-1",
				toolName: "weather",
				args: '{"city":"Shanghai"}',
			},
		],
		hasMore: true,
		nextBefore: "1",
		limit: 2,
	});
	assert.deepEqual(calls, [{ conversationId: "manual:events", runId: "run-chat-1" }]);
	await app.close();
});

test("GET /v1/activity returns global activity items newest-first", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {
			list: async (options?: unknown) => {
				calls.push(options);
				return [
					{
						activityId: "activity-new",
						scope: "agent",
						source: "conn",
						sourceId: "conn-2",
						runId: "run-2",
						conversationId: "manual:two",
						kind: "conn_result",
						title: "New completed",
						text: "new text",
						files: [],
						createdAt: "2026-04-22T10:03:00.000Z",
					},
					{
						activityId: "activity-old",
						scope: "agent",
						source: "conn",
						sourceId: "conn-1",
						runId: "run-1",
						conversationId: "manual:one",
						kind: "conn_result",
						title: "Old completed",
						text: "old text",
						files: [
							{
								fileName: "report.md",
								downloadUrl: "/v1/files/file-1",
							},
						],
						createdAt: "2026-04-22T10:01:00.000Z",
					},
				];
			},
			get: async () => undefined,
			markRead: async () => false,
			getUnreadCount: async () => 2,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/activity",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(calls, [{ limit: 51 }]);
	assert.deepEqual(response.json(), {
		activities: [
			{
				activityId: "activity-new",
				scope: "agent",
				source: "conn",
				sourceId: "conn-2",
				runId: "run-2",
				conversationId: "manual:two",
				kind: "conn_result",
				title: "New completed",
				text: "new text",
				files: [],
				createdAt: "2026-04-22T10:03:00.000Z",
			},
			{
				activityId: "activity-old",
				scope: "agent",
				source: "conn",
				sourceId: "conn-1",
				runId: "run-1",
				conversationId: "manual:one",
				kind: "conn_result",
				title: "Old completed",
				text: "old text",
				files: [
					{
						fileName: "report.md",
						downloadUrl: "/v1/files/file-1",
					},
				],
				createdAt: "2026-04-22T10:01:00.000Z",
			},
		],
		hasMore: false,
		unreadCount: 2,
	});
	await app.close();
});

test("GET /v1/activity/summary returns unread counts for the task inbox", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {
			get: async () => undefined,
			list: async () => [],
			markRead: async () => false,
			getUnreadCount: async () => 7,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/activity/summary",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		unreadCount: 7,
	});
	await app.close();
});

test("GET /v1/activity supports conversation filters and limits", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {
			list: async (options?: unknown) => {
				calls.push(options);
				return [];
			},
			get: async () => undefined,
			markRead: async () => false,
			getUnreadCount: async () => 3,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/activity?conversationId=manual%3Aone&limit=2&unreadOnly=true&before=2026-04-22T10%3A02%3A00.000Z",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), { activities: [], hasMore: false, unreadCount: 3 });
	assert.deepEqual(calls, [
		{
			limit: 3,
			conversationId: "manual:one",
			before: "2026-04-22T10:02:00.000Z",
			unreadOnly: true,
		},
	]);
	await app.close();
});

test("GET /v1/activity returns pagination metadata when another task inbox page exists", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {
			list: async (options?: unknown) => {
				calls.push(options);
				return [
					{
						activityId: "activity-new",
						scope: "agent",
						source: "conn",
						sourceId: "conn-2",
						runId: "run-2",
						conversationId: "manual:two",
						kind: "conn_result",
						title: "New completed",
						text: "new text",
						files: [],
						createdAt: "2026-04-22T10:03:00.000Z",
					},
					{
						activityId: "activity-middle",
						scope: "agent",
						source: "conn",
						sourceId: "conn-3",
						runId: "run-3",
						conversationId: "manual:one",
						kind: "conn_result",
						title: "Middle completed",
						text: "middle text",
						files: [],
						createdAt: "2026-04-22T10:02:00.000Z",
					},
					{
						activityId: "activity-old",
						scope: "agent",
						source: "conn",
						sourceId: "conn-1",
						runId: "run-1",
						conversationId: "manual:one",
						kind: "conn_result",
						title: "Old completed",
						text: "old text",
						files: [],
						createdAt: "2026-04-22T10:01:00.000Z",
					},
				];
			},
			get: async () => undefined,
			markRead: async () => false,
			getUnreadCount: async () => 2,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/activity?limit=2&unreadOnly=true",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(calls, [{ limit: 3, unreadOnly: true }]);
	assert.deepEqual(response.json(), {
		activities: [
			{
				activityId: "activity-new",
				scope: "agent",
				source: "conn",
				sourceId: "conn-2",
				runId: "run-2",
				conversationId: "manual:two",
				kind: "conn_result",
				title: "New completed",
				text: "new text",
				files: [],
				createdAt: "2026-04-22T10:03:00.000Z",
			},
			{
				activityId: "activity-middle",
				scope: "agent",
				source: "conn",
				sourceId: "conn-3",
				runId: "run-3",
				conversationId: "manual:one",
				kind: "conn_result",
				title: "Middle completed",
				text: "middle text",
				files: [],
				createdAt: "2026-04-22T10:02:00.000Z",
			},
		],
		hasMore: true,
		nextBefore: "2026-04-22T10:02:00.000Z|activity-middle",
		unreadCount: 2,
	});
	await app.close();
});

test("GET /v1/activity rejects invalid limits", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {
			list: async () => [],
			get: async () => undefined,
			markRead: async () => false,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/activity?limit=nope",
	});

	assert.equal(response.statusCode, 400);
	assert.match(response.body, /limit/);
	await app.close();
});

test("POST /v1/activity/:activityId/read marks an activity item read", async () => {
	const calls: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {
			list: async () => [],
			markRead: async (activityId: string) => {
				calls.push(activityId);
				return true;
			},
			get: async (activityId: string) => ({
				activityId,
				scope: "agent",
				source: "conn",
				sourceId: "conn-1",
				runId: "run-1",
				conversationId: "manual:one",
				kind: "conn_result",
				title: "Read me",
				text: "done",
				files: [],
				createdAt: "2026-04-22T10:01:00.000Z",
				readAt: "2026-04-22T10:03:00.000Z",
			}),
			getUnreadCount: async () => 4,
		} as never,
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/activity/activity-1/read",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(calls, ["activity-1"]);
	assert.deepEqual(response.json(), {
		activity: {
			activityId: "activity-1",
			scope: "agent",
			source: "conn",
			sourceId: "conn-1",
			runId: "run-1",
			conversationId: "manual:one",
			kind: "conn_result",
			title: "Read me",
			text: "done",
			files: [],
			createdAt: "2026-04-22T10:01:00.000Z",
			readAt: "2026-04-22T10:03:00.000Z",
		},
		unreadCount: 4,
	});
	await app.close();
});

test("POST /v1/activity/read-all marks all task inbox items as read", async () => {
	const calls: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {
			list: async () => [],
			get: async () => undefined,
			markRead: async () => false,
			getUnreadCount: async () => 0,
			markAllRead: async () => {
				calls.push("all");
				return 5;
			},
		} as never,
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/activity/read-all",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(calls, ["all"]);
	assert.deepEqual(response.json(), {
		markedCount: 5,
		unreadCount: 0,
	});
	await app.close();
});

test("POST /v1/internal/notifications/broadcast publishes a notification event to the hub", async () => {
	const hub = new NotificationHub();
	const events: unknown[] = [];
	const subscription = hub.subscribe((event) => {
		events.push(event);
	});
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		notificationHub: hub,
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/internal/notifications/broadcast",
		payload: {
			notificationId: "notice-1",
			conversationId: "manual:notice",
			source: "conn",
			sourceId: "conn-1",
			runId: "run-1",
			kind: "conn_result",
			title: "Daily Digest completed",
			createdAt: "2026-04-21T10:01:05.000Z",
		},
	});

	assert.equal(response.statusCode, 202);
	assert.deepEqual(response.json(), { ok: true });
	assert.deepEqual(events, [
		{
			notificationId: "notice-1",
			conversationId: "manual:notice",
			source: "conn",
			sourceId: "conn-1",
			runId: "run-1",
			kind: "conn_result",
			title: "Daily Digest completed",
			createdAt: "2026-04-21T10:01:05.000Z",
		},
	]);

	subscription.unsubscribe();
	await app.close();
});
