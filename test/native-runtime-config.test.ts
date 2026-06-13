import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildNativeRuntimeConfig } from "../scripts/native-runtime-config.mjs";
import { loadDefaultNativeEnv } from "../src/native-default-env.js";

type NativeProcessConfig = { name: string; args: string[] };

test("native runtime config uses Windows Core ports and process list", () => {
	const defaultNativeEnv = loadDefaultNativeEnv();
	const config = buildNativeRuntimeConfig({
		projectRoot: "E:\\AII\\ugk-mini-agent",
		env: {},
	});

	assert.equal(config.server.port, Number(defaultNativeEnv.PORT));
	assert.equal(config.teamConsole.url, `${defaultNativeEnv.PUBLIC_BASE_URL}/playground/team`);
	assert.equal(config.env.PORT, defaultNativeEnv.PORT);
	assert.equal(config.env.PUBLIC_BASE_URL, defaultNativeEnv.PUBLIC_BASE_URL);
	assert.equal("TEAM_CONSOLE_API_TARGET" in config.env, false);
	assert.equal(config.env.TEAM_RUNTIME_ENABLED, "true");
	assert.equal(config.env.TEAM_USE_MOCK_RUNNER, "false");
	assert.match(String(config.env.Path ?? config.env.PATH), /\\.data\\tools\\git\\bin/);
	assert.equal(config.env.UGK_DATA_DIR, "E:\\AII\\ugk-mini-agent\\.data");
	assert.equal(config.env.UGK_LOG_DIR, "E:\\AII\\ugk-mini-agent\\logs\\native");
	assert.equal(config.env.UGK_TOOLS_DIR, "E:\\AII\\ugk-mini-agent\\.data\\tools");
	assert.deepEqual(
		config.processes.map((processConfig: NativeProcessConfig) => processConfig.name),
		["ugk-mini-agent-server", "ugk-mini-agent-team-worker", "ugk-mini-agent-conn-worker"],
	);
});

test("native runtime config honors explicit runtime directories", () => {
	const config = buildNativeRuntimeConfig({
		projectRoot: "E:\\AII\\ugk-mini-agent",
		env: {
			UGK_DATA_DIR: "D:\\ugk-data",
			UGK_LOG_DIR: "D:\\ugk-logs",
			UGK_TOOLS_DIR: "D:\\ugk-tools",
		},
	});

	assert.equal(config.env.UGK_DATA_DIR, "D:\\ugk-data");
	assert.equal(config.env.UGK_LOG_DIR, "D:\\ugk-logs");
	assert.equal(config.env.UGK_TOOLS_DIR, "D:\\ugk-tools");
	assert.equal(config.env.UGK_MODEL_SETTINGS_PATH, "D:\\ugk-data\\agent\\model-settings.json");
	assert.match(String(config.env.Path ?? config.env.PATH), /^D:\\ugk-tools\\git\\bin(?:;|$)/);
});

test("native runtime config allows explicit server ports while keeping local base URLs aligned", () => {
	const config = buildNativeRuntimeConfig({
		projectRoot: "E:\\AII\\ugk-mini-agent",
		env: {
			PORT: "7777",
		},
	});

	assert.equal(config.server.port, 7777);
	assert.equal(config.teamConsole.url, "http://127.0.0.1:7777/playground/team");
	assert.equal(config.env.PORT, "7777");
	assert.equal(config.env.PUBLIC_BASE_URL, "http://127.0.0.1:7777");
	assert.equal(config.processes.some((processConfig: NativeProcessConfig) => processConfig.name === "ugk-mini-agent-team-console"), false);
});

test("Windows Core bundle starts with an empty user skill directory", async () => {
	const projectRoot = process.cwd();
	const skillsUserDir = join(projectRoot, "runtime", "skills-user");
	const skillEntries = await readdir(skillsUserDir);
	const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as {
		scripts: Record<string, string>;
	};

	assert.deepEqual(skillEntries.sort(), [".gitkeep"]);
	assert.equal(packageJson.scripts["native:doctor"], "node scripts/native-doctor.mjs");
	assert.equal(packageJson.scripts["native:start"], "node scripts/native-supervisor.mjs");
});
