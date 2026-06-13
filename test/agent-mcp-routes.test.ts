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
import type { AgentMcpServerConfig, AgentMcpToolSummary } from "../src/agent/mcp-server-catalog.js";
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

test("GET /v1/agents/:agentId/mcp/servers returns an empty scoped MCP catalog", async (t) => {
	const { app } = await createApp();
	t.after(() => {
		void app.close();
	});

	const response = await app.inject({ method: "GET", url: "/v1/agents/search/mcp/servers" });

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), { agentId: "search", servers: [] });
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
