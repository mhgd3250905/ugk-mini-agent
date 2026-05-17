import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TeamUnitStore } from "../src/team/team-unit-store.js";

test("TeamUnitStore create writes file and returns TeamUnit", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-store-"));
	try {
		const store = new TeamUnitStore(root);
		const unit = await store.create({
			title: "调研团队",
			description: "适合公开网页调研",
			watcherProfileId: "pw",
			workerProfileId: "pwo",
			checkerProfileId: "pc",
			finalizerProfileId: "pf",
		});
		assert.ok(unit.teamUnitId.startsWith("team_"));
		assert.equal(unit.schemaVersion, "team/team-unit-1");
		assert.equal(unit.archived, false);
		assert.equal(unit.title, "调研团队");
		assert.equal(unit.decomposerProfileId, "pwo", "defaults to workerProfileId");

		const got = await store.get(unit.teamUnitId);
		assert.deepEqual(got, unit);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("create with explicit decomposerProfileId preserves it", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-store-"));
	try {
		const store = new TeamUnitStore(root);
		const unit = await store.create({
			title: "调研团队",
			description: "带 decomposer",
			watcherProfileId: "pw",
			workerProfileId: "pwo",
			checkerProfileId: "pc",
			finalizerProfileId: "pf",
			decomposerProfileId: "pd",
		});
		assert.equal(unit.decomposerProfileId, "pd");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("old TeamUnit JSON missing decomposerProfileId falls back to workerProfileId", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-store-"));
	try {
		const store = new TeamUnitStore(root);
		const dir = join(root, "team-units");
		await mkdir(dir, { recursive: true });
		const oldUnit = {
			schemaVersion: "team/team-unit-1",
			teamUnitId: "team_old1",
			title: "旧团队",
			description: "",
			watcherProfileId: "w",
			workerProfileId: "wo",
			checkerProfileId: "c",
			finalizerProfileId: "f",
			archived: false,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		};
		await writeFile(join(dir, "team_old1.json"), JSON.stringify(oldUnit), "utf8");

		const got = await store.get("team_old1");
		assert.ok(got);
		assert.equal(got.decomposerProfileId, "wo", "fallback to workerProfileId");

		const list = await store.list();
		const found = list.find(u => u.teamUnitId === "team_old1");
		assert.ok(found);
		assert.equal(found.decomposerProfileId, "wo", "list also normalizes");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("update can change decomposerProfileId", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-store-"));
	try {
		const store = new TeamUnitStore(root);
		const unit = await store.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "wo",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		assert.equal(unit.decomposerProfileId, "wo");
		const updated = await store.update(unit.teamUnitId, { decomposerProfileId: "decomp_new" });
		assert.equal(updated.decomposerProfileId, "decomp_new");
		const reloaded = await store.get(unit.teamUnitId);
		assert.equal(reloaded!.decomposerProfileId, "decomp_new");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("archived TeamUnit cannot edit decomposerProfileId", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-store-"));
	try {
		const store = new TeamUnitStore(root);
		const unit = await store.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "w",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		await store.archive(unit.teamUnitId);
		await assert.rejects(
			() => store.update(unit.teamUnitId, { decomposerProfileId: "new_decomp" }),
			{ message: /archived team unit cannot be edited/ },
		);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("same AgentProfile can fill multiple slots", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-store-"));
	try {
		const store = new TeamUnitStore(root);
		const unit = await store.create({
			title: "单人团队",
			description: "同一 Agent 多角色",
			watcherProfileId: "same",
			workerProfileId: "same",
			checkerProfileId: "same",
			finalizerProfileId: "same",
		});
		assert.equal(unit.watcherProfileId, "same");
		assert.equal(unit.workerProfileId, "same");
		assert.equal(unit.checkerProfileId, "same");
		assert.equal(unit.finalizerProfileId, "same");
		assert.equal(unit.decomposerProfileId, "same");
	} finally {
		await rm(root, { recursive: true });
	}
});

test("archived TeamUnit cannot be edited", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-store-"));
	try {
		const store = new TeamUnitStore(root);
		const unit = await store.create({
			title: "t", description: "d",
			watcherProfileId: "w", workerProfileId: "w",
			checkerProfileId: "c", finalizerProfileId: "f",
		});
		await store.archive(unit.teamUnitId);
		await assert.rejects(
			() => store.update(unit.teamUnitId, { title: "new" }),
			{ message: /archived team unit cannot be edited/ },
		);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("list returns units sorted by updatedAt desc", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-store-"));
	try {
		const store = new TeamUnitStore(root);
		await store.create({ title: "first", description: "d", watcherProfileId: "w", workerProfileId: "w", checkerProfileId: "c", finalizerProfileId: "f" });
		await store.create({ title: "second", description: "d", watcherProfileId: "w", workerProfileId: "w", checkerProfileId: "c", finalizerProfileId: "f" });
		const list = await store.list();
		assert.equal(list.length, 2);
		assert.equal(list.length, 2);
	} finally {
		await rm(root, { recursive: true });
	}
});

test("delete removes file", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-store-"));
	try {
		const store = new TeamUnitStore(root);
		const unit = await store.create({ title: "t", description: "d", watcherProfileId: "w", workerProfileId: "w", checkerProfileId: "c", finalizerProfileId: "f" });
		await store.delete(unit.teamUnitId);
		const got = await store.get(unit.teamUnitId);
		assert.equal(got, null);
	} finally {
		await rm(root, { recursive: true });
	}
});
