import type { BrowserInstance, BrowserListResult } from "./browser-instance.js";

type BrowserRegistryEnv = Record<string, string | undefined>;

export interface BrowserRegistry {
	readonly defaultBrowserId: string;
	list(): BrowserInstance[];
	get(browserId: string): BrowserInstance | undefined;
	toJSON(): BrowserListResult;
}

interface BrowserInstanceInput {
	browserId?: unknown;
	name?: unknown;
	cdpHost?: unknown;
	cdpPort?: unknown;
	guiUrl?: unknown;
	profileLabel?: unknown;
}

const DEFAULT_BROWSER_ID = "default";
const DEFAULT_CDP_HOST = "172.31.250.10";
const DEFAULT_CDP_PORT = 9223;
const DEFAULT_GUI_PORT = 3901;
const DEFAULT_PROFILE_LABEL = "native-chrome";

export function isValidBrowserId(browserId: string): boolean {
	return /^[a-z][a-z0-9-]{0,62}$/.test(browserId);
}

export function createBrowserRegistryFromEnv(env: BrowserRegistryEnv = process.env): BrowserRegistry {
	if (env.WEB_ACCESS_BROWSER_PROVIDER?.trim().toLowerCase() === "disabled") {
		return createDisabledBrowserRegistry();
	}
	const explicitInstances = parseBrowserInstancesJson(env.UGK_BROWSER_INSTANCES_JSON);
	if (
		explicitInstances.length === 0 &&
		env.UGK_DISABLE_BROWSER_SIDECAR_DEFAULT?.trim().toLowerCase() === "true" &&
		!env.WEB_ACCESS_CDP_HOST?.trim() &&
		!env.WEB_ACCESS_CDP_PORT?.trim()
	) {
		return createDisabledBrowserRegistry();
	}
	const instances = explicitInstances.length > 0 ? explicitInstances : [createDefaultBrowserInstance(env)];
	const defaultBrowserId = normalizeDefaultBrowserId(env.UGK_DEFAULT_BROWSER_ID, instances);
	return createBrowserRegistry(instances, defaultBrowserId);
}

function createDisabledBrowserRegistry(): BrowserRegistry {
	return {
		defaultBrowserId: "",
		list() {
			return [];
		},
		get() {
			return undefined;
		},
		toJSON() {
			return {
				defaultBrowserId: "",
				browsers: [],
			};
		},
	};
}

export function createBrowserRegistry(
	inputInstances: BrowserInstance[],
	defaultBrowserId: string = DEFAULT_BROWSER_ID,
): BrowserRegistry {
	const seen = new Set<string>();
	const instances = inputInstances.map((instance) => normalizeBrowserInstance(instance));
	if (instances.length === 0) {
		throw new Error("At least one browser instance is required");
	}
	for (const instance of instances) {
		if (seen.has(instance.browserId)) {
			throw new Error(`duplicate browserId: ${instance.browserId}`);
		}
		seen.add(instance.browserId);
	}
	if (!seen.has(defaultBrowserId)) {
		throw new Error(`default browserId is not configured: ${defaultBrowserId}`);
	}

	function withDefaultFlag(instance: BrowserInstance): BrowserInstance {
		return {
			...instance,
			isDefault: instance.browserId === defaultBrowserId,
		};
	}

	return {
		defaultBrowserId,
		list() {
			return instances.map(withDefaultFlag);
		},
		get(browserId: string) {
			const instance = instances.find((entry) => entry.browserId === browserId);
			return instance ? withDefaultFlag(instance) : undefined;
		},
		toJSON() {
			return {
				defaultBrowserId,
				browsers: instances.map(withDefaultFlag),
			};
		},
	};
}

