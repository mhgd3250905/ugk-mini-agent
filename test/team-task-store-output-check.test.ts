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

function createStore(root: string): TaskStore {
	return new TaskStore(root, { getAgentIds: () => knownAgents });
}

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
