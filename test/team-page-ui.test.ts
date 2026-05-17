import test from "node:test";
import assert from "node:assert/strict";
import { renderTeamPage } from "../src/ui/team-page.js";

test("team page contains Chinese labels", () => {
	const html = renderTeamPage();
	assert.match(html, /计划/);
	assert.match(html, /预设团队/);
	assert.match(html, /运行记录/);
	assert.match(html, /任务/);
	assert.match(html, /执行 Agent/);
	assert.match(html, /验收 Agent/);
	assert.match(html, /复盘 Agent/);
	assert.match(html, /汇总 Agent/);
});

test("team page references /v1/team API", () => {
	const html = renderTeamPage();
	assert.match(html, /\/v1\/team/);
});

test("team page inline scripts are valid JavaScript", () => {
	const html = renderTeamPage();
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
	assert.ok(scripts.length > 0);
	for (const script of scripts) {
		assert.doesNotThrow(() => new Function(script));
	}
});

test("team page has plan, team, run sections", () => {
	const html = renderTeamPage();
	assert.match(html, /section-plans/);
	assert.match(html, /section-teams/);
	assert.match(html, /section-runs/);
});

test("team page escapes dynamic API values before inserting HTML", () => {
	const html = renderTeamPage();
	assert.match(html, /escapeHtml\(safePlan\.title/);
	assert.match(html, /escapeHtml\(goalText\)|escapeHtml\(truncateText\(goalText/);
	assert.match(html, /escapeHtml\(t\.title\)/);
	assert.match(html, /escapeHtml\(text\)/);
});

test("team page exposes pause resume controls and timing panel labels", () => {
	const html = renderTeamPage();
	assert.match(html, /暂停/);
	assert.match(html, /恢复/);
	assert.match(html, /任务进度/);
	assert.match(html, /耗时/);
});

test("team page has refresh button for runs", () => {
	const html = renderTeamPage();
	assert.match(html, /刷新/);
	assert.match(html, /refresh-btn/);
});

test("team page has expandable task detail toggle", () => {
	const html = renderTeamPage();
	assert.match(html, /toggleRunDetail/);
	assert.match(html, /run-detail-/);
	assert.match(html, /展开任务详情/);
});

test("team page renders task detail fields", () => {
	const html = renderTeamPage();
	assert.match(html, /renderTaskDetail/);
	assert.match(html, /task\.title/);
	assert.match(html, /ts\.status/);
	assert.match(html, /ts\.progress/);
	assert.match(html, /ts\.resultRef/);
	assert.match(html, /ts\.errorSummary/);
	assert.match(html, /ts\.attemptCount/);
	assert.match(html, /ts\.activeAttemptId/);
});

test("team page escapes run dynamic fields", () => {
	const html = renderTeamPage();
	assert.match(html, /escapeHtml\(r\.runId/);
	assert.match(html, /escapeHtml\(r\.lastError\)/);
	assert.match(html, /escapeHtml\(currentTaskTitle\)/);
});

test("team page escapes task detail dynamic fields", () => {
	const html = renderTeamPage();
	assert.match(html, /escapeHtml\(task\.title\)/);
	assert.match(html, /phaseLabel\(ts\.progress\.phase\)/);
	assert.match(html, /escapeHtml\(ts\.progress\.message\)/);
	assert.match(html, /escapeHtml\(ts\.resultRef\)/);
	assert.match(html, /escapeHtml\(ts\.errorSummary\)/);
	assert.match(html, /escapeHtml\(ts\.activeAttemptId/);
});

test("team page shows view report button for terminal runs", () => {
	const html = renderTeamPage();
	assert.match(html, /查看报告/);
	assert.match(html, /viewReport/);
});

test("team page shows delete button for cancelled runs", () => {
	const html = renderTeamPage();
	assert.match(html, /status === 'cancelled'/);
	assert.match(html, /deleteRun/);
});

test("team page has final report endpoint handler", () => {
	const html = renderTeamPage();
	assert.match(html, /final-report/);
	assert.match(html, /报告未找到/);
});

test("team page contains SSE/EventSource logic", () => {
	const html = renderTeamPage();
	assert.match(html, /EventSource/);
	assert.match(html, /subscribeRunSSE/);
	assert.match(html, /updateRunCard/);
	assert.match(html, /_sseConnections/);
});

test("team page SSE subscribes to active runs and unsubscribes terminal", () => {
	const html = renderTeamPage();
	assert.match(html, /subscribeActiveRuns/);
	assert.match(html, /unsubscribeRunSSE/);
	assert.match(html, /unsubscribeAllSSE/);
});

test("team page SSE updates run card elements by class", () => {
	const html = renderTeamPage();
	assert.match(html, /run-badge/);
	assert.match(html, /run-progress/);
	assert.match(html, /run-elapsed/);
	assert.match(html, /run-current/);
	assert.match(html, /run-error/);
});

test("team page run cards have data-run-id attribute", () => {
	const html = renderTeamPage();
	assert.match(html, /data-run-id/);
});

test("team page fetches attempts for task detail", () => {
	const html = renderTeamPage();
	assert.match(html, /\/attempts/);
	assert.match(html, /attemptsMap/);
});

test("team page renderTaskDetail accepts attemptsMap parameter", () => {
	const html = renderTeamPage();
	assert.match(html, /renderTaskDetail\(state,\s*plan,\s*attemptsMap\)/);
});

test("team page inline scripts are still valid JavaScript with SSE", () => {
	const html = renderTeamPage();
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
	assert.ok(scripts.length > 0);
	for (const script of scripts) {
		assert.doesNotThrow(() => new Function(script), "inline script should be valid JS");
	}
});

// ── Behavioral tests: extract and execute inline functions ──

function extractScript(): string {
	const html = renderTeamPage();
	const match = html.match(/<script>([\s\S]*?)<\/script>/);
	assert.ok(match, "should have inline script");
	return match[1];
}

function makeDomLike() {
	const elements: Record<string, { innerHTML: string; textContent: string; style: Record<string, string>; classList: { add: () => void; remove: () => void } }> = {};
	return {
		document: {
			querySelector: (sel: string) => {
				if (sel.startsWith("[data-run-id=")) return null;
				return elements[sel] ?? null;
			},
			querySelectorAll: () => [],
			getElementById: (id: string) => elements["#" + id] ?? null,
			createElement: () => ({ appendChild: () => {} }),
		},
		window: {},
		elements,
	};
}

test("behavioral: loadRuns calls subscribeActiveRuns(runs) after rendering", () => {
	const script = extractScript();
	// Verify the function body: loadRuns should end with subscribeActiveRuns(runs)
	// Extract the loadRuns function
	const loadRunsMatch = script.match(/async function loadRuns\(\)[\s\S]*?^[\t]}/m);
	assert.ok(loadRunsMatch, "should find loadRuns function");
	const body = loadRunsMatch[0];
	assert.match(body, /subscribeActiveRuns\(runs\)/, "loadRuns must call subscribeActiveRuns(runs)");
	// Verify it's AFTER the join (i.e. after rendering)
	const joinIdx = body.indexOf("}).join('')");
	const subscribeIdx = body.indexOf("subscribeActiveRuns(runs)");
	assert.ok(subscribeIdx > joinIdx, "subscribeActiveRuns must come after join (rendering)");
});

test("behavioral: loadRuns calls unsubscribeAllSSE() when runs is empty", () => {
	const script = extractScript();
	const loadRunsMatch = script.match(/async function loadRuns\(\)[\s\S]*?^[\t]}/m);
	assert.ok(loadRunsMatch, "should find loadRuns function");
	const body = loadRunsMatch[0];
	// Find the empty case
	const emptyIdx = body.indexOf("!runs.length");
	assert.ok(emptyIdx > -1, "should have empty check");
	// Find unsubscribeAllSSE after the empty check
	const unsubIdx = body.indexOf("unsubscribeAllSSE()", emptyIdx);
	assert.ok(unsubIdx > emptyIdx, "unsubscribeAllSSE should be called in empty case");
	// Verify it's before the return
	const returnIdx = body.indexOf("return;", emptyIdx);
	assert.ok(unsubIdx < returnIdx, "unsubscribeAllSSE should be before return");
});

test("behavioral: updateRunCard uses innerHTML (not outerHTML) for badge", () => {
	const script = extractScript();
	// Verify badgeEl.innerHTML, NOT badgeEl.outerHTML
	assert.match(script, /badgeEl\.innerHTML\s*=\s*statusBadge/);
	assert.doesNotMatch(script, /badgeEl\.outerHTML/);
});

test("behavioral: updateRunCard updates actions via renderRunActions", () => {
	const script = extractScript();
	// Verify actionsEl is queried and updated
	assert.match(script, /\.run-actions/);
	assert.match(script, /actionsEl\.innerHTML\s*=\s*renderRunActions\(r\)/);
});

test("behavioral: renderRunActions shows pause/cancel for running, resume/cancel for paused, report/delete for completed", () => {
	const script = extractScript();
	// Verify the function exists and has the right conditional logic
	const rraMatch = script.match(/function renderRunActions\(r\)[\s\S]*?^[\t]}/m);
	assert.ok(rraMatch, "should find renderRunActions function");
	const body = rraMatch[0];
	assert.match(body, /r\.status === ["']running["']/, "should handle running status");
	assert.match(body, /r\.status === ["']paused["']/, "should handle paused status");
	assert.match(body, /r\.status === ["']completed["']/, "should handle completed status");
	assert.match(body, /r\.status === ["']cancelled["']/, "should handle cancelled status");
	// Verify actions contain the right control calls
	assert.match(body, /controlRun.*pause/, "running should have pause button");
	assert.match(body, /controlRun.*cancel/, "running should have cancel button");
	assert.match(body, /controlRun.*resume/, "paused should have resume button");
	assert.match(body, /viewReport/, "completed should have view report button");
	assert.match(body, /deleteRun/, "terminal should have delete button");
});

test("behavioral: loadRuns uses renderRunActions via .run-actions div", () => {
	const script = extractScript();
	// Verify the actions div has .run-actions class
	assert.match(script, /class="run-actions"/);
	// Verify renderRunActions is called in the template
	assert.match(script, /renderRunActions\(r\)/);
});

// ── P4: Team UI usability improvements ──

test("P4: formatDuration function exists and handles cases", () => {
	const script = extractScript();
	assert.match(script, /function formatDuration\(ms\)/);
	// Should return 0秒 for 0
	assert.match(script, /return '0秒'/);
	// Should handle hours
	assert.match(script, /时/);
	// Should handle minutes
	assert.match(script, /分/);
	// Should handle seconds
	assert.match(script, /秒/);
});

test("P4: formatDuration is used in loadRuns and updateRunCard", () => {
	const script = extractScript();
	assert.match(script, /formatDuration\(r\.activeElapsedMs\)/);
});

test("P4: formatTimestamp function exists and formats ISO date", () => {
	const script = extractScript();
	assert.match(script, /function formatTimestamp\(iso\)/);
	assert.match(script, /getMonth/);
	assert.match(script, /getDate/);
	assert.match(script, /getHours/);
	assert.match(script, /getMinutes/);
});

test("P4: formatTimestamp is used in loadRuns for createdAt, startedAt, finishedAt", () => {
	const script = extractScript();
	assert.match(script, /formatTimestamp\(r\.createdAt\)/);
	assert.match(script, /formatTimestamp\(r\.startedAt\)/);
	assert.match(script, /formatTimestamp\(r\.finishedAt\)/);
});

test("P4: PHASE_LABELS map contains Chinese labels", () => {
	const html = renderTeamPage();
	assert.match(html, /PHASE_LABELS/);
	assert.match(html, /worker_running.*执行中/);
	assert.match(html, /checker_reviewing.*验收中/);
	assert.match(html, /watcher_reviewing.*复盘中/);
	assert.match(html, /finalizer_running.*生成报告/);
	assert.match(html, /succeeded.*已通过/);
	assert.match(html, /failed.*失败/);
});

test("P4: phaseLabel function is used in renderTaskDetail", () => {
	const script = extractScript();
	assert.match(script, /function phaseLabel/);
	assert.match(script, /escapeHtml\(phaseLabel\(ts\.progress\.phase\)\)/);
});

test("P4: phaseColor function is used for phase label styling", () => {
	const script = extractScript();
	assert.match(script, /function phaseColor/);
	assert.match(script, /phaseColor\(ts\.progress\.phase\)/);
});

test("P4: CSS includes loading spinner", () => {
	const html = renderTeamPage();
	assert.match(html, /@keyframes spin/);
	assert.match(html, /\.spinner/);
	assert.match(html, /\.loading/);
});

test("P4: CSS includes button disabled state", () => {
	const html = renderTeamPage();
	assert.match(html, /\.btn:disabled/);
});

test("P4: CSS includes phase label color classes", () => {
	const html = renderTeamPage();
	assert.match(html, /\.phase-label/);
	assert.match(html, /\.phase-running/);
	assert.match(html, /\.phase-success/);
	assert.match(html, /\.phase-fail/);
	assert.match(html, /\.phase-warn/);
	assert.match(html, /\.phase-muted/);
});

test("P4: report modal HTML exists with close button", () => {
	const html = renderTeamPage();
	assert.match(html, /id="report-modal"/);
	assert.match(html, /report-content/);
	assert.match(html, /closeReportModal/);
	assert.match(html, /最终报告/);
});

test("P4: file viewer HTML exists with close button", () => {
	const html = renderTeamPage();
	assert.match(html, /id="file-viewer"/);
	assert.match(html, /file-viewer-content/);
	assert.match(html, /closeFileViewer/);
});

test("P4: viewAttemptFile function exists", () => {
	const script = extractScript();
	assert.match(script, /async function viewAttemptFile/);
	assert.match(script, /\/attempts\//);
	const html = renderTeamPage();
	assert.match(html, /file-chip/);
});

test("P4: plan title displayed in run cards with plan-title class", () => {
	const html = renderTeamPage();
	assert.match(html, /plan-title/);
	assert.match(html, /escapeHtml\(planTitle\)/);
});

test("P4: run-id class used for runId display", () => {
	const html = renderTeamPage();
	assert.match(html, /\.run-id/);
	assert.match(html, /run-id/);
});

test("P4: escapeHtml used on status in statusBadge", () => {
	const script = extractScript();
	// statusBadge should escape the status value
	assert.match(script, /escapeHtml\(status\)/);
});

test("P4: escapeHtml used on currentTaskTitle in run cards", () => {
	const script = extractScript();
	assert.match(script, /escapeHtml\(currentTaskTitle\)/);
});

test("P4: escapeHtml used on attempt status and attemptId", () => {
	const script = extractScript();
	assert.match(script, /escapeHtml\(a\.status\)/);
	assert.match(script, /escapeHtml\(a\.attemptId/);
});

test("P4: escapeHtml used on file names in attempt display", () => {
	const script = extractScript();
	assert.match(script, /escapeHtml\(f\)/);
});

test("P4: attempt file onclick arguments are JS-string and HTML escaped", () => {
	const script = extractScript();
	assert.match(script, /function jsArg\(value\)/);
	assert.match(script, /JSON\.stringify\(String\(value/);
	assert.match(script, /viewAttemptFile\(' \+ jsArg\(state\.runId\) \+ ',' \+ jsArg\(task\.id\) \+ ',' \+ jsArg\(a\.attemptId\) \+ ',' \+ jsArg\(f\) \+ '\)/);
	assert.doesNotMatch(script, /viewAttemptFile\\\(\\\\'' \+ state\.runId/);
});

test("P4: attempt file URL path segments are encoded", () => {
	const script = extractScript();
	assert.match(script, /function pathSegment\(value\)/);
	assert.match(script, /encodeURIComponent\(String\(value/);
	assert.match(script, /pathSegment\(runId\).*pathSegment\(taskId\).*pathSegment\(attemptId\).*pathSegment\(fileName\)/s);
});

test("P4: escapeHtml used on report body content", () => {
	const script = extractScript();
	assert.match(script, /escapeHtml\(text\)/);
});

test("P4: loading state shown in loadPlans", () => {
	const script = extractScript();
	assert.match(script, /plans-list/);
	const loadPlansMatch = script.match(/async function loadPlans\(\)[\s\S]*?^[\t]}/m);
	assert.ok(loadPlansMatch, "should find loadPlans function");
	assert.match(loadPlansMatch[0], /spinner/);
});

test("P4: loading state shown in loadTeams", () => {
	const script = extractScript();
	const loadTeamsMatch = script.match(/async function loadTeams\(\)[\s\S]*?^[\t]}/m);
	assert.ok(loadTeamsMatch, "should find loadTeams function");
	assert.match(loadTeamsMatch[0], /spinner/);
});

test("P4: loading state shown in loadRuns", () => {
	const script = extractScript();
	const loadRunsMatch = script.match(/async function loadRuns\(\)[\s\S]*?^[\t]}/m);
	assert.ok(loadRunsMatch, "should find loadRuns function");
	assert.match(loadRunsMatch[0], /spinner/);
});

test("P4: error retry links in loadPlans, loadTeams, loadRuns", () => {
	const script = extractScript();
	// loadPlans retry
	assert.match(script, /onclick="loadPlans\(\)"[^>]*>重试/);
	// loadTeams retry
	assert.match(script, /onclick="loadTeams\(\)"[^>]*>重试/);
	// loadRuns retry
	assert.match(script, /onclick="loadRuns\(\)"[^>]*>重试/);
});

test("P4: controlRun disables buttons during operation", () => {
	const script = extractScript();
	const match = script.match(/async function controlRun[\s\S]*?^[\t]}/m);
	assert.ok(match, "should find controlRun function");
	assert.match(match[0], /disabled/);
});

test("P4: deleteRun disables buttons during operation", () => {
	const script = extractScript();
	const match = script.match(/async function deleteRun[\s\S]*?^[\t]}/m);
	assert.ok(match, "should find deleteRun function");
	assert.match(match[0], /disabled/);
});

test("P4: click-outside handlers for report-modal and file-viewer", () => {
	const script = extractScript();
	assert.match(script, /report-modal.*closeReportModal/);
	assert.match(script, /file-viewer.*closeFileViewer/);
});

test("P4: timestamp class used for formatted times", () => {
	const html = renderTeamPage();
	assert.match(html, /\.ts\s*\{/);
});

test("P4: attempt-card CSS class defined", () => {
	const html = renderTeamPage();
	assert.match(html, /\.attempt-card/);
	assert.match(html, /\.file-chip/);
});

test("P4: inline scripts are still valid JavaScript with P4 changes", () => {
	const html = renderTeamPage();
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
	assert.ok(scripts.length > 0);
	for (const script of scripts) {
		assert.doesNotThrow(() => new Function(script), "inline script should be valid JS after P4 changes");
	}
});


// ── P5: attempt lifecycle UI tests ──

test("P5: PHASE_LABELS includes attempt lifecycle phases", () => {
	const html = renderTeamPage();
	assert.match(html, /worker_completed.*执行完成/);
	assert.match(html, /checker_passed.*验收通过/);
	assert.match(html, /checker_revising.*验收修改/);
	assert.match(html, /checker_failed.*验收失败/);
	assert.match(html, /watcher_accepted.*复盘通过/);
	assert.match(html, /watcher_revision_requested.*复盘请求重做/);
	assert.match(html, /watcher_confirmed_failed.*复盘确认失败/);
	assert.match(html, /created.*已创建/);
});

test("P5: attempt card renders lifecycle summary lines", () => {
	const script = extractScript();
	assert.match(script, /lcLines/);
	assert.match(script, /a\.phase/);
	assert.match(script, /a\.worker/);
	assert.match(script, /a\.checker/);
	assert.match(script, /a\.watcher/);
	assert.match(script, /phaseLabel\(a\.phase\)/);
});

test("P5: checker verdict chain uses escapeHtml", () => {
	const script = extractScript();
	assert.match(script, /escapeHtml\(c\.verdict\)/);
});

test("P5: watcher decision uses escapeHtml", () => {
	const script = extractScript();
	assert.match(script, /escapeHtml\(a\.watcher\.decision\)/);
});

test("P5: resultRef and errorSummary use escapeHtml", () => {
	const script = extractScript();
	assert.match(script, /escapeHtml\(a\.resultRef\)/);
	assert.match(script, /escapeHtml\(a\.errorSummary\)/);
});

test("P5: PHASE_COLORS includes attempt lifecycle phases", () => {
	const html = renderTeamPage();
	assert.match(html, /checker_passed.*phase-success/);
	assert.match(html, /checker_failed.*phase-fail/);
	assert.match(html, /watcher_accepted.*phase-success/);
	assert.match(html, /watcher_revision_requested.*phase-warn/);
	assert.match(html, /watcher_confirmed_failed.*phase-fail/);
});

test("P5: inline scripts remain valid JavaScript after P5 changes", () => {
	const html = renderTeamPage();
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
	assert.ok(scripts.length > 0);
	for (const script of scripts) {
		assert.doesNotThrow(() => new Function(script), "inline script should be valid JS after P5 changes");
	}
});

// ── P8-C: role runtime context UI ──

test("P8-C: attempt cards render role runtime context", () => {
	const script = extractScript();
	assert.match(script, /function renderRuntimeContext\(role,\s*ctx\)/);
	assert.match(script, /runtime-context/);
	assert.match(script, /requestedProfileId/);
	assert.match(script, /resolvedProfileId/);
	assert.match(script, /browserId/);
	assert.match(script, /browserScope/);
	assert.match(script, /fallbackUsed/);
	assert.match(script, /fallbackReason/);
	assert.match(script, /renderRuntimeContext\('worker'/);
	assert.match(script, /renderRuntimeContext\('checker'/);
	assert.match(script, /renderRuntimeContext\('watcher'/);
});

test("P8-C: runtime context dynamic values are escaped", () => {
	const script = extractScript();
	assert.match(script, /escapeHtml\(role\)/);
	assert.match(script, /escapeHtml\(ctx\.requestedProfileId\)/);
	assert.match(script, /escapeHtml\(ctx\.resolvedProfileId\)/);
	assert.match(script, /escapeHtml\(ctx\.fallbackReason\)/);
	assert.match(script, /escapeHtml\(ctx\.browserId/);
	assert.match(script, /escapeHtml\(ctx\.browserScope\)/);
});

test("P8-C: runtime context has compact CSS and fallback badge", () => {
	const html = renderTeamPage();
	assert.match(html, /\.runtime-context/);
	assert.match(html, /\.runtime-context-fallback/);
	assert.match(html, /fallback/);
});

// ── P8-D: finalizer runtime context UI ──

test("P8-D: task detail renders finalizer runtime context from run state", () => {
	const script = extractScript();
	assert.match(script, /finalizerRuntimeContext/);
	assert.match(script, /renderRuntimeContext\('finalizer',\s*state\.finalizerRuntimeContext\)/);
	assert.match(script, /finalizer-runtime/);
});

test("P8-E: renderTaskDetail escapes role runtime context values", () => {
	const script = extractScript();
	const helperStart = script.indexOf("function escapeHtml");
	const helperEnd = script.indexOf("async function editTeamUnit");
	assert.ok(helperStart >= 0, "should find helper source start");
	assert.ok(helperEnd > helperStart, "should find helper source end");
	const helperSource = script.slice(helperStart, helperEnd);
	const renderTaskDetail = new Function(helperSource + "\nreturn renderTaskDetail;")() as (state: any, plan: any, attemptsMap: any) => string;
	const maliciousContext = {
		requestedProfileId: "<script>alert(1)</script>",
		resolvedProfileId: "\" onclick=\"bad",
		browserId: "browser<&>",
		browserScope: "scope\" onmouseover=\"bad",
		fallbackUsed: true,
		fallbackReason: "'><img src=x onerror=bad>",
	};
	const state = {
		runId: "run_<bad>",
		finalizerRuntimeContext: maliciousContext,
		taskStates: {
			t1: { status: "succeeded", progress: { phase: "succeeded", message: "done" }, attemptCount: 1, activeAttemptId: "attempt_1" },
		},
	};
	const plan = { tasks: [{ id: "t1", title: "<b>task</b>" }] };
	const attemptsMap = {
		t1: [{
			status: "succeeded",
			attemptId: "attempt_<bad>",
			createdAt: "2026-05-16T00:00:00.000Z",
			phase: "succeeded",
			worker: [{ runtimeContext: maliciousContext }],
			checker: [{ verdict: "pass", runtimeContext: maliciousContext }],
			watcher: { decision: "accept", runtimeContext: maliciousContext },
			files: [],
		}],
	};

	const html = renderTaskDetail(state, plan, attemptsMap);

	assert.doesNotMatch(html, /<script>/);
	assert.doesNotMatch(html, /<img/);
	assert.doesNotMatch(html, /onclick="bad/);
	assert.doesNotMatch(html, /onmouseover="bad/);
	assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
	assert.match(html, /&quot; onclick=&quot;bad/);
	assert.match(html, /scope&quot; onmouseover=&quot;bad/);
	assert.match(html, /&lt;img src=x onerror=bad&gt;/);
});

// ── P12 Task 1: toast + confirmAction replaces system dialogs ──

test("P12-T1: page has toast root container", () => {
	const html = renderTeamPage();
	assert.match(html, /id="team-toast-root"/);
});

test("P12-T1: page has confirm modal", () => {
	const html = renderTeamPage();
	assert.match(html, /id="team-confirm-modal"/);
	assert.match(html, /id="confirm-message"/);
	assert.match(html, /id="confirm-ok"/);
	assert.match(html, /id="confirm-cancel"/);
});

test("P12-T1: inline script contains no native alert()", () => {
	const html = renderTeamPage();
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
	const scriptContent = scripts.join('');
	assert.doesNotMatch(scriptContent, /\balert\s*\(/, "script must not contain native alert()");
});

test("P12-T1: inline script contains no native confirm()", () => {
	const html = renderTeamPage();
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
	const scriptContent = scripts.join('');
	assert.doesNotMatch(scriptContent, /\bconfirm\s*\(/, "script must not contain native confirm()");
});

test("P12-T1: showToast and showError and showSuccess helpers exist", () => {
	const script = extractScript();
	assert.match(script, /function showToast\(message,\s*type\)/);
	assert.match(script, /function showError\(message\)/);
	assert.match(script, /function showSuccess\(message\)/);
});

test("P12-T1: confirmAction returns Promise and uses confirm modal", () => {
	const script = extractScript();
	assert.match(script, /function confirmAction\(opts\)/);
	assert.match(script, /return new Promise/);
	assert.match(script, /confirm-ok/);
	assert.match(script, /confirm-cancel/);
});

test("P12-T1: confirmAction used in archiveTeamUnit", () => {
	const script = extractScript();
	const match = script.match(/async function archiveTeamUnit[\s\S]*?^}/m);
	assert.ok(match, "should find archiveTeamUnit");
	assert.match(match[0], /confirmAction/);
	assert.match(match[0], /danger:\s*true/);
});

test("P12-T1: confirmAction used in deletePlan", () => {
	const script = extractScript();
	const match = script.match(/async function deletePlan[\s\S]*?^}/m);
	assert.ok(match, "should find deletePlan");
	assert.match(match[0], /confirmAction/);
	assert.match(match[0], /danger:\s*true/);
});

test("P12-T1: confirmAction used in deleteRun", () => {
	const script = extractScript();
	const match = script.match(/async function deleteRun[\s\S]*?^}/m);
	assert.ok(match, "should find deleteRun");
	assert.match(match[0], /confirmAction/);
	assert.match(match[0], /danger:\s*true/);
});

test("P12-T1: toast uses textContent not innerHTML for safety", () => {
	const script = extractScript();
	const showToastMatch = script.match(/function showToast\(message,\s*type\)[\s\S]*?^}/m);
	assert.ok(showToastMatch, "should find showToast");
	assert.match(showToastMatch[0], /textContent/);
});

test("P12-T1: CSS defines toast and confirm styles", () => {
	const html = renderTeamPage();
	assert.match(html, /\.toast-success/);
	assert.match(html, /\.toast-error/);
	assert.match(html, /\.toast-info/);
	assert.match(html, /\.confirm-box/);
	assert.match(html, /#team-confirm-modal/);
});

// ── P12 Task 2: Plan modal replaces prompt() ──

test("P12-T2: inline script contains no native prompt()", () => {
	const html = renderTeamPage();
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
	const scriptContent = scripts.join('');
	assert.doesNotMatch(scriptContent, /\bprompt\s*\(/, "script must not contain native prompt()");
});

test("P12-T2: page has plan-modal with form fields", () => {
	const html = renderTeamPage();
	assert.match(html, /id="plan-modal"/);
	assert.match(html, /id="plan-title"/);
	assert.match(html, /id="plan-teamunit"/);
	assert.match(html, /id="plan-goal"/);
	assert.match(html, /id="plan-task-title"/);
	assert.match(html, /id="plan-task-text"/);
	assert.match(html, /id="plan-acceptance"/);
	assert.match(html, /id="plan-output-contract"/);
});

test("P12-T2: savePlan function exists and constructs acceptance rules", () => {
	const script = extractScript();
	assert.match(script, /async function savePlan\(\)/);
	assert.match(script, /acceptanceText\.split/);
	assert.match(script, /acceptance:.*rules/);
});

test("P12-T2: createPlan opens modal instead of using prompt", () => {
	const script = extractScript();
	const match = script.match(/async function createPlan[\s\S]*?^}/m);
	assert.ok(match, "should find createPlan");
	assert.match(match[0], /plan-modal/);
	assert.match(match[0], /classList\.add\('open'\)/);
});

test("P12-T2: plan-modal has click-outside close handler", () => {
	const script = extractScript();
	assert.match(script, /plan-modal[\s\S]*closePlanModal/);
});

test("P12-T2: savePlan shows error on empty title", () => {
	const script = extractScript();
	const match = script.match(/async function savePlan[\s\S]*?^}/m);
	assert.ok(match, "should find savePlan");
	assert.match(match[0], /showError.*计划名称/);
});

test("P12-T2: savePlan uses buildNormalPlanPayload for value reading", () => {
	const script = extractScript();
	const match = script.match(/async function savePlan[\s\S]*?^}/m);
	assert.ok(match, "should find savePlan");
	assert.match(match[0], /buildNormalPlanPayload|buildDynamicPlanPayload/);
	// buildNormalPlanPayload reads .value from DOM elements
	assert.match(script, /buildNormalPlanPayload[\s\S]*?plan-title.*\.value/);
	assert.match(script, /buildNormalPlanPayload[\s\S]*?plan-goal.*\.value/);
});

// ── P12 Task 3: Console overview and summary ──

test("P12-T3: page has console header with subtitle", () => {
	const html = renderTeamPage();
	assert.match(html, /Team 控制台/);
	assert.match(html, /多角色执行/);
});

test("P12-T3: page has summary nodes with correct IDs", () => {
	const html = renderTeamPage();
	assert.match(html, /id="summary-plans"/);
	assert.match(html, /id="summary-teams"/);
	assert.match(html, /id="summary-active-runs"/);
	assert.match(html, /team-summary/);
});

test("P12-T3: updateSummary function exists", () => {
	const script = extractScript();
	assert.match(script, /function updateSummary\(plans,\s*teams,\s*runs\)/);
});

test("P12-T3: loadPlans calls updateSummary", () => {
	const script = extractScript();
	const loadPlansMatch = script.match(/async function loadPlans[\s\S]*?^}/m);
	assert.ok(loadPlansMatch, "should find loadPlans");
	assert.match(loadPlansMatch[0], /updateSummary/);
});

test("P12-T3: loadRuns calls updateSummary and sorts active first", () => {
	const script = extractScript();
	assert.match(script, /loadRuns[\s\S]*?updateSummary/);
	// Verify sort puts active runs before inactive: ACTIVE_STATUS[a] ? 0 : 1 minus ACTIVE_STATUS[b]
	// i.e. (active_a ? 0 : 1) - (active_b ? 0 : 1) => active items get 0, sorted to front
	assert.match(script, /ACTIVE_STATUS\[a\.status\] \? 0 : 1\) - \(ACTIVE_STATUS\[b\.status\]/);
});

test("P12-T3: empty states include action links", () => {
	const script = extractScript();
	assert.match(script, /detail-toggle.*createPlan/);
	assert.match(script, /detail-toggle.*openTeamUnitModal/);
	assert.match(script, /showSection.*plans/);
});

// ── P12 Task 4: Run action and danger operation UX ──

test("P12-T4: cancelRunWithConfirm function exists with confirmAction", () => {
	const script = extractScript();
	assert.match(script, /async function cancelRunWithConfirm\(runId\)/);
	assert.match(script, /cancelRunWithConfirm[\s\S]*?confirmAction/);
});

test("P12-T4: cancel buttons use cancelRunWithConfirm, not direct controlRun", () => {
	const script = extractScript();
	// Cancel buttons should have onclick="cancelRunWithConfirm..."
	assert.match(script, /onclick="cancelRunWithConfirm/);
	// No onclick should call controlRun with cancel action
	assert.doesNotMatch(script, /onclick="controlRun[^"]*cancel/);
});

test("P12-T4: pause/resume buttons do not require confirmation", () => {
	const script = extractScript();
	assert.match(script, /onclick="controlRun[^"]*pause/);
	assert.match(script, /onclick="controlRun[^"]*resume/);
});

test("P12-T4: delete buttons use confirmAction via deleteRun", () => {
	const script = extractScript();
	assert.match(script, /async function deleteRun[\s\S]*?confirmAction/);
	assert.match(script, /async function deleteRun[\s\S]*?danger:\s*true/);
});

test("P12-T4: cancel confirm has clear impact description", () => {
	const script = extractScript();
	assert.match(script, /cancelRunWithConfirm[\s\S]*?不可恢复/);
});

// ── P13 Task 1: Structured Plan Cards ──

test("P13-T1: renderPlanCard function exists and renders structured card", () => {
	const script = extractScript();
	assert.match(script, /function renderPlanCard\(plan\)/);
});

test("P13-T1: renderPlanTaskPreview renders task with title and input", () => {
	const script = extractScript();
	assert.match(script, /function renderPlanTaskPreview\(task/);
	assert.match(script, /renderPlanTaskPreview[\s\S]*?escapeHtml.*task/);
});

test("P13-T1: renderAcceptanceRules renders rule list with escapeHtml", () => {
	const script = extractScript();
	assert.match(script, /function renderAcceptanceRules\(rules\)/);
	assert.match(script, /renderAcceptanceRules[\s\S]*?escapeHtml/);
});

test("P13-T1: truncateText function exists", () => {
	const script = extractScript();
	assert.match(script, /function truncateText\(text/);
});

test("P13-T1: loadPlans uses renderPlanCard", () => {
	const script = extractScript();
	assert.match(script, /plans\.map\(renderPlanCard\)/);
});

test("P13-T1: plan card renders outputContract", () => {
	const script = extractScript();
	assert.match(script, /renderPlanCard[\s\S]*?outputContract/);
});

test("P13-T1: plan card escapes goal and output text", () => {
	const script = extractScript();
	assert.match(script, /renderPlanSummary[\s\S]*?escapeHtml.*goal/);
	assert.match(script, /renderPlanSummary[\s\S]*?escapeHtml.*output/);
});

test("P13-T1: plan card handles missing fields", () => {
	const script = extractScript();
	assert.match(script, /Array\.isArray\(safePlan\.tasks\)/);
	assert.match(script, /safePlan\.goal && safePlan\.goal\.text/);
});

test("P13-fix: structured plan card guards non-array acceptance rules", () => {
	const script = extractScript();
	assert.match(script, /Array\.isArray\(rules\)/);
	assert.doesNotMatch(script, /if \(!rules \|\| !rules\.length\)/);
});

// ── P13 Task 2: Expand/Collapse Long Task Lists ──

test("P13-T2: togglePlanTasks function exists", () => {
	const script = extractScript();
	assert.match(script, /function togglePlanTasks\(/);
});

test("P13-T2: PLAN_TASK_PREVIEW_LIMIT constant limits default rendering", () => {
	const script = extractScript();
	assert.match(script, /PLAN_TASK_PREVIEW_LIMIT/);
	assert.match(script, /PLAN_TASK_PREVIEW_LIMIT/);
});

test("P13-T2: expand button shows when tasks exceed limit", () => {
	const script = extractScript();
	assert.match(script, /展开任务列表/);
	assert.match(script, /收起任务/);
});

test("P13-T2: planId uses jsArg for safe onclick", () => {
	const script = extractScript();
	assert.match(script, /togglePlanTasks[\s\S]*?jsArg/);
});

// ── P13 Task 3: Plan JSON Viewer ──

test("P13-T3: plan-json-modal element exists in HTML", () => {
	const html = renderTeamPage();
	assert.match(html, /id="plan-json-modal"/);
});

test("P13-T3: viewPlanJson uses _latestPlans", () => {
	const script = extractScript();
	assert.match(script, /function viewPlanJson\(/);
	assert.match(script, /viewPlanJson[\s\S]*?_latestPlans/);
});

test("P13-T3: JSON rendering uses textContent for safety", () => {
	const script = extractScript();
	assert.match(script, /viewPlanJson[\s\S]*?textContent[\s\S]*?JSON\.stringify/);
});

test("P13-T3: card action area includes JSON viewer button", () => {
	const script = extractScript();
	assert.match(script, /renderPlanCard[\s\S]*?查看 JSON/);
});

// ── P13 Task 4: Plan Card Visual Polish ──

test("P13-T4: key CSS classes exist for plan card structure", () => {
	const html = renderTeamPage();
	assert.match(html, /\.plan-card/);
	assert.match(html, /\.plan-card-header/);
	assert.match(html, /\.plan-card-title/);
	assert.match(html, /\.plan-card-chips/);
	assert.match(html, /\.plan-chip/);
	assert.match(html, /\.plan-summary/);
	assert.match(html, /\.plan-task-row/);
	assert.match(html, /\.plan-task-row-head/);

	assert.match(html, /\.plan-task-details/);
	assert.match(html, /\.acceptance-list/);
	assert.match(html, /\.acceptance-rule/);
	assert.match(html, /\.plan-actions/);
});

test("P13-T4: plan card has mobile responsive rules", () => {
	const html = renderTeamPage();
	assert.match(html, /@media\s*\(max-width:\s*720px\)[\s\S]*?plan-task/);
});

test("P13-T4: long text has overflow-wrap or word-break constraints", () => {
	const html = renderTeamPage();
	assert.match(html, /overflow-wrap:\s*break-word|word-break:\s*break-word/);
});

// ── P12 Bug fixes ──

test("P12-fix: initial load fetches plans, teams, and runs", () => {
	const script = extractScript();
	assert.match(script, /loadAgents[\s\S]*?loadPlans[\s\S]*?loadTeams[\s\S]*?loadRuns/);
});

test("P12-fix: createPlan wraps team-units API call in try/catch", () => {
	const script = extractScript();
	assert.match(script, /createPlan[\s\S]*?try.*api.*team-units.*catch.*showError/);
});

// ── P12 Task 5: Detail modal polish and readability ──

test("P12-T5: report and file modals use unified modal-panel class", () => {
	const html = renderTeamPage();
	assert.match(html, /id="report-modal"[\s\S]*?modal-panel/);
	assert.match(html, /id="file-viewer"[\s\S]*?modal-panel/);
});

test("P12-T5: report modal has copy button", () => {
	const html = renderTeamPage();
	assert.match(html, /copy-btn.*copyReport/);
	assert.match(html, /function copyReport/);
});

test("P12-T5: copyReport uses textContent for safety", () => {
	const script = extractScript();
	assert.match(script, /copyReport[\s\S]*?textContent/);
});

test("P12-T5: attempt files use file-chip class", () => {
	const script = extractScript();
	assert.match(script, /file-chip/);
	assert.doesNotMatch(script, /attempt-file/);
});

test("P12-T5: runtime context uses details/summary for collapse", () => {
	const script = extractScript();
	assert.match(script, /runtime-context-wrap/);
	assert.match(script, /<details class="runtime-context-wrap">/);
	assert.match(script, /<summary>/);
});

test("P12-T5: runtime context dynamic values still use escapeHtml", () => {
	const script = extractScript();
	assert.match(script, /renderRuntimeContext[\s\S]*?escapeHtml/);
});

test("P12-T5: attempt file links use jsArg and pathSegment", () => {
	const script = extractScript();
	assert.match(script, /viewAttemptFile[\s\S]*?jsArg/);
	assert.match(script, /viewAttemptFile[\s\S]*?pathSegment/);
});

test("P12-T5: CSS has mobile responsive breakpoint", () => {
	const html = renderTeamPage();
	assert.match(html, /@media \(max-width: 720px\)/);
});

test("P12-T5: modals use modal-header and modal-body classes", () => {
	const html = renderTeamPage();
	assert.match(html, /modal-header/);
	assert.match(html, /modal-body/);
});


// ── P14 Task 1: Compact Plan Card Rendering Tests ──

// Helper: extract renderPlanCard from inline script and execute it
function extractRenderPlanCard(): (plan: any) => string {
	const script = extractScript();
	const start = script.indexOf("function escapeHtml");
	const end = script.indexOf("async function loadPlans");
	assert.ok(start >= 0, "should find escapeHtml start");
	assert.ok(end > start, "should find loadPlans boundary");
	const source = script.slice(start, end);
	// Use eval to build the function with a literal \n in the source
	const wrapped = source + "\nreturn renderPlanCard;";
	const fn = new Function(wrapped);
	return fn();
}

// Representative fixture with long text and 5 tasks
const longPlan = {
	planId: "plan_p14_test",
	title: "P14 测试计划",
	defaultTeamUnitId: "tu_001",
	goal: { text: "这是一个很长的目标文本，用于验证紧凑卡片不会把全部内容摊开。".repeat(10) },
	tasks: [
		{ id: "t1", title: "任务一：初始化环境", input: { text: "这是任务一的详细输入内容，包含很多文字来测试截断效果。".repeat(8) }, acceptance: { rules: ["规则一：必须完成X功能", "规则二：必须通过Y测试", "规则三：必须包含Z文档"] } },
		{ id: "t2", title: "任务二：数据迁移", input: { text: "短输入" }, acceptance: { rules: ["规则A：数据完整"] } },
		{ id: "t3", title: "任务三：接口联调", input: { text: "第三任务输入" }, acceptance: { rules: ["规则B", "规则C"] } },
		{ id: "t4", title: "任务四：压力测试", input: { text: "第四任务的输入内容" }, acceptance: { rules: ["规则D", "规则E", "规则F", "规则G"] } },
		{ id: "t5", title: "任务五：上线验收", input: { text: "最后任务" }, acceptance: { rules: ["规则H"] } },
	],
	outputContract: { text: "这是一个很长的输出契约文本，用于验证输出不会默认全展开。".repeat(8) },
	archived: false,
	createdAt: "2026-05-16T10:00:00.000Z",
	updatedAt: "2026-05-16T10:00:00.000Z",
	runCount: 2,
};

test("P14-T1: renderPlanCard produces compact card with header and chips", () => {
	const renderPlanCard = extractRenderPlanCard();
	const html = renderPlanCard(longPlan);
	assert.match(html, /plan-card-header/);
	assert.match(html, /plan-card-title/);
	assert.match(html, /plan-card-chips/);
	assert.match(html, /plan-chip/);
	assert.match(html, /5 个任务/);
	assert.match(html, /2 次运行/);
});

test("P14-T1: renderPlanCard clips goal text in summary section", () => {
	const renderPlanCard = extractRenderPlanCard();
	const html = renderPlanCard(longPlan);
	assert.match(html, /plan-summary/);
	assert.match(html, /plan-summary-row/);
	assert.match(html, /plan-summary-label/);
	assert.match(html, /plan-summary-text/);
	// Goal text should be truncated, not shown in full
	const goalMatch = html.match(/plan-summary-text">([^<]*目标[^<]*)/);
	assert.ok(goalMatch, "should find clipped goal text in summary");
	const displayedGoal = goalMatch[1];
	assert.ok(displayedGoal.length < longPlan.goal.text.length, "goal should be clipped");
});

test("P14-T1: renderPlanCard clips output contract in summary", () => {
	const renderPlanCard = extractRenderPlanCard();
	const html = renderPlanCard(longPlan);
	// Output contract text should be truncated
	const outputMatch = html.match(/plan-summary-text">([^<]*输出[^<]*)/);
	assert.ok(outputMatch, "should find clipped output text in summary");
	const displayedOutput = outputMatch[1];
	assert.ok(displayedOutput.length < longPlan.outputContract.text.length, "output should be clipped");
});

test("P14-T1: renderPlanCard uses compact task rows with metadata", () => {
	const renderPlanCard = extractRenderPlanCard();
	const html = renderPlanCard(longPlan);
	assert.match(html, /plan-task-row/);
	assert.match(html, /plan-task-row-head/);
	assert.match(html, /plan-task-num/);
	assert.match(html, /plan-task-meta/);
	assert.match(html, /任务一：初始化环境/);
	assert.match(html, /任务二：数据迁移/);
	assert.match(html, /任务三：接口联调/);
	assert.match(html, /\d+字/);
	assert.match(html, /\d+ 条验收/);
});

test("P14-T1: renderPlanCard hides task input and acceptance rules behind details toggle", () => {
	const renderPlanCard = extractRenderPlanCard();
	const html = renderPlanCard(longPlan);
	assert.match(html, /plan-task-details/);
	assert.match(html, /<details/);
	assert.match(html, /展开详情/);
	// Input text should be inside details, not in the visible row
	const longInput = longPlan.tasks[0].input.text;
	// The raw input should be in the details section, but we verify details exist
	assert.match(html, /plan-task-detail-input/);
});

test("P14-T1: renderPlanCard shows task list toggle for plans with tasks", () => {
	const renderPlanCard = extractRenderPlanCard();
	const html = renderPlanCard(longPlan);
	assert.match(html, /展开任务列表/);
	assert.match(html, /data-plan-extra/);
});

test("P14-T1: renderPlanCard preserves actions: JSON, create run, delete", () => {
	const renderPlanCard = extractRenderPlanCard();
	const html = renderPlanCard(longPlan);
	assert.match(html, /plan-actions/);
	assert.match(html, /查看 JSON/);
	assert.match(html, /创建运行/);
	// runCount=2, so delete button should NOT appear
	assert.doesNotMatch(html, /删除/);
	// With runCount=0, delete should appear
	const html2 = renderPlanCard({ ...longPlan, runCount: 0 });
	assert.match(html2, /删除/);
});

test("P14-T1: renderPlanCard handles missing fields gracefully", () => {
	const renderPlanCard = extractRenderPlanCard();
	assert.doesNotThrow(() => renderPlanCard({}));
	assert.doesNotThrow(() => renderPlanCard({ planId: "p1" }));
	assert.doesNotThrow(() => renderPlanCard({ planId: "p1", tasks: null }));
	assert.doesNotThrow(() => renderPlanCard({ planId: "p1", tasks: [{ title: "t" }] }));
	assert.doesNotThrow(() => renderPlanCard({ planId: "p1", tasks: [{ title: "t", acceptance: { rules: "not an array" } }] }));
	assert.doesNotThrow(() => renderPlanCard({ planId: "p1", tasks: [], goal: null, outputContract: null }));
	const html = renderPlanCard({ planId: "p1", tasks: [] });
	assert.match(html, /plan-card/);
	assert.match(html, /plan-card-header/);
	assert.match(html, /0 个任务/);
});

test("P14-T1: renderPlanCard escapes malicious content", () => {
	const renderPlanCard = extractRenderPlanCard();
	const malicious = {
		planId: "p_evil",
		title: '<script>alert("xss")</script>',
		goal: { text: '"><img src=x onerror=bad>' },
		tasks: [{
			id: "t1",
			title: '<script>evil</script>',
			input: { text: '" onclick="bad' },
			acceptance: { rules: ["<script>rule</script>", '" onmouseover="bad'] },
		}],
		outputContract: { text: "'; alert(1); //" },
		runCount: 0,
	};
	const html = renderPlanCard(malicious);
	assert.doesNotMatch(html, /<script>alert/);
	assert.doesNotMatch(html, /<script>evil/);
	assert.doesNotMatch(html, /<script>rule/);
	assert.doesNotMatch(html, /onclick="bad/);
	assert.doesNotMatch(html, /onmouseover="bad/);
	assert.doesNotMatch(html, /<img src=x/);
	assert.match(html, /&lt;script&gt;/);
});

test("P14-T1: renderPlanSummary and firstLine helpers exist", () => {
	const script = extractScript();
	assert.match(script, /function renderPlanSummary\(plan\)/);
	assert.match(script, /function firstLine\(text\)/);
	assert.match(script, /plan-task-details/);
	assert.match(script, /plan-task-detail-content/);
});

test("P14-T1: inline scripts remain valid JavaScript after P14 changes", () => {
	const html = renderTeamPage();
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
	assert.ok(scripts.length > 0);
	for (const script of scripts) {
		assert.doesNotThrow(() => new Function(script), "inline script should be valid JS after P14 changes");
	}
});

// ── P15: Dynamic task type UI rendering ──

test("P15: plan card renders discovery badge for discovery task", () => {
	const html = renderTeamPage();
	const plan = {
		schemaVersion: "team/plan-1", planId: "plan_dyn_1", title: "Dynamic Plan",
		defaultTeamUnitId: "tu_1", goal: { text: "discover" },
		tasks: [
			{ id: "disc", type: "discovery", title: "Discover items", input: { text: "Find" }, acceptance: { rules: ["JSON"] }, discovery: { outputKey: "items" } },
			{ id: "proc", type: "for_each", title: "Process", input: { text: "p" }, acceptance: { rules: ["ok"] }, forEach: { itemsFrom: "disc.items", mode: "sequential", taskTemplate: { title: "P {{item.title}}", input: { text: "p" }, acceptance: { rules: ["ok"] } } } },
		],
		outputContract: { text: "report" }, archived: false, createdAt: "", updatedAt: "", runCount: 0,
	};
	assert.match(html, /discovery/);
	assert.match(html, /for_each/);
});

test("P15: plan card renders for_each itemsFrom", () => {
	const html = renderTeamPage();
	assert.match(html, /for_each/);
});

test("P15: old plan without type does not crash UI", () => {
	const html = renderTeamPage();
	const plan = {
		schemaVersion: "team/plan-1", planId: "plan_old", title: "Old Plan",
		defaultTeamUnitId: "tu_1", goal: { text: "normal" },
		tasks: [
			{ id: "t1", title: "Normal task", input: { text: "do" }, acceptance: { rules: ["ok"] } },
		],
		outputContract: { text: "out" }, archived: false, createdAt: "", updatedAt: "", runCount: 0,
	};
	assert.match(html, /task-row/);
	assert.ok(!html.includes('type="discovery"'));
});

// ── P15 Review Fix: generated child task rendering ──

test("P15-fix: renderTaskDetail shows generated child tasks not in plan.tasks", () => {
	const script = extractScript();
	const helperStart = script.indexOf("function escapeHtml");
	const helperEnd = script.indexOf("async function editTeamUnit");
	assert.ok(helperStart >= 0);
	assert.ok(helperEnd > helperStart);
	const helperSource = script.slice(helperStart, helperEnd);
	const renderFn = new Function(helperSource + "\nreturn renderTaskDetail;")() as (state: any, plan: any, attemptsMap: any) => string;
	const state = {
		runId: "run_test",
		taskStates: {
			process: { status: "succeeded", progress: { phase: "succeeded", message: "done" }, attemptCount: 0, activeAttemptId: null },
			"process__a": { status: "succeeded", progress: { phase: "succeeded", message: "done" }, attemptCount: 1, activeAttemptId: null },
			"process__b": { status: "succeeded", progress: { phase: "succeeded", message: "done" }, attemptCount: 1, activeAttemptId: null },
		},
	};
	const plan = {
		tasks: [
			{ id: "process", title: "Process each", type: "for_each" },
		],
	};
	const attemptsMap = {
		"process__a": [{ status: "succeeded", attemptId: "attempt_a", createdAt: "", phase: "succeeded", worker: [], checker: [], files: [] }],
		"process__b": [{ status: "succeeded", attemptId: "attempt_b", createdAt: "", phase: "succeeded", worker: [], checker: [], files: [] }],
	};
	const html = renderFn(state, plan, attemptsMap);
	assert.match(html, /process__a/, "generated child task a should appear");
	assert.match(html, /process__b/, "generated child task b should appear");
});

test("P15-fix: generated child tasks are labeled as sub-tasks", () => {
	const script = extractScript();
	const helperStart = script.indexOf("function escapeHtml");
	const helperEnd = script.indexOf("async function editTeamUnit");
	const helperSource = script.slice(helperStart, helperEnd);
	const renderFn = new Function(helperSource + "\nreturn renderTaskDetail;")() as (state: any, plan: any, attemptsMap: any) => string;
	const state = {
		runId: "run_test",
		taskStates: {
			fe: { status: "succeeded", progress: { phase: "succeeded", message: "" }, attemptCount: 0, activeAttemptId: null },
			"fe__x": { status: "succeeded", progress: { phase: "succeeded", message: "" }, attemptCount: 1, activeAttemptId: null },
		},
	};
	const plan = { tasks: [{ id: "fe", title: "ForEach Task" }] };
	const html = renderFn(state, plan, {});
	assert.match(html, /子任务|sub.?task/i, "generated children should be labeled");
});

test("P15-fix: generated child task ids are escaped", () => {
	const script = extractScript();
	const helperStart = script.indexOf("function escapeHtml");
	const helperEnd = script.indexOf("async function editTeamUnit");
	const helperSource = script.slice(helperStart, helperEnd);
	const renderFn = new Function(helperSource + "\nreturn renderTaskDetail;")() as (state: any, plan: any, attemptsMap: any) => string;
	const state = {
		runId: "run_test",
		taskStates: {
			t1: { status: "pending", progress: null, attemptCount: 0, activeAttemptId: null },
			"t1__<script>": { status: "pending", progress: null, attemptCount: 0, activeAttemptId: null },
		},
	};
	const plan = { tasks: [{ id: "t1", title: "T1" }] };
	const html = renderFn(state, plan, {});
	assert.doesNotMatch(html, /<script>/, "child task id should be escaped");
});

test("P15-fix: old runs without generated tasks render as before", () => {
	const script = extractScript();
	const helperStart = script.indexOf("function escapeHtml");
	const helperEnd = script.indexOf("async function editTeamUnit");
	const helperSource = script.slice(helperStart, helperEnd);
	const renderFn = new Function(helperSource + "\nreturn renderTaskDetail;")() as (state: any, plan: any, attemptsMap: any) => string;
	const state = {
		runId: "run_old",
		taskStates: {
			t1: { status: "succeeded", progress: { phase: "succeeded", message: "done" }, attemptCount: 1, activeAttemptId: null },
		},
	};
	const plan = { tasks: [{ id: "t1", title: "Task 1" }] };
	const html = renderFn(state, plan, {});
	assert.match(html, /Task 1/);
	assert.doesNotMatch(html, /子任务|sub.?task/i, "no sub-task label for normal runs");
});

	// ── P16 Task 1: Dynamic plan authoring mode ──

	test("P16-T1: plan modal contains mode selector for normal vs dynamic", () => {
		const html = renderTeamPage();
		assert.match(html, /plan-mode/);
		assert.match(html, /普通计划/);
		assert.match(html, /发现后逐项处理/);
	});

	test("P16-T1: normal mode still renders existing fields and save path", () => {
		const html = renderTeamPage();
		// Existing fields still present
		assert.match(html, /id="plan-title"/);
		assert.match(html, /id="plan-goal"/);
		assert.match(html, /id="plan-task-title"/);
		assert.match(html, /id="plan-task-text"/);
		assert.match(html, /id="plan-acceptance"/);
		assert.match(html, /id="plan-output-contract"/);
		// savePlan function still exists
		const script = extractScript();
		assert.match(script, /async function savePlan\(\)/);
	});

	test("P16-T1: dynamic mode renders fields for discovery and child task template", () => {
		const html = renderTeamPage();
		// Dynamic-specific fields
		assert.match(html, /id="plan-dynamic-fields"/);
		assert.match(html, /id="plan-disc-title"/);
		assert.match(html, /id="plan-disc-instruction"/);
		assert.match(html, /id="plan-disc-output-key"/);
		assert.match(html, /id="plan-disc-acceptance"/);
		assert.match(html, /id="plan-child-title"/);
		assert.match(html, /id="plan-child-instruction"/);
		assert.match(html, /id="plan-child-acceptance"/);
	});

test("P16-T1: buildDynamicPlanPayload generates discovery + for_each tasks", () => {
	const script = extractScript();
	assert.match(script, /function buildDynamicPlanPayload\(\)/);
	const helperStart = script.indexOf("function escapeHtml");
	const helperEnd = script.indexOf("async function startRun");
	const source = script.slice(helperStart, helperEnd);
	const stubDollar = 'function $(id) { return { value: id === "plan-disc-output-key" ? "items" : "test", style: {}, classList: { add: function(){}, remove: function(){} } }; }';
	const fn = new Function(stubDollar + "\n" + source + "\nreturn buildDynamicPlanPayload;")() as () => any;
	const payload = fn();
	assert.ok(payload, "buildDynamicPlanPayload should return a value");
	assert.equal(payload.tasks.length, 2, "should have exactly 2 tasks");
	assert.equal(payload.tasks[0].type, "discovery");
	assert.equal(payload.tasks[1].type, "for_each");
});

test("P16-T1: for_each itemsFrom is derived from discovery task id + output key", () => {
	const script = extractScript();
	const helperStart = script.indexOf("function escapeHtml");
	const helperEnd = script.indexOf("async function startRun");
	const source = script.slice(helperStart, helperEnd);
	const stubDollar = 'function $(id) { return { value: id === "plan-disc-output-key" ? "items" : "test", style: {}, classList: { add: function(){}, remove: function(){} } }; }';
	const fn = new Function(stubDollar + "\n" + source + "\nreturn buildDynamicPlanPayload;")() as () => any;
	const payload = fn();
	const discTask = payload.tasks[0];
	const feTask = payload.tasks[1];
	assert.equal(feTask.forEach.itemsFrom, discTask.id + "." + discTask.discovery.outputKey);
});

	test("P16-T1: user dynamic field values are escaped in HTML preview", () => {
		const script = extractScript();
		assert.match(script, /function renderPlanPreview\(/);
		// Preview uses textContent, not innerHTML
		assert.match(script, /renderPlanPreview[\s\S]*?textContent[\s\S]*?JSON\.stringify/);
	});

	// ── P16 Task 2: Dynamic plan submission ──

	test("P16-T2: savePlan sends dynamic payload when dynamic mode is active", () => {
		const script = extractScript();
		const match = script.match(/async function savePlan[\s\S]*?^}/m);
		assert.ok(match, "should find savePlan");
		assert.match(match[0], /currentPlanMode/);
		assert.match(match[0], /buildDynamicPlanPayload/);
		assert.match(match[0], /buildNormalPlanPayload/);
	});

	test("P16-T2: dynamic mode requires discovery instruction", () => {
		const script = extractScript();
		const match = script.match(/async function savePlan[\s\S]*?^}/m);
		assert.ok(match, "should find savePlan");
		assert.match(match[0], /plan-disc-instruction/);
		assert.match(match[0], /发现指令/);
	});

	test("P16-T2: dynamic mode requires child instruction template", () => {
		const script = extractScript();
		const match = script.match(/async function savePlan[\s\S]*?^}/m);
		assert.ok(match, "should find savePlan");
		assert.match(match[0], /plan-child-instruction/);
		assert.match(match[0], /子任务指令模板/);
	});

	test("P16-fix: dynamic save requires matching JSON preview before API submit", () => {
		const script = extractScript();
		const match = script.match(/async function savePlan[\s\S]*?^}/m);
		assert.ok(match, "should find savePlan");
		assert.match(match[0], /previewPre\.textContent !== previewJson/);
		assert.match(match[0], /renderPlanPreview\(payload\)/);
		assert.match(match[0], /请先检查 Plan JSON 预览/);
		assert.ok(
			match[0].indexOf("previewPre.textContent !== previewJson") < match[0].indexOf("await api('/plans'"),
			"preview guard must run before POST /plans",
		);
	});

	test("P16-T2: inline scripts remain valid after P16-T2 changes", () => {
		const html = renderTeamPage();
		const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
		assert.ok(scripts.length > 0);
		for (const script of scripts) {
			assert.doesNotThrow(() => new Function(script), "inline script should be valid JS");
		}
	});

	// ── P16 Task 3: Dynamic plan card information hierarchy ──

	test("P16-T3: dynamic plan card shows compact discovery-foreach structure", () => {
		const renderPlanCard = extractRenderPlanCard();
		const plan = {
			planId: "plan_dyn", title: "Dynamic Plan", goal: { text: "discover and process" },
			tasks: [
				{ id: "disc", type: "discovery", title: "Discover items", input: { text: "Find items" }, acceptance: { rules: ["JSON"] }, discovery: { outputKey: "items" } },
				{ id: "proc", type: "for_each", title: "Process", input: { text: "p" }, acceptance: { rules: ["ok"] }, forEach: { itemsFrom: "disc.items", mode: "sequential", taskTemplate: { title: "P {{item.title}}", input: { text: "p" }, acceptance: { rules: ["ok"] } } } },
			],
			outputContract: { text: "report" }, runCount: 0,
		};
		const html = renderPlanCard(plan);
		// Should show compact structure marker
		assert.match(html, /发现.*逐项处理|discovery.*for_each/);
	});

	test("P16-T3: dynamic plan card shows discovery outputKey", () => {
		const renderPlanCard = extractRenderPlanCard();
		const plan = {
			planId: "plan_dyn2", title: "Dyn", goal: { text: "g" },
			tasks: [
				{ id: "d", type: "discovery", title: "Disc", input: { text: "d" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "domains" } },
				{ id: "p", type: "for_each", title: "Proc", input: { text: "p" }, acceptance: { rules: ["ok"] }, forEach: { itemsFrom: "d.domains", mode: "sequential", taskTemplate: { title: "T", input: { text: "t" }, acceptance: { rules: ["ok"] } } } },
			],
			outputContract: { text: "o" }, runCount: 0,
		};
		const html = renderPlanCard(plan);
		assert.match(html, /domains/);
	});

	test("P16-T3: dynamic plan card shows itemsFrom reference", () => {
		const renderPlanCard = extractRenderPlanCard();
		const plan = {
			planId: "plan_dyn3", title: "Dyn", goal: { text: "g" },
			tasks: [
				{ id: "d", type: "discovery", title: "Disc", input: { text: "d" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "items" } },
				{ id: "p", type: "for_each", title: "Proc", input: { text: "p" }, acceptance: { rules: ["ok"] }, forEach: { itemsFrom: "d.items", mode: "sequential", taskTemplate: { title: "T", input: { text: "t" }, acceptance: { rules: ["ok"] } } } },
			],
			outputContract: { text: "o" }, runCount: 0,
		};
		const html = renderPlanCard(plan);
		assert.match(html, /d\.items/);
	});

	test("P16-T3: dynamic plan card shows child task template title in compact section", () => {
		const renderPlanCard = extractRenderPlanCard();
		const plan = {
			planId: "plan_dyn4", title: "Dyn", goal: { text: "g" },
			tasks: [
				{ id: "d", type: "discovery", title: "Disc", input: { text: "d" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "items" } },
				{ id: "p", type: "for_each", title: "Proc", input: { text: "p" }, acceptance: { rules: ["ok"] }, forEach: { itemsFrom: "d.items", mode: "sequential", taskTemplate: { title: "Analyze {{item.title}}", input: { text: "t" }, acceptance: { rules: ["ok"] } } } },
			],
			outputContract: { text: "o" }, runCount: 0,
		};
		const html = renderPlanCard(plan);
		assert.match(html, /Analyze/);
	});

	test("P16-T3: long instructions remain collapsed by default", () => {
		const renderPlanCard = extractRenderPlanCard();
		const longInstruction = "This is a very long instruction that should not be fully visible in the default card view ".repeat(5);
		const plan = {
			planId: "plan_dyn5", title: "Dyn", goal: { text: longInstruction },
			tasks: [
				{ id: "d", type: "discovery", title: "Disc", input: { text: longInstruction }, acceptance: { rules: ["ok"] }, discovery: { outputKey: "items" } },
			],
			outputContract: { text: "o" }, runCount: 0,
		};
		const html = renderPlanCard(plan);
		// Long text should be truncated in summary
		assert.match(html, /plan-summary-text/);
	});

	test("P16-T3: dynamic plan card text is HTML-escaped", () => {
		const renderPlanCard = extractRenderPlanCard();
		const plan = {
			planId: "plan_dyn6", title: '<script>xss</script>', goal: { text: "g" },
			tasks: [
				{ id: "d", type: "discovery", title: '<b>evil</b>', input: { text: "d" }, acceptance: { rules: ["ok"] }, discovery: { outputKey: '<img onerror=bad>' } },
			],
			outputContract: { text: "o" }, runCount: 0,
		};
		const html = renderPlanCard(plan);
		assert.doesNotMatch(html, /<script>xss/);
		assert.doesNotMatch(html, /<b>evil/);
		assert.doesNotMatch(html, /<img onerror/);
	});

	test("P16-T3: old static plans and malformed data still render without throwing", () => {
		const renderPlanCard = extractRenderPlanCard();
		assert.doesNotThrow(() => renderPlanCard({ planId: "old", tasks: [{ id: "t1", title: "T" }] }));
		assert.doesNotThrow(() => renderPlanCard({ planId: "old2", tasks: [] }));
	});

// ── P19 Task 1: Dashboard data model helpers ──

function extractDashboardHelpers(): Record<string, Function> {
	const script = extractScript();
	const start = script.indexOf("function escapeHtml");
	const end = script.indexOf("async function loadPlans");
	assert.ok(start >= 0, "should find escapeHtml start");
	assert.ok(end > start, "should find loadPlans boundary");
	const source = script.slice(start, end);
	const fn = new Function(source + `
		return {
			isActiveRunStatus, isTerminalRunStatus,
			runsForPlan, latestRunForPlan, activeRunForPlan,
			runProgressSummary, planKindLabel
		};
	`);
	return fn();
}

const samplePlan = {
	planId: "plan_test", title: "Test Plan",
	goal: { text: "Test goal" }, tasks: [
		{ id: "t1", title: "Task 1", input: { text: "do" }, acceptance: { rules: ["ok"] } },
		{ id: "t2", title: "Task 2", input: { text: "do2" }, acceptance: { rules: ["ok2"] } },
	],
	outputContract: { text: "out" }, runCount: 2,
};

const sampleDynamicPlan = {
	planId: "plan_dyn", title: "Dynamic Plan",
	goal: { text: "discover" }, tasks: [
		{ id: "disc", type: "discovery", title: "Discover", input: { text: "find" }, acceptance: { rules: ["JSON"] }, discovery: { outputKey: "items" } },
		{ id: "proc", type: "for_each", title: "Process", input: { text: "p" }, acceptance: { rules: ["ok"] }, forEach: { itemsFrom: "disc.items", mode: "sequential", taskTemplate: { title: "P {{item.title}}", input: { text: "p" }, acceptance: { rules: ["ok"] } } } },
	],
	outputContract: { text: "report" }, runCount: 1,
};

const sampleRuns = [
	{ runId: "run_active", planId: "plan_test", status: "running", summary: { totalTasks: 2, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0 }, currentTaskId: "t2", activeElapsedMs: 30000 },
	{ runId: "run_completed", planId: "plan_test", status: "completed", summary: { totalTasks: 2, succeededTasks: 2, failedTasks: 0, cancelledTasks: 0 }, currentTaskId: null, activeElapsedMs: 60000 },
	{ runId: "run_other", planId: "plan_other", status: "queued", summary: { totalTasks: 1, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0 }, currentTaskId: null, activeElapsedMs: 0 },
];

test("P19-T1: isActiveRunStatus returns true for queued/running/paused", () => {
	const h = extractDashboardHelpers();
	assert.equal(h.isActiveRunStatus("queued"), true);
	assert.equal(h.isActiveRunStatus("running"), true);
	assert.equal(h.isActiveRunStatus("paused"), true);
	assert.equal(h.isActiveRunStatus("completed"), false);
	assert.equal(h.isActiveRunStatus("failed"), false);
	assert.equal(h.isActiveRunStatus("cancelled"), false);
});

test("P19-T1: isTerminalRunStatus returns true for terminal statuses", () => {
	const h = extractDashboardHelpers();
	assert.equal(h.isTerminalRunStatus("completed"), true);
	assert.equal(h.isTerminalRunStatus("completed_with_failures"), true);
	assert.equal(h.isTerminalRunStatus("failed"), true);
	assert.equal(h.isTerminalRunStatus("cancelled"), true);
	assert.equal(h.isTerminalRunStatus("running"), false);
	assert.equal(h.isTerminalRunStatus("queued"), false);
	assert.equal(h.isTerminalRunStatus("paused"), false);
});

test("P19-T1: runsForPlan filters runs by planId", () => {
	const h = extractDashboardHelpers();
	const result = h.runsForPlan("plan_test", sampleRuns) as any[];
	assert.equal(result.length, 2);
	assert.equal(result[0].runId, "run_active");
	assert.equal(result[1].runId, "run_completed");
	const empty = h.runsForPlan("nonexistent", sampleRuns) as any[];
	assert.equal(empty.length, 0);
});

test("P19-T1: activeRunForPlan selects active over terminal", () => {
	const h = extractDashboardHelpers();
	const run = h.activeRunForPlan("plan_test", sampleRuns) as any;
	assert.ok(run, "should find an active run");
	assert.equal(run.runId, "run_active");
	assert.equal(run.status, "running");
});

test("P19-T1: latestRunForPlan returns most recent run when no active", () => {
	const h = extractDashboardHelpers();
	const onlyCompleted = sampleRuns.filter(r => r.planId === "plan_test" && r.status === "completed");
	const run = h.latestRunForPlan("plan_test", onlyCompleted) as any;
	assert.ok(run, "should find latest run");
	assert.equal(run.runId, "run_completed");
});

test("P19-T1: latestRunForPlan returns null when no runs exist", () => {
	const h = extractDashboardHelpers();
	const run = h.latestRunForPlan("nonexistent", sampleRuns);
	assert.equal(run, null);
});

test("P19-T1: runProgressSummary computes done/total/pct", () => {
	const h = extractDashboardHelpers();
	const summary = h.runProgressSummary(sampleRuns[0]) as any;
	assert.equal(summary.done, 1);
	assert.equal(summary.total, 2);
	assert.equal(summary.pct, 50);
	assert.equal(summary.succeeded, 1);
	assert.equal(summary.failed, 0);
	assert.equal(summary.cancelled, 0);
});

test("P19-T1: runProgressSummary handles zero tasks", () => {
	const h = extractDashboardHelpers();
	const run = { runId: "r1", planId: "p1", status: "completed", summary: { totalTasks: 0, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0 } };
	const summary = h.runProgressSummary(run) as any;
	assert.equal(summary.done, 0);
	assert.equal(summary.total, 0);
	assert.equal(summary.pct, 0);
});

test("P19-T1: planKindLabel returns normal for normal plan", () => {
	const h = extractDashboardHelpers();
	assert.equal(h.planKindLabel(samplePlan), "normal");
});

test("P19-T1: planKindLabel returns discovery label for dynamic plan", () => {
	const h = extractDashboardHelpers();
	const label = h.planKindLabel(sampleDynamicPlan) as string;
	assert.match(label, /discovery|发现|动态/);
});

test("P19-T1: planKindLabel handles missing/malformed tasks", () => {
	const h = extractDashboardHelpers();
	assert.doesNotThrow(() => h.planKindLabel({}));
	assert.doesNotThrow(() => h.planKindLabel({ tasks: null }));
	assert.doesNotThrow(() => h.planKindLabel({ tasks: "not array" }));
	assert.equal(h.planKindLabel({ tasks: [] }), "normal");
});

// ── P19 Task 2: Plan dashboard cards ──

// Helper: extract renderPlanDashboardCard from inline script
function extractDashboardCardRenderer(): (plan: any, runs?: any[]) => string {
	const script = extractScript();
	const start = script.indexOf("function escapeHtml");
	const end = script.indexOf("async function loadPlans");
	assert.ok(start >= 0, "should find escapeHtml start");
	assert.ok(end > start, "should find loadPlans boundary");
	const source = script.slice(start, end);
	const fn = new Function(source + "\nreturn renderPlanDashboardCard;");
	return fn();
}

const dashPlan = {
	planId: "plan_dash", title: "Dashboard Plan",
	goal: { text: "A goal that should be clipped in the dashboard card view to avoid text walls" },
	tasks: [
		{ id: "t1", title: "Task One", input: { text: "do something useful" }, acceptance: { rules: ["must work", "must be fast", "must be correct"] } },
		{ id: "t2", title: "Task Two", input: { text: "do another thing" }, acceptance: { rules: ["must pass"] } },
		{ id: "t3", title: "Task Three", input: { text: "final task" }, acceptance: { rules: ["done"] } },
	],
	outputContract: { text: "Summary report" }, runCount: 3,
};

const dashDynamicPlan = {
	planId: "plan_dyn_dash", title: "Dynamic Dash Plan",
	goal: { text: "Discover and process" },
	tasks: [
		{ id: "disc", type: "discovery", title: "Discover items", input: { text: "Find all items" }, acceptance: { rules: ["valid JSON"] }, discovery: { outputKey: "items" } },
		{ id: "proc", type: "for_each", title: "Process each", input: { text: "process" }, acceptance: { rules: ["ok"] }, forEach: { itemsFrom: "disc.items", mode: "sequential", taskTemplate: { title: "P {{item.title}}", input: { text: "p" }, acceptance: { rules: ["ok"] } } } },
	],
	outputContract: { text: "report" }, runCount: 1,
};

const dashRuns = [
	{ runId: "run_r1", planId: "plan_dash", status: "running", summary: { totalTasks: 3, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0 }, currentTaskId: "t2", activeElapsedMs: 45000, lastError: null },
	{ runId: "run_c1", planId: "plan_dash", status: "completed", summary: { totalTasks: 3, succeededTasks: 3, failedTasks: 0, cancelledTasks: 0 }, currentTaskId: null, activeElapsedMs: 120000 },
	{ runId: "run_f1", planId: "plan_dash", status: "failed", summary: { totalTasks: 3, succeededTasks: 1, failedTasks: 2, cancelledTasks: 0 }, currentTaskId: null, activeElapsedMs: 90000, lastError: "worker timeout" },
];

test("P19-T2: renderPlanDashboardCard produces dashboard card classes", () => {
	const render = extractDashboardCardRenderer();
	const html = render(dashPlan, dashRuns);
	assert.match(html, /plan-dashboard-card/);
	assert.match(html, /plan-card-header/);
	assert.match(html, /plan-card-title/);
});

test("P19-T2: dashboard card shows task count and run count chips", () => {
	const render = extractDashboardCardRenderer();
	const html = render(dashPlan, dashRuns);
	assert.match(html, /3 个任务/);
	assert.match(html, /3 次运行/);
});

test("P19-T2: dashboard card shows plan type badge", () => {
	const render = extractDashboardCardRenderer();
	const normalHtml = render(dashPlan, dashRuns);
	assert.match(normalHtml, /plan-kind-badge/);
	const dynamicHtml = render(dashDynamicPlan, dashRuns);
	assert.match(dynamicHtml, /discovery.*for_each|发现.*逐项/);
});

test("P19-T2: active run card includes active marker and progress", () => {
	const render = extractDashboardCardRenderer();
	const html = render(dashPlan, dashRuns);
	assert.match(html, /plan-card-active/);
	assert.match(html, /progress-bar/);
	assert.match(html, /running/);
});

test("P19-T2: active run card shows current task summary", () => {
	const render = extractDashboardCardRenderer();
	const html = render(dashPlan, dashRuns);
	assert.match(html, /Task Two/);
});

test("P19-T2: failed plan card is visually distinct from normal completed", () => {
	const render = extractDashboardCardRenderer();
	// Only failed run as latest
	const failedOnly = dashRuns.filter(r => r.status === "failed");
	// Reset runCount for the failed plan to be more comparable
	const failedPlan = { ...dashPlan, planId: "plan_failed", runCount: 1 };
	const html = render(failedPlan, failedOnly);
	assert.match(html, /plan-card-failed|badge-fail/);
});

test("P19-T2: dashboard card does not show task input/acceptance by default", () => {
	const render = extractDashboardCardRenderer();
	const html = render(dashPlan, dashRuns);
	// The full input text should NOT appear directly in the default card
	assert.doesNotMatch(html, /must work.*must be fast.*must be correct/s);
});

test("P19-T2: dashboard card without runs shows empty state summary", () => {
	const render = extractDashboardCardRenderer();
	const noRunPlan = { ...dashPlan, runCount: 0 };
	const html = render(noRunPlan, []);
	assert.match(html, /plan-dashboard-card/);
	assert.match(html, /0 次运行/);
});

test("P19-T2: dynamic plan dashboard card labels discovery+for_each", () => {
	const render = extractDashboardCardRenderer();
	const html = render(dashDynamicPlan, []);
	assert.match(html, /discovery.*for_each|发现.*逐项/);
});

test("P19-T2: dashboard card escapes malicious content", () => {
	const render = extractDashboardCardRenderer();
	const malicious = {
		planId: "p_evil", title: '<script>alert(1)</script>',
		goal: { text: '"><img src=x onerror=bad>' },
		tasks: [{ id: "t1", title: '<b>evil</b>' }],
		outputContract: { text: "ok" }, runCount: 0,
	};
	const html = render(malicious, []);
	assert.doesNotMatch(html, /<script>/);
	assert.doesNotMatch(html, /<img src=x/);
	assert.doesNotMatch(html, /onclick="bad/);
	assert.match(html, /&lt;script&gt;/);
});

test("P19-T2: dashboard card includes primary actions", () => {
	const render = extractDashboardCardRenderer();
	const html = render(dashPlan, dashRuns);
	assert.match(html, /查看详情|openPlanDetail/);
	assert.match(html, /创建运行/);
});

test("P19-T2: loadPlans uses renderPlanDashboardCard with runs data", () => {
	const script = extractScript();
	const loadPlansMatch = script.match(/async function loadPlans[\s\S]*?^[\t]}/m);
	assert.ok(loadPlansMatch, "should find loadPlans");
	const body = loadPlansMatch[0];
	assert.match(body, /renderPlanDashboardCard/);
	assert.match(body, /_latestRuns/);
});

test("P19-T2: dashboard grid CSS class exists", () => {
	const html = renderTeamPage();
	assert.match(html, /plan-dashboard-grid/);
});
