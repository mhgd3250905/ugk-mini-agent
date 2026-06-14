import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultAgentProfiles } from "../src/agent/agent-profile.js";
import type { AgentService } from "../src/agent/agent-service.js";
import { AgentServiceRegistry } from "../src/agent/agent-service-registry.js";
import type { AgentMcpCallResult } from "../src/agent/mcp-client-manager.js";
import {
	createAgentMcpServer,
	type AgentMcpServerConfig,
	type AgentMcpToolSummary,
} from "../src/agent/mcp-server-catalog.js";
import { registerAgentMcpRoutes } from "../src/routes/agent-mcp.js";

function createScopedAgentService(agentId: string, running = false): AgentService {
	return {
		getAgentRunStatus: () =>
			running
				? { agentId, status: "busy", activeConversationId: `manual:${agentId}`, activeSince: new Date(0).toISOString() }
				: { agentId, status: "idle" },
		getConversationCatalog: async () => ({
			currentConversationId: `manual:${agentId}`,
			conversations: [
				{
					conversationId: `manual:${agentId}`,
					title: `${agentId} title`,
					preview: "",
					messageCount: 0,
					createdAt: new Date(0).toISOString(),
					updatedAt: new Date(0).toISOString(),
					running,
				},
			],
		}),
	} as unknown as AgentService;
}

async function createApp(input: {
	runningAgents?: Set<string>;
	lockedProfileIds?: Set<string>;
	clientManager?: {
		testServer?: (server: AgentMcpServerConfig, signal?: AbortSignal) => Promise<{ ok: boolean; serverId: string; tools: AgentMcpToolSummary[]; error?: string }>;
		listTools?: (server: AgentMcpServerConfig, signal?: AbortSignal) => Promise<AgentMcpToolSummary[]>;
		callTool?: (server: AgentMcpServerConfig, toolName: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<AgentMcpCallResult>;
		close?: () => Promise<void>;
	};
	templateInvalidations?: string[];
} = {}) {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-agent-mcp-route-"));
	const registry = new AgentServiceRegistry({
		profiles: createDefaultAgentProfiles(projectRoot),
		createService: (profile) => createScopedAgentService(profile.agentId, input.runningAgents?.has(profile.agentId) ?? false),
	});
	const app = Fastify({ logger: false });
	registerAgentMcpRoutes(app, {
		projectRoot,
		agentServiceRegistry: registry,
		agentTemplateRegistry: {
			invalidate(profileId?: string) {
				input.templateInvalidations?.push(profileId ?? "");
			},
		},
		teamProfileLockProvider: async () => input.lockedProfileIds ?? new Set(),
		clientManager: input.clientManager as never,
	});
	return { app, projectRoot };
}

function serverPayload(overrides: Record<string, unknown> = {}) {
	return {
		serverId: "qr-ocr",
		name: "QR OCR",
		enabled: true,
		transport: { type: "stdio", command: "python", args: ["ocr.py"] },
		timeoutMs: 120000,
		...overrides,
	};
}

function httpServerPayload(overrides: Record<string, unknown> = {}) {
	return {
		serverId: "remote-ocr",
		name: "Remote OCR",
		enabled: true,
		transport: {
			type: "http",
			url: "http://example.test/mcp",
			headers: { Authorization: "Bearer super-secret-token-1234567890" },
		},
		timeoutMs: 300000,
		...overrides,
	};
}

test("GET /v1/agents/:agentId/mcp/servers returns an empty scoped MCP catalog", async (t) => {
	const { app } = await createApp();
	t.after(() => {
		void app.close();
	});

	const response = await app.inject({ method: "GET", url: "/v1/agents/search/mcp/servers" });

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), { agentId: "search", servers: [] });
});

test("agent MCP routes reject non-local requests before reading or executing MCP configuration", async (t) => {
	let testCalls = 0;
	const { app } = await createApp({
		clientManager: {
			async testServer() {
				testCalls += 1;
				return { ok: true, serverId: "qr-ocr", tools: [] };
			},
		},
	});
	t.after(() => {
		void app.close();
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/agents/search/mcp/servers",
		remoteAddress: "192.168.1.50",
		payload: serverPayload(),
	});
	const testResponse = await app.inject({
		method: "POST",
		url: "/v1/agents/search/mcp/servers/qr-ocr/test",
		remoteAddress: "192.168.1.50",
	});

	assert.equal(response.statusCode, 403);
	assert.match(response.json().error.message, /local requests only/);
	assert.equal(testResponse.statusCode, 403);
	assert.equal(testCalls, 0);
});

