import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/server.js";
import { createAgentServiceStub } from "./server-test-helpers.js";

test("GET /playground/agents loads installable skills from main agent skills including disabled entries", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.body, /fetchJson\("\/v1\/agents\/main\/skills"\)/);
	assert.doesNotMatch(response.body, /fetchJson\("\/v1\/debug\/skills"\)/);
	assert.match(response.body, /主 Agent 已关闭/);
	await app.close();
});

test("GET /playground/agents reuses gallery skills for the initial main selection", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});

	assert.equal(response.statusCode, 200);
	const body = response.body;
	const galleryStart = body.indexOf("async function apiFetchGallerySkills()");
	const galleryEnd = body.indexOf("async function apiCopySkill", galleryStart);
	const selectStart = body.indexOf("function selectAgent(agentId)");
	const selectEnd = body.indexOf("/* \u2500\u2500 Handlers", selectStart);
	assert.ok(galleryStart >= 0, "apiFetchGallerySkills function not found");
	assert.ok(galleryEnd > galleryStart, "apiFetchGallerySkills region not found");
	assert.ok(selectStart >= 0, "selectAgent function not found");
	assert.ok(selectEnd > selectStart, "selectAgent region not found");

	const galleryRegion = body.slice(galleryStart, galleryEnd);
	const selectRegion = body.slice(selectStart, selectEnd);

	assert.match(galleryRegion, /fetchJson\("\/v1\/agents\/main\/skills"\)/);
	assert.match(galleryRegion, /state\.skillsByAgentId\.main\s*=\s*state\.gallerySkills/);
		// selectAgent resets skillsExpanded and does not fetch skills
		assert.match(selectRegion, /state\.editorMode = null/);
		assert.match(selectRegion, /state\.skillsExpanded = false/);
		assert.doesNotMatch(selectRegion, /apiFetchAgentSkills/);
		assert.doesNotMatch(selectRegion, /renderSkills\(\)/);
		await app.close();
	});

	test("GET /playground/agents defers skill row rendering until section is expanded", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});
		const response = await app.inject({
			method: "GET",
			url: "/playground/agents",
		});
		assert.equal(response.statusCode, 200);
		const body = response.body;

		// State declares skillsExpanded flag
		assert.match(body, /skillsExpanded:\s*false/);

		// renderDetailBody delegates skill rendering instead of mounting rows directly
		const detailStart = body.indexOf("function renderDetailBody()");
		const detailEnd = body.indexOf("function ensureDetailShell(", detailStart);
		assert.ok(detailStart >= 0, "renderDetailBody function not found");
		assert.ok(detailEnd > detailStart, "renderDetailBody region end not found");
		const detailRegion = body.slice(detailStart, detailEnd);
		assert.match(detailRegion, /renderSkillsPanel\(agent\)/);
		assert.doesNotMatch(detailRegion, /ag-skill-list/);

		const panelStart = body.indexOf("function renderSkillsPanel(");
		const panelEnd = body.indexOf("function buildMiniCard(", panelStart);
		assert.ok(panelStart >= 0, "renderSkillsPanel function not found");
		assert.ok(panelEnd > panelStart, "renderSkillsPanel region end not found");
		const panelRegion = body.slice(panelStart, panelEnd);

		// Collapsed branch has expand button, expanded branch has the skill list
		assert.match(panelRegion, /ag-btn-expand-skills/);
		assert.match(panelRegion, /if \(state\.skillsExpanded\)/);
		const renderSkillsCall = panelRegion.indexOf("renderSkillsList(agent.agentId)");
		const expandedBranch = panelRegion.indexOf("if (state.skillsExpanded)");
		assert.ok(renderSkillsCall > expandedBranch, "renderSkillsList() must be inside the skillsExpanded branch");

		// handleExpandSkills sets skillsExpanded and checks cache
		const expandStart = body.indexOf("function handleExpandSkills()");
		const expandEnd = body.indexOf("function mobileBackToList(", expandStart);
		assert.ok(expandStart >= 0, "handleExpandSkills function not found");
		assert.ok(expandEnd > expandStart, "handleExpandSkills region end not found");
		const expandRegion = body.slice(expandStart, expandEnd);

		assert.match(expandRegion, /state\.skillsExpanded = true/);
		assert.match(expandRegion, /var agentId = state\.selectedId/);
		assert.match(expandRegion, /skillsLoadedByAgentId\[agentId\]/);
		assert.match(expandRegion, /apiFetchAgentSkills\(agentId\)/);

	await app.close();
	});

