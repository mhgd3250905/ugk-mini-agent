import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
	const root = await mkdtemp(join(tmpdir(), "team-task-group-api-"));
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

async function createTask(app: Awaited<ReturnType<typeof buildTestServer>>["app"], title: string, ports: Parameters<typeof withPorts>[1] = {}) {
	const res = await app.inject({
		method: "POST",
		url: "/v1/team/tasks",
		payload: withPorts({ ...taskPayload, title }, ports),
	});
	assert.equal(res.statusCode, 201);
	return res.json().task;
}

async function connectTasks(app: Awaited<ReturnType<typeof buildTestServer>>["app"], fromTaskId: string, toTaskId: string) {
	const res = await app.inject({
		method: "POST",
		url: "/v1/team/task-connections",
		payload: {
			fromTaskId,
			fromOutputPortId: "out_md",
			toTaskId,
			toInputPortId: "in_md",
		},
	});
	assert.equal(res.statusCode, 201);
	return res.json().connection;
}

async function createTaskChain(app: Awaited<ReturnType<typeof buildTestServer>>["app"], titles: string[]) {
	const tasks = [];
	for (const title of titles) {
		tasks.push(await createTask(app, title, {
			inputPorts: [{ id: "in_md", label: "In", type: "md" }],
			outputPorts: [{ id: "out_md", label: "Out", type: "md" }],
		}));
	}
	for (let i = 0; i < tasks.length - 1; i++) {
		await connectTasks(app, tasks[i]!.taskId, tasks[i + 1]!.taskId);
	}
	return tasks;
}

