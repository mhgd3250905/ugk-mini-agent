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
		.ms-pill--bundled { color: var(--ms-primary); background: var(--ms-primary-soft); border-color: transparent; }
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
				if (auth.source === "literal") return '<span class="ms-pill ms-pill--danger">literal key</span>';
				if (auth.configured) return '<span class="ms-pill ms-pill--ok">' + escapeHtml(auth.envVar || "env") + '</span>';
				if (auth.envVar) return '<span class="ms-pill ms-pill--warn">' + escapeHtml(auth.envVar) + ' missing</span>';
				return '<span class="ms-pill ms-pill--warn">no key</span>';
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
					byId("provider-list").innerHTML = '<div class="ms-empty">没有匹配的 API 源</div>';
					return;
				}
				byId("provider-list").innerHTML = providers.map((provider) => {
					const selected = provider.id === state.selectedProviderId ? " selected" : "";
					const sourceTone = provider.source === "custom" ? "custom" : "bundled";
					return '<button class="ms-provider-item' + selected + '" type="button" data-provider-id="' + escapeHtml(provider.id) + '">' +
						'<div class="ms-provider-name-row"><div class="ms-provider-name">' + escapeHtml(providerLabel(provider)) + '</div></div>' +
						'<div class="ms-provider-id">' + escapeHtml(provider.id) + '</div>' +
						'<div class="ms-provider-meta">' +
							'<span class="ms-pill ms-pill--' + sourceTone + '">' + (provider.source === "custom" ? "custom" : "bundled") + '</span>' +
							'<span class="ms-pill">' + escapeHtml(String((provider.models || []).length)) + ' models</span>' +
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
					byId("provider-detail").innerHTML = '<div class="ms-empty">选择一个 API 源查看详情</div>';
					return;
				}
				const modelRows = (provider.models || []).map((model) => {
					const meta = [
						model.contextWindow ? "ctx " + model.contextWindow : "",
						model.maxTokens ? "max " + model.maxTokens : "",
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
								'<span class="ms-pill ms-pill--' + (provider.source === "custom" ? "custom" : "bundled") + '">' + escapeHtml(provider.source) + '</span>' +
								authPill(provider) +
								(provider.vendor ? '<span class="ms-pill">' + escapeHtml(provider.vendor) + '</span>' : '') +
								(provider.region ? '<span class="ms-pill">' + escapeHtml(provider.region) + '</span>' : '') +
							'</div>' +
							'<div class="ms-detail-title" style="margin-top:10px">' + escapeHtml(providerLabel(provider)) + '</div>' +
						'</div>' +
						'<dl class="ms-kv">' +
							'<dt>Provider ID</dt><dd>' + escapeHtml(provider.id) + '</dd>' +
							'<dt>Auth</dt><dd>' + escapeHtml((provider.auth && (provider.auth.envVar || provider.auth.source)) || "-") + '</dd>' +
							'<dt>Priority</dt><dd>' + escapeHtml(provider.priority || "-") + '</dd>' +
							'<dt>Models</dt><dd>' + escapeHtml(String((provider.models || []).length)) + '</dd>' +
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
					return '<tr data-usage-kind="' + escapeHtml(usage.kind) + '" data-usage-id="' + escapeHtml(usage.id) + '">' +
						'<td><div class="ms-usage-label">' + escapeHtml(usage.label) + '</div><div class="ms-usage-id">' + escapeHtml(usage.id) + '</div></td>' +
						'<td><span class="ms-pill">' + escapeHtml(usageKindLabel(usage.kind)) + '</span></td>' +
						'<td>' + inheritedLabel(usage) + (usage.error ? '<div class="ms-usage-id">' + escapeHtml(usage.error) + '</div>' : '') + '</td>' +
						'<td><div class="ms-table-selects">' +
							'<select class="ms-select js-provider-select" ' + (usage.editable ? "" : "disabled") + '>' + providerOptions + '</select>' +
							'<select class="ms-select js-model-select" ' + (usage.editable ? "" : "disabled") + '>' + modelOptions + '</select>' +
						'</div></td>' +
						'<td><div class="ms-row-actions"><button class="ms-btn js-save-usage" type="button" ' + (usage.editable ? "" : "disabled") + '>保存</button></div></td>' +
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
				byId("provider-models").value = "model-id|Model name|128000|8192";
				byId("new-provider-modal").hidden = false;
				byId("provider-id").focus();
			}

			function closeNewProviderModal() {
				byId("new-provider-modal").hidden = true;
			}

			function parseModels(value) {
				return String(value || "").split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
					const parts = line.split("|").map((part) => part.trim());
					return {
						id: parts[0] || "",
						name: parts[1] || undefined,
						contextWindow: parts[2] ? Number(parts[2]) : undefined,
						maxTokens: parts[3] ? Number(parts[3]) : undefined,
					};
				});
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
					apiKeyEnvVar: byId("provider-api-key-env").value,
					models: parseModels(byId("provider-models").value),
				};
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
				byId("new-provider-modal").addEventListener("click", (event) => {
					if (event.target.id === "new-provider-modal") closeNewProviderModal();
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
			<div class="ms-stat ms-stat--primary"><div><div class="ms-stat-label">API 源</div><div id="stat-providers" class="ms-stat-value">0</div><div class="ms-stat-desc">bundled 与 custom 合并视图</div></div><div class="ms-stat-icon">API</div></div>
			<div class="ms-stat ms-stat--green"><div><div class="ms-stat-label">自定义源</div><div id="stat-custom" class="ms-stat-value">0</div><div class="ms-stat-desc">运行态 overlay 保存</div></div><div class="ms-stat-icon">+</div></div>
			<div class="ms-stat ms-stat--cyan"><div><div class="ms-stat-label">使用对象</div><div id="stat-usages" class="ms-stat-value">0</div><div class="ms-stat-desc">全局、Agent、后台任务</div></div><div class="ms-stat-icon">↔</div></div>
			<div class="ms-stat ms-stat--amber"><div><div class="ms-stat-label">继承绑定</div><div id="stat-inherited" class="ms-stat-value">0</div><div class="ms-stat-desc">未显式覆盖的对象</div></div><div class="ms-stat-icon">IN</div></div>
		</section>

		<main class="ms-main">
			<aside class="ms-pane ms-pane--providers">
				<div class="ms-pane-head">
					<div><div class="ms-pane-title">API 源</div><div class="ms-pane-subtitle">按 provider 管理模型入口</div></div>
				</div>
				<div class="ms-toolbar">
					<input id="provider-search" class="ms-search" type="search" placeholder="搜索 provider、vendor、region" />
				</div>
				<div id="provider-list" class="ms-provider-list"></div>
			</aside>

			<section class="ms-pane">
				<div class="ms-pane-head">
					<div><div class="ms-pane-title">源详情</div><div class="ms-pane-subtitle">鉴权环境变量与模型清单</div></div>
				</div>
				<div id="provider-detail" class="ms-body"></div>
			</section>

			<section class="ms-pane ms-pane--usage">
				<div class="ms-pane-head">
					<div><div class="ms-pane-title">使用对象</div><div class="ms-pane-subtitle">直接修改对象绑定的 API 源</div></div>
				</div>
				<div class="ms-toolbar">
					<div class="ms-usage-controls">
						<input id="usage-search" class="ms-search" type="search" placeholder="搜索对象、provider、model" />
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
				<div><div class="ms-pane-title">新增 API 源</div><div class="ms-pane-subtitle">只保存环境变量名，不保存明文 key</div></div>
			</div>
			<div class="ms-modal-body">
				<div class="ms-field-grid">
					<div class="ms-field"><label for="provider-id">Provider ID</label><input id="provider-id" class="ms-input" required placeholder="custom-openai" /></div>
					<div class="ms-field"><label for="provider-name">显示名称</label><input id="provider-name" class="ms-input" placeholder="Custom OpenAI" /></div>
					<div class="ms-field"><label for="provider-vendor">Vendor</label><input id="provider-vendor" class="ms-input" placeholder="custom" /></div>
					<div class="ms-field"><label for="provider-region">Region</label><input id="provider-region" class="ms-input" placeholder="global" /></div>
				</div>
				<div class="ms-field"><label for="provider-base-url">Base URL</label><input id="provider-base-url" class="ms-input" required placeholder="https://api.example.com/v1/messages" /></div>
				<div class="ms-field-grid">
					<div class="ms-field"><label for="provider-api">API 协议</label><input id="provider-api" class="ms-input" required value="anthropic-messages" /></div>
					<div class="ms-field"><label for="provider-api-key-env">API Key Env Var</label><input id="provider-api-key-env" class="ms-input" required placeholder="CUSTOM_OPENAI_API_KEY" /></div>
				</div>
				<div class="ms-field">
					<label for="provider-models">模型列表</label>
					<textarea id="provider-models" class="ms-textarea" required spellcheck="false"></textarea>
					<small>每行一个模型：model-id|显示名称|contextWindow|maxTokens</small>
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
