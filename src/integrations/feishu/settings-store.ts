import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { renameWithTransientRetry } from "../../file-system.js";
import type { FeishuDeliveryTarget } from "./types.js";

export interface FeishuRuntimeSettings {
	enabled: boolean;
	appId?: string;
	appSecret?: string;
	apiBase?: string;
	allowedChatIds: string[];
	activityTargets: FeishuDeliveryTarget[];
	updatedAt?: string;
}

export interface FeishuPublicSettings {
	enabled: boolean;
	appId?: string;
	hasAppSecret: boolean;
	apiBase?: string;
	allowedChatIds: string[];
	activityTargets: FeishuDeliveryTarget[];
	updatedAt?: string;
}

export interface UpdateFeishuSettingsInput {
	enabled?: boolean;
	appId?: string;
	appSecret?: string;
	clearAppSecret?: boolean;
	apiBase?: string;
	allowedChatIds?: string[];
	activityTargets?: FeishuDeliveryTarget[];
}

export class FeishuSettingsStore {
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(private readonly options: { settingsPath: string; env?: NodeJS.ProcessEnv }) {}

	async getRuntimeSettings(): Promise<FeishuRuntimeSettings> {
		const stored = await this.readStoredSettings();
		return mergeFeishuSettingsWithEnv(stored, this.options.env ?? process.env);
	}

	async getPublicSettings(): Promise<FeishuPublicSettings> {
		return toPublicSettings(await this.getRuntimeSettings());
	}

	async update(input: UpdateFeishuSettingsInput): Promise<FeishuPublicSettings> {
		let publicSettings: FeishuPublicSettings | undefined;
		this.writeQueue = this.writeQueue.then(async () => {
			const current = await this.readStoredSettings();
			const next: FeishuRuntimeSettings = {
				enabled: input.enabled ?? current.enabled ?? false,
				appId: normalizeOptionalString(input.appId) ?? current.appId,
				appSecret: input.clearAppSecret ? undefined : normalizeOptionalString(input.appSecret) ?? current.appSecret,
				apiBase: normalizeOptionalString(input.apiBase) ?? current.apiBase,
				allowedChatIds: input.allowedChatIds ? normalizeStringList(input.allowedChatIds) : current.allowedChatIds ?? [],
				activityTargets: input.activityTargets ? normalizeFeishuTargets(input.activityTargets) : current.activityTargets ?? [],
				updatedAt: new Date().toISOString(),
			};
			await this.writeStoredSettings(next);
			publicSettings = toPublicSettings(mergeFeishuSettingsWithEnv(next, this.options.env ?? process.env));
		});
		await this.writeQueue;
		return publicSettings!;
	}

	private async readStoredSettings(): Promise<Partial<FeishuRuntimeSettings>> {
		try {
			const parsed = JSON.parse(await readFile(this.options.settingsPath, "utf8")) as Partial<FeishuRuntimeSettings>;
			return {
				enabled: parsed.enabled === true,
				appId: normalizeOptionalString(parsed.appId),
				appSecret: normalizeOptionalString(parsed.appSecret),
				apiBase: normalizeOptionalString(parsed.apiBase),
				allowedChatIds: normalizeStringList(parsed.allowedChatIds),
				activityTargets: normalizeFeishuTargets(parsed.activityTargets),
				updatedAt: normalizeOptionalString(parsed.updatedAt),
			};
		} catch {
			return {};
		}
	}

	private async writeStoredSettings(settings: FeishuRuntimeSettings): Promise<void> {
		await mkdir(dirname(this.options.settingsPath), { recursive: true });
		const tempPath = `${this.options.settingsPath}.${process.pid}.${randomUUID()}.tmp`;
		await writeFile(tempPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
		await renameWithTransientRetry(tempPath, this.options.settingsPath);
	}
}

export function mergeFeishuSettingsWithEnv(
	settings: Partial<FeishuRuntimeSettings>,
	env: NodeJS.ProcessEnv,
): FeishuRuntimeSettings {
	return {
		enabled: settings.enabled ?? env.FEISHU_ENABLED === "true",
		appId: normalizeOptionalString(settings.appId) ?? normalizeOptionalString(env.FEISHU_APP_ID),
		appSecret: normalizeOptionalString(settings.appSecret) ?? normalizeOptionalString(env.FEISHU_APP_SECRET),
		apiBase: normalizeOptionalString(settings.apiBase) ?? normalizeOptionalString(env.FEISHU_API_BASE),
		allowedChatIds: settings.allowedChatIds?.length ? normalizeStringList(settings.allowedChatIds) : parseCommaSeparated(env.FEISHU_ALLOWED_CHAT_IDS),
		activityTargets: settings.activityTargets?.length
			? normalizeFeishuTargets(settings.activityTargets)
			: [
					...parseCommaSeparated(env.FEISHU_ACTIVITY_CHAT_IDS).map((chatId): FeishuDeliveryTarget => ({ type: "feishu_chat", chatId })),
					...parseCommaSeparated(env.FEISHU_ACTIVITY_OPEN_IDS).map((openId): FeishuDeliveryTarget => ({ type: "feishu_user", openId })),
				],
		updatedAt: normalizeOptionalString(settings.updatedAt),
	};
}

export function toPublicSettings(settings: FeishuRuntimeSettings): FeishuPublicSettings {
	return {
		enabled: settings.enabled,
		...(settings.appId ? { appId: settings.appId } : {}),
		hasAppSecret: Boolean(settings.appSecret),
		...(settings.apiBase ? { apiBase: settings.apiBase } : {}),
		allowedChatIds: [...settings.allowedChatIds],
		activityTargets: settings.activityTargets.map((target) => ({ ...target })),
		...(settings.updatedAt ? { updatedAt: settings.updatedAt } : {}),
	};
}

function parseCommaSeparated(value: string | undefined): string[] {
	return normalizeStringList(value?.split(","));
}

function normalizeOptionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeStringList(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return Array.from(new Set(value.map((item) => normalizeOptionalString(item)).filter((item): item is string => Boolean(item))));
}

function normalizeFeishuTargets(value: unknown): FeishuDeliveryTarget[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const targets: FeishuDeliveryTarget[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object") {
			continue;
		}
		const record = item as Record<string, unknown>;
		if (record.type === "feishu_chat") {
			const chatId = normalizeOptionalString(record.chatId);
			if (chatId) {
				targets.push({ type: "feishu_chat", chatId });
			}
		}
		if (record.type === "feishu_user") {
			const openId = normalizeOptionalString(record.openId);
			if (openId) {
				targets.push({ type: "feishu_user", openId });
			}
		}
	}
	return targets;
}
