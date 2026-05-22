export function getPlaygroundAssetElementRefsScript(): string {
	return `
		const dropZone = document.getElementById("drop-zone");
		const fileInput = document.getElementById("file-input");
		const filePickerAction = document.getElementById("file-picker-action");
		const fileList = document.getElementById("file-list");
		const selectedAssetsSection = document.getElementById("selected-assets");
		const selectedAssetList = document.getElementById("selected-asset-list");

	`;
}

export function getPlaygroundAssetControllerScript(): string {
	return `
		function formatFileSize(size) {
			if (!Number.isFinite(size)) {
				return "unknown";
			}
			if (size < 1024) {
				return size + " B";
			}
			if (size < 1024 * 1024) {
				return (size / 1024).toFixed(1) + " KB";
			}
			return (size / (1024 * 1024)).toFixed(1) + " MB";
		}

		const MAX_COMPOSER_ATTACHMENTS = 5;
		const ASSET_DETAIL_CONCURRENCY_LIMIT = 4;

		async function uploadFilesAsAssets(files, options) {
			const selectedFiles = Array.from(files || []);
			if (selectedFiles.length === 0) {
				return [];
			}
			if (selectedFiles.length > MAX_COMPOSER_ATTACHMENTS) {
				throw new Error("一次最多上传 " + MAX_COMPOSER_ATTACHMENTS + " 个文件");
			}

			const formData = new FormData();
			if (options?.conversationId) {
				formData.append("conversationId", options.conversationId);
			}
			for (const file of selectedFiles) {
				formData.append("files", file, file.name);
			}

			const response = await fetch("/v1/assets/upload", {
				method: "POST",
				headers: {
					accept: "application/json",
				},
				body: formData,
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				const fallbackMessage = "上传失败（HTTP " + response.status + "）";
				throw new Error(payload?.error?.message || payload?.message || fallbackMessage);
			}
			return Array.isArray(payload?.assets) ? payload.assets : [];
		}

		function appendComposerSystemNotice(message) {
			const text = String(message || "").trim();
			if (!text) {
				return;
			}
			if (!state.conversationId) {
				ensureConversationId();
			}
			appendTranscriptMessage("notification", "\\u7cfb\\u7edf\\u63d0\\u793a", text, {
				forceScroll: true,
			});
		}

		function isAttachmentLimitProcessNote(title, detail) {
			const text = (String(title || "") + " " + String(detail || "")).toLowerCase();
			return (
				text.includes("\\u6587\\u4ef6\\u5df2\\u622a\\u65ad") ||
				text.includes("\\u4e00\\u6b21\\u6700\\u591a\\u53d1\\u9001 5 \\u4e2a\\u6587\\u4ef6") ||
				text.includes("max 5 files")
			);
		}

		function notifyAttachmentLimitIfNeeded(files) {
			const totalCount = Array.from(files || []).length;
			if (totalCount <= MAX_COMPOSER_ATTACHMENTS) {
				return;
			}
			appendComposerSystemNotice(
				"\\u4e00\\u6b21\\u6700\\u591a\\u53d1\\u9001 " +
					MAX_COMPOSER_ATTACHMENTS +
					" \\u4e2a\\u6587\\u4ef6\\uff0c\\u5df2\\u4fdd\\u7559\\u524d " +
					MAX_COMPOSER_ATTACHMENTS +
					" \\u4e2a\\u3002\\u591a\\u51fa\\u7684 " +
					(totalCount - MAX_COMPOSER_ATTACHMENTS) +
					" \\u4e2a\\u8bf7\\u5206\\u6279\\u53d1\\u9001\\u3002",
			);
		}

		function renderUploadFileList() {
			fileList.innerHTML = "";
			renderContextUsageBar();
		}

		function getAssetPickerTarget() {
			return state.assetPickerTarget === "connEditor" ? "connEditor" : "composer";
		}

		function getSelectedAssetRefsForTarget(target) {
			return target === "connEditor" ? state.connEditorSelectedAssetRefs : state.selectedAssetRefs;
		}

		function setSelectedAssetRefsForTarget(target, assetRefs) {
			const normalized = Array.isArray(assetRefs)
				? Array.from(new Set(assetRefs.map((assetId) => String(assetId || "").trim()).filter(Boolean)))
				: [];
			if (target === "connEditor") {
				state.connEditorSelectedAssetRefs = normalized;
				if (typeof renderConnEditorSelectedAssets === "function") {
					renderConnEditorSelectedAssets();
				}
				return;
			}
			state.selectedAssetRefs = normalized;
			renderSelectedAssets();
		}

		function getSelectedAssets() {
			return state.selectedAssetRefs
				.map((assetId) => state.recentAssets.find((asset) => asset.assetId === assetId))
				.filter(Boolean);
		}

		async function fetchAssetDetail(assetId, options) {
			try {
				const response = await fetch("/v1/assets/" + encodeURIComponent(assetId), {
					method: "GET",
					headers: { accept: "application/json" },
				});
				if (!response.ok) {
					return null;
				}
				const payload = await response.json().catch(() => ({}));
				return payload?.asset && typeof payload.asset === "object" ? payload.asset : null;
			} catch (error) {
				if (!options?.silent) {
					const messageText = error instanceof Error ? error.message : "加载资产详情失败";
					showError(messageText);
				}
				return null;
			}
		}

		function pumpAssetDetailQueue() {
			if (state.assetDetailActiveCount >= ASSET_DETAIL_CONCURRENCY_LIMIT) {
				return;
			}
			while (state.assetDetailActiveCount < ASSET_DETAIL_CONCURRENCY_LIMIT && state.assetDetailQueue.length > 0) {
				const entry = state.assetDetailQueue.shift();
				if (!entry) {
					continue;
				}
				state.assetDetailActiveCount += 1;
				fetchAssetDetail(entry.assetId, entry.options)
					.then((asset) => {
						entry.resolve(asset);
						if (asset) {
							mergeRecentAssets([asset]);
						}
					})
					.catch(() => {
						entry.resolve(null);
					})
					.finally(() => {
						state.assetDetailActiveCount = Math.max(0, state.assetDetailActiveCount - 1);
						state.assetDetailInFlightById.delete(entry.assetId);
						pumpAssetDetailQueue();
					});
			}
		}

		function enqueueAssetDetailLoad(assetId, options) {
			const existingAsset = state.recentAssets.find((asset) => asset.assetId === assetId);
			if (existingAsset) {
				return Promise.resolve(existingAsset);
			}
			if (state.assetDetailInFlightById.has(assetId)) {
				return state.assetDetailInFlightById.get(assetId);
			}
			const promise = new Promise((resolve) => {
				state.assetDetailQueue.push({
					assetId,
					options,
					resolve,
				});
				pumpAssetDetailQueue();
			});
			state.assetDetailInFlightById.set(assetId, promise);
			return promise;
		}

		async function loadAssetDetails(assetIds, options) {
			const pendingAssetIds = Array.isArray(assetIds)
				? Array.from(
						new Set(
							assetIds
								.map((assetId) => String(assetId || "").trim())
								.filter((assetId) => assetId && !state.recentAssets.some((asset) => asset.assetId === assetId)),
						),
					)
				: [];
			if (pendingAssetIds.length === 0) {
				return [];
			}

			const assets = (
				await Promise.all(pendingAssetIds.map((assetId) => enqueueAssetDetailLoad(assetId, options)))
			).filter(Boolean);

			if (assets.length > 0) {
				mergeRecentAssets(assets);
			}
			return assets;
		}

		async function ensureRecentAssetsForRefs(assetRefs, options) {
			return await loadAssetDetails(assetRefs, options);
		}

		function renderSelectedAssets() {
			selectedAssetList.innerHTML = "";
			const selectedAssets = getSelectedAssets();
			selectedAssetsSection.classList.toggle("visible", selectedAssets.length > 0);
			if (selectedAssets.length === 0) {
				renderContextUsageBar();
				return;
			}

			for (const asset of selectedAssets) {
				const item = createFileChip({
					tone: "asset",
					fileName: asset.fileName,
					meta:
						(asset.kind || "metadata") +
						" / " +
						(asset.mimeType || "application/octet-stream") +
						" / " +
						formatFileSize(asset.sizeBytes),
					onRemove: () => {
						removeSelectedAsset(asset.assetId);
					},
				});
				selectedAssetList.appendChild(item);
			}
			renderContextUsageBar();
		}

		function deriveFileBadge(fileName, fallback) {
			const label = String(fileName || "").trim();
			const extensionMatch = label.match(/\.([a-z0-9]{1,5})$/i);
			if (extensionMatch) {
				return extensionMatch[1].slice(0, 3).toUpperCase();
			}

			const fallbackText = String(fallback || "").trim().toLowerCase();
			if (fallbackText.startsWith("text/")) {
				return "TXT";
			}
			if (fallbackText.includes("markdown")) {
				return "MD";
			}
			if (fallbackText.includes("json")) {
				return "JSN";
			}
			if (fallbackText.includes("image/")) {
				return "IMG";
			}

			return "FILE";
		}

		function createFileChip({ tone, fileName, meta, onRemove }) {
			const item = document.createElement("div");
			item.className = "file-chip " + (tone || "pending");
			item.title = String(meta || "");

			const badge = document.createElement("span");
			badge.className = "file-chip-badge";
			badge.textContent = deriveFileBadge(fileName, meta);

			const label = document.createElement("span");
			label.className = "file-chip-label";
			label.textContent = fileName || "untitled";

			item.appendChild(badge);
			item.appendChild(label);
			if (typeof onRemove === "function") {
				const removeButton = document.createElement("button");
				removeButton.type = "button";
				removeButton.className = "file-chip-remove";
				removeButton.textContent = "×";
				removeButton.setAttribute("aria-label", "移除 " + (fileName || "文件"));
				removeButton.addEventListener("click", () => {
					onRemove();
				});
				item.appendChild(removeButton);
			}
			return item;
		}

		function getReferencedAssets(assetRefs) {
			return assetRefs
				.map((asset) =>
					typeof asset === "string" ? state.recentAssets.find((current) => current.assetId === asset) : asset,
				)
				.filter(Boolean);
		}

		function appendMessageFileChips(body, attachments, assetRefs) {
			const normalizedAttachments = Array.isArray(attachments) ? attachments : [];
			const referencedAssets = getReferencedAssets(Array.isArray(assetRefs) ? assetRefs : []);
			if (normalizedAttachments.length === 0 && referencedAssets.length === 0) {
				return;
			}

			const strip = document.createElement("div");
			strip.className = "message-file-strip";

			for (const attachment of normalizedAttachments) {
				strip.appendChild(
					createFileChip({
						tone: "pending",
						fileName: attachment.fileName,
						meta:
							(attachment.mimeType || "application/octet-stream") +
							" / " +
							formatFileSize(attachment.sizeBytes),
					}),
				);
			}

			for (const asset of referencedAssets) {
				strip.appendChild(
					createFileChip({
						tone: "asset",
						fileName: asset.fileName,
						meta:
							(asset.kind || "metadata") +
							" / " +
							(asset.mimeType || "application/octet-stream") +
							" / " +
							formatFileSize(asset.sizeBytes),
					}),
				);
			}

			body.classList.add("has-file-chips");
			body.appendChild(strip);
		}

		function appendUserTranscriptMessage(message, attachments, assetRefs) {
			return appendTranscriptMessage("user", state.conversationId, message, {
				attachments,
				assetRefs,
				forceScroll: true,
			});
		}

		function appendFileDownloadList(container, files) {
			if (!Array.isArray(files) || files.length === 0) {
				return;
			}

			const downloads = document.createElement("div");
			downloads.className = "file-downloads";

			for (const file of files) {
				const item = document.createElement("div");
				item.className = "file-download";
				item.innerHTML = "<div><strong></strong><span></span></div><div class=\\"file-download-actions\\"></div>";
				item.querySelector("strong").textContent = file.fileName || "download";
				item.querySelector("span").textContent =
					(file.mimeType || "application/octet-stream") + " / " + formatFileSize(file.sizeBytes);
				const actions = item.querySelector(".file-download-actions");
				if (canPreviewFile(file.mimeType)) {
					const openLink = document.createElement("a");
					openLink.href = file.downloadUrl;
					openLink.target = "_blank";
					openLink.rel = "noreferrer noopener";
					openLink.textContent = "打开";
					actions.appendChild(openLink);
				}

				const link = document.createElement("a");
				link.href = buildDownloadUrl(file.downloadUrl);
				link.download = file.fileName || "";
				link.textContent = "下载";
				actions.appendChild(link);
				downloads.appendChild(item);
			}

			container.appendChild(downloads);
		}

		function canPreviewFile(mimeType) {
			const normalized = String(mimeType || "").trim().toLowerCase();
			return (
				normalized.startsWith("image/png") ||
				normalized.startsWith("image/jpeg") ||
				normalized.startsWith("image/gif") ||
				normalized.startsWith("image/webp") ||
				normalized === "application/pdf" ||
				normalized === "text/html" ||
				normalized === "text/plain" ||
				normalized === "text/markdown" ||
				normalized === "application/json" ||
				normalized === "text/csv"
			);
		}

		function buildDownloadUrl(downloadUrl) {
			const normalized = String(downloadUrl || "");
			if (!normalized) {
				return "";
			}
			return normalized.includes("?") ? normalized + "&download=1" : normalized + "?download=1";
		}

		function formatAssetKind(kind) {
			const normalized = String(kind || "metadata").trim().toLowerCase();
			if (normalized === "text") {
				return "TEXT";
			}
			if (normalized === "binary") {
				return "BIN";
			}
			return "META";
		}

		function getAssetTypeTone(asset) {
			const fileName = String(asset.fileName || "").trim().toLowerCase();
			const mimeType = String(asset.mimeType || "").trim().toLowerCase();
			const kind = String(asset.kind || "").trim().toLowerCase();
			if (/\.(tar\.gz|tgz|zip|gz|rar|7z)$/i.test(fileName) || mimeType.includes("zip") || mimeType.includes("gzip") || mimeType.includes("x-tar")) {
				return "archive";
			}
			if (/\.(java|js|mjs|cjs|ts|tsx|jsx|py|go|rs|c|cpp|h|hpp|cs|kt|swift|sh|ps1)$/i.test(fileName)) {
				return "code";
			}
			if (/\.(html|htm|css|svg)$/i.test(fileName) || mimeType === "text/html" || mimeType === "text/css" || mimeType === "image/svg+xml") {
				return "web";
			}
			if (/\.(json|jsonl|csv|tsv|xlsx|xls)$/i.test(fileName) || mimeType.includes("json") || mimeType.includes("csv") || mimeType.includes("spreadsheet")) {
				return "data";
			}
			if (mimeType.startsWith("image/")) {
				return "image";
			}
			if (/\.(md|markdown|txt|pdf|doc|docx)$/i.test(fileName) || mimeType.includes("markdown") || mimeType === "text/plain" || mimeType === "application/pdf") {
				return "document";
			}
			if (kind === "binary") {
				return "binary";
			}
			if (kind === "text") {
				return "text";
			}
			return "meta";
		}

		function formatAssetMeta(asset) {
			const parts = [
				formatFileSize(asset.sizeBytes),
			];
			if (asset.assetId) {
				parts.push(String(asset.assetId).slice(0, 12));
			}
			return parts.join(" / ");
		}

		function getAssetDateGroupLabel(assetDate, today, yesterday) {
			if (assetDate === today) {
				return "今天";
			}
			if (assetDate === yesterday) {
				return "昨天";
			}
			return assetDate || "更早";
		}

		function renderAssetPickerList() {
			assetModalList.innerHTML = "";
			const selectedAssetRefs = getSelectedAssetRefsForTarget(getAssetPickerTarget());
			if (!Array.isArray(state.recentAssets) || state.recentAssets.length === 0) {
				const empty = document.createElement("div");
				empty.className = "asset-empty";
				empty.textContent = "暂无可复用资产，先上传文件或让助手生成文件。";
				assetModalList.appendChild(empty);
				return;
			}

			const today = new Date().toISOString().slice(0, 10);
			const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
			let currentDateGroup = "";
			const dateGroupCounts = state.recentAssets.reduce((counts, asset) => {
				const key = asset.createdAt ? asset.createdAt.slice(0, 10) : "";
				counts.set(key, (counts.get(key) || 0) + 1);
				return counts;
			}, new Map());

			for (const asset of state.recentAssets) {
				const assetDate = asset.createdAt ? asset.createdAt.slice(0, 10) : "";
				if (assetDate && assetDate !== currentDateGroup) {
					currentDateGroup = assetDate;
					const header = document.createElement("div");
					header.className = "asset-date-group-header";
					header.innerHTML = "<strong></strong><span></span>";
					header.querySelector("strong").textContent = getAssetDateGroupLabel(assetDate, today, yesterday);
					header.querySelector("span").textContent = (dateGroupCounts.get(assetDate) || 0) + " 个文件";
					assetModalList.appendChild(header);
				}

				const item = document.createElement("div");
				item.className = "asset-pill" + (selectedAssetRefs.includes(asset.assetId) ? " active" : "");
				item.innerHTML = "<div class=\\"asset-pill-main\\"><span class=\\"asset-pill-type\\"><b></b><em></em></span><div class=\\"asset-pill-copy\\"><strong></strong><span class=\\"asset-pill-meta\\"></span></div></div><div class=\\"asset-pill-actions\\"><button class=\\"asset-pill-reuse-button\\" type=\\"button\\"></button><a class=\\"asset-pill-download-button\\" href=\\"\\" download>下载</a><button class=\\"asset-pill-delete-button\\" type=\\"button\\">删除</button></div>";
				const typeBadge = item.querySelector(".asset-pill-type");
				typeBadge.classList.add("asset-pill-type--" + getAssetTypeTone(asset));
				typeBadge.querySelector("b").textContent = deriveFileBadge(asset.fileName, asset.mimeType || asset.kind);
				typeBadge.querySelector("em").textContent = formatAssetKind(asset.kind);
				item.querySelector("strong").textContent = asset.fileName;
				item.querySelector(".asset-pill-meta").textContent = formatAssetMeta(asset);
				const toggleButton = item.querySelector(".asset-pill-reuse-button");
				toggleButton.textContent = selectedAssetRefs.includes(asset.assetId) ? "已选" : "复用";
				toggleButton.disabled = selectedAssetRefs.includes(asset.assetId);
				toggleButton.addEventListener("click", (event) => {
					event.stopPropagation();
					selectAssetForReuse(asset.assetId);
				});
				const downloadLink = item.querySelector(".asset-pill-download-button");
				const downloadUrl = buildDownloadUrl(asset.downloadUrl);
				if (downloadUrl) {
					downloadLink.href = downloadUrl;
					downloadLink.download = asset.fileName || "";
					downloadLink.addEventListener("click", (event) => {
						event.stopPropagation();
					});
				} else {
					downloadLink.remove();
				}
				const deleteButton = item.querySelector(".asset-pill-delete-button");
				deleteButton.disabled = state.assetDeletingAssetId === asset.assetId;
				deleteButton.textContent = state.assetDeletingAssetId === asset.assetId ? "删除中" : "删除";
				deleteButton.addEventListener("click", (event) => {
					event.stopPropagation();
					void deleteAssetFromLibrary(asset.assetId, deleteButton);
				});
				assetModalList.appendChild(item);
			}
		}

		async function deleteAssetFromLibrary(assetId, restoreFocusElement) {
			const normalizedAssetId = String(assetId || "").trim();
			if (!normalizedAssetId || state.assetDeletingAssetId) {
				return;
			}
			const asset = state.recentAssets.find((current) => current.assetId === normalizedAssetId);
			const confirmed = await openConfirmDialog({
				title: "删除文件？",
				description:
					"文件：" +
					(asset?.fileName || normalizedAssetId) +
					"\\n\\n删除后这个文件会从文件库移除，后续不能再选择复用。",
				confirmText: "删除",
				cancelText: "取消",
				tone: "danger",
				restoreFocusElement,
			});
			if (!confirmed) {
				return;
			}

			state.assetDeletingAssetId = normalizedAssetId;
			renderAssetPickerList();
			try {
				const response = await fetch("/v1/assets/" + encodeURIComponent(assetId), {
					method: "DELETE",
					headers: { accept: "application/json" },
				});
				if (!response.ok) {
					const payload = await response.json().catch(() => ({}));
					const fallbackMessage = response.status === 404 ? "文件不存在或已经删除" : "删除文件失败";
					throw new Error(payload?.error?.message || payload?.message || fallbackMessage);
				}
				state.recentAssets = state.recentAssets.filter((current) => current.assetId !== normalizedAssetId);
				state.selectedAssetRefs = state.selectedAssetRefs.filter((currentId) => currentId !== normalizedAssetId);
				state.connEditorSelectedAssetRefs = state.connEditorSelectedAssetRefs.filter(
					(currentId) => currentId !== normalizedAssetId,
				);
				if (typeof connEditorAssetRefs !== "undefined" && connEditorAssetRefs) {
					connEditorAssetRefs.value = state.connEditorSelectedAssetRefs.join("\\\\n");
				}
				renderSelectedAssets();
				if (typeof renderConnEditorSelectedAssets === "function") {
					renderConnEditorSelectedAssets();
				}
				renderAssetPickerList();
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "删除文件失败";
				showError(messageText);
			} finally {
				state.assetDeletingAssetId = "";
				renderAssetPickerList();
			}
		}

		function clearSelectedFiles() {
			fileInput.value = "";
			renderUploadFileList();
		}

		function openAssetLibrary(restoreFocusElement, options) {
			state.assetModalOpen = true;
			state.assetPickerTarget = options?.target === "connEditor" ? "connEditor" : "composer";
			state.assetModalRestoreFocusElement = rememberPanelReturnFocus(
				restoreFocusElement || openAssetLibraryButton,
			);
			assetModal.hidden = false;
			assetModal.classList.add("open");
			assetModal.setAttribute("aria-hidden", "false");
			renderAssetPickerList();
			if (!state.assetsLoadedOnce) { void loadAssets(true); }
			openWorkspacePanel("assets", assetModal, {
				forceOverlay: options?.target === "connEditor" || options?.mode !== "workspace",
			});
		}

		function closeAssetLibrary() {
			state.assetModalOpen = false;
			state.assetPickerTarget = "composer";
			restoreFocusAfterPanelClose(assetModal, state.assetModalRestoreFocusElement);
			state.assetModalRestoreFocusElement = null;
			assetModal.classList.remove("open");
			assetModal.hidden = true;
			assetModal.setAttribute("aria-hidden", "true");
			closeWorkspacePanel("assets", assetModal);
		}

		function selectAssetForReuse(assetId) {
			const target = getAssetPickerTarget();
			const selectedAssetRefs = getSelectedAssetRefsForTarget(target);
			if (!selectedAssetRefs.includes(assetId)) {
				setSelectedAssetRefsForTarget(target, [...selectedAssetRefs, assetId]);
			}
			renderAssetPickerList();
			closeAssetLibrary();
		}

		function clearSelectedAssetRefs() {
			state.selectedAssetRefs = [];
			renderSelectedAssets();
			renderAssetPickerList();
		}

		function createComposerDraft() {
			return {
				message: messageInput.value,
				assetRefs: [...state.selectedAssetRefs],
			};
		}

		function clearComposerDraft() {
			messageInput.value = "";
			syncComposerTextareaHeight();
			clearSelectedFiles();
			clearSelectedAssetRefs();
		}

		function restoreComposerDraft(draft) {
			messageInput.value = String(draft?.message || "");
			syncComposerTextareaHeight();
			state.selectedAssetRefs = Array.isArray(draft?.assetRefs) ? [...draft.assetRefs] : [];
			renderUploadFileList();
			renderSelectedAssets();
			renderAssetPickerList();
			messageInput.focus();
		}

		function removeSelectedAsset(assetId) {
			state.selectedAssetRefs = state.selectedAssetRefs.filter((currentId) => currentId !== assetId);
			renderSelectedAssets();
			renderAssetPickerList();
		}


		function describeNode(node) {
			if (!(node instanceof Element)) {
				return "unknown";
			}
			if (node.id) {
				return "#" + node.id;
			}
			if (typeof node.className === "string" && node.className.trim()) {
				return node.tagName.toLowerCase() + "." + node.className.trim().replace(/\\s+/g, ".");
			}
			return node.tagName.toLowerCase();
		}

		function pushDragDebug() {
			return;
		}

		function showGlobalDropHint() {
			dragOverlay.classList.add("active");
			chatStage.classList.add("drag-active");
			composerDropTarget.classList.add("drag-active");
			dropZone.classList.add("drag-active");
		}

		function hideGlobalDropHint() {
			dragOverlay.classList.remove("active");
			chatStage.classList.remove("drag-active");
			composerDropTarget.classList.remove("drag-active");
			dropZone.classList.remove("drag-active");
			state.dragDepth = 0;
		}


		function hasDragPayload(event) {
			return Boolean(event.dataTransfer);
		}

		function hasDroppedFiles(event) {
			const dataTransfer = event.dataTransfer;
			if (!dataTransfer) {
				return false;
			}

			if (dataTransfer.files && dataTransfer.files.length > 0) {
				return true;
			}

			if (Array.from(dataTransfer.items || []).some((item) => item.kind === "file")) {
				return true;
			}

			const dragTypes = Array.from(dataTransfer.types || []);
			if (dragTypes.some((type) => /files|application\\/x-moz-file/i.test(type))) {
				return true;
			}

			return false;
		}

		function preventWindowFileDrop(event) {
			pushDragDebug("window-guard", event);
			if (!hasDragPayload(event)) {
				return;
			}
			event.preventDefault();
			setCopyDropEffect(event);
		}

		function setCopyDropEffect(event) {
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = "copy";
			}
		}

		async function handleDroppedFiles(files, sourceLabel) {
			clearError();
			try {
				if (!state.conversationId) {
					await ensureCurrentConversation({ silent: true });
				}
				ensureConversationId();
				state.composerUploadingAssets = true;
				filePickerAction.disabled = true;
				fileInput.disabled = true;
				const assets = await uploadFilesAsAssets(files, {
					conversationId: state.conversationId,
				});
				mergeRecentAssets(assets);
				const uploadedAssetIds = assets
					.map((asset) => String(asset?.assetId || "").trim())
					.filter(Boolean);
				if (uploadedAssetIds.length > 0) {
					setSelectedAssetRefsForTarget("composer", [...state.selectedAssetRefs, ...uploadedAssetIds]);
				}
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "\\u6587\\u4ef6\\u4e0a\\u4f20\\u5931\\u8d25";
				showError(messageText);
			} finally {
				state.composerUploadingAssets = false;
				filePickerAction.disabled = false;
				fileInput.disabled = false;
				fileInput.value = "";
				renderUploadFileList();
			}
		}

		function bindDropTarget(target) {
			const scope = target.id ? "#" + target.id : describeNode(target);
			target.addEventListener("dragenter", (event) => {
				pushDragDebug(scope, event);
				if (!hasDragPayload(event)) {
					return;
				}
				event.preventDefault();
				setCopyDropEffect(event);
				showGlobalDropHint();
			});

			target.addEventListener("dragover", (event) => {
				pushDragDebug(scope, event);
				if (!hasDragPayload(event)) {
					return;
				}
				event.preventDefault();
				setCopyDropEffect(event);
				showGlobalDropHint();
			});

			target.addEventListener("dragleave", (event) => {
				pushDragDebug(scope, event);
				const nextTarget = event.relatedTarget;
				if (!(nextTarget instanceof Node) || !target.contains(nextTarget)) {
					target.classList.remove("drag-active");
				}
			});

			target.addEventListener("drop", (event) => {
				pushDragDebug(scope, event);
				if (!hasDragPayload(event)) {
					return;
				}
				event.preventDefault();
				hideGlobalDropHint();
				if (hasDroppedFiles(event)) {
					void handleDroppedFiles(event.dataTransfer.files, "drop");
				}
			});
		}


		function formatOutboundSummary(message, attachments, assetRefs) {
			const sections = [];
			const normalizedMessage = String(message || "").trim();
			if (normalizedMessage) {
				sections.push(normalizedMessage);
			}
			if (attachments.length) {
				sections.push("附件 " + attachments.length + " 个");
			}
			if (assetRefs.length) {
				sections.push("引用资产 " + assetRefs.length + " 个");
			}
			return sections.join("\\n");
		}

		function mergeRecentAssets(nextAssets) {
			if (!Array.isArray(nextAssets) || nextAssets.length === 0) {
				return;
			}
			const byId = new Map();
			for (const asset of [...nextAssets, ...state.recentAssets]) {
				if (asset && typeof asset.assetId === "string" && !byId.has(asset.assetId)) {
					byId.set(asset.assetId, asset);
				}
			}
			state.recentAssets = [...byId.values()];
			renderSelectedAssets();
			if (typeof renderConnEditorSelectedAssets === "function") {
				renderConnEditorSelectedAssets();
			}
			renderAssetPickerList();
		}

		async function loadAssets(silent) {
			if (!silent) {
				clearError();
			}
			refreshAssetsButton.disabled = true;
			refreshAssetsButton.textContent = "刷新中";

			try {
				const response = await fetch("/v1/assets?limit=40", {
					method: "GET",
					headers: { "accept": "application/json" },
				});
				if (!response.ok) {
					const body = await response.json().catch(() => ({}));
					const errorMessage = body?.error?.message || body?.message || "\\u52a0\\u8f7d\\u8d44\\u4ea7\\u5931\\u8d25";
					if (!silent) {
						showError(errorMessage);
						appendProcessEvent("error", "\\u8d44\\u4ea7\\u6e05\\u5355\\u5931\\u8d25", errorMessage);
					}
					return;
				}

				const payload = await response.json();
				state.recentAssets = Array.isArray(payload?.assets) ? payload.assets : [];
				state.assetsLoadedOnce = true;
				await ensureRecentAssetsForRefs([...state.selectedAssetRefs, ...state.connEditorSelectedAssetRefs], {
					silent: true,
				});
				renderSelectedAssets();
				if (typeof renderConnEditorSelectedAssets === "function") {
					renderConnEditorSelectedAssets();
				}
				renderAssetPickerList();
			} catch (error) {
				const messageText = error instanceof Error ? error.message : "\\u52a0\\u8f7d\\u8d44\\u4ea7\\u5931\\u8d25";
				if (!silent) {
					showError(messageText);
					appendProcessEvent("error", "\\u8d44\\u4ea7\\u6e05\\u5355\\u5931\\u8d25", messageText);
				}
			} finally {
				refreshAssetsButton.disabled = false;
				refreshAssetsButton.textContent = "刷新";
			}
		}

		function appendFileDownloads(files) {
			if (!Array.isArray(files) || files.length === 0) {
				return;
			}
			appendTranscriptMessage("system", "\\u6587\\u4ef6", "\\u52a9\\u624b\\u5df2\\u53d1\\u9001 " + files.length + " \\u4e2a\\u6587\\u4ef6", {
				files,
			});
		}

	`;
}