test("agent MCP routes close the client manager when the app closes", async () => {
	let closeCalls = 0;
	const { app } = await createApp({
		clientManager: {
			async close() {
				closeCalls += 1;
			},
		},
	});

	await app.close();

	assert.equal(closeCalls, 1);
});

test("POST PATCH and DELETE manage MCP servers under one agent and invalidate templates", async (t) => {
	const templateInvalidations: string[] = [];
	const { app } = await createApp({ templateInvalidations });
	t.after(() => {
		void app.close();
	});

	const created = await app.inject({
		method: "POST",
		url: "/v1/agents/search/mcp/servers",
		payload: serverPayload(),
	});
	const patched = await app.inject({
		method: "PATCH",
		url: "/v1/agents/search/mcp/servers/qr-ocr",
		payload: { enabled: false },
	});
	const deleted = await app.inject({
		method: "DELETE",
		url: "/v1/agents/search/mcp/servers/qr-ocr",
	});

	assert.equal(created.statusCode, 200);
	assert.equal(created.json().server.serverId, "qr-ocr");
	assert.equal(patched.statusCode, 200);
	assert.equal(patched.json().server.enabled, false);
	assert.equal(deleted.statusCode, 200);
	assert.deepEqual(deleted.json(), { deleted: true, agentId: "search", serverId: "qr-ocr" });
	assert.deepEqual(templateInvalidations, ["search", "search", "search"]);
});

test("POST duplicate MCP server returns conflict", async (t) => {
	const { app } = await createApp();
	t.after(() => {
		void app.close();
	});
	await app.inject({
		method: "POST",
		url: "/v1/agents/search/mcp/servers",
		payload: serverPayload(),
	});

	const duplicate = await app.inject({
		method: "POST",
		url: "/v1/agents/search/mcp/servers",
		payload: serverPayload(),
	});

	assert.equal(duplicate.statusCode, 409);
	assert.match(duplicate.json().error.message, /already exists/);
});

test("agent MCP routes reject unknown agents and locked or running profile writes", async (t) => {
	const { app: unknownApp } = await createApp();
	const { app: lockedApp } = await createApp({ lockedProfileIds: new Set(["search"]) });
	const { app: runningApp } = await createApp({ runningAgents: new Set(["search"]) });
	t.after(() => {
		void unknownApp.close();
		void lockedApp.close();
		void runningApp.close();
	});

	const unknown = await unknownApp.inject({
		method: "GET",
		url: "/v1/agents/missing/mcp/servers",
	});
	const locked = await lockedApp.inject({
		method: "POST",
		url: "/v1/agents/search/mcp/servers",
		payload: serverPayload(),
	});
	const running = await runningApp.inject({
		method: "POST",
		url: "/v1/agents/search/mcp/servers",
		payload: serverPayload(),
	});

	assert.equal(unknown.statusCode, 404);
	assert.match(unknown.json().error.message, /Unknown agentId: missing/);
	assert.equal(locked.statusCode, 409);
	assert.match(locked.json().error.message, /locked by an active Team run/);
	assert.equal(running.statusCode, 409);
	assert.match(running.json().error.message, /running conversation/);
});

