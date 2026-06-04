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
	ProfileAwareTeamRoleRunner,
	TeamRoleRunner,
	WatcherInput,
	WatcherOutput,
	WorkerInput,
	WorkerOutput,
} from "../src/team/role-runner.js";
import type { RawAgentSessionEventLike } from "../src/agent/agent-session-factory.js";
import type { TeamDiscoveryDispatchOutcome, TeamDiscoveryGeneratedRunOutcome, TeamRunState } from "../src/team/types.js";

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

const validDiscoverySpec = {
	schemaVersion: "team/discovery-spec-1" as const,
	discoveryGoal: "发现可用云服务器供应商。",
	outputKey: "vendors",
	itemIdField: "id" as const,
	requiredItemFields: ["id"],
	recommendedItemFields: ["name", "type"],
	dispatchGoal: "逐项核查供应商可用性和价格。",
	dispatcherAgentId: "main",
	generatedWorkerAgentId: "search",
	generatedCheckerAgentId: "main",
	autoRun: { enabled: true as const, concurrency: 3 as const },
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

async function waitForAttemptDiscoveryDispatch(workspace: RunWorkspace, runId: string, taskId: string, expectedLength = 1): Promise<TeamDiscoveryDispatchOutcome[]> {
	for (let i = 0; i < 80; i++) {
		const attempts = await workspace.listAttempts(runId, taskId);
		const dispatch = attempts[0]?.discoveryDispatch;
		if (dispatch && dispatch.length >= expectedLength) return dispatch;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`attempt discovery dispatch outcomes did not reach length ${expectedLength} for run ${runId} task ${taskId}`);
}

async function waitForAttemptDiscoveryGeneratedRuns(workspace: RunWorkspace, runId: string, taskId: string, expectedLength = 1): Promise<TeamDiscoveryGeneratedRunOutcome[]> {
	for (let i = 0; i < 200; i++) {
		const attempts = await workspace.listAttempts(runId, taskId);
		const launches = attempts[0]?.discoveryGeneratedRuns;
		if (launches && launches.length >= expectedLength) return launches;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`attempt discovery generated run outcomes did not reach length ${expectedLength} for run ${runId} task ${taskId}`);
}

async function waitForGeneratedWorkerStarts(runner: { generatedWorkerStarts: string[] }, expectedLength: number): Promise<void> {
	for (let i = 0; i < 80; i++) {
		if (runner.generatedWorkerStarts.length >= expectedLength) return;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`generated workers did not reach start count ${expectedLength}`);
}

async function waitForDispatchInputs(runner: { dispatchInputs: DiscoveryDispatchInput[] }, expectedLength: number): Promise<void> {
	for (let i = 0; i < 80; i++) {
		if (runner.dispatchInputs.length >= expectedLength) return;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`dispatcher inputs did not reach count ${expectedLength}`);
}

function createDeferred(): { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void } {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function delayMs(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function removeTempRoot(root: string): Promise<void> {
	await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
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

class DiscoveryDispatchingRunner extends ProcessEventRoleRunner implements ProfileAwareTeamRoleRunner {
	readonly dispatchInputs: DiscoveryDispatchInput[] = [];
	readonly profileIdsHistory: Array<Parameters<ProfileAwareTeamRoleRunner["setProfileIds"]>[0]> = [];
	profileIds: Parameters<ProfileAwareTeamRoleRunner["setProfileIds"]>[0] | undefined;

	constructor(
		private readonly items: Array<Record<string, unknown>>,
		private readonly dispatchOutputs: DiscoveryDispatchOutput[] = [],
	) {
		super();
	}

	setProfileIds(profiles: Parameters<ProfileAwareTeamRoleRunner["setProfileIds"]>[0]): void {
		this.profileIds = profiles;
		this.profileIdsHistory.push(profiles);
	}

	async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
		return {
			verdict: "pass",
			reason: "ok",
			resultContent: JSON.stringify({ vendors: this.items }),
		};
	}

	async runDiscoveryDispatcher(input: DiscoveryDispatchInput): Promise<DiscoveryDispatchOutput> {
		this.dispatchInputs.push(input);
		const configured = this.dispatchOutputs.shift();
		if (configured) return configured;
		return {
			ok: true,
			itemId: input.itemId,
			workUnit: {
				title: `核查 ${input.itemId}`,
				input: { text: `核查供应商 ${input.itemId}` },
				outputContract: { text: `输出 ${input.itemId} 的核查报告。` },
				acceptance: { rules: [`报告必须覆盖 ${input.itemId}`] },
			},
		};
	}
}

class DiscoveryAcceptedNoDispatcherRunner extends ProcessEventRoleRunner {
	constructor(private readonly items: Array<Record<string, unknown>>) {
		super();
	}

	async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
		return {
			verdict: "pass",
			reason: "ok",
			resultContent: JSON.stringify({ vendors: this.items }),
		};
	}
}

class GatedDiscoveryGeneratedRunner extends DiscoveryDispatchingRunner {
	readonly generatedWorkerStarts: string[] = [];
	readonly releaseGeneratedWorkers: Array<() => void> = [];
	activeGeneratedWorkers = 0;
	maxActiveGeneratedWorkers = 0;

	async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
		if (input.task.type === "discovery") {
			return super.runWorker(input);
		}
		this.generatedWorkerStarts.push(input.task.id);
		this.activeGeneratedWorkers++;
		this.maxActiveGeneratedWorkers = Math.max(this.maxActiveGeneratedWorkers, this.activeGeneratedWorkers);
		const gate = createDeferred();
		this.releaseGeneratedWorkers.push(gate.resolve);
		try {
			await gate.promise;
			return { content: `generated ${input.task.id} result`, artifactRefs: [] };
		} finally {
			this.activeGeneratedWorkers--;
		}
	}
}

class GatedDiscoveryGeneratedWithDownstreamRunner extends GatedDiscoveryGeneratedRunner {
	readonly downstreamWorkerStarts: string[] = [];

	async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
		if (input.task.type !== "discovery" && !input.task.title.startsWith("核查 ")) {
			this.downstreamWorkerStarts.push(input.task.id);
			return { content: `downstream ${input.task.id} result`, artifactRefs: [] };
		}
		return super.runWorker(input);
	}
}

