import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "../src/team/task-store.js";
import { TaskConnectionStore } from "../src/team/task-connection-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { CanvasTaskRunService } from "../src/team/task-run-service.js";
import type {
	CheckerInput,
	CheckerOutput,
	WorkerInput,
	WorkerOutput,
} from "../src/team/role-runner.js";
import type { TeamRunState } from "../src/team/types.js";
import {
	ArtifactFileProgressWorkerRunner,
	CancellableWorkerRoleRunner,
	ContinualToolProgressWorkerRunner,
	LateEventAfterCancelRoleRunner,
	ProcessEventRoleRunner,
	TextOnlyWorkerRunner,
	ToolProgressDelaysWorkerRunner,
	removeTempRoot,
	type ProcessAwareWorkerInput,
	validTaskInput,
	waitForTaskRuns,
	waitForTerminalRun,
	waitForWorkerAssistantText,
} from "./team-task-run-process-helpers.js";

test("Canvas Task run admission allows different active Tasks but rejects the same active Task", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-admission-"));
	let releaseGatedWorker: (() => void) | undefined;
	let service: CanvasTaskRunService | undefined;
	let taskARun: TeamRunState | undefined;
	let taskBRun: TeamRunState | undefined;
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const taskA = await taskStore.create(validTaskInput);
		const taskB = await taskStore.create({ ...validTaskInput, title: "制作 HTML 页面" });
		const workspace = new RunWorkspace(join(root, "task-runs"));

		let gatedWorkerStarted!: () => void;
		const gatedWorkerStartedPromise = new Promise<void>((resolve) => { gatedWorkerStarted = resolve; });
		let gatedWorkerProceed!: () => void;
		const gatedWorkerProceedPromise = new Promise<void>((resolve) => {
			gatedWorkerProceed = resolve;
			releaseGatedWorker = resolve;
		});

		class GatedFirstTaskRunner extends ProcessEventRoleRunner {
			async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
				gatedWorkerStarted();
				await gatedWorkerProceedPromise;
				return super.runWorker(input);
			}
		}

		let runnerCallCount = 0;
		const runService = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => {
				runnerCallCount++;
				return runnerCallCount === 1 ? new GatedFirstTaskRunner() : new ProcessEventRoleRunner();
			},
			dataDir: join(root, "task-runs"),
			maxConcurrentRuns: 1,
		});
		service = runService;

		taskARun = await runService.createRun(taskA.taskId);
		await gatedWorkerStartedPromise;
		const activeA = await runService.getRun(taskARun.runId);
		assert.equal(activeA?.status, "running");

		await assert.rejects(
			() => runService.createRun(taskA.taskId),
			/active task run already exists/,
		);

		taskBRun = await runService.createRun(taskB.taskId);
		assert.equal(taskBRun.source?.taskId, taskB.taskId);

		releaseGatedWorker?.();
		releaseGatedWorker = undefined;
		const [finishedA, finishedB] = await Promise.all([
			waitForTerminalRun(runService, taskARun.runId),
			waitForTerminalRun(runService, taskBRun.runId),
		]);
		assert.equal(finishedA.status, "completed");
		assert.equal(finishedB.status, "completed");
		assert.equal(finishedA.source?.taskId, taskA.taskId);
		assert.equal(finishedB.source?.taskId, taskB.taskId);
	} finally {
		releaseGatedWorker?.();
		if (service && taskARun) await waitForTerminalRun(service, taskARun.runId).catch(() => {});
		if (service && taskBRun) await waitForTerminalRun(service, taskBRun.runId).catch(() => {});
		await rm(root, { recursive: true, force: true });
	}
});

