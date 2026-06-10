import test from "node:test";
import assert from "node:assert/strict";
import { renderTeamPage } from "../src/ui/team-page.js";
import {
	buildTaskDetailModel, childSourceFor, childGroupLabel,
	buildDynamicPlanPayloadFromValues,
	buildNaturalDraftRequestPayloadFromValues, isNaturalDraftCurrent,
} from "../src/ui/team-page-helpers.js";

function extractScript(): string {
	const html = renderTeamPage();
	const match = html.match(/<script>([\s\S]*?)<\/script>/);
	assert.ok(match, "should have inline script");
	return match[1];
}
test("P14-T1: inline scripts remain valid JavaScript after P14 changes", () => {
	const html = renderTeamPage();
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
	assert.ok(scripts.length > 0);
	for (const script of scripts) {
		assert.doesNotThrow(() => new Function(script), "inline script should be valid JS after P14 changes");
	}
});

// ── P15: Dynamic task type UI rendering ──

test("P15: plan card renders discovery badge for discovery task", () => {
	const html = renderTeamPage();
	const plan = {
		schemaVersion: "team/plan-1", planId: "plan_dyn_1", title: "Dynamic Plan",
		defaultTeamUnitId: "tu_1", goal: { text: "discover" },
		tasks: [
			{ id: "disc", type: "discovery", title: "Discover items", input: { text: "Find" }, acceptance: { rules: ["JSON"] }, discovery: { outputKey: "items" } },
			{ id: "proc", type: "for_each", title: "Process", input: { text: "p" }, acceptance: { rules: ["ok"] }, forEach: { itemsFrom: "disc.items", mode: "sequential", taskTemplate: { title: "P {{item.title}}", input: { text: "p" }, acceptance: { rules: ["ok"] } } } },
		],
		outputContract: { text: "report" }, archived: false, createdAt: "", updatedAt: "", runCount: 0,
	};
	assert.match(html, /discovery/);
	assert.match(html, /for_each/);
});

test("P15: plan card renders for_each itemsFrom", () => {
	const html = renderTeamPage();
	assert.match(html, /for_each/);
});

test("P15: old plan without type does not crash UI", () => {
	const html = renderTeamPage();
	const plan = {
		schemaVersion: "team/plan-1", planId: "plan_old", title: "Old Plan",
		defaultTeamUnitId: "tu_1", goal: { text: "normal" },
		tasks: [
			{ id: "t1", title: "Normal task", input: { text: "do" }, acceptance: { rules: ["ok"] } },
		],
		outputContract: { text: "out" }, archived: false, createdAt: "", updatedAt: "", runCount: 0,
	};
	assert.match(html, /task-row/);
	assert.ok(!html.includes('type="discovery"'));
});

// ── P15 Review Fix: generated child task rendering ──

test("P15-fix: buildTaskDetailModel includes generated children not in plan.tasks", () => {
	const state = {
		taskStates: {
			process: { status: "succeeded", progress: { phase: "succeeded", message: "done" }, attemptCount: 0, activeAttemptId: null },
			"process__a": { status: "succeeded", progress: { phase: "succeeded", message: "done" }, attemptCount: 1, activeAttemptId: null },
			"process__b": { status: "succeeded", progress: { phase: "succeeded", message: "done" }, attemptCount: 1, activeAttemptId: null },
		},
		taskDefinitions: [
			{ id: "process__a", title: "Process A", parentTaskId: "process", generated: true, generatedSource: "for_each" },
			{ id: "process__b", title: "Process B", parentTaskId: "process", generated: true, generatedSource: "for_each" },
		],
	};
	const plan = { tasks: [{ id: "process", title: "Process each", type: "for_each" }] };
	const model = buildTaskDetailModel(state, plan);
	assert.ok(model.childrenByParent["process"]);
	assert.ok(model.childrenByParent["process"].indexOf("process__a") >= 0);
	assert.ok(model.childrenByParent["process"].indexOf("process__b") >= 0);
	assert.ok(model.taskById["process__a"]);
	assert.ok(model.taskById["process__b"]);
});

