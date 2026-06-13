import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import {
	buildProjectBashSpawnOptions,
	buildProjectShellEnv,
	isUnsupportedWindowsBashShim,
} from "../.pi/extensions/project-guard.js";

test("buildProjectBashSpawnOptions hides the console window on Windows without detaching", () => {
	const options = buildProjectBashSpawnOptions("E:/AII/ugk-claw-core-win", { PATH: "C:\\Windows\\System32" }, "win32");

	assert.equal(options.cwd, "E:/AII/ugk-claw-core-win");
	assert.equal(options.detached, false);
	assert.equal(options.windowsHide, true);
	assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
});

test("buildProjectShellEnv prepends the managed agent bin directory once", () => {
	const agentBin = join(getAgentDir(), "bin");
	const basePath = "C:\\Windows\\System32";

	const env = buildProjectShellEnv({ PATH: basePath });
	const envAgain = buildProjectShellEnv(env);

	assert.equal(env.PATH, `${agentBin};${basePath}`);
	assert.equal(envAgain.PATH, `${agentBin};${basePath}`);
});

test("isUnsupportedWindowsBashShim rejects WSL compatibility shims", () => {
	assert.equal(isUnsupportedWindowsBashShim("C:\\Windows\\System32\\bash.exe"), true);
	assert.equal(isUnsupportedWindowsBashShim("C:\\Users\\demo\\AppData\\Local\\Microsoft\\WindowsApps\\bash.exe"), true);
	assert.equal(isUnsupportedWindowsBashShim("C:\\Program Files\\Git\\bin\\bash.exe"), false);
});

test("http-access skill documents Windows native script invocation before legacy container paths", async () => {
	const skill = await readFile(".pi/skills/http-access/SKILL.md", "utf8");
	const windowsIndex = skill.indexOf('node "$UGK_HTTP_ACCESS_SCRIPT"');
	const relativeIndex = skill.indexOf("node .pi/skills/http-access/scripts/http_access.mjs");

	assert.notEqual(windowsIndex, -1);
	assert.notEqual(relativeIndex, -1);
	assert.equal(windowsIndex < relativeIndex, true);
	assert.match(skill.slice(0, windowsIndex), /Windows native/);
	assert.doesNotMatch(skill, /node \/app/);
});

test("current user-facing docs do not point new Windows Core users at legacy ports", async () => {
	const paths = [
		"README.md",
		"docs/change-log.md",
		"docs/handoff-current.md",
		"docs/native-windows-core.md",
		"docs/runtime-assets-conn-feishu.md",
		"docs/architecture-governance-guide.md",
		"docs/architecture-test-matrix.md",
		"docs/team-runtime.md",
		"apps/team-console/README.md",
		".pi/skills/team-task-creator/SKILL.md",
		".pi/skills/agent-profile-ops/SKILL.md",
		".pi/skills/http-access/SKILL.md",
		".pi/skills/project-planning/SKILL.md",
		".codex/skills/feature-handoff/SKILL.md",
		".codex/skills/glm-plan/SKILL.md",
		".pi/agents/reviewer.md",
		".pi/agents/worker.md",
		".pi/agents/planner.md",
		".pi/agents/scout.md",
	];
	for (const path of paths) {
		const content = await readFile(path, "utf8");
		assert.doesNotMatch(
			content,
			/127\.0\.0\.1:3000|localhost:5174|127\.0\.0\.1:5174|127\.0\.0\.1:9999|docker compose|Docker Team Console|E:[/\\]AII[/\\]ugk-pi|ugk-pi-team-console|ugk-pi\b/i,
			path,
		);
	}
});

test("Windows native agent command execution hides child process windows", async () => {
	const foregroundFactory = await readFile("src/agent/agent-session-factory.ts", "utf8");
	const backgroundFactory = await readFile("src/agent/background-agent-session-factory.ts", "utf8");
	const runtimeDeps = await readFile("scripts/runtime-deps.mjs", "utf8");
	const browserBoundBash = await readFile("src/browser/browser-bound-bash.ts", "utf8");
	const windowsBashOperations = await readFile("src/agent/windows-native-bash-operations.ts", "utf8");

	assert.match(foregroundFactory, /operations:\s*createWindowsNativeBashOperations/);
	assert.match(backgroundFactory, /operations:\s*createWindowsNativeBashOperations/);
	assert.match(windowsBashOperations, /windowsHide:\s*true/);
	assert.match(windowsBashOperations, /detached:\s*platform === "win32" \? false : true/);
	assert.match(runtimeDeps, /windowsHide:\s*true/);
	assert.match(browserBoundBash, /windowsHide:\s*true/);
});
