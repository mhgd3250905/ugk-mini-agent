import test from "node:test";
import assert from "node:assert/strict";
import { renderPlaygroundPage } from "../src/ui/playground.js";
import { getPlaygroundAgentManagerScript } from "../src/ui/playground-agent-manager.js";

test("playground renders an agent selector for switching operation windows", () => {
	const html = renderPlaygroundPage();
	const settingsStart = html.indexOf('class="desktop-rail-settings"');
	const contextSlotStart = html.indexOf('class="topbar-context-slot"');

	assert.ok(settingsStart >= 0);
	assert.ok(contextSlotStart >= 0);
	assert.match(html, /id="agent-selector-status"/);
	assert.ok(html.indexOf('id="agent-selector-status"') > contextSlotStart);
	assert.match(html, /class="topbar-agent-label"/);
	assert.match(html, /aria-label="打开 Agent 页面"/);
	assert.match(html, /const AGENT_SELECTION_STORAGE_KEY = "ugk-mini-agent:active-agent-id"/);
	assert.match(html, /function readUrlAgentIdHint\(\)/);
	assert.match(html, /params\.get\("agentId"\)/);
	assert.match(html, /function isTeamConsoleEmbed\(\)/);
	assert.match(html, /params\.get\("embed"\) === "team-console"/);
	assert.match(html, /function readTeamConsoleEmbedMode\(\)/);
	assert.match(html, /params\.get\("embedMode"\) === "mini" \? "mini" : "full"/);
	assert.match(html, /shell\.dataset\.teamConsoleEmbed = teamConsoleEmbedMode/);
	assert.match(html, /function readInitialAgentId\(\)/);
	assert.match(html, /const hinted = readUrlAgentIdHint\(\)/);
	assert.match(html, /return isTeamConsoleEmbed\(\) \? hinted : writeStoredAgentId\(hinted\)/);
	assert.match(html, /agentId:\s*readInitialAgentId\(\)/);
	assert.match(html, /if \(!options\?\.skipPersist && !isTeamConsoleEmbed\(\)\)/);
	assert.match(html, /localStorage\.setItem\(AGENT_SELECTION_STORAGE_KEY, normalized\)/);
	assert.match(html, /state\.agentId = writeStoredAgentId\(nextAgentId, \{ skipPersist: isTeamConsoleEmbed\(\) \}\)/);
});

test("playground keeps the stored active agent when the catalog request falls back", () => {
	const html = renderPlaygroundPage();

	assert.match(html, /agentCatalogReliable:\s*true/);
	assert.match(html, /state\.agentCatalogReliable = true;/);
	assert.match(html, /state\.agentCatalogReliable = false;/);
	assert.match(html, /if \(state\.agentCatalogReliable && !knownAgentIds\.has\(getCurrentAgentId\(\)\)\)/);
});

