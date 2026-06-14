import assert from "node:assert/strict";
import test from "node:test";
import {
	extractAssistantText,
	formatProcessPayload,
	MAX_FORMATTED_PROCESS_PAYLOAD_CHARS,
	normalizeProcessText,
} from "../src/agent/agent-process-text.js";

test("normalizeProcessText strips null characters and normalizes newlines", () => {
	assert.equal(normalizeProcessText("\u0000hello\r\nworld\u0000  "), "hello\nworld");
});

test("formatProcessPayload extracts readable text from nested content arrays", () => {
	const formatted = formatProcessPayload([
		{ text: "first\r\nline" },
		{
			content: [
				"second",
				{ text: "third" },
				{ ignored: true },
			],
		},
	]);

	assert.equal(formatted, "first\nline\n\nsecond\nthird");
});

test("formatProcessPayload falls back to pretty JSON for objects", () => {
	assert.equal(formatProcessPayload({ ok: true }), "{\n  \"ok\": true\n}");
});

test("formatProcessPayload truncates oversized payloads before they enter run event buffers", () => {
	const formatted = formatProcessPayload({
		details: "x".repeat(MAX_FORMATTED_PROCESS_PAYLOAD_CHARS + 1024),
	});

	assert.ok(formatted.length < MAX_FORMATTED_PROCESS_PAYLOAD_CHARS + 512);
	assert.match(formatted, /Process payload truncated/);
});

test("extractAssistantText preserves string content and joins text blocks", () => {
	assert.equal(extractAssistantText({ content: "plain" }), "plain");
	assert.equal(
		extractAssistantText({
			content: [
				{ type: "text", text: "hello" },
				{ type: "tool_use", text: "ignored" },
				{ type: "text", text: " world" },
			],
		}),
		"hello world",
	);
});
