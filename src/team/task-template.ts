import type {
	TeamTaskTemplateConfig,
	TeamTaskTemplateParameter,
	TeamTaskTemplateParameterInputType,
	TeamTaskTemplateState,
} from "./types.js";

export const TEAM_TASK_TEMPLATE_INPUT_TYPES = [
	"text",
	"textarea",
	"email",
	"email_list",
	"number",
	"select",
] as const satisfies readonly TeamTaskTemplateParameterInputType[];

const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

function inputTypeOf(parameter: TeamTaskTemplateParameter): TeamTaskTemplateParameterInputType {
	return parameter.inputType ?? "text";
}

function splitEmailList(value: string): string[] {
	return value
		.split(/[,;\n]+/)
		.map(item => item.trim())
		.filter(Boolean);
}

function normalizeNumber(value: string, parameterId: string): string {
	const normalized = value.trim();
	if (!Number.isFinite(Number(normalized))) {
		throw new Error(`template binding ${parameterId} must be a number`);
	}
	return normalized;
}

function normalizeEmail(value: string, parameterId: string): string {
	const normalized = value.trim();
	if (!EMAIL_PATTERN.test(normalized)) {
		throw new Error(`template binding ${parameterId} must be a valid email address`);
	}
	return normalized;
}

function normalizeEmailList(value: string, parameterId: string): string {
	const emails = splitEmailList(value);
	if (emails.length === 0 || emails.some(email => !EMAIL_PATTERN.test(email))) {
		throw new Error(`template binding ${parameterId} must contain valid email addresses`);
	}
	return emails.join(",");
}

function normalizeSelect(value: string, parameter: TeamTaskTemplateParameter): string {
	const normalized = value.trim();
	const options = parameter.options ?? [];
	if (!options.some(option => option.value === normalized)) {
		throw new Error(`template binding ${parameter.id} must be one of: ${options.map(option => option.value).join(", ")}`);
	}
	return normalized;
}

export function normalizeTemplateBinding(parameter: TeamTaskTemplateParameter, value: string): string {
	switch (inputTypeOf(parameter)) {
		case "email":
			return normalizeEmail(value, parameter.id);
		case "email_list":
			return normalizeEmailList(value, parameter.id);
		case "number":
			return normalizeNumber(value, parameter.id);
		case "select":
			return normalizeSelect(value, parameter);
		case "text":
		case "textarea":
			return value.trim();
	}
}

export function buildTemplateBindings(
	templateConfig: TeamTaskTemplateConfig,
	inputBindings: Record<string, string> | undefined,
): Record<string, string> {
	const raw = inputBindings ?? {};
	const bindings: Record<string, string> = {};
	for (const parameter of templateConfig.parameters) {
		const rawValue = raw[parameter.id] ?? parameter.defaultValue;
		if (typeof rawValue !== "string" || !rawValue.trim()) {
			if (parameter.required !== false) {
				throw new Error(`template binding is required: ${parameter.id}`);
			}
			continue;
		}
		bindings[parameter.id] = normalizeTemplateBinding(parameter, rawValue);
	}
	return bindings;
}

export function buildTemplateRunBindings(
	templateConfig: TeamTaskTemplateConfig,
	templateState: TeamTaskTemplateState | undefined,
	inputBindings: Record<string, string> | undefined,
): Record<string, string> {
	return buildTemplateBindings(templateConfig, {
		...(templateState?.currentBindings ?? {}),
		...(inputBindings ?? {}),
	});
}
