export function getPlaygroundNotificationStyles(): string {
	return `
		.notification-live-region {
			position: fixed;
			top: 18px;
			right: 18px;
			z-index: 90;
			display: grid;
			justify-items: end;
			gap: 10px;
			width: min(360px, calc(100vw - 28px));
			pointer-events: none;
		}

		.notification-live-region[hidden] {
			display: none !important;
		}

		.notification-toast-stack {
			display: grid;
			justify-items: stretch;
			gap: 10px;
			width: 100%;
		}

		.notification-toast {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: start;
			gap: 12px;
			width: 100%;
			padding: 12px 14px;
			border: 1px solid rgba(141, 255, 178, 0.18);
			border-radius: 4px;
			background:
				linear-gradient(180deg, rgba(8, 14, 24, 0.96), rgba(6, 10, 18, 0.96)),
				rgba(6, 10, 18, 0.96);
			box-shadow: none;
			backdrop-filter: none;
			pointer-events: auto;
		}

		.notification-toast-copy {
			display: grid;
			gap: 5px;
			min-width: 0;
		}

		.notification-toast-title {
			color: rgba(243, 248, 255, 0.96);
			font-size: 12px;
			font-weight: 600;
			line-height: 1.45;
			word-break: break-word;
		}

		.notification-toast-meta {
			color: rgba(214, 221, 255, 0.62);
			font-size: 10px;
			line-height: 1.5;
			letter-spacing: 0.06em;
			text-transform: uppercase;
		}

		.notification-toast-dismiss {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 24px;
			height: 24px;
			padding: 0;
			border: 0;
			border-radius: 4px;
			background: transparent;
			box-shadow: none;
			color: rgba(228, 235, 255, 0.68);
			font-size: 15px;
			line-height: 1;
			cursor: pointer;
		}

		.notification-toast-dismiss:hover:not(:disabled),
		.notification-toast-dismiss:focus-visible {
			background: rgba(255, 255, 255, 0.08);
			color: #f5f8ff;
			box-shadow: none;
			transform: none;
		}
	`;
}
