import type { TaskStore } from "./task-store.js";
import type { RunWorkspace } from "./run-workspace.js";
import type { TeamRoleRunner } from "./role-runner.js";
import type {
	TeamCanvasTask,
	TeamDiscoveryAggregationRecord,
	TeamDiscoveryDispatchOutcome,
	TeamDiscoveryGeneratedRunOutcome,
	TeamRunState,
} from "./types.js";
import { computeTeamRunSummary } from "./team-summary.js";

const now = () => new Date().toISOString();
const ACTIVE_RUN_STATUSES = new Set(["queued", "running", "paused"]);
const TERMINAL_RUN_STATUSES = new Set(["completed", "completed_with_failures", "failed", "cancelled"]);

const DELIVERY_ERROR_LIMIT = 500;
const GENERATED_TASK_AUTORUN_CONCURRENCY = 3;
const GENERATED_TASK_AUTORUN_POLL_MS = 25;

type DiscoveryGeneratedTaskCandidate = { itemId: string; task: TeamCanvasTask };
type DiscoveryGeneratedTaskDispatchResult = {
	outcomes: TeamDiscoveryDispatchOutcome[];
	generatedRunOutcomes: TeamDiscoveryGeneratedRunOutcome[];
};
type TriggeredBy = NonNullable<TeamRunState["source"]>["triggeredBy"];

function sanitizeDeliveryError(error: unknown): string {
	const raw = error instanceof Error ? error.message : String(error);
	const trimmed = raw.trim();
	if (!trimmed) return "unknown downstream delivery error";
	return trimmed.slice(0, DELIVERY_ERROR_LIMIT);
}

function parseActiveTaskRunError(error: unknown): string | null {
	const message = error instanceof Error ? error.message : String(error);
	const match = /^active task run already exists: (.+)$/.exec(message.trim());
	return match?.[1] ?? null;
}

function isNotRunnableLaunchError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /task not found|archived task cannot be run|task must be ready before run/i.test(message);
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
	if (signal.aborted) return Promise.reject(new Error("run cancelled"));
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timeout);
			reject(new Error("run cancelled"));
		};
		signal.addEventListener("abort", onAbort, { once: true });
	});
}

export interface DiscoveryRunLifecycleOptions {
	taskStore: Pick<TaskStore, "upsertGeneratedTaskFromDiscovery" | "markGeneratedTasksStaleForDiscovery" | "listGeneratedForDiscoveryTask" | "get">;
	workspace: Pick<RunWorkspace, "patchState" | "readDiscoveryResult" | "recordAttemptDiscoveryDispatchOutcomes" | "recordAttemptDiscoveryGeneratedRunOutcomes" | "writeDiscoveryAggregation" | "readRunScopedFile">;
	runs: {
		getRun(runId: string): Promise<TeamRunState | null>;
		listRuns(taskId?: string): Promise<TeamRunState[]>;
		createRun(taskId: string, options?: { publicBaseUrl?: string; triggeredBy?: TriggeredBy }): Promise<TeamRunState>;
		cancelRun(runId: string, reason?: string): Promise<TeamRunState>;
	};
}

export class DiscoveryRunLifecycle {
	private readonly taskStore: DiscoveryRunLifecycleOptions["taskStore"];
	private readonly workspace: DiscoveryRunLifecycleOptions["workspace"];
	private readonly runs: DiscoveryRunLifecycleOptions["runs"];

	constructor(options: DiscoveryRunLifecycleOptions) {
		this.taskStore = options.taskStore;
		this.workspace = options.workspace;
		this.runs = options.runs;
	}

