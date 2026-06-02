import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildServer } from "../src/server.js";
import type { AgentService } from "../src/agent/agent-service.js";
import { TaskStore } from "../src/team/task-store.js";

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
	const root = await mkdtemp(join(tmpdir(), "team-task-api-"));
	const teamDir = join(root, "team");
	process.env.TEAM_RUNTIME_ENABLED = "true";
	process.env.TEAM_DATA_DIR = teamDir;
	process.env.UGK_AGENT_DATA_DIR = join(root, "agent");
	process.env.CONN_DATABASE_PATH = join(root, "conn", "conn.sqlite");
	const app = await buildServer({ agentService: createAgentServiceStub() });
	return { app, root, teamDir };
}

const taskPayload = {
	title: "调查 Medtrum 相关云服务器资产",
	leaderAgentId: "main",
	status: "ready" as const,
	workUnit: {
		title: "调查 Medtrum 相关云服务器资产",
		input: { text: "围绕 Medtrum 相关公开云服务器资产进行搜索和证据整理。" },
		outputContract: { text: "输出中文 Markdown 报告，包含发现列表、证据来源和风险说明。" },
		acceptance: { rules: ["每条发现必须包含来源", "不确定项不能编造成结论"] },
		workerAgentId: "search",
		checkerAgentId: "main",
	},
};

const discoverySpec = {
	schemaVersion: "team/discovery-spec-1" as const,
	discoveryGoal: "发现 Medtrum 相关公开域名资产。",
	outputKey: "items",
	itemIdField: "id" as const,
	requiredItemFields: ["id"],
	recommendedItemFields: ["title", "type"],
	dispatchGoal: "逐项核查每个域名的归属、证据和风险。",
	dispatcherAgentId: "main",
	generatedWorkerAgentId: "search",
	generatedCheckerAgentId: "main",
	autoRun: { enabled: true as const, concurrency: 3 as const },
};

const templateConfig = {
	schemaVersion: "team/task-template-1" as const,
	parameters: [
		{ id: "keyword", label: "关键词", required: true as const },
	],
};

function discoveryTaskPayload(overrides: Record<string, unknown> = {}) {
	return {
		...taskPayload,
		canvasKind: "discovery",
		discoverySpec,
		...overrides,
	};
}

function generatedSource(
	sourceDiscoveryTaskId: string,
	sourceItemId: string,
	itemStatus: "active" | "stale" = "active",
	options: { latestManagedWorkUnit?: typeof taskPayload.workUnit; workUnitMode?: "managed" | "customized" } = {},
) {
	return {
		schemaVersion: "team/generated-task-source-1" as const,
		sourceDiscoveryTaskId,
		sourceItemId,
		itemStatus,
		itemPayload: { id: sourceItemId, title: `Item ${sourceItemId}`, type: "domain" },
		latestDiscoveryRunId: `run_${sourceItemId}`,
		latestDiscoveryAttemptId: `attempt_${sourceItemId}`,
		latestDiscoveredAt: "2026-05-30T00:00:00.000Z",
		workUnitMode: options.workUnitMode ?? "managed" as const,
		...(options.latestManagedWorkUnit ? { latestManagedWorkUnit: options.latestManagedWorkUnit } : {}),
	};
}

async function seedGeneratedTask(
	teamDir: string,
	sourceDiscoveryTaskId: string,
	sourceItemId: string,
	itemStatus: "active" | "stale" = "active",
	options: { latestManagedWorkUnit?: typeof taskPayload.workUnit; workUnitMode?: "managed" | "customized" } = {},
) {
	const store = new TaskStore(teamDir, { getAgentIds: () => ["main", "search"] });
	return store.create({
		...taskPayload,
		title: `Generated ${sourceItemId}`,
		workUnit: { ...taskPayload.workUnit, title: `Generated ${sourceItemId}` },
		generatedSource: generatedSource(sourceDiscoveryTaskId, sourceItemId, itemStatus, options),
	});
}

function withPorts(
	payload: typeof taskPayload,
	ports: {
		inputPorts?: Array<{ id: string; label: string; type: string }>;
		outputPorts?: Array<{ id: string; label: string; type: string }>;
	},
) {
	return {
		...payload,
		workUnit: {
			...payload.workUnit,
			...ports,
		},
	};
}

