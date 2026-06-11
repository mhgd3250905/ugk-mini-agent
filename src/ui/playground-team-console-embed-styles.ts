export function getPlaygroundTeamConsoleEmbedStyles(): string {
	return `
		.shell[data-team-console-embed="mini"] {
			display: grid !important;
			grid-template-columns: minmax(0, 1fr) !important;
			grid-template-rows: 34px minmax(0, 1fr) !important;
			gap: 8px !important;
			align-items: stretch !important;
			justify-content: stretch !important;
			width: 100% !important;
			height: 100vh !important;
			min-height: 0 !important;
			margin: 0 !important;
			padding: 8px !important;
			background: transparent !important;
			overflow: hidden !important;
			--conversation-width: 100%;
			--command-deck-offset: 74px;
		}

		.shell[data-team-console-embed="mini"]::before,
		.shell[data-team-console-embed="mini"]::after,
		.shell[data-team-console-embed="mini"] .chat-stage-watermark,
		.shell[data-team-console-embed="mini"] .landing-screen,
		.shell[data-team-console-embed="mini"] > .desktop-conversation-rail,
		.shell[data-team-console-embed="mini"] .desktop-conversation-rail-head,
		.shell[data-team-console-embed="mini"] .desktop-conversation-list,
		.shell[data-team-console-embed="mini"] .desktop-rail-settings-trigger,
		.shell[data-team-console-embed="mini"] .desktop-rail-settings-menu,
		.shell[data-team-console-embed="mini"] #open-asset-library-button,
		.shell[data-team-console-embed="mini"] #open-conn-manager-button,
		.shell[data-team-console-embed="mini"] #open-task-inbox-button,
		.shell[data-team-console-embed="mini"] .theme-mode-toggle,
		.shell[data-team-console-embed="mini"] .landing-side-right > a.telemetry-action,
		.shell[data-team-console-embed="mini"] .topbar-agent-label,
		.shell[data-team-console-embed="mini"] .mobile-topbar,
		.shell[data-team-console-embed="mini"] .topbar-right,
		.shell[data-team-console-embed="mini"] .pane-head,
		.shell[data-team-console-embed="mini"] .context-usage-row {
			display: none !important;
		}

		.shell[data-team-console-embed="mini"] > .topbar {
			position: relative !important;
			grid-column: 1 !important;
			grid-row: 1 !important;
			z-index: 8;
			display: flex !important;
			align-items: center !important;
			justify-content: stretch !important;
			width: 100% !important;
			min-height: 0 !important;
			margin: 0 !important;
			padding: 0 !important;
			border: 0 !important;
			background: transparent !important;
			box-shadow: none !important;
		}

		.shell[data-team-console-embed="mini"] .landing-side-right {
			position: static !important;
			display: flex !important;
			align-items: center !important;
			justify-content: space-between !important;
			gap: 6px !important;
			width: 100% !important;
			max-width: 100% !important;
			min-width: 0 !important;
			margin: 0 !important;
			padding: 0 !important;
			border: 0 !important;
			background: transparent !important;
			box-shadow: none !important;
		}

		.shell[data-team-console-embed="mini"] #new-conversation-button {
			display: inline-flex !important;
			align-items: center;
			justify-content: center;
			min-width: 74px;
			min-height: 28px;
			padding: 0 12px;
			border: 1px solid rgba(201, 210, 255, 0.13);
			border-radius: 4px;
			background: rgba(15, 21, 34, 0.92);
			color: rgba(226, 234, 255, 0.78);
			box-shadow: none;
			order: 1;
		}

		.shell[data-team-console-embed="mini"] #new-conversation-button strong {
			font-size: 11px;
			font-weight: 650;
			line-height: 1;
		}

		.shell[data-team-console-embed="mini"] #new-conversation-button[data-tooltip-title]::after {
			left: 0;
			min-width: min(220px, calc(100vw - 16px));
			max-width: min(260px, calc(100vw - 16px));
			transform: translateY(-4px);
		}

		.shell[data-team-console-embed="mini"] #new-conversation-button[data-tooltip-title]:hover::after,
		.shell[data-team-console-embed="mini"] #new-conversation-button[data-tooltip-title]:focus-visible::after {
			transform: translateY(0);
		}

		.shell[data-team-console-embed="mini"] .topbar-context-slot {
			position: static !important;
			inset: auto !important;
			z-index: 9;
			display: flex !important;
			align-items: center !important;
			justify-content: flex-end !important;
			min-width: 0 !important;
			margin: 0 !important;
			background: transparent !important;
			box-shadow: none !important;
			transform: none !important;
			order: 2;
		}

		.shell[data-team-console-embed="mini"] > .chat-stage {
			grid-column: 1 / -1 !important;
			grid-row: 2 !important;
			display: grid !important;
			grid-template-rows: minmax(0, 1fr) auto;
			width: 100% !important;
			height: 100% !important;
			min-height: 0 !important;
			margin: 0 !important;
			padding: 0 !important;
			border: 0 !important;
			background: transparent !important;
			overflow: hidden !important;
		}

		.shell[data-team-console-embed="mini"] .stream-layout,
		.shell[data-team-console-embed="mini"][data-stage-mode="landing"] .stream-layout,
		.shell[data-team-console-embed="mini"][data-home="true"] .stream-layout {
			position: absolute !important;
			inset: 0 0 var(--command-deck-offset, 74px) 0 !important;
			z-index: 3;
			display: flex !important;
			align-items: stretch !important;
			justify-content: stretch !important;
			min-height: 0 !important;
			overflow: hidden !important;
			pointer-events: auto !important;
		}

		.shell[data-team-console-embed="mini"] .transcript-pane,
		.shell[data-team-console-embed="mini"][data-stage-mode="landing"] .transcript-pane {
			width: 100% !important;
			height: 100% !important;
			max-height: 100% !important;
			margin: 0 !important;
		}

		.shell[data-team-console-embed="mini"] .transcript,
		.shell[data-team-console-embed="mini"][data-stage-mode="landing"] .transcript {
			height: 100%;
			padding: 0 0 10px;
			scrollbar-width: thin;
			scrollbar-color: rgba(201, 210, 255, 0.22) transparent;
		}

		.shell[data-team-console-embed="mini"] .command-deck,
		.shell[data-team-console-embed="mini"][data-stage-mode="landing"] .command-deck,
		.shell[data-team-console-embed="mini"][data-home="true"] .command-deck {
			position: absolute !important;
			left: 0 !important;
			right: 0 !important;
			bottom: 0 !important;
			z-index: 5;
			display: grid !important;
			width: 100% !important;
			margin: 0 !important;
			border-radius: 4px !important;
			overflow: hidden !important;
		}

		.shell[data-team-console-embed="mini"] .composer,
		.shell[data-team-console-embed="mini"][data-stage-mode="landing"] .composer {
			min-height: 58px;
			padding: 8px 10px;
			border-color: rgba(201, 210, 255, 0.1);
			background: rgba(9, 13, 23, 0.96);
		}
	`;
}
