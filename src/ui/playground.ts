import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlaygroundActiveRunNormalizerScript } from "./playground-active-run-normalizer.js";
import {
	getPlaygroundBrowserWorkbenchDialogs,
	getPlaygroundBrowserWorkbenchScript,
	getPlaygroundBrowserWorkbenchStyles,
} from "./playground-browser-workbench.js";
import { getConnActivityDialogs } from "./playground-conn-activity.js";
import {
	getPlaygroundAgentManagerDialogs,
	getPlaygroundAgentManagerScript,
	getPlaygroundAgentManagerStyles,
} from "./playground-agent-manager.js";
import { getPlaygroundAssetDialogs } from "./playground-assets.js";
import {
	getPlaygroundAssetControllerScript,
	getPlaygroundAssetElementRefsScript,
	getPlaygroundAssetEventHandlersScript,
} from "./playground-assets-controller.js";
import {
	getPlaygroundContextUsageConstantsScript,
	getPlaygroundContextUsageControllerScript,
	getPlaygroundContextUsageElementRefsScript,
	getPlaygroundContextUsageEventHandlersScript,
} from "./playground-context-usage-controller.js";
import { getPlaygroundConversationApiControllerScript } from "./playground-conversation-api-controller.js";
import { getPlaygroundConversationStateControllerScript } from "./playground-conversation-state-controller.js";
import { getPlaygroundConversationSyncControllerScript } from "./playground-conversation-sync-controller.js";
import { getPlaygroundConfirmDialogControllerScript } from "./playground-confirm-dialog-controller.js";
import { getPlaygroundConversationControllerScript } from "./playground-conversations-controller.js";
import { getPlaygroundHistoryPaginationControllerScript } from "./playground-history-pagination-controller.js";
import { getPlaygroundLayoutConstantsScript, getPlaygroundLayoutControllerScript } from "./playground-layout-controller.js";
import {
	getPlaygroundMobileShellControllerScript,
	getPlaygroundMobileShellElementRefsScript,
	getPlaygroundMobileShellEventHandlersScript,
} from "./playground-mobile-shell-controller.js";
import { getPlaygroundNotificationControllerScript } from "./playground-notification-controller.js";
import { getPlaygroundPanelFocusControllerScript } from "./playground-panel-focus-controller.js";
import { renderPlaygroundHtml } from "./playground-page-shell.js";
import { getPlaygroundProcessControllerScript } from "./playground-process-controller.js";
import { getPlaygroundStatusControllerScript } from "./playground-status-controller.js";
import {
	getPlaygroundTaskInboxControllerScript,
	getPlaygroundTaskInboxElementRefsScript,
	getPlaygroundTaskInboxEventHandlersScript,
	getPlaygroundTaskInboxView,
} from "./playground-task-inbox.js";
import { getPlaygroundThemeControllerScript } from "./playground-theme-controller.js";
import { getPlaygroundWorkspaceControllerScript } from "./playground-workspace-controller.js";
import {
	getBrowserMarkdownRendererScript,
	getPlaygroundTranscriptRendererScript,
} from "./playground-transcript-renderer.js";
import { getPlaygroundStreamControllerScript } from "./playground-stream-controller.js";
import { getPlaygroundConversationHistoryStoreScript } from "./playground-conversation-history-store.js";
import {
	getConnActivityApiScript,
	getConnActivityConstantsScript,
	getConnActivityEditorScript,
	getConnActivityElementRefsScript,
	getConnActivityEventHandlersScript,
	getConnActivityRendererScript,
} from "./playground-conn-activity-controller.js";

import { getPlaygroundStyles } from "./playground-styles.js";

export { renderPlaygroundMarkdown } from "./playground-markdown.js";

export interface PlaygroundRenderBundle {
	styles: string;
	markedBrowserScript: string;
	playgroundScript: string;
	taskInboxView: string;
	connActivityDialogs: string;
	agentManagerDialogs: string;
	browserWorkbenchDialogs: string;
	assetDialogs: string;
}

let markedBrowserScriptCache: string | undefined;

