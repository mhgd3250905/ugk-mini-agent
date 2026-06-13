import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";
import Fastify from "fastify";
import { sendInternalError } from "../src/routes/http-errors.js";

test("sendInternalError logs the original error while returning a generic response", async () => {
	const logs: string[] = [];
	const logStream = new Writable({
		write(chunk, _encoding, callback) {
			logs.push(String(chunk));
			callback();
		},
	});
	const app = Fastify({
		logger: {
			level: "error",
			stream: logStream,
		},
	});

	app.get("/boom", async (_request, reply) => {
		try {
			throw new Error("boom at E:\\AII\\private\\servers.json");
		} catch (error) {
			return sendInternalError(reply, error);
		}
	});

	const response = await app.inject({
		method: "GET",
		url: "/boom",
	});

	assert.equal(response.statusCode, 500);
	assert.deepEqual(response.json(), {
		error: {
			code: "INTERNAL_ERROR",
			message: "Internal server error",
		},
	});
	assert.doesNotMatch(response.body, /E:\\AII\\private\\servers\.json/);
	const logEntry = JSON.parse(logs.join("")) as { err?: { message?: string }; msg?: string };
	assert.equal(logEntry.msg, "Route handler failed");
	assert.equal(logEntry.err?.message, "boom at E:\\AII\\private\\servers.json");
	await app.close();
});
