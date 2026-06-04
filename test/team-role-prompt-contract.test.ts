import test from "node:test";
import assert from "node:assert/strict";
import {
	buildCheckerPrompt,
	buildDecomposerPrompt,
	buildDiscoveryDispatchPrompt,
	buildFinalizerPrompt,
	buildWatcherPrompt,
	buildWorkerPrompt,
	parseCheckerRoleOutput,
	parseDecomposerRoleOutput,
	parseDiscoveryDispatchSemanticPatch,
	parseDiscoveryDispatchRoleOutput,
	parseWatcherRoleOutput,
} from "../src/team/role-prompt-contract.js";
import { compileDiscoveryDispatchWorkUnit } from "../src/team/discovery-dispatch-workunit-compiler.js";
import type { DecomposerInput, DiscoveryDispatchInput } from "../src/team/role-runner.js";
import type { TeamPlan, TeamTask, TeamOutputValidationResult } from "../src/team/types.js";

function makeTask(overrides: Partial<TeamTask> = {}): TeamTask {
	return {
		id: "task_1",
		title: "测试任务",
		input: { text: "完成测试任务" },
		acceptance: { rules: ["输出结果"] },
		...overrides,
	};
}

function makePlan(overrides: Partial<TeamPlan> = {}): TeamPlan {
	return {
		schemaVersion: "team/plan-1",
		planId: "plan_1",
		title: "测试计划",
		defaultTeamUnitId: "team_1",
		goal: { text: "完成计划目标" },
		tasks: [],
		outputContract: { text: "输出 markdown 汇总" },
		archived: false,
		createdAt: "2026-05-21T00:00:00.000Z",
		updatedAt: "2026-05-21T00:00:00.000Z",
		runCount: 0,
		...overrides,
	};
}

function makeDiscoveryDispatchInput(overrides: Partial<DiscoveryDispatchInput> = {}): DiscoveryDispatchInput {
	return {
		runId: "run_1",
		discoveryTaskId: "task_discovery",
		discoveryTaskTitle: "Vendor discovery",
		discoveryGoal: "Find qualified vendors for Android 16 BLE validation.",
		dispatchGoal: "Create one due-diligence work unit for each discovered vendor.",
		outputKey: "vendors",
		itemId: "vendor_1",
		itemPayload: {
			id: "vendor_1",
			title: "Acme Sensors",
			type: "vendor",
			website: "https://example.com",
		},
		requiredItemFields: ["id"],
		recommendedItemFields: ["title", "type"],
		generatedWorkerAgentId: "worker-default",
		generatedCheckerAgentId: "checker-default",
		...overrides,
	};
}

test("buildWorkerPrompt preserves discovery output contract and generated item identity", () => {
	const prompt = buildWorkerPrompt(
		makeTask({
			id: "scan_vendors__vendor_1",
			type: "discovery",
			title: "扫描 vendor",
			input: { text: "扫描 vendor 数据" },
			discovery: { outputKey: "vendors" },
			generated: true,
			sourceItemId: "vendor_1",
			sourceItem: { id: "vendor_1", data: { id: "vendor_1", title: "Vendor One" } },
		}),
		["必须输出机器可解析数据"],
	);

	assert.ok(prompt.includes("机器可消费输出协议"), "worker prompt must include output contract block");
	assert.ok(prompt.includes('顶层 key 必须是 "vendors"'), "worker prompt must mention discovery outputKey");
	assert.ok(prompt.includes("vendor_1"), "worker prompt must include source item id");
	assert.ok(prompt.includes("Vendor One"), "worker prompt must include source item title");
	assert.ok(prompt.includes("最高优先级"), "worker prompt must include identity priority");
});

