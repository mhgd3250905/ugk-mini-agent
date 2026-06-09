export function getPlaygroundContextUsageStyles(): string {
	return `
		.context-usage-row {
			display: none;
		}

		.context-usage-shell {
			position: relative;
			display: inline-grid;
			grid-template-columns: 48px auto;
			align-items: center;
			gap: 7px;
			width: 88px;
			height: 28px;
			padding: 5px 10px 5px 7px;
			border: 1px solid rgba(201, 210, 255, 0.1);
			border-radius: 4px;
			background: rgba(9, 12, 22, 0.72);
			color: rgba(247, 249, 255, 0.9);
			box-shadow: none;
			z-index: 50;
		}

		.context-usage-shell:hover,
		.context-usage-shell:focus-visible,
		.context-usage-shell[data-expanded="true"] {
			border-color: rgba(201, 210, 255, 0.28);
			background: rgba(14, 18, 31, 0.96);
		}

		.context-usage-battery {
			position: relative;
			display: block;
			width: 48px;
			height: 13px;
			padding: 2px;
			border: 1px solid rgba(201, 210, 255, 0.22);
			border-radius: 4px;
			background: rgba(255, 255, 255, 0.035);
			overflow: hidden;
		}

		.context-usage-battery::after {
			content: "";
			position: absolute;
			top: 3px;
			right: 2px;
			bottom: 3px;
			width: 2px;
			border-radius: 1px;
			background: rgba(201, 210, 255, 0.22);
		}

		.context-usage-progress {
			--context-usage-percent: 0%;
			display: block;
			width: var(--context-usage-percent);
			height: 100%;
			max-width: 100%;
			border-radius: 2px;
			background:
				repeating-linear-gradient(
					90deg,
					rgba(143, 255, 199, 0.96) 0 5px,
					transparent 5px 7px
				);
			transition: width 160ms ease, background 160ms ease;
		}

		.context-usage-summary {
			position: relative;
			z-index: 1;
			padding-right: 2px;
			font-size: 9px;
			font-weight: 700;
			letter-spacing: -0.03em;
		}

		.context-usage-toggle {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
		}

		.context-usage-meta {
			position: absolute;
			top: calc(100% + 10px);
			right: 0;
			bottom: auto;
			z-index: 90;
			display: grid;
			gap: 9px;
			width: min(318px, calc(100vw - 24px));
			padding: 12px;
			border: 1px solid rgba(143, 214, 255, 0.16);
			border-radius: 6px;
			background:
				linear-gradient(180deg, rgba(18, 27, 44, 0.99), rgba(9, 14, 24, 0.99)),
				#0b1220;
			box-shadow: none;
			color: rgba(225, 232, 247, 0.82);
			font-size: 11px;
			line-height: 1.35;
			text-align: left;
			white-space: normal;
			opacity: 0;
			pointer-events: none;
			transform: translateY(-4px);
			transition: opacity 120ms ease, transform 120ms ease;
		}

		.context-usage-meta-head,
		.context-usage-meta-main,
		.context-usage-meta-grid,
		.context-usage-meta-model {
			display: block;
			min-width: 0;
		}

		.context-usage-meta-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 10px;
		}

		.context-usage-meta-kicker {
			color: rgba(225, 232, 247, 0.58);
			font-size: 10px;
			font-weight: 700;
			letter-spacing: 0.14em;
			text-transform: uppercase;
		}

		.context-usage-meta-status {
			padding: 3px 6px;
			border-radius: 4px;
			background: rgba(141, 255, 178, 0.1);
			color: rgba(141, 255, 178, 0.92);
			font-size: 10px;
			font-weight: 700;
			line-height: 1;
		}

		.context-usage-meta-main {
			display: grid;
			gap: 2px;
		}

		.context-usage-meta-main strong {
			color: rgba(247, 249, 255, 0.96);
			font-family: var(--font-mono);
			font-size: 30px;
			line-height: 0.95;
			letter-spacing: 0;
		}

		.context-usage-meta-main em {
			color: rgba(225, 232, 247, 0.62);
			font-style: normal;
		}

		.context-usage-meta-grid {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 6px;
		}

		.context-usage-meta-item {
			display: grid;
			gap: 4px;
			min-width: 0;
			padding: 7px 8px;
			border-radius: 4px;
			background: #172238;
		}

		.context-usage-meta-item span {
			color: rgba(225, 232, 247, 0.5);
			font-size: 10px;
		}

		.context-usage-meta-item strong {
			overflow: hidden;
			color: rgba(247, 249, 255, 0.9);
			font-family: var(--font-mono);
			font-size: 11px;
			font-weight: 700;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.context-usage-meta-model {
			display: flex;
			flex-wrap: wrap;
			gap: 5px;
		}

		.context-usage-meta-model span {
			max-width: 100%;
			overflow: hidden;
			padding: 3px 6px;
			border-radius: 4px;
			background: #172238;
			color: rgba(225, 232, 247, 0.58);
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.context-usage-shell[data-status="caution"] .context-usage-meta-status {
			background: rgba(255, 214, 125, 0.12);
			color: rgba(255, 214, 125, 0.96);
		}

		.context-usage-shell[data-status="warning"] .context-usage-meta-status {
			background: rgba(255, 156, 92, 0.12);
			color: rgba(255, 176, 112, 0.98);
		}

		.context-usage-shell[data-status="danger"] .context-usage-meta-status {
			background: rgba(255, 113, 136, 0.14);
			color: rgba(255, 144, 164, 1);
		}

		.context-usage-shell:hover .context-usage-meta,
		.context-usage-shell:focus-visible .context-usage-meta,
		.context-usage-shell[data-expanded="true"] .context-usage-meta {
			opacity: 1;
			transform: translateY(0);
		}

		.context-usage-shell[data-status="caution"] .context-usage-progress {
			background:
				repeating-linear-gradient(
					90deg,
					rgba(255, 214, 125, 0.96) 0 5px,
					transparent 5px 7px
				);
		}

		.context-usage-shell[data-status="warning"] .context-usage-progress {
			background:
				repeating-linear-gradient(
					90deg,
					rgba(255, 156, 92, 0.98) 0 5px,
					transparent 5px 7px
				);
		}

		.context-usage-shell[data-status="danger"] .context-usage-progress {
			background:
				repeating-linear-gradient(
					90deg,
					rgba(255, 113, 136, 1) 0 5px,
					transparent 5px 7px
				);
		}

		.context-usage-dialog[hidden] {
			display: none !important;
		}

		.context-usage-dialog {
			position: fixed;
			inset: 0;
			z-index: 70;
			display: none;
			align-items: flex-start;
			justify-content: center;
			padding: 70px 18px 18px;
			background: rgba(1, 3, 10, 0.72);
			backdrop-filter: none;
		}

		.context-usage-dialog.open {
			display: flex;
		}

		.context-usage-dialog-panel {
			width: min(430px, 100%);
			padding: 10px;
			border: 0;
			border-radius: 8px;
			background:
				linear-gradient(180deg, #121522 0%, #070914 38%, #04050d 100%),
				#060711;
			box-shadow: none;
		}

		.context-usage-dialog-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			margin: 0;
			padding: 6px 6px 10px 8px;
			border-radius: 0;
			background: transparent;
		}

		.context-usage-dialog-head strong {
			color: rgba(219, 226, 246, 0.66);
			font-size: 10px;
			letter-spacing: 0.18em;
			text-transform: uppercase;
		}

		.context-usage-dialog-close {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 34px;
			height: 34px;
			padding: 0;
			border: 0;
			border-radius: 6px;
			background: #171a28;
			box-shadow: none;
			color: rgba(238, 244, 255, 0.72);
			font-size: 18px;
			line-height: 1;
		}

		.context-usage-dialog-close:hover:not(:disabled),
		.context-usage-dialog-close:focus-visible {
			background: #202438;
			color: #f7f9ff;
			box-shadow: none;
			transform: none;
		}

		.context-usage-dialog-body {
			display: grid;
			gap: 10px;
			padding: 0;
			border: 0;
			border-radius: 0;
			background: transparent;
			color: rgba(225, 232, 247, 0.78);
			font-size: 12px;
			line-height: 1.55;
			white-space: normal;
		}

		.context-usage-dialog-hero {
			display: grid;
			gap: 10px;
			padding: 14px;
			border-radius: 8px;
			background:
				linear-gradient(180deg, #151a2b 0%, #0d1220 100%),
				#101421;
			box-shadow: none;
		}

		.context-usage-dialog-kicker {
			color: rgba(222, 230, 255, 0.46);
			font-size: 10px;
			font-weight: 700;
			letter-spacing: 0.16em;
			text-transform: uppercase;
		}

		.context-usage-dialog-main {
			display: flex;
			align-items: flex-end;
			justify-content: space-between;
			gap: 12px;
		}

		.context-usage-dialog-main strong {
			color: #f6f8ff;
			font-family: var(--font-mono);
			font-size: 44px;
			font-weight: 700;
			line-height: 0.9;
			letter-spacing: 0;
		}

		.context-usage-dialog-main span {
			margin-bottom: 2px;
			padding: 6px 8px;
			border-radius: 6px;
			background: rgba(141, 255, 178, 0.1);
			color: rgba(173, 255, 201, 0.92);
			font-size: 11px;
			font-weight: 700;
			letter-spacing: 0.04em;
		}

		.context-usage-dialog[data-status="caution"] .context-usage-dialog-main span {
			background: rgba(255, 209, 102, 0.12);
			color: rgba(255, 222, 145, 0.96);
		}

		.context-usage-dialog[data-status="warning"] .context-usage-dialog-main span {
			background: rgba(255, 156, 92, 0.13);
			color: rgba(255, 190, 147, 0.96);
		}

		.context-usage-dialog[data-status="danger"] .context-usage-dialog-main span {
			background: rgba(255, 113, 136, 0.14);
			color: rgba(255, 190, 202, 0.96);
		}

		.context-usage-dialog-meter {
			position: relative;
			height: 8px;
			overflow: hidden;
			border-radius: 999px;
			background: #050710;
		}

		.context-usage-dialog-meter span {
			display: block;
			height: 100%;
			max-width: 100%;
			border-radius: inherit;
			background: linear-gradient(90deg, #8dffb2, #c9d2ff);
			box-shadow: none;
		}

		.context-usage-dialog[data-status="caution"] .context-usage-dialog-meter span {
			background: linear-gradient(90deg, #ffd166, #fff0b8);
			box-shadow: none;
		}

		.context-usage-dialog[data-status="warning"] .context-usage-dialog-meter span {
			background: linear-gradient(90deg, #ff9c5c, #ffd166);
			box-shadow: none;
		}

		.context-usage-dialog[data-status="danger"] .context-usage-dialog-meter span {
			background: linear-gradient(90deg, #ff7188, #ffb1bf);
			box-shadow: none;
		}

		.context-usage-dialog-hero p {
			margin: 0;
			color: rgba(222, 230, 255, 0.58);
			font-family: var(--font-mono);
			font-size: 11px;
			letter-spacing: 0;
		}

		.context-usage-dialog-metrics {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 8px;
		}

		.context-usage-dialog-metric {
			display: grid;
			gap: 5px;
			min-width: 0;
			padding: 10px;
			border-radius: 8px;
			background: #0b0e19;
			box-shadow: none;
		}

		.context-usage-dialog-metric span {
			color: rgba(222, 230, 255, 0.44);
			font-size: 10px;
			letter-spacing: 0.1em;
			text-transform: uppercase;
		}

		.context-usage-dialog-metric strong {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			color: rgba(246, 249, 255, 0.94);
			font-family: var(--font-mono);
			font-size: 17px;
			letter-spacing: 0;
		}

		.context-usage-dialog-metric em {
			color: rgba(222, 230, 255, 0.42);
			font-size: 10px;
			font-style: normal;
		}

		.context-usage-dialog-model {
			display: flex;
			flex-wrap: wrap;
			gap: 6px;
			padding: 8px;
			border-radius: 8px;
			background: #080a13;
		}

		.context-usage-dialog-model span {
			min-width: 0;
			max-width: 100%;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			padding: 6px 8px;
			border-radius: 6px;
			background: #121522;
			color: rgba(222, 230, 255, 0.64);
			font-size: 10px;
			line-height: 1.2;
		}
	`;
}
