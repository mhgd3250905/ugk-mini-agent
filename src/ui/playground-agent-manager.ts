export function getPlaygroundAgentManagerStyles(): string {
	return `
		.agent-manager-panel {
			width: min(960px, calc(100vw - 28px));
		}

		.agent-editor-panel {
			width: min(720px, calc(100vw - 28px));
		}

		.agent-manager-body {
			display: grid;
			grid-template-rows: auto minmax(0, 1fr);
			gap: 12px;
			min-height: 0;
		}

		.agent-manager-overview {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 8px;
		}

		.agent-manager-stat,
		.agent-manager-detail,
		.agent-manager-create,
		.agent-manager-skill-panel,
		.agent-manager-rules-panel,
		.agent-manager-empty-detail {
			border: 0;
			background: transparent;
		}

		.agent-manager-stat {
			display: grid;
			gap: 4px;
			padding: 10px;
		}

		.agent-manager-stat span,
		.agent-manager-detail-label,
		.agent-manager-skill-meta,
		.agent-manager-skill-empty,
		.agent-manager-rules-empty,
		.agent-manager-hint {
			color: rgba(226, 234, 255, 0.58);
			font-size: 11px;
			line-height: 1.55;
		}

		.agent-manager-stat strong {
			color: rgba(246, 249, 255, 0.94);
			font-family: var(--font-mono);
			font-size: 18px;
			line-height: 1.1;
		}

		.agent-manager-console {
			display: grid;
			grid-template-columns: minmax(220px, 0.36fr) minmax(0, 1fr);
			gap: 12px;
			min-height: 0;
		}

		.agent-manager-sidebar,
		.agent-manager-main-area {
			min-height: 0;
		}

		.agent-manager-sidebar {
			display: grid;
			grid-template-rows: auto minmax(0, 1fr);
			gap: 8px;
		}

		.agent-manager-list {
			display: grid;
			align-content: start;
			gap: 8px;
			min-height: 0;
			overflow: auto;
		}

		.agent-manager-list-button {
			display: grid;
			gap: 6px;
			width: 100%;
			padding: 10px;
			border: 1px solid var(--line);
			border-radius: 4px;
			background: rgba(16, 24, 44, 0.5);
			box-shadow: none;
			color: rgba(226, 234, 255, 0.66);
			text-align: left;
		}

		.agent-manager-list-button:hover:not(:disabled),
		.agent-manager-list-button:focus-visible,
		.agent-manager-list-button.is-selected {
			border-color: rgba(201, 210, 255, 0.24);
			background: rgba(201, 210, 255, 0.07);
			transform: none;
		}

		.agent-manager-list-title {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			min-width: 0;
		}

		.agent-manager-list-title strong {
			overflow: hidden;
			color: rgba(246, 249, 255, 0.94);
			font-size: 13px;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.agent-manager-list-browser {
			overflow: hidden;
			color: rgba(226, 234, 255, 0.52);
			font-size: 10px;
			line-height: 1.35;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.agent-manager-status {
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

		.agent-manager-status.active {
			border-color: rgba(141, 255, 178, 0.3);
			color: rgba(141, 255, 178, 0.9);
		}

		.agent-manager-main-area {
			display: grid;
			grid-template-rows: auto minmax(0, 1fr);
			gap: 8px;
		}

		.agent-manager-notice {
			padding: 8px 10px;
			border: 1px solid rgba(141, 255, 178, 0.18);
			background: rgba(141, 255, 178, 0.06);
			color: rgba(218, 255, 230, 0.86);
			font-size: 11px;
			line-height: 1.55;
		}

		.agent-manager-notice[hidden] {
			display: none !important;
		}

		.agent-manager-detail,
		.agent-manager-create {
			display: grid;
			grid-template-rows: auto auto auto minmax(0, 1fr);
			gap: 12px;
			min-height: 0;
			padding: 12px;
		}

		.agent-manager-create {
			grid-template-rows: auto auto minmax(0, 0.9fr) minmax(0, 1fr);
		}

		.agent-manager-detail-head,
		.agent-manager-actions,
		.agent-manager-skill-head,
		.agent-manager-rules-head,
		.agent-manager-create-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 10px;
			flex-wrap: wrap;
		}

		.agent-manager-detail-title {
			display: grid;
			gap: 4px;
			min-width: 0;
		}

		.agent-manager-detail-title strong {
			color: rgba(246, 249, 255, 0.96);
			font-size: 16px;
			line-height: 1.3;
		}

		.agent-manager-detail-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 8px;
		}

		.agent-manager-detail-field {
			display: grid;
			gap: 4px;
			min-width: 0;
			padding: 8px 10px;
			border: 1px solid rgba(201, 210, 255, 0.08);
			background: rgba(255, 255, 255, 0.025);
		}

		.agent-manager-detail-field code {
			overflow-wrap: anywhere;
			color: rgba(223, 230, 255, 0.78);
			font-family: var(--font-mono);
			font-size: 11px;
		}

		.agent-manager-actions {
			justify-content: flex-start;
		}

		.agent-manager-actions button,
		.agent-manager-skill-head button,
		.agent-manager-rules-head button,
		.agent-manager-skill-install button,
		.agent-manager-skill-item button {
			padding: 6px 10px;
			font-size: 10px;
		}

		.agent-manager-actions .danger-action {
			border-color: rgba(255, 113, 136, 0.18);
			color: rgba(255, 190, 202, 0.9);
		}

		.agent-manager-skill-panel,
		.agent-manager-rules-panel {
			display: grid;
			grid-template-rows: auto minmax(0, 1fr);
			gap: 8px;
			min-height: 0;
			padding: 0;
		}

		.agent-manager-rules-card {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			width: 100%;
			min-height: 48px;
			padding: 10px 12px;
			border: 1px solid rgba(201, 210, 255, 0.1);
			border-radius: 4px;
			background: rgba(255, 255, 255, 0.025);
			box-shadow: none;
			color: rgba(226, 234, 255, 0.76);
			text-align: left;
		}

		.agent-manager-rules-card:hover,
		.agent-manager-rules-card:focus-visible {
			border-color: rgba(201, 210, 255, 0.22);
			background: rgba(201, 210, 255, 0.06);
			transform: none;
		}

		.agent-manager-rules-card-copy {
			display: grid;
			gap: 3px;
			min-width: 0;
		}

		.agent-manager-rules-card-copy strong {
			color: rgba(246, 249, 255, 0.94);
			font-size: 12px;
			line-height: 1.3;
		}

		.agent-manager-rules-card-copy span {
			overflow: hidden;
			color: rgba(226, 234, 255, 0.52);
			font-family: var(--font-mono);
			font-size: 10px;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.agent-manager-rules-card-action {
			flex: 0 0 auto;
			color: rgba(226, 234, 255, 0.66);
			font-size: 10px;
			text-transform: uppercase;
		}

		.agent-rules-editor-panel {
			width: min(900px, calc(100vw - 28px));
		}

		.agent-rules-editor-body {
			display: grid;
			gap: 10px;
			min-height: min(68vh, 720px);
		}

		.agent-rules-editor-textarea {
			width: 100%;
			min-height: 52vh;
			padding: 12px;
			border: 1px solid rgba(201, 210, 255, 0.14);
			border-radius: 4px;
			background: rgba(5, 7, 13, 0.92);
			color: rgba(244, 248, 255, 0.92);
			font-family: var(--font-mono);
			font-size: 12px;
			line-height: 1.55;
			resize: vertical;
		}

		.agent-rules-editor-error {
			padding: 8px 10px;
			border: 1px solid rgba(255, 113, 136, 0.22);
			background: rgba(255, 113, 136, 0.08);
			color: rgba(255, 210, 218, 0.92);
			font-size: 11px;
			line-height: 1.55;
		}

		.agent-rules-editor-error[hidden] {
			display: none !important;
		}

		.agent-manager-rules-content {
			min-height: 220px;
			margin: 0;
			overflow: auto;
			padding: 10px;
			border: 1px solid rgba(201, 210, 255, 0.08);
			background: rgba(5, 7, 13, 0.52);
			color: rgba(235, 241, 255, 0.86);
			font-family: var(--font-mono);
			font-size: 11px;
			line-height: 1.55;
			white-space: pre-wrap;
			overflow-wrap: anywhere;
		}

		.agent-manager-skill-list {
			display: grid;
			align-content: start;
			gap: 6px;
			min-height: 360px;
			overflow: auto;
		}

		.agent-manager-skill-install {
			display: flex;
			align-items: center;
			gap: 8px;
			flex-wrap: wrap;
			padding: 8px 10px;
			border: 1px solid rgba(201, 210, 255, 0.08);
			background: rgba(255, 255, 255, 0.025);
		}

		.agent-manager-skill-install select {
			min-width: min(280px, 100%);
			min-height: 32px;
			padding: 6px 9px;
			border: 1px solid rgba(201, 210, 255, 0.14);
			border-radius: 4px;
			background: rgba(5, 7, 13, 0.92);
			color: rgba(244, 248, 255, 0.92);
			font-size: 11px;
		}

		.agent-manager-skill-item {
			display: grid;
			gap: 4px;
			padding: 8px 10px;
			border: 1px solid rgba(201, 210, 255, 0.08);
			background: rgba(255, 255, 255, 0.025);
		}

		.agent-manager-skill-item-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			min-width: 0;
		}

		.agent-manager-skill-item button {
			border-color: rgba(255, 113, 136, 0.16);
			color: rgba(255, 190, 202, 0.88);
		}

		.agent-manager-skill-item strong {
			color: rgba(246, 249, 255, 0.9);
			font-family: var(--font-mono);
			font-size: 11px;
			line-height: 1.35;
		}

		.agent-manager-empty-detail {
			display: grid;
			place-items: center;
			min-height: 260px;
			padding: 24px;
			color: rgba(226, 234, 255, 0.58);
			font-size: 12px;
			text-align: center;
		}

		.agent-editor-form,
		.agent-editor-body {
			display: grid;
			min-height: 0;
		}

		.agent-editor-body {
			gap: 12px;
		}

		.agent-editor-field {
			display: grid;
			gap: 6px;
			min-width: 0;
			color: rgba(226, 234, 255, 0.68);
			font-size: 11px;
			line-height: 1.5;
		}

		.agent-editor-field input,
		.agent-editor-field select,
		.agent-editor-field textarea,
		.agent-manager-create select,
		.agent-manager-create input,
		.agent-manager-create textarea {
			width: 100%;
			border: 1px solid rgba(201, 210, 255, 0.14);
			border-radius: 4px;
			background: rgba(5, 7, 13, 0.92);
			color: rgba(244, 248, 255, 0.92);
			font: inherit;
			font-size: 12px;
			line-height: 1.5;
		}

		.agent-editor-field input,
		.agent-editor-field select,
		.agent-manager-create select,
		.agent-manager-create input {
			min-height: 34px;
			padding: 7px 9px;
		}

		.agent-editor-field textarea,
		.agent-manager-create textarea {
			min-height: 86px;
			padding: 9px;
			resize: vertical;
		}

		.agent-manager-create-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 10px;
		}

		.agent-manager-create-section {
			display: grid;
			gap: 8px;
			min-height: 0;
			padding: 10px;
			border: 1px solid rgba(201, 210, 255, 0.08);
			background: rgba(255, 255, 255, 0.025);
		}

		.agent-manager-create-section strong {
			color: rgba(246, 249, 255, 0.92);
			font-size: 12px;
		}

		.agent-manager-skill-picker {
			display: grid;
			align-content: start;
			gap: 6px;
			min-height: 0;
			overflow: auto;
		}

		.agent-manager-skill-choice {
			display: flex;
			align-items: flex-start;
			gap: 8px;
			padding: 7px 9px;
			border: 1px solid rgba(201, 210, 255, 0.08);
			background: rgba(5, 7, 13, 0.28);
			color: rgba(226, 234, 255, 0.78);
			font-size: 11px;
			line-height: 1.45;
		}

		.agent-manager-skill-choice input {
			width: auto;
			min-height: auto;
			margin-top: 2px;
			padding: 0;
		}

		.agent-editor-error {
			padding: 8px 10px;
			border: 1px solid rgba(255, 113, 136, 0.22);
			background: rgba(255, 113, 136, 0.08);
			color: rgba(255, 210, 218, 0.92);
			font-size: 11px;
			line-height: 1.55;
		}

		.agent-editor-error[hidden] {
			display: none !important;
		}

		:root[data-theme="light"] .agent-manager-list-button,
		:root[data-theme="light"] .agent-manager-detail-field,
		:root[data-theme="light"] .agent-manager-create-section,
		:root[data-theme="light"] .agent-manager-rules-card,
		:root[data-theme="light"] .agent-manager-skill-install,
		:root[data-theme="light"] .agent-manager-skill-choice,
		:root[data-theme="light"] .agent-manager-skill-item,
		:root[data-theme="light"] .agent-manager-rules-content {
			border-color: rgba(31, 95, 200, 0.1);
			background: rgba(246, 249, 253, 0.92);
			color: #52617a;
		}

		:root[data-theme="light"] .agent-manager-panel > .asset-modal-body,
		:root[data-theme="light"] .agent-editor-panel > .asset-modal-body,
		:root[data-theme="light"] .agent-rules-editor-panel > .asset-modal-body {
			background: #f1f5fa;
		}

		:root[data-theme="light"] .agent-manager-list {
			padding: 8px;
			background: #f1f5fa;
		}

		:root[data-theme="light"] .agent-manager-list-button,
		:root[data-theme="light"] .agent-manager-detail-field,
		:root[data-theme="light"] .agent-manager-create-section,
		:root[data-theme="light"] .agent-manager-rules-card,
		:root[data-theme="light"] .agent-manager-skill-install,
		:root[data-theme="light"] .agent-manager-skill-choice,
		:root[data-theme="light"] .agent-manager-skill-item {
			border-color: #dfe7f2;
			background: #ffffff;
			color: #24324a;
		}

		:root[data-theme="light"] .agent-manager-list-button:hover:not(:disabled),
		:root[data-theme="light"] .agent-manager-list-button:focus-visible,
		:root[data-theme="light"] .agent-manager-list-button.is-selected,
		:root[data-theme="light"] .agent-manager-rules-card:hover,
		:root[data-theme="light"] .agent-manager-rules-card:focus-visible {
			border-color: #cbd8ea;
			background: #f8fbff;
		}

		:root[data-theme="light"] .agent-manager-list-button.is-selected {
			border-color: #9db8e8;
			background: #eaf2ff;
		}

		:root[data-theme="light"] .agent-manager-stat {
			border: 1px solid #dfe7f2;
			background: #f8fbff;
		}

		:root[data-theme="light"] .agent-manager-notice {
			border-color: #b7dfc9;
			background: #e8f6ef;
			color: #145c3b;
		}

		:root[data-theme="light"] .agent-manager-stat strong,
		:root[data-theme="light"] .agent-manager-list-title strong,
		:root[data-theme="light"] .agent-manager-detail-title strong,
		:root[data-theme="light"] .agent-manager-rules-card-copy strong,
		:root[data-theme="light"] .agent-manager-create-section strong,
		:root[data-theme="light"] .agent-manager-skill-item strong {
			color: #172033;
		}

		:root[data-theme="light"] .agent-manager-stat span,
		:root[data-theme="light"] .agent-manager-detail-label,
		:root[data-theme="light"] .agent-manager-skill-meta,
		:root[data-theme="light"] .agent-manager-skill-empty,
		:root[data-theme="light"] .agent-manager-rules-empty,
		:root[data-theme="light"] .agent-manager-hint,
		:root[data-theme="light"] .agent-manager-rules-card-copy span,
		:root[data-theme="light"] .agent-manager-rules-card-action,
		:root[data-theme="light"] .agent-manager-list-browser,
		:root[data-theme="light"] .agent-editor-field {
			color: #40516d;
		}

		:root[data-theme="light"] .agent-manager-detail-field code,
		:root[data-theme="light"] .agent-manager-rules-content,
		:root[data-theme="light"] .agent-manager-skill-item strong {
			color: #24324a;
		}

		:root[data-theme="light"] .agent-manager-status {
			border-color: #cbd8ea;
			background: #eef3fb;
			color: #40516d;
		}

		:root[data-theme="light"] .agent-manager-status.active {
			border-color: #b7dfc9;
			background: #e8f6ef;
			color: #08784b;
		}

		:root[data-theme="light"] .agent-editor-field input,
		:root[data-theme="light"] .agent-editor-field select,
		:root[data-theme="light"] .agent-editor-field textarea,
		:root[data-theme="light"] .agent-manager-skill-install select,
		:root[data-theme="light"] .agent-manager-create select,
		:root[data-theme="light"] .agent-manager-create input,
		:root[data-theme="light"] .agent-manager-create textarea {
			background: #ffffff;
			color: #172033;
			border-color: rgba(31, 95, 200, 0.14);
		}

		:root[data-theme="light"] .agent-editor-field input::placeholder,
		:root[data-theme="light"] .agent-editor-field textarea::placeholder,
		:root[data-theme="light"] .agent-manager-create input::placeholder,
		:root[data-theme="light"] .agent-manager-create textarea::placeholder {
			color: #7b879a;
		}

		:root[data-theme="light"] .agent-rules-editor-textarea {
			background: #ffffff;
			color: #172033;
			border-color: rgba(31, 95, 200, 0.14);
		}

		:root[data-theme="light"] .agent-editor-error,
		:root[data-theme="light"] .agent-rules-editor-error {
			border-color: #f2bdc7;
			background: #fff0f3;
			color: #9d2439;
		}

		@media (max-width: 640px) {
			.agent-manager-body {
				grid-template-rows: auto minmax(0, 1fr);
			}

			.agent-manager-overview {
				grid-template-columns: repeat(3, minmax(0, 1fr));
			}

			.agent-manager-console {
				grid-template-columns: 1fr;
				grid-template-rows: auto minmax(0, 1fr);
			}

			.agent-manager-list {
				grid-auto-flow: column;
				grid-auto-columns: minmax(180px, 72vw);
				overflow-x: auto;
				overflow-y: hidden;
			}

			.agent-manager-detail-grid {
				grid-template-columns: 1fr;
			}

			.agent-manager-create,
			.agent-manager-detail {
				grid-template-rows: auto auto auto minmax(360px, 1fr);
			}

			.agent-manager-create-grid {
				grid-template-columns: 1fr;
			}

		.agent-manager-skill-item.is-disabled {
			opacity: 0.66;
		}

		.agent-manager-skill-toggle {
			min-width: 46px;
			border-color: rgba(201, 210, 255, 0.16);
		}

		.agent-manager-skill-toggle[aria-checked="true"] {
			border-color: rgba(141, 255, 178, 0.28);
			color: rgba(141, 255, 178, 0.92);
		}

		.agent-manager-skill-toggle[aria-checked="false"] {
			border-color: rgba(255, 209, 102, 0.22);
			color: rgba(255, 209, 102, 0.86);
		}

		.agent-manager-skill-required {
			color: rgba(226, 234, 255, 0.52);
			font-size: 10px;
		}
			}
	`;
}