test("CanvasTaskRunService fails detached active runs after service restart", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-detached-recovery-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create(validTaskInput);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const timestamp = new Date().toISOString();
		const plan = {
			schemaVersion: "team/plan-1" as const,
			planId: `canvas_task_${task.taskId}`,
			title: task.title,
			defaultTeamUnitId: `canvas_task_unit_${task.taskId}`,
			goal: { text: task.workUnit.input.text },
			tasks: [
				{ id: task.taskId, title: task.title, input: task.workUnit.input, acceptance: task.workUnit.acceptance },
			],
			outputContract: task.workUnit.outputContract,
			archived: false,
			createdAt: timestamp,
			updatedAt: timestamp,
			runCount: 0,
		};
		const run = await workspace.createRun(plan, plan.defaultTeamUnitId);
		run.source = { type: "canvas-task", taskId: task.taskId };
		run.status = "running";
		run.startedAt = timestamp;
		run.currentTaskId = task.taskId;
		run.taskStates[task.taskId]!.status = "running";
		run.taskStates[task.taskId]!.progress = {
			phase: "worker_running",
			message: "执行中",
			updatedAt: timestamp,
		};
		await workspace.saveState(run);

		const restartedService = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			dataDir: join(root, "task-runs"),
		});

		const recovered = await restartedService.recoverDetachedRuns();
		const state = await restartedService.getRun(run.runId);

		assert.equal(recovered.failedRunIds.includes(run.runId), true);
		assert.equal(state?.status, "failed");
		assert.equal(state?.lastError, "canvas task run interrupted before completion");
		assert.equal(state?.taskStates[task.taskId]?.status, "failed");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("CanvasTaskRunService records worker and checker process snapshots on attempts", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-process-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create(validTaskInput);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(task.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");

		const attempts = await workspace.listAttempts(created.runId, task.taskId);
		assert.equal(attempts.length, 1);
		const roleProcesses = attempts[0]!.roleProcesses;
		assert.equal(roleProcesses?.worker?.profileId, "search");
		assert.equal(roleProcesses?.worker?.status, "succeeded");
		assert.equal(roleProcesses?.worker?.process?.isComplete, true);
		assert.match(roleProcesses?.worker?.assistantText?.content ?? "", /用户正在询问 GitHub 热榜。/);
		assert.match(roleProcesses?.worker?.assistantText?.content ?? "", /我先搜索并整理仓库。worker done/);
		assert.ok(roleProcesses?.worker?.assistantText?.updatedAt);
		assert.equal(roleProcesses?.worker?.process?.entries.some(entry => entry.toolCallId === "worker_tool_1"), true);
		const updateEntry = roleProcesses?.worker?.process?.entries.find(entry => entry.title === "工具更新");
		assert.ok(updateEntry);
		assert.ok(updateEntry.detail.length < 8_100);
		assert.match(updateEntry.detail, /\.\.\.\[truncated\]$/);

		assert.equal(roleProcesses?.checker?.profileId, "main");
		assert.equal(roleProcesses?.checker?.status, "succeeded");
		assert.equal(roleProcesses?.checker?.process?.isComplete, true);
		assert.match(roleProcesses?.checker?.assistantText?.content ?? "", /我在核对条目数量。验收通过。/);
		assert.ok(roleProcesses?.checker?.assistantText?.updatedAt);
		assert.equal(roleProcesses?.checker?.process?.entries.some(entry => entry.toolCallId === "checker_tool_1"), true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("CanvasTaskRunService binds template parameters before writing plan and worker prompt input", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-template-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const template = await taskStore.create({
			...validTaskInput,
			title: "全网查询 {{keyword}}",
			workUnit: {
				...validTaskInput.workUnit,
				title: "全网查询 {{keyword}}",
				input: { text: "围绕 {{keyword}} 进行公开来源检索。" },
				outputContract: { text: "输出 {{keyword}} 的中文 Markdown 报告。" },
				acceptance: { rules: ["必须包含 {{keyword}} 的来源证据"] },
			},
			templateConfig: {
				schemaVersion: "team/task-template-1",
				parameters: [{ id: "keyword", label: "关键词", required: true }],
			},
		} as never);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedWorkerInput: WorkerInput | undefined;
		class CaptureTemplateWorkerInputRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				capturedWorkerInput = input;
				return { content: "worker result", artifactRefs: [] };
			}
		}
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new CaptureTemplateWorkerInputRunner(),
			dataDir: join(root, "task-runs"),
		});

		await assert.rejects(
			() => service.createRun(template.taskId),
			{ message: "template binding is required: keyword" },
		);

		const created = await service.createRun(template.taskId, {
			templateBindings: { keyword: "MiniMax M3" },
		});
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		assert.deepEqual(finished.source?.templateBindings, { keyword: "MiniMax M3" });

		const planText = await readFile(join(root, "task-runs", "runs", created.runId, "plan.json"), "utf8");
		assert.match(planText, /MiniMax M3/);
		assert.doesNotMatch(planText, /\{\{keyword\}\}/);
		assert.ok(capturedWorkerInput);
		assert.equal(capturedWorkerInput!.task.title, "全网查询 MiniMax M3");
		assert.match(capturedWorkerInput!.task.input.text, /围绕 MiniMax M3/);
		assert.doesNotMatch(capturedWorkerInput!.task.input.text, /\{\{keyword\}\}/);

		const stored = await taskStore.get(template.taskId);
		assert.deepEqual(stored?.templateState?.currentBindings, { keyword: "MiniMax M3" });
		assert.equal(stored?.workUnit.input.text, "围绕 {{keyword}} 进行公开来源检索。");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("CanvasTaskRunService extends worker idle timeout after tool completion", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-adaptive-tool-progress-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create(validTaskInput);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ToolProgressDelaysWorkerRunner(),
			dataDir: join(root, "task-runs"),
			phaseTimeouts: {
				workerMs: 40,
				checkerMs: 100,
				workerHardCapMs: 200,
				checkerHardCapMs: 200,
			},
		});

		const created = await service.createRun(task.taskId);
		const finished = await waitForTerminalRun(service, created.runId);

		assert.equal(finished.status, "completed");
		assert.equal(finished.taskStates[task.taskId]?.status, "succeeded");
		const attempts = await workspace.listAttempts(created.runId, task.taskId);
		assert.equal(attempts[0]?.worker.length, 1);
		assert.equal(attempts[0]?.roleProcesses?.worker?.status, "succeeded");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("CanvasTaskRunService extends worker idle timeout after artifact file progress", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-adaptive-file-progress-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create(validTaskInput);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ArtifactFileProgressWorkerRunner(),
			dataDir: join(root, "task-runs"),
			phaseTimeouts: {
				workerMs: 40,
				checkerMs: 100,
				workerHardCapMs: 200,
				checkerHardCapMs: 200,
			},
		});

		const created = await service.createRun(task.taskId);
		const finished = await waitForTerminalRun(service, created.runId);

		assert.equal(finished.status, "completed");
		assert.equal(finished.taskStates[task.taskId]?.status, "succeeded");
		const attempts = await workspace.listAttempts(created.runId, task.taskId);
		assert.equal(attempts[0]?.roleProcesses?.worker?.status, "succeeded");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("CanvasTaskRunService does not extend worker idle timeout for text or thinking only", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-adaptive-text-timeout-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create(validTaskInput);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new TextOnlyWorkerRunner(),
			dataDir: join(root, "task-runs"),
			phaseTimeouts: {
				workerMs: 30,
				checkerMs: 100,
				workerHardCapMs: 200,
				checkerHardCapMs: 200,
			},
		});

		const created = await service.createRun(task.taskId);
		const finished = await waitForTerminalRun(service, created.runId);

		assert.equal(finished.status, "failed");
		assert.equal(finished.taskStates[task.taskId]?.errorSummary, "worker timeout");
		const attempts = await workspace.listAttempts(created.runId, task.taskId);
		const resultRef = attempts[0]?.resultRef;
		assert.ok(resultRef);
		const failedResult = await workspace.readRunScopedFile(created.runId, resultRef);
		assert.match(failedResult ?? "", /timeoutType: idle/);
		assert.match(failedResult ?? "", /lastStructuralActivityReason: phase started/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("CanvasTaskRunService worker hard cap wins even when structural progress continues", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-adaptive-hardcap-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create(validTaskInput);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ContinualToolProgressWorkerRunner(),
			dataDir: join(root, "task-runs"),
			phaseTimeouts: {
				workerMs: 30,
				checkerMs: 100,
				workerHardCapMs: 70,
				checkerHardCapMs: 200,
			},
		});

		const created = await service.createRun(task.taskId);
		const finished = await waitForTerminalRun(service, created.runId);

		assert.equal(finished.status, "failed");
		assert.equal(finished.taskStates[task.taskId]?.errorSummary, "worker timeout");
		const attempts = await workspace.listAttempts(created.runId, task.taskId);
		const resultRef = attempts[0]?.resultRef;
		assert.ok(resultRef);
		const failedResult = await workspace.readRunScopedFile(created.runId, resultRef);
		assert.match(failedResult ?? "", /timeoutType: hard_cap/);
		assert.match(failedResult ?? "", /lastStructuralActivityReason: tool_finished poll/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Step04: normal Canvas Task run honors workUnit outputCheck", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-output-check-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const outputCheck = { type: "json_object" as const, requiredFields: ["summary"] };
		const task = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				outputContract: { text: "输出 JSON object，必须包含 summary。" },
				outputCheck,
			},
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedWorkerInput: WorkerInput | undefined;

		class InvalidJsonObjectRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				capturedWorkerInput = input;
				return { content: JSON.stringify({ notes: "missing summary" }), artifactRefs: [] };
			}
			async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
				return {
					verdict: "pass",
					reason: "mock checker accepted invalid normal output",
					resultContent: JSON.stringify({ notes: "missing summary" }),
				};
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new InvalidJsonObjectRunner(),
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(task.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed_with_failures");
		assert.equal(finished.taskStates[task.taskId]?.status, "failed");
		assert.deepEqual(capturedWorkerInput?.task.outputCheck, outputCheck);
		assert.match(finished.taskStates[task.taskId]?.errorSummary ?? "", /missing required field 'summary'/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("CanvasTaskRunService keeps cancelled attempt terminal fields when late role events arrive", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-process-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create(validTaskInput);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const runner = new LateEventAfterCancelRoleRunner();
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(task.taskId);
		const runningWorker = await waitForWorkerAssistantText(workspace, created.runId, task.taskId, "取消前文本。");
		assert.equal(runningWorker.status, "running");

		const cancelled = await service.cancelRun(created.runId);
		assert.equal(cancelled.status, "cancelled");
		const attemptsBeforeLateEvent = await workspace.listAttempts(created.runId, task.taskId);
		const workerBeforeLateEvent = attemptsBeforeLateEvent[0]!.roleProcesses?.worker;
		assert.equal(workerBeforeLateEvent?.assistantText?.content, "取消前文本。");
		assert.ok(workerBeforeLateEvent?.assistantText?.updatedAt);
		const assistantTextBeforeLateEvent = workerBeforeLateEvent?.assistantText?.content;
		await runner.lateEventSent;
		await new Promise(resolve => setTimeout(resolve, 25));

		const attempts = await workspace.listAttempts(created.runId, task.taskId);
		const attempt = attempts[0]!;
		assert.equal(attempt.status, "cancelled");
		assert.equal(attempt.phase, "cancelled");
		assert.ok(attempt.finishedAt);
		assert.equal(attempt.errorSummary, "run cancelled");
		const worker = attempt.roleProcesses?.worker;
		assert.equal(worker?.status, "cancelled");
		assert.ok(worker?.finishedAt);
		assert.equal(worker?.process?.isComplete, true);
		assert.equal(worker?.process?.currentAction, "任务已打断");
		assert.equal(worker?.assistantText?.content, assistantTextBeforeLateEvent);
		assert.doesNotMatch(worker?.assistantText?.content ?? "", /迟到文本/);
		assert.equal(worker?.process?.entries.some(entry => entry.toolCallId === "late_after_cancel"), false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("CanvasTaskRunService flushes cancelled worker process when task run is cancelled", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-process-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create(validTaskInput);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new CancellableWorkerRoleRunner(),
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(task.taskId);
		const runningWorker = await waitForWorkerAssistantText(workspace, created.runId, task.taskId, "取消前文本。");
		assert.equal(runningWorker.status, "running");

		const cancelled = await service.cancelRun(created.runId);
		assert.equal(cancelled.status, "cancelled");
		const attempts = await workspace.listAttempts(created.runId, task.taskId);
		const worker = attempts[0]!.roleProcesses?.worker;
		assert.equal(worker?.status, "cancelled");
		assert.equal(worker?.process?.isComplete, true);
		assert.equal(worker?.process?.currentAction, "任务已打断");
		assert.equal(worker?.assistantText?.content, "取消前文本。");
		assert.ok(worker?.assistantText?.updatedAt);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
