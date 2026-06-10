import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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

const validGeneratedSourceWithSnapshot = {
	...validGeneratedSource,
	latestManagedWorkUnit: { ...validTaskInput.workUnit },
};

function createStore(root: string): TaskStore {
	return new TaskStore(root, { getAgentIds: () => knownAgents });
}

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
