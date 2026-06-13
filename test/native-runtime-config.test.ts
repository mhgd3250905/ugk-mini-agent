import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildNativeRuntimeConfig } from "../scripts/native-runtime-config.mjs";

type NativeProcessConfig = { name: string; args: string[] };

test("native runtime config uses Windows Core ports and process list", () => {
	const config = buildNativeRuntimeConfig({
		projectRoot: "E:\\AII\\ugk-claw-core-win",
		env: {},
	});

	assert.equal(config.server.port, 8888);
	assert.equal(config.teamConsole.port, 9999);
	assert.equal(config.env.PORT, "8888");
	assert.equal(config.env.PUBLIC_BASE_URL, "http://127.0.0.1:8888");
	assert.equal(config.env.TEAM_CONSOLE_API_TARGET, "http://127.0.0.1:8888");
	assert.equal(config.env.TEAM_RUNTIME_ENABLED, "true");
	assert.equal(config.env.TEAM_USE_MOCK_RUNNER, "false");
	assert.match(String(config.env.Path ?? config.env.PATH), /\\.data\\tools\\git\\bin/);
	assert.deepEqual(
		config.processes.map((processConfig: NativeProcessConfig) => processConfig.name),
		["ugk-claw-core-win-server", "ugk-claw-core-win-team-console", "ugk-claw-core-win-team-worker", "ugk-claw-core-win-conn-worker"],
	);
});

test("native runtime config allows explicit ports while keeping local base URLs aligned", () => {
	const config = buildNativeRuntimeConfig({
		projectRoot: "E:\\AII\\ugk-claw-core-win",
		env: {
			PORT: "7777",
			TEAM_CONSOLE_PORT: "7778",
		},
	});

	assert.equal(config.server.port, 7777);
	assert.equal(config.teamConsole.port, 7778);
	assert.equal(config.env.PORT, "7777");
	assert.equal(config.env.PUBLIC_BASE_URL, "http://127.0.0.1:7777");
	assert.equal(config.env.TEAM_CONSOLE_API_TARGET, "http://127.0.0.1:7777");
	assert.equal(config.processes.find((processConfig: NativeProcessConfig) => processConfig.name === "ugk-claw-core-win-team-console")?.args.at(-1), "7778");
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