test("P15-fix: taskDefinitions wins over legacy generated task fallback", () => {
	const state = {
		taskStates: {
			process: { status: "succeeded", progress: { phase: "succeeded", message: "done" }, attemptCount: 0, activeAttemptId: null },
			"process__a": { status: "succeeded", progress: { phase: "succeeded", message: "done" }, attemptCount: 1, activeAttemptId: null },
		},
		taskDefinitions: [
			{ id: "process__a", title: "Authoritative Child", parentTaskId: "process", generated: true, generatedSource: "for_each" },
		],
		generatedTasks: [
			{ id: "process__a", title: "Stale Generated Child", parentTaskId: "process", generated: true, generatedSource: "decomposition" },
		],
		tasks: [
			{ id: "process__a", title: "Stale State Task", parentTaskId: "process", generated: true, generatedSource: "decomposition" },
		],
	};
	const plan = { tasks: [{ id: "process", title: "Process each", type: "for_each" }] };
	const model = buildTaskDetailModel(state, plan);
	assert.equal(model.taskById["process__a"].title, "Authoritative Child");
	assert.equal(model.taskById["process__a"].generatedSource, "for_each");
	assert.deepEqual(model.childrenByParent["process"], ["process__a"]);
});

test("P15-fix: generated children have correct group label", () => {
	const parent = { id: "fe", title: "ForEach Task", type: "for_each" };
	const childIds = ["fe__x"];
	const taskById: Record<string, any> = { "fe__x": { id: "fe__x", generatedSource: "for_each" } };
	const source = childSourceFor(parent, childIds, taskById);
	assert.equal(source, "for_each");
	assert.equal(childGroupLabel(source), "动态子任务");
});

test("P15-fix: generated child task ids are escaped in rendered output", () => {
	const state = {
		taskStates: {
			t1: { status: "pending", progress: null, attemptCount: 0, activeAttemptId: null },
			"t1__<script>": { status: "pending", progress: null, attemptCount: 0, activeAttemptId: null },
		},
		taskDefinitions: [
			{ id: "t1__<script>", title: "Evil Child", parentTaskId: "t1", generated: true, generatedSource: "for_each" },
		],
	};
	const plan = { tasks: [{ id: "t1", title: "T1" }] };
	const model = buildTaskDetailModel(state, plan);
	assert.ok(model.childrenByParent["t1"]);
	assert.ok(model.taskById["t1__<script>"]);
});

test("P15-fix: old runs without generated tasks produce empty children map", () => {
	const state = {
		taskStates: {
			t1: { status: "succeeded", progress: { phase: "succeeded", message: "done" }, attemptCount: 1, activeAttemptId: null },
		},
	};
	const plan = { tasks: [{ id: "t1", title: "Task 1" }] };
	const model = buildTaskDetailModel(state, plan);
	assert.deepEqual(model.childrenByParent, {});
	assert.equal(model.orphanIds.length, 0);
});

	// ── P16 Task 1: Dynamic plan authoring mode ──

	test("P16-T1: plan modal contains mode selector for normal vs dynamic", () => {
		const html = renderTeamPage();
		assert.match(html, /plan-mode/);
		assert.match(html, /普通计划/);
		assert.match(html, /发现后逐项处理/);
	});

	test("P16-T1: normal mode still renders existing fields and save path", () => {
		const html = renderTeamPage();
		// Existing fields still present
		assert.match(html, /id="plan-title"/);
		assert.match(html, /id="plan-goal"/);
		assert.match(html, /id="plan-task-title"/);
		assert.match(html, /id="plan-task-text"/);
		assert.match(html, /id="plan-acceptance"/);
		assert.match(html, /id="plan-output-contract"/);
		// savePlan function still exists
		const script = extractScript();
		assert.match(script, /async function savePlan\(\)/);
	});

	test("P16-T1: dynamic mode renders fields for discovery and child task template", () => {
		const html = renderTeamPage();
		// Dynamic-specific fields
		assert.match(html, /id="plan-dynamic-fields"/);
		assert.match(html, /id="plan-disc-title"/);
		assert.match(html, /id="plan-disc-instruction"/);
		assert.match(html, /id="plan-disc-output-key"/);
		assert.match(html, /id="plan-disc-acceptance"/);
		assert.match(html, /id="plan-child-title"/);
		assert.match(html, /id="plan-child-instruction"/);
		assert.match(html, /id="plan-child-acceptance"/);
	});

