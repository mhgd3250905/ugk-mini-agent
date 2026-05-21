import { TEAM_RUN_DETAIL_SCROLL_BEHAVIOR_SCRIPT } from "./team-run-detail-behavior.js";

export function renderTeamPage(): string {
	return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Team Runtime v2</title>
<style>
:root { --bg: #0a0a0a; --surface: #141414; --border: #262626; --text: #e5e5e5; --muted: #737373; --accent: #3b82f6; --accent-hover: #2563eb; --success: #22c55e; --fail: #ef4444; --warn: #f59e0b; }
[data-theme="light"] { --bg: #fafafa; --surface: #fff; --border: #e5e5e5; --text: #171717; --muted: #737373; --accent: #2563eb; --accent-hover: #1d4ed8; --success: #16a34a; --fail: #dc2626; --warn: #d97706; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; border-bottom: 1px solid var(--border); background: var(--surface); }
.topbar h1 { font-size: 16px; font-weight: 600; }
.topbar nav { display: flex; gap: 8px; }
.topbar button { padding: 6px 14px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text); cursor: pointer; font-size: 13px; }
.topbar button:hover, .topbar button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.main { max-width: 960px; margin: 0 auto; padding: 20px; }
.section { display: none; }
.section.active { display: block; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 12px; }
.card h3 { font-size: 14px; margin-bottom: 8px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
.badge-success { background: rgba(34,197,94,0.15); color: var(--success); }
.badge-fail { background: rgba(239,68,68,0.15); color: var(--fail); }
.badge-warn { background: rgba(245,158,11,0.15); color: var(--warn); }
.badge-muted { background: rgba(115,115,115,0.15); color: var(--muted); }
.btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-danger { background: var(--fail); color: #fff; }
.btn-sm { padding: 4px 10px; font-size: 12px; }
	.summary-item { text-align: center; font-size: 18px; font-weight: 600; }
.btn:disabled, .btn:disabled:hover { opacity: 0.5; cursor: not-allowed; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-weight: 500; font-size: 12px; }
.empty { text-align: center; color: var(--muted); padding: 40px 0; font-size: 14px; }
.progress-bar { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; margin-top: 4px; }
.progress-bar-fill { height: 100%; background: var(--accent); transition: width 0.3s; }
.run-detail { display: none; margin-top: 10px; border-top: 1px solid var(--border); padding-top: 10px; }
.task-table th { width: 30%; }
.task-table td { word-break: break-all; }
.detail-toggle { cursor: pointer; color: var(--accent); font-size: 12px; }
.detail-toggle:hover { text-decoration: underline; }
.refresh-btn { padding: 6px 14px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text); cursor: pointer; font-size: 13px; }
.refresh-btn:hover { background: var(--surface); }

/* Loading spinner */
@keyframes spin { to { transform: rotate(360deg); } }
.spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.6s linear infinite; vertical-align: middle; }
.loading { text-align: center; padding: 40px 0; color: var(--muted); font-size: 14px; }

/* Phase label */
.phase-label { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; margin-top: 2px; }
.phase-running { background: rgba(59,130,246,0.15); color: var(--accent); }
.phase-success { background: rgba(34,197,94,0.15); color: var(--success); }
.phase-fail { background: rgba(239,68,68,0.15); color: var(--fail); }
.phase-warn { background: rgba(245,158,11,0.15); color: var(--warn); }
.phase-muted { background: rgba(115,115,115,0.15); color: var(--muted); }

/* Timestamp */
.ts { font-size: 11px; color: var(--muted); font-family: monospace; margin-right: 8px; }

/* Plan title */
.plan-title { font-size: 14px; font-weight: 600; }

/* Attempt card */
.attempt-card { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; margin-top: 4px; font-size: 12px; }
.runtime-context { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px; color: var(--muted); font-size: 11px; }
.runtime-context span { display: inline-block; padding: 1px 5px; border-radius: 3px; background: rgba(115,115,115,0.12); }
.runtime-context-fallback { color: var(--warn); background: rgba(245,158,11,0.14) !important; }
.file-chips { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px; }
.file-chip { display: inline-block; padding: 2px 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--accent); font-size: 11px; cursor: pointer; }
.file-chip:hover { background: var(--border); }

/* Modal overlay base */
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; justify-content: center; align-items: center; }
.modal-overlay.open { display: flex; }

/* Report modal */
.report-content { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; width: 720px; max-width: 95vw; max-height: 90vh; overflow-y: auto; padding: 24px; }
.report-content pre { white-space: pre-wrap; font-family: inherit; font-size: 13px; line-height: 1.6; }

/* File viewer */
.file-viewer { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 110; justify-content: center; align-items: center; }
.file-viewer.open { display: flex; }
.file-viewer-content { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; width: 640px; max-width: 95vw; max-height: 90vh; overflow-y: auto; padding: 24px; }
.file-viewer-content pre { white-space: pre-wrap; word-break: break-all; font-size: 12px; line-height: 1.5; }

/* TeamUnit Modal */
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; width: 480px; max-width: 95vw; max-height: 90vh; overflow-y: auto; padding: 24px; }
.modal h2 { font-size: 16px; margin-bottom: 16px; }
.modal label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 4px; margin-top: 12px; }
.modal input, .modal select, .modal textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 13px; }
.modal textarea { min-height: 60px; resize: vertical; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }
.profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.profile-grid label { margin-top: 0; }

/* Run card run-id */
.run-id { font-family: monospace; font-size: 12px; color: var(--muted); }
.summary-item { text-align: center; font-size: 18px; font-weight: 600; }

/* Team ID label — click to copy, full display */
.team-id-row { display: flex; align-items: center; }
.team-id-label { font-family: monospace; font-size: 11px; color: var(--muted); background: var(--bg); padding: 3px 8px; border-radius: 6px; cursor: pointer; user-select: none; overflow-wrap: anywhere; word-break: break-all; transition: color 0.15s, background 0.15s; border: 1px solid var(--border); }
.team-id-label:hover { color: var(--accent); background: var(--border); }
.team-id-label.is-copied { color: var(--success); background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.3); }

/* Toast */
#team-toast-root { position: fixed; bottom: 20px; right: 20px; z-index: 200; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
.toast { padding: 10px 16px; border-radius: 6px; font-size: 13px; max-width: 360px; pointer-events: auto; animation: toastIn 0.2s ease; }
.toast-success { background: rgba(34,197,94,0.15); color: var(--success); border: 1px solid rgba(34,197,94,0.3); }
.toast-error { background: rgba(239,68,68,0.15); color: var(--fail); border: 1px solid rgba(239,68,68,0.3); }
.toast-info { background: rgba(59,130,246,0.15); color: var(--accent); border: 1px solid rgba(59,130,246,0.3); }
@keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

/* Confirm modal */
#team-confirm-modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 150; justify-content: center; align-items: center; }
#team-confirm-modal.open { display: flex; }
.confirm-box { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; width: 400px; max-width: 95vw; padding: 24px; }
.confirm-box p { font-size: 14px; margin-bottom: 16px; line-height: 1.5; }
.confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }

/* Unified modal panel */
.modal-panel { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; width: 680px; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.modal-header h2, .modal-header h3 { font-size: 15px; font-weight: 600; margin: 0; }
.modal-body { padding: 20px; overflow-y: auto; flex: 1; }
.modal-body pre { white-space: pre-wrap; font-family: inherit; font-size: 13px; line-height: 1.6; }
.copy-btn { padding: 4px 10px; border: 1px solid var(--border); border-radius: 4px; background: transparent; color: var(--muted); font-size: 12px; cursor: pointer; }
.copy-btn:hover { color: var(--text); background: var(--border); }


/* Runtime context collapsible */
.runtime-context-wrap { font-size: 11px; color: var(--muted); margin-top: 2px; }
.runtime-context-wrap summary { cursor: pointer; list-style: none; }
.runtime-context-wrap summary::-webkit-details-marker { display: none; }
.runtime-context-wrap summary::before { content: "\\25B8 "; }
.runtime-context-wrap[open] summary::before { content: "\\25BE "; }
.runtime-context-detail { margin-top: 2px; }

/* Attempt error highlight */
.attempt-error { color: var(--fail); font-weight: 500; }

/* Plan card compact layout */
.plan-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 8px; flex-wrap: wrap; }
.plan-card-title { font-size: 14px; font-weight: 600; }
.plan-card-chips { display: flex; gap: 6px; }
.plan-chip { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; background: rgba(115,115,115,0.12); color: var(--muted); }
.plan-summary { margin-bottom: 8px; }
.plan-summary-row { display: flex; gap: 8px; margin-bottom: 2px; font-size: 13px; overflow-wrap: break-word; }
.plan-summary-label { color: var(--muted); flex-shrink: 0; min-width: 28px; }
.plan-summary-text { color: var(--text); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.plan-task-extra { margin-bottom: 4px; }
.plan-task-row { border-top: 1px solid var(--border); padding: 6px 0; }
.plan-task-row-head { font-size: 13px; font-weight: 500; overflow-wrap: break-word; }
.plan-task-num { color: var(--muted); font-size: 11px; margin-right: 4px; }
.plan-task-meta { color: var(--muted); font-size: 11px; font-weight: 400; margin-left: auto; }
.plan-task-details { font-size: 12px; color: var(--muted); margin-top: 4px; }
.plan-task-details summary { cursor: pointer; font-size: 13px; color: var(--accent); list-style: none; }
.plan-task-details summary::-webkit-details-marker { display: none; }
.plan-task-details summary::before { content: "\\25B8 "; }
.plan-task-details[open] summary::before { content: "\\25BE "; }
.plan-task-detail-content { margin-top: 4px; padding-left: 12px; padding: 8px; background: var(--bg); border-radius: 4px; }
.plan-task-detail-input { font-size: 12px; color: var(--muted); margin-bottom: 4px; overflow-wrap: break-word; white-space: pre-wrap; }
.plan-actions { margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; }
.acceptance-list { list-style: none; padding: 0; margin: 4px 0 0; }
.acceptance-list .acceptance-rule { font-size: 12px; color: var(--muted); padding: 1px 0 1px 16px; position: relative; overflow-wrap: break-word; }
.acceptance-list .acceptance-rule::before { content: "\\2713"; position: absolute; left: 0; color: var(--success); font-size: 11px; }
	/* Plan dashboard grid */
	.plan-dashboard-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
	.plan-dashboard-card { position: relative; transition: border-color 0.2s; }
	.plan-dashboard-card:hover { border-color: var(--accent); }
	.plan-card-active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); animation: pulse-border 2s ease-in-out infinite; }
	.plan-card-failed { border-color: var(--fail); border-left: 3px solid var(--fail); }
	.plan-card-run-summary { margin-top: 8px; padding: 8px; background: var(--bg); border-radius: 4px; }
	.plan-kind-badge { font-weight: 500; }
	.plan-dashboard-empty { grid-column: 1 / -1; }
	#plan-detail { max-width: 960px; margin: 0 auto; }
	.plan-design-diagram { background: var(--bg); border-radius: 6px; border: 1px solid var(--border); }

