export function getPlaygroundAssetBaseStyles(): string {
	return `
		.drop-zone {
			display: grid;
			gap: 8px;
			border: 1px dashed rgba(255, 255, 255, 0.14);
			background: rgba(255, 255, 255, 0.04);
			backdrop-filter: none;
			padding: 12px;
			transition: border-color 120ms ease, background 120ms ease;
		}

		.drop-zone-top {
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			gap: 12px;
		}

		.composer.drag-active,
		.drop-zone.drag-active {
			border-color: var(--accent);
			background: rgba(201, 210, 255, 0.08);
			box-shadow: none;
		}

		.drop-zone-label {
			display: grid;
			gap: 4px;
			color: rgba(238, 244, 255, 0.56);
			font-size: 11px;
			line-height: 1.5;
			text-transform: uppercase;
			letter-spacing: 0.08em;
		}

		.file-input {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
			border: 0;
		}

		.file-downloads,
		.asset-modal-list {
			display: grid;
			gap: 6px;
		}

		.asset-date-group-header {
			display: flex;
			grid-column: 1 / -1;
			align-items: center;
			gap: 10px;
			min-height: 30px;
			padding: 16px 2px 6px;
			margin-top: 6px;
			color: rgba(238, 244, 255, 0.72);
		}

		.asset-date-group-header::after {
			content: "";
			height: 1px;
			flex: 1 1 auto;
			background: linear-gradient(90deg, rgba(141, 255, 178, 0.28), rgba(201, 210, 255, 0.12), transparent);
		}

		.asset-date-group-header strong {
			color: rgba(247, 250, 255, 0.92);
			font-size: 12px;
			font-weight: 760;
			line-height: 1;
			letter-spacing: 0.02em;
		}

		.asset-date-group-header span {
			color: rgba(226, 234, 255, 0.46);
			font-family: var(--font-mono);
			font-size: 10px;
			line-height: 1;
		}

		.file-download,
		.asset-pill {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 12px;
			align-items: center;
			border: 0;
			border-radius: 4px;
			background: rgba(201, 210, 255, 0.045);
			padding: 10px 12px;
			font-size: 11px;
			line-height: 1.5;
			color: var(--muted);
		}

		.file-download strong,
		.asset-pill strong {
			display: block;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			color: var(--fg);
			font-size: 11px;
		}

		.asset-pill {
			min-height: 66px;
			background:
				linear-gradient(90deg, rgba(141, 255, 178, 0.055), transparent 44%),
				rgba(201, 210, 255, 0.045);
		}

		.asset-pill:hover {
			background:
				linear-gradient(90deg, rgba(141, 255, 178, 0.075), transparent 48%),
				rgba(201, 210, 255, 0.07);
		}

		.asset-pill-main {
			display: grid;
			grid-template-columns: 38px minmax(0, 1fr);
			align-items: center;
			gap: 10px;
			min-width: 0;
		}

		.asset-pill-type {
			--asset-type-border: rgba(201, 210, 255, 0.12);
			--asset-type-bg: rgba(8, 12, 20, 0.64);
			--asset-type-main: rgba(226, 231, 255, 0.82);
			--asset-type-sub: rgba(226, 234, 255, 0.38);
			display: inline-grid;
			grid-template-rows: auto auto;
			place-items: center;
			align-content: center;
			justify-content: center;
			row-gap: 2px;
			width: 34px;
			height: 34px;
			border: 1px solid var(--asset-type-border);
			border-radius: 4px;
			background: var(--asset-type-bg);
			color: var(--asset-type-main);
			font-family: var(--font-mono);
			font-size: 9px;
			font-weight: 700;
			line-height: 1;
			letter-spacing: 0.04em;
			text-transform: uppercase;
		}

		.asset-pill-type b,
		.asset-pill-type em {
			display: block;
			width: 100%;
			min-width: 0;
			overflow: hidden;
			text-align: center;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.asset-pill-type b {
			font-size: 10px;
			font-style: normal;
			font-weight: 800;
			line-height: 1.04;
		}

		.asset-pill-type em {
			color: var(--asset-type-sub);
			font-size: 6px;
			font-style: normal;
			font-weight: 700;
			letter-spacing: 0.04em;
			line-height: 1;
		}

		.asset-pill-type--archive {
			--asset-type-border: rgba(141, 255, 178, 0.24);
			--asset-type-bg: rgba(141, 255, 178, 0.09);
			--asset-type-main: rgba(220, 255, 232, 0.94);
			--asset-type-sub: rgba(141, 255, 178, 0.62);
		}

		.asset-pill-type--code {
			--asset-type-border: rgba(101, 209, 255, 0.28);
			--asset-type-bg: rgba(101, 209, 255, 0.1);
			--asset-type-main: rgba(218, 246, 255, 0.95);
			--asset-type-sub: rgba(101, 209, 255, 0.66);
		}

		.asset-pill-type--web {
			--asset-type-border: rgba(255, 202, 126, 0.28);
			--asset-type-bg: rgba(255, 202, 126, 0.1);
			--asset-type-main: rgba(255, 230, 190, 0.96);
			--asset-type-sub: rgba(255, 202, 126, 0.7);
		}

		.asset-pill-type--data {
			--asset-type-border: rgba(201, 210, 255, 0.28);
			--asset-type-bg: rgba(201, 210, 255, 0.1);
			--asset-type-main: rgba(231, 235, 255, 0.96);
			--asset-type-sub: rgba(201, 210, 255, 0.66);
		}

		.asset-pill-type--image {
			--asset-type-border: rgba(255, 156, 190, 0.28);
			--asset-type-bg: rgba(255, 156, 190, 0.1);
			--asset-type-main: rgba(255, 226, 236, 0.96);
			--asset-type-sub: rgba(255, 156, 190, 0.68);
		}

		.asset-pill-type--document {
			--asset-type-border: rgba(228, 238, 255, 0.2);
			--asset-type-bg: rgba(228, 238, 255, 0.075);
			--asset-type-main: rgba(246, 249, 255, 0.94);
			--asset-type-sub: rgba(228, 238, 255, 0.54);
		}

		.asset-pill-type--binary {
			--asset-type-border: rgba(132, 255, 221, 0.22);
			--asset-type-bg: rgba(132, 255, 221, 0.075);
			--asset-type-main: rgba(216, 255, 244, 0.92);
			--asset-type-sub: rgba(132, 255, 221, 0.58);
		}

		.asset-pill-type--text,
		.asset-pill-type--meta {
			--asset-type-border: rgba(201, 210, 255, 0.16);
			--asset-type-bg: rgba(201, 210, 255, 0.065);
			--asset-type-main: rgba(226, 231, 255, 0.86);
			--asset-type-sub: rgba(226, 234, 255, 0.46);
		}

		.asset-pill-copy {
			display: grid;
			gap: 3px;
			min-width: 0;
		}

		.asset-pill-meta {
			display: block;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.asset-pill-meta {
			color: rgba(226, 234, 255, 0.52);
			font-family: var(--font-mono);
			font-size: 10px;
		}

		:root[data-theme="dark"] .file-download,
		:root[data-theme="dark"] .asset-pill {
			border-color: transparent;
		}

		.file-list {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			align-items: flex-start;
			max-height: 118px;
			overflow-y: auto;
			overflow-x: hidden;
			padding-right: 2px;
			scrollbar-width: thin;
			scrollbar-color: rgba(201, 210, 255, 0.18) transparent;
		}

		.selected-asset-list {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			align-items: flex-start;
			max-height: 118px;
			overflow-y: auto;
			overflow-x: hidden;
			padding-right: 2px;
			scrollbar-width: thin;
			scrollbar-color: rgba(201, 210, 255, 0.18) transparent;
		}

		.file-chip {
			display: inline-grid;
			grid-template-columns: 22px minmax(0, 1fr) auto;
			align-items: center;
			gap: 10px;
			flex: 0 1 min(180px, 100%);
			min-width: min(132px, 100%);
			max-width: min(220px, 100%);
			padding: 6px 10px 6px 8px;
			border: 0;
			border-radius: 4px;
			background: rgba(255, 255, 255, 0.045);
			box-shadow: none;
		}

		.file-chip-badge {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 22px;
			height: 22px;
			flex-shrink: 0;
			border: 0;
			border-radius: 4px;
			background: transparent;
			color: rgba(238, 244, 255, 0.72);
			font-family: var(--font-mono);
			font-size: 9px;
			line-height: 1;
			letter-spacing: 0.04em;
			text-transform: uppercase;
		}

		.file-chip-label {
			min-width: 0;
			overflow: hidden;
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
			white-space: normal;
			overflow-wrap: anywhere;
			color: rgba(238, 244, 255, 0.88);
			font-size: 12px;
			line-height: 1.28;
		}

		.file-chip-remove {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 18px;
			height: 18px;
			flex-shrink: 0;
			padding: 0;
			border: 0;
			border-radius: 4px;
			background: transparent;
			box-shadow: none;
			color: rgba(238, 244, 255, 0.58);
			font-size: 14px;
			line-height: 1;
			transform: none !important;
		}

		.file-chip-remove:hover:not(:disabled) {
			background: rgba(255, 255, 255, 0.08);
			color: rgba(255, 244, 247, 0.92);
			box-shadow: none;
		}

		.file-chip.pending {
			background: rgba(255, 255, 255, 0.045);
		}

		.file-chip.asset {
			background: rgba(201, 210, 255, 0.05);
		}

		.file-chip.asset .file-chip-badge {
			background: transparent;
			color: rgba(226, 231, 255, 0.82);
		}

		.message-file-strip {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
		}

		.message-body.has-file-chips {
			display: grid;
			gap: 8px;
		}

		.message.user .message-file-strip {
			justify-content: flex-end;
		}

		.message.user .file-chip {
			border-color: transparent;
			background: rgba(0, 0, 0, 0.06);
		}

		.message.user .file-chip-badge {
			border-color: transparent;
			background: transparent;
			color: #17320f;
		}

		.message.user .file-chip-label {
			color: #17320f;
		}

		.file-download-actions {
			display: inline-flex;
			gap: 6px;
			align-items: center;
		}

		.file-download a {
			border: 0;
			background: rgba(201, 210, 255, 0.08);
			color: var(--accent);
			padding: 6px 9px;
			text-decoration: none;
			text-transform: uppercase;
			letter-spacing: 0.08em;
		}

		.selected-assets {
			display: none;
			gap: 8px;
			padding: 0;
			border: 0;
			background: transparent;
			backdrop-filter: none;
		}

		.selected-assets.visible {
			display: grid;
		}

		.asset-modal-head {
			display: flex;
			flex-direction: row;
			justify-content: space-between;
			align-items: center;
			gap: 12px;
			background: transparent;
			color: var(--muted);
			font-size: 11px;
			line-height: 1.5;
			text-transform: uppercase;
			letter-spacing: 0.08em;
		}

		.asset-modal-head.topbar,
		.task-inbox-head.topbar {
			grid-column: auto;
			width: 100%;
			margin: 0;
		}

		.asset-modal-actions {
			display: flex;
			align-items: center;
			gap: 8px;
			flex-wrap: nowrap;
			min-width: 0;
			overflow-x: auto;
			overflow-y: hidden;
			scrollbar-width: none;
			-ms-overflow-style: none;
		}

		.asset-modal-actions::-webkit-scrollbar {
			display: none;
		}

		.asset-modal-actions button,
		.asset-pill button,
		.asset-pill-download-button {
			flex: 0 0 auto;
			white-space: nowrap;
			padding: 6px 10px;
			font-size: 10px;
		}

		.asset-pill {
			grid-template-columns: minmax(0, 1fr) auto;
		}

		.asset-pill-actions {
			display: inline-flex;
			align-items: center;
			justify-content: flex-end;
			gap: 6px;
		}

		.asset-pill-download-button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-height: 29px;
			border: 0;
			border-radius: 4px;
			background: rgba(141, 255, 178, 0.08);
			color: rgba(209, 255, 224, 0.9);
			font-weight: 650;
			line-height: 1;
			text-decoration: none;
			transform: none !important;
		}

		.asset-pill-download-button:hover,
		.asset-pill-download-button:focus-visible {
			background: rgba(141, 255, 178, 0.14);
			color: rgba(237, 255, 244, 0.98);
		}

		.asset-pill-delete-button {
			color: rgba(255, 198, 206, 0.84);
		}

		.asset-pill.active {
			border-color: rgba(201, 210, 255, 0.18);
			background:
				linear-gradient(90deg, rgba(141, 255, 178, 0.11), transparent 48%),
				rgba(255, 255, 255, 0.08);
			box-shadow: none;
		}

	`;
}

