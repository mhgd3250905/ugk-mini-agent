import type { FastifyReply } from "fastify";
import { buildTaskWarnings } from "./task-validation.js";

export function sendTaskResponse(
	reply: FastifyReply,
	task: Awaited<ReturnType<import("./task-store.js").TaskStore["create"]>>,
): void {
	reply.send({ task, warnings: buildTaskWarnings(task) });
}
