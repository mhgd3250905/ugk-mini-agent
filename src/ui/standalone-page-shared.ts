const SHARED_CSS_VARIABLES = `
	:root {
		--bg: #01030a;
		--bg-panel: #060711;
		--bg-panel-2: #0b0c18;
		--bg-panel-3: #090a15;
		--fg: #eef4ff;
		--muted: #8f93ad;
		--line: #1a1b2b;
		--line-strong: #2b2d42;
		--accent: #c9d2ff;
		--accent-soft: rgba(201, 210, 255, 0.08);
		--ok: #8dffb2;
		--danger: #ff7188;
		--warn: #ffd166;
		--confirm-overlay: rgba(1, 3, 10, 0.74);
		--confirm-panel: #0f1624;
		--confirm-body: #151d2e;
		--confirm-action: #1b2638;
		--confirm-action-hover: #25344b;
		--confirm-danger: #8d2437;
		--confirm-danger-hover: #a92f47;
		--font-sans: "OpenAI Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
		--font-mono: "Agave", "SFMono-Regular", "Cascadia Mono", Consolas, "Lucida Console", monospace;
	}

	[data-theme="light"] {
		--bg: #e8edf6;
		--bg-panel: #f4f6fb;
		--bg-panel-2: #ffffff;
		--bg-panel-3: #edf0f8;
		--fg: #142033;
		--muted: #6b7a90;
		--line: #d0d6e4;
		--line-strong: #b4bdd0;
		--accent: #3a4a8a;
		--accent-soft: rgba(58, 74, 138, 0.08);
		--ok: #0e7a3a;
		--danger: #b52e3d;
		--warn: #8a6d00;
		--confirm-overlay: rgba(14, 25, 42, 0.34);
		--confirm-panel: #ffffff;
		--confirm-body: #eef4fb;
		--confirm-action: #e5ecf6;
		--confirm-action-hover: #d7e2f1;
		--confirm-danger: #c52945;
		--confirm-danger-hover: #a91f38;
	}

	* { box-sizing: border-box; margin: 0; padding: 0; }

	html, body {
		height: 100%;
		background: var(--bg);
		color: var(--fg);
		font-family: var(--font-sans);
		font-size: 13px;
		line-height: 1.5;
		overflow: hidden;
	}

	#app {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		height: 100%;
		overflow: hidden;
	}
`;

