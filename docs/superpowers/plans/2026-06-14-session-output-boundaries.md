# Session Output Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent large tool outputs from turning agent session JSONL files into multi-hundred-MB hot-path inputs while preserving full output through downloadable artifacts.

**Architecture:** Add a single session message compaction boundary that converts oversized persisted message payloads into small previews plus file references. `AgentService` orchestrates compaction after runs; session readers project compacted messages; a migration script rewrites existing oversized sessions with backups and a report.

**Tech Stack:** TypeScript, Node.js `node:test`, existing `AssetStore.saveFiles`, existing `/v1/files/:fileId` download route, JSONL session files.

---

## File Structure

- Create `src/agent/session-message-compactor.ts`
  - Owns size thresholds, text extraction, preview generation, artifact draft creation, and pure message replacement.
  - No service state, no HTTP code, no direct session manager dependency.

- Modify `src/agent/agent-session-factory.ts`
  - Applies projection when reading full or recent JSONL messages.
  - Exposes rewrite helper only if needed for migration tests.

- Modify `src/agent/agent-service.ts`
  - Calls compaction after each completed or failed run when `assetStore` and `sessionFile` are available.
  - Logs a concise compaction summary.
  - Keeps active-run behavior unchanged.

- Create `scripts/compact-agent-session.mjs`
  - Offline migration tool for existing large JSONL sessions.
  - Writes a `.bak` backup and a markdown report.

- Modify tests:
  - `test/session-message-compactor.test.ts`
  - `test/agent-service-chat-run.test.ts`
  - `test/agent-conversation-context.test.ts`
  - `test/agent-service-conversation-state.test.ts`

## Constants

Use conservative defaults:

```ts
export const LARGE_SESSION_MESSAGE_TEXT_BYTES = 256 * 1024;
export const LARGE_SESSION_MESSAGE_PREVIEW_CHARS = 8 * 1024;
export const LARGE_SESSION_COMPACTION_MIME_TYPE = "text/plain; charset=utf-8";
```

The threshold is deliberately below the observed 12MB-22MB rows and high enough not to affect normal tool summaries.

## Task 1: Pure Compactor

**Files:**
- Create: `src/agent/session-message-compactor.ts`
- Test: `test/session-message-compactor.test.ts`

- [ ] **Step 1: Write failing tests for pure compaction**

Create `test/session-message-compactor.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests and verify red**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\session-message-compactor.test.ts
```

Expected: FAIL because `session-message-compactor.ts` does not exist.

- [ ] **Step 3: Implement minimal pure compactor**

Create `src/agent/session-message-compactor.ts` with:

```ts
import { createHash } from "node:crypto";
import type { AgentFileArtifact, AgentFileDraft } from "./file-artifacts.js";
import type { AgentSessionMessageLike } from "./agent-session-factory.js";

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
		const [artifact] = await input.saveFiles(input.conversationId, [{
			fileName,
			mimeType: LARGE_SESSION_COMPACTION_MIME_TYPE,
			content: candidate.text,
		}]);
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
```

Then add helper functions in the same file:

```ts
function extractOversizedText(message: AgentSessionMessageLike): { text: string; bytes: number } | undefined {
	const text = extractMessageLargeText(message);
	if (!text) {
		return undefined;
	}
	const bytes = Buffer.byteLength(text, "utf8");
	return bytes > LARGE_SESSION_MESSAGE_TEXT_BYTES ? { text, bytes } : undefined;
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
	const preview = text.slice(0, LARGE_SESSION_MESSAGE_PREVIEW_CHARS);
	const notice = [
		`Large tool output omitted from session history.`,
		`Original size: ${Buffer.byteLength(text, "utf8")} bytes.`,
		`Preview:`,
		preview,
		`Full output: ${artifact.downloadUrl}`,
	].join("\n");
	return {
		...message,
		content: [{ type: "text", text: notice }],
		output: undefined,
		summary: typeof message.summary === "string" ? message.summary : "Large output stored as an artifact.",
		toolResultArtifact: {
			assetId: artifact.assetId,
			fileName: artifact.fileName,
			mimeType: artifact.mimeType,
			sizeBytes: artifact.sizeBytes,
			downloadUrl: artifact.downloadUrl,
		},
	} as AgentSessionMessageLike;
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
```

