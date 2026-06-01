export function getPlaygroundThemeStyles(): string {
	return `
		:root[data-theme="light"] {
			--bg: #e8edf6;
			--bg-panel: #ffffff;
			--bg-panel-2: #f3f6fb;
			--bg-panel-3: #dfe7f2;
			--fg: #142033;
			--muted: #5c687c;
			--line: #c8d2e2;
			--line-strong: #9eabc0;
			--accent: #1f5fc8;
			--accent-soft: rgba(31, 95, 200, 0.1);
			--ok: #08784b;
			--danger: #c52945;
			--warn: #8a5a00;
			--chat-assistant-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(247, 250, 255, 0.92));
			--chat-assistant-border: rgba(31, 95, 200, 0.12);
			--chat-user-bg: linear-gradient(180deg, rgba(236, 253, 245, 0.96), rgba(220, 248, 232, 0.94));
			--chat-user-border: rgba(8, 120, 75, 0.20);
			--chat-user-fg: #153226;
			--chat-code-bg: #eef3fb;
			--chat-code-toolbar-bg: #e1eaf6;
			--chat-table-bg: #f8fbff;
			--chat-composer-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(247, 250, 255, 0.9));
			--chat-composer-focus-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 248, 255, 0.96));
			--chat-floating-bg: rgba(255, 255, 255, 0.94);
			--chat-focus-ring: rgba(31, 95, 200, 0.30);
			color-scheme: light;
		}

		:root[data-theme="light"],
		:root[data-theme="light"] body {
			background: linear-gradient(180deg, #f7f9fd 0%, #eef3f9 48%, #e3eaf4 100%);
			background-size: auto;
			color: var(--fg);
		}

		:root[data-theme="light"] body::before {
			background-image:
				linear-gradient(rgba(24, 69, 119, 0.026) 1px, transparent 1px),
				linear-gradient(90deg, rgba(24, 69, 119, 0.020) 1px, transparent 1px),
				linear-gradient(rgba(24, 69, 119, 0.045) 1px, transparent 1px),
				linear-gradient(90deg, rgba(24, 69, 119, 0.034) 1px, transparent 1px);
			background-size: 40px 40px, 40px 40px, 160px 160px, 160px 160px;
			opacity: 0.58;
		}

		:root[data-theme="light"] body::after {
			background:
				linear-gradient(180deg, rgba(31, 95, 200, 0.045), transparent 180px),
				linear-gradient(90deg, rgba(31, 95, 200, 0.035), transparent 22%, transparent 78%, rgba(8, 120, 75, 0.025));
			opacity: 0.88;
		}

		.theme-toggle-button {
			position: relative;
		}

		.theme-toggle-icon {
			position: absolute;
			top: 10px;
			right: 12px;
			display: inline-flex;
			width: 16px;
			height: 16px;
			color: currentColor;
		}

		.theme-toggle-icon svg {
			width: 16px;
			height: 16px;
			stroke: currentColor;
		}

		:root[data-theme="dark"] .theme-toggle-icon-sun,
		:root[data-theme="light"] .theme-toggle-icon-moon {
			display: none;
		}

		:root[data-theme="light"] .topbar {
			border-bottom-color: transparent;
			background: transparent;
			color: var(--fg);
			box-shadow: none;
		}

		:root[data-theme="light"] .ugk-ascii-logo-topbar {
			color: rgba(33, 45, 70, 0.94);
			text-shadow:
				0.7px 0 rgba(231, 55, 78, 0.64),
				-0.7px 0 rgba(31, 95, 200, 0.62),
				0 0.7px rgba(214, 156, 20, 0.54);
		}

		:root[data-theme="light"] .landing-side-right {
			border-color: rgba(31, 95, 200, 0.12);
			background: #ffffff;
			box-shadow: none;
		}

		:root[data-theme="light"] .desktop-conversation-rail {
			border-left-color: rgba(31, 95, 200, 0.48);
			background:
				linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(238, 244, 252, 0.9)),
				#ffffff;
			color: var(--fg);
			box-shadow: none;
		}

		:root[data-theme="light"] .desktop-conversation-rail-head {
			border-bottom-color: rgba(31, 95, 200, 0.1);
		}

		:root[data-theme="light"] .desktop-conversation-list .mobile-conversation-item {
			background: transparent;
			color: #24324a;
		}

		:root[data-theme="light"] .desktop-conversation-list .mobile-conversation-item:hover:not(:disabled),
		:root[data-theme="light"] .desktop-conversation-list .mobile-conversation-item:focus-visible {
			background: rgba(31, 95, 200, 0.045);
			color: #172033;
		}

		:root[data-theme="light"] .desktop-conversation-list .mobile-conversation-item.is-active {
			border-color: transparent;
			background: rgba(31, 95, 200, 0.075);
		}

		:root[data-theme="light"] .desktop-conversation-list .mobile-conversation-item.is-active::before {
			background: #1f5fc8;
		}

		:root[data-theme="light"] .desktop-conversation-list .conversation-item-shell[class*="conversation-bg-"] .mobile-conversation-item {
			background: transparent;
		}

		:root[data-theme="light"] .desktop-conversation-list .conversation-item-shell[class*="conversation-bg-"] .mobile-conversation-item:hover:not(:disabled),
		:root[data-theme="light"] .desktop-conversation-list .conversation-item-shell[class*="conversation-bg-"] .mobile-conversation-item:focus-visible {
			background: rgba(31, 95, 200, 0.045);
		}

		:root[data-theme="light"] .desktop-conversation-list .conversation-item-shell[class*="conversation-bg-"] .mobile-conversation-item.is-active {
			background: rgba(31, 95, 200, 0.075);
		}

		:root[data-theme="light"] .desktop-conversation-list .mobile-conversation-title,
		:root[data-theme="light"] .desktop-conversation-list .conversation-item-shell[class*="conversation-bg-"] .mobile-conversation-title {
			color: rgba(23, 32, 51, 0.82);
		}

		:root[data-theme="light"] .desktop-conversation-list .mobile-conversation-meta,
		:root[data-theme="light"] .desktop-conversation-list .conversation-item-shell[class*="conversation-bg-"] .mobile-conversation-meta span {
			color: rgba(75, 86, 110, 0.46);
		}

		:root[data-theme="light"] .desktop-conversation-list .mobile-conversation-item.is-active .mobile-conversation-title {
			color: #172033;
		}

		:root[data-theme="light"] .desktop-rail-settings-menu {
			border-color: rgba(31, 95, 200, 0.12);
			background:
				linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(238, 244, 252, 0.96)),
				#ffffff;
			color: var(--fg);
			box-shadow: none;
		}

		:root[data-theme="light"] .desktop-rail-settings {
			border-top-color: rgba(31, 95, 200, 0.1);
		}

		:root[data-theme="light"] .desktop-rail-settings-trigger {
			border-color: rgba(31, 95, 200, 0.12);
			background: rgba(255, 255, 255, 0.82);
			color: #34435f;
		}

		:root[data-theme="light"] .runtime-summary {
			border-top-color: rgba(31, 95, 200, 0.10);
		}

		:root[data-theme="light"] .runtime-summary-label {
			color: rgba(39, 55, 83, 0.58);
		}

		:root[data-theme="light"] .runtime-summary-item strong {
			color: #17243a;
		}

		:root[data-theme="light"] .chat-stage {
			border-color: transparent;
			background: transparent;
			box-shadow: none;
		}

		:root[data-theme="light"] .chat-stage-watermark {
			opacity: 0.08;
		}

		:root[data-theme="light"] .ugk-ascii-logo-watermark {
			color: rgba(51, 112, 196, 0.14);
			text-shadow:
				1px 0 rgba(31, 95, 200, 0.05),
				-1px 0 rgba(212, 54, 88, 0.04),
				0 1px rgba(214, 156, 20, 0.04);
		}

		:root[data-theme="light"] .command-deck {
			background: transparent;
			box-shadow: none;
		}

		:root[data-theme="light"] .shell[data-stage-mode="landing"] .composer {
			border-color: transparent;
			background: transparent;
			box-shadow: none;
		}

		:root[data-theme="light"] .shell:not([data-home="true"]) {
			background-image: none;
		}

		:root[data-theme="light"] .shell,
		:root[data-theme="light"] .stream-layout,
		:root[data-theme="light"] .transcript-pane,
		:root[data-theme="light"] .transcript-current,
		:root[data-theme="light"] .transcript-archive {
			background: transparent;
			color: var(--fg);
		}

		:root[data-theme="light"] .landing-screen,
		:root[data-theme="light"] .chat-stage,
		:root[data-theme="light"] .stream-layout,
		:root[data-theme="light"] .transcript-pane {
			color: var(--fg);
		}

		:root[data-theme="light"] .mobile-topbar {
			border-bottom-color: transparent;
			background: transparent;
			color: var(--fg);
			box-shadow: none;
		}

		:root[data-theme="light"] .mobile-brand {
			background: transparent;
			color: #142033;
			box-shadow: none;
		}

		:root[data-theme="light"] .telemetry-card,
		:root[data-theme="light"] .telemetry-action,
		:root[data-theme="light"] .command-deck,
		:root[data-theme="light"] .composer,
		:root[data-theme="light"] .selected-assets,
		:root[data-theme="light"] .drop-zone-top {
			border-color: transparent;
			background: transparent;
			color: var(--fg);
			box-shadow: none;
		}

		:root[data-theme="light"] .telemetry-action[data-tooltip-title]::after {
			border-color: rgba(31, 95, 200, 0.12);
			background:
				linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(238, 244, 252, 0.96)),
				#ffffff;
			color: #34435f;
			box-shadow: none;
		}

		:root[data-theme="light"] #composer-drop-target.composer {
			border-color: rgba(31, 95, 200, 0.10);
			background: var(--chat-composer-bg);
			color: var(--fg);
			box-shadow: none;
		}

		:root[data-theme="light"] #composer-drop-target.composer:focus-within {
			border-color: var(--chat-focus-ring);
			background: var(--chat-composer-focus-bg);
			outline-color: rgba(31, 95, 200, 0.16);
			box-shadow: none;
		}

		:root[data-theme="light"] .file-strip {
			border-color: transparent;
			background: transparent;
			box-shadow: none;
		}

		:root[data-theme="light"] .telemetry-card span,
		:root[data-theme="light"] .status-row span,
		:root[data-theme="light"] .message-meta,
		:root[data-theme="light"] .assistant-status-summary,
		:root[data-theme="light"] .mobile-conversation-meta {
			color: rgba(75, 86, 110, 0.76);
		}

		:root[data-theme="light"] .telemetry-card strong,
		:root[data-theme="light"] .mobile-drawer-title strong,
		:root[data-theme="light"] .mobile-conversation-title {
			color: #172033;
		}

		:root[data-theme="light"] .topbar-kicker,
		:root[data-theme="light"] .archived-conversation-head,
		:root[data-theme="light"] .archived-conversation-head strong,
		:root[data-theme="light"] .message-role,
		:root[data-theme="light"] .message.assistant .message-meta strong {
			border-color: rgba(31, 95, 200, 0.14);
			background: rgba(255, 255, 255, 0.72);
			color: #4d5a70;
		}

		:root[data-theme="light"] .message.user .message-meta strong {
			border-color: var(--chat-user-border);
			background: rgba(232, 246, 239, 0.78);
			color: #35644e;
		}

		:root[data-theme="light"] button,
		:root[data-theme="light"] .mobile-topbar-button,
		:root[data-theme="light"] .mobile-drawer-close,
		:root[data-theme="light"] .error-banner-close,
		:root[data-theme="light"] .chat-run-log-close,
		:root[data-theme="light"] .context-usage-dialog-close,
		:root[data-theme="light"] .conn-run-details-close {
			border-color: rgba(36, 84, 214, 0.13);
			background: rgba(255, 255, 255, 0.74);
			color: #24324a;
			box-shadow: none;
		}

		:root[data-theme="light"] button:hover:not(:disabled),
		:root[data-theme="light"] button:focus-visible {
			border-color: rgba(36, 84, 214, 0.28);
			background: #ffffff;
			color: #123fb7;
			box-shadow: none;
		}

		:root[data-theme="light"] #send-button {
			border-color: transparent;
			background: #22c55e;
			color: transparent;
			box-shadow: none;
		}

		:root[data-theme="light"] #interrupt-button {
			border-color: transparent;
			background: #ef4444;
			color: transparent;
		}

		:root[data-theme="light"] #send-button::before {
			background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M8 13V4' stroke='rgba(255,255,255,0.96)' stroke-width='1.6' stroke-linecap='round'/%3E%3Cpath d='M4.75 7.25L8 4L11.25 7.25' stroke='rgba(255,255,255,0.96)' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
		}

		:root[data-theme="light"] #interrupt-button::before {
			background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Crect x='4' y='4' width='8' height='8' rx='1.2' fill='rgba(255,255,255,0.96)'/%3E%3C/svg%3E");
		}

		:root[data-theme="light"] .composer-file-action {
			color: #5d6b82;
		}

		:root[data-theme="light"] .composer-file-action:hover:not(:disabled),
		:root[data-theme="light"] .composer-file-action:focus-visible {
			background: rgba(31, 95, 200, 0.08);
			color: #1f5fc8;
			outline-color: rgba(31, 95, 200, 0.28);
		}

		:root[data-theme="light"] #send-button:disabled,
		:root[data-theme="light"] #interrupt-button:disabled,
		:root[data-theme="light"] .composer button:disabled {
			border-color: rgba(158, 171, 192, 0.16);
			background: #edf3fb;
			color: #8d9ab0;
			opacity: 1;
			box-shadow: none;
		}

		:root[data-theme="light"] #send-button:disabled::before {
			background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M8 13V4' stroke='rgba(255,255,255,0.72)' stroke-width='1.6' stroke-linecap='round'/%3E%3Cpath d='M4.75 7.25L8 4L11.25 7.25' stroke='rgba(255,255,255,0.72)' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
		}

		:root[data-theme="light"] #interrupt-button:disabled::before {
			background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Crect x='4' y='4' width='8' height='8' rx='1.2' fill='rgba(255,255,255,0.72)'/%3E%3C/svg%3E");
		}

		:root[data-theme="light"] input,
		:root[data-theme="light"] select,
		:root[data-theme="light"] textarea,
		:root[data-theme="light"] #message,
		:root[data-theme="light"] .composer-input,
		:root[data-theme="light"] .conn-editor-field input,
		:root[data-theme="light"] .conn-editor-field select,
		:root[data-theme="light"] .conn-editor-field textarea,
		:root[data-theme="light"] .asset-modal-search input {
			border-color: transparent;
			background: rgba(255, 255, 255, 0.92);
			color: var(--fg);
			box-shadow: none;
		}

		:root[data-theme="light"] #message {
			background: rgba(255, 255, 255, 0.92);
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] input::placeholder,
		:root[data-theme="light"] textarea::placeholder,
		:root[data-theme="light"] #message::placeholder {
			color: rgba(102, 112, 133, 0.72);
		}

		:root[data-theme="light"] .message.assistant .message-body,
		:root[data-theme="light"] :is(.task-inbox-result-bubble) {
			background: var(--chat-assistant-bg);
			border: 1px solid var(--chat-assistant-border);
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] .message.user .message-body {
			position: relative;
			overflow: hidden;
			border: 1px solid var(--chat-user-border);
			background: var(--chat-user-bg);
			color: var(--chat-user-fg);
			box-shadow: none;
		}

		:root[data-theme="light"] .message.user .message-content {
			color: var(--chat-user-fg);
		}

		:root[data-theme="light"] .message.user .message-content a {
			color: #08784b;
			text-decoration-color: rgba(8, 120, 75, 0.46);
		}

		:root[data-theme="light"] .message.user .message-copy-button,
		:root[data-theme="light"] .message.user .message-image-export-button {
			color: rgba(21, 50, 38, 0.42);
		}

		:root[data-theme="light"] .message.user .message-copy-button:hover:not(:disabled),
		:root[data-theme="light"] .message.user .message-copy-button:focus-visible,
		:root[data-theme="light"] .message.user .message-image-export-button:hover:not(:disabled),
		:root[data-theme="light"] .message.user .message-image-export-button:focus-visible {
			color: rgba(21, 50, 38, 0.78);
		}

		:root[data-theme="light"] #send-button {
			background: #22c55e;
		}

		:root[data-theme="light"] #interrupt-button {
			background: #ef4444;
		}

		:root[data-theme="light"] #send-button:hover:not(:disabled),
		:root[data-theme="light"] #send-button:focus-visible {
			background: #16a34a;
		}

		:root[data-theme="light"] #interrupt-button:hover:not(:disabled),
		:root[data-theme="light"] #interrupt-button:focus-visible {
			background: #dc2626;
		}

		:root[data-theme="light"] #interrupt-button:disabled {
			opacity: 0.5;
			background: #ef4444;
		}

		:root[data-theme="light"] .message.assistant .message-content,
		:root[data-theme="light"] .message.assistant .message-content .code-block-language,
		:root[data-theme="light"] .message-content,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content {
			color: #1f2937;
		}

		:root[data-theme="light"] .message.assistant .message-content h1,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content h1,
		:root[data-theme="light"] .conn-run-result-bubble .message-content h1 {
			color: #142033;
		}

		:root[data-theme="light"] .message.assistant .message-content h2,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content h2,
		:root[data-theme="light"] .conn-run-result-bubble .message-content h2 {
			color: #1d4f9a;
		}

		:root[data-theme="light"] .message.assistant .message-content h3,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content h3,
		:root[data-theme="light"] .conn-run-result-bubble .message-content h3 {
			color: #0f766e;
		}

		:root[data-theme="light"] .message.assistant .message-content h4,
		:root[data-theme="light"] .message.assistant .message-content h5,
		:root[data-theme="light"] .message.assistant .message-content h6,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content h4,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content h5,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content h6,
		:root[data-theme="light"] .conn-run-result-bubble .message-content h4,
		:root[data-theme="light"] .conn-run-result-bubble .message-content h5,
		:root[data-theme="light"] .conn-run-result-bubble .message-content h6,
		:root[data-theme="light"] .message.assistant .message-content strong,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content strong,
		:root[data-theme="light"] .conn-run-result-bubble .message-content strong {
			color: #8a5a00;
		}

		:root[data-theme="light"] .message-content a {
			color: #1b58d8;
		}

		:root[data-theme="light"] .message-content blockquote,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content blockquote,
		:root[data-theme="light"] .conn-run-result-bubble .message-content blockquote {
			border-left-color: rgba(31, 95, 200, 0.34);
			background: #eaf2ff;
			color: #2d405e;
		}

		:root[data-theme="light"] .message-content .markdown-table-scroll,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content .markdown-table-scroll,
		:root[data-theme="light"] .conn-run-result-bubble .message-content .markdown-table-scroll {
			border-color: transparent;
			background: var(--chat-table-bg);
		}

		:root[data-theme="light"] .message-content th,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content th,
		:root[data-theme="light"] .conn-run-result-bubble .message-content th {
			border-right-color: #c8d6ea;
			border-bottom-color: #c8d6ea;
			background: #dce8f8;
			color: #1d365c;
		}

		:root[data-theme="light"] .message-content td,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content td,
		:root[data-theme="light"] .conn-run-result-bubble .message-content td {
			border-right-color: #d7e1ee;
			border-bottom-color: #d7e1ee;
			color: #26344f;
		}

		:root[data-theme="light"] .message-content code,
		:root[data-theme="light"] .message-content pre,
		:root[data-theme="light"] .message-content .code-block,
		:root[data-theme="light"] .message.assistant .message-content pre,
		:root[data-theme="light"] .message.assistant .message-content .code-block,
		:root[data-theme="light"] .message.assistant .message-content .code-block pre,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content code,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content pre,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content .code-block,
		:root[data-theme="light"] .conn-run-result-bubble .message-content code,
		:root[data-theme="light"] .conn-run-result-bubble .message-content pre,
		:root[data-theme="light"] .conn-run-result-bubble .message-content .code-block {
			background: var(--chat-code-bg);
			color: #152238;
		}

		:root[data-theme="light"] .message-content .code-block-header,
		:root[data-theme="light"] .message-content .code-block-toolbar,
		:root[data-theme="light"] .message-content .code-block-language,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content .code-block-toolbar,
		:root[data-theme="light"] .task-inbox-result-bubble .message-content .code-block-language,
		:root[data-theme="light"] .conn-run-result-bubble .message-content .code-block-toolbar,
		:root[data-theme="light"] .conn-run-result-bubble .message-content .code-block-language {
			background: transparent;
			color: #4d5a70;
		}

		:root[data-theme="light"] .copy-code-button,
		:root[data-theme="light"] .conn-run-result-bubble .copy-code-button {
			border-color: transparent;
			background: transparent;
			color: #365174;
		}

		:root[data-theme="light"] .message-copy-button,
		:root[data-theme="light"] .message-image-export-button {
			color: rgba(75, 86, 110, 0.68);
			background: transparent;
			box-shadow: none;
		}

		:root[data-theme="light"] .message-copy-button:hover:not(:disabled),
		:root[data-theme="light"] .message-copy-button:focus-visible,
		:root[data-theme="light"] .message-image-export-button:hover:not(:disabled),
		:root[data-theme="light"] .message-image-export-button:focus-visible {
			background: transparent;
			color: rgba(23, 32, 51, 0.9);
			box-shadow: none;
		}

		:root[data-theme="light"] .message-context-menu {
			border-color: rgba(15, 23, 42, 0.1);
			background: rgba(255, 255, 255, 0.98);
			box-shadow: none;
		}

		:root[data-theme="light"] .message-context-menu button {
			color: #172033;
		}

		:root[data-theme="light"] .message-context-menu button:hover,
		:root[data-theme="light"] .message-context-menu button:focus-visible {
			background: rgba(34, 197, 94, 0.12);
			color: #0f172a;
		}

		:root[data-theme="light"] .message-context-toast {
			background: rgba(255, 255, 255, 0.96);
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] .message-export-frame {
			background:
				linear-gradient(180deg, #ffffff 0%, #f2f5fa 100%),
				#ffffff;
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] .message-export-frame > .message-body {
			background: #ffffff;
		}

		:root[data-theme="light"] .export-signature {
			color: rgba(75, 86, 110, 0.76);
		}

		:root[data-theme="light"] .assistant-loading-bubble,
		:root[data-theme="light"] .assistant-loading-card,
		:root[data-theme="light"] .assistant-status-shell,
		:root[data-theme="light"] .history-auto-load-status,
		:root[data-theme="light"] .scroll-to-bottom-button {
			border-color: transparent;
			background: rgba(255, 255, 255, 0.86);
			color: #26344f;
			box-shadow: none;
		}

		:root[data-theme="light"] .assistant-run-log-trigger.ok {
			border-color: rgba(8, 120, 75, 0.2);
			background: #e7f6ef;
			color: #08784b;
		}

		:root[data-theme="light"] .assistant-run-log-trigger.ok .assistant-run-log-hint,
		:root[data-theme="light"] .assistant-loading-bubble.ok .assistant-run-log-hint {
			color: #08784b;
		}

		:root[data-theme="light"] .assistant-status-shell {
			border-color: transparent;
			background: transparent;
			color: #26344f;
			box-shadow: none;
		}

		:root[data-theme="light"] .assistant-status-summary {
			background: transparent;
			color: rgba(75, 86, 110, 0.76);
		}

		:root[data-theme="light"] .scroll-to-bottom-button {
			border-color: rgba(8, 120, 75, 0.24);
			background: var(--chat-floating-bg);
			color: #08784b;
			box-shadow: none;
		}

		:root[data-theme="light"] :is(.context-usage-shell),
		:root[data-theme="light"] :is(.context-usage-dialog-panel),
		:root[data-theme="light"] :is(.chat-run-log-panel),
		:root[data-theme="light"] :is(.confirm-dialog-panel),
		:root[data-theme="light"] :is(.conn-run-details-panel) {
			border-color: transparent;
			background:
				linear-gradient(180deg, #ffffff 0%, #f1f5fb 100%),
				#ffffff;
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] :is(.context-usage-dialog-head),
		:root[data-theme="light"] :is(.chat-run-log-head),
		:root[data-theme="light"] :is(.confirm-dialog-head),
		:root[data-theme="light"] :is(.conn-run-details-head),
		:root[data-theme="light"] :is(.asset-modal-head),
		:root[data-theme="light"] :is(.task-inbox-head) {
			background: rgba(255, 255, 255, 0.96);
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] .asset-modal-copy span {
			color: #667085;
		}

		:root[data-theme="light"] .context-usage-metric,
		:root[data-theme="light"] .context-usage-model,
		:root[data-theme="light"] .context-usage-dialog-hero,
		:root[data-theme="light"] .context-usage-dialog-metric,
		:root[data-theme="light"] .context-usage-dialog-model,
		:root[data-theme="light"] .chat-run-log-item,
		:root[data-theme="light"] .confirm-dialog-body,
		:root[data-theme="light"] .conn-run-section {
			background: #f3f6fb;
			color: #24324a;
			box-shadow: none;
		}

		:root[data-theme="light"] .context-usage-dialog-hero {
			background:
				linear-gradient(180deg, #ffffff 0%, #eaf1fb 100%),
				#ffffff;
			box-shadow: none;
		}

		:root[data-theme="light"] .context-usage-dialog-head strong,
		:root[data-theme="light"] .context-usage-dialog-kicker,
		:root[data-theme="light"] .context-usage-dialog-hero p,
		:root[data-theme="light"] .context-usage-dialog-metric span,
		:root[data-theme="light"] .context-usage-dialog-metric em,
		:root[data-theme="light"] .context-usage-dialog-model span {
			color: #596579;
		}

		:root[data-theme="light"] .context-usage-dialog-main strong,
		:root[data-theme="light"] .context-usage-dialog-metric strong {
			color: #142033;
		}

		:root[data-theme="light"] .context-usage-dialog {
			background: rgba(232, 238, 248, 0.72);
		}

		:root[data-theme="light"] .context-usage-dialog-meter {
			background: #dce6f4;
			box-shadow: none;
		}

		:root[data-theme="light"] .context-usage-dialog-meter span {
			background: linear-gradient(90deg, #08784b, #1f5fc8);
			box-shadow: none;
		}

		:root[data-theme="light"] .context-usage-dialog-main span {
			background: #e8f0ff;
			color: #1d4f9a;
		}

		:root[data-theme="light"] .context-usage-dialog-model span {
			background: transparent;
		}

		:root[data-theme="light"] .context-usage-meta {
			background:
				linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(238, 244, 252, 0.98)),
				#ffffff;
			color: #24324a;
			box-shadow: none;
		}

		:root[data-theme="light"] .context-usage-meta-kicker,
		:root[data-theme="light"] .context-usage-meta-main em,
		:root[data-theme="light"] .context-usage-meta-item span,
		:root[data-theme="light"] .context-usage-meta-model span {
			color: #667085;
		}

		:root[data-theme="light"] .context-usage-meta-main strong,
		:root[data-theme="light"] .context-usage-meta-item strong {
			color: #142033;
		}

		:root[data-theme="light"] .context-usage-meta-status {
			background: #e7f6ef;
			color: #08784b;
		}

		:root[data-theme="light"] .context-usage-meta-item,
		:root[data-theme="light"] .context-usage-meta-model span {
			background: rgba(232, 240, 255, 0.72);
		}

		:root[data-theme="light"] .context-usage-dialog[data-status="caution"] .context-usage-dialog-main span {
			background: #fff4dc;
			color: #8a5a00;
		}

		:root[data-theme="light"] .context-usage-shell[data-status="caution"] .context-usage-meta-status {
			background: #fff4dc;
			color: #8a5a00;
		}

		:root[data-theme="light"] .context-usage-dialog[data-status="warning"] .context-usage-dialog-main span {
			background: #fff0e6;
			color: #9a4b12;
		}

		:root[data-theme="light"] .context-usage-shell[data-status="warning"] .context-usage-meta-status {
			background: #fff0e6;
			color: #9a4b12;
		}

		:root[data-theme="light"] .context-usage-dialog[data-status="danger"] .context-usage-dialog-main span {
			background: #fff0f3;
			color: #9d2439;
		}

		:root[data-theme="light"] .context-usage-shell[data-status="danger"] .context-usage-meta-status {
			background: #fff0f3;
			color: #9d2439;
		}

			:root[data-theme="light"] .agent-switcher-meta {
				background: rgba(255, 255, 255, 0.97);
				color: #1f2937;
			}

			:root[data-theme="light"] .agent-switcher-item:hover:not(:disabled),
			:root[data-theme="light"] .agent-switcher-item:focus-visible {
				background: rgba(0, 102, 255, 0.06);
			}

			:root[data-theme="light"] .agent-switcher-item.is-current {
				background: rgba(0, 102, 255, 0.05);
			}

			:root[data-theme="light"] .agent-switcher-item-name {
				color: #111827;
			}

			:root[data-theme="light"] .agent-switcher-item.is-current .agent-switcher-item-name {
				color: #0052cc;
			}

			:root[data-theme="light"] .agent-switcher-item-id {
				color: #6b7280;
			}

			:root[data-theme="light"] .agent-switcher-item-status {
				background: rgba(0, 102, 255, 0.08);
				color: #0052cc;
			}



		:root[data-theme="light"] .chat-run-log-item code,
		:root[data-theme="light"] .context-usage-model code,
		:root[data-theme="light"] .context-usage-dialog-model code,
		:root[data-theme="light"] .conn-run-meta code,
		:root[data-theme="light"] .conn-manager-meta code,
		:root[data-theme="light"] .task-inbox-source,
		:root[data-theme="light"] .task-inbox-time,
		:root[data-theme="light"] .task-inbox-meta,
		:root[data-theme="light"] .task-inbox-item-meta,
		:root[data-theme="light"] .task-inbox-item-meta span,
		:root[data-theme="light"] .task-inbox-item-meta code,
		:root[data-theme="light"] .asset-pill span,
		:root[data-theme="light"] .asset-pill small,
		:root[data-theme="light"] .asset-meta,
		:root[data-theme="light"] .file-chip span,
		:root[data-theme="light"] .file-chip-label,
		:root[data-theme="light"] .conn-run-event span,
		:root[data-theme="light"] .conn-manager-meta,
		:root[data-theme="light"] .conn-manager-run-summary,
		:root[data-theme="light"] .conn-manager-run-item,
		:root[data-theme="light"] .conn-manager-filter-field span,
		:root[data-theme="light"] .conn-manager-selected-count,
		:root[data-theme="light"] .conn-editor-field,
		:root[data-theme="light"] .conn-editor-field-hint,
		:root[data-theme="light"] .conn-editor-section-hint,
		:root[data-theme="light"] .conn-editor-target-preview code {
			color: #596579;
		}

		:root[data-theme="light"] .conn-editor-field span,
		:root[data-theme="light"] .conn-editor-advanced summary {
			color: #24324a;
		}

		:root[data-theme="light"] .task-inbox-item-kind {
			background: #e8f0ff;
			color: #1d4f9a;
		}

		:root[data-theme="light"] .task-inbox-item-title-row strong {
			color: #596579;
		}

		:root[data-theme="light"] .asset-modal,
		:root[data-theme="light"] .conn-manager-dialog,
		:root[data-theme="light"] .conn-editor-dialog,
		:root[data-theme="light"] .task-inbox-view {
			color: #172033;
		}

		:root[data-theme="light"] .asset-modal-shell {
			color: #172033;
		}

		:root[data-theme="light"] .asset-modal-panel,
		:root[data-theme="light"] .task-inbox-pane,
		:root[data-theme="light"] .conn-manager-panel,
		:root[data-theme="light"] .conn-editor-panel {
			border-color: transparent;
			background:
				linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(247, 250, 253, 0.98) 100%),
				#ffffff;
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] .conn-manager-panel > .asset-modal-body {
			background: #f1f5fa;
		}

		:root[data-theme="light"] .task-inbox-list {
			padding: 12px 14px 16px;
			background: #f1f5fa;
			box-shadow: none;
		}

		:root[data-theme="light"] .task-inbox-item-shell {
			border: 1px solid #dfe7f2;
			background: #ffffff;
			box-shadow: none;
		}

		:root[data-theme="light"] .task-inbox-item-shell:hover {
			border-color: #cbd8ea;
			background: #f8fbff;
		}

		:root[data-theme="light"] .task-inbox-item.is-unread .task-inbox-item-shell {
			border-color: #ffd6dd;
			background: #fff5f6;
		}

		:root[data-theme="light"] .task-inbox-item.is-unread .task-inbox-item-shell:hover {
			border-color: #ffc4ce;
			background: #fff0f2;
		}

		:root[data-theme="light"] .task-inbox-item.is-unread .task-inbox-item-shell::before {
			background: #ff1744;
		}

		:root[data-theme="light"] .task-inbox-item-head strong {
			color: #172033;
		}

		:root[data-theme="light"] .task-inbox-item-time {
			color: #172033;
		}

		:root[data-theme="light"] .task-inbox-item:not(.is-unread) .task-inbox-item-head strong {
			color: #4a5568;
		}

		:root[data-theme="light"] .task-inbox-item:not(.is-unread) .task-inbox-item-time {
			color: #4a5568;
		}

		:root[data-theme="light"] .task-inbox-item-kind {
			background: rgba(0, 0, 0, 0.04);
			color: #667085;
		}

		

		:root[data-theme="light"] .task-inbox-item-text {
			color: #2d3848;
		}

		:root[data-theme="light"] .task-inbox-item:not(.is-unread) .task-inbox-item-text {
			color: #667085;
		}

		:root[data-theme="light"] .task-inbox-item-meta > span {
			background: rgba(0, 0, 0, 0.04);
			color: #667085;
		}

		:root[data-theme="light"] .task-inbox-item-meta > span:last-child {
			background: rgba(40, 162, 98, 0.08);
			color: #1f6e42;
		}

		:root[data-theme="light"] .task-inbox-item-actions button {
			color: #8a94a6;
		}

		:root[data-theme="light"] .task-inbox-item-actions button:hover:not(:disabled) {
			background: rgba(0, 0, 0, 0.04);
			color: #333a47;
		}

:root[data-theme="light"] .task-inbox-item,
		:root[data-theme="light"] .conn-editor-form {
			border-color: transparent;
			background: transparent;
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] .conn-manager-list {
			padding: 12px 14px 16px;
			background: transparent;
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] :is(.asset-pill),
		:root[data-theme="light"] :is(.file-download),
		:root[data-theme="light"] :is(.asset-empty),
		:root[data-theme="light"] :is(.file-chip) {
			border-color: transparent;
			background: rgba(255, 255, 255, 0.92);
			color: #24324a;
			box-shadow: none;
		}

		:root[data-theme="light"] :is(.asset-pill) {
			background:
				linear-gradient(90deg, rgba(31, 95, 200, 0.035), transparent 46%),
				rgba(255, 255, 255, 0.92);
		}

		:root[data-theme="light"] :is(.conn-manager-item) {
			border-color: #dfe7f2;
			background: #ffffff;
			color: #24324a;
			box-shadow: none;
		}

		:root[data-theme="light"] :is(.conn-manager-item):hover {
			border-color: #cbd8ea;
			background: #f8fbff;
		}

		:root[data-theme="light"] :is(.conn-manager-run-item) {
			border-color: #e2e8f0;
			background: #f8fbff;
			color: #24324a;
			box-shadow: none;
		}

		:root[data-theme="light"] :is(.conn-manager-toolbar, .conn-editor-field, .conn-editor-advanced) {
			border-color: #dfe7f2;
			background: #f8fbff;
			color: #596579;
			box-shadow: none;
		}

		:root[data-theme="light"] .conn-manager-filter-field select,
		:root[data-theme="light"] .conn-editor-field input,
		:root[data-theme="light"] .conn-editor-field select,
		:root[data-theme="light"] .conn-editor-field textarea {
			border-color: transparent;
			background: #ffffff;
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] .conn-editor-time-input + .flatpickr-input {
			border-color: transparent;
			background: #ffffff;
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] .conn-editor-time-input + .flatpickr-input::placeholder {
			color: #8a95a8;
		}

		:root[data-theme="light"] .conn-editor-field input:focus,
		:root[data-theme="light"] .conn-editor-field select:focus,
		:root[data-theme="light"] .conn-editor-field textarea:focus {
			outline: 1px solid rgba(31, 95, 200, 0.38);
			outline-offset: 2px;
			box-shadow: none;
		}

		:root[data-theme="light"] .conn-editor-current-target,
		:root[data-theme="light"] .conn-editor-target-preview {
			border-color: transparent;
			background: rgba(232, 240, 255, 0.72);
			color: #40516d;
			box-shadow: none;
		}

		:root[data-theme="light"] .conn-editor-target-preview {
			background: rgba(232, 240, 255, 0.72);
		}

		:root[data-theme="light"] .conn-editor-target-preview strong {
			color: #172033;
		}

		:root[data-theme="light"] .conn-editor-target-note {
			color: #8a5a00;
		}

		:root[data-theme="light"] .conn-editor-form .asset-modal-actions button:first-child {
			border-color: transparent;
			background: #1f5fc8;
			color: #ffffff;
			box-shadow: none;
		}

		:root[data-theme="light"] :is(.asset-pill.active) {
			background:
				linear-gradient(90deg, rgba(34, 168, 106, 0.11), transparent 48%),
				#e8f6ef;
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] .asset-pill strong,
		:root[data-theme="light"] .file-chip strong {
			color: #172033;
		}

		:root[data-theme="light"] .asset-pill-meta {
			color: #5b6b84;
		}

		:root[data-theme="light"] .asset-pill-type {
			--asset-type-border: rgba(31, 95, 200, 0.12);
			--asset-type-bg: #f4f7fb;
			--asset-type-main: #315586;
			--asset-type-sub: #7a879b;
		}

		:root[data-theme="light"] .asset-pill-type--archive {
			--asset-type-border: rgba(34, 168, 106, 0.24);
			--asset-type-bg: #edf8f0;
			--asset-type-main: #147647;
			--asset-type-sub: #4f9270;
		}

		:root[data-theme="light"] .asset-pill-type--code {
			--asset-type-border: rgba(31, 95, 200, 0.24);
			--asset-type-bg: #eef5ff;
			--asset-type-main: #1b5fa7;
			--asset-type-sub: #5f7ea8;
		}

		:root[data-theme="light"] .asset-pill-type--web {
			--asset-type-border: rgba(196, 120, 32, 0.24);
			--asset-type-bg: #fff4df;
			--asset-type-main: #96540c;
			--asset-type-sub: #9b7650;
		}

		:root[data-theme="light"] .asset-pill-type--data {
			--asset-type-border: rgba(93, 73, 196, 0.22);
			--asset-type-bg: #f3f1ff;
			--asset-type-main: #5543a8;
			--asset-type-sub: #7b729b;
		}

		:root[data-theme="light"] .asset-pill-type--image {
			--asset-type-border: rgba(199, 55, 112, 0.22);
			--asset-type-bg: #fff0f5;
			--asset-type-main: #a62b5f;
			--asset-type-sub: #a36c82;
		}

		:root[data-theme="light"] .asset-pill-type--document {
			--asset-type-border: rgba(89, 101, 121, 0.18);
			--asset-type-bg: #f6f8fb;
			--asset-type-main: #40516d;
			--asset-type-sub: #7a879b;
		}

		:root[data-theme="light"] .asset-pill-type--binary {
			--asset-type-border: rgba(25, 132, 116, 0.2);
			--asset-type-bg: #edf8f7;
			--asset-type-main: #14746a;
			--asset-type-sub: #5b8d86;
		}

		:root[data-theme="light"] .asset-date-group-header strong {
			color: #172033;
		}

		:root[data-theme="light"] .asset-date-group-header span {
			color: #6b7688;
		}

		:root[data-theme="light"] .asset-date-group-header::after {
			background: linear-gradient(90deg, rgba(31, 95, 200, 0.18), rgba(34, 168, 106, 0.14), transparent);
		}

		:root[data-theme="light"] .asset-pill-download-button {
			border-color: rgba(31, 95, 200, 0.12);
			background: rgba(34, 168, 106, 0.08);
			color: #147647;
		}

		:root[data-theme="light"] .asset-pill-download-button:hover,
		:root[data-theme="light"] .asset-pill-download-button:focus-visible {
			border-color: rgba(31, 95, 200, 0.24);
			background: rgba(31, 95, 200, 0.08);
			color: #1b3f7a;
		}

		:root[data-theme="light"] .chat-stage > .workspace-contained .asset-pill {
			border-color: rgba(31, 95, 200, 0.08);
			background:
				linear-gradient(90deg, rgba(31, 95, 200, 0.035), transparent 46%),
				#ffffff;
		}

		:root[data-theme="light"] .chat-stage > .workspace-contained .asset-pill strong {
			color: #0b1a36;
		}

		:root[data-theme="light"] .chat-stage > .workspace-contained .asset-pill-meta {
			color: #5b6b84;
		}

		:root[data-theme="light"] .chat-stage > .workspace-contained .asset-pill-type {
			border-color: var(--asset-type-border);
			background: var(--asset-type-bg);
			color: var(--asset-type-main);
		}

		:root[data-theme="light"] .chat-stage > .workspace-contained .asset-pill button,
		:root[data-theme="light"] .chat-stage > .workspace-contained .asset-pill-download-button {
			border-color: rgba(31, 95, 200, 0.12);
			background: rgba(31, 95, 200, 0.04);
			color: #3a5f9b;
		}

		:root[data-theme="light"] .chat-stage > .workspace-contained .asset-pill-download-button {
			background: rgba(34, 168, 106, 0.08);
			color: #147647;
		}

		:root[data-theme="light"] .chat-stage > .workspace-contained .asset-pill button:hover:not(:disabled),
		:root[data-theme="light"] .chat-stage > .workspace-contained .asset-pill-download-button:hover,
		:root[data-theme="light"] .chat-stage > .workspace-contained .asset-pill-download-button:focus-visible {
			border-color: rgba(31, 95, 200, 0.24);
			background: rgba(31, 95, 200, 0.08);
			color: #1b3f7a;
		}

		:root[data-theme="light"] .chat-stage > .workspace-contained .asset-pill.active {
			border-color: rgba(34, 168, 106, 0.18);
			background:
				linear-gradient(90deg, rgba(34, 168, 106, 0.12), transparent 48%),
				#eaf8f0;
		}


		:root[data-theme="light"] .file-chip-badge {
			background: transparent;
			color: #1d4f9a;
		}

		:root[data-theme="light"] .file-chip-remove {
			background: transparent;
			color: #9d2439;
		}
			:root[data-theme="light"] .asset-head-count {
				background: rgba(31, 95, 200, 0.08);
				color: #4a7cc9;
			}

		:root[data-theme="light"] .task-inbox-result-bubble,
		:root[data-theme="light"] .conn-run-result-bubble {
			background: #ffffff;
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] .task-inbox-result-bubble > strong,
		:root[data-theme="light"] .conn-run-result-bubble > strong {
			color: #596579;
		}

		:root[data-theme="light"] .conn-manager-item.is-highlighted {
			background: #e8f6ef;
			box-shadow: none;
		}

		:root[data-theme="light"] .conn-manager-title-row strong {
			color: #142033;
		}

		:root[data-theme="light"] .conn-manager-status.active {
			border-color: rgba(8, 120, 75, 0.24);
			background: #e8f6ef;
			color: #08784b;
		}

		:root[data-theme="light"] .conn-manager-status.completed {
			border-color: rgba(100, 116, 139, 0.2);
			background: #f1f5f9;
			color: #64748b;
		}

		:root[data-theme="light"] .conn-manager-status.paused {
			border-color: rgba(138, 90, 0, 0.24);
			background: #fff4dc;
			color: #8a5a00;
		}

		:root[data-theme="light"] .conn-manager-bulk-actions .danger-action,
		:root[data-theme="light"] .task-inbox-read-dot,
		:root[data-theme="light"] .conn-editor-error {
			border-color: rgba(197, 41, 69, 0.22);
			background: #fff0f3;
			color: #9d2439;
		}

		:root[data-theme="light"] .conn-time-picker-calendar {
			background:
				linear-gradient(180deg, #ffffff 0%, #eef3fa 100%),
				#ffffff;
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] .conn-time-picker-calendar::after {
			border-bottom-color: #ffffff;
		}

		:root[data-theme="light"] .conn-time-picker-calendar.arrowBottom::after {
			border-top-color: #eef3fa;
		}

		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-month,
		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-current-month,
		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-monthDropdown-months,
		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-weekday,
		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-day,
		:root[data-theme="light"] .conn-time-picker-calendar .numInput {
			color: #172033;
			fill: #172033;
		}

		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-prev-month,
		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-next-month {
			color: #40516d;
			fill: #40516d;
		}

		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-prev-month:hover,
		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-next-month:hover {
			color: #1f5fc8;
			fill: #1f5fc8;
		}

		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-time {
			border-top-color: rgba(36, 84, 214, 0.12);
		}

		:root[data-theme="light"] .conn-time-picker-calendar input,
		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-am-pm {
			color: #172033;
		}

		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-day.today {
			border-color: rgba(31, 95, 200, 0.38);
		}

		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-day:hover,
		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-day:focus {
			border-color: rgba(31, 95, 200, 0.18);
			background: #e8f0ff;
			color: #1d4f9a;
		}

		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-day.selected,
		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-day.startRange,
		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-day.endRange {
			border-color: #1f5fc8;
			background: #1f5fc8;
			color: #ffffff;
		}

		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-day.flatpickr-disabled,
		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-day.prevMonthDay,
		:root[data-theme="light"] .conn-time-picker-calendar .flatpickr-day.nextMonthDay {
			color: #9aa6b8;
		}

		:root[data-theme="light"] .mobile-overflow-menu,
		:root[data-theme="light"] .mobile-conversation-drawer {
			border-color: transparent;
			background:
				radial-gradient(circle at 22% 12%, rgba(36, 84, 214, 0.1), transparent 34%),
				linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(240, 244, 250, 0.98));
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] .mobile-drawer-head {
			background: transparent;
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] .mobile-drawer-title span {
			color: #596579;
		}

		:root[data-theme="light"] .mobile-overflow-menu-item,
		:root[data-theme="light"] .mobile-conversation-item {
			background: var(--conversation-card-bg, #f4f7fb);
			color: #24324a;
			box-shadow: none;
		}

		:root[data-theme="light"] .mobile-overflow-menu-item:hover:not(:disabled),
		:root[data-theme="light"] .mobile-overflow-menu-item:focus-visible,
		:root[data-theme="light"] .mobile-conversation-item:hover:not(:disabled),
		:root[data-theme="light"] .mobile-conversation-item:focus-visible {
			background: var(--conversation-card-hover-bg, #ffffff);
			color: #123fb7;
			box-shadow: none;
		}

		:root[data-theme="light"] .mobile-conversation-item.is-active {
			border-color: rgba(36, 84, 214, 0.28);
			background: var(--conversation-card-active-bg, #e7eeff);
		}

		:root[data-theme="light"] .mobile-conversation-item.is-active::before {
			background: #2454d6;
			box-shadow: none;
		}

		:root[data-theme="light"] .conversation-item-menu-trigger {
			border-color: transparent;
			background: transparent;
			color: #536078;
		}

		:root[data-theme="light"] .conversation-item-menu-trigger:hover,
		:root[data-theme="light"] .conversation-item-menu-trigger:focus-visible,
		:root[data-theme="light"] .conversation-item-menu-trigger[aria-expanded="true"] {
			background: transparent !important;
			color: #24324a;
		}

		:root[data-theme="light"] .conversation-item-menu,
		:root[data-theme="light"] .conversation-menu-color-group {
			border-color: rgba(36, 84, 214, 0.1);
			background: #ffffff;
			color: #172033;
			box-shadow: none;
		}

		:root[data-theme="light"] .conversation-color-swatch.color-default {
			background: #f4f7fb !important;
		}

		:root[data-theme="light"] .conversation-menu-item {
			color: #24324a;
		}

		:root[data-theme="light"] .conversation-menu-item:hover:not(:disabled),
		:root[data-theme="light"] .conversation-menu-item:focus-visible {
			background: #edf3ff;
		}

		:root[data-theme="light"] .conversation-menu-item.danger {
			color: #c52945;
		}

		:root[data-theme="light"] .conversation-menu-color-group > span {
			color: #647086;
		}

		:root[data-theme="light"] .error-banner {
			background: #fff0f2;
			color: #8f2034;
			box-shadow: none;
		}

		@media (max-width: 640px) {
			:root[data-theme="light"] .shell,
			:root[data-theme="light"] .chat-stage {
				background: transparent;
			}
			:root[data-theme="light"] .task-inbox-head-count {
				background: rgba(197, 41, 69, 0.08);
				color: #b33a4a;
			}

			:root[data-theme="light"] .topbar,
			:root[data-theme="light"] .mobile-topbar,
			:root[data-theme="light"] .topbar-context-slot {
				border-bottom-color: transparent;
				background: transparent;
				box-shadow: none;
			}

			:root[data-theme="light"] .mobile-topbar-button,
			:root[data-theme="light"] .mobile-topbar-button:hover:not(:disabled),
			:root[data-theme="light"] .mobile-topbar-button:focus-visible {
				border-color: transparent;
				background: transparent;
				color: #24324a;
				box-shadow: none;
			}

			:root[data-theme="light"] .topbar-context-slot .context-usage-shell,
			:root[data-theme="light"] .topbar-context-slot .context-usage-shell:hover,
			:root[data-theme="light"] .topbar-context-slot .context-usage-shell:focus-visible,
			:root[data-theme="light"] .topbar-context-slot .context-usage-shell[data-expanded="true"] {
				border-color: transparent;
				background: transparent;
				box-shadow: none;
			}

			:root[data-theme="light"] .message-body {
				background: rgba(255, 255, 255, 0.92);
			}
		}
	`;
}

