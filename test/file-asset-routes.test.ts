import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

test("GET /assets/fonts/Agave-Regular.ttf returns the bundled Agave font", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/assets/fonts/Agave-Regular.ttf",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /font\/ttf|application\/octet-stream/);
	assert.ok(response.rawPayload.length > 1000);
	await app.close();
});

test("GET /vendor/flatpickr assets serves the bundled time picker", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const scriptResponse = await app.inject({
		method: "GET",
		url: "/vendor/flatpickr/flatpickr.min.js",
	});
	assert.equal(scriptResponse.statusCode, 200);
	assert.match(scriptResponse.headers["content-type"] ?? "", /^text\/javascript/);
	assert.match(scriptResponse.body, /flatpickr/);

	const localeResponse = await app.inject({
		method: "GET",
		url: "/vendor/flatpickr/l10n/zh.js",
	});
	assert.equal(localeResponse.statusCode, 200);
	assert.match(localeResponse.headers["content-type"] ?? "", /^text\/javascript/);
	assert.match(localeResponse.body, /zh/);

	const blockedResponse = await app.inject({
		method: "GET",
		url: "/vendor/flatpickr/package.json",
	});
	assert.equal(blockedResponse.statusCode, 404);

	await app.close();
});

test("GET /x-api-report-full.png serves public root files over HTTP", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/x-api-report-full.png",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^image\/png/);
	assert.ok(response.rawPayload.length > 1000);
	await app.close();
});

test("GET /runtime/report-medtrum-v2.html serves runtime report files over HTTP", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/runtime/report-medtrum-v2.html",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/html/);
	assert.match(response.body, /<html/i);
	await app.close();
});

test("GET /v1/local-file opens runtime artifacts from container-style paths", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/local-file?path=%2Fapp%2Fruntime%2Freport-medtrum-v2.html",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/html/);
	assert.match(response.body, /<html/i);
	await app.close();
});

test("GET /v1/local-file accepts file URLs for runtime artifacts", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/local-file?path=file%3A%2F%2F%2Fapp%2Fruntime%2Freport-medtrum-v2.html",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/html/);
	await app.close();
});

test("GET /v1/local-file unwraps accidentally nested local-file urls", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/local-file?path=http://127.0.0.1:3000/v1/local-file?path=%2Fapp%2Fruntime%2Freport-medtrum-v2.html",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/html/);
	await app.close();
});

test("GET /runtime/../package.json does not expose files outside runtime", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/runtime/../package.json",
	});

	assert.equal(response.statusCode, 404);
	await app.close();
});

test("GET /v1/local-file does not expose files outside public and runtime", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/local-file?path=%2Fapp%2F.data%2Fagent%2Fasset-index.json",
	});

	assert.equal(response.statusCode, 404);
	await app.close();
});

test("GET /package.json does not expose files outside public", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/package.json",
	});

	assert.equal(response.statusCode, 404);
	await app.close();
});

test("GET /v1/files/:fileId downloads a stored agent file", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		assetStore: {
			registerAttachments: async () => [],
			saveFiles: async () => [],
			listAssets: async () => [],
			getAsset: async () => undefined,
			resolveAssets: async () => [],
			readText: async () => undefined,
			getFile: async (fileId: string) =>
				fileId === "file-123"
					? {
							assetId: "file-123",
							reference: "@asset[file-123]",
							fileName: "hello.txt",
							mimeType: "text/plain",
							sizeBytes: 11,
							kind: "text",
							hasContent: true,
							source: "agent_output",
							conversationId: "manual:file",
							createdAt: "2026-04-18T00:00:00.000Z",
							downloadUrl: "/v1/files/file-123",
							content: Buffer.from("hello world", "utf8"),
						}
					: undefined,
		},
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/files/file-123",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/plain/);
	assert.match(response.headers["content-disposition"] ?? "", /filename="hello\.txt"/);
	assert.equal(response.body, "hello world");
	await app.close();
});

