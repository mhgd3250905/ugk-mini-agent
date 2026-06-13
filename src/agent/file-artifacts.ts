import type { AssetRecord } from "./asset-store.js";

export interface AgentFileDraft {
	fileName: string;
	mimeType: string;
	content: string;
}

export interface AgentFileArtifact {
	id: string;
	assetId: string;
	reference: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	downloadUrl: string;
}

export interface PromptAssetContextEntry {
	assetId: string;
	reference: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	kind: "text" | "binary" | "metadata";
	hasContent: boolean;
	source: "upload" | "reference";
	textContent?: string;
	textPreview?: string;
}

export function buildPromptWithAssetContext(
	message: string,
	assets: readonly PromptAssetContextEntry[] = [],
): string {
	const sections = [message.trim(), buildAssetResponseInstruction(), buildFileResponseInstruction()];
	const assetContext = buildAssetContext(assets);
	if (assetContext) {
		sections.splice(1, 0, assetContext);
	}
	return sections.filter((section) => section.length > 0).join("\n\n");
}

export function prependCurrentTimeContext(
	message: string,
	options: {
		now?: Date;
		timeZone?: string;
	} = {},
): string {
	const trimmedMessage = String(message ?? "").trim();
	const timeZone = resolvePromptTimeZone(options.timeZone);
	const formatted = formatPromptDateTime(options.now ?? new Date(), timeZone);
	const prefix = `[当前时间：${timeZone} ${formatted}]`;
	return trimmedMessage ? `${prefix}\n${trimmedMessage}` : prefix;
}

export function toPromptAssetFromStoredAsset(
	asset: AssetRecord,
	options: {
		source: "upload" | "reference";
		textContent?: string;
	},
): PromptAssetContextEntry {
	return {
		assetId: asset.assetId,
		reference: asset.reference,
		fileName: asset.fileName,
		mimeType: asset.mimeType,
		sizeBytes: asset.sizeBytes,
		kind: asset.kind,
		hasContent: asset.hasContent,
		source: options.source,
		...(options.textContent ? { textContent: options.textContent } : {}),
		...(asset.textPreview ? { textPreview: asset.textPreview } : {}),
	};
}

export function extractAgentFileDrafts(text: string): { text: string; files: AgentFileDraft[] } {
	const files: AgentFileDraft[] = [];
	const withoutFiles = text.replace(
		/```ugk-file[^\n]*\n([\s\S]*?)```/gi,
		(match, content: string) => {
			const header = match.split("\n", 1)[0] ?? "";
			const attrs = parseFileAttributes(header);
			files.push({
				fileName: sanitizeFileName(attrs.name ?? "agent-file.txt"),
				mimeType: normalizeMimeType(attrs.mime ?? "text/plain"),
				content: String(content).replace(/\n$/, ""),
			});
			return "";
		},
	);

	return {
		text: normalizeVisibleText(withoutFiles),
		files,
	};
}

export function rewriteUserVisibleLocalArtifactLinks(
	text: string,
	options: {
		publicBaseUrl?: string;
	} = {},
): string {
	if (!text) {
		return "";
	}

	const baseUrl = normalizePublicBaseUrl(options.publicBaseUrl);
	return text.replace(LOCAL_ARTIFACT_REFERENCE_PATTERN, (match, offset: number) => {
		if (isInsideLocalFilePathQuery(text, offset)) {
			return match;
		}
		const { reference, trailing } = splitTrailingPunctuation(match);
		const artifactPath = resolveSupportedLocalArtifactPath(reference);
		if (!artifactPath) {
			return match;
		}
		return `${baseUrl}/v1/local-file?path=${encodeURIComponent(artifactPath)}${trailing}`;
	});
}

export function stripInternalPromptContext(text: string): string {
	if (!text) {
		return "";
	}

	return normalizeVisibleText(text.replace(INTERNAL_PROMPT_PREFIX_PATTERN, "").replace(INTERNAL_PROMPT_SECTION_PATTERN, ""));
}

function buildAssetContext(assets: readonly PromptAssetContextEntry[]): string {
	if (assets.length === 0) {
		return "";
	}

	const sections = assets.map((asset, index) => {
		const lines = [
			`<asset index="${index + 1}" source="${asset.source}">`,
			`assetId: ${asset.assetId}`,
			`reference: ${asset.reference}`,
			`fileName: ${sanitizeFileName(asset.fileName)}`,
			`mimeType: ${asset.mimeType}`,
			`sizeBytes: ${asset.sizeBytes}`,
			`kind: ${asset.kind}`,
			`hasContent: ${asset.hasContent ? "yes" : "no"}`,
		];

		if (typeof asset.textContent === "string" && asset.textContent.length > 0) {
			lines.push("content:", "```text", limitAttachmentText(asset.textContent), "```");
		} else if (asset.textPreview) {
			lines.push("preview:", "```text", asset.textPreview, "```");
		} else if (asset.hasContent) {
			lines.push("content: stored on server; use asset_store with assetId if full inspection is needed");
		} else {
			lines.push("content: metadata only; no server-side file body is currently available");
		}

		lines.push("</asset>");
		return lines.join("\n");
	});

	return ["<user_assets>", ...sections, "</user_assets>"].join("\n");
}

function buildAssetResponseInstruction(): string {
	return [
		"<asset_reference_protocol>",
		"Uploaded files and reusable server-side artifacts are represented as assets.",
		"Each asset includes an assetId and a reusable reference token like @asset[asset-id].",
		"If you need the full text of a referenced asset and it is not already embedded, use the asset_store tool with that assetId.",
		"</asset_reference_protocol>",
	].join("\n");
}