test("POST /v1/team/tasks creates an independent Task resource", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		assert.equal(createRes.statusCode, 201);
		const body = createRes.json();
		assert.ok(body.task.taskId.startsWith("task_"));
		assert.equal(body.task.leaderAgentId, "main");
		assert.equal(body.task.workUnit.workerAgentId, "search");
		assert.equal(body.task.status, "ready");
		assert.equal(body.task.archived, false);
		assert.equal(body.task.planId, undefined, "Task must not be represented as a single-task Plan");

		const plansRes = await app.inject({ method: "GET", url: "/v1/team/plans" });
		assert.equal(plansRes.statusCode, 200);
		assert.equal(plansRes.json().length, 0, "creating a Task must not create a Plan");

		await app.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/tasks creates a template Task resource", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: {
				...taskPayload,
				title: "全网查询 {{keyword}}",
				workUnit: {
					...taskPayload.workUnit,
					title: "全网查询 {{keyword}}",
					input: { text: "围绕 {{keyword}} 进行公开来源检索。" },
				},
				templateConfig,
			},
		});
		assert.equal(createRes.statusCode, 201);
		const body = createRes.json();
		assert.deepEqual(body.task.templateConfig, templateConfig);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/tasks/:taskId/clone instantiates template bindings", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: {
				...taskPayload,
				title: "全网查询 {{keyword}}",
				workUnit: {
					...taskPayload.workUnit,
					title: "全网查询 {{keyword}}",
					input: { text: "围绕 {{keyword}} 进行公开来源检索。" },
				},
				templateConfig,
			},
		});
		const template = createRes.json().task;

		const cloneRes = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${template.taskId}/clone`,
			payload: { templateBindings: { keyword: "MiniMax M3" } },
		});
		assert.equal(cloneRes.statusCode, 201);
		const cloned = cloneRes.json().task;
		assert.notEqual(cloned.taskId, template.taskId);
		assert.equal(cloned.title, "全网查询 MiniMax M3");
		assert.equal(cloned.workUnit.input.text, "围绕 MiniMax M3 进行公开来源检索。");
		assert.equal(cloned.templateConfig, undefined);
		assert.deepEqual(cloned.templateInstance, {
			schemaVersion: "team/task-template-instance-1",
			sourceTaskId: template.taskId,
			bindings: { keyword: "MiniMax M3" },
		});

		const missingBinding = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${template.taskId}/clone`,
			payload: { templateBindings: {} },
		});
		assert.equal(missingBinding.statusCode, 400);
		assert.match(missingBinding.json().error, /template binding is required: keyword/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/tasks creates a Discovery root Task resource", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: discoveryTaskPayload() });
		assert.equal(createRes.statusCode, 201);
		const body = createRes.json();
		assert.ok(body.task.taskId.startsWith("task_"));
		assert.equal(body.task.canvasKind, "discovery");
		assert.deepEqual(body.task.discoverySpec, discoverySpec);
		assert.equal(body.task.generatedSource, undefined);
		assert.equal(body.task.planId, undefined, "Discovery Task creation must not create a single-task Plan");

		const plansRes = await app.inject({ method: "GET", url: "/v1/team/plans" });
		assert.equal(plansRes.statusCode, 200);
		assert.equal(plansRes.json().length, 0);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/tasks rejects invalid Discovery payloads", async () => {
	const { app, root } = await buildTestServer();
	try {
		const missingSpec = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: discoveryTaskPayload({ discoverySpec: undefined }),
		});
		assert.equal(missingSpec.statusCode, 400);
		assert.match(missingSpec.json().error, /discoverySpec is required for discovery tasks/);

		const missingIdField = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: discoveryTaskPayload({
				discoverySpec: { ...discoverySpec, requiredItemFields: ["title"] },
			}),
		});
		assert.equal(missingIdField.statusCode, 400);
		assert.match(missingIdField.json().error, /discoverySpec.requiredItemFields must include id/);

		const unknownGeneratedWorker = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: discoveryTaskPayload({
				discoverySpec: { ...discoverySpec, generatedWorkerAgentId: "missing-worker" },
			}),
		});
		assert.equal(unknownGeneratedWorker.statusCode, 400);
		assert.match(unknownGeneratedWorker.json().error, /agent profile not found: missing-worker/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/tasks rejects public generatedSource creation", async () => {
	const { app, root } = await buildTestServer();
	try {
		const res = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: {
				...taskPayload,
				generatedSource: generatedSource("task_discovery", "item_public"),
			},
		});
		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /generated Task source identity cannot be created through this route/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/tasks hides generated Tasks by default and includes them explicitly", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const normal = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload })).json().task;
		const discovery = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: discoveryTaskPayload() })).json().task;
		const generated = await seedGeneratedTask(teamDir, discovery.taskId, "item_active");

		const defaultList = await app.inject({ method: "GET", url: "/v1/team/tasks" });
		assert.equal(defaultList.statusCode, 200);
		assert.deepEqual(
			new Set(defaultList.json().tasks.map((task: any) => task.taskId)),
			new Set([normal.taskId, discovery.taskId]),
		);
		assert.ok(defaultList.json().tasks.every((task: any) => task.generatedSource === undefined));

		const includeGenerated = await app.inject({ method: "GET", url: "/v1/team/tasks?includeGenerated=1" });
		assert.equal(includeGenerated.statusCode, 200);
		assert.ok(includeGenerated.json().tasks.some((task: any) => task.taskId === generated.taskId));
		assert.ok(includeGenerated.json().tasks.some((task: any) => task.taskId === normal.taskId));
		assert.ok(includeGenerated.json().tasks.some((task: any) => task.taskId === discovery.taskId));
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/tasks/:taskId/generated-tasks returns one Discovery root child catalog", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const discovery = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: discoveryTaskPayload() })).json().task;
		const otherDiscovery = (await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: discoveryTaskPayload({ title: "Other discovery" }),
		})).json().task;
		const active = await seedGeneratedTask(teamDir, discovery.taskId, "active_item");
		const stale = await seedGeneratedTask(teamDir, discovery.taskId, "stale_item", "stale");
		const archived = await seedGeneratedTask(teamDir, discovery.taskId, "archived_item");
		await seedGeneratedTask(teamDir, otherDiscovery.taskId, "other_item");
		await new TaskStore(teamDir, { getAgentIds: () => ["main", "search"] }).archive(archived.taskId);

		const defaultList = await app.inject({ method: "GET", url: `/v1/team/tasks/${discovery.taskId}/generated-tasks` });
		assert.equal(defaultList.statusCode, 200);
		assert.deepEqual(
			new Set(defaultList.json().tasks.map((task: any) => task.taskId)),
			new Set([active.taskId, stale.taskId]),
		);
		assert.deepEqual(
			new Set(defaultList.json().tasks.map((task: any) => task.generatedSource.itemStatus)),
			new Set(["active", "stale"]),
		);

		const includeArchived = await app.inject({
			method: "GET",
			url: `/v1/team/tasks/${discovery.taskId}/generated-tasks?includeArchived=true`,
		});
		assert.equal(includeArchived.statusCode, 200);
		assert.ok(includeArchived.json().tasks.some((task: any) => task.taskId === archived.taskId));
		assert.ok(includeArchived.json().tasks.every((task: any) => task.generatedSource.sourceDiscoveryTaskId === discovery.taskId));
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/tasks/:taskId/generated-tasks rejects missing or non-Discovery parents", async () => {
	const { app, root } = await buildTestServer();
	try {
		const missing = await app.inject({ method: "GET", url: "/v1/team/tasks/task_missing/generated-tasks" });
		assert.equal(missing.statusCode, 404);

		const normal = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload })).json().task;
		const normalParent = await app.inject({ method: "GET", url: `/v1/team/tasks/${normal.taskId}/generated-tasks` });
		assert.equal(normalParent.statusCode, 400);
		assert.match(normalParent.json().error, /generated tasks can only be listed for Discovery root tasks/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});


