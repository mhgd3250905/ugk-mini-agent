#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const action = process.argv[2] || "check";
const rootDir = resolve(process.env.UGK_RUNTIME_DEPS_DIR || join(process.cwd(), ".data", "runtime-deps"));
const venvDir = resolve(process.env.UGK_RUNTIME_PYTHON_VENV_DIR || join(rootDir, `python-venv-${process.platform}`));
const binDir = join(venvDir, process.platform === "win32" ? "Scripts" : "bin");
const pythonPath = join(binDir, process.platform === "win32" ? "python.exe" : "python");
const lockPath = join(rootDir, "python-requirements.lock");

switch (action) {
	case "init":
		ensureRuntimePython();
		writePythonLockfile();
		console.log(`runtime python ready: ${pythonPath}`);
		break;
	case "check":
		ensureRuntimePython();
		checkRuntimePython();
		break;
	default:
		console.error(`Unknown runtime-deps action: ${action}`);
		console.error("Usage: node scripts/runtime-deps.mjs <init|check>");
		process.exit(1);
}

function ensureRuntimePython() {
	mkdirSync(rootDir, { recursive: true });
	mkdirSync(join(rootDir, "locks"), { recursive: true });
	withDirectoryLock("venv-init.lock.d", () => {
		if (!existsSync(pythonPath)) {
			const python = findBootstrapPython();
			runOrThrow(python.command, [...python.args, "-m", "venv", venvDir]);
		}
		ensurePipModule();
		ensurePipWrapper();
		runOrThrow(pythonPath, ["-m", "pip", "--version"]);
	});
}

function checkRuntimePython() {
	const prefix = execFileSync(pythonPath, ["-c", "import sys; print(sys.prefix)"], { encoding: "utf8" }).trim();
	const executable = execFileSync(pythonPath, ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim();
	const pipVersion = execFileSync(pythonPath, ["-m", "pip", "--version"], { encoding: "utf8" }).trim();
	const summary = {
		ok: true,
		rootDir,
		venvDir,
		python: executable,
		prefix,
		pip: pipVersion,
		lockfile: lockPath,
	};
	console.log(JSON.stringify(summary, null, 2));
}

function writePythonLockfile() {
	const result = spawnSync(pythonPath, ["-m", "pip", "freeze"], { encoding: "utf8" });
	if (result.status === 0) {
		writeFileSync(lockPath, result.stdout, "utf8");
	}
}

function ensurePipWrapper() {
	if (process.platform === "win32") {
		for (const name of ["pip.cmd", "pip3.cmd"]) {
			writeFileSync(join(binDir, name), buildWindowsPipWrapper(), "utf8");
		}
		return;
	}
	for (const name of ["pip", "pip3"]) {
		const wrapperPath = join(binDir, name);
		writeFileSync(wrapperPath, buildPosixPipWrapper(), "utf8");
		chmodSync(wrapperPath, 0o755);
	}
}

function ensurePipModule() {
	if (spawnSync(pythonPath, ["-m", "pip", "--version"], { stdio: "ignore" }).status === 0) {
		return;
	}
	runOrThrow(pythonPath, ["-m", "ensurepip", "--upgrade"]);
}

function withDirectoryLock(lockName, fn) {
	const lockDir = join(rootDir, "locks", lockName);
	for (let attempt = 0; attempt < 240; attempt += 1) {
		if (tryAcquireDirectoryLock(lockDir)) {
			try {
				return fn();
			} finally {
				rmSync(lockDir, { recursive: true, force: true });
			}
		}
		sleepSync(500);
	}
	throw new Error(`Timed out waiting for runtime dependency lock: ${lockDir}`);
}

function tryAcquireDirectoryLock(lockDir) {
	try {
		mkdirSync(lockDir);
		writeFileSync(join(lockDir, "owner"), `${process.pid}\n`, "utf8");
		return true;
	} catch (error) {
		if (error?.code !== "EEXIST") {
			throw error;
		}
		clearStaleDirectoryLock(lockDir);
		return false;
	}
}

function clearStaleDirectoryLock(lockDir) {
	try {
		const ageMs = Date.now() - statSync(lockDir).mtimeMs;
		if (ageMs > 10 * 60 * 1000) {
			rmSync(lockDir, { recursive: true, force: true });
		}
	} catch (error) {
		if (error?.code !== "ENOENT") {
			throw error;
		}
	}
}

function sleepSync(milliseconds) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function buildPosixPipWrapper() {
	return `#!/bin/sh
set -u
VENV_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ROOT_DIR="\${UGK_RUNTIME_DEPS_DIR:-$(CDPATH= cd -- "$VENV_DIR/.." && pwd)}"
LOCK_DIR="\${UGK_RUNTIME_DEPS_LOCK_DIR:-$ROOT_DIR/locks}"
mkdir -p "$LOCK_DIR"

while ! mkdir "$LOCK_DIR/pip.lock.d" 2>/dev/null; do
  sleep 1
done
cleanup() {
  rmdir "$LOCK_DIR/pip.lock.d" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

"$VENV_DIR/bin/python" -m pip "$@"
status=$?
if [ "$status" -eq 0 ]; then
  case "\${1:-}" in
    install|uninstall)
      "$VENV_DIR/bin/python" -m pip freeze > "$ROOT_DIR/python-requirements.lock" || true
      ;;
  esac
fi
exit "$status"
`;
}

function buildWindowsPipWrapper() {
	return `@echo off
set "VENV_DIR=%~dp0.."
if "%UGK_RUNTIME_DEPS_DIR%"=="" (
  set "ROOT_DIR=%VENV_DIR%\\.."
) else (
  set "ROOT_DIR=%UGK_RUNTIME_DEPS_DIR%"
)
if not exist "%ROOT_DIR%\\locks" mkdir "%ROOT_DIR%\\locks" >nul 2>nul
set "PIP_LOCK=%ROOT_DIR%\\locks\\pip.lock.d"
:wait_for_pip_lock
mkdir "%PIP_LOCK%" >nul 2>nul
if errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto wait_for_pip_lock
)
"%VENV_DIR%\\Scripts\\python.exe" -m pip %*
set "STATUS=%ERRORLEVEL%"
if "%STATUS%"=="0" (
  if /I "%1"=="install" "%VENV_DIR%\\Scripts\\python.exe" -m pip freeze > "%ROOT_DIR%\\python-requirements.lock"
  if /I "%1"=="uninstall" "%VENV_DIR%\\Scripts\\python.exe" -m pip freeze > "%ROOT_DIR%\\python-requirements.lock"
)
rmdir "%PIP_LOCK%" >nul 2>nul
exit /b %STATUS%
`;
}

function findBootstrapPython() {
	const candidates = process.platform === "win32"
		? [
				{ command: "py", args: ["-3"] },
				{ command: "python", args: [] },
				{ command: "python3", args: [] },
			]
		: [
				{ command: "python3", args: [] },
				{ command: "python", args: [] },
			];
	for (const candidate of candidates) {
		const result = spawnSync(candidate.command, [...candidate.args, "--version"], { stdio: "ignore" });
		if (result.status === 0) {
			return candidate;
		}
	}
	throw new Error("python3 is required to initialize the shared runtime venv");
}

function runOrThrow(command, args) {
	const result = spawnSync(command, args, { stdio: "inherit" });
	if (result.status === 0) {
		return;
	}
	throw new Error(`Command failed: ${command} ${args.join(" ")}`);
}