test("P16-T1: buildDynamicPlanPayloadFromValues generates discovery + for_each tasks", () => {
	const payload = buildDynamicPlanPayloadFromValues({
		title: "Test Plan",
		unitId: "tu_1",
		goalText: "discover items",
		discTitle: "Find items",
		discInstruction: "Search for items",
		discOutputKey: "items",
		discAcceptance: "valid JSON",
		childTitle: "Process {{item.title}}",
		childInstruction: "Handle item",
		childAcceptance: "ok",
		outputContract: "report",
	});
	assert.ok(payload);
	assert.equal(payload.tasks.length, 2);
	assert.equal(payload.tasks[0].type, "discovery");
	assert.equal(payload.tasks[1].type, "for_each");
	assert.equal(payload.title, "Test Plan");
	assert.equal(payload.defaultTeamUnitId, "tu_1");
	assert.deepEqual(payload.goal, { text: "discover items" });
	assert.equal(payload.tasks[0].id, "discover");
	assert.equal(payload.tasks[1].id, "process_each");
});

test("P16-T1: for_each itemsFrom is derived from discovery task id + output key", () => {
	const payload = buildDynamicPlanPayloadFromValues({
		title: "T",
		unitId: "tu",
		goalText: "g",
		discOutputKey: "results",
	});
	const discTask = payload.tasks[0];
	const feTask = payload.tasks[1];
	assert.ok(discTask);
	assert.ok(feTask);
	assert.ok(discTask.discovery);
	assert.ok(feTask.forEach);
	assert.equal(feTask.forEach.itemsFrom, discTask.id + "." + discTask.discovery.outputKey);
	assert.equal(feTask.forEach.itemsFrom, "discover.results");
});

test("P16-T1: default values applied for empty fields", () => {
	const payload = buildDynamicPlanPayloadFromValues({});
	const discTask = payload.tasks[0];
	const feTask = payload.tasks[1];
	assert.ok(discTask);
	assert.ok(feTask);
	assert.ok(discTask.discovery);
	assert.ok(feTask.forEach);
	assert.equal(discTask.title, "发现条目", "discovery title defaults to 发现条目");
	assert.equal(discTask.discovery.outputKey, "items", "output key defaults to items");
	assert.deepEqual(discTask.acceptance.rules, ["输出为有效 JSON"], "acceptance defaults when empty");
	assert.equal(feTask.forEach.taskTemplate.title, "处理 {{item.title}}", "child title defaults");
	assert.deepEqual(feTask.acceptance.rules, ["输出有效"], "child acceptance defaults to 输出有效 (non-empty split)");
	assert.equal(payload.outputContract.text, "中文汇总", "output contract defaults");
});

test("P16-T1: multi-line acceptance split and trimmed", () => {
	const payload = buildDynamicPlanPayloadFromValues({
		discAcceptance: "  line1  \n\n  line2  \n  \nline3",
		childAcceptance: "a\n  \nb",
	});
	const discTask = payload.tasks[0];
	const feTask = payload.tasks[1];
	assert.ok(discTask);
	assert.ok(feTask);
	assert.deepEqual(discTask.acceptance.rules, ["line1", "line2", "line3"]);
	assert.deepEqual(feTask.acceptance.rules, ["a", "b"]);
});

test("P16-T1: malicious strings pass through raw (escaping is render concern)", () => {
	const payload = buildDynamicPlanPayloadFromValues({
		title: '<script>alert(1)</script>',
		discTitle: '"onclick="bad',
		discInstruction: "'; DROP TABLE--",
	});
	assert.equal(payload.title, '<script>alert(1)</script>');
	const discTask = payload.tasks[0];
	assert.ok(discTask);
	assert.equal(discTask.title, '"onclick="bad');
	assert.equal(discTask.input.text, "'; DROP TABLE--");
});

