import test from "node:test";
import assert from "node:assert/strict";
import { getPlaygroundStyles } from "../src/ui/playground-styles.js";
import { getPlaygroundConversationStyles } from "../src/ui/playground-conversation-styles.js";

test("playground styles expose the mobile active transcript rail reset", () => {
	const styles = getPlaygroundStyles();

	assert.match(
		styles,
		/\.shell\[data-stage-mode="landing"\]\[data-transcript-state="active"\] \.stream-layout\s*\{[\s\S]*inset:\s*auto;/,
	);
});

test("playground styles keep desktop rail full height and reset it on phones", () => {
	const styles = getPlaygroundStyles();

	assert.match(styles, /\.shell\s*\{[\s\S]*grid-template-columns:\s*260px minmax\(0, 1fr\);/);
	assert.match(styles, /\.shell\s*\{[\s\S]*column-gap:\s*16px;/);
	assert.match(styles, /\.topbar\s*\{[\s\S]*grid-column:\s*2;[\s\S]*grid-row:\s*1;/);
	assert.match(styles, /\.topbar-context-slot\s*\{[\s\S]*display:\s*flex;/);
	assert.match(styles, /\.desktop-conversation-rail\s*\{[\s\S]*grid-row:\s*1 \/ -1;/);
	assert.match(
		styles,
		/@media \(max-width: 640px\) \{[\s\S]*\.topbar\s*\{[\s\S]*grid-column:\s*1;[\s\S]*grid-row:\s*1;/,
	);
	assert.match(
		styles,
		/@media \(max-width: 640px\) \{[\s\S]*\.landing-side-right\s*\{[\s\S]*display:\s*contents;/,
	);
	assert.match(
		styles,
		/@media \(max-width: 640px\) \{[\s\S]*\.landing-side-right > \.telemetry-action\s*\{[\s\S]*display:\s*none;/,
	);
	assert.doesNotMatch(styles, /\.landing-side-right > \.topbar-context-slot\s*\{[\s\S]*display:\s*none;/);
});

test("playground styles give desktop workspace headers a polished command-bar layout", () => {
	const styles = getPlaygroundStyles();

	assert.match(
		styles,
		/\.chat-stage > \.workspace-contained :is\(\.asset-modal-head, \.task-inbox-head\)\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/,
	);
	assert.match(
		styles,
		/\.chat-stage > \.workspace-contained :is\(\.asset-modal-head, \.task-inbox-head\)\s*\{[\s\S]*min-height:\s*58px;/,
	);
	assert.match(
		styles,
		/\.chat-stage > \.workspace-contained :is\(\.asset-modal-actions, \.task-inbox-head-actions\)\s*\{[\s\S]*justify-content:\s*flex-end;/,
	);
	assert.match(
		styles,
		/\.chat-stage > \.workspace-contained :is\(\.asset-modal-actions button, \.task-inbox-head-button\)\s*\{[\s\S]*border-radius:\s*4px;/,
	);
	assert.doesNotMatch(styles, /task-inbox-filter-button/);
	assert.match(
		styles,
		/\.chat-stage > \.workspace-contained :is\(\.asset-head-count, \.task-inbox-head-count\)\s*\{[\s\S]*display:\s*none;/,
	);
	assert.doesNotMatch(styles, /asset-head-breadcrumb/);
	assert.doesNotMatch(styles, /task-inbox-head-breadcrumb/);
	assert.match(styles, /\.chat-stage > \.workspace-contained \.mobile-work-back-button\s*\{[\s\S]*display:\s*none;/);
});

test("playground styles compose conversation drawer styles from dedicated fragment", () => {
	const styles = getPlaygroundStyles();
	const conversationStyles = getPlaygroundConversationStyles();

	assert.match(conversationStyles, /\.mobile-drawer-backdrop\s*\{/);
	assert.match(conversationStyles, /\.mobile-conversation-drawer\s*\{/);
	assert.match(conversationStyles, /\.mobile-conversation-list\s*\{[\s\S]*gap:\s*8px;/);
	assert.match(
		conversationStyles,
		/\.conversation-item-shell\.is-pinned \.mobile-conversation-item::after\s*\{[\s\S]*background:\s*#ff304f;/,
	);
	assert.doesNotMatch(conversationStyles, /\.chat-stage\s*\{/);
	assert.ok(styles.includes(conversationStyles));
});