const SHARED_COCKPIT_CSS = `
	body[data-standalone-theme="cockpit"] {
		background:
			radial-gradient(circle at 50% 22%, rgba(51, 131, 255, 0.12), transparent 38%),
			radial-gradient(circle at 12% 18%, rgba(81, 255, 194, 0.045), transparent 34%),
			linear-gradient(180deg, #020611 0%, #050817 100%);
		isolation: isolate;
	}

	body[data-standalone-theme="cockpit"]::before {
		content: "";
		position: fixed;
		inset: -72px;
		z-index: -2;
		pointer-events: none;
		opacity: 1;
		background-image:
			linear-gradient(rgba(116, 176, 255, 0.075) 1px, transparent 1px),
			linear-gradient(90deg, rgba(116, 176, 255, 0.075) 1px, transparent 1px),
			linear-gradient(rgba(116, 176, 255, 0.11) 1px, transparent 1px),
			linear-gradient(90deg, rgba(116, 176, 255, 0.11) 1px, transparent 1px),
			radial-gradient(circle at 1px 1px, rgba(133, 190, 255, 0.16) 1px, transparent 1.5px),
			repeating-linear-gradient(135deg, transparent 0 104px, rgba(95, 145, 255, 0.035) 104px 168px, transparent 168px 300px);
		background-size: 32px 32px, 32px 32px, 128px 128px, 128px 128px, 12px 12px, auto;
		animation: sp-cockpit-drift 56s linear infinite;
	}

	body[data-standalone-theme="cockpit"]::after {
		content: "";
		position: fixed;
		top: -20%;
		left: 0;
		z-index: -1;
		width: 28vw;
		height: 140%;
		pointer-events: none;
		background: linear-gradient(90deg, transparent 0%, rgba(96, 194, 255, 0.10) 48%, transparent 100%);
		opacity: 0.7;
		transform: translate3d(-42vw, 0, 0) skewX(-18deg);
		animation: sp-cockpit-scan 18s ease-in-out infinite;
	}

	body[data-standalone-theme="cockpit"] #app {
		background: transparent !important;
	}

	body[data-standalone-theme="cockpit"] .sp-topbar {
		background: rgba(5, 8, 23, 0.76) !important;
		border-bottom-color: rgba(116, 176, 255, 0.12) !important;
		backdrop-filter: blur(18px);
	}

	[data-theme="light"] body[data-standalone-theme="cockpit"],
	body[data-standalone-theme="cockpit"][data-theme="light"] {
		background:
			radial-gradient(circle at 50% 22%, rgba(45, 122, 255, 0.10), transparent 38%),
			radial-gradient(circle at 12% 18%, rgba(67, 170, 255, 0.055), transparent 34%),
			linear-gradient(180deg, #f7f9fd 0%, #eef3f9 100%);
	}

	[data-theme="light"] body[data-standalone-theme="cockpit"]::before,
	body[data-standalone-theme="cockpit"][data-theme="light"]::before {
		opacity: 0.9;
		background-image:
			linear-gradient(rgba(24, 69, 119, 0.055) 1px, transparent 1px),
			linear-gradient(90deg, rgba(24, 69, 119, 0.055) 1px, transparent 1px),
			linear-gradient(rgba(24, 69, 119, 0.085) 1px, transparent 1px),
			linear-gradient(90deg, rgba(24, 69, 119, 0.085) 1px, transparent 1px),
			radial-gradient(circle at 1px 1px, rgba(41, 104, 180, 0.13) 1px, transparent 1.5px),
			repeating-linear-gradient(135deg, transparent 0 104px, rgba(48, 105, 180, 0.045) 104px 168px, transparent 168px 300px);
	}

	[data-theme="light"] body[data-standalone-theme="cockpit"]::after,
	body[data-standalone-theme="cockpit"][data-theme="light"]::after {
		background: linear-gradient(90deg, transparent 0%, rgba(0, 91, 255, 0.07) 48%, transparent 100%);
	}

	[data-theme="light"] body[data-standalone-theme="cockpit"] .sp-topbar,
	body[data-standalone-theme="cockpit"][data-theme="light"] .sp-topbar {
		background: rgba(247, 249, 253, 0.78) !important;
		border-bottom-color: rgba(24, 69, 119, 0.09) !important;
	}

	@keyframes sp-cockpit-drift {
		from { transform: translate3d(0, 0, 0); }
		to { transform: translate3d(32px, 32px, 0); }
	}

	@keyframes sp-cockpit-scan {
		0% { transform: translate3d(-42vw, 0, 0) skewX(-18deg); opacity: 0; }
		12% { opacity: 0.55; }
		50% { opacity: 0.75; }
		88% { opacity: 0.45; }
		100% { transform: translate3d(128vw, 0, 0) skewX(-18deg); opacity: 0; }
	}

	@media (prefers-reduced-motion: reduce) {
		body[data-standalone-theme="cockpit"]::before,
		body[data-standalone-theme="cockpit"]::after {
			animation: none !important;
		}
	}
`;

const SHARED_TOPBAR_CSS = `
	.sp-topbar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 18px;
		height: 52px;
		border-bottom: 1px solid var(--line);
		background: var(--bg-panel);
		flex-shrink: 0;
	}

	.sp-topbar-back {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: transparent;
		color: var(--muted);
		text-decoration: none;
		flex-shrink: 0;
	}

	.sp-topbar-back:hover {
		background: var(--accent-soft);
		color: var(--fg);
	}

	.sp-topbar-back svg {
		width: 16px;
		height: 16px;
		stroke: currentColor;
		fill: none;
	}

	.sp-topbar-title {
		font-size: 14px;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--fg);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sp-topbar-spacer { flex: 1; }

	.sp-topbar-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 30px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: transparent;
		color: var(--muted);
		font-size: 11px;
		font-family: var(--font-sans);
		letter-spacing: 0.04em;
		cursor: pointer;
		flex-shrink: 0;
	}

	.sp-topbar-btn:hover {
		background: var(--accent-soft);
		color: var(--fg);
		border-color: var(--line-strong);
	}

	.sp-topbar-btn svg {
		width: 14px;
		height: 14px;
		stroke: currentColor;
		fill: none;
	}
`;

