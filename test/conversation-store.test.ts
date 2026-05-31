import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rename, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConversationStore } from "../src/agent/conversation-store.js";

async function createTempPath(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ugk-pi-conversation-store-"));
	return join(dir, "conversation-index.json");
}

test("creates a new store file when setting a conversation mapping", async () => {
	const indexPath = await createTempPath();
	const store = new ConversationStore(indexPath);

	await store.set("manual:test-1", "E:/sessions/session-1.jsonl", {
		skillFingerprint: "skills-v1",
	});

	const entry = await store.get("manual:test-1");
	assert.deepEqual(entry, {
		createdAt: entry?.createdAt,
		messageCount: 0,
		sessionFile: "E:/sessions/session-1.jsonl",
		updatedAt: entry?.updatedAt,
		skillFingerprint: "skills-v1",
	});
	assert.ok(entry?.updatedAt);
	assert.ok(entry?.createdAt);
});

test("returns undefined for unknown conversations", async () => {
	const indexPath = await createTempPath();
	const store = new ConversationStore(indexPath);

	const entry = await store.get("manual:missing");

	assert.equal(entry, undefined);
});

test("loads existing mappings from disk", async () => {
	const indexPath = await createTempPath();
	await writeFile(
		indexPath,
		JSON.stringify(
			{
				"manual:test-2": {
					sessionFile: "E:/sessions/session-2.jsonl",
					updatedAt: "2026-04-17T10:00:00.000Z",
					skillFingerprint: "skills-v2",
				},
			},
			null,
			2,
		),
		"utf8",
	);

	const store = new ConversationStore(indexPath);
	const entry = await store.get("manual:test-2");

	assert.deepEqual(entry, {
		sessionFile: "E:/sessions/session-2.jsonl",
		updatedAt: "2026-04-17T10:00:00.000Z",
		skillFingerprint: "skills-v2",
	});
});

test("reuses cached state when the index file mtime is unchanged", async () => {
	const indexPath = await createTempPath();
	await writeFile(
		indexPath,
		JSON.stringify(
			{
				currentConversationId: "manual:cached",
				conversations: {
					"manual:cached": {
						sessionFile: "E:/sessions/cached.jsonl",
						updatedAt: "2026-04-17T10:00:00.000Z",
					},
				},
			},
			null,
			2,
		),
		"utf8",
	);
	const originalStat = await stat(indexPath);
	const store = new ConversationStore(indexPath);

	assert.equal((await store.get("manual:cached"))?.sessionFile, "E:/sessions/cached.jsonl");
	await writeFile(indexPath, "{invalid-json", "utf8");
	await utimes(indexPath, originalStat.atime, originalStat.mtime);

	assert.equal(await store.getCurrentConversationId(), "manual:cached");
	assert.deepEqual(
		(await store.list()).map((entry) => entry.conversationId),
		["manual:cached"],
	);
});

test("treats empty and invalid files as empty stores", async () => {
	const emptyPath = await createTempPath();
	await writeFile(emptyPath, "", "utf8");
	const emptyStore = new ConversationStore(emptyPath);
	assert.equal(await emptyStore.get("manual:any"), undefined);

	const invalidPath = await createTempPath();
	await writeFile(invalidPath, "{invalid-json", "utf8");
	const invalidStore = new ConversationStore(invalidPath);
	assert.equal(await invalidStore.get("manual:any"), undefined);
});

test("persists updates and overwrites previous session files", async () => {
	const indexPath = await createTempPath();
	const store = new ConversationStore(indexPath);

	await store.set("manual:test-3", "E:/sessions/old.jsonl", {
		skillFingerprint: "skills-v1",
	});
	await store.set("manual:test-3", "E:/sessions/new.jsonl", {
		skillFingerprint: "skills-v2",
	});

	const persisted = JSON.parse(await readFile(indexPath, "utf8")) as {
		conversations: Record<string, { sessionFile?: string; updatedAt: string; skillFingerprint?: string }>;
	};
	assert.equal(persisted.conversations["manual:test-3"]?.sessionFile, "E:/sessions/new.jsonl");
	assert.ok(persisted.conversations["manual:test-3"]?.updatedAt);
	assert.equal(persisted.conversations["manual:test-3"]?.skillFingerprint, "skills-v2");
});

test("tracks and persists the current conversation pointer", async () => {
	const indexPath = await createTempPath();
	const store = new ConversationStore(indexPath);

	await store.set("manual:test-4", undefined);
	await store.setCurrentConversationId("manual:test-4");

	assert.equal(await store.getCurrentConversationId(), "manual:test-4");

	const persisted = await readFile(indexPath, "utf8");
	assert.match(persisted, /"currentConversationId":\s*"manual:test-4"/);
});

