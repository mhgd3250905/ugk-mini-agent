import type {
	TeamWorklistItem,
	TeamWorklistRecord,
	TeamWorklistResultsRecord,
	TeamWorklistResultStatus,
} from "./types.js";

export interface WorklistValidationOptions {
	allowEmpty?: boolean;
}

export interface WorklistResultsValidationOptions {
	requireFullCoverage?: boolean;
	allowEmpty?: boolean;
}

const WORKLIST_RESULT_STATUSES = new Set<TeamWorklistResultStatus>(["succeeded", "failed", "cancelled", "missing"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, message: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(message);
	}
	return value;
}

function assertOptionalStringArray(value: unknown, message: string): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim())) {
		throw new Error(message);
	}
	return value;
}

function assertOptionalMetadata(value: unknown): Record<string, unknown> | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) throw new Error("metadata must be an object");
	return value;
}

function normalizeWorklistItem(raw: unknown, index: number): TeamWorklistItem {
	if (!isRecord(raw)) throw new Error(`items[${index}] must be an object`);
	const id = assertNonEmptyString(raw.id, `items[${index}].id is required`);
	const title = assertNonEmptyString(raw.title, `items[${index}].title is required`);
	if (!Object.hasOwn(raw, "input")) throw new Error(`items[${index}].input is required`);
	const acceptanceHints = assertOptionalStringArray(raw.acceptanceHints, `items[${index}].acceptanceHints must contain only non-empty strings`);
	return {
		id,
		title,
		input: raw.input,
		...(acceptanceHints ? { acceptanceHints } : {}),
	};
}

export function validateTeamWorklist(value: unknown, options: WorklistValidationOptions = {}): TeamWorklistRecord {
	if (!isRecord(value)) throw new Error("worklist must be an object");
	if (value.schemaVersion !== "team/worklist-1") throw new Error("schemaVersion must be team/worklist-1");
	const worklistId = assertNonEmptyString(value.worklistId, "worklistId is required");
	const title = assertNonEmptyString(value.title, "title is required");
	if (!Array.isArray(value.items)) throw new Error("items must be an array");
	if (value.items.length === 0 && options.allowEmpty !== true) throw new Error("items must not be empty");
	const ids = new Set<string>();
	const items = value.items.map((item, index) => {
		const normalized = normalizeWorklistItem(item, index);
		if (ids.has(normalized.id)) throw new Error(`duplicate worklist item id: ${normalized.id}`);
		ids.add(normalized.id);
		return normalized;
	});
	const metadata = assertOptionalMetadata(value.metadata);
	return {
		schemaVersion: "team/worklist-1",
		worklistId,
		title,
		items,
		...(metadata ? { metadata } : {}),
	};
}

function assertInteger(value: unknown, name: string): number {
	if (!Number.isInteger(value) || (value as number) < 0) {
		throw new Error(`${name} must be a non-negative integer`);
	}
	return value as number;
}

function normalizeResult(raw: unknown, index: number) {
	if (!isRecord(raw)) throw new Error(`results[${index}] must be an object`);
	const itemId = assertNonEmptyString(raw.itemId, `results[${index}].itemId is required`);
	if (typeof raw.status !== "string" || !WORKLIST_RESULT_STATUSES.has(raw.status as TeamWorklistResultStatus)) {
		throw new Error(`results[${index}].status is invalid`);
	}
	const status = raw.status as TeamWorklistResultStatus;
	const generatedTaskId = raw.generatedTaskId === undefined ? undefined : assertNonEmptyString(raw.generatedTaskId, `results[${index}].generatedTaskId must be a non-empty string`);
	const generatedRunId = raw.generatedRunId === undefined ? undefined : assertNonEmptyString(raw.generatedRunId, `results[${index}].generatedRunId must be a non-empty string`);
	const resultRef = raw.resultRef == null ? undefined : assertNonEmptyString(raw.resultRef, `results[${index}].resultRef must be a non-empty string`);
	const content = raw.content === undefined ? undefined : assertNonEmptyString(raw.content, `results[${index}].content must be a non-empty string`);
	const errorSummary = raw.errorSummary == null ? undefined : assertNonEmptyString(raw.errorSummary, `results[${index}].errorSummary must be a non-empty string`);
	if (status === "succeeded" && !resultRef && !content) {
		throw new Error(`results[${index}] succeeded result requires content or resultRef`);
	}
	if (status !== "succeeded" && !errorSummary) {
		throw new Error(`results[${index}] ${status} result requires errorSummary`);
	}
	return {
		itemId,
		status,
		...(generatedTaskId !== undefined ? { generatedTaskId } : {}),
		...(generatedRunId !== undefined ? { generatedRunId } : {}),
		...(resultRef !== undefined ? { resultRef } : {}),
		...(content !== undefined ? { content } : {}),
		...(errorSummary !== undefined ? { errorSummary } : {}),
	};
}

