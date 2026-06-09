import test from "node:test";
import assert from "node:assert/strict";
import { renderConnPage } from "../src/ui/conn-page.js";
import { renderAgentsPage } from "../src/ui/agents-page.js";

test("standalone conn page keeps the new-task card visible when the task list is empty", () => {
	const response = renderConnPage();
	const createEmptyEditorBranch = response.indexOf(
		'if (state.editorOpen && state.editorMode === "create" && conns.length === 0)',
	);
	const emptyListBranch = response.indexOf("if (conns.length === 0)");

	assert.notEqual(createEmptyEditorBranch, -1);
	assert.notEqual(emptyListBranch, -1);
	assert.ok(createEmptyEditorBranch < emptyListBranch);
	assert.match(response, /function appendNewConnEditorItem\(\)/);
	assert.match(response, /const newItem = document\.createElement\("div"\)/);
	assert.match(response, /const item = document\.createElement\("div"\)/);
	assert.match(response, /event\.target instanceof Element && event\.target\.closest\("\.conn-list-item-editor-actions"\)/);
	assert.doesNotMatch(response, /const newItem = document\.createElement\("button"\)/);
	assert.doesNotMatch(response, /const item = document\.createElement\("button"\)/);
	assert.match(response, /data-editor-action="submit"[\s\S]*保存任务[\s\S]*data-editor-action="cancel"[\s\S]*取消/);
	assert.match(response, /submitBtn\.addEventListener\("click", \(event\) => \{ event\.stopPropagation\(\); submitEditor\(\); \}\)/);
	assert.match(response, /cancelBtn\.addEventListener\("click", \(event\) => \{ event\.stopPropagation\(\); closeEditor\(\); \}\)/);
	assert.doesNotMatch(response, /id="editor-submit"/);
	assert.doesNotMatch(response, /id="editor-cancel"/);
	assert.match(response, /editorError:\s*""/);
	assert.match(response, /function getDefaultEditorRunDate\(\)/);
	assert.match(response, /const defaultRunAt = formatDateTimeLocal\(getDefaultEditorRunDate\(\)\)/);
	assert.match(response, /id="editor-form-submit"[\s\S]*保存任务[\s\S]*id="editor-form-cancel"[\s\S]*取消/);
	assert.match(response, /function showEditorError\(message, focusId\)[\s\S]*state\.editorError = message/);
});