test("GET /v1/files/:fileId serves markdown text with utf-8 charset", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		assetStore: {
			registerAttachments: async () => [],
			saveFiles: async () => [],
			listAssets: async () => [],
			getAsset: async () => undefined,
			resolveAssets: async () => [],
			readText: async () => undefined,
			getFile: async (fileId: string) =>
				fileId === "markdown-1"
					? {
							assetId: "markdown-1",
							reference: "@asset[markdown-1]",
							fileName: "报告.md",
							mimeType: "text/markdown",
							sizeBytes: Buffer.byteLength("# 标题\n\n你好，世界", "utf8"),
							kind: "text",
							hasContent: true,
							source: "agent_output",
							conversationId: "manual:markdown",
							createdAt: "2026-04-23T00:00:00.000Z",
							downloadUrl: "/v1/files/markdown-1",
							content: Buffer.from("# 标题\n\n你好，世界", "utf8"),
						}
					: undefined,
		},
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/files/markdown-1",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/markdown;\s*charset=utf-8$/i);
	assert.match(response.headers["content-disposition"] ?? "", /^inline;/);
	assert.equal(response.body, "# 标题\n\n你好，世界");
	await app.close();
});

test("GET /v1/files/:fileId serves previewable images inline and still supports forced download", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		assetStore: {
			registerAttachments: async () => [],
			saveFiles: async () => [],
			listAssets: async () => [],
			getAsset: async () => undefined,
			resolveAssets: async () => [],
			readText: async () => undefined,
			getFile: async (fileId: string) =>
				fileId === "image-1"
					? {
							assetId: "image-1",
							reference: "@asset[image-1]",
							fileName: "report.png",
							mimeType: "image/png",
							sizeBytes: 8,
							kind: "binary",
							hasContent: true,
							source: "agent_output",
							conversationId: "manual:image",
							createdAt: "2026-04-19T00:00:00.000Z",
							downloadUrl: "/v1/files/image-1",
							content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
						}
					: undefined,
		},
	});

	const previewResponse = await app.inject({
		method: "GET",
		url: "/v1/files/image-1",
	});
	assert.equal(previewResponse.statusCode, 200);
	assert.match(
		previewResponse.headers["content-disposition"] ?? "",
		/^inline;\s*filename="report\.png";\s*filename\*=UTF-8''report\.png$/,
	);

	const downloadResponse = await app.inject({
		method: "GET",
		url: "/v1/files/image-1?download=1",
	});
	assert.equal(downloadResponse.statusCode, 200);
	assert.match(
		downloadResponse.headers["content-disposition"] ?? "",
		/^attachment;\s*filename="report\.png";\s*filename\*=UTF-8''report\.png$/,
	);
	await app.close();
});

test("GET /v1/files/:fileId supports non-ascii filenames without invalid header errors", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		assetStore: {
			registerAttachments: async () => [],
			saveFiles: async () => [],
			listAssets: async () => [],
			getAsset: async () => undefined,
			resolveAssets: async () => [],
			readText: async () => undefined,
			getFile: async (fileId: string) =>
				fileId === "image-zh"
					? {
							assetId: "image-zh",
							reference: "@asset[image-zh]",
							fileName: "闂傚倸鍊搁崐鎼佸磹閹间礁纾归柣鎴ｅГ閸婂潡鏌ㄩ弴妤€浜惧銈庝簻閸熸潙鐣风粙璇炬棃鍩€椤掑嫬纾奸柕濞у嫬鏋戦梺缁橆殔閻楀棛绮幒鏃傛／闁诡垎鍕淮闂佸搫鐬奸崰搴ㄥ煝閹捐鍨傛い鏃傛櫕娴滄儳鈹戦悙鏉戠仸闁圭鎽滅划鏃堟偨缁嬭锕傛煕閺囥劌鐏犻柛妤勬珪娣囧﹪濡堕崒姘濠电偛鐡ㄧ划鎾剁不閺嵮屾綎闁惧繗顫夌€氭岸鏌嶉妷銊︾彧闁诲繐绉剁槐鎾寸瑹閸パ勭亶闂佸湱鎳撳ú顓熶繆鐎涙ɑ濯撮柛鎾冲级瀵ゆ椽姊洪柅鐐茶嫰婢у瓨顨ラ悙鎻掓殻濠碘€崇埣瀹曞崬螣娓氼垪鍋撻幘缁樺仭婵犲﹤鎳庨。濂告偨椤栨侗娈欐い锝囧姩op3_20260419.png",
							mimeType: "image/png",
							sizeBytes: 8,
							kind: "binary",
							hasContent: true,
							source: "agent_output",
							conversationId: "manual:image-zh",
							createdAt: "2026-04-19T00:00:00.000Z",
							downloadUrl: "/v1/files/image-zh",
							content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
						}
					: undefined,
		},
	});

	const previewResponse = await app.inject({
		method: "GET",
		url: "/v1/files/image-zh",
	});
	assert.equal(previewResponse.statusCode, 200);
	assert.match(previewResponse.headers["content-disposition"] ?? "", /^inline;\s*filename="[^"]+";\s*filename\*=UTF-8''/);

	const downloadResponse = await app.inject({
		method: "GET",
		url: "/v1/files/image-zh?download=1",
	});
	assert.equal(downloadResponse.statusCode, 200);
	assert.match(downloadResponse.headers["content-disposition"] ?? "", /^attachment;\s*filename="[^"]+";\s*filename\*=UTF-8''/);
	await app.close();
});

