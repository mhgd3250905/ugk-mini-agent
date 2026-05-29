import type { FastifyRequest } from "fastify";

export function idParam(request: FastifyRequest, key: string): string {
	return (request.params as Record<string, string>)[key];
}

export function jsonBody(request: FastifyRequest): Record<string, unknown> {
	return request.body as Record<string, unknown>;
}

export function optionalJsonBody(request: FastifyRequest): Record<string, unknown> | undefined {
	return request.body as Record<string, unknown> | undefined;
}

export function parseIncludeArchived(request: FastifyRequest): boolean {
	const query = request.query as { includeArchived?: string };
	return query.includeArchived === "1" || query.includeArchived === "true";
}
