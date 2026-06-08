export function getOpsWorkbenchThemeCss(): string {
	return `
		:root, [data-theme="dark"] {
			--ops-bg: #081019;
			--ops-surface: #0f1722;
			--ops-surface-2: #141d2a;
			--ops-surface-3: #192435;
			--ops-border: #243246;
			--ops-border-strong: #34465f;
			--ops-fg: #f5f8fc;
			--ops-fg-2: #bfcbda;
			--ops-muted: #8290a3;
			--ops-primary: #2f7dd3;
			--ops-primary-hover: #3f8ee3;
			--ops-primary-soft: rgba(47, 125, 211, 0.16);
			--ops-green: #20b26b;
			--ops-green-soft: rgba(32, 178, 107, 0.15);
			--ops-amber: #d99a20;
			--ops-amber-soft: rgba(217, 154, 32, 0.15);
			--ops-red: #df5a67;
			--ops-red-soft: rgba(223, 90, 103, 0.14);
			--ops-cyan: #20a9b8;
			--ops-cyan-soft: rgba(32, 169, 184, 0.14);
			--ops-neutral-soft: rgba(130, 144, 163, 0.15);
		}

		[data-theme="light"] {
			--ops-bg: #eef3f7;
			--ops-surface: #ffffff;
			--ops-surface-2: #f7f9fc;
			--ops-surface-3: #edf2f7;
			--ops-border: #d4dde8;
			--ops-border-strong: #aebdce;
			--ops-fg: #182231;
			--ops-fg-2: #46576a;
			--ops-muted: #75869a;
			--ops-primary: #2368ad;
			--ops-primary-hover: #1f5f9f;
			--ops-primary-soft: rgba(35, 104, 173, 0.11);
			--ops-green: #12894e;
			--ops-green-soft: rgba(18, 137, 78, 0.11);
			--ops-amber: #a66c00;
			--ops-amber-soft: rgba(166, 108, 0, 0.12);
			--ops-red: #b83a48;
			--ops-red-soft: rgba(184, 58, 72, 0.11);
			--ops-cyan: #087d8b;
			--ops-cyan-soft: rgba(8, 125, 139, 0.11);
			--ops-neutral-soft: rgba(117, 134, 154, 0.12);
		}

		body[data-standalone-theme="ops-workbench"] {
			--bg: var(--ops-bg);
			--bg-panel: var(--ops-bg);
			--bg-panel-2: var(--ops-surface);
			--bg-panel-3: var(--ops-surface-2);
			--surface: var(--ops-surface);
			--surface-elevated: var(--ops-surface-2);
			--sidebar: var(--ops-surface);
			--bg-input: var(--ops-surface-2);
			--border: var(--ops-border);
			--border-strong: var(--ops-border-strong);
			--border-hover: var(--ops-border-strong);
			--fg: var(--ops-fg);
			--fg-secondary: var(--ops-fg-2);
			--muted: var(--ops-muted);
			--line: var(--ops-border);
			--line-strong: var(--ops-border-strong);
			--accent: var(--ops-primary);
			--accent-soft: var(--ops-primary-soft);
			--primary: var(--ops-primary);
			--primary-hover: var(--ops-primary-hover);
			--primary-soft: var(--ops-primary-soft);
			--primary-glow: transparent;
			--accent-violet: var(--ops-cyan);
			--success: var(--ops-green);
			--success-soft: var(--ops-green-soft);
			--danger: var(--ops-red);
			--danger-soft: var(--ops-red-soft);
			--warning: var(--ops-amber);
			--warning-soft: var(--ops-amber-soft);
			--info: var(--ops-cyan);
			--info-soft: var(--ops-cyan-soft);
			--cyan: var(--ops-cyan);
			--cyan-soft: var(--ops-cyan-soft);
			background: var(--ops-bg);
			color: var(--ops-fg);
		}

		body[data-standalone-theme="ops-workbench"] #app {
			background: var(--ops-bg);
		}

		body[data-standalone-theme="ops-workbench"] .sp-topbar {
			background: var(--ops-bg);
			border-bottom: 1px solid var(--ops-border);
		}

		body[data-standalone-theme="ops-workbench"] .sp-topbar-title {
			letter-spacing: 0;
		}

		body[data-standalone-theme="ops-workbench"] .sp-topbar-btn,
		body[data-standalone-theme="ops-workbench"] .sp-topbar-back {
			border-color: var(--ops-border);
			color: var(--ops-fg-2);
			letter-spacing: 0;
		}

		body[data-standalone-theme="ops-workbench"] .sp-topbar-btn:hover,
		body[data-standalone-theme="ops-workbench"] .sp-topbar-back:hover {
			background: var(--ops-primary-soft);
			border-color: var(--ops-border-strong);
			color: var(--ops-fg);
		}
	`;
}

