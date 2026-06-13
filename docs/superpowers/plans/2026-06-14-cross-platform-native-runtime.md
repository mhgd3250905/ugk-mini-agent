# Cross-Platform Native Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class macOS and Linux clone/install/start support while preserving the current stable Windows native runtime behavior.

**Architecture:** Keep user-facing startup, preflight, and documentation platform-specific instead of forcing a shared launcher abstraction. Reuse the existing server, Team worker, Conn worker, runtime data layout, and `native-supervisor` process model. MCP is user-managed runtime configuration and must not be treated as a bundled dependency or path to auto-detect.

**Tech Stack:** Node.js ESM scripts, TypeScript tests with `node --test --import tsx`, npm scripts, shell launchers (`.cmd`, `.command`, `.sh`), Fastify runtime, existing `scripts/native-*.mjs`.

---

## Current Findings

- Windows is the stable baseline. Do not change the behavior of `UGK-Mini-Agent-Launcher.cmd`, `UGK-Mini-Agent-Set-Port.cmd`, `npm run native:start`, or the Windows `Git Bash` checks except where a test proves compatibility is preserved.
- `scripts/native-runtime-config.mjs` and `scripts/native-supervisor-core.mjs` already use `process.platform` for Windows `cmd.exe /c npm ...` versus POSIX `npm ...`. Keep that shared runtime path.
- `scripts/runtime-deps.mjs` already creates platform-specific Python venvs using `python-venv-${process.platform}` and `Scripts` versus `bin`.
- `scripts/native-doctor-core.mjs` is still Windows-shaped: it reports `Git Bash`, rejects WSL shims, and only looks for `python`.
- `scripts/native-launcher.mjs` only checks and stops occupied ports on Windows through `netstat -ano -p tcp` and `taskkill`.
- README and native docs are Windows-first and should become a platform selector, not a mixed cross-platform page.
- Hard-coded `E:\...` paths in MCP docs/tests are examples or validation fixtures. Per user instruction, MCP server paths are user-added runtime configuration and are out of scope for bundled macOS/Linux support.

## File Structure

- Modify: `package.json`
  - Add platform-specific doctor and launcher scripts while preserving existing `native:doctor` and `native:start`.
- Modify: `scripts/native-doctor-core.mjs`
  - Add platform-aware prerequisite resolution: Windows Git Bash checks stay intact; macOS/Linux checks use POSIX shell and Python priority.
- Modify: `scripts/native-doctor.mjs`
  - Print platform-appropriate doctor heading.
- Modify: `scripts/native-launcher-core.mjs`
  - Add parser helpers for POSIX `lsof` output or newline PID output without changing Windows parser behavior.
- Modify: `scripts/native-launcher.mjs`
  - Keep Windows `netstat/taskkill`; add macOS/Linux `lsof/kill` branch behind `process.platform !== "win32"`.
- Create: `UGK-Mini-Agent-Launcher.command`
  - macOS Finder/Terminal startup wrapper.
- Create: `UGK-Mini-Agent-Set-Port.command`
  - macOS Finder/Terminal port prompt wrapper.
- Create: `UGK-Mini-Agent-Launcher.sh`
  - Linux shell startup wrapper.
- Create: `UGK-Mini-Agent-Set-Port.sh`
  - Linux shell port prompt wrapper.
- Modify: `README.md`
  - Turn installation/start into a platform selector and keep Windows as stable baseline.
- Keep/modify: `docs/native-windows-core.md`
  - Keep Windows-specific details intact; optionally update title/link text only if README references need it.
- Create: `docs/native-macos.md`
  - macOS clone/install/start/doctor/troubleshooting.
- Create: `docs/native-linux.md`
  - Linux clone/install/start/doctor/troubleshooting.
- Modify: `docs/architecture-governance-guide.md`, `docs/architecture-test-matrix.md`, `docs/traceability-map.md`, `docs/handoff-current.md`
  - Rename guidance from Windows-only to native runtime where it affects new contributors, while retaining Windows-specific sections.
- Modify: `test/native-doctor.test.ts`
  - Add macOS/Linux doctor scenarios and preserve existing Windows tests.
- Modify: `test/native-launcher-core.test.ts`
  - Add POSIX port PID parsing tests.
- Modify: `test/native-runtime-config.test.ts`
  - Add POSIX runtime config expectations without breaking Windows assertions.
