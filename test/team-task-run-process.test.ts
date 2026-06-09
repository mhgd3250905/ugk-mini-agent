import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "../src/team/task-store.js";
import { TaskConnectionStore } from "../src/team/task-connection-store.js";
import { TaskDependencyStore } from "../src/team/task-dependency-store.js";
import { SourceConnectionStore } from "../src/team/source-connection-store.js";
import { SourceNodeStore } from "../src/team/source-node-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { CanvasTaskRunService } from "../src/team/task-run-service.js";
import type {
	CheckerInput,
	CheckerOutput,
	DecomposerInput,
	DecomposerOutput,
	DiscoveryDispatchInput,
	DiscoveryDispatchOutput,
	FinalizerInput,
	FinalizerOutput,
	TeamRoleRunner,
	WatcherInput,
	WatcherOutput,
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
	validDiscoverySpec,
	validTaskInput,
	waitForAttemptDelivery,
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

test("archived source task mid-run blocks downstream triggering", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-mid-archive-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const targetTask = await taskStore.create({
			title: "HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "HTML 制作",
				input: { text: "制作 HTML 页面。" },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须包含 HTML"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_md",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));

		let workerStartedResolve!: () => void;
		const workerStarted = new Promise<void>((resolve) => { workerStartedResolve = resolve; });
		let workerProceedResolve!: () => void;
		const workerProceed = new Promise<void>((resolve) => { workerProceedResolve = resolve; });

		class GatedWorkerRunner implements TeamRoleRunner {
			async runWorker(_input: WorkerInput): Promise<WorkerOutput> {
				workerStartedResolve();
				await workerProceed;
				return { content: "worker result", artifactRefs: [] };
			}
			async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
				return { verdict: "pass", reason: "ok", resultContent: "accepted result" };
			}
			async runWatcher(_input: WatcherInput): Promise<WatcherOutput> {
				return { decision: "accept_task", reason: "ok" };
			}
			async runFinalizer(_input: FinalizerInput): Promise<FinalizerOutput> {
				return { finalReport: "ok" };
			}
			async runDecomposer(_input: DecomposerInput): Promise<DecomposerOutput> {
				return { decision: "no_split", reason: "ok", children: [] };
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new GatedWorkerRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(sourceTask.taskId);

		await workerStarted;
		await taskStore.archive(sourceTask.taskId);
		workerProceedResolve();

		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		assert.equal(finished.taskStates[sourceTask.taskId]?.status, "succeeded");

		const downstreamRuns = await service.listRuns(targetTask.taskId);
		assert.deepEqual(downstreamRuns, []);

		// Verify skipped outcome was recorded for the archived source task (poll since delivery writes after terminal state)
		const delivery = await waitForAttemptDelivery(workspace, created.runId, sourceTask.taskId);
		assert.equal(delivery.length, 1);
		assert.equal(delivery[0]!.status, "skipped");
		assert.equal(delivery[0]!.staleReason, "source_task_archived");
		assert.equal(delivery[0]!.downstreamRunId, undefined);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("failed downstream delivery records error without failing upstream", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-delivery-fail-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const targetTask = await taskStore.create({
			title: "HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "HTML 制作",
				input: { text: "制作 HTML 页面。" },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须包含 HTML"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connection = await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_md",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));

		let gatedWorkerStarted!: () => void;
		const gatedWorkerStartedPromise = new Promise<void>((resolve) => { gatedWorkerStarted = resolve; });
		let gatedWorkerProceed!: () => void;
		const gatedWorkerProceedPromise = new Promise<void>((resolve) => { gatedWorkerProceed = resolve; });

		class GatedDownstreamRunner implements TeamRoleRunner {
			async runWorker(_input: WorkerInput): Promise<WorkerOutput> {
				gatedWorkerStarted();
				await gatedWorkerProceedPromise;
				return { content: "gated worker", artifactRefs: [] };
			}
			async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
				return { verdict: "pass", reason: "ok", resultContent: "accepted" };
			}
			async runWatcher(_input: WatcherInput): Promise<WatcherOutput> {
				return { decision: "accept_task", reason: "ok" };
			}
			async runFinalizer(_input: FinalizerInput): Promise<FinalizerOutput> {
				return { finalReport: "ok" };
			}
			async runDecomposer(_input: DecomposerInput): Promise<DecomposerOutput> {
				return { decision: "no_split", reason: "ok", children: [] };
			}
		}

		// First call is for the pre-created downstream run (gated), second call is for the source run (fast pass-through)
		let runnerCallCount = 0;
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => {
				runnerCallCount++;
				return runnerCallCount === 1 ? new GatedDownstreamRunner() : new ProcessEventRoleRunner();
			},
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		// Pre-create an active downstream run that stays active (gated worker)
		const preCreatedRun = await service.createRun(targetTask.taskId);
		await gatedWorkerStartedPromise;

		// Now run the source task - downstream delivery should fail because active run exists
		const created = await service.createRun(sourceTask.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed", "upstream must remain completed despite delivery failure");
		assert.equal(finished.taskStates[sourceTask.taskId]?.status, "succeeded");

		// Verify failed outcome was recorded (poll since delivery writes after terminal state)
		const delivery = await waitForAttemptDelivery(workspace, created.runId, sourceTask.taskId);
		assert.equal(delivery.length, 1);
		assert.equal(delivery[0]!.status, "failed");
		assert.equal((delivery[0] as import("../src/team/types.js").TeamTaskTypedConnectionDeliveryOutcome).connectionId, connection.connectionId);
		assert.equal(delivery[0]!.toTaskId, targetTask.taskId);
		assert.equal(delivery[0]!.downstreamRunId, undefined);
		assert.ok(delivery[0]!.error, "error must be recorded");
		assert.match(delivery[0]!.error!, /active task run already exists/);

		// Let the gated worker proceed so cleanup can succeed
		gatedWorkerProceed();
		await waitForTerminalRun(service, preCreatedRun.runId);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("downstream connection listing failure does not fail accepted upstream run", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-listing-fail-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const targetTask = await taskStore.create({
			title: "HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "HTML 制作",
				input: { text: "制作 HTML 页面。" },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须包含 HTML"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_md",
		});

		// Monkey-patch listFromTask to simulate corrupt JSON / store failure
		connectionStore.listFromTask = async () => {
			throw new Error("task connection store contains invalid JSON");
		};

		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(sourceTask.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed", `upstream must remain completed despite connection listing failure, got "${finished.status}"`);
		assert.equal(finished.taskStates[sourceTask.taskId]?.status, "succeeded");

		// Settle then re-read to confirm no late reversal of the accepted run
		await new Promise(resolve => setTimeout(resolve, 200));
		const settled = await service.getRun(created.runId);
		assert.ok(settled);
		assert.equal(settled!.status, "completed", `upstream must still be completed after settle, got "${settled!.status}"`);
		assert.notEqual(settled!.lastError, "task connection store contains invalid JSON", "lastError must not reflect the listing failure");
		assert.ok(!settled!.lastError || settled!.lastError !== "task connection store contains invalid JSON");
	} finally {
		await new Promise(resolve => setTimeout(resolve, 100));
		await rm(root, { recursive: true, force: true });
	}
});

test("delivery outcome persistence failure does not fail accepted upstream run", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-persist-fail-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const targetTask = await taskStore.create({
			title: "HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "HTML 制作",
				input: { text: "制作 HTML 页面。" },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须包含 HTML"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_md",
		});
		await taskStore.update(targetTask.taskId, {
			workUnit: {
				...targetTask.workUnit,
				inputPorts: [{ id: "source_md", label: "HTML input", type: "html" }],
			},
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		let recordAttemptDeliveryOutcomesCalled = false;
		// Monkey-patch recordAttemptDeliveryOutcomes to simulate persistence failure
		workspace.recordAttemptDeliveryOutcomes = async () => {
			recordAttemptDeliveryOutcomesCalled = true;
			throw new Error("disk full: delivery outcome write failed");
		};

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(sourceTask.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed", `upstream must remain completed despite delivery persistence failure, got "${finished.status}"`);
		assert.equal(finished.taskStates[sourceTask.taskId]?.status, "succeeded");

		// Settle then re-read to confirm no late reversal of the accepted run
		await new Promise(resolve => setTimeout(resolve, 200));
		const settled = await service.getRun(created.runId);
		assert.ok(settled);
		assert.equal(settled!.status, "completed", `upstream must still be completed after settle, got "${settled!.status}"`);
		assert.equal(recordAttemptDeliveryOutcomesCalled, true);
		const downstreamRuns = await service.listRuns(targetTask.taskId);
		assert.deepEqual(downstreamRuns, []);
	} finally {
		await new Promise(resolve => setTimeout(resolve, 100));
		await rm(root, { recursive: true, force: true });
	}
});

test("downstream worker receives bound input prompt and payload from upstream typed artifact", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-handoff-int-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const targetTask = await taskStore.create({
			title: "HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "HTML 制作",
				input: { text: "制作 HTML 页面。" },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须包含 HTML"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connection = await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_md",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));

		let capturedWorkerInput: WorkerInput | undefined;

		class CaptureWorkerInputRunner implements TeamRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				capturedWorkerInput = input;
				return { content: "downstream worker result", artifactRefs: [] };
			}
			async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
				return { verdict: "pass", reason: "ok", resultContent: "accepted result" };
			}
			async runWatcher(_input: WatcherInput): Promise<WatcherOutput> {
				return { decision: "accept_task", reason: "ok" };
			}
			async runFinalizer(_input: FinalizerInput): Promise<FinalizerOutput> {
				return { finalReport: "ok" };
			}
			async runDecomposer(_input: DecomposerInput): Promise<DecomposerOutput> {
				return { decision: "no_split", reason: "ok", children: [] };
			}
		}

		let runnerCallCount = 0;
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => {
				runnerCallCount++;
				return new CaptureWorkerInputRunner();
			},
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");

		const upstreamAttempts = await workspace.listAttempts(upstreamRun.runId, sourceTask.taskId);
		assert.equal(upstreamAttempts.length, 1);
		const upstreamAttemptId = upstreamAttempts[0]!.attemptId;

		const downstreamRuns = await waitForTaskRuns(service, targetTask.taskId, 1);
		const downstreamFinished = await waitForTerminalRun(service, downstreamRuns[0]!.runId);
		assert.equal(downstreamFinished.status, "completed");

		assert.ok(capturedWorkerInput, "downstream worker input should have been captured");
		const inputText = capturedWorkerInput!.task.input.text;
		assert.match(inputText, /制作 HTML 页面。/);
		assert.match(inputText, /typed artifact/);
		assert.match(inputText, new RegExp("connectionId: " + connection.connectionId));
		assert.match(inputText, /inputPortId: source_md/);

		const boundInputPayload = capturedWorkerInput!.task.input.payload as { boundInputs?: Array<{ artifact: { artifactId: string; workspaceFileRef?: string } }> } | undefined;
		const artifactId = boundInputPayload!.boundInputs![0]!.artifact.artifactId;
		assert.match(inputText, new RegExp("artifactId: " + artifactId));
		assert.match(inputText, new RegExp("sourceTaskId: " + sourceTask.taskId));
		assert.match(inputText, new RegExp("sourceRunId: " + upstreamRun.runId));
		assert.match(inputText, new RegExp("sourceAttemptId: " + upstreamAttemptId));
		assert.match(inputText, /sourceOutputPortId: draft_md/);
		assert.match(inputText, /fileRef:/);
		assert.match(inputText, new RegExp("BEGIN_TYPED_ARTIFACT_PREVIEW " + artifactId));
		assert.match(inputText, new RegExp("END_TYPED_ARTIFACT_PREVIEW " + artifactId));
		assert.match(inputText, /workspaceFileRef:/);
		assert.match(inputText, /accepted result/);
		const workspaceFileRef = boundInputPayload!.boundInputs![0]!.artifact.workspaceFileRef;
		assert.ok(workspaceFileRef, "workspaceFileRef should be materialized before worker runs");
		assert.equal(await readFile(join(capturedWorkerInput!.workDir, workspaceFileRef), "utf8"), "accepted result");

		const payload = capturedWorkerInput!.task.input.payload as { boundInputs?: Array<{ inputPortId: string }> } | undefined;
		assert.ok(payload?.boundInputs, "payload should contain boundInputs");
		assert.equal(payload!.boundInputs!.length, 1);
		assert.equal(payload!.boundInputs![0]!.inputPortId, "source_md");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("downstream worker receives public worker JSON for typed artifact instead of accepted summary", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-handoff-public-json-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			title: "结构化数据采集",
			workUnit: {
				...validTaskInput.workUnit,
				title: "结构化数据采集",
				outputPorts: [{ id: "structured_json", label: "Structured JSON", type: "json" }],
				outputContract: { text: "输出 JSON object。" },
				acceptance: { rules: ["必须是合法 JSON"] },
			},
		});
		const targetTask = await taskStore.create({
			title: "HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "HTML 制作",
				input: { text: "根据上游 JSON 制作 HTML 页面。" },
				inputPorts: [{ id: "source_json", label: "Source JSON", type: "json" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须使用上游 JSON"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connection = await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "structured_json",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_json",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedDownstreamInput: WorkerInput | undefined;

		class PublicJsonRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.id === sourceTask.taskId) {
					assert.ok(input.artifactPublicDir);
					await writeFile(
						join(input.artifactPublicDir, "structured-report.json"),
						JSON.stringify({ reportId: "real-json", rows: [{ title: "真实结构化数据" }] }),
						"utf8",
					);
					return { content: "worker wrote structured-report.json", artifactRefs: [] };
				}
				if (input.task.id === targetTask.taskId) {
					capturedDownstreamInput = input;
					return { content: "downstream worker result", artifactRefs: [] };
				}
				return super.runWorker(input as ProcessAwareWorkerInput);
			}

			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.id === sourceTask.taskId) {
					return { verdict: "pass", reason: "ok", resultContent: "合法 JSON，81KB，验收通过。" };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted downstream" };
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new PublicJsonRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");
		const downstreamRuns = await waitForTaskRuns(service, targetTask.taskId, 1);
		const downstreamFinished = await waitForTerminalRun(service, downstreamRuns[0]!.runId);
		assert.equal(downstreamFinished.status, "completed");

		const boundInput = downstreamFinished.source?.boundInputs?.[0];
		assert.ok(boundInput, "downstream run must persist bound input");
		assert.equal(boundInput.connectionId, connection.connectionId);
		const artifact = boundInput.artifact as import("../src/team/types.js").TeamTaskTypedArtifact;
		assert.equal(artifact.type, "json");
		assert.match(artifact.fileRef, /agent-workspaces\/attempt_[^/]+\/worker\/output\/structured-report\.json$/);
		assert.doesNotMatch(artifact.fileRef, /accepted-result\.md$/);
		const parsed = JSON.parse(artifact.content ?? artifact.preview);
		assert.equal(parsed.reportId, "real-json");
		assert.equal(parsed.rows[0].title, "真实结构化数据");
		assert.doesNotMatch(artifact.content ?? artifact.preview, /验收通过/);

		assert.ok(capturedDownstreamInput, "downstream worker input should be captured");
		const payload = capturedDownstreamInput!.task.input.payload as { boundInputs?: Array<{ artifact: { fileRef: string; content?: string; preview: string; workspaceFileRef?: string; workspaceFilePath?: string } }> } | undefined;
		const payloadArtifact = payload?.boundInputs?.[0]?.artifact;
		assert.ok(payloadArtifact, "downstream payload must include typed artifact");
		assert.equal(payloadArtifact.fileRef, artifact.fileRef);
		assert.equal(JSON.parse(payloadArtifact.content ?? payloadArtifact.preview).reportId, "real-json");
		assert.ok(payloadArtifact.workspaceFileRef, "workspaceFileRef should point to the complete input file");
		assert.ok(payloadArtifact.workspaceFilePath, "workspaceFilePath should point to the complete input file");
		const materializedContent = await readFile(join(capturedDownstreamInput!.workDir, payloadArtifact.workspaceFileRef), "utf8");
		assert.equal(JSON.parse(materializedContent).reportId, "real-json");
		assert.match(capturedDownstreamInput!.task.input.text, /真实结构化数据/);
		assert.doesNotMatch(capturedDownstreamInput!.task.input.text, /验收通过/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("downstream worker receives oversized typed artifact as materialized workspace file", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-handoff-large-json-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			title: "大体量结构化数据采集",
			workUnit: {
				...validTaskInput.workUnit,
				title: "大体量结构化数据采集",
				outputPorts: [{ id: "structured_json", label: "Structured JSON", type: "json" }],
				outputContract: { text: "输出 JSON object。" },
				acceptance: { rules: ["必须是合法 JSON"] },
			},
		});
		const targetTask = await taskStore.create({
			title: "大体量 HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "大体量 HTML 制作",
				input: { text: "根据上游完整 JSON 制作 HTML 页面。" },
				inputPorts: [{ id: "source_json", label: "Source JSON", type: "json" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须使用上游完整 JSON"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "structured_json",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_json",
		});

		const oversizedJson = JSON.stringify({
			reportId: "large-json",
			rows: Array.from({ length: 80 }, (_, index) => ({
				id: `row-${index + 1}`,
				title: `真实结构化数据 ${index + 1}`,
				body: "x".repeat(800),
			})),
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedDownstreamInput: WorkerInput | undefined;

		class LargeJsonRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.id === sourceTask.taskId) {
					assert.ok(input.artifactPublicDir);
					await writeFile(join(input.artifactPublicDir, "structured-report.json"), oversizedJson, "utf8");
					return { content: "worker wrote large structured-report.json", artifactRefs: [] };
				}
				if (input.task.id === targetTask.taskId) {
					capturedDownstreamInput = input;
					return { content: "downstream worker result", artifactRefs: [] };
				}
				return super.runWorker(input as ProcessAwareWorkerInput);
			}

			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.id === sourceTask.taskId) {
					return { verdict: "pass", reason: "ok", resultContent: "合法大 JSON，验收通过。" };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted downstream" };
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new LargeJsonRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");
		const downstreamRuns = await waitForTaskRuns(service, targetTask.taskId, 1);
		const downstreamFinished = await waitForTerminalRun(service, downstreamRuns[0]!.runId);
		assert.equal(downstreamFinished.status, "completed");

		assert.ok(capturedDownstreamInput, "downstream worker input should be captured");
		const payload = capturedDownstreamInput!.task.input.payload as {
			boundInputs?: Array<{
				artifact: {
					content?: string;
					contentTruncated?: boolean;
					originalContentLength?: number;
					workspaceFileRef?: string;
					workspaceFilePath?: string;
				};
			}>;
		} | undefined;
		const payloadArtifact = payload?.boundInputs?.[0]?.artifact;
		assert.ok(payloadArtifact, "downstream payload must include typed artifact");
		assert.equal(payloadArtifact.contentTruncated, true);
		assert.equal(payloadArtifact.originalContentLength, oversizedJson.length);
		assert.ok(payloadArtifact.content, "truncated preview content should remain available");
		assert.ok(payloadArtifact.content.length < oversizedJson.length);
		assert.ok(payloadArtifact.workspaceFileRef, "workspaceFileRef should point to the complete materialized input");
		assert.ok(payloadArtifact.workspaceFilePath, "workspaceFilePath should point to the complete materialized input");
		const materializedContent = await readFile(join(capturedDownstreamInput!.workDir, payloadArtifact.workspaceFileRef), "utf8");
		const materializedJson = JSON.parse(materializedContent);
		assert.equal(materializedJson.reportId, "large-json");
		assert.equal(materializedJson.rows.length, 80);
		assert.match(capturedDownstreamInput!.task.input.text, /完整绑定输入文件/);
		assert.match(capturedDownstreamInput!.task.input.text, /workspaceFileRef:/);
		assert.match(capturedDownstreamInput!.task.input.text, /不得从预览片段重建/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("manual upstream run selection binds public worker JSON instead of accepted summary", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-manual-public-json-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			title: "结构化数据采集",
			workUnit: {
				...validTaskInput.workUnit,
				title: "结构化数据采集",
				outputPorts: [{ id: "structured_json", label: "Structured JSON", type: "json" }],
				outputContract: { text: "输出 JSON object。" },
				acceptance: { rules: ["必须是合法 JSON"] },
			},
		});
		const targetTask = await taskStore.create({
			title: "HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "HTML 制作",
				input: { text: "根据指定历史 run 的 JSON 制作 HTML 页面。" },
				inputPorts: [{ id: "source_json", label: "Source JSON", type: "json" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须使用上游 JSON"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connection = await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "structured_json",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_json",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedManualInput: WorkerInput | undefined;

		class ManualPublicJsonRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.id === sourceTask.taskId) {
					assert.ok(input.artifactPublicDir);
					await writeFile(
						join(input.artifactPublicDir, "structured-report.json"),
						JSON.stringify({ reportId: "selected-run-json", rows: [{ title: "被手动选择的真实数据" }] }),
						"utf8",
					);
					return { content: "worker wrote selected structured report", artifactRefs: [] };
				}
				if (input.task.id === targetTask.taskId) {
					capturedManualInput = input;
					return { content: "manual downstream worker result", artifactRefs: [] };
				}
				return super.runWorker(input as ProcessAwareWorkerInput);
			}

			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.id === sourceTask.taskId) {
					return { verdict: "pass", reason: "ok", resultContent: "合法 JSON，验收摘要，不是机器数据。" };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted downstream" };
			}
		}

		const serviceWithoutConnections = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ManualPublicJsonRunner(),
			dataDir: join(root, "task-runs"),
		});
		const upstreamRun = await serviceWithoutConnections.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(serviceWithoutConnections, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ManualPublicJsonRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});
		const manualRun = await service.createRun(targetTask.taskId, {
			upstreamRunSelections: [{ connectionId: connection.connectionId, fromRunId: upstreamRun.runId }],
		});
		const manualFinished = await waitForTerminalRun(service, manualRun.runId);
		assert.equal(manualFinished.status, "completed");
		assert.equal(manualFinished.source?.triggeredBy, undefined);

		const boundInput = manualFinished.source?.boundInputs?.[0];
		assert.ok(boundInput, "manual downstream run must persist bound input");
		const artifact = boundInput.artifact as import("../src/team/types.js").TeamTaskTypedArtifact;
		assert.equal(artifact.sourceRunId, upstreamRun.runId);
		assert.match(artifact.fileRef, /agent-workspaces\/attempt_[^/]+\/worker\/output\/structured-report\.json$/);
		assert.doesNotMatch(artifact.fileRef, /accepted-result\.md$/);
		assert.equal(JSON.parse(artifact.content ?? artifact.preview).reportId, "selected-run-json");
		assert.doesNotMatch(artifact.content ?? artifact.preview, /验收摘要/);

		assert.ok(capturedManualInput, "manual downstream worker input should be captured");
		const payload = capturedManualInput!.task.input.payload as { boundInputs?: Array<{ artifact: { fileRef: string; content?: string; preview: string } }> } | undefined;
		const payloadArtifact = payload?.boundInputs?.[0]?.artifact;
		assert.ok(payloadArtifact, "manual downstream payload must include typed artifact");
		assert.equal(payloadArtifact.fileRef, artifact.fileRef);
		assert.equal(JSON.parse(payloadArtifact.content ?? payloadArtifact.preview).reportId, "selected-run-json");
		assert.match(capturedManualInput!.task.input.text, /被手动选择的真实数据/);
		assert.doesNotMatch(capturedManualInput!.task.input.text, /验收摘要/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Discovery downstream receives aggregation when accepted result is a worker file reference", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-discovery-downstream-json-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			title: "发现论坛来源",
			canvasKind: "discovery",
			discoverySpec: validDiscoverySpec,
			workUnit: {
				...validTaskInput.workUnit,
				title: "发现论坛来源",
				input: { text: "发现并输出论坛来源 JSON。" },
				outputPorts: [{ id: "forum_sources", label: "Forum sources", type: "json" }],
				outputContract: { text: "输出 JSON object，vendors 为数组，每项包含稳定 id。" },
				acceptance: { rules: ["vendors 必须是数组", "每项必须有 id"] },
			},
		});
		const targetTask = await taskStore.create({
			title: "HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "HTML 制作",
				input: { text: "根据上游 JSON 制作 HTML 页面。" },
				inputPorts: [{ id: "source_json", label: "Source JSON", type: "json" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须使用上游 JSON"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "forum_sources",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_json",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedDownstreamInput: WorkerInput | undefined;

		class ReferencedDiscoveryResultRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.type === "discovery") {
					const workerDir = join(root, "task-runs", "runs", input.runId, "agent-workspaces", input.attemptId, "worker");
					await mkdir(workerDir, { recursive: true });
					await writeFile(
						join(workerDir, "forum-sources.json"),
						JSON.stringify({ vendors: [{ id: "vultr", name: "Vultr" }] }),
						"utf8",
					);
					return { content: "worker/forum-sources.json", artifactRefs: [] };
				}
				if (input.task.title === "HTML 制作") {
					capturedDownstreamInput = input;
					return { content: "downstream worker result", artifactRefs: [] };
				}
				return { content: `generated ${input.task.id} result`, artifactRefs: [] };
			}

			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.type === "discovery") {
					return { verdict: "pass", reason: "ok", resultContent: "worker/forum-sources.json" };
				}
				return { verdict: "pass", reason: "ok", resultContent: `${input.task.id} accepted` };
			}

			async runDiscoveryDispatcher(input: DiscoveryDispatchInput): Promise<DiscoveryDispatchOutput> {
				return {
					ok: true,
					itemId: input.itemId,
					workUnit: {
						title: `核查 ${input.itemId}`,
						input: { text: `核查 ${input.itemId}` },
						outputContract: { text: `输出 ${input.itemId} 的核查报告。` },
						acceptance: { rules: [`报告必须覆盖 ${input.itemId}`] },
					},
				};
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ReferencedDiscoveryResultRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");

		const upstreamAttempts = await workspace.listAttempts(upstreamRun.runId, sourceTask.taskId);
		const upstreamAttempt = upstreamAttempts[0]!;
		assert.equal(await workspace.readAttemptFile(upstreamRun.runId, sourceTask.taskId, upstreamAttempt.attemptId, "accepted-result.md"), "worker/forum-sources.json");

		const downstreamRuns = await waitForTaskRuns(service, targetTask.taskId, 1);
		const downstreamFinished = await waitForTerminalRun(service, downstreamRuns[0]!.runId);
		assert.equal(downstreamFinished.status, "completed");

		assert.ok(capturedDownstreamInput, "downstream worker input should have been captured");
		const boundInputPayload = capturedDownstreamInput!.task.input.payload as { boundInputs?: Array<{ artifact: { fileRef: string; content?: string; preview: string; workspaceFileRef?: string } }> } | undefined;
		const artifact = boundInputPayload!.boundInputs![0]!.artifact;
		assert.equal(artifact.fileRef, `tasks/${sourceTask.taskId}/attempts/${upstreamAttempt.attemptId}/discovery-aggregation.json`);
		assert.notEqual(artifact.content, "worker/forum-sources.json");
		const aggregation = JSON.parse(artifact.content ?? "");
		assert.equal(aggregation.schemaVersion, "team/discovery-aggregation-1");
		assert.equal(aggregation.sourceResultRef, `tasks/${sourceTask.taskId}/attempts/${upstreamAttempt.attemptId}/discovery-result.json`);
		assert.equal(aggregation.items[0]?.itemId, "vultr");
		assert.equal(aggregation.items[0]?.result?.status, "succeeded");
		assert.doesNotMatch(artifact.content ?? "", /worker\/forum-sources\.json/);
		assert.ok(artifact.workspaceFileRef, "workspaceFileRef should point to materialized aggregation");
		const materializedAggregation = JSON.parse(await readFile(join(capturedDownstreamInput!.workDir, artifact.workspaceFileRef), "utf8"));
		assert.equal(materializedAggregation.items[0]?.itemId, "vultr");
		assert.match(capturedDownstreamInput!.task.input.text, /BEGIN_TYPED_ARTIFACT_PREVIEW/);
		assert.match(capturedDownstreamInput!.task.input.text, /workspaceFileRef:/);
		assert.match(capturedDownstreamInput!.task.input.text, /discovery-aggregation\.json/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Discovery downstream receives aggregated generated child results after auto-runs finish", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-discovery-downstream-aggregation-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			title: "发现论坛来源",
			canvasKind: "discovery",
			discoverySpec: validDiscoverySpec,
			workUnit: {
				...validTaskInput.workUnit,
				title: "发现论坛来源",
				input: { text: "发现并输出论坛来源 JSON。" },
				outputPorts: [{ id: "forum_sources", label: "Forum sources", type: "json" }],
				outputContract: { text: "输出 JSON object，vendors 为数组，每项包含稳定 id。" },
				acceptance: { rules: ["vendors 必须是数组", "每项必须有 id"] },
			},
		});
		const targetTask = await taskStore.create({
			title: "HTML 制作",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "HTML 制作",
				input: { text: "根据上游 JSON 制作 HTML 页面。" },
				inputPorts: [{ id: "source_json", label: "Source JSON", type: "json" }],
				outputContract: { text: "输出 HTML 页面。" },
				acceptance: { rules: ["必须使用 generated child 搜索结果"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "forum_sources",
			toTaskId: targetTask.taskId,
			toInputPortId: "source_json",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedDownstreamInput: WorkerInput | undefined;

		class AggregatingDiscoveryRunner extends ProcessEventRoleRunner {
			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.type === "discovery") {
					return {
						verdict: "pass",
						reason: "ok",
						resultContent: JSON.stringify({
							vendors: [
								{ id: "reddit", name: "Reddit" },
								{ id: "github", name: "GitHub" },
							],
						}),
					};
				}
				if (input.task.title === "HTML 制作") {
					return { verdict: "pass", reason: "ok", resultContent: "downstream accepted" };
				}
				const itemId = input.task.title.replace(/^核查\s+/, "");
				return {
					verdict: "pass",
					reason: "ok",
					resultContent: JSON.stringify({
						itemId,
						findings: [`${itemId} 用户反馈摘要`],
						sources: [`https://example.com/${itemId}`],
					}),
				};
			}

			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.type === "discovery") return { content: "root worker", artifactRefs: [] };
				if (input.task.title === "HTML 制作") {
					capturedDownstreamInput = input;
					return { content: "downstream worker result", artifactRefs: [] };
				}
				const itemId = input.task.title.replace(/^核查\s+/, "");
				return {
					content: JSON.stringify({ itemId, workerOnly: true }),
					artifactRefs: [],
				};
			}

			async runDiscoveryDispatcher(input: DiscoveryDispatchInput): Promise<DiscoveryDispatchOutput> {
				return {
					ok: true,
					itemId: input.itemId,
					workUnit: {
						title: `核查 ${input.itemId}`,
						input: { text: `核查 ${input.itemId} 的用户反馈` },
						outputContract: { text: `输出 ${input.itemId} 的结构化搜索结果。` },
						acceptance: { rules: [`结果必须覆盖 ${input.itemId}`] },
					},
				};
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new AggregatingDiscoveryRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");

		const upstreamAttempts = await workspace.listAttempts(upstreamRun.runId, sourceTask.taskId);
		const upstreamAttempt = upstreamAttempts[0]!;
		const downstreamRuns = await waitForTaskRuns(service, targetTask.taskId, 1);
		await waitForTerminalRun(service, downstreamRuns[0]!.runId);

		assert.ok(capturedDownstreamInput, "downstream worker input should have been captured");
		const boundInputPayload = capturedDownstreamInput!.task.input.payload as { boundInputs?: Array<{ artifact: { fileRef: string; content?: string; preview: string } }> } | undefined;
		const artifact = boundInputPayload!.boundInputs![0]!.artifact;
		assert.equal(artifact.fileRef, `tasks/${sourceTask.taskId}/attempts/${upstreamAttempt.attemptId}/discovery-aggregation.json`);
		assert.ok(artifact.content, "aggregation content should be included in the downstream prompt payload");
		const aggregation = JSON.parse(artifact.content!);
		assert.equal(aggregation.schemaVersion, "team/discovery-aggregation-1");
		assert.equal(aggregation.discoveryTaskId, sourceTask.taskId);
		assert.equal(aggregation.discoveryRunId, upstreamRun.runId);
		assert.equal(aggregation.discoveryAttemptId, upstreamAttempt.attemptId);
		assert.deepEqual(aggregation.summary, {
			totalItems: 2,
			generatedTasks: 2,
			succeeded: 2,
			failed: 0,
			cancelled: 0,
			skipped: 0,
			missingResult: 0,
		});
		assert.deepEqual(aggregation.items.map((item: { itemId: string }) => item.itemId), ["reddit", "github"]);
		assert.equal(aggregation.items[0].result.status, "succeeded");
		assert.match(aggregation.items[0].result.content, /reddit 用户反馈摘要/);
		assert.equal(aggregation.items[1].result.status, "succeeded");
		assert.match(aggregation.items[1].result.content, /github 用户反馈摘要/);
		assert.match(capturedDownstreamInput!.task.input.text, /discovery-aggregation\.json/);
		assert.match(capturedDownstreamInput!.task.input.text, /reddit 用户反馈摘要/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("direct Canvas Task run injects connected source node input into worker prompt and payload", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-source-input-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				inputPorts: [{ id: "source_text", label: "Source text", type: "string" }],
			},
		});
		const sourceNodeStore = new SourceNodeStore(join(root, "team"));
		const source = await sourceNodeStore.create({
			title: "需求说明",
			nodeType: "text",
			content: { text: "请优先使用这段画布文本。" },
		});
		const sourceConnectionStore = new SourceConnectionStore(join(root, "team"), sourceNodeStore, taskStore);
		const connection = await sourceConnectionStore.create({
			fromSourceNodeId: source.sourceNodeId,
			fromOutputPortId: "value",
			toTaskId: task.taskId,
			toInputPortId: "source_text",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedWorkerInput: WorkerInput | undefined;
		class CaptureSourceWorkerInputRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				capturedWorkerInput = input;
				return { content: "worker result", artifactRefs: [] };
			}
		}
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new CaptureSourceWorkerInputRunner(),
			sourceNodeStore,
			sourceConnectionStore,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(task.taskId, { includeSourceBindings: true });
		const boundInput = created.source?.boundInputs?.[0];
		assert.equal(boundInput?.source, "canvas-source");
		assert.equal(boundInput?.connectionId, connection.connectionId);
		assert.equal(boundInput?.inputPortId, "source_text");
		assert.equal(boundInput?.artifact.type, "string");
		assert.equal(boundInput?.artifact.sourceNodeId, source.sourceNodeId);
		assert.equal(boundInput?.artifact.sourceOutputPortId, "value");
		assert.equal(boundInput?.artifact.content, "请优先使用这段画布文本。");

		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		assert.ok(capturedWorkerInput, "worker input should have been captured");
		assert.match(capturedWorkerInput!.task.input.text, /画布 source node 输入/);
		assert.match(capturedWorkerInput!.task.input.text, new RegExp("sourceNodeId: " + source.sourceNodeId));
		assert.match(capturedWorkerInput!.task.input.text, /请优先使用这段画布文本。/);
		assert.doesNotMatch(capturedWorkerInput!.task.input.text, /sourceTaskId/);
		const payload = capturedWorkerInput!.task.input.payload as { boundInputs?: Array<{ source?: string; artifact: { sourceNodeId?: string } }> } | undefined;
		assert.equal(payload?.boundInputs?.[0]?.source, "canvas-source");
		assert.equal(payload?.boundInputs?.[0]?.artifact.sourceNodeId, source.sourceNodeId);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("direct Canvas Task run skips stale source node connection without invalid binding", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-source-stale-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				inputPorts: [{ id: "source_text", label: "Source text", type: "string" }],
			},
		});
		const sourceNodeStore = new SourceNodeStore(join(root, "team"));
		const source = await sourceNodeStore.create({
			title: "需求说明",
			nodeType: "text",
			content: { text: "stale input" },
		});
		const sourceConnectionStore = new SourceConnectionStore(join(root, "team"), sourceNodeStore, taskStore);
		await sourceConnectionStore.create({
			fromSourceNodeId: source.sourceNodeId,
			fromOutputPortId: "value",
			toTaskId: task.taskId,
			toInputPortId: "source_text",
		});
		await taskStore.update(task.taskId, {
			workUnit: {
				...task.workUnit,
				inputPorts: [{ id: "source_text", label: "HTML source", type: "html" }],
			},
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		let capturedWorkerInput: WorkerInput | undefined;
		class CaptureNoSourceWorkerInputRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				capturedWorkerInput = input;
				return { content: "worker result", artifactRefs: [] };
			}
		}
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new CaptureNoSourceWorkerInputRunner(),
			sourceNodeStore,
			sourceConnectionStore,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(task.taskId, { includeSourceBindings: true });
		assert.equal(created.source?.boundInputs, undefined);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		assert.ok(capturedWorkerInput);
		assert.equal(capturedWorkerInput!.task.input.payload, undefined);
		assert.doesNotMatch(capturedWorkerInput!.task.input.text, /stale input/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("source node connections do not auto-trigger task runs by themselves", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-source-no-autostart-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				inputPorts: [{ id: "source_text", label: "Source text", type: "string" }],
			},
		});
		const sourceNodeStore = new SourceNodeStore(join(root, "team"));
		const source = await sourceNodeStore.create({
			title: "需求说明",
			nodeType: "text",
			content: { text: "x" },
		});
		const sourceConnectionStore = new SourceConnectionStore(join(root, "team"), sourceNodeStore, taskStore);
		await sourceConnectionStore.create({
			fromSourceNodeId: source.sourceNodeId,
			fromOutputPortId: "value",
			toTaskId: task.taskId,
			toInputPortId: "source_text",
		});

		const service = new CanvasTaskRunService({
			taskStore,
			workspace: new RunWorkspace(join(root, "task-runs")),
			createRoleRunner: () => new ProcessEventRoleRunner(),
			sourceNodeStore,
			sourceConnectionStore,
			dataDir: join(root, "task-runs"),
		});
		await new Promise(resolve => setTimeout(resolve, 50));
		assert.deepEqual(await service.listRuns(task.taskId), []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("task output fan-out delivers same artifact to two downstream Tasks independently", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-fanout-delivery-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const targetB = await taskStore.create({
			title: "Target B",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "Target B",
				input: { text: "Process markdown B." },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "Output B." },
				acceptance: { rules: ["must include B"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});
		const targetC = await taskStore.create({
			title: "Target C",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "Target C",
				input: { text: "Process markdown C." },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "Output C." },
				acceptance: { rules: ["must include C"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connB = await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetB.taskId,
			toInputPortId: "source_md",
		});
		const connC = await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetC.taskId,
			toInputPortId: "source_md",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed");
		assert.equal(upstreamFinished.taskStates[sourceTask.taskId]?.status, "succeeded");

		const downstreamBRuns = await waitForTaskRuns(service, targetB.taskId, 1);
		const downstreamBFinished = await waitForTerminalRun(service, downstreamBRuns[0]!.runId);
		assert.equal(downstreamBFinished.status, "completed");
		assert.equal(downstreamBFinished.source?.triggeredBy?.type, "task-connection");
		assert.equal(downstreamBFinished.source?.triggeredBy?.fromTaskId, sourceTask.taskId);
		assert.equal(downstreamBFinished.source?.triggeredBy?.fromRunId, upstreamRun.runId);
		assert.equal(downstreamBFinished.source?.boundInputs?.length, 1);
		assert.equal(downstreamBFinished.source?.boundInputs?.[0]?.inputPortId, "source_md");
		assert.equal(downstreamBFinished.source?.boundInputs?.[0]?.artifact?.type, "md");
		assert.equal(downstreamBFinished.source?.boundInputs?.[0]?.connectionId, connB.connectionId);

		const downstreamCRuns = await waitForTaskRuns(service, targetC.taskId, 1);
		const downstreamCFinished = await waitForTerminalRun(service, downstreamCRuns[0]!.runId);
		assert.equal(downstreamCFinished.status, "completed");
		assert.equal(downstreamCFinished.source?.triggeredBy?.type, "task-connection");
		assert.equal(downstreamCFinished.source?.triggeredBy?.fromTaskId, sourceTask.taskId);
		assert.equal(downstreamCFinished.source?.triggeredBy?.fromRunId, upstreamRun.runId);
		assert.equal(downstreamCFinished.source?.boundInputs?.length, 1);
		assert.equal(downstreamCFinished.source?.boundInputs?.[0]?.inputPortId, "source_md");
		assert.equal(downstreamCFinished.source?.boundInputs?.[0]?.artifact?.type, "md");
		assert.equal(downstreamCFinished.source?.boundInputs?.[0]?.connectionId, connC.connectionId);

		const delivery = await waitForAttemptDelivery(workspace, upstreamRun.runId, sourceTask.taskId, 2);
		assert.equal(delivery.length, 2);
		const deliveryByConn = Object.fromEntries(delivery.map((d): [string, typeof d] => [(d as import('../src/team/types.js').TeamTaskTypedConnectionDeliveryOutcome).connectionId, d]));
		assert.equal(deliveryByConn[connB.connectionId]?.status, "delivered");
		assert.equal(deliveryByConn[connC.connectionId]?.status, "delivered");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("task output fan-out isolates downstream failure: B blocked by active run, C succeeds", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-fanout-isolation-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const sourceTask = await taskStore.create({
			...validTaskInput,
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const targetB = await taskStore.create({
			title: "Target B (blocked)",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "Target B",
				input: { text: "Process markdown B." },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "Output B." },
				acceptance: { rules: ["must include B"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});
		const targetC = await taskStore.create({
			title: "Target C",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "Target C",
				input: { text: "Process markdown C." },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputContract: { text: "Output C." },
				acceptance: { rules: ["must include C"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connB = await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetB.taskId,
			toInputPortId: "source_md",
		});
		const connC = await connectionStore.create({
			fromTaskId: sourceTask.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: targetC.taskId,
			toInputPortId: "source_md",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));

		let gatedWorkerStarted!: () => void;
		const gatedWorkerStartedPromise = new Promise<void>((resolve) => { gatedWorkerStarted = resolve; });
		let gatedWorkerProceed!: () => void;
		const gatedWorkerProceedPromise = new Promise<void>((resolve) => { gatedWorkerProceed = resolve; });

		class GatedDownstreamRunner implements TeamRoleRunner {
			async runWorker(_input: WorkerInput): Promise<WorkerOutput> {
				gatedWorkerStarted();
				await gatedWorkerProceedPromise;
				return { content: "gated worker", artifactRefs: [] };
			}
			async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
				return { verdict: "pass", reason: "ok", resultContent: "accepted" };
			}
			async runWatcher(_input: WatcherInput): Promise<WatcherOutput> {
				return { decision: "accept_task", reason: "ok" };
			}
			async runFinalizer(_input: FinalizerInput): Promise<FinalizerOutput> {
				return { finalReport: "ok" };
			}
			async runDecomposer(_input: DecomposerInput): Promise<DecomposerOutput> {
				return { decision: "no_split", reason: "ok", children: [] };
			}
		}

		let runnerCallCount = 0;
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => {
				runnerCallCount++;
				return runnerCallCount === 1 ? new GatedDownstreamRunner() : new ProcessEventRoleRunner();
			},
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		// Pre-create an active run on target B (gated, stays active)
		const preCreatedBRun = await service.createRun(targetB.taskId);
		await gatedWorkerStartedPromise;

		// Run source task; B delivery should fail but C should succeed
		const upstreamRun = await service.createRun(sourceTask.taskId);
		const upstreamFinished = await waitForTerminalRun(service, upstreamRun.runId);
		assert.equal(upstreamFinished.status, "completed", "upstream must remain completed");
		assert.equal(upstreamFinished.taskStates[sourceTask.taskId]?.status, "succeeded");

		// Target C should have a completed downstream run
		const downstreamCRuns = await waitForTaskRuns(service, targetC.taskId, 1);
		const downstreamCFinished = await waitForTerminalRun(service, downstreamCRuns[0]!.runId);
		assert.equal(downstreamCFinished.status, "completed");
		assert.equal(downstreamCFinished.source?.triggeredBy?.fromTaskId, sourceTask.taskId);
		assert.equal(downstreamCFinished.source?.boundInputs?.[0]?.connectionId, connC.connectionId);

		// Delivery outcomes: B failed, C delivered
		const delivery = await waitForAttemptDelivery(workspace, upstreamRun.runId, sourceTask.taskId, 2);
		assert.equal(delivery.length, 2);
		const deliveryByConn = Object.fromEntries(delivery.map((d): [string, typeof d] => [(d as import('../src/team/types.js').TeamTaskTypedConnectionDeliveryOutcome).connectionId, d]));
		assert.equal(deliveryByConn[connB.connectionId]?.status, "failed");
		assert.match(deliveryByConn[connB.connectionId]?.error ?? "", /active task run already exists/);
		assert.equal(deliveryByConn[connC.connectionId]?.status, "delivered");

		// Release gated B worker for cleanup
		gatedWorkerProceed();
		await waitForTerminalRun(service, preCreatedBRun.runId);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

// ── Control dependency downstream trigger ──

test("control dependency triggers downstream Task when both Tasks have no ports", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dep-trigger-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const connectionStore = new TaskConnectionStore(root, taskStore);
		const dependencyStore = new TaskDependencyStore(root, taskStore);
		connectionStore.setExistingDependencies(() => dependencyStore.list());
		dependencyStore.setExistingConnections(() => connectionStore.list());
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			connectionStore,
			dependencyStore,
			dataDir: join(root, "task-runs"),
		});

		const taskA = await taskStore.create(validTaskInput);
		const taskB = await taskStore.create({ ...validTaskInput, title: "下游任务" });
		await dependencyStore.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });

		const runA = await service.createRun(taskA.taskId);
		const finishedA = await waitForTerminalRun(service, runA.runId);
		assert.equal(finishedA.status, "completed");

		const runsB = await waitForTaskRuns(service, taskB.taskId);
		assert.equal(runsB.length, 1);
		const finishedB = await waitForTerminalRun(service, runsB[0]!.runId);
		assert.equal(finishedB.status, "completed");

		assert.ok(finishedB.source?.triggeredBy);
		const triggeredBy = finishedB.source!.triggeredBy!;
		assert.equal(triggeredBy.type, "task-dependency");
		if (triggeredBy.type === "task-dependency") {
			assert.equal(triggeredBy.fromTaskId, taskA.taskId);
			assert.equal(triggeredBy.fromRunId, runA.runId);
		}
		assert.equal(finishedB.source?.boundInputs, undefined);
	} finally {
		await rm(root, { recursive: true, force: true }).catch(() => {});
	}
});

test("control dependency downstream run has no boundInputs", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dep-nobound-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const dependencyStore = new TaskDependencyStore(root, taskStore);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			dependencyStore,
			dataDir: join(root, "task-runs"),
		});

		const taskA = await taskStore.create(validTaskInput);
		const taskB = await taskStore.create({ ...validTaskInput, title: "下游" });
		await dependencyStore.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });

		const runA = await service.createRun(taskA.taskId);
		await waitForTerminalRun(service, runA.runId);

		const runsB = await waitForTaskRuns(service, taskB.taskId);
		const finishedB = await waitForTerminalRun(service, runsB[0]!.runId);
		assert.equal(finishedB.status, "completed");
		assert.equal(finishedB.source?.boundInputs, undefined);
	} finally {
		await rm(root, { recursive: true, force: true }).catch(() => {});
	}
});