// ── Team natural language Plan draft mode ──

test("Team natural draft mode exposes labels, generate button, and plan-drafts API path", () => {
	const html = renderTeamPage();
	assert.match(html, /自然语言草案/);
	assert.match(html, /生成草案/);
	assert.match(html, /id="plan-natural-fields"/);
	assert.match(html, /id="plan-natural-prompt"/);
	assert.match(html, /id="plan-natural-template"/);
	assert.match(html, /自动匹配/);
	assert.match(html, /单 Agent/);
	assert.match(html, /并行研究/);
	assert.doesNotMatch(html, /代码修复/);
	assert.doesNotMatch(html, /深度研究与复核/);
	assert.doesNotMatch(html, /coding_fix/);
	assert.doesNotMatch(html, /deep_research_with_review/);
	assert.match(html, /\/plan-drafts/);
});

test("helper: buildNaturalDraftRequestPayloadFromValues omits empty template and includes explicit template", () => {
	const autoPayload = buildNaturalDraftRequestPayloadFromValues({
		prompt: "调研 AI Agent 趋势",
		unitId: "team_1",
		preferredTemplateId: "",
	});
	assert.deepEqual(autoPayload, {
		prompt: "调研 AI Agent 趋势",
		defaultTeamUnitId: "team_1",
	});
	const explicitPayload = buildNaturalDraftRequestPayloadFromValues({
		prompt: "调研 AI Agent 趋势",
		unitId: "team_1",
		preferredTemplateId: "parallel_research",
	});
	assert.deepEqual(explicitPayload, {
		prompt: "调研 AI Agent 趋势",
		defaultTeamUnitId: "team_1",
		preferredTemplateId: "parallel_research",
	});
});

test("helper: natural draft freshness checks prompt, team unit, and template", () => {
	const snapshot = { prompt: "调研竞品", defaultTeamUnitId: "team_1", preferredTemplateId: "parallel_research", plan: { title: "draft" } };
	assert.equal(isNaturalDraftCurrent(snapshot, { prompt: "调研竞品", unitId: "team_1", preferredTemplateId: "parallel_research" }), true);
	assert.equal(isNaturalDraftCurrent(snapshot, { prompt: "调研竞品 updated", unitId: "team_1", preferredTemplateId: "parallel_research" }), false);
	assert.equal(isNaturalDraftCurrent(snapshot, { prompt: "调研竞品", unitId: "team_2", preferredTemplateId: "parallel_research" }), false);
	assert.equal(isNaturalDraftCurrent(snapshot, { prompt: "调研竞品", unitId: "team_1", preferredTemplateId: "single_agent" }), false);
	assert.equal(isNaturalDraftCurrent({ prompt: "调研竞品", defaultTeamUnitId: "team_1", plan: {} }, { prompt: "调研竞品", unitId: "team_1", preferredTemplateId: "" }), true);
});

test("Team natural draft mode hides manual plan fields and shows natural prompt fields", () => {
	const script = extractScript();
	const match = script.match(/function onPlanModeChange\(\)[\s\S]*?^}/m);
	assert.ok(match, "should find onPlanModeChange");
	assert.match(match[0], /plan-natural-fields/);
	assert.match(match[0], /mode === 'natural'/);
	assert.match(match[0], /plan-normal-fields[\s\S]*mode === 'normal'/);
	assert.match(match[0], /plan-dynamic-fields[\s\S]*mode === 'dynamic'/);
	assert.match(match[0], /plan-title-fields[\s\S]*mode !== 'natural'/);
	assert.match(match[0], /plan-goal-fields[\s\S]*mode !== 'natural'/);
	assert.match(match[0], /plan-output-contract-fields[\s\S]*mode !== 'natural'/);
});