/* P19 responsive and polish */
@keyframes pulse-border { 0%,100% { box-shadow: 0 0 0 1px var(--accent); } 50% { box-shadow: 0 0 8px 2px var(--accent); } }
.plan-dashboard-card .plan-card-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.plan-dashboard-card .plan-card-actions button { font-size: 12px; padding: 3px 10px; }
.run-detail { border-top: 1px solid var(--border); margin-top: 8px; padding-top: 8px; }
.run-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.run-actions button { font-size: 12px; padding: 2px 8px; }
#plan-detail .plan-detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
#plan-detail .plan-detail-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* Mindmap view toggle */
.mindmap-view-toggle { display: flex; margin-bottom: 12px; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.mindmap-view-toggle-btn { flex: 1; padding: 6px 12px; border: none; font-size: 12px; cursor: pointer; background: var(--surface); color: var(--text); transition: background 0.15s, color 0.15s; }
.mindmap-view-toggle-btn:hover { background: var(--border); }
.mindmap-view-toggle-btn.active { background: var(--accent); color: #fff; }
.mindmap-view-toggle-btn + .mindmap-view-toggle-btn { border-left: 1px solid var(--border); }

/* Team mindmap */
.team-mindmap { padding: 4px 0; overflow-x: auto; }
.mindmap-canvas { position: relative; }

/* Mindmap nodes — base card */
.mindmap-root-node { padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); font-size: 13px; margin-bottom: 6px; word-break: break-word; }
.mindmap-task-node { padding: 6px 10px; border: 1px solid var(--border); border-left: 2px solid var(--muted); border-radius: 6px; background: var(--surface); font-size: 13px; margin-bottom: 4px; word-break: break-word; transition: border-color 0.15s; }
.mindmap-task-node:hover { border-color: var(--accent); border-left-color: var(--accent); }

/* Root status accents */
.mindmap-root-node[data-node-status="running"] { border-color: var(--accent); }
.mindmap-root-node[data-node-status="completed"], .mindmap-root-node[data-node-status="completed_with_failures"] { border-color: var(--success); }
.mindmap-root-node[data-node-status="failed"] { border-color: var(--fail); }

/* Task status accents */
.mindmap-task-node[data-node-status="running"] { border-left-color: var(--accent); animation: mindmap-pulse 2.5s ease-in-out infinite; }
.mindmap-task-node[data-node-status="succeeded"] { border-left-color: var(--success); }
.mindmap-task-node[data-node-status="failed"] { border-left-color: var(--fail); }
.mindmap-task-node[data-node-status="skipped"], .mindmap-task-node[data-node-status="cancelled"] { border-left-color: var(--muted); opacity: 0.65; }
.mindmap-task-node[data-node-status="pending"] { border-left-color: var(--muted); }

@keyframes mindmap-pulse {
  0%, 100% { border-left-color: var(--accent); }
  50% { border-left-color: rgba(59,130,246,0.3); }
}

/* Node toggle button */
.mindmap-node-toggle { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; width: 100%; text-align: left; background: none; border: none; color: var(--text); cursor: pointer; padding: 0; font-size: inherit; }
.mindmap-node-toggle:hover { opacity: 0.85; }

/* Expanded state */
.mindmap-node-expanded { border-color: rgba(59,130,246,0.35); }

/* Root content row */
.mindmap-root-node > div:first-child { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

/* Node error */
.mindmap-node-error { margin-top: 2px; font-size: 11px; color: var(--fail); word-break: break-all; overflow-wrap: break-word; }

/* Node details (expanded) */
.mindmap-node-details { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); font-size: 12px; word-break: break-word; }
.mindmap-node-details .mindmap-meta { color: var(--muted); margin-bottom: 4px; }
.mindmap-node-details .mindmap-ref { margin-bottom: 2px; word-break: break-all; }

/* Node summary line */
.mindmap-node-summary { margin-top: 2px; font-size: 11px; color: var(--muted); }

/* Compact metadata */
.mindmap-compact-meta { font-size: 10px; color: var(--muted); }
.mindmap-compact-warn { font-size: 10px; color: var(--warn); }

/* Children container with connector trunk */
.mindmap-children { position: relative; margin-top: 2px; }
.mindmap-children::before { content: ''; position: absolute; left: 9px; top: 0; bottom: 8px; width: 1px; background: var(--border); }
.mindmap-children > .mindmap-task-node { position: relative; }
.mindmap-children > .mindmap-task-node::before { content: ''; position: absolute; left: -11px; top: 13px; width: 11px; height: 1px; background: var(--border); }

/* Group expand/collapse */
.mindmap-group-toggle { display: block; font-size: 11px; padding: 2px 8px; border: 1px solid var(--border); background: var(--surface); cursor: pointer; border-radius: 4px; margin-bottom: 4px; color: var(--muted); }
.mindmap-group-toggle:hover { border-color: var(--accent); color: var(--accent); }

/* Mobile responsive */
@media (max-width: 720px) {
	.modal-panel, .report-content, .file-viewer-content, .modal, .confirm-box { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; max-height: 100vh !important; }
	.topbar { flex-wrap: wrap; gap: 8px; }
	.team-summary { display: none !important; }
	.run-actions { flex-wrap: wrap; }
	table { font-size: 11px; }
	th, td { padding: 6px 8px; }
	.main { padding: 12px; }
	.card { padding: 12px; }
	.profile-grid { grid-template-columns: 1fr; }
	.plan-task-row { padding: 4px 0; }
	.plan-summary-text { font-size: 12px; }
	.plan-dashboard-grid { grid-template-columns: 1fr; }
	#plan-detail { padding: 8px; }
	.team-mindmap { overflow-x: hidden; }
	.mindmap-children::before, .mindmap-children > .mindmap-task-node::before { display: none; }
	.mindmap-root-node, .mindmap-task-node { font-size: 12px; padding: 4px 8px; border-radius: 4px; }
	.mindmap-view-toggle { margin-bottom: 8px; }
	}
@media (max-width: 390px) {
	.plan-dashboard-grid { grid-template-columns: 1fr; }
	.plan-dashboard-card { padding: 10px; }
	}
</style>
</head>
<body>
<div class="topbar">
	<div>
		<h1>Team 控制台</h1>
		<p style="font-size:12px;color:var(--muted)">计划 → 多角色执行 → 报告</p>
	</div>
	<div class="team-summary" style="display:flex;gap:16px">
		<div class="summary-item"><span class="summary-plans" id="summary-plans">0</span><span style="font-size:11px;color:var(--muted)"> 计划</span></div>
		<div class="summary-item"><span class="summary-teams" id="summary-teams">0</span><span style="font-size:11px;color:var(--muted)"> 团队</span></div>
		<div class="summary-item"><span class="summary-active-runs" id="summary-active-runs">0</span><span style="font-size:11px;color:var(--muted)"> 活跃运行</span></div>
	</div>
	<nav>
		<button class="active" onclick="showSection('plans', event)">计划</button>
		<button onclick="showSection('teams', event)">预设团队</button>
		<button onclick="showSection('runs', event)">运行记录</button>
	</nav>
</div>

<div class="main">
	<!-- Plans -->
	<div id="section-plans" class="section active">
		<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
			<h2>计划</h2>
			<button class="btn btn-primary" onclick="createPlan()">新建计划</button>
		</div>
		<div id="plans-list"><div class="loading"><div class="spinner"></div> 加载中...</div></div>
		<div id="plan-detail" style="display:none">
			<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
				<button class="btn" style="background:var(--border);color:var(--text)" onclick="closePlanDetail()">← 返回</button>
				<div id="plan-detail-actions" style="display:flex;gap:8px"></div>
			</div>
			<div id="plan-detail-content"></div>
		</div>
	</div>

	<!-- Teams -->
	<div id="section-teams" class="section">
		<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
			<h2>预设团队</h2>
			<button class="btn btn-primary" onclick="openTeamUnitModal()">新建预设团队</button>
		</div>
		<div id="teams-list"></div>
	</div>

	<!-- Runs -->
	<div id="section-runs" class="section">
		<div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center"><h2>运行记录</h2><button class="refresh-btn" onclick="loadRuns()">刷新</button></div>
		<div id="runs-list"></div>
	</div>
</div>

<!-- TeamUnit Modal -->
<div id="teamunit-modal" class="modal-overlay">
	<div class="modal">
		<h2 id="teamunit-modal-title">新建预设团队</h2>
		<input type="hidden" id="tu-editing-id" value="" />
		<label>名称</label>
		<input id="tu-title" placeholder="预设团队名称" />
		<label>描述</label>
		<textarea id="tu-desc" placeholder="描述（可选）"></textarea>
		<div class="profile-grid" style="margin-top:12px">
			<div class="field">
				<label>执行 Agent (Worker)</label>
				<select id="tu-worker" onchange="syncDecomposerWithWorker()"></select>
			</div>
			<div class="field">
				<label>验收 Agent (Checker)</label>
				<select id="tu-checker"></select>
			</div>
			<div class="field">
				<label>复盘 Agent (Watcher)</label>
				<select id="tu-watcher"></select>
			</div>
			<div class="field">
				<label>汇总 Agent (Finalizer)</label>
				<select id="tu-finalizer"></select>
			</div>
			<div class="field">
				<label>任务拆分 Agent (Decomposer)</label>
				<select id="tu-decomposer"></select>
			</div>
		</div>
		<div class="modal-actions">
			<button class="btn" style="background:var(--border);color:var(--text)" onclick="closeTeamUnitModal()">取消</button>
			<button class="btn btn-primary" onclick="saveTeamUnit()">保存</button>
		</div>
	</div>
</div>


<!-- Plan Modal -->
<div id="plan-modal" class="modal-overlay">
	<div class="modal" style="width:560px">
		<h2>新建计划</h2>
		<label>计划名称</label>
		<input id="plan-title" placeholder="计划名称" />
		<label>默认团队</label>
		<select id="plan-teamunit"></select>
		<label>创建模式</label>
		<select id="plan-mode" onchange="onPlanModeChange()">
			<option value="normal">普通计划</option>
			<option value="dynamic">发现后逐项处理</option>
		</select>
		<label>目标</label>
		<textarea id="plan-goal" placeholder="计划目标"></textarea>

		<div id="plan-normal-fields">
			<label>任务标题</label>
			<input id="plan-task-title" placeholder="任务标题" value="任务1" />
			<label>任务内容</label>
			<textarea id="plan-task-text" placeholder="任务内容"></textarea>
			<label>验收标准（每行一条）</label>
			<textarea id="plan-acceptance" placeholder="完成目标"></textarea>
		</div>

		<div id="plan-dynamic-fields" style="display:none">
			<label style="margin-top:12px;font-weight:600;color:var(--accent)">发现任务</label>
			<label>发现任务标题</label>
			<input id="plan-disc-title" placeholder="发现相关条目" value="发现条目" />
			<label>发现指令</label>
			<textarea id="plan-disc-instruction" placeholder="搜索并收集相关条目，输出 JSON 格式"></textarea>
			<label>输出键名（JSON 中 item 数组的键名）</label>
			<input id="plan-disc-output-key" placeholder="items" value="items" />
			<label>发现验收标准（每行一条）</label>
			<textarea id="plan-disc-acceptance" placeholder="输出为有效 JSON&#10;包含 items 数组"></textarea>

			<label style="margin-top:12px;font-weight:600;color:var(--accent)">逐项处理模板</label>
			<label>子任务标题模板</label>
			<input id="plan-child-title" placeholder="处理 {{item.title}}" value="处理 {{item.title}}" />
			<label>子任务指令模板</label>
			<textarea id="plan-child-instruction" placeholder="对 {{item.title}}（ID: {{item.id}}）执行分析"></textarea>
			<label>子任务验收标准（每行一条）</label>
			<textarea id="plan-child-acceptance" placeholder="输出包含对 {{item.id}} 的分析结果"></textarea>
		</div>

		<label>输出契约</label>
		<textarea id="plan-output-contract" placeholder="中文汇总"></textarea>

		<div id="plan-preview-wrap" style="display:none">
			<label>预览 Plan JSON</label>
			<pre id="plan-preview-json" style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px;font-size:12px;max-height:260px;overflow:auto;white-space:pre-wrap;word-break:break-all"></pre>
		</div>

		<div class="modal-actions">
			<button class="btn" style="background:var(--border);color:var(--text)" onclick="closePlanModal()">取消</button>
			<button class="btn btn-sm" style="background:var(--border);color:var(--text)" onclick="previewPlanJson()">预览 JSON</button>
			<button class="btn btn-primary" onclick="savePlan()">创建</button>
		</div>
	</div>
</div>
<!-- Report Modal -->
<div id="report-modal" class="modal-overlay">
	<div class="modal-panel">
		<div class="modal-header">
			<h2>最终报告</h2>
			<div style="display:flex;gap:8px">
				<button class="copy-btn" id="copy-report-btn" onclick="copyReport()">复制</button>
				<button class="btn" style="background:var(--border);color:var(--text)" onclick="closeReportModal()">关闭</button>
			</div>
		</div>
		<div class="modal-body" id="report-body"><div class="loading"><div class="spinner"></div> 加载中...</div></div>
	</div>
</div>

<!-- Plan JSON Viewer -->
<div id="plan-json-modal" class="modal-overlay">
	<div class="modal-panel">
		<div class="modal-header">
			<h2>Plan JSON</h2>
			<button class="btn" style="background:var(--border);color:var(--text)" onclick="closePlanJsonModal()">关闭</button>
		</div>
		<div class="modal-body" id="plan-json-body"></div>
	</div>
</div>

<!-- File Viewer -->
<div id="file-viewer" class="file-viewer">
	<div class="modal-panel">
		<div class="modal-header">
			<h3 id="file-viewer-title">文件内容</h3>
			<button class="btn" style="background:var(--border);color:var(--text)" onclick="closeFileViewer()">关闭</button>
		</div>
		<div class="modal-body">
			<pre id="file-viewer-body"></pre>
		</div>
	</div>
</div>

<script>
const API = '/v1/team';
var agentCatalog = [];

var _latestPlans = [];
var _latestTeams = [];
var _latestRuns = [];
var _planCache = {};

function $(id) { return document.getElementById(id); }

function escapeHtml(value) {
	return String(value == null ? '' : value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function jsArg(value) {
	return escapeHtml(JSON.stringify(String(value == null ? '' : value)));
}

function pathSegment(value) {
	return encodeURIComponent(String(value == null ? '' : value));
}

function showToast(message, type) {
	var root = $('team-toast-root');
	if (!root) return;
	var el = document.createElement('div');
	el.className = 'toast toast-' + (type || 'info');
	el.textContent = message;
	root.appendChild(el);
	setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 4000);
}

function showError(message) { showToast(message, 'error'); }
function showSuccess(message) { showToast(message, 'success'); }

async function writeTeamClipboardText(text) {
	var value = String(text || '');
	if (navigator.clipboard && window.isSecureContext) {
		await navigator.clipboard.writeText(value);
		return;
	}
	var textarea = document.createElement('textarea');
	textarea.value = value;
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'fixed';
	textarea.style.left = '-9999px';
	document.body.appendChild(textarea);
	textarea.select();
	try {
		if (!document.execCommand('copy')) {
			throw new Error('copy_failed');
		}
	} finally {
		textarea.remove();
	}
}

function copyTeamIdToClipboard(event, value, labelEl) {
	event.stopPropagation();
	event.preventDefault();
	writeTeamClipboardText(value).then(function() {
		showSuccess('已复制');
		labelEl.textContent = '已复制';
		labelEl.classList.add('is-copied');
		setTimeout(function() {
			labelEl.textContent = value;
			labelEl.classList.remove('is-copied');
		}, 1200);
	}).catch(function() {
		showError('复制失败');
	});
}

function findLatestPlanById(planId) {
	for (var i = 0; i < _latestPlans.length; i++) {
		if (_latestPlans[i] && _latestPlans[i].planId === planId) return _latestPlans[i];
	}
	return null;
}

function confirmAction(opts) {
	return new Promise(function(resolve) {
		var modal = $('team-confirm-modal');
		var msg = $('confirm-message');
		var okBtn = $('confirm-ok');
		var cancelBtn = $('confirm-cancel');
		if (!modal || !msg || !okBtn || !cancelBtn) { resolve(false); return; }
		msg.textContent = opts.message || '确认执行此操作？';
		okBtn.className = opts.danger ? 'btn btn-danger' : 'btn btn-primary';
		okBtn.textContent = opts.confirmText || '确认';
		modal.classList.add('open');
		function cleanup() {
			modal.classList.remove('open');
			okBtn.removeEventListener('click', onOk);
			cancelBtn.removeEventListener('click', onCancel);
			modal.removeEventListener('click', onBg);
		}
		function onOk() { cleanup(); resolve(true); }
		function onCancel() { cleanup(); resolve(false); }
		function onBg(e) { if (e.target === modal) { cleanup(); resolve(false); } }
		okBtn.addEventListener('click', onOk);
		cancelBtn.addEventListener('click', onCancel);
		modal.addEventListener('click', onBg);
	});
}

function formatDuration(ms) {
	if (!ms || ms <= 0) return '0秒';
	var s = Math.floor(ms / 1000);
	var h = Math.floor(s / 3600);
	var m = Math.floor((s % 3600) / 60);
	s = s % 60;
	if (h > 0) return h + '时' + (m > 0 ? m + '分' : '');
	if (m > 0) return m + '分' + (s > 0 ? s + '秒' : '');
	return s + '秒';
}

function formatTimestamp(iso) {
	if (!iso) return '';
	var d = new Date(iso);
	var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
	return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

var PHASE_LABELS = {
	pending: '等待执行', creating_workunit: '创建工作单元', creating_worker_session: '创建执行 Agent',
	worker_running: '执行中', worker_completed: '执行完成',
	checker_reviewing: '验收中', checker_passed: '验收通过', checker_revising: '验收修改', checker_failed: '验收失败',
	worker_revising: '修改中',
	watcher_reviewing: '复盘中', watcher_accepted: '复盘通过', watcher_revision_requested: '复盘请求重做', watcher_confirmed_failed: '复盘确认失败',
	finalizer_running: '生成报告', writing_result: '写入结果',
	created: '已创建', succeeded: '已通过', failed: '失败', interrupted: '已中断', cancelled: '已取消', skipped: '已跳过'
};

var PHASE_COLORS = {
	pending: 'phase-muted', creating_workunit: 'phase-running', creating_worker_session: 'phase-running',
	worker_running: 'phase-running', worker_completed: 'phase-running',
	checker_reviewing: 'phase-running', checker_passed: 'phase-success', checker_revising: 'phase-running', checker_failed: 'phase-fail',
	worker_revising: 'phase-running',
	watcher_reviewing: 'phase-running', watcher_accepted: 'phase-success', watcher_revision_requested: 'phase-warn', watcher_confirmed_failed: 'phase-fail',
	finalizer_running: 'phase-running', writing_result: 'phase-running',
	created: 'phase-muted', succeeded: 'phase-success', failed: 'phase-fail', interrupted: 'phase-warn', cancelled: 'phase-muted', skipped: 'phase-muted'
};

function phaseLabel(phase) {
	return PHASE_LABELS[phase] || phase;
}

function phaseColor(phase) {
	return PHASE_COLORS[phase] || 'phase-muted';
}

function showSection(name, evt) {
	document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
	$('section-' + name).classList.add('active');
	document.querySelectorAll('.topbar button').forEach(function(b) { b.classList.remove('active'); });
	if (evt && evt.target) {
		evt.target.classList.add('active');
	} else {
		var idx = { plans: 0, teams: 1, runs: 2 }[name];
		if (idx !== undefined) document.querySelectorAll('.topbar button')[idx].classList.add('active');
	}
	if (name === 'plans') loadPlans();
	if (name === 'teams') loadTeams();
	if (name === 'runs') loadRuns();
}

function updateSummary(plans, teams, runs) {
	var plansEl = $('summary-plans');
	var teamsEl = $('summary-teams');
	var runsEl = $('summary-active-runs');
	if (plansEl) plansEl.textContent = plans ? plans.length : 0;
	if (teamsEl) teamsEl.textContent = teams ? teams.length : 0;
	var activeRuns = runs ? runs.filter(function(r) { return r.status === 'queued' || r.status === 'running' || r.status === 'paused'; }).length : 0;
	if (runsEl) runsEl.textContent = activeRuns;
}

function statusBadge(status) {
	var map = { completed: 'badge-success', completed_with_failures: 'badge-warn', failed: 'badge-fail', running: 'badge-warn', queued: 'badge-muted', paused: 'badge-warn', cancelled: 'badge-muted', skipped: 'badge-muted' };
	return '<span class="badge ' + (map[status] || 'badge-muted') + '">' + escapeHtml(status) + '</span>';
}

function renderRuntimeContext(role, ctx) {
		if (!ctx) return '';
		var summary = escapeHtml(role) + ': ' + escapeHtml(ctx.requestedProfileId) + ' \u2192 ' + escapeHtml(ctx.resolvedProfileId) + ' | browser: ' + escapeHtml(ctx.browserId == null ? 'none' : ctx.browserId) + ' | scope: ' + escapeHtml(ctx.browserScope);
		if (ctx.fallbackUsed) summary += ' (fallback' + (ctx.fallbackReason ? ': ' + escapeHtml(ctx.fallbackReason) : '') + ')';
		var detailParts = [
			'<span>' + escapeHtml(role) + ': ' + escapeHtml(ctx.requestedProfileId) + ' \u2192 ' + escapeHtml(ctx.resolvedProfileId) + '</span>',
			'<span>browser: ' + escapeHtml(ctx.browserId == null ? 'none' : ctx.browserId) + '</span>',
			'<span>scope: ' + escapeHtml(ctx.browserScope) + '</span>',
		];
		if (ctx.fallbackUsed) detailParts.push('<span class="runtime-context-fallback">fallback' + (ctx.fallbackReason ? ': ' + escapeHtml(ctx.fallbackReason) : '') + '</span>');
		return '<details class="runtime-context-wrap"><summary>' + summary + '</summary><div class="runtime-context runtime-context-detail">' + detailParts.join('') + '</div></details>';
	}

function profileName(id) {
	var a = agentCatalog.find(function(x) { return (x.agentId || 'main') === id; });
	return a ? (a.name || a.agentId) : id;
}

async function api(path, opts) {
	if (!opts) opts = {};
	var res = await fetch(API + path, opts);
	if (!res.ok && res.status !== 204) { var e = await res.json().catch(function() { return {}; }); throw new Error(e.error || res.statusText); }
	return res.status === 204 ? null : res.json();
}

async function loadAgents() {
	try {
		var res = await fetch('/v1/agents');
		var data = await res.json();
		agentCatalog = data.agents || [];
	} catch (e) {
		agentCatalog = [];
	}
}

function renderProfileOptions(selId, selectedId) {
	var sel = $(selId);
	if (!sel) return;
	sel.innerHTML = '';
	var agents = agentCatalog.length > 0 ? agentCatalog : [{ agentId: 'main', name: '主 Agent' }];
	for (var i = 0; i < agents.length; i++) {
		var a = agents[i];
		var opt = document.createElement('option');
		opt.value = a.agentId || 'main';
		opt.textContent = a.name || a.agentId || 'main';
		sel.appendChild(opt);
	}
	if (selectedId && !agents.some(function(a) { return (a.agentId || 'main') === selectedId; })) {
		var opt = document.createElement('option');
		opt.value = selectedId;
		opt.textContent = selectedId + '（不可用）';
		sel.appendChild(opt);
	}
	if (selectedId) sel.value = selectedId;
}

function openTeamUnitModal(unit) {
	$('tu-editing-id').value = unit ? unit.teamUnitId : '';
	$('tu-title').value = unit ? unit.title : '';
	$('tu-desc').value = unit ? unit.description : '';
	$('teamunit-modal-title').textContent = unit ? '编辑预设团队' : '新建预设团队';
	renderProfileOptions('tu-worker', unit ? unit.workerProfileId : 'main');
	renderProfileOptions('tu-checker', unit ? unit.checkerProfileId : 'main');
	renderProfileOptions('tu-watcher', unit ? unit.watcherProfileId : 'main');
	renderProfileOptions('tu-finalizer', unit ? unit.finalizerProfileId : 'main');
	renderProfileOptions('tu-decomposer', unit ? (unit.decomposerProfileId || unit.workerProfileId) : $('tu-worker').value);
	$('teamunit-modal').classList.add('open');
}

function syncDecomposerWithWorker() {
	if ($('tu-editing-id').value) return;
	$('tu-decomposer').value = $('tu-worker').value;
}

function closeTeamUnitModal() {
	$('teamunit-modal').classList.remove('open');
}

async function saveTeamUnit() {
	var editingId = $('tu-editing-id').value;
	var payload = {
		title: $('tu-title').value,
		description: $('tu-desc').value,
		workerProfileId: $('tu-worker').value,
		checkerProfileId: $('tu-checker').value,
		watcherProfileId: $('tu-watcher').value,
		finalizerProfileId: $('tu-finalizer').value,
		decomposerProfileId: $('tu-decomposer').value,
	};
	if (!payload.title) { showError('请输入名称'); return; }
	try {
		if (editingId) {
			await api('/team-units/' + editingId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
		} else {
			await api('/team-units', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
		}
		closeTeamUnitModal();
		showSuccess(editingId ? '已更新' : '已创建');
		loadTeams();
	} catch (e) { showError(e.message); }
}


		function truncateText(text, maxLen) {
			if (!text) return '';
			var str = String(text);
			if (str.length <= maxLen) return str;
			return str.slice(0, maxLen) + '...';
		}

		function viewPlanJson(planId) {
			var plan = _latestPlans.find(function(p) { return p.planId === planId; });
			if (!plan) { showError('Plan 未找到'); return; }
			var body = $('plan-json-body');
			body.innerHTML = '';
			var pre = document.createElement('pre');
			pre.textContent = JSON.stringify(plan, null, 2);
			body.appendChild(pre);
			$('plan-json-modal').classList.add('open');
		}

		function closePlanJsonModal() {
			$('plan-json-modal').classList.remove('open');
		}

			// P19 Dashboard helpers
			var ACTIVE_RUN_STATUSES = { queued: 1, running: 1, paused: 1 };
			var TERMINAL_RUN_STATUSES = { completed: 1, completed_with_failures: 1, failed: 1, cancelled: 1 };

			function isActiveRunStatus(status) { return !!ACTIVE_RUN_STATUSES[status]; }
			function isTerminalRunStatus(status) { return !!TERMINAL_RUN_STATUSES[status]; }

			function runsForPlan(planId, runs) {
				if (!runs) return [];
				return runs.filter(function(r) { return r.planId === planId; });
			}

			function activeRunForPlan(planId, runs) {
				var planRuns = runsForPlan(planId, runs);
				for (var i = 0; i < planRuns.length; i++) {
					if (isActiveRunStatus(planRuns[i].status)) return planRuns[i];
				}
				return null;
			}

			function latestRunForPlan(planId, runs) {
				var planRuns = runsForPlan(planId, runs);
				if (!planRuns.length) return null;
				return planRuns[0];
			}

			function runProgressSummary(run) {
				if (!run || !run.summary) return { done: 0, total: 0, pct: 0, succeeded: 0, failed: 0, cancelled: 0 };
				var s = run.summary;
				var done = (s.succeededTasks || 0) + (s.failedTasks || 0) + (s.cancelledTasks || 0) + (s.skippedTasks || 0);
				var total = s.totalTasks || 0;
				return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0, succeeded: s.succeededTasks || 0, failed: s.failedTasks || 0, cancelled: s.cancelledTasks || 0 };
			}

			function planKindLabel(plan) {
				var tasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
				if (isDynamicPlan(tasks)) return 'discovery + for_each';
				return 'normal';
			}

			function taskDecomposerMode(task) {
				var mode = task && task.decomposer && task.decomposer.mode ? String(task.decomposer.mode) : 'none';
				return mode === 'leaf' || mode === 'propagate' ? mode : 'none';
			}

			function renderDecomposerModeBadge(task) {
				var mode = taskDecomposerMode(task);
				if (mode === 'none') return '';
				var label = mode === 'leaf' ? '任务可拆分' : '可生成可拆任务';
				var color = mode === 'leaf' ? 'var(--warn)' : 'var(--accent)';
				var bg = mode === 'leaf' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)';
				return ' <span class="badge decomposer-badge" style="background:' + bg + ';color:' + color + ';font-size:11px">' + escapeHtml(mode) + ' · ' + label + '</span>';
			}

			// P19 Dashboard UI state
			var _selectedPlanId = null;
			var _expandedRunIds = {};
			var _runDetailViewByRunId = {};
			var _mindmapExpandedNodes = {};
			var _mindmapExpandedGroups = {};

			function getRunDetailView(runId) {
				return _runDetailViewByRunId[runId] || 'mindmap';
			}

			function setRunDetailView(runId, view) {
				_runDetailViewByRunId[runId] = view;
			}

			function isMindmapNodeExpanded(runId, taskId, nodeStatus) {
				var key = runId + '::' + taskId;
				if (_mindmapExpandedNodes[key]) return true;
				if (nodeStatus === 'failed' && _mindmapExpandedNodes[key] === undefined) return true;
				return false;
			}

			function isMindmapGroupExpanded(runId, parentTaskId) {
				return !!_mindmapExpandedGroups[runId + '::' + parentTaskId];
			}

			function rerenderMindmap(runId, sourceEl) {
				var detailEl = findRunDetailElement(runId, sourceEl);
				if (!detailEl) return;
				var state = window._latestRunStateForRun ? window._latestRunStateForRun[runId] : null;
				var plan = window._latestPlanForRun ? window._latestPlanForRun[runId] : null;
				var attempts = window._latestAttemptsForRun ? window._latestAttemptsForRun[runId] : null;
				if (!state || !plan) return;
				detailEl.innerHTML = renderRunDetailShell(runId, state, plan, attempts);
			}

			window.toggleMindmapNode = function(runId, taskId, nodeStatus, sourceEl) {
				var key = runId + '::' + taskId;
				var currentlyExpanded = isMindmapNodeExpanded(runId, taskId, nodeStatus);
				_mindmapExpandedNodes[key] = !currentlyExpanded;
				rerenderMindmap(runId, sourceEl);
			};

			window.toggleMindmapGroup = function(runId, parentTaskId, sourceEl) {
				var key = runId + '::' + parentTaskId;
				_mindmapExpandedGroups[key] = !_mindmapExpandedGroups[key];
				rerenderMindmap(runId, sourceEl);
			};

			function isDynamicPlan(tasks) {
				if (!tasks || tasks.length < 2) return false;
				var hasDiscovery = false, hasForEach = false;
				for (var i = 0; i < tasks.length; i++) {
					if (tasks[i].type === 'discovery') hasDiscovery = true;
					if (tasks[i].type === 'for_each') hasForEach = true;
				}
				return hasDiscovery && hasForEach;
			}

			function renderPlanDashboardCard(plan, runs) {
				var safePlan = plan || {};
				var tasks = Array.isArray(safePlan.tasks) ? safePlan.tasks : [];
				var kind = planKindLabel(safePlan);
				var activeRun = activeRunForPlan(safePlan.planId, runs);
				var latestRun = activeRun ? activeRun : latestRunForPlan(safePlan.planId, runs);
				var runCount = runsForPlan(safePlan.planId, runs).length || safePlan.runCount || 0;
				var isActive = !!activeRun;
				var isFailed = latestRun && (latestRun.status === 'failed' || latestRun.status === 'completed_with_failures');
				var goalText = safePlan.goal && safePlan.goal.text ? safePlan.goal.text : '';
				var cardClass = 'card plan-dashboard-card' + (isActive ? ' plan-card-active' : '') + (isFailed ? ' plan-card-failed' : '');
				var kindBadge = kind !== 'normal'
					? '<span class="plan-chip plan-kind-badge" style="background:rgba(124,58,237,0.15);color:#7c3aed">' + escapeHtml(kind) + '</span>'
					: '<span class="plan-chip plan-kind-badge">' + tasks.length + ' 个任务</span>';
				var runChip = '<span class="plan-chip">' + runCount + ' 次运行</span>';
				var summaryRow = goalText ? '<div class="plan-summary-row"><span class="plan-summary-text">' + escapeHtml(truncateText(goalText, 120)) + '</span></div>' : '';
				var activeSummary = '';
				if (activeRun) {
					var prog = runProgressSummary(activeRun);
					var taskTitle = activeRun.currentTaskId || '';
					var planForTask = _planCache[activeRun.planId] || safePlan;
					if (planForTask && activeRun.currentTaskId) {
						var task = planForTask.tasks ? planForTask.tasks.find(function(t) { return t.id === activeRun.currentTaskId; }) : null;
						if (task) taskTitle = task.title;
					}
					activeSummary = '<div class="plan-card-run-summary">'
						+ statusBadge(activeRun.status)
						+ ' <span style="font-size:12px;color:var(--muted)">' + prog.done + '/' + prog.total + '</span>'
						+ (taskTitle ? ' <span style="font-size:12px;color:var(--accent)">→ ' + escapeHtml(taskTitle) + '</span>' : '')
						+ '<div class="progress-bar" style="margin-top:4px"><div class="progress-bar-fill" style="width:' + prog.pct + '%"></div></div>'
						+ '</div>';
				} else if (latestRun && isFailed) {
					activeSummary = '<div class="plan-card-run-summary">'
						+ statusBadge(latestRun.status)
						+ (latestRun.lastError ? ' <span style="font-size:11px;color:var(--fail)">' + escapeHtml(truncateText(latestRun.lastError, 60)) + '</span>' : '')
						+ '</div>';
				} else if (latestRun) {
					activeSummary = '<div class="plan-card-run-summary">'
						+ statusBadge(latestRun.status)
						+ '</div>';
				}
				var planIdLabel = safePlan.planId
					? '<div class="team-id-row" style="margin-top:4px"><span class="team-id-label" title="点击复制 Plan ID" onclick="copyTeamIdToClipboard(event, ' + jsArg(safePlan.planId) + ', this)">' + escapeHtml(safePlan.planId) + '</span></div>'
					: '';
				return '<div class="' + cardClass + '" data-plan-id="' + escapeHtml(safePlan.planId || '') + '">'
					+ '<div class="plan-card-header"><span class="plan-card-title">' + escapeHtml(safePlan.title || '') + '</span><div class="plan-card-chips">' + kindBadge + runChip + '</div></div>'
					+ planIdLabel
					+ (summaryRow ? '<div class="plan-summary">' + summaryRow + '</div>' : '')
					+ activeSummary
					+ '<div class="plan-actions">'
					+ '<button class="btn btn-sm btn-primary" onclick="openPlanDetail(' + jsArg(safePlan.planId) + ')">查看详情</button>'
					+ '<button class="btn btn-sm" onclick="startRun(\\x27' + safePlan.planId + '\\x27)">创建运行</button>'
					+ '<button class="btn btn-danger btn-sm" onclick="deletePlan(\\x27' + safePlan.planId + '\\x27)">删除</button>'
					+ '</div></div>';
			}

			function openPlanDetail(planId) {
				var plan = _latestPlans.find(function(p) { return p.planId === planId; });
				if (!plan) { showError('Plan \u672a\u627e\u5230'); return; }
				_selectedPlanId = planId;
				var runs = runsForPlan(planId, _latestRuns);
				$('plans-list').style.display = 'none';
				$('plan-detail').style.display = '';
				$('plan-detail-content').innerHTML = renderPlanDetailContent(plan, runs);
				$('plan-detail-actions').innerHTML = renderPlanDetailActions(plan);
			}

			function closePlanDetail() {
				_selectedPlanId = null;
				$('plans-list').style.display = '';
				$('plan-detail').style.display = 'none';
			}

			function renderPlanDetailContent(plan, runs) {
				var safePlan = plan || {};
				var tasks = Array.isArray(safePlan.tasks) ? safePlan.tasks : [];
				var goalText = safePlan.goal && safePlan.goal.text ? safePlan.goal.text : '';
				var outputText = safePlan.outputContract && safePlan.outputContract.text ? safePlan.outputContract.text : '';
				var dynamic = isDynamicPlan(tasks);
				var html = '<div class="card">';
				html += '<h2 style="font-size:18px;margin-bottom:8px">' + escapeHtml(safePlan.title || '') + '</h2>';
				if (safePlan.planId) html += '<div class="team-id-row" style="margin-bottom:8px"><span class="team-id-label" title="点击复制 Plan ID" onclick="copyTeamIdToClipboard(event, ' + jsArg(safePlan.planId) + ', this)">' + escapeHtml(safePlan.planId) + '</span></div>';
				html += '<div style="display:flex;gap:8px;margin-bottom:12px">';
				html += '<span class="plan-chip plan-kind-badge">' + escapeHtml(planKindLabel(safePlan)) + '</span>';
				html += '<span class="plan-chip">' + tasks.length + ' \u4e2a\u4efb\u52a1</span>';
				html += '<span class="plan-chip">' + (runs ? runs.length : 0) + ' \u6b21\u8fd0\u884c</span>';
				html += '</div>';
				if (goalText) html += '<div class="plan-summary-row" style="margin-bottom:8px"><span class="plan-summary-label">\u76ee\u6807</span><span style="overflow-wrap:break-word">' + escapeHtml(goalText) + '</span></div>';
				if (outputText) html += '<div class="plan-summary-row" style="margin-bottom:8px"><span class="plan-summary-label">\u8f93\u51fa\u5951\u7ea6</span><span style="overflow-wrap:break-word">' + escapeHtml(outputText) + '</span></div>';
				html += '</div>';
				html += '<div class="card" style="margin-top:12px">';
				html += '<h3 style="font-size:15px;margin-bottom:8px">\u4efb\u52a1\u7ed3\u6784</h3>';
				if (dynamic) {
					html += renderDynamicPlanDesign(tasks);
				} else {
					html += renderNormalPlanDesign(tasks);
				}
				html += '</div>';
				html += '<div class="card" style="margin-top:12px">';
				html += '<h3 style="font-size:15px;margin-bottom:8px">\u8fd0\u884c\u8bb0\u5f55</h3>';
				if (runs && runs.length) {
					html += runs.map(function(r) { return renderPlanRunCard(r, plan); }).join('');
				} else {
					html += '<div class="empty" style="padding:20px 0">\u6682\u65e0\u8fd0\u884c\u8bb0\u5f55</div>';
				}
				html += '</div>';
				return html;
			}

			function renderPlanDetailActions(plan) {
				if (!plan) return '';
				var html = '<button class="btn btn-sm" onclick="viewPlanJson(' + jsArg(plan.planId) + ')">\u67e5\u770b JSON</button>';
				html += '<button class="btn btn-primary btn-sm" onclick="startRun(\\x27' + plan.planId + '\\x27)">\u521b\u5efa\u8fd0\u884c</button>';
				html += '<button class="btn btn-danger btn-sm" onclick="deletePlan(\\x27' + plan.planId + '\\x27)">\u5220\u9664</button>';
				return html;
			}

			function renderDynamicPlanDesign(tasks) {
				var discTask = null, feTask = null;
				for (var i = 0; i < tasks.length; i++) {
					if (tasks[i].type === 'discovery') discTask = tasks[i];
					if (tasks[i].type === 'for_each') feTask = tasks[i];
				}
				var html = '<div class="plan-design-diagram" style="padding:8px">';
				html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
				html += '<span class="badge" style="background:rgba(37,99,235,0.15);color:#3b82f6;font-size:11px">discovery</span>';
				html += '<span style="font-size:13px">' + escapeHtml(discTask ? discTask.title || '' : '') + '</span>';
				if (discTask) html += renderDecomposerModeBadge(discTask);
				if (discTask && discTask.discovery) {
					html += '<span class="plan-chip" style="font-size:10px">output: ' + escapeHtml(discTask.discovery.outputKey || '') + '</span>';
				}
				html += '</div>';
				html += '<div style="margin-left:16px;color:var(--muted);font-size:12px">\u2193 \u8fd0\u884c\u65f6\u5c55\u5f00\u4e3a\u5b50\u4efb\u52a1</div>';
				html += '<div style="display:flex;align-items:center;gap:8px;margin-top:8px">';
				html += '<span class="badge" style="background:rgba(124,58,237,0.15);color:#7c3aed;font-size:11px">for_each</span>';
				html += '<span style="font-size:13px">' + escapeHtml(feTask ? feTask.title || '' : '') + '</span>';
				if (feTask) html += renderDecomposerModeBadge(feTask);
				if (feTask && feTask.forEach) {
					html += '<span class="plan-chip" style="font-size:10px">\u2190 ' + escapeHtml(feTask.forEach.itemsFrom || '') + '</span>';
				}
				html += '</div>';
				if (feTask && feTask.forEach && feTask.forEach.taskTemplate) {
					var tmpl = feTask.forEach.taskTemplate;
					html += '<details class="plan-task-details" style="margin-top:8px"><summary>\u5b50\u4efb\u52a1\u6a21\u677f</summary><div class="plan-task-detail-content">';
					html += '<p class="plan-task-detail-input" style="color:#7c3aed">\u6807\u9898: ' + escapeHtml(tmpl.title || '') + '</p>';
					html += renderDecomposerModeBadge(tmpl);
					if (tmpl.input && tmpl.input.text) html += '<p class="plan-task-detail-input">\u6307\u4ee4: ' + escapeHtml(tmpl.input.text) + '</p>';
					html += '</div></details>';
				}
				html += '</div>';
				return html;
			}

			function renderNormalPlanDesign(tasks) {
				if (!tasks || !tasks.length) return '<div style="color:var(--muted)">\u65e0\u4efb\u52a1</div>';
				var html = '<div style="padding:4px 0">';
				for (var i = 0; i < tasks.length; i++) {
					var t = tasks[i];
					html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-top:1px solid var(--border)">';
					html += '<span style="color:var(--muted);font-size:11px;min-width:24px">#' + (i + 1) + '</span>';
					html += '<span style="font-size:13px">' + escapeHtml(t.title || t.id || '') + '</span>';
					html += renderDecomposerModeBadge(t);
					var inputText = t.input && t.input.text ? t.input.text : '';
					var rules = t.acceptance && Array.isArray(t.acceptance.rules) ? t.acceptance.rules : [];
					var meta = [];
					if (inputText) meta.push(inputText.length + '\u5b57');
					if (rules.length) meta.push(rules.length + ' \u6761\u9a8c\u6536');
					if (meta.length) html += '<span class="plan-task-meta">' + meta.join(' / ') + '</span>';
					html += '</div>';
				}
				html += '</div>';
				return html;
			}

			function renderPlanRunCard(run, plan) {
				if (!run) return '';
				var prog = runProgressSummary(run);
				var isActive = isActiveRunStatus(run.status);
				var isTerminal = isTerminalRunStatus(run.status);
				var cardClass = 'card' + (isActive ? ' plan-card-active' : '');
				var html = '<div class="' + cardClass + '" data-run-id="' + escapeHtml(run.runId) + '" data-run-status="' + escapeHtml(run.status) + '"' + (run.startedAt ? ' data-started-at="' + escapeHtml(run.startedAt) + '"' : '') + ' style="margin-bottom:8px;cursor:pointer" onclick="togglePlanRunDetail(this, ' + jsArg(run.runId) + ')">';
				html += '<div style="display:flex;justify-content:space-between;align-items:center">';
				html += '<div style="display:flex;align-items:center;gap:6px"><span class="team-id-label" title="点击复制 Run ID" onclick="copyTeamIdToClipboard(event, ' + jsArg(run.runId) + ', this)">' + escapeHtml(run.runId) + '</span> <span class="run-badge">' + statusBadge(run.status) + '</span></div>';
				html += '<span class="run-elapsed" style="font-size:12px;color:var(--muted)">' + formatDuration(run.activeElapsedMs) + '</span>';
				html += '</div>';
				html += '<div class="run-progress" style="font-size:12px;color:var(--muted);margin-top:4px">任务进度：' + prog.done + '/' + prog.total + '</div>';
				if (isActive) {
					html += '<div class="progress-bar" style="margin-top:4px"><div class="progress-bar-fill" style="width:' + prog.pct + '%"></div></div>';
				}
				// Current task display
				var currentTaskTitle = '';
				if (run.currentTaskId && plan && plan.tasks) {
					var task = plan.tasks.find(function(t) { return t.id === run.currentTaskId; });
					currentTaskTitle = task ? task.title : run.currentTaskId;
				} else if (run.currentTaskId) {
					currentTaskTitle = run.currentTaskId;
				}
				html += currentTaskTitle
					? '<p class="run-current" style="font-size:12px;color:var(--muted);margin-top:4px">当前任务：' + escapeHtml(currentTaskTitle) + '</p>'
					: '<p class="run-current" style="display:none;font-size:12px;color:var(--muted);margin-top:4px"></p>';
				// Error display
				html += run.lastError
					? '<p class="run-error" style="font-size:12px;color:var(--fail);margin-top:4px">错误：' + escapeHtml(run.lastError) + '</p>'
					: '<p class="run-error" style="display:none;font-size:12px;color:var(--fail);margin-top:4px"></p>';
				// Action buttons
				html += '<div class="run-actions" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap" onclick="event.stopPropagation()">';
				if (run.status === 'running') {
					html += '<button class="btn btn-primary btn-sm" onclick="pauseRunWithConfirm(\\x27' + escapeHtml(run.runId) + '\\x27)">暂停</button>';
					html += '<button class="btn btn-danger btn-sm" onclick="cancelRunWithConfirm(\\x27' + escapeHtml(run.runId) + '\\x27)">取消</button>';
				}
				if (run.status === 'paused') {
					html += '<button class="btn btn-primary btn-sm" onclick="resumeRunWithConfirm(\\x27' + escapeHtml(run.runId) + '\\x27)">恢复</button>';
					html += '<button class="btn btn-danger btn-sm" onclick="cancelRunWithConfirm(\\x27' + escapeHtml(run.runId) + '\\x27)">取消</button>';
				}
				if (isTerminal) {
					html += renderRunActions(run);
				}
				html += '</div>';
				// Embedded detail container
				html += '<div id="run-detail-' + escapeHtml(run.runId) + '" class="run-detail" onclick="event.stopPropagation()"></div>';
				html += '</div>';
				return html;
			}

			function togglePlanRunDetail(el, runId) {
				_expandedRunIds[runId] = !_expandedRunIds[runId];
				var detailEl = findRunDetailElement(runId, el);
				if (!detailEl) return;
				if (!_expandedRunIds[runId]) {
					detailEl.style.display = "none";
					return;
				}
				// If detail is empty, populate it for the first time
				if (!detailEl.innerHTML || detailEl.style.display !== "block") {
					// Delegate to existing toggleRunDetail which fetches state and populates
					toggleRunDetail(runId, el);
				} else {
					detailEl.style.display = "block";
				}
			}


async function loadPlans() {
	var el = $('plans-list');
	if (!el.innerHTML.trim()) el.innerHTML = '<div class="loading"><div class="spinner"></div> 加载中...</div>';
	try {
		var plans = await api('/plans');
			if (!_latestRuns || !_latestRuns.length) {
				try { _latestRuns = await api('/runs'); } catch(e2) { _latestRuns = []; }
			}
		_latestPlans = plans; updateSummary(plans, _latestTeams, _latestRuns);
		if (!plans.length) { el.innerHTML = '<div class="empty plan-dashboard-empty">暂无计划。<span class="detail-toggle" onclick="createPlan()">新建计划</span> 开始。</div>'; return; }
		el.innerHTML = '<div class="plan-dashboard-grid">' + plans.map(function(p) { return renderPlanDashboardCard(p, _latestRuns); }).join('') + '</div>';
			subscribeActiveRuns(_latestRuns);
	} catch (e) {
		el.innerHTML = '<div class="empty" style="color:var(--fail)">加载失败：' + escapeHtml(e.message) + ' <span class="detail-toggle" onclick="loadPlans()">重试</span></div>';
	}
}

async function loadTeams() {
		var el = $('teams-list');
		if (!el.innerHTML.trim()) el.innerHTML = '<div class="loading"><div class="spinner"></div> 加载中...</div>';
		try {
			var teams = await api('/team-units');
			_latestTeams = teams; updateSummary(_latestPlans, teams, _latestRuns);
			if (!teams.length) { el.innerHTML = '<div class="empty">暂无预设团队。<span class="detail-toggle" onclick="openTeamUnitModal()">新建团队</span> 开始。</div>'; return; }
			var active = teams.filter(function(t) { return !t.archived; });
			var archived = teams.filter(function(t) { return t.archived; });
			function renderTeamCard(t, showActions) {
				return '<div class="card"><h3>' + escapeHtml(t.title) + (t.archived ? ' <span class="badge badge-muted">已归档</span>' : '') + '</h3>' +
					'<table><tr><td>执行 Agent</td><td>' + escapeHtml(profileName(t.workerProfileId)) + '</td></tr>' +
					'<tr><td>验收 Agent</td><td>' + escapeHtml(profileName(t.checkerProfileId)) + '</td></tr>' +
					'<tr><td>复盘 Agent</td><td>' + escapeHtml(profileName(t.watcherProfileId)) + '</td></tr>' +
					'<tr><td>汇总 Agent</td><td>' + escapeHtml(profileName(t.finalizerProfileId)) + '</td></tr>' +
					'<tr><td>任务拆分 Agent</td><td>' + escapeHtml(profileName(t.decomposerProfileId || t.workerProfileId)) + '</td></tr></table>' +
					(showActions ? '<div style="margin-top:8px;display:flex;gap:8px"><button class="btn btn-sm" style="background:var(--border);color:var(--text)" onclick="editTeamUnit(\\'' + t.teamUnitId + '\\')">编辑</button>' +
					'<button class="btn btn-sm btn-primary" onclick="archiveTeamUnit(\\'' + t.teamUnitId + '\\')">归档</button></div>' : '') +
					'</div>';
			}
			var html = '';
			if (active.length) html += active.map(function(t) { return renderTeamCard(t, true); }).join('');
			else html += '<div class="empty">暂无活跃团队。<span class="detail-toggle" onclick="openTeamUnitModal()">新建团队</span>。</div>';
			if (archived.length) html += '<details style="margin-top:16px"><summary style="cursor:pointer;color:var(--muted);font-size:13px">已归档（' + archived.length + '）</summary>' +
				archived.map(function(t) { return renderTeamCard(t, false); }).join('') + '</details>';
			el.innerHTML = html;
		} catch (e) {
			el.innerHTML = '<div class="empty" style="color:var(--fail)">加载失败：' + escapeHtml(e.message) + ' <span class="detail-toggle" onclick="loadTeams()">重试</span></div>';
		}
	}


async function loadRuns() {
	var el = $('runs-list');
	if (!el.innerHTML.trim()) el.innerHTML = '<div class="loading"><div class="spinner"></div> 加载中...</div>';
	try {
		var runs = await api('/runs');
		_latestRuns = runs; updateSummary(_latestPlans, _latestTeams, runs);
		var ACTIVE_STATUS = { queued: 1, running: 1, paused: 1 };
		runs.sort(function(a, b) { return (ACTIVE_STATUS[a.status] ? 0 : 1) - (ACTIVE_STATUS[b.status] ? 0 : 1); });
		if (!runs.length) { el.innerHTML = '<div class="empty">暂无运行记录。从计划页面 <span class="detail-toggle" onclick="showSection(&#39;plans&#39;)">创建运行</span>。</div>'; unsubscribeAllSSE(); return; }
		var planIds = [];
		runs.forEach(function(r) { if (r.planId && planIds.indexOf(r.planId) === -1) planIds.push(r.planId); });
		await Promise.all(planIds.map(async function(pid) {
			if (!_planCache[pid]) {
				var latestPlan = findLatestPlanById(pid);
				if (latestPlan) {
					_planCache[pid] = latestPlan;
				} else if (_latestPlans.length) {
					_planCache[pid] = buildFallbackPlan(pid, []);
				} else {
					try { _planCache[pid] = await api('/plans/' + pid); } catch (e) { /* ignore */ }
				}
			}
		}));
		el.innerHTML = runs.map(function(r) {
			var plan = _planCache[r.planId];
			var planTitle = plan ? plan.title : '';
			var total = r.summary.totalTasks;
			var done = r.summary.succeededTasks + r.summary.failedTasks + r.summary.cancelledTasks + (r.summary.skippedTasks || 0);
			var pct = total ? Math.round(done / total * 100) : 0;
			var summaryParts = [];
			if (r.summary.succeededTasks) summaryParts.push('成功 ' + r.summary.succeededTasks);
			if (r.summary.failedTasks) summaryParts.push('失败 ' + r.summary.failedTasks);
			if (r.summary.cancelledTasks) summaryParts.push('取消 ' + r.summary.cancelledTasks);
		if (r.summary.skippedTasks) summaryParts.push('跳过 ' + r.summary.skippedTasks);
			var summaryStr = summaryParts.length ? summaryParts.join(' / ') : '无完成';
			var errorHtml = r.lastError ? '<p class="run-error" style="font-size:12px;color:var(--fail);margin-top:4px">错误：' + escapeHtml(r.lastError) + '</p>' : '<p class="run-error" style="display:none;font-size:12px;color:var(--fail);margin-top:4px"></p>';
			var currentTaskTitle = '';
			if (r.currentTaskId && plan) {
				var task = plan.tasks.find(function(t) { return t.id === r.currentTaskId; });
				currentTaskTitle = task ? task.title : r.currentTaskId;
			} else if (r.currentTaskId) {
				currentTaskTitle = r.currentTaskId;
			}
			var currentTask = currentTaskTitle ? '<p class="run-current" style="font-size:12px;color:var(--muted)">当前任务：' + escapeHtml(currentTaskTitle) + '</p>' : '<p class="run-current" style="display:none;font-size:12px;color:var(--muted)"></p>';
			var timesHtml = '<p class="run-times" style="font-size:11px;color:var(--muted)"><span class="ts">创建：' + formatTimestamp(r.createdAt) + '</span>';
			if (r.startedAt) timesHtml += '<span class="ts">开始：' + formatTimestamp(r.startedAt) + '</span>';
			if (r.finishedAt) timesHtml += '<span class="ts">完成：' + formatTimestamp(r.finishedAt) + '</span>';
			timesHtml += '</p>';
			return '<div class="card" data-run-id="' + r.runId + '" data-run-status="' + r.status + '"' + (r.startedAt ? ' data-started-at="' + r.startedAt + '"' : '') + '>' +
				'<h3>' + (planTitle ? '<span class="plan-title">' + escapeHtml(planTitle) + '</span> ' : '') + '<span class="run-id">' + escapeHtml(r.runId.slice(0, 12)) + '...</span> <span class="run-badge">' + statusBadge(r.status) + '</span></h3>' +
				'<p class="run-progress" style="font-size:13px;color:var(--muted)">任务进度：' + done + '/' + total + '（' + summaryStr + '）</p>' +
				'<p class="run-elapsed" style="font-size:13px;color:var(--muted)">耗时：' + formatDuration(r.activeElapsedMs) + '</p>' +
				timesHtml +
				currentTask + errorHtml +
				'<div class="progress-bar"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div>' +
				'<div class="run-actions" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">' +
				renderRunActions(r) +
				'</div>' +
				'<div id="run-detail-' + r.runId + '" class="run-detail"></div>' +
				'</div>';
		}).join('');
		Object.keys(_expandedRunIds).forEach(function(runId) {
			if (!_expandedRunIds[runId]) return;
			var detailEl = null;
			var runCards = el.querySelectorAll('[data-run-id]');
			for (var i = 0; i < runCards.length; i++) {
				if (runCards[i].getAttribute('data-run-id') !== runId) continue;
				detailEl = runCards[i].querySelector('.run-detail');
				break;
			}
			if (!detailEl) return;
			detailEl.style.display = 'none';
			toggleRunDetail(runId, detailEl);
		});
		subscribeActiveRuns(runs);
	} catch (e) {
		el.innerHTML = '<div class="empty" style="color:var(--fail)">加载失败：' + escapeHtml(e.message) + ' <span class="detail-toggle" onclick="loadRuns()">重试</span></div>';
		unsubscribeAllSSE();
	}
}

function findRunDetailElement(runId, sourceEl) {
	if (sourceEl && sourceEl.closest) {
		var card = sourceEl.closest('[data-run-id]');
		if (card) {
			var scoped = card.querySelector('.run-detail');
			if (scoped && scoped.id === 'run-detail-' + runId) return scoped;
		}
	}
	var candidates = Array.prototype.slice.call(document.querySelectorAll('.run-detail')).filter(function(el) {
		return el.id === 'run-detail-' + runId;
	});
	if (!candidates.length) return null;
	for (var i = 0; i < candidates.length; i++) {
		var el = candidates[i];
		if (el.style.display === 'block' || (el.offsetParent !== null && el.closest('.section.active'))) return el;
	}
	return candidates[0];
}

async function toggleRunDetail(runId, sourceEl) {
	var detailEl = findRunDetailElement(runId, sourceEl);
	if (!detailEl) return;
	if (detailEl.style.display === 'block') {
		detailEl.style.display = 'none';
		_expandedRunIds[runId] = false;
		return;
	}
	_expandedRunIds[runId] = true;
	detailEl.innerHTML = '<div class="loading"><div class="spinner"></div> 加载中...</div>';
	detailEl.style.display = 'block';
	try {
		var state = await api('/runs/' + runId);
		if (state.planId && !_planCache[state.planId]) {
			var latestPlan = findLatestPlanById(state.planId);
			if (latestPlan) {
				_planCache[state.planId] = latestPlan;
			} else if (_latestPlans.length) {
				_planCache[state.planId] = buildFallbackPlanFromRunState(state);
			} else {
				try {
					_planCache[state.planId] = await api('/plans/' + state.planId);
				} catch (planError) {
					_planCache[state.planId] = buildFallbackPlanFromRunState(state);
				}
			}
		}
		var plan = _planCache[state.planId] || buildFallbackPlanFromRunState(state);
		if (!window._latestPlanForRun) window._latestPlanForRun = {};
		window._latestPlanForRun[runId] = plan;
		var attemptsMap = {};
		try {
			var planTaskIds = plan.tasks ? plan.tasks.map(function(t) { return t.id; }) : [];
				var generatedIds = Object.keys(state.taskStates || {}).filter(function(id) { return planTaskIds.indexOf(id) === -1; });
				var taskIds = planTaskIds.concat(generatedIds);
			await Promise.all(taskIds.map(async function(tid) {
				var res = await api('/runs/' + runId + '/tasks/' + tid + '/attempts');
				attemptsMap[tid] = res.attempts || [];
			}));
		} catch (e) { /* ignore */ }
		if (!window._latestAttemptsForRun) window._latestAttemptsForRun = {};
		window._latestAttemptsForRun[runId] = attemptsMap;
		if (!window._latestRunTaskDefinitions) window._latestRunTaskDefinitions = {};
		window._latestRunTaskDefinitions[runId] = Array.isArray(state.taskDefinitions) ? state.taskDefinitions : [];
		if (!window._latestRunStateForRun) window._latestRunStateForRun = {};
		window._latestRunStateForRun[runId] = state;
		detailEl.innerHTML = renderRunDetailShell(runId, state, plan, attemptsMap);
	} catch (e) {
		detailEl.innerHTML = '<p style="color:var(--fail);font-size:13px">加载失败：' + escapeHtml(e.message) + '</p>';
	}
}

async function refreshRunDetailInPlace(runId, sourceEl, scrollSnapshot) {
		var detailEl = findRunDetailElement(runId, sourceEl);
		if (!detailEl || detailEl.style.display !== 'block') return;
		var snapshot = scrollSnapshot || captureRunDetailScrollSnapshot(runId, sourceEl, detailEl);
		try {
			var state = await api('/runs/' + runId);
			if (state.planId && !_planCache[state.planId]) {
				var latestPlan = findLatestPlanById(state.planId);
				if (latestPlan) {
					_planCache[state.planId] = latestPlan;
				} else if (_latestPlans.length) {
					_planCache[state.planId] = buildFallbackPlanFromRunState(state);
				} else {
					try {
						_planCache[state.planId] = await api('/plans/' + state.planId);
					} catch (planError) {
						_planCache[state.planId] = buildFallbackPlanFromRunState(state);
					}
				}
			}
			var plan = _planCache[state.planId] || buildFallbackPlanFromRunState(state);
			if (!window._latestPlanForRun) window._latestPlanForRun = {};
			window._latestPlanForRun[runId] = plan;
			var attemptsMap = {};
			try {
				var planTaskIds = plan.tasks ? plan.tasks.map(function(t) { return t.id; }) : [];
					var generatedIds = Object.keys(state.taskStates || {}).filter(function(id) { return planTaskIds.indexOf(id) === -1; });
					var taskIds = planTaskIds.concat(generatedIds);
				await Promise.all(taskIds.map(async function(tid) {
					var res = await api('/runs/' + runId + '/tasks/' + tid + '/attempts');
					attemptsMap[tid] = res.attempts || [];
				}));
			} catch (e) { /* ignore */ }
			if (!window._latestAttemptsForRun) window._latestAttemptsForRun = {};
			window._latestAttemptsForRun[runId] = attemptsMap;
			if (!window._latestRunTaskDefinitions) window._latestRunTaskDefinitions = {};
			window._latestRunTaskDefinitions[runId] = Array.isArray(state.taskDefinitions) ? state.taskDefinitions : [];
			if (!window._latestRunStateForRun) window._latestRunStateForRun = {};
			window._latestRunStateForRun[runId] = state;
			detailEl.innerHTML = renderRunDetailShell(runId, state, plan, attemptsMap);
			requestAnimationFrame(function() {
				restoreRunDetailScrollSnapshot(detailEl, snapshot);
			});
		} catch (e) {
			detailEl.innerHTML = '<p style="color:var(--fail);font-size:13px">加载失败：' + escapeHtml(e.message) + '</p>';
		}
	}

${TEAM_RUN_DETAIL_SCROLL_BEHAVIOR_SCRIPT}

	function buildFallbackPlanFromRunState(state) {
	var taskDefinitions = Array.isArray(state.taskDefinitions) ? state.taskDefinitions : [];
	var tasks = taskDefinitions.length
		? taskDefinitions
		: Object.keys(state.taskStates || {}).map(function(taskId) {
			return {
				id: taskId,
				title: taskId,
				input: { text: '' },
				acceptance: { rules: [] },
			};
		});
	return buildFallbackPlan(state.planId, tasks);
}

function buildFallbackPlan(planId, tasks) {
	return {
		planId: planId || 'missing-plan',
		title: planId ? '缺失计划 ' + planId : '缺失计划',
		goal: { text: '原计划定义不可用，当前详情按 run 状态展示。' },
		tasks: Array.isArray(tasks) ? tasks : [],
	};
}

function collectRunTaskDefinitions(state, plan) {
	var defs = [];
	if (Array.isArray(state.taskDefinitions)) defs = defs.concat(state.taskDefinitions);
	if (!defs.length && Array.isArray(state.generatedTasks)) defs = defs.concat(state.generatedTasks);
	if (Array.isArray(state.tasks)) defs = defs.concat(state.tasks.filter(function(t) { return t && t.generated; }));
	return defs;
}

function getMindmapChildrenByParent(planTasks, generatedDefs, taskStates) {
	var planIdSet = {};
	planTasks.forEach(function(t) { planIdSet[t.id] = true; });
	var defById = {};
	generatedDefs.forEach(function(d) { if (d && d.id) defById[d.id] = d; });
	var assigned = {};
	var byParent = {};
	var prefixFallbackIds = [];

	function addChild(pid, cid, isPrefixFallback) {
		if (!planIdSet[pid]) return false;
		if (!byParent[pid]) byParent[pid] = [];
		if (byParent[pid].indexOf(cid) === -1) byParent[pid].push(cid);
		assigned[cid] = true;
		if (isPrefixFallback) prefixFallbackIds.push(cid);
		return true;
	}

	// Priority 1: explicit parentTaskId on generated defs
	generatedDefs.forEach(function(d) {
		if (!d || !d.id) return;
		if (planIdSet[d.id]) return;
		if (d.parentTaskId) addChild(d.parentTaskId, d.id, false);
	});

	// Priority 2: taskStates with defs that have parentTaskId (missed by priority 1)
	Object.keys(taskStates || {}).forEach(function(id) {
		if (planIdSet[id] || assigned[id]) return;
		var def = defById[id];
		if (def && def.parentTaskId) addChild(def.parentTaskId, id, false);
	});

	// Priority 3: sourceItemId — attach if exactly one for_each parent exists
	var forEachParents = planTasks.filter(function(t) { return t.type === 'for_each' || t.forEach; });
	Object.keys(taskStates || {}).forEach(function(id) {
		if (planIdSet[id] || assigned[id]) return;
		var def = defById[id];
		if (!def || !def.sourceItemId) return;
		if (forEachParents.length === 1) addChild(forEachParents[0].id, id, false);
	});

	// Priority 4: id prefix fallback
	Object.keys(taskStates || {}).forEach(function(id) {
		if (planIdSet[id] || assigned[id]) return;
		for (var i = 0; i < planTasks.length; i++) {
			if (id.indexOf(planTasks[i].id + '__') === 0) {
				addChild(planTasks[i].id, id, true);
				break;
			}
		}
	});

	// Orphan ids: non-plan, unassigned
	var orphanIds = Object.keys(taskStates || {}).filter(function(id) {
		return !planIdSet[id] && !assigned[id];
	});

	return { byParent: byParent, orphanIds: orphanIds, prefixFallbackIds: prefixFallbackIds };
}

function describeMindmapNodeType(task, isGenerated) {
	if (!task) return '任务';
	if (task.type === 'discovery') return '发现';
	if (task.type === 'for_each') return '逐项处理';
	if (isGenerated) {
		if (task.generatedSource === 'for_each') return '动态子任务';
		if (task.generatedSource === 'decomposition') return '拆分子任务';
		return '生成任务';
	}
	return '任务';
}

function buildMindmapNodes(state, plan, attemptsMap) {
	var planTasks = (plan && plan.tasks) ? plan.tasks : [];
	var taskStates = state.taskStates || {};
	var generatedDefs = collectRunTaskDefinitions(state, plan);
	var taskById = {};
	planTasks.forEach(function(t) { taskById[t.id] = t; });
	generatedDefs.forEach(function(t) { if (t && t.id) taskById[t.id] = t; });
	var result = getMindmapChildrenByParent(planTasks, generatedDefs, taskStates);
	var childrenByParent = result.byParent;
	var orphanIds = result.orphanIds;
	var prefixFallbackSet = {};
	result.prefixFallbackIds.forEach(function(id) { prefixFallbackSet[id] = true; });
	var s = state.summary || {};
	var rootNode = {
		id: state.runId || '',
		title: 'Run ' + (state.runId || '').slice(0, 12),
		status: state.status || 'queued',
		nodeType: 'root',
		summary: '总 ' + (s.totalTasks || 0) + ' | 成功 ' + (s.succeededTasks || 0) + ' | 失败 ' + (s.failedTasks || 0) + ' | 跳过 ' + (s.skippedTasks || 0),
		children: []
	};
	var rendered = {};
	planTasks.forEach(function(task) {
		var ts = taskStates[task.id];
		var childIds = childrenByParent[task.id] || [];
		var errorLine = '';
		if (ts && ts.errorSummary) errorLine = ts.errorSummary.split(/\\r?\\n/)[0];
		var taskNode = {
			id: task.id,
			title: task.title || task.id,
			status: ts ? ts.status : 'pending',
			nodeType: describeMindmapNodeType(task, false),
			attemptCount: ts ? ts.attemptCount : 0,
			progress: ts ? ts.progress : null,
			activeAttemptId: ts ? ts.activeAttemptId : null,
			errorSummary: errorLine,
			resultRef: ts ? ts.resultRef : null,
			manualDisposition: ts ? ts.manualDisposition : null,
			parentTaskId: task.parentTaskId || null,
			sourceItemId: task.sourceItemId || null,
			generated: false,
			children: []
		};
		childIds.forEach(function(cid) {
			rendered[cid] = true;
			var childDef = taskById[cid] || null;
			var childTs = taskStates[cid];
			var childErrorLine = '';
			if (childTs && childTs.errorSummary) childErrorLine = childTs.errorSummary.split(/\\r?\\n/)[0];
			var isPrefixFallback = prefixFallbackSet[cid] || false;
			taskNode.children.push({
				id: cid,
				title: childDef ? (childDef.title || cid) : cid,
				status: childTs ? childTs.status : 'pending',
				nodeType: describeMindmapNodeType(childDef, true),
				attemptCount: childTs ? childTs.attemptCount : 0,
				progress: childTs ? childTs.progress : null,
				activeAttemptId: childTs ? childTs.activeAttemptId : null,
				errorSummary: childErrorLine,
				resultRef: childTs ? childTs.resultRef : null,
				manualDisposition: childTs ? childTs.manualDisposition : null,
				parentTaskId: childDef ? (childDef.parentTaskId || task.id) : task.id,
				sourceItemId: childDef ? (childDef.sourceItemId || null) : null,
				generated: true,
				fallback: isPrefixFallback || !childDef,
				children: []
			});
		});
		rendered[task.id] = true;
		rootNode.children.push(taskNode);
	});

	// Orphan group: unassigned generated/orphan task states
	if (orphanIds.length) {
		var orphanChildren = [];
		orphanIds.forEach(function(oid) {
			rendered[oid] = true;
			var def = taskById[oid] || null;
			var ts = taskStates[oid];
			var errLine = '';
			if (ts && ts.errorSummary) errLine = ts.errorSummary.split(/\\r?\\n/)[0];
			orphanChildren.push({
				id: oid,
				title: def ? (def.title || oid) : oid,
				status: ts ? ts.status : 'pending',
				nodeType: describeMindmapNodeType(def, true),
				attemptCount: ts ? ts.attemptCount : 0,
				progress: ts ? ts.progress : null,
				activeAttemptId: ts ? ts.activeAttemptId : null,
				errorSummary: errLine,
				resultRef: ts ? ts.resultRef : null,
				manualDisposition: ts ? ts.manualDisposition : null,
				generated: true,
				fallback: true,
				children: []
			});
		});
		rootNode.children.push({
			id: '__orphan_generated__',
			title: '未归属子任务',
			status: 'orphan-group',
			nodeType: 'orphan-group',
			generated: true,
			fallback: true,
			children: orphanChildren
		});
	}

	return rootNode;
}
function renderMindmapNode(node, depth, runId, attemptsMap, runStatus) {
	var MINDMAP_GROUP_LIMIT = 6;
	var cls = depth === 0 ? 'mindmap-root-node' : 'mindmap-task-node';
	var escapedTitle = escapeHtml(node.title || '');
	var escapedStatus = escapeHtml(node.status || 'pending');
	var escapedType = escapeHtml(node.nodeType || '任务');
	var expanded = depth === 0 ? false : isMindmapNodeExpanded(runId, node.id, node.status);
	var html = '<div class="' + cls + (expanded ? ' mindmap-node-expanded' : '') + '" data-task-id="' + escapeHtml(node.id) + '" data-node-status="' + escapedStatus + '" data-node-type="' + escapedType + '" style="margin-left:' + (depth * 20) + 'px">';
	if (depth > 0) {
		html += '<button class="mindmap-node-toggle" onclick="event.stopPropagation();toggleMindmapNode(' + jsArg(runId) + ',' + jsArg(node.id) + ',' + jsArg(node.status) + ',this)">';
	} else {
		html += '<div>';
	}
	html += '<span style="font-weight:600">' + escapedTitle + '</span>';
	html += '<span class="badge" style="font-size:10px">' + escapedType + '</span>';
	html += statusBadge(escapedStatus);
	if (node.attemptCount > 0) html += '<span style="font-size:11px;color:var(--muted)">x' + node.attemptCount + '</span>';
	if (depth > 0) {
		html += '<span style="font-size:11px;color:var(--muted)">' + (expanded ? '▼' : '▶') + '</span>';
		html += '</button>';
	} else {
		html += '</div>';
	}
	if (node.errorSummary) {
		html += '<div class="mindmap-node-error">' + escapeHtml(node.errorSummary) + '</div>';
	}
	if (node.summary) {
		html += '<div class="mindmap-node-summary">' + escapeHtml(node.summary) + '</div>';
	}
	if (expanded && depth > 0) {
		html += '<div class="mindmap-node-details">';
		var meta = [];
		if (node.generated) meta.push('generated');
		if (node.parentTaskId) meta.push('parent: ' + escapeHtml(node.parentTaskId.slice(0, 12)) + '...');
		if (node.sourceItemId) meta.push('item: ' + escapeHtml(node.sourceItemId));
		if (meta.length) html += '<div style="color:var(--muted);margin-bottom:4px">' + meta.join(' · ') + '</div>';
		if (node.progress) {
			html += '<div style="margin-bottom:4px"><span class="phase-label ' + phaseColor(node.progress.phase) + '">' + escapeHtml(phaseLabel(node.progress.phase)) + '</span>' + (node.progress.message ? ' ' + escapeHtml(node.progress.message) : '') + '</div>';
		}
		if (node.activeAttemptId) {
			html += '<div style="color:var(--muted);margin-bottom:2px">activeAttemptId: ' + escapeHtml(node.activeAttemptId.slice(0, 12)) + '...</div>';
		}
		if (node.resultRef) {
			html += '<div style="color:var(--success);margin-bottom:2px">resultRef: ' + escapeHtml(node.resultRef) + '</div>';
		}
		if (runId && attemptsMap && attemptsMap[node.id]) {
			var attempts = attemptsMap[node.id];
			attempts.forEach(function(a) {
				var files = Array.isArray(a.files) ? a.files : [];
				if (files.length) {
					html += '<div class="file-chips" style="margin-top:2px">';
					files.forEach(function(f) {
						html += '<button class="file-chip" onclick="event.stopPropagation();viewAttemptFile(' + jsArg(runId) + ',' + jsArg(node.id) + ',' + jsArg(a.attemptId) + ',' + jsArg(f) + ')">' + escapeHtml(f) + '</button>';
					});
					html += '</div>';
				}
				if (a.worker && a.worker.length) {
					a.worker.forEach(function(w) {
						if (w.runtimeContext) html += renderRuntimeContext('worker', w.runtimeContext);
					});
				}
			});
		}
			// Mindmap disposition controls for terminal runs
			(function() {
			var TERMINAL_RUN = { completed: 1, completed_with_failures: 1, failed: 1, cancelled: 1 };
			if (!TERMINAL_RUN[runStatus]) return;
			if (node.nodeType === 'root' || node.nodeType === 'orphan-group') return;
			var d = node.manualDisposition || 'default';
			var dLabel = d === 'skip' ? '已设跳过' : d === 'force_rerun' ? '已设强制重跑' : '';
			var dBadge = dLabel ? ' <span class="badge badge-warn" style="font-size:10px;margin-left:2px">' + dLabel + '</span>' : '';
			html += '<div class="task-disposition" style="margin-top:4px">' + dBadge +
					'<button class="btn btn-sm" style="font-size:10px;padding:1px 5px;margin-left:4px" onclick="event.stopPropagation();setTaskDisposition(' + jsArg(runId) + ',' + jsArg(node.id) + ',' + jsArg('skip') + ',this)">跳过</button>' +
					'<button class="btn btn-sm" style="font-size:10px;padding:1px 5px;margin-left:2px" onclick="event.stopPropagation();setTaskDisposition(' + jsArg(runId) + ',' + jsArg(node.id) + ',' + jsArg('force_rerun') + ',this)">强制重跑</button>' +
					(d !== 'default' ? '<button class="btn btn-sm" style="font-size:10px;padding:1px 5px;margin-left:2px" onclick="event.stopPropagation();setTaskDisposition(' + jsArg(runId) + ',' + jsArg(node.id) + ',' + jsArg('default') + ',this)">恢复默认</button>' : '') +
					'</div>';
		})();
		html += '</div>';
	}
	if (!expanded && depth > 0 && node.sourceItemId) {
		html += '<div class="mindmap-compact-meta">sourceItemId: ' + escapeHtml(node.sourceItemId) + '</div>';
	}
	if (!expanded && node.fallback) {
		html += '<div class="mindmap-compact-warn">fallback</div>';
	}
	// Compact disposition badge (non-expanded view, terminal run)
	if (!expanded && depth > 0 && node.nodeType !== 'root' && node.nodeType !== 'orphan-group') {
		(function() {
			var TERMINAL_RUN = { completed: 1, completed_with_failures: 1, failed: 1, cancelled: 1 };
			if (!TERMINAL_RUN[runStatus]) return;
			var d = node.manualDisposition || 'default';
			if (d === 'skip') html += '<span class="badge badge-warn" style="font-size:10px;margin-left:2px">已设跳过</span>';
			if (d === 'force_rerun') html += '<span class="badge badge-warn" style="font-size:10px;margin-left:2px">已设强制重跑</span>';
		})();
	}
	html += '</div>';
	if (node.children && node.children.length) {
		var totalChildren = node.children.length;
		var groupExpanded = isMindmapGroupExpanded(runId, node.id);
		var visibleChildren = totalChildren <= MINDMAP_GROUP_LIMIT || groupExpanded ? totalChildren : MINDMAP_GROUP_LIMIT;
		html += '<div class="mindmap-children" style="margin-left:' + (depth * 20) + 'px">';
		for (var i = 0; i < visibleChildren; i++) {
			html += renderMindmapNode(node.children[i], depth + 1, runId, attemptsMap, runStatus);
		}
		html += '</div>';
		if (totalChildren > MINDMAP_GROUP_LIMIT) {
			html += '<div style="margin-left:' + ((depth + 1) * 20) + 'px">';
			if (groupExpanded) {
				html += '<button class="mindmap-group-toggle" onclick="event.stopPropagation();toggleMindmapGroup(' + jsArg(runId) + ',' + jsArg(node.id) + ',this)">收起</button>';
			} else {
				html += '<button class="mindmap-group-toggle" onclick="event.stopPropagation();toggleMindmapGroup(' + jsArg(runId) + ',' + jsArg(node.id) + ',this)">展开全部 ' + totalChildren + ' 个</button>';
			}
			html += '</div>';
		}
	}
	return html;
}

function renderTeamMindmap(runId, state, plan, attemptsMap) {
	var root = buildMindmapNodes(state, plan, attemptsMap);
	return '<div class="team-mindmap" data-run-detail-view="mindmap"><div class="mindmap-canvas">' +
		renderMindmapNode(root, 0, runId, attemptsMap, state.status) +
		'</div></div>';
}


function renderRunDetailShell(runId, state, plan, attemptsMap) {
	var currentView = getRunDetailView(runId);
	var mindmapActive = currentView === 'mindmap' ? ' active' : '';
	var detailActive = currentView === 'detail' ? ' active' : '';
	var switchHtml = '<div class="run-detail-view-toggle mindmap-view-toggle">' +
		'<button class="run-detail-view-btn mindmap-view-toggle-btn' + mindmapActive + '" data-view="mindmap" onclick="switchRunDetailView(' + jsArg(runId) + ',' + jsArg('mindmap') + ',this)">脑图</button>' +
		'<button class="run-detail-view-btn mindmap-view-toggle-btn' + detailActive + '" data-view="detail" onclick="switchRunDetailView(' + jsArg(runId) + ',' + jsArg('detail') + ',this)">详情</button>' +
		'</div>';
	var contentHtml = currentView === 'detail'
		? '<div data-run-detail-view="detail">' + renderTaskDetail(state, plan, attemptsMap) + '</div>'
		: renderTeamMindmap(runId, state, plan, attemptsMap);
	return switchHtml + contentHtml;
}

window.switchRunDetailView = function(runId, view, sourceEl) {
	setRunDetailView(runId, view);
	var detailEl = findRunDetailElement(runId, sourceEl);
	if (!detailEl) return;
	var plan2 = window._latestPlanForRun ? window._latestPlanForRun[runId] : null;
	var attempts = window._latestAttemptsForRun ? window._latestAttemptsForRun[runId] : null;
	if (!plan2) return;
	var state = window._latestRunStateForRun ? window._latestRunStateForRun[runId] : null;
	if (!state) state = { runId: runId, taskStates: {} };
	detailEl.innerHTML = renderRunDetailShell(runId, state, plan2, attempts);
};

function renderTaskDetail(state, plan, attemptsMap) {
	if (!plan || !plan.tasks || !plan.tasks.length) return '<p style="color:var(--muted);font-size:13px">无任务数据。</p>';
	var finalizerRuntimeHtml = state.finalizerRuntimeContext ? '<div class="finalizer-runtime" style="margin-bottom:8px">' + renderRuntimeContext('finalizer', state.finalizerRuntimeContext) + '</div>' : '';
	var generatedTasks = [];
	if (Array.isArray(state.taskDefinitions)) generatedTasks = generatedTasks.concat(state.taskDefinitions);
	if (!generatedTasks.length && Array.isArray(state.generatedTasks)) generatedTasks = generatedTasks.concat(state.generatedTasks);
	if (Array.isArray(state.tasks)) generatedTasks = generatedTasks.concat(state.tasks.filter(function(t) { return t && t.generated; }));
	var planIdSet = {};
	var taskById = {};
	plan.tasks.forEach(function(t) { planIdSet[t.id] = true; taskById[t.id] = t; });
	generatedTasks.forEach(function(t) { if (t && t.id) taskById[t.id] = t; });
	var childrenByParent = {};
	generatedTasks.forEach(function(t) {
		if (!t || !t.id || !t.parentTaskId) return;
		if (!childrenByParent[t.parentTaskId]) childrenByParent[t.parentTaskId] = [];
		if (childrenByParent[t.parentTaskId].indexOf(t.id) === -1) childrenByParent[t.parentTaskId].push(t.id);
	});
	Object.keys(state.taskStates || {}).forEach(function(id) {
		if (planIdSet[id]) return;
		plan.tasks.forEach(function(parent) {
			if (id.indexOf(parent.id + '__') === 0) {
				if (!childrenByParent[parent.id]) childrenByParent[parent.id] = [];
				if (childrenByParent[parent.id].indexOf(id) === -1) childrenByParent[parent.id].push(id);
				if (!taskById[id]) taskById[id] = { id: id, title: id, parentTaskId: parent.id, generated: true };
			}
		});
	});
	var renderedTaskIds = {};

	function renderStateRow(task, opts) {
		var ts = state.taskStates[task.id];
		var rowClass = opts && opts.rowClass ? ' class="' + opts.rowClass + '"' : '';
		var titlePrefix = opts && opts.titlePrefix ? opts.titlePrefix : '';
		var escapedTaskTitle = task.title ? escapeHtml(task.title) : escapeHtml(task.id || '');
		if (!ts) return '<tr' + rowClass + ' data-task-id="' + escapeHtml(task.id) + '"><td>' + titlePrefix + escapedTaskTitle + '</td><td colspan="2">待执行</td></tr>';
		var phaseHtml = ts.progress ? '<span class="phase-label ' + phaseColor(ts.progress.phase) + '">' + escapeHtml(phaseLabel(ts.progress.phase)) + '</span>' : '';
		var msgStr = ts.progress ? escapeHtml(ts.progress.message) : '';
		var detailParts = [];
		if (ts.attemptCount > 0) detailParts.push('尝试 ' + ts.attemptCount + ' 次');
		if (ts.activeAttemptId) detailParts.push('尝试ID: ' + escapeHtml(ts.activeAttemptId.slice(0, 12)) + '...');
		if (ts.resultRef) detailParts.push('<span style="color:var(--success)">结果: ' + escapeHtml(ts.resultRef) + '</span>');
		if (ts.errorSummary) detailParts.push('<span class="attempt-error">错误: ' + escapeHtml(ts.errorSummary) + '</span>');
		var attemptsHtml = '';
		var attempts = attemptsMap && attemptsMap[task.id];
		if (attempts && attempts.length > 0) {
			attemptsHtml = attempts.map(function(a) {
				var statusColor = a.status === 'succeeded' ? 'var(--success)' : a.status === 'failed' ? 'var(--fail)' : 'var(--muted)';
				var files = Array.isArray(a.files) ? a.files : [];
				var filesHtml = files.map(function(f) {
					return '<span class="file-chip" onclick="viewAttemptFile(' + jsArg(state.runId) + ',' + jsArg(task.id) + ',' + jsArg(a.attemptId) + ',' + jsArg(f) + ')">' + escapeHtml(f) + '</span>';
				}).join('');
				var lcLines = [];
				if (a.phase) lcLines.push('阶段: ' + escapeHtml(phaseLabel(a.phase)));
				if (a.worker && a.worker.length) lcLines.push('worker: ' + a.worker.length + ' 次输出');
				if (a.checker && a.checker.length) {
					var verdicts = a.checker.map(function(c) { return escapeHtml(c.verdict); }).join(' → ');
					lcLines.push('checker: ' + verdicts);
				}
				if (a.watcher) lcLines.push('watcher: ' + escapeHtml(a.watcher.decision));
				if (a.resultRef) lcLines.push('结果: ' + escapeHtml(a.resultRef));
				if (a.errorSummary) lcLines.push('<span class="attempt-error">错误: ' + escapeHtml(a.errorSummary) + '</span>');
				var lcHtml = lcLines.length ? '<div style="font-size:11px;color:var(--muted);margin-top:2px">' + lcLines.join(' / ') + '</div>' : '';
				var runtimeHtml = '';
				if (a.worker && a.worker.length) runtimeHtml += a.worker.map(function(w) { return renderRuntimeContext('worker', w.runtimeContext); }).join('');
				if (a.checker && a.checker.length) runtimeHtml += a.checker.map(function(c) { return renderRuntimeContext('checker', c.runtimeContext); }).join('');
				if (a.watcher) runtimeHtml += renderRuntimeContext('watcher', a.watcher.runtimeContext);
				return '<div class="attempt-card">' +
					'<span style="color:' + statusColor + '">' + escapeHtml(a.status) + '</span> ' +
					escapeHtml(a.attemptId.slice(0, 12)) + '... ' +
					'<span class="ts">' + formatTimestamp(a.createdAt) + '</span>' +
					lcHtml +
					runtimeHtml +
					(files.length > 0 ? '<div class="file-chips">' + filesHtml + '</div>' : '') +
					'</div>';
			}).join('');
		}
		renderedTaskIds[task.id] = true;
		return '<tr' + rowClass + ' data-task-id="' + escapeHtml(task.id) + '">' +
			'<td>' + titlePrefix + escapedTaskTitle + '</td>' +
			'<td>' + statusBadge(ts.status) + '<br/>' + phaseHtml + '</td>' +
			'<td style="font-size:12px">' +
			(msgStr ? '<div style="color:var(--muted)">' + msgStr + '</div>' : '') +
			(detailParts.length ? '<div>' + detailParts.join(' / ') + '</div>' : '') +
			attemptsHtml +
			(function() {
				var TERMINAL_RUN = { completed: 1, completed_with_failures: 1, failed: 1, cancelled: 1 };
				if (!TERMINAL_RUN[state.status]) return '';
				var d = ts.manualDisposition || 'default';
				var dLabel = d === 'skip' ? '已设跳过' : d === 'force_rerun' ? '已设强制重跑' : '';
				var dBadge = dLabel ? '<span class="badge badge-warn" style="margin-left:4px">' + dLabel + '</span>' : '';
				var safeId = escapeHtml(state.runId);
				var safeTaskId = escapeHtml(task.id);
				return '<div class="task-disposition">' + dBadge +
					'<button class="btn btn-sm" style="font-size:11px;padding:2px 6px;margin-left:4px" onclick="setTaskDisposition(' + jsArg(state.runId) + ',' + jsArg(task.id) + ',' + jsArg('skip') + ',this)">跳过</button>' +
					'<button class="btn btn-sm" style="font-size:11px;padding:2px 6px;margin-left:2px" onclick="setTaskDisposition(' + jsArg(state.runId) + ',' + jsArg(task.id) + ',' + jsArg('force_rerun') + ',this)">强制重跑</button>' +
					'<button class="btn btn-sm" style="font-size:11px;padding:2px 6px;margin-left:2px" onclick="setTaskDisposition(' + jsArg(state.runId) + ',' + jsArg(task.id) + ',' + jsArg('default') + ',this)">恢复默认</button>' +
					'</div>';
			})() +
			'</td></tr>';
	}

	function childSourceFor(parent, childIds) {
		if (parent && parent.type === 'for_each') return 'for_each';
		for (var i = 0; i < childIds.length; i++) {
			var child = taskById[childIds[i]];
			if (child && child.generatedSource) return child.generatedSource;
		}
		if (taskDecomposerMode(parent) !== 'none') return 'decomposition';
		return 'unknown';
	}

	function childGroupLabel(parent, childIds) {
		var source = childSourceFor(parent, childIds);
		if (source === 'for_each') return '动态子任务';
		if (source === 'decomposition') return '拆分子任务';
		return '子任务';
	}

	var rows = plan.tasks.map(function(task) {
		var childIds = childrenByParent[task.id] || [];
		var childSource = childSourceFor(task, childIds);
		var parentClass = childIds.length && childSource === 'decomposition' ? 'decomposed-parent' : '';
		var parentPrefix = parentClass ? '<span class="plan-chip" style="margin-right:6px">拆分容器</span>' : '';
		var html = renderStateRow(task, { rowClass: parentClass, titlePrefix: parentPrefix });
		if (childIds.length) {
			html += '<tr class="' + (childSource === 'for_each' ? 'dynamic-child-group' : childSource === 'decomposition' ? 'decomposed-child-group' : 'child-group') + '"><td colspan="3" style="padding:6px 8px 4px 22px;font-weight:600;color:var(--muted);font-size:12px;border-top:1px solid var(--border)">' + childGroupLabel(task, childIds) + '</td></tr>';
			childIds.forEach(function(cid) {
				var childTask = taskById[cid] || { id: cid, title: cid, parentTaskId: task.id, generated: true };
				var childRowClass = childSource === 'for_each' ? 'dynamic-child' : childSource === 'decomposition' ? 'decomposed-child' : 'child-task';
				html += renderStateRow(childTask, { rowClass: childRowClass, titlePrefix: '<span style="color:var(--muted);margin-right:6px">↳</span>' });
			});
		}
		return html;
	}).join('');

	var orphanIds = Object.keys(state.taskStates || {}).filter(function(id) { return !planIdSet[id] && !renderedTaskIds[id]; });
	if (orphanIds.length) {
		rows += '<tr><td colspan="3" style="padding:6px 8px;font-weight:600;color:var(--muted);font-size:12px;border-top:1px solid var(--border)">子任务</td></tr>';
		orphanIds.forEach(function(cid) {
			rows += renderStateRow(taskById[cid] || { id: cid, title: cid }, {});
		});
	}

	return finalizerRuntimeHtml + '<table class="task-table">' +
		'<tr><th>任务</th><th>状态</th><th>详情</th></tr>' +
		rows +
		'</table>';
}

async function editTeamUnit(id) {
	var teams = await api('/team-units');
	var unit = teams.find(function(t) { return t.teamUnitId === id; });
	if (unit) openTeamUnitModal(unit);
}

async function archiveTeamUnit(id) {
	var ok = await confirmAction({ message: '确认归档此预设团队？归档后不可用于新运行。', confirmText: '归档', danger: true });
	if (!ok) return;
	try {
		await api('/team-units/' + id + '/archive', { method: 'POST' });
		showSuccess('已归档');
	} catch (e) { showError(e.message); }
	loadTeams();
}

async function createPlan() {
	var teams;
	try { teams = await api('/team-units'); } catch (e) { showError(e.message); return; }
	var active = teams.filter(function(t) { return !t.archived; });
	if (!active.length) { showError('没有可用的预设团队。请先在预设团队中创建。'); return; }
	var sel = $('plan-teamunit');
	if (!sel) return;
	sel.innerHTML = '';
	for (var i = 0; i < active.length; i++) {
		var opt = document.createElement('option');
		opt.value = active[i].teamUnitId;
		opt.textContent = active[i].title;
		sel.appendChild(opt);
	}
	$('plan-title').value = '';
	$('plan-goal').value = '';
	$('plan-mode').value = 'normal';
	$('plan-task-title').value = '任务1';
	$('plan-task-text').value = '';
	$('plan-acceptance').value = '完成目标';
	$('plan-output-contract').value = '中文汇总';
	$('plan-disc-title').value = '发现条目';
	$('plan-disc-instruction').value = '';
	$('plan-disc-output-key').value = 'items';
	$('plan-disc-acceptance').value = '';
	$('plan-child-title').value = '处理 {{item.title}}';
	$('plan-child-instruction').value = '';
	$('plan-child-acceptance').value = '';
	onPlanModeChange();
	$('plan-preview-wrap').style.display = 'none';
	$('plan-modal').classList.add('open');
}

function closePlanModal() {
	$('plan-modal').classList.remove('open');
}

function currentPlanMode() {
	var sel = $('plan-mode');
	return sel ? sel.value : 'normal';
}

function onPlanModeChange() {
	var mode = currentPlanMode();
	var normalFields = $('plan-normal-fields');
	var dynamicFields = $('plan-dynamic-fields');
	var previewWrap = $('plan-preview-wrap');
	if (normalFields) normalFields.style.display = mode === 'normal' ? '' : 'none';
	if (dynamicFields) dynamicFields.style.display = mode === 'dynamic' ? '' : 'none';
	if (previewWrap) previewWrap.style.display = 'none';
}

function buildNormalPlanPayload() {
	var title = $('plan-title').value;
	var unitId = $('plan-teamunit').value;
	var goalText = $('plan-goal').value;
	var taskTitle = $('plan-task-title').value || '任务1';
	var taskText = $('plan-task-text').value || goalText;
	var acceptanceText = $('plan-acceptance').value || '完成目标';
	var rules = acceptanceText.split(String.fromCharCode(10)).map(function(l) { return l.trim(); }).filter(function(l) { return l; });
	var outputContract = $('plan-output-contract').value || '中文汇总';
	return {
		title: title,
		defaultTeamUnitId: unitId,
		goal: { text: goalText },
		tasks: [{ id: 'task_1', title: taskTitle, input: { text: taskText }, acceptance: { rules: rules } }],
		outputContract: { text: outputContract },
	};
}

function buildDynamicPlanPayload() {
	var title = $('plan-title').value;
	var unitId = $('plan-teamunit').value;
	var goalText = $('plan-goal').value;
	var discTitle = $('plan-disc-title').value || '发现条目';
	var discInstruction = $('plan-disc-instruction').value || goalText;
	var discOutputKey = $('plan-disc-output-key').value || 'items';
	var discAccText = $('plan-disc-acceptance').value || '输出为有效 JSON';
	var discRules = discAccText.split(String.fromCharCode(10)).map(function(l) { return l.trim(); }).filter(function(l) { return l; });
	var childTitleTmpl = $('plan-child-title').value || '处理 {{item.title}}';
	var childInstrTmpl = $('plan-child-instruction').value || '处理条目 {{item.id}}';
	var childAccText = $('plan-child-acceptance').value || '输出有效';
	var childRules = childAccText.split(String.fromCharCode(10)).map(function(l) { return l.trim(); }).filter(function(l) { return l; });
	var outputContract = $('plan-output-contract').value || '中文汇总';
	var discTaskId = 'discover';
	return {
		title: title,
		defaultTeamUnitId: unitId,
		goal: { text: goalText },
		tasks: [
			{
				id: discTaskId,
				type: 'discovery',
				title: discTitle,
				input: { text: discInstruction },
				acceptance: { rules: discRules.length ? discRules : ['输出为有效 JSON'] },
				discovery: { outputKey: discOutputKey },
			},
			{
				id: 'process_each',
				type: 'for_each',
				title: '逐项处理',
				input: { text: 'Placeholder' },
				acceptance: { rules: childRules.length ? childRules : ['ok'] },
				forEach: {
					itemsFrom: discTaskId + '.' + discOutputKey,
					mode: 'sequential',
					taskTemplate: {
						title: childTitleTmpl,
						input: { text: childInstrTmpl },
						acceptance: { rules: childRules.length ? childRules : ['ok'] },
					},
				},
			},
		],
		outputContract: { text: outputContract },
	};
}

function renderPlanPreview(payload) {
	var wrap = $('plan-preview-wrap');
	var pre = $('plan-preview-json');
	if (!wrap || !pre) return;
	pre.textContent = JSON.stringify(payload, null, 2);
	wrap.style.display = '';
}

function previewPlanJson() {
	var mode = currentPlanMode();
	var payload = mode === 'dynamic' ? buildDynamicPlanPayload() : buildNormalPlanPayload();
	renderPlanPreview(payload);
}

async function savePlan() {
	var title = $('plan-title').value;
	if (!title) { showError('请输入计划名称'); return; }
	var mode = currentPlanMode();
	var payload;
	if (mode === 'dynamic') {
		var discInstruction = $('plan-disc-instruction').value;
		var childInstruction = $('plan-child-instruction').value;
		if (!discInstruction) { showError('请输入发现指令'); return; }
		if (!childInstruction) { showError('请输入子任务指令模板'); return; }
		payload = buildDynamicPlanPayload();
		var previewJson = JSON.stringify(payload, null, 2);
		var previewWrap = $('plan-preview-wrap');
		var previewPre = $('plan-preview-json');
		if (!previewWrap || !previewPre || previewWrap.style.display === 'none' || previewPre.textContent !== previewJson) {
			renderPlanPreview(payload);
			showError('请先检查 Plan JSON 预览，确认无误后再次点击创建');
			return;
		}
	} else {
		payload = buildNormalPlanPayload();
	}
	try {
		await api('/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
		closePlanModal();
		showSuccess('计划已创建');
		loadPlans();
	} catch (e) { showError(e.message); }
}

function promptAction(opts) {
	return new Promise(function(resolve) {
		var modal = document.getElementById('team-prompt-modal');
		var msg = document.getElementById('prompt-message');
		var input = document.getElementById('prompt-input');
		var okBtn = document.getElementById('prompt-ok');
		var cancelBtn = document.getElementById('prompt-cancel');
		if (!modal || !input) { resolve(null); return; }
		if (msg) msg.textContent = opts.message || '';
		input.value = opts.default != null ? String(opts.default) : '';
		modal.style.display = 'flex';
		input.focus();
		function cleanup() {
			modal.style.display = 'none';
			okBtn.removeEventListener('click', onOk);
			cancelBtn.removeEventListener('click', onCancel);
			modal.removeEventListener('click', onBg);
		}
		function onOk() { var v = input.value; cleanup(); resolve(v); }
		function onCancel() { cleanup(); resolve(null); }
		function onBg(e) { if (e.target === modal) { cleanup(); resolve(null); } }
		okBtn.addEventListener('click', onOk);
		cancelBtn.addEventListener('click', onCancel);
		modal.addEventListener('click', onBg);
	});
}

async function startRun(planId) {
	var timeoutStr = await promptAction({ message: '设置运行超时（分钟），留空使用服务端默认值', default: '' });
	if (timeoutStr === null) return;
	var runRequest = { method: 'POST' };
	if (timeoutStr.trim() !== '') {
		var timeout = Number(timeoutStr);
		if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 1440) {
			showError('超时值必须为 1~1440 之间的数字');
			return;
		}
		runRequest.headers = { 'Content-Type': 'application/json' };
		runRequest.body = JSON.stringify({ maxRunDurationMinutes: timeout });
	}
	try {
		await api('/plans/' + planId + '/runs', runRequest);
		if (_selectedPlanId) {
			loadRuns();
			setTimeout(function() { openPlanDetail(planId); }, 1500);
		} else {
			showSection('runs');
			loadRuns();
			setTimeout(loadRuns, 2000);
		}
	} catch (e) { showError(e.message); }
}

async function deletePlan(planId) {
	var ok = await confirmAction({ message: '确认删除此计划？删除后不可恢复。', confirmText: '删除', danger: true });
	if (!ok) return;
	try {
		await api('/plans/' + planId, { method: 'DELETE' });
		showSuccess('已删除');
	} catch (e) { showError(e.message); }
	loadPlans();
}

async function controlRun(runId, action) {
	var btn = document.querySelector('[data-run-id="' + runId + '"] .run-actions');
	if (btn) btn.querySelectorAll('button').forEach(function(b) { b.disabled = true; });
	try {
		await api('/runs/' + runId + '/' + action, { method: 'POST' });
	} catch (e) {
		showError(e.message);
	}
	loadRuns();
}

async function deleteRun(runId) {
	var ok = await confirmAction({ message: '确认删除此运行记录？删除后不可恢复。', confirmText: '删除', danger: true });
	if (!ok) return;
	var btn = document.querySelector('[data-run-id="' + runId + '"] .run-actions');
	if (btn) btn.querySelectorAll('button').forEach(function(b) { b.disabled = true; });
	try {
		await api('/runs/' + runId, { method: 'DELETE' });
	} catch (e) {
		showError(e.message);
	}
	loadRuns();
}


async function setTaskDisposition(runId, taskId, disposition, sourceEl) {
	var scrollSnapshot = captureRunDetailScrollSnapshot(runId, sourceEl);
	try {
		await api('/runs/' + runId + '/tasks/' + taskId + '/manual-disposition', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ disposition: disposition })
		});
		showSuccess('已更新任务标记');
	} catch (e) { showError(e.message); }
	await refreshRunDetailInPlace(runId, sourceEl, scrollSnapshot);
}

