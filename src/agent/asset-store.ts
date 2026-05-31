import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { renameWithTransientRetry } from "../file-system.js";
import type { AgentFileArtifact, AgentFileDraft } from "./file-artifacts.js";

export type AssetKind = "text" | "binary" | "metadata";
export type AssetSource = "user_upload" | "agent_output";

export interface ChatAttachment {
	fileName: string;
	mimeType?: string;
	sizeBytes?: number;
	text?: string;
	base64?: string;
}

export interface AssetRecord {
	assetId: string;
	reference: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	kind: AssetKind;
	hasContent: boolean;
	source: AssetSource;
	conversationId: string;
	createdAt: string;
	sha256?: string;
	textPreview?: string;
	downloadUrl?: string;
}

export interface StoredAssetRecord extends AssetRecord {
	content?: Buffer;
}

export interface AgentFileBufferDraft {
	fileName: string;
	mimeType: string;
	content: Buffer;
	textPreview?: string;
}

export interface AssetStoreLike {
	registerAttachments(conversationId: string, attachments: readonly ChatAttachment[]): Promise<AssetRecord[]>;
	saveFiles(conversationId: string, files: readonly AgentFileDraft[]): Promise<AgentFileArtifact[]>;
	listAssets(options?: { conversationId?: string; limit?: number }): Promise<AssetRecord[]>;
	getAsset(assetId: string): Promise<AssetRecord | undefined>;
	resolveAssets(assetIds: readonly string[]): Promise<AssetRecord[]>;
	readText(assetId: string, maxChars?: number): Promise<string | undefined>;
	getFile(assetId: string): Promise<StoredAssetRecord | undefined>;
	deleteAsset?(assetId: string): Promise<boolean>;
}

interface AssetIndexEntry {
	assetId: string;
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	kind: AssetKind;
	hasContent: boolean;
	source: AssetSource;
	conversationId: string;
	createdAt: string;
	sha256?: string;
	blobPath?: string;
	textPreview?: string;
}

type AssetIndex = Record<string, AssetIndexEntry>;

const DEFAULT_TEXT_PREVIEW_CHARS = 4000;
const DEFAULT_READ_TEXT_CHARS = 24000;

export class AssetStore implements AssetStoreLike {
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(
		private readonly options: {
			blobsDir: string;
			indexPath: string;
		},
	) {}

	async registerAttachments(conversationId: string, attachments: readonly ChatAttachment[]): Promise<AssetRecord[]> {
		if (attachments.length === 0) {
			return [];
		}

		return await this.mutateIndex(async (index) => {
			const saved: AssetRecord[] = [];

			for (const attachment of attachments) {
				const entry = await this.createAttachmentEntry(conversationId, attachment);
				index[entry.assetId] = entry;
				saved.push(toPublicAsset(entry));
			}

			return saved;
		});
	}

	async saveFiles(conversationId: string, files: readonly AgentFileDraft[]): Promise<AgentFileArtifact[]> {
		if (files.length === 0) {
			return [];
		}

		return await this.mutateIndex(async (index) => {
			const saved: AgentFileArtifact[] = [];

			for (const file of files) {
				const content = Buffer.from(file.content, "utf8");
				const entry = await this.createAssetEntry({
					conversationId,
					fileName: file.fileName,
					mimeType: file.mimeType,
					sizeBytes: content.byteLength,
					content,
					textPreview: buildTextPreview(file.content),
					kind: isTextMimeType(file.mimeType) ? "text" : "binary",
					source: "agent_output",
				});
				index[entry.assetId] = entry;
				saved.push(toAgentFileArtifact(entry));
			}

			return saved;
		});
	}

	async saveFileBuffers(conversationId: string, files: readonly AgentFileBufferDraft[]): Promise<AgentFileArtifact[]> {
		if (files.length === 0) {
			return [];
		}

		return await this.mutateIndex(async (index) => {
			const saved: AgentFileArtifact[] = [];

			for (const file of files) {
				const entry = await this.createAssetEntry({
					conversationId,
					fileName: file.fileName,
					mimeType: file.mimeType,
					sizeBytes: file.content.byteLength,
					content: file.content,
					textPreview: file.textPreview,
					kind: isTextMimeType(file.mimeType) ? "text" : "binary",
					source: "agent_output",
				});
				index[entry.assetId] = entry;
				saved.push(toAgentFileArtifact(entry));
			}

			return saved;
		});
	}