test("GET /v1/assets returns reusable asset metadata", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		assetStore: {
			registerAttachments: async () => [],
			saveFiles: async () => [],
			listAssets: async () => [
				{
					assetId: "asset-1",
					reference: "@asset[asset-1]",
					fileName: "notes.txt",
					mimeType: "text/plain",
					sizeBytes: 11,
					kind: "text",
					hasContent: true,
					source: "user_upload",
					conversationId: "manual:test",
					createdAt: "2026-04-18T00:00:00.000Z",
					textPreview: "hello file",
					downloadUrl: "/v1/files/asset-1",
				},
			],
			getAsset: async () => undefined,
			resolveAssets: async () => [],
			readText: async () => undefined,
			getFile: async () => undefined,
		},
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/assets?limit=20",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		assets: [
			{
				assetId: "asset-1",
				reference: "@asset[asset-1]",
				fileName: "notes.txt",
				mimeType: "text/plain",
				sizeBytes: 11,
				kind: "text",
				hasContent: true,
				source: "user_upload",
				conversationId: "manual:test",
				createdAt: "2026-04-18T00:00:00.000Z",
				textPreview: "hello file",
				downloadUrl: "/v1/files/asset-1",
			},
		],
	});
	await app.close();
});

test("DELETE /v1/assets/:assetId removes a reusable asset", async () => {
	const calls: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		assetStore: {
			registerAttachments: async () => [],
			saveFiles: async () => [],
			listAssets: async () => [],
			getAsset: async () => undefined,
			resolveAssets: async () => [],
			readText: async () => undefined,
			getFile: async () => undefined,
			deleteAsset: async (assetId: string) => {
				calls.push(assetId);
				return assetId === "asset-delete";
			},
		},
	});

	const response = await app.inject({
		method: "DELETE",
		url: "/v1/assets/asset-delete",
	});
	const missingResponse = await app.inject({
		method: "DELETE",
		url: "/v1/assets/asset-missing",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		assetId: "asset-delete",
		deleted: true,
	});
	assert.equal(missingResponse.statusCode, 404);
	assert.deepEqual(calls, ["asset-delete", "asset-missing"]);
	await app.close();
});

test("POST /v1/assets no longer accepts JSON attachment uploads", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/assets",
		payload: {
			conversationId: "manual:conn",
			attachments: [
				{
					fileName: "notes.txt",
					mimeType: "text/plain",
					sizeBytes: 11,
					text: "hello file",
				},
			],
		},
	});

	assert.equal(response.statusCode, 404);
	await app.close();
});

