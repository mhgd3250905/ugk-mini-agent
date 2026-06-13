import {
	getStandaloneBaseCss,
	getStandaloneBaseJs,
	renderStandaloneTopbar,
	renderStandaloneConfirmDialog,
	renderStandaloneToastContainer,
	STANDALONE_FAVICON,
	STANDALONE_THEME_INLINE_SCRIPT,
} from "./standalone-page-shared.js";

function getInboxPageCss(): string {
	return `
		/* ── Design tokens ── */
		:root, body, [data-theme="dark"], [data-theme="light"] {
			--bg: #070A12;
			--surface: #0F1524;
			--surface-elevated: #121A2B;
			--sidebar: #0B1020;
			--bg-input: #080D18;
			--border: #202A44;
			--border-strong: #334569;
			--border-hover: #2D3F5F;
			--fg: #F8FAFC;
			--fg-secondary: #CBD5E1;
			--muted: #64748B;
			--primary: #6366F1;
			--primary-hover: #7C83FF;
			--primary-soft: rgba(99, 102, 241, 0.16);
			--primary-glow: rgba(99, 102, 241, 0.28);
			--success: #22C55E;
			--success-soft: rgba(34, 197, 94, 0.14);
			--danger: #FF4D6D;
			--danger-soft: rgba(255, 77, 109, 0.14);
			--warning: #F59E0B;
			--warning-soft: rgba(245, 158, 11, 0.14);
			--info: #38BDF8;
			--info-soft: rgba(56, 189, 248, 0.14);
			--radius-card: 8px;
			--radius-card-sm: 8px;
			--radius-btn: 8px;
			--radius-input: 8px;
		}

		html, body { background: var(--bg); }

		/* ── Scrollbar ── */
		.ib-detail::-webkit-scrollbar,
		.ib-list-items::-webkit-scrollbar,
		.ib-content-block::-webkit-scrollbar {
			width: 6px;
		}
		.ib-detail::-webkit-scrollbar-track,
		.ib-list-items::-webkit-scrollbar-track,
		.ib-content-block::-webkit-scrollbar-track {
			background: transparent;
		}
		.ib-detail::-webkit-scrollbar-thumb,
		.ib-list-items::-webkit-scrollbar-thumb,
		.ib-content-block::-webkit-scrollbar-thumb {
			background: #263552;
			border-radius: 999px;
		}
		.ib-detail::-webkit-scrollbar-thumb:hover,
		.ib-list-items::-webkit-scrollbar-thumb:hover,
		.ib-content-block::-webkit-scrollbar-thumb:hover {
			background: #3A4B70;
		}

		/* ── Root layout ── */
		#app {
			display: grid;
			grid-template-rows: auto auto minmax(0, 1fr);
			height: 100%;
			overflow: hidden;
			background: var(--bg);
		}

		/* ── Topbar overrides ── */
		.sp-topbar {
			background: var(--bg);
			border-bottom: 1px solid var(--border);
		}

		/* ── Stats row ── */
		.ib-stats {
			display: grid;
			grid-template-columns: repeat(5, 1fr);
			gap: 16px;
			padding: 20px 24px;
		}
		.ib-stat-card {
			padding: 20px;
			border-radius: var(--radius-card);
			background: var(--surface);
			border: 1px solid var(--border);
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 16px;
			min-height: 104px;
			transition: border-color 0.2s, box-shadow 0.2s;
		}
		.ib-stat-card:hover {
			border-color: var(--border-hover);
			box-shadow: 0 0 20px rgba(99, 102, 241, 0.06);
		}
		.ib-stat-body { flex: 1; min-width: 0; }
		.ib-stat-label {
			font-size: 12px;
			font-weight: 600;
			color: var(--muted);
			margin-bottom: 6px;
		}
		.ib-stat-value {
			font-size: 28px;
			font-weight: 700;
			line-height: 1;
			font-variant-numeric: tabular-nums;
		}
		.ib-stat-desc {
			font-size: 11px;
			color: var(--muted);
			margin-top: 4px;
		}
		.ib-stat-icon {
			width: 44px;
			height: 44px;
			border-radius: 8px;
			display: flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
		}
		.ib-stat-icon svg { width: 22px; height: 22px; }

		.ib-stat-card--primary .ib-stat-icon { background: var(--primary-soft); }
		.ib-stat-card--primary .ib-stat-value { color: var(--primary); }
		.ib-stat-card--info .ib-stat-icon { background: var(--info-soft); }
		.ib-stat-card--info .ib-stat-value { color: var(--info); }
		.ib-stat-card--success .ib-stat-icon { background: var(--success-soft); }
		.ib-stat-card--success .ib-stat-value { color: var(--success); }
		.ib-stat-card--danger .ib-stat-icon { background: var(--danger-soft); }
		.ib-stat-card--danger .ib-stat-value { color: var(--danger); }
		.ib-stat-card--warning .ib-stat-icon { background: var(--warning-soft); }
		.ib-stat-card--warning .ib-stat-value { color: var(--warning); }

		/* ── Main split ── */
		.ib-main {
			display: grid;
			grid-template-columns: repeat(5, 1fr);
			min-height: 0;
			overflow: hidden;
			padding: 0 24px 24px;
			gap: 16px;
		}

		/* ── Left sidebar ── */
		.ib-list {
			display: grid;
			grid-template-rows: auto auto auto minmax(0, 1fr);
			background: var(--sidebar);
			border: 1px solid var(--border);
			border-radius: var(--radius-card);
			overflow: hidden;
			grid-column: 1 / 3;
		}
		.ib-list-toolbar {
			padding: 16px 16px 0;
		}
		.ib-search {
			width: 100%;
			height: 40px;
			padding: 0 14px 0 36px;
			border: 1px solid var(--border);
			border-radius: var(--radius-input);
			background: var(--bg-input);
			color: var(--fg);
			font-family: var(--font-sans);
			font-size: 13px;
			outline: none;
			transition: border-color 0.2s, box-shadow 0.2s;
			background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='M21 21l-4.35-4.35'/%3E%3C/svg%3E");
			background-repeat: no-repeat;
			background-position: 12px center;
			box-sizing: border-box;
		}
		.ib-search::placeholder { color: var(--muted); }
		.ib-search:focus {
			border-color: var(--primary);
			box-shadow: 0 0 0 3px rgba(99,102,241,0.18);
		}

		/* ── Filter tabs ── */
		.ib-filter-tabs {
			display: flex;
			gap: 6px;
			padding: 12px 16px 0;
			overflow-x: auto;
			scrollbar-width: none;
		}
			.ib-filter-tab {
				padding: 6px 14px;
				border-radius: 999px;
				background: transparent;
				color: var(--muted);
				font-family: var(--font-sans);
				font-size: 12px;
				font-weight: 600;
				border: none;
				cursor: pointer;
				transition: all 0.15s;
				display: inline-flex;
				align-items: center;
				gap: 6px;
			}
			gap: 6px;
		}
		.ib-filter-tab:hover {
			background: var(--surface);
			color: var(--fg-secondary);
		}
			.ib-filter-tab.active {
				background: var(--primary);
				color: #fff;
			}
		.ib-filter-count {
			font-size: 10px;
			padding: 0 5px;
			border-radius: 999px;
			background: rgba(99,102,241,0.12);
			color: var(--primary-hover);
			font-weight: 600;
		}
		.ib-filter-tab.active .ib-filter-count {
			background: rgba(255, 255, 255, 0.25);
			color: #fff;
		}

		/* ── Sort toolbar ── */
		.ib-sort-bar {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 10px 16px 0;
		}
		.ib-sort-select {
			height: 32px;
			padding: 0 28px 0 10px;
			border: 1px solid var(--border);
			border-radius: var(--radius-btn);
			background: var(--bg-input);
			color: var(--fg-secondary);
			font-family: var(--font-sans);
			font-size: 12px;
			appearance: none;
			background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' stroke='%2364748B' stroke-width='1.4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
			background-repeat: no-repeat;
			background-position: right 8px center;
			cursor: pointer;
			outline: none;
		}
		.ib-sort-select:focus { border-color: var(--primary); }

		/* ── Message list ── */
		.ib-list-items {
			overflow-y: auto;
			min-height: 0;
			padding: 12px 8px 8px;
			display: grid;
			gap: 6px;
			align-content: start;
		}
		.ib-list-footer {
			padding: 10px 16px;
			border-top: 1px solid var(--border);
			text-align: center;
		}
		.ib-list-footer-count {
			font-size: 11px;
			color: var(--muted);
		}
		.ib-load-more {
			padding: 6px 20px;
			border: 1px solid var(--border);
			border-radius: var(--radius-btn);
			background: transparent;
			color: var(--muted);
			font-size: 11px;
			font-family: var(--font-sans);
			cursor: pointer;
			transition: all 0.15s;
		}
		.ib-load-more:hover {
			background: rgba(99,102,241,0.08);
			color: var(--fg-secondary);
			border-color: var(--border-hover);
		}

		/* ── Message list item ── */
		.ib-msg-item {
			display: grid;
			grid-template-columns: auto minmax(0, 1fr);
			gap: 12px;
			padding: 14px 16px;
			border-radius: var(--radius-card-sm);
			border: 1px solid transparent;
			background: transparent;
			cursor: pointer;
			text-align: left;
			font-family: var(--font-sans);
			transition: all 0.18s;
			position: relative;
		}
		.ib-msg-item:hover {
			background: var(--surface);
			border-color: var(--border);
		}
		.ib-msg-item.selected {
			background: var(--primary-soft);
			border-color: var(--primary);
			border-left: 3px solid var(--primary);
			padding-left: 13px;
			box-shadow: 0 0 16px rgba(99, 102, 241, 0.08);
		}
		.ib-msg-dot {
			width: 8px;
			height: 8px;
			border-radius: 999px;
			margin-top: 6px;
			flex-shrink: 0;
			background: var(--muted);
		}
		.ib-msg-dot.unread { background: var(--primary); box-shadow: 0 0 6px rgba(99,102,241,0.4); }
		.ib-msg-dot.success { background: var(--success); }
		.ib-msg-dot.danger { background: var(--danger); }
		.ib-msg-dot.info { background: var(--info); }
		.ib-msg-dot.warning { background: var(--warning); }

		.ib-msg-body { min-width: 0; }
		.ib-msg-head {
			display: flex;
			align-items: center;
			gap: 8px;
			flex-wrap: wrap;
		}
		.ib-msg-title {
			font-size: 13px;
			font-weight: 600;
			color: var(--fg);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			flex: 1;
			min-width: 0;
		}
		.ib-msg-item.is-unread .ib-msg-title { color: #fff; }
		.ib-msg-badge {
			font-size: 10px;
			font-weight: 600;
			padding: 2px 8px;
			border-radius: 999px;
			white-space: nowrap;
			flex-shrink: 0;
		}
		.ib-msg-badge--conn { background: var(--primary-soft); color: var(--primary-hover); }
		.ib-msg-badge--notification { background: var(--warning-soft); color: var(--warning); }
		.ib-msg-badge--agent { background: var(--success-soft); color: var(--success); }

		.ib-msg-summary {
			font-size: 12px;
			color: var(--muted);
			margin-top: 4px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.ib-msg-meta {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-top: 6px;
		}
		.ib-msg-source {
			font-size: 10px;
			color: var(--muted);
		}
		.ib-msg-time {
			font-size: 10px;
			color: var(--muted);
			font-family: var(--font-mono);
			margin-left: auto;
		}
		.ib-msg-unread-dot {
			width: 6px;
			height: 6px;
			border-radius: 999px;
			background: var(--primary);
			flex-shrink: 0;
		}

		/* ── Detail panel ── */
		.ib-detail {
			overflow-y: auto;
			min-height: 0;
			display: grid;
			gap: 16px;
			align-content: start;
			padding-right: 4px;
			grid-column: 3 / 6;
		}

		/* Detail header */
		.ib-detail-header {
			padding: 24px;
			border-radius: var(--radius-card);
			background: var(--surface);
			border: 1px solid var(--border);
			display: flex;
			gap: 20px;
			align-items: flex-start;
		}
		.ib-detail-status-icon {
			width: 48px;
			height: 48px;
			border-radius: 8px;
			display: flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
		}
		.ib-detail-status-icon svg { width: 22px; height: 22px; }
		.ib-detail-status-icon--success { background: var(--success-soft); color: var(--success); }
		.ib-detail-status-icon--danger { background: var(--danger-soft); color: var(--danger); }
		.ib-detail-status-icon--info { background: var(--info-soft); color: var(--info); }
		.ib-detail-status-icon--primary { background: var(--primary-soft); color: var(--primary); }
		.ib-detail-status-icon--warning { background: var(--warning-soft); color: var(--warning); }

		.ib-detail-info { flex: 1; min-width: 0; }
		.ib-detail-title {
			font-size: 20px;
			font-weight: 700;
			color: var(--fg);
			line-height: 1.3;
		}
		.ib-detail-sub {
			display: flex;
			align-items: center;
			gap: 10px;
			flex-wrap: wrap;
			margin-top: 8px;
		}
		.ib-detail-sub-item {
			font-size: 12px;
			color: var(--muted);
			display: flex;
			align-items: center;
			gap: 4px;
		}
		.ib-detail-sub-item svg { width: 13px; height: 13px; stroke: currentColor; fill: none; }
		.ib-detail-actions {
			display: flex;
			gap: 8px;
			flex-shrink: 0;
		}

		/* Status badge in detail */
		.ib-status-badge {
			display: inline-flex;
			align-items: center;
			gap: 5px;
			padding: 3px 10px;
			border-radius: 999px;
			font-size: 11px;
			font-weight: 600;
			white-space: nowrap;
		}
		.ib-status-badge--unread { background: var(--primary-soft); color: var(--primary-hover); }
		.ib-status-badge--read { background: rgba(100,116,139,0.12); color: var(--muted); }
		.ib-status-badge--success { background: var(--success-soft); color: var(--success); }
		.ib-status-badge--danger { background: var(--danger-soft); color: var(--danger); }

		/* ── Detail cards ── */
		.ib-detail-card {
			background: var(--surface);
			border: 1px solid var(--border);
			border-radius: var(--radius-card);
			overflow: hidden;
		}
		.ib-detail-card-head {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 16px 20px 14px;
			border-bottom: 1px solid var(--border);
		}
		.ib-detail-card-icon {
			width: 28px;
			height: 28px;
			border-radius: 8px;
			display: flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
		}
		.ib-detail-card-icon svg { width: 14px; height: 14px; }
		.ib-detail-card-title {
			font-size: 14px;
			font-weight: 600;
			color: var(--fg);
		}
		.ib-detail-card-body {
			padding: 16px 20px;
		}

		/* Source info card */
		.ib-source-grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
			gap: 12px;
		}
		.ib-source-field {
			padding: 12px 14px;
			border-radius: 8px;
			background: var(--surface-elevated);
			border: 1px solid var(--border);
		}
		.ib-source-label {
			font-size: 10px;
			font-weight: 600;
			color: var(--muted);
			text-transform: uppercase;
			letter-spacing: 0.04em;
			margin-bottom: 4px;
		}
		.ib-source-value {
			font-size: 13px;
			color: var(--fg);
			word-break: break-all;
		}
		.ib-source-value.mono {
			font-family: var(--font-mono);
			font-size: 12px;
		}

		/* Content block - markdown prose */
		.ib-content-block {
			font-size: 13.5px;
			line-height: 1.75;
			color: var(--fg-secondary);
			word-break: break-word;
			position: relative;
		}
		.ib-content-block p { margin: 0 0 10px; }
		.ib-content-block p:last-child { margin-bottom: 0; }
		.ib-content-block h1, .ib-content-block h2, .ib-content-block h3,
		.ib-content-block h4, .ib-content-block h5, .ib-content-block h6 {
			color: var(--fg); font-weight: 600; margin: 16px 0 8px; line-height: 1.3;
		}
		.ib-content-block h1 { font-size: 18px; }
		.ib-content-block h2 { font-size: 16px; }
		.ib-content-block h3 { font-size: 15px; }
		.ib-content-block h4, .ib-content-block h5, .ib-content-block h6 { font-size: 14px; }
		.ib-content-block ul, .ib-content-block ol { margin: 8px 0; padding-left: 22px; }
		.ib-content-block li { margin: 3px 0; }
		.ib-content-block code {
			font-family: var(--font-mono); font-size: 12px;
			background: var(--surface); border: 1px solid var(--border);
			border-radius: 4px; padding: 1px 5px;
		}
		.ib-content-block pre {
			background: var(--surface); border: 1px solid var(--border);
			border-radius: 8px; padding: 12px 14px;
			overflow-x: auto; margin: 10px 0;
		}
		.ib-content-block pre code { background: none; border: none; padding: 0; font-size: 12.5px; line-height: 1.6; }
		.ib-content-block blockquote { border-left: 3px solid var(--primary); margin: 10px 0; padding: 6px 14px; color: var(--muted); }
		.ib-content-block a { color: var(--primary); text-decoration: none; }
		.ib-content-block a:hover { text-decoration: underline; }
		.ib-content-block strong { color: var(--fg); font-weight: 600; }
		.ib-content-block hr { border: none; border-top: 1px solid var(--border); margin: 14px 0; }
		.ib-copy-btn {
			width: 28px;
			height: 28px;
			border-radius: 6px;
			border: 1px solid var(--border);
			background: var(--surface);
			color: var(--muted);
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;
			transition: all 0.15s;
			margin-left: auto;
			flex-shrink: 0;
		}
		.ib-copy-btn:hover { color: var(--primary); border-color: var(--primary); }
		.ib-copy-btn svg { width: 14px; height: 14px; }

		/* Copyable ID */
		.ib-id-copyable {
			font-family: var(--font-mono);
			font-size: 12px;
			color: var(--muted);
			background: var(--surface);
			padding: 3px 8px;
			border-radius: 6px;
			cursor: pointer;
			user-select: none;
			transition: color 0.15s;
		}
		.ib-id-copyable:hover { color: var(--primary); }
		.ib-id-copyable.is-copied { color: var(--success); }

		/* Attachments */
		.ib-attach-item {
			display: flex;
			align-items: center;
			gap: 16px;
			padding: 14px 16px;
			border-radius: 8px;
			border: 1px solid var(--border);
			background: var(--surface-elevated);
			transition: border-color 0.15s;
		}
		.ib-attach-item:hover { border-color: var(--border-hover); }
		.ib-attach-item + .ib-attach-item { margin-top: 8px; }
		.ib-attach-icon {
			width: 36px;
			height: 36px;
			border-radius: 8px;
			background: var(--primary-soft);
			color: var(--primary);
			display: flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
		}
		.ib-attach-icon svg { width: 16px; height: 16px; stroke: currentColor; fill: none; }
		.ib-attach-info { flex: 1; min-width: 0; }
		.ib-attach-name {
			font-size: 13px;
			font-weight: 600;
			color: var(--fg);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.ib-attach-meta {
			font-size: 11px;
			color: var(--muted);
			margin-top: 2px;
		}
		.ib-attach-action {
			padding: 4px 12px;
			border: 1px solid var(--border);
			border-radius: var(--radius-btn);
			background: transparent;
			color: var(--muted);
			font-size: 11px;
			cursor: pointer;
			transition: all 0.15s;
			text-decoration: none;
			display: inline-flex;
			align-items: center;
		}
		.ib-attach-action:hover {
			border-color: var(--primary);
			color: var(--primary);
		}

		/* Buttons */
		.ib-btn {
			height: 34px;
			padding: 0 14px;
			border-radius: var(--radius-btn);
			border: 1px solid var(--border);
			background: transparent;
			color: var(--fg-secondary);
			font-size: 12px;
			font-family: var(--font-sans);
			cursor: pointer;
			display: inline-flex;
			align-items: center;
			gap: 6px;
			transition: all 0.15s;
			white-space: nowrap;
		}
		.ib-btn:hover {
			background: rgba(99,102,241,0.08);
			border-color: var(--border-hover);
		}
		.ib-btn:disabled { opacity: 0.4; cursor: not-allowed; }
		.ib-btn svg { width: 14px; height: 14px; stroke: currentColor; fill: none; }
		.ib-btn--primary {
			background: var(--primary-soft);
			border-color: rgba(99,102,241,0.3);
			color: var(--primary-hover);
		}
		.ib-btn--primary:hover {
			background: rgba(99,102,241,0.22);
			border-color: var(--primary);
		}

		/* ── Empty states ── */
		.ib-empty {
			text-align: center;
			padding: 48px 24px;
		}
		.ib-empty-icon {
			width: 52px;
			height: 52px;
			border-radius: 8px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			margin-bottom: 14px;
		}
		.ib-empty-icon svg { width: 24px; height: 24px; }
		.ib-empty-title {
			font-size: 14px;
			font-weight: 600;
			color: var(--fg-secondary);
			margin-bottom: 6px;
		}
		.ib-empty-desc {
			font-size: 12px;
			color: var(--muted);
			line-height: 1.6;
		}

		.ib-list-empty .ib-empty-icon { background: var(--primary-soft); color: var(--primary); }
		.ib-detail-empty .ib-empty-icon { background: var(--info-soft); color: var(--info); }

		/* ── Mobile ── */
		.ib-mobile-back { display: none !important; }

		@media (max-width: 1024px) {
			.ib-stats { grid-template-columns: repeat(3, 1fr); }
			.ib-main { grid-template-columns: repeat(5, 1fr); }
		}

		@media (max-width: 768px) {
			.ib-stats { grid-template-columns: repeat(2, 1fr); padding: 12px; gap: 10px; }
			.ib-main { grid-template-columns: minmax(0, 1fr); padding: 0 12px 12px; }
			.ib-list { display: none; grid-column: auto; }
			.ib-list.mobile-visible { display: grid; }
			.ib-detail { display: none; grid-column: auto; }
			.ib-detail.mobile-visible { display: grid; }
			.ib-mobile-back { display: inline-flex !important; }
			.ib-detail-header { flex-direction: column; gap: 14px; }
			.ib-detail-actions { width: 100%; }
			.ib-source-grid { grid-template-columns: repeat(2, 1fr); }
			.sp-topbar { height: 48px; padding: 0 10px; }
			.sp-topbar-title { font-size: 15px; }
		}

		@media (max-width: 480px) {
			.ib-stats { grid-template-columns: repeat(2, 1fr); gap: 8px; }
			.ib-stat-card { padding: 14px 16px; min-height: 80px; }
			.ib-stat-value { font-size: 22px; }
			.ib-stat-icon { width: 36px; height: 36px; }
			.ib-stat-icon svg { width: 16px; height: 16px; }
		}
	`;
}

