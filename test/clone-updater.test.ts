import test from "node:test";
import assert from "node:assert/strict";
import { createCloneUpdater, type CommandRunner } from "../src/system/clone-updater.js";

function fakeRunner(responses: Record<string, string | string[]>, calls: string[] = []): CommandRunner {
	return async (command, args) => {
		const key = [command, ...args].join(" ");
		calls.push(key);
		const response = responses[key];
		if (Array.isArray(response)) {
			return { stdout: response.shift() ?? "", stderr: "" };
		}
		return { stdout: response ?? "", stderr: "" };
	};
}

test("clone updater status separates blocking changes from local artifacts", async () => {
	const updater = createCloneUpdater("E:/repo", fakeRunner({
		"git branch --show-current": "main\n",
		"git rev-parse HEAD": [
			"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
			"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n",
		],
		"git rev-parse origin/main": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n",
		"git rev-list --left-right --count HEAD...origin/main": "0\t1\n",
		"git status --porcelain": " M package.json\n?? .data/agent/session.jsonl\n?? logs/native/server.log\n",
	}));

	const status = await updater.getStatus();

	assert.equal(status.hasUpdates, true);
	assert.deepEqual(status.blockingChanges, [" M package.json"]);
	assert.deepEqual(status.allowedLocalArtifacts, ["?? .data/agent/session.jsonl", "?? logs/native/server.log"]);
});

test("clone updater apply refuses blocking changes before pulling", async () => {
	const calls: string[] = [];
	const updater = createCloneUpdater("E:/repo", fakeRunner({
		"git branch --show-current": "main\n",
		"git rev-parse HEAD": [
			"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
			"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n",
		],
		"git rev-parse origin/main": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n",
		"git rev-list --left-right --count HEAD...origin/main": "0\t1\n",
		"git status --porcelain": " M package.json\n",
	}, calls));

	const result = await updater.applyUpdate();

	assert.equal(result.ok, false);
	assert.deepEqual(result.blockingChanges, [" M package.json"]);
	assert.doesNotMatch(calls.join("\n"), /git pull --ff-only/);
});

test("clone updater apply pulls and installs dependencies when package files changed", async () => {
	const calls: string[] = [];
	const updater = createCloneUpdater("E:/repo", fakeRunner({
		"git branch --show-current": "main\n",
		"git rev-parse HEAD": [
			"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
			"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n",
		],
		"git rev-parse origin/main": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n",
		"git rev-list --left-right --count HEAD...origin/main": "0\t1\n",
		"git status --porcelain": "?? .data/agent/session.jsonl\n",
		"git diff --name-only aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb": "package-lock.json\nsrc/server.ts\n",
	}, calls));

	const result = await updater.applyUpdate();

	assert.equal(result.ok, true);
	assert.equal(result.updated, true);
	assert.equal(result.npmInstallRan, true);
	assert.equal(result.restartRequired, true);
	assert.match(calls.join("\n"), /git pull --ff-only origin main/);
	assert.match(calls.join("\n"), /npm install/);
});
