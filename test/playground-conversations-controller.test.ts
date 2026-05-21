import assert from "node:assert/strict";
import test from "node:test";
import { getPlaygroundConversationControllerScript } from "../src/ui/playground-conversations-controller.js";
import { getPlaygroundMobileShellEventHandlersScript } from "../src/ui/playground-mobile-shell-controller.js";

test("renderConversationDrawer uses isDesktopViewport helper for conditional rendering", () => {
	const script = getPlaygroundConversationControllerScript();

	assert.match(script, /function isDesktopViewport\(\)/);
	assert.match(script, /matchMedia\("\(min-width:\s*641px\)"\)/);
});

test("renderConversationDrawer does not unconditionally render both mobile and desktop lists", () => {
	const script = getPlaygroundConversationControllerScript();

	const renderFnBlock = extractRenderConversationDrawerBlock(script);
	assert.ok(renderFnBlock, "renderConversationDrawer function block should be extractable");

	assert.match(renderFnBlock, /isDesktopViewport\(\)/, "should check isDesktopViewport for desktop rendering");
	assert.match(renderFnBlock, /state\.mobileConversationDrawerOpen/, "should check drawer open state for mobile rendering");
	assert.doesNotMatch(script, /renderConversationListInto\(mobileConversationList\);\s*\n\s*renderConversationListInto\(desktopConversationList\);/, "should NOT unconditionally render both lists back-to-back");
});

test("mobile list is cleared when drawer is closed inside renderConversationDrawer", () => {
	const script = getPlaygroundConversationControllerScript();

	const renderFnBlock = extractRenderConversationDrawerBlock(script);
	assert.ok(renderFnBlock, "renderConversationDrawer function block should be extractable");

	assert.match(renderFnBlock, /mobileConversationList\.innerHTML\s*=\s*""/, "should clear mobile list when drawer is not open");
});

test("renderConversationListInto renders into a single container", () => {
	const script = getPlaygroundConversationControllerScript();

	assert.match(script, /function renderConversationListInto\(container\)/);
	assert.match(script, /container\.innerHTML\s*=\s*""/);
	assert.match(script, /container\.appendChild\(shell\)/);
});

test("conversation menu toggle and close still call renderConversationDrawer", () => {
	const script = getPlaygroundConversationControllerScript();

	assert.match(script, /function closeConversationMenu\(\)/);
	assert.match(script, /function toggleConversationMenu\(conversationId\)/);
	assert.match(script, /renderConversationDrawer\(\)/);
});

test("renderConversationDrawer only has one definition (dead first definition removed)", () => {
	const script = getPlaygroundConversationControllerScript();

	const definitions = countFunctionDefinitions(script, "renderConversationDrawer");
	assert.equal(definitions, 1, "renderConversationDrawer should have exactly one definition");
});

test("desktop list renders conversation items with shell, menu, and pin/color states", () => {
	const script = getPlaygroundConversationControllerScript();

	assert.match(script, /conversation-item-shell/);
	assert.match(script, /conversation-item-menu-trigger/);
	assert.match(script, /is-pinned/);
	assert.match(script, /getConversationBackgroundClass/);
});

test("matchMedia breakpoint change triggers renderConversationDrawer", () => {
	const handlers = getPlaygroundMobileShellEventHandlersScript();

	assert.match(handlers, /matchMedia\("\(min-width:\s*641px\)"\)/, "should listen for the 641px breakpoint");
	assert.match(handlers, /addEventListener\("change"/, "should use change event on matchMedia");
	assert.match(handlers, /renderConversationDrawer\(\)/, "should call renderConversationDrawer on breakpoint change");
});

function extractRenderConversationDrawerBlock(script: string): string | null {
	const startMarker = "function renderConversationDrawer()";
	const startIdx = script.indexOf(startMarker);
	if (startIdx === -1) return null;
	let depth = 0;
	let endIdx = startIdx;
	for (let i = startIdx; i < script.length; i++) {
		if (script[i] === "{") depth++;
		else if (script[i] === "}") depth--;
		if (depth === 0 && script[i] === "}") {
			endIdx = i + 1;
			break;
		}
	}
	return script.slice(startIdx, endIdx);
}

function countFunctionDefinitions(script: string, fnName: string): number {
	const pattern = new RegExp(`function ${fnName}\\(`, "g");
	const matches = script.match(pattern);
	return matches ? matches.length : 0;
}