test("serializes concurrent conversation writes without losing fields", async () => {
	const indexPath = await createTempPath();
	const store = new ConversationStore(indexPath);

	await Promise.all([
		store.set("manual:parallel", "E:/sessions/parallel.jsonl", {
			title: "Parallel",
			preview: "kept",
			messageCount: 3,
		}),
		store.setCurrentConversationId("manual:parallel"),
	]);

	assert.equal(await store.getCurrentConversationId(), "manual:parallel");
	const entry = await store.get("manual:parallel");
	assert.deepEqual(entry, {
		createdAt: entry?.createdAt,
		messageCount: 3,
		preview: "kept",
		sessionFile: "E:/sessions/parallel.jsonl",
		title: "Parallel",
		updatedAt: entry?.updatedAt,
	});
	const persisted = JSON.parse(await readFile(indexPath, "utf8")) as {
		currentConversationId?: string;
		conversations: Record<string, { sessionFile?: string; title?: string; preview?: string; messageCount?: number }>;
	};
	assert.equal(persisted.currentConversationId, "manual:parallel");
	assert.equal(persisted.conversations["manual:parallel"]?.sessionFile, "E:/sessions/parallel.jsonl");
	assert.equal(persisted.conversations["manual:parallel"]?.title, "Parallel");
	assert.equal(persisted.conversations["manual:parallel"]?.preview, "kept");
	assert.equal(persisted.conversations["manual:parallel"]?.messageCount, 3);
});

test("retries transient file replacement failures while writing state", async () => {
	const indexPath = await createTempPath();
	let attempts = 0;
	const store = new ConversationStore(indexPath, {
		renameFile: async (source, target) => {
			attempts += 1;
			if (attempts === 1) {
				const error = new Error("temporary file replacement lock") as NodeJS.ErrnoException;
				error.code = "EPERM";
				throw error;
			}
			await rename(source, target);
		},
		renameRetryDelayMs: 0,
	});

	await store.set("manual:rename-retry", "E:/sessions/retry.jsonl");

	assert.equal(attempts, 2);
	const persisted = JSON.parse(await readFile(indexPath, "utf8")) as {
		conversations: Record<string, { sessionFile?: string }>;
	};
	assert.equal(persisted.conversations["manual:rename-retry"]?.sessionFile, "E:/sessions/retry.jsonl");
});

test("lists conversations ordered by most recent update", async () => {
	const indexPath = await createTempPath();
	const store = new ConversationStore(indexPath);

	await store.set("manual:older", "E:/sessions/older.jsonl");
	await new Promise((resolve) => setTimeout(resolve, 10));
	await store.set("manual:newer", "E:/sessions/newer.jsonl");

	const entries = await store.list();

	assert.deepEqual(
		entries.map((entry) => entry.conversationId),
		["manual:newer", "manual:older"],
	);
});

test("falls back when the stored current conversation points at a missing entry", async () => {
	const indexPath = await createTempPath();
	await writeFile(
		indexPath,
		JSON.stringify(
			{
				currentConversationId: "manual:missing",
				conversations: {
					"manual:older": {
						sessionFile: "E:/sessions/older.jsonl",
						updatedAt: "2026-04-17T10:00:00.000Z",
					},
					"manual:newer": {
						sessionFile: "E:/sessions/newer.jsonl",
						updatedAt: "2026-04-18T10:00:00.000Z",
					},
				},
			},
			null,
			2,
		),
		"utf8",
	);
	const store = new ConversationStore(indexPath);

	assert.equal(await store.getCurrentConversationId(), "manual:newer");
});

test("normalizes malformed conversation entries instead of breaking list sorting", async () => {
	const indexPath = await createTempPath();
	await writeFile(
		indexPath,
		JSON.stringify(
			{
				currentConversationId: "manual:valid",
				conversations: {
					"manual:valid": {
						sessionFile: "E:/sessions/valid.jsonl",
						updatedAt: "2026-04-18T10:00:00.000Z",
						messageCount: 2,
					},
					"manual:blank": {},
					"manual:null": null,
					"manual:odd": {
						updatedAt: 123,
						messageCount: "many",
					},
				},
			},
			null,
			2,
		),
		"utf8",
	);
	const store = new ConversationStore(indexPath);

	assert.deepEqual(
		(await store.list()).map((entry) => ({
			conversationId: entry.conversationId,
			messageCount: entry.messageCount,
			updatedAt: entry.updatedAt,
		})),
		[
			{
				conversationId: "manual:valid",
				messageCount: 2,
				updatedAt: "2026-04-18T10:00:00.000Z",
			},
			{
				conversationId: "manual:blank",
				messageCount: 0,
				updatedAt: "1970-01-01T00:00:00.000Z",
			},
			{
				conversationId: "manual:null",
				messageCount: 0,
				updatedAt: "1970-01-01T00:00:00.000Z",
			},
			{
				conversationId: "manual:odd",
				messageCount: 0,
				updatedAt: "1970-01-01T00:00:00.000Z",
			},
		],
	);
});