- [ ] **Step 4: Run tests and verify green**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\session-message-compactor.test.ts
```

Expected: PASS.

## Task 2: Post-Run Session File Rewrite

**Files:**
- Modify: `src/agent/session-message-compactor.ts`
- Modify: `src/agent/agent-service.ts`
- Test: `test/agent-service-chat-run.test.ts`

- [ ] **Step 1: Add failing service test**

Add a test that uses a real temp JSONL session file and a fake asset store. The fake session should append a large `toolResult` to `session.messages` during `prompt`, and the test should prewrite the same raw message to the JSONL file to simulate the external session manager.

Expected assertions:

```ts
assert.equal(assetStore.saved.length, 1);
assert.ok((await readFile(sessionFile, "utf8")).length < oversizedText.length / 2);
assert.match(await readFile(sessionFile, "utf8"), /Large tool output omitted from session history/);
```

- [ ] **Step 2: Implement JSONL rewrite helper**

Add to `session-message-compactor.ts`:

```ts
export async function rewriteSessionFileMessages(input: {
	sessionFile: string;
	messages: readonly AgentSessionMessageLike[];
}): Promise<void> {
	const lines = input.messages.map((message) => JSON.stringify({
		type: "message",
		timestamp: typeof message.timestamp === "string" ? message.timestamp : new Date().toISOString(),
		message,
	}));
	await writeFile(input.sessionFile, `${lines.join("\n")}\n`, "utf8");
}
```

Use an atomic temp file and `renameWithTransientRetry` before merging.

- [ ] **Step 3: Call compaction in `AgentService.runChat` finally**

Add a private method:

```ts
private async compactSessionAfterRun(conversationId: string, session: AgentSessionLike): Promise<void> {
	if (!session.sessionFile || !this.options.assetStore) {
		return;
	}
	const messages = ((session.messages as AgentSessionMessageLike[] | undefined) ?? []);
	const result = await compactLargeSessionMessages({
		conversationId,
		messages,
		saveFiles: (targetConversationId, files) => this.options.assetStore!.saveFiles(targetConversationId, files),
	});
	if (!result.changed) {
		return;
	}
	session.messages = result.messages;
	await rewriteSessionFileMessages({ sessionFile: session.sessionFile, messages: result.messages });
	console.info(`[session-compaction] conversation=${conversationId} artifacts=${result.artifactCount} originalBytes=${result.originalBytes} compactedBytes=${result.compactedBytes}`);
}
```

Call it in `finally` before metadata is persisted and before terminal snapshot is built.

- [ ] **Step 4: Run service tests**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\agent-service-chat-run.test.ts test\agent-service-conversation-state.test.ts
```

Expected: PASS.

## Task 3: Reader Projection Safety

**Files:**
- Modify: `src/agent/session-message-compactor.ts`
- Modify: `src/agent/agent-session-factory.ts`
- Test: `test/agent-conversation-context.test.ts`

- [ ] **Step 1: Add tests for read projection**

Add a test proving parsed messages with existing `toolResultArtifact` stay small and regular `send_file` tool results keep file extraction behavior.

- [ ] **Step 2: Project messages after JSONL parsing**

In `agent-session-factory.ts`, after `parseSessionMessageLines`, call a pure projection helper that removes legacy accidental `output: undefined` properties and returns compacted references unchanged.

- [ ] **Step 3: Run context tests**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\agent-conversation-context.test.ts test\agent-conversation-history.test.ts
```

Expected: PASS.

## Task 4: Offline Migration Script

**Files:**
- Create: `scripts/compact-agent-session.mjs`
- Test: `test/session-compaction-script.test.ts`

- [ ] **Step 1: Add CLI test**

Create a temp project with:

```text
.data/agent/sessions/large.jsonl
.data/agent/assets/index.json
.data/agent/assets/blobs/
```

Run:

```powershell
node scripts\compact-agent-session.mjs --conversation-id manual:large --session-file <temp>\large.jsonl --project-root <temp>
```

Assert:

```ts
assert.ok(await exists(`${sessionFile}.bak`));
assert.ok((await stat(sessionFile)).size < rawSize / 2);
assert.match(await readFile(reportPath, "utf8"), /Compacted session/);
assert.match(await readFile(assetIndexPath, "utf8"), /agent_output/);
```

- [ ] **Step 2: Implement CLI**

The CLI should:

```text
1. parse --conversation-id, --session-file, --project-root
2. read JSONL message events
3. use AssetStore.saveFiles through compactLargeSessionMessages
4. write <session-file>.bak if missing
5. atomically rewrite session file
6. write markdown report next to the session file
7. log one summary line to stdout
```

- [ ] **Step 3: Run script test**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\session-compaction-script.test.ts
```

