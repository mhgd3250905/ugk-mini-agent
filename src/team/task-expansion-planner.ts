import type { TeamTask, TeamTaskOutputCheck } from "./types.js";

export interface TaskExpansionContext {
	runId: string;
	planId: string;
	parentTask: TeamTask;
	items: Array<Record<string, unknown>>;
}

export interface TaskExpansionResult {
	parentTaskId: string;
	children: TeamTask[];
}

export interface TaskExpansionPlanner {
	expand(context: TaskExpansionContext): Promise<TaskExpansionResult>;
}

function sanitizeIdPart(raw: string): string {
	return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function formatItemValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

function replaceTemplate(
	template: string,
	item: Record<string, unknown>,
	itemJson: string,
	scopedVars: { runId: string; planId: string; parentTaskId: string; outputDir: string },
): string {
	let result = template;
	// Run-scoped: {{run.id}}, {{plan.id}}, {{parentTask.id}}, {{task.outputDir}}
	result = result.replace(/\{\{run\.id\}\}/g, scopedVars.runId);
	result = result.replace(/\{\{plan\.id\}\}/g, scopedVars.planId);
	result = result.replace(/\{\{parentTask\.id\}\}/g, scopedVars.parentTaskId);
	result = result.replace(/\{\{task\.outputDir\}\}/g, scopedVars.outputDir);
	// Generic {{item.<field>}} — replace for any top-level key
	result = result.replace(/\{\{item\.([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g, (_match, field: string) => {
		if (field === "title" && (item[field] === undefined || item[field] === null)) {
			return formatItemValue(item.id);
		}
		return formatItemValue(item[field]);
	});
	// {{item}} — full JSON
	result = result.replace(/\{\{item\}\}/g, itemJson);
	return result;
}

function buildIdentityAcceptanceRules(item: Record<string, unknown>): string[] {
	const itemId = item.id as string;
	const display = item.title ?? item.name ?? item.label;
	const rules = [
		`输出必须对应 item.id="${itemId}" 的任务，不得处理其他 item`,
	];
	if (typeof display === "string" && display !== itemId) {
		rules.push(`输出必须对应"${display}"(item.id="${itemId}")，不得替换为其他条目`);
	}
	return rules;
}

function replaceOutputCheck(
	outputCheck: TeamTaskOutputCheck | undefined,
	item: Record<string, unknown>,
	itemJson: string,
	scopedVars: { runId: string; planId: string; parentTaskId: string; outputDir: string },
): TeamTaskOutputCheck | undefined {
	if (!outputCheck) return undefined;
	const replaceString = (value: string): string => replaceTemplate(value, item, itemJson, scopedVars);
	const replaceStringArray = (values: string[] | undefined): string[] | undefined => values?.map(replaceString);
	switch (outputCheck.type) {
		case "json_items":
			return {
				type: "json_items",
				...(outputCheck.outputKey !== undefined ? { outputKey: replaceString(outputCheck.outputKey) } : {}),
				...(outputCheck.allowDirectArray !== undefined ? { allowDirectArray: outputCheck.allowDirectArray } : {}),
				...(outputCheck.requiredFields !== undefined ? { requiredFields: replaceStringArray(outputCheck.requiredFields) } : {}),
			};
		case "json_object":
			return {
				type: "json_object",
				...(outputCheck.requiredFields !== undefined ? { requiredFields: replaceStringArray(outputCheck.requiredFields) } : {}),
			};
		case "html_fragment":
			return {
				type: "html_fragment",
				...(outputCheck.requiredSubstrings !== undefined ? { requiredSubstrings: replaceStringArray(outputCheck.requiredSubstrings) } : {}),
				...(outputCheck.requiredSelectors !== undefined ? { requiredSelectors: replaceStringArray(outputCheck.requiredSelectors) } : {}),
				...(outputCheck.forbiddenTags !== undefined ? { forbiddenTags: replaceStringArray(outputCheck.forbiddenTags) } : {}),
				...(outputCheck.requireFence !== undefined ? { requireFence: outputCheck.requireFence } : {}),
			};
		case "file_exists":
			return {
				type: "file_exists",
				...(outputCheck.path !== undefined ? { path: replaceString(outputCheck.path) } : {}),
			};
	}
}

export class TemplateTaskExpansionPlanner implements TaskExpansionPlanner {
	async expand(context: TaskExpansionContext): Promise<TaskExpansionResult> {
		const { parentTask, items } = context;
		if (!parentTask.forEach) {
			throw new Error("parent task has no forEach config");
		}

		const seenIds = new Set<string>();
		for (const item of items) {
			if (!item.id || typeof item.id !== "string" || !item.id.trim()) {
				throw new Error("each item must have a stable non-empty string 'id'");
			}
			if (seenIds.has(item.id)) {
				throw new Error(`duplicate item id: ${item.id}`);
			}
			seenIds.add(item.id);
		}

		const template = parentTask.forEach.taskTemplate;
		const scopedVars = {
			runId: context.runId,
			planId: context.planId,
			parentTaskId: parentTask.id,
			outputDir: `.data/team/runs/${context.runId}/generated/${parentTask.id}`,
		};
		const children: TeamTask[] = items.map((item) => {
			const itemId = item.id as string;
			const safeId = sanitizeIdPart(itemId);
			const itemJson = JSON.stringify(item);
			const title = replaceTemplate(template.title, item, itemJson, scopedVars);
			const inputText = replaceTemplate(template.input.text, item, itemJson, scopedVars);
			const acceptanceRules = template.acceptance.rules.map(r => replaceTemplate(r, item, itemJson, scopedVars));
			const identityRules = buildIdentityAcceptanceRules(item);
			const allRules = [...acceptanceRules, ...identityRules];
			const payload = template.input.payload
				? Object.fromEntries(
					Object.entries(template.input.payload).map(([k, v]) => [k, typeof v === "string" ? replaceTemplate(v, item, itemJson, scopedVars) : v]),
				)
				: undefined;
			const outputCheck = replaceOutputCheck(template.outputCheck, item, itemJson, scopedVars);

			return {
				id: `${parentTask.id}__${safeId}`,
				type: "normal" as const,
				title,
				input: { text: inputText, ...(payload ? { payload } : {}) },
				acceptance: { rules: allRules },
				...(outputCheck ? { outputCheck } : {}),
				parentTaskId: parentTask.id,
				sourceItemId: itemId,
				sourceItem: { id: itemId, data: { ...item } },
				generated: true,
			};
		});

		return { parentTaskId: parentTask.id, children };
	}
}