	async listAssets(options?: { conversationId?: string; limit?: number }): Promise<AssetRecord[]> {
		const index = await this.readIndex();
		const limit = normalizeLimit(options?.limit);
		return Object.values(index)
			.filter((entry) => !options?.conversationId || entry.conversationId === options.conversationId)
			.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
			.slice(0, limit)
			.map(toPublicAsset);
	}

	async getAsset(assetId: string): Promise<AssetRecord | undefined> {
		const index = await this.readIndex();
		const entry = index[assetId];
		return entry ? toPublicAsset(entry) : undefined;
	}

	async resolveAssets(assetIds: readonly string[]): Promise<AssetRecord[]> {
		if (assetIds.length === 0) {
			return [];
		}

		const index = await this.readIndex();
		return assetIds
			.map((assetId) => index[assetId])
			.filter((entry): entry is AssetIndexEntry => Boolean(entry))
			.map(toPublicAsset);
	}

	async readText(assetId: string, maxChars: number = DEFAULT_READ_TEXT_CHARS): Promise<string | undefined> {
		const index = await this.readIndex();
		const entry = index[assetId];
		if (!entry || entry.kind !== "text" || !entry.hasContent || !entry.blobPath) {
			return undefined;
		}

		const blobPath = resolve(entry.blobPath);
		if (!isPathInside(blobPath, this.options.blobsDir)) {
			return undefined;
		}

		const text = await readFile(blobPath, "utf8");
		return maxChars > 0 ? text.slice(0, maxChars) : text;
	}

	async getFile(assetId: string): Promise<StoredAssetRecord | undefined> {
		const index = await this.readIndex();
		const entry = index[assetId];
		if (!entry) {
			return undefined;
		}
		if (!entry.hasContent || !entry.blobPath) {
			return {
				...toPublicAsset(entry),
			};
		}

		const blobPath = resolve(entry.blobPath);
		if (!isPathInside(blobPath, this.options.blobsDir)) {
			return undefined;
		}

		return {
			...toPublicAsset(entry),
			content: await readFile(blobPath),
		};
	}

	async deleteAsset(assetId: string): Promise<boolean> {
		const normalizedAssetId = String(assetId || "").trim();
		if (!normalizedAssetId) {
			return false;
		}

		return await this.mutateIndex(async (index) => {
			const entry = index[normalizedAssetId];
			if (!entry) {
				return false;
			}

			delete index[normalizedAssetId];
			if (entry.hasContent && entry.blobPath) {
				const blobPath = resolve(entry.blobPath);
				const blobStillReferenced = Object.values(index).some((candidate) => candidate.blobPath === blobPath);
				if (!blobStillReferenced && isPathInside(blobPath, this.options.blobsDir)) {
					await unlink(blobPath).catch((error) => {
						if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
							return;
						}
						throw error;
					});
				}
			}
			return true;
		});
	}

	private async createAttachmentEntry(conversationId: string, attachment: ChatAttachment): Promise<AssetIndexEntry> {
		const fileName = sanitizeFileName(attachment.fileName);
		const mimeType = normalizeMimeType(attachment.mimeType);
		const content = decodeAttachmentContent(attachment);
		const sizeBytes = content?.byteLength ?? normalizeSizeBytes(attachment.sizeBytes);
		const kind = resolveAttachmentKind(attachment, mimeType, Boolean(content));
		const textPreview = resolveAttachmentTextPreview(attachment, kind);

		return await this.createAssetEntry({
			conversationId,
			fileName,
			mimeType,
			sizeBytes,
			content,
			textPreview,
			kind,
			source: "user_upload",
		});
	}

	private async createAssetEntry(input: {
		conversationId: string;
		fileName: string;
		mimeType: string;
		sizeBytes: number;
		content?: Buffer;
		textPreview?: string;
		kind: AssetKind;
		source: AssetSource;
	}): Promise<AssetIndexEntry> {
		const createdAt = new Date().toISOString();
		let sha256: string | undefined;
		let blobPath: string | undefined;

		if (input.content && input.content.byteLength > 0) {
			sha256 = createSha256(input.content);
			blobPath = resolve(join(this.options.blobsDir, sha256));
			if (!isPathInside(blobPath, this.options.blobsDir)) {
				throw new Error("Refusing to store asset outside the blob directory");
			}
			await writeBlobIfMissing(blobPath, input.content);
		}

		return {
			assetId: randomUUID(),
			fileName: sanitizeFileName(input.fileName),
			mimeType: normalizeMimeType(input.mimeType),
			sizeBytes: input.content?.byteLength ?? input.sizeBytes,
			kind: input.kind,
			hasContent: Boolean(input.content && input.content.byteLength > 0),
			source: input.source,
			conversationId: input.conversationId,
			createdAt,
			...(sha256 ? { sha256 } : {}),
			...(blobPath ? { blobPath } : {}),
			...(input.textPreview ? { textPreview: input.textPreview } : {}),
		};
	}

	private async readIndex(): Promise<AssetIndex> {
		await this.writeQueue;
		return await this.readIndexFromDisk();
	}

	private async readIndexFromDisk(): Promise<AssetIndex> {
		try {
			const content = await readFile(this.options.indexPath, "utf8");
			if (!content.trim()) {
				return {};
			}
			const parsed = JSON.parse(content) as unknown;
			return sanitizeAssetIndex(parsed, this.options.blobsDir);
		} catch (error) {
			if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
				return {};
			}
			if (error instanceof SyntaxError) {
				return {};
			}
			throw error;
		}
	}

	private async writeIndex(index: AssetIndex): Promise<void> {
		const dir = dirname(this.options.indexPath);
		const tempPath = join(dir, `.${basename(this.options.indexPath)}.${process.pid}.${process.hrtime.bigint()}.tmp`);
		await mkdir(dir, { recursive: true });
		try {
			await writeFile(tempPath, JSON.stringify(index, null, 2), "utf8");
			await renameWithTransientRetry(tempPath, this.options.indexPath);
		} catch (error) {
			await unlink(tempPath).catch(() => undefined);
			throw error;
		}
	}

	private async mutateIndex<T>(mutator: (index: AssetIndex) => T | Promise<T>): Promise<T> {
		let result: T;
		const operation = this.writeQueue
			.catch(() => undefined)
			.then(async () => {
				const index = await this.readIndexFromDisk();
				await this.ensureStorage();
				result = await mutator(index);
				await this.writeIndex(index);
			});

		this.writeQueue = operation.then(
			() => undefined,
			() => undefined,
		);
		await operation;
		return result!;
	}

	private async ensureStorage(): Promise<void> {
		await mkdir(this.options.blobsDir, { recursive: true });
		await mkdir(dirname(this.options.indexPath), { recursive: true });
	}
}

