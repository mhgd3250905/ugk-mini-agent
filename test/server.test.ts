import test from "node:test";
import assert from "node:assert/strict";
import { NotificationHub } from "../src/agent/notification-hub.js";
import { buildServer } from "../src/server.js";
import { AgentBusyError } from "../src/agent/agent-errors.js";
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

test("POST /v1/chat/stream returns server-sent events for the agent run", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat/stream",
		payload: {
			conversationId: "manual:test-stream",
			message: "????",
			userId: "u-002",
		},
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/event-stream/);
	assert.match(response.body, /"type":"run_started"/);
	assert.match(response.body, /"type":"tool_started"/);
	assert.match(response.body, /"type":"text_delta"/);
	assert.match(response.body, /"type":"done"/);
	await app.close();
});

test("POST /v1/chat/queue queues a steer message for an active run", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			queueMessage: async (input) => {
				calls.push(input);
				return {
					conversationId: input.conversationId,
					mode: input.mode,
					queued: true,
				};
			},
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat/queue",
		payload: {
			conversationId: "manual:queue",
			message: "steer",
			mode: "steer",
			userId: "u-queue",
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:queue",
		mode: "steer",
		queued: true,
	});
	assert.deepEqual(calls, [
		{
			conversationId: "manual:queue",
			message: "steer",
			mode: "steer",
			userId: "u-queue",
		},
	]);
	await app.close();
});

test("POST /v1/chat/interrupt interrupts an active run", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			interruptChat: async (input) => {
				calls.push(input);
				return {
					conversationId: input.conversationId,
					interrupted: true,
				};
			},
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat/interrupt",
		payload: {
			conversationId: "manual:interrupt",
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:interrupt",
		interrupted: true,
	});
	assert.deepEqual(calls, [{ conversationId: "manual:interrupt" }]);
	await app.close();
});

test("POST /v1/chat/reset clears the canonical conversation state", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			resetConversation: async (input) => {
				calls.push(input);
				return {
					conversationId: input.conversationId,
					reset: true,
				};
			},
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat/reset",
		payload: {
			conversationId: "agent:global",
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "agent:global",
		reset: true,
	});
	assert.deepEqual(calls, [{ conversationId: "agent:global" }]);
	await app.close();
});

test("POST /v1/chat returns 400 when message is missing", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat",
		payload: {
			conversationId: "manual:test-3",
		},
	});

	assert.equal(response.statusCode, 400);
	assert.deepEqual(response.json(), {
		error: {
			code: "BAD_REQUEST",
			message: "Field \"message\" must be a non-empty string",
		},
	});
	await app.close();
});

test("POST /v1/chat/stream returns 400 when message is missing", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat/stream",
		payload: {
			conversationId: "manual:test-stream-400",
		},
	});

	assert.equal(response.statusCode, 400);
	assert.deepEqual(response.json(), {
		error: {
			code: "BAD_REQUEST",
			message: "Field \"message\" must be a non-empty string",
		},
	});
	await app.close();
});

test("POST /v1/chat returns 500 when agent service throws", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub({
			chat: async () => {
				throw new Error("boom");
			},
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat",
		payload: {
			conversationId: "manual:test-4",
			message: "trigger error",
		},
	});

	assert.equal(response.statusCode, 500);
	assert.deepEqual(response.json(), {
		error: {
			code: "INTERNAL_ERROR",
			message: "boom",
		},
	});
	await app.close();
});

test("POST /v1/chat returns 409 when the main agent is busy", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub({
			chat: async () => {
				throw new AgentBusyError("main", "manual:active");
			},
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat",
		payload: {
			conversationId: "manual:test-busy",
			message: "trigger busy",
		},
	});

	assert.equal(response.statusCode, 409);
	assert.equal(response.json().error.code, "AGENT_BUSY");
	assert.equal(response.json().error.message, "Agent main is currently busy");
	assert.equal(response.json().error.agentId, "main");
	assert.equal(response.json().error.activeConversationId, "manual:active");
	assert.ok(Array.isArray(response.json().error.suggestedAgents));
	await app.close();
});

