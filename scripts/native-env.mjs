import { readFile } from "node:fs/promises";
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

export async function loadNativeEnv(projectRoot = process.cwd(), baseEnv = process.env) {
	try {
		const content = await readFile(join(projectRoot, ".env.native"), "utf8");
		return {
			...parseNativeEnv(content),
			...baseEnv,
		};
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return { ...baseEnv };
		}
		throw error;
	}
}