function toPublicAsset(entry: AssetIndexEntry): AssetRecord {
	return {
		assetId: entry.assetId,
		reference: formatAssetReference(entry.assetId),
		fileName: entry.fileName,
		mimeType: entry.mimeType,
		sizeBytes: entry.sizeBytes,
		kind: entry.kind,
		hasContent: entry.hasContent,
		source: entry.source,
		conversationId: entry.conversationId,
		createdAt: entry.createdAt,
		...(entry.sha256 ? { sha256: entry.sha256 } : {}),
		...(entry.textPreview ? { textPreview: entry.textPreview } : {}),
		...(entry.hasContent ? { downloadUrl: `/v1/files/${encodeURIComponent(entry.assetId)}` } : {}),
	};
}

function toAgentFileArtifact(entry: AssetIndexEntry): AgentFileArtifact {
	const asset = toPublicAsset(entry);
	return {
		id: asset.assetId,
		assetId: asset.assetId,
		reference: asset.reference,
		fileName: asset.fileName,
		mimeType: asset.mimeType,
		sizeBytes: asset.sizeBytes,
		downloadUrl: asset.downloadUrl ?? `/v1/files/${encodeURIComponent(asset.assetId)}`,
	};
}

function formatAssetReference(assetId: string): string {
	return `@asset[${assetId}]`;
}

function sanitizeAssetIndex(value: unknown, blobsDir: string): AssetIndex {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}

	const index: AssetIndex = {};
	for (const [assetKey, rawEntry] of Object.entries(value)) {
		const entry = sanitizeAssetIndexEntry(assetKey, rawEntry, blobsDir);
		if (entry) {
			index[entry.assetId] = entry;
		}
	}
	return index;
}

