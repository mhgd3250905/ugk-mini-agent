import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import {
	buildTestServer,
	discoverySpec,
	discoveryTaskPayload,
	generatedSource,
	taskPayload,
	templateConfig,
} from "./team-task-routes-helpers.js";
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
			payload: {
				title: "全网查询 {{keyword}} 副本",
				templateBindings: { keyword: "MiniMax M3" },
			},
		});
		assert.equal(cloneRes.statusCode, 201);
		const cloned = cloneRes.json().task;
		assert.notEqual(cloned.taskId, template.taskId);
		assert.equal(cloned.title, "全网查询 MiniMax M3 副本");
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

test("PATCH /v1/team/tasks/:taskId updates template current bindings only on template Tasks", async () => {
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

		const patchRes = await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${template.taskId}`,
			payload: {
				templateState: {
					schemaVersion: "team/task-template-state-1",
					currentBindings: { keyword: "MiniMax M3" },
					updatedAt: "2026-06-03T00:00:00.000Z",
				},
			},
		});
		assert.equal(patchRes.statusCode, 200);
		assert.deepEqual(patchRes.json().task.templateState.currentBindings, { keyword: "MiniMax M3" });
		assert.deepEqual(patchRes.json().task.templateConfig, templateConfig);

		const normal = (await app.inject({ method: "POST", url: "/v1/team/tasks", payload: taskPayload })).json().task;
		const invalid = await app.inject({
			method: "PATCH",
			url: `/v1/team/tasks/${normal.taskId}`,
			payload: {
				templateState: {
					schemaVersion: "team/task-template-state-1",
					currentBindings: { keyword: "MiniMax M3" },
					updatedAt: "2026-06-03T00:00:00.000Z",
				},
			},
		});
		assert.equal(invalid.statusCode, 400);
		assert.match(invalid.json().error, /templateState requires templateConfig/);
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/tasks/:taskId/runs saves template bindings and snapshots them on the run source", async () => {
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
					outputContract: { text: "输出 {{keyword}} 的中文 Markdown 报告。" },
					acceptance: { rules: ["必须包含 {{keyword}} 的来源证据"] },
				},
				templateConfig,
			},
		});
		const template = createRes.json().task;

		const missing = await app.inject({ method: "POST", url: `/v1/team/tasks/${template.taskId}/runs`, payload: {} });
		assert.equal(missing.statusCode, 400);
		assert.match(missing.json().error, /template binding is required: keyword/);

		const runRes = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${template.taskId}/runs`,
			payload: { templateBindings: { keyword: "MiniMax M3" } },
		});
		assert.equal(runRes.statusCode, 201);
		assert.deepEqual(runRes.json().source.templateBindings, { keyword: "MiniMax M3" });
		for (let i = 0; i < 20; i++) {
			const state = await app.inject({ method: "GET", url: `/v1/team/task-runs/${runRes.json().runId}` });
			if (["completed", "completed_with_failures", "failed", "cancelled"].includes(state.json().status)) break;
			await new Promise(resolve => setTimeout(resolve, 25));
		}

		const getRes = await app.inject({ method: "GET", url: `/v1/team/tasks/${template.taskId}` });
		assert.deepEqual(getRes.json().task.templateState.currentBindings, { keyword: "MiniMax M3" });
		assert.equal(getRes.json().task.workUnit.input.text, "围绕 {{keyword}} 进行公开来源检索。");
	} finally {
		await app.close();
		await rm(root, { recursive: true, force: true });
	}
});

test("POST /v1/team/tasks/:taskId/runs rejects invalid typed template bindings", async () => {
	const { app, root } = await buildTestServer();
	try {
		const createRes = await app.inject({
			method: "POST",
			url: "/v1/team/tasks",
			payload: {
				...taskPayload,
				title: "发送邮件 {{subject}}",
				workUnit: {
					...taskPayload.workUnit,
					title: "发送邮件 {{subject}}",
					input: { text: "发送给 {{recipients}}：{{subject}}" },
				},
				templateConfig: {
					schemaVersion: "team/task-template-1",
					parameters: [
						{ id: "recipients", label: "收件人", inputType: "email_list", required: true },
						{ id: "subject", label: "主题", inputType: "text", required: true },
					],
				},
			},
		});
		assert.equal(createRes.statusCode, 201);
		const template = createRes.json().task;

		const invalidRun = await app.inject({
			method: "POST",
			url: `/v1/team/tasks/${template.taskId}/runs`,
			payload: {
				templateBindings: {
					recipients: "first@example.com,not-an-email",
					subject: "每日简报",
				},
			},
		});

		assert.equal(invalidRun.statusCode, 400);
		assert.match(invalidRun.json().error, /template binding recipients must contain valid email addresses/);
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

