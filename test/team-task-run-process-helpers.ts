import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

export type ProcessAwareWorkerInput = WorkerInput & { onSessionEvent?: (event: RawAgentSessionEventLike) => void };
export type ProcessAwareCheckerInput = CheckerInput & { onSessionEvent?: (event: RawAgentSessionEventLike) => void };

export const validTaskInput = {
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

export const validDiscoverySpec = {
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

export async function waitForTerminalRun(service: CanvasTaskRunService, runId: string): Promise<TeamRunState> {
	const terminal = new Set(["completed", "completed_with_failures", "failed", "cancelled"]);
	for (let i = 0; i < 40; i++) {
		const state = await service.getRun(runId);
		assert.ok(state);
		if (terminal.has(state.status)) return state;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`task run did not reach terminal state: ${runId}`);
}

export async function waitForTaskRuns(service: CanvasTaskRunService, taskId: string, expectedLength = 1): Promise<TeamRunState[]> {
	for (let i = 0; i < 40; i++) {
		const runs = await service.listRuns(taskId);
		if (runs.length >= expectedLength) return runs;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error("task did not reach expected run count");
}

export async function waitForAttemptDelivery(workspace: RunWorkspace, runId: string, taskId: string, expectedLength = 1): Promise<import("../src/team/types.js").TeamTaskDeliveryOutcome[]> {
	for (let i = 0; i < 80; i++) {
		const attempts = await workspace.listAttempts(runId, taskId);
		const delivery = (attempts[0] as { downstreamDelivery?: import("../src/team/types.js").TeamTaskDeliveryOutcome[] } | undefined)?.downstreamDelivery;
		if (delivery && delivery.length >= expectedLength) return delivery;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`attempt delivery outcomes did not reach length ${expectedLength} for run ${runId} task ${taskId}`);
}

export async function waitForAttemptDiscoveryDispatch(workspace: RunWorkspace, runId: string, taskId: string, expectedLength = 1): Promise<TeamDiscoveryDispatchOutcome[]> {
	for (let i = 0; i < 80; i++) {
		const attempts = await workspace.listAttempts(runId, taskId);
		const dispatch = attempts[0]?.discoveryDispatch;
		if (dispatch && dispatch.length >= expectedLength) return dispatch;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`attempt discovery dispatch outcomes did not reach length ${expectedLength} for run ${runId} task ${taskId}`);
}

export async function waitForAttemptDiscoveryGeneratedRuns(workspace: RunWorkspace, runId: string, taskId: string, expectedLength = 1): Promise<TeamDiscoveryGeneratedRunOutcome[]> {
	for (let i = 0; i < 200; i++) {
		const attempts = await workspace.listAttempts(runId, taskId);
		const launches = attempts[0]?.discoveryGeneratedRuns;
		if (launches && launches.length >= expectedLength) return launches;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`attempt discovery generated run outcomes did not reach length ${expectedLength} for run ${runId} task ${taskId}`);
}

export async function waitForGeneratedWorkerStarts(runner: { generatedWorkerStarts: string[] }, expectedLength: number): Promise<void> {
	for (let i = 0; i < 80; i++) {
		if (runner.generatedWorkerStarts.length >= expectedLength) return;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`generated workers did not reach start count ${expectedLength}`);
}

export async function waitForDispatchInputs(runner: { dispatchInputs: DiscoveryDispatchInput[] }, expectedLength: number): Promise<void> {
	for (let i = 0; i < 80; i++) {
		if (runner.dispatchInputs.length >= expectedLength) return;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error(`dispatcher inputs did not reach count ${expectedLength}`);
}

export function createDeferred(): { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void } {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

export function delayMs(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export async function removeTempRoot(root: string): Promise<void> {
	await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

export class ProcessEventRoleRunner implements TeamRoleRunner {
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

export class DiscoveryDispatchingRunner extends ProcessEventRoleRunner implements ProfileAwareTeamRoleRunner {
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

export class DiscoveryAcceptedNoDispatcherRunner extends ProcessEventRoleRunner {
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

export class GatedDiscoveryGeneratedRunner extends DiscoveryDispatchingRunner {
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

export class GatedDiscoveryGeneratedWithDownstreamRunner extends GatedDiscoveryGeneratedRunner {
	readonly downstreamWorkerStarts: string[] = [];

	async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
		if (input.task.type !== "discovery" && !input.task.title.startsWith("核查 ")) {
			this.downstreamWorkerStarts.push(input.task.id);
			return { content: `downstream ${input.task.id} result`, artifactRefs: [] };
		}
		return super.runWorker(input);
	}
}

export class StreamingDispatchGatedGeneratedRunner extends GatedDiscoveryGeneratedRunner {
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

export class StreamingDispatchGatedGeneratedWithDownstreamRunner extends StreamingDispatchGatedGeneratedRunner {
	readonly downstreamWorkerStarts: string[] = [];

	async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
		if (input.task.type !== "discovery" && !input.task.title.startsWith("核查 ")) {
			this.downstreamWorkerStarts.push(input.task.id);
			return { content: `downstream ${input.task.id} result`, artifactRefs: [] };
		}
		return super.runWorker(input);
	}
}

export class CancellableWorkerRoleRunner extends ProcessEventRoleRunner {
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

export class ToolProgressDelaysWorkerRunner extends ProcessEventRoleRunner {
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

export class ArtifactFileProgressWorkerRunner extends ProcessEventRoleRunner {
	async runWorker(input: ProcessAwareWorkerInput): Promise<WorkerOutput> {
		assert.ok(input.artifactPublicDir);
		await delayMs(20);
		await writeFile(join(input.artifactPublicDir, "progress.txt"), "structural file progress");
		await delayMs(25);
		return { content: "worker result after file progress", artifactRefs: [] };
	}
}

export class TextOnlyWorkerRunner extends ProcessEventRoleRunner {
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

export class ContinualToolProgressWorkerRunner extends ProcessEventRoleRunner {
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

export class LateEventAfterCancelRoleRunner extends ProcessEventRoleRunner {
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

export async function waitForWorkerProcess(workspace: RunWorkspace, runId: string, taskId: string) {
	for (let i = 0; i < 40; i++) {
		const attempts = await workspace.listAttempts(runId, taskId);
		const worker = attempts[0]?.roleProcesses?.worker;
		if (worker) return worker;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error("worker process did not appear");
}

export async function waitForWorkerAssistantText(workspace: RunWorkspace, runId: string, taskId: string, expectedText: string) {
	for (let i = 0; i < 40; i++) {
		const attempts = await workspace.listAttempts(runId, taskId);
		const worker = attempts[0]?.roleProcesses?.worker;
		if (worker?.assistantText?.content === expectedText) return worker;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
	throw new Error("worker assistant text did not appear");
}
