import test from "node:test";
import assert from "node:assert/strict";
import { buildTeamTaskFactoryPayload } from "../src/team/task-factory.js";

const context = { availableAgentIds: new Set(["main", "http", "team-checker-agent"]) };

test("task factory builds a valid worklist producer payload from narrow parameters", () => {
	const result = buildTeamTaskFactoryPayload({
		kind: "worklist-producer",
		title: "糖尿病新闻分批打包",
		leaderAgentId: "main",
		workerAgentId: "http",
		checkerAgentId: "team-checker-agent",
		sourceDescription: "上游 Discovery 输出的大 JSON 新闻集合。",
		itemBoundary: "按原始新闻条目分组。",
		batchSize: 20,
	}, context);

	assert.equal(result.payload.title, "糖尿病新闻分批打包");
	assert.equal(result.payload.canvasKind, undefined);
	assert.deepEqual(result.payload.workUnit.inputPorts, [{ id: "raw_json", label: "Source JSON", type: "json" }]);
	assert.deepEqual(result.payload.workUnit.outputPorts, [{ id: "worklist", label: "Worklist", type: "worklist" }]);
	assert.deepEqual(result.payload.workUnit.outputCheck, { type: "worklist" });
	assert.match(result.payload.workUnit.input.text, /at most 20 records/);
	assert.match(result.payload.workUnit.input.text, /output\/worklist\.json/);
	assert.match(result.payload.workUnit.outputContract.text, /\{"outputPath":"output\/worklist\.json"\}/);
	assert.ok(result.payload.workUnit.acceptance.rules.some(rule => rule.includes("output/worklist.json")));
	assert.ok(result.payload.workUnit.acceptance.rules.some(rule => rule.includes("machine-readable JSON reference")));
	assert.equal(result.payload.status, "ready");
});

test("task factory keeps worklist runtime output protocol with custom acceptance rules", () => {
	const result = buildTeamTaskFactoryPayload({
		kind: "worklist-producer",
		title: "自定义清单",
		leaderAgentId: "main",
		workerAgentId: "http",
		checkerAgentId: "team-checker-agent",
		sourceDescription: "上游 JSON。",
		itemBoundary: "按新闻条目。",
		acceptanceRules: ["每个 batch 不得跨渠道。"],
	}, context);

	assert.deepEqual(result.payload.workUnit.acceptance.rules, [
		"每个 batch 不得跨渠道。",
		"Worker must write the completed worklist file to output/worklist.json.",
		"Worker final output message must be exactly a machine-readable JSON reference like {\"outputPath\":\"output/worklist.json\"}; do not end with a prose summary.",
	]);
});

test("task factory builds a valid split-task payload with deterministic splitTaskSpec", () => {
	const result = buildTeamTaskFactoryPayload({
		kind: "split-task",
		title: "糖尿病新闻分批标准化",
		leaderAgentId: "main",
		workerAgentId: "http",
		checkerAgentId: "team-checker-agent",
		worklistDescription: "接收上游 worklist，每个 item 是最多 20 条新闻。",
		dispatchGoal: "只处理当前 item 内的新闻，输出标准化 JSON 数组。",
		concurrency: 3,
	}, context);

	assert.equal(result.payload.canvasKind, "split-task");
	assert.deepEqual(result.payload.workUnit.inputPorts, [{ id: "worklist", label: "Worklist", type: "worklist" }]);
	assert.deepEqual(result.payload.workUnit.outputPorts, [{ id: "results", label: "Worklist results", type: "worklist-results" }]);
	assert.deepEqual(result.payload.workUnit.outputCheck, { type: "worklist_results", requireFullCoverage: true });
	assert.deepEqual(result.payload.splitTaskSpec, {
		schemaVersion: "team/split-task-spec-1",
		inputPortId: "worklist",
		outputPortId: "results",
		dispatchGoal: "只处理当前 item 内的新闻，输出标准化 JSON 数组。",
		generatedWorkerAgentId: "http",
		generatedCheckerAgentId: "team-checker-agent",
		autoRun: { enabled: true, concurrency: 3 },
		collectPolicy: { requireAllItemsSucceeded: true, requireFullCoverage: true },
	});
});

test("task factory rejects bad parameters before any write can happen", () => {
	assert.throws(
		() => buildTeamTaskFactoryPayload({
			kind: "split-task",
			title: "坏分片",
			leaderAgentId: "main",
			workerAgentId: "http",
			checkerAgentId: "team-checker-agent",
			worklistDescription: "worklist",
			dispatchGoal: "process",
			concurrency: 0,
		}, context),
		{ message: "concurrency must be an integer between 1 and 10" },
	);

	assert.throws(
		() => buildTeamTaskFactoryPayload({
			kind: "worklist-producer",
			title: "未知 agent",
			leaderAgentId: "missing",
			workerAgentId: "http",
			checkerAgentId: "team-checker-agent",
			sourceDescription: "source",
			itemBoundary: "items",
		}, context),
		{ message: "agent profile not found: missing" },
	);
});