function getMarkedBrowserScript(): string {
	if (!markedBrowserScriptCache) {
		markedBrowserScriptCache = readFileSync(join(process.cwd(), "node_modules", "marked", "lib", "marked.umd.js"), "utf8")
			.replace(/\/\/# sourceMappingURL=.*$/gm, "")
			.replace(/<\/script/gi, "<\\/script");
	}
	return markedBrowserScriptCache;
}

function getPlaygroundScript(): string {
	return `
		${getBrowserMarkdownRendererScript()}

		const CONVERSATION_HISTORY_INDEX_KEY = "ugk-pi:conversation-history-index";
		const TRANSCRIPT_FOLLOW_THRESHOLD_PX = 120;
		const MAX_STORED_CONVERSATIONS = 12;
		const MAX_STORED_MESSAGES_PER_CONVERSATION = 160;
		const MAX_ARCHIVED_TRANSCRIPTS = 4;
		const AGENT_SELECTION_STORAGE_KEY = "ugk-pi:active-agent-id";
		${getPlaygroundContextUsageConstantsScript()}
		${getPlaygroundLayoutConstantsScript()}
		const CONTEXT_STATUS_LABELS = {
			safe: "上下文充足",
			caution: "接近提醒线",
			warning: "接近上限",
			danger: "建议新会话",
		};

		${getConnActivityConstantsScript()}

		function debounce(fn, delay) {
			let timer = null;
			return function debounced(...args) {
				if (timer !== null) {
					window.clearTimeout(timer);
				}
				timer = window.setTimeout(() => {
					timer = null;
					fn.apply(this, args);
				}, delay);
			};
		}

		function getCurrentAgentId() {
			return String(state.agentId || "main").trim() || "main";
		}

		function getAgentApiPath(path) {
			const normalizedPath = String(path || "");
			const suffix = normalizedPath.startsWith("/") ? normalizedPath : "/" + normalizedPath;
			return "/v1/agents/" + encodeURIComponent(getCurrentAgentId()) + suffix;
		}

		function normalizeStoredAgentId(agentId) {
			const normalized = String(agentId || "").trim();
			return /^[a-zA-Z0-9_-]+$/.test(normalized) ? normalized : "";
		}

		function readStoredAgentId() {
			try {
				return normalizeStoredAgentId(localStorage.getItem(AGENT_SELECTION_STORAGE_KEY)) || "main";
			} catch {
				return "main";
			}
		}

		function readUrlAgentIdHint() {
			try {
				const params = new URLSearchParams(window.location.search || "");
				return normalizeStoredAgentId(params.get("agentId"));
			} catch {
				return "";
			}
		}

		function isTeamConsoleEmbed() {
			try {
				const params = new URLSearchParams(window.location.search || "");
				return params.get("embed") === "team-console";
			} catch {
				return false;
			}
		}

		function writeStoredAgentId(agentId, options) {
			const normalized = normalizeStoredAgentId(agentId) || "main";
			if (!options?.skipPersist && !isTeamConsoleEmbed()) {
				try {
					localStorage.setItem(AGENT_SELECTION_STORAGE_KEY, normalized);
				} catch {}
			}
			return normalized;
		}

		function readInitialAgentId() {
			const hinted = readUrlAgentIdHint();
			if (!hinted) return readStoredAgentId();
			return isTeamConsoleEmbed() ? hinted : writeStoredAgentId(hinted);
		}

		function shouldOpenChatViewFromUrl() {
			try {
				const params = new URLSearchParams(window.location.search || "");
				return params.get("view") === "chat";
			} catch {
				return false;
			}
		}

		function clearChatViewUrlHint() {
			if (!shouldOpenChatViewFromUrl() || !window.history?.replaceState) {
				return;
			}
			try {
				const url = new URL(window.location.href);
				url.searchParams.delete("view");
				const nextSearch = url.searchParams.toString();
				window.history.replaceState(null, "", url.pathname + (nextSearch ? "?" + nextSearch : "") + url.hash);
			} catch {}
		}

		const state = {
			loading: false,
			queueMessagePending: false,
			interruptPending: false,
			theme: "dark",
			workspaceMode: "chat",
			agentId: readInitialAgentId(),
			agentCatalog: [],
			agentCatalogReliable: true,
			agentRunStatusByAgentId: {},
			agentRunStatusLoading: false,
			agentRunStatusReliable: true,
			agentRunStatusLoadedAt: 0,
			browserCatalog: [],
			defaultBrowserId: "default",
			browserCatalogReliable: true,
			browserWorkbenchOpen: false,
			browserWorkbenchLoading: false,
			browserWorkbenchStarting: false,
			browserWorkbenchSelectedBrowserId: "",
			browserWorkbenchStatus: null,
			browserWorkbenchActionTargetId: "",
			browserWorkbenchRestoreFocusElement: null,
			conversationId: "",
			streamingText: "",
			activeAssistantContent: null,
			activeStatusShell: null,
			activeStatusSummary: null,
			activeLoadingShell: null,
			activeLoadingDots: null,
			activeRunLogTrigger: null,
			activeRunId: "",
			lastProcessNarration: "",
			receivedDoneEvent: false,
			conversationActionPendingById: {},
			composerUploadingAssets: false,
			recentAssets: [],
			assetsLoadedOnce: false,
			assetDeletingAssetId: "",
			assetDetailQueue: [],
			assetDetailInFlightById: new Map(),
			assetDetailActiveCount: 0,
			selectedAssetRefs: [],
			connEditorSelectedAssetRefs: [],
			connEditorUploadingAssets: false,
			assetPickerTarget: "composer",
			contextUsage: null,
			contextUsageExpanded: false,
			contextUsageSyncToken: 0,
			dragDepth: 0,
			assetModalOpen: false,
			taskInboxItems: [],
			taskInboxOpen: false,
			taskInboxLoading: false,
			taskInboxError: "",
			taskInboxUnreadCount: 0,
			taskInboxMarkingRead: false,
			taskInboxMarkingReadId: "",
			taskInboxFilter: "all",
			taskInboxExpandedActivityIds: [],
			taskInboxHasMore: false,
			taskInboxNextBefore: "",
			taskInboxLoadingMore: false,
			connManagerOpen: false,
			connManagerLoadedOnce: false,
			connManagerUnreadCount: 0,
			connManagerUnreadCountsByConnId: {},
			connManagerUnreadLatestRunTimesByConnId: {},
			connManagerItems: [],
			connManagerRunsByConnId: {},
			connManagerRunsLoadedByConnId: {},
			connManagerRunsLoadingByConnId: {},
			connManagerRunRefreshTimers: {},
			connManagerExpandedRunConnIds: [],
			connManagerActionConnId: "",
			connManagerActionKind: "",
			connManagerNotice: "",
			connManagerHighlightedConnId: "",
			connManagerFilter: "all",
			connManagerSelectedConnIds: [],
			agentManagerOpen: false,
			agentManagerLoading: false,
			agentManagerActionAgentId: "",
			agentManagerNotice: "",
			agentManagerSelectedAgentId: "",
			agentManagerSkillsByAgentId: {},
			agentManagerSkillsLoadingByAgentId: {},
			agentManagerRulesByAgentId: {},
			agentManagerRulesLoadingByAgentId: {},
			agentManagerMode: "detail",
			agentManagerAvailableInitialSkills: [],
			agentManagerAvailableInitialSkillsLoading: false,
			agentManagerSelectedInstallSkillName: "",
			agentManagerSkillActionKey: "",
			agentCreateName: "",
			agentCreateDescription: "",
			agentCreateDefaultBrowserId: "",
			agentCreateSelectedSkillNames: [],
			agentEditorOpen: false,
			agentEditorMode: "create",
			agentEditorAgentId: "",
			agentEditorSaving: false,
			agentEditorError: "",
			agentRulesEditorOpen: false,
			agentRulesEditorAgentId: "",
			agentRulesEditorContent: "",
			agentRulesEditorSaving: false,
			agentRulesEditorError: "",
			agentRulesEditorRestoreFocusElement: null,
			connEditorOpen: false,
			connEditorMode: "create",
			connEditorConnId: "",
			connEditorSaving: false,
			connEditorError: "",
			assetModalRestoreFocusElement: null,
			taskInboxRestoreFocusElement: null,
			chatRunLogRestoreFocusElement: null,
			chatRunLogPagination: null,
			connManagerRestoreFocusElement: null,
			agentManagerRestoreFocusElement: null,
			agentEditorRestoreFocusElement: null,
			connEditorRestoreFocusElement: null,
			connRunDetailsRestoreFocusElement: null,
			connRunDetailsPagination: null,
			modelConfigOpen: false,
			modelConfigRestoreFocusElement: null,
			modelConfig: null,
			modelConfigLoading: false,
			modelConfigSaving: false,
			modelConfigTesting: false,
			modelConfigSelectedProvider: "",
			modelConfigSelectedModel: "",
			feishuSettingsOpen: false,
			feishuSettingsRestoreFocusElement: null,
			feishuSettingsLoading: false,
			feishuSettingsSaving: false,
			feishuSettingsTesting: false,
			feishuSettings: null,
			mobileOverflowMenuOpen: false,
			mobileConversationDrawerOpen: false,
			conversationCatalog: [],
			conversationCatalogSyncing: false,
			conversationCatalogSyncPromise: null,
			conversationCatalogAbortController: null,
			conversationCatalogSyncedAt: 0,
			conversationCreatePending: false,
			conversationMenuOpenId: "",
			conversationSwitchPendingById: {},
			conversationSyncGeneration: 0,
			conversationSyncRequestId: 0,
			conversationAppliedSyncRequestId: 0,
			conversationStateAbortController: null,
			conversationState: null,
			conversationHistory: [],
			renderedConversationId: "",
			renderedConversationStateSignature: "",
			renderedHistoryCount: 0,
			historyPageSize: 12,
			historyLoadingMore: false,
			historyHasMore: false,
			historyNextBefore: "",
			activeRunEventController: null,
			notificationEventSource: null,
			notificationReconnectTimer: null,
			notificationReconnectDelayMs: 0,
			pageUnloading: false,
			skipNextPageShowResumeSync: true,
			primaryStreamActive: false,
			activeStreamOwner: null,
			agentSwitchGeneration: 0,
			autoFollowTranscript: true,
			layoutSyncRaf: 0,
			layoutSyncTimer: null,
			resumeSyncPromise: null,
			resumeSyncTimer: null,
			resumeSyncPendingOptions: null,
			lastResumeSyncAt: 0,
			lastConversationStateSyncAt: 0,
			transcriptScrollRaf: 0,
			transcriptScrollTimer: null,
			lastTranscriptScrollAt: 0,
			historyPersistTimer: null,
			historyPersistConversationId: "",
			confirmDialogResolve: null,
			confirmDialogRestoreFocusElement: null,
		};

		const renderedMessages = new Map();

		const transcript = document.getElementById("transcript");
		const transcriptArchive = document.getElementById("transcript-archive");
		const transcriptCurrent = document.getElementById("transcript-current");
		const historyAutoLoadStatus = document.getElementById("history-auto-load-status");
		const scrollToBottomButton = document.getElementById("scroll-to-bottom-button");
		const errorBanner = document.getElementById("error-banner");
		const errorBannerMessage = document.getElementById("error-banner-message");
		const errorBannerClose = document.getElementById("error-banner-close");
		const notificationLiveRegion = document.getElementById("notification-live-region");
		const notificationToastStack = document.getElementById("notification-toast-stack");
		const dragOverlay = document.getElementById("drag-overlay");
		const pageRoot = document.documentElement;
		const pageBody = document.body;
		const shell = document.getElementById("shell");
		const landingScreen = document.getElementById("landing-screen");
		const sessionFile = document.getElementById("session-file");
		const chatStage = document.getElementById("chat-stage");
		const conversationInput = document.getElementById("conversation-id");
		const messageInput = document.getElementById("message");
		const commandDeck = document.getElementById("command-deck");
		const composerDropTarget = document.getElementById("composer-drop-target");
		${getPlaygroundAssetElementRefsScript()}
		${getPlaygroundContextUsageElementRefsScript()}
		${getPlaygroundTaskInboxElementRefsScript()}
		${getConnActivityElementRefsScript()}
		const chatRunLogDialog = document.getElementById("chat-run-log-dialog");
		const chatRunLogTitle = document.getElementById("chat-run-log-title");
		const chatRunLogBody = document.getElementById("chat-run-log-body");
		const chatRunLogClose = document.getElementById("chat-run-log-close");
		const confirmDialog = document.getElementById("confirm-dialog");
		const confirmDialogTitle = document.getElementById("confirm-dialog-title");
		const confirmDialogBody = document.getElementById("confirm-dialog-body");
		const confirmDialogConfirm = document.getElementById("confirm-dialog-confirm");
		const confirmDialogCancel = document.getElementById("confirm-dialog-cancel");
		const openAssetLibraryButton = document.getElementById("open-asset-library-button");
		const assetModal = document.getElementById("asset-modal");
		const assetModalList = document.getElementById("asset-modal-list");
		const closeAssetModalButton = document.getElementById("close-asset-modal-button");
						const assetModalCount = document.getElementById("asset-modal-count");
		const refreshAssetsButton = document.getElementById("refresh-assets-button");
		const sendButton = document.getElementById("send-button");
		const interruptButton = document.getElementById("interrupt-button");
		const newConversationButton = document.getElementById("new-conversation-button");
		const agentSelectorStatus = document.getElementById("agent-selector-status");
		const agentSwitcherLabel = agentSelectorStatus ? agentSelectorStatus.querySelector(".agent-switcher-label") : null;
		const agentSwitcherMeta = document.getElementById("agent-switcher-meta");
		const openModelConfigButton = document.getElementById("open-model-config-button");
		const modelConfigDialog = document.getElementById("model-config-dialog");
		const modelConfigClose = document.getElementById("model-config-close");
		const modelConfigCurrent = document.getElementById("model-config-current");
		const modelConfigProvider = document.getElementById("model-config-provider");
		const modelConfigModel = document.getElementById("model-config-model");
		const modelConfigAuth = document.getElementById("model-config-auth");
		const modelConfigStatus = document.getElementById("model-config-status");
		const modelConfigTest = document.getElementById("model-config-test");
		const modelConfigSave = document.getElementById("model-config-save");
		const openFeishuSettingsButton = document.getElementById("open-feishu-settings-button");
		const openBrowserWorkbenchButton = document.getElementById("open-browser-workbench-button");
		const runtimeModelSummary = document.getElementById("runtime-model-summary");
		const runtimeModelValue = document.getElementById("runtime-model-value");
		const runtimeBrowserSummary = document.getElementById("runtime-browser-summary");
		const runtimeBrowserValue = document.getElementById("runtime-browser-value");
		const browserWorkbenchDialog = document.getElementById("browser-workbench-dialog");
		const closeBrowserWorkbenchButton = document.getElementById("close-browser-workbench-button");
		const refreshBrowserWorkbenchButton = document.getElementById("refresh-browser-workbench-button");
		const startBrowserWorkbenchButton = document.getElementById("start-browser-workbench-button");
		const browserWorkbenchList = document.getElementById("browser-workbench-list");
		const browserWorkbenchSummary = document.getElementById("browser-workbench-summary");
		const browserWorkbenchStatus = document.getElementById("browser-workbench-status");
		const browserWorkbenchTargets = document.getElementById("browser-workbench-targets");
		const feishuSettingsDialog = document.getElementById("feishu-settings-dialog");
		const feishuSettingsClose = document.getElementById("feishu-settings-close");
		const feishuSettingsCurrent = document.getElementById("feishu-settings-current");
		const feishuSettingsEnabled = document.getElementById("feishu-settings-enabled");
		const feishuSettingsAppId = document.getElementById("feishu-settings-app-id");
		const feishuSettingsAppSecret = document.getElementById("feishu-settings-app-secret");
		const feishuSettingsApiBase = document.getElementById("feishu-settings-api-base");
		const feishuSettingsAllowedChatIds = document.getElementById("feishu-settings-allowed-chat-ids");
		const feishuSettingsActivityOpenIds = document.getElementById("feishu-settings-activity-open-ids");
		const feishuSettingsActivityChatIds = document.getElementById("feishu-settings-activity-chat-ids");
		const feishuSettingsStatus = document.getElementById("feishu-settings-status");
		const feishuSettingsTest = document.getElementById("feishu-settings-test");
		const feishuSettingsSave = document.getElementById("feishu-settings-save");
		${getPlaygroundMobileShellElementRefsScript()}
		const topbarContextSlot = document.querySelector(".topbar-context-slot");
		if (topbarContextSlot?.parentElement === mobileTopbar) {
			mobileTopbar.after(topbarContextSlot);
		}
		const statusPill = document.getElementById("status-pill");
		const commandStatus = document.getElementById("command-status");

		messageInput.placeholder = "和我聊聊吧";

		${getPlaygroundPanelFocusControllerScript()}
		${getPlaygroundConfirmDialogControllerScript()}

		function createBrowserId() {
			const cryptoApi = globalThis.crypto;
			if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
				return cryptoApi.randomUUID();
			}
			if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
				const bytes = new Uint8Array(16);
				cryptoApi.getRandomValues(bytes);
				return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
			}
			return Date.now().toString(36) + Math.random().toString(36).slice(2);
		}

		function renderAgentSelector() {
			const knownAgents = Array.isArray(state.agentCatalog) && state.agentCatalog.length > 0
				? state.agentCatalog
				: [
					{ agentId: "main", name: "主 Agent" },
					{ agentId: "search", name: "搜索 Agent" },
				];
			const currentAgentId = getCurrentAgentId();
			if (currentAgentId && !knownAgents.some((agent) => String(agent?.agentId || "").trim() === currentAgentId)) {
				knownAgents.push({ agentId: currentAgentId, name: currentAgentId });
			}

			if (agentSwitcherLabel) {
				const current = knownAgents.find((agent) => agent?.agentId === currentAgentId);
				agentSwitcherLabel.textContent = String(current?.name || currentAgentId);
			}

			if (agentSwitcherMeta) {
				renderAgentSwitcherMeta(knownAgents, currentAgentId);
			}
		}

		let agentSwitcherCloseTimer = null;

		function openAgentSwitcher() {
			if (agentSwitcherCloseTimer) {
				clearTimeout(agentSwitcherCloseTimer);
				agentSwitcherCloseTimer = null;
			}
			agentSelectorStatus.dataset.switcherOpen = "true";
			renderAgentSelector();
			void loadAgentRunStatus({ force: true }).then(() => {
				renderAgentSelector();
			});
		}

		function closeAgentSwitcher() {
			agentSwitcherCloseTimer = setTimeout(() => {
				agentSelectorStatus.dataset.switcherOpen = "false";
				agentSwitcherCloseTimer = null;
			}, 120);
		}

		function renderAgentSwitcherMeta(agents, currentAgentId) {
			agentSwitcherMeta.innerHTML = "";
			const list = document.createElement("div");
			list.className = "agent-switcher-list";

			if (shell.dataset.home !== "true") {
				const homeItem = document.createElement("button");
				homeItem.type = "button";
				homeItem.className = "agent-switcher-item";
				homeItem.innerHTML = '<span class="agent-switcher-item-name">返回首页</span>';
				homeItem.addEventListener("click", (event) => {
					event.stopPropagation();
					closeAgentSwitcher();
					backToLanding();
				});
				list.appendChild(homeItem);
			}

			for (const agent of agents) {
				const agentId = String(agent?.agentId || "").trim();
				if (!agentId) {
					continue;
				}
				const isCurrent = agentId === currentAgentId;
				const runStatus = state.agentRunStatusByAgentId?.[agentId];
				const runState = runStatus?.status || "unknown";
				const isBusy = runState === "busy";
				const isIdle = runState === "idle";
				const item = document.createElement("button");
				item.type = "button";
				item.className = "agent-switcher-item" + (isCurrent ? " is-current" : "") + (isBusy ? " is-busy" : isIdle ? " is-idle" : " is-unknown");
				item.dataset.agentId = agentId;
				const name = document.createElement("span");
				name.className = "agent-switcher-item-name";
				name.textContent = String(agent?.name || agentId);
				const id = document.createElement("code");
				id.className = "agent-switcher-item-id";
				id.textContent = agentId;
				const status = document.createElement("span");
				status.className = "agent-switcher-item-status";
				status.textContent = (isCurrent ? "当前 · " : "") + (isBusy ? "运行中" : isIdle ? "空闲" : "状态未知");
				if (isBusy && runStatus?.activeSince) {
					const elapsed = Math.round((Date.now() - new Date(runStatus.activeSince).getTime()) / 60000);
					if (elapsed > 0) status.title = "运行时间：" + elapsed + " 分钟";
				}
				item.appendChild(name);
				item.appendChild(id);
				item.appendChild(status);
				if (!isCurrent) {
					item.addEventListener("click", (event) => {
						event.stopPropagation();
						closeAgentSwitcher();
						void switchAgent(agentId);
					});
				} else {
					item.disabled = true;
				}
				list.appendChild(item);
			}
			agentSwitcherMeta.appendChild(list);
		}

		async function loadAgentCatalog() {
			try {
				const response = await fetch("/v1/agents", {
					method: "GET",
					headers: { accept: "application/json" },
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.message || "无法读取 agent 列表");
				}
				state.agentCatalog = Array.isArray(payload?.agents) ? payload.agents : [];
				state.agentCatalogReliable = true;
			} catch {
				state.agentCatalog = [
					{ agentId: "main", name: "主 Agent" },
					{ agentId: "search", name: "搜索 Agent" },
				];
				state.agentCatalogReliable = false;
			}
			const knownAgentIds = new Set(state.agentCatalog.map((agent) => String(agent?.agentId || "").trim()).filter(Boolean));
			if (state.agentCatalogReliable && !knownAgentIds.has(getCurrentAgentId())) {
				state.agentId = writeStoredAgentId("main", { skipPersist: isTeamConsoleEmbed() });
			}
			renderAgentSelector();
			renderRuntimeSummary();
		}


		function normalizeAgentRunStatus(raw) {
			const agentId = String(raw?.agentId || "").trim();
			if (!agentId) return null;
			const statusValue = raw?.status === "busy" ? "busy" : raw?.status === "idle" ? "idle" : "unknown";
			return {
				agentId,
				name: String(raw?.name || agentId),
				status: statusValue,
				activeConversationId: typeof raw?.activeConversationId === "string" ? raw.activeConversationId : "",
				activeSince: typeof raw?.activeSince === "string" ? raw.activeSince : "",
			};
		}

		async function loadAgentRunStatus(options) {
			const now = Date.now();
			const freshMs = Number.isFinite(options?.freshMs) ? options.freshMs : 3000;
			if (!options?.force && now - Number(state.agentRunStatusLoadedAt || 0) < freshMs) {
				return state.agentRunStatusByAgentId;
			}
			state.agentRunStatusLoading = true;
			try {
				const response = await fetch("/v1/agents/status", {
					method: "GET",
					headers: { accept: "application/json" },
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) throw new Error(payload?.message || "无法读取 agent 状态");
				const statuses = Array.isArray(payload?.agents)
					? payload.agents.map(normalizeAgentRunStatus).filter(Boolean)
					: [];
				state.agentRunStatusByAgentId = Object.fromEntries(
					statuses.map((s) => [s.agentId, s]),
				);
				state.agentRunStatusReliable = true;
				state.agentRunStatusLoadedAt = Date.now();
				return state.agentRunStatusByAgentId;
			} catch {
				state.agentRunStatusReliable = false;
				return state.agentRunStatusByAgentId;
			} finally {
				state.agentRunStatusLoading = false;
			}
		}
		async function loadAgentStatusAndRenderCards() {
				const container = document.getElementById("landing-agent-cards");
				if (!container) return;
				try {
					const [agentsRes, statusRes] = await Promise.all([
						fetch("/v1/agents", { headers: { accept: "application/json" } }),
						fetch("/v1/agents/status", { headers: { accept: "application/json" } }),
					]);
					const agentsPayload = await agentsRes.json().catch(() => ({}));
					const statusPayload = await statusRes.json().catch(() => ({}));
					const agents = Array.isArray(agentsPayload?.agents) ? agentsPayload.agents : [];
					const statuses = Array.isArray(statusPayload?.agents) ? statusPayload.agents : [];
					state.agentCatalog = agents;
					state.agentCatalogReliable = agentsRes.ok;

					const statusMap = new Map(statuses.map((s) => [s.agentId, s]));
					container.innerHTML = "";
					for (const agent of agents) {
						const agentId = String(agent?.agentId || "").trim();
						if (!agentId) continue;
						const status = statusMap.get(agentId);
						const isBusy = status?.status === "busy";
						const card = document.createElement("button");
						card.type = "button";
						card.className = "landing-agent-card" + (isBusy ? " is-busy" : "");

						const header = document.createElement("div");
						header.className = "landing-agent-header";
						const dot = document.createElement("span");
						dot.className = "landing-agent-status-dot " + (isBusy ? "busy" : "idle");
						const nameEl = document.createElement("strong");
						nameEl.className = "landing-agent-name";
						nameEl.textContent = agent.name || agentId;
						header.appendChild(dot);
						header.appendChild(nameEl);

						const idEl = document.createElement("span");
						idEl.className = "landing-agent-id";
						idEl.textContent = agentId;

						const descEl = document.createElement("span");
						descEl.className = "landing-agent-desc";
						descEl.textContent = agent.description || "";

						const statusText = document.createElement("span");
						statusText.className = "landing-agent-status-text";
						statusText.textContent = isBusy ? "正在运行" : "空闲";

						card.appendChild(header);
						card.appendChild(idEl);
						card.appendChild(descEl);
						card.appendChild(statusText);
						card.addEventListener("click", () => {
							void enterAgentFromLanding(agentId);
						});
						container.appendChild(card);
					}
					renderAgentSelector();
					renderRuntimeSummary();
				} catch {
					container.innerHTML = '<span style="color:var(--text-muted)">无法加载 agent 列表</span>';
				}
			}

			async function enterAgentFromLanding(agentId) {
				shell.dataset.home = "false";
				if (String(agentId || "").trim() === getCurrentAgentId()) {
					renderAgentSelector();
					await ensureCurrentConversation({ silent: true });
					return;
				}
				await switchAgent(agentId);
			}

			function backToLanding() {
				if (state.loading) {
					showError("当前 agent 仍在运行，无法返回首页。");
					return;
				}
				stopActiveRunEventStream();
				abortConversationStateSync();
				state.conversationId = "";
				state.conversationCatalog = [];
				state.conversationCatalogSyncedAt = 0;
				state.conversationCatalogSyncPromise = null;
				state.conversationHistory = [];
				state.conversationState = null;
				state.renderedConversationId = "";
				state.renderedConversationStateSignature = "";
				state.historyHasMore = false;
				state.historyNextBefore = "";
				conversationInput.value = "";
				clearRenderedTranscript();
				resetStreamingState();
				setTranscriptState("idle");
				renderAgentSelector();
				clearError();
				clearChatViewUrlHint();
				shell.dataset.home = "true";
				landingScreen.setAttribute("aria-hidden", "false");
				void loadAgentStatusAndRenderCards();
			}

			async function switchAgent(agentId) {
			const nextAgentId = String(agentId || "").trim();
			if (!nextAgentId || nextAgentId === getCurrentAgentId()) {
				renderAgentSelector();
				return;
			}

			state.agentSwitchGeneration += 1;
			state.activeStreamOwner = null;
			stopActiveRunEventStream();
			abortConversationStateSync();
			state.agentId = writeStoredAgentId(nextAgentId, { skipPersist: isTeamConsoleEmbed() });
			state.conversationId = "";
			state.conversationCatalog = [];
			state.conversationCatalogSyncedAt = 0;
			state.conversationCatalogSyncPromise = null;
			state.conversationHistory = [];
			state.conversationState = null;
			state.renderedConversationId = "";
			state.renderedConversationStateSignature = "";
			state.loading = false;
			state.activeRunId = "";
			state.receivedDoneEvent = false;
			state.streamingText = "";
			state.primaryStreamActive = false;
			state.historyHasMore = false;
			state.historyNextBefore = "";
			conversationInput.value = "";
			clearRenderedTranscript();
			resetStreamingState();
			setTranscriptState("idle");
			renderConversationDrawer();
			renderContextUsageBar();
			renderAgentSelector();
			renderRuntimeSummary();
			clearError();
			await ensureCurrentConversation({ silent: true });
			void syncRuntimeSummary();
			void loadAgentRunStatus({ force: true }).then(renderAgentSelector);
		}

		window.ugkPlaygroundAgentOps = Object.freeze({
			listAgents: () => [...state.agentCatalog],
			getCurrentAgentId,
			switchAgent,
		});

		confirmDialogConfirm.addEventListener("click", () => {
			closeConfirmDialog(true);
		});
		confirmDialogCancel.addEventListener("click", () => {
			closeConfirmDialog(false);
		});
		confirmDialog.addEventListener("click", (event) => {
			if (event.target === confirmDialog) {
				closeConfirmDialog(false);
			}
		});
		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape" && confirmDialog.classList.contains("open")) {
				event.preventDefault();
				closeConfirmDialog(false);
			}
		});

		${getPlaygroundContextUsageControllerScript()}
		${getPlaygroundWorkspaceControllerScript()}
		${getPlaygroundBrowserWorkbenchScript()}

		${getPlaygroundAgentManagerScript()}

		${getConnActivityEditorScript()}

		${getPlaygroundStatusControllerScript()}

		function getSelectedModelConfig() {
			return {
				provider: String(modelConfigProvider.value || "").trim(),
				model: String(modelConfigModel.value || "").trim(),
			};
		}

		function findModelConfigProvider(providerId) {
			return state.modelConfig?.providers?.find((provider) => provider.id === providerId) || null;
		}

		function findCurrentAgentCatalogEntry() {
			const currentAgentId = getCurrentAgentId();
			return (Array.isArray(state.agentCatalog) ? state.agentCatalog : [])
				.find((agent) => String(agent?.agentId || "").trim() === currentAgentId) || null;
		}

		function getCurrentAgentModelConfigSelection() {
			if (getCurrentAgentId() === "main") {
				return null;
			}
			const agent = findCurrentAgentCatalogEntry();
			const provider = String(agent?.defaultModelProvider || "").trim();
			const model = String(agent?.defaultModelId || "").trim();
			return provider && model ? { provider, model } : null;
		}

		function hasModelConfigSelection(selection) {
			if (!selection?.provider || !selection?.model) {
				return false;
			}
			return Boolean(
				state.modelConfig?.providers
					?.find((provider) => provider.id === selection.provider)
					?.models?.some((model) => model.id === selection.model)
			);
		}

		function getEffectiveModelConfigSelection() {
			const current = state.modelConfig?.current || { provider: "", model: "" };
			const agentSelection = getCurrentAgentModelConfigSelection();
			return hasModelConfigSelection(agentSelection) ? agentSelection : current;
		}

		function getBrowserCatalogForRuntimeSummary() {
			return Array.isArray(state.browserCatalog) && state.browserCatalog.length > 0
				? state.browserCatalog
				: [{ browserId: "default", name: "Default", isDefault: true }];
		}

		function getRuntimeBrowserLabel(browserId) {
			const normalized = String(browserId || "").trim() || "default";
			const browser = getBrowserCatalogForRuntimeSummary()
				.find((entry) => String(entry?.browserId || "").trim() === normalized);
			const name = String(browser?.name || normalized).trim();
			return name === normalized ? normalized : name + " · " + normalized;
		}

		function getEffectiveBrowserSelection() {
			const agent = findCurrentAgentCatalogEntry();
			const agentBrowserId = String(agent?.defaultBrowserId || "").trim();
			return agentBrowserId || String(state.defaultBrowserId || "default").trim() || "default";
		}

		function renderRuntimeSummary() {
			const modelSelection = getEffectiveModelConfigSelection();
			if (runtimeModelValue) {
				runtimeModelValue.textContent = modelSelection.provider && modelSelection.model
					? modelSelection.provider + " / " + modelSelection.model
					: "配置未知";
			}
			if (runtimeModelSummary) {
				const agentModel = getCurrentAgentModelConfigSelection();
				runtimeModelSummary.dataset.source = agentModel ? "agent" : "global";
				runtimeModelSummary.setAttribute("aria-label", "当前 API 源 " + (runtimeModelValue?.textContent || "配置未知"));
			}

			const browserId = getEffectiveBrowserSelection();
			if (runtimeBrowserValue) {
				runtimeBrowserValue.textContent = getRuntimeBrowserLabel(browserId);
			}
			if (runtimeBrowserSummary) {
				const agentBrowserId = String(findCurrentAgentCatalogEntry()?.defaultBrowserId || "").trim();
				runtimeBrowserSummary.dataset.source = agentBrowserId ? "agent" : "global";
				runtimeBrowserSummary.setAttribute("aria-label", "当前 Chrome " + (runtimeBrowserValue?.textContent || "配置未知"));
			}
		}

		async function syncRuntimeSummary() {
			await Promise.allSettled([
				loadModelConfigForRuntimeSummary(),
				loadBrowserCatalogForRuntimeSummary(),
			]);
			renderRuntimeSummary();
		}

		async function loadModelConfigForRuntimeSummary() {
			if (state.modelConfig) {
				return;
			}
			const response = await fetch("/v1/model-config", { headers: { accept: "application/json" } });
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error?.message || "读取模型源失败");
			}
			state.modelConfig = payload;
		}

		async function loadBrowserCatalogForRuntimeSummary() {
			if (Array.isArray(state.browserCatalog) && state.browserCatalog.length > 0) {
				return;
			}
			const response = await fetch("/v1/browsers", { headers: { accept: "application/json" } });
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload?.error?.message || "读取 Chrome 列表失败");
			}
			state.defaultBrowserId = String(payload?.defaultBrowserId || "default").trim() || "default";
			state.browserCatalog = Array.isArray(payload?.browsers) ? payload.browsers : [];
			state.browserCatalogReliable = true;
		}

		function formatModelTokenCount(value) {
			const count = Number(value);
			if (!Number.isFinite(count) || count <= 0) {
				return "";
			}
			if (count >= 1000000) {
				const millions = count / 1000000;
				return (Number.isInteger(millions) ? String(millions) : millions.toFixed(1)) + "M";
			}
			if (count >= 1000) {
				const thousands = count / 1000;
				return (Number.isInteger(thousands) ? String(thousands) : String(Math.round(thousands))) + "K";
			}
			return String(Math.round(count));
		}

		function getModelConfigOptionLabel(model) {
			const baseLabel = model.name ? model.name + " / " + model.id : model.id;
			const contextWindow = formatModelTokenCount(model.contextWindow);
			const maxTokens = formatModelTokenCount(model.maxTokens);
			const meta = [];
			if (contextWindow) {
				meta.push("ctx " + contextWindow);
			}
			if (maxTokens) {
				meta.push("out " + maxTokens);
			}
			return meta.length > 0 ? baseLabel + " · " + meta.join(" · ") : baseLabel;
		}

		function setModelConfigStatus(message, tone = "neutral") {
			modelConfigStatus.textContent = message || "";
			modelConfigStatus.dataset.tone = tone;
		}

		function getModelConfigProviderLabel(provider) {
			const baseLabel = provider.name ? provider.name + " / " + provider.id : provider.id;
			const meta = [];
			if (provider.vendor) {
				meta.push(provider.vendor);
			}
			if (provider.region) {
				meta.push(provider.region);
			}
			return meta.length > 0 ? baseLabel + " · " + meta.join(" · ") : baseLabel;
		}

		function setModelConfigBusy() {
			const busy = state.modelConfigLoading || state.modelConfigSaving || state.modelConfigTesting;
			modelConfigProvider.disabled = busy;
			modelConfigModel.disabled = busy || !modelConfigProvider.value;
			modelConfigTest.disabled = busy || !modelConfigProvider.value || !modelConfigModel.value;
			modelConfigSave.disabled = busy || !modelConfigProvider.value || !modelConfigModel.value;
			modelConfigTest.textContent = state.modelConfigTesting ? "测试中" : "测试连接";
			modelConfigSave.textContent = state.modelConfigSaving ? "验证中" : "验证并保存";
		}

		function renderModelConfigModelOptions() {
			const provider = findModelConfigProvider(modelConfigProvider.value);
			const models = provider?.models || [];
			modelConfigModel.innerHTML = "";
			for (const model of models) {
				const option = document.createElement("option");
				option.value = model.id;
				option.textContent = getModelConfigOptionLabel(model);
				modelConfigModel.appendChild(option);
			}
			if (models.some((model) => model.id === state.modelConfigSelectedModel)) {
				modelConfigModel.value = state.modelConfigSelectedModel;
			}
			if (!modelConfigModel.value && models[0]) {
				modelConfigModel.value = models[0].id;
			}
			renderModelConfigAuth();
			setModelConfigBusy();
		}

		function renderModelConfigAuth() {
			const provider = findModelConfigProvider(modelConfigProvider.value);
			if (!provider) {
				modelConfigAuth.textContent = "未选择 API 源";
				modelConfigAuth.dataset.state = "missing";
				return;
			}
			const auth = provider.auth || {};
			const envText = auth.envVar ? " · " + auth.envVar : "";
			modelConfigAuth.textContent = (auth.configured ? "密钥已配置" : "密钥未配置") + envText;
			modelConfigAuth.dataset.state = auth.configured ? "ready" : "missing";
		}

		function renderModelConfigDialog() {
			const config = state.modelConfig;
			modelConfigProvider.innerHTML = "";
			const providers = config?.providers || [];
			for (const provider of providers) {
				const option = document.createElement("option");
				option.value = provider.id;
				option.textContent = getModelConfigProviderLabel(provider);
				modelConfigProvider.appendChild(option);
			}
			const current = config?.current || { provider: "", model: "" };
			const agentSelection = getCurrentAgentModelConfigSelection();
			const effectiveSelection = getEffectiveModelConfigSelection();
			state.modelConfigSelectedProvider = state.modelConfigSelectedProvider || effectiveSelection.provider;
			state.modelConfigSelectedModel = state.modelConfigSelectedModel || effectiveSelection.model;
			if (providers.some((provider) => provider.id === state.modelConfigSelectedProvider)) {
				modelConfigProvider.value = state.modelConfigSelectedProvider;
			}
			if (getCurrentAgentId() === "main") {
				modelConfigCurrent.textContent = current.provider && current.model ? "主 Agent 跟随全局：" + current.provider + " / " + current.model : "当前配置未知";
			} else if (agentSelection && hasModelConfigSelection(agentSelection)) {
				modelConfigCurrent.textContent = "当前 Agent：" + getCurrentAgentId() + " · " + agentSelection.provider + " / " + agentSelection.model;
			} else if (agentSelection) {
				modelConfigCurrent.textContent = "当前 Agent 模型已不可用，按全局显示：" + (current.provider && current.model ? current.provider + " / " + current.model : "配置未知");
			} else {
				modelConfigCurrent.textContent = current.provider && current.model ? "当前 Agent 跟随全局：" + current.provider + " / " + current.model : "当前配置未知";
			}
			renderModelConfigModelOptions();
		}

		async function loadModelConfig() {
			state.modelConfigLoading = true;
			setModelConfigBusy();
			setModelConfigStatus("正在读取模型源", "neutral");
			try {
				const response = await fetch("/v1/model-config");
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.error?.message || "读取模型源失败");
				}
				state.modelConfig = payload;
				const effectiveSelection = getEffectiveModelConfigSelection();
				state.modelConfigSelectedProvider = effectiveSelection.provider || "";
				state.modelConfigSelectedModel = effectiveSelection.model || "";
				renderModelConfigDialog();
				renderRuntimeSummary();
				setModelConfigStatus(getCurrentAgentId() === "main" ? "主 Agent 跟随全局模型设置，保存会更新全局默认。" : "这里保存到当前 Agent，后续新会话和后台继承该 Agent 的任务会使用它。", "neutral");
			} catch (error) {
				setModelConfigStatus(error instanceof Error ? error.message : "读取模型源失败", "error");
			} finally {
				state.modelConfigLoading = false;
				setModelConfigBusy();
			}
		}

		async function openModelConfigDialog(returnFocusElement) {
			state.modelConfigOpen = true;
			state.modelConfigRestoreFocusElement = rememberPanelReturnFocus(returnFocusElement);
			modelConfigDialog.hidden = false;
			modelConfigDialog.inert = false;
			modelConfigDialog.classList.add("open");
			modelConfigDialog.setAttribute("aria-hidden", "false");
			modelConfigProvider.focus();
			await loadModelConfig();
		}

		function closeModelConfigDialog() {
			if (!state.modelConfigOpen) {
				return;
			}
			state.modelConfigOpen = false;
			restoreFocusAfterPanelClose(modelConfigDialog, state.modelConfigRestoreFocusElement);
			modelConfigDialog.classList.remove("open");
			modelConfigDialog.setAttribute("aria-hidden", "true");
			modelConfigDialog.inert = true;
			modelConfigDialog.hidden = true;
			state.modelConfigRestoreFocusElement = null;
		}

		async function testModelConfigSelection() {
			const selection = getSelectedModelConfig();
			state.modelConfigTesting = true;
			setModelConfigBusy();
			setModelConfigStatus("正在测试 " + selection.provider + " / " + selection.model, "neutral");
			try {
				const response = await fetch("/v1/model-config/validate", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(selection),
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok || payload?.ok === false) {
					throw new Error(payload?.error?.message || payload?.message || "模型源验证失败");
				}
				setModelConfigStatus("连接验证通过。", "success");
			} catch (error) {
				setModelConfigStatus(error instanceof Error ? error.message : "模型源验证失败", "error");
			} finally {
				state.modelConfigTesting = false;
				setModelConfigBusy();
			}
		}

		async function saveModelConfigSelection() {
			const selection = getSelectedModelConfig();
			state.modelConfigSaving = true;
			setModelConfigBusy();
			setModelConfigStatus("正在验证并保存", "neutral");
			try {
				const currentAgentId = getCurrentAgentId();
				const isMainAgent = currentAgentId === "main";
				const response = await fetch(isMainAgent ? "/v1/model-config/default" : "/v1/agents/" + encodeURIComponent(currentAgentId), {
					method: isMainAgent ? "PUT" : "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(isMainAgent ? selection : {
						defaultModelProvider: selection.provider,
						defaultModelId: selection.model,
					}),
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok || payload?.ok === false) {
					throw new Error(payload?.error?.message || payload?.message || "保存模型源失败");
				}
				if (isMainAgent && state.modelConfig) {
					state.modelConfig.current = payload.current;
				}
				if (!isMainAgent && payload?.agent) {
					const agents = Array.isArray(state.agentCatalog) ? state.agentCatalog : [];
					const replaced = agents.some((agent) => agent?.agentId === payload.agent.agentId);
					state.agentCatalog = replaced
						? agents.map((agent) => agent?.agentId === payload.agent.agentId ? payload.agent : agent)
						: [...agents, payload.agent];
				}
				const savedSelection = isMainAgent ? payload.current : selection;
				state.modelConfigSelectedProvider = savedSelection.provider;
				state.modelConfigSelectedModel = savedSelection.model;
				renderModelConfigDialog();
				renderRuntimeSummary();
				setModelConfigStatus(isMainAgent ? "已保存到全局默认，新会话生效。" : "已保存到当前 Agent，新会话生效。", "success");
				void syncContextUsage({ silent: true });
			} catch (error) {
				setModelConfigStatus(error instanceof Error ? error.message : "保存模型源失败", "error");
			} finally {
				state.modelConfigSaving = false;
				setModelConfigBusy();
			}
		}

		function splitFeishuIds(value) {
			return String(value || "")
				.split(",")
				.flatMap((item) => item.split(String.fromCharCode(10)))
				.map((item) => item.trim())
				.filter(Boolean);
		}

		function setFeishuSettingsStatus(message, tone = "neutral") {
			feishuSettingsStatus.textContent = message || "";
			feishuSettingsStatus.dataset.tone = tone;
		}

		function setFeishuSettingsBusy() {
			const busy = state.feishuSettingsLoading || state.feishuSettingsSaving || state.feishuSettingsTesting;
			for (const element of [
				feishuSettingsEnabled,
				feishuSettingsAppId,
				feishuSettingsAppSecret,
				feishuSettingsApiBase,
				feishuSettingsAllowedChatIds,
				feishuSettingsActivityOpenIds,
				feishuSettingsActivityChatIds,
				feishuSettingsTest,
				feishuSettingsSave,
			]) {
				element.disabled = busy;
			}
			feishuSettingsTest.textContent = state.feishuSettingsTesting ? "发送中" : "发送测试消息";
			feishuSettingsSave.textContent = state.feishuSettingsSaving ? "保存中" : "保存并重连";
		}

		function renderFeishuSettingsDialog() {
			const settings = state.feishuSettings || {};
			feishuSettingsEnabled.value = settings.enabled ? "true" : "false";
			feishuSettingsAppId.value = settings.appId || "";
			feishuSettingsAppSecret.value = "";
			feishuSettingsApiBase.value = settings.apiBase || "https://open.feishu.cn/open-apis";
			feishuSettingsAllowedChatIds.value = (settings.allowedChatIds || []).join(String.fromCharCode(10));
			const targets = settings.activityTargets || [];
			feishuSettingsActivityOpenIds.value = targets
				.filter((target) => target.type === "feishu_user")
				.map((target) => target.openId)
				.join(String.fromCharCode(10));
			feishuSettingsActivityChatIds.value = targets
				.filter((target) => target.type === "feishu_chat")
				.map((target) => target.chatId)
				.join(String.fromCharCode(10));
			feishuSettingsCurrent.textContent = settings.enabled
				? (settings.hasAppSecret ? "已配置 App，保存后 worker 自动重连" : "已启用，但缺少 App Secret")
				: "当前停用";
		}

		async function loadFeishuSettings() {
			state.feishuSettingsLoading = true;
			setFeishuSettingsBusy();
			setFeishuSettingsStatus("正在读取飞书配置", "neutral");
			try {
				const response = await fetch("/v1/integrations/feishu/settings");
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.error?.message || "读取飞书配置失败");
				}
				state.feishuSettings = payload;
				renderFeishuSettingsDialog();
				setFeishuSettingsStatus("先在飞书机器人私聊里发送 /whoami，再把 open_id 或 chat_id 填到这里。", "neutral");
			} catch (error) {
				setFeishuSettingsStatus(error instanceof Error ? error.message : "读取飞书配置失败", "error");
			} finally {
				state.feishuSettingsLoading = false;
				setFeishuSettingsBusy();
			}
		}

		function collectFeishuSettingsPayload() {
			const openIds = splitFeishuIds(feishuSettingsActivityOpenIds.value);
			const chatIds = splitFeishuIds(feishuSettingsActivityChatIds.value);
			const activityTargets = [
				...openIds.map((openId) => ({ type: "feishu_user", openId })),
				...chatIds.map((chatId) => ({ type: "feishu_chat", chatId })),
			];
			const appSecret = String(feishuSettingsAppSecret.value || "").trim();
			return {
				enabled: feishuSettingsEnabled.value === "true",
				appId: String(feishuSettingsAppId.value || "").trim(),
				...(appSecret ? { appSecret } : {}),
				apiBase: String(feishuSettingsApiBase.value || "").trim(),
				allowedChatIds: splitFeishuIds(feishuSettingsAllowedChatIds.value),
				activityTargets,
			};
		}

		async function openFeishuSettingsDialog(returnFocusElement) {
			state.feishuSettingsOpen = true;
			state.feishuSettingsRestoreFocusElement = rememberPanelReturnFocus(returnFocusElement);
			feishuSettingsDialog.hidden = false;
			feishuSettingsDialog.inert = false;
			feishuSettingsDialog.classList.add("open");
			feishuSettingsDialog.setAttribute("aria-hidden", "false");
			feishuSettingsAppId.focus();
			await loadFeishuSettings();
		}

		function closeFeishuSettingsDialog() {
			if (!state.feishuSettingsOpen) {
				return;
			}
			state.feishuSettingsOpen = false;
			restoreFocusAfterPanelClose(feishuSettingsDialog, state.feishuSettingsRestoreFocusElement);
			feishuSettingsDialog.classList.remove("open");
			feishuSettingsDialog.setAttribute("aria-hidden", "true");
			feishuSettingsDialog.inert = true;
			feishuSettingsDialog.hidden = true;
			state.feishuSettingsRestoreFocusElement = null;
		}

		async function saveFeishuSettings() {
			state.feishuSettingsSaving = true;
			setFeishuSettingsBusy();
			setFeishuSettingsStatus("正在保存飞书配置", "neutral");
			try {
				const response = await fetch("/v1/integrations/feishu/settings", {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(collectFeishuSettingsPayload()),
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(payload?.error?.message || "保存飞书配置失败");
				}
				state.feishuSettings = payload;
				renderFeishuSettingsDialog();
				setFeishuSettingsStatus("已保存。飞书 worker 会自动重连，不需要重启容器。", "success");
			} catch (error) {
				setFeishuSettingsStatus(error instanceof Error ? error.message : "保存飞书配置失败", "error");
			} finally {
				state.feishuSettingsSaving = false;
				setFeishuSettingsBusy();
			}
		}

		async function sendFeishuTestMessage() {
			state.feishuSettingsTesting = true;
			setFeishuSettingsBusy();
			setFeishuSettingsStatus("正在发送测试消息", "neutral");
			try {
				const response = await fetch("/v1/integrations/feishu/test-message", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ text: "UGK 飞书配置测试 " + new Date().toISOString() }),
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok || payload.delivered === false) {
					throw new Error(payload?.error?.message || "测试消息发送失败");
				}
				setFeishuSettingsStatus("测试消息已发送。", "success");
			} catch (error) {
				setFeishuSettingsStatus(error instanceof Error ? error.message : "测试消息发送失败", "error");
			} finally {
				state.feishuSettingsTesting = false;
				setFeishuSettingsBusy();
			}
		}

		${getPlaygroundLayoutControllerScript()}

		${getPlaygroundMobileShellControllerScript()}
		${getPlaygroundThemeControllerScript()}

		${getPlaygroundConversationControllerScript()}

		${getPlaygroundTranscriptRendererScript()}

		${getPlaygroundNotificationControllerScript()}

		${getPlaygroundConversationApiControllerScript()}

		${getPlaygroundConversationSyncControllerScript()}

		${getConnActivityApiScript()}


		${getPlaygroundConversationStateControllerScript()}

		${getPlaygroundStreamControllerScript()}

		${getPlaygroundAssetControllerScript()}

		${getPlaygroundActiveRunNormalizerScript()}
		${getPlaygroundConversationHistoryStoreScript()}

		${getConnActivityRendererScript()}
		${getPlaygroundTaskInboxControllerScript()}

		${getPlaygroundHistoryPaginationControllerScript()}

		${getPlaygroundProcessControllerScript()}

		function bindPlaygroundAssemblerEvents() {
			window.addEventListener("beforeunload", () => {
				state.pageUnloading = true;
				flushConversationHistoryPersist();
				disconnectNotificationStream();
			});
			window.addEventListener("pagehide", () => {
				state.pageUnloading = true;
				flushConversationHistoryPersist();
				disconnectNotificationStream();
			});
			window.addEventListener("focus", () => {
					if (state.connManagerLoadedOnce) { void syncConnManagerUnreadSummary({ silent: true }); }
			});
			document.addEventListener("visibilitychange", () => {
				if (!document.hidden) {
					if (state.connManagerLoadedOnce) { void syncConnManagerUnreadSummary({ silent: true }); }
				}
			});
			${getPlaygroundAssetEventHandlersScript()}

			sendButton.addEventListener("click", () => {
				void sendMessage();
			});

			interruptButton.addEventListener("click", () => {
				void interruptRun();
			});
			if (agentSelectorStatus) {
				agentSelectorStatus.addEventListener("mouseenter", () => {
					openAgentSwitcher();
				});
				agentSelectorStatus.addEventListener("mouseleave", () => {
					closeAgentSwitcher();
				});
			}
			if (agentSwitcherMeta) {
				agentSwitcherMeta.addEventListener("mouseenter", () => {
					openAgentSwitcher();
				});
				agentSwitcherMeta.addEventListener("mouseleave", () => {
					closeAgentSwitcher();
				});
			}

			openModelConfigButton.addEventListener("click", () => {
				void openModelConfigDialog(openModelConfigButton);
			});
			openFeishuSettingsButton.addEventListener("click", () => {
				void openFeishuSettingsDialog(openFeishuSettingsButton);
			});
			bindBrowserWorkbenchEvents();
			modelConfigClose.addEventListener("click", closeModelConfigDialog);
			modelConfigDialog.addEventListener("click", (event) => {
				if (event.target === modelConfigDialog) {
					closeModelConfigDialog();
				}
			});
			modelConfigProvider.addEventListener("change", () => {
				state.modelConfigSelectedProvider = modelConfigProvider.value;
				state.modelConfigSelectedModel = "";
				renderModelConfigModelOptions();
				setModelConfigStatus(getCurrentAgentId() === "main" ? "主 Agent 跟随全局模型设置，保存会更新全局默认。" : "这里保存到当前 Agent，后续新会话和后台继承该 Agent 的任务会使用它。", "neutral");
			});
			modelConfigModel.addEventListener("change", () => {
				state.modelConfigSelectedModel = modelConfigModel.value;
				setModelConfigBusy();
				setModelConfigStatus(getCurrentAgentId() === "main" ? "主 Agent 跟随全局模型设置，保存会更新全局默认。" : "这里保存到当前 Agent，后续新会话和后台继承该 Agent 的任务会使用它。", "neutral");
			});
			modelConfigTest.addEventListener("click", () => {
				void testModelConfigSelection();
			});
			modelConfigSave.addEventListener("click", () => {
				void saveModelConfigSelection();
			});
			feishuSettingsClose.addEventListener("click", closeFeishuSettingsDialog);
			feishuSettingsDialog.addEventListener("click", (event) => {
				if (event.target === feishuSettingsDialog) {
					closeFeishuSettingsDialog();
				}
			});
			feishuSettingsSave.addEventListener("click", () => {
				void saveFeishuSettings();
			});
			feishuSettingsTest.addEventListener("click", () => {
				void sendFeishuTestMessage();
			});

			${getPlaygroundTaskInboxEventHandlersScript()}
			bindAgentManagerEvents();
			${getConnActivityEventHandlersScript()}


			newConversationButton.addEventListener("click", () => {
					if (state.workspaceMode !== "chat") {
						closeInactiveWorkspacePanels("chat");
						setWorkspaceMode("chat");
						return;
					}
					void startNewConversation().then((created) => {
						if (created) {
							messageInput.focus();
						}
					});
				});
			${getPlaygroundMobileShellEventHandlersScript()}

			errorBannerClose.addEventListener("click", () => {
				clearError();
			});
			${getPlaygroundContextUsageEventHandlersScript()}

			conversationInput.addEventListener("change", () => {
				const nextConversationId = String(conversationInput.value || "").trim();
				if (nextConversationId === state.conversationId) {
					renderContextUsageBar();
					return;
				}
				void switchConversationOnServer(nextConversationId)
					.then((result) => {
						if (!result.switched) {
							showError(result.reason === "running" ? "当前任务未结束，不能切换产线" : "无法切换会话");
							conversationInput.value = state.conversationId;
							return;
						}
						return activateConversation(result.currentConversationId || result.conversationId, {
							skipCatalogSync: true,
							skipServerSwitch: true,
						});
					})
					.catch((error) => {
						conversationInput.value = state.conversationId;
						const messageText = error instanceof Error ? error.message : "切换会话失败";
						showError(messageText);
					});
			});

			messageInput.addEventListener("keydown", (event) => {
				if (event.key === "Enter" && !event.shiftKey) {
					event.preventDefault();
					void sendMessage();
				}
			});
			document.addEventListener("keydown", (event) => {
				if (event.key === "Escape" && state.conversationMenuOpenId) {
					closeConversationMenu();
					return;
				}
				if (event.key === "Escape" && state.assetModalOpen) {
					closeAssetLibrary();
				}
				if (event.key === "Escape" && state.taskInboxOpen) {
					closeTaskInbox();
				}
				if (event.key === "Escape" && state.modelConfigOpen) {
					closeModelConfigDialog();
				}
				if (event.key === "Escape" && state.feishuSettingsOpen) {
					closeFeishuSettingsDialog();
				}
				if (event.key === "Escape" && state.browserWorkbenchOpen) {
					closeBrowserWorkbench();
					return;
				}
				if (event.key === "Escape" && state.agentRulesEditorOpen) {
					closeAgentRulesEditor();
					return;
				}
				if (event.key === "Escape" && state.agentEditorOpen) {
					closeAgentEditor();
					return;
				}
				if (event.key === "Escape" && state.agentManagerOpen) {
					closeAgentManager();
					return;
				}
				if (handleConnActivityPanelEscapeKey(event)) {
					return;
				}

				if (event.key === "Escape" && !contextUsageDialog.hidden) {
					closeContextUsageDialog();
				}
				handleConnRunDetailsEscapeKey(event);

				if (event.key === "Escape" && state.mobileOverflowMenuOpen) {
					closeMobileOverflowMenu();
				}
				if (event.key === "Escape" && state.mobileConversationDrawerOpen) {
					closeMobileConversationDrawer();
				}
			});
			document.addEventListener("click", (event) => {
				if (
					state.conversationMenuOpenId &&
					!event.target?.closest?.(".conversation-item-shell")
				) {
					closeConversationMenu();
				}
			});

		}

		function initializePlaygroundAssembler() {
			conversationInput.value = state.conversationId;
			shell.dataset.home = "true";
			setTranscriptState("idle");
			setCommandStatus("STANDBY");
			renderContextUsageBar();
			renderRuntimeSummary();
			renderSelectedAssets();
			renderAssetPickerList();
			renderTaskInbox();
			renderTaskInboxToggleState();
			renderConnManager();
			void loadAgentStatusAndRenderCards();
			void syncRuntimeSummary();
			if (shouldOpenChatViewFromUrl()) {
				shell.dataset.home = "false";
				landingScreen.setAttribute("aria-hidden", "true");
				renderAgentSelector();
				void ensureCurrentConversation({ silent: true });
			}

			resetStreamingState();
			clearError();
			bindPlaygroundLayoutController();
			bindPlaygroundTranscriptRenderer();
			bindPlaygroundStreamController();
			bindPlaygroundWorkspaceController();
			bindPlaygroundAssemblerEvents();
		}

		initializePlaygroundAssembler();
	`;
}

export function getPlaygroundRenderBundle(): PlaygroundRenderBundle {
	return {
		styles: getPlaygroundStyles() + getPlaygroundAgentManagerStyles() + getPlaygroundBrowserWorkbenchStyles(),
		markedBrowserScript: getMarkedBrowserScript(),
		playgroundScript: getPlaygroundScript(),
		taskInboxView: getPlaygroundTaskInboxView(),
		connActivityDialogs: getConnActivityDialogs(),
		agentManagerDialogs: getPlaygroundAgentManagerDialogs(),
		browserWorkbenchDialogs: getPlaygroundBrowserWorkbenchDialogs(),
		assetDialogs: getPlaygroundAssetDialogs(),
	};
}

export function renderPlaygroundPage(): string {
	return renderPlaygroundHtml(getPlaygroundRenderBundle());
}
