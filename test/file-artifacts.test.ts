import assert from "node:assert/strict";
import test from "node:test";
import { buildPromptWithAssetContext, rewriteUserVisibleLocalArtifactLinks } from "../src/agent/file-artifacts.js";

test("buildPromptWithAssetContext uses Windows Core public URL defaults and artifact env guidance", () => {
	const previousPublicBaseUrl = process.env.PUBLIC_BASE_URL;
	const previousPort = process.env.PORT;
	process.env.PUBLIC_BASE_URL = "http://101.37.209.54:3000";
	let prompt = "";
	try {
		prompt = buildPromptWithAssetContext("请生成报告");
	} finally {
		if (typeof previousPublicBaseUrl === "undefined") {
			delete process.env.PUBLIC_BASE_URL;
		} else {
			process.env.PUBLIC_BASE_URL = previousPublicBaseUrl;
		}
		if (typeof previousPort === "undefined") {
			delete process.env.PORT;
		} else {
			process.env.PORT = previousPort;
		}
	}

	assert.match(prompt, /send_file/);
	assert.match(prompt, /ARTIFACT_PUBLIC_DIR/);
	assert.match(prompt, /ARTIFACT_PUBLIC_BASE_URL/);
	assert.match(prompt, /host-reachable HTTP URL/i);
	assert.match(prompt, /Current user-facing base URL: http:\/\/101\.37\.209\.54:3000\./);
	assert.match(prompt, /Do not mention Tencent Cloud, Aliyun, or another deployment public URL/i);
	assert.doesNotMatch(prompt, /valid internal references for tools/i);
	assert.doesNotMatch(prompt, /file:\/\/\/app\/\.\.\./);
	assert.match(prompt, /Browser automation is not bundled/i);
	assert.doesNotMatch(prompt, /sidecar browser file uploads/i);
	assert.doesNotMatch(prompt, /\/app\/\.data\/browser-upload/);
	assert.doesNotMatch(prompt, /\/config\/upload/);
});

test("buildPromptWithAssetContext falls back to Windows Core port 8888", () => {
	const previousPublicBaseUrl = process.env.PUBLIC_BASE_URL;
	const previousPort = process.env.PORT;
	delete process.env.PUBLIC_BASE_URL;
	delete process.env.PORT;
	try {
		const prompt = buildPromptWithAssetContext("请生成报告");
		assert.match(prompt, /Current user-facing base URL: http:\/\/127\.0\.0\.1:8888\./);
		assert.doesNotMatch(prompt, /127\.0\.0\.1:3000/);
	} finally {
		if (typeof previousPublicBaseUrl === "undefined") {
			delete process.env.PUBLIC_BASE_URL;
		} else {
			process.env.PUBLIC_BASE_URL = previousPublicBaseUrl;
		}
		if (typeof previousPort === "undefined") {
			delete process.env.PORT;
		} else {
			process.env.PORT = previousPort;
		}
	}
});

test("rewriteUserVisibleLocalArtifactLinks does not wrap already translated local-file urls", () => {
	const alreadyTranslated =
		"可视化图表链接： http://127.0.0.1:3000/v1/local-file?path=/app/runtime/beijing-weather-chart.html";

	assert.equal(rewriteUserVisibleLocalArtifactLinks(alreadyTranslated), alreadyTranslated);
});

test("rewriteUserVisibleLocalArtifactLinks converts supported container file paths for host-visible text", () => {
	const rewritten = rewriteUserVisibleLocalArtifactLinks(
		"打开 file:///app/public/zhihu-hot-share.html，然后看 /app/runtime/report-medtrum-v2.html。",
	);

	assert.equal(
		rewritten,
		"打开 http://127.0.0.1:8888/v1/local-file?path=%2Fapp%2Fpublic%2Fzhihu-hot-share.html，然后看 http://127.0.0.1:8888/v1/local-file?path=%2Fapp%2Fruntime%2Freport-medtrum-v2.html。",
	);
});
