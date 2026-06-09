export function getPlaygroundMessageContextStyles(): string {
	return `
		.message-context-menu {
			position: fixed;
			z-index: 40;
			display: grid;
			gap: 4px;
			min-width: 128px;
			padding: 5px;
			border: 1px solid rgba(201, 210, 255, 0.14);
			border-radius: 4px;
			background: rgba(9, 12, 22, 0.96);
			box-shadow: none;
		}

		.message-context-menu button {
			width: 100%;
			min-height: 34px;
			padding: 0 10px;
			border: 0;
			border-radius: 4px;
			background: transparent;
			color: rgba(242, 246, 255, 0.92);
			font-size: 12px;
			font-weight: 700;
			text-align: left;
			text-transform: none;
			letter-spacing: 0;
			box-shadow: none;
		}

		.message-context-menu button:hover,
		.message-context-menu button:focus-visible {
			background: rgba(201, 210, 255, 0.1);
			color: #ffffff;
			transform: none;
		}

		.message-context-toast {
			position: fixed;
			left: 50%;
			bottom: calc(88px + env(safe-area-inset-bottom));
			z-index: 41;
			transform: translateX(-50%);
			padding: 8px 12px;
			border-radius: 4px;
			background: rgba(10, 14, 24, 0.92);
			color: #f3fbff;
			font-size: 12px;
			font-weight: 800;
			box-shadow: none;
			pointer-events: none;
		}
	`;
}
