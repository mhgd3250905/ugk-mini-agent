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

test("conn editor supports task-level browser selection independent of the execution agent", () => {
	const script = getConnActivityEditorScript();

	assert.match(script, /connEditorBrowserId/);
	assert.match(script, /loadConnBrowserCatalog/);
	assert.match(script, /renderConnEditorBrowserOptions/);
	assert.match(script, /payload\.browserId = connEditorBrowserId\.value \|\| null/);
	assert.match(script, /跟随执行 Agent/);
	assert.match(script, /confirmConnExecutionBindingChangeIfNeeded/);
	assert.match(script, /x-ugk-browser-binding-source/);
	assert.match(script, /只影响后续 run/);
});

test("conn manager sets connManagerLoadedOnce after successful loadConnManager", () => {
	const script = getConnActivityApiScript();

	assert.match(script, /state\.connManagerLoadedOnce = true/);
	assert.match(script, /async function loadConnManager\(options\)/);
});
