import { getConnManagerActivityStyles, getConnRunDetailsStyles } from "./playground-conn-activity.js";
import {
	getPlaygroundAssetBaseStyles,
	getPlaygroundAssetLandingStyles,
	getPlaygroundAssetModalStyles,
} from "./playground-assets.js";
import { getPlaygroundTaskInboxStyles } from "./playground-task-inbox.js";
import { getPlaygroundThemeStyles } from "./playground-theme-controller.js";
import { getPlaygroundConversationStyles } from "./playground-conversation-styles.js";
import { getPlaygroundContextUsageStyles } from "./playground-context-usage-styles.js";
import { getPlaygroundConfirmDialogStyles } from "./playground-confirm-dialog-styles.js";
import { getPlaygroundErrorBannerStyles } from "./playground-error-banner-styles.js";
import { getPlaygroundScrollToBottomStyles } from "./playground-scroll-to-bottom-styles.js";
import { getPlaygroundMessageContextStyles } from "./playground-message-context-styles.js";
import { getPlaygroundNotificationStyles } from "./playground-notification-styles.js";
import { getPlaygroundTeamConsoleEmbedStyles } from "./playground-team-console-embed-styles.js";
import {
	getPlaygroundMobileLayoutStyles,
	getPlaygroundMobileWorkspaceStyles,
} from "./playground-mobile-layout-styles.js";

