import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import {
	buildTestServer,
	taskPayload,
	withPorts,
} from "./team-task-routes-helpers.js";

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
