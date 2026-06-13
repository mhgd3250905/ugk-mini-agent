import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

test("playground initial load defers non-chat panel data", async (t) => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({ method: "GET", url: "/playground" });
	assert.equal(response.statusCode, 200);

	const body = response.body;

	// state declares lazy gate flags
	assert.match(body, /assetsLoadedOnce: false/);
	assert.match(body, /connManagerLoadedOnce: false/);

	// The init function should NOT contain these eager calls.
	// Use indexOf to grab the region between the function definition and its call.
	const initDef = body.indexOf("function initializePlaygroundAssembler()");
	const initCall = body.indexOf("initializePlaygroundAssembler();", initDef + 1);
	assert.ok(initDef > 0, "init function definition not found");
	assert.ok(initCall > initDef, "init function call not found");
	const initRegion = body.slice(initDef, initCall);
	assert.doesNotMatch(initRegion, /void loadAssets\(/);
	assert.doesNotMatch(initRegion, /syncTaskInboxSummary/);
	assert.doesNotMatch(initRegion, /syncConnManagerUnreadSummary/);

	// init still loads agent status, but defers optional runtime panels.
	assert.match(initRegion, /loadAgentStatusAndRenderCards/);
	assert.doesNotMatch(initRegion, /syncRuntimeSummary/);

	// openAssetLibrary has lazy gate
	assert.match(body, /if \(!state\.assetsLoadedOnce\) \{ void loadAssets\(true\); \}/);

	// stream done event guards loadAssets with assetsLoadedOnce
	assert.match(body, /if \(state\.assetsLoadedOnce\) \{ void loadAssets\(true\); \}/);

	// focus/visibility conn summary refresh is guarded
	assert.match(body, /if \(state\.connManagerLoadedOnce\) \{ void syncConnManagerUnreadSummary/);

	await app.close();
});
