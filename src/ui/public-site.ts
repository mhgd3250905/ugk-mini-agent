export function renderPublicSitePage(): string {
	return `<!doctype html>
<html lang="zh-CN">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>UGK CLAW - Agent 画板</title>
		<meta
			name="description"
			content="UGK CLAW 是面向生产环境的 Agent 任务验收与编排工作台。用干净 Task、可复用 Skill、Checker 审核和 Workflow 编排，把 Agent 结果变得可交付。"
		/>
		<link rel="icon" href="/ugk-claw-logo.svg" />
		<style>
			:root {
				color-scheme: dark;
				--page: oklch(6.5% 0.018 252);
				--page-2: oklch(9% 0.02 250);
				--ink: oklch(97% 0.01 250);
				--ink-soft: oklch(78% 0.03 252);
				--ink-muted: oklch(58% 0.03 252);
				--line: oklch(34% 0.04 252 / 0.52);
				--line-soft: oklch(34% 0.04 252 / 0.24);
				--surface: oklch(13% 0.026 250);
				--surface-2: oklch(16% 0.032 250);
				--aqua: oklch(81% 0.14 188);
				--amber: oklch(80% 0.14 74);
				--green: oklch(83% 0.14 142);
				font-family:
					"OpenAI Sans",
					"Microsoft YaHei",
					"PingFang SC",
					system-ui,
					sans-serif;
				background: var(--page);
				color: var(--ink);
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
					linear-gradient(180deg, oklch(11% 0.025 250), var(--page) 44rem),
					var(--page);
				color: var(--ink);
				text-rendering: geometricPrecision;
			}

			a {
				color: inherit;
				text-decoration: none;
			}

			img {
				max-width: 100%;
			}

			.page {
				width: min(1160px, calc(100% - 40px));
				margin: 0 auto;
			}

			.site-nav {
				position: sticky;
				top: 0;
				z-index: 20;
				border-bottom: 1px solid var(--line-soft);
				background: oklch(6.5% 0.018 252 / 0.82);
				backdrop-filter: blur(22px);
			}

			.site-nav-inner {
				width: min(1160px, calc(100% - 40px));
				height: 58px;
				margin: 0 auto;
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
				letter-spacing: 0.02em;
			}

			.brand-mark {
				display: grid;
				place-items: center;
				width: 32px;
				height: 32px;
				border: 1px solid oklch(81% 0.14 188 / 0.46);
				border-radius: 7px;
				color: var(--aqua);
				background: oklch(81% 0.14 188 / 0.09);
				font-family: Consolas, "Cascadia Mono", monospace;
				font-size: 12px;
			}

			.nav-links {
				display: flex;
				align-items: center;
				gap: 2px;
				color: var(--ink-muted);
				font-size: 13px;
			}

			.nav-links a {
				padding: 8px 11px;
				border-radius: 7px;
			}

			.nav-links a:hover {
				background: oklch(100% 0 0 / 0.055);
				color: var(--ink);
			}

			.hero {
				position: relative;
				padding: clamp(38px, 5vw, 68px) 0 24px;
				display: grid;
				grid-template-rows: auto auto;
				align-items: start;
				overflow: clip;
			}

			.hero-copy {
				position: relative;
				z-index: 2;
				max-width: 880px;
				margin: 0 auto;
				text-align: center;
			}

			.hero-eyebrow {
				margin: 0 0 16px;
				color: var(--aqua);
				font-family: Consolas, "Cascadia Mono", monospace;
				font-size: 12px;
				letter-spacing: 0.06em;
				text-transform: uppercase;
			}

			h1 {
				margin: 0;
				font-size: clamp(44px, 5.6vw, 88px);
				line-height: 1.02;
				letter-spacing: 0;
				text-wrap: balance;
			}

			.hero-subtitle {
				max-width: 760px;
				margin: 18px auto 0;
				color: var(--ink-soft);
				font-size: clamp(18px, 1.85vw, 25px);
				line-height: 1.42;
			}

			.hero-subtitle strong {
				color: var(--ink);
				font-weight: 780;
			}

			.cta-row {
				display: inline-flex;
				justify-content: center;
				flex-wrap: wrap;
				gap: 4px;
				margin-top: 26px;
				padding: 5px;
				border: 1px solid var(--line-soft);
				border-radius: 12px;
				background: oklch(7.5% 0.019 250 / 0.92);
			}

			.cta-note {
				margin: 12px 0 0;
				color: var(--ink-muted);
				font-size: 13px;
			}

			.button {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				min-height: 42px;
				padding: 0 18px;
				border: 0;
				border-radius: 8px;
				background: transparent;
				color: var(--ink-soft);
				font-size: 14px;
				font-weight: 720;
				transition:
					background 160ms ease,
					color 160ms ease,
					transform 160ms ease;
			}

			.button:hover {
				background: oklch(100% 0 0 / 0.055);
				color: var(--ink);
			}

			.button:focus-visible {
				outline: 2px solid oklch(81% 0.14 188 / 0.82);
				outline-offset: 3px;
			}

			.button-primary {
				background: oklch(94% 0.012 245);
				color: oklch(8% 0.018 250);
			}

			.button-primary::after {
				content: "";
				width: 7px;
				height: 7px;
				margin-left: 10px;
				border-right: 1.5px solid currentColor;
				border-bottom: 1.5px solid currentColor;
				transform: rotate(-45deg);
			}

			.button-primary:hover {
				background: oklch(98% 0.008 245);
				color: oklch(8% 0.018 250);
				transform: translateY(-1px);
			}

			.hero-art-wrap {
				position: relative;
				z-index: 1;
				width: min(760px, 100%);
				margin: clamp(22px, 3vw, 34px) auto 0;
			}

			.hero-art {
				display: block;
				width: 100%;
				border-radius: 18px;
				mask-image: linear-gradient(180deg, black 70%, transparent 100%);
				opacity: 0;
				animation: artIn 900ms cubic-bezier(0.16, 1, 0.3, 1) 120ms forwards;
			}

			.hero-art-note {
				position: absolute;
				right: clamp(14px, 4vw, 72px);
				bottom: clamp(18px, 5vw, 76px);
				width: min(330px, 42vw);
				padding: 16px;
				border: 1px solid var(--line);
				border-radius: 14px;
				background: oklch(9% 0.02 250 / 0.74);
				backdrop-filter: blur(18px);
				color: var(--ink-soft);
				font-size: 13px;
				line-height: 1.6;
			}

			.hero-art-note strong {
				display: block;
				margin-bottom: 7px;
				color: var(--ink);
				font-size: 15px;
			}

			.hero-strip {
				display: grid;
				grid-template-columns: repeat(4, minmax(0, 1fr));
				gap: 1px;
				margin-top: -18px;
				border: 1px solid var(--line-soft);
				border-radius: 16px;
				background: var(--line-soft);
				overflow: hidden;
			}

			.strip-item {
				min-height: 122px;
				padding: 18px 20px;
				background: oklch(8.5% 0.02 250 / 0.96);
			}

			.strip-item span {
				display: block;
				color: var(--ink-muted);
				font-family: Consolas, "Cascadia Mono", monospace;
				font-size: 11px;
				text-transform: uppercase;
			}

			.strip-item strong {
				display: block;
				margin-top: 18px;
				font-size: clamp(20px, 1.7vw, 27px);
				line-height: 1.08;
			}

			.strip-item p {
				margin: 12px 0 0;
				color: var(--ink-soft);
				font-size: 13px;
				line-height: 1.55;
			}

			.section {
				padding: clamp(76px, 9vw, 132px) 0;
				border-top: 1px solid var(--line-soft);
			}

			.section-head {
				max-width: 850px;
				margin: 0 auto clamp(34px, 5vw, 62px);
				text-align: center;
			}

			.kicker {
				margin: 0 0 14px;
				color: var(--aqua);
				font-family: Consolas, "Cascadia Mono", monospace;
				font-size: 12px;
				letter-spacing: 0.04em;
			}

			h2 {
				margin: 0;
				font-size: clamp(38px, 5.6vw, 78px);
				line-height: 0.98;
				letter-spacing: 0;
				text-wrap: balance;
			}

			.section-head p {
				max-width: 760px;
				margin: 20px auto 0;
				color: var(--ink-soft);
				font-size: clamp(17px, 1.7vw, 21px);
				line-height: 1.66;
			}

			.product-shot {
				position: relative;
				border-radius: 22px;
				padding: 10px;
				background:
					linear-gradient(135deg, oklch(81% 0.14 188 / 0.35), transparent 28%, oklch(80% 0.14 74 / 0.22)),
					oklch(12% 0.024 250);
				border: 1px solid var(--line);
				overflow: hidden;
			}

			.product-shot img {
				display: block;
				width: 100%;
				border-radius: 14px;
			}

			.product-caption {
				display: flex;
				justify-content: space-between;
				gap: 16px;
				padding: 18px 10px 6px;
				color: var(--ink-soft);
				font-size: 14px;
				line-height: 1.55;
			}

			.product-caption strong {
				color: var(--ink);
			}

			.product-caption code {
				color: var(--green);
				font-family: Consolas, "Cascadia Mono", monospace;
			}

			.trust-system {
				margin-top: 30px;
			}

			.trust-map {
				display: grid;
				grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr;
				align-items: stretch;
				gap: 12px;
				margin-top: 34px;
			}

			.trust-node {
				min-height: 245px;
				padding: 22px;
				border: 1px solid var(--line-soft);
				border-radius: 16px;
				background:
					linear-gradient(180deg, oklch(15% 0.03 250), oklch(9% 0.02 250)),
					var(--surface);
			}

			.trust-node.is-risk {
				background:
					linear-gradient(180deg, oklch(18% 0.045 28 / 0.76), oklch(9% 0.02 250)),
					var(--surface);
			}

			.trust-node.is-pass {
				background:
					linear-gradient(180deg, oklch(18% 0.05 150 / 0.72), oklch(9% 0.02 250)),
					var(--surface);
			}

			.trust-node span,
			.trust-result span {
				color: var(--aqua);
				font-family: Consolas, "Cascadia Mono", monospace;
				font-size: 12px;
			}

			.trust-node strong {
				display: block;
				margin-top: 34px;
				font-size: clamp(22px, 2.1vw, 32px);
				line-height: 1.1;
			}

			.trust-node p {
				margin: 14px 0 0;
				color: var(--ink-soft);
				line-height: 1.66;
			}

			.trust-arrow {
				display: grid;
				place-items: center;
				width: 28px;
				color: var(--ink-muted);
				font-family: Consolas, "Cascadia Mono", monospace;
			}

			.trust-result {
				margin-top: 14px;
				padding: 22px 24px;
				border: 1px solid oklch(83% 0.14 142 / 0.28);
				border-radius: 16px;
				background: oklch(83% 0.14 142 / 0.08);
			}

			.trust-result strong {
				display: block;
				margin-top: 10px;
				font-size: clamp(24px, 2.6vw, 40px);
				line-height: 1.08;
			}

			.trust-result p {
				margin: 12px 0 0;
				color: var(--ink-soft);
				line-height: 1.66;
			}

			.definition-grid {
				display: grid;
				grid-template-columns: 1.15fr 0.85fr;
				gap: 1px;
				margin-bottom: 28px;
				border: 1px solid var(--line-soft);
				border-radius: 18px;
				background: var(--line-soft);
				overflow: hidden;
			}

			.definition-card {
				padding: clamp(22px, 3vw, 34px);
				background: oklch(10% 0.022 250);
			}

			.definition-card span,
			.capability span,
			.flow-step span {
				color: var(--aqua);
				font-family: Consolas, "Cascadia Mono", monospace;
				font-size: 12px;
			}

			.definition-card strong {
				display: block;
				margin-top: 14px;
				font-size: clamp(25px, 2.8vw, 42px);
				line-height: 1.08;
			}

			.definition-card p {
				margin: 18px 0 0;
				color: var(--ink-soft);
				font-size: clamp(16px, 1.45vw, 19px);
				line-height: 1.72;
			}

			.definition-card code {
				color: var(--green);
				font-family: Consolas, "Cascadia Mono", monospace;
			}

			.capability-grid {
				display: grid;
				grid-template-columns: repeat(4, minmax(0, 1fr));
				gap: 1px;
				border: 1px solid var(--line-soft);
				border-radius: 18px;
				background: var(--line-soft);
				overflow: hidden;
			}

			.capability {
				min-height: 310px;
				padding: 24px;
				background:
					linear-gradient(180deg, oklch(16% 0.032 250), oklch(10% 0.02 250)),
					var(--surface);
			}

			.use-case-grid .capability {
				min-height: 492px;
				display: grid;
				grid-template-rows: auto 1fr;
				padding: 0;
				overflow: hidden;
			}

			.capability-visual {
				position: relative;
				min-height: 196px;
				overflow: hidden;
				background: oklch(8% 0.018 250);
			}

			.capability-visual::after {
				content: "";
				position: absolute;
				inset: 0;
				background:
					linear-gradient(180deg, transparent 44%, oklch(13% 0.026 250) 100%),
					linear-gradient(90deg, oklch(6.5% 0.018 252 / 0.46), transparent 38%, oklch(6.5% 0.018 252 / 0.38));
			}

			.capability-visual img {
				width: 100%;
				height: 100%;
				min-height: 196px;
				display: block;
				object-fit: cover;
				object-position: center center;
			}

			.capability-copy {
				display: grid;
				align-content: end;
				padding: 22px 24px 26px;
			}

			.capability strong {
				display: block;
				margin-top: 42px;
				font-size: clamp(22px, 2vw, 31px);
				line-height: 1.1;
			}

			.use-case-grid .capability strong {
				margin-top: 28px;
			}

			.capability p {
				margin: 16px 0 0;
				color: var(--ink-soft);
				line-height: 1.66;
			}

			.experience-grid {
				display: grid;
				grid-template-columns: repeat(3, minmax(0, 1fr));
				gap: 1px;
				border: 1px solid var(--line-soft);
				border-radius: 18px;
				background: var(--line-soft);
				overflow: hidden;
			}

			.experience {
				min-height: 500px;
				display: grid;
				grid-template-rows: auto 1fr;
				background: var(--surface);
			}

			.role-visual {
				position: relative;
				min-height: 232px;
				overflow: hidden;
				background: oklch(8% 0.018 250);
			}

			.role-visual::after {
				content: "";
				position: absolute;
				inset: 0;
				background:
					linear-gradient(180deg, transparent 46%, oklch(13% 0.026 250) 100%),
					linear-gradient(90deg, oklch(6.5% 0.018 252 / 0.46), transparent 35%, oklch(6.5% 0.018 252 / 0.42));
			}

			.role-visual img {
				width: 100%;
				height: 100%;
				min-height: 232px;
				display: block;
				object-fit: cover;
				object-position: center center;
			}

			.role-copy {
				display: grid;
				align-content: end;
				padding: 24px 26px 28px;
			}

			.experience span {
				color: var(--aqua);
				font-family: Consolas, "Cascadia Mono", monospace;
				font-size: 12px;
			}

			.experience strong {
				display: block;
				margin-top: 14px;
				font-size: clamp(25px, 2.5vw, 38px);
				line-height: 1.06;
			}

			.experience p {
				margin: 14px 0 0;
				color: var(--ink-soft);
				line-height: 1.68;
			}

			.flow-steps {
				display: grid;
				grid-template-columns: repeat(4, minmax(0, 1fr));
				gap: 1px;
				border: 1px solid var(--line-soft);
				border-radius: 18px;
				background: var(--line-soft);
				overflow: hidden;
			}

			.flow-step {
				min-height: 260px;
				padding: 24px;
				background: oklch(10% 0.02 250);
			}

			.flow-step strong {
				display: block;
				margin-top: 34px;
				font-size: clamp(22px, 2vw, 32px);
				line-height: 1.08;
			}

			.flow-step p {
				margin: 16px 0 0;
				color: var(--ink-soft);
				line-height: 1.66;
			}

			.docs {
				display: grid;
				grid-template-columns: repeat(4, minmax(0, 1fr));
				gap: 1px;
				border: 1px solid var(--line-soft);
				border-radius: 18px;
				background: var(--line-soft);
				overflow: hidden;
			}

			.doc-link {
				min-height: 220px;
				padding: 24px;
				background: oklch(10% 0.02 250);
				display: grid;
				align-content: space-between;
				transition:
					background 160ms ease,
					transform 160ms ease;
			}

			.doc-link:hover {
				background: oklch(13% 0.026 250);
				transform: translateY(-2px);
			}

			.doc-link strong {
				display: block;
				margin-top: 18px;
				font-size: clamp(21px, 1.8vw, 28px);
				line-height: 1.12;
			}

			.doc-link span {
				display: block;
				color: var(--aqua);
				font-family: Consolas, "Cascadia Mono", monospace;
				font-size: 12px;
				text-transform: uppercase;
			}

			.doc-link p {
				margin: 18px 0 0;
				color: var(--ink-soft);
				font-size: 14px;
				line-height: 1.68;
			}

			.doc-link em {
				display: block;
				margin-top: 28px;
				color: var(--ink-muted);
				font-size: 13px;
				font-style: normal;
			}

			.footer {
				padding: 38px 0 48px;
				color: var(--ink-muted);
				font-size: 13px;
			}

			.footer-inner {
				display: flex;
				justify-content: space-between;
				gap: 20px;
				border-top: 1px solid var(--line-soft);
				padding-top: 22px;
			}

			.footer strong {
				color: var(--ink);
			}

			@keyframes artIn {
				from {
					opacity: 0;
					transform: translateY(24px) scale(0.985);
				}
				to {
					opacity: 1;
					transform: translateY(0) scale(1);
				}
			}

			@media (max-width: 980px) {
				.hero {
					min-height: auto;
					padding-top: 48px;
				}

				.hero-art-note {
					position: static;
					width: auto;
					margin: -8px 14px 0;
				}

				.hero-strip,
				.definition-grid,
				.trust-map,
				.capability-grid,
				.flow-steps {
					grid-template-columns: 1fr;
				}

				.trust-arrow {
					width: auto;
					min-height: 28px;
					font-size: 0;
					transform: none;
				}

				.trust-arrow::before {
					content: "↓";
					font-size: 18px;
				}

				.experience-grid,
				.docs {
					grid-template-columns: 1fr;
				}

				.product-caption {
					display: grid;
				}
			}

			@media (max-width: 640px) {
				.page,
				.site-nav-inner {
					width: min(100% - 28px, 1160px);
				}

				.nav-links {
					display: none;
				}

				.hero {
					padding-bottom: 24px;
				}

				h1 {
					font-size: clamp(44px, 14vw, 60px);
				}

				.hero-subtitle {
					font-size: 18px;
				}

				.cta-row {
					display: grid;
					grid-template-columns: minmax(0, 1fr);
					width: 100%;
					gap: 10px;
					padding: 0;
					border: 0;
					background: transparent;
				}

				.cta-row .button {
					width: 100%;
				}

				.button {
					min-height: 48px;
					border: 1px solid var(--line-soft);
					background: oklch(9.5% 0.022 250);
				}

				.button-primary {
					border-color: oklch(94% 0.012 245);
					background: oklch(94% 0.012 245);
				}

				.hero-art {
					border-radius: 12px;
					aspect-ratio: 16 / 11;
					object-fit: cover;
					object-position: center;
				}

				.hero-strip {
					margin-top: 12px;
				}

				.strip-item {
					min-height: 96px;
				}

				.product-shot {
					padding: 6px;
					border-radius: 16px;
				}

				.product-shot img {
					border-radius: 11px;
				}

				.experience {
					min-height: 430px;
				}

				.role-visual,
				.role-visual img {
					min-height: 190px;
				}

				.role-copy {
					padding: 22px;
				}

				.use-case-grid .capability {
					min-height: 430px;
				}

				.capability-visual,
				.capability-visual img {
					min-height: 188px;
				}

				.capability-copy {
					padding: 22px;
				}

				.footer-inner {
					display: grid;
				}
			}
		</style>
	</head>
	<body>
		<nav class="site-nav" aria-label="官网导航">
			<div class="site-nav-inner">
				<a class="brand" href="/">
					<span class="brand-mark">UGK</span>
					<span>UGK CLAW</span>
				</a>
				<div class="nav-links">
					<a href="#product">产品</a>
					<a href="#trust-system">可信机制</a>
					<a href="#flow">任务流程</a>
					<a href="#highlights">亮点</a>
					<a href="https://github.com/mhgd3250905/ugk-claw-personal">GitHub</a>
				</div>
			</div>
		</nav>

		<main>
			<section class="hero page" aria-labelledby="hero-title">
				<div class="hero-copy">
					<p class="hero-eyebrow">Task acceptance / Agent workflow</p>
					<h1 id="hero-title">让每个 Agent 任务，都可验收</h1>
					<p class="hero-subtitle">
						<strong>UGK CLAW</strong> 把一次 Agent 工作拆成干净的 Task、可复用的 Skill、负责执行的 Worker 和负责验收的 Checker。它不是只让模型回答，而是让结果经过审核后再交付。
					</p>
					<div class="cta-row">
						<a class="button button-primary" href="#product">看它解决什么问题</a>
						<a class="button" href="#flow">看可信 Task 怎么产生</a>
						<a class="button" href="https://github.com/mhgd3250905/ugk-claw-personal">查看 GitHub</a>
					</div>
					<p class="cta-note">目标不是堆更多 Agent，而是让每个可复用任务都有边界、有证据、有验收。</p>
				</div>

				<div class="hero-art-wrap" aria-label="Agent 画板产品视觉">
					<img class="hero-art" src="/site-assets/team-canvas-product-hero.png" alt="抽象的 UGK CLAW Agent 画板产品视觉，任务节点、Agent 节点和证据节点连接在同一个工作面上" />
					<div class="hero-art-note">
						<strong>概念化产品视觉。</strong>
						它表达 Agent 画板的工作方式；真实产品界面在下一屏。
					</div>
				</div>
			</section>

			<section class="page hero-strip" aria-label="关键体验">
				<div class="strip-item"><span>01 / risk</span><strong>结果不默认可信</strong><p>哪怕只有少量幻觉、偷工减料或伪造结果，生产任务也不该直接交付。</p></div>
				<div class="strip-item"><span>02 / task</span><strong>Task 保持干净</strong><p>一个 Task 是干净会话加完整 Skill，避免冗长对话上下文污染复用结果。</p></div>
				<div class="strip-item"><span>03 / check</span><strong>Checker 负责验收</strong><p>审核机制把任务要求、运行证据和输出结果放到同一条验收链路里。</p></div>
				<div class="strip-item"><span>04 / workflow</span><strong>可信任务可编排</strong><p>通过审核的 Task 才适合串联或并联，组成更复杂的 Workflow。</p></div>
			</section>

			<section class="section page" id="product" aria-labelledby="product-title">
				<div class="section-head">
					<p class="kicker">The problem</p>
					<h2 id="product-title">普通 Agent 对话，不适合直接进生产。</h2>
					<p>模型再强也会幻觉。更麻烦的是，低成本模型常常不是不会做，而是不稳定、不完全遵从任务，甚至在自动执行时偷工减料。没有验收机制，结果就不能被信任。</p>
				</div>

				<div class="definition-grid">
					<div class="definition-card">
						<span>Core risk</span>
						<strong>1% 的不可信，也不该进入交付链路。</strong>
						<p>Agent 直接给出答案并不等于任务完成。生产环境需要知道它是否遵从要求、是否真的执行、结果从哪里来、有没有证据支撑。</p>
					</div>
					<div class="definition-card">
						<span>UGK CLAW answer</span>
						<strong>Task 执行，Checker 验收，Workflow 编排。</strong>
						<p>UGK CLAW 用干净 Task 承载可复用 Skill，用 Worker 执行，用 Checker 审核，再把可信 Task 串联或并联成复杂流程。</p>
					</div>
				</div>

				<figure class="product-shot">
					<img src="/site-assets/team-console-hero.png" alt="UGK CLAW Agent 画板真实界面截图" />
					<figcaption class="product-caption">
						<span><strong>Agent 画板</strong> 是当前对外介绍优先展示的真实产品入口，不是概念图。</span>
						<code>actual product</code>
					</figcaption>
				</figure>
			</section>

			<section class="section page trust-system" id="trust-system" aria-labelledby="trust-system-title">
				<div class="section-head">
					<p class="kicker">Trust system</p>
					<h2 id="trust-system-title">可信交付，不靠模型自觉。</h2>
					<p>UGK CLAW 把“模型可能会乱来”当成默认前提来设计。它不要求每个模型永远听话，而是用干净 Task、执行记录和 Checker 验收，把不稳定输出拦在交付之前。</p>
				</div>

				<div class="trust-map" aria-label="可信 Task 交付链路">
					<article class="trust-node is-risk">
						<span>risk</span>
						<strong>污染上下文与幻觉风险</strong>
						<p>长对话会混入历史偏差；自动任务里模型可能漏做、少做，甚至编造已经完成的结果。</p>
					</article>
					<div class="trust-arrow" aria-hidden="true">-&gt;</div>
					<article class="trust-node">
						<span>task</span>
						<strong>干净 Task 承载 Skill</strong>
						<p>每次执行都从明确边界开始，只带必要资料、完整 Skill 和期望产物。</p>
					</article>
					<div class="trust-arrow" aria-hidden="true">-&gt;</div>
					<article class="trust-node">
						<span>worker</span>
						<strong>Worker 执行并留痕</strong>
						<p>执行过程保留状态、文件、浏览器上下文、中间产物和错误信息。</p>
					</article>
					<div class="trust-arrow" aria-hidden="true">-&gt;</div>
					<article class="trust-node is-pass">
						<span>checker</span>
						<strong>Checker 审核后交付</strong>
						<p>审核员对照任务要求验收结果，拦截幻觉、漏项、偷工减料和伪造证据。</p>
					</article>
				</div>

				<div class="trust-result">
					<span>result</span>
					<strong>通过验收的 Task，才进入 Workflow。</strong>
					<p>一个个可信 Task 可以被串联或并联，承担更复杂任务的一环；这才是可复用 Skill 真正能落地的方式。</p>
				</div>
			</section>

			<section class="section page" id="use-cases" aria-labelledby="use-cases-title">
				<div class="section-head">
					<p class="kicker">What you can do</p>
					<h2 id="use-cases-title">从会聊天，变成可交付。</h2>
					<p>UGK CLAW 的工作重点不是让 Agent 多说几句，而是把任务边界、执行环境、审核标准和编排方式都固定下来。</p>
				</div>

				<div class="capability-grid use-case-grid">
					<article class="capability">
						<div class="capability-visual">
							<img src="/site-assets/capability-create-task.png" alt="目标被整理成清晰任务卡片的 Agent 画板视觉" />
						</div>
						<div class="capability-copy">
							<span>01 / isolate</span>
							<strong>把任务隔离出来</strong>
							<p>Task 不是一条聊天消息，而是一个干净会话，带着完整 Skill、目标、约束、输入和期望产物运行。</p>
						</div>
					</article>
					<article class="capability">
						<div class="capability-visual">
							<img src="/site-assets/capability-context-materials.png" alt="文件页面和浏览器上下文汇入任务资料区的视觉" />
						</div>
						<div class="capability-copy">
							<span>02 / context</span>
							<strong>防止上下文污染</strong>
							<p>复杂能力可以从对话中沉淀成 Skill，但每次执行都回到干净任务环境，减少旧对话对新结果的干扰。</p>
						</div>
					</article>
					<article class="capability">
						<div class="capability-visual">
							<img src="/site-assets/capability-role-execute.png" alt="Leader Worker Checker 角色节点协同执行任务的视觉" />
						</div>
						<div class="capability-copy">
							<span>03 / execute</span>
							<strong>让 Worker 执行</strong>
							<p>Worker 按固定 Task 或 Workflow 做具体工作，把资料、浏览器上下文和中间产物纳入可观察的运行过程。</p>
						</div>
					</article>
					<article class="capability">
						<div class="capability-visual">
							<img src="/site-assets/capability-inspect-evidence.png" alt="输出文件和运行证据通过扫描检查的视觉" />
						</div>
						<div class="capability-copy">
							<span>04 / accept</span>
							<strong>由 Checker 验收</strong>
							<p>Checker 对照任务要求检查输出、证据、错误和遗漏，把“模型说完成了”变成“结果通过验收”。</p>
						</div>
					</article>
				</div>
			</section>

			<section class="section page" id="team-model" aria-labelledby="team-model-title">
				<div class="section-head">
					<p class="kicker">Team model</p>
					<h2 id="team-model-title">工作小组不是包装，是验收结构。</h2>
					<p>Leader、Worker、Checker 的分工，是为了把“执行”和“验收”拆开。便宜模型可以承担部分执行，但结果必须经过独立审核才能进入下一步。</p>
				</div>

				<div class="experience-grid">
					<article class="experience role-leader">
						<div class="role-visual">
							<img src="/site-assets/agent-role-leader.png" alt="组长 Leader 角色视觉，中心调度台把任务和成员连接起来" />
						</div>
						<div class="role-copy">
							<span>Leader</span>
							<strong>组长 Leader</strong>
							<p>拆解目标、澄清边界、组织资料和角色，让任务从一段需求变成可执行的工作单元。</p>
						</div>
					</article>
					<article class="experience role-worker">
						<div class="role-visual">
							<img src="/site-assets/agent-role-worker.png" alt="执行员 Worker 角色视觉，机械臂正在处理任务和资料产物" />
						</div>
						<div class="role-copy">
							<span>Worker</span>
							<strong>执行员 Worker</strong>
							<p>在干净 Task 环境里执行 Skill 或 Workflow，尽量减少被历史上下文带偏的概率。</p>
						</div>
					</article>
					<article class="experience role-checker">
						<div class="role-visual">
							<img src="/site-assets/agent-role-checker.png" alt="审核员 Checker 角色视觉，放大镜正在检查错误和运行证据" />
						</div>
						<div class="role-copy">
							<span>Checker</span>
							<strong>审核员 Checker</strong>
							<p>检查结果是否满足要求，拦住幻觉、漏项、偷工减料和伪造证据。审核是交付链路的一部分。</p>
						</div>
					</article>
				</div>
			</section>

			<section class="section page" id="flow" aria-labelledby="flow-title">
				<div class="section-head">
					<p class="kicker">How a task runs</p>
					<h2 id="flow-title">可信 Task 怎么产生？</h2>
					<p>一个复杂能力可以从对话里长出来，但真正复用时必须脱离被污染的长上下文。UGK CLAW 把它变成干净 Task，再用 Checker 给结果做验收。</p>
				</div>

				<div class="flow-steps">
					<article class="flow-step">
						<span>Step 1</span>
						<strong>沉淀 Skill</strong>
						<p>把对话中已经验证过的复杂能力抽取成 Skill，明确输入、步骤、边界和输出标准。</p>
					</article>
					<article class="flow-step">
						<span>Step 2</span>
						<strong>放进干净 Task</strong>
						<p>每次执行都从干净会话开始，只带必要资料和 Skill，避免旧上下文污染新任务。</p>
					</article>
					<article class="flow-step">
						<span>Step 3</span>
						<strong>执行并保留证据</strong>
						<p>Worker 执行任务，保留运行状态、文件、浏览器动作、中间产物和错误信息。</p>
					</article>
					<article class="flow-step">
						<span>Step 4</span>
						<strong>审核后再编排</strong>
						<p>Checker 验收通过后，这个可信 Task 才适合串联或并联，承担更复杂 Workflow 的一环。</p>
					</article>
				</div>
			</section>

			<section class="section page" id="highlights" aria-labelledby="highlights-title">
				<div class="section-head">
					<p class="kicker">Why it matters</p>
					<h2 id="highlights-title">亮点在可信交付。</h2>
					<p>UGK CLAW 的对外价值是让 Agent 工作从“模型回答”变成“可执行、可验收、可复用、可编排”的交付系统。</p>
				</div>

				<div class="capability-grid">
					<article class="capability">
						<span>visible</span>
						<strong>过程可观察</strong>
						<p>任务、资料、角色、状态、产物和证据不再散落在对话里，而是在 Agent 画板上形成可理解的工作图。</p>
					</article>
					<article class="capability">
						<span>controlled</span>
						<strong>上下文可控</strong>
						<p>Task 从干净会话启动，带着明确 Skill 和必要资料运行，让复用不再被长对话污染。</p>
					</article>
					<article class="capability">
						<span>auditable</span>
						<strong>结果可验收</strong>
						<p>Checker 不是装饰角色，而是把检查标准放进流程，让输出、错误和证据都能被回看。</p>
					</article>
					<article class="capability">
						<span>reusable</span>
						<strong>Task 可编排</strong>
						<p>一个个可信 Task 可以像积木一样串联或并联，支撑更复杂的自动化任务。</p>
					</article>
				</div>
			</section>

			<section class="section page" aria-labelledby="docs-title">
				<div class="section-head">
					<p class="kicker">Documentation path</p>
					<h2 id="docs-title">先看为什么可信，再看怎么上手。</h2>
					<p>文档不该只把入口列出来。新用户应该先理解 UGK CLAW 为什么要把 Agent 工作拆成 Task、Skill、Worker 和 Checker，再进入 Agent 画板查看任务、证据和审核链路。</p>
				</div>
				<div class="docs">
					<a class="doc-link" href="https://github.com/mhgd3250905/ugk-claw-personal/blob/main/README.md">
						<div>
							<span>01 / product</span>
							<strong>先读产品定位</strong>
							<p>理解为什么普通 Agent 对话不能直接进生产，以及 UGK CLAW 如何用可信 Task 交付解决幻觉、漏项和伪造结果。</p>
						</div>
						<em>中文 README</em>
					</a>
					<a class="doc-link" href="https://github.com/mhgd3250905/ugk-claw-personal/blob/main/README.md#你该先看什么">
						<div>
							<span>02 / board</span>
							<strong>再看 Agent 画板</strong>
							<p>从任务、资料、角色、运行状态和证据链路理解产品，而不是先掉进一段漫长的 Agent 对话里。</p>
						</div>
						<em>上手路径</em>
					</a>
					<a class="doc-link" href="https://github.com/mhgd3250905/ugk-claw-personal/blob/main/README.md#可信-task-交付">
						<div>
							<span>03 / acceptance</span>
							<strong>理解验收机制</strong>
							<p>看 Task 为什么必须保持干净、Worker 为什么要留痕、Checker 如何把“模型说完成了”变成“结果通过验收”。</p>
						</div>
						<em>可信 Task 交付</em>
					</a>
					<a class="doc-link" href="/playground">
						<div>
							<span>04 / conversation</span>
							<strong>需要对话时再进 Chat 工作台</strong>
							<p>当你需要和某个 Agent 深聊、管理文件、调整模型或查看后台任务时，再进入传统 Chat 工作台。</p>
						</div>
						<em>次级产品入口</em>
					</a>
				</div>
			</section>
		</main>

		<footer class="footer">
			<div class="page footer-inner">
				<span><strong>UGK CLAW</strong>，面向生产环境的可信 Agent 任务交付系统。</span>
				<span>Self-hosted Agent task acceptance and workflow workspace.</span>
			</div>
		</footer>
	</body>
</html>`;
}
