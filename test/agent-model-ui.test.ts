import test from "node:test";
import assert from "node:assert/strict";
import { renderAgentsPage } from "../src/ui/agents-page.js";
import { renderPlaygroundPage } from "../src/ui/playground.js";
import { getPlaygroundAgentManagerScript } from "../src/ui/playground-agent-manager.js";

test("embedded agent editor does not clear model fields when model controls are unavailable", () => {
	const script = getPlaygroundAgentManagerScript();

	assert.doesNotMatch(
		script,
		/: editing \? \{ defaultModelProvider: null, defaultModelId: null \} : \{\}/,
	);
	assert.match(script, /const modelSelectionPatch = buildAgentEditorModelSelectionPatch\(\);/);
});

test("standalone agents page binds model provider changes for both create and edit forms", () => {
	const page = renderAgentsPage();

	assert.match(page, /function bindEditorModelProviderSelect\(\)/);
	assert.match(page, /bindEditorModelProviderSelect\(\);/);
	assert.doesNotMatch(
		page,
		/if \(!isEdit\) \{[\s\S]*providerSel\.addEventListener\("change"[\s\S]*\n\t\t\t\}\n\t\t\}/,
	);
});

test("standalone agents page confirms browser binding changes when editing agents", () => {
	const page = renderAgentsPage();

	assert.match(page, /function confirmAgentBrowserChangeIfNeeded\(/);
	assert.match(page, /确认变更默认浏览器/);
	assert.match(page, /var browserChanged = String\(agent\.defaultBrowserId \|\| ""\)\.trim\(\) !== String\(browser \|\| ""\)\.trim\(\);/);
	assert.match(page, /"x-ugk-browser-binding-confirmed": "true"/);
	assert.match(page, /"x-ugk-browser-binding-source": "playground"/);
});

test("standalone agents page derives a usable id when the name cannot be slugged", () => {
	const page = renderAgentsPage();

	assert.match(page, /function deriveNextAgentId\(name\)/);
	assert.match(page, /var base = normalizeAgentIdInput\(name \|\| "agent"\);/);
	assert.match(page, /if \(!\/\^\[a-z\]\/\.test\(base\)\) base = "agent";/);
	assert.match(page, /existing\.has\(next\) \|\| next === "main" \|\| next === "search"/);
	assert.match(page, /idInput\.value = deriveNextAgentId\(nameInput\.value\);/);
});

test("standalone agents page normalizes manual ids before validation and create", () => {
	const page = renderAgentsPage();

	assert.match(page, /function normalizeAgentIdInput\(value\)/);
	assert.ok(page.includes('.replace(/[\\s_./]+/g, "-")'));
	assert.ok(page.includes('.replace(/[‐‑‒–—―－]+/g, "-")'));
	assert.match(page, /var rawId = \(document\.getElementById\("ed-id"\) \|\| \{\}\)\.value \|\| "";/);
	assert.match(page, /var id = normalizeAgentIdInput\(rawId \|\| deriveNextAgentId\(name\)\);/);
	assert.match(page, /if \(idInput\) idInput\.value = id;/);
	assert.match(page, /body: JSON\.stringify\(\{ agentId: id,/);
});

test("standalone agents page follows the home cockpit visual system", () => {
	const page = renderAgentsPage();

	assert.match(page, /data-standalone-theme="cockpit"/);
	assert.match(page, /class="sp-topbar-back" href="\/playground\?view=chat"/);
	assert.match(page, /sp-cockpit-drift/);
	assert.match(page, /body\[data-standalone-theme="cockpit"\] \.ag-stat-card/);
});

test("playground model settings follow the active agent default model outside main", () => {
	const page = renderPlaygroundPage();

	assert.match(page, /function getCurrentAgentModelConfigSelection\(\)/);
	assert.match(page, /if \(getCurrentAgentId\(\) === "main"\)/);
	assert.match(page, /const effectiveSelection = getEffectiveModelConfigSelection\(\);/);
	assert.match(page, /当前 Agent：/);
	assert.match(page, /fetch\(isMainAgent \? "\/v1\/model-config\/default" : "\/v1\/agents\/" \+ encodeURIComponent\(currentAgentId\)/);
	assert.match(page, /method: isMainAgent \? "PUT" : "PATCH"/);
	assert.match(page, /defaultModelProvider: selection\.provider/);
	assert.match(page, /已保存到当前 Agent，新会话生效。/);
});