export function getPlaygroundStyles(): string {
	return `
		@font-face {
			font-family: "Agave";
			src: url("/assets/fonts/Agave-Regular.ttf") format("truetype");
			font-weight: 400;
			font-style: normal;
			font-display: swap;
		}

		@font-face {
			font-family: "Agave";
			src: url("/assets/fonts/Agave-Bold.ttf") format("truetype");
			font-weight: 700;
			font-style: normal;
			font-display: swap;
		}

		:root {
			--bg: #01030a;
			--bg-panel: #060711;
			--bg-panel-2: #0b0c18;
			--bg-panel-3: #090a15;
			--fg: #eef4ff;
			--muted: #8f93ad;
			--line: #1a1b2b;
			--line-strong: #2b2d42;
			--accent: #c9d2ff;
			--accent-soft: rgba(201, 210, 255, 0.08);
			--ok: #8dffb2;
			--danger: #ff7188;
			--warn: #ffd166;
			--chat-assistant-bg: #101827;
			--chat-assistant-border: transparent;
			--chat-user-bg: #173b29;
			--chat-user-border: transparent;
			--chat-user-fg: #e9fff2;
			--chat-code-bg: #141f31;
			--chat-code-toolbar-bg: #19263a;
			--chat-table-bg: #121c2b;
			--chat-composer-bg: #0f1726;
			--chat-composer-focus-bg: #14243a;
			--chat-floating-bg: rgba(9, 13, 22, 0.96);
			--chat-focus-ring: rgba(201, 210, 255, 0.42);
			--conversation-width: 640px;
			--transcript-bottom-scroll-buffer: 96px;
			--font-sans: "OpenAI Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
			--font-mono: "Agave", "SFMono-Regular", "Cascadia Mono", Consolas, "Lucida Console", monospace;
		}

		* {
			box-sizing: border-box;
		}

		.visually-hidden {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
			border: 0;
		}

		html,
		body {
			margin: 0;
			height: 100%;
			background: #070a12;
			background-size: auto;
			color: var(--fg);
			font-family: var(--font-sans);
			overflow: hidden;
		}

		body {
			padding: 24px;
			display: flex;
			justify-content: center;
		}

			@media (min-width: 641px) {
				.mobile-work-back-button {
					display: none !important;
				}
			}

		.shell {
			width: min(1180px, 100%);
			height: calc(100vh - 40px);
			margin: 0 auto;
			border: 0;
			background: transparent;
			box-shadow: none;
			backdrop-filter: none;
			display: grid;
			grid-template-columns: 238px minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr);
			column-gap: 18px;
			overflow: hidden;
		}

		.topbar {
			position: relative;
			grid-column: 1 / -1;
			display: grid;
			grid-template-columns: 1fr;
			gap: 14px;
			width: min(840px, calc(100% - 40px));
			margin: 0 auto;
			padding: 28px 0 16px;
			border-bottom: 1px solid rgba(255, 255, 255, 0.08);
			align-items: center;
			justify-items: center;
		}

		.topbar-right,
		.transcript-pane .pane-head {
			display: none !important;
		}

		.topbar-right {
			display: grid;
			gap: 8px;
			justify-items: end;
			font-size: 10px;
			text-transform: uppercase;
			letter-spacing: 0.12em;
			color: rgba(238, 244, 255, 0.42);
		}

		.ugk-ascii-logo {
			margin: 0;
			font-family: "Courier New", Consolas, "Cascadia Mono", monospace;
			font-weight: 700;
			line-height: 0.94;
			letter-spacing: 0;
			white-space: pre;
			text-transform: none;
			font-variant-ligatures: none;
			text-rendering: geometricPrecision;
			direction: ltr;
			unicode-bidi: isolate;
			user-select: none;
		}

		.ugk-svg-logo {
			display: none;
			flex: 0 0 auto;
		}

		:root[data-theme="dark"] .ugk-svg-logo-light,
		:root[data-theme="light"] .ugk-svg-logo-dark {
			display: none;
		}

		.desktop-brand {
			display: inline-flex;
			align-items: center;
			min-width: 0;
			width: max-content;
			max-width: 100%;
			overflow: hidden;
		}

		.ugk-ascii-logo-topbar {
			color: rgba(44, 56, 84, 0.94);
			font-size: 4.1px;
			line-height: 0.94;
			text-shadow:
				0.7px 0 rgba(255, 80, 94, 0.72),
				-0.7px 0 rgba(34, 118, 255, 0.68),
				0 0.7px rgba(255, 193, 49, 0.58);
		}

		.mobile-topbar {
			display: none;
			position: relative;
			width: 100%;
			align-items: center;
			background: transparent;
			box-shadow: none;
		}

		.mobile-brand {
			display: inline-flex;
			align-items: center;
			gap: 10px;
			min-width: 0;
			padding: 0;
			border: 0;
			background: transparent;
			box-shadow: none;
			text-align: left;
		}

		.mobile-brand:hover:not(:disabled),
		.mobile-brand:focus-visible {
			border-color: transparent;
			background: transparent;
			box-shadow: none;
			transform: none;
		}

		.mobile-brand-logo {
			display: inline-flex;
			width: min(174px, 48vw);
			height: 28px;
			align-items: center;
			overflow: hidden;
			flex: 0 0 auto;
			filter: none;
		}

		.mobile-brand-logo .ugk-ascii-logo-topbar {
			font-size: clamp(2.7px, 1.05vw, 3.9px);
		}

		.mobile-topbar-button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 36px;
			height: 36px;
			padding: 0;
			border: 1px solid transparent;
			background: transparent;
			box-shadow: none;
		}

		.mobile-topbar-button svg {
			width: 18px;
			height: 18px;
			stroke: currentColor;
		}

		.mobile-topbar-button:hover:not(:disabled),
		.mobile-topbar-button:focus-visible {
			border-color: transparent;
			background: transparent;
			color: #f7f9ff;
			transform: none;
			box-shadow: none;
		}

		.mobile-overflow-menu {
			position: absolute;
			top: calc(100% + 8px);
			right: 0;
			z-index: 8;
			display: grid;
			gap: 4px;
			min-width: 156px;
			padding: 8px;
			border: 1px solid rgba(143, 214, 255, 0.16);
			border-radius: 8px;
			background:
				linear-gradient(180deg, rgba(18, 27, 44, 0.99), rgba(9, 14, 24, 0.99)),
				#0b1220;
			box-shadow: none;
			backdrop-filter: none;
		}

		.mobile-overflow-menu[hidden] {
			display: none !important;
		}

		.mobile-overflow-menu-item {
			display: grid;
			grid-template-columns: 18px minmax(0, 1fr) auto;
			align-items: center;
			gap: 10px;
			width: 100%;
			padding: 10px 12px;
			border: 0;
			background: transparent;
			box-shadow: none;
			color: rgba(238, 244, 255, 0.9);
			font-size: 12px;
			font-weight: 500;
			letter-spacing: 0.04em;
			text-transform: none;
			text-align: left;
			text-decoration: none;
		}


		.mobile-overflow-menu-item:hover:not(:disabled),
		.mobile-overflow-menu-item:focus-visible {
			background: #172238;
			border-color: transparent;
			box-shadow: none;
			transform: none;
		}

		.mobile-overflow-menu-item-icon {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 18px;
			height: 18px;
			color: rgba(212, 221, 255, 0.84);
		}

		.mobile-overflow-menu-item-icon svg {
			width: 18px;
			height: 18px;
			stroke: currentColor;
		}

		${getPlaygroundConversationStyles()}

		.status-row {
			display: flex;
			gap: 10px;
			align-items: center;
		}

		.status-row strong {
			color: var(--ok);
		}

		.chat-stage {
			grid-column: 2;
			grid-row: 2;
			display: flex;
			flex-direction: column;
			position: relative;
			width: min(840px, calc(100% - 40px));
			min-height: 0;
			margin: 0 auto;
			border: 0;
			border-radius: 4px;
			background: transparent;
			overflow: hidden;
		}

		.chat-stage-watermark {
			position: absolute;
			left: 50%;
			top: 50%;
			z-index: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			width: clamp(150px, 18vw, 280px);
			max-width: min(56%, 280px);
			height: auto;
			transform: translate(-50%, -50%);
			opacity: 0.075;
			overflow: visible;
			pointer-events: none;
		}

		.chat-stage-watermark .ugk-svg-logo-watermark {
			display: block;
			width: 100%;
			height: auto;
			opacity: 1;
			filter: saturate(0.92);
		}

		.ugk-ascii-logo-watermark {
			color: rgba(138, 170, 218, 0.2);
			font-size: clamp(6px, 0.88vw, 10px);
			line-height: 0.94;
			text-shadow:
				1px 0 rgba(86, 194, 255, 0.08),
				-1px 0 rgba(255, 80, 112, 0.06),
				0 1px rgba(255, 205, 86, 0.05);
		}

		.chat-stage > :not(.chat-stage-watermark):not(.error-banner):not(.notification-live-region) {
			position: relative;
			z-index: 1;
		}

		.chat-stage > .notification-live-region {
			z-index: 90;
		}

		.chat-stage[data-workspace-mode="assets"] .landing-screen,
		.chat-stage[data-workspace-mode="assets"] .stream-layout,
		.chat-stage[data-workspace-mode="assets"] .command-deck,
		.chat-stage[data-workspace-mode="assets"] .chat-stage-watermark,
		.chat-stage[data-workspace-mode="conn"] .landing-screen,
		.chat-stage[data-workspace-mode="conn"] .stream-layout,
		.chat-stage[data-workspace-mode="conn"] .command-deck,
		.chat-stage[data-workspace-mode="conn"] .chat-stage-watermark,
		.chat-stage[data-workspace-mode="agents"] .landing-screen,
		.chat-stage[data-workspace-mode="agents"] .stream-layout,
		.chat-stage[data-workspace-mode="agents"] .command-deck,
		.chat-stage[data-workspace-mode="agents"] .chat-stage-watermark,
		.chat-stage[data-workspace-mode="task"] .landing-screen,
		.chat-stage[data-workspace-mode="task"] .stream-layout,
		.chat-stage[data-workspace-mode="task"] .command-deck,
		.chat-stage[data-workspace-mode="task"] .chat-stage-watermark {
			display: none !important;
		}

		.chat-stage > .workspace-contained {
			position: absolute;
			inset: 0;
			z-index: 8;
			width: 100%;
			height: 100%;
			padding: 0;
			background: transparent;
			backdrop-filter: none;
		}

		.chat-stage > .workspace-contained.open {
			display: flex;
			align-items: stretch;
			justify-content: stretch;
		}

		.chat-stage[data-workspace-mode="assets"] > #asset-modal.workspace-contained,
		.chat-stage[data-workspace-mode="conn"] > #conn-manager-dialog.workspace-contained,
		.chat-stage[data-workspace-mode="agents"] > #agent-manager-dialog.workspace-contained,
		.chat-stage[data-workspace-mode="task"] > #task-inbox-view.workspace-contained {
			display: flex;
		}

		.chat-stage > .workspace-contained .asset-modal,
		.chat-stage > .workspace-contained .conn-manager-panel,
		.chat-stage > .workspace-contained .agent-manager-panel,
		.chat-stage > .workspace-contained .task-inbox-pane {
			position: relative;
			inset: auto;
			width: 100%;
			height: 100%;
			max-height: none;
			margin: 0;
			border: 0;
			border-radius: 0;
			background: transparent;
			box-shadow: none;
		}

		.chat-stage > .workspace-contained .asset-modal::before {
			display: none;
		}

		.chat-stage > .workspace-contained .asset-modal-head,
		.chat-stage > .workspace-contained .agent-manager-panel .asset-modal-head,
		.chat-stage > .workspace-contained .task-inbox-head {
			position: sticky;
			top: 0;
			z-index: 2;
		}

		.chat-stage > .workspace-contained .asset-modal-body,
		.chat-stage > .workspace-contained .agent-manager-body,
		.chat-stage > .workspace-contained .task-inbox-list {
			min-height: 0;
			padding: 14px 0;
		}

		.chat-stage > .workspace-contained .asset-modal-list {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 8px;
		}

		.chat-stage > .workspace-contained .asset-date-group-header {
			grid-column: 1 / -1;
		}

		.chat-stage > .workspace-contained .asset-pill {
			gap: 12px;
			padding: 12px 14px;
			border: 0;
			border-radius: 4px;
			background: #101827;
		}

		.chat-stage > .workspace-contained .asset-pill strong {
			font-size: 12px;
			color: rgba(247, 249, 255, 0.9);
		}

		.chat-stage > .workspace-contained .asset-pill-meta {
			color: rgba(226, 234, 255, 0.46);
			font-family: var(--font-mono);
			font-size: 10px;
			overflow-wrap: anywhere;
			white-space: normal;
		}

		.chat-stage > .workspace-contained .asset-pill button {
			padding: 4px 10px;
			border: 1px solid rgba(201, 210, 255, 0.12);
			border-radius: 4px;
			background: rgba(201, 210, 255, 0.04);
			color: rgba(201, 210, 255, 0.72);
			font-size: 10px;
		}

		.chat-stage > .workspace-contained .asset-pill button:hover:not(:disabled) {
			border-color: rgba(201, 210, 255, 0.24);
			background: rgba(201, 210, 255, 0.08);
			color: rgba(247, 249, 255, 0.92);
		}

		.chat-stage > .workspace-contained .asset-pill.active {
			border-color: rgba(141, 255, 178, 0.16);
			background: rgba(141, 255, 178, 0.04);
		}

		.asset-head-count {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-width: 20px;
			height: 18px;
			padding: 0 5px;
			border-radius: 4px;
			background: rgba(255, 255, 255, 0.06);
			color: rgba(238, 244, 255, 0.42);
			font-size: 10px;
			font-weight: 600;
			line-height: 1;
		}

		.asset-head-count:empty {
			display: none;
		}

		.task-inbox-head-count {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-width: 22px;
			height: 18px;
			padding: 0 6px;
			border-radius: 4px;
			background: rgba(255, 23, 68, 0.12);
			color: rgba(255, 174, 174, 0.84);
			font-size: 10px;
			line-height: 1;
			letter-spacing: 0.02em;
		}

		.task-inbox-head-count:empty {
			display: none;
		}

		.chat-stage > .workspace-contained .task-inbox-head-copy {
			display: flex;
			flex-direction: row;
			align-items: center;
			gap: 8px;
		}

		.chat-stage > .workspace-contained .task-inbox-head-copy strong {
			font-size: 12px;
			letter-spacing: 0.04em;
			text-transform: none;
		}

		.chat-meta {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto auto;
			gap: 12px;
			padding: 12px 0 10px;
			border-bottom: 0;
			background: transparent;
			align-items: center;
			flex-shrink: 0;
		}

		.chat-meta,
		.banner-row,
		.process-panel {
			display: none !important;
		}

		.meta-chip {
			min-width: 0;
			padding: 10px 12px;
			border: 1px solid rgba(255, 255, 255, 0.08);
			background: rgba(255, 255, 255, 0.035);
			backdrop-filter: none;
			font-size: 10px;
			line-height: 1.5;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			color: rgba(238, 244, 255, 0.54);
		}

		.meta-chip strong {
			display: block;
			margin-bottom: 4px;
			color: var(--fg);
			font-size: 11px;
		}

		.meta-chip span,
		.meta-chip code {
			display: block;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		code {
			color: var(--accent);
			font-family: var(--font-mono);
			background: transparent;
			padding: 0;
		}

		button,
		input,
		select,
		textarea {
			font: inherit;
			border-radius: 4px;
		}

		button {
			border: 1px solid rgba(255, 255, 255, 0.12);
			background: rgba(255, 255, 255, 0.04);
			color: var(--fg);
			padding: 10px 14px;
			cursor: pointer;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			transition:
				transform 120ms ease,
				border-color 120ms ease,
				color 120ms ease,
				background 120ms ease;
		}

		button:hover:not(:disabled) {
			border-color: var(--accent);
			color: var(--accent);
			background: rgba(255, 255, 255, 0.08);
			transform: translateY(-1px);
			box-shadow: none;
		}

		button:disabled {
			opacity: 0.5;
			cursor: wait;
		}

		#send-button,
		#interrupt-button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-height: 52px;
			padding: 0;
			border: 0;
			border-radius: 4px;
			background: transparent;
			color: transparent;
			font-size: 0;
			line-height: 0;
			letter-spacing: 0;
			text-indent: -9999px;
			overflow: hidden;
			box-shadow: none;
			appearance: none;
			-webkit-appearance: none;
		}

		#send-button:hover:not(:disabled),
		#send-button:focus-visible,
		#interrupt-button:hover:not(:disabled),
		#interrupt-button:focus-visible {
			border: 0;
			background: transparent;
			color: transparent;
			box-shadow: none;
			transform: none;
		}

		#send-button::before,
		#interrupt-button::before {
			content: "";
			display: block;
			width: 28px;
			height: 28px;
			background-repeat: no-repeat;
			background-position: center;
			background-size: 28px 28px;
		}

		#send-button::before {
			background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M8 13V4' stroke='rgba(242,246,255,0.9)' stroke-width='1.6' stroke-linecap='round'/%3E%3Cpath d='M4.75 7.25L8 4L11.25 7.25' stroke='rgba(242,246,255,0.9)' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
		}

		#interrupt-button::before {
			background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Crect x='4' y='4' width='8' height='8' rx='1.2' fill='rgba(255,255,255,0.96)'/%3E%3C/svg%3E");
		}

		#interrupt-button:disabled {
			display: inline-flex;
			opacity: 0.38;
			background: transparent;
			box-shadow: none;
			cursor: default;
		}

		.banner-row {
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 12px;
			padding: 0 0 8px;
			border-bottom: 0;
			font-size: 10px;
			text-transform: uppercase;
			letter-spacing: 0.12em;
			color: rgba(238, 244, 255, 0.46);
			flex-shrink: 0;
		}

		.state {
			padding: 6px 10px;
			border: 1px solid rgba(141, 255, 178, 0.24);
			background: rgba(141, 255, 178, 0.05);
			color: var(--ok);
		}

		${getPlaygroundErrorBannerStyles()}

		${getPlaygroundNotificationStyles()}

		.stream-layout {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 14px;
			flex: 1 1 auto;
			min-height: 0;
			background: transparent;
		}


		.transcript-pane {
			display: flex;
			flex-direction: column;
			align-items: stretch;
			position: relative;
			width: min(var(--conversation-width), 100%);
			margin: 0 auto;
			min-height: 0;
		}

		.pane-head {
			padding: 12px 18px;
			border-bottom: 0;
			background: transparent;
			flex-shrink: 0;
		}

		.transcript-pane .pane-head {
			padding: 8px 12px 4px;
			background: transparent;
		}

		.pane-head strong {
			display: block;
			font-size: 10px;
			letter-spacing: 0.14em;
			text-transform: uppercase;
			margin-bottom: 4px;
		}

		.pane-head span {
			display: block;
			color: var(--muted);
			font-size: 11px;
			line-height: 1.5;
		}

		.transcript {
			display: grid;
			align-content: start;
			justify-items: stretch;
			width: 100%;
			flex: 1 1 auto;
			min-height: 0;
			padding: 0 0 8px;
			overflow-y: auto;
			overflow-x: hidden;
			overscroll-behavior: contain;
			scroll-padding-bottom: var(--transcript-bottom-scroll-buffer);
			scrollbar-width: none;
			-ms-overflow-style: none;
		}

		.transcript::-webkit-scrollbar {
			width: 0;
			height: 0;
			display: none;
		}

		${getPlaygroundScrollToBottomStyles()}

		.transcript-archive,
		.transcript-current {
			display: grid;
			align-content: start;
			justify-items: stretch;
			width: 100%;
		}

		.shell[data-transcript-state="active"] .transcript-current {
			padding-bottom: var(--transcript-bottom-scroll-buffer);
		}

		.transcript-archive {
			gap: 12px;
			padding-bottom: 8px;
		}

		.archived-conversation {
			display: grid;
			gap: 10px;
			width: 100%;
			padding: 12px 0 0;
			border-top: 1px solid rgba(201, 210, 255, 0.08);
		}

		.archived-conversation-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			padding: 0 18px;
			color: rgba(214, 220, 255, 0.46);
			font-size: 10px;
			letter-spacing: 0.16em;
			text-transform: uppercase;
		}

		.archived-conversation-head strong {
			color: rgba(238, 244, 255, 0.72);
			font-weight: 400;
			letter-spacing: 0.08em;
		}

		.archived-conversation-body {
			display: grid;
			gap: 0;
			opacity: 0.8;
		}

		.archived-conversation-body .message-actions {
			opacity: 0.82;
		}

		.history-auto-load-status {
			align-self: center;
			margin: 0 0 10px;
			padding: 7px 12px;
			border: 0;
			background: rgba(201, 210, 255, 0.06);
			color: rgba(236, 240, 255, 0.64);
			font-size: 10px;
			letter-spacing: 0.12em;
			pointer-events: none;
		}

		.history-auto-load-status[hidden] {
			display: none !important;
		}

		.message {
			display: grid;
			grid-template-columns: 1fr;
			justify-items: stretch;
			gap: 7px;
			width: 100%;
			padding: 16px 0 0;
			border-bottom: 0;
		}

		.message-meta,
		.message-body {
			padding: 0;
			min-width: 0;
			width: 100%;
		}

		.message-meta {
			display: flex;
			align-items: center;
			gap: 8px;
			background: transparent;
			font-size: 10px;
			line-height: 1.6;
			letter-spacing: 0.06em;
			text-transform: uppercase;
			color: rgba(238, 244, 255, 0.42);
		}

		.message-meta strong {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 6px;
			margin-bottom: 0;
			padding: 3px 7px 3px 6px;
			font-size: 10px;
			border: 0;
			border-radius: 4px;
			background: #182336;
			color: var(--fg);
		}

		.message-meta strong::before {
			content: "";
			width: 5px;
			height: 5px;
			border-radius: 2px;
			background: currentColor;
			opacity: 0.62;
		}

		.message-body {
			padding: 18px 19px;
			border: 0;
			border-radius: 4px;
			background: var(--chat-assistant-bg);
			box-shadow: none;
			backdrop-filter: none;
		}

		.message-content {
			font-size: 14px;
			line-height: 1.85;
			min-width: 0;
			max-width: 100%;
			word-break: break-word;
		}

		.message-content > :first-child {
			margin-top: 0;
		}

		.message-content > :last-child {
			margin-bottom: 0;
		}

		.message-content p,
		.message-content ul,
		.message-content ol,
		.message-content .markdown-table-scroll,
		.message-content .code-block,
		.message-content pre,
		.message-content blockquote,
		.message-content h1,
		.message-content h2,
		.message-content h3,
		.message-content h4,
		.message-content h5,
		.message-content h6 {
			margin: 0 0 14px;
		}

		.message-content h1,
		.message-content h2,
		.message-content h3,
		.message-content h4,
		.message-content h5,
		.message-content h6 {
			line-height: 1.2;
			letter-spacing: 0;
			text-transform: none;
		}

		.message-content h1 {
			font-size: 28px;
		}

		.message-content h2 {
			font-size: 24px;
		}

		.message-content h3 {
			font-size: 20px;
		}

		.message-content ul,
		.message-content ol {
			padding-left: 22px;
		}

		.message-content li + li {
			margin-top: 6px;
		}

		.message-content .markdown-table-scroll {
			display: block;
			width: 100%;
			max-width: 100%;
			overflow-x: auto;
			border: 0;
			background: var(--chat-table-bg);
		}

		.message-content table {
			width: 100%;
			max-width: 100%;
			border-collapse: collapse;
		}

		.message-content th,
		.message-content td {
			padding: 9px 11px;
			border-right: 1px solid rgba(201, 210, 255, 0.12);
			border-bottom: 1px solid rgba(201, 210, 255, 0.12);
			text-align: left;
			vertical-align: top;
			min-width: 60px;
			max-width: 320px;
			white-space: normal;
			overflow-wrap: break-word;
			word-break: break-word;
		}

		.message-content th:last-child,
		.message-content td:last-child {
			border-right: 0;
		}

		.message-content tbody tr:last-child td {
			border-bottom: 0;
		}

		.message-content th {
			background: rgba(201, 210, 255, 0.09);
			color: var(--fg);
			font-size: 12px;
			font-weight: 700;
		}

		.message-content td {
			color: rgba(238, 244, 255, 0.86);
		}

		.message-content blockquote {
			margin-left: 0;
			padding: 13px 14px;
			border-left: 0;
			border-radius: 4px;
			background: #182336;
			color: #d7e5ff;
		}

		.message-content pre {
			min-width: 0;
			width: 100%;
			max-width: 100%;
			box-sizing: border-box;
			padding: 15px;
			border: 0;
			border-radius: 4px;
			background: var(--chat-code-bg);
			overflow-x: auto;
		}

		.message-content .code-block {
			display: block;
			min-width: 0;
			width: 100%;
			max-width: 100%;
			box-sizing: border-box;
			overflow: hidden;
			border: 0;
			border-radius: 4px;
			background: var(--chat-code-bg);
		}

		.message-content .code-block-toolbar {
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: 12px;
			padding: 8px 11px;
			border-bottom: 0;
			background: var(--chat-code-toolbar-bg);
		}

		.message-content .code-block-language {
			background: transparent;
			color: var(--muted);
			font-size: 10px;
			letter-spacing: 0.12em;
			text-transform: uppercase;
		}

		.message-content .copy-code-button {
			padding: 5px 8px;
			border-color: transparent;
			background: transparent;
			color: rgba(238, 244, 255, 0.58);
			font-size: 10px;
			letter-spacing: 0.12em;
		}

		.message-content .copy-code-button:disabled {
			cursor: default;
		}

		.message-content .code-block pre {
			margin: 0;
			width: 100%;
			max-width: 100%;
			border: 0;
			background: transparent;
			overflow-x: auto;
		}

		.message-content code {
			display: inline-block;
			padding: 1px 6px 2px;
			border: 0;
			border-radius: 4px;
			background: #1e2b40;
			font-size: 13px;
		}

		.message-content pre code {
			display: block;
			font-family: var(--font-mono);
			padding: 0;
			border: 0;
			background: transparent;
			font-size: 12px;
			line-height: 1.7;
			white-space: pre;
		}

		.message-content a {
			color: var(--accent);
			text-decoration: underline;
			text-decoration-thickness: 1px;
			text-underline-offset: 3px;
		}

		.message.user .message-meta strong {
			background: #173b29;
			color: rgba(233, 255, 242, 0.86);
		}

		.message.assistant .message-meta strong {
			background: #182336;
			color: rgba(243, 251, 255, 0.9);
		}

		.message.user {
			justify-items: end;
		}

		.message.user .message-meta {
			width: fit-content;
			flex-direction: row-reverse;
			justify-self: end;
			justify-content: flex-end;
		}

		.message.user .message-body {
			width: fit-content;
			max-width: min(100%, 75%);
			justify-self: end;
			background: var(--chat-user-bg);
			color: var(--chat-user-fg);
		}

		.message.user .message-content {
			text-align: left;
		}

		.message.user .message-content a {
			color: #bfffd4;
			text-decoration-color: rgba(191, 255, 212, 0.5);
			font-weight: 700;
		}

		.message.user .message-copy-button,
		.message.user .message-image-export-button {
			color: rgba(234, 255, 241, 0.42);
		}

		.message.user .message-copy-button:hover:not(:disabled),
		.message.user .message-copy-button:focus-visible,
		.message.user .message-image-export-button:hover:not(:disabled),
		.message.user .message-image-export-button:focus-visible {
			color: rgba(234, 255, 241, 0.8);
		}

		.message.assistant {
			justify-items: stretch;
		}

		.message.assistant .message-body {
			background: var(--chat-assistant-bg);
			color: #edf5ff;
		}

		.message.assistant .message-body:has(> .message-content.is-empty:only-child) {
			display: none;
		}

		.message.assistant .message-content,
		.message.assistant .message-content .code-block-language {
			color: #edf5ff;
		}

		.message.assistant .message-content {
			font-size: 13px;
			line-height: 1.78;
		}

		.message.assistant .message-content h1 {
			color: #ffffff;
			font-size: 18px;
			line-height: 1.35;
		}

		.message.assistant .message-content h2 {
			color: #d7e5ff;
			font-size: 16px;
			line-height: 1.38;
		}

		.message.assistant .message-content h3 {
			color: #bdf0df;
			font-size: 14px;
			line-height: 1.42;
		}

		.message.assistant .message-content h4,
		.message.assistant .message-content h5,
		.message.assistant .message-content h6 {
			color: #ffdca8;
			font-size: 13px;
			line-height: 1.45;
		}

		.message.assistant .message-content a {
			color: #8fd6ff;
			text-decoration-color: rgba(143, 214, 255, 0.42);
		}

		.message.assistant .message-content strong {
			color: #fff4c7;
		}

		.message.assistant .message-content code {
			color: #ffe6ad;
			background: #2a2835;
		}

		.message.assistant .message-content pre code {
			background: transparent;
		}

		.message.assistant .message-content blockquote {
			border-left-color: transparent;
			background: #123329;
			color: rgba(223, 255, 244, 0.9);
		}

		.message.assistant .message-content pre,
		.message.assistant .message-content .code-block {
			border-color: transparent;
			background: var(--chat-code-bg);
		}

		.message.assistant .message-content th {
			color: #d7e5ff;
			background: rgba(143, 214, 255, 0.1);
		}

		.message.assistant .message-content td {
			color: rgba(237, 245, 255, 0.84);
		}

		.message.assistant .copy-code-button {
			border-color: transparent;
			background: transparent;
			color: rgba(237, 245, 255, 0.62);
		}

		.process-note {
			display: grid;
			width: 100%;
			padding: 4px 0 0;
		}

		.process-note-text {
			width: 100%;
			max-width: none;
			padding: 0 18px;
			color: rgba(238, 244, 255, 0.54);
			font-size: 11px;
			line-height: 1.5;
			text-align: left;
			word-break: break-word;
		}

		.process-note.tool .process-note-text {
			color: rgba(212, 218, 255, 0.7);
		}

		.process-note.ok .process-note-text {
			color: rgba(141, 255, 178, 0.78);
		}

		.process-note.error .process-note-text {
			color: rgba(255, 153, 170, 0.82);
		}

		.message-content.is-empty {
			display: none;
		}

		.assistant-loading-bubble {
			display: inline-flex;
			align-items: center;
			gap: 10px;
			width: fit-content;
			max-width: fit-content;
			padding: 8px 12px;
			border: 0;
			border-radius: 4px;
			background: #182336;
			color: rgba(233, 238, 255, 0.88);
			font-size: 11px;
			letter-spacing: 0.04em;
			text-transform: none;
			box-shadow: none;
			justify-self: flex-start;
		}

		.assistant-run-log-trigger {
			cursor: pointer;
		}

		.assistant-run-log-trigger:disabled {
			cursor: default;
			opacity: 0.64;
		}

		.assistant-run-log-hint {
			color: rgba(233, 238, 255, 0.52);
			font-size: 10px;
		}

		.assistant-loading-dots {
			display: inline-flex;
			flex: 0 0 auto;
			align-items: center;
			gap: 5px;
		}

		.assistant-loading-dots[hidden] {
			display: none !important;
		}

		.assistant-loading-dot {
			width: 5px;
			height: 5px;
			border-radius: 999px;
			background: currentColor;
			opacity: 0.24;
			animation: assistant-loading-pulse 1.15s ease-in-out infinite;
		}

		.assistant-loading-dot:nth-child(2) {
			animation-delay: 0.16s;
		}

		.assistant-loading-dot:nth-child(3) {
			animation-delay: 0.32s;
		}

		.assistant-status-shell.tool .assistant-loading-bubble,
		.assistant-loading-bubble.tool {
			border-color: transparent;
			background: #182336;
		}

		.assistant-status-shell.ok .assistant-loading-bubble,
		.assistant-loading-bubble.ok {
			border-color: transparent;
			background: #173b29;
			color: rgba(201, 255, 220, 0.92);
		}

		.assistant-status-shell.warn .assistant-loading-bubble,
		.assistant-loading-bubble.warn {
			border-color: transparent;
			background: #3b3120;
			color: rgba(255, 230, 178, 0.94);
		}

		.assistant-status-shell.error .assistant-loading-bubble,
		.assistant-loading-bubble.error {
			border-color: transparent;
			background: #3b2028;
			color: rgba(255, 210, 220, 0.94);
		}

		.assistant-status-shell.is-complete .assistant-loading-bubble {
			box-shadow: none;
		}

		.assistant-status-shell {
			display: grid;
			gap: 10px;
			padding: 0 0 2px;
		}

		.message-meta .assistant-loading-bubble {
			margin-left: 2px;
		}

		.assistant-status-summary {
			margin: 0;
			max-width: min(100%, 560px);
			color: rgba(233, 238, 255, 0.72);
			font-size: 12px;
			line-height: 1.4;
			text-align: left;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.chat-run-log-dialog[hidden] {
			display: none !important;
		}

		.chat-run-log-dialog {
			position: fixed;
			inset: 0;
			z-index: 40;
			display: grid;
			place-items: center;
			padding: 18px;
			background: rgba(1, 3, 10, 0.82);
		}

		.chat-run-log-dialog.open {
			display: grid;
		}

		.chat-run-log-panel {
			display: grid;
			grid-template-rows: auto minmax(0, 1fr);
			width: min(780px, 100%);
			max-height: min(78vh, 860px);
			border: 0;
			border-radius: 8px;
			background:
				linear-gradient(180deg, #121522 0%, #070914 42%, #04050d 100%),
				#060711;
			box-shadow: none;
		}

		.chat-run-log-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			padding: 14px 16px;
			border-bottom: 0;
			background: #101421;
			box-shadow: none;
		}

		.chat-run-log-head strong {
			font-size: 14px;
			letter-spacing: 0.04em;
		}

		.chat-run-log-close {
			width: 32px;
			height: 32px;
			padding: 0;
			border: 0;
			border-radius: 4px;
			background: #171a28;
			box-shadow: none;
			color: rgba(238, 244, 255, 0.72);
			font-size: 18px;
		}

		.chat-run-log-body {
			display: grid;
			align-content: start;
			gap: 12px;
			min-height: 0;
			overflow: auto;
			padding: 16px;
		}

		.chat-run-log-meta {
			color: rgba(233, 238, 255, 0.48);
			font-size: 11px;
			line-height: 1.6;
			word-break: break-word;
		}

		.chat-run-log-list {
			display: grid;
			gap: 10px;
		}

		.chat-run-log-item {
			display: grid;
			gap: 6px;
			padding: 12px;
			border: 0;
			border-radius: 4px;
			background: #0b0e19;
			box-shadow: none;
		}

		.chat-run-log-item-title {
			color: rgba(242, 246, 255, 0.92);
			font-size: 12px;
			line-height: 1.5;
		}

		.chat-run-log-item-detail {
			margin: 0;
			color: rgba(226, 234, 255, 0.66);
			font-family: var(--font-mono);
			font-size: 11px;
			line-height: 1.6;
			white-space: pre-wrap;
			word-break: break-word;
		}

		.chat-run-log-empty {
			padding: 14px;
			border: 0;
			border-radius: 4px;
			background: #0b0e19;
			color: rgba(226, 234, 255, 0.58);
			font-size: 12px;
			line-height: 1.6;
		}

		.chat-run-log-load-state {
			color: rgba(226, 234, 255, 0.46);
			font-size: 11px;
			line-height: 1.6;
			text-align: center;
		}

		:root[data-theme="light"] .chat-run-log-dialog {
			background: rgba(15, 23, 42, 0.28);
		}

		:root[data-theme="light"] .chat-run-log-panel {
			background: rgba(255, 255, 255, 0.96);
			color: #1f2937;
		}

		:root[data-theme="light"] .chat-run-log-head {
			background: rgba(248, 251, 255, 0.96);
			color: #172033;
			border-bottom: 1px solid rgba(31, 95, 200, 0.1);
		}

		:root[data-theme="light"] .chat-run-log-close {
			background: rgba(229, 236, 248, 0.92);
			color: #34435f;
		}

		:root[data-theme="light"] .chat-run-log-meta,
		:root[data-theme="light"] .chat-run-log-load-state {
			color: rgba(52, 67, 95, 0.62);
		}

		:root[data-theme="light"] .chat-run-log-item,
		:root[data-theme="light"] .chat-run-log-empty {
			background: rgba(246, 249, 253, 0.96);
			color: #1f2937;
			border: 1px solid rgba(31, 95, 200, 0.1);
		}

		:root[data-theme="light"] .chat-run-log-item-title {
			color: #162238;
		}

		:root[data-theme="light"] .chat-run-log-item-detail {
			color: #34435f;
		}

		@keyframes assistant-loading-pulse {
			0%,
			80%,
			100% {
				opacity: 0.22;
				transform: scale(0.82);
			}

			40% {
				opacity: 1;
				transform: scale(1);
			}
		}

		.message-body > .message-actions {
			display: flex;
			justify-content: flex-end;
			gap: 8px;
			margin-top: 0;
		}

		.message-copy-button,
		.message-image-export-button {
			position: relative;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 26px;
			height: 26px;
			padding: 0;
			border: 0;
			background: transparent;
			color: rgba(226, 234, 255, 0.52);
			box-shadow: none;
			font-size: 0;
			line-height: 0;
			letter-spacing: 0;
		}

		.message-copy-button:hover:not(:disabled),
		.message-copy-button:focus-visible,
		.message-image-export-button:hover:not(:disabled),
		.message-image-export-button:focus-visible {
			border-color: transparent;
			background: transparent;
			color: rgba(242, 246, 255, 0.78);
			box-shadow: none;
			transform: none;
		}

		.message-copy-button:disabled {
			cursor: default;
			opacity: 0.45;
		}

		.message-action-icon {
			width: 16px;
			height: 16px;
			display: block;
			stroke: currentColor;
			stroke-width: 1.55;
			stroke-linecap: round;
			stroke-linejoin: round;
			vector-effect: non-scaling-stroke;
		}

		${getPlaygroundMessageContextStyles()}

		.message-export-scratch {
			position: fixed;
			left: -10000px;
			top: 0;
			z-index: -1;
			pointer-events: none;
		}

		.message-export-frame {
			display: grid;
			gap: 10px;
			padding: 14px;
			border-radius: 8px;
			background:
				linear-gradient(180deg, #121522 0%, #070914 42%, #04050d 100%),
				#060711;
			color: var(--fg);
			box-shadow: none;
		}

		.message-export-frame > .message-body {
			background: #0b0e19;
			box-shadow: none;
		}

		.message-export-frame .message-actions {
			display: none !important;
		}

		.export-signature {
			justify-self: end;
			padding: 5px 7px;
			border-radius: 4px;
			background: #101421;
			color: rgba(238, 244, 255, 0.62);
			font-size: 10px;
			font-weight: 700;
			letter-spacing: 0.08em;
			text-transform: uppercase;
		}

		.message-export-media-placeholder {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			max-width: 100%;
			min-height: 38px;
			padding: 8px 10px;
			border-radius: 4px;
			background: rgba(201, 210, 255, 0.08);
			color: rgba(226, 234, 255, 0.68);
			font-size: 11px;
			line-height: 1.4;
		}

		.message.assistant .message-body {
			display: grid;
			gap: 0;
		}


		.composer {
			display: grid;
			grid-template-columns: auto minmax(0, 1fr) 168px;
			gap: 10px;
			padding: 10px 10px 10px 11px;
			border: 0;
			border-radius: 4px;
			background: var(--chat-composer-bg);
			outline: 1px solid transparent;
			outline-offset: 2px;
			box-shadow: none;
			align-items: end;
			flex-shrink: 0;
			transition:
				background 120ms ease,
				border-color 120ms ease,
				outline-color 120ms ease;
		}

		.composer:focus-within {
			background: var(--chat-composer-focus-bg);
			outline-color: rgba(201, 210, 255, 0.22);
			box-shadow: none;
		}

		.composer-main {
			display: grid;
			gap: 8px;
		}

		.composer-header {
			display: flex;
			justify-content: space-between;
			gap: 12px;
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: 0.06em;
			color: rgba(226, 234, 255, 0.46);
		}

		.composer-file-action {
			display: inline-grid;
			place-items: center;
			align-self: center;
			width: 36px;
			min-width: 36px;
			height: 36px;
			padding: 0;
			border: 0;
			border-radius: 4px;
			background: #1b2638;
			color: rgba(213, 236, 255, 0.82);
			font: inherit;
			cursor: pointer;
			box-shadow: none;
		}

		.composer-file-action span {
			display: block;
			width: 16px;
			height: 16px;
			font-size: 0;
			line-height: 0;
		}

		.composer-file-action span::before {
			content: "";
			display: block;
			width: 16px;
			height: 16px;
			background: currentColor;
			-webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 2.75v10.5M2.75 8h10.5' stroke='black' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E") center / 16px 16px no-repeat;
			mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 2.75v10.5M2.75 8h10.5' stroke='black' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E") center / 16px 16px no-repeat;
		}

		.composer-file-action:hover:not(:disabled),
		.composer-file-action:focus-visible {
			background: #20324a;
			color: rgba(246, 249, 255, 0.96);
			outline: 1px solid rgba(101, 209, 255, 0.42);
			outline-offset: 2px;
		}

		.composer-file-action:disabled {
			cursor: wait;
			opacity: 0.48;
		}

		.composer textarea,
		.composer input,
		.composer select {
			width: 100%;
			border: 0;
			background: #172238;
			color: var(--fg);
			padding: 12px 14px;
			outline: none;
			transition:
				border-color 120ms ease,
				background 120ms ease;
		}

		.composer textarea {
			--composer-line-height: 22px;
			--composer-textarea-max-lines: 10;
			background: #172238;
			min-height: 52px;
			max-height: calc(var(--composer-line-height) * var(--composer-textarea-max-lines) + 30px);
			resize: none;
			line-height: var(--composer-line-height);
			overflow-y: auto;
			padding-top: 14px;
			padding-bottom: 14px;
			box-shadow: none;
		}

		.composer textarea::placeholder {
			line-height: var(--composer-line-height);
			color: rgba(226, 234, 255, 0.34);
		}

		.composer textarea:focus,
		.composer input:focus,
		.composer select:focus {
			outline: none;
			background: #1d3049;
			box-shadow: none;
		}

		.composer textarea:focus {
			background: #1d3049;
		}

		.composer-side {
			display: grid;
			gap: 10px;
		}

		.hint {
			padding: 10px 12px;
			border: 1px solid var(--line);
			color: var(--muted);
			background: rgba(16, 24, 44, 0.4);
			font-size: 11px;
			line-height: 1.6;
			text-transform: uppercase;
			letter-spacing: 0.08em;
		}

		.file-strip {
			display: grid;
			gap: 8px;
		}

		${getPlaygroundContextUsageStyles()}
		${getPlaygroundConfirmDialogStyles()}
		.model-config-dialog[hidden] {
			display: none !important;
		}

		.model-config-dialog {
			position: fixed;
			inset: 0;
			z-index: 86;
			display: none;
			align-items: center;
			justify-content: center;
			padding: 18px;
			background: rgba(3, 5, 10, 0.72);
		}

		.model-config-dialog.open {
			display: flex;
		}

		.model-config-panel {
			width: min(520px, 100%);
			display: grid;
			gap: 14px;
			padding: 16px;
			border: 1px solid rgba(201, 210, 255, 0.12);
			border-radius: 8px;
			background:
				linear-gradient(180deg, #121522 0%, #080a15 46%, #04050d 100%),
				#060711;
			box-shadow: none;
		}

		.model-config-head {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 14px;
		}

		.model-config-head div {
			display: grid;
			gap: 5px;
			min-width: 0;
		}

		.model-config-head strong {
			color: rgba(247, 249, 255, 0.95);
			font-size: 13px;
			letter-spacing: 0.08em;
			text-transform: uppercase;
		}

		.model-config-head span {
			color: rgba(225, 232, 247, 0.56);
			font-size: 11px;
			line-height: 1.4;
			overflow-wrap: anywhere;
		}

		.model-config-close {
			width: 30px;
			height: 30px;
			padding: 0;
			border: 0;
			background: transparent;
			box-shadow: none;
			color: rgba(238, 244, 255, 0.68);
			font-size: 20px;
			line-height: 1;
		}

		.model-config-close:hover:not(:disabled),
		.model-config-close:focus-visible {
			background: rgba(255, 255, 255, 0.08);
			box-shadow: none;
			transform: none;
		}

		.model-config-body {
			display: grid;
			gap: 10px;
		}

		.model-config-field {
			display: grid;
			gap: 6px;
		}

		.model-config-field span {
			color: rgba(225, 232, 247, 0.58);
			font-size: 10px;
			letter-spacing: 0.08em;
			text-transform: uppercase;
		}

		.model-config-field select,
		.model-config-field input,
		.model-config-field textarea {
			width: 100%;
			min-height: 38px;
			border: 1px solid rgba(201, 210, 255, 0.14);
			border-radius: 6px;
			background: #080a15;
			color: rgba(247, 249, 255, 0.92);
			padding: 0 10px;
			font: inherit;
			font-size: 12px;
		}

		.model-config-field textarea {
			min-height: 58px;
			padding: 9px 10px;
			resize: vertical;
			line-height: 1.45;
		}

		.model-config-auth,
		.model-config-status {
			min-height: 30px;
			display: flex;
			align-items: center;
			padding: 8px 10px;
			border: 1px solid rgba(201, 210, 255, 0.1);
			border-radius: 6px;
			background: rgba(255, 255, 255, 0.035);
			color: rgba(225, 232, 247, 0.66);
			font-size: 11px;
			line-height: 1.45;
			overflow-wrap: anywhere;
		}

		.model-config-auth[data-state="ready"],
		.model-config-status[data-tone="success"] {
			border-color: rgba(141, 255, 178, 0.18);
			color: rgba(174, 255, 201, 0.86);
			background: rgba(141, 255, 178, 0.055);
		}

		.model-config-auth[data-state="missing"],
		.model-config-status[data-tone="error"] {
			border-color: rgba(255, 113, 136, 0.2);
			color: rgba(255, 185, 198, 0.9);
			background: rgba(255, 113, 136, 0.055);
		}

		.model-config-actions {
			display: flex;
			justify-content: flex-end;
			gap: 10px;
		}

		${getConnRunDetailsStyles()}
		.drag-overlay {
			position: fixed;
			inset: 16px;
			z-index: 40;
			display: none;
			align-items: center;
			justify-content: center;
			border: 1px dashed rgba(201, 210, 255, 0.5);
			background: rgba(5, 7, 13, 0.78);
			pointer-events: none;
		}

		.drag-overlay.active {
			display: flex;
		}

		.drag-overlay-panel {
			min-width: min(520px, calc(100vw - 64px));
			padding: 24px 28px;
			border: 1px solid var(--accent);
			background: rgba(11, 16, 32, 0.94);
			box-shadow: none;
			text-align: center;
		}

		.drag-overlay-panel strong {
			display: block;
			margin-bottom: 8px;
			color: var(--accent);
			font-size: 14px;
			letter-spacing: 0.12em;
			text-transform: uppercase;
		}

		.drag-overlay-panel span {
			display: block;
			color: var(--muted);
			font-size: 12px;
			line-height: 1.7;
			text-transform: uppercase;
			letter-spacing: 0.08em;
		}

		${getPlaygroundAssetBaseStyles()}
		${getConnManagerActivityStyles()}
		${getPlaygroundTaskInboxStyles()}

		${getPlaygroundAssetModalStyles()}

		@media (max-width: 960px) {
			.stream-layout {
				gap: 12px;
			}

			.chat-meta,
			.composer,
			.topbar {
				grid-template-columns: 1fr;
			}

			.composer-side {
				grid-template-columns: repeat(2, minmax(0, 1fr));
			}

			.drop-zone-top,
			.asset-modal-head {
				flex-direction: column;
				align-items: stretch;
			}

			.topbar-right {
				justify-items: start;
			}
		}

		${getPlaygroundMobileLayoutStyles()}

		body {
			position: relative;
			padding: 0;
			align-items: stretch;
		}

		body::before {
			content: "";
			position: fixed;
			inset: 0;
			z-index: 0;
			pointer-events: none;
			opacity: 0.36;
			background-image:
				linear-gradient(rgba(184, 202, 232, 0.018) 1px, transparent 1px),
				linear-gradient(90deg, rgba(184, 202, 232, 0.014) 1px, transparent 1px),
				linear-gradient(rgba(184, 202, 232, 0.032) 1px, transparent 1px),
				linear-gradient(90deg, rgba(184, 202, 232, 0.024) 1px, transparent 1px);
			background-size: 42px 42px, 42px 42px, 168px 168px, 168px 168px;
		}

		body::after {
			content: "";
			position: fixed;
			inset: 0;
			z-index: 0;
			pointer-events: none;
			background:
				linear-gradient(180deg, rgba(255, 255, 255, 0.024), transparent 170px),
				linear-gradient(90deg, rgba(141, 255, 178, 0.014), transparent 24%, transparent 76%, rgba(225, 185, 96, 0.012));
			opacity: 0.64;
		}

		.shell {
			position: relative;
			width: 100vw;
			height: 100vh;
			margin: 0;
			padding: 22px 28px 26px;
			border: 0;
			border-radius: 4px;
			background: transparent;
			box-shadow: none;
			backdrop-filter: none;
			grid-template-rows: 64px minmax(0, 1fr);
			grid-template-columns: 260px minmax(0, 1fr);
			column-gap: 16px;
			row-gap: 0;
			isolation: isolate;
			--conversation-width: 760px;
		}

			.shell:not([data-home="true"]) {
				background-image: none;
			}

		.topbar {
			position: relative;
			grid-column: 2;
			grid-row: 1;
			z-index: 80;
			width: 100%;
			min-height: 64px;
			margin: 0;
			padding: 0 0 10px 0;
			grid-template-columns: minmax(0, 1fr);
			gap: 0;
			align-items: center;
			justify-items: stretch;
			border-bottom: 0;
			background: transparent;
			box-shadow: none;
		}

		.topbar::before {
			content: none;
			display: none;
		}

		.chat-stage {
			position: relative;
			display: grid;
			grid-template-rows: minmax(0, 1fr) auto;
			width: 100%;
			min-width: 0;
			min-height: 0;
			margin: 0;
			padding: 0;
			border: 0;
			border-radius: 4px;
			background: transparent;
			box-shadow: none;
			overflow: hidden;
		}

		.landing-screen {
			display: none;
			position: relative;
			flex: 1 1 auto;
			min-height: 0;
			z-index: 1;
		}

		.shell[data-stage-mode="landing"] .landing-screen {
			display: grid;
		}

		.landing-grid {
			position: relative;
			display: grid;
			grid-template-columns: 1fr;
			align-items: center;
			width: 100%;
			height: 100%;
		}

		.landing-side-right {
			position: static;
			right: auto;
			top: auto;
			z-index: 1;
			display: flex;
			flex-wrap: wrap;
			gap: 6px;
			align-items: center;
			justify-content: flex-end;
			justify-self: end;
			width: auto;
			max-width: 100%;
			min-width: 0;
			margin: 0;
			padding: 6px 96px 6px 8px;
			border: 1px solid rgba(201, 210, 255, 0.1);
			border-radius: 4px;
			background: #080c14;
			box-shadow: none;
			transform: none;
		}

		.shell[data-stage-mode="landing"] .topbar {
			justify-items: stretch;
		}

		.shell[data-stage-mode="landing"] .landing-side-right {
			position: relative;
			justify-content: flex-start;
			justify-self: stretch;
			padding: 6px 96px 6px 8px;
		}

		/* Hide landing-screen when NOT in home mode */
		.shell[data-home="false"] .landing-screen {
			display: none !important;
		}

		/* ===== Agent Home Page (data-home) ===== */
		.shell[data-home="true"] {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			width: 100% !important;
			height: 100vh !important;
			grid-template-columns: unset !important;
			grid-template-rows: unset !important;
			column-gap: unset !important;
		}

		.shell[data-home="true"] > .topbar,
		.shell[data-home="true"] > .desktop-conversation-rail {
			display: none !important;
		}

		.shell[data-home="true"] > .chat-stage {
			grid-column: unset;
			width: 100%;
			height: 100%;
			border: none;
		}

		.shell[data-home="true"] .landing-screen {
			display: flex !important;
			flex-direction: column;
			align-items: center;
			justify-content: flex-start;
			width: 100%;
			height: 100%;
			min-height: 0;
			overflow-x: hidden;
			overflow-y: auto;
			padding: clamp(24px, 5vh, 56px) 0;
			scrollbar-gutter: stable both-edges;
		}

		.shell[data-home="true"] .landing-grid {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			width: 100%;
			min-height: 100%;
			height: auto;
		}

		.shell[data-home="true"] .chat-stage-watermark,
		.shell[data-home="true"] .stream-layout,
		.shell[data-home="true"] .command-deck {
			display: none !important;
		}

		.landing-header {
			text-align: center;
			margin-bottom: 24px;
		}

.landing-logo {
				margin: 0 0 8px;
				display: flex;
				flex-direction: column;
				align-items: center;
			}

			.landing-logo .ugk-svg-logo {
				width: 240px;
				height: auto;
			}

			.landing-logo .ugk-ascii-logo {
				color: rgba(138, 170, 218, 0.4);
				font-size: clamp(6px, 0.88vw, 10px);
				line-height: 0.94;
				margin-top: 8px;
			}

		.landing-subtitle {
			font-size: 13px;
			color: var(--text-muted);
			margin: 0;
		}

		.landing-agent-cards {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
			gap: 16px;
			padding: 0 32px;
			max-width: 960px;
			width: 100%;
		}

		/* === UGK CLAW Clean Hacker Surface === */
		:root[data-theme="dark"] {
			--ugk-bg-base: #070a12;
			--ugk-bg-base-2: #090d15;
			--ugk-bg-glow: rgba(215, 224, 244, 0.026);
			--ugk-bg-corner-glow: rgba(141, 255, 178, 0.016);
			--ugk-grid-line: rgba(184, 202, 232, 0.018);
			--ugk-grid-line-strong: rgba(184, 202, 232, 0.032);
			--ugk-bg-opacity: 0.36;
		}

		:root[data-theme="light"] {
			--ugk-bg-base: #e9eef6;
			--ugk-bg-base-2: #dfe7f1;
			--ugk-bg-glow: rgba(31, 95, 200, 0.032);
			--ugk-bg-corner-glow: rgba(8, 120, 75, 0.018);
			--ugk-grid-line: rgba(30, 65, 108, 0.024);
			--ugk-grid-line-strong: rgba(30, 65, 108, 0.038);
			--ugk-bg-opacity: 0.44;
		}

		.shell[data-home="true"] {
			background:
				linear-gradient(180deg, var(--ugk-bg-glow), transparent 170px),
				linear-gradient(90deg, var(--ugk-bg-corner-glow), transparent 28%, transparent 72%, var(--ugk-bg-corner-glow)),
				var(--ugk-bg-base);
			isolation: isolate;
		}

		.shell[data-home="true"]::before {
			content: "";
			position: fixed;
			inset: 0;
			z-index: 0;
			pointer-events: none;
			opacity: var(--ugk-bg-opacity);
			background-image:
				linear-gradient(var(--ugk-grid-line) 1px, transparent 1px),
				linear-gradient(90deg, var(--ugk-grid-line) 1px, transparent 1px),
				linear-gradient(var(--ugk-grid-line-strong) 1px, transparent 1px),
				linear-gradient(90deg, var(--ugk-grid-line-strong) 1px, transparent 1px);
			background-size:
				40px 40px,
				40px 40px,
				160px 160px,
				160px 160px;
		}

		.shell[data-home="true"]::after {
			content: "";
			position: fixed;
			inset: 0;
			z-index: 0;
			pointer-events: none;
			background: linear-gradient(180deg, rgba(255, 255, 255, 0.018), transparent 210px);
			opacity: 0.72;
		}

		.shell[data-home="true"] > * {
			position: relative;
			z-index: 1;
		}

		.landing-agent-card {
			display: flex;
			flex-direction: column;
			gap: 6px;
			padding: 16px;
			border: 0;
			border-radius: 4px;
			background: #101827;
			cursor: pointer;
			text-align: left;
			color: inherit;
			font-family: inherit;
			font-size: inherit;
			line-height: inherit;
			box-shadow: none;
			transition: background 0.15s ease, color 0.15s ease;
		}

		.landing-agent-card:hover,
		.landing-agent-card:focus-visible {
			border-color: transparent;
			background: #142033;
		}







		:root[data-theme="light"] .landing-agent-card {
			background: #f6f9fe;
			border-color: transparent;
		}

		:root[data-theme="light"] button.landing-agent-card:hover,
		:root[data-theme="light"] button.landing-agent-card:focus-visible {
			border-color: transparent;
			background: #edf3fb !important;
		}

.landing-agent-card.is-busy {
			opacity: 0.7;
		}

		.landing-agent-status-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			flex-shrink: 0;
		}

		.landing-agent-status-dot.idle { background: #4ade80; }
		.landing-agent-status-dot.busy { background: #f87171; animation: pulse-busy 1.5s infinite; }

		@keyframes pulse-busy {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.4; }
		}

		.landing-agent-name {
			font-size: 14px;
			font-weight: 600;
			color: var(--text-primary);
		}

		.landing-agent-id {
			font-family: monospace;
			font-size: 11px;
			color: var(--text-muted);
		}

		.landing-agent-desc {
			font-size: 12px;
			color: var(--text-secondary);
			line-height: 1.4;
		}

		.landing-agent-status-text {
			font-size: 11px;
			margin-top: 4px;
			color: var(--text-muted);
		}

		.landing-agent-card .landing-agent-header {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		.telemetry-card {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-width: 72px;
			min-height: 32px;
			padding: 0 10px;
			border: 0;
			border-radius: 4px;
			background: #101827;
			text-align: center;
			opacity: 1;
			box-shadow: none;
		}

		.telemetry-card span {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
		}

		.telemetry-card strong {
			color: rgba(228, 235, 255, 0.84);
			font-size: 11px;
			letter-spacing: 0.02em;
			font-weight: 600;
		}

		.agent-switcher {
			display: grid;
			grid-template-columns: 1fr;
			align-items: center;
			gap: 6px;
			width: 100%;
			min-height: 58px;
			padding: 8px;
			border: 1px solid rgba(201, 210, 255, 0.1);
			border-radius: 4px;
			background: rgba(201, 210, 255, 0.04);
			color: rgba(228, 235, 255, 0.78);
			font-size: 11px;
		}

		.agent-switcher span {
			color: rgba(139, 149, 178, 0.86);
		}

		.agent-switcher select {
			width: 100%;
			height: 28px;
			border: 1px solid rgba(201, 210, 255, 0.18);
			border-radius: 4px;
			background: #0d1320;
			color: rgba(245, 248, 255, 0.9);
			font: inherit;
		}

		.topbar-agent-label {
			position: relative;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-width: 84px;
			height: 28px;
			padding: 0 10px;
			border: 1px solid rgba(104, 213, 255, 0.2);
			border-radius: 999px;
			background: rgba(104, 213, 255, 0.08);
			color: rgba(183, 235, 255, 0.92);
			font-size: 11px;
			font-weight: 600;
			white-space: nowrap;
			box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
			cursor: pointer;
		}

		.topbar-agent-label:hover:not(:disabled),
		.topbar-agent-label:focus-visible {
			border-color: rgba(104, 213, 255, 0.36);
			background: rgba(104, 213, 255, 0.12);
			box-shadow: none;
			transform: none;
		}

			.agent-switcher-label {
				position: relative;
				z-index: 1;
			}

			.agent-switcher-meta {
				position: absolute;
				top: calc(100% + 8px);
				right: 0;
				z-index: 90;
				display: grid;
				gap: 0;
				width: min(248px, calc(100vw - 24px));
				padding: 6px;
				border: 0;
				border-radius: 4px;
				background: linear-gradient(180deg, rgba(16, 21, 35, 0.98), rgba(7, 10, 18, 0.98)), #070a12;
				box-shadow: none;
				color: rgba(225, 232, 247, 0.82);
				font-size: 11px;
				line-height: 1.35;
				text-align: left;
				white-space: normal;
				opacity: 0;
				pointer-events: none;
				transform: translateY(-4px);
				transition: opacity 120ms ease, transform 120ms ease;
			}

			.topbar-agent-label:hover .agent-switcher-meta,
			.topbar-agent-label:focus-visible .agent-switcher-meta,
			.topbar-agent-label[data-switcher-open="true"] .agent-switcher-meta {
				opacity: 1;
				pointer-events: auto;
				transform: translateY(0);
			}

			.topbar-agent-label[data-switcher-locked="true"] {
				cursor: default;
			}

			.topbar-agent-label[data-switcher-locked="true"] .agent-switcher-meta {
				display: none;
				opacity: 0;
				pointer-events: none;
				transform: translateY(-4px);
			}

			.agent-switcher-list {
				display: grid;
				gap: 4px;
			}

			.agent-switcher-item {
				display: grid;
				grid-template-columns: 1fr auto;
				grid-template-rows: auto auto;
				gap: 2px 8px;
				align-items: center;
				width: 100%;
				padding: 8px 10px;
				border: 0;
				border-radius: 4px;
				background: transparent;
				color: inherit;
				font: inherit;
				text-align: left;
				cursor: pointer;
			}

			.agent-switcher-item:hover:not(:disabled),
			.agent-switcher-item:focus-visible {
				background: rgba(201, 210, 255, 0.06);
			}

			.agent-switcher-item.is-current {
				background: rgba(104, 213, 255, 0.06);
				cursor: default;
			}

			.agent-switcher-item-name {
				grid-column: 1;
				grid-row: 1;
				color: rgba(247, 249, 255, 0.92);
				font-size: 12px;
				font-weight: 600;
			}

			.agent-switcher-item.is-current .agent-switcher-item-name {
				color: rgba(183, 235, 255, 0.92);
			}

			.agent-switcher-item-id {
				grid-column: 1;
				grid-row: 2;
				color: rgba(226, 234, 255, 0.48);
				font-family: var(--font-mono);
				font-size: 10px;
			}

			.agent-switcher-item-status {
				grid-column: 2;
				grid-row: 1 / 3;
				align-self: center;
				padding: 2px 6px;
				border-radius: 4px;
				background: rgba(104, 213, 255, 0.1);
				color: rgba(104, 213, 255, 0.88);
				font-size: 9px;
				font-weight: 700;
				line-height: 1.4;
			}

			.agent-switcher-item-status:empty {
				display: none;
			}


			.agent-switcher-item-status::before {
				content: "";
				display: inline-block;
				width: 6px;
				height: 6px;
				border-radius: 999px;
				margin-right: 4px;
				background: rgba(238, 244, 255, 0.32);
				vertical-align: middle;
			}

			.agent-switcher-item.is-idle .agent-switcher-item-status {
				color: rgba(141, 255, 178, 0.78);
			}
			.agent-switcher-item.is-idle .agent-switcher-item-status::before {
				background: var(--ok);
			}

			.agent-switcher-item.is-busy .agent-switcher-item-status {
				color: rgba(255, 209, 102, 0.88);
				background: rgba(255, 209, 102, 0.1);
			}
			.agent-switcher-item.is-busy .agent-switcher-item-status::before {
				background: var(--warn);
			}

			.agent-switcher-item.is-unknown .agent-switcher-item-status {
				color: rgba(238, 244, 255, 0.48);
			}
			.agent-switcher-item.is-unknown .agent-switcher-item-status::before {
				background: rgba(238, 244, 255, 0.32);
			}


		.telemetry-action {
			position: relative;
			font: inherit;
			color: inherit;
			cursor: pointer;
			padding: 0 10px;
			border: 1px solid transparent;
			border-radius: 4px;
			background: transparent;
			box-shadow: none;
			text-align: center;
			text-decoration: none;
		}

		.telemetry-card.telemetry-action {
			border: 0;
			background: #101827;
		}

		.telemetry-action:hover:not(:disabled),
		.telemetry-action:focus-visible {
			border-color: transparent;
			background: #142033;
			box-shadow: none;
			transform: translateY(0);
		}

		.telemetry-action:hover:not(:disabled) strong,
		.telemetry-action:focus-visible strong {
			color: rgba(246, 249, 255, 0.96);
			text-shadow: none;
		}


		.telemetry-action:disabled {
			cursor: wait;
		}
		/* ????????????????????? telemetry-canvas-link????????? telemetry-action??*/
		.telemetry-canvas-link {
			position: relative;
			padding: 0 12px;
			border: 0;
			border-radius: 6px;
			background:
				linear-gradient(#0b1220, #0b1220) padding-box,
				linear-gradient(
					120deg,
					#ff7188 0%,
					#ffd166 18%,
					#8dffb2 38%,
					#6bb6ff 58%,
					#b388ff 78%,
					#ff7188 100%
				) border-box;
			border: 1.5px solid transparent;
			background-size:
				100% 100%,
				300% 100%;
			box-shadow: 0 0 0 1px rgba(107, 182, 255, 0.12);
			animation: telemetry-canvas-flow 6s linear infinite;
			transition: transform 200ms ease;
		}

		.telemetry-canvas-link span {
			color: rgba(238, 244, 255, 0.62);
		}

		.telemetry-canvas-link strong {
			background: linear-gradient(
				100deg,
				#ff9ab0 0%,
				#ffd166 20%,
				#8dffb2 40%,
				#7cc2ff 60%,
				#c4a6ff 80%,
				#ff9ab0 100%
			);
			background-size: 250% 100%;
			-webkit-background-clip: text;
			background-clip: text;
			color: transparent;
			font-weight: 700;
			animation: telemetry-canvas-text-flow 8s linear infinite;
		}

		.telemetry-canvas-link:hover:not(:disabled),
		.telemetry-canvas-link:focus-visible {
			background:
				linear-gradient(#121a2e, #121a2e) padding-box,
				linear-gradient(
					120deg,
					#ff7188 0%,
					#ffd166 18%,
					#8dffb2 38%,
					#6bb6ff 58%,
					#b388ff 78%,
					#ff7188 100%
				) border-box;
			background-size:
				100% 100%,
				300% 100%;
			box-shadow: 0 0 0 1px rgba(107, 182, 255, 0.24);
			transform: translateY(-1px);
		}

		@keyframes telemetry-canvas-flow {
			0% { background-position: 0% 0%, 0% 0%; }
			100% { background-position: 0% 0%, -300% 0%; }
		}

		@keyframes telemetry-canvas-text-flow {
			0% { background-position: 0% 0%; }
			100% { background-position: -250% 0%; }
		}

		@media (prefers-reduced-motion: reduce) {
			.telemetry-canvas-link,
			.telemetry-canvas-link strong {
				animation: none;
			}
		}

		.telemetry-action[data-tooltip-title]::after {
			content: attr(data-tooltip-title) "\\A" attr(data-tooltip-desc);
			position: absolute;
			top: calc(100% + 10px);
			left: 50%;
			z-index: 120;
			min-width: 206px;
			max-width: min(300px, calc(100vw - 32px));
			padding: 12px 14px;
			border: 0;
			border-radius: 6px;
			background: #111827;
			color: rgba(238, 244, 255, 0.84);
			font-size: 12px;
			font-weight: 650;
			line-height: 1.55;
			text-align: left;
			white-space: pre-line;
			box-shadow: none;
			opacity: 0;
			pointer-events: none;
			transform: translate(-50%, -4px);
			transition: opacity 150ms ease, transform 150ms ease;
			transition-delay: 150ms;
		}

		.telemetry-action[data-tooltip-title]:hover::after,
		.telemetry-action[data-tooltip-title]:focus-visible::after {
			opacity: 1;
			transform: translate(-50%, 0);
		}

		.command-deck {
			position: relative;
			z-index: 2;
			flex-shrink: 0;
			width: 100%;
			margin: 0;
			border-radius: 4px;
			background: transparent;
			box-shadow: none;
			overflow: hidden;
		}

		.topbar-context-slot {
			position: absolute;
			top: 50%;
			right: 16px;
			z-index: 5;
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: 6px;
			flex: 0 0 auto;
			margin-left: 4px;
			transform: translateY(-50%);
			background: transparent;
			box-shadow: none;
		}

		.theme-mode-toggle {
			position: relative;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 58px;
			height: 34px;
			flex: 0 0 auto;
			padding: 3px;
			border: 1px solid rgba(143, 214, 255, 0.16);
			border-radius: 999px;
			background: #101827;
			color: rgba(226, 234, 255, 0.76);
			box-shadow: none;
			cursor: pointer;
		}

		.theme-mode-toggle:hover:not(:disabled),
		.theme-mode-toggle:focus-visible {
			border-color: rgba(143, 214, 255, 0.32);
			background: #142033;
			color: rgba(247, 250, 255, 0.96);
			box-shadow: none;
			transform: none;
		}

		.theme-mode-toggle-track {
			position: relative;
			display: grid;
			grid-template-columns: repeat(2, 22px);
			align-items: center;
			width: 50px;
			height: 26px;
			padding: 2px;
			border-radius: 999px;
			background: #070c14;
		}

		.theme-mode-toggle-icon {
			position: relative;
			z-index: 1;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 22px;
			height: 22px;
			color: rgba(226, 234, 255, 0.5);
		}

		.theme-mode-toggle-icon svg {
			width: 15px;
			height: 15px;
			stroke: currentColor;
		}

		.theme-mode-toggle-sun {
			color: rgba(255, 214, 125, 0.52);
		}

		.theme-mode-toggle-moon {
			color: rgba(185, 247, 255, 0.94);
		}

		.theme-mode-toggle-thumb {
			position: absolute;
			top: 3px;
			left: 3px;
			z-index: 0;
			width: 20px;
			height: 20px;
			border-radius: 999px;
			background:
				radial-gradient(circle at 66% 28%, rgba(255, 255, 255, 0.86), transparent 20%),
				linear-gradient(145deg, #b9f7ff, #4ea1ba);
			transform: translateX(22px);
			transition: transform 160ms ease, background 160ms ease;
		}

		.desktop-conversation-rail {
			grid-column: 1;
			grid-row: 1 / -1;
			display: grid;
			grid-template-rows: auto minmax(0, 1fr) auto;
			min-height: 0;
			margin: 0;
			padding: 14px;
			border: 0;
			border-radius: 4px;
			background: #0b1220;
			box-shadow: none;
			overflow: hidden;
		}

		.desktop-conversation-rail-head {
			display: flex;
			align-items: center;
			justify-content: flex-start;
			min-width: 0;
			padding: 0 2px 12px;
			border-bottom: 0;
		}

		.desktop-conversation-list {
			display: grid;
			align-content: start;
			gap: 2px;
			min-height: 0;
			padding: 10px 0 0;
			overflow-y: auto;
			overflow-x: hidden;
			scrollbar-width: none;
			-ms-overflow-style: none;
		}

		.desktop-rail-settings {
			position: relative;
			display: grid;
			gap: 6px;
			padding-top: 12px;
			border-top: 0;
		}

		.desktop-rail-settings-trigger {
			display: flex;
			align-items: center;
			justify-content: space-between;
			width: 100%;
			height: 34px;
			padding: 0 10px;
			border: 0;
			border-radius: 4px;
			background: #101827;
			color: rgba(228, 235, 255, 0.76);
			font: inherit;
			font-size: 11px;
			cursor: pointer;
		}

		.desktop-rail-settings-menu {
			position: absolute;
			left: 0;
			right: 0;
			bottom: calc(100% - 6px);
			z-index: 125;
			display: grid;
			gap: 6px;
			padding: 8px;
			border: 1px solid rgba(143, 214, 255, 0.16);
			border-radius: 4px;
			background: #111827;
			box-shadow: none;
			opacity: 0;
			pointer-events: none;
			transform: translateY(4px);
			transition: opacity 120ms ease, transform 120ms ease;
		}

		.desktop-rail-settings:hover .desktop-rail-settings-menu,
		.desktop-rail-settings:focus-within .desktop-rail-settings-menu {
			opacity: 1;
			pointer-events: auto;
			transform: translateY(0);
		}

		.desktop-rail-settings-menu .telemetry-action {
			justify-content: flex-start;
			width: 100%;
			min-height: 42px;
			background: #172238;
			text-align: left;
		}

		.desktop-rail-settings-menu .telemetry-action:hover:not(:disabled),
		.desktop-rail-settings-menu .telemetry-action:focus-visible {
			background: #1d3049;
		}


		.desktop-conversation-list::-webkit-scrollbar {
			width: 0;
			height: 0;
			display: none;
		}

		.desktop-conversation-list .mobile-conversation-empty,
		.desktop-conversation-list .mobile-conversation-item {
			border-radius: 4px;
		}

		.desktop-conversation-list .mobile-conversation-item {
			height: 58px;
			gap: 3px;
			padding: 8px 34px 8px 12px;
			border-color: transparent;
			background: #101827;
			opacity: 0.86;
		}

		.desktop-conversation-list .mobile-conversation-item:hover:not(:disabled),
		.desktop-conversation-list .mobile-conversation-item:focus-visible {
			border-color: transparent;
			background: #142033;
			opacity: 1;
		}

		.desktop-conversation-list .mobile-conversation-item.is-active {
			border-color: transparent;
			background: #14243a;
			opacity: 1;
		}

		.desktop-conversation-list .mobile-conversation-item.is-active::before {
			content: "";
			position: absolute;
			left: 0;
			top: 9px;
			bottom: 9px;
			width: 2px;
			border-radius: 999px;
			background: var(--accent);
		}

		.desktop-conversation-list .conversation-item-shell[class*="conversation-bg-"] .mobile-conversation-item {
			background: var(--conversation-card-bg);
			opacity: 1;
		}

		.desktop-conversation-list .conversation-item-shell[class*="conversation-bg-"] .mobile-conversation-item:hover:not(:disabled),
		.desktop-conversation-list .conversation-item-shell[class*="conversation-bg-"] .mobile-conversation-item:focus-visible {
			background: var(--conversation-card-hover-bg);
		}

		.desktop-conversation-list .conversation-item-shell[class*="conversation-bg-"] .mobile-conversation-item.is-active {
			background: var(--conversation-card-active-bg);
		}

		.desktop-conversation-list .conversation-item-shell[class*="conversation-bg-"] .mobile-conversation-title {
			color: #172033;
		}

		.desktop-conversation-list .conversation-item-shell[class*="conversation-bg-"] .mobile-conversation-meta span {
			color: rgba(23, 32, 51, 0.58);
		}

		.desktop-conversation-list .conversation-item-shell[class*="conversation-bg-"] .conversation-item-menu-trigger {
			color: rgba(23, 32, 51, 0.68);
		}

		.desktop-conversation-list .conversation-item-shell[class*="conversation-bg-"]:hover .conversation-item-menu-trigger,
		.desktop-conversation-list .conversation-item-shell[class*="conversation-bg-"]:focus-within .conversation-item-menu-trigger,
		.desktop-conversation-list .conversation-item-shell[class*="conversation-bg-"] .conversation-item-menu-trigger[aria-expanded="true"] {
			color: #111827;
			opacity: 1;
		}

		.desktop-conversation-list .conversation-item-shell.is-pinned .mobile-conversation-item::after {
			top: 9px;
			bottom: 9px;
			width: 2px;
		}

		.desktop-conversation-list .mobile-conversation-title {
			color: rgba(246, 249, 255, 0.82);
			font-size: 12px;
			font-weight: 620;
			line-height: 1.25;
		}

		.desktop-conversation-list .mobile-conversation-meta {
			justify-content: flex-start;
			gap: 6px;
			color: rgba(226, 234, 255, 0.34);
			font-size: 9px;
			line-height: 1.25;
		}

		.desktop-conversation-list .mobile-conversation-meta span {
			padding: 0;
			background: transparent;
		}

		.desktop-conversation-list .mobile-conversation-item.is-active .mobile-conversation-title {
			color: rgba(248, 251, 255, 0.96);
		}

		.desktop-conversation-list .mobile-conversation-item.is-active .mobile-conversation-meta {
			color: rgba(226, 234, 255, 0.5);
		}

		.desktop-conversation-list .conversation-item-menu-trigger {
			top: 7px;
			right: 6px;
			opacity: 0;
		}

		.desktop-conversation-list .conversation-item-shell:hover .conversation-item-menu-trigger,
		.desktop-conversation-list .conversation-item-shell:focus-within .conversation-item-menu-trigger,
		.desktop-conversation-list .mobile-conversation-item.is-active + .conversation-item-menu-trigger,
		.desktop-conversation-list .conversation-item-menu-trigger[aria-expanded="true"] {
			opacity: 0.72;
		}

		.shell[data-stage-mode="landing"] .stream-layout {
			position: absolute;
			inset: 78px 0 var(--command-deck-offset, 166px) 0;
			display: flex;
			align-items: center;
			overflow: hidden;
			z-index: 3;
			pointer-events: none;
		}

		.shell[data-stage-mode="landing"][data-transcript-state="idle"] .stream-layout {
			justify-content: center;
		}

		.shell[data-stage-mode="landing"][data-transcript-state="active"] .stream-layout {
			inset: 0 0 var(--command-deck-offset, 166px) 0;
			justify-content: flex-end;
		}

		.shell[data-stage-mode="landing"] .transcript-pane,
		.shell[data-stage-mode="landing"] .transcript {
			pointer-events: auto;
		}

		.shell[data-stage-mode="landing"] .transcript-pane {
			flex: 1 1 auto;
			width: min(var(--conversation-width), 100%);
			height: 100%;
			max-height: 100%;
			margin: 0 auto;
		}

		.shell[data-stage-mode="landing"] .transcript {
			padding: 0 0 12px;
			border-bottom-right-radius: 4px;
			border-bottom-left-radius: 4px;
		}

		.shell[data-stage-mode="landing"] .command-deck {
			display: grid;
			grid-auto-rows: max-content;
			align-self: end;
			align-content: end;
			gap: 4px;
			width: 100%;
			margin: 0;
			border-radius: 4px;
			overflow: hidden;
			z-index: 4;
		}

		.shell[data-stage-mode="landing"] .context-usage-row {
			display: none;
		}

		.shell[data-stage-mode="landing"] .composer {
			grid-template-columns: auto minmax(0, 1fr) auto;
			align-self: end;
			align-items: center;
			height: fit-content;
			min-height: 0;
			max-height: none;
			gap: 8px;
			padding: 8px 10px 8px 12px;
			border: 0;
			border-radius: 4px;
			background: var(--chat-composer-bg);
			box-shadow: none;
			overflow: hidden;
			backdrop-filter: none;
		}

		.shell[data-stage-mode="landing"] .composer-header {
			display: none;
		}

		.shell[data-stage-mode="landing"] .composer-main {
			gap: 4px;
		}

		.shell[data-stage-mode="landing"] .composer textarea {
			--composer-line-height: 20px;
			min-height: 40px;
			max-height: calc(var(--composer-line-height) * var(--composer-textarea-max-lines) + 20px);
			padding: 10px 8px;
			border: 0;
			background: transparent;
			box-shadow: none;
			color: rgba(238, 244, 255, 0.84);
			line-height: var(--composer-line-height);
			resize: none;
			overflow-y: auto;
		}

		.shell[data-stage-mode="landing"] .composer textarea::placeholder {
			color: rgba(214, 220, 255, 0.28);
		}

		.shell[data-stage-mode="landing"] .composer textarea:focus {
			background: transparent;
			box-shadow: none;
		}

		${getPlaygroundAssetLandingStyles()}

		${getPlaygroundTeamConsoleEmbedStyles()}

		@media (max-width: 900px) {
			.chat-stage {
				padding: 0 18px 18px;
			}

			.landing-grid {
				grid-template-columns: 1fr;
			}

			.landing-side-right {
				gap: 5px;
				max-width: calc(100% - 32px);
			}

			.telemetry-card {
				min-width: 64px;
			}

			.shell[data-stage-mode="landing"] .stream-layout {
				inset: 78px 18px var(--command-deck-offset, 190px) 18px;
			}
		}

		${getPlaygroundMobileWorkspaceStyles()}

		${getPlaygroundThemeStyles()}
	`;
}

let markedBrowserScriptCache: string | undefined;
