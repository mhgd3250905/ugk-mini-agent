import { getConnManagerActivityStyles, getConnRunDetailsStyles } from "./playground-conn-activity.js";
import {
	getPlaygroundAssetBaseStyles,
	getPlaygroundAssetLandingStyles,
	getPlaygroundAssetMobileStyles,
	getPlaygroundAssetModalStyles,
} from "./playground-assets.js";
import { getPlaygroundTaskInboxStyles } from "./playground-task-inbox.js";
import { getPlaygroundThemeStyles } from "./playground-theme-controller.js";
import { getPlaygroundConversationStyles } from "./playground-conversation-styles.js";
import { getPlaygroundContextUsageStyles } from "./playground-context-usage-styles.js";
import { getPlaygroundConfirmDialogStyles } from "./playground-confirm-dialog-styles.js";
import { getPlaygroundErrorBannerStyles } from "./playground-error-banner-styles.js";
import { getPlaygroundScrollToBottomStyles } from "./playground-scroll-to-bottom-styles.js";
import { getPlaygroundNotificationStyles } from "./playground-notification-styles.js";

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

		.chat-stage > :not(.chat-stage-watermark) {
			position: relative;
			z-index: 1;
		}

		.chat-stage > .error-banner {
			z-index: 95;
		}

		.chat-stage > .notification-live-region {
			z-index: 90;
		}

		.runtime-summary {
			display: grid;
			gap: 9px;
			min-width: 0;
			margin-top: 10px;
			padding: 10px 10px 11px;
			border-top: 1px solid rgba(201, 210, 255, 0.08);
		}

		.shell[data-home="true"] .runtime-summary {
			display: none;
		}

		.runtime-summary-item {
			position: relative;
			display: grid;
			gap: 4px;
			min-width: 0;
			padding-left: 9px;
			color: rgba(238, 244, 255, 0.88);
			text-align: left;
			overflow: hidden;
		}

		.runtime-summary-item::before {
			content: "";
			position: absolute;
			left: 0;
			top: 2px;
			bottom: 2px;
			width: 2px;
			border-radius: 999px;
			background: rgba(141, 255, 178, 0.46);
			pointer-events: none;
		}

		.runtime-summary-item--browser::before {
			background: rgba(112, 185, 255, 0.52);
		}

		.runtime-summary-label {
			color: rgba(226, 234, 255, 0.44);
			font-family: var(--font-mono);
			font-size: 9px;
			font-weight: 700;
			line-height: 1;
			text-transform: uppercase;
			letter-spacing: 0.08em;
		}

		.runtime-summary-item strong {
			display: block;
			min-width: 0;
			overflow: hidden;
			color: rgba(247, 249, 255, 0.94);
			font-family: var(--font-mono);
			font-size: 10px;
			font-weight: 700;
			line-height: 1.25;
			text-overflow: ellipsis;
			white-space: nowrap;
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
		.chat-stage[data-workspace-mode="browsers"] .landing-screen,
		.chat-stage[data-workspace-mode="browsers"] .stream-layout,
		.chat-stage[data-workspace-mode="browsers"] .command-deck,
		.chat-stage[data-workspace-mode="browsers"] .chat-stage-watermark,
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
		.chat-stage[data-workspace-mode="browsers"] > #browser-workbench-dialog.workspace-contained,
		.chat-stage[data-workspace-mode="task"] > #task-inbox-view.workspace-contained {
			display: flex;
		}

		.chat-stage > .workspace-contained .asset-modal,
		.chat-stage > .workspace-contained .conn-manager-panel,
		.chat-stage > .workspace-contained .agent-manager-panel,
		.chat-stage > .workspace-contained .browser-workbench-panel,
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
		.chat-stage > .workspace-contained .browser-workbench-body,
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

		.message-context-menu {
			position: fixed;
			z-index: 40;
			display: grid;
			gap: 4px;
			min-width: 128px;
			padding: 5px;
			border: 1px solid rgba(201, 210, 255, 0.14);
			border-radius: 4px;
			background: rgba(9, 12, 22, 0.96);
			box-shadow: none;
		}

		.message-context-menu button {
			width: 100%;
			min-height: 34px;
			padding: 0 10px;
			border: 0;
			border-radius: 4px;
			background: transparent;
			color: rgba(242, 246, 255, 0.92);
			font-size: 12px;
			font-weight: 700;
			text-align: left;
			text-transform: none;
			letter-spacing: 0;
			box-shadow: none;
		}

		.message-context-menu button:hover,
		.message-context-menu button:focus-visible {
			background: rgba(201, 210, 255, 0.1);
			color: #ffffff;
			transform: none;
		}

		.message-context-toast {
			position: fixed;
			left: 50%;
			bottom: calc(88px + env(safe-area-inset-bottom));
			z-index: 41;
			transform: translateX(-50%);
			padding: 8px 12px;
			border-radius: 4px;
			background: rgba(10, 14, 24, 0.92);
			color: #f3fbff;
			font-size: 12px;
			font-weight: 800;
			box-shadow: none;
			pointer-events: none;
		}

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

		@media (max-width: 640px) {
			body {
				padding: 0;
			}

			.workspace-contained {
				position: fixed;
				inset: 0;
				width: 100%;
				height: 100%;
			}

			.shell {
				height: 100vh;
				border-left: 0;
				border-right: 0;
			}

			.chat-stage {
				width: 100%;
				margin: 0;
				border-left: 0;
				border-right: 0;
			}

			.ugk-ascii-logo-watermark {
				font-size: clamp(5px, 1.55vw, 8px);
				opacity: 0.72;
			}

			.topbar {
				width: 100%;
				padding: 16px 18px 12px;
			}

			.message {
				padding-left: 12px;
				padding-right: 12px;
			}

			.message.user,
			.message.assistant {
				padding-left: 12px;
				padding-right: 12px;
			}

			.asset-modal-shell {
				padding: 0;
			}

			.asset-modal {
				width: 100%;
				height: 100%;
				max-height: none;
				border-left: 0;
				border-right: 0;
			}
		}

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

		.shell[data-team-console-embed="mini"] {
			display: grid !important;
			grid-template-columns: minmax(0, 1fr) !important;
			grid-template-rows: 34px minmax(0, 1fr) !important;
			gap: 8px !important;
			align-items: stretch !important;
			justify-content: stretch !important;
			width: 100% !important;
			height: 100vh !important;
			min-height: 0 !important;
			margin: 0 !important;
			padding: 8px !important;
			background: transparent !important;
			overflow: hidden !important;
			--conversation-width: 100%;
			--command-deck-offset: 74px;
		}

		.shell[data-team-console-embed="mini"]::before,
		.shell[data-team-console-embed="mini"]::after,
		.shell[data-team-console-embed="mini"] .chat-stage-watermark,
		.shell[data-team-console-embed="mini"] .landing-screen,
		.shell[data-team-console-embed="mini"] > .desktop-conversation-rail,
		.shell[data-team-console-embed="mini"] .desktop-conversation-rail-head,
		.shell[data-team-console-embed="mini"] .desktop-conversation-list,
		.shell[data-team-console-embed="mini"] .desktop-rail-settings-trigger,
		.shell[data-team-console-embed="mini"] .desktop-rail-settings-menu,
		.shell[data-team-console-embed="mini"] #open-asset-library-button,
		.shell[data-team-console-embed="mini"] #open-conn-manager-button,
		.shell[data-team-console-embed="mini"] #open-task-inbox-button,
		.shell[data-team-console-embed="mini"] .theme-mode-toggle,
		.shell[data-team-console-embed="mini"] .landing-side-right > a.telemetry-action,
		.shell[data-team-console-embed="mini"] .topbar-agent-label,
		.shell[data-team-console-embed="mini"] .mobile-topbar,
		.shell[data-team-console-embed="mini"] .topbar-right,
		.shell[data-team-console-embed="mini"] .pane-head,
		.shell[data-team-console-embed="mini"] .context-usage-row {
			display: none !important;
		}

		.shell[data-team-console-embed="mini"] > .topbar {
			position: relative !important;
			grid-column: 1 !important;
			grid-row: 1 !important;
			z-index: 8;
			display: flex !important;
			align-items: center !important;
			justify-content: stretch !important;
			width: 100% !important;
			min-height: 0 !important;
			margin: 0 !important;
			padding: 0 !important;
			border: 0 !important;
			background: transparent !important;
			box-shadow: none !important;
		}

		.shell[data-team-console-embed="mini"] .landing-side-right {
			position: static !important;
			display: flex !important;
			align-items: center !important;
			justify-content: space-between !important;
			gap: 6px !important;
			width: 100% !important;
			max-width: 100% !important;
			min-width: 0 !important;
			margin: 0 !important;
			padding: 0 !important;
			border: 0 !important;
			background: transparent !important;
			box-shadow: none !important;
		}

		.shell[data-team-console-embed="mini"] #new-conversation-button {
			display: inline-flex !important;
			align-items: center;
			justify-content: center;
			min-width: 74px;
			min-height: 28px;
			padding: 0 12px;
			border: 1px solid rgba(201, 210, 255, 0.13);
			border-radius: 4px;
			background: rgba(15, 21, 34, 0.92);
			color: rgba(226, 234, 255, 0.78);
			box-shadow: none;
			order: 1;
		}

		.shell[data-team-console-embed="mini"] #new-conversation-button strong {
			font-size: 11px;
			font-weight: 650;
			line-height: 1;
		}

		.shell[data-team-console-embed="mini"] #new-conversation-button[data-tooltip-title]::after {
			left: 0;
			min-width: min(220px, calc(100vw - 16px));
			max-width: min(260px, calc(100vw - 16px));
			transform: translateY(-4px);
		}

		.shell[data-team-console-embed="mini"] #new-conversation-button[data-tooltip-title]:hover::after,
		.shell[data-team-console-embed="mini"] #new-conversation-button[data-tooltip-title]:focus-visible::after {
			transform: translateY(0);
		}

		.shell[data-team-console-embed="mini"] .topbar-context-slot {
			position: static !important;
			inset: auto !important;
			z-index: 9;
			display: flex !important;
			align-items: center !important;
			justify-content: flex-end !important;
			min-width: 0 !important;
			margin: 0 !important;
			background: transparent !important;
			box-shadow: none !important;
			transform: none !important;
			order: 2;
		}

		.shell[data-team-console-embed="mini"] > .chat-stage {
			grid-column: 1 / -1 !important;
			grid-row: 2 !important;
			display: grid !important;
			grid-template-rows: minmax(0, 1fr) auto;
			width: 100% !important;
			height: 100% !important;
			min-height: 0 !important;
			margin: 0 !important;
			padding: 0 !important;
			border: 0 !important;
			background: transparent !important;
			overflow: hidden !important;
		}

		.shell[data-team-console-embed="mini"] .stream-layout,
		.shell[data-team-console-embed="mini"][data-stage-mode="landing"] .stream-layout,
		.shell[data-team-console-embed="mini"][data-home="true"] .stream-layout {
			position: absolute !important;
			inset: 0 0 var(--command-deck-offset, 74px) 0 !important;
			z-index: 3;
			display: flex !important;
			align-items: stretch !important;
			justify-content: stretch !important;
			min-height: 0 !important;
			overflow: hidden !important;
			pointer-events: auto !important;
		}

		.shell[data-team-console-embed="mini"] .transcript-pane,
		.shell[data-team-console-embed="mini"][data-stage-mode="landing"] .transcript-pane {
			width: 100% !important;
			height: 100% !important;
			max-height: 100% !important;
			margin: 0 !important;
		}

		.shell[data-team-console-embed="mini"] .transcript,
		.shell[data-team-console-embed="mini"][data-stage-mode="landing"] .transcript {
			height: 100%;
			padding: 0 0 10px;
			scrollbar-width: thin;
			scrollbar-color: rgba(201, 210, 255, 0.22) transparent;
		}

		.shell[data-team-console-embed="mini"] .command-deck,
		.shell[data-team-console-embed="mini"][data-stage-mode="landing"] .command-deck,
		.shell[data-team-console-embed="mini"][data-home="true"] .command-deck {
			position: absolute !important;
			left: 0 !important;
			right: 0 !important;
			bottom: 0 !important;
			z-index: 5;
			display: grid !important;
			width: 100% !important;
			margin: 0 !important;
			border-radius: 4px !important;
			overflow: hidden !important;
		}

		.shell[data-team-console-embed="mini"] .composer,
		.shell[data-team-console-embed="mini"][data-stage-mode="landing"] .composer {
			min-height: 58px;
			padding: 8px 10px;
			border-color: rgba(201, 210, 255, 0.1);
			background: rgba(9, 13, 23, 0.96);
		}

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

		@media (max-width: 640px) {
			body {
				padding: 0;
			}

			.shell {
				width: 100vw;
				height: 100vh;
				padding: 0;
				border-radius: 0;
				grid-template-columns: minmax(0, 1fr);
				grid-template-rows: auto minmax(0, 1fr);
				gap: 0;
				--transcript-bottom-scroll-buffer: calc(112px + env(safe-area-inset-bottom));
			}
			/* Mobile home page */
			.shell[data-home="true"] {
				display: flex;
				flex-direction: column;
				align-items: stretch;
				justify-content: flex-start;
				width: 100vw;
				height: 100vh;
				height: 100dvh;
				grid-template-columns: unset !important;
				grid-template-rows: unset !important;
			}

			.shell[data-home="true"] > .topbar,
			.shell[data-home="true"] > .desktop-conversation-rail {
				display: none !important;
			}

			.shell[data-home="true"] > .chat-stage {
				grid-column: unset;
				width: 100%;
				height: 100%;
				min-height: 0;
				display: flex;
				flex-direction: column;
			}

			.shell[data-home="true"] .landing-screen {
				display: flex !important;
				flex-direction: column;
				align-items: stretch;
				justify-content: flex-start;
				width: 100%;
				height: 100%;
				min-height: 0;
				overflow-x: hidden;
				overflow-y: auto;
				padding: calc(18px + env(safe-area-inset-top)) 0 calc(24px + env(safe-area-inset-bottom));
				-webkit-overflow-scrolling: touch;
			}

			.shell[data-home="true"] .landing-grid {
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: flex-start;
				width: 100%;
				min-height: 100%;
				height: auto;
			}

			.shell[data-home="true"] .chat-stage-watermark,
			.shell[data-home="true"] .stream-layout,
			.shell[data-home="true"] .command-deck {
				display: none !important;
			}

			.landing-agent-cards {
				grid-template-columns: 1fr;
				padding: 0 16px;
				gap: 12px;
				max-width: 480px;
			}

			.landing-logo .ugk-svg-logo {
				width: min(200px, 60vw);
			}

			.landing-logo .ugk-svg-logo-watermark {
				opacity: 0.88;
			}

			.landing-logo .ugk-ascii-logo {
				display: none;
			}


			.topbar {
				grid-column: 1;
				grid-row: 1;
				grid-template-columns: 1fr;
				width: 100%;
				padding: max(8px, env(safe-area-inset-top)) 12px 6px;
				min-height: 48px;
				gap: 0;
				border-bottom: 0;
				background: transparent;
				box-shadow: none;
				backdrop-filter: none;
			}

			.topbar::before {
				display: none;
			}

			.mobile-topbar {
				display: grid;
				grid-template-columns: auto minmax(0, 1fr) auto auto;
				gap: 8px;
				min-height: 48px;
			}

			.topbar-context-slot {
				position: absolute;
				top: max(15px, calc(env(safe-area-inset-top) + 15px));
				right: 92px;
				gap: 4px;
				margin-left: 0;
				transform: none;
			}

			.theme-mode-toggle {
				display: none;
			}

			.topbar-agent-label {
				display: inline-flex;
				min-width: 0;
				max-width: 70px;
				height: 28px;
				padding: 0 6px;
				overflow: hidden;
				font-size: 10px;
				text-overflow: ellipsis;
			}

			.topbar-context-slot .context-usage-shell,
			.topbar-context-slot .context-usage-shell:hover,
			.topbar-context-slot .context-usage-shell:focus-visible,
			.topbar-context-slot .context-usage-shell[data-expanded="true"] {
				border-color: transparent;
				background: transparent;
				box-shadow: none;
			}

			.context-usage-shell {
				width: 72px;
				height: 34px;
				grid-template-columns: 38px auto;
				gap: 5px;
				padding: 6px 7px;
			}

			.context-usage-battery {
				width: 38px;
				height: 12px;
			}

			.mobile-brand-logo {
				width: min(120px, 42vw);
				height: 32px;
			}

			.ugk-svg-logo {
				display: block;
			}

			.ugk-svg-logo-topbar {
				width: 120px;
				height: 32px;
			}

			.ugk-svg-logo-watermark {
				width: min(240px, 72vw);
				height: auto;
				opacity: 0.15;
			}

			:root[data-theme="light"] .ugk-svg-logo-watermark {
				opacity: 0.25;
			}

			.mobile-brand-logo .ugk-ascii-logo-topbar {
				display: none;
			}

			.landing-screen {
				display: none !important;
			}

			.landing-side-right {
				display: contents;
			}

			.landing-side-right > .telemetry-action {
				display: none;
			}

			.landing-side-right > .agent-switcher {
				display: none;
			}

			.desktop-conversation-rail {
				display: none;
			}

			.chat-stage {
				grid-column: auto;
				grid-row: auto;
				display: grid;
				grid-template-rows: auto minmax(0, 1fr) auto;
				gap: 8px;
				padding: 0 8px calc(8px + env(safe-area-inset-bottom));
				overflow: hidden;
			}

			.runtime-summary {
				display: none;
			}

			.chat-stage-watermark {
				display: flex;
				align-items: center;
				justify-content: center;
				width: min(180px, 48vw);
				max-width: 48vw;
				opacity: 0.11;
			}

			.scroll-to-bottom-button {
				position: fixed;
				right: 12px;
				bottom: calc(80px + env(safe-area-inset-bottom));
			}

			.error-banner {
				top: 6px;
				width: calc(100% - 16px);
				padding: 10px 12px;
			}

			.notification-live-region {
				top: calc(10px + env(safe-area-inset-top));
				right: 12px;
				left: 12px;
				width: auto;
			}

			.transcript-pane {
				width: 100%;
				height: 100%;
				min-height: 0;
				border: 0;
				border-radius: 14px;
				background: transparent;
				box-shadow: none;
			}

			.transcript {
				width: 100%;
				min-width: 0;
				max-width: 100%;
				padding: 8px 0 10px;
			}

			.archived-conversation-head {
				padding: 0 12px;
			}

			.stream-layout {
				gap: 0;
				flex: 1 1 auto;
				width: 100%;
				min-width: 0;
				max-width: 100%;
				min-height: 0;
			}

			.shell[data-stage-mode="landing"] .stream-layout {
				position: relative;
				inset: auto;
				display: flex;
				align-items: stretch;
				justify-content: flex-start;
				width: 100%;
				min-width: 0;
				max-width: 100%;
				overflow: hidden;
				z-index: 1;
				pointer-events: auto;
			}

			.shell[data-stage-mode="landing"][data-transcript-state="idle"] .stream-layout,
			.shell[data-stage-mode="landing"][data-transcript-state="active"] .stream-layout {
				position: relative;
				inset: auto;
				justify-content: flex-start;
				width: 100%;
				min-width: 0;
				max-width: 100%;
			}

			.shell[data-stage-mode="landing"] .transcript-pane {
				width: 100%;
				min-width: 0;
				max-width: 100%;
				margin: 0;
			}

			.shell[data-stage-mode="landing"] .command-deck {
				grid-auto-rows: max-content;
				align-self: end;
				align-content: end;
				width: 100%;
				margin-bottom: 0;
			}

			.file-strip {
				gap: 6px;
			}

			.context-usage-summary {
				font-size: 8px;
			}

			.context-usage-meta {
				display: none;
			}

			.context-usage-dialog {
				align-items: flex-start;
				padding: calc(58px + env(safe-area-inset-top)) 8px 10px;
				background: rgba(1, 3, 10, 0.86);
			}

			.context-usage-dialog-panel {
				width: 100%;
				padding: 10px;
				border: 0;
				border-radius: 8px;
				background:
					linear-gradient(180deg, #121522 0%, #070914 38%, #04050d 100%),
					#060711;
				box-shadow: none;
			}

			.context-usage-dialog-head {
				margin-bottom: 0;
				padding: 6px 6px 10px 8px;
				border-bottom: 0;
			}

			.context-usage-dialog-body {
				gap: 10px;
				padding: 0;
				border: 0;
				border-radius: 0;
				background: transparent;
				color: rgba(238, 244, 255, 0.78);
			}

			.context-usage-dialog-hero,
			.context-usage-dialog-metric,
			.context-usage-dialog-model {
				border-radius: 8px;
			}

			.context-usage-dialog-main strong {
				font-size: 42px;
			}

			${getPlaygroundAssetMobileStyles()}

			.composer {
				grid-template-columns: auto minmax(0, 1fr) auto;
				gap: 8px;
				padding: 8px 8px 8px 10px;
				border: 0;
				border-radius: 4px;
				background: var(--chat-composer-bg);
				box-shadow: none;
			}

			.composer-main {
				gap: 4px;
				min-width: 0;
			}

			.composer-header {
				display: none;
			}

			.composer textarea {
				--composer-line-height: 20px;
				min-height: 44px;
				max-height: calc(var(--composer-line-height) * var(--composer-textarea-max-lines) + 24px);
				padding: 12px 0;
				border: 0;
				background: transparent;
				box-shadow: none;
				color: rgba(242, 246, 255, 0.92);
				font-size: 14px;
				line-height: var(--composer-line-height);
				resize: none;
				overflow-y: auto;
			}

			.composer textarea:focus {
				background: transparent;
				box-shadow: none;
			}

			.composer-side {
				display: grid;
				grid-auto-flow: column;
				grid-auto-columns: 46px;
				gap: 8px;
				align-content: end;
				align-items: end;
			}

			.shell[data-stage-mode="landing"] .composer {
				grid-template-columns: auto minmax(0, 1fr) auto;
				align-self: end;
				align-items: center;
				height: fit-content;
				min-height: 0;
				max-height: none;
				gap: 8px;
				padding: 6px 8px 6px 10px;
				border: 0;
				border-radius: 4px;
				background: var(--chat-composer-bg);
				box-shadow: none;
			}

			.shell[data-stage-mode="landing"] .composer-side {
				display: grid;
				grid-auto-flow: column;
				grid-auto-columns: 46px;
				gap: 8px;
				align-content: end;
				align-items: end;
			}

			.shell[data-stage-mode="landing"] .composer textarea {
				--composer-line-height: 20px;
				min-height: 40px;
				max-height: calc(var(--composer-line-height) * var(--composer-textarea-max-lines) + 20px);
				padding: 10px 0;
				font-size: 14px;
				line-height: var(--composer-line-height);
				color: rgba(242, 246, 255, 0.92);
			}

			#send-button,
			#interrupt-button {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				min-width: 46px;
				min-height: 46px;
				padding: 0;
				border: 0;
				border-radius: 0;
				background: transparent;
				box-shadow: none;
				appearance: none;
				-webkit-appearance: none;
				color: transparent;
				font-size: 0;
				line-height: 0;
				letter-spacing: 0;
				text-indent: -9999px;
				overflow: hidden;
			}

			#send-button:hover:not(:disabled),
			#send-button:focus-visible,
			#interrupt-button:hover:not(:disabled),
			#interrupt-button:focus-visible {
				border: 0;
				background: transparent;
				box-shadow: none;
				transform: none;
			}

			#send-button::before {
				content: "";
				display: block;
				width: 28px;
				height: 28px;
				background-repeat: no-repeat;
				background-position: center;
				background-size: 28px 28px;
				background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M8 13V4' stroke='rgba(242,246,255,0.9)' stroke-width='1.6' stroke-linecap='round'/%3E%3Cpath d='M4.75 7.25L8 4L11.25 7.25' stroke='rgba(242,246,255,0.9)' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
			}

			#interrupt-button::before {
				content: "";
				display: block;
				width: 28px;
				height: 28px;
				background-repeat: no-repeat;
				background-position: center;
				background-size: 28px 28px;
				background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Crect x='4' y='4' width='8' height='8' rx='1.2' fill='rgba(255,255,255,0.96)'/%3E%3C/svg%3E");
			}

			#interrupt-button:disabled {
				display: inline-flex;
				opacity: 0.38;
				background: transparent;
				box-shadow: none;
				cursor: default;
			}

			.message {
				padding-top: 10px;
			}

			.message.user .message-body {
				max-width: min(100%, 90%);
			}

			.message-body {
				padding: 14px 14px 15px;
				border-radius: 4px;
				background: var(--chat-assistant-bg);
			}

			.message-content {
				font-size: 14px;
				line-height: 1.75;
				min-width: 0;
			}

			.message-meta {
				padding: 0 2px;
				font-size: 9px;
			}

			.message.assistant .message-meta {
				gap: 6px;
			}

			.message.assistant .assistant-status-shell {
				padding: 0 2px;
				gap: 0;
			}

			.message.assistant .assistant-status-summary {
				max-width: 100%;
				color: rgba(238, 244, 255, 0.52);
				font-size: 11px;
				line-height: 1.45;
			}

			.message.assistant .message-meta .assistant-loading-bubble {
				height: 24px;
				min-width: 24px;
				padding: 0 7px;
				gap: 5px;
				border: 0;
				background: transparent;
				box-shadow: none;
			}

			.message.assistant .message-meta .assistant-run-log-hint {
				display: none;
			}

			.message.assistant .message-meta .assistant-loading-dot {
				width: 4px;
				height: 4px;
			}

			.message-body > .message-actions {
				display: none;
			}

			.message-copy-button,
			.message-image-export-button {
				width: 24px;
				height: 24px;
			}

			.message,
			.message-body,
			.message-content,
			.message-content .code-block,
			.message-content pre {
				min-width: 0;
				max-width: 100%;
				box-sizing: border-box;
			}

			.message-content .code-block {
				border: 0;
				border-radius: 0;
				background: transparent;
				box-shadow: none;
				position: relative;
				overflow: hidden;
			}

			.message-content .code-block-toolbar {
				position: absolute;
				top: 8px;
				right: 8px;
				display: flex;
				align-items: center;
				justify-content: flex-end;
				padding: 0;
				border: 0;
				background: transparent;
				pointer-events: none;
				z-index: 1;
			}

			.message-content .code-block-language {
				display: none;
			}

			.message-content .copy-code-button {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 24px;
				height: 24px;
				padding: 0;
				border: 0;
				border-radius: 0;
				background: transparent;
				color: transparent;
				font-size: 0;
				line-height: 0;
				text-indent: -9999px;
				overflow: hidden;
				pointer-events: auto;
				box-shadow: none;
				opacity: 0.82;
			}

			.message-content .copy-code-button::before {
				content: "";
				width: 14px;
				height: 14px;
				display: block;
				background-repeat: no-repeat;
				background-position: center;
				background-size: 14px 14px;
				background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Crect x='5' y='3' width='8' height='10' rx='1.5' stroke='rgba(242,246,255,0.82)' stroke-width='1.4'/%3E%3Cpath d='M3.5 10.5V5.5C3.5 4.4 4.4 3.5 5.5 3.5' stroke='rgba(242,246,255,0.62)' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E");
			}

			.message-content .copy-code-button:disabled {
				opacity: 0.5;
			}

			.message-content .copy-code-button:disabled::before {
				opacity: 0.72;
			}

			.message-content pre,
			.message-content .code-block pre {
				margin: 0;
				padding: 14px 12px 10px;
				border: 1px solid rgba(255, 255, 255, 0);
				border-radius: 12px;
				background: transparent;
				box-shadow: none;
				overflow-x: auto;
				overflow-y: hidden;
			}

			.message.assistant .message-content pre,
			.message.assistant .message-content .code-block,
			.message.assistant .message-content .code-block pre {
				background: transparent;
			}

			.message.assistant .message-content code {
				background: transparent;
			}

			.message-content pre code {
				font-size: 11px;
				line-height: 1.6;
				white-space: pre-wrap;
				overflow-wrap: anywhere;
				word-break: break-word;
			}

			.transcript-pane,
			.mobile-topbar-button,
			.mobile-overflow-menu,
			.mobile-overflow-menu-item,
			.shell[data-stage-mode="landing"] .composer,
			#send-button,
			#interrupt-button,
			.message-body,
			.message-copy-button,
			.message-content .code-block,
			.message-content .copy-code-button,
			.message-content pre,
			.message-content .code-block pre,
			.file-chip,
			.file-chip-badge,
			.file-chip-remove,
			.selected-assets,
			.asset-pill,
			.asset-empty,
			.asset-modal-panel,
			.conn-editor-field input,
			.conn-editor-field select,
			.conn-editor-field textarea,
			.asset-modal-search input,
			.error-banner,
			.error-banner-close,
			.assistant-loading-card,
			.assistant-status-shell,
			.history-auto-load-status {
				border-radius: 4px !important;
			}

			.conn-editor-grid {
				grid-template-columns: minmax(0, 1fr);
			}
		}

		${getPlaygroundThemeStyles()}
	`;
}

let markedBrowserScriptCache: string | undefined;
