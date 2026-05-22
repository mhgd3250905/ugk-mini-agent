import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	createFileModelConfigStore,
	saveDefaultModelConfig,
	type ModelSelectionValidator,
} from "../src/agent/model-config.js";

async function createProjectRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-model-config-"));
	await mkdir(join(root, ".pi"), { recursive: true });
	await mkdir(join(root, "runtime", "pi-agent"), { recursive: true });
	await writeFile(
		join(root, ".pi", "settings.json"),
		[
			"{",
			'  // keep this comment',
			'  "defaultProvider": "zhipu-glm",',
			'  "defaultModel": "glm-5.1",',
			'  "defaultThinkingLevel": "medium"',
			"}",
		].join("\n"),
		"utf8",
	);
	await writeFile(
		join(root, "runtime", "pi-agent", "models.json"),
		JSON.stringify({
			providers: {
				"zhipu-glm": {
					name: "Zhipu GLM",
					vendor: "zhipu",
					region: "cn",
					priority: 10,
					apiKey: "ZHIPU_GLM_API_KEY",
					authHeader: true,
					models: [{ id: "glm-5.1", name: "GLM-5.1" }],
				},
				deepseek: {
					name: "DeepSeek",
					vendor: "deepseek",
					region: "global",
					priority: 20,
					apiKey: "DEEPSEEK_API_KEY",
					models: [
						{ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: 1000000, maxTokens: 384000 },
						{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 1000000, maxTokens: 384000 },
					],
				},
				"xiaomi-mimo-cn": {
					name: "Xiaomi MiMo China",
					vendor: "xiaomi",
					region: "cn",
					priority: 31,
					baseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
					api: "anthropic-messages",
					apiKey: "XIAOMI_MIMO_API_KEY",
					models: [
						{
							id: "mimo-v2.5-pro",
							name: "MiMo V2.5 Pro (Xiaomi CN)",
							contextWindow: 1048576,
							maxTokens: 16384,
						},
					],
				},
				"xiaomi-mimo-sgp": {
					name: "Xiaomi MiMo Singapore",
					vendor: "xiaomi",
					region: "sgp",
					priority: 32,
					baseUrl: "https://token-plan-sgp.xiaomimimo.com/anthropic",
					api: "anthropic-messages",
					apiKey: "XIAOMI_MIMO_API_KEY",
					models: [
						{
							id: "mimo-v2.5-pro",
							name: "MiMo V2.5 Pro (Xiaomi Singapore)",
							contextWindow: 1048576,
							maxTokens: 16384,
						},
					],
				},
				"xiaomi-mimo-ams": {
					name: "Xiaomi MiMo Europe",
					vendor: "xiaomi",
					region: "ams",
					priority: 33,
					baseUrl: "https://token-plan-ams.xiaomimimo.com/anthropic",
					api: "anthropic-messages",
					apiKey: "XIAOMI_MIMO_API_KEY",
					models: [
						{
							id: "mimo-v2.5-pro",
							name: "MiMo V2.5 Pro (Xiaomi Europe)",
							contextWindow: 1048576,
							maxTokens: 16384,
						},
					],
				},
				"ali-codeplan": {
					name: "Ali CodePlan",
					vendor: "aliyun",
					region: "cn-beijing",
					priority: 40,
					baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic",
					api: "anthropic-messages",
					apiKey: "ALI_CODEPLAN_API_KEY",
					models: [
						{ id: "glm-5.1", name: "GLM-5.1 (Ali CodePlan)", contextWindow: 200000, maxTokens: 128000 },
						{ id: "kimi-k2.6", name: "Kimi K2.6 (Ali CodePlan)", contextWindow: 256000 },
						{ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro (Ali CodePlan)", contextWindow: 1000000 },
						{ id: "qwen3.7-max", name: "Qwen 3.7 Max (Ali CodePlan)", contextWindow: 1000000 },
					],
				},
			},
		}),
		"utf8",
	);
	return root;
}

