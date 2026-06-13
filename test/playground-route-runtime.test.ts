import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

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
	assert.match(response.body, /body::after\s*\{[\s\S]*linear-gradient\(180deg, rgba\(255, 255, 255, 0\.024\), transparent 170px\),[\s\S]*opacity:\s*0\.64;/);
	assert.match(response.body, /:root\[data-theme="light"\] body::before\s*\{[\s\S]*opacity:\s*0\.44;/);
	assert.match(response.body, /:root\[data-theme="light"\] body::after\s*\{[\s\S]*linear-gradient\(180deg, rgba\(255, 255, 255, 0\.34\), transparent 170px\),[\s\S]*opacity:\s*0\.58;/);
	assert.doesNotMatch(response.body, /rgba\(221, 229, 240, 0\.36\) 0%, transparent 12%, transparent 88%, rgba\(221, 229, 240, 0\.32\) 100%/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.shell\[data-stage-mode="landing"\] \.composer\s*\{[\s\S]*border-color:\s*transparent;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+#composer-drop-target\.composer\s*\{[\s\S]*border-color:\s*transparent;[\s\S]*background:\s*var\(--chat-composer-bg\);[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.file-strip\s*\{[\s\S]*border-color:\s*transparent;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+#message\s*\{[\s\S]*background:\s*#ffffff;[\s\S]*color:\s*#172033;/);
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
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.confirm-dialog\s*\{[\s\S]*background:\s*rgba\(14, 25, 42, 0\.34\);/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.confirm-dialog-actions button\s*\{[\s\S]*background:\s*#e5ecf6;[\s\S]*color:\s*#33435f;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.confirm-dialog-actions \.danger-action\s*\{[\s\S]*background:\s*#c52945;[\s\S]*color:\s*#ffffff;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.telemetry-action\[data-tooltip-title\]::after\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*#ffffff;[\s\S]*color:\s*#34435f;/);
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
	assert.match(response.body, /const PLAYGROUND_THEME_STORAGE_KEY = "ugk-mini-agent:playground-theme";/);
	assert.match(response.body, /function applyPlaygroundTheme\(nextTheme\)\s*\{/);
	assert.match(response.body, /pageRoot\.dataset\.theme = normalized;/);
	assert.match(response.body, /localStorage\.setItem\(PLAYGROUND_THEME_STORAGE_KEY, normalized\)/);
	assert.match(response.body, /themeToggleButton\.addEventListener\("click"/);
	assert.match(response.body, /mobileMenuThemeButton\.addEventListener\("click"/);
	assert.match(response.body, /theme-mode-toggle-track/);
	assert.match(response.body, /theme-mode-toggle-sun/);
	assert.match(response.body, /theme-mode-toggle-moon/);
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
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-drawer-backdrop\s*\{[\s\S]*z-index:\s*130;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-drawer-backdrop\s*\{[\s\S]*background:\s*rgba\(1, 3, 10, 0\.42\);/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-drawer\s*\{[\s\S]*z-index:\s*131;/);
	assert.match(response.body, /\.shell\[data-home="true"\] > \.mobile-drawer-backdrop,[\s\S]*\.shell\[data-home="true"\] > \.mobile-conversation-drawer\s*\{[\s\S]*position:\s*fixed;/);
	assert.match(response.body, /\.shell\[data-home="true"\] > \.mobile-drawer-backdrop\s*\{[\s\S]*z-index:\s*130;/);
	assert.match(response.body, /\.shell\[data-home="true"\] > \.mobile-conversation-drawer\s*\{[\s\S]*z-index:\s*131;/);
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
	assert.match(response.body, /\.desktop-conversation-list \.mobile-conversation-item\s*\{[\s\S]*height:\s*58px;[\s\S]*background:\s*#101827;[\s\S]*opacity:\s*0\.86;/);
	assert.doesNotMatch(response.body, /mobile-conversation-preview/);
	assert.doesNotMatch(response.body, /metaCount/);
	assert.match(response.body, /\.desktop-conversation-list \.conversation-item-menu-trigger\s*\{[\s\S]*opacity:\s*0;/);
	assert.match(response.body, /\.desktop-conversation-list \.conversation-item-shell\[class\*="conversation-bg-"\] \.mobile-conversation-item\s*\{[\s\S]*background:\s*var\(--conversation-card-bg\);[\s\S]*opacity:\s*1;/);
	assert.match(response.body, /\.desktop-conversation-list \.conversation-item-shell\[class\*="conversation-bg-"\] \.mobile-conversation-item:hover:not\(:disabled\),[\s\S]*background:\s*var\(--conversation-card-hover-bg\);/);
	assert.match(response.body, /\.desktop-conversation-list \.conversation-item-shell\[class\*="conversation-bg-"\] \.mobile-conversation-title\s*\{[\s\S]*color:\s*#172033;/);
	assert.match(response.body, /\.desktop-conversation-list \.conversation-item-shell\[class\*="conversation-bg-"\] \.conversation-item-menu-trigger\s*\{[\s\S]*color:\s*rgba\(23, 32, 51, 0\.68\);/);
	assert.match(response.body, /\.desktop-conversation-list \.conversation-item-shell\[class\*="conversation-bg-"\]:hover \.conversation-item-menu-trigger,[\s\S]*opacity:\s*1;/);
	assert.match(response.body, /:root\[data-theme="light"\] \.desktop-conversation-list \.conversation-item-shell\[class\*="conversation-bg-"\] \.mobile-conversation-item\s*\{[\s\S]*background:\s*var\(--conversation-card-bg\);/);
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
		match[1].includes("background: var(--chat-composer-bg);"),
	);
	const mobileLandingComposerBlock = [
		...response.body.matchAll(/\.shell\[data-stage-mode="landing"\] \.composer\s*\{([\s\S]*?)\n\s*\}/g),
	].find((match) => match[1].includes("background: var(--chat-composer-bg);"));
	assert.ok(mobileComposerBlock);
	assert.ok(mobileLandingComposerBlock);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\n\s*\.composer\s*\{[\s\S]*padding:\s*8px 8px 8px 10px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\n\s*\.composer\s*\{[\s\S]*background:\s*var\(--chat-composer-bg\);/);
	assert.doesNotMatch(mobileComposerBlock[1], /linear-gradient/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\n\s*\.composer-main\s*\{[\s\S]*gap:\s*4px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\n\s*\.composer-header\s*\{[\s\S]*display:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\n\s*\.composer textarea\s*\{[\s\S]*min-height:\s*44px;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\n\s*\.composer textarea\s*\{[\s\S]*max-height:\s*calc\(var\(--composer-line-height\) \* var\(--composer-textarea-max-lines\) \+ 24px\);/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\n\s*\.composer textarea\s*\{[\s\S]*padding:\s*12px 0;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\n\s*\.composer textarea\s*\{[\s\S]*resize:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.shell\[data-stage-mode="landing"\] \.composer\s*\{[\s\S]*height:\s*fit-content;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.shell\[data-stage-mode="landing"\] \.composer\s*\{[\s\S]*background:\s*var\(--chat-composer-bg\);/);
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
	assert.match(response.body, /\.composer\s*\{[\s\S]*padding:\s*10px 10px 10px 11px;/);
	assert.match(response.body, /\.composer-main\s*\{[\s\S]*gap:\s*8px;/);
	assert.match(response.body, /\.composer textarea\s*\{[\s\S]*min-height:\s*52px;/);
	assert.match(response.body, /\.composer textarea\s*\{[\s\S]*--composer-textarea-max-lines:\s*10;/);
	assert.match(response.body, /\.composer textarea\s*\{[\s\S]*max-height:\s*calc\(var\(--composer-line-height\) \* var\(--composer-textarea-max-lines\) \+ 30px\);/);
	assert.match(response.body, /\.composer textarea\s*\{[\s\S]*padding-top:\s*14px;/);
	assert.match(response.body, /\.composer textarea\s*\{[\s\S]*padding-bottom:\s*14px;/);
	assert.match(response.body, /\.composer textarea\s*\{[\s\S]*background:\s*#172238;/);
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
	assert.match(
		response.body,
		/<div class="chat-stage-watermark" aria-hidden="true">\s*<img class="ugk-svg-logo ugk-svg-logo-dark ugk-svg-logo-watermark"[^>]*>\s*<img class="ugk-svg-logo ugk-svg-logo-light ugk-svg-logo-watermark"[^>]*>\s*<\/div>/,
	);
	assert.match(response.body, /\.ugk-ascii-logo\s*\{[\s\S]*font-family:\s*"Courier New", Consolas, "Cascadia Mono", monospace;/);
	assert.match(response.body, /:root\[data-theme="dark"\]\s+\.ugk-svg-logo-light,\s*:root\[data-theme="light"\]\s+\.ugk-svg-logo-dark\s*\{\s*display:\s*none;/);
	assert.match(response.body, /\.chat-stage-watermark\s*\{[\s\S]*width:\s*clamp\(150px, 18vw, 280px\);[\s\S]*opacity:\s*0\.075;/);
	assert.match(response.body, /\.chat-stage-watermark \.ugk-svg-logo-watermark\s*\{[\s\S]*display:\s*block;[\s\S]*width:\s*100%;[\s\S]*opacity:\s*1;/);
	assert.doesNotMatch(response.body, /\.chat-stage-watermark\s*\{[^}]*width:\s*max-content;/);
	assert.match(response.body, /\.chat-stage > :not\(\.chat-stage-watermark\)\s*\{[\s\S]*z-index:\s*1;/);
	assert.match(response.body, /\.landing-side-right\s*\{[\s\S]*justify-self:\s*end;/);
	assert.match(response.body, /\.landing-side-right\s*\{[\s\S]*position:\s*static;/);
	assert.match(response.body, /\.landing-side-right\s*\{[\s\S]*width:\s*auto;/);
	assert.match(response.body, /\.landing-side-right\s*\{[\s\S]*background:\s*#080c14;/);
	assert.doesNotMatch(response.body, /\.landing-side-right\s*\{[\s\S]*linear-gradient\(180deg, rgba\(12, 17, 28, 0\.92\)/);
	assert.match(response.body, /\.desktop-conversation-rail\s*\{[\s\S]*background:\s*#0b1220;/);
	assert.match(response.body, /\.desktop-rail-settings\s*\{[\s\S]*border-top:\s*0;/);
	assert.doesNotMatch(response.body, /\.desktop-conversation-rail\s*\{[\s\S]*border-left:\s*2px solid rgba\(101, 209, 255, 0\.48\);/);
	assert.match(response.body, /\.desktop-conversation-list\s*\{[\s\S]*scrollbar-width:\s*none;/);
	assert.match(response.body, /\.desktop-conversation-list::-webkit-scrollbar\s*\{[\s\S]*display:\s*none;/);
	assert.match(response.body, /\.chat-stage\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*4px;[^}]*background:\s*transparent;[^}]*overflow:\s*hidden;/);
	assert.doesNotMatch(response.body, /\.chat-stage\s*\{[^}]*background:\s*rgba\(8, 13, 22, 0\.62\);/);
	assert.doesNotMatch(response.body, /\.chat-stage\s*\{[^}]*border:\s*1px solid rgba\(201, 210, 255, 0\.08\);/);
	assert.doesNotMatch(response.body, /\.chat-stage\s*\{[^}]*linear-gradient\(180deg, rgba\(11, 15, 25, 0\.72\), rgba\(5, 8, 15, 0\.86\)\)/);
	assert.match(response.body, /\.command-deck\s*\{[\s\S]*width:\s*100%;[\s\S]*border-radius:\s*4px;[\s\S]*overflow:\s*hidden;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.command-deck\s*\{[\s\S]*width:\s*100%;[\s\S]*border-radius:\s*4px;[\s\S]*overflow:\s*hidden;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.topbar::before\s*\{[\s\S]*display:\s*none;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.desktop-conversation-rail\s*\{[\s\S]*background:\s*#eaf1fa;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.chat-stage\s*\{[\s\S]*border-color:\s*transparent;[\s\S]*background:\s*rgba\(232, 239, 248, 0\.72\);[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.chat-stage-watermark\s*\{[\s\S]*opacity:\s*0\.055;/);
	assert.doesNotMatch(response.body, /:root\[data-theme="light"\]\s+\.chat-stage\s*\{[\s\S]*rgba\(255, 255, 255, 0\.78\);/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.landing-agent-card\s*\{[\s\S]*background:\s*#f6f9fe;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.message\.user \.file-chip\s*\{[\s\S]*background:\s*#c7ead8;/);
	assert.match(response.body, /:root\[data-theme="light"\]\s+\.message\.user \.file-chip-label\s*\{[\s\S]*color:\s*#153226;/);
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
	assert.match(response.body, /\.composer:focus-within\s*\{[\s\S]*background:\s*var\(--chat-composer-focus-bg\);[\s\S]*outline-color:\s*rgba\(201, 210, 255, 0\.22\);[\s\S]*box-shadow:\s*none;/);
	const composerFieldFocusBlock = response.body.match(
		/\.composer textarea:focus,\s*\n\s*\.composer input:focus,\s*\n\s*\.composer select:focus\s*\{([\s\S]*?)\n\s*\}/,
	);
	assert.ok(composerFieldFocusBlock);
	assert.match(composerFieldFocusBlock[1], /outline:\s*none;/);
	assert.doesNotMatch(composerFieldFocusBlock[1], /outline:\s*1px solid var\(--accent\);/);
	assert.doesNotMatch(composerFieldFocusBlock[1], /border-color:\s*var\(--accent\);/);
	assert.match(response.body, /\.composer textarea:focus\s*\{[\s\S]*background:\s*#1d3049;/);
	await app.close();
});

test("GET /playground uses a static workstation background instead of bright blue neon", async () => {
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
	assert.match(response.body, /background:\s*#070a12;/);
	assert.match(response.body, /body::before\s*\{[\s\S]*opacity:\s*0\.36;[\s\S]*background-size:\s*42px 42px, 42px 42px, 168px 168px, 168px 168px;/);
	assert.match(response.body, /--ugk-bg-base:\s*#070a12;/);
	assert.match(response.body, /--ugk-bg-opacity:\s*0\.36;/);
	assert.match(response.body, /\.shell:not\(\[data-home="true"\]\)\s*\{[\s\S]*background-image:\s*none;/);
	assert.match(response.body, /background-size:\s*auto;/);
	assert.match(response.body, /\.shell\[data-home="true"\]::after\s*\{[\s\S]*inset:\s*0;[\s\S]*linear-gradient\(180deg, rgba\(255, 255, 255, 0\.018\), transparent 210px\);/);
	assert.doesNotMatch(response.body, /radial-gradient\(circle at 1px 1px/);
	assert.doesNotMatch(response.body, /ugk-chat-bg-drift/);
	assert.doesNotMatch(response.body, /ugk-scan-glow/);
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
	assert.match(response.body, /\.scroll-to-bottom-button\s*\{[\s\S]*border:\s*0;/);
	assert.match(response.body, /\.scroll-to-bottom-button\s*\{[\s\S]*background:\s*#182336;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /:root\[data-theme="light"\] \.scroll-to-bottom-button\s*\{[\s\S]*border-color:\s*transparent;[\s\S]*background:\s*#d8f4e5;/);
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