test("team console embed locks the playground agent switcher to the hinted agent", () => {
	const html = renderPlaygroundPage();
	const agentManagerScript = getPlaygroundAgentManagerScript();

	assert.match(html, /function isAgentSwitcherLocked\(\)/);
	assert.match(html, /return isTeamConsoleEmbed\(\)/);
	assert.match(html, /agentSelectorStatus\.dataset\.switcherLocked = locked \? "true" : "false"/);
	assert.match(html, /if \(isAgentSwitcherLocked\(\)\) \{\s*closeAgentSwitcher\(\);\s*return;/);
	assert.match(html, /\.topbar-agent-label\[data-switcher-locked="true"\] \.agent-switcher-meta/);
	assert.match(agentManagerScript, /if \(typeof isTeamConsoleEmbed === "function" && isTeamConsoleEmbed\(\)\) \{/);
});

test("team console mini embed has a scoped compact playground layout", () => {
	const html = renderPlaygroundPage();

	assert.match(html, /\.shell\[data-team-console-embed="mini"\]\s*\{/);
	assert.match(html, /\.shell\[data-team-console-embed="mini"\] #new-conversation-button/);
	assert.match(html, /\.shell\[data-team-console-embed="mini"\] #new-conversation-button\[data-tooltip-title\]::after\s*\{[\s\S]*left:\s*0;/);
	assert.match(html, /\.shell\[data-team-console-embed="mini"\] > \.desktop-conversation-rail/);
	assert.match(html, /\.shell\[data-team-console-embed="mini"\] \.topbar-context-slot/);
	assert.match(html, /\.shell\[data-team-console-embed="mini"\] \.stream-layout/);
	assert.doesNotMatch(html, /body\[data-team-console-embed="mini"\]/);
});

test("playground renders agent management entry points and workspace", () => {
	const html = renderPlaygroundPage();

	assert.doesNotMatch(html, /id="open-agent-manager-button"/);
	assert.doesNotMatch(html, /id="mobile-menu-agent-manager-button"/);
	assert.match(html, /id="agent-manager-dialog"/);
	assert.match(html, /id="agent-manager-list"/);
	assert.match(html, /id="agent-manager-detail"/);
	assert.match(html, /agent-manager-skill-list/);
	assert.match(html, /agent-manager-rules-card/);
	assert.match(html, /id="agent-rules-editor-dialog"/);
	assert.match(html, /id="agent-rules-editor-input"/);
	assert.match(html, /function openAgentRulesEditor/);
	assert.match(html, /function saveAgentRulesEditor/);
	assert.match(html, /method: "PATCH"/);
	assert.doesNotMatch(html, /agentManagerExpandedPanel:\s*""/);
	assert.doesNotMatch(html, /is-rules-expanded/);
	assert.doesNotMatch(html, /textContent = expanded \? "收起" : "展开"/);
	assert.match(html, /主 Agent 可查看不可删除/);
	assert.match(html, /id="agent-editor-dialog"/);
	assert.match(html, /id="agent-editor-form"/);
	assert.match(html, /id="agent-editor-browser-select"/);
	assert.match(html, /browserCatalog:\s*\[\]/);
	assert.match(html, /async function loadBrowserCatalog/);
	assert.match(html, /fetch\("\/v1\/browsers"/);
	assert.match(html, /defaultBrowserId/);
	assert.match(html, /renderBrowserOptions/);
	assert.match(html, /confirmAgentBrowserChangeIfNeeded/);
	assert.match(html, /保存成功后影响后续 run/);
	assert.match(html, /该 Agent 当前不能有运行中任务/);
	assert.doesNotMatch(getPlaygroundAgentManagerScript(), /不影响正在运行中的任务/);
	assert.match(html, /agentManagerMode:\s*"detail"/);
	assert.match(html, /agent-manager-create/);
	assert.match(html, /Agent ID（自动生成）/);
	assert.match(html, /默认浏览器/);
	assert.match(html, /AGENTS\.md 预览/);
	assert.match(html, /initialSystemSkillNames/);
	assert.match(html, /\/v1\/agents\/main\/debug\/skills/);
	assert.match(html, /agent-skill-ops/);
	assert.match(html, /function openAgentManager/);
	assert.match(html, /openWorkspacePanel\("agents", agentManagerDialog/);
	assert.match(html, /fetch\("\/v1\/agents"/);
	assert.match(html, /fetch\("\/v1\/agents\/" \+ encodeURIComponent\(agent\.agentId\)/);
	assert.match(html, /encodeURIComponent\(agent\.agentId\) \+ "\/rules"/);
	assert.doesNotMatch(html, /agent\.agentId !== "main"/);
});

test("playground agent button opens the standalone agents page instead of the legacy workspace", () => {
	const script = getPlaygroundAgentManagerScript();

	assert.match(script, /window\.location\.assign\("\/playground\/agents"\)/);
	assert.doesNotMatch(script, /window\.open\("\/playground\/agents", "_blank"\)/);
	assert.doesNotMatch(script, /agentSelectorStatus\?\.addEventListener\("click", \(\) => \{\s*openAgentManager\(agentSelectorStatus, \{ mode: "workspace" \}\);/);
});
