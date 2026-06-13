import type {
	ChatAttachmentBody,
	ChatRequestBody,
	QueueMessageMode,
	QueueMessageRequestBody,
} from "../types/api.js";

export interface ParsedChatMessageBody {
	conversationId?: string;
	message: string;
	userId?: string;
	attachments?: ChatAttachmentBody[];
	assetRefs?: string[];
}

export interface ParsedQueueMessageBody extends ParsedChatMessageBody {
	conversationId: string;
	mode: QueueMessageMode;
}

export function isValidConversationId(conversationId: unknown): conversationId is string {
	return typeof conversationId === "string" && conversationId.trim().length > 0;
}

export function parseOptionalPositiveInteger(value: unknown, fieldName: string): { value?: number; error?: string } {
	if (value === undefined) {
		return {};
	}
	if (typeof value !== "string" || value.trim().length === 0) {
		return { error: `Field "${fieldName}" must be a positive integer when provided` };
	}

	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return { error: `Field "${fieldName}" must be a positive integer when provided` };
	}

	return { value: parsed };
}

export function parseChatMessageBody(
	body: Partial<ChatRequestBody>,
): { value?: ParsedChatMessageBody; error?: string } {
	const { conversationId, message, userId, attachments, assetRefs } = body;

	if (!isValidMessage(message)) {
		return { error: 'Field "message" must be a non-empty string' };
	}

	const parsedAttachments = parseAttachments(attachments);
	if (parsedAttachments.error) {
		return { error: parsedAttachments.error };
	}
	const parsedAssetRefs = parseAssetRefs(assetRefs);
	if (parsedAssetRefs.error) {
		return { error: parsedAssetRefs.error };
	}

	return {
		value: {
			conversationId,
			message,
			userId,
			...(parsedAttachments.attachments ? { attachments: parsedAttachments.attachments } : {}),
			...(parsedAssetRefs.assetRefs ? { assetRefs: parsedAssetRefs.assetRefs } : {}),
		},
	};
}

export function parseQueueMessageBody(
	body: Partial<QueueMessageRequestBody>,
): { value?: ParsedQueueMessageBody; error?: string } {
	const { conversationId, message, mode, userId, attachments, assetRefs } = body;

	if (!isValidConversationId(conversationId)) {
		return { error: 'Field "conversationId" must be a non-empty string' };
	}
	if (!isValidMessage(message)) {
		return { error: 'Field "message" must be a non-empty string' };
	}
	if (!isValidQueueMode(mode)) {
		return { error: 'Field "mode" must be either "steer" or "followUp"' };
	}

	const parsedAttachments = parseAttachments(attachments);
	if (parsedAttachments.error) {
		return { error: parsedAttachments.error };
	}
	const parsedAssetRefs = parseAssetRefs(assetRefs);
	if (parsedAssetRefs.error) {
		return { error: parsedAssetRefs.error };
	}

	return {
		value: {
			conversationId,
			message,
			mode,
			userId,
			...(parsedAttachments.attachments ? { attachments: parsedAttachments.attachments } : {}),
			...(parsedAssetRefs.assetRefs ? { assetRefs: parsedAssetRefs.assetRefs } : {}),
		},
	};
}

function isValidMessage(message: unknown): message is string {
	return typeof message === "string" && message.trim().length > 0;
}

function isValidQueueMode(mode: unknown): mode is QueueMessageMode {
	return mode === "steer" || mode === "followUp";
}

function parseAttachments(value: unknown): { attachments?: ChatAttachmentBody[]; error?: string } {
	if (value === undefined) {
		return {};
	}
	if (!Array.isArray(value)) {
		return { error: 'Field "attachments" must be an array when provided' };
	}
	if (value.length > 5) {
		return { error: 'Field "attachments" supports at most 5 files' };
	}

	const attachments: ChatAttachmentBody[] = [];
	for (const [index, rawAttachment] of value.entries()) {
		if (!rawAttachment || typeof rawAttachment !== "object") {
			return { error: `attachments[${index}] must be an object` };
		}
		const attachment = rawAttachment as Record<string, unknown>;
		if (typeof attachment.fileName !== "string" || attachment.fileName.trim().length === 0) {
			return { error: `attachments[${index}].fileName must be a non-empty string` };
		}
		if (attachment.mimeType !== undefined && typeof attachment.mimeType !== "string") {
			return { error: `attachments[${index}].mimeType must be a string when provided` };
		}
		if (attachment.sizeBytes !== undefined && (typeof attachment.sizeBytes !== "number" || !Number.isFinite(attachment.sizeBytes) || attachment.sizeBytes < 0)) {
			return { error: `attachments[${index}].sizeBytes must be a non-negative number when provided` };
		}
		if (attachment.text !== undefined && typeof attachment.text !== "string") {
			return { error: `attachments[${index}].text must be a string when provided` };
		}
		if (attachment.base64 !== undefined && typeof attachment.base64 !== "string") {
			return { error: `attachments[${index}].base64 must be a string when provided` };
		}
		if (attachment.text !== undefined && attachment.base64 !== undefined) {
			return { error: `attachments[${index}] cannot provide both text and base64` };
		}

		attachments.push({
			fileName: attachment.fileName,
			mimeType: typeof attachment.mimeType === "string" ? attachment.mimeType : undefined,
			sizeBytes: typeof attachment.sizeBytes === "number" ? attachment.sizeBytes : undefined,
			text: typeof attachment.text === "string" ? attachment.text : undefined,
			base64: typeof attachment.base64 === "string" ? attachment.base64 : undefined,
		});
	}

	return { attachments };
}

function parseAssetRefs(value: unknown): { assetRefs?: string[]; error?: string } {
	if (value === undefined) {
		return {};
	}
	if (!Array.isArray(value)) {
		return { error: 'Field "assetRefs" must be an array when provided' };
	}
	if (value.length > 20) {
		return { error: 'Field "assetRefs" supports at most 20 asset ids' };
	}

	const assetRefs: string[] = [];
	for (const [index, rawAssetId] of value.entries()) {
		if (typeof rawAssetId !== "string" || rawAssetId.trim().length === 0) {
			return { error: `assetRefs[${index}] must be a non-empty string` };
		}
		assetRefs.push(rawAssetId.trim());
	}

	return { assetRefs };
}