function getInboxPageJs(): string {
	return `
		const SOURCE_LABELS = { conn: "后台任务", notification: "通知", agent: "助手" };
		const SOURCE_BADGE_CLS = { conn: "ib-msg-badge--conn", notification: "ib-msg-badge--notification", agent: "ib-msg-badge--agent" };

		const FILTER_TABS = [
			{ id: "all", label: "全部" },
			{ id: "unread", label: "未读" },
			{ id: "task", label: "任务通知" },
			{ id: "system", label: "系统消息" },
			{ id: "failed", label: "失败告警" },
		];

		const state = {
			items: [],
			unreadCount: 0,
			hasMore: false,
			nextBefore: null,
			loading: false,
			selectedId: null,
			searchQuery: "",
			filterTab: "all",
			sortOrder: "desc",
		};




		/* ── Lightweight markdown renderer ── */
		function renderMd(src) {
			if (!src) return "";
			var BQ = String.fromCharCode(96);
			var NL = String.fromCharCode(10);
			var ST = String.fromCharCode(42);
			var escStar = String.fromCharCode(92) + ST;  // backslash + star = "\\*" in regex
			var s = String(src)
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;");

			// Code blocks (triple backtick)
			var reCB = new RegExp(BQ+BQ+BQ+"(["+NL+"]*?)"+BQ+BQ+BQ, "g");
			s = s.replace(reCB, function(_, code) {
				return "<pre><code>" + code + "<"+"/code><"+"/pre>";
			});

			// Inline code
			var reIC = new RegExp(BQ+"([^"+NL+"]+?)"+BQ, "g");
			s = s.replace(reIC, "<code>$1<"+"/code>");

			// Headers
			s = s.replace(/^### (.+)$/gm, "<h3>$1<"+"/h3>");
			s = s.replace(/^## (.+)$/gm, "<h2>$1<"+"/h2>");
			s = s.replace(/^# (.+)$/gm, "<h1>$1<"+"/h1>");

			// Bold
			var reB = new RegExp(escStar+escStar+"(.+?)"+escStar+escStar, "g");
			s = s.replace(reB, "<strong>$1<"+"/strong>");

			// Italic
			var reI = new RegExp(escStar+"(.+?)"+escStar, "g");
			s = s.replace(reI, "<em>$1<"+"/em>");

			// List items
			var reLI = new RegExp("^"+escStar+" (.+)$", "gm");
			s = s.replace(reLI, "<li>$1<"+"/li>");

			// Wrap consecutive <li> in <ul>
			var reUL = new RegExp("(<li>.*<"+"/li>"+NL+"?)+", "g");
			s = s.replace(reUL, "<ul>$&<"+"/ul>");

			// Blockquote
			s = s.replace(/^&gt; (.+)$/gm, "<blockquote>$1<"+"/blockquote>");

			// Paragraphs
			var reNL = new RegExp(NL+NL+"+", "g");
			s = s.replace(reNL, "<"+"/p><p>");
			s = "<p>" + s + "<"+"/p>";

			// Clean up empty <p> wrappers around block elements
			s = s.replace(new RegExp("<p><"+"/(h[1-6]|pre|ul|ol|blockquote)", "g"), "<$1");
			s = s.replace(new RegExp("<"+"/(h[1-6]|pre|ul|ol|blockquote)><"+"/p>", "g"), "<"+"/$1>");
			s = s.replace(new RegExp("<p><"+"/p>", "g"), "");

			return s;
		}
		/* ── API ── */
		async function apiFetchActivity(params) {
			const query = new URLSearchParams();
			if (params?.limit) query.set("limit", String(params.limit));
			if (params?.before) query.set("before", params.before);
			const url = "/v1/activity" + (query.toString() ? "?" + query.toString() : "");
			return await fetchJson(url);
		}

		async function apiFetchSummary() {
			return await fetchJson("/v1/activity/summary").catch(function() { return { unreadCount: 0 }; });
		}

		async function apiMarkRead(activityId) {
			return await fetchJson("/v1/activity/" + activityId + "/read", { method: "POST" });
		}

		async function apiMarkAllRead() {
			return await fetchJson("/v1/activity/read-all", { method: "POST" });
		}

		/* ── Data ── */
		async function loadData() {
			state.loading = true;
			try {
				var results = await Promise.allSettled([
					apiFetchActivity({ limit: 30 }),
					apiFetchSummary(),
				]);
				var activityData = results[0].status === "fulfilled" ? results[0].value : { activities: [] };
				var summaryData = results[1].status === "fulfilled" ? results[1].value : { unreadCount: 0 };
				state.items = activityData.activities || [];
				state.hasMore = activityData.hasMore || false;
				state.nextBefore = activityData.nextBefore || null;
				state.unreadCount = summaryData.unreadCount || 0;
			} catch (e) {
				showToast(e.message, "danger");
			} finally {
				state.loading = false;
			}
		}

		async function loadMore() {
			if (!state.hasMore || state.loading) return;
			state.loading = true;
			try {
				var data = await apiFetchActivity({ limit: 30, before: state.nextBefore });
				state.items = state.items.concat(data.activities || []);
				state.hasMore = data.hasMore || false;
				state.nextBefore = data.nextBefore || null;
				renderList();
			} catch (e) {
				showToast(e.message, "danger");
			} finally {
				state.loading = false;
			}
		}

		/* ── Filtering ── */
		function getFilteredItems() {
			var q = (state.searchQuery || "").toLowerCase();
			var tab = state.filterTab;
			return state.items.filter(function(item) {
				if (q) {
					var titleOk = (item.title || "").toLowerCase().indexOf(q) !== -1;
					var idOk = (item.activityId || "").toLowerCase().indexOf(q) !== -1;
					var textOk = (item.text || "").toLowerCase().indexOf(q) !== -1;
					if (!titleOk && !idOk && !textOk) return false;
				}
				if (tab === "all") return true;
				if (tab === "unread") return !item.readAt;
				if (tab === "task") return item.source === "conn";
				if (tab === "system") return item.source === "notification";
				if (tab === "failed") {
					var t = (item.title || "").toLowerCase();
					return t.indexOf("fail") !== -1 || t.indexOf("失败") !== -1 || t.indexOf("error") !== -1;
				}
				return true;
			}).sort(function(a, b) {
				var ta = new Date(a.createdAt).getTime() || 0;
				var tb = new Date(b.createdAt).getTime() || 0;
				return state.sortOrder === "desc" ? tb - ta : ta - tb;
			});
		}

		function getStats() {
			var total = state.items.length;
			var unread = state.items.filter(function(i) { return !i.readAt; }).length;
			var today = new Date();
			today.setHours(0, 0, 0, 0);
			var todayTs = today.getTime();
			var todayCount = state.items.filter(function(i) {
				return new Date(i.createdAt).getTime() >= todayTs;
			}).length;
			var successCount = state.items.filter(function(i) {
				var t = (i.title || "").toLowerCase();
				return t.indexOf("complet") !== -1 || t.indexOf("success") !== -1 || t.indexOf("成功") !== -1;
			}).length;
			var failCount = state.items.filter(function(i) {
				var t = (i.title || "").toLowerCase();
				return t.indexOf("fail") !== -1 || t.indexOf("失败") !== -1 || t.indexOf("error") !== -1;
			}).length;
			return { total: total, unread: unread, today: todayCount, success: successCount, failed: failCount };
		}

		/* ── Rendering: Stats ── */
		function renderStats() {
			var s = getStats();
			var el = document.getElementById("ib-stat-unread");
			if (el) el.textContent = s.unread;
			el = document.getElementById("ib-stat-today");
			if (el) el.textContent = s.today;
			el = document.getElementById("ib-stat-success");
			if (el) el.textContent = s.success;
			el = document.getElementById("ib-stat-failed");
			if (el) el.textContent = s.failed;
			el = document.getElementById("ib-stat-total");
			if (el) el.textContent = s.total;
		}

		/* ── Rendering: Filter tabs ── */
		function renderFilterTabs() {
			var container = document.getElementById("ib-filter-tabs");
			if (!container) return;
			container.innerHTML = "";
			var counts = { all: state.items.length, unread: 0, task: 0, system: 0, failed: 0 };
			state.items.forEach(function(i) {
				if (!i.readAt) counts.unread++;
				if (i.source === "conn") counts.task++;
				if (i.source === "notification") counts.system++;
				var t = (i.title || "").toLowerCase();
				if (t.indexOf("fail") !== -1 || t.indexOf("失败") !== -1 || t.indexOf("error") !== -1) counts.failed++;
			});
			FILTER_TABS.forEach(function(tab) {
				var btn = document.createElement("button");
				btn.type = "button";
				btn.className = "ib-filter-tab" + (state.filterTab === tab.id ? " active" : "");
				var count = counts[tab.id] || 0;
				btn.innerHTML = tab.label + '<span class="ib-filter-count">' + count + '</span>';
				btn.addEventListener("click", function() {
					state.filterTab = tab.id;
					renderFilterTabs();
					renderList();
				});
				container.appendChild(btn);
			});
		}

		/* ── Rendering: List ── */
		function renderList() {
			var container = document.getElementById("ib-list-items");
			if (!container) return;
			container.innerHTML = "";
			var filtered = getFilteredItems();

			if (filtered.length === 0) {
				container.innerHTML = '<div class="ib-empty ib-list-empty">'
					+ '<div class="ib-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></div>'
					+ '<div class="ib-empty-title">暂无消息</div>'
					+ '<div class="ib-empty-desc">任务执行结果、系统通知和告警会显示在这里。</div>'
					+ '</div>';
				renderListFooter(0);
				return;
			}

			filtered.forEach(function(item) {
				var el = document.createElement("button");
				el.type = "button";
				var isUnread = !item.readAt;
				var dotClass = getMsgDotClass(item);
				el.className = "ib-msg-item" + (isUnread ? " is-unread" : "") + (state.selectedId === item.activityId ? " selected" : "");

				var badgeCls = SOURCE_BADGE_CLS[item.source] || "ib-msg-badge--conn";
				var sourceLabel = SOURCE_LABELS[item.source] || item.source || "";
				var summary = (item.text || "").slice(0, 80);

				el.innerHTML = '<div class="ib-msg-dot ' + dotClass + '"></div>'
					+ '<div class="ib-msg-body">'
					+ '<div class="ib-msg-head">'
					+ '<span class="ib-msg-title">' + escapeHtml(item.title || "消息") + '</span>'
					+ '<span class="ib-msg-badge ' + badgeCls + '">' + escapeHtml(sourceLabel) + '</span>'
					+ '</div>'
					+ (summary ? '<div class="ib-msg-summary">' + escapeHtml(summary) + '</div>' : '')
					+ '<div class="ib-msg-meta">'
					+ '<span class="ib-msg-source">' + escapeHtml(sourceLabel) + '</span>'
					+ '<span class="ib-msg-time">' + formatRelativeTime(item.createdAt) + '</span>'
					+ (isUnread ? '<span class="ib-msg-unread-dot"></span>' : '')
					+ '</div>'
					+ '</div>';

				el.addEventListener("click", function() { selectMessage(item.activityId); });
				container.appendChild(el);
			});

			renderListFooter(filtered.length);
		}

		function renderListFooter(count) {
			var footer = document.getElementById("ib-list-footer");
			if (!footer) return;
			footer.innerHTML = '<span class="ib-list-footer-count">共 ' + count + ' 条</span>'
				+ (state.hasMore ? '<button id="ib-load-more" class="ib-load-more" type="button">加载更多</button>' : '');
			var loadMoreBtn = document.getElementById("ib-load-more");
			if (loadMoreBtn) loadMoreBtn.addEventListener("click", loadMore);
		}

		function getMsgDotClass(item) {
			if (!item.readAt) return "unread";
			var t = (item.title || "").toLowerCase();
			if (t.indexOf("fail") !== -1 || t.indexOf("失败") !== -1 || t.indexOf("error") !== -1) return "danger";
			if (t.indexOf("complet") !== -1 || t.indexOf("success") !== -1 || t.indexOf("成功") !== -1) return "success";
			if (item.source === "notification") return "info";
			return "";
		}

		/* ── Rendering: Detail ── */
		function renderDetail() {
			var body = document.getElementById("ib-detail");
			if (!body) return;

			if (!state.selectedId) {
				body.innerHTML = '<div class="ib-empty ib-detail-empty">'
					+ '<div class="ib-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></div>'
					+ '<div class="ib-empty-title">请选择一条消息</div>'
					+ '<div class="ib-empty-desc">从左侧列表中选择消息查看详情。</div>'
					+ '</div>';
				return;
			}

			var item = state.items.find(function(i) { return i.activityId === state.selectedId; });
			if (!item) {
				body.innerHTML = '<div class="ib-empty ib-detail-empty">'
					+ '<div class="ib-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg></div>'
					+ '<div class="ib-empty-title">消息未找到</div>'
					+ '</div>';
				return;
			}

			var isUnread = !item.readAt;
			var dotClass = getMsgDotClass(item);
			var iconCls = "ib-detail-status-icon--primary";
			if (dotClass === "success") iconCls = "ib-detail-status-icon--success";
			else if (dotClass === "danger") iconCls = "ib-detail-status-icon--danger";
			else if (dotClass === "info") iconCls = "ib-detail-status-icon--info";
			else if (isUnread) iconCls = "ib-detail-status-icon--primary";

			var badgeCls = SOURCE_BADGE_CLS[item.source] || "ib-msg-badge--conn";
			var sourceLabel = SOURCE_LABELS[item.source] || item.source || "";

			var html = "";

			// Header card
			html += '<div class="ib-detail-header">';
			html += '<div class="ib-detail-status-icon ' + iconCls + '">';
			html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
			html += '</div>';
			html += '<div class="ib-detail-info">';
			html += '<div class="ib-detail-title">' + escapeHtml(item.title || "消息") + '</div>';
			html += '<div class="ib-detail-sub">';
			html += '<span class="ib-status-badge ' + (isUnread ? 'ib-status-badge--unread' : 'ib-status-badge--read') + '">' + (isUnread ? '未读' : '已读') + '</span>';
			html += '<span class="ib-msg-badge ' + badgeCls + '">' + escapeHtml(sourceLabel) + '</span>';
			html += '<span class="ib-detail-sub-item"><svg viewBox="0 0 24 24" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' + formatRelativeTime(item.createdAt) + '</span>';
html += '<span class="ib-id-copyable" data-copy-id="' + escapeHtml(item.activityId || '') + '" title="点击复制 ID">' + (item.activityId || "").slice(0, 12) + '…</span>';
			html += '</div></div>';
			html += '<div class="ib-detail-actions">';
			if (isUnread) {
				html += '<button class="ib-btn ib-btn--primary" type="button" data-action="mark-read"><svg viewBox="0 0 24 24" stroke-width="1.8"><polyline points="20 6 9 17 4 12"/></svg>标为已读</button>';
			}
			html += '<button class="ib-btn" type="button" data-action="copy-text"><svg viewBox="0 0 24 24" stroke-width="1.8"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>复制内容</button>';
			html += '</div>';
			html += '</div>';

			// Source info card
			html += '<div class="ib-detail-card">';
			html += '<div class="ib-detail-card-head">';
			html += '<div class="ib-detail-card-icon" style="background:var(--primary-soft);color:var(--primary)">';
			html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>';
			html += '</div>';
			html += '<span class="ib-detail-card-title">消息信息</span>';
			html += '</div>';
			html += '<div class="ib-detail-card-body">';
			html += '<div class="ib-source-grid">';
			html += makeInfoField("消息来源", sourceLabel, false);
			html += makeInfoField("创建时间", formatTimestamp(item.createdAt), false);
html += '<div class="ib-source-field"><div class="ib-source-label">消息 ID</div><span class="ib-id-copyable" data-copy-id="' + escapeHtml(item.activityId || '') + '" title="点击复制 ID">' + escapeHtml(item.activityId || '-') + '</span></div>';
			html += makeInfoField("状态", isUnread ? "未读" : "已读", false);
			html += '</div></div></div>';

			// Content card
			if (item.text) {
				html += '<div class="ib-detail-card">';
				html += '<div class="ib-detail-card-head">';
				html += '<div class="ib-detail-card-icon" style="background:var(--success-soft);color:var(--success)">';
				html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>';
				html += '</div>';
				html += '<span class="ib-detail-card-title">消息内容</span>';
				html += '<button class="ib-copy-btn" type="button" data-copy-ib-content title="复制"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>';
				html += '</div>';
				html += '<div class="ib-detail-card-body">';
				html += '<div class="ib-content-block">';
				html += renderMd(item.text);
				html += '</div></div></div>';
			}

			// Attachments card
			if (Array.isArray(item.files) && item.files.length > 0) {
				html += '<div class="ib-detail-card">';
				html += '<div class="ib-detail-card-head">';
				html += '<div class="ib-detail-card-icon" style="background:var(--warning-soft);color:var(--warning)">';
				html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>';
				html += '</div>';
				html += '<span class="ib-detail-card-title">附件 (' + item.files.length + ')</span>';
				html += '</div>';
				html += '<div class="ib-detail-card-body">';
				item.files.forEach(function(file) {
					var name = file.fileName || file.kind || "file";
					var url = file.downloadUrl || file.url || "#";
					var ext = name.split(".").pop().toUpperCase();
					html += '<div class="ib-attach-item">';
					html += '<div class="ib-attach-icon"><svg viewBox="0 0 24 24" stroke-width="1.6"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>';
					html += '<div class="ib-attach-info"><div class="ib-attach-name">' + escapeHtml(name) + '</div>';
					html += '<div class="ib-attach-meta">' + escapeHtml(ext) + '</div></div>';
					html += '<a class="ib-attach-action" href="' + escapeHtml(url) + '" target="_blank" download>下载</a>';
					html += '</div>';
				});
				html += '</div></div>';
			}

			body.innerHTML = html;

			// Event delegation
			var readBtn = body.querySelector('[data-action="mark-read"]');
			if (readBtn) {
				readBtn.addEventListener("click", function() {
					handleMarkRead(item.activityId);
				});
			}
			var copyBtn = body.querySelector('[data-action="copy-text"]');
			if (copyBtn) {
				copyBtn.addEventListener("click", function() {
					copyToClipboard(item.text || "");
				});
			}
			var contentCopyBtn = body.querySelector('[data-copy-ib-content]');
			body.querySelectorAll('.ib-id-copyable').forEach(function(el) {
				el.addEventListener('click', function() {
					var id = el.getAttribute('data-copy-id');
					if (id) navigator.clipboard.writeText(id).then(function() {
						el.classList.add('is-copied');
						setTimeout(function() { el.classList.remove('is-copied'); }, 1200);
					});
				});
			});
			if (contentCopyBtn) {
				contentCopyBtn.addEventListener("click", function() {
					copyToClipboard(item.text || "");
				});
			}
		}

		function makeInfoField(label, value, mono) {
			return '<div class="ib-source-field">'
				+ '<div class="ib-source-label">' + escapeHtml(label) + '</div>'
				+ '<div class="ib-source-value' + (mono ? ' mono' : '') + '">' + escapeHtml(value) + '</div>'
				+ '</div>';
		}

		/* ── Actions ── */
		function copyToClipboard(text) {
			var ta = document.createElement("textarea");
			ta.value = text;
			ta.style.position = "fixed";
			ta.style.opacity = "0";
			document.body.appendChild(ta);
			ta.select();
			document.execCommand("copy");
			ta.remove();
			showToast("已复制", "ok");
		}

		async function handleMarkRead(activityId) {
			try {
				var data = await apiMarkRead(activityId);
				var item = state.items.find(function(i) { return i.activityId === activityId; });
				if (item) item.readAt = new Date().toISOString();
				state.unreadCount = Math.max(0, (data.unreadCount ?? state.unreadCount) - 1);
				renderList();
				renderDetail();
				renderStats();
				renderFilterTabs();
			} catch (e) { showToast(e.message, "danger"); }
		}

		async function handleMarkAllRead() {
			try {
				await apiMarkAllRead();
				state.items.forEach(function(i) { i.readAt = new Date().toISOString(); });
				state.unreadCount = 0;
				renderList();
				renderDetail();
				renderStats();
				renderFilterTabs();
				showToast("已全部标记为已读", "ok");
			} catch (e) { showToast(e.message, "danger"); }
		}

		function selectMessage(activityId) {
			state.selectedId = activityId;
			renderList();
			renderDetail();
			// auto-mark read
			var item = state.items.find(function(i) { return i.activityId === activityId; });
			if (item && !item.readAt) {
				void apiMarkRead(activityId).then(function(data) {
					item.readAt = new Date().toISOString();
					state.unreadCount = Math.max(0, (data.unreadCount ?? state.unreadCount) - 1);
					renderStats();
					renderFilterTabs();
				}).catch(function() {});
			}
			// mobile: show detail
			var detail = document.querySelector(".ib-detail");
			var list = document.querySelector(".ib-list");
			if (detail) detail.classList.add("mobile-visible");
			if (list) list.classList.remove("mobile-visible");
		}

		function mobileBackToList() {
			var detail = document.querySelector(".ib-detail");
			var list = document.querySelector(".ib-list");
			if (detail) detail.classList.remove("mobile-visible");
			if (list) list.classList.add("mobile-visible");
		}

		/* ── Refresh ── */
		async function handleRefresh() {
			var btn = document.getElementById("btn-refresh");
			if (btn) { btn.disabled = true; }
			await loadData();
			renderStats();
			renderFilterTabs();
			renderList();
			renderDetail();
			if (btn) { btn.disabled = false; }
			showToast("已刷新", "ok");
		}

		/* ── Init ── */
		async function init() {
			applyTheme(readStoredTheme());

			var refreshBtn = document.getElementById("btn-refresh");
			if (refreshBtn) refreshBtn.addEventListener("click", handleRefresh);

			var readAllBtn = document.getElementById("btn-read-all");
			if (readAllBtn) readAllBtn.addEventListener("click", handleMarkAllRead);

			var searchInput = document.getElementById("ib-search");
			if (searchInput) {
				searchInput.addEventListener("input", debounce(function() {
					state.searchQuery = searchInput.value;
					renderList();
				}, 200));
			}

			var sortSelect = document.getElementById("ib-sort");
			if (sortSelect) {
				sortSelect.addEventListener("change", function() {
					state.sortOrder = sortSelect.value;
					renderList();
				});
			}

			var mobileBack = document.getElementById("ib-mobile-back");
			if (mobileBack) mobileBack.addEventListener("click", mobileBackToList);

			await loadData();
			renderStats();
			renderFilterTabs();
			renderList();
			renderDetail();

			// SSE
			try {
				var es = new EventSource("/v1/notifications/stream");
				es.addEventListener("message", function() {
					void loadData().then(function() {
						renderStats();
						renderFilterTabs();
						renderList();
					});
				});
				es.addEventListener("error", function() { es.close(); });
			} catch {}
		}

		document.addEventListener("DOMContentLoaded", init);
	`;
}