class StreamingDispatchGatedGeneratedRunner extends GatedDiscoveryGeneratedRunner {
	private readonly gatedItemId: string;
	private readonly dispatchGate = createDeferred();
	activeDispatchers = 0;
	maxActiveDispatchers = 0;

	constructor(items: Array<Record<string, unknown>>, gatedItemId = "hetzner") {
		super(items);
		this.gatedItemId = gatedItemId;
	}

	releaseDispatchGate(): void {
		this.dispatchGate.resolve();
	}

	async runDiscoveryDispatcher(input: DiscoveryDispatchInput): Promise<DiscoveryDispatchOutput> {
		this.dispatchInputs.push(input);
		this.activeDispatchers++;
		this.maxActiveDispatchers = Math.max(this.maxActiveDispatchers, this.activeDispatchers);
		try {
			if (input.itemId === this.gatedItemId) {
				await this.dispatchGate.promise;
			}
			return {
				ok: true,
				itemId: input.itemId,
				workUnit: {
					title: `核查 ${input.itemId}`,
					input: { text: `核查供应商 ${input.itemId}` },
					outputContract: { text: `输出 ${input.itemId} 的核查报告。` },
					acceptance: { rules: [`报告必须覆盖 ${input.itemId}`] },
				},
			};
		} finally {
			this.activeDispatchers--;
		}
	}
}

class StreamingDispatchGatedGeneratedWithDownstreamRunner extends StreamingDispatchGatedGeneratedRunner {
	readonly downstreamWorkerStarts: string[] = [];

	async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
		if (input.task.type !== "discovery" && !input.task.title.startsWith("核查 ")) {
			this.downstreamWorkerStarts.push(input.task.id);
			return { content: `downstream ${input.task.id} result`, artifactRefs: [] };
		}
		return super.runWorker(input);
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

class ToolProgressDelaysWorkerRunner extends ProcessEventRoleRunner {
	async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
		input.onSessionEvent?.({
			type: "tool_execution_start",
			toolCallId: "worker_tool_progress",
			toolName: "slow-search",
			args: { q: "timeout regression" },
		});
		await delayMs(20);
		input.onSessionEvent?.({
			type: "tool_execution_end",
			toolCallId: "worker_tool_progress",
			toolName: "slow-search",
			result: "search finished",
			isError: false,
		});
		await delayMs(25);
		return { content: "worker result after structural progress", artifactRefs: [] };
	}
}

class ArtifactFileProgressWorkerRunner extends ProcessEventRoleRunner {
	async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
		assert.ok(input.artifactPublicDir);
		await delayMs(20);
		await writeFile(join(input.artifactPublicDir, "progress.txt"), "structural file progress");
		await delayMs(25);
		return { content: "worker result after file progress", artifactRefs: [] };
	}
}

class TextOnlyWorkerRunner extends ProcessEventRoleRunner {
	async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
		for (let i = 0; i < 6; i++) {
			input.onSessionEvent?.({
				type: "message_update",
				assistantMessageEvent: { type: "text_delta", delta: `text-${i}` },
			});
			input.onSessionEvent?.({
				type: "message_update",
				assistantMessageEvent: { type: "thinking_delta", delta: `thinking-${i}` },
			});
			await delayMs(10);
		}
		return { content: "text-only worker result", artifactRefs: [] };
	}
}

