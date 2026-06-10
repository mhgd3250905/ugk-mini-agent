import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildTestServer, taskPayload, withPorts } from "./team-task-routes-helpers.js";

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
