import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "../src/team/task-store.js";
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
	protected workerSessionEvent: ((event: RawAgentSessionEventLike) => void) | undefined;

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
			input.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
		});
		throw new Error("unreachable");
	}

	emitLateWorkerText(text: string): void {
		this.workerSessionEvent?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: text } });
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

test("CanvasTaskRunService flushes cancelled worker process when task run is cancelled", async () => {
	const root = await mkdtemp(join(tmpdir(), "team-task-run-process-"));
	try {
		const taskStore = new TaskStore(root, { getAgentIds: () => ["main", "search"] });
		const task = await taskStore.create(validTaskInput);
		const workspace = new RunWorkspace(join(root, "task-runs"));
		const runner = new CancellableWorkerRoleRunner();
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
		const attempts = await workspace.listAttempts(created.runId, task.taskId);
		const worker = attempts[0]!.roleProcesses?.worker;
		assert.ok(worker);
		assert.equal(worker?.status, "cancelled");
		assert.equal(worker?.process?.isComplete, true);
		assert.equal(worker?.process?.currentAction, "任务已打断");
		assert.equal(worker?.assistantText?.content, "取消前文本。");
		assert.ok(worker?.assistantText?.updatedAt);

		const assistantTextBeforeLateEvent = worker.assistantText?.content;
		const updatedAtBeforeLateEvent = worker.updatedAt;
		runner.emitLateWorkerText("取消后的迟到文本不应出现。");
		await new Promise(resolve => setTimeout(resolve, 500));
		const afterLateAttempts = await workspace.listAttempts(created.runId, task.taskId);
		const workerAfterLateEvent = afterLateAttempts[0]!.roleProcesses?.worker;
		assert.equal(workerAfterLateEvent?.status, "cancelled");
		assert.equal(workerAfterLateEvent?.updatedAt, updatedAtBeforeLateEvent);
		assert.equal(workerAfterLateEvent?.assistantText?.content, assistantTextBeforeLateEvent);
		assert.doesNotMatch(workerAfterLateEvent?.assistantText?.content ?? "", /迟到文本/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
