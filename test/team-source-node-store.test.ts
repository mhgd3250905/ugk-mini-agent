import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SourceNodeStore, inferSourceNodeOutputType } from "../src/team/source-node-store.js";

async function makeRoot(): Promise<string> {
	return mkdtemp(join(tmpdir(), "team-source-node-store-"));
}

test("missing source-nodes store returns empty array", async () => {
	const root = await makeRoot();
	try {
		const store = new SourceNodeStore(root);
		assert.deepEqual(await store.list(), []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("invalid source-nodes JSON throws instead of returning empty", async () => {
	const root = await makeRoot();
	try {
		await writeFile(join(root, "source-nodes.json"), "{bad json", "utf8");
		const store = new SourceNodeStore(root);
		await assert.rejects(
			() => store.list(),
			(err: Error) => /source node store contains invalid JSON/i.test(err.message),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("creates text source node with string output", async () => {
	const root = await makeRoot();
	try {
		const store = new SourceNodeStore(root);
		const node = await store.create({
			title: "需求说明",
			nodeType: "text",
			content: { text: "请按这段要求执行。" },
		});

		assert.equal(node.schemaVersion, "team/source-node-1");
		assert.match(node.sourceNodeId, /^source_/);
		assert.equal(node.title, "需求说明");
		assert.equal(node.nodeType, "text");
		assert.deepEqual(node.outputPort, { id: "value", type: "string" });
		assert.equal(node.content?.text, "请按这段要求执行。");
		assert.equal(node.archived, false);
		assert.deepEqual(await store.list(), [node]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("creates file source node with inferred output types", async () => {
	const root = await makeRoot();
	try {
		const store = new SourceNodeStore(root);
		const cases = [
			["brief.md", "md"],
			["brief.markdown", "md"],
			["data.json", "json"],
			["page.html", "html"],
			["page.htm", "html"],
			["notes.txt", "string"],
			["archive.bin", "file"],
			["README.MD", "md"],
		] as const;

		for (const [fileName, expectedType] of cases) {
			const node = await store.create({
				title: fileName,
				nodeType: "file",
				content: { fileName, mimeType: "text/plain", size: 42, storageRef: `asset://${fileName}` },
			});
			assert.equal(node.outputPort.type, expectedType);
			assert.equal(node.content?.fileName, fileName);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("inferSourceNodeOutputType maps known extensions and falls back to file", () => {
	assert.equal(inferSourceNodeOutputType("draft.md"), "md");
	assert.equal(inferSourceNodeOutputType("draft.markdown"), "md");
	assert.equal(inferSourceNodeOutputType("data.json"), "json");
	assert.equal(inferSourceNodeOutputType("page.html"), "html");
	assert.equal(inferSourceNodeOutputType("page.htm"), "html");
	assert.equal(inferSourceNodeOutputType("notes.txt"), "string");
	assert.equal(inferSourceNodeOutputType("unknown.zip"), "file");
	assert.equal(inferSourceNodeOutputType("no-extension"), "file");
});

test("rejects invalid source node fields", async () => {
	const root = await makeRoot();
	try {
		const store = new SourceNodeStore(root);
		await assert.rejects(
			() => store.create({ sourceNodeId: "bad id", title: "ok", nodeType: "text", content: { text: "x" } }),
			/sourceNodeId must be a stable source identifier/,
		);
		await assert.rejects(
			() => store.create({ title: "", nodeType: "text", content: { text: "x" } }),
			/title must be a non-empty string/,
		);
		await assert.rejects(
			() => store.create({ title: "bad port", nodeType: "text", outputPort: { id: "other", type: "string" } }),
			/outputPort.id must be "value"/,
		);
		await assert.rejects(
			() => store.create({ title: "empty type", nodeType: "text", outputPort: { id: "value", type: "" } }),
			/outputPort.type is required/,
		);
		await assert.rejects(
			() => store.create({ title: "bad type", nodeType: "text", outputPort: { id: "value", type: "Markdown" } }),
			/outputPort.type must be one of/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("archive hides source node from default list", async () => {
	const root = await makeRoot();
	try {
		const store = new SourceNodeStore(root);
		const node = await store.create({ title: "临时输入", nodeType: "text", content: { text: "x" } });
		const archived = await store.archive(node.sourceNodeId);

		assert.equal(archived.archived, true);
		assert.deepEqual(await store.list(), []);
		assert.deepEqual(await store.list({ includeArchived: true }), [archived]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
