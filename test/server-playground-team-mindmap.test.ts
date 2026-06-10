import assert from "node:assert/strict";
import test from "node:test";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

test("GET /playground/team includes run detail mindmap view shell", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/team",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] ?? "", /^text\/html/);
	assert.match(response.body, /class="topbar-back" href="\/playground\?view=chat" title="返回对话" aria-label="返回对话"/);
	assert.match(response.body, /function renderPlanTeamPanel\(plan\)/);
	assert.match(response.body, /id="plan-detail-team-select"/);
	assert.match(response.body, /\/plans\/' \+ pathSegment\(planId\) \+ '\/default-team/);
	assert.match(response.body, /function editPlanDetailTeam\(teamUnitId\)/);

	// View state for per-run mindmap/detail switch
	assert.match(response.body, /_runDetailViewByRunId/);
	assert.match(response.body, /function getRunDetailView/);
	assert.match(response.body, /function setRunDetailView/);

	// Shell function that wraps both views
	assert.match(response.body, /function renderRunDetailShell/);

	// Mindmap placeholder function
	assert.match(response.body, /function renderTeamMindmap/);

	// Segmented switch labels
	assert.match(response.body, /脑图/);
	assert.match(response.body, /详情/);

	// Switch uses data attribute for stable CSS targeting
	assert.match(response.body, /data-run-detail-view="mindmap"/);
	assert.match(response.body, /data-run-detail-view="detail"/);

	// Old detail renderer still exists and is reachable from shell
	assert.match(response.body, /function renderTaskDetail/);

	// toggleRunDetail and updateRunCard render through the shell, not directly
	assert.match(response.body, /detailEl\.innerHTML\s*=\s*renderRunDetailShell\(/);
	assert.match(response.body, /var newHtml\s*=\s*renderRunDetailShell\(/);

	await app.close();
});

test("GET /playground/team caches run state for safe detail view switching", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/team",
	});

	assert.equal(response.statusCode, 200);

	assert.match(response.body, /var _planCache = \{\};/);
	assert.match(response.body, /function buildFallbackPlanFromRunState\(state\)/);
	assert.match(response.body, /原计划定义不可用，当前详情按 run 状态展示。/);
	assert.match(response.body, /loadAgents\(\)\.then\(async function\(\)/);
	assert.match(response.body, /await loadPlans\(\)/);

	// Full run-state cache exists
	assert.match(response.body, /window\._latestRunStateForRun/);

	// toggleRunDetail stores the complete fetched state into the cache
	assert.match(response.body, /window\._latestRunStateForRun\[runId\]\s*=\s*state/);

	// switchRunDetailView reads from cache, not from a bare { runId } object
	assert.match(response.body, /var state = window\._latestRunStateForRun\s*\?\s*window\._latestRunStateForRun\[runId\]/);

	// Fallback includes taskStates so renderTaskDetail does not throw
	assert.match(response.body, /taskStates:\s*\{\}/);

	// onclick uses jsArg for runId and view names (not escapeHtml string concatenation)
	assert.match(response.body, /jsArg\(runId\)/);
	assert.match(response.body, /jsArg\('mindmap'\)/);
	assert.match(response.body, /jsArg\('detail'\)/);

	// updateRunCard preserves cached state by reading from _latestRunStateForRun
	assert.match(
		response.body,
		/window\._latestRunStateForRun\[r\.runId\]/,
	);

	await app.close();
});

