import type { FastifyReply } from "fastify";

type ErrorRule = readonly (readonly [string, number])[];

export function mapErrorStatus(msg: string, rules: ErrorRule, fallback = 400): number {
	for (const [pattern, status] of rules) {
		if (msg.includes(pattern)) return status;
	}
	return fallback;
}

export function sendMappedError(reply: FastifyReply, err: unknown, rules: ErrorRule, fallback = 400): void {
	const msg = (err as Error).message;
	reply.code(mapErrorStatus(msg, rules, fallback)).send({ error: msg });
}

export function sendNotFound(reply: FastifyReply, label: string): void {
	reply.code(404).send({ error: `${label} not found` });
}