const SHARED_OVERLAY_CSS = `
	.sp-overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.sp-overlay[hidden] { display: none; }

	.sp-panel {
		background: var(--bg-panel);
		border: 1px solid var(--line);
		border-radius: 8px;
		width: min(680px, 92vw);
		max-height: 85vh;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		overflow: hidden;
	}

	.sp-panel-head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--line);
	}

	.sp-panel-head strong {
		font-size: 13px;
		letter-spacing: 0.02em;
	}

	.sp-panel-body {
		padding: 18px;
		overflow-y: auto;
		min-height: 0;
	}

	.sp-panel-foot {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 12px 18px;
		border-top: 1px solid var(--line);
	}

	#confirm-overlay.sp-overlay {
		background: var(--confirm-overlay);
		padding: 18px;
	}

	.sp-confirm-panel {
		width: min(520px, calc(100vw - 36px));
		max-height: min(84vh, 520px);
		gap: 12px;
		padding: 18px;
		border: 0;
		background: var(--confirm-panel);
		box-shadow: none;
	}

	.sp-confirm-panel .sp-panel-head {
		padding: 0;
		border-bottom: 0;
		background: transparent;
	}

	.sp-confirm-panel .sp-panel-head strong {
		color: var(--fg);
		font-size: 18px;
		font-weight: 780;
		letter-spacing: 0;
		line-height: 1.35;
	}

	.sp-confirm-panel .sp-panel-body {
		padding: 14px 16px;
		border-radius: 6px;
		background: var(--confirm-body);
		color: var(--fg);
		overflow: auto;
	}

	.sp-confirm-message {
		color: var(--fg);
		font-size: 14px;
		line-height: 1.75;
		white-space: pre-line;
	}

	.sp-confirm-panel .sp-panel-foot {
		gap: 10px;
		padding: 4px 0 0;
		border-top: 0;
	}

	.sp-confirm-panel .sp-btn {
		min-width: 92px;
		height: 40px;
		border: 0;
		border-radius: 4px;
		background: var(--confirm-action);
		color: var(--fg);
		font-size: 13px;
		font-weight: 760;
		letter-spacing: 0;
		box-shadow: none;
	}

	.sp-confirm-panel .sp-btn:hover {
		background: var(--confirm-action-hover);
		border-color: transparent;
		color: var(--fg);
	}

	.sp-confirm-panel .sp-btn-danger {
		background: var(--confirm-danger);
		color: #fff5f7;
		border-color: transparent;
	}

	.sp-confirm-panel .sp-btn-danger:hover {
		background: var(--confirm-danger-hover);
		color: #ffffff;
	}
`;

const SHARED_BADGE_CSS = `
	.sp-badge {
		display: inline-flex;
		align-items: center;
		padding: 2px 8px;
		border-radius: 8px;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.sp-badge-active { background: var(--accent); color: #01030a; }
	.sp-badge-paused { background: var(--warn); color: #01030a; }
	.sp-badge-completed { background: rgba(143, 147, 173, 0.2); color: var(--muted); }
	.sp-badge-pending { background: rgba(143, 147, 173, 0.15); color: var(--muted); }
	.sp-badge-running { background: var(--accent); color: #01030a; }
	.sp-badge-succeeded { background: var(--ok); color: #01030a; }
	.sp-badge-failed { background: var(--danger); color: #fff; }
	.sp-badge-cancelled { background: rgba(143, 147, 173, 0.15); color: var(--muted); }
`;

const SHARED_TOAST_CSS = `
	.sp-toast-container {
		position: fixed;
		top: 12px;
		right: 12px;
		z-index: 200;
		display: grid;
		gap: 8px;
	}

	.sp-toast-container[hidden] { display: none; }

	.sp-toast {
		padding: 10px 14px;
		border-radius: 8px;
		background: var(--bg-panel-2);
		border: 1px solid var(--line);
		color: var(--fg);
		font-size: 12px;
		max-width: 320px;
		animation: sp-toast-in 0.2s ease-out;
	}

	.sp-toast-ok { border-color: rgba(141, 255, 178, 0.3); }
	.sp-toast-danger { border-color: rgba(255, 113, 136, 0.3); }

	@keyframes sp-toast-in {
		from { opacity: 0; transform: translateY(-8px); }
		to { opacity: 1; transform: translateY(0); }
	}
`;