- Modify: `test/project-guard.test.ts`
  - Update docs guardrails to account for platform docs and to keep MCP path examples out of default install requirements.

---

### Task 1: Add Platform-Aware Doctor Tests First

**Files:**
- Modify: `test/native-doctor.test.ts`
- Modify later: `scripts/native-doctor-core.mjs`

- [ ] **Step 1: Add macOS doctor failing test**

Append this test to `test/native-doctor.test.ts` after the Windows tests:

```ts
test("native doctor checks macOS prerequisites without requiring Git Bash", async () => {
	const report = await createNativeDoctorReport({
		projectRoot: "/Users/demo/ugk-mini-agent",
		platform: "darwin",
		nodeVersion: "v24.15.0",
		env: {
			PORT: "9999",
			PUBLIC_BASE_URL: "http://127.0.0.1:9999",
			PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
		},
		fileExists: async (path: string) =>
			path === "/bin/bash" ||
			path.endsWith("node_modules") ||
			path.endsWith("apps/team-console/node_modules") ||
			path.endsWith("runtime/skills-user"),
		findExecutable: async (name: string) => {
			if (name === "bash") return "/bin/bash";
			if (name === "python3") return "/opt/homebrew/bin/python3";
			if (name === "npm") return "/opt/homebrew/bin/npm";
			return undefined;
		},
		isPortAvailable: async () => true,
	});

	assert.equal(report.ok, true);
	assert.deepEqual(
		report.checks.filter((check: NativeCheck) => check.required).map((check: NativeCheck) => check.name),
		[
			"Node.js 22+",
			"npm",
			"Shell",
			"Python",
			"root dependencies",
			"Team Console dependencies",
			"user skills directory",
			"server port 9999",
		],
	);
	const shell = report.checks.find((check: NativeCheck) => check.name === "Shell");
	const python = report.checks.find((check: NativeCheck) => check.name === "Python");
	assert.equal(shell?.message, "/bin/bash");
	assert.equal(python?.message, "/opt/homebrew/bin/python3");
	assert.equal(report.checks.some((check: NativeCheck) => check.name === "Git Bash"), false);
});
```

- [ ] **Step 2: Add Linux doctor failing test**

Append this test after the macOS test:

```ts
test("native doctor checks Linux prerequisites with sh fallback", async () => {
	const report = await createNativeDoctorReport({
		projectRoot: "/home/demo/ugk-mini-agent",
		platform: "linux",
		nodeVersion: "v22.11.0",
		env: {
			PORT: "9999",
			PUBLIC_BASE_URL: "http://127.0.0.1:9999",
			PATH: "/usr/local/bin:/usr/bin:/bin",
		},
		fileExists: async (path: string) =>
			path === "/bin/sh" ||
			path.endsWith("node_modules") ||
			path.endsWith("apps/team-console/node_modules") ||
			path.endsWith("runtime/skills-user"),
		findExecutable: async (name: string) => {
			if (name === "python3") return "/usr/bin/python3";
			if (name === "npm") return "/usr/bin/npm";
			return undefined;
		},
		isPortAvailable: async () => true,
	});

	assert.equal(report.ok, true);
	const shell = report.checks.find((check: NativeCheck) => check.name === "Shell");
	const python = report.checks.find((check: NativeCheck) => check.name === "Python");
	assert.equal(shell?.message, "/bin/sh");
	assert.equal(python?.message, "/usr/bin/python3");
	assert.equal(report.checks.some((check: NativeCheck) => check.name === "Git Bash"), false);
});
```

- [ ] **Step 3: Run test to verify failure**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\native-doctor.test.ts
```

Expected: FAIL because `createNativeDoctorReport()` does not accept `platform`, still emits `Git Bash`, and does not check `python3`/`npm`.

- [ ] **Step 4: Implement platform-aware doctor**

Edit `scripts/native-doctor-core.mjs` with these changes:

```js
function getPlatform(options) {
	return options.platform ?? process.platform;
}

async function findPosixShell({ findExecutable, fileExists }) {
	if (await fileExists("/bin/bash")) return "/bin/bash";
	const bashPath = await findExecutable("bash");
	if (bashPath) return bashPath;
	if (await fileExists("/bin/sh")) return "/bin/sh";
	const shPath = await findExecutable("sh");
	return shPath;
}

