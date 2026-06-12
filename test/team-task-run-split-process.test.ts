import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "../src/team/task-store.js";
import { TaskConnectionStore } from "../src/team/task-connection-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { CanvasTaskRunService } from "../src/team/task-run-service.js";
import type { CheckerInput, CheckerOutput, WorkerInput, WorkerOutput } from "../src/team/role-runner.js";
import {
	createDeferred,
	delayMs,
	ProcessEventRoleRunner,
	type ProcessAwareWorkerInput,
	removeTempRoot,
	validTaskInput,
	waitForTaskRuns,
	waitForTerminalRun,
} from "./team-task-run-process-helpers.js";

function worklistJson() {
	return JSON.stringify({
		schemaVersion: "team/worklist-1",
		worklistId: "worklist_news",
		title: "News chunks",
		items: [
			{ id: "chunk-001", title: "Chunk 1", input: { rows: [1] }, acceptanceHints: ["Return chunk 1"] },
			{ id: "chunk-002", title: "Chunk 2", input: { rows: [2] }, acceptanceHints: ["Return chunk 2"] },
		],
	});
}

function worklistJsonWithItems(count: number) {
	return JSON.stringify({
		schemaVersion: "team/worklist-1",
		worklistId: "worklist_news",
		title: "News chunks",
		items: Array.from({ length: count }, (_, index) => {
			const itemNumber = index + 1;
			return {
				id: `chunk-${String(itemNumber).padStart(3, "0")}`,
				title: `Chunk ${itemNumber}`,
				input: { rows: [itemNumber] },
				acceptanceHints: [`Return chunk ${itemNumber}`],
			};
		}),
	});
}