test("model config store lists providers and current default selection", async () => {
	const projectRoot = await createProjectRoot();
	process.env.TEST_DEEPSEEK_UNUSED = "";
	const store = createFileModelConfigStore(projectRoot);

	const config = await store.getConfig();

	assert.deepEqual(config.current, {
		provider: "zhipu-glm",
		model: "glm-5.1",
	});
	assert.deepEqual(
		config.providers.map((provider) => provider.id),
		["zhipu-glm", "deepseek", "xiaomi-mimo-cn", "xiaomi-mimo-sgp", "xiaomi-mimo-ams", "ali-codeplan"],
	);
	assert.deepEqual(config.providers.map((provider) => [provider.id, provider.name, provider.vendor, provider.region, provider.priority]), [
		["zhipu-glm", "Zhipu GLM", "zhipu", "cn", 10],
		["deepseek", "DeepSeek", "deepseek", "global", 20],
		["xiaomi-mimo-cn", "Xiaomi MiMo China", "xiaomi", "cn", 31],
		["xiaomi-mimo-sgp", "Xiaomi MiMo Singapore", "xiaomi", "sgp", 32],
		["xiaomi-mimo-ams", "Xiaomi MiMo Europe", "xiaomi", "ams", 33],
		["ali-codeplan", "Ali CodePlan", "aliyun", "cn-beijing", 40],
	]);
	assert.deepEqual(
		config.providers.find((provider) => provider.id === "deepseek")?.models.map((model) => model.id),
		["deepseek-v4-pro", "deepseek-v4-flash"],
	);
	assert.deepEqual(config.providers.find((provider) => provider.id === "deepseek")?.models[0], {
		id: "deepseek-v4-pro",
		name: "DeepSeek V4 Pro",
		contextWindow: 1000000,
		maxTokens: 384000,
	});
	assert.deepEqual(config.providers.find((provider) => provider.id === "deepseek")?.models[1], {
		id: "deepseek-v4-flash",
		name: "DeepSeek V4 Flash",
		contextWindow: 1000000,
		maxTokens: 384000,
	});
	assert.equal(config.providers.find((provider) => provider.id === "deepseek")?.auth.envVar, "DEEPSEEK_API_KEY");
	assert.deepEqual(config.providers.find((provider) => provider.id === "xiaomi-mimo-cn")?.models, [
		{
			id: "mimo-v2.5-pro",
			name: "MiMo V2.5 Pro (Xiaomi CN)",
			contextWindow: 1048576,
			maxTokens: 16384,
		},
	]);
	assert.equal(config.providers.find((provider) => provider.id === "xiaomi-mimo-cn")?.auth.envVar, "XIAOMI_MIMO_API_KEY");
	assert.deepEqual(config.providers.find((provider) => provider.id === "ali-codeplan")?.models.map((model) => model.id), [
		"glm-5.1",
		"kimi-k2.6",
		"deepseek-v4-pro",
		"qwen3.7-max",
	]);
	assert.deepEqual(config.providers.find((provider) => provider.id === "ali-codeplan")?.models.map((model) => model.contextWindow), [
		200000,
		256000,
		1000000,
		1000000,
	]);
	assert.equal(config.providers.find((provider) => provider.id === "ali-codeplan")?.models[0]?.maxTokens, 128000);
	assert.equal(config.providers.find((provider) => provider.id === "ali-codeplan")?.auth.envVar, "ALI_CODEPLAN_API_KEY");
});

test("model config store ignores default selection inside line comments", async () => {
	const projectRoot = await createProjectRoot();
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		[
			"{",
			'  // "defaultProvider": "deepseek-anthropic",',
			'  // "defaultModel": "deepseek-v4-flash",',
			'  "defaultModel": "glm-5.1"',
			"}",
		].join("\n"),
		"utf8",
	);
	const store = createFileModelConfigStore(projectRoot);

	const config = await store.getConfig();

	assert.deepEqual(config.current, {
		provider: "unknown",
		model: "glm-5.1",
	});
});

test("model config store reads default selection only from top-level settings", async () => {
	const projectRoot = await createProjectRoot();
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		[
			"{",
			'  "defaultProvider": "zhipu-glm",',
			'  "defaultModel": "glm-5.1",',
			'  "nested": {',
			'    "defaultProvider": "deepseek",',
			'    "defaultModel": "deepseek-v4-pro"',
			"  }",
			"}",
		].join("\n"),
		"utf8",
	);
	const store = createFileModelConfigStore(projectRoot);

	const config = await store.getConfig();

	assert.deepEqual(config.current, {
		provider: "zhipu-glm",
		model: "glm-5.1",
	});
});

test("model config store does not use nested defaults when top-level settings are missing", async () => {
	const projectRoot = await createProjectRoot();
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		[
			"{",
			'  "nested": {',
			'    "defaultProvider": "deepseek",',
			'    "defaultModel": "deepseek-v4-pro"',
			"  }",
			"}",
		].join("\n"),
		"utf8",
	);
	const store = createFileModelConfigStore(projectRoot);

	const config = await store.getConfig();

	assert.deepEqual(config.current, {
		provider: "unknown",
		model: "unknown",
	});
});

test("model config store preserves comment-like markers inside strings", async () => {
	const projectRoot = await createProjectRoot();
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		[
			"{",
			'  "defaultProvider": "deepseek",',
			'  "defaultModel": "deepseek-v4-pro",',
			'  "note": "https://example.test/path//still-string"',
			"}",
		].join("\n"),
		"utf8",
	);
	const store = createFileModelConfigStore(projectRoot);

	const config = await store.getConfig();

	assert.deepEqual(config.current, {
		provider: "deepseek",
		model: "deepseek-v4-pro",
	});
});