export function getPlaygroundAssetModalStyles(): string {
	return `
		.asset-pill-copy span {
			display: block;
		}

		.asset-empty {
			padding: 10px;
			border: 1px solid rgba(255, 255, 255, 0.08);
			background: rgba(255, 255, 255, 0.04);
			color: rgba(238, 244, 255, 0.56);
			font-size: 11px;
			line-height: 1.6;
		}

		.asset-modal-shell {
			position: fixed;
			inset: 0;
			z-index: 60;
			display: none;
			align-items: center;
			justify-content: center;
			padding: 24px;
			background: rgba(4, 8, 14, 0.54);
			backdrop-filter: none;
		}

		.asset-modal-shell.open {
			display: flex;
		}

		.asset-modal {
			width: min(760px, 100%);
			max-height: min(72vh, 720px);
			display: grid;
			grid-template-rows: auto minmax(0, 1fr);
			border: 1px solid rgba(255, 255, 255, 0.08);
			background:
				linear-gradient(180deg, rgba(19, 26, 38, 0.86), rgba(13, 18, 28, 0.88));
			box-shadow: none;
			backdrop-filter: none;
		}

		.asset-modal-copy {
			display: grid;
			gap: 4px;
		}

		.asset-modal-copy strong {
			display: block;
			color: var(--fg);
			font-size: 13px;
			letter-spacing: 0.12em;
		}

		.asset-modal-copy span {
			display: block;
			color: var(--muted);
			font-size: 11px;
			line-height: 1.6;
			text-transform: none;
			letter-spacing: 0.04em;
		}

		.asset-modal-body {
			min-height: 0;
			padding: 14px;
			overflow-y: auto;
			border-top: 1px solid var(--line);
			scrollbar-width: none;
			-ms-overflow-style: none;
		}

		.asset-modal-body::-webkit-scrollbar {
			width: 0;
			height: 0;
			display: none;
		}

		.chat-stage > .workspace-contained :is(.asset-modal-head, .task-inbox-head) {
			position: relative;
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
			gap: 18px;
			min-height: 58px;
			padding: 10px 14px;
			border: 0;
			background:
				linear-gradient(90deg, rgba(13, 18, 30, 0.98), rgba(8, 11, 20, 0.94)),
				#080c14;
			color: rgba(232, 238, 255, 0.62);
			text-transform: none;
			letter-spacing: 0;
		}

		.chat-stage > .workspace-contained :is(.asset-modal-head, .task-inbox-head)::before {
			content: "";
			position: absolute;
			left: 14px;
			right: 14px;
			bottom: 0;
			height: 1px;
			background: linear-gradient(90deg, rgba(141, 255, 178, 0.32), rgba(201, 210, 255, 0.18), transparent);
			pointer-events: none;
		}

		.chat-stage > .workspace-contained :is(.asset-modal-copy, .task-inbox-head-copy) {
			display: grid;
			grid-template-columns: auto minmax(0, 1fr);
			column-gap: 10px;
			align-items: center;
			min-width: 0;
		}

		.chat-stage > .workspace-contained :is(.asset-modal-copy, .task-inbox-head-copy)::before {
			content: "";
			width: 4px;
			height: 28px;
			border-radius: 999px;
			background: linear-gradient(180deg, #8dffb2, #65d1ff 52%, #c9d2ff);
		}

		.chat-stage > .workspace-contained :is(.asset-modal-copy strong, .task-inbox-head-copy strong) {
			min-width: 0;
			overflow: hidden;
			color: rgba(247, 250, 255, 0.96);
			font-size: 14px;
			font-weight: 700;
			line-height: 1.25;
			letter-spacing: 0.02em;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.chat-stage > .workspace-contained :is(.asset-head-count, .task-inbox-head-count) {
			display: none;
		}

		.chat-stage > .workspace-contained :is(.asset-modal-actions, .task-inbox-head-actions) {
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: 6px;
			min-width: 0;
			padding: 4px;
			overflow-x: auto;
			overflow-y: hidden;
			border-radius: 4px;
			background: rgba(255, 255, 255, 0.035);
			scrollbar-width: none;
		}

		.chat-stage > .workspace-contained :is(.asset-modal-actions button, .task-inbox-head-button) {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-height: 30px;
			padding: 0 10px;
			border: 0;
			border-radius: 4px;
			background: transparent;
			color: rgba(235, 242, 255, 0.64);
			font-size: 10.5px;
			font-weight: 650;
			line-height: 1;
			letter-spacing: 0.02em;
			text-transform: none;
			white-space: nowrap;
		}

		.chat-stage > .workspace-contained :is(.asset-modal-actions button, .task-inbox-head-button):hover:not(:disabled),
		.chat-stage > .workspace-contained :is(.asset-modal-actions button, .task-inbox-head-button):focus-visible {
			background: rgba(201, 210, 255, 0.11);
			color: rgba(248, 251, 255, 0.96);
			transform: none;
		}

		.chat-stage > .workspace-contained .mobile-work-back-button {
			display: none;
		}

		:root[data-theme="light"] .chat-stage > .workspace-contained :is(.asset-modal-head, .task-inbox-head) {
			background:
				linear-gradient(90deg, rgba(255, 255, 255, 0.98), rgba(244, 247, 252, 0.96)),
				#ffffff;
			color: #5d687a;
		}

		:root[data-theme="light"] .chat-stage > .workspace-contained :is(.asset-modal-copy strong, .task-inbox-head-copy strong) {
			color: #142033;
		}

		:root[data-theme="light"] .chat-stage > .workspace-contained :is(.asset-modal-actions, .task-inbox-head-actions) {
			background: #eef3f8;
		}

		:root[data-theme="light"] .chat-stage > .workspace-contained :is(.asset-modal-actions button, .task-inbox-head-button) {
			color: #536176;
		}

		:root[data-theme="light"] .chat-stage > .workspace-contained :is(.asset-modal-actions button, .task-inbox-head-button):hover:not(:disabled),
		:root[data-theme="light"] .chat-stage > .workspace-contained :is(.asset-modal-actions button, .task-inbox-head-button):focus-visible {
			background: #ffffff;
			color: #142033;
		}
	`;
}