test("standalone conn page can create team group conn executions", () => {
	const response = renderConnPage();
	assert.match(response, /editor-execution-type/);
	assert.match(response, /editor-team-group-id/);
	assert.match(response, /async function apiFetchTeamTaskGroups\(/);
	assert.match(response, /\/v1\/team\/task-groups/);
	assert.match(response, /function getTeamTaskGroupValidationMessage\(group\)/);
	assert.match(response, /opt\.textContent \+= "（不可运行）";/);
	assert.match(response, /opt\.disabled = true;/);
	assert.match(response, /function buildEditorExecutionPayload\(/);
	assert.match(response, /showEditorError\("请先选择可运行的 Team Group", "editor-team-group-id"\)/);
	assert.match(response, /execution,/);
	assert.match(response, /type: "team_group"/);
	assert.match(response, /execution\.type === "team_group"/);
	assert.match(
		response,
		/\["Group JSON", groupId \? "\/v1\/team\/task-groups\/" \+ encodeURIComponent\(groupId\) : ""\]/,
	);
	assert.match(
		response,
		/\["GroupRun JSON", groupRunId \? "\/v1\/team\/task-group-runs\/" \+ encodeURIComponent\(groupRunId\) : ""\]/,
	);
	assert.match(response, /const groupRunStartStatus = String\(snapshot\.groupRunStartStatus \|\| ""\);/);
	assert.match(response, /const groupRunStartError = String\(snapshot\.groupRunStartError \|\| ""\);/);
	assert.match(response, /\["groupRunStartStatus", groupRunStartStatus\]/);
	assert.match(response, /\["groupRunStartError", groupRunStartError\]/);
	assert.match(response, /link\.target = "_blank";/);
	assert.match(response, /link\.rel = "noreferrer";/);
	assert.match(
		response,
		/const isSkippedTeamGroupRun = snapshot\.skipped === true;[\s\S]*if \(isSkippedTeamGroupRun\) \{[\s\S]*skipped\.textContent = "Skipped: "/,
	);
	assert.doesNotMatch(response, /run\.status === "failed" && run\.errorText[\s\S]{0,260}Skipped/);
	assert.match(response, /editor-prompt/);
	assert.match(response, /editor-profile-id/);
	assert.match(response, /editor-browser-id/);
	assert.match(response, /editor-model-provider/);
	assert.match(response, /editor-model-id/);
});

test("standalone conn page disables run-now while a run is pending or running", () => {
	const response = renderConnPage();

	assert.match(response, /actionConnId:\s*""/);
	assert.match(response, /const RUN_REFRESH_MAX_ATTEMPTS = 120/);
	assert.match(response, /function isRunInFlight\(run\)[\s\S]*run\?\.status === "pending"[\s\S]*run\?\.status === "running"/);
	assert.match(response, /function hasActiveRunForConn\(connId\)/);
	assert.match(response, /hasRunInFlight \? "执行中" : "立即执行"/);
	assert.match(response, /btn\.disabled = isActing \|\| Boolean\(action\.disabled\)/);
	assert.match(response, /showToast\("已触发执行，正在后台运行", "success"\)/);
	assert.match(response, /scheduleRunRefresh\(connId, 0\)/);
});

test("standalone conn page action handlers avoid broad renderAll refreshes", () => {
	const response = renderConnPage();

	for (const handlerName of ["handlePause", "handleResume", "handleDelete", "handleMarkAllRead"]) {
		const match = new RegExp(`async function ${handlerName}\\([\\s\\S]*?\\n\\}`).exec(response);
		assert.ok(match, `expected ${handlerName} to exist`);
		assert.doesNotMatch(match[0], /renderAll\(\)/, `${handlerName} should use targeted rendering`);
	}
	assert.doesNotMatch(response, /loadRuns\(/);
	assert.match(response, /function renderStats\(\)/);
	assert.match(response, /function renderList\(\)/);
	assert.match(response, /function renderDetail\(\)/);
	assert.match(response, /function renderRunHistory\(/);
});

test("standalone conn page exposes a terminate action for pending or running conn runs", () => {
	const response = renderConnPage();

	assert.match(response, /cancellingRunId:\s*""/);
	assert.match(response, /async function apiCancelRun\(connId, runId\)/);
	assert.match(response, /\/runs\/" \+ encodeURIComponent\(runId\) \+ "\/cancel"/);
	assert.match(response, /const canCancel = isRunInFlight\(run\)/);
	assert.match(response, /data-run-cancel/);
	assert.match(response, /async function handleCancelRun\(connId, runId\)/);
	assert.match(response, /终止本次运行/);
	assert.match(response, /handleCancelRun\(conn\.connId, run\.runId\)/);
	assert.match(response, /\.conn-run-cancel-btn/);
});

test("standalone conn page exposes tokenized run history loading states", () => {
	const response = renderConnPage();

	assert.match(response, /data-run-history-state="loading"/);
	assert.match(response, /data-run-history-state="error"/);
	assert.match(response, /data-run-history-state="empty"/);
	assert.match(response, /data-run-history-pagination/);
	assert.match(response, /\.conn-run-lazy--loading\s*\{[\s\S]*background:\s*var\(--primary-soft\);/);
	assert.match(response, /\.conn-run-lazy--error\s*\{[\s\S]*background:\s*var\(--danger-soft\);/);
	assert.match(response, /\.conn-run-history-more\.is-loading\s*\{[\s\S]*background:\s*var\(--primary-soft\);/);
});
test("standalone conn page uses bundled vendor assets instead of CDN resources", () => {
	const response = renderConnPage();

	assert.match(response, /\/vendor\/flatpickr\/flatpickr\.min\.css/);
	assert.match(response, /\/vendor\/flatpickr\/flatpickr\.min\.js/);
	assert.match(response, /\/vendor\/flatpickr\/l10n\/zh\.js/);
	assert.match(response, /marked v18\.0\.2|globalThis\.__ugkPlaygroundMarkdownParser/);
	assert.doesNotMatch(response, /cdn\.jsdelivr\.net/);
});

test("standalone conn page follows the ops workbench visual system", () => {
	const response = renderConnPage();

	assert.match(response, /data-standalone-theme="ops-workbench"/);
	assert.match(response, /class="sp-topbar-back" href="\/playground\?view=chat"/);
	assert.match(response, /body\[data-standalone-theme="ops-workbench"\] \.conn-stat-card/);
	assert.match(response, /--ops-bg: #081019/);
	assert.match(response, /id="confirm-overlay" class="sp-overlay"/);
	assert.match(response, /class="sp-panel sp-confirm-panel"/);
	assert.match(response, /id="confirm-body" class="sp-confirm-message"/);
	assert.match(response, /body\.textContent = String\(opts\.message \?\? opts\.description \?\? ""\)/);
	assert.match(response, /\.sp-confirm-panel\s*\{[\s\S]*width:\s*min\(520px, calc\(100vw - 36px\)\);[\s\S]*border:\s*0;[\s\S]*background:\s*var\(--confirm-panel\);/);
	assert.match(response, /\.sp-confirm-panel \.sp-panel-body\s*\{[\s\S]*border-radius:\s*6px;[\s\S]*background:\s*var\(--confirm-body\);/);
	assert.match(response, /\.sp-confirm-panel \.sp-btn-danger\s*\{[\s\S]*background:\s*var\(--confirm-danger\);/);
	assert.doesNotMatch(response, /body data-standalone-theme="cockpit"/);
});

test("standalone conn page keeps mobile list-detail navigation visible", () => {
	const response = renderConnPage();

	assert.match(
		response,
		/listPanel\.classList\.add\("is-hidden-mobile"\);[\s\S]*listPanel\.classList\.remove\("mobile-visible"\);[\s\S]*detailPanel\.classList\.add\("mobile-visible"\);[\s\S]*detailPanel\.classList\.remove\("is-hidden-mobile"\);/,
	);
	assert.match(
		response,
		/listPanel\.classList\.add\("mobile-visible"\);[\s\S]*listPanel\.classList\.remove\("is-hidden-mobile"\);[\s\S]*detailPanel\.classList\.add\("is-hidden-mobile"\);[\s\S]*detailPanel\.classList\.remove\("mobile-visible"\);/,
	);
});

test("standalone agents page follows the ops workbench visual system", () => {
	const response = renderAgentsPage();

	assert.match(response, /data-standalone-theme="ops-workbench"/);
	assert.match(response, /class="sp-topbar-back" href="\/playground\?view=chat"/);
	assert.match(response, /body\[data-standalone-theme="ops-workbench"\] \.ag-stat-card/);
	assert.match(response, /--ops-bg: #081019/);
	assert.match(response, /id="confirm-overlay" class="sp-overlay"/);
	assert.match(response, /class="sp-panel sp-confirm-panel"/);
	assert.match(response, /id="confirm-body" class="sp-confirm-message"/);
	assert.match(response, /body\.textContent = String\(opts\.message \?\? opts\.description \?\? ""\)/);
	assert.match(response, /\.sp-confirm-panel \.sp-panel-foot\s*\{[\s\S]*border-top:\s*0;/);
	assert.doesNotMatch(response, /body data-standalone-theme="cockpit"/);
});

test("standalone conn page sorts the left task list by unread recency then lifecycle status", () => {
	const response = renderConnPage();

	assert.match(response, /function compareConnListItems\(left, right\)/);
	assert.match(response, /return list\.slice\(\)\.sort\(compareConnListItems\)/);
	assert.match(response, /function getConnUnreadTimeMs\(conn\)/);
	assert.match(response, /state\.unreadLatestRunTimesByConnId\[conn\?\.connId\]/);
	assert.match(response, /function getConnStatusSortRank\(conn\)[\s\S]*conn\?\.status === "active"[\s\S]*conn\?\.status === "paused"[\s\S]*conn\?\.status === "completed"/);
	assert.match(response, /function getConnNextRunTimeMs\(conn\)/);
	assert.match(response, /unreadLatestRunTimesByConnId: data\.unreadLatestRunTimesByConnId \|\| \{\}/);
	assert.match(response, /\.conn-list-item-badge--active \{ background: var\(--success-soft\); color: var\(--success\); \}/);
	assert.match(response, /\.conn-list-item-badge--completed \{ background: rgba\(100,116,139,0\.15\); color: var\(--muted\); \}/);
});

test("standalone conn page falls back when clipboard API is unavailable", () => {
	const response = renderConnPage();

	assert.match(response, /async function writeClipboardText\(text\)\s*\{[\s\S]*navigator\.clipboard && window\.isSecureContext/);
	assert.match(response, /function copyToClipboard\(text\)\s*\{[\s\S]*return writeClipboardText\(text\)\.then/);
	assert.match(response, /document\.execCommand\("copy"\)/);
	assert.match(response, /copyToClipboard\(run\.runId\)\.then/);
	assert.doesNotMatch(response, /navigator\.clipboard\.writeText\(run\.runId\)/);
});