async function rerunRunConfirm(runId) {
	var ok = await confirmAction({
		message: '确认按标记重跑？已成功的任务将被复用，非成功的任务将重新执行，标记为跳过的任务将被跳过。',
		confirmText: '重跑',
		danger: true
	});
	if (!ok) return;
	try {
		await api('/runs/' + runId + '/rerun', { method: 'POST' });
		showSuccess('已重新排队');
	} catch (e) { showError(e.message); }
	loadRuns();
}

async function viewReport(runId) {
	var body = $('report-body');
	$('report-modal').classList.add('open');
	body.innerHTML = '<div class="loading"><div class="spinner"></div> 加载中...</div>';
	try {
		var res = await fetch(API + '/runs/' + runId + '/final-report');
		if (res.ok) {
			var text = await res.text();
			body.innerHTML = '<pre>' + escapeHtml(text) + '</pre>';
		} else {
			body.innerHTML = '<p style="color:var(--fail)">报告未找到。</p>';
		}
	} catch (e) {
		body.innerHTML = '<p style="color:var(--fail)">加载失败：' + escapeHtml(e.message) + '</p>';
	}
}

function copyReport() {
		var body = $('report-body');
		if (!body) return;
		var pre = body.querySelector('pre');
		var text = pre ? pre.textContent : body.textContent;
		if (navigator.clipboard) {
			navigator.clipboard.writeText(text).then(function() { showSuccess('已复制'); });
		} else {
			var ta = document.createElement('textarea');
			ta.value = text;
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
			showSuccess('已复制');
		}
	}