async function findPython({ platform, findExecutable }) {
	const candidates = platform === "win32" ? ["python", "python3"] : ["python3", "python"];
	for (const name of candidates) {
		const found = await findExecutable(name);
		if (found) return found;
	}
	return undefined;
}
```

Inside `createNativeDoctorReport()`:

```js
const platform = getPlatform(options);
const npmPath = await findExecutable("npm");
const pythonPath = await findPython({ platform, findExecutable });
const platformChecks = platform === "win32"
	? [
			check("Git Bash", Boolean(bashPath && isSupportedGitBash(bashPath)), bashPath && isSupportedGitBash(bashPath) ? bashPath : "Install Git for Windows and use Git\\bin\\bash.exe"),
		]
	: [
			check("npm", Boolean(npmPath), npmPath || "Install Node.js 22+ with npm on PATH"),
			check("Shell", Boolean(await findPosixShell({ findExecutable, fileExists })), await findPosixShell({ findExecutable, fileExists }) || "Install bash or sh"),
		];
```

Then build `checks` as:

```js
const checks = [
	check("Node.js 22+", isNodeSupported(nodeVersion), `current ${nodeVersion}`),
	...platformChecks,
	check("Python", Boolean(pythonPath), pythonPath || "Install Python 3.11/3.12 and add it to PATH"),
	check("root dependencies", await fileExists(join(projectRoot, "node_modules")), "run npm install"),
	check("Team Console dependencies", await fileExists(join(projectRoot, "apps", "team-console", "node_modules")), "run npm --prefix apps/team-console install"),
	check("user skills directory", await fileExists(join(projectRoot, "runtime", "skills-user")), "create runtime/skills-user"),
	check(`server port ${config.server.port}`, await isPortAvailable(config.server.port), "port must be available before native:start"),
];
```

Avoid calling `findPosixShell()` twice in final code by assigning it to `shellPath`; the snippet shows behavior, not duplication to keep.

- [ ] **Step 5: Run doctor tests**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\native-doctor.test.ts
```

Expected: PASS, all Windows tests still pass and new macOS/Linux tests pass.

- [ ] **Step 6: Commit**

```powershell
git add scripts/native-doctor-core.mjs test/native-doctor.test.ts
git commit -m "Add platform-aware native doctor checks"
```

---

### Task 2: Add POSIX Launcher Port Detection and Kill Support

**Files:**
- Modify: `scripts/native-launcher-core.mjs`
- Modify: `scripts/native-launcher.mjs`
- Modify: `test/native-launcher-core.test.ts`

- [ ] **Step 1: Add POSIX PID parser failing test**

Append to `test/native-launcher-core.test.ts`:

```ts
import {
	parsePosixListeningPids,
} from "../scripts/native-launcher-core.mjs";

test("launcher parses POSIX lsof PID output", () => {
	const output = "12345\n23456\n12345\n";
	assert.deepEqual(parsePosixListeningPids(output), [12345, 23456]);
});

test("launcher ignores invalid POSIX PID output", () => {
	const output = "COMMAND PID USER\nnode abc demo\n0\n34567\n";
	assert.deepEqual(parsePosixListeningPids(output), [34567]);
});
```

If the file already has one import block, merge `parsePosixListeningPids` into the existing import instead of adding a second import.

- [ ] **Step 2: Run parser test to verify failure**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\native-launcher-core.test.ts
```

Expected: FAIL because `parsePosixListeningPids` is not exported.

- [ ] **Step 3: Implement POSIX PID parser**

Add to `scripts/native-launcher-core.mjs`:

```js
export function parsePosixListeningPids(output) {
	const pids = new Set();
	for (const line of String(output || "").split(/\r?\n/)) {
		const pid = Number(line.trim());
		if (Number.isInteger(pid) && pid > 0) {
			pids.add(pid);
		}
	}
	return [...pids].sort((left, right) => left - right);
}
```

- [ ] **Step 4: Update launcher to use lsof/kill on macOS/Linux**

In `scripts/native-launcher.mjs`, import `parsePosixListeningPids`:

```js
import {
	normalizePort,
	parseLauncherArgs,
	parsePosixListeningPids,
	parseWindowsNetstatListeningPids,
	upsertNativeEnvContent,
} from "./native-launcher-core.mjs";
```

Replace `findListeningPids()` with:

```js
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
```

Replace `stopProcesses()` with a platform branch:

```js
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
```

Do not use `kill -9` in first implementation. Let `waitForPortFree()` prove whether graceful `TERM` is enough; later hard-kill can be added only with a failing test or real evidence.

- [ ] **Step 5: Run launcher tests**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\native-launcher-core.test.ts
```

