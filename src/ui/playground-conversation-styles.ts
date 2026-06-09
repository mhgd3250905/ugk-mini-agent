export function getPlaygroundConversationStyles(): string {
	return `
		.mobile-drawer-backdrop {
			position: fixed;
			inset: 0;
			z-index: 30;
			background: transparent;
			backdrop-filter: none;
		}

		.mobile-drawer-backdrop[hidden],
		.mobile-conversation-drawer[hidden] {
			display: none !important;
		}

		.mobile-conversation-drawer {
			position: fixed;
			top: 0;
			left: 0;
			z-index: 31;
			display: grid;
			grid-template-rows: auto minmax(0, 1fr);
			width: min(82vw, 320px);
			height: 100dvh;
			padding: calc(18px + env(safe-area-inset-top)) 14px calc(16px + env(safe-area-inset-bottom));
			border-right: 1px solid rgba(201, 210, 255, 0.14);
			background:
				radial-gradient(circle at 22% 12%, rgba(116, 179, 255, 0.16), transparent 34%),
				linear-gradient(180deg, rgba(11, 15, 27, 0.98), rgba(5, 7, 13, 0.99));
			box-shadow: none;
		}

		.mobile-drawer-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			padding-bottom: 14px;
		}

		.mobile-drawer-title {
			display: grid;
			gap: 3px;
		}

		.mobile-drawer-title strong {
			color: #f5f8ff;
			font-size: 15px;
			letter-spacing: 0.04em;
		}

		.mobile-drawer-title span {
			color: rgba(222, 230, 255, 0.58);
			font-size: 11px;
		}

		.mobile-drawer-close {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 34px;
			height: 34px;
			padding: 0;
		}

		.mobile-conversation-list {
			display: grid;
			align-content: start;
			gap: 8px;
			min-height: 0;
			overflow-y: auto;
			overflow-x: hidden;
			padding-right: 0;
			scrollbar-width: none;
			-ms-overflow-style: none;
		}

		.mobile-conversation-list::-webkit-scrollbar {
			width: 0;
			height: 0;
			display: none;
		}

		.mobile-conversation-empty {
			padding: 14px;
			border: 1px dashed rgba(201, 210, 255, 0.16);
			border-radius: 14px;
			color: rgba(226, 234, 255, 0.58);
			font-size: 12px;
			line-height: 1.6;
		}

		.mobile-conversation-item {
			position: relative;
			display: grid;
			gap: 5px;
			width: 100%;
			height: 72px;
			padding: 11px 46px 11px 12px;
			border: 0;
			border-radius: 4px;
			background: var(--conversation-card-bg, #101827);
			box-shadow: none;
			text-align: left;
			align-content: center;
		}

		.conversation-item-shell {
			position: relative;
			display: block;
		}

		.conversation-virtual-spacer-top,
		.conversation-virtual-spacer-bottom {
			width: 100%;
		}

		.conversation-item-shell .mobile-conversation-item {
			min-width: 0;
		}

		.conversation-item-shell.conversation-bg-sky {
			--conversation-card-bg: #dbeafe;
			--conversation-card-hover-bg: #cfe1fb;
			--conversation-card-active-bg: #bfd6f8;
			--conversation-card-border: rgba(37, 99, 235, 0.18);
		}

		.conversation-item-shell.conversation-bg-mint {
			--conversation-card-bg: #dff7ea;
			--conversation-card-hover-bg: #d2f0df;
			--conversation-card-active-bg: #c4e8d3;
			--conversation-card-border: rgba(22, 163, 74, 0.18);
		}

		.conversation-item-shell.conversation-bg-peach {
			--conversation-card-bg: #ffe4cf;
			--conversation-card-hover-bg: #ffd9bd;
			--conversation-card-active-bg: #facaa8;
			--conversation-card-border: rgba(234, 88, 12, 0.18);
		}

		.conversation-item-shell.conversation-bg-pink {
			--conversation-card-bg: #fce0ea;
			--conversation-card-hover-bg: #f8d4e2;
			--conversation-card-active-bg: #f3c4d5;
			--conversation-card-border: rgba(219, 39, 119, 0.16);
		}

		.conversation-item-shell.conversation-bg-gray {
			--conversation-card-bg: #e8edf4;
			--conversation-card-hover-bg: #dfe6f0;
			--conversation-card-active-bg: #d4dde9;
			--conversation-card-border: rgba(71, 85, 105, 0.14);
		}

		.conversation-item-shell[class*="conversation-bg-"] .mobile-conversation-title {
			color: #172033;
		}

		.conversation-item-shell[class*="conversation-bg-"] .mobile-conversation-meta span {
			border-color: transparent;
			background: transparent;
			color: rgba(23, 32, 51, 0.58);
		}

		.conversation-item-shell[class*="conversation-bg-"] .conversation-item-menu-trigger {
			color: rgba(23, 32, 51, 0.68);
		}

		.conversation-item-shell[class*="conversation-bg-"] .conversation-item-menu-trigger:hover,
		.conversation-item-shell[class*="conversation-bg-"] .conversation-item-menu-trigger:focus-visible,
		.conversation-item-shell[class*="conversation-bg-"] .conversation-item-menu-trigger[aria-expanded="true"] {
			color: #111827;
		}

		.conversation-item-shell.is-pinned .mobile-conversation-item::after {
			content: "";
			position: absolute;
			left: 0;
			top: 10px;
			bottom: 10px;
			width: 4px;
			border-radius: 999px;
			background: #ff304f;
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
			display: inline-flex;
			align-items: center;
			justify-content: center;
			border: 0;
			border-radius: 0;
			background: transparent;
			color: rgba(226, 234, 255, 0.72);
			font-size: 18px;
			line-height: 1;
			box-shadow: none;
		}

		.conversation-item-menu-trigger:hover,
		.conversation-item-menu-trigger:focus-visible,
		.conversation-item-menu-trigger[aria-expanded="true"] {
			border-color: transparent;
			background: transparent !important;
			color: rgba(247, 249, 255, 0.96);
			transform: none;
		}

		.conversation-item-menu {
			position: absolute;
			top: 42px;
			right: 6px;
			z-index: 120;
			display: grid;
			gap: 4px;
			width: 168px;
			padding: 7px;
			border: 1px solid rgba(143, 214, 255, 0.16);
			border-radius: 8px;
			background: #111827;
			box-shadow: none;
		}

		.conversation-menu-item {
			display: grid;
			grid-template-columns: 22px minmax(0, 1fr);
			align-items: center;
			gap: 8px;
			min-height: 34px;
			width: 100%;
			padding: 0 8px;
			border: 0;
			border-radius: 6px;
			background: transparent;
			color: rgba(247, 249, 255, 0.86);
			font-size: 13px;
			text-align: left;
		}

		.conversation-menu-item:hover:not(:disabled),
		.conversation-menu-item:focus-visible {
			background: #172238;
			transform: none;
		}

		.conversation-menu-item.danger {
			color: #ff667d;
		}

		.conversation-menu-icon {
			color: currentColor;
			font-size: 15px;
			text-align: center;
		}

		.conversation-menu-color-group {
			display: grid;
			gap: 8px;
			padding: 8px;
			border-radius: 6px;
			background: #172238;
		}

		.conversation-menu-color-group > span {
			color: rgba(226, 234, 255, 0.58);
			font-size: 11px;
		}

		.conversation-menu-colors {
			display: flex;
			align-items: center;
			gap: 7px;
			flex-wrap: wrap;
		}

		.conversation-color-swatch {
			width: 20px;
			min-width: 20px;
			height: 20px;
			padding: 0;
			border: 2px solid transparent;
			border-radius: 999px;
			background: #111722;
			box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
		}

		.conversation-color-swatch.is-selected {
			border-color: #f7f9ff;
		}

		.conversation-color-swatch.color-default {
			background: #111722 !important;
		}

		.conversation-color-swatch.color-sky {
			background: #dbeafe !important;
		}

		.conversation-color-swatch.color-mint {
			background: #dff7ea !important;
		}

		.conversation-color-swatch.color-peach {
			background: #ffe4cf !important;
		}

		.conversation-color-swatch.color-pink {
			background: #fce0ea !important;
		}

		.conversation-color-swatch.color-gray {
			background: #e8edf4 !important;
		}

		.mobile-conversation-item:hover:not(:disabled),
		.mobile-conversation-item:focus-visible {
			border-color: transparent;
			background: var(--conversation-card-hover-bg, #142033);
			transform: none;
		}

		.mobile-conversation-item.is-active {
			border-color: transparent;
			background: var(--conversation-card-active-bg, #14243a);
		}

		.mobile-conversation-item:disabled {
			cursor: not-allowed;
			opacity: 0.58;
		}

		.mobile-conversation-title {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			color: rgba(246, 249, 255, 0.94);
			font-size: 13px;
			font-weight: 650;
		}

		.mobile-conversation-meta {
			display: flex;
			align-items: center;
			justify-content: flex-start;
			gap: 8px;
			color: rgba(226, 234, 255, 0.42);
			font-size: 10px;
		}
`;
}
