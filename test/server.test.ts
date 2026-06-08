import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NotificationHub } from "../src/agent/notification-hub.js";
import { buildServer } from "../src/server.js";
import { FeishuSettingsStore } from "../src/integrations/feishu/settings-store.js";
import type { AgentService } from "../src/agent/agent-service.js";
import { AgentBusyError } from "../src/agent/agent-errors.js";
import { renderPlaygroundMarkdown } from "../src/ui/playground.js";
import { renderConnPage } from "../src/ui/conn-page.js";
import { renderAgentsPage } from "../src/ui/agents-page.js";
import { createBrowserRegistry } from "../src/browser/browser-registry.js";
import type {
	ModelConfigBody,
	ModelConfigSelection,
	ModelConfigStore,
	ModelSelectionValidator,
} from "../src/agent/model-config.js";

type StreamEvent = Record<string, unknown>;

function createAgentServiceStub(overrides?: {
	chat?: AgentService["chat"];
	streamChat?: (
		input: { conversationId?: string; message: string; userId?: string; attachments?: unknown[]; assetRefs?: string[] },
		onEvent: (event: StreamEvent) => void,
	) => Promise<void>;
	queueMessage?: AgentService["queueMessage"];
	interruptChat?: AgentService["interruptChat"];
	resetConversation?: AgentService["resetConversation"];
	getAgentRunStatus?: AgentService["getAgentRunStatus"];
	getRunStatus?: (
		conversationId: string,
	) => Promise<{
			conversationId: string;
			running: boolean;
			contextUsage: {
				provider: string;
				model: string;
				currentTokens: number;
				contextWindow: number;
				reserveTokens: number;
				maxResponseTokens: number;
				availableTokens: number;
				percent: number;
				status: "safe" | "caution" | "warning" | "danger";
				mode: "usage" | "estimate";
			};
		}>;
	subscribeRunEvents?: (
		conversationId: string,
		onEvent: (event: StreamEvent) => void,
		options?: { afterEventCursor?: number },
	) => {
		conversationId: string;
		running: boolean;
		unsubscribe: () => void;
	};
	getRunEvents?: (
		conversationId: string,
		runId: string,
	) => Promise<Array<StreamEvent>>;
	getConversationHistory?: (
		conversationId: string,
		options?: { limit?: number; before?: string },
	) => Promise<{
		conversationId: string;
		messages: Array<{
			id: string;
			kind: "user" | "assistant" | "system" | "error";
			title: string;
			text: string;
			createdAt: string;
		}>;
		hasMore?: boolean;
		nextBefore?: string;
		limit?: number;
	}>;
	getConversationState?: (conversationId: string, options?: { viewLimit?: number }) => Promise<Record<string, unknown>>;
	getConversationCatalog?: () => Promise<{
		currentConversationId: string;
		conversations: Array<{
			conversationId: string;
			title: string;
			preview: string;
			messageCount: number;
			createdAt: string;
			updatedAt: string;
			running: boolean;
		}>;
	}>;
	createConversation?: () => Promise<{
		conversationId: string;
		currentConversationId: string;
		created: boolean;
		reason?: "running";
	}>;
	deleteConversation?: (
		conversationId: string,
	) => Promise<{
		conversationId: string;
		currentConversationId: string;
		deleted: boolean;
		reason?: "running" | "not_found";
	}>;
	switchConversation?: (
		conversationId: string,
	) => Promise<{
		conversationId: string;
		currentConversationId: string;
		switched: boolean;
		reason?: "running" | "not_found";
	}>;
	updateConversation?: (
		conversationId: string,
		patch: { title?: string; pinned?: boolean; backgroundColor?: string },
	) => Promise<{
		conversationId: string;
		updated: boolean;
		conversation?: {
			conversationId: string;
			title: string;
			preview: string;
			messageCount: number;
			createdAt: string;
			updatedAt: string;
			running: boolean;
			pinned?: boolean;
			backgroundColor?: string;
		};
		reason?: "not_found";
	}>;
	getAvailableSkills?: () => Promise<{
		skills: Array<{ name: string; path?: string }>;
		source: "fresh" | "cache";
		cachedAt: string;
	}>;
}): AgentService {
	return {
		chat:
			overrides?.chat ??
			(async (input) => ({
				conversationId: input.conversationId ?? "manual:test-1",
				text: `echo:${input.message}`,
				sessionFile: "E:/sessions/test.jsonl",
			})),
		streamChat:
			overrides?.streamChat ??
			(async (input, onEvent) => {
				onEvent({
					type: "run_started",
					conversationId: input.conversationId ?? "manual:test-1",
				});
				onEvent({
					type: "tool_started",
					toolCallId: "tool-1",
					toolName: "read",
					args: '{"path":"README.md"}',
				});
				onEvent({
					type: "text_delta",
					textDelta: `echo:${input.message}`,
				});
				onEvent({
					type: "done",
					conversationId: input.conversationId ?? "manual:test-1",
					text: `echo:${input.message}`,
					sessionFile: "E:/sessions/test.jsonl",
				});
			}),
		queueMessage:
			overrides?.queueMessage ??
			(async (input) => ({
				conversationId: input.conversationId,
				mode: input.mode,
				queued: true,
			})),
		interruptChat:
			overrides?.interruptChat ??
			(async (input) => ({
				conversationId: input.conversationId,
				interrupted: true,
			})),
		resetConversation:
			overrides?.resetConversation ??
			(async (input) => ({
				conversationId: input.conversationId,
				reset: true,
			})),
		getRunStatus:
			overrides?.getRunStatus ??
			(async (conversationId) => ({
				conversationId,
				running: false,
				contextUsage: {
					provider: "zhipu-glm",
					model: "glm-5.1",
					currentTokens: 45231,
					contextWindow: 128000,
					reserveTokens: 16384,
					maxResponseTokens: 16384,
					availableTokens: 66385,
					percent: 35,
					status: "safe",
					mode: "estimate",
				},
			})),
		subscribeRunEvents:
			overrides?.subscribeRunEvents ??
			((conversationId) => ({
				conversationId,
				running: false,
				unsubscribe: () => undefined,
			})),
		getAgentRunStatus:
			overrides?.getAgentRunStatus ??
			(() => ({
				agentId: "main",
				status: "idle",
			})),
		getRunEvents:
			overrides?.getRunEvents ??
			(async () => []),
		getConversationHistory:
			overrides?.getConversationHistory ??
			(async (conversationId) => ({
				conversationId,
				messages: [],
			})),
		getConversationState:
			overrides?.getConversationState ??
			(async (conversationId) => ({
				conversationId,
				running: false,
				contextUsage: {
					provider: "zhipu-glm",
					model: "glm-5.1",
					currentTokens: 45231,
					contextWindow: 128000,
					reserveTokens: 16384,
					maxResponseTokens: 16384,
					availableTokens: 66385,
					percent: 35,
					status: "safe",
					mode: "estimate",
				},
				messages: [],
				viewMessages: [],
				activeRun: null,
				updatedAt: "2026-04-20T00:00:00.000Z",
			})),
		getConversationCatalog:
			overrides?.getConversationCatalog ??
			(async () => ({
				currentConversationId: "manual:catalog-1",
				conversations: [
					{
						conversationId: "manual:catalog-1",
						title: "Catalog 1",
						preview: "preview",
						messageCount: 0,
						createdAt: "2026-04-20T00:00:00.000Z",
						updatedAt: "2026-04-20T00:00:00.000Z",
						running: false,
					},
				],
			})),
		createConversation:
			overrides?.createConversation ??
			(async () => ({
				conversationId: "manual:new-1",
				currentConversationId: "manual:new-1",
				created: true,
			})),
		deleteConversation:
			overrides?.deleteConversation ??
			(async (conversationId) => ({
				conversationId,
				currentConversationId: "manual:test-1",
				deleted: true,
			})),
		switchConversation:
			overrides?.switchConversation ??
			(async (conversationId) => ({
				conversationId,
				currentConversationId: conversationId,
				switched: true,
			})),
		updateConversation:
			overrides?.updateConversation ??
			(async (conversationId, patch) => ({
				conversationId,
				updated: true,
				conversation: {
					conversationId,
					title: patch.title ?? "Catalog 1",
					preview: "preview",
					messageCount: 1,
					createdAt: "2026-04-20T00:00:00.000Z",
					updatedAt: "2026-04-20T00:00:00.000Z",
					running: false,
					pinned: patch.pinned ?? false,
					backgroundColor: patch.backgroundColor ?? "",
				},
			})),
		getAvailableSkills:
			overrides?.getAvailableSkills ??
			(async () => ({
				skills: [
					{ name: "using-superpowers", path: "E:/AII/ugk-pi/.pi/skills/superpowers/using-superpowers/SKILL.md" },
					{ name: "web-access", path: "E:/AII/ugk-pi/runtime/skills-user/web-access/SKILL.md" },
				],
				source: "cache",
				cachedAt: "2026-04-24T00:00:00.000Z",
			})),
	} as unknown as AgentService;
}

function createModelConfigStoreStub(): ModelConfigStore {
	let current: ModelConfigSelection = {
		provider: "zhipu-glm",
		model: "glm-5.1",
	};
	const config = (): ModelConfigBody => ({
		current,
		providers: [
			{
				id: "zhipu-glm",
				name: "Zhipu GLM",
				vendor: "zhipu",
				region: "cn",
				priority: 10,
				models: [{ id: "glm-5.1", name: "GLM-5.1" }],
				auth: {
					configured: true,
					envVar: "ZHIPU_GLM_API_KEY",
					source: "environment",
				},
			},
			{
				id: "deepseek",
				name: "DeepSeek",
				vendor: "deepseek",
				region: "global",
				priority: 20,
				models: [
					{ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: 1000000, maxTokens: 384000 },
					{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 1000000, maxTokens: 384000 },
				],
				auth: {
					configured: true,
					envVar: "DEEPSEEK_API_KEY",
					source: "environment",
				},
			},
			{
				id: "xiaomi-mimo-cn",
				models: [
					{ id: "mimo-v2.5-pro", name: "MiMo V2.5 Pro (Xiaomi CN)", contextWindow: 1048576, maxTokens: 16384 },
				],
				name: "Xiaomi MiMo China",
				vendor: "xiaomi",
				region: "cn",
				priority: 31,
				auth: {
					configured: true,
					envVar: "XIAOMI_MIMO_API_KEY",
					source: "environment",
				},
			},
		],
	});
	return {
		async getConfig() {
			return config();
		},
		async setDefault(selection) {
			current = selection;
			return config();
		},
		async hasModel(selection) {
			return Boolean(
				config()
					.providers.find((provider) => provider.id === selection.provider)
					?.models.some((model) => model.id === selection.model),
			);
		},
	};
}

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
	assert.match(response.body, /先读产品定位/);
	assert.match(response.body, /理解验收机制/);
	assert.match(response.body, /需要对话时再进 Chat 工作台/);
	assert.match(response.body, /Agent 画板/);
	assert.match(response.body, /看它解决什么问题/);
	assert.match(response.body, /看可信 Task 怎么产生/);
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