	async runAcceptedDiscoveryRoot(input: {
		runId: string;
		discoveryTask: TeamCanvasTask;
		attemptId: string;
		resultRef: string;
		roleRunner: TeamRoleRunner;
		signal: AbortSignal;
	}): Promise<{ status: "ready-to-complete" | "cancelled-or-missing"; aggregationRef: string | null }> {
		const { runId, discoveryTask, attemptId, resultRef, roleRunner, signal } = input;

		await this.markDiscoveryRunWaitingForGeneratedTasks(runId, discoveryTask.taskId, resultRef);

		let discoveryDispatchResult: DiscoveryGeneratedTaskDispatchResult | null = null;
		try {
			discoveryDispatchResult = await this.runDiscoveryDispatchAndAutoRun(runId, discoveryTask, attemptId, roleRunner, signal);
		} catch {
			// Discovery dispatch diagnostics must not fail an accepted Discovery run.
		}

		if (signal.aborted || await this.isRunCancelledOrMissing(runId)) {
			return { status: "cancelled-or-missing", aggregationRef: null };
		}

		let aggregationRef: string | null = null;
		try {
			aggregationRef = await this.writeDiscoveryAggregation(
				runId,
				discoveryTask,
				attemptId,
				discoveryDispatchResult?.outcomes ?? [],
				discoveryDispatchResult?.generatedRunOutcomes ?? [],
			);
		} catch {
			// Aggregation write failure must not fail an accepted Discovery run.
		}

		return { status: "ready-to-complete", aggregationRef };
	}

	private async isRunCancelledOrMissing(runId: string): Promise<boolean> {
		const state = await this.runs.getRun(runId);
		return !state || state.status === "cancelled";
	}

	private async markDiscoveryRunWaitingForGeneratedTasks(runId: string, taskId: string, resultRef: string): Promise<void> {
		const timestamp = now();
		await this.workspace.patchState(runId, (state) => {
			const taskState = state.taskStates[taskId];
			if (taskState) {
				taskState.status = "running";
				taskState.resultRef = resultRef;
				taskState.errorSummary = null;
				taskState.progress = {
					phase: "writing_result",
					message: "正在派发并运行 Discovery generated Tasks",
					updatedAt: timestamp,
				};
			}
			state.status = "running";
			state.currentTaskId = taskId;
			state.summary = computeTeamRunSummary(state.taskStates);
			state.updatedAt = timestamp;
		});
	}

