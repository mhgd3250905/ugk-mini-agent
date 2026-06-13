import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

test("GET /playground embeds conversation history restore and message copy controls", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /ugk-mini-agent:conversation-history-index/);
	assert.match(response.body, /function getConversationHistoryStorageKey\(conversationId\)\s*\{/);
	assert.match(response.body, /function restoreConversationHistory\(conversationId\)\s*\{/);
	assert.match(response.body, /function renderMoreConversationHistory\(\)\s*\{/);
	assert.match(response.body, /async function fetchConversationHistoryPage\(conversationId, options\)\s*\{/);
	assert.match(response.body, /function bindPlaygroundAssemblerEvents\(\)\s*\{/);
	assert.match(response.body, /function initializePlaygroundAssembler\(\)\s*\{/);
	assert.match(response.body, /bindPlaygroundAssemblerEvents\(\);/);
	assert.match(response.body, /initializePlaygroundAssembler\(\);/);
	assert.doesNotMatch(response.body, /async function fetchConversationHistory\(conversationId\)\s*\{/);
	assert.match(response.body, /function handleTranscriptScroll\(\)\s*\{/);
	assert.match(response.body, /transcript\.addEventListener\("scroll", handleTranscriptScroll\)/);
	assert.match(response.body, /id="transcript-archive"/);
	assert.match(response.body, /id="transcript-current"/);
	assert.match(response.body, /function archiveCurrentTranscript\(conversationId\)\s*\{/);
	assert.match(response.body, /const MAX_ARCHIVED_TRANSCRIPTS = 4;/);
	assert.match(response.body, /conversationState\?\.viewMessages/);
	assert.match(response.body, /viewLimit=" \+/);
	assert.match(response.body, /conversationState\?\.historyPage\?\.hasMore/);
	assert.match(response.body, /getAgentApiPath\("\/chat\/history"\) \+ "\?" \+ params\.toString\(\)/);
	assert.match(response.body, /state\.historyHasMore/);
	assert.match(response.body, /state\.historyNextBefore/);
	assert.match(response.body, /renderedMessages\.get\(activeRun\.assistantMessageId\)/);
	assert.match(response.body, /function findRenderedAssistantForActiveRun\(activeRun\)\s*\{/);
	assert.match(response.body, /String\(entry\.runId \|\| ""\)\.trim\(\) === runId/);
	assert.doesNotMatch(response.body, /usesServerViewMessages/);
	assert.doesNotMatch(response.body, /id: "active-input-" \+ activeRun\.runId/);
	assert.doesNotMatch(response.body, /function isActiveRunAlreadyRepresentedByHistory\(activeRun\)\s*\{/);
	assert.doesNotMatch(response.body, /function dedupeConversationHistoryEntries\(entries\)\s*\{/);
	assert.doesNotMatch(response.body, /id="history-load-more-button"/);
	assert.match(response.body, /id="history-auto-load-status"/);
	assert.match(response.body, /function syncHistoryAutoLoadStatus\(\)\s*\{/);
	assert.match(response.body, /historyAutoLoadStatus\.textContent = state\.historyLoadingMore/);
	assert.match(response.body, /transcript\.scrollTop <= 24 && hasOlderConversationHistory\(\)/);
	assert.doesNotMatch(response.body, /historyLoadMoreButton\.addEventListener\("click"/);
	assert.match(response.body, /async function createConversationOnServer\(\)\s*\{/);
	assert.match(response.body, /getAgentApiPath\("\/chat\/conversations"\)/);
	assert.match(response.body, /function createMessageActions\(entry, content\)\s*\{/);
	assert.match(response.body, /function clearAssistantStatusControls\(card\)\s*\{/);
	assert.match(response.body, /card\.querySelectorAll\("\.assistant-status-shell, \.assistant-run-log-trigger"\)\.forEach/);
	assert.match(response.body, /function exportMessageBodyAsImage\(body, entry, triggerButton\)\s*\{/);
	assert.match(response.body, /function sanitizeExportStyles\(cssText\)\s*\{/);
	assert.match(response.body, /function sanitizeExportStyles\(cssText\)\s*\{[\s\S]*@font-face/);
	assert.match(response.body, /\.replace\(\/url/);
	assert.match(response.body, /function prepareExportCloneForCanvas\(clone\)\s*\{/);
	assert.match(response.body, /clone\.querySelectorAll\("img, video, iframe, canvas"\)\.forEach/);
	assert.match(response.body, /"data:image\/svg\+xml;charset=utf-8," \+ encodeURIComponent\(svgText\)/);
	assert.match(response.body, /sanitizeExportStyles\(await collectExportStyles\(\)\)/);
	assert.match(response.body, /showError\("图片导出失败，请稍后重试。"\);/);
	assert.doesNotMatch(response.body, /showErrorBanner/);
	assert.doesNotMatch(response.body, /new Blob\(\[svgText\]/);
	assert.match(response.body, /function createMessageImageExportButton\(entry, body\)\s*\{/);
	assert.match(response.body, /message-actions/);
	assert.match(response.body, /message-copy-button/);
	assert.match(response.body, /message-image-export-button/);
	assert.match(response.body, /imageButton\.setAttribute\("aria-label", "保存为图片"\)/);
	assert.match(response.body, /export-signature/);
	assert.match(response.body, /message-export-media-placeholder/);
	assert.match(response.body, /function shouldRenderMessageActions\(entry\)\s*\{/);
	assert.match(response.body, /function syncRenderedMessageActions\(entry\)\s*\{/);
	assert.match(response.body, /if \(!shouldRenderMessageActions\(entry\)\) \{\s*existingActions\?\.remove\(\);/);
	assert.match(
		response.body,
		/function renderTranscriptEntry\(entry, insertMode\)\s*\{[\s\S]*if \(shouldRenderMessageActions\(entry\)\) \{\s*messageActions = createMessageActions\(entry, content\);[\s\S]*body\.appendChild\(messageActions\.actions\);/,
	);
	assert.match(response.body, /syncRenderedMessageActions\(historyEntry\);/);
	assert.doesNotMatch(response.body, /card\.appendChild\(messageActions\.actions\);/);
	assert.match(response.body, /\.message-body > \.message-actions\s*\{[\s\S]*margin-top:\s*0;/);
	assert.match(response.body, /\.message\.assistant \.message-body\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*0;/);
	assert.match(response.body, /\.message\.user \.message-body\s*\{[\s\S]*background:\s*var\(--chat-user-bg\);[\s\S]*color:\s*var\(--chat-user-fg\);/);
	assert.match(response.body, /:root\[data-theme="light"\]\s*\{[\s\S]*--chat-user-bg:/);
	assert.match(response.body, /function attachMobileMessageLongPressMenu\(entry, rendered\)\s*\{/);
	assert.match(response.body, /window\.setTimeout\(\(\) => \{[\s\S]*openMessageContextMenu\(entry, rendered\);[\s\S]*\}, 500\);/);
	assert.match(response.body, /\.message-context-menu/);
	assert.match(response.body, /\.message-body > \.message-actions\s*\{[\s\S]*display:\s*none;/);
	const messageActionButtonBlock = response.body.match(
		/\.message-copy-button,\s*\n\s*\.message-image-export-button\s*\{([\s\S]*?)\n\s*\}/,
	);
	assert.ok(messageActionButtonBlock);
	assert.match(messageActionButtonBlock[1], /width:\s*26px;/);
	assert.match(messageActionButtonBlock[1], /height:\s*26px;/);
	assert.match(messageActionButtonBlock[1], /border:\s*0;/);
	assert.match(messageActionButtonBlock[1], /background:\s*transparent;/);
	assert.match(messageActionButtonBlock[1], /box-shadow:\s*none;/);
	assert.match(messageActionButtonBlock[1], /color:\s*rgba\(226,\s*234,\s*255,\s*0\.52\);/);
	assert.doesNotMatch(messageActionButtonBlock[1], /border-color:\s*rgba\(201,\s*210,\s*255,\s*0\.2\);/);
	assert.doesNotMatch(messageActionButtonBlock[1], /background:\s*rgba\(201,\s*210,\s*255,\s*0\.05\);/);
	assert.match(response.body, /\.message-copy-button:hover:not\(:disabled\),[\s\S]*\.message-image-export-button:focus-visible\s*\{[\s\S]*background:\s*transparent;/);
	assert.doesNotMatch(response.body, /\.message-copy-button::before/);
	assert.match(response.body, /copyButton\.innerHTML =[\s\S]*message-action-icon[\s\S]*viewBox="0 0 16 16"/);
	assert.match(response.body, /imageButton\.innerHTML =[\s\S]*message-action-icon[\s\S]*viewBox="0 0 16 16"/);
	assert.match(response.body, /\.message-action-icon\s*\{[\s\S]*width:\s*16px;[\s\S]*height:\s*16px;[\s\S]*stroke:\s*currentColor;/);
	assert.match(response.body, /copyButton\.setAttribute\("aria-label", /);
	assert.match(response.body, /copyLabel\.className = "visually-hidden"/);
	assert.match(response.body, /copyButton\.setAttribute\("aria-label", original\)/);
	assert.match(response.body, /await copyTextToClipboard\(entry\.text \|\| ""\)/);
	assert.match(response.body, /function canPreviewFile\(mimeType\)\s*\{/);
	assert.match(response.body, /normalized === "text\/html"/);
	assert.match(response.body, /function buildDownloadUrl\(downloadUrl\)\s*\{/);
	assert.match(response.body, /openLink\.textContent = /);
	assert.match(response.body, /link\.textContent = /);
	await app.close();
});
