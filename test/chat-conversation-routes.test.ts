import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

test("GET /v1/chat/history returns the requested conversation transcript", async () => {
	const calls: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			getConversationHistory: async (conversationId, options) => {
				calls.push(`${conversationId}:${options?.limit ?? ""}:${options?.before ?? ""}`);
				return {
					conversationId,
					messages: [
						{
							id: "history-1",
							kind: "user",
							title: "manual:thread-1",
							text: "?????",
							createdAt: "2026-04-20T00:00:00.000Z",
						},
						{
							id: "history-2",
							kind: "assistant",
							title: "Assistant",
							text: "reply",
							createdAt: "2026-04-20T00:00:01.000Z",
						},
					],
					hasMore: true,
					nextBefore: "history-1",
					limit: options?.limit,
				};
			},
		}),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/chat/history?conversationId=manual%3Athread-1&limit=25&before=history-3",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:thread-1",
		messages: [
			{
				id: "history-1",
				kind: "user",
				title: "manual:thread-1",
				text: "?????",
				createdAt: "2026-04-20T00:00:00.000Z",
			},
			{
				id: "history-2",
				kind: "assistant",
				title: "Assistant",
				text: "reply",
				createdAt: "2026-04-20T00:00:01.000Z",
			},
		],
		hasMore: true,
		nextBefore: "history-1",
		limit: 25,
	});
	assert.deepEqual(calls, ["manual:thread-1:25:history-3"]);
	await app.close();
});

test("GET /v1/chat/state returns the canonical conversation state", async () => {
	const calls: Array<{ conversationId: string; viewLimit?: number }> = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			getConversationState: async (conversationId, options) => {
				calls.push({ conversationId, viewLimit: options?.viewLimit });
				return {
					conversationId,
					running: true,
					contextUsage: {
						provider: "zhipu-glm",
						model: "glm-5.1",
						currentTokens: 128,
						contextWindow: 128000,
						reserveTokens: 16384,
						maxResponseTokens: 16384,
						availableTokens: 111104,
						percent: 1,
						status: "safe",
						mode: "estimate",
					},
					messages: [
						{
							id: "history-1",
							kind: "user",
							title: "manual:thread-2",
							text: "old task",
							createdAt: "2026-04-20T00:00:00.000Z",
						},
					],
					viewMessages: [
						{
							id: "history-1",
							kind: "user",
							title: "manual:thread-2",
							text: "old task",
							createdAt: "2026-04-20T00:00:00.000Z",
						},
						{
							id: "active-input-run-agent-global-1",
							kind: "user",
							title: "manual:thread-2",
							text: "current task",
							createdAt: "2026-04-20T00:00:01.000Z",
						},
						{
							id: "active-run-agent-global-1",
							kind: "assistant",
							title: "助手",
							text: "partial",
							createdAt: "2026-04-20T00:00:01.000Z",
						},
					],
					activeRun: {
						runId: "run-agent-global-1",
						status: "running",
						assistantMessageId: "active-run-agent-global-1",
						input: {
							message: "current task",
							inputAssets: [],
						},
						text: "partial",
						process: {
							title: "????",
							narration: ["????"],
							currentAction: "???? ? bash",
							kind: "tool",
							isComplete: false,
							entries: [],
						},
						queue: {
							steering: [],
							followUp: [],
						},
						loading: true,
						startedAt: "2026-04-20T00:00:01.000Z",
						updatedAt: "2026-04-20T00:00:02.000Z",
					},
					updatedAt: "2026-04-20T00:00:02.000Z",
					historyPage: {
						hasMore: false,
						limit: options?.viewLimit,
					},
				};
			},
		}),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/chat/state?conversationId=manual%3Athread-2&viewLimit=80",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:thread-2",
		running: true,
		contextUsage: {
			provider: "zhipu-glm",
			model: "glm-5.1",
			currentTokens: 128,
			contextWindow: 128000,
			reserveTokens: 16384,
			maxResponseTokens: 16384,
			availableTokens: 111104,
			percent: 1,
			status: "safe",
			mode: "estimate",
		},
		messages: [
			{
				id: "history-1",
				kind: "user",
				title: "manual:thread-2",
				text: "old task",
				createdAt: "2026-04-20T00:00:00.000Z",
			},
		],
		viewMessages: [
			{
				id: "history-1",
				kind: "user",
				title: "manual:thread-2",
				text: "old task",
				createdAt: "2026-04-20T00:00:00.000Z",
			},
			{
				id: "active-input-run-agent-global-1",
				kind: "user",
				title: "manual:thread-2",
				text: "current task",
				createdAt: "2026-04-20T00:00:01.000Z",
			},
			{
				id: "active-run-agent-global-1",
				kind: "assistant",
				title: "助手",
				text: "partial",
				createdAt: "2026-04-20T00:00:01.000Z",
			},
		],
		activeRun: {
			runId: "run-agent-global-1",
			status: "running",
			assistantMessageId: "active-run-agent-global-1",
			input: {
				message: "current task",
				inputAssets: [],
			},
			text: "partial",
			process: {
				title: "????",
				narration: ["????"],
				currentAction: "???? ? bash",
				kind: "tool",
				isComplete: false,
				entries: [],
			},
			queue: {
				steering: [],
				followUp: [],
			},
			loading: true,
			startedAt: "2026-04-20T00:00:01.000Z",
			updatedAt: "2026-04-20T00:00:02.000Z",
		},
		updatedAt: "2026-04-20T00:00:02.000Z",
		historyPage: {
			hasMore: false,
			limit: 80,
		},
	});
	assert.deepEqual(calls, [{ conversationId: "manual:thread-2", viewLimit: 80 }]);
	await app.close();
});