function closeReportModal() {
	$('report-modal').classList.remove('open');
}

async function viewAttemptFile(runId, taskId, attemptId, fileName) {
	var viewer = $('file-viewer');
	var title = $('file-viewer-title');
	var body = $('file-viewer-body');
	title.textContent = fileName;
	body.textContent = '加载中...';
	viewer.classList.add('open');
	try {
		var res = await fetch(API + '/runs/' + pathSegment(runId) + '/tasks/' + pathSegment(taskId) + '/attempts/' + pathSegment(attemptId) + '/files/' + pathSegment(fileName));
		if (res.ok) {
			var text = await res.text();
			body.textContent = text;
		} else {
			body.innerHTML = '<span style="color:var(--fail)">文件未找到。</span>';
		}
	} catch (e) {
		body.innerHTML = '<span style="color:var(--fail)">加载失败：' + escapeHtml(e.message) + '</span>';
	}
}

function closeFileViewer() {
	$('file-viewer').classList.remove('open');
}


// SSE management
var _sseConnections = {};

function subscribeRunSSE(runId) {
	if (_sseConnections[runId]) return;
	try {
		var es = new EventSource(API + "/runs/" + runId + "/events");
		_sseConnections[runId] = es;
		es.onmessage = function(evt) {
			try {
				var payload = JSON.parse(evt.data);
				if (payload.type === "snapshot" && payload.data) {
					updateRunCard(payload.data);
				}
			} catch(e) {}
		};
		es.onerror = function() {
			es.close();
			delete _sseConnections[runId];
		};
	} catch(e) {
		// SSE not supported or failed; silent fallback
	}
}

