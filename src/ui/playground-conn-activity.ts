export function getConnRunDetailsStyles(): string {
	return `
		.conn-run-details-dialog[hidden] {
			display: none !important;
		}

		.conn-run-details-dialog {
			position: fixed;
			inset: 0;
			z-index: 72;
			display: none;
			align-items: flex-end;
			justify-content: center;
			padding: 18px;
			background: rgba(3, 5, 10, 0.58);
			backdrop-filter: none;
		}

		.conn-run-details-dialog.open {
			display: flex;
		}

		.conn-run-details-panel {
			width: min(720px, 100%);
			max-height: min(78vh, 640px);
			padding: 16px;
			border: 0;
			border-radius: 4px;
			background:
				linear-gradient(180deg, #121522 0%, #070914 42%, #04050d 100%),
				#060711;
			box-shadow: none;
			overflow: hidden;
		}

		.conn-run-details-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			margin-bottom: 12px;
		}

		.conn-run-details-head strong {
			color: rgba(247, 249, 255, 0.92);
			font-size: 13px;
			letter-spacing: 0.08em;
			text-transform: uppercase;
		}

		.conn-run-details-close {
			width: 32px;
			height: 32px;
			padding: 0;
			border: 0;
			border-radius: 4px;
			background: #171a28;
			color: rgba(238, 244, 255, 0.76);
		}

		.conn-run-details-body {
			display: grid;
			gap: 12px;
			max-height: calc(min(78vh, 640px) - 76px);
			overflow: auto;
			color: rgba(225, 232, 247, 0.76);
			font-size: 12px;
			line-height: 1.7;
		}

		.conn-run-section {
			display: grid;
			gap: 8px;
			padding: 12px;
			border: 0;
			border-radius: 4px;
			background: #0b0e19;
			box-shadow: none;
		}

		.conn-run-section code {
			overflow-wrap: anywhere;
			color: rgba(223, 230, 255, 0.78);
			font-family: var(--font-mono);
			font-size: 11px;
		}

		.conn-run-file-link {
			overflow-wrap: anywhere;
			color: #8fd6ff;
			font-family: var(--font-mono);
			font-size: 11px;
			text-decoration: none;
		}

		.conn-run-file-link:hover {
			text-decoration: underline;
		}

		.conn-run-file-link-secondary {
			color: rgba(143, 214, 255, 0.72);
		}

		.conn-run-result-bubble {
			gap: 12px;
			padding: 16px 18px;
			background: rgba(34, 38, 46, 0.72);
			color: #edf5ff;
		}

		.conn-run-result-bubble > strong {
			color: rgba(247, 249, 255, 0.84);
			font-size: 10px;
			font-weight: 650;
			letter-spacing: 0.12em;
			text-transform: uppercase;
		}

		.conn-run-result-bubble .message-content,
		.conn-run-result-bubble .message-content .code-block-language {
			color: #edf5ff;
		}

		.conn-run-result-bubble .message-content {
			font-size: 12px;
			line-height: 1.75;
		}

		.conn-run-result-bubble .message-content h1 {
			color: #ffffff;
			font-size: 18px;
			line-height: 1.35;
		}

		.conn-run-result-bubble .message-content h2 {
			color: #d7e5ff;
			font-size: 16px;
			line-height: 1.38;
		}

		.conn-run-result-bubble .message-content h3 {
			color: #bdf0df;
			font-size: 14px;
			line-height: 1.42;
		}

		.conn-run-result-bubble .message-content h4,
		.conn-run-result-bubble .message-content h5,
		.conn-run-result-bubble .message-content h6 {
			color: #ffdca8;
			font-size: 13px;
			line-height: 1.45;
		}

		.conn-run-result-bubble .message-content a {
			color: #8fd6ff;
			text-decoration-color: rgba(143, 214, 255, 0.42);
		}

		.conn-run-result-bubble .message-content strong {
			color: #fff4c7;
		}

		.conn-run-result-bubble .message-content code {
			color: #ffe6ad;
			background: rgba(255, 220, 168, 0.12);
		}

		.conn-run-result-bubble .message-content blockquote {
			border-left-color: rgba(128, 232, 198, 0.46);
			background: rgba(128, 232, 198, 0.08);
			color: rgba(223, 255, 244, 0.9);
		}

		.conn-run-result-bubble .message-content pre,
		.conn-run-result-bubble .message-content .code-block {
			background: rgba(7, 10, 18, 0.42);
			border-color: rgba(255, 220, 168, 0.16);
		}

		.conn-run-result-bubble .message-content th {
			color: #d7e5ff;
			background: rgba(143, 214, 255, 0.1);
		}

		.conn-run-result-bubble .message-content td {
			color: rgba(237, 245, 255, 0.84);
		}

		.conn-run-result-bubble .copy-code-button {
			color: rgba(237, 245, 255, 0.62);
		}

		.conn-run-event-list {
			display: grid;
			gap: 8px;
			margin: 0;
			padding: 0;
			list-style: none;
		}

		.conn-run-event {
			display: grid;
			gap: 4px;
			padding: 8px 0;
			border-top: 1px solid rgba(255, 255, 255, 0.06);
		}

		.conn-run-event:first-child {
			border-top: 0;
			padding-top: 0;
		}

		.conn-run-event span {
			color: rgba(226, 234, 255, 0.5);
			font-size: 10px;
		}

		.conn-run-event-load-state {
			color: rgba(226, 234, 255, 0.46);
			font-size: 11px;
			text-align: center;
		}

		:root[data-theme="light"] .conn-run-details-dialog {
			background: rgba(15, 23, 42, 0.24);
		}

		:root[data-theme="light"] .conn-run-details-panel {
			background: rgba(255, 255, 255, 0.96);
			color: #1f2937;
		}

		:root[data-theme="light"] .conn-run-details-head strong {
			color: #172033;
		}

		:root[data-theme="light"] .conn-run-details-close {
			background: rgba(229, 236, 248, 0.92);
			color: #34435f;
		}

		:root[data-theme="light"] .conn-run-details-body {
			color: #34435f;
		}

		:root[data-theme="light"] .conn-run-section {
			background: rgba(246, 249, 253, 0.96);
			border: 1px solid rgba(31, 95, 200, 0.1);
		}

		:root[data-theme="light"] .conn-run-section code {
			color: #24344f;
		}

		:root[data-theme="light"] .conn-run-event {
			border-top-color: rgba(31, 95, 200, 0.1);
		}

		:root[data-theme="light"] .conn-run-event span,
		:root[data-theme="light"] .conn-run-event-load-state {
			color: rgba(52, 67, 95, 0.68);
		}

		.conn-run-open-button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 28px;
			height: 28px;
			padding: 0;
			border: 0;
			background: transparent;
			box-shadow: none;
			color: rgba(226, 234, 255, 0.58);
		}

		.conn-run-open-button:hover:not(:disabled),
		.conn-run-open-button:focus-visible {
			background: transparent;
			box-shadow: none;
			color: rgba(247, 249, 255, 0.92);
			transform: none;
		}

	`;
}

