export function getPlaygroundConfirmDialogStyles(): string {
	return `
		.confirm-dialog[hidden] {
			display: none !important;
		}

		.confirm-dialog {
			position: fixed;
			inset: 0;
			z-index: 88;
			display: none;
			align-items: center;
			justify-content: center;
			padding: 18px;
			background: rgba(1, 3, 10, 0.74);
		}

		.confirm-dialog.open {
			display: flex;
		}

		.confirm-dialog-panel {
			width: min(520px, 100%);
			display: grid;
			gap: 12px;
			padding: 18px;
			border: 0;
			border-radius: 8px;
			background: #0f1624;
			box-shadow: none;
		}

		.confirm-dialog-head strong {
			display: block;
			color: #f5f7fb;
			font-size: 17px;
			font-weight: 780;
			letter-spacing: 0;
			line-height: 1.35;
			text-transform: none;
		}

		.confirm-dialog-body {
			padding: 14px 16px;
			border-radius: 6px;
			background: #151d2e;
			color: rgba(226, 234, 248, 0.82);
			font-size: 14px;
			line-height: 1.75;
			white-space: pre-line;
		}

		.confirm-dialog-actions {
			display: flex;
			justify-content: flex-end;
			gap: 10px;
		}

		.confirm-dialog-actions button {
			min-width: 92px;
			min-height: 40px;
			border: 0;
			background: #1b2638;
			color: rgba(238, 244, 255, 0.86);
			font-weight: 760;
			letter-spacing: 0;
			text-transform: none;
			box-shadow: none;
		}

		.confirm-dialog-actions button:hover:not(:disabled),
		.confirm-dialog-actions button:focus-visible {
			border: 0;
			outline: 0;
			background: #25344b;
			color: #f6f9ff;
			transform: none;
			box-shadow: none;
		}

		.confirm-dialog-actions .danger-action {
			background: #8d2437;
			color: #fff5f7;
		}

		.confirm-dialog-actions .danger-action:hover:not(:disabled),
		.confirm-dialog-actions .danger-action:focus-visible {
			background: #a92f47;
			color: #ffffff;
		}
	`;
}