	private async runDiscoveryDispatchAndAutoRun(
		runId: string,
		canvasTask: TeamCanvasTask,
		attemptId: string,
		roleRunner: TeamRoleRunner,
		signal: AbortSignal,
	): Promise<DiscoveryGeneratedTaskDispatchResult | null> {
		if (canvasTask.canvasKind !== "discovery") return null;
		const discoverySpec = canvasTask.discoverySpec;
		if (!discoverySpec) return null;
		const createdAt = now();
		const discoveryResult = await this.workspace.readDiscoveryResult(runId, canvasTask.taskId, attemptId);
		if (!discoveryResult) {
			const outcomes: TeamDiscoveryDispatchOutcome[] = [{
				itemId: "__discovery_result__",
				status: "blocked",
				error: "discovery-result.json was not found for accepted Discovery run",
				createdAt,
			}];
			await this.workspace.recordAttemptDiscoveryDispatchOutcomes(runId, canvasTask.taskId, attemptId, outcomes);
			return { outcomes, generatedRunOutcomes: [] };
		}

		const outcomes: TeamDiscoveryDispatchOutcome[] = [];
		const generatedRunOutcomes: TeamDiscoveryGeneratedRunOutcome[] = [];
		const activeItemIds = new Set<string>();
		const runDispatcher = typeof roleRunner.runDiscoveryDispatcher === "function"
			? roleRunner.runDiscoveryDispatcher.bind(roleRunner)
			: null;
		const recordDispatchProgress = async (): Promise<void> => {
			await this.workspace.recordAttemptDiscoveryDispatchOutcomes(runId, canvasTask.taskId, attemptId, outcomes).catch(() => {});
		};
		const recordGeneratedRunProgress = async (): Promise<void> => {
			await this.workspace.recordAttemptDiscoveryGeneratedRunOutcomes(
				runId,
				canvasTask.taskId,
				attemptId,
				generatedRunOutcomes,
			).catch(() => {});
		};
		const autoRunPool = this.createDiscoveryGeneratedAutoRunPool({
			discoveryRunId: runId,
			discoveryTaskId: canvasTask.taskId,
			discoveryAttemptId: attemptId,
			enabled: discoverySpec.autoRun?.enabled === true,
			signal,
			onOutcome: async (outcome) => {
				generatedRunOutcomes.push(outcome);
				await recordGeneratedRunProgress();
			},
		});

		if (!runDispatcher) {
			for (const item of discoveryResult.items) {
				if (signal.aborted || await this.isRunCancelledOrMissing(runId)) break;
				const itemId = typeof item.id === "string" && item.id.trim() ? item.id : "__invalid_item_id__";
				if (itemId !== "__invalid_item_id__") activeItemIds.add(itemId);
				outcomes.push({
					itemId,
					status: "blocked",
					error: "role runner does not implement runDiscoveryDispatcher",
					createdAt,
				});
				await recordDispatchProgress();
			}
		} else {
			for (const item of discoveryResult.items) {
				if (signal.aborted || await this.isRunCancelledOrMissing(runId)) break;
				const itemId = typeof item.id === "string" && item.id.trim() ? item.id : "";
				if (!itemId) {
					outcomes.push({
						itemId: "__invalid_item_id__",
						status: "blocked",
						error: "discovery item id is invalid",
						createdAt,
					});
					await recordDispatchProgress();
					continue;
				}
				activeItemIds.add(itemId);
				try {
					const dispatch = await runDispatcher({
						runId,
						discoveryTaskId: canvasTask.taskId,
						discoveryTaskTitle: canvasTask.title,
						discoveryGoal: discoverySpec.discoveryGoal,
						dispatchGoal: discoverySpec.dispatchGoal,
						outputKey: discoveryResult.outputKey,
						itemId,
						itemPayload: item,
						requiredItemFields: discoverySpec.requiredItemFields,
						...(discoverySpec.recommendedItemFields ? { recommendedItemFields: discoverySpec.recommendedItemFields } : {}),
						generatedWorkerAgentId: discoverySpec.generatedWorkerAgentId,
						generatedCheckerAgentId: discoverySpec.generatedCheckerAgentId,
						signal,
					});
					if (signal.aborted || await this.isRunCancelledOrMissing(runId)) break;
					if (!dispatch.ok) {
						outcomes.push({
							itemId,
							status: "blocked",
							error: dispatch.error,
							createdAt,
						});
						await recordDispatchProgress();
						continue;
					}
					if (dispatch.itemId !== itemId) {
						outcomes.push({
							itemId,
							status: "blocked",
							error: `discovery dispatcher item mismatch: expected ${itemId}, got ${dispatch.itemId}`,
							createdAt,
						});
						await recordDispatchProgress();
						continue;
					}
					const upsert = await this.taskStore.upsertGeneratedTaskFromDiscovery({
						sourceDiscoveryTaskId: canvasTask.taskId,
						sourceItemId: itemId,
						itemPayload: item,
						latestDiscoveryRunId: runId,
						latestDiscoveryAttemptId: attemptId,
						latestDiscoveredAt: createdAt,
						leaderAgentId: canvasTask.leaderAgentId,
						generatedWorkerAgentId: discoverySpec.generatedWorkerAgentId,
						generatedCheckerAgentId: discoverySpec.generatedCheckerAgentId,
						workUnit: dispatch.workUnit,
					});
					outcomes.push({
						itemId,
						status: upsert.created ? "created" : "updated",
						generatedTaskId: upsert.task.taskId,
						workUnitMode: upsert.task.generatedSource?.workUnitMode,
						createdAt,
					});
					await recordDispatchProgress();
					if (upsert.task.generatedSource?.itemStatus === "active") {
						autoRunPool.enqueue({ itemId, task: upsert.task });
					}
				} catch (error) {
					if (signal.aborted || await this.isRunCancelledOrMissing(runId)) break;
					outcomes.push({
						itemId,
						status: "blocked",
						error: sanitizeDeliveryError(error),
						createdAt,
					});
					await recordDispatchProgress();
				}
			}
		}

		if (!signal.aborted && !await this.isRunCancelledOrMissing(runId)) {
			const staleTasks = await this.taskStore.markGeneratedTasksStaleForDiscovery(
				canvasTask.taskId,
				activeItemIds,
				{
					latestDiscoveryRunId: runId,
					latestDiscoveryAttemptId: attemptId,
					latestDiscoveredAt: createdAt,
				},
			);
			for (const task of staleTasks) {
				outcomes.push({
					itemId: task.generatedSource!.sourceItemId,
					status: "stale_marked",
					generatedTaskId: task.taskId,
					workUnitMode: task.generatedSource!.workUnitMode,
					createdAt,
				});
			}
			await recordDispatchProgress();
		}

		await autoRunPool.drain();
		return { outcomes, generatedRunOutcomes };
	}

