export interface PlaygroundPageHtmlInput {
	styles?: string;
	stylesHref?: string;
	markedBrowserScript?: string;
	markedBrowserScriptSrc?: string;
	playgroundScript?: string;
	playgroundScriptSrc?: string;
	extensionStylesHref?: string;
	extensionScriptSrc?: string;
	taskInboxView: string;
	connActivityDialogs: string;
	agentManagerDialogs?: string;
	assetDialogs: string;
}

const UGK_ASCII_LOGO = [
	"&#9608;&#9608;&#9559;   &#9608;&#9608;&#9559; &#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9559; &#9608;&#9608;&#9559;  &#9608;&#9608;&#9559;     &#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9559;&#9608;&#9608;&#9559;      &#9608;&#9608;&#9608;&#9608;&#9608;&#9559; &#9608;&#9608;&#9559;    &#9608;&#9608;&#9559;",
	"&#9608;&#9608;&#9553;   &#9608;&#9608;&#9553;&#9608;&#9608;&#9556;&#9552;&#9552;&#9552;&#9552;&#9565; &#9608;&#9608;&#9553; &#9608;&#9608;&#9556;&#9565;    &#9608;&#9608;&#9556;&#9552;&#9552;&#9552;&#9552;&#9565;&#9608;&#9608;&#9553;     &#9608;&#9608;&#9556;&#9552;&#9552;&#9608;&#9608;&#9559;&#9608;&#9608;&#9553;    &#9608;&#9608;&#9553;",
	"&#9608;&#9608;&#9553;   &#9608;&#9608;&#9553;&#9608;&#9608;&#9553;  &#9608;&#9608;&#9608;&#9559;&#9608;&#9608;&#9608;&#9608;&#9608;&#9556;&#9565;     &#9608;&#9608;&#9553;     &#9608;&#9608;&#9553;     &#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9553;&#9608;&#9608;&#9553; &#9608;&#9559; &#9608;&#9608;&#9553;",
	"&#9608;&#9608;&#9553;   &#9608;&#9608;&#9553;&#9608;&#9608;&#9553;   &#9608;&#9608;&#9553;&#9608;&#9608;&#9556;&#9552;&#9608;&#9608;&#9559;     &#9608;&#9608;&#9553;     &#9608;&#9608;&#9553;     &#9608;&#9608;&#9556;&#9552;&#9552;&#9608;&#9608;&#9553;&#9608;&#9608;&#9553;&#9608;&#9608;&#9608;&#9559;&#9608;&#9608;&#9553;",
	"&#9562;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9556;&#9565;&#9562;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9556;&#9565;&#9608;&#9608;&#9553;  &#9608;&#9608;&#9559;    &#9562;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9559;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9559;&#9608;&#9608;&#9553;  &#9608;&#9608;&#9553;&#9562;&#9608;&#9608;&#9608;&#9556;&#9608;&#9608;&#9608;&#9556;&#9565;",
	" &#9562;&#9552;&#9552;&#9552;&#9552;&#9552;&#9565;  &#9562;&#9552;&#9552;&#9552;&#9552;&#9552;&#9565; &#9562;&#9552;&#9565;  &#9562;&#9552;&#9565;     &#9562;&#9552;&#9552;&#9552;&#9552;&#9552;&#9565;&#9562;&#9552;&#9552;&#9552;&#9552;&#9552;&#9552;&#9565;&#9562;&#9552;&#9565;  &#9562;&#9552;&#9565; &#9562;&#9552;&#9552;&#9565;&#9562;&#9552;&#9552;&#9565;",
].join("\n");

function renderAsciiLogo(className: string): string {
	return `<pre class="ugk-ascii-logo ${className}" aria-hidden="true">${UGK_ASCII_LOGO}</pre>`;
}

function renderMobileSvgLogo(className: string, width: number, height: number, alt = "UGK Claw"): string {
	const escapedAlt = escapeHtmlAttribute(alt);
	return [
		`<img class="ugk-svg-logo ugk-svg-logo-dark ${className}" src="/ugk-claw-logo.svg" alt="${escapedAlt}" width="${width}" height="${height}" />`,
		`<img class="ugk-svg-logo ugk-svg-logo-light ${className}" src="/ugk-claw-logo-light.svg" alt="${escapedAlt}" width="${width}" height="${height}" />`,
	].join("\n\t\t\t\t\t\t\t");
}