test("upstream failed run does not trigger dependency downstream", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dep-nofail-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const dependencyStore = new TaskDependencyStore(root, taskStore);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const failRunner: TeamRoleRunner = {
			async runWorker() { return { content: "fail output", artifactRefs: [], runtimeContext: undefined }; },
			async runChecker() { return { verdict: "fail", reason: "not good enough", runtimeContext: undefined }; },
			async runWatcher() { return { decision: "accept_task" as const, reason: "", runtimeContext: undefined }; },
			async runFinalizer() { return { finalReport: "done", runtimeContext: undefined }; },
			async runDecomposer() { return { decision: "no_split" as const, reason: "", subtasks: [], runtimeContext: undefined }; },
		};
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => failRunner,
			dependencyStore,
			dataDir: join(root, "task-runs"),
		});

		const taskA = await taskStore.create(validTaskInput);
		const taskB = await taskStore.create({ ...validTaskInput, title: "下游" });
		await dependencyStore.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });

		const runA = await service.createRun(taskA.taskId);
		const finishedA = await waitForTerminalRun(service, runA.runId);
		assert.equal(finishedA.status, "completed_with_failures");

		const runsB = await service.listRuns(taskB.taskId);
		assert.equal(runsB.length, 0, "downstream should not be triggered when upstream fails");
	} finally {
		await rm(root, { recursive: true, force: true }).catch(() => {});
	}
});