function sanitizeAssetIndexEntry(assetKey: string, value: unknown, blobsDir: string): AssetIndexEntry | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}

	const rawEntry = value as Partial<AssetIndexEntry>;
	const assetId = typeof rawEntry.assetId === "string" && rawEntry.assetId.trim()
		? rawEntry.assetId.trim()
		: assetKey.trim();
	if (!assetId || typeof rawEntry.fileName !== "string" || typeof rawEntry.createdAt !== "string" || !rawEntry.createdAt) {
		return undefined;
	}
	if (typeof rawEntry.conversationId !== "string" || !rawEntry.conversationId.trim()) {
		return undefined;
	}

	const blobPath = sanitizeBlobPath(rawEntry.blobPath, blobsDir);
	const hasContent = rawEntry.hasContent === true && Boolean(blobPath);
	const kind = isAssetKind(rawEntry.kind) ? rawEntry.kind : "metadata";
	const source = isAssetSource(rawEntry.source) ? rawEntry.source : "user_upload";
	return {
		assetId,
		fileName: sanitizeFileName(rawEntry.fileName),
		mimeType: normalizeMimeType(rawEntry.mimeType),
		sizeBytes: normalizeSizeBytes(rawEntry.sizeBytes),
		kind: hasContent ? kind : "metadata",
		hasContent,
		source,
		conversationId: rawEntry.conversationId.trim(),
		createdAt: rawEntry.createdAt,
		...(typeof rawEntry.sha256 === "string" && rawEntry.sha256 ? { sha256: rawEntry.sha256 } : {}),
		...(blobPath && hasContent ? { blobPath } : {}),
		...(typeof rawEntry.textPreview === "string" ? { textPreview: rawEntry.textPreview } : {}),
	};
}

function sanitizeBlobPath(blobPath: string | undefined, blobsDir: string): string | undefined {
	if (typeof blobPath !== "string" || !blobPath.trim()) {
		return undefined;
	}
	const resolvedBlobPath = resolve(blobPath);
	return isPathInside(resolvedBlobPath, blobsDir) ? resolvedBlobPath : undefined;
}

function isAssetKind(value: unknown): value is AssetKind {
	return value === "text" || value === "binary" || value === "metadata";
}

function isAssetSource(value: unknown): value is AssetSource {
	return value === "user_upload" || value === "agent_output";
}

function decodeAttachmentContent(attachment: ChatAttachment): Buffer | undefined {
	if (typeof attachment.text === "string") {
		return Buffer.from(attachment.text, "utf8");
	}
	if (typeof attachment.base64 === "string" && attachment.base64.trim().length > 0) {
		return Buffer.from(attachment.base64, "base64");
	}
	return undefined;
}

function resolveAttachmentKind(attachment: ChatAttachment, mimeType: string, hasContent: boolean): AssetKind {
	if (typeof attachment.text === "string") {
		return "text";
	}
	if (!hasContent) {
		return "metadata";
	}
	return isTextMimeType(mimeType) ? "text" : "binary";
}

function resolveAttachmentTextPreview(attachment: ChatAttachment, kind: AssetKind): string | undefined {
	if (kind !== "text") {
		return undefined;
	}
	if (typeof attachment.text === "string") {
		return buildTextPreview(attachment.text);
	}
	return undefined;
}

function buildTextPreview(text: string, maxChars: number = DEFAULT_TEXT_PREVIEW_CHARS): string {
	if (text.length <= maxChars) {
		return text;
	}
	return `${text.slice(0, maxChars)}\n\n[Preview truncated after ${maxChars} characters]`;
}

function createSha256(content: Buffer): string {
	return createHash("sha256").update(content).digest("hex");
}

async function writeBlobIfMissing(blobPath: string, content: Buffer): Promise<void> {
	try {
		await writeFile(blobPath, content, { flag: "wx" });
	} catch (error) {
		if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EEXIST") {
			return;
		}
		throw error;
	}
}

function normalizeMimeType(mimeType: string | undefined): string {
	const normalized = String(mimeType ?? "")
		.trim()
		.toLowerCase();
	return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(normalized) ? normalized : "application/octet-stream";
}

function normalizeSizeBytes(sizeBytes: number | undefined): number {
	return typeof sizeBytes === "number" && Number.isFinite(sizeBytes) && sizeBytes >= 0 ? sizeBytes : 0;
}

function normalizeLimit(limit: number | undefined): number {
	if (typeof limit !== "number" || !Number.isFinite(limit)) {
		return 50;
	}
	return Math.max(1, Math.min(200, Math.trunc(limit)));
}

function sanitizeFileName(fileName: string): string {
	const safeBaseName = basename(fileName).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
	return safeBaseName || "asset.bin";
}

function isTextMimeType(mimeType: string): boolean {
	return (
		mimeType.startsWith("text/") ||
		mimeType === "application/json" ||
		mimeType === "application/xml" ||
		mimeType === "application/javascript" ||
		mimeType === "application/x-yaml"
	);
}

function isPathInside(filePath: string, parentDir: string): boolean {
	const normalizedFilePath = resolve(filePath);
	const normalizedParentDir = resolve(parentDir);
	return (
		normalizedFilePath === normalizedParentDir ||
		normalizedFilePath.startsWith(`${normalizedParentDir}\\`) ||
		normalizedFilePath.startsWith(`${normalizedParentDir}/`)
	);
}
