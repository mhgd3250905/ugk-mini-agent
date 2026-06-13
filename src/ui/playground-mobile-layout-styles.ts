import { getPlaygroundAssetMobileStyles } from "./playground-assets.js";

export function getPlaygroundMobileLayoutStyles(): string {
	return `@media (max-width: 640px) {
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
		}`;
}

export function getPlaygroundMobileWorkspaceStyles(): string {
	return `@media (max-width: 640px) {
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
				bottom: calc(var(--command-deck-offset, 92px) + 10px + env(safe-area-inset-bottom));
				width: fit-content;
				max-width: calc(100% - 16px);
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
		}`;
}
