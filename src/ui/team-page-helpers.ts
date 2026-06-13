/**
 * Parity-tested mirror helpers for team-page.ts inline script functions.
 *
 * These functions are tested directly AND compared against the inline
 * <script> implementations via parity tests. They are NOT automatically
 * injected into the page — the inline script has its own copy.
 *
 * Keep in sync: when the inline implementation changes, update the
 * helper and verify parity tests still pass.
 */

export const ACTIVE_RUN_STATUSES: Record<string, true> = { queued: true, running: true, paused: true };
export const TERMINAL_RUN_STATUSES: Record<string, true> = { completed: true, completed_with_failures: true, failed: true, cancelled: true };

export function escapeHtml(value: string): string {
	return String(value == null ? '' : value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function jsArg(value: string): string {
	return escapeHtml(JSON.stringify(String(value == null ? '' : value)));
}

export function isActiveRunStatus(status: string): boolean {
	return !!ACTIVE_RUN_STATUSES[status];
}

export function isTerminalRunStatus(status: string): boolean {
	return !!TERMINAL_RUN_STATUSES[status];
}

export function runsForPlan(planId: string, runs: any[]): any[] {
	if (!runs) return [];
	return runs.filter(function(r: any) { return r.planId === planId; });
}

export function activeRunForPlan(planId: string, runs: any[]): any | null {
	var planRuns = runsForPlan(planId, runs);
	for (var i = 0; i < planRuns.length; i++) {
		if (isActiveRunStatus(planRuns[i].status)) return planRuns[i];
	}
	return null;
}

export function latestRunForPlan(planId: string, runs: any[]): any | null {
	var planRuns = runsForPlan(planId, runs);
	if (!planRuns.length) return null;
	return planRuns[0];
}

export function runProgressSummary(run: any): { done: number; total: number; pct: number; succeeded: number; failed: number; cancelled: number } {
	if (!run || !run.summary) return { done: 0, total: 0, pct: 0, succeeded: 0, failed: 0, cancelled: 0 };
	var s = run.summary;
	var done = (s.succeededTasks || 0) + (s.failedTasks || 0) + (s.cancelledTasks || 0) + (s.skippedTasks || 0);
	var total = s.totalTasks || 0;
	return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0, succeeded: s.succeededTasks || 0, failed: s.failedTasks || 0, cancelled: s.cancelledTasks || 0 };
}

export function isDynamicPlan(tasks: any[]): boolean {
	if (!tasks || tasks.length < 2) return false;
	var hasDiscovery = false, hasForEach = false;
	for (var i = 0; i < tasks.length; i++) {
		if (tasks[i].type === 'discovery') hasDiscovery = true;
		if (tasks[i].type === 'for_each') hasForEach = true;
	}
	return hasDiscovery && hasForEach;
}

export function planKindLabel(plan: any): string {
	var tasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
	if (isDynamicPlan(tasks)) return 'discovery + for_each';
	return 'normal';
}

export function truncateText(text: string, maxLen: number): string {
	if (!text) return '';
	var str = String(text);
	if (str.length <= maxLen) return str;
	return str.slice(0, maxLen) + '...';
}

export function taskDecomposerMode(task: any): string {
	var mode = task && task.decomposer && task.decomposer.mode ? String(task.decomposer.mode) : 'none';
	return mode === 'leaf' || mode === 'propagate' ? mode : 'none';
}

export function renderDecomposerModeBadge(task: any): string {
	var mode = taskDecomposerMode(task);
	if (mode === 'none') return '';
	var label = mode === 'leaf' ? '任务可拆分' : '可生成可拆任务';
	var color = mode === 'leaf' ? 'var(--warn)' : 'var(--accent)';
	var bg = mode === 'leaf' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)';
	return ' <span class="badge decomposer-badge" style="background:' + bg + ';color:' + color + ';font-size:11px">' + escapeHtml(mode) + ' · ' + label + '</span>';
}

export function statusBadge(status: string): string {
	var map: Record<string, string> = { completed: 'badge-success', completed_with_failures: 'badge-warn', failed: 'badge-fail', running: 'badge-warn', queued: 'badge-muted', paused: 'badge-warn', cancelled: 'badge-muted', skipped: 'badge-muted' };
	return '<span class="badge ' + (map[status] || 'badge-muted') + '">' + escapeHtml(status) + '</span>';
}

export function formatDuration(ms: number): string {
	if (!ms || ms <= 0) return '0秒';
	var s = Math.floor(ms / 1000);
	var h = Math.floor(s / 3600);
	var m = Math.floor((s % 3600) / 60);
	s = s % 60;
	if (h > 0) return h + '时' + (m > 0 ? m + '分' : '');
	if (m > 0) return m + '分' + (s > 0 ? s + '秒' : '');
	return s + '秒';
}