class ContinualToolProgressWorkerRunner extends ProcessEventRoleRunner {
	async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
		let index = 0;
		const timer = setInterval(() => {
			input.onSessionEvent?.({
				type: "tool_execution_end",
				toolCallId: `worker_tool_${index}`,
				toolName: "poll",
				result: `poll ${index}`,
				isError: false,
			});
			index++;
		}, 10);
		try {
			await new Promise<never>((_resolve, reject) => {
				if (input.signal?.aborted) {
					reject(new Error("aborted"));
					return;
				}
				input.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
			});
			throw new Error("unreachable");
		} finally {
			clearInterval(timer);
		}
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

async function waitForWorkerAssistantText(workspace: RunWorkspace, runId: string, taskId: string, expectedText: string) {
	for (let i = 0; i < 40; i++) {
		const attempts = await workspace.listAttempts(runId, taskId);
		const worker = attempts[0]?.roleProcesses?.worker;
		if (worker?.assistantText?.content === expectedText) return worker;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error("worker assistant text did not appear");
}

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

test("Step04: Discovery Canvas Task run writes standard discovery result after accepted output", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-"));
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
		let capturedWorkerInput: WorkerInput | undefined;

		class DiscoveryAcceptedRunner extends ProcessEventRoleRunner {
			async runWorker(input: WorkerInput): Promise<WorkerOutput> {
				capturedWorkerInput = input;
				return { content: "ordinary worker text that old normal tasks would accept", artifactRefs: [] };
			}
			async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
				return {
					verdict: "pass",
					reason: "ok",
					resultContent: JSON.stringify({ vendors: [{ id: "vultr", name: "Vultr" }] }),
				};
			}
		}

		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new DiscoveryAcceptedRunner(),
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(task.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		assert.equal(finished.taskStates[task.taskId]?.status, "succeeded");
		assert.equal(capturedWorkerInput?.task.type, "discovery");
		assert.equal(capturedWorkerInput?.task.discovery?.outputKey, "vendors");

		const attempts = await workspace.listAttempts(created.runId, task.taskId);
		assert.equal(attempts.length, 1);
		const attempt = attempts[0]!;
		assert.equal(attempt.resultRef, `tasks/${task.taskId}/attempts/${attempt.attemptId}/accepted-result.md`);
		assert.ok(attempt.files.includes("accepted-result.md"));
		assert.ok(attempt.files.includes("discovery-result.json"));

		const result = await workspace.readDiscoveryResult(created.runId, task.taskId, attempt.attemptId);
		assert.ok(result);
		assert.equal(result.schemaVersion, "team/discovery-result-1");
		assert.equal(result.taskId, task.taskId);
		assert.equal(result.attemptId, attempt.attemptId);
		assert.equal(result.outputKey, "vendors");
		assert.deepEqual(result.items.map(item => item.id), ["vultr"]);
		assert.equal(result.sourceRef, `tasks/${task.taskId}/attempts/${attempt.attemptId}/accepted-result.md`);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("Step07: successful Discovery dispatch auto-runs active generated Tasks", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-dispatch-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
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
		const runner = new DiscoveryDispatchingRunner([
			{ id: "vultr", name: "Vultr", type: "cloud" },
			{ id: "hetzner", name: "Hetzner", type: "cloud" },
		]);
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(discovery.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		assert.equal(finished.taskStates[discovery.taskId]?.status, "succeeded");

		const dispatch = await waitForAttemptDiscoveryDispatch(workspace, created.runId, discovery.taskId, 2);
		assert.ok(runner.profileIdsHistory.some(profiles => profiles.dispatcherProfileId === "main"));
		assert.deepEqual(runner.dispatchInputs.map(input => input.itemId), ["vultr", "hetzner"]);
		assert.equal(runner.dispatchInputs[0]!.discoveryTaskId, discovery.taskId);
		assert.equal(runner.dispatchInputs[0]!.discoveryGoal, validDiscoverySpec.discoveryGoal);
		assert.equal(runner.dispatchInputs[0]!.dispatchGoal, validDiscoverySpec.dispatchGoal);
		assert.equal(runner.dispatchInputs[0]!.generatedWorkerAgentId, "search");
		assert.equal(runner.dispatchInputs[0]!.generatedCheckerAgentId, "main");

		assert.deepEqual(dispatch.map(outcome => outcome.status), ["created", "created"]);
		assert.deepEqual(dispatch.map(outcome => outcome.itemId), ["vultr", "hetzner"]);
		assert.ok(dispatch.every(outcome => outcome.generatedTaskId));
		assert.ok(dispatch.every(outcome => outcome.workUnitMode === "managed"));

		const generated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		assert.equal(generated.length, 2);
		const byItemId = Object.fromEntries(generated.map(task => [task.generatedSource!.sourceItemId, task]));
		for (const itemId of ["vultr", "hetzner"]) {
			const generatedTask = byItemId[itemId]!;
			assert.equal(generatedTask.status, "ready");
			assert.equal(generatedTask.leaderAgentId, "main");
			assert.equal(generatedTask.workUnit.workerAgentId, "search");
			assert.equal(generatedTask.workUnit.checkerAgentId, "main");
			assert.equal(generatedTask.generatedSource?.itemStatus, "active");
			assert.equal(generatedTask.generatedSource?.latestDiscoveryRunId, created.runId);
			assert.ok(generatedTask.generatedSource?.latestDiscoveryAttemptId);
			assert.ok(generatedTask.generatedSource?.latestDiscoveredAt);
			assert.equal(generatedTask.workUnit.title, `核查 ${itemId}`);
		}

		const launchOutcomes = await waitForAttemptDiscoveryGeneratedRuns(workspace, created.runId, discovery.taskId, 2);
		assert.deepEqual(new Set(launchOutcomes.map(outcome => outcome.status)), new Set(["started"]));
		assert.deepEqual(new Set(launchOutcomes.map(outcome => outcome.itemId)), new Set(["vultr", "hetzner"]));
		for (const outcome of launchOutcomes) {
			assert.ok(outcome.generatedRunId);
			const generatedTask = byItemId[outcome.itemId]!;
			assert.equal(outcome.generatedTaskId, generatedTask.taskId);
			const runs = await service.listRuns(generatedTask.taskId);
			assert.equal(runs.length, 1);
			const generatedRun = runs[0]!;
			assert.equal(generatedRun.runId, outcome.generatedRunId);
			await waitForTerminalRun(service, generatedRun.runId);
			assert.equal(generatedRun.source?.type, "canvas-task");
			assert.equal(generatedRun.source?.taskId, generatedTask.taskId);
			assert.equal(generatedRun.source?.triggeredBy?.type, "discovery-generated-task");
			if (generatedRun.source?.triggeredBy?.type === "discovery-generated-task") {
				assert.equal(generatedRun.source.triggeredBy.discoveryTaskId, discovery.taskId);
				assert.equal(generatedRun.source.triggeredBy.discoveryRunId, created.runId);
				assert.equal(generatedRun.source.triggeredBy.discoveryAttemptId, generatedTask.generatedSource?.latestDiscoveryAttemptId);
				assert.equal(generatedRun.source.triggeredBy.sourceItemId, outcome.itemId);
			}
		}
	} finally {
		await removeTempRoot(root);
	}
});

test("Discovery dispatch starts generated auto-run before all items finish dispatching", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-streaming-dispatch-"));
	const runner = new StreamingDispatchGatedGeneratedRunner([
		{ id: "vultr" },
		{ id: "hetzner" },
		{ id: "ovh" },
		{ id: "linode" },
	]);
	let service: CanvasTaskRunService | undefined;
	let created: TeamRunState | undefined;
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
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
		service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			dataDir: join(root, "task-runs"),
		});

