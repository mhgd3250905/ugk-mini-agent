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

test("GET / renders the public product homepage", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/html/);
	assert.match(response.body, /UGK Mini Agent/);
	assert.match(response.body, /本机部署的 Agent 工作台/);
	assert.match(response.body, /Official project/);
	assert.match(response.body, /本机优先的 AI Agent 工作台/);
	assert.doesNotMatch(response.body, /<h1 id="hero-title">UGK Mini Agent<\/h1>/);
	assert.match(response.body, /\/ugk-claw-logo\.svg/);
	assert.match(response.body, /把 Chat、Team Console、Conn 后台任务/);
	assert.match(response.body, /三步完成本机部署/);
	assert.match(response.body, /检查必要配置/);
	assert.match(response.body, /安装依赖/);
	assert.match(response.body, /启动服务/);
	assert.match(response.body, /Node\.js 22/);
	assert.match(response.body, /Python 3\.11/);
	assert.match(response.body, /--port &lt;端口&gt;/);
	assert.match(response.body, /--host 0\.0\.0\.0/);
	assert.match(response.body, /MCP、FRP、域名和反向代理属于部署方配置/);
	assert.match(response.body, /一个轻量但完整的 Agent 运行台/);
	assert.match(response.body, /主 Agent 对话/);
	assert.match(response.body, /任务画布/);
	assert.match(response.body, /后台任务/);
	assert.match(response.body, /多 Agent 配置/);
	assert.match(response.body, /真实产品界面/);
	assert.match(response.body, /从源码开始使用/);
	assert.match(response.body, /Chat 工作台/);
	assert.match(response.body, /Team Console/);
	assert.match(response.body, /GitHub 仓库/);
	assert.match(response.body, /Gitee 国内镜像/);
	assert.match(response.body, /快速安装/);
	assert.match(response.body, /反馈问题/);
	assert.match(response.body, /版本记录/);
	assert.match(response.body, /href="https:\/\/github\.com\/mhgd3250905\/ugk-mini-agent"/);
	assert.match(response.body, /href="https:\/\/gitee\.com\/ksheng3250905\/ugk-mini-agent"/);
	assert.match(response.body, /href="https:\/\/github\.com\/mhgd3250905\/ugk-mini-agent\/issues"/);
	assert.match(response.body, /href="https:\/\/github\.com\/mhgd3250905\/ugk-mini-agent\/releases"/);
	assert.doesNotMatch(response.body, /\$BASE_URL/);
	assert.doesNotMatch(response.body, /href="\/playground/);
	assert.doesNotMatch(response.body, />打开 \/playground/);
	assert.doesNotMatch(response.body, /5174 画布/);
	assert.doesNotMatch(response.body, /5174/);
	assert.doesNotMatch(response.body, /3000/);
	assert.doesNotMatch(response.body, /127\.0\.0\.1/);
	assert.doesNotMatch(response.body, /开发端口/);
	assert.doesNotMatch(response.body, /本地服务运行后/);
	assert.match(response.body, /\/site-assets\/chat\.png/);
	assert.match(response.body, /\/site-assets\/canvas\.png/);
	assert.match(response.body, /\/site-assets\/conn\.png/);
	assert.match(response.body, /\/site-assets\/model-sources\.png/);
	assert.match(response.body, /\/site-assets\/agent-profile\.png/);
	assert.match(response.body, /canvas\.png[^>]+fetchpriority="high"/);
	assert.match(response.body, /chat\.png[^>]+loading="lazy"/);
	await app.close();
});

test("GET /site-assets/:fileName serves the latest screenshots and bundled fallback assets", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/site-assets/chat.png",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^image\/png/);
	assert.ok(response.rawPayload.length > 1000);

	for (const fileName of [
		"canvas.png",
		"conn.png",
		"model-sources.png",
		"agent-profile.png",
		"team-console-hero.png",
	]) {
		const assetResponse = await app.inject({
			method: "GET",
			url: `/site-assets/${fileName}`,
		});

		assert.equal(assetResponse.statusCode, 200);
		assert.match(assetResponse.headers["content-type"] ?? "", /^image\/png/);
		assert.ok(assetResponse.rawPayload.length > 1000);
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