export function renderPlanDashboardCard(plan: any, runs: any[]): string {
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
		if (safePlan.tasks && activeRun.currentTaskId) {
			var task = safePlan.tasks.find(function(t: any) { return t.id === activeRun.currentTaskId; });
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
		+ '<button class="btn btn-sm btn-primary" onclick="openPlanDetail(\'' + escapeHtml(safePlan.planId || '') + '\')">查看详情</button>'
		+ '<button class="btn btn-sm" onclick="startRun(\'' + escapeHtml(safePlan.planId || '') + '\')">创建运行</button>'
		+ '<button class="btn btn-danger btn-sm" onclick="deletePlan(\'' + escapeHtml(safePlan.planId || '') + '\')">删除</button>'
		+ '</div></div>';
}

export function renderDynamicPlanDesign(tasks: any[]): string {
	var discTask: any = null, feTask: any = null;
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
	html += '<div style="margin-left:16px;color:var(--muted);font-size:12px">↓ 运行时展开为子任务</div>';
	html += '<div style="display:flex;align-items:center;gap:8px;margin-top:8px">';
	html += '<span class="badge" style="background:rgba(124,58,237,0.15);color:#7c3aed;font-size:11px">for_each</span>';
	html += '<span style="font-size:13px">' + escapeHtml(feTask ? feTask.title || '' : '') + '</span>';
	if (feTask) html += renderDecomposerModeBadge(feTask);
	if (feTask && feTask.forEach) {
		html += '<span class="plan-chip" style="font-size:10px">← ' + escapeHtml(feTask.forEach.itemsFrom || '') + '</span>';
	}
	html += '</div>';
	if (feTask && feTask.forEach && feTask.forEach.taskTemplate) {
		var tmpl = feTask.forEach.taskTemplate;
		html += '<details class="plan-task-details" style="margin-top:8px"><summary>子任务模板</summary><div class="plan-task-detail-content">';
		html += '<p class="plan-task-detail-input" style="color:#7c3aed">标题: ' + escapeHtml(tmpl.title || '') + '</p>';
		html += renderDecomposerModeBadge(tmpl);
		if (tmpl.input && tmpl.input.text) html += '<p class="plan-task-detail-input">指令: ' + escapeHtml(tmpl.input.text) + '</p>';
		html += '</div></details>';
	}
	html += '</div>';
	return html;
}

export function renderNormalPlanDesign(tasks: any[]): string {
	if (!tasks || !tasks.length) return '<div style="color:var(--muted)">无任务</div>';
	var html = '<div style="padding:4px 0">';
	for (var i = 0; i < tasks.length; i++) {
		var t = tasks[i];
		html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-top:1px solid var(--border)">';
		html += '<span style="color:var(--muted);font-size:11px;min-width:24px">#' + (i + 1) + '</span>';
		html += '<span style="font-size:13px">' + escapeHtml(t.title || t.id || '') + '</span>';
		html += renderDecomposerModeBadge(t);
		var inputText = t.input && t.input.text ? t.input.text : '';
		var rules = t.acceptance && Array.isArray(t.acceptance.rules) ? t.acceptance.rules : [];
		var meta: string[] = [];
		if (inputText) meta.push(inputText.length + '字');
		if (rules.length) meta.push(rules.length + ' 条验收');
		if (meta.length) html += '<span class="plan-task-meta">' + meta.join(' / ') + '</span>';
		html += '</div>';
	}
	html += '</div>';
	return html;
}

export function renderPlanRunCard(run: any, plan: any): string {
	if (!run) return '';
	var prog = runProgressSummary(run);
	var isActive = isActiveRunStatus(run.status);
	var isTerminal = isTerminalRunStatus(run.status);
	var cardClass = 'card' + (isActive ? ' plan-card-active' : '');
	var rid = jsArg(run.runId);
	var html = '<div class="' + cardClass + '" data-run-id="' + escapeHtml(run.runId) + '" data-run-status="' + escapeHtml(run.status) + '"' + (run.startedAt ? ' data-started-at="' + escapeHtml(run.startedAt) + '"' : '') + ' style="margin-bottom:8px;cursor:pointer" onclick="togglePlanRunDetail(this, ' + rid + ')">';
	html += '<div style="display:flex;justify-content:space-between;align-items:center">';
	html += '<div style="display:flex;align-items:center;gap:6px"><span class="team-id-label" title="点击复制 Run ID" onclick="copyTeamIdToClipboard(event, ' + jsArg(run.runId) + ', this)">' + escapeHtml(run.runId) + '</span> <span class="run-badge">' + statusBadge(run.status) + '</span></div>';
	html += '<span class="run-elapsed" style="font-size:12px;color:var(--muted)">' + formatDuration(run.activeElapsedMs) + '</span>';
	html += '</div>';
	html += '<div class="run-progress" style="font-size:12px;color:var(--muted);margin-top:4px">任务进度：' + prog.done + '/' + prog.total + '</div>';
	if (isActive) {
		html += '<div class="progress-bar" style="margin-top:4px"><div class="progress-bar-fill" style="width:' + prog.pct + '%"></div></div>';
	}
	var currentTaskTitle = '';
	if (run.currentTaskId && plan && plan.tasks) {
		var task = plan.tasks.find(function(t: any) { return t.id === run.currentTaskId; });
		currentTaskTitle = task ? task.title : run.currentTaskId;
	} else if (run.currentTaskId) {
		currentTaskTitle = run.currentTaskId;
	}
	html += currentTaskTitle
		? '<p class="run-current" style="font-size:12px;color:var(--muted);margin-top:4px">当前任务：' + escapeHtml(currentTaskTitle) + '</p>'
		: '<p class="run-current" style="display:none;font-size:12px;color:var(--muted);margin-top:4px"></p>';
	html += run.lastError
		? '<p class="run-error" style="font-size:12px;color:var(--fail);margin-top:4px">错误：' + escapeHtml(run.lastError) + '</p>'
		: '<p class="run-error" style="display:none;font-size:12px;color:var(--fail);margin-top:4px"></p>';
	html += '<div class="run-actions" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap" onclick="event.stopPropagation()">';
	if (run.status === 'running') {
		html += '<button class="btn btn-primary btn-sm" onclick="pauseRunWithConfirm(' + rid + ')">暂停</button>';
		html += '<button class="btn btn-danger btn-sm" onclick="cancelRunWithConfirm(' + rid + ')">取消</button>';
	}
	if (run.status === 'paused') {
		html += '<button class="btn btn-primary btn-sm" onclick="resumeRunWithConfirm(' + rid + ')">恢复</button>';
		html += '<button class="btn btn-danger btn-sm" onclick="cancelRunWithConfirm(' + rid + ')">取消</button>';
	}
	if (isTerminal) {
		if (run.status !== 'cancelled') {
			html += '<button class="btn btn-primary btn-sm" onclick="viewReport(' + rid + ')">查看报告</button>';
			html += '<button class="btn btn-primary btn-sm" onclick="rerunRunConfirm(' + rid + ')">按标记重跑</button>';
		}
		if (run.status === 'cancelled') {
			html += '<button class="btn btn-primary btn-sm" onclick="rerunRunConfirm(' + rid + ')">按标记重跑</button>';
		}
		html += '<button class="btn btn-danger btn-sm" onclick="deleteRun(' + rid + ')">删除</button>';
	}
	html += '</div>';
	html += '<div id="run-detail-' + escapeHtml(run.runId) + '" class="run-detail" onclick="event.stopPropagation()"></div>';
	html += '</div>';
	return html;
}

export function splitAcceptanceLines(text: string): string[] {
	if (!text) return [];
	return text.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l; });
}

