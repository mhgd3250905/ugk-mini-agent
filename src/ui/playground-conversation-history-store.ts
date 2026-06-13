export function getPlaygroundConversationHistoryStoreScript(): string {
	return `
		function getConversationHistoryStorageKey(conversationId) {
			return "ugk-mini-agent:conversation-history:" + getCurrentAgentId() + ":" + conversationId;
		}

		function getConversationHistoryIndexKey() {
			return CONVERSATION_HISTORY_INDEX_KEY + ":" + getCurrentAgentId();
		}

		function readConversationHistoryIndex() {
			try {
				const raw = localStorage.getItem(getConversationHistoryIndexKey());
				const parsed = JSON.parse(raw || "[]");
				return Array.isArray(parsed) ? parsed : [];
			} catch {
				return [];
			}
		}

		function writeConversationHistoryIndex(index) {
			try {
				localStorage.setItem(getConversationHistoryIndexKey(), JSON.stringify(index));
			} catch {}
		}

		function cloneHistoryAttachments(attachments) {
			if (!Array.isArray(attachments) || attachments.length === 0) {
				return [];
			}

			return attachments.map((attachment) => ({
				fileName: attachment.fileName || "attachment",
				mimeType: attachment.mimeType || "application/octet-stream",
				sizeBytes: Number.isFinite(attachment.sizeBytes) ? attachment.sizeBytes : 0,
			}));
		}

		function cloneHistoryAssetRefs(assetRefs) {
			if (!Array.isArray(assetRefs) || assetRefs.length === 0) {
				return [];
			}

			return assetRefs
				.map((assetId) => state.recentAssets.find((asset) => asset.assetId === assetId))
				.filter(Boolean)
				.map((asset) => ({
					assetId: asset.assetId,
					fileName: asset.fileName || asset.assetId,
					mimeType: asset.mimeType || "application/octet-stream",
					sizeBytes: Number.isFinite(asset.sizeBytes) ? asset.sizeBytes : 0,
					kind: asset.kind || "metadata",
				}));
		}

		function cloneHistoryFiles(files) {
			if (!Array.isArray(files) || files.length === 0) {
				return [];
			}

			return files.map((file) => ({
				id: file.id || file.assetId || createBrowserId(),
				assetId: file.assetId || file.id || "",
				reference: file.reference || "",
				fileName: file.fileName || "download",
				mimeType: file.mimeType || "application/octet-stream",
				sizeBytes: Number.isFinite(file.sizeBytes) ? file.sizeBytes : 0,
				downloadUrl: file.downloadUrl || "",
			}));
		}

		function isNetworkErrorText(text) {
			const normalized = String(text || "").trim().toLowerCase();
			return (
				normalized === "network error" ||
				normalized.includes("failed to fetch") ||
				normalized.includes("networkerror") ||
				normalized.includes("abort") ||
				normalized.includes("cancel")
			);
		}

		function isTransientNetworkHistoryEntry(entry) {
			if (!entry || entry.kind !== "error") {
				return false;
			}

			const title = String(entry.title || "").trim().toLowerCase();
			const isNetworkTitle = title === "network" || entry.title === "网络";
			return isNetworkTitle && isNetworkErrorText(entry.text);
		}

		function loadConversationHistoryEntries(conversationId) {
			if (!conversationId) {
				return [];
			}

			try {
				const raw = localStorage.getItem(getConversationHistoryStorageKey(conversationId));
				const parsed = JSON.parse(raw || "[]");
				if (!Array.isArray(parsed)) {
					return [];
				}
				return parsed
					.map(normalizeHistoryEntry)
					.filter(Boolean)
					.filter((entry) => !isTransientNetworkHistoryEntry(entry));
			} catch {
				return [];
			}
		}

		function persistConversationHistory(conversationId) {
			if (!conversationId) {
				return;
			}

			const storedHistory = state.conversationHistory.slice(-MAX_STORED_MESSAGES_PER_CONVERSATION);

			try {
				localStorage.setItem(
					getConversationHistoryStorageKey(conversationId),
					JSON.stringify(storedHistory),
				);
			} catch {
				return;
			}

			const nextIndex = readConversationHistoryIndex()
				.filter((entry) => entry && typeof entry === "object" && entry.conversationId !== conversationId)
				.map((entry) => ({
					conversationId: entry.conversationId,
					updatedAt: entry.updatedAt,
					messageCount: Number.isFinite(entry.messageCount) ? entry.messageCount : 0,
				}));
			nextIndex.unshift({
				conversationId,
				updatedAt: new Date().toISOString(),
				messageCount: storedHistory.length,
			});

			while (nextIndex.length > MAX_STORED_CONVERSATIONS) {
				const removed = nextIndex.pop();
				if (removed?.conversationId) {
					localStorage.removeItem(getConversationHistoryStorageKey(removed.conversationId));
				}
			}

			writeConversationHistoryIndex(nextIndex);
		}

		function scheduleConversationHistoryPersist(conversationId) {
			const nextConversationId = String(conversationId || "").trim();
			if (!nextConversationId) {
				return;
			}
			state.historyPersistConversationId = nextConversationId;
			if (state.historyPersistTimer !== null) {
				window.clearTimeout(state.historyPersistTimer);
			}
			state.historyPersistTimer = window.setTimeout(() => {
				state.historyPersistTimer = null;
				persistConversationHistory(state.historyPersistConversationId);
			}, 1200);
		}

		function flushConversationHistoryPersist() {
			if (state.historyPersistTimer !== null) {
				window.clearTimeout(state.historyPersistTimer);
				state.historyPersistTimer = null;
			}
			if (state.historyPersistConversationId) {
				persistConversationHistory(state.historyPersistConversationId);
			}
		}
	`;
}