export function getConnManagerActivityStyles(): string {
	return `

		.conn-manager-list,
		.conn-manager-run-list {
			display: grid;
			gap: 6px;
		}

		.conn-manager-item,
		.conn-manager-run-item {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 10px;
			align-items: center;
			border: 1px solid var(--line);
			background: rgba(16, 24, 44, 0.5);
			padding: 8px 10px;
			font-size: 11px;
			line-height: 1.5;
			color: var(--muted);
		}

		.conn-manager-actions button,
		.conn-manager-bulk-actions button,
		.conn-manager-run-actions button {
			padding: 6px 10px;
			font-size: 10px;
		}

		.conn-manager-item {
			grid-template-columns: auto minmax(0, 1fr);
			align-items: stretch;
			gap: 12px;
		}

		.conn-manager-select {
			display: inline-flex;
			align-items: flex-start;
			justify-content: center;
			padding-top: 2px;
		}

		.conn-manager-select input {
			width: 16px;
			height: 16px;
			accent-color: var(--accent);
		}

		.conn-manager-item.is-highlighted {
			border-color: rgba(141, 255, 178, 0.28);
			background: rgba(141, 255, 178, 0.055);
			box-shadow: none;
		}

		.conn-manager-notice {
			padding: 8px 10px;
			border: 1px solid rgba(141, 255, 178, 0.18);
			background: rgba(141, 255, 178, 0.06);
			color: rgba(218, 255, 230, 0.86);
			font-size: 11px;
			line-height: 1.55;
		}

		.conn-manager-notice[hidden] {
			display: none !important;
		}

		.conn-manager-toolbar {
			display: grid;
			grid-template-columns: minmax(150px, 1fr) auto auto;
			gap: 8px;
			align-items: center;
			padding: 8px 10px;
			border: 1px solid rgba(201, 210, 255, 0.1);
			background: transparent;
		}

		.conn-manager-filter-field {
			display: inline-grid;
			grid-template-columns: auto minmax(0, 1fr);
			gap: 8px;
			align-items: center;
			min-width: 0;
			color: rgba(226, 234, 255, 0.62);
			font-size: 11px;
		}

		.conn-manager-filter-field select {
			min-width: 0;
			min-height: 30px;
			border: 1px solid rgba(201, 210, 255, 0.14);
			border-radius: 4px;
			background: rgba(5, 7, 13, 0.92);
			color: rgba(244, 248, 255, 0.92);
			font: inherit;
			font-size: 11px;
			line-height: 1.4;
		}

		.conn-manager-selected-count {
			color: rgba(226, 234, 255, 0.56);
			font-family: var(--font-mono);
			font-size: 10px;
			white-space: nowrap;
		}

		.conn-manager-bulk-actions {
			display: flex;
			flex-wrap: wrap;
			justify-content: flex-end;
			gap: 6px;
		}

		.conn-manager-main {
			display: grid;
			gap: 8px;
			min-width: 0;
		}

		.conn-manager-title-row,
		.conn-manager-actions,
		.conn-manager-run-actions {
			display: flex;
			align-items: center;
			gap: 8px;
			flex-wrap: wrap;
		}

		.conn-manager-title-row strong {
			min-width: 0;
			overflow: hidden;
			color: rgba(246, 249, 255, 0.94);
			font-size: 13px;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.conn-manager-status {
			display: inline-flex;
			align-items: center;
			min-height: 20px;
			padding: 3px 7px;
			border: 1px solid rgba(201, 210, 255, 0.14);
			color: rgba(226, 234, 255, 0.72);
			font-family: var(--font-mono);
			font-size: 10px;
			line-height: 1;
			text-transform: uppercase;
		}

		.conn-manager-status.active {
			border-color: rgba(141, 255, 178, 0.3);
			background: rgba(64, 214, 126, 0.1);
			color: rgba(141, 255, 178, 0.9);
		}

		.conn-manager-status.paused {
			border-color: rgba(255, 209, 102, 0.3);
			background: rgba(255, 209, 102, 0.1);
			color: rgba(255, 209, 102, 0.92);
		}

		.conn-manager-status.completed {
			border-color: rgba(148, 163, 184, 0.22);
			background: rgba(148, 163, 184, 0.08);
			color: rgba(203, 213, 225, 0.72);
		}

		.conn-manager-meta {
			display: grid;
			gap: 5px;
			color: rgba(226, 234, 255, 0.58);
			font-size: 11px;
			line-height: 1.55;
		}

		.conn-manager-meta code,
		.conn-manager-run-item code {
			overflow-wrap: anywhere;
			color: rgba(223, 230, 255, 0.72);
			font-family: var(--font-mono);
			font-size: 10px;
		}

		.conn-manager-actions {
			grid-column: 2;
			justify-content: flex-end;
		}

		.conn-manager-actions .danger-action,
		.conn-manager-bulk-actions .danger-action {
			border-color: rgba(255, 113, 136, 0.18);
			color: rgba(255, 190, 202, 0.9);
		}

		.conn-manager-actions .danger-action:hover:not(:disabled),
		.conn-manager-actions .danger-action:focus-visible,
		.conn-manager-bulk-actions .danger-action:hover:not(:disabled),
		.conn-manager-bulk-actions .danger-action:focus-visible {
			border-color: rgba(255, 113, 136, 0.36);
			background: rgba(255, 113, 136, 0.08);
			color: rgba(255, 220, 226, 0.96);
		}

		.conn-manager-run-details {
			padding-top: 8px;
			border-top: 1px solid rgba(255, 255, 255, 0.06);
		}

		.conn-manager-run-summary {
			cursor: pointer;
			color: rgba(226, 234, 255, 0.66);
			font-size: 11px;
			line-height: 1.5;
			list-style-position: inside;
		}

		.conn-manager-run-details[open] .conn-manager-run-summary {
			margin-bottom: 8px;
		}

		.conn-manager-run-list {
			display: grid;
			gap: 6px;
		}

		.conn-manager-run-item {
			grid-template-columns: minmax(0, 1fr) auto;
			background: rgba(255, 255, 255, 0.025);
			padding: 7px 8px;
		}

		.conn-manager-run-copy {
			display: grid;
			gap: 3px;
			min-width: 0;
		}

		.conn-manager-run-copy span {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.conn-editor-panel {
			width: min(720px, calc(100vw - 28px));
		}

		.conn-editor-form {
			display: grid;
			min-height: 0;
		}

		.conn-editor-body {
			display: grid;
			gap: 12px;
		}

		.conn-editor-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 10px;
		}

		.conn-editor-field {
			display: grid;
			gap: 6px;
			min-width: 0;
			color: rgba(226, 234, 255, 0.62);
			font-size: 11px;
		}

		.conn-editor-field[hidden],
		.conn-editor-field.is-hidden,
		.conn-editor-grid.is-hidden,
		.conn-editor-advanced.is-hidden,
		.conn-editor-target-preview[hidden],
		.conn-editor-current-target[hidden],
		.conn-editor-error[hidden] {
			display: none !important;
		}

		.conn-editor-field span,
		.conn-editor-advanced summary {
			color: rgba(240, 245, 255, 0.78);
			font-size: 11px;
			font-weight: 600;
		}

		.conn-editor-field-hint,
		.conn-editor-section-hint {
			color: rgba(201, 210, 255, 0.56);
			font-size: 11px;
			line-height: 1.45;
		}

		.conn-editor-section-hint {
			margin: 0;
		}

		.conn-editor-field input,
		.conn-editor-field select,
		.conn-editor-field textarea {
			width: 100%;
			min-width: 0;
			border: 1px solid rgba(201, 210, 255, 0.14);
			border-radius: 4px;
			background: rgba(5, 7, 13, 0.92);
			color: rgba(244, 248, 255, 0.92);
			font: inherit;
			font-size: 12px;
			line-height: 1.45;
		}

		.conn-editor-field input,
		.conn-editor-field select {
			min-height: 36px;
			padding: 7px 9px;
		}

		.conn-editor-field .flatpickr-input,
		.conn-editor-field .flatpickr-input[readonly],
		.conn-editor-time-input + .flatpickr-input {
			cursor: pointer;
			caret-color: transparent;
		}

		.conn-editor-time-input + .flatpickr-input {
			border-color: rgba(101, 209, 255, 0.22);
			background:
				linear-gradient(135deg, rgba(101, 209, 255, 0.08), rgba(201, 210, 255, 0.035)),
				rgba(5, 7, 13, 0.94);
			color: rgba(246, 250, 255, 0.96);
			font-family: var(--font-mono);
			letter-spacing: 0.02em;
		}

		.conn-editor-time-input + .flatpickr-input::placeholder {
			color: rgba(201, 210, 255, 0.42);
			font-family: var(--font-sans);
			letter-spacing: 0;
		}

		.conn-time-picker-calendar {
			z-index: 1000;
			border: 1px solid rgba(101, 209, 255, 0.2);
			border-radius: 4px;
			background:
				radial-gradient(circle at 20% 0%, rgba(101, 209, 255, 0.12), transparent 35%),
				rgba(5, 7, 13, 0.98);
			box-shadow: none;
			color: rgba(238, 244, 255, 0.9);
			font-family: var(--font-sans);
		}

		.conn-time-picker-calendar::before,
		.conn-time-picker-calendar::after {
			border-bottom-color: rgba(5, 7, 13, 0.98);
		}

		.conn-time-picker-calendar.arrowBottom::before,
		.conn-time-picker-calendar.arrowBottom::after {
			border-top-color: rgba(5, 7, 13, 0.98);
		}

		.conn-time-picker-calendar .flatpickr-months,
		.conn-time-picker-calendar .flatpickr-weekdays,
		.conn-time-picker-calendar .flatpickr-time {
			background: transparent;
		}

		.conn-time-picker-calendar .flatpickr-month,
		.conn-time-picker-calendar .flatpickr-current-month,
		.conn-time-picker-calendar .flatpickr-weekday,
		.conn-time-picker-calendar .flatpickr-day,
		.conn-time-picker-calendar .numInput,
		.conn-time-picker-calendar .flatpickr-am-pm {
			color: rgba(238, 244, 255, 0.88);
		}

		.conn-time-picker-calendar .flatpickr-day {
			border-radius: 4px;
		}

		.conn-time-picker-calendar .flatpickr-day.today {
			border-color: rgba(101, 209, 255, 0.45);
		}

		.conn-time-picker-calendar .flatpickr-day.selected,
		.conn-time-picker-calendar .flatpickr-day.startRange,
		.conn-time-picker-calendar .flatpickr-day.endRange {
			border-color: rgba(101, 209, 255, 0.9);
			background: rgba(101, 209, 255, 0.22);
			color: rgba(246, 250, 255, 0.98);
		}

		.conn-time-picker-calendar .flatpickr-day:hover,
		.conn-time-picker-calendar .flatpickr-day:focus {
			border-color: rgba(201, 210, 255, 0.22);
			background: rgba(201, 210, 255, 0.1);
		}

		.conn-time-picker-calendar .flatpickr-day.flatpickr-disabled,
		.conn-time-picker-calendar .flatpickr-day.prevMonthDay,
		.conn-time-picker-calendar .flatpickr-day.nextMonthDay {
			color: rgba(226, 234, 255, 0.24);
		}

		.conn-time-picker-calendar .flatpickr-time {
			border-top: 1px solid rgba(201, 210, 255, 0.12);
		}

		.conn-time-picker-calendar .flatpickr-time input:hover,
		.conn-time-picker-calendar .flatpickr-time input:focus,
		.conn-time-picker-calendar .flatpickr-time .flatpickr-am-pm:hover,
		.conn-time-picker-calendar .flatpickr-time .flatpickr-am-pm:focus {
			background: rgba(201, 210, 255, 0.08);
		}

		.conn-time-picker-calendar-time-only {
			width: 220px;
		}

		.conn-editor-field textarea {
			resize: vertical;
			padding: 9px;
		}

		.conn-editor-current-target {
			display: block;
			overflow-wrap: anywhere;
			padding: 8px 10px;
			border: 1px solid rgba(201, 210, 255, 0.1);
			border-radius: 4px;
			background: rgba(255, 255, 255, 0.035);
			color: rgba(223, 230, 255, 0.72);
			font-family: var(--font-mono);
			font-size: 10px;
		}

		.conn-editor-assets-panel {
			display: grid;
			gap: 10px;
		}

		.conn-editor-assets-actions {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
		}

		.conn-editor-selected-assets {
			display: none;
			flex-wrap: wrap;
			gap: 8px;
		}

		.conn-editor-selected-assets.visible {
			display: flex;
		}

		.conn-editor-target-preview {
			display: grid;
			gap: 5px;
			padding: 10px 12px;
			border: 1px solid rgba(201, 210, 255, 0.12);
			border-radius: 4px;
			background: rgba(201, 210, 255, 0.055);
			color: rgba(226, 234, 255, 0.7);
			font-size: 11px;
			line-height: 1.55;
		}

		.conn-editor-target-preview strong {
			color: rgba(246, 249, 255, 0.94);
			font-size: 12px;
		}

		.conn-editor-target-preview code {
			overflow-wrap: anywhere;
			color: rgba(201, 210, 255, 0.82);
			font-family: var(--font-mono);
			font-size: 10px;
		}

		.conn-editor-target-note {
			color: rgba(255, 209, 102, 0.78);
		}

		.conn-editor-error {
			padding: 9px 10px;
			border: 1px solid rgba(255, 113, 136, 0.32);
			border-radius: 4px;
			background: rgba(255, 113, 136, 0.1);
			color: rgba(255, 190, 202, 0.96);
			font-size: 12px;
		}

		.conn-editor-advanced {
			display: grid;
			gap: 10px;
			padding-top: 4px;
		}

		.conn-editor-advanced summary {
			cursor: pointer;
			list-style-position: inside;
		}

	`;
}