export interface DynamicPlanValues {
	title: string;
	unitId: string;
	goalText: string;
	discTitle: string;
	discInstruction: string;
	discOutputKey: string;
	discAcceptance: string;
	childTitle: string;
	childInstruction: string;
	childAcceptance: string;
	outputContract: string;
}

export function buildDynamicPlanPayloadFromValues(v: Partial<DynamicPlanValues>) {
	var title = v.title || '';
	var unitId = v.unitId || '';
	var goalText = v.goalText || '';
	var discTitle = v.discTitle || '发现条目';
	var discInstruction = v.discInstruction || goalText;
	var discOutputKey = v.discOutputKey || 'items';
	var discAccText = v.discAcceptance || '输出为有效 JSON';
	var discRules = splitAcceptanceLines(discAccText);
	var childTitleTmpl = v.childTitle || '处理 {{item.title}}';
	var childInstrTmpl = v.childInstruction || '处理条目 {{item.id}}';
	var childAccText = v.childAcceptance || '输出有效';
	var childRules = splitAcceptanceLines(childAccText);
	var outputContract = v.outputContract || '中文汇总';
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

export interface NaturalDraftValues {
	prompt: string;
	unitId: string;
	preferredTemplateId?: string;
}

export interface NaturalDraftSnapshot {
	prompt: string;
	defaultTeamUnitId: string;
	preferredTemplateId?: string;
	plan: any;
}

export function buildNaturalDraftRequestPayloadFromValues(v: Partial<NaturalDraftValues>) {
	var payload: { prompt: string; defaultTeamUnitId: string; preferredTemplateId?: string } = {
		prompt: v.prompt || '',
		defaultTeamUnitId: v.unitId || '',
	};
	if (v.preferredTemplateId) payload.preferredTemplateId = v.preferredTemplateId;
	return payload;
}

export function isNaturalDraftCurrent(snapshot: NaturalDraftSnapshot | null | undefined, values: Partial<NaturalDraftValues>): boolean {
	return !!snapshot
		&& snapshot.prompt === (values.prompt || '')
		&& snapshot.defaultTeamUnitId === (values.unitId || '')
		&& (snapshot.preferredTemplateId || '') === (values.preferredTemplateId || '');
}

export interface TaskDetailModel {
	planTaskIds: Record<string, boolean>;
	taskById: Record<string, any>;
	childrenByParent: Record<string, string[]>;
	orphanIds: string[];
}

export function buildTaskDetailModel(state: any, plan: any): TaskDetailModel {
	var generatedTasks: any[] = [];
	if (Array.isArray(state.taskDefinitions)) generatedTasks = generatedTasks.concat(state.taskDefinitions);
	if (!generatedTasks.length && Array.isArray(state.generatedTasks)) generatedTasks = generatedTasks.concat(state.generatedTasks);
	if (!generatedTasks.length && Array.isArray(state.tasks)) generatedTasks = generatedTasks.concat(state.tasks.filter(function(t: any) { return t && t.generated; }));
	var planIdSet: Record<string, boolean> = {};
	var taskById: Record<string, any> = {};
	var planTasks = (plan && plan.tasks) || [];
	planTasks.forEach(function(t: any) { planIdSet[t.id] = true; taskById[t.id] = t; });
	generatedTasks.forEach(function(t: any) { if (t && t.id) taskById[t.id] = t; });
	var childrenByParent: Record<string, string[]> = {};
	generatedTasks.forEach(function(t: any) {
		if (!t || !t.id || !t.parentTaskId) return;
		if (!childrenByParent[t.parentTaskId]) childrenByParent[t.parentTaskId] = [];
		if (childrenByParent[t.parentTaskId].indexOf(t.id) === -1) childrenByParent[t.parentTaskId].push(t.id);
	});
	var renderedTaskIds: Record<string, boolean> = {};
	var orphanIds: string[] = [];
	Object.keys(state.taskStates || {}).forEach(function(id: string) {
		if (planIdSet[id]) return;
		if (renderedTaskIds[id]) return;
		planTasks.forEach(function(parent: any) {
			if (id.indexOf(parent.id + '__') === 0) {
				if (!childrenByParent[parent.id]) childrenByParent[parent.id] = [];
				if (childrenByParent[parent.id].indexOf(id) === -1) childrenByParent[parent.id].push(id);
				if (!taskById[id]) taskById[id] = { id: id, title: id, parentTaskId: parent.id, generated: true };
				renderedTaskIds[id] = true;
			}
		});
	});
	Object.keys(state.taskStates || {}).forEach(function(id: string) {
		if (!planIdSet[id] && !renderedTaskIds[id]) orphanIds.push(id);
	});
	return { planTaskIds: planIdSet, taskById: taskById, childrenByParent: childrenByParent, orphanIds: orphanIds };
}

export function childSourceFor(parent: any, childIds: string[], taskById: Record<string, any>): string {
	if (parent && parent.type === 'for_each') return 'for_each';
	for (var i = 0; i < childIds.length; i++) {
		var child = taskById[childIds[i]];
		if (child && child.generatedSource) return child.generatedSource;
	}
	if (taskDecomposerMode(parent) !== 'none') return 'decomposition';
	return 'unknown';
}

export function childGroupLabel(source: string): string {
	if (source === 'for_each') return '动态子任务';
	if (source === 'decomposition') return '拆分子任务';
	return '子任务';
}

export function renderRuntimeContextHelper(role: string, ctx: any): string {
	if (!ctx) return '';
	var summary = escapeHtml(role) + ': ' + escapeHtml(ctx.requestedProfileId) + ' → ' + escapeHtml(ctx.resolvedProfileId);
	if (ctx.fallbackUsed) summary += ' (fallback' + (ctx.fallbackReason ? ': ' + escapeHtml(ctx.fallbackReason) : '') + ')';
	var detailParts = [
		'<span>' + escapeHtml(role) + ': ' + escapeHtml(ctx.requestedProfileId) + ' → ' + escapeHtml(ctx.resolvedProfileId) + '</span>',
	];
	if (ctx.fallbackUsed) detailParts.push('<span class="runtime-context-fallback">fallback' + (ctx.fallbackReason ? ': ' + escapeHtml(ctx.fallbackReason) : '') + '</span>');
	return '<details class="runtime-context-wrap"><summary>' + summary + '</summary><div class="runtime-context runtime-context-detail">' + detailParts.join('') + '</div></details>';
}
