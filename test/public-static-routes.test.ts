import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

test("GET /healthz returns ok", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/healthz",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), { ok: true });
	await app.close();
});

test("GET / renders the public Agent Board first homepage", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/html/);
	assert.match(response.body, /UGK CLAW/);
	assert.match(response.body, /让每个 Agent 任务，都可验收/);
	assert.match(response.body, /面向生产环境的 Agent 任务验收与编排工作台/);
	assert.match(response.body, /普通 Agent 对话，不适合直接进生产/);
	assert.match(response.body, /1% 的不可信/);
	assert.match(response.body, /Task 执行，Checker 验收，Workflow 编排/);
	assert.match(response.body, /可信交付，不靠模型自觉/);
	assert.match(response.body, /污染上下文与幻觉风险/);
	assert.match(response.body, /干净 Task 承载 Skill/);
	assert.match(response.body, /Worker 执行并留痕/);
	assert.match(response.body, /Checker 审核后交付/);
	assert.match(response.body, /通过验收的 Task，才进入 Workflow/);
	assert.match(response.body, /从会聊天，变成可交付/);
	assert.match(response.body, /把任务隔离出来/);
	assert.match(response.body, /防止上下文污染/);
	assert.match(response.body, /可信 Task 怎么产生/);
	assert.match(response.body, /亮点在可信交付/);
	assert.match(response.body, /先看为什么可信，再看怎么上手/);
	assert.match(response.body, /本机运行后先从根路径进入/);
	assert.match(response.body, /进入 Team Console/);
	assert.match(response.body, /进入 Chat 工作台/);
	assert.match(response.body, /配置 API 源/);
	assert.match(response.body, /管理 Agent/);
	assert.match(response.body, /Agent 画板/);
	assert.match(response.body, /href="\/playground"/);
	assert.match(response.body, /href="\/playground\/team"/);
	assert.match(response.body, /href="\/playground\/model-sources"/);
	assert.match(response.body, /href="\/playground\/agents"/);
	assert.doesNotMatch(response.body, /\$BASE_URL/);
	assert.match(response.body, /组长 Leader/);
	assert.match(response.body, /执行员 Worker/);
	assert.match(response.body, /审核员 Checker/);
	assert.match(response.body, /拦住幻觉、漏项、偷工减料和伪造证据/);
	assert.match(response.body, /\/playground/);
	assert.doesNotMatch(response.body, /5174 画布/);
	assert.doesNotMatch(response.body, /5174/);
	assert.doesNotMatch(response.body, /3000/);
	assert.doesNotMatch(response.body, /127\.0\.0\.1/);
	assert.doesNotMatch(response.body, /开发端口/);
	assert.doesNotMatch(response.body, /本地服务运行后/);
	assert.match(response.body, /\/site-assets\/team-canvas-product-hero\.png/);
	assert.match(response.body, /\/site-assets\/team-console-hero\.png/);
	assert.match(response.body, /\/site-assets\/agent-role-leader\.png/);
	assert.match(response.body, /\/site-assets\/agent-role-worker\.png/);
	assert.match(response.body, /\/site-assets\/agent-role-checker\.png/);
	assert.match(response.body, /\/site-assets\/capability-create-task\.png/);
	assert.match(response.body, /\/site-assets\/capability-context-materials\.png/);
	assert.match(response.body, /\/site-assets\/capability-role-execute\.png/);
	assert.match(response.body, /\/site-assets\/capability-inspect-evidence\.png/);
	assert.match(response.body, /team-canvas-product-hero\.png[^>]+fetchpriority="high"/);
	assert.match(response.body, /team-console-hero\.png[^>]+loading="lazy"/);
	assert.match(response.body, /agent-role-checker\.png[^>]+loading="lazy"/);
	await app.close();
});