export function getConnActivityDialogs(): string {
	return `
		<div id="conn-run-details-dialog" class="conn-run-details-dialog" aria-hidden="true" hidden>
			<section class="conn-run-details-panel" role="dialog" aria-modal="true" aria-labelledby="conn-run-details-title">
				<div class="conn-run-details-head">
					<strong id="conn-run-details-title">后台任务过程</strong>
					<button id="conn-run-details-close" class="conn-run-details-close" type="button" aria-label="关闭后台任务过程">×</button>
				</div>
				<div id="conn-run-details-body" class="conn-run-details-body"></div>
			</section>
		</div>
		<div id="conn-manager-dialog" class="asset-modal-shell conn-manager-dialog" aria-hidden="true" hidden>
			<section class="asset-modal conn-manager-panel" role="dialog" aria-modal="true" aria-labelledby="conn-manager-title">
				<header class="topbar asset-modal-head mobile-work-topbar">
					<div class="mobile-work-title-row">
						<button id="close-conn-manager-button" class="mobile-work-back-button" type="button" aria-label="返回对话">
							<span aria-hidden="true">&larr;</span>
						</button>
						<div class="asset-modal-copy">
							<strong id="conn-manager-title">后台任务</strong>
						</div>
					</div>
					<div class="asset-modal-actions mobile-work-topbar-actions">
						<button id="open-conn-editor-button" type="button">新建任务</button>
						<button id="refresh-conn-manager-button" type="button">刷新列表</button>
					</div>
				</header>
				<div class="asset-modal-body">
					<div class="conn-manager-toolbar">
						<label class="conn-manager-filter-field">
							<span>状态</span>
							<select id="conn-manager-filter">
								<option value="all">全部</option>
								<option value="active">运行中</option>
								<option value="paused">已暂停</option>
								<option value="completed">已完成</option>
							</select>
						</label>
						<span id="conn-manager-selected-count" class="conn-manager-selected-count">已选 0</span>
						<div class="conn-manager-bulk-actions">
							<button id="select-visible-conns-button" type="button">选择当前</button>
							<button id="clear-selected-conns-button" type="button">清空选择</button>
							<button id="delete-selected-conns-button" class="danger-action" type="button">删除所选</button>
						</div>
					</div>
					<div id="conn-manager-notice" class="conn-manager-notice" role="status" hidden></div>
					<div id="conn-manager-list" class="conn-manager-list" aria-live="polite"></div>
				</div>
			</section>
		</div>
		<div id="conn-editor-dialog" class="asset-modal-shell conn-editor-dialog" aria-hidden="true" hidden>
			<section class="asset-modal conn-editor-panel" role="dialog" aria-modal="true" aria-labelledby="conn-editor-title">
				<form id="conn-editor-form" class="conn-editor-form">
					<header class="topbar asset-modal-head mobile-work-topbar">
						<div class="mobile-work-title-row">
							<button id="close-conn-editor-button" class="mobile-work-back-button" type="button" aria-label="返回对话">
								<span aria-hidden="true">&larr;</span>
							</button>
							<div class="asset-modal-copy">
								<strong id="conn-editor-title">新建后台任务</strong>
								<span>设置结果发到哪里、什么时候执行；高级项按需展开。</span>
							</div>
						</div>
						<div class="asset-modal-actions mobile-work-topbar-actions">
							<button id="save-conn-editor-button" type="submit">保存</button>
							<button id="cancel-conn-editor-button" type="button">取消</button>
						</div>
					</header>
					<div class="asset-modal-body conn-editor-body">
						<div id="conn-editor-error" class="conn-editor-error" role="alert" hidden></div>
						<label class="conn-editor-field">
							<span>标题</span>
							<input id="conn-editor-title-input" name="title" autocomplete="off" required />
						</label>
						<label class="conn-editor-field">
							<span>执行对象</span>
							<select id="conn-editor-execution-type" name="executionType">
								<option value="agent_prompt">提示词任务</option>
								<option value="team_group">Team Group</option>
							</select>
							<small class="conn-editor-field-hint">Team Group 只能从后端已有 Group 中选择，不能填写单个 Task。</small>
						</label>
						<label id="conn-editor-team-group-row" class="conn-editor-field" hidden>
							<span>Team Group</span>
							<select id="conn-editor-team-group-id" name="teamGroupId"></select>
							<small id="conn-editor-team-group-hint" class="conn-editor-field-hint">请选择一个状态 valid 且未归档的 Group。</small>
						</label>
						<div id="conn-editor-team-group-preview" class="conn-editor-target-preview" hidden></div>
						<label class="conn-editor-field">
							<span>让它做什么</span>
							<textarea id="conn-editor-prompt" name="prompt" rows="5" required></textarea>
						</label>
						<div class="conn-editor-grid conn-editor-target-row">
							<label class="conn-editor-field">
								<span>结果发到哪里</span>
								<select id="conn-editor-target-type" name="targetType">
									<option value="task_inbox">任务消息</option>
									<option value="feishu_chat">飞书群</option>
									<option value="feishu_user">飞书用户</option>
								</select>
							</label>
							<label class="conn-editor-field">
								<span id="conn-editor-target-id-label">会话编号</span>
								<input id="conn-editor-target-id" name="targetId" autocomplete="off" />
								<small id="conn-editor-target-id-hint" class="conn-editor-field-hint">填要接收结果的会话编号；保存后不会跟着当前页面自动切换。</small>
							</label>
						</div>
						<code id="conn-editor-target-current" class="conn-editor-current-target"></code>
						<div id="conn-editor-target-preview" class="conn-editor-target-preview" aria-live="polite"></div>
						<label class="conn-editor-field">
							<span>执行方式</span>
							<select id="conn-editor-schedule-kind" name="scheduleKind">
								<option value="once">定时执行</option>
								<option value="interval">间隔执行</option>
								<option value="daily">每日执行</option>
							</select>
							<small class="conn-editor-field-hint">就三种：定时一次、按间隔重复、每天固定时间。</small>
						</label>
						<div class="conn-editor-grid conn-editor-schedule-grid">
							<label class="conn-editor-field conn-editor-schedule-panel" data-schedule-panel="once">
								<span>执行时间</span>
								<input
									id="conn-editor-once-at"
									name="onceAt"
									type="text"
									autocomplete="off"
									inputmode="none"
									placeholder="点选日期和时间"
									data-conn-time-picker="datetime"
								/>
							</label>
							<label class="conn-editor-field conn-editor-schedule-panel" data-schedule-panel="interval">
								<span>首次执行时间</span>
								<input
									id="conn-editor-interval-start"
									name="intervalStart"
									type="text"
									autocomplete="off"
									inputmode="none"
									placeholder="点选首次执行时间"
									data-conn-time-picker="datetime"
								/>
							</label>
							<label class="conn-editor-field conn-editor-schedule-panel" data-schedule-panel="interval">
								<span>间隔（分钟）</span>
								<input id="conn-editor-interval-minutes" name="intervalMinutes" type="number" min="1" step="1" />
							</label>
							<label class="conn-editor-field conn-editor-schedule-panel" data-schedule-panel="daily">
								<span>每日执行时间</span>
								<input
									id="conn-editor-time-of-day"
									name="timeOfDay"
									type="text"
									autocomplete="off"
									inputmode="none"
									placeholder="点选每日时间"
									data-conn-time-picker="time"
								/>
							</label>
						</div>
						<div class="conn-editor-grid conn-editor-model-grid">
							<label class="conn-editor-field">
								<span>执行 Agent</span>
								<select id="conn-editor-profile-id" name="profileId"></select>
								<small class="conn-editor-field-hint">后台任务借用这个 Agent 的规则和技能，不写入它的聊天历史。</small>
							</label>
							<label class="conn-editor-field">
								<span>浏览器</span>
								<select id="conn-editor-browser-id" name="browserId"></select>
								<small class="conn-editor-field-hint">不指定时跟随执行 Agent 的默认浏览器。</small>
							</label>
							<label class="conn-editor-field">
								<span>API 源</span>
								<select id="conn-editor-model-provider" name="modelProvider"></select>
								<small class="conn-editor-field-hint">后台任务会按这里保存的模型运行，不跟随前台聊天临时切换。</small>
							</label>
							<label class="conn-editor-field">
								<span>模型</span>
								<select id="conn-editor-model-id" name="modelId"></select>
								<small id="conn-editor-model-auth" class="conn-editor-field-hint">正在读取可用模型</small>
							</label>
						</div>
						<details class="conn-editor-advanced">
							<summary>高级设置</summary>
							<p class="conn-editor-section-hint">下面这些主要给进阶场景用。不填就走默认，不会影响普通创建。</p>
							<div class="conn-editor-grid">
								<label class="conn-editor-field">
									<span>执行模板</span>
									<input id="conn-editor-agent-spec-id" autocomplete="off" placeholder="agent.default" />
									<small class="conn-editor-field-hint">决定底层 agent 形态。</small>
								</label>
								<label class="conn-editor-field">
									<span>能力包</span>
									<input id="conn-editor-skill-set-id" autocomplete="off" placeholder="skills.default" />
									<small class="conn-editor-field-hint">限制它能调用哪些 skills。</small>
								</label>
								<label class="conn-editor-field">
									<span>版本跟随方式</span>
									<select id="conn-editor-upgrade-policy">
										<option value="latest">跟随默认</option>
										<option value="pinned">固定当前</option>
										<option value="manual">手动控制</option>
									</select>
									<small class="conn-editor-field-hint">控制它是自动跟随，还是固定在当前版本。</small>
								</label>
								<label class="conn-editor-field">
									<span>最长等待时长（秒）</span>
									<input id="conn-editor-max-run-seconds" type="number" min="1" step="1" />
									<small class="conn-editor-field-hint">超时后，这次任务会按失败处理。</small>
								</label>
							</div>
							<label class="conn-editor-field">
								<span>附加资料</span>
								<div class="conn-editor-assets-panel">
									<div class="conn-editor-assets-actions">
										<button id="conn-editor-pick-assets-button" type="button">选择复用文件</button>
										<button id="conn-editor-upload-assets-button" type="button">上传新文件</button>
									</div>
									<input id="conn-editor-asset-file-input" type="file" multiple hidden />
									<div id="conn-editor-selected-assets" class="conn-editor-selected-assets" aria-live="polite"></div>
									<textarea id="conn-editor-asset-refs" rows="3" spellcheck="false" hidden></textarea>
								</div>
								<small class="conn-editor-field-hint">资源 ID 只留给系统内部管理；这里直接选复用文件或上传新文件即可。</small>
							</label>
						</details>
					</div>
				</form>
			</section>
		</div>
	`;
}
