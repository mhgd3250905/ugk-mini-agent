export function getBrowserMarkdownRendererScript(): string {
	return `
		function renderMessageMarkdown(source) {
			function escapeHtml(value) {
				return String(value || "")
					.replace(/&/g, "&amp;")
					.replace(/</g, "&lt;")
					.replace(/>/g, "&gt;")
					.replace(/"/g, "&quot;")
					.replace(/'/g, "&#39;");
			}

			function escapeAttribute(value) {
				return escapeHtml(value).replace(/\`/g, "&#96;");
			}

			function isSafeHttpUrl(value) {
				try {
					const url = new URL(value);
					return url.protocol === "http:" || url.protocol === "https:";
				} catch (_error) {
					return false;
				}
			}

			const normalized = String(source || "").replace(/\\r\\n?/g, "\\n").trim();
			if (!normalized) {
				return "<p></p>";
			}

			const markedApi = globalThis.marked;
			if (!markedApi || typeof markedApi.Marked !== "function") {
				return "<p>" + escapeHtml(normalized).replace(/\\n/g, "<br />") + "</p>";
			}

			if (!globalThis.__ugkPlaygroundMarkdownParser) {
				globalThis.__ugkPlaygroundMarkdownParser = new markedApi.Marked({
					gfm: true,
					breaks: false,
					async: false,
					renderer: {
						html: function html(token) {
							return escapeHtml(token && token.text ? token.text : "");
						},
						link: function link(token) {
							const href = token && token.href ? token.href : "";
							const text = token && token.text ? token.text : "";
							if (!isSafeHttpUrl(href)) {
								return escapeHtml(text);
							}
							const title = token && token.title ? ' title="' + escapeAttribute(token.title) + '"' : "";
							return '<a href="' + escapeAttribute(href) + '"' + title + ' target="_blank" rel="noreferrer noopener">' + escapeHtml(text) + "</a>";
						},
					},
				});
			}

			const rendered = globalThis.__ugkPlaygroundMarkdownParser.parse(normalized, { async: false });
			return String(rendered || "").trim() || "<p></p>";
		}
	`;
}

