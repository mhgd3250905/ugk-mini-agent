import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	countLines,
	isCountableCodeFile,
	summarizeCodeSize,
	formatMarkdownTable,
	collectCodeSizeRows,
} from "../scripts/code-size-baseline.mjs";

test("code size baseline counts lines without phantom trailing lines", () => {
	assert.equal(countLines(""), 0);
	assert.equal(countLines("one"), 1);
	assert.equal(countLines("one\n"), 1);
	assert.equal(countLines("one\n\n"), 2);
	assert.equal(countLines("a\nb\nc"), 3);
	assert.equal(countLines("a\nb\nc\n"), 3);
});

test("code size baseline filters tracked code paths deterministically", () => {
	assert.equal(isCountableCodeFile("src/ui/playground-styles.ts"), true);
	assert.equal(isCountableCodeFile("apps/team-console/src/app/App.tsx"), true);
	assert.equal(isCountableCodeFile("test/server.test.ts"), true);
	assert.equal(isCountableCodeFile("scripts/server-ops.mjs"), true);

	assert.equal(isCountableCodeFile("docs/handoff-current.md"), false);
	assert.equal(isCountableCodeFile("public/rsa-root-cert-report.html"), false);
	assert.equal(isCountableCodeFile("runtime/screenshot.mjs"), false);
	assert.equal(
		isCountableCodeFile("references/pi-mono/packages/coding-agent/index.ts"),
		false,
	);
});

test("code size baseline formats largest files as markdown", () => {
	const unsorted = [
		{ path: "src/small.ts", lines: 100 },
		{ path: "src/big.ts", lines: 500 },
		{ path: "src/medium.ts", lines: 300 },
		{ path: "src/threshold.ts", lines: 1500 },
		{ path: "src/above.ts", lines: 2000 },
	];
	const rows = [...unsorted].sort(
		(a, b) => b.lines - a.lines || a.path.localeCompare(b.path),
	);
	const summary = summarizeCodeSize(rows, { threshold: 1500 });
	assert.equal(summary.trackedCodeFiles, 5);
	assert.equal(summary.totalLines, 4400);
	assert.equal(summary.filesAtOrAboveThreshold, 2);

	const table = formatMarkdownTable(rows, { limit: 3 });
	assert.ok(table.includes("2000"));
	assert.ok(table.includes("src/above.ts"));
	assert.ok(table.includes("src/threshold.ts"));
	assert.ok(!table.includes("src/small.ts"));
});

test("code size baseline cli emits json for the current repo", () => {
	const result = spawnSync(
		process.execPath,
		["scripts/code-size-baseline.mjs", "--json", "--limit", "5", "--threshold", "1500"],
		{ encoding: "utf-8", cwd: process.cwd() },
	);
	assert.equal(result.status, 0, `stderr: ${result.stderr}`);
	const parsed = JSON.parse(result.stdout);
	assert.ok(parsed.summary.trackedCodeFiles > 0);
	assert.ok(parsed.summary.totalLines > 0);
	assert.ok(parsed.largestFiles.length <= 5);
	for (const f of parsed.largestFiles) {
		assert.ok(!f.path.includes("\\"), `path uses backslash: ${f.path}`);
	}

	const { rows } = collectCodeSizeRows();
	const serverTest = rows.find((r: { path: string }) => r.path === "test/server.test.ts");
	assert.ok(serverTest, "test/server.test.ts should be in collected rows");
	assert.ok(serverTest.lines > 0);
});

test("code size baseline collectCodeSizeRows reads files relative to cwd", () => {
	const tempDir = mkdtempSync(join(tmpdir(), "code-size-cwd-"));
	try {
		execFileSync("git", ["init"], { cwd: tempDir, encoding: "utf-8" });
		execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: tempDir, encoding: "utf-8" });
		execFileSync("git", ["config", "user.name", "Test"], { cwd: tempDir, encoding: "utf-8" });
		mkdirSync(join(tempDir, "src"));
		writeFileSync(join(tempDir, "src", "only-here.ts"), "one\ntwo\n");
		execFileSync("git", ["add", "src/only-here.ts"], { cwd: tempDir, encoding: "utf-8" });
		const { rows, skippedFiles } = collectCodeSizeRows({ cwd: tempDir });
		const found = rows.find((r: { path: string }) => r.path === "src/only-here.ts");
		assert.ok(found, "src/only-here.ts should be in rows");
		assert.equal(found.lines, 2);
		assert.equal(skippedFiles, 0);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
