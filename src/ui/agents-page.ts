import {
	getStandaloneBaseCss,
	getStandaloneBaseJs,
	renderStandaloneTopbar,
	renderStandaloneConfirmDialog,
	renderStandaloneToastContainer,
	STANDALONE_FAVICON,
	STANDALONE_THEME_INLINE_SCRIPT,
} from "./standalone-page-shared.js";

function getAgentsPageCss(): string {
	return `
		/* ── Design tokens (consistent with conn-page) ── */
		:root, [data-theme="dark"] {
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
			--accent-violet: #8B5CF6;
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

		[data-theme="light"] {
			--bg: #F0F2F8;
			--surface: #FFFFFF;
			--surface-elevated: #F8F9FC;
			--sidebar: #F4F5FA;
			--bg-input: #FFFFFF;
			--border: #D4D9E6;
			--border-strong: #B0B9CC;
			--border-hover: #96A0B8;
			--fg: #1A1F36;
			--fg-secondary: #4A5568;
			--muted: #8896AB;
			--primary: #5B5BD6;
			--primary-hover: #6E6EE8;
			--primary-soft: rgba(91, 91, 214, 0.10);
			--primary-glow: rgba(91, 91, 214, 0.14);
			--accent-violet: #7C3AED;
			--success: #16A34A;
			--success-soft: rgba(22, 163, 74, 0.10);
			--danger: #E11D48;
			--danger-soft: rgba(225, 29, 72, 0.10);
			--warning: #D97706;
			--warning-soft: rgba(217, 119, 6, 0.10);
			--info: #0284C7;
			--info-soft: rgba(2, 132, 199, 0.10);
		}

		html, body { background: var(--bg); }

		/* ── Scrollbar ── */
		.ag-detail-body::-webkit-scrollbar,
		.ag-agent-list::-webkit-scrollbar,
		.ag-skill-list::-webkit-scrollbar {
			width: 6px;
		}
		.ag-detail-body::-webkit-scrollbar-track,
		.ag-agent-list::-webkit-scrollbar-track,
		.ag-skill-list::-webkit-scrollbar-track {
			background: transparent;
		}
		.ag-detail-body::-webkit-scrollbar-thumb,
		.ag-agent-list::-webkit-scrollbar-thumb,
		.ag-skill-list::-webkit-scrollbar-thumb {
			background: #263552;
			border-radius: 999px;
		}
		.ag-detail-body::-webkit-scrollbar-thumb:hover,
		.ag-agent-list::-webkit-scrollbar-thumb:hover,
		.ag-skill-list::-webkit-scrollbar-thumb:hover {
			background: #3A4B70;
		}

		/* ── Topbar overrides ── */
		.sp-topbar {
			background: var(--bg);
			border-bottom: 1px solid var(--border);
		}
		.sp-topbar-btn { height: 36px; border-radius: var(--radius-btn); border-color: var(--border); padding: 0 14px; font-size: 12px; }
		.sp-topbar-btn:hover { background: var(--primary-soft); border-color: var(--border-hover); color: var(--fg-secondary); }
		.sp-topbar-btn svg { width: 14px; height: 14px; }

		/* ── Root layout ── */
		#app {
			display: grid;
			grid-template-rows: auto auto minmax(0, 1fr);
			height: 100%;
			overflow: hidden;
			background: var(--bg);
		}

		/* ── Stats row ── */
		.ag-stats {
			display: grid;
			grid-template-columns: repeat(4, 1fr);
			gap: 16px;
			padding: 20px 24px;
		}
		.ag-stat-card {
			padding: 20px;
			border-radius: var(--radius-card);
			background: var(--surface);
			border: 1px solid var(--border);
			transition: border-color 0.2s, box-shadow 0.2s;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 16px;
			min-height: 104px;
		}
		.ag-stat-card:hover {
			border-color: var(--border-hover);
			box-shadow: 0 0 20px rgba(99, 102, 241, 0.06);
		}
		.ag-stat-card-body { flex: 1; min-width: 0; }
		.ag-stat-card .ag-stat-label { font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 8px; }
		.ag-stat-card .ag-stat-num { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
		.ag-stat-card .ag-stat-desc { font-size: 11px; color: var(--muted); margin-top: 6px; }
		.ag-stat-icon {
			width: 44px; height: 44px;
			border-radius: 8px;
			display: flex; align-items: center; justify-content: center;
			flex-shrink: 0;
		}
		.ag-stat-icon svg { width: 22px; height: 22px; }
		.ag-stat-card--blue .ag-stat-icon { background: var(--primary-soft); }
		.ag-stat-card--blue .ag-stat-num { color: var(--primary); }
		.ag-stat-card--green .ag-stat-icon { background: var(--success-soft); }
		.ag-stat-card--green .ag-stat-num { color: var(--success); }
		.ag-stat-card--amber .ag-stat-icon { background: var(--warning-soft); }
		.ag-stat-card--amber .ag-stat-num { color: var(--warning); }
		.ag-stat-card--violet .ag-stat-icon { background: rgba(139, 92, 246, 0.12); }
		.ag-stat-card--violet .ag-stat-num { color: #8B5CF6; }

		/* ── Main split (5-col grid, same as conn) ── */
		.ag-main {
			display: grid;
			grid-template-columns: repeat(5, 1fr);
			min-height: 0;
			overflow: hidden;
			padding: 0 24px 24px;
			gap: 16px;
		}
		.ag-sidebar { grid-column: 1 / 2; }
		.ag-detail { grid-column: 2 / 6; }

		/* ── Sidebar ── */
		.ag-sidebar {
			display: grid;
			grid-template-rows: auto auto minmax(0, 1fr);
			min-height: 0;
			overflow: hidden;
			background: var(--sidebar);
			border: 1px solid var(--border);
			border-radius: var(--radius-card);
		}
		.ag-sidebar-toolbar { padding: 16px 16px 12px; }
		.ag-search-input {
			width: 100%; height: 40px;
			padding: 0 14px 0 36px;
			border-radius: var(--radius-input);
			border: 1px solid var(--border);
			background: var(--bg-input);
			color: var(--fg);
			font-family: var(--font-sans);
			font-size: 13px;
			outline: none;
			transition: border-color .2s, box-shadow .2s;
			box-sizing: border-box;
			background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='M21 21l-4.35-4.35'/%3E%3C/svg%3E");
			background-repeat: no-repeat;
			background-position: 12px center;
		}
		.ag-search-input::placeholder { color: var(--muted); }
		.ag-search-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }

		/* ── Filter tabs (borderless pills, same as conn) ── */
		.ag-filter-tabs {
			display: flex; gap: 4px; padding: 0 12px 12px; flex-wrap: wrap;
		}
		.ag-filter-tab {
			padding: 6px 14px;
			border-radius: 999px;
			background: transparent;
			color: var(--muted);
			font-family: var(--font-sans);
			font-size: 12px; font-weight: 600;
			border: none;
			cursor: pointer;
			transition: all .15s;
		}
		.ag-filter-tab:hover { background: var(--surface); color: var(--fg-secondary); }
		.ag-filter-tab.active { background: var(--primary); color: #fff; }

		/* ── Agent list ── */
		.ag-agent-list { overflow-y: auto; padding: 4px 8px 8px; min-height: 0; }

		.ag-agent-item {
			display: grid;
			gap: 6px;
			width: 100%;
			padding: 14px 14px 14px 16px;
			border: 1px solid transparent;
			border-radius: var(--radius-card-sm);
			background: #161E35;
			text-align: left;
			cursor: pointer;
			margin-bottom: 4px;
			font-family: var(--font-sans);
			transition: all .15s;
		}
		.ag-agent-item:hover { background: #1A2440; }
		.ag-agent-item.selected {
			background: var(--primary-soft);
			border-color: var(--primary);
			border-left: 3px solid var(--primary);
			padding-left: 13px;
			box-shadow: 0 0 16px rgba(99, 102, 241, 0.08);
		}
		.ag-agent-item-row {
			display: flex; align-items: center; gap: 8px; min-width: 0;
		}
		.ag-agent-dot {
			width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0;
		}
		.ag-agent-dot--active { background: var(--success); box-shadow: 0 0 6px var(--success); }
		.ag-agent-dot--available { background: var(--muted); }
		.ag-agent-dot--viewing { background: var(--primary); box-shadow: 0 0 6px var(--primary); }
		.ag-agent-item-title {
			font-size: 13px; font-weight: 600; color: var(--fg);
			overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
			flex: 1; min-width: 0;
		}
		.ag-agent-item-badge {
			font-size: 11px; font-weight: 600; padding: 3px 10px;
			border-radius: 999px; white-space: nowrap;
		}
		.ag-agent-item-badge--active { background: var(--success-soft); color: var(--success); }
		.ag-agent-item-badge--viewing { background: var(--primary-soft); color: var(--primary); }
		.ag-agent-item-badge--available { background: rgba(100,116,139,0.15); color: var(--muted); }
		.ag-agent-item-meta {
			font-size: 11px; color: var(--muted);
			overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
		}

		/* ── Detail panel (matches conn-detail structure) ── */
		.ag-detail {
			display: grid;
			grid-template-rows: auto minmax(0, 1fr);
			overflow: hidden;
			background: var(--surface);
			border: 1px solid var(--border);
			border-radius: var(--radius-card);
		}
		.ag-detail-head {
			display: flex; align-items: center; gap: 12px;
			padding: 16px 20px;
			border-bottom: 1px solid var(--border);
			flex-wrap: wrap;
		}
		.ag-detail-title {
			font-size: 16px; font-weight: 700;
			flex: 1; min-width: 0;
			overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
			color: var(--fg);
		}
		.ag-detail-actions {
			display: flex; gap: 8px; flex-wrap: wrap;
		}
		.ag-detail-body {
			overflow-y: auto;
			padding: 20px;
			min-height: 0;
		}

		/* ── Card module (matches conn-card) ── */
		.ag-card {
			background: var(--surface-elevated);
			border: 1px solid var(--border);
			border-radius: var(--radius-card);
			padding: 20px;
		}
		.ag-card + .ag-card { margin-top: 20px; }
		.ag-detail-row > .ag-card + .ag-card { margin-top: 0; }
		.ag-detail-row + .ag-card,
		.ag-card + .ag-detail-row { margin-top: 20px; }
		.ag-status-cards + .ag-card { margin-top: 20px; }

		.ag-card-title {
			display: flex; align-items: center; gap: 10px;
			font-size: 13px; font-weight: 700; color: var(--fg-secondary);
			margin-bottom: 16px;
		}
		.ag-card-title-icon {
			width: 28px; height: 28px;
			border-radius: 8px;
			display: flex; align-items: center; justify-content: center;
			flex-shrink: 0;
		}
		.ag-card-title-icon svg { width: 14px; height: 14px; }

		/* ── Detail header card ── */
		.ag-detail-header {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 16px;
			flex-wrap: wrap;
		}
		.ag-detail-header-left {
			display: flex; align-items: flex-start; gap: 14px;
			min-width: 0; flex: 1;
		}
		.ag-detail-task-icon {
			width: 44px; height: 44px; border-radius: 8px;
			background: var(--primary-soft);
			display: flex; align-items: center; justify-content: center; flex-shrink: 0;
		}
		.ag-detail-task-icon svg { width: 22px; height: 22px; stroke: var(--primary); fill: none; stroke-width: 1.8; }
		.ag-detail-task-info { display: grid; gap: 6px; min-width: 0; padding-top: 2px; }
		.ag-detail-task-name {
			font-size: 20px; font-weight: 700; color: var(--fg); margin: 0;
			overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
		}
		.ag-detail-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
		.ag-detail-header-actions {
			display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap;
		}

		/* ── Status badges (pill, matches conn-badge) ── */
		.ag-badge {
			display: inline-flex; align-items: center; gap: 5px;
			font-size: 12px; font-weight: 600;
			padding: 4px 12px; border-radius: 999px; white-space: nowrap;
		}
		.ag-badge--active { background: var(--success-soft); color: var(--success); }
		.ag-badge--default { background: rgba(100,116,139,0.15); color: var(--muted); }
		.ag-badge--custom { background: rgba(139, 92, 246, 0.12); color: #8B5CF6; }

		/* ── Status mini-cards row (matches conn-status-cards) ── */
		.ag-status-cards {
			display: grid;
			grid-template-columns: repeat(4, 1fr);
			gap: 12px;
			margin-top: 16px;
		}
		.ag-status-mini {
			background: var(--surface);
			border: 1px solid var(--border);
			border-radius: var(--radius-card-sm);
			padding: 16px;
			display: flex; align-items: center; gap: 14px;
			min-height: 88px; min-width: 0;
		}
		.ag-status-mini-icon {
			width: 36px; height: 36px; border-radius: 8px;
			display: flex; align-items: center; justify-content: center; flex-shrink: 0;
		}
		.ag-status-mini-icon svg { width: 18px; height: 18px; }
		.ag-status-mini-label { font-size: 11px; font-weight: 600; color: var(--muted); margin-bottom: 4px; }
		.ag-status-mini-value {
			font-size: 14px; font-weight: 600; color: var(--fg);
			overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
		}
		.ag-status-mini-value code { font-family: var(--font-mono); font-size: 12px; }

		/* ── Detail row (2-col, matches conn-detail-row) ── */
		.ag-detail-row {
			display: grid;
			grid-template-columns: repeat(4, 1fr);
			grid-auto-rows: 1fr;
			gap: 12px;
			margin-top: 20px;
			align-items: stretch;
		}
		.ag-detail-row > .ag-detail-row-config { grid-column: 1 / 3; }
		.ag-detail-row > .ag-card:nth-child(2) { grid-column: 3 / 5; }
		.ag-detail-row > .ag-card {
			display: flex; flex-direction: column; height: 100%; box-sizing: border-box;
		}

		/* ── Config grid (matches conn-config-grid) ── */
		.ag-config-grid { display: grid; gap: 12px; }
		.ag-config-item { display: grid; gap: 4px; }
		.ag-config-label { font-size: 11px; font-weight: 600; color: var(--muted); }
		.ag-config-value {
			font-size: 13px; color: var(--fg-secondary); line-height: 1.5;
			word-break: break-all; display: flex; align-items: center; gap: 6px;
		}
		.ag-config-value code {
			font-family: var(--font-mono); font-size: 12px; color: var(--primary);
			background: var(--bg-input); padding: 3px 10px; border-radius: 8px;
			border: 1px solid var(--border);
		}

		/* ── Copy button (matches conn-copy-btn) ── */
		.ag-copy-btn {
			background: none; border: 1px solid var(--border);
			border-radius: 8px; color: var(--muted); cursor: pointer;
			padding: 3px 8px; font-size: 11px; font-family: var(--font-sans);
			transition: all .15s; display: inline-flex; align-items: center;
			gap: 4px; white-space: nowrap;
		}
		.ag-copy-btn:hover { color: var(--primary); border-color: var(--primary); background: var(--primary-soft); }
		.ag-copy-btn svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2; }

		/* ── Buttons (matches conn-btn) ── */
		.ag-btn {
			display: inline-flex; align-items: center; justify-content: center;
			height: 36px; padding: 0 18px; border-radius: var(--radius-btn);
			font-family: var(--font-sans); font-size: 12px; font-weight: 600;
			cursor: pointer; transition: all .15s; border: 1px solid transparent;
			white-space: nowrap; gap: 6px;
		}
		.ag-btn:disabled { opacity: 0.4; cursor: not-allowed; }
		.ag-btn svg { width: 14px; height: 14px; }
		.ag-btn--primary {
			background: linear-gradient(135deg, var(--primary), var(--accent-violet));
			color: #fff; box-shadow: 0 4px 16px var(--primary-glow);
		}
		.ag-btn--primary:not(:disabled):hover { filter: brightness(1.1); }
		.ag-btn--outline {
			background: transparent; color: var(--fg-secondary); border-color: var(--border);
		}
		.ag-btn--outline:not(:disabled):hover {
			background: var(--surface-elevated); border-color: var(--border-strong); color: var(--fg);
		}
		.ag-btn--danger {
			background: transparent; color: var(--danger); border-color: var(--danger); opacity: 0.7;
		}
		.ag-btn--danger:not(:disabled):hover { background: var(--danger-soft); opacity: 1; }

		/* ── Skills toolbar ── */
		.ag-skills-toolbar {
			display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
			padding-top: 4px;
		}
		.ag-skills-select {
			width: 220px; height: 36px; border-radius: var(--radius-btn);
			border-color: var(--border); background: var(--bg-input);
			color: var(--fg); font-size: 12px; padding: 0 28px 0 10px;
			appearance: none;
			background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' stroke='%2364748B' stroke-width='1.4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
			background-repeat: no-repeat;
			background-position: right 8px center;
			outline: none;
		}
		.ag-skills-select:focus { border-color: var(--primary); }
			.ag-skills-collapsed {
				display: flex; align-items: center; justify-content: space-between;
				padding: 4px 0;
			}

		/* Skill items */
		.ag-skill-list {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 10px;
			max-height: 360px;
			overflow-y: auto;
			padding-top: 4px;
		}
		.ag-skill-item {
			display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
			align-items: center; gap: 12px;
			min-height: 82px;
			padding: 12px 14px; border-radius: 8px;
			border: 1px solid var(--border);
			background: var(--surface);
			transition: border-color .15s;
		}
		.ag-skill-item:hover { border-color: var(--border-hover); }
		.ag-skill-icon {
			width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0;
			display: flex; align-items: center; justify-content: center;
			background: rgba(139, 92, 246, 0.12); color: #A78BFA;
		}
		.ag-skill-icon svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.6; }
		.ag-skill-info { display: grid; gap: 6px; min-width: 0; }
		.ag-skill-name {
			display: flex; align-items: center; gap: 6px; min-width: 0;
			overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
			font-size: 13px; font-weight: 600; color: var(--fg);
		}
		.ag-skill-desc {
			font-size: 11px; color: var(--muted); margin-top: 2px;
			overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
		}
		.ag-skill-meta {
			display: flex; align-items: center; flex-wrap: wrap;
			gap: 6px; min-width: 0;
		}
		.ag-skill-location {
			display: inline-flex; align-items: center;
			min-height: 20px; padding: 0 7px; border-radius: 4px;
			font-size: 10px; font-weight: 600; line-height: 1;
			border: 1px solid var(--border);
			background: rgba(255, 255, 255, 0.035);
			color: var(--muted);
		}
		.ag-skill-location--system { border-color: rgba(201, 210, 255, 0.18); color: rgba(201, 210, 255, 0.9); }
		.ag-skill-location--agent { border-color: rgba(101, 209, 255, 0.2); color: rgba(101, 209, 255, 0.9); }
		.ag-skill-path {
			flex: 1 1 150px; min-width: 0;
			overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
			color: var(--muted); font-size: 10px; line-height: 1.4;
			font-family: ui-monospace, "Cascadia Mono", "SFMono-Regular", Consolas, monospace;
		}

		.ag-skill-item--disabled { opacity: 0.6; }
			.ag-skill-actions {
				display: flex; align-items: center; justify-content: flex-end; gap: 6px;
				flex-wrap: wrap;
			}
			.ag-skill-toggle {
				min-width: 40px; height: 28px; padding: 0 8px;
				border: 1px solid var(--border); border-radius: 6px;
				background: transparent; cursor: pointer;
				font-size: 12px; font-weight: 600;
				color: var(--muted); transition: all 0.15s;
			}
			.ag-skill-toggle:hover:not(:disabled) { border-color: var(--border-hover); }
			.ag-skill-toggle:disabled { opacity: 0.4; cursor: not-allowed; }
			.ag-skill-toggle--on { border-color: rgba(141, 255, 178, 0.28); color: rgba(141, 255, 178, 0.92); }
			.ag-skill-toggle--off { border-color: rgba(255, 209, 102, 0.22); color: rgba(255, 209, 102, 0.86); }
			.ag-skill-required { color: var(--muted); font-size: 10px; font-weight: 400; padding: 1px 6px; border: 1px solid var(--border); border-radius: 4px; margin-left: 6px; }

			/* ── Empty / error ── */
		.ag-empty {
			padding: 80px 24px; text-align: center;
		}
		.ag-empty-icon {
			width: 56px; height: 56px; margin: 0 auto 16px;
			border-radius: 8px; background: var(--surface-elevated);
			display: flex; align-items: center; justify-content: center;
		}
		.ag-empty-icon svg { width: 28px; height: 28px; stroke: var(--muted); fill: none; stroke-width: 1.5; }
		.ag-empty h3 { font-size: 16px; font-weight: 600; color: var(--fg-secondary); margin: 0 0 4px; }
		.ag-empty p { font-size: 13px; color: var(--muted); margin: 0; }
		.ag-empty-sm { padding: 40px 16px; }
		.ag-empty-sm .ag-empty-icon { width: 40px; height: 40px; }
		.ag-empty-sm .ag-empty-icon svg { width: 20px; height: 20px; }

		/* ── File card (rules link) ── */
		.ag-file-card {
			display: flex; align-items: center; gap: 14px;
			padding: 14px 16px; border-radius: 8px;
			border: 1px solid var(--border); background: var(--surface);
			transition: border-color .15s;
		}
		.ag-file-card:hover { border-color: var(--border-hover); }
		.ag-file-icon {
			width: 38px; height: 38px; border-radius: 8px;
			background: var(--warning-soft); color: var(--warning);
			display: flex; align-items: center; justify-content: center; flex-shrink: 0;
		}
		.ag-file-icon svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.6; }
		.ag-file-info { min-width: 0; flex: 1; }
		.ag-file-name { font-size: 13px; font-weight: 600; color: var(--fg); }
		.ag-file-desc { font-size: 11px; color: var(--muted); margin-top: 2px; }

		/* ── List empty state ── */
		.ag-list-empty {
			padding: 40px 20px; text-align: center; color: var(--muted); font-size: 13px; line-height: 1.7;
		}
		.ag-list-empty-icon {
			width: 48px; height: 48px; margin: 0 auto 12px;
			border-radius: 8px; background: var(--surface);
			display: flex; align-items: center; justify-content: center;
		}
		.ag-list-empty-icon svg { width: 24px; height: 24px; stroke: var(--muted); fill: none; stroke-width: 1.5; }
		.ag-list-empty-title { font-size: 14px; font-weight: 600; color: var(--fg-secondary); margin-bottom: 4px; }

		/* ── Mobile ── */
		.ag-mobile-back { display: none !important; }
		/* ── Home-inspired cockpit polish ── */
		body[data-standalone-theme="cockpit"] {
			--bg: transparent;
			--surface: rgba(16, 24, 44, 0.50);
			--surface-elevated: rgba(12, 18, 34, 0.72);
			--sidebar: rgba(8, 13, 28, 0.66);
			--bg-input: rgba(4, 9, 20, 0.72);
			--border: rgba(116, 176, 255, 0.12);
			--border-strong: rgba(201, 210, 255, 0.24);
			--border-hover: rgba(201, 210, 255, 0.24);
			--primary: #C9D2FF;
			--primary-hover: #E3E8FF;
			--primary-soft: rgba(201, 210, 255, 0.08);
			--primary-glow: rgba(96, 194, 255, 0.16);
			--accent-violet: #60C2FF;
		}

		body[data-standalone-theme="cockpit"] .ag-stats,
		body[data-standalone-theme="cockpit"] .ag-main {
			position: relative;
			z-index: 1;
		}

		body[data-standalone-theme="cockpit"] .ag-stat-card,
		body[data-standalone-theme="cockpit"] .ag-sidebar,
		body[data-standalone-theme="cockpit"] .ag-detail,
		body[data-standalone-theme="cockpit"] .ag-card {
			background: rgba(16, 24, 44, 0.50);
			border-color: rgba(116, 176, 255, 0.12);
			box-shadow: none;
			backdrop-filter: blur(16px);
		}

		body[data-standalone-theme="cockpit"] .ag-agent-item,
		body[data-standalone-theme="cockpit"] .ag-status-mini,
		body[data-standalone-theme="cockpit"] .ag-skill-item,
		body[data-standalone-theme="cockpit"] .ag-file-card {
			background: rgba(16, 24, 44, 0.42);
			border-color: rgba(116, 176, 255, 0.08);
		}

		body[data-standalone-theme="cockpit"] .ag-agent-item:hover,
		body[data-standalone-theme="cockpit"] .ag-agent-item.selected {
			background: rgba(201, 210, 255, 0.07);
			border-color: rgba(201, 210, 255, 0.24);
			box-shadow: 0 0 22px rgba(96, 194, 255, 0.08);
		}

		body[data-standalone-theme="cockpit"] .ag-stat-card:hover,
		body[data-standalone-theme="cockpit"] .ag-card:hover {
			border-color: rgba(201, 210, 255, 0.20);
			box-shadow: 0 0 22px rgba(96, 194, 255, 0.07);
		}

		body[data-standalone-theme="cockpit"] .ag-btn--primary {
			background: linear-gradient(135deg, rgba(201, 210, 255, 0.96), rgba(96, 194, 255, 0.88));
			color: #020611;
			box-shadow: 0 8px 24px rgba(96, 194, 255, 0.16);
		}

		[data-theme="light"] body[data-standalone-theme="cockpit"] {
			--surface: rgba(255, 255, 255, 0.72);
			--surface-elevated: rgba(248, 250, 255, 0.82);
			--sidebar: rgba(244, 247, 253, 0.76);
			--bg-input: rgba(255, 255, 255, 0.82);
			--border: rgba(24, 69, 119, 0.09);
			--border-strong: rgba(24, 69, 119, 0.16);
			--border-hover: rgba(26, 101, 210, 0.22);
			--primary: #304170;
			--primary-hover: #1F5FC8;
			--primary-soft: rgba(26, 101, 210, 0.08);
			--primary-glow: rgba(26, 101, 210, 0.10);
			--accent-violet: #1F7AC8;
		}

		[data-theme="light"] body[data-standalone-theme="cockpit"] .ag-stat-card,
		[data-theme="light"] body[data-standalone-theme="cockpit"] .ag-sidebar,
		[data-theme="light"] body[data-standalone-theme="cockpit"] .ag-detail,
		[data-theme="light"] body[data-standalone-theme="cockpit"] .ag-card,
		[data-theme="light"] body[data-standalone-theme="cockpit"] .ag-agent-item,
		[data-theme="light"] body[data-standalone-theme="cockpit"] .ag-status-mini,
		[data-theme="light"] body[data-standalone-theme="cockpit"] .ag-skill-item,
		[data-theme="light"] body[data-standalone-theme="cockpit"] .ag-file-card {
			background: rgba(255, 255, 255, 0.76);
			border-color: rgba(24, 69, 119, 0.09);
		}

		@media (max-width: 1024px) {
			.ag-stats { grid-template-columns: repeat(2, 1fr); }
			.ag-main { grid-template-columns: 300px minmax(0, 1fr); }
			.ag-skill-list { grid-template-columns: 1fr; }
		}
		@media (max-width: 768px) {
			.ag-stats { grid-template-columns: repeat(2, 1fr); padding: 12px; gap: 10px; }
			.ag-main { grid-template-columns: minmax(0, 1fr); padding: 0 12px 12px; }
			.ag-sidebar { display: none; border: none; border-radius: 0; }
			.ag-sidebar.mobile-visible { display: grid; }
			.ag-detail { display: none; }
			.ag-detail.mobile-visible { display: grid; }
			.ag-mobile-back { display: inline-flex !important; }
			.ag-detail-header { flex-direction: column; }
			.ag-detail-header-actions { width: 100%; }
			.ag-status-cards { grid-template-columns: repeat(2, 1fr); }
			.ag-detail-row { grid-template-columns: 1fr; }
			.ag-detail-row > .ag-detail-row-config,
			.ag-detail-row > .ag-card:nth-child(2) { grid-column: auto; }
			.sp-topbar { height: 48px; padding: 0 10px; }
			.sp-topbar-title { font-size: 15px; }
		}
		
			/* ── Editor (matches conn-editor pattern) ── */
			.ag-editor-root { display: grid; gap: 16px; }
			.ag-editor-error {
				padding: 10px 16px; border-radius: var(--radius-input);
				background: var(--danger-soft); border: 1px solid var(--danger);
				color: var(--danger); font-size: 12px; font-weight: 500;
			}
			.ag-editor-header {
				display: flex; align-items: flex-start; gap: 16px;
				padding: 20px 24px; border-radius: var(--radius-card);
				background: var(--surface-elevated); border: 1px solid var(--border);
			}
			.ag-editor-header-icon {
				width: 48px; height: 48px; border-radius: 8px;
				display: flex; align-items: center; justify-content: center; flex-shrink: 0;
			}
			.ag-editor-header-icon svg { width: 24px; height: 24px; }
			.ag-editor-header-text { flex: 1; min-width: 0; }
			.ag-editor-header-title { font-size: 22px; font-weight: 700; color: var(--fg); line-height: 1.2; }
			.ag-editor-header-sub { font-size: 13px; color: var(--muted); margin-top: 4px; }
			.ag-editor-section-card {
				padding: 20px; border-radius: var(--radius-card);
				background: var(--surface-elevated); border: 1px solid var(--border);
			}
			.ag-editor-section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
			.ag-editor-section-icon { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
			.ag-editor-section-icon svg { width: 14px; height: 14px; }
			.ag-editor-section-title { font-size: 15px; font-weight: 700; color: var(--fg); }
			.ag-editor-section-body { display: grid; gap: 16px; }
			.ag-editor-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
			.ag-editor-field { display: grid; gap: 8px; }
			.ag-editor-field > span:first-child { font-size: 13px; font-weight: 600; color: var(--fg-secondary); }
			.ag-editor-field > span:first-child .required { color: var(--danger); margin-left: 2px; }
			.ag-editor-field input, .ag-editor-field select, .ag-editor-field textarea {
				height: 40px; width: 100%; padding: 0 12px;
				border-radius: var(--radius-input); background: var(--bg-input);
				border: 1px solid var(--border); color: var(--fg);
				font-family: var(--font-sans); font-size: 14px;
				outline: none; transition: border-color 0.2s, box-shadow 0.2s; box-sizing: border-box;
			}
			.ag-editor-field textarea { height: auto; padding: 12px; resize: vertical; min-height: 80px; line-height: 1.6; }
			.ag-editor-field input:hover, .ag-editor-field select:hover { border-color: var(--border-strong); }
			.ag-editor-field input:focus, .ag-editor-field select:focus, .ag-editor-field textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
			.ag-editor-field.is-error input, .ag-editor-field.is-error textarea { border-color: var(--danger); }
			.ag-editor-field input::placeholder, .ag-editor-field textarea::placeholder { color: var(--muted); }
			.ag-editor-field select {
				appearance: none;
				background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748B' d='M3 5l3 3 3-3'/%3E%3C/svg%3E");
				background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px;
			}
			.ag-editor-field .field-hint { font-size: 11px; color: var(--muted); }
			.ag-editor-actions {
				display: flex; justify-content: space-between; align-items: center;
				padding-top: 16px; margin-top: 16px; border-top: 1px solid var(--border);
			}
			.ag-editor-actions-right { font-size: 11px; color: var(--muted); }
			@media (max-width: 768px) { .ag-editor-form-grid { grid-template-columns: 1fr; } }

@media (max-width: 480px) {
			.ag-stats { grid-template-columns: repeat(2, 1fr); gap: 8px; }
			.ag-stat-card { padding: 14px 16px; min-height: 80px; }
			.ag-stat-card .ag-stat-num { font-size: 24px; }
			.ag-stat-icon { width: 36px; height: 36px; }
			.ag-stat-icon svg { width: 16px; height: 16px; }
		}

		/* ── Light theme overrides (hardcoded colors) ── */

		[data-theme="light"] .ag-detail-body::-webkit-scrollbar-thumb,
		[data-theme="light"] .ag-agent-list::-webkit-scrollbar-thumb,
		[data-theme="light"] .ag-skill-list::-webkit-scrollbar-thumb {
			background: #C4C9D6;
		}
		[data-theme="light"] .ag-detail-body::-webkit-scrollbar-thumb:hover,
		[data-theme="light"] .ag-agent-list::-webkit-scrollbar-thumb:hover,
		[data-theme="light"] .ag-skill-list::-webkit-scrollbar-thumb:hover {
			background: #A8B0C0;
		}

		[data-theme="light"] .ag-agent-item { background: #FFFFFF; }
		[data-theme="light"] .ag-agent-item:hover { background: #F0F2F8; }

		[data-theme="light"] .ag-stat-card--violet .ag-stat-num { color: #7C3AED; }
		[data-theme="light"] .ag-stat-card--violet .ag-stat-icon { background: rgba(124, 58, 237, 0.10); }

		[data-theme="light"] .ag-badge--custom { color: #7C3AED; background: rgba(124, 58, 237, 0.10); }

		[data-theme="light"] .ag-skill-icon { background: rgba(124, 58, 237, 0.10); color: #7C3AED; }
		[data-theme="light"] .ag-skill-location {
			background: rgba(20, 32, 51, 0.035);
			border-color: rgba(24, 69, 119, 0.12);
		}
		[data-theme="light"] .ag-skill-location--system { color: #315AA6; border-color: rgba(49, 90, 166, 0.18); }
		[data-theme="light"] .ag-skill-location--agent { color: #0F6F8E; border-color: rgba(15, 111, 142, 0.18); }

		[data-theme="light"] .ag-search-input {
			background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238896AB' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='M21 21l-4.35-4.35'/%3E%3C/svg%3E");
		}

		[data-theme="light"] .ag-skills-select {
			background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' stroke='%238896AB' stroke-width='1.4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
		}

		[data-theme="light"] .ag-editor-field select {
			background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238896AB' d='M3 5l3 3 3-3'/%3E%3C/svg%3E");
		}
	`;
}

