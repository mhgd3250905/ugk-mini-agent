import assert from "node:assert/strict";
import test from "node:test";
import { getPlaygroundConversationControllerScript } from "../src/ui/playground-conversations-controller.js";
import { getPlaygroundStreamControllerScript } from "../src/ui/playground-stream-controller.js";
import { getPlaygroundMobileShellEventHandlersScript } from "../src/ui/playground-mobile-shell-controller.js";
import { getPlaygroundStyles } from "../src/ui/playground-styles.js";

// --- Behavior tests: extract and eval pure math from generated script ---

function evalComputeVirtualWindow() {
	const script = getPlaygroundConversationControllerScript();
	const fnBlock = extractFunctionBlock(script, "computeVirtualWindow");
	assert.ok(fnBlock, "computeVirtualWindow must be extractable");
	// Wrap in an expression so eval returns the function
	return eval(`(${fnBlock})`);
}

test("computeVirtualWindow: scrolled viewport produces non-zero top spacer and visible slice near scroll position", () => {
	const computeVirtualWindow = evalComputeVirtualWindow();
	// 100 items, row height 60px, viewport 600px, scrollTop 3000
	const vw = computeVirtualWindow(3000, 600, 60, 5, 100);
	assert.ok(vw.startIndex > 0, "startIndex must be > 0 when scrolled down");
	assert.ok(vw.topSpacer > 0, "topSpacer must be > 0 when scrolled down");
	assert.ok(vw.startIndex <= 50 && vw.endIndex >= 50, "visible slice should include rows near scrollTop/rowHeight = 50");
	assert.ok(vw.endIndex - vw.startIndex + 1 <= 600 / 60 + 2 * 5 + 1, "shell count must be bounded by viewport + overscan");
});

test("computeVirtualWindow: top of list has zero top spacer", () => {
	const computeVirtualWindow = evalComputeVirtualWindow();
	const vw = computeVirtualWindow(0, 600, 60, 5, 100);
	assert.equal(vw.startIndex, 0, "startIndex must be 0 at top");
	assert.equal(vw.topSpacer, 0, "topSpacer must be 0 at top");
});

test("computeVirtualWindow: bottom of list has zero bottom spacer", () => {
	const computeVirtualWindow = evalComputeVirtualWindow();
	const totalScrollHeight = 100 * 60;
	const vw = computeVirtualWindow(totalScrollHeight - 600, 600, 60, 5, 100);
	assert.equal(vw.bottomSpacer, 0, "bottomSpacer must be 0 at bottom");
});

test("computeVirtualWindow: empty catalog returns empty range", () => {
	const computeVirtualWindow = evalComputeVirtualWindow();
	const vw = computeVirtualWindow(0, 600, 60, 5, 0);
	assert.equal(vw.startIndex, 0);
	assert.equal(vw.endIndex, -1);
	assert.equal(vw.topSpacer, 0);
	assert.equal(vw.bottomSpacer, 0);
});

test("computeVirtualWindow: spacer heights match startIndex * rowHeight and (total - endIndex - 1) * rowHeight", () => {
	const computeVirtualWindow = evalComputeVirtualWindow();
	const vw = computeVirtualWindow(1800, 600, 60, 5, 200);
	assert.equal(vw.topSpacer, vw.startIndex * 60, "topSpacer must equal startIndex * rowHeight");
	assert.equal(vw.bottomSpacer, Math.max(0, (200 - vw.endIndex - 1) * 60), "bottomSpacer must equal remaining rows * rowHeight");
});

test("computeVirtualWindow: mobile row height (80px) produces correct spacer math", () => {
	const computeVirtualWindow = evalComputeVirtualWindow();
	const vw = computeVirtualWindow(4000, 400, 80, 5, 100);
	assert.equal(vw.topSpacer, vw.startIndex * 80, "mobile topSpacer must equal startIndex * 80");
	assert.equal(vw.bottomSpacer, Math.max(0, (100 - vw.endIndex - 1) * 80), "mobile bottomSpacer must equal remaining rows * 80");
});