test("buildDiscoveryDispatchPrompt includes discovery context, exact item payload, semantic patch shape, strict JSON-only wording, and forbidden fields", () => {
	const input = makeDiscoveryDispatchInput();
	const prompt = buildDiscoveryDispatchPrompt(input);

	assert.ok(prompt.includes(input.discoveryTaskId), "prompt must include Discovery task id");
	assert.ok(prompt.includes(input.discoveryTaskTitle), "prompt must include Discovery task title");
	assert.ok(prompt.includes(input.discoveryGoal), "prompt must include Discovery goal");
	assert.ok(prompt.includes(input.dispatchGoal), "prompt must include dispatch goal");
	assert.ok(prompt.includes(input.outputKey), "prompt must include output key");
	assert.ok(prompt.includes(input.itemId), "prompt must include exact item id");
	assert.ok(prompt.includes('"website": "https://example.com"'), "prompt must include full item payload JSON");
	assert.ok(prompt.includes("requiredItemFields") && prompt.includes("id"), "prompt must include required item fields");
	assert.ok(prompt.includes("recommendedItemFields") && prompt.includes("title") && prompt.includes("type"), "prompt must include recommended item fields");
	assert.ok(prompt.includes('"workerInstruction"'), "prompt must include semantic patch schema");
	assert.ok(prompt.includes('"itemAcceptanceHints"'), "prompt must include optional item-specific acceptance hints");
	assert.ok(prompt.includes('"outputContractHint"'), "prompt must include optional item-specific output hint");
	assert.ok(!prompt.includes("```json"), "dispatcher semantic patch prompt must not include JSON code fences");
	assert.ok(prompt.includes('第一个字符必须是 "{"'), "prompt must require a bare JSON object start");
	assert.ok(prompt.includes('最后一个字符必须是 "}"'), "prompt must require a bare JSON object end");
	assert.ok(!prompt.includes('"workUnit": {'), "prompt must not ask for full WorkUnit schema");
	assert.ok(prompt.includes("workerAgentId") && prompt.includes("checkerAgentId"), "prompt must ban worker/checker identity output");
	assert.ok(prompt.includes("generatedSource") && prompt.includes("sourceDiscoveryTaskId"), "prompt must ban source identity output");
});

test("parseDiscoveryDispatchSemanticPatch accepts valid patch", () => {
	const out = parseDiscoveryDispatchSemanticPatch(
		JSON.stringify({
			itemId: "vendor_1",
			title: " Assess Acme Sensors ",
			workerInstruction: " Research Acme Sensors and summarize BLE validation fit. ",
			itemAcceptanceHints: [" Cites relevant sources ", "", "Cites relevant sources"],
			outputContractHint: "Focus on BLE validation services.",
		}),
		"vendor_1",
	);

	assert.equal(out.ok, true);
	if (out.ok) {
		assert.equal(out.patch.itemId, "vendor_1");
		assert.equal(out.patch.title, "Assess Acme Sensors");
		assert.equal(out.patch.workerInstruction, "Research Acme Sensors and summarize BLE validation fit.");
		assert.deepEqual(out.patch.itemAcceptanceHints, ["Cites relevant sources", "Cites relevant sources"]);
		assert.equal(out.patch.outputContractHint, "Focus on BLE validation services.");
	}
});

test("parseDiscoveryDispatchSemanticPatch rejects fenced and text-wrapped JSON", () => {
	const fenced = parseDiscoveryDispatchSemanticPatch(
		'```json\n{"itemId":"vendor_1","title":"Assess vendor","workerInstruction":"Do work"}\n```',
		"vendor_1",
	);
	const embedded = parseDiscoveryDispatchSemanticPatch(
		'Here is JSON: {"itemId":"vendor_1","title":"Assess vendor","workerInstruction":"Do work"}',
		"vendor_1",
	);
	const wrapped = parseDiscoveryDispatchSemanticPatch(
		'{"itemId":"vendor_1","title":"Assess vendor","workerInstruction":"Do work"}\nExplanation: done',
		"vendor_1",
	);

	assert.equal(fenced.ok, false);
	assert.match(fenced.error, /invalid JSON/);
	assert.equal(embedded.ok, false);
	assert.match(embedded.error, /invalid JSON/);
	assert.equal(wrapped.ok, false);
	assert.match(wrapped.error, /invalid JSON/);
});

