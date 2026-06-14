import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { registerPlaygroundRoute } from "../src/routes/playground.js";
import { renderUpdatePage } from "../src/ui/update-page.js";

test("system update page renders clone updater controls", () => {
	const page = renderUpdatePage();

	assert.match(page, /系统更新/);
	assert.match(page, /当前版本/);
	assert.match(page, /远程版本/);
	assert.match(page, /检查更新/);
	assert.match(page, /安装更新/);
	assert.match(page, /\/v1\/system\/update\/status/);
	assert.match(page, /\/v1\/system\/update\/apply/);
	assert.match(page, /blockingChanges/);
	assert.match(page, /restartRequired/);
	assert.match(page, /重启服务/);
});

test("GET /playground/update serves the system update page", async (t) => {
	const app = Fastify({ logger: false });
	registerPlaygroundRoute(app, { projectRoot: process.cwd() });
	t.after(() => {
		void app.close();
	});

	const response = await app.inject({ method: "GET", url: "/playground/update" });

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /text\/html/);
	assert.match(response.body, /系统更新/);
	assert.match(response.body, /\/v1\/system\/update\/status/);
});