function getAgentsPageJs(): string {
	return `
		const state = {
			agents: [],
			selectedId: null,
			searchQuery: "",
			filterTab: "all",
			skillsByAgentId: {},
			skillsLoadingAgentId: "",
			switchLoading: false,
			gallerySkills: [],
			editorMode: null,
			browserList: [],
			modelConfig: null,
			supportCatalogsLoaded: false,
			supportCatalogsLoading: false,
			supportCatalogsError: "",
			archivePendingId: "",
			removingSkillName: "",
			refreshingSkillName: "",
			refreshing: false,
			skillsExpanded: false,
			skillsLoadedByAgentId: {},
		};

		const FILTER_TABS = [
			{ id: "all", label: "全部" },
			{ id: "available", label: "可用" },
			{ id: "current", label: "当前" },
			{ id: "custom", label: "自定义" },
		];

		var ACTIVE_AGENT_KEY = "ugk-pi:active-agent-id";
		var supportCatalogsPromise = null;

		function readActiveAgentId() {
			try { return localStorage.getItem(ACTIVE_AGENT_KEY) || null; } catch { return null; }
		}

		function isAgentActive(agent) {
			return readActiveAgentId() === agent.agentId;
		}

		/* ── API ── */
		async function apiFetchAgents() {
			var results = await Promise.allSettled([
				fetchJson("/v1/agents"),
				fetchJson("/v1/agents/status").catch(function() { return { agents: [] }; }),
			]);
			var summaryList = results[0].status === "fulfilled" ? (Array.isArray(results[0].value.agents) ? results[0].value.agents : []) : [];
			var statusList = results[1].status === "fulfilled" ? (Array.isArray(results[1].value.agents) ? results[1].value.agents : []) : [];

			state.agents = summaryList.map(function(s) {
				var st = statusList.find(function(t) { return t.agentId === s.agentId; });
				return Object.assign({}, s, { runStatus: st ? st.status : "unknown" });
			});
		}

		async function apiFetchAgentSkills(agentId) {
			var data = await fetchJson("/v1/agents/" + agentId + "/skills");
			state.skillsByAgentId[agentId] = Array.isArray(data.skills) ? data.skills : [];
			state.skillsLoadedByAgentId[agentId] = true;
		}

		async function apiArchiveAgent(agentId) {
			await fetchJson("/v1/agents/" + agentId + "/archive", { method: "POST" });
		}

		async function apiRemoveSkill(agentId, skillName) {
			await fetchJson("/v1/agents/" + agentId + "/skills/" + encodeURIComponent(skillName), { method: "DELETE" });
		}

		async function apiRefreshSkill(agentId, skillName) {
			await fetchJson("/v1/agents/" + agentId + "/skills/" + encodeURIComponent(skillName) + "/refresh", { method: "POST" });
		}

		async function apiToggleSkill(agentId, skillName, enabled) {
				await fetchJson("/v1/agents/" + agentId + "/skills/" + encodeURIComponent(skillName), {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ enabled: enabled }),
				});
			}

			async function apiFetchGallerySkills() {
			try {
				var data = await fetchJson("/v1/agents/main/skills");
				state.gallerySkills = Array.isArray(data.skills) ? data.skills : [];
				state.skillsByAgentId.main = state.gallerySkills;
				state.skillsLoadedByAgentId.main = true;
			} catch {
				state.gallerySkills = [];
			}
		}

		async function loadSupportCatalogs() {
			if (state.supportCatalogsLoaded) return true;
			if (state.supportCatalogsLoading && supportCatalogsPromise) return supportCatalogsPromise;
			state.supportCatalogsLoading = true;
			state.supportCatalogsError = "";
			supportCatalogsPromise = Promise.allSettled([
				fetchJson("/v1/browsers"),
				fetchJson("/v1/model-config"),
			]).then(function(results) {
				var browserResult = results[0];
				var modelResult = results[1];
				var browsersOk = browserResult.status === "fulfilled";
				var modelOk = modelResult.status === "fulfilled" && modelResult.value;
				if (browsersOk) {
					state.browserList = Array.isArray(browserResult.value.browsers) ? browserResult.value.browsers : [];
				}
				state.modelConfig = modelOk ? modelResult.value : null;
				state.supportCatalogsLoaded = Boolean(browsersOk && modelOk);
				if (!state.supportCatalogsLoaded) {
					state.supportCatalogsError = "浏览器或模型配置加载失败，请重试。";
				}
				return state.supportCatalogsLoaded;
			}).finally(function() {
				state.supportCatalogsLoading = false;
				supportCatalogsPromise = null;
			});
			return supportCatalogsPromise;
		}

		async function apiCopySkill(agentId, skillName) {
			await fetchJson("/v1/agents/" + agentId + "/skills", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ skillName: skillName }),
			});
		}

		/* ── Filtering ── */
		function getFilteredAgents() {
			var q = (state.searchQuery || "").toLowerCase();
			var tab = state.filterTab;
			return state.agents.filter(function(a) {
				if (q) {
					var nameOk = (a.name || "").toLowerCase().indexOf(q) !== -1;
					var idOk = (a.agentId || "").toLowerCase().indexOf(q) !== -1;
					if (!nameOk && !idOk) return false;
				}
				if (tab === "all") return true;
				if (tab === "available") return a.agentId !== "main" && a.runStatus !== "archived";
				if (tab === "current") return isAgentActive(a);
				if (tab === "custom") return !a.isDefault;
				return true;
			});
		}

		function getSkillCountText(agentId) {
			var skills = state.skillsByAgentId[agentId];
			return Array.isArray(skills) ? String(skills.length) : "—";
		}
		function getCollapsedSkillSummary(agentId) {
			var skills = state.skillsByAgentId[agentId];
			if (!Array.isArray(skills)) return "点击查看技能列表";
			return skills.length + " 个技能";
		}

		function getStatCounts() {
			var total = state.agents.length;
			var active = state.agents.filter(function(a) { return isAgentActive(a); }).length;
			var skillsCount = getSkillCountText(state.selectedId);
			var browsers = new Set();
			state.agents.forEach(function(a) { if (a.defaultBrowserId) browsers.add(a.defaultBrowserId); });
			return { total: total, active: active, skills: skillsCount, browsers: browsers.size };
		}

		/* ── Rendering: Stats ── */
		function renderStats() {
			var c = getStatCounts();
			document.getElementById("ag-stat-total").textContent = c.total;
			document.getElementById("ag-stat-active").textContent = c.active;
			document.getElementById("ag-stat-skills").textContent = c.skills;
			document.getElementById("ag-stat-browsers").textContent = c.browsers;
		}

		/* ── Rendering: Filter tabs ── */
		function renderFilterTabs() {
			var container = document.getElementById("ag-filter-tabs");
			if (!container) return;
			container.innerHTML = "";
			FILTER_TABS.forEach(function(tab) {
				var btn = document.createElement("button");
				btn.type = "button";
				btn.className = "ag-filter-tab" + (state.filterTab === tab.id ? " active" : "");
				btn.textContent = tab.label;
				btn.addEventListener("click", function() {
					state.filterTab = tab.id;
					renderFilterTabs();
					renderAgentList();
				});
				container.appendChild(btn);
			});
		}

		/* ── Rendering: Agent list ── */
		function renderAgentList() {
			var container = document.getElementById("ag-agent-list");
			if (!container) return;
			container.innerHTML = "";
			var filtered = getFilteredAgents();
			if (filtered.length === 0) {
				container.innerHTML = '<div class="ag-list-empty"><div class="ag-list-empty-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M5.5 20v-1a6.5 6.5 0 0113 0v1"/></svg></div><div class="ag-list-empty-title">暂无匹配的 Agent</div><div>请尝试更换关键词或清除筛选条件。</div></div>';
				return;
			}
			filtered.forEach(function(agent) {
				var item = document.createElement("button");
				item.type = "button";
				item.className = "ag-agent-item" + (state.selectedId === agent.agentId ? " selected" : "");

				// Row: dot + name + badge
				var row = document.createElement("div");
				row.className = "ag-agent-item-row";

				var dot = document.createElement("span");
				var active = isAgentActive(agent);
				var isSelected = state.selectedId === agent.agentId;
				dot.className = "ag-agent-dot " + (active ? "ag-agent-dot--active" : isSelected ? "ag-agent-dot--viewing" : "ag-agent-dot--available");
				row.appendChild(dot);

				var title = document.createElement("span");
				title.className = "ag-agent-item-title";
				title.textContent = agent.name || agent.agentId;
				row.appendChild(title);

				var badge = document.createElement("span");
				if (active) {
					badge.className = "ag-agent-item-badge ag-agent-item-badge--active";
					badge.textContent = "激活";
				} else if (isSelected) {
					badge.className = "ag-agent-item-badge ag-agent-item-badge--viewing";
					badge.textContent = "查看中";
				} else {
					badge.className = "ag-agent-item-badge ag-agent-item-badge--available";
					badge.textContent = "可用";
				}
				row.appendChild(badge);
				item.appendChild(row);

				// Meta line
				var meta = document.createElement("div");
				meta.className = "ag-agent-item-meta";
				meta.textContent = agent.agentId + (agent.defaultBrowserId ? " · " + agent.defaultBrowserId : "");
				item.appendChild(meta);

				item.addEventListener("click", function() { selectAgent(agent.agentId); });
				container.appendChild(item);
			});
		}

		function getStatusBadge(agent) {
			if (isAgentActive(agent)) return { text: "当前激活", cls: "ag-badge--active" };
			if (agent.isDefault) return { text: "内置默认", cls: "ag-badge--default" };
			return { text: "自定义", cls: "ag-badge--custom" };
		}

		/* ── SVG icons ── */
		var SVG_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M5.5 20v-1a6.5 6.5 0 0113 0v1"/></svg>';
		var SVG_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';
		var SVG_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
		var SVG_MONITOR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="18" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
		var SVG_FILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
		var SVG_ACTIVITY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';
		var SVG_GRID = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>';

		/* ── Rendering: Detail body ── */
		function renderDetailBody() {
			var body = document.getElementById("ag-detail-body");
			var titleEl = document.getElementById("ag-detail-title");
			var actionsEl = document.getElementById("ag-detail-actions");
			if (!body) return;

			var agent = state.agents.find(function(a) { return a.agentId === state.selectedId; });
			if (!agent) {
				body.innerHTML = '<div class="ag-empty"><div class="ag-empty-icon">' + SVG_USER + '</div><h3>请选择一个 Agent</h3><p>从左侧列表选择 Agent 查看详情。</p></div>';
				delete body.dataset.agentId;
				if (titleEl) titleEl.textContent = "";
				if (actionsEl) actionsEl.innerHTML = "";
				return;
			}

			var status = getStatusBadge(agent);
			var active = isAgentActive(agent);

			ensureDetailShell(body, agent.agentId);
			renderDetailHeader(agent, status, active);
			renderDetailSummary(agent, status);
			renderDetailMiniStats(agent, status);
			renderDetailConfig(agent);
			renderSkillsPanel(agent);
		}

		function ensureDetailShell(body, agentId) {
			var hasShell = document.getElementById("ag-detail-header-region")
				&& document.getElementById("ag-detail-stats-region")
				&& document.getElementById("ag-detail-config-region")
				&& document.getElementById("ag-detail-skills-region");
			var sameAgent = body.dataset.agentId === agentId;
			var scrollTop = body.scrollTop || 0;
			if (!hasShell) {
				body.innerHTML =
					'<div id="ag-detail-header-region"></div>' +
					'<div id="ag-detail-stats-region"></div>' +
					'<div id="ag-detail-config-region"></div>' +
					'<div id="ag-detail-skills-region"></div>';
			}
			body.dataset.agentId = agentId;
			body.scrollTop = sameAgent ? scrollTop : 0;
		}

		function renderDetailHeader(agent, status, active) {
			var titleEl = document.getElementById("ag-detail-title");
			var actionsEl = document.getElementById("ag-detail-actions");
			if (titleEl) titleEl.textContent = agent.name || agent.agentId;
			if (!actionsEl) return;

			var acts = "";
			acts += '<button id="ag-btn-edit" class="ag-btn ag-btn--outline" type="button">编辑</button>';
			if (!active) {
				acts += '<button id="ag-btn-switch" class="ag-btn ag-btn--primary" type="button">切换到此 Agent</button>';
			}
			if (agent.agentId !== "main") {
				var archiving = state.archivePendingId === agent.agentId;
				acts += '<button id="ag-btn-archive" class="ag-btn ag-btn--danger" type="button"' + (archiving ? ' disabled' : '') + '>' + (archiving ? "归档中..." : "归档") + '</button>';
			}
			actionsEl.innerHTML = acts;

			var editBtn = document.getElementById("ag-btn-edit");
			if (editBtn) editBtn.onclick = openEditEditor;
			var switchBtn = document.getElementById("ag-btn-switch");
			if (switchBtn) switchBtn.onclick = handleSwitch;
			var archiveBtn = document.getElementById("ag-btn-archive");
			if (archiveBtn) archiveBtn.onclick = handleArchive;
		}

		function renderDetailSummary(agent, status) {
			var region = document.getElementById("ag-detail-header-region");
			if (!region) return;
			var html = "";
			html += '<div class="ag-card ag-detail-header">';
			html += '<div class="ag-detail-header-left">';
			html += '<div class="ag-detail-task-icon">' + SVG_USER + '</div>';
			html += '<div class="ag-detail-task-info">';
			html += '<h2 class="ag-detail-task-name">' + escapeHtml(agent.name || agent.agentId) + '</h2>';
			html += '<div class="ag-detail-meta">';
			html += '<span class="ag-badge ' + status.cls + '">' + status.text + '</span>';
			if (agent.description) {
				html += '<span style="font-size:12px;color:var(--muted)">' + escapeHtml(agent.description) + '</span>';
			}
			html += '</div></div></div>';
			html += '</div>';
			region.innerHTML = html;
		}

		function renderDetailMiniStats(agent, status) {
			var region = document.getElementById("ag-detail-stats-region");
			if (!region) return;
			var html = "";
			html += '<div class="ag-status-cards">';
			html += buildMiniCard("Agent ID", '<code>' + escapeHtml(agent.agentId) + '</code>', "var(--primary-soft)", "#6366F1", SVG_GRID);
			html += buildMiniCard("状态", status.text, status.cls === "ag-badge--active" ? "var(--success-soft)" : "var(--primary-soft)", status.cls === "ag-badge--active" ? "#22C55E" : "#6366F1", SVG_ACTIVITY);
			html += buildMiniCard("浏览器", agent.defaultBrowserId || "默认", "var(--warning-soft)", "#F59E0B", SVG_MONITOR);
			html += buildMiniCard("技能数", getSkillCountText(agent.agentId), "rgba(139,92,246,0.12)", "#8B5CF6", SVG_STAR);
			html += '</div>';
			region.innerHTML = html;
		}

		function renderDetailConfig(agent) {
			var region = document.getElementById("ag-detail-config-region");
			if (!region) return;
			var html = "";
			html += '<div class="ag-detail-row">';
			html += '<div class="ag-card ag-detail-row-config">';
			html += '<div class="ag-card-title"><span class="ag-card-title-icon" style="background:var(--primary-soft)">' + SVG_GRID + '</span>基础信息</div>';
			html += '<div class="ag-config-grid">';
			html += buildConfigItem("Agent ID", '<code>' + escapeHtml(agent.agentId) + '</code>', true);
			html += buildConfigItem("名称", escapeHtml(agent.name || "-"), false);
			html += buildConfigItem("默认浏览器", escapeHtml(agent.defaultBrowserId || "跟随系统默认"), false);
			html += buildConfigItem("默认模型", escapeHtml(agent.defaultModelProvider && agent.defaultModelId ? agent.defaultModelProvider + "/" + agent.defaultModelId : "跟随全局默认"), false);
			html += buildConfigItem("会话接口", '<code>/v1/agents/' + escapeHtml(agent.agentId) + '/chat/*</code>', true);
			html += '</div></div>';
			html += '<div class="ag-card">';
			html += '<div class="ag-card-title"><span class="ag-card-title-icon" style="background:var(--warning-soft)">' + SVG_FILE + '</span>规则文件</div>';
			html += '<div class="ag-file-card">';
			html += '<div class="ag-file-icon">' + SVG_FILE + '</div>';
			html += '<div class="ag-file-info"><div class="ag-file-name">AGENTS.MD</div><div class="ag-file-desc">Agent 运行时的规则与说明文件</div></div>';
			html += '<a class="ag-btn ag-btn--outline" href="/playground/agents/' + encodeURIComponent(agent.agentId) + '/rules" target="_blank">打开</a>';
			html += '</div></div>';
			html += '</div>';
			region.innerHTML = html;
		}

		function renderSkillsPanel(agent) {
			var region = document.getElementById("ag-detail-skills-region");
			if (!region) return;
			var body = document.getElementById("ag-detail-body");
			var scrollTop = body ? body.scrollTop : 0;
			var hasExpandedShell = !!region.querySelector("#ag-skill-list");
			var hasCollapsedShell = !!region.querySelector("#ag-btn-expand-skills");
			var html = "";
			if (state.skillsExpanded) {
				if (!hasExpandedShell) {
					html += '<div class="ag-card">';
					html += '<div class="ag-card-title"><span class="ag-card-title-icon" style="background:rgba(139,92,246,0.12)">' + SVG_STAR + '</span>技能<span style="margin-left:auto;font-size:11px;color:var(--muted)">仅展示 scoped 技能</span></div>';
					html += '<div class="ag-skills-toolbar">';
					html += '<select id="ag-skill-select" class="ag-skills-select"><option value="">选择要安装的技能...</option></select>';
					html += '<button id="ag-btn-copy-skill" class="ag-btn ag-btn--outline" type="button" disabled>复制安装</button>';
					html += '<button id="ag-btn-refresh-skills" class="ag-btn ag-btn--outline" type="button">刷新</button>';
					html += '</div>';
					html += '<div id="ag-skill-list" class="ag-skill-list"></div>';
					html += '</div>';
					region.innerHTML = html;
				}
				var copySkillBtn = document.getElementById("ag-btn-copy-skill");
				if (copySkillBtn) copySkillBtn.onclick = handleCopySkill;
				var refreshSkillsBtn = document.getElementById("ag-btn-refresh-skills");
				if (refreshSkillsBtn) refreshSkillsBtn.onclick = handleRefreshSkills;
				populateSkillSelect();
				renderSkillsList(agent.agentId);
			} else {
				if (!hasCollapsedShell) {
					html += '<div class="ag-card">';
					html += '<div class="ag-card-title"><span class="ag-card-title-icon" style="background:rgba(139,92,246,0.12)">' + SVG_STAR + '</span>技能<span style="margin-left:auto;font-size:11px;color:var(--muted)">仅展示 scoped 技能</span></div>';
					html += '<div class="ag-skills-collapsed">';
					html += '<span id="ag-skills-collapsed-summary" style="font-size:13px;color:var(--fg-secondary)"></span>';
					html += '<button id="ag-btn-expand-skills" class="ag-btn ag-btn--outline" type="button">查看技能</button>';
					html += '</div>';
					html += '</div>';
					region.innerHTML = html;
				}
				var summaryEl = document.getElementById("ag-skills-collapsed-summary");
				if (summaryEl) summaryEl.textContent = getCollapsedSkillSummary(agent.agentId);
				var expandBtn = document.getElementById("ag-btn-expand-skills");
				if (expandBtn) expandBtn.onclick = handleExpandSkills;
			}
			if (body) body.scrollTop = scrollTop;
		}

		function buildMiniCard(label, value, iconBg, iconColor, iconSvg) {
			return '<div class="ag-status-mini">' +
				'<div class="ag-status-mini-icon" style="background:' + iconBg + '">' +
				'<svg viewBox="0 0 24 24" fill="none" stroke="' + iconColor + '" stroke-width="1.8" stroke-linecap="round" style="width:18px;height:18px">' + iconSvg.replace(/<svg[^>]*>/, '').replace(/<\\/svg>/, '') + '</svg>' +
				'</div>' +
				'<div><div class="ag-status-mini-label">' + label + '</div>' +
				'<div class="ag-status-mini-value">' + value + '</div></div></div>';
		}

		function buildConfigItem(label, value, copyable) {
			var raw = value.replace(/<[^>]*>/g, '');
			return '<div class="ag-config-item">' +
				'<div class="ag-config-label">' + label + '</div>' +
				'<div class="ag-config-value">' + value +
				(copyable ? '<button class="ag-copy-btn" type="button" data-copy="' + escapeHtml(raw) + '"><svg viewBox="0 0 20 20"><rect x="7" y="4" width="10" height="13" rx="2"/><path d="M5 8H4a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2v-1"/></svg>复制</button>' : '') +
				'</div></div>';
		}

		function renderSkills() {
			renderSkillsList();
		}

		function compactSkillPath(path) {
			var normalized = String(path || "").replace(/\\\\/g, "/");
			var markers = [".data/agents/", ".pi/skills/", "runtime/skills-user/"];
			for (var i = 0; i < markers.length; i++) {
				var markerIndex = normalized.indexOf(markers[i]);
				if (markerIndex >= 0) return normalized.slice(markerIndex);
			}
			var parts = normalized.split("/").filter(Boolean);
			return parts.slice(-4).join("/") || "未记录路径";
		}

		function getSkillStorageMeta(skill) {
			var path = skill && (skill.path || skill.storageRoot) || "";
			var normalized = String(path || "").replace(/\\\\/g, "/");
			var kind = skill && skill.storageKind;
			if (kind !== "agent" && kind !== "system") {
				kind = normalized.indexOf("/user-skills/") >= 0 || normalized.indexOf("runtime/skills-user/") >= 0
					? "agent"
					: "system";
			}
			return {
				kind: kind,
				label: kind === "agent" ? "Agent 安装" : "系统技能",
				pathLabel: compactSkillPath(path),
				fullPath: path || "",
			};
		}

		function renderSkillsList(expectedAgentId) {
			var agentId = expectedAgentId || state.selectedId;
			if (!agentId || state.selectedId !== agentId) return;
			var container = document.getElementById("ag-skill-list");
			if (!container) return;
			var skills = state.skillsByAgentId[agentId];
			var agent = state.agents.find(function(a) { return a.agentId === agentId; });

			if (state.skillsLoadingAgentId === agentId) {
				container.innerHTML = '<div class="ag-empty ag-empty-sm" style="padding:24px"><p>加载中...</p></div>';
				return;
			}
			if (!state.skillsLoadedByAgentId[agentId] && !Array.isArray(skills)) {
				container.innerHTML = '<div class="ag-empty ag-empty-sm"><div class="ag-empty-icon">' + SVG_STAR + '</div><h3>技能加载失败</h3><p>请重试。</p></div>';
				return;
			}
			if (!Array.isArray(skills) || skills.length === 0) {
				container.innerHTML = '<div class="ag-empty ag-empty-sm"><div class="ag-empty-icon">' + SVG_STAR + '</div><h3>暂无 scoped 技能</h3><p>通过上方下拉选择技能并复制安装</p></div>';
				return;
			}
			container.innerHTML = "";
			skills.forEach(function(skill) {
				var name = skill.name || skill.skillName || "-";
				var isEnabled = skill.enabled !== false;
				var isRequired = Boolean(skill.required);
				var skillName = skill.name || skill.skillName || "";
				var storageMeta = getSkillStorageMeta(skill);

				var item = document.createElement("div");
				item.className = "ag-skill-item" + (isEnabled ? "" : " ag-skill-item--disabled");

				var toggle = document.createElement("button");
				toggle.type = "button";
				toggle.className = "ag-skill-toggle" + (isEnabled ? " ag-skill-toggle--on" : " ag-skill-toggle--off");
				toggle.setAttribute("role", "switch");
				toggle.setAttribute("aria-checked", isEnabled ? "true" : "false");
				toggle.textContent = isEnabled ? "开" : "关";
				toggle.disabled = isRequired;
				toggle.addEventListener("click", function() {
					if (agent && skillName) {
						var touchedAgentId = agent.agentId;
						toggle.disabled = true;
						apiToggleSkill(touchedAgentId, skillName, !isEnabled).then(function() {
							return apiFetchAgentSkills(touchedAgentId).then(function() {
								if (state.selectedId === touchedAgentId) {
									renderSkillsList(touchedAgentId);
									renderStats();
									var latestAgent = state.agents.find(function(a) { return a.agentId === touchedAgentId; });
									if (latestAgent) renderDetailMiniStats(latestAgent, getStatusBadge(latestAgent));
								}
							});
						}).catch(function(err) {
							if (state.selectedId === touchedAgentId) toggle.disabled = false;
							alert(err && err.message || "切换失败");
						});
					}
				});
				item.appendChild(toggle);

				var info = document.createElement("div");
				info.className = "ag-skill-info";
				var n = document.createElement("div");
				n.className = "ag-skill-name";
				n.textContent = name;
				if (isRequired) {
					var badge = document.createElement("span");
					badge.className = "ag-skill-required";
					badge.textContent = "必需";
					n.appendChild(document.createTextNode(" "));
					n.appendChild(badge);
				}
				var d = document.createElement("div");
				d.className = "ag-skill-meta";
				var locationBadge = document.createElement("span");
				locationBadge.className = "ag-skill-location ag-skill-location--" + storageMeta.kind;
				locationBadge.textContent = storageMeta.label;
				d.appendChild(locationBadge);
				var pathSpan = document.createElement("span");
				pathSpan.className = "ag-skill-path";
				pathSpan.textContent = storageMeta.pathLabel;
				if (storageMeta.fullPath) pathSpan.title = storageMeta.fullPath;
				d.appendChild(pathSpan);
				info.appendChild(n);
				info.appendChild(d);
				item.appendChild(info);

				if (agent && agent.agentId !== "main" && skill.skillName) {
					var actions = document.createElement("div");
					actions.className = "ag-skill-actions";
					var refreshBtn = document.createElement("button");
					refreshBtn.type = "button";
					refreshBtn.className = "ag-btn ag-btn--outline";
					refreshBtn.textContent = state.refreshingSkillName === skill.skillName ? "更新中..." : "更新";
					refreshBtn.disabled = state.refreshingSkillName === skill.skillName || state.removingSkillName === skill.skillName;
					refreshBtn.addEventListener("click", function() { handleRefreshSkillFromMain(skill.skillName); });
					actions.appendChild(refreshBtn);

					var delBtn = document.createElement("button");
					delBtn.type = "button";
					delBtn.className = "ag-btn ag-btn--danger";
					delBtn.textContent = state.removingSkillName === skill.skillName ? "删除中..." : "删除";
					delBtn.disabled = state.removingSkillName === skill.skillName || state.refreshingSkillName === skill.skillName;
					delBtn.addEventListener("click", function() { handleRemoveSkill(skill.skillName); });
					actions.appendChild(delBtn);
					item.appendChild(actions);
				}

				container.appendChild(item);
			});
		}

		function getGallerySkillSignature() {
			return state.gallerySkills.map(function(s) {
				var name = s.name || s.skillName || "";
				return name + ":" + (s.enabled === false ? "0" : "1");
			}).join("|");
		}

		function populateSkillSelect() {
			var sel = document.getElementById("ag-skill-select");
			if (!sel) return;
			var signature = getGallerySkillSignature();
			if (sel.dataset.gallerySignature === signature) return;
			var selectedValue = sel.value;
			while (sel.options.length > 1) sel.remove(1);
			var hasSelectedValue = false;
			state.gallerySkills.forEach(function(s) {
				var name = s.name || s.skillName || "";
				if (!name) return;
				var opt = document.createElement("option");
				opt.value = name;
				opt.textContent = name + (s.enabled === false ? "（主 Agent 已关闭）" : "");
				if (name === selectedValue) hasSelectedValue = true;
				sel.appendChild(opt);
			});
			sel.dataset.gallerySignature = signature;
			sel.value = hasSelectedValue ? selectedValue : "";
			sel.onchange = function() {
				var btn = document.getElementById("ag-btn-copy-skill");
				if (btn) btn.disabled = !sel.value;
			};
			var btn = document.getElementById("ag-btn-copy-skill");
			if (btn) btn.disabled = !sel.value;
		}

		/* ── Selection ── */
		function selectAgent(agentId) {
			state.editorMode = null;
			state.selectedId = agentId;
			state.skillsExpanded = false;
			renderAgentList();
			renderDetailBody();
			renderStats();
			// Mobile: show detail, hide sidebar
			var detail = document.querySelector(".ag-detail");
			var sidebar = document.querySelector(".ag-sidebar");
			if (detail) detail.classList.add("mobile-visible");
			if (sidebar) sidebar.classList.remove("mobile-visible");
		}

		/* ── Handlers ── */
		function handleSwitch() {
			var agent = state.agents.find(function(a) { return a.agentId === state.selectedId; });
			if (!agent || isAgentActive(agent)) return;
			localStorage.setItem("ugk-pi:active-agent-id", agent.agentId);
			window.location.href = "/playground";
		}

		async function handleArchive() {
			var agent = state.agents.find(function(a) { return a.agentId === state.selectedId; });
			if (!agent) return;
			var ok = await openConfirmDialog({
				title: "归档 Agent",
				message: '确定归档 "' + (agent.name || agent.agentId) + '"？归档后可在档案中恢复。',
				confirmLabel: "归档",
				tone: "danger",
			});
			if (!ok) return;
			state.archivePendingId = agent.agentId;
			renderDetailBody();
			try {
				await apiArchiveAgent(agent.agentId);
				if (state.selectedId === agent.agentId) state.selectedId = null;
				await apiFetchAgents();
				renderAgentList();
				renderDetailBody();
				renderStats();
				showToast("已归档", "ok");
			} catch (e) { showToast(e.message || "归档失败", "danger"); }
			finally {
				state.archivePendingId = "";
				renderDetailBody();
			}
		}

		async function handleRemoveSkill(skillName) {
			if (!state.selectedId || state.removingSkillName) return;
			var agentId = state.selectedId;
			state.removingSkillName = skillName;
			renderSkillsList(agentId);
			try {
				await apiRemoveSkill(agentId, skillName);
				await apiFetchAgentSkills(agentId);
				if (state.selectedId === agentId) {
					renderSkillsList(agentId);
					renderStats();
					var agent = state.agents.find(function(a) { return a.agentId === agentId; });
					if (agent) renderDetailMiniStats(agent, getStatusBadge(agent));
				}
				showToast("已移除 " + skillName, "ok");
			} catch (e) { showToast(e.message || "移除失败", "danger"); }
			finally {
				state.removingSkillName = "";
				if (state.selectedId === agentId) renderSkillsList(agentId);
			}
		}

		async function handleRefreshSkillFromMain(skillName) {
			if (!state.selectedId || state.refreshingSkillName) return;
			var agentId = state.selectedId;
			state.refreshingSkillName = skillName;
			renderSkillsList(agentId);
			try {
				await apiRefreshSkill(agentId, skillName);
				await apiFetchAgentSkills(agentId);
				if (state.selectedId === agentId) {
					renderSkillsList(agentId);
					renderStats();
					var agent = state.agents.find(function(a) { return a.agentId === agentId; });
					if (agent) renderDetailMiniStats(agent, getStatusBadge(agent));
				}
				showToast("已从主 Agent 更新 " + skillName, "ok");
			} catch (e) { showToast(e.message || "更新失败", "danger"); }
			finally {
				state.refreshingSkillName = "";
				if (state.selectedId === agentId) renderSkillsList(agentId);
			}
		}

		async function handleCopySkill() {
			var sel = document.getElementById("ag-skill-select");
			if (!sel || !sel.value || !state.selectedId) return;
			var skillName = sel.value;
			var agentId = state.selectedId;
			var btn = document.getElementById("ag-btn-copy-skill");
			if (btn) { btn.disabled = true; btn.textContent = "安装中..."; }
			try {
				await apiCopySkill(agentId, skillName);
				await apiFetchAgentSkills(agentId);
				if (state.selectedId === agentId) {
					renderSkillsList(agentId);
					renderStats();
					var agent = state.agents.find(function(a) { return a.agentId === agentId; });
					if (agent) renderDetailMiniStats(agent, getStatusBadge(agent));
				}
				showToast("已安装 " + skillName, "ok");
			} catch (e) { showToast(e.message || "安装失败", "danger"); }
			finally {
				if (btn && state.selectedId === agentId) { btn.disabled = false; btn.textContent = "复制安装"; }
			}
		}

		async function handleRefreshSkills() {
			if (!state.selectedId) return;
			var agentId = state.selectedId;
			var btn = document.getElementById("ag-btn-refresh-skills");
			if (btn) { btn.disabled = true; btn.textContent = "刷新中..."; }
			state.skillsLoadingAgentId = agentId;
			renderSkillsList(agentId);
			try {
				await apiFetchAgentSkills(agentId);
				if (state.selectedId === agentId) {
					renderStats();
					var agent = state.agents.find(function(a) { return a.agentId === agentId; });
					if (agent) renderDetailMiniStats(agent, getStatusBadge(agent));
				}
				showToast("技能已刷新", "ok");
			} catch (e) { showToast(e.message || "刷新失败", "danger"); }
			finally {
				if (state.skillsLoadingAgentId === agentId) state.skillsLoadingAgentId = "";
				if (state.selectedId === agentId) renderSkillsList(agentId);
				if (btn && state.selectedId === agentId) { btn.disabled = false; btn.textContent = "刷新"; }
			}
		}


		function handleExpandSkills() {
			if (!state.selectedId) return;
			var agentId = state.selectedId;
			var agent = state.agents.find(function(a) { return a.agentId === agentId; });
			if (!agent) return;
			state.skillsExpanded = true;
			renderSkillsPanel(agent);
			if (state.skillsLoadedByAgentId[agentId]) {
				renderSkillsList(agentId);
				return;
			}
			state.skillsLoadingAgentId = agentId;
			renderSkillsList(agentId);
			apiFetchAgentSkills(agentId).then(function() {
				if (state.skillsLoadingAgentId === agentId) state.skillsLoadingAgentId = "";
				if (state.selectedId !== agentId) return;
				renderSkillsList(agentId);
				renderStats();
				var latestAgent = state.agents.find(function(a) { return a.agentId === agentId; });
				if (latestAgent) renderDetailMiniStats(latestAgent, getStatusBadge(latestAgent));
			}).catch(function(e) {
				if (state.skillsLoadingAgentId === agentId) state.skillsLoadingAgentId = "";
				if (state.selectedId === agentId) {
					renderSkillsList(agentId);
					showToast(e.message || "技能加载失败，请重试", "danger");
				}
			});
		}

		function mobileBackToList() {
			var detail = document.querySelector(".ag-detail");
			var sidebar = document.querySelector(".ag-sidebar");
			if (detail) detail.classList.remove("mobile-visible");
			if (sidebar) sidebar.classList.add("mobile-visible");
		}

		/* ── Editor mode ── */
		function normalizeAgentIdInput(value) {
			return String(value || "")
				.trim()
				.toLowerCase()
				.replace(/[\\s_./]+/g, "-")
				.replace(/[‐‑‒–—―－]+/g, "-")
				.replace(/[^a-z0-9-]/g, "-")
				.replace(/-+/g, "-")
				.replace(/^-|-$/g, "")
				.slice(0, 40)
				.replace(/^-|-$/g, "");
		}

		function deriveNextAgentId(name) {
			var existing = new Set(state.agents.map(function(agent) { return String(agent.agentId || ""); }));
			var base = normalizeAgentIdInput(name || "agent");
			if (!/^[a-z]/.test(base)) base = "agent";
			var next = base;
			var index = 2;
			while (existing.has(next) || next === "main" || next === "search") {
				next = base + "-" + index;
				index += 1;
			}
			return next;
		}

		function validateAgentIdInput(id) {
			if (!id) return "Agent ID 不能为空";
			if (!/^[a-z]/.test(id)) return "Agent ID 必须以英文小写字母开头";
			if (!/^[a-z][a-z0-9-]*$/.test(id)) return "Agent ID 只能包含英文小写字母、数字和半角连字符 -";
			return "";
		}

		function openCreateEditor() {
			state.editorMode = "create";
			state.selectedId = null;
			renderAgentList();
			loadSupportCatalogsForEditor(null);
		}

		function openEditEditor() {
			state.editorMode = "edit";
			var agent = state.agents.find(function(a) { return a.agentId === state.selectedId; });
			loadSupportCatalogsForEditor(agent);
		}

		function closeEditor() {
			state.editorMode = null;
			if (state.agents.length > 0 && !state.selectedId) {
				state.selectedId = state.agents[0].agentId;
			}
			renderAgentList();
			renderDetailBody();
		}

		function loadSupportCatalogsForEditor(agent) {
			var mode = agent ? "edit" : "create";
			var agentId = agent ? agent.agentId : null;
			var loading = state.supportCatalogsLoaded ? null : loadSupportCatalogs();
			renderEditorForm(agent);
			if (!loading) return;
			loading.then(function() {
				if (state.editorMode !== mode) return;
				if (mode === "edit" && state.selectedId !== agentId) return;
				var latestAgent = mode === "edit" ? state.agents.find(function(a) { return a.agentId === agentId; }) : null;
				renderEditorForm(latestAgent);
			});
		}

		function guardEditorSupportCatalogs() {
			if (state.supportCatalogsLoading || !state.supportCatalogsLoaded || !state.modelConfig) {
				showEditorError(state.supportCatalogsLoading
					? "浏览器和模型配置仍在加载，请稍后再保存。"
					: (state.supportCatalogsError || "浏览器或模型配置不可用，无法保存。"));
				return false;
			}
			return true;
		}

		function bindEditorModelProviderSelect() {
			var providerSel = document.getElementById("ed-model-provider");
			var modelSel = document.getElementById("ed-model-model");
			if (!providerSel || !modelSel || !state.modelConfig) return;
			providerSel.addEventListener("change", function() {
				var pid = providerSel.value;
				modelSel.innerHTML = '<option value="">跟随全局默认</option>';
				if (!pid) return;
				var prov = state.modelConfig.providers.find(function(p) { return p.id === pid; });
				if (!prov) return;
				prov.models.forEach(function(m) {
					var opt = document.createElement('option');
					opt.value = m.id;
					opt.textContent = m.name || m.id;
					modelSel.appendChild(opt);
				});
			});
		}

		function buildEditorModelPatch(isEdit) {
			if (!state.modelConfig) {
				showEditorError("模型配置不可用，无法保存默认模型设置。");
				return null;
			}
			var modelProvider = (document.getElementById("ed-model-provider") || {}).value || "";
			var modelModel = (document.getElementById("ed-model-model") || {}).value || "";
			if (!modelProvider && !modelModel) {
				return isEdit ? { defaultModelProvider: null, defaultModelId: null } : {};
			}
			if (!modelProvider || !modelModel) {
				showEditorError("默认模型提供商和默认模型需要同时选择，或都留空跟随全局默认。");
				return null;
			}
			return { defaultModelProvider: modelProvider, defaultModelId: modelModel };
		}

		function getBrowserLabel(browserId) {
			var normalized = String(browserId || "").trim();
			if (!normalized) return "跟随系统默认";
			var browser = state.browserList.find(function(b) { return b.browserId === normalized; });
			return browser ? ((browser.name || browser.browserId) + " · " + browser.browserId) : normalized;
		}

		async function confirmAgentBrowserChangeIfNeeded(agent, nextBrowserId) {
			var currentBrowserId = String((agent || {}).defaultBrowserId || "").trim();
			var normalizedNextBrowserId = String(nextBrowserId || "").trim();
			if (currentBrowserId === normalizedNextBrowserId) return true;
			return await openConfirmDialog({
				title: "确认变更默认浏览器",
				message:
					'Agent "' + ((agent || {}).name || (agent || {}).agentId || "") + '" 的默认浏览器将从 "' +
					getBrowserLabel(currentBrowserId) +
					'" 改为 "' +
					getBrowserLabel(normalizedNextBrowserId) +
					'"。后续新 run 会使用新的浏览器登录态。',
				confirmLabel: "确认变更",
			});
		}

		function renderEditorForm(agent) {
			var body = document.getElementById("ag-detail-body");
			var titleEl = document.getElementById("ag-detail-title");
			var actionsEl = document.getElementById("ag-detail-actions");
			if (!body) return;
			if (titleEl) titleEl.textContent = "";
			if (actionsEl) actionsEl.innerHTML = "";

			var isEdit = !!agent;
			var pageTitle = isEdit ? "编辑 Agent" : "新建 Agent";
			var pageSub = isEdit ? "修改 Agent 配置" : "配置新 Agent 信息";
			var supportCatalogsReady = state.supportCatalogsLoaded && !!state.modelConfig;
			var supportCatalogsLoading = state.supportCatalogsLoading && !supportCatalogsReady;
			var supportCatalogDisabled = supportCatalogsReady ? "" : " disabled";
			var supportCatalogHint = supportCatalogsLoading
				? '<span class="field-hint">正在加载浏览器和模型配置...</span>'
				: (!supportCatalogsReady ? '<span class="field-hint">' + escapeHtml(state.supportCatalogsError || "浏览器或模型配置暂不可用，无法保存。") + '</span>' : "");

			var browserOptions = state.browserList.map(function(b) {
				return '<option value="' + escapeHtml(b.browserId) + '"' + (isEdit && agent.defaultBrowserId === b.browserId ? ' selected' : '') + '>' + escapeHtml(b.browserId) + '</option>';
			}).join("");


			var isMainAgent = isEdit && agent.agentId === "main";
			var modelProviderOpts = "";
			var modelModelOpts = "";
			if (!isMainAgent && state.modelConfig) {
				var curProvider = isEdit && agent.defaultModelProvider ? agent.defaultModelProvider : '';
				var curModel = isEdit && agent.defaultModelId ? agent.defaultModelId : '';
				modelProviderOpts = '<option value="">跟随全局默认</option>';
				state.modelConfig.providers.forEach(function(p) {
					modelProviderOpts += '<option value="' + escapeHtml(p.id) + '"' + (curProvider === p.id ? ' selected' : '') + '>' + escapeHtml(p.name || p.id) + '</option>';
				});
				var selProv = curProvider ? state.modelConfig.providers.find(function(p) { return p.id === curProvider; }) : null;
				modelModelOpts = '<option value="">跟随全局默认</option>';
				if (selProv) {
					selProv.models.forEach(function(m) {
						modelModelOpts += '<option value="' + escapeHtml(m.id) + '"' + (curModel === m.id ? ' selected' : '') + '>' + escapeHtml(m.name || m.id) + '</option>';
					});
				}
			} else if (!isMainAgent) {
				modelProviderOpts = '<option value="">' + (supportCatalogsLoading ? "加载中..." : "配置不可用") + '</option>';
				modelModelOpts = '<option value="">' + (supportCatalogsLoading ? "加载中..." : "配置不可用") + '</option>';
			}
			var idField = isEdit ? ""
				: '<div class="ag-editor-form-grid">'
				+ '<label class="ag-editor-field"><span>名称 <span class="required">*</span></span><input id="ed-name" autocomplete="off" placeholder="例如：代码审查员" /></label>'
				+ '<label class="ag-editor-field"><span>Agent ID <span class="required">*</span></span><input id="ed-id" autocomplete="off" placeholder="自动生成" /><span class="field-hint">会自动转换为小写字母、数字和半角连字符，创建后不可修改</span></label>'
				+ '</div>';
			var nameField = isEdit ? '<label class="ag-editor-field"><span>名称 <span class="required">*</span></span><input id="ed-name" autocomplete="off" value="' + escapeHtml(agent.name || "") + '" /></label>' : "";

			body.innerHTML = '<div class="ag-editor-root">'
				+ '<div id="editor-error" class="ag-editor-error" role="alert" hidden></div>'
				+ '<div class="ag-editor-header">'
				+ '<div class="ag-editor-header-icon" style="background:rgba(109,125,255,0.14)"><svg viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></div>'
				+ '<div class="ag-editor-header-text"><div class="ag-editor-header-title">' + pageTitle + '</div><div class="ag-editor-header-sub">' + pageSub + '</div></div>'
				+ '</div>'
				+ '<div class="ag-editor-section-card">'
				+ '<div class="ag-editor-section-head"><div class="ag-editor-section-icon" style="background:rgba(244,114,182,0.12)"><svg viewBox="0 0 24 24" fill="none" stroke="#F472B6" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div><div class="ag-editor-section-title">基本信息</div></div>'
				+ '<div class="ag-editor-section-body">'
				+ idField + nameField
				+ '<label class="ag-editor-field"><span>描述</span><textarea id="ed-desc" rows="3" placeholder="描述 Agent 的职责...">' + (isEdit ? escapeHtml(agent.description || "") : "") + '</textarea></label>'
				+ '<label class="ag-editor-field"><span>默认浏览器</span><select id="ed-browser"' + supportCatalogDisabled + '><option value="">跟随系统默认</option>' + browserOptions + '</select>' + supportCatalogHint + '</label>'
				+ '<label class="ag-editor-field"' + (isMainAgent ? ' style="display:none"' : '') + '><span>默认模型提供商</span><select id="ed-model-provider"' + supportCatalogDisabled + '>' + modelProviderOpts + '</select></label>'
				+ '<label class="ag-editor-field"' + (isMainAgent ? ' style="display:none"' : '') + '><span>默认模型</span><select id="ed-model-model"' + supportCatalogDisabled + '>' + modelModelOpts + '</select></label>'
				+ '</div></div>'
				+ '<div class="ag-editor-actions"><div><button id="ed-submit" class="ag-btn ag-btn--primary" type="button"' + supportCatalogDisabled + '>' + (isEdit ? "保存修改" : "创建 Agent") + '</button> <button id="ed-cancel" class="ag-btn ag-btn--outline" type="button">取消</button></div><div class="ag-editor-actions-right">' + (isEdit ? "agentId: " + escapeHtml(agent.agentId) : "") + '</div></div>'
				+ '</div>';

			document.getElementById("ed-submit").addEventListener("click", isEdit ? handleEditorUpdate : handleEditorCreate);
			document.getElementById("ed-cancel").addEventListener("click", closeEditor);
			bindEditorModelProviderSelect();

			if (!isEdit) {
				var nameInput = document.getElementById("ed-name");
				var idInput = document.getElementById("ed-id");
				if (nameInput && idInput) {
					nameInput.addEventListener("input", function() {
						if (!idInput.dataset.touched) idInput.value = deriveNextAgentId(nameInput.value);
					});
					idInput.addEventListener("input", function() { idInput.dataset.touched = "1"; });
					idInput.addEventListener("blur", function() { idInput.value = normalizeAgentIdInput(idInput.value); });
				}
			}
		}

		function showEditorError(msg) {
			var el = document.getElementById("editor-error");
			if (el) { el.textContent = msg; el.hidden = false; }
		}

		async function handleEditorCreate() {
			if (!guardEditorSupportCatalogs()) return;
			var name = (document.getElementById("ed-name") || {}).value || "";
			var rawId = (document.getElementById("ed-id") || {}).value || "";
			var id = normalizeAgentIdInput(rawId || deriveNextAgentId(name));
			var idInput = document.getElementById("ed-id");
			if (idInput) idInput.value = id;
			var desc = (document.getElementById("ed-desc") || {}).value || "";
			var browser = (document.getElementById("ed-browser") || {}).value || "";
			var modelPatch = buildEditorModelPatch(false);
			if (modelPatch === null) return;
			if (!name.trim()) { showEditorError("名称不能为空"); return; }
			var idError = validateAgentIdInput(id);
			if (idError) { showEditorError(idError); return; }
			if (["main","search"].indexOf(id) !== -1) { showEditorError("该 Agent ID 已被系统保留"); return; }
			var confirmed = await confirmAgentBrowserChangeIfNeeded({ agentId: id, name: name, defaultBrowserId: "" }, browser);
			if (!confirmed) return;
			var submitBtn = document.getElementById("ed-submit");
			if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "创建中..."; }
			try {
				await fetchJson("/v1/agents", {
					method: "POST",
					headers: {
						"content-type": "application/json",
						...(browser ? {
							"x-ugk-browser-binding-confirmed": "true",
							"x-ugk-browser-binding-source": "playground",
						} : {}),
					},
					body: JSON.stringify({ agentId: id, name: name, description: desc, defaultBrowserId: browser || undefined, ...modelPatch }),
				});
				state.editorMode = null;
				await apiFetchAgents();
				state.selectedId = id;
				renderAgentList();
				renderDetailBody();
				renderStats();
				showToast("Agent " + name + " 已创建", "ok");
			} catch (e) {
				showEditorError(e.message || "创建失败");
				if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "创建 Agent"; }
			}
		}

		async function handleEditorUpdate() {
			if (!guardEditorSupportCatalogs()) return;
			var agent = state.agents.find(function(a) { return a.agentId === state.selectedId; });
			if (!agent) return;
			var name = (document.getElementById("ed-name") || {}).value || "";
			var desc = (document.getElementById("ed-desc") || {}).value || "";
			var browser = (document.getElementById("ed-browser") || {}).value || "";
			var modelPatch = buildEditorModelPatch(true);
			if (modelPatch === null) return;
			if (!name.trim()) { showEditorError("名称不能为空"); return; }
			var browserChanged = String(agent.defaultBrowserId || "").trim() !== String(browser || "").trim();
			var confirmed = await confirmAgentBrowserChangeIfNeeded(agent, browser);
			if (!confirmed) return;
			var submitBtn = document.getElementById("ed-submit");
			if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "保存中..."; }
			try {
				await fetchJson("/v1/agents/" + agent.agentId, {
					method: "PATCH",
					headers: {
						"content-type": "application/json",
						...(browserChanged ? {
							"x-ugk-browser-binding-confirmed": "true",
							"x-ugk-browser-binding-source": "playground",
						} : {}),
					},
					body: JSON.stringify({ name: name, description: desc, defaultBrowserId: browser || null, ...modelPatch }),
				});
				state.editorMode = null;
				await apiFetchAgents();
				renderAgentList();
				renderDetailBody();
				renderStats();
				showToast("已保存", "ok");
			} catch (e) {
				showEditorError(e.message || "保存失败");
				if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "保存修改"; }
			}
		}

		async function handleRefresh() {
			if (state.refreshing) return;
			var btn = document.getElementById("btn-refresh");
			state.refreshing = true;
			if (btn) { btn.disabled = true; btn.textContent = "刷新中"; }
			try {
				await apiFetchAgents();
				await apiFetchGallerySkills();
				renderAgentList();
				renderFilterTabs();
				renderDetailBody();
				renderStats();
				showToast("已刷新", "ok");
			} catch (e) {
				showToast(e.message || "刷新失败", "danger");
			} finally {
				state.refreshing = false;
				if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>'; }
			}
		}

		/* ── Copy event delegation ── */
		document.addEventListener("click", function(e) {
			var btn = e.target.closest(".ag-copy-btn");
			if (!btn) return;
			var val = btn.getAttribute("data-copy") || "";
			var orig = btn.innerHTML;
			try {
				var ta = document.createElement("textarea");
				ta.value = val;
				ta.style.position = "fixed"; ta.style.opacity = "0";
				document.body.appendChild(ta);
				ta.select();
				document.execCommand("copy");
				ta.remove();
				btn.innerHTML = '<svg viewBox="0 0 20 20" style="width:12px;height:12px"><polyline points="3 12 8 17 17 6" stroke-width="2.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>已复制';
				setTimeout(function() { btn.innerHTML = orig; }, 1400);
			} catch {}
		});

		/* ── Init ── */
		async function init() {
			applyTheme(readStoredTheme());

			document.getElementById("btn-new-agent").addEventListener("click", openCreateEditor);
			document.getElementById("btn-refresh").addEventListener("click", handleRefresh);
			document.getElementById("mobile-back-btn").addEventListener("click", mobileBackToList);

			var searchInput = document.getElementById("ag-search");
			if (searchInput) {
				searchInput.addEventListener("input", debounce(function() {
					state.searchQuery = searchInput.value;
					renderAgentList();
				}, 200));
			}

			await Promise.all([apiFetchAgents(), apiFetchGallerySkills()]);
			renderFilterTabs();
			renderAgentList();
			renderStats();

			if (state.agents.length > 0 && !state.selectedId) {
				selectAgent(state.agents[0].agentId);
			}
		}

		document.addEventListener("DOMContentLoaded", init);
	`;
}