test("split-task consumes worklist, runs generated children, and writes worklist-results", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-split-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search", "checker"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			title: "清单生成",
			workUnit: {
				...validTaskInput.workUnit,
				title: "清单生成",
				outputPorts: [{ id: "worklist_out", label: "Worklist", type: "worklist" }],
				outputContract: { text: "输出 worklist。" },
				acceptance: { rules: ["必须输出 worklist"] },
			},
		});
		const splitTask = await taskStore.create({
			...validTaskInput,
			title: "分片处理",
			canvasKind: "split-task",
			workUnit: {
				...validTaskInput.workUnit,
				title: "分片处理",
				input: { text: "按清单并发处理。" },
				inputPorts: [{ id: "source_worklist", label: "Worklist", type: "worklist" }],
				outputPorts: [{ id: "results", label: "Results", type: "worklist-results" }],
				outputContract: { text: "输出 worklist-results。" },
				acceptance: { rules: ["必须完整回收"] },
			},
			splitTaskSpec: {
				schemaVersion: "team/split-task-spec-1",
				inputPortId: "source_worklist",
				outputPortId: "results",
				dispatchGoal: "逐个 chunk 标准化。",
				generatedWorkerAgentId: "search",
				generatedCheckerAgentId: "checker",
				autoRun: { enabled: true, concurrency: 2 },
				collectPolicy: { requireAllItemsSucceeded: true, requireFullCoverage: true },
			},
		});
		const finalTask = await taskStore.create({
			...validTaskInput,
			title: "结果合并",
			workUnit: {
				...validTaskInput.workUnit,
				title: "结果合并",
				input: { text: "合并 split-task 结果。" },
				inputPorts: [{ id: "source_results", label: "Results", type: "worklist-results" }],
				outputContract: { text: "输出最终结果。" },
				acceptance: { rules: ["必须读取 worklist-results"] },
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "worklist_out",
			toTaskId: splitTask.taskId,
			toInputPortId: "source_worklist",
		});
		await connectionStore.create({
			fromTaskId: splitTask.taskId,
			fromOutputPortId: "results",
			toTaskId: finalTask.taskId,
			toInputPortId: "source_results",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedFinalInput: WorkerInput | undefined;

		class SplitRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.id === sourceTask.taskId) {
					await writeFile(join(input.artifactPublicDir!, "worklist.json"), worklistJson(), "utf8");
					return { content: "worker wrote worklist.json", artifactRefs: [] };
				}
				if (input.task.title === "Chunk 1" || input.task.title === "Chunk 2") {
					return { content: JSON.stringify({ itemTitle: input.task.title, ok: true }), artifactRefs: [] };
				}
				if (input.task.id === finalTask.taskId) {
					capturedFinalInput = input;
					return { content: "final result", artifactRefs: [] };
				}
				return super.runWorker(input as ProcessAwareWorkerInput);
			}

			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.id === sourceTask.taskId) {
					return { verdict: "pass", reason: "ok", resultContent: "accepted worklist summary" };
				}
				return { verdict: "pass", reason: "ok", resultContent: input.workerOutputRef.includes("worker-output") ? undefined : "accepted" };
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new SplitRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const sourceRun = await service.createRun(sourceTask.taskId);
		const sourceFinished = await waitForTerminalRun(service, sourceRun.runId);
		assert.equal(sourceFinished.status, "completed");
		const splitRuns = await waitForTaskRuns(service, splitTask.taskId, 1);
		const splitFinished = await waitForTerminalRun(service, splitRuns[0]!.runId);
		assert.equal(splitFinished.status, "completed");
		assert.equal(splitFinished.taskStates[splitTask.taskId]?.status, "succeeded");

		const attempts = await workspace.listAttempts(splitFinished.runId, splitTask.taskId);
		assert.equal(attempts.length, 1);
		assert.ok(attempts[0]!.files.includes("worklist-results.json"));
		const rawResults = await workspace.readAttemptFile(splitFinished.runId, splitTask.taskId, attempts[0]!.attemptId, "worklist-results.json");
		const results = JSON.parse(rawResults!);
		assert.equal(results.schemaVersion, "team/worklist-results-1");
		assert.equal(results.summary.totalItems, 2);
		assert.equal(results.summary.succeeded, 2);
		assert.deepEqual(results.results.map((result: { itemId: string }) => result.itemId), ["chunk-001", "chunk-002"]);

		const generated = await taskStore.listGeneratedForSourceTask("split-task", splitTask.taskId);
		assert.equal(generated.length, 2);
		assert.deepEqual(new Set(generated.map(task => task.generatedSource?.sourceItemId)), new Set(["chunk-001", "chunk-002"]));
		assert.ok(generated.every(task => task.generatedSource?.schemaVersion === "team/generated-task-source-2"));

		const finalRuns = await waitForTaskRuns(service, finalTask.taskId, 1);
		const finalFinished = await waitForTerminalRun(service, finalRuns[0]!.runId);
		assert.equal(finalFinished.status, "completed");
		const artifact = finalFinished.source?.boundInputs?.[0]?.artifact as import("../src/team/types.js").TeamTaskTypedArtifact;
		assert.equal(artifact.type, "worklist-results");
		assert.match(artifact.fileRef, /worklist-results\.json$/);
		const splitResults = JSON.parse(artifact.content ?? artifact.preview);
		assert.equal(splitResults.schemaVersion, "team/worklist-results-1");
		assert.ok(splitResults.results.every((result: { generatedTaskId?: string; generatedRunId?: string }) => result.generatedTaskId && result.generatedRunId));
		assert.ok(capturedFinalInput, "final worker should receive split results");
		const finalPayload = capturedFinalInput!.task.input.payload as { boundInputs?: Array<{ artifact: { workspaceFileRef?: string } }> } | undefined;
		assert.ok(finalPayload?.boundInputs?.[0]?.artifact.workspaceFileRef);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("split-task fails parent when a required child fails", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-split-failure-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search", "checker"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			title: "清单生成",
			workUnit: {
				...validTaskInput.workUnit,
				title: "清单生成",
				outputPorts: [{ id: "worklist_out", label: "Worklist", type: "worklist" }],
				outputContract: { text: "输出 worklist。" },
				acceptance: { rules: ["必须输出 worklist"] },
			},
		});
		const splitTask = await taskStore.create({
			...validTaskInput,
			title: "分片处理",
			canvasKind: "split-task",
			workUnit: {
				...validTaskInput.workUnit,
				title: "分片处理",
				input: { text: "按清单并发处理。" },
				inputPorts: [{ id: "source_worklist", label: "Worklist", type: "worklist" }],
				outputPorts: [{ id: "results", label: "Results", type: "worklist-results" }],
				outputContract: { text: "输出 worklist-results。" },
				acceptance: { rules: ["必须完整回收"] },
			},
			splitTaskSpec: {
				schemaVersion: "team/split-task-spec-1",
				inputPortId: "source_worklist",
				outputPortId: "results",
				dispatchGoal: "逐个 chunk 标准化。",
				generatedWorkerAgentId: "search",
				generatedCheckerAgentId: "checker",
				autoRun: { enabled: true, concurrency: 2 },
				collectPolicy: { requireAllItemsSucceeded: true, requireFullCoverage: true },
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "worklist_out",
			toTaskId: splitTask.taskId,
			toInputPortId: "source_worklist",
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));

		class SplitFailureRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.id === sourceTask.taskId) {
					await writeFile(join(input.artifactPublicDir!, "worklist.json"), worklistJson(), "utf8");
					return { content: "worker wrote worklist.json", artifactRefs: [] };
				}
				return { content: JSON.stringify({ itemTitle: input.task.title, ok: input.task.title !== "Chunk 2" }), artifactRefs: [] };
			}

			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.id === sourceTask.taskId) {
					return { verdict: "pass", reason: "ok", resultContent: "accepted worklist summary" };
				}
				if (input.task.title === "Chunk 2") {
					return { verdict: "fail", reason: "chunk 2 failed" };
				}
				return { verdict: "pass", reason: "ok" };
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new SplitFailureRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const sourceRun = await service.createRun(sourceTask.taskId);
		await waitForTerminalRun(service, sourceRun.runId);
		const splitRuns = await waitForTaskRuns(service, splitTask.taskId, 1);
		const splitFinished = await waitForTerminalRun(service, splitRuns[0]!.runId);
		assert.equal(splitFinished.status, "completed_with_failures");
		assert.equal(splitFinished.taskStates[splitTask.taskId]?.status, "failed");
		assert.match(splitFinished.taskStates[splitTask.taskId]?.errorSummary ?? "", /child results did not all succeed/);
		const attempts = await workspace.listAttempts(splitFinished.runId, splitTask.taskId);
		const rawResults = await workspace.readAttemptFile(splitFinished.runId, splitTask.taskId, attempts[0]!.attemptId, "worklist-results.json");
		const results = JSON.parse(rawResults!);
		assert.equal(results.summary.succeeded, 1);
		assert.equal(results.summary.failed, 1);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("split-task cancel keeps parent cancelled, cancels active children, and stops queued items", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-split-cancel-"));
	const releaseGeneratedWorkers: Array<() => void> = [];
	let service: CanvasTaskRunService | undefined;
	let splitRunId: string | undefined;
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search", "checker"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			title: "清单生成",
			workUnit: {
				...validTaskInput.workUnit,
				title: "清单生成",
				outputPorts: [{ id: "worklist_out", label: "Worklist", type: "worklist" }],
				outputContract: { text: "输出 worklist。" },
				acceptance: { rules: ["必须输出 worklist"] },
			},
		});
		const splitTask = await taskStore.create({
			...validTaskInput,
			title: "分片处理",
			canvasKind: "split-task",
			workUnit: {
				...validTaskInput.workUnit,
				title: "分片处理",
				input: { text: "按清单并发处理。" },
				inputPorts: [{ id: "source_worklist", label: "Worklist", type: "worklist" }],
				outputPorts: [{ id: "results", label: "Results", type: "worklist-results" }],
				outputContract: { text: "输出 worklist-results。" },
				acceptance: { rules: ["必须完整回收"] },
			},
			splitTaskSpec: {
				schemaVersion: "team/split-task-spec-1",
				inputPortId: "source_worklist",
				outputPortId: "results",
				dispatchGoal: "逐个 chunk 标准化。",
				generatedWorkerAgentId: "search",
				generatedCheckerAgentId: "checker",
				autoRun: { enabled: true, concurrency: 2 },
				collectPolicy: { requireAllItemsSucceeded: true, requireFullCoverage: true },
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "worklist_out",
			toTaskId: splitTask.taskId,
			toInputPortId: "source_worklist",
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));

		class SplitCancelRunner extends ProcessEventRoleRunner {
			readonly generatedWorkerStarts: string[] = [];

			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.id === sourceTask.taskId) {
					await writeFile(join(input.artifactPublicDir!, "worklist.json"), worklistJsonWithItems(4), "utf8");
					return { content: "worker wrote worklist.json", artifactRefs: [] };
				}
				if (input.task.title.startsWith("Chunk ")) {
					this.generatedWorkerStarts.push(input.task.title);
					const gate = createDeferred();
					releaseGeneratedWorkers.push(gate.resolve);
					await gate.promise;
					return { content: JSON.stringify({ itemTitle: input.task.title, ok: true }), artifactRefs: [] };
				}
				return super.runWorker(input as ProcessAwareWorkerInput);
			}

			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.id === sourceTask.taskId) {
					return { verdict: "pass", reason: "ok", resultContent: "accepted worklist summary" };
				}
				return { verdict: "pass", reason: "ok" };
			}
		}

		const runner = new SplitCancelRunner();
		service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const sourceRun = await service.createRun(sourceTask.taskId);
		await waitForTerminalRun(service, sourceRun.runId);
		const splitRuns = await waitForTaskRuns(service, splitTask.taskId, 1);
		splitRunId = splitRuns[0]!.runId;
		for (let i = 0; i < 80; i++) {
			if (runner.generatedWorkerStarts.length >= 2) break;
			await delayMs(25);
		}
		assert.equal(runner.generatedWorkerStarts.length, 2);
		assert.deepEqual(new Set(runner.generatedWorkerStarts), new Set(["Chunk 1", "Chunk 2"]));

		const cancelled = await service.cancelRun(splitRunId, "user cancel");
		assert.equal(cancelled.status, "cancelled");
		assert.equal(cancelled.taskStates[splitTask.taskId]?.status, "cancelled");

		for (const release of releaseGeneratedWorkers.splice(0)) release();
		await delayMs(150);

		const latestParent = await service.getRun(splitRunId);
		assert.equal(latestParent?.status, "cancelled");
		assert.equal(latestParent?.taskStates[splitTask.taskId]?.status, "cancelled");
		assert.equal(runner.generatedWorkerStarts.length, 2, "cancelled split-task must not launch queued worklist items");

		const generated = await taskStore.listGeneratedForSourceTask("split-task", splitTask.taskId);
		const generatedRuns = await Promise.all(generated.map(async task => [task, await service!.listRuns(task.taskId)] as const));
		assert.equal(generated.length, 2, "cancelled split-task must not create queued generated tasks");
		assert.deepEqual(new Set(generatedRuns.map(([, runs]) => runs[0]?.status)), new Set(["cancelled"]));

		const attempts = await workspace.listAttempts(splitRunId, splitTask.taskId);
		assert.equal(attempts[0]?.files.includes("worklist-results.json"), false);
	} finally {
		for (const release of releaseGeneratedWorkers.splice(0)) release();
		if (service && splitRunId) await service.cancelRun(splitRunId, "test cleanup").catch(() => {});
		await removeTempRoot(root);
	}
});