export function getPlaygroundThemeControllerScript(): string {
	return `
		const PLAYGROUND_THEME_STORAGE_KEY = "ugk-pi:playground-theme";
		const themeToggleButton = document.getElementById("theme-toggle-button");
		const themeToggleLabel = document.getElementById("theme-toggle-label");
		const mobileMenuThemeButton = document.getElementById("mobile-menu-theme-button");
		const mobileThemeToggleLabel = document.getElementById("mobile-theme-toggle-label");

		function normalizePlaygroundTheme(value) {
			return value === "light" ? "light" : "dark";
		}

		function readStoredPlaygroundTheme() {
			try {
				return normalizePlaygroundTheme(localStorage.getItem(PLAYGROUND_THEME_STORAGE_KEY));
			} catch {
				return "dark";
			}
		}

		function updateThemeToggleControls(theme) {
			const isLight = theme === "light";
			const nextLabel = isLight ? "浅色模式" : "深色模式";
			const nextAction = isLight ? "切换深色主题" : "切换浅色主题";
			if (themeToggleButton) {
				themeToggleButton.setAttribute("aria-pressed", isLight ? "true" : "false");
				themeToggleButton.setAttribute("aria-label", nextAction);
				themeToggleButton.title = nextAction;
			}
			if (themeToggleLabel) {
				themeToggleLabel.textContent = nextLabel;
			}
			if (mobileMenuThemeButton) {
				mobileMenuThemeButton.setAttribute("aria-pressed", isLight ? "true" : "false");
				mobileMenuThemeButton.setAttribute("aria-label", nextAction);
				mobileMenuThemeButton.title = nextAction;
			}
			if (mobileThemeToggleLabel) {
				mobileThemeToggleLabel.textContent = nextLabel;
			}
		}

		function applyPlaygroundTheme(nextTheme) {
			const normalized = normalizePlaygroundTheme(nextTheme);
			state.theme = normalized;
			pageRoot.dataset.theme = normalized;
			pageRoot.style.colorScheme = normalized;
			updateThemeToggleControls(normalized);
			try {
				localStorage.setItem(PLAYGROUND_THEME_STORAGE_KEY, normalized);
			} catch {}
			return normalized;
		}

		function togglePlaygroundTheme() {
			const nextTheme = pageRoot.dataset.theme === "light" ? "dark" : "light";
			return applyPlaygroundTheme(nextTheme);
		}

		applyPlaygroundTheme(readStoredPlaygroundTheme());
		if (themeToggleButton) {
			themeToggleButton.addEventListener("click", () => {
				togglePlaygroundTheme();
			});
		}
		if (mobileMenuThemeButton) {
			mobileMenuThemeButton.addEventListener("click", () => {
				togglePlaygroundTheme();
				closeMobileOverflowMenu();
			});
		}
	`;
}
