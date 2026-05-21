import test from "node:test";
import assert from "node:assert/strict";
import {
	buildTeamPlanDraft,
	listTeamPlanTemplates,
	routeTeamPlanTemplate,
} from "../src/team/plan-draft.js";
import { validateCreatePlanInput } from "../src/team/plan-validation.js";

test("parallel_research prompt builds a valid discovery plus parallel for_each create payload", () => {
	const draft = buildTeamPlanDraft({
		prompt: "调研 2026 年 AI 编程 Agent 的主要产品和差异，分别对比每个竞品",
		defaultTeamUnitId: "team_research",
	});

	assert.equal(draft.templateId, "parallel_research");
	assert.equal(draft.confidence, "high");
	validateCreatePlanInput(draft.plan);

	assert.equal(draft.plan.defaultTeamUnitId, "team_research");
	assert.equal(draft.plan.goal.text, "调研 2026 年 AI 编程 Agent 的主要产品和差异，分别对比每个竞品");
	assert.equal(draft.plan.tasks.length, 2);
	assert.equal(draft.plan.tasks[0].id, "discover_items");
	assert.equal(draft.plan.tasks[0].type, "discovery");
	assert.equal(draft.plan.tasks[0].discovery?.outputKey, "items");
	assert.match(draft.plan.tasks[0].input.text, /"items"/);
	assert.match(draft.plan.tasks[0].input.text, /"id"/);

	assert.equal(draft.plan.tasks[1].id, "research_each");
	assert.equal(draft.plan.tasks[1].type, "for_each");
	assert.equal(draft.plan.tasks[1].forEach?.itemsFrom, "discover_items.items");
	assert.equal(draft.plan.tasks[1].forEach?.mode, "parallel");
	assert.match(draft.plan.tasks[1].forEach?.taskTemplate.input.text ?? "", /original user goal/i);
	assert.match(draft.plan.tasks[1].forEach?.taskTemplate.input.text ?? "", /{{item\.id}}/);
});

test("parallel_research child template does not use a forbidden decomposer mode", () => {
	const draft = buildTeamPlanDraft({
		prompt: "收集 AI Agent 趋势资料并列出多个方向",
		defaultTeamUnitId: "team_research",
		preferredTemplateId: "parallel_research",
	});
	const childDecomposer = draft.plan.tasks[1].forEach?.taskTemplate.decomposer;

	assert.ok(!childDecomposer || childDecomposer.mode === "none");
	validateCreatePlanInput(draft.plan);
});

test("preferred supported template overrides a vague prompt", () => {
	const draft = buildTeamPlanDraft({
		prompt: "帮我看看这个方向",
		defaultTeamUnitId: "team_research",
		preferredTemplateId: "parallel_research",
	});

	assert.equal(draft.templateId, "parallel_research");
	assert.equal(draft.reason, "preferredTemplateId selected supported template");
	validateCreatePlanInput(draft.plan);
});

test("code-fix-looking prompt routes away from parallel_research", () => {
	const route = routeTeamPlanTemplate("调研这个 TypeError bug，修复 tsc 编译失败和 CI lint 报错");

	assert.equal(route.templateId, "single_agent");
	assert.match(route.reason, /code repair/i);
});

test("unsupported explicit template IDs fail clearly", () => {
	assert.throws(
		() => buildTeamPlanDraft({
			prompt: "修复一个 bug",
			defaultTeamUnitId: "team_code",
			preferredTemplateId: "coding_fix",
		}),
		/template is not supported: coding_fix/,
	);
});

test("empty prompt fails clearly", () => {
	assert.throws(
		() => buildTeamPlanDraft({ prompt: "  ", defaultTeamUnitId: "team_empty" }),
		/prompt is required/,
	);
});

test("prompt content is preserved as data without HTML escaping", () => {
	const prompt = "研究 <script>alert(1)</script> 与 \"raw\" 数据";
	const draft = buildTeamPlanDraft({
		prompt,
		defaultTeamUnitId: "team_raw",
		preferredTemplateId: "single_agent",
	});

	assert.equal(draft.plan.goal.text, prompt);
	assert.match(draft.plan.tasks[0].input.text, /<script>alert\(1\)<\/script>/);
	assert.doesNotMatch(draft.plan.tasks[0].input.text, /&lt;script&gt;/);
});

test("template list exposes supported and planned templates", () => {
	const templates = listTeamPlanTemplates();
	const byId = new Map(templates.map((template) => [template.templateId, template]));

	assert.equal(byId.get("single_agent")?.status, "supported");
	assert.equal(byId.get("parallel_research")?.status, "supported");
	assert.equal(byId.get("coding_fix")?.status, "planned");
	assert.equal(byId.get("deep_research_with_review")?.status, "planned");
});
