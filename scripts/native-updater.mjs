#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createCloneUpdater } from "./clone-updater-core.mjs";
import { runNativeUpdate } from "./native-updater-core.mjs";

const projectRoot = process.cwd();

function write(line) {
	console.log(line);
}

async function ask(question) {
	if (!process.stdin.isTTY) {
		return "";
	}
	const rl = createInterface({ input, output });
	try {
		return await rl.question(question);
	} finally {
		rl.close();
	}
}

function launch(command, args) {
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd: projectRoot,
			stdio: "inherit",
			windowsHide: false,
		});
		child.once("close", (code) => resolve(code ?? 0));
	});
}

runNativeUpdate({
	projectRoot,
	updater: createCloneUpdater(projectRoot),
	write,
	ask,
	launch,
}).then((code) => {
	process.exitCode = code;
}).catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