function unsubscribeRunSSE(runId) {
	if (_sseConnections[runId]) {
		_sseConnections[runId].close();
		delete _sseConnections[runId];
	}
}

function unsubscribeAllSSE() {
	Object.keys(_sseConnections).forEach(function(k) {
		_sseConnections[k].close();
	});
	_sseConnections = {};
}

async function cancelRunWithConfirm(runId) {
	var ok = await confirmAction({ message: "确认取消此运行？当前任务将被中断，不可恢复。", confirmText: "取消运行", danger: true });
	if (ok) controlRun(runId, "cancel");
}

async function pauseRunWithConfirm(runId) {
	var ok = await confirmAction({ message: "确认暂停此运行？当前任务会被中断，恢复后继续。", confirmText: "暂停运行" });
	if (ok) controlRun(runId, "pause");
}

async function resumeRunWithConfirm(runId) {
	var ok = await confirmAction({ message: "确认恢复此运行？", confirmText: "恢复运行" });
	if (ok) controlRun(runId, "resume");
}

function renderRunActions(r) {
	var rid = jsArg(r.runId);
	var html = '<span class="detail-toggle" onclick="toggleRunDetail(' + rid + ',this)">展开任务详情</span>';
	if (r.status === 'running') html += '<button class="btn btn-primary btn-sm" onclick="pauseRunWithConfirm(' + rid + ')">暂停</button><button class="btn btn-danger btn-sm" onclick="cancelRunWithConfirm(' + rid + ')">取消</button>';
	if (r.status === 'paused') html += '<button class="btn btn-primary btn-sm" onclick="resumeRunWithConfirm(' + rid + ')">恢复</button><button class="btn btn-danger btn-sm" onclick="cancelRunWithConfirm(' + rid + ')">取消</button>';
	if (r.status === 'completed' || r.status === 'completed_with_failures' || r.status === 'failed') html += '<button class="btn btn-primary btn-sm" onclick="viewReport(' + rid + ')">查看报告</button><button class="btn btn-primary btn-sm" onclick="rerunRunConfirm(' + rid + ')">按标记重跑</button><button class="btn btn-danger btn-sm" onclick="deleteRun(' + rid + ')">删除</button>';
	if (r.status === 'cancelled') html += '<button class="btn btn-primary btn-sm" onclick="rerunRunConfirm(' + rid + ')">按标记重跑</button><button class="btn btn-danger btn-sm" onclick="deleteRun(' + rid + ')">删除</button>';
	return html;
}

