import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { LARGE_SESSION_MESSAGE_TEXT_BYTES } from "../src/agent/session-message-compactor.js";

const execFileAsync = promisify(execFile);

test("compact-agent-session script backs up and compacts an oversized session", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-compact-cli-"));
	const sessionFile = join(projectRoot, ".data", "agent", "sessions", "large.jsonl");
	const oversizedText = "z".repeat(LARGE_SESSION_MESSAGE_TEXT_BYTES + 4096);
	await mkdir(dirname(sessionFile), { recursive: true });
	await writeFile(
		sessionFile,
		[
			{
				type: "message",
				timestamp: "2026-06-14T00:00:00.000Z",
				message: {
					role: "toolResult",
					toolCallId: "tool-cli",
					toolName: "conn",
					content: [{ type: "text", text: oversizedText }],
					isError: false,
				},
			},
			{
				type: "message",
				timestamp: "2026-06-14T00:00:01.000Z",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "done" }],
					stopReason: "stop",
				},
			},
		].map((event) => JSON.stringify(event)).join("\n") + "\n",
		"utf8",
	);
	const before = await stat(sessionFile);

	const { stdout } = await execFileAsync("node", [
		"scripts/compact-agent-session.mjs",
		"--conversation-id",
		"manual:large",
		"--session-file",
		sessionFile,
		"--project-root",
		projectRoot,
	], {
		cwd: process.cwd(),
	});

	const after = await stat(sessionFile);
	const reportPath = `${sessionFile}.compaction-report.md`;
	const assetIndexPath = join(projectRoot, ".data", "agent", "asset-index.json");
	await access(`${sessionFile}.bak`);
	assert.ok(after.size < before.size / 2);
	assert.match(stdout, /Compacted session/);
	assert.match(await readFile(sessionFile, "utf8"), /Large tool output omitted from session history/);
	assert.match(await readFile(reportPath, "utf8"), /Compacted session/);
	assert.match(await readFile(assetIndexPath, "utf8"), /agent_output/);
});