export function getPlaygroundAssetLandingStyles(): string {
	return `
		.shell[data-stage-mode="landing"] .file-strip {
			display: grid;
			gap: 4px;
		}

		.shell[data-stage-mode="landing"] .drop-zone {
			padding: 0;
			border: 0;
			background: transparent;
			backdrop-filter: none;
		}

		.shell[data-stage-mode="landing"] .drop-zone-top {
			align-items: center;
		}

		.shell[data-stage-mode="landing"] .drop-zone-label {
			font-size: 10px;
			letter-spacing: 0.12em;
			color: rgba(214, 220, 255, 0.22);
		}

		.shell[data-stage-mode="landing"] .drop-zone-label span:last-child {
			display: none;
		}

		.shell[data-stage-mode="landing"] .composer-side {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 8px;
			align-content: center;
		}

		.shell[data-stage-mode="landing"] #send-button,
		.shell[data-stage-mode="landing"] #interrupt-button {
			min-width: 44px;
			min-height: 40px;
			padding: 0 14px;
			border: 0;
			border-radius: 4px;
			box-shadow: none;
		}

		.shell[data-stage-mode="landing"] #interrupt-button {
			order: 1;
			background: rgba(108, 68, 78, 0.88);
			color: rgba(255, 232, 236, 0.94);
		}

		.shell[data-stage-mode="landing"] #send-button {
			order: 2;
			background: rgba(67, 112, 91, 0.9);
			color: rgba(238, 255, 245, 0.96);
		}

		.shell[data-stage-mode="landing"] .selected-assets,
		.shell[data-stage-mode="landing"] .file-list {
			max-height: 126px;
			overflow: auto;
			scrollbar-width: none;
		}
	`;
}