test("GET /v1/team/tasks/:taskId/generated-tasks view=summary returns light summary without heavy fields", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const discovery = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: discoveryTaskPayload() })).json().task;
		const active = await seedGeneratedTask(teamDir, discovery.taskId, "active_item");
		const stale = await seedGeneratedTask(teamDir, discovery.taskId, "stale_item", "stale");
		const customized = await seedGeneratedTask(teamDir, discovery.taskId, "customized_item", "active", {
			latestManagedWorkUnit: taskPayload.workUnit,
			workUnitMode: "customized",
		});

		const summaryRes = await app.inject({ method: "GET", url: `/v1/team/tasks/${discovery.taskId}/generated-tasks?view=summary` });
		assert.equal(summaryRes.statusCode, 200);
		const summaries = summaryRes.json().tasks;
		assert.equal(summaries.length, 3);
		const summaryTaskIds = new Set(summaries.map((t: any) => t.taskId));
		assert.ok(summaryTaskIds.has(active.taskId));
		assert.ok(summaryTaskIds.has(stale.taskId));
		assert.ok(summaryTaskIds.has(customized.taskId));

		for (const s of summaries) {
			assert.equal(typeof s.taskId, "string");
			assert.equal(typeof s.title, "string");
			assert.equal(typeof s.status, "string");
			assert.equal(typeof s.updatedAt, "string");
			assert.equal(typeof s.archived, "boolean");
			assert.ok(s.generatedSource);
			assert.equal(s.generatedSource.schemaVersion, "team/generated-task-source-1");
			assert.equal(typeof s.generatedSource.sourceDiscoveryTaskId, "string");
			assert.equal(typeof s.generatedSource.sourceItemId, "string");
			assert.ok(["active", "stale"].includes(s.generatedSource.itemStatus));
			assert.equal(typeof s.generatedSource.workUnitMode, "string");
			assert.equal(s.workUnit, undefined, "summary must not include workUnit");
			assert.equal(s.discoverySpec, undefined, "summary must not include discoverySpec");
			assert.equal(s.generatedSource.itemPayload, undefined, "summary must not include itemPayload");
			assert.equal(s.generatedSource.latestManagedWorkUnit, undefined, "summary must not include latestManagedWorkUnit");
		}
		const customizedSummary = summaries.find((s: any) => s.taskId === customized.taskId);
		assert.equal(customizedSummary.generatedSource.workUnitMode, "customized");
		assert.equal(customizedSummary.generatedSource.canResetToManaged, true);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/tasks/:taskId/generated-tasks default view still returns full generated tasks with workUnit", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const discovery = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: discoveryTaskPayload() })).json().task;
		await seedGeneratedTask(teamDir, discovery.taskId, "full_item");

		const fullRes = await app.inject({ method: "GET", url: `/v1/team/tasks/${discovery.taskId}/generated-tasks` });
		assert.equal(fullRes.statusCode, 200);
		const tasks = fullRes.json().tasks;
		assert.equal(tasks.length, 1);
		assert.ok(tasks[0].workUnit, "default view must include workUnit");
		assert.equal(tasks[0].workUnit.workerAgentId, "search");
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/tasks/:taskId/generated-tasks rejects unknown view parameter", async () => {
	const { app, root } = await buildTestServer();
	try {
		const discovery = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: discoveryTaskPayload() })).json().task;
		const badView = await app.inject({ method: "GET", url: `/v1/team/tasks/${discovery.taskId}/generated-tasks?view=compact` });
		assert.equal(badView.statusCode, 400);
		assert.match(badView.json().error, /unknown view parameter/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/tasks/:taskId/generated-tasks view=summary supports includeArchived", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const discovery = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: discoveryTaskPayload() })).json().task;
		await seedGeneratedTask(teamDir, discovery.taskId, "summary_active");
		const archived = await seedGeneratedTask(teamDir, discovery.taskId, "summary_archived");
		await new TaskStore(teamDir, { getAgentIds: () => ["main", "search"] }).archive(archived.taskId);

		const withoutArchived = await app.inject({ method: "GET", url: `/v1/team/tasks/${discovery.taskId}/generated-tasks?view=summary` });
		assert.equal(withoutArchived.json().tasks.length, 1);

		const withArchived = await app.inject({ method: "GET", url: `/v1/team/tasks/${discovery.taskId}/generated-tasks?view=summary&includeArchived=true` });
		assert.equal(withArchived.json().tasks.length, 2);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("PATCH /v1/team/tasks/:taskId forwards discoverySpec only for Discovery roots", async () => {
	const { app, root } = await buildTestServer();
	try {
		const discovery = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: discoveryTaskPayload() })).json().task;
		const normal = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload })).json().task;
		const nextSpec = { ...discoverySpec, dispatchGoal: "改为逐项核查备案、证据和风险。" };

		const updateDiscovery = await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${discovery.taskId}`,
			payload: { discoverySpec: nextSpec },
		});
		assert.equal(updateDiscovery.statusCode, 200);
		assert.deepEqual(updateDiscovery.json().task.discoverySpec, nextSpec);

		const updateNormal = await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${normal.taskId}`,
			payload: { discoverySpec: nextSpec },
		});
		assert.equal(updateNormal.statusCode, 400);
		assert.match(updateNormal.json().error, /normal root task cannot carry discoverySpec/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("PATCH /v1/team/tasks/:taskId rejects public identity updates", async () => {
	const { app, root } = await buildTestServer();
	try {
		const normal = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload })).json().task;

		const canvasKind = await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${normal.taskId}`,
			payload: { canvasKind: "discovery" },
		});
		assert.equal(canvasKind.statusCode, 400);
		assert.match(canvasKind.json().error, /canvasKind cannot be updated through this route/);

		const source = await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${normal.taskId}`,
			payload: { generatedSource: generatedSource("task_discovery", "item_public") },
		});
		assert.equal(source.statusCode, 400);
		assert.match(source.json().error, /generated Task source identity cannot be updated through this route/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("PATCH /v1/team/tasks/:taskId marks generated Task WorkUnit edits as customized", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const generated = await seedGeneratedTask(teamDir, "task_discovery", "item_customized", "active", {
			latestManagedWorkUnit: taskPayload.workUnit,
		});
		const res = await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${generated.taskId}`,
			payload: {
				workUnit: { ...generated.workUnit, input: { text: "用户改写后的输入" } },
			},
		});
		assert.equal(res.statusCode, 200);
		assert.equal(res.json().task.workUnit.input.text, "用户改写后的输入");
		assert.equal(res.json().task.generatedSource.workUnitMode, "customized");
		assert.deepEqual(res.json().task.generatedSource.latestManagedWorkUnit, taskPayload.workUnit);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/tasks/:taskId/generated-workunit/reset restores generated Task managed snapshot", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const latestManagedWorkUnit = {
			...taskPayload.workUnit,
			title: "Managed generated WorkUnit",
			input: { text: "派发器最新输入" },
			outputContract: { text: "派发器最新输出" },
			acceptance: { rules: ["派发器最新规则"] },
		};
		const generated = await seedGeneratedTask(teamDir, "task_discovery", "item_reset", "active", {
			latestManagedWorkUnit,
		});
		const customized = await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${generated.taskId}`,
			payload: {
				title: "用户改名 generated",
				workUnit: {
					...generated.workUnit,
					title: "用户改写 WorkUnit",
					input: { text: "用户输入" },
				},
			},
		});
		assert.equal(customized.statusCode, 200);
		assert.equal(customized.json().task.generatedSource.workUnitMode, "customized");

		const reset = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${generated.taskId}/generated-workunit/reset`,
		});

		assert.equal(reset.statusCode, 200);
		assert.equal(reset.json().task.title, latestManagedWorkUnit.title);
		assert.deepEqual(reset.json().task.workUnit, latestManagedWorkUnit);
		assert.equal(reset.json().task.generatedSource.workUnitMode, "managed");
		assert.equal(reset.json().task.generatedSource.sourceDiscoveryTaskId, "task_discovery");
		assert.equal(reset.json().task.generatedSource.sourceItemId, "item_reset");
		assert.deepEqual(reset.json().task.generatedSource.latestManagedWorkUnit, latestManagedWorkUnit);
		assert.ok(Array.isArray(reset.json().warnings));
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/tasks/:taskId/generated-workunit/reset rejects invalid reset targets", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const normal = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload })).json().task;
		const discovery = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: discoveryTaskPayload() })).json().task;
		const oldGenerated = await seedGeneratedTask(teamDir, discovery.taskId, "old_item");
		const archived = await seedGeneratedTask(teamDir, discovery.taskId, "archived_item", "active", {
			latestManagedWorkUnit: taskPayload.workUnit,
		});
		await new TaskStore(teamDir, { getAgentIds: () => ["main", "search"] }).archive(archived.taskId);

		const missing = await app.inject({ method: "POST", url: "/v1/team/tasks/task_missing/generated-workunit/reset" });
		assert.equal(missing.statusCode, 404);

		const normalReset = await app.inject({ method: "POST", url: `/v1/team/tasks/${normal.taskId}/generated-workunit/reset` });
		assert.equal(normalReset.statusCode, 400);
		assert.match(normalReset.json().error, /generated WorkUnit reset requires a generated task/);

		const discoveryReset = await app.inject({ method: "POST", url: `/v1/team/tasks/${discovery.taskId}/generated-workunit/reset` });
		assert.equal(discoveryReset.statusCode, 400);
		assert.match(discoveryReset.json().error, /generated WorkUnit reset requires a generated task/);

		const archivedReset = await app.inject({ method: "POST", url: `/v1/team/tasks/${archived.taskId}/generated-workunit/reset` });
		assert.equal(archivedReset.statusCode, 409);
		assert.match(archivedReset.json().error, /archived generated task cannot reset WorkUnit/);

		const oldGeneratedReset = await app.inject({ method: "POST", url: `/v1/team/tasks/${oldGenerated.taskId}/generated-workunit/reset` });
		assert.equal(oldGeneratedReset.statusCode, 409);
		assert.match(oldGeneratedReset.json().error, /latest managed WorkUnit snapshot is missing/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("Task connection API only accepts matching typed ports", async () => {
	const { app, root } = await buildTestServer();
	try {
		const collectRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown 文稿", type: "md" }],
			}),
		});
		const htmlRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "HTML 制作 Task" }, {
				inputPorts: [{ id: "source_md", label: "Markdown 文稿", type: "md" }],
				outputPorts: [{ id: "page_html", label: "HTML 页面", type: "html" }],
			}),
		});
		const audioRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "TTS Task" }, {
				inputPorts: [{ id: "script_html", label: "HTML 输入", type: "html" }],
				outputPorts: [{ id: "voice_audio", label: "音频", type: "audio" }],
			}),
		});
		assert.equal(collectRes.statusCode, 201);
		assert.equal(htmlRes.statusCode, 201);
		assert.equal(audioRes.statusCode, 201);
		const collect = collectRes.json().task;
		const html = htmlRes.json().task;
		const audio = audioRes.json().task;

		const emptyList = await app.inject({ method: "GET", url: "/v1/team/task-connections" });
		assert.equal(emptyList.statusCode, 200);
		assert.deepEqual(emptyList.json().connections, []);

		const ok = await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: collect.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: html.taskId,
				toInputPortId: "source_md",
			},
		});
		assert.equal(ok.statusCode, 201);
		assert.equal(ok.json().connection.type, "md");
		assert.equal(ok.json().connection.fromTaskId, collect.taskId);
		assert.equal(ok.json().connection.toTaskId, html.taskId);

		const mismatch = await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: collect.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: audio.taskId,
				toInputPortId: "script_html",
			},
		});
		assert.equal(mismatch.statusCode, 400);
		assert.match(mismatch.json().error, /port type mismatch: md -> html/);

		const list = await app.inject({ method: "GET", url: "/v1/team/task-connections" });
		assert.equal(list.statusCode, 200);
		assert.deepEqual(list.json().connections.map((connection: any) => connection.connectionId), [ok.json().connection.connectionId]);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("Task connection API rejects duplicate edges and cycles", async () => {
	const { app, root } = await buildTestServer();
	try {
		const firstRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				inputPorts: [{ id: "source_md", label: "Markdown 输入", type: "md" }],
				outputPorts: [{ id: "draft_md", label: "Markdown 输出", type: "md" }],
			}),
		});
		const secondRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "第二个 Task" }, {
				inputPorts: [{ id: "source_md", label: "Markdown 输入", type: "md" }],
				outputPorts: [{ id: "draft_md", label: "Markdown 输出", type: "md" }],
			}),
		});
		const first = firstRes.json().task;
		const second = secondRes.json().task;

		const createEdge = await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: first.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: second.taskId,
				toInputPortId: "source_md",
			},
		});
		assert.equal(createEdge.statusCode, 201);

		const duplicate = await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: first.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: second.taskId,
				toInputPortId: "source_md",
			},
		});
		assert.equal(duplicate.statusCode, 409);
		assert.match(duplicate.json().error, /task connection already exists/);

		const cycle = await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: second.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: first.taskId,
				toInputPortId: "source_md",
			},
		});
		assert.equal(cycle.statusCode, 409);
		assert.match(cycle.json().error, /task connection would create a cycle/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/tasks lists non-archived tasks and GET by id returns one task", async () => {
	const { app, root } = await buildTestServer();
	try {
		const firstRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		const secondRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: { ...taskPayload, title: "第二个 Task" } });
		const first = firstRes.json().task;
		const second = secondRes.json().task;
		await app.inject({ method: "POST", url: `/v1/team/tasks/${first.taskId}/archive` });

		const listRes = await app.inject({ method: "GET", url: "/v1/team/tasks" });
		assert.equal(listRes.statusCode, 200);
		assert.deepEqual(listRes.json().tasks.map((task: any) => task.taskId), [second.taskId]);

		const includeArchivedRes = await app.inject({ method: "GET", url: "/v1/team/tasks?includeArchived=1" });
		assert.equal(includeArchivedRes.statusCode, 200);
		assert.equal(includeArchivedRes.json().tasks.length, 2);

		const getRes = await app.inject({ method: "GET", url: `/v1/team/tasks/${second.taskId}` });
		assert.equal(getRes.statusCode, 200);
		assert.equal(getRes.json().task.taskId, second.taskId);
		await app.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("PATCH /v1/team/tasks/:taskId updates draft fields", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: { ...taskPayload, status: "drafting" } });
		const task = createRes.json().task;
		const patchRes = await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${task.taskId}`,
			payload: {
				title: "更新后的 Task",
				workUnit: { ...taskPayload.workUnit, input: { text: "更新输入" } },
				status: "ready",
			},
		});

		assert.equal(patchRes.statusCode, 200);
		assert.equal(patchRes.json().task.title, "更新后的 Task");
		assert.equal(patchRes.json().task.workUnit.input.text, "更新输入");
		assert.equal(patchRes.json().task.status, "ready");
		await app.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/tasks/:taskId/archive soft archives a task", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload });
		const task = createRes.json().task;
		const archiveRes = await app.inject({ method: "POST", url: `/v1/team/tasks/${task.taskId}/archive` });

		assert.equal(archiveRes.statusCode, 200);
		assert.equal(archiveRes.json().task.archived, true);
		assert.equal(archiveRes.json().task.status, "archived");

		const listRes = await app.inject({ method: "GET", url: "/v1/team/tasks" });
		assert.equal(listRes.json().tasks.length, 0);
		await app.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Task routes return 400 for invalid payload or Agent profile and 404 for missing task", async () => {
	const { app, root } = await buildTestServer();
	try {
		const invalidPayload = await app.inject({ method: "POST", url: "/v1/team/tasks", payload: { ...taskPayload, title: "" } });
		assert.equal(invalidPayload.statusCode, 400);
		assert.match(invalidPayload.json().error, /task title is required/);

		const invalidAgent = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: { ...taskPayload, workUnit: { ...taskPayload.workUnit, workerAgentId: "missing-worker" } },
		});
		assert.equal(invalidAgent.statusCode, 400);
		assert.match(invalidAgent.json().error, /agent profile not found: missing-worker/);

		const missingGet = await app.inject({ method: "GET", url: "/v1/team/tasks/task_missing" });
		assert.equal(missingGet.statusCode, 404);

		const missingPatch = await app.inject({ method: "PATCH", url: "/v1/team/tasks/task_missing", payload: { title: "x" } });
		assert.equal(missingPatch.statusCode, 404);
		await app.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Task API warns when worker and checker are the same Agent", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: {
				...taskPayload,
				workUnit: { ...taskPayload.workUnit, workerAgentId: "search", checkerAgentId: "search" },
			},
		});
		assert.equal(createRes.statusCode, 201);
		assert.match(createRes.json().warnings[0], /self-checking weakens independent acceptance/);
		await app.close();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