export function getPlaygroundTranscriptRendererScript(): string {
	return `
		function normalizeHistoryEntry(rawEntry) {
			if (!rawEntry || typeof rawEntry !== "object") {
				return null;
			}

			return {
				id: typeof rawEntry.id === "string" && rawEntry.id ? rawEntry.id : createBrowserId(),
				kind: typeof rawEntry.kind === "string" ? rawEntry.kind : "assistant",
				title: typeof rawEntry.title === "string" ? rawEntry.title : "助手",
				text: typeof rawEntry.text === "string" ? rawEntry.text : "",
				createdAt:
					typeof rawEntry.createdAt === "string" && rawEntry.createdAt
						? rawEntry.createdAt
						: new Date().toISOString(),
				source: typeof rawEntry.source === "string" ? rawEntry.source : undefined,
				sourceId: typeof rawEntry.sourceId === "string" ? rawEntry.sourceId : undefined,
				runId: typeof rawEntry.runId === "string" ? rawEntry.runId : undefined,
				attachments: cloneHistoryAttachments(rawEntry.attachments),
				assetRefs: Array.isArray(rawEntry.assetRefs)
					? rawEntry.assetRefs
							.filter((asset) => asset && typeof asset === "object")
							.map((asset) => ({
								assetId: typeof asset.assetId === "string" ? asset.assetId : "",
								fileName: typeof asset.fileName === "string" ? asset.fileName : "asset",
								mimeType: typeof asset.mimeType === "string" ? asset.mimeType : "application/octet-stream",
								sizeBytes: Number.isFinite(asset.sizeBytes) ? asset.sizeBytes : 0,
								kind: typeof asset.kind === "string" ? asset.kind : "metadata",
							}))
							.filter((asset) => asset.assetId)
					: [],
				files: cloneHistoryFiles(rawEntry.files),
			};
		}

		function buildTranscriptEntry(kind, title, text, options) {
			return {
				id: options?.id || createBrowserId(),
				kind,
				title,
				text: String(text || ""),
				createdAt: options?.createdAt || new Date().toISOString(),
				source: typeof options?.source === "string" ? options.source : undefined,
				sourceId: typeof options?.sourceId === "string" ? options.sourceId : undefined,
				runId: typeof options?.runId === "string" ? options.runId : undefined,
				attachments: cloneHistoryAttachments(options?.attachments),
				assetRefs: cloneHistoryAssetRefs(options?.assetRefs),
				files: cloneHistoryFiles(options?.files),
			};
		}

		function rememberConversationMessage(entry) {
			const index = state.conversationHistory.findIndex((current) => current.id === entry.id);
			if (index >= 0) {
				state.conversationHistory.splice(index, 1, entry);
			} else {
				state.conversationHistory.push(entry);
			}
			scheduleConversationHistoryPersist(state.conversationId);
		}

		function archiveCurrentTranscript(conversationId) {
			if (!transcriptCurrent.firstChild) {
				return;
			}

			const archive = document.createElement("section");
			archive.className = "archived-conversation";

			const head = document.createElement("div");
			head.className = "archived-conversation-head";
			head.innerHTML = "<span>鍘嗗彶浼氳瘽</span><strong></strong>";
			head.querySelector("strong").textContent = String(conversationId || "").trim() || "untitled";

			const body = document.createElement("div");
			body.className = "archived-conversation-body";
			while (transcriptCurrent.firstChild) {
				body.appendChild(transcriptCurrent.firstChild);
			}

			archive.appendChild(head);
			archive.appendChild(body);
			if (transcriptArchive.firstChild) {
				transcriptArchive.insertBefore(archive, transcriptArchive.firstChild);
			} else {
				transcriptArchive.appendChild(archive);
			}

			while (transcriptArchive.childElementCount > MAX_ARCHIVED_TRANSCRIPTS) {
				transcriptArchive.lastElementChild?.remove();
			}

			renderedMessages.clear();
		}

		function clearRenderedTranscript() {
			transcriptCurrent.innerHTML = "";
			transcriptArchive.innerHTML = "";
			renderedMessages.clear();
			state.renderedConversationId = "";
			state.renderedConversationStateSignature = "";
		}

		function clearCurrentTranscript() {
			transcriptCurrent.innerHTML = "";
			renderedMessages.clear();
		}

		function syncMessageCopyButton(entry) {
			const rendered = renderedMessages.get(entry.id);
			if (!rendered?.copyButton) {
				return;
			}

			rendered.copyButton.disabled = !String(entry.text || "").trim();
		}


		function buildAssistantLoadingBubble() {
			const bubble = document.createElement("button");
			bubble.type = "button";
			bubble.className = "assistant-loading-bubble assistant-run-log-trigger";
			bubble.setAttribute("aria-label", "查看本轮运行日志");
			bubble.title = "查看运行日志";

			const dots = document.createElement("span");
			dots.className = "assistant-loading-dots";
			dots.setAttribute("aria-hidden", "true");

			for (let index = 0; index < 3; index += 1) {
				const dot = document.createElement("span");
				dot.className = "assistant-loading-dot";
				dots.appendChild(dot);
			}

			const hint = document.createElement("span");
			hint.className = "assistant-run-log-hint";
			hint.textContent = "查看运行日志";

			bubble.appendChild(dots);
			bubble.appendChild(hint);
			return { bubble, dots, hint };
		}

		function setRunLogTriggerStatus(trigger, text) {
			if (!trigger) {
				return;
			}
			const normalizedText = String(text || "").trim();
			const baseLabel = "查看本轮运行日志";
			trigger.setAttribute("aria-label", normalizedText ? baseLabel + "，当前状态：" + normalizedText : baseLabel);
			trigger.title = "查看运行日志";
		}

		function setAssistantStatusKind(shell, trigger, kind) {
			const statusKind = kind || "system";
			const statusClasses = ["tool", "ok", "warn", "error", "system"];
			if (shell) {
				shell.classList.remove(...statusClasses);
				shell.classList.add(statusKind);
			}
			if (trigger) {
				trigger.classList.remove(...statusClasses);
				trigger.classList.add(statusKind);
			}
		}

		function setConversationEntryRunId(entryId, runId) {
			const nextRunId = String(runId || "").trim() || undefined;
			const historyEntry = state.conversationHistory.find((entry) => entry.id === entryId);
			if (!historyEntry) {
				return;
			}
			historyEntry.runId = nextRunId;
			rememberConversationMessage(historyEntry);
		}

		function updateRunLogTrigger(trigger, runId) {
			if (!trigger) {
				return;
			}
			const nextRunId = String(runId || "").trim();
			if (nextRunId) {
				trigger.dataset.runId = nextRunId;
				trigger.disabled = false;
			} else {
				delete trigger.dataset.runId;
				trigger.disabled = true;
			}
		}

		function buildAssistantStatusShell() {
			const shell = document.createElement("section");
			shell.className = "assistant-status-shell is-running system";

			const summary = document.createElement("p");
			summary.className = "assistant-status-summary";
			summary.textContent = "收到，我先帮你处理一下。";

			const loading = buildAssistantLoadingBubble();
			loading.bubble.addEventListener("click", () => {
				const runId = String(loading.bubble.dataset.runId || "").trim();
				if (!runId) {
					return;
				}
				void openChatRunLog(runId, loading.bubble);
			});

			shell.appendChild(summary);
			return {
				shell,
				summary,
				trigger: loading.bubble,
				dots: loading.dots,
				created: true,
			};
		}

		function clearAssistantStatusControls(card) {
			if (!card) {
				return;
			}
			card.querySelectorAll(".assistant-status-shell, .assistant-run-log-trigger").forEach((element) => {
				element.remove();
			});
		}

		function attachAssistantStatusShell(body, content) {
			const stream = buildAssistantStatusShell();
			const card = body.closest(".message");
			const meta = card?.querySelector(".message-meta");
			const assistantLabel = meta?.querySelector("strong");

			if (card && meta && assistantLabel) {
				clearAssistantStatusControls(card);
				card.insertBefore(stream.shell, body);
				assistantLabel.insertAdjacentElement("afterend", stream.trigger);
			} else if (content.parentElement === body) {
				clearAssistantStatusControls(body.closest(".message"));
				stream.shell.appendChild(stream.trigger);
				body.insertBefore(stream.shell, content);
			} else {
				clearAssistantStatusControls(body.closest(".message"));
				stream.shell.appendChild(stream.trigger);
				body.appendChild(stream.shell);
			}

			state.activeStatusShell = stream.shell;
			state.activeStatusSummary = stream.summary;
			state.activeLoadingShell = stream.shell;
			state.activeLoadingDots = stream.dots;
			state.activeRunLogTrigger = stream.trigger;
			return stream;
		}

		function ensureAssistantStatusShell() {
			if (
				state.activeStatusShell?.isConnected &&
				state.activeStatusSummary?.isConnected &&
				state.activeLoadingDots?.isConnected &&
				state.activeRunLogTrigger?.isConnected
			) {
				return {
					shell: state.activeStatusShell,
					summary: state.activeStatusSummary,
					trigger: state.activeRunLogTrigger,
					dots: state.activeLoadingDots,
					created: false,
				};
			}

			const content = ensureStreamingAssistantMessage();
			const body = content.parentElement;
			if (!body) {
				throw new Error("assistant message body is unavailable");
			}

			return attachAssistantStatusShell(body, content);
		}

		function setAssistantStatusSummary(text, kind) {
			const summaryText = String(text || "").trim() || "收到，我先帮你看一下。";
			const stream = ensureAssistantStatusShell();
			stream.summary.textContent = summaryText;
			setAssistantStatusKind(stream.shell, stream.trigger, kind);
			scrollTranscriptToBottom({ force: stream.created === true });
		}

		function setAssistantLoadingState(text, kind) {
			const labelText = String(text || "").trim() || "?????";
			const stream = ensureAssistantStatusShell();
			setRunLogTriggerStatus(stream.trigger, labelText);
			stream.dots.hidden = false;
			setAssistantStatusKind(stream.shell, stream.trigger, kind);
			stream.shell.classList.add("is-running");
			stream.shell.classList.remove("is-complete");
			updateRunLogTrigger(stream.trigger, state.activeRunId);
			scrollTranscriptToBottom({ force: stream.created === true });
		}

		function completeAssistantLoadingBubble(kind, text) {
			if (!state.activeStatusShell || !state.activeLoadingDots || !state.activeRunLogTrigger) {
				return;
			}

			setRunLogTriggerStatus(state.activeRunLogTrigger, text);
			state.activeLoadingDots.hidden = true;
			setAssistantStatusKind(state.activeStatusShell, state.activeRunLogTrigger, kind || "ok");
			state.activeStatusShell.classList.remove("is-running");
			state.activeStatusShell.classList.add("is-complete");
			updateRunLogTrigger(state.activeRunLogTrigger, state.activeRunId);
			scrollTranscriptToBottom();
		}

		function sanitizeExportStyles(cssText) {
			return String(cssText || "")
				.replace(/@import[^;]+;/g, "")
				.replace(/@font-face\s*\{[^}]*\}/g, "")
				.replace(/url\((?!['"]?#)[^)]+\)/g, "none");
		}

		async function collectExportStyles() {
			const inlineStyles = Array.from(document.querySelectorAll("style"))
				.map((style) => style.textContent || "")
				.join("\\n")
				.split("\\n")
				.filter((line) => !line.includes("src: url("))
				.join("\\n");
			const linkedStyles = await Promise.all(
				Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
					.filter((link) => link.href.includes("/playground/"))
					.map(async (link) => {
						try {
							const response = await fetch(link.href);
							return response.ok ? await response.text() : "";
						} catch {
							return "";
						}
					}),
			);
			return [inlineStyles, ...linkedStyles].filter(Boolean).join("\\n");
		}

		function prepareExportCloneForCanvas(clone) {
			clone.querySelectorAll("img, video, iframe, canvas").forEach((element) => {
				const placeholder = document.createElement("span");
				placeholder.className = "message-export-media-placeholder";
				placeholder.textContent = element.getAttribute("alt") || "媒体内容";
				element.replaceWith(placeholder);
			});
		}

		function createSvgDataUrl(svgText) {
			return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
		}

		function loadImageFromUrl(url) {
			return new Promise((resolve, reject) => {
				const image = new Image();
				image.onload = () => resolve(image);
				image.onerror = () => reject(new Error("image export load failed"));
				image.src = url;
			});
		}

		function downloadBlob(blob, fileName) {
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = fileName;
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.setTimeout(() => URL.revokeObjectURL(url), 1200);
		}

		async function exportMessageBodyAsImage(body, entry, triggerButton) {
			if (!body) {
				return;
			}

			const originalLabel = triggerButton?.getAttribute("aria-label") || "保存为图片";
			if (triggerButton) {
				triggerButton.disabled = true;
				triggerButton.setAttribute("aria-label", "正在生成图片");
				triggerButton.title = "正在生成图片";
			}

			const width = Math.max(280, Math.ceil(body.getBoundingClientRect().width || 640));
			const clone = body.cloneNode(true);
			clone.querySelectorAll(".message-actions").forEach((element) => element.remove());
			prepareExportCloneForCanvas(clone);

			const frame = document.createElement("div");
			frame.className = "message-export-frame";
			frame.style.width = width + "px";
			frame.appendChild(clone);

			const signature = document.createElement("div");
			signature.className = "export-signature";
			signature.textContent = "UGK Claw 导出";
			frame.appendChild(signature);

			const scratch = document.createElement("div");
			scratch.className = "message-export-scratch";
			scratch.style.width = width + "px";
			scratch.appendChild(frame);
			document.body.appendChild(scratch);

			try {
				if (document.fonts?.ready) {
					await document.fonts.ready;
				}
				const height = Math.max(120, Math.ceil(frame.getBoundingClientRect().height));
				const serialized = new XMLSerializer().serializeToString(frame);
				const svgText =
					'<svg xmlns="http://www.w3.org/2000/svg" width="' +
					width +
					'" height="' +
					height +
					'" viewBox="0 0 ' +
					width +
					" " +
					height +
					'">' +
					'<foreignObject width="100%" height="100%">' +
					'<div xmlns="http://www.w3.org/1999/xhtml">' +
					"<style>" +
					sanitizeExportStyles(await collectExportStyles()) +
					"</style>" +
					serialized +
					"</div>" +
					"</foreignObject>" +
					"</svg>";
				const svgUrl = createSvgDataUrl(svgText);
				try {
					const image = await loadImageFromUrl(svgUrl);
					const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
					const canvas = document.createElement("canvas");
					canvas.width = Math.ceil(width * scale);
					canvas.height = Math.ceil(height * scale);
					const context = canvas.getContext("2d");
					context.scale(scale, scale);
					context.drawImage(image, 0, 0, width, height);
					const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
					if (!blob) {
						throw new Error("image export failed");
					}
					const stamp = new Date().toISOString().replace(/[:.]/g, "-");
					const title = String(entry?.title || "message").replace(/[\\\\/:*?"<>|\\s]+/g, "-").replace(/^-+|-+$/g, "") || "message";
					downloadBlob(blob, "ugk-claw-" + title.toLowerCase() + "-" + stamp + ".png");
				} finally {
					if (svgUrl.startsWith("blob:")) {
						URL.revokeObjectURL(svgUrl);
					}
				}
			} catch (error) {
				console.error("[playground] Failed to export message image", error);
				showError("图片导出失败，请稍后重试。");
			} finally {
				scratch.remove();
				if (triggerButton) {
					triggerButton.disabled = false;
					triggerButton.setAttribute("aria-label", originalLabel);
					triggerButton.title = originalLabel;
				}
			}
		}

		let activeMessageContextMenu = null;
		let activeMessageToast = null;

		function isMobileMessageMenuEnabled() {
			return window.matchMedia?.("(max-width: 640px)")?.matches === true;
		}

		function closeMessageContextMenu() {
			if (!activeMessageContextMenu) {
				return;
			}
			activeMessageContextMenu.remove();
			activeMessageContextMenu = null;
		}

		function showMessageContextToast(message) {
			if (activeMessageToast) {
				activeMessageToast.remove();
			}
			const toast = document.createElement("div");
			toast.className = "message-context-toast";
			toast.textContent = message;
			document.body.appendChild(toast);
			activeMessageToast = toast;
			window.setTimeout(() => {
				if (activeMessageToast === toast) {
					activeMessageToast = null;
				}
				toast.remove();
			}, 1400);
		}

		function positionMessageContextMenu(menu, body) {
			const rect = body.getBoundingClientRect();
			const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
			const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
			const menuWidth = menu.offsetWidth || 128;
			const menuHeight = menu.offsetHeight || 76;
			const left = Math.max(8, Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 8));
			const belowTop = rect.bottom + 6;
			const top = belowTop + menuHeight <= viewportHeight - 8 ? belowTop : Math.max(8, rect.top - menuHeight - 6);
			menu.style.left = left + "px";
			menu.style.top = top + "px";
		}

		function openMessageContextMenu(entry, rendered) {
			if (!rendered?.body) {
				return;
			}
			closeMessageContextMenu();
			const menu = document.createElement("div");
			menu.className = "message-context-menu";
			menu.setAttribute("role", "menu");

			const copyButton = document.createElement("button");
			copyButton.type = "button";
			copyButton.setAttribute("role", "menuitem");
			copyButton.textContent = "复制正文";
			copyButton.addEventListener("click", async () => {
				try {
					await copyTextToClipboard(entry.text || "");
					showMessageContextToast("已复制");
				} catch {
					showMessageContextToast("复制失败");
				} finally {
					closeMessageContextMenu();
				}
			});

			const exportButton = document.createElement("button");
			exportButton.type = "button";
			exportButton.setAttribute("role", "menuitem");
			exportButton.textContent = "导出图片";
			exportButton.addEventListener("click", () => {
				closeMessageContextMenu();
				const imageButton = rendered.actions?.querySelector?.(".message-image-export-button");
				if (imageButton) {
					imageButton.click();
				}
			});

			menu.appendChild(copyButton);
			menu.appendChild(exportButton);
			document.body.appendChild(menu);
			activeMessageContextMenu = menu;
			positionMessageContextMenu(menu, rendered.body);

			window.setTimeout(() => {
				const closeOnOutsidePointer = (event) => {
					if (!menu.contains(event.target)) {
						closeMessageContextMenu();
						document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
					}
				};
				document.addEventListener("pointerdown", closeOnOutsidePointer, true);
			}, 0);
		}

		function attachMobileMessageLongPressMenu(entry, rendered) {
			if (!rendered?.body || !shouldRenderMessageActions(entry)) {
				return;
			}
			let timer = null;
			let startX = 0;
			let startY = 0;

			function clearTimer() {
				if (timer !== null) {
					window.clearTimeout(timer);
					timer = null;
				}
			}

			rendered.body.addEventListener("pointerdown", (event) => {
				if (!isMobileMessageMenuEnabled() || event.button > 0 || event.target?.closest?.("button, a, input, textarea, select")) {
					return;
				}
				startX = event.clientX;
				startY = event.clientY;
				clearTimer();
				timer = window.setTimeout(() => {
					timer = null;
					openMessageContextMenu(entry, rendered);
				}, 500);
			});

			rendered.body.addEventListener("pointermove", (event) => {
				if (timer === null) {
					return;
				}
				if (Math.abs(event.clientX - startX) > 10 || Math.abs(event.clientY - startY) > 10) {
					clearTimer();
				}
			});

			["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
				rendered.body.addEventListener(eventName, clearTimer);
			});

			rendered.body.addEventListener("contextmenu", (event) => {
				if (!isMobileMessageMenuEnabled()) {
					return;
				}
				event.preventDefault();
				openMessageContextMenu(entry, rendered);
			});
		}

		function createMessageImageExportButton(entry, body) {
			const imageButton = document.createElement("button");
			imageButton.type = "button";
			imageButton.className = "message-image-export-button";
			imageButton.setAttribute("aria-label", "保存为图片");
			imageButton.title = "保存为图片";
			imageButton.innerHTML =
				'<svg class="message-action-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
				'<rect x="2.5" y="3" width="11" height="10" rx="2"/>' +
				'<path d="M4.5 11l2.4-2.5 2 1.9 1.6-1.7 1.8 2.3"/>' +
				'<circle cx="5.8" cy="6.1" r="0.9" fill="currentColor" stroke="none"/>' +
				"</svg>" +
				'<span class="visually-hidden">保存为图片</span>';
			imageButton.addEventListener("click", () => {
				void exportMessageBodyAsImage(body, entry, imageButton);
			});
			return imageButton;
		}

		function createMessageActions(entry, content) {
			const actions = document.createElement("div");
			actions.className = "message-actions";
			const body = content?.parentElement || null;

			const copyButton = document.createElement("button");
			copyButton.type = "button";
			copyButton.className = "message-copy-button";
			copyButton.setAttribute("aria-label", "复制正文");
			copyButton.title = "复制正文";
			copyButton.innerHTML =
				'<svg class="message-action-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
				'<rect x="6" y="5.5" width="7" height="8" rx="1.6"/>' +
				'<path d="M3 10.5V3.8C3 2.8 3.8 2 4.8 2h6.7"/>' +
				"</svg>";
			const copyLabel = document.createElement("span");
			copyLabel.className = "visually-hidden";
			copyLabel.textContent = "复制正文";
			copyButton.appendChild(copyLabel);
			copyButton.addEventListener("click", async () => {
				const original = copyButton.getAttribute("aria-label") || "复制正文";
				copyButton.disabled = true;
				try {
					await copyTextToClipboard(entry.text || "");
					copyButton.setAttribute("aria-label", "已复制");
					copyButton.title = "已复制";
					copyLabel.textContent = "已复制";
				} catch {
					copyButton.setAttribute("aria-label", "复制失败");
					copyButton.title = "复制失败";
					copyLabel.textContent = "复制失败";
				} finally {
					window.setTimeout(() => {
						copyButton.setAttribute("aria-label", original);
						copyButton.title = original;
						copyLabel.textContent = original;
						syncMessageCopyButton(entry);
					}, 1200);
				}
			});

			actions.appendChild(copyButton);
			if (body) {
				actions.appendChild(createMessageImageExportButton(entry, body));
			}
			if (canOpenConnRunDetails(entry)) {
				const runButton = document.createElement("button");
				runButton.type = "button";
				runButton.className = "conn-run-open-button";
				runButton.setAttribute("aria-label", "查看后台任务过程");
				runButton.title = "查看后台任务过程";
				runButton.textContent = "查";
				runButton.addEventListener("click", () => {
					void openConnRunDetails(entry);
				});
				actions.appendChild(runButton);
			}
			return { actions, copyButton };
		}

		function shouldRenderMessageActions(entry) {
			return Boolean(
				String(entry?.text || "").trim() ||
					(Array.isArray(entry?.attachments) && entry.attachments.length > 0) ||
					(Array.isArray(entry?.assetRefs) && entry.assetRefs.length > 0) ||
					(Array.isArray(entry?.files) && entry.files.length > 0),
			);
		}

		function findMessageActionsElement(body) {
			return Array.from(body?.children || []).find((element) => element.classList?.contains("message-actions")) || null;
		}

		function syncRenderedMessageActions(entry) {
			if (!entry?.id) {
				return;
			}
			const rendered = renderedMessages.get(entry.id);
			if (!rendered?.body || !rendered?.content) {
				return;
			}

			const existingActions = findMessageActionsElement(rendered.body);
			if (!shouldRenderMessageActions(entry)) {
				existingActions?.remove();
				rendered.actions = null;
				rendered.copyButton = null;
				return;
			}

			if (existingActions) {
				syncMessageCopyButton(entry);
				return;
			}

			const messageActions = createMessageActions(entry, rendered.content);
			rendered.body.appendChild(messageActions.actions);
			rendered.actions = messageActions.actions;
			rendered.copyButton = messageActions.copyButton;
			syncMessageCopyButton(entry);
		}

		function renderTranscriptEntry(entry, insertMode) {
			const card = document.createElement("article");
			const kind = entry.kind;
			const visualKind = kind === "user" ? "user" : "assistant";
			card.className = "message " + visualKind;
			card.dataset.messageKind = kind;
			card.dataset.entryId = entry.id;

			const meta = document.createElement("div");
			meta.className = "message-meta";
			const metaTime = new Date(entry.createdAt || Date.now()).toLocaleTimeString();
			if (kind === "user") {
				meta.innerHTML = "<strong>YOU</strong><span>" + metaTime + "</span>";
			} else {
				meta.innerHTML = "<strong>" + entry.title + "</strong><span>" + metaTime + "</span>";
			}

			const body = document.createElement("div");
			body.className = "message-body";

			const content = document.createElement("div");
			content.className = "message-content";
			content.dataset.entryId = entry.id;
			setMessageContent(content, entry.text);
			body.appendChild(content);

			if (entry.attachments?.length || entry.assetRefs?.length) {
				appendMessageFileChips(body, entry.attachments || [], entry.assetRefs || []);
			}
			if (entry.files?.length) {
				appendFileDownloadList(body, entry.files);
			}

			let messageActions = null;
			if (shouldRenderMessageActions(entry)) {
				messageActions = createMessageActions(entry, content);
				body.appendChild(messageActions.actions);
			}
			card.appendChild(meta);
			card.appendChild(body);

			if (insertMode === "prepend" && transcriptCurrent.firstChild) {
				transcriptCurrent.insertBefore(card, transcriptCurrent.firstChild);
			} else {
				transcriptCurrent.appendChild(card);
			}

			const rendered = {
				card,
				body,
				content,
				actions: messageActions?.actions || null,
				copyButton: messageActions?.copyButton || null,
				statusShell: null,
				statusSummary: null,
				statusTrigger: null,
				entryFrameSignature: buildTranscriptEntryFrameSignature(entry),
				entrySignature: buildTranscriptEntrySignature(entry),
			};
			renderedMessages.set(entry.id, rendered);
			if (entry.runId) {
				card.dataset.runId = entry.runId;
			}
			syncMessageCopyButton(entry);
			attachMobileMessageLongPressMenu(entry, rendered);
			return rendered;
		}

		function stableJson(value) {
			if (Array.isArray(value)) {
				return value.map((item) => stableJson(item));
			}
			if (value && typeof value === "object") {
				return Object.keys(value)
					.sort()
					.reduce((next, key) => {
						const rawValue = value[key];
						if (rawValue !== undefined) {
							next[key] = stableJson(rawValue);
						}
						return next;
					}, {});
			}
			return value;
		}

		function buildTranscriptEntryFrameSignature(entry) {
			return JSON.stringify({
				id: entry?.id || "",
				kind: entry?.kind || "",
				title: entry?.title || "",
				createdAt: entry?.createdAt || "",
				attachments: stableJson(entry?.attachments || []),
				assetRefs: stableJson(entry?.assetRefs || []),
				files: stableJson(entry?.files || []),
			});
		}

		function buildTranscriptEntrySignature(entry) {
			return JSON.stringify({
				frame: buildTranscriptEntryFrameSignature(entry),
				text: entry?.text || "",
				runId: entry?.runId || "",
				process: stableJson(entry?.process || null),
			});
		}

		function getRenderedTranscriptEntryIds() {
			return Array.from(transcriptCurrent.querySelectorAll(".message[data-entry-id]"))
				.map((card) => String(card.dataset.entryId || ""))
				.filter(Boolean);
		}

		function updateRenderedTranscriptEntry(entry) {
			if (!entry?.id) {
				return false;
			}
			const rendered = renderedMessages.get(entry.id);
			if (!rendered?.card || !rendered?.content) {
				return false;
			}

			const nextFrameSignature = buildTranscriptEntryFrameSignature(entry);
			if (rendered.entryFrameSignature !== nextFrameSignature) {
				return false;
			}

			const nextSignature = buildTranscriptEntrySignature(entry);
			if (rendered.entrySignature === nextSignature) {
				return true;
			}

			if (entry.runId) {
				rendered.card.dataset.runId = entry.runId;
			} else {
				delete rendered.card.dataset.runId;
			}
			setMessageContent(rendered.content, entry.text);
			rendered.entrySignature = nextSignature;
			return true;
		}

		function renderConversationEntries(entries) {
			for (const entry of entries) {
				renderTranscriptEntry(entry);
			}
			state.renderedHistoryCount = entries.length;
		}

		function syncRenderedConversationHistory(nextEntries) {
			const entries = Array.isArray(nextEntries) ? nextEntries : [];
			if (entries.length === 0) {
				clearCurrentTranscript();
				state.renderedHistoryCount = 0;
				syncHistoryAutoLoadStatus();
				return;
			}

			const targetCount = Math.min(
				entries.length,
				Math.max(state.renderedHistoryCount || 0, state.historyPageSize || 12),
			);
			const targetEntries = entries.slice(entries.length - targetCount);
			const currentIds = getRenderedTranscriptEntryIds();
			const targetIds = targetEntries.map((entry) => entry.id);

			if (currentIds.length === targetIds.length && currentIds.every((id, index) => id === targetIds[index])) {
				const patched = targetEntries.every((entry) => updateRenderedTranscriptEntry(entry));
				if (patched) {
					state.renderedHistoryCount = targetEntries.length;
					syncHistoryAutoLoadStatus();
					return;
				}
			}

			const canAppend =
				currentIds.length > 0 &&
				currentIds.length < targetIds.length &&
				currentIds.every((id, index) => id === targetIds[index]);
			if (canAppend) {
				const existingById = new Map(entries.map((entry) => [entry.id, entry]));
				const patchedExisting = currentIds.every((id) => updateRenderedTranscriptEntry(existingById.get(id)));
				if (patchedExisting) {
					targetEntries.slice(currentIds.length).forEach((entry) => renderTranscriptEntry(entry));
					state.renderedHistoryCount = targetEntries.length;
					syncHistoryAutoLoadStatus();
					return;
				}
			}

			clearCurrentTranscript();
			renderConversationEntries(targetEntries);
			syncHistoryAutoLoadStatus();
		}

		function applyProcessViewToRenderedMessage(processView, rendered, options) {
			const process = normalizeProcessView(processView);
			if (!process || !rendered?.body || !rendered?.content) {
				return null;
			}

			let stream;
			if (rendered.statusShell?.isConnected && rendered.statusSummary && rendered.statusTrigger) {
				stream = {
					shell: rendered.statusShell,
					summary: rendered.statusSummary,
					trigger: rendered.statusTrigger,
					dots: rendered.statusTrigger.querySelector(".assistant-loading-dots"),
				};
			} else {
				stream = attachAssistantStatusShell(rendered.body, rendered.content);
				rendered.statusShell = stream.shell;
				rendered.statusSummary = stream.summary;
				rendered.statusTrigger = stream.trigger;
				rendered.statusDots = stream.dots;
			}

			const restoredSummary = formatProcessSummaryForStatus(process);
			stream.summary.textContent = restoredSummary || "收到，我正在处理这件事。";
			updateRunLogTrigger(stream.trigger, state.activeRunId);
			stream.shell.classList.remove("is-running", "is-complete");
			setAssistantStatusKind(stream.shell, stream.trigger, process.kind || "system");
			stream.shell.classList.add(options?.running || !process.isComplete ? "is-running" : "is-complete");
			setRunLogTriggerStatus(stream.trigger, process.currentAction || "????");
			if (stream.dots) {
				stream.dots.hidden = !options?.running && process.isComplete;
			}

			if (options?.activate) {
				state.activeStatusShell = stream.shell;
				state.activeStatusSummary = stream.summary;
				state.activeLoadingShell = stream.shell;
				state.activeLoadingDots = stream.dots;
				state.activeRunLogTrigger = stream.trigger;
				state.lastProcessNarration = restoredSummary || "";
			}

			return stream;
		}

		function appendTranscriptMessage(kind, title, text, options) {
			setTranscriptState("active");
			const entry = buildTranscriptEntry(kind, title, text, options);
			rememberConversationMessage(entry);
			const rendered = renderTranscriptEntry(entry, options?.insertMode);
			state.renderedHistoryCount = Math.min(state.conversationHistory.length, state.renderedHistoryCount + 1);
			syncHistoryAutoLoadStatus();
			scrollTranscriptToBottom({ force: options?.forceScroll === true });
			return rendered.content;
		}

		function setMessageContent(content, text) {
			const nextText = String(text || "");
			const entryId = content.dataset.entryId;
			if (entryId) {
				const historyEntry = state.conversationHistory.find((entry) => entry.id === entryId);
				if (historyEntry) {
					historyEntry.text = nextText;
					rememberConversationMessage(historyEntry);
					syncMessageCopyButton(historyEntry);
					syncRenderedMessageActions(historyEntry);
				}
			}
			if (nextText.trim()) {
				content.innerHTML = renderMessageMarkdown(nextText);
				content.classList.remove("is-empty");
				hydrateMarkdownContent(content);
				return;
			}

			content.innerHTML = "";
			content.classList.add("is-empty");
		}

		function appendAssistantProcessMessage(title, text) {
			setTranscriptState("active");
			const entry = buildTranscriptEntry("assistant", title, text);
			rememberConversationMessage(entry);
			const rendered = renderTranscriptEntry(entry);
			state.renderedHistoryCount = Math.min(state.conversationHistory.length, state.renderedHistoryCount + 1);
			syncHistoryAutoLoadStatus();
			const stream = attachAssistantStatusShell(rendered.body, rendered.content);
			rendered.statusShell = stream.shell;
			rendered.statusSummary = stream.summary;
			rendered.statusTrigger = stream.trigger;
			scrollTranscriptToBottom();

			return {
				entry,
				content: rendered.content,
				shell: stream.shell,
				narration: stream.summary,
				action: stream.trigger,
			};
		}

		function attachAssistantProcessShell(body, content) {
			const stream = attachAssistantStatusShell(body, content);
			state.lastProcessNarration = "";
			return stream;
		}

		function ensureProcessStreamCard() {
			if (state.activeStatusSummary && state.activeRunLogTrigger && state.activeStatusShell) {
				return {
					shell: state.activeStatusShell,
					narration: state.activeStatusSummary,
					action: state.activeRunLogTrigger,
				};
			}

			const content = ensureStreamingAssistantMessage();
			const body = content.parentElement;
			if (!body) {
				throw new Error("assistant message body is unavailable");
			}

			return attachAssistantProcessShell(body, content);
		}

		function completeProcessStream() {
			if (!state.activeStatusShell) {
				return;
			}
			completeAssistantProcessShell({
				shell: state.activeStatusShell,
				narration: state.activeStatusSummary,
				action: state.activeRunLogTrigger,
			});
		}

		function appendNarrationToAssistantProcess(stream, text) {
			if (!stream?.narration) {
				return;
			}
			stream.narration.textContent = String(text || "").trim() || "收到，我正在继续推进。";
			scrollTranscriptToBottom();
		}

		function setAssistantProcessAction(stream, text, kind) {
			if (!stream?.shell || !stream?.action) {
				return;
			}

			setRunLogTriggerStatus(state.activeRunLogTrigger, text);
			setAssistantStatusKind(stream.shell, stream.action, kind);
			updateRunLogTrigger(stream.action, state.activeRunId);
			scrollTranscriptToBottom();
		}

		function completeAssistantProcessShell(stream, kind) {
			if (!stream?.shell) {
				return;
			}

			if (kind) {
				setAssistantStatusKind(stream.shell, stream.action, kind);
			}
			stream.shell.classList.remove("is-running");
			stream.shell.classList.add("is-complete");
			if (state.activeLoadingDots) {
				state.activeLoadingDots.hidden = true;
			}
			updateRunLogTrigger(stream.action, state.activeRunId);
			scrollTranscriptToBottom();
		}

		function appendProcessNarrationLine(text) {
			const lineText = String(text || "").trim();
			if (!lineText || lineText === state.lastProcessNarration) {
				return;
			}

			const stream = ensureProcessStreamCard();
			appendNarrationToAssistantProcess(stream, lineText);
			state.lastProcessNarration = lineText;
		}

		function setProcessCurrentAction(text, kind) {
			const actionText = String(text || "").trim() || "等待动作";
			const stream = ensureProcessStreamCard();
			setAssistantProcessAction(stream, actionText, kind);
		}

		function formatProcessSummaryForStatus(process) {
			const latestEntry =
				process && Array.isArray(process.entries) && process.entries.length > 0
					? process.entries[process.entries.length - 1]
					: null;
			if (latestEntry && typeof latestEntry === "object") {
				const detailSummary = summarizeDetail(latestEntry.detail).summary;
				if (latestEntry.title === "任务开始") {
					return "我开始处理这条请求，先确认上下文和可用工具。";
				}
				if (latestEntry.title === "工具开始") {
					return "我现在尝试调用 " + (latestEntry.toolName || "工具") + "，看看能不能拿到需要的信息。";
				}
				if (latestEntry.title === "工具更新") {
					return detailSummary && detailSummary !== "无详情"
						? "我拿到了新的执行片段，当前看到的是：" + detailSummary
						: "我拿到了新的执行片段，继续沿着这条线往下推进。";
				}
				if (latestEntry.title === "工具结束") {
					return latestEntry.isError
						? "这一步没有完全走通，我换个角度继续。"
						: detailSummary && detailSummary !== "无详情"
							? "这一步已经完成，当前结果是：" + detailSummary
							: "这一步已经完成，我开始整理下一步。";
				}
				if (latestEntry.title === "队列更新") {
					return String(latestEntry.detail || "").includes("转向消息: 0")
						? "我收到了一条排队补充，等当前步骤结束后继续处理。"
						: "我收到新的转向要求，当前步骤结束后就会切过去。";
				}
				if (latestEntry.title === "任务完成") {
					return "结果已经准备好了。";
				}
				if (latestEntry.title === "任务已打断") {
					return "当前任务已经停下来了，我先把执行状态收住。";
				}
				if (latestEntry.title === "任务错误") {
					return "这次执行遇到了问题，我把错误保留下来方便你判断。";
				}
				if (detailSummary && detailSummary !== "无详情") {
					return latestEntry.title + "，" + detailSummary;
				}
				if (latestEntry.title) {
					return latestEntry.title;
				}
			}

			const fallbackNarration =
				process && Array.isArray(process.narration) && process.narration.length > 0
					? process.narration[process.narration.length - 1]
					: "";
			const fallbackSummary = summarizeDetail(fallbackNarration).summary;
			return fallbackSummary && fallbackSummary !== "无详情" ? fallbackSummary : "";
		}

		function formatChatRunEventTitle(event) {
			switch (event?.type) {
				case "run_started":
					return "任务开始";
				case "text_delta":
					return "正文增量";
				case "tool_started":
					return "工具开始";
				case "tool_updated":
					return "工具更新";
				case "tool_finished":
					return event.isError ? "工具失败" : "工具完成";
				case "queue_updated":
					return "队列更新";
				case "interrupted":
					return "任务已打断";
				case "done":
					return "任务完成";
				case "error":
					return "任务错误";
				default:
					return String(event?.type || "event");
			}
		}

		function formatChatRunEventDetail(event) {
			switch (event?.type) {
				case "run_started":
					return event.conversationId || "";
				case "text_delta":
					return event.textDelta || "";
				case "tool_started":
					return [event.toolName, event.args].filter(Boolean).join("\\n");
				case "tool_updated":
					return [event.toolName, event.partialResult].filter(Boolean).join("\\n");
				case "tool_finished":
					return [event.toolName, event.result].filter(Boolean).join("\\n");
				case "queue_updated":
					return "转向消息 " + (event.steering?.length || 0) + "\\n追加消息 " + (event.followUp?.length || 0);
				case "interrupted":
					return event.conversationId || "";
				case "done":
					return [event.text, event.sessionFile].filter(Boolean).join("\\n");
				case "error":
					return event.message || "";
				default:
					return JSON.stringify(event, null, 2);
			}
		}

		const RUN_LOG_PAGE_SIZE = 2;
		const RUN_LOG_DETAIL_MAX_CHARS = 900;

		function trimRunLogText(text) {
			const normalizedText = String(text || "");
			if (normalizedText.length <= RUN_LOG_DETAIL_MAX_CHARS) {
				return normalizedText;
			}
			return normalizedText.slice(0, RUN_LOG_DETAIL_MAX_CHARS).trimEnd() + "\\n...[truncated]";
		}

		async function fetchChatRunEvents(conversationId, runId, before) {
			const params = new URLSearchParams({
				conversationId,
				limit: String(RUN_LOG_PAGE_SIZE),
			});
			if (before) {
				params.set("before", String(before));
			}
			const response = await fetch(getAgentApiPath("/chat/runs/" + encodeURIComponent(runId) + "/events") + "?" + params.toString(), {
				method: "GET",
				headers: { accept: "application/json" },
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				const errorMessage = payload?.error?.message || payload?.message || "无法读取运行日志";
				throw new Error(errorMessage);
			}
			return {
				events: Array.isArray(payload?.events) ? payload.events : [],
				hasMore: Boolean(payload?.hasMore),
				nextBefore: payload?.nextBefore ? String(payload.nextBefore) : "",
			};
		}

		function closeChatRunLog() {
			if (chatRunLogDialog.hidden) {
				return false;
			}
			releasePanelFocusBeforeHide(chatRunLogDialog, state.chatRunLogRestoreFocusElement);
			chatRunLogDialog.classList.remove("open");
			chatRunLogDialog.hidden = true;
			chatRunLogDialog.setAttribute("aria-hidden", "true");
			state.chatRunLogRestoreFocusElement = null;
			state.chatRunLogPagination = null;
			return true;
		}

		function appendChatRunLogEvents(list, events) {
			for (const event of events) {
				const item = document.createElement("article");
				item.className = "chat-run-log-item";
				const title = document.createElement("strong");
				title.className = "chat-run-log-item-title";
				title.textContent = formatChatRunEventTitle(event);
				const detail = document.createElement("pre");
				detail.className = "chat-run-log-item-detail";
				detail.textContent = trimRunLogText(formatChatRunEventDetail(event));
				item.appendChild(title);
				item.appendChild(detail);
				list.appendChild(item);
			}
		}

		function renderChatRunLog(conversationId, runId, payload) {
			chatRunLogTitle.textContent = "运行日志";
			chatRunLogBody.innerHTML = "";

			const meta = document.createElement("div");
			meta.className = "chat-run-log-meta";
			meta.textContent = "会话 " + conversationId + " · 运行 " + runId;
			chatRunLogBody.appendChild(meta);

			const events = Array.isArray(payload?.events) ? payload.events : [];
			if (events.length === 0) {
				const empty = document.createElement("div");
				empty.className = "chat-run-log-empty";
				empty.textContent = "这一轮还没有可以展示的运行日志。";
				chatRunLogBody.appendChild(empty);
				return;
			}

			const list = document.createElement("div");
			list.className = "chat-run-log-list";
			appendChatRunLogEvents(list, events);
			chatRunLogBody.appendChild(list);
			const loadState = document.createElement("div");
			loadState.className = "chat-run-log-load-state";
			chatRunLogBody.appendChild(loadState);
			state.chatRunLogPagination = {
				conversationId,
				runId,
				list,
				loadState,
				nextBefore: payload?.nextBefore || "",
				hasMore: Boolean(payload?.hasMore),
				loading: false,
			};
			loadState.textContent = state.chatRunLogPagination.hasMore ? "向下滚动加载更早的日志" : "已显示全部日志";
		}

		async function loadMoreChatRunLog() {
			const pagination = state.chatRunLogPagination;
			if (!pagination || !pagination.hasMore || pagination.loading) {
				return;
			}
			pagination.loading = true;
			pagination.loadState.textContent = "正在加载更早的日志...";
			try {
				const payload = await fetchChatRunEvents(
					pagination.conversationId,
					pagination.runId,
					pagination.nextBefore,
				);
				appendChatRunLogEvents(pagination.list, payload.events);
				pagination.nextBefore = payload.nextBefore || "";
				pagination.hasMore = Boolean(payload.hasMore);
				pagination.loadState.textContent = pagination.hasMore ? "向下滚动加载更早的日志" : "已显示全部日志";
			} catch (error) {
				pagination.loadState.textContent = error instanceof Error ? error.message : "无法加载更多运行日志";
			} finally {
				pagination.loading = false;
			}
		}

		async function openChatRunLog(runId, restoreFocusElement) {
			const nextRunId = String(runId || "").trim();
			const conversationId = String(state.conversationId || "").trim();
			if (!nextRunId || !conversationId) {
				return;
			}

			state.chatRunLogRestoreFocusElement = rememberPanelReturnFocus(restoreFocusElement);
			chatRunLogDialog.hidden = false;
			chatRunLogDialog.classList.add("open");
			chatRunLogDialog.setAttribute("aria-hidden", "false");
			chatRunLogBody.textContent = "正在读取运行日志...";

			try {
				const payload = await fetchChatRunEvents(conversationId, nextRunId);
				renderChatRunLog(conversationId, nextRunId, payload);
			} catch (error) {
				chatRunLogBody.textContent = error instanceof Error ? error.message : "无法读取运行日志";
			}
		}

		async function copyTextToClipboard(text) {
			if (navigator.clipboard && window.isSecureContext) {
				await navigator.clipboard.writeText(text);
				return;
			}

			const textarea = document.createElement("textarea");
			textarea.value = text;
			textarea.setAttribute("readonly", "");
			textarea.style.position = "fixed";
			textarea.style.left = "-9999px";
			document.body.appendChild(textarea);
			textarea.select();

			try {
				document.execCommand("copy");
			} finally {
				textarea.remove();
			}
		}

		function hydrateMarkdownContent(root) {
			root.querySelectorAll("table").forEach((table) => {
				if (table.closest(".markdown-table-scroll")) {
					return;
				}

				const wrapper = document.createElement("div");
				wrapper.className = "markdown-table-scroll";
				table.parentNode?.insertBefore(wrapper, table);
				wrapper.appendChild(table);
			});

			root.querySelectorAll("pre").forEach((pre) => {
				if (pre.closest(".code-block")) {
					return;
				}

				const code = pre.querySelector("code");
				const languageClass = code
					? Array.from(code.classList).find((className) => className.startsWith("language-"))
					: "";
				const language = languageClass ? languageClass.replace("language-", "") : "code";

				const wrapper = document.createElement("div");
				wrapper.className = "code-block";

				const toolbar = document.createElement("div");
				toolbar.className = "code-block-toolbar";

				const label = document.createElement("span");
				label.className = "code-block-language";
				label.textContent = language || "代码";

				const copyButton = document.createElement("button");
				copyButton.type = "button";
				copyButton.className = "copy-code-button";
				copyButton.textContent = "复制";
				copyButton.addEventListener("click", async () => {
					const original = copyButton.textContent || "复制";
					copyButton.disabled = true;

					try {
						await copyTextToClipboard(code?.textContent || pre.textContent || "");
						copyButton.textContent = "已复制";
					} catch {
						copyButton.textContent = "失败";
					} finally {
						window.setTimeout(() => {
							copyButton.textContent = original;
							copyButton.disabled = false;
						}, 1200);
					}
				});

				toolbar.appendChild(label);
				toolbar.appendChild(copyButton);
				pre.parentNode?.insertBefore(wrapper, pre);
				wrapper.appendChild(toolbar);
				wrapper.appendChild(pre);
			});
		}

		function ensureStreamingAssistantMessage() {
			if (!state.activeAssistantContent) {
				state.activeAssistantContent = appendTranscriptMessage("assistant", "助手", "", {
					runId: state.activeRunId || undefined,
				});
			}
			const entryId = state.activeAssistantContent?.dataset?.entryId;
			if (entryId && state.activeRunId) {
				setConversationEntryRunId(entryId, state.activeRunId);
				const rendered = renderedMessages.get(entryId);
				if (rendered?.card) {
					rendered.card.dataset.runId = state.activeRunId;
				}
			}
			return state.activeAssistantContent;
		}

		function bindPlaygroundTranscriptRenderer() {
			transcriptCurrent.querySelectorAll(".message-content").forEach((content) => {
				hydrateMarkdownContent(content);
			});
			chatRunLogClose?.addEventListener("click", () => {
				closeChatRunLog();
			});
			chatRunLogDialog?.addEventListener("click", (event) => {
				if (event.target === chatRunLogDialog) {
					closeChatRunLog();
				}
			});
			chatRunLogBody?.addEventListener("scroll", () => {
				if (chatRunLogBody.scrollTop + chatRunLogBody.clientHeight >= chatRunLogBody.scrollHeight - 32) {
					void loadMoreChatRunLog();
				}
			});
			document.addEventListener("keydown", (event) => {
				if (event.key === "Escape" && !chatRunLogDialog?.hidden) {
					closeChatRunLog();
				}
			});
		}
	`;
}