test("POST /v1/team/task-groups creates a closed Group and returns headTaskIds", async () => {
	const { app, root } = await buildTestServer();
	try {
		const [a, b] = await createTaskChain(app, ["A1", "A2"]);

		const res = await app.inject({
			method: "POST",
			url: "/v1/team/task-groups",
			payload: { title: "A chain", taskIds: [a.taskId, b.taskId] },
		});

		assert.equal(res.statusCode, 201);
		assert.equal(res.json().group.schemaVersion, "team/task-group-1");
		assert.equal(res.json().group.status, "valid");
		assert.deepEqual(res.json().group.taskIds, [a.taskId, b.taskId]);
		assert.deepEqual(res.json().group.headTaskIds, [a.taskId]);
		assert.deepEqual(res.json().group.validation.errors, []);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/task-groups returns multiple heads for independent chains", async () => {
	const { app, root } = await buildTestServer();
	try {
		const [a1, a2] = await createTaskChain(app, ["A1", "A2"]);
		const [b1, b2] = await createTaskChain(app, ["B1", "B2"]);
		const c1 = await createTask(app, "C1");

		const res = await app.inject({
			method: "POST",
			url: "/v1/team/task-groups",
			payload: { title: "Multi chain", taskIds: [a1.taskId, a2.taskId, b1.taskId, b2.taskId, c1.taskId] },
		});

		assert.equal(res.statusCode, 201);
		assert.deepEqual(new Set(res.json().group.headTaskIds), new Set([a1.taskId, b1.taskId, c1.taskId]));
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/task-groups rejects non-string taskIds entries", async () => {
	const { app, root } = await buildTestServer();
	try {
		const task = await createTask(app, "Standalone");

		const res = await app.inject({
			method: "POST",
			url: "/v1/team/task-groups",
			payload: { title: "Invalid task ids", taskIds: [task.taskId, 42] },
		});

		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /taskIds entries must be non-empty strings/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/task-groups rejects external incoming typed task connection", async () => {
	const { app, root } = await buildTestServer();
	try {
		const [external, inside] = await createTaskChain(app, ["External", "Inside"]);

		const res = await app.inject({
			method: "POST",
			url: "/v1/team/task-groups",
			payload: { title: "Incoming boundary leak", taskIds: [inside.taskId] },
		});

		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /external_incoming_task_edge|Group outside task/);
		assert.ok(res.json().error.includes(external.taskId) || res.json().error.includes(inside.taskId));
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/task-groups rejects external outgoing typed task connection", async () => {
	const { app, root } = await buildTestServer();
	try {
		const [inside, external] = await createTaskChain(app, ["Inside", "External"]);

		const res = await app.inject({
			method: "POST",
			url: "/v1/team/task-groups",
			payload: { title: "Outgoing boundary leak", taskIds: [inside.taskId] },
		});

		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /external_outgoing_task_edge|Group task/);
		assert.ok(res.json().error.includes(inside.taskId) || res.json().error.includes(external.taskId));
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/task-groups rejects cross-boundary control dependency", async () => {
	const { app, root } = await buildTestServer();
	try {
		const inside = await createTask(app, "Inside");
		const external = await createTask(app, "External");
		const depRes = await app.inject({
			method: "POST",
			url: "/v1/team/task-dependencies",
			payload: { fromTaskId: external.taskId, toTaskId: inside.taskId },
		});
		assert.equal(depRes.statusCode, 201);

		const res = await app.inject({
			method: "POST",
			url: "/v1/team/task-groups",
			payload: { title: "Dependency boundary leak", taskIds: [inside.taskId] },
		});

		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /external_incoming_task_edge|control dependency/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/task-groups rejects generated child Tasks", async () => {
	const { app, root, teamDir } = await buildTestServer();
	try {
		const discovery = await createTask(app, "Discovery");
		const store = new TaskStore(teamDir, { getAgentIds: () => ["main", "search"] });
		const generated = await store.create({
			...taskPayload,
			title: "Generated child",
			generatedSource: {
				schemaVersion: "team/generated-task-source-1",
				sourceDiscoveryTaskId: discovery.taskId,
				sourceItemId: "item_1",
				itemStatus: "active",
				itemPayload: { id: "item_1" },
				workUnitMode: "managed",
			},
		});

		const res = await app.inject({
			method: "POST",
			url: "/v1/team/task-groups",
			payload: { title: "Generated child group", taskIds: [generated.taskId] },
		});

		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /generated_task_not_supported/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/task-groups rejects archived Tasks", async () => {
	const { app, root } = await buildTestServer();
	try {
		const task = await createTask(app, "Archived");
		await app.inject({ method: "POST", url: `/v1/team/tasks/${task.taskId}/archive` });

		const res = await app.inject({
			method: "POST",
			url: "/v1/team/task-groups",
			payload: { title: "Archived task group", taskIds: [task.taskId] },
		});

		assert.equal(res.statusCode, 400);
		assert.match(res.json().error, /task_archived/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("PATCH /v1/team/task-groups/:groupId revalidates taskIds and updates headTaskIds", async () => {
	const { app, root } = await buildTestServer();
	try {
		const [a1, a2] = await createTaskChain(app, ["A1", "A2"]);
		const [b1, b2] = await createTaskChain(app, ["B1", "B2"]);
		const createRes = await app.inject({
			method: "POST",
			url: "/v1/team/task-groups",
			payload: { title: "A chain", taskIds: [a1.taskId, a2.taskId] },
		});
		assert.equal(createRes.statusCode, 201);

		const patchRes = await app.inject({
			method: "PATCH",
			url: `/v1/team/task-groups/${createRes.json().group.groupId}`,
			payload: { taskIds: [b1.taskId, b2.taskId] },
		});

		assert.equal(patchRes.statusCode, 200);
		assert.deepEqual(patchRes.json().group.taskIds, [b1.taskId, b2.taskId]);
		assert.deepEqual(patchRes.json().group.headTaskIds, [b1.taskId]);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("PATCH /v1/team/task-groups/:groupId rejects non-string or empty taskIds entries", async () => {
	const { app, root } = await buildTestServer();
	try {
		const first = await createTask(app, "First");
		const second = await createTask(app, "Second");
		const createRes = await app.inject({
			method: "POST",
			url: "/v1/team/task-groups",
			payload: { title: "Valid group", taskIds: [first.taskId] },
		});
		assert.equal(createRes.statusCode, 201);

		const nonString = await app.inject({
			method: "PATCH",
			url: `/v1/team/task-groups/${createRes.json().group.groupId}`,
			payload: { taskIds: [first.taskId, 42, second.taskId] },
		});
		assert.equal(nonString.statusCode, 400);
		assert.match(nonString.json().error, /taskIds entries must be non-empty strings/);

		const emptyString = await app.inject({
			method: "PATCH",
			url: `/v1/team/task-groups/${createRes.json().group.groupId}`,
			payload: { taskIds: [first.taskId, " "] },
		});
		assert.equal(emptyString.statusCode, 400);
		assert.match(emptyString.json().error, /taskIds entries must be non-empty strings/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/task-groups/:groupId/archive soft archives without deleting Tasks or connections", async () => {
	const { app, root } = await buildTestServer();
	try {
		const [a, b] = await createTaskChain(app, ["A1", "A2"]);
		const createRes = await app.inject({
			method: "POST",
			url: "/v1/team/task-groups",
			payload: { title: "A chain", taskIds: [a.taskId, b.taskId] },
		});
		assert.equal(createRes.statusCode, 201);

		const archiveRes = await app.inject({
			method: "POST",
			url: `/v1/team/task-groups/${createRes.json().group.groupId}/archive`,
		});
		assert.equal(archiveRes.statusCode, 200);
		assert.equal(archiveRes.json().group.archived, true);

		const taskRes = await app.inject({ method: "GET", url: `/v1/team/tasks/${a.taskId}` });
		assert.equal(taskRes.statusCode, 200);
		assert.equal(taskRes.json().task.archived, false);
		const connectionsRes = await app.inject({ method: "GET", url: "/v1/team/task-connections" });
		assert.equal(connectionsRes.statusCode, 200);
		assert.equal(connectionsRes.json().connections.length, 1);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("GET /v1/team/task-groups includes archived Groups only when requested", async () => {
	const { app, root } = await buildTestServer();
	try {
		const task = await createTask(app, "Standalone");
		const createRes = await app.inject({
			method: "POST",
			url: "/v1/team/task-groups",
			payload: { title: "Standalone", taskIds: [task.taskId] },
		});
		assert.equal(createRes.statusCode, 201);
		await app.inject({ method: "POST", url: `/v1/team/task-groups/${createRes.json().group.groupId}/archive` });

		const defaultList = await app.inject({ method: "GET", url: "/v1/team/task-groups" });
		assert.equal(defaultList.statusCode, 200);
		assert.deepEqual(defaultList.json().groups, []);

		const includeArchived = await app.inject({ method: "GET", url: "/v1/team/task-groups?includeArchived=1" });
		assert.equal(includeArchived.statusCode, 200);
		assert.equal(includeArchived.json().groups.length, 1);
		assert.equal(includeArchived.json().groups[0].archived, true);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});