test("POST /v1/chat/stream returns 409 before SSE hijack when the main agent is busy", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub({
			getAgentRunStatus: () => ({
				agentId: "main",
				status: "busy",
				activeConversationId: "manual:active",
				activeSince: "2026-05-09T00:00:00.000Z",
			}),
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat/stream",
		payload: {
			conversationId: "manual:test-busy-stream",
			message: "trigger busy",
		},
	});

	assert.equal(response.statusCode, 409);
	assert.equal(response.json().error.code, "AGENT_BUSY");
	assert.equal(response.json().error.agentId, "main");
	assert.equal(response.json().error.activeConversationId, "manual:active");
	await app.close();
});

test("GET /playground/team includes run detail mindmap view shell", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/team",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/html/);
	assert.match(response.body, /class="topbar-back" href="\/playground\?view=chat" title="返回对话" aria-label="返回对话"/);
	assert.match(response.body, /function renderPlanTeamPanel\(plan\)/);
	assert.match(response.body, /id="plan-detail-team-select"/);
	assert.match(response.body, /\/plans\/' \+ pathSegment\(planId\) \+ '\/default-team/);
	assert.match(response.body, /function editPlanDetailTeam\(teamUnitId\)/);

	// View state for per-run mindmap/detail switch
	assert.match(response.body, /_runDetailViewByRunId/);
	assert.match(response.body, /function getRunDetailView/);
	assert.match(response.body, /function setRunDetailView/);

	// Shell function that wraps both views
	assert.match(response.body, /function renderRunDetailShell/);

	// Mindmap placeholder function
	assert.match(response.body, /function renderTeamMindmap/);

	// Segmented switch labels
	assert.match(response.body, /脑图/);
	assert.match(response.body, /详情/);

	// Switch uses data attribute for stable CSS targeting
	assert.match(response.body, /data-run-detail-view="mindmap"/);
	assert.match(response.body, /data-run-detail-view="detail"/);

	// Old detail renderer still exists and is reachable from shell
	assert.match(response.body, /function renderTaskDetail/);

	// toggleRunDetail and updateRunCard render through the shell, not directly
	assert.match(response.body, /detailEl\.innerHTML\s*=\s*renderRunDetailShell\(/);
	assert.match(response.body, /var newHtml\s*=\s*renderRunDetailShell\(/);

	await app.close();
});

test("GET /playground/team caches run state for safe detail view switching", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/team",
	});

	assert.equal(response.statusCode, 200);

	assert.match(response.body, /var _planCache = \{\};/);
	assert.match(response.body, /function buildFallbackPlanFromRunState\(state\)/);
	assert.match(response.body, /原计划定义不可用，当前详情按 run 状态展示。/);
	assert.match(response.body, /loadAgents\(\)\.then\(async function\(\)/);
	assert.match(response.body, /await loadPlans\(\)/);

	// Full run-state cache exists
	assert.match(response.body, /window\._latestRunStateForRun/);

	// toggleRunDetail stores the complete fetched state into the cache
	assert.match(response.body, /window\._latestRunStateForRun\[runId\]\s*=\s*state/);

	// switchRunDetailView reads from cache, not from a bare { runId } object
	assert.match(response.body, /var state = window\._latestRunStateForRun\s*\?\s*window\._latestRunStateForRun\[runId\]/);

	// Fallback includes taskStates so renderTaskDetail does not throw
	assert.match(response.body, /taskStates:\s*\{\}/);

	// onclick uses jsArg for runId and view names (not escapeHtml string concatenation)
	assert.match(response.body, /jsArg\(runId\)/);
	assert.match(response.body, /jsArg\('mindmap'\)/);
	assert.match(response.body, /jsArg\('detail'\)/);

	// updateRunCard preserves cached state by reading from _latestRunStateForRun
	assert.match(
		response.body,
		/window\._latestRunStateForRun\[r\.runId\]/,
	);

	await app.close();
});

