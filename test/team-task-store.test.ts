import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "../src/team/task-store.js";

const knownAgents = ["main", "search", "checker"];

const validTaskInput = {
	title: "调查 Medtrum 相关云服务器资产",
	leaderAgentId: "main",
	status: "ready" as const,
	workUnit: {
		title: "调查 Medtrum 相关云服务器资产",
		input: { text: "围绕 Medtrum 相关公开云服务器资产进行搜索和证据整理。" },
		outputContract: { text: "输出中文 Markdown 报告，包含发现列表、证据来源和风险说明。" },
		acceptance: { rules: ["每条发现必须包含来源", "不确定项不能编造成结论"] },
		workerAgentId: "search",
		checkerAgentId: "checker",
	},
	createdByAgentId: "main",
};

const validDiscoverySpec = {
	schemaVersion: "team/discovery-spec-1" as const,
	discoveryGoal: "发现 Medtrum 相关公开域名资产。",
	outputKey: "items",
	itemIdField: "id" as const,
	requiredItemFields: ["id"],
	recommendedItemFields: ["title", "type"],
	dispatchGoal: "逐项核查每个域名的归属、证据和风险。",
	dispatcherAgentId: "main",
	generatedWorkerAgentId: "search",
	generatedCheckerAgentId: "checker",
	autoRun: { enabled: true as const, concurrency: 3 as const },
};

const validGeneratedSource = {
	schemaVersion: "team/generated-task-source-1" as const,
	sourceDiscoveryTaskId: "task_discovery1",
	sourceItemId: "medtrum-domain",
	itemStatus: "active" as const,
	itemPayload: { id: "medtrum-domain", title: "Medtrum domain", type: "domain" },
	latestDiscoveryRunId: "run_discovery1",
	latestDiscoveryAttemptId: "attempt_discovery1",
	latestDiscoveredAt: "2026-05-30T00:00:00.000Z",
	workUnitMode: "managed" as const,
};

const validLatestManagedWorkUnit = {
	...validTaskInput.workUnit,
};

const validGeneratedSourceWithSnapshot = {
	...validGeneratedSource,
	latestManagedWorkUnit: validLatestManagedWorkUnit,
};

const validTemplateConfig = {
	schemaVersion: "team/task-template-1" as const,
	parameters: [
		{
			id: "keyword",
			label: "关键词",
			description: "要查询的品牌、模型或产品关键词。",
			required: true,
		},
	],
};

function createStore(root: string): TaskStore {
	return new TaskStore(root, { getAgentIds: () => knownAgents });
}

