import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "../src/team/task-store.js";
import { TaskConnectionStore } from "../src/team/task-connection-store.js";
import { RunWorkspace } from "../src/team/run-workspace.js";
import { CanvasTaskRunService } from "../src/team/task-run-service.js";
import type {
	CheckerInput,
	CheckerOutput,
	DecomposerInput,
	DecomposerOutput,
	FinalizerInput,
	FinalizerOutput,
	TeamRoleRunner,
	WatcherInput,
	WatcherOutput,
	WorkerInput,
	WorkerOutput,
} from "../src/team/role-runner.js";
import type { RawAgentSessionEventLike } from "../src/agent/agent-session-factory.js";
import type { TeamRunState } from "../src/team/types.js";

type ProcessAwareWorkerInput = WorkerInput & { onSessionEvent?: (event: RawAgentSessionEventLike) => void };
type ProcessAwareCheckerInput = CheckerInput & { onSessionEvent?: (event: RawAgentSessionEventLike) => void };

const validTaskInput = {
	title: "获取 GitHub 热榜前 10 名",
	leaderAgentId: "main",
	status: "ready" as const,
	workUnit: {
		title: "获取 GitHub 热榜前 10 名",
		input: { text: "搜索并整理 GitHub 当前热门仓库前 10 名。" },
		outputContract: { text: "输出中文 Markdown 列表，包含仓库名、链接和简短理由。" },
		acceptance: { rules: ["必须包含 10 个条目", "每个条目必须包含链接"] },
		workerAgentId: "search",
		checkerAgentId: "main",
	},
};

async function waitForTerminalRun(service: CanvasTaskRunService, runId: string): Promise<TeamRunState> {
	const terminal = new Set(["completed", "completed_with_failures", "failed", "cancelled"]);
	for (let i = 0; i < 40; i++) {
		const state = await service.getRun(runId);
		assert.ok(state);
		if (terminal.has(state.status)) return state;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`task run did not reach terminal state: ${runId}`);
}

async function waitForTaskRuns(service: CanvasTaskRunService, taskId: string, expectedLength = 1): Promise<TeamRunState[]> {
	for (let i = 0; i < 40; i++) {
		const runs = await service.listRuns(taskId);
		if (runs.length >= expectedLength) return runs;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error("task did not reach expected run count");
}

async function waitForAttemptDelivery(workspace: RunWorkspace, runId: string, taskId: string, expectedLength = 1): Promise<import("../src/team/types.js").TeamTaskDeliveryOutcome[]> {
	for (let i = 0; i < 80; i++) {
		const attempts = await workspace.listAttempts(runId, taskId);
		const delivery = (attempts[0] as { downstreamDelivery?: import("../src/team/types.js").TeamTaskDeliveryOutcome[] } | undefined)?.downstreamDelivery;
		if (delivery && delivery.length >= expectedLength) return delivery;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`attempt delivery outcomes did not reach length ${expectedLength} for run ${runId} task ${taskId}`);
}

class ProcessEventRoleRunner implements TeamRoleRunner {
	async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
		input.onSessionEvent?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "用户正在询问 GitHub 热榜。" } });
		input.onSessionEvent?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "我先搜索并整理仓库。" } });
		input.onSessionEvent?.({
			type: "tool_execution_start",
			toolCallId: "worker_tool_1",
			toolName: "x-search",
			args: { q: "github trending" },
		});
		input.onSessionEvent?.({
			type: "tool_execution_update",
			toolCallId: "worker_tool_1",
			toolName: "x-search",
			partialResult: "w".repeat(9000),
		});
		input.onSessionEvent?.({
			type: "tool_execution_end",
			toolCallId: "worker_tool_1",
			toolName: "x-search",
			result: "found repositories",
			isError: false,
		});
		input.onSessionEvent?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "worker done" } });
		return { content: "worker result", artifactRefs: [] };
	}

	async runChecker(input: ProcessAwareCheckerInput): Promise<CheckerOutput> {
		input.onSessionEvent?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "我在核对条目数量。" } });
		input.onSessionEvent?.({
			type: "tool_execution_start",
			toolCallId: "checker_tool_1",
			toolName: "read-file",
			args: { path: input.workerOutputRef },
		});
		input.onSessionEvent?.({
			type: "tool_execution_end",
			toolCallId: "checker_tool_1",
			toolName: "read-file",
			result: "checked",
			isError: false,
		});
		input.onSessionEvent?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "验收通过。" } });
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

