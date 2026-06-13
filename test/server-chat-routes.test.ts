import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { AgentBusyError } from "../src/agent/agent-errors.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

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
			message: "Internal server error",
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
