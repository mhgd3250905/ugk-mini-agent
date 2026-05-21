import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
	findDockerHostCdpBaseUrl,
	LocalCdpBrowser,
	resolveBrowserInputUrl,
	resolveBrowserIdFromMeta,
	resolveBrowserInstanceFromEnv,
	resolveBrowserRouteFromMeta,
	rewriteCdpTargetForBaseUrl,
} from "../runtime/skills-user/web-access/scripts/local-cdp-browser.mjs";

test("rewriteCdpTargetForBaseUrl rewrites localhost websocket URLs to the reachable CDP host", () => {
	const target = rewriteCdpTargetForBaseUrl(
		{
			id: "target-1",
			type: "page",
			title: "Example",
			url: "https://example.com/",
			webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/target-1",
		},
		"http://192.168.65.254:9222",
	);

	assert.equal(
		target.webSocketDebuggerUrl,
		"ws://192.168.65.254:9222/devtools/page/target-1",
	);
});

test("findDockerHostCdpBaseUrl resolves host.docker.internal to an IP before probing Chrome CDP", async () => {
	const probedUrls: string[] = [];
	const baseUrl = await findDockerHostCdpBaseUrl({
		lookup: async () => ({ address: "192.168.65.254" }),
		fetchImpl: async (url: string) => {
			probedUrls.push(url);
			return {
				ok: true,
				json: async () => ({ Browser: "Chrome/Test" }),
			};
		},
	});

	assert.equal(baseUrl, "http://192.168.65.254:9222");
	assert.deepEqual(probedUrls, ["http://192.168.65.254:9222/json/version"]);
});

test("resolveBrowserInputUrl rewrites container runtime file URLs to the local artifact bridge", () => {
	assert.equal(
		resolveBrowserInputUrl("file:///app/runtime/report-medtrum-v2.html", {
			projectRoot: "/app",
			publicBaseUrl: "http://127.0.0.1:3000",
		}),
		"http://127.0.0.1:3000/v1/local-file?path=%2Fapp%2Fruntime%2Freport-medtrum-v2.html",
	);
});

test("resolveBrowserInputUrl uses the browser-reachable base URL for sidecar local artifacts", () => {
	assert.equal(
		resolveBrowserInputUrl("file:///app/runtime/report-medtrum-v2.html", {
			projectRoot: "/app",
			publicBaseUrl: "http://127.0.0.1:3000",
			browserPublicBaseUrl: "http://ugk-pi:3000",
		}),
		"http://ugk-pi:3000/v1/local-file?path=%2Fapp%2Fruntime%2Freport-medtrum-v2.html",
	);
});

test("resolveBrowserInputUrl rewrites host-visible app URLs to the sidecar-reachable origin", () => {
	assert.equal(
		resolveBrowserInputUrl(
			"http://127.0.0.1:3000/v1/local-file?path=%2Fapp%2Fruntime%2Fzhihu-hot-card.html",
			{
				publicBaseUrl: "http://127.0.0.1:3000",
				browserPublicBaseUrl: "http://ugk-pi:3000",
			},
		),
		"http://ugk-pi:3000/v1/local-file?path=%2Fapp%2Fruntime%2Fzhihu-hot-card.html",
	);
});

test("resolveBrowserInputUrl keeps external URLs unchanged when using a sidecar base", () => {
	assert.equal(
		resolveBrowserInputUrl("https://example.com/path", {
			publicBaseUrl: "http://127.0.0.1:3000",
			browserPublicBaseUrl: "http://ugk-pi:3000",
		}),
		"https://example.com/path",
	);
});

