import {
	getStandaloneBaseCss,
	getStandaloneBaseJs,
	renderStandaloneToastContainer,
	STANDALONE_FAVICON,
	STANDALONE_THEME_INLINE_SCRIPT,
} from "./standalone-page-shared.js";

function getModelSourcesPageCss(): string {
	return `
		:root, [data-theme="dark"] {
			--ms-bg: #081019;
			--ms-surface: #0f1722;
			--ms-surface-2: #141d2a;
			--ms-surface-3: #192435;
			--ms-border: #243246;
			--ms-border-strong: #34465f;
			--ms-fg: #f5f8fc;
			--ms-fg-2: #bfcbda;
			--ms-muted: #8290a3;
			--ms-primary: #2f7dd3;
			--ms-primary-soft: rgba(47, 125, 211, 0.16);
			--ms-green: #20b26b;
			--ms-green-soft: rgba(32, 178, 107, 0.15);
			--ms-amber: #d99a20;
			--ms-amber-soft: rgba(217, 154, 32, 0.15);
			--ms-red: #df5a67;
			--ms-red-soft: rgba(223, 90, 103, 0.14);
			--ms-cyan: #20a9b8;
			--ms-cyan-soft: rgba(32, 169, 184, 0.14);
			--radius-card: 8px;
			--radius-btn: 8px;
			--radius-input: 8px;
		}

		[data-theme="light"] {
			--ms-bg: #eef3f7;
			--ms-surface: #ffffff;
			--ms-surface-2: #f7f9fc;
			--ms-surface-3: #edf2f7;
			--ms-border: #d4dde8;
			--ms-border-strong: #aebdce;
			--ms-fg: #182231;
			--ms-fg-2: #46576a;
			--ms-muted: #75869a;
			--ms-primary: #2368ad;
			--ms-primary-soft: rgba(35, 104, 173, 0.11);
			--ms-green: #12894e;
			--ms-green-soft: rgba(18, 137, 78, 0.11);
			--ms-amber: #a66c00;
			--ms-amber-soft: rgba(166, 108, 0, 0.12);
			--ms-red: #b83a48;
			--ms-red-soft: rgba(184, 58, 72, 0.11);
			--ms-cyan: #087d8b;
			--ms-cyan-soft: rgba(8, 125, 139, 0.11);
		}

		html, body {
			background: var(--ms-bg);
			color: var(--ms-fg);
		}

		#app {
			display: grid;
			grid-template-rows: auto auto minmax(0, 1fr);
			height: 100%;
			overflow: hidden;
			background: var(--ms-bg);
		}

		.sp-topbar {
			background: var(--ms-bg);
			border-bottom: 1px solid var(--ms-border);
		}
		.sp-topbar-btn {
			height: 34px;
			border-color: var(--ms-border);
			color: var(--ms-fg-2);
			letter-spacing: 0;
		}
		.sp-topbar-btn:hover {
			background: var(--ms-primary-soft);
			border-color: var(--ms-border-strong);
			color: var(--ms-fg);
		}

		.ms-stats {
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 14px;
			padding: 18px 22px;
		}
		.ms-stat {
			min-height: 92px;
			padding: 16px;
			border: 1px solid var(--ms-border);
			border-radius: var(--radius-card);
			background: var(--ms-surface);
			display: grid;
			grid-template-columns: minmax(0, 1fr) 42px;
			gap: 12px;
			align-items: center;
		}
		.ms-stat-label {
			color: var(--ms-muted);
			font-size: 12px;
			font-weight: 650;
		}
		.ms-stat-value {
			margin-top: 6px;
			font-size: 28px;
			font-weight: 760;
			line-height: 1;
			font-variant-numeric: tabular-nums;
		}
		.ms-stat-desc {
			margin-top: 5px;
			color: var(--ms-muted);
			font-size: 11px;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.ms-stat-icon {
			width: 42px;
			height: 42px;
			border-radius: 8px;
			display: grid;
			place-items: center;
			font: 700 18px var(--font-mono);
		}
		.ms-stat--primary .ms-stat-value { color: var(--ms-primary); }
		.ms-stat--primary .ms-stat-icon { color: var(--ms-primary); background: var(--ms-primary-soft); }
		.ms-stat--green .ms-stat-value { color: var(--ms-green); }
		.ms-stat--green .ms-stat-icon { color: var(--ms-green); background: var(--ms-green-soft); }
		.ms-stat--amber .ms-stat-value { color: var(--ms-amber); }
		.ms-stat--amber .ms-stat-icon { color: var(--ms-amber); background: var(--ms-amber-soft); }
		.ms-stat--cyan .ms-stat-value { color: var(--ms-cyan); }
		.ms-stat--cyan .ms-stat-icon { color: var(--ms-cyan); background: var(--ms-cyan-soft); }

		.ms-main {
			display: grid;
			grid-template-columns: 310px minmax(340px, 0.95fr) minmax(520px, 1.4fr);
			min-height: 0;
			gap: 14px;
			padding: 0 22px 22px;
			overflow: hidden;
		}
		.ms-pane {
			min-height: 0;
			border: 1px solid var(--ms-border);
			border-radius: var(--radius-card);
			background: var(--ms-surface);
			overflow: hidden;
			display: grid;
			grid-template-rows: auto minmax(0, 1fr);
		}
		.ms-pane--providers,
		.ms-pane--usage {
			grid-template-rows: auto auto minmax(0, 1fr);
		}
		.ms-pane-head {
			min-height: 58px;
			padding: 14px 16px;
			border-bottom: 1px solid var(--ms-border);
			display: flex;
			align-items: center;
			gap: 10px;
		}
		.ms-pane-title {
			font-size: 14px;
			font-weight: 740;
		}
		.ms-pane-subtitle {
			margin-top: 2px;
			color: var(--ms-muted);
			font-size: 11px;
		}
		.ms-pane-spacer { flex: 1; }
		.ms-body {
			min-height: 0;
			overflow: auto;
		}
		.ms-body::-webkit-scrollbar, .ms-provider-list::-webkit-scrollbar, .ms-usage-table-wrap::-webkit-scrollbar {
			width: 7px;
			height: 7px;
		}
		.ms-body::-webkit-scrollbar-thumb, .ms-provider-list::-webkit-scrollbar-thumb, .ms-usage-table-wrap::-webkit-scrollbar-thumb {
			background: var(--ms-border-strong);
			border-radius: 999px;
		}

		.ms-toolbar {
			padding: 12px;
			border-bottom: 1px solid var(--ms-border);
			display: grid;
			gap: 10px;
		}
		.ms-search, .ms-select, .ms-input, .ms-textarea {
			width: 100%;
			border: 1px solid var(--ms-border);
			border-radius: var(--radius-input);
			background: var(--ms-surface-2);
			color: var(--ms-fg);
			font: 13px var(--font-sans);
			outline: none;
		}
		.ms-search, .ms-select, .ms-input {
			height: 38px;
			padding: 0 11px;
		}
		.ms-textarea {
			min-height: 92px;
			padding: 10px 11px;
			resize: vertical;
			line-height: 1.5;
			font-family: var(--font-mono);
		}
		.ms-search:focus, .ms-select:focus, .ms-input:focus, .ms-textarea:focus {
			border-color: var(--ms-primary);
			box-shadow: 0 0 0 3px var(--ms-primary-soft);
		}
		.ms-model-builder {
			display: grid;
			gap: 10px;
		}
		.ms-model-builder-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 10px;
		}
		.ms-model-rows {
			display: grid;
			gap: 8px;
		}
		.ms-model-entry {
			display: grid;
			gap: 10px;
			padding: 10px;
			border: 1px solid var(--ms-border);
			border-radius: 8px;
			background: var(--ms-surface-2);
		}
		.ms-model-entry-main {
			display: grid;
			grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
			gap: 8px;
		}
		.ms-model-entry-limits {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 34px;
			gap: 8px;
			align-items: end;
		}
		.ms-model-entry-field {
			display: grid;
			gap: 5px;
			min-width: 0;
		}
		.ms-model-entry-field label {
			color: var(--ms-muted);
			font-size: 11px;
			font-weight: 680;
		}
		.ms-preset-inputs {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
			gap: 6px;
		}
		.ms-preset-inputs.has-custom {
			grid-template-columns: minmax(0, 1fr) minmax(112px, 0.75fr);
		}
		.ms-preset-custom[hidden] {
			display: none;
		}
		.ms-icon-btn {
			width: 34px;
			height: 34px;
			border: 1px solid var(--ms-border);
			border-radius: 8px;
			background: var(--ms-surface-3);
			color: var(--ms-muted);
			cursor: pointer;
			font: 700 18px var(--font-sans);
			line-height: 1;
		}
		.ms-icon-btn:hover:not(:disabled) {
			border-color: var(--ms-border-strong);
			color: var(--ms-fg);
		}
		.ms-icon-btn:disabled {
			opacity: 0.45;
			cursor: not-allowed;
		}

		.ms-provider-list {
			min-height: 0;
			overflow: auto;
			padding: 8px;
		}
		.ms-provider-item {
			width: 100%;
			border: 1px solid transparent;
			border-radius: 8px;
			background: transparent;
			color: var(--ms-fg);
			text-align: left;
			padding: 12px;
			cursor: pointer;
			font-family: var(--font-sans);
			display: grid;
			gap: 8px;
		}
		.ms-provider-item:hover {
			background: var(--ms-surface-2);
		}
		.ms-provider-item.selected {
			background: var(--ms-primary-soft);
			border-color: var(--ms-primary);
		}
		.ms-provider-name-row {
			display: flex;
			align-items: center;
			gap: 8px;
			min-width: 0;
		}
		.ms-provider-name {
			font-size: 13px;
			font-weight: 720;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.ms-provider-id {
			color: var(--ms-muted);
			font: 11px var(--font-mono);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.ms-provider-meta {
			display: flex;
			gap: 6px;
			flex-wrap: wrap;
		}
		.ms-pill {
			display: inline-flex;
			align-items: center;
			height: 22px;
			padding: 0 8px;
			border-radius: 999px;
			border: 1px solid var(--ms-border);
			background: var(--ms-surface-2);
			color: var(--ms-muted);
			font-size: 11px;
			font-weight: 650;
			white-space: nowrap;
		}
		.ms-pill--custom { color: var(--ms-green); background: var(--ms-green-soft); border-color: transparent; }
		.ms-pill--warn { color: var(--ms-amber); background: var(--ms-amber-soft); border-color: transparent; }
		.ms-pill--ok { color: var(--ms-green); background: var(--ms-green-soft); border-color: transparent; }
		.ms-pill--danger { color: var(--ms-red); background: var(--ms-red-soft); border-color: transparent; }
		.ms-pill--cyan { color: var(--ms-cyan); background: var(--ms-cyan-soft); border-color: transparent; }

		.ms-detail {
			padding: 16px;
			display: grid;
			gap: 14px;
		}
		.ms-detail-title {
			font-size: 22px;
			font-weight: 780;
			line-height: 1.15;
			overflow-wrap: anywhere;
		}
		.ms-kv {
			display: grid;
			grid-template-columns: 112px minmax(0, 1fr);
			gap: 8px 12px;
			padding: 12px;
			border-radius: 8px;
			background: var(--ms-surface-2);
			border: 1px solid var(--ms-border);
		}
		.ms-kv dt {
			color: var(--ms-muted);
			font-size: 12px;
		}
		.ms-kv dd {
			min-width: 0;
			color: var(--ms-fg-2);
			font: 12px var(--font-mono);
			overflow-wrap: anywhere;
		}
		.ms-model-list {
			display: grid;
			gap: 8px;
		}
		.ms-model-row {
			border: 1px solid var(--ms-border);
			background: var(--ms-surface-2);
			border-radius: 8px;
			padding: 10px 12px;
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 12px;
			align-items: center;
		}
		.ms-model-name {
			font-weight: 700;
			overflow-wrap: anywhere;
		}
		.ms-model-id {
			color: var(--ms-muted);
			font: 11px var(--font-mono);
			overflow-wrap: anywhere;
		}
		.ms-model-meta {
			color: var(--ms-muted);
			font: 11px var(--font-mono);
			white-space: nowrap;
		}

		.ms-usage-controls {
			display: grid;
			grid-template-columns: minmax(180px, 1fr) 150px;
			gap: 10px;
		}
		.ms-usage-table-wrap {
			min-height: 0;
			overflow: auto;
		}
		.ms-usage-table {
			width: 100%;
			min-width: 820px;
			border-collapse: separate;
			border-spacing: 0;
		}
		.ms-usage-table th {
			position: sticky;
			top: 0;
			z-index: 1;
			background: var(--ms-surface);
			color: var(--ms-muted);
			font-size: 11px;
			font-weight: 720;
			text-align: left;
			border-bottom: 1px solid var(--ms-border);
			padding: 10px 12px;
		}
		.ms-usage-table td {
			border-bottom: 1px solid var(--ms-border);
			padding: 10px 12px;
			vertical-align: middle;
		}
		.ms-usage-label {
			font-weight: 710;
			overflow-wrap: anywhere;
		}
		.ms-usage-id {
			color: var(--ms-muted);
			font: 11px var(--font-mono);
			margin-top: 2px;
			overflow-wrap: anywhere;
		}
		.ms-table-selects {
			display: grid;
			grid-template-columns: minmax(130px, 1fr) minmax(150px, 1fr);
			gap: 8px;
		}
		.ms-row-actions {
			display: flex;
			gap: 8px;
			align-items: center;
			justify-content: flex-end;
		}
		.ms-btn {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 6px;
			height: 34px;
			padding: 0 12px;
			border: 1px solid var(--ms-border);
			border-radius: var(--radius-btn);
			background: var(--ms-surface-2);
			color: var(--ms-fg-2);
			font: 12px var(--font-sans);
			font-weight: 680;
			cursor: pointer;
		}
		.ms-btn:hover:not(:disabled) {
			border-color: var(--ms-border-strong);
			color: var(--ms-fg);
		}
		.ms-btn:disabled {
			opacity: 0.48;
			cursor: not-allowed;
		}
		.ms-btn-primary {
			background: var(--ms-primary);
			color: white;
			border-color: var(--ms-primary);
		}
		.ms-btn-primary:hover:not(:disabled) {
			color: white;
			filter: brightness(1.06);
		}

		.ms-empty {
			padding: 28px 16px;
			color: var(--ms-muted);
			text-align: center;
			font-size: 12px;
		}
		.ms-loading {
			padding: 18px;
			color: var(--ms-muted);
		}

		.ms-modal {
			position: fixed;
			inset: 0;
			z-index: 80;
			background: rgba(3, 8, 15, 0.58);
			display: grid;
			place-items: center;
			padding: 20px;
		}
		.ms-modal[hidden] { display: none; }
		.ms-modal-panel {
			width: min(720px, 94vw);
			max-height: min(780px, 92vh);
			border: 1px solid var(--ms-border);
			border-radius: 8px;
			background: var(--ms-surface);
			overflow: hidden;
			display: grid;
			grid-template-rows: auto minmax(0, 1fr) auto;
		}
		.ms-modal-head, .ms-modal-foot {
			padding: 16px;
			border-bottom: 1px solid var(--ms-border);
			display: flex;
			align-items: center;
			gap: 10px;
		}
		.ms-modal-foot {
			border-top: 1px solid var(--ms-border);
			border-bottom: 0;
			justify-content: flex-end;
		}
		.ms-modal-body {
			padding: 16px;
			overflow: auto;
			display: grid;
			gap: 12px;
		}
		.ms-field-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 12px;
		}
		.ms-field {
			display: grid;
			gap: 6px;
		}
		.ms-field label {
			color: var(--ms-muted);
			font-size: 12px;
			font-weight: 680;
		}
		.ms-field small {
			color: var(--ms-muted);
			font-size: 11px;
			line-height: 1.4;
		}
		.ms-field-hint {
			color: var(--ms-muted);
			font-size: 11px;
			line-height: 1.4;
		}

		@media (max-width: 1180px) {
			.ms-main {
				grid-template-columns: 280px minmax(0, 1fr);
				grid-template-rows: minmax(340px, 0.9fr) minmax(420px, 1.1fr);
			}
			.ms-pane--usage {
				grid-column: 1 / 3;
			}
		}

		@media (max-width: 760px) {
			#app {
				grid-template-rows: auto minmax(0, 1fr);
			}
			.ms-stats {
				display: none;
			}
			.ms-main {
				grid-template-columns: minmax(0, 1fr);
				grid-template-rows: auto auto minmax(420px, 1fr);
				padding: 12px;
				overflow: auto;
			}
			.ms-pane, .ms-pane--usage {
				grid-column: auto;
				min-height: 320px;
			}
			.ms-field-grid, .ms-usage-controls {
				grid-template-columns: 1fr;
			}
			.ms-model-entry-main,
			.ms-model-entry-limits,
			.ms-preset-inputs.has-custom {
				grid-template-columns: 1fr;
			}
			.ms-topbar-text {
				display: none;
			}
		}
	`;
}

