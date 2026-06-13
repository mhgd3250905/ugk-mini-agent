import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { getAgentDir, type BashOperations } from "@mariozechner/pi-coding-agent";

const EXIT_STDIO_GRACE_MS = 100;

type ShellConfig = {
	shell: string;
	args: string[];
};

type CreateWindowsNativeBashOperationsOptions = {
	shellPath?: string;
	platform?: NodeJS.Platform;
	baseEnv?: NodeJS.ProcessEnv;
};

function normalizePath(value: unknown): string {
	return String(value ?? "").replace(/\\/g, "/").toLowerCase();
}

function isUnsupportedWindowsBashShim(shellPath: string): boolean {
	const normalized = normalizePath(shellPath);
	return normalized === "c:/windows/system32/bash.exe" || normalized.endsWith("/windowsapps/bash.exe");
}

function findExecutable(name: string, platform: NodeJS.Platform): string | undefined {
	const command = platform === "win32" ? "where" : "which";
	const result = spawnSync(command, [name], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
		windowsHide: true,
	});
	if (result.status !== 0 || !result.stdout) {
		return undefined;
	}
	return result.stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0 && existsSync(line));
}

function resolveShellConfig(shellPath: string | undefined, platform: NodeJS.Platform): ShellConfig {
	if (shellPath) {
		if (existsSync(shellPath)) {
			return { shell: shellPath, args: ["-c"] };
		}
		throw new Error(`Custom shell path not found: ${shellPath}`);
	}

	if (platform === "win32") {
		const gitPath = findExecutable("git", platform);
		const fromGitPath = gitPath ? resolve(dirname(gitPath), "..", "bin", "bash.exe") : undefined;
		const candidates = [
			fromGitPath,
			process.env.ProgramFiles ? join(process.env.ProgramFiles, "Git", "bin", "bash.exe") : undefined,
			process.env["ProgramFiles(x86)"] ? join(process.env["ProgramFiles(x86)"], "Git", "bin", "bash.exe") : undefined,
			findExecutable("bash.exe", platform),
		].filter((value): value is string => Boolean(value));

		for (const candidate of candidates) {
			if (existsSync(candidate) && !isUnsupportedWindowsBashShim(candidate)) {
				return { shell: candidate, args: ["-c"] };
			}
		}

		throw new Error("No supported Git Bash found on Windows. Install Git for Windows and use Git\\bin\\bash.exe.");
	}

	return { shell: existsSync("/bin/bash") ? "/bin/bash" : "bash", args: ["-c"] };
}

function buildShellEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const pathKey = Object.keys(baseEnv).find((key) => key.toLowerCase() === "path") ?? "PATH";
	const currentPath = baseEnv[pathKey] ?? "";
	const binDir = join(getAgentDir(), "bin");
	const entries = currentPath.split(delimiter).filter(Boolean);
	const pathValue = entries.includes(binDir) ? currentPath : [binDir, currentPath].filter(Boolean).join(delimiter);

	return {
		...baseEnv,
		[pathKey]: pathValue,
	};
}

function buildSpawnOptions(cwd: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): SpawnOptions {
	return {
		cwd,
		detached: platform === "win32" ? false : true,
		env,
		stdio: ["ignore", "pipe", "pipe"],
		...(platform === "win32" ? { windowsHide: true } : {}),
	};
}

function killProcessTree(pid: number, platform: NodeJS.Platform): void {
	if (platform === "win32") {
		try {
			const killer = spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
				detached: true,
				stdio: "ignore",
				windowsHide: true,
			});
			killer.unref();
		} catch {
			// Ignore cleanup failures for already-terminated processes.
		}
		return;
	}

	try {
		process.kill(-pid, "SIGKILL");
	} catch {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// Ignore cleanup failures for already-terminated processes.
		}
	}
}

