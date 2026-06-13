#!/usr/bin/env node
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createNativeSupervisorPlan } from "./native-supervisor-core.mjs";
import { loadNativeEnv } from "./native-env.mjs";

const env = await loadNativeEnv();
const plan = createNativeSupervisorPlan({ env });
const children = new Set();

async function createLogStream(logFile) {
	await mkdir(plan.logDir, { recursive: true });
	const handle = await open(logFile, "a");
	return handle.createWriteStream();
}

async function ensureRuntimeDirectories() {
	const dataDir = plan.config.dataDir;
	await Promise.all([
		mkdir(join(dataDir, "agent"), { recursive: true }),
		mkdir(join(dataDir, "agents"), { recursive: true }),
		mkdir(join(plan.projectRoot, "runtime", "skills-user"), { recursive: true }),
	]);
}

async function runStep(step) {
	const logStream = await createLogStream(step.logFile);
	const child = spawn(step.command, step.args, {
		cwd: step.cwd,
		env: step.env,
		stdio: ["ignore", "pipe", "pipe"],
		windowsHide: true,
	});
	children.add(child);
	child.stdout.pipe(logStream, { end: false });
	child.stderr.pipe(logStream, { end: false });
	child.stdout.on("data", (chunk) => process.stdout.write(`[${step.name}] ${chunk}`));
	child.stderr.on("data", (chunk) => process.stderr.write(`[${step.name}] ${chunk}`));

	const closePromise = new Promise((resolve) => {
		child.once("close", (code) => {
			children.delete(child);
			logStream.end();
			resolve(code ?? 0);
		});
	});

	if (!step.blocking) {
		return { child, closePromise };
	}

	const code = await closePromise;
	if (code !== 0) {
		throw new Error(`${step.name} exited with code ${code}`);
	}
	return { child, closePromise };
}

function stopChildren() {
	for (const child of children) {
		child.kill();
	}
}

process.on("SIGINT", () => {
	stopChildren();
	process.exit(130);
});

process.on("SIGTERM", () => {
	stopChildren();
	process.exit(143);
});

console.log("Starting UGK Mini Agent...");
console.log(`Server: ${plan.config.server.url}`);
console.log(`Team Console: ${plan.config.teamConsole.url}`);
console.log(`Logs: ${plan.logDir}`);

try {
	await ensureRuntimeDirectories();
	for (const step of plan.steps) {
		await runStep(step);
	}
} catch (error) {
	stopChildren();
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
