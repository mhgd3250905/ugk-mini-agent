#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { buildNativeRuntimeConfig } from "./native-runtime-config.mjs";
import { loadDefaultNativeEnvSync, parseNativeEnv } from "./native-env.mjs";
import {
	normalizePort,
	parseLauncherArgs,
	parsePosixListeningPids,
	parseWindowsNetstatListeningPids,
	upsertNativeEnvContent,
} from "./native-launcher-core.mjs";

const projectRoot = process.cwd();

async function main() {
	const args = parseLauncherArgs(process.argv.slice(2));
	if (args.help) {
		printHelp();
		return;
	}

	const nativeEnvPath = join(projectRoot, ".env.native");
	const envTemplatePath = existsSync(nativeEnvPath)
		? nativeEnvPath
		: join(projectRoot, ".env.native.example");
	const envContent = await readOptionalText(envTemplatePath);
	const nativeEnv = parseNativeEnv(envContent);
	const defaultEnv = loadDefaultNativeEnvSync(projectRoot);
	const selectedHost = args.host || nativeEnv.HOST || defaultEnv.HOST || "127.0.0.1";
	const defaultPort = normalizePort(nativeEnv.PORT || defaultEnv.PORT);
	const selectedPort = args.port ?? (args.askPort ? await resolveInteractivePort(defaultPort) : defaultPort);
	const nextEnvContent = upsertNativeEnvContent(envContent, {
		host: selectedHost,
		port: selectedPort,
	});

	printHeader(selectedPort);
	if (args.dryRun) {
		console.log(`[dry-run] would write ${nativeEnvPath}`);
	} else {
		await writeFile(nativeEnvPath, nextEnvContent, "utf8");
		console.log(`Updated .env.native: HOST=${selectedHost}, PORT=${selectedPort}`);
	}

	const pids = await findListeningPids(selectedPort);
	if (pids.length > 0) {
		console.log(`Port ${selectedPort} is in use by PID(s): ${pids.join(", ")}`);
		if (!args.autoKill) {
			throw new Error(`Port ${selectedPort} is occupied. Re-run without --no-kill or choose another port.`);
		}
		if (args.dryRun) {
			console.log(`[dry-run] would stop PID(s): ${pids.join(", ")}`);
		} else {
			await stopProcesses(pids);
			await waitForPortFree(selectedPort, 10_000);
			console.log(`Port ${selectedPort} is free.`);
		}
	} else {
		console.log(`Port ${selectedPort} is free.`);
	}

	const launchEnv = {
		...nativeEnv,
		...process.env,
		HOST: selectedHost,
		PORT: String(selectedPort),
		PUBLIC_BASE_URL: `http://127.0.0.1:${selectedPort}`,
	};
	const config = buildNativeRuntimeConfig({ projectRoot, env: launchEnv });
	console.log(`Starting UGK Mini Agent at ${config.server.url}`);
	console.log("Use Ctrl+C to stop.");

	if (args.dryRun) {
		console.log("[dry-run] would run: node scripts/native-supervisor.mjs");
		return;
	}

	await runSupervisor(config.env);
}

async function resolveInteractivePort(defaultPort) {
	if (!process.stdin.isTTY) {
		return defaultPort;
	}
	const rl = createInterface({ input, output });
	try {
		const answer = await rl.question(`Port [${defaultPort}]: `);
		const trimmed = answer.trim();
		return trimmed ? normalizePort(trimmed) : defaultPort;
	} finally {
		rl.close();
	}
}

async function findListeningPids(port) {
	if (process.platform === "win32") {
		const { stdout } = await execFileText("netstat", ["-ano", "-p", "tcp"]);
		return parseWindowsNetstatListeningPids(stdout, port)
			.filter((pid) => pid !== process.pid);
	}
	try {
		const { stdout } = await execFileText("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]);
		return parsePosixListeningPids(stdout)
			.filter((pid) => pid !== process.pid);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			console.log("lsof not found; skipping automatic port cleanup.");
			return [];
		}
		if (error && typeof error === "object" && "stdout" in error) {
			return parsePosixListeningPids(error.stdout)
				.filter((pid) => pid !== process.pid);
		}
		return [];
	}
}

async function stopProcesses(pids) {
	for (const pid of pids) {
		console.log(`Stopping PID ${pid}...`);
		try {
			if (process.platform === "win32") {
				await execFileText("taskkill", ["/PID", String(pid), "/T", "/F"]);
			} else {
				await execFileText("kill", ["-TERM", String(pid)]);
			}
		} catch (error) {
			throw new Error(`Failed to stop PID ${pid}: ${error.message}`);
		}
	}
}

async function waitForPortFree(port, timeoutMs) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		const pids = await findListeningPids(port);
		if (pids.length === 0) {
			return;
		}
		await sleep(250);
	}
	throw new Error(`Port ${port} is still occupied after stopping old process.`);
}

async function runSupervisor(env) {
	const child = await import("node:child_process").then(({ spawn }) =>
		spawn(process.execPath, ["scripts/native-supervisor.mjs"], {
			cwd: projectRoot,
			env,
			stdio: "inherit",
			windowsHide: false,
		}),
	);
	const code = await new Promise((resolve) => {
		child.once("close", (exitCode) => resolve(exitCode ?? 0));
	});
	if (code !== 0) {
		process.exitCode = code;
	}
}

function execFileText(command, args) {
	return new Promise((resolve, reject) => {
		execFile(command, args, { cwd: projectRoot, windowsHide: true }, (error, stdout, stderr) => {
			if (error) {
				error.stdout = stdout;
				error.stderr = stderr;
				reject(error);
				return;
			}
			resolve({ stdout, stderr });
		});
	});
}

async function readOptionalText(path) {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return "";
		}
		throw error;
	}
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHeader(port) {
	console.log("");
	console.log("UGK Mini Agent Launcher");
	console.log("=======================");
	console.log(`Selected port: ${port}`);
}

function printHelp() {
	console.log(`UGK Mini Agent Launcher

Usage:
  node scripts/native-launcher.mjs [--port <port>] [--ask-port] [--host 127.0.0.1] [--no-kill] [--dry-run]

Options:
  --port <port>   Set the native server port and persist it to .env.native.
  --ask-port      Prompt for a port before startup.
  --host <host>   Set HOST in .env.native. Default: 127.0.0.1.
  --no-kill       Do not stop processes that occupy the selected port.
  --dry-run       Show the actions without writing files, killing processes, or starting.
`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
