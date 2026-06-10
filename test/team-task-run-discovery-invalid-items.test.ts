import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "../src/team/task-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { CanvasTaskRunService } from "../src/team/task-run-service.js";
import type { CheckerInput, CheckerOutput, WorkerInput, WorkerOutput } from "../src/team/role-runner.js";
import {
	ProcessEventRoleRunner,
	validDiscoverySpec,
	validTaskInput,
	waitForTerminalRun,
} from "./team-task-run-process-helpers.js";

test("Step04: Discovery Canvas Task run rejects invalid item ids and writes no standard result", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-invalid-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create({
			...validTaskInput,
			title: "发现云服务器供应商",
			canvasKind: "discovery",
			discoverySpec: validDiscoverySpec,
			workUnit: {
				...validTaskInput.workUnit,
				title: "发现云服务器供应商",
				input: { text: "搜索并输出云服务器供应商 JSON。" },
				outputContract: { text: "输出 JSON object，vendors 为数组，每项包含稳定 id。" },
				acceptance: { rules: ["vendors 必须是数组", "每项必须有 id"] },
			},
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));

		class InvalidDiscoveryOutputRunner extends ProcessEventRoleRunner {
			async runWorker(_input: WorkerInput): Promise<WorkerOutput> {
				return { content: "worker text", artifactRefs: [] };
			}
			async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
				return {
					verdict: "pass",
					reason: "mock checker accepted invalid discovery output",
					resultContent: JSON.stringify({ vendors: [{ name: "Missing id" }] }),
				};
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new InvalidDiscoveryOutputRunner(),
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(task.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed_with_failures");
		assert.equal(finished.taskStates[task.taskId]?.status, "failed");
		assert.match(finished.taskStates[task.taskId]?.errorSummary ?? "", /output validation failed/);
		assert.match(finished.taskStates[task.taskId]?.errorSummary ?? "", /required field 'id'/);

		const attempts = await workspace.listAttempts(created.runId, task.taskId);
		assert.equal(attempts.length, 1);
		const attempt = attempts[0]!;
		assert.equal(await workspace.readDiscoveryResult(created.runId, task.taskId, attempt.attemptId), null);
		assert.equal(attempt.files.includes("discovery-result.json"), false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
