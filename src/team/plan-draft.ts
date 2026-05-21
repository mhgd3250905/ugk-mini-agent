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

const RESEARCH_INTENT_SIGNALS = [
	"调研",
	"研究",
	"搜索",
	"收集",
	"整理",
	"梳理",
	"盘点",
	"比较",
	"竞品",
	"对比",
	"compare",
	"research",
	"survey",
	"benchmark",
];

const MULTI_OBJECT_RESEARCH_SIGNALS = [
	"竞品",
	"对比",
	"横向",
	"列表",
	"多个",
	"多项",
	"每个",
	"每家",
	"每款",
	"分别",
	"新闻",
	"趋势",
	"资料",
	"排行",
	"榜单",
	"供应商",
	"工具",
	"产品",
	"公司",
	"方案",
	"alternatives",
	"benchmark",
	"pricing",
	"market",
	"market map",
	"competitor",
	"vendor",
	"vendors",
	"tool",
	"tools",
	"product",
	"products",
	"company",
	"companies",
	"landscape",
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
	const codeSignals = matchingCodeRepairSignals(lowerPrompt);
	if (codeSignals.length) {
		return route("single_agent", "high", `prompt contains code repair signals: ${codeSignals.join(", ")}`);
	}
	const researchSignals = matchingSignals(lowerPrompt, RESEARCH_INTENT_SIGNALS);
	const multiObjectSignals = matchingSignals(lowerPrompt, MULTI_OBJECT_RESEARCH_SIGNALS);
	if (multiObjectSignals.length && (researchSignals.length || hasStrongMultiObjectSignal(multiObjectSignals))) {
		return route("parallel_research", "high", `prompt contains multi-item research signals: ${dedupe([...researchSignals, ...multiObjectSignals]).join(", ")}`);
	}
	if (researchSignals.length) {
		return route("single_agent", "medium", `prompt contains research intent without clear multi-item scope: ${researchSignals.join(", ")}`);
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
				"优先输出 3 到 8 个高价值 item，除非用户目标明确要求更多或更少。",
				"",
				`原始用户目标：${prompt}`,
				"",
				"输出必须是可解析的 JSON object，形状如下：",
				'{ "items": [{ "id": "stable-ascii-slug", "title": "...", "summary": "...", "sourceHints": ["..."], "whyItMatters": "...", "compareDimensions": ["..."] }] }',
				"每个 item 的 id 必须是稳定、非空、字符串类型的 ASCII slug，便于 child task ID 和审计。",
				"title 和 summary 必须帮助下游研究者理解该条目的边界；sourceHints、whyItMatters、compareDimensions 可用于提示来源和横向比较维度。",
			].join("\n"),
		},
		acceptance: {
			rules: [
				'输出是可解析 JSON object，且包含 "items" 数组',
				"items 默认包含 3 到 8 个高价值条目，除非用户目标明确要求不同数量",
				'每个 item 都有稳定、非空、字符串类型的 ASCII slug "id"',
				"每个 item 至少包含 title 和 summary，并尽量包含 sourceHints、whyItMatters、compareDimensions",
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
						"- whyItMatters: {{item.whyItMatters}}",
						"- compareDimensions: {{item.compareDimensions}}",
						"",
						`Original user goal: ${prompt}`,
						"",
						"Do not switch to a different item even if shared context mentions other candidates. 不得切换到其他 item。",
						"请按以下结构输出中文 Markdown：",
						"## 结论",
						"## 关键事实",
						"## 来源线索",
						"## 与目标相关的差异点",
						"## 风险/未知项",
						"## 下一步",
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
			text: "输出中文最终研究报告，包含执行摘要、逐项发现表格、横向对比、来源线索、风险/未知项和建议。明确区分事实、推断和仍需确认的信息。",
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

function matchingCodeRepairSignals(prompt: string): string[] {
	return CODE_REPAIR_SIGNALS.filter((signal) => {
		if (signal === "ci") return /\bci\b/.test(prompt);
		return prompt.includes(signal);
	});
}

function hasStrongMultiObjectSignal(signals: string[]): boolean {
	return signals.some((signal) => !["工具", "产品", "公司", "方案", "tool", "product", "company"].includes(signal));
}

function dedupe(values: string[]): string[] {
	return Array.from(new Set(values));
}

function titleFromPrompt(prefix: string, prompt: string): string {
	const compact = prompt.replace(/\s+/g, " ");
	return `${prefix}：${compact.length > 36 ? compact.slice(0, 36) + "..." : compact}`;
}
