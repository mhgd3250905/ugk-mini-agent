import type { TeamPlan, TeamTask } from "./types.js";

export type TeamPlanTemplateId =
	| "single_agent"
	| "parallel_research"
	| "coding_fix"
	| "deep_research_with_review";

export type TeamPlanTemplateStatus = "supported" | "planned";
export type TeamPlanDraftConfidence = "high" | "medium" | "low";

export type TeamPlanCreatePayload = Omit<TeamPlan, "schemaVersion" | "planId" | "archived" | "createdAt" | "updatedAt" | "runCount">;

export interface TeamPlanTemplateSummary {
	templateId: TeamPlanTemplateId;
	templateLabel: string;
	status: TeamPlanTemplateStatus;
	description: string;
}

export interface TeamPlanDraftRoute {
	templateId: TeamPlanTemplateId;
	templateLabel: string;
	confidence: TeamPlanDraftConfidence;
	reason: string;
	warnings: string[];
}

export interface TeamPlanDraftInput {
	prompt: string;
	defaultTeamUnitId: string;
	preferredTemplateId?: string;
}

export interface TeamPlanDraftResponse extends TeamPlanDraftRoute {
	plan: TeamPlanCreatePayload;
}

const TEMPLATE_REGISTRY: TeamPlanTemplateSummary[] = [
	{
		templateId: "single_agent",
		templateLabel: "单 Agent",
		status: "supported",
		description: "一个普通任务，适合目标明确、不需要拆成多条并行研究的工作。",
	},
	{
		templateId: "parallel_research",
		templateLabel: "并行研究",
		status: "supported",
		description: "先发现条目，再对每个条目并行研究，适合竞品、趋势、资料收集和多对象对比。",
	},
	{
		templateId: "coding_fix",
		templateLabel: "代码修复",
		status: "planned",
		description: "计划中模板；本轮不生成代码修复 Plan。",
	},
	{
		templateId: "deep_research_with_review",
		templateLabel: "深度研究与复核",
		status: "planned",
		description: "计划中模板；本轮不生成多阶段复核研究 Plan。",
	},
];

const RESEARCH_SIGNALS = [
	"调研",
	"研究",
	"搜索",
	"收集",
	"竞品",
	"对比",
	"列表",
	"多个",
	"每个",
	"分别",
	"新闻",
	"趋势",
	"资料",
	"排行",
	"compare",
	"research",
	"survey",
	"market",
	"competitor",
];

const CODE_REPAIR_SIGNALS = [
	"bug",
	"报错",
	"修复",
	"测试失败",
	"tsc",
	"typeerror",
	"ci",
	"lint",
	"编译失败",
];

export function listTeamPlanTemplates(): TeamPlanTemplateSummary[] {
	return TEMPLATE_REGISTRY.map((template) => ({ ...template }));
}

export function routeTeamPlanTemplate(prompt: string): TeamPlanDraftRoute {
	const normalizedPrompt = normalizePrompt(prompt);
	const lowerPrompt = normalizedPrompt.toLocaleLowerCase();
	const codeSignals = matchingSignals(lowerPrompt, CODE_REPAIR_SIGNALS);
	if (codeSignals.length) {
		return route("single_agent", "high", `prompt contains code repair signals: ${codeSignals.join(", ")}`);
	}
	const researchSignals = matchingSignals(lowerPrompt, RESEARCH_SIGNALS);
	if (researchSignals.length) {
		return route("parallel_research", "high", `prompt contains research/list/multi-item signals: ${researchSignals.join(", ")}`);
	}
	return route("single_agent", "low", "no strong supported template signal detected");
}

export function buildTeamPlanDraft(input: TeamPlanDraftInput): TeamPlanDraftResponse {
	const prompt = normalizePrompt(input.prompt);
	if (!input.defaultTeamUnitId?.trim()) {
		throw new Error("defaultTeamUnitId is required");
	}
	const selectedRoute = selectRoute(prompt, input.preferredTemplateId);
	const plan = selectedRoute.templateId === "parallel_research"
		? buildParallelResearchPlan(prompt, input.defaultTeamUnitId)
		: buildSingleAgentPlan(prompt, input.defaultTeamUnitId);
	return { ...selectedRoute, plan };
}

function selectRoute(prompt: string, preferredTemplateId: string | undefined): TeamPlanDraftRoute {
	if (preferredTemplateId != null && String(preferredTemplateId).trim()) {
		const preferred = templateById(String(preferredTemplateId).trim());
		if (!preferred) {
			throw new Error(`unknown template: ${preferredTemplateId}`);
		}
		if (preferred.status !== "supported") {
			throw new Error(`template is not supported: ${preferred.templateId}`);
		}
		return {
			templateId: preferred.templateId,
			templateLabel: preferred.templateLabel,
			confidence: "medium",
			reason: "preferredTemplateId selected supported template",
			warnings: [],
		};
	}
	return routeTeamPlanTemplate(prompt);
}