Expected: PASS.

## Task 5: Current Incident Migration

**Files:**
- Existing session: `.data/agent/sessions/2026-06-13T15-34-06-599Z_019ec19e-7006-770c-9ad4-5554523fea69.jsonl`

- [ ] **Step 1: Dry inspect size**

Run:

```powershell
Get-Item '.data\agent\sessions\2026-06-13T15-34-06-599Z_019ec19e-7006-770c-9ad4-5554523fea69.jsonl' |
  Select-Object FullName,Length
```

- [ ] **Step 2: Run migration**

Run:

```powershell
node scripts\compact-agent-session.mjs --conversation-id 'manual:add002d5-4253-49e2-ac09-d6a998f74eca' --session-file '.data\agent\sessions\2026-06-13T15-34-06-599Z_019ec19e-7006-770c-9ad4-5554523fea69.jsonl' --project-root .
```

- [ ] **Step 3: Verify shrink and backup**

Run:

```powershell
Get-Item '.data\agent\sessions\2026-06-13T15-34-06-599Z_019ec19e-7006-770c-9ad4-5554523fea69.jsonl',
         '.data\agent\sessions\2026-06-13T15-34-06-599Z_019ec19e-7006-770c-9ad4-5554523fea69.jsonl.bak' |
  Select-Object Name,Length
```

Expected: active file is much smaller; backup preserves original.

## Task 6: High-Frequency Endpoint Audit

**Files:**
- Modify: `src/agent/agent-service.ts`
- Test: `test/agent-service-conversation-state.test.ts`

- [ ] **Step 1: Add tests that forbid full reads for state/status hot paths when recent windows exist**

Status already has a regression test. Add or update state tests to assert:

```ts
assert.deepEqual(factory.readCalls, []);
assert.deepEqual(factory.readRecentCalls[0]?.input.includeContextUsageAnchor, true);
```

- [ ] **Step 2: Keep history pagination behavior explicit**

Do not silently change `/history` to omit older messages. If full history remains full-read for older pages, document it in comments and leave it out of high-frequency polling.

- [ ] **Step 3: Run focused tests**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\agent-service-conversation-state.test.ts test\chat-conversation-routes.test.ts
```

Expected: PASS.

## Task 7: Final Verification and Version Saves

**Files:**
- All touched files.

- [ ] **Step 1: Run focused verification**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\session-message-compactor.test.ts test\agent-service-chat-run.test.ts test\agent-service-conversation-state.test.ts test\agent-conversation-context.test.ts
npx tsc --noEmit
```

Expected: all exit 0.

- [ ] **Step 2: Run broader verification**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\agent-service*.test.ts
```

Expected: all agent-service tests pass.

- [ ] **Step 3: Commit scoped changes only**

Check status:

```powershell
git status --short
```

Commit only files from this plan and the earlier `/chat/status` hot-path fix:

```powershell
git add src\agent\agent-service.ts src\agent\agent-session-factory.ts src\agent\session-message-compactor.ts test\session-message-compactor.test.ts test\agent-service-chat-run.test.ts test\agent-conversation-context.test.ts test\agent-service-conversation-state.test.ts scripts\compact-agent-session.mjs docs\superpowers\plans\2026-06-14-session-output-boundaries.md
git commit -m "fix: bound persisted agent session output"
```

Do not add unrelated existing changes such as public site, package files, traineddata files, or email scripts.

## Self-Review

- Spec coverage: The plan covers source prevention, read-path safety, old-data migration, logs, tests, and version save.
- Placeholder scan: No task depends on an undefined "later" step.
- Type consistency: The plan uses existing `AgentSessionMessageLike`, `AgentFileDraft`, `AgentFileArtifact`, and `AssetStoreLike.saveFiles`.
- Scope check: The plan intentionally excludes a full replacement of `@mariozechner/pi-coding-agent` session persistence because current code does not own that write path.
