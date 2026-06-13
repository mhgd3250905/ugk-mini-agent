import test from "node:test";
import assert from "node:assert/strict";
import { renderPlaygroundHtml } from "../src/ui/playground-page-shell.js";

test("renderPlaygroundHtml assembles the playground shell from injected fragments", () => {
	const html = renderPlaygroundHtml({
		styles: ".sentinel-style{}",
		markedBrowserScript: "window.__markedLoaded = true;",
		playgroundScript: "window.__playgroundLoaded = true;",
		taskInboxView: '<section id="task-sentinel"></section>',
		connActivityDialogs: '<dialog id="conn-sentinel"></dialog>',
		assetDialogs: '<dialog id="asset-sentinel"></dialog>',
	});

	assert.match(html, /<style>\.sentinel-style\{\}<\/style>/);
	assert.match(html, /<section id="task-sentinel"><\/section>/);
	assert.match(html, /<dialog id="conn-sentinel"><\/dialog>/);
	assert.match(html, /<dialog id="asset-sentinel"><\/dialog>/);
	assert.match(html, /window\.__markedLoaded = true;\s*window\.__playgroundLoaded = true;/);
});

test("renderPlaygroundHtml keeps desktop settings in the sidebar and primary tools in the topbar", () => {
	const html = renderPlaygroundHtml({
		styles: ".sentinel-style{}",
		markedBrowserScript: "",
		playgroundScript: "",
		taskInboxView: "",
		connActivityDialogs: "",
		assetDialogs: "",
	});

	const topbarStart = html.indexOf('<header class="topbar">');
	const railStart = html.indexOf('id="desktop-conversation-rail"');
	const settingsStart = html.indexOf('class="desktop-rail-settings"');
	assert.ok(topbarStart >= 0);
	assert.ok(railStart > topbarStart);
	assert.ok(settingsStart > railStart);
	assert.ok(html.indexOf('id="open-model-config-button"') > settingsStart);
	assert.equal(html.includes('id="open-browser-workbench-button"'), false);
	assert.ok(html.indexOf('id="theme-toggle-button"') > topbarStart);
	assert.ok(html.indexOf('id="agent-selector-status"') > topbarStart);
	assert.ok(html.indexOf('id="agent-selector-status"') < railStart);
	assert.equal(html.indexOf('id="view-skills-button"'), -1);
	assert.ok(html.indexOf('id="open-asset-library-button"') > topbarStart);
	assert.ok(html.indexOf('id="open-asset-library-button"') < railStart);
	assert.ok(html.indexOf('id="file-picker-action"') > railStart);
});
