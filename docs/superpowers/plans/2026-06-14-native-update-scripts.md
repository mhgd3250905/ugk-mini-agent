# Native Update Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-command update entries for Windows, macOS, and Linux that update `origin/main`, install changed dependencies, then optionally restart UGK Mini Agent.

**Architecture:** Move the existing clone update implementation into a shared JavaScript core under `scripts/`, keep the current TypeScript web updater as a typed wrapper, and add a native updater CLI that calls the shared core. Root platform scripts stay thin and only locate Node.js before invoking the shared updater.

**Tech Stack:** Node.js ESM `.mjs`, TypeScript wrapper, Node test runner, PowerShell-compatible verification commands.

---

## File Structure

- Create `scripts/clone-updater-core.mjs`: shared update engine copied from the current `src/system/clone-updater.ts` implementation.
- Modify `src/system/clone-updater.ts`: preserve exported TypeScript interfaces and delegate `createCloneUpdater()` to the shared `.mjs` core.
- Create `scripts/native-updater-core.mjs`: testable plan builder for CLI output, restart prompt, and native launcher invocation.
- Create `scripts/native-updater.mjs`: CLI entry that wires the updater core to real stdin/stdout and child process execution.
- Create `UGK-Mini-Agent-Update.cmd`: Windows update entry.
- Create `UGK-Mini-Agent-Update.command`: macOS double-click/Terminal update entry.
- Create `UGK-Mini-Agent-Update.sh`: Linux terminal update entry.
- Create `test/native-updater-core.test.ts`: focused behavior tests for the native updater.
- Modify `README.md`, `docs/native-windows-core.md`, `docs/native-macos.md`, and `docs/native-linux.md`: document the update entries.

---

## Task 1: Share Clone Update Logic

**Files:**
- Create: `scripts/clone-updater-core.mjs`
- Modify: `src/system/clone-updater.ts`
- Test: `test/clone-updater.test.ts`

- [ ] **Step 1: Create the shared JavaScript clone updater core**

Create `scripts/clone-updater-core.mjs` with the logic currently in `src/system/clone-updater.ts`, converted to plain ESM JavaScript:

