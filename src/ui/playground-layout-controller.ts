export function getPlaygroundLayoutConstantsScript(): string {
	return `
		const LAYOUT_SYNC_DELAY_MS = 80;
		const RESUME_SYNC_COOLDOWN_MS = 900;
		const RESUME_SYNC_STALE_MS = 12000;
		const TRANSCRIPT_BOTTOM_SYNC_COOLDOWN_MS = 160;
	`;
}

export function getPlaygroundLayoutControllerScript(): string {
	return `
		function syncConversationLayout() {
			const chatStageRect = chatStage.getBoundingClientRect();
			const commandDeckRect = commandDeck.getBoundingClientRect();
			const commandDeckWidth = Math.round(commandDeckRect.width || 0);
			if (commandDeckWidth > 0) {
				shell.style.setProperty("--conversation-width", commandDeckWidth + "px");
			}
			const commandDeckOffset = Math.ceil(chatStageRect.bottom - commandDeckRect.top || 0);
			if (commandDeckOffset > 0) {
				shell.style.setProperty("--command-deck-offset", commandDeckOffset + "px");
			}
			const commandDeckToastOffset = Math.ceil(window.innerHeight - commandDeckRect.top || 0);
			if (commandDeckToastOffset > 0) {
				shell.style.setProperty("--command-deck-toast-offset", commandDeckToastOffset + "px");
			}
			const commandDeckCenterX = Math.round(commandDeckRect.left + commandDeckRect.width / 2);
			if (commandDeckCenterX > 0) {
				shell.style.setProperty("--command-deck-center-x", commandDeckCenterX + "px");
			}
		}

		function scheduleConversationLayoutSync(options) {
			if (state.layoutSyncRaf) {
				return;
			}
			const delay = options?.immediate ? 0 : LAYOUT_SYNC_DELAY_MS;
			if (state.layoutSyncTimer !== null) {
				window.clearTimeout(state.layoutSyncTimer);
				state.layoutSyncTimer = null;
			}
			const queueFrame = () => {
				state.layoutSyncRaf = window.requestAnimationFrame(() => {
					state.layoutSyncRaf = 0;
					syncConversationLayout();
				});
			};
			if (delay <= 0) {
				queueFrame();
				return;
			}
			state.layoutSyncTimer = window.setTimeout(() => {
				state.layoutSyncTimer = null;
				queueFrame();
			}, delay);
		}

		function syncConversationWidth() {
			scheduleConversationLayoutSync({ immediate: true });
		}

		function syncComposerTextareaHeight() {
			const style = window.getComputedStyle(messageInput);
			const lineHeight = Number.parseFloat(style.lineHeight) || 20;
			const paddingTop = Number.parseFloat(style.paddingTop) || 0;
			const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
			const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
			const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;
			const minHeight =
				Number.parseFloat(style.minHeight) ||
				Math.ceil(lineHeight + paddingTop + paddingBottom + borderTop + borderBottom);
			const maxLines = 10;
			const maxHeight = Math.ceil(lineHeight * maxLines + paddingTop + paddingBottom + borderTop + borderBottom);
			const expectedSingleLineScrollHeight = Math.ceil(lineHeight + paddingTop + paddingBottom);
			const singleLineTolerance = Math.max(6, lineHeight * 0.3);
			messageInput.style.height = "auto";
			const scrollHeight = messageInput.scrollHeight;
			const rawValue = String(messageInput.value || "");
			const hasExplicitLineBreak = rawValue.includes("\\n");
			const shouldUseMinHeight =
				rawValue.trim().length === 0 ||
				(!hasExplicitLineBreak && scrollHeight <= expectedSingleLineScrollHeight + singleLineTolerance);
			const contentHeight = Math.ceil(scrollHeight + borderTop + borderBottom);
			const nextHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);
			messageInput.style.height = (shouldUseMinHeight ? minHeight : nextHeight) + "px";
			messageInput.style.overflowY = !shouldUseMinHeight && contentHeight > maxHeight ? "auto" : "hidden";
			scheduleConversationLayoutSync();
		}

		function setTranscriptState(next) {
			shell.dataset.transcriptState = next === "active" ? "active" : "idle";
			scheduleConversationLayoutSync();
		}

		function isTranscriptNearBottom() {
			const remaining = transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop;
			return remaining <= TRANSCRIPT_FOLLOW_THRESHOLD_PX;
		}

		function updateScrollToBottomButton() {
			const shouldShow =
				!state.autoFollowTranscript &&
				transcript.scrollHeight > transcript.clientHeight + TRANSCRIPT_FOLLOW_THRESHOLD_PX;
			scrollToBottomButton.hidden = !shouldShow;
			scrollToBottomButton.classList.toggle("visible", shouldShow);
		}

		function cancelScheduledTranscriptAutoScroll() {
			if (state.transcriptScrollTimer !== null) {
				window.clearTimeout(state.transcriptScrollTimer);
				state.transcriptScrollTimer = null;
			}
			if (state.transcriptScrollRaf) {
				window.cancelAnimationFrame(state.transcriptScrollRaf);
				state.transcriptScrollRaf = 0;
			}
		}

		function syncTranscriptFollowState() {
			state.autoFollowTranscript = isTranscriptNearBottom();
			if (!state.autoFollowTranscript) {
				cancelScheduledTranscriptAutoScroll();
			}
			updateScrollToBottomButton();
		}

		function scrollTranscriptToBottom(options) {
			if (!(options?.force || state.autoFollowTranscript || isTranscriptNearBottom())) {
				updateScrollToBottomButton();
				return;
			}

			const applyScroll = () => {
				state.transcriptScrollRaf = 0;
				transcript.scrollTop = transcript.scrollHeight;
				state.lastTranscriptScrollAt = Date.now();
				state.autoFollowTranscript = true;
				updateScrollToBottomButton();
			};

			if (options?.force) {
				if (state.transcriptScrollTimer !== null) {
					window.clearTimeout(state.transcriptScrollTimer);
					state.transcriptScrollTimer = null;
				}
				if (state.transcriptScrollRaf) {
					window.cancelAnimationFrame(state.transcriptScrollRaf);
					state.transcriptScrollRaf = 0;
				}
				applyScroll();
				return;
			}

			if (state.transcriptScrollRaf || state.transcriptScrollTimer !== null) {
				return;
			}

			const elapsed = Date.now() - state.lastTranscriptScrollAt;
			const delay = Math.max(0, TRANSCRIPT_BOTTOM_SYNC_COOLDOWN_MS - elapsed);
			const queueScroll = () => {
				state.transcriptScrollTimer = null;
				state.transcriptScrollRaf = window.requestAnimationFrame(applyScroll);
			};
			if (delay > 0) {
				state.transcriptScrollTimer = window.setTimeout(queueScroll, delay);
			} else {
				queueScroll();
			}
		}

		function mergeResumeSyncOptions(current, next) {
			const previous = current && typeof current === "object" ? current : {};
			const incoming = next && typeof next === "object" ? next : {};
			return {
				forceCatalog: Boolean(previous.forceCatalog || incoming.forceCatalog),
				forceState: Boolean(previous.forceState || incoming.forceState),
				preferEvents: Boolean(previous.preferEvents || incoming.preferEvents),
				requireActiveRun: Boolean(previous.requireActiveRun || incoming.requireActiveRun),
				allowStaleState: Boolean(previous.allowStaleState || incoming.allowStaleState),
			};
		}

		function hasResumeActiveRunHint() {
			return Boolean(
				state.loading ||
					state.activeRunEventController ||
					state.primaryStreamActive ||
					state.conversationState?.running ||
					state.conversationState?.activeRun,
			);
		}

		function shouldResumeCatalogSync(options) {
			if (options?.forceCatalog || !state.conversationId) {
				return true;
			}
			return state.conversationCatalog.length === 0;
		}

		function shouldResumeStateSync(options) {
			if (options?.forceState) {
				return true;
			}
			if (hasResumeActiveRunHint()) {
				return true;
			}
			if (options?.requireActiveRun) {
				return false;
			}
			if (!options?.allowStaleState) {
				return false;
			}
			return Date.now() - Number(state.lastConversationStateSyncAt || 0) >= RESUME_SYNC_STALE_MS;
		}

		async function resumeActiveRunAfterReconnect(conversationId) {
			const nextConversationId = String(conversationId || "").trim();
			if (!nextConversationId || !hasResumeActiveRunHint()) {
				return false;
			}
			const payload = await syncConversationRunState(nextConversationId, {
				silent: true,
				clearIfIdle: true,
				attachIfRunning: false,
			});
			if (payload?.running) {
				void attachActiveRunEventStream(nextConversationId);
				return true;
			}
			return false;
		}

		function scheduleResumeConversationSync(reason, options) {
			connectNotificationStream();
			state.resumeSyncPendingOptions = mergeResumeSyncOptions(state.resumeSyncPendingOptions, options);
			if (state.resumeSyncPromise) {
				return state.resumeSyncPromise;
			}
			if (state.resumeSyncTimer !== null) {
				return Promise.resolve();
			}
			const elapsed = Date.now() - state.lastResumeSyncAt;
			const delay = Math.max(0, RESUME_SYNC_COOLDOWN_MS - elapsed);
			state.resumeSyncTimer = window.setTimeout(() => {
				state.resumeSyncTimer = null;
				state.lastResumeSyncAt = Date.now();
				const resumeOptions = state.resumeSyncPendingOptions || {};
				state.resumeSyncPendingOptions = null;
				state.resumeSyncPromise = (async () => {
					let nextConversationId = String(state.conversationId || "").trim();
					if (shouldResumeCatalogSync(resumeOptions)) {
						nextConversationId = await ensureCurrentConversation({ silent: true });
					}
					if (!nextConversationId) {
						return;
					}
					if (resumeOptions.preferEvents && (await resumeActiveRunAfterReconnect(nextConversationId))) {
						return;
					}
					if (shouldResumeStateSync(resumeOptions)) {
						await restoreConversationHistoryFromServer(nextConversationId, {
							silent: true,
							clearIfIdle: state.loading,
							attachIfRunning: true,
						});
					}
				})()
					.catch(() => undefined)
					.finally(() => {
						state.resumeSyncPromise = null;
						if (state.resumeSyncPendingOptions) {
							const pendingOptions = state.resumeSyncPendingOptions;
							state.resumeSyncPendingOptions = null;
							void scheduleResumeConversationSync("pending", pendingOptions);
						}
					});
			}, delay);
			return Promise.resolve();
		}

		function handleTranscriptScroll() {
			syncTranscriptFollowState();
			if (transcript.scrollTop <= 24 && hasOlderConversationHistory() && !state.historyLoadingMore) {
				renderMoreConversationHistory();
			}
		}

		function bindPlaygroundLayoutController() {
			window.addEventListener("resize", syncConversationWidth);
			document.addEventListener("visibilitychange", () => {
				if (document.visibilityState === "visible") {
					void scheduleResumeConversationSync("visibilitychange", {
						allowStaleState: true,
						preferEvents: true,
					});
				}
			});
			window.addEventListener("pageshow", (event) => {
				if (!event.persisted && state.skipNextPageShowResumeSync) {
					state.skipNextPageShowResumeSync = false;
					state.pageUnloading = false;
					return;
				}
				state.skipNextPageShowResumeSync = false;
				state.pageUnloading = false;
				void scheduleResumeConversationSync("pageshow", {
					forceState: true,
					preferEvents: true,
				});
			});
			window.addEventListener("online", () => {
				void scheduleResumeConversationSync("online", {
					preferEvents: true,
					requireActiveRun: true,
				});
			});
			const layoutObserver = new ResizeObserver(() => {
				scheduleConversationLayoutSync();
			});
			layoutObserver.observe(commandDeck);
			syncComposerTextareaHeight();
			scrollToBottomButton.addEventListener("click", () => {
				scrollTranscriptToBottom({ force: true });
			});
			transcript.addEventListener("scroll", handleTranscriptScroll);
			scheduleConversationLayoutSync({ immediate: true });
		}
	`;
}
