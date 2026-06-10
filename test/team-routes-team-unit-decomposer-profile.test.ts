import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildServer } from "../src/server.js";
import type { AgentService } from "../src/agent/agent-service.js";

function createAgentServiceStub() {
	return {
		chat: async () => ({ reply: "ok", conversationId: "c1", runId: "r1" }),
		streamChat: async () => {},
		queueMessage: async () => ({ reply: "ok", conversationId: "c1", runId: "r1" }),
		interruptChat: async () => {},
		resetConversation: async () => {},
		getAgentRunStatus: async () => ({ conversationId: "c1", running: false }),
		getRunStatus: async () => ({ conversationId: "c1", running: false, contextUsage: { provider: "p", model: "m", currentTokens: 0, contextWindow: 128000, reserveTokens: 16000, maxResponseTokens: 8000, availableTokens: 112000, percent: 0, status: "safe" as const, mode: "usage" as const } }),
		subscribeRunEvents: () => ({ conversationId: "c1", running: false, unsubscribe: () => {} }),
		getRunEvents: async () => [],
		getConversations: async () => [],
		getConversation: async () => null,
		createConversation: async () => ({ id: "c1", title: "t", createdAt: "", updatedAt: "" }),
		switchConversation: async () => {},
		deleteConversation: async () => {},
	} as unknown as AgentService;
}

async function buildTestServer() {
	const root = await mkdtemp(join(tmpdir(), "team-api-"));
	const teamDir = join(root, "team");
	process.env.TEAM_RUNTIME_ENABLED = "true";
	process.env.TEAM_DATA_DIR = teamDir;
	const app = await buildServer({ agentService: createAgentServiceStub() });
	return { app, root, teamDir };
}

const unitBody = {
	title: "调研团队",
	description: "测试用",
	watcherProfileId: "main",
	workerProfileId: "main",
	checkerProfileId: "main",
	finalizerProfileId: "main",
};

// ── P21-A: decomposer profile API tests ──

test("POST /v1/team/team-units with decomposerProfileId succeeds", async () => {
	const { app, root } = await buildTestServer();
	try {
		const res = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: {
			...unitBody,
			decomposerProfileId: "main",
		}});
		assert.equal(res.statusCode, 201);
		assert.equal(res.json().decomposerProfileId, "main");
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("POST /v1/team/team-units without decomposerProfileId defaults to workerProfileId", async () => {
	const { app, root } = await buildTestServer();
	try {
		const res = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		assert.equal(res.statusCode, 201);
		assert.equal(res.json().decomposerProfileId, "main", "should default to workerProfileId (main)");
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("POST /v1/team/team-units rejects unknown decomposerProfileId", async () => {
	const { app, root } = await buildTestServer();
	try {
		const res = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: {
			...unitBody,
			decomposerProfileId: "nonexistent_decomposer",
		}});
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /agent profile not found/);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("PATCH /v1/team/team-units/:id can change decomposerProfileId", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = createRes.json().teamUnitId;
		const patchRes = await app.inject({ method: "PATCH", url: `/v1/team/team-units/${unitId}`, payload: {
			decomposerProfileId: "main",
		}});
		assert.equal(patchRes.statusCode, 200);
		assert.equal(patchRes.json().decomposerProfileId, "main");
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("PATCH /v1/team/team-units/:id keeps old decomposer when omitted", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: {
			...unitBody,
			decomposerProfileId: "main",
		}});
		const unitId = createRes.json().teamUnitId;
		const patchRes = await app.inject({ method: "PATCH", url: `/v1/team/team-units/${unitId}`, payload: {
			title: "new title",
		}});
		assert.equal(patchRes.statusCode, 200);
		assert.equal(patchRes.json().decomposerProfileId, "main", "keeps existing decomposer");
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});
