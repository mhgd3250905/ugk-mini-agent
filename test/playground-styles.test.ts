import test from "node:test";
import assert from "node:assert/strict";
import { getPlaygroundStyles } from "../src/ui/playground-styles.js";
import { getPlaygroundConversationStyles } from "../src/ui/playground-conversation-styles.js";
import { getPlaygroundContextUsageStyles } from "../src/ui/playground-context-usage-styles.js";
import { getPlaygroundConfirmDialogStyles } from "../src/ui/playground-confirm-dialog-styles.js";
import { getPlaygroundNotificationStyles } from "../src/ui/playground-notification-styles.js";
import { getPlaygroundErrorBannerStyles } from "../src/ui/playground-error-banner-styles.js";
import { getPlaygroundScrollToBottomStyles } from "../src/ui/playground-scroll-to-bottom-styles.js";
import { getPlaygroundMessageContextStyles } from "../src/ui/playground-message-context-styles.js";

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

test("playground styles compose context usage styles from dedicated fragment", () => {
	const styles = getPlaygroundStyles();
	const contextUsageStyles = getPlaygroundContextUsageStyles();

	assert.match(contextUsageStyles, /\.context-usage-shell\s*\{/);
	assert.match(contextUsageStyles, /\.context-usage-meta\s*\{/);
	assert.match(contextUsageStyles, /\.context-usage-dialog-panel\s*\{/);
	assert.match(contextUsageStyles, /\.context-usage-dialog-meter\s*\{/);
	assert.match(contextUsageStyles, /\.context-usage-dialog-model\s*\{/);

	assert.match(
		contextUsageStyles,
		/\.context-usage-shell\s*\{[\s\S]*grid-template-columns:\s*48px auto;/,
	);
	assert.match(
		contextUsageStyles,
		/\.context-usage-shell\s*\{[\s\S]*width:\s*88px;/,
	);
	assert.match(
		contextUsageStyles,
		/\.context-usage-shell\s*\{[\s\S]*padding:\s*5px 10px 5px 7px;/,
	);
	assert.match(
		contextUsageStyles,
		/\.context-usage-shell\s*\{[\s\S]*z-index:\s*50;/,
	);
	assert.match(
		contextUsageStyles,
		/\.context-usage-meta\s*\{[\s\S]*top:\s*calc\(100% \+ 10px\)/,
	);
	assert.match(
		contextUsageStyles,
		/\.context-usage-meta\s*\{[\s\S]*bottom:\s*auto;/,
	);
	assert.match(
		contextUsageStyles,
		/\.context-usage-meta\s*\{[\s\S]*z-index:\s*90;/,
	);
	assert.match(
		contextUsageStyles,
		/\.context-usage-meta\s*\{[\s\S]*display:\s*grid;/,
	);
	assert.match(
		contextUsageStyles,
		/\.context-usage-meta\s*\{[\s\S]*gap:\s*9px;/,
	);
	assert.match(
		contextUsageStyles,
		/\.context-usage-meta\s*\{[\s\S]*width:\s*min\(318px, calc\(100vw - 24px\)\)/,
	);
	assert.match(
		contextUsageStyles,
		/\.context-usage-meta\s*\{[\s\S]*transform:\s*translateY\(-4px\)/,
	);
	assert.match(
		contextUsageStyles,
		/\.context-usage-progress\s*\{[\s\S]*repeating-linear-gradient/,
	);
	assert.match(
		contextUsageStyles,
		/\.context-usage-meta-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/,
	);
	assert.match(
		contextUsageStyles,
		/\.context-usage-meta-model\s*\{[\s\S]*display:\s*flex;/,
	);
	assert.match(
		contextUsageStyles,
		/\.context-usage-meta-model\s*\{[\s\S]*flex-wrap:\s*wrap;/,
	);

	assert.doesNotMatch(contextUsageStyles, /@media\s*\(max-width:\s*640px\)/);
	assert.doesNotMatch(contextUsageStyles, /\.chat-stage\s*\{/);
	assert.doesNotMatch(contextUsageStyles, /\.message\s*\{/);
	assert.doesNotMatch(contextUsageStyles, /\.chat-run-log-dialog\s*\{/);

	assert.ok(
		styles.includes(contextUsageStyles),
		"getPlaygroundStyles() must include context usage styles",
	);
});

test("playground styles compose confirm dialog styles from dedicated fragment", () => {
	const styles = getPlaygroundStyles();
	const confirmDialogStyles = getPlaygroundConfirmDialogStyles();

	assert.match(confirmDialogStyles, /\.confirm-dialog\[hidden\]\s*\{/);
	assert.match(confirmDialogStyles, /\.confirm-dialog\s*\{[\s\S]*z-index:\s*88;/);
	assert.match(confirmDialogStyles, /\.confirm-dialog\s*\{[\s\S]*background:\s*rgba\(1, 3, 10, 0\.74\)/);
	assert.match(confirmDialogStyles, /\.confirm-dialog-panel\s*\{[\s\S]*border:\s*0;/);
	assert.match(confirmDialogStyles, /\.confirm-dialog-panel\s*\{[\s\S]*border-radius:\s*8px;/);
	assert.match(confirmDialogStyles, /\.confirm-dialog-panel\s*\{[\s\S]*background:\s*#0f1624/);
	assert.match(confirmDialogStyles, /\.confirm-dialog-body\s*\{[\s\S]*border-radius:\s*6px;/);
	assert.match(confirmDialogStyles, /\.confirm-dialog-body\s*\{[\s\S]*background:\s*#151d2e/);
	assert.match(confirmDialogStyles, /\.confirm-dialog-actions\s*\{/);
	assert.match(confirmDialogStyles, /\.confirm-dialog-actions\s+button\s*\{[\s\S]*background:\s*#1b2638/);
	assert.match(confirmDialogStyles, /\.confirm-dialog-actions\s+\.danger-action\s*\{[\s\S]*background:\s*#8d2437/);

	assert.doesNotMatch(confirmDialogStyles, /\.model-config-dialog/);
	assert.doesNotMatch(confirmDialogStyles, /\.context-usage-/);
	assert.doesNotMatch(confirmDialogStyles, /\.chat-run-log-/);
	assert.doesNotMatch(confirmDialogStyles, /@media\s*\(max-width:\s*640px\)/);
	assert.doesNotMatch(confirmDialogStyles, /:root\[data-theme="light"\]/);

	assert.ok(
		styles.includes(confirmDialogStyles),
		"getPlaygroundStyles() must include confirm dialog styles",
	);
});

test("playground styles compose notification toast styles from dedicated fragment", () => {
	const styles = getPlaygroundStyles();
	const notificationStyles = getPlaygroundNotificationStyles();

	assert.match(notificationStyles, /\.notification-live-region\s*\{/);
	assert.match(notificationStyles, /\.notification-live-region\[hidden\]\s*\{/);
	assert.match(notificationStyles, /\.notification-toast-stack\s*\{/);
	assert.match(notificationStyles, /\.notification-toast\s*\{/);
	assert.match(notificationStyles, /\.notification-toast-copy\s*\{/);
	assert.match(notificationStyles, /\.notification-toast-title\s*\{/);
	assert.match(notificationStyles, /\.notification-toast-meta\s*\{/);
	assert.match(notificationStyles, /\.notification-toast-dismiss\s*\{/);

	assert.match(
		notificationStyles,
		/\.notification-live-region\s*\{[\s\S]*position:\s*fixed;/,
	);
	assert.match(
		notificationStyles,
		/\.notification-live-region\s*\{[\s\S]*top:\s*18px;/,
	);
	assert.match(
		notificationStyles,
		/\.notification-live-region\s*\{[\s\S]*right:\s*18px;/,
	);
	assert.match(
		notificationStyles,
		/\.notification-live-region\s*\{[\s\S]*z-index:\s*90;/,
	);
	assert.match(
		notificationStyles,
		/\.notification-live-region\s*\{[\s\S]*pointer-events:\s*none;/,
	);
	assert.match(
		notificationStyles,
		/\.notification-toast\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/,
	);
	assert.match(
		notificationStyles,
		/\.notification-toast\s*\{[\s\S]*border-radius:\s*4px;/,
	);
	assert.match(
		notificationStyles,
		/\.notification-toast\s*\{[\s\S]*pointer-events:\s*auto;/,
	);
	assert.match(
		notificationStyles,
		/\.notification-toast-dismiss\s*\{[\s\S]*width:\s*24px;/,
	);
	assert.match(
		notificationStyles,
		/\.notification-toast-dismiss\s*\{[\s\S]*height:\s*24px;/,
	);

	assert.doesNotMatch(notificationStyles, /\.error-banner/);
	assert.doesNotMatch(notificationStyles, /\.stream-layout/);
	assert.doesNotMatch(notificationStyles, /\.chat-stage > .notification-live-region/);
	assert.doesNotMatch(notificationStyles, /@media\s*\(max-width:\s*640px\)/);
	assert.doesNotMatch(notificationStyles, /:root\[data-theme="light"\]/);

	assert.ok(
		styles.includes(notificationStyles),
		"getPlaygroundStyles() must include notification toast styles",
	);
});

test("playground styles compose error banner styles from dedicated fragment", () => {
	const styles = getPlaygroundStyles();
	const errorBannerStyles = getPlaygroundErrorBannerStyles();

	assert.match(errorBannerStyles, /\.error-banner\s*\{/);
	assert.match(errorBannerStyles, /\.error-banner\.visible\s*\{/);
	assert.match(errorBannerStyles, /\.error-banner\[hidden\]\s*\{/);
	assert.match(errorBannerStyles, /\.error-banner-message\s*\{/);
	assert.match(errorBannerStyles, /\.error-banner-close\s*\{/);

	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*display:\s*none;/);
	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*position:\s*fixed;/);
	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*top:\s*auto;/);
	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*bottom:\s*calc\(var\(--command-deck-toast-offset, var\(--command-deck-offset, 96px\)\) \+ 12px\);/);
	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*left:\s*var\(--command-deck-center-x, 50%\);/);
	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*transform:\s*translateX\(-50%\);/);
	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*width:\s*fit-content;/);
	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*min-width:\s*220px;/);
	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*max-width:\s*min\(560px, calc\(100vw - 32px\)\);/);
	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*max-height:\s*min\(160px, calc\(100vh - 32px\)\);/);
	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*overflow:\s*auto;/);
	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*border:\s*1px solid rgba\(255, 113, 136, 0\.28\);/);
	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*border-radius:\s*10px;/);
	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*background:\s*rgba\(47, 17, 25, 0\.96\)/);
	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*z-index:\s*1000;/);
	assert.match(errorBannerStyles, /\.error-banner\s*\{[\s\S]*pointer-events:\s*auto;/);
	assert.match(errorBannerStyles, /\.error-banner\.visible\s*\{[\s\S]*display:\s*grid;/);
	assert.match(errorBannerStyles, /\.error-banner\[hidden\]\s*\{[\s\S]*display:\s*none !important;/);
	assert.match(errorBannerStyles, /\.error-banner-close\s*\{[\s\S]*width:\s*24px;/);
	assert.match(errorBannerStyles, /\.error-banner-close\s*\{[\s\S]*height:\s*24px;/);
	assert.match(errorBannerStyles, /\.error-banner-close\s*\{[\s\S]*background:\s*rgba\(90, 34, 48, 0\.62\)/);

	assert.doesNotMatch(errorBannerStyles, /\.chat-stage > .error-banner/);
	assert.doesNotMatch(errorBannerStyles, /\.notification-/);
	assert.doesNotMatch(errorBannerStyles, /\.stream-layout/);
	assert.doesNotMatch(errorBannerStyles, /@media\s*\(max-width:\s*640px\)/);
	assert.doesNotMatch(errorBannerStyles, /:root\[data-theme="light"\]/);

	assert.ok(
		styles.includes(errorBannerStyles),
		"getPlaygroundStyles() must include error banner styles",
	);
	assert.match(
		styles,
		/\.chat-stage > :not\(\.chat-stage-watermark\):not\(\.error-banner\):not\(\.notification-live-region\)\s*\{/,
	);
	assert.doesNotMatch(styles, /\.chat-stage > :not\(\.chat-stage-watermark\)\s*\{/);
});

test("playground styles compose scroll-to-bottom styles from dedicated fragment", () => {
	const styles = getPlaygroundStyles();
	const scrollToBottomStyles = getPlaygroundScrollToBottomStyles();

	assert.match(scrollToBottomStyles, /\.scroll-to-bottom-button\s*\{/);
	assert.match(scrollToBottomStyles, /\.scroll-to-bottom-button\.visible\s*\{/);
	assert.match(scrollToBottomStyles, /\.scroll-to-bottom-button:hover:not\(:disabled\)/);
	assert.match(scrollToBottomStyles, /\.scroll-to-bottom-button:focus-visible/);

	assert.match(scrollToBottomStyles, /\.scroll-to-bottom-button\s*\{[\s\S]*display:\s*none;/);
	assert.match(scrollToBottomStyles, /\.scroll-to-bottom-button\s*\{[\s\S]*position:\s*absolute;/);
	assert.match(scrollToBottomStyles, /\.scroll-to-bottom-button\s*\{[\s\S]*right:\s*14px;/);
	assert.match(scrollToBottomStyles, /\.scroll-to-bottom-button\s*\{[\s\S]*bottom:\s*20px;/);
	assert.match(scrollToBottomStyles, /\.scroll-to-bottom-button\s*\{[\s\S]*z-index:\s*5;/);
	assert.match(scrollToBottomStyles, /\.scroll-to-bottom-button\s*\{[\s\S]*border:\s*0;/);
	assert.match(scrollToBottomStyles, /\.scroll-to-bottom-button\s*\{[\s\S]*border-radius:\s*4px;/);
	assert.match(scrollToBottomStyles, /\.scroll-to-bottom-button\s*\{[\s\S]*background:\s*#182336;/);
	assert.match(scrollToBottomStyles, /\.scroll-to-bottom-button\s*\{[\s\S]*box-shadow:\s*none;/);
	assert.match(scrollToBottomStyles, /\.scroll-to-bottom-button\.visible\s*\{[\s\S]*display:\s*inline-flex;/);
	assert.match(
		scrollToBottomStyles,
		/\.scroll-to-bottom-button:hover:not\(:disabled\),\s*\.scroll-to-bottom-button:focus-visible\s*\{[\s\S]*border-color:\s*transparent;/,
	);
	assert.match(
		scrollToBottomStyles,
		/\.scroll-to-bottom-button:hover:not\(:disabled\),\s*\.scroll-to-bottom-button:focus-visible\s*\{[\s\S]*background:\s*#20324a;/,
	);

	assert.doesNotMatch(scrollToBottomStyles, /\.transcript-archive/);
	assert.doesNotMatch(scrollToBottomStyles, /\.transcript-current/);
	assert.doesNotMatch(scrollToBottomStyles, /@media\s*\(max-width:\s*640px\)/);
	assert.doesNotMatch(scrollToBottomStyles, /:root\[data-theme="light"\]/);
	assert.doesNotMatch(scrollToBottomStyles, /\.scroll-to-bottom-button\s*\{[\s\S]*position:\s*fixed/);

	assert.ok(
		styles.includes(scrollToBottomStyles),
		"getPlaygroundStyles() must include scroll-to-bottom styles",
	);
});

test("playground styles compose message context styles from dedicated fragment", () => {
	const styles = getPlaygroundStyles();
	const messageContextStyles = getPlaygroundMessageContextStyles();

	assert.match(messageContextStyles, /\.message-context-menu\s*\{/);
	assert.match(messageContextStyles, /\.message-context-menu button\s*\{/);
	assert.match(messageContextStyles, /\.message-context-menu button:hover/);
	assert.match(messageContextStyles, /\.message-context-menu button:focus-visible/);
	assert.match(messageContextStyles, /\.message-context-toast\s*\{/);

	assert.match(messageContextStyles, /\.message-context-menu\s*\{[\s\S]*position:\s*fixed;/);
	assert.match(messageContextStyles, /\.message-context-menu\s*\{[\s\S]*z-index:\s*40;/);
	assert.match(messageContextStyles, /\.message-context-menu\s*\{[\s\S]*min-width:\s*128px;/);
	assert.match(messageContextStyles, /\.message-context-menu\s*\{[\s\S]*border-radius:\s*4px;/);
	assert.match(messageContextStyles, /\.message-context-menu\s*\{[\s\S]*box-shadow:\s*none;/);
	assert.match(messageContextStyles, /\.message-context-menu button\s*\{[\s\S]*min-height:\s*34px;/);
	assert.match(messageContextStyles, /\.message-context-menu button\s*\{[\s\S]*border:\s*0;/);
	assert.match(messageContextStyles, /\.message-context-menu button\s*\{[\s\S]*background:\s*transparent;/);
	assert.match(messageContextStyles, /\.message-context-menu button\s*\{[\s\S]*text-align:\s*left;/);
	assert.match(
		messageContextStyles,
		/\.message-context-menu button:hover,\s*\.message-context-menu button:focus-visible\s*\{[\s\S]*background:\s*rgba\(201, 210, 255, 0\.1\);/,
	);
	assert.match(messageContextStyles, /\.message-context-toast\s*\{[\s\S]*position:\s*fixed;/);
	assert.match(messageContextStyles, /\.message-context-toast\s*\{[\s\S]*z-index:\s*41;/);
	assert.match(
		messageContextStyles,
		/\.message-context-toast\s*\{[\s\S]*bottom:\s*calc\(88px \+ env\(safe-area-inset-bottom\)\);/,
	);
	assert.match(messageContextStyles, /\.message-context-toast\s*\{[\s\S]*pointer-events:\s*none;/);

	assert.doesNotMatch(messageContextStyles, /\.message-export-scratch/);
	assert.doesNotMatch(messageContextStyles, /\.message-export-frame/);
	assert.doesNotMatch(messageContextStyles, /\.export-signature/);
	assert.doesNotMatch(messageContextStyles, /\.message-export-media-placeholder/);
	assert.doesNotMatch(messageContextStyles, /:root\[data-theme="light"\]/);

	assert.ok(
		styles.includes(messageContextStyles),
		"getPlaygroundStyles() must include message context styles",
	);
});
