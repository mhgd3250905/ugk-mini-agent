import test from "node:test";
import assert from "node:assert/strict";
import {
	parseLauncherArgs,
	parseWindowsNetstatListeningPids,
	upsertNativeEnvContent,
} from "../scripts/native-launcher-core.mjs";

test("launcher parses only listening PIDs for the selected local port", () => {
	const output = `
  TCP    127.0.0.1:9999         0.0.0.0:0              LISTENING       42012
  TCP    127.0.0.1:50573        127.0.0.1:9999         ESTABLISHED     18428
  TCP    127.0.0.1:9999         127.0.0.1:50573        ESTABLISHED     42012
  TCP    0.0.0.0:9999           0.0.0.0:0              LISTENING       42012
  TCP    [::1]:9999             [::]:0                 LISTENING       55100
`;

	assert.deepEqual(parseWindowsNetstatListeningPids(output, 9999), [42012, 55100]);
});

test("launcher rewrites native env port values while preserving unrelated lines", () => {
	const content = [
		"# UGK Mini Agent",
		"HOST=127.0.0.1",
		"PORT=9999",
		"PUBLIC_BASE_URL=http://127.0.0.1:9999",
		"TEAM_RUNTIME_ENABLED=true",
		"",
	].join("\n");

	assert.equal(
		upsertNativeEnvContent(content, { host: "127.0.0.1", port: 7777 }),
		[
			"# UGK Mini Agent",
			"HOST=127.0.0.1",
			"PORT=7777",
			"PUBLIC_BASE_URL=http://127.0.0.1:7777",
			"TEAM_RUNTIME_ENABLED=true",
			"",
		].join("\n"),
	);
});

test("launcher appends missing native env keys", () => {
	assert.equal(
		upsertNativeEnvContent("TEAM_RUNTIME_ENABLED=true\n", { host: "0.0.0.0", port: 8890 }),
		[
			"TEAM_RUNTIME_ENABLED=true",
			"HOST=0.0.0.0",
			"PORT=8890",
			"PUBLIC_BASE_URL=http://127.0.0.1:8890",
			"",
		].join("\n"),
	);
});

test("launcher keeps one-click startup non-interactive unless ask-port is set", () => {
	assert.equal(parseLauncherArgs([]).askPort, false);
	assert.equal(parseLauncherArgs(["--ask-port"]).askPort, true);
	assert.equal(parseLauncherArgs(["--port", "7777"]).port, 7777);
});