Expected: PASS.

- [ ] **Step 6: Verify Windows dry-run still works**

Run:

```powershell
node scripts\native-launcher.mjs --port 7777 --dry-run
```

Expected: prints selected port and either "Port 7777 is free." or dry-run stop message if occupied; it must not start supervisor.

- [ ] **Step 7: Commit**

```powershell
git add scripts/native-launcher-core.mjs scripts/native-launcher.mjs test/native-launcher-core.test.ts
git commit -m "Add POSIX native launcher port cleanup"
```

---

### Task 3: Add macOS and Linux User-Facing Launchers

**Files:**
- Create: `UGK-Mini-Agent-Launcher.command`
- Create: `UGK-Mini-Agent-Set-Port.command`
- Create: `UGK-Mini-Agent-Launcher.sh`
- Create: `UGK-Mini-Agent-Set-Port.sh`
- Modify: `test/native-launcher-core.test.ts`

- [ ] **Step 1: Create macOS launcher**

Create `UGK-Mini-Agent-Launcher.command`:

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

node scripts/native-launcher.mjs "$@"
status=$?
echo
if [ "$status" -ne 0 ]; then
  echo "Launcher exited with code $status."
else
  echo "Launcher stopped."
fi
read -r -p "Press Enter to exit..." _
exit "$status"
```

- [ ] **Step 2: Create macOS set-port launcher**

Create `UGK-Mini-Agent-Set-Port.command`:

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

node scripts/native-launcher.mjs --ask-port "$@"
status=$?
echo
if [ "$status" -ne 0 ]; then
  echo "Launcher exited with code $status."
else
  echo "Launcher stopped."
fi
read -r -p "Press Enter to exit..." _
exit "$status"
```

- [ ] **Step 3: Create Linux launcher**

Create `UGK-Mini-Agent-Launcher.sh`:

```sh
#!/bin/sh
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found in PATH."
  echo "Install Node.js 22+ and reopen your shell."
  exit 1
fi

exec node scripts/native-launcher.mjs "$@"
```

- [ ] **Step 4: Create Linux set-port launcher**

Create `UGK-Mini-Agent-Set-Port.sh`:

```sh
#!/bin/sh
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found in PATH."
  echo "Install Node.js 22+ and reopen your shell."
  exit 1
fi

exec node scripts/native-launcher.mjs --ask-port "$@"
```

- [ ] **Step 5: Mark POSIX launchers executable**

Run:

```powershell
git update-index --chmod=+x UGK-Mini-Agent-Launcher.command UGK-Mini-Agent-Set-Port.command UGK-Mini-Agent-Launcher.sh UGK-Mini-Agent-Set-Port.sh
```

- [ ] **Step 6: Add static launcher content test**

Append to `test/native-launcher-core.test.ts`:

```ts
import { readFile } from "node:fs/promises";

test("POSIX launcher scripts call native launcher from their own directory", async () => {
	const macLauncher = await readFile("UGK-Mini-Agent-Launcher.command", "utf8");
	const linuxLauncher = await readFile("UGK-Mini-Agent-Launcher.sh", "utf8");
	assert.match(macLauncher, /cd "\$\(dirname "\$0"\)"/);
	assert.match(macLauncher, /node scripts\/native-launcher\.mjs "\$@"/);
	assert.match(linuxLauncher, /cd "\$\(dirname "\$0"\)"/);
	assert.match(linuxLauncher, /exec node scripts\/native-launcher\.mjs "\$@"/);
});
```

Merge imports if needed.