test("TaskStore creates a valid independent canvas task with one WorkUnit", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const task = await store.create(validTaskInput);

		assert.ok(task.taskId.startsWith("task_"));
		assert.equal(task.title, validTaskInput.title);
		assert.equal(task.leaderAgentId, "main");
		assert.equal(task.workUnit.workerAgentId, "search");
		assert.equal(task.workUnit.checkerAgentId, "checker");
		assert.equal(task.status, "ready");
		assert.equal(task.archived, false);

		const got = await store.get(task.taskId);
		assert.deepEqual(got, task);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore creates a template canvas task and validates template parameters", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const task = await store.create({
			...validTaskInput,
			title: "全网查询 {{keyword}}",
			workUnit: {
				...validTaskInput.workUnit,
				title: "全网查询 {{keyword}}",
				input: { text: "围绕 {{keyword}} 进行公开来源检索。" },
			},
			templateConfig: validTemplateConfig,
		} as never);

		assert.deepEqual((task as any).templateConfig, validTemplateConfig);
		const got = await store.get(task.taskId);
		assert.deepEqual((got as any)?.templateConfig, validTemplateConfig);

		await assert.rejects(
			() => store.create({
				...validTaskInput,
				templateConfig: {
					schemaVersion: "team/task-template-1",
					parameters: [{ id: "bad id", label: "Bad" }],
				},
			} as never),
			{ message: "templateConfig.parameters[0].id must be a stable identifier" },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore clones a template task by applying bindings and recording its template source", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const template = await store.create({
			...validTaskInput,
			title: "全网查询 {{keyword}}",
			workUnit: {
				...validTaskInput.workUnit,
				title: "全网查询 {{keyword}}",
				input: { text: "围绕 {{keyword}} 进行公开来源检索。" },
				outputContract: { text: "输出 {{keyword}} 的中文 Markdown 报告。" },
				acceptance: { rules: ["必须包含 {{keyword}} 的来源证据"] },
			},
			templateConfig: validTemplateConfig,
		} as never);

		const cloned = await (store as any).clone(template.taskId, {
			templateBindings: { keyword: "GLM-5.1" },
		});

		assert.notEqual(cloned.taskId, template.taskId);
		assert.equal(cloned.title, "全网查询 GLM-5.1");
		assert.equal(cloned.workUnit.title, "全网查询 GLM-5.1");
		assert.equal(cloned.workUnit.input.text, "围绕 GLM-5.1 进行公开来源检索。");
		assert.equal(cloned.workUnit.outputContract.text, "输出 GLM-5.1 的中文 Markdown 报告。");
		assert.deepEqual(cloned.workUnit.acceptance.rules, ["必须包含 GLM-5.1 的来源证据"]);
		assert.equal(cloned.templateConfig, undefined);
		assert.deepEqual(cloned.templateInstance, {
			schemaVersion: "team/task-template-instance-1",
			sourceTaskId: template.taskId,
			bindings: { keyword: "GLM-5.1" },
		});

		const renamed = await (store as any).clone(template.taskId, {
			title: "全网查询 {{keyword}} 副本",
			templateBindings: { keyword: "Claude Code" },
		});
		assert.equal(renamed.title, "全网查询 Claude Code 副本");

		await assert.rejects(
			() => (store as any).clone(template.taskId, { templateBindings: {} }),
			{ message: "template binding is required: keyword" },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore clones a normal task without copying generated identity or run history", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const source = await store.create(validTaskInput);
		const cloned = await (store as any).clone(source.taskId, { title: "复制后的 HTML 工具 Task" });

		assert.notEqual(cloned.taskId, source.taskId);
		assert.equal(cloned.title, "复制后的 HTML 工具 Task");
		assert.equal(cloned.workUnit.title, validTaskInput.workUnit.title);
		assert.equal(cloned.generatedSource, undefined);
		assert.equal(cloned.archived, false);

		const generated = await store.create({ ...validTaskInput, generatedSource: validGeneratedSource });
		await assert.rejects(
			() => (store as any).clone(generated.taskId, {}),
			{ message: "generated Task cannot be cloned through this route" },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore preserves typed input and output ports on a WorkUnit", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const task = await store.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				inputPorts: [{ id: "source_md", label: "Markdown 文稿", type: "md" }],
				outputPorts: [
					{ id: "page_html", label: "HTML 页面", type: "html" },
					{ id: "voice_audio", label: "TTS 音频", type: "audio" },
				],
			},
		});

		assert.deepEqual(task.workUnit.inputPorts, [{ id: "source_md", label: "Markdown 文稿", type: "md" }]);
		assert.deepEqual(task.workUnit.outputPorts, [
			{ id: "page_html", label: "HTML 页面", type: "html" },
			{ id: "voice_audio", label: "TTS 音频", type: "audio" },
		]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore rejects invalid or duplicate WorkUnit ports", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);

		await assert.rejects(
			() => store.create({
				...validTaskInput,
				workUnit: { ...validTaskInput.workUnit, outputPorts: [{ id: "bad id", label: "Bad", type: "md" }] },
			}),
			{ message: "workUnit.outputPorts[0].id must be a stable identifier" },
		);
		await assert.rejects(
			() => store.create({
				...validTaskInput,
				workUnit: { ...validTaskInput.workUnit, inputPorts: [{ id: "source", label: "Source", type: "" }] },
			}),
			{ message: "workUnit.inputPorts[0].type is required" },
		);
		await assert.rejects(
			() => store.create({
				...validTaskInput,
				workUnit: {
					...validTaskInput.workUnit,
					outputPorts: [
						{ id: "result", label: "Result", type: "md" },
						{ id: "result", label: "Duplicate", type: "html" },
					],
				},
			}),
			{ message: "workUnit.outputPorts contains duplicate port id: result" },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore rejects missing or unknown leader, worker, and checker agents", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);

		await assert.rejects(
			() => store.create({ ...validTaskInput, leaderAgentId: "" }),
			{ message: "leaderAgentId is required" },
		);
		await assert.rejects(
			() => store.create({ ...validTaskInput, leaderAgentId: "missing-leader" }),
			{ message: "agent profile not found: missing-leader" },
		);
		await assert.rejects(
			() => store.create({ ...validTaskInput, workUnit: { ...validTaskInput.workUnit, workerAgentId: "" } }),
			{ message: "workUnit.workerAgentId is required" },
		);
		await assert.rejects(
			() => store.create({ ...validTaskInput, workUnit: { ...validTaskInput.workUnit, workerAgentId: "missing-worker" } }),
			{ message: "agent profile not found: missing-worker" },
		);
		await assert.rejects(
			() => store.create({ ...validTaskInput, workUnit: { ...validTaskInput.workUnit, checkerAgentId: "" } }),
			{ message: "workUnit.checkerAgentId is required" },
		);
		await assert.rejects(
			() => store.create({ ...validTaskInput, workUnit: { ...validTaskInput.workUnit, checkerAgentId: "missing-checker" } }),
			{ message: "agent profile not found: missing-checker" },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore validates title, input, output contract, and acceptance rules", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);

		await assert.rejects(
			() => store.create({ ...validTaskInput, title: "" }),
			{ message: "task title is required" },
		);
		await assert.rejects(
			() => store.create({ ...validTaskInput, workUnit: { ...validTaskInput.workUnit, title: "" } }),
			{ message: "workUnit.title is required" },
		);
		await assert.rejects(
			() => store.create({ ...validTaskInput, workUnit: { ...validTaskInput.workUnit, input: { text: "" } } }),
			{ message: "workUnit.input.text is required" },
		);
		await assert.rejects(
			() => store.create({ ...validTaskInput, workUnit: { ...validTaskInput.workUnit, outputContract: { text: "" } } }),
			{ message: "workUnit.outputContract.text is required" },
		);
		await assert.rejects(
			() => store.create({ ...validTaskInput, workUnit: { ...validTaskInput.workUnit, acceptance: { rules: [] } } }),
			{ message: "workUnit.acceptance.rules must contain at least one non-empty rule" },
		);
		await assert.rejects(
			() => store.create({ ...validTaskInput, workUnit: { ...validTaskInput.workUnit, acceptance: { rules: ["ok", ""] } } }),
			{ message: "workUnit.acceptance.rules must contain only non-empty rules" },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore normalizes old task records missing status and archived", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const tasksDir = join(root, "tasks");
		await mkdir(tasksDir, { recursive: true });
		const oldTask = {
			taskId: "task_old1",
			title: "旧 Task",
			leaderAgentId: "main",
			workUnit: validTaskInput.workUnit,
			createdAt: "2026-05-24T00:00:00.000Z",
			updatedAt: "2026-05-24T00:00:00.000Z",
		};
		await writeFile(join(tasksDir, "task_old1.json"), JSON.stringify(oldTask), "utf8");

		const got = await store.get("task_old1");
		assert.ok(got);
		assert.equal(got.status, "drafting");
		assert.equal(got.archived, false);

		const list = await store.list();
		assert.equal(list.length, 1);
		assert.equal(list[0]!.status, "drafting");
		assert.equal(list[0]!.archived, false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore archive hides task from default list but includeArchived returns it", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const task = await store.create(validTaskInput);
		const archived = await store.archive(task.taskId);

		assert.equal(archived.archived, true);
		assert.equal(archived.status, "archived");
		assert.equal((await store.list()).length, 0);

		const allTasks = await store.list({ includeArchived: true });
		assert.equal(allTasks.length, 1);
		assert.equal(allTasks[0]!.taskId, task.taskId);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore updates draft task fields and blocks locked WorkUnit edits", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const task = await store.create({ ...validTaskInput, status: "drafting" });
		const updated = await store.update(task.taskId, {
			title: "更新后的 Task",
			workUnit: { ...validTaskInput.workUnit, input: { text: "更新输入" } },
		});
		assert.equal(updated.title, "更新后的 Task");
		assert.equal(updated.workUnit.input.text, "更新输入");

		const tasksDir = join(root, "tasks");
		await writeFile(join(tasksDir, `${task.taskId}.json`), JSON.stringify({ ...updated, status: "locked" }), "utf8");
		await assert.rejects(
			() => store.update(task.taskId, { workUnit: validTaskInput.workUnit }),
			{ message: "locked task workUnit cannot be edited" },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore creates a valid Discovery root task and preserves its spec", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const task = await store.create({
			...validTaskInput,
			canvasKind: "discovery",
			discoverySpec: validDiscoverySpec,
		});

		assert.equal(task.canvasKind, "discovery");
		assert.deepEqual(task.discoverySpec, validDiscoverySpec);
		assert.equal(task.generatedSource, undefined);

		const got = await store.get(task.taskId);
		assert.equal(got?.canvasKind, "discovery");
		assert.deepEqual(got?.discoverySpec, validDiscoverySpec);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore rejects invalid Discovery task specs", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);

		await assert.rejects(
			() => store.create({ ...validTaskInput, canvasKind: "discovery" }),
			{ message: "discoverySpec is required for discovery tasks" },
		);
		await assert.rejects(
			() => store.create({
				...validTaskInput,
				canvasKind: "discovery",
				discoverySpec: { ...validDiscoverySpec, requiredItemFields: ["title"] },
			}),
			{ message: "discoverySpec.requiredItemFields must include id" },
		);
		await assert.rejects(
			() => store.create({
				...validTaskInput,
				canvasKind: "discovery",
				discoverySpec: { ...validDiscoverySpec, dispatcherAgentId: "missing-dispatcher" },
			}),
			{ message: "agent profile not found: missing-dispatcher" },
		);
		await assert.rejects(
			() => store.create({
				...validTaskInput,
				canvasKind: "discovery",
				discoverySpec: { ...validDiscoverySpec, generatedWorkerAgentId: "missing-worker" },
			}),
			{ message: "agent profile not found: missing-worker" },
		);
		await assert.rejects(
			() => store.create({
				...validTaskInput,
				canvasKind: "discovery",
				discoverySpec: { ...validDiscoverySpec, generatedCheckerAgentId: "missing-checker" },
			}),
			{ message: "agent profile not found: missing-checker" },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore rejects normal root tasks carrying a Discovery spec", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);

		await assert.rejects(
			() => store.create({ ...validTaskInput, discoverySpec: validDiscoverySpec }),
			{ message: "normal root task cannot carry discoverySpec" },
		);
		await assert.rejects(
			() => store.create({ ...validTaskInput, canvasKind: "task", discoverySpec: validDiscoverySpec }),
			{ message: "normal root task cannot carry discoverySpec" },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore rejects invalid canvasKind on create", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);

		await assert.rejects(
			() => store.create({ ...validTaskInput, canvasKind: "source" } as never),
			{ message: "canvasKind is invalid" },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore creates generated tasks and rejects invalid generated identity mixes", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const task = await store.create({
			...validTaskInput,
			generatedSource: validGeneratedSource,
		});

		assert.equal(task.canvasKind, undefined);
		assert.deepEqual(task.generatedSource, validGeneratedSource);

		await assert.rejects(
			() => store.create({
				...validTaskInput,
				canvasKind: "discovery",
				discoverySpec: validDiscoverySpec,
				generatedSource: validGeneratedSource,
			}),
			{ message: "discovery root task cannot carry generatedSource" },
		);
		await assert.rejects(
			() => store.create({
				...validTaskInput,
				discoverySpec: validDiscoverySpec,
				generatedSource: validGeneratedSource,
			}),
			{ message: "generated task cannot carry discoverySpec" },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore validates optional generated latest managed WorkUnit snapshots", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const task = await store.create({
			...validTaskInput,
			generatedSource: validGeneratedSourceWithSnapshot,
		});

		assert.deepEqual(task.generatedSource?.latestManagedWorkUnit, validLatestManagedWorkUnit);

		await assert.rejects(
			() => store.create({
				...validTaskInput,
				generatedSource: {
					...validGeneratedSource,
					latestManagedWorkUnit: {
						...validLatestManagedWorkUnit,
						input: { text: "" },
					},
				},
			}),
			{ message: "workUnit.input.text is required" },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore updates discoverySpec only on Discovery root tasks", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const discovery = await store.create({
			...validTaskInput,
			canvasKind: "discovery",
			discoverySpec: validDiscoverySpec,
		});
		const normal = await store.create({ ...validTaskInput, title: "Normal task" });
		const generated = await store.create({
			...validTaskInput,
			title: "Generated item",
			generatedSource: validGeneratedSource,
		});

		const updated = await store.update(discovery.taskId, {
			discoverySpec: { ...validDiscoverySpec, dispatchGoal: "改为逐项核查域名备案和公开证据。" },
		});
		assert.equal(updated.discoverySpec?.dispatchGoal, "改为逐项核查域名备案和公开证据。");

		await assert.rejects(
			() => store.update(normal.taskId, { discoverySpec: validDiscoverySpec }),
			{ message: "normal root task cannot carry discoverySpec" },
		);
		await assert.rejects(
			() => store.update(generated.taskId, { discoverySpec: validDiscoverySpec }),
			{ message: "generated task cannot carry discoverySpec" },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore rejects public updates to generated identity fields", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const task = await store.create({ ...validTaskInput, generatedSource: validGeneratedSource });

		await assert.rejects(
			() => store.update(task.taskId, { canvasKind: "discovery" } as never),
			{ message: "canvasKind cannot be updated" },
		);
		await assert.rejects(
			() => store.update(task.taskId, { generatedSource: { ...validGeneratedSource, sourceItemId: "other" } } as never),
			{ message: "generatedSource cannot be updated" },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore list hides generated tasks by default and can include them", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const rootTask = await store.create(validTaskInput);
		const generatedTask = await store.create({ ...validTaskInput, title: "Generated item", generatedSource: validGeneratedSource });

		const defaultList = await store.list();
		assert.deepEqual(defaultList.map(task => task.taskId), [rootTask.taskId]);

		const fullList = await store.list({ includeGenerated: true });
		assert.equal(fullList.length, 2);
		assert.ok(fullList.some(task => task.taskId === rootTask.taskId));
		assert.ok(fullList.some(task => task.taskId === generatedTask.taskId));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore lists generated tasks for one Discovery task including stale items", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const active = await store.create({
			...validTaskInput,
			title: "Generated active",
			generatedSource: { ...validGeneratedSource, sourceDiscoveryTaskId: "task_discovery1", sourceItemId: "active-item" },
		});
		const stale = await store.create({
			...validTaskInput,
			title: "Generated stale",
			generatedSource: {
				...validGeneratedSource,
				sourceDiscoveryTaskId: "task_discovery1",
				sourceItemId: "stale-item",
				itemStatus: "stale",
			},
		});
		await store.create({
			...validTaskInput,
			title: "Generated other discovery",
			generatedSource: { ...validGeneratedSource, sourceDiscoveryTaskId: "task_discovery2", sourceItemId: "other-item" },
		});

		const generated = await store.listGeneratedForDiscoveryTask("task_discovery1");
		assert.deepEqual(new Set(generated.map(task => task.taskId)), new Set([active.taskId, stale.taskId]));
		assert.deepEqual(new Set(generated.map(task => task.generatedSource?.itemStatus)), new Set(["active", "stale"]));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore marks generated task WorkUnit edits as customized and preserves mode for metadata-only updates", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const task = await store.create({ ...validTaskInput, generatedSource: validGeneratedSourceWithSnapshot });

		const renamed = await store.update(task.taskId, { title: "Renamed generated task" });
		assert.equal(renamed.generatedSource?.workUnitMode, "managed");

		const customized = await store.update(task.taskId, {
			workUnit: { ...validTaskInput.workUnit, input: { text: "用户改写后的输入" } },
		});
		assert.equal(customized.generatedSource?.workUnitMode, "customized");
		assert.equal(customized.workUnit.input.text, "用户改写后的输入");
		assert.deepEqual(customized.generatedSource?.latestManagedWorkUnit, validLatestManagedWorkUnit);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore upserts a managed generated Task from Discovery and hides it from root list", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const result = await store.upsertGeneratedTaskFromDiscovery({
			sourceDiscoveryTaskId: "task_discovery1",
			sourceItemId: "vultr",
			itemPayload: { id: "vultr", name: "Vultr" },
			latestDiscoveryRunId: "run_1",
			latestDiscoveryAttemptId: "attempt_1",
			latestDiscoveredAt: "2026-05-31T00:00:00.000Z",
			leaderAgentId: "main",
			generatedWorkerAgentId: "search",
			generatedCheckerAgentId: "checker",
			workUnit: {
				title: "核查 Vultr",
				input: { text: "核查 Vultr 的可用性。" },
				outputContract: { text: "输出 Vultr 核查报告。" },
				acceptance: { rules: ["包含价格证据"] },
			},
		});

		assert.equal(result.created, true);
		assert.equal(result.workUnitUpdated, true);
		assert.equal(result.task.status, "ready");
		assert.equal(result.task.title, "核查 Vultr");
		assert.equal(result.task.leaderAgentId, "main");
		assert.equal(result.task.workUnit.workerAgentId, "search");
		assert.equal(result.task.workUnit.checkerAgentId, "checker");
		assert.deepEqual(result.task.generatedSource, {
			schemaVersion: "team/generated-task-source-1",
			sourceDiscoveryTaskId: "task_discovery1",
			sourceItemId: "vultr",
			itemStatus: "active",
			itemPayload: { id: "vultr", name: "Vultr" },
			latestDiscoveryRunId: "run_1",
			latestDiscoveryAttemptId: "attempt_1",
			latestDiscoveredAt: "2026-05-31T00:00:00.000Z",
			workUnitMode: "managed",
			latestManagedWorkUnit: result.task.workUnit,
		});

		assert.deepEqual(await store.list(), []);
		const generated = await store.listGeneratedForDiscoveryTask("task_discovery1");
		assert.deepEqual(generated.map(task => task.taskId), [result.task.taskId]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore reuses generated identity and updates managed WorkUnit plus source metadata", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const first = await store.upsertGeneratedTaskFromDiscovery({
			sourceDiscoveryTaskId: "task_discovery1",
			sourceItemId: "vultr",
			itemPayload: { id: "vultr", name: "Vultr" },
			latestDiscoveryRunId: "run_1",
			latestDiscoveryAttemptId: "attempt_1",
			latestDiscoveredAt: "2026-05-31T00:00:00.000Z",
			leaderAgentId: "main",
			generatedWorkerAgentId: "search",
			generatedCheckerAgentId: "checker",
			workUnit: {
				title: "核查 Vultr",
				input: { text: "旧输入" },
				outputContract: { text: "旧输出" },
				acceptance: { rules: ["旧规则"] },
			},
		});

		const reused = await store.upsertGeneratedTaskFromDiscovery({
			sourceDiscoveryTaskId: "task_discovery1",
			sourceItemId: "vultr",
			itemPayload: { id: "vultr", name: "Vultr", region: "global" },
			latestDiscoveryRunId: "run_2",
			latestDiscoveryAttemptId: "attempt_2",
			latestDiscoveredAt: "2026-05-31T01:00:00.000Z",
			leaderAgentId: "main",
			generatedWorkerAgentId: "search",
			generatedCheckerAgentId: "checker",
			workUnit: {
				title: "重新核查 Vultr",
				input: { text: "新输入" },
				outputContract: { text: "新输出" },
				acceptance: { rules: ["新规则"] },
			},
		});

		assert.equal(reused.created, false);
		assert.equal(reused.workUnitUpdated, true);
		assert.equal(reused.task.taskId, first.task.taskId);
		assert.equal(reused.task.title, "重新核查 Vultr");
		assert.equal(reused.task.workUnit.title, "重新核查 Vultr");
		assert.equal(reused.task.workUnit.input.text, "新输入");
		assert.equal(reused.task.workUnit.outputContract.text, "新输出");
		assert.deepEqual(reused.task.workUnit.acceptance.rules, ["新规则"]);
		assert.equal(reused.task.generatedSource?.itemStatus, "active");
		assert.deepEqual(reused.task.generatedSource?.itemPayload, { id: "vultr", name: "Vultr", region: "global" });
		assert.equal(reused.task.generatedSource?.latestDiscoveryRunId, "run_2");
		assert.equal(reused.task.generatedSource?.latestDiscoveryAttemptId, "attempt_2");
		assert.equal(reused.task.generatedSource?.latestDiscoveredAt, "2026-05-31T01:00:00.000Z");
		assert.deepEqual(reused.task.generatedSource?.latestManagedWorkUnit, reused.task.workUnit);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore rejects invalid managed generated WorkUnit updates and keeps the previous task intact", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const first = await store.upsertGeneratedTaskFromDiscovery({
			sourceDiscoveryTaskId: "task_discovery1",
			sourceItemId: "vultr",
			itemPayload: { id: "vultr", name: "Vultr" },
			latestDiscoveryRunId: "run_1",
			latestDiscoveryAttemptId: "attempt_1",
			latestDiscoveredAt: "2026-05-31T00:00:00.000Z",
			leaderAgentId: "main",
			generatedWorkerAgentId: "search",
			generatedCheckerAgentId: "checker",
			workUnit: {
				title: "核查 Vultr",
				input: { text: "旧输入" },
				outputContract: { text: "旧输出" },
				acceptance: { rules: ["旧规则"] },
			},
		});

		await assert.rejects(
			() => store.upsertGeneratedTaskFromDiscovery({
				sourceDiscoveryTaskId: "task_discovery1",
				sourceItemId: "vultr",
				itemPayload: { id: "vultr", name: "Vultr", region: "global" },
				latestDiscoveryRunId: "run_2",
				latestDiscoveryAttemptId: "attempt_2",
				latestDiscoveredAt: "2026-05-31T01:00:00.000Z",
				leaderAgentId: "main",
				generatedWorkerAgentId: "search",
				generatedCheckerAgentId: "checker",
				workUnit: {
					title: "",
					input: { text: "新输入" },
					outputContract: { text: "新输出" },
					acceptance: { rules: ["新规则"] },
				},
			}),
			{ message: "task title is required" },
		);

		const got = await store.get(first.task.taskId);
		assert.equal(got?.title, "核查 Vultr");
		assert.equal(got?.workUnit.title, "核查 Vultr");
		assert.equal(got?.workUnit.input.text, "旧输入");
		assert.deepEqual(got?.generatedSource?.itemPayload, { id: "vultr", name: "Vultr" });
		assert.equal(got?.generatedSource?.latestDiscoveryRunId, "run_1");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore reuses customized generated Task without overwriting user-edited WorkUnit", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const first = await store.upsertGeneratedTaskFromDiscovery({
			sourceDiscoveryTaskId: "task_discovery1",
			sourceItemId: "vultr",
			itemPayload: { id: "vultr", name: "Vultr" },
			latestDiscoveryRunId: "run_1",
			latestDiscoveryAttemptId: "attempt_1",
			latestDiscoveredAt: "2026-05-31T00:00:00.000Z",
			leaderAgentId: "main",
			generatedWorkerAgentId: "search",
			generatedCheckerAgentId: "checker",
			workUnit: {
				title: "核查 Vultr",
				input: { text: "旧输入" },
				outputContract: { text: "旧输出" },
				acceptance: { rules: ["旧规则"] },
			},
		});
		await store.update(first.task.taskId, {
			title: "用户改名后的 Vultr",
			workUnit: {
				...first.task.workUnit,
				title: "用户改写 WorkUnit",
				input: { text: "用户改写输入" },
				outputContract: { text: "用户改写输出" },
				acceptance: { rules: ["用户改写规则"] },
			},
		});

		const reused = await store.upsertGeneratedTaskFromDiscovery({
			sourceDiscoveryTaskId: "task_discovery1",
			sourceItemId: "vultr",
			itemPayload: { id: "vultr", name: "Vultr", changed: true },
			latestDiscoveryRunId: "run_2",
			latestDiscoveryAttemptId: "attempt_2",
			latestDiscoveredAt: "2026-05-31T01:00:00.000Z",
			leaderAgentId: "main",
			generatedWorkerAgentId: "search",
			generatedCheckerAgentId: "checker",
			workUnit: {
				title: "派发器新标题",
				input: { text: "派发器新输入" },
				outputContract: { text: "派发器新输出" },
				acceptance: { rules: ["派发器新规则"] },
			},
		});

		assert.equal(reused.created, false);
		assert.equal(reused.workUnitUpdated, false);
		assert.equal(reused.task.title, "用户改名后的 Vultr");
		assert.equal(reused.task.workUnit.title, "用户改写 WorkUnit");
		assert.equal(reused.task.workUnit.input.text, "用户改写输入");
		assert.equal(reused.task.workUnit.outputContract.text, "用户改写输出");
		assert.deepEqual(reused.task.workUnit.acceptance.rules, ["用户改写规则"]);
		assert.deepEqual(reused.task.generatedSource?.itemPayload, { id: "vultr", name: "Vultr", changed: true });
		assert.equal(reused.task.generatedSource?.latestDiscoveryRunId, "run_2");
		assert.equal(reused.task.generatedSource?.workUnitMode, "customized");
		assert.equal(reused.task.generatedSource?.itemStatus, "active");
		assert.deepEqual(reused.task.generatedSource?.latestManagedWorkUnit, {
			title: "派发器新标题",
			input: { text: "派发器新输入" },
			outputContract: { text: "派发器新输出" },
			acceptance: { rules: ["派发器新规则"] },
			workerAgentId: "search",
			checkerAgentId: "checker",
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore resets customized generated WorkUnit back to the latest managed snapshot", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const first = await store.upsertGeneratedTaskFromDiscovery({
			sourceDiscoveryTaskId: "task_discovery1",
			sourceItemId: "vultr",
			itemPayload: { id: "vultr", name: "Vultr" },
			latestDiscoveryRunId: "run_1",
			latestDiscoveryAttemptId: "attempt_1",
			latestDiscoveredAt: "2026-05-31T00:00:00.000Z",
			leaderAgentId: "main",
			generatedWorkerAgentId: "search",
			generatedCheckerAgentId: "checker",
			workUnit: {
				title: "核查 Vultr",
				input: { text: "旧输入" },
				outputContract: { text: "旧输出" },
				acceptance: { rules: ["旧规则"] },
			},
		});
		await store.update(first.task.taskId, {
			title: "用户改名后的 Vultr",
			workUnit: {
				...first.task.workUnit,
				title: "用户改写 WorkUnit",
				input: { text: "用户改写输入" },
				outputContract: { text: "用户改写输出" },
				acceptance: { rules: ["用户改写规则"] },
			},
		});
		const rerun = await store.upsertGeneratedTaskFromDiscovery({
			sourceDiscoveryTaskId: "task_discovery1",
			sourceItemId: "vultr",
			itemPayload: { id: "vultr", name: "Vultr", changed: true },
			latestDiscoveryRunId: "run_2",
			latestDiscoveryAttemptId: "attempt_2",
			latestDiscoveredAt: "2026-05-31T01:00:00.000Z",
			leaderAgentId: "main",
			generatedWorkerAgentId: "search",
			generatedCheckerAgentId: "checker",
			workUnit: {
				title: "派发器新标题",
				input: { text: "派发器新输入" },
				outputContract: { text: "派发器新输出" },
				acceptance: { rules: ["派发器新规则"] },
			},
		});

		const reset = await store.resetGeneratedTaskWorkUnit(first.task.taskId);

		assert.equal(reset.title, "派发器新标题");
		assert.deepEqual(reset.workUnit, rerun.task.generatedSource?.latestManagedWorkUnit);
		assert.equal(reset.generatedSource?.workUnitMode, "managed");
		assert.equal(reset.generatedSource?.sourceDiscoveryTaskId, "task_discovery1");
		assert.equal(reset.generatedSource?.sourceItemId, "vultr");
		assert.deepEqual(reset.generatedSource?.itemPayload, { id: "vultr", name: "Vultr", changed: true });
		assert.equal(reset.generatedSource?.latestDiscoveryRunId, "run_2");
		assert.equal(reset.generatedSource?.latestDiscoveryAttemptId, "attempt_2");
		assert.equal(reset.generatedSource?.latestDiscoveredAt, "2026-05-31T01:00:00.000Z");
		assert.deepEqual(reset.generatedSource?.latestManagedWorkUnit, rerun.task.generatedSource?.latestManagedWorkUnit);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore rejects generated WorkUnit reset for root, archived, and old generated records", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const normal = await store.create(validTaskInput);
		const discovery = await store.create({
			...validTaskInput,
			canvasKind: "discovery",
			discoverySpec: validDiscoverySpec,
		});
		const oldGenerated = await store.create({
			...validTaskInput,
			title: "Old generated item",
			generatedSource: validGeneratedSource,
		});
		const archived = await store.create({
			...validTaskInput,
			title: "Archived generated item",
			generatedSource: validGeneratedSourceWithSnapshot,
		});
		await store.archive(archived.taskId);

		await assert.rejects(
			() => store.resetGeneratedTaskWorkUnit(normal.taskId),
			{ message: "generated WorkUnit reset requires a generated task" },
		);
		await assert.rejects(
			() => store.resetGeneratedTaskWorkUnit(discovery.taskId),
			{ message: "generated WorkUnit reset requires a generated task" },
		);
		await assert.rejects(
			() => store.resetGeneratedTaskWorkUnit(archived.taskId),
			{ message: "archived generated task cannot reset WorkUnit" },
		);
		await assert.rejects(
			() => store.resetGeneratedTaskWorkUnit(oldGenerated.taskId),
			{ message: "latest managed WorkUnit snapshot is missing" },
		);
		await assert.rejects(
			() => store.resetGeneratedTaskWorkUnit("task_missing"),
			{ message: "task not found: task_missing" },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore marks missing generated Tasks stale only under the same Discovery root", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);
		const active = await store.create({
			...validTaskInput,
			title: "Generated active",
			generatedSource: { ...validGeneratedSource, sourceDiscoveryTaskId: "task_discovery1", sourceItemId: "vultr" },
		});
		const missing = await store.create({
			...validTaskInput,
			title: "Generated missing",
			generatedSource: { ...validGeneratedSource, sourceDiscoveryTaskId: "task_discovery1", sourceItemId: "hetzner" },
		});
		const otherDiscovery = await store.create({
			...validTaskInput,
			title: "Generated other",
			generatedSource: { ...validGeneratedSource, sourceDiscoveryTaskId: "task_discovery2", sourceItemId: "hetzner" },
		});

		const stale = await store.markGeneratedTasksStaleForDiscovery(
			"task_discovery1",
			new Set(["vultr"]),
			{
				latestDiscoveryRunId: "run_2",
				latestDiscoveryAttemptId: "attempt_2",
				latestDiscoveredAt: "2026-05-31T01:00:00.000Z",
			},
		);

		assert.deepEqual(stale.map(task => task.taskId), [missing.taskId]);
		const gotActive = await store.get(active.taskId);
		const gotMissing = await store.get(missing.taskId);
		const gotOther = await store.get(otherDiscovery.taskId);
		assert.equal(gotActive?.generatedSource?.itemStatus, "active");
		assert.equal(gotMissing?.generatedSource?.itemStatus, "stale");
		assert.equal(gotMissing?.archived, false);
		assert.equal(gotMissing?.workUnit.input.text, validTaskInput.workUnit.input.text);
		assert.equal(gotMissing?.generatedSource?.latestDiscoveryRunId, "run_2");
		assert.equal(gotMissing?.generatedSource?.latestDiscoveryAttemptId, "attempt_2");
		assert.equal(gotMissing?.generatedSource?.latestDiscoveredAt, "2026-05-31T01:00:00.000Z");
		assert.equal(gotOther?.generatedSource?.itemStatus, "active");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("TaskStore rejects invalid outputCheck shapes and preserves valid outputCheck", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-store-"));
	try {
		const store = createStore(root);

		await assert.rejects(
			() => store.create({
				...validTaskInput,
				workUnit: { ...validTaskInput.workUnit, outputCheck: { type: "unknown" } as never },
			}),
			{ message: "workUnit.outputCheck.type is invalid" },
		);
		await assert.rejects(
			() => store.create({
				...validTaskInput,
				workUnit: { ...validTaskInput.workUnit, outputCheck: { type: "json_items", requiredFields: ["id", ""] } },
			}),
			{ message: "workUnit.outputCheck.requiredFields must contain only non-empty strings" },
		);

		const task = await store.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				outputCheck: { type: "json_items", outputKey: "items", allowDirectArray: true, requiredFields: ["id"] },
			},
		});
		assert.deepEqual(task.workUnit.outputCheck, { type: "json_items", outputKey: "items", allowDirectArray: true, requiredFields: ["id"] });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
