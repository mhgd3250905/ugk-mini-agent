export function getConnPageJs(): string {
	return `
// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_LABELS = { active: "运行中", paused: "已暂停", completed: "已完成" };
const RUN_STATUS_LABELS = { pending: "待执行", running: "执行中", succeeded: "成功", failed: "失败", cancelled: "已取消" };
const RUN_REFRESH_DELAY_MS = 3000;
const RUN_REFRESH_MAX_ATTEMPTS = 120;
const RUN_HISTORY_PAGE_SIZE = 10;

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  conns: [],
  selectedId: null,
  filter: "all",
  search: "",
  runsByConnId: {},
  runHistoryStateByConnId: {},
  runHistoryPageByConnId: {},
  expandedRunId: null,
  editorOpen: false,
  editorMode: null,
  editorConnId: null,
  editorSaving: false,
  editorError: "",
  actionConnId: "",
  actionKind: "",
  cancellingRunId: "",
  markingAllRead: false,
  refreshing: false,
  editorSupportCatalogsLoaded: false,
  editorSupportCatalogsLoading: false,
  editorSupportCatalogsError: "",
  editorSupportCatalogsPromise: null,
  loadingMoreRunsConnId: "",
  loadingMoreRunId: "",
  runRefreshTimers: {},
  agentCatalog: [],
  browserCatalog: [],
  modelConfig: null,
  modelProviders: [],
  modelOptions: [],
  editorSelectedAssets: [],
  runDetailEvents: {},
  runDetailEventsHasMore: {},
  runDetailEventsNextBefore: {},
  runDetailFiles: {},
  sseSource: null,
  unreadCountsByConnId: {},
  unreadLatestRunTimesByConnId: {},
  totalUnreadRuns: 0,
};

// ── Helper: Element refs ───────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

async function writeClipboardText(text) {
  const value = String(text || "");
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("copy_failed");
    }
  } finally {
    textarea.remove();
  }
}

function copyToClipboard(text) {
  return writeClipboardText(text).then(function() {
    showToast("已复制", "success");
    return true;
  }).catch(function() {
    showToast("复制失败", "error");
    return false;
  });
}

// ── API Functions ──────────────────────────────────────────────────────────

async function apiFetchConns() {
  const data = await fetchJson("/v1/conns");
  return {
    conns: data.conns || [],
    unreadCountsByConnId: data.unreadRunCountsByConnId || {},
    unreadLatestRunTimesByConnId: data.unreadLatestRunTimesByConnId || {},
    totalUnreadRuns: data.totalUnreadRuns || 0,
  };
}

async function apiFetchRuns(connId, before) {
  const params = new URLSearchParams({ limit: String(RUN_HISTORY_PAGE_SIZE) });
  if (before) params.set("before", String(before));
  const data = await fetchJson("/v1/conns/" + encodeURIComponent(connId) + "/runs?" + params.toString());
  return {
    runs: data.runs || [],
    hasMore: Boolean(data.hasMore),
    nextBefore: typeof data.nextBefore === "string" ? data.nextBefore : "",
    limit: Number(data.limit) || RUN_HISTORY_PAGE_SIZE,
  };
}

async function apiFetchRunDetail(connId, runId) {
  return await fetchJson("/v1/conns/" + encodeURIComponent(connId) + "/runs/" + encodeURIComponent(runId));
}

async function apiFetchRunEvents(connId, runId, before) {
  const params = new URLSearchParams({ limit: "10" });
  if (before) { params.set("before", String(before)); }
  return await fetchJson(
    "/v1/conns/" + encodeURIComponent(connId) + "/runs/" + encodeURIComponent(runId) + "/events?" + params.toString()
  );
}

async function apiMarkRunRead(connId, runId) {
  const resp = await fetch("/v1/conns/" + encodeURIComponent(connId) + "/runs/" + encodeURIComponent(runId) + "/read", {
    method: "POST",
    headers: { accept: "application/json" },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || "标记已读失败");
  return data;
}

async function apiMarkAllRunsRead() {
  const resp = await fetch("/v1/conns/runs/read-all", {
    method: "POST",
    headers: { accept: "application/json" },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || "全部已读失败");
  return data;
}

async function apiCreateConn(payload) {
  const resp = await fetch("/v1/conns", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || data?.message || "创建失败");
  return data;
}

async function apiUpdateConn(connId, payload, headers) {
  const resp = await fetch("/v1/conns/" + encodeURIComponent(connId), {
    method: "PATCH",
    headers: { "content-type": "application/json", accept: "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || data?.message || "更新失败");
  return data;
}

async function apiDeleteConn(connId) {
  const resp = await fetch("/v1/conns/" + encodeURIComponent(connId), {
    method: "DELETE",
    headers: { accept: "application/json" },
  });
  if (!resp.ok && resp.status !== 204) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data?.error?.message || data?.message || "删除失败");
  }
}

async function apiPauseConn(connId) {
  const resp = await fetch("/v1/conns/" + encodeURIComponent(connId) + "/pause", {
    method: "POST",
    headers: { accept: "application/json" },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || data?.message || "暂停失败");
  return data;
}

async function apiResumeConn(connId) {
  const resp = await fetch("/v1/conns/" + encodeURIComponent(connId) + "/resume", {
    method: "POST",
    headers: { accept: "application/json" },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || data?.message || "恢复失败");
  return data;
}

async function apiRunNow(connId) {
  const resp = await fetch("/v1/conns/" + encodeURIComponent(connId) + "/run", {
    method: "POST",
    headers: { accept: "application/json" },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || data?.message || "执行失败");
  return data;
}

async function apiCancelRun(connId, runId) {
  const resp = await fetch("/v1/conns/" + encodeURIComponent(connId) + "/runs/" + encodeURIComponent(runId) + "/cancel", {
    method: "POST",
    headers: { accept: "application/json" },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || data?.message || "终止失败");
  return data;
}

async function apiFetchAgentCatalog() {
  const data = await fetchJson("/v1/agents");
  return data.agents || [];
}

async function apiFetchBrowserCatalog() {
  const data = await fetchJson("/v1/browsers");
  return data.browsers || [];
}

async function apiFetchModelConfig() {
  return await fetchJson("/v1/model-config");
}

function isRunInFlight(run) {
  return run?.status === "pending" || run?.status === "running";
}

function isUnreadResultRun(run) {
  return (run?.status === "succeeded" || run?.status === "failed") && !run.readAt;
}

function markLoadedRunCachesRead(readAt) {
  const nextReadAt = readAt || new Date().toISOString();
  for (const conn of state.conns || []) {
    if (isUnreadResultRun(conn?.latestRun)) conn.latestRun.readAt = nextReadAt;
  }
  for (const connId of Object.keys(state.runsByConnId || {})) {
    const runs = state.runsByConnId[connId] || [];
    for (const run of runs) {
      if (isUnreadResultRun(run)) run.readAt = nextReadAt;
    }
  }
}

function hasActiveRunForConn(connId) {
  const runs = state.runsByConnId[connId] || [];
  if (runs.some(isRunInFlight)) return true;
  const conn = state.conns.find(c => c.connId === connId);
  return isRunInFlight(conn?.latestRun);
}

function hasRunHistoryCache(connId) {
  return Object.prototype.hasOwnProperty.call(state.runsByConnId, connId);
}

function getRunHistoryState(connId) {
  const entry = state.runHistoryStateByConnId[connId];
  if (entry && entry.status) return entry;
  if (hasRunHistoryCache(connId)) return { status: "loaded", error: "" };
  return { status: "idle", error: "" };
}

function setRunHistoryState(connId, status, error) {
  state.runHistoryStateByConnId[connId] = { status, error: error || "" };
}

function getRunHistoryPage(connId) {
  const page = state.runHistoryPageByConnId[connId] || {};
  return {
    hasMore: Boolean(page.hasMore),
    nextBefore: typeof page.nextBefore === "string" ? page.nextBefore : "",
    limit: Number(page.limit) || RUN_HISTORY_PAGE_SIZE,
  };
}

function setRunHistoryPage(connId, page) {
  state.runHistoryPageByConnId[connId] = {
    hasMore: Boolean(page && page.hasMore),
    nextBefore: page && typeof page.nextBefore === "string" ? page.nextBefore : "",
    limit: Number(page && page.limit) || RUN_HISTORY_PAGE_SIZE,
  };
}

function getRunHistoryScrollTop() {
  const scroller = $("conn-detail-body");
  return scroller && typeof scroller.scrollTop === "number" ? scroller.scrollTop : null;
}

function renderRunHistoryAtScrollTop(conn, scrollTop) {
  const scroller = $("conn-detail-body");
  renderRunHistory(conn);
  if (scroller && scrollTop !== null) scroller.scrollTop = scrollTop;
}

function renderRunHistoryWithStableScroll(conn) {
  renderRunHistoryAtScrollTop(conn, getRunHistoryScrollTop());
}

function upsertRunForConn(connId, run) {
  if (!connId || !run) return;
  const runs = state.runsByConnId[connId] || [];
  state.runsByConnId[connId] = [run, ...runs.filter(current => current?.runId !== run.runId)];
}

async function refreshRunsForConn(connId) {
  if (!connId) return;
  setRunHistoryState(connId, "loading", "");
  try {
    const page = await apiFetchRuns(connId);
    state.runsByConnId[connId] = page.runs;
    setRunHistoryPage(connId, page);
    setRunHistoryState(connId, "loaded", "");
    if (state.selectedId === connId) {
      renderDetail();
      renderList();
    }
  } catch (err) {
    setRunHistoryState(connId, "error", err instanceof Error ? err.message : "加载运行历史失败");
    if (state.selectedId === connId) renderDetail();
    throw err;
  }
}

async function loadRunHistory(connId) {
  if (!connId) return;
  const current = getRunHistoryState(connId);
  if (current.status === "loading") return;
  if (current.status === "loaded" && hasRunHistoryCache(connId)) {
    if (state.selectedId === connId) {
      const conn = state.conns.find(c => c.connId === connId);
      if (conn) renderRunHistory(conn);
    }
    return;
  }

  setRunHistoryState(connId, "loading", "");
  const connAtStart = state.conns.find(c => c.connId === connId);
  if (state.selectedId === connId && connAtStart) renderRunHistory(connAtStart);

  try {
    const page = await apiFetchRuns(connId);
    state.runsByConnId[connId] = page.runs;
    setRunHistoryPage(connId, page);
    setRunHistoryState(connId, "loaded", "");
    if (state.selectedId === connId) {
      const conn = state.conns.find(c => c.connId === connId);
      if (conn) renderRunHistory(conn);
      renderList();
    }
  } catch (err) {
    setRunHistoryState(connId, "error", err instanceof Error ? err.message : "加载运行历史失败");
    if (state.selectedId === connId) {
      const conn = state.conns.find(c => c.connId === connId);
      if (conn) renderRunHistory(conn);
    }
  }
}

async function loadMoreRunHistory(connId) {
  if (!connId || state.loadingMoreRunsConnId) return;
  const pageState = getRunHistoryPage(connId);
  if (!pageState.hasMore || !pageState.nextBefore) return;

  state.loadingMoreRunsConnId = connId;
  const stableScrollTop = getRunHistoryScrollTop();
  if (state.selectedId === connId) {
    const conn = state.conns.find(c => c.connId === connId);
    if (conn) renderRunHistoryAtScrollTop(conn, stableScrollTop);
  }

  try {
    const page = await apiFetchRuns(connId, pageState.nextBefore);
    const existing = state.runsByConnId[connId] || [];
    const seenRunIds = new Set(existing.map(run => run && run.runId).filter(Boolean));
    const nextRuns = (page.runs || []).filter(run => run && !seenRunIds.has(run.runId));
    state.runsByConnId[connId] = [...existing, ...nextRuns];
    setRunHistoryPage(connId, page);
    setRunHistoryState(connId, "loaded", "");
    if (state.selectedId === connId) {
      const conn = state.conns.find(c => c.connId === connId);
      if (conn) renderRunHistoryAtScrollTop(conn, stableScrollTop);
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : "加载更多运行历史失败", "error");
  } finally {
    if (state.loadingMoreRunsConnId === connId) state.loadingMoreRunsConnId = "";
    if (state.selectedId === connId) {
      const conn = state.conns.find(c => c.connId === connId);
      if (conn) renderRunHistoryAtScrollTop(conn, stableScrollTop);
    }
  }
}

function scheduleRunRefresh(connId, attempt) {
  if (!connId || attempt >= RUN_REFRESH_MAX_ATTEMPTS) {
    if (connId && state.runRefreshTimers[connId]) {
      clearTimeout(state.runRefreshTimers[connId]);
      delete state.runRefreshTimers[connId];
    }
    return;
  }
  if (state.runRefreshTimers[connId]) clearTimeout(state.runRefreshTimers[connId]);
  state.runRefreshTimers[connId] = setTimeout(async function() {
    try {
      await refreshRunsForConn(connId);
      if (hasActiveRunForConn(connId)) {
        scheduleRunRefresh(connId, attempt + 1);
      } else {
        delete state.runRefreshTimers[connId];
      }
    } catch {
      scheduleRunRefresh(connId, attempt + 1);
    }
  }, RUN_REFRESH_DELAY_MS);
}

async function apiUploadAssets(files, connId) {
  const formData = new FormData();
  for (const file of files) { formData.append("files", file); }
  if (connId) { formData.append("conversationId", "conn:" + connId); }
  const resp = await fetch("/v1/assets/upload", { method: "POST", body: formData });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || data?.message || "上传失败");
  return data.assets || data || [];
}

// ── Schedule / Target helpers ──────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, "0"); }

function formatDuration(start, end) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return pad2(m) + ":" + pad2(rs);
  const h = Math.floor(m / 60);
  return pad2(h) + ":" + pad2(m % 60) + ":" + pad2(rs);
}

function describeSchedule(schedule) {
  if (!schedule || typeof schedule !== "object") return "未配置";
  if (schedule.kind === "once") {
    const d = schedule.at ? new Date(schedule.at) : null;
    return "定时执行" + (d && !isNaN(d.getTime()) ? " · " + d.getFullYear() + "-" + pad2(d.getMonth()+1) + "-" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) : "");
  }
  if (schedule.kind === "interval") {
    const mins = Math.round((schedule.everyMs || 0) / 60000);
    return "间隔执行 · 每" + (mins >= 60 ? (mins/60) + "小时" : mins + "分钟");
  }
  if (schedule.kind === "cron") {
    return "Cron · " + (schedule.expression || "");
  }
  return String(schedule.kind || "未配置");
}

function describeTarget(target) {
  if (!target || typeof target !== "object") return "任务消息";
  if (target.type === "feishu_chat") return "飞书群 · " + (target.chatId || "");
  if (target.type === "feishu_user") return "飞书用户 · " + (target.openId || "");
  return "任务消息";
}

function describeTiming(conn) {
  const parts = [];
  if (conn.nextRunAt) {
    const d = new Date(conn.nextRunAt);
    parts.push("下次 " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()));
  }
  if (conn.lastRunAt) {
    const d = new Date(conn.lastRunAt);
    parts.push("上次 " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()));
  }
  if (conn.maxRunMs) {
    const sec = Math.round(conn.maxRunMs / 1000);
    parts.push("最长 " + sec + "秒");
  }
  return parts.join(" · ") || "待定";
}

// ── Rendering ──────────────────────────────────────────────────────────────

function renderAll() {
  renderStats();
  renderList();
  renderDetail();
}

function renderStats() {
  const total = state.conns.length;
  const active = state.conns.filter(c => c.status === "active").length;
  const paused = state.conns.filter(c => c.status === "paused").length;
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const failed = state.conns.filter(c => {
    const lr = c.latestRun;
    return lr && lr.status === "failed" && new Date(lr.finishedAt || lr.createdAt || 0).getTime() > dayAgo;
  }).length;

  const elTotal = $("stat-total");
  const elActive = $("stat-active");
  const elPaused = $("stat-paused");
  const elFailed = $("stat-failed");
  if (elTotal) elTotal.textContent = total;
  if (elActive) elActive.textContent = active;
  if (elPaused) elPaused.textContent = paused;
  if (elFailed) elFailed.textContent = failed;
  const elUnread = $("stat-unread");
  if (elUnread) elUnread.textContent = state.totalUnreadRuns || 0;
}

function getFilteredConns() {
  let list = state.conns;
  if (state.filter !== "all") {
    list = list.filter(c => c.status === state.filter);
  }
  if (state.search) {
    const q = state.search.toLowerCase();
    list = list.filter(c =>
      (c.title || "").toLowerCase().includes(q) ||
      (c.connId || "").toLowerCase().includes(q) ||
      (c.prompt || "").toLowerCase().includes(q)
    );
  }
  return list.slice().sort(compareConnListItems);
}

function getConnLatestRunTimeMs(conn) {
  const latestRun = conn?.latestRun || null;
  const candidates = [
    latestRun?.finishedAt,
    latestRun?.updatedAt,
    latestRun?.createdAt,
    conn?.lastRunAt,
    conn?.updatedAt,
    conn?.createdAt,
  ];
  for (const value of candidates) {
    const time = Date.parse(String(value || ""));
    if (Number.isFinite(time)) return time;
  }
  return 0;
}

function compareConnListItems(left, right) {
  const leftUnreadTime = getConnUnreadTimeMs(left);
  const rightUnreadTime = getConnUnreadTimeMs(right);
  if ((leftUnreadTime > 0) !== (rightUnreadTime > 0)) return leftUnreadTime > 0 ? -1 : 1;
  if (leftUnreadTime !== rightUnreadTime) return rightUnreadTime - leftUnreadTime;

  const leftStatusRank = getConnStatusSortRank(left);
  const rightStatusRank = getConnStatusSortRank(right);
  if (leftStatusRank !== rightStatusRank) return leftStatusRank - rightStatusRank;

  const leftNextRunTime = getConnNextRunTimeMs(left);
  const rightNextRunTime = getConnNextRunTimeMs(right);
  if ((leftNextRunTime > 0) !== (rightNextRunTime > 0)) return leftNextRunTime > 0 ? -1 : 1;
  if (leftNextRunTime !== rightNextRunTime) return leftNextRunTime - rightNextRunTime;

  const leftFallbackTime = getConnLatestRunTimeMs(left);
  const rightFallbackTime = getConnLatestRunTimeMs(right);
  if (leftFallbackTime !== rightFallbackTime) return rightFallbackTime - leftFallbackTime;
  const titleCompare = String(left?.title || "").localeCompare(String(right?.title || ""), "zh-CN");
  if (titleCompare !== 0) return titleCompare;
  return String(left?.connId || "").localeCompare(String(right?.connId || ""));
}

function getConnUnreadTimeMs(conn) {
  const count = state.unreadCountsByConnId[conn?.connId] || 0;
  if (count <= 0) return 0;
  const explicitTime = Date.parse(String(state.unreadLatestRunTimesByConnId[conn?.connId] || ""));
  if (Number.isFinite(explicitTime)) return explicitTime;
  const latestRun = conn?.latestRun || null;
  if (latestRun && !latestRun.readAt && (latestRun.status === "succeeded" || latestRun.status === "failed")) {
    return getFirstValidTimeMs([latestRun.finishedAt, latestRun.updatedAt, latestRun.createdAt]);
  }
  return getConnLatestRunTimeMs(conn);
}

function getConnStatusSortRank(conn) {
  if (conn?.status === "active") return 1;
  if (conn?.status === "paused") return 2;
  if (conn?.status === "completed") return 3;
  return 4;
}

function getConnNextRunTimeMs(conn) {
  return getFirstValidTimeMs([conn?.nextRunAt]);
}

function getFirstValidTimeMs(candidates) {
  for (const value of candidates || []) {
    const time = Date.parse(String(value || ""));
    if (Number.isFinite(time)) return time;
  }
  return 0;
}

function renderList() {
  const container = $("conn-list-items");
  if (!container) return;
  const conns = getFilteredConns();

  function appendNewConnEditorItem() {
    const newItem = document.createElement("div");
    newItem.className = "conn-list-item is-selected";
    newItem.setAttribute("role", "button");
    newItem.tabIndex = 0;
    newItem.innerHTML = '<div class="conn-list-item-row"><span class="conn-list-item-dot conn-list-item-dot--active"></span><span class="conn-list-item-title">新建任务</span><span class="conn-list-item-badge conn-list-item-badge--active">新建</span></div>';
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "conn-list-item-editor-actions";
    const submitDisabled = isEditorSubmitDisabled();
    actionsDiv.innerHTML = '<button data-editor-action="submit" class="conn-list-editor-btn conn-list-editor-btn--primary" type="button"' + (submitDisabled ? ' disabled' : '') + '>' + (state.editorSaving ? "保存中" : "保存任务") + '</button><button data-editor-action="cancel" class="conn-list-editor-btn conn-list-editor-btn--cancel" type="button"' + (state.editorSaving ? ' disabled' : '') + '>取消</button>';
    const submitBtn = actionsDiv.querySelector('[data-editor-action="submit"]');
    if (submitBtn) submitBtn.addEventListener("click", (event) => { event.stopPropagation(); submitEditor(); });
    const cancelBtn = actionsDiv.querySelector('[data-editor-action="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener("click", (event) => { event.stopPropagation(); closeEditor(); });
    newItem.appendChild(actionsDiv);
    container.appendChild(newItem);
  }

  if (state.editorOpen && state.editorMode === "create" && conns.length === 0) {
    container.innerHTML = "";
    appendNewConnEditorItem();
    const footer = document.querySelector(".conn-list-footer");
    if (footer) footer.remove();
    return;
  }

  if (conns.length === 0) {
    container.innerHTML = '<div class="conn-list-empty"><div class="conn-list-empty-icon"><svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 13h4"/></svg></div><div class="conn-list-empty-title">暂无任务</div><div>创建你的第一个后台任务</div></div>';
    const footer = document.querySelector(".conn-list-footer");
    if (footer) footer.remove();
    return;
  }

  container.innerHTML = "";

  // When creating a new task, show a virtual "new task" item at the top
  if (state.editorOpen && state.editorMode === "create") {
    appendNewConnEditorItem();
  }

  for (const conn of conns) {
    const item = document.createElement("div");
    item.className = "conn-list-item" + (state.selectedId === conn.connId ? " is-selected" : "");
    item.dataset.connId = conn.connId;
    item.setAttribute("role", "button");
    item.tabIndex = 0;

    const dotClass = "conn-list-item-dot--" + (conn.status || "unknown");
    const badgeClass = "conn-list-item-badge--" + (conn.status || "unknown");
    const statusLabel = STATUS_LABELS[conn.status] || conn.status || "未知";
    const schedSummary = describeSchedule(conn.schedule);
    const metaText = (conn.profileId || "main") + (conn.modelProvider ? (" · " + conn.modelProvider) : "");

    var unreadCount = state.unreadCountsByConnId[conn.connId] || 0;
    var unreadHtml = unreadCount > 0 ? '<div class="conn-list-item-unread">' + (unreadCount > 99 ? "99+" : String(unreadCount)) + '条未读</div>' : '';
    item.innerHTML = '<div class="conn-list-item-row"><span class="conn-list-item-dot ' + dotClass + '"></span><span class="conn-list-item-title">' + escapeHtml(conn.title || conn.connId) + '</span><span class="conn-list-item-badge ' + badgeClass + '">' + statusLabel + '</span></div><div class="conn-list-item-schedule">' + escapeHtml(schedSummary) + '</div><div class="conn-list-item-meta">' + escapeHtml(metaText) + '</div>' + unreadHtml;

    // Show editor action buttons on the selected item when editing
    if (state.editorOpen && state.selectedId === conn.connId) {
      const isEdit = state.editorMode === "edit";
      const actionsDiv = document.createElement("div");
      actionsDiv.className = "conn-list-item-editor-actions";
      const submitDisabled = isEditorSubmitDisabled();
      actionsDiv.innerHTML = '<button data-editor-action="submit" class="conn-list-editor-btn conn-list-editor-btn--primary" type="button"' + (submitDisabled ? ' disabled' : '') + '>' + (state.editorSaving ? "保存中" : (isEdit ? "保存修改" : "保存任务")) + '</button><button data-editor-action="cancel" class="conn-list-editor-btn conn-list-editor-btn--cancel" type="button"' + (state.editorSaving ? ' disabled' : '') + '>取消</button>';
      const submitBtn = actionsDiv.querySelector('[data-editor-action="submit"]');
      if (submitBtn) submitBtn.addEventListener("click", (event) => { event.stopPropagation(); submitEditor(); });
      const cancelBtn = actionsDiv.querySelector('[data-editor-action="cancel"]');
      if (cancelBtn) cancelBtn.addEventListener("click", (event) => { event.stopPropagation(); closeEditor(); });
      item.appendChild(actionsDiv);
    }

    item.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest(".conn-list-item-editor-actions")) {
        return;
      }
      handleConnSelect(conn.connId);
    });
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      handleConnSelect(conn.connId);
    });
    container.appendChild(item);
  }

  let footer = document.querySelector(".conn-list-footer");
  if (!footer) {
    const list = document.querySelector(".conn-list");
    if (list) {
      footer = document.createElement("div");
      footer.className = "conn-list-footer";
      list.appendChild(footer);
    }
  }
  if (footer) footer.textContent = "共 " + state.conns.length + " 个任务";
}

function renderDetail() {
  const body = $("conn-detail-body");
  const titleEl = $("conn-detail-title");
  const actionsEl = $("conn-detail-actions");
  const head = document.querySelector(".conn-detail-head");
  if (!body) return;

  function hideHead() {
    if (head) head.style.display = "none";
    if (titleEl) titleEl.textContent = "";
    if (actionsEl) actionsEl.innerHTML = "";
  }

  if (state.editorOpen) {
    hideHead();
    renderEditorForm(body, titleEl, actionsEl);
    return;
  }

  if (!state.selectedId) {
    hideHead();
    body.innerHTML = '<div class="conn-detail-empty"><div class="conn-detail-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><rect x="9" y="1" width="6" height="4" rx="1"/></svg></div><h3>请选择一个任务</h3><p>从左侧任务列表中选择任务查看详情</p></div>';
    return;
  }

  const conn = state.conns.find(c => c.connId === state.selectedId);
  if (!conn) {
    hideHead();
    body.innerHTML = '<div class="conn-detail-empty">未找到该任务</div>';
    return;
  }

  hideHead();

  const statusLabel = STATUS_LABELS[conn.status] || conn.status || "未知";
  const schedSummary = describeSchedule(conn.schedule);
  const modelText = conn.modelId || "跟随默认";
  const nextRun = conn.nextRunAt ? formatTimestamp(conn.nextRunAt) : (conn.status === "completed" ? "已完成" : "待定");
  const lastRun = conn.lastRunAt ? formatTimestamp(conn.lastRunAt) : "无";

  let html = "";

  // ── 1. Header card ──
  html += '<div class="conn-card conn-detail-header">';
  html += '  <div class="conn-detail-header-left">';
  html += '    <div class="conn-detail-task-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div>';
  html += '    <div class="conn-detail-task-info">';
  html += '      <h2 class="conn-detail-task-name">' + escapeHtml(conn.title || conn.connId) + '</h2>';
  html += '      <div class="conn-detail-meta">';
  html += '        <span class="conn-badge conn-badge--' + (conn.status || 'unknown') + '">' + statusLabel + '</span>';
  html += '        <span class="conn-detail-schedule-summary">' + escapeHtml(schedSummary) + '</span>';
  html += '      </div>';
  html += '    </div>';
  html += '  </div>';
  html += '  <div class="conn-detail-header-actions" id="conn-detail-header-actions"></div>';
  html += '</div>';

  // ── 2. Status mini-cards ──
  html += '<div class="conn-status-cards">';
  html += '  <div class="conn-status-mini"><div class="conn-status-mini-icon" style="background:rgba(109,125,255,0.12)"><svg viewBox="0 0 24 24" fill="none" stroke="#6D7DFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg></div><div><div class="conn-status-mini-label">状态</div><div class="conn-status-mini-value"><span class="conn-badge conn-badge--' + (conn.status || 'unknown') + '">' + statusLabel + '</span></div></div></div>';
  html += '  <div class="conn-status-mini"><div class="conn-status-mini-icon" style="background:rgba(139,92,246,0.12)"><svg viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div><div><div class="conn-status-mini-label">下次执行</div><div class="conn-status-mini-value">' + escapeHtml(nextRun) + '</div></div></div>';
  html += '  <div class="conn-status-mini"><div class="conn-status-mini-icon" style="background:rgba(34,197,94,0.12)"><svg viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg></div><div><div class="conn-status-mini-label">上次执行</div><div class="conn-status-mini-value">' + escapeHtml(lastRun) + '</div></div></div>';
  html += '  <div class="conn-status-mini"><div class="conn-status-mini-icon" style="background:rgba(245,158,11,0.12)"><svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg></div><div><div class="conn-status-mini-label">模型</div><div class="conn-status-mini-value">' + escapeHtml(modelText) + '</div></div></div>';
  html += '</div>';

  // ── 3. Config + Prompt side by side ──
  html += '<div class="conn-detail-row">';
  html += '<div class="conn-card conn-detail-row-config">';
  html += '  <div class="conn-card-title"><span class="conn-card-title-icon" style="background:rgba(6,182,212,0.12)"><svg viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg></span>任务配置</div>';
  html += '  <div class="conn-config-grid">';
  html += '    <div class="conn-config-item"><div class="conn-config-label">ID</div><div class="conn-config-value"><code>' + escapeHtml(conn.connId || "") + '</code><button class="conn-copy-btn" data-copy="' + escapeHtml(conn.connId || "") + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>复制</button></div></div>';
  html += '    <div class="conn-config-item"><div class="conn-config-label">Agent</div><div class="conn-config-value">' + escapeHtml(conn.profileId || "main") + '</div></div>';
  html += '    <div class="conn-config-item"><div class="conn-config-label">浏览器</div><div class="conn-config-value">' + escapeHtml(conn.browserId || "跟随 Agent") + '</div></div>';
  html += '    <div class="conn-config-item"><div class="conn-config-label">投递目标</div><div class="conn-config-value">' + escapeHtml(describeTarget(conn.target)) + '</div></div>';
  html += '  </div>';
  html += '</div>';

  // ── 4. Prompt card with copy button ──
  const promptText = (conn.prompt || "").trim();
  if (promptText) {
    html += '<div class="conn-card">';
    html += '  <div class="conn-card-title"><span class="conn-card-title-icon" style="background:rgba(244,114,182,0.12)"><svg viewBox="0 0 24 24" fill="none" stroke="#F472B6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></span>Prompt' + '<button class="conn-copy-btn" data-copy-prompt="1" style="margin-left:auto"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>复制</button></div>';
    html += '  <div class="conn-prompt-block">' + escapeHtml(promptText) + '</div>';
    html += '</div>';
  }
  html += '</div>'; // close conn-detail-row

  // ── 5. Run history card ──
  html += '<div class="conn-card conn-runs-section">';
  html += '  <div class="conn-card-title"><span class="conn-card-title-icon" style="background:rgba(139,92,246,0.12)"><svg viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></span>运行历史</div>';
  html += '  <div id="conn-run-history-list"></div>';
  html += '</div>';

  body.innerHTML = html;

  // Bind copy buttons via data attributes
  body.querySelectorAll("[data-copy]").forEach(btn => {
    btn.addEventListener("click", () => copyToClipboard(btn.getAttribute("data-copy")));
  });
  const promptCopyBtn = body.querySelector("[data-copy-prompt]");
  if (promptCopyBtn) promptCopyBtn.addEventListener("click", () => copyToClipboard(promptText));

  // Render action buttons inside header card
  const headerActions = $("conn-detail-header-actions");
  renderActions(headerActions, conn);

  renderRunHistory(conn);
}

function renderActions(container, conn) {
  if (!container) return;
  container.innerHTML = "";
  const isActing = state.editorSaving || state.actionConnId === conn.connId;
  const hasRunInFlight = hasActiveRunForConn(conn.connId);
  const runLabel = state.actionConnId === conn.connId && state.actionKind === "run" ? "入队中" : hasRunInFlight ? "执行中" : "立即执行";

  const actions = [];
  actions.push({ label: '编辑', icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><path d="M11.5 1.5a2.121 2.121 0 013 3L5 14l-4 1 1-4z"/></svg>', handler: () => openEditor("edit", conn), cls: "conn-btn conn-btn--outline" });

  if (conn.status === "active") {
    actions.push({ label: state.actionConnId === conn.connId && state.actionKind === "pause" ? "暂停中" : "暂停", icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:13px;height:13px"><rect x="4" y="3" width="3" height="10" rx="0.5"/><rect x="9" y="3" width="3" height="10" rx="0.5"/></svg>', handler: () => handlePause(conn.connId), cls: "conn-btn conn-btn--outline" });
  }
  if (conn.status === "paused") {
    actions.push({ label: state.actionConnId === conn.connId && state.actionKind === "resume" ? "恢复中" : "恢复", icon: '<svg viewBox="0 0 16 16" fill="currentColor" style="width:13px;height:13px"><path d="M4 3l9 5-9 5z"/></svg>', handler: () => handleResume(conn.connId), cls: "conn-btn conn-btn--outline" });
  }
  actions.push({ label: runLabel, icon: '<svg viewBox="0 0 16 16" fill="currentColor" style="width:13px;height:13px"><path d="M4 3l9 5-9 5z"/></svg>', handler: () => handleRunNow(conn.connId), cls: "conn-btn conn-btn--primary", disabled: hasRunInFlight });
  actions.push({ label: state.actionConnId === conn.connId && state.actionKind === "delete" ? "删除中" : "删除", icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4m2 0v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4"/></svg>', handler: () => handleDelete(conn.connId), cls: "conn-btn conn-btn--danger" });

  for (const action of actions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = action.icon + " " + action.label;
    btn.disabled = isActing || Boolean(action.disabled);
    btn.className = action.cls;
    btn.addEventListener("click", action.handler);
    container.appendChild(btn);
  }
}

function renderRunHistory(conn) {
  const container = $("conn-run-history-list");
  if (!container) return;

  const historyState = getRunHistoryState(conn.connId);
  if (historyState.status !== "loaded") {
    const latestRun = conn.latestRun || null;
    const latestStatusLabel = latestRun ? (RUN_STATUS_LABELS[latestRun.status] || latestRun.status || "未知") : "";
    const latestTime = latestRun
      ? formatTimestamp(latestRun.startedAt || latestRun.finishedAt || latestRun.updatedAt || latestRun.createdAt)
      : "";
    const latestSummary = latestRun
      ? (latestRun.resultSummary || latestRun.resultText || latestRun.errorText || latestStatusLabel)
      : "完整运行历史尚未加载";
    const buttonText = historyState.status === "loading" ? "加载中" : historyState.status === "error" ? "重试加载" : "加载运行历史";
    const disabled = historyState.status === "loading" ? " disabled" : "";
    const stateClass = " conn-run-lazy--" + historyState.status;

    let html = '<div class="conn-run-lazy' + stateClass + '">';
    html += '<div class="conn-run-lazy-main">';
    html += '<div class="conn-run-lazy-eyebrow">' + (latestRun ? "最近一次" : "运行历史") + '</div>';
    if (latestRun) {
      html += '<div class="conn-run-lazy-title">';
      html += '<span class="conn-badge conn-badge--' + (latestRun.status || 'unknown') + '">' + escapeHtml(latestStatusLabel) + '</span>';
      if (latestTime) html += '<span class="conn-run-lazy-time">' + escapeHtml(latestTime) + '</span>';
      html += '</div>';
    }
    html += '<div class="conn-run-lazy-summary">' + escapeHtml(String(latestSummary || "").substring(0, 180)) + '</div>';
    if (historyState.status === "error" && historyState.error) {
      html += '<div class="conn-run-lazy-error">' + escapeHtml(historyState.error) + '</div>';
    }
    html += '</div>';
    html += '<button class="conn-run-history-load" type="button" data-load-run-history="1"' + disabled + '>' + buttonText + '</button>';
    html += '</div>';
    container.innerHTML = html;

    const loadBtn = container.querySelector("[data-load-run-history]");
    if (loadBtn) {
      loadBtn.addEventListener("click", () => loadRunHistory(conn.connId));
    }
    return;
  }

  const runs = state.runsByConnId[conn.connId] || [];
  if (runs.length === 0) {
    container.innerHTML = '<div class="conn-run-empty"><div class="conn-run-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div><h4>暂无运行历史</h4><p>任务执行后将在这里展示结果和日志</p></div>';
    return;
  }

  const display = runs;
  container.innerHTML = '<div class="conn-run-timeline"></div>';
  const timeline = container.querySelector(".conn-run-timeline");
  if (!timeline) return;

  for (const run of display) {
    const isExpanded = state.expandedRunId === run.runId;
    const runStatusLabel = RUN_STATUS_LABELS[run.status] || run.status || "未知";
    const dotClass = "conn-run-tl-dot--" + (run.status || "unknown");

    const time = run.startedAt ? formatTimestamp(run.startedAt) : "—";
    const summary = run.resultText ? run.resultText.substring(0, 80) : runStatusLabel;
    const duration = run.startedAt && run.finishedAt ? formatDuration(run.startedAt, run.finishedAt) : "";
    const canCancel = isRunInFlight(run);
    const isCancelling = state.cancellingRunId === run.runId;

    const item = document.createElement("div");
    var isUnread = isUnreadResultRun(run);
    item.className = "conn-run-tl-item" + (isUnread ? " is-unread" : "");
    item.innerHTML = '<div class="conn-run-tl-dot ' + dotClass + '"></div><div class="conn-run-tl-card' + (isExpanded ? ' is-expanded' : '') + '"><div class="conn-run-tl-header"><span class="conn-run-tl-time">' + escapeHtml(time) + '</span><span class="conn-badge conn-badge--' + (run.status || 'unknown') + '">' + runStatusLabel + '</span>' + (duration ? '<span class="conn-run-tl-duration">' + escapeHtml(duration) + '</span>' : '') + '<span class="conn-run-tl-summary">' + escapeHtml(summary) + '</span>' + (canCancel ? '<button class="conn-run-cancel-btn" type="button" data-run-cancel="' + escapeHtml(run.runId) + '"' + (isCancelling ? ' disabled' : '') + '>' + (isCancelling ? '终止中' : '终止') + '</button>' : '') + '</div></div>';

    const card = item.querySelector(".conn-run-tl-card");

    if (isExpanded) {
      const detailDiv = document.createElement("div");
      detailDiv.className = "conn-run-tl-detail";
      detailDiv.innerHTML = '<div style="color:var(--muted);font-size:12px">加载中...</div>';
      card.appendChild(detailDiv);

      apiFetchRunDetail(conn.connId, run.runId).then(detail => {
        var r = detail.run || {};
        var f = detail.files || state.runDetailFiles[run.runId] || [];
        state.runDetailFiles[run.runId] = f;
        renderRunDetail(detailDiv, r, f, state.runDetailEvents[run.runId] || []);
      });

        // Mark as read when expanded
        if (isUnread) {
          apiMarkRunRead(conn.connId, run.runId).then(function(result) {
            state.totalUnreadRuns = result.totalUnreadRuns || 0;
            var runs = state.runsByConnId[conn.connId] || [];
            var idx = runs.findIndex(function(r) { return r.runId === run.runId; });
            if (idx >= 0) runs[idx].readAt = new Date().toISOString();
            var count = state.unreadCountsByConnId[conn.connId] || 0;
            if (count > 0) state.unreadCountsByConnId[conn.connId] = count - 1;
            renderStats();
            renderList();
          }).catch(function() {});
        }
    }

    card.querySelector(".conn-run-tl-header").addEventListener("click", () => {
      state.expandedRunId = state.expandedRunId === run.runId ? null : run.runId;
      renderRunHistory(conn);
    });

    const cancelBtn = card.querySelector("[data-run-cancel]");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        handleCancelRun(conn.connId, run.runId);
      });
    }

    timeline.appendChild(item);
  }

  const page = getRunHistoryPage(conn.connId);
  if (page.hasMore) {
    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "conn-run-load-more conn-run-history-more";
    moreBtn.dataset.loadMoreRuns = "1";
    moreBtn.textContent = state.loadingMoreRunsConnId === conn.connId ? "加载中" : "加载更多";
    moreBtn.disabled = state.loadingMoreRunsConnId === conn.connId;
    moreBtn.addEventListener("click", () => loadMoreRunHistory(conn.connId));
    container.appendChild(moreBtn);
  }
}

function renderRunDetail(container, run, files, events) {
  container.innerHTML = "";

  // Run ID (click to copy)
  var idRow = document.createElement("div");
  idRow.className = "conn-run-id-row";
  var idLabel = document.createElement("span");
  idLabel.className = "conn-run-id-label";
  idLabel.textContent = run.runId;
  idLabel.title = "点击复制 Run ID";
  idLabel.addEventListener("click", function(e) {
    e.stopPropagation();
    e.preventDefault();
    copyToClipboard(run.runId).then(function(copied) {
      if (!copied) return;
      idLabel.textContent = "已复制";
      idLabel.classList.add("is-copied");
      setTimeout(function() {
        idLabel.textContent = run.runId;
        idLabel.classList.remove("is-copied");
      }, 1200);
    });
  });
  idRow.appendChild(idLabel);
  container.appendChild(idRow);

  // Lifecycle timeline
  const lifecycle = document.createElement("div");
  lifecycle.className = "conn-run-lifecycle";
  const steps = [
    { label: "计划", value: run.scheduledAt, done: true },
    { label: "认领", value: run.claimedAt, done: !!run.claimedAt },
    { label: "开始", value: run.startedAt, done: !!run.startedAt },
    { label: "完成", value: run.finishedAt, done: !!run.finishedAt },
  ];
  for (const step of steps) {
    const el = document.createElement("span");
    el.className = "conn-run-lifecycle-step" + (step.done ? " is-done" : "") + (step.value && !steps[steps.indexOf(step) + 1]?.done ? " is-current" : "");
    el.textContent = step.label;
    lifecycle.appendChild(el);
    if (steps.indexOf(step) < steps.length - 1) {
      const arrow = document.createElement("span");
      arrow.className = "conn-run-lifecycle-arrow";
      arrow.textContent = "→";
      lifecycle.appendChild(arrow);
    }
  }
  container.appendChild(lifecycle);

  // Health label
  const health = resolveRunHealth(run, events);
  if (health) {
    const healthEl = document.createElement("div");
    healthEl.className = "conn-run-health";
    healthEl.textContent = health;
    container.appendChild(healthEl);
  }

  // Result text
  const resultText = run.errorText || run.resultText || run.resultSummary;
  if (resultText) {
    const result = document.createElement("div");
    result.className = "conn-run-result";
    result.innerHTML = typeof renderMessageMarkdown === "function" ? renderMessageMarkdown(resultText) : escapeHtml(resultText);
    container.appendChild(result);
  }

  // Output files
  if (files && files.length > 0) {
    const fileList = document.createElement("div");
    fileList.className = "conn-run-files";
    const heading = document.createElement("span");
    heading.className = "conn-run-files-heading";
    heading.textContent = "输出文件";
    fileList.appendChild(heading);
    for (const file of files) {
      const link = document.createElement("a");
      link.className = "conn-run-file-link";
      link.href = file.url || "#";
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = file.fileName || file.relativePath || "file";
      fileList.appendChild(link);
      if (file.latestUrl) {
        const latest = document.createElement("a");
        latest.className = "conn-run-file-link conn-run-file-link-secondary";
        latest.href = file.latestUrl;
        latest.target = "_blank";
        latest.rel = "noreferrer";
        latest.textContent = "最新入口";
        fileList.appendChild(latest);
      }
    }
    container.appendChild(fileList);
  }

  // Artifact links (for succeeded runs)
  if (run.status === "succeeded" && run.connId && run.runId) {
    const artifactSection = document.createElement("div");
    artifactSection.className = "conn-run-files";
    const artHeading = document.createElement("span");
    artHeading.className = "conn-run-files-heading";
    artHeading.textContent = "产物";
    artifactSection.appendChild(artHeading);

    const openLink = document.createElement("a");
    openLink.className = "conn-run-file-link";
    openLink.href = "/v1/conns/" + encodeURIComponent(run.connId) + "/runs/" + encodeURIComponent(run.runId) + "/artifacts";
    openLink.target = "_blank";
    openLink.rel = "noreferrer";
    openLink.textContent = "打开产物目录";
    artifactSection.appendChild(openLink);

    const latestLink = document.createElement("a");
    latestLink.className = "conn-run-file-link conn-run-file-link-secondary";
    latestLink.href = "/v1/conns/" + encodeURIComponent(run.connId) + "/artifacts/latest";
    latestLink.target = "_blank";
    latestLink.rel = "noreferrer";
    latestLink.textContent = "最新产物入口";
    artifactSection.appendChild(latestLink);

    const healthLink = document.createElement("a");
    healthLink.className = "conn-run-file-link conn-run-file-link-secondary";
    healthLink.href = "/v1/conns/" + encodeURIComponent(run.connId) + "/runs/" + encodeURIComponent(run.runId) + "/artifacts/health";
    healthLink.target = "_blank";
    healthLink.rel = "noreferrer";
    healthLink.textContent = "健康检查";
    artifactSection.appendChild(healthLink);

    container.appendChild(artifactSection);
  }

  // Events
  if (events && events.length > 0) {
    const eventSection = document.createElement("div");
    eventSection.className = "conn-run-events";
    const evHeading = document.createElement("span");
    evHeading.className = "conn-run-events-heading";
    evHeading.textContent = "事件记录";
    eventSection.appendChild(evHeading);

    for (const event of events) {
      const ev = document.createElement("div");
      ev.className = "conn-run-event";
      const evTitle = document.createElement("code");
      evTitle.textContent = "#" + event.seq + " " + event.eventType;
      const evTime = document.createElement("span");
      evTime.className = "conn-run-event-time";
      evTime.textContent = event.createdAt ? formatTimestamp(event.createdAt) : "";
      const evBody = document.createElement("span");
      evBody.className = "conn-run-event-body";
      evBody.textContent = JSON.stringify(event.event || {}).slice(0, 300);
      ev.appendChild(evTitle);
      ev.appendChild(evTime);
      ev.appendChild(evBody);
      eventSection.appendChild(ev);
    }

    const hasMore = state.runDetailEventsHasMore[run.runId];
    if (hasMore) {
      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "conn-run-load-more";
      moreBtn.textContent = state.loadingMoreRunId === run.runId ? "加载中" : "加载更多事件";
      moreBtn.disabled = state.loadingMoreRunId === run.runId;
      moreBtn.addEventListener("click", () => handleLoadMoreEvents(run.connId, run.runId));
      eventSection.appendChild(moreBtn);
    }

    container.appendChild(eventSection);
  }
}

function resolveRunHealth(run, events) {
  if (!run || typeof run !== "object") return "";
  if (run.status === "failed") {
    const hasTimeout = Array.isArray(events) && events.some(e => e.eventType === "run_timed_out");
    if (hasTimeout || /exceeded maxRunMs/i.test(run.errorText || "")) return "超时失败";
    return "";
  }
  if (run.status !== "running") return "";
  if (!run.leaseUntil) return "租约未知";
  const until = new Date(run.leaseUntil).getTime();
  if (isNaN(until)) return "租约未知";
  return until <= Date.now() ? "疑似僵死" : "租约活跃";
}

// ── Editor ─────────────────────────────────────────────────────────────────

function getEditorSupportCatalogStatusText() {
  if (state.editorSupportCatalogsLoading) return "正在加载运行配置，请稍后保存";
  if (state.editorSupportCatalogsError) return state.editorSupportCatalogsError;
  if (!state.editorSupportCatalogsLoaded) return "运行配置尚未加载，请稍后保存";
  if (!state.modelConfig?.providers?.length) return "模型配置不可用，请稍后重试";
  return "";
}

function areEditorSupportCatalogsReady() {
  return Boolean(
    state.editorSupportCatalogsLoaded &&
    !state.editorSupportCatalogsLoading &&
    !state.editorSupportCatalogsError &&
    state.modelConfig?.providers?.length
  );
}

function isEditorSubmitDisabled() {
  return Boolean(state.editorSaving || !areEditorSupportCatalogsReady());
}

function syncEditorSupportControls() {
  const disabled = isEditorSubmitDisabled();
  for (const id of ["editor-profile-id", "editor-browser-id", "editor-model-provider", "editor-model-id"]) {
    const el = $(id);
    if (el) el.disabled = disabled;
  }

  for (const id of ["editor-form-submit"]) {
    const el = $(id);
    if (el) el.disabled = disabled;
  }

  document.querySelectorAll("[data-editor-action='submit']").forEach(btn => {
    btn.disabled = disabled;
  });

  const statusEl = $("editor-support-status");
  if (statusEl) {
    const text = getEditorSupportCatalogStatusText();
    statusEl.textContent = text;
    statusEl.hidden = !text;
  }
}

function renderEditorSupportCatalogOptions() {
  renderEditorAgentOptions();
  renderEditorBrowserOptions();
  renderEditorModelOptions();
}

function setPendingSelectValue(el, value) {
  if (!el) return;
  const normalized = String(value || "");
  if (normalized) el.dataset.pendingValue = normalized;
  else delete el.dataset.pendingValue;
  el.value = normalized;
}

function guardEditorSupportCatalogs() {
  const statusText = getEditorSupportCatalogStatusText();
  if (statusText) {
    showEditorError(statusText);
    return false;
  }

  const profileId = (($("editor-profile-id") || {}).value || "").trim();
  if (profileId && !state.agentCatalog.some(agent => (agent.agentId || "main") === profileId)) {
    showEditorError("执行 Agent 不可用，请重新选择", "editor-profile-id");
    return false;
  }

  const browserId = (($("editor-browser-id") || {}).value || "").trim();
  if (browserId && !state.browserCatalog.some(browser => browser.browserId === browserId)) {
    showEditorError("浏览器不可用，请重新选择", "editor-browser-id");
    return false;
  }

  const modelProvider = (($("editor-model-provider") || {}).value || "").trim();
  const modelId = (($("editor-model-id") || {}).value || "").trim();
  const provider = state.modelConfig?.providers?.find(item => item.id === modelProvider);
  if (!provider) {
    showEditorError("模型源不可用，请重新选择", "editor-model-provider");
    return false;
  }
  if (!modelId || !provider.models?.some(model => model.id === modelId)) {
    showEditorError("模型不可用，请重新选择", "editor-model-id");
    return false;
  }

  return true;
}

async function loadEditorSupportCatalogs() {
  if (state.editorSupportCatalogsLoaded) {
    syncEditorSupportControls();
    return;
  }
  if (state.editorSupportCatalogsPromise) {
    return state.editorSupportCatalogsPromise;
  }

  state.editorSupportCatalogsLoading = true;
  state.editorSupportCatalogsError = "";
  syncEditorSupportControls();

  state.editorSupportCatalogsPromise = Promise.all([
    apiFetchAgentCatalog(),
    apiFetchBrowserCatalog(),
    apiFetchModelConfig(),
  ]).then(([agents, browsers, modelConfig]) => {
    if (!modelConfig?.providers?.length) {
      throw new Error("模型配置不可用，请稍后重试");
    }
    state.agentCatalog = agents;
    state.browserCatalog = browsers;
    state.modelConfig = modelConfig;
    state.modelProviders = modelConfig.providers || [];
    state.editorSupportCatalogsLoaded = true;
  }).catch(err => {
    state.editorSupportCatalogsLoaded = false;
    state.editorSupportCatalogsError = err instanceof Error ? err.message : "运行配置加载失败，请稍后重试";
  }).finally(() => {
    state.editorSupportCatalogsLoading = false;
    state.editorSupportCatalogsPromise = null;
    if (state.editorOpen) {
      renderEditorSupportCatalogOptions();
      syncEditorSupportControls();
    }
  });

  return state.editorSupportCatalogsPromise;
}

function openEditor(mode, conn) {
  state.editorOpen = true;
  state.editorMode = mode || "create";
  state.editorConnId = conn ? conn.connId : null;
  state.editorSaving = false;
  state.editorError = "";
  if (mode === "create") state.selectedId = null;
  renderList();
  renderDetail();
  void loadEditorSupportCatalogs();
}

function closeEditor() {
  state.editorOpen = false;
  state.editorMode = null;
  state.editorConnId = null;
  state.editorSaving = false;
  state.editorError = "";
  renderList();
  renderDetail();
}

function fillEditorForm(conn) {
  const titleInput = $("editor-title-input");
  const promptEl = $("editor-prompt");
  const schedKind = $("editor-schedule-kind");
  const onceAt = $("editor-once-at");
  const intervalStart = $("editor-interval-start");
  const intervalMins = $("editor-interval-minutes");
  const targetType = $("editor-target-type");
  const targetId = $("editor-target-id");
  const profileId = $("editor-profile-id");
  const browserId = $("editor-browser-id");
  const modelProvider = $("editor-model-provider");
  const modelId = $("editor-model-id");
  const maxRunSec = $("editor-max-run-seconds");
  const upgradePolicy = $("editor-upgrade-policy");
  const agentSpecId = $("editor-agent-spec-id");
  const skillSetId = $("editor-skill-set-id");

  if (titleInput) titleInput.value = conn.title || "";
  if (promptEl) promptEl.value = conn.prompt || "";

  const sched = conn.schedule || {};
  if (schedKind) {
    if (sched.kind === "interval") schedKind.value = "interval";
    else if (sched.kind === "cron") schedKind.value = "daily";
    else schedKind.value = "once";
  }

  if (sched.kind === "once" && onceAt) onceAt.value = sched.at ? formatDateTimeLocal(sched.at) : "";
  if (sched.kind === "interval") {
    if (intervalStart) intervalStart.value = sched.startAt ? formatDateTimeLocal(sched.startAt) : "";
    if (intervalMins) intervalMins.value = sched.everyMs ? Math.round(sched.everyMs / 60000) : 60;
  }
  if (sched.kind === "cron" && onceAt) onceAt.value = formatDailyScheduleEditorValue(sched, conn.nextRunAt);

  const tgt = conn.target || {};
  if (targetType) {
    if (tgt.type === "feishu_chat") targetType.value = "feishu_chat";
    else if (tgt.type === "feishu_user") targetType.value = "feishu_user";
    else targetType.value = "task_inbox";
  }
  if (targetId) {
    targetId.value = tgt.chatId || tgt.openId || "";
  }

  setPendingSelectValue(profileId, conn.profileId || "main");
  setPendingSelectValue(browserId, conn.browserId || "");
  setPendingSelectValue(modelProvider, conn.modelProvider || "");
  setPendingSelectValue(modelId, conn.modelId || "");
  if (maxRunSec) maxRunSec.value = conn.maxRunMs ? Math.round(conn.maxRunMs / 1000) : "";
  if (upgradePolicy) upgradePolicy.value = conn.upgradePolicy || "latest";
  if (agentSpecId) agentSpecId.value = conn.agentSpecId || "";
  if (skillSetId) skillSetId.value = conn.skillSetId || "";

  // Artifact delivery
  const ad = conn.artifactDelivery || {};
  const artifactCb = $("editor-artifact-enabled");
  const artifactKind = $("editor-artifact-kind");
  const artifactRepair = $("editor-artifact-repair");
  const artifactOpts = $("editor-artifact-options");
  if (artifactCb) artifactCb.checked = !!ad.enabled;
  if (artifactKind) artifactKind.value = ad.expectedKind || "auto";
  if (artifactRepair) artifactRepair.value = String(ad.repairMaxAttempts ?? 2);
  if (artifactOpts) artifactOpts.style.display = ad.enabled ? "" : "none";
}

function clearEditorForm() {
  const ids = [
    "editor-title-input", "editor-prompt", "editor-once-at",
    "editor-interval-start", "editor-target-id",
    "editor-max-run-seconds", "editor-agent-spec-id", "editor-skill-set-id",
  ];
  for (const id of ids) {
    const el = $(id);
    if (el) el.value = "";
  }
  const intervalMins = $("editor-interval-minutes");
  if (intervalMins) intervalMins.value = "60";
  const schedKind = $("editor-schedule-kind");
  if (schedKind) schedKind.value = "once";
  const targetType = $("editor-target-type");
  if (targetType) targetType.value = "task_inbox";
  const profileId = $("editor-profile-id");
  setPendingSelectValue(profileId, "main");
  const browserId = $("editor-browser-id");
  setPendingSelectValue(browserId, "");
  const upgradePolicy = $("editor-upgrade-policy");
  if (upgradePolicy) upgradePolicy.value = "latest";
  const modelProvider = $("editor-model-provider");
  const modelId = $("editor-model-id");
  setPendingSelectValue(modelProvider, state.modelConfig?.providers?.[0]?.id || "");
  setPendingSelectValue(modelId, state.modelConfig?.providers?.[0]?.models?.[0]?.id || "");
  const defaultRunAt = formatDateTimeLocal(getDefaultEditorRunDate());
  const onceAt = $("editor-once-at");
  if (onceAt) onceAt.value = defaultRunAt;
  const intervalStart = $("editor-interval-start");
  if (intervalStart) intervalStart.value = defaultRunAt;

  // Artifact delivery reset
  const artifactCb = $("editor-artifact-enabled");
  if (artifactCb) artifactCb.checked = false;
  const artifactKind = $("editor-artifact-kind");
  if (artifactKind) artifactKind.value = "auto";
  const artifactRepair = $("editor-artifact-repair");
  if (artifactRepair) artifactRepair.value = "2";
  const artifactOpts = $("editor-artifact-options");
  if (artifactOpts) artifactOpts.style.display = "none";
}

function showEditorError(message, focusId) {
  state.editorError = message;
  const errorEl = $("editor-error");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    errorEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  const focusEl = focusId ? $(focusId) : null;
  if (focusEl && typeof focusEl.focus === "function") {
    setTimeout(() => focusEl.focus(), 0);
  }
}

function clearEditorError() {
  state.editorError = "";
  const errorEl = $("editor-error");
  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = "";
  }
}

function readEditorPayload() {
  const title = (($("editor-title-input") || {}).value || "").trim();
  const prompt = (($("editor-prompt") || {}).value || "").trim();

  if (!title) { showEditorError("请填写标题", "editor-title-input"); return null; }
  if (!prompt) { showEditorError("请填写 Prompt", "editor-prompt"); return null; }
  if (!guardEditorSupportCatalogs()) return null;

  const payload = { title, prompt };

  // Schedule
  const schedKind = (($("editor-schedule-kind") || {}).value || "once");
  if (schedKind === "once") {
    const at = parseDateTimeLocal(($("editor-once-at") || {}).value);
    if (!at) { showEditorError("请填写执行时间", "editor-once-at"); return null; }
    payload.schedule = { kind: "once", at };
  } else if (schedKind === "interval") {
    const mins = parseInt(($("editor-interval-minutes") || {}).value, 10);
    const startAt = parseDateTimeLocal(($("editor-interval-start") || {}).value);
    if (!mins || mins < 1) { showEditorError("间隔分钟必须大于 0", "editor-interval-minutes"); return null; }
    if (!startAt) { showEditorError("请填写首次执行时间", "editor-interval-start"); return null; }
    payload.schedule = { kind: "interval", everyMs: mins * 60 * 1000, startAt };
  } else if (schedKind === "daily") {
    const timeInput = $("editor-time-of-day") || $("editor-once-at");
    const timeVal = (timeInput || {}).value || "";
    const expr = parseDailyTimeToCronExpression(timeVal);
    if (!expr) { showEditorError("请填写每日执行时间", "editor-once-at"); return null; }
    payload.schedule = { kind: "cron", expression: expr };
  }

  // Target
  const targetType = (($("editor-target-type") || {}).value || "task_inbox");
  if (targetType === "task_inbox") {
    payload.target = { type: "task_inbox" };
  } else if (targetType === "feishu_chat") {
    const chatId = (($("editor-target-id") || {}).value || "").trim();
    if (!chatId) { showEditorError("请填写飞书群 ID", "editor-target-id"); return null; }
    payload.target = { type: "feishu_chat", chatId };
  } else if (targetType === "feishu_user") {
    const openId = (($("editor-target-id") || {}).value || "").trim();
    if (!openId) { showEditorError("请填写飞书用户 ID", "editor-target-id"); return null; }
    payload.target = { type: "feishu_user", openId };
  }

  // Optional fields
  const profileId = (($("editor-profile-id") || {}).value || "").trim();
  if (profileId) payload.profileId = profileId;

  const browserId = (($("editor-browser-id") || {}).value || "").trim();
  if (browserId || state.editorMode === "edit") payload.browserId = browserId || null;

  const modelProvider = (($("editor-model-provider") || {}).value || "").trim();
  const modelId = (($("editor-model-id") || {}).value || "").trim();
  if (modelProvider) payload.modelProvider = modelProvider;
  if (modelId) payload.modelId = modelId;

  const maxRunSec = (($("editor-max-run-seconds") || {}).value || "").trim();
  if (maxRunSec) {
    const sec = parseInt(maxRunSec, 10);
    if (sec > 0) payload.maxRunMs = sec * 1000;
  }

  const upgradePolicy = (($("editor-upgrade-policy") || {}).value || "").trim();
  if (upgradePolicy) payload.upgradePolicy = upgradePolicy;

  const agentSpecId = (($("editor-agent-spec-id") || {}).value || "").trim();
  if (agentSpecId) payload.agentSpecId = agentSpecId;

  const skillSetId = (($("editor-skill-set-id") || {}).value || "").trim();
  if (skillSetId) payload.skillSetId = skillSetId;

  const assetRefs = state.editorSelectedAssets || [];
  if (assetRefs.length > 0) payload.assetRefs = assetRefs;

  // Artifact delivery
  const artifactEnabled = $("editor-artifact-enabled");
  if (artifactEnabled && artifactEnabled.checked) {
    const artifactKind = (($("editor-artifact-kind") || {}).value || "auto");
    const artifactRepair = parseInt(($("editor-artifact-repair") || {}).value, 10);
    payload.artifactDelivery = {
      enabled: true,
      expectedKind: artifactKind,
      repairMaxAttempts: isNaN(artifactRepair) ? 2 : artifactRepair,
    };
  } else if (state.editorMode === "edit") {
    payload.artifactDelivery = { enabled: false };
  }

  clearEditorError();
  return payload;
}

async function submitEditor() {
  const payload = readEditorPayload();
  if (!payload) return;

  const isEditing = state.editorMode === "edit" && state.editorConnId;

  // Check if browser/profile binding changed
  let extraHeaders = {};
  if (isEditing) {
    const orig = state.conns.find(c => c.connId === state.editorConnId);
    if (orig) {
      const profileChanged = (orig.profileId || "main") !== (payload.profileId || "main");
      const browserChanged = (orig.browserId || "") !== (payload.browserId || "");
      if (profileChanged || browserChanged) {
        const confirmed = await openConfirmDialog({
          title: "确认执行绑定变更",
          description: "即将更改 Agent 或浏览器绑定，后续运行将使用新的执行环境。",
          confirmText: "确认变更",
          cancelText: "取消",
          tone: "danger",
        });
        if (!confirmed) return;
        extraHeaders = {
          "x-ugk-browser-binding-confirmed": "true",
          "x-ugk-browser-binding-source": "playground",
        };
      }
    }
  }

  state.editorSaving = true;
  renderList();
  renderDetail();

  try {
    if (isEditing) {
      await apiUpdateConn(state.editorConnId, payload, extraHeaders);
      showToast("任务已更新", "success");
    } else {
      await apiCreateConn(payload);
      showToast("任务已创建", "success");
    }
    closeEditor();
    await loadData();
  } catch (err) {
    showEditorError(err instanceof Error ? err.message : "保存失败");
  } finally {
    state.editorSaving = false;
    renderList();
    renderDetail();
  }
}

function renderEditorForm(body, titleEl, actionsEl) {
  if (titleEl) titleEl.textContent = "";
  if (actionsEl) actionsEl.innerHTML = "";

  const isEdit = state.editorMode === "edit";
  const pageTitle = isEdit ? "编辑任务" : "新建任务";
  const pageSub = isEdit ? "修改任务配置与执行方式" : "配置任务信息与执行方式";

  body.innerHTML = \`
    <div class="conn-editor-root">
      <div id="editor-error" class="conn-editor-error" role="alert" \${state.editorError ? "" : "hidden"}>\${escapeHtml(state.editorError)}</div>
      <div id="editor-support-status" class="conn-editor-hint" role="status" \${getEditorSupportCatalogStatusText() ? "" : "hidden"}>\${escapeHtml(getEditorSupportCatalogStatusText())}</div>

      <!-- Header -->
      <div class="conn-editor-header">
        <div class="conn-editor-header-icon" style="background:rgba(109,125,255,0.14)">
          <svg viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </div>
        <div class="conn-editor-header-text">
          <div class="conn-editor-header-title">\${pageTitle}</div>
          <div class="conn-editor-header-sub">\${pageSub}</div>
        </div>
      </div>

      <!-- Row 1: Basic Info + Schedule side by side -->
      <div class="conn-editor-form-grid">
        <!-- Basic Info -->
        <div class="conn-editor-section-card">
          <div class="conn-editor-section-head">
            <div class="conn-editor-section-icon" style="background:rgba(244,114,182,0.12)">
              <svg viewBox="0 0 24 24" fill="none" stroke="#F472B6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </div>
            <div class="conn-editor-section-title">基本信息</div>
          </div>
          <div class="conn-editor-section-body">
            <label class="conn-editor-field">
              <span>标题 <span class="required">*</span></span>
              <input id="editor-title-input" autocomplete="off" required placeholder="请输入任务标题" />
            </label>
            <label class="conn-editor-field">
              <span>PROMPT <span class="required">*</span></span>
              <textarea id="editor-prompt" rows="6" required placeholder="请输入 Prompt 内容，支持多行输入..."></textarea>
              <span class="field-helper">支持 Markdown 与代码语法</span>
            </label>
          </div>
        </div>

        <!-- Schedule + Target -->
        <div class="conn-editor-section-card">
          <div class="conn-editor-section-head">
            <div class="conn-editor-section-icon" style="background:rgba(139,92,246,0.12)">
              <svg viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            </div>
            <div class="conn-editor-section-title">执行与调度</div>
          </div>
          <div class="conn-editor-section-body">
            <div class="conn-editor-form-grid">
              <label class="conn-editor-field">
                <span>执行方式 <span class="required">*</span></span>
                <select id="editor-schedule-kind">
                  <option value="once">定时执行</option>
                  <option value="interval">间隔执行</option>
                  <option value="daily">每日执行</option>
                </select>
              </label>
              <label class="conn-editor-field">
                <span>执行时间 <span class="required">*</span></span>
                <input id="editor-once-at" type="datetime-local" autocomplete="off" placeholder="yyyy/mm/dd --:--" />
              </label>
            </div>
            <div id="editor-schedule-interval" class="conn-editor-schedule-block" hidden>
              <div class="conn-editor-form-grid">
                <label class="conn-editor-field">
                  <span>首次执行时间</span>
                  <input id="editor-interval-start" type="datetime-local" autocomplete="off" />
                </label>
                <label class="conn-editor-field">
                  <span>间隔（分钟）</span>
                  <input id="editor-interval-minutes" type="number" min="1" step="1" value="60" />
                </label>
              </div>
            </div>
            <label class="conn-editor-field">
              <span>目标类型</span>
              <select id="editor-target-type">
                <option value="task_inbox">任务消息</option>
                <option value="feishu_chat">飞书群</option>
                <option value="feishu_user">飞书用户</option>
              </select>
            </label>
            <div id="editor-target-id-row" class="conn-editor-target-block" hidden>
              <label class="conn-editor-field">
                <span>目标 ID</span>
                <input id="editor-target-id" autocomplete="off" placeholder="chat_id 或 open_id" />
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Row 2: Runtime Config (full width) -->
      <div class="conn-editor-section-card">
        <div class="conn-editor-section-head">
          <div class="conn-editor-section-icon" style="background:rgba(6,182,212,0.12)">
              <svg viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          </div>
          <div class="conn-editor-section-title">运行配置</div>
        </div>
        <div class="conn-editor-section-body">
          <div class="conn-editor-form-grid">
            <label class="conn-editor-field">
              <span>AGENT <span class="required">*</span></span>
              <select id="editor-profile-id"></select>
            </label>
            <label class="conn-editor-field">
              <span>浏览器</span>
              <select id="editor-browser-id"></select>
            </label>
            <label class="conn-editor-field">
              <span>模型源</span>
              <select id="editor-model-provider"></select>
            </label>
            <label class="conn-editor-field">
              <span>模型</span>
              <select id="editor-model-id"></select>
            </label>
          </div>
          <span id="editor-model-auth" class="conn-editor-hint"></span>
        </div>
      </div>

      <!-- Row 3: Advanced Settings (full width) -->
      <div class="conn-editor-section-card">
        <div class="conn-editor-section-head">
          <div class="conn-editor-section-icon" style="background:rgba(245,158,11,0.12)">
              <svg viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          </div>
          <div class="conn-editor-section-title">高级设置</div>
        </div>
        <div class="conn-editor-section-body">
          <div id="editor-model-auth-row" class="conn-editor-key-status">
            <span>密钥已配置</span>
            <span class="key-badge" id="editor-key-name">—</span>
          </div>
          <div class="conn-editor-form-grid">
            <label class="conn-editor-field">
              <span>最长等待（秒）</span>
              <input id="editor-max-run-seconds" type="number" min="1" step="1" placeholder="0 = 不限" />
            </label>
            <label class="conn-editor-field">
              <span>版本策略</span>
              <select id="editor-upgrade-policy">
                <option value="latest">跟随默认</option>
                <option value="pinned">固定当前</option>
                <option value="manual">手动控制</option>
              </select>
            </label>
            <label class="conn-editor-field">
              <span>执行模板</span>
              <input id="editor-agent-spec-id" autocomplete="off" placeholder="可选" />
            </label>
            <label class="conn-editor-field">
              <span>能力包</span>
              <input id="editor-skill-set-id" autocomplete="off" placeholder="可选" />
            </label>
          </div>
        </div>
      </div>

            <div class="conn-editor-section-card">
        <div class="conn-editor-section-head">
          <div class="conn-editor-section-icon" style="background:rgba(34,197,94,0.12)">
            <svg viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </div>
          <div class="conn-editor-section-title">产物交付保障</div>
        </div>
        <div class="conn-editor-section-body">
          <label class="conn-editor-toggle">
            <input id="editor-artifact-enabled" type="checkbox" />
            <span>启用产物交付保障</span>
          </label>
          <div id="editor-artifact-options" class="conn-editor-form-grid" style="display:none;margin-top:12px">
            <label class="conn-editor-field">
              <span>期望产物类型</span>
              <select id="editor-artifact-kind">
                <option value="auto">自动判断</option>
                <option value="file">普通文件</option>
                <option value="web">网页</option>
                <option value="xlsx">Excel</option>
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
                <option value="markdown">Markdown</option>
              </select>
            </label>
            <label class="conn-editor-field">
              <span>自动修复次数</span>
              <select id="editor-artifact-repair">
                <option value="0">0 次，只检查</option>
                <option value="1">1 次</option>
                <option value="2" selected>2 次</option>
                <option value="3">3 次</option>
              </select>
            </label>
          </div>
          <div class="conn-editor-hint">开启后会在任务结束后检查产物目录，失败时自动让 Agent 修复</div>
        </div>
      </div>

<div id="editor-asset-chips" class="conn-editor-asset-chips"></div>
      <textarea id="editor-asset-refs" hidden></textarea>

      <div class="conn-editor-form-actions">
        <button id="editor-form-submit" class="conn-btn conn-btn--primary" type="button" \${isEditorSubmitDisabled() ? "disabled" : ""}>\${state.editorSaving ? "保存中" : (isEdit ? "保存修改" : "保存任务")}</button>
        <button id="editor-form-cancel" class="conn-btn conn-btn--outline" type="button" \${state.editorSaving ? "disabled" : ""}>取消</button>
      </div>

    </div>
  \`;

  // Fill form if editing
  if (isEdit && state.editorConnId) {
    const conn = state.conns.find(c => c.connId === state.editorConnId);
    if (conn) fillEditorForm(conn);
  } else {
    clearEditorForm();
  }

  renderEditorAgentOptions();
  renderEditorBrowserOptions();
  renderEditorModelOptions();
  syncEditorSupportControls();
  syncScheduleVisibility();
  syncTargetVisibility();
  initializeFlatpickr();

  // Bind events
  const schedKindEl = $("editor-schedule-kind");
  if (schedKindEl) schedKindEl.addEventListener("change", syncScheduleVisibility);
  const targetEl = $("editor-target-type");
  if (targetEl) targetEl.addEventListener("change", syncTargetVisibility);
  const modelProvEl = $("editor-model-provider");
  if (modelProvEl) modelProvEl.addEventListener("change", () => { renderEditorModelOptions(); });
  const submitBtn = $("editor-submit");
  if (submitBtn) submitBtn.addEventListener("click", () => { submitEditor(); });
  const cancelBtn = $("editor-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", closeEditor);
  const formSubmitBtn = $("editor-form-submit");
  if (formSubmitBtn) formSubmitBtn.addEventListener("click", () => { submitEditor(); });
  const formCancelBtn = $("editor-form-cancel");
  if (formCancelBtn) formCancelBtn.addEventListener("click", closeEditor);

  // Artifact delivery toggle
  const artifactCb = $("editor-artifact-enabled");
  if (artifactCb) artifactCb.addEventListener("change", function() {
    const opts = $("editor-artifact-options");
    if (opts) opts.style.display = artifactCb.checked ? "" : "none";
  });
}


function renderEditorAgentOptions() {
  const sel = $("editor-profile-id");
  if (!sel) return;
  const current = sel.dataset.pendingValue || sel.value || "main";
  sel.innerHTML = "";
  const agents = state.agentCatalog.length > 0 ? state.agentCatalog : [{ agentId: "main", name: "主 Agent" }];
  for (const a of agents) {
    const opt = document.createElement("option");
    opt.value = a.agentId || "main";
    opt.textContent = a.name || a.agentId || "main";
    sel.appendChild(opt);
  }
  if (!agents.some(a => (a.agentId || "main") === current)) {
    const opt = document.createElement("option");
    opt.value = current;
    opt.textContent = current + "（不可用）";
    sel.appendChild(opt);
  }
  sel.value = current;
  delete sel.dataset.pendingValue;
}

function renderEditorBrowserOptions() {
  const sel = $("editor-browser-id");
  if (!sel) return;
  const current = sel.dataset.pendingValue || sel.value || "";
  sel.innerHTML = "";
  const followOpt = document.createElement("option");
  followOpt.value = "";
  followOpt.textContent = "跟随执行 Agent";
  sel.appendChild(followOpt);
  const browsers = state.browserCatalog.length > 0 ? state.browserCatalog : [];
  for (const b of browsers) {
    const opt = document.createElement("option");
    opt.value = b.browserId || "";
    opt.textContent = (b.name || b.browserId || "") + " · " + (b.browserId || "");
    sel.appendChild(opt);
  }
  if (current && !browsers.some(b => b.browserId === current)) {
    const opt = document.createElement("option");
    opt.value = current;
    opt.textContent = current + "（未找到）";
    sel.appendChild(opt);
  }
  sel.value = current;
  delete sel.dataset.pendingValue;
}

function renderEditorModelOptions() {
  const provSel = $("editor-model-provider");
  const modelSel = $("editor-model-id");
  const authHint = $("editor-model-auth");
  if (!provSel || !modelSel) return;

  const providers = state.modelConfig?.providers || [];
  const pendingProvider = provSel.dataset.pendingValue || provSel.value || state.modelConfig?.current?.provider || "";
  const pendingModel = modelSel.dataset.pendingValue || modelSel.value || state.modelConfig?.current?.model || "";

  provSel.innerHTML = "";
  if (providers.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "暂无可用模型源";
    provSel.appendChild(opt);
    provSel.disabled = true;
    modelSel.innerHTML = "";
    modelSel.disabled = true;
    if (authHint) authHint.textContent = "模型源不可用";
    return;
  }

  provSel.disabled = false;
  for (const p of providers) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name || p.id;
    provSel.appendChild(opt);
  }
  if (providers.some(p => p.id === pendingProvider)) provSel.value = pendingProvider;
  if (!provSel.value && providers[0]) provSel.value = providers[0].id;

  const provider = providers.find(p => p.id === provSel.value);
  const models = provider?.models || [];
  modelSel.innerHTML = "";
  modelSel.disabled = false;
  for (const m of models) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name || m.id;
    modelSel.appendChild(opt);
  }
  if (models.some(m => m.id === pendingModel)) modelSel.value = pendingModel;
  if (!modelSel.value && models[0]) modelSel.value = models[0].id;

  if (authHint) {
    const auth = provider?.auth || {};
    authHint.textContent = provider ? ((auth.configured ? "密钥已配置" : "密钥未配置") + (auth.envVar ? " · " + auth.envVar : "")) : "";
  }

  delete provSel.dataset.pendingValue;
  delete modelSel.dataset.pendingValue;
}

function syncScheduleVisibility() {
  const kind = (($("editor-schedule-kind") || {}).value || "once");
  const oncePanel = $("editor-schedule-once");
  const intervalPanel = $("editor-schedule-interval");
  if (oncePanel) oncePanel.hidden = kind !== "once";
  if (intervalPanel) intervalPanel.hidden = kind !== "interval";
}

function syncTargetVisibility() {
  const type = (($("editor-target-type") || {}).value || "task_inbox");
  const idRow = $("editor-target-id-row");
  if (idRow) idRow.hidden = type === "task_inbox";
}

// ── Flatpickr ──────────────────────────────────────────────────────────────

function initializeFlatpickr() {
  if (typeof window.flatpickr !== "function") return;
  const locale = (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.zh) ? { locale: "zh" } : {};
  const inputs = [$("editor-once-at"), $("editor-interval-start")].filter(Boolean);
  for (const input of inputs) {
    if (input._flatpickr) continue;
    window.flatpickr(input, {
      enableTime: true,
      dateFormat: "Y-m-d H:i",
      altInput: true,
      altFormat: "Y/m/d H:i",
      time_24hr: true,
      minuteIncrement: 5,
      minDate: "today",
      allowInput: true,
      ...locale,
    });
  }
}

// ── DateTime helpers ──────────────────────────────────────────────────────

function getDefaultEditorRunDate() {
  const date = new Date(Date.now() + 10 * 60 * 1000);
  date.setSeconds(0, 0);
  const minutes = date.getMinutes();
  const roundedMinutes = Math.ceil(minutes / 5) * 5;
  if (roundedMinutes >= 60) {
    date.setHours(date.getHours() + 1, 0, 0, 0);
  } else {
    date.setMinutes(roundedMinutes, 0, 0);
  }
  return date;
}

function formatDateTimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.getFullYear() + "-" + pad2(d.getMonth()+1) + "-" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

function parseDateTimeLocal(value) {
  const text = (value || "").trim();
  if (!text) return "";
  const d = new Date(text);
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
}

function parseDailyTimeToCronExpression(value) {
  const text = String(value || "").trim();
  const match = text.match(/(?:^|\\s)(\\d{1,2}):(\\d{2})(?:\\s|$)/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return minute + " " + hour + " * * *";
}

function parseDailyCronTime(expression) {
  const match = String(expression || "").trim().match(/^(\\d{1,2})\\s+(\\d{1,2})\\s+\\*\\s+\\*\\s+\\*$/);
  if (!match) return null;
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function formatDailyScheduleEditorValue(schedule, nextRunAt) {
  if (nextRunAt) {
    const value = formatDateTimeLocal(nextRunAt);
    if (value) return value;
  }
  const time = parseDailyCronTime(schedule && schedule.expression);
  if (!time) return "";
  const date = new Date();
  date.setHours(time.hour, time.minute, 0, 0);
  return formatDateTimeLocal(date.toISOString());
}

// ── Event handlers ─────────────────────────────────────────────────────────

async function handleConnSelect(connId) {
  if (state.editorOpen && !state.editorSaving) {
    closeEditor();
  }
  state.selectedId = connId;
  state.expandedRunId = null;

  renderDetail();
  renderList(); // update selection highlight

  // On mobile, show detail panel
  const listPanel = document.querySelector(".conn-list");
  const detailPanel = document.querySelector(".conn-detail");
  if (listPanel && detailPanel && window.innerWidth < 768) {
    listPanel.classList.add("is-hidden-mobile");
    detailPanel.classList.remove("is-hidden-mobile");
  }
}

function handleFilterChange(filter) {
  state.filter = filter;
  renderList();
}

function handleSearchInput(value) {
  state.search = value;
  renderList();
}

async function handlePause(connId) {
  if (state.actionConnId) return;
  state.actionConnId = connId;
  state.actionKind = "pause";
  renderAll();
  try {
    const data = await apiPauseConn(connId);
    const updated = data.conn;
    if (updated) updateConnInState(updated);
    showToast("已暂停", "success");
    renderAll();
  } catch (err) {
    showToast(err instanceof Error ? err.message : "暂停失败", "error");
  } finally {
    state.actionConnId = "";
    state.actionKind = "";
    renderAll();
  }
}

async function handleResume(connId) {
  if (state.actionConnId) return;
  state.actionConnId = connId;
  state.actionKind = "resume";
  renderAll();
  try {
    const data = await apiResumeConn(connId);
    const updated = data.conn;
    if (updated) updateConnInState(updated);
    showToast("已恢复", "success");
    renderAll();
  } catch (err) {
    showToast(err instanceof Error ? err.message : "恢复失败", "error");
  } finally {
    state.actionConnId = "";
    state.actionKind = "";
    renderAll();
  }
}

async function handleRunNow(connId) {
  if (state.actionConnId || hasActiveRunForConn(connId)) {
    showToast("已有一次执行在进行中，请稍等刷新结果", "info");
    return;
  }
  state.actionConnId = connId;
  state.actionKind = "run";
  renderDetail();
  renderList();
  try {
    const data = await apiRunNow(connId);
    upsertRunForConn(connId, data.run);
    showToast("已触发执行，正在后台运行", "success");
    renderDetail();
    renderList();
    scheduleRunRefresh(connId, 0);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "执行失败", "error");
  } finally {
    state.actionConnId = "";
    state.actionKind = "";
    renderDetail();
    renderList();
  }
}

async function handleCancelRun(connId, runId) {
  if (state.cancellingRunId) return;
  const confirmed = await openConfirmDialog({
    title: "终止本次运行？",
    description: "Run：" + runId + "\\n\\n终止后本次执行会标记为已取消，正在运行的后台 Agent 会收到中断信号。",
    confirmText: "终止",
    cancelText: "取消",
    tone: "danger",
  });
  if (!confirmed) return;

  state.cancellingRunId = runId;
  renderDetail();
  try {
    const data = await apiCancelRun(connId, runId);
    upsertRunForConn(connId, data.run);
    const conn = state.conns.find(c => c.connId === connId);
    if (conn && conn.latestRun?.runId === runId) {
      conn.latestRun = data.run;
    }
    showToast("已终止运行", "success");
    await refreshRunsForConn(connId);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "终止失败", "error");
  } finally {
    state.cancellingRunId = "";
    renderDetail();
    renderList();
  }
}

async function handleDelete(connId) {
  if (state.actionConnId) return;
  const conn = state.conns.find(c => c.connId === connId);
  const confirmed = await openConfirmDialog({
    title: "删除后台任务？",
    description: "任务：" + (conn?.title || connId) + "\\n\\n删除后不可恢复。",
    confirmText: "删除",
    cancelText: "取消",
    tone: "danger",
  });
  if (!confirmed) return;

  state.actionConnId = connId;
  state.actionKind = "delete";
  renderAll();
  try {
    await apiDeleteConn(connId);
    state.conns = state.conns.filter(c => c.connId !== connId);
    delete state.runsByConnId[connId];
    delete state.runHistoryStateByConnId[connId];
    delete state.runHistoryPageByConnId[connId];
    if (state.selectedId === connId) state.selectedId = null;
    showToast("已删除", "success");
    renderAll();
  } catch (err) {
    showToast(err instanceof Error ? err.message : "删除失败", "error");
  } finally {
    state.actionConnId = "";
    state.actionKind = "";
    renderAll();
  }
}

async function handleMarkAllRead() {
  if (state.markingAllRead) return;
  const total = state.totalUnreadRuns || 0;
  if (total === 0) {
    showToast("没有未读结果", "info");
    return;
  }
  const confirmed = await openConfirmDialog({
    title: "全部已读？",
    description: "将标记所有 " + total + " 条未读结果为已读。",
    confirmText: "全部已读",
    cancelText: "取消",
  });
  if (!confirmed) return;
  state.markingAllRead = true;
  const readAllBtn = $("btn-read-all");
  if (readAllBtn) {
    readAllBtn.disabled = true;
    readAllBtn.textContent = "处理中";
  }
  try {
    const result = await apiMarkAllRunsRead();
    const readAt = new Date().toISOString();
    state.totalUnreadRuns = result.totalUnreadRuns;
    state.unreadCountsByConnId = {};
    state.unreadLatestRunTimesByConnId = {};
    markLoadedRunCachesRead(readAt);
    showToast("已标记 " + result.markedCount + " 条为已读", "success");
    renderAll();
  } catch (err) {
    showToast(err instanceof Error ? err.message : "操作失败", "error");
  } finally {
    state.markingAllRead = false;
    if (readAllBtn) {
      readAllBtn.disabled = false;
      readAllBtn.textContent = "全部已读";
    }
  }
}

async function handleRunToggle(connId, runId) {
  if (state.expandedRunId === runId) {
    state.expandedRunId = null;
    renderDetail();
    return;
  }

  state.expandedRunId = runId;
  renderDetail();

  // Load detail if not cached
  if (!state.runDetailEvents[runId]) {
    const container = $("conn-run-detail-" + runId);
    if (container) container.textContent = "加载中...";
    await loadRunDetail(connId, runId, null);
  }
}

async function loadRunDetail(connId, runId, container) {
  try {
    const [detail, eventsPayload] = await Promise.all([
      apiFetchRunDetail(connId, runId),
      apiFetchRunEvents(connId, runId),
    ]);

    const run = detail.run || {};
    const files = detail.files || [];
    const events = eventsPayload.events || [];

    state.runDetailEvents[runId] = events;
    state.runDetailFiles[runId] = files;
    state.runDetailEventsHasMore[runId] = Boolean(eventsPayload.hasMore);
    state.runDetailEventsNextBefore[runId] = eventsPayload.nextBefore || "";

    const target = container || $("conn-run-detail-" + runId);
    if (target) renderRunDetail(target, run, files, events);
  } catch (err) {
    const target = container || $("conn-run-detail-" + runId);
    if (target) target.textContent = err instanceof Error ? err.message : "加载详情失败";
  }
}

async function handleLoadMoreEvents(connId, runId) {
  const before = state.runDetailEventsNextBefore[runId];
  if (!before || state.loadingMoreRunId) return;

  state.loadingMoreRunId = runId;
  renderDetail();
  try {
    const payload = await apiFetchRunEvents(connId, runId, before);
    const events = payload.events || [];
    const existing = state.runDetailEvents[runId] || [];
    state.runDetailEvents[runId] = [...existing, ...events];
    state.runDetailEventsHasMore[runId] = Boolean(payload.hasMore);
    state.runDetailEventsNextBefore[runId] = payload.nextBefore || "";

    // Re-render the detail
    const runs = state.runsByConnId[connId] || [];
    const run = runs.find(r => r.runId === runId);
    if (run) {
      const container = $("conn-run-detail-" + runId);
      if (container) renderRunDetail(container, run, state.runDetailFiles[runId] || [], state.runDetailEvents[runId]);
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : "加载更多事件失败", "error");
  } finally {
    state.loadingMoreRunId = "";
    renderDetail();
  }
}

function handleMobileBack() {
  const listPanel = document.querySelector(".conn-list");
  const detailPanel = document.querySelector(".conn-detail");
  if (listPanel) listPanel.classList.remove("is-hidden-mobile");
  if (detailPanel) detailPanel.classList.add("is-hidden-mobile");
}

function updateConnInState(updated) {
  state.conns = state.conns.map(c => c.connId === updated.connId ? { ...c, ...updated } : c);
}

// ── Data loading ──────────────────────────────────────────────────────────

async function refreshConnList() {
  const conns = await apiFetchConns();
  state.conns = conns.conns || conns;
  state.unreadCountsByConnId = conns.unreadCountsByConnId || {};
  state.unreadLatestRunTimesByConnId = conns.unreadLatestRunTimesByConnId || {};
  state.totalUnreadRuns = conns.totalUnreadRuns || 0;
  renderAll();
}

async function loadData() {
  if (state.refreshing) return;
  state.refreshing = true;
  const refreshBtn = $("btn-refresh");
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "刷新中";
  }
  try {
    await refreshConnList();
  } catch (err) {
    showToast(err instanceof Error ? err.message : "加载数据失败", "error");
  } finally {
    state.refreshing = false;
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "刷新";
    }
  }
}

// ── SSE ────────────────────────────────────────────────────────────────────

function connectSSE() {
  if (state.sseSource) {
    try { state.sseSource.close(); } catch {}
  }
  try {
    const es = new EventSource("/v1/notifications/stream");
    es.addEventListener("message", () => {
      loadData();
    });
    es.addEventListener("error", () => {
      // Auto-reconnect is handled by EventSource
    });
    state.sseSource = es;
  } catch {}
}

// ── Init ───────────────────────────────────────────────────────────────────

function init() {
  applyTheme(readStoredTheme());

  // Search
  const searchInput = $("conn-search");
  if (searchInput) {
    searchInput.addEventListener("input", debounce((e) => {
      handleSearchInput(e.target.value);
    }, 200));
  }

  // Filter tabs
  document.querySelectorAll("[data-filter]").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      handleFilterChange(tab.getAttribute("data-filter"));
    });
  });

  // New task button
  const newBtn = $("btn-new-conn");
  if (newBtn) newBtn.addEventListener("click", () => openEditor("create"));

  // Refresh button
  const refreshBtn = $("btn-refresh");
  if (refreshBtn) refreshBtn.addEventListener("click", () => loadData());

  // Bulk read-all / delete
  const readAllBtn = $("btn-read-all");
  if (readAllBtn) readAllBtn.addEventListener("click", handleMarkAllRead);

  // Theme toggle
  document.querySelectorAll("[data-action='toggle-theme']").forEach(btn => {
    btn.addEventListener("click", toggleTheme);
  });

  // Mobile back
  const mobileBack = $("mobile-back-btn");
  if (mobileBack) mobileBack.addEventListener("click", handleMobileBack);

  // Load data
  loadData().then(() => {
    // Auto-select first conn
    if (state.conns.length > 0 && !state.selectedId) {
      handleConnSelect(state.conns[0].connId);
    }
    connectSSE();
  });
}

init();
`;
}