export function validateTeamWorklistResults(value: unknown, options: WorklistResultsValidationOptions = {}): TeamWorklistResultsRecord {
	if (!isRecord(value)) throw new Error("worklist results must be an object");
	if (value.schemaVersion !== "team/worklist-results-1") throw new Error("schemaVersion must be team/worklist-results-1");
	const sourceWorklist = validateTeamWorklist(value.sourceWorklist, { allowEmpty: options.allowEmpty });
	if (!isRecord(value.summary)) throw new Error("summary must be an object");
	if (!Array.isArray(value.results)) throw new Error("results must be an array");
	const results = value.results.map(normalizeResult);
	const sourceIds = new Set(sourceWorklist.items.map(item => item.id));
	const resultIds = new Set<string>();
	for (const result of results) {
		if (!sourceIds.has(result.itemId)) throw new Error(`result itemId does not exist in sourceWorklist: ${result.itemId}`);
		if (resultIds.has(result.itemId)) throw new Error(`duplicate result itemId: ${result.itemId}`);
		resultIds.add(result.itemId);
	}
	if (options.requireFullCoverage !== false) {
		for (const item of sourceWorklist.items) {
			if (!resultIds.has(item.id)) throw new Error(`missing result for worklist item: ${item.id}`);
		}
	}
	const summary = {
		totalItems: assertInteger(value.summary.totalItems, "summary.totalItems"),
		succeeded: assertInteger(value.summary.succeeded, "summary.succeeded"),
		failed: assertInteger(value.summary.failed, "summary.failed"),
		cancelled: assertInteger(value.summary.cancelled, "summary.cancelled"),
		missing: assertInteger(value.summary.missing, "summary.missing"),
	};
	const actualSummary = {
		totalItems: sourceWorklist.items.length,
		succeeded: results.filter(result => result.status === "succeeded").length,
		failed: results.filter(result => result.status === "failed").length,
		cancelled: results.filter(result => result.status === "cancelled").length,
		missing: results.filter(result => result.status === "missing").length,
	};
	for (const [key, expected] of Object.entries(actualSummary)) {
		if (summary[key as keyof typeof summary] !== expected) {
			throw new Error(`summary.${key} does not match actual results`);
		}
	}
	const createdAt = assertNonEmptyString(value.createdAt, "createdAt is required");
	return {
		schemaVersion: "team/worklist-results-1",
		sourceWorklist,
		summary,
		results,
		createdAt,
	};
}

export function parseJsonDocument(content: string): unknown {
	const trimmed = content.trim();
	try {
		return JSON.parse(trimmed);
	} catch {
		// Fall through to fenced or embedded JSON extraction.
	}
	const fenceMatch = trimmed.match(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i)
		?? trimmed.match(/```json\s*([\s\S]*?)```/i);
	if (fenceMatch) return JSON.parse(fenceMatch[1]!.trim());
	const braceStart = trimmed.indexOf("{");
	const braceEnd = trimmed.lastIndexOf("}");
	if (braceStart !== -1 && braceEnd > braceStart) {
		return JSON.parse(trimmed.slice(braceStart, braceEnd + 1));
	}
	throw new Error("no parseable JSON object found");
}

export function parseTeamWorklistContent(content: string, options: WorklistValidationOptions = {}): TeamWorklistRecord {
	return validateTeamWorklist(parseJsonDocument(content), options);
}

export function parseTeamWorklistResultsContent(content: string, options: WorklistResultsValidationOptions = {}): TeamWorklistResultsRecord {
	return validateTeamWorklistResults(parseJsonDocument(content), options);
}