	private createDiscoveryGeneratedAutoRunPool(input: {
		discoveryRunId: string;
		discoveryTaskId: string;
		discoveryAttemptId: string;
		enabled: boolean;
		signal: AbortSignal;
		onOutcome: (outcome: TeamDiscoveryGeneratedRunOutcome) => Promise<void>;
	}): { enqueue: (candidate: DiscoveryGeneratedTaskCandidate) => void; drain: () => Promise<void> } {
		const queue: DiscoveryGeneratedTaskCandidate[] = [];
		const concurrency = input.enabled ? GENERATED_TASK_AUTORUN_CONCURRENCY : 0;
		let activeCount = 0;
		let closed = false;
		let drainResolve: (() => void) | null = null;
		const drainPromise = new Promise<void>((resolve) => { drainResolve = resolve; });
		const settleDrain = (): void => {
			if (input.signal.aborted) queue.length = 0;
			if (closed && activeCount === 0 && (queue.length === 0 || input.signal.aborted)) {
				drainResolve?.();
			}
		};
		const pump = (): void => {
			if (!input.enabled || concurrency <= 0) {
				queue.length = 0;
				settleDrain();
				return;
			}
			if (input.signal.aborted) {
				queue.length = 0;
				settleDrain();
				return;
			}
			while (activeCount < concurrency && queue.length > 0 && !input.signal.aborted) {
				const candidate = queue.shift()!;
				activeCount++;
				void this.launchDiscoveryGeneratedTaskRun({
					discoveryRunId: input.discoveryRunId,
					discoveryTaskId: input.discoveryTaskId,
					discoveryAttemptId: input.discoveryAttemptId,
					candidate,
					signal: input.signal,
				})
					.then(input.onOutcome)
					.catch(async (error) => {
						await input.onOutcome({
							itemId: candidate.itemId,
							generatedTaskId: candidate.task.taskId,
							status: "failed",
							error: sanitizeDeliveryError(error),
							createdAt: now(),
						});
					})
					.finally(() => {
						activeCount--;
						pump();
						settleDrain();
					});
			}
			settleDrain();
		};

		return {
			enqueue: (candidate) => {
				if (!input.enabled || input.signal.aborted) return;
				queue.push(candidate);
				pump();
			},
			drain: async () => {
				closed = true;
				pump();
				if (activeCount === 0 && (queue.length === 0 || input.signal.aborted)) return;
				await drainPromise;
			},
		};
	}

