import { createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { renameWithTransientRetry } from "../file-system.js";
import type { AgentSessionMessageLike } from "./agent-session-factory.js";
import type { AgentFileArtifact, AgentFileDraft } from "./file-artifacts.js";

export const LARGE_SESSION_MESSAGE_TEXT_BYTES = 256 * 1024;
export const LARGE_SESSION_MESSAGE_PREVIEW_CHARS = 8 * 1024;
export const LARGE_SESSION_COMPACTION_MIME_TYPE = "text/plain; charset=utf-8";

export interface CompactLargeSessionMessagesInput {
	conversationId: string;
	messages: readonly AgentSessionMessageLike[];
	saveFiles: (conversationId: string, files: readonly AgentFileDraft[]) => Promise<AgentFileArtifact[]>;
}

export interface CompactLargeSessionMessagesResult {
	messages: AgentSessionMessageLike[];
	changed: boolean;
	artifactCount: number;
	originalBytes: number;
	compactedBytes: number;
}

export async function compactLargeSessionMessages(
	input: CompactLargeSessionMessagesInput,
): Promise<CompactLargeSessionMessagesResult> {
	const messages: AgentSessionMessageLike[] = [];
	let changed = false;
	let artifactCount = 0;
	let originalBytes = 0;
	let compactedBytes = 0;

	for (const message of input.messages) {
		const candidate = extractOversizedText(message);
		if (!candidate) {
			messages.push(message);
			continue;
		}

		const fileName = buildToolResultFileName(message, candidate.text);
		const [artifact] = await input.saveFiles(input.conversationId, [
			{
				fileName,
				mimeType: LARGE_SESSION_COMPACTION_MIME_TYPE,
				content: candidate.text,
			},
		]);
		if (!artifact) {
			messages.push(message);
			continue;
		}

		const compacted = buildCompactedMessage(message, candidate.text, artifact);
		messages.push(compacted);
		changed = true;
		artifactCount += 1;
		originalBytes += candidate.bytes;
		compactedBytes += Buffer.byteLength(JSON.stringify(compacted), "utf8");
	}

	return { messages, changed, artifactCount, originalBytes, compactedBytes };
}

export async function rewriteSessionFileMessages(input: {
	sessionFile: string;
	messages: readonly AgentSessionMessageLike[];
}): Promise<void> {
	const lines = input.messages.map((message) => JSON.stringify({
		type: "message",
		timestamp: resolveMessageTimestamp(message),
		message,
	}));
	const sessionDir = dirname(input.sessionFile);
	const tempPath = join(sessionDir, `.${basename(input.sessionFile)}.${process.pid}.${process.hrtime.bigint()}.tmp`);
	await mkdir(sessionDir, { recursive: true });
	try {
		await writeFile(tempPath, `${lines.join("\n")}\n`, "utf8");
		await renameWithTransientRetry(tempPath, input.sessionFile);
	} catch (error) {
		await unlink(tempPath).catch(() => undefined);
		throw error;
	}
}

function extractOversizedText(message: AgentSessionMessageLike): { text: string; bytes: number } | undefined {
	if (isAlreadyCompacted(message)) {
		return undefined;
	}
	const text = extractMessageLargeText(message);
	if (text) {
		const bytes = Buffer.byteLength(text, "utf8");
		if (bytes > LARGE_SESSION_MESSAGE_TEXT_BYTES) {
			return { text, bytes };
		}
	}

	const serializedMessage = JSON.stringify(message, null, 2);
	const serializedBytes = Buffer.byteLength(serializedMessage, "utf8");
	return serializedBytes > LARGE_SESSION_MESSAGE_TEXT_BYTES
		? { text: serializedMessage, bytes: serializedBytes }
		: undefined;
}

function isAlreadyCompacted(message: AgentSessionMessageLike): boolean {
	return Boolean((message as AgentSessionMessageLike & { toolResultArtifact?: unknown }).toolResultArtifact);
}

function extractMessageLargeText(message: AgentSessionMessageLike): string | undefined {
	if (typeof message.output === "string" && message.output.length > 0) {
		return message.output;
	}
	if (typeof message.content === "string") {
		return message.content;
	}
	if (!Array.isArray(message.content)) {
		return undefined;
	}

	const text = message.content
		.map((block) => {
			if (typeof block === "string") {
				return block;
			}
			if (!block || typeof block !== "object") {
				return "";
			}
			const candidate = block as { type?: string; text?: string };
			return candidate.type === "text" && typeof candidate.text === "string" ? candidate.text : "";
		})
		.join("");
	return text.length > 0 ? text : undefined;
}

function buildCompactedMessage(
	message: AgentSessionMessageLike,
	text: string,
	artifact: AgentFileArtifact,
): AgentSessionMessageLike {
	const originalBytes = Buffer.byteLength(text, "utf8");
	const preview = text.slice(0, LARGE_SESSION_MESSAGE_PREVIEW_CHARS);
	const notice = [
		"Large tool output omitted from session history.",
		`Original size: ${originalBytes} bytes.`,
		`Full output: ${artifact.downloadUrl}`,
		"",
		"Preview:",
		preview,
	].join("\n");
	const compacted = {
		...message,
		content: [{ type: "text", text: notice }],
		summary: typeof message.summary === "string" ? message.summary : "Large output stored as an artifact.",
		toolResultArtifact: {
			assetId: artifact.assetId,
			fileName: artifact.fileName,
			mimeType: artifact.mimeType,
			sizeBytes: artifact.sizeBytes,
			downloadUrl: artifact.downloadUrl,
			originalBytes,
		},
	} as AgentSessionMessageLike & { details?: unknown; output?: string; result?: unknown };
	delete compacted.details;
	delete compacted.output;
	delete compacted.result;
	return compacted;
}

function buildToolResultFileName(message: AgentSessionMessageLike, text: string): string {
	const candidate = message as AgentSessionMessageLike & { toolName?: string; toolCallId?: string };
	const toolName = sanitizeFilePart(candidate.toolName || message.role || "tool-output");
	const toolCallId = sanitizeFilePart(candidate.toolCallId || createHash("sha256").update(text).digest("hex").slice(0, 12));
	return `${toolName}-${toolCallId}.txt`;
}

function sanitizeFilePart(value: string): string {
	return value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "output";
}

function resolveMessageTimestamp(message: AgentSessionMessageLike): string {
	if (typeof message.timestamp === "string" && message.timestamp.length > 0) {
		return message.timestamp;
	}
	if (typeof message.timestamp === "number" && Number.isFinite(message.timestamp)) {
		return new Date(message.timestamp).toISOString();
	}
	return new Date().toISOString();
}
