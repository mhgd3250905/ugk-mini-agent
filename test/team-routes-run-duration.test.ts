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

const planBody = (teamUnitId: string) => ({
	title: "测试计划",
	defaultTeamUnitId: teamUnitId,
	goal: { text: "测试目标" },
	tasks: [{ id: "t1", title: "任务1", input: { text: "做任务1" }, acceptance: { rules: ["规则1"] } }],
	outputContract: { text: "输出" },
});

// ── P20 Task 3: per-run timeout override ──

test("POST /v1/team/plans/:planId/runs with no body persists maxRunDurationMinutes default", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitRes.json().teamUnitId) });
		const planId = planRes.json().planId;

		const runRes = await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs` });
		assert.equal(runRes.statusCode, 201);
		const state = runRes.json();
		assert.equal(state.maxRunDurationMinutes, 100, "default should be 100");

		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("POST /v1/team/plans/:planId/runs with maxRunDurationMinutes override persists value", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitRes.json().teamUnitId) });
		const planId = planRes.json().planId;

		const runRes = await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs`, payload: { maxRunDurationMinutes: 120 } });
		assert.equal(runRes.statusCode, 201);
		const state = runRes.json();
		assert.equal(state.maxRunDurationMinutes, 120);

		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("POST /v1/team/plans/:planId/runs rejects invalid maxRunDurationMinutes", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitRes.json().teamUnitId) });
		const planId = planRes.json().planId;

		// negative
		const neg = await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs`, payload: { maxRunDurationMinutes: -1 } });
		assert.equal(neg.statusCode, 400);
		assert.match(neg.json().error, /maxRunDurationMinutes/i);

		// zero
		const zero = await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs`, payload: { maxRunDurationMinutes: 0 } });
		assert.equal(zero.statusCode, 400);

		// string junk
		const junk = await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs`, payload: { maxRunDurationMinutes: "abc" } });
		assert.equal(junk.statusCode, 400);

		// absurdly large
		const big = await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs`, payload: { maxRunDurationMinutes: 99999 } });
		assert.equal(big.statusCode, 400);

		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});
