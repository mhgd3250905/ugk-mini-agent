import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildServer } from "../src/server.js";
import type { AgentService } from "../src/agent/agent-service.js";
import { RunWorkspace } from "../src/team/run-workspace.js";

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

async function createCompletedRun(app: any) {
	const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
	const unitId = unitRes.json().teamUnitId;
	const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitId) });
	const planId = planRes.json().planId;
	const runRes = await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs` });
	const runId = runRes.json().runId;
	// Force the run to completed state via workspace
	const teamDir = process.env.TEAM_DATA_DIR!;
	const workspace = new RunWorkspace(teamDir);
	const state = (await workspace.getState(runId))!;
	state.status = "completed";
	state.finishedAt = new Date().toISOString();
	state.taskStates.t1.status = "succeeded";
	state.taskStates.t1.progress = { phase: "succeeded", message: "已完成", updatedAt: new Date().toISOString() };
	state.summary.succeededTasks = 1;
	await workspace.saveState(state);
	return { runId, planId, unitId };
}

test("P24: PATCH manual-disposition sets disposition on completed run task", async () => {
	const { app, root } = await buildTestServer();
	try {
		const { runId } = await createCompletedRun(app);
		const res = await app.inject({
			method: "PATCH",
			url: `/v1/team/runs/${runId}/tasks/t1/manual-disposition`,
			payload: { disposition: "skip" },
		});
		assert.equal(res.statusCode, 200);
		assert.equal(res.json().taskStates.t1.manualDisposition, "skip");
		assert.ok(res.json().taskStates.t1.manualDispositionUpdatedAt);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("P24: PATCH manual-disposition rejects invalid disposition", async () => {
	const { app, root } = await buildTestServer();
	try {
		const { runId } = await createCompletedRun(app);
		const res = await app.inject({
			method: "PATCH",
			url: `/v1/team/runs/${runId}/tasks/t1/manual-disposition`,
			payload: { disposition: "bad_value" },
		});
		assert.equal(res.statusCode, 400);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("P24: PATCH manual-disposition rejects active run", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;
		const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitId) });
		const planId = planRes.json().planId;
		const runRes = await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs` });
		const runId = runRes.json().runId;
		// Run is queued (active), should reject
		const res = await app.inject({
			method: "PATCH",
			url: `/v1/team/runs/${runId}/tasks/t1/manual-disposition`,
			payload: { disposition: "skip" },
		});
		assert.equal(res.statusCode, 409);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("P24: PATCH manual-disposition 404 for missing task", async () => {
	const { app, root } = await buildTestServer();
	try {
		const { runId } = await createCompletedRun(app);
		const res = await app.inject({
			method: "PATCH",
			url: `/v1/team/runs/${runId}/tasks/nonexistent/manual-disposition`,
			payload: { disposition: "skip" },
		});
		assert.equal(res.statusCode, 404);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("P24: PATCH manual-dispositions batch update", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;
		// Create plan with 2 tasks
		const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: {
			title: "2-task plan",
			defaultTeamUnitId: unitId,
			goal: { text: "test" },
			tasks: [
				{ id: "t1", title: "task1", input: { text: "do 1" }, acceptance: { rules: ["r1"] } },
				{ id: "t2", title: "task2", input: { text: "do 2" }, acceptance: { rules: ["r2"] } },
			],
			outputContract: { text: "output" },
		}});
		const planId = planRes.json().planId;
		const runRes = await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs` });
		const runId = runRes.json().runId;
		// Force to completed
		const teamDir = process.env.TEAM_DATA_DIR!;
		const workspace = new RunWorkspace(teamDir);
		const state = (await workspace.getState(runId))!;
		state.status = "completed";
		state.finishedAt = new Date().toISOString();
		state.taskStates.t1.status = "succeeded";
		state.taskStates.t2.status = "succeeded";
		state.summary.succeededTasks = 2;
		await workspace.saveState(state);
		const res = await app.inject({
			method: "PATCH",
			url: `/v1/team/runs/${runId}/tasks/manual-dispositions`,
			payload: { updates: [{ taskId: "t1", disposition: "skip" }, { taskId: "t2", disposition: "force_rerun" }] },
		});
		assert.equal(res.statusCode, 200);
		assert.equal(res.json().taskStates.t1.manualDisposition, "skip");
		assert.equal(res.json().taskStates.t2.manualDisposition, "force_rerun");
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("P24: PATCH manual-dispositions rejects invalid batch", async () => {
	const { app, root } = await buildTestServer();
	try {
		const { runId } = await createCompletedRun(app);
		const res = await app.inject({
			method: "PATCH",
			url: `/v1/team/runs/${runId}/tasks/manual-dispositions`,
			payload: { updates: [{ taskId: "t1", disposition: "invalid" }] },
		});
		assert.equal(res.statusCode, 400);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("P24: PATCH manual-dispositions rejects non-existent task in batch", async () => {
	const { app, root } = await buildTestServer();
	try {
		const { runId } = await createCompletedRun(app);
		const res = await app.inject({
			method: "PATCH",
			url: `/v1/team/runs/${runId}/tasks/manual-dispositions`,
			payload: { updates: [{ taskId: "nonexistent", disposition: "skip" }] },
		});
		assert.equal(res.statusCode, 404);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("P24: POST rerun reopens completed run", async () => {
	const { app, root } = await buildTestServer();
	try {
		const { runId } = await createCompletedRun(app);
		// Set one task to skip before rerun
		await app.inject({
			method: "PATCH",
			url: `/v1/team/runs/${runId}/tasks/t1/manual-disposition`,
			payload: { disposition: "skip" },
		});
		const res = await app.inject({ method: "POST", url: `/v1/team/runs/${runId}/rerun` });
		assert.equal(res.statusCode, 200);
		assert.equal(res.json().status, "queued");
		assert.equal(res.json().taskStates.t1.status, "skipped");
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("P24: POST rerun rejects active run", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;
		const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitId) });
		const planId = planRes.json().planId;
		const runRes = await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs` });
		const runId = runRes.json().runId;
		// Run is queued (active), should reject rerun
		const res = await app.inject({ method: "POST", url: `/v1/team/runs/${runId}/rerun` });
		assert.equal(res.statusCode, 409);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});