// ── Stale connection lifecycle ──

test("GET /v1/team/task-connections returns status active for valid md -> md connection", async () => {
	const { app, root } = await buildTestServer();
	try {
		const collectRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			}),
		});
		const htmlRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "HTML Task" }, {
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			}),
		});
		assert.equal(collectRes.statusCode, 201);
		assert.equal(htmlRes.statusCode, 201);
		const collect = collectRes.json().task;
		const html = htmlRes.json().task;

		await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: collect.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: html.taskId,
				toInputPortId: "source_md",
			},
		});

		const listRes = await app.inject({ method: "GET", url: "/v1/team/task-connections" });
		assert.equal(listRes.statusCode, 200);
		const connections = listRes.json().connections;
		assert.equal(connections.length, 1);
		assert.equal(connections[0].status, "active");
		assert.equal(connections[0].staleReason, undefined);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-connections returns stale when target input port id is removed", async () => {
	const { app, root } = await buildTestServer();
	try {
		const collectRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			}),
		});
		const htmlRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "HTML Task" }, {
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			}),
		});
		assert.equal(collectRes.statusCode, 201);
		assert.equal(htmlRes.statusCode, 201);
		const collect = collectRes.json().task;
		const html = htmlRes.json().task;

		await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: collect.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: html.taskId,
				toInputPortId: "source_md",
			},
		});

		await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${html.taskId}`,
			payload: {
				workUnit: {
					...html.workUnit,
					inputPorts: [{ id: "renamed_port", label: "Renamed", type: "md" }],
				},
			},
		});

		const listRes = await app.inject({ method: "GET", url: "/v1/team/task-connections" });
		assert.equal(listRes.statusCode, 200);
		const connections = listRes.json().connections;
		assert.equal(connections.length, 1);
		assert.equal(connections[0].status, "stale");
		assert.equal(connections[0].staleReason, "target_input_port_missing");
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-connections returns stale when target input port type changes", async () => {
	const { app, root } = await buildTestServer();
	try {
		const collectRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			}),
		});
		const htmlRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "HTML Task" }, {
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			}),
		});
		assert.equal(collectRes.statusCode, 201);
		assert.equal(htmlRes.statusCode, 201);
		const collect = collectRes.json().task;
		const html = htmlRes.json().task;

		await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: collect.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: html.taskId,
				toInputPortId: "source_md",
			},
		});

		await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${html.taskId}`,
			payload: {
				workUnit: {
					...html.workUnit,
					inputPorts: [{ id: "source_md", label: "HTML", type: "html" }],
				},
			},
		});

		const listRes = await app.inject({ method: "GET", url: "/v1/team/task-connections" });
		assert.equal(listRes.statusCode, 200);
		const connections = listRes.json().connections;
		assert.equal(connections.length, 1);
		assert.equal(connections[0].status, "stale");
		assert.equal(connections[0].staleReason, "target_input_port_type_mismatch");
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-connections returns stale when source output port id is removed", async () => {
	const { app, root } = await buildTestServer();
	try {
		const collectRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			}),
		});
		const htmlRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "HTML Task" }, {
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			}),
		});
		assert.equal(collectRes.statusCode, 201);
		assert.equal(htmlRes.statusCode, 201);
		const collect = collectRes.json().task;

		await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: collect.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: htmlRes.json().task.taskId,
				toInputPortId: "source_md",
			},
		});

		await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${collect.taskId}`,
			payload: {
				workUnit: {
					...collect.workUnit,
					outputPorts: [{ id: "renamed_output", label: "Renamed", type: "md" }],
				},
			},
		});

		const listRes = await app.inject({ method: "GET", url: "/v1/team/task-connections" });
		assert.equal(listRes.statusCode, 200);
		const connections = listRes.json().connections;
		assert.equal(connections.length, 1);
		assert.equal(connections[0].status, "stale");
		assert.equal(connections[0].staleReason, "source_output_port_missing");
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-connections returns stale when source output port type changes", async () => {
	const { app, root } = await buildTestServer();
	try {
		const collectRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			}),
		});
		const htmlRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "HTML Task" }, {
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			}),
		});
		assert.equal(collectRes.statusCode, 201);
		assert.equal(htmlRes.statusCode, 201);
		const collect = collectRes.json().task;

		await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: collect.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: htmlRes.json().task.taskId,
				toInputPortId: "source_md",
			},
		});

		await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${collect.taskId}`,
			payload: {
				workUnit: {
					...collect.workUnit,
					outputPorts: [{ id: "draft_md", label: "HTML", type: "html" }],
				},
			},
		});

		const listRes = await app.inject({ method: "GET", url: "/v1/team/task-connections" });
		assert.equal(listRes.statusCode, 200);
		const connections = listRes.json().connections;
		assert.equal(connections.length, 1);
		assert.equal(connections[0].status, "stale");
		assert.equal(connections[0].staleReason, "source_output_port_type_mismatch");
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});
test("GET /v1/team/task-connections returns stale when source task is archived", async () => {
	const { app, root } = await buildTestServer();
	try {
		const collectRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			}),
		});
		const htmlRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "HTML Task" }, {
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			}),
		});
		assert.equal(collectRes.statusCode, 201);
		assert.equal(htmlRes.statusCode, 201);
		const collect = collectRes.json().task;

		await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: collect.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: htmlRes.json().task.taskId,
				toInputPortId: "source_md",
			},
		});

		await app.inject({ method: "POST", url: `/v1/team/tasks/${collect.taskId}/archive` });

		const listRes = await app.inject({ method: "GET", url: "/v1/team/task-connections" });
		assert.equal(listRes.statusCode, 200);
		const connections = listRes.json().connections;
		assert.equal(connections.length, 1);
		assert.equal(connections[0].status, "stale");
		assert.equal(connections[0].staleReason, "source_task_archived");
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-connections returns stale when target task is archived", async () => {
	const { app, root } = await buildTestServer();
	try {
		const collectRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			}),
		});
		const htmlRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "HTML Task" }, {
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			}),
		});
		assert.equal(collectRes.statusCode, 201);
		assert.equal(htmlRes.statusCode, 201);
		const collect = collectRes.json().task;
		const html = htmlRes.json().task;

		await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: collect.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: html.taskId,
				toInputPortId: "source_md",
			},
		});

		await app.inject({ method: "POST", url: `/v1/team/tasks/${html.taskId}/archive` });

		const listRes = await app.inject({ method: "GET", url: "/v1/team/task-connections" });
		assert.equal(listRes.statusCode, 200);
		const connections = listRes.json().connections;
		assert.equal(connections.length, 1);
		assert.equal(connections[0].status, "stale");
		assert.equal(connections[0].staleReason, "target_task_archived");
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-connections returns 500 for corrupt connection store", async () => {
	const { app, root } = await buildTestServer();
	try {
		await mkdir(join(root, "team"), { recursive: true });
		await writeFile(join(root, "team", "task-connections.json"), "{bad json", "utf8");
		const res = await app.inject({ method: "GET", url: "/v1/team/task-connections" });
		assert.equal(res.statusCode, 500);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("Task output fan-out: same output port can connect to multiple different target Tasks", async () => {
	const { app, root } = await buildTestServer();
	try {
		const sourceRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			}),
		});
		const targetBRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "Target B" }, {
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			}),
		});
		const targetCRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "Target C" }, {
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			}),
		});
		assert.equal(sourceRes.statusCode, 201);
		assert.equal(targetBRes.statusCode, 201);
		assert.equal(targetCRes.statusCode, 201);
		const source = sourceRes.json().task;
		const targetB = targetBRes.json().task;
		const targetC = targetCRes.json().task;

		const connB = await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: source.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: targetB.taskId,
				toInputPortId: "source_md",
			},
		});
		assert.equal(connB.statusCode, 201);

		const connC = await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: source.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: targetC.taskId,
				toInputPortId: "source_md",
			},
		});
		assert.equal(connC.statusCode, 201);

		const list = await app.inject({ method: "GET", url: "/v1/team/task-connections" });
		assert.equal(list.statusCode, 200);
		const connections = list.json().connections;
		assert.equal(connections.length, 2);
		assert.ok(
			connections.every((c: any) => c.fromTaskId === source.taskId && c.fromOutputPortId === "draft_md"),
			"both connections should share same source output",
		);
		const toTaskIds = connections.map((c: any) => c.toTaskId);
		assert.ok(toTaskIds.includes(targetB.taskId), "should include target B");
		assert.ok(toTaskIds.includes(targetC.taskId), "should include target C");
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