test("GET /playground/agents renders expanded skills as two-column cards with storage metadata", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	assert.match(body, /\.ag-skill-list\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
	assert.match(body, /@media \(max-width: 1024px\)\s*\{[\s\S]*\.ag-skill-list\s*\{\s*grid-template-columns:\s*1fr;/);
	assert.match(body, /function compactSkillPath\(path\)/);
	assert.match(body, /function getSkillStorageMeta\(skill\)/);
	assert.match(body, /storageKind/);
	assert.match(body, /storageRoot/);
	assert.match(body, /ag-skill-location--system/);
	assert.match(body, /ag-skill-location--agent/);
	assert.doesNotMatch(body, /ag-skill-state/);
	assert.match(body, /Agent 安装/);
	assert.match(body, /系统技能/);
	await app.close();
});

	test("GET /playground/agents skill toggle still calls PATCH when expanded", async () => {
		const app = await buildServer({
			agentService: createAgentServiceStub(),
		});
		const response = await app.inject({
			method: "GET",
			url: "/playground/agents",
		});
		assert.equal(response.statusCode, 200);
		const body = response.body;

		const toggleStart = body.indexOf("async function apiToggleSkill(");
		const toggleEnd = body.indexOf("async function apiFetchGallerySkills", toggleStart);
		assert.ok(toggleStart >= 0, "apiToggleSkill function not found");
		assert.ok(toggleEnd > toggleStart, "apiToggleSkill region end not found");
		const toggleRegion = body.slice(toggleStart, toggleEnd);

		assert.match(toggleRegion, /method: "PATCH"/);
		assert.match(toggleRegion, /\/skills\//);

		await app.close();
	});

test("GET /playground/agents skill count shows dash for unloaded and number for loaded", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	// Helper getSkillCountText exists and distinguishes unloaded vs loaded-empty
	const helperStart = body.indexOf("function getSkillCountText(");
	assert.ok(helperStart >= 0, "getSkillCountText helper not found");
	const helperEnd = body.indexOf("function getCollapsedSkillSummary(", helperStart);
	assert.ok(helperEnd > helperStart, "getCollapsedSkillSummary not found after getSkillCountText");
	const helperRegion = body.slice(helperStart, helperEnd);
	assert.match(helperRegion, /Array.isArray\(skills\)/);
	assert.match(helperRegion, /return.*String\(skills\.length\)/);
	assert.match(helperRegion, /return.*["']—["']/);

	// getStatCounts uses the helper
	const statStart = body.indexOf("function getStatCounts()");
	const statEnd = body.indexOf("/* ── Rendering: Stats", statStart);
	assert.ok(statStart >= 0, "getStatCounts not found");
	assert.ok(statEnd > statStart, "getStatCounts region end not found");
	const statRegion = body.slice(statStart, statEnd);
	assert.match(statRegion, /getSkillCountText/);
	assert.doesNotMatch(statRegion, /\|\|\s*\[\]/);

	await app.close();
});

test("GET /playground/agents declares skillsLoadedByAgentId for per-agent cache metadata", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	assert.match(body, /skillsLoadedByAgentId:\s*\{\}/);
	await app.close();
});

test("GET /playground/agents apiFetchAgentSkills propagates failures and marks loaded only on success", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const fetchStart = body.indexOf("async function apiFetchAgentSkills(");
	const fetchEnd = body.indexOf("async function apiArchiveAgent(", fetchStart);
	assert.ok(fetchStart >= 0, "apiFetchAgentSkills function not found");
	assert.ok(fetchEnd > fetchStart, "apiFetchAgentSkills region end not found");
	const fetchRegion = body.slice(fetchStart, fetchEnd);

	const fetchJsonIdx = fetchRegion.indexOf("fetchJson(");
	const loadedIdx = fetchRegion.indexOf("skillsLoadedByAgentId[agentId]");
	assert.ok(fetchJsonIdx >= 0, "fetchJson call not found");
	assert.ok(loadedIdx > fetchJsonIdx,
		"skillsLoadedByAgentId[agentId] must be set after a successful fetchJson call");
	assert.doesNotMatch(fetchRegion, /catch\s*\{\s*\}/);
	assert.doesNotMatch(fetchRegion, /catch\s*\([^)]*\)\s*\{\s*\}/);
	await app.close();
});

test("GET /playground/agents apiFetchGallerySkills marks main as loaded only on success", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const galleryStart = body.indexOf("async function apiFetchGallerySkills()");
	const galleryEnd = body.indexOf("async function apiCopySkill", galleryStart);
	assert.ok(galleryStart >= 0, "apiFetchGallerySkills function not found");
	assert.ok(galleryEnd > galleryStart, "apiFetchGallerySkills region end not found");
	const galleryRegion = body.slice(galleryStart, galleryEnd);

	const tryIdx = galleryRegion.indexOf("try {");
	const catchIdx = galleryRegion.indexOf("} catch {");
	const loadedIdx = galleryRegion.indexOf("skillsLoadedByAgentId.main");
	assert.ok(tryIdx >= 0, "try block not found");
	assert.ok(catchIdx > tryIdx, "catch block not found");
	assert.ok(loadedIdx > tryIdx && loadedIdx < catchIdx,
		"skillsLoadedByAgentId.main must be inside the try block, before catch");
	const catchRegion = galleryRegion.slice(catchIdx);
	assert.doesNotMatch(catchRegion, /skillsLoadedByAgentId/);
	assert.doesNotMatch(catchRegion, /skillsByAgentId\.main/);
	assert.match(galleryRegion, /state.skillsByAgentId.main\s*=\s*state.gallerySkills/);
	await app.close();
});

