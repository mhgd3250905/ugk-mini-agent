export function getConnPageCss(): string {
  return /* css */ `
    /* ── Design tokens ── */

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
      --cyan: #06B6D4;
      --cyan-soft: rgba(6, 182, 212, 0.14);
      --pink: #F472B6;
      --pink-soft: rgba(244, 114, 182, 0.14);
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
      --cyan: #0891B2;
      --cyan-soft: rgba(8, 145, 178, 0.10);
      --pink: #DB2777;
      --pink-soft: rgba(219, 39, 119, 0.10);
    }

    /* ── Scrollbar ── */

    .conn-detail-body::-webkit-scrollbar,
    .conn-list-items::-webkit-scrollbar,
    .conn-prompt-block::-webkit-scrollbar,
    .conn-run-result::-webkit-scrollbar {
      width: 6px;
    }

    .conn-detail-body::-webkit-scrollbar-track,
    .conn-list-items::-webkit-scrollbar-track,
    .conn-prompt-block::-webkit-scrollbar-track,
    .conn-run-result::-webkit-scrollbar-track {
      background: transparent;
    }

    .conn-detail-body::-webkit-scrollbar-thumb,
    .conn-list-items::-webkit-scrollbar-thumb,
    .conn-prompt-block::-webkit-scrollbar-thumb,
    .conn-run-result::-webkit-scrollbar-thumb {
      background: #263552;
      border-radius: 999px;
    }

    .conn-detail-body::-webkit-scrollbar-thumb:hover,
    .conn-list-items::-webkit-scrollbar-thumb:hover,
    .conn-prompt-block::-webkit-scrollbar-thumb:hover,
    .conn-run-result::-webkit-scrollbar-thumb:hover {
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

    /* ── Stats row ── */

    .conn-stats {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 16px;
      padding: 20px 24px;
    }

    .conn-stat-card {
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
      position: relative;
    }

    .conn-stat-card:hover {
      border-color: var(--border-hover);
      box-shadow: 0 0 20px rgba(99, 102, 241, 0.06);
    }

    .conn-stat-card-body {
      flex: 1;
      min-width: 0;
    }

    .conn-stat-card .label {
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 8px;
    }

    .conn-stat-card .value {
      font-size: 30px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }

    .conn-stat-card .desc {
      font-size: 11px;
      color: var(--muted);
      margin-top: 6px;
    }

    .conn-stat-icon {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .conn-stat-icon svg {
      width: 22px;
      height: 22px;
    }

    .conn-stat-card--blue .conn-stat-icon { background: var(--primary-soft); }
    .conn-stat-card--blue .value { color: var(--primary); }

    .conn-stat-card--green .conn-stat-icon { background: var(--success-soft); }
    .conn-stat-card--green .value { color: var(--success); }

    .conn-stat-card--amber .conn-stat-icon { background: var(--warning-soft); }
    .conn-stat-card--amber .value { color: var(--warning); }

    .conn-stat-card--red .conn-stat-icon { background: var(--danger-soft); }
    .conn-stat-card--red .value { color: var(--danger); }
    .conn-stat-card--violet .conn-stat-icon { background: rgba(139, 92, 246, 0.12); }
    .conn-stat-card--violet .value { color: #8B5CF6; }

    /* ── Main split ── */

    .conn-main {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      min-height: 0;
      overflow: hidden;
      padding: 0 24px 24px;
      gap: 16px;
    }

    .conn-list {
      grid-column: 1 / 2;
    }

    .conn-detail {
      grid-column: 2 / 6;
    }

    /* ── Left sidebar ── */

    .conn-list {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      background: var(--sidebar);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      overflow: hidden;
    }

    .conn-list-toolbar {
      padding: 16px 16px 12px;
    }

    .conn-search {
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

    .conn-search::placeholder { color: var(--muted); }

    .conn-search:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px var(--primary-soft);
    }

    /* ── Filter tabs (pill) ── */

    .conn-filter-tabs {
      display: flex;
      gap: 4px;
      padding: 0 12px 12px;
      flex-wrap: wrap;
    }

    .conn-filter-tab {
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
    }

    .conn-filter-tab:hover {
      background: var(--surface);
      color: var(--fg-secondary);
    }

    .conn-filter-tab.active {
      background: var(--primary);
      color: #fff;
    }

    .conn-list-items {
      overflow-y: auto;
      padding: 4px 8px 8px;
      min-height: 0;
    }

    /* ── List item (card) ── */

    .conn-list-item {
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
      transition: all 0.15s;
    }

    .conn-list-item:hover {
      background: #1A2440;
    }

    .conn-list-item.is-selected {
      background: var(--primary-soft);
      border-color: var(--primary);
      border-left: 3px solid var(--primary);
      padding-left: 13px;
      box-shadow: 0 0 16px rgba(99, 102, 241, 0.08);
    }

    .conn-list-item-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .conn-list-item-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      flex-shrink: 0;
    }

    .conn-list-item-dot--active { background: var(--success); box-shadow: 0 0 6px var(--success); }
    .conn-list-item-dot--paused { background: var(--warning); box-shadow: 0 0 6px rgba(245,158,11,0.35); }
    .conn-list-item-dot--completed { background: var(--muted); }
    .conn-list-item-dot--unknown { background: var(--muted); }

    .conn-list-item-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--fg);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }

    .conn-list-item-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 999px;
      white-space: nowrap;
    }

    .conn-list-item-badge--active { background: var(--success-soft); color: var(--success); }
    .conn-list-item-badge--paused { background: var(--warning-soft); color: var(--warning); }
    .conn-list-item-badge--completed { background: rgba(100,116,139,0.15); color: var(--muted); }
    .conn-list-item-badge--unknown { background: rgba(100,116,139,0.15); color: var(--muted); }
    /* Unread badge on list items */
    .conn-list-item-unread {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      margin-top: 6px;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 999px;
      white-space: nowrap;
      background: var(--danger);
      color: #fff;
      justify-content: center;
    }
    .conn-list-item.is-selected .conn-list-item-unread {
      background: rgba(255,77,109,0.7);
    }

    .conn-list-item-schedule {
      font-size: 11px;
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .conn-list-item-meta {
      font-size: 11px;
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ── List item editor actions ── */

    .conn-list-item-editor-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--border);
    }

    .conn-list-editor-btn {
      flex: 1;
      height: 32px;
      border-radius: var(--radius-btn);
      font-family: var(--font-sans);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      border: 1px solid transparent;
    }

    .conn-list-editor-btn--primary {
      background: linear-gradient(135deg, var(--primary), var(--accent-violet));
      color: #fff;
      box-shadow: 0 4px 12px var(--primary-glow);
    }

    .conn-list-editor-btn--primary:hover {
      filter: brightness(1.1);
    }

    .conn-list-editor-btn--cancel {
      background: transparent;
      color: var(--fg-secondary);
      border-color: var(--border);
    }

    .conn-list-editor-btn--cancel:hover {
      background: var(--surface-elevated);
      border-color: var(--border-strong);
    }

    .conn-list-footer {
      padding: 10px 16px;
      border-top: 1px solid var(--border);
      font-size: 11px;
      color: var(--muted);
      text-align: center;
    }

    .conn-list-empty {
      padding: 40px 20px;
      text-align: center;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.7;
    }

    .conn-list-empty-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 12px;
      border-radius: 8px;
      background: var(--surface);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .conn-list-empty-icon svg {
      width: 24px;
      height: 24px;
      stroke: var(--muted);
      fill: none;
      stroke-width: 1.5;
    }

    .conn-list-empty-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--fg-secondary);
      margin-bottom: 4px;
    }

    /* ── Right: detail panel ── */

    .conn-detail {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      overflow: hidden;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
    }

    .conn-detail-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      grid-auto-rows: 1fr;
      gap: 12px;
      margin-top: 20px;
      align-items: stretch;
    }

    .conn-detail-row > .conn-detail-row-config {
      grid-column: 1 / 3;
    }

    .conn-detail-row > .conn-card:nth-child(2) {
      grid-column: 3 / 5;
    }

    .conn-detail-row > .conn-card {
      display: flex;
      flex-direction: column;
      height: 100%;
      box-sizing: border-box;
    }

    .conn-detail-row > .conn-card > .conn-prompt-block {
      flex: 1;
    }

    .conn-detail-head {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }

    .conn-detail-title {
      font-size: 16px;
      font-weight: 700;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--fg);
    }

    .conn-detail-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* ── Buttons ── */

    .conn-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 36px;
      padding: 0 18px;
      border-radius: var(--radius-btn);
      font-family: var(--font-sans);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      border: 1px solid transparent;
      white-space: nowrap;
      gap: 6px;
    }

    .conn-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .conn-btn--primary {
      background: linear-gradient(135deg, var(--primary), var(--accent-violet));
      color: #fff;
      box-shadow: 0 4px 16px var(--primary-glow);
    }

    .conn-btn--primary:not(:disabled):hover {
      filter: brightness(1.1);
    }

    .conn-btn--outline {
      background: transparent;
      color: var(--fg-secondary);
      border-color: var(--border);
    }

    .conn-btn--outline:not(:disabled):hover {
      background: var(--surface-elevated);
      border-color: var(--border-strong);
      color: var(--fg);
    }

    .conn-btn--danger {
      background: transparent;
      color: var(--danger);
      border-color: var(--danger);
      opacity: 0.7;
    }

    .conn-btn--danger:not(:disabled):hover {
      background: var(--danger-soft);
      opacity: 1;
    }

    /* ── Detail body ── */

    .conn-detail-body {
      overflow-y: auto;
      padding: 20px;
      min-height: 0;
    }

    .conn-detail-empty {
      padding: 80px 24px;
      text-align: center;
    }

    .conn-detail-empty-icon {
      width: 56px;
      height: 56px;
      margin: 0 auto 16px;
      border-radius: 8px;
      background: var(--surface-elevated);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .conn-detail-empty-icon svg {
      width: 28px;
      height: 28px;
      stroke: var(--muted);
      fill: none;
      stroke-width: 1.5;
    }

    .conn-detail-empty h3 {
      font-size: 16px;
      font-weight: 600;
      color: var(--fg-secondary);
      margin: 0 0 4px;
    }

    .conn-detail-empty p {
      font-size: 13px;
      color: var(--muted);
      margin: 0;
    }

    /* ── Card module (shared) ── */

    .conn-card {
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      padding: 20px;
    }

    .conn-card + .conn-card {
      margin-top: 20px;
    }

    .conn-detail-row > .conn-card + .conn-card {
      margin-top: 0;
    }

    .conn-detail-row + .conn-card,
    .conn-card + .conn-detail-row {
      margin-top: 20px;
    }

    .conn-status-cards + .conn-card {
      margin-top: 20px;
    }

    .conn-card-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      font-weight: 700;
      color: var(--fg-secondary);
      margin-bottom: 16px;
    }

    .conn-card-title-icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .conn-card-title-icon svg {
      width: 14px;
      height: 14px;
    }

    /* ── Detail header card ── */

    .conn-detail-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .conn-detail-header-left {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      min-width: 0;
      flex: 1;
    }

    .conn-detail-task-icon {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      background: var(--primary-soft);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .conn-detail-task-icon svg {
      width: 22px;
      height: 22px;
      stroke: var(--primary);
      fill: none;
      stroke-width: 1.8;
    }

    .conn-detail-task-info {
      display: grid;
      gap: 6px;
      min-width: 0;
      padding-top: 2px;
    }

    .conn-detail-task-name {
      font-size: 20px;
      font-weight: 700;
      color: var(--fg);
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .conn-detail-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .conn-detail-schedule-summary {
      font-size: 12px;
      color: var(--muted);
    }

    .conn-detail-header-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
      flex-wrap: wrap;
    }

    /* ── Status badges (pill) ── */

    .conn-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 999px;
      white-space: nowrap;
    }

    .conn-badge--active { background: var(--success-soft); color: var(--success); }
    .conn-badge--paused { background: var(--warning-soft); color: var(--warning); }
    .conn-badge--completed { background: rgba(100,116,139,0.15); color: var(--muted); }
    .conn-badge--running { background: var(--primary-soft); color: var(--primary); animation: conn-pulse 2s ease-in-out infinite; }
    .conn-badge--succeeded { background: var(--success-soft); color: var(--success); }
    .conn-badge--failed { background: var(--danger-soft); color: var(--danger); }
    .conn-badge--cancelled { background: rgba(100,116,139,0.15); color: var(--muted); }
    .conn-badge--pending { background: rgba(100,116,139,0.15); color: var(--muted); }
    .conn-badge--unknown { background: rgba(100,116,139,0.15); color: var(--muted); }

    @keyframes conn-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* ── Status mini-cards row ── */

    .conn-status-cards {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-top: 16px;
    }

    .conn-status-mini {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-card-sm);
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 14px;
      min-height: 88px;
      min-width: 0;
    }

    .conn-status-mini-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .conn-status-mini-icon svg {
      width: 18px;
      height: 18px;
    }

    .conn-status-mini-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .conn-status-mini-value {
      font-size: 14px;
      font-weight: 600;
      color: var(--fg);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }

    .conn-status-mini-value code {
      font-family: var(--font-mono);
      font-size: 12px;
    }

    /* ── Config grid ── */

    .conn-config-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }

    .conn-config-item {
      display: grid;
      gap: 4px;
    }

    .conn-config-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
    }

    .conn-config-value {
      font-size: 13px;
      color: var(--fg-secondary);
      line-height: 1.5;
      word-break: break-all;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .conn-config-value code {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--primary);
      background: var(--bg-input);
      padding: 3px 10px;
      border-radius: 8px;
      border: 1px solid var(--border);
    }

    /* Copy button */
    .conn-copy-btn {
      background: none;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--muted);
      cursor: pointer;
      padding: 3px 8px;
      font-size: 11px;
      font-family: var(--font-sans);
      transition: all 0.15s;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }

    .conn-copy-btn:hover {
      color: var(--primary);
      border-color: var(--primary);
      background: var(--primary-soft);
    }

    .conn-copy-btn svg {
      width: 12px;
      height: 12px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
    }

    /* ── Prompt block ── */

    .conn-prompt-block {
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px 18px;
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.7;
      color: var(--fg-secondary);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 400px;
      overflow-y: auto;
    }

    /* ── Run history (timeline) ── */

    .conn-runs-toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    .conn-runs-toolbar button {
      padding: 5px 12px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
      font-family: var(--font-sans);
      cursor: pointer;
      transition: all 0.15s;
    }

    .conn-runs-toolbar button:hover {
      border-color: var(--border-strong);
      color: var(--fg-secondary);
    }

    .conn-runs-toolbar button.active {
      background: var(--primary-soft);
      border-color: var(--primary);
      color: var(--primary);
    }

    .conn-run-empty {
      padding: 40px 20px;
      text-align: center;
    }

    .conn-run-empty-icon {
      width: 44px;
      height: 44px;
      margin: 0 auto 12px;
      border-radius: 8px;
      background: var(--surface);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .conn-run-empty-icon svg {
      width: 22px;
      height: 22px;
      stroke: var(--muted);
      fill: none;
      stroke-width: 1.5;
    }

    .conn-run-empty h4 {
      font-size: 14px;
      font-weight: 600;
      color: var(--fg-secondary);
      margin: 0 0 4px;
    }

    .conn-run-empty p {
      font-size: 12px;
      color: var(--muted);
      margin: 0;
    }

    .conn-run-lazy {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
    }

    .conn-run-lazy--loading {
      background: var(--primary-soft);
      border-color: var(--primary);
    }

    .conn-run-lazy--error {
      background: var(--danger-soft);
      border-color: var(--danger);
    }

    .conn-run-lazy-main {
      min-width: 0;
      display: grid;
      gap: 6px;
    }

    .conn-run-lazy-eyebrow {
      font-size: 11px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
    }

    .conn-run-lazy-title {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .conn-run-lazy-time {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--muted);
      white-space: nowrap;
    }

    .conn-run-lazy-summary {
      font-size: 12px;
      line-height: 1.6;
      color: var(--fg-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .conn-run-lazy-error {
      font-size: 12px;
      color: var(--danger);
    }

    .conn-run-history-load {
      flex-shrink: 0;
      height: 34px;
      padding: 0 14px;
      border-radius: 8px;
      border: 1px solid var(--primary);
      background: var(--primary-soft);
      color: var(--primary);
      font-family: var(--font-sans);
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }

    .conn-run-history-load:hover:not(:disabled) {
      border-color: var(--primary-hover);
      color: var(--fg);
    }

    .conn-run-history-load:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .conn-run-lazy--error .conn-run-history-load {
      border-color: var(--danger);
      background: var(--danger-soft);
      color: var(--danger);
    }

    /* Timeline */
    .conn-run-timeline {
      position: relative;
      padding-left: 24px;
    }

    .conn-run-timeline::before {
      content: '';
      position: absolute;
      left: 7px;
      top: 4px;
      bottom: 4px;
      width: 2px;
      background: var(--border);
      border-radius: 1px;
    }

    .conn-run-tl-item {
      position: relative;
      margin-bottom: 16px;
    }

    .conn-run-tl-item:last-child {
      margin-bottom: 0;
    }

    .conn-run-tl-dot {
      position: absolute;
      left: -22px;
      top: 50%;
      transform: translateY(-50%);
      width: 12px;
      height: 12px;
      border-radius: 999px;
      border: 2px solid var(--border);
      background: var(--bg);
      z-index: 1;
    }

    .conn-run-tl-dot--succeeded { border-color: var(--success); background: var(--success); }
    .conn-run-tl-dot--failed { border-color: var(--danger); background: var(--danger); }
    .conn-run-tl-dot--running { border-color: var(--primary); background: var(--primary); animation: conn-pulse 2s ease-in-out infinite; }
    .conn-run-tl-dot--pending { border-color: var(--muted); }

    /* Unread timeline items: red dot */
    .conn-run-tl-item.is-unread .conn-run-tl-dot {
      border-color: var(--danger);
      background: var(--danger);
      z-index: 2;
    }
    .conn-run-tl-item.is-unread .conn-run-tl-card {
      border-color: rgba(255,77,109,0.4);
    }

    .conn-run-tl-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      transition: border-color 0.15s;
      cursor: pointer;
    }

    .conn-run-tl-card:hover {
      border-color: var(--border-strong);
    }

    .conn-run-tl-card.is-expanded {
      border-color: var(--primary);
    }

    .conn-run-tl-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
    }

    .conn-run-tl-time {
      font-size: 12px;
      font-family: var(--font-mono);
      color: var(--muted);
      white-space: nowrap;
    }

    .conn-run-tl-duration {
      font-size: 11px;
      color: var(--muted);
      font-family: var(--font-mono);
    }

    .conn-run-tl-summary {
      font-size: 12px;
      color: var(--fg-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }

    .conn-run-cancel-btn {
      height: 28px;
      padding: 0 12px;
      border-radius: 8px;
      border: 1px solid var(--danger);
      background: transparent;
      color: var(--danger);
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      flex-shrink: 0;
    }

    .conn-run-cancel-btn:not(:disabled):hover {
      background: var(--danger-soft);
    }

    .conn-run-cancel-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .conn-run-tl-detail {
      padding: 0 16px 16px;
      border-top: 1px solid var(--border);
      display: grid;
      gap: 12px;
      padding-top: 12px;
    }

    .conn-run-id-row {
      display: flex;
      align-items: center;
    }

    .conn-run-id-label {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--muted);
      background: var(--surface-elevated);
      padding: 3px 8px;
      border-radius: 8px;
      cursor: pointer;
      user-select: none;
      transition: color 0.15s;
      min-width: 270px;
      text-align: center;
    }

    .conn-run-id-label:hover {
      color: var(--primary);
    }

    .conn-run-id-label.is-copied {
      color: var(--success);
    }

    /* ── Run lifecycle ── */

    .conn-run-lifecycle {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
    }

    .conn-run-lifecycle-step {
      padding: 4px 10px;
      border-radius: 8px;
      background: var(--surface-elevated);
      color: var(--muted);
      font-weight: 600;
      font-size: 10px;
    }

    .conn-run-lifecycle-step.is-done { background: var(--success-soft); color: var(--success); }
    .conn-run-lifecycle-step.is-current { background: var(--primary-soft); border: 1px solid var(--primary); color: var(--primary); }

    .conn-run-lifecycle-arrow { color: var(--border-strong); font-size: 12px; }

    /* ── Run result ── */

    .conn-run-result {
      font-size: 12px;
      line-height: 1.7;
      word-break: break-word;
      max-height: 300px;
      overflow-y: auto;
      color: var(--fg-secondary);
    }
    .conn-run-result > :first-child { margin-top: 0; }
    .conn-run-result > :last-child { margin-bottom: 0; }
    .conn-run-result h1, .conn-run-result h2, .conn-run-result h3,
    .conn-run-result h4, .conn-run-result h5, .conn-run-result h6 {
      color: var(--fg);
      line-height: 1.25;
      letter-spacing: -0.02em;
      margin: 12px 0 6px;
    }
    .conn-run-result h1 { font-size: 18px; }
    .conn-run-result h2 { font-size: 15px; }
    .conn-run-result h3 { font-size: 13px; }
    .conn-run-result h4, .conn-run-result h5, .conn-run-result h6 { font-size: 12px; }
    .conn-run-result p { margin: 0 0 8px; }
    .conn-run-result ul, .conn-run-result ol { padding-left: 18px; margin: 0 0 8px; }
    .conn-run-result li + li { margin-top: 4px; }
    .conn-run-result strong { color: var(--fg); font-weight: 600; }
    .conn-run-result code {
      font-family: var(--font-mono);
      font-size: 11px;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(201,210,255,0.08);
    }
    .conn-run-result pre {
      padding: 10px 12px;
      border-radius: 6px;
      background: rgba(4,8,18,0.7);
      border: 1px solid var(--border);
      overflow-x: auto;
      margin: 0 0 8px;
    }
    .conn-run-result pre code { padding: 0; background: none; }
    .conn-run-result blockquote {
      margin: 0 0 8px;
      padding: 8px 12px;
      border-left: 3px solid var(--primary);
      background: rgba(201,210,255,0.04);
      color: var(--fg-secondary);
    }
    .conn-run-result table { width: 100%; border-collapse: collapse; margin: 0 0 8px; }
    .conn-run-result th, .conn-run-result td {
      padding: 6px 8px;
      border: 1px solid var(--border);
      text-align: left;
      font-size: 11px;
    }
    .conn-run-result th { background: rgba(201,210,255,0.06); font-weight: 600; color: var(--fg); }
    .conn-run-result a { color: var(--primary); text-decoration: none; }
    .conn-run-result a:hover { text-decoration: underline; }

    /* ── Run files ── */

    .conn-run-files {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .conn-run-files-heading {
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      width: 100%;
      margin-bottom: 4px;
    }

    .conn-run-file-link {
      display: inline-flex;
      align-items: center;
      font-size: 12px;
      padding: 6px 12px;
      border-radius: 8px;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--fg-secondary);
      text-decoration: none;
      font-family: var(--font-mono);
      transition: all 0.15s;
    }

    .conn-run-file-link:hover { color: var(--primary); border-color: var(--primary); }

    /* ── Run events ── */

    .conn-run-events { display: grid; gap: 4px; }

    .conn-run-events-heading {
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
    }

    .conn-run-event {
      padding: 8px 12px;
      border-radius: 8px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      display: grid;
      gap: 2px;
    }

    .conn-run-event code { font-size: 10px; color: var(--primary); }
    .conn-run-event-time { font-size: 10px; font-family: var(--font-mono); color: var(--muted); }
    .conn-run-event-body { font-family: var(--font-mono); font-size: 10px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .conn-run-load-more {
      font-family: var(--font-sans);
      font-size: 11px;
      padding: 6px 14px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--fg-secondary);
      cursor: pointer;
      transition: all 0.15s;
    }

    .conn-run-load-more:hover { color: var(--primary); border-color: var(--primary); }

    .conn-run-history-more {
      display: flex;
      margin: 14px auto 0;
    }

    .conn-run-history-more.is-loading {
      background: var(--primary-soft);
      border-color: var(--primary);
      color: var(--primary);
      cursor: wait;
    }

    /* ── Editor (inline in detail panel) ── */

    .conn-editor-root {
      display: grid;
      gap: 16px;
    }

    .conn-editor-error {
      padding: 10px 16px;
      border-radius: var(--radius-input);
      background: var(--danger-soft);
      border: 1px solid var(--danger);
      color: var(--danger);
      font-size: 12px;
      font-weight: 500;
    }

    .conn-editor-error .conn-field-error {
      font-size: 11px;
      color: var(--danger);
      margin-top: 4px;
    }

    .conn-editor-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 20px 24px;
      border-radius: var(--radius-card);
      background: var(--surface-elevated);
      border: 1px solid var(--border);
    }

    .conn-editor-header-icon {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .conn-editor-header-icon svg {
      width: 24px;
      height: 24px;
    }

    .conn-editor-header-text { flex: 1; min-width: 0; }

    .conn-editor-header-title {
      font-size: 22px;
      font-weight: 700;
      color: var(--fg);
      line-height: 1.2;
    }

    .conn-editor-header-sub {
      font-size: 13px;
      color: var(--muted);
      margin-top: 4px;
    }

    .conn-editor-section-card {
      padding: 20px;
      border-radius: var(--radius-card);
      background: var(--surface-elevated);
      border: 1px solid var(--border);
    }

    .conn-editor-section-head {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 18px;
    }

    .conn-editor-section-icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .conn-editor-section-icon svg {
      width: 14px;
      height: 14px;
    }

    .conn-editor-section-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--fg);
    }

    .conn-editor-section-body { display: grid; gap: 16px; }

    .conn-editor-form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .conn-editor-form-grid .conn-editor-field.full-width { grid-column: 1 / -1; }

    .conn-editor-field { display: grid; gap: 8px; }

    .conn-editor-section-card[hidden],
    .conn-editor-field[hidden],
    .conn-editor-team-group-preview[hidden] { display: none; }

    .conn-editor-field > span:first-child {
      font-size: 13px;
      font-weight: 600;
      color: var(--fg-secondary);
    }

    .conn-editor-field > span:first-child .required { color: var(--danger); margin-left: 2px; }

    .conn-editor-field input,
    .conn-editor-field select,
    .conn-editor-field textarea {
      height: 40px;
      width: 100%;
      padding: 0 12px;
      border-radius: var(--radius-input);
      background: var(--bg-input);
      border: 1px solid var(--border);
      color: var(--fg);
      font-family: var(--font-sans);
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
      box-sizing: border-box;
    }

    .conn-editor-field textarea {
      height: auto;
      padding: 12px;
      resize: vertical;
      min-height: 120px;
      line-height: 1.6;
      font-family: var(--font-mono);
      font-size: 13px;
    }

    .conn-editor-field input:hover,
    .conn-editor-field input.flatpickr-input:hover,
    .conn-editor-field select:hover,
    .conn-editor-field textarea:hover {
      border-color: var(--border-strong);
    }

    .conn-editor-field input:focus,
    .conn-editor-field select:focus,
    .conn-editor-field textarea:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px var(--primary-soft);
    }

    .conn-editor-field.is-error input,
    .conn-editor-field.is-error textarea {
      border-color: var(--danger);
    }

    .conn-editor-field.is-error input:focus,
    .conn-editor-field.is-error textarea:focus {
      box-shadow: 0 0 0 3px var(--danger-soft);
    }

    .conn-field-error {
      font-size: 11px;
      color: var(--danger);
    }

    .conn-editor-field input::placeholder,
    .conn-editor-field textarea::placeholder { color: var(--muted); }

    .conn-editor-field select {
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748B' d='M3 5l3 3 3-3'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: 32px;
    }

    .conn-editor-field .field-helper { font-size: 11px; color: var(--muted); }

    .conn-editor-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      color: var(--fg);
    }

    .conn-editor-toggle input[type="checkbox"] {
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: var(--primary);
      cursor: pointer;
      flex-shrink: 0;
    }

    .conn-editor-schedule-block,
    .conn-editor-target-block { display: grid; gap: 12px; }

    .conn-editor-schedule-block[hidden],
    .conn-editor-target-block[hidden] { display: none; }

    .conn-editor-hint { font-size: 11px; color: var(--muted); }

    .conn-editor-team-group-preview {
      display: grid;
      gap: 6px;
      padding: 10px 12px;
      border-radius: var(--radius-input);
      border: 1px solid var(--border);
      background: var(--bg-input);
      color: var(--fg-secondary);
      font-size: 12px;
      line-height: 1.5;
    }

    .conn-editor-team-group-preview strong { color: var(--fg); }
    .conn-editor-team-group-preview code { font-family: var(--font-mono); overflow-wrap: anywhere; }
    .conn-editor-target-note { color: var(--danger); }

    .conn-run-team-group {
      display: grid;
      gap: 6px;
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: var(--radius-input);
      border: 1px solid var(--border);
      background: var(--bg-card);
      color: var(--fg-secondary);
      font-size: 12px;
    }

    .conn-run-team-group code { font-family: var(--font-mono); color: var(--fg); overflow-wrap: anywhere; }

    .conn-editor-asset-chips { display: flex; flex-wrap: wrap; gap: 6px; }

    .conn-editor-form-actions {
      position: sticky;
      bottom: 0;
      z-index: 2;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 14px 0 2px;
      background: linear-gradient(to top, var(--bg) 68%, transparent);
    }

    .conn-editor-key-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: var(--radius-input);
      background: var(--success-soft);
      border: 1px solid rgba(34, 197, 94, 0.2);
      font-size: 12px;
      color: var(--fg-secondary);
    }

    .conn-editor-key-status .key-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 8px;
      background: rgba(34, 197, 94, 0.12);
      color: var(--success);
      font-family: var(--font-mono);
    }

    .conn-editor-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 16px;
      margin-top: 16px;
      border-top: 1px solid var(--border);
    }

    .conn-editor-actions-left { display: flex; gap: 10px; }

    .conn-editor-actions-right { font-size: 11px; color: var(--muted); }

    .conn-editor-actions button {
      height: 40px;
      padding: 0 22px;
      border-radius: 8px;
      font-family: var(--font-sans);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      border: 1px solid transparent;
    }

    .conn-editor-actions button#editor-submit {
      background: linear-gradient(135deg, var(--primary), var(--accent-violet));
      color: #fff;
      box-shadow: 0 8px 24px var(--primary-glow);
    }

    .conn-editor-actions button#editor-submit:hover { filter: brightness(1.1); }

    .conn-editor-actions button#editor-submit:disabled {
      filter: none;
      opacity: 0.4;
      cursor: not-allowed;
    }

    .conn-editor-actions button#editor-cancel {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg-secondary);
    }

    .conn-editor-actions button#editor-cancel:hover {
      border-color: var(--border-strong);
      background: var(--surface);
    }

    /* ── Flatpickr dark theme override ── */

    .flatpickr-calendar {
      background: var(--surface-elevated) !important;
      border: 1px solid var(--border) !important;
      border-radius: 12px !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4) !important;
      color: var(--fg) !important;
      padding: 8px !important;
    }

    .flatpickr-months .flatpickr-month,
    .flatpickr-current-month .flatpickr-monthDropdown-months {
      color: var(--fg) !important;
      fill: var(--fg) !important;
      font-weight: 700 !important;
    }

    .flatpickr-current-month input.cur-year {
      color: var(--fg) !important;
      font-weight: 700 !important;
    }

    span.flatpickr-weekday {
      color: var(--muted) !important;
      font-weight: 600 !important;
      font-size: 11px !important;
    }

    .flatpickr-day {
      color: var(--fg-secondary) !important;
      border-radius: 8px !important;
      transition: all 0.15s !important;
    }

    .flatpickr-day:hover {
      background: var(--primary-soft) !important;
      color: var(--fg) !important;
    }

    .flatpickr-day.selected,
    .flatpickr-day.startRange,
    .flatpickr-day.endRange,
    .flatpickr-day.selected.inRange {
      background: var(--primary) !important;
      color: #fff !important;
      border-color: var(--primary) !important;
    }

    .flatpickr-day.inRange {
      background: var(--primary-soft) !important;
      border-color: var(--primary-soft) !important;
    }

    .flatpickr-day.flatpickr-disabled {
      color: var(--muted) !important;
      opacity: 0.3;
    }

    .flatpickr-day.prevMonthDay,
    .flatpickr-day.nextMonthDay {
      color: var(--muted) !important;
    }

    .flatpickr-months .flatpickr-prev-month,
    .flatpickr-months .flatpickr-next-month {
      fill: var(--muted) !important;
      color: var(--muted) !important;
    }

    .flatpickr-months .flatpickr-prev-month:hover,
    .flatpickr-months .flatpickr-next-month:hover {
      fill: var(--fg-secondary) !important;
      color: var(--fg-secondary) !important;
    }

    .flatpickr-time {
      border-top: 1px solid var(--border) !important;
    }

    .flatpickr-time input,
    .flatpickr-time .flatpickr-time-separator {
      color: var(--fg) !important;
      font-weight: 600 !important;
    }

    .flatpickr-time input:hover,
    .flatpickr-time input:focus {
      background: var(--primary-soft) !important;
    }

    .flatpickr-time .flatpickr-am-pm {
      color: var(--fg-secondary) !important;
    }

    .flatpickr-time .flatpickr-am-pm:hover {
      background: var(--primary-soft) !important;
    }

    .flatpickr-monthDropdown-month {
      background: var(--surface-elevated) !important;
      color: var(--fg) !important;
    }

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

    body[data-standalone-theme="cockpit"] .conn-stats,
    body[data-standalone-theme="cockpit"] .conn-main {
      position: relative;
      z-index: 1;
    }

    body[data-standalone-theme="cockpit"] .conn-stat-card,
    body[data-standalone-theme="cockpit"] .conn-list,
    body[data-standalone-theme="cockpit"] .conn-detail,
    body[data-standalone-theme="cockpit"] .conn-card {
      background: rgba(16, 24, 44, 0.50);
      border-color: rgba(116, 176, 255, 0.12);
      box-shadow: none;
      backdrop-filter: blur(16px);
    }

    body[data-standalone-theme="cockpit"] .conn-list-item {
      background: rgba(16, 24, 44, 0.42);
      border-color: rgba(116, 176, 255, 0.08);
    }

    body[data-standalone-theme="cockpit"] .conn-list-item:hover,
    body[data-standalone-theme="cockpit"] .conn-list-item.is-selected {
      background: rgba(201, 210, 255, 0.07);
      border-color: rgba(201, 210, 255, 0.24);
      box-shadow: 0 0 22px rgba(96, 194, 255, 0.08);
    }

    body[data-standalone-theme="cockpit"] .conn-stat-card:hover,
    body[data-standalone-theme="cockpit"] .conn-card:hover {
      border-color: rgba(201, 210, 255, 0.20);
      box-shadow: 0 0 22px rgba(96, 194, 255, 0.07);
    }

    body[data-standalone-theme="cockpit"] .conn-btn--primary,
    body[data-standalone-theme="cockpit"] .conn-editor-actions button#editor-submit {
      background: linear-gradient(135deg, rgba(201, 210, 255, 0.96), rgba(96, 194, 255, 0.88));
      color: #020611;
      box-shadow: 0 8px 24px rgba(96, 194, 255, 0.16);
    }

    /* ── Mobile responsive ── */

    @media (max-width: 1024px) {
      .conn-detail-row {
        grid-template-columns: minmax(0, 1fr);
        margin-top: 20px;
      }
    }

    @media (max-width: 768px) {
      .conn-stats {
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        padding: 16px;
      }

      .conn-main {
        grid-template-columns: minmax(0, 1fr);
        padding: 0 16px 16px;
      }

      .conn-list { border-radius: var(--radius-card); }

      .conn-detail {
        border-radius: var(--radius-card);
      }

      .conn-list {
        display: none;
      }

      .conn-list.mobile-visible { display: grid; }
      .conn-list.is-hidden-mobile { display: none; }

      .conn-detail { display: none; }
      .conn-detail.mobile-visible { display: grid; }
      .conn-detail.is-hidden-mobile { display: none; }

      .conn-status-cards { grid-template-columns: repeat(2, 1fr); }
      .conn-config-grid { grid-template-columns: 1fr; }

      .conn-editor-form-grid { grid-template-columns: 1fr; }

      .conn-detail-header { flex-direction: column; }
      .conn-detail-header-actions { width: 100%; }

      .conn-run-lazy {
        align-items: stretch;
        flex-direction: column;
      }

      .conn-run-lazy-title {
        align-items: flex-start;
        flex-direction: column;
      }

      .conn-run-history-load {
        width: 100%;
      }

      #mobile-back-btn { display: inline-flex !important; }
    }

    /* ── Light theme overrides (hardcoded colors) ── */

    [data-theme="light"] .conn-detail-body::-webkit-scrollbar-thumb,
    [data-theme="light"] .conn-list-items::-webkit-scrollbar-thumb,
    [data-theme="light"] .conn-prompt-block::-webkit-scrollbar-thumb,
    [data-theme="light"] .conn-run-result::-webkit-scrollbar-thumb {
      background: #C4C9D6;
    }
    [data-theme="light"] .conn-detail-body::-webkit-scrollbar-thumb:hover,
    [data-theme="light"] .conn-list-items::-webkit-scrollbar-thumb:hover,
    [data-theme="light"] .conn-prompt-block::-webkit-scrollbar-thumb:hover,
    [data-theme="light"] .conn-run-result::-webkit-scrollbar-thumb:hover {
      background: #A8B0C0;
    }

    [data-theme="light"] .conn-list-item { background: #FFFFFF; }
    [data-theme="light"] .conn-list-item:hover { background: #F0F2F8; }

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

    [data-theme="light"] body[data-standalone-theme="cockpit"] .conn-stat-card,
    [data-theme="light"] body[data-standalone-theme="cockpit"] .conn-list,
    [data-theme="light"] body[data-standalone-theme="cockpit"] .conn-detail,
    [data-theme="light"] body[data-standalone-theme="cockpit"] .conn-card,
    [data-theme="light"] body[data-standalone-theme="cockpit"] .conn-list-item {
      background: rgba(255, 255, 255, 0.76);
      border-color: rgba(24, 69, 119, 0.09);
    }

    [data-theme="light"] .conn-stat-card--violet .value { color: #7C3AED; }
    [data-theme="light"] .conn-stat-card--violet .conn-stat-icon { background: rgba(124, 58, 237, 0.10); }

    [data-theme="light"] .conn-search {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238896AB' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='M21 21l-4.35-4.35'/%3E%3C/svg%3E");
    }

    [data-theme="light"] .conn-editor-field select {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238896AB' d='M3 5l3 3 3-3'/%3E%3C/svg%3E");
    }

    [data-theme="light"] .conn-run-result code { background: rgba(91, 91, 214, 0.08); }
    [data-theme="light"] .conn-run-result pre { background: rgba(0, 0, 0, 0.04); }
    [data-theme="light"] .conn-run-result blockquote { background: rgba(91, 91, 214, 0.04); }
    [data-theme="light"] .conn-run-result th { background: rgba(91, 91, 214, 0.06); }

    [data-theme="light"] .flatpickr-calendar {
      box-shadow: 0 8px 32px rgba(0,0,0,0.12) !important;
    }

    [data-theme="light"] .conn-list-item.is-selected .conn-list-item-unread {
      background: rgba(225, 29, 72, 0.8);
    }
  `;
}
