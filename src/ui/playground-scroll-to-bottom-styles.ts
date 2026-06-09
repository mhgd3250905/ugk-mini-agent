export function getPlaygroundScrollToBottomStyles(): string {
	return `
		.scroll-to-bottom-button {
			display: none;
			position: absolute;
			right: 14px;
			bottom: 20px;
			z-index: 5;
			align-items: center;
			justify-content: center;
			min-height: 34px;
			padding: 8px 12px;
			border: 0;
			border-radius: 4px;
			background: #182336;
			color: rgba(238, 244, 255, 0.92);
			font-size: 11px;
			line-height: 1;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			box-shadow: none;
			backdrop-filter: none;
		}

		.scroll-to-bottom-button.visible {
			display: inline-flex;
		}

		.scroll-to-bottom-button:hover:not(:disabled),
		.scroll-to-bottom-button:focus-visible {
			border-color: transparent;
			background: #20324a;
			color: #f3fbff;
			transform: none;
			box-shadow: none;
		}
	`;
}