	private async launchDiscoveryGeneratedTaskRun(input: {
		discoveryRunId: string;
		discoveryTaskId: string;
		discoveryAttemptId: string;
		candidate: DiscoveryGeneratedTaskCandidate;
		signal: AbortSignal;
	}): Promise<TeamDiscoveryGeneratedRunOutcome> {
		const { discoveryRunId, discoveryTaskId, discoveryAttemptId, candidate, signal } = input;
		const createdAt = now();
		const latestTask = await this.taskStore.get(candidate.task.taskId);
		const discoveryRun = await this.runs.getRun(discoveryRunId);
		if (!latestTask || latestTask.archived || latestTask.generatedSource?.itemStatus !== "active") {
			return {
				itemId: candidate.itemId,
				generatedTaskId: candidate.task.taskId,
				status: "skipped_not_runnable",
				error: "generated task is not active or no longer exists",
				createdAt,
			};
		}
		if (latestTask.status !== "ready") {
			return {
				itemId: candidate.itemId,
				generatedTaskId: latestTask.taskId,
				status: "skipped_not_runnable",
				error: `generated task must be ready before auto-run: ${latestTask.status}`,
				createdAt,
			};
		}

		const activeRun = (await this.runs.listRuns(latestTask.taskId)).find(run => ACTIVE_RUN_STATUSES.has(run.status));
		if (activeRun) {
			return {
				itemId: candidate.itemId,
				generatedTaskId: latestTask.taskId,
				status: "skipped_already_running",
				generatedRunId: activeRun.runId,
				createdAt,
			};
		}

		try {
			const generatedRun = await this.runs.createRun(latestTask.taskId, {
				publicBaseUrl: discoveryRun?.source?.publicBaseUrl,
				triggeredBy: {
					type: "discovery-generated-task",
					discoveryTaskId,
					discoveryRunId,
					discoveryAttemptId,
					sourceItemId: candidate.itemId,
				},
			});
			try {
				await this.waitForTerminalGeneratedRun(generatedRun.runId, signal);
			} catch {
				// The launch succeeded; waiting is only used to enforce the v1 pool.
				if (signal.aborted) {
					await this.runs.cancelRun(generatedRun.runId, "discovery root run cancelled").catch(() => {});
				}
			}
			return {
				itemId: candidate.itemId,
				generatedTaskId: latestTask.taskId,
				status: "started",
				generatedRunId: generatedRun.runId,
				createdAt,
			};
		} catch (error) {
			const activeRunId = parseActiveTaskRunError(error);
			if (activeRunId) {
				return {
					itemId: candidate.itemId,
					generatedTaskId: latestTask.taskId,
					status: "skipped_already_running",
					generatedRunId: activeRunId,
					createdAt,
				};
			}
			if (isNotRunnableLaunchError(error)) {
				return {
					itemId: candidate.itemId,
					generatedTaskId: latestTask.taskId,
					status: "skipped_not_runnable",
					error: sanitizeDeliveryError(error),
					createdAt,
				};
			}
			return {
				itemId: candidate.itemId,
				generatedTaskId: latestTask.taskId,
				status: "failed",
				error: sanitizeDeliveryError(error),
				createdAt,
			};
		}
	}

	private async waitForTerminalGeneratedRun(runId: string, signal: AbortSignal): Promise<void> {
		while (true) {
			if (signal.aborted) throw new Error("run cancelled");
			const run = await this.runs.getRun(runId);
			if (!run) throw new Error(`generated run disappeared: ${runId}`);
			if (TERMINAL_RUN_STATUSES.has(run.status)) return;
			await delay(GENERATED_TASK_AUTORUN_POLL_MS, signal);
		}
	}