- [ ] **Step 7: Run launcher tests**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\native-launcher-core.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add UGK-Mini-Agent-Launcher.command UGK-Mini-Agent-Set-Port.command UGK-Mini-Agent-Launcher.sh UGK-Mini-Agent-Set-Port.sh test/native-launcher-core.test.ts
git commit -m "Add macOS and Linux launcher scripts"
```

---

### Task 4: Add Platform-Specific npm Scripts Without Breaking Existing Scripts

**Files:**
- Modify: `package.json`
- Modify: `test/native-runtime-config.test.ts`

- [ ] **Step 1: Add failing package script assertions**

In `test/native-runtime-config.test.ts`, update the final test's package script assertions to include:

```ts
assert.equal(packageJson.scripts["native:doctor"], "node scripts/native-doctor.mjs");
assert.equal(packageJson.scripts["native:doctor:win"], "node scripts/native-doctor.mjs --platform win32");
assert.equal(packageJson.scripts["native:doctor:mac"], "node scripts/native-doctor.mjs --platform darwin");
assert.equal(packageJson.scripts["native:doctor:linux"], "node scripts/native-doctor.mjs --platform linux");
assert.equal(packageJson.scripts["native:start"], "node scripts/native-supervisor.mjs");
assert.equal(packageJson.scripts["native:start:mac"], "node scripts/native-supervisor.mjs");
assert.equal(packageJson.scripts["native:start:linux"], "node scripts/native-supervisor.mjs");
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\native-runtime-config.test.ts
```

Expected: FAIL because platform-specific scripts are missing.

- [ ] **Step 3: Add scripts to package.json**

Modify `package.json` scripts:

```json
"native:doctor": "node scripts/native-doctor.mjs",
"native:doctor:win": "node scripts/native-doctor.mjs --platform win32",
"native:doctor:mac": "node scripts/native-doctor.mjs --platform darwin",
"native:doctor:linux": "node scripts/native-doctor.mjs --platform linux",
"native:start": "node scripts/native-supervisor.mjs",
"native:start:mac": "node scripts/native-supervisor.mjs",
"native:start:linux": "node scripts/native-supervisor.mjs"
```

Do not change existing `start`, `worker:conn`, `worker:team`, or `team-console:*` scripts.

- [ ] **Step 4: Update native doctor CLI to parse platform flag**

Modify `scripts/native-doctor.mjs`:

```js
import { createNativeDoctorReport } from "./native-doctor-core.mjs";
import { loadNativeEnv } from "./native-env.mjs";

function parseArgs(argv) {
	const result = {};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--platform") {
			result.platform = argv[++index];
			continue;
		}
		if (arg.startsWith("--platform=")) {
			result.platform = arg.slice("--platform=".length);
			continue;
		}
		throw new Error(`Unknown native doctor argument: ${arg}`);
	}
	return result;
}

const args = parseArgs(process.argv.slice(2));
const report = await createNativeDoctorReport({
	env: await loadNativeEnv(process.cwd(), process.env),
	...(args.platform ? { platform: args.platform } : {}),
});
console.log(`Native runtime doctor (${args.platform || process.platform}): ${report.ok ? "ok" : "failed"}`);
```

Keep the existing report printing logic below this header if present. If current file only prints compact output, preserve that format except for the heading.

- [ ] **Step 5: Run script tests**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\native-runtime-config.test.ts test\native-doctor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add package.json scripts/native-doctor.mjs test/native-runtime-config.test.ts
git commit -m "Add platform-specific native npm scripts"
```

---

### Task 5: Update Native Runtime Docs as Platform-Specific Guides

**Files:**
- Modify: `README.md`
- Modify: `docs/native-windows-core.md`
- Create: `docs/native-macos.md`
- Create: `docs/native-linux.md`
- Modify: `docs/architecture-governance-guide.md`
- Modify: `docs/architecture-test-matrix.md`
- Modify: `docs/traceability-map.md`
- Modify: `docs/handoff-current.md`
- Modify: `test/project-guard.test.ts`

- [ ] **Step 1: Add docs guard test for platform docs**

Add to `test/project-guard.test.ts`:

```ts
test("README points clone users to platform-specific native guides", async () => {
	const readme = await readFile("README.md", "utf8");
	assert.match(readme, /Windows[\s\S]*docs\/native-windows-core\.md/);
	assert.match(readme, /macOS[\s\S]*docs\/native-macos\.md/);
	assert.match(readme, /Linux[\s\S]*docs\/native-linux\.md/);
});

test("macOS and Linux native docs do not require Git Bash or Windows cmd launchers", async () => {
	const mac = await readFile("docs/native-macos.md", "utf8");
	const linux = await readFile("docs/native-linux.md", "utf8");
	assert.doesNotMatch(mac, /Git Bash|\.cmd|taskkill|netstat -ano/);
	assert.doesNotMatch(linux, /Git Bash|\.cmd|taskkill|netstat -ano/);
	assert.match(mac, /python3/);
	assert.match(linux, /python3/);
});
```