test("resolveBrowserIdFromMeta resolves scope routes before any request-supplied browser id", async () => {
	const tempDir = await mkdtemp(path.join(tmpdir(), "ugk-browser-id-route-"));
	const routeCachePath = path.join(tempDir, "routes.json");
	await writeFile(
		routeCachePath,
		JSON.stringify({
			routes: {
				"scope-1": {
					browserId: "chrome-01",
					updatedAt: "2026-05-08T00:00:00.000Z",
				},
			},
		}),
	);

	try {
		assert.equal(
			resolveBrowserIdFromMeta({ browserId: "chrome-02", agentScope: "scope-1" }, { routeCachePath }),
			"chrome-01",
		);
		assert.equal(
			resolveBrowserIdFromMeta({ agentScope: "scope-1" }, { routeCachePath }),
			"chrome-01",
		);
		assert.equal(
			resolveBrowserIdFromMeta(
				{ agentScope: "scope-1" },
				{ env: { WEB_ACCESS_BROWSER_ID: "chrome-02" }, routeCachePath },
			),
			"chrome-01",
		);
		assert.equal(
			resolveBrowserIdFromMeta(
				{ agentScope: "scope-without-route" },
				{ env: { WEB_ACCESS_BROWSER_ID: "chrome-02", UGK_DEFAULT_BROWSER_ID: "default" }, routeCachePath },
			),
			"default",
		);
		assert.equal(
			resolveBrowserIdFromMeta(
				{ agentScope: "scope-without-route" },
				{ env: { WEB_ACCESS_BROWSER_ID: "chrome-02", UGK_DEFAULT_BROWSER_ID: "chrome-02" }, routeCachePath },
			),
			"default",
		);
		assert.equal(
			resolveBrowserIdFromMeta({ browserId: "chrome-01" }, { env: { WEB_ACCESS_BROWSER_ID: "chrome-02" } }),
			"chrome-02",
		);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("resolveBrowserInstanceFromEnv maps browserId to the configured CDP endpoint", () => {
	const instance = resolveBrowserInstanceFromEnv("chrome-01", {
		UGK_BROWSER_INSTANCES_JSON: JSON.stringify([
			{ browserId: "default", cdpHost: "172.31.250.10", cdpPort: 9223 },
			{ browserId: "chrome-01", cdpHost: "172.31.250.11", cdpPort: 9223 },
		]),
	});

	assert.deepEqual(instance, {
		browserId: "chrome-01",
		cdpHost: "172.31.250.11",
		cdpPort: 9223,
	});
});

test("scoped route endpoint overrides a long-lived proxy environment", async () => {
	const tempDir = await mkdtemp(path.join(tmpdir(), "ugk-browser-route-endpoint-"));
	const routeCachePath = path.join(tempDir, "routes.json");
	await writeFile(
		routeCachePath,
		JSON.stringify({
			routes: {
				"scope-1": {
					browserId: "chrome-01",
					cdpHost: "172.31.250.11",
					cdpPort: 9223,
					updatedAt: "2026-05-09T00:00:00.000Z",
				},
			},
		}),
	);

	try {
		const route = resolveBrowserRouteFromMeta({ agentScope: "scope-1" }, { routeCachePath });
		const instance = resolveBrowserInstanceFromEnv(
			route.browserId,
			{
				WEB_ACCESS_BROWSER_ID: "chrome-02",
				WEB_ACCESS_CDP_HOST: "172.31.250.12",
				WEB_ACCESS_CDP_PORT: "9223",
				UGK_BROWSER_INSTANCES_JSON: JSON.stringify([
					{ browserId: "chrome-02", cdpHost: "172.31.250.12", cdpPort: 9223 },
				]),
			},
			route,
		);

		assert.deepEqual(instance, {
			browserId: "chrome-01",
			cdpHost: "172.31.250.11",
			cdpPort: 9223,
		});
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("resolveBrowserInputUrl rewrites workspace public paths to the local artifact bridge", () => {
	assert.equal(
		resolveBrowserInputUrl("/app/public/x-api-report-card.html", {
			projectRoot: "/app",
			publicBaseUrl: "http://127.0.0.1:3000",
		}),
		"http://127.0.0.1:3000/v1/local-file?path=%2Fapp%2Fpublic%2Fx-api-report-card.html",
	);
});

test("LocalCdpBrowser type action inserts text through CDP Input.insertText", async () => {
	const calls: Array<{ method: string; params: unknown }> = [];
	class TestBrowser extends LocalCdpBrowser {
		async withTarget(
			targetId: string,
			callback: (cdp: { send: (method: string, params?: unknown) => Promise<unknown> }) => Promise<unknown>,
		) {
			assert.equal(targetId, "target-1");
			return await callback({
				send: async (method: string, params?: unknown) => {
					calls.push({ method, params });
					return {};
				},
			});
		}
	}

	const browser = new TestBrowser();
	const result = await browser.handleCommand({
		action: "type",
		targetId: "target-1",
		text: "你好 Draft",
	});

	assert.deepEqual(result, { ok: true, textLength: 8 });
	assert.deepEqual(calls, [
		{ method: "Page.bringToFront", params: undefined },
		{ method: "Input.insertText", params: { text: "你好 Draft" } },
	]);
});

test("LocalCdpBrowser press_key action dispatches keyDown and keyUp events", async () => {
	const calls: Array<{ method: string; params: unknown }> = [];
	class TestBrowser extends LocalCdpBrowser {
		async withTarget(
			targetId: string,
			callback: (cdp: { send: (method: string, params?: unknown) => Promise<unknown> }) => Promise<unknown>,
		) {
			assert.equal(targetId, "target-1");
			return await callback({
				send: async (method: string, params?: unknown) => {
					calls.push({ method, params });
					return {};
				},
			});
		}
	}

	const browser = new TestBrowser();
	const result = await browser.handleCommand({
		action: "press_key",
		targetId: "target-1",
		key: "Enter",
	});

	assert.deepEqual(result, { ok: true, key: "Enter" });
	assert.deepEqual(calls, [
		{ method: "Page.bringToFront", params: undefined },
		{
			method: "Input.dispatchKeyEvent",
			params: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, type: "keyDown" },
		},
		{
			method: "Input.dispatchKeyEvent",
			params: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, type: "keyUp" },
		},
	]);
});

test("LocalCdpBrowser press_enter action is kept as an Enter shortcut", async () => {
	const calls: Array<{ method: string; params: unknown }> = [];
	class TestBrowser extends LocalCdpBrowser {
		async withTarget(
			targetId: string,
			callback: (cdp: { send: (method: string, params?: unknown) => Promise<unknown> }) => Promise<unknown>,
		) {
			assert.equal(targetId, "target-1");
			return await callback({
				send: async (method: string, params?: unknown) => {
					calls.push({ method, params });
					return {};
				},
			});
		}
	}

	const browser = new TestBrowser();
	const result = await browser.handleCommand({
		action: "press_enter",
		targetId: "target-1",
	});

	assert.deepEqual(result, { ok: true, key: "Enter" });
	assert.equal(calls[1]?.method, "Input.dispatchKeyEvent");
	assert.deepEqual(calls[1]?.params, {
		key: "Enter",
		code: "Enter",
		windowsVirtualKeyCode: 13,
		type: "keyDown",
	});
});

test("LocalCdpBrowser registers new scoped targets so scope cleanup closes them", async () => {
	const closedTargets: string[] = [];
	class TestBrowser extends LocalCdpBrowser {
		async ensureBrowser() {
			return { Browser: "Chrome/Test" };
		}

		async newTarget(url = "about:blank", scope?: string) {
			const target = { id: `target-${url}`, type: "page", url };
			this.registerScopedTarget(scope, target.id);
			return target;
		}

		async closeTarget(targetId: string) {
			closedTargets.push(targetId);
			return { ok: true };
		}
	}

	const browser = new TestBrowser();

	await browser.handleCommand(
		{
			action: "new_target",
			url: "https://example.com",
		},
		{
			meta: { agentScope: "conn-1" },
		},
	);
	await browser.handleCommand(
		{
			action: "close_scope_targets",
		},
		{
			meta: { agentScope: "conn-1" },
		},
	);

	assert.deepEqual(closedTargets, ["target-https://example.com"]);
});

test("LocalCdpBrowser replaces the existing scoped default target when opening a new target", async () => {
	const tempDir = await mkdtemp(path.join(tmpdir(), "ugk-cdp-single-target-"));
	const scopeCachePath = path.join(tempDir, "browser-scope-cache.json");
	const requestedUrls: string[] = [];
	const closedUrls: string[] = [];

	try {
		const browser = new LocalCdpBrowser({
			endpoint: "http://chrome.test",
			scopeCachePath,
			fetchImpl: async (input: string | URL) => {
				const url = String(input);
				if (url === "http://chrome.test/json/version") {
					return {
						ok: true,
						json: async () => ({ Browser: "Chrome/Test" }),
					} as Response;
				}
				if (url.startsWith("http://chrome.test/json/new?")) {
					const requestedUrl = decodeURIComponent(url.slice("http://chrome.test/json/new?".length));
					requestedUrls.push(requestedUrl);
					return {
						ok: true,
						json: async () => ({
							id: `target-${requestedUrls.length}`,
							type: "page",
							url: requestedUrl,
							webSocketDebuggerUrl: `ws://chrome.test/devtools/page/target-${requestedUrls.length}`,
						}),
					} as Response;
				}
				if (url.startsWith("http://chrome.test/json/close/")) {
					closedUrls.push(decodeURIComponent(url.slice("http://chrome.test/json/close/".length)));
					return {
						ok: true,
						json: async () => ({}),
					} as Response;
				}
				throw new Error(`unexpected fetch: ${url}`);
			},
		});

		const first = await browser.handleCommand(
			{ action: "new_target", url: "https://example.com/a" },
			{ meta: { agentScope: "scope-1" } },
		);
		const second = await browser.handleCommand(
			{ action: "new_target", url: "https://example.com/b" },
			{ meta: { agentScope: "scope-1" } },
		);
		const defaultTarget = await browser.handleCommand(
			{ action: "get_default_target" },
			{ meta: { agentScope: "scope-1" } },
		);

		assert.equal(first.target.id, "target-1");
		assert.equal(second.target.id, "target-2");
		assert.deepEqual(closedUrls, ["target-1"]);
		assert.deepEqual(defaultTarget, { ok: true, targetId: "target-2" });

		await browser.handleCommand(
			{ action: "close_scope_targets" },
			{ meta: { agentScope: "scope-1" } },
		);
		assert.deepEqual(closedUrls, ["target-1", "target-2"]);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("LocalCdpBrowser navigate_session reuses the scoped target and creates one when missing", async () => {
	const tempDir = await mkdtemp(path.join(tmpdir(), "ugk-cdp-session-target-"));
	const scopeCachePath = path.join(tempDir, "browser-scope-cache.json");
	const calls: Array<{ kind: string; targetId?: string; url?: string }> = [];
	class TestBrowser extends LocalCdpBrowser {
		constructor(options: ConstructorParameters<typeof LocalCdpBrowser>[0]) {
			super(options);
		}

		async newTarget(url = "about:blank", scope?: string) {
			const target = { id: `created-${scope}`, type: "page", url };
			this.registerScopedTarget(scope, target.id);
			this.defaultTargets.set(scope || "default", target.id);
			this.saveScopeCache();
			calls.push({ kind: "new", targetId: target.id, url });
			return target;
		}

		async navigate(targetId: string, url: string) {
			calls.push({ kind: "navigate", targetId, url });
			return { id: targetId, type: "page", url };
		}
	}

	try {
		const browser = new TestBrowser({ scopeCachePath });
		const created = await browser.handleCommand(
			{ action: "navigate_session", url: "https://example.com/first" },
			{ meta: { agentScope: "scope-1" } },
		);
		const reused = await browser.handleCommand(
			{ action: "navigate_session", url: "https://example.com/second" },
			{ meta: { agentScope: "scope-1" } },
		);

		assert.equal(created.page.id, "created-scope-1");
		assert.equal(reused.page.id, "created-scope-1");
		assert.deepEqual(calls, [
			{ kind: "new", targetId: "created-scope-1", url: "https://example.com/first" },
			{ kind: "navigate", targetId: "created-scope-1", url: "https://example.com/second" },
		]);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("LocalCdpBrowser persists scoped targets so a restarted bridge can clean them up", async () => {
	const tempDir = await mkdtemp(path.join(tmpdir(), "ugk-cdp-scope-"));
	const scopeCachePath = path.join(tempDir, "browser-scope-cache.json");
	const closedTargets: string[] = [];

	class TestBrowser extends LocalCdpBrowser {
		constructor(options: ConstructorParameters<typeof LocalCdpBrowser>[0]) {
			super(options);
		}

		async closeTarget(targetId: string) {
			closedTargets.push(targetId);
			return { ok: true };
		}
	}

	try {
		const firstBrowser = new TestBrowser({ scopeCachePath });
		firstBrowser.registerScopedTarget("conn-1", "target-1");
		await firstBrowser.handleCommand(
			{
				action: "set_default_target",
				targetId: "target-default",
			},
			{
				meta: { agentScope: "conn-1" },
			},
		);

		const cache = JSON.parse(await readFile(scopeCachePath, "utf-8"));
		assert.deepEqual(cache.scopedTargets["conn-1"], ["target-1"]);
		assert.equal(cache.defaultTargets["conn-1"], "target-default");

		const restartedBrowser = new TestBrowser({ scopeCachePath });
		await restartedBrowser.handleCommand(
			{
				action: "close_scope_targets",
			},
			{
				meta: { agentScope: "conn-1" },
			},
		);

		assert.deepEqual(closedTargets.sort(), ["target-1", "target-default"].sort());
		const clearedCache = JSON.parse(await readFile(scopeCachePath, "utf-8"));
		assert.equal(clearedCache.scopedTargets["conn-1"], undefined);
		assert.equal(clearedCache.defaultTargets["conn-1"], undefined);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