// ── Task Control Dependencies ──

test("GET /v1/team/task-dependencies returns empty array when no dependencies exist", async () => {
	const { app, root } = await buildTestServer();
	try {
		const res = await app.inject({ method: "GET", url: "/v1/team/task-dependencies" });
		assert.equal(res.statusCode, 200);
		assert.deepEqual(res.json().dependencies, []);
	} finally {
		await app.close();
			await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/task-dependencies creates dependency for Tasks with empty ports", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskA = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload })).json().task;
		const taskB = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: { ...taskPayload, title: "B" } })).json().task;

		const res = await app.inject({
			method: "POST",
			url: "/v1/team/task-dependencies",
			payload: { fromTaskId: taskA.taskId, toTaskId: taskB.taskId },
		});
		assert.equal(res.statusCode, 201);
		const body = res.json();
		assert.ok(body.dependency.dependencyId.startsWith("dep_"));
		assert.equal(body.dependency.fromTaskId, taskA.taskId);
		assert.equal(body.dependency.toTaskId, taskB.taskId);
		assert.equal(body.dependency.trigger, "on_success");
	} finally {
		await app.close();
			await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/task-dependencies rejects self dependency", async () => {
	const { app, root } = await buildTestServer();
	try {
		const task = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload })).json().task;
		const res = await app.inject({
			method: "POST",
			url: "/v1/team/task-dependencies",
			payload: { fromTaskId: task.taskId, toTaskId: task.taskId },
		});
		assert.equal(res.statusCode, 409);
	} finally {
		await app.close();
			await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/task-dependencies rejects duplicate", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskA = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload })).json().task;
		const taskB = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: { ...taskPayload, title: "B" } })).json().task;

		await app.inject({
			method: "POST",
			url: "/v1/team/task-dependencies",
			payload: { fromTaskId: taskA.taskId, toTaskId: taskB.taskId },
		});
		const res = await app.inject({
			method: "POST",
			url: "/v1/team/task-dependencies",
			payload: { fromTaskId: taskA.taskId, toTaskId: taskB.taskId },
		});
		assert.equal(res.statusCode, 409);
		assert.ok(res.json().error.includes("already exists"));
	} finally {
		await app.close();
			await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/task-dependencies rejects missing task", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskA = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload })).json().task;
		const res = await app.inject({
			method: "POST",
			url: "/v1/team/task-dependencies",
			payload: { fromTaskId: taskA.taskId, toTaskId: "nonexistent" },
		});
		assert.equal(res.statusCode, 404);
	} finally {
		await app.close();
			await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/task-dependencies rejects cycle", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskA = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload })).json().task;
		const taskB = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: { ...taskPayload, title: "B" } })).json().task;

		await app.inject({
			method: "POST",
			url: "/v1/team/task-dependencies",
			payload: { fromTaskId: taskA.taskId, toTaskId: taskB.taskId },
		});
		const res = await app.inject({
			method: "POST",
			url: "/v1/team/task-dependencies",
			payload: { fromTaskId: taskB.taskId, toTaskId: taskA.taskId },
		});
		assert.equal(res.statusCode, 409);
		assert.ok(res.json().error.includes("cycle"));
	} finally {
		await app.close();
			await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/task-dependencies rejects mixed cycle with typed connections", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskA = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: withPorts(taskPayload, { outputPorts: [{ id: "out_md", label: "Out", type: "md" }] }) })).json().task;
		const taskB = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: withPorts({ ...taskPayload, title: "B" }, { inputPorts: [{ id: "in_md", label: "In", type: "md" }] }) })).json().task;

		await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: { fromTaskId: taskA.taskId, fromOutputPortId: "out_md", toTaskId: taskB.taskId, toInputPortId: "in_md" },
		});
		const res = await app.inject({
			method: "POST",
			url: "/v1/team/task-dependencies",
			payload: { fromTaskId: taskB.taskId, toTaskId: taskA.taskId },
		});
		assert.equal(res.statusCode, 409);
		assert.ok(res.json().error.includes("cycle"));
	} finally {
		await app.close();
			await rm(root, { recursive: true, force: true });
	}
});