		created = await service.createRun(discovery.taskId);
		await waitForDispatchInputs(runner, 2);
		await delayMs(150);

		assert.equal(runner.dispatchInputs[1]?.itemId, "hetzner");
		assert.equal(runner.maxActiveDispatchers, 1, "dispatcher producer must stay single-lane");
		assert.equal(runner.generatedWorkerStarts.length, 1, "first generated child should start while second item is still dispatching");
		assert.equal(runner.maxActiveGeneratedWorkers, 1);

		const attempts = await workspace.listAttempts(created.runId, discovery.taskId);
		assert.ok((attempts[0]?.discoveryDispatch?.length ?? 0) >= 1, "dispatch progress should be recorded before all items finish dispatching");

		runner.releaseDispatchGate();
		for (let i = 0; i < 40; i++) {
			for (const release of runner.releaseGeneratedWorkers.splice(0)) release();
			const latest = await service.getRun(created.runId);
			if (latest && ["completed", "completed_with_failures", "failed", "cancelled"].includes(latest.status)) break;
			await delayMs(25);
		}
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
	} finally {
		runner.releaseDispatchGate();
		for (let i = 0; i < 20; i++) {
			for (const release of runner.releaseGeneratedWorkers.splice(0)) release();
			if (service && created) {
				const latest = await service.getRun(created.runId).catch(() => null);
				if (latest && ["completed", "completed_with_failures", "failed", "cancelled"].includes(latest.status)) break;
			}
			await delayMs(25);
		}
		if (service && created) await waitForTerminalRun(service, created.runId).catch(() => {});
		await removeTempRoot(root);
	}
});

test("Step07: auto-run enforces concurrency 3", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-autorun-concurrency-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
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
		const runner = new GatedDiscoveryGeneratedRunner([
			{ id: "vultr" },
			{ id: "hetzner" },
			{ id: "ovh" },
			{ id: "linode" },
		]);
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(discovery.taskId);
		await waitForAttemptDiscoveryDispatch(workspace, created.runId, discovery.taskId, 4);
		await waitForGeneratedWorkerStarts(runner, 3);
		const waitingParent = await service.getRun(created.runId);
		assert.equal(waitingParent?.status, "running");
		assert.equal(waitingParent?.taskStates[discovery.taskId]?.status, "running");
		assert.equal(runner.generatedWorkerStarts.length, 3);
		assert.equal(runner.activeGeneratedWorkers, 3);
		assert.equal(runner.maxActiveGeneratedWorkers, 3);

		runner.releaseGeneratedWorkers[0]!();
		await waitForGeneratedWorkerStarts(runner, 4);
		assert.equal(runner.maxActiveGeneratedWorkers, 3);
		for (const release of runner.releaseGeneratedWorkers.slice(1)) release();

		const launchOutcomes = await waitForAttemptDiscoveryGeneratedRuns(workspace, created.runId, discovery.taskId, 4);
		assert.deepEqual(new Set(launchOutcomes.map(outcome => outcome.status)), new Set(["started"]));
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		const generated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		for (const task of generated) {
			const runs = await service.listRuns(task.taskId);
			assert.equal(runs.length, 1);
			const terminal = await waitForTerminalRun(service, runs[0]!.runId);
			assert.equal(terminal.status, "completed");
		}
		assert.equal(runner.maxActiveGeneratedWorkers, 3);
	} finally {
		await removeTempRoot(root);
	}
});

test("Discovery root cancel during streaming dispatch cancels active generated run and stops later launches", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-streaming-cancel-"));
	const runner = new StreamingDispatchGatedGeneratedRunner([
		{ id: "vultr" },
		{ id: "hetzner" },
		{ id: "ovh" },
		{ id: "linode" },
	]);
	let service: CanvasTaskRunService | undefined;
	let created: TeamRunState | undefined;
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
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
		service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			dataDir: join(root, "task-runs"),
		});
		const runService = service;

		created = await runService.createRun(discovery.taskId);
		await waitForDispatchInputs(runner, 2);
		await waitForGeneratedWorkerStarts(runner, 1);

		const cancelled = await runService.cancelRun(created.runId, "user cancel");
		assert.equal(cancelled.status, "cancelled");
		assert.equal(cancelled.taskStates[discovery.taskId]?.status, "cancelled");

		runner.releaseDispatchGate();
		await delayMs(150);
		assert.equal(runner.generatedWorkerStarts.length, 1, "cancelled Discovery root must not launch later generated items");

		const generated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		const generatedRuns = await Promise.all(generated.map(async task => [task, await runService.listRuns(task.taskId)] as const));
		const started = generatedRuns.filter(([, runs]) => runs.length > 0);
		assert.equal(started.length, 1);
		assert.equal(generated.length, 1, "cancelled Discovery root must not create later generated tasks after cancellation");
		assert.deepEqual(new Set(started.map(([, runs]) => runs[0]!.status)), new Set(["cancelled"]));

		const attempts = await workspace.listAttempts(created.runId, discovery.taskId);
		const attempt = attempts[0]!;
		assert.equal(await workspace.readAttemptFile(created.runId, discovery.taskId, attempt.attemptId, "discovery-aggregation.json"), null);
	} finally {
		runner.releaseDispatchGate();
		for (let i = 0; i < 20; i++) {
			for (const release of runner.releaseGeneratedWorkers.splice(0)) release();
			if (service && created) {
				const latest = await service.getRun(created.runId).catch(() => null);
				if (latest && ["completed", "completed_with_failures", "failed", "cancelled"].includes(latest.status)) break;
			}
			await delayMs(25);
		}
		if (service && created) await service.cancelRun(created.runId, "test cleanup").catch(() => {});
		await removeTempRoot(root);
	}
});

