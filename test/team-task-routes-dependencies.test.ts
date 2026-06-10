import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import {
	buildTestServer,
	taskPayload,
	withPorts,
} from "./team-task-routes-helpers.js";

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