test("scheduleConversationVirtualScroll: two rapid calls must still produce at least one render", () => {
	const script = getPlaygroundConversationControllerScript();
	const fnBlock = extractFunctionBlock(script, "scheduleConversationVirtualScroll");
	assert.ok(fnBlock, "scheduleConversationVirtualScroll function block should be extractable");

	let conversationVirtualScrollRaf = 0;
	let nextRafId = 0;
	let renderCount = 0;
	let pendingRaf: (() => void) | null = null;
	let canceledRafId = 0;
	const window = {
		requestAnimationFrame: (cb: () => void) => {
			pendingRaf = cb;
			nextRafId += 1;
			return nextRafId;
		},
		cancelAnimationFrame: (id: number) => {
			canceledRafId = id;
			pendingRaf = null;
		},
	};
	function renderConversationListInto() {
		renderCount += 1;
	}
	const container = { scrollTop: 100, clientHeight: 600, innerHTML: "" };
	const scheduleFn = eval(`(${fnBlock})`);

	scheduleFn(container);
	scheduleFn(container);

	assert.equal(nextRafId, 1, "rapid calls should coalesce into a single pending rAF");
	assert.equal(canceledRafId, 0, "pending rAF should not be canceled and swallowed");
	assert.equal(renderCount, 0, "render should wait for rAF");
	const flushRaf = pendingRaf as (() => void) | null;
	assert.ok(flushRaf, "one rAF callback should remain pending");

	flushRaf();

	assert.equal(conversationVirtualScrollRaf, 0, "rAF id should clear after callback");
	assert.equal(renderCount, 1, "the pending rAF should render once");
});

test("renderConversationListInto: uses savedScrollTop (before innerHTML clearing) for computeVirtualWindow", () => {
	const script = getPlaygroundConversationControllerScript();
	const fnBlock = extractFunctionBlock(script, "renderConversationListInto");
	assert.ok(fnBlock, "renderConversationListInto must be extractable");
	// Must save scrollTop before clearing
	assert.match(fnBlock, /const savedScrollTop\s*=\s*container\.scrollTop/, "must save scrollTop before clearing");
	// Must use savedScrollTop (not container.scrollTop after clearing) in computeVirtualWindow
	assert.match(fnBlock, /computeVirtualWindow\s*\(\s*savedScrollTop/, "must pass savedScrollTop to computeVirtualWindow, not container.scrollTop");
	// Must restore scrollTop after rendering
	assert.match(fnBlock, /container\.scrollTop\s*=\s*savedScrollTop/, "must restore scrollTop after rendering");
});

test("renderConversationListInto: no active/menu range expansion that corrupts spacers", () => {
	const script = getPlaygroundConversationControllerScript();
	const fnBlock = extractFunctionBlock(script, "renderConversationListInto");
	assert.ok(fnBlock, "renderConversationListInto must be extractable");
	// Must NOT have startIndex/endIndex expansion for active/menu items
	const expansionPattern = /startIndex\s*=\s*Math\.min\s*\(\s*startIndex\s*,\s*(menuOpenIndex|activeIndex)\s*\)/;
	assert.doesNotMatch(fnBlock, expansionPattern, "must NOT expand startIndex to include far-away active/menu items");
	// Spacer heights must be computed from final startIndex/endIndex, not from vw
	// After removing expansion, vw.startIndex === startIndex and vw.topSpacer is correct
	assert.match(fnBlock, /vw\.topSpacer/, "top spacer uses vw.topSpacer which now matches final range");
	assert.match(fnBlock, /vw\.bottomSpacer/, "bottom spacer uses vw.bottomSpacer which now matches final range");
});

// --- Original tests (kept, unchanged) ---

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

	assert.match(renderFnBlock, /mobileConversationList\.replaceChildren\(\)/, "should clear mobile list when drawer is not open");
});