export function renderInboxPage(): string {
	const css = getStandaloneBaseCss() + getInboxPageCss();
	const js = getStandaloneBaseJs() + getInboxPageJs();

	return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	${STANDALONE_THEME_INLINE_SCRIPT}
	<title>消息中心 - UGK Claw</title>
	<link rel="icon" href="${STANDALONE_FAVICON}" />
	<style>${css}</style>
</head>
<body>
	<div id="app">
		${renderStandaloneTopbar("消息中心", "/playground")}
		<button id="btn-read-all" class="sp-topbar-btn" type="button" style="position:absolute;right:160px;top:11px">
			<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
			全部已读
		</button>
		<button id="btn-refresh" class="sp-topbar-btn" type="button" style="position:absolute;right:70px;top:11px">
			<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
			刷新
		</button>

		<section class="ib-stats">
			<div class="ib-stat-card ib-stat-card--primary">
				<div class="ib-stat-body">
					<div class="ib-stat-label">未读消息</div>
					<div class="ib-stat-value" id="ib-stat-unread">0</div>
				</div>
				<div class="ib-stat-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="1.8" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
				</div>
			</div>
			<div class="ib-stat-card ib-stat-card--info">
				<div class="ib-stat-body">
					<div class="ib-stat-label">今日通知</div>
					<div class="ib-stat-value" id="ib-stat-today">0</div>
				</div>
				<div class="ib-stat-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="1.8" stroke-linecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
				</div>
			</div>
			<div class="ib-stat-card ib-stat-card--success">
				<div class="ib-stat-body">
					<div class="ib-stat-label">成功执行</div>
					<div class="ib-stat-value" id="ib-stat-success">0</div>
				</div>
				<div class="ib-stat-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="1.8" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
				</div>
			</div>
			<div class="ib-stat-card ib-stat-card--danger">
				<div class="ib-stat-body">
					<div class="ib-stat-label">失败告警</div>
					<div class="ib-stat-value" id="ib-stat-failed">0</div>
				</div>
				<div class="ib-stat-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="#FF4D6D" stroke-width="1.8" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
				</div>
			</div>
			<div class="ib-stat-card ib-stat-card--warning">
				<div class="ib-stat-body">
					<div class="ib-stat-label">全部消息</div>
					<div class="ib-stat-value" id="ib-stat-total">0</div>
				</div>
				<div class="ib-stat-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
				</div>
			</div>
		</section>

		<div class="ib-main">
			<aside class="ib-list mobile-visible">
				<div class="ib-list-toolbar">
					<input id="ib-search" class="ib-search" type="text" placeholder="搜索任务名称或消息 ID..." />
				</div>
				<div id="ib-filter-tabs" class="ib-filter-tabs"></div>
				<div class="ib-sort-bar">
					<select id="ib-sort" class="ib-sort-select">
						<option value="desc">按时间倒序</option>
						<option value="asc">按时间正序</option>
					</select>
				</div>
				<div id="ib-list-items" class="ib-list-items"></div>
				<div id="ib-list-footer" class="ib-list-footer"></div>
			</aside>

			<section class="ib-detail" id="ib-detail">
				<button id="ib-mobile-back" class="ib-btn ib-mobile-back" type="button" style="margin-bottom:8px">
					<svg viewBox="0 0 20 20" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><path d="M13 4l-6 6 6 6"/></svg>
					返回列表
				</button>
			</section>
		</div>
	</div>

	${renderStandaloneConfirmDialog()}
	${renderStandaloneToastContainer()}
	<script>${js}</script>
</body>
</html>`;
}
