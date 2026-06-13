import { readFileSync } from "node:fs";
import { join } from "node:path";

export type NativeEnvMap = Record<string, string | undefined>;

export function parseNativeEnvContent(content: string): Record<string, string> {
	const values: Record<string, string> = {};
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const separatorIndex = trimmed.indexOf("=");
		if (separatorIndex < 0) continue;
		const key = trimmed.slice(0, separatorIndex).trim();
		const value = trimmed.slice(separatorIndex + 1).trim();
		if (key) values[key] = value;
	}
	return values;
}

export function loadDefaultNativeEnv(projectRoot: string = process.cwd()): Record<string, string> {
	for (const root of [projectRoot, process.cwd()]) {
		try {
			return parseNativeEnvContent(readFileSync(join(root, ".env.native.example"), "utf8"));
		} catch {
			// Try the next candidate root.
		}
	}
	return {};
}

function envValue(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function parseRequiredPort(value: string | undefined): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
		throw new Error("PORT must be an integer between 1 and 65535");
	}
	return parsed;
}

export function resolveNativePort(env: NativeEnvMap = process.env, projectRoot: string = process.cwd()): number {
	const defaults = loadDefaultNativeEnv(projectRoot);
	return parseRequiredPort(envValue(env.PORT) ?? defaults.PORT);
}

export function resolveNativeLocalBaseUrl(env: NativeEnvMap = process.env, projectRoot: string = process.cwd()): string {
	const defaults = loadDefaultNativeEnv(projectRoot);
	const publicBaseUrl = envValue(env.PUBLIC_BASE_URL);
	if (publicBaseUrl && publicBaseUrl.toLowerCase() !== "auto") {
		return publicBaseUrl.replace(/\/+$/, "");
	}
	const envPort = envValue(env.PORT);
	if (!envPort) {
		const defaultPublicBaseUrl = envValue(defaults.PUBLIC_BASE_URL);
		if (defaultPublicBaseUrl) return defaultPublicBaseUrl.replace(/\/+$/, "");
	}
	const port = parseRequiredPort(envPort ?? defaults.PORT);
	const rawHost = envValue(env.HOST) ?? defaults.HOST ?? "127.0.0.1";
	const host = rawHost === "0.0.0.0" || rawHost === "::" ? "127.0.0.1" : rawHost;
	const formattedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
	return `http://${formattedHost}:${port}`;
}