- [ ] **Step 2: Run guard test to verify failure**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\project-guard.test.ts
```

Expected: FAIL because macOS/Linux docs do not exist and README does not link them.

- [ ] **Step 3: Create macOS guide**

Create `docs/native-macos.md`:

```md
# UGK Mini Agent for macOS

This guide covers macOS local deployment. MCP servers are user-managed runtime configuration and are not bundled or auto-detected by UGK Mini Agent.

## Requirements

- macOS 13 or newer
- Node.js 22+
- npm
- Python 3.11 or 3.12 available as `python3`
- Bash or POSIX `sh`

## Install

```bash
npm install
npm --prefix apps/team-console install
npm run native:doctor:mac
```

## Start

From Terminal:

```bash
npm run native:start:mac
```

Or use Finder/Terminal:

```bash
./UGK-Mini-Agent-Launcher.command
```

To choose a port:

```bash
./UGK-Mini-Agent-Set-Port.command
```

## Runtime Data

Defaults are relative to the project root:

- `.data`
- `logs/native`
- `.data/tools`

Override with `UGK_DATA_DIR`, `UGK_LOG_DIR`, and `UGK_TOOLS_DIR` only when you need custom storage locations.

## First API Source

After startup, open `/playground/model-sources` and add a model provider and API key. No provider or API key is preinstalled.

## Troubleshooting

- If `node` is missing, install Node.js 22+ and reopen Terminal.
- If `python3` is missing, install Python 3.11/3.12 and ensure it is on PATH.
- If the port is occupied, use `UGK-Mini-Agent-Set-Port.command` or pass `--port`.
```

- [ ] **Step 4: Create Linux guide**

Create `docs/native-linux.md`:

```md
# UGK Mini Agent for Linux

This guide covers Linux local deployment. MCP servers are user-managed runtime configuration and are not bundled or auto-detected by UGK Mini Agent.

## Requirements

- Node.js 22+
- npm
- Python 3.11 or 3.12 available as `python3`
- Bash or POSIX `sh`
- `lsof` for automatic launcher port cleanup

## Install

```bash
npm install
npm --prefix apps/team-console install
npm run native:doctor:linux
```

## Start

```bash
npm run native:start:linux
```

Or:

```bash
./UGK-Mini-Agent-Launcher.sh
```

To choose a port:

```bash
./UGK-Mini-Agent-Set-Port.sh
```

## Runtime Data

Defaults are relative to the project root:

- `.data`
- `logs/native`
- `.data/tools`

Override with `UGK_DATA_DIR`, `UGK_LOG_DIR`, and `UGK_TOOLS_DIR` only when you need custom storage locations.

## First API Source

After startup, open `/playground/model-sources` and add a model provider and API key. No provider or API key is preinstalled.

## Troubleshooting

- If `node` is missing, install Node.js 22+ using your distribution package manager, NodeSource, fnm, mise, or nvm.
- If `python3` is missing, install Python 3.11/3.12.
- If automatic port cleanup does not work, install `lsof` or choose another port.
```

- [ ] **Step 5: Update README platform selector**

Modify README install/start sections so the top-level flow says:

```md
## Platform Guides

| Platform | Guide | Launcher |
| --- | --- | --- |
| Windows 10/11 | [Windows native guide](docs/native-windows-core.md) | `UGK-Mini-Agent-Launcher.cmd` |
| macOS | [macOS native guide](docs/native-macos.md) | `UGK-Mini-Agent-Launcher.command` |
| Linux | [Linux native guide](docs/native-linux.md) | `UGK-Mini-Agent-Launcher.sh` |
```

Keep Windows as the current stable baseline and say macOS/Linux are native local targets with platform-specific launchers and doctors.

- [ ] **Step 6: Update governance docs**

Update:

- `docs/architecture-governance-guide.md`
- `docs/architecture-test-matrix.md`
- `docs/traceability-map.md`
- `docs/handoff-current.md`

Use these rules:

- Replace broad "Windows Core only" wording with "Native runtime" where the statement now applies to all platforms.
- Keep Windows-specific details in Windows sections only.
- Add macOS/Linux docs to onboarding link lists.
- Do not add MCP OCR paths to platform install requirements.

- [ ] **Step 7: Run guard and doc-related tests**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\project-guard.test.ts test\native-runtime-config.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add README.md docs/native-macos.md docs/native-linux.md docs/native-windows-core.md docs/architecture-governance-guide.md docs/architecture-test-matrix.md docs/traceability-map.md docs/handoff-current.md test/project-guard.test.ts
git commit -m "Document platform-specific native runtime setup"
```

