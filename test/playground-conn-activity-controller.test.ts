import test from "node:test";
import assert from "node:assert/strict";
import { getConnActivityEditorScript, getConnActivityApiScript } from "../src/ui/playground-conn-activity-controller.js";

test("conn editor asset uploads use conn-scoped asset ownership instead of current conversation", () => {
	const script = getConnActivityEditorScript();

	assert.match(script, /connAssetConversationId/);
	assert.match(script, /"conn:" \+ state\.connEditorConnId/);
	assert.match(script, /"conn:draft"/);
	assert.doesNotMatch(script, /conversationId: state\.conversationId/);
});

test("conn editor no longer exposes task-level browser selection", () => {
	const script = getConnActivityEditorScript();

	assert.doesNotMatch(script, /connEditorBrowserId/);
	assert.doesNotMatch(script, /loadConnBrowserCatalog/);
	assert.doesNotMatch(script, /renderConnEditorBrowserOptions/);
	assert.doesNotMatch(script, /payload\.browserId/);
	assert.match(script, /confirmConnExecutionBindingChangeIfNeeded/);
	assert.doesNotMatch(script, /x-ugk-browser-binding-source/);
	assert.match(script, /只影响后续 run/);
});

test("conn manager sets connManagerLoadedOnce after successful loadConnManager", () => {
	const script = getConnActivityApiScript();

	assert.match(script, /state\.connManagerLoadedOnce = true/);
	assert.match(script, /async function loadConnManager\(options\)/);
});
