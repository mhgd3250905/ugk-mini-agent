import type { FastifyReply } from "fastify";
import type { ErrorResponseBody } from "../types/api.js";

export function sendBadRequest(reply: FastifyReply, message: string): FastifyReply {
	return sendErrorResponse(reply, 400, "BAD_REQUEST", message);
}

export function sendNotFound(reply: FastifyReply, message: string): FastifyReply {
	return sendErrorResponse(reply, 404, "NOT_FOUND", message);
}

export function sendConflict(reply: FastifyReply, message: string): FastifyReply {
	return sendErrorResponse(reply, 409, "CONFLICT", message);
}

export function sendForbidden(reply: FastifyReply, message: string): FastifyReply {
	return sendErrorResponse(reply, 403, "FORBIDDEN", message);
}

export function sendNotImplemented(reply: FastifyReply, message: string): FastifyReply {
	return sendErrorResponse(reply, 501, "NOT_IMPLEMENTED", message);
}

export function sendPayloadTooLarge(reply: FastifyReply, message: string): FastifyReply {
	return sendErrorResponse(reply, 413, "PAYLOAD_TOO_LARGE", message);
}

export function sendInternalError(reply: FastifyReply, error: unknown): FastifyReply {
	reply.log.error({ err: error }, "Route handler failed");
	return sendErrorResponse(reply, 500, "INTERNAL_ERROR", "Internal server error");
}

export function sendAgentBusyError(
	reply: FastifyReply,
	input: {
		message: string;
		agentId: string;
		activeConversationId?: string;
		suggestedAgents?: string[];
	},
): FastifyReply {
	return reply.status(409).send({
		error: {
			code: "AGENT_BUSY",
			message: input.message,
			agentId: input.agentId,
			...(input.activeConversationId ? { activeConversationId: input.activeConversationId } : {}),
			...(input.suggestedAgents ? { suggestedAgents: input.suggestedAgents } : {}),
		},
	} satisfies ErrorResponseBody);
}

function sendErrorResponse(
	reply: FastifyReply,
	statusCode: 400 | 403 | 404 | 409 | 413 | 500 | 501,
	code: ErrorResponseBody["error"]["code"],
	message: string,
): FastifyReply {
	return reply.status(statusCode).send({
		error: {
			code,
			message,
		},
	} satisfies ErrorResponseBody);
}