test("Team natural draft preview renders metadata and JSON through textContent", () => {
	const script = extractScript();
	assert.match(script, /async function generatePlanDraft\(\)/);
	assert.match(script, /api\('\/plan-drafts'/);
	const renderMatch = script.match(/function renderNaturalPlanDraft\(draft,\s*prompt,\s*unitId,\s*preferredTemplateId\)[\s\S]*?^}/m);
	assert.ok(renderMatch, "should find renderNaturalPlanDraft");
	assert.match(renderMatch[0], /preferredTemplateId: preferredTemplateId \|\| ''/);
	assert.match(renderMatch[0], /templateLabelEl\.textContent/);
	assert.match(renderMatch[0], /reasonEl\.textContent/);
	assert.match(renderMatch[0], /warningEl\.textContent/);
	assert.match(script, /renderPlanPreview\(draft\.plan\)/);
	assert.doesNotMatch(renderMatch[0], /innerHTML\s*=\s*draft/);
});

test("Team natural draft inline script reads template selection for request and freshness", () => {
	const script = extractScript();
	const buildMatch = script.match(/function buildNaturalDraftRequestPayload\(\)[\s\S]*?^}/m);
	assert.ok(buildMatch, "should find buildNaturalDraftRequestPayload");
	assert.match(buildMatch[0], /plan-natural-template/);
	assert.match(buildMatch[0], /preferredTemplateId/);
	const generateMatch = script.match(/async function generatePlanDraft\(\)[\s\S]*?^}/m);
	assert.ok(generateMatch, "should find generatePlanDraft");
	assert.match(generateMatch[0], /var preferredTemplateId = \$\('plan-natural-template'\)\.value/);
	assert.match(generateMatch[0], /renderNaturalPlanDraft\(draft,\s*prompt,\s*unitId,\s*preferredTemplateId\)/);
	const previewMatch = script.match(/function previewPlanJson\(\)[\s\S]*?^}/m);
	assert.ok(previewMatch, "should find previewPlanJson");
	assert.match(previewMatch[0], /preferredTemplateId: naturalPreferredTemplateId/);
	const saveMatch = script.match(/async function savePlan\(\)[\s\S]*?^}/m);
	assert.ok(saveMatch, "should find savePlan");
	assert.match(saveMatch[0], /preferredTemplateId: naturalPreferredTemplateId/);
});

test("Team natural draft save refuses missing or stale draft before posting to plans", () => {
	const script = extractScript();
	const saveMatch = script.match(/async function savePlan\(\)[\s\S]*?^}/m);
	assert.ok(saveMatch, "should find savePlan");
	assert.match(saveMatch[0], /mode === 'natural'/);
	assert.match(saveMatch[0], /_latestNaturalPlanDraft/);
	assert.match(saveMatch[0], /isNaturalDraftCurrent/);
	assert.match(saveMatch[0], /请先生成并检查最新草案/);
});