test("stale dependency records skipped outcome without failing upstream", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dep-stale-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const dependencyStore = new TaskDependencyStore(root, taskStore);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			dependencyStore,
			dataDir: join(root, "task-runs"),
		});

		const taskA = await taskStore.create(validTaskInput);
		const taskB = await taskStore.create({ ...validTaskInput, title: "下游" });
		await dependencyStore.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });

		// Archive target between dep creation and run completion
		await taskStore.archive(taskB.taskId);

		const runA = await service.createRun(taskA.taskId);
		const finishedA = await waitForTerminalRun(service, runA.runId);
		assert.equal(finishedA.status, "completed", "upstream should succeed even if dependency target is stale");

		const delivery = await waitForAttemptDelivery(workspace, runA.runId, taskA.taskId);
		assert.equal(delivery.length, 1);
		const depOutcome = delivery[0] as import("../src/team/types.js").TeamTaskControlDependencyDeliveryOutcome;
		assert.equal(depOutcome.edgeKind, "control-dependency");
		assert.equal(depOutcome.status, "skipped");
		assert.equal(depOutcome.staleReason, "target_task_archived");
	} finally {
		await rm(root, { recursive: true, force: true }).catch(() => {});
	}
});

test("dependency fan-out triggers multiple independent downstream Tasks", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-dep-fanout-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const dependencyStore = new TaskDependencyStore(root, taskStore);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			dependencyStore,
			dataDir: join(root, "task-runs"),
		});

		const taskA = await taskStore.create(validTaskInput);
		const taskB = await taskStore.create({ ...validTaskInput, title: "B" });
		const taskC = await taskStore.create({ ...validTaskInput, title: "C" });
		await dependencyStore.create({ fromTaskId: taskA.taskId, toTaskId: taskB.taskId });
		await dependencyStore.create({ fromTaskId: taskA.taskId, toTaskId: taskC.taskId });

		const runA = await service.createRun(taskA.taskId);
		await waitForTerminalRun(service, runA.runId);

		const runsB = await waitForTaskRuns(service, taskB.taskId);
		const runsC = await waitForTaskRuns(service, taskC.taskId);
		const finishedB = await waitForTerminalRun(service, runsB[0]!.runId);
		const finishedC = await waitForTerminalRun(service, runsC[0]!.runId);
		assert.equal(finishedB.status, "completed");
		assert.equal(finishedC.status, "completed");
		assert.equal(finishedB.source?.triggeredBy?.type, "task-dependency");
		assert.equal(finishedC.source?.triggeredBy?.type, "task-dependency");
	} finally {
		await rm(root, { recursive: true, force: true }).catch(() => {});
	}
});