function parseBrowserInstancesJson(raw: string | undefined): BrowserInstance[] {
	const trimmed = raw?.trim();
	if (!trimmed) {
		return [];
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch (error) {
		const message = error instanceof Error ? error.message : "invalid JSON";
		throw new Error(`UGK_BROWSER_INSTANCES_JSON is invalid: ${message}`);
	}
	if (!Array.isArray(parsed)) {
		throw new Error("UGK_BROWSER_INSTANCES_JSON must be a JSON array");
	}
	return parsed.map((entry) => normalizeBrowserInstanceInput(entry));
}

function normalizeBrowserInstanceInput(input: unknown): BrowserInstance {
	if (!input || typeof input !== "object") {
		throw new Error("browser instance must be an object");
	}
	const entry = input as BrowserInstanceInput;
	return normalizeBrowserInstance({
		browserId: String(entry.browserId ?? ""),
		name: typeof entry.name === "string" ? entry.name : String(entry.name ?? ""),
		cdpHost: typeof entry.cdpHost === "string" ? entry.cdpHost : String(entry.cdpHost ?? ""),
		cdpPort: parsePort(entry.cdpPort, "cdpPort"),
		...(typeof entry.guiUrl === "string" && entry.guiUrl.trim() ? { guiUrl: entry.guiUrl.trim() } : {}),
		...(typeof entry.profileLabel === "string" && entry.profileLabel.trim()
			? { profileLabel: entry.profileLabel.trim() }
			: {}),
	});
}

function normalizeBrowserInstance(instance: BrowserInstance): BrowserInstance {
	const browserId = String(instance.browserId || "").trim();
	if (!isValidBrowserId(browserId)) {
		throw new Error("browserId must start with a lowercase letter and contain only lowercase letters, digits, or hyphens");
	}
	const cdpHost = String(instance.cdpHost || "").trim();
	if (!cdpHost) {
		throw new Error(`browser ${browserId} cdpHost must not be blank`);
	}
	const cdpPort = parsePort(instance.cdpPort, `browser ${browserId} cdpPort`);
	return {
		browserId,
		name: String(instance.name || "").trim() || browserId,
		cdpHost,
		cdpPort,
		...(instance.guiUrl?.trim() ? { guiUrl: instance.guiUrl.trim() } : {}),
		...(instance.profileLabel?.trim() ? { profileLabel: instance.profileLabel.trim() } : {}),
	};
}

function createDefaultBrowserInstance(env: BrowserRegistryEnv): BrowserInstance {
	const cdpHost = env.WEB_ACCESS_CDP_HOST?.trim() || DEFAULT_CDP_HOST;
	const cdpPort = parseOptionalPort(env.WEB_ACCESS_CDP_PORT) ?? DEFAULT_CDP_PORT;
	const guiPort = parseOptionalPort(env.WEB_ACCESS_BROWSER_GUI_PORT) ?? DEFAULT_GUI_PORT;
	return {
		browserId: DEFAULT_BROWSER_ID,
		name: "Default",
		cdpHost,
		cdpPort,
		guiUrl: `https://127.0.0.1:${guiPort}/`,
		profileLabel: DEFAULT_PROFILE_LABEL,
	};
}

function normalizeDefaultBrowserId(value: string | undefined, instances: BrowserInstance[]): string {
	const browserId = value?.trim() || DEFAULT_BROWSER_ID;
	if (!isValidBrowserId(browserId)) {
		throw new Error("UGK_DEFAULT_BROWSER_ID must start with a lowercase letter and contain only lowercase letters, digits, or hyphens");
	}
	if (!instances.some((instance) => instance.browserId === browserId)) {
		throw new Error(`default browserId is not configured: ${browserId}`);
	}
	return browserId;
}

function parseOptionalPort(value: unknown): number | undefined {
	if (value === undefined || value === null || String(value).trim() === "") {
		return undefined;
	}
	return parsePort(value, "port");
}

function parsePort(value: unknown, fieldName: string): number {
	const parsed = typeof value === "number" ? value : Number(String(value).trim());
	if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
		throw new Error(`${fieldName} must be an integer between 1 and 65535`);
	}
	return parsed;
}
