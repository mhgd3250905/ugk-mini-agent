import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
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
	const root = await mkdtemp(join(tmpdir(), "team-task-api-"));
	const teamDir = join(root, "team");
	process.env.TEAM_RUNTIME_ENABLED = "true";
	process.env.TEAM_DATA_DIR = teamDir;
	process.env.UGK_AGENT_DATA_DIR = join(root, "agent");
	process.env.CONN_DATABASE_PATH = join(root, "conn", "conn.sqlite");
	const app = await buildServer({ agentService: createAgentServiceStub() });
	return { app, root };
}

const taskPayload = {
	title: "调查 Medtrum 相关云服务器资产",
	leaderAgentId: "main",
	status: "ready",
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
