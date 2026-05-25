/**
 * Safe Markdown rendering for Team Console observer file details.
 *
 * Keeps the same safety config as src/ui/playground-markdown.ts:
 *  - marked + gfm: true + breaks: false
 *  - raw HTML escaped
 *  - only http:/https: links allowed
 *  - links get target="_blank" rel="noreferrer noopener"
 */
import { Marked, type Tokens } from "marked";

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
	return escapeHtml(value).replace(/`/g, "&#96;");
}

function isSafeHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

const teamMarkdownParser = new Marked({
	gfm: true,
	breaks: false,
	async: false,
	renderer: {
		html({ text }: Tokens.HTML | Tokens.Tag): string {
			return escapeHtml(text);
		},
		link({ href, title, text }: Tokens.Link): string {
			if (!isSafeHttpUrl(href)) {
				return escapeHtml(text);
			}
			const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : "";
			return `<a href="${escapeAttribute(href)}"${titleAttribute} target="_blank" rel="noreferrer noopener">${escapeHtml(text)}</a>`;
		},
	},
});

export function renderTeamMarkdown(source: string): string {
	const normalized = String(source ?? "").replace(/\r\n?/g, "\n").trim();
	if (!normalized) {
		return "<p></p>";
	}

	const rendered = teamMarkdownParser.parse(normalized, { async: false });
	return String(rendered).trim() || "<p></p>";
}
