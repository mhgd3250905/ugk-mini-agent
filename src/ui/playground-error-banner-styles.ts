export function getPlaygroundErrorBannerStyles(): string {
	return `
		.error-banner {
			display: none;
			position: fixed;
			top: auto;
			bottom: calc(var(--command-deck-toast-offset, var(--command-deck-offset, 96px)) + 12px);
			left: var(--command-deck-center-x, 50%);
			transform: translateX(-50%);
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
			gap: 10px;
			width: fit-content;
			min-width: 220px;
			max-width: min(560px, calc(100vw - 32px));
			max-height: min(160px, calc(100vh - 32px));
			overflow: auto;
			padding: 10px 12px 10px 14px;
			border: 1px solid rgba(255, 113, 136, 0.28);
			border-radius: 10px;
			background: rgba(47, 17, 25, 0.96);
			color: #ffdbe2;
			font-size: 12px;
			line-height: 1.45;
			flex-shrink: 0;
			z-index: 1000;
			box-shadow: 0 14px 38px rgba(0, 0, 0, 0.34);
			pointer-events: auto;
			backdrop-filter: blur(14px);
		}

		.error-banner.visible {
			display: grid;
		}

		.error-banner[hidden] {
			display: none !important;
		}

		.error-banner-message {
			min-width: 0;
			word-break: break-word;
		}

		.error-banner-close {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 24px;
			height: 24px;
			padding: 0;
			border: 1px solid rgba(255, 232, 237, 0.14);
			border-radius: 8px;
			background: rgba(90, 34, 48, 0.62);
			box-shadow: none;
			color: #ffe8ed;
			font-size: 16px;
			line-height: 1;
			cursor: pointer;
		}

		.error-banner-close:hover:not(:disabled),
		.error-banner-close:focus-visible {
			background: rgba(111, 43, 59, 0.82);
			color: #ffffff;
			box-shadow: none;
			transform: none;
		}
	`;
}