function buildSingleAgentPlan(prompt: string, defaultTeamUnitId: string): TeamPlanCreatePayload {
	return {
		title: titleFromPrompt("单 Agent", prompt),
		defaultTeamUnitId,
		goal: { text: prompt },
		tasks: [
			{
				id: "task_1",
				title: "完成目标",
				input: {
					text: [
						"请根据用户目标完成任务。",
						"",
						`用户目标：${prompt}`,
					].join("\n"),
				},
				acceptance: {
					rules: [
						"输出必须直接回应用户目标",
						"说明关键结论、依据、风险和下一步建议",
					],
				},
			},
		],
		outputContract: {
			text: "默认输出中文结果，包含结论、依据、风险/未知项和建议下一步。",
		},
	};
}

function buildParallelResearchPlan(prompt: string, defaultTeamUnitId: string): TeamPlanCreatePayload {
	const discoveryTask: TeamTask = {
		id: "discover_items",
		type: "discovery",
		title: "发现研究条目",
		input: {
			text: [
				"请围绕原始用户目标发现需要逐项研究的条目。",
				"",
				`原始用户目标：${prompt}`,
				"",
				"输出必须是可解析的 JSON object，形状如下：",
				'{ "items": [{ "id": "stable-non-empty-string", "title": "...", "summary": "...", "sourceHints": ["..."] }] }',
				"每个 item 必须包含稳定、非空、字符串类型的 id；title 和 summary 应帮助下游研究者理解该条目的边界。",
			].join("\n"),
		},
		acceptance: {
			rules: [
				'输出是可解析 JSON object，且包含 "items" 数组',
				'每个 item 都有稳定、非空、字符串类型的 "id"',
				"每个 item 尽量包含 title、summary 和可选 sourceHints",
			],
		},
		discovery: { outputKey: "items" },
	};
	const researchTask: TeamTask = {
		id: "research_each",
		type: "for_each",
		title: "并行研究每个条目",
		input: { text: "Runtime expands this task for every discovered item." },
		acceptance: { rules: ["每个生成子任务都必须只研究自己绑定的 source item"] },
		forEach: {
			itemsFrom: "discover_items.items",
			mode: "parallel",
			taskTemplate: {
				title: "研究 {{item.title}}",
				input: {
					text: [
						"Research exactly one source item from the discovery output.",
						"",
						"Source item identity:",
						"- id: {{item.id}}",
						"- title: {{item.title}}",
						"- summary: {{item.summary}}",
						"- sourceHints: {{item.sourceHints}}",
						"",
						`Original user goal: ${prompt}`,
						"",
						"Do not switch to a different item even if shared context mentions other candidates.",
						"请输出中文研究结果，包含关键事实、差异点、来源线索、风险/未知项和建议下一步。",
					].join("\n"),
				},
				acceptance: {
					rules: [
						"结果必须绑定当前 source item 的 id 与 title",
						"不得混入其他 item 的主体结论",
						"说明来源线索、风险/未知项和建议下一步",
					],
				},
			},
		},
	};
	return {
		title: titleFromPrompt("并行研究", prompt),
		defaultTeamUnitId,
		goal: { text: prompt },
		tasks: [discoveryTask, researchTask],
		outputContract: {
			text: "输出中文最终研究报告，包含执行摘要、逐项发现、适用时的对比表、来源说明、风险/未知项和建议下一步。",
		},
	};
}

function normalizePrompt(prompt: string): string {
	const normalized = String(prompt ?? "").trim();
	if (!normalized) {
		throw new Error("prompt is required");
	}
	return normalized;
}

function route(templateId: TeamPlanTemplateId, confidence: TeamPlanDraftConfidence, reason: string): TeamPlanDraftRoute {
	const template = templateById(templateId);
	if (!template) {
		throw new Error(`unknown template: ${templateId}`);
	}
	return {
		templateId,
		templateLabel: template.templateLabel,
		confidence,
		reason,
		warnings: [],
	};
}

function templateById(templateId: string): TeamPlanTemplateSummary | undefined {
	return TEMPLATE_REGISTRY.find((template) => template.templateId === templateId);
}

function matchingSignals(prompt: string, signals: string[]): string[] {
	return signals.filter((signal) => prompt.includes(signal));
}

function titleFromPrompt(prefix: string, prompt: string): string {
	const compact = prompt.replace(/\s+/g, " ");
	return `${prefix}：${compact.length > 36 ? compact.slice(0, 36) + "..." : compact}`;
}