test("Discovery typed downstream waits until generated auto-runs finish", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-downstream-gate-"));
	const runner = new StreamingDispatchGatedGeneratedWithDownstreamRunner([
		{ id: "vultr" },
		{ id: "hetzner" },
	]);
	let service: CanvasTaskRunService | undefined;
	let created: TeamRunState | undefined;
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
			...validTaskInput,
			title: "发现云服务器供应商",
			canvasKind: "discovery",
			discoverySpec: validDiscoverySpec,
			workUnit: {
				...validTaskInput.workUnit,
				title: "发现云服务器供应商",
				input: { text: "搜索并输出云服务器供应商 JSON。" },
				outputPorts: [{ id: "vendors_json", label: "供应商 JSON", type: "json" }],
				outputContract: { text: "输出 JSON object，vendors 为数组，每项包含稳定 id。" },
				acceptance: { rules: ["vendors 必须是数组", "每项必须有 id"] },
			},
		});
		const downstream = await taskStore.create({
			title: "生成 HTML 报告",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "生成 HTML 报告",
				input: { text: "基于 JSON 数据生成 HTML 报告。" },
				inputPorts: [{ id: "source_json", label: "源 JSON", type: "json" }],
				outputContract: { text: "输出 HTML 报告。" },
				acceptance: { rules: ["必须包含 HTML"] },
				workerAgentId: "main",
				checkerAgentId: "main",
			},
		});

		await mkdir(join(root, "team"), { recursive: true });
		const connectionStore = new TaskConnectionStore(join(root, "team"), taskStore);
		const connection = await connectionStore.create({
			fromTaskId: discovery.taskId,
			fromOutputPortId: "vendors_json",
			toTaskId: downstream.taskId,
			toInputPortId: "source_json",
		});
		const workspace = new RunWorkspace(join(root, "task-runs"));
		service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			connectionStore,
			dataDir: join(root, "task-runs"),
		});

		created = await service.createRun(discovery.taskId);
		await waitForDispatchInputs(runner, 2);
		await waitForGeneratedWorkerStarts(runner, 1);

		const waitingParent = await service.getRun(created.runId);
		assert.equal(waitingParent?.status, "running");
		assert.equal(waitingParent?.taskStates[discovery.taskId]?.status, "running");
		assert.equal((await service.listRuns(downstream.taskId)).length, 0, "downstream must not start while generated child is running and dispatch is still active");

		runner.releaseDispatchGate();
		for (let i = 0; i < 40; i++) {
			for (const release of runner.releaseGeneratedWorkers.splice(0)) release();
			const latest = await service.getRun(created.runId);
			if (latest && ["completed", "completed_with_failures", "failed", "cancelled"].includes(latest.status)) break;
			await delayMs(25);
		}
		const parentFinished = await waitForTerminalRun(service, created.runId);
		assert.equal(parentFinished.status, "completed");
		assert.equal(parentFinished.taskStates[discovery.taskId]?.status, "succeeded");

		const downstreamRuns = await waitForTaskRuns(service, downstream.taskId, 1);
		const downstreamFinished = await waitForTerminalRun(service, downstreamRuns[0]!.runId);
		assert.equal(downstreamFinished.status, "completed");
		assert.equal(downstreamFinished.source?.triggeredBy?.type, "task-connection");
		assert.equal(downstreamFinished.source?.boundInputs?.[0]?.connectionId, connection.connectionId);
		assert.deepEqual(runner.downstreamWorkerStarts, [downstream.taskId]);

		const delivery = await waitForAttemptDelivery(workspace, created.runId, discovery.taskId);
		assert.equal(delivery[0]?.status, "delivered");
	} finally {
		runner.releaseDispatchGate();
		for (let i = 0; i < 20; i++) {
			for (const release of runner.releaseGeneratedWorkers.splice(0)) release();
			if (service && created) {
				const latest = await service.getRun(created.runId).catch(() => null);
				if (latest && ["completed", "completed_with_failures", "failed", "cancelled"].includes(latest.status)) break;
			}
			await delayMs(25);
		}
		if (service && created) await waitForTerminalRun(service, created.runId).catch(() => {});
		await removeTempRoot(root);
	}
});

test("Discovery root cancel cascades to active generated auto-runs and stops launching queued items", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-cancel-generated-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
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
		const runner = new GatedDiscoveryGeneratedRunner([
			{ id: "vultr" },
			{ id: "hetzner" },
			{ id: "ovh" },
			{ id: "linode" },
		]);
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(discovery.taskId);
		await waitForAttemptDiscoveryDispatch(workspace, created.runId, discovery.taskId, 4);
		await waitForGeneratedWorkerStarts(runner, 3);
		assert.equal(runner.generatedWorkerStarts.length, 3);
		assert.equal(runner.activeGeneratedWorkers, 3);

		const cancelled = await service.cancelRun(created.runId, "user cancel");
		assert.equal(cancelled.status, "cancelled");
		assert.equal(cancelled.taskStates[discovery.taskId]?.status, "cancelled");

		await new Promise(resolve => setTimeout(resolve, 150));
		assert.equal(runner.generatedWorkerStarts.length, 3, "cancelled Discovery root must not launch queued generated items");

		const generated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		const generatedRuns = await Promise.all(generated.map(async task => [task, await service.listRuns(task.taskId)] as const));
		const started = generatedRuns.filter(([, runs]) => runs.length > 0);
		const unstarted = generatedRuns.filter(([, runs]) => runs.length === 0);
		assert.equal(started.length, 3);
		assert.equal(unstarted.length, 1);
		assert.deepEqual(new Set(started.map(([, runs]) => runs[0]!.status)), new Set(["cancelled"]));

		for (const release of runner.releaseGeneratedWorkers) release();
		await new Promise(resolve => setTimeout(resolve, 50));
	} finally {
		await removeTempRoot(root);
	}
});

