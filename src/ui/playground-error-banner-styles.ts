export function getPlaygroundErrorBannerStyles(): string {
	return `
		.error-banner {
			display: none;
			position: absolute;
			top: 0;
			left: 50%;
			transform: translateX(-50%);
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: start;
			gap: 12px;
			width: min(var(--conversation-width), calc(100% - 40px));
			padding: 12px 18px;
			border: 0;
			border-radius: 4px;
			background: #2f1119;
			color: #ffdbe2;
			font-size: 12px;
			line-height: 1.6;
			flex-shrink: 0;
			z-index: 6;
			box-shadow: none;
			pointer-events: auto;
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
			border: 0;
			border-radius: 4px;
			background: #421823;
			box-shadow: none;
			color: #ffe8ed;
			font-size: 16px;
			line-height: 1;
			cursor: pointer;
		}

		.error-banner-close:hover:not(:disabled),
		.error-banner-close:focus-visible {
			background: #5a2230;
			color: #ffffff;
			box-shadow: none;
			transform: none;
		}
	`;
}