function waitForChildProcess(child: ChildProcess): Promise<number | null> {
	return new Promise((resolve, reject) => {
		let settled = false;
		let exited = false;
		let exitCode: number | null = null;
		let postExitTimer: NodeJS.Timeout | undefined;
		let stdoutEnded = child.stdout === null;
		let stderrEnded = child.stderr === null;

		const cleanup = () => {
			if (postExitTimer) {
				clearTimeout(postExitTimer);
			}
			child.removeListener("error", onError);
			child.removeListener("exit", onExit);
			child.removeListener("close", onClose);
			child.stdout?.removeListener("end", onStdoutEnd);
			child.stderr?.removeListener("end", onStderrEnd);
		};

		const finalize = (code: number | null) => {
			if (settled) {
				return;
			}
			settled = true;
			cleanup();
			child.stdout?.destroy();
			child.stderr?.destroy();
			resolve(code);
		};

		const maybeFinalizeAfterExit = () => {
			if (exited && stdoutEnded && stderrEnded) {
				finalize(exitCode);
			}
		};

		const onStdoutEnd = () => {
			stdoutEnded = true;
			maybeFinalizeAfterExit();
		};
		const onStderrEnd = () => {
			stderrEnded = true;
			maybeFinalizeAfterExit();
		};
		const onError = (error: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			cleanup();
			reject(error);
		};
		const onExit = (code: number | null) => {
			exited = true;
			exitCode = code;
			maybeFinalizeAfterExit();
			if (!settled) {
				postExitTimer = setTimeout(() => finalize(code), EXIT_STDIO_GRACE_MS);
			}
		};
		const onClose = (code: number | null) => {
			finalize(code);
		};

		child.stdout?.once("end", onStdoutEnd);
		child.stderr?.once("end", onStderrEnd);
		child.once("error", onError);
		child.once("exit", onExit);
		child.once("close", onClose);
	});
}

export function createWindowsNativeBashOperations(options: CreateWindowsNativeBashOperationsOptions = {}): BashOperations {
	const platform = options.platform ?? process.platform;
	const shellConfig = resolveShellConfig(options.shellPath, platform);
	return {
		exec: (command, cwd, { onData, signal, timeout, env }) =>
			new Promise((resolve, reject) => {
				if (!existsSync(cwd)) {
					reject(new Error(`Working directory does not exist: ${cwd}\nCannot execute bash commands.`));
					return;
				}

				const child = spawn(
					shellConfig.shell,
					[...shellConfig.args, command],
					buildSpawnOptions(cwd, env ?? buildShellEnv(options.baseEnv ?? process.env), platform),
				);

				let timedOut = false;
				let timeoutHandle: NodeJS.Timeout | undefined;

				if (timeout !== undefined && timeout > 0) {
					timeoutHandle = setTimeout(() => {
						timedOut = true;
						if (child.pid) {
							killProcessTree(child.pid, platform);
						}
					}, timeout * 1000);
				}

				child.stdout?.on("data", onData);
				child.stderr?.on("data", onData);

				const onAbort = () => {
					if (child.pid) {
						killProcessTree(child.pid, platform);
					}
				};

				if (signal) {
					if (signal.aborted) {
						onAbort();
					} else {
						signal.addEventListener("abort", onAbort, { once: true });
					}
				}

				waitForChildProcess(child)
					.then((exitCode) => {
						if (timeoutHandle) {
							clearTimeout(timeoutHandle);
						}
						if (signal) {
							signal.removeEventListener("abort", onAbort);
						}
						if (signal?.aborted) {
							reject(new Error("aborted"));
							return;
						}
						if (timedOut) {
							reject(new Error(`timeout:${timeout}`));
							return;
						}
						resolve({ exitCode });
					})
					.catch((error: unknown) => {
						if (timeoutHandle) {
							clearTimeout(timeoutHandle);
						}
						if (signal) {
							signal.removeEventListener("abort", onAbort);
						}
						reject(error);
					});
			}),
	};
}