export function getOpsAgentsPageCss(): string {
	return `
		body[data-standalone-theme="ops-workbench"] .ag-stats {
			gap: 14px;
			padding: 18px 22px;
		}

		body[data-standalone-theme="ops-workbench"] .ag-stat-card {
			min-height: 92px;
			padding: 16px;
			background: var(--ops-surface);
			border-color: var(--ops-border);
			box-shadow: none;
		}

		body[data-standalone-theme="ops-workbench"] .ag-stat-card:hover {
			border-color: var(--ops-border-strong);
			box-shadow: none;
		}

		body[data-standalone-theme="ops-workbench"] .ag-stat-card .value {
			font-size: 28px;
			font-weight: 760;
		}

		body[data-standalone-theme="ops-workbench"] .ag-main {
			grid-template-columns: 310px minmax(0, 1fr);
			gap: 14px;
			padding: 0 22px 22px;
		}

		body[data-standalone-theme="ops-workbench"] .ag-sidebar,
		body[data-standalone-theme="ops-workbench"] .ag-detail,
		body[data-standalone-theme="ops-workbench"] .ag-card {
			background: var(--ops-surface);
			border-color: var(--ops-border);
			box-shadow: none;
		}

		body[data-standalone-theme="ops-workbench"] .ag-sidebar {
			grid-column: auto;
		}

		body[data-standalone-theme="ops-workbench"] .ag-detail {
			grid-column: auto;
		}

		body[data-standalone-theme="ops-workbench"] .ag-sidebar-toolbar,
		body[data-standalone-theme="ops-workbench"] .ag-detail-head {
			border-bottom-color: var(--ops-border);
		}

		body[data-standalone-theme="ops-workbench"] .ag-search-input,
		body[data-standalone-theme="ops-workbench"] .ag-form-input,
		body[data-standalone-theme="ops-workbench"] .ag-form-select,
		body[data-standalone-theme="ops-workbench"] .ag-form-textarea {
			background: var(--ops-surface-2);
			border-color: var(--ops-border);
			color: var(--ops-fg);
		}

		body[data-standalone-theme="ops-workbench"] .ag-search-input:focus,
		body[data-standalone-theme="ops-workbench"] .ag-form-input:focus,
		body[data-standalone-theme="ops-workbench"] .ag-form-select:focus,
		body[data-standalone-theme="ops-workbench"] .ag-form-textarea:focus {
			border-color: var(--ops-primary);
			box-shadow: 0 0 0 3px var(--ops-primary-soft);
		}

		body[data-standalone-theme="ops-workbench"] .ag-agent-item,
		body[data-standalone-theme="ops-workbench"] .ag-status-mini,
		body[data-standalone-theme="ops-workbench"] .ag-skill-item,
		body[data-standalone-theme="ops-workbench"] .ag-file-card {
			background: var(--ops-surface-2);
			border-color: var(--ops-border);
		}

		body[data-standalone-theme="ops-workbench"] .ag-agent-item:hover,
		body[data-standalone-theme="ops-workbench"] .ag-agent-item.selected {
			background: var(--ops-primary-soft);
			border-color: var(--ops-primary);
			box-shadow: none;
		}

		body[data-standalone-theme="ops-workbench"] .ag-agent-name,
		body[data-standalone-theme="ops-workbench"] .ag-detail-title,
		body[data-standalone-theme="ops-workbench"] .ag-detail-task-name,
		body[data-standalone-theme="ops-workbench"] .ag-card-title {
			color: var(--ops-fg);
			letter-spacing: 0;
		}

		body[data-standalone-theme="ops-workbench"] .ag-agent-desc,
		body[data-standalone-theme="ops-workbench"] .ag-agent-meta,
		body[data-standalone-theme="ops-workbench"] .ag-detail-meta,
		body[data-standalone-theme="ops-workbench"] .ag-muted,
		body[data-standalone-theme="ops-workbench"] .ag-card-subtitle {
			color: var(--ops-muted);
		}

		body[data-standalone-theme="ops-workbench"] .ag-detail-task-icon,
		body[data-standalone-theme="ops-workbench"] .ag-card-title-icon {
			background: var(--ops-primary-soft) !important;
			color: var(--ops-primary);
		}

		body[data-standalone-theme="ops-workbench"] .ag-detail-task-icon svg,
		body[data-standalone-theme="ops-workbench"] .ag-card-title-icon svg {
			stroke: currentColor;
		}

		body[data-standalone-theme="ops-workbench"] .ag-btn--primary {
			background: var(--ops-primary);
			border-color: var(--ops-primary);
			color: #ffffff;
			box-shadow: none;
		}

		body[data-standalone-theme="ops-workbench"] .ag-btn--primary:not(:disabled):hover {
			background: var(--ops-primary-hover);
			border-color: var(--ops-primary-hover);
			filter: none;
		}

		body[data-standalone-theme="ops-workbench"] .ag-btn--outline,
		body[data-standalone-theme="ops-workbench"] .ag-btn--ghost {
			background: transparent;
			border-color: var(--ops-border);
			color: var(--ops-fg-2);
		}

		body[data-standalone-theme="ops-workbench"] .ag-btn--outline:not(:disabled):hover,
		body[data-standalone-theme="ops-workbench"] .ag-btn--ghost:not(:disabled):hover {
			background: var(--ops-surface-2);
			border-color: var(--ops-border-strong);
			color: var(--ops-fg);
		}

		body[data-standalone-theme="ops-workbench"] .ag-badge--active,
		body[data-standalone-theme="ops-workbench"] .ag-badge--running,
		body[data-standalone-theme="ops-workbench"] .ag-chip--primary {
			background: var(--ops-primary-soft);
			color: var(--ops-primary);
		}

		body[data-standalone-theme="ops-workbench"] .ag-badge--success,
		body[data-standalone-theme="ops-workbench"] .ag-chip--success {
			background: var(--ops-green-soft);
			color: var(--ops-green);
		}

		body[data-standalone-theme="ops-workbench"] .ag-badge--warning,
		body[data-standalone-theme="ops-workbench"] .ag-chip--warning {
			background: var(--ops-amber-soft);
			color: var(--ops-amber);
		}

		body[data-standalone-theme="ops-workbench"] .ag-badge--danger,
		body[data-standalone-theme="ops-workbench"] .ag-chip--danger {
			background: var(--ops-red-soft);
			color: var(--ops-red);
		}

		body[data-standalone-theme="ops-workbench"] .ag-detail-body::-webkit-scrollbar-thumb,
		body[data-standalone-theme="ops-workbench"] .ag-agent-list::-webkit-scrollbar-thumb,
		body[data-standalone-theme="ops-workbench"] .ag-skill-list::-webkit-scrollbar-thumb {
			background: var(--ops-border-strong);
		}

		@media (max-width: 1024px) {
			body[data-standalone-theme="ops-workbench"] .ag-main {
				grid-template-columns: 300px minmax(0, 1fr);
			}
		}

		@media (max-width: 768px) {
			body[data-standalone-theme="ops-workbench"] .ag-stats {
				padding: 12px;
				gap: 10px;
			}

			body[data-standalone-theme="ops-workbench"] .ag-main {
				grid-template-columns: minmax(0, 1fr);
				padding: 0 12px 12px;
			}
		}
	`;
}

