import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

test("GET /playground uses a compact mobile topbar with overflow actions", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /class="mobile-topbar"/);
	assert.match(response.body, /class="mobile-brand-logo desktop-brand"[^>]*aria-label="UGK CLAW"/);
	assert.match(response.body, /class="ugk-svg-logo ugk-svg-logo-dark ugk-svg-logo-topbar" src="\/ugk-claw-logo\.svg"/);
	assert.match(response.body, /class="ugk-svg-logo ugk-svg-logo-light ugk-svg-logo-topbar" src="\/ugk-claw-logo-light\.svg"/);
	assert.match(response.body, /class="ugk-ascii-logo ugk-ascii-logo-topbar"/);
	assert.doesNotMatch(response.body, /class="ugk-ascii-logo ugk-ascii-logo-mobile"/);
	assert.doesNotMatch(response.body, /class="mobile-brand-wordmark">UGK Claw</);
	assert.doesNotMatch(response.body, /class="mobile-brand-logo"[^>]*src="\/ugk-claw-mobile-logo\.png"/);
	assert.match(response.body, /id="mobile-new-conversation-button"/);
	assert.match(response.body, /id="mobile-overflow-menu-button"/);
	assert.match(response.body, /class="mobile-topbar-button mobile-topbar-button-with-badge"/);
	assert.match(response.body, /id="mobile-overflow-task-inbox-badge"/);
	assert.match(response.body, /id="mobile-overflow-menu"/);
	assert.match(response.body, /class="mobile-overflow-menu"/);
	assert.match(response.body, /id="mobile-overflow-menu"[^>]*hidden|hidden[^>]*id="mobile-overflow-menu"/);
	assert.doesNotMatch(response.body, /id="mobile-menu-skills-button"/);
	assert.match(response.body, /id="mobile-menu-file-button"/);
	assert.match(response.body, /id="mobile-menu-library-button"/);
	assert.match(response.body, /id="mobile-menu-task-inbox-button"/);
	assert.match(response.body, /id="mobile-menu-model-config-button"/);
	assert.match(response.body, /id="mobile-menu-model-sources-link"/);
	assert.doesNotMatch(response.body, /id="mobile-menu-browser-workbench-button"/);
	assert.match(response.body, /id="mobile-task-inbox-unread-badge"/);
	assert.match(response.body, /\.mobile-topbar\s*\{[\s\S]*display:\s*none;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-topbar\s*\{[\s\S]*display:\s*grid;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.landing-side-right\s*\{[\s\S]*display:\s*contents;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.landing-side-right > \.telemetry-action\s*\{[\s\S]*display:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.shell\[data-home="true"\]\s*\{[\s\S]*height:\s*100dvh;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.shell\[data-home="true"\] \.landing-screen\s*\{[\s\S]*overflow-y:\s*auto;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.shell\[data-home="true"\] \.landing-screen\s*\{[\s\S]*-webkit-overflow-scrolling:\s*touch;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.shell\[data-home="true"\] \.landing-grid\s*\{[\s\S]*justify-content:\s*flex-start;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.landing-logo \.ugk-svg-logo-watermark\s*\{[\s\S]*opacity:\s*0\.88;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.landing-agent-cards\s*\{[\s\S]*max-width:\s*480px;/);
	assert.doesNotMatch(response.body, /\.landing-side-right > \.topbar-context-slot\s*\{[\s\S]*display:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.topbar\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-topbar\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto auto;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.mobile-topbar\s*\{[\s\S]*min-height:\s*48px;/);
	assert.match(response.body, /\.topbar-context-slot\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /\.mobile-topbar-button\s*\{[\s\S]*width:\s*36px;[\s\S]*border:\s*1px solid transparent;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /\.mobile-topbar-button:hover:not\(:disabled\),[\s\S]*\.mobile-topbar-button:focus-visible\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /@media \(max-width: 640px\) \{[\s\S]*\.topbar-context-slot \.context-usage-shell,[\s\S]*\.topbar-context-slot \.context-usage-shell\[data-expanded="true"\]\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
	assert.match(response.body, /\.mobile-topbar-notification-badge\s*\{[\s\S]*min-width:\s*18px;[\s\S]*background:\s*#ff1744;/);
	assert.match(response.body, /\.mobile-overflow-menu-item-badge\s*\{[\s\S]*background:\s*#ff1744;/);
	assert.match(response.body, /\.telemetry-action-badge\s*\{[\s\S]*background:\s*#ff1744;/);
	assert.match(response.body, /\.mobile-overflow-menu-item\s*\{[\s\S]*grid-template-columns:\s*18px minmax\(0, 1fr\) auto;/);
	const mobileDrawerBackdropBlock = response.body.match(/\.mobile-drawer-backdrop\s*\{([\s\S]*?)\n\s*\}/);
	assert.ok(mobileDrawerBackdropBlock);
	assert.match(mobileDrawerBackdropBlock[1], /background:\s*transparent;/);
	assert.match(mobileDrawerBackdropBlock[1], /backdrop-filter:\s*none;/);
	assert.doesNotMatch(mobileDrawerBackdropBlock[1], /blur\(10px\)/);
	const mobileConversationListBlock = response.body.match(/\.mobile-conversation-list\s*\{([\s\S]*?)\n\s*\}/);
	assert.ok(mobileConversationListBlock);
	assert.match(mobileConversationListBlock[1], /scrollbar-width:\s*none;/);
	assert.match(mobileConversationListBlock[1], /-ms-overflow-style:\s*none;/);
	assert.match(response.body, /\.mobile-conversation-list::-webkit-scrollbar\s*\{[\s\S]*display:\s*none;/);
	const mobileConversationItemBlock = response.body.match(/\.mobile-conversation-item\s*\{([\s\S]*?)\n\s*\}/);
	assert.ok(mobileConversationItemBlock);
	assert.match(mobileConversationItemBlock[1], /border-radius:\s*4px;/);
	assert.doesNotMatch(mobileConversationItemBlock[1], /border-radius:\s*14px;/);
	assert.match(response.body, /mobileNewConversationButton\.addEventListener\("click", \(\) => \{/);
	assert.match(response.body, /mobileOverflowMenuButton\.addEventListener\("click", \(event\) => \{/);
	assert.match(response.body, /function setMobileOverflowMenuOpen\(next\)\s*\{/);
	assert.match(response.body, /function closeMobileOverflowMenu\(\)\s*\{/);
	assert.doesNotMatch(response.body, /mobileMenuSkillsButton\.addEventListener\("click", \(\) => \{/);
	assert.match(response.body, /mobileMenuFileButton\.addEventListener\("click", \(\) => \{/);
	assert.match(response.body, /mobileMenuLibraryButton\.addEventListener\("click", \(\) => \{/);
	assert.match(response.body, /mobileMenuTaskInboxButton\.addEventListener\("click", \(\) => \{/);
	assert.doesNotMatch(response.body, /class="mobile-action-strip"/);
	await app.close();
});

test("GET /playground does not ship visible shadow effects", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground",
	});

	assert.equal(response.statusCode, 200);
	const visibleBoxShadowValues = [...response.body.matchAll(/box-shadow\s*:\s*([\s\S]*?);/g)]
		.map((match) => match[1]?.trim() ?? "")
		.filter((value) => value !== "none" && value !== "none !important" && !value.startsWith("inset "));
	assert.ok(
		visibleBoxShadowValues.every(
			(value) =>
				value.includes("rgba(101, 209, 255") ||
				value.includes("rgba(8, 120, 75") ||
				value.includes("rgba(0, 0, 0"),
		),
	);
	assert.doesNotMatch(response.body, /drop-shadow\s*\(/);
	const visibleTextShadowValues = [...response.body.matchAll(/text-shadow\s*:\s*([\s\S]*?);/g)]
		.map((match) => match[1]?.trim() ?? "")
		.filter((value) => value !== "none");
	assert.ok(
		visibleTextShadowValues.every(
			(value) =>
				value.includes("rgba(255, 80, 94") ||
				value.includes("rgba(86, 194, 255") ||
				value.includes("rgba(231, 55, 78") ||
				value.includes("rgba(31, 95, 200"),
		),
	);
	await app.close();
});