test("GET /playground/agents handleRefreshSkills force fetches selected agent", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const refreshStart = body.indexOf("async function handleRefreshSkills()");
	const refreshEnd = body.indexOf("function handleExpandSkills(", refreshStart);
	assert.ok(refreshStart >= 0, "handleRefreshSkills function not found");
	assert.ok(refreshEnd > refreshStart, "handleRefreshSkills region end not found");
	const refreshRegion = body.slice(refreshStart, refreshEnd);

	assert.match(refreshRegion, /var agentId = state\.selectedId/);
	assert.match(refreshRegion, /apiFetchAgentSkills\(agentId\)/);
	assert.match(refreshRegion, /state\.selectedId === agentId/);
	await app.close();
});

test("GET /playground/agents toggle only refreshes affected agent cache", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const renderSkillsStart = body.indexOf("function renderSkills()");
	const renderSkillsEnd = body.indexOf("function populateSkillSelect(", renderSkillsStart);
	assert.ok(renderSkillsStart >= 0, "renderSkills function not found");
	assert.ok(renderSkillsEnd > renderSkillsStart, "renderSkills region end not found");
	const renderSkillsRegion = body.slice(renderSkillsStart, renderSkillsEnd);

	assert.match(renderSkillsRegion, /var touchedAgentId = agent\.agentId/);
	assert.match(renderSkillsRegion, /apiFetchAgentSkills\(touchedAgentId\)/);
	assert.match(renderSkillsRegion, /return apiFetchAgentSkills\(touchedAgentId\)/);
	assert.match(renderSkillsRegion, /state\.selectedId === touchedAgentId/);
	assert.doesNotMatch(renderSkillsRegion, /skillsLoadedByAgentId\s*=\s*\{\}/);
	assert.doesNotMatch(renderSkillsRegion, /skillsByAgentId\s*=\s*\{\}/);
	await app.close();
});