test("GET /playground/team scopes run detail expansion to the clicked card", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/team",
	});

	assert.equal(response.statusCode, 200);

	assert.match(response.body, /function findRunDetailElement\(runId, sourceEl\)/);
	assert.match(response.body, /sourceEl\.closest\('\[data-run-id\]'\)/);
	assert.match(response.body, /var scoped = card\.querySelector\('\.run-detail'\)/);
	assert.match(response.body, /async function toggleRunDetail\(runId, sourceEl\)/);
	assert.match(response.body, /var detailEl = findRunDetailElement\(runId, sourceEl\)/);
	assert.match(response.body, /toggleRunDetail\(runId, el\)/);
	assert.match(response.body, /onclick="toggleRunDetail\([\s\S]*this\)">展开任务详情/);
	assert.doesNotMatch(response.body, /var detailEl = \$\("run-detail-" \+ runId\)/);
	assert.doesNotMatch(response.body, /var detailEl = \$\('run-detail-' \+ runId\)/);

	await app.close();
});


	test("GET /playground/team includes mindmap view-model helpers and node structure", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// View-model helpers exist
		assert.match(response.body, /function buildMindmapNodes/);
		assert.match(response.body, /function collectRunTaskDefinitions/);
		assert.match(response.body, /function getMindmapChildrenByParent/);
		assert.match(response.body, /function describeMindmapNodeType/);

		// Renderer uses stable CSS classes / data attributes
		assert.match(response.body, /team-mindmap/);
		assert.match(response.body, /mindmap-root-node/);
		assert.match(response.body, /mindmap-task-node/);
		assert.match(response.body, /mindmap-children/);
		assert.match(response.body, /data-node-status/);
		assert.match(response.body, /data-node-type/);

		// Failed nodes show error summary in compact view
		assert.match(response.body, /mindmap-node-error/);

		await app.close();
	});

	test("GET /playground/team mindmap attribution uses sourceItemId and orphan group", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// Priority 3: sourceItemId participates in child attribution
		// getMindmapChildrenByParent reads def.sourceItemId and checks for_each parents
		assert.match(response.body, /def\.sourceItemId/);
		assert.match(response.body, /forEachParents\.length === 1/);

		// Orphan group is rendered for unassigned task states
		assert.match(response.body, /__orphan_generated__/);
		assert.match(response.body, /orphan-group/);

		// getMindmapChildrenByParent returns orphanIds, not just byParent
		assert.match(response.body, /orphanIds/);

		// Prefix fallback is tracked separately from metadata attribution
		assert.match(response.body, /prefixFallbackIds/);

		await app.close();
	});

	test("GET /playground/team includes mindmap adaptive node interactions", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// Interaction state variables
		assert.match(response.body, /_mindmapExpandedNodes/);
		assert.match(response.body, /_mindmapExpandedGroups/);

		// Toggle functions exposed on window
		assert.match(response.body, /window\.toggleMindmapNode/);
		assert.match(response.body, /window\.toggleMindmapGroup/);

		// Helper predicates
		assert.match(response.body, /function isMindmapNodeExpanded/);
		assert.match(response.body, /function isMindmapGroupExpanded/);
		assert.match(response.body, /function rerenderMindmap/);

		// Failed nodes default expanded
		assert.match(response.body, /nodeStatus === 'failed'/);

		// Node toggle button class and click handler with stopPropagation
		assert.match(response.body, /mindmap-node-toggle/);
		assert.match(response.body, /event\.stopPropagation\(\);toggleMindmapNode/);

		// Expanded node details container
		assert.match(response.body, /mindmap-node-details/);

		// Expanded state indicator
		assert.match(response.body, /mindmap-node-expanded/);

		// Large child group controls
		assert.match(response.body, /MINDMAP_GROUP_LIMIT/);
		assert.match(response.body, /展开全部/);
		assert.match(response.body, /收起/);

		// Failed node error visible in compact mode
		assert.match(response.body, /mindmap-node-error/);

		// File chip uses button element and calls viewAttemptFile with stopPropagation
		assert.match(response.body, /<button class="file-chip" onclick="event\.stopPropagation\(\);viewAttemptFile\(/);

		// Group toggle uses stopPropagation to prevent run card collapse
		assert.match(response.body, /event\.stopPropagation\(\);toggleMindmapGroup/);

			// renderMindmapNode accepts runId, attemptsMap, and runStatus
			assert.match(response.body, /function renderMindmapNode\(node, depth, runId, attemptsMap, runStatus\)/);

		// renderTeamMindmap passes runId through
		assert.match(response.body, /function renderTeamMindmap\(runId, state, plan, attemptsMap\)/);

		// Node progress and activeAttemptId rendering in expanded mode
		assert.match(response.body, /node\.progress/);
		assert.match(response.body, /node\.activeAttemptId/);
		assert.match(response.body, /node\.resultRef/);

		// Expanded node shows metadata: generated, parentTaskId, sourceItemId
		assert.match(response.body, /node\.generated/);
		assert.match(response.body, /node\.parentTaskId/);

		await app.close();
	});

	test("GET /playground/team failed mindmap node first click collapses", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// The click handler must pass node.status so toggle can compute visible state
		// Source uses: toggleMindmapNode(' + jsArg(runId) + ',' + jsArg(node.id) + ',' + jsArg(node.status) + ')
		assert.match(
			response.body,
			/jsArg\(node\.status\)/,
		);

		// The onclick contains toggleMindmapNode with node status and the clicked button as scope
		assert.match(
			response.body,
			/toggleMindmapNode\(' \+ jsArg\(runId\) \+ ',' \+ jsArg\(node\.id\) \+ ',' \+ jsArg\(node\.status\) \+ ',this\)/,
		);

		// toggleMindmapNode must accept nodeStatus and sourceEl arguments
		assert.match(
			response.body,
			/window\.toggleMindmapNode\s*=\s*function\s*\(\s*runId\s*,\s*taskId\s*,\s*nodeStatus\s*,\s*sourceEl\s*\)/,
		);

		// toggle must compute currentlyExpanded from isMindmapNodeExpanded, not bare flip
		assert.match(
			response.body,
			/var currentlyExpanded\s*=\s*isMindmapNodeExpanded\(/,
		);

		// toggle writes the inverse of the computed visible state
		assert.match(
			response.body,
			/_mindmapExpandedNodes\[key\]\s*=\s*!currentlyExpanded/,
		);

		// Verify the old bare-flip pattern is gone
		assert.doesNotMatch(
			response.body,
			/_mindmapExpandedNodes\[key\]\s*=\s*!_mindmapExpandedNodes\[key\]/,
		);

		// Failed nodes still default expanded when never interacted with
		assert.match(
			response.body,
			/nodeStatus === 'failed' && _mindmapExpandedNodes\[key\] === undefined/,
		);

		await app.close();
	});

	test("GET /playground/team includes mindmap visual polish CSS classes", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// View toggle uses CSS class
		assert.match(response.body, /mindmap-view-toggle["\s>]/);
		assert.match(response.body, /mindmap-view-toggle-btn/);

		// Mindmap canvas wrapper
		assert.match(response.body, /class="team-mindmap"/);
		assert.match(response.body, /class="mindmap-canvas"/);

		// CSS class definitions exist in style block
		assert.match(response.body, /\.mindmap-root-node\b/);
		assert.match(response.body, /\.mindmap-task-node\b/);
		assert.match(response.body, /\.mindmap-children\b/);
		assert.match(response.body, /\.mindmap-node-error\b/);
		assert.match(response.body, /\.mindmap-node-details\b/);
		assert.match(response.body, /\.mindmap-node-toggle\b/);

		// Status-specific CSS selectors exist
		assert.match(response.body, /data-node-status="running"]/);
		assert.match(response.body, /data-node-status="succeeded"]/);
		assert.match(response.body, /data-node-status="failed"]/);
		assert.match(response.body, /data-node-status="skipped"]/);

		// Running pulse animation
		assert.match(response.body, /@keyframes mindmap-pulse/);

		// Connector trunk and branch selectors
		assert.match(response.body, /\.mindmap-children::before/);
		assert.match(response.body, /\.mindmap-task-node::before/);

		// Mobile media query covers mindmap
		assert.match(
			response.body,
			/@media \(max-width: 720px\)[\s\S]*?\.team-mindmap/,
		);
		assert.match(
			response.body,
			/@media \(max-width: 720px\)[\s\S]*?\.mindmap-children::before/,
		);

		// Group toggle uses CSS class
		assert.match(response.body, /class="mindmap-group-toggle"/);
		assert.match(response.body, /\.mindmap-group-toggle\b/);

		// No native alert/confirm/prompt
		assert.doesNotMatch(response.body, /\balert\s*\(/);
		assert.doesNotMatch(response.body, /\bconfirm\s*\(/);
		assert.doesNotMatch(response.body, /\bprompt\s*\(/);

		// Node rendering uses CSS classes (no inline padding/border on task nodes)
		assert.doesNotMatch(
			response.body,
			/mindmap-task-node[^"]*"[^>]*padding:6px 10px/,
		);
		assert.doesNotMatch(
			response.body,
			/mindmap-task-node[^"]*"[^>]*border:1px solid/,
		);

		await app.close();
	});

	test("GET /playground/team includes mindmap task disposition controls", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});

		const response = await app.inject({
			method: "GET",
			url: "/playground/team",
		});

		assert.equal(response.statusCode, 200);

		// renderMindmapNode accepts runStatus parameter
		assert.match(response.body, /function renderMindmapNode\(node, depth, runId, attemptsMap, runStatus\)/);

		// renderTeamMindmap passes state.status
		assert.match(response.body, /renderMindmapNode\(root, 0, runId, attemptsMap, state\.status\)/);

		// Disposition buttons in mindmap use stopPropagation + setTaskDisposition
		assert.match(response.body, /event\.stopPropagation\(\);setTaskDisposition\(' \+ jsArg\(runId\) \+ ',' \+ jsArg\(node\.id\) \+ ',' \+ jsArg\('skip'\)/);
		assert.match(response.body, /event\.stopPropagation\(\);setTaskDisposition\(' \+ jsArg\(runId\) \+ ',' \+ jsArg\(node\.id\) \+ ',' \+ jsArg\('force_rerun'\)/);
		assert.match(response.body, /event\.stopPropagation\(\);setTaskDisposition\(' \+ jsArg\(runId\) \+ ',' \+ jsArg\(node\.id\) \+ ',' \+ jsArg\('default'\)/);

		// Disposition badges
		assert.match(response.body, /已设跳过/);
		assert.match(response.body, /已设强制重跑/);

		// Recursive call passes runStatus
		assert.match(response.body, /renderMindmapNode\(node\.children\[i\],\s*depth \+ 1,\s*runId,\s*attemptsMap,\s*runStatus\)/);

		// buildMindmapNodes carries manualDisposition
		assert.match(response.body, /manualDisposition:\s*ts\s*\?\s*ts\.manualDisposition/);

		await app.close();
	});
