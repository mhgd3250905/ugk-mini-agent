import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildServer } from "../src/server.js";
import type { AgentService } from "../src/agent/agent-service.js";
import { buildRunDetailResponse } from "../src/team/run-presenter.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import type { TeamTask } from "../src/team/types.js";

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

test("run presenter preserves run detail response shape with generated task definitions", async () => {
	const runState = {
		runId: "run_presenter_1",
		planId: "plan_presenter_1",
		teamUnitId: "team_presenter_1",
		status: "completed",
		taskStates: {
			discover: { status: "succeeded", attemptCount: 1 },
			process_each: { status: "succeeded", attemptCount: 0 },
			process_each__a: { status: "succeeded", attemptCount: 1 },
			decompose_me: { status: "succeeded", attemptCount: 0 },
			decompose_child: { status: "succeeded", attemptCount: 1 },
		},
		summary: { totalTasks: 5, succeededTasks: 5, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
		createdAt: "2026-05-21T00:00:00.000Z",
		updatedAt: "2026-05-21T00:00:00.000Z",
	} as any;
	const processChild: TeamTask = {
		id: "process_each__a",
		title: "Process A",
		input: { text: "process a" },
		acceptance: { rules: ["ok"] },
		parentTaskId: "process_each",
		sourceItemId: "a",
		generated: true,
	};
	const decomposedChild: TeamTask = {
		id: "decompose_child",
		title: "Decomposed child",
		input: { text: "child" },
		acceptance: { rules: ["ok"] },
		parentTaskId: "decompose_me",
		generated: true,
	};
	const plan = {
		planId: "plan_presenter_1",
		title: "Presenter plan",
		defaultTeamUnitId: "team_presenter_1",
		goal: { text: "goal" },
		tasks: [
			{ id: "discover", type: "discovery", title: "Discover", input: { text: "discover" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "items" } },
			{ id: "process_each", type: "for_each", title: "Process each", input: { text: "placeholder" }, acceptance: { rules: ["ok"] }, forEach: { itemsFrom: "discover.items", mode: "sequential", taskTemplate: { title: "Process {{item.id}}", input: { text: "process" }, acceptance: { rules: ["ok"] } } } },
			{ id: "decompose_me", title: "Decompose me", input: { text: "split" }, acceptance: { rules: ["ok"] }, decomposer: { mode: "leaf" } },
		],
		outputContract: { text: "output" },
	} as any;
	const workspace = {
		readExpansion: async (_runId: string, taskId: string) => taskId === "process_each"
			? {
				schemaVersion: "team/task-expansion-1",
				parentTaskId: "process_each",
				itemsFrom: "discover.items",
				expandedAt: "2026-05-21T00:00:00.000Z",
				children: [{ taskId: processChild.id, sourceItemId: "a", title: processChild.title, task: processChild }],
			}
			: null,
		readDecomposition: async (_runId: string, taskId: string) => taskId === "decompose_me"
			? {
				schemaVersion: "team/task-decomposition-1",
				parentTaskId: "decompose_me",
				mode: "leaf",
				decision: "split",
				reason: "split",
				decomposedAt: "2026-05-21T00:00:00.000Z",
				children: [{ taskId: decomposedChild.id, title: decomposedChild.title, task: decomposedChild }],
			}
			: null,
	} as any;

	const body = await buildRunDetailResponse(runState, plan, workspace);

	assert.equal(body.runId, runState.runId);
	assert.equal(body.status, "completed");
	assert.equal(body.taskStates, runState.taskStates);
	assert.deepEqual(body.taskDefinitions?.map((task: any) => ({ id: task.id, parentTaskId: task.parentTaskId, generatedSource: task.generatedSource })), [
		{ id: "process_each__a", parentTaskId: "process_each", generatedSource: "for_each" },
		{ id: "decompose_child", parentTaskId: "decompose_me", generatedSource: "decomposition" },
	]);
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

test("GET /v1/team/plan-templates returns supported and planned templates", async () => {
	const { app, root } = await buildTestServer();
	try {
		const res = await app.inject({ method: "GET", url: "/v1/team/plan-templates" });

		assert.equal(res.statusCode, 200);
		const templates = res.json();
		const byId = new Map<string, any>(templates.map((template: any) => [template.templateId, template] as [string, any]));
		assert.equal(byId.get("single_agent")?.status, "supported");
		assert.equal(byId.get("parallel_research")?.status, "supported");
		assert.equal(byId.get("coding_fix")?.status, "planned");
		assert.equal(byId.get("deep_research_with_review")?.status, "planned");

		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("POST /v1/team/plan-drafts returns a non-persisted parallel_research plan create payload", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;
		const beforeList = await app.inject({ method: "GET", url: "/v1/team/plans" });
		assert.equal(beforeList.json().length, 0);

		const draftRes = await app.inject({
			method: "POST",
			url: "/v1/team/plan-drafts",
			payload: {
				prompt: "调研 AI 编程 Agent 竞品并分别对比每个产品",
				defaultTeamUnitId: unitId,
			},
		});

		assert.equal(draftRes.statusCode, 200);
		const draft = draftRes.json();
		assert.equal(draft.templateId, "parallel_research");
		assert.equal(draft.plan.defaultTeamUnitId, unitId);
		assert.equal(draft.plan.tasks[0].id, "discover_items");
		assert.equal(draft.plan.tasks[1].forEach.mode, "parallel");

		const afterDraftList = await app.inject({ method: "GET", url: "/v1/team/plans" });
		assert.equal(afterDraftList.json().length, 0, "draft endpoint must not persist a plan");

		const createRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: draft.plan });
		assert.equal(createRes.statusCode, 201);
		assert.equal(createRes.json().runCount, 0);

		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("POST /v1/team/plan-drafts routes multi-object research wording to parallel_research", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;

		const draftRes = await app.inject({
			method: "POST",
			url: "/v1/team/plan-drafts",
			payload: {
				prompt: "整理 AI 搜索工具的供应商、产品、pricing 和 alternatives，做 market map",
				defaultTeamUnitId: unitId,
			},
		});

		assert.equal(draftRes.statusCode, 200);
		const draft = draftRes.json();
		assert.equal(draft.templateId, "parallel_research");
		assert.equal(draft.plan.tasks[1].forEach.mode, "parallel");

		const afterDraftList = await app.inject({ method: "GET", url: "/v1/team/plans" });
		assert.equal(afterDraftList.json().length, 0, "draft endpoint must not persist a plan");

		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("POST /v1/team/plan-drafts applies preferred supported template through the route", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;

		const draftRes = await app.inject({
			method: "POST",
			url: "/v1/team/plan-drafts",
			payload: {
				prompt: "调研多个 AI Agent 竞品并分别对比",
				defaultTeamUnitId: unitId,
				preferredTemplateId: "single_agent",
			},
		});

		assert.equal(draftRes.statusCode, 200);
		const draft = draftRes.json();
		assert.equal(draft.templateId, "single_agent");
		assert.equal(draft.plan.tasks.length, 1);

		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("POST /v1/team/plan-drafts rejects invalid prompt, team unit, and unsupported template", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;

		const missingPrompt = await app.inject({
			method: "POST",
			url: "/v1/team/plan-drafts",
			payload: { defaultTeamUnitId: unitId },
		});
		assert.equal(missingPrompt.statusCode, 400);
		assert.match(missingPrompt.json().error, /prompt is required/i);

		const missingTeam = await app.inject({
			method: "POST",
			url: "/v1/team/plan-drafts",
			payload: { prompt: "调研竞品" },
		});
		assert.equal(missingTeam.statusCode, 400);
		assert.match(missingTeam.json().error, /defaultTeamUnitId is required/i);

		const unknownTeam = await app.inject({
			method: "POST",
			url: "/v1/team/plan-drafts",
			payload: { prompt: "调研竞品", defaultTeamUnitId: "team_missing" },
		});
		assert.equal(unknownTeam.statusCode, 400);
		assert.match(unknownTeam.json().error, /team unit not found/i);

		const unsupported = await app.inject({
			method: "POST",
			url: "/v1/team/plan-drafts",
			payload: { prompt: "修复 bug", defaultTeamUnitId: unitId, preferredTemplateId: "coding_fix" },
		});
		assert.equal(unsupported.statusCode, 400);
		assert.match(unsupported.json().error, /template is not supported: coding_fix/);

		const unknownTemplate = await app.inject({
			method: "POST",
			url: "/v1/team/plan-drafts",
			payload: { prompt: "调研竞品", defaultTeamUnitId: unitId, preferredTemplateId: "unknown_template" },
		});
		assert.equal(unknownTemplate.statusCode, 400);
		assert.match(unknownTemplate.json().error, /unknown template: unknown_template/);

		await app.inject({ method: "POST", url: `/v1/team/team-units/${unitId}/archive` });
		const archivedTeam = await app.inject({
			method: "POST",
			url: "/v1/team/plan-drafts",
			payload: { prompt: "调研竞品", defaultTeamUnitId: unitId },
		});
		assert.equal(archivedTeam.statusCode, 400);
		assert.match(archivedTeam.json().error, /archived team unit/i);

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

test("Plan delete with existing runs succeeds (cee24fe)", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitRes.json().teamUnitId) });
		const planId = planRes.json().planId;

		const runRes = await app.inject({ method: "POST", url: `/v1/team/plans/${planId}/runs` });
		const runId = runRes.json().runId;

		const delRes = await app.inject({ method: "DELETE", url: `/v1/team/plans/${planId}` });
		assert.equal(delRes.statusCode, 204);

		const runDetailRes = await app.inject({ method: "GET", url: `/v1/team/runs/${runId}` });
		assert.equal(runDetailRes.statusCode, 200);
		assert.equal(runDetailRes.json().runId, runId);

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

test("GET /v1/team/runs/:runId returns decomposition task definitions for run detail", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const planRes = await app.inject({
			method: "POST",
			url: "/v1/team/plans",
			payload: {
				title: "decomposition detail",
				defaultTeamUnitId: unitRes.json().teamUnitId,
				goal: { text: "test" },
				tasks: [{
					id: "reverse_dns",
					title: "Reverse DNS",
					input: { text: "Investigate reverse DNS" },
					acceptance: { rules: ["ok"] },
					decomposer: { mode: "leaf" },
				}],
				outputContract: { text: "output" },
			},
		});
		const runRes = await app.inject({ method: "POST", url: `/v1/team/plans/${planRes.json().planId}/runs` });
		const runId = runRes.json().runId;
		const workspace = new RunWorkspace(teamDir);
		const children: TeamTask[] = [
			{ id: "collect_ips", title: "Collect known IPs", input: { text: "collect" }, acceptance: { rules: ["ok"] }, parentTaskId: "reverse_dns", generated: true, decomposer: { mode: "none" } },
			{ id: "ptr_lookup", title: "PTR lookup", input: { text: "ptr" }, acceptance: { rules: ["ok"] }, parentTaskId: "reverse_dns", generated: true, decomposer: { mode: "none" } },
		];
		await workspace.writeDecomposition(runId, {
			schemaVersion: "team/task-decomposition-1",
			parentTaskId: "reverse_dns",
			mode: "leaf",
			decision: "split",
			reason: "split",
			decomposedAt: new Date().toISOString(),
			children: children.map(task => ({ taskId: task.id, title: task.title, task })),
		});
		await workspace.appendChildTaskStates(runId, children);

		const stateRes = await app.inject({ method: "GET", url: `/v1/team/runs/${runId}` });

		assert.equal(stateRes.statusCode, 200);
		const body = stateRes.json();
		assert.equal(body.runId, runId);
		assert.ok(body.taskStates.reverse_dns);
		assert.equal(body.taskDefinitions.length, 2);
		assert.deepEqual(body.taskDefinitions.map((task: any) => task.id), ["collect_ips", "ptr_lookup"]);
		assert.equal(body.taskDefinitions[0].parentTaskId, "reverse_dns");
		assert.equal(body.taskDefinitions[0].generatedSource, "decomposition");
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("GET /v1/team/runs/:runId returns for_each task definitions for run detail", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const planRes = await app.inject({
			method: "POST",
			url: "/v1/team/plans",
			payload: {
				title: "for each detail",
				defaultTeamUnitId: unitRes.json().teamUnitId,
				goal: { text: "test" },
				tasks: [{
					id: "process_each",
					type: "for_each",
					title: "Process each",
					input: { text: "placeholder" },
					acceptance: { rules: ["ok"] },
					forEach: {
						itemsFrom: "discover.items",
						mode: "sequential",
						taskTemplate: { title: "Process {{item.id}}", input: { text: "process" }, acceptance: { rules: ["ok"] } },
					},
				}],
				outputContract: { text: "output" },
			},
		});
		const runRes = await app.inject({ method: "POST", url: `/v1/team/plans/${planRes.json().planId}/runs` });
		const runId = runRes.json().runId;
		const workspace = new RunWorkspace(teamDir);
		const child: TeamTask = { id: "process_each__a", title: "Process A", input: { text: "process a" }, acceptance: { rules: ["ok"] }, parentTaskId: "process_each", sourceItemId: "a", generated: true };
		await workspace.writeExpansion(runId, {
			schemaVersion: "team/task-expansion-1",
			parentTaskId: "process_each",
			itemsFrom: "discover.items",
			expandedAt: new Date().toISOString(),
			children: [{ taskId: child.id, sourceItemId: "a", title: child.title, task: child }],
		});
		await workspace.appendChildTaskStates(runId, [child]);

		const stateRes = await app.inject({ method: "GET", url: `/v1/team/runs/${runId}` });

		assert.equal(stateRes.statusCode, 200);
		const body = stateRes.json();
		assert.equal(body.taskDefinitions.length, 1);
		assert.equal(body.taskDefinitions[0].id, "process_each__a");
		assert.equal(body.taskDefinitions[0].parentTaskId, "process_each");
		assert.equal(body.taskDefinitions[0].generatedSource, "for_each");
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("GET /v1/team/runs/:runId preserves old run shape when no generated definitions exist", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitRes.json().teamUnitId) });
		const runRes = await app.inject({ method: "POST", url: `/v1/team/plans/${planRes.json().planId}/runs` });

		const stateRes = await app.inject({ method: "GET", url: `/v1/team/runs/${runRes.json().runId}` });

		assert.equal(stateRes.statusCode, 200);
		const body = stateRes.json();
		assert.equal(body.runId, runRes.json().runId);
		assert.ok(body.taskStates.t1);
		assert.deepEqual(body.taskDefinitions, []);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch { /* concurrent write */ }
	}
});

test("GET /v1/team/runs/:runId tolerates legacy plans without tasks array", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const planRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitRes.json().teamUnitId) });
		const plan = planRes.json();
		const runRes = await app.inject({ method: "POST", url: `/v1/team/plans/${plan.planId}/runs` });
		const legacyPlan = { ...plan };
		delete legacyPlan.tasks;
		await writeFile(join(teamDir, "plans", plan.planId, "plan.json"), JSON.stringify(legacyPlan, null, 2), "utf8");

		const stateRes = await app.inject({ method: "GET", url: `/v1/team/runs/${runRes.json().runId}` });

		assert.equal(stateRes.statusCode, 200);
		const body = stateRes.json();
		assert.equal(body.runId, runRes.json().runId);
		assert.deepEqual(body.taskDefinitions, []);
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

test("POST plan rejects for_each with unknown mode", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;
		const res = await app.inject({ method: "POST", url: "/v1/team/plans", payload: {
			title: "Bad mode",
			defaultTeamUnitId: unitId,
			goal: { text: "test" },
			tasks: [
				{ id: "fe", type: "for_each", title: "FE", input: { text: "p" }, acceptance: { rules: ["ok"] }, forEach: { itemsFrom: "d.items", mode: "unknown", taskTemplate: { title: "T", input: { text: "p" }, acceptance: { rules: ["ok"] } } } },
			],
			outputContract: { text: "out" },
		}});
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /sequential.*parallel/);
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

// ── for_each.parallel schema validation ──

test("POST plan accepts parallel for_each dynamic plan", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;
		const res = await app.inject({ method: "POST", url: "/v1/team/plans", payload: {
			title: "Parallel plan",
			defaultTeamUnitId: unitId,
			goal: { text: "process in parallel" },
			tasks: [
				{ id: "discover", type: "discovery", title: "Discover items", input: { text: "Find items" }, acceptance: { rules: ["output has JSON"] }, discovery: { outputKey: "items" } },
				{ id: "process", type: "for_each", title: "Process each", input: { text: "p" }, acceptance: { rules: ["ok"] }, forEach: { itemsFrom: "discover.items", mode: "parallel", taskTemplate: { title: "Process {{item.title}}", input: { text: "p" }, acceptance: { rules: ["ok"] } } } },
			],
			outputContract: { text: "summary" },
		}});
		assert.equal(res.statusCode, 201);
		assert.equal(res.json().tasks[1].forEach.mode, "parallel");
		await app.close();
	} finally {
		try { await rm(root, { recursive: true, force: true }); } catch {}
	}
});

test("PATCH plan rejects parallel for_each with template decomposer when runCount=0", async () => {
	const { app, root } = await buildTestServer();
	try {
		const unitRes = await app.inject({ method: "POST", url: "/v1/team/team-units", payload: unitBody });
		const unitId = unitRes.json().teamUnitId;
		const createRes = await app.inject({ method: "POST", url: "/v1/team/plans", payload: planBody(unitId) });
		const planId = createRes.json().planId;
		const res = await app.inject({ method: "PATCH", url: `/v1/team/plans/${planId}`, payload: {
			tasks: [{
				id: "process_each", type: "for_each", title: "Process each",
				input: { text: "placeholder" },
				acceptance: { rules: ["ok"] },
				forEach: {
					itemsFrom: "discover.items",
					mode: "parallel",
					taskTemplate: {
						title: "Process {{item.title}}",
						input: { text: "Process" },
						acceptance: { rules: ["ok"] },
						decomposer: { mode: "leaf" },
					},
				},
			}],
		}});
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /parallel.*decomposer|decomposer.*parallel/);
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