export function getPlaygroundAssetMobileStyles(): string {
	return `
			.asset-modal-shell.open {
				align-items: stretch;
				justify-content: stretch;
				padding: 0;
				background: #01030a;
			}

			.asset-modal {
				position: relative;
				width: 100%;
				height: 100dvh;
				max-height: 100dvh;
				border: 0;
				border-radius: 0;
				background:
					radial-gradient(circle at 24% 0%, rgba(101, 209, 255, 0.1), transparent 32%),
					linear-gradient(180deg, #060711 0%, #01030a 42%, #01030a 100%);
				box-shadow: none;
				overflow: hidden;
			}

			.asset-modal::before {
				display: none;
			}

			.asset-modal-head {
				position: sticky;
				top: 0;
				z-index: 2;
				display: flex;
				flex-direction: row;
				align-items: center;
				justify-content: space-between;
				gap: 10px;
				padding: calc(10px + env(safe-area-inset-top)) 12px 10px;
				border-bottom: 0;
				background: #101421;
				box-shadow: none;
			}

			.mobile-work-topbar {
				display: grid;
				grid-template-columns: minmax(0, 1fr) auto;
				width: 100%;
				min-height: 48px;
				margin: 0;
				justify-items: stretch;
			}

			.mobile-work-title-row {
				display: grid;
				grid-template-columns: 36px minmax(0, 1fr);
				align-items: center;
				gap: 10px;
				min-width: 0;
			}

			.mobile-work-back-button {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 36px;
				height: 36px;
				min-width: 36px;
				padding: 0;
				border: 0;
				border-radius: 4px;
				background: #171a28;
				color: rgba(242, 246, 255, 0.92);
				font-size: 17px;
				line-height: 1;
				box-shadow: none;
				text-transform: none;
				letter-spacing: 0;
			}

			.mobile-work-topbar .asset-modal-actions,
			.mobile-work-topbar .task-inbox-head-actions {
				min-width: 0;
				justify-content: flex-end;
				overflow-x: auto;
				scrollbar-width: none;
				-ms-overflow-style: none;
			}

			.mobile-work-topbar .asset-modal-actions::-webkit-scrollbar,
			.mobile-work-topbar .task-inbox-head-actions::-webkit-scrollbar {
				display: none;
			}

			.mobile-work-topbar .asset-modal-actions button,
			.mobile-work-topbar .task-inbox-head-button {
				min-height: 36px;
				padding: 0 12px;
				border-radius: 4px;
				text-transform: none;
				letter-spacing: 0.02em;
			}

			.asset-modal-copy {
				gap: 5px;
			}

			.asset-modal-copy strong {
				font-size: 14px;
				letter-spacing: 0.08em;
			}

			.asset-modal-copy span {
				max-width: 28em;
				color: rgba(226, 234, 255, 0.56);
				font-size: 11px;
				line-height: 1.55;
			}

			.asset-modal-actions {
				display: flex;
				gap: 6px;
				justify-content: flex-end;
				overflow-x: auto;
			}

			.asset-modal-actions button {
				min-height: 38px;
				padding: 0 12px;
				border-radius: 4px;
				border: 0;
				background: #171a28;
				text-transform: none;
				letter-spacing: 0.02em;
			}

			.conn-editor-form .asset-modal-actions button:first-child {
				grid-column: 1 / -1;
				border-color: rgba(141, 255, 178, 0.22);
				background: rgba(141, 255, 178, 0.08);
				color: rgba(218, 255, 230, 0.94);
			}

			.asset-modal-body {
				padding: 12px 10px calc(18px + env(safe-area-inset-bottom));
				overflow-y: auto;
				overscroll-behavior: contain;
				border-top: 0;
			}

			.asset-modal-list,
			.conn-manager-list,
			.conn-manager-run-list {
				gap: 10px;
			}

			.asset-pill,
			.conn-manager-item {
				min-height: 72px;
				padding: 12px;
				border: 0;
				border-radius: 4px;
				background: #0b0e19;
				box-shadow: none;
			}

			.asset-pill {
				grid-template-columns: minmax(0, 1fr) auto;
				gap: 12px;
			}

			.asset-pill-actions {
				display: grid;
				grid-template-columns: 1fr;
				gap: 8px;
			}

			.asset-pill-main {
				display: grid;
				grid-template-columns: 34px minmax(0, 1fr);
				gap: 6px;
				min-width: 0;
			}

			.asset-pill strong {
				font-size: 13px;
			}

			.asset-pill-meta {
				color: rgba(226, 234, 255, 0.54);
				font-family: var(--font-mono);
				font-size: 10px;
				line-height: 1.55;
				overflow-wrap: anywhere;
				white-space: normal;
			}

			.asset-pill-type {
				width: 30px;
				height: 30px;
				font-size: 8px;
			}

			.asset-pill button,
			.asset-pill-download-button {
				min-height: 38px;
				border-radius: 4px;
				text-transform: none;
				letter-spacing: 0.02em;
			}

			.asset-pill.active {
				border: 0;
				background: #0b1616;
				box-shadow: none;
			}

			.conn-manager-dialog.open,
			.conn-editor-dialog.open {
				align-items: stretch;
				justify-content: stretch;
				padding: 0;
				background: #01030a;
			}

			.conn-manager-panel,
			.conn-editor-panel {
				width: 100%;
				height: 100dvh;
				max-height: 100dvh;
				border: 0;
				border-radius: 0;
				background: #01030a;
				box-shadow: none;
			}

			.conn-editor-form {
				display: grid;
				grid-template-rows: auto minmax(0, 1fr);
				height: 100%;
				min-height: 0;
			}

			.conn-manager-toolbar {
				position: sticky;
				top: 0;
				z-index: 1;
				grid-template-columns: 1fr;
				gap: 10px;
				padding: 10px;
				border: 0;
				border-radius: 4px;
				background: #0b0e19;
				box-shadow: none;
			}

			.conn-manager-filter-field {
				grid-template-columns: 1fr;
			}

			.conn-manager-filter-field select {
				min-height: 42px;
				border-radius: 4px;
			}

			.conn-manager-bulk-actions,
			.conn-manager-actions {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 8px;
				justify-content: stretch;
			}

			.conn-manager-bulk-actions {
				grid-template-columns: repeat(3, minmax(0, 1fr));
			}

			.conn-manager-actions button,
			.conn-manager-bulk-actions button,
			.conn-manager-run-actions button {
				min-height: 40px;
				border-radius: 4px;
				text-transform: none;
				letter-spacing: 0.02em;
			}

			.conn-manager-item {
				grid-template-columns: minmax(0, 1fr);
			}

			.conn-manager-title-row {
				align-items: flex-start;
				justify-content: space-between;
			}

			.conn-manager-status {
				background: rgba(255, 255, 255, 0.04);
			}

			.conn-manager-select {
				justify-content: flex-start;
				padding-top: 0;
			}

			.conn-manager-select input {
				width: 22px;
				height: 22px;
			}

			.conn-manager-actions {
				grid-column: auto;
			}

			.conn-manager-meta {
				font-size: 11px;
				line-height: 1.6;
			}

			.conn-manager-run-item {
				border: 0;
				border-radius: 4px;
				background: #080a13;
			}

			.conn-editor-body {
				gap: 14px;
				overflow-y: auto;
				padding-bottom: calc(24px + env(safe-area-inset-bottom));
			}

			.conn-editor-field {
				gap: 8px;
				padding: 12px;
				border: 0;
				border-radius: 4px;
				background: #0b0e19;
				box-shadow: none;
			}

			.conn-editor-advanced {
				padding: 12px;
				border: 0;
				border-radius: 4px;
				background: #0b0e19;
				box-shadow: none;
			}

			.conn-editor-field input,
			.conn-editor-field select,
			.conn-editor-field textarea {
				min-height: 42px;
				background: #050711;
			}

			.conn-editor-field textarea {
				min-height: 138px;
			}

			.conn-run-details-dialog.open {
				align-items: flex-end;
				padding: 0 8px;
			}

			.conn-run-details-panel {
				width: 100%;
				max-height: min(86dvh, calc(100dvh - 56px));
				border: 0;
				border-radius: 4px;
				background:
					radial-gradient(circle at 24% 0%, rgba(101, 209, 255, 0.12), transparent 34%),
					#060711;
			}

			.mobile-drawer-backdrop {
				background: rgba(1, 3, 10, 0.42);
			}

			.mobile-conversation-drawer {
				width: min(88vw, 360px);
				max-width: calc(100vw - 8px);
				padding: calc(12px + env(safe-area-inset-top)) 10px calc(12px + env(safe-area-inset-bottom));
				overflow: hidden;
				border-right: 0;
				background:
					linear-gradient(180deg, #121522 0%, #070914 34%, #04050d 100%),
					#060711;
				box-shadow: none;
			}

			.mobile-drawer-head {
				position: sticky;
				top: 0;
				z-index: 2;
				display: grid;
				grid-template-columns: minmax(0, 1fr) 40px;
				align-items: center;
				gap: 10px;
				margin-bottom: 10px;
				padding: 12px;
				border-bottom: 0;
				border-radius: 8px;
				background: transparent;
				box-shadow: none;
			}

			.mobile-drawer-title {
				min-width: 0;
				gap: 4px;
			}

			.mobile-drawer-title strong {
				font-size: 14px;
				letter-spacing: 0.02em;
			}

			.mobile-drawer-title span {
				display: block;
				max-width: 22ch;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				color: rgba(226, 234, 255, 0.48);
			}

			.mobile-drawer-close {
				width: 40px;
				height: 40px;
				border: 0;
				border-radius: 6px;
				background: #171a28;
				box-shadow: none;
			}

			.mobile-drawer-close:hover:not(:disabled),
			.mobile-drawer-close:focus-visible {
				background: #202438;
				box-shadow: none;
				transform: none;
			}

			.mobile-conversation-list {
				gap: 8px;
				padding: 0 0 2px;
			}

			.mobile-conversation-empty {
				border: 0;
				border-radius: 8px;
				background: #0b0e19;
				box-shadow: none;
			}

			.conversation-item-shell {
				display: block;
			}

			.conversation-item-menu-trigger {
				position: absolute;
				top: 8px;
				right: 8px;
				z-index: 2;
				width: 24px;
				min-width: 24px;
				height: 24px;
				padding: 0;
				appearance: none;
				border: 0;
				border-radius: 0;
				background: transparent;
				color: rgba(226, 234, 255, 0.74);
				font-size: 18px;
				box-shadow: none;
			}

			.conversation-item-menu-trigger:hover,
			.conversation-item-menu-trigger:focus-visible,
			.conversation-item-menu-trigger[aria-expanded="true"] {
				border: 0;
				background: transparent !important;
				color: rgba(247, 249, 255, 0.96);
				box-shadow: none;
				transform: none;
			}

			.mobile-conversation-item {
				position: relative;
				grid-template-rows: auto auto;
				gap: 7px;
				min-height: 72px;
				padding: 12px 46px 12px 14px;
				border: 0;
				border-radius: 8px;
				background: var(--conversation-card-bg, #0b0e19);
				align-content: center;
				line-height: normal;
				letter-spacing: 0;
				text-transform: none;
				overflow: hidden;
				opacity: 1;
				box-shadow: none;
			}

			.mobile-conversation-item > * {
				position: relative;
				z-index: 1;
				min-width: 0;
			}

			.mobile-conversation-item > .conversation-item-menu-trigger {
				position: absolute;
				top: 8px;
				right: 8px;
				z-index: 2;
			}

			.mobile-conversation-item:disabled {
				opacity: 1;
				cursor: default;
			}

			.mobile-conversation-item:hover:not(:disabled),
			.mobile-conversation-item:focus-visible {
				border: 0;
				background: var(--conversation-card-hover-bg, #111625);
				box-shadow: none;
				transform: none;
			}

			.mobile-conversation-item.is-active {
				border: 0;
				background: var(--conversation-card-active-bg, #151a2b);
				box-shadow: none;
			}

			.mobile-conversation-item.is-active::before {
				content: "";
				position: absolute;
				left: 0;
				top: 10px;
				bottom: 10px;
				width: 3px;
				border-radius: 999px;
				background: linear-gradient(180deg, #c9d2ff, #8dffb2);
				box-shadow: none;
				z-index: 0;
			}

			.mobile-conversation-title {
				color: rgba(248, 251, 255, 0.98);
				font-size: 13px;
				line-height: 1.35;
				letter-spacing: 0.01em;
			}

			.mobile-conversation-meta {
				justify-content: flex-start;
				gap: 6px;
				color: rgba(226, 234, 255, 0.5);
				font-size: 11px;
				line-height: 1.4;
				letter-spacing: 0.02em;
			}

			.mobile-conversation-meta span {
				display: inline-flex;
				align-items: center;
				min-height: 20px;
				padding: 0 7px;
				border-radius: 4px;
				background: rgba(238, 244, 255, 0.055);
			}

			.conversation-item-shell[class*="conversation-bg-"] .mobile-conversation-meta span {
				background: transparent;
			}

			.mobile-conversation-meta span:first-child {
				max-width: 150px;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.mobile-conversation-meta span:last-child {
				flex: 0 0 auto;
			}

			.drop-zone {
				display: none;
			}

			.file-list,
			.selected-asset-list {
				flex-wrap: wrap;
				max-height: 96px;
				overflow-x: hidden;
				overflow-y: auto;
				padding-bottom: 2px;
				scrollbar-width: none;
			}

			.file-list::-webkit-scrollbar,
			.selected-asset-list::-webkit-scrollbar {
				display: none;
			}

			.selected-assets.visible {
				padding: 0;
			}
	`;
}

export function getPlaygroundAssetDialogs(): string {
	return `
		<div id="asset-modal" class="asset-modal-shell" aria-hidden="true" hidden>
			<section class="asset-modal" role="dialog" aria-modal="true" aria-labelledby="asset-modal-title">
				<header class="topbar asset-modal-head">
					<div class="mobile-work-title-row asset-modal-head-left">
						<button id="close-asset-modal-button" class="mobile-work-back-button" type="button" aria-label="返回对话">
							<span aria-hidden="true">&larr;</span>
						</button>
						<div class="asset-modal-copy">
							<strong id="asset-modal-title">可复用资产</strong>
							<span id="asset-modal-count" class="asset-head-count"></span>
						</div>
					</div>
					<div class="asset-modal-actions">
						<button id="refresh-assets-button" type="button">刷新</button>
						
					</div>
				</header>
				<div class="asset-modal-body">
					<div id="asset-modal-list" class="asset-modal-list"></div>
				</div>
			</section>
		</div>
	`;
}
