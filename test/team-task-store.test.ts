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