function getModelSourcesPageJs(): string {
	return `
		(function () {
			const state = {
				data: null,
				selectedProviderId: "",
				providerQuery: "",
				usageQuery: "",
				usageKind: "all",
				providerTemplateAuthHeader: undefined,
			};

			function byId(id) { return document.getElementById(id); }

			function providerLabel(provider) {
				return provider.name || provider.id;
			}

			function modelLabel(provider, modelId) {
				const model = (provider && provider.models || []).find((entry) => entry.id === modelId);
				return model ? (model.name || model.id) : modelId;
			}

			function findProvider(id) {
				return (state.data && state.data.providers || []).find((provider) => provider.id === id);
			}

			function getProviderModels(providerId) {
				const provider = findProvider(providerId);
				return provider ? provider.models || [] : [];
			}

			function authPill(provider) {
				const auth = provider.auth || {};
				if (auth.source === "literal") return '<span class="ms-pill ms-pill--ok">已保存密钥</span>';
				if (auth.configured) return '<span class="ms-pill ms-pill--ok">' + escapeHtml(auth.envVar || "已配置") + '</span>';
				if (auth.envVar) return '<span class="ms-pill ms-pill--warn">' + escapeHtml(auth.envVar) + ' 未配置</span>';
				return '<span class="ms-pill ms-pill--warn">缺少密钥</span>';
			}

			function usageKindLabel(kind) {
				if (kind === "global") return "全局";
				if (kind === "agent") return "Agent";
				if (kind === "conn") return "后台任务";
				return kind;
			}

			function inheritedLabel(usage) {
				if (!usage.inherited) return '<span class="ms-pill ms-pill--cyan">显式</span>';
				if (usage.inheritedFrom === "background_profile") return '<span class="ms-pill">继承后台模板</span>';
				return '<span class="ms-pill">继承全局默认</span>';
			}

			async function load() {
				try {
					byId("provider-list").innerHTML = '<div class="ms-loading">加载 API 源...</div>';
					state.data = await fetchJson("/v1/model-sources");
					if (!state.selectedProviderId || !findProvider(state.selectedProviderId)) {
						state.selectedProviderId = (state.data.providers[0] || {}).id || "";
					}
					render();
				} catch (error) {
					byId("provider-list").innerHTML = '<div class="ms-empty">' + escapeHtml(error.message) + '</div>';
					showToast("加载 API 源失败", "danger");
				}
			}

			function render() {
				renderStats();
				renderProviders();
				renderDetail();
				renderUsages();
			}

			function renderStats() {
				const providers = state.data.providers || [];
				const usages = state.data.usages || [];
				byId("stat-providers").textContent = providers.length;
				byId("stat-custom").textContent = providers.filter((provider) => provider.source === "custom").length;
				byId("stat-usages").textContent = usages.length;
				byId("stat-inherited").textContent = usages.filter((usage) => usage.inherited).length;
			}

			function renderProviders() {
				const providers = (state.data.providers || []).filter((provider) => {
					const q = state.providerQuery.trim().toLowerCase();
					if (!q) return true;
					return [provider.id, provider.name, provider.vendor, provider.region].filter(Boolean).join(" ").toLowerCase().includes(q);
				});
				if (!providers.length) {
					byId("provider-list").innerHTML = '<div class="ms-empty">还没有 API 源，点击右上角新增。</div>';
					return;
				}
				byId("provider-list").innerHTML = providers.map((provider) => {
					const selected = provider.id === state.selectedProviderId ? " selected" : "";
					return '<button class="ms-provider-item' + selected + '" type="button" data-provider-id="' + escapeHtml(provider.id) + '">' +
						'<div class="ms-provider-name-row"><div class="ms-provider-name">' + escapeHtml(providerLabel(provider)) + '</div></div>' +
						'<div class="ms-provider-id">' + escapeHtml(provider.id) + '</div>' +
						'<div class="ms-provider-meta">' +
							'<span class="ms-pill ms-pill--custom">自定义</span>' +
							'<span class="ms-pill">' + escapeHtml(String((provider.models || []).length)) + ' 个模型</span>' +
							authPill(provider) +
						'</div>' +
					'</button>';
				}).join("");
				for (const item of document.querySelectorAll("[data-provider-id]")) {
					item.addEventListener("click", () => {
						state.selectedProviderId = item.getAttribute("data-provider-id");
						render();
					});
				}
			}

			function renderDetail() {
				const provider = findProvider(state.selectedProviderId);
				if (!provider) {
					byId("provider-detail").innerHTML = '<div class="ms-empty">新增 API 源后，这里会显示模型和鉴权状态。</div>';
					return;
				}
				const modelRows = (provider.models || []).map((model) => {
					const meta = [
						model.contextWindow ? "上下文 " + model.contextWindow : "",
						model.maxTokens ? "最大输出 " + model.maxTokens : "",
					].filter(Boolean).join(" · ");
					return '<div class="ms-model-row">' +
						'<div><div class="ms-model-name">' + escapeHtml(model.name || model.id) + '</div><div class="ms-model-id">' + escapeHtml(model.id) + '</div></div>' +
						'<div class="ms-model-meta">' + escapeHtml(meta || "-") + '</div>' +
					'</div>';
				}).join("");
				byId("provider-detail").innerHTML =
					'<div class="ms-detail">' +
						'<div>' +
							'<div class="ms-provider-meta">' +
								'<span class="ms-pill ms-pill--custom">自定义</span>' +
								authPill(provider) +
								(provider.vendor ? '<span class="ms-pill">' + escapeHtml(provider.vendor) + '</span>' : '') +
								(provider.region ? '<span class="ms-pill">' + escapeHtml(provider.region) + '</span>' : '') +
							'</div>' +
							'<div class="ms-detail-title" style="margin-top:10px">' + escapeHtml(providerLabel(provider)) + '</div>' +
						'</div>' +
						'<dl class="ms-kv">' +
							'<dt>源标识</dt><dd>' + escapeHtml(provider.id) + '</dd>' +
							'<dt>密钥状态</dt><dd>' + escapeHtml(provider.auth && provider.auth.configured ? "已保存" : "缺失") + '</dd>' +
							'<dt>排序权重</dt><dd>' + escapeHtml(provider.priority || "-") + '</dd>' +
							'<dt>模型数量</dt><dd>' + escapeHtml(String((provider.models || []).length)) + '</dd>' +
						'</dl>' +
						'<div class="ms-model-list">' + (modelRows || '<div class="ms-empty">没有模型</div>') + '</div>' +
					'</div>';
			}

			function filteredUsages() {
				const q = state.usageQuery.trim().toLowerCase();
				return (state.data.usages || []).filter((usage) => {
					if (state.usageKind !== "all" && usage.kind !== state.usageKind) return false;
					if (!q) return true;
					return [usage.kind, usage.id, usage.label, usage.provider, usage.model].filter(Boolean).join(" ").toLowerCase().includes(q);
				});
			}

			function renderUsages() {
				const usages = filteredUsages();
				if (!usages.length) {
					byId("usage-body").innerHTML = '<tr><td colspan="5"><div class="ms-empty">没有匹配的使用对象</div></td></tr>';
					return;
				}
				byId("usage-body").innerHTML = usages.map((usage) => {
					const providerOptions = (state.data.providers || []).map((provider) =>
						'<option value="' + escapeHtml(provider.id) + '"' + (provider.id === usage.provider ? " selected" : "") + '>' + escapeHtml(providerLabel(provider)) + '</option>'
					).join("");
					const models = getProviderModels(usage.provider);
					const modelOptions = models.map((model) =>
						'<option value="' + escapeHtml(model.id) + '"' + (model.id === usage.model ? " selected" : "") + '>' + escapeHtml(model.name || model.id) + '</option>'
					).join("");
					const hasProviders = (state.data.providers || []).length > 0;
					return '<tr data-usage-kind="' + escapeHtml(usage.kind) + '" data-usage-id="' + escapeHtml(usage.id) + '">' +
						'<td><div class="ms-usage-label">' + escapeHtml(usage.label) + '</div><div class="ms-usage-id">' + escapeHtml(usage.id) + '</div></td>' +
						'<td><span class="ms-pill">' + escapeHtml(usageKindLabel(usage.kind)) + '</span></td>' +
						'<td>' + inheritedLabel(usage) + (usage.error ? '<div class="ms-usage-id">' + escapeHtml(usage.error) + '</div>' : '') + '</td>' +
						'<td><div class="ms-table-selects">' +
							'<select class="ms-select js-provider-select" ' + (usage.editable && hasProviders ? "" : "disabled") + '>' + (providerOptions || '<option value="">先新增 API 源</option>') + '</select>' +
							'<select class="ms-select js-model-select" ' + (usage.editable && hasProviders ? "" : "disabled") + '>' + (modelOptions || '<option value="">先新增模型</option>') + '</select>' +
						'</div></td>' +
						'<td><div class="ms-row-actions"><button class="ms-btn js-save-usage" type="button" ' + (usage.editable && hasProviders ? "" : "disabled") + '>保存</button></div></td>' +
					'</tr>';
				}).join("");
				wireUsageRows();
			}

			function wireUsageRows() {
				for (const row of document.querySelectorAll("[data-usage-kind]")) {
					const providerSelect = row.querySelector(".js-provider-select");
					const modelSelect = row.querySelector(".js-model-select");
					const saveButton = row.querySelector(".js-save-usage");
					providerSelect && providerSelect.addEventListener("change", () => {
						const models = getProviderModels(providerSelect.value);
						modelSelect.innerHTML = models.map((model) =>
							'<option value="' + escapeHtml(model.id) + '">' + escapeHtml(model.name || model.id) + '</option>'
						).join("");
					});
					saveButton && saveButton.addEventListener("click", async () => {
						const kind = row.getAttribute("data-usage-kind");
						const id = row.getAttribute("data-usage-id");
						try {
							saveButton.disabled = true;
							await fetchJson("/v1/model-sources/usages/" + encodeURIComponent(kind) + "/" + encodeURIComponent(id), {
								method: "PATCH",
								headers: { "content-type": "application/json" },
								body: JSON.stringify({ provider: providerSelect.value, model: modelSelect.value }),
							});
							showToast("API 源绑定已更新", "success");
							await load();
						} catch (error) {
							showToast(error.message || "保存失败", "danger");
						} finally {
							saveButton.disabled = false;
						}
					});
				}
			}

			function openNewProviderModal() {
				byId("provider-form").reset();
				byId("provider-api").value = "anthropic-messages";
				state.providerTemplateAuthHeader = undefined;
				resetModelInputRows();
				byId("new-provider-modal").hidden = false;
				byId("provider-id").focus();
			}

			function closeNewProviderModal() {
				byId("new-provider-modal").hidden = true;
			}

			let modalPointerDownStartedOnBackdrop = false;

			function isNewProviderBackdropEvent(event) {
				return event.target && event.target.id === "new-provider-modal";
			}

			const contextLengthOptions = [
				{ value: "8192", label: "8192 tokens" },
				{ value: "32768", label: "32K tokens" },
				{ value: "65536", label: "64K tokens" },
				{ value: "128000", label: "128K tokens" },
				{ value: "200000", label: "200K tokens" },
				{ value: "1000000", label: "1M tokens" },
			];
			const outputLengthOptions = [
				{ value: "4096", label: "4096 tokens" },
				{ value: "8192", label: "8192 tokens" },
				{ value: "16384", label: "16K tokens" },
				{ value: "32768", label: "32K tokens" },
				{ value: "65536", label: "64K tokens" },
				{ value: "131072", label: "128K tokens" },
				{ value: "384000", label: "384K tokens" },
			];
			const providerTemplates = {
				"deepseek": {
					id: "deepseek",
					name: "DeepSeek",
					vendor: "deepseek",
					region: "global",
					baseUrl: "https://api.deepseek.com/anthropic",
					api: "anthropic-messages",
					models: [
						{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 1000000, maxTokens: 384000 },
						{ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: 1000000, maxTokens: 384000 },
					],
				},
				"zhipu-glm": {
					id: "zhipu-glm",
					name: "Zhipu GLM",
					vendor: "zhipu",
					region: "cn",
					baseUrl: "https://open.bigmodel.cn/api/anthropic",
					api: "anthropic-messages",
					authHeader: true,
					models: [
						{ id: "glm-5.1", name: "GLM-5.1 (Zhipu)" },
					],
				},
				"xiaomi-mimo-cn": {
					id: "xiaomi-mimo-cn",
					name: "Xiaomi MiMo China",
					vendor: "xiaomi",
					region: "cn",
					baseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
					api: "anthropic-messages",
					models: [
						{ id: "mimo-v2.5-pro", name: "MiMo V2.5 Pro (Xiaomi CN)", contextWindow: 1048576, maxTokens: 16384 },
					],
				},
				"ali-codeplan": {
					id: "ali-codeplan",
					name: "Ali CodePlan",
					vendor: "aliyun",
					region: "cn-beijing",
					baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic",
					api: "anthropic-messages",
					models: [
						{ id: "glm-5.1", name: "GLM-5.1 (Ali CodePlan)", contextWindow: 200000, maxTokens: 128000 },
						{ id: "kimi-k2.6", name: "Kimi K2.6 (Ali CodePlan)", contextWindow: 256000 },
						{ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro (Ali CodePlan)", contextWindow: 1000000 },
						{ id: "qwen3.7-max", name: "Qwen 3.7 Max (Ali CodePlan)", contextWindow: 1000000 },
					],
				},
			};

			function renderPresetOptions(options, value) {
				const selectedValue = String(value || "");
				const hasPreset = options.some((option) => option.value === selectedValue);
				return options.map((option) =>
					'<option value="' + escapeHtml(option.value) + '"' + (option.value === selectedValue ? " selected" : "") + '>' + escapeHtml(option.label) + '</option>'
				).join("") + '<option value="custom"' + (selectedValue && !hasPreset ? " selected" : "") + '>自定义...</option>';
			}

			function applyProviderTemplate(templateId) {
				const template = providerTemplates[templateId];
				if (!template) return;
				byId("provider-id").value = template.id;
				byId("provider-name").value = template.name;
				byId("provider-vendor").value = template.vendor;
				byId("provider-region").value = template.region;
				byId("provider-base-url").value = template.baseUrl;
				byId("provider-api").value = template.api;
				state.providerTemplateAuthHeader = template.authHeader;
				byId("provider-model-rows").innerHTML = "";
				for (const model of template.models) {
					addModelInputRow(model);
				}
			}

			function renderModelInputRow(input) {
				const model = input || {};
				const contextValue = String(model.contextWindow || "");
				const outputValue = String(model.maxTokens || "");
				const contextIsPreset = contextLengthOptions.some((option) => option.value === contextValue);
				const outputIsPreset = outputLengthOptions.some((option) => option.value === outputValue);
				const showCustomContext = Boolean(contextValue && !contextIsPreset);
				const showCustomOutput = Boolean(outputValue && !outputIsPreset);
				return '<div class="ms-model-entry" data-model-row>' +
					'<div class="ms-model-entry-main">' +
						'<div class="ms-model-entry-field">' +
							'<label>模型 ID</label>' +
							'<input class="ms-input js-model-id" required placeholder="模型 ID" value="' + escapeHtml(model.id || "") + '" />' +
						'</div>' +
						'<div class="ms-model-entry-field">' +
							'<label>显示名称</label>' +
							'<input class="ms-input js-model-name" placeholder="显示名称" value="' + escapeHtml(model.name || "") + '" />' +
						'</div>' +
					'</div>' +
					'<div class="ms-model-entry-limits">' +
						'<div class="ms-model-entry-field">' +
							'<label>上下文长度</label>' +
							'<div class="ms-preset-inputs' + (showCustomContext ? " has-custom" : "") + '">' +
								'<select class="ms-select js-model-context-preset">' + renderPresetOptions(contextLengthOptions, contextValue) + '</select>' +
								'<input class="ms-input ms-preset-custom js-model-context" inputmode="numeric" placeholder="上下文长度" value="' + escapeHtml(showCustomContext ? contextValue : "") + '"' + (showCustomContext ? "" : " hidden") + ' />' +
							'</div>' +
						'</div>' +
						'<div class="ms-model-entry-field">' +
							'<label>最大输出</label>' +
							'<div class="ms-preset-inputs' + (showCustomOutput ? " has-custom" : "") + '">' +
								'<select class="ms-select js-model-output-preset">' + renderPresetOptions(outputLengthOptions, outputValue) + '</select>' +
								'<input class="ms-input ms-preset-custom js-model-output" inputmode="numeric" placeholder="最大输出" value="' + escapeHtml(showCustomOutput ? outputValue : "") + '"' + (showCustomOutput ? "" : " hidden") + ' />' +
							'</div>' +
						'</div>' +
						'<button class="ms-icon-btn js-model-remove" type="button" title="删除模型">-</button>' +
					'</div>' +
				'</div>';
			}

			function syncPresetCustomInput(select) {
				const wrapper = select.parentElement;
				const input = wrapper.querySelector(".ms-preset-custom");
				if (!input) return;
				input.hidden = select.value !== "custom";
				wrapper.classList.toggle("has-custom", !input.hidden);
				if (input.hidden) {
					input.value = "";
				}
			}

			function updateModelRemoveButtons() {
				const rows = byId("provider-model-rows").querySelectorAll("[data-model-row]");
				for (const button of byId("provider-model-rows").querySelectorAll(".js-model-remove")) {
					button.disabled = rows.length <= 1;
				}
			}

			function addModelInputRow(input) {
				byId("provider-model-rows").insertAdjacentHTML("beforeend", renderModelInputRow(input));
				updateModelRemoveButtons();
			}

			function resetModelInputRows() {
				byId("provider-model-rows").innerHTML = "";
				addModelInputRow({
					contextWindow: 128000,
					maxTokens: 8192,
				});
			}

			function parseModels() {
				return Array.from(byId("provider-model-rows").querySelectorAll("[data-model-row]")).map((row) => {
					const id = row.querySelector(".js-model-id").value.trim();
					const name = row.querySelector(".js-model-name").value.trim();
					const contextPreset = row.querySelector(".js-model-context-preset").value;
					const outputPreset = row.querySelector(".js-model-output-preset").value;
					const contextWindow = contextPreset === "custom" ? row.querySelector(".js-model-context").value.trim() : contextPreset;
					const maxTokens = outputPreset === "custom" ? row.querySelector(".js-model-output").value.trim() : outputPreset;
					return {
						id,
						name: name || undefined,
						contextWindow: contextWindow ? Number(contextWindow) : undefined,
						maxTokens: maxTokens ? Number(maxTokens) : undefined,
					};
				}).filter((model) => model.id);
			}

			async function submitProvider(event) {
				event.preventDefault();
				const button = byId("provider-submit");
				const payload = {
					id: byId("provider-id").value,
					name: byId("provider-name").value,
					vendor: byId("provider-vendor").value,
					region: byId("provider-region").value,
					baseUrl: byId("provider-base-url").value,
					api: byId("provider-api").value,
					apiKey: byId("provider-api-key").value,
					models: parseModels(),
				};
				if (typeof state.providerTemplateAuthHeader === "boolean") {
					payload.authHeader = state.providerTemplateAuthHeader;
				}
				try {
					button.disabled = true;
					const result = await fetchJson("/v1/model-sources/providers", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(payload),
					});
					state.selectedProviderId = result.provider.id;
					closeNewProviderModal();
					showToast("API 源已新增", "success");
					await load();
				} catch (error) {
					showToast(error.message || "新增失败", "danger");
				} finally {
					button.disabled = false;
				}
			}

			function wire() {
				byId("btn-refresh").addEventListener("click", load);
				byId("btn-new-source").addEventListener("click", openNewProviderModal);
				byId("provider-search").addEventListener("input", debounce((event) => {
					state.providerQuery = event.target.value;
					renderProviders();
				}, 120));
				byId("usage-search").addEventListener("input", debounce((event) => {
					state.usageQuery = event.target.value;
					renderUsages();
				}, 120));
				byId("usage-kind").addEventListener("change", (event) => {
					state.usageKind = event.target.value;
					renderUsages();
				});
				byId("provider-form").addEventListener("submit", submitProvider);
				byId("provider-cancel").addEventListener("click", closeNewProviderModal);
				byId("provider-template-select").addEventListener("change", (event) => {
					if (event.target.value) applyProviderTemplate(event.target.value);
				});
				byId("provider-model-add").addEventListener("click", () => addModelInputRow());
				byId("provider-model-rows").addEventListener("click", (event) => {
					const button = event.target.closest(".js-model-remove");
					if (!button) return;
					const row = button.closest("[data-model-row]");
					if (row && byId("provider-model-rows").querySelectorAll("[data-model-row]").length > 1) {
						row.remove();
						updateModelRemoveButtons();
					}
				});
				byId("provider-model-rows").addEventListener("change", (event) => {
					if (event.target.matches(".js-model-context-preset, .js-model-output-preset")) {
						syncPresetCustomInput(event.target);
					}
				});
				byId("new-provider-modal").addEventListener("mousedown", (event) => {
					modalPointerDownStartedOnBackdrop = isNewProviderBackdropEvent(event);
				});
				byId("new-provider-modal").addEventListener("mouseup", (event) => {
					if (modalPointerDownStartedOnBackdrop && isNewProviderBackdropEvent(event)) closeNewProviderModal();
					modalPointerDownStartedOnBackdrop = false;
				});
			}

			document.addEventListener("DOMContentLoaded", () => {
				wire();
				load();
			});
		})();
	`;
}

