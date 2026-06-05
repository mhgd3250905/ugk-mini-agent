import type { ConnExecution, ConnSchedule, ConnTarget } from "../agent/conn-store.js";
import { normalizeArtifactDeliveryInput } from "../agent/artifact-contract.js";

export interface ParsedConnMutationBody {
	title?: string;
	prompt?: string;
	target?: ConnTarget;
	schedule?: ConnSchedule;
	execution?: ConnExecution;
	assetRefs?: string[];
	profileId?: string;
	browserId?: string | null;
	agentSpecId?: string;
	skillSetId?: string;
	modelPolicyId?: string;
	modelProvider?: string;
	modelId?: string;
	upgradePolicy?: "latest" | "pinned" | "manual";
	publicSiteId?: string;
	maxRunMs?: number;
	artifactDelivery?: import("../agent/artifact-contract.js").ArtifactDeliveryConfig;
}

export function parseConnMutationBody(
	body: Record<string, unknown>,
	options: {
		requireTitle?: boolean;
		requirePrompt?: boolean;
		requireSchedule?: boolean;
		resolveDefaultTarget?: boolean;
	},
): { value?: ParsedConnMutationBody; error?: string } {
	const parsed: ParsedConnMutationBody = {};

	const parsedTitle = parseTrimmedTextField(body.title, "title", { required: options.requireTitle });
	if (parsedTitle.error) {
		return { error: parsedTitle.error };
	}
	if (parsedTitle.value !== undefined) {
		parsed.title = parsedTitle.value;
	}

	const parsedPrompt = parseTrimmedTextField(body.prompt, "prompt", { required: options.requirePrompt });
	if (parsedPrompt.error) {
		return { error: parsedPrompt.error };
	}
	if (parsedPrompt.value !== undefined) {
		parsed.prompt = parsedPrompt.value;
	}

	if (body.target === undefined) {
		if (options.resolveDefaultTarget) {
			parsed.target = { type: "task_inbox" };
		}
	} else {
		const parsedTarget = parseTarget(body.target);
		if (parsedTarget.error) {
			return { error: parsedTarget.error };
		}
		parsed.target = parsedTarget.target;
	}

	if (body.schedule !== undefined || options.requireSchedule) {
		const parsedSchedule = parseSchedule(body.schedule);
		if (parsedSchedule.error) {
			return { error: parsedSchedule.error };
		}
		parsed.schedule = parsedSchedule.schedule;
	}

	if (body.execution !== undefined) {
		const parsedExecution = parseExecution(body.execution);
		if (parsedExecution.error) {
			return { error: parsedExecution.error };
		}
		parsed.execution = parsedExecution.execution;
	}

	const parsedAssetRefs = parseAssetRefs(body.assetRefs);
	if (parsedAssetRefs.error) {
		return { error: parsedAssetRefs.error };
	}
	if (body.assetRefs !== undefined) {
		parsed.assetRefs = parsedAssetRefs.assetRefs ?? [];
	}

	for (const fieldName of ["profileId", "agentSpecId", "skillSetId", "modelPolicyId"] as const) {
		const parsedOptionalId = parseOptionalId(body[fieldName], fieldName);
		if (parsedOptionalId.error) {
			return { error: parsedOptionalId.error };
		}
		if (body[fieldName] !== undefined) {
			parsed[fieldName] = parsedOptionalId.value;
		}
	}

	const parsedBrowserId = parseOptionalNullableId(body.browserId, "browserId");
	if (parsedBrowserId.error) {
		return { error: parsedBrowserId.error };
	}
	if (body.browserId !== undefined) {
		parsed.browserId = parsedBrowserId.value;
	}

	const parsedModelProvider = parseOptionalId(body.modelProvider, "modelProvider");
	if (parsedModelProvider.error) {
		return { error: parsedModelProvider.error };
	}
	const parsedModelId = parseOptionalId(body.modelId, "modelId");
	if (parsedModelId.error) {
		return { error: parsedModelId.error };
	}
	if ((body.modelProvider === undefined) !== (body.modelId === undefined)) {
		return { error: 'Fields "modelProvider" and "modelId" must be provided together' };
	}
	if (body.modelProvider !== undefined) {
		parsed.modelProvider = parsedModelProvider.value;
		parsed.modelId = parsedModelId.value;
	}

	const parsedUpgradePolicy = parseUpgradePolicy(body.upgradePolicy);
	if (parsedUpgradePolicy.error) {
		return { error: parsedUpgradePolicy.error };
	}
	if (body.upgradePolicy !== undefined) {
		parsed.upgradePolicy = parsedUpgradePolicy.value;
	}

	const parsedPublicSiteId = parseOptionalId(body.publicSiteId, "publicSiteId");
	if (parsedPublicSiteId.error) {
		return { error: parsedPublicSiteId.error };
	}
	if (body.publicSiteId !== undefined) {
		parsed.publicSiteId = parsedPublicSiteId.value;
	}

	const parsedMaxRunMs = parseMaxRunMs(body.maxRunMs);
	if (parsedMaxRunMs.error) {
		return { error: parsedMaxRunMs.error };
	}
	if (body.maxRunMs !== undefined) {
		parsed.maxRunMs = parsedMaxRunMs.value;
	}

	if (body.artifactDelivery !== undefined) {
		parsed.artifactDelivery = normalizeArtifactDeliveryInput(body.artifactDelivery);
	}

	return { value: parsed };
}