const SHARED_FORM_CSS = `
	.sp-field {
		display: grid;
		gap: 4px;
	}

	.sp-field + .sp-field { margin-top: 12px; }

	.sp-field-label {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.sp-field-hint {
		font-size: 10px;
		color: var(--muted);
	}

	.sp-input,
	.sp-textarea,
	.sp-select {
		width: 100%;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--bg);
		color: var(--fg);
		font-family: var(--font-sans);
		font-size: 12px;
		outline: none;
	}

	.sp-input:focus,
	.sp-textarea:focus,
	.sp-select:focus {
		border-color: var(--accent);
	}

	.sp-textarea {
		resize: vertical;
		min-height: 80px;
		line-height: 1.5;
	}

	.sp-select {
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 4.5l3 3 3-3' stroke='%238f93ad' stroke-width='1.4' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 8px center;
		padding-right: 28px;
	}

	.sp-error {
		padding: 8px 12px;
		border-radius: 8px;
		background: rgba(255, 113, 136, 0.1);
		border: 1px solid rgba(255, 113, 136, 0.2);
		color: var(--danger);
		font-size: 11px;
	}

	.sp-error[hidden] { display: none; }

	.sp-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 32px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: transparent;
		color: var(--muted);
		font-size: 11px;
		font-family: var(--font-sans);
		letter-spacing: 0.04em;
		cursor: pointer;
	}

	.sp-btn:hover {
		background: var(--accent-soft);
		color: var(--fg);
		border-color: var(--line-strong);
	}

	.sp-btn-primary {
		background: var(--accent);
		color: #01030a;
		border-color: var(--accent);
	}

	.sp-btn-primary:hover {
		opacity: 0.9;
		color: #01030a;
	}

	.sp-btn-danger {
		color: var(--danger);
		border-color: rgba(255, 113, 136, 0.25);
	}

	.sp-btn-danger:hover {
		background: rgba(255, 113, 136, 0.08);
	}

	.sp-btn[disabled] {
		opacity: 0.4;
		cursor: not-allowed;
	}
`;

const SHARED_FLATPICKR_CSS = `
	.flatpickr-calendar {
		background: var(--bg-panel) !important;
		border: 1px solid var(--line) !important;
		border-radius: 8px !important;
		box-shadow: none !important;
		color: var(--fg) !important;
	}

	.flatpickr-months .flatpickr-month,
	.flatpickr-current-month .flatpickr-monthDropdown-months {
		color: var(--fg) !important;
		fill: var(--fg) !important;
	}

	.flatpickr-day {
		color: var(--fg) !important;
		border-radius: 8px !important;
	}

	.flatpickr-day.selected,
	.flatpickr-day.startRange,
	.flatpickr-day.endRange,
	.flatpickr-day.selected.inRange {
		background: var(--accent) !important;
		color: #01030a !important;
		border-color: var(--accent) !important;
	}

	.flatpickr-day:hover {
		background: var(--accent-soft) !important;
	}

	.flatpickr-months .flatpickr-prev-month svg,
	.flatpickr-months .flatpickr-next-month svg {
		fill: var(--muted) !important;
	}

	span.flatpickr-weekday {
		color: var(--muted) !important;
	}

	.flatpickr-time input,
	.flatpickr-time .flatpickr-time-separator {
		color: var(--fg) !important;
	}

	.flatpickr-time input:hover,
	.flatpickr-time .flatpickr-am-pm:hover {
		background: var(--accent-soft) !important;
	}

	.flatpickr-day.flatpickr-disabled {
		color: var(--muted) !important;
		opacity: 0.4;
	}
`;

const SHARED_RESPONSIVE_CSS = `
	@media (max-width: 768px) {
		.sp-topbar { padding: 0 12px; height: 48px; }
		.sp-topbar-title { font-size: 13px; }
	}
`;

export function getStandaloneBaseCss(): string {
	return `
		${SHARED_CSS_VARIABLES}
		${SHARED_COCKPIT_CSS}
		${SHARED_TOPBAR_CSS}
		${SHARED_OVERLAY_CSS}
		${SHARED_BADGE_CSS}
		${SHARED_TOAST_CSS}
		${SHARED_FORM_CSS}
		${SHARED_FLATPICKR_CSS}
		${SHARED_RESPONSIVE_CSS}
	`;
}

