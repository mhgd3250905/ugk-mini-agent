import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getAppConfig, loadApiKeyFromApiTxt } from "../src/config.js";

test("loads ZHIPU_GLM_API_KEY from zhipu-api.txt when environment variable is absent", async () => {
	const dir = await mkdtemp(join(tmpdir(), "ugk-pi-config-"));
	const apiTxtPath = join(dir, "zhipu-api.txt");
	await writeFile(apiTxtPath, "api-key: sk-test-123", "utf8");
	delete process.env.ZHIPU_GLM_API_KEY;

	const loaded = loadApiKeyFromApiTxt(dir);

	assert.equal(loaded, "sk-test-123");
	assert.equal(process.env.ZHIPU_GLM_API_KEY, "sk-test-123");
	delete process.env.ZHIPU_GLM_API_KEY;
});

test("loads DEEPSEEK_API_KEY from deepseek-api.txt when environment variable is absent", async () => {
	const dir = await mkdtemp(join(tmpdir(), "ugk-pi-config-"));
	const apiTxtPath = join(dir, "deepseek-api.txt");
	await writeFile(apiTxtPath, "api-key = sk-deepseek-test-123", "utf8");

	const loaded = loadApiKeyFromApiTxt(dir, "TEST_DEEPSEEK_KEY", "deepseek-api.txt");

	assert.equal(loaded, "sk-deepseek-test-123");
	assert.equal(process.env.TEST_DEEPSEEK_KEY, "sk-deepseek-test-123");
	delete process.env.TEST_DEEPSEEK_KEY;
});

test("loads ALI_CODEPLAN_API_KEY from ali codeplan api txt akikey spelling", async () => {
	const dir = await mkdtemp(join(tmpdir(), "ugk-pi-config-"));
	const apiTxtPath = join(dir, "阿里codeplan-api-2026-5.txt");
	await writeFile(apiTxtPath, "akikey = sk-ali-codeplan-test-123\n", "utf8");
	delete process.env.ALI_CODEPLAN_API_KEY;

	const loaded = loadApiKeyFromApiTxt(dir, "ALI_CODEPLAN_API_KEY", "阿里codeplan-api-2026-5.txt");

	assert.equal(loaded, "sk-ali-codeplan-test-123");
	assert.equal(process.env.ALI_CODEPLAN_API_KEY, "sk-ali-codeplan-test-123");
	delete process.env.ALI_CODEPLAN_API_KEY;
});

test("getAppConfig does not load local api txt files by default", async () => {
	const dir = await mkdtemp(join(tmpdir(), "ugk-pi-config-"));
	await writeFile(join(dir, "deepseek-api.txt"), "api-key = sk-deepseek-test-123", "utf8");
	delete process.env.DEEPSEEK_API_KEY;
	const previousAllow = process.env.UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP;
	delete process.env.UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP;

	try {
		getAppConfig(dir);

		assert.equal(process.env.DEEPSEEK_API_KEY, undefined);
	} finally {
		if (previousAllow === undefined) {
			delete process.env.UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP;
		} else {
			process.env.UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP = previousAllow;
		}
	}
});

test("getAppConfig loads local api txt files only when bootstrap is explicitly enabled", async () => {
	const dir = await mkdtemp(join(tmpdir(), "ugk-pi-config-"));
	const apiTxtPath = join(dir, "小米api.txt");
	await writeFile(apiTxtPath, "model_name:mimo-v2.5-pro\napikey:tp-xiaomi-test-123\n", "utf8");
	await writeFile(join(dir, "阿里codeplan-api-2026-5.txt"), "akikey: sk-ali-codeplan-test-123\n", "utf8");
	delete process.env.XIAOMI_MIMO_API_KEY;
	delete process.env.ALI_CODEPLAN_API_KEY;
	const previousAllow = process.env.UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP;
	process.env.UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP = "true";

	try {
		getAppConfig(dir);

		assert.equal(process.env.XIAOMI_MIMO_API_KEY, "tp-xiaomi-test-123");
		assert.equal(process.env.ALI_CODEPLAN_API_KEY, "sk-ali-codeplan-test-123");
	} finally {
		delete process.env.XIAOMI_MIMO_API_KEY;
		delete process.env.ALI_CODEPLAN_API_KEY;
		if (previousAllow === undefined) {
			delete process.env.UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP;
		} else {
			process.env.UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP = previousAllow;
		}
	}
});

test("loads ZHIPU_GLM_API_KEY from JSON env settings", async () => {
	const dir = await mkdtemp(join(tmpdir(), "ugk-pi-config-"));
	const apiTxtPath = join(dir, "zhipu-api.txt");
	await writeFile(
		apiTxtPath,
		JSON.stringify({
			env: {
				ZHIPU_GLM_API_KEY: "zhipu-json-token",
			},
		}),
		"utf8",
	);
	delete process.env.ZHIPU_GLM_API_KEY;
	const previousAllow = process.env.UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP;
	process.env.UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP = "true";

	try {
		getAppConfig(dir);

		assert.equal(process.env.ZHIPU_GLM_API_KEY, "zhipu-json-token");
	} finally {
		delete process.env.ZHIPU_GLM_API_KEY;
		if (previousAllow === undefined) {
			delete process.env.UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP;
		} else {
			process.env.UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP = previousAllow;
		}
	}
});

test("keeps existing environment variable and does not override it from api.txt", async () => {
	const dir = await mkdtemp(join(tmpdir(), "ugk-pi-config-"));
	const apiTxtPath = join(dir, "zhipu-api.txt");
	await writeFile(apiTxtPath, "api-key: sk-test-123", "utf8");
	process.env.ZHIPU_GLM_API_KEY = "existing-value";

	const loaded = loadApiKeyFromApiTxt(dir);

	assert.equal(loaded, "existing-value");
	assert.equal(process.env.ZHIPU_GLM_API_KEY, "existing-value");
	delete process.env.ZHIPU_GLM_API_KEY;
});