```js
import { execFile } from "node:child_process";

const RUNTIME_ARTIFACT_PREFIXES = [
	".data/",
	"logs/",
	"node_modules/",
	"apps/team-console/dist/",
	"apps/team-console/node_modules/",
	"runtime/playground/",
	"runtime/playground-factory/",
];

const RUNTIME_ARTIFACT_FILES = new Set([
	".env.native",
	"apps/team-console/tsconfig.node.tsbuildinfo",
]);

export function createCloneUpdater(projectRoot, runner = execFileRunner) {
	return {
		getStatus: () => getCloneUpdateStatus(projectRoot, runner),
		applyUpdate: () => applyCloneUpdate(projectRoot, runner),
	};
}

async function getCloneUpdateStatus(projectRoot, runner) {
	const run = (command, args) => runner(command, args, { cwd: projectRoot });
	const branch = (await run("git", ["branch", "--show-current"])).stdout.trim() || "unknown";
	const currentCommit = (await run("git", ["rev-parse", "HEAD"])).stdout.trim();

	await run("git", ["fetch", "origin", "main", "--prune"]);
	const remoteCommit = (await run("git", ["rev-parse", "origin/main"])).stdout.trim();
	const counts = (await run("git", ["rev-list", "--left-right", "--count", "HEAD...origin/main"])).stdout.trim().split(/\s+/);
	const ahead = Number(counts[0] ?? 0) || 0;
	const behind = Number(counts[1] ?? 0) || 0;
	const changes = parsePorcelain((await run("git", ["status", "--porcelain"])).stdout);

	return {
		ok: true,
		branch,
		currentCommit,
		currentShortCommit: shortCommit(currentCommit),
		remoteCommit,
		remoteShortCommit: shortCommit(remoteCommit),
		hasUpdates: currentCommit !== remoteCommit || behind > 0,
		behind,
		ahead,
		blockingChanges: changes.blocking,
		allowedLocalArtifacts: changes.allowed,
	};
}

async function applyCloneUpdate(projectRoot, runner) {
	const status = await getCloneUpdateStatus(projectRoot, runner);
	if (status.blockingChanges.length > 0) {
		return {
			ok: false,
			reason: "dirty_worktree",
			message: "存在本地代码改动，不能自动更新。",
			blockingChanges: status.blockingChanges,
			allowedLocalArtifacts: status.allowedLocalArtifacts,
		};
	}

	const run = (command, args) => runner(command, args, { cwd: projectRoot });
	const log = [];
	const previousCommit = status.currentCommit;
	log.push("git pull --ff-only origin main");
	await run("git", ["pull", "--ff-only", "origin", "main"]);
	const currentCommit = (await run("git", ["rev-parse", "HEAD"])).stdout.trim();
	const changedFiles = currentCommit === previousCommit
		? []
		: (await run("git", ["diff", "--name-only", previousCommit, currentCommit])).stdout.split(/\r?\n/).filter(Boolean);
	const npmInstallRan = changedFiles.some((file) => file === "package.json" || file === "package-lock.json");
	const teamConsoleInstallRan = changedFiles.some((file) => file === "apps/team-console/package.json" || file === "apps/team-console/package-lock.json");
	if (npmInstallRan) {
		log.push("npm install");
		await run("npm", ["install"]);
	}
	if (teamConsoleInstallRan) {
		log.push("npm --prefix apps/team-console install");
		await run("npm", ["--prefix", "apps/team-console", "install"]);
	}

	return {
		ok: true,
		previousCommit,
		currentCommit,
		currentShortCommit: shortCommit(currentCommit),
		updated: currentCommit !== previousCommit,
		npmInstallRan,
		teamConsoleInstallRan,
		restartRequired: currentCommit !== previousCommit,
		log,
	};
}

function parsePorcelain(output) {
	const blocking = [];
	const allowed = [];
	for (const line of output.split(/\r?\n/)) {
		const entry = line.trimEnd();
		if (!entry) {
			continue;
		}
		const path = entry.slice(3).replace(/\\/g, "/");
		if (isAllowedRuntimeArtifact(path)) {
			allowed.push(entry);
		} else {
			blocking.push(entry);
		}
	}
	return { blocking, allowed };
}

function isAllowedRuntimeArtifact(path) {
	return RUNTIME_ARTIFACT_FILES.has(path) || RUNTIME_ARTIFACT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function shortCommit(commit) {
	return commit.slice(0, 7);
}

function execFileRunner(command, args, options) {
	return new Promise((resolve, reject) => {
		execFile(command, args, { cwd: options.cwd, windowsHide: true, maxBuffer: 1024 * 1024 * 8 }, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(`${command} ${args.join(" ")} failed: ${stderr || error.message}`));
				return;
			}
			resolve({ stdout, stderr });
		});
	});
}
```

- [ ] **Step 2: Replace the TypeScript implementation with a typed wrapper**

Replace the body of `src/system/clone-updater.ts` with:

```ts
import { createCloneUpdater as createCoreCloneUpdater } from "../../scripts/clone-updater-core.mjs";

export interface CloneUpdateStatus {
	ok: true;
	branch: string;
	currentCommit: string;
	currentShortCommit: string;
	remoteCommit: string;
	remoteShortCommit: string;
	hasUpdates: boolean;
	behind: number;
	ahead: number;
	blockingChanges: string[];
	allowedLocalArtifacts: string[];
}

export interface CloneUpdateDirtyResult {
	ok: false;
	reason: "dirty_worktree";
	message: string;
	blockingChanges: string[];
	allowedLocalArtifacts: string[];
}

export interface CloneUpdateApplySuccess {
	ok: true;
	previousCommit: string;
	currentCommit: string;
	currentShortCommit: string;
	updated: boolean;
	npmInstallRan: boolean;
	teamConsoleInstallRan: boolean;
	restartRequired: boolean;
	log: string[];
}

export type CloneUpdateApplyResult = CloneUpdateDirtyResult | CloneUpdateApplySuccess;

export interface CloneUpdater {
	getStatus(): Promise<CloneUpdateStatus>;
	applyUpdate(): Promise<CloneUpdateApplyResult>;
}

export interface CommandResult {
	stdout: string;
	stderr: string;
}

export type CommandRunner = (command: string, args: string[], options: { cwd: string }) => Promise<CommandResult>;

export function createCloneUpdater(projectRoot: string, runner?: CommandRunner): CloneUpdater {
	return createCoreCloneUpdater(projectRoot, runner) as CloneUpdater;
}
```