test("Step07: already-running generated Task is skipped without failing Discovery", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-already-running-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
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
		const runner = new GatedDiscoveryGeneratedRunner([{ id: "vultr" }]);
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			dataDir: join(root, "task-runs"),
		});

		const generated = await taskStore.create({
			title: "核查 vultr",
			leaderAgentId: "main",
			status: "ready",
			workUnit: {
				title: "核查 vultr",
				input: { text: "核查供应商 vultr" },
				outputContract: { text: "输出 vultr 的核查报告。" },
				acceptance: { rules: ["报告必须覆盖 vultr"] },
				workerAgentId: "search",
				checkerAgentId: "main",
			},
			generatedSource: {
				schemaVersion: "team/generated-task-source-1",
				sourceDiscoveryTaskId: discovery.taskId,
				sourceItemId: "vultr",
				itemStatus: "active",
				itemPayload: { id: "vultr" },
				workUnitMode: "managed",
			},
		});
		const existingRun = await service.createRun(generated.taskId);
		await waitForGeneratedWorkerStarts(runner, 1);
		const existingRunState = (await service.listRuns(generated.taskId)).find(run => run.status === "queued" || run.status === "running" || run.status === "paused");
		assert.ok(existingRunState);

		const secondRun = await service.createRun(discovery.taskId);
		const secondFinished = await waitForTerminalRun(service, secondRun.runId);
		assert.equal(secondFinished.status, "completed");
		const launchOutcomes = await waitForAttemptDiscoveryGeneratedRuns(workspace, secondRun.runId, discovery.taskId);
		assert.equal(launchOutcomes.length, 1);
		assert.equal(launchOutcomes[0]!.status, "skipped_already_running");
		assert.equal(launchOutcomes[0]!.generatedRunId, existingRunState.runId);
		assert.equal((await service.listRuns(generated.taskId)).length, 1);

		runner.releaseGeneratedWorkers[0]!();
		await waitForTerminalRun(service, existingRun.runId);
	} finally {
		await removeTempRoot(root);
	}
});

test("Step07: not-ready generated Task launch is recorded without failing Discovery", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-not-ready-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
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
		const runners = [
			new DiscoveryDispatchingRunner([{ id: "vultr" }]),
			new DiscoveryDispatchingRunner([{ id: "vultr", name: "Vultr rerun" }]),
		];
		let runnerIndex = 0;
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runners[Math.min(runnerIndex++, runners.length - 1)]!,
			dataDir: join(root, "task-runs"),
		});

		const firstRun = await service.createRun(discovery.taskId);
		await waitForTerminalRun(service, firstRun.runId);
		await waitForAttemptDiscoveryGeneratedRuns(workspace, firstRun.runId, discovery.taskId);
		const generated = (await taskStore.listGeneratedForDiscoveryTask(discovery.taskId))[0]!;
		assert.equal((await service.listRuns(generated.taskId)).length, 1);

		await taskStore.update(generated.taskId, { status: "drafting" });
		const secondRun = await service.createRun(discovery.taskId);
		const secondFinished = await waitForTerminalRun(service, secondRun.runId);
		assert.equal(secondFinished.status, "completed");
		const dispatch = await waitForAttemptDiscoveryDispatch(workspace, secondRun.runId, discovery.taskId);
		assert.equal(dispatch[0]!.status, "updated");
		const launchOutcomes = await waitForAttemptDiscoveryGeneratedRuns(workspace, secondRun.runId, discovery.taskId);
		assert.equal(launchOutcomes.length, 1);
		assert.equal(launchOutcomes[0]!.status, "skipped_not_runnable");
		assert.match(launchOutcomes[0]!.error ?? "", /ready/);
		assert.equal((await service.listRuns(generated.taskId)).length, 1);

		const updated = await taskStore.get(generated.taskId);
		assert.equal(updated?.status, "drafting");
		assert.deepEqual(updated?.generatedSource?.itemPayload, { id: "vultr", name: "Vultr rerun" });
		assert.equal(updated?.generatedSource?.latestDiscoveryRunId, secondRun.runId);
	} finally {
		await removeTempRoot(root);
	}
});

test("Step07: blocked dispatch items and stale items are not auto-run", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-blocked-stale-autorun-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
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
		const runners = [
			new DiscoveryDispatchingRunner([{ id: "stale" }]),
			new DiscoveryDispatchingRunner(
				[{ id: "blocked" }, { id: "active" }],
				[
					{ ok: false, itemId: "blocked", error: "dispatcher blocked this item" },
					{
						ok: true,
						itemId: "active",
						workUnit: {
							title: "核查 active",
							input: { text: "核查 active。" },
							outputContract: { text: "输出 active 报告。" },
							acceptance: { rules: ["包含 active"] },
						},
					},
				],
			),
		];
		let runnerIndex = 0;
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runners[Math.min(runnerIndex++, runners.length - 1)]!,
			dataDir: join(root, "task-runs"),
		});

		const firstRun = await service.createRun(discovery.taskId);
		await waitForTerminalRun(service, firstRun.runId);
		await waitForAttemptDiscoveryGeneratedRuns(workspace, firstRun.runId, discovery.taskId);
		const firstGenerated = (await taskStore.listGeneratedForDiscoveryTask(discovery.taskId))[0]!;
		assert.equal((await service.listRuns(firstGenerated.taskId)).length, 1);

		const secondRun = await service.createRun(discovery.taskId);
		await waitForTerminalRun(service, secondRun.runId);
		const dispatch = await waitForAttemptDiscoveryDispatch(workspace, secondRun.runId, discovery.taskId, 3);
		const dispatchByItem = Object.fromEntries(dispatch.map(outcome => [outcome.itemId, outcome]));
		assert.equal(dispatchByItem.blocked?.status, "blocked");
		assert.equal(dispatchByItem.stale?.status, "stale_marked");
		assert.equal(dispatchByItem.active?.status, "created");

		const launchOutcomes = await waitForAttemptDiscoveryGeneratedRuns(workspace, secondRun.runId, discovery.taskId);
		assert.equal(launchOutcomes.length, 1);
		assert.equal(launchOutcomes[0]!.itemId, "active");
		assert.equal(launchOutcomes[0]!.status, "started");
		const generated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		const byItemId = Object.fromEntries(generated.map(task => [task.generatedSource!.sourceItemId, task]));
		assert.equal(byItemId.stale?.generatedSource?.itemStatus, "stale");
		assert.equal((await service.listRuns(byItemId.stale!.taskId)).length, 1);
		assert.equal(byItemId.blocked, undefined);
		assert.equal((await service.listRuns(byItemId.active!.taskId)).length, 1);
	} finally {
		await removeTempRoot(root);
	}
});