test("parseDiscoveryDispatchSemanticPatch rejects item mismatch", () => {
	const out = parseDiscoveryDispatchSemanticPatch(
		JSON.stringify({
			itemId: "vendor_2",
			title: "Assess vendor",
			workerInstruction: "Do work",
		}),
		"vendor_1",
	);

	assert.equal(out.ok, false);
	assert.equal(out.itemId, "vendor_1");
	assert.match(out.error, /item/i);
});

test("parseDiscoveryDispatchSemanticPatch rejects nested forbidden fields", () => {
	const topLevel = parseDiscoveryDispatchSemanticPatch(
		JSON.stringify({
			itemId: "vendor_1",
			title: "Assess vendor",
			workerInstruction: "Do work",
			workUnit: { title: "rogue" },
		}),
		"vendor_1",
	);
	const nested = parseDiscoveryDispatchSemanticPatch(
		JSON.stringify({
			itemId: "vendor_1",
			title: "Assess vendor",
			workerInstruction: "Do work",
			itemAcceptanceHints: [
				"ok",
			],
			nested: {
				outputContract: { text: "rogue" },
				acceptance: { rules: ["rogue"] },
			},
		}),
		"vendor_1",
	);

	assert.equal(topLevel.ok, false);
	assert.match(topLevel.error, /workUnit/);
	assert.equal(nested.ok, false);
	assert.match(nested.error, /outputContract|acceptance/);
});

test("compileDiscoveryDispatchWorkUnit builds deterministic full WorkUnit draft", () => {
	const input = makeDiscoveryDispatchInput();
	const workUnit = compileDiscoveryDispatchWorkUnit(input, {
		itemId: "vendor_1",
		title: " Assess Acme Sensors ",
		workerInstruction: " Research only this vendor. ",
		itemAcceptanceHints: [
			" Cites relevant sources ",
			"",
			"Cites relevant sources",
			"States source limitations",
		],
		outputContractHint: " Include BLE validation fit score. ",
	});

	assert.equal(workUnit.title, "Assess Acme Sensors");
	assert.ok(workUnit.input.text.includes("Discovery task: Vendor discovery"));
	assert.ok(workUnit.input.text.includes(input.discoveryGoal));
	assert.ok(workUnit.input.text.includes(input.dispatchGoal));
	assert.ok(workUnit.input.text.includes("Exact item id: vendor_1"));
	assert.ok(workUnit.input.text.includes('"website": "https://example.com"'), "compiler must include full item JSON");
	assert.ok(workUnit.input.text.includes("Research only this vendor."));
	assert.ok(workUnit.input.text.includes("Only process this exact Discovery item"));
	assert.ok(workUnit.outputContract.text.includes("vendors"));
	assert.ok(workUnit.outputContract.text.includes("vendor_1"));
	assert.ok(workUnit.outputContract.text.includes("Include BLE validation fit score."));
	assert.ok(workUnit.acceptance.rules.length > 0);
	assert.equal(workUnit.acceptance.rules.filter(rule => rule === "Cites relevant sources").length, 1);
	assert.ok(workUnit.acceptance.rules.includes("States source limitations"));
	assert.ok(!("workerAgentId" in workUnit), "compiler must not inject worker identity");
	assert.ok(!("checkerAgentId" in workUnit), "compiler must not inject checker identity");
});