test("GET /playground/agents remove and install capture agentId before await", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	// handleRemoveSkill captures agentId locally
	const removeStart = body.indexOf("async function handleRemoveSkill(");
	const removeEnd = body.indexOf("async function handleCopySkill(", removeStart);
	assert.ok(removeStart >= 0, "handleRemoveSkill function not found");
	assert.ok(removeEnd > removeStart, "handleRemoveSkill region end not found");
	const removeRegion = body.slice(removeStart, removeEnd);

	assert.match(removeRegion, /var agentId = state.selectedId/);
	assert.match(removeRegion, /apiRemoveSkill\(agentId,/);
	assert.match(removeRegion, /apiFetchAgentSkills\(agentId\)/);
	assert.match(removeRegion, /state.selectedId === agentId/);
	assert.doesNotMatch(removeRegion, /skillsLoadedByAgentIds*=s*{}/);

	// handleCopySkill captures agentId locally
	const copyStart = body.indexOf("async function handleCopySkill()");
	const copyEnd = body.indexOf("async function handleRefreshSkills(", copyStart);
	assert.ok(copyStart >= 0, "handleCopySkill function not found");
	assert.ok(copyEnd > copyStart, "handleCopySkill region end not found");
	const copyRegion = body.slice(copyStart, copyEnd);

	assert.match(copyRegion, /var agentId = state.selectedId/);
	assert.match(copyRegion, /apiCopySkill\(agentId,/);
	assert.match(copyRegion, /apiFetchAgentSkills\(agentId\)/);
	assert.match(copyRegion, /state.selectedId === agentId/);
	assert.doesNotMatch(copyRegion, /skillsLoadedByAgentIds*=s*{}/);
	await app.close();
});

test("GET /playground/agents defers browser and model catalogs from initial load", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const initStart = body.indexOf("async function init()");
	const initEnd = body.indexOf("document.addEventListener(\"DOMContentLoaded\", init)", initStart);
	assert.ok(initStart >= 0, "init function not found");
	assert.ok(initEnd > initStart, "init region end not found");
	const initRegion = body.slice(initStart, initEnd);

	assert.match(initRegion, /apiFetchAgents\(\)/);
	assert.match(initRegion, /apiFetchGallerySkills\(\)/);
	assert.match(body, /fetchJson\("\/v1\/agents"\)/);
	assert.match(body, /fetchJson\("\/v1\/agents\/status"\)/);
	assert.match(body, /fetchJson\("\/v1\/agents\/main\/skills"\)/);
	assert.doesNotMatch(initRegion, /fetchJson\("\/v1\/browsers"\)/);
	assert.doesNotMatch(initRegion, /fetchJson\("\/v1\/model-config"\)/);
	await app.close();
});

test("GET /playground/agents loads support catalogs only when create or edit editor opens", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	assert.match(body, /supportCatalogsLoaded:\s*false/);
	assert.match(body, /supportCatalogsLoading:\s*false/);

	const loaderStart = body.indexOf("async function loadSupportCatalogs()");
	const loaderEnd = body.indexOf("function loadSupportCatalogsForEditor(", loaderStart);
	assert.ok(loaderStart >= 0, "loadSupportCatalogs function not found");
	assert.ok(loaderEnd > loaderStart, "loadSupportCatalogs region end not found");
	const loaderRegion = body.slice(loaderStart, loaderEnd);
	assert.match(loaderRegion, /supportCatalogsLoaded/);
	assert.match(loaderRegion, /supportCatalogsLoading/);
	assert.match(loaderRegion, /fetchJson\("\/v1\/browsers"\)/);
	assert.match(loaderRegion, /fetchJson\("\/v1\/model-config"\)/);

	const createStart = body.indexOf("function openCreateEditor()");
	const createEnd = body.indexOf("function openEditEditor()", createStart);
	const editStart = createEnd;
	const editEnd = body.indexOf("function closeEditor()", editStart);
	assert.ok(createStart >= 0 && createEnd > createStart, "openCreateEditor region not found");
	assert.ok(editStart >= 0 && editEnd > editStart, "openEditEditor region not found");
	const createRegion = body.slice(createStart, createEnd);
	const editRegion = body.slice(editStart, editEnd);
	assert.match(createRegion, /loadSupportCatalogsForEditor\(null\)/);
	assert.match(editRegion, /loadSupportCatalogsForEditor\(agent\)/);
	await app.close();
});