export function getPlaygroundAgentManagerDialogs(): string {
	return `
		<div id="agent-manager-dialog" class="asset-modal-shell agent-manager-dialog" aria-hidden="true" hidden>
			<section class="asset-modal agent-manager-panel" role="dialog" aria-modal="true" aria-labelledby="agent-manager-title">
				<header class="topbar asset-modal-head mobile-work-topbar">
					<div class="mobile-work-title-row">
						<button id="close-agent-manager-button" class="mobile-work-back-button" type="button" aria-label="返回对话">
							<span aria-hidden="true">&larr;</span>
						</button>
						<div class="asset-modal-copy">
							<strong id="agent-manager-title">Agent 操作台</strong>
						</div>
					</div>
					<div class="asset-modal-actions mobile-work-topbar-actions">
						<button id="open-agent-editor-button" type="button">新建 Agent</button>
						<button id="refresh-agent-manager-button" type="button">刷新</button>
					</div>
				</header>
				<div class="asset-modal-body agent-manager-body">
					<div class="agent-manager-overview">
						<div class="agent-manager-stat">
							<span>全部 Agent</span>
							<strong id="agent-manager-count">0</strong>
						</div>
						<div class="agent-manager-stat">
							<span>当前激活</span>
							<strong id="agent-manager-active-name">主 Agent</strong>
						</div>
						<div class="agent-manager-stat">
							<span>透明视图</span>
							<strong id="agent-manager-skill-count">-</strong>
						</div>
					</div>
					<div class="agent-manager-console">
						<aside class="agent-manager-sidebar" aria-label="Agent 列表">
							<div class="agent-manager-hint">主 Agent 可查看不可删除；其他 Agent 管理独立操作视窗。</div>
							<div id="agent-manager-list" class="agent-manager-list" aria-live="polite"></div>
						</aside>
						<section class="agent-manager-main-area" aria-label="Agent 详情">
							<div id="agent-manager-notice" class="agent-manager-notice" role="status" hidden></div>
							<div id="agent-manager-detail" class="agent-manager-detail"></div>
						</section>
					</div>
				</div>
			</section>
		</div>
		<div id="agent-editor-dialog" class="asset-modal-shell agent-editor-dialog" aria-hidden="true" hidden>
			<section class="asset-modal agent-editor-panel" role="dialog" aria-modal="true" aria-labelledby="agent-editor-title">
				<form id="agent-editor-form" class="agent-editor-form">
					<header class="topbar asset-modal-head mobile-work-topbar">
						<div class="mobile-work-title-row">
							<button id="close-agent-editor-button" class="mobile-work-back-button" type="button" aria-label="返回 Agent 操作台">
								<span aria-hidden="true">&larr;</span>
							</button>
							<div class="asset-modal-copy">
								<strong id="agent-editor-title">新建 Agent</strong>
							</div>
						</div>
						<div class="asset-modal-actions mobile-work-topbar-actions">
							<button id="save-agent-editor-button" type="submit">保存</button>
							<button id="cancel-agent-editor-button" type="button">取消</button>
						</div>
					</header>
					<div class="asset-modal-body agent-editor-body">
						<div id="agent-editor-error" class="agent-editor-error" role="alert" hidden></div>
						<label class="agent-editor-field">
							<span>Agent ID</span>
							<input id="agent-editor-id-input" name="agentId" autocomplete="off" pattern="[a-z][a-z0-9-]*" required />
						</label>
						<label class="agent-editor-field">
							<span>显示名称</span>
							<input id="agent-editor-name-input" name="name" autocomplete="off" required />
						</label>
						<label class="agent-editor-field">
							<span>用途描述</span>
							<textarea id="agent-editor-description-input" name="description" required></textarea>
						</label>
						<label class="agent-editor-field">
							<span>默认浏览器</span>
							<select id="agent-editor-browser-select" name="defaultBrowserId"></select>
						</label>
				<label class="agent-editor-field">
					<span>默认模型提供商</span>
					<select id="agent-editor-model-provider-select" name="defaultModelProvider"></select>
				</label>
				<label class="agent-editor-field">
					<span>默认模型</span>
					<select id="agent-editor-model-select" name="defaultModelId"></select>
				</label>
					</div>
				</form>
			</section>
		</div>
		<div id="agent-rules-editor-dialog" class="asset-modal-shell agent-rules-editor-dialog" aria-hidden="true" hidden>
			<section class="asset-modal agent-rules-editor-panel" role="dialog" aria-modal="true" aria-labelledby="agent-rules-editor-title">
				<header class="topbar asset-modal-head mobile-work-topbar">
					<div class="mobile-work-title-row">
						<button id="close-agent-rules-editor-button" class="mobile-work-back-button" type="button" aria-label="返回 Agent 操作台">
							<span aria-hidden="true">&larr;</span>
						</button>
						<div class="asset-modal-copy">
							<strong id="agent-rules-editor-title">AGENTS.md</strong>
						</div>
					</div>
					<div class="asset-modal-actions mobile-work-topbar-actions">
						<button id="save-agent-rules-editor-button" type="button">保存</button>
						<button id="cancel-agent-rules-editor-button" type="button">取消</button>
					</div>
				</header>
				<div class="asset-modal-body agent-rules-editor-body">
					<div id="agent-rules-editor-error" class="agent-rules-editor-error" role="alert" hidden></div>
					<textarea id="agent-rules-editor-input" class="agent-rules-editor-textarea" spellcheck="false"></textarea>
				</div>
			</section>
		</div>
	`;
}

