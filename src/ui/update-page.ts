import {
	getStandaloneBaseCss,
	getStandaloneBaseJs,
	renderStandaloneConfirmDialog,
	renderStandaloneToastContainer,
	renderStandaloneTopbar,
	STANDALONE_FAVICON,
	STANDALONE_THEME_INLINE_SCRIPT,
} from "./standalone-page-shared.js";

export function renderUpdatePage(): string {
	return `<!doctype html>
<html lang="zh-CN">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>系统更新 - UGK Mini Agent</title>
	<link rel="icon" href="${STANDALONE_FAVICON}" />
	${STANDALONE_THEME_INLINE_SCRIPT}
	<style>
		${getStandaloneBaseCss()}
		.update-main {
			min-height: 0;
			overflow: auto;
			padding: 28px;
			background: var(--bg);
		}
		.update-shell {
			max-width: 980px;
			margin: 0 auto;
			display: grid;
			gap: 16px;
		}
		.update-panel {
			border: 1px solid var(--line);
			border-radius: 8px;
			background: var(--bg-panel);
			overflow: hidden;
		}
		.update-panel-head,
		.update-panel-foot {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			padding: 16px;
			border-bottom: 1px solid var(--line);
		}
		.update-panel-foot {
			border-top: 1px solid var(--line);
			border-bottom: 0;
			justify-content: flex-end;
		}
		.update-panel-body {
			padding: 16px;
			display: grid;
			gap: 14px;
		}
		.update-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 12px;
		}
		.update-field {
			border: 1px solid var(--line);
			border-radius: 8px;
			background: var(--bg-panel-2);
			padding: 12px;
			min-width: 0;
		}
		.update-label {
			color: var(--muted);
			font-size: 11px;
			margin-bottom: 6px;
		}
		.update-value {
			font-family: var(--font-mono);
			overflow-wrap: anywhere;
		}
		.update-status {
			border: 1px solid var(--line);
			border-radius: 8px;
			background: var(--bg-panel-2);
			padding: 12px;
			color: var(--muted);
			min-height: 44px;
		}
		.update-status[data-tone="ok"] { color: var(--ok); }
		.update-status[data-tone="warn"] { color: var(--warn); }
		.update-status[data-tone="danger"] { color: var(--danger); }
		.update-list {
			margin: 0;
			padding-left: 18px;
			color: var(--muted);
			font-family: var(--font-mono);
			font-size: 12px;
		}
		.update-note {
			color: var(--muted);
			font-size: 12px;
		}
		.sp-btn[disabled] {
			opacity: 0.55;
			cursor: not-allowed;
		}
		@media (max-width: 720px) {
			.update-main { padding: 14px; }
			.update-grid { grid-template-columns: 1fr; }
			.update-panel-head,
			.update-panel-foot { align-items: stretch; flex-direction: column; }
			.update-panel-foot .sp-btn { width: 100%; }
		}
	</style>
</head>
<body data-standalone-theme="default">
	<div id="app">
		${renderStandaloneTopbar("系统更新", "/playground/agents")}
		<main class="update-main">
			<section class="update-shell">
				<div class="update-panel">
					<div class="update-panel-head">
						<div>
							<h1>系统更新</h1>
							<p class="update-note">适用于 Git 克隆部署：检查远程 main，拉取更新，并在依赖变化时执行安装。</p>
						</div>
						<button class="sp-btn" type="button" id="check-update-btn">检查更新</button>
					</div>
					<div class="update-panel-body">
						<div id="update-status" class="update-status">正在检查更新...</div>
						<div class="update-grid">
							<div class="update-field">
								<div class="update-label">当前版本</div>
								<div class="update-value" id="current-version">-</div>
							</div>
							<div class="update-field">
								<div class="update-label">远程版本</div>
								<div class="update-value" id="remote-version">-</div>
							</div>
							<div class="update-field">
								<div class="update-label">当前分支</div>
								<div class="update-value" id="branch-name">-</div>
							</div>
							<div class="update-field">
								<div class="update-label">差异</div>
								<div class="update-value" id="commit-delta">-</div>
							</div>
						</div>
						<div>
							<div class="update-label">会阻止自动更新的本地改动</div>
							<ul class="update-list" id="blocking-changes"></ul>
						</div>
						<div>
							<div class="update-label">允许保留的本地产物</div>
							<ul class="update-list" id="allowed-artifacts"></ul>
						</div>
					</div>
					<div class="update-panel-foot">
						<button class="sp-btn" type="button" id="apply-update-btn" disabled>安装更新</button>
					</div>
				</div>
			</section>
		</main>
		${renderStandaloneConfirmDialog()}
		${renderStandaloneToastContainer()}
	</div>
	<script>
		${getStandaloneBaseJs()}
		const state = { status: null, applying: false };
		const els = {
			status: document.getElementById("update-status"),
			current: document.getElementById("current-version"),
			remote: document.getElementById("remote-version"),
			branch: document.getElementById("branch-name"),
			delta: document.getElementById("commit-delta"),
			blocking: document.getElementById("blocking-changes"),
			allowed: document.getElementById("allowed-artifacts"),
			checkBtn: document.getElementById("check-update-btn"),
			applyBtn: document.getElementById("apply-update-btn"),
		};

		function setStatus(message, tone) {
			els.status.textContent = message;
			els.status.dataset.tone = tone || "";
		}

		function renderList(el, items, emptyText) {
			el.innerHTML = "";
			if (!items || !items.length) {
				const item = document.createElement("li");
				item.textContent = emptyText;
				el.appendChild(item);
				return;
			}
			for (const text of items) {
				const item = document.createElement("li");
				item.textContent = text;
				el.appendChild(item);
			}
		}

		function renderStatus(payload) {
			state.status = payload;
			els.current.textContent = payload.currentShortCommit || "-";
			els.remote.textContent = payload.remoteShortCommit || "-";
			els.branch.textContent = payload.branch || "-";
			els.delta.textContent = "落后 " + (payload.behind || 0) + " / 领先 " + (payload.ahead || 0);
			renderList(els.blocking, payload.blockingChanges, "无");
			renderList(els.allowed, payload.allowedLocalArtifacts, "无");
			const blocked = Boolean(payload.blockingChanges && payload.blockingChanges.length);
			els.applyBtn.disabled = state.applying || blocked || !payload.hasUpdates;
			if (blocked) {
				setStatus("存在本地代码改动，不能自动更新。请先备份或提交这些文件。", "danger");
			} else if (payload.hasUpdates) {
				setStatus("发现新版本，可以安装更新。", "warn");
			} else {
				setStatus("当前已经是最新版本。", "ok");
			}
		}

		async function loadStatus() {
			els.checkBtn.disabled = true;
			setStatus("正在检查更新...", "");
			try {
				renderStatus(await fetchJson("/v1/system/update/status"));
			} catch (error) {
				setStatus(error.message || "检查更新失败", "danger");
			} finally {
				els.checkBtn.disabled = false;
			}
		}

		async function applyUpdate() {
			const confirmed = await openConfirmDialog({
				title: "安装更新",
				message: "将执行 git pull --ff-only origin main，并在依赖变化时执行 npm install。更新完成后需要重启服务。",
				confirmLabel: "安装更新",
				tone: "danger",
			});
			if (!confirmed) return;
			state.applying = true;
			els.applyBtn.disabled = true;
			setStatus("正在安装更新...", "warn");
			try {
				const result = await fetchJson("/v1/system/update/apply", { method: "POST" });
				if (result.ok) {
					const message = result.updated
						? "更新完成。请重启服务后使用新版本。"
						: "已经是最新版本，无需更新。";
					setStatus(result.restartRequired ? message + " 重启服务。" : message, "ok");
					showToast(message, "success");
					await loadStatus();
				}
			} catch (error) {
				setStatus(error.message || "安装更新失败", "danger");
				showToast("安装更新失败", "danger");
				await loadStatus();
			} finally {
				state.applying = false;
			}
		}

		els.checkBtn.addEventListener("click", loadStatus);
		els.applyBtn.addEventListener("click", applyUpdate);
		loadStatus();
	</script>
</body>
</html>`;
}