export function getOpsConnPageCss(): string {
	return `
		body[data-standalone-theme="ops-workbench"] .conn-stats {
			gap: 14px;
			padding: 18px 22px;
		}

		body[data-standalone-theme="ops-workbench"] .conn-stat-card {
			min-height: 92px;
			padding: 16px;
			background: var(--ops-surface);
			border-color: var(--ops-border);
			box-shadow: none;
		}

		body[data-standalone-theme="ops-workbench"] .conn-stat-card:hover {
			border-color: var(--ops-border-strong);
			box-shadow: none;
		}

		body[data-standalone-theme="ops-workbench"] .conn-stat-card .value {
			font-size: 28px;
			font-weight: 760;
		}

		body[data-standalone-theme="ops-workbench"] .conn-main {
			grid-template-columns: 310px minmax(0, 1fr);
			gap: 14px;
			padding: 0 22px 22px;
		}

		body[data-standalone-theme="ops-workbench"] .conn-list,
		body[data-standalone-theme="ops-workbench"] .conn-detail,
		body[data-standalone-theme="ops-workbench"] .conn-card {
			background: var(--ops-surface);
			border-color: var(--ops-border);
			box-shadow: none;
		}

		body[data-standalone-theme="ops-workbench"] .conn-list {
			grid-column: auto;
		}

		body[data-standalone-theme="ops-workbench"] .conn-detail {
			grid-column: auto;
		}

		body[data-standalone-theme="ops-workbench"] .conn-list-toolbar,
		body[data-standalone-theme="ops-workbench"] .conn-filter-tabs,
		body[data-standalone-theme="ops-workbench"] .conn-list-footer,
		body[data-standalone-theme="ops-workbench"] .conn-detail-head {
			border-color: var(--ops-border);
		}

		body[data-standalone-theme="ops-workbench"] .conn-search,
		body[data-standalone-theme="ops-workbench"] .conn-form-input,
		body[data-standalone-theme="ops-workbench"] .conn-form-select,
		body[data-standalone-theme="ops-workbench"] .conn-form-textarea {
			background: var(--ops-surface-2);
			border-color: var(--ops-border);
			color: var(--ops-fg);
		}

		body[data-standalone-theme="ops-workbench"] .conn-search:focus,
		body[data-standalone-theme="ops-workbench"] .conn-form-input:focus,
		body[data-standalone-theme="ops-workbench"] .conn-form-select:focus,
		body[data-standalone-theme="ops-workbench"] .conn-form-textarea:focus {
			border-color: var(--ops-primary);
			box-shadow: 0 0 0 3px var(--ops-primary-soft);
		}

		body[data-standalone-theme="ops-workbench"] .conn-filter-tab {
			color: var(--ops-fg-2);
			border-color: transparent;
		}

		body[data-standalone-theme="ops-workbench"] .conn-filter-tab:hover {
			background: var(--ops-surface-2);
			color: var(--ops-fg);
		}

		body[data-standalone-theme="ops-workbench"] .conn-filter-tab.active {
			background: var(--ops-primary-soft);
			color: var(--ops-primary);
		}

		body[data-standalone-theme="ops-workbench"] .conn-list-item,
		body[data-standalone-theme="ops-workbench"] .conn-status-mini,
		body[data-standalone-theme="ops-workbench"] .conn-file-card,
		body[data-standalone-theme="ops-workbench"] .conn-run-card,
		body[data-standalone-theme="ops-workbench"] .conn-run-lazy,
		body[data-standalone-theme="ops-workbench"] .conn-prompt-block,
		body[data-standalone-theme="ops-workbench"] .conn-run-result {
			background: var(--ops-surface-2);
			border-color: var(--ops-border);
		}

		body[data-standalone-theme="ops-workbench"] .conn-list-item:hover,
		body[data-standalone-theme="ops-workbench"] .conn-list-item.is-selected {
			background: var(--ops-primary-soft);
			border-color: var(--ops-primary);
			box-shadow: none;
		}

		body[data-standalone-theme="ops-workbench"] .conn-list-item-title,
		body[data-standalone-theme="ops-workbench"] .conn-detail-title,
		body[data-standalone-theme="ops-workbench"] .conn-detail-task-name,
		body[data-standalone-theme="ops-workbench"] .conn-card-title {
			color: var(--ops-fg);
			letter-spacing: 0;
		}

		body[data-standalone-theme="ops-workbench"] .conn-list-item-meta,
		body[data-standalone-theme="ops-workbench"] .conn-list-item-schedule,
		body[data-standalone-theme="ops-workbench"] .conn-detail-meta,
		body[data-standalone-theme="ops-workbench"] .conn-detail-schedule-summary {
			color: var(--ops-muted);
		}

		body[data-standalone-theme="ops-workbench"] .conn-stat-icon,
		body[data-standalone-theme="ops-workbench"] .conn-detail-task-icon,
		body[data-standalone-theme="ops-workbench"] .conn-card-title-icon {
			background: var(--ops-primary-soft) !important;
			color: var(--ops-primary);
		}

		body[data-standalone-theme="ops-workbench"] .conn-stat-icon svg,
		body[data-standalone-theme="ops-workbench"] .conn-detail-task-icon svg,
		body[data-standalone-theme="ops-workbench"] .conn-card-title-icon svg {
			stroke: currentColor;
		}

		body[data-standalone-theme="ops-workbench"] .conn-btn--primary,
		body[data-standalone-theme="ops-workbench"] .conn-list-editor-btn--primary {
			background: var(--ops-primary);
			border-color: var(--ops-primary);
			color: #ffffff;
			box-shadow: none;
		}

		body[data-standalone-theme="ops-workbench"] .conn-btn--primary:not(:disabled):hover,
		body[data-standalone-theme="ops-workbench"] .conn-list-editor-btn--primary:not(:disabled):hover {
			background: var(--ops-primary-hover);
			border-color: var(--ops-primary-hover);
			filter: none;
		}

		body[data-standalone-theme="ops-workbench"] .conn-btn--outline,
		body[data-standalone-theme="ops-workbench"] .conn-list-editor-btn--cancel {
			background: transparent;
			border-color: var(--ops-border);
			color: var(--ops-fg-2);
		}

		body[data-standalone-theme="ops-workbench"] .conn-btn--outline:not(:disabled):hover,
		body[data-standalone-theme="ops-workbench"] .conn-list-editor-btn--cancel:not(:disabled):hover {
			background: var(--ops-surface-2);
			border-color: var(--ops-border-strong);
			color: var(--ops-fg);
		}

		body[data-standalone-theme="ops-workbench"] .conn-btn--danger:not(:disabled):hover,
		body[data-standalone-theme="ops-workbench"] .conn-run-cancel-btn:not(:disabled):hover {
			background: var(--ops-red-soft);
			border-color: var(--ops-red);
			color: var(--ops-red);
		}

		body[data-standalone-theme="ops-workbench"] .conn-badge--active,
		body[data-standalone-theme="ops-workbench"] .conn-list-item-badge--active,
		body[data-standalone-theme="ops-workbench"] .conn-badge--running {
			background: var(--ops-green-soft);
			color: var(--ops-green);
		}

		body[data-standalone-theme="ops-workbench"] .conn-badge--paused,
		body[data-standalone-theme="ops-workbench"] .conn-list-item-badge--paused {
			background: var(--ops-amber-soft);
			color: var(--ops-amber);
		}

		body[data-standalone-theme="ops-workbench"] .conn-badge--failed,
		body[data-standalone-theme="ops-workbench"] .conn-badge--error {
			background: var(--ops-red-soft);
			color: var(--ops-red);
		}

		body[data-standalone-theme="ops-workbench"] .conn-badge--completed,
		body[data-standalone-theme="ops-workbench"] .conn-list-item-badge--completed,
		body[data-standalone-theme="ops-workbench"] .conn-list-item-badge--unknown {
			background: var(--ops-neutral-soft);
			color: var(--ops-muted);
		}

		body[data-standalone-theme="ops-workbench"] .conn-detail-body::-webkit-scrollbar-thumb,
		body[data-standalone-theme="ops-workbench"] .conn-list-items::-webkit-scrollbar-thumb,
		body[data-standalone-theme="ops-workbench"] .conn-prompt-block::-webkit-scrollbar-thumb,
		body[data-standalone-theme="ops-workbench"] .conn-run-result::-webkit-scrollbar-thumb {
			background: var(--ops-border-strong);
		}

		@media (max-width: 1024px) {
			body[data-standalone-theme="ops-workbench"] .conn-main {
				grid-template-columns: 300px minmax(0, 1fr);
			}
		}

		@media (max-width: 768px) {
			body[data-standalone-theme="ops-workbench"] .conn-stats {
				padding: 12px;
				gap: 10px;
			}

			body[data-standalone-theme="ops-workbench"] .conn-main {
				grid-template-columns: minmax(0, 1fr);
				padding: 0 12px 12px;
			}
		}
	`;
}
