import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import type { AgentService } from "../src/agent/agent-service.js";

function createAgentServiceStub(): AgentService {
	return {
		getAgentRunStatus: () => ({ agentId: "main", status: "idle" }),
		getConversationCatalog: async () => ({
			currentConversationId: "manual:main",
			conversations: [],
		}),
	} as unknown as AgentService;
}

test("GET /playground/model-sources renders the API source management page", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/model-sources",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] as string, /text\/html/);
	assert.match(response.body, /API 源管理/);
	assert.match(response.body, /id="provider-list"/);
	assert.match(response.body, /id="usage-body"/);
	assert.match(response.body, /\/v1\/model-sources/);
	assert.match(response.body, /apiKeyEnvVar/);
	await app.close();
});