test("parseDiscoveryDispatchRoleOutput legacy parser accepts valid JSON workUnit draft", () => {
	const out = parseDiscoveryDispatchRoleOutput(
		JSON.stringify({
			itemId: "vendor_1",
			workUnit: {
				title: "Assess Acme Sensors",
				input: { text: "Research Acme Sensors and summarize BLE validation fit." },
				outputContract: { text: "Markdown due-diligence report with cited evidence." },
				acceptance: { rules: ["Cites at least two relevant sources", "States suitability risks"] },
			},
		}),
		"vendor_1",
	);

	assert.equal(out.ok, true);
	if (out.ok) {
		assert.equal(out.itemId, "vendor_1");
		assert.equal(out.workUnit.title, "Assess Acme Sensors");
		assert.deepEqual(out.workUnit.acceptance.rules, ["Cites at least two relevant sources", "States suitability risks"]);
	}
});

test("parseDiscoveryDispatchRoleOutput normalizes misplaced workUnit contract fields", () => {
	const outputContractInInput = parseDiscoveryDispatchRoleOutput(
		JSON.stringify({
			itemId: "vendor_1",
			workUnit: {
				title: "Assess vendor",
				input: {
					text: "Do work",
					outputContract: { text: "Report" },
					acceptance: { rules: ["ok"] },
				},
			},
		}),
		"vendor_1",
	);
	const acceptanceInOutputContract = parseDiscoveryDispatchRoleOutput(
		JSON.stringify({
			itemId: "vendor_1",
			workUnit: {
				title: "Assess vendor",
				input: {
					text: "Do work",
					outputContract: {
						text: "Report",
						acceptance: { rules: ["ok"] },
					},
				},
			},
		}),
		"vendor_1",
	);

	assert.equal(outputContractInInput.ok, true);
	assert.equal(acceptanceInOutputContract.ok, true);
	if (outputContractInInput.ok) {
		assert.equal(outputContractInInput.workUnit.outputContract.text, "Report");
		assert.deepEqual(outputContractInInput.workUnit.acceptance.rules, ["ok"]);
	}
	if (acceptanceInOutputContract.ok) {
		assert.equal(acceptanceInOutputContract.workUnit.outputContract.text, "Report");
		assert.deepEqual(acceptanceInOutputContract.workUnit.acceptance.rules, ["ok"]);
	}
});

test("parseDiscoveryDispatchRoleOutput rejects item id mismatch", () => {
	const out = parseDiscoveryDispatchRoleOutput(
		JSON.stringify({
			itemId: "vendor_2",
			workUnit: {
				title: "Assess vendor",
				input: { text: "Do work" },
				outputContract: { text: "Report" },
				acceptance: { rules: ["ok"] },
			},
		}),
		"vendor_1",
	);

	assert.equal(out.ok, false);
	assert.equal(out.itemId, "vendor_1");
	assert.match(out.error, /item/i);
});

test("parseDiscoveryDispatchRoleOutput rejects forbidden top-level and workUnit fields", () => {
	const forbiddenTopLevel = parseDiscoveryDispatchRoleOutput(
		JSON.stringify({
			itemId: "vendor_1",
			workerAgentId: "rogue-worker",
			workUnit: {
				title: "Assess vendor",
				input: { text: "Do work" },
				outputContract: { text: "Report" },
				acceptance: { rules: ["ok"] },
			},
		}),
		"vendor_1",
	);
	const forbiddenWorkUnit = parseDiscoveryDispatchRoleOutput(
		JSON.stringify({
			itemId: "vendor_1",
			workUnit: {
				title: "Assess vendor",
				input: { text: "Do work" },
				outputContract: { text: "Report" },
				acceptance: { rules: ["ok"] },
				generatedSource: { sourceDiscoveryTaskId: "task_discovery" },
				outputCheck: { type: "json_object" },
			},
		}),
		"vendor_1",
	);

	assert.equal(forbiddenTopLevel.ok, false);
	assert.match(forbiddenTopLevel.error, /workerAgentId/);
	assert.equal(forbiddenWorkUnit.ok, false);
	assert.match(forbiddenWorkUnit.error, /generatedSource|outputCheck/);
});

