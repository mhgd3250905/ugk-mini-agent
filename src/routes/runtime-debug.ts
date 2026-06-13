import type { FastifyInstance } from "fastify";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { getAppConfig } from "../config.js";
import type { RuntimeDebugCheckBody, RuntimeDebugResponseBody } from "../types/api.js";

interface RuntimeDebugRouteDependencies {
	projectRoot?: string;
}

async function checkPath(name: string, path: string, mode: number = constants.R_OK): Promise<RuntimeDebugCheckBody> {
	try {
		await access(path, mode);
		return { name, ok: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : `Path is not accessible: ${path}`;
		return { name, ok: false, message };
	}
}

function runtimeSkillsDir(projectRoot: string): string {
	return process.env.UGK_RUNTIME_SKILLS_USER_DIR?.trim() || join(projectRoot, "runtime", "skills-user");
}

export function registerRuntimeDebugRoutes(app: FastifyInstance, deps: RuntimeDebugRouteDependencies = {}): void {
	app.get("/v1/debug/runtime", async (): Promise<RuntimeDebugResponseBody> => {
		const config = getAppConfig(deps.projectRoot);
		const checks = await Promise.all([
			checkPath("agent data dir", config.agentDataDir, constants.R_OK | constants.W_OK),
			checkPath("agents data dir", config.agentsDataDir, constants.R_OK | constants.W_OK),
			checkPath("agent sessions dir", config.agentSessionsDir, constants.R_OK | constants.W_OK),
			checkPath("skills dir", runtimeSkillsDir(config.projectRoot), constants.R_OK),
			checkPath("conn sqlite path", config.connDataDir, constants.R_OK | constants.W_OK),
		]);

		return {
			ok: checks.every((check) => check.ok),
			checks,
			config: {
				...(config.publicBaseUrl ? { publicBaseUrl: config.publicBaseUrl } : {}),
			},
		};
	});
}