test("saveDefaultModelConfig validates before writing settings", async () => {
	const projectRoot = await createProjectRoot();
	const store = createFileModelConfigStore(projectRoot);
	const calls: Array<{ provider: string; model: string }> = [];
	const validator: ModelSelectionValidator = async (selection) => {
		calls.push(selection);
		return { ok: true };
	};

	const result = await saveDefaultModelConfig(store, validator, {
		provider: "deepseek",
		model: "deepseek-v4-pro",
	});

	const settings = await readFile(join(projectRoot, ".pi", "settings.json"), "utf8");
	assert.equal(result.ok, true);
	assert.deepEqual(calls, [{ provider: "deepseek", model: "deepseek-v4-pro" }]);
	assert.match(settings, /"defaultProvider": "deepseek"/);
	assert.match(settings, /"defaultModel": "deepseek-v4-pro"/);
	assert.match(settings, /\/\/ keep this comment/);
});

test("model config store persists web default selection outside bundled settings when runtime path is configured", async () => {
	const projectRoot = await createProjectRoot();
	const runtimeSettingsPath = join(projectRoot, ".data", "agent", "model-settings.json");
	const previousSettingsPath = process.env.UGK_MODEL_SETTINGS_PATH;
	process.env.UGK_MODEL_SETTINGS_PATH = runtimeSettingsPath;
	try {
		const store = createFileModelConfigStore(projectRoot);

		assert.deepEqual((await store.getConfig()).current, {
			provider: "zhipu-glm",
			model: "glm-5.1",
		});

		await store.setDefault({
			provider: "deepseek",
			model: "deepseek-v4-pro",
		});

		const runtimeSettings = await readFile(runtimeSettingsPath, "utf8");
		const bundledSettings = await readFile(join(projectRoot, ".pi", "settings.json"), "utf8");
		assert.match(runtimeSettings, /"defaultProvider": "deepseek"/);
		assert.match(runtimeSettings, /"defaultModel": "deepseek-v4-pro"/);
		assert.match(runtimeSettings, /\/\/ keep this comment/);
		assert.match(bundledSettings, /"defaultProvider": "zhipu-glm"/);
		assert.deepEqual((await store.getConfig()).current, {
			provider: "deepseek",
			model: "deepseek-v4-pro",
		});
	} finally {
		if (previousSettingsPath === undefined) {
			delete process.env.UGK_MODEL_SETTINGS_PATH;
		} else {
			process.env.UGK_MODEL_SETTINGS_PATH = previousSettingsPath;
		}
	}
});

test("saveDefaultModelConfig inserts active defaults instead of replacing commented defaults", async () => {
	const projectRoot = await createProjectRoot();
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		[
			"{",
			'  // "defaultProvider": "deepseek-anthropic",',
			'  // "defaultModel": "deepseek-v4-flash",',
			'  "defaultThinkingLevel": "medium"',
			"}",
		].join("\n"),
		"utf8",
	);
	const store = createFileModelConfigStore(projectRoot);
	const validator: ModelSelectionValidator = async () => ({ ok: true });

	const result = await saveDefaultModelConfig(store, validator, {
		provider: "zhipu-glm",
		model: "glm-5.1",
	});

	const settings = await readFile(join(projectRoot, ".pi", "settings.json"), "utf8");
	assert.equal(result.ok, true);
	assert.match(settings, /\/\/ "defaultProvider": "deepseek-anthropic"/);
	assert.match(settings, /\/\/ "defaultModel": "deepseek-v4-flash"/);
	assert.match(settings, /^\s*"defaultProvider": "zhipu-glm",?$/m);
	assert.match(settings, /^\s*"defaultModel": "glm-5\.1",?$/m);
});

test("saveDefaultModelConfig does not write settings when validation fails", async () => {
	const projectRoot = await createProjectRoot();
	const store = createFileModelConfigStore(projectRoot);
	const validator: ModelSelectionValidator = async () => ({
		ok: false,
		code: "provider_validation_failed",
		message: "model request failed",
	});

	const result = await saveDefaultModelConfig(store, validator, {
		provider: "deepseek",
		model: "deepseek-v4-pro",
	});

	const settings = await readFile(join(projectRoot, ".pi", "settings.json"), "utf8");
	assert.deepEqual(result, {
		ok: false,
		code: "provider_validation_failed",
		message: "model request failed",
	});
	assert.match(settings, /"defaultProvider": "zhipu-glm"/);
	assert.match(settings, /"defaultModel": "glm-5\.1"/);
});