---

### Task 6: Verify Shared Runtime and Windows Stability

**Files:**
- No code changes unless verification exposes a regression.

- [ ] **Step 1: Run native test suite**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\native-*.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused guard tests**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\project-guard.test.ts test\runtime-dependencies.test.ts test\subagent.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript**

Run:

```powershell
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 4: Run diff whitespace check**

Run:

```powershell
git diff --check
```

Expected: no output, exit code 0.

- [ ] **Step 5: Verify Windows launcher dry-run**

Run:

```powershell
node scripts\native-launcher.mjs --port 7777 --dry-run
```

Expected: no `.env.native` write, no supervisor start, and a clear port status message.

- [ ] **Step 6: Verify current Windows service remains healthy if running**

If local 9999 service is running, run:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:9999/healthz' -TimeoutSec 3
```

Expected:

```json
{ "ok": true }
```

If 9999 is not running, do not start it solely for this task; the dry-run and tests cover code changes.

- [ ] **Step 7: Static scan for accidental platform coupling**

Run:

```powershell
rg -n "Git Bash|taskkill|netstat -ano|\\.cmd|C:\\\\Program Files|E:\\\\AII" README.md docs/native-macos.md docs/native-linux.md scripts test -S
```

Expected:

- Windows-only terms may appear in `docs/native-windows-core.md`, Windows tests, and Windows branches.
- `docs/native-macos.md` and `docs/native-linux.md` must not require Git Bash, `.cmd`, `taskkill`, or fixed `E:\AII` paths.
- MCP example paths may remain in MCP-specific docs/tests because MCP is user-managed runtime configuration and is out of scope for bundled platform setup.

- [ ] **Step 8: Commit final verification notes if docs changed**

Only if verification requires doc updates:

```powershell
git add README.md docs test scripts
git commit -m "Tighten native runtime platform verification"
```

---

### Task 7: Push and Handoff for Real macOS/Linux User Testing

**Files:**
- No code changes unless prior tasks require them.

- [ ] **Step 1: Confirm git status**

Run:

```powershell
git status --short --branch
git log -5 --oneline
```

Expected: branch is `main` or the agreed implementation branch; only known pre-existing local runtime/user files remain uncommitted.

- [ ] **Step 2: Push implementation branch**

If implementing directly on `main`:

```powershell
git push origin main
```

If using a feature branch:

```powershell
git push -u origin <branch-name>
```

- [ ] **Step 3: Report what can and cannot be verified locally**

The final implementation report must include:

- Windows tests and dry-runs run by the agent.
- Whether macOS/Linux behavior was verified only by tests/static checks or by real platform execution.
- Exact commands for the user to run on macOS:

```bash
npm install
npm --prefix apps/team-console install
npm run native:doctor:mac
./UGK-Mini-Agent-Launcher.command
```

- Exact commands for the user to run on Linux:

```bash
npm install
npm --prefix apps/team-console install
npm run native:doctor:linux
./UGK-Mini-Agent-Launcher.sh
```

## Plan Self-Review

- Spec coverage: The plan covers macOS doctor, Linux doctor, macOS launcher, Linux launcher, port cleanup, docs, static path scan, Windows stability preservation, and local verification. MCP path detection is intentionally excluded per user instruction.
- Placeholder scan: No task contains unresolved placeholder language. Code-changing steps include concrete snippets and commands.
- Type consistency: Proposed `platform` option is consistently passed through `createNativeDoctorReport()`. POSIX parser is consistently named `parsePosixListeningPids`. Existing Windows parser name remains unchanged.
- Scope check: This is a single implementation plan because all tasks serve one deployability goal and share the native runtime surface. It avoids unrelated refactors such as renaming every Windows Core historical document.
