#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const cliPath = resolve(projectRoot, "src", "agent", "session-compaction-cli.ts");

const result = spawnSync(
	process.execPath,
	["--import", "tsx", cliPath, ...process.argv.slice(2)],
	{
		cwd: projectRoot,
		stdio: "inherit",
		env: process.env,
	},
);

if (result.error) {
	console.error(result.error);
	process.exitCode = 1;
} else {
	process.exitCode = result.status ?? 1;
}