export function getPlaygroundAssetEventHandlersScript(): string {
	return `
		document.addEventListener("dragenter", (event) => {
			pushDragDebug("document", event);
			if (!hasDragPayload(event)) {
				return;
			}
			event.preventDefault();
			setCopyDropEffect(event);
			state.dragDepth += 1;
			showGlobalDropHint();
		}, true);

		document.addEventListener("dragover", (event) => {
			pushDragDebug("document", event);
			if (!hasDragPayload(event)) {
				return;
			}
			event.preventDefault();
			setCopyDropEffect(event);
			showGlobalDropHint();
		}, true);

		document.addEventListener("dragleave", (event) => {
			pushDragDebug("document", event);
			if (!hasDragPayload(event)) {
				return;
			}
			event.preventDefault();
			state.dragDepth = Math.max(0, state.dragDepth - 1);
			if (state.dragDepth === 0) {
				hideGlobalDropHint();
			}
		}, true);

		document.addEventListener("drop", (event) => {
			pushDragDebug("document", event);
			if (!hasDragPayload(event)) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			hideGlobalDropHint();
			if (hasDroppedFiles(event)) {
				void handleDroppedFiles(event.dataTransfer.files, "drop");
			}
		}, true);

		window.addEventListener("dragenter", preventWindowFileDrop);
		window.addEventListener("dragover", preventWindowFileDrop);
		window.addEventListener("drop", preventWindowFileDrop);

		bindDropTarget(pageRoot);
		bindDropTarget(pageBody);
		bindDropTarget(chatStage);
		bindDropTarget(composerDropTarget);
		bindDropTarget(dropZone);

		filePickerAction.addEventListener("click", () => {
			fileInput.click();
		});

		fileInput.addEventListener("change", async () => {
			await handleDroppedFiles(fileInput.files, "pick");
		});


		refreshAssetsButton.addEventListener("click", () => {
			void loadAssets(false);
		});

		openAssetLibraryButton.addEventListener("click", () => {
			toggleWorkspacePanel(
				"assets",
				() => openAssetLibrary(openAssetLibraryButton, { mode: "workspace" }),
				closeAssetLibrary,
			);
		});

		closeAssetModalButton.addEventListener("click", () => {
			closeAssetLibrary();
		});

		assetModal.addEventListener("click", (event) => {
			if (event.target === assetModal) {
				closeAssetLibrary();
			}
		});
	`;
}