test("GET /site-assets/:fileName serves only bundled public site assets", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/site-assets/team-canvas-product-hero.png",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^image\/png/);
	assert.ok(response.rawPayload.length > 1000);

	const screenshotResponse = await app.inject({
		method: "GET",
		url: "/site-assets/team-console-hero.png",
	});

	assert.equal(screenshotResponse.statusCode, 200);
	assert.match(screenshotResponse.headers["content-type"] ?? "", /^image\/png/);
	assert.ok(screenshotResponse.rawPayload.length > 1000);

	for (const fileName of [
		"agent-role-leader.png",
		"agent-role-worker.png",
		"agent-role-checker.png",
		"capability-create-task.png",
		"capability-context-materials.png",
		"capability-role-execute.png",
		"capability-inspect-evidence.png",
	]) {
		const roleAssetResponse = await app.inject({
			method: "GET",
			url: `/site-assets/${fileName}`,
		});

		assert.equal(roleAssetResponse.statusCode, 200);
		assert.match(roleAssetResponse.headers["content-type"] ?? "", /^image\/png/);
		assert.ok(roleAssetResponse.rawPayload.length > 1000);
	}

	const blockedResponse = await app.inject({
		method: "GET",
		url: "/site-assets/../README.md",
	});
	assert.equal(blockedResponse.statusCode, 404);

	const encodedBlockedResponse = await app.inject({
		method: "GET",
		url: "/site-assets/%2e%2e%2fREADME.md",
	});
	assert.equal(encodedBlockedResponse.statusCode, 404);
	await app.close();
});

test("GET /playground can serve externalized runtime assets", async () => {
	const previousExternalized = process.env.PLAYGROUND_EXTERNALIZED;
	process.env.PLAYGROUND_EXTERNALIZED = "1";
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	try {
		const response = await app.inject({
			method: "GET",
			url: "/playground",
		});

		assert.equal(response.statusCode, 200);
		assert.match(response.headers["content-type"] ?? "", /^text\/html/);
		assert.match(response.body, /<link rel="stylesheet" href="\/playground\/styles\.css" \/>/);
		assert.match(response.body, /<script src="\/playground\/vendor\/marked\.umd\.js"><\/script>/);
		assert.match(response.body, /<script src="\/playground\/app\.js"><\/script>/);
		assert.doesNotMatch(response.body, /function initializePlaygroundAssembler\(\)/);

		const stylesResponse = await app.inject({
			method: "GET",
			url: "/playground/styles.css",
		});
		assert.equal(stylesResponse.statusCode, 200);
		assert.match(stylesResponse.headers["content-type"] ?? "", /^text\/css/);
		assert.match(stylesResponse.body, /\.chat-stage/);

		const scriptResponse = await app.inject({
			method: "GET",
			url: "/playground/app.js",
		});
		assert.equal(scriptResponse.statusCode, 200);
		assert.match(scriptResponse.headers["content-type"] ?? "", /^text\/javascript/);
		assert.match(scriptResponse.body, /function initializePlaygroundAssembler\(\)/);

		const markedResponse = await app.inject({
			method: "GET",
			url: "/playground/vendor/marked.umd.js",
		});
		assert.equal(markedResponse.statusCode, 200);
		assert.match(markedResponse.body, /marked v\d+/);
		assert.match(markedResponse.body, /g\["marked"\]/);
	} finally {
		if (previousExternalized === undefined) {
			delete process.env.PLAYGROUND_EXTERNALIZED;
		} else {
			process.env.PLAYGROUND_EXTERNALIZED = previousExternalized;
		}
		await app.close();
	}
});

test("POST /playground/reset restores externalized runtime files", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	try {
		const response = await app.inject({
			method: "POST",
			url: "/playground/reset",
		});

		assert.equal(response.statusCode, 200);
		const payload = JSON.parse(response.body) as { ok?: boolean; runtimeDir?: string; factoryDir?: string };
		assert.equal(payload.ok, true);
		assert.match(payload.runtimeDir ?? "", /runtime[\\/]playground$/);
		assert.match(payload.factoryDir ?? "", /runtime[\\/]playground-factory$/);
	} finally {
		await app.close();
	}
});
