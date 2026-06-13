import type { BrowserInstance } from "./browser-instance.js";
import {
	CdpBrowserTargetUsageReader,
	type BrowserTargetUsage,
	type BrowserTargetUsageReader,
} from "./browser-target-usage.js";

export interface BrowserTargetStatus {
	targetId: string;
	type: string;
	title: string;
	url: string;
	attached?: boolean;
	usage?: BrowserTargetUsage;
}

export interface BrowserRuntimeStatus {
	browser: BrowserInstance;
	online: boolean;
	cdpUrl: string;
	version?: {
		browser?: string;
		protocolVersion?: string;
		webSocketDebuggerUrl?: string;
	};
	targets: BrowserTargetStatus[];
	capabilities: {
		closeTarget: boolean;
		start: boolean;
		restart: boolean;
		memory: boolean;
	};
	message?: string;
}

export interface BrowserControlServiceOptions {
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
	usageReader?: BrowserTargetUsageReader;
}

export class BrowserControlService {
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;
	private readonly usageReader: BrowserTargetUsageReader;

	constructor(options: BrowserControlServiceOptions = {}) {
		this.fetchImpl = options.fetchImpl ?? fetch;
		this.timeoutMs = options.timeoutMs ?? 3000;
		this.usageReader = options.usageReader ?? new CdpBrowserTargetUsageReader();
	}

	async getStatus(browser: BrowserInstance): Promise<BrowserRuntimeStatus> {
		const cdpUrl = resolveBrowserCdpUrl(browser);
		try {
			const [version, targets] = await Promise.all([
				this.fetchJson<Record<string, unknown>>(`${cdpUrl}/json/version`),
				this.fetchJson<unknown[]>(`${cdpUrl}/json/list`),
			]);
			const normalizedTargets = normalizeTargets(targets);
			return {
				browser,
				online: true,
				cdpUrl,
				version: {
					browser: readString(version.Browser),
					protocolVersion: readString(version["Protocol-Version"]),
					webSocketDebuggerUrl: readString(version.webSocketDebuggerUrl),
				},
				targets: await collectTargetUsage(normalizedTargets, this.usageReader),
				capabilities: buildCapabilities(),
			};
		} catch (error) {
			return {
				browser,
				online: false,
				cdpUrl,
				targets: [],
				capabilities: buildCapabilities(),
				message: error instanceof Error ? error.message : "Chrome CDP unavailable",
			};
		}
	}

	async closeTarget(browser: BrowserInstance, targetId: string): Promise<{ closed: boolean; targetId: string }> {
		const normalizedTargetId = targetId.trim();
		if (!normalizedTargetId) {
			throw new Error("targetId must not be blank");
		}
		const response = await this.fetchWithTimeout(`${resolveBrowserCdpUrl(browser)}/json/close/${encodeURIComponent(normalizedTargetId)}`);
		if (!response.ok) {
			throw new Error(`Chrome close target failed with HTTP ${response.status}`);
		}
		return { closed: true, targetId: normalizedTargetId };
	}

	async start(_browser: BrowserInstance): Promise<{ started: boolean; supported: boolean; message: string }> {
		return {
			started: false,
			supported: false,
			message: "当前服务没有内置浏览器启动器；请先启动对应 Chrome CDP 实例，后续可接入受控 actuator。",
		};
	}

	private async fetchJson<T>(url: string): Promise<T> {
		const response = await this.fetchWithTimeout(url);
		if (!response.ok) {
			throw new Error(`Chrome CDP returned HTTP ${response.status}`);
		}
		return (await response.json()) as T;
	}

	private async fetchWithTimeout(url: string): Promise<Response> {
		const signal = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(this.timeoutMs) : undefined;
		return await this.fetchImpl(url, { signal });
	}
}

export function resolveBrowserCdpUrl(browser: Pick<BrowserInstance, "cdpHost" | "cdpPort">): string {
	return `http://${browser.cdpHost}:${browser.cdpPort}`;
}

interface BrowserTargetStatusInternal extends BrowserTargetStatus {
	webSocketDebuggerUrl?: string;
}

function normalizeTargets(value: unknown): BrowserTargetStatusInternal[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.filter((target): target is Record<string, unknown> => Boolean(target) && typeof target === "object")
		.map((target) => ({
			targetId: readString(target.id) || "",
			type: readString(target.type) || "unknown",
			title: readString(target.title) || "",
			url: readString(target.url) || "",
			webSocketDebuggerUrl: readString(target.webSocketDebuggerUrl),
			...(typeof target.attached === "boolean" ? { attached: target.attached } : {}),
		}))
		.filter((target) => target.targetId)
		.sort((left, right) => left.type.localeCompare(right.type) || left.targetId.localeCompare(right.targetId));
}

async function collectTargetUsage(
	targets: BrowserTargetStatusInternal[],
	usageReader: BrowserTargetUsageReader,
): Promise<BrowserTargetStatus[]> {
	return await Promise.all(
		targets.map(async (target) => {
			const { webSocketDebuggerUrl, ...publicTarget } = target;
			if (target.type !== "page") {
				return publicTarget;
			}
			if (!webSocketDebuggerUrl) {
				return { ...publicTarget, usage: { available: false } };
			}
			return {
				...publicTarget,
				usage: await usageReader.readUsage(webSocketDebuggerUrl),
			};
		}),
	);
}

function buildCapabilities(): BrowserRuntimeStatus["capabilities"] {
	return {
		closeTarget: true,
		start: false,
		restart: false,
		memory: false,
	};
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
