import type { FastifyInstance } from "fastify";
import { createCloneUpdater, type CloneUpdater, type CloneUpdateApplyResult, type CloneUpdateStatus } from "../system/clone-updater.js";

export interface SystemUpdateRouteDependencies {
	projectRoot: string;
	updater?: CloneUpdater;
}

export function registerSystemUpdateRoutes(app: FastifyInstance, deps: SystemUpdateRouteDependencies): void {
	const updater = deps.updater ?? createCloneUpdater(deps.projectRoot);

	app.get("/v1/system/update/status", async (): Promise<CloneUpdateStatus> => {
		return await updater.getStatus();
	});

	app.post("/v1/system/update/apply", async (_request, reply): Promise<CloneUpdateApplyResult> => {
		const result = await updater.applyUpdate();
		if (!result.ok && result.reason === "dirty_worktree") {
			reply.status(409);
		}
		return result;
	});
}