- [ ] **Step 3: Run existing clone updater tests**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\clone-updater.test.ts
```

Expected: PASS. This confirms the web updater behavior did not change.

- [ ] **Step 4: Commit the shared updater core**

Run:

```powershell
git add -- scripts/clone-updater-core.mjs src/system/clone-updater.ts test/clone-updater.test.ts
git commit -m "refactor: share clone update core"
```

Expected: commit includes only the shared core and TypeScript wrapper. If `test/clone-updater.test.ts` is unchanged, omit it from `git add`.

---

## Task 2: Add Native Updater Core and Tests

**Files:**
- Create: `scripts/native-updater-core.mjs`
- Create: `test/native-updater-core.test.ts`

- [ ] **Step 1: Write failing tests for the native updater core**

Create `test/native-updater-core.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { runNativeUpdate } from "../scripts/native-updater-core.mjs";

function successUpdater(overrides: Record<string, unknown> = {}) {
	return {
		applyUpdate: async () => ({
			ok: true,
			previousCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			currentCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			currentShortCommit: "bbbbbbb",
			updated: true,
			npmInstallRan: false,
			teamConsoleInstallRan: false,
			restartRequired: true,
			log: ["git pull --ff-only origin main"],
			...overrides,
		}),
	};
}

test("native updater restarts through native launcher when user accepts", async () => {
	const output: string[] = [];
	const launches: string[][] = [];

	const code = await runNativeUpdate({
		projectRoot: "E:/repo",
		updater: successUpdater(),
		write: (line) => output.push(line),
		ask: async () => "y",
		launch: async (command, args) => {
			launches.push([command, ...args]);
			return 0;
		},
	});

	assert.equal(code, 0);
	assert.deepEqual(launches, [[process.execPath, "scripts/native-launcher.mjs"]]);
	assert.match(output.join("\n"), /Updated to bbbbbbb/);
});

test("native updater skips restart when user declines", async () => {
	const launches: string[][] = [];

	const code = await runNativeUpdate({
		projectRoot: "E:/repo",
		updater: successUpdater(),
		write: () => undefined,
		ask: async () => "n",
		launch: async (command, args) => {
			launches.push([command, ...args]);
			return 0;
		},
	});

	assert.equal(code, 0);
	assert.deepEqual(launches, []);
});