export function getStandaloneBaseJs(): string {
	return `
		function escapeHtml(s) {
			return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
		}

		function formatTimestamp(value) {
			if (!value) return "-";
			const d = new Date(value);
			if (isNaN(d.getTime())) return value;
			return d.toLocaleString("zh-CN");
		}

		function formatRelativeTime(value) {
			if (!value) return "";
			const d = new Date(value);
			if (isNaN(d.getTime())) return "";
			const now = Date.now();
			const diff = now - d.getTime();
			if (diff < 60000) return "刚刚";
			if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
			if (diff < 86400000) return Math.floor(diff / 3600000) + " 小时前";
			if (diff < 172800000) return "昨天";
			return formatTimestamp(value);
		}

		function debounce(fn, ms) {
			let t = null;
			return function (...args) {
				if (t !== null) clearTimeout(t);
				t = setTimeout(() => { t = null; fn.apply(this, args); }, ms);
			};
		}

		async function fetchJson(url, options) {
			const res = await fetch(url, options);
			if (!res.ok) {
				const text = await res.text().catch(() => "");
				throw new Error(text || "HTTP " + res.status);
			}
			return res.json();
		}

		let _toastContainer = null;
		function getToastContainer() {
			if (!_toastContainer) _toastContainer = document.getElementById("toast-container");
			return _toastContainer;
		}

		function showToast(message, tone) {
			const container = getToastContainer();
			if (!container) return;
			container.hidden = false;
			const el = document.createElement("div");
			el.className = "sp-toast" + (tone ? " sp-toast-" + tone : "");
			el.textContent = message;
			container.appendChild(el);
			setTimeout(() => {
				el.remove();
				if (!container.children.length) container.hidden = true;
			}, 4000);
		}

		let _confirmResolve = null;
		function openConfirmDialog(opts) {
			return new Promise((resolve) => {
				_confirmResolve = resolve;
				const overlay = document.getElementById("confirm-overlay");
				const title = document.getElementById("confirm-title");
				const body = document.getElementById("confirm-body");
				const cancelBtn = document.getElementById("confirm-cancel");
				const okBtn = document.getElementById("confirm-ok");
				if (title) title.textContent = opts.title || "请确认";
				if (body) body.textContent = opts.message || "";
				if (okBtn) {
					okBtn.textContent = opts.confirmLabel || "确认";
					okBtn.className = "sp-btn" + (opts.tone === "danger" ? " sp-btn-danger" : "");
				}
				if (overlay) overlay.hidden = false;
				cancelBtn.onclick = () => { overlay.hidden = true; resolve(false); };
				okBtn.onclick = () => { overlay.hidden = true; resolve(true); };
			});
		}

		const THEME_KEY = "ugk-pi:playground-theme";

		function readStoredTheme() {
			try {
				return localStorage.getItem(THEME_KEY) || "dark";
			} catch { return "dark"; }
		}

		function applyTheme(t) {
			document.documentElement.setAttribute("data-theme", t);
			document.documentElement.style.colorScheme = t;
			try { localStorage.setItem(THEME_KEY, t); } catch {}
		}

		function toggleTheme() {
			const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
			applyTheme(next);
		}
	`;
}

export function renderStandaloneTopbar(title: string, backHref: string): string {
	return `
		<header class="sp-topbar">
			<a class="sp-topbar-back" href="${backHref}" title="返回">
				<svg viewBox="0 0 20 20" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4l-6 6 6 6"/></svg>
			</a>
			<strong class="sp-topbar-title">${title}</strong>
			<div class="sp-topbar-spacer"></div>
			<button class="sp-topbar-btn" type="button" onclick="toggleTheme()" title="切换主题">
				<svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/></svg>
			</button>
		</header>
	`;
}

export function renderStandaloneConfirmDialog(): string {
	return `
		<div id="confirm-overlay" class="sp-overlay" hidden>
			<div class="sp-panel sp-confirm-panel">
				<div class="sp-panel-head">
					<strong id="confirm-title">请确认</strong>
				</div>
				<div class="sp-panel-body">
					<p id="confirm-body" class="sp-confirm-message"></p>
				</div>
				<div class="sp-panel-foot">
					<button class="sp-btn" type="button" id="confirm-cancel">取消</button>
					<button class="sp-btn sp-btn-danger" type="button" id="confirm-ok">确认</button>
				</div>
			</div>
		</div>
	`;
}

export function renderStandaloneToastContainer(): string {
	return `<div id="toast-container" class="sp-toast-container" hidden></div>`;
}

export const STANDALONE_FAVICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='10' fill='%23080c14'/%3E%3Ctext x='32' y='38' text-anchor='middle' font-family='Consolas,monospace' font-size='16' font-weight='700' fill='%23e9f0ff'%3EUGK%3C/text%3E%3C/svg%3E`;

export const STANDALONE_THEME_INLINE_SCRIPT = `<script>(function(){try{var t=localStorage.getItem("ugk-pi:playground-theme");if(t==="light"){document.documentElement.dataset.theme="light";document.documentElement.style.colorScheme="light"}}catch{}})()</script>`;
