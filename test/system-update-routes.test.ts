import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { registerSystemUpdateRoutes } from "../src/routes/system-update.js";
import type { CloneUpdater } from "../src/system/clone-updater.js";

function buildApp(updater: CloneUpdater) {
	const app = Fastify({ logger: false });
	registerSystemUpdateRoutes(app, { projectRoot: "E:/repo", updater });
	return app;
}

test("GET /v1/system/update/status reports clone update state", async (t) => {
	const app = buildApp({
		getStatus: async () => ({
			ok: true,
			branch: "main",
			currentCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			currentShortCommit: "aaaaaaa",
			remoteCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			remoteShortCommit: "bbbbbbb",
			hasUpdates: true,
			behind: 1,
			ahead: 0,
			blockingChanges: [],
			allowedLocalArtifacts: [],
		}),
		applyUpdate: async () => {
			throw new Error("not used");
		},
	});
	t.after(() => {
		void app.close();
	});

	const response = await app.inject({ method: "GET", url: "/v1/system/update/status" });

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json(), {
		ok: true,
		branch: "main",
		currentCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		currentShortCommit: "aaaaaaa",
		remoteCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		remoteShortCommit: "bbbbbbb",
		hasUpdates: true,
		behind: 1,
		ahead: 0,
		blockingChanges: [],
		allowedLocalArtifacts: [],
	});
});

test("POST /v1/system/update/apply refuses blocking worktree changes", async (t) => {
	const app = buildApp({
		getStatus: async () => {
			throw new Error("not used");
		},
		applyUpdate: async () => ({
			ok: false,
			reason: "dirty_worktree",
			message: "存在本地代码改动，不能自动更新。",
			blockingChanges: ["M package.json"],
			allowedLocalArtifacts: [".data/"],
		}),
	});
	t.after(() => {
		void app.close();
	});

	const response = await app.inject({ method: "POST", url: "/v1/system/update/apply" });

	assert.equal(response.statusCode, 409);
	assert.deepEqual(response.json(), {
		ok: false,
		reason: "dirty_worktree",
		message: "存在本地代码改动，不能自动更新。",
		blockingChanges: ["M package.json"],
		allowedLocalArtifacts: [".data/"],
	});
});

test("POST /v1/system/update/apply returns successful update result", async (t) => {
	const app = buildApp({
		getStatus: async () => {
			throw new Error("not used");
		},
		applyUpdate: async () => ({
			ok: true,
			previousCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			currentCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			currentShortCommit: "bbbbbbb",
			updated: true,
			npmInstallRan: true,
			teamConsoleInstallRan: false,
			restartRequired: true,
			log: ["git pull --ff-only origin main", "npm install"],
		}),
	});
	t.after(() => {
		void app.close();
	});

	const response = await app.inject({ method: "POST", url: "/v1/system/update/apply" });

	assert.equal(response.statusCode, 200);
	assert.equal(response.json().ok, true);
	assert.equal(response.json().updated, true);
	assert.equal(response.json().npmInstallRan, true);
	assert.equal(response.json().restartRequired, true);
});
