import assert from "node:assert/strict";
import test from "node:test";

import {
	createBrowserRegistryFromEnv,
	isValidBrowserId,
} from "../src/browser/browser-registry.js";

test("browser registry synthesizes the current default CDP instance when no explicit config is provided", () => {
	const registry = createBrowserRegistryFromEnv({
		WEB_ACCESS_CDP_HOST: "172.31.250.10",
		WEB_ACCESS_CDP_PORT: "9223",
		WEB_ACCESS_BROWSER_GUI_PORT: "3901",
	});

	assert.equal(registry.defaultBrowserId, "default");
	assert.deepEqual(registry.list(), [
		{
			browserId: "default",
			name: "Default",
			cdpHost: "172.31.250.10",
			cdpPort: 9223,
			guiUrl: "https://127.0.0.1:3901/",
			profileLabel: "native-chrome",
			isDefault: true,
		},
	]);
});

test("browser registry is empty when the sidecar default is disabled and no CDP endpoint is configured", () => {
	const registry = createBrowserRegistryFromEnv({
		UGK_DISABLE_BROWSER_SIDECAR_DEFAULT: "true",
	});

	assert.equal(registry.defaultBrowserId, "");
	assert.deepEqual(registry.list(), []);
	assert.equal(registry.get("default"), undefined);
	assert.deepEqual(registry.toJSON(), {
		defaultBrowserId: "",
		browsers: [],
	});
});

test("browser registry is empty by default for Windows Core native runtime", () => {
	const registry = createBrowserRegistryFromEnv({});

	assert.equal(registry.defaultBrowserId, "");
	assert.deepEqual(registry.list(), []);
});

test("browser registry keeps CDP available when Windows Core provides an explicit endpoint", () => {
	const registry = createBrowserRegistryFromEnv({
		UGK_DISABLE_BROWSER_SIDECAR_DEFAULT: "true",
		WEB_ACCESS_CDP_HOST: "127.0.0.1",
		WEB_ACCESS_CDP_PORT: "9222",
	});

	assert.equal(registry.defaultBrowserId, "default");
	assert.deepEqual(registry.get("default"), {
		browserId: "default",
		name: "Default",
		cdpHost: "127.0.0.1",
		cdpPort: 9222,
		guiUrl: "https://127.0.0.1:3901/",
		profileLabel: "native-chrome",
		isDefault: true,
	});
});

test("browser registry accepts user-defined browser ids without assigning business meaning", () => {
	const registry = createBrowserRegistryFromEnv({
		UGK_DEFAULT_BROWSER_ID: "work-01",
		UGK_BROWSER_INSTANCES_JSON: JSON.stringify([
			{
				browserId: "default",
				name: "Default",
				cdpHost: "172.31.250.10",
				cdpPort: 9223,
			},
			{
				browserId: "work-01",
				name: "我的浏览器",
				cdpHost: "172.31.250.11",
				cdpPort: 9223,
				guiUrl: "https://127.0.0.1:3902/",
				profileLabel: "user-managed",
			},
		]),
	});

	assert.equal(registry.defaultBrowserId, "work-01");
	assert.deepEqual(registry.get("work-01"), {
		browserId: "work-01",
		name: "我的浏览器",
		cdpHost: "172.31.250.11",
		cdpPort: 9223,
		guiUrl: "https://127.0.0.1:3902/",
		profileLabel: "user-managed",
		isDefault: true,
	});
	assert.deepEqual(registry.get("default"), {
		browserId: "default",
		name: "Default",
		cdpHost: "172.31.250.10",
		cdpPort: 9223,
		isDefault: false,
	});
});

test("browser registry rejects invalid and duplicate browser ids", () => {
	assert.equal(isValidBrowserId("work-01"), true);
	assert.equal(isValidBrowserId("Work-01"), false);
	assert.equal(isValidBrowserId("x"), true);
	assert.equal(isValidBrowserId("1-work"), false);

	assert.throws(
		() =>
			createBrowserRegistryFromEnv({
				UGK_BROWSER_INSTANCES_JSON: JSON.stringify([
					{ browserId: "default", name: "Default", cdpHost: "172.31.250.10", cdpPort: 9223 },
					{ browserId: "default", name: "Duplicate", cdpHost: "172.31.250.11", cdpPort: 9223 },
				]),
			}),
		/duplicate browserId: default/,
	);
});