test("GET /v1/chat/conversations returns the server-synced current conversation catalog", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub({
			getConversationCatalog: async () => ({
				currentConversationId: "manual:thread-2",
				conversations: [
					{
						conversationId: "manual:thread-2",
						title: "Thread 2",
						preview: "Latest preview",
						messageCount: 6,
						createdAt: "2026-04-20T00:00:00.000Z",
						updatedAt: "2026-04-20T00:02:00.000Z",
						running: false,
					},
					{
						conversationId: "manual:thread-1",
						title: "?????",
						preview: "Preview one",
						messageCount: 12,
						createdAt: "2026-04-19T23:50:00.000Z",
						updatedAt: "2026-04-19T23:59:00.000Z",
						running: false,
					},
				],
			}),
		}),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/chat/conversations",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		currentConversationId: "manual:thread-2",
		conversations: [
			{
				conversationId: "manual:thread-2",
				title: "Thread 2",
				preview: "Latest preview",
				messageCount: 6,
				createdAt: "2026-04-20T00:00:00.000Z",
				updatedAt: "2026-04-20T00:02:00.000Z",
				running: false,
			},
			{
				conversationId: "manual:thread-1",
				title: "?????",
				preview: "Preview one",
				messageCount: 12,
				createdAt: "2026-04-19T23:50:00.000Z",
				updatedAt: "2026-04-19T23:59:00.000Z",
				running: false,
			},
		],
	});
	await app.close();
});

test("POST /v1/chat/conversations creates and activates a new conversation", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub({
			createConversation: async () => ({
				conversationId: "manual:new-2",
				currentConversationId: "manual:new-2",
				created: true,
			}),
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat/conversations",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:new-2",
		currentConversationId: "manual:new-2",
		created: true,
	});
	await app.close();
});

test("POST /v1/chat/current switches the globally active conversation", async () => {
	const calls: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			switchConversation: async (conversationId) => {
				calls.push(conversationId);
				return {
					conversationId,
					currentConversationId: conversationId,
					switched: true,
				};
			},
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat/current",
		payload: {
			conversationId: "manual:thread-1",
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:thread-1",
		currentConversationId: "manual:thread-1",
		switched: true,
	});
	assert.deepEqual(calls, ["manual:thread-1"]);
	await app.close();
});

test("DELETE /v1/chat/conversations/:conversationId removes a conversation", async () => {
	const calls: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			deleteConversation: async (conversationId) => {
				calls.push(conversationId);
				return {
					conversationId,
					currentConversationId: "manual:thread-2",
					deleted: true,
				};
			},
		}),
	});

	const response = await app.inject({
		method: "DELETE",
		url: "/v1/chat/conversations/manual%3Athread-1",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:thread-1",
		currentConversationId: "manual:thread-2",
		deleted: true,
	});
	assert.deepEqual(calls, ["manual:thread-1"]);
	await app.close();
});

test("PATCH /v1/chat/conversations/:conversationId updates conversation menu metadata", async () => {
	const calls: Array<{ conversationId: string; patch: { title?: string; pinned?: boolean; backgroundColor?: string } }> = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			updateConversation: async (conversationId, patch) => {
				calls.push({ conversationId, patch });
				return {
					conversationId,
					updated: true,
					conversation: {
						conversationId,
						title: patch.title ?? "Thread",
						preview: "preview",
						messageCount: 2,
						createdAt: "2026-04-20T00:00:00.000Z",
						updatedAt: "2026-04-20T00:01:00.000Z",
						running: false,
						pinned: patch.pinned,
						backgroundColor: patch.backgroundColor,
					},
				};
			},
		}),
	});

	const response = await app.inject({
		method: "PATCH",
		url: "/v1/chat/conversations/manual%3Athread-1",
		payload: {
			title: "  重命名后的会话  ",
			pinned: true,
			backgroundColor: "sky",
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(calls, [
		{
			conversationId: "manual:thread-1",
			patch: {
				title: "重命名后的会话",
				pinned: true,
				backgroundColor: "sky",
			},
		},
	]);
	assert.equal(response.json().conversation.title, "重命名后的会话");
	assert.equal(response.json().conversation.pinned, true);
	assert.equal(response.json().conversation.backgroundColor, "sky");
	await app.close();
});
