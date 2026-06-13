import assert from "node:assert/strict";
import test from "node:test";

import { BrowserControlService } from "../src/browser/browser-control.js";
import { createBrowserRegistryFromEnv } from "../src/browser/browser-registry.js";
import { buildServer } from "../src/server.js";

test("GET /v1/browsers returns configured browser instances", async () => {
	const app = await buildServer({
		browserRegistry: createBrowserRegistryFromEnv({
			UGK_DEFAULT_BROWSER_ID: "work-01",
			UGK_BROWSER_INSTANCES_JSON: JSON.stringify([
				{ browserId: "default", name: "Default", cdpHost: "172.31.250.10", cdpPort: 9223 },
				{
					browserId: "work-01",
					name: "我的浏览器",
					cdpHost: "172.31.250.11",
					cdpPort: 9223,
					guiUrl: "https://127.0.0.1:3902/",
					profileLabel: "user-managed",
				},
			]),
		}),
	});

	try {
		const response = await app.inject({ method: "GET", url: "/v1/browsers" });
		assert.equal(response.statusCode, 200);
		assert.deepEqual(response.json(), {
			defaultBrowserId: "work-01",
			browsers: [
				{
					browserId: "default",
					name: "Default",
					cdpHost: "172.31.250.10",
					cdpPort: 9223,
					isDefault: false,
				},
				{
					browserId: "work-01",
					name: "我的浏览器",
					cdpHost: "172.31.250.11",
					cdpPort: 9223,
					guiUrl: "https://127.0.0.1:3902/",
					profileLabel: "user-managed",
					isDefault: true,
				},
			],
		});
	} finally {
		await app.close();
	}
});

test("GET /v1/browsers returns an empty catalog when no native CDP endpoint is configured", async () => {
	const app = await buildServer({
		browserRegistry: createBrowserRegistryFromEnv({
			UGK_DISABLE_BROWSER_SIDECAR_DEFAULT: "true",
		}),
	});

	try {
		const response = await app.inject({ method: "GET", url: "/v1/browsers" });
		assert.equal(response.statusCode, 200);
		assert.deepEqual(response.json(), {
			defaultBrowserId: "",
			browsers: [],
		});
	} finally {
		await app.close();
	}
});

