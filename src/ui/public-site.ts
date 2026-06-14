export function renderPublicSitePage(): string {
	return `<!doctype html>
<html lang="zh-CN">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>UGK Mini Agent - 本机部署的 Agent 工作台</title>
		<meta
			name="description"
			content="UGK Mini Agent 是一个可本机部署的 Agent 工作台，提供 Chat、Team Console、Conn 后台任务、模型源配置和 Agent Profile 管理。"
		/>
		<link rel="icon" href="/ugk-claw-logo.svg" />
		<style>
			@font-face {
				font-family: "Agave";
				src: url("/fonts/Agave-Regular.ttf") format("truetype");
				font-weight: 400;
				font-style: normal;
				font-display: swap;
			}

			@font-face {
				font-family: "Agave";
				src: url("/fonts/Agave-Bold.ttf") format("truetype");
				font-weight: 700 900;
				font-style: normal;
				font-display: swap;
			}

			:root {
				color-scheme: dark;
				--page: #03070d;
				--page-soft: #07111d;
				--surface: #0a121f;
				--surface-strong: #101a2b;
				--line: rgba(101, 209, 255, 0.22);
				--line-strong: rgba(101, 209, 255, 0.52);
				--text: #f3f8ff;
				--text-soft: #cbd8f0;
				--text-muted: #8493ad;
				--brand: #65d1ff;
				--brand-soft: rgba(101, 209, 255, 0.14);
				--brand-glow: rgba(101, 209, 255, 0.32);
				--brand-lavender: #c9d2ff;
				--brand-mint: #8dffb2;
				--cyan: #79f7ff;
				--green: #a7ff79;
				font-family:
					"Agave",
					"Cascadia Mono",
					"Microsoft YaHei",
					monospace;
				background: var(--page);
				color: var(--text);
			}

			* {
				box-sizing: border-box;
			}

			html {
				scroll-behavior: smooth;
			}

			body {
				margin: 0;
				min-width: 320px;
				background:
					linear-gradient(rgba(101, 209, 255, 0.045) 1px, transparent 1px),
					linear-gradient(90deg, rgba(201, 210, 255, 0.03) 1px, transparent 1px),
					linear-gradient(180deg, #07111d 0, #03070d 38rem),
					var(--page);
				background-size:
					72px 72px,
					72px 72px,
					auto;
				color: var(--text);
				text-rendering: geometricPrecision;
			}

			a {
				color: inherit;
				text-decoration: none;
			}

			img {
				max-width: 100%;
			}

			code,
			pre {
				font-family: "Cascadia Mono", Consolas, "SFMono-Regular", monospace;
			}

			.page {
				width: min(1160px, calc(100% - 40px));
				margin: 0 auto;
			}

			.site-nav {
				position: sticky;
				top: 0;
				z-index: 20;
				border-bottom: 1px solid var(--line);
				background: rgba(3, 7, 13, 0.86);
				backdrop-filter: blur(16px);
			}

			.site-nav-inner {
				height: 62px;
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 18px;
			}

			.brand {
				display: inline-flex;
				align-items: center;
				gap: 10px;
				font-weight: 760;
				letter-spacing: 0;
				text-transform: uppercase;
			}

			.brand img {
				width: 34px;
				height: 34px;
				border-radius: 8px;
			}

			.nav-links {
				display: flex;
				align-items: center;
				gap: 4px;
				color: var(--text-muted);
				font-size: 12px;
				font-weight: 760;
				letter-spacing: 0.08em;
				text-transform: uppercase;
			}

			.nav-links a {
				padding: 8px 10px;
				border-radius: 7px;
			}

			.nav-links a:hover {
				background: rgba(255, 255, 255, 0.06);
				color: var(--text);
			}

			.hero {
				position: relative;
				display: grid;
				grid-template-columns: minmax(0, 0.92fr) minmax(360px, 1.08fr);
				gap: clamp(28px, 5vw, 72px);
				align-items: center;
				min-height: calc(100svh - 62px);
				padding: clamp(42px, 6vw, 78px) 0 clamp(34px, 5vw, 64px);
			}

			.hero::before {
				content: "[ PRODUCT / LOCAL-FIRST AGENT RUNTIME / WINDOWS + MACOS + LINUX ]";
				position: absolute;
				left: 0;
				top: 18px;
				color: rgba(101, 209, 255, 0.62);
				font-size: 12px;
				font-weight: 760;
				letter-spacing: 0.08em;
			}

			.hero-lockup {
				display: inline-flex;
				align-items: center;
				gap: 16px;
				margin-bottom: 22px;
				padding: 10px 14px 10px 10px;
				border: 1px solid var(--line-strong);
				background: rgba(101, 209, 255, 0.08);
			}

			.hero-lockup img {
				width: 68px;
				height: 68px;
				object-fit: contain;
				background: #03070d;
				border: 1px solid var(--line);
			}

			.hero-lockup span {
				display: block;
				color: var(--text-muted);
				font-size: 12px;
				font-weight: 760;
				letter-spacing: 0.1em;
				text-transform: uppercase;
			}

			.hero-lockup strong {
				display: block;
				margin-top: 5px;
				color: var(--brand);
				font-size: clamp(22px, 3vw, 36px);
				line-height: 1;
				text-transform: uppercase;
			}

			.eyebrow {
				margin: 0 0 14px;
				color: var(--brand);
				font-size: 13px;
				font-weight: 760;
				letter-spacing: 0.08em;
				text-transform: uppercase;
			}

			h1,
			h2,
			h3,
			p {
				letter-spacing: 0;
			}

			h1 {
				margin: 0;
				max-width: 760px;
				font-size: clamp(44px, 5.7vw, 84px);
				line-height: 1.08;
				text-wrap: balance;
				background: linear-gradient(100deg, var(--brand), var(--brand-lavender) 48%, var(--brand-mint));
				-webkit-background-clip: text;
				background-clip: text;
				color: transparent;
				text-shadow: 0 0 34px var(--brand-glow);
			}

			.hero-subtitle {
				margin: 22px 0 0;
				max-width: 650px;
				color: var(--text-soft);
				font-size: clamp(18px, 2vw, 23px);
				line-height: 1.55;
			}

			.cta-row {
				display: flex;
				flex-wrap: wrap;
				gap: 10px;
				margin-top: 30px;
			}

			.button {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				min-height: 44px;
				padding: 0 18px;
				border: 1px solid var(--line-strong);
				border-radius: 0;
				background: rgba(10, 15, 13, 0.82);
				color: var(--text-soft);
				font-size: 14px;
				font-weight: 720;
				letter-spacing: 0.04em;
				text-transform: uppercase;
				transition:
					background 160ms ease,
					border-color 160ms ease,
					color 160ms ease,
					transform 160ms ease;
			}

			.button:hover {
				border-color: var(--brand);
				background: rgba(101, 209, 255, 0.12);
				color: var(--text);
				transform: translateY(-1px);
			}

			.button-primary {
				border-color: var(--brand);
				background: linear-gradient(135deg, var(--brand), var(--brand-lavender) 52%, var(--brand-mint));
				color: #050704;
			}

			.button-primary:hover {
				background: linear-gradient(135deg, #a6e7ff, #dfe4ff 52%, #b8ffc9);
				color: #050704;
			}

			.note {
				margin: 16px 0 0;
				color: var(--text-muted);
				font-size: 13px;
				line-height: 1.7;
			}

			.hero-card {
				position: relative;
				border: 1px solid var(--line-strong);
				border-radius: 0;
				background: linear-gradient(180deg, rgba(16, 23, 19, 0.94), rgba(3, 5, 3, 0.98));
				box-shadow: 0 0 0 1px rgba(101, 209, 255, 0.1), 0 34px 90px rgba(0, 0, 0, 0.44);
				overflow: hidden;
			}

			.hero-card::before {
				content: "CANVAS.RUNTIME / LIVE SCREENSHOT";
				display: block;
				padding: 11px 14px;
				border-bottom: 1px solid var(--line);
				color: var(--brand);
				background: #03070d;
				font-size: 12px;
				font-weight: 760;
				letter-spacing: 0.08em;
			}

			.hero-card img {
				display: block;
				width: 100%;
				aspect-ratio: 2 / 1;
				object-fit: contain;
				object-position: center;
				border-bottom: 1px solid var(--line);
				filter: saturate(1.1) contrast(1.04);
				background: #03070d;
			}

			.hero-metrics {
				display: grid;
				grid-template-columns: repeat(3, minmax(0, 1fr));
				gap: 1px;
				background: var(--line);
			}

			.metric {
				min-height: 104px;
				padding: 18px;
				background: rgba(10, 15, 13, 0.96);
			}

			.metric span {
				display: block;
				color: var(--text-muted);
				font-size: 12px;
				text-transform: uppercase;
				letter-spacing: 0.08em;
			}

			.metric strong {
				display: block;
				margin-top: 14px;
				font-size: clamp(20px, 2.4vw, 29px);
				line-height: 1.05;
			}

			.ticker {
				border-top: 1px solid var(--line-strong);
				border-bottom: 1px solid var(--line-strong);
				background: linear-gradient(90deg, var(--brand), var(--brand-lavender) 48%, var(--brand-mint));
				color: #050704;
				overflow: hidden;
			}

			.ticker-track {
				width: max-content;
				display: flex;
				gap: 26px;
				padding: 12px 0;
				font-size: 13px;
				font-weight: 800;
				letter-spacing: 0.08em;
				text-transform: uppercase;
				animation: tickerMove 28s linear infinite;
			}

			.ticker-track span {
				white-space: nowrap;
			}

			.section {
				padding: clamp(64px, 8vw, 110px) 0;
				border-top: 1px solid var(--line);
			}

			.section-head {
				max-width: 790px;
				margin-bottom: clamp(28px, 4vw, 46px);
			}

			h2 {
				margin: 0;
				font-size: clamp(34px, 4.8vw, 62px);
				line-height: 1.04;
				text-wrap: balance;
			}

			.section-head p {
				margin: 18px 0 0;
				color: var(--text-soft);
				font-size: 18px;
				line-height: 1.7;
			}

			.grid {
				display: grid;
				grid-template-columns: repeat(4, minmax(0, 1fr));
				gap: 1px;
				border: 1px solid var(--line);
				border-radius: 0;
				background: var(--line);
				overflow: hidden;
			}

			.card,
			.step,
			.entry {
				background: var(--surface);
			}

			.card {
				min-height: 250px;
				padding: 24px;
			}

			.card span,
			.step span,
			.entry span {
				color: var(--cyan);
				font-size: 12px;
				font-weight: 760;
				text-transform: uppercase;
			}

			.card strong,
			.step strong,
			.entry strong {
				display: block;
				margin-top: 22px;
				font-size: 24px;
				line-height: 1.14;
			}

			.card p,
			.step p,
			.entry p {
				margin: 14px 0 0;
				color: var(--text-soft);
				line-height: 1.68;
			}

			.install-layout {
				display: grid;
				grid-template-columns: 0.92fr 1.08fr;
				gap: 1px;
				border: 1px solid var(--line);
				border-radius: 0;
				background: var(--line);
				overflow: hidden;
			}

			.steps {
				display: grid;
				gap: 1px;
				background: var(--line);
			}

			.step {
				padding: 24px;
			}

			.command-panel {
				padding: 24px;
				background: var(--surface-strong);
			}

			.command-block {
				margin: 0 0 14px;
				padding: 16px;
				border: 1px solid rgba(148, 163, 184, 0.2);
				border-radius: 0;
				background: #030503;
				color: #e6ffd0;
				font-size: 13px;
				line-height: 1.7;
				overflow-x: auto;
				white-space: pre;
			}

			.command-title {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 12px;
				margin: 0 0 10px;
				color: var(--text);
				font-size: 15px;
				font-weight: 760;
			}

			.command-title code {
				color: var(--green);
				font-size: 12px;
				font-weight: 500;
			}

			.screenshot-band {
				display: grid;
				grid-template-columns: 1.2fr 0.8fr;
				gap: 1px;
				border: 1px solid var(--line);
				border-radius: 0;
				background: var(--line);
				overflow: hidden;
			}

			.shot {
				background: var(--surface);
			}

			.shot img {
				display: block;
				width: 100%;
				height: 100%;
				min-height: 330px;
				object-fit: cover;
				object-position: center top;
			}

			.shot-copy {
				padding: 26px;
				background: var(--surface);
				display: grid;
				align-content: end;
			}

			.shot-copy strong {
				font-size: 28px;
				line-height: 1.14;
			}

			.shot-copy p {
				margin: 16px 0 0;
				color: var(--text-soft);
				line-height: 1.68;
			}

			.mini-shots {
				display: grid;
				grid-template-columns: repeat(3, minmax(0, 1fr));
				gap: 8px;
				margin-top: 24px;
			}

			.mini-shots img {
				display: block;
				width: 100%;
				aspect-ratio: 4 / 3;
				object-fit: cover;
				object-position: center top;
				border: 1px solid var(--line);
				border-radius: 0;
				background: #030503;
			}

			.entries {
				display: grid;
				grid-template-columns: repeat(4, minmax(0, 1fr));
				gap: 1px;
				border: 1px solid var(--line);
				border-radius: 0;
				background: var(--line);
				overflow: hidden;
			}

			.entry {
				min-height: 220px;
				padding: 24px;
				display: grid;
				align-content: space-between;
				transition:
					background 160ms ease,
					transform 160ms ease;
			}

			.entry:hover {
				background: rgba(101, 209, 255, 0.11);
				transform: translateY(-2px);
			}

			.entry em {
				display: block;
				margin-top: 26px;
				color: var(--text-muted);
				font-style: normal;
				font-size: 13px;
			}

			.notice {
				margin-top: 18px;
				padding: 16px 18px;
				border: 1px solid rgba(251, 191, 36, 0.34);
				border-radius: 0;
				background: rgba(251, 191, 36, 0.08);
				color: #fde68a;
				font-size: 14px;
				line-height: 1.7;
			}

			.footer {
				padding: 34px 0 44px;
				color: var(--text-muted);
				font-size: 13px;
			}

			.footer-inner {
				display: flex;
				justify-content: space-between;
				gap: 18px;
				border-top: 1px solid var(--line);
				padding-top: 20px;
			}

			.footer strong {
				color: var(--text);
			}

			@media (max-width: 1180px) {
				.hero,
				.install-layout,
				.screenshot-band {
					grid-template-columns: 1fr;
				}

				.hero {
					min-height: auto;
				}

				.grid,
				.entries {
					grid-template-columns: repeat(2, minmax(0, 1fr));
				}
			}

			@keyframes tickerMove {
				from {
					transform: translateX(0);
				}
				to {
					transform: translateX(-50%);
				}
			}

			@media (max-width: 640px) {
				.page {
					width: min(100% - 28px, 1160px);
				}

				.nav-links {
					display: none;
				}

				h1 {
					font-size: clamp(34px, 10vw, 46px);
				}

				.cta-row {
					display: grid;
					grid-template-columns: 1fr;
				}

				.button {
					width: 100%;
				}

				.hero-metrics,
				.grid,
				.entries {
					grid-template-columns: 1fr;
				}

				.command-block {
					font-size: 12px;
				}

				.footer-inner {
					display: grid;
				}
			}
		</style>
	</head>
	<body>
		<nav class="site-nav" aria-label="官网导航">
			<div class="page site-nav-inner">
				<a class="brand" href="/" aria-label="UGK Mini Agent 首页">
					<img src="/ugk-claw-logo.svg" alt="" />
					<span>UGK Mini Agent</span>
				</a>
				<div class="nav-links">
					<a href="#install">快速安装</a>
					<a href="#features">产品能力</a>
					<a href="#screenshots">界面预览</a>
					<a href="#github">源码</a>
				</div>
			</div>
		</nav>

		<main>
			<section class="hero page" aria-labelledby="hero-title">
				<div>
					<div class="hero-lockup" aria-label="UGK Mini Agent 产品标识">
						<img src="/ugk-claw-logo.svg" alt="" />
						<div>
							<span>Official project</span>
							<strong>UGK Mini Agent</strong>
						</div>
					</div>
					<p class="eyebrow">Local-first Agent Runtime</p>
					<h1 id="hero-title">本机优先的 AI Agent 工作台。</h1>
					<p class="hero-subtitle">
						把 Chat、Team Console、Conn 后台任务、模型源配置和 Agent Profile 管理放进同一个本机服务。适合需要私有数据、可控运行环境和跨平台部署的 Agent 使用场景。
					</p>
					<div class="cta-row">
						<a class="button button-primary" href="https://github.com/mhgd3250905/ugk-mini-agent" target="_blank" rel="noreferrer">打开 GitHub</a>
						<a class="button" href="https://gitee.com/ksheng3250905/ugk-mini-agent" target="_blank" rel="noreferrer">打开 Gitee</a>
						<a class="button" href="#install">查看安装</a>
					</div>
					<p class="note">公开官网只提供产品说明、安装方式和源码入口；真实工作台入口请在完成部署后按终端输出访问。</p>
				</div>

				<div class="hero-card" aria-label="产品界面预览">
					<img src="/site-assets/canvas.png" alt="UGK Mini Agent Team Console 任务画布界面截图" fetchpriority="high" decoding="async" />
					<div class="hero-metrics">
						<div class="metric"><span>Team</span><strong>任务画布</strong></div>
						<div class="metric"><span>Chat</span><strong>多模型对话</strong></div>
						<div class="metric"><span>Conn</span><strong>后台任务</strong></div>
					</div>
				</div>
			</section>

			<section class="ticker" aria-label="产品关键词">
				<div class="ticker-track">
					<span>LOCAL-FIRST AGENT RUNTIME</span><span>+</span>
					<span>CHAT / TEAM / CONN</span><span>+</span>
					<span>WINDOWS · MACOS · LINUX</span><span>+</span>
					<span>MODEL SOURCES</span><span>+</span>
					<span>AGENT PROFILES</span><span>+</span>
					<span>GITHUB / GITEE INSTALLATION</span><span>+</span>
					<span>LOCAL-FIRST AGENT RUNTIME</span><span>+</span>
					<span>CHAT / TEAM / CONN</span><span>+</span>
					<span>WINDOWS · MACOS · LINUX</span><span>+</span>
					<span>MODEL SOURCES</span><span>+</span>
					<span>AGENT PROFILES</span><span>+</span>
					<span>GITHUB / GITEE INSTALLATION</span><span>+</span>
				</div>
			</section>

			<section class="section page" id="install" aria-labelledby="install-title">
				<div class="section-head">
					<p class="eyebrow">Quick start</p>
					<h2 id="install-title">三步完成本机部署。</h2>
					<p>先检查系统依赖，再安装项目依赖，最后用对应平台的启动脚本启动。启动成功后，终端会打印本机访问地址和运行日志位置。</p>
				</div>

				<div class="install-layout">
					<div class="steps">
						<article class="step">
							<span>Step 1</span>
							<strong>检查必要配置</strong>
							<p>需要 Git、Node.js 22 或更高版本、npm，以及 Python 3.11。Linux 服务器还要确认安全组或防火墙已放行你准备对外访问的端口。</p>
						</article>
						<article class="step">
							<span>Step 2</span>
							<strong>安装依赖</strong>
							<p>克隆仓库后安装根项目依赖和 Team Console 依赖。首次启动会自动检查并准备运行时 Python 虚拟环境。</p>
						</article>
						<article class="step">
							<span>Step 3</span>
							<strong>启动服务</strong>
							<p>按平台使用对应脚本。需要改端口时，在启动命令后追加 <code>--port &lt;端口&gt;</code>；需要公网监听时追加 <code>--host 0.0.0.0</code>。</p>
						</article>
					</div>

					<div class="command-panel" aria-label="安装命令">
						<p class="command-title">检查环境 <code>Git / Node / Python</code></p>
						<pre class="command-block">git --version
node -v
npm -v
python3 --version</pre>

						<p class="command-title">安装项目 <code>clone & install</code></p>
						<pre class="command-block"># GitHub
git clone https://github.com/mhgd3250905/ugk-mini-agent.git

# 或：Gitee 国内镜像
# git clone https://gitee.com/ksheng3250905/ugk-mini-agent.git

cd ugk-mini-agent
npm install
npm --prefix apps/team-console install</pre>

						<p class="command-title">启动服务 <code>Windows / macOS / Linux</code></p>
						<pre class="command-block"># Windows
UGK-Mini-Agent-Launcher.cmd

# macOS / Linux
chmod +x ./UGK-Mini-Agent-Launcher.sh
./UGK-Mini-Agent-Launcher.sh

# 自定义端口或公网监听
./UGK-Mini-Agent-Launcher.sh --host 0.0.0.0 --port &lt;端口&gt;</pre>

						<div class="notice">
							首次使用时先进入“配置 API 源”添加模型 provider 和 API key，再创建或选择 Agent。MCP、FRP、域名和反向代理属于部署方配置，不会写入公开页面。
						</div>
					</div>
				</div>
			</section>

			<section class="section page" id="features" aria-labelledby="features-title">
				<div class="section-head">
					<p class="eyebrow">Product</p>
					<h2 id="features-title">一个轻量但完整的 Agent 运行台。</h2>
					<p>UGK Mini Agent 把常用 Agent 工作流集中到一个本机服务里：对话、任务画布、后台连接器、模型源、Agent Profile 和运行态文件都可以在本地管理。</p>
				</div>

				<div class="grid">
					<article class="card">
						<span>Chat</span>
						<strong>主 Agent 对话</strong>
						<p>在浏览器里和 Agent 对话，管理会话、资产、上下文占用和运行状态。</p>
					</article>
					<article class="card">
						<span>Team</span>
						<strong>任务画布</strong>
						<p>用 Team Console 组织任务、依赖、分组和执行结果，适合更复杂的工作拆解。</p>
					</article>
					<article class="card">
						<span>Conn</span>
						<strong>后台任务</strong>
						<p>把外部触发或计划任务交给后台 worker 执行，减少人工盯守。</p>
					</article>
					<article class="card">
						<span>Profiles</span>
						<strong>多 Agent 配置</strong>
						<p>为不同用途维护 Agent Profile、模型默认值、技能目录和运行边界。</p>
					</article>
				</div>
			</section>

			<section class="section page" id="screenshots" aria-labelledby="screenshots-title">
				<div class="section-head">
					<p class="eyebrow">Screenshots</p>
					<h2 id="screenshots-title">真实产品界面。</h2>
					<p>官网展示的是当前仓库内置界面截图。对外访客只看到说明和安装指引；真实工作台由部署者按需开放。</p>
				</div>

				<div class="screenshot-band">
					<div class="shot">
						<img src="/site-assets/chat.png" alt="UGK Mini Agent Chat 工作台界面截图" loading="lazy" decoding="async" />
					</div>
					<div class="shot-copy">
						<strong>Team Console 负责把 Agent 工作拆成可观察的任务图。</strong>
						<p>任务、分组、依赖、运行状态和结果交付都集中在同一个画布里。它适合把一次对话无法稳定完成的工作，拆成更清晰的执行单元。</p>
						<div class="mini-shots" aria-label="更多产品截图">
							<img src="/site-assets/conn.png" alt="Conn 后台任务界面截图" loading="lazy" decoding="async" />
							<img src="/site-assets/model-sources.png" alt="模型源配置界面截图" loading="lazy" decoding="async" />
							<img src="/site-assets/agent-profile.png" alt="Agent Profile 配置界面截图" loading="lazy" decoding="async" />
						</div>
					</div>
				</div>
			</section>

			<section class="section page" id="github" aria-labelledby="github-title">
				<div class="section-head">
					<p class="eyebrow">Source</p>
					<h2 id="github-title">从源码开始使用。</h2>
					<p>公开首页只保留仓库入口和安装说明。GitHub 和 Gitee 维护同一套 main 分支与稳定 tag，国内服务器可优先从 Gitee 克隆部署。</p>
				</div>

				<div class="entries">
					<a class="entry" href="https://github.com/mhgd3250905/ugk-mini-agent" target="_blank" rel="noreferrer">
						<div>
							<span>01 / Source</span>
							<strong>GitHub 仓库</strong>
							<p>获取源码、查看 README、跟随平台安装指南完成本机部署。</p>
						</div>
						<em>github.com/mhgd3250905/ugk-mini-agent</em>
					</a>
					<a class="entry" href="https://github.com/mhgd3250905/ugk-mini-agent#quick-start" target="_blank" rel="noreferrer">
						<div>
							<span>02 / Install</span>
							<strong>快速安装</strong>
							<p>按 Windows、macOS、Linux 对应说明检查依赖、安装并启动。</p>
						</div>
						<em>README quick start</em>
					</a>
					<a class="entry" href="https://gitee.com/ksheng3250905/ugk-mini-agent" target="_blank" rel="noreferrer">
						<div>
							<span>03 / China mirror</span>
							<strong>Gitee 国内镜像</strong>
							<p>国内网络或阿里云等服务器部署时，可用 Gitee 镜像克隆同一份源码。</p>
						</div>
						<em>gitee.com/ksheng3250905/ugk-mini-agent</em>
					</a>
					<a class="entry" href="https://github.com/mhgd3250905/ugk-mini-agent/issues" target="_blank" rel="noreferrer">
						<div>
							<span>04 / Issues</span>
							<strong>反馈问题</strong>
							<p>记录安装问题、运行异常、功能建议和后续平台适配需求。</p>
						</div>
						<em>GitHub issues</em>
					</a>
					<a class="entry" href="https://github.com/mhgd3250905/ugk-mini-agent/releases" target="_blank" rel="noreferrer">
						<div>
							<span>05 / Releases</span>
							<strong>版本记录</strong>
							<p>关注后续稳定版本、部署脚本更新和跨平台运行说明。</p>
						</div>
						<em>GitHub releases</em>
					</a>
				</div>
			</section>
		</main>

		<footer class="footer">
			<div class="page footer-inner">
				<span><strong>UGK Mini Agent</strong>，本机优先的 Agent Runtime。</span>
				<span>公开首页只展示说明和 GitHub / Gitee 入口。</span>
			</div>
		</footer>
	</body>
</html>`;
}