export function getPlaygroundAgentManagerScript(): string {
	return `
		const agentManagerDialog = document.getElementById("agent-manager-dialog");
		const agentManagerList = document.getElementById("agent-manager-list");
		const agentManagerDetail = document.getElementById("agent-manager-detail");
		const agentManagerNotice = document.getElementById("agent-manager-notice");
		const agentManagerCount = document.getElementById("agent-manager-count");
		const agentManagerActiveName = document.getElementById("agent-manager-active-name");
		const agentManagerSkillCount = document.getElementById("agent-manager-skill-count");
		const closeAgentManagerButton = document.getElementById("close-agent-manager-button");
		const refreshAgentManagerButton = document.getElementById("refresh-agent-manager-button");
		const openAgentEditorButton = document.getElementById("open-agent-editor-button");
		const agentEditorDialog = document.getElementById("agent-editor-dialog");
		const agentEditorForm = document.getElementById("agent-editor-form");
		const agentEditorTitle = document.getElementById("agent-editor-title");
		const agentEditorError = document.getElementById("agent-editor-error");
		const agentEditorIdInput = document.getElementById("agent-editor-id-input");
		const agentEditorNameInput = document.getElementById("agent-editor-name-input");
		const agentEditorDescriptionInput = document.getElementById("agent-editor-description-input");
		const agentEditorBrowserSelect = document.getElementById("agent-editor-browser-select");
			const agentEditorModelProviderSelect = document.getElementById("agent-editor-model-provider-select");
			const agentEditorModelSelect = document.getElementById("agent-editor-model-select");
		const saveAgentEditorButton = document.getElementById("save-agent-editor-button");
		const cancelAgentEditorButton = document.getElementById("cancel-agent-editor-button");
		const closeAgentEditorButton = document.getElementById("close-agent-editor-button");
		const agentRulesEditorDialog = document.getElementById("agent-rules-editor-dialog");
		const agentRulesEditorTitle = document.getElementById("agent-rules-editor-title");
		const agentRulesEditorError = document.getElementById("agent-rules-editor-error");
		const agentRulesEditorInput = document.getElementById("agent-rules-editor-input");
		const saveAgentRulesEditorButton = document.getElementById("save-agent-rules-editor-button");
		const cancelAgentRulesEditorButton = document.getElementById("cancel-agent-rules-editor-button");
		const closeAgentRulesEditorButton = document.getElementById("close-agent-rules-editor-button");

		function getManagedAgentCatalog() {
			return (Array.isArray(state.agentCatalog) ? state.agentCatalog : [])
				.filter((agent) => String(agent?.agentId || "").trim());
		}

		function isMainAgent(agent) {
			return agent?.agentId === "main";
		}

			function renderModelEditorOptions(agent) {
				const providerSelect = agentEditorModelProviderSelect;
				const modelSelect = agentEditorModelSelect;
				if (!providerSelect || !modelSelect) return;
				const isCore = isMainAgent(agent);
				providerSelect.innerHTML = "";
				modelSelect.innerHTML = "";
				providerSelect.disabled = isCore;
				modelSelect.disabled = isCore;
				if (isCore || !state.modelConfig) {
					const opt = document.createElement("option");
					opt.value = "";
					opt.textContent = "跟随全局默认";
					providerSelect.appendChild(opt);
					modelSelect.appendChild(opt.cloneNode(true));
					return;
				}
				const curProvider = agent?.defaultModelProvider || "";
				const curModel = agent?.defaultModelId || "";
				const defaultOpt = document.createElement("option");
				defaultOpt.value = "";
				defaultOpt.textContent = "跟随全局默认";
				providerSelect.appendChild(defaultOpt);
				for (const prov of state.modelConfig.providers || []) {
					const option = document.createElement("option");
					option.value = prov.id || "";
					option.textContent = prov.name || prov.id || "";
					if (curProvider === prov.id) option.selected = true;
					providerSelect.appendChild(option);
				}
				renderModelSelectForProvider(curProvider, curModel);
			}

			function renderModelSelectForProvider(providerId, selectedModelId) {
				const modelSelect = agentEditorModelSelect;
				if (!modelSelect || !state.modelConfig) return;
				modelSelect.innerHTML = "";
				const defaultOpt = document.createElement("option");
				defaultOpt.value = "";
				defaultOpt.textContent = "跟随全局默认";
				modelSelect.appendChild(defaultOpt);
				if (!providerId) return;
				const prov = (state.modelConfig.providers || []).find((p) => p.id === providerId);
				if (!prov) return;
				for (const m of prov.models || []) {
					const option = document.createElement("option");
					option.value = m.id || "";
					option.textContent = m.name || m.id || "";
					if (selectedModelId === m.id) option.selected = true;
					modelSelect.appendChild(option);
				}
			}

			function buildAgentEditorModelSelectionPatch() {
				if (!state.modelConfig || !agentEditorModelProviderSelect || !agentEditorModelSelect) {
					return {};
				}
				const provider = String(agentEditorModelProviderSelect.value || "").trim();
				const model = String(agentEditorModelSelect.value || "").trim();
				if (!provider && !model) {
					return state.agentEditorMode === "edit"
						? { defaultModelProvider: null, defaultModelId: null }
						: {};
				}
				if (!provider || !model) {
					setAgentEditorError("默认模型提供商和默认模型需要同时选择，或都留空跟随全局默认。");
					return null;
				}
				return { defaultModelProvider: provider, defaultModelId: model };
			}

		function getBrowserCatalog() {
			return Array.isArray(state.browserCatalog) ? state.browserCatalog : [];
		}

		function getBrowserLabel(browserId) {
			const normalized = String(browserId || "").trim();
			if (!normalized) {
				return "跟随系统默认";
			}
			const browser = getBrowserCatalog().find((entry) => entry?.browserId === normalized);
			return browser ? (browser.name || browser.browserId) + " · " + browser.browserId : normalized;
		}

		function renderBrowserOptions(select, selectedBrowserId) {
			if (!select) {
				return;
			}
			const selected = String(selectedBrowserId || "").trim();
			select.innerHTML = "";
			const defaultOption = document.createElement("option");
			defaultOption.value = "";
			defaultOption.textContent = "跟随系统默认（" + getBrowserLabel(state.defaultBrowserId || "default") + "）";
			select.appendChild(defaultOption);
			for (const browser of getBrowserCatalog()) {
				const browserId = String(browser?.browserId || "").trim();
				if (!browserId) {
					continue;
				}
				const option = document.createElement("option");
				option.value = browserId;
				option.textContent = (browser.name || browserId) + " · " + browserId;
				select.appendChild(option);
			}
			if (selected && !getBrowserCatalog().some((browser) => browser?.browserId === selected)) {
				const unknownOption = document.createElement("option");
				unknownOption.value = selected;
				unknownOption.textContent = selected + "（未在当前浏览器列表中）";
				select.appendChild(unknownOption);
			}
			select.value = selected;
		}

		function getRequiredAgentSkillNames() {
			return ["agent-skill-ops", "agent-runtime-ops", "agent-filesystem-ops"];
		}

		function slugifyAgentId(value) {
			const normalized = String(value || "")
				.trim()
				.toLowerCase()
				.replace(/agent/g, "")
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-+|-+$/g, "");
			return /^[a-z]/.test(normalized) ? normalized : "agent";
		}

		function deriveNextAgentId(name) {
			const existing = new Set(getManagedAgentCatalog().map((agent) => String(agent.agentId || "")));
			const base = slugifyAgentId(name || "agent");
			let next = base;
			let index = 2;
			while (existing.has(next) || next === "main" || next === "search") {
				next = base + "-" + index;
				index += 1;
			}
			return next;
		}

		function buildAgentRulesPreview(agentId, name, description) {
			const displayName = String(name || "").trim() || "新 Agent";
			const purpose = String(description || "").trim() || "独立 agent profile。";
			const normalizedAgentId = String(agentId || "agent").trim() || "agent";
			return [
				"# " + displayName,
				"",
				"你是 " + displayName + "。",
				"默认使用简体中文回复。",
				"用途说明：" + purpose,
				"",
				"## 基础规则",
				"",
				"- 默认使用简体中文交流；只有用户明确要求英文时才切换。",
				"- 代码标识符、命令、日志、报错信息保持原始语言，其余解释使用简体中文。",
				"- 不把猜测当事实；涉及当前状态、技能、文件、接口或运行结果时，优先读取真实来源确认。",
				"- 你是一个独立 agent，拥有自己的会话、workspace、AGENTS.md、系统技能目录和用户技能目录。",
				"- 涉及破坏性操作、跨 agent 状态修改、部署变更或用户没有授权的共享资源改动时，先说明影响并取得用户确认。",
				"- 尊重用户已有改动；不要回滚、覆盖或清理你没有制造的内容。",
				"",
				"## 技能边界",
				"",
				"当用户询问你有哪些技能时，必须只以当前 agent-scoped runtime 技能清单为事实源：",
				"- 首选读取 GET /v1/agents/" + normalizedAgentId + "/debug/skills 的返回结果。",
				"- 如果该接口返回 skills: []，你必须明确回答当前 agent 没有加载技能。",
				"- 禁止从主 Agent、项目文档、历史记忆、仓库目录名或你以为存在的技能列表中推断技能。",
				"- 你的系统技能目录是 .data/agents/" + normalizedAgentId + "/pi/skills，用户技能目录是 .data/agents/" + normalizedAgentId + "/user-skills。",
				"",
				"## Karpathy Guidelines",
				"",
				"遵循 Think Before Coding / Simplicity First / Surgical Changes / Goal-Driven Execution。",
			].join("\\n");
		}

		function getSelectedAgentForManager() {
			if (state.agentManagerMode === "create") {
				return null;
			}
			const agents = getManagedAgentCatalog();
			const selectedId = String(state.agentManagerSelectedAgentId || "").trim();
			return agents.find((agent) => agent.agentId === selectedId) || agents.find((agent) => agent.agentId === getCurrentAgentId()) || agents[0] || null;
		}

		function setAgentManagerNotice(message) {
			state.agentManagerNotice = String(message || "").trim();
			agentManagerNotice.textContent = state.agentManagerNotice;
			agentManagerNotice.hidden = !state.agentManagerNotice;
		}

		function setAgentEditorError(message) {
			state.agentEditorError = String(message || "").trim();
			agentEditorError.textContent = state.agentEditorError;
			agentEditorError.hidden = !state.agentEditorError;
		}

		function setAgentRulesEditorError(message) {
			state.agentRulesEditorError = String(message || "").trim();
			agentRulesEditorError.textContent = state.agentRulesEditorError;
			agentRulesEditorError.hidden = !state.agentRulesEditorError;
		}

		function openAgentManager(restoreFocusElement, options) {
			state.agentManagerOpen = true;
			state.agentManagerRestoreFocusElement = rememberPanelReturnFocus(
				restoreFocusElement || agentSelectorStatus,
			);
			agentManagerDialog.hidden = false;
			agentManagerDialog.classList.add("open");
			agentManagerDialog.setAttribute("aria-hidden", "false");
			renderAgentManager();
			openWorkspacePanel("agents", agentManagerDialog, {
				forceOverlay: options?.mode !== "workspace",
			});
			void loadAgentManager({ silent: false });
		}

		function closeAgentManager() {
			state.agentManagerOpen = false;
			restoreFocusAfterPanelClose(agentManagerDialog, state.agentManagerRestoreFocusElement);
			agentManagerDialog.classList.remove("open");
			agentManagerDialog.hidden = true;
			agentManagerDialog.setAttribute("aria-hidden", "true");
			closeWorkspacePanel("agents", agentManagerDialog);
		}

		function openAgentEditor(mode, agent, restoreFocusElement) {
			const editing = mode === "edit" && agent?.agentId;
			if (!editing) {
				openAgentCreateView();
				return;
			}
			state.agentEditorOpen = true;
			state.agentEditorMode = editing ? "edit" : "create";
			state.agentEditorAgentId = editing ? agent.agentId : "";
			state.agentEditorSaving = false;
			setAgentEditorError("");
			state.agentEditorRestoreFocusElement = rememberPanelReturnFocus(
				restoreFocusElement || openAgentEditorButton,
			);
			agentEditorTitle.textContent = editing ? "编辑 Agent" : "新建 Agent";
			agentEditorIdInput.value = editing ? agent.agentId : "";
			agentEditorIdInput.readOnly = editing;
			agentEditorNameInput.value = editing ? agent.name || "" : "";
			agentEditorDescriptionInput.value = editing ? agent.description || "" : "";
			renderBrowserOptions(agentEditorBrowserSelect, editing ? agent.defaultBrowserId || "" : "");
				renderModelEditorOptions(agent);
			renderAgentEditor();
			agentEditorDialog.hidden = false;
			agentEditorDialog.classList.add("open");
			agentEditorDialog.setAttribute("aria-hidden", "false");
			(editing ? agentEditorNameInput : agentEditorIdInput).focus();
		}

		function openAgentCreateView() {
			state.agentManagerMode = "create";
			state.agentManagerSelectedAgentId = "";
			state.agentCreateName = "";
			state.agentCreateDescription = "";
			state.agentCreateDefaultBrowserId = "";
				state.agentCreateDefaultModelProvider = "";
				state.agentCreateDefaultModelId = "";
			state.agentCreateSelectedSkillNames = [];
			setAgentEditorError("");
			renderAgentManager();
			void loadAgentManagerAvailableInitialSkills();
		}

		function closeAgentCreateView() {
			state.agentManagerMode = "detail";
			setAgentEditorError("");
			renderAgentManager();
		}

		function closeAgentEditor() {
			state.agentEditorOpen = false;
			state.agentEditorSaving = false;
			setAgentEditorError("");
			restoreFocusAfterPanelClose(agentEditorDialog, state.agentEditorRestoreFocusElement);
			state.agentEditorRestoreFocusElement = null;
			agentEditorDialog.classList.remove("open");
			agentEditorDialog.hidden = true;
			agentEditorDialog.setAttribute("aria-hidden", "true");
		}

		function renderAgentEditor() {
			const saving = Boolean(state.agentEditorSaving);
			agentEditorIdInput.disabled = saving;
			agentEditorNameInput.disabled = saving;
			agentEditorDescriptionInput.disabled = saving;
			agentEditorBrowserSelect.disabled = saving;
				if (agentEditorModelProviderSelect) agentEditorModelProviderSelect.disabled = saving;
				if (agentEditorModelSelect) agentEditorModelSelect.disabled = saving;
			saveAgentEditorButton.disabled = saving;
			saveAgentEditorButton.textContent = saving ? "保存中" : "保存";
		}

		async function loadBrowserCatalog() {
			try {
				const response = await fetch("/v1/browsers", {
					method: "GET",
					headers: { accept: "application/json" },
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.message || "无法读取浏览器列表");
				}
				state.defaultBrowserId = String(payload?.defaultBrowserId || "default").trim() || "default";
				state.browserCatalog = Array.isArray(payload?.browsers) ? payload.browsers : [];
				state.browserCatalogReliable = true;
			} catch {
				state.defaultBrowserId = "default";
				state.browserCatalog = [
					{ browserId: "default", name: "Default", isDefault: true },
				];
				state.browserCatalogReliable = false;
			}
		}

			async function loadModelConfig() {
				try {
					const response = await fetch("/v1/model-config", {
						method: "GET",
						headers: { accept: "application/json" },
					});
					const payload = await response.json().catch(() => ({}));
					if (!response.ok) {
						throw new Error(payload?.message || "无法读取模型配置");
					}
					state.modelConfig = payload || null;
				} catch {
					state.modelConfig = null;
				}
			}

		async function openAgentRulesEditor(agent, restoreFocusElement) {
			if (!agent?.agentId || state.agentRulesEditorSaving) {
				return;
			}
			state.agentRulesEditorOpen = true;
			state.agentRulesEditorAgentId = agent.agentId;
			state.agentRulesEditorSaving = false;
			setAgentRulesEditorError("");
			state.agentRulesEditorRestoreFocusElement = rememberPanelReturnFocus(restoreFocusElement);
			if (!state.agentManagerRulesByAgentId?.[agent.agentId]) {
				await loadAgentManagerRules(agent);
			}
			const rules = state.agentManagerRulesByAgentId?.[agent.agentId];
			state.agentRulesEditorContent = rules?.content || "";
			agentRulesEditorTitle.textContent = (agent.name || agent.agentId) + " · AGENTS.md";
			agentRulesEditorInput.value = state.agentRulesEditorContent;
			renderAgentRulesEditor();
			agentRulesEditorDialog.hidden = false;
			agentRulesEditorDialog.classList.add("open");
			agentRulesEditorDialog.setAttribute("aria-hidden", "false");
			agentRulesEditorInput.focus();
		}

		function closeAgentRulesEditor() {
			state.agentRulesEditorOpen = false;
			state.agentRulesEditorSaving = false;
			setAgentRulesEditorError("");
			restoreFocusAfterPanelClose(agentRulesEditorDialog, state.agentRulesEditorRestoreFocusElement);
			state.agentRulesEditorRestoreFocusElement = null;
			agentRulesEditorDialog.classList.remove("open");
			agentRulesEditorDialog.hidden = true;
			agentRulesEditorDialog.setAttribute("aria-hidden", "true");
		}

		function renderAgentRulesEditor() {
			const saving = Boolean(state.agentRulesEditorSaving);
			agentRulesEditorInput.disabled = saving;
			saveAgentRulesEditorButton.disabled = saving || !state.agentRulesEditorAgentId;
			saveAgentRulesEditorButton.textContent = saving ? "保存中" : "保存";
		}

		function createAgentManagerAction(text, onClick, options) {
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = text;
			button.disabled = Boolean(options?.disabled);
			if (options?.className) {
				button.className = options.className;
			}
			button.addEventListener("click", onClick);
			return button;
		}

		function renderAgentManager() {
			const agents = getManagedAgentCatalog();
			const selectedAgent = getSelectedAgentForManager();
			if (selectedAgent) {
				state.agentManagerSelectedAgentId = selectedAgent.agentId;
			}
			const current = state.agentCatalog.find((agent) => agent?.agentId === getCurrentAgentId());
			agentManagerCount.textContent = String(agents.length);
			agentManagerActiveName.textContent = String(current?.name || getCurrentAgentId());
			const selectedSkills = selectedAgent ? state.agentManagerSkillsByAgentId?.[selectedAgent.agentId] : null;
			agentManagerSkillCount.textContent = Array.isArray(selectedSkills) ? String(selectedSkills.length) : "-";
			renderAgentManagerList(agents, selectedAgent);
			if (state.agentManagerMode === "create") {
				renderAgentManagerCreateView();
			} else {
				renderAgentManagerDetail(selectedAgent);
			}
			setAgentManagerNotice(state.agentManagerNotice);
		}

		function renderAgentManagerList(agents, selectedAgent) {
			agentManagerList.innerHTML = "";
			if (agents.length === 0) {
				const empty = document.createElement("div");
				empty.className = "asset-empty";
				empty.textContent = "暂无 Agent 配置。点击刷新重新读取运行态。";
				agentManagerList.appendChild(empty);
				return;
			}
			for (const agent of agents) {
				const button = document.createElement("button");
				button.type = "button";
				button.className = "agent-manager-list-button";
				if (agent.agentId === selectedAgent?.agentId) {
					button.classList.add("is-selected");
				}
				button.addEventListener("click", () => {
					state.agentManagerMode = "detail";
					state.agentManagerSelectedAgentId = agent.agentId;
					renderAgentManager();
					void ensureAgentManagerSkills(agent);
					if (!isMainAgent(agent)) {
						void loadAgentManagerAvailableInitialSkills();
					}
				});
				const row = document.createElement("div");
				row.className = "agent-manager-list-title";
				const title = document.createElement("strong");
				title.textContent = agent.name || agent.agentId;
				const status = document.createElement("span");
				status.className = "agent-manager-status" + (agent.agentId === getCurrentAgentId() ? " active" : "");
				status.textContent = agent.agentId === getCurrentAgentId() ? "当前" : (isMainAgent(agent) ? "核心" : "可用");
				row.appendChild(title);
				row.appendChild(status);
				const id = document.createElement("code");
				id.textContent = agent.agentId;
				const browser = document.createElement("span");
				browser.className = "agent-manager-list-browser";
				browser.textContent = "浏览器：" + getBrowserLabel(agent.defaultBrowserId || "");
				button.appendChild(row);
				button.appendChild(id);
				button.appendChild(browser);
				agentManagerList.appendChild(button);
			}
		}

		function renderAgentManagerDetail(agent) {
			agentManagerDetail.innerHTML = "";
			agentManagerDetail.className = "agent-manager-detail";
			if (!agent) {
				const empty = document.createElement("div");
				empty.className = "agent-manager-empty-detail";
				empty.textContent = "还没有 Agent 数据。先刷新运行态。";
				agentManagerDetail.appendChild(empty);
				return;
			}
			const isActing = state.agentManagerActionAgentId === agent.agentId;
			const isCoreAgent = isMainAgent(agent);
			const head = document.createElement("div");
			head.className = "agent-manager-detail-head";
			const title = document.createElement("div");
			title.className = "agent-manager-detail-title";
			const name = document.createElement("strong");
			name.textContent = agent.name || agent.agentId;
			const description = document.createElement("span");
			description.className = "agent-manager-detail-label";
			description.textContent = agent.description || "暂无描述";
			title.appendChild(name);
			title.appendChild(description);
			const actions = document.createElement("div");
			actions.className = "agent-manager-actions";
			actions.appendChild(createAgentManagerAction(agent.agentId === getCurrentAgentId() ? "已激活" : "切换到此 Agent", async () => {
				closeAgentManager();
				await switchAgent(agent.agentId);
			}, { disabled: isActing || agent.agentId === getCurrentAgentId() }));
			actions.appendChild(createAgentManagerAction("编辑资料", (event) => {
				openAgentEditor("edit", agent, event.currentTarget);
			}, { disabled: isActing || isCoreAgent }));
			actions.appendChild(createAgentManagerAction(isActing ? "删除中" : "删除", () => {
				void archiveAgentFromManager(agent);
			}, { disabled: isActing || isCoreAgent, className: "danger-action" }));
			head.appendChild(title);
			head.appendChild(actions);
			const fields = document.createElement("div");
			fields.className = "agent-manager-detail-grid";
			for (const [label, value] of [
				["Agent ID", agent.agentId],
				["状态", agent.agentId === getCurrentAgentId() ? "当前激活" : (isCoreAgent ? "核心 Agent" : "可切换")],
				["默认浏览器", getBrowserLabel(agent.defaultBrowserId || "")],
					["默认模型", agent.defaultModelProvider && agent.defaultModelId ? agent.defaultModelProvider + "/" + agent.defaultModelId : "跟随全局默认"],
				["会话接口", "/v1/agents/" + agent.agentId + "/chat/*"],
				["技能接口", "/v1/agents/" + agent.agentId + "/debug/skills"],
				["规则文件", "AGENTS.md"],
			]) {
				const field = document.createElement("div");
				field.className = "agent-manager-detail-field";
				const fieldLabel = document.createElement("span");
				fieldLabel.className = "agent-manager-detail-label";
				fieldLabel.textContent = label;
				const code = document.createElement("code");
				code.textContent = value;
				field.appendChild(fieldLabel);
				field.appendChild(code);
				fields.appendChild(field);
			}
			const rulesCard = renderAgentManagerRulesCard(agent);
			const skillPanel = renderAgentManagerSkillPanel(agent);
			agentManagerDetail.appendChild(head);
			agentManagerDetail.appendChild(fields);
			agentManagerDetail.appendChild(rulesCard);
			agentManagerDetail.appendChild(skillPanel);
		}

		function renderAgentManagerCreateView() {
			agentManagerDetail.innerHTML = "";
			agentManagerDetail.className = "agent-manager-create";
			const agentId = deriveNextAgentId(state.agentCreateName);
			const head = document.createElement("div");
			head.className = "agent-manager-create-head";
			const title = document.createElement("div");
			title.className = "agent-manager-detail-title";
			const strong = document.createElement("strong");
			strong.textContent = "新建 Agent";
			const desc = document.createElement("span");
			desc.className = "agent-manager-detail-label";
			desc.textContent = "先定义身份、用途和初始技能，再生成独立 AGENTS.md。";
			title.appendChild(strong);
			title.appendChild(desc);
			const actions = document.createElement("div");
			actions.className = "agent-manager-actions";
			actions.appendChild(createAgentManagerAction(state.agentEditorSaving ? "创建中" : "创建 Agent", () => {
				void createAgentFromManager();
			}, { disabled: state.agentEditorSaving }));
			actions.appendChild(createAgentManagerAction("取消", closeAgentCreateView, { disabled: state.agentEditorSaving }));
			head.appendChild(title);
			head.appendChild(actions);

			const form = document.createElement("div");
			form.className = "agent-manager-create-grid";
			let refreshCreatePreview = () => {};
			const nameField = renderAgentCreateTextField("Agent 名称", state.agentCreateName, (value) => {
				state.agentCreateName = value;
				refreshCreatePreview();
			});
			const idField = document.createElement("label");
			idField.className = "agent-editor-field";
			const idLabel = document.createElement("span");
			idLabel.textContent = "Agent ID（自动生成）";
			const idInput = document.createElement("input");
			idInput.value = agentId;
			idInput.readOnly = true;
			idField.appendChild(idLabel);
			idField.appendChild(idInput);
			const descriptionField = renderAgentCreateTextArea("用途描述", state.agentCreateDescription, (value) => {
				state.agentCreateDescription = value;
				refreshCreatePreview();
			});
			const browserField = renderAgentCreateBrowserField();
			form.appendChild(nameField);
			form.appendChild(idField);
			form.appendChild(descriptionField);
			form.appendChild(browserField);
				const modelField = renderAgentCreateModelField();
				form.appendChild(modelField);

			const skillsSection = renderAgentCreateSkillsSection();
			const rulesSection = document.createElement("section");
			rulesSection.className = "agent-manager-create-section";
			const rulesTitle = document.createElement("strong");
			rulesTitle.textContent = "AGENTS.md 预览";
			const rulesMeta = document.createElement("span");
			rulesMeta.className = "agent-manager-skill-meta";
			rulesMeta.textContent = ".data/agents/" + agentId + "/AGENTS.md";
			const rulesPreview = document.createElement("pre");
			rulesPreview.className = "agent-manager-rules-content";
			rulesPreview.textContent = buildAgentRulesPreview(agentId, state.agentCreateName, state.agentCreateDescription);
			refreshCreatePreview = () => {
				const nextAgentId = deriveNextAgentId(state.agentCreateName);
				idInput.value = nextAgentId;
				rulesMeta.textContent = ".data/agents/" + nextAgentId + "/AGENTS.md";
				rulesPreview.textContent = buildAgentRulesPreview(nextAgentId, state.agentCreateName, state.agentCreateDescription);
			};
			rulesSection.appendChild(rulesTitle);
			rulesSection.appendChild(rulesMeta);
			rulesSection.appendChild(rulesPreview);

			agentManagerDetail.appendChild(head);
			agentManagerDetail.appendChild(form);
			agentManagerDetail.appendChild(skillsSection);
			agentManagerDetail.appendChild(rulesSection);
		}

		function renderAgentCreateTextField(labelText, value, onInput) {
			const field = document.createElement("label");
			field.className = "agent-editor-field";
			const label = document.createElement("span");
			label.textContent = labelText;
			const input = document.createElement("input");
			input.value = value || "";
			input.autocomplete = "off";
			input.addEventListener("input", () => onInput(input.value));
			field.appendChild(label);
			field.appendChild(input);
			return field;
		}

		function renderAgentCreateTextArea(labelText, value, onInput) {
			const field = document.createElement("label");
			field.className = "agent-editor-field";
			const label = document.createElement("span");
			label.textContent = labelText;
			const input = document.createElement("textarea");
			input.value = value || "";
			input.addEventListener("input", () => onInput(input.value));
			field.appendChild(label);
			field.appendChild(input);
			return field;
		}

		function renderAgentCreateBrowserField() {
			const field = document.createElement("label");
			field.className = "agent-editor-field";
			const label = document.createElement("span");
			label.textContent = "默认浏览器";
			const select = document.createElement("select");
			renderBrowserOptions(select, state.agentCreateDefaultBrowserId || "");
			select.addEventListener("change", () => {
				state.agentCreateDefaultBrowserId = String(select.value || "").trim();
			});
			field.appendChild(label);
			field.appendChild(select);
			return field;
		}

			function renderAgentCreateModelField() {
				const field = document.createElement("div");
				field.className = "agent-manager-create-grid";
				field.style.gridTemplateColumns = "1fr 1fr";
				const providerField = document.createElement("label");
				providerField.className = "agent-editor-field";
				const providerLabel = document.createElement("span");
				providerLabel.textContent = "默认模型提供商";
				const providerSelect = document.createElement("select");
				const providerDefault = document.createElement("option");
				providerDefault.value = "";
				providerDefault.textContent = "跟随全局默认";
				providerSelect.appendChild(providerDefault);
				if (state.modelConfig?.providers) {
					for (const prov of state.modelConfig.providers) {
						const opt = document.createElement("option");
						opt.value = prov.id || "";
						opt.textContent = prov.name || prov.id || "";
						providerSelect.appendChild(opt);
					}
				}
				const modelField = document.createElement("label");
				modelField.className = "agent-editor-field";
				const modelLabel = document.createElement("span");
				modelLabel.textContent = "默认模型";
				const modelSelect = document.createElement("select");
				const modelDefault = document.createElement("option");
				modelDefault.value = "";
				modelDefault.textContent = "跟随全局默认";
				modelSelect.appendChild(modelDefault);
				providerSelect.addEventListener("change", () => {
					modelSelect.innerHTML = "";
					modelSelect.appendChild(modelDefault.cloneNode(true));
					state.agentCreateDefaultModelProvider = providerSelect.value;
					state.agentCreateDefaultModelId = "";
					if (providerSelect.value && state.modelConfig?.providers) {
						const prov = state.modelConfig.providers.find((p) => p.id === providerSelect.value);
						if (prov) {
							for (const m of prov.models || []) {
								const opt = document.createElement("option");
								opt.value = m.id || "";
								opt.textContent = m.name || m.id || "";
								modelSelect.appendChild(opt);
							}
						}
					}
				});
				modelSelect.addEventListener("change", () => {
					state.agentCreateDefaultModelId = modelSelect.value;
				});
				providerField.appendChild(providerLabel);
				providerField.appendChild(providerSelect);
				modelField.appendChild(modelLabel);
				modelField.appendChild(modelSelect);
				field.appendChild(providerField);
				field.appendChild(modelField);
				return field;
			}

		function renderAgentCreateSkillsSection() {
			const section = document.createElement("section");
			section.className = "agent-manager-create-section";
			const title = document.createElement("strong");
			title.textContent = "初始系统技能";
			const meta = document.createElement("span");
			meta.className = "agent-manager-skill-meta";
			meta.textContent = "三件套基础技能默认集成；可额外复制主 Agent 当前已有技能。";
			const required = document.createElement("div");
			required.className = "agent-manager-skill-empty";
			required.textContent = "默认：" + getRequiredAgentSkillNames().join(" / ");
			const list = document.createElement("div");
			list.className = "agent-manager-skill-picker";
			if (state.agentManagerAvailableInitialSkillsLoading) {
				const empty = document.createElement("div");
				empty.className = "agent-manager-skill-empty";
				empty.textContent = "正在读取主 Agent 技能清单。";
				list.appendChild(empty);
			} else if (!state.agentManagerAvailableInitialSkills?.length) {
				const empty = document.createElement("div");
				empty.className = "agent-manager-skill-empty";
				empty.textContent = "没有可复制的额外技能。";
				list.appendChild(empty);
			} else {
				const selected = new Set(state.agentCreateSelectedSkillNames || []);
				for (const skill of state.agentManagerAvailableInitialSkills) {
					const choice = document.createElement("label");
					choice.className = "agent-manager-skill-choice";
					const input = document.createElement("input");
					input.type = "checkbox";
					input.checked = selected.has(skill.name);
					input.addEventListener("change", () => {
						const next = new Set(state.agentCreateSelectedSkillNames || []);
						if (input.checked) {
							next.add(skill.name);
						} else {
							next.delete(skill.name);
						}
						state.agentCreateSelectedSkillNames = Array.from(next).sort();
					});
					const copy = document.createElement("span");
					copy.textContent = skill.name;
					choice.appendChild(input);
					choice.appendChild(copy);
					list.appendChild(choice);
				}
			}
			section.appendChild(title);
			section.appendChild(meta);
			section.appendChild(required);
			section.appendChild(list);
			return section;
		}

		function renderAgentManagerSkillPanel(agent) {
			const panel = document.createElement("section");
			panel.className = "agent-manager-skill-panel";
			const head = document.createElement("div");
			head.className = "agent-manager-skill-head";
			const copy = document.createElement("div");
			const title = document.createElement("strong");
			title.textContent = "技能透明视图";
			const meta = document.createElement("div");
			meta.className = "agent-manager-skill-meta";
			meta.textContent = "展示该 Agent 已安装技能及启用状态，可单独开关非必需技能。";
			copy.appendChild(title);
			copy.appendChild(meta);
			const actions = document.createElement("div");
			actions.className = "agent-manager-actions";
			const refresh = document.createElement("button");
			refresh.type = "button";
			refresh.textContent = state.agentManagerSkillsLoadingByAgentId?.[agent.agentId] ? "读取中" : "刷新技能";
			refresh.disabled = Boolean(state.agentManagerSkillsLoadingByAgentId?.[agent.agentId]);
			refresh.addEventListener("click", () => {
				void loadAgentManagerSkills(agent);
			});
			actions.appendChild(refresh);
			head.appendChild(copy);
			head.appendChild(actions);
			const list = document.createElement("div");
			list.id = "agent-manager-skill-list";
			list.className = "agent-manager-skill-list";
			const skills = state.agentManagerSkillsByAgentId?.[agent.agentId];
			if (!isMainAgent(agent)) {
				list.appendChild(renderAgentSkillInstallRow(agent, Array.isArray(skills) ? skills : []));
			}
			if (!Array.isArray(skills)) {
				const empty = document.createElement("div");
				empty.className = "agent-manager-skill-empty";
				empty.textContent = "尚未读取技能清单。点击刷新技能查看真实运行态。";
				list.appendChild(empty);
			} else if (skills.length === 0) {
				const empty = document.createElement("div");
				empty.className = "agent-manager-skill-empty";
				empty.textContent = "该 Agent 当前没有加载技能。";
				list.appendChild(empty);
			} else {
				for (const skill of skills) {
					const item = document.createElement("article");
					item.className = "agent-manager-skill-item" + (skill.enabled === false ? " is-disabled" : "");
					const row = document.createElement("div");
					row.className = "agent-manager-skill-item-head";
					const toggle = document.createElement("button");
					toggle.type = "button";
					toggle.className = "agent-manager-skill-toggle";
					toggle.setAttribute("role", "switch");
					toggle.setAttribute("aria-checked", skill.enabled !== false ? "true" : "false");
					const isRequired = getRequiredAgentSkillNames().includes(skill?.name || "");
					const toggleActionKey = agent.agentId + ":" + (skill?.name || "") + ":toggle";
					toggle.textContent = state.agentManagerSkillActionKey === toggleActionKey
						? (skill.enabled !== false ? "关..." : "开...")
						: (skill.enabled !== false ? "开" : "关");
					toggle.disabled = isRequired || state.agentManagerSkillActionKey === toggleActionKey;
					toggle.addEventListener("click", () => {
						void updateAgentSkillEnabled(agent, skill?.name || "", skill.enabled !== false ? false : true);
					});
					row.appendChild(toggle);
					const name = document.createElement("strong");
					name.textContent = skill?.name || "unknown";
					row.appendChild(name);
					if (isRequired) {
						const requiredBadge = document.createElement("span");
						requiredBadge.className = "agent-manager-skill-required";
						requiredBadge.textContent = "必需";
						row.appendChild(requiredBadge);
					}
					if (!isMainAgent(agent) && !isRequired) {
						const removeButton = document.createElement("button");
						removeButton.type = "button";
						const actionKey = agent.agentId + ":" + (skill?.name || "");
						removeButton.textContent = state.agentManagerSkillActionKey === actionKey ? "删除中" : "删除";
						removeButton.disabled = state.agentManagerSkillActionKey === actionKey;
						removeButton.addEventListener("click", () => {
							void removeAgentSkillFromManager(agent, skill?.name || "");
						});
						row.appendChild(removeButton);
					}
					item.appendChild(row);
					list.appendChild(item);
				}
			}
			panel.appendChild(head);
			panel.appendChild(list);
			return panel;
		}

		function renderAgentSkillInstallRow(agent, skills) {
			const row = document.createElement("div");
			row.className = "agent-manager-skill-install";
			const current = new Set((Array.isArray(skills) ? skills : []).map((skill) => String(skill?.name || "").trim()).filter(Boolean));
			const available = (state.agentManagerAvailableInitialSkills || [])
				.filter((skill) => skill?.name && !current.has(skill.name))
				.sort((left, right) => left.name.localeCompare(right.name));
			const select = document.createElement("select");
			select.disabled = Boolean(state.agentManagerAvailableInitialSkillsLoading || state.agentManagerSkillActionKey);
			const placeholder = document.createElement("option");
			placeholder.value = "";
			placeholder.textContent = state.agentManagerAvailableInitialSkillsLoading ? "正在读取主 Agent 技能" : "选择要复制安装的技能";
			select.appendChild(placeholder);
			for (const skill of available) {
				const option = document.createElement("option");
				option.value = skill.name;
				option.textContent = skill.name;
				select.appendChild(option);
			}
			if (state.agentManagerSelectedInstallSkillName && available.some((skill) => skill.name === state.agentManagerSelectedInstallSkillName)) {
				select.value = state.agentManagerSelectedInstallSkillName;
			}
			select.addEventListener("change", () => {
				state.agentManagerSelectedInstallSkillName = select.value;
				installButton.disabled = acting || !available.length || !select.value;
			});
			const installButton = document.createElement("button");
			installButton.type = "button";
			const acting = state.agentManagerSkillActionKey === agent.agentId + ":install";
			installButton.textContent = acting ? "安装中" : "复制安装";
			installButton.disabled = acting || !available.length || !select.value;
			installButton.addEventListener("click", () => {
				void installAgentSkillFromManager(agent, select.value);
			});
			row.appendChild(select);
			row.appendChild(installButton);
			return row;
		}

		function renderAgentManagerRulesCard(agent) {
			const card = document.createElement("button");
			card.type = "button";
			card.className = "agent-manager-rules-card";
			card.addEventListener("click", (event) => {
				void openAgentRulesEditor(agent, event.currentTarget);
			});
			const copy = document.createElement("div");
			copy.className = "agent-manager-rules-card-copy";
			const title = document.createElement("strong");
			title.textContent = "AGENTS.md";
			const rules = state.agentManagerRulesByAgentId?.[agent.agentId];
			const meta = document.createElement("span");
			meta.textContent = rules?.path || "点击打开并编辑该 Agent 的规则文件";
			copy.appendChild(title);
			copy.appendChild(meta);
			const action = document.createElement("span");
			action.className = "agent-manager-rules-card-action";
			action.textContent = state.agentManagerRulesLoadingByAgentId?.[agent.agentId] ? "读取中" : "打开";
			card.appendChild(copy);
			card.appendChild(action);
			return card;
		}

		async function loadAgentManager(options) {
			if (!options?.silent) {
				clearError();
			}
			state.agentManagerLoading = true;
			refreshAgentManagerButton.disabled = true;
			refreshAgentManagerButton.textContent = "刷新中";
			agentManagerList.setAttribute("aria-busy", "true");
			try {
				await Promise.all([loadAgentCatalog(), loadBrowserCatalog(), loadModelConfig()]);
				const selected = getSelectedAgentForManager();
				if (selected) {
					state.agentManagerSelectedAgentId = selected.agentId;
					void ensureAgentManagerSkills(selected);
					if (!isMainAgent(selected)) {
						void loadAgentManagerAvailableInitialSkills();
					}
				}
				renderAgentManager();
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "无法读取 Agent 列表";
				showError(messageText);
			} finally {
				state.agentManagerLoading = false;
				refreshAgentManagerButton.disabled = false;
				refreshAgentManagerButton.textContent = "刷新";
				agentManagerList.removeAttribute("aria-busy");
			}
		}

		async function loadAgentManagerAvailableInitialSkills() {
			if (state.agentManagerAvailableInitialSkillsLoading || state.agentManagerAvailableInitialSkills?.length) {
				return;
			}
			state.agentManagerAvailableInitialSkillsLoading = true;
			renderAgentManager();
			try {
				const response = await fetch("/v1/agents/main/debug/skills", {
					method: "GET",
					headers: { accept: "application/json" },
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.message || "无法读取主 Agent 技能");
				}
				const required = new Set(getRequiredAgentSkillNames());
				state.agentManagerAvailableInitialSkills = (Array.isArray(payload?.skills) ? payload.skills : [])
					.map((skill) => ({ name: String(skill?.name || "").trim() }))
					.filter((skill) => skill.name && !required.has(skill.name))
					.sort((left, right) => left.name.localeCompare(right.name));
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "无法读取主 Agent 技能";
				showError(messageText);
			} finally {
				state.agentManagerAvailableInitialSkillsLoading = false;
				renderAgentManager();
			}
		}

		async function confirmAgentBrowserChangeIfNeeded(agent, nextBrowserId) {
			const currentBrowserId = String(agent?.defaultBrowserId || "").trim();
			const normalizedNextBrowserId = String(nextBrowserId || "").trim();
			if (currentBrowserId === normalizedNextBrowserId) {
				return true;
			}
			return await openConfirmDialog({
				title: "确认浏览器绑定变更",
				description:
					"目标对象：Agent · " +
					(agent?.name || agent?.agentId || "新 Agent") +
					"\\n当前浏览器：" +
					getBrowserLabel(currentBrowserId) +
					"\\n目标浏览器：" +
					(normalizedNextBrowserId
						? getBrowserLabel(normalizedNextBrowserId)
						: "跟随系统默认（" + getBrowserLabel(state.defaultBrowserId || "default") + "）") +
					"\\n影响范围：保存成功后影响后续 run\\n保存条件：该 Agent 当前不能有运行中任务\\n不会做：不复制 cookie、不迁移 Chrome profile、不启动或关闭 Chrome",
				confirmText: "确认变更",
				cancelText: "取消",
				tone: "danger",
			});
		}

		async function confirmAgentCreateBrowserIfNeeded(agentId, name, nextBrowserId) {
			const normalizedNextBrowserId = String(nextBrowserId || "").trim();
			if (!normalizedNextBrowserId) {
				return true;
			}
			return await confirmAgentBrowserChangeIfNeeded(
				{ agentId, name, defaultBrowserId: "" },
				normalizedNextBrowserId,
			);
		}

		async function saveAgentEditor() {
			if (state.agentEditorSaving) {
				return;
			}
			const agentId = String(agentEditorIdInput.value || "").trim();
			const name = String(agentEditorNameInput.value || "").trim();
			const description = String(agentEditorDescriptionInput.value || "").trim();
			const defaultBrowserId = String(agentEditorBrowserSelect.value || "").trim();
			if (!agentId || !name || !description) {
				setAgentEditorError("Agent ID、显示名称和用途描述都要填写。");
				return;
			}
			const editing = state.agentEditorMode === "edit";
			const modelSelectionPatch = buildAgentEditorModelSelectionPatch();
			if (modelSelectionPatch === null) {
				return;
			}
			const currentAgent = getManagedAgentCatalog().find((entry) => entry.agentId === agentId) || {
				agentId,
				name,
				defaultBrowserId: "",
			};
			const confirmed = editing
				? await confirmAgentBrowserChangeIfNeeded(currentAgent, defaultBrowserId)
				: await confirmAgentCreateBrowserIfNeeded(agentId, name, defaultBrowserId);
			if (!confirmed) {
				return;
			}
			const browserBindingChanged =
				editing && String(currentAgent?.defaultBrowserId || "").trim() !== defaultBrowserId;
			state.agentEditorSaving = true;
			setAgentEditorError("");
			renderAgentEditor();
			try {
				const headers = {
					accept: "application/json",
					"content-type": "application/json",
					...(browserBindingChanged
						? {
								"x-ugk-browser-binding-confirmed": "true",
								"x-ugk-browser-binding-source": "playground",
							}
						: {}),
				};
				const response = await fetch(
					editing ? "/v1/agents/" + encodeURIComponent(agentId) : "/v1/agents",
					{
						method: editing ? "PATCH" : "POST",
						headers,
						body: JSON.stringify({
							agentId,
							name,
							description,
							...(editing || defaultBrowserId ? { defaultBrowserId: defaultBrowserId || null } : {}),
							...modelSelectionPatch,
						}),
					},
				);
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.message || "无法保存 Agent");
				}
				await loadAgentCatalog();
				state.agentManagerSelectedAgentId = agentId;
				renderAgentSelector();
				renderAgentManager();
				closeAgentEditor();
				setAgentManagerNotice((editing ? "已更新：" : "已创建：") + (payload?.agent?.name || name));
				const nextAgent = getManagedAgentCatalog().find((entry) => entry.agentId === agentId);
				if (nextAgent) {
					void loadAgentManagerSkills(nextAgent);
				}
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "无法保存 Agent";
				setAgentEditorError(messageText);
			} finally {
				state.agentEditorSaving = false;
				renderAgentEditor();
			}
		}

		async function createAgentFromManager() {
			if (state.agentEditorSaving) {
				return;
			}
			const agentId = deriveNextAgentId(state.agentCreateName);
			const name = String(state.agentCreateName || "").trim();
			const description = String(state.agentCreateDescription || "").trim();
			if (!name || !description) {
				setAgentEditorError("Agent 名称和用途描述都要填写。");
				setAgentManagerNotice("Agent 名称和用途描述都要填写。");
				return;
			}
			const confirmed = await confirmAgentCreateBrowserIfNeeded(agentId, name, state.agentCreateDefaultBrowserId);
			if (!confirmed) {
				return;
			}
			state.agentEditorSaving = true;
			setAgentEditorError("");
			renderAgentManager();
			try {
				const response = await fetch("/v1/agents", {
					method: "POST",
					headers: {
						accept: "application/json",
						"content-type": "application/json",
					},
					body: JSON.stringify({
						agentId,
						name,
						description,
						...(state.agentCreateDefaultBrowserId ? { defaultBrowserId: state.agentCreateDefaultBrowserId } : {}),
						initialSystemSkillNames: state.agentCreateSelectedSkillNames || [],
						...(state.agentCreateDefaultModelProvider && state.agentCreateDefaultModelId
							? { defaultModelProvider: state.agentCreateDefaultModelProvider, defaultModelId: state.agentCreateDefaultModelId } : {}),
					}),
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.message || "无法创建 Agent");
				}
				await loadAgentCatalog();
				state.agentManagerMode = "detail";
				state.agentManagerSelectedAgentId = agentId;
				state.agentCreateName = "";
				state.agentCreateDescription = "";
				state.agentCreateDefaultBrowserId = "";
					state.agentCreateDefaultModelProvider = "";
					state.agentCreateDefaultModelId = "";
				state.agentCreateSelectedSkillNames = [];
				renderAgentSelector();
				renderAgentManager();
				setAgentManagerNotice("已创建：" + (payload?.agent?.name || name));
				const nextAgent = getManagedAgentCatalog().find((entry) => entry.agentId === agentId);
				if (nextAgent) {
					void loadAgentManagerSkills(nextAgent);
					void loadAgentManagerRules(nextAgent);
				}
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "无法创建 Agent";
				setAgentEditorError(messageText);
				setAgentManagerNotice(messageText);
			} finally {
				state.agentEditorSaving = false;
				renderAgentManager();
			}
		}

		async function ensureAgentManagerSkills(agent) {
			if (!agent?.agentId || Array.isArray(state.agentManagerSkillsByAgentId?.[agent.agentId])) {
				return;
			}
			await loadAgentManagerSkills(agent);
		}

		async function loadAgentManagerSkills(agent) {
			if (!agent?.agentId || state.agentManagerSkillsLoadingByAgentId?.[agent.agentId]) {
				return;
			}
			state.agentManagerSkillsLoadingByAgentId = {
				...(state.agentManagerSkillsLoadingByAgentId || {}),
				[agent.agentId]: true,
			};
			renderAgentManager();
			try {
				const response = await fetch("/v1/agents/" + encodeURIComponent(agent.agentId) + "/skills", {
					method: "GET",
					headers: { accept: "application/json" },
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.message || "无法读取技能清单");
				}
				state.agentManagerSkillsByAgentId = {
					...(state.agentManagerSkillsByAgentId || {}),
					[agent.agentId]: Array.isArray(payload?.skills) ? payload.skills : [],
				};
				setAgentManagerNotice("已读取 " + (agent.name || agent.agentId) + " 的技能清单。");
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "无法读取技能清单";
				showError(messageText);
			} finally {
				const nextLoading = { ...(state.agentManagerSkillsLoadingByAgentId || {}) };
				delete nextLoading[agent.agentId];
				state.agentManagerSkillsLoadingByAgentId = nextLoading;
				renderAgentManager();
			}
		}

		async function updateAgentSkillEnabled(agent, skillName, enabled) {
				if (!agent?.agentId || !skillName) {
					return;
				}
				const actionKey = agent.agentId + ":" + skillName + ":toggle";
				state.agentManagerSkillActionKey = actionKey;
				renderAgentManager();
				try {
					const response = await fetch(
						"/v1/agents/" + encodeURIComponent(agent.agentId) + "/skills/" + encodeURIComponent(skillName),
						{
							method: "PATCH",
							headers: {
								"content-type": "application/json",
								accept: "application/json",
							},
							body: JSON.stringify({ enabled }),
						},
					);
					const payload = await response.json().catch(() => ({}));
					if (!response.ok) {
						throw new Error(payload?.message || "无法更新技能开关");
					}
					await loadAgentManagerSkills(agent, { force: true });
					setAgentManagerNotice(enabled ? "已启用 " + skillName : "已关闭 " + skillName);
				} catch (error) {
					showError(error instanceof Error ? error.message : "无法更新技能开关");
				} finally {
					state.agentManagerSkillActionKey = "";
					renderAgentManager();
				}
			}

			async function installAgentSkillFromManager(agent, skillName) {
			const normalizedSkillName = String(skillName || "").trim();
			if (!agent?.agentId || !normalizedSkillName || state.agentManagerSkillActionKey) {
				return;
			}
			const confirmed = await openConfirmDialog({
				title: "复制安装技能？",
				description:
					"将从主 Agent 当前已有技能中复制 " +
					normalizedSkillName +
					" 到 " +
					(agent.name || agent.agentId) +
					" 的独立用户技能目录。不会共享主 Agent 技能目录。",
				confirmText: "安装",
				cancelText: "取消",
			});
			if (!confirmed) {
				return;
			}
			state.agentManagerSkillActionKey = agent.agentId + ":install";
			renderAgentManager();
			try {
				const response = await fetch("/v1/agents/" + encodeURIComponent(agent.agentId) + "/skills", {
					method: "POST",
					headers: {
						accept: "application/json",
						"content-type": "application/json",
					},
					body: JSON.stringify({ skillName: normalizedSkillName }),
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.message || "无法安装技能");
				}
				state.agentManagerSelectedInstallSkillName = "";
				delete state.agentManagerSkillsByAgentId?.[agent.agentId];
				await loadAgentManagerSkills(agent);
				setAgentManagerNotice("已安装 " + normalizedSkillName + " 到 " + (agent.name || agent.agentId) + "。");
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "无法安装技能";
				showError(messageText);
			} finally {
				state.agentManagerSkillActionKey = "";
				renderAgentManager();
			}
		}

		async function removeAgentSkillFromManager(agent, skillName) {
			const normalizedSkillName = String(skillName || "").trim();
			if (!agent?.agentId || !normalizedSkillName || state.agentManagerSkillActionKey) {
				return;
			}
			const confirmed = await openConfirmDialog({
				title: "删除技能？",
				description:
					"将从 " +
					(agent.name || agent.agentId) +
					" 的独立技能目录删除 " +
					normalizedSkillName +
					"。主 Agent 和其他 Agent 不受影响。",
				confirmText: "删除",
				cancelText: "取消",
				tone: "danger",
			});
			if (!confirmed) {
				return;
			}
			state.agentManagerSkillActionKey = agent.agentId + ":" + normalizedSkillName;
			renderAgentManager();
			try {
				const response = await fetch(
					"/v1/agents/" + encodeURIComponent(agent.agentId) + "/skills/" + encodeURIComponent(normalizedSkillName),
					{
						method: "DELETE",
						headers: { accept: "application/json" },
					},
				);
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.message || "无法删除技能");
				}
				delete state.agentManagerSkillsByAgentId?.[agent.agentId];
				await loadAgentManagerSkills(agent);
				setAgentManagerNotice("已删除 " + normalizedSkillName + "。");
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "无法删除技能";
				showError(messageText);
			} finally {
				state.agentManagerSkillActionKey = "";
				renderAgentManager();
			}
		}

		async function loadAgentManagerRules(agent) {
			if (!agent?.agentId || state.agentManagerRulesLoadingByAgentId?.[agent.agentId]) {
				return;
			}
			state.agentManagerRulesLoadingByAgentId = {
				...(state.agentManagerRulesLoadingByAgentId || {}),
				[agent.agentId]: true,
			};
			renderAgentManager();
			try {
				const response = await fetch("/v1/agents/" + encodeURIComponent(agent.agentId) + "/rules", {
					method: "GET",
					headers: { accept: "application/json" },
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.message || "无法读取 AGENTS.md");
				}
				state.agentManagerRulesByAgentId = {
					...(state.agentManagerRulesByAgentId || {}),
					[agent.agentId]: {
						fileName: payload?.fileName || "AGENTS.md",
						path: payload?.path || "",
						exists: Boolean(payload?.exists),
						content: payload?.content || "",
					},
				};
				setAgentManagerNotice("已读取 " + (agent.name || agent.agentId) + " 的 AGENTS.md。");
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "无法读取 AGENTS.md";
				showError(messageText);
			} finally {
				const nextLoading = { ...(state.agentManagerRulesLoadingByAgentId || {}) };
				delete nextLoading[agent.agentId];
				state.agentManagerRulesLoadingByAgentId = nextLoading;
				renderAgentManager();
			}
		}

		async function saveAgentRulesEditor() {
			if (state.agentRulesEditorSaving) {
				return;
			}
			const agentId = String(state.agentRulesEditorAgentId || "").trim();
			if (!agentId) {
				setAgentRulesEditorError("没有选中的 Agent。");
				return;
			}
			const content = String(agentRulesEditorInput.value || "");
			state.agentRulesEditorSaving = true;
			state.agentRulesEditorContent = content;
			setAgentRulesEditorError("");
			renderAgentRulesEditor();
			try {
				const response = await fetch("/v1/agents/" + encodeURIComponent(agentId) + "/rules", {
					method: "PATCH",
					headers: {
						accept: "application/json",
						"content-type": "application/json",
					},
					body: JSON.stringify({ content }),
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.message || "无法保存 AGENTS.md");
				}
				state.agentManagerRulesByAgentId = {
					...(state.agentManagerRulesByAgentId || {}),
					[agentId]: {
						fileName: payload?.fileName || "AGENTS.md",
						path: payload?.path || "",
						exists: true,
						content: payload?.content || "",
					},
				};
				const agent = getManagedAgentCatalog().find((entry) => entry.agentId === agentId);
				setAgentManagerNotice("已保存 " + (agent?.name || agentId) + " 的 AGENTS.md。");
				closeAgentRulesEditor();
				renderAgentManager();
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "无法保存 AGENTS.md";
				setAgentRulesEditorError(messageText);
			} finally {
				state.agentRulesEditorSaving = false;
				renderAgentRulesEditor();
			}
		}

		async function archiveAgentFromManager(agent) {
			if (!agent?.agentId || state.agentManagerActionAgentId) {
				return;
			}
			const confirmed = await openConfirmDialog({
				title: "删除 Agent？",
				description:
					"Agent：" +
					(agent.name || agent.agentId) +
					"\\n\\n删除后会从当前列表移除，并把它的运行目录归档保留。主 Agent 不受影响。",
				confirmText: "删除",
				cancelText: "取消",
				tone: "danger",
			});
			if (!confirmed) {
				return;
			}
			state.agentManagerActionAgentId = agent.agentId;
			renderAgentManager();
			try {
				const response = await fetch("/v1/agents/" + encodeURIComponent(agent.agentId) + "/archive", {
					method: "POST",
					headers: { accept: "application/json" },
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.message || "无法删除 Agent");
				}
				if (agent.agentId === getCurrentAgentId()) {
					await switchAgent("main");
				}
				await loadAgentCatalog();
				delete state.agentManagerSkillsByAgentId?.[agent.agentId];
				delete state.agentManagerRulesByAgentId?.[agent.agentId];
				state.agentManagerSelectedAgentId = "";
				renderAgentSelector();
				renderAgentManager();
				setAgentManagerNotice("已删除：" + (agent.name || agent.agentId));
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "无法删除 Agent";
				showError(messageText);
			} finally {
				state.agentManagerActionAgentId = "";
				renderAgentManager();
			}
		}

		function openStandaloneAgentsPage() {
			window.location.assign("/playground/agents");
		}

		function bindAgentManagerEvents() {
			agentSelectorStatus?.addEventListener("click", () => {
				if (typeof isTeamConsoleEmbed === "function" && isTeamConsoleEmbed()) {
					return;
				}
				openStandaloneAgentsPage();
			});
			refreshAgentManagerButton.addEventListener("click", () => {
				void loadAgentManager({ silent: false });
			});
			openAgentEditorButton.addEventListener("click", (event) => {
				openAgentEditor("create", null, event.currentTarget);
			});
			closeAgentManagerButton.addEventListener("click", closeAgentManager);
			agentManagerDialog.addEventListener("click", (event) => {
				if (event.target === agentManagerDialog) {
					closeAgentManager();
				}
			});
				if (agentEditorModelProviderSelect) {
					agentEditorModelProviderSelect.addEventListener("change", () => {
						renderModelSelectForProvider(agentEditorModelProviderSelect.value, "");
					});
				}
			agentEditorForm.addEventListener("submit", (event) => {
				event.preventDefault();
				void saveAgentEditor();
			});
			cancelAgentEditorButton.addEventListener("click", closeAgentEditor);
			closeAgentEditorButton.addEventListener("click", closeAgentEditor);
			agentEditorDialog.addEventListener("click", (event) => {
				if (event.target === agentEditorDialog) {
					closeAgentEditor();
				}
			});
			agentRulesEditorInput.addEventListener("input", () => {
				state.agentRulesEditorContent = agentRulesEditorInput.value;
			});
			saveAgentRulesEditorButton.addEventListener("click", () => {
				void saveAgentRulesEditor();
			});
			cancelAgentRulesEditorButton.addEventListener("click", closeAgentRulesEditor);
			closeAgentRulesEditorButton.addEventListener("click", closeAgentRulesEditor);
			agentRulesEditorDialog.addEventListener("click", (event) => {
				if (event.target === agentRulesEditorDialog) {
					closeAgentRulesEditor();
				}
			});
		}
	`;
}