test("parseDiscoveryDispatchRoleOutput rejects invalid schema and invalid JSON without throwing", () => {
	const emptyDraft = parseDiscoveryDispatchRoleOutput(
		JSON.stringify({
			itemId: "vendor_1",
			workUnit: {
				title: "",
				input: { text: "Do work" },
				outputContract: { text: "Report" },
				acceptance: { rules: [] },
			},
		}),
		"vendor_1",
	);
	const invalidJson = parseDiscoveryDispatchRoleOutput("not json", "vendor_1");

	assert.equal(emptyDraft.ok, false);
	assert.match(emptyDraft.error, /schema|workUnit/i);
	assert.equal(invalidJson.ok, false);
	assert.equal(invalidJson.itemId, "vendor_1");
	assert.match(invalidJson.error, /json/i);
});

test("checker and watcher prompts preserve output validation evidence guardrails", () => {
	const validation: TeamOutputValidationResult = {
		ok: false,
		kind: "discovery",
		sourceRef: null,
		checks: [{ name: "json_parse", ok: false, message: "no parseable JSON found" }],
		normalizedRef: null,
	};
	const task = makeTask({ type: "discovery", discovery: { outputKey: "vendors" } });

	const checkerPrompt = buildCheckerPrompt(task, ["ok"], "worker output", validation);
	const watcherPrompt = buildWatcherPrompt(task, "failed", null, "validation failed", validation);

	assert.ok(checkerPrompt.includes('"ok":false'), "checker prompt must serialize validation evidence");
	assert.ok(checkerPrompt.includes("不得") && checkerPrompt.includes("pass"), "checker prompt must forbid pass on ok=false");
	assert.ok(watcherPrompt.includes('"ok":false'), "watcher prompt must serialize validation evidence");
	assert.ok(watcherPrompt.includes("不得") && watcherPrompt.includes("accept_task"), "watcher prompt must forbid accept_task on ok=false");
});

test("parseCheckerRoleOutput preserves strict, fenced, embedded, jsonish, and fallback behavior", () => {
	assert.deepEqual(
		parseCheckerRoleOutput('{"verdict":"pass","reason":"ok","resultContent":"accepted"}'),
		{ verdict: "pass", reason: "ok", resultContent: "accepted", feedback: undefined },
	);
	assert.equal(
		parseCheckerRoleOutput('```json\n{"verdict":"revise","reason":"needs work","feedback":"add tests"}\n```').feedback,
		"add tests",
	);
	assert.equal(
		parseCheckerRoleOutput('review result: {"verdict":"fail","reason":"bad","resultContent":"failed"} end').verdict,
		"fail",
	);

	const jsonish = parseCheckerRoleOutput('{"verdict":"pass","reason":"符合"连续3次问好"的核心目标","resultContent":"## 验收通过\\n\\n完成。"}');
	assert.equal(jsonish.verdict, "pass");
	assert.match(jsonish.reason, /连续3次问好/);
	assert.match(jsonish.resultContent ?? "", /验收通过/);

	assert.deepEqual(
		parseCheckerRoleOutput('{"verdict":"unknown","reason":"bad"}'),
		{ verdict: "fail", reason: "checker output parse error: invalid verdict", resultContent: '{"verdict":"unknown","reason":"bad"}' },
	);
	assert.deepEqual(
		parseCheckerRoleOutput("not json"),
		{ verdict: "fail", reason: "checker output parse error", resultContent: "not json" },
	);
});