test("POST /test uses the injected MCP client manager and caches returned tools", async (t) => {
	const tools = [{ name: "ocr_recognize", description: "OCR" }];
	const seenServerIds: string[] = [];
	const { app } = await createApp({
		clientManager: {
			async testServer(server) {
				seenServerIds.push(server.serverId);
				return { ok: true, serverId: server.serverId, tools };
			},
		},
	});
	t.after(() => {
		void app.close();
	});
	await app.inject({
		method: "POST",
		url: "/v1/agents/search/mcp/servers",
		payload: serverPayload(),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/agents/search/mcp/servers/qr-ocr/test",
	});
	const listed = await app.inject({
		method: "GET",
		url: "/v1/agents/search/mcp/servers/qr-ocr/tools",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(seenServerIds, ["qr-ocr"]);
	assert.equal(response.json().result.ok, true);
	assert.deepEqual(response.json().result.tools, tools);
	assert.equal(listed.statusCode, 200);
	assert.equal(listed.json().source, "cache");
	assert.deepEqual(listed.json().tools, tools);
});

test("POST /test rejects locked or running agents before executing MCP clients", async (t) => {
	let testCalls = 0;
	const { app: lockedApp, projectRoot: lockedProjectRoot } = await createApp({
		lockedProfileIds: new Set(["search"]),
		clientManager: {
			async testServer() {
				testCalls += 1;
				return { ok: true, serverId: "qr-ocr", tools: [] };
			},
		},
	});
	const { app: runningApp, projectRoot: runningProjectRoot } = await createApp({
		runningAgents: new Set(["search"]),
		clientManager: {
			async testServer() {
				testCalls += 1;
				return { ok: true, serverId: "qr-ocr", tools: [] };
			},
		},
	});
	t.after(() => {
		void lockedApp.close();
		void runningApp.close();
	});
	await createAgentMcpServer(lockedProjectRoot, "search", serverPayload());
	await createAgentMcpServer(runningProjectRoot, "search", serverPayload());

	const locked = await lockedApp.inject({
		method: "POST",
		url: "/v1/agents/search/mcp/servers/qr-ocr/test",
	});
	const running = await runningApp.inject({
		method: "POST",
		url: "/v1/agents/search/mcp/servers/qr-ocr/test",
	});

	assert.equal(locked.statusCode, 409);
	assert.match(locked.json().error.message, /locked by an active Team run/);
	assert.equal(running.statusCode, 409);
	assert.match(running.json().error.message, /running conversation/);
	assert.equal(testCalls, 0);
});

test("GET /tools fetches live MCP tools when no cache exists", async (t) => {
	const tools = [{ name: "ocr_recognize", description: "OCR" }];
	let listCalls = 0;
	const { app } = await createApp({
		clientManager: {
			async listTools(server) {
				assert.equal(server.serverId, "qr-ocr");
				listCalls += 1;
				return tools;
			},
		},
	});
	t.after(() => {
		void app.close();
	});
	await app.inject({
		method: "POST",
		url: "/v1/agents/search/mcp/servers",
		payload: serverPayload(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/agents/search/mcp/servers/qr-ocr/tools",
	});

	assert.equal(response.statusCode, 200);
	assert.equal(response.json().source, "live");
	assert.deepEqual(response.json().tools, tools);
	assert.equal(listCalls, 1);
});

test("MCP route internal errors return a generic message without leaking local paths", async (t) => {
	const { app } = await createApp({
		clientManager: {
			async listTools() {
				throw new Error("ENOENT: no such file or directory, open 'E:\\AII\\ugk-claw-core-win\\.data\\agents\\search\\mcp\\servers.json'");
			},
		},
	});
	t.after(() => {
		void app.close();
	});
	await app.inject({
		method: "POST",
		url: "/v1/agents/search/mcp/servers",
		payload: serverPayload(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/agents/search/mcp/servers/qr-ocr/tools",
	});

	assert.equal(response.statusCode, 500);
	assert.equal(response.json().error.message, "Internal server error");
	assert.doesNotMatch(JSON.stringify(response.json()), /ugk-claw-core-win|E:\\\\AII|servers\.json/);
});

test("GET /tools without cache rejects locked agents before executing MCP clients", async (t) => {
	let listCalls = 0;
	const { app, projectRoot } = await createApp({
		lockedProfileIds: new Set(["search"]),
		clientManager: {
			async listTools() {
				listCalls += 1;
				return [{ name: "ocr_recognize", description: "OCR" }];
			},
		},
	});
	t.after(() => {
		void app.close();
	});
	await createAgentMcpServer(projectRoot, "search", serverPayload());

	const response = await app.inject({
		method: "GET",
		url: "/v1/agents/search/mcp/servers/qr-ocr/tools",
	});

	assert.equal(response.statusCode, 409);
	assert.match(response.json().error.message, /locked by an active Team run/);
	assert.equal(listCalls, 0);
});

// ---------------------------------------------------------------------------
// HTTP transport
// ---------------------------------------------------------------------------

test("POST /v1/agents/:agentId/mcp/servers accepts an HTTP transport server and returns its transport fields", async (t) => {
	const { app } = await createApp();
	t.after(() => {
		void app.close();
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/agents/search/mcp/servers",
		payload: httpServerPayload(),
	});

	assert.equal(response.statusCode, 200);
	const server = response.json().server;
	assert.equal(server.transport.type, "http");
	assert.equal(server.transport.url, "http://example.test/mcp");
	assert.deepEqual(server.transport.headers, { Authorization: "Bearer super-secret-token-1234567890" });
});

test("GET /v1/agents/:agentId/mcp/servers lists HTTP transport servers alongside stdio servers", async (t) => {
	const { app } = await createApp();
	t.after(() => {
		void app.close();
	});

	await app.inject({ method: "POST", url: "/v1/agents/search/mcp/servers", payload: serverPayload() });
	await app.inject({ method: "POST", url: "/v1/agents/search/mcp/servers", payload: httpServerPayload() });

	const response = await app.inject({ method: "GET", url: "/v1/agents/search/mcp/servers" });
	assert.equal(response.statusCode, 200);
	const servers = response.json().servers;
	assert.equal(servers.length, 2);
	const http = servers.find((s: { serverId: string }) => s.serverId === "remote-ocr");
	assert.equal(http.transport.type, "http");
	assert.equal(http.transport.url, "http://example.test/mcp");
});

test("PATCH /v1/agents/:agentId/mcp/servers/:serverId updates an HTTP transport URL", async (t) => {
	const { app } = await createApp();
	t.after(() => {
		void app.close();
	});

	await app.inject({ method: "POST", url: "/v1/agents/search/mcp/servers", payload: httpServerPayload() });

	const response = await app.inject({
		method: "PATCH",
		url: "/v1/agents/search/mcp/servers/remote-ocr",
		payload: { transport: { type: "http", url: "http://example.test/v2/mcp" } },
	});

	assert.equal(response.statusCode, 200);
	const server = response.json().server;
	assert.equal(server.transport.type, "http");
	assert.equal(server.transport.url, "http://example.test/v2/mcp");
	// headers preserved (patch omitted them)
	assert.deepEqual(server.transport.headers, { Authorization: "Bearer super-secret-token-1234567890" });
});

test("POST /mcp/servers/:serverId/test error response never leaks the bearer token from headers", async (t) => {
	// Simulate a clientManager failure whose raw message happens to include the
	// bearer token (transport layers sometimes echo request headers). The route
	// must strip it before returning the error to the caller.
	const leakedToken = "super-secret-token-1234567890";
	const { app } = await createApp({
		clientManager: {
			async testServer() {
				return { ok: false, serverId: "remote-ocr", tools: [], error: `Authorization: Bearer ${leakedToken}` };
			},
		},
	});
	t.after(() => {
		void app.close();
	});

	await app.inject({ method: "POST", url: "/v1/agents/search/mcp/servers", payload: httpServerPayload() });
	const response = await app.inject({ method: "POST", url: "/v1/agents/search/mcp/servers/remote-ocr/test" });

	assert.equal(response.statusCode, 200);
	const body = response.json();
	// The test endpoint returns the result object; ensure the token is redacted.
	const bodyText = JSON.stringify(body);
	assert.doesNotMatch(bodyText, new RegExp(leakedToken));
	assert.match(bodyText, /\[redacted\]/);
});

test("POST /v1/agents/:agentId/mcp/servers rejects an invalid HTTP transport URL", async (t) => {
	const { app } = await createApp();
	t.after(() => {
		void app.close();
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/agents/search/mcp/servers",
		payload: httpServerPayload({ transport: { type: "http", url: "not-a-url" } }),
	});

	assert.equal(response.statusCode, 400);
	assert.match(response.json().error.message, /transport.url must be a valid http\(s\) URL/);
});