export function renderModelSourcesPage(): string {
	const css = getStandaloneBaseCss() + getModelSourcesPageCss();
	const js = getStandaloneBaseJs() + getModelSourcesPageJs();
	return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	${STANDALONE_THEME_INLINE_SCRIPT}
	<title>API 源管理 - UGK Claw</title>
	<link rel="icon" href="${STANDALONE_FAVICON}" />
	<style>${css}</style>
</head>
<body>
	<div id="app">
		<header class="sp-topbar">
			<a class="sp-topbar-back" href="/playground?view=chat" title="返回">
				<svg viewBox="0 0 20 20" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4l-6 6 6 6"/></svg>
			</a>
			<strong class="sp-topbar-title">API 源管理</strong>
			<div class="sp-topbar-spacer"></div>
			<button id="btn-new-source" class="sp-topbar-btn" type="button">
				<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
				<span class="ms-topbar-text">新增 API 源</span>
			</button>
			<button id="btn-refresh" class="sp-topbar-btn" type="button" title="刷新">
				<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
			</button>
			<button class="sp-topbar-btn" type="button" onclick="toggleTheme()" title="切换主题">
				<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/></svg>
			</button>
		</header>

		<section class="ms-stats" aria-label="API 源统计">
			<div class="ms-stat ms-stat--primary"><div><div class="ms-stat-label">API 源</div><div id="stat-providers" class="ms-stat-value">0</div><div class="ms-stat-desc">用户添加后启用</div></div><div class="ms-stat-icon">API</div></div>
			<div class="ms-stat ms-stat--green"><div><div class="ms-stat-label">自定义源</div><div id="stat-custom" class="ms-stat-value">0</div><div class="ms-stat-desc">保存在本机运行态</div></div><div class="ms-stat-icon">+</div></div>
			<div class="ms-stat ms-stat--cyan"><div><div class="ms-stat-label">使用对象</div><div id="stat-usages" class="ms-stat-value">0</div><div class="ms-stat-desc">全局、Agent、后台任务</div></div><div class="ms-stat-icon">↔</div></div>
			<div class="ms-stat ms-stat--amber"><div><div class="ms-stat-label">继承绑定</div><div id="stat-inherited" class="ms-stat-value">0</div><div class="ms-stat-desc">未显式覆盖的对象</div></div><div class="ms-stat-icon">继</div></div>
		</section>

		<main class="ms-main">
			<aside class="ms-pane ms-pane--providers">
				<div class="ms-pane-head">
					<div><div class="ms-pane-title">API 源</div><div class="ms-pane-subtitle">管理模型服务入口</div></div>
				</div>
				<div class="ms-toolbar">
					<input id="provider-search" class="ms-search" type="search" placeholder="搜索源标识、厂商、地区" />
				</div>
				<div id="provider-list" class="ms-provider-list"></div>
			</aside>

			<section class="ms-pane">
				<div class="ms-pane-head">
					<div><div class="ms-pane-title">源详情</div><div class="ms-pane-subtitle">鉴权状态与模型清单</div></div>
				</div>
				<div id="provider-detail" class="ms-body"></div>
			</section>

			<section class="ms-pane ms-pane--usage">
				<div class="ms-pane-head">
					<div><div class="ms-pane-title">使用对象</div><div class="ms-pane-subtitle">直接修改对象绑定的 API 源</div></div>
				</div>
				<div class="ms-toolbar">
					<div class="ms-usage-controls">
						<input id="usage-search" class="ms-search" type="search" placeholder="搜索对象、API 源、模型" />
						<select id="usage-kind" class="ms-select">
							<option value="all">全部对象</option>
							<option value="global">全局默认</option>
							<option value="agent">Agent</option>
							<option value="conn">后台任务</option>
						</select>
					</div>
				</div>
				<div class="ms-usage-table-wrap">
					<table class="ms-usage-table">
						<thead>
							<tr><th>对象</th><th>类型</th><th>绑定来源</th><th>API 源 / 模型</th><th></th></tr>
						</thead>
						<tbody id="usage-body"><tr><td colspan="5"><div class="ms-loading">加载使用对象...</div></td></tr></tbody>
					</table>
				</div>
			</section>
		</main>
	</div>

	<div id="new-provider-modal" class="ms-modal" hidden>
		<form id="provider-form" class="ms-modal-panel">
			<div class="ms-modal-head">
				<div><div class="ms-pane-title">新增 API 源</div><div class="ms-pane-subtitle">填写密钥后立即写入本机运行态</div></div>
			</div>
			<div class="ms-modal-body">
				<div class="ms-field">
					<label for="provider-template-select">厂商模板</label>
					<select id="provider-template-select" class="ms-select">
						<option value="">手动填写</option>
						<option value="deepseek">DeepSeek</option>
						<option value="zhipu-glm">智谱 GLM</option>
						<option value="xiaomi-mimo-cn">小米 MiMo</option>
						<option value="ali-codeplan">阿里 CodePlan</option>
					</select>
					<div class="ms-field-hint">选择后会自动填好接口地址和模型列表，密钥仍由你自己填写。</div>
				</div>
				<div class="ms-field-grid">
					<div class="ms-field">
						<label for="provider-id">源标识</label>
						<input id="provider-id" class="ms-input" required placeholder="例如：deepseek" />
						<div class="ms-field-hint">给系统识别用，只用英文、数字、横线，保存后绑定会引用它。</div>
					</div>
					<div class="ms-field">
						<label for="provider-name">显示名称</label>
						<input id="provider-name" class="ms-input" placeholder="例如：DeepSeek" />
						<div class="ms-field-hint">只用于页面展示，可以写中文或品牌名。</div>
					</div>
					<div class="ms-field">
						<label for="provider-vendor">厂商标识</label>
						<input id="provider-vendor" class="ms-input" placeholder="例如：deepseek" />
						<div class="ms-field-hint">用于分类和搜索；不确定可以和源标识填一样。</div>
					</div>
					<div class="ms-field">
						<label for="provider-region">地区</label>
						<input id="provider-region" class="ms-input" placeholder="例如：global 或 cn" />
						<div class="ms-field-hint">接口所在区域；不确定可填 global。</div>
					</div>
				</div>
				<div class="ms-field">
					<label for="provider-base-url">接口地址</label>
					<input id="provider-base-url" class="ms-input" required placeholder="例如：https://api.example.com/v1/messages" />
					<div class="ms-field-hint">填写模型服务商给你的调用地址。</div>
				</div>
				<div class="ms-field-grid">
					<div class="ms-field">
						<label for="provider-api">接口格式</label>
						<input id="provider-api" class="ms-input" required value="anthropic-messages" />
						<div class="ms-field-hint">当前支持 anthropic-messages；兼容 Claude 消息格式的接口使用它。</div>
					</div>
					<div class="ms-field">
						<label for="provider-api-key">密钥</label>
						<input id="provider-api-key" class="ms-input" type="password" required autocomplete="off" placeholder="粘贴服务商提供的 key" />
						<div class="ms-field-hint">保存在本机运行态，不会在页面列表里明文展示。</div>
					</div>
				</div>
				<div class="ms-field">
					<div class="ms-model-builder">
						<div class="ms-model-builder-head">
							<div>
								<label>模型列表</label>
								<div class="ms-field-hint">每个模型单独一行，长度可以从候选里选，也可以直接手动输入。</div>
							</div>
							<button id="provider-model-add" class="ms-btn" type="button">增加模型</button>
						</div>
						<div id="provider-model-rows" class="ms-model-rows"></div>
					</div>
				</div>
			</div>
			<div class="ms-modal-foot">
				<button id="provider-cancel" class="ms-btn" type="button">取消</button>
				<button id="provider-submit" class="ms-btn ms-btn-primary" type="submit">保存 API 源</button>
			</div>
		</form>
	</div>

	${renderStandaloneToastContainer()}
	<script>${js}</script>
</body>
</html>`;
}