test("GET /v1/browsers/:browserId/status returns CDP runtime status", async () => {
	const requestedUrls: string[] = [];
	const usageRequests: string[] = [];
	const app = await buildServer({
		browserRegistry: createBrowserRegistryFromEnv({
			UGK_BROWSER_INSTANCES_JSON: JSON.stringify([
				{ browserId: "default", name: "Default", cdpHost: "172.31.250.10", cdpPort: 9223 },
			]),
		}),
		browserControl: new BrowserControlService({
			fetchImpl: (async (url: string | URL) => {
				requestedUrls.push(String(url));
				if (String(url).endsWith("/json/version")) {
					return new Response(
						JSON.stringify({
							Browser: "Chrome/Test",
							"Protocol-Version": "1.3",
							webSocketDebuggerUrl: "ws://172.31.250.10:9223/devtools/browser/abc",
						}),
						{ status: 200, headers: { "content-type": "application/json" } },
					);
				}
				return new Response(
					JSON.stringify([
						{
							id: "page-1",
							type: "page",
							title: "Example",
							url: "https://example.com/",
							attached: false,
							webSocketDebuggerUrl: "ws://172.31.250.10:9223/devtools/page/page-1",
						},
					]),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}) as typeof fetch,
			usageReader: {
				async readUsage(webSocketDebuggerUrl: string) {
					usageRequests.push(webSocketDebuggerUrl);
					return {
						available: true,
						jsHeapUsedBytes: 1024,
						jsHeapTotalBytes: 2048,
						domNodes: 19,
						documents: 1,
						eventListeners: 2,
					};
				},
			},
		}),
	});

	try {
		const response = await app.inject({ method: "GET", url: "/v1/browsers/default/status" });

		assert.equal(response.statusCode, 200);
		assert.deepEqual(requestedUrls.sort(), [
			"http://172.31.250.10:9223/json/list",
			"http://172.31.250.10:9223/json/version",
		]);
		assert.deepEqual(usageRequests, ["ws://172.31.250.10:9223/devtools/page/page-1"]);
		assert.deepEqual(response.json().status, {
			browser: {
				browserId: "default",
				name: "Default",
				cdpHost: "172.31.250.10",
				cdpPort: 9223,
				isDefault: true,
			},
			online: true,
			cdpUrl: "http://172.31.250.10:9223",
			version: {
				browser: "Chrome/Test",
				protocolVersion: "1.3",
				webSocketDebuggerUrl: "ws://172.31.250.10:9223/devtools/browser/abc",
			},
			targets: [
				{
					targetId: "page-1",
					type: "page",
					title: "Example",
					url: "https://example.com/",
					attached: false,
					usage: {
						available: true,
						jsHeapUsedBytes: 1024,
						jsHeapTotalBytes: 2048,
						domNodes: 19,
						documents: 1,
						eventListeners: 2,
					},
				},
			],
			capabilities: {
				closeTarget: true,
				start: false,
				restart: false,
				memory: false,
			},
		});
	} finally {
		await app.close();
	}
});

test("POST /v1/browsers/:browserId/targets/:targetId/close closes a CDP target", async () => {
	const requestedUrls: string[] = [];
	const app = await buildServer({
		browserRegistry: createBrowserRegistryFromEnv({
			UGK_BROWSER_INSTANCES_JSON: JSON.stringify([
				{ browserId: "default", name: "Default", cdpHost: "172.31.250.10", cdpPort: 9223 },
			]),
		}),
		browserControl: new BrowserControlService({
			fetchImpl: (async (url: string | URL) => {
				requestedUrls.push(String(url));
				return new Response("Target is closing", { status: 200 });
			}) as typeof fetch,
		}),
	});

	try {
		const response = await app.inject({
			method: "POST",
			url: "/v1/browsers/default/targets/page-1/close",
		});

		assert.equal(response.statusCode, 200);
		assert.deepEqual(response.json(), { closed: true, targetId: "page-1" });
		assert.deepEqual(requestedUrls, ["http://172.31.250.10:9223/json/close/page-1"]);
	} finally {
		await app.close();
	}
});

test("POST /v1/browsers/:browserId/start reports unsupported actuator for now", async () => {
	const app = await buildServer({
		browserRegistry: createBrowserRegistryFromEnv({
			UGK_BROWSER_INSTANCES_JSON: JSON.stringify([
				{ browserId: "default", name: "Default", cdpHost: "172.31.250.10", cdpPort: 9223 },
			]),
		}),
	});

	try {
		const response = await app.inject({
			method: "POST",
			url: "/v1/browsers/default/start",
		});

		assert.equal(response.statusCode, 501);
		assert.equal(response.json().supported, false);
		assert.equal(response.json().started, false);
	} finally {
		await app.close();
	}
});

test("GET /v1/browsers/:browserId returns one browser or 404", async () => {
	const app = await buildServer({
		browserRegistry: createBrowserRegistryFromEnv({
			WEB_ACCESS_CDP_HOST: "172.31.250.10",
			WEB_ACCESS_CDP_PORT: "9223",
		}),
	});

	try {
		const found = await app.inject({ method: "GET", url: "/v1/browsers/default" });
		assert.equal(found.statusCode, 200);
		assert.equal(found.json().browser.browserId, "default");

		const missing = await app.inject({ method: "GET", url: "/v1/browsers/missing" });
		assert.equal(missing.statusCode, 404);
		assert.deepEqual(missing.json(), {
			error: {
				code: "NOT_FOUND",
				message: "Unknown browserId: missing",
			},
		});
	} finally {
		await app.close();
	}
});