function buildFileResponseInstruction(): string {
	const publicBaseUrl = normalizePublicBaseUrl();
	return [
		"<file_response_protocol>",
		"Local workspace artifact paths such as /app/runtime/..., /app/public/..., and file:///app/... are valid internal references for tools.",
		"When a local artifact needs to be opened by the user, the runtime will translate those supported local paths to a host-reachable HTTP URL automatically.",
		`Current user-facing base URL: ${publicBaseUrl}.`,
		"Use this current base URL for service, playground, and local-file links unless the user explicitly asks for another deployment.",
		"Do not mention Tencent Cloud, Aliyun, or another deployment public URL just because it exists in repository documentation.",
		"Browser automation is not bundled in this Windows Core runtime. If browser automation is needed, rely only on explicitly installed user skills.",
		"Only in the final user-facing answer should you avoid raw container file paths.",
		"If the user should open the artifact in a browser, provide a host-reachable HTTP URL.",
		"If you generated a real file inside the project workspace and the user should receive the file itself, prefer the send_file tool.",
		'Only fall back to a fenced block like ```ugk-file name="example.txt" mime="text/plain"',
		"file contents",
		"```",
		"when you need to deliver a small text file inline and send_file is not the right fit.",
		"</file_response_protocol>",
	].join("\n");
}

function limitAttachmentText(text: string): string {
	const maxLength = 120_000;
	if (text.length <= maxLength) {
		return text;
	}
	return `${text.slice(0, maxLength)}\n\n[Attachment truncated after ${maxLength} characters]`;
}

function parseFileAttributes(header: string): { name?: string; mime?: string } {
	const attrs: { name?: string; mime?: string } = {};
	for (const match of header.matchAll(/\b(name|mime)="([^"]+)"/gi)) {
		if (match[1]?.toLowerCase() === "name") {
			attrs.name = match[2];
		}
		if (match[1]?.toLowerCase() === "mime") {
			attrs.mime = match[2];
		}
	}
	return attrs;
}

function normalizeVisibleText(text: string): string {
	return text
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function resolvePromptTimeZone(timeZone?: string): string {
	const candidate =
		String(timeZone ?? "").trim() ||
		String(process.env.APP_TIMEZONE ?? "").trim() ||
		String(process.env.TZ ?? "").trim() ||
		Intl.DateTimeFormat().resolvedOptions().timeZone ||
		"UTC";
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(0);
		return candidate;
	} catch {
		return "UTC";
	}
}

function formatPromptDateTime(date: Date, timeZone: string): string {
	const formatter = new Intl.DateTimeFormat("sv-SE", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
	return formatter.format(date).replace(",", "");
}

function normalizePublicBaseUrl(publicBaseUrl?: string): string {
	const configured = String(publicBaseUrl || process.env.PUBLIC_BASE_URL || "").trim();
	const baseUrl = configured && configured.toLowerCase() !== "auto"
		? configured
		: `http://127.0.0.1:${process.env.PORT || "3000"}`;
	return baseUrl.replace(
		/\/+$/,
		"",
	);
}

function isInsideLocalFilePathQuery(text: string, matchStart: number): boolean {
	const prefix = text.slice(Math.max(0, matchStart - 2048), matchStart);
	return /(?:^|[\s([<>"'`])(?:https?:\/\/[^\s<>"'`]+)?\/v1\/local-file\?(?:[^\s<>"'`#]*&)?path=$/i.test(prefix);
}

function resolveSupportedLocalArtifactPath(reference: string): string | undefined {
	const normalizedReference = String(reference || "").trim();
	if (!normalizedReference) {
		return undefined;
	}

	const decodedReference = normalizedReference.startsWith("file://")
		? decodeFileUrlPath(normalizedReference) ?? normalizedReference
		: normalizedReference;
	const slashPath = decodedReference.replace(/\\/g, "/");
	if (slashPath.startsWith("/app/public/") || slashPath.startsWith("/app/runtime/")) {
		return slashPath;
	}
	return undefined;
}

function decodeFileUrlPath(fileUrl: string): string | undefined {
	try {
		const url = new URL(fileUrl);
		if (url.protocol !== "file:") {
			return undefined;
		}
		return decodeURIComponent(url.pathname || "");
	} catch {
		return undefined;
	}
}

function splitTrailingPunctuation(reference: string): { reference: string; trailing: string } {
	const trailingMatch = reference.match(/[),.;!?，。；！？）】》]+$/);
	if (!trailingMatch) {
		return { reference, trailing: "" };
	}

	return {
		reference: reference.slice(0, -trailingMatch[0].length),
		trailing: trailingMatch[0],
	};
}

function normalizeMimeType(mimeType: string): string {
	const normalized = mimeType.trim().toLowerCase();
	return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(normalized) ? normalized : "application/octet-stream";
}

function sanitizeFileName(fileName: string): string {
	const safeBaseName = fileName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
	return safeBaseName || "agent-file.txt";
}

const LOCAL_ARTIFACT_REFERENCE_PATTERN =
	/file:\/\/\/app\/(?:public|runtime)\/[^\s<>"'`，。；！？）】》]+|\/app\/(?:public|runtime)\/[^\s<>"'`，。；！？）】》]+/gi;

const INTERNAL_PROMPT_SECTION_PATTERN =
	/(?:\n{0,2})<(user_assets|asset_reference_protocol|file_response_protocol)>[\s\S]*?<\/\1>/gi;

const INTERNAL_PROMPT_PREFIX_PATTERN =
	/^\s*\[当前时间：[^\]\r\n]+\]\s*(?:\r?\n)+/u;
