import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import type { AgentService } from "../src/agent/agent-service.js";

function createAgentServiceStub(): AgentService {
	return {
		getAgentRunStatus: () => ({ agentId: "main", status: "idle" }),
		getConversationCatalog: async () => ({
			currentConversationId: "manual:main",
			conversations: [],
		}),
	} as unknown as AgentService;
}

test("GET /playground/model-sources renders the API source management page", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/model-sources",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] as string, /text\/html/);
	assert.match(response.body, /API 源管理/);
	assert.match(response.body, /id="provider-list"/);
	assert.match(response.body, /id="usage-body"/);
	assert.match(response.body, /\/v1\/model-sources/);
	assert.match(response.body, /id="provider-api-key"/);
	assert.match(response.body, /源标识/);
	assert.match(response.body, /接口地址/);
	assert.match(response.body, /密钥/);
	assert.match(response.body, /厂商模板/);
	assert.match(response.body, /id="provider-template-select"/);
	assert.match(response.body, /value="deepseek">DeepSeek/);
	assert.match(response.body, /value="zhipu-glm">智谱 GLM/);
	assert.match(response.body, /value="ali-codeplan">阿里 CodePlan/);
	assert.match(response.body, /deepseek-v4-flash/);
	assert.match(response.body, /deepseek-v4-pro/);
	assert.match(response.body, /id="provider-model-rows"/);
	assert.match(response.body, /id="provider-model-add"/);
	assert.match(response.body, /class="ms-select js-model-context-preset"/);
	assert.match(response.body, /class="ms-select js-model-output-preset"/);
	assert.match(response.body, /ms-model-entry-main/);
	assert.match(response.body, /ms-model-entry-limits/);
	assert.match(response.body, /\.ms-preset-inputs\.has-custom/);
	assert.match(response.body, /classList\.toggle\("has-custom"/);
	assert.match(response.body, /8192 tokens/);
	assert.match(response.body, /32K tokens/);
	assert.match(response.body, /128K tokens/);
	assert.match(response.body, /1M tokens/);
	assert.match(response.body, /自定义.../);
	assert.match(response.body, /placeholder="模型 ID"/);
	assert.match(response.body, /placeholder="显示名称"/);
	assert.match(response.body, /placeholder="上下文长度"/);
	assert.match(response.body, /placeholder="最大输出"/);
	assert.doesNotMatch(response.body, /apiKeyEnvVar/);
	assert.doesNotMatch(response.body, />Provider ID</);
	assert.doesNotMatch(response.body, />Vendor</);
	assert.doesNotMatch(response.body, />Region</);
	assert.doesNotMatch(response.body, />Base URL</);
	assert.doesNotMatch(response.body, />API Key</);
	assert.doesNotMatch(response.body, /datalist id="model-context-options"/);
	assert.doesNotMatch(response.body, /datalist id="model-output-options"/);
	assert.doesNotMatch(response.body, /data-provider-template=/);
	assert.doesNotMatch(response.body, /ms-template-button/);
	assert.doesNotMatch(response.body, /每行一个模型/);
	await app.close();
});

test("GET /playground/model-sources guards backdrop close while dragging text", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/model-sources",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /modalPointerDownStartedOnBackdrop/);
	assert.match(response.body, /mousedown/);
	assert.match(response.body, /mouseup/);
	assert.doesNotMatch(response.body, /event\.target\.id === "new-provider-modal"\) closeNewProviderModal/);
	await app.close();
});
