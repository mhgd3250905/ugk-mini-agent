const VALID_TASK_TYPES = new Set(["normal", "discovery", "for_each"]);
const VALID_DECOMPOSER_MODES = new Set(["none", "leaf", "propagate"]);
const VALID_OUTPUT_CHECK_TYPES = new Set(["json_items", "json_object", "html_fragment", "file_exists"]);
const MAX_DECOMPOSER_CHILDREN = 20;

function validateDecomposerPolicy(policy: unknown, fieldPath: string): void {
	if (policy === undefined) return;
	if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
		throw new Error(`${fieldPath} must be an object`);
	}
	const obj = policy as { mode?: unknown; maxChildren?: unknown };
	if (typeof obj.mode !== "string" || !VALID_DECOMPOSER_MODES.has(obj.mode)) {
		throw new Error(`${fieldPath}.mode must be none, leaf, or propagate`);
	}
	if (obj.maxChildren !== undefined) {
		if (typeof obj.maxChildren !== "number" || !Number.isInteger(obj.maxChildren) || obj.maxChildren < 1 || obj.maxChildren > MAX_DECOMPOSER_CHILDREN) {
			throw new Error(`${fieldPath}.maxChildren must be an integer between 1 and ${MAX_DECOMPOSER_CHILDREN}`);
		}
	}
}

function validateStringArray(value: unknown, fieldPath: string): void {
	if (value === undefined) return;
	if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim())) {
		throw new Error(`${fieldPath} must contain non-empty strings`);
	}
}

function validateOutputCheck(outputCheck: unknown, fieldPath: string): void {
	if (outputCheck === undefined) return;
	if (!outputCheck || typeof outputCheck !== "object" || Array.isArray(outputCheck)) {
		throw new Error(`${fieldPath} must be an object`);
	}
	const obj = outputCheck as {
		type?: unknown;
		outputKey?: unknown;
		requiredFields?: unknown;
		requiredSubstrings?: unknown;
		requiredSelectors?: unknown;
		forbiddenTags?: unknown;
		path?: unknown;
		allowDirectArray?: unknown;
		requireFence?: unknown;
	};
	if (typeof obj.type !== "string" || !VALID_OUTPUT_CHECK_TYPES.has(obj.type)) {
		throw new Error(`${fieldPath}.type must be json_items, json_object, html_fragment, or file_exists`);
	}
	if (obj.outputKey !== undefined && (typeof obj.outputKey !== "string" || !obj.outputKey.trim())) {
		throw new Error(`${fieldPath}.outputKey must be a non-empty string`);
	}
	if (obj.path !== undefined && (typeof obj.path !== "string" || !obj.path.trim())) {
		throw new Error(`${fieldPath}.path must be a non-empty string`);
	}
	if (obj.allowDirectArray !== undefined && typeof obj.allowDirectArray !== "boolean") {
		throw new Error(`${fieldPath}.allowDirectArray must be boolean`);
	}
	if (obj.requireFence !== undefined && typeof obj.requireFence !== "boolean") {
		throw new Error(`${fieldPath}.requireFence must be boolean`);
	}
	validateStringArray(obj.requiredFields, `${fieldPath}.requiredFields`);
	validateStringArray(obj.requiredSubstrings, `${fieldPath}.requiredSubstrings`);
	validateStringArray(obj.requiredSelectors, `${fieldPath}.requiredSelectors`);
	if (obj.forbiddenTags !== undefined) {
		validateStringArray(obj.forbiddenTags, `${fieldPath}.forbiddenTags`);
		const safe = (obj.forbiddenTags as string[]).every(tag => /^[a-zA-Z][a-zA-Z0-9-]*$/.test(tag));
		if (!safe) throw new Error(`${fieldPath}.forbiddenTags must contain safe tag names`);
	}
}

export function validatePlanTasks(tasks: unknown[]): void {
	if (!tasks.length) throw new Error("at least one task is required");
	for (const task of tasks as Array<{
		id?: string; type?: string; title?: string; input?: { text?: string }; acceptance?: { rules?: string[] };
		decomposer?: unknown;
		outputCheck?: unknown;
		discovery?: { outputKey?: string };
		forEach?: { itemsFrom?: string; mode?: string; taskTemplate?: unknown };
	}>) {
		if (!task.id?.trim()) throw new Error("task id is required");
		if (!task.title?.trim()) throw new Error("task title is required");
		if (!task.input?.text?.trim()) throw new Error("task input text is required");
		if (!task.acceptance?.rules?.length) throw new Error("task acceptance rules are required");
		validateDecomposerPolicy(task.decomposer, "task decomposer");
		validateOutputCheck(task.outputCheck, "task outputCheck");
		const taskType = task.type ?? "normal";
		if (!VALID_TASK_TYPES.has(taskType)) throw new Error(`unknown task type: ${taskType}`);
		if (taskType === "discovery") {
			if (!task.discovery?.outputKey?.trim()) throw new Error("discovery task requires discovery.outputKey");
		}
		if (taskType === "for_each") {
			if (!task.forEach?.itemsFrom?.trim()) throw new Error("for_each task requires forEach.itemsFrom");
			const forEachMode = task.forEach.mode;
			if (forEachMode !== "sequential" && forEachMode !== "parallel") throw new Error("for_each task requires forEach.mode 'sequential' or 'parallel'");
			const tmpl = task.forEach.taskTemplate as { title?: string; input?: { text?: string }; acceptance?: { rules?: string[] }; decomposer?: unknown; outputCheck?: unknown } | undefined;
			if (!tmpl?.title?.trim()) throw new Error("for_each task requires forEach.taskTemplate.title");
			if (!tmpl?.input?.text?.trim()) throw new Error("for_each task requires forEach.taskTemplate.input.text");
			if (!tmpl?.acceptance?.rules?.length) throw new Error("for_each task requires forEach.taskTemplate.acceptance.rules");
			validateDecomposerPolicy(tmpl.decomposer, "forEach.taskTemplate.decomposer");
			if (forEachMode === "parallel" && tmpl?.decomposer) {
				const d = tmpl.decomposer as { mode?: string };
				if (d.mode && d.mode !== "none") throw new Error("parallel for_each does not allow forEach.taskTemplate.decomposer with mode 'leaf' or 'propagate'");
			}
			validateOutputCheck(tmpl.outputCheck, "forEach.taskTemplate.outputCheck");
		}
	}
	const ids = (tasks as Array<{ id: string }>).map(t => t.id);
	if (new Set(ids).size !== ids.length) throw new Error("duplicate task id");
}

export function validateCreatePlanInput(input: { title?: string; goal?: { text: string }; tasks?: unknown[]; outputContract?: { text: string }; defaultTeamUnitId?: string }): void {
	if (!input.title?.trim()) throw new Error("plan title is required");
	if (!input.defaultTeamUnitId?.trim()) throw new Error("defaultTeamUnitId is required");
	if (!input.goal?.text?.trim()) throw new Error("goal text is required");
	if (!input.tasks) throw new Error("at least one task is required");
	if (!input.outputContract?.text?.trim()) throw new Error("outputContract text is required");
	validatePlanTasks(input.tasks);
}
