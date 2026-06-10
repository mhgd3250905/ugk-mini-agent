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

	// ── Route error mapping tests (Step 06) ──

	test("GET /v1/team/team-units/nonexistent returns 404", async () => {
		const { app, root } = await buildTestServer();
		try {
			const res = await app.inject({ method: "GET", url: "/v1/team/team-units/team_nonexistent" });
			assert.equal(res.statusCode, 404);
			assert.match(res.json().error, /team unit not found/);
			await app.close();
		} finally {
			try { await rm(root, { recursive: true, force: true }); } catch {}
		}
	});

	test("GET /v1/team/runs/nonexistent returns 404", async () => {
		const { app, root } = await buildTestServer();
		try {
			const res = await app.inject({ method: "GET", url: "/v1/team/runs/run_nonexistent" });
			assert.equal(res.statusCode, 404);
			assert.match(res.json().error, /run not found/);
			await app.close();
		} finally {
			try { await rm(root, { recursive: true, force: true }); } catch {}
		}
	});

	test("GET /v1/team/runs/:runId/final-report returns 404 for missing run", async () => {
		const { app, root } = await buildTestServer();
		try {
			const res = await app.inject({ method: "GET", url: "/v1/team/runs/run_nonexistent/final-report" });
			assert.equal(res.statusCode, 404);
			await app.close();
		} finally {
			try { await rm(root, { recursive: true, force: true }); } catch {}
		}
	});

	test("POST /v1/team/runs/:runId/cancel returns 400 for missing run", async () => {
		const { app, root } = await buildTestServer();
		try {
			const res = await app.inject({ method: "POST", url: "/v1/team/runs/run_nonexistent/cancel" });
			assert.equal(res.statusCode, 400);
			await app.close();
		} finally {
			try { await rm(root, { recursive: true, force: true }); } catch {}
		}
	});

	test("DELETE /v1/team/runs/:runId returns 409 for queued (non-terminal) run", async () => {
		const { app, root } = await buildTestServer();
		try {
			const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
			const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitRes.json().teamUnitId) });
			const runRes = await app.inject({ method: "POST", url: "/v1/team/plans/" + planRes.json().planId + "/runs" });
			const runId = runRes.json().runId;

			const delRes = await app.inject({ method: "DELETE", url: "/v1/team/runs/" + runId });
			assert.equal(delRes.statusCode, 409);
			assert.match(delRes.json().error, /non-terminal/);

			await app.close();
		} finally {
			try { await rm(root, { recursive: true, force: true }); } catch {}
		}
	});

	test("POST /v1/team/tasks with missing title returns 400", async () => {
		const { app, root } = await buildTestServer();
		try {
			const res = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: {} });
			assert.equal(res.statusCode, 400);
			await app.close();
		} finally {
			try { await rm(root, { recursive: true, force: true }); } catch {}
		}
	});

	test("GET /v1/team/tasks/:taskId response includes task and warnings", async () => {
		const { app, root } = await buildTestServer();
		try {
			const createRes = await app.inject({
				method: "POST",
				url: "/v1/team/tasks",
				payload: { title: "稳定性任务", leaderAgentId: "main", status: "ready", workUnit: { title: "工作", input: { text: "测试输入" }, outputContract: { text: "输出" }, acceptance: { rules: ["完成"] }, workerAgentId: "main", checkerAgentId: "main" } },
			});
			assert.equal(createRes.statusCode, 201);
			const taskId = createRes.json().task.taskId;

			const res = await app.inject({ method: "GET", url: "/v1/team/tasks/" + taskId });
			assert.equal(res.statusCode, 200);
			const body = res.json();
			assert.ok(body.task, "response has task field");
			assert.ok(Array.isArray(body.warnings), "response has warnings array");
			assert.equal(body.task.taskId, taskId);

			await app.close();
		} finally {
			try { await rm(root, { recursive: true, force: true }); } catch {}
		}
	});

	test("GET /v1/team/plans/:planId returns unwrapped plan", async () => {
		const { app, root } = await buildTestServer();
		try {
			const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
			const createRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitRes.json().teamUnitId) });
			const planId = createRes.json().planId;

			const res = await app.inject({ method: "GET", url: "/v1/team/plans/" + planId });
			assert.equal(res.statusCode, 200);
			const body = res.json();
			assert.equal(body.planId, planId);
			assert.ok(body.title);
			assert.ok(!body.plan, "plan is not double-wrapped");

			await app.close();
		} finally {
			try { await rm(root, { recursive: true, force: true }); } catch {}
		}
	});

	test("GET /v1/team/team-units/:teamUnitId returns unwrapped unit", async () => {
		const { app, root } = await buildTestServer();
		try {
			const createRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
			const unitId = createRes.json().teamUnitId;

			const res = await app.inject({ method: "GET", url: "/v1/team/team-units/" + unitId });
			assert.equal(res.statusCode, 200);
			const body = res.json();
			assert.equal(body.teamUnitId, unitId);
			assert.ok(body.title);
			assert.ok(!body.unit, "unit is not double-wrapped");

			await app.close();
		} finally {
			try { await rm(root, { recursive: true, force: true }); } catch {}
		}
	});

	test("sendNotFound produces consistent error shape", async () => {
		const { app, root } = await buildTestServer();
		try {
			const res = await app.inject({ method: "GET", url: "/v1/team/tasks/nonexistent" });
			assert.equal(res.statusCode, 404);
			assert.deepEqual(res.json(), { error: "task not found" });

			const planRes = await app.inject({ method: "GET", url: "/v1/team/plans/nonexistent" });
			assert.equal(planRes.statusCode, 404);
			assert.deepEqual(planRes.json(), { error: "plan not found" });

			const unitRes = await app.inject({ method: "GET", url: "/v1/team/team-units/nonexistent" });
			assert.equal(unitRes.statusCode, 404);
			assert.deepEqual(unitRes.json(), { error: "team unit not found" });

			await app.close();
		} finally {
			try { await rm(root, { recursive: true, force: true }); } catch {}
		}
	});
