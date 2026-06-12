import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { validateTeamOutput } from "../src/team/output-validator.js";
import type { TeamTask } from "../src/team/types.js";

const baseTask: TeamTask = {
	id: "task_worklist",
	type: "normal",
	title: "Build worklist",
	input: { text: "Build worklist" },
	acceptance: { rules: ["valid"] },
};

const validWorklist = {
	schemaVersion: "team/worklist-1",
	worklistId: "worklist_news",
	title: "News chunks",
	items: [{ id: "chunk-001", title: "Chunk 1", input: { rows: [1] } }],
};

test("validateTeamOutput validates worklist outputCheck", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-output-validator-worklist-"));
	try {
		const workspace = new RunWorkspace(root);
		const result = await validateTeamOutput({
			workspace,
			runId: "run_1",
			task: { ...baseTask, outputCheck: { type: "worklist" } },
			attemptId: "attempt_1",
			contents: [{ ref: "worker-output-001.md", content: JSON.stringify(validWorklist) }],
		});
		assert.equal(result.ok, true);
		assert.equal(result.kind, "worklist");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("validateTeamOutput rejects invalid worklist outputCheck", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-output-validator-worklist-"));
	try {
		const workspace = new RunWorkspace(root);
		const result = await validateTeamOutput({
			workspace,
			runId: "run_1",
			task: { ...baseTask, outputCheck: { type: "worklist" } },
			attemptId: "attempt_1",
			contents: [{ ref: "worker-output-001.md", content: JSON.stringify({ ...validWorklist, items: [] }) }],
		});
		assert.equal(result.ok, false);
		assert.equal(result.kind, "worklist");
		assert.match(result.checks.find(check => !check.ok)?.message ?? "", /items must not be empty/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("validateTeamOutput validates worklist results outputCheck", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-output-validator-worklist-results-"));
	try {
		const workspace = new RunWorkspace(root);
		const content = JSON.stringify({
			schemaVersion: "team/worklist-results-1",
			sourceWorklist: validWorklist,
			summary: { totalItems: 1, succeeded: 1, failed: 0, cancelled: 0, missing: 0 },
			results: [{ itemId: "chunk-001", status: "succeeded", content: "ok" }],
			createdAt: "2026-06-11T00:00:00.000Z",
		});
		const result = await validateTeamOutput({
			workspace,
			runId: "run_1",
			task: { ...baseTask, outputCheck: { type: "worklist_results" } },
			attemptId: "attempt_1",
			contents: [{ ref: "worker-output-001.md", content }],
		});
		assert.equal(result.ok, true);
		assert.equal(result.kind, "worklist_results");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
