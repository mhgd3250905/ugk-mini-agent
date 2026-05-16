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

const missingProfileUnitBody = {
	title: "坏团队",
	description: "测试用",
	watcherProfileId: "missing-watcher",
	workerProfileId: "missing-worker",
	checkerProfileId: "missing-checker",
	finalizerProfileId: "missing-finalizer",
};

const planBody = (teamUnitId: string) => ({
	title: "测试计划",
	defaultTeamUnitId: teamUnitId,
	goal: { text: "测试目标" },
	tasks: [{ id: "t1", title: "任务1", input: { text: "做任务1" }, acceptance: { rules: ["规则1"] } }],
	outputContract: { text: "输出" },
});

test("GET /v1/team/healthz returns v2", async () => {
	const { app, root } = await buildTestServer();
	try {
		const res = await app.inject({ method: "GET", url: "/v1/team/healthz" });
		assert.equal(res.statusCode, 200);
		assert.equal(res.json().version, "v2");
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("TeamUnit CRUD via API", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		assert.equal(createRes.statusCode, 201);
		const unit = createRes.json();
		assert.ok(unit.teamUnitId.startsWith("team_"));

		const getRes = await app.inject({ method: "GET", url: `/v1/team/team-units/${unit.teamUnitId}` });
		assert.equal(getRes.statusCode, 200);
		assert.equal(getRes.json().title, "调研团队");

		const listRes = await app.inject({ method: "GET", url: "/v1/team/team-units" });
		assert.equal(listRes.statusCode, 200);
		assert.equal(listRes.json().length, 1);

		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("TeamUnit create rejects unknown AgentProfile ids", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: missingProfileUnitBody });
		assert.equal(createRes.statusCode, 400);
		assert.match(createRes.json().error, /agent profile not found/i);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("Plan CRUD via API", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;

		const createRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitId) });
		assert.equal(createRes.statusCode, 201);
		const plan = createRes.json();
		assert.ok(plan.planId.startsWith("plan_"));
		assert.equal(plan.runCount, 0);

		const patchRes = await app.inject({ method: "PATCH", url: `/v1/team/plans/${plan.planId}`, payload: { title: "新标题" } });
		assert.equal(patchRes.statusCode, 200);
		assert.equal(patchRes.json().title, "新标题");

		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("Plan delete unused succeeds", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitRes.json().teamUnitId) });
		const planId = planRes.json().planId;

		const delRes = await app.inject({ method: "DELETE", url: `/v1/team/plans/${planId}` });
		assert.equal(delRes.statusCode, 204);

		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("POST /v1/team/plans/:planId/runs creates run", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitRes.json().teamUnitId) });
		const planId = planRes.json().planId;

		const runRes = await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs` });
		assert.equal(runRes.statusCode, 201);
		const run = runRes.json();
		assert.ok(run.runId.startsWith("run_"));
		const stateRes = await app.inject({ method: "GET", url: `/v1/team/runs/${run.runId}` });
		assert.equal(stateRes.statusCode, 200);
		assert.equal(stateRes.json().status, "queued");

		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("GET /v1/team/runs/:runId returns finalizer runtime context", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitRes.json().teamUnitId) });
		const runRes = await app.inject({ method: "POST", url: `/v1/team/plans/${planRes.json().planId}/runs` });
		const runId = runRes.json().runId;
		const workspace = new RunWorkspace(teamDir);
		const state = await workspace.getState(runId);
		assert.ok(state, "created run state should exist");
		state.finalizerRuntimeContext = {
			requestedProfileId: "finalizer-profile",
			resolvedProfileId: "main",
			browserId: "browser-a",
			browserScope: "team:run:finalizer",
			fallbackUsed: true,
			fallbackReason: "profile_not_found",
		};
		await workspace.saveState(state);

		const stateRes = await app.inject({ method: "GET", url: `/v1/team/runs/${runId}` });

		assert.equal(stateRes.statusCode, 200);
		assert.deepEqual(stateRes.json().finalizerRuntimeContext, state.finalizerRuntimeContext);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("POST /v1/team/plans/:planId/runs only enqueues and does not execute inline", async () => {
	const { app, root } = await buildTestServer();
	try {
		process.env.TEAM_USE_MOCK_RUNNER = "true";
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitRes.json().teamUnitId) });

		const runRes = await app.inject({ method: "POST", url: `/v1/team/plans/${planRes.json().planId}/runs` });
		assert.equal(runRes.statusCode, 201);
		await new Promise((resolve) => setTimeout(resolve, 30));

		const stateRes = await app.inject({ method: "GET", url: `/v1/team/runs/${runRes.json().runId}` });
		assert.equal(stateRes.statusCode, 200);
		assert.equal(stateRes.json().status, "queued");

		await app.close();
	} finally {
		delete process.env.TEAM_USE_MOCK_RUNNER;
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("Second run returns 409 while first is active", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitRes.json().teamUnitId) });
		const planId = planRes.json().planId;

		await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs` });
		const second = await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs` });
		assert.equal(second.statusCode, 409);
		assert.match(second.json().error, /active run limit reached/);

		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("maxConcurrentRuns=2 allows two active runs, third returns 409", async () => {
	const prevValue = process.env.TEAM_MAX_CONCURRENT_RUNS;
	process.env.TEAM_MAX_CONCURRENT_RUNS = "2";
	const root = await mkdtemp(join(tmpdir(), "team-api-"));
	const teamDir = join(root, "team");
	process.env.TEAM_RUNTIME_ENABLED = "true";
	process.env.TEAM_DATA_DIR = teamDir;
	const app = await buildServer({ agentService: createAgentServiceStub() });
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitRes.json().teamUnitId) });
		const planId = planRes.json().planId;

		const first = await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs` });
		assert.equal(first.statusCode, 201);

		const second = await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs` });
		assert.equal(second.statusCode, 201);
		assert.notEqual(second.json().runId, first.json().runId);

		const third = await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs` });
		assert.equal(third.statusCode, 409);
		assert.match(third.json().error, /active run limit reached/);

		await app.close();
	} finally {
		if (prevValue === undefined) delete process.env.TEAM_MAX_CONCURRENT_RUNS;
		else process.env.TEAM_MAX_CONCURRENT_RUNS = prevValue;
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("GET /v1/team/runs lists runs", async () => {
	const { app, root } = await buildTestServer();
	try {
		const listRes = await app.inject({ method: "GET", url: "/v1/team/runs" });
		assert.equal(listRes.statusCode, 200);
		assert.ok(Array.isArray(listRes.json()));
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("GET /v1/team/plans/missing returns 404", async () => {
	const { app, root } = await buildTestServer();
	try {
		const res = await app.inject({ method: "GET", url: "/v1/team/plans/nonexistent" });
		assert.equal(res.statusCode, 404);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("POST plan with missing fields returns 400", async () => {
	const { app, root } = await buildTestServer();
	try {
		const res = await app.inject({ method: "POST", url: "/v1/team/plans", payload: { title: "" } });
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /required/);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("POST plan rejects missing default TeamUnit", async () => {
	const { app, root } = await buildTestServer();
	try {
		const res = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody("team_missing") });
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /team unit not found/i);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("TeamUnit archive then edit fails", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = createRes.json().teamUnitId;

		await app.inject({ method: "POST", url: `/v1/team/team-units/${unitId}/archive` });
		const patchRes = await app.inject({ method: "PATCH", url: `/v1/team/team-units/${unitId}`, payload: { title: "new" } });
		assert.equal(patchRes.statusCode, 400);
		assert.match(patchRes.json().error, /archived/);

		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

// ── P15: Dynamic plan API tests ──

test("POST plan accepts valid dynamic plan with discovery + for_each", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;
		const res = await app.inject({ method: "POST", url: "/v1/team/plans", payload: {
			title: "Dynamic plan",
			defaultTeamUnitId: unitId,
			goal: { text: "discover and process" },
			tasks: [
				{ id: "discover", type: "discovery", title: "Discover items", input: { text: "Find items" }, acceptance: { rules: ["output has JSON"] }, discovery: { outputKey: "items" } },
				{ id: "process", type: "for_each", title: "Process each", input: { text: "p" }, acceptance: { rules: ["ok"] }, forEach: { itemsFrom: "discover.items", mode: "sequential", taskTemplate: { title: "Process {{item.title}}", input: { text: "p" }, acceptance: { rules: ["ok"] } } } },
			],
			outputContract: { text: "summary" },
		}});
		assert.equal(res.statusCode, 201);
		assert.equal(res.json().tasks[0].type, "discovery");
		assert.equal(res.json().tasks[1].type, "for_each");
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("POST plan rejects for_each without mode sequential", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;
		const res = await app.inject({ method: "POST", url: "/v1/team/plans", payload: {
			title: "Bad mode",
			defaultTeamUnitId: unitId,
			goal: { text: "test" },
			tasks: [
				{ id: "fe", type: "for_each", title: "FE", input: { text: "p" }, acceptance: { rules: ["ok"] }, forEach: { itemsFrom: "d.items", mode: "parallel", taskTemplate: { title: "T", input: { text: "p" }, acceptance: { rules: ["ok"] } } } },
			],
			outputContract: { text: "out" },
		}});
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /sequential/);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

// ── P15 Review Fix: unknown task type validation ──

test("POST plan rejects unknown task.type", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;
		const res = await app.inject({ method: "POST", url: "/v1/team/plans", payload: {
			title: "Bad type",
			defaultTeamUnitId: unitId,
			goal: { text: "test" },
			tasks: [
				{ id: "t1", type: "custom" as any, title: "Custom", input: { text: "x" }, acceptance: { rules: ["ok"] } },
			],
			outputContract: { text: "out" },
		}});
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /unknown task type/);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("PATCH plan rejects unknown task.type when runCount=0", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;
		const createRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: {
			title: "Valid",
			defaultTeamUnitId: unitId,
			goal: { text: "test" },
			tasks: [{ id: "t1", title: "T", input: { text: "x" }, acceptance: { rules: ["ok"] } }],
			outputContract: { text: "out" },
		}});
		const planId = createRes.json().planId;
		const res = await app.inject({ method: "PATCH", url: `/v1/team/plans/${planId}`, payload: {
			tasks: [{ id: "t1", type: "bogus" as any, title: "Bogus", input: { text: "x" }, acceptance: { rules: ["ok"] } }],
		}});
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /unknown task type/);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

// ── P16 Task 2: Dynamic plan API acceptance ──

const dynamicPlanBody = (teamUnitId: string) => ({
	title: "Dynamic discovery plan",
	defaultTeamUnitId: teamUnitId,
	goal: { text: "Discover and process items" },
	tasks: [
		{ id: "discover", type: "discovery", title: "Discover items", input: { text: "Search for items related to X" }, acceptance: { rules: ["output is valid JSON with 'items' array"] }, discovery: { outputKey: "items" } },
		{ id: "process_each", type: "for_each", title: "Process each", input: { text: "Placeholder" }, acceptance: { rules: ["output valid for {{item.id}}"] }, forEach: { itemsFrom: "discover.items", mode: "sequential", taskTemplate: { title: "Process {{item.title}}", input: { text: "Analyze item {{item.id}}" }, acceptance: { rules: ["output contains analysis for {{item.id}}"] } } } },
	],
	outputContract: { text: "Summary report" },
});

test("P16-T2: API accepts dynamic plan generated by UI builder", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;
		const res = await app.inject({ method: "POST", url: "/v1/team/plans", payload: dynamicPlanBody(unitId) });
		assert.equal(res.statusCode, 201);
		const plan = res.json();
		assert.equal(plan.tasks.length, 2);
		assert.equal(plan.tasks[0].type, "discovery");
		assert.equal(plan.tasks[0].discovery.outputKey, "items");
		assert.equal(plan.tasks[1].type, "for_each");
		assert.equal(plan.tasks[1].forEach.itemsFrom, "discover.items");
		assert.equal(plan.tasks[1].forEach.taskTemplate.title, "Process {{item.title}}");
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("P16-T2: API rejects dynamic plan with empty child template acceptance rules", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;
		const body = dynamicPlanBody(unitId);
		body.tasks[1].forEach.taskTemplate.acceptance = { rules: [] };
		const res = await app.inject({ method: "POST", url: "/v1/team/plans", payload: body });
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /acceptance/i);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("P16-T2: normal one-task plan still works via API", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitRes.json().teamUnitId) });
		assert.equal(planRes.statusCode, 201);
		assert.equal(planRes.json().tasks.length, 1);
		assert.equal(planRes.json().tasks[0].type, undefined);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});