test("GET /playground returns the test UI html", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/html/);
	assert.equal(response.headers["cache-control"], "no-store, no-cache, must-revalidate");
	assert.equal(response.headers.pragma, "no-cache");
	assert.equal(response.headers.expires, "0");
	assert.match(response.body, /UGK CLAW/);
	assert.match(response.body, /<link rel="icon" href="data:image\/svg\+xml,/);
	assert.doesNotMatch(response.body, /ugk-claw-mobile-logo\.png/);
	assert.match(response.body, /--font-sans: "OpenAI Sans"/);
	assert.match(response.body, /font-family: var\(--font-sans\)/);
	assert.match(response.body, /--font-mono: "Agave"/);
	assert.match(response.body, /\/assets\/fonts\/Agave-Regular\.ttf/);
	assert.match(response.body, /conversation-id/);
	assert.match(response.body, /file-input/);
	assert.match(response.body, /file-list/);
	assert.match(response.body, /selected-asset-list/);
	assert.match(response.body, /open-asset-library-button/);
	assert.match(response.body, /open-model-config-button/);
	assert.match(response.body, /open-model-sources-page-link/);
	assert.match(response.body, /href="\/playground\/model-sources"/);
	assert.match(response.body, /API 源管理/);
	assert.match(response.body, /model-config-dialog/);
	assert.match(response.body, /model-config-provider/);
	assert.match(response.body, /model-config-model/);
	assert.match(response.body, /验证并保存/);
	assert.match(response.body, /\/v1\/model-config/);
	assert.match(response.body, /\/v1\/model-config\/validate/);
	assert.match(response.body, /\/v1\/model-config\/default/);
	assert.match(response.body, /open-browser-workbench-button/);
	assert.match(response.body, /browser-workbench-dialog/);
	assert.match(response.body, /browser-workbench-list/);
	assert.match(response.body, /browser-workbench-targets/);
	assert.match(response.body, /function openBrowserWorkbench/);
	assert.match(response.body, /JS 内存/);
	assert.match(response.body, /页面元素/);
	assert.match(response.body, /占用偏高/);
	assert.match(response.body, /\/v1\/browsers\/" \+ encodeURIComponent\(browserId\) \+ "\/status/);
	assert.match(response.body, /\/targets\/" \+ encodeURIComponent\(targetId\) \+ "\/close/);
	assert.match(response.body, /\/start/);
	assert.match(response.body, /file-picker-action/);
	assert.match(response.body, /asset-modal-list/);
	assert.match(response.body, /close-asset-modal-button/);
	assert.match(response.body, /drop-zone/);
	assert.match(response.body, /composer-drop-target/);
	assert.match(response.body, /const chatStage = document.getElementById\("chat-stage"\)/);
	assert.match(response.body, /bindDropTarget\(chatStage\)/);
	assert.match(response.body, /bindDropTarget/);
	assert.match(response.body, /preventWindowFileDrop/);
	assert.match(response.body, /drag-overlay/);
	assert.match(response.body, /showGlobalDropHint/);
	assert.match(response.body, /document\.addEventListener\("dragenter"/);
	assert.match(response.body, /window\.addEventListener\("dragenter"/);
	assert.match(response.body, /function hasDragPayload/);
	assert.match(response.body, /function hasDroppedFiles/);
	assert.match(response.body, /function setCopyDropEffect/);
	assert.match(response.body, /function pushDragDebug/);
	assert.match(response.body, /function openAssetLibrary/);
	assert.match(response.body, /function closeAssetLibrary/);
	assert.match(response.body, /function selectAssetForReuse/);
	assert.match(response.body, /function renderSelectedAssets/);
	assert.match(response.body, /const pageRoot = document\.documentElement/);
	assert.match(response.body, /const pageBody = document\.body/);
	assert.match(response.body, /bindDropTarget\(pageRoot\)/);
	assert.match(response.body, /bindDropTarget\(pageBody\)/);
	assert.match(response.body, /dataTransfer\.items/);
	assert.match(response.body, /dataTransfer\.files/);
	assert.match(response.body, /dataTransfer\.types/);
	assert.match(response.body, /handleDroppedFiles/);
	assert.doesNotMatch(response.body, /applyFileIntentMessage/);
	assert.doesNotMatch(response.body, /__legacy_file_loaded__/);
	assert.doesNotMatch(response.body, /__legacy_pending_attachment__/);
	assert.match(response.body, /dragover/);
	assert.match(response.body, /drop/);
	assert.match(response.body, /send-button/);
	assert.match(response.body, /interrupt-button/);
	assert.match(response.body, /error-banner/);
	assert.match(response.body, /error-banner-message/);
	assert.match(response.body, /error-banner-close/);
	assert.match(response.body, /notification-live-region/);
	assert.match(response.body, /notification-toast-stack/);
	assert.match(response.body, /function connectNotificationStream\(/);
	assert.match(response.body, /new EventSource\("\/v1\/notifications\/stream"\)/);
	assert.match(response.body, /function showNotificationToast\(/);
	assert.match(response.body, /function handleNotificationBroadcastEvent\(/);
	assert.doesNotMatch(response.body, /queue-mode/);
	assert.doesNotMatch(response.body, /interrupt \/ steer/);
	assert.doesNotMatch(response.body, /wait \/ follow-up/);
	assert.doesNotMatch(response.body, /Watch The Agent Run/);
	assert.doesNotMatch(response.body, />message</);
	assert.doesNotMatch(response.body, />send</);
	assert.doesNotMatch(response.body, />interrupt</);
	assert.doesNotMatch(response.body, /id="view-skills-button"/);
	assert.match(response.body, /chat-stage/);
	assert.match(response.body, /process-note/);
	assert.match(response.body, /appendProcessEvent/);
	assert.match(response.body, /updateStreamingProcess/);
	assert.match(response.body, /transcript\.appendChild\(note\)/);
	assert.match(response.body, /getAgentApiPath\("\/debug\/skills"\)/);
	assert.match(response.body, /getAgentApiPath\("\/chat\/stream"\)/);
	assert.match(response.body, /getAgentApiPath\("\/chat\/queue"\)/);
	assert.match(response.body, /getAgentApiPath\("\/chat\/interrupt"\)/);
	assert.match(response.body, /attachments/);
	assert.match(response.body, /file-download/);
	assert.match(response.body, /selected-assets/);
	assert.match(response.body, /asset-modal-shell/);
	assert.match(response.body, /context-usage-shell/);
	assert.match(response.body, /context-usage-progress/);
	assert.match(response.body, /context-usage-summary/);
	assert.match(response.body, /context-usage-meta/);
	assert.match(response.body, /context-usage-toggle/);
	assert.match(response.body, /context-usage-battery/);
	assert.doesNotMatch(response.body, /context-usage-ring/);
	assert.match(response.body, /context-usage-dialog/);
	assert.match(response.body, /context-usage-dialog-body/);
	assert.equal(response.body.indexOf('<div class="context-usage-row">'), -1);
	assert.match(response.body, /\.context-usage-row\s*\{\s*display:\s*none;/);
	assert.match(response.body, /\.context-usage-shell\s*\{[\s\S]*grid-template-columns:\s*48px auto;/);
	assert.match(response.body, /\.context-usage-shell\s*\{[\s\S]*width:\s*88px;/);
	assert.match(response.body, /\.context-usage-shell\s*\{[\s\S]*padding:\s*5px 10px 5px 7px;/);
	assert.match(response.body, /\.context-usage-shell\s*\{[\s\S]*z-index:\s*50;/);
	assert.match(response.body, /\.context-usage-shell\s*\{[\s\S]*border-radius:\s*4px;/);
	assert.match(response.body, /\.context-usage-summary\s*\{[\s\S]*padding-right:\s*2px;/);
	assert.match(response.body, /\.context-usage-meta\s*\{[\s\S]*top:\s*calc\(100% \+ 10px\);[\s\S]*bottom:\s*auto;/);
	assert.match(response.body, /\.context-usage-meta\s*\{[\s\S]*z-index:\s*90;/);
	assert.match(response.body, /\.context-usage-meta\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*9px;/);
	assert.match(response.body, /\.context-usage-meta\s*\{[\s\S]*width:\s*min\(318px, calc\(100vw - 24px\)\);/);
	assert.match(response.body, /\.context-usage-meta\s*\{[\s\S]*transform:\s*translateY\(-4px\);/);
	assert.match(response.body, /\.context-usage-meta-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
	assert.match(response.body, /\.context-usage-meta-model\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;/);
	assert.match(response.body, /\.context-usage-progress\s*\{[\s\S]*repeating-linear-gradient/);
	assert.match(response.body, /function renderContextUsageTooltip\(/);
	assert.match(response.body, /contextUsageMeta\.innerHTML\s*=/);
	assert.match(response.body, /context-usage-meta-status/);
	assert.match(response.body, /context-usage-meta-item/);
	assert.match(response.body, /function renderContextUsageBar\(/);
	assert.match(response.body, /function syncContextUsage\(/);
	assert.match(response.body, /function estimateDraftContextTokens\(/);
	assert.match(response.body, /function buildProjectedContextUsage\(/);
	assert.match(response.body, /function openContextUsageDialog\(/);
	assert.match(response.body, /function closeContextUsageDialog\(/);
	assert.match(
		response.body,
		/function closeContextUsageDialog\(\)\s*\{[\s\S]*releasePanelFocusBeforeHide\(contextUsageDialog, contextUsageShell\);[\s\S]*contextUsageDialog\.setAttribute\("aria-hidden", "true"\);/,
	);
	assert.doesNotMatch(
		response.body,
		/function closeContextUsageDialog\(\)\s*\{[\s\S]*contextUsageDialog\.setAttribute\("aria-hidden", "true"\);[\s\S]*releasePanelFocusBeforeHide\(contextUsageDialog,/,
	);
	assert.match(response.body, /function toggleContextUsageDetails\(/);
	assert.match(response.body, /__ugkPlaygroundMarkdownParser/);
	assert.match(response.body, /globalThis\.marked/);
	assert.doesNotMatch(response.body, /CODEBLOCK/);
	assert.match(
		response.body,
		/\.message-content \.markdown-table-scroll\s*\{\s*display:\s*block;\s*width:\s*100%;\s*max-width:\s*100%;\s*overflow-x:\s*auto;/,
	);
	assert.match(response.body, /\.message-content\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;/);
	assert.match(response.body, /\.message-content pre\s*\{[\s\S]*min-width:\s*0;[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*overflow-x:\s*auto;/);
	assert.match(response.body, /\.message-content \.code-block\s*\{[\s\S]*display:\s*block;[\s\S]*min-width:\s*0;[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*overflow:\s*hidden;/);
	assert.match(response.body, /\.message-content pre\s*\{[\s\S]*border:\s*0;/);
	assert.match(response.body, /\.message-content \.code-block\s*\{[\s\S]*border:\s*0;/);
	assert.match(response.body, /\.message-content \.code-block-toolbar\s*\{[\s\S]*border-bottom:\s*0;[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /\.message-content \.code-block pre\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*overflow-x:\s*auto;/);
	assert.match(
		response.body,
		/\.message-content table\s*\{\s*width:\s*100%;\s*max-width:\s*100%;\s*border-collapse:\s*collapse;/,
	);
	assert.match(
		response.body,
		/\.message-content th,[\s\S]*\.message-content td\s*\{[\s\S]*min-width:\s*60px;[\s\S]*max-width:\s*320px;[\s\S]*white-space:\s*normal;[\s\S]*overflow-wrap:\s*break-word;[\s\S]*word-break:\s*break-word;/,
	);
	assert.match(response.body, /wrapper\.className = "markdown-table-scroll";/);
	assert.match(response.body, /:root\[data-theme="light"\] \.message-content \.markdown-table-scroll,[\s\S]*background:\s*var\(--chat-table-bg\);/);
	assert.match(response.body, /:root\[data-theme="light"\] \.message-content th,[\s\S]*border-right-color:\s*#c8d6ea;[\s\S]*background:\s*#dce8f8;/);
	assert.match(response.body, /:root\[data-theme="light"\] \.message-content td,[\s\S]*border-right-color:\s*#d7e1ee;[\s\S]*color:\s*#26344f;/);
	assert.match(response.body, /:root\[data-theme="light"\] \.message-content \.code-block-toolbar,[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /:root\[data-theme="light"\] \.task-inbox-result-bubble \.message-content \.code-block-toolbar,[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /:root\[data-theme="light"\] \.assistant-run-log-trigger\.ok \.assistant-run-log-hint,[\s\S]*color:\s*#08784b;/);
	assert.match(response.body, /:root\[data-theme="light"\] \.assistant-status-shell\s*\{[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /:root\[data-theme="light"\] \.assistant-status-summary\s*\{[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /matchMedia\("\(max-width: 640px\)"\)/);
	assert.match(response.body, /getAgentApiPath\("\/chat\/status"\)/);
	assert.match(response.body, /mode:\s*"steer"/);
	assert.match(response.body, /height: calc\(100vh - 40px\)/);
	assert.match(response.body, /\.chat-stage\s*\{[\s\S]*display: flex;/);
	assert.match(response.body, /\.chat-stage\s*\{[\s\S]*flex-direction: column;/);
	assert.match(response.body, /\.transcript\s*\{[\s\S]*flex: 1 1 auto;/);
	assert.match(response.body, /\.transcript\s*\{[\s\S]*display: grid;/);
	assert.match(response.body, /\.transcript-pane\s*\{[\s\S]*align-items: stretch;/);
	assert.match(response.body, /--conversation-width: 640px;/);
	assert.match(response.body, /\.transcript-pane\s*\{[\s\S]*width: min\(var\(--conversation-width\), 100%\);/);
	assert.match(response.body, /\.transcript\s*\{[\s\S]*justify-items: stretch;/);
	assert.match(response.body, /\.transcript\s*\{[\s\S]*width: 100%;/);
	assert.match(response.body, /\.message\s*\{[\s\S]*justify-items: stretch;/);
	assert.match(response.body, /\.message\s*\{[\s\S]*width: 100%;/);
	assert.match(response.body, /\.message\s*\{[\s\S]*padding: 16px 0 0;/);
	assert.match(response.body, /\.message-meta,\s*\.message-body\s*\{[\s\S]*width: 100%;/);
	assert.match(response.body, /\.message-body\s*\{[\s\S]*border-radius: 4px;/);
	assert.match(response.body, /\.message-body\s*\{[\s\S]*background: var\(--chat-assistant-bg\);/);
	assert.match(response.body, /\.message-body\s*\{[\s\S]*border: 1px solid var\(--chat-assistant-border\);/);
	assert.match(response.body, /\.message-body\s*\{[\s\S]*box-shadow: none;/);
	assert.match(response.body, /\.message-body\s*\{[\s\S]*backdrop-filter: none;/);
	assert.match(response.body, /\.message\.user \.message-body\s*\{[\s\S]*background:\s*var\(--chat-user-bg\);/);
	assert.doesNotMatch(response.body, /:root\[data-theme="light"\] \.message\.user \.message-body::after/);
	assert.match(response.body, /:root\[data-theme="light"\] \.message\.user \.message-content\s*\{[\s\S]*color:\s*var\(--chat-user-fg\);/);
	assert.match(response.body, /\.chat-stage\s*\{[\s\S]*position:\s*relative;/);
	assert.match(response.body, /\.error-banner\s*\{[\s\S]*position:\s*absolute;/);
	assert.match(response.body, /\.error-banner\s*\{[\s\S]*display:\s*none;/);
	assert.match(response.body, /\.error-banner\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
	assert.match(response.body, /\.error-banner\s*\{[\s\S]*top:\s*0;/);
	assert.match(response.body, /\.error-banner\s*\{[\s\S]*left:\s*50%;/);
	assert.match(response.body, /\.error-banner\s*\{[\s\S]*transform:\s*translateX\(-50%\);/);
	assert.match(response.body, /\.error-banner\s*\{[\s\S]*border:\s*0;/);
	assert.match(response.body, /\.error-banner\s*\{[\s\S]*border-radius:\s*4px;/);
	assert.match(response.body, /\.error-banner\s*\{[\s\S]*background:\s*#2f1119;/);
	assert.match(response.body, /\.error-banner\s*\{[\s\S]*z-index:\s*6;/);
	assert.match(response.body, /\.chat-stage > \.error-banner\s*\{[\s\S]*z-index:\s*95;/);
	assert.match(response.body, /\.chat-stage > \.notification-live-region\s*\{[\s\S]*z-index:\s*90;/);
	assert.match(response.body, /\.error-banner\s*\{[\s\S]*pointer-events:\s*auto;/);
	assert.match(response.body, /\.error-banner\.visible\s*\{[\s\S]*display:\s*grid;/);
	assert.match(response.body, /\.error-banner\[hidden\]\s*\{[\s\S]*display:\s*none !important;/);
	assert.match(response.body, /\.error-banner-close\s*\{[\s\S]*border-radius:\s*4px;/);
	assert.match(response.body, /\.error-banner-close\s*\{[\s\S]*border:\s*0;/);
	assert.match(response.body, /\.error-banner-close\s*\{[\s\S]*background:\s*#421823;/);
	assert.match(response.body, /<div id="error-banner" class="error-banner" role="alert" hidden>/);
	assert.match(response.body, /errorBanner\.hidden = false;/);
	assert.match(response.body, /errorBanner\.hidden = true;/);
	assert.match(response.body, /errorBannerClose\.addEventListener\("click", \(\) => \{\s*clearError\(\);\s*\}\);/);
	assert.doesNotMatch(response.body, /\.shell\[data-stage-mode="landing"\] \.error-banner\s*\{/);
	assert.match(response.body, /\.message\.user \.message-content\s*\{[\s\S]*text-align:\s*left;/);
	assert.doesNotMatch(response.body, /\.message\.user \.message-content\s*\{[^}]*text-align:\s*right;/);
	assert.match(response.body, /function formatControlActionReason\(action, reason\)\s*\{/);
	assert.match(response.body, /function getControlActionErrorMessage\(action, payload, fallbackMessage\)\s*\{/);



	assert.match(response.body, /updateStreamingProcess\("ok",/);
	assert.match(response.body, /state\.conversationId\)/);
	assert.doesNotMatch(response.body, /__legacy_queue_error_copy__/);
	assert.doesNotMatch(response.body, /__legacy_interrupt_error_copy__/);
	assert.match(response.body, /const visualKind = kind === "user" \? "user" : "assistant";/);
	assert.match(response.body, /card\.className = "message " \+ visualKind;/);
	assert.match(response.body, /card\.dataset\.messageKind = kind;/);
	assert.match(response.body, /function canOpenConnRunDetails\(entry\)/);
	assert.match(response.body, /function openConnRunDetails\(entry, restoreFocusElement\)/);
	assert.match(response.body, /open-conn-manager-button/);
	assert.match(response.body, /conn-manager-dialog/);
	assert.match(response.body, /conn-manager-list/);
	assert.match(response.body, /id="runtime-summary"/);
	assert.match(response.body, /id="runtime-model-value"/);
	assert.match(response.body, /id="runtime-browser-value"/);
	assert.match(response.body, /function renderRuntimeSummary\(\)/);
	assert.match(response.body, /function syncRuntimeSummary\(\)/);
	assert.match(response.body, /当前 API 源/);
	assert.match(response.body, /当前 Chrome/);
	assert.doesNotMatch(response.body, /查看 conn、暂停或恢复调度、立即入队一次运行/);
	assert.match(response.body, /function openConnManager\(/);
	assert.match(response.body, /function loadConnManager\(/);
	assert.match(response.body, /function hydrateConnManagerRunsFromList\(/);
	assert.match(response.body, /function renderConnManager\(/);
	assert.match(response.body, /function runConnNow\(/);
	assert.match(response.body, /function hasConnManagerRunInFlight\(connId\)/);
	assert.match(response.body, /const CONN_RUN_REFRESH_MAX_ATTEMPTS = 120/);
	assert.match(response.body, /state\.connManagerActionConnId === conn\.connId && state\.connManagerActionKind === "run" \? "入队中" : hasRunInFlight \? "执行中" : "立即执行"/);
	assert.match(response.body, /conn\.status === "paused" \? "恢复中" : "暂停中"/);
	assert.match(response.body, /deleteSelectedConnsButton\.textContent = state\.connManagerActionKind === "bulk-delete" \? "删除中" : "删除所选"/);
	assert.match(response.body, /setConnManagerNotice\("已触发执行，正在后台运行："/);
	assert.match(response.body, /scheduleConnManagerRunRefresh\(conn\.connId, 0\)/);
	assert.match(response.body, /function toggleConnPaused\(/);
	assert.match(response.body, /function deleteConn\(conn\)/);
	assert.doesNotMatch(response.body, /conns\.map\(async \(conn\)/);
	assert.match(response.body, /conn-manager-filter/);
	assert.match(response.body, /conn-manager-selected-count/);
	assert.match(response.body, /delete-selected-conns-button/);
	assert.match(response.body, /function getVisibleConnManagerItems\(/);
	assert.match(response.body, /connManagerUnreadLatestRunTimesByConnId: \{\}/);
	assert.match(response.body, /function getConnUnreadTimeMs\(conn\)/);
	assert.match(response.body, /state\.connManagerUnreadLatestRunTimesByConnId\?\.\[conn\?\.connId\]/);
	assert.match(response.body, /function getConnLifecycleSortRank\(conn\)[\s\S]*conn\?\.status === "active"[\s\S]*conn\?\.status === "paused"[\s\S]*conn\?\.status === "completed"/);
	assert.match(response.body, /function getConnNextRunTimeMs\(conn\)/);
	assert.match(response.body, /function getConnLatestRunTimeMs\(/);
	assert.match(response.body, /function compareConnManagerItems\(/);
	assert.match(response.body, /\.sort\(compareConnManagerItems\)/);
	assert.match(response.body, /\.conn-manager-status\.completed/);
	assert.match(response.body, /function deleteSelectedConns\(/);
	assert.match(response.body, /\/v1\/conns\/bulk-delete/);
	assert.match(response.body, /delete-selected-conns-button/);
	assert.match(response.body, /method:\s*"DELETE"/);
	assert.match(response.body, /\/v1\/conns\/"\s*\+\s*encodeURIComponent\(conn\.connId\)/);
	assert.match(response.body, /open-conn-editor-button/);
	assert.match(response.body, /conn-editor-dialog/);
	assert.match(response.body, /conn-editor-title/);
	assert.match(response.body, /conn-editor-form/);
	assert.match(response.body, /conn-editor-target-type/);
	assert.match(response.body, /conn-editor-schedule-kind/);
	assert.match(response.body, /conn-editor-target-row/);
	assert.match(response.body, /\.conn-editor-field\[hidden\]/);
	assert.match(response.body, /\.conn-editor-field\.is-hidden/);
	assert.match(response.body, /conn-editor-schedule-panel/);
	assert.match(response.body, /conn-editor-title-input/);
	assert.match(response.body, /conn-editor-execution-type/);
	assert.match(response.body, /conn-editor-team-group-id/);
	assert.match(response.body, /function fetchTeamTaskGroups\(/);
	assert.match(response.body, /\/v1\/team\/task-groups/);
	assert.match(response.body, /function getTeamTaskGroupValidationMessage\(group\)/);
	assert.match(response.body, /option\.textContent \+= "（不可运行）";/);
	assert.match(response.body, /option\.disabled = true;/);
	assert.match(response.body, /function buildConnExecutionPayload\(/);
	assert.match(response.body, /throw new Error\("请先选择可运行的 Team Group"\)/);
	assert.match(response.body, /const execution = buildConnExecutionPayload\(\);/);
	assert.match(response.body, /execution,/);
	assert.match(response.body, /type: "team_group"/);
	assert.match(response.body, /execution\.type === "team_group"/);
	assert.match(response.body, /function appendConnRunDetailLinkRow\(section, label, href\)/);
	assert.match(
		response.body,
		/appendConnRunDetailLinkRow\(group, "Group JSON", groupId \? "\/v1\/team\/task-groups\/" \+ encodeURIComponent\(groupId\) : ""\)/,
	);
	assert.match(
		response.body,
		/appendConnRunDetailLinkRow\(group, "GroupRun JSON", groupRunId \? "\/v1\/team\/task-group-runs\/" \+ encodeURIComponent\(groupRunId\) : ""\)/,
	);
	assert.match(response.body, /const groupRunStartStatus = String\(snapshot\.groupRunStartStatus \|\| ""\);/);
	assert.match(response.body, /const groupRunStartError = String\(snapshot\.groupRunStartError \|\| ""\);/);
	assert.match(response.body, /appendConnRunDetailRow\(group, "groupRunStartStatus", groupRunStartStatus, \{ asCode: true \}\);/);
	assert.match(response.body, /appendConnRunDetailRow\(group, "groupRunStartError", groupRunStartError, \{ asCode: true \}\);/);
	assert.match(response.body, /link\.target = "_blank";/);
	assert.match(response.body, /link\.rel = "noreferrer";/);
	assert.match(
		response.body,
		/const isSkippedTeamGroupRun = snapshot\.skipped === true;[\s\S]*if \(isSkippedTeamGroupRun\) \{[\s\S]*appendConnRunDetailRow\(group, "Skipped"/,
	);
	assert.doesNotMatch(response.body, /run\.status === "failed" && run\.errorText[\s\S]{0,260}Skipped/);
	assert.match(response.body, /conn-editor-prompt/);
	assert.match(response.body, /conn-editor-once-at/);
	assert.match(response.body, /conn-editor-interval-start/);
	assert.match(response.body, /conn-editor-interval-minutes/);
	assert.match(response.body, /\/vendor\/flatpickr\/flatpickr\.min\.css/);
	assert.match(response.body, /\/vendor\/flatpickr\/flatpickr\.min\.js/);
	assert.match(response.body, /\/vendor\/flatpickr\/l10n\/zh\.js/);
	assert.match(response.body, /id="conn-editor-once-at"[\s\S]*type="text"[\s\S]*data-conn-time-picker="datetime"/);
	assert.match(response.body, /id="conn-editor-interval-start"[\s\S]*type="text"[\s\S]*data-conn-time-picker="datetime"/);
	assert.match(response.body, /id="conn-editor-time-of-day"[\s\S]*type="text"[\s\S]*data-conn-time-picker="time"/);
	assert.match(response.body, /data-schedule-panel="once"/);
	assert.match(response.body, /data-schedule-panel="interval"/);
	assert.match(response.body, /data-schedule-panel="daily"/);
	assert.match(response.body, /conn-editor-advanced/);
	assert.match(response.body, /conn-editor-time-of-day/);
	assert.match(response.body, /function initializeConnEditorTimePickers\(/);
	assert.match(response.body, /initializeConnEditorTimePickers\(\);/);
	assert.match(response.body, /disableMobile:\s*true/);
	assert.match(response.body, /enableTime:\s*true/);
	assert.match(response.body, /time_24hr:\s*true/);
	assert.match(response.body, /noCalendar:\s*timeOnly/);
	assert.match(response.body, /dateFormat:\s*timeOnly \? "H:i" : "Y-m-d\\\\TH:i"/);
	assert.match(response.body, /minuteIncrement:\s*5/);
	assert.match(response.body, /\.conn-time-picker-calendar\s*\{/);
	assert.match(response.body, /function parseConnCronExpression\(/);
	assert.match(response.body, /function parseConnTimeOfDay\(/);
	assert.match(response.body, /match\(\/\^\(\\d\{1,2\}\):\(\\d\{2\}\)/);
	assert.doesNotMatch(response.body, /match\(\/\^\(\\\\d\{1,2\}\):\(\\\\d\{2\}\)/);
	assert.match(response.body, /function inferConnScheduleMode\(/);
	assert.match(response.body, /function buildConnDailyCronExpression\(/);
	assert.match(response.body, /conn-editor-profile-id/);
	assert.match(response.body, /conn-editor-browser-id/);
	assert.match(response.body, /conn-editor-model-provider/);
	assert.match(response.body, /conn-editor-model-id/);
	assert.match(response.body, /conn-editor-agent-spec-id/);
	assert.match(response.body, /conn-editor-skill-set-id/);
	assert.doesNotMatch(response.body, /conn-editor-model-policy-id/);
	assert.match(response.body, /conn-editor-upgrade-policy/);
	assert.match(response.body, /conn-editor-max-run-seconds/);
	assert.match(response.body, /conn-editor-asset-refs/);
	assert.match(response.body, /conn-editor-pick-assets-button/);
	assert.match(response.body, /conn-editor-upload-assets-button/);
	assert.match(response.body, /conn-editor-asset-file-input/);
	assert.match(response.body, /conn-editor-selected-assets/);
	assert.match(response.body, /connEditorUploadingAssets/);
	assert.match(response.body, /FormData/);
	assert.match(response.body, /\/v1\/assets\/upload/);
	assert.doesNotMatch(response.body, /collectAttachments/);
	assert.doesNotMatch(response.body, /arrayBufferToBase64/);
	assert.doesNotMatch(response.body, /pendingAttachments/);
	assert.doesNotMatch(response.body, /renderAttachmentList/);
	assert.doesNotMatch(response.body, /estimateAttachmentTokenCount/);
	assert.match(response.body, /PROMPT_TEXT_ASSET_FALLBACK_CHARS = 24000/);
	assert.match(response.body, /function estimateStoredTextAssetTokenCount\(sizeBytes\)/);
	assert.match(response.body, /function estimateMetadataAssetTokenCount\(asset\)/);
	assert.match(response.body, /上传中/);
	assert.match(response.body, /上传失败/);
	assert.match(response.body, /conn-editor-target-id-label/);
	assert.match(response.body, /conn-editor-target-id-hint/);
	assert.match(response.body, /function describeConnTargetInput\(/);
	assert.match(response.body, /function buildConnTargetPayload\(\)/);
	assert.match(response.body, /conn-editor-target-preview/);
	assert.match(response.body, /option value="task_inbox"/);
	assert.match(response.body, /label\.textContent = "任务消息";/);
	assert.match(response.body, /detail\.textContent = "后台任务结果会投递到任务消息页";/);
	assert.match(response.body, /id\.textContent = targetId \|\| "填写 chat id";/);
	assert.match(response.body, /id\.textContent = targetId \|\| "填写 open id";/);
	assert.doesNotMatch(response.body, /label\.textContent = "\?{3,}";/);
	assert.doesNotMatch(response.body, /detail\.textContent = "\?{3,}";/);
	assert.doesNotMatch(response.body, /option value="current_conversation"/);
	assert.doesNotMatch(response.body, /option value="conversation"/);
	assert.doesNotMatch(response.body, /function describeConversationTarget\(/);
	assert.match(response.body, /function renderConnEditorTargetPreview\(/);
	assert.match(response.body, /function setConnManagerNotice\(/);
	assert.match(response.body, /conn-manager-notice/);
	assert.match(response.body, /state\.connManagerHighlightedConnId/);
	assert.match(response.body, /conn-manager-run-summary/);
	assert.match(response.body, /details\.className = "conn-manager-run-details";/);
	assert.match(response.body, /function describeConnStatusLabel\(/);
	assert.match(response.body, /function describeConnScheduleSummary\(/);
	assert.match(response.body, /function describeActivitySourceLabel\(/);
	assert.match(response.body, /结果发到：/);
	assert.match(response.body, /执行方式：/);
	assert.match(response.body, /运行节奏：/);
	assert.match(response.body, /function openConnEditor\(/);
	assert.match(response.body, /function submitConnEditor\(/);
	assert.match(response.body, /x-ugk-browser-binding-confirmed/);
	assert.match(response.body, /method:\s*isEditing \? "PATCH" : "POST"/);
	assert.match(response.body, /isEditing \? "\/v1\/conns\/" \+ encodeURIComponent\(state\.connEditorConnId\) : "\/v1\/conns"/);
	assert.match(response.body, /function scheduleConversationLayoutSync\(/);
	assert.match(response.body, /function scheduleResumeConversationSync\(/);
	assert.match(response.body, /function scheduleConversationHistoryPersist\(/);
	assert.match(response.body, /\.message\.assistant \.message-content\s*\{[\s\S]*font-size:\s*13px;[\s\S]*line-height:\s*1\.78;/);
	assert.match(response.body, /\.message\.assistant \.message-content h1\s*\{[\s\S]*font-size:\s*18px;/);
	assert.match(response.body, /\.message\.assistant \.message-content h2\s*\{[\s\S]*font-size:\s*16px;/);
	assert.match(response.body, /\.message\.assistant \.message-content h3\s*\{[\s\S]*font-size:\s*14px;/);
	assert.match(response.body, /\.message\.assistant \.message-content a\s*\{[\s\S]*color:\s*#8fd6ff;/);
	assert.match(response.body, /\.message\.user \.message-content a\s*\{[\s\S]*color:\s*#bfffd4;/);
	assert.match(response.body, /\.message\.user \.file-chip-label\s*\{[\s\S]*color:\s*#17320f;/);
	assert.match(response.body, /\.message\.assistant \.message-content code\s*\{[\s\S]*color:\s*#ffe6ad;/);
	assert.match(response.body, /\.message\.assistant \.message-content blockquote\s*\{[\s\S]*border-left-color:\s*rgba\(128, 232, 198, 0\.46\);/);
	assert.match(response.body, /\.message\.assistant \.message-content th\s*\{[\s\S]*background:\s*rgba\(143, 214, 255, 0\.1\);/);
	assert.doesNotMatch(response.body, /\.message\.user \.message-content h1\s*\{[\s\S]*font-size:\s*18px;/);
	assert.match(response.body, /open-task-inbox-button/);
	assert.match(response.body, /mobile-menu-task-inbox-button/);
	assert.match(response.body, /task-inbox-view/);
	assert.match(response.body, /task-inbox-list/);
	assert.doesNotMatch(response.body, /id="desktop-file-menu"/);
	assert.doesNotMatch(response.body, /function setDesktopFileMenuOpen\(open\)/);
	assert.match(response.body, /id="file-picker-action" class="composer-file-action"/);
	assert.match(response.body, /filePickerAction\.addEventListener\("click", \(\) => \{[\s\S]*fileInput\.click\(\);/);
	assert.match(response.body, /openAssetLibraryButton\.addEventListener\("click", \(\) => \{[\s\S]*toggleWorkspacePanel/);
	assert.doesNotMatch(response.body, /\.desktop-file-menu:hover \.desktop-file-menu-panel/);
	assert.doesNotMatch(response.body, /\.desktop-file-menu:focus-within \.desktop-file-menu-panel/);
	assert.doesNotMatch(response.body, /\.desktop-file-menu\[data-open="true"\] \.desktop-file-menu-panel/);
	assert.match(response.body, /<main id="chat-stage" class="chat-stage" data-workspace-mode="chat">/);
	assert.match(response.body, /function setWorkspaceMode\(mode, options\)/);
	assert.match(response.body, /function openWorkspacePanel\(mode, panel, options\)/);
	assert.match(response.body, /function closeWorkspacePanel\(mode, panel\)/);
	assert.match(response.body, /function closeInactiveWorkspacePanels\(activeMode\)/);
	assert.match(response.body, /function isDesktopWorkspaceMode\(\)/);
	assert.match(response.body, /workspace-contained/);
	assert.match(response.body, /chatStage\.dataset\.workspaceMode = state\.workspaceMode/);
	assert.match(response.body, /if \(activeMode !== "assets" && state\.assetModalOpen\)/);
	assert.match(response.body, /if \(activeMode !== "conn" && state\.connManagerOpen\)/);
	assert.match(response.body, /if \(activeMode !== "task" && state\.taskInboxOpen\)/);
	assert.match(response.body, /openAssetLibrary\(openAssetLibraryButton, \{ mode: "workspace" \}\)/);
	assert.match(response.body, /openTaskInbox\(openTaskInboxButton, \{ mode: "workspace" \}\)/);
	assert.match(response.body, /window\.location\.assign\("\/playground\/conn"\)/);
	assert.match(response.body, /window\.location\.assign\("\/playground\/agents"\)/);
	assert.match(response.body, /function shouldOpenChatViewFromUrl\(\)/);
	assert.match(response.body, /params\.get\("view"\) === "chat"/);
	assert.match(response.body, /function clearChatViewUrlHint\(\)/);
	assert.match(response.body, /if \(shouldOpenChatViewFromUrl\(\)\) \{[\s\S]*shell\.dataset\.home = "false";[\s\S]*ensureCurrentConversation\(\{ silent: true \}\);/);
	assert.doesNotMatch(response.body, /window\.open\("\/playground\/conn", "_blank"\)/);
	assert.doesNotMatch(response.body, /window\.open\("\/playground\/agents", "_blank"\)/);
	assert.match(response.body, /<a class="telemetry-card telemetry-action" href="\/playground\/team" data-tooltip-title="Team Runtime"/);
	assert.match(response.body, /<a href="\/playground\/team" class="mobile-overflow-menu-item" role="menuitem">/);
	assert.doesNotMatch(response.body, /href="\/playground\/team"[^>]*target="_blank"/);
	assert.doesNotMatch(response.body, /function loadAssetLibrary\(/);
	assert.doesNotMatch(response.body, /state\.assetItems/);
	assert.doesNotMatch(response.body, /data-primary-view="chat"/);
	assert.match(response.body, /task-inbox-unread-badge/);
	assert.match(response.body, /mobile-overflow-task-inbox-badge/);
	assert.match(response.body, /mobile-topbar-notification-badge/);
	assert.match(response.body, /mark-all-task-inbox-read-button/);
	assert.match(response.body, /markAllTaskInboxReadButton\.textContent = state\.taskInboxMarkingRead \? "处理中" : "全部已读"/);
	assert.match(response.body, /refreshTaskInboxButton\.textContent = "刷新中"/);
	assert.doesNotMatch(response.body, /task-inbox-filter-unread-button/);
	assert.doesNotMatch(response.body, /task-inbox-filter-all-button/);
	assert.match(response.body, /task-inbox-load-more-button/);
	assert.match(response.body, /task-inbox-item-unread-dot/);
	assert.match(response.body, /task-inbox-item-time/);
	assert.doesNotMatch(response.body, /选中后会立刻回到当前输入区/);
	assert.match(response.body, /class="topbar asset-modal-head"[\s\S]*id="close-asset-modal-button"[\s\S]*aria-label="返回对话"[\s\S]*id="asset-modal-title"[\s\S]*id="asset-modal-count"[\s\S]*id="refresh-assets-button"/);
	assert.match(response.body, /class="topbar asset-modal-head mobile-work-topbar"[\s\S]*id="close-conn-manager-button"[\s\S]*aria-label="返回对话"[\s\S]*id="conn-manager-title"[\s\S]*id="open-conn-editor-button"[\s\S]*id="refresh-conn-manager-button"/);
	assert.match(response.body, /class="topbar asset-modal-head mobile-work-topbar"[\s\S]*id="close-conn-editor-button"[\s\S]*aria-label="返回对话"[\s\S]*id="conn-editor-title"[\s\S]*id="save-conn-editor-button"[\s\S]*id="cancel-conn-editor-button"/);
	assert.match(response.body, /class="topbar pane-head task-inbox-head"[\s\S]*id="close-task-inbox-button"[\s\S]*aria-label="返回对话"[\s\S]*id="task-inbox-title">任务消息[\s\S]*id="task-inbox-unread-count"[\s\S]*id="mark-all-task-inbox-read-button"[\s\S]*id="refresh-task-inbox-button"/);
	assert.doesNotMatch(response.body, /asset-head-breadcrumb/);
	assert.doesNotMatch(response.body, /task-inbox-head-breadcrumb/);
	assert.doesNotMatch(response.body, /工作区 \//);
	assert.doesNotMatch(response.body, /id="close-asset-modal-button"[^>]*>回到对话/);
	assert.doesNotMatch(response.body, /id="close-conn-manager-button"[^>]*>回到对话/);
	assert.doesNotMatch(response.body, /id="close-conn-editor-button"[^>]*>回到对话/);
	assert.doesNotMatch(response.body, /id="close-task-inbox-button"[^>]*>回到对话/);
	assert.doesNotMatch(response.body, /asset-modal-page-actions[\s\S]*refresh-assets-button/);
	assert.doesNotMatch(response.body, /conn-manager-primary-actions[\s\S]*open-conn-editor-button/);
	assert.doesNotMatch(response.body, /conn-editor-page-actions[\s\S]*save-conn-editor-button/);
	assert.doesNotMatch(response.body, /task-inbox-controls[\s\S]*task-inbox-filter-unread-button/);
	assert.match(response.body, /\.task-inbox-view\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*z-index:\s*60;/);
	assert.match(response.body, /\.task-inbox-view\.open\s*\{[\s\S]*display:\s*flex;/);
	assert.match(response.body, /\.chat-stage > \.workspace-contained\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset:\s*0;/);
	assert.match(response.body, /\.chat-stage\[data-workspace-mode="assets"\] > #asset-modal\.workspace-contained/);
	assert.match(response.body, /\.chat-stage\[data-workspace-mode="conn"\] > #conn-manager-dialog\.workspace-contained/);
	assert.match(response.body, /\.chat-stage\[data-workspace-mode="task"\] > #task-inbox-view\.workspace-contained/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.workspace-contained\s*\{[\s\S]*position:\s*fixed;/);
	assert.match(response.body, /\.task-inbox-pane\s*\{[\s\S]*height:\s*min\(78vh, 760px\);[\s\S]*border-radius:\s*8px;/);
	assert.match(response.body, /\.asset-modal-head\s*\{[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /\.asset-modal-head\s*\{[\s\S]*flex-direction:\s*row;/);
	assert.match(response.body, /\.asset-modal-actions\s*\{[\s\S]*flex-wrap:\s*nowrap;[\s\S]*overflow-x:\s*auto;/);
	assert.match(response.body, /\.conn-manager-toolbar\s*\{[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /\.context-usage-dialog-panel\s*\{[\s\S]*border:\s*0;/);
	assert.match(response.body, /\.context-usage-dialog-panel\s*\{[\s\S]*border-radius:\s*8px;/);
	assert.match(response.body, /\.context-usage-dialog-panel\s*\{[\s\S]*background:[\s\S]*#060711;/);
	assert.match(response.body, /\.context-usage-dialog-head\s*\{[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /\.context-usage-dialog-close\s*\{[\s\S]*border:\s*0;/);
	assert.match(response.body, /\.context-usage-dialog-body\s*\{[\s\S]*border:\s*0;/);
	assert.match(response.body, /\.context-usage-dialog-body\s*\{[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /\.chat-run-log-panel\s*\{[\s\S]*border:\s*0;[\s\S]*border-radius:\s*8px;[\s\S]*#060711;/);
	assert.match(response.body, /\.chat-run-log-head\s*\{[\s\S]*border-bottom:\s*0;[\s\S]*background:\s*#101421;/);
	assert.match(response.body, /\.chat-run-log-item\s*\{[\s\S]*border:\s*0;[\s\S]*border-radius:\s*4px;[\s\S]*background:\s*#0b0e19;/);
	assert.match(response.body, /\.confirm-dialog-panel\s*\{[\s\S]*border:\s*0;[\s\S]*border-radius:\s*8px;[\s\S]*#060711;/);
	assert.match(response.body, /\.conn-run-details-panel\s*\{[\s\S]*border:\s*0;[\s\S]*background:[\s\S]*#060711;/);
	assert.match(response.body, /\.conn-run-section\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*#0b0e19;/);
	assert.match(response.body, /function renderContextUsageDialog\(projectedUsage, statusLabel, modeLabel\)/);
	assert.match(response.body, /context-usage-dialog-hero/);
	assert.match(response.body, /context-usage-dialog-metrics/);
	assert.match(response.body, /context-usage-dialog-model/);
	assert.match(response.body, /task-inbox-result-bubble/);
	assert.doesNotMatch(response.body, /后台任务跑完的结果统一收在这里/);
	assert.match(response.body, /task-inbox-head-actions[\s\S]*mark-all-task-inbox-read-button[\s\S]*refresh-task-inbox-button/);
	assert.match(response.body, /\.task-inbox-head\s*\{[\s\S]*align-items:\s*center;[\s\S]*padding:\s*8px 12px;/);
	assert.match(response.body, /\.task-inbox-head\s*\{[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /\.task-inbox-head-actions\s*\{[\s\S]*flex-wrap:\s*nowrap;[\s\S]*overflow-x:\s*auto;/);
	assert.doesNotMatch(response.body, /task-inbox-filter-row/);
	assert.match(response.body, /\.task-inbox-item-title-row\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto;/);
	assert.match(response.body, /\.task-inbox-item-time\s*\{[\s\S]*font-size:\s*12px;[\s\S]*font-weight:\s*700;/);
	assert.match(response.body, /\.task-inbox-item:not\(\.is-expanded\) \.task-inbox-result-bubble,[\s\S]*\.task-inbox-item:not\(\.is-expanded\) \.task-inbox-item-actions,[\s\S]*\.task-inbox-item:not\(\.is-expanded\) \.task-inbox-item-kind\s*\{[\s\S]*display:\s*none;/);
	assert.match(response.body, /\.task-inbox-item-text\s*\{[\s\S]*font-size:\s*12px;[\s\S]*line-height:\s*1\.7;/);
	assert.match(response.body, /\.task-inbox-result-bubble \.message-content h1\s*\{[\s\S]*font-size:\s*18px;/);
	assert.match(response.body, /\.task-inbox-result-bubble \.message-content h2\s*\{[\s\S]*font-size:\s*16px;/);
	assert.match(response.body, /\.task-inbox-result-bubble \.message-content h3\s*\{[\s\S]*font-size:\s*14px;/);
	assert.match(response.body, /\.task-inbox-result-bubble \.message-content a\s*\{[\s\S]*color:\s*#8fd6ff;/);
	assert.match(response.body, /\.task-inbox-result-bubble \.message-content code\s*\{[\s\S]*color:\s*#ffe6ad;/);
	assert.match(response.body, /\.task-inbox-result-bubble \.message-content blockquote\s*\{[\s\S]*border-left-color:\s*rgba\(128, 232, 198, 0\.46\);/);
	assert.match(response.body, /\.task-inbox-result-bubble \.message-content th\s*\{[\s\S]*background:\s*rgba\(143, 214, 255, 0\.1\);/);
	assert.match(response.body, /text\.className = "task-inbox-item-text message-content"/);
	assert.match(response.body, /text\.innerHTML = renderMessageMarkdown\(resultText\)/);
	assert.match(response.body, /appendFileDownloadList\(body, activity\.files\)/);
	assert.match(response.body, /actions\.className = "task-inbox-item-actions message-actions"/);
	assert.match(response.body, /function openTaskInbox\(/);
	assert.match(response.body, /function loadTaskInbox\(/);
	assert.match(response.body, /function renderTaskInbox\(/);
	assert.doesNotMatch(response.body, /params\.set\("unreadOnly", "true"\)/);
	assert.match(response.body, /function toggleTaskInboxItemExpanded\(activityId\)/);
	assert.match(response.body, /state\.taskInboxExpandedActivityIds = \[\]/);
	assert.match(response.body, /params\.set\("before", state\.taskInboxNextBefore\)/);
	assert.match(response.body, /function applyTaskInboxUnreadCount\(payload\)\s*\{/);
	assert.match(response.body, /function applyConnManagerUnreadCount\(payload\)\s*\{/);
	assert.match(response.body, /state\.taskInboxUnreadCount = page\.unreadCount/);
	assert.match(response.body, /state\.taskInboxUnreadCount = Math\.max\(0, Number\(payload\?\.unreadCount\) \|\| 0\)/);
	assert.match(response.body, /state\.connManagerUnreadCount = Math\.max\(0, Number\(payload\?\.totalUnreadRuns\) \|\| 0\)/);
	assert.match(response.body, /\/v1\/activity\/summary/);
	assert.match(response.body, /\/v1\/conns/);
	assert.match(response.body, /\/v1\/activity\/read-all/);
	assert.match(response.body, /const markAllTaskInboxReadButton = document\.getElementById\("mark-all-task-inbox-read-button"\)/);
	assert.match(response.body, /const mobileOverflowTaskInboxBadge = document\.getElementById\("mobile-overflow-task-inbox-badge"\)/);
	assert.match(response.body, /mobileOverflowTaskInboxBadge\.hidden = unreadCount < 1/);
	assert.match(response.body, /connManagerUnreadBadge\.hidden = connUnreadCount < 1/);
	assert.match(response.body, /mobileOverflowTaskInboxBadge\.textContent = unreadCount > 99 \? "99\+" : String\(unreadCount\)/);
	assert.doesNotMatch(response.body, /markVisibleTaskInboxItemsRead/);
	assert.doesNotMatch(
		response.body,
		/const page = await fetchTaskInboxItems\(\{ append \}\);\s*[\s\S]{0,900}?void syncTaskInboxSummary\(\{ silent: true \}\);/,
	);
	assert.doesNotMatch(
		response.body,
		/const activity = await markTaskInboxItemRead\(activityId\);\s*[\s\S]{0,500}?await syncTaskInboxSummary\(\{ silent: true \}\);/,
	);
	assert.doesNotMatch(
		response.body,
		/const payload = await response\.json\(\)\.catch\(\(\) => \(\{\}\)\);\s*[\s\S]{0,900}?await syncTaskInboxSummary\(\{ silent: true \}\);/,
	);
	assert.match(response.body, /\/v1\/conns"\s*,\s*\{\s*method:\s*"GET"/);
	assert.match(response.body, /\/v1\/conns\/"\s*\+\s*encodeURIComponent\(conn\.connId\)\s*\+\s*"\/run"/);
	assert.match(response.body, /\/v1\/conns\/"\s*\+\s*encodeURIComponent\(conn\.connId\)\s*\+\s*\(conn\.status === "paused" \? "\/resume" : "\/pause"\)/);
	assert.match(response.body, /conn-run-details-dialog/);
	assert.match(response.body, /conn-run-details-body/);
	assert.match(response.body, /conn-run-result-bubble/);
	assert.match(response.body, /\.conn-run-result-bubble \.message-content\s*\{[\s\S]*font-size:\s*12px;[\s\S]*line-height:\s*1\.75;/);
	assert.match(response.body, /\.conn-run-result-bubble \.message-content h1\s*\{[\s\S]*font-size:\s*18px;/);
	assert.match(response.body, /\.conn-run-result-bubble \.message-content h2\s*\{[\s\S]*font-size:\s*16px;/);
	assert.match(response.body, /\.conn-run-result-bubble \.message-content h3\s*\{[\s\S]*font-size:\s*14px;/);
	assert.match(response.body, /\.conn-run-result-bubble \.message-content a\s*\{[\s\S]*color:\s*#8fd6ff;/);
	assert.match(response.body, /\.conn-run-result-bubble \.message-content code\s*\{[\s\S]*color:\s*#ffe6ad;/);
	assert.match(response.body, /\.conn-run-result-bubble \.message-content blockquote\s*\{[\s\S]*border-left-color:\s*rgba\(128, 232, 198, 0\.46\);/);
	assert.match(response.body, /\.conn-run-result-bubble \.message-content th\s*\{[\s\S]*background:\s*rgba\(143, 214, 255, 0\.1\);/);
	assert.match(response.body, /resultText\.className = "conn-run-result-text message-content"/);
	assert.match(response.body, /const runResultText = run\.errorText \|\| run\.resultText \|\| run\.resultSummary \|\| "No result summary yet"/);
	assert.match(response.body, /resultText\.innerHTML = renderMessageMarkdown\(runResultText\)/);
	assert.match(response.body, /hydrateMarkdownContent\(resultText\)/);
	assert.doesNotMatch(response.body, /agent-activity-dialog/);
	assert.doesNotMatch(response.body, /agent-activity-list/);
	assert.match(response.body, /source:\s*typeof rawEntry\.source === "string" \? rawEntry\.source : undefined/);
	assert.match(response.body, /sourceId:\s*typeof rawEntry\.sourceId === "string" \? rawEntry\.sourceId : undefined/);
	assert.match(response.body, /runId:\s*typeof rawEntry\.runId === "string" \? rawEntry\.runId : undefined/);
	assert.match(response.body, /source:\s*typeof options\?\.source === "string" \? options\.source : undefined/);
	assert.match(response.body, /sourceId:\s*typeof options\?\.sourceId === "string" \? options\.sourceId : undefined/);
	assert.match(response.body, /runId:\s*typeof options\?\.runId === "string" \? options\.runId : undefined/);
	assert.match(response.body, /\/v1\/conns\/"\s*\+\s*encodeURIComponent\(entry\.sourceId\)\s*\+\s*"\/runs\/"\s*\+\s*encodeURIComponent\(entry\.runId\)/);
	assert.match(response.body, /encodeURIComponent\(entry\.runId\)[\s\S]*"\/events\?"[\s\S]*params\.toString\(\)/);
	assert.match(response.body, /const CONN_RUN_LOG_PAGE_SIZE = 2;/);
	assert.match(response.body, /params = new URLSearchParams\(\{ limit: String\(CONN_RUN_LOG_PAGE_SIZE\) \}\)/);
	assert.match(response.body, /function trimConnRunLogText\(text\)/);
	assert.match(response.body, /connRunDetailsBody\.addEventListener\("scroll"/);
	assert.match(response.body, /loadMoreConnRunEvents\(\)/);
	assert.match(response.body, /:root\[data-theme="light"\] \.conn-run-details-body\s*\{[\s\S]*color:\s*#34435f;/);
	assert.match(response.body, /conn-run-open-button/);
	assert.doesNotMatch(response.body, /appendTranscriptMessage\("error"/);
	assert.doesNotMatch(response.body, /\.message\.error/);
	assert.match(response.body, /\.process-note\s*\{[\s\S]*width: 100%;/);
	assert.match(response.body, /\.process-note-text\s*\{[\s\S]*padding: 0 18px;/);
	assert.match(response.body, /\.process-note-text\s*\{[\s\S]*text-align: left;/);
	assert.match(response.body, /assistant-status-shell/);
	assert.match(response.body, /assistant-status-summary/);
	assert.match(response.body, /assistant-run-log-trigger/);
	assert.match(response.body, /assistant-run-log-hint/);
	assert.match(response.body, /chat-run-log-dialog/);
	assert.match(response.body, /chat-run-log-body/);
	assert.match(response.body, /conversation-item-menu-trigger/);
	assert.match(response.body, /conversation-item-menu/);
	assert.match(response.body, /requestRenameConversation/);
	assert.match(response.body, /requestUpdateConversation/);
	assert.match(response.body, /confirm-dialog/);
	assert.match(response.body, /confirm-dialog-title/);
	assert.match(response.body, /confirm-dialog-confirm/);
	assert.match(response.body, /function openConfirmDialog\(options\)/);
	assert.match(response.body, /function closeConfirmDialog\(confirmed\)/);
	assert.match(response.body, /\.assistant-status-shell\s*\{[\s\S]*display:\s*grid;/);
	assert.match(response.body, /\.assistant-status-shell\s*\{[\s\S]*gap:\s*10px;/);
	assert.match(response.body, /card\.insertBefore\(stream\.shell, body\);/);
	assert.match(response.body, /const assistantLabel = meta\?\.querySelector\("strong"\);/);
	assert.match(response.body, /assistantLabel\.insertAdjacentElement\("afterend", stream\.trigger\);/);
	assert.match(response.body, /state\.activeStatusSummary = stream\.summary;/);
	assert.match(response.body, /state\.activeRunLogTrigger = stream\.trigger;/);
	assert.match(response.body, /\.assistant-status-summary\s*\{[\s\S]*max-width:\s*min\(100%, 560px\);/);
	assert.match(response.body, /\.assistant-status-summary\s*\{[\s\S]*font-size:\s*12px;/);
	assert.match(response.body, /\.assistant-status-summary\s*\{[\s\S]*overflow:\s*hidden;/);
	assert.match(response.body, /\.assistant-status-summary\s*\{[\s\S]*text-overflow:\s*ellipsis;/);
	assert.match(response.body, /\.assistant-status-summary\s*\{[\s\S]*white-space:\s*nowrap;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.message\.assistant \.assistant-status-shell\s*\{[\s\S]*padding:\s*0 2px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.message\.assistant \.assistant-status-summary\s*\{[\s\S]*color:\s*rgba\(238, 244, 255, 0\.52\);/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.message\.assistant \.message-meta \.assistant-loading-bubble\s*\{[\s\S]*height:\s*24px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.message\.assistant \.message-meta \.assistant-run-log-hint\s*\{[\s\S]*display:\s*none;/);
	assert.match(response.body, /\.message\.assistant \.message-body:has\(> \.message-content\.is-empty:only-child\)\s*\{[\s\S]*display:\s*none;/);
	assert.match(response.body, /\.assistant-loading-bubble\s*\{[\s\S]*display:\s*inline-flex;/);
	assert.match(response.body, /\.assistant-loading-bubble\s*\{[\s\S]*max-width:\s*fit-content;/);
	assert.doesNotMatch(response.body, /assistant-loading-label/);
	assert.match(response.body, /\.assistant-run-log-trigger\s*\{\s*cursor:\s*pointer;/);
	assert.match(response.body, /\.assistant-run-log-trigger:disabled\s*\{[\s\S]*opacity:\s*0\.64;/);
	assert.match(response.body, /\.chat-run-log-dialog\s*\{[\s\S]*place-items:\s*center;/);
	assert.match(response.body, /\.chat-run-log-body\s*\{[\s\S]*overflow:\s*auto;/);
	assert.match(response.body, /const RUN_LOG_PAGE_SIZE = 2;/);
	assert.match(response.body, /params = new URLSearchParams\(\{\s*conversationId,[\s\S]*limit: String\(RUN_LOG_PAGE_SIZE\),/);
	assert.match(response.body, /function trimRunLogText\(text\)/);
	assert.match(response.body, /chatRunLogBody\?\.addEventListener\("scroll"/);
	assert.match(response.body, /loadMoreChatRunLog\(\)/);
	assert.match(response.body, /:root\[data-theme="light"\] \.chat-run-log-item-detail\s*\{[\s\S]*color:\s*#34435f;/);
	assert.match(response.body, /function updateStreamingProcess\(kind, title, detail\)\s*\{\s*appendProcessNarrationLine\(describeProcessNarration\(kind, title, detail\)\);\s*setProcessCurrentAction\(formatProcessAction\(title, detail\), kind\);\s*\}/);
	assert.match(response.body, /function ensureStreamingAssistantMessage\(\)\s*\{[\s\S]*appendTranscriptMessage\("assistant", /);
	assert.doesNotMatch(response.body, /withProcess:\s*true/);
	assert.match(response.body, /function attachAssistantProcessShell\(body, content\)/);
	assert.match(response.body, /function buildAssistantStatusShell\(\)/);
	assert.match(response.body, /function formatProcessSummaryForStatus\(process\)/);
	assert.match(response.body, /function openChatRunLog\(runId, restoreFocusElement\)/);
	assert.match(response.body, /getAgentApiPath\("\/chat\/runs\//);
	assert.doesNotMatch(response.body, /stream\.summary\.textContent = process\.narration\.at\(-1\)/);
	assert.match(response.body, /function setTranscriptState\(next\)\s*\{/);
	assert.match(response.body, /function syncConversationWidth\(\)\s*\{/);
	assert.match(response.body, /const commandDeckWidth = Math\.round\(commandDeckRect\.width \|\| 0\);/);
	assert.match(response.body, /shell\.style\.setProperty\("--conversation-width", commandDeckWidth \+ "px"\);/);
	assert.match(response.body, /function formatProcessAction\(title, detail\)\s*\{[\s\S]*summarizeDetail\(detail\)\.summary/);
	assert.match(response.body, /async function sendMessage\(\)\s*\{[\s\S]*setTranscriptState\("active"\);[\s\S]*resetStreamingState\(\);/);
	assert.match(response.body, /const composerDraft = createComposerDraft\(\);/);
	assert.match(response.body, /updateStreamingProcess\("system", [\s\S]*formatOutboundSummary\(message, attachments, assetRefs\)\);[\s\S]*clearComposerDraft\(\);/);
	assert.match(response.body, /if \(!response\.ok\) \{[\s\S]*restoreComposerDraft\(composerDraft\);/);
	assert.match(response.body, /async function queueActiveMessage\(message, attachments, assetRefs, options\) \{[\s\S]*const composerDraft = options\?\.composerDraft \|\| createComposerDraft\(\);[\s\S]*clearComposerDraft\(\);/);
	assert.match(response.body, /window\.addEventListener\("resize", syncConversationWidth\)/);
	assert.match(response.body, /scheduleConversationLayoutSync\(\{ immediate: true \}\);/);
	assert.match(response.body, /\.composer\s*\{[\s\S]*flex-shrink: 0;/);
	assert.match(response.body, /text\.className = "process-note-text"/);
	assert.doesNotMatch(response.body, /process-feed/);
	assert.doesNotMatch(response.body, /card\.className = "message system process-stream is-running"/);
	assert.doesNotMatch(response.body, /\.message\.process-stream\s*\{/);
	assert.match(response.body, /overflow-y: auto/);
	assert.match(response.body, /message-content/);
	assert.match(response.body, /renderMessageMarkdown/);
	assert.match(response.body, /hydrateMarkdownContent/);
	assert.match(response.body, /copy-code-button/);
	assert.doesNotMatch(response.body, /\.message\.system \.message-meta strong\s*\{/);
	assert.doesNotMatch(response.body, /\.message\.assistant,\s*\.message\.system,\s*\.message\.error\s*\{/);
	assert.match(response.body, /function appendAssistantProcessMessage\(title, text\)\s*\{/);
	assert.match(response.body, /function formatSkillsReply\(skills\)\s*\{/);
	assert.match(response.body, /\.\.\.skillList\.map\(\(skill, index\) => \{/);
	assert.match(response.body, /appendNarrationToAssistantProcess\(skillReply, /);
	assert.match(response.body, /setAssistantProcessAction\(skillReply, [\s\S]*GET " \+ getAgentApiPath\("\/debug\/skills"\), "tool"\)/);
	assert.match(response.body, /setMessageContent\(skillReply\.content, formatSkillsReply\(payload\?\.skills\)\)/);
	assert.match(response.body, /completeAssistantProcessShell\(skillReply, "ok"\)/);
	assert.doesNotMatch(response.body, /appendProcessEvent\("system", [\s\S]*\/v1\/debug\/skills"\)/);
	assert.doesNotMatch(response.body, /appendTranscriptMessage\("system", "闂傚倸鍊搁崐鎼佸磹閹间礁纾归柣鎴ｅГ閸ゅ嫰鏌涢锝嗙缂佺姷濞€閺岀喖宕滆鐢盯鏌涙繝鍌滃煟闁哄本鐩、鏇㈡偐閹绘帒顫撶紓浣哄亾閸庢娊鈥﹂悜钘夎摕闁绘梻鍘х粈鍫㈡喐韫囨洘鏆滄繛鎴欏灪閻?, report\)/);
	assert.match(response.body, /code-block-toolbar/);
	assert.doesNotMatch(response.body, /drag-debug-log/);
	assert.doesNotMatch(response.body, /clear-drag-debug/);
	assert.doesNotMatch(response.body, /asset-library-head/);
	assert.doesNotMatch(response.body, /__name/);
	await app.close();
});

test("GET /playground/agents loads installable skills from main agent skills including disabled entries", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /fetchJson\("\/v1\/agents\/main\/skills"\)/);
	assert.doesNotMatch(response.body, /fetchJson\("\/v1\/debug\/skills"\)/);
	assert.match(response.body, /主 Agent 已关闭/);
	await app.close();
});

test("GET /playground/agents reuses gallery skills for the initial main selection", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});

	assert.equal(response.statusCode, 200);
	const body = response.body;
	const galleryStart = body.indexOf("async function apiFetchGallerySkills()");
	const galleryEnd = body.indexOf("async function apiCopySkill", galleryStart);
	const selectStart = body.indexOf("function selectAgent(agentId)");
	const selectEnd = body.indexOf("/* \u2500\u2500 Handlers", selectStart);
	assert.ok(galleryStart >= 0, "apiFetchGallerySkills function not found");
	assert.ok(galleryEnd > galleryStart, "apiFetchGallerySkills region not found");
	assert.ok(selectStart >= 0, "selectAgent function not found");
	assert.ok(selectEnd > selectStart, "selectAgent region not found");

	const galleryRegion = body.slice(galleryStart, galleryEnd);
	const selectRegion = body.slice(selectStart, selectEnd);

	assert.match(galleryRegion, /fetchJson\("\/v1\/agents\/main\/skills"\)/);
	assert.match(galleryRegion, /state\.skillsByAgentId\.main\s*=\s*state\.gallerySkills/);
		// selectAgent resets skillsExpanded and does not fetch skills
		assert.match(selectRegion, /state\.editorMode = null/);
		assert.match(selectRegion, /state\.skillsExpanded = false/);
		assert.doesNotMatch(selectRegion, /apiFetchAgentSkills/);
		assert.doesNotMatch(selectRegion, /renderSkills\(\)/);
		await app.close();
	});

	test("GET /playground/agents defers skill row rendering until section is expanded", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});
		const response = await app.inject({
			method: "GET",
			url: "/playground/agents",
		});
		assert.equal(response.statusCode, 200);
		const body = response.body;

		// State declares skillsExpanded flag
		assert.match(body, /skillsExpanded:\s*false/);

		// renderDetailBody delegates skill rendering instead of mounting rows directly
		const detailStart = body.indexOf("function renderDetailBody()");
		const detailEnd = body.indexOf("function ensureDetailShell(", detailStart);
		assert.ok(detailStart >= 0, "renderDetailBody function not found");
		assert.ok(detailEnd > detailStart, "renderDetailBody region end not found");
		const detailRegion = body.slice(detailStart, detailEnd);
		assert.match(detailRegion, /renderSkillsPanel\(agent\)/);
		assert.doesNotMatch(detailRegion, /ag-skill-list/);

		const panelStart = body.indexOf("function renderSkillsPanel(");
		const panelEnd = body.indexOf("function buildMiniCard(", panelStart);
		assert.ok(panelStart >= 0, "renderSkillsPanel function not found");
		assert.ok(panelEnd > panelStart, "renderSkillsPanel region end not found");
		const panelRegion = body.slice(panelStart, panelEnd);

		// Collapsed branch has expand button, expanded branch has the skill list
		assert.match(panelRegion, /ag-btn-expand-skills/);
		assert.match(panelRegion, /if \(state\.skillsExpanded\)/);
		const renderSkillsCall = panelRegion.indexOf("renderSkillsList(agent.agentId)");
		const expandedBranch = panelRegion.indexOf("if (state.skillsExpanded)");
		assert.ok(renderSkillsCall > expandedBranch, "renderSkillsList() must be inside the skillsExpanded branch");

		// handleExpandSkills sets skillsExpanded and checks cache
		const expandStart = body.indexOf("function handleExpandSkills()");
		const expandEnd = body.indexOf("function mobileBackToList(", expandStart);
		assert.ok(expandStart >= 0, "handleExpandSkills function not found");
		assert.ok(expandEnd > expandStart, "handleExpandSkills region end not found");
		const expandRegion = body.slice(expandStart, expandEnd);

		assert.match(expandRegion, /state\.skillsExpanded = true/);
		assert.match(expandRegion, /var agentId = state\.selectedId/);
		assert.match(expandRegion, /skillsLoadedByAgentId\[agentId\]/);
		assert.match(expandRegion, /apiFetchAgentSkills\(agentId\)/);

	await app.close();
	});

test("GET /playground/agents renders expanded skills as two-column cards with storage metadata", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	assert.match(body, /\.ag-skill-list\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
	assert.match(body, /@media \(max-width: 1024px\)\s*\{[\s\S]*\.ag-skill-list\s*\{\s*grid-template-columns:\s*1fr;/);
	assert.match(body, /function compactSkillPath\(path\)/);
	assert.match(body, /function getSkillStorageMeta\(skill\)/);
	assert.match(body, /storageKind/);
	assert.match(body, /storageRoot/);
	assert.match(body, /ag-skill-location--system/);
	assert.match(body, /ag-skill-location--agent/);
	assert.doesNotMatch(body, /ag-skill-state/);
	assert.match(body, /Agent 安装/);
	assert.match(body, /系统技能/);
	await app.close();
});

	test("GET /playground/agents skill toggle still calls PATCH when expanded", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});
		const response = await app.inject({
			method: "GET",
			url: "/playground/agents",
		});
		assert.equal(response.statusCode, 200);
		const body = response.body;

		const toggleStart = body.indexOf("async function apiToggleSkill(");
		const toggleEnd = body.indexOf("async function apiFetchGallerySkills", toggleStart);
		assert.ok(toggleStart >= 0, "apiToggleSkill function not found");
		assert.ok(toggleEnd > toggleStart, "apiToggleSkill region end not found");
		const toggleRegion = body.slice(toggleStart, toggleEnd);

		assert.match(toggleRegion, /method: "PATCH"/);
		assert.match(toggleRegion, /\/skills\//);

		await app.close();
	});

test("GET /playground/agents skill count shows dash for unloaded and number for loaded", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	// Helper getSkillCountText exists and distinguishes unloaded vs loaded-empty
	const helperStart = body.indexOf("function getSkillCountText(");
	assert.ok(helperStart >= 0, "getSkillCountText helper not found");
	const helperEnd = body.indexOf("function getCollapsedSkillSummary(", helperStart);
	assert.ok(helperEnd > helperStart, "getCollapsedSkillSummary not found after getSkillCountText");
	const helperRegion = body.slice(helperStart, helperEnd);
	assert.match(helperRegion, /Array.isArray\(skills\)/);
	assert.match(helperRegion, /return.*String\(skills\.length\)/);
	assert.match(helperRegion, /return.*["']—["']/);

	// getStatCounts uses the helper
	const statStart = body.indexOf("function getStatCounts()");
	const statEnd = body.indexOf("/* ── Rendering: Stats", statStart);
	assert.ok(statStart >= 0, "getStatCounts not found");
	assert.ok(statEnd > statStart, "getStatCounts region end not found");
	const statRegion = body.slice(statStart, statEnd);
	assert.match(statRegion, /getSkillCountText/);
	assert.doesNotMatch(statRegion, /\|\|\s*\[\]/);

	await app.close();
});

test("GET /playground/agents declares skillsLoadedByAgentId for per-agent cache metadata", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	assert.match(body, /skillsLoadedByAgentId:\s*\{\}/);
	await app.close();
});

test("GET /playground/agents apiFetchAgentSkills propagates failures and marks loaded only on success", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const fetchStart = body.indexOf("async function apiFetchAgentSkills(");
	const fetchEnd = body.indexOf("async function apiArchiveAgent(", fetchStart);
	assert.ok(fetchStart >= 0, "apiFetchAgentSkills function not found");
	assert.ok(fetchEnd > fetchStart, "apiFetchAgentSkills region end not found");
	const fetchRegion = body.slice(fetchStart, fetchEnd);

	const fetchJsonIdx = fetchRegion.indexOf("fetchJson(");
	const loadedIdx = fetchRegion.indexOf("skillsLoadedByAgentId[agentId]");
	assert.ok(fetchJsonIdx >= 0, "fetchJson call not found");
	assert.ok(loadedIdx > fetchJsonIdx,
		"skillsLoadedByAgentId[agentId] must be set after a successful fetchJson call");
	assert.doesNotMatch(fetchRegion, /catch\s*\{\s*\}/);
	assert.doesNotMatch(fetchRegion, /catch\s*\([^)]*\)\s*\{\s*\}/);
	await app.close();
});

test("GET /playground/agents apiFetchGallerySkills marks main as loaded only on success", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const galleryStart = body.indexOf("async function apiFetchGallerySkills()");
	const galleryEnd = body.indexOf("async function apiCopySkill", galleryStart);
	assert.ok(galleryStart >= 0, "apiFetchGallerySkills function not found");
	assert.ok(galleryEnd > galleryStart, "apiFetchGallerySkills region end not found");
	const galleryRegion = body.slice(galleryStart, galleryEnd);

	const tryIdx = galleryRegion.indexOf("try {");
	const catchIdx = galleryRegion.indexOf("} catch {");
	const loadedIdx = galleryRegion.indexOf("skillsLoadedByAgentId.main");
	assert.ok(tryIdx >= 0, "try block not found");
	assert.ok(catchIdx > tryIdx, "catch block not found");
	assert.ok(loadedIdx > tryIdx && loadedIdx < catchIdx,
		"skillsLoadedByAgentId.main must be inside the try block, before catch");
	const catchRegion = galleryRegion.slice(catchIdx);
	assert.doesNotMatch(catchRegion, /skillsLoadedByAgentId/);
	assert.doesNotMatch(catchRegion, /skillsByAgentId\.main/);
	assert.match(galleryRegion, /state.skillsByAgentId.main\s*=\s*state.gallerySkills/);
	await app.close();
});

test("GET /playground/agents handleRefreshSkills force fetches selected agent", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const refreshStart = body.indexOf("async function handleRefreshSkills()");
	const refreshEnd = body.indexOf("function handleExpandSkills(", refreshStart);
	assert.ok(refreshStart >= 0, "handleRefreshSkills function not found");
	assert.ok(refreshEnd > refreshStart, "handleRefreshSkills region end not found");
	const refreshRegion = body.slice(refreshStart, refreshEnd);

	assert.match(refreshRegion, /var agentId = state\.selectedId/);
	assert.match(refreshRegion, /apiFetchAgentSkills\(agentId\)/);
	assert.match(refreshRegion, /state\.selectedId === agentId/);
	await app.close();
});

test("GET /playground/agents toggle only refreshes affected agent cache", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const renderSkillsStart = body.indexOf("function renderSkills()");
	const renderSkillsEnd = body.indexOf("function populateSkillSelect(", renderSkillsStart);
	assert.ok(renderSkillsStart >= 0, "renderSkills function not found");
	assert.ok(renderSkillsEnd > renderSkillsStart, "renderSkills region end not found");
	const renderSkillsRegion = body.slice(renderSkillsStart, renderSkillsEnd);

	assert.match(renderSkillsRegion, /var touchedAgentId = agent\.agentId/);
	assert.match(renderSkillsRegion, /apiFetchAgentSkills\(touchedAgentId\)/);
	assert.match(renderSkillsRegion, /return apiFetchAgentSkills\(touchedAgentId\)/);
	assert.match(renderSkillsRegion, /state\.selectedId === touchedAgentId/);
	assert.doesNotMatch(renderSkillsRegion, /skillsLoadedByAgentId\s*=\s*\{\}/);
	assert.doesNotMatch(renderSkillsRegion, /skillsByAgentId\s*=\s*\{\}/);
	await app.close();
});

test("GET /playground/agents remove and install capture agentId before await", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	// handleRemoveSkill captures agentId locally
	const removeStart = body.indexOf("async function handleRemoveSkill(");
	const removeEnd = body.indexOf("async function handleCopySkill(", removeStart);
	assert.ok(removeStart >= 0, "handleRemoveSkill function not found");
	assert.ok(removeEnd > removeStart, "handleRemoveSkill region end not found");
	const removeRegion = body.slice(removeStart, removeEnd);

	assert.match(removeRegion, /var agentId = state.selectedId/);
	assert.match(removeRegion, /apiRemoveSkill\(agentId,/);
	assert.match(removeRegion, /apiFetchAgentSkills\(agentId\)/);
	assert.match(removeRegion, /state.selectedId === agentId/);
	assert.doesNotMatch(removeRegion, /skillsLoadedByAgentIds*=s*{}/);

	// handleCopySkill captures agentId locally
	const copyStart = body.indexOf("async function handleCopySkill()");
	const copyEnd = body.indexOf("async function handleRefreshSkills(", copyStart);
	assert.ok(copyStart >= 0, "handleCopySkill function not found");
	assert.ok(copyEnd > copyStart, "handleCopySkill region end not found");
	const copyRegion = body.slice(copyStart, copyEnd);

	assert.match(copyRegion, /var agentId = state.selectedId/);
	assert.match(copyRegion, /apiCopySkill\(agentId,/);
	assert.match(copyRegion, /apiFetchAgentSkills\(agentId\)/);
	assert.match(copyRegion, /state.selectedId === agentId/);
	assert.doesNotMatch(copyRegion, /skillsLoadedByAgentIds*=s*{}/);
	await app.close();
});

test("GET /playground/agents defers browser and model catalogs from initial load", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const initStart = body.indexOf("async function init()");
	const initEnd = body.indexOf("document.addEventListener(\"DOMContentLoaded\", init)", initStart);
	assert.ok(initStart >= 0, "init function not found");
	assert.ok(initEnd > initStart, "init region end not found");
	const initRegion = body.slice(initStart, initEnd);

	assert.match(initRegion, /apiFetchAgents\(\)/);
	assert.match(initRegion, /apiFetchGallerySkills\(\)/);
	assert.match(body, /fetchJson\("\/v1\/agents"\)/);
	assert.match(body, /fetchJson\("\/v1\/agents\/status"\)/);
	assert.match(body, /fetchJson\("\/v1\/agents\/main\/skills"\)/);
	assert.doesNotMatch(initRegion, /fetchJson\("\/v1\/browsers"\)/);
	assert.doesNotMatch(initRegion, /fetchJson\("\/v1\/model-config"\)/);
	await app.close();
});

test("GET /playground/agents loads support catalogs only when create or edit editor opens", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	assert.match(body, /supportCatalogsLoaded:\s*false/);
	assert.match(body, /supportCatalogsLoading:\s*false/);

	const loaderStart = body.indexOf("async function loadSupportCatalogs()");
	const loaderEnd = body.indexOf("function loadSupportCatalogsForEditor(", loaderStart);
	assert.ok(loaderStart >= 0, "loadSupportCatalogs function not found");
	assert.ok(loaderEnd > loaderStart, "loadSupportCatalogs region end not found");
	const loaderRegion = body.slice(loaderStart, loaderEnd);
	assert.match(loaderRegion, /supportCatalogsLoaded/);
	assert.match(loaderRegion, /supportCatalogsLoading/);
	assert.match(loaderRegion, /fetchJson\("\/v1\/browsers"\)/);
	assert.match(loaderRegion, /fetchJson\("\/v1\/model-config"\)/);

	const createStart = body.indexOf("function openCreateEditor()");
	const createEnd = body.indexOf("function openEditEditor()", createStart);
	const editStart = createEnd;
	const editEnd = body.indexOf("function closeEditor()", editStart);
	assert.ok(createStart >= 0 && createEnd > createStart, "openCreateEditor region not found");
	assert.ok(editStart >= 0 && editEnd > editStart, "openEditEditor region not found");
	const createRegion = body.slice(createStart, createEnd);
	const editRegion = body.slice(editStart, editEnd);
	assert.match(createRegion, /loadSupportCatalogsForEditor\(null\)/);
	assert.match(editRegion, /loadSupportCatalogsForEditor\(agent\)/);
	await app.close();
});

test("GET /playground/agents disables editor submit while support catalogs are loading", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const renderStart = body.indexOf("function renderEditorForm(agent)");
	const renderEnd = body.indexOf("function showEditorError(", renderStart);
	assert.ok(renderStart >= 0, "renderEditorForm function not found");
	assert.ok(renderEnd > renderStart, "renderEditorForm region end not found");
	const renderRegion = body.slice(renderStart, renderEnd);

	assert.match(renderRegion, /supportCatalogsReady/);
	assert.match(renderRegion, /supportCatalogsLoading/);
	assert.match(renderRegion, /ed-submit/);
	assert.match(renderRegion, /supportCatalogDisabled = supportCatalogsReady \? ["']{2} : ["'] disabled["']/);
	assert.match(renderRegion, /正在加载浏览器和模型配置/);
	await app.close();
});

test("GET /playground/agents guards create and edit submit when model config is unavailable", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const guardStart = body.indexOf("function guardEditorSupportCatalogs()");
	const guardEnd = body.indexOf("function bindEditorModelProviderSelect()", guardStart);
	assert.ok(guardStart >= 0, "guardEditorSupportCatalogs function not found");
	assert.ok(guardEnd > guardStart, "guardEditorSupportCatalogs region end not found");
	const guardRegion = body.slice(guardStart, guardEnd);
	assert.match(guardRegion, /!state\.supportCatalogsLoaded/);
	assert.match(guardRegion, /!state\.modelConfig/);
	assert.match(guardRegion, /return false/);

	const modelPatchStart = body.indexOf("function buildEditorModelPatch(isEdit)");
	const modelPatchEnd = body.indexOf("function getBrowserLabel(", modelPatchStart);
	assert.ok(modelPatchStart >= 0, "buildEditorModelPatch function not found");
	assert.ok(modelPatchEnd > modelPatchStart, "buildEditorModelPatch region end not found");
	const modelPatchRegion = body.slice(modelPatchStart, modelPatchEnd);
	assert.match(modelPatchRegion, /if \(!state\.modelConfig\)/);
	assert.match(modelPatchRegion, /return null/);

	const createStart = body.indexOf("async function handleEditorCreate()");
	const createEnd = body.indexOf("async function handleEditorUpdate()", createStart);
	const updateStart = createEnd;
	const updateEnd = body.indexOf("async function handleRefresh()", updateStart);
	assert.ok(createStart >= 0 && createEnd > createStart, "handleEditorCreate region not found");
	assert.ok(updateStart >= 0 && updateEnd > updateStart, "handleEditorUpdate region not found");
	const createRegion = body.slice(createStart, createEnd);
	const updateRegion = body.slice(updateStart, updateEnd);
	assert.match(createRegion, /guardEditorSupportCatalogs\(\)/);
	assert.match(updateRegion, /guardEditorSupportCatalogs\(\)/);
	await app.close();
});

test("GET /playground/agents keeps detail body stable and updates detail regions", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const detailStart = body.indexOf("function renderDetailBody()");
	const detailEnd = body.indexOf("function ensureDetailShell(", detailStart);
	assert.ok(detailStart >= 0, "renderDetailBody function not found");
	assert.ok(detailEnd > detailStart, "renderDetailBody region end not found");
	const detailRegion = body.slice(detailStart, detailEnd);

	assert.match(detailRegion, /ensureDetailShell\(body,\s*agent\.agentId\)/);
	assert.match(detailRegion, /renderDetailHeader\(agent,\s*status,\s*active\)/);
	assert.match(detailRegion, /renderDetailMiniStats\(agent,\s*status\)/);
	assert.match(detailRegion, /renderDetailConfig\(agent\)/);
	assert.match(detailRegion, /renderSkillsPanel\(agent\)/);
	assert.doesNotMatch(detailRegion, /body\.innerHTML\s*=\s*html/);
	assert.doesNotMatch(detailRegion, /populateSkillSelect\(\)/);

	const shellStart = body.indexOf("function ensureDetailShell(");
	const shellEnd = body.indexOf("function renderDetailHeader(", shellStart);
	assert.ok(shellStart >= 0, "ensureDetailShell function not found");
	assert.ok(shellEnd > shellStart, "ensureDetailShell region end not found");
	const shellRegion = body.slice(shellStart, shellEnd);
	assert.match(shellRegion, /ag-detail-header-region/);
	assert.match(shellRegion, /ag-detail-stats-region/);
	assert.match(shellRegion, /ag-detail-config-region/);
	assert.match(shellRegion, /ag-detail-skills-region/);
	assert.doesNotMatch(shellRegion, /body\.dataset\.agentId === agentId\s*&&/);
	assert.match(shellRegion, /body\.scrollTop = sameAgent \? scrollTop : 0/);

	await app.close();
});

test("GET /playground/agents only rebuilds installable skill select when gallery changes", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const populateStart = body.indexOf("function populateSkillSelect()");
	const populateEnd = body.indexOf("/* \u2500\u2500 Selection", populateStart);
	assert.ok(populateStart >= 0, "populateSkillSelect function not found");
	assert.ok(populateEnd > populateStart, "populateSkillSelect region end not found");
	const populateRegion = body.slice(populateStart, populateEnd);

	assert.match(populateRegion, /getGallerySkillSignature\(\)/);
	assert.match(populateRegion, /sel\.dataset\.gallerySignature === signature/);
	assert.match(populateRegion, /return/);
	assert.doesNotMatch(populateRegion, /gallerySignature === signature && sel\.options\.length > 1/);
	assert.match(populateRegion, /sel\.dataset\.gallerySignature = signature/);

	const skillsPanelStart = body.indexOf("function renderSkillsPanel(");
	const skillsPanelEnd = body.indexOf("function renderSkillsList(", skillsPanelStart);
	assert.ok(skillsPanelStart >= 0, "renderSkillsPanel function not found");
	assert.ok(skillsPanelEnd > skillsPanelStart, "renderSkillsPanel region end not found");
	const skillsPanelRegion = body.slice(skillsPanelStart, skillsPanelEnd);
	assert.match(skillsPanelRegion, /populateSkillSelect\(\)/);
	assert.doesNotMatch(skillsPanelRegion, /body\.innerHTML/);

	await app.close();
});

test("GET /playground/agents updates skills loading and mutation through local regions", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const expandStart = body.indexOf("function handleExpandSkills()");
	const expandEnd = body.indexOf("function mobileBackToList(", expandStart);
	assert.ok(expandStart >= 0, "handleExpandSkills function not found");
	assert.ok(expandEnd > expandStart, "handleExpandSkills region end not found");
	const expandRegion = body.slice(expandStart, expandEnd);
	assert.match(expandRegion, /var agentId = state\.selectedId/);
	assert.match(expandRegion, /state\.skillsLoadingAgentId = agentId/);
	assert.match(expandRegion, /renderSkillsPanel\(agent\)/);
	assert.match(expandRegion, /renderSkillsList\(agentId\)/);
	assert.match(expandRegion, /state\.selectedId !== agentId/);
	assert.doesNotMatch(expandRegion, /renderDetailBody\(\)/);

	const refreshStart = body.indexOf("async function handleRefreshSkills()");
	const refreshEnd = body.indexOf("function handleExpandSkills(", refreshStart);
	assert.ok(refreshStart >= 0, "handleRefreshSkills function not found");
	assert.ok(refreshEnd > refreshStart, "handleRefreshSkills region end not found");
	const refreshRegion = body.slice(refreshStart, refreshEnd);
	assert.match(refreshRegion, /var agentId = state\.selectedId/);
	assert.match(refreshRegion, /state\.skillsLoadingAgentId = agentId/);
	assert.match(refreshRegion, /state\.selectedId === agentId/);
	assert.match(refreshRegion, /renderSkillsList\(agentId\)/);
	assert.match(refreshRegion, /renderDetailMiniStats\(agent,\s*getStatusBadge\(agent\)\)/);
	assert.match(refreshRegion, /finally[\s\S]*state\.skillsLoadingAgentId === agentId[\s\S]*renderSkillsList\(agentId\)/);
	assert.doesNotMatch(refreshRegion, /renderDetailBody\(\)/);

	await app.close();
});

test("GET /playground/agents shows a retryable skills error instead of an empty list when loading fails", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const renderSkillsStart = body.indexOf("function renderSkillsList(");
	const renderSkillsEnd = body.indexOf("function getGallerySkillSignature(", renderSkillsStart);
	assert.ok(renderSkillsStart >= 0, "renderSkillsList function not found");
	assert.ok(renderSkillsEnd > renderSkillsStart, "renderSkillsList region end not found");
	const renderSkillsRegion = body.slice(renderSkillsStart, renderSkillsEnd);
	const notLoadedIdx = renderSkillsRegion.indexOf("!state.skillsLoadedByAgentId[agentId]");
	const emptyIdx = renderSkillsRegion.indexOf("暂无 scoped 技能");
	assert.ok(notLoadedIdx >= 0, "not-loaded skills branch not found");
	assert.ok(emptyIdx > notLoadedIdx, "not-loaded branch must run before the empty-list branch");
	assert.match(renderSkillsRegion, /技能加载失败/);
	assert.match(renderSkillsRegion, /请重试/);
	await app.close();
});

test("GET /playground/agents guards async skill results against stale selection", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const renderSkillsStart = body.indexOf("function renderSkillsList(");
	const renderSkillsEnd = body.indexOf("function getGallerySkillSignature(", renderSkillsStart);
	assert.ok(renderSkillsStart >= 0, "renderSkillsList function not found");
	assert.ok(renderSkillsEnd > renderSkillsStart, "renderSkillsList region end not found");
	const renderSkillsRegion = body.slice(renderSkillsStart, renderSkillsEnd);
	assert.match(renderSkillsRegion, /var agentId = expectedAgentId \|\| state\.selectedId/);
	assert.match(renderSkillsRegion, /state\.selectedId !== agentId/);
	assert.match(renderSkillsRegion, /return/);

	const removeStart = body.indexOf("async function handleRemoveSkill(");
	const removeEnd = body.indexOf("async function handleCopySkill(", removeStart);
	assert.ok(removeStart >= 0, "handleRemoveSkill function not found");
	assert.ok(removeEnd > removeStart, "handleRemoveSkill region end not found");
	const removeRegion = body.slice(removeStart, removeEnd);
	assert.match(removeRegion, /var agentId = state\.selectedId/);
	assert.match(removeRegion, /state\.selectedId === agentId/);
	assert.match(removeRegion, /renderSkillsList\(agentId\)/);

	const copyStart = body.indexOf("async function handleCopySkill()");
	const copyEnd = body.indexOf("async function handleRefreshSkills(", copyStart);
	assert.ok(copyStart >= 0, "handleCopySkill function not found");
	assert.ok(copyEnd > copyStart, "handleCopySkill region end not found");
	const copyRegion = body.slice(copyStart, copyEnd);
	assert.match(copyRegion, /var agentId = state\.selectedId/);
	assert.match(copyRegion, /state\.selectedId === agentId/);
	assert.match(copyRegion, /renderSkillsList\(agentId\)/);

	await app.close();
});

test("GET /playground releases panel focus before hiding conn run details", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /function releasePanelFocusBeforeHide\(panelElement, fallbackElement\)\s*\{/);
	assert.match(response.body, /document\.activeElement\.blur\(\);/);
	assert.match(
		response.body,
		/function closeConnRunDetailsDialog\(\)\s*\{[\s\S]*releasePanelFocusBeforeHide\(connRunDetailsDialog, state\.connRunDetailsRestoreFocusElement\);[\s\S]*connRunDetailsDialog\.setAttribute\("aria-hidden", "true"\);/,
	);
	assert.doesNotMatch(
		response.body,
		/function closeConnRunDetailsDialog\(\)\s*\{[\s\S]*connRunDetailsDialog\.setAttribute\("aria-hidden", "true"\);[\s\S]*releasePanelFocusBeforeHide\(connRunDetailsDialog,/,
	);
	await app.close();
});

test("standalone conn page keeps the new-task card visible when the task list is empty", () => {
	const response = renderConnPage();
	const createEmptyEditorBranch = response.indexOf(
		'if (state.editorOpen && state.editorMode === "create" && conns.length === 0)',
	);
	const emptyListBranch = response.indexOf("if (conns.length === 0)");

	assert.notEqual(createEmptyEditorBranch, -1);
	assert.notEqual(emptyListBranch, -1);
	assert.ok(createEmptyEditorBranch < emptyListBranch);
	assert.match(response, /function appendNewConnEditorItem\(\)/);
	assert.match(response, /const newItem = document\.createElement\("div"\)/);
	assert.match(response, /const item = document\.createElement\("div"\)/);
	assert.match(response, /event\.target instanceof Element && event\.target\.closest\("\.conn-list-item-editor-actions"\)/);
	assert.doesNotMatch(response, /const newItem = document\.createElement\("button"\)/);
	assert.doesNotMatch(response, /const item = document\.createElement\("button"\)/);
	assert.match(response, /data-editor-action="submit"[\s\S]*保存任务[\s\S]*data-editor-action="cancel"[\s\S]*取消/);
	assert.match(response, /submitBtn\.addEventListener\("click", \(event\) => \{ event\.stopPropagation\(\); submitEditor\(\); \}\)/);
	assert.match(response, /cancelBtn\.addEventListener\("click", \(event\) => \{ event\.stopPropagation\(\); closeEditor\(\); \}\)/);
	assert.doesNotMatch(response, /id="editor-submit"/);
	assert.doesNotMatch(response, /id="editor-cancel"/);
	assert.match(response, /editorError:\s*""/);
	assert.match(response, /function getDefaultEditorRunDate\(\)/);
	assert.match(response, /const defaultRunAt = formatDateTimeLocal\(getDefaultEditorRunDate\(\)\)/);
	assert.match(response, /id="editor-form-submit"[\s\S]*保存任务[\s\S]*id="editor-form-cancel"[\s\S]*取消/);
	assert.match(response, /function showEditorError\(message, focusId\)[\s\S]*state\.editorError = message/);
});

test("standalone conn page can create team group conn executions", () => {
	const response = renderConnPage();
	assert.match(response, /editor-execution-type/);
	assert.match(response, /editor-team-group-id/);
	assert.match(response, /async function apiFetchTeamTaskGroups\(/);
	assert.match(response, /\/v1\/team\/task-groups/);
	assert.match(response, /function getTeamTaskGroupValidationMessage\(group\)/);
	assert.match(response, /opt\.textContent \+= "（不可运行）";/);
	assert.match(response, /opt\.disabled = true;/);
	assert.match(response, /function buildEditorExecutionPayload\(/);
	assert.match(response, /showEditorError\("请先选择可运行的 Team Group", "editor-team-group-id"\)/);
	assert.match(response, /execution,/);
	assert.match(response, /type: "team_group"/);
	assert.match(response, /execution\.type === "team_group"/);
	assert.match(
		response,
		/\["Group JSON", groupId \? "\/v1\/team\/task-groups\/" \+ encodeURIComponent\(groupId\) : ""\]/,
	);
	assert.match(
		response,
		/\["GroupRun JSON", groupRunId \? "\/v1\/team\/task-group-runs\/" \+ encodeURIComponent\(groupRunId\) : ""\]/,
	);
	assert.match(response, /const groupRunStartStatus = String\(snapshot\.groupRunStartStatus \|\| ""\);/);
	assert.match(response, /const groupRunStartError = String\(snapshot\.groupRunStartError \|\| ""\);/);
	assert.match(response, /\["groupRunStartStatus", groupRunStartStatus\]/);
	assert.match(response, /\["groupRunStartError", groupRunStartError\]/);
	assert.match(response, /link\.target = "_blank";/);
	assert.match(response, /link\.rel = "noreferrer";/);
	assert.match(
		response,
		/const isSkippedTeamGroupRun = snapshot\.skipped === true;[\s\S]*if \(isSkippedTeamGroupRun\) \{[\s\S]*skipped\.textContent = "Skipped: "/,
	);
	assert.doesNotMatch(response, /run\.status === "failed" && run\.errorText[\s\S]{0,260}Skipped/);
	assert.match(response, /editor-prompt/);
	assert.match(response, /editor-profile-id/);
	assert.match(response, /editor-browser-id/);
	assert.match(response, /editor-model-provider/);
	assert.match(response, /editor-model-id/);
});

test("standalone conn page disables run-now while a run is pending or running", () => {
	const response = renderConnPage();

	assert.match(response, /actionConnId:\s*""/);
	assert.match(response, /const RUN_REFRESH_MAX_ATTEMPTS = 120/);
	assert.match(response, /function isRunInFlight\(run\)[\s\S]*run\?\.status === "pending"[\s\S]*run\?\.status === "running"/);
	assert.match(response, /function hasActiveRunForConn\(connId\)/);
	assert.match(response, /hasRunInFlight \? "执行中" : "立即执行"/);
	assert.match(response, /btn\.disabled = isActing \|\| Boolean\(action\.disabled\)/);
	assert.match(response, /showToast\("已触发执行，正在后台运行", "success"\)/);
	assert.match(response, /scheduleRunRefresh\(connId, 0\)/);
});

test("standalone conn page action handlers avoid broad renderAll refreshes", () => {
	const response = renderConnPage();

	for (const handlerName of ["handlePause", "handleResume", "handleDelete", "handleMarkAllRead"]) {
		const match = new RegExp(`async function ${handlerName}\\([\\s\\S]*?\\n\\}`).exec(response);
		assert.ok(match, `expected ${handlerName} to exist`);
		assert.doesNotMatch(match[0], /renderAll\(\)/, `${handlerName} should use targeted rendering`);
	}
	assert.doesNotMatch(response, /loadRuns\(/);
	assert.match(response, /function renderStats\(\)/);
	assert.match(response, /function renderList\(\)/);
	assert.match(response, /function renderDetail\(\)/);
	assert.match(response, /function renderRunHistory\(/);
});

test("standalone conn page exposes a terminate action for pending or running conn runs", () => {
	const response = renderConnPage();

	assert.match(response, /cancellingRunId:\s*""/);
	assert.match(response, /async function apiCancelRun\(connId, runId\)/);
	assert.match(response, /\/runs\/" \+ encodeURIComponent\(runId\) \+ "\/cancel"/);
	assert.match(response, /const canCancel = isRunInFlight\(run\)/);
	assert.match(response, /data-run-cancel/);
	assert.match(response, /async function handleCancelRun\(connId, runId\)/);
	assert.match(response, /终止本次运行/);
	assert.match(response, /handleCancelRun\(conn\.connId, run\.runId\)/);
	assert.match(response, /\.conn-run-cancel-btn/);
});

test("standalone conn page exposes tokenized run history loading states", () => {
	const response = renderConnPage();

	assert.match(response, /data-run-history-state="loading"/);
	assert.match(response, /data-run-history-state="error"/);
	assert.match(response, /data-run-history-state="empty"/);
	assert.match(response, /data-run-history-pagination/);
	assert.match(response, /\.conn-run-lazy--loading\s*\{[\s\S]*background:\s*var\(--primary-soft\);/);
	assert.match(response, /\.conn-run-lazy--error\s*\{[\s\S]*background:\s*var\(--danger-soft\);/);
	assert.match(response, /\.conn-run-history-more\.is-loading\s*\{[\s\S]*background:\s*var\(--primary-soft\);/);
});
test("standalone conn page uses bundled vendor assets instead of CDN resources", () => {
	const response = renderConnPage();

	assert.match(response, /\/vendor\/flatpickr\/flatpickr\.min\.css/);
	assert.match(response, /\/vendor\/flatpickr\/flatpickr\.min\.js/);
	assert.match(response, /\/vendor\/flatpickr\/l10n\/zh\.js/);
	assert.match(response, /marked v18\.0\.2|globalThis\.__ugkPlaygroundMarkdownParser/);
	assert.doesNotMatch(response, /cdn\.jsdelivr\.net/);
});

test("standalone conn page follows the ops workbench visual system", () => {
	const response = renderConnPage();

	assert.match(response, /data-standalone-theme="ops-workbench"/);
	assert.match(response, /class="sp-topbar-back" href="\/playground\?view=chat"/);
	assert.match(response, /body\[data-standalone-theme="ops-workbench"\] \.conn-stat-card/);
	assert.match(response, /--ops-bg: #081019/);
	assert.doesNotMatch(response, /body data-standalone-theme="cockpit"/);
});

test("standalone conn page keeps mobile list-detail navigation visible", () => {
	const response = renderConnPage();

	assert.match(
		response,
		/listPanel\.classList\.add\("is-hidden-mobile"\);[\s\S]*listPanel\.classList\.remove\("mobile-visible"\);[\s\S]*detailPanel\.classList\.add\("mobile-visible"\);[\s\S]*detailPanel\.classList\.remove\("is-hidden-mobile"\);/,
	);
	assert.match(
		response,
		/listPanel\.classList\.add\("mobile-visible"\);[\s\S]*listPanel\.classList\.remove\("is-hidden-mobile"\);[\s\S]*detailPanel\.classList\.add\("is-hidden-mobile"\);[\s\S]*detailPanel\.classList\.remove\("mobile-visible"\);/,
	);
});

test("standalone agents page follows the ops workbench visual system", () => {
	const response = renderAgentsPage();

	assert.match(response, /data-standalone-theme="ops-workbench"/);
	assert.match(response, /class="sp-topbar-back" href="\/playground\?view=chat"/);
	assert.match(response, /body\[data-standalone-theme="ops-workbench"\] \.ag-stat-card/);
	assert.match(response, /--ops-bg: #081019/);
	assert.doesNotMatch(response, /body data-standalone-theme="cockpit"/);
});

test("standalone conn page sorts the left task list by unread recency then lifecycle status", () => {
	const response = renderConnPage();

	assert.match(response, /function compareConnListItems\(left, right\)/);
	assert.match(response, /return list\.slice\(\)\.sort\(compareConnListItems\)/);
	assert.match(response, /function getConnUnreadTimeMs\(conn\)/);
	assert.match(response, /state\.unreadLatestRunTimesByConnId\[conn\?\.connId\]/);
	assert.match(response, /function getConnStatusSortRank\(conn\)[\s\S]*conn\?\.status === "active"[\s\S]*conn\?\.status === "paused"[\s\S]*conn\?\.status === "completed"/);
	assert.match(response, /function getConnNextRunTimeMs\(conn\)/);
	assert.match(response, /unreadLatestRunTimesByConnId: data\.unreadLatestRunTimesByConnId \|\| \{\}/);
	assert.match(response, /\.conn-list-item-badge--active \{ background: var\(--success-soft\); color: var\(--success\); \}/);
	assert.match(response, /\.conn-list-item-badge--completed \{ background: rgba\(100,116,139,0\.15\); color: var\(--muted\); \}/);
});

test("standalone conn page falls back when clipboard API is unavailable", () => {
	const response = renderConnPage();

	assert.match(response, /async function writeClipboardText\(text\)\s*\{[\s\S]*navigator\.clipboard && window\.isSecureContext/);
	assert.match(response, /function copyToClipboard\(text\)\s*\{[\s\S]*return writeClipboardText\(text\)\.then/);
	assert.match(response, /document\.execCommand\("copy"\)/);
	assert.match(response, /copyToClipboard\(run\.runId\)\.then/);
	assert.doesNotMatch(response, /navigator\.clipboard\.writeText\(run\.runId\)/);
});


test("GET /playground defaults runtime append behavior to steer", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /mode:\s*"steer"/);
	await app.close();
});

test("GET /playground renders immersive landing home shell", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /id="landing-screen"/);
	assert.doesNotMatch(response.body, /id="hero-core"/);
	assert.doesNotMatch(response.body, /class="hero-wordmark">UGK CLAW</);
	assert.match(response.body, /<header class="topbar">[\s\S]*<aside class="landing-side landing-side-right">/);
	assert.match(response.body, /<aside id="desktop-conversation-rail"[\s\S]*<div class="desktop-conversation-rail-head">[\s\S]*class="desktop-brand" aria-label="UGK CLAW"/);
	assert.doesNotMatch(response.body, /class="topbar-signal" aria-hidden="true">UGK CLAW</);
	assert.match(response.body, /new-conversation-button/);
	assert.doesNotMatch(response.body, /id="view-skills-button"/);
	assert.doesNotMatch(response.body, /id="hero-version"/);
	assert.match(response.body, /id="shell" class="shell" data-stage-mode="landing" data-transcript-state="idle"/);
	assert.match(response.body, /id="command-deck"/);
	assert.match(response.body, /id="desktop-conversation-rail"/);
	assert.match(response.body, /id="desktop-conversation-list"/);
	assert.match(response.body, /id="command-status">/);
	assert.match(response.body, /\.shell\s*\{[\s\S]*padding:\s*22px 28px 26px;/);
	assert.match(response.body, /\.shell\s*\{[\s\S]*column-gap:\s*16px;/);
	assert.match(response.body, /\.desktop-conversation-rail\s*\{[\s\S]*grid-row:\s*1 \/ -1;/);
	assert.match(response.body, /\.topbar\s*\{[\s\S]*grid-column:\s*2;[\s\S]*grid-row:\s*1;[\s\S]*margin:\s*0;[\s\S]*padding:\s*0 0 10px 0;/);
	assert.match(response.body, /\.chat-stage\s*\{[\s\S]*grid-template-rows:\s*minmax\(0, 1fr\) auto;[\s\S]*padding:\s*0;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.command-deck\s*\{[\s\S]*width:\s*100%;[\s\S]*margin:\s*0;[\s\S]*border-radius:\s*4px;[\s\S]*overflow:\s*hidden;/);
	assert.match(response.body, /id="new-conversation-button"/);
	assert.doesNotMatch(response.body, /id="view-skills-button"/);
	assert.match(response.body, /id="file-picker-action"/);
	assert.match(response.body, /id="open-asset-library-button" class="telemetry-card telemetry-action"/);
	assert.match(response.body, /<strong>文件库<\/strong>/);
	assert.match(response.body, /<strong>消息<\/strong>/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.composer\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto;/);
	assert.match(response.body, /\.composer-file-action\s*\{[\s\S]*place-items:\s*center;[\s\S]*width:\s*36px;[\s\S]*min-width:\s*36px;[\s\S]*height:\s*36px;[\s\S]*padding:\s*0;/);
	assert.match(response.body, /\.composer-file-action span::before\s*\{[\s\S]*mask:[\s\S]*center \/ 16px 16px no-repeat;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.stream-layout\s*\{[\s\S]*align-items: center;/);
	assert.match(
		response.body,
		/\.shell\[data-stage-mode="landing"\] \.stream-layout\s*\{[\s\S]*inset:\s*78px 0 var\(--command-deck-offset, 166px\) 0;/
	);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.stream-layout\s*\{[\s\S]*overflow:\s*hidden;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.transcript-pane\s*\{[\s\S]*width: min\(var\(--conversation-width\), 100%\);/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.transcript-pane\s*\{[\s\S]*flex:\s*1 1 auto;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.transcript-pane\s*\{[\s\S]*height:\s*100%;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.transcript-pane\s*\{[\s\S]*max-height:\s*100%;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.transcript\s*\{[\s\S]*border-bottom-right-radius:\s*4px;[\s\S]*border-bottom-left-radius:\s*4px;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.composer\s*\{[\s\S]*border: 1px solid rgba\(201, 210, 255, 0\.08\);/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.composer\s*\{[\s\S]*border-radius: 4px;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.composer\s*\{[\s\S]*background:\s*var\(--chat-composer-bg\);/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.composer\s*\{[\s\S]*padding:\s*8px 10px 8px 12px;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.composer\s*\{[\s\S]*align-self:\s*end;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.composer\s*\{[\s\S]*height:\s*fit-content;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.composer\s*\{[\s\S]*max-height:\s*none;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.composer textarea\s*\{[\s\S]*min-height:\s*40px;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.composer textarea\s*\{[\s\S]*max-height:\s*calc\(var\(--composer-line-height\) \* var\(--composer-textarea-max-lines\) \+ 20px\);/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.composer textarea\s*\{[\s\S]*padding:\s*10px 8px;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] #send-button,[\s\S]*#interrupt-button\s*\{[\s\S]*min-height:\s*40px;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.command-deck\s*\{[\s\S]*width:\s*100%;[\s\S]*border-radius:\s*4px;[\s\S]*overflow:\s*hidden;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.composer\s*\{[\s\S]*border-radius:\s*4px;[\s\S]*overflow:\s*hidden;/);
	assert.match(response.body, /const commandDeck = document\.getElementById\("command-deck"\);/);
	assert.match(response.body, /function syncConversationLayout\(\) \{/);
	assert.match(response.body, /const chatStageRect = chatStage\.getBoundingClientRect\(\);/);
	assert.match(response.body, /const commandDeckRect = commandDeck\.getBoundingClientRect\(\);/);
	assert.match(response.body, /const commandDeckOffset = Math\.ceil\(chatStageRect\.bottom - commandDeckRect\.top \|\| 0\);/);
	assert.match(response.body, /shell\.style\.setProperty\("--command-deck-offset", commandDeckOffset \+ "px"\);/);
	assert.match(response.body, /const layoutObserver = new ResizeObserver\(\(\) => \{/);
	assert.match(response.body, /scheduleConversationLayoutSync\(\);/);
	assert.match(response.body, /layoutObserver\.observe\(commandDeck\);/);
	assert.doesNotMatch(response.body, /layoutObserver\.observe\(composerDropTarget\);/);
	assert.doesNotMatch(response.body, /layoutObserver\.observe\(chatStage\);/);
	assert.match(response.body, /skipNextPageShowResumeSync:\s*true/);
	assert.match(
		response.body,
		/window\.addEventListener\("pageshow",\s*\(event\)\s*=>\s*\{[\s\S]*if\s*\(!event\.persisted\s*&&\s*state\.skipNextPageShowResumeSync\)\s*\{[\s\S]*state\.skipNextPageShowResumeSync\s*=\s*false;[\s\S]*state\.pageUnloading\s*=\s*false;[\s\S]*return;[\s\S]*\}[\s\S]*state\.skipNextPageShowResumeSync\s*=\s*false;[\s\S]*state\.pageUnloading\s*=\s*false;[\s\S]*scheduleResumeConversationSync\("pageshow",\s*\{[\s\S]*forceState:\s*true,[\s\S]*preferEvents:\s*true,[\s\S]*\}\)/,
	);
	assert.match(response.body, /function syncComposerTextareaHeight\(\)\s*\{/);
	assert.match(response.body, /const minHeight =[\s\S]*Number\.parseFloat\(style\.minHeight\)/);
	assert.match(response.body, /const maxLines = 10;/);
	assert.match(response.body, /const expectedSingleLineScrollHeight = Math\.ceil\(lineHeight \+ paddingTop \+ paddingBottom\);/);
	assert.match(response.body, /const rawValue = String\(messageInput\.value \|\| ""\);/);
	assert.match(response.body, /const shouldUseMinHeight =[\s\S]*rawValue\.trim\(\)\.length === 0 \|\|[\s\S]*\(!hasExplicitLineBreak && scrollHeight <= expectedSingleLineScrollHeight \+ singleLineTolerance\);/);
	assert.match(response.body, /messageInput\.style\.height = "auto";/);
	assert.match(response.body, /messageInput\.style\.height = \(shouldUseMinHeight \? minHeight : nextHeight\) \+ "px";/);
	assert.match(response.body, /messageInput\.style\.overflowY = !shouldUseMinHeight && contentHeight > maxHeight \? "auto" : "hidden";/);
	assert.ok(response.body.includes('<textarea id="message" name="message" rows="1" placeholder="'));
	assert.ok(response.body.includes('messageInput.placeholder = "'));
	assert.doesNotMatch(response.body, /Enter terminal command or query neural core/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] #send-button,[\s\S]*#interrupt-button\s*\{[\s\S]*border: 0;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] #send-button,[\s\S]*#interrupt-button\s*\{[\s\S]*border-radius: 4px;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] #send-button,[\s\S]*#interrupt-button\s*\{[\s\S]*box-shadow: none;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.topbar\s*\{[\s\S]*justify-items:\s*stretch;/);
	assert.match(
		response.body,
		/\.shell\[data-stage-mode="landing"\] \.landing-side-right\s*\{[\s\S]*position:\s*relative;[\s\S]*justify-content:\s*flex-start;[\s\S]*justify-self:\s*stretch;[\s\S]*padding:\s*6px 96px 6px 8px;/,
	);
	assert.match(
		response.body,
		/\.topbar-context-slot\s*\{[\s\S]*position:\s*absolute;[\s\S]*top:\s*50%;[\s\S]*right:\s*16px;[\s\S]*transform:\s*translateY\(-50%\);/,
	);
	assert.match(response.body, /\.chat-stage\s*\{[\s\S]*grid-column:\s*2;[\s\S]*grid-row:\s*2;/);
	assert.match(response.body, /\.desktop-conversation-rail\s*\{[\s\S]*grid-column:\s*1;[\s\S]*grid-row:\s*1 \/ -1;/);
	assert.match(response.body, /function renderConversationListInto\(container\)/);
	assert.match(response.body, /renderConversationListInto\(desktopConversationList\);/);
	const headerIndex = response.body.indexOf('<header class="topbar">');
	const asideIndex = response.body.indexOf('<aside class="landing-side landing-side-right">');
	const mobileTopbarIndex = response.body.indexOf('<section id="mobile-topbar" class="mobile-topbar"');
	const contextUsageIndex = response.body.indexOf('id="context-usage-shell"');
	const filePickerActionIndex = response.body.indexOf('id="file-picker-action"');
	const newConversationActionIndex = response.body.indexOf('id="new-conversation-button"');
	const assetActionIndex = response.body.indexOf('id="open-asset-library-button"');
	const connActionIndex = response.body.indexOf('id="open-conn-manager-button"');
	const taskInboxActionIndex = response.body.indexOf('id="open-task-inbox-button"');
	const fileStripIndex = response.body.indexOf('<div class="file-strip">');
	const selectedAssetsIndex = response.body.indexOf('id="selected-assets"');
	const composerIndex = response.body.indexOf('<section id="composer-drop-target" class="composer">');
	const messageInputIndex = response.body.indexOf('<textarea id="message"');
	assert.ok(headerIndex >= 0);
	assert.ok(asideIndex >= 0);
	assert.ok(contextUsageIndex >= 0);
	assert.ok(newConversationActionIndex >= 0);
	assert.ok(asideIndex > headerIndex);
	assert.ok(mobileTopbarIndex > asideIndex);
	assert.ok(newConversationActionIndex > asideIndex);
	assert.ok(assetActionIndex > asideIndex);
	assert.ok(connActionIndex > asideIndex);
	assert.ok(taskInboxActionIndex > asideIndex);
	assert.ok(newConversationActionIndex < assetActionIndex);
	assert.ok(assetActionIndex < connActionIndex);
	assert.ok(connActionIndex < taskInboxActionIndex);
	assert.ok(contextUsageIndex > taskInboxActionIndex);
	assert.ok(contextUsageIndex < mobileTopbarIndex);
	assert.ok(fileStripIndex >= 0);
	assert.ok(selectedAssetsIndex >= 0);
	assert.ok(composerIndex >= 0);
	assert.ok(messageInputIndex >= 0);
	assert.ok(assetActionIndex < fileStripIndex);
	assert.ok(fileStripIndex < composerIndex);
	assert.ok(filePickerActionIndex > composerIndex);
	assert.ok(filePickerActionIndex < messageInputIndex);
	assert.ok(selectedAssetsIndex < composerIndex);
	assert.ok(composerIndex < messageInputIndex);
	assert.match(response.body, /function createFileChip\(\{ tone, fileName, meta, onRemove \}\)\s*\{/);
	assert.match(response.body, /item\.className = "file-chip " \+ \(tone \|\| "pending"\)/);
	assert.match(response.body, /badge\.className = "file-chip-badge"/);
	assert.match(response.body, /label\.className = "file-chip-label"/);
	assert.match(response.body, /removeButton\.className = "file-chip-remove"/);
	assert.match(response.body, /function appendUserTranscriptMessage\(message, attachments, assetRefs\)\s*\{/);
	assert.match(response.body, /function appendMessageFileChips\(body, attachments, assetRefs\)\s*\{/);
	assert.match(response.body, /body\.classList\.add\("has-file-chips"\)/);
	assert.match(response.body, /asset\.fileName/);
	assert.match(response.body, /removeSelectedAsset\(asset\.assetId\)/);
	assert.doesNotMatch(response.body, /updateStreamingProcess\("system", "文件上传中"/);
	assert.doesNotMatch(response.body, /appendProcessEvent\("system", "\\u6587\\u4ef6\\u5df2\\u622a\\u65ad"/);
	assert.doesNotMatch(response.body, /removePendingAttachment/);
	assert.match(response.body, /async function loadAssetDetails\(assetIds, options\)\s*\{/);
	assert.match(response.body, /async function ensureRecentAssetsForRefs\(assetRefs, options\)\s*\{/);
	assert.match(response.body, /fetch\("\/v1\/assets\/" \+ encodeURIComponent\(assetId\)/);
	assert.match(response.body, /const ASSET_DETAIL_CONCURRENCY_LIMIT = 4;/);
	assert.match(response.body, /assetDetailQueue:\s*\[\]/);
	assert.match(response.body, /assetDetailInFlightById:\s*new Map\(\)/);
	assert.match(response.body, /assetDetailActiveCount:\s*0/);
	assert.match(response.body, /function fetchAssetDetail\(assetId, options\)\s*\{/);
	assert.match(response.body, /function enqueueAssetDetailLoad\(assetId, options\)\s*\{/);
	assert.match(response.body, /function pumpAssetDetailQueue\(\)\s*\{/);
	assert.match(response.body, /fetch\("\/v1\/assets\?limit=40"/);
	assert.doesNotMatch(response.body, /appendProcessEvent\("system", "\\u8d44\\u4ea7\\u6e05\\u5355"/);
	assert.doesNotMatch(response.body, /appendProcessEvent\("ok", "\\u8d44\\u4ea7\\u6e05\\u5355\\u5df2\\u52a0\\u8f7d"/);
	assert.match(response.body, /state\.assetDetailInFlightById\.has\(assetId\)/);
	assert.match(response.body, /state\.assetDetailActiveCount >= ASSET_DETAIL_CONCURRENCY_LIMIT/);
	assert.match(response.body, /state\.assetDetailInFlightById\.set\(assetId, promise\)/);
	assert.match(response.body, /state\.assetDetailInFlightById\.delete\(entry\.assetId\)/);
	assert.doesNotMatch(response.body, /pendingAssetIds\.map\(async \(assetId\) =>/);
	assert.match(response.body, /\.file-chip\s*\{[\s\S]*display:\s*inline-grid;/);
	assert.match(response.body, /\.file-chip\s*\{[\s\S]*grid-template-columns:\s*22px minmax\(0, 1fr\) auto;/);
	assert.match(response.body, /\.file-chip\s*\{[\s\S]*border:\s*0;/);
	assert.match(response.body, /\.file-chip-badge\s*\{[\s\S]*border:\s*0;/);
	assert.match(response.body, /\.file-download,[\s\S]*\.asset-pill\s*\{[\s\S]*border:\s*0;/);
	assert.match(response.body, /class=\\"asset-pill-main\\"/);
	assert.match(response.body, /class=\\"asset-pill-type\\"/);
	assert.match(response.body, /class=\\"asset-pill-meta\\"/);
	assert.match(response.body, /class=\\"asset-pill-download-button\\"/);
	assert.match(response.body, /downloadLink\.href = downloadUrl/);
	assert.match(response.body, /downloadLink\.download = asset\.fileName \|\| ""/);
	assert.match(response.body, /function formatAssetMeta\(asset\)/);
	assert.match(response.body, /function getAssetTypeTone\(asset\)/);
	assert.match(response.body, /typeBadge\.classList\.add\("asset-pill-type--" \+ getAssetTypeTone\(asset\)\)/);
	assert.match(response.body, /function getAssetDateGroupLabel\(assetDate, today, yesterday\)/);
	assert.match(response.body, /dateGroupCounts = state\.recentAssets\.reduce/);
	assert.match(response.body, /header\.querySelector\("span"\)\.textContent = \(dateGroupCounts\.get\(assetDate\) \|\| 0\) \+ " 个文件"/);
	assert.doesNotMatch(response.body, /formatAssetPreview/);
	assert.doesNotMatch(response.body, /asset-pill-preview/);
	assert.match(response.body, /\.asset-date-group-header\s*\{[\s\S]*grid-column:\s*1 \/ -1;/);
	assert.match(response.body, /\.asset-date-group-header::after\s*\{[\s\S]*linear-gradient/);
	assert.match(response.body, /\.asset-modal-body::-webkit-scrollbar\s*\{[\s\S]*display:\s*none;/);
	assert.match(response.body, /\.asset-pill-main\s*\{[\s\S]*grid-template-columns:\s*38px minmax\(0, 1fr\);/);
	assert.match(response.body, /\.asset-pill-type\s*\{[\s\S]*place-items:\s*center;[\s\S]*align-content:\s*center;[\s\S]*font-family:\s*var\(--font-mono\);/);
	assert.match(response.body, /\.asset-pill-type b,[\s\S]*\.asset-pill-type em\s*\{[\s\S]*text-overflow:\s*ellipsis;/);
	assert.match(response.body, /\.asset-pill-type--archive\s*\{[\s\S]*--asset-type-bg:\s*rgba\(141, 255, 178, 0\.09\);/);
	assert.match(response.body, /\.asset-pill-type--code\s*\{[\s\S]*--asset-type-bg:\s*rgba\(101, 209, 255, 0\.1\);/);
	assert.match(response.body, /\.asset-pill-type--web\s*\{[\s\S]*--asset-type-bg:\s*rgba\(255, 202, 126, 0\.1\);/);
	assert.match(response.body, /\.asset-pill-download-button\s*\{[\s\S]*background:\s*rgba\(141, 255, 178, 0\.08\);/);
	assert.match(response.body, /\.file-chip-label\s*\{[\s\S]*-webkit-line-clamp:\s*2;/);
	assert.match(response.body, /\.file-chip-badge\s*\{[\s\S]*font-family:\s*var\(--font-mono\);/);
	assert.match(response.body, /\.file-chip-remove\s*\{[\s\S]*border-radius:\s*4px;/);
	assert.match(response.body, /const MAX_COMPOSER_ATTACHMENTS = 5;/);
	assert.match(response.body, /function appendComposerSystemNotice\(message\)/);
	assert.match(response.body, /function isAttachmentLimitProcessNote\(title, detail\)/);
	assert.match(response.body, /\.message-file-strip\s*\{[\s\S]*display:\s*flex;/);
	assert.match(response.body, /\.message\.user \.message-file-strip\s*\{[\s\S]*justify-content:\s*flex-end;/);
	assert.match(response.body, /appendUserTranscriptMessage\(message, attachments, assetRefs\)/);
	assert.doesNotMatch(response.body, /appendTranscriptMessage\("user", state\.conversationId, formatMessageWithContext\(outboundMessage, attachments, assetRefs\)\)/);
	assert.doesNotMatch(
		response.body,
		/state\.connEditorSelectedAssetRefs = state\.connEditorSelectedAssetRefs\.filter\(\(assetId\) =>[\s\S]*state\.recentAssets\.some/,
	);
	assert.doesNotMatch(response.body, /selected-assets-head/);
	assert.doesNotMatch(response.body, /drop-zone-actions/);
	assert.doesNotMatch(response.body, /file-picker-button/);
	assert.doesNotMatch(response.body, /\.shell\[data-stage-mode="workspace"\]/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\]\[data-transcript-state="idle"\] \.stream-layout\s*\{[\s\S]*justify-content: center;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\]\[data-transcript-state="active"\] \.stream-layout\s*\{[\s\S]*inset:\s*0 0 var\(--command-deck-offset, 166px\) 0;[\s\S]*justify-content: flex-end;/);
	assert.doesNotMatch(response.body, /\.shell::before/);
	assert.doesNotMatch(response.body, /\.shell\s*\{[\s\S]*border:\s*1px solid rgba\(95, 209, 255, 0\.12\)/);
	assert.doesNotMatch(response.body, /\.hero-core\s*\{[\s\S]*translateY\(-8%\)/);
	assert.doesNotMatch(response.body, /class="brand-logo"/);
	assert.doesNotMatch(response.body, /class="hero-logo"/);
	assert.doesNotMatch(response.body, /__legacy_empty_state_copy__/);
	assert.doesNotMatch(response.body, /\.shell\[data-transcript-state="idle"\] \.transcript-current:empty::before/);
	await app.close();
});

test("GET /playground embeds syntactically valid browser script", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	const inlineScripts = [...response.body.matchAll(/<script>([\s\S]*?)<\/script>/g)];
	assert.ok(inlineScripts.length > 0, "expected inline playground scripts");
	for (const match of inlineScripts) {
		assert.doesNotThrow(() => {
			new Function(match[1]);
		}, "inline script should be valid JS: " + match[1].slice(0, 80) + "...");
	}
	await app.close();
});

test("POST /v1/conns accepts cron timezone and runtime profile ids", async () => {
	const createdInputs: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		browserRegistry: createBrowserRegistry(
			[
				{ browserId: "default", name: "Default", cdpHost: "127.0.0.1", cdpPort: 9223 },
				{ browserId: "chrome-02", name: "Chrome 02", cdpHost: "127.0.0.1", cdpPort: 9225 },
			],
			"default",
		),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async (input: {
				title: string;
				prompt: string;
				target: { type: "conversation"; conversationId: string };
				schedule: { kind: "cron"; expression: string; timezone?: string };
				assetRefs?: string[];
				profileId?: string;
				agentSpecId?: string;
				skillSetId?: string;
				modelPolicyId?: string;
				modelProvider?: string;
				modelId?: string;
				upgradePolicy?: "latest" | "pinned" | "manual";
				browserId?: string;
				maxRunMs?: number;
				execution?: { type: "agent_prompt" } | { type: "team_group"; groupId: string };
			}) => {
				createdInputs.push(input);
				return {
					connId: "conn-1",
					title: input.title,
					prompt: input.prompt,
					target: input.target,
					schedule: input.schedule,
					assetRefs: input.assetRefs ?? [],
					profileId: input.profileId,
					agentSpecId: input.agentSpecId,
					skillSetId: input.skillSetId,
					modelPolicyId: input.modelPolicyId,
					modelProvider: input.modelProvider,
					modelId: input.modelId,
					upgradePolicy: input.upgradePolicy,
					browserId: input.browserId,
					maxRunMs: input.maxRunMs,
					execution: input.execution ?? { type: "agent_prompt" },
					status: "active",
					createdAt: "2026-04-21T00:00:00.000Z",
					updatedAt: "2026-04-21T00:00:00.000Z",
				};
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/conns",
		payload: {
			title: " morning digest ",
			prompt: " run every day ",
			target: { type: "conversation", conversationId: "manual:digest" },
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
			assetRefs: ["asset-1", " asset-2 "],
			profileId: "background.zh",
			agentSpecId: "agent.daily",
			skillSetId: "skills.research",
			modelPolicyId: "model.stable",
			modelProvider: "xiaomi-mimo-cn",
			modelId: "mimo-v2.5-pro",
			upgradePolicy: "pinned",
			browserId: "chrome-02",
			maxRunMs: 120000,
		},
	});

	assert.equal(response.statusCode, 201);
	assert.deepEqual(createdInputs, [
		{
			title: "morning digest",
			prompt: "run every day",
			target: { type: "conversation", conversationId: "manual:digest" },
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
			assetRefs: ["asset-1", "asset-2"],
			profileId: "background.zh",
			agentSpecId: "agent.daily",
			skillSetId: "skills.research",
			modelPolicyId: "model.stable",
			modelProvider: "xiaomi-mimo-cn",
			modelId: "mimo-v2.5-pro",
			upgradePolicy: "pinned",
			browserId: "chrome-02",
			maxRunMs: 120000,
			execution: { type: "agent_prompt" },
		},
	]);
	assert.deepEqual(response.json(), {
		conn: {
			connId: "conn-1",
			title: "morning digest",
			prompt: "run every day",
			target: { type: "conversation", conversationId: "manual:digest" },
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
			assetRefs: ["asset-1", "asset-2"],
			profileId: "background.zh",
			agentSpecId: "agent.daily",
			skillSetId: "skills.research",
			modelPolicyId: "model.stable",
			modelProvider: "xiaomi-mimo-cn",
			modelId: "mimo-v2.5-pro",
			upgradePolicy: "pinned",
			browserId: "chrome-02",
			maxRunMs: 120000,
			execution: { type: "agent_prompt" },
			status: "active",
			createdAt: "2026-04-21T00:00:00.000Z",
			updatedAt: "2026-04-21T00:00:00.000Z",
		},
	});
	await app.close();
});

test("POST /v1/conns defaults target to the task inbox when target is omitted", async () => {
	const createdInputs: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			getConversationCatalog: async () => ({
				currentConversationId: "manual:current-thread",
				conversations: [
					{
						conversationId: "manual:current-thread",
						title: "Current thread",
						preview: "",
						messageCount: 3,
						createdAt: "2026-04-21T00:00:00.000Z",
						updatedAt: "2026-04-21T00:00:00.000Z",
						running: false,
					},
				],
			}),
		}),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async (input: {
				title: string;
				prompt: string;
				target: { type: "task_inbox" };
				schedule: { kind: "cron"; expression: string; timezone?: string };
				assetRefs?: string[];
				profileId?: string;
				agentSpecId?: string;
				skillSetId?: string;
				modelPolicyId?: string;
			upgradePolicy?: "latest" | "pinned" | "manual";
				execution?: { type: "agent_prompt" } | { type: "team_group"; groupId: string };
			}) => {
				createdInputs.push(input);
				return {
					connId: "conn-default-target",
					title: input.title,
					prompt: input.prompt,
					target: input.target,
					schedule: input.schedule,
					assetRefs: input.assetRefs ?? [],
					profileId: input.profileId,
					agentSpecId: input.agentSpecId,
					skillSetId: input.skillSetId,
					modelPolicyId: input.modelPolicyId,
					upgradePolicy: input.upgradePolicy,
					execution: input.execution ?? { type: "agent_prompt" },
					status: "active",
					createdAt: "2026-04-21T00:00:00.000Z",
					updatedAt: "2026-04-21T00:00:00.000Z",
				};
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/conns",
		payload: {
			title: " current digest ",
			prompt: " follow current conversation ",
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
		},
	});

	assert.equal(response.statusCode, 201);
	assert.deepEqual(createdInputs, [
		{
			title: "current digest",
			prompt: "follow current conversation",
			target: { type: "task_inbox" },
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
			assetRefs: undefined,
			profileId: undefined,
			agentSpecId: undefined,
			skillSetId: undefined,
			modelPolicyId: undefined,
			modelProvider: undefined,
			modelId: undefined,
			upgradePolicy: undefined,
			execution: { type: "agent_prompt" },
		},
	]);
	assert.deepEqual(response.json(), {
		conn: {
			connId: "conn-default-target",
			title: "current digest",
			prompt: "follow current conversation",
			target: { type: "task_inbox" },
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
			assetRefs: [],
			execution: { type: "agent_prompt" },
			status: "active",
			createdAt: "2026-04-21T00:00:00.000Z",
			updatedAt: "2026-04-21T00:00:00.000Z",
		},
	});
	await app.close();
});

test("POST /v1/conns accepts team_group execution and returns normalized execution", async () => {
	const createdInputs: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async (input: Record<string, unknown>) => {
				createdInputs.push(input);
				return {
					connId: "conn-team-group",
					title: input.title as string,
					prompt: input.prompt as string,
					target: input.target as { type: "task_inbox" },
					schedule: input.schedule as { kind: "cron"; expression: string; timezone?: string },
					assetRefs: [],
					execution: input.execution as { type: "team_group"; groupId: string },
					status: "active",
					createdAt: "2026-06-05T00:00:00.000Z",
					updatedAt: "2026-06-05T00:00:00.000Z",
				};
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/conns",
		payload: {
			title: " group schedule ",
			prompt: " legacy placeholder ",
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
			execution: { type: "team_group", groupId: " group-1 " },
		},
	});

	assert.equal(response.statusCode, 201);
	assert.deepEqual(createdInputs, [
		{
			title: "group schedule",
			prompt: "legacy placeholder",
			target: { type: "task_inbox" },
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
			assetRefs: undefined,
			profileId: undefined,
			agentSpecId: undefined,
			skillSetId: undefined,
			modelPolicyId: undefined,
			modelProvider: undefined,
			modelId: undefined,
			upgradePolicy: undefined,
			execution: { type: "team_group", groupId: "group-1" },
		},
	]);
	assert.equal(response.json().conn.execution.type, "team_group");
	assert.equal(response.json().conn.execution.groupId, "group-1");
	await app.close();
});

test("PATCH /v1/conns/:connId accepts team_group execution", async () => {
	const updateCalls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async (connId: string, patch: Record<string, unknown>) => {
				updateCalls.push({ connId, patch });
				return {
					connId,
					title: "existing",
					prompt: "existing prompt",
					target: { type: "task_inbox" },
					schedule: { kind: "interval", everyMs: 60000 },
					assetRefs: [],
					execution: patch.execution,
					status: "active",
					createdAt: "2026-06-05T00:00:00.000Z",
					updatedAt: "2026-06-05T00:00:00.000Z",
				};
			},
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "PATCH",
		url: "/v1/conns/conn-edit-1",
		payload: {
			execution: { type: "team_group", groupId: " group-2 " },
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(updateCalls, [
		{
			connId: "conn-edit-1",
			patch: {
				execution: { type: "team_group", groupId: "group-2" },
			},
		},
	]);
	assert.deepEqual(response.json().conn.execution, { type: "team_group", groupId: "group-2" });
	await app.close();
});

test("POST /v1/conns rejects invalid execution payloads", async () => {
	const createCalls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async (input: unknown) => {
				createCalls.push(input);
				throw new Error("should not create");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});
	const basePayload = {
		title: "bad execution",
		prompt: "run",
		schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
	};

	for (const execution of [
		null,
		"team_group",
		{ type: "unknown" },
		{ type: "team_group" },
		{ type: "team_group", groupId: "   " },
	]) {
		const response = await app.inject({
			method: "POST",
			url: "/v1/conns",
			payload: { ...basePayload, execution },
		});
		assert.equal(response.statusCode, 400);
		assert.match(response.json().error.message, /execution/);
	}
	assert.deepEqual(createCalls, []);
	await app.close();
});

test("POST /v1/conns validates browserId against the browser registry", async () => {
	const createdInputs: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		browserRegistry: createBrowserRegistry(
			[
				{ browserId: "default", name: "Default", cdpHost: "127.0.0.1", cdpPort: 9223 },
				{ browserId: "chrome-01", name: "Chrome 01", cdpHost: "127.0.0.1", cdpPort: 9224 },
			],
			"default",
		),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async (input: Record<string, unknown>) => {
				createdInputs.push(input);
				return {
					connId: "conn-browser",
					title: input.title as string,
					prompt: input.prompt as string,
					target: input.target as { type: "task_inbox" },
					schedule: input.schedule as { kind: "cron"; expression: string; timezone?: string },
					assetRefs: [],
					browserId: input.browserId as string | undefined,
					status: "active",
					createdAt: "2026-04-21T00:00:00.000Z",
					updatedAt: "2026-04-21T00:00:00.000Z",
				};
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const created = await app.inject({
		method: "POST",
		url: "/v1/conns",
		payload: {
			title: "browser task",
			prompt: "run",
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
			browserId: "chrome-01",
		},
	});
	const rejected = await app.inject({
		method: "POST",
		url: "/v1/conns",
		payload: {
			title: "browser task",
			prompt: "run",
			schedule: { kind: "cron", expression: "0 9 * * *", timezone: "Asia/Shanghai" },
			browserId: "missing",
		},
	});

	assert.equal(created.statusCode, 201);
	assert.equal(created.json().conn.browserId, "chrome-01");
	assert.equal(rejected.statusCode, 400);
	assert.match(rejected.json().error.message, /Unknown browserId: missing/);
	assert.deepEqual(
		createdInputs.map((input) => (input as { browserId?: string }).browserId),
		["chrome-01"],
	);
	await app.close();
});

test("POST /v1/conns returns 400 when the once schedule is already in the past", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {} as never,
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async () => {
				throw new Error("Invalid conn schedule: once.at is in the past");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/conns",
		payload: {
			title: "late job",
			prompt: "run once",
			schedule: {
				kind: "once",
				at: "2026-04-21T09:59:00.000Z",
			},
		},
	});

	assert.equal(response.statusCode, 400);
	assert.deepEqual(response.json(), {
		error: {
			code: "BAD_REQUEST",
			message: "Invalid conn schedule: once.at is in the past",
		},
	});
	await app.close();
});

test("PATCH /v1/conns/:connId rejects a blank title when the field is provided", async () => {
	const updateCalls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		browserRegistry: createBrowserRegistry(
			[
				{ browserId: "default", name: "Default", cdpHost: "127.0.0.1", cdpPort: 9223 },
				{ browserId: "chrome-02", name: "Chrome 02", cdpHost: "127.0.0.1", cdpPort: 9225 },
			],
			"default",
		),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async (connId: string, patch: Record<string, unknown>) => {
				updateCalls.push({ connId, patch });
				return {
					connId,
					title: "existing title",
					prompt: "existing prompt",
					target: { type: "conversation", conversationId: "manual:existing" },
					schedule: { kind: "once", at: "2026-04-22T09:00:00.000Z" },
					assetRefs: [],
					status: "active",
					createdAt: "2026-04-22T08:00:00.000Z",
					updatedAt: "2026-04-22T08:30:00.000Z",
				};
			},
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "PATCH",
		url: "/v1/conns/conn-blank-title",
		payload: {
			title: "   ",
		},
	});

	assert.equal(response.statusCode, 400);
	assert.match(response.body, /title/);
	assert.deepEqual(updateCalls, []);
	await app.close();
});

test("PATCH /v1/conns/:connId trims and forwards editable conn fields", async () => {
	const updateCalls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async (connId: string, patch: Record<string, unknown>) => {
				updateCalls.push({ connId, patch });
				return {
					connId,
					title: String(patch.title ?? "existing title"),
					prompt: String(patch.prompt ?? "existing prompt"),
					target: (patch.target as Record<string, unknown>) ?? { type: "conversation", conversationId: "manual:existing" },
					schedule:
						(patch.schedule as Record<string, unknown>) ?? { kind: "once", at: "2026-04-22T09:00:00.000Z" },
					assetRefs: (patch.assetRefs as string[]) ?? [],
					profileId: patch.profileId as string | undefined,
					agentSpecId: patch.agentSpecId as string | undefined,
					skillSetId: patch.skillSetId as string | undefined,
					modelPolicyId: patch.modelPolicyId as string | undefined,
					upgradePolicy: patch.upgradePolicy as "latest" | "pinned" | "manual" | undefined,
					browserId: patch.browserId as string | null | undefined,
					maxRunMs: patch.maxRunMs as number | undefined,
					status: "active",
					createdAt: "2026-04-22T08:00:00.000Z",
					updatedAt: "2026-04-22T08:30:00.000Z",
				};
			},
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "PATCH",
		url: "/v1/conns/conn-edit-1",
		payload: {
			title: " updated title ",
			prompt: " updated prompt ",
			target: { type: "conversation", conversationId: "manual:patched" },
			schedule: { kind: "interval", everyMs: 120000, startAt: "2026-04-22T09:00:00.000Z" },
			assetRefs: ["asset-1", " asset-2 "],
			profileId: "background.patched",
			agentSpecId: "agent.patched",
			skillSetId: "skills.patched",
			modelPolicyId: "model.patched",
			upgradePolicy: "manual",
			browserId: null,
			maxRunMs: 90000,
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(updateCalls, [
		{
			connId: "conn-edit-1",
			patch: {
				title: "updated title",
				prompt: "updated prompt",
				target: { type: "conversation", conversationId: "manual:patched" },
				schedule: { kind: "interval", everyMs: 120000, startAt: "2026-04-22T09:00:00.000Z" },
				assetRefs: ["asset-1", "asset-2"],
				profileId: "background.patched",
				agentSpecId: "agent.patched",
				skillSetId: "skills.patched",
				modelPolicyId: "model.patched",
				upgradePolicy: "manual",
				browserId: null,
				maxRunMs: 90000,
			},
		},
	]);
	assert.match(response.body, /updated title/);
	await app.close();
});

test("GET /playground does not require crypto.randomUUID in non-HTTPS browsers", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /function createBrowserId\(\)\s*\{/);
	assert.match(response.body, /typeof cryptoApi\.randomUUID === "function"/);
	assert.match(response.body, /cryptoApi\.getRandomValues/);
	assert.doesNotMatch(response.body, /crypto\.randomUUID\(\)/);
	await app.close();
});

test("GET /playground embeds conversation history restore and message copy controls", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /ugk-pi:conversation-history-index/);
	assert.match(response.body, /function getConversationHistoryStorageKey\(conversationId\)\s*\{/);
	assert.match(response.body, /function restoreConversationHistory\(conversationId\)\s*\{/);
	assert.match(response.body, /function renderMoreConversationHistory\(\)\s*\{/);
	assert.match(response.body, /async function fetchConversationHistoryPage\(conversationId, options\)\s*\{/);
	assert.match(response.body, /function bindPlaygroundAssemblerEvents\(\)\s*\{/);
	assert.match(response.body, /function initializePlaygroundAssembler\(\)\s*\{/);
	assert.match(response.body, /bindPlaygroundAssemblerEvents\(\);/);
	assert.match(response.body, /initializePlaygroundAssembler\(\);/);
	assert.doesNotMatch(response.body, /async function fetchConversationHistory\(conversationId\)\s*\{/);
	assert.match(response.body, /function handleTranscriptScroll\(\)\s*\{/);
	assert.match(response.body, /transcript\.addEventListener\("scroll", handleTranscriptScroll\)/);
	assert.match(response.body, /id="transcript-archive"/);
	assert.match(response.body, /id="transcript-current"/);
	assert.match(response.body, /function archiveCurrentTranscript\(conversationId\)\s*\{/);
	assert.match(response.body, /const MAX_ARCHIVED_TRANSCRIPTS = 4;/);
	assert.match(response.body, /conversationState\?\.viewMessages/);
	assert.match(response.body, /viewLimit=" \+/);
	assert.match(response.body, /conversationState\?\.historyPage\?\.hasMore/);
	assert.match(response.body, /getAgentApiPath\("\/chat\/history"\) \+ "\?" \+ params\.toString\(\)/);
	assert.match(response.body, /state\.historyHasMore/);
	assert.match(response.body, /state\.historyNextBefore/);
	assert.match(response.body, /renderedMessages\.get\(activeRun\.assistantMessageId\)/);
	assert.match(response.body, /function findRenderedAssistantForActiveRun\(activeRun\)\s*\{/);
	assert.match(response.body, /String\(entry\.runId \|\| ""\)\.trim\(\) === runId/);
	assert.doesNotMatch(response.body, /usesServerViewMessages/);
	assert.doesNotMatch(response.body, /id: "active-input-" \+ activeRun\.runId/);
	assert.doesNotMatch(response.body, /function isActiveRunAlreadyRepresentedByHistory\(activeRun\)\s*\{/);
	assert.doesNotMatch(response.body, /function dedupeConversationHistoryEntries\(entries\)\s*\{/);
	assert.doesNotMatch(response.body, /id="history-load-more-button"/);
	assert.match(response.body, /id="history-auto-load-status"/);
	assert.match(response.body, /function syncHistoryAutoLoadStatus\(\)\s*\{/);
	assert.match(response.body, /historyAutoLoadStatus\.textContent = state\.historyLoadingMore/);
	assert.match(response.body, /transcript\.scrollTop <= 24 && hasOlderConversationHistory\(\)/);
	assert.doesNotMatch(response.body, /historyLoadMoreButton\.addEventListener\("click"/);
	assert.match(response.body, /async function createConversationOnServer\(\)\s*\{/);
	assert.match(response.body, /getAgentApiPath\("\/chat\/conversations"\)/);
	assert.match(response.body, /function createMessageActions\(entry, content\)\s*\{/);
	assert.match(response.body, /function clearAssistantStatusControls\(card\)\s*\{/);
	assert.match(response.body, /card\.querySelectorAll\("\.assistant-status-shell, \.assistant-run-log-trigger"\)\.forEach/);
	assert.match(response.body, /function exportMessageBodyAsImage\(body, entry, triggerButton\)\s*\{/);
	assert.match(response.body, /function sanitizeExportStyles\(cssText\)\s*\{/);
	assert.match(response.body, /function sanitizeExportStyles\(cssText\)\s*\{[\s\S]*@font-face/);
	assert.match(response.body, /\.replace\(\/url/);
	assert.match(response.body, /function prepareExportCloneForCanvas\(clone\)\s*\{/);
	assert.match(response.body, /clone\.querySelectorAll\("img, video, iframe, canvas"\)\.forEach/);
	assert.match(response.body, /"data:image\/svg\+xml;charset=utf-8," \+ encodeURIComponent\(svgText\)/);
	assert.match(response.body, /sanitizeExportStyles\(await collectExportStyles\(\)\)/);
	assert.match(response.body, /showError\("图片导出失败，请稍后重试。"\);/);
	assert.doesNotMatch(response.body, /showErrorBanner/);
	assert.doesNotMatch(response.body, /new Blob\(\[svgText\]/);
	assert.match(response.body, /function createMessageImageExportButton\(entry, body\)\s*\{/);
	assert.match(response.body, /message-actions/);
	assert.match(response.body, /message-copy-button/);
	assert.match(response.body, /message-image-export-button/);
	assert.match(response.body, /imageButton\.setAttribute\("aria-label", "保存为图片"\)/);
	assert.match(response.body, /export-signature/);
	assert.match(response.body, /message-export-media-placeholder/);
	assert.match(response.body, /function shouldRenderMessageActions\(entry\)\s*\{/);
	assert.match(response.body, /function syncRenderedMessageActions\(entry\)\s*\{/);
	assert.match(response.body, /if \(!shouldRenderMessageActions\(entry\)\) \{\s*existingActions\?\.remove\(\);/);
	assert.match(
		response.body,
		/function renderTranscriptEntry\(entry, insertMode\)\s*\{[\s\S]*if \(shouldRenderMessageActions\(entry\)\) \{\s*messageActions = createMessageActions\(entry, content\);[\s\S]*body\.appendChild\(messageActions\.actions\);/,
	);
	assert.match(response.body, /syncRenderedMessageActions\(historyEntry\);/);
	assert.doesNotMatch(response.body, /card\.appendChild\(messageActions\.actions\);/);
	assert.match(response.body, /\.message-body > \.message-actions\s*\{[\s\S]*margin-top:\s*0;/);
	assert.match(response.body, /\.message\.assistant \.message-body\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*0;/);
	assert.match(response.body, /\.message\.user \.message-body\s*\{[\s\S]*background:\s*var\(--chat-user-bg\);[\s\S]*color:\s*var\(--chat-user-fg\);/);
	assert.match(response.body, /:root\[data-theme="light"\]\s*\{[\s\S]*--chat-user-bg:/);
	assert.match(response.body, /function attachMobileMessageLongPressMenu\(entry, rendered\)\s*\{/);
	assert.match(response.body, /window\.setTimeout\(\(\) => \{[\s\S]*openMessageContextMenu\(entry, rendered\);[\s\S]*\}, 500\);/);
	assert.match(response.body, /\.message-context-menu/);
	assert.match(response.body, /\.message-body > \.message-actions\s*\{[\s\S]*display:\s*none;/);
	const messageActionButtonBlock = response.body.match(
		/\.message-copy-button,\s*\n\s*\.message-image-export-button\s*\{([\s\S]*?)\n\s*\}/,
	);
	assert.ok(messageActionButtonBlock);
	assert.match(messageActionButtonBlock[1], /width:\s*26px;/);
	assert.match(messageActionButtonBlock[1], /height:\s*26px;/);
	assert.match(messageActionButtonBlock[1], /border:\s*0;/);
	assert.match(messageActionButtonBlock[1], /background:\s*transparent;/);
	assert.match(messageActionButtonBlock[1], /box-shadow:\s*none;/);
	assert.match(messageActionButtonBlock[1], /color:\s*rgba\(226,\s*234,\s*255,\s*0\.52\);/);
	assert.doesNotMatch(messageActionButtonBlock[1], /border-color:\s*rgba\(201,\s*210,\s*255,\s*0\.2\);/);
	assert.doesNotMatch(messageActionButtonBlock[1], /background:\s*rgba\(201,\s*210,\s*255,\s*0\.05\);/);
	assert.match(response.body, /\.message-copy-button:hover:not\(:disabled\),[\s\S]*\.message-image-export-button:focus-visible\s*\{[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /\.message-copy-button::before,[\s\S]*\.message-copy-button::after\s*\{[\s\S]*content:\s*"";/);
	assert.match(response.body, /\.message-image-export-button svg\s*\{[\s\S]*stroke:\s*currentColor;/);
	assert.match(response.body, /copyButton\.setAttribute\("aria-label", /);
	assert.match(response.body, /copyLabel\.className = "visually-hidden"/);
	assert.match(response.body, /copyButton\.setAttribute\("aria-label", original\)/);
	assert.match(response.body, /await copyTextToClipboard\(entry\.text \|\| ""\)/);
	assert.match(response.body, /function canPreviewFile\(mimeType\)\s*\{/);
	assert.match(response.body, /normalized === "text\/html"/);
	assert.match(response.body, /function buildDownloadUrl\(downloadUrl\)\s*\{/);
	assert.match(response.body, /openLink\.textContent = /);
	assert.match(response.body, /link\.textContent = /);
	await app.close();
});

test("GET /playground ignores stale conversation history responses and clears archived transcript DOM", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /function clearRenderedTranscript\(\)\s*\{[\s\S]*transcriptCurrent\.innerHTML = "";/);
	assert.match(response.body, /function clearRenderedTranscript\(\)\s*\{[\s\S]*transcriptArchive\.innerHTML = "";/);
	assert.match(
		response.body,
		/function isConversationSyncTokenCurrent\(syncToken, conversationId\)\s*\{[\s\S]*syncToken\.requestId >= state\.conversationAppliedSyncRequestId/,
	);
	assert.match(
		response.body,
		/const syncToken = issueConversationSyncToken\(nextConversationId\);[\s\S]*const payload = await fetchConversationState\(nextConversationId, \{\s*signal: syncToken\.abortController\?\.signal,\s*\}\);[\s\S]*if \(!renderConversationState\(payload, syncToken\)\)\s*\{\s*return payload;\s*\}/,
	);
	assert.match(
		response.body,
		/function renderConversationState\(conversationState, syncToken\)\s*\{[\s\S]*if \(!shouldApplyConversationState\(conversationState, syncToken\)\)\s*\{\s*return false;\s*\}/,
	);
	await app.close();
});

test("GET /playground unifies conversation sync ownership with invalidation tokens", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /conversationSyncGeneration:\s*0,/);
	assert.match(response.body, /conversationSyncRequestId:\s*0,/);
	assert.match(response.body, /conversationStateAbortController:\s*null,/);
	assert.match(response.body, /function invalidateConversationSyncOwnership\(nextConversationId\)\s*\{/);
	assert.match(response.body, /function abortConversationStateSync\(\)\s*\{/);
	assert.match(response.body, /function issueConversationSyncToken\(conversationId\)\s*\{/);
	assert.match(response.body, /abortConversationStateSync\(\);[\s\S]*const abortController = typeof AbortController === "function"[\s\S]*state\.conversationStateAbortController = abortController;/);
	assert.match(response.body, /function isConversationSyncTokenCurrent\(syncToken, conversationId\)\s*\{/);
	assert.match(response.body, /function shouldApplyConversationState\(conversationState, syncToken\)\s*\{/);
	assert.match(
		response.body,
		/stopActiveRunEventStream\(\);[\s\S]*invalidateConversationSyncOwnership\(nextConversationId\);[\s\S]*state\.conversationId = nextConversationId;/,
	);
	assert.match(
		response.body,
		/const syncToken = issueConversationSyncToken\(nextConversationId\);[\s\S]*const payload = await fetchConversationState\(nextConversationId, \{\s*signal: syncToken\.abortController\?\.signal,\s*\}\);[\s\S]*if \(!renderConversationState\(payload, syncToken\)\)\s*\{/,
	);
	assert.match(response.body, /if \(isConversationStateAbortError\(error\)\) \{/);
	assert.match(
		response.body,
		/function renderConversationState\(conversationState, syncToken\)\s*\{[\s\S]*if \(!shouldApplyConversationState\(conversationState, syncToken\)\)\s*\{\s*return false;\s*\}/,
	);
	await app.close();
});

test("GET /playground syncs the current conversation from the server catalog", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /async function fetchConversationCatalog\(options\)\s*\{/);
	assert.match(response.body, /getAgentApiPath\("\/chat\/conversations"\)/);
	assert.match(response.body, /async function createConversationOnServer\(\)\s*\{/);
	assert.match(response.body, /POST",\s*headers:[\s\S]*getAgentApiPath\("\/chat\/conversations"\)/);
	assert.match(response.body, /body: JSON\.stringify\(\{\}\),/);
	assert.match(response.body, /async function switchConversationOnServer\(conversationId\)\s*\{/);
	assert.match(response.body, /getAgentApiPath\("\/chat\/current"\)/);
	assert.match(response.body, /conversationCatalogSyncPromise:\s*null,/);
	assert.match(response.body, /conversationCatalogAbortController:\s*null,/);
	assert.match(response.body, /conversationCatalogSyncedAt:\s*0,/);
	assert.match(response.body, /async function syncConversationCatalog\(options\)\s*\{/);
	assert.match(response.body, /const hasFreshCatalog =[\s\S]*CONVERSATION_CATALOG_FRESH_MS;/);
	assert.match(response.body, /function abortConversationCatalogSync\(\)\s*\{/);
	assert.match(response.body, /function releaseConversationCatalogSync\(syncPromise, abortController\)\s*\{/);
	assert.match(response.body, /function isConversationCatalogAbortError\(error\)\s*\{/);
	assert.match(response.body, /function invalidateConversationCatalog\(\)\s*\{[\s\S]*abortConversationCatalogSync\(\);/);
	assert.match(response.body, /if \(options\?\.force\) \{[\s\S]*abortConversationCatalogSync\(\);[\s\S]*\}/);
	assert.match(response.body, /if \(state\.conversationCatalogSyncPromise\) \{[\s\S]*return await state\.conversationCatalogSyncPromise;/);
	assert.match(response.body, /const abortController = typeof AbortController === "function" \? new AbortController\(\) : null;/);
	assert.match(response.body, /const payload = await fetchConversationCatalog\(\{\s*signal: abortController\?\.signal,\s*\}\);/);
	assert.match(response.body, /if \(isConversationCatalogAbortError\(error\)\) \{[\s\S]*return getConversationCatalogSnapshot\(\);[\s\S]*\}/);
	assert.match(response.body, /releaseConversationCatalogSync\(syncPromise, abortController\);/);
	assert.match(response.body, /async function ensureCurrentConversation\(options\)\s*\{/);
	assert.match(response.body, /function upsertConversationCatalogItem\(item, options\)\s*\{/);
	assert.doesNotMatch(response.body, /const GLOBAL_CONVERSATION_ID = "agent:global";/);
	assert.doesNotMatch(response.body, /conversationInput\.readOnly = true;/);
	await app.close();
});

test("GET /playground activates conversations without redundant state and catalog round-trips", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(
		response.body,
		/async function activateConversation\(conversationId, options\)\s*\{[\s\S]*void restoreConversationHistoryFromServer\(nextConversationId, \{\s*silent: true,\s*clearIfIdle: true,\s*attachIfRunning: true,\s*\}\);/,
	);
	assert.doesNotMatch(
		response.body,
		/async function activateConversation\(conversationId, options\)\s*\{[\s\S]*await restoreConversationHistoryFromServer\(nextConversationId, \{\s*silent: true,\s*clearIfIdle: true,\s*attachIfRunning: true,\s*\}\);/,
	);
	assert.doesNotMatch(
		response.body,
		/async function activateConversation\(conversationId, options\)\s*\{[\s\S]*await restoreConversationHistoryFromServer\(nextConversationId\);[\s\S]*await syncConversationRunState\(nextConversationId,/,
	);
	assert.match(
		response.body,
		/async function selectConversationFromDrawer\(conversationId\)\s*\{[\s\S]*closeMobileConversationDrawer\(\);[\s\S]*const result = await switchConversationOnServer\(nextConversationId\);[\s\S]*await activateConversation\(result\.currentConversationId \|\| result\.conversationId, \{\s*skipCatalogSync: true,\s*skipServerSwitch: true,\s*\}\);/,
	);
	assert.match(
		response.body,
		/const hasPendingSwitch = Object\.keys\(state\.conversationSwitchPendingById \|\| \{\}\)\.length > 0;[\s\S]*button\.disabled = state\.loading \|\| hasPendingSwitch;/,
	);
	assert.match(
		response.body,
		/async function selectConversationFromDrawer\(conversationId\)\s*\{[\s\S]*if \(Object\.keys\(state\.conversationSwitchPendingById \|\| \{\}\)\.length > 0\) \{[\s\S]*return;[\s\S]*\}/,
	);
	assert.doesNotMatch(response.body, /button\.disabled = state\.loading \|\| item\.conversationId === state\.conversationId;/);
	assert.match(
		response.body,
		/conversationCreatePending:\s*false,/,
	);
	assert.match(
		response.body,
		/function isCurrentConversationBlank\(\)\s*\{[\s\S]*catalogMessageCount === 0[\s\S]*visibleMessageCount === 0[\s\S]*renderedMessages\.size === 0/,
	);
	assert.match(
		response.body,
		/async function startNewConversation\(\)\s*\{[\s\S]*if \(isCurrentConversationBlank\(\)\) \{[\s\S]*return true;[\s\S]*\}[\s\S]*if \(state\.conversationCreatePending\) \{[\s\S]*return false;[\s\S]*\}[\s\S]*state\.conversationCreatePending = true;[\s\S]*finally \{[\s\S]*state\.conversationCreatePending = false;[\s\S]*\}/,
	);
	assert.match(
		response.body,
		/async function startNewConversation\(\)\s*\{[\s\S]*const optimisticTimestamp = new Date\(\)\.toISOString\(\);[\s\S]*upsertConversationCatalogItem\([\s\S]*conversationId: nextConversationId,[\s\S]*\{ isNew: true \},[\s\S]*const activated = await activateConversation\(nextConversationId, \{\s*skipCatalogSync: true,\s*skipServerSwitch: true,\s*\}\);[\s\S]*return activated;/,
	);
	assert.doesNotMatch(
		response.body,
		/async function startNewConversation\(\)\s*\{[\s\S]*await syncConversationCatalog\(/,
	);
	await app.close();
});

test("GET /playground uses a compact mobile topbar with overflow actions", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /class="mobile-topbar"/);
	assert.match(response.body, /class="mobile-brand-logo desktop-brand"[^>]*aria-label="UGK CLAW"/);
	assert.match(response.body, /class="ugk-svg-logo ugk-svg-logo-dark ugk-svg-logo-topbar" src="\/ugk-claw-logo\.svg"/);
	assert.match(response.body, /class="ugk-svg-logo ugk-svg-logo-light ugk-svg-logo-topbar" src="\/ugk-claw-logo-light\.svg"/);
	assert.match(response.body, /class="ugk-ascii-logo ugk-ascii-logo-topbar"/);
	assert.doesNotMatch(response.body, /class="ugk-ascii-logo ugk-ascii-logo-mobile"/);
	assert.doesNotMatch(response.body, /class="mobile-brand-wordmark">UGK Claw</);
	assert.doesNotMatch(response.body, /class="mobile-brand-logo"[^>]*src="\/ugk-claw-mobile-logo\.png"/);
	assert.match(response.body, /id="mobile-new-conversation-button"/);
	assert.match(response.body, /id="mobile-overflow-menu-button"/);
	assert.match(response.body, /class="mobile-topbar-button mobile-topbar-button-with-badge"/);
	assert.match(response.body, /id="mobile-overflow-task-inbox-badge"/);
	assert.match(response.body, /id="mobile-overflow-menu"/);
	assert.match(response.body, /class="mobile-overflow-menu"/);
	assert.match(response.body, /id="mobile-overflow-menu"[^>]*hidden|hidden[^>]*id="mobile-overflow-menu"/);
	assert.doesNotMatch(response.body, /id="mobile-menu-skills-button"/);
	assert.match(response.body, /id="mobile-menu-file-button"/);
	assert.match(response.body, /id="mobile-menu-library-button"/);
	assert.match(response.body, /id="mobile-menu-task-inbox-button"/);
	assert.match(response.body, /id="mobile-menu-model-config-button"/);
	assert.match(response.body, /id="mobile-menu-model-sources-link"/);
	assert.match(response.body, /id="mobile-menu-browser-workbench-button"/);
	assert.match(response.body, /id="mobile-task-inbox-unread-badge"/);
	assert.match(response.body, /\.mobile-topbar\s*\{[\s\S]*display:\s*none;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-topbar\s*\{[\s\S]*display:\s*grid;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.landing-side-right\s*\{[\s\S]*display:\s*contents;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.landing-side-right > \.telemetry-action\s*\{[\s\S]*display:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.shell\[data-home="true"\]\s*\{[\s\S]*height:\s*100dvh;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.shell\[data-home="true"\] \.landing-screen\s*\{[\s\S]*overflow-y:\s*auto;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.shell\[data-home="true"\] \.landing-screen\s*\{[\s\S]*-webkit-overflow-scrolling:\s*touch;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.shell\[data-home="true"\] \.landing-grid\s*\{[\s\S]*justify-content:\s*flex-start;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.landing-logo \.ugk-svg-logo-watermark\s*\{[\s\S]*opacity:\s*0\.88;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.landing-agent-cards\s*\{[\s\S]*max-width:\s*480px;/);
	assert.doesNotMatch(response.body, /\.landing-side-right > \.topbar-context-slot\s*\{[\s\S]*display:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.topbar\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-topbar\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto auto;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-topbar\s*\{[\s\S]*min-height:\s*48px;/);
	assert.match(response.body, /\.topbar-context-slot\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /\.mobile-topbar-button\s*\{[\s\S]*width:\s*36px;[\s\S]*border:\s*1px solid transparent;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /\.mobile-topbar-button:hover:not\(:disabled\),[\s\S]*\.mobile-topbar-button:focus-visible\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.topbar-context-slot \.context-usage-shell,[\s\S]*\.topbar-context-slot \.context-usage-shell\[data-expanded="true"\]\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /\.mobile-topbar-notification-badge\s*\{[\s\S]*min-width:\s*18px;[\s\S]*background:\s*#ff1744;/);
	assert.match(response.body, /\.mobile-overflow-menu-item-badge\s*\{[\s\S]*background:\s*#ff1744;/);
	assert.match(response.body, /\.telemetry-action-badge\s*\{[\s\S]*background:\s*#ff1744;/);
	assert.match(response.body, /\.mobile-overflow-menu-item\s*\{[\s\S]*grid-template-columns:\s*18px minmax\(0, 1fr\) auto;/);
	const mobileDrawerBackdropBlock = response.body.match(/\.mobile-drawer-backdrop\s*\{([\s\S]*?)\n\s*\}/);
	assert.ok(mobileDrawerBackdropBlock);
	assert.match(mobileDrawerBackdropBlock[1], /background:\s*transparent;/);
	assert.match(mobileDrawerBackdropBlock[1], /backdrop-filter:\s*none;/);
	assert.doesNotMatch(mobileDrawerBackdropBlock[1], /blur\(10px\)/);
	const mobileConversationListBlock = response.body.match(/\.mobile-conversation-list\s*\{([\s\S]*?)\n\s*\}/);
	assert.ok(mobileConversationListBlock);
	assert.match(mobileConversationListBlock[1], /scrollbar-width:\s*none;/);
	assert.match(mobileConversationListBlock[1], /-ms-overflow-style:\s*none;/);
	assert.match(response.body, /\.mobile-conversation-list::-webkit-scrollbar\s*\{[\s\S]*display:\s*none;/);
	const mobileConversationItemBlock = response.body.match(/\.mobile-conversation-item\s*\{([\s\S]*?)\n\s*\}/);
	assert.ok(mobileConversationItemBlock);
	assert.match(mobileConversationItemBlock[1], /border-radius:\s*4px;/);
	assert.doesNotMatch(mobileConversationItemBlock[1], /border-radius:\s*14px;/);
	assert.match(response.body, /mobileNewConversationButton\.addEventListener\("click", \(\) => \{/);
	assert.match(response.body, /mobileOverflowMenuButton\.addEventListener\("click", \(event\) => \{/);
	assert.match(response.body, /function setMobileOverflowMenuOpen\(next\)\s*\{/);
	assert.match(response.body, /function closeMobileOverflowMenu\(\)\s*\{/);
	assert.doesNotMatch(response.body, /mobileMenuSkillsButton\.addEventListener\("click", \(\) => \{/);
	assert.match(response.body, /mobileMenuFileButton\.addEventListener\("click", \(\) => \{/);
	assert.match(response.body, /mobileMenuLibraryButton\.addEventListener\("click", \(\) => \{/);
	assert.match(response.body, /mobileMenuTaskInboxButton\.addEventListener\("click", \(\) => \{/);
	assert.doesNotMatch(response.body, /class="mobile-action-strip"/);
	await app.close();
});

test("GET /playground does not ship visible shadow effects", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	const visibleBoxShadowValues = [...response.body.matchAll(/box-shadow\s*:\s*([\s\S]*?);/g)]
		.map((match) => match[1]?.trim() ?? "")
		.filter((value) => value !== "none" && !value.startsWith("inset "));
	assert.ok(
		visibleBoxShadowValues.every(
			(value) =>
				value.includes("rgba(101, 209, 255") ||
				value.includes("rgba(8, 120, 75") ||
				value.includes("rgba(0, 0, 0"),
		),
	);
	assert.doesNotMatch(response.body, /drop-shadow\s*\(/);
	const visibleTextShadowValues = [...response.body.matchAll(/text-shadow\s*:\s*([\s\S]*?);/g)]
		.map((match) => match[1]?.trim() ?? "")
		.filter((value) => value !== "none");
	assert.ok(
		visibleTextShadowValues.every(
			(value) =>
				value.includes("rgba(255, 80, 94") ||
				value.includes("rgba(86, 194, 255") ||
				value.includes("rgba(231, 55, 78") ||
				value.includes("rgba(31, 95, 200"),
		),
	);
	await app.close();
});

test("GET /playground supports persistent dark and light themes", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /<html lang="zh-CN" data-theme="dark">/);
	assert.match(response.body, /id="theme-toggle-button"/);
	assert.match(response.body, /id="theme-toggle-label"/);
	assert.match(response.body, /id="mobile-menu-theme-button"/);
	assert.match(response.body, /id="mobile-theme-toggle-label"/);
	assert.match(response.body, /:root\[data-theme="light"\]\s*\{/);
	assert.match(response.body, /--bg:\s*#e8edf6;/);
	assert.match(response.body, /--fg:\s*#142033;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+body\s*\{/);
	assert.match(response.body, /body::after\s*\{[\s\S]*linear-gradient\(180deg, rgba\(201, 210, 255, 0\.035\), transparent 180px\),[\s\S]*opacity:\s*0\.86;/);
	assert.match(response.body, /:root\[data-theme="light"\] body::before\s*\{[\s\S]*opacity:\s*0\.58;/);
	assert.match(response.body, /:root\[data-theme="light"\] body::after\s*\{[\s\S]*linear-gradient\(180deg, rgba\(31, 95, 200, 0\.045\), transparent 180px\),[\s\S]*opacity:\s*0\.88;/);
	assert.doesNotMatch(response.body, /rgba\(221, 229, 240, 0\.36\) 0%, transparent 12%, transparent 88%, rgba\(221, 229, 240, 0\.32\) 100%/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.shell\[data-stage-mode="landing"\] \.composer\s*\{[\s\S]*border-color:\s*transparent;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+#composer-drop-target\.composer\s*\{[\s\S]*border-color:\s*rgba\(31, 95, 200, 0\.10\);[\s\S]*background:\s*var\(--chat-composer-bg\);[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.file-strip\s*\{[\s\S]*border-color:\s*transparent;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+#message\s*\{[\s\S]*background:\s*rgba\(255, 255, 255, 0\.92\);[\s\S]*color:\s*#172033;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.telemetry-card,[\s\S]*:root\[data-theme="light"\]\s+\.drop-zone-top\s*\{[\s\S]*border-color:\s*transparent;[\s\S]*background:\s*transparent;[\s\S]*color:\s*var\(--fg\);[\s\S]*box-shadow:\s*none;/);
	assert.doesNotMatch(response.body, /:root\[data-theme="light"\]\s+\.telemetry-card,[^}]*background:\s*rgba\(255, 255, 255, 0\.86\);/);
	assert.doesNotMatch(response.body, /:root\[data-theme="light"\]\s+\.shell\[data-stage-mode="landing"\] \.composer\s*\{[^}]*rgba\(255, 255, 255, 0\.92\);/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.message-body/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.message\.assistant \.message-content strong/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+#send-button::before/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+#interrupt-button:disabled::before/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.asset-modal/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+:is\(\.file-download\)/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.asset-date-group-header strong/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.asset-pill-type\s*\{[\s\S]*--asset-type-bg:\s*#f4f7fb;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.asset-pill-type--archive\s*\{[\s\S]*--asset-type-bg:\s*#edf8f0;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.asset-pill-type--code\s*\{[\s\S]*--asset-type-bg:\s*#eef5ff;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.asset-pill-download-button\s*\{[\s\S]*color:\s*#147647;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.chat-stage > \.workspace-contained \.asset-pill-type/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.chat-stage > \.workspace-contained \.asset-pill-download-button/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.chat-stage > \.workspace-contained \.asset-pill-meta\s*\{[\s\S]*color:\s*#5b6b84;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.conn-manager-panel/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.conn-manager-status\.completed/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+:is\(\.conn-manager-toolbar, \.conn-editor-field, \.conn-editor-advanced\)\s*\{[\s\S]*border-color:\s*#dfe7f2;[\s\S]*background:\s*#f8fbff;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.conn-editor-field span,[\s\S]*:root\[data-theme="light"\]\s+\.conn-editor-advanced summary\s*\{[\s\S]*color:\s*#24324a;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.conn-editor-time-input \+ \.flatpickr-input\s*\{[\s\S]*background:\s*#ffffff;[\s\S]*color:\s*#172033;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.conn-editor-field input:focus,[\s\S]*:root\[data-theme="light"\]\s+\.conn-editor-field textarea:focus\s*\{[\s\S]*outline:\s*1px solid rgba\(31, 95, 200, 0\.38\);[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.conn-editor-target-preview\s*\{[\s\S]*background:\s*rgba\(232, 240, 255, 0\.72\);/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.asset-modal-copy span\s*\{[\s\S]*color:\s*#667085;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.task-inbox-list\s*\{[\s\S]*padding:\s*12px 14px 16px;[\s\S]*background:\s*#f1f5fa;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.task-inbox-item-shell\s*\{[\s\S]*border:\s*1px solid #dfe7f2;[\s\S]*background:\s*#ffffff;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.conn-manager-panel > \.asset-modal-body\s*\{[\s\S]*background:\s*#f1f5fa;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.conn-manager-list\s*\{[\s\S]*padding:\s*12px 14px 16px;[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+:is\(\.conn-manager-item\)\s*\{[\s\S]*border-color:\s*#dfe7f2;[\s\S]*background:\s*#ffffff;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+:is\(\.conn-manager-run-item\)\s*\{[\s\S]*border-color:\s*#e2e8f0;[\s\S]*background:\s*#f8fbff;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.conn-editor-form\s*\{[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.agent-manager-panel > \.asset-modal-body,[\s\S]*:root\[data-theme="light"\]\s+\.agent-rules-editor-panel > \.asset-modal-body\s*\{[\s\S]*background:\s*#f1f5fa;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.agent-manager-list\s*\{[\s\S]*background:\s*#f1f5fa;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.agent-manager-list-button,[\s\S]*:root\[data-theme="light"\]\s+\.agent-manager-skill-item\s*\{[\s\S]*border-color:\s*#dfe7f2;[\s\S]*background:\s*#ffffff;[\s\S]*color:\s*#24324a;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.agent-manager-status\s*\{[\s\S]*background:\s*#eef3fb;[\s\S]*color:\s*#40516d;/);

	// Agent skill toggle UI
	assert.match(response.body, /updateAgentSkillEnabled/);
	assert.match(response.body, /role.*switch/);
	assert.match(response.body, /aria-checked/);
	assert.match(response.body, /agent-manager-skill-toggle/);
	assert.match(response.body, /is-disabled/);
	assert.match(response.body, /agent-manager-skill-required/);
	assert.doesNotMatch(response.body, /:root\[data-theme="light"\]\s+:is\(\.asset-pill\),[\s\S]*:root\[data-theme="light"\]\s+:is\(\.conn-editor-field\)[\s\S]*background:\s*#eef3fa;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.task-inbox-view/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.task-inbox-pane/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.task-inbox-item-title-row strong/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.context-usage-dialog\s*\{[\s\S]*background:\s*rgba\(232, 238, 248, 0\.72\);/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.context-usage-dialog-meter span\s*\{[\s\S]*background:\s*linear-gradient\(90deg, #08784b, #1f5fc8\);/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.context-usage-dialog-model span\s*\{[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.context-usage-meta\s*\{[\s\S]*#ffffff;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.context-usage-meta-main strong,[\s\S]*:root\[data-theme="light"\]\s+\.context-usage-meta-item strong\s*\{[\s\S]*color:\s*#142033;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.context-usage-meta-status\s*\{[\s\S]*background:\s*#e7f6ef;[\s\S]*color:\s*#08784b;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.conn-time-picker-calendar \.flatpickr-month,[\s\S]*:root\[data-theme="light"\]\s+\.conn-time-picker-calendar \.flatpickr-day,[\s\S]*:root\[data-theme="light"\]\s+\.conn-time-picker-calendar \.numInput\s*\{[\s\S]*color:\s*#172033;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.conn-time-picker-calendar \.flatpickr-day\.flatpickr-disabled,[\s\S]*:root\[data-theme="light"\]\s+\.conn-time-picker-calendar \.flatpickr-day\.nextMonthDay\s*\{[\s\S]*color:\s*#9aa6b8;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.conn-time-picker-calendar \.flatpickr-day\.selected,[\s\S]*:root\[data-theme="light"\]\s+\.conn-time-picker-calendar \.flatpickr-day\.endRange\s*\{[\s\S]*background:\s*#1f5fc8;[\s\S]*color:\s*#ffffff;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.context-usage-dialog-hero/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.mobile-brand\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.mobile-drawer-head\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*:root\[data-theme="light"\]\s+\.topbar,[\s\S]*:root\[data-theme="light"\]\s+\.topbar-context-slot\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*:root\[data-theme="light"\]\s+\.mobile-topbar-button,[\s\S]*:root\[data-theme="light"\]\s+\.mobile-topbar-button:focus-visible\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*:root\[data-theme="light"\]\s+\.topbar-context-slot \.context-usage-shell,[\s\S]*:root\[data-theme="light"\]\s+\.topbar-context-slot \.context-usage-shell\[data-expanded="true"\]\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /const PLAYGROUND_THEME_STORAGE_KEY = "ugk-pi:playground-theme";/);
	assert.match(response.body, /function applyPlaygroundTheme\(nextTheme\)\s*\{/);
	assert.match(response.body, /pageRoot\.dataset\.theme = normalized;/);
	assert.match(response.body, /localStorage\.setItem\(PLAYGROUND_THEME_STORAGE_KEY, normalized\)/);
	assert.match(response.body, /themeToggleButton\.addEventListener\("click"/);
	assert.match(response.body, /mobileMenuThemeButton\.addEventListener\("click"/);
	assert.match(response.body, /theme-toggle-icon-sun/);
	assert.match(response.body, /theme-toggle-icon-moon/);
	await app.close();
});

test("GET /playground uses touch-first mobile panels for library, tasks, conn, and history", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	const mobileCssBlock = (selector: string) => {
		const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const matches = Array.from(response.body.matchAll(new RegExp(escapedSelector + "\\s*\\{([\\s\\S]*?)\\n\\s*\\}", "g")));
		assert.ok(matches.length > 0, `missing css block for ${selector}`);
		return matches[matches.length - 1][1];
	};

	const mobileAssetAndConnCardBlock = mobileCssBlock(".asset-pill,\n\t\t\t.conn-manager-item");
	const mobileConnToolbarBlock = mobileCssBlock(".conn-manager-toolbar");
	const mobileConnEditorFieldBlock = mobileCssBlock(".conn-editor-field");
	const mobileConnEditorAdvancedBlock = mobileCssBlock(".conn-editor-advanced");
	const mobileConnRunItemBlock = mobileCssBlock(".conn-manager-run-item");
	const mobileConnRunPanelBlock = mobileCssBlock(".conn-run-details-panel");
	const mobileTaskBubbleBlock = mobileCssBlock(".task-inbox-result-bubble");
	const mobileStreamLayoutBlock = mobileCssBlock(
		'.shell[data-stage-mode="landing"][data-transcript-state="active"] .stream-layout',
	);
	const mobileTranscriptPaneBlock = mobileCssBlock('.shell[data-stage-mode="landing"] .transcript-pane');
	const mobileTranscriptBlock = mobileCssBlock(".transcript");

	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.asset-modal-shell\.open\s*\{[\s\S]*align-items:\s*stretch;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.asset-modal-shell\.open\s*\{[\s\S]*background:\s*#01030a;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.task-inbox-view\.open\s*\{[\s\S]*align-items:\s*stretch;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.task-inbox-view\.open\s*\{[\s\S]*background:\s*#01030a;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.asset-modal\s*\{[\s\S]*height:\s*100dvh;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.asset-modal\s*\{[\s\S]*border-radius:\s*0;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.task-inbox-pane\s*\{[\s\S]*height:\s*100dvh;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.task-inbox-pane\s*\{[\s\S]*border-radius:\s*0;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.asset-modal::before\s*\{[\s\S]*display:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.asset-modal-head\s*\{[\s\S]*position:\s*sticky;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.asset-modal-head\s*\{[\s\S]*border-bottom:\s*0;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.asset-modal-head\s*\{[\s\S]*background:\s*#101421;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.asset-modal-head\s*\{[\s\S]*flex-direction:\s*row;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.asset-modal-actions\s*\{[\s\S]*display:\s*flex;[\s\S]*overflow-x:\s*auto;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.asset-modal-actions button\s*\{[\s\S]*border-radius:\s*4px;/);
	assert.match(mobileAssetAndConnCardBlock, /border:\s*0;/);
	assert.match(mobileAssetAndConnCardBlock, /background:\s*#0b0e19;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-work-topbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-work-title-row\s*\{[\s\S]*grid-template-columns:\s*36px minmax\(0, 1fr\);/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-work-back-button\s*\{[\s\S]*width:\s*36px;[\s\S]*height:\s*36px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-work-topbar \.asset-modal-actions,[\s\S]*\.mobile-work-topbar \.task-inbox-head-actions\s*\{[\s\S]*overflow-x:\s*auto;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.conn-manager-dialog\.open,[\s\S]*\.conn-editor-dialog\.open\s*\{[\s\S]*align-items:\s*stretch;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.conn-manager-panel,[\s\S]*\.conn-editor-panel\s*\{[\s\S]*height:\s*100dvh;/);
	assert.match(mobileTaskBubbleBlock, /border:\s*0;/);
	assert.match(mobileTaskBubbleBlock, /background:\s*#0b0e19;/);
	assert.match(mobileTaskBubbleBlock, /border-radius:\s*4px;/);
	assert.match(mobileConnToolbarBlock, /grid-template-columns:\s*1fr;/);
	assert.match(mobileConnToolbarBlock, /border:\s*0;/);
	assert.match(mobileConnToolbarBlock, /background:\s*#0b0e19;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.conn-manager-filter-field select\s*\{[\s\S]*border-radius:\s*4px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.conn-manager-actions\s*\{[\s\S]*display:\s*grid;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.task-inbox-item-actions\s*\{[\s\S]*display:\s*grid;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.conn-manager-actions button,[\s\S]*\.conn-manager-run-actions button\s*\{[\s\S]*border-radius:\s*4px;/);
	assert.match(mobileConnEditorFieldBlock, /border:\s*0;/);
	assert.match(mobileConnEditorFieldBlock, /background:\s*#0b0e19;/);
	assert.match(mobileConnEditorAdvancedBlock, /border:\s*0;/);
	assert.match(mobileConnEditorAdvancedBlock, /background:\s*#0b0e19;/);
	assert.match(mobileConnRunItemBlock, /border:\s*0;/);
	assert.match(mobileConnRunItemBlock, /border-radius:\s*4px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.conn-run-details-dialog\.open\s*\{[\s\S]*align-items:\s*flex-end;/);
	assert.match(mobileConnRunPanelBlock, /border:\s*0;/);
	assert.match(mobileConnRunPanelBlock, /border-radius:\s*4px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.task-inbox-head\s*\{[\s\S]*position:\s*sticky;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.task-inbox-head\s*\{[\s\S]*border-bottom:\s*0;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.task-inbox-head\s*\{[\s\S]*background:\s*#101421;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.task-inbox-head-actions\s*\{[\s\S]*display:\s*flex;[\s\S]*overflow-x:\s*auto;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.task-inbox-item-time\s*\{[\s\S]*grid-column:\s*2;[\s\S]*justify-self:\s*start;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.context-usage-dialog-panel\s*\{[\s\S]*border:\s*0;[\s\S]*border-radius:\s*8px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.context-usage-dialog-head\s*\{[\s\S]*border-bottom:\s*0;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.context-usage-dialog-body\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-drawer-backdrop\s*\{[\s\S]*background:\s*rgba\(1, 3, 10, 0\.42\);/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-drawer\s*\{[\s\S]*width:\s*min\(88vw, 360px\);/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-drawer\s*\{[\s\S]*border-right:\s*0;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-drawer\s*\{[\s\S]*background:[\s\S]*#060711;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-drawer-head\s*\{[\s\S]*position:\s*sticky;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-drawer-head\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) 40px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-drawer-head\s*\{[\s\S]*border-bottom:\s*0;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-drawer-head\s*\{[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-drawer-head\s*\{[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-drawer-title span\s*\{[\s\S]*max-width:\s*22ch;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-drawer-close\s*\{[\s\S]*border:\s*0;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-drawer-close\s*\{[\s\S]*border-radius:\s*6px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-empty\s*\{[\s\S]*border:\s*0;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-empty\s*\{[\s\S]*background:\s*#0b0e19;/);
	assert.doesNotMatch(response.body, /shell\.appendChild\(deleteButton\);/);
	assert.match(response.body, /button\.appendChild\(menuButton\);/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.conversation-item-shell\s*\{[\s\S]*display:\s*block;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.conversation-item-menu-trigger\s*\{[\s\S]*position:\s*absolute;[\s\S]*top:\s*8px;[\s\S]*right:\s*8px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.conversation-item-menu-trigger\s*\{[\s\S]*width:\s*24px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.conversation-item-menu-trigger\s*\{[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /\.conversation-item-menu\s*\{[\s\S]*position:\s*absolute;[\s\S]*width:\s*168px;/);
	assert.match(response.body, /CONVERSATION_BACKGROUND_OPTIONS = \[[\s\S]*value: "mint"/);
	assert.match(response.body, /CONVERSATION_BACKGROUND_OPTIONS = \[[\s\S]*value: "gray"/);
	assert.doesNotMatch(response.body, /value: "slate"/);
	assert.doesNotMatch(response.body, /value: "blue"/);
	assert.doesNotMatch(response.body, /value: "teal"/);
	assert.doesNotMatch(response.body, /value: "yellow"/);
	assert.doesNotMatch(response.body, /value: "purple"/);
	assert.match(response.body, /\.conversation-item-shell\.conversation-bg-sky\s*\{[\s\S]*--conversation-card-bg:\s*#dbeafe;/);
	assert.match(response.body, /\.conversation-item-shell\[class\*="conversation-bg-"\] \.mobile-conversation-title\s*\{[\s\S]*color:\s*#172033;/);
	assert.match(response.body, /\.conversation-item-shell\[class\*="conversation-bg-"\] \.mobile-conversation-meta span\s*\{[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /\.conversation-item-menu-trigger:hover,[\s\S]*\.conversation-item-menu-trigger:focus-visible,[\s\S]*\.conversation-item-menu-trigger\[aria-expanded="true"\]\s*\{[\s\S]*background:\s*transparent !important;/);
	assert.match(response.body, /\.conversation-item-shell\.is-pinned \.mobile-conversation-item::after\s*\{[\s\S]*background:\s*#ff304f;/);
	assert.match(response.body, /\.conversation-color-swatch\.color-default\s*\{[\s\S]*background:\s*#111722 !important;/);
	assert.doesNotMatch(response.body, /background:\s*linear-gradient\(135deg, #f4f7fb 0 50%, #111722 50% 100%\) !important;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.conversation-color-swatch\.color-default\s*\{[\s\S]*background:\s*#f4f7fb !important;/);
	assert.match(response.body, /\.conversation-color-swatch\.color-sky\s*\{[\s\S]*background:\s*#dbeafe !important;/);
	assert.match(response.body, /\.desktop-conversation-list \.mobile-conversation-item\s*\{[\s\S]*height:\s*58px;[\s\S]*background:\s*transparent;[\s\S]*opacity:\s*0\.74;/);
	assert.doesNotMatch(response.body, /mobile-conversation-preview/);
	assert.doesNotMatch(response.body, /metaCount/);
	assert.match(response.body, /\.desktop-conversation-list \.conversation-item-menu-trigger\s*\{[\s\S]*opacity:\s*0;/);
	assert.match(response.body, /\.desktop-conversation-list \.conversation-item-shell\[class\*="conversation-bg-"\] \.mobile-conversation-item\s*\{[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-item\s*\{[\s\S]*min-height:\s*72px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-item\s*\{[\s\S]*padding:\s*12px 46px 12px 14px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-item\s*\{[\s\S]*border:\s*0;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-item\s*\{[\s\S]*border-radius:\s*8px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-item\s*\{[\s\S]*background:\s*#0b0e19;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-item\s*\{[\s\S]*grid-template-rows:\s*auto auto;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-item\s*\{[\s\S]*line-height:\s*normal;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-item\.is-active\s*\{[\s\S]*background:\s*var\(--conversation-card-active-bg, #151a2b\);/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-item:disabled\s*\{[\s\S]*opacity:\s*1;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-item\.is-active::before\s*\{/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-title\s*\{[\s\S]*line-height:\s*1\.35;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-meta\s*\{[\s\S]*line-height:\s*1\.4;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-meta span\s*\{[\s\S]*min-height:\s*20px;/);
	assert.match(response.body, /menuButton\.textContent = "⋯";/);
	assert.match(response.body, /<span>运行中不能切换<\/span>/);
	assert.match(mobileStreamLayoutBlock, /position:\s*relative;/);
	assert.match(mobileStreamLayoutBlock, /inset:\s*auto;/);
	assert.match(mobileStreamLayoutBlock, /width:\s*100%;/);
	assert.match(mobileStreamLayoutBlock, /min-width:\s*0;/);
	assert.match(mobileStreamLayoutBlock, /max-width:\s*100%;/);
	assert.match(mobileTranscriptPaneBlock, /width:\s*100%;/);
	assert.match(mobileTranscriptPaneBlock, /min-width:\s*0;/);
	assert.match(mobileTranscriptPaneBlock, /max-width:\s*100%;/);
	assert.match(mobileTranscriptBlock, /width:\s*100%;/);
	assert.match(mobileTranscriptBlock, /min-width:\s*0;/);
	assert.match(mobileTranscriptBlock, /max-width:\s*100%;/);
	assert.match(response.body, /function restoreFocusAfterPanelClose\(panelElement, fallbackElement\)\s*\{/);
	assert.match(response.body, /function closeAssetLibrary\(\)\s*\{[\s\S]*restoreFocusAfterPanelClose\(assetModal, state\.assetModalRestoreFocusElement\);/);
	assert.match(response.body, /function closeConnManager\(\)\s*\{[\s\S]*restoreFocusAfterPanelClose\(connManagerDialog, state\.connManagerRestoreFocusElement\);/);
	assert.match(response.body, /mobileMenuLibraryButton\.addEventListener\("click", \(\) => \{[\s\S]*openAssetLibrary\(mobileOverflowMenuButton\);/);
	await app.close();
});

test("GET /playground lets conn editor choose a model without hand-written ids", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /conn-editor-profile-id/);
	assert.match(response.body, /执行 Agent/);
	assert.match(response.body, /后台任务借用这个 Agent 的规则和技能，不写入它的聊天历史。/);
	assert.match(response.body, /conn-editor-model-provider/);
	assert.match(response.body, /conn-editor-model-id/);
	assert.doesNotMatch(response.body, /id="conn-editor-model-provider"[^>]*<input/);
	assert.doesNotMatch(response.body, /id="conn-editor-model-id"[^>]*<input/);
	await app.close();
});

test("GET /playground keeps code blocks compact inside the mobile layout only", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /\.transcript-pane,[\s\S]*\.history-auto-load-status\s*\{[\s\S]*border-radius: 4px !important;/);
	assert.match(response.body, /\.transcript-pane\s*\{[\s\S]*border: 0;/);
	assert.match(response.body, /\.transcript-pane\s*\{[\s\S]*background: transparent;/);
	assert.match(response.body, /\.transcript-pane\s*\{[\s\S]*box-shadow: none;/);
	assert.match(response.body, /\.message-content \.code-block-toolbar\s*\{[\s\S]*position: absolute;/);
	assert.match(response.body, /\.message-content \.code-block-language\s*\{\s*display: none;/);
	assert.match(response.body, /\.message-content \.copy-code-button\s*\{[\s\S]*display: inline-flex;/);
	assert.match(response.body, /\.message-content \.copy-code-button\s*\{[\s\S]*background: transparent;/);
	assert.match(response.body, /\.message-content \.copy-code-button\s*\{[\s\S]*border-radius: 0;/);
	assert.match(response.body, /\.message-content \.copy-code-button\s*\{[\s\S]*font-size: 0;/);
	assert.match(response.body, /\.message-content \.copy-code-button\s*\{[\s\S]*text-indent: -9999px;/);
	assert.match(response.body, /\.message-content \.copy-code-button::before\s*\{[\s\S]*content: "";/);
	assert.match(response.body, /\.message-content \.copy-code-button::before\s*\{[\s\S]*background-image: url\("data:image\/svg\+xml,/);
	assert.match(response.body, /\.message-content \.code-block\s*\{[\s\S]*background: transparent;/);
	assert.match(response.body, /\.message-content pre code\s*\{[\s\S]*white-space: pre-wrap;/);
	assert.match(response.body, /\.message-content pre code\s*\{[\s\S]*overflow-wrap: anywhere;/);
	assert.match(response.body, /\.message-content \.code-block pre\s*\{[\s\S]*padding: 14px 12px 10px;/);
	assert.match(response.body, /\.message-content \.code-block pre\s*\{[\s\S]*border-radius: 12px;/);
	assert.match(response.body, /\.message-content \.code-block pre\s*\{[\s\S]*border: 1px solid rgba\(255, 255, 255, 0\);/);
	assert.match(response.body, /\.message-content \.code-block pre\s*\{[\s\S]*background: transparent;/);
	assert.match(response.body, /\.message\.assistant \.message-content pre,\s*\.message\.assistant \.message-content \.code-block,\s*\.message\.assistant \.message-content \.code-block pre\s*\{[\s\S]*background: transparent;/);
	assert.match(response.body, /\.message\.assistant \.message-content code\s*\{[\s\S]*background: transparent;/);
	await app.close();
});

test("GET /playground uses icon-only mobile send and interrupt controls", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /#send-button,\s*#interrupt-button\s*\{[\s\S]*display: inline-flex;/);
	assert.match(response.body, /#send-button,\s*#interrupt-button\s*\{[\s\S]*background: transparent;/);
	assert.match(response.body, /#send-button,\s*#interrupt-button\s*\{[\s\S]*box-shadow: none;/);
	assert.match(response.body, /#send-button,\s*#interrupt-button\s*\{[\s\S]*text-indent: -9999px;/);
	assert.match(response.body, /#send-button::before\s*\{[\s\S]*width: 28px;/);
	assert.match(response.body, /#interrupt-button::before\s*\{[\s\S]*width: 28px;/);
	assert.match(response.body, /#send-button::before\s*\{[\s\S]*background-image: url\("data:image\/svg\+xml,/);
	assert.match(response.body, /#interrupt-button::before\s*\{[\s\S]*background-image: url\("data:image\/svg\+xml,/);
	assert.match(response.body, /#interrupt-button:disabled\s*\{[\s\S]*display: inline-flex;/);
	assert.match(response.body, /#interrupt-button:disabled\s*\{[\s\S]*opacity: 0\.38;/);
	await app.close();
});

test("GET /playground keeps the mobile active composer compact", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	const mobileComposerBlock = [...response.body.matchAll(/\n\s*\.composer\s*\{([\s\S]*?)\n\s*\}/g)].find((match) =>
		match[1].includes("background: rgba(8, 10, 19, 0.98);"),
	);
	const mobileLandingComposerBlock = [
		...response.body.matchAll(/\.shell\[data-stage-mode="landing"\] \.composer\s*\{([\s\S]*?)\n\s*\}/g),
	].find((match) => match[1].includes("background: rgba(8, 10, 19, 0.98);"));
	assert.ok(mobileComposerBlock);
	assert.ok(mobileLandingComposerBlock);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\n\s*\.composer\s*\{[\s\S]*padding:\s*8px 8px 8px 10px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\n\s*\.composer\s*\{[\s\S]*background:\s*rgba\(8, 10, 19, 0\.98\);/);
	assert.doesNotMatch(mobileComposerBlock[1], /linear-gradient/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\n\s*\.composer-main\s*\{[\s\S]*gap:\s*4px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\n\s*\.composer-header\s*\{[\s\S]*display:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\n\s*\.composer textarea\s*\{[\s\S]*min-height:\s*44px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\n\s*\.composer textarea\s*\{[\s\S]*max-height:\s*calc\(var\(--composer-line-height\) \* var\(--composer-textarea-max-lines\) \+ 24px\);/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\n\s*\.composer textarea\s*\{[\s\S]*padding:\s*12px 0;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\n\s*\.composer textarea\s*\{[\s\S]*resize:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.shell\[data-stage-mode="landing"\] \.composer\s*\{[\s\S]*height:\s*fit-content;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.shell\[data-stage-mode="landing"\] \.composer\s*\{[\s\S]*background:\s*rgba\(8, 10, 19, 0\.98\);/);
	assert.doesNotMatch(mobileLandingComposerBlock[1], /linear-gradient/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.shell\[data-stage-mode="landing"\] \.composer textarea\s*\{[\s\S]*max-height:\s*calc\(var\(--composer-line-height\) \* var\(--composer-textarea-max-lines\) \+ 20px\);/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.shell\[data-stage-mode="landing"\] \.composer textarea\s*\{[\s\S]*padding:\s*10px 0;/);
	await app.close();
});

test("GET /playground keeps the default active composer compact before mobile overrides", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /\.composer\s*\{[\s\S]*padding:\s*10px 10px 10px 12px;/);
	assert.match(response.body, /\.composer-main\s*\{[\s\S]*gap:\s*8px;/);
	assert.match(response.body, /\.composer textarea\s*\{[\s\S]*min-height:\s*52px;/);
	assert.match(response.body, /\.composer textarea\s*\{[\s\S]*--composer-textarea-max-lines:\s*10;/);
	assert.match(response.body, /\.composer textarea\s*\{[\s\S]*max-height:\s*calc\(var\(--composer-line-height\) \* var\(--composer-textarea-max-lines\) \+ 30px\);/);
	assert.match(response.body, /\.composer textarea\s*\{[\s\S]*padding-top:\s*14px;/);
	assert.match(response.body, /\.composer textarea\s*\{[\s\S]*padding-bottom:\s*14px;/);
	assert.match(response.body, /\.composer textarea\s*\{[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /\.composer textarea\s*\{[\s\S]*resize:\s*none;/);
	assert.match(response.body, /\.composer textarea\s*\{[\s\S]*overflow-y:\s*auto;/);
	assert.match(response.body, /@media \(max-width: 960px\) \{[\s\S]*\.composer-side\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
	await app.close();
});

test("GET /playground uses a desktop geek cockpit layout", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /\.shell\s*\{[\s\S]*grid-template-columns:\s*260px minmax\(0, 1fr\);/);
	assert.match(response.body, /\.shell\s*\{[\s\S]*grid-template-rows:\s*64px minmax\(0, 1fr\);/);
	assert.match(response.body, /\.shell\s*\{[\s\S]*column-gap:\s*16px;/);
	assert.match(response.body, /\.topbar\s*\{[\s\S]*z-index:\s*80;/);
	assert.match(response.body, /\.topbar\s*\{[\s\S]*grid-column:\s*2;[\s\S]*grid-row:\s*1;/);
	assert.match(response.body, /\.topbar\s*\{[\s\S]*padding:\s*0 0 10px 0;/);
	assert.match(response.body, /\.topbar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/);
	assert.match(response.body, /class="desktop-brand" aria-label="UGK CLAW"/);
	assert.match(response.body, /class="ugk-ascii-logo ugk-ascii-logo-topbar"/);
	assert.doesNotMatch(response.body, /\.topbar::before\s*\{[\s\S]*content:\s*"UGK CLAW";/);
	assert.doesNotMatch(response.body, /\.topbar::before\s*\{[\s\S]*background-image:\s*url\("\/ugk-claw-mobile-logo\.png"\);/);
	assert.match(response.body, /class="chat-stage-watermark" aria-hidden="true"/);
	assert.match(response.body, /class="ugk-svg-logo ugk-svg-logo-dark ugk-svg-logo-watermark" src="\/ugk-claw-logo\.svg"/);
	assert.match(response.body, /class="ugk-svg-logo ugk-svg-logo-light ugk-svg-logo-watermark" src="\/ugk-claw-logo-light\.svg"/);
	assert.match(response.body, /class="ugk-ascii-logo ugk-ascii-logo-watermark"/);
	assert.match(response.body, /\.ugk-ascii-logo\s*\{[\s\S]*font-family:\s*"Courier New", Consolas, "Cascadia Mono", monospace;/);
	assert.match(response.body, /\.chat-stage-watermark\s*\{[\s\S]*width:\s*clamp\(150px, 18vw, 280px\);[\s\S]*opacity:\s*0\.12;/);
	assert.match(response.body, /\.chat-stage-watermark \.ugk-svg-logo-watermark\s*\{[\s\S]*display:\s*block;[\s\S]*width:\s*100%;[\s\S]*opacity:\s*1;/);
	assert.match(response.body, /\.chat-stage-watermark \.ugk-ascii-logo-watermark\s*\{[\s\S]*display:\s*none;/);
	assert.doesNotMatch(response.body, /\.chat-stage-watermark\s*\{[^}]*width:\s*max-content;/);
	assert.match(response.body, /\.chat-stage > :not\(\.chat-stage-watermark\)\s*\{[\s\S]*z-index:\s*1;/);
	assert.match(response.body, /\.landing-side-right\s*\{[\s\S]*justify-self:\s*end;/);
	assert.match(response.body, /\.landing-side-right\s*\{[\s\S]*position:\s*static;/);
	assert.match(response.body, /\.landing-side-right\s*\{[\s\S]*width:\s*auto;/);
	assert.match(response.body, /\.landing-side-right\s*\{[\s\S]*background:\s*#080c14;/);
	assert.doesNotMatch(response.body, /\.landing-side-right\s*\{[\s\S]*linear-gradient\(180deg, rgba\(12, 17, 28, 0\.92\)/);
	assert.match(response.body, /\.desktop-conversation-rail\s*\{[\s\S]*background:[\s\S]*#080c14;/);
	assert.match(response.body, /\.desktop-rail-settings\s*\{[\s\S]*border-top:\s*1px solid rgba\(201, 210, 255, 0\.08\);/);
	assert.doesNotMatch(response.body, /\.desktop-conversation-rail\s*\{[\s\S]*border-left:\s*2px solid rgba\(101, 209, 255, 0\.48\);/);
	assert.match(response.body, /\.desktop-conversation-list\s*\{[\s\S]*scrollbar-width:\s*none;/);
	assert.match(response.body, /\.desktop-conversation-list::-webkit-scrollbar\s*\{[\s\S]*display:\s*none;/);
	assert.match(response.body, /\.chat-stage\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*4px;[^}]*background:\s*transparent;[^}]*overflow:\s*hidden;/);
	assert.doesNotMatch(response.body, /\.chat-stage\s*\{[^}]*border:\s*1px solid rgba\(201, 210, 255, 0\.08\);/);
	assert.doesNotMatch(response.body, /\.chat-stage\s*\{[^}]*linear-gradient\(180deg, rgba\(11, 15, 25, 0\.72\), rgba\(5, 8, 15, 0\.86\)\)/);
	assert.match(response.body, /\.command-deck\s*\{[\s\S]*width:\s*100%;[\s\S]*border-radius:\s*4px;[\s\S]*overflow:\s*hidden;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.command-deck\s*\{[\s\S]*width:\s*100%;[\s\S]*border-radius:\s*4px;[\s\S]*overflow:\s*hidden;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.topbar::before\s*\{[\s\S]*display:\s*none;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.desktop-conversation-rail\s*\{[\s\S]*background:[\s\S]*#ffffff;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.chat-stage\s*\{[\s\S]*border-color:\s*transparent;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.chat-stage-watermark\s*\{[\s\S]*opacity:\s*0\.08;/);
	assert.doesNotMatch(response.body, /:root\[data-theme="light"\]\s+\.chat-stage\s*\{[\s\S]*rgba\(255, 255, 255, 0\.78\);/);
	await app.close();
});

test("GET /playground highlights the composer shell instead of the textarea on focus", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /\.composer:focus-within\s*\{[\s\S]*border-color:\s*var\(--chat-focus-ring\);[\s\S]*background:\s*var\(--chat-composer-focus-bg\);[\s\S]*box-shadow:\s*none;/);
	const composerFieldFocusBlock = response.body.match(
		/\.composer textarea:focus,\s*\n\s*\.composer input:focus,\s*\n\s*\.composer select:focus\s*\{([\s\S]*?)\n\s*\}/,
	);
	assert.ok(composerFieldFocusBlock);
	assert.match(composerFieldFocusBlock[1], /outline:\s*none;/);
	assert.doesNotMatch(composerFieldFocusBlock[1], /outline:\s*1px solid var\(--accent\);/);
	assert.doesNotMatch(composerFieldFocusBlock[1], /border-color:\s*var\(--accent\);/);
	assert.match(response.body, /\.composer textarea:focus\s*\{[\s\S]*background:\s*transparent;/);
	await app.close();
});

test("GET /playground uses the deeper cosmic palette instead of bright blue neon", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /--bg:\s*#01030a;/);
	assert.match(response.body, /--bg-panel:\s*#060711;/);
	assert.match(response.body, /--accent:\s*#c9d2ff;/);
	assert.match(response.body, /linear-gradient\(180deg, #02050b 0%, #040812 46%, #060a11 100%\)/);
	assert.match(response.body, /body::before\s*\{[\s\S]*opacity:\s*0\.56;[\s\S]*background-size:\s*40px 40px, 40px 40px, 160px 160px, 160px 160px;/);
	assert.match(response.body, /\.shell:not\(\[data-home="true"\]\)\s*\{[\s\S]*background-image:\s*none;/);
	assert.match(response.body, /background-size:\s*auto;/);
	assert.doesNotMatch(response.body, /radial-gradient\(circle at 1px 1px/);
	assert.doesNotMatch(response.body, /ugk-chat-bg-drift/);
	assert.doesNotMatch(response.body, /backdrop-filter:\s*blur/);
	assert.doesNotMatch(response.body, /--accent:\s*#5fd1ff;/);
	assert.doesNotMatch(response.body, /radial-gradient\(circle at 18% 16%, rgba\(123, 178, 255, 0\.14\), transparent 0 18%\)/);
	await app.close();
});

test("GET /playground shows an explicit assistant loading bubble while a run is in flight", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /assistant-status-shell/);
	assert.match(response.body, /assistant-loading-dots/);
	assert.match(response.body, /function ensureAssistantStatusShell\(\)\s*\{/);
	assert.match(response.body, /function setAssistantLoadingState\(text, kind\)\s*\{/);
	assert.match(response.body, /function completeAssistantLoadingBubble\(kind, text\)\s*\{/);
	assert.match(response.body, /created:\s*true/);
	assert.match(response.body, /scrollTranscriptToBottom\(\{ force: stream\.created === true \}\);/);
	assert.match(response.body, /case "run_started":[\s\S]*ensureStreamingAssistantMessage\(\);[\s\S]*setAssistantLoadingState\(/);
	assert.match(response.body, /case "text_delta":[\s\S]*setAssistantLoadingState\([^\)]*, "system"\)/);
	assert.match(response.body, /case "heartbeat":[\s\S]*setAssistantLoadingState\("正在推理", "system"\)/);
	assert.match(response.body, /case "done":[\s\S]*completeAssistantLoadingBubble\("ok"/);
	assert.match(response.body, /typeof event\.text === "string" && event\.text !== state\.streamingText/);
	assert.doesNotMatch(response.body, /event\.text && event\.text !== state\.streamingText/);
	assert.match(response.body, /function setLoading\(next\)\s*\{[\s\S]*renderConversationDrawer\(\);[\s\S]*setCommandStatus\(next \? "RUNNING" : "STANDBY"\);/);
	assert.doesNotMatch(
		response.body,
		/function setLoading\(next\)\s*\{[\s\S]*if \(next\) \{[\s\S]*renderConversationDrawer\(\);[\s\S]*\}[\s\S]*setCommandStatus\(next \? "RUNNING" : "STANDBY"\);/,
	);
	await app.close();
});

test("GET /playground does not force-scroll when the user is reading history", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /id="scroll-to-bottom-button"/);
	assert.match(response.body, /\.scroll-to-bottom-button\s*\{[\s\S]*position:\s*absolute;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.scroll-to-bottom-button\s*\{[\s\S]*position:\s*fixed;[\s\S]*bottom:\s*calc\(80px \+ env\(safe-area-inset-bottom\)\);/);
	assert.match(response.body, /\.scroll-to-bottom-button\s*\{[\s\S]*border:\s*1px solid rgba\(101, 209, 255, 0\.34\);/);
	assert.match(response.body, /\.scroll-to-bottom-button\s*\{[\s\S]*background:\s*var\(--chat-floating-bg\);[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /:root\[data-theme="light"\] \.scroll-to-bottom-button\s*\{[\s\S]*border-color:\s*rgba\(8, 120, 75, 0\.24\);/);
	assert.match(response.body, /\.scroll-to-bottom-button\.visible\s*\{[\s\S]*display:\s*inline-flex;/);
	assert.match(response.body, /const TRANSCRIPT_FOLLOW_THRESHOLD_PX = 120;/);
	assert.match(response.body, /autoFollowTranscript: true,/);
	assert.match(response.body, /function isTranscriptNearBottom\(\)\s*\{/);
	assert.match(response.body, /function syncTranscriptFollowState\(\)\s*\{/);
	assert.match(response.body, /function cancelScheduledTranscriptAutoScroll\(\)\s*\{/);
	assert.match(response.body, /function updateScrollToBottomButton\(\)\s*\{/);
	assert.match(response.body, /function scrollTranscriptToBottom\(options\)\s*\{/);
	assert.match(response.body, /TRANSCRIPT_BOTTOM_SYNC_COOLDOWN_MS/);
	assert.match(response.body, /if \(!\(options\?\.force \|\| state\.autoFollowTranscript \|\| isTranscriptNearBottom\(\)\)\) \{/);
	assert.match(
		response.body,
		/function syncTranscriptFollowState\(\)\s*\{[\s\S]*state\.autoFollowTranscript = isTranscriptNearBottom\(\);[\s\S]*if \(!state\.autoFollowTranscript\) \{[\s\S]*cancelScheduledTranscriptAutoScroll\(\);[\s\S]*\}[\s\S]*updateScrollToBottomButton\(\);[\s\S]*\}/,
	);
	assert.match(response.body, /scrollToBottomButton\.addEventListener\("click", \(\) => \{/);
	assert.match(response.body, /transcript\.addEventListener\("scroll", handleTranscriptScroll\)/);
	assert.match(response.body, /syncTranscriptFollowState\(\);/);
	assert.match(response.body, /scrollTranscriptToBottom\(\{ force: true \}\);/);
	assert.doesNotMatch(
		response.body,
		/function restoreConversationHistory\(conversationId\)\s*\{[\s\S]*scrollTranscriptToBottom\(\{ force: true \}\);/,
	);
	assert.doesNotMatch(
		response.body,
		/function renderConversationState\(conversationState, syncToken\)\s*\{[\s\S]*scrollTranscriptToBottom\(\{ force: true \}\);/,
	);
	assert.match(response.body, /const shouldPreserveTranscriptViewport =[\s\S]*!state\.autoFollowTranscript/);
	assert.match(response.body, /const preservedTranscriptScrollTop = shouldPreserveTranscriptViewport \? transcript\.scrollTop : null;/);
	assert.match(response.body, /if \(typeof preservedTranscriptScrollTop === "number"\) \{/);
	assert.match(response.body, /const maxScrollTop = Math\.max\(0, transcript\.scrollHeight - transcript\.clientHeight\);/);
	assert.match(response.body, /transcript\.scrollTop = Math\.min\(preservedTranscriptScrollTop, maxScrollTop\);/);
	assert.match(response.body, /state\.autoFollowTranscript = false;/);
	assert.match(response.body, /updateScrollToBottomButton\(\);/);
	await app.close();
});

test("GET /playground injects layout and scroll runtime from a dedicated controller", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /function bindPlaygroundLayoutController\(\)\s*\{/);
	assert.match(response.body, /bindPlaygroundLayoutController\(\);/);
	assert.match(response.body, /window\.addEventListener\("resize", syncConversationWidth\)/);
	assert.match(response.body, /const layoutObserver = new ResizeObserver\(\(\) => \{/);
	assert.match(response.body, /scrollToBottomButton\.addEventListener\("click", \(\) => \{/);
	assert.match(response.body, /transcript\.addEventListener\("scroll", handleTranscriptScroll\)/);
	assert.match(response.body, /document\.visibilityState === "visible"/);
	assert.match(response.body, /scheduleResumeConversationSync\("pageshow"/);
	await app.close();
});

test("GET /playground grades resume sync by browser lifecycle reason", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /const RESUME_SYNC_STALE_MS = \d+;/);
	assert.match(response.body, /resumeSyncPendingOptions:\s*null/);
	assert.match(response.body, /lastConversationStateSyncAt:\s*0/);
	assert.match(response.body, /function mergeResumeSyncOptions\(current, next\)\s*\{/);
	assert.match(response.body, /function shouldResumeCatalogSync\(options\)\s*\{/);
	assert.match(response.body, /function shouldResumeStateSync\(options\)\s*\{/);
	assert.match(response.body, /async function resumeActiveRunAfterReconnect\(conversationId\)\s*\{/);
	assert.match(
		response.body,
		/if \(shouldResumeCatalogSync\(resumeOptions\)\) \{[\s\S]*await ensureCurrentConversation\(\{ silent: true \}\);/,
	);
	assert.match(
		response.body,
		/if \(shouldResumeStateSync\(resumeOptions\)\) \{[\s\S]*await restoreConversationHistoryFromServer/,
	);
	assert.match(
		response.body,
		/document\.addEventListener\("visibilitychange", \(\) => \{[\s\S]*scheduleResumeConversationSync\("visibilitychange", \{[\s\S]*allowStaleState: true,[\s\S]*preferEvents: true,[\s\S]*\}\);/,
	);
	assert.match(
		response.body,
		/window\.addEventListener\("pageshow", \(event\) => \{[\s\S]*scheduleResumeConversationSync\("pageshow", \{[\s\S]*forceState: true,[\s\S]*preferEvents: true,[\s\S]*\}\);/,
	);
	assert.match(
		response.body,
		/window\.addEventListener\("online", \(\) => \{[\s\S]*scheduleResumeConversationSync\("online", \{[\s\S]*preferEvents: true,[\s\S]*requireActiveRun: true,[\s\S]*\}\);/,
	);
	assert.doesNotMatch(
		response.body,
		/state\.resumeSyncPromise = \(async \(\) => \{\s*await ensureCurrentConversation\(\{ silent: true \}\);/,
	);
	await app.close();
});

test("GET /playground injects transcript rendering from a dedicated renderer", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /function bindPlaygroundTranscriptRenderer\(\)\s*\{/);
	assert.match(response.body, /bindPlaygroundTranscriptRenderer\(\);/);
	assert.match(response.body, /function renderMessageMarkdown\(source\)\s*\{/);
	assert.match(response.body, /function renderTranscriptEntry\(entry, insertMode\)\s*\{/);
	assert.match(response.body, /function hydrateMarkdownContent\(root\)\s*\{/);
	assert.match(response.body, /function createMessageActions\(entry, content\)\s*\{/);
	assert.match(response.body, /function ensureStreamingAssistantMessage\(\)\s*\{/);
	await app.close();
});

test("GET /playground collects playground linked styles for message image export", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /async function collectExportStyles\(\)\s*\{/);
	assert.match(response.body, /document\.querySelectorAll\('link\[rel="stylesheet"\]'\)/);
	assert.match(response.body, /link\.href\.includes\("\/playground\/"\)/);
	assert.match(response.body, /await collectExportStyles\(\)/);
	await app.close();
});

test("GET /playground injects stream lifecycle runtime from a dedicated controller", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /function bindPlaygroundStreamController\(\)\s*\{/);
	assert.match(response.body, /bindPlaygroundStreamController\(\);/);
	assert.match(response.body, /function connectNotificationStream\(\)\s*\{/);
	assert.match(
		response.body,
		/function handleNotificationBroadcastEvent\(rawEvent\)\s*\{[\s\S]*?showNotificationToast\(event\);[\s\S]*?void loadTaskInbox\(\{ silent: true \}\);[\s\S]*?\}/,
	);
	assert.doesNotMatch(
		response.body,
		/void loadTaskInbox\(\{ silent: true \}\);\s*void syncTaskInboxSummary\(\{ silent: true \}\);/,
	);
	assert.match(response.body, /async function attachActiveRunEventStream\(conversationId\)\s*\{/);
	assert.match(response.body, /async function recoverRunningStreamAfterDisconnect\(reason\)\s*\{/);
	assert.match(response.body, /function handleStreamEvent\(event\)\s*\{/);
	assert.match(response.body, /async function readEventStream\(response, onEvent, options\)\s*\{/);
	assert.match(response.body, /const STREAM_IDLE_TIMEOUT_MS = 90000;/);
	assert.match(response.body, /async function readStreamChunkWithIdleTimeout\(reader, idleTimeoutMs\)\s*\{/);
	assert.match(response.body, /async function sendMessage\(\)\s*\{/);
	assert.match(response.body, /async function queueActiveMessage\(message, attachments, assetRefs, options\)\s*\{/);
	assert.match(response.body, /async function interruptRun\(\)\s*\{/);
	await app.close();
});

test("GET /playground routes /new through the slash command dispatcher", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /function parsePlaygroundSlashCommand\(/);
	assert.match(response.body, /async function runPlaygroundSlashCommand\(/);
	assert.match(response.body, /case "\/new":/);
	assert.match(response.body, /await startNewConversation\(\)/);
	assert.match(response.body, /showError\("未知指令："\s*\+\s*command\.raw\)/);
	assert.match(response.body, /showError\("指令不能和附件或引用文件一起发送"\)/);
	assert.match(
		response.body,
		/async function sendMessage\(\)\s*\{[\s\S]*const slashCommand = parsePlaygroundSlashCommand\(message\);[\s\S]*if \(slashCommand && \(attachments\.length > 0 \|\| assetRefs\.length > 0\)\) \{[\s\S]*restoreComposerDraft\(composerDraft\);[\s\S]*return;[\s\S]*\}[\s\S]*if \(slashCommand\) \{[\s\S]*const handled = await runPlaygroundSlashCommand\(slashCommand, composerDraft\);[\s\S]*if \(handled\) \{[\s\S]*return;[\s\S]*\}/,
	);
	const commandRunner = response.body.match(
		/async function runPlaygroundSlashCommand\(command, composerDraft\)\s*\{[\s\S]*?\n\t\tasync function sendMessage\(\)/,
	)?.[0];
	assert.ok(commandRunner);
	assert.doesNotMatch(commandRunner, /fetch\("\/v1\/chat\/stream"/);
	assert.doesNotMatch(commandRunner, /fetch\("\/v1\/chat\/queue"/);
	await app.close();
});

test("GET /playground exposes explicit agent switching operations for agents", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /window\.ugkPlaygroundAgentOps = Object\.freeze\(\{/);
	assert.match(response.body, /listAgents: \(\) => \[\.\.\.state\.agentCatalog\]/);
	assert.match(response.body, /getCurrentAgentId,/);
	assert.match(response.body, /switchAgent,/);
	assert.doesNotMatch(response.body, /parseNaturalAgentSwitchCommand/);
	assert.doesNotMatch(response.body, /normalizeAgentSwitchText/);
	await app.close();
});

test("GET /playground keeps bottom scroll room above the active composer", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /--transcript-bottom-scroll-buffer:\s*96px;/);
	assert.match(
		response.body,
		/\.transcript\s*\{[\s\S]*scroll-padding-bottom:\s*var\(--transcript-bottom-scroll-buffer\);/,
	);
	assert.match(
		response.body,
		/\.shell\[data-transcript-state="active"\] \.transcript-current\s*\{[\s\S]*padding-bottom:\s*var\(--transcript-bottom-scroll-buffer\);/,
	);
	assert.match(
		response.body,
		/@media \(max-width: 640px\) \{[\s\S]*\.shell\s*\{[\s\S]*--transcript-bottom-scroll-buffer:\s*calc\(112px \+ env\(safe-area-inset-bottom\)\);/,
	);
	await app.close();
});

test("GET /playground restores running conversations after refresh and avoids reopening the same stream", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /getAgentApiPath\("\/chat\/status"\)/);
	assert.match(response.body, /getAgentApiPath\("\/chat\/state"\)/);
	assert.match(response.body, /getAgentApiPath\("\/chat\/events"\)/);
	assert.match(response.body, /async function fetchConversationState\(conversationId, options\)\s*\{/);
	assert.match(response.body, /function renderConversationState\(conversationState, syncToken\)\s*\{/);
	assert.match(response.body, /async function fetchConversationRunStatus\(conversationId\)\s*\{/);
	assert.match(response.body, /function stopActiveRunEventStream\(\)\s*\{/);
	assert.match(response.body, /async function attachActiveRunEventStream\(conversationId\)\s*\{/);
	assert.match(response.body, /async function syncConversationRunState\(conversationId, options\)\s*\{/);
	assert.match(response.body, /async function recoverRunningStreamAfterDisconnect\(reason\)\s*\{/);
	assert.match(response.body, /function reconcileSyncedConversationState\(payload, conversationId, options\)\s*\{/);
	assert.match(response.body, /function isTerminalRunEvent\(event\)\s*\{/);
	assert.match(response.body, /function buildConversationStateSignature\(conversationState\)\s*\{/);
	assert.match(response.body, /query\.set\("afterEventCursor", String\(Math\.trunc\(activeRunSnapshot\.eventCursor\)\)\)/);
	assert.match(response.body, /activeRunEventCursor: activeRun \? activeRun\.eventCursor : 0/);
	assert.match(response.body, /let rendered = findRenderedAssistantForActiveRun\(activeRun\);/);
	assert.doesNotMatch(response.body, /function formatRecoveredRunMessage\(\)\s*\{/);
	assert.doesNotMatch(response.body, /function normalizeProcessSnapshot\(rawProcess\)\s*\{/);
	assert.doesNotMatch(response.body, /function restoreProcessSnapshot\(entry, rendered, options\)\s*\{/);
	assert.doesNotMatch(response.body, /function persistActiveProcessSnapshot\(\)\s*\{/);
	assert.match(response.body, /function isPageUnloadStreamError\(error\)\s*\{/);
	assert.match(response.body, /if \(isPageUnloadStreamError\(error\)\) \{/);
	assert.match(response.body, /function isTransientNetworkHistoryEntry\(entry\)\s*\{/);
	assert.match(response.body, /filter\(\(entry\) => !isTransientNetworkHistoryEntry\(entry\)\)/);
	assert.match(response.body, /setAssistantLoadingState\("[^"]+", "system"\)/);
	assert.match(response.body, /setAssistantLoadingState\("\\\\u5f53\\\\u524d\\\\u6b63\\\\u5728\\\\u8fd0\\\\u884c", "system"\)/);
	assert.doesNotMatch(response.body, /上一轮仍在运行/);
	assert.match(response.body, /void attachActiveRunEventStream\(nextConversationId\)/);
	assert.match(response.body, /return reconcileSyncedConversationState\(payload, nextConversationId, options\);/);
	assert.match(
		response.body,
		/reconcileSyncedConversationState\(payload, nextConversationId, options\);[\s\S]*scheduleConversationHistoryPersist\(nextConversationId\);/,
	);
	assert.doesNotMatch(response.body, /__legacy_previous_run_banner__/);
	assert.doesNotMatch(response.body, /const liveRunState = await syncConversationRunState\(state\.conversationId, \{/);
	assert.match(response.body, /const streamWasRecovered = await recoverRunningStreamAfterDisconnect\("missing_done"\);/);
	assert.match(response.body, /const streamWasRecovered = await recoverRunningStreamAfterDisconnect\("network_error"\);/);
		assert.match(response.body, /createStreamOwner/);
	assert.match(response.body, /reader\.cancel\("stream idle timeout"\)/);
	assert.match(response.body, /const previousSignature = buildConversationStateSignature\(state\.conversationState\);/);
	assert.match(response.body, /const nextSignature = buildConversationStateSignature\(state\.conversationState\);/);
	assert.match(response.body, /nextSignature !== previousSignature \|\| Boolean\(state\.conversationState\?\.activeRun\)/);
		assert.match(response.body, /shouldRecoverFromCanonicalState = !receivedTerminalEvent/);
		// Agent run status in switcher menu
		assert.match(response.body, /agentRunStatusByAgentId/);
		assert.match(response.body, /loadAgentRunStatus/);
		assert.match(response.body, /is-busy/);
		assert.match(response.body, /is-idle/);
		assert.match(response.body, /is-unknown/);
		// Stream event owner guard
		assert.match(response.body, /activeStreamOwner/);
		assert.match(response.body, /agentSwitchGeneration/);
		assert.match(response.body, /isStreamOwnerCurrent/);
	assert.match(
		response.body,
		/void restoreConversationHistoryFromServer\(nextConversationId, \{[\s\S]*silent: true,[\s\S]*clearIfIdle: true,[\s\S]*attachIfRunning: true,[\s\S]*\}\);/,
	);
	assert.match(response.body, /activeStreamOwner === streamOwner/);
	assert.match(response.body, /document\.addEventListener\("visibilitychange"/);
	assert.match(response.body, /window\.addEventListener\("pageshow"/);
	assert.match(response.body, /function scheduleResumeConversationSync\(reason, options\)\s*\{/);
	assert.match(
		response.body,
		/if \(state\.loading\) \{[\s\S]*await queueActiveMessage\(outboundMessage, attachments, assetRefs, \{ composerDraft \}\);/,
	);
	assert.match(response.body, /async function resolveServerActiveConversation\(options\)\s*\{/);
	assert.match(response.body, /force: true,[\s\S]*const runningConversationId = String\(findRunningConversationInCatalog\(catalog\)/);
	assert.match(
		response.body,
		/const serverActiveConversation = await resolveServerActiveConversation\(\{ silent: true \}\);[\s\S]*await queueActiveMessage\(outboundMessage, attachments, assetRefs, \{ composerDraft \}\);/,
	);
	assert.match(response.body, /activeRun\.status === "interrupted"/);
	assert.match(response.body, /case "interrupted":[\s\S]*restoreConversationHistoryFromServer\(event\.conversationId\)/);
	assert.match(response.body, /case "error":[\s\S]*restoreConversationHistoryFromServer\(event\.conversationId\)/);
	assert.match(response.body, /async function interruptRun\(\)\s*\{[\s\S]*const serverActiveConversation = await resolveServerActiveConversation\(\{ silent: true \}\);/);
	assert.match(response.body, /case "interrupted":[\s\S]*state\.receivedDoneEvent = true;/);
	assert.match(response.body, /case "error":[\s\S]*state\.receivedDoneEvent = true;/);
	assert.match(response.body, /async function interruptRun\(\)\s*\{[\s\S]*setAssistantLoadingState\("正在中断当前任务", "system"\);[\s\S]*statusPill\.textContent = "正在中断";/);
	assert.doesNotMatch(response.body, /打断请求已接收"[\s\S]{0,220}setLoading\(false\);/);
	await app.close();
});

test("GET /playground skips identical conversation state redraws and diffs transcript messages", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /renderedConversationStateSignature:\s*""/);
	assert.match(response.body, /function syncRenderedConversationHistory\(nextEntries\)\s*\{/);
	assert.match(response.body, /function updateRenderedTranscriptEntry\(entry\)\s*\{/);
	assert.match(response.body, /const nextTranscriptSignature = buildConversationStateSignature\(state\.conversationState\);/);
	assert.match(
		response.body,
		/if \(nextTranscriptSignature === state\.renderedConversationStateSignature && nextConversationId === state\.renderedConversationId\) \{[\s\S]*shouldRenderTranscript = false;/,
	);
	assert.match(
		response.body,
		/if \(shouldRenderTranscript\) \{[\s\S]*syncRenderedConversationHistory\(state\.conversationHistory\);[\s\S]*state\.renderedConversationStateSignature = nextTranscriptSignature;/,
	);
	assert.doesNotMatch(
		response.body,
		/function renderConversationState\(conversationState, syncToken\)\s*\{[\s\S]*state\.renderedHistoryCount = 0;\s*clearRenderedTranscript\(\);\s*resetStreamingState\(\);/,
	);
	await app.close();
});

test("GET /playground labels timed-out conn runs distinctly in the detail dialog", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /function isConnRunTimedOut\(/);
	assert.match(response.body, /failed \/ timed out/);
	assert.match(response.body, /run_timed_out/);
	await app.close();
});

test("GET /v1/chat/history returns the requested conversation transcript", async () => {
	const calls: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			getConversationHistory: async (conversationId, options) => {
				calls.push(`${conversationId}:${options?.limit ?? ""}:${options?.before ?? ""}`);
				return {
					conversationId,
					messages: [
						{
							id: "history-1",
							kind: "user",
							title: "manual:thread-1",
							text: "?????",
							createdAt: "2026-04-20T00:00:00.000Z",
						},
						{
							id: "history-2",
							kind: "assistant",
							title: "Assistant",
							text: "reply",
							createdAt: "2026-04-20T00:00:01.000Z",
						},
					],
					hasMore: true,
					nextBefore: "history-1",
					limit: options?.limit,
				};
			},
		}),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/chat/history?conversationId=manual%3Athread-1&limit=25&before=history-3",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:thread-1",
		messages: [
			{
				id: "history-1",
				kind: "user",
				title: "manual:thread-1",
				text: "?????",
				createdAt: "2026-04-20T00:00:00.000Z",
			},
			{
				id: "history-2",
				kind: "assistant",
				title: "Assistant",
				text: "reply",
				createdAt: "2026-04-20T00:00:01.000Z",
			},
		],
		hasMore: true,
		nextBefore: "history-1",
		limit: 25,
	});
	assert.deepEqual(calls, ["manual:thread-1:25:history-3"]);
	await app.close();
});

test("GET /v1/chat/state returns the canonical conversation state", async () => {
	const calls: Array<{ conversationId: string; viewLimit?: number }> = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			getConversationState: async (conversationId, options) => {
				calls.push({ conversationId, viewLimit: options?.viewLimit });
				return {
					conversationId,
					running: true,
					contextUsage: {
						provider: "zhipu-glm",
						model: "glm-5.1",
						currentTokens: 128,
						contextWindow: 128000,
						reserveTokens: 16384,
						maxResponseTokens: 16384,
						availableTokens: 111104,
						percent: 1,
						status: "safe",
						mode: "estimate",
					},
					messages: [
						{
							id: "history-1",
							kind: "user",
							title: "manual:thread-2",
							text: "old task",
							createdAt: "2026-04-20T00:00:00.000Z",
						},
					],
					viewMessages: [
						{
							id: "history-1",
							kind: "user",
							title: "manual:thread-2",
							text: "old task",
							createdAt: "2026-04-20T00:00:00.000Z",
						},
						{
							id: "active-input-run-agent-global-1",
							kind: "user",
							title: "manual:thread-2",
							text: "current task",
							createdAt: "2026-04-20T00:00:01.000Z",
						},
						{
							id: "active-run-agent-global-1",
							kind: "assistant",
							title: "助手",
							text: "partial",
							createdAt: "2026-04-20T00:00:01.000Z",
						},
					],
					activeRun: {
						runId: "run-agent-global-1",
						status: "running",
						assistantMessageId: "active-run-agent-global-1",
						input: {
							message: "current task",
							inputAssets: [],
						},
						text: "partial",
						process: {
							title: "????",
							narration: ["????"],
							currentAction: "???? ? bash",
							kind: "tool",
							isComplete: false,
							entries: [],
						},
						queue: {
							steering: [],
							followUp: [],
						},
						loading: true,
						startedAt: "2026-04-20T00:00:01.000Z",
						updatedAt: "2026-04-20T00:00:02.000Z",
					},
					updatedAt: "2026-04-20T00:00:02.000Z",
					historyPage: {
						hasMore: false,
						limit: options?.viewLimit,
					},
				};
			},
		}),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/chat/state?conversationId=manual%3Athread-2&viewLimit=80",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:thread-2",
		running: true,
		contextUsage: {
			provider: "zhipu-glm",
			model: "glm-5.1",
			currentTokens: 128,
			contextWindow: 128000,
			reserveTokens: 16384,
			maxResponseTokens: 16384,
			availableTokens: 111104,
			percent: 1,
			status: "safe",
			mode: "estimate",
		},
		messages: [
			{
				id: "history-1",
				kind: "user",
				title: "manual:thread-2",
				text: "old task",
				createdAt: "2026-04-20T00:00:00.000Z",
			},
		],
		viewMessages: [
			{
				id: "history-1",
				kind: "user",
				title: "manual:thread-2",
				text: "old task",
				createdAt: "2026-04-20T00:00:00.000Z",
			},
			{
				id: "active-input-run-agent-global-1",
				kind: "user",
				title: "manual:thread-2",
				text: "current task",
				createdAt: "2026-04-20T00:00:01.000Z",
			},
			{
				id: "active-run-agent-global-1",
				kind: "assistant",
				title: "助手",
				text: "partial",
				createdAt: "2026-04-20T00:00:01.000Z",
			},
		],
		activeRun: {
			runId: "run-agent-global-1",
			status: "running",
			assistantMessageId: "active-run-agent-global-1",
			input: {
				message: "current task",
				inputAssets: [],
			},
			text: "partial",
			process: {
				title: "????",
				narration: ["????"],
				currentAction: "???? ? bash",
				kind: "tool",
				isComplete: false,
				entries: [],
			},
			queue: {
				steering: [],
				followUp: [],
			},
			loading: true,
			startedAt: "2026-04-20T00:00:01.000Z",
			updatedAt: "2026-04-20T00:00:02.000Z",
		},
		updatedAt: "2026-04-20T00:00:02.000Z",
		historyPage: {
			hasMore: false,
			limit: 80,
		},
	});
	assert.deepEqual(calls, [{ conversationId: "manual:thread-2", viewLimit: 80 }]);
	await app.close();
});

test("GET /v1/chat/conversations returns the server-synced current conversation catalog", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub({
			getConversationCatalog: async () => ({
				currentConversationId: "manual:thread-2",
				conversations: [
					{
						conversationId: "manual:thread-2",
						title: "Thread 2",
						preview: "Latest preview",
						messageCount: 6,
						createdAt: "2026-04-20T00:00:00.000Z",
						updatedAt: "2026-04-20T00:02:00.000Z",
						running: false,
					},
					{
						conversationId: "manual:thread-1",
						title: "?????",
						preview: "Preview one",
						messageCount: 12,
						createdAt: "2026-04-19T23:50:00.000Z",
						updatedAt: "2026-04-19T23:59:00.000Z",
						running: false,
					},
				],
			}),
		}),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/chat/conversations",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		currentConversationId: "manual:thread-2",
		conversations: [
			{
				conversationId: "manual:thread-2",
				title: "Thread 2",
				preview: "Latest preview",
				messageCount: 6,
				createdAt: "2026-04-20T00:00:00.000Z",
				updatedAt: "2026-04-20T00:02:00.000Z",
				running: false,
			},
			{
				conversationId: "manual:thread-1",
				title: "?????",
				preview: "Preview one",
				messageCount: 12,
				createdAt: "2026-04-19T23:50:00.000Z",
				updatedAt: "2026-04-19T23:59:00.000Z",
				running: false,
			},
		],
	});
	await app.close();
});

test("POST /v1/chat/conversations creates and activates a new conversation", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub({
			createConversation: async () => ({
				conversationId: "manual:new-2",
				currentConversationId: "manual:new-2",
				created: true,
			}),
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat/conversations",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:new-2",
		currentConversationId: "manual:new-2",
		created: true,
	});
	await app.close();
});

test("POST /v1/chat/current switches the globally active conversation", async () => {
	const calls: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			switchConversation: async (conversationId) => {
				calls.push(conversationId);
				return {
					conversationId,
					currentConversationId: conversationId,
					switched: true,
				};
			},
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat/current",
		payload: {
			conversationId: "manual:thread-1",
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:thread-1",
		currentConversationId: "manual:thread-1",
		switched: true,
	});
	assert.deepEqual(calls, ["manual:thread-1"]);
	await app.close();
});

test("DELETE /v1/chat/conversations/:conversationId removes a conversation", async () => {
	const calls: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			deleteConversation: async (conversationId) => {
				calls.push(conversationId);
				return {
					conversationId,
					currentConversationId: "manual:thread-2",
					deleted: true,
				};
			},
		}),
	});

	const response = await app.inject({
		method: "DELETE",
		url: "/v1/chat/conversations/manual%3Athread-1",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:thread-1",
		currentConversationId: "manual:thread-2",
		deleted: true,
	});
	assert.deepEqual(calls, ["manual:thread-1"]);
	await app.close();
});

test("PATCH /v1/chat/conversations/:conversationId updates conversation menu metadata", async () => {
	const calls: Array<{ conversationId: string; patch: { title?: string; pinned?: boolean; backgroundColor?: string } }> = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			updateConversation: async (conversationId, patch) => {
				calls.push({ conversationId, patch });
				return {
					conversationId,
					updated: true,
					conversation: {
						conversationId,
						title: patch.title ?? "Thread",
						preview: "preview",
						messageCount: 2,
						createdAt: "2026-04-20T00:00:00.000Z",
						updatedAt: "2026-04-20T00:01:00.000Z",
						running: false,
						pinned: patch.pinned,
						backgroundColor: patch.backgroundColor,
					},
				};
			},
		}),
	});

	const response = await app.inject({
		method: "PATCH",
		url: "/v1/chat/conversations/manual%3Athread-1",
		payload: {
			title: "  重命名后的会话  ",
			pinned: true,
			backgroundColor: "sky",
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(calls, [
		{
			conversationId: "manual:thread-1",
			patch: {
				title: "重命名后的会话",
				pinned: true,
				backgroundColor: "sky",
			},
		},
	]);
	assert.equal(response.json().conversation.title, "重命名后的会话");
	assert.equal(response.json().conversation.pinned, true);
	assert.equal(response.json().conversation.backgroundColor, "sky");
	await app.close();
});

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

test("GET /v1/conns returns scheduled conn tasks", async () => {
	const latestRunCalls: string[][] = [];
	const runHistoryCalls: string[] = [];
	const latestUnreadCalls: string[][] = [];
	const totalUnreadCalls: string[][] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [
				{
					connId: "conn-1",
					title: "digest",
					prompt: "summarize",
					target: { type: "conversation", conversationId: "manual:digest" },
					schedule: { kind: "interval", everyMs: 60000 },
					assetRefs: ["asset-1"],
					status: "active",
					createdAt: "2026-04-18T00:00:00.000Z",
					updatedAt: "2026-04-18T00:00:00.000Z",
					nextRunAt: "2026-04-18T00:01:00.000Z",
				},
			],
			get: async () => undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async (connId: string) => {
				runHistoryCalls.push(connId);
				return [];
			},
			listLatestRunsForConns: async (connIds: readonly string[]) => {
				latestRunCalls.push([...connIds]);
				return {
					"conn-1": {
						runId: "run-latest",
						connId: "conn-1",
						status: "succeeded",
						scheduledAt: "2026-04-18T00:00:00.000Z",
						startedAt: "2026-04-18T00:00:01.000Z",
						finishedAt: "2026-04-18T00:00:20.000Z",
						workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-latest",
						resultSummary: "done",
						createdAt: "2026-04-18T00:00:00.000Z",
						updatedAt: "2026-04-18T00:00:20.000Z",
					},
				};
			},
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getLatestUnreadTimesByConn: async (connIds: readonly string[]) => {
				latestUnreadCalls.push([...connIds]);
				return {};
			},
			getTotalUnreadCount: async (connIds?: readonly string[]) => {
				totalUnreadCalls.push([...(connIds ?? [])]);
				return 0;
			},
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/conns",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conns: [
			{
				connId: "conn-1",
				title: "digest",
				prompt: "summarize",
				target: { type: "conversation", conversationId: "manual:digest" },
				schedule: { kind: "interval", everyMs: 60000 },
				execution: { type: "agent_prompt" },
				assetRefs: ["asset-1"],
				status: "active",
				createdAt: "2026-04-18T00:00:00.000Z",
				updatedAt: "2026-04-18T00:00:00.000Z",
				nextRunAt: "2026-04-18T00:01:00.000Z",
				latestRun: {
					runId: "run-latest",
					connId: "conn-1",
					status: "succeeded",
					scheduledAt: "2026-04-18T00:00:00.000Z",
					startedAt: "2026-04-18T00:00:01.000Z",
					finishedAt: "2026-04-18T00:00:20.000Z",
					workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-latest",
					resultSummary: "done",
					createdAt: "2026-04-18T00:00:00.000Z",
					updatedAt: "2026-04-18T00:00:20.000Z",
				},
			},
		],
		totalUnreadRuns: 0,
		unreadLatestRunTimesByConnId: {},
		unreadRunCountsByConnId: {},
	});
	assert.deepEqual(latestRunCalls, [["conn-1"]]);
	assert.deepEqual(latestUnreadCalls, [["conn-1"]]);
	assert.deepEqual(totalUnreadCalls, [["conn-1"]]);
	assert.deepEqual(runHistoryCalls, []);
	await app.close();
});

test("DELETE /v1/conns/:connId deletes a scheduled conn task", async () => {
	const deletedConnIds: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async (connId: string) => {
				deletedConnIds.push(connId);
				return connId === "conn-1";
			},
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "DELETE",
		url: "/v1/conns/conn-1",
	});

	assert.equal(response.statusCode, 204);
	assert.deepEqual(deletedConnIds, ["conn-1"]);
	await app.close();
});

test("POST /v1/conns/bulk-delete deletes multiple scheduled conn tasks", async () => {
	const deletedConnIds: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async () => undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async (connId: string) => {
				deletedConnIds.push(connId);
				return connId !== "missing";
			},
			deleteMany: async (connIds: string[]) => {
				deletedConnIds.push(...connIds);
				return {
					deletedConnIds: connIds.filter((connId) => connId !== "missing"),
					missingConnIds: connIds.filter((connId) => connId === "missing"),
				};
			},
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/conns/bulk-delete",
		payload: {
			connIds: ["conn-1", "conn-1", "missing", "conn-2"],
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		deletedConnIds: ["conn-1", "conn-2"],
		missingConnIds: ["missing"],
	});
	assert.deepEqual(deletedConnIds, ["conn-1", "missing", "conn-2"]);
	await app.close();
});

test("POST /v1/conns/:connId/run enqueues a background run without invoking the foreground agent", async () => {
	const createdRuns: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			chat: async () => {
				throw new Error("foreground agent should not be called");
			},
		}),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: ["asset-1"],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
							nextRunAt: "2026-04-18T00:01:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async (input: { runId?: string; connId: string; scheduledAt: string; workspacePath: string }) => {
				createdRuns.push(input);
				return {
					runId: input.runId ?? "run-1",
					connId: input.connId,
					status: "pending",
					scheduledAt: input.scheduledAt,
					workspacePath: input.workspacePath,
					createdAt: "2026-04-21T00:00:00.000Z",
					updatedAt: "2026-04-21T00:00:00.000Z",
				};
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
		backgroundDataDir: "E:/AII/ugk-pi/.data/agent/background",
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/conns/conn-1/run",
	});

	assert.equal(response.statusCode, 202);
	const body = response.json();
	assert.equal(body.run.connId, "conn-1");
	assert.equal(body.run.status, "pending");
	assert.equal(body.run.scheduledAt <= new Date().toISOString(), true);
	assert.match(body.run.workspacePath, /[\\/]background[\\/]runs[\\/][0-9a-f-]+$/);
	assert.deepEqual(createdRuns, [
		{
			runId: body.run.runId,
			connId: "conn-1",
			scheduledAt: body.run.scheduledAt,
			workspacePath: body.run.workspacePath,
		},
	]);
	await app.close();
});

test("POST /v1/conns/:connId/run reuses an active run instead of creating duplicates", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "task_inbox" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("duplicate run should not be created");
			},
			getActiveRunForConn: async (connId: string) =>
				connId === "conn-1"
					? {
							runId: "run-active",
							connId: "conn-1",
							status: "running",
							scheduledAt: "2026-05-11T07:30:02.000Z",
							claimedAt: "2026-05-11T07:30:09.000Z",
							startedAt: "2026-05-11T07:30:09.000Z",
							workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-active",
							createdAt: "2026-05-11T07:30:02.000Z",
							updatedAt: "2026-05-11T07:30:09.000Z",
						}
					: undefined,
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
		backgroundDataDir: "E:/AII/ugk-pi/.data/agent/background",
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/conns/conn-1/run",
	});

	assert.equal(response.statusCode, 202);
	const body = response.json();
	assert.equal(body.run.runId, "run-active");
	assert.equal(body.run.status, "running");
	assert.equal(body.reused, true);
	await app.close();
});

test("POST /v1/conns/:connId/runs/:runId/cancel cancels an active background run", async () => {
	const run = {
		runId: "run-active",
		connId: "conn-1",
		status: "running" as const,
		scheduledAt: "2026-05-19T07:30:02.000Z",
		claimedAt: "2026-05-19T07:30:09.000Z",
		startedAt: "2026-05-19T07:30:09.000Z",
		leaseOwner: "worker-a",
		leaseUntil: "2026-05-19T07:35:09.000Z",
		workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-active",
		createdAt: "2026-05-19T07:30:02.000Z",
		updatedAt: "2026-05-19T07:30:09.000Z",
	};
	let cancelInput: unknown;
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "task_inbox" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async (runId: string) => (runId === run.runId ? run : undefined),
			cancelRun: async (input: { runId: string; summary: string; text?: string }) => {
				cancelInput = input;
				return {
					...run,
					status: "cancelled",
					finishedAt: "2026-05-19T07:35:11.000Z",
					leaseOwner: undefined,
					leaseUntil: undefined,
					resultSummary: input.summary,
					resultText: input.text,
					updatedAt: "2026-05-19T07:35:11.000Z",
				} as const;
			},
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
			markAllRunsRead: async () => 0,
		} as never,
		backgroundDataDir: "E:/AII/ugk-pi/.data/agent/background",
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/conns/conn-1/runs/run-active/cancel",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(cancelInput, {
		runId: "run-active",
		summary: "Manually cancelled by operator",
		text: "Manually cancelled by operator",
	});
	const body = response.json();
	assert.equal(body.run.status, "cancelled");
	assert.equal(body.run.leaseOwner, undefined);
	assert.equal(body.run.resultSummary, "Manually cancelled by operator");
	await app.close();
});
test("GET /v1/conns/:connId/runs returns background run history for the conn", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async (connId: string) =>
				connId === "conn-1"
					? [
							{
								runId: "run-2",
								connId: "conn-1",
								status: "succeeded",
								scheduledAt: "2026-04-21T09:00:00.000Z",
								startedAt: "2026-04-21T09:00:01.000Z",
								finishedAt: "2026-04-21T09:00:30.000Z",
								workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-2",
								resultSummary: "done",
								resultText: "daily result",
								createdAt: "2026-04-21T09:00:00.000Z",
								updatedAt: "2026-04-21T09:00:30.000Z",
							},
						]
					: [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		runs: [
			{
				runId: "run-2",
				connId: "conn-1",
				status: "succeeded",
				scheduledAt: "2026-04-21T09:00:00.000Z",
				startedAt: "2026-04-21T09:00:01.000Z",
				finishedAt: "2026-04-21T09:00:30.000Z",
				workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-2",
				resultSummary: "done",
				resultText: "daily result",
				createdAt: "2026-04-21T09:00:00.000Z",
				updatedAt: "2026-04-21T09:00:30.000Z",
			},
		],
	});
	await app.close();
});

test("GET /v1/conns/:connId/runs supports bounded run history pagination", async () => {
	const calls: unknown[] = [];
	const runs = Array.from({ length: 11 }, (_, index) => {
		const ordinal = 11 - index;
		const id = String(ordinal).padStart(2, "0");
		return {
			runId: `run-${id}`,
			connId: "conn-1",
			status: "succeeded",
			scheduledAt: `2026-04-21T09:${id}:00.000Z`,
			workspacePath: `E:/AII/ugk-pi/.data/agent/background/runs/run-${id}`,
			createdAt: `2026-04-21T09:${id}:00.000Z`,
			updatedAt: `2026-04-21T09:${id}:30.000Z`,
		};
	});
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async (connId: string, options?: unknown) => {
				calls.push({ connId, options });
				return runs;
			},
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs?limit=10",
	});
	const cursorResponse = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs?limit=10&before=2026-04-21T09%3A02%3A00.000Z%7C2026-04-21T09%3A02%3A00.000Z%7Crun-02",
	});

	assert.equal(response.statusCode, 200);
	const body = response.json();
	assert.equal(body.runs.length, 10);
	assert.equal(body.hasMore, true);
	assert.equal(body.limit, 10);
	assert.equal(body.nextBefore, "2026-04-21T09:02:00.000Z|2026-04-21T09:02:00.000Z|run-02");
	assert.equal(cursorResponse.statusCode, 200);
	assert.deepEqual(calls, [
		{ connId: "conn-1", options: { limit: 11 } },
		{
			connId: "conn-1",
			options: {
				limit: 11,
				before: {
					scheduledAt: "2026-04-21T09:02:00.000Z",
					createdAt: "2026-04-21T09:02:00.000Z",
					runId: "run-02",
				},
			},
		},
	]);
	await app.close();
});

test("GET /v1/conns/:connId/runs rejects invalid pagination query", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async (_connId: string, options?: unknown) => {
				calls.push(options);
				return [];
			},
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	for (const url of [
		"/v1/conns/conn-1/runs?limit=nope",
		"/v1/conns/conn-1/runs?limit=0",
		"/v1/conns/conn-1/runs?limit=10&before=not-a-stable-cursor",
	]) {
		const response = await app.inject({
			method: "GET",
			url,
		});
		assert.equal(response.statusCode, 400);
	}
	assert.deepEqual(calls, []);
	await app.close();
});

test("GET /v1/conns/:connId/runs/:runId returns run detail with output files", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async (runId: string) =>
				runId === "run-2"
					? {
							runId: "run-2",
							connId: "conn-1",
							status: "succeeded",
							scheduledAt: "2026-04-21T09:00:00.000Z",
							claimedAt: "2026-04-21T09:00:01.000Z",
							startedAt: "2026-04-21T09:00:02.000Z",
							leaseOwner: "worker-a",
							leaseUntil: "2026-04-21T09:05:00.000Z",
							workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-2",
							resultSummary: "done",
							createdAt: "2026-04-21T09:00:00.000Z",
							updatedAt: "2026-04-21T09:00:30.000Z",
						}
					: runId === "run-other"
						? {
								runId: "run-other",
								connId: "conn-other",
								status: "succeeded",
								scheduledAt: "2026-04-21T09:00:00.000Z",
								workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-other",
								createdAt: "2026-04-21T09:00:00.000Z",
								updatedAt: "2026-04-21T09:00:30.000Z",
							}
						: undefined,
			listEvents: async () => [],
			listFiles: async (runId: string) =>
				runId === "run-2"
					? [
							{
								fileId: "file-1",
								runId: "run-2",
								kind: "output",
								relativePath: "output/report.md",
								fileName: "report.md",
								mimeType: "text/markdown",
								sizeBytes: 42,
								createdAt: "2026-04-21T09:00:30.000Z",
							},
						]
					: [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs/run-2",
	});
	const wrongConnResponse = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs/run-other",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		run: {
			runId: "run-2",
			connId: "conn-1",
			status: "succeeded",
			scheduledAt: "2026-04-21T09:00:00.000Z",
			claimedAt: "2026-04-21T09:00:01.000Z",
			startedAt: "2026-04-21T09:00:02.000Z",
			leaseOwner: "worker-a",
			leaseUntil: "2026-04-21T09:05:00.000Z",
			workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-2",
			resultSummary: "done",
			createdAt: "2026-04-21T09:00:00.000Z",
			updatedAt: "2026-04-21T09:00:30.000Z",
		},
		files: [
			{
				fileId: "file-1",
				runId: "run-2",
				kind: "output",
				relativePath: "output/report.md",
				fileName: "report.md",
				mimeType: "text/markdown",
				sizeBytes: 42,
				createdAt: "2026-04-21T09:00:30.000Z",
				url: "/v1/conns/conn-1/runs/run-2/output/report.md",
				latestUrl: "/v1/conns/conn-1/output/latest/report.md",
			},
		],
	});
	assert.equal(wrongConnResponse.statusCode, 404);
	await app.close();
});

test("GET /v1/conns/:connId/runs/:runId/output/* serves indexed conn output files", async () => {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-conn-output-"));
	const outputDir = join(root, "background", "runs", "run-2", "output");
	await mkdir(outputDir, { recursive: true });
	await writeFile(join(outputDir, "report.html"), "<h1>report</h1>", "utf8");
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {} as never,
		backgroundDataDir: join(root, "background"),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async (runId: string) =>
				runId === "run-2"
					? {
							runId: "run-2",
							connId: "conn-1",
							status: "succeeded",
							scheduledAt: "2026-04-21T09:00:00.000Z",
							workspacePath: join(root, "background", "runs", "run-2"),
							createdAt: "2026-04-21T09:00:00.000Z",
							updatedAt: "2026-04-21T09:00:30.000Z",
						}
					: undefined,
			listEvents: async () => [],
			listFiles: async () => [
				{
					fileId: "file-1",
					runId: "run-2",
					kind: "output",
					relativePath: "output/report.html",
					fileName: "report.html",
					mimeType: "text/html; charset=utf-8",
					sizeBytes: 15,
					createdAt: "2026-04-21T09:00:30.000Z",
				},
			],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs/run-2/output/report.html",
	});
	const downloadResponse = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs/run-2/output/report.html?download=true",
	});
	const traversalResponse = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs/run-2/output/../manifest.json",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] as string, /^text\/html/);
	assert.match(
		response.headers["content-disposition"] ?? "",
		/^inline;\s*filename="report\.html";\s*filename\*=UTF-8''report\.html$/,
	);
	assert.equal(response.body, "<h1>report</h1>");
	assert.match(downloadResponse.headers["content-disposition"] ?? "", /^attachment;/);
	assert.equal(traversalResponse.statusCode, 404);
	await app.close();
});

test("GET /v1/conns/:connId/output/latest/* serves the newest run output matching the path", async () => {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-conn-output-latest-"));
	const oldOutputDir = join(root, "background", "runs", "run-old", "output");
	const newOutputDir = join(root, "background", "runs", "run-new", "output");
	await mkdir(oldOutputDir, { recursive: true });
	await mkdir(newOutputDir, { recursive: true });
	await writeFile(join(oldOutputDir, "zhihu-browse-report.html"), "old", "utf8");
	await writeFile(join(newOutputDir, "zhihu-browse-report.html"), "new", "utf8");
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {} as never,
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [
				{
					runId: "run-new",
					connId: "conn-1",
					status: "succeeded",
					scheduledAt: "2026-04-21T10:00:00.000Z",
					workspacePath: join(root, "background", "runs", "run-new"),
					createdAt: "2026-04-21T10:00:00.000Z",
					updatedAt: "2026-04-21T10:00:30.000Z",
				},
				{
					runId: "run-old",
					connId: "conn-1",
					status: "succeeded",
					scheduledAt: "2026-04-21T09:00:00.000Z",
					workspacePath: join(root, "background", "runs", "run-old"),
					createdAt: "2026-04-21T09:00:00.000Z",
					updatedAt: "2026-04-21T09:00:30.000Z",
				},
			],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async (runId: string) => [
				{
					fileId: `file-${runId}`,
					runId,
					kind: "output",
					relativePath: "output/zhihu-browse-report.html",
					fileName: "zhihu-browse-report.html",
					mimeType: "text/html; charset=utf-8",
					sizeBytes: 3,
					createdAt: "2026-04-21T10:00:30.000Z",
				},
			],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/output/latest/zhihu-browse-report.html",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] as string, /^text\/html/);
	assert.match(response.headers["content-disposition"] ?? "", /^inline;/);
	assert.equal(response.body, "new");
	await app.close();
});

test("GET /v1/conns/:connId/public/* serves only conn public shared files", async () => {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-conn-public-"));
	const publicDir = join(root, "background", "shared", "conn-1", "public");
	await mkdir(publicDir, { recursive: true });
	await writeFile(join(publicDir, "site.html"), "<h1>public</h1>", "utf8");
	await writeFile(join(root, "background", "shared", "conn-1", "secret.txt"), "secret", "utf8");
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {} as never,
		backgroundDataDir: join(root, "background"),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async () => undefined,
			listEvents: async () => [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/public/site.html",
	});
	const traversalResponse = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/public/../secret.txt",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] as string, /^text\/html/);
	assert.match(response.headers["content-disposition"] ?? "", /^inline;/);
	assert.equal(response.body, "<h1>public</h1>");
	assert.equal(traversalResponse.statusCode, 404);
	await app.close();
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

test("GET /v1/conns/:connId/runs/:runId/events returns ordered run events", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		connStore: {
			list: async () => [],
			get: async (connId: string) =>
				connId === "conn-1"
					? {
							connId: "conn-1",
							title: "digest",
							prompt: "summarize",
							target: { type: "conversation", conversationId: "manual:digest" },
							schedule: { kind: "interval", everyMs: 60000 },
							assetRefs: [],
							status: "active",
							createdAt: "2026-04-18T00:00:00.000Z",
							updatedAt: "2026-04-18T00:00:00.000Z",
						}
					: undefined,
			create: async () => {
				throw new Error("not used");
			},
			update: async () => undefined,
			delete: async () => false,
			pause: async () => undefined,
			resume: async () => undefined,
		} as never,
		connRunStore: {
			createRun: async () => {
				throw new Error("not used");
			},
			listRunsForConn: async () => [],
			getRun: async (runId: string) =>
				runId === "run-2"
					? {
							runId: "run-2",
							connId: "conn-1",
							status: "running",
							scheduledAt: "2026-04-21T09:00:00.000Z",
							workspacePath: "E:/AII/ugk-pi/.data/agent/background/runs/run-2",
							createdAt: "2026-04-21T09:00:00.000Z",
							updatedAt: "2026-04-21T09:00:01.000Z",
						}
					: undefined,
			listEvents: async (runId: string) =>
				runId === "run-2"
					? [
							{
								eventId: "event-1",
								runId: "run-2",
								seq: 1,
								eventType: "workspace_created",
								event: { rootPath: "E:/AII/ugk-pi/.data/agent/background/runs/run-2" },
								createdAt: "2026-04-21T09:00:01.000Z",
							},
						]
					: [],
			listFiles: async () => [],
			getUnreadCountsByConn: async () => ({}),
			getTotalUnreadCount: async () => 0,
			markRunRead: async () => true,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/conns/conn-1/runs/run-2/events",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		events: [
			{
				eventId: "event-1",
				runId: "run-2",
				seq: 1,
				eventType: "workspace_created",
				event: { rootPath: "E:/AII/ugk-pi/.data/agent/background/runs/run-2" },
				createdAt: "2026-04-21T09:00:01.000Z",
			},
		],
		hasMore: false,
		limit: 2,
	});
	await app.close();
});

test("POST /v1/integrations/feishu/events is not registered on the main server", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/integrations/feishu/events",
		payload: {
			type: "url_verification",
			challenge: "challenge-token",
		},
	});

	assert.equal(response.statusCode, 404);
	await app.close();
});

test("PUT /v1/integrations/feishu/settings stores dynamic app credentials without echoing the secret", async () => {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-feishu-route-"));
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		feishuSettingsStore: new FeishuSettingsStore({
			settingsPath: join(root, "settings.json"),
			env: {},
		}),
	});

	const putResponse = await app.inject({
		method: "PUT",
		url: "/v1/integrations/feishu/settings",
		payload: {
			enabled: true,
			appId: "cli_dynamic",
			appSecret: "secret",
			allowedChatIds: ["oc_chat"],
			activityTargets: [{ type: "feishu_user", openId: "ou_user" }],
		},
	});
	assert.equal(putResponse.statusCode, 200);
	const putBody = putResponse.json();
	assert.equal(putBody.enabled, true);
	assert.equal(putBody.appId, "cli_dynamic");
	assert.equal(putBody.hasAppSecret, true);
	assert.equal("appSecret" in putBody, false);

	const getResponse = await app.inject({
		method: "GET",
		url: "/v1/integrations/feishu/settings",
	});
	assert.equal(getResponse.statusCode, 200);
	assert.deepEqual(getResponse.json().activityTargets, [{ type: "feishu_user", openId: "ou_user" }]);
	await app.close();
});

test("PUT /v1/integrations/feishu/settings rejects credentials with whitespace", async () => {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-feishu-route-"));
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		feishuSettingsStore: new FeishuSettingsStore({
			settingsPath: join(root, "settings.json"),
			env: {},
		}),
	});

	const response = await app.inject({
		method: "PUT",
		url: "/v1/integrations/feishu/settings",
		payload: {
			enabled: true,
			appId: "cli_bad value",
			appSecret: "secret",
		},
	});

	assert.equal(response.statusCode, 400);
	assert.match(response.json().error.message, /appId must not contain whitespace/);
	await app.close();
});

test("renderPlaygroundMarkdown renders safe markdown html for transcript messages", () => {
	const html = renderPlaygroundMarkdown(
		[
			"# Title",
			"",
			"- one",
			"- two",
			"",
			"**bold** and `code` and [link](https://example.com)",
			"",
			"> quote",
			"",
			"```ts",
			"const value = 1 < 2;",
			"```",
			"",
			"<script>alert(1)</script>",
		].join("\n"),
	);

	assert.match(html, /<h1>Title<\/h1>/);
	assert.match(html, /<ul>\s*<li>one<\/li>\s*<li>two<\/li>\s*<\/ul>/);
	assert.match(html, /<strong>bold<\/strong>/);
	assert.match(html, /<code>code<\/code>/);
	assert.match(html, /<a href="https:\/\/example\.com" target="_blank" rel="noreferrer noopener">link<\/a>/);
	assert.match(html, /<blockquote>\s*<p>quote<\/p>\s*<\/blockquote>/);
	assert.match(html, /<pre><code class="language-ts">const value = 1 &lt; 2;\s*<\/code><\/pre>/);
	assert.doesNotMatch(html, /<script>/);
	assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("renderPlaygroundMarkdown keeps fenced code blocks visible when preceded by plain text", () => {
	const html = renderPlaygroundMarkdown(["闂佺懓鐏堥崑鎾绘煠瀹曞洦娅曠紒顔哄姂瀵悂宕熼崜浣虹崶", "```json", '{ "name": "web-access" }', "```"].join("\n"));

	assert.match(html, /<p>闂佺懓鐏堥崑鎾绘煠瀹曞洦娅曠紒顔哄姂瀵悂宕熼崜浣虹崶<\/p>/);
	assert.match(html, /<pre><code class="language-json">\{ &quot;name&quot;: &quot;web-access&quot; \}\s*<\/code><\/pre>/);
	assert.doesNotMatch(html, /CODEBLOCK0/);
});

test("renderPlaygroundMarkdown renders pipe tables as html tables", () => {
	const html = renderPlaygroundMarkdown(
		[
			"???? Markdown ?????",
			"",
			"| ?? | ?? NoSuchMethodError?|",
			"|------|------------------------|",
			"| catch (Exception e) | 闂?婵犵數濮烽弫鍛婃叏閻戣棄鏋侀柟闂寸绾惧鏌ｉ幇顒佹儓闁搞劌鍊块弻娑㈩敃閿濆棛顦ョ紓浣哄С閸楁娊寮诲☉妯锋斀闁告洦鍋勬慨銏ゆ⒑濞茶骞楅柟鐟版喘瀵鏁愭径濠勵吅闂佹寧绻傚Λ顓炍涢崟顓犵＝濞达絾褰冩禍?|",
			"| catch (Error e) | 闂?闂傚倸鍊搁崐鎼佸磹閹间礁纾圭€瑰嫭鍣磋ぐ鎺戠倞闁靛ě鍛獎闂備礁澹婇崑鍛紦妤ｅ啫鍑犵€广儱顦伴悡娑㈡煕閵夛絽鍔氶柣蹇婃櫊閺屾盯骞嬮悩娴嬫瀰闂佸搫琚崐鏍箞閵娾晛绠涙い鎴ｆ娴滈箖鏌″搴″伎缂傚秵鐗犻弻锟犲炊閳轰焦鐏佺紓浣叉閸嬫捇姊婚崒姘偓鎼佹偋婵犲嫮鐭欓柟鐑樻尭缁剁偤鏌涢弴銊ヤ簮闁衡偓閼恒儯浜滈柡宥冨妿閳洟鎮樿箛銉х暤闁哄矉绱曟禒锕傚礈瑜庨崚娑㈡⒑缁洘娅呴悗姘緲閻ｅ嘲顫滈埀顒勫春閿熺姴绀冮柣鎰靛劮閵堝鈷掗柛灞剧懄缁佹壆鈧娲滈弫璇茬暦娴兼潙绠涙い鏃囨鎼村﹪姊洪崜鎻掍簴闁稿酣浜堕幏鎴︽偄閸忚偐鍘介梺鍝勫暙閸婂摜鏁崜浣虹＜闁绘ê鍟垮ù顕€鏌″畝鈧崰鏍箖濠婂吘鐔兼惞闁稒妯婂┑锛勫亼閸娿倝宕戦崟顖氱疇婵せ鍋撴鐐插暙铻栭柛鎰ㄦ櫅閺嬪倿姊洪崨濠冨闁告挻鐩棟闁靛ň鏅滈埛鎴︽煙缁嬪灝顒㈢痪鐐倐閺屾盯濡搁妷褏楔闂佽鍣ｇ粻鏍箖濠婂牊鍤嶉柕澶涢檮椤忕喖姊绘担铏瑰笡閽冭京鎲搁弶鍨殭闁伙絿鏁诲畷鍗炩槈濞嗗本瀚肩紓鍌氬€烽悞锕傚煟閵堝鏁傞柛鏇炴捣閸犳劗鎹㈠┑瀣妞ゅ繐绉电粊顐⑩攽鎺抽崐褏寰婃禒瀣柈妞ゆ牜鍋涢悡?|",
			"| catch (Throwable t) | 闂?闂傚倸鍊搁崐鎼佸磹閹间礁纾圭€瑰嫭鍣磋ぐ鎺戠倞闁靛ě鍛獎闂備礁澹婇崑鍛紦妤ｅ啫鍑犵€广儱顦伴悡娑㈡煕閵夛絽鍔氶柣蹇婃櫊閺屾盯骞嬮悩娴嬫瀰闂佸搫琚崐鏍箞閵娾晛绠涙い鎴ｆ娴滈箖鏌″搴″伎缂傚秵鐗犻弻锟犲炊閳轰焦鐏佺紓浣叉閸嬫捇姊婚崒姘偓鎼佹偋婵犲啰鐟规俊銈呮噹绾惧潡鐓崶銊︾缁炬儳銈搁弻锝呂熼崫鍕瘣闂佸磭绮ú鐔煎蓟閿涘嫪娌柣鎰靛墰椤︺劎绱撴担铏瑰笡闁烩晩鍨伴悾鐤亹閹烘繃鏅╃紒鐐娴滎剟鍩€椤掆偓绾绢厾妲愰幘璇茬＜婵炲棙甯╅崬褰掓⒑?|",
			"| catch (NoSuchMethodError e) | 闂?闂傚倸鍊搁崐鎼佸磹閹间礁纾圭€瑰嫭鍣磋ぐ鎺戠倞闁靛ě鍛獎闂備礁澹婇崑鍛紦妤ｅ啫鍑犵€广儱顦伴悡娑㈡煕閵夛絽鍔氶柣蹇婃櫊閺屾盯骞嬮悩娴嬫瀰闂佸搫琚崐鏍箞閵娾晛绠涙い鎴ｆ娴滈箖鏌″搴″伎缂傚秵鐗犻弻锟犲炊閳轰焦鐏佺紓浣叉閸嬫捇姊婚崒姘偓鎼佹偋婵犲嫮鐭欓柟鐑樻尭缁剁偤鏌涢弴銊ヤ簮闁衡偓閼恒儯浜滈柡宥冨妿閳洟鎮樿箛銉х暤闁哄矉绱曟禒锕傚礈瑜庨崚娑㈡⒑缁洘娅呴悗姘緲閻ｅ嘲顫滈埀顒勫极閸屾粍宕夐柕濞垮€楅悷婵嗏攽閻樺灚鏆╅柛瀣洴閹椽濡歌閸ㄦ繈鏌涢鐘插姎缁绢厸鍋撻梻浣筋潐閸庣厧螞閸曨垱瀚呴柣鏂挎憸缁犻箖鏌熺€电浠ч柣顓炵焸閺岋綁濡堕崒姘婵犵數濮甸鏍窗濡ゅ懏鏅濋柍鍝勬噹閻鏌嶈閸撶喖寮诲☉姗嗘僵妞ゆ巻鍋撻柍褜鍓濆畷闈浳?|",
			"",
			"---",
		].join("\n"),
	);

	assert.match(html, /<p>.*Markdown.*<\/p>/);
	assert.match(html, /<table>/);
	assert.match(html, /<thead>\s*<tr>\s*<th>.*<\/th>\s*<th>.*NoSuchMethodError.*<\/th>\s*<\/tr>\s*<\/thead>/);
	assert.match(html, /<tbody>/);
	assert.match(html, /<td>catch \(Throwable t\)<\/td>\s*<td>.*<\/td>/);
	assert.match(html, /<hr>/);
	assert.doesNotMatch(html, /\|------\|/);
});

test("POST /v1/chat returns aggregated chat response", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat",
		payload: {
			conversationId: "manual:test-2",
			message: "hello",
			userId: "u-001",
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:test-2",
		text: "echo:hello",
		sessionFile: "E:/sessions/test.jsonl",
	});
	await app.close();
});

test("POST /v1/chat passes uploaded file attachments to the agent service", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			chat: async (input) => {
				calls.push(input);
				return {
					conversationId: input.conversationId ?? "manual:file-input",
					text: "ok",
					sessionFile: "E:/sessions/test.jsonl",
				};
			},
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat",
		payload: {
			conversationId: "manual:file-input",
			message: "inspect attached file",
			attachments: [
				{
					fileName: "brief.txt",
					mimeType: "text/plain",
					sizeBytes: 11,
					text: "hello file",
				},
			],
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(calls, [
		{
			conversationId: "manual:file-input",
			message: "inspect attached file",
			userId: undefined,
			attachments: [
				{
					base64: undefined,
					fileName: "brief.txt",
					mimeType: "text/plain",
					sizeBytes: 11,
					text: "hello file",
				},
			],
		},
	]);
	await app.close();
});

test("POST /v1/chat passes reusable asset references to the agent service", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			chat: async (input) => {
				calls.push(input);
				return {
					conversationId: input.conversationId ?? "manual:asset-ref",
					text: "ok",
					sessionFile: "E:/sessions/test.jsonl",
				};
			},
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat",
		payload: {
			conversationId: "manual:asset-ref",
			message: "reuse it",
			assetRefs: ["asset-1", "asset-2"],
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(calls, [
		{
			conversationId: "manual:asset-ref",
			message: "reuse it",
			userId: undefined,
			assetRefs: ["asset-1", "asset-2"],
		},
	]);
	await app.close();
});

test("GET /v1/debug/skills returns the runtime skill registry", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/debug/skills",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		skills: [
			{ name: "using-superpowers", path: "E:/AII/ugk-pi/.pi/skills/superpowers/using-superpowers/SKILL.md" },
			{ name: "web-access", path: "E:/AII/ugk-pi/runtime/skills-user/web-access/SKILL.md" },
		],
		source: "cache",
		cachedAt: "2026-04-24T00:00:00.000Z",
	});
	await app.close();
});

test("GET /v1/debug/runtime is registered on the main server", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/debug/runtime",
	});

	assert.equal(response.statusCode, 200);
	const body = response.json();
	assert.equal(typeof body.ok, "boolean");
	assert.ok(Array.isArray(body.checks));
	assert.ok(body.checks.some((check: { name?: string }) => check.name === "agent data dir"));
	assert.ok(body.checks.some((check: { name?: string }) => check.name === "agents data dir"));
	assert.equal(typeof body.config, "object");
	assert.doesNotMatch(response.body, /API_KEY|SECRET|ANTHROPIC_AUTH_TOKEN/i);
	await app.close();
});

test("GET /v1/debug/cleanup is registered on the main server", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/debug/cleanup",
	});

	assert.equal(response.statusCode, 200);
	const body = response.json();
	assert.equal(typeof body.ok, "boolean");
	assert.equal(typeof body.connTargets.total, "number");
	assert.equal(typeof body.legacyConversationNotifications.total, "number");
	assert.equal(body.recentRuns.windowDays, 7);
	assert.ok(Array.isArray(body.risks));
	assert.doesNotMatch(response.body, /API_KEY|SECRET|ANTHROPIC_AUTH_TOKEN/i);
	await app.close();
});

test("GET /v1/model-config returns current provider and selectable models", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		modelConfigStore: createModelConfigStoreStub(),
		modelSelectionValidator: async () => ({ ok: true }),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/model-config",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		current: {
			provider: "zhipu-glm",
			model: "glm-5.1",
		},
		providers: [
			{
				id: "zhipu-glm",
				name: "Zhipu GLM",
				vendor: "zhipu",
				region: "cn",
				priority: 10,
				models: [{ id: "glm-5.1", name: "GLM-5.1" }],
				auth: {
					configured: true,
					envVar: "ZHIPU_GLM_API_KEY",
					source: "environment",
				},
			},
			{
				id: "deepseek",
				name: "DeepSeek",
				vendor: "deepseek",
				region: "global",
				priority: 20,
				models: [
					{ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: 1000000, maxTokens: 384000 },
					{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 1000000, maxTokens: 384000 },
				],
				auth: {
					configured: true,
					envVar: "DEEPSEEK_API_KEY",
					source: "environment",
				},
			},
			{
				id: "xiaomi-mimo-cn",
				models: [
					{ id: "mimo-v2.5-pro", name: "MiMo V2.5 Pro (Xiaomi CN)", contextWindow: 1048576, maxTokens: 16384 },
				],
				name: "Xiaomi MiMo China",
				vendor: "xiaomi",
				region: "cn",
				priority: 31,
				auth: {
					configured: true,
					envVar: "XIAOMI_MIMO_API_KEY",
					source: "environment",
				},
			},
		],
	});
	await app.close();
});

test("PUT /v1/model-config/default validates before switching default model", async () => {
	const calls: ModelConfigSelection[] = [];
	const validator: ModelSelectionValidator = async (selection) => {
		calls.push(selection);
		return { ok: true };
	};
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		modelConfigStore: createModelConfigStoreStub(),
		modelSelectionValidator: validator,
	});

	const response = await app.inject({
		method: "PUT",
		url: "/v1/model-config/default",
		payload: {
			provider: "deepseek",
			model: "deepseek-v4-pro",
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(calls, [{ provider: "deepseek", model: "deepseek-v4-pro" }]);
	assert.deepEqual(response.json(), {
		ok: true,
		current: {
			provider: "deepseek",
			model: "deepseek-v4-pro",
		},
		effective: "new_sessions",
	});
	await app.close();
});

test("PUT /v1/model-config/default does not switch when validation fails", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		modelConfigStore: createModelConfigStoreStub(),
		modelSelectionValidator: async () => ({
			ok: false,
			code: "provider_validation_failed",
			message: "provider failed",
		}),
	});

	const response = await app.inject({
		method: "PUT",
		url: "/v1/model-config/default",
		payload: {
			provider: "deepseek",
			model: "deepseek-v4-pro",
		},
	});

	assert.equal(response.statusCode, 400);
	assert.deepEqual(response.json(), {
		error: {
			code: "PROVIDER_VALIDATION_FAILED",
			message: "provider failed",
		},
	});
	const configResponse = await app.inject({
		method: "GET",
		url: "/v1/model-config",
	});
	assert.equal(configResponse.json().current.provider, "zhipu-glm");
	assert.equal(configResponse.json().current.model, "glm-5.1");
	await app.close();
});

test("GET /v1/chat/status returns whether the conversation is currently running", async () => {
	const calls: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			getRunStatus: async (conversationId) => {
				calls.push(conversationId);
				return {
					conversationId,
					running: true,
					contextUsage: {
						provider: "zhipu-glm",
						model: "glm-5.1",
						currentTokens: 45231,
						contextWindow: 128000,
						reserveTokens: 16384,
						maxResponseTokens: 16384,
						availableTokens: 66385,
						percent: 35,
						status: "safe",
						mode: "estimate",
					},
				};
			},
		}),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/chat/status?conversationId=manual:refresh-run",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:refresh-run",
		running: true,
		contextUsage: {
			provider: "zhipu-glm",
			model: "glm-5.1",
			currentTokens: 45231,
			contextWindow: 128000,
			reserveTokens: 16384,
			maxResponseTokens: 16384,
			availableTokens: 66385,
			percent: 35,
			status: "safe",
			mode: "estimate",
		},
	});
	assert.deepEqual(calls, ["manual:refresh-run"]);
	await app.close();
});

test("GET /v1/chat/events resumes after an active run event cursor", async () => {
	const calls: Array<{ conversationId: string; afterEventCursor?: number }> = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			subscribeRunEvents: (conversationId, onEvent, options) => {
				calls.push({ conversationId, afterEventCursor: options?.afterEventCursor });
				onEvent({
					type: "text_delta",
					textDelta: "live",
				});
				onEvent({
					type: "done",
					conversationId,
					runId: "run-events",
					text: "live",
				});
				return {
					conversationId,
					running: true,
					unsubscribe: () => undefined,
				};
			},
		}),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/chat/events?conversationId=manual:events&afterEventCursor=7",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /"textDelta":"live"/);
	assert.deepEqual(calls, [{ conversationId: "manual:events", afterEventCursor: 7 }]);
	await app.close();
});

test("GET /v1/chat/events attaches to the current active run event stream", async () => {
	const calls: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			subscribeRunEvents: (conversationId, onEvent) => {
				calls.push(conversationId);
				onEvent({
					type: "run_started",
					conversationId,
				});
				onEvent({
					type: "text_delta",
					textDelta: "after refresh",
				});
				onEvent({
					type: "done",
					conversationId,
					text: "after refresh",
					sessionFile: "E:/sessions/events.jsonl",
				});
				return {
					conversationId,
					running: true,
					unsubscribe: () => {
						calls.push("unsubscribed");
					},
				};
			},
		}),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/chat/events?conversationId=manual:events",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/event-stream/);
	assert.match(response.body, /"type":"run_started"/);
	assert.match(response.body, /"type":"text_delta"/);
	assert.match(response.body, /"type":"done"/);
	assert.deepEqual(calls, ["manual:events", "unsubscribed"]);
	await app.close();
});

test("GET /v1/chat/runs/:runId/events returns buffered chat run events", async () => {
	const calls: Array<{ conversationId: string; runId: string }> = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			getRunEvents: async (conversationId, runId) => {
				calls.push({ conversationId, runId });
				return [
					{
						type: "run_started",
						conversationId,
					},
					{
						type: "text_delta",
						textDelta: "ignored incremental body",
					},
					{
						type: "heartbeat",
						phase: "reasoning",
					},
					{
						type: "tool_started",
						toolCallId: "tool-1",
						toolName: "weather",
						args: '{"city":"Shanghai"}',
					},
					{
						type: "done",
						conversationId,
						text: "sunny",
					},
				];
			},
		}),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/chat/runs/run-chat-1/events?conversationId=manual:events",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:events",
		runId: "run-chat-1",
		events: [
			{
				type: "done",
				conversationId: "manual:events",
				text: "sunny",
			},
			{
				type: "tool_started",
				toolCallId: "tool-1",
				toolName: "weather",
				args: '{"city":"Shanghai"}',
			},
		],
		hasMore: true,
		nextBefore: "1",
		limit: 2,
	});
	assert.deepEqual(calls, [{ conversationId: "manual:events", runId: "run-chat-1" }]);
	await app.close();
});

test("GET /v1/activity returns global activity items newest-first", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {
			list: async (options?: unknown) => {
				calls.push(options);
				return [
					{
						activityId: "activity-new",
						scope: "agent",
						source: "conn",
						sourceId: "conn-2",
						runId: "run-2",
						conversationId: "manual:two",
						kind: "conn_result",
						title: "New completed",
						text: "new text",
						files: [],
						createdAt: "2026-04-22T10:03:00.000Z",
					},
					{
						activityId: "activity-old",
						scope: "agent",
						source: "conn",
						sourceId: "conn-1",
						runId: "run-1",
						conversationId: "manual:one",
						kind: "conn_result",
						title: "Old completed",
						text: "old text",
						files: [
							{
								fileName: "report.md",
								downloadUrl: "/v1/files/file-1",
							},
						],
						createdAt: "2026-04-22T10:01:00.000Z",
					},
				];
			},
			get: async () => undefined,
			markRead: async () => false,
			getUnreadCount: async () => 2,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/activity",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(calls, [{ limit: 51 }]);
	assert.deepEqual(response.json(), {
		activities: [
			{
				activityId: "activity-new",
				scope: "agent",
				source: "conn",
				sourceId: "conn-2",
				runId: "run-2",
				conversationId: "manual:two",
				kind: "conn_result",
				title: "New completed",
				text: "new text",
				files: [],
				createdAt: "2026-04-22T10:03:00.000Z",
			},
			{
				activityId: "activity-old",
				scope: "agent",
				source: "conn",
				sourceId: "conn-1",
				runId: "run-1",
				conversationId: "manual:one",
				kind: "conn_result",
				title: "Old completed",
				text: "old text",
				files: [
					{
						fileName: "report.md",
						downloadUrl: "/v1/files/file-1",
					},
				],
				createdAt: "2026-04-22T10:01:00.000Z",
			},
		],
		hasMore: false,
		unreadCount: 2,
	});
	await app.close();
});

test("GET /v1/activity/summary returns unread counts for the task inbox", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {
			get: async () => undefined,
			list: async () => [],
			markRead: async () => false,
			getUnreadCount: async () => 7,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/activity/summary",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		unreadCount: 7,
	});
	await app.close();
});

test("GET /v1/activity supports conversation filters and limits", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {
			list: async (options?: unknown) => {
				calls.push(options);
				return [];
			},
			get: async () => undefined,
			markRead: async () => false,
			getUnreadCount: async () => 3,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/activity?conversationId=manual%3Aone&limit=2&unreadOnly=true&before=2026-04-22T10%3A02%3A00.000Z",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), { activities: [], hasMore: false, unreadCount: 3 });
	assert.deepEqual(calls, [
		{
			limit: 3,
			conversationId: "manual:one",
			before: "2026-04-22T10:02:00.000Z",
			unreadOnly: true,
		},
	]);
	await app.close();
});

test("GET /v1/activity returns pagination metadata when another task inbox page exists", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {
			list: async (options?: unknown) => {
				calls.push(options);
				return [
					{
						activityId: "activity-new",
						scope: "agent",
						source: "conn",
						sourceId: "conn-2",
						runId: "run-2",
						conversationId: "manual:two",
						kind: "conn_result",
						title: "New completed",
						text: "new text",
						files: [],
						createdAt: "2026-04-22T10:03:00.000Z",
					},
					{
						activityId: "activity-middle",
						scope: "agent",
						source: "conn",
						sourceId: "conn-3",
						runId: "run-3",
						conversationId: "manual:one",
						kind: "conn_result",
						title: "Middle completed",
						text: "middle text",
						files: [],
						createdAt: "2026-04-22T10:02:00.000Z",
					},
					{
						activityId: "activity-old",
						scope: "agent",
						source: "conn",
						sourceId: "conn-1",
						runId: "run-1",
						conversationId: "manual:one",
						kind: "conn_result",
						title: "Old completed",
						text: "old text",
						files: [],
						createdAt: "2026-04-22T10:01:00.000Z",
					},
				];
			},
			get: async () => undefined,
			markRead: async () => false,
			getUnreadCount: async () => 2,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/activity?limit=2&unreadOnly=true",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(calls, [{ limit: 3, unreadOnly: true }]);
	assert.deepEqual(response.json(), {
		activities: [
			{
				activityId: "activity-new",
				scope: "agent",
				source: "conn",
				sourceId: "conn-2",
				runId: "run-2",
				conversationId: "manual:two",
				kind: "conn_result",
				title: "New completed",
				text: "new text",
				files: [],
				createdAt: "2026-04-22T10:03:00.000Z",
			},
			{
				activityId: "activity-middle",
				scope: "agent",
				source: "conn",
				sourceId: "conn-3",
				runId: "run-3",
				conversationId: "manual:one",
				kind: "conn_result",
				title: "Middle completed",
				text: "middle text",
				files: [],
				createdAt: "2026-04-22T10:02:00.000Z",
			},
		],
		hasMore: true,
		nextBefore: "2026-04-22T10:02:00.000Z|activity-middle",
		unreadCount: 2,
	});
	await app.close();
});

test("GET /v1/activity rejects invalid limits", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {
			list: async () => [],
			get: async () => undefined,
			markRead: async () => false,
		} as never,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/activity?limit=nope",
	});

	assert.equal(response.statusCode, 400);
	assert.match(response.body, /limit/);
	await app.close();
});

test("POST /v1/activity/:activityId/read marks an activity item read", async () => {
	const calls: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {
			list: async () => [],
			markRead: async (activityId: string) => {
				calls.push(activityId);
				return true;
			},
			get: async (activityId: string) => ({
				activityId,
				scope: "agent",
				source: "conn",
				sourceId: "conn-1",
				runId: "run-1",
				conversationId: "manual:one",
				kind: "conn_result",
				title: "Read me",
				text: "done",
				files: [],
				createdAt: "2026-04-22T10:01:00.000Z",
				readAt: "2026-04-22T10:03:00.000Z",
			}),
			getUnreadCount: async () => 4,
		} as never,
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/activity/activity-1/read",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(calls, ["activity-1"]);
	assert.deepEqual(response.json(), {
		activity: {
			activityId: "activity-1",
			scope: "agent",
			source: "conn",
			sourceId: "conn-1",
			runId: "run-1",
			conversationId: "manual:one",
			kind: "conn_result",
			title: "Read me",
			text: "done",
			files: [],
			createdAt: "2026-04-22T10:01:00.000Z",
			readAt: "2026-04-22T10:03:00.000Z",
		},
		unreadCount: 4,
	});
	await app.close();
});

test("POST /v1/activity/read-all marks all task inbox items as read", async () => {
	const calls: string[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		activityStore: {
			list: async () => [],
			get: async () => undefined,
			markRead: async () => false,
			getUnreadCount: async () => 0,
			markAllRead: async () => {
				calls.push("all");
				return 5;
			},
		} as never,
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/activity/read-all",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(calls, ["all"]);
	assert.deepEqual(response.json(), {
		markedCount: 5,
		unreadCount: 0,
	});
	await app.close();
});

test("POST /v1/internal/notifications/broadcast publishes a notification event to the hub", async () => {
	const hub = new NotificationHub();
	const events: unknown[] = [];
	const subscription = hub.subscribe((event) => {
		events.push(event);
	});
	const app = await buildServer({
		agentService: createAgentServiceStub(),
		notificationHub: hub,
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/internal/notifications/broadcast",
		payload: {
			notificationId: "notice-1",
			conversationId: "manual:notice",
			source: "conn",
			sourceId: "conn-1",
			runId: "run-1",
			kind: "conn_result",
			title: "Daily Digest completed",
			createdAt: "2026-04-21T10:01:05.000Z",
		},
	});

	assert.equal(response.statusCode, 202);
	assert.deepEqual(response.json(), { ok: true });
	assert.deepEqual(events, [
		{
			notificationId: "notice-1",
			conversationId: "manual:notice",
			source: "conn",
			sourceId: "conn-1",
			runId: "run-1",
			kind: "conn_result",
			title: "Daily Digest completed",
			createdAt: "2026-04-21T10:01:05.000Z",
		},
	]);

	subscription.unsubscribe();
	await app.close();
});

test("POST /v1/chat/stream returns server-sent events for the agent run", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat/stream",
		payload: {
			conversationId: "manual:test-stream",
			message: "????",
			userId: "u-002",
		},
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/event-stream/);
	assert.match(response.body, /"type":"run_started"/);
	assert.match(response.body, /"type":"tool_started"/);
	assert.match(response.body, /"type":"text_delta"/);
	assert.match(response.body, /"type":"done"/);
	await app.close();
});

test("POST /v1/chat/queue queues a steer message for an active run", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			queueMessage: async (input) => {
				calls.push(input);
				return {
					conversationId: input.conversationId,
					mode: input.mode,
					queued: true,
				};
			},
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat/queue",
		payload: {
			conversationId: "manual:queue",
			message: "steer",
			mode: "steer",
			userId: "u-queue",
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:queue",
		mode: "steer",
		queued: true,
	});
	assert.deepEqual(calls, [
		{
			conversationId: "manual:queue",
			message: "steer",
			mode: "steer",
			userId: "u-queue",
		},
	]);
	await app.close();
});

test("POST /v1/chat/interrupt interrupts an active run", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			interruptChat: async (input) => {
				calls.push(input);
				return {
					conversationId: input.conversationId,
					interrupted: true,
				};
			},
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat/interrupt",
		payload: {
			conversationId: "manual:interrupt",
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "manual:interrupt",
		interrupted: true,
	});
	assert.deepEqual(calls, [{ conversationId: "manual:interrupt" }]);
	await app.close();
});

test("POST /v1/chat/reset clears the canonical conversation state", async () => {
	const calls: unknown[] = [];
	const app = await buildServer({
		agentService: createAgentServiceStub({
			resetConversation: async (input) => {
				calls.push(input);
				return {
					conversationId: input.conversationId,
					reset: true,
				};
			},
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat/reset",
		payload: {
			conversationId: "agent:global",
		},
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		conversationId: "agent:global",
		reset: true,
	});
	assert.deepEqual(calls, [{ conversationId: "agent:global" }]);
	await app.close();
});

test("POST /v1/chat returns 400 when message is missing", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat",
		payload: {
			conversationId: "manual:test-3",
		},
	});

	assert.equal(response.statusCode, 400);
	assert.deepEqual(response.json(), {
		error: {
			code: "BAD_REQUEST",
			message: "Field \"message\" must be a non-empty string",
		},
	});
	await app.close();
});

test("POST /v1/chat/stream returns 400 when message is missing", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat/stream",
		payload: {
			conversationId: "manual:test-stream-400",
		},
	});

	assert.equal(response.statusCode, 400);
	assert.deepEqual(response.json(), {
		error: {
			code: "BAD_REQUEST",
			message: "Field \"message\" must be a non-empty string",
		},
	});
	await app.close();
});

test("POST /v1/chat returns 500 when agent service throws", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub({
			chat: async () => {
				throw new Error("boom");
			},
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat",
		payload: {
			conversationId: "manual:test-4",
			message: "trigger error",
		},
	});

	assert.equal(response.statusCode, 500);
	assert.deepEqual(response.json(), {
		error: {
			code: "INTERNAL_ERROR",
			message: "boom",
		},
	});
	await app.close();
});

test("POST /v1/chat returns 409 when the main agent is busy", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub({
			chat: async () => {
				throw new AgentBusyError("main", "manual:active");
			},
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat",
		payload: {
			conversationId: "manual:test-busy",
			message: "trigger busy",
		},
	});

	assert.equal(response.statusCode, 409);
	assert.equal(response.json().error.code, "AGENT_BUSY");
	assert.equal(response.json().error.message, "Agent main is currently busy");
	assert.equal(response.json().error.agentId, "main");
	assert.equal(response.json().error.activeConversationId, "manual:active");
	assert.ok(Array.isArray(response.json().error.suggestedAgents));
	await app.close();
});

test("POST /v1/chat/stream returns 409 before SSE hijack when the main agent is busy", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub({
			getAgentRunStatus: () => ({
				agentId: "main",
				status: "busy",
				activeConversationId: "manual:active",
				activeSince: "2026-05-09T00:00:00.000Z",
			}),
		}),
	});

	const response = await app.inject({
		method: "POST",
		url: "/v1/chat/stream",
		payload: {
			conversationId: "manual:test-busy-stream",
			message: "trigger busy",
		},
	});

	assert.equal(response.statusCode, 409);
	assert.equal(response.json().error.code, "AGENT_BUSY");
	assert.equal(response.json().error.agentId, "main");
	assert.equal(response.json().error.activeConversationId, "manual:active");
	await app.close();
});

test("GET /playground/team includes run detail mindmap view shell", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/team",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/html/);
	assert.match(response.body, /class="topbar-back" href="\/playground\?view=chat" title="返回对话" aria-label="返回对话"/);
	assert.match(response.body, /function renderPlanTeamPanel\(plan\)/);
	assert.match(response.body, /id="plan-detail-team-select"/);
	assert.match(response.body, /\/plans\/' \+ pathSegment\(planId\) \+ '\/default-team/);
	assert.match(response.body, /function editPlanDetailTeam\(teamUnitId\)/);

	// View state for per-run mindmap/detail switch
	assert.match(response.body, /_runDetailViewByRunId/);
	assert.match(response.body, /function getRunDetailView/);
	assert.match(response.body, /function setRunDetailView/);

	// Shell function that wraps both views
	assert.match(response.body, /function renderRunDetailShell/);

	// Mindmap placeholder function
	assert.match(response.body, /function renderTeamMindmap/);

	// Segmented switch labels
	assert.match(response.body, /脑图/);
	assert.match(response.body, /详情/);

	// Switch uses data attribute for stable CSS targeting
	assert.match(response.body, /data-run-detail-view="mindmap"/);
	assert.match(response.body, /data-run-detail-view="detail"/);

	// Old detail renderer still exists and is reachable from shell
	assert.match(response.body, /function renderTaskDetail/);

	// toggleRunDetail and updateRunCard render through the shell, not directly
	assert.match(response.body, /detailEl\.innerHTML\s*=\s*renderRunDetailShell\(/);
	assert.match(response.body, /var newHtml\s*=\s*renderRunDetailShell\(/);

	await app.close();
});

test("GET /playground/team caches run state for safe detail view switching", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/team",
	});

	assert.equal(response.statusCode, 200);

	assert.match(response.body, /var _planCache = \{\};/);
	assert.match(response.body, /function buildFallbackPlanFromRunState\(state\)/);
	assert.match(response.body, /原计划定义不可用，当前详情按 run 状态展示。/);
	assert.match(response.body, /loadAgents\(\)\.then\(async function\(\)/);
	assert.match(response.body, /await loadPlans\(\)/);

	// Full run-state cache exists
	assert.match(response.body, /window\._latestRunStateForRun/);

	// toggleRunDetail stores the complete fetched state into the cache
	assert.match(response.body, /window\._latestRunStateForRun\[runId\]\s*=\s*state/);

	// switchRunDetailView reads from cache, not from a bare { runId } object
	assert.match(response.body, /var state = window\._latestRunStateForRun\s*\?\s*window\._latestRunStateForRun\[runId\]/);

	// Fallback includes taskStates so renderTaskDetail does not throw
	assert.match(response.body, /taskStates:\s*\{\}/);

	// onclick uses jsArg for runId and view names (not escapeHtml string concatenation)
	assert.match(response.body, /jsArg\(runId\)/);
	assert.match(response.body, /jsArg\('mindmap'\)/);
	assert.match(response.body, /jsArg\('detail'\)/);

	// updateRunCard preserves cached state by reading from _latestRunStateForRun
	assert.match(
		response.body,
		/window\._latestRunStateForRun\[r\.runId\]/,
	);

	await app.close();
});

test("GET /playground/team scopes run detail expansion to the clicked card", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/team",
	});

	assert.equal(response.statusCode, 200);

	assert.match(response.body, /function findRunDetailElement\(runId, sourceEl\)/);
	assert.match(response.body, /sourceEl\.closest\('\[data-run-id\]'\)/);
	assert.match(response.body, /var scoped = card\.querySelector\('\.run-detail'\)/);
	assert.match(response.body, /async function toggleRunDetail\(runId, sourceEl\)/);
	assert.match(response.body, /var detailEl = findRunDetailElement\(runId, sourceEl\)/);
	assert.match(response.body, /toggleRunDetail\(runId, el\)/);
	assert.match(response.body, /onclick="toggleRunDetail\([\s\S]*this\)">展开任务详情/);
	assert.doesNotMatch(response.body, /var detailEl = \$\("run-detail-" \+ runId\)/);
	assert.doesNotMatch(response.body, /var detailEl = \$\('run-detail-' \+ runId\)/);

	await app.close();
});


	test("GET /playground/team includes mindmap view-model helpers and node structure", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// View-model helpers exist
		assert.match(response.body, /function buildMindmapNodes/);
		assert.match(response.body, /function collectRunTaskDefinitions/);
		assert.match(response.body, /function getMindmapChildrenByParent/);
		assert.match(response.body, /function describeMindmapNodeType/);

		// Renderer uses stable CSS classes / data attributes
		assert.match(response.body, /team-mindmap/);
		assert.match(response.body, /mindmap-root-node/);
		assert.match(response.body, /mindmap-task-node/);
		assert.match(response.body, /mindmap-children/);
		assert.match(response.body, /data-node-status/);
		assert.match(response.body, /data-node-type/);

		// Failed nodes show error summary in compact view
		assert.match(response.body, /mindmap-node-error/);

		await app.close();
	});

	test("GET /playground/team mindmap attribution uses sourceItemId and orphan group", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// Priority 3: sourceItemId participates in child attribution
		// getMindmapChildrenByParent reads def.sourceItemId and checks for_each parents
		assert.match(response.body, /def\.sourceItemId/);
		assert.match(response.body, /forEachParents\.length === 1/);

		// Orphan group is rendered for unassigned task states
		assert.match(response.body, /__orphan_generated__/);
		assert.match(response.body, /orphan-group/);

		// getMindmapChildrenByParent returns orphanIds, not just byParent
		assert.match(response.body, /orphanIds/);

		// Prefix fallback is tracked separately from metadata attribution
		assert.match(response.body, /prefixFallbackIds/);

		await app.close();
	});

	test("GET /playground/team includes mindmap adaptive node interactions", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// Interaction state variables
		assert.match(response.body, /_mindmapExpandedNodes/);
		assert.match(response.body, /_mindmapExpandedGroups/);

		// Toggle functions exposed on window
		assert.match(response.body, /window\.toggleMindmapNode/);
		assert.match(response.body, /window\.toggleMindmapGroup/);

		// Helper predicates
		assert.match(response.body, /function isMindmapNodeExpanded/);
		assert.match(response.body, /function isMindmapGroupExpanded/);
		assert.match(response.body, /function rerenderMindmap/);

		// Failed nodes default expanded
		assert.match(response.body, /nodeStatus === 'failed'/);

		// Node toggle button class and click handler with stopPropagation
		assert.match(response.body, /mindmap-node-toggle/);
		assert.match(response.body, /event\.stopPropagation\(\);toggleMindmapNode/);

		// Expanded node details container
		assert.match(response.body, /mindmap-node-details/);

		// Expanded state indicator
		assert.match(response.body, /mindmap-node-expanded/);

		// Large child group controls
		assert.match(response.body, /MINDMAP_GROUP_LIMIT/);
		assert.match(response.body, /展开全部/);
		assert.match(response.body, /收起/);

		// Failed node error visible in compact mode
		assert.match(response.body, /mindmap-node-error/);

		// File chip uses button element and calls viewAttemptFile with stopPropagation
		assert.match(response.body, /<button class="file-chip" onclick="event\.stopPropagation\(\);viewAttemptFile\(/);

		// Group toggle uses stopPropagation to prevent run card collapse
		assert.match(response.body, /event\.stopPropagation\(\);toggleMindmapGroup/);

			// renderMindmapNode accepts runId, attemptsMap, and runStatus
			assert.match(response.body, /function renderMindmapNode\(node, depth, runId, attemptsMap, runStatus\)/);

		// renderTeamMindmap passes runId through
		assert.match(response.body, /function renderTeamMindmap\(runId, state, plan, attemptsMap\)/);

		// Node progress and activeAttemptId rendering in expanded mode
		assert.match(response.body, /node\.progress/);
		assert.match(response.body, /node\.activeAttemptId/);
		assert.match(response.body, /node\.resultRef/);

		// Expanded node shows metadata: generated, parentTaskId, sourceItemId
		assert.match(response.body, /node\.generated/);
		assert.match(response.body, /node\.parentTaskId/);

		await app.close();
	});

	test("GET /playground/team failed mindmap node first click collapses", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// The click handler must pass node.status so toggle can compute visible state
		// Source uses: toggleMindmapNode(' + jsArg(runId) + ',' + jsArg(node.id) + ',' + jsArg(node.status) + ')
		assert.match(
			response.body,
			/jsArg\(node\.status\)/,
		);

		// The onclick contains toggleMindmapNode with node status and the clicked button as scope
		assert.match(
			response.body,
			/toggleMindmapNode\(' \+ jsArg\(runId\) \+ ',' \+ jsArg\(node\.id\) \+ ',' \+ jsArg\(node\.status\) \+ ',this\)/,
		);

		// toggleMindmapNode must accept nodeStatus and sourceEl arguments
		assert.match(
			response.body,
			/window\.toggleMindmapNode\s*=\s*function\s*\(\s*runId\s*,\s*taskId\s*,\s*nodeStatus\s*,\s*sourceEl\s*\)/,
		);

		// toggle must compute currentlyExpanded from isMindmapNodeExpanded, not bare flip
		assert.match(
			response.body,
			/var currentlyExpanded\s*=\s*isMindmapNodeExpanded\(/,
		);

		// toggle writes the inverse of the computed visible state
		assert.match(
			response.body,
			/_mindmapExpandedNodes\[key\]\s*=\s*!currentlyExpanded/,
		);

		// Verify the old bare-flip pattern is gone
		assert.doesNotMatch(
			response.body,
			/_mindmapExpandedNodes\[key\]\s*=\s*!_mindmapExpandedNodes\[key\]/,
		);

		// Failed nodes still default expanded when never interacted with
		assert.match(
			response.body,
			/nodeStatus === 'failed' && _mindmapExpandedNodes\[key\] === undefined/,
		);

		await app.close();
	});

	test("GET /playground/team includes mindmap visual polish CSS classes", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// View toggle uses CSS class
		assert.match(response.body, /mindmap-view-toggle["\s>]/);
		assert.match(response.body, /mindmap-view-toggle-btn/);

		// Mindmap canvas wrapper
		assert.match(response.body, /class="team-mindmap"/);
		assert.match(response.body, /class="mindmap-canvas"/);

		// CSS class definitions exist in style block
		assert.match(response.body, /\.mindmap-root-node\b/);
		assert.match(response.body, /\.mindmap-task-node\b/);
		assert.match(response.body, /\.mindmap-children\b/);
		assert.match(response.body, /\.mindmap-node-error\b/);
		assert.match(response.body, /\.mindmap-node-details\b/);
		assert.match(response.body, /\.mindmap-node-toggle\b/);

		// Status-specific CSS selectors exist
		assert.match(response.body, /data-node-status="running"]/);
		assert.match(response.body, /data-node-status="succeeded"]/);
		assert.match(response.body, /data-node-status="failed"]/);
		assert.match(response.body, /data-node-status="skipped"]/);

		// Running pulse animation
		assert.match(response.body, /@keyframes mindmap-pulse/);

		// Connector trunk and branch selectors
		assert.match(response.body, /\.mindmap-children::before/);
		assert.match(response.body, /\.mindmap-task-node::before/);

		// Mobile media query covers mindmap
		assert.match(
			response.body,
			/@media \(max-width: 720px\)[\s\S]*?\.team-mindmap/,
		);
		assert.match(
			response.body,
			/@media \(max-width: 720px\)[\s\S]*?\.mindmap-children::before/,
		);

		// Group toggle uses CSS class
		assert.match(response.body, /class="mindmap-group-toggle"/);
		assert.match(response.body, /\.mindmap-group-toggle\b/);

		// No native alert/confirm/prompt
		assert.doesNotMatch(response.body, /\balert\s*\(/);
		assert.doesNotMatch(response.body, /\bconfirm\s*\(/);
		assert.doesNotMatch(response.body, /\bprompt\s*\(/);

		// Node rendering uses CSS classes (no inline padding/border on task nodes)
		assert.doesNotMatch(
			response.body,
			/mindmap-task-node[^"]*"[^>]*padding:6px 10px/,
		);
		assert.doesNotMatch(
			response.body,
			/mindmap-task-node[^"]*"[^>]*border:1px solid/,
		);

		await app.close();
	});

	test("GET /playground/team includes mindmap task disposition controls", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// renderMindmapNode accepts runStatus parameter
		assert.match(response.body, /function renderMindmapNode\(node, depth, runId, attemptsMap, runStatus\)/);

		// renderTeamMindmap passes state.status
		assert.match(response.body, /renderMindmapNode\(root, 0, runId, attemptsMap, state\.status\)/);

		// Disposition buttons in mindmap use stopPropagation + setTaskDisposition
		assert.match(response.body, /event\.stopPropagation\(\);setTaskDisposition\(' \+ jsArg\(runId\) \+ ',' \+ jsArg\(node\.id\) \+ ',' \+ jsArg\('skip'\)/);
		assert.match(response.body, /event\.stopPropagation\(\);setTaskDisposition\(' \+ jsArg\(runId\) \+ ',' \+ jsArg\(node\.id\) \+ ',' \+ jsArg\('force_rerun'\)/);
		assert.match(response.body, /event\.stopPropagation\(\);setTaskDisposition\(' \+ jsArg\(runId\) \+ ',' \+ jsArg\(node\.id\) \+ ',' \+ jsArg\('default'\)/);

		// Disposition badges
		assert.match(response.body, /已设跳过/);
		assert.match(response.body, /已设强制重跑/);

		// Recursive call passes runStatus
		assert.match(response.body, /renderMindmapNode\(node\.children\[i\],\s*depth \+ 1,\s*runId,\s*attemptsMap,\s*runStatus\)/);

		// buildMindmapNodes carries manualDisposition
		assert.match(response.body, /manualDisposition:\s*ts\s*\?\s*ts\.manualDisposition/);

		await app.close();
	});


test("playground initial load defers non-chat panel data", async (t) => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({ method: "GET", url: "/playground" });
	assert.equal(response.statusCode, 200);

	const body = response.body;

	// state declares lazy gate flags
	assert.match(body, /assetsLoadedOnce: false/);
	assert.match(body, /connManagerLoadedOnce: false/);

	// The init function should NOT contain these eager calls.
	// Use indexOf to grab the region between the function definition and its call.
	const initDef = body.indexOf("function initializePlaygroundAssembler()");
	const initCall = body.indexOf("initializePlaygroundAssembler();", initDef + 1);
	assert.ok(initDef > 0, "init function definition not found");
	assert.ok(initCall > initDef, "init function call not found");
	const initRegion = body.slice(initDef, initCall);
	assert.doesNotMatch(initRegion, /void loadAssets\(/);
	assert.doesNotMatch(initRegion, /syncTaskInboxSummary/);
	assert.doesNotMatch(initRegion, /syncConnManagerUnreadSummary/);

	// init still loads agent status and runtime summary (first-screen essentials)
	assert.match(initRegion, /loadAgentStatusAndRenderCards/);
	assert.match(initRegion, /syncRuntimeSummary/);

	// openAssetLibrary has lazy gate
	assert.match(body, /if \(!state\.assetsLoadedOnce\) \{ void loadAssets\(true\); \}/);

	// stream done event guards loadAssets with assetsLoadedOnce
	assert.match(body, /if \(state\.assetsLoadedOnce\) \{ void loadAssets\(true\); \}/);

	// focus/visibility conn summary refresh is guarded
	assert.match(body, /if \(state\.connManagerLoadedOnce\) \{ void syncConnManagerUnreadSummary/);

	await app.close();
});
