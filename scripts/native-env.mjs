import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function parseNativeEnv(content) {
	const values = {};
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}
		const separatorIndex = trimmed.indexOf("=");
		if (separatorIndex < 0) {
			continue;
		}
		const key = trimmed.slice(0, separatorIndex).trim();
		const value = trimmed.slice(separatorIndex + 1).trim();
		if (key) {
			values[key] = value;
		}
	}
	return values;
}

export function loadDefaultNativeEnvSync(projectRoot = process.cwd()) {
	for (const root of [projectRoot, process.cwd()]) {
		try {
			return parseNativeEnv(readFileSync(join(root, ".env.native.example"), "utf8"));
		} catch {
			// Try the next candidate root.
		}
	}
	return {};
}

export async function loadNativeEnv(projectRoot = process.cwd(), baseEnv = process.env) {
	const defaultEnv = loadDefaultNativeEnvSync(projectRoot);
	try {
		const content = await readFile(join(projectRoot, ".env.native"), "utf8");
		const nativeEnv = parseNativeEnv(content);
		const merged = {
			...defaultEnv,
			...nativeEnv,
			...baseEnv,
		};
		if (
			(nativeEnv.PORT || baseEnv.PORT) &&
			!nativeEnv.PUBLIC_BASE_URL &&
			!baseEnv.PUBLIC_BASE_URL
		) {
			delete merged.PUBLIC_BASE_URL;
		}
		return {
			...merged,
		};
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			const merged = { ...defaultEnv, ...baseEnv };
			if (baseEnv.PORT && !baseEnv.PUBLIC_BASE_URL) {
				delete merged.PUBLIC_BASE_URL;
			}
			return merged;
		}
		throw error;
	}
}