function updateRunCard(r) {
	var card = document.querySelector("[data-run-id='" + r.runId + "']");
	if (!card) return;
	var total = r.summary.totalTasks;
	var done = r.summary.succeededTasks + r.summary.failedTasks + r.summary.cancelledTasks + (r.summary.skippedTasks || 0);
	var pct = total ? Math.round(done / total * 100) : 0;
	var summaryParts = [];
	if (r.summary.succeededTasks) summaryParts.push("成功 " + r.summary.succeededTasks);
	if (r.summary.failedTasks) summaryParts.push("失败 " + r.summary.failedTasks);
	if (r.summary.cancelledTasks) summaryParts.push("取消 " + r.summary.cancelledTasks);
	if (r.summary.skippedTasks) summaryParts.push("跳过 " + r.summary.skippedTasks);
	var summaryStr = summaryParts.length ? summaryParts.join(" / ") : "无完成";

	card.setAttribute("data-run-status", r.status);
		if (r.startedAt) card.setAttribute("data-started-at", r.startedAt);
		var badgeEl = card.querySelector(".run-badge");
	if (badgeEl) badgeEl.innerHTML = statusBadge(r.status);
	var progressText = card.querySelector(".run-progress");
	if (progressText) progressText.textContent = "任务进度：" + done + "/" + total + "（" + summaryStr + "）";
	var elapsedEl = card.querySelector(".run-elapsed");
	if (elapsedEl) { var aMs = r.activeElapsedMs || 0; if (r.status === "running" && r.startedAt) aMs = Math.max(aMs, Date.now() - new Date(r.startedAt).getTime()); elapsedEl.textContent = "耗时：" + formatDuration(aMs); }
	var currentEl = card.querySelector(".run-current");
	if (currentEl) {
		var plan = _planCache[r.planId];
		var taskTitle = r.currentTaskId;
		if (plan && r.currentTaskId) {
			var task = plan.tasks.find(function(t) { return t.id === r.currentTaskId; });
			if (task) taskTitle = task.title;
		}
		currentEl.textContent = taskTitle ? "当前任务：" + taskTitle : "";
		currentEl.style.display = taskTitle ? "" : "none";
	}
	var errorEl = card.querySelector(".run-error");
	if (errorEl) {
		if (r.lastError) { errorEl.textContent = "错误：" + r.lastError; errorEl.style.display = ""; }
		else { errorEl.style.display = "none"; }
	}
	var barFill = card.querySelector(".progress-bar-fill");
	if (barFill) barFill.style.width = pct + "%";

	// Update action buttons
	var actionsEl = card.querySelector(".run-actions");
	if (actionsEl) actionsEl.innerHTML = renderRunActions(r);

		// Update task detail if expanded (only when content changes)
		var detailEl = card.querySelector(".run-detail");
		if (detailEl && detailEl.style.display === "block" && window._latestPlanForRun) {
		var plan2 = window._latestPlanForRun[r.runId];
		if (plan2) {
			if (!window._latestRunTaskDefinitions) window._latestRunTaskDefinitions = {};
			if (Array.isArray(r.taskDefinitions)) window._latestRunTaskDefinitions[r.runId] = r.taskDefinitions;
			var detailState = r;
			if (!window._latestRunStateForRun) window._latestRunStateForRun = {};
			var cachedState = window._latestRunStateForRun[r.runId];
			if (cachedState) detailState = Object.assign({}, cachedState, r);
			if (!Array.isArray(detailState.taskDefinitions) && Array.isArray(window._latestRunTaskDefinitions[r.runId])) {
				detailState = Object.assign({}, detailState, { taskDefinitions: window._latestRunTaskDefinitions[r.runId] });
			}
			window._latestRunStateForRun[r.runId] = detailState;
			var newHtml = renderRunDetailShell(r.runId, detailState, plan2, window._latestAttemptsForRun ? window._latestAttemptsForRun[r.runId] : null);
			var hash = String(newHtml.length) + "_" + String(done) + "_" + r.status;
			if (detailEl.getAttribute("data-detail-hash") !== hash) {
				detailEl.setAttribute("data-detail-hash", hash);
				detailEl.innerHTML = newHtml;
			}
		}
		}

	var TERMINAL = { completed: 1, completed_with_failures: 1, failed: 1, cancelled: 1 };
	if (TERMINAL[r.status]) {
		unsubscribeRunSSE(r.runId);
		loadRuns();
	}

}