test("parseWatcherRoleOutput preserves strict, jsonish, and fallback behavior", () => {
	assert.deepEqual(
		parseWatcherRoleOutput('{"decision":"accept_task","reason":"ok"}'),
		{ decision: "accept_task", reason: "ok", revisionMode: undefined, feedback: undefined },
	);

	const jsonish = parseWatcherRoleOutput('{"decision":"request_revision","reason":"缺少"引用证据"","revisionMode":"redo","feedback":"补充来源"}');
	assert.equal(jsonish.decision, "request_revision");
	assert.equal(jsonish.revisionMode, "redo");
	assert.match(jsonish.reason, /引用证据/);
	assert.equal(jsonish.feedback, "补充来源");

	assert.deepEqual(
		parseWatcherRoleOutput('{"decision":"done","reason":"bad"}'),
		{ decision: "confirm_failed", reason: "watcher output parse error: invalid decision" },
	);
	assert.deepEqual(
		parseWatcherRoleOutput("not json"),
		{ decision: "confirm_failed", reason: "watcher output parse error" },
	);
});

test("decomposer prompt and parser preserve schema, no_split, and safe fallback behavior", () => {
	const input: DecomposerInput = {
		runId: "run_1",
		plan: makePlan({ goal: { text: "Investigate domains" } }),
		task: makeTask({
			id: "reverse_dns",
			title: "Reverse DNS lookup",
			input: { text: "Check reverse DNS" },
			acceptance: { rules: ["must cite sources"] },
			decomposer: { mode: "propagate", maxChildren: 5 },
		}),
		maxChildren: 5,
	};
	const prompt = buildDecomposerPrompt(input);
	assert.ok(prompt.includes("Investigate domains"));
	assert.ok(prompt.includes("Reverse DNS lookup"));
	assert.ok(prompt.includes("propagate"));
	assert.ok(prompt.includes('"decision":"split|no_split"'));

	assert.deepEqual(
		parseDecomposerRoleOutput('{"decision":"no_split","reason":"small enough"}', 5),
		{ decision: "no_split", reason: "small enough", children: [] },
	);
	const split = parseDecomposerRoleOutput(
		'{"decision":"split","reason":"needs steps","children":[{"id":"collect_ips","title":"Collect IPs","input":{"text":"Collect known IPs"},"acceptance":{"rules":["IPs listed"]},"decomposer":{"mode":"none"}}]}',
		5,
	);
	assert.equal(split.decision, "split");
	assert.equal(split.children?.[0]?.id, "collect_ips");
	assert.equal(split.children?.[0]?.decomposer?.mode, "none");

	assert.deepEqual(
		parseDecomposerRoleOutput('{"decision":"split","reason":"bad","children":[{"id":"child_1","title":"Child","input":{"text":"do"},"acceptance":{"rules":["ok"]},"decomposer":{"mode":"leaf","maxChildren":21}}]}', 5),
		{ decision: "no_split", reason: "decomposer output parse error: invalid schema", children: [] },
	);
	assert.deepEqual(
		parseDecomposerRoleOutput("not json", 5),
		{ decision: "no_split", reason: "decomposer output parse error", children: [] },
	);
});

test("buildFinalizerPrompt preserves authoritative run summary and skipped task wording", () => {
	const prompt = buildFinalizerPrompt(
		makePlan({ goal: { text: "Medtrum investigation" } }),
		[
			{ taskId: "t_ok", status: "succeeded", resultRef: null, errorSummary: null, resultContent: "done" },
			{ taskId: "t_skip", status: "skipped", resultRef: null, errorSummary: null, previousErrorSummary: "worker timeout", resultContent: null },
			{ taskId: "t_fail", status: "failed", resultRef: null, errorSummary: "some error", resultContent: null },
		],
		{ totalTasks: 3, succeededTasks: 1, failedTasks: 1, cancelledTasks: 0, skippedTasks: 1 },
	);

	assert.ok(prompt.includes("总任务数：3"));
	assert.ok(prompt.includes("成功：1"));
	assert.ok(prompt.includes("跳过：1"));
	assert.ok(prompt.includes("失败：1"));
	assert.ok(prompt.includes("不得") && prompt.includes("重新计算"));
	assert.ok(prompt.includes("t_skip: 跳过"));
	assert.ok(!prompt.includes("t_skip: 失败"));
	assert.ok(prompt.includes("原始错误"));
});