export function parseConnIdList(value: unknown): { connIds?: string[]; error?: string } {
	if (!Array.isArray(value)) {
		return { error: 'Field "connIds" must be an array' };
	}
	const connIds: string[] = [];
	for (const [index, entry] of value.entries()) {
		if (!isNonEmptyString(entry)) {
			return { error: `connIds[${index}] must be a non-empty string` };
		}
		const connId = entry.trim();
		if (!connIds.includes(connId)) {
			connIds.push(connId);
		}
	}
	if (connIds.length === 0) {
		return { error: 'Field "connIds" must include at least one id' };
	}
	if (connIds.length > 100) {
		return { error: 'Field "connIds" must include at most 100 ids' };
	}
	return { connIds };
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function parseTarget(value: unknown): { target?: ConnTarget; error?: string } {
	if (!value || typeof value !== "object") {
		return { error: 'Field "target" must be an object' };
	}

	const target = value as Record<string, unknown>;
	if (target.type === "task_inbox") {
		return { target: { type: "task_inbox" } };
	}
	if (target.type === "conversation" && isNonEmptyString(target.conversationId)) {
		return { target: { type: "conversation", conversationId: target.conversationId.trim() } };
	}
	if (target.type === "feishu_chat" && isNonEmptyString(target.chatId)) {
		return { target: { type: "feishu_chat", chatId: target.chatId.trim() } };
	}
	if (target.type === "feishu_user" && isNonEmptyString(target.openId)) {
		return { target: { type: "feishu_user", openId: target.openId.trim() } };
	}

	return { error: 'Field "target" is invalid' };
}

function parseSchedule(value: unknown): { schedule?: ConnSchedule; error?: string } {
	if (!value || typeof value !== "object") {
		return { error: 'Field "schedule" must be an object' };
	}

	const schedule = value as Record<string, unknown>;
	if (schedule.kind === "once" && isNonEmptyString(schedule.at)) {
		return {
			schedule: {
				kind: "once",
				at: schedule.at.trim(),
				...(isNonEmptyString(schedule.timezone) ? { timezone: schedule.timezone.trim() } : {}),
			},
		};
	}
	if (schedule.kind === "interval" && typeof schedule.everyMs === "number" && Number.isFinite(schedule.everyMs)) {
		return {
			schedule: {
				kind: "interval",
				everyMs: schedule.everyMs,
				...(isNonEmptyString(schedule.startAt) ? { startAt: schedule.startAt.trim() } : {}),
				...(isNonEmptyString(schedule.timezone) ? { timezone: schedule.timezone.trim() } : {}),
			},
		};
	}
	if (schedule.kind === "cron" && isNonEmptyString(schedule.expression)) {
		return {
			schedule: {
				kind: "cron",
				expression: schedule.expression.trim(),
				...(isNonEmptyString(schedule.timezone) ? { timezone: schedule.timezone.trim() } : {}),
			},
		};
	}

	return { error: 'Field "schedule" is invalid' };
}

function parseExecution(value: unknown): { execution?: ConnExecution; error?: string } {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return { error: 'Field "execution" must be an object' };
	}

	const execution = value as Record<string, unknown>;
	if (execution.type === "agent_prompt") {
		return { execution: { type: "agent_prompt" } };
	}
	if (execution.type === "team_group") {
		if (!isNonEmptyString(execution.groupId)) {
			return { error: 'Field "execution.groupId" must be a non-empty string for team_group execution' };
		}
		return { execution: { type: "team_group", groupId: execution.groupId.trim() } };
	}

	return { error: 'Field "execution.type" must be one of "agent_prompt" or "team_group"' };
}

function parseAssetRefs(value: unknown): { assetRefs?: string[]; error?: string } {
	if (value === undefined) {
		return {};
	}
	if (!Array.isArray(value)) {
		return { error: 'Field "assetRefs" must be an array when provided' };
	}

	const assetRefs: string[] = [];
	for (const [index, entry] of value.entries()) {
		if (!isNonEmptyString(entry)) {
			return { error: `assetRefs[${index}] must be a non-empty string` };
		}
		assetRefs.push(entry.trim());
	}
	return { assetRefs };
}

function parseOptionalId(value: unknown, fieldName: string): { value?: string; error?: string } {
	if (value === undefined) {
		return {};
	}
	if (!isNonEmptyString(value)) {
		return { error: `Field "${fieldName}" must be a non-empty string when provided` };
	}
	return { value: value.trim() };
}

function parseOptionalNullableId(value: unknown, fieldName: string): { value?: string | null; error?: string } {
	if (value === undefined) {
		return {};
	}
	if (value === null || value === "") {
		return { value: null };
	}
	if (!isNonEmptyString(value)) {
		return { error: `Field "${fieldName}" must be a non-empty string or null when provided` };
	}
	return { value: value.trim() };
}

function parseUpgradePolicy(value: unknown): { value?: "latest" | "pinned" | "manual"; error?: string } {
	if (value === undefined) {
		return {};
	}
	if (value === "latest" || value === "pinned" || value === "manual") {
		return { value };
	}
	return { error: 'Field "upgradePolicy" must be one of "latest", "pinned", or "manual"' };
}

function parseMaxRunMs(value: unknown): { value?: number; error?: string } {
	if (value === undefined) {
		return {};
	}
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return { error: 'Field "maxRunMs" must be a positive number when provided' };
	}
	return { value: Math.trunc(value) };
}

function parseTrimmedTextField(
	value: unknown,
	fieldName: string,
	options: { required?: boolean } = {},
): { value?: string; error?: string } {
	if (value === undefined) {
		if (options.required) {
			return { error: `Field "${fieldName}" must be a non-empty string` };
		}
		return {};
	}
	if (!isNonEmptyString(value)) {
		return {
			error: `Field "${fieldName}" must be a non-empty string${options.required ? "" : " when provided"}`,
		};
	}
	return { value: value.trim() };
}