test("upstream run selection: B receives selected historical A run artifact, not latest A run", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-upstream-selection-"));
	let service: CanvasTaskRunService | undefined;
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const taskA = await taskStore.create({
			...validTaskInput,
			title: "Task A - collect",
			workUnit: {
				...validTaskInput.workUnit,
				title: "Task A",
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const taskB = await taskStore.create({
			...validTaskInput,
			title: "Task B - transform",
			workUnit: {
				...validTaskInput.workUnit,
				title: "Task B",
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
				outputPorts: [{ id: "page_html", label: "HTML", type: "html" }],
			},
		});
		const taskC = await taskStore.create({
			...validTaskInput,
			title: "Task C - publish",
			workUnit: {
				...validTaskInput.workUnit,
				title: "Task C",
				inputPorts: [{ id: "input_html", label: "HTML", type: "html" }],
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const depStore = new TaskDependencyStore(join(root, "team"), taskStore);
		connectionStore.setExistingDependencies(() => depStore.list());
		depStore.setExistingConnections(() => connectionStore.list());
		const connAtoB = await connectionStore.create({
			fromTaskId: taskA.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: taskB.taskId,
			toInputPortId: "source_md",
		});
		await connectionStore.create({
			fromTaskId: taskB.taskId,
			fromOutputPortId: "page_html",
			toTaskId: taskC.taskId,
			toInputPortId: "input_html",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));

		let workerRunCount = 0;
		let lastWorkerContent = "";
		class VersionedResultRunner extends ProcessEventRoleRunner {
			async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
				workerRunCount++;
				if (input.task.id === taskA.taskId) {
					const version = workerRunCount === 1 ? "A result v1" : "A result v2";
					lastWorkerContent = version;
					return { content: version, artifactRefs: [] };
				}
				return { content: "result for " + input.task.id, artifactRefs: [] };
			}
			async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
				return { verdict: "pass", reason: "ok", resultContent: lastWorkerContent };
			}
		}

		service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new VersionedResultRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const firstRunA = await service.createRun(taskA.taskId);
		const firstFinishedA = await waitForTerminalRun(service, firstRunA.runId);
		assert.equal(firstFinishedA.status, "completed");

		const downstreamOfFirstA = await waitForTaskRuns(service, taskB.taskId, 1);
		await waitForTerminalRun(service, downstreamOfFirstA[0]!.runId).catch(() => {});
		const downstreamOfFirstB = await waitForTaskRuns(service, taskC.taskId, 1);
		await waitForTerminalRun(service, downstreamOfFirstB[0]!.runId).catch(() => {});

		const secondRunA = await service.createRun(taskA.taskId);
		const secondFinishedA = await waitForTerminalRun(service, secondRunA.runId);
		assert.equal(secondFinishedA.status, "completed");

		const downstreamOfSecondA = await waitForTaskRuns(service, taskB.taskId, 2);
		await waitForTerminalRun(service, downstreamOfSecondA[1]!.runId).catch(() => {});
		const downstreamOfSecondB = await waitForTaskRuns(service, taskC.taskId, 2);
		await waitForTerminalRun(service, downstreamOfSecondB[1]!.runId).catch(() => {});

		const runBFromSelectedA = await service.createRun(taskB.taskId, {
			upstreamRunSelections: [{ connectionId: connAtoB.connectionId, fromRunId: firstRunA.runId }],
		});
		const finishedB = await waitForTerminalRun(service, runBFromSelectedA.runId);
		assert.equal(finishedB.status, "completed");

		assert.equal(finishedB.source?.boundInputs?.length, 1);
		const boundInput = finishedB.source!.boundInputs![0]!;
		assert.equal(boundInput.connectionId, connAtoB.connectionId);
		assert.equal(boundInput.inputPortId, "source_md");
		const artifact = boundInput.artifact as import("../src/team/types.js").TeamTaskTypedArtifact;
		assert.equal(artifact.sourceTaskId, taskA.taskId);
		assert.equal(artifact.sourceRunId, firstRunA.runId, "B must use A first run, not second");
		assert.match(artifact.content ?? "", /A result v1/, "B artifact must contain A result v1");
		assert.doesNotMatch(artifact.content ?? "", /A result v2/, "B artifact must NOT contain A result v2");

		assert.equal(finishedB.source?.triggeredBy, undefined, "manually started B must not have triggeredBy");

		assert.equal(finishedB.source?.manualUpstreamSelections?.length, 1);
		const manualSelection = finishedB.source!.manualUpstreamSelections![0]!;
		assert.equal(manualSelection.connectionId, connAtoB.connectionId);
		assert.equal(manualSelection.fromTaskId, taskA.taskId);
		assert.equal(manualSelection.fromRunId, firstRunA.runId);
		assert.equal(manualSelection.toInputPortId, "source_md");

		const planFile = await workspace.readRunScopedFile(runBFromSelectedA.runId, "plan.json");
		assert.ok(planFile);
		assert.match(planFile, /A result v1/);
		assert.doesNotMatch(planFile, /A result v2/);

		const runCFromNewB = await waitForTaskRuns(service, taskC.taskId, 3);
		const triggeredCFromManualB = runCFromNewB.find(run => run.source?.triggeredBy?.fromRunId === runBFromSelectedA.runId);
		assert.ok(triggeredCFromManualB, "C must be triggered from the manual B run");
		const finishedC = await waitForTerminalRun(service, triggeredCFromManualB.runId);
		assert.equal(finishedC.status, "completed");
		assert.equal(finishedC.source?.triggeredBy?.type, "task-connection");
		assert.equal(finishedC.source?.triggeredBy?.fromTaskId, taskB.taskId);
		assert.equal(finishedC.source?.triggeredBy?.fromRunId, runBFromSelectedA.runId);
	} finally {
		await removeTempRoot(root);
	}
});

test("upstream run selection: service rejects connection that does not target requested task", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-upstream-selection-wrong-target-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const taskA = await taskStore.create({
			...validTaskInput,
			title: "Task A",
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const taskB = await taskStore.create({
			...validTaskInput,
			title: "Task B",
			workUnit: {
				...validTaskInput.workUnit,
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			},
		});
		const taskC = await taskStore.create({
			...validTaskInput,
			title: "Task C",
			workUnit: {
				...validTaskInput.workUnit,
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connAtoB = await connectionStore.create({
			fromTaskId: taskA.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: taskB.taskId,
			toInputPortId: "source_md",
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const serviceWithoutConnections = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			dataDir: join(root, "task-runs"),
		});
		const runA = await serviceWithoutConnections.createRun(taskA.taskId);
		await waitForTerminalRun(serviceWithoutConnections, runA.runId);

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});
		await assert.rejects(
			() => service.createRun(taskC.taskId, {
				upstreamRunSelections: [{ connectionId: connAtoB.connectionId, fromRunId: runA.runId }],
			}),
			/does not target task/,
		);
	} finally {
		await removeTempRoot(root);
	}
});

test("upstream run selection: service rejects stale selected connection", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-upstream-selection-stale-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const taskA = await taskStore.create({
			...validTaskInput,
			title: "Task A",
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const taskB = await taskStore.create({
			...validTaskInput,
			title: "Task B",
			workUnit: {
				...validTaskInput.workUnit,
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connAtoB = await connectionStore.create({
			fromTaskId: taskA.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: taskB.taskId,
			toInputPortId: "source_md",
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const serviceWithoutConnections = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			dataDir: join(root, "task-runs"),
		});
		const runA = await serviceWithoutConnections.createRun(taskA.taskId);
		await waitForTerminalRun(serviceWithoutConnections, runA.runId);

		await taskStore.update(taskB.taskId, {
			workUnit: {
				...taskB.workUnit,
				inputPorts: [{ id: "source_md", label: "HTML", type: "html" }],
			},
		});

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});
		await assert.rejects(
			() => service.createRun(taskB.taskId, {
				upstreamRunSelections: [{ connectionId: connAtoB.connectionId, fromRunId: runA.runId }],
			}),
			/stale: target_input_port_type_mismatch/,
		);
	} finally {
		await removeTempRoot(root);
	}
});

test("upstream run selection: service rejects duplicate selected connection", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-upstream-selection-duplicate-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const taskA = await taskStore.create({
			...validTaskInput,
			title: "Task A",
			workUnit: {
				...validTaskInput.workUnit,
				outputPorts: [{ id: "draft_md", label: "Markdown", type: "md" }],
			},
		});
		const taskB = await taskStore.create({
			...validTaskInput,
			title: "Task B",
			workUnit: {
				...validTaskInput.workUnit,
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connAtoB = await connectionStore.create({
			fromTaskId: taskA.taskId,
			fromOutputPortId: "draft_md",
			toTaskId: taskB.taskId,
			toInputPortId: "source_md",
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new ProcessEventRoleRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		await assert.rejects(
			() => service.createRun(taskB.taskId, {
				upstreamRunSelections: [
					{ connectionId: connAtoB.connectionId, fromRunId: "run_first" },
					{ connectionId: connAtoB.connectionId, fromRunId: "run_second" },
				],
			}),
			new RegExp("duplicate upstreamRunSelections connectionId: " + connAtoB.connectionId),
		);
	} finally {
		await removeTempRoot(root);
	}
});

test("upstream run selection: old asset name does not appear in bound input", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-upstream-selection-old-asset-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const taskA = await taskStore.create({
			...validTaskInput,
			title: "Upstream A",
			workUnit: {
				...validTaskInput.workUnit,
				title: "Upstream A",
				outputPorts: [{ id: "report_md", label: "Report", type: "md" }],
			},
		});
		const taskB = await taskStore.create({
			...validTaskInput,
			title: "Downstream B",
			workUnit: {
				...validTaskInput.workUnit,
				title: "Downstream B",
				input: { text: "旧的 biospace-diabetes-news.json 可能存在，不要使用它。只需要处理上游输入。" },
				inputPorts: [{ id: "source_md", label: "Markdown", type: "md" }],
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const depStore = new TaskDependencyStore(join(root, "team"), taskStore);
		connectionStore.setExistingDependencies(() => depStore.list());
		depStore.setExistingConnections(() => connectionStore.list());
		const connAtoB = await connectionStore.create({
			fromTaskId: taskA.taskId,
			fromOutputPortId: "report_md",
			toTaskId: taskB.taskId,
			toInputPortId: "source_md",
		});

		const workspace = new RunWorkspace(join(root, "task-runs"));
		const capturedBInputs = new Map<string, WorkerInput>();

		class FixedContentRunner extends ProcessEventRoleRunner {
			private lastWorkerContent = "";
			async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
				if (input.task.id === taskA.taskId) {
					this.lastWorkerContent = "正确的上游结果数据";
					return { content: this.lastWorkerContent, artifactRefs: [] };
				}
				if (input.task.id === taskB.taskId) {
					capturedBInputs.set(input.runId, input);
				}
				this.lastWorkerContent = "B result";
				return { content: this.lastWorkerContent, artifactRefs: [] };
			}
			async runChecker(): Promise<CheckerOutput> {
				return { verdict: "pass", reason: "ok", resultContent: this.lastWorkerContent };
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new FixedContentRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const runA = await service.createRun(taskA.taskId);
		await waitForTerminalRun(service, runA.runId);
		const autoBRuns = await waitForTaskRuns(service, taskB.taskId, 1);
		const autoBFromA = autoBRuns.find(run => run.source?.triggeredBy?.fromRunId === runA.runId);
		assert.ok(autoBFromA, "automatic B run should be triggered before manual B starts");
		await waitForTerminalRun(service, autoBFromA.runId);

		const runB = await service.createRun(taskB.taskId, {
			upstreamRunSelections: [{ connectionId: connAtoB.connectionId, fromRunId: runA.runId }],
		});
		const finishedB = await waitForTerminalRun(service, runB.runId);
		assert.equal(finishedB.status, "completed");

		const capturedBWorkerInput = capturedBInputs.get(runB.runId);
		assert.ok(capturedBWorkerInput, "B worker input should be captured");
		const payload = capturedBWorkerInput.task.input.payload as { boundInputs?: Array<{ artifact: { content?: string; preview: string } }> } | undefined;
		const selectedArtifact = payload?.boundInputs?.[0]?.artifact;
		assert.ok(selectedArtifact, "B worker payload must include selected bound artifact");
		assert.match(selectedArtifact.content ?? selectedArtifact.preview, /正确的上游结果数据/);
		assert.doesNotMatch(selectedArtifact.content ?? selectedArtifact.preview, /biospace-diabetes-news\.json/);
		assert.match(capturedBWorkerInput.task.input.text, /正确的上游结果数据/);
		assert.match(capturedBWorkerInput.task.input.text, /不要从旧资产/);

		const planFile = await workspace.readRunScopedFile(runB.runId, "plan.json");
		assert.ok(planFile);
		assert.match(planFile, /正确的上游结果数据/);
		assert.match(planFile, /BEGIN_TYPED_ARTIFACT_PREVIEW/);
		assert.match(planFile, /不要从旧资产/);
	} finally {
		await removeTempRoot(root);
	}
});

test("upstream run selection: Discovery historical run uses selected aggregation", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-upstream-selection-discovery-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discoveryTask = await taskStore.create({
			...validTaskInput,
			title: "Discovery A",
			canvasKind: "discovery",
			discoverySpec: validDiscoverySpec,
			workUnit: {
				...validTaskInput.workUnit,
				title: "Discovery A",
				input: { text: "发现来源并输出 JSON。" },
				outputPorts: [{ id: "sources_json", label: "Sources", type: "json" }],
				outputContract: { text: "输出 JSON object，vendors 为数组。" },
				acceptance: { rules: ["vendors 必须是数组"] },
			},
		});
		const taskB = await taskStore.create({
			...validTaskInput,
			title: "Task B",
			workUnit: {
				...validTaskInput.workUnit,
				title: "Task B",
				input: { text: "使用 Discovery JSON 制作报告。" },
				inputPorts: [{ id: "source_json", label: "Source JSON", type: "json" }],
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connAtoB = await connectionStore.create({
			fromTaskId: discoveryTask.taskId,
			fromOutputPortId: "sources_json",
			toTaskId: taskB.taskId,
			toInputPortId: "source_json",
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const capturedBInputs = new Map<string, WorkerInput>();
		let discoveryRunCount = 0;

		class VersionedDiscoveryRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				if (input.task.id === taskB.taskId) {
					capturedBInputs.set(input.runId, input);
					return { content: "B result", artifactRefs: [] };
				}
				if (input.task.type === "discovery") {
					return { content: "discovery worker result", artifactRefs: [] };
				}
				return { content: `generated worker result for ${input.task.title}`, artifactRefs: [] };
			}

			async runChecker(input: CheckerInput): Promise<CheckerOutput> {
				if (input.task.type === "discovery") {
					discoveryRunCount++;
					const selected = discoveryRunCount === 1;
					return {
						verdict: "pass",
						reason: "ok",
						resultContent: JSON.stringify({
							vendors: [{
								id: selected ? "first_item" : "second_item",
								name: selected ? "FIRST_DISCOVERY_SELECTED" : "SECOND_DISCOVERY_LATEST",
							}],
						}),
					};
				}
				if (input.task.title.includes("first_item")) {
					return { verdict: "pass", reason: "ok", resultContent: "FIRST_DISCOVERY_SELECTED generated result" };
				}
				if (input.task.title.includes("second_item")) {
					return { verdict: "pass", reason: "ok", resultContent: "SECOND_DISCOVERY_LATEST generated result" };
				}
				return { verdict: "pass", reason: "ok", resultContent: "accepted " + input.task.id };
			}

			async runDiscoveryDispatcher(input: DiscoveryDispatchInput): Promise<DiscoveryDispatchOutput> {
				return {
					ok: true,
					itemId: input.itemId,
					workUnit: {
						title: `核查 ${input.itemId}`,
						input: { text: `核查 ${input.itemId}` },
						outputContract: { text: `输出 ${input.itemId} 的核查报告。` },
						acceptance: { rules: [`报告必须覆盖 ${input.itemId}`] },
					},
				};
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new VersionedDiscoveryRunner(),
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		const firstRunA = await service.createRun(discoveryTask.taskId);
		await waitForTerminalRun(service, firstRunA.runId);
		const firstAutoBRuns = await waitForTaskRuns(service, taskB.taskId, 1);
		const firstAutoB = firstAutoBRuns.find(run => run.source?.triggeredBy?.fromRunId === firstRunA.runId);
		assert.ok(firstAutoB, "first Discovery run should trigger B");
		await waitForTerminalRun(service, firstAutoB.runId);

		const secondRunA = await service.createRun(discoveryTask.taskId);
		await waitForTerminalRun(service, secondRunA.runId);
		const secondAutoBRuns = await waitForTaskRuns(service, taskB.taskId, 2);
		const secondAutoB = secondAutoBRuns.find(run => run.source?.triggeredBy?.fromRunId === secondRunA.runId);
		assert.ok(secondAutoB, "second Discovery run should trigger B");
		await waitForTerminalRun(service, secondAutoB.runId);

		const firstAttempts = await workspace.listAttempts(firstRunA.runId, discoveryTask.taskId);
		const firstAttempt = firstAttempts[0]!;
		const manualRunB = await service.createRun(taskB.taskId, {
			upstreamRunSelections: [{ connectionId: connAtoB.connectionId, fromRunId: firstRunA.runId }],
		});
		const finishedB = await waitForTerminalRun(service, manualRunB.runId);
		assert.equal(finishedB.status, "completed");

		const capturedBInput = capturedBInputs.get(manualRunB.runId);
		assert.ok(capturedBInput, "manual B worker input should be captured");
		const payload = capturedBInput!.task.input.payload as { boundInputs?: Array<{ artifact: { fileRef: string; content?: string; preview: string } }> } | undefined;
		const artifact = payload?.boundInputs?.[0]?.artifact;
		assert.ok(artifact, "manual B payload must include selected Discovery artifact");
		assert.equal(artifact.fileRef, `tasks/${discoveryTask.taskId}/attempts/${firstAttempt.attemptId}/discovery-aggregation.json`);
		const aggregation = JSON.parse(artifact.content ?? artifact.preview);
		assert.equal(aggregation.schemaVersion, "team/discovery-aggregation-1");
		assert.equal(aggregation.discoveryRunId, firstRunA.runId);
		assert.match(artifact.content ?? "", /FIRST_DISCOVERY_SELECTED/);
		assert.doesNotMatch(artifact.content ?? "", /SECOND_DISCOVERY_LATEST/);
	} finally {
		await removeTempRoot(root);
	}
});