test("renderConversationListInto renders into a single container", () => {
	const script = getPlaygroundConversationControllerScript();

	assert.match(script, /function renderConversationListInto\(container\)/);
	assert.match(script, /container\.replaceChildren\(\)/);
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

test("computeVirtualWindow returns correct visible range for a scrolled list", () => {
	const script = getPlaygroundConversationControllerScript();

	assert.match(script, /function computeVirtualWindow\(/);

	const fnBlock = extractFunctionBlock(script, "computeVirtualWindow");
	assert.ok(fnBlock, "computeVirtualWindow function block should be extractable");

	// Verify the function signature includes the expected parameters
	assert.match(fnBlock, /scrollTop/, "should accept scrollTop");
	assert.match(fnBlock, /viewportHeight/, "should accept viewportHeight");
	assert.match(fnBlock, /itemHeight/, "should accept itemHeight");
	assert.match(fnBlock, /overscan/, "should accept overscan");
	assert.match(fnBlock, /total/, "should accept total");
});

test("virtual list constants declare fixed row heights aligned with CSS", () => {
	const script = getPlaygroundConversationControllerScript();

	assert.match(script, /CONVERSATION_DESKTOP_ROW_HEIGHT/);
	assert.match(script, /CONVERSATION_MOBILE_ROW_HEIGHT/);
	assert.match(script, /CONVERSATION_VIRTUAL_OVERSCAN/);

	const styles = getPlaygroundStyles();

	// Desktop: 58px item height + 2px gap = 60px
	assert.match(script, /CONVERSATION_DESKTOP_ROW_HEIGHT\s*=\s*60/);
	// Mobile: 72px item height from mobile asset override + 8px gap = 80px
	assert.match(script, /CONVERSATION_MOBILE_ROW_HEIGHT\s*=\s*80/);
	assert.match(styles, /\.mobile-conversation-list\s*\{[\s\S]*gap:\s*8px;/);
	assert.match(styles, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-conversation-item\s*\{[\s\S]*min-height:\s*72px;/);
	// Overscan: render a few extra rows above/below the viewport
	assert.match(script, /CONVERSATION_VIRTUAL_OVERSCAN\s*=\s*5/);
});

test("renderConversationListInto uses virtual window rendering with spacers", () => {
	const script = getPlaygroundConversationControllerScript();

	// Should create top spacer element
	assert.match(script, /conversation-virtual-spacer-top/);
	// Should create bottom spacer element
	assert.match(script, /conversation-virtual-spacer-bottom/);
	// Should use computeVirtualWindow to determine visible range
	assert.match(script, /computeVirtualWindow\(/);
	// Should only render items within startIndex..endIndex range
	assert.match(script, /startIndex/);
	assert.match(script, /endIndex/);
});

test("virtual scroll uses requestAnimationFrame throttling (coalescing, not cancel-and-return)", () => {
	const script = getPlaygroundConversationControllerScript();

	assert.match(script, /conversationVirtualScrollRaf/);
	assert.match(script, /requestAnimationFrame/);
	// After fix: if a RAF is already pending, we just return (let the existing RAF handle it)
	// We no longer cancel and swallow the update
	assert.doesNotMatch(script, /cancelAnimationFrame/, "fixed version should NOT cancel pending RAF");
});

// --- Task 3: Catalog refresh coalescing tests ---

test("scheduleConversationCatalogRefresh coalesces multiple calls into one timer", () => {
	const script = getPlaygroundConversationControllerScript();
	const fnBlock = extractFunctionBlock(script, "scheduleConversationCatalogRefresh");
	assert.ok(fnBlock, "scheduleConversationCatalogRefresh must be extractable");

	let nextTimerId = 0;
	let pendingTimers: Map<number, () => void> = new Map();
	let syncCallCount = 0;
	let syncedAtValues: number[] = [];

	const window = {
		setTimeout: (cb: () => void, _delay: number) => {
			nextTimerId += 1;
			pendingTimers.set(nextTimerId, cb);
			return nextTimerId;
		},
	};
	const state = { conversationCatalogSyncedAt: 12345 };
	function syncConversationCatalog() {
		syncedAtValues.push(state.conversationCatalogSyncedAt);
		syncCallCount += 1;
	}
	let conversationCatalogRefreshTimer: number | null = null;

	const scheduleFn = eval(`(${fnBlock})`);

	// First call registers a timer
	scheduleFn();
	assert.equal(pendingTimers.size, 1, "first call should register exactly 1 timer");
	assert.equal(syncCallCount, 0, "sync should NOT be called before timer fires");

	// Second call should coalesce — no new timer
	scheduleFn();
	assert.equal(pendingTimers.size, 1, "second call should not create another timer");
	assert.equal(syncCallCount, 0, "sync should still not be called");

	// Flush the pending timer
	const timer = pendingTimers.values().next().value as (() => void);
	assert.ok(timer, "pending timer callback should exist");
	timer();

	assert.equal(syncCallCount, 1, "flushing timer should call syncConversationCatalog exactly once");
	assert.equal(conversationCatalogRefreshTimer, null, "timer variable should be cleared after flush");
	assert.deepEqual(syncedAtValues, [0], "sync should see conversationCatalogSyncedAt reset to 0");

	// After flush, a new call should register a fresh timer
	scheduleFn();
	assert.equal(pendingTimers.size, 2, "post-flush call should register a new timer");
});

test("requestUpdateConversation does not force-refresh catalog after local upsert", () => {
	const script = getPlaygroundConversationControllerScript();

	// requestUpdateConversation should NOT contain force: true in its sync call
	const requestUpdateFnBlock = extractFunctionBlock(script, "requestUpdateConversation");
	assert.ok(requestUpdateFnBlock, "requestUpdateConversation must be extractable");
	assert.doesNotMatch(requestUpdateFnBlock, /force:\s*true/, "requestUpdateConversation should NOT use force: true");
	assert.doesNotMatch(requestUpdateFnBlock, /invalidateConversationCatalog\(\)/, "requestUpdateConversation should NOT call invalidateConversationCatalog");
	assert.match(requestUpdateFnBlock, /scheduleConversationCatalogRefresh\(\)/, "requestUpdateConversation should use scheduleConversationCatalogRefresh");
});

test("requestDeleteConversation still force-refreshes catalog (needs server-assigned current)", () => {
	const script = getPlaygroundConversationControllerScript();
	const fnBlock = extractFunctionBlock(script, "requestDeleteConversation");
	assert.ok(fnBlock, "requestDeleteConversation must be extractable");
	assert.match(fnBlock, /force:\s*true/, "requestDeleteConversation should keep force: true for server-assigned current");
});

test("scheduleConversationCatalogRefresh timer variable is declared", () => {
	const script = getPlaygroundConversationControllerScript();
	assert.match(script, /let conversationCatalogRefreshTimer\s*=\s*null/, "timer variable must be declared");
});

// --- Step 5: Event delegation behavioral tests ---

function makeEl(props: Record<string, unknown> = {}) {
	return {
		closest(selector: string) {
			const map = props.closest as Record<string, unknown> | undefined;
			return map?.[selector] ?? null;
		},
		querySelector(selector: string) {
			const map = props.querySelector as Record<string, unknown> | undefined;
			return map?.[selector] ?? null;
		},
		dataset: (props.dataset ?? {}) as Record<string, string>,
		disabled: Boolean(props.disabled),
	};
}

test("handleConversationListClick: menu trigger toggles conversation menu", () => {
	const script = getPlaygroundConversationControllerScript();
	const fnBlock = extractFunctionBlock(script, "handleConversationListClick");
	assert.ok(fnBlock, "handleConversationListClick must be extractable");

	let toggledId = "";
	function toggleConversationMenu(id: string) { toggledId = id; }
	function requestUpdateConversation() {}
	function requestRenameConversation() {}
	function requestDeleteConversation() {}
	function selectConversationFromDrawer() {}
	const state = { conversationCatalog: [] as unknown[] };

	const button = makeEl({ dataset: { conversationId: "conv-1" } });
	const trigger = makeEl({ closest: { ".mobile-conversation-item": button } });
	const event = {
		target: makeEl({ closest: { ".conversation-item-menu-trigger": trigger } }),
		preventDefault() {},
		stopPropagation() {},
	};

	eval(`(${fnBlock})`)(event);
	assert.equal(toggledId, "conv-1", "should call toggleConversationMenu with correct conversation ID");
});

test("handleConversationListClick: pin menu item calls requestUpdateConversation", () => {
	const script = getPlaygroundConversationControllerScript();
	const fnBlock = extractFunctionBlock(script, "handleConversationListClick");
	assert.ok(fnBlock, "handleConversationListClick must be extractable");

	const updateCalls: Array<{ id: string; patch: Record<string, unknown> }> = [];
	function toggleConversationMenu() {}
	function requestUpdateConversation(id: string, patch: Record<string, unknown>) { updateCalls.push({ id, patch }); }
	function requestRenameConversation() {}
	function requestDeleteConversation() {}
	function selectConversationFromDrawer() {}
	const catalogItem = { conversationId: "conv-2", pinned: false };
	const state = { conversationCatalog: [catalogItem] };

	const button = makeEl({ dataset: { conversationId: "conv-2" } });
	const shell = makeEl({
		querySelector: {
			".mobile-conversation-item": button,
			".conversation-item-menu-trigger": makeEl(),
		},
	});
	const menuItem = makeEl({
		dataset: { action: "pin" },
		disabled: false,
		closest: { ".conversation-item-shell": shell },
	});
	const event = {
		target: makeEl({
			closest: {
				".conversation-item-menu-trigger": null,
				".conversation-color-swatch": null,
				".conversation-menu-item": menuItem,
			},
		}),
		preventDefault() {},
		stopPropagation() {},
	};

	eval(`(${fnBlock})`)(event);
	assert.equal(updateCalls.length, 1, "requestUpdateConversation should have been called once");
	assert.equal(updateCalls[0].id, "conv-2");
	assert.deepEqual(updateCalls[0].patch, { pinned: true });
});

test("handleConversationListClick: color swatch calls requestUpdateConversation", () => {
	const script = getPlaygroundConversationControllerScript();
	const fnBlock = extractFunctionBlock(script, "handleConversationListClick");
	assert.ok(fnBlock, "handleConversationListClick must be extractable");

	const updateCalls: Array<{ id: string; patch: Record<string, unknown> }> = [];
	function toggleConversationMenu() {}
	function requestUpdateConversation(id: string, patch: Record<string, unknown>) { updateCalls.push({ id, patch }); }
	function requestRenameConversation() {}
	function requestDeleteConversation() {}
	function selectConversationFromDrawer() {}
	const state = { conversationCatalog: [] as unknown[] };

	const button = makeEl({ dataset: { conversationId: "conv-3" } });
	const shell = makeEl({ querySelector: { ".mobile-conversation-item": button } });
	const swatch = makeEl({
		dataset: { color: "sky" },
		disabled: false,
		closest: { ".conversation-item-shell": shell },
	});
	const event = {
		target: makeEl({
			closest: {
				".conversation-item-menu-trigger": null,
				".conversation-color-swatch": swatch,
			},
		}),
		preventDefault() {},
		stopPropagation() {},
	};

	eval(`(${fnBlock})`)(event);
	assert.equal(updateCalls.length, 1, "requestUpdateConversation should have been called once");
	assert.equal(updateCalls[0].id, "conv-3");
	assert.deepEqual(updateCalls[0].patch, { backgroundColor: "sky" });
});

test("handleConversationListClick: row click calls selectConversationFromDrawer", () => {
	const script = getPlaygroundConversationControllerScript();
	const fnBlock = extractFunctionBlock(script, "handleConversationListClick");
	assert.ok(fnBlock, "handleConversationListClick must be extractable");

	let selectedId = "";
	function toggleConversationMenu() {}
	function requestUpdateConversation() {}
	function requestRenameConversation() {}
	function requestDeleteConversation() {}
	function selectConversationFromDrawer(id: string) { selectedId = id; }
	const state = { conversationCatalog: [] as unknown[] };

	const button = makeEl({ dataset: { conversationId: "conv-4" }, disabled: false });
	const event = {
		target: makeEl({
			closest: {
				".conversation-item-menu-trigger": null,
				".conversation-color-swatch": null,
				".conversation-menu-item": null,
				".mobile-conversation-item": button,
			},
		}),
		preventDefault() {},
		stopPropagation() {},
	};

	eval(`(${fnBlock})`)(event);
	assert.equal(selectedId, "conv-4", "should call selectConversationFromDrawer with correct conversation ID");
});

test("renderConversationListInto has no per-row addEventListener", () => {
	const script = getPlaygroundConversationControllerScript();
	const fnBlock = extractFunctionBlock(script, "renderConversationListInto");
	assert.ok(fnBlock, "renderConversationListInto must be extractable");

	assert.doesNotMatch(fnBlock, /addEventListener/, "renderConversationListInto must not contain any addEventListener calls — delegation handles all clicks");
});

test("renderConversationListInto keeps conversation rows to title and time only", () => {
	const script = getPlaygroundConversationControllerScript();
	const fnBlock = extractFunctionBlock(script, "renderConversationListInto");
	assert.ok(fnBlock, "renderConversationListInto must be extractable");

	assert.match(fnBlock, /mobile-conversation-title/, "row should still render the conversation title");
	assert.match(fnBlock, /mobile-conversation-meta/, "row should still render the time metadata");
	assert.doesNotMatch(fnBlock, /mobile-conversation-preview/, "row should not render the secondary preview line");
	assert.doesNotMatch(fnBlock, /metaCount/, "row should not render a message count pill");
});

test("mobile shell event handlers wire delegation on both conversation list containers", () => {
	const handlers = getPlaygroundMobileShellEventHandlersScript();

	assert.match(handlers, /desktopConversationList\.addEventListener\("click",\s*handleConversationListClick\)/, "desktop list must use delegated click handler");
	assert.match(handlers, /mobileConversationList\.addEventListener\("click",\s*handleConversationListClick\)/, "mobile list must use delegated click handler");
});

// --- Stream controller catalog refresh tests ---

test("sendMessage does not fire premature syncConversationCatalog before resolveServerActiveConversation", () => {
	const script = getPlaygroundStreamControllerScript();

	// The sendMessage function should NOT have a standalone syncConversationCatalog before resolveServerActiveConversation
	// Old pattern: "else { void syncConversationCatalog({ silent: true, activateCurrent: false }); }" before resolveServerActiveConversation
	const sendMessageBlock = extractFunctionBlock(script, "sendMessage");
	assert.ok(sendMessageBlock, "sendMessage must be extractable");

	// Should not contain the pattern of sync before resolveServerActiveConversation
	// Specifically: no "else { void syncConversationCatalog" pattern
	assert.doesNotMatch(
		sendMessageBlock,
		/else\s*\{\s*void syncConversationCatalog\(\{/,
		"sendMessage should NOT have an else branch with premature syncConversationCatalog",
	);

	// Must still call resolveServerActiveConversation
	assert.match(sendMessageBlock, /resolveServerActiveConversation/, "sendMessage must still call resolveServerActiveConversation");
});

test("done event handler schedules catalog refresh to update message count/preview", () => {
	const script = getPlaygroundStreamControllerScript();

	// The done case must contain scheduleConversationCatalogRefresh
	const doneMatch = script.match(/case\s+"done"[\s\S]{1,2000}break;/);
	assert.ok(doneMatch, "done case block must be extractable");
	assert.match(doneMatch[0], /scheduleConversationCatalogRefresh/, "done handler must call scheduleConversationCatalogRefresh");
});

test("upsertConversationCatalogItem updates catalog locally and re-renders", () => {
	const script = getPlaygroundConversationControllerScript();
	const fnBlock = extractFunctionBlock(script, "upsertConversationCatalogItem");
	assert.ok(fnBlock, "upsertConversationCatalogItem must be extractable");

	// Must call sortConversationCatalog for correct ordering
	assert.match(fnBlock, /sortConversationCatalog\(\)/, "must sort catalog after upsert");
	// Must call renderConversationDrawer for UI update
	assert.match(fnBlock, /renderConversationDrawer\(\)/, "must re-render after upsert");
});

test("removeConversationCatalogItem updates catalog locally and re-renders", () => {
	const script = getPlaygroundConversationControllerScript();
	const fnBlock = extractFunctionBlock(script, "removeConversationCatalogItem");
	assert.ok(fnBlock, "removeConversationCatalogItem must be extractable");

	assert.match(fnBlock, /renderConversationDrawer\(\)/, "must re-render after remove");
});

function extractRenderConversationDrawerBlock(script: string): string | null {
	const startMarker = "function renderConversationDrawer()";
	const startIdx = script.indexOf(startMarker);
	if (startIdx === -1) return null;
	return extractBraceBlock(script, startIdx);
}

function extractFunctionBlock(script: string, fnName: string): string | null {
	const startMarker = `function ${fnName}(`;
	const startIdx = script.indexOf(startMarker);
	if (startIdx === -1) return null;
	return extractBraceBlock(script, startIdx);
}

function extractBraceBlock(script: string, startIdx: number): string | null {
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
