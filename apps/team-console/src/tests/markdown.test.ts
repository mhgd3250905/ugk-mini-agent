import { describe, it, expect } from "vitest";
import { renderTeamMarkdown } from "../shared/markdown";

describe("renderTeamMarkdown", () => {
	it("escapes raw HTML tags", () => {
		const result = renderTeamMarkdown("<script>alert(1)</script>");
		expect(result).toContain("&lt;script&gt;");
		expect(result).not.toContain("<script>");
	});

	it("escapes HTML details/summary tags", () => {
		const result = renderTeamMarkdown("<details><summary>click</summary>body</details>");
		expect(result).toContain("&lt;details&gt;");
		expect(result).not.toContain("<details>");
	});

	it("renders GFM pipe tables as <table>", () => {
		const md = [
			"| 图标 | 名称 | 用途 |",
			"| --- | --- | --- |",
			"| 🔍 | Search | 搜索 |",
			"| 📊 | Chart | 图表 |",
		].join("\n");
		const result = renderTeamMarkdown(md);
		expect(result).toContain("<table");
		expect(result).toContain("<th");
		expect(result).toContain("<td");
		expect(result).toContain("Search");
		expect(result).toContain("图表");
	});

	it("renders headings", () => {
		expect(renderTeamMarkdown("# H1")).toContain("<h1");
		expect(renderTeamMarkdown("## H2")).toContain("<h2");
		expect(renderTeamMarkdown("### H3")).toContain("<h3");
	});

	it("renders code blocks", () => {
		const result = renderTeamMarkdown("```js\nconsole.log(1)\n```");
		expect(result).toContain("<code");
		expect(result).toContain("console.log(1)");
	});

	it("renders inline code", () => {
		const result = renderTeamMarkdown("use `foo` here");
		expect(result).toContain("<code>");
		expect(result).toContain("foo");
	});

	it("renders lists", () => {
		const result = renderTeamMarkdown("- item 1\n- item 2");
		expect(result).toContain("<li");
		expect(result).toContain("item 1");
	});

	it("renders https links with target blank and rel", () => {
		const result = renderTeamMarkdown("[example](https://example.com)");
		expect(result).toContain('href="https://example.com"');
		expect(result).toContain('target="_blank"');
		expect(result).toContain('rel="noreferrer noopener"');
		expect(result).toContain("example");
	});

	it("strips javascript: links to plain text", () => {
		const result = renderTeamMarkdown("[click](javascript:alert(1))");
		expect(result).not.toContain("javascript:");
		expect(result).not.toContain("href=");
		expect(result).toContain("click");
	});

	it("strips data: links to plain text", () => {
		const result = renderTeamMarkdown("[bad](data:text/html,<script>)");
		expect(result).not.toContain("data:");
		expect(result).not.toContain("href=");
		expect(result).toContain("bad");
	});

	it("renders blockquotes", () => {
		const result = renderTeamMarkdown("> quoted text");
		expect(result).toContain("<blockquote");
		expect(result).toContain("quoted text");
	});

	it("renders paragraphs", () => {
		const result = renderTeamMarkdown("hello world");
		expect(result).toContain("<p>");
		expect(result).toContain("hello world");
	});

	it("handles empty input", () => {
		expect(renderTeamMarkdown("")).toBe("<p></p>");
		expect(renderTeamMarkdown("  ")).toBe("<p></p>");
	});

	it("renders bold and italic", () => {
		expect(renderTeamMarkdown("**bold**")).toContain("<strong>");
		expect(renderTeamMarkdown("*italic*")).toContain("<em>");
	});
});