var _elapsedTimer = null;
function startElapsedTimer() {
	if (_elapsedTimer) return;
	_elapsedTimer = setInterval(function() {
		var cards = document.querySelectorAll("[data-run-status=running][data-started-at]");
		cards.forEach(function(card) {
			var s = card.getAttribute("data-started-at");
			if (!s) return;
			var e = card.querySelector(".run-elapsed");
			if (e) e.textContent = "耗时：" + formatDuration(Date.now() - new Date(s).getTime());
		});
	}, 1000);
}
function subscribeActiveRuns(runs) {
	var ACTIVE = { queued: 1, running: 1, paused: 1 };
	var currentActiveIds = {};
	runs.forEach(function(r) {
		if (ACTIVE[r.status]) {
			currentActiveIds[r.runId] = 1;
			subscribeRunSSE(r.runId);
		}
	});
	Object.keys(_sseConnections).forEach(function(k) {
		if (!currentActiveIds[k]) unsubscribeRunSSE(k);
	});
		startElapsedTimer();
}

// Click outside modals to close
$('teamunit-modal').addEventListener('click', function(e) {
	if (e.target === $('teamunit-modal')) closeTeamUnitModal();
});
$('report-modal').addEventListener('click', function(e) {
	if (e.target === $('report-modal')) closeReportModal();
});
$('file-viewer').addEventListener('click', function(e) {
	if (e.target === $('file-viewer')) closeFileViewer();
});
	$("plan-modal").addEventListener("click", function(e) {
		if (e.target === $("plan-modal")) closePlanModal();
	});


// Initial load
loadAgents().then(async function() {
	await loadPlans();
	loadTeams();
	loadRuns();
});
</script>
<!-- Toast Root -->
<div id="team-toast-root"></div>
<!-- Confirm Modal -->
<div id="team-confirm-modal">
	<div class="confirm-box">
		<p id="confirm-message"></p>
		<div class="confirm-actions">
			<button class="btn" style="background:var(--border);color:var(--text)" id="confirm-cancel">取消</button>
			<button class="btn btn-primary" id="confirm-ok">确认</button>
		</div>
	</div>
</div>
<div id="team-prompt-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:150;justify-content:center;align-items:center">
		<div class="confirm-box">
			<p id="prompt-message"></p>
			<input type="number" id="prompt-input" min="1" max="1440" style="width:100%;padding:8px;margin:8px 0;border:1px solid var(--border);border-radius:6px;font-size:14px" />
			<div class="confirm-actions">
				<button class="btn" style="background:var(--border);color:var(--text)" id="prompt-cancel">取消</button>
				<button class="btn btn-primary" id="prompt-ok">确定</button>
			</div>
		</div>
	</div>
</body>
</html>`;
}
