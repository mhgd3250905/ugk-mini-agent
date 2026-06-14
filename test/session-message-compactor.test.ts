import test from "node:test";
import assert from "node:assert/strict";
import {
	LARGE_SESSION_MESSAGE_TEXT_BYTES,
	compactLargeSessionMessages,
} from "../src/agent/session-message-compactor.js";

test("compactLargeSessionMessages replaces oversized toolResult text with a preview and artifact reference", async () => {
	const oversizedText = "x".repeat(LARGE_SESSION_MESSAGE_TEXT_BYTES + 10);
	const saved: Array<{ fileName: string; content: string }> = [];

	const result = await compactLargeSessionMessages({
		conversationId: "manual:large",
		messages: [
			{
				role: "toolResult",
				toolCallId: "tool-big",
				toolName: "conn",
				content: [{ type: "text", text: oversizedText }],
				isError: false,
			} as never,
		],
		saveFiles: async (_conversationId, files) => {
			saved.push(...files.map((file) => ({ fileName: file.fileName, content: file.content })));
			return files.map((file, index) => ({
				id: `artifact-${index + 1}`,
				assetId: `artifact-${index + 1}`,
				reference: `@asset[artifact-${index + 1}]`,
				fileName: file.fileName,
				mimeType: file.mimeType,
				sizeBytes: Buffer.byteLength(file.content, "utf8"),
				downloadUrl: `/v1/files/artifact-${index + 1}`,
			}));
		},
	});

	assert.equal(saved.length, 1);
	assert.equal(saved[0]?.content, oversizedText);
	assert.equal(result.changed, true);
	assert.equal(result.artifactCount, 1);
	assert.equal(result.messages[0]?.role, "toolResult");
	assert.match(JSON.stringify(result.messages[0]), /output omitted from session/);
	assert.match(JSON.stringify(result.messages[0]), /\/v1\/files\/artifact-1/);
	assert.ok(Buffer.byteLength(JSON.stringify(result.messages[0]), "utf8") < 32 * 1024);
});

test("compactLargeSessionMessages leaves normal messages untouched", async () => {
	const messages = [
		{
			role: "assistant",
			content: [{ type: "text", text: "small answer" }],
			stopReason: "stop",
		} as never,
	];

	const result = await compactLargeSessionMessages({
		conversationId: "manual:small",
		messages,
		saveFiles: async () => {
			throw new Error("small messages must not be saved as files");
		},
	});

	assert.equal(result.changed, false);
	assert.deepEqual(result.messages, messages);
});

test("compactLargeSessionMessages compacts oversized nested tool details even when visible content is small", async () => {
	const oversizedDetails = {
		run: {
			events: ["z".repeat(LARGE_SESSION_MESSAGE_TEXT_BYTES + 1024)],
		},
	};
	const saved: Array<{ content: string }> = [];

	const result = await compactLargeSessionMessages({
		conversationId: "manual:nested",
		messages: [
			{
				role: "toolResult",
				toolCallId: "tool-nested",
				toolName: "conn",
				content: [{ type: "text", text: "status: running" }],
				details: oversizedDetails,
				isError: false,
			} as never,
		],
		saveFiles: async (_conversationId, files) => {
			saved.push(...files.map((file) => ({ content: file.content })));
			return files.map((file) => ({
				id: "artifact-nested",
				assetId: "artifact-nested",
				reference: "@asset[artifact-nested]",
				fileName: file.fileName,
				mimeType: file.mimeType,
				sizeBytes: Buffer.byteLength(file.content, "utf8"),
				downloadUrl: "/v1/files/artifact-nested",
			}));
		},
	});

	const compactedMessage = result.messages[0] as { details?: unknown };
	assert.equal(result.changed, true);
	assert.equal(saved.length, 1);
	assert.match(saved[0]?.content ?? "", /tool-nested/);
	assert.equal(compactedMessage.details, undefined);
	assert.ok(Buffer.byteLength(JSON.stringify(result.messages[0]), "utf8") < 32 * 1024);
});