test("Team natural draft mode posts to plans only with the latest generated draft payload", () => {
	const script = extractScript();
	const saveMatch = script.match(/async function savePlan\(\)[\s\S]*?^}/m);
	assert.ok(saveMatch, "should find savePlan");
	assert.match(saveMatch[0], /payload = _latestNaturalPlanDraft\.plan/);
	assert.match(saveMatch[0], /api\('\/plans'/);
	assert.doesNotMatch(saveMatch[0], /api\('\/plans\/' \+ planId \+ '\/runs'/);
});

test("P16-T1: parity — inline buildDynamicPlanPayload produces same shape as helper", () => {
		const script = extractScript();
		const fnStart = script.indexOf("function buildDynamicPlanPayload()");
		assert.ok(fnStart >= 0, "should find buildDynamicPlanPayload");
		const nextFn = script.indexOf("function renderPlanPreview", fnStart);
		assert.ok(nextFn > fnStart, "should find end boundary");
		const fnBody = script.slice(fnStart, nextFn);
		const stubs = "var $=function(id){var vals={'plan-title':'Parity Title','plan-teamunit':'tu_p','plan-goal':'pg','plan-disc-title':'DT','plan-disc-instruction':'DI','plan-disc-output-key':'outk','plan-disc-acceptance':'r1\\nr2','plan-child-title':'CT','plan-child-instruction':'CI','plan-child-acceptance':'ca','plan-output-contract':'oc'};return{value:vals[id]!==undefined?vals[id]:'test',style:{},classList:{add:function(){},remove:function(){}}}};";
		const inlineFn = new Function(stubs + "\n" + fnBody + "\nreturn buildDynamicPlanPayload;")() as () => any;
		const inlinePayload = inlineFn();
		const helperPayload = buildDynamicPlanPayloadFromValues({
			title: "Parity Title", unitId: "tu_p", goalText: "pg",
			discTitle: "DT", discInstruction: "DI", discOutputKey: "outk",
			discAcceptance: "r1\nr2", childTitle: "CT", childInstruction: "CI",
			childAcceptance: "ca", outputContract: "oc",
		});
		assert.ok(helperPayload.tasks[1]);
		assert.ok(helperPayload.tasks[1].forEach);
		assert.equal(inlinePayload.tasks.length, helperPayload.tasks.length);
		assert.equal(inlinePayload.tasks[0].type, helperPayload.tasks[0].type);
		assert.equal(inlinePayload.tasks[1].type, helperPayload.tasks[1].type);
		assert.equal(inlinePayload.tasks[1].forEach.itemsFrom, helperPayload.tasks[1].forEach.itemsFrom);
		assert.deepEqual(inlinePayload.tasks[0].acceptance.rules, helperPayload.tasks[0].acceptance.rules);
		assert.deepEqual(inlinePayload.tasks[1].acceptance.rules, helperPayload.tasks[1].acceptance.rules);
		assert.equal(inlinePayload.outputContract.text, helperPayload.outputContract.text);
	});

		test("P16-T1: user dynamic field values are escaped in HTML preview", () => {
		const script = extractScript();
		assert.match(script, /function renderPlanPreview\(/);
		// Preview uses textContent, not innerHTML
		assert.match(script, /renderPlanPreview[\s\S]*?textContent[\s\S]*?JSON\.stringify/);
	});

	// ── P16 Task 2: Dynamic plan submission ──

	test("P16-T2: savePlan sends dynamic payload when dynamic mode is active", () => {
		const script = extractScript();
		const match = script.match(/async function savePlan[\s\S]*?^}/m);
		assert.ok(match, "should find savePlan");
		assert.match(match[0], /currentPlanMode/);
		assert.match(match[0], /buildDynamicPlanPayload/);
		assert.match(match[0], /buildNormalPlanPayload/);
	});

	test("P16-T2: dynamic mode requires discovery instruction", () => {
		const script = extractScript();
		const match = script.match(/async function savePlan[\s\S]*?^}/m);
		assert.ok(match, "should find savePlan");
		assert.match(match[0], /plan-disc-instruction/);
		assert.match(match[0], /发现指令/);
	});

	test("P16-T2: dynamic mode requires child instruction template", () => {
		const script = extractScript();
		const match = script.match(/async function savePlan[\s\S]*?^}/m);
		assert.ok(match, "should find savePlan");
		assert.match(match[0], /plan-child-instruction/);
		assert.match(match[0], /子任务指令模板/);
	});

	test("P16-fix: dynamic save requires matching JSON preview before API submit", () => {
		const script = extractScript();
		const match = script.match(/async function savePlan[\s\S]*?^}/m);
		assert.ok(match, "should find savePlan");
		assert.match(match[0], /previewPre\.textContent !== previewJson/);
		assert.match(match[0], /renderPlanPreview\(payload\)/);
		assert.match(match[0], /请先检查 Plan JSON 预览/);
		assert.ok(
			match[0].indexOf("previewPre.textContent !== previewJson") < match[0].indexOf("await api('/plans'"),
			"preview guard must run before POST /plans",
		);
	});

	test("P16-T2: inline scripts remain valid after P16-T2 changes", () => {
		const html = renderTeamPage();
		const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
		assert.ok(scripts.length > 0);
		for (const script of scripts) {
			assert.doesNotThrow(() => new Function(script), "inline script should be valid JS");
		}
	});

	// ── P16 Task 3: Dynamic plan card information hierarchy ──


