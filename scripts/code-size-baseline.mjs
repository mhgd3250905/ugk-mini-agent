import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const CODE_SIZE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".css",
]);

export const DEFAULT_EXCLUDE_PREFIXES = [
	"node_modules/",
	"dist/",
	"build/",
	"coverage/",
	".data/",
	"runtime/",
	"public/",
	"references/",
];

export function isCountableCodeFile(filePath) {
	const normalized = filePath.replace(/\\/g, "/");
	const ext = normalized.slice(normalized.lastIndexOf("."));
	if (!CODE_SIZE_EXTENSIONS.has(ext)) return false;
	for (const prefix of DEFAULT_EXCLUDE_PREFIXES) {
		if (normalized.startsWith(prefix)) return false;
	}
	return true;
}

export function countLines(text) {
	if (text === "") return 0;
	let count = 0;
	let atEnd = true;
	for (let i = text.length - 1; i >= 0; i--) {
		if (text[i] === "\n") {
			if (atEnd) {
				atEnd = false;
				continue;
			}
			count++;
			atEnd = false;
		} else {
			atEnd = false;
		}
	}
	if (text.length > 0) count++;
	return count;
}

export function collectCodeSizeRows(options = {}) {
	const { cwd } = options;
	const gitArgs = ["ls-files", "-z"];
	const raw = execFileSync("git", gitArgs, { encoding: "utf-8", cwd });
	const paths = raw.split("\0").filter(Boolean);
	const rows = [];
	let skippedFiles = 0;
	for (const p of paths) {
		const normalized = p.replace(/\\/g, "/");
		if (!isCountableCodeFile(normalized)) continue;
		try {
			const readPath = cwd ? join(cwd, normalized) : normalized;
			const content = readFileSync(readPath, "utf-8");
			rows.push({ path: normalized, lines: countLines(content) });
		} catch (err) {
			if (
				err.code === "ENOENT" ||
				err.code === "EISDIR" ||
				err.code === "EACCES" ||
				err.code === "EPERM"
			) {
				skippedFiles++;
			} else {
				throw err;
			}
		}
	}
	rows.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
	return { rows, skippedFiles };
}

export function summarizeCodeSize(rows, options = {}) {
	const { threshold = 1500 } = options;
	const totalLines = rows.reduce((sum, r) => sum + r.lines, 0);
	return {
		trackedCodeFiles: rows.length,
		totalLines,
		filesAtOrAboveThreshold: rows.filter((r) => r.lines >= threshold).length,
		threshold,
		skippedFiles: 0,
	};
}

export function formatMarkdownTable(rows, options = {}) {
	const { limit = 20 } = options;
	const top = rows.slice(0, limit);
	const lines = ["| Lines | Path |", "|------:|------|"];
	for (const r of top) {
		lines.push(`| ${r.lines} | ${r.path} |`);
	}
	return lines.join("\n");
}

function parseArgs(argv) {
	const args = argv.slice(2);
	let json = false;
	let limit = 20;
	let threshold = 1500;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--json") {
			json = true;
		} else if (args[i] === "--limit") {
			i++;
			const n = Number(args[i]);
			if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
				process.stderr.write(`Error: --limit requires a non-negative integer, got "${args[i]}"\n`);
				process.exit(2);
			}
			limit = n;
		} else if (args[i] === "--threshold") {
			i++;
			const n = Number(args[i]);
			if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
				process.stderr.write(`Error: --threshold requires a non-negative integer, got "${args[i]}"\n`);
				process.exit(2);
			}
			threshold = n;
		}
	}
	return { json, limit, threshold };
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/code-size-baseline.mjs")) {
	const { json, limit, threshold } = parseArgs(process.argv);
	const { rows, skippedFiles } = collectCodeSizeRows();
	const summary = summarizeCodeSize(rows, { threshold });
	summary.skippedFiles = skippedFiles;
	if (json) {
		const output = {
			summary,
			largestFiles: rows.slice(0, limit),
		};
		process.stdout.write(JSON.stringify(output, null, 2) + "\n");
	} else {
		const table = formatMarkdownTable(rows, { limit });
		process.stdout.write(`## Code Size Baseline\n\n`);
		process.stdout.write(`${summary.trackedCodeFiles} tracked code files, ${summary.totalLines} total lines.\n`);
		if (summary.skippedFiles > 0) {
			process.stdout.write(`${summary.skippedFiles} file(s) skipped (unreadable).\n`);
		}
		process.stdout.write(`\n### Largest Files (top ${Math.min(limit, rows.length)})\n\n`);
		process.stdout.write(table + "\n");
	}
}