test("GET /playground/agents disables editor submit while support catalogs are loading", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const renderStart = body.indexOf("function renderEditorForm(agent)");
	const renderEnd = body.indexOf("function showEditorError(", renderStart);
	assert.ok(renderStart >= 0, "renderEditorForm function not found");
	assert.ok(renderEnd > renderStart, "renderEditorForm region end not found");
	const renderRegion = body.slice(renderStart, renderEnd);

	assert.match(renderRegion, /supportCatalogsReady/);
	assert.match(renderRegion, /supportCatalogsLoading/);
	assert.match(renderRegion, /ed-submit/);
	assert.match(renderRegion, /supportCatalogDisabled = supportCatalogsReady \? ["']{2} : ["'] disabled["']/);
	assert.match(renderRegion, /正在加载浏览器和模型配置/);
	await app.close();
});

test("GET /playground/agents guards create and edit submit when model config is unavailable", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const guardStart = body.indexOf("function guardEditorSupportCatalogs()");
	const guardEnd = body.indexOf("function bindEditorModelProviderSelect()", guardStart);
	assert.ok(guardStart >= 0, "guardEditorSupportCatalogs function not found");
	assert.ok(guardEnd > guardStart, "guardEditorSupportCatalogs region end not found");
	const guardRegion = body.slice(guardStart, guardEnd);
	assert.match(guardRegion, /!state\.supportCatalogsLoaded/);
	assert.match(guardRegion, /!state\.modelConfig/);
	assert.match(guardRegion, /return false/);

	const modelPatchStart = body.indexOf("function buildEditorModelPatch(isEdit)");
	const modelPatchEnd = body.indexOf("function getBrowserLabel(", modelPatchStart);
	assert.ok(modelPatchStart >= 0, "buildEditorModelPatch function not found");
	assert.ok(modelPatchEnd > modelPatchStart, "buildEditorModelPatch region end not found");
	const modelPatchRegion = body.slice(modelPatchStart, modelPatchEnd);
	assert.match(modelPatchRegion, /if \(!state\.modelConfig\)/);
	assert.match(modelPatchRegion, /return null/);

	const createStart = body.indexOf("async function handleEditorCreate()");
	const createEnd = body.indexOf("async function handleEditorUpdate()", createStart);
	const updateStart = createEnd;
	const updateEnd = body.indexOf("async function handleRefresh()", updateStart);
	assert.ok(createStart >= 0 && createEnd > createStart, "handleEditorCreate region not found");
	assert.ok(updateStart >= 0 && updateEnd > updateStart, "handleEditorUpdate region not found");
	const createRegion = body.slice(createStart, createEnd);
	const updateRegion = body.slice(updateStart, updateEnd);
	assert.match(createRegion, /guardEditorSupportCatalogs\(\)/);
	assert.match(updateRegion, /guardEditorSupportCatalogs\(\)/);
	await app.close();
});

