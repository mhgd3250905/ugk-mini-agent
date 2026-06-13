import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import test from "node:test";
import { registerPlaygroundRoute } from "../src/routes/playground.js";

async function buildTeamConsoleRoute() {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-team-console-route-"));
	const distDir = join(projectRoot, "apps", "team-console", "dist");
	await mkdir(join(distDir, "assets"), { recursive: true });
	await writeFile(
		join(distDir, "index.html"),
		[
			"<!doctype html>",
			"<html>",
			"<head><title>Team Console</title></head>",
			"<body><div id=\"root\"></div><script type=\"module\" src=\"/playground/team/assets/app.js\"></script></body>",
			"</html>",
		].join(""),
	);
	await writeFile(join(distDir, "assets", "app.js"), "console.log('team console');");
	const app = Fastify({ logger: false });
	registerPlaygroundRoute(app, { projectRoot });
	return app;
}

test("GET /playground/team serves the bundled Team Console index on the main port", async () => {
	const app = await buildTeamConsoleRoute();

	const response = await app.inject({
		method: "GET",
		url: "/playground/team",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/html/);
	assert.match(response.headers["cache-control"] ?? "", /no-store/);
	assert.match(response.body, /Team Console/);
	assert.match(response.body, /\/playground\/team\/assets\/app\.js/);
});

test("GET /playground/team/assets/* serves bundled Team Console assets", async () => {
	const app = await buildTeamConsoleRoute();

	const response = await app.inject({
		method: "GET",
		url: "/playground/team/assets/app.js",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /javascript/);
	assert.equal(response.body, "console.log('team console');");
});