test("native updater prints blocking changes and does not restart", async () => {
	const output: string[] = [];
	const launches: string[][] = [];

	const code = await runNativeUpdate({
		projectRoot: "E:/repo",
		updater: {
			applyUpdate: async () => ({
				ok: false,
				reason: "dirty_worktree",
				message: "存在本地代码改动，不能自动更新。",
				blockingChanges: [" M package.json"],
				allowedLocalArtifacts: ["?? .data/session.json"],
			}),
		},
		write: (line) => output.push(line),
		ask: async () => "y",
		launch: async (command, args) => {
			launches.push([command, ...args]);
			return 0;
		},
	});

	assert.equal(code, 1);
	assert.deepEqual(launches, []);
	assert.match(output.join("\n"), /M package\.json/);
	assert.match(output.join("\n"), /\.data\/session\.json/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\native-updater-core.test.ts
```

Expected: FAIL because `scripts/native-updater-core.mjs` does not exist.

- [ ] **Step 3: Implement the native updater core**

Create `scripts/native-updater-core.mjs`:

```js
export async function runNativeUpdate(options) {
	const {
		projectRoot,
		updater,
		write,
		ask,
		launch,
		nodePath = process.execPath,
	} = options;

	write("");
	write("UGK Mini Agent Update");
	write("=====================");
	write(`Project: ${projectRoot}`);
	write("Updating from origin/main...");

	const result = await updater.applyUpdate();
	if (!result.ok) {
		write("");
		write(result.message);
		if (result.blockingChanges.length > 0) {
			write("");
			write("Blocking local changes:");
			for (const change of result.blockingChanges) {
				write(`  ${change}`);
			}
		}
		if (result.allowedLocalArtifacts.length > 0) {
			write("");
			write("Allowed runtime artifacts:");
			for (const artifact of result.allowedLocalArtifacts) {
				write(`  ${artifact}`);
			}
		}
		write("");
		write("Update stopped. Your files were not changed.");
		return 1;
	}

	write("");
	for (const command of result.log) {
		write(`Ran: ${command}`);
	}
	if (result.updated) {
		write(`Updated to ${result.currentShortCommit}.`);
	} else {
		write("Already up to date.");
	}
	if (result.npmInstallRan) {
		write("Root dependencies were installed.");
	}
	if (result.teamConsoleInstallRan) {
		write("Team Console dependencies were installed.");
	}

	const answer = await ask("Restart UGK Mini Agent now? [Y/n] ");
	if (isNo(answer)) {
		write("");
		write("Restart skipped. You can start later with the launcher script.");
		return 0;
	}

	write("");
	write("Restarting UGK Mini Agent...");
	const launchCode = await launch(nodePath, ["scripts/native-launcher.mjs"]);
	return launchCode;
}

function isNo(answer) {
	const normalized = String(answer ?? "").trim().toLowerCase();
	return normalized === "n" || normalized === "no";
}
```

- [ ] **Step 4: Run native updater tests**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\native-updater-core.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the native updater core**

Run:

```powershell
git add -- scripts/native-updater-core.mjs test/native-updater-core.test.ts
git commit -m "feat: add native updater core"
```

Expected: commit includes only the core and its test.

---

## Task 3: Add Native Updater CLI and Platform Scripts

**Files:**
- Create: `scripts/native-updater.mjs`
- Create: `UGK-Mini-Agent-Update.cmd`
- Create: `UGK-Mini-Agent-Update.command`
- Create: `UGK-Mini-Agent-Update.sh`

- [ ] **Step 1: Implement the native updater CLI**

Create `scripts/native-updater.mjs`:

```js
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
```

- [ ] **Step 2: Add Windows update script**

Create `UGK-Mini-Agent-Update.cmd`:

```bat
@echo off
setlocal
cd /d "%~dp0"
title UGK Mini Agent Update

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  echo Please install Node.js or open this updater from a configured terminal.
  pause
  exit /b 1
)

node scripts\native-updater.mjs %*
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
  echo Updater exited with code %EXIT_CODE%.
) else (
  echo Updater finished.
)
pause
exit /b %EXIT_CODE%
```

- [ ] **Step 3: Add macOS update script**

Create `UGK-Mini-Agent-Update.command`:

```sh
#!/bin/sh
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found in PATH."
  echo "Install Node.js 22+ and reopen Terminal."
  read -r -p "Press Enter to exit..." _
  exit 1
fi

set +e
node scripts/native-updater.mjs "$@"
status=$?
set -e
echo
if [ "$status" -ne 0 ]; then
  echo "Updater exited with code $status."
else
  echo "Updater finished."
fi
read -r -p "Press Enter to exit..." _
exit "$status"
```

- [ ] **Step 4: Add Linux update script**

Create `UGK-Mini-Agent-Update.sh`:

```sh
#!/bin/sh
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found in PATH."
  echo "Install Node.js 22+ and reopen your shell."
  exit 1
fi

exec node scripts/native-updater.mjs "$@"
```

- [ ] **Step 5: Run updater tests and a dry syntax check**

Run:

```powershell
node --check scripts/native-updater.mjs
node --check scripts/native-updater-core.mjs
node --check scripts/clone-updater-core.mjs
node --test --test-concurrency=1 --import tsx test\native-updater-core.test.ts test\clone-updater.test.ts
```

Expected: all checks PASS.

- [ ] **Step 6: Commit CLI and scripts**

Run:

```powershell
git add -- scripts/native-updater.mjs UGK-Mini-Agent-Update.cmd UGK-Mini-Agent-Update.command UGK-Mini-Agent-Update.sh
git commit -m "feat: add native update scripts"
```

Expected: commit includes only CLI and platform script files.

---

## Task 4: Document Update Entries

**Files:**
- Modify: `README.md`
- Modify: `docs/native-windows-core.md`
- Modify: `docs/native-macos.md`
- Modify: `docs/native-linux.md`

- [ ] **Step 1: Add README update instructions**

In `README.md`, add a short update section near the install/start instructions:

```md
## 更新项目

Git clone 部署的用户可以使用根目录的一键更新脚本：

```bash
# Windows
UGK-Mini-Agent-Update.cmd

# macOS
./UGK-Mini-Agent-Update.command

# Linux
./UGK-Mini-Agent-Update.sh
```

更新脚本默认更新 `origin/main`，会在依赖文件变化时自动安装依赖。更新完成后会询问是否重启；选择重启时会清理当前端口占用并重新启动服务。
```

- [ ] **Step 2: Update native platform docs**

Add the platform-specific update entry to each native guide:

Windows `docs/native-windows-core.md`:

```md
## 更新

Git clone 部署后，普通用户优先使用根目录的 `UGK-Mini-Agent-Update.cmd` 更新项目。它默认更新 `origin/main`，必要时安装依赖，并在完成后询问是否重启。选择重启时会复用启动器清理端口占用并重新启动服务。
```

macOS `docs/native-macos.md`:

```md
## Update

For Git clone deployments, run:

```bash
./UGK-Mini-Agent-Update.command
```

The updater uses `origin/main`, installs dependencies when package files changed, then asks whether to restart the service.
```

Linux `docs/native-linux.md`:

```md
## Update

For Git clone deployments, run:

```bash
./UGK-Mini-Agent-Update.sh
```

The updater uses `origin/main`, installs dependencies when package files changed, then asks whether to restart the service.
```

- [ ] **Step 3: Run documentation diff check**

Run:

```powershell
git diff --check -- README.md docs/native-windows-core.md docs/native-macos.md docs/native-linux.md
```

Expected: no output.

- [ ] **Step 4: Commit docs**

Run:

```powershell
git add -- README.md docs/native-windows-core.md docs/native-macos.md docs/native-linux.md
git commit -m "docs: document native update scripts"
```

Expected: commit includes only documentation changes.

---

## Task 5: Final Verification

**Files:**
- Verify all files from Tasks 1-4.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\clone-updater.test.ts test\native-updater-core.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run native test suite**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\native-*.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type check**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run diff whitespace check**

Run:

```powershell
git diff --check
```

Expected: no output.

- [ ] **Step 5: Review final changed files**

Run:

```powershell
git status --short
git log --oneline -5
```

Expected: only pre-existing local mail/OCR artifacts remain uncommitted; new feature commits appear at the top of `main`.

---

## Self-Review

- Spec coverage: the plan adds Windows/macOS/Linux update entries, defaults to `origin/main`, installs dependencies when package files change, asks for restart, and restarts through the existing launcher.
- Placeholder scan: no `TBD`, `TODO`, or open-ended implementation steps remain.
- Type consistency: `runNativeUpdate`, `createCloneUpdater`, `CommandRunner`, and updater result field names match the existing clone updater API.
