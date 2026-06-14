import { rewriteUserVisibleLocalArtifactLinks } from "./file-artifacts.js";

export const MAX_FORMATTED_PROCESS_PAYLOAD_CHARS = 64 * 1024;

export function formatProcessPayload(value: unknown): string {
	return truncateFormattedProcessPayload(formatProcessPayloadUnbounded(value));
}

function formatProcessPayloadUnbounded(value: unknown): string {
	if (value === undefined) {
		return "";
	}

	if (typeof value === "string") {
		return normalizeProcessText(value);
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	if (Array.isArray(value)) {
		return value
			.map((entry) => formatProcessPayloadUnbounded(entry))
			.filter((entry) => entry.length > 0)
			.join("\n\n");
	}
	if (value !== null && typeof value === "object") {
		const textContent = extractTextContent(value);
		if (textContent) {
			return textContent;
		}

		try {
			return rewriteUserVisibleLocalArtifactLinks(JSON.stringify(value, null, 2));
		} catch {
			return rewriteUserVisibleLocalArtifactLinks(normalizeProcessText(String(value)));
		}
	}

	return rewriteUserVisibleLocalArtifactLinks(normalizeProcessText(String(value)));
}

function truncateFormattedProcessPayload(text: string): string {
	if (text.length <= MAX_FORMATTED_PROCESS_PAYLOAD_CHARS) {
		return text;
	}
	return [
		text.slice(0, MAX_FORMATTED_PROCESS_PAYLOAD_CHARS),
		"",
		`[Process payload truncated: kept ${MAX_FORMATTED_PROCESS_PAYLOAD_CHARS} chars of ${text.length}. Full output is stored in session artifacts when persisted.]`,
	].join("\n");
}

export function normalizeProcessText(text: string): string {
	const withoutNulls = text.includes("\u0000") ? text.replace(/\u0000/g, "") : text;
	return withoutNulls.replace(/\r\n/g, "\n").trim();
}

export function extractAssistantText(
	message:
		| {
				content?: unknown;
		  }
		| undefined,
): string {
	if (!message?.content) {
		return "";
	}
	const { content } = message;
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.filter((item): item is { type: "text"; text: string } =>
			Boolean(item && typeof item === "object" && "type" in item && item.type === "text" && "text" in item && typeof item.text === "string"),
		)
		.map((item) => item.text)
		.join("");
}

function extractTextContent(value: object): string {
	if ("text" in value && typeof value.text === "string") {
		return rewriteUserVisibleLocalArtifactLinks(normalizeProcessText(value.text));
	}
	if ("message" in value && typeof value.message === "string") {
		return rewriteUserVisibleLocalArtifactLinks(normalizeProcessText(value.message));
	}
	if ("content" in value && Array.isArray(value.content)) {
		return value.content
			.map((entry) => {
				if (typeof entry === "string") {
					return rewriteUserVisibleLocalArtifactLinks(normalizeProcessText(entry));
				}
				if (entry && typeof entry === "object" && "text" in entry && typeof entry.text === "string") {
					return rewriteUserVisibleLocalArtifactLinks(normalizeProcessText(entry.text));
				}
				return "";
			})
			.filter((entry) => entry.length > 0)
			.join("\n");
	}

	return "";
}