test("GET /playground/agents keeps detail body stable and updates detail regions", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const detailStart = body.indexOf("function renderDetailBody()");
	const detailEnd = body.indexOf("function ensureDetailShell(", detailStart);
	assert.ok(detailStart >= 0, "renderDetailBody function not found");
	assert.ok(detailEnd > detailStart, "renderDetailBody region end not found");
	const detailRegion = body.slice(detailStart, detailEnd);

	assert.match(detailRegion, /ensureDetailShell\(body,\s*agent\.agentId\)/);
	assert.match(detailRegion, /renderDetailHeader\(agent,\s*status,\s*active\)/);
	assert.match(detailRegion, /renderDetailMiniStats\(agent,\s*status\)/);
	assert.match(detailRegion, /renderDetailConfig\(agent\)/);
	assert.match(detailRegion, /renderSkillsPanel\(agent\)/);
	assert.doesNotMatch(detailRegion, /body\.innerHTML\s*=\s*html/);
	assert.doesNotMatch(detailRegion, /populateSkillSelect\(\)/);

	const shellStart = body.indexOf("function ensureDetailShell(");
	const shellEnd = body.indexOf("function renderDetailHeader(", shellStart);
	assert.ok(shellStart >= 0, "ensureDetailShell function not found");
	assert.ok(shellEnd > shellStart, "ensureDetailShell region end not found");
	const shellRegion = body.slice(shellStart, shellEnd);
	assert.match(shellRegion, /ag-detail-header-region/);
	assert.match(shellRegion, /ag-detail-stats-region/);
	assert.match(shellRegion, /ag-detail-config-region/);
	assert.match(shellRegion, /ag-detail-skills-region/);
	assert.doesNotMatch(shellRegion, /body\.dataset\.agentId === agentId\s*&&/);
	assert.match(shellRegion, /body\.scrollTop = sameAgent \? scrollTop : 0/);

	await app.close();
});

test("GET /playground/agents only rebuilds installable skill select when gallery changes", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const populateStart = body.indexOf("function populateSkillSelect()");
	const populateEnd = body.indexOf("/* \u2500\u2500 Selection", populateStart);
	assert.ok(populateStart >= 0, "populateSkillSelect function not found");
	assert.ok(populateEnd > populateStart, "populateSkillSelect region end not found");
	const populateRegion = body.slice(populateStart, populateEnd);

	assert.match(populateRegion, /getGallerySkillSignature\(\)/);
	assert.match(populateRegion, /sel\.dataset\.gallerySignature === signature/);
	assert.match(populateRegion, /return/);
	assert.doesNotMatch(populateRegion, /gallerySignature === signature && sel\.options\.length > 1/);
	assert.match(populateRegion, /sel\.dataset\.gallerySignature = signature/);

	const skillsPanelStart = body.indexOf("function renderSkillsPanel(");
	const skillsPanelEnd = body.indexOf("function renderSkillsList(", skillsPanelStart);
	assert.ok(skillsPanelStart >= 0, "renderSkillsPanel function not found");
	assert.ok(skillsPanelEnd > skillsPanelStart, "renderSkillsPanel region end not found");
	const skillsPanelRegion = body.slice(skillsPanelStart, skillsPanelEnd);
	assert.match(skillsPanelRegion, /populateSkillSelect\(\)/);
	assert.doesNotMatch(skillsPanelRegion, /body\.innerHTML/);

	await app.close();
});

test("GET /playground/agents updates skills loading and mutation through local regions", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const expandStart = body.indexOf("function handleExpandSkills()");
	const expandEnd = body.indexOf("function mobileBackToList(", expandStart);
	assert.ok(expandStart >= 0, "handleExpandSkills function not found");
	assert.ok(expandEnd > expandStart, "handleExpandSkills region end not found");
	const expandRegion = body.slice(expandStart, expandEnd);
	assert.match(expandRegion, /var agentId = state\.selectedId/);
	assert.match(expandRegion, /state\.skillsLoadingAgentId = agentId/);
	assert.match(expandRegion, /renderSkillsPanel\(agent\)/);
	assert.match(expandRegion, /renderSkillsList\(agentId\)/);
	assert.match(expandRegion, /state\.selectedId !== agentId/);
	assert.doesNotMatch(expandRegion, /renderDetailBody\(\)/);

	const refreshStart = body.indexOf("async function handleRefreshSkills()");
	const refreshEnd = body.indexOf("function handleExpandSkills(", refreshStart);
	assert.ok(refreshStart >= 0, "handleRefreshSkills function not found");
	assert.ok(refreshEnd > refreshStart, "handleRefreshSkills region end not found");
	const refreshRegion = body.slice(refreshStart, refreshEnd);
	assert.match(refreshRegion, /var agentId = state\.selectedId/);
	assert.match(refreshRegion, /state\.skillsLoadingAgentId = agentId/);
	assert.match(refreshRegion, /state\.selectedId === agentId/);
	assert.match(refreshRegion, /renderSkillsList\(agentId\)/);
	assert.match(refreshRegion, /renderDetailMiniStats\(agent,\s*getStatusBadge\(agent\)\)/);
	assert.match(refreshRegion, /finally[\s\S]*state\.skillsLoadingAgentId === agentId[\s\S]*renderSkillsList\(agentId\)/);
	assert.doesNotMatch(refreshRegion, /renderDetailBody\(\)/);

	await app.close();
});

