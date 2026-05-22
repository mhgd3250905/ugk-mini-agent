export function getPlaygroundActiveRunNormalizerScript(): string {
	return `
		function normalizeActiveRun(rawRun) {
			if (!rawRun || typeof rawRun !== "object") {
				return null;
			}

			const status = ["running", "interrupted", "done", "error"].includes(rawRun.status)
				? rawRun.status
				: "running";
			const input = rawRun.input && typeof rawRun.input === "object" ? rawRun.input : {};
			const queue = rawRun.queue && typeof rawRun.queue === "object"
				? {
						steering: Array.isArray(rawRun.queue.steering) ? rawRun.queue.steering.map(String) : [],
						followUp: Array.isArray(rawRun.queue.followUp) ? rawRun.queue.followUp.map(String) : [],
					}
				: null;

			return {
				runId: typeof rawRun.runId === "string" && rawRun.runId ? rawRun.runId : createBrowserId(),
				status,
				assistantMessageId:
					typeof rawRun.assistantMessageId === "string" && rawRun.assistantMessageId
						? rawRun.assistantMessageId
						: "active-run-" + createBrowserId(),
				eventCursor: Number.isFinite(rawRun.eventCursor) && rawRun.eventCursor > 0
					? Math.trunc(rawRun.eventCursor)
					: 0,
				input: {
					message: typeof input.message === "string" ? input.message : "",
					inputAssets: Array.isArray(input.inputAssets)
						? input.inputAssets
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
				},
				text: typeof rawRun.text === "string" ? rawRun.text : "",
				process: normalizeProcessView(rawRun.process),
				queue,
				loading: rawRun.loading !== false && status === "running",
				startedAt: typeof rawRun.startedAt === "string" ? rawRun.startedAt : new Date().toISOString(),
				updatedAt: typeof rawRun.updatedAt === "string" ? rawRun.updatedAt : new Date().toISOString(),
			};
		}

		function normalizeProcessView(rawProcess) {
			if (!rawProcess || typeof rawProcess !== "object") {
				return null;
			}

			const allowedKinds = new Set(["system", "tool", "ok", "error", "warn"]);
			const entries = Array.isArray(rawProcess.entries)
				? rawProcess.entries
						.filter((entry) => entry && typeof entry === "object")
						.map((entry, index) => ({
							id: typeof entry.id === "string" && entry.id ? entry.id : "process-" + (index + 1),
							kind: allowedKinds.has(entry.kind) ? entry.kind : "system",
							title: typeof entry.title === "string" ? entry.title : "过程更新",
							detail: typeof entry.detail === "string" ? entry.detail : "",
							createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
							toolCallId: typeof entry.toolCallId === "string" ? entry.toolCallId : "",
							toolName: typeof entry.toolName === "string" ? entry.toolName : "",
							isError: Boolean(entry.isError),
						}))
				: [];
			const narration = Array.isArray(rawProcess.narration)
				? rawProcess.narration.map((line) => String(line || "").trim()).filter(Boolean)
				: entries.map(formatProcessViewEntry);
			const currentAction = String(rawProcess.currentAction || "").trim();
			const kind = allowedKinds.has(rawProcess.kind) ? rawProcess.kind : (entries.at(-1)?.kind || "system");
			if (!narration.length && !currentAction) {
				return null;
			}

			return {
				title: typeof rawProcess.title === "string" ? rawProcess.title : "思考过程",
				narration,
				currentAction: currentAction || entries.at(-1)?.title || "等待动作",
				kind,
				isComplete: Boolean(rawProcess.isComplete),
				entries,
			};
		}

		function formatProcessViewEntry(entry) {
			const subject = entry.toolName ? entry.title + " · " + entry.toolName : entry.title;
			return entry.detail ? subject + "\\n" + entry.detail : subject;
		}
	`;
}
