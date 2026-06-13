export function getPlaygroundStreamControllerScript(): string {
	return `
		const STREAM_IDLE_TIMEOUT_MS = 90000;

		function scheduleNotificationStreamReconnect() {
			if (
				state.pageUnloading ||
				state.notificationEventSource ||
				state.notificationReconnectTimer !== null ||
				typeof EventSource !== "function"
			) {
				return;
			}
			const nextDelay = state.notificationReconnectDelayMs > 0
				? Math.min(state.notificationReconnectDelayMs * 2, 30000)
				: 1500;
			state.notificationReconnectDelayMs = nextDelay;
			state.notificationReconnectTimer = window.setTimeout(() => {
				state.notificationReconnectTimer = null;
				connectNotificationStream();
			}, nextDelay);
		}

		function disconnectNotificationStream() {
			clearNotificationReconnectTimer();
			const eventSource = state.notificationEventSource;
			state.notificationEventSource = null;
			if (eventSource) {
				eventSource.onopen = null;
				eventSource.onmessage = null;
				eventSource.onerror = null;
				eventSource.close();
			}
		}

		function handleNotificationBroadcastEvent(rawEvent) {
			const event = normalizeNotificationBroadcastEvent(rawEvent);
			if (!event) {
				return;
			}
			showNotificationToast(event);
			void loadTaskInbox({ silent: true });
			void syncConnManagerUnreadSummary({ silent: true });
		}

		function connectNotificationStream() {
			if (state.pageUnloading || state.notificationEventSource || typeof EventSource !== "function") {
				return;
			}
			clearNotificationReconnectTimer();
			const stream = new EventSource("/v1/notifications/stream");
			state.notificationEventSource = stream;
			stream.onopen = () => {
				state.notificationReconnectDelayMs = 0;
			};
			stream.onmessage = (messageEvent) => {
				let payload;
				try {
					payload = JSON.parse(String(messageEvent.data || ""));
				} catch {
					return;
				}
				handleNotificationBroadcastEvent(payload);
			};
			stream.onerror = () => {
				if (state.notificationEventSource !== stream) {
					return;
				}
				state.notificationEventSource = null;
				stream.close();
				scheduleNotificationStreamReconnect();
			};
		}

		function stopActiveRunEventStream() {
			const controller = state.activeRunEventController;
			state.activeRunEventController = null;
			if (controller && !controller.signal.aborted) {
				controller.abort();
			}
		}

		function isAbortError(error) {
			return (
				error?.name === "AbortError" ||
				error?.code === 20 ||
				(typeof error?.message === "string" && error.message.toLowerCase().includes("abort"))
			);
		}

		function isTerminalRunEvent(event) {
			return event?.type === "done" || event?.type === "error" || event?.type === "interrupted";
		}

		function createStreamOwner(conversationId) {
			return {
				agentId: getCurrentAgentId(),
				conversationId: String(conversationId || state.conversationId || "").trim(),
				generation: state.agentSwitchGeneration,
			};
		}

		function isStreamOwnerCurrent(owner) {
			if (!owner) return true;
			return (
				owner.agentId === getCurrentAgentId() &&
				owner.generation === state.agentSwitchGeneration &&
				owner.conversationId === String(state.conversationId || "").trim()
			);
		}

		async function attachActiveRunEventStream(conversationId) {
			const nextConversationId = String(conversationId || "").trim();
			if (!nextConversationId) {
				return;
			}
			if (
				state.activeRunEventController &&
				state.activeRunEventController.conversationId === nextConversationId &&
				!state.activeRunEventController.signal.aborted
			) {
				return;
			}

			stopActiveRunEventStream();
			const controller = new AbortController();
			controller.conversationId = nextConversationId;
			const streamOwner = createStreamOwner(nextConversationId);
			controller.streamOwner = streamOwner;
			state.activeRunEventController = controller;
			let shouldRecoverFromCanonicalState = false;

			try {
				const query = new URLSearchParams({ conversationId: nextConversationId });
				const activeRunSnapshot = normalizeActiveRun(state.conversationState?.activeRun);
				if (
					activeRunSnapshot &&
					activeRunSnapshot.runId === state.activeRunId &&
					Number.isFinite(activeRunSnapshot.eventCursor) &&
					activeRunSnapshot.eventCursor > 0
				) {
					query.set("afterEventCursor", String(Math.trunc(activeRunSnapshot.eventCursor)));
				}
				const response = await fetch(getAgentApiPath("/chat/events") + "?" + query.toString(), {
					method: "GET",
					headers: { accept: "text/event-stream" },
					signal: controller.signal,
				});
				if (!response.ok) {
					throw new Error("无法重新连接当前运行任务");
				}

				let receivedTerminalEvent = false;
				await readEventStream(
					response,
					(event) => {
						if (!isStreamOwnerCurrent(streamOwner)) return;
						receivedTerminalEvent ||= isTerminalRunEvent(event);
						handleStreamEvent(event);
					},
					{ idleTimeoutMs: STREAM_IDLE_TIMEOUT_MS },
				);
				shouldRecoverFromCanonicalState = !receivedTerminalEvent && isStreamOwnerCurrent(streamOwner);
			} catch (error) {
				if (controller.signal.aborted || isAbortError(error) || isPageUnloadStreamError(error)) {
					return;
				}

				const messageText = error instanceof Error ? error.message : "无法重新连接当前运行任务";
				showError(messageText);
				updateStreamingProcess("error", "运行状态重连失败", messageText);
			} finally {
				const shouldSyncFromCanonicalState =
					shouldRecoverFromCanonicalState &&
					state.activeRunEventController === controller &&
					!controller.signal.aborted &&
					!state.pageUnloading;
				if (state.activeRunEventController === controller) {
					state.activeRunEventController = null;
				}
				if (shouldSyncFromCanonicalState) {
					void restoreConversationHistoryFromServer(nextConversationId, {
						silent: true,
						clearIfIdle: true,
						attachIfRunning: true,
					});
				}
			}
		}

		function buildConversationStateSignature(conversationState) {
			const source = conversationState && typeof conversationState === "object" ? conversationState : {};
			const messages = Array.isArray(source.viewMessages)
				? source.viewMessages
				: Array.isArray(source.messages)
					? source.messages
					: [];
			const activeRun = normalizeActiveRun(source.activeRun);
			return JSON.stringify({
				conversationId: typeof source.conversationId === "string" ? source.conversationId : "",
				updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : "",
				running: Boolean(source.running),
				historyHasMore: Boolean(source.historyPage?.hasMore),
				historyNextBefore: typeof source.historyPage?.nextBefore === "string" ? source.historyPage.nextBefore : "",
				messages: messages.map((message) => ({
					id: message?.id || "",
					kind: message?.kind || message?.role || "",
					text: message?.text || "",
					createdAt: message?.createdAt || "",
					runId: message?.runId || "",
					attachments: stableJson(message?.attachments || []),
					assetRefs: stableJson(message?.assetRefs || []),
					files: stableJson(message?.files || []),
				})),
				activeRunStatus: activeRun ? activeRun.status : "",
				activeRunText: activeRun ? activeRun.text : "",
				activeRunId: activeRun ? activeRun.runId : "",
				activeRunEventCursor: activeRun ? activeRun.eventCursor : 0,
			});
		}

		function isPageUnloadStreamError(error) {
			const messageText = error instanceof Error ? error.message : String(error || "");
			return state.pageUnloading && !state.receivedDoneEvent && isNetworkErrorText(messageText);
		}

		async function recoverRunningStreamAfterDisconnect(reason) {
			if (state.receivedDoneEvent || !state.conversationId) {
				return false;
			}

			const previousSignature = buildConversationStateSignature(state.conversationState);
			const payload = await syncConversationRunState(state.conversationId, {
				silent: true,
				clearIfIdle: false,
			});
			if (!payload.running) {
				const nextSignature = buildConversationStateSignature(state.conversationState);
				const canonicalStateSettled =
					nextSignature !== previousSignature || Boolean(state.conversationState?.activeRun);
				if (!canonicalStateSettled) {
					return false;
				}

				clearError();
				setLoading(false);
				return true;
			}

			clearError();
			setLoading(true);
			setAssistantLoadingState("当前正在运行", "system");
			updateStreamingProcess(
				"warn",
				"页面连接已恢复",
				reason === "missing_done"
					? "主连接结束但后端任务仍在运行，已切换到运行态事件流继续接收。"
					: "网络连接短暂断开，已重新订阅当前运行任务。",
			);
			return true;
		}

		function describeToolEvent(event, prefix) {
			const payload = event.args || event.partialResult || event.result || "";
			return prefix + " " + event.toolName + (payload ? "\\n" + payload : "");
		}

		function handleStreamEvent(event) {
			switch (event.type) {
				case "run_started":
					state.activeRunId = event.runId || "";
					ensureStreamingAssistantMessage();
					setAssistantLoadingState("正在接手任务", "system");
					updateStreamingProcess("system", "任务开始", event.conversationId);
					statusPill.textContent = "运行中";
					void syncContextUsage(event.conversationId, { silent: true });
					break;
				case "tool_started":
					setAssistantLoadingState("正在调用工具", "tool");
					updateStreamingProcess("tool", "工具开始", describeToolEvent(event, "调用"));
					break;
				case "tool_updated":
					setAssistantLoadingState("正在等待工具返回", "tool");
					updateStreamingProcess("tool", "工具更新", describeToolEvent(event, "片段"));
					break;
				case "tool_finished":
					setAssistantLoadingState(
						event.isError ? "工具步骤失败" : "工具步骤已完成",
						event.isError ? "error" : "system",
					);
					updateStreamingProcess(
						event.isError ? "error" : "ok",
						"工具结束",
						describeToolEvent(event, event.isError ? "失败" : "完成"),
					);
					break;
				case "queue_updated":
					setAssistantLoadingState("正在等待当前步骤收尾", "system");
					updateStreamingProcess(
						"system",
						"队列更新",
						"转向消息: " + event.steering.length + "\\n追加消息: " + event.followUp.length,
					);
					break;
				case "interrupted":
					state.receivedDoneEvent = true;
					updateStreamingProcess("system", "任务已打断", event.conversationId);
					completeAssistantLoadingBubble("warn", "本轮已中断");
					completeProcessStream();
					setLoading(false);
					statusPill.textContent = "已打断";
					void syncContextUsage(event.conversationId, { silent: true });
					void restoreConversationHistoryFromServer(event.conversationId);
					break;
				case "text_delta": {
					state.streamingText += event.textDelta;
					const content = ensureStreamingAssistantMessage();
					setAssistantLoadingState("正在生成回复", "system");
					setMessageContent(content, state.streamingText);
					scrollTranscriptToBottom();
					break;
				}
				case "heartbeat":
					if (event.phase === "reasoning") {
						ensureStreamingAssistantMessage();
						setAssistantLoadingState("正在推理", "system");
					}
					break;
				case "done": {
					state.receivedDoneEvent = true;
					sessionFile.textContent = event.sessionFile || "不可用";
					if (typeof event.text === "string" && event.text !== state.streamingText) {
						const content = ensureStreamingAssistantMessage();
						setMessageContent(content, event.text);
						state.streamingText = event.text;
					}
					mergeRecentAssets(event.inputAssets);
					appendFileDownloads(event.files);
					if (state.assetsLoadedOnce) { void loadAssets(true); }
					updateStreamingProcess("ok", "任务完成", event.sessionFile || "未返回会话文件");
					completeAssistantLoadingBubble("ok", "本轮已完成");
					completeProcessStream();
					setLoading(false);
					statusPill.textContent = "完成";
					void syncContextUsage(event.conversationId, { silent: true });
					void restoreConversationHistoryFromServer(event.conversationId);
					scheduleConversationCatalogRefresh();
					break;
				}
				case "error":
					state.receivedDoneEvent = true;
					showError(event.message);
					updateStreamingProcess("error", "任务错误", event.message);
					completeAssistantLoadingBubble("error", "本轮执行失败");
					completeProcessStream();
					setLoading(false);
					void syncContextUsage(event.conversationId, { silent: true });
					void restoreConversationHistoryFromServer(event.conversationId);
					break;
				default:
					updateStreamingProcess("system", "事件", JSON.stringify(event));
					break;
			}
		}

		async function readEventStream(response, onEvent, options) {
			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error("流式读取器不可用");
			}

			const decoder = new TextDecoder();
			let buffer = "";
			const idleTimeoutMs =
				Number.isFinite(options?.idleTimeoutMs) && options.idleTimeoutMs > 0
					? Math.trunc(options.idleTimeoutMs)
					: 0;

			while (true) {
				const { value, done } = await readStreamChunkWithIdleTimeout(reader, idleTimeoutMs);
				buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\\r/g, "");

				let boundaryIndex = buffer.indexOf("\\n\\n");
				while (boundaryIndex !== -1) {
					const chunk = buffer.slice(0, boundaryIndex);
					buffer = buffer.slice(boundaryIndex + 2);

					const data = chunk
						.split("\\n")
						.filter((line) => line.startsWith("data:"))
						.map((line) => line.slice(5).trimStart())
						.join("\\n");

					if (data) {
						onEvent(JSON.parse(data));
					}

					boundaryIndex = buffer.indexOf("\\n\\n");
				}

				if (done) {
					break;
				}
			}
		}

		async function readStreamChunkWithIdleTimeout(reader, idleTimeoutMs) {
			if (!idleTimeoutMs) {
				return await reader.read();
			}

			let timer = null;
			try {
				return await Promise.race([
					reader.read(),
					new Promise((_resolve, reject) => {
						timer = window.setTimeout(() => {
							try {
								void reader.cancel("stream idle timeout");
							} catch {
								// Best effort: the recovery path below is what matters.
							}
							reject(new Error("流式连接长时间没有新数据，正在恢复运行状态"));
						}, idleTimeoutMs);
					}),
				]);
			} finally {
				if (timer !== null) {
					window.clearTimeout(timer);
				}
			}
		}

		function parsePlaygroundSlashCommand(rawMessage) {
			const text = String(rawMessage || "").trim();
			if (!text.startsWith("/")) {
				return null;
			}

			const [rawName, ...args] = text.split(/\\s+/);
			const name = String(rawName || "").toLowerCase();
			if (!name) {
				return null;
			}

			return {
				name,
				args,
				raw: text,
			};
		}

		async function runPlaygroundSlashCommand(command, composerDraft) {
			switch (command?.name) {
				case "/new": {
					const created = await startNewConversation();
					if (!created) {
						restoreComposerDraft(composerDraft);
						return true;
					}

					clearComposerDraft();
					messageInput.focus();
					return true;
				}
				default:
					showError("未知指令：" + command.raw);
					restoreComposerDraft(composerDraft);
					return true;
			}
		}

		async function sendMessage() {
			const composerDraft = createComposerDraft();
			const message = messageInput.value.trim();
			const attachments = [];
			const assetRefs = [...state.selectedAssetRefs];
			if (state.composerUploadingAssets) {
				showError("文件仍在上传中，请稍后再发送");
				return;
			}
			if (!message && attachments.length === 0 && assetRefs.length === 0) {
				showError("请输入消息");
				return;
			}
			const slashCommand = parsePlaygroundSlashCommand(message);
			if (slashCommand && (attachments.length > 0 || assetRefs.length > 0)) {
				showError("指令不能和附件或引用文件一起发送");
				restoreComposerDraft(composerDraft);
				return;
			}
			if (slashCommand) {
				const handled = await runPlaygroundSlashCommand(slashCommand, composerDraft);
				if (handled) {
					return;
				}
			}
			const outboundMessage =
				message ||
				(assetRefs.length > 0
					? "\\u8bf7\\u7ed3\\u5408\\u6211\\u5f15\\u7528\\u7684\\u8d44\\u4ea7\\u4e00\\u8d77\\u5904\\u7406"
					: "\\u8bf7\\u67e5\\u770b\\u6211\\u53d1\\u9001\\u7684\\u9644\\u4ef6");

			if (!state.conversationId) {
				await ensureCurrentConversation({ silent: false });
			}
			ensureConversationId();
			if (!state.conversationId) {
				showError("无法确认当前会话");
				return;
			}
			clearError();

			if (state.loading) {
				if (isInterruptIntentMessage(outboundMessage) && attachments.length === 0 && assetRefs.length === 0) {
					appendTranscriptMessage("user", state.conversationId, outboundMessage, { forceScroll: true });
					updateStreamingProcess("system", "检测到停止意图", "本次发送改为直接打断当前任务");
					messageInput.value = "";
					await interruptRun();
					return;
				}
				await queueActiveMessage(outboundMessage, attachments, assetRefs, { composerDraft });
				return;
			}

			const serverActiveConversation = await resolveServerActiveConversation({ silent: true });
			if (serverActiveConversation.running && serverActiveConversation.conversationId) {
				if (isInterruptIntentMessage(outboundMessage) && attachments.length === 0 && assetRefs.length === 0) {
					appendTranscriptMessage("user", serverActiveConversation.conversationId, outboundMessage, { forceScroll: true });
					updateStreamingProcess("system", "检测到停止意图", "本次发送改为直接打断当前任务");
					messageInput.value = "";
					await interruptRun();
					return;
				}
				await queueActiveMessage(outboundMessage, attachments, assetRefs, { composerDraft });
				return;
			}

			setTranscriptState("active");
			stopActiveRunEventStream();
			resetStreamingState();
			appendUserTranscriptMessage(message, attachments, assetRefs);
			updateStreamingProcess("system", "请求已发送", formatOutboundSummary(message, attachments, assetRefs));
			clearComposerDraft();
			setLoading(true);
			ensureStreamingAssistantMessage();
			setAssistantLoadingState("正在等待 Agent 开始处理", "system");

			let handoffToRunEvents = false;
			try {
				const payload = {
					conversationId: state.conversationId,
					message: outboundMessage,
					userId: "web-playground",
				};
				if (assetRefs.length > 0) {
					payload.assetRefs = assetRefs;
				}
				const response = await fetch(getAgentApiPath("/chat/stream"), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload),
				});

				if (!response.ok) {
					const body = await response.json().catch(() => ({}));
					const errorMessage = body?.error?.message || body?.message || "未知错误";
					restoreComposerDraft(composerDraft);
					showError(errorMessage);
					updateStreamingProcess("error", "请求被拒绝", errorMessage);
					completeAssistantLoadingBubble("error", "本轮执行失败");
					completeProcessStream();
					return;
				}

				const streamOwner = createStreamOwner(state.conversationId);
				state.activeStreamOwner = streamOwner;
				state.primaryStreamActive = true;
				try {
					await readEventStream(response, (event) => {
						if (!isStreamOwnerCurrent(streamOwner)) return;
						handleStreamEvent(event);
					}, { idleTimeoutMs: STREAM_IDLE_TIMEOUT_MS });
				} finally {
					if (state.activeStreamOwner === streamOwner) state.activeStreamOwner = null;
					state.primaryStreamActive = false;
				}

				if (isStreamOwnerCurrent(streamOwner) && !state.receivedDoneEvent && !errorBanner.classList.contains("visible")) {
					const streamWasRecovered = await recoverRunningStreamAfterDisconnect("missing_done");
					if (streamWasRecovered) {
						handoffToRunEvents = true;
						return;
					}
					showError("流已结束，但没有收到完成事件");
					updateStreamingProcess("error", "流被中断", "缺少 done 事件");
					completeAssistantLoadingBubble("error", "本轮异常结束");
					completeProcessStream();
				}

				if (isStreamOwnerCurrent(streamOwner) && state.receivedDoneEvent) {
					messageInput.focus();
				}
			} catch (error) {
				if (isPageUnloadStreamError(error)) {
					return;
				}

				if (!isStreamOwnerCurrent(streamOwner)) return;

				const streamWasRecovered = await recoverRunningStreamAfterDisconnect("network_error");
				if (streamWasRecovered) {
					handoffToRunEvents = true;
					return;
				}

				if (!String(state.streamingText || "").trim() && !state.receivedDoneEvent) {
					restoreComposerDraft(composerDraft);
				}
				const messageText = error instanceof Error ? error.message : "请求失败";
				showError(messageText);
				updateStreamingProcess("error", "网络错误", messageText);
				completeAssistantLoadingBubble("error", "本轮执行失败");
				completeProcessStream();
			} finally {
				state.primaryStreamActive = false;
				if (!state.pageUnloading && !handoffToRunEvents && isStreamOwnerCurrent(streamOwner)) {
					setLoading(false);
				}
			}
		}

		async function queueActiveMessage(message, attachments, assetRefs, options) {
			const composerDraft = options?.composerDraft || createComposerDraft();
			if (options?.appendTranscript !== false) {
				appendUserTranscriptMessage(message, attachments, assetRefs);
			}
			clearComposerDraft();
			state.queueMessagePending = true;
			setLoading(state.loading);

			try {
				const payloadBody = {
					conversationId: state.conversationId,
					message,
					mode: "steer",
					userId: "web-playground",
				};
				if (assetRefs.length > 0) {
					payloadBody.assetRefs = assetRefs;
				}
				const response = await fetch(getAgentApiPath("/chat/queue"), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payloadBody),
				});

				const payload = await response.json().catch(() => ({}));
				if (!response.ok || !payload.queued) {
					const errorMessage = getControlActionErrorMessage("queue", payload, "消息无法追加");
					restoreComposerDraft(composerDraft);
					showError(errorMessage);
					return;
				}

				messageInput.focus();
				updateStreamingProcess("ok", "消息已加入队列", payload.conversationId);
			} catch (error) {
				restoreComposerDraft(composerDraft);
				const messageText = error instanceof Error ? error.message : "追加请求失败";
				showError(messageText);
			} finally {
				state.queueMessagePending = false;
				setLoading(state.loading);
			}
		}

		async function interruptRun() {
			await ensureCurrentConversation({ silent: true });
			ensureConversationId();
			if (!state.conversationId) {
				showError("无法确认当前会话");
				return;
			}
			if (!state.loading) {
				const serverActiveConversation = await resolveServerActiveConversation({ silent: true });
				if (!serverActiveConversation.running || !serverActiveConversation.conversationId) {
					updateStreamingProcess("ok", "任务状态已同步", "后端没有正在运行的任务");
					stopActiveRunEventStream();
					completeAssistantLoadingBubble("ok", "当前任务已结束");
					completeProcessStream();
					setLoading(false);
					statusPill.textContent = "已结束";
					return;
				}
			}

			state.interruptPending = true;
			setLoading(state.loading || true);
			try {
				const response = await fetch(getAgentApiPath("/chat/interrupt"), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						conversationId: state.conversationId,
					}),
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok || !payload.interrupted) {
					if (payload?.reason === "not_running") {
						updateStreamingProcess("ok", "任务状态已同步", "后端没有正在运行的任务");
						stopActiveRunEventStream();
						completeAssistantLoadingBubble("ok", "当前任务已结束");
						completeProcessStream();
						setLoading(false);
						statusPill.textContent = "已结束";
						return;
					}
					const errorMessage = getControlActionErrorMessage("interrupt", payload, "当前任务无法打断");
					showError(errorMessage);
					return;
				}
				updateStreamingProcess("warn", "打断请求已接收", "等待后端确认任务终止");
				setAssistantLoadingState("正在中断当前任务", "system");
				setLoading(true);
				statusPill.textContent = "正在中断";
				if (!state.primaryStreamActive) {
					void attachActiveRunEventStream(state.conversationId);
				}
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "打断请求失败";
				showError(messageText);
			} finally {
				state.interruptPending = false;
				setLoading(state.loading);
			}
		}

		function bindPlaygroundStreamController() {
			connectNotificationStream();
		}
	`;
}
