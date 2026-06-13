import test from "node:test";
import assert from "node:assert/strict";
import { renderTeamPage } from "../src/ui/team-page.js";
import { renderRuntimeContextHelper } from "../src/ui/team-page-helpers.js";

function extractScript(): string {
	const html = renderTeamPage();
	const match = html.match(/<script>([\s\S]*?)<\/script>/);
	assert.ok(match, "should have inline script");
	return match[1];
}
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

// ── MIGRATION CLASSIFICATION ────────────────────────────────────────────
//
// Originally 73 [MIGRATION: inline extraction] skips. Now 13 remain (12 + 1 inline-pattern).
//
// DELETE (dead code — renderPlanCard is unused, _legacyCards is computed but never read):
//   P14-T1: renderPlanCard compact card tests (9 tests, lines ~1087-1205)
//   P16-T3: dynamic plan card via renderPlanCard (7 tests, lines ~1468-1559)
//
// MIGRATE to extracted helper module (pure functions → direct import + test):
//   P19-T1: dashboard data helpers — isActiveRunStatus, runsForPlan, etc. (10 tests, ~1604-1694)
//   P19-T2: renderPlanDashboardCard (11 tests, ~1737-1840)
//   P19-T4: renderDynamicPlanDesign, renderNormalPlanDesign (12 tests, ~1978-2068)
//   P19-T5: renderPlanRunCard (7 tests, ~2116-2198)
//   P16-T1: buildDynamicPlanPayload (2 tests, ~1382-1408)
//   P21-D1: decomposer badges via design renderers (4 tests, ~2287-2367)
//
// MIGRATE to server HTML smoke / mindmap-helpers / escape tests:
//   P8-E: renderTaskDetail runtime context escaping (1 test, ~589)
//   P15-fix: generated child task rendering (4 tests, ~1262-1344)
//   P21-D2: decomposition hierarchy in task detail (4 tests, ~2381-2484)
//   P21-D-fix: SSE taskDefinitions cache (1 test, ~2486)
//
// Principles:
//   - Obsolete old renderer tests → delete
//   - Current behavior → test via extracted helpers or server HTML
//   - Remaining skips → must have TODO with reason
// ────────────────────────────────────────────────────────────────────────

test("P8-E: renderRuntimeContextHelper escapes all context fields", () => {
	const ctx = {
		requestedProfileId: "<script>alert(1)</script>",
		resolvedProfileId: "\" onclick=\"bad",
		fallbackUsed: true,
		fallbackReason: "'><img src=x onerror=bad>",
	};
	const html = renderRuntimeContextHelper("worker", ctx);
	assert.doesNotMatch(html, /<script>/);
	assert.doesNotMatch(html, /<img/);
	assert.doesNotMatch(html, /onclick="bad/);
	assert.doesNotMatch(html, /onmouseover="bad/);
	assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
	assert.match(html, /&quot; onclick=&quot;bad/);
	assert.match(html, /&lt;img src=x onerror=bad&gt;/);
	assert.match(html, /runtime-context-wrap/);
	assert.match(html, /runtime-context-fallback/);
});

test("P8-E: parity — inline renderRuntimeContext matches helper output", () => {
	const ctx = { requestedProfileId: "p1", resolvedProfileId: "p2", fallbackUsed: false };
	const helperHtml = renderRuntimeContextHelper("worker", ctx);
	const script = extractScript();
	const start = script.indexOf("function escapeHtml");
	const end = script.indexOf("function updateRunCard");
	assert.ok(start >= 0 && end > start);
	const source = script.slice(start, end);
	const stubs = "var window={};var document={querySelector:function(){return null},querySelectorAll:function(){return[]},getElementById:function(){return null},createElement:function(){return{appendChild:function(){}}}};var $=function(id){return{value:'',style:{},classList:{add:function(){},remove:function(){}}}};var _planCache={};var _latestRuns=[];var _selectedPlanId=null;var _latestRunTaskDefinitions={};";
	const inlineFn = new Function(stubs + "\n" + source + "\nreturn renderRuntimeContext;")() as (role: string, ctx: any) => string;
	const inlineHtml = inlineFn("worker", ctx);
	assert.match(helperHtml, /p1/);
	assert.match(inlineHtml, /p1/);
	assert.match(helperHtml, /p2/);
	assert.match(inlineHtml, /p2/);
	assert.doesNotMatch(helperHtml, /browser:/);
	assert.doesNotMatch(inlineHtml, /browser:/);
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

test("P12-T4: pause/resume buttons use confirm wrapper (updated: pause/resume now use confirmation)", () => {
	const script = extractScript();
	assert.match(script, /pauseRunWithConfirm/);
	assert.match(script, /resumeRunWithConfirm/);
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

test("P13-T1: renderPlanDashboardCard function exists and renders dashboard card", () => {
	const script = extractScript();
	assert.match(script, /function renderPlanDashboardCard\(plan,\s*runs\)/);
});


test("P13-T1: truncateText function exists", () => {
	const script = extractScript();
	assert.match(script, /function truncateText\(text/);
});

test("P13-T1: loadPlans uses renderPlanDashboardCard", () => {
	const script = extractScript();
	assert.match(script, /renderPlanDashboardCard/);
});

test("P13-T1: plan detail renders outputContract", () => {
	const script = extractScript();
	assert.match(script, /renderPlanDetailContent[\s\S]*?outputContract/);
});

test("P13-T1: plan detail escapes goal and output text", () => {
	const script = extractScript();
	assert.match(script, /renderPlanDetailContent[\s\S]*?escapeHtml\(goalText\)/);
	assert.match(script, /renderPlanDetailContent[\s\S]*?escapeHtml\(outputText\)/);
});

test("P13-T1: plan card handles missing fields", () => {
	const script = extractScript();
	assert.match(script, /Array\.isArray\(safePlan\.tasks\)/);
	assert.match(script, /safePlan.goal && safePlan.goal.text/);
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
	assert.match(script, /renderPlanDetailActions[\s\S]*?查看 JSON/);
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