test("DELETE /v1/team/task-connections removes connection", async () => {
	const { app, root } = await buildTestServer();
	try {
		const aRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts(taskPayload, {
				outputPorts: [{ id: "draft_md", label: "Markdown 文稿", type: "md" }],
			}),
		});
		const bRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: withPorts({ ...taskPayload, title: "HTML 制作 Task" }, {
				inputPorts: [{ id: "source_md", label: "Markdown 文稿", type: "md" }],
			}),
		});
		assert.equal(aRes.statusCode, 201);
		assert.equal(bRes.statusCode, 201);
		const a = aRes.json().task;
		const b = bRes.json().task;

		const createRes = await app.inject({
			method: "POST",
			url: "/v1/team/task-connections",
			payload: {
				fromTaskId: a.taskId,
				fromOutputPortId: "draft_md",
				toTaskId: b.taskId,
				toInputPortId: "source_md",
			},
		});
		assert.equal(createRes.statusCode, 201);
		const connId = createRes.json().connection.connectionId;

		const deleteRes = await app.inject({ method: "DELETE", url: `/v1/team/task-connections/${connId}` });
		assert.equal(deleteRes.statusCode, 204);

		const listRes = await app.inject({ method: "GET", url: "/v1/team/task-connections" });
		assert.equal(listRes.json().connections.length, 0);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("DELETE /v1/team/task-dependencies removes dependency", async () => {
	const { app, root } = await buildTestServer();
	try {
		const taskA = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload })).json().task;
		const taskB = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: { ...taskPayload, title: "B" } })).json().task;

		const createRes = await app.inject({
			method: "POST",
			url: "/v1/team/task-dependencies",
			payload: { fromTaskId: taskA.taskId, toTaskId: taskB.taskId },
		});
		const depId = createRes.json().dependency.dependencyId;

		const deleteRes = await app.inject({ method: "DELETE", url: `/v1/team/task-dependencies/${depId}` });
		assert.equal(deleteRes.statusCode, 204);

		const listRes = await app.inject({ method: "GET", url: "/v1/team/task-dependencies" });
		assert.equal(listRes.json().dependencies.length, 0);
	} finally {
		await app.close();
			await rm(root, { recursive: true, force: true });
	}
});