export function renderAgentsPage(): string {
	const css = getStandaloneBaseCss() + getAgentsPageCss();
	const js = getStandaloneBaseJs() + getAgentsPageJs();

	return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	${STANDALONE_THEME_INLINE_SCRIPT}
	<title>Agent 管理台 - UGK Claw</title>
	<link rel="icon" href="${STANDALONE_FAVICON}" />
	<style>${css}</style>
</head>
<body data-standalone-theme="cockpit">
	<div id="app">
		<header class="sp-topbar">
			<a class="sp-topbar-back" href="/playground?view=chat" title="返回">
				<svg viewBox="0 0 20 20" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4l-6 6 6 6"/></svg>
			</a>
			<strong class="sp-topbar-title">Agent 管理台</strong>
			<div class="sp-topbar-spacer"></div>
			<button id="btn-new-agent" class="sp-topbar-btn" type="button">
				<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
				新建 Agent
			</button>
			<button id="btn-refresh" class="sp-topbar-btn" type="button">
				<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
			</button>
			<button class="sp-topbar-btn" type="button" onclick="toggleTheme()" title="切换主题">
				<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/></svg>
			</button>
		</header>

		<section class="ag-stats">
			<div class="ag-stat-card ag-stat-card--blue">
				<div class="ag-stat-card-body">
					<div class="ag-stat-label">全部 Agent</div>
					<div class="ag-stat-num" id="ag-stat-total">0</div>
					<div class="ag-stat-desc">已配置数量</div>
				</div>
				<div class="ag-stat-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5.5 20v-1a6.5 6.5 0 0113 0v1"/></svg>
				</div>
			</div>
			<div class="ag-stat-card ag-stat-card--green">
				<div class="ag-stat-card-body">
					<div class="ag-stat-label">当前激活</div>
					<div class="ag-stat-num" id="ag-stat-active">0</div>
					<div class="ag-stat-desc">运行中的 Agent</div>
				</div>
				<div class="ag-stat-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				</div>
			</div>
			<div class="ag-stat-card ag-stat-card--amber">
				<div class="ag-stat-card-body">
					<div class="ag-stat-label">技能总数</div>
					<div class="ag-stat-num" id="ag-stat-skills">0</div>
					<div class="ag-stat-desc">当前 Agent 技能</div>
				</div>
				<div class="ag-stat-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
				</div>
			</div>
			<div class="ag-stat-card ag-stat-card--violet">
				<div class="ag-stat-card-body">
					<div class="ag-stat-label">可用浏览器</div>
					<div class="ag-stat-num" id="ag-stat-browsers">0</div>
					<div class="ag-stat-desc">已绑定实例</div>
				</div>
				<div class="ag-stat-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
				</div>
			</div>
		</section>

		<div class="ag-main">
			<aside class="ag-sidebar mobile-visible">
				<div class="ag-sidebar-toolbar">
					<input id="ag-search" class="ag-search-input" type="text" placeholder="搜索 Agent 名称或 ID..." autocomplete="off" />
				</div>
				<div id="ag-filter-tabs" class="ag-filter-tabs"></div>
				<div id="ag-agent-list" class="ag-agent-list"></div>
			</aside>

			<section class="ag-detail">
				<div class="ag-detail-head">
					<button id="mobile-back-btn" class="ag-mobile-back ag-btn ag-btn--outline" type="button" style="padding:0 10px">
						<svg viewBox="0 0 20 20" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2"><path d="M13 4l-6 6 6 6"/></svg>
					</button>
					<strong id="ag-detail-title" class="ag-detail-title"></strong>
					<div id="ag-detail-actions" class="ag-detail-actions"></div>
				</div>
				<div id="ag-detail-body" class="ag-detail-body"></div>
			</section>
		</div>
	</div>

	${renderStandaloneConfirmDialog()}
	${renderStandaloneToastContainer()}
	<script>${js}</script>
</body>
</html>`;
}
