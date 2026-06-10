import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

test("GET /playground ignores stale conversation history responses and clears archived transcript DOM", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /function clearRenderedTranscript\(\)\s*\{[\s\S]*transcriptCurrent\.innerHTML = "";/);
	assert.match(response.body, /function clearRenderedTranscript\(\)\s*\{[\s\S]*transcriptArchive\.innerHTML = "";/);
	assert.match(
		response.body,
		/function isConversationSyncTokenCurrent\(syncToken, conversationId\)\s*\{[\s\S]*syncToken\.requestId >= state\.conversationAppliedSyncRequestId/,
	);
	assert.match(
		response.body,
		/const syncToken = issueConversationSyncToken\(nextConversationId\);[\s\S]*const payload = await fetchConversationState\(nextConversationId, \{\s*signal: syncToken\.abortController\?\.signal,\s*\}\);[\s\S]*if \(!renderConversationState\(payload, syncToken\)\)\s*\{\s*return payload;\s*\}/,
	);
	assert.match(
		response.body,
		/function renderConversationState\(conversationState, syncToken\)\s*\{[\s\S]*if \(!shouldApplyConversationState\(conversationState, syncToken\)\)\s*\{\s*return false;\s*\}/,
	);
	await app.close();
});

test("GET /playground unifies conversation sync ownership with invalidation tokens", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /conversationSyncGeneration:\s*0,/);
	assert.match(response.body, /conversationSyncRequestId:\s*0,/);
	assert.match(response.body, /conversationStateAbortController:\s*null,/);
	assert.match(response.body, /function invalidateConversationSyncOwnership\(nextConversationId\)\s*\{/);
	assert.match(response.body, /function abortConversationStateSync\(\)\s*\{/);
	assert.match(response.body, /function issueConversationSyncToken\(conversationId\)\s*\{/);
	assert.match(response.body, /abortConversationStateSync\(\);[\s\S]*const abortController = typeof AbortController === "function"[\s\S]*state\.conversationStateAbortController = abortController;/);
	assert.match(response.body, /function isConversationSyncTokenCurrent\(syncToken, conversationId\)\s*\{/);
	assert.match(response.body, /function shouldApplyConversationState\(conversationState, syncToken\)\s*\{/);
	assert.match(
		response.body,
		/stopActiveRunEventStream\(\);[\s\S]*invalidateConversationSyncOwnership\(nextConversationId\);[\s\S]*state\.conversationId = nextConversationId;/,
	);
	assert.match(
		response.body,
		/const syncToken = issueConversationSyncToken\(nextConversationId\);[\s\S]*const payload = await fetchConversationState\(nextConversationId, \{\s*signal: syncToken\.abortController\?\.signal,\s*\}\);[\s\S]*if \(!renderConversationState\(payload, syncToken\)\)\s*\{/,
	);
	assert.match(response.body, /if \(isConversationStateAbortError\(error\)\) \{/);
	assert.match(
		response.body,
		/function renderConversationState\(conversationState, syncToken\)\s*\{[\s\S]*if \(!shouldApplyConversationState\(conversationState, syncToken\)\)\s*\{\s*return false;\s*\}/,
	);
	await app.close();
});

test("GET /playground syncs the current conversation from the server catalog", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /async function fetchConversationCatalog\(options\)\s*\{/);
	assert.match(response.body, /getAgentApiPath\("\/chat\/conversations"\)/);
	assert.match(response.body, /async function createConversationOnServer\(\)\s*\{/);
	assert.match(response.body, /POST",\s*headers:[\s\S]*getAgentApiPath\("\/chat\/conversations"\)/);
	assert.match(response.body, /body: JSON\.stringify\(\{\}\),/);
	assert.match(response.body, /async function switchConversationOnServer\(conversationId\)\s*\{/);
	assert.match(response.body, /getAgentApiPath\("\/chat\/current"\)/);
	assert.match(response.body, /conversationCatalogSyncPromise:\s*null,/);
	assert.match(response.body, /conversationCatalogAbortController:\s*null,/);
	assert.match(response.body, /conversationCatalogSyncedAt:\s*0,/);
	assert.match(response.body, /async function syncConversationCatalog\(options\)\s*\{/);
	assert.match(response.body, /const hasFreshCatalog =[\s\S]*CONVERSATION_CATALOG_FRESH_MS;/);
	assert.match(response.body, /function abortConversationCatalogSync\(\)\s*\{/);
	assert.match(response.body, /function releaseConversationCatalogSync\(syncPromise, abortController\)\s*\{/);
	assert.match(response.body, /function isConversationCatalogAbortError\(error\)\s*\{/);
	assert.match(response.body, /function invalidateConversationCatalog\(\)\s*\{[\s\S]*abortConversationCatalogSync\(\);/);
	assert.match(response.body, /if \(options\?\.force\) \{[\s\S]*abortConversationCatalogSync\(\);[\s\S]*\}/);
	assert.match(response.body, /if \(state\.conversationCatalogSyncPromise\) \{[\s\S]*return await state\.conversationCatalogSyncPromise;/);
	assert.match(response.body, /const abortController = typeof AbortController === "function" \? new AbortController\(\) : null;/);
	assert.match(response.body, /const payload = await fetchConversationCatalog\(\{\s*signal: abortController\?\.signal,\s*\}\);/);
	assert.match(response.body, /if \(isConversationCatalogAbortError\(error\)\) \{[\s\S]*return getConversationCatalogSnapshot\(\);[\s\S]*\}/);
	assert.match(response.body, /releaseConversationCatalogSync\(syncPromise, abortController\);/);
	assert.match(response.body, /async function ensureCurrentConversation\(options\)\s*\{/);
	assert.match(response.body, /function upsertConversationCatalogItem\(item, options\)\s*\{/);
	assert.doesNotMatch(response.body, /const GLOBAL_CONVERSATION_ID = "agent:global";/);
	assert.doesNotMatch(response.body, /conversationInput\.readOnly = true;/);
	await app.close();
});

test("GET /playground activates conversations without redundant state and catalog round-trips", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(
		response.body,
		/async function activateConversation\(conversationId, options\)\s*\{[\s\S]*void restoreConversationHistoryFromServer\(nextConversationId, \{\s*silent: true,\s*clearIfIdle: true,\s*attachIfRunning: true,\s*\}\);/,
	);
	assert.doesNotMatch(
		response.body,
		/async function activateConversation\(conversationId, options\)\s*\{[\s\S]*await restoreConversationHistoryFromServer\(nextConversationId, \{\s*silent: true,\s*clearIfIdle: true,\s*attachIfRunning: true,\s*\}\);/,
	);
	assert.doesNotMatch(
		response.body,
		/async function activateConversation\(conversationId, options\)\s*\{[\s\S]*await restoreConversationHistoryFromServer\(nextConversationId\);[\s\S]*await syncConversationRunState\(nextConversationId,/,
	);
	assert.match(
		response.body,
		/async function selectConversationFromDrawer\(conversationId\)\s*\{[\s\S]*closeMobileConversationDrawer\(\);[\s\S]*const result = await switchConversationOnServer\(nextConversationId\);[\s\S]*await activateConversation\(result\.currentConversationId \|\| result\.conversationId, \{\s*skipCatalogSync: true,\s*skipServerSwitch: true,\s*\}\);/,
	);
	assert.match(
		response.body,
		/const hasPendingSwitch = Object\.keys\(state\.conversationSwitchPendingById \|\| \{\}\)\.length > 0;[\s\S]*button\.disabled = state\.loading \|\| hasPendingSwitch;/,
	);
	assert.match(
		response.body,
		/async function selectConversationFromDrawer\(conversationId\)\s*\{[\s\S]*if \(Object\.keys\(state\.conversationSwitchPendingById \|\| \{\}\)\.length > 0\) \{[\s\S]*return;[\s\S]*\}/,
	);
	assert.doesNotMatch(response.body, /button\.disabled = state\.loading \|\| item\.conversationId === state\.conversationId;/);
	assert.match(
		response.body,
		/conversationCreatePending:\s*false,/,
	);
	assert.match(
		response.body,
		/function isCurrentConversationBlank\(\)\s*\{[\s\S]*catalogMessageCount === 0[\s\S]*visibleMessageCount === 0[\s\S]*renderedMessages\.size === 0/,
	);
	assert.match(
		response.body,
		/async function startNewConversation\(\)\s*\{[\s\S]*if \(isCurrentConversationBlank\(\)\) \{[\s\S]*return true;[\s\S]*\}[\s\S]*if \(state\.conversationCreatePending\) \{[\s\S]*return false;[\s\S]*\}[\s\S]*state\.conversationCreatePending = true;[\s\S]*finally \{[\s\S]*state\.conversationCreatePending = false;[\s\S]*\}/,
	);
	assert.match(
		response.body,
		/async function startNewConversation\(\)\s*\{[\s\S]*const optimisticTimestamp = new Date\(\)\.toISOString\(\);[\s\S]*upsertConversationCatalogItem\([\s\S]*conversationId: nextConversationId,[\s\S]*\{ isNew: true \},[\s\S]*const activated = await activateConversation\(nextConversationId, \{\s*skipCatalogSync: true,\s*skipServerSwitch: true,\s*\}\);[\s\S]*return activated;/,
	);
	assert.doesNotMatch(
		response.body,
		/async function startNewConversation\(\)\s*\{[\s\S]*await syncConversationCatalog\(/,
	);
	await app.close();
});
