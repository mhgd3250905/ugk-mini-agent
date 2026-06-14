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