test("POST /v1/assets/upload registers multipart files for later reuse", async () => {
	const calls: Array<{ conversationId: string; attachments: unknown[] }> = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		assetStore: {
			registerAttachments: async (conversationId, attachments) => {
				calls.push({ conversationId, attachments: [...attachments] });
				return [
					{
						assetId: "asset-multipart-upload",
						reference: "@asset[asset-multipart-upload]",
						fileName: "brief.pdf",
						mimeType: "application/pdf",
						sizeBytes: 5,
						kind: "binary",
						hasContent: true,
						source: "user_upload",
						conversationId,
						createdAt: "2026-04-23T00:00:00.000Z",
						downloadUrl: "/v1/files/asset-multipart-upload",
					},
				];
			},
			saveFiles: async () => [],
			listAssets: async () => [],
			getAsset: async () => undefined,
			resolveAssets: async () => [],
			readText: async () => undefined,
			getFile: async () => undefined,
		},
	});

	const boundary = "----ugk-test-boundary";
	const payload = Buffer.from(
		[
			`--${boundary}`,
			'Content-Disposition: form-data; name="conversationId"',
			"",
			"manual:conn-upload",
			`--${boundary}`,
			'Content-Disposition: form-data; name="files"; filename="brief.pdf"',
			"Content-Type: application/pdf",
			"",
			"%PDF-",
			`--${boundary}--`,
			"",
		].join("\r\n"),
	);

	const response = await app.inject({
		method: "POST",
		url: "/v1/assets/upload",
		headers: {
			"content-type": `multipart/form-data; boundary=${boundary}`,
			"content-length": String(payload.length),
		},
		payload,
	});

	assert.equal(response.statusCode, 200);
	assert.equal(response.json().assets[0].assetId, "asset-multipart-upload");
	assert.equal(calls.length, 1);
	assert.equal(calls[0].conversationId, "manual:conn-upload");
	assert.deepEqual(calls[0].attachments[0], {
		fileName: "brief.pdf",
		mimeType: "application/pdf",
		sizeBytes: 5,
		base64: Buffer.from("%PDF-").toString("base64"),
	});
	await app.close();
});

test("POST /v1/assets/upload returns 413 when a file exceeds the configured size limit", async () => {
	const previousLimit = process.env.ASSET_UPLOAD_FILE_LIMIT_BYTES;
	process.env.ASSET_UPLOAD_FILE_LIMIT_BYTES = String(16 * 1024);

	try {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const boundary = "----ugk-test-boundary-limit";
		const oversizedBody = "a".repeat(20 * 1024);
		const payload = Buffer.from(
			[
				`--${boundary}`,
				'Content-Disposition: form-data; name="conversationId"',
				"",
				"manual:too-large",
				`--${boundary}`,
				'Content-Disposition: form-data; name="files"; filename="oversized.txt"',
				"Content-Type: text/plain",
				"",
				oversizedBody,
				`--${boundary}--`,
				"",
			].join("\r\n"),
		);

		const response = await app.inject({
			method: "POST",
			url: "/v1/assets/upload",
			headers: {
				"content-type": `multipart/form-data; boundary=${boundary}`,
				"content-length": String(payload.length),
			},
			payload,
		});

		assert.equal(response.statusCode, 413);
		assert.deepEqual(response.json(), {
			error: {
				code: "PAYLOAD_TOO_LARGE",
				message: "Uploaded files must be 16KiB or smaller",
			},
		});
		await app.close();
	} finally {
		if (previousLimit === undefined) {
			delete process.env.ASSET_UPLOAD_FILE_LIMIT_BYTES;
		} else {
			process.env.ASSET_UPLOAD_FILE_LIMIT_BYTES = previousLimit;
		}
	}
});

test("GET /v1/sites/:siteId/* serves site public files without exposing sibling files", async () => {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-site-public-"));
	const publicDir = join(root, "background", "sites", "team-website", "public");
	await mkdir(publicDir, { recursive: true });
	await writeFile(join(publicDir, "index.json"), "{\"ok\":true}", "utf8");
	await writeFile(join(root, "background", "sites", "team-website", "private.json"), "{\"secret\":true}", "utf8");
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {} as never,
		backgroundDataDir: join(root, "background"),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/sites/team-website/index.json",
	});
	const traversalResponse = await app.inject({
		method: "GET",
		url: "/v1/sites/team-website/../private.json",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] as string, /^application\/json/);
	assert.equal(response.body, "{\"ok\":true}");
	assert.equal(traversalResponse.statusCode, 404);
	await app.close();
});