	private async writeDiscoveryAggregation(
		discoveryRunId: string,
		discoveryTask: TeamCanvasTask,
		discoveryAttemptId: string,
		dispatchOutcomes: TeamDiscoveryDispatchOutcome[],
		generatedRunOutcomes: TeamDiscoveryGeneratedRunOutcome[],
	): Promise<string | null> {
		const discoveryResult = await this.workspace.readDiscoveryResult(discoveryRunId, discoveryTask.taskId, discoveryAttemptId);
		if (!discoveryResult) return null;

		const dispatchByItemId = new Map(dispatchOutcomes.map(outcome => [outcome.itemId, outcome]));
		const launchByItemId = new Map(generatedRunOutcomes.map(outcome => [outcome.itemId, outcome]));
		const generatedTasks = await this.taskStore.listGeneratedForDiscoveryTask(discoveryTask.taskId);
		const generatedTaskByItemId = new Map(generatedTasks.map(task => [task.generatedSource!.sourceItemId, task]));
		const summary: TeamDiscoveryAggregationRecord["summary"] = {
			totalItems: discoveryResult.items.length,
			generatedTasks: 0,
			succeeded: 0,
			failed: 0,
			cancelled: 0,
			skipped: 0,
			missingResult: 0,
		};
		const items: TeamDiscoveryAggregationRecord["items"] = [];

		for (const itemPayload of discoveryResult.items) {
			const itemId = typeof itemPayload.id === "string" ? itemPayload.id : "";
			const dispatch = itemId ? dispatchByItemId.get(itemId) ?? null : null;
			const launch = itemId ? launchByItemId.get(itemId) : undefined;
			const generatedTaskId = dispatch?.generatedTaskId ?? (itemId ? generatedTaskByItemId.get(itemId)?.taskId : undefined);
			const generatedRunId = launch?.generatedRunId;
			let generatedRunStatus: TeamRunState["status"] | undefined;
			let result: TeamDiscoveryAggregationRecord["items"][number]["result"] = {
				status: "missing",
				errorSummary: "generated child run result was not found",
			};

			if (generatedTaskId) summary.generatedTasks += 1;

			if (!generatedTaskId || dispatch?.status === "blocked") {
				result = {
					status: "skipped",
					errorSummary: dispatch?.error ?? "discovery item was not dispatched to a generated task",
				};
			} else if (!generatedRunId) {
				result = {
					status: launch?.status === "failed" ? "failed" : "skipped",
					errorSummary: launch?.error ?? "generated child run was not started",
				};
			} else {
				const generatedRun = await this.runs.getRun(generatedRunId);
				generatedRunStatus = generatedRun?.status;
				const taskState = generatedRun?.taskStates[generatedTaskId];
				const resultRef = taskState?.resultRef ?? null;
				const content = resultRef ? await this.workspace.readRunScopedFile(generatedRunId, resultRef) : null;
				if (taskState?.status === "succeeded" && content) {
					result = { status: "succeeded", resultRef, content, errorSummary: null };
				} else if (taskState?.status === "failed" || generatedRun?.status === "failed" || generatedRun?.status === "completed_with_failures") {
					result = {
						status: "failed",
						resultRef,
						...(content ? { content } : {}),
						errorSummary: taskState?.errorSummary ?? generatedRun?.lastError ?? null,
					};
				} else if (taskState?.status === "cancelled" || generatedRun?.status === "cancelled") {
					result = {
						status: "cancelled",
						resultRef,
						...(content ? { content } : {}),
						errorSummary: taskState?.errorSummary ?? generatedRun?.lastError ?? null,
					};
				} else {
					result = {
						status: "missing",
						resultRef,
						errorSummary: taskState?.errorSummary ?? "generated child run did not produce a readable result",
					};
				}
			}

			if (result.status === "succeeded") summary.succeeded += 1;
			if (result.status === "failed") summary.failed += 1;
			if (result.status === "cancelled") summary.cancelled += 1;
			if (result.status === "skipped") summary.skipped += 1;
			if (result.status === "missing") summary.missingResult += 1;

			items.push({
				itemId,
				itemPayload,
				dispatch,
				...(generatedTaskId ? { generatedTaskId } : {}),
				...(generatedRunId ? { generatedRunId } : {}),
				...(generatedRunStatus ? { generatedRunStatus } : {}),
				result,
			});
		}

		return this.workspace.writeDiscoveryAggregation(discoveryRunId, discoveryTask.taskId, discoveryAttemptId, {
			schemaVersion: "team/discovery-aggregation-1",
			discoveryTaskId: discoveryTask.taskId,
			discoveryRunId,
			discoveryAttemptId,
			outputKey: discoveryResult.outputKey,
			sourceResultRef: `tasks/${discoveryTask.taskId}/attempts/${discoveryAttemptId}/discovery-result.json`,
			createdAt: now(),
			summary,
			items,
		});
	}
}