test("GET /playground/agents shows a retryable skills error instead of an empty list when loading fails", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const renderSkillsStart = body.indexOf("function renderSkillsList(");
	const renderSkillsEnd = body.indexOf("function getGallerySkillSignature(", renderSkillsStart);
	assert.ok(renderSkillsStart >= 0, "renderSkillsList function not found");
	assert.ok(renderSkillsEnd > renderSkillsStart, "renderSkillsList region end not found");
	const renderSkillsRegion = body.slice(renderSkillsStart, renderSkillsEnd);
	const notLoadedIdx = renderSkillsRegion.indexOf("!state.skillsLoadedByAgentId[agentId]");
	const emptyIdx = renderSkillsRegion.indexOf("暂无 scoped 技能");
	assert.ok(notLoadedIdx >= 0, "not-loaded skills branch not found");
	assert.ok(emptyIdx > notLoadedIdx, "not-loaded branch must run before the empty-list branch");
	assert.match(renderSkillsRegion, /技能加载失败/);
	assert.match(renderSkillsRegion, /请重试/);
	await app.close();
});

test("GET /playground/agents guards async skill results against stale selection", async () => {
	const app = await buildServer({
		agentService: createAgentServiceStub(),
	});
	const response = await app.inject({
		method: "GET",
		url: "/playground/agents",
	});
	assert.equal(response.statusCode, 200);
	const body = response.body;

	const renderSkillsStart = body.indexOf("function renderSkillsList(");
	const renderSkillsEnd = body.indexOf("function getGallerySkillSignature(", renderSkillsStart);
	assert.ok(renderSkillsStart >= 0, "renderSkillsList function not found");
	assert.ok(renderSkillsEnd > renderSkillsStart, "renderSkillsList region end not found");
	const renderSkillsRegion = body.slice(renderSkillsStart, renderSkillsEnd);
	assert.match(renderSkillsRegion, /var agentId = expectedAgentId \|\| state\.selectedId/);
	assert.match(renderSkillsRegion, /state\.selectedId !== agentId/);
	assert.match(renderSkillsRegion, /return/);

	const removeStart = body.indexOf("async function handleRemoveSkill(");
	const removeEnd = body.indexOf("async function handleCopySkill(", removeStart);
	assert.ok(removeStart >= 0, "handleRemoveSkill function not found");
	assert.ok(removeEnd > removeStart, "handleRemoveSkill region end not found");
	const removeRegion = body.slice(removeStart, removeEnd);
	assert.match(removeRegion, /var agentId = state\.selectedId/);
	assert.match(removeRegion, /state\.selectedId === agentId/);
	assert.match(removeRegion, /renderSkillsList\(agentId\)/);

	const copyStart = body.indexOf("async function handleCopySkill()");
	const copyEnd = body.indexOf("async function handleRefreshSkills(", copyStart);
	assert.ok(copyStart >= 0, "handleCopySkill function not found");
	assert.ok(copyEnd > copyStart, "handleCopySkill region end not found");
	const copyRegion = body.slice(copyStart, copyEnd);
	assert.match(copyRegion, /var agentId = state\.selectedId/);
	assert.match(copyRegion, /state\.selectedId === agentId/);
	assert.match(copyRegion, /renderSkillsList\(agentId\)/);

	await app.close();
});