test("GET /playground/team scopes run detail expansion to the clicked card", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/team",
	});

	assert.equal(response.statusCode, 200);

	assert.match(response.body, /function findRunDetailElement\(runId, sourceEl\)/);
	assert.match(response.body, /sourceEl\.closest\('\[data-run-id\]'\)/);
	assert.match(response.body, /var scoped = card\.querySelector\('\.run-detail'\)/);
	assert.match(response.body, /async function toggleRunDetail\(runId, sourceEl\)/);
	assert.match(response.body, /var detailEl = findRunDetailElement\(runId, sourceEl\)/);
	assert.match(response.body, /toggleRunDetail\(runId, el\)/);
	assert.match(response.body, /onclick="toggleRunDetail\([\s\S]*this\)">展开任务详情/);
	assert.doesNotMatch(response.body, /var detailEl = \$\("run-detail-" \+ runId\)/);
	assert.doesNotMatch(response.body, /var detailEl = \$\('run-detail-' \+ runId\)/);

	await app.close();
});


	test("GET /playground/team includes mindmap view-model helpers and node structure", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// View-model helpers exist
		assert.match(response.body, /function buildMindmapNodes/);
		assert.match(response.body, /function collectRunTaskDefinitions/);
		assert.match(response.body, /function getMindmapChildrenByParent/);
		assert.match(response.body, /function describeMindmapNodeType/);

		// Renderer uses stable CSS classes / data attributes
		assert.match(response.body, /team-mindmap/);
		assert.match(response.body, /mindmap-root-node/);
		assert.match(response.body, /mindmap-task-node/);
		assert.match(response.body, /mindmap-children/);
		assert.match(response.body, /data-node-status/);
		assert.match(response.body, /data-node-type/);

		// Failed nodes show error summary in compact view
		assert.match(response.body, /mindmap-node-error/);

		await app.close();
	});

	test("GET /playground/team mindmap attribution uses sourceItemId and orphan group", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// Priority 3: sourceItemId participates in child attribution
		// getMindmapChildrenByParent reads def.sourceItemId and checks for_each parents
		assert.match(response.body, /def\.sourceItemId/);
		assert.match(response.body, /forEachParents\.length === 1/);

		// Orphan group is rendered for unassigned task states
		assert.match(response.body, /__orphan_generated__/);
		assert.match(response.body, /orphan-group/);

		// getMindmapChildrenByParent returns orphanIds, not just byParent
		assert.match(response.body, /orphanIds/);

		// Prefix fallback is tracked separately from metadata attribution
		assert.match(response.body, /prefixFallbackIds/);

		await app.close();
	});

	test("GET /playground/team includes mindmap adaptive node interactions", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// Interaction state variables
		assert.match(response.body, /_mindmapExpandedNodes/);
		assert.match(response.body, /_mindmapExpandedGroups/);

		// Toggle functions exposed on window
		assert.match(response.body, /window\.toggleMindmapNode/);
		assert.match(response.body, /window\.toggleMindmapGroup/);

		// Helper predicates
		assert.match(response.body, /function isMindmapNodeExpanded/);
		assert.match(response.body, /function isMindmapGroupExpanded/);
		assert.match(response.body, /function rerenderMindmap/);

		// Failed nodes default expanded
		assert.match(response.body, /nodeStatus === 'failed'/);

		// Node toggle button class and click handler with stopPropagation
		assert.match(response.body, /mindmap-node-toggle/);
		assert.match(response.body, /event\.stopPropagation\(\);toggleMindmapNode/);

		// Expanded node details container
		assert.match(response.body, /mindmap-node-details/);

		// Expanded state indicator
		assert.match(response.body, /mindmap-node-expanded/);

		// Large child group controls
		assert.match(response.body, /MINDMAP_GROUP_LIMIT/);
		assert.match(response.body, /展开全部/);
		assert.match(response.body, /收起/);

		// Failed node error visible in compact mode
		assert.match(response.body, /mindmap-node-error/);

		// File chip uses button element and calls viewAttemptFile with stopPropagation
		assert.match(response.body, /<button class="file-chip" onclick="event\.stopPropagation\(\);viewAttemptFile\(/);

		// Group toggle uses stopPropagation to prevent run card collapse
		assert.match(response.body, /event\.stopPropagation\(\);toggleMindmapGroup/);

			// renderMindmapNode accepts runId, attemptsMap, and runStatus
			assert.match(response.body, /function renderMindmapNode\(node, depth, runId, attemptsMap, runStatus\)/);

		// renderTeamMindmap passes runId through
		assert.match(response.body, /function renderTeamMindmap\(runId, state, plan, attemptsMap\)/);

		// Node progress and activeAttemptId rendering in expanded mode
		assert.match(response.body, /node\.progress/);
		assert.match(response.body, /node\.activeAttemptId/);
		assert.match(response.body, /node\.resultRef/);

		// Expanded node shows metadata: generated, parentTaskId, sourceItemId
		assert.match(response.body, /node\.generated/);
		assert.match(response.body, /node\.parentTaskId/);

		await app.close();
	});

	test("GET /playground/team failed mindmap node first click collapses", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// The click handler must pass node.status so toggle can compute visible state
		// Source uses: toggleMindmapNode(' + jsArg(runId) + ',' + jsArg(node.id) + ',' + jsArg(node.status) + ')
		assert.match(
			response.body,
			/jsArg\(node\.status\)/,
		);

		// The onclick contains toggleMindmapNode with node status and the clicked button as scope
		assert.match(
			response.body,
			/toggleMindmapNode\(' \+ jsArg\(runId\) \+ ',' \+ jsArg\(node\.id\) \+ ',' \+ jsArg\(node\.status\) \+ ',this\)/,
		);

		// toggleMindmapNode must accept nodeStatus and sourceEl arguments
		assert.match(
			response.body,
			/window\.toggleMindmapNode\s*=\s*function\s*\(\s*runId\s*,\s*taskId\s*,\s*nodeStatus\s*,\s*sourceEl\s*\)/,
		);

		// toggle must compute currentlyExpanded from isMindmapNodeExpanded, not bare flip
		assert.match(
			response.body,
			/var currentlyExpanded\s*=\s*isMindmapNodeExpanded\(/,
		);

		// toggle writes the inverse of the computed visible state
		assert.match(
			response.body,
			/_mindmapExpandedNodes\[key\]\s*=\s*!currentlyExpanded/,
		);

		// Verify the old bare-flip pattern is gone
		assert.doesNotMatch(
			response.body,
			/_mindmapExpandedNodes\[key\]\s*=\s*!_mindmapExpandedNodes\[key\]/,
		);

		// Failed nodes still default expanded when never interacted with
		assert.match(
			response.body,
			/nodeStatus === 'failed' && _mindmapExpandedNodes\[key\] === undefined/,
		);

		await app.close();
	});

	test("GET /playground/team includes mindmap visual polish CSS classes", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// View toggle uses CSS class
		assert.match(response.body, /mindmap-view-toggle["\s>]/);
		assert.match(response.body, /mindmap-view-toggle-btn/);

		// Mindmap canvas wrapper
		assert.match(response.body, /class="team-mindmap"/);
		assert.match(response.body, /class="mindmap-canvas"/);

		// CSS class definitions exist in style block
		assert.match(response.body, /\.mindmap-root-node\b/);
		assert.match(response.body, /\.mindmap-task-node\b/);
		assert.match(response.body, /\.mindmap-children\b/);
		assert.match(response.body, /\.mindmap-node-error\b/);
		assert.match(response.body, /\.mindmap-node-details\b/);
		assert.match(response.body, /\.mindmap-node-toggle\b/);

		// Status-specific CSS selectors exist
		assert.match(response.body, /data-node-status="running"]/);
		assert.match(response.body, /data-node-status="succeeded"]/);
		assert.match(response.body, /data-node-status="failed"]/);
		assert.match(response.body, /data-node-status="skipped"]/);

		// Running pulse animation
		assert.match(response.body, /@keyframes mindmap-pulse/);

		// Connector trunk and branch selectors
		assert.match(response.body, /\.mindmap-children::before/);
		assert.match(response.body, /\.mindmap-task-node::before/);

		// Mobile media query covers mindmap
		assert.match(
			response.body,
			/@media \(max-width: 720px\)[\s\S]*?\.team-mindmap/,
		);
		assert.match(
			response.body,
			/@media \(max-width: 720px\)[\s\S]*?\.mindmap-children::before/,
		);

		// Group toggle uses CSS class
		assert.match(response.body, /class="mindmap-group-toggle"/);
		assert.match(response.body, /\.mindmap-group-toggle\b/);

		// No native alert/confirm/prompt
		assert.doesNotMatch(response.body, /\balert\s*\(/);
		assert.doesNotMatch(response.body, /\bconfirm\s*\(/);
		assert.doesNotMatch(response.body, /\bprompt\s*\(/);

		// Node rendering uses CSS classes (no inline padding/border on task nodes)
		assert.doesNotMatch(
			response.body,
			/mindmap-task-node[^"]*"[^>]*padding:6px 10px/,
		);
		assert.doesNotMatch(
			response.body,
			/mindmap-task-node[^"]*"[^>]*border:1px solid/,
		);

		await app.close();
	});

	test("GET /playground/team includes mindmap task disposition controls", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// renderMindmapNode accepts runStatus parameter
		assert.match(response.body, /function renderMindmapNode\(node, depth, runId, attemptsMap, runStatus\)/);

		// renderTeamMindmap passes state.status
		assert.match(response.body, /renderMindmapNode\(root, 0, runId, attemptsMap, state\.status\)/);

		// Disposition buttons in mindmap use stopPropagation + setTaskDisposition
		assert.match(response.body, /event\.stopPropagation\(\);setTaskDisposition\(' \+ jsArg\(runId\) \+ ',' \+ jsArg\(node\.id\) \+ ',' \+ jsArg\('skip'\)/);
		assert.match(response.body, /event\.stopPropagation\(\);setTaskDisposition\(' \+ jsArg\(runId\) \+ ',' \+ jsArg\(node\.id\) \+ ',' \+ jsArg\('force_rerun'\)/);
		assert.match(response.body, /event\.stopPropagation\(\);setTaskDisposition\(' \+ jsArg\(runId\) \+ ',' \+ jsArg\(node\.id\) \+ ',' \+ jsArg\('default'\)/);

		// Disposition badges
		assert.match(response.body, /已设跳过/);
		assert.match(response.body, /已设强制重跑/);

		// Recursive call passes runStatus
		assert.match(response.body, /renderMindmapNode\(node\.children\[i\],\s*depth \+ 1,\s*runId,\s*attemptsMap,\s*runStatus\)/);

		// buildMindmapNodes carries manualDisposition
		assert.match(response.body, /manualDisposition:\s*ts\s*\?\s*ts\.manualDisposition/);

		await app.close();
	});


test("playground initial load defers non-chat panel data", async (t) => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({ method: "GET", url: "/playground" });
	assert.equal(response.statusCode, 200);

	const body = response.body;

	// state declares lazy gate flags
	assert.match(body, /assetsLoadedOnce: false/);
	assert.match(body, /connManagerLoadedOnce: false/);

	// The init function should NOT contain these eager calls.
	// Use indexOf to grab the region between the function definition and its call.
	const initDef = body.indexOf("function initializePlaygroundAssembler()");
	const initCall = body.indexOf("initializePlaygroundAssembler();", initDef + 1);
	assert.ok(initDef > 0, "init function definition not found");
	assert.ok(initCall > initDef, "init function call not found");
	const initRegion = body.slice(initDef, initCall);
	assert.doesNotMatch(initRegion, /void loadAssets\(/);
	assert.doesNotMatch(initRegion, /syncTaskInboxSummary/);
	assert.doesNotMatch(initRegion, /syncConnManagerUnreadSummary/);

	// init still loads agent status and runtime summary (first-screen essentials)
	assert.match(initRegion, /loadAgentStatusAndRenderCards/);
	assert.match(initRegion, /syncRuntimeSummary/);

	// openAssetLibrary has lazy gate
	assert.match(body, /if \(!state\.assetsLoadedOnce\) \{ void loadAssets\(true\); \}/);

	// stream done event guards loadAssets with assetsLoadedOnce
	assert.match(body, /if \(state\.assetsLoadedOnce\) \{ void loadAssets\(true\); \}/);

	// focus/visibility conn summary refresh is guarded
	assert.match(body, /if \(state\.connManagerLoadedOnce\) \{ void syncConnManagerUnreadSummary/);

	await app.close();
});