export function renderPlaygroundHtml(input: PlaygroundPageHtmlInput): string {
	const stylesMarkup = input.stylesHref
		? `<link rel="stylesheet" href="${escapeHtmlAttribute(input.stylesHref)}" />`
		: `<style>${input.styles ?? ""}</style>`;
	const extensionStylesMarkup = input.extensionStylesHref
		? `\n\t\t<link rel="stylesheet" href="${escapeHtmlAttribute(input.extensionStylesHref)}" />`
		: "";
	const runtimeScriptMarkup =
		input.markedBrowserScriptSrc || input.playgroundScriptSrc
			? [
					input.markedBrowserScriptSrc
						? `<script src="${escapeHtmlAttribute(input.markedBrowserScriptSrc)}"></script>`
						: `<script>${input.markedBrowserScript ?? ""}</script>`,
					input.playgroundScriptSrc
						? `<script src="${escapeHtmlAttribute(input.playgroundScriptSrc)}"></script>`
						: `<script>${input.playgroundScript ?? ""}</script>`,
				].join("\n\t\t")
			: `<script>${input.markedBrowserScript ?? ""}
${input.playgroundScript ?? ""}</script>`;
	const extensionScriptMarkup = input.extensionScriptSrc
		? `\n\t\t<script src="${escapeHtmlAttribute(input.extensionScriptSrc)}"></script>`
		: "";

	return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<script>(function(){try{var t=localStorage.getItem("ugk-mini-agent:playground-theme");if(t==="light"){document.documentElement.dataset.theme="light";document.documentElement.style.colorScheme="light"}}catch{}})()</script>
		<title>UGK Claw</title>
		<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='10' fill='%23080c14'/%3E%3Ctext x='32' y='38' text-anchor='middle' font-family='Consolas,monospace' font-size='16' font-weight='700' fill='%23e9f0ff'%3EUGK%3C/text%3E%3C/svg%3E" />
		<link rel="stylesheet" href="/vendor/flatpickr/flatpickr.min.css" />
		${stylesMarkup}${extensionStylesMarkup}
	</head>
	<body>
		<div id="drag-overlay" class="drag-overlay" aria-hidden="true">
			<div class="drag-overlay-panel">
				<strong>释放文件</strong>
				<span>文件会进入当前消息，并自动补充文件处理描述</span>
			</div>
		</div>
		<div id="shell" class="shell" data-stage-mode="landing" data-transcript-state="idle" data-home="true">
			<header class="topbar">
				<aside class="landing-side landing-side-right">
					<button id="new-conversation-button" class="telemetry-card telemetry-action" type="button" data-tooltip-title="新会话" data-tooltip-desc="创建一条新的服务端会话。">
						<span>全新的记忆</span>
						<strong id="command-status">新会话</strong>
					</button>
					<button id="open-asset-library-button" class="telemetry-card telemetry-action" type="button" data-tooltip-title="文件库" data-tooltip-desc="查看当前会话可复用的项目文件。">
						<span>这里不是垃圾堆</span>
						<strong>文件库</strong>
					</button>
					<button id="open-conn-manager-button" class="telemetry-card telemetry-action telemetry-action-with-badge" type="button" data-tooltip-title="任务管理" data-tooltip-desc="管理定时和后台运行的 conn 任务。">
						<span>后台自己干，前台别被绑架</span>
						<strong>后台任务</strong>
						<span id="conn-manager-unread-badge" class="telemetry-action-badge" hidden>0</span>
					</button>
					<a class="telemetry-card telemetry-action" href="/playground/team" data-tooltip-title="Team Runtime" data-tooltip-desc="进入 Team Runtime 独立工作台。">
						<span>多 Agent 链路别靠脑补</span>
						<strong>Team Runtime</strong>
					</a>
					<button id="open-task-inbox-button" class="telemetry-card telemetry-action telemetry-action-with-badge" type="button" aria-pressed="false" data-tooltip-title="消息" data-tooltip-desc="查看后台任务投递的结果。" style="display:none">
						<span>&#21518;&#21488;&#20219;&#21153;&#32467;&#26524;&#32479;&#19968;&#25910;&#20214;&#31665;</span>
						<strong>消息</strong>
						<span id="task-inbox-unread-badge" class="telemetry-action-badge" hidden>0</span>
					</button>
					<div class="topbar-context-slot">
						<button id="agent-selector-status" class="topbar-agent-label" type="button" aria-label="打开 Agent 页面" title="Agent 页面"><span class="agent-switcher-label">主 Agent</span><span id="agent-switcher-meta" class="agent-switcher-meta" role="tooltip"></span></button>
						<button id="context-usage-shell" class="context-usage-shell" type="button" data-status="safe" data-expanded="false" aria-label="&#19978;&#19979;&#25991;&#20351;&#29992; 0%" aria-describedby="context-usage-meta">
							<span class="context-usage-battery" aria-hidden="true">
								<span id="context-usage-progress" class="context-usage-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></span>
							</span>
							<span id="context-usage-summary" class="context-usage-summary">0%</span>
							<span id="context-usage-toggle" class="context-usage-toggle">&#19978;&#19979;&#25991;&#35814;&#24773;</span>
							<span id="context-usage-meta" class="context-usage-meta" role="tooltip">&#24403;&#21069;&#19978;&#19979;&#25991; 0 / 128,000 tokens (0%)</span>
						</button>
						<button id="theme-toggle-button" class="theme-mode-toggle" type="button" aria-pressed="false" aria-label="切换浅色主题" title="切换浅色主题">
							<span id="theme-toggle-label" class="visually-hidden">深色模式</span>
							<span class="theme-mode-toggle-track" aria-hidden="true">
								<span class="theme-mode-toggle-icon theme-mode-toggle-sun">
									<svg viewBox="0 0 24 24" fill="none">
										<circle cx="12" cy="12" r="4" stroke-width="1.8" />
										<path d="M12 2.8v2.4M12 18.8v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" stroke-width="1.8" stroke-linecap="round" />
									</svg>
								</span>
								<span class="theme-mode-toggle-icon theme-mode-toggle-moon">
									<svg viewBox="0 0 24 24" fill="none">
										<path d="M20 14.2A7.3 7.3 0 0 1 9.8 4a8.1 8.1 0 1 0 10.2 10.2Z" stroke-width="1.8" stroke-linejoin="round" />
									</svg>
								</span>
								<span class="theme-mode-toggle-thumb"></span>
							</span>
						</button>
					</div>
				</aside>
				<section id="mobile-topbar" class="mobile-topbar" aria-label="手机状态栏">
					<button
						id="mobile-brand-button"
						class="mobile-brand"
						type="button"
						aria-haspopup="dialog"
						aria-expanded="false"
						aria-controls="mobile-conversation-drawer"
						title="历史会话"
					>
						<span class="mobile-brand-logo desktop-brand" aria-label="UGK CLAW">
							${renderMobileSvgLogo("ugk-svg-logo-topbar", 120, 32)}
							${renderAsciiLogo("ugk-ascii-logo-topbar")}
						</span>
					</button>
					<div></div>
					<button
						id="mobile-new-conversation-button"
						class="mobile-topbar-button"
						type="button"
						aria-label="新会话"
						title="新会话"
					>
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M12 5v14M5 12h14" stroke-width="1.8" stroke-linecap="round" />
						</svg>
					</button>
					<button
						id="mobile-overflow-menu-button"
						class="mobile-topbar-button mobile-topbar-button-with-badge"
						type="button"
						aria-haspopup="menu"
						aria-expanded="false"
						aria-controls="mobile-overflow-menu"
						aria-label="更多操作"
						title="更多操作"
					>
						<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<circle cx="12" cy="5" r="1.8"></circle>
							<circle cx="12" cy="12" r="1.8"></circle>
							<circle cx="12" cy="19" r="1.8"></circle>
						</svg>
						<span id="mobile-overflow-task-inbox-badge" class="mobile-topbar-notification-badge" hidden>0</span>
					</button>
					<div id="mobile-overflow-menu" class="mobile-overflow-menu" role="menu" hidden>
						<button id="mobile-menu-file-button" class="mobile-overflow-menu-item" type="button" role="menuitem">
							<span class="mobile-overflow-menu-item-icon" aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none">
									<path d="M7 4h7l4 4v12H7V4Z" stroke-width="1.8" stroke-linejoin="round" />
									<path d="M14 4v4h4" stroke-width="1.8" stroke-linejoin="round" />
								</svg>
							</span>
							<span>文件</span>
						</button>
						<button id="mobile-menu-library-button" class="mobile-overflow-menu-item" type="button" role="menuitem">
							<span class="mobile-overflow-menu-item-icon" aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none">
									<path d="M4 7h5l2 2h9v9H4V7Z" stroke-width="1.8" stroke-linejoin="round" />
								</svg>
							</span>
							<span>文件库</span>
						</button>
						<button id="mobile-menu-conn-button" class="mobile-overflow-menu-item" type="button" role="menuitem">
							<span class="mobile-overflow-menu-item-icon" aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none">
									<path d="M6 7h12M6 12h12M6 17h8" stroke-width="1.8" stroke-linecap="round" />
									<path d="M4 5v14M20 5v14" stroke-width="1.8" stroke-linecap="round" />
								</svg>
							</span>
							<span>后台任务</span>
						</button>
						<a href="/playground/team" class="mobile-overflow-menu-item" role="menuitem">
							<span class="mobile-overflow-menu-item-icon" aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none">
									<path d="M5 6h14v12H5V6Z" stroke-width="1.8" stroke-linejoin="round" />
									<path d="M8 10h8M8 14h5" stroke-width="1.8" stroke-linecap="round" />
								</svg>
							</span>
							<span>Team Runtime</span>
						</a>
						<button id="mobile-menu-task-inbox-button" class="mobile-overflow-menu-item" type="button" role="menuitem" aria-pressed="false">
							<span class="mobile-overflow-menu-item-icon" aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none">
									<path d="M5 7h14M5 12h14M5 17h9" stroke-width="1.8" stroke-linecap="round" />
									<path d="M4 4v16" stroke-width="1.8" stroke-linecap="round" />
								</svg>
							</span>
							<span>&#20219;&#21153;&#28040;&#24687;</span>
							<span id="mobile-task-inbox-unread-badge" class="mobile-overflow-menu-item-badge" hidden>0</span>
						</button>
						<button id="mobile-menu-model-config-button" class="mobile-overflow-menu-item" type="button" role="menuitem">
							<span class="mobile-overflow-menu-item-icon" aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none">
									<path d="M5 7h14M7 12h10M9 17h6" stroke-width="1.8" stroke-linecap="round" />
									<path d="M4 4h16v16H4V4Z" stroke-width="1.8" stroke-linejoin="round" />
								</svg>
							</span>
							<span>模型源</span>
						</button>
						<a id="mobile-menu-model-sources-link" class="mobile-overflow-menu-item" href="/playground/model-sources" role="menuitem">
							<span class="mobile-overflow-menu-item-icon" aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none">
									<path d="M5 6h14M5 12h14M5 18h14" stroke-width="1.8" stroke-linecap="round" />
									<path d="M8 6v12M16 6v12" stroke-width="1.8" stroke-linecap="round" />
								</svg>
							</span>
							<span>API 源管理</span>
						</a>
						<button id="mobile-menu-theme-button" class="mobile-overflow-menu-item" type="button" role="menuitem" aria-pressed="false" aria-label="切换浅色主题" title="切换浅色主题">
							<span class="mobile-overflow-menu-item-icon" aria-hidden="true">
								<svg viewBox="0 0 24 24" fill="none">
									<path d="M12 3a9 9 0 1 0 9 9 6.5 6.5 0 0 1-9-9Z" stroke-width="1.8" stroke-linejoin="round" />
								</svg>
							</span>
							<span id="mobile-theme-toggle-label">深色模式</span>
						</button>
					</div>
				</section>
				<div class="topbar-right">
					<div class="status-row"><span>主题</span><strong>深色 / 极客</strong></div>
					<div class="status-row"><span>传输</span><strong>SSE / 流式</strong></div>
					<div class="status-row"><span>发送</span><strong>Enter</strong></div>
				</div>
			</header>

			<div id="mobile-drawer-backdrop" class="mobile-drawer-backdrop" hidden></div>
			<aside
				id="mobile-conversation-drawer"
				class="mobile-conversation-drawer"
				aria-label="历史会话"
				hidden
			>
				<div class="mobile-drawer-head">
					<div class="mobile-drawer-title">
						<strong>历史会话</strong>
						<span>运行中不能切换</span>
					</div>
					<button id="mobile-drawer-close-button" class="mobile-drawer-close" type="button" aria-label="关闭历史会话">
						×
					</button>
				</div>
				<div id="mobile-conversation-list" class="mobile-conversation-list"></div>
			</aside>

			<aside id="desktop-conversation-rail" class="desktop-conversation-rail" aria-label="&#21382;&#21490;&#20250;&#35805;">
				<div class="desktop-conversation-rail-head">
					<div class="desktop-brand" aria-label="UGK CLAW">
						${renderAsciiLogo("ugk-ascii-logo-topbar")}
					</div>
				</div>
				<div id="desktop-conversation-list" class="desktop-conversation-list"></div>
				<div class="desktop-rail-settings">
					<button class="desktop-rail-settings-trigger" type="button" aria-haspopup="menu">
						<span>设置</span>
					</button>
					<div class="desktop-rail-settings-menu" role="menu" aria-label="桌面设置">
						<button id="open-model-config-button" class="telemetry-card telemetry-action" type="button" role="menuitem">
							<span>换源前先验货</span>
							<strong>模型源</strong>
						</button>
						<a id="open-model-sources-page-link" class="telemetry-card telemetry-action" href="/playground/model-sources" role="menuitem">
							<span>查清谁在用哪个源</span>
							<strong>API 源管理</strong>
						</a>
					</div>
				</div>
			</aside>

			<main id="chat-stage" class="chat-stage" data-workspace-mode="chat">
				<div class="chat-stage-watermark" aria-hidden="true">
					${renderMobileSvgLogo("ugk-svg-logo-watermark", 240, 60, "")}
				</div>
				<div hidden>
					<div class="meta-chip">
						<strong>会话</strong>
						<input id="conversation-id" name="conversation-id" placeholder="manual:web-xxxx" />
					</div>
					<div class="meta-chip">
						<strong>会话文件</strong>
						<span id="session-file">尚未分配</span>
					</div>
				</div>

				<div hidden>
					<span>接口：POST /v1/agents/:agentId/chat/stream</span>
					<div id="status-pill" class="state">就绪</div>
				</div>

				<section id="landing-screen" class="landing-screen" aria-hidden="false">
					<div class="landing-grid">
						<header class="landing-header">
							<div class="landing-logo" aria-label="UGK CLAW">${renderMobileSvgLogo("ugk-svg-logo-watermark", 240, 60, "")}${renderAsciiLogo("ugk-ascii-logo-watermark")}</div>
						</header>
						<div class="landing-agent-cards" id="landing-agent-cards"></div>
					</div>
				</section>

				<div id="error-banner" class="error-banner" role="alert" hidden>
					<span id="error-banner-message" class="error-banner-message"></span>
					<button id="error-banner-close" class="error-banner-close" type="button" aria-label="关闭错误提示">×</button>
				</div>

				<div id="notification-live-region" class="notification-live-region" aria-live="polite" aria-atomic="false" hidden>
					<div id="notification-toast-stack" class="notification-toast-stack"></div>
				</div>

				<section class="stream-layout">
					<div class="transcript-pane">
						<header class="pane-head">
							<strong>对话流</strong>
							<span>单列会话舞台会把用户与 Agent 的回应自然分层，焦点始终落在当前内容。</span>
						</header>
						<div id="history-auto-load-status" class="history-auto-load-status" aria-live="polite" hidden></div>
						<section id="transcript" class="transcript" aria-live="polite">
							<div id="transcript-archive" class="transcript-archive"></div>
							<div id="transcript-current" class="transcript-current"></div>
						</section>
						<button id="scroll-to-bottom-button" class="scroll-to-bottom-button" type="button" hidden>回到底部</button>
					</div>
				</section>

				<div id="command-deck" class="command-deck">
					<div class="file-strip">
						<div id="drop-zone" class="drop-zone">
							<input id="file-input" class="file-input" name="files" type="file" multiple />
						</div>
						<div id="file-list" class="file-list" aria-live="polite"></div>
						<section id="selected-assets" class="selected-assets" aria-live="polite">
							<div id="selected-asset-list" class="selected-asset-list"></div>
						</section>
					</div>
					<section id="composer-drop-target" class="composer">
						<button id="file-picker-action" class="composer-file-action" type="button" aria-label="上传文件" title="上传文件">
							<span aria-hidden="true">+</span>
						</button>
						<div class="composer-main">
							<div class="composer-header">
								<span>消息</span>
								<span>Shift+Enter 换行</span>
							</div>
							<textarea id="message" name="message" rows="1" placeholder="和我聊聊吧"></textarea>
						</div>
						<div class="composer-side">
							<button id="interrupt-button" type="button" disabled>打断</button>
							<button id="send-button" type="button">发送</button>
						</div>
					</section>
				</div>
			</main>
		</div>
		${input.taskInboxView}
		${input.agentManagerDialogs ?? ""}
		<div id="context-usage-dialog" class="context-usage-dialog" aria-hidden="true" inert hidden>
			<section class="context-usage-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="context-usage-dialog-title">
				<div class="context-usage-dialog-head">
					<strong id="context-usage-dialog-title">上下文使用情况</strong>
					<button id="context-usage-dialog-close" class="context-usage-dialog-close" type="button" aria-label="关闭上下文详情">×</button>
				</div>
				<div id="context-usage-dialog-body" class="context-usage-dialog-body">当前上下文 0 / 128,000 tokens (0%)</div>
			</section>
		</div>
		<div id="chat-run-log-dialog" class="chat-run-log-dialog" aria-hidden="true" hidden>
			<section class="chat-run-log-panel" role="dialog" aria-modal="true" aria-labelledby="chat-run-log-title">
				<div class="chat-run-log-head">
					<strong id="chat-run-log-title">运行日志</strong>
					<button id="chat-run-log-close" class="chat-run-log-close" type="button" aria-label="关闭运行日志">×</button>
				</div>
				<div id="chat-run-log-body" class="chat-run-log-body"></div>
			</section>
		</div>
		<div id="confirm-dialog" class="confirm-dialog" aria-hidden="true" hidden>
			<section class="confirm-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
				<div class="confirm-dialog-head">
					<strong id="confirm-dialog-title">请确认</strong>
				</div>
				<div id="confirm-dialog-body" class="confirm-dialog-body"></div>
				<div class="confirm-dialog-actions">
					<button id="confirm-dialog-cancel" type="button">取消</button>
					<button id="confirm-dialog-confirm" class="danger-action" type="button">确认</button>
				</div>
			</section>
		</div>
		<div id="model-config-dialog" class="model-config-dialog" aria-hidden="true" inert hidden>
			<section class="model-config-panel" role="dialog" aria-modal="true" aria-labelledby="model-config-title">
				<header class="model-config-head">
					<div>
						<strong id="model-config-title">模型源设置</strong>
						<span id="model-config-current">当前配置读取中</span>
					</div>
					<button id="model-config-close" class="model-config-close" type="button" aria-label="关闭模型源设置">×</button>
				</header>
				<div class="model-config-body">
					<label class="model-config-field" for="model-config-provider">
						<span>API 源</span>
						<select id="model-config-provider"></select>
					</label>
					<label class="model-config-field" for="model-config-model">
						<span>模型</span>
						<select id="model-config-model"></select>
					</label>
					<div id="model-config-auth" class="model-config-auth">等待配置</div>
					<div id="model-config-status" class="model-config-status" role="status" aria-live="polite"></div>
				</div>
				<footer class="model-config-actions">
					<button id="model-config-test" type="button">测试连接</button>
					<button id="model-config-save" type="button">验证并保存</button>
				</footer>
			</section>
		</div>
		${input.connActivityDialogs}
		${input.assetDialogs}
		<script src="/vendor/flatpickr/flatpickr.min.js"></script>
		<script src="/vendor/flatpickr/l10n/zh.js"></script>
		${runtimeScriptMarkup}${extensionScriptMarkup}
	</body>
</html>`;
}

function escapeHtmlAttribute(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