class CancellableWorkerRoleRunner extends ProcessEventRoleRunner {
	async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
		input.onSessionEvent?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "取消前文本。" } });
		input.onSessionEvent?.({
			type: "tool_execution_start",
			toolCallId: "worker_tool_cancel",
			toolName: "long-task",
			args: { action: "wait" },
		});
		await new Promise<never>((_resolve, reject) => {
			if (input.signal?.aborted) {
				reject(new Error("aborted"));
				return;
			}
			input.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
		});
		throw new Error("unreachable");
	}
}

class LateEventAfterCancelRoleRunner extends ProcessEventRoleRunner {
	private workerSessionEvent: ((event: RawAgentSessionEventLike) => void) | undefined;
	private lateEventSentResolve!: () => void;
	readonly lateEventSent = new Promise<void>((resolve) => {
		this.lateEventSentResolve = resolve;
	});

	async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
		this.workerSessionEvent = input.onSessionEvent;
		input.onSessionEvent?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "取消前文本。" } });
		input.onSessionEvent?.({
			type: "tool_execution_start",
			toolCallId: "worker_tool_cancel",
			toolName: "long-task",
			args: { action: "wait" },
		});
		await new Promise<never>((_resolve, reject) => {
			if (input.signal?.aborted) {
				reject(new Error("aborted"));
				return;
			}
			input.signal?.addEventListener("abort", () => {
				setTimeout(() => {
					this.workerSessionEvent?.({
						type: "message_update",
						assistantMessageEvent: { type: "text_delta", delta: "取消后的迟到文本不应出现。" },
					});
					this.workerSessionEvent?.({
						type: "tool_execution_start",
						toolCallId: "late_after_cancel",
						toolName: "late-tool",
						args: { shouldNotOverwriteTerminalProcess: true },
					});
					this.lateEventSentResolve();
				}, 10);
				reject(new Error("aborted"));
			}, { once: true });
		});
		throw new Error("unreachable");
	}
}

async function waitForWorkerProcess(workspace: RunWorkspace, runId: string, taskId: string) {
	for (let i = 0; i < 40; i++) {
		const attempts = await workspace.listAttempts(runId, taskId);
		const worker = attempts[0]?.roleProcesses?.worker;
		if (worker) return worker;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error("worker process did not appear");
}

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
		const runningWorker = await waitForWorkerProcess(workspace, created.runId, task.taskId);
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
		const runningWorker = await waitForWorkerProcess(workspace, created.runId, task.taskId);
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
		assert.equal(delivery[0]!.connectionId, connection.connectionId);
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

		const boundInputPayload = capturedWorkerInput!.task.input.payload as { boundInputs?: Array<{ artifact: { artifactId: string } }> } | undefined;
		const artifactId = boundInputPayload!.boundInputs![0]!.artifact.artifactId;
		assert.match(inputText, new RegExp("artifactId: " + artifactId));
		assert.match(inputText, new RegExp("sourceTaskId: " + sourceTask.taskId));
		assert.match(inputText, new RegExp("sourceRunId: " + upstreamRun.runId));
		assert.match(inputText, new RegExp("sourceAttemptId: " + upstreamAttemptId));
		assert.match(inputText, /sourceOutputPortId: draft_md/);
		assert.match(inputText, /fileRef:/);
		assert.match(inputText, new RegExp("BEGIN_TYPED_ARTIFACT_CONTENT " + artifactId));
		assert.match(inputText, new RegExp("END_TYPED_ARTIFACT_CONTENT " + artifactId));
		assert.match(inputText, /accepted result/);

		const payload = capturedWorkerInput!.task.input.payload as { boundInputs?: Array<{ inputPortId: string }> } | undefined;
		assert.ok(payload?.boundInputs, "payload should contain boundInputs");
		assert.equal(payload!.boundInputs!.length, 1);
		assert.equal(payload!.boundInputs![0]!.inputPortId, "source_md");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
