import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerRuntimeDebugRoutes } from "../src/routes/runtime-debug.js";

async function buildRuntimeDebugApp(projectRoot: string) {
	const app = Fastify({ logger: false });
	registerRuntimeDebugRoutes(app, { projectRoot });
	return app;
}

test("GET /v1/debug/runtime reports runtime checks without exposing secrets", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-runtime-debug-"));
	const previousEnv = { ...process.env };
	process.env.PUBLIC_BASE_URL = "http://127.0.0.1:3000";
	process.env.ANTHROPIC_AUTH_TOKEN = "secret-key-that-must-not-leak";

	const app = await buildRuntimeDebugApp(projectRoot);
	try {
		const response = await app.inject({
			method: "GET",
			url: "/v1/debug/runtime",
		});

		assert.equal(response.statusCode, 200);
		const payload = response.json();
		assert.equal(typeof payload.ok, "boolean");
		assert.equal(payload.config.publicBaseUrl, "http://127.0.0.1:3000");
		assert.equal(payload.config.browserProvider, undefined);
		assert.equal(payload.config.webAccessBrowserPublicBaseUrl, undefined);
		assert.ok(Array.isArray(payload.checks));
		assert.ok(payload.checks.some((check: { name?: string }) => check.name === "agent data dir"));
		assert.ok(payload.checks.some((check: { name?: string }) => check.name === "agents data dir"));
		assert.ok(payload.checks.some((check: { name?: string }) => check.name === "skills dir"));
		assert.ok(payload.checks.some((check: { name?: string }) => check.name === "conn sqlite path"));
		assert.ok(payload.checks.some((check: { ok?: boolean }) => check.ok === false));
		assert.doesNotMatch(response.body, /secret-key-that-must-not-leak/);
		assert.doesNotMatch(response.body, /API_KEY/);
		assert.doesNotMatch(response.body, /SECRET/);
	} finally {
		process.env = previousEnv;
		await app.close();
	}
});
