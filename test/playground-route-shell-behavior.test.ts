import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

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
	assert.match(response.body, /\.chat-stage\s*\{[\s\S]*grid-template-rows:\s*minmax\(0, 1fr\) auto;[\s\S]*padding:\s*0;[\s\S]*background:\s*transparent;/);
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.command-deck\s*\{[\s\S]*width:\s*100%;[\s\S]*margin:\s*0;[\s\S]*border-radius:\s*4px;[\s\S]*overflow:\s*hidden;/);
	assert.match(response.body, /id="new-conversation-button"/);
	assert.doesNotMatch(response.body, /id="view-skills-button"/);
	assert.match(response.body, /id="file-picker-action"/);
	assert.match(response.body, /id="open-asset-library-button" class="telemetry-card telemetry-action"/);
	assert.match(response.body, /\.telemetry-card\.telemetry-action\s*\{[\s\S]*background:\s*#101827;/);
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
	assert.match(response.body, /\.shell\[data-stage-mode="landing"\] \.composer\s*\{[\s\S]*border: 0;/);
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
	assert.match(response.body, /\.asset-pill-download-button\s*\{[\s\S]*background:\s*#173b29;/);
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