test("Step06: Discovery rerun reuses managed generated Tasks and marks missing items stale", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-rerun-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
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
		const runners = [
			new DiscoveryDispatchingRunner([{ id: "vultr", name: "Vultr" }, { id: "hetzner", name: "Hetzner" }]),
			new DiscoveryDispatchingRunner(
				[{ id: "vultr", name: "Vultr updated" }, { id: "ovh", name: "OVH" }],
				[{
					ok: true,
					itemId: "vultr",
					workUnit: {
						title: "更新核查 Vultr",
						input: { text: "使用最新 Discovery payload 重新核查 Vultr。" },
						outputContract: { text: "输出更新后的 Vultr 报告。" },
						acceptance: { rules: ["必须包含更新后的供应商名称"] },
					},
				}],
			),
		];
		let runnerIndex = 0;
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runners[Math.min(runnerIndex++, runners.length - 1)]!,
			dataDir: join(root, "task-runs"),
		});

		const firstRun = await service.createRun(discovery.taskId);
		await waitForTerminalRun(service, firstRun.runId);
		await waitForAttemptDiscoveryDispatch(workspace, firstRun.runId, discovery.taskId, 2);
		await waitForAttemptDiscoveryGeneratedRuns(workspace, firstRun.runId, discovery.taskId, 2);
		const firstGenerated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		const vultrTaskId = firstGenerated.find(task => task.generatedSource?.sourceItemId === "vultr")!.taskId;
		const hetznerTaskId = firstGenerated.find(task => task.generatedSource?.sourceItemId === "hetzner")!.taskId;

		const secondRun = await service.createRun(discovery.taskId);
		const secondFinished = await waitForTerminalRun(service, secondRun.runId);
		assert.equal(secondFinished.status, "completed");
		const secondDispatch = await waitForAttemptDiscoveryDispatch(workspace, secondRun.runId, discovery.taskId, 3);
		assert.deepEqual(new Set(secondDispatch.map(outcome => outcome.status)), new Set(["updated", "created", "stale_marked"]));

		const generated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		const byItemId = Object.fromEntries(generated.map(task => [task.generatedSource!.sourceItemId, task]));
		assert.equal(byItemId.vultr?.taskId, vultrTaskId);
		assert.equal(byItemId.vultr?.title, "更新核查 Vultr");
		assert.equal(byItemId.vultr?.workUnit.input.text, "使用最新 Discovery payload 重新核查 Vultr。");
		assert.deepEqual(byItemId.vultr?.generatedSource?.itemPayload, { id: "vultr", name: "Vultr updated" });
		assert.equal(byItemId.vultr?.generatedSource?.latestDiscoveryRunId, secondRun.runId);
		assert.equal(byItemId.vultr?.generatedSource?.itemStatus, "active");
		assert.equal(byItemId.hetzner?.taskId, hetznerTaskId);
		assert.equal(byItemId.hetzner?.generatedSource?.itemStatus, "stale");
		assert.equal(byItemId.hetzner?.archived, false);
		assert.equal(byItemId.ovh?.generatedSource?.itemStatus, "active");
		await waitForAttemptDiscoveryGeneratedRuns(workspace, secondRun.runId, discovery.taskId, 2);
		for (const task of generated) {
			for (const run of await service.listRuns(task.taskId)) {
				await waitForTerminalRun(service, run.runId);
			}
		}
	} finally {
		await removeTempRoot(root);
	}
});

