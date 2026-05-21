export function getPlaygroundConversationControllerScript(): string {
	return `
		function ensureConversationId() {
			const previousConversationId = state.conversationId;
			if (!state.conversationId) {
				const currentCatalogItem = state.conversationCatalog.find((item) => item.conversationId);
				state.conversationId = currentCatalogItem?.conversationId || "";
			}
			conversationInput.value = state.conversationId;
			if (state.conversationId && state.conversationId !== previousConversationId) {
				void syncContextUsage(state.conversationId, { silent: true });
			}
		}

		function formatConversationTime(value) {
			const date = new Date(value || 0);
			if (!Number.isFinite(date.getTime())) {
				return "未知";
			}
			return date.toLocaleString("zh-CN", {
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
			});
		}

		const CONVERSATION_BACKGROUND_OPTIONS = [
			{ value: "", label: "默认" },
			{ value: "sky", label: "浅蓝" },
			{ value: "mint", label: "薄荷" },
			{ value: "peach", label: "蜜桃" },
			{ value: "pink", label: "浅粉" },
			{ value: "gray", label: "浅灰" },
		];

		function getConversationBackgroundClass(value) {
			const normalized = String(value || "").trim();
			return CONVERSATION_BACKGROUND_OPTIONS.some((option) => option.value === normalized) && normalized
				? "conversation-bg-" + normalized
				: "";
		}

		function closeConversationMenu() {
			if (!state.conversationMenuOpenId) {
				return;
			}
			state.conversationMenuOpenId = "";
			renderConversationDrawer();
		}

		function toggleConversationMenu(conversationId) {
			const nextConversationId = String(conversationId || "").trim();
			state.conversationMenuOpenId = state.conversationMenuOpenId === nextConversationId ? "" : nextConversationId;
			renderConversationDrawer();
		}

		function isDesktopViewport() {
			return window.matchMedia("(min-width: 641px)").matches;
		}

		const CONVERSATION_DESKTOP_ROW_HEIGHT = 60;
		const CONVERSATION_MOBILE_ROW_HEIGHT = 80;
		const CONVERSATION_VIRTUAL_OVERSCAN = 5;

		function computeVirtualWindow(scrollTop, viewportHeight, itemHeight, overscan, total) {
			if (total <= 0 || itemHeight <= 0) {
				return { startIndex: 0, endIndex: -1, topSpacer: 0, bottomSpacer: 0 };
			}
			const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
			const endIndex = Math.min(total - 1, Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan);
			const topSpacer = startIndex * itemHeight;
			const bottomSpacer = Math.max(0, (total - endIndex - 1) * itemHeight);
			return { startIndex, endIndex, topSpacer, bottomSpacer };
		}

		let conversationVirtualScrollRaf = 0;

		function scheduleConversationVirtualScroll(container) {
			if (conversationVirtualScrollRaf) {
				cancelAnimationFrame(conversationVirtualScrollRaf);
				conversationVirtualScrollRaf = 0;
				return;
			}
			conversationVirtualScrollRaf = window.requestAnimationFrame(() => {
				conversationVirtualScrollRaf = 0;
				renderConversationListInto(container);
			});
		}

		function getConversationRowHeight() {
			return isDesktopViewport() ? CONVERSATION_DESKTOP_ROW_HEIGHT : CONVERSATION_MOBILE_ROW_HEIGHT;
		}

		function renderConversationListInto(container) {
			if (!container) {
				return;
			}
			const savedScrollTop = container.scrollTop;
			container.innerHTML = "";
			const catalog = Array.isArray(state.conversationCatalog) ? state.conversationCatalog : [];
			if (catalog.length === 0) {
				const empty = document.createElement("div");
				empty.className = "mobile-conversation-empty";
				empty.textContent = "\\u8fd8\\u6ca1\\u6709\\u5386\\u53f2\\u4f1a\\u8bdd\\u3002\\u70b9\\u65b0\\u4f1a\\u8bdd\\u540e\\uff0c\\u8fd9\\u91cc\\u4f1a\\u51fa\\u73b0\\u65b0\\u7684\\u4ea7\\u7ebf\\u3002";
				container.appendChild(empty);
				return;
			}


			const rowHeight = getConversationRowHeight();
			const vw = computeVirtualWindow(
				container.scrollTop,
				container.clientHeight,
				rowHeight,
				CONVERSATION_VIRTUAL_OVERSCAN,
				catalog.length
			);

			// Ensure menu-open and active items are always visible
			const menuOpenIndex = state.conversationMenuOpenId
				? catalog.findIndex((item) => item.conversationId === state.conversationMenuOpenId)
				: -1;
			const activeIndex = state.conversationId
				? catalog.findIndex((item) => item.conversationId === state.conversationId)
				: -1;
			let startIndex = vw.startIndex;
			let endIndex = vw.endIndex;
			if (menuOpenIndex >= 0 && (menuOpenIndex < startIndex || menuOpenIndex > endIndex)) {
				startIndex = Math.min(startIndex, menuOpenIndex);
				endIndex = Math.max(endIndex, menuOpenIndex);
			}
			if (activeIndex >= 0 && (activeIndex < startIndex || activeIndex > endIndex)) {
				startIndex = Math.min(startIndex, activeIndex);
				endIndex = Math.max(endIndex, activeIndex);
			}

			const topSpacer = document.createElement("div");
			topSpacer.className = "conversation-virtual-spacer-top";
			topSpacer.style.height = vw.topSpacer + "px";
			container.appendChild(topSpacer);

			for (let i = startIndex; i <= endIndex; i++) {
				const item = catalog[i];
				const shell = document.createElement("div");
				shell.className = "conversation-item-shell";
				if (item.pinned) {
					shell.classList.add("is-pinned");
				}
				const backgroundClass = getConversationBackgroundClass(item.backgroundColor);
				if (backgroundClass) {
					shell.classList.add(backgroundClass);
				}
				const button = document.createElement("button");
				button.type = "button";
				button.className = "mobile-conversation-item";
				button.dataset.conversationId = item.conversationId;
				if (item.conversationId === state.conversationId) {
					button.classList.add("is-active");
				}
				const hasPendingSwitch = Object.keys(state.conversationSwitchPendingById || {}).length > 0;
				const switching = Boolean(state.conversationSwitchPendingById?.[item.conversationId]);
				button.disabled = state.loading || hasPendingSwitch;
				button.innerHTML =
					'<span class="mobile-conversation-title"></span>' +
					'<span class="mobile-conversation-preview"></span>' +
					'<span class="mobile-conversation-meta"><span></span><span></span></span>';
				button.querySelector(".mobile-conversation-title").textContent = item.title || "\\u65b0\\u4f1a\\u8bdd";
				button.querySelector(".mobile-conversation-preview").textContent = item.preview || "\\u6682\\u65e0\\u6458\\u8981";
				const metaNodes = button.querySelectorAll(".mobile-conversation-meta span");
				metaNodes[0].textContent = item.running ? "\\u8fd0\\u884c\\u4e2d" : item.pinned ? "已置顶" : formatConversationTime(item.updatedAt);
				metaNodes[1].textContent = item.messageCount + " \\u6761";
				button.addEventListener("click", () => {
					void selectConversationFromDrawer(item.conversationId);
				});
				shell.appendChild(button);
				const menuButton = document.createElement("button");
				menuButton.type = "button";
				menuButton.className = "conversation-item-menu-trigger";
				menuButton.textContent = "⋯";
				menuButton.setAttribute("aria-haspopup", "menu");
				menuButton.setAttribute("aria-expanded", state.conversationMenuOpenId === item.conversationId ? "true" : "false");
				menuButton.setAttribute("aria-label", "打开会话菜单 " + (item.title || item.conversationId));
				menuButton.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					toggleConversationMenu(item.conversationId);
				});
				button.appendChild(menuButton);
				if (state.conversationMenuOpenId === item.conversationId) {
					shell.appendChild(renderConversationItemMenu(item, menuButton, {
						disabled: state.loading || item.running || hasPendingSwitch || switching,
					}));
				}
				container.appendChild(shell);
			}

			const bottomSpacer = document.createElement("div");
			bottomSpacer.className = "conversation-virtual-spacer-bottom";
			bottomSpacer.style.height = vw.bottomSpacer + "px";
			container.appendChild(bottomSpacer);
			container.scrollTop = savedScrollTop;
		}

		function createConversationMenuButton(options) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "conversation-menu-item" + (options.danger ? " danger" : "");
			button.setAttribute("role", "menuitem");
			button.disabled = Boolean(options.disabled);
			button.innerHTML = '<span class="conversation-menu-icon"></span><span></span>';
			button.querySelector(".conversation-menu-icon").textContent = options.icon || "";
			button.querySelector("span:last-child").textContent = options.label;
			button.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				if (button.disabled) {
					return;
				}
				options.onClick?.();
			});
			return button;
		}

		function renderConversationItemMenu(item, restoreFocusElement, options) {
			const menu = document.createElement("div");
			menu.className = "conversation-item-menu";
			menu.setAttribute("role", "menu");
			const pendingAction = state.conversationActionPendingById?.[item.conversationId] || "";
			menu.addEventListener("click", (event) => {
				event.stopPropagation();
			});

			menu.appendChild(createConversationMenuButton({
				icon: "✎",
				label: pendingAction === "rename" ? "保存中" : "重命名",
				disabled: options?.disabled || Boolean(pendingAction),
				onClick: () => void requestRenameConversation(item, restoreFocusElement),
			}));
			menu.appendChild(createConversationMenuButton({
				icon: item.pinned ? "⌄" : "⌃",
				label: item.pinned ? "取消置顶" : "置顶",
				disabled: options?.disabled || Boolean(pendingAction),
				onClick: () => void requestUpdateConversation(item.conversationId, { pinned: !item.pinned }),
			}));

			const colorGroup = document.createElement("div");
			colorGroup.className = "conversation-menu-color-group";
			const colorLabel = document.createElement("span");
			colorLabel.textContent = "背景颜色";
			colorGroup.appendChild(colorLabel);
			const colorList = document.createElement("div");
			colorList.className = "conversation-menu-colors";
			for (const colorOption of CONVERSATION_BACKGROUND_OPTIONS) {
				const swatch = document.createElement("button");
				swatch.type = "button";
				swatch.className = "conversation-color-swatch" + (colorOption.value ? " color-" + colorOption.value : " color-default");
				if ((item.backgroundColor || "") === colorOption.value) {
					swatch.classList.add("is-selected");
				}
				swatch.disabled = Boolean(options?.disabled || pendingAction);
				swatch.setAttribute("aria-label", "设置背景颜色为" + colorOption.label);
				swatch.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					if (swatch.disabled) {
						return;
					}
					void requestUpdateConversation(item.conversationId, { backgroundColor: colorOption.value });
				});
				colorList.appendChild(swatch);
			}
			colorGroup.appendChild(colorList);
			menu.appendChild(colorGroup);

			menu.appendChild(createConversationMenuButton({
				icon: "×",
				label: pendingAction === "delete" ? "删除中" : "删除",
				danger: true,
				disabled: options?.disabled || Boolean(pendingAction),
				onClick: () => void requestDeleteConversation(item, restoreFocusElement),
			}));
			return menu;
		}

		function renderConversationDrawer() {
			if (isDesktopViewport()) {
				renderConversationListInto(desktopConversationList);
				mobileConversationList.innerHTML = "";
			} else if (state.mobileConversationDrawerOpen) {
				renderConversationListInto(mobileConversationList);
				desktopConversationList.innerHTML = "";
			} else {
				mobileConversationList.innerHTML = "";
				desktopConversationList.innerHTML = "";
			}
		}

		function normalizeConversationCatalogItem(item) {
			const conversationId = String(item?.conversationId || "").trim();
			if (!conversationId) {
				return null;
			}

			return {
				conversationId,
				title: String(item?.title || "新会话").trim() || "新会话",
				preview: String(item?.preview || "").trim(),
				messageCount: Number.isFinite(item?.messageCount) ? Math.max(0, Number(item.messageCount)) : 0,
				createdAt: typeof item?.createdAt === "string" ? item.createdAt : new Date(0).toISOString(),
				updatedAt: typeof item?.updatedAt === "string" ? item.updatedAt : new Date(0).toISOString(),
				running: Boolean(item?.running),
				pinned: item?.pinned === true,
				backgroundColor: String(item?.backgroundColor || "").trim(),
			};
		}

		function sortConversationCatalog() {
			state.conversationCatalog.sort((left, right) => {
				if (Boolean(left?.pinned) !== Boolean(right?.pinned)) {
					return left?.pinned ? -1 : 1;
				}
				return String(right?.updatedAt || "").localeCompare(String(left?.updatedAt || ""));
			});
		}

		const CONVERSATION_CATALOG_FRESH_MS = 1600;

		function getConversationCatalogSnapshot() {
			return {
				currentConversationId: state.conversationId,
				conversations: state.conversationCatalog,
			};
		}

		function markConversationCatalogFresh() {
			state.conversationCatalogSyncedAt = Date.now();
		}

		function abortConversationCatalogSync() {
			const abortController = state.conversationCatalogAbortController;
			state.conversationCatalogAbortController = null;
			state.conversationCatalogSyncPromise = null;
			state.conversationCatalogSyncing = false;
			if (abortController && !abortController.signal.aborted) {
				abortController.abort();
			}
		}

		function releaseConversationCatalogSync(syncPromise, abortController) {
			if (state.conversationCatalogSyncPromise === syncPromise) {
				state.conversationCatalogSyncPromise = null;
				state.conversationCatalogSyncing = false;
			}
			if (abortController && state.conversationCatalogAbortController === abortController) {
				state.conversationCatalogAbortController = null;
			}
		}

		function isConversationCatalogAbortError(error) {
			return (
				error?.name === "AbortError" ||
				error?.code === 20 ||
				(typeof error?.message === "string" && error.message.toLowerCase().includes("abort"))
			);
		}

		function invalidateConversationCatalog() {
			state.conversationCatalogSyncedAt = 0;
			abortConversationCatalogSync();
		}

		async function fetchConversationCatalog(options) {
			const response = await fetch(getAgentApiPath("/chat/conversations"), {
				method: "GET",
				headers: { accept: "application/json" },
				signal: options?.signal,
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				const errorMessage = payload?.error?.message || payload?.message || "无法获取会话列表";
				throw new Error(errorMessage);
			}

			return {
				currentConversationId: String(payload?.currentConversationId || "").trim(),
				conversations: Array.isArray(payload?.conversations)
					? payload.conversations.map(normalizeConversationCatalogItem).filter(Boolean)
					: [],
			};
		}

		async function createConversationOnServer() {
			const requestOptions = {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json",
				},
				body: JSON.stringify({}),
			};
			const response = await fetch(getAgentApiPath("/chat/conversations"), requestOptions);
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				const errorMessage = payload?.error?.message || payload?.message || "无法开启新会话";
				throw new Error(errorMessage);
			}

			return {
				conversationId: String(payload?.conversationId || "").trim(),
				currentConversationId: String(payload?.currentConversationId || payload?.conversationId || "").trim(),
				created: payload?.created === true,
				reason: typeof payload?.reason === "string" ? payload.reason : undefined,
			};
		}

		async function switchConversationOnServer(conversationId) {
			const nextConversationId = String(conversationId || "").trim();
			const response = await fetch(getAgentApiPath("/chat/current"), {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json",
				},
				body: JSON.stringify({
					conversationId: nextConversationId,
				}),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				const errorMessage = payload?.error?.message || payload?.message || "无法切换会话";
				throw new Error(errorMessage);
			}

			return {
				conversationId: String(payload?.conversationId || nextConversationId).trim(),
				currentConversationId: String(payload?.currentConversationId || payload?.conversationId || nextConversationId).trim(),
				switched: payload?.switched === true,
				reason: typeof payload?.reason === "string" ? payload.reason : undefined,
			};
		}

		async function deleteConversationOnServer(conversationId) {
			const targetConversationId = String(conversationId || "").trim();
			const response = await fetch(getAgentApiPath("/chat/conversations/" + encodeURIComponent(targetConversationId)), {
				method: "DELETE",
				headers: {
					accept: "application/json",
				},
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				const errorMessage = payload?.error?.message || payload?.message || "无法删除会话";
				throw new Error(errorMessage);
			}

			return {
				conversationId: String(payload?.conversationId || targetConversationId).trim(),
				currentConversationId: String(payload?.currentConversationId || "").trim(),
				deleted: payload?.deleted === true,
				reason: typeof payload?.reason === "string" ? payload.reason : undefined,
			};
		}

		function applyConversationCatalog(payload) {
			const currentConversationId = String(payload?.currentConversationId || "").trim();
			state.conversationCatalog = Array.isArray(payload?.conversations)
				? payload.conversations.map(normalizeConversationCatalogItem).filter(Boolean)
				: [];
			if (currentConversationId && !state.conversationCatalog.some((item) => item.conversationId === currentConversationId)) {
				state.conversationCatalog.unshift({
					conversationId: currentConversationId,
					title: "新会话",
					preview: "",
					messageCount: 0,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					running: false,
					pinned: false,
					backgroundColor: "",
				});
			}
			sortConversationCatalog();
			markConversationCatalogFresh();
			renderConversationDrawer();
			return currentConversationId;
		}

		function upsertConversationCatalogItem(item, options) {
			const normalized = normalizeConversationCatalogItem(item);
			if (!normalized) {
				return "";
			}

			const existingIndex = state.conversationCatalog.findIndex(
				(entry) => entry.conversationId === normalized.conversationId,
			);
			const existingEntry = existingIndex >= 0 ? state.conversationCatalog[existingIndex] : null;
			const merged = {
				conversationId: normalized.conversationId,
				title: normalized.title || existingEntry?.title || "新会话",
				preview: normalized.preview || existingEntry?.preview || "",
				messageCount: normalized.messageCount,
				createdAt: normalized.createdAt || existingEntry?.createdAt || new Date().toISOString(),
				updatedAt: normalized.updatedAt || existingEntry?.updatedAt || new Date().toISOString(),
				running: normalized.running,
				pinned: normalized.pinned,
				backgroundColor: normalized.backgroundColor,
			};

			if (existingIndex >= 0) {
				state.conversationCatalog.splice(existingIndex, 1);
			}

			if (options?.isNew || options?.prepend) {
				state.conversationCatalog.unshift(merged);
			} else {
				state.conversationCatalog.push(merged);
			}
			sortConversationCatalog();

			renderConversationDrawer();
			return merged.conversationId;
		}

		function removeConversationCatalogItem(conversationId) {
			state.conversationCatalog = state.conversationCatalog.filter(
				(item) => item?.conversationId !== conversationId,
			);
			renderConversationDrawer();
		}

		async function updateConversationOnServer(conversationId, patch) {
			const targetConversationId = String(conversationId || "").trim();
			const response = await fetch(getAgentApiPath("/chat/conversations/" + encodeURIComponent(targetConversationId)), {
				method: "PATCH",
				headers: {
					"content-type": "application/json",
					accept: "application/json",
				},
				body: JSON.stringify(patch || {}),
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				const errorMessage = payload?.error?.message || payload?.message || "无法更新会话";
				throw new Error(errorMessage);
			}

			return {
				conversationId: String(payload?.conversationId || targetConversationId).trim(),
				updated: payload?.updated === true,
				reason: typeof payload?.reason === "string" ? payload.reason : undefined,
				conversation: payload?.conversation ? normalizeConversationCatalogItem(payload.conversation) : null,
			};
		}

		async function requestUpdateConversation(conversationId, patch) {
			if (!conversationId) {
				return;
			}
			try {
				const result = await updateConversationOnServer(conversationId, patch);
				if (!result.updated) {
					showError(result.reason === "not_found" ? "这个会话不存在" : "无法更新会话");
					return;
				}
				if (result.conversation) {
					upsertConversationCatalogItem(result.conversation);
				}
				state.conversationMenuOpenId = "";
				invalidateConversationCatalog();
				void syncConversationCatalog({ silent: true, activateCurrent: false, force: true });
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "更新会话失败";
				showError(messageText);
			} finally {
				renderConversationDrawer();
			}
		}

		async function requestRenameConversation(item, restoreFocusElement) {
			if (!item?.conversationId) {
				return;
			}
			const nextTitle = window.prompt("重命名会话", item.title || "新会话");
			if (nextTitle === null) {
				return;
			}
			const trimmedTitle = nextTitle.trim();
			if (!trimmedTitle) {
				showError("会话名称不能为空");
				restoreFocusElement?.focus?.();
				return;
			}
			state.conversationActionPendingById = {
				...(state.conversationActionPendingById || {}),
				[item.conversationId]: "rename",
			};
			renderConversationDrawer();
			try {
				await requestUpdateConversation(item.conversationId, { title: trimmedTitle });
			} finally {
				const nextPending = { ...(state.conversationActionPendingById || {}) };
				delete nextPending[item.conversationId];
				state.conversationActionPendingById = nextPending;
				renderConversationDrawer();
			}
		}

		async function syncConversationCatalog(options) {
			const hasFreshCatalog =
				!options?.force &&
				state.conversationCatalog.length > 0 &&
				Date.now() - Number(state.conversationCatalogSyncedAt || 0) < CONVERSATION_CATALOG_FRESH_MS;
			if (hasFreshCatalog) {
				return getConversationCatalogSnapshot();
			}

			if (options?.force) {
				abortConversationCatalogSync();
			}

			if (state.conversationCatalogSyncPromise) {
				return await state.conversationCatalogSyncPromise;
			}

			state.conversationCatalogSyncing = true;
			const abortController = typeof AbortController === "function" ? new AbortController() : null;
			state.conversationCatalogAbortController = abortController;
			let syncPromise;
			syncPromise = (async () => {
				try {
					const payload = await fetchConversationCatalog({
						signal: abortController?.signal,
					});
					const currentConversationId = applyConversationCatalog(payload);
					if (
						currentConversationId &&
						options?.activateCurrent !== false &&
						currentConversationId !== state.conversationId
					) {
						await activateConversation(currentConversationId, {
							silent: options?.silent,
							skipCatalogSync: true,
							skipServerSwitch: true,
						});
					}
					return {
						currentConversationId: currentConversationId || state.conversationId,
						conversations: state.conversationCatalog,
					};
				} catch (error) {
					if (isConversationCatalogAbortError(error)) {
						return getConversationCatalogSnapshot();
					}
					if (!options?.silent) {
						const messageText = error instanceof Error ? error.message : "无法同步会话列表";
						showError(messageText);
					}
					return getConversationCatalogSnapshot();
				} finally {
					releaseConversationCatalogSync(syncPromise, abortController);
				}
			})();
			state.conversationCatalogSyncPromise = syncPromise;
			return await syncPromise;
		}

		function findRunningConversationInCatalog(catalog) {
			const conversations = Array.isArray(catalog?.conversations) ? catalog.conversations : [];
			return conversations.find((conversation) => conversation?.running)?.conversationId || "";
		}

		async function resolveServerActiveConversation(options) {
			const catalog = await syncConversationCatalog({
				silent: options?.silent !== false,
				activateCurrent: false,
				force: true,
			});
			const runningConversationId = String(findRunningConversationInCatalog(catalog) || "").trim();
			if (!runningConversationId) {
				return {
					conversationId: "",
					running: false,
					activeRun: null,
				};
			}
			if (options?.activate !== false && runningConversationId !== state.conversationId) {
				const activated = await activateConversation(runningConversationId, {
					silent: options?.silent !== false,
					skipCatalogSync: true,
					skipServerSwitch: true,
				});
				if (!activated) {
					return {
						conversationId: "",
						running: false,
						activeRun: null,
					};
				}
			}
			const statePayload = await restoreConversationHistoryFromServer(runningConversationId, {
				silent: true,
				clearIfIdle: true,
				attachIfRunning: true,
			});
			const activeRun = normalizeActiveRun(statePayload?.activeRun || state.conversationState?.activeRun);
			const running = Boolean(statePayload?.running || activeRun?.loading);
			if (running) {
				setLoading(true);
				void attachActiveRunEventStream(runningConversationId);
			}
			return {
				conversationId: runningConversationId,
				running,
				activeRun,
			};
		}

		async function ensureCurrentConversation(options) {
			const catalog = await syncConversationCatalog({
				silent: options?.silent,
				activateCurrent: false,
			});
			const currentConversationId = String(catalog.currentConversationId || state.conversationId || "").trim();
			if (!currentConversationId) {
				return "";
			}
			if (options?.activate !== false && currentConversationId !== state.conversationId) {
				await activateConversation(currentConversationId, {
					silent: options?.silent,
					skipCatalogSync: true,
					skipServerSwitch: true,
				});
			}
			return currentConversationId;
		}

		async function activateConversation(conversationId, options) {
			const nextConversationId = String(conversationId || "").trim();
			if (!nextConversationId) {
				return false;
			}
			if (state.loading && nextConversationId !== state.conversationId) {
				if (!options?.silent) {
					showError("当前任务未结束，不能切换产线");
				}
				return false;
			}

			stopActiveRunEventStream();
			invalidateConversationSyncOwnership(nextConversationId);
			state.conversationId = nextConversationId;
			conversationInput.value = nextConversationId;
			sessionFile.textContent = "尚未分配";
			state.contextUsage = null;
			state.conversationState = null;
			resetStreamingState();
			clearError();
			renderConversationDrawer();
			markConversationCatalogFresh();
			restoreConversationHistory(nextConversationId);
			void restoreConversationHistoryFromServer(nextConversationId, {
				silent: true,
				clearIfIdle: true,
				attachIfRunning: true,
			});
			if (!options?.skipCatalogSync) {
				void syncConversationCatalog({
					silent: true,
					activateCurrent: false,
				});
			}
			return true;
		}

		function isCurrentConversationBlank() {
			const currentConversationId = String(state.conversationId || "").trim();
			if (!currentConversationId || state.loading || state.conversationState?.activeRun) {
				return false;
			}

			const currentCatalogItem = state.conversationCatalog.find(
				(item) => item?.conversationId === currentConversationId,
			);
			const catalogMessageCount = Number(currentCatalogItem?.messageCount || 0);
			const stateMessages = Array.isArray(state.conversationState?.viewMessages)
				? state.conversationState.viewMessages
				: Array.isArray(state.conversationState?.messages)
					? state.conversationState.messages
					: [];
			const visibleMessageCount = stateMessages.length;
			const hasDraft =
				String(messageInput.value || "").trim().length > 0 ||
				Number(fileInput.files?.length || 0) > 0 ||
				(Array.isArray(state.selectedAssetRefs) && state.selectedAssetRefs.length > 0);

			return (
				!hasDraft &&
				catalogMessageCount === 0 &&
				visibleMessageCount === 0 &&
				renderedMessages.size === 0
			);
		}

		async function selectConversationFromDrawer(conversationId) {
				if (state.workspaceMode !== "chat") {
					closeInactiveWorkspacePanels("chat");
					setWorkspaceMode("chat");
				}
			const nextConversationId = String(conversationId || "").trim();
			if (!nextConversationId || nextConversationId === state.conversationId) {
				closeMobileConversationDrawer();
				return;
			}
			if (state.loading) {
				showError("当前任务未结束，不能切换产线");
				renderConversationDrawer();
				return;
			}

			if (Object.keys(state.conversationSwitchPendingById || {}).length > 0) {
				closeMobileConversationDrawer();
				return;
			}

			closeMobileConversationDrawer();
			state.conversationSwitchPendingById = {
				...(state.conversationSwitchPendingById || {}),
				[nextConversationId]: true,
			};
			renderConversationDrawer();
			try {
				const result = await switchConversationOnServer(nextConversationId);
				if (!result.switched) {
					showError(result.reason === "running" ? "当前任务未结束，不能切换产线" : "无法切换到这个会话");
					invalidateConversationCatalog();
					await syncConversationCatalog({ silent: true, activateCurrent: false, force: true });
					return;
				}
				markConversationCatalogFresh();
				await activateConversation(result.currentConversationId || result.conversationId, {
					skipCatalogSync: true,
					skipServerSwitch: true,
				});
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "切换会话失败";
				showError(messageText);
			} finally {
				const nextPending = { ...(state.conversationSwitchPendingById || {}) };
				delete nextPending[nextConversationId];
				state.conversationSwitchPendingById = nextPending;
				renderConversationDrawer();
			}
		}

		async function requestDeleteConversation(item, restoreFocusElement) {
			if (!item?.conversationId) {
				return;
			}
			if (state.loading || item.running) {
				showError("当前任务未结束，不能删除会话");
				return;
			}
			const confirmed = await openConfirmDialog({
				title: "删除会话？",
				description:
					"会话：" +
					(item.title || item.conversationId) +
					"\\n\\n删除后这条历史会话会从列表移除，这个操作不能撤销。",
				confirmText: "删除",
				cancelText: "取消",
				tone: "danger",
				restoreFocusElement,
			});
			if (!confirmed) {
				return;
			}

			state.conversationActionPendingById = {
				...(state.conversationActionPendingById || {}),
				[item.conversationId]: "delete",
			};
			renderConversationDrawer();
			try {
				const result = await deleteConversationOnServer(item.conversationId);
				if (!result.deleted) {
					showError(result.reason === "running" ? "当前任务未结束，不能删除会话" : "无法删除这个会话");
					return;
				}
				removeConversationCatalogItem(item.conversationId);
				markConversationCatalogFresh();
				if (state.conversationId === item.conversationId) {
					const nextConversationId = result.currentConversationId;
					if (nextConversationId && !state.conversationCatalog.some((entry) => entry.conversationId === nextConversationId)) {
						const optimisticTimestamp = new Date().toISOString();
						upsertConversationCatalogItem(
							{
								conversationId: nextConversationId,
								title: "新会话",
								preview: "",
								messageCount: 0,
								createdAt: optimisticTimestamp,
								updatedAt: optimisticTimestamp,
								running: false,
								pinned: false,
								backgroundColor: "",
							},
							{ prepend: true },
						);
					}
					if (nextConversationId) {
						await activateConversation(nextConversationId, {
							skipCatalogSync: true,
							skipServerSwitch: true,
						});
					}
				}
				invalidateConversationCatalog();
				void syncConversationCatalog({ silent: true, activateCurrent: false, force: true });
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "删除会话失败";
				showError(messageText);
			} finally {
				const nextPending = { ...(state.conversationActionPendingById || {}) };
				delete nextPending[item.conversationId];
				state.conversationActionPendingById = nextPending;
				renderConversationDrawer();
			}
		}

		async function startNewConversation() {
			clearError();
			if (state.loading) {
				showError("当前任务未结束，不能开启新产线");
				return false;
			}

			if (isCurrentConversationBlank()) {
				return true;
			}

			if (state.conversationCreatePending) {
				return false;
			}

			state.conversationCreatePending = true;
			newConversationButton.disabled = true;
			mobileNewConversationButton.disabled = true;
			try {
				let createResult;
				try {
					createResult = await createConversationOnServer();
				} catch (error) {
					const messageText = error instanceof Error ? error.message : "无法开启新会话";
					showError(messageText);
					return false;
				}

				if (!createResult?.created) {
					if (createResult?.reason === "running") {
						showError("当前任务未结束，不能开启新产线");
					} else {
						showError("无法开启新会话");
					}
					return false;
				}

				const nextConversationId = createResult.currentConversationId || createResult.conversationId;
				const optimisticTimestamp = new Date().toISOString();
				upsertConversationCatalogItem(
					{
						conversationId: nextConversationId,
						title: "新会话",
						preview: "",
						messageCount: 0,
						createdAt: optimisticTimestamp,
						updatedAt: optimisticTimestamp,
						running: false,
						pinned: false,
						backgroundColor: "",
					},
					{ isNew: true },
				);
				markConversationCatalogFresh();
				clearSelectedFiles();
				clearSelectedAssetRefs();
				const activated = await activateConversation(nextConversationId, {
					skipCatalogSync: true,
					skipServerSwitch: true,
				});
				return activated;
			} finally {
				state.conversationCreatePending = false;
				newConversationButton.disabled = state.loading;
				mobileNewConversationButton.disabled = state.loading;
			}
		}
	`;
}