test("Step06: customized generated WorkUnit is protected on Discovery rerun", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-customized-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
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
		const runners = [
			new DiscoveryDispatchingRunner([{ id: "vultr", name: "Vultr" }]),
			new DiscoveryDispatchingRunner(
				[{ id: "vultr", name: "Vultr rerun" }],
				[{
					ok: true,
					itemId: "vultr",
					workUnit: {
						title: "派发器新 Vultr 标题",
						input: { text: "派发器新输入。" },
						outputContract: { text: "派发器新输出。" },
						acceptance: { rules: ["派发器新规则"] },
					},
				}],
			),
		];
		let runnerIndex = 0;
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runners[Math.min(runnerIndex++, runners.length - 1)]!,
			dataDir: join(root, "task-runs"),
		});

		const firstRun = await service.createRun(discovery.taskId);
		await waitForTerminalRun(service, firstRun.runId);
		await waitForAttemptDiscoveryDispatch(workspace, firstRun.runId, discovery.taskId);
		await waitForAttemptDiscoveryGeneratedRuns(workspace, firstRun.runId, discovery.taskId);
		const generated = (await taskStore.listGeneratedForDiscoveryTask(discovery.taskId))[0]!;
		await taskStore.update(generated.taskId, {
			title: "用户保留标题",
			workUnit: {
				...generated.workUnit,
				title: "用户保留 WorkUnit",
				input: { text: "用户保留输入。" },
				outputContract: { text: "用户保留输出。" },
				acceptance: { rules: ["用户保留规则"] },
			},
		});

		const secondRun = await service.createRun(discovery.taskId);
		await waitForTerminalRun(service, secondRun.runId);
		const dispatch = await waitForAttemptDiscoveryDispatch(workspace, secondRun.runId, discovery.taskId);
		assert.equal(dispatch[0]!.status, "updated");
		assert.equal(dispatch[0]!.workUnitMode, "customized");

		const reused = await taskStore.get(generated.taskId);
		assert.equal(reused?.title, "用户保留标题");
		assert.equal(reused?.workUnit.title, "用户保留 WorkUnit");
		assert.equal(reused?.workUnit.input.text, "用户保留输入。");
		assert.equal(reused?.workUnit.outputContract.text, "用户保留输出。");
		assert.deepEqual(reused?.workUnit.acceptance.rules, ["用户保留规则"]);
		assert.deepEqual(reused?.generatedSource?.itemPayload, { id: "vultr", name: "Vultr rerun" });
		assert.equal(reused?.generatedSource?.latestDiscoveryRunId, secondRun.runId);
		assert.equal(reused?.generatedSource?.workUnitMode, "customized");
		await waitForAttemptDiscoveryGeneratedRuns(workspace, secondRun.runId, discovery.taskId);
		for (const run of await service.listRuns(generated.taskId)) {
			await waitForTerminalRun(service, run.runId);
		}
	} finally {
		await removeTempRoot(root);
	}
});

test("Step06: invalid dispatcher output blocks only that item and keeps Discovery run completed", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-blocked-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
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
		const runner = new DiscoveryDispatchingRunner(
			[{ id: "broken", name: "Broken" }, { id: "vultr", name: "Vultr" }],
			[
				{ ok: false, itemId: "broken", error: "discovery dispatcher output parse error: invalid JSON" },
				{
					ok: true,
					itemId: "vultr",
					workUnit: {
						title: "核查 Vultr",
						input: { text: "核查 Vultr。" },
						outputContract: { text: "输出 Vultr 报告。" },
						acceptance: { rules: ["包含 Vultr"] },
					},
				},
			],
		);
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => runner,
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(discovery.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		const dispatch = await waitForAttemptDiscoveryDispatch(workspace, created.runId, discovery.taskId, 2);
		const byItemId = Object.fromEntries(dispatch.map(outcome => [outcome.itemId, outcome]));
		assert.equal(byItemId.broken?.status, "blocked");
		assert.match(byItemId.broken?.error ?? "", /invalid JSON/);
		assert.equal(byItemId.vultr?.status, "created");

		const generated = await taskStore.listGeneratedForDiscoveryTask(discovery.taskId);
		assert.deepEqual(generated.map(task => task.generatedSource?.sourceItemId), ["vultr"]);
		await waitForAttemptDiscoveryGeneratedRuns(workspace, created.runId, discovery.taskId);
		for (const run of await service.listRuns(generated[0]!.taskId)) {
			await waitForTerminalRun(service, run.runId);
		}
	} finally {
		await removeTempRoot(root);
	}
});

test("Step06: missing runDiscoveryDispatcher support records blocked outcomes without failing Discovery run", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-discovery-no-dispatcher-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const discovery = await taskStore.create({
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
		const service = new CanvasTaskRunService({
			taskStore,
			workspace,
			createRoleRunner: () => new DiscoveryAcceptedNoDispatcherRunner([{ id: "vultr" }, { id: "hetzner" }]),
			dataDir: join(root, "task-runs"),
		});

		const created = await service.createRun(discovery.taskId);
		const finished = await waitForTerminalRun(service, created.runId);
		assert.equal(finished.status, "completed");
		const dispatch = await waitForAttemptDiscoveryDispatch(workspace, created.runId, discovery.taskId, 2);
		assert.deepEqual(dispatch.map(outcome => outcome.status), ["blocked", "blocked"]);
		assert.ok(dispatch.every(outcome => /runDiscoveryDispatcher/.test(outcome.error ?? "")));
		assert.deepEqual(await taskStore.listGeneratedForDiscoveryTask(discovery.taskId), []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

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
		const boundInputPayload = capturedDownstreamInput!.task.input.payload as { boundInputs?: Array<{ artifact: { fileRef: string; content?: string; preview: string } }> } | undefined;
		const artifact = boundInputPayload!.boundInputs![0]!.artifact;
		assert.equal(artifact.fileRef, `tasks/${sourceTask.taskId}/attempts/${upstreamAttempt.attemptId}/discovery-aggregation.json`);
		assert.notEqual(artifact.content, "worker/forum-sources.json");
		const aggregation = JSON.parse(artifact.content ?? "");
		assert.equal(aggregation.schemaVersion, "team/discovery-aggregation-1");
		assert.equal(aggregation.sourceResultRef, `tasks/${sourceTask.taskId}/attempts/${upstreamAttempt.attemptId}/discovery-result.json`);
		assert.equal(aggregation.items[0]?.itemId, "vultr");
		assert.equal(aggregation.items[0]?.result?.status, "succeeded");
		assert.doesNotMatch(artifact.content ?? "", /worker\/forum-sources\.json/);
		assert.match(capturedDownstreamInput!.task.input.text, /BEGIN_TYPED_ARTIFACT_CONTENT/);
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
