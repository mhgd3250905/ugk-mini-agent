import type { TaskStore } from "./task-store.js";
import type { RunWorkspace } from "./run-workspace.js";
import type {
	TeamCanvasTask,
	TeamRunState,
	TeamTaskArtifactBoundInput,
	TeamTaskBoundInput,
	TeamWorklistRecord,
	TeamWorklistResultsRecord,
} from "./types.js";
import { parseTeamWorklistContent, validateTeamWorklistResults } from "./worklist-contract.js";
import { compileSplitTaskItemWorkUnit } from "./split-task-workunit-compiler.js";

const now = () => new Date().toISOString();
const TERMINAL_RUN_STATUSES = new Set(["completed", "completed_with_failures", "failed", "cancelled"]);
const SPLIT_POLL_MS = 25;

type TriggeredBy = NonNullable<TeamRunState["source"]>["triggeredBy"];

export type SplitTaskLifecycleTaskStore = Pick<TaskStore,
	| "get"
	| "upsertGeneratedTaskFromSource"
	| "markGeneratedTasksStaleForSource"
	| "listGeneratedForSourceTask"
>;

export type SplitTaskLifecycleWorkspace = Pick<RunWorkspace,
	| "patchState"
	| "readRunScopedFile"
	| "writeWorklistResults"
>;

export type SplitTaskLifecycleRuns = {
	getRun(runId: string): Promise<TeamRunState | null>;
	createRun(taskId: string, options?: { publicBaseUrl?: string; triggeredBy?: TriggeredBy }): Promise<TeamRunState>;
	cancelRun(runId: string, reason?: string): Promise<TeamRunState>;
};

export interface SplitTaskLifecycleOptions {
	taskStore: SplitTaskLifecycleTaskStore;
	workspace: SplitTaskLifecycleWorkspace;
	runs: SplitTaskLifecycleRuns;
}

interface SplitChildRunOutcome {
	itemId: string;
	generatedTaskId?: string;
	generatedRunId?: string;
	status: "succeeded" | "failed" | "cancelled" | "missing";
	resultRef?: string | null;
	content?: string;
	errorSummary?: string | null;
}

export class SplitTaskLifecycle {
	constructor(private readonly options: SplitTaskLifecycleOptions) {}

	async run(input: {
		runId: string;
		splitTask: TeamCanvasTask;
		attemptId: string;
		boundInputs: TeamTaskBoundInput[];
		publicBaseUrl?: string;
		signal: AbortSignal;
	}): Promise<{ status: "succeeded" | "failed" | "cancelled-or-missing"; resultRef: string | null; errorSummary?: string }> {
		const spec = input.splitTask.splitTaskSpec;
		if (!spec) throw new Error("splitTaskSpec is required");
		await this.markSplitRunDispatching(input.runId, input.splitTask.taskId);
		const worklist = await this.readInputWorklist(input.runId, spec.inputPortId, input.boundInputs);
		if (input.signal.aborted || await this.isRunCancelledOrMissing(input.runId)) return { status: "cancelled-or-missing", resultRef: null };

		const activeItemIds = new Set<string>();
		const outcomes: SplitChildRunOutcome[] = [];
		const queue = [...worklist.items];
		let activeCount = 0;
		let nextIndex = 0;
		const concurrency = Math.max(1, Math.min(10, spec.autoRun.concurrency));

		await new Promise<void>((resolve) => {
			const pump = () => {
				if (input.signal.aborted) {
					resolve();
					return;
				}
				while (activeCount < concurrency && nextIndex < queue.length) {
					const item = queue[nextIndex++]!;
					activeItemIds.add(item.id);
					activeCount++;
					void this.runOneItem({
						runId: input.runId,
						splitTask: input.splitTask,
						attemptId: input.attemptId,
						worklist,
						item,
						publicBaseUrl: input.publicBaseUrl,
						signal: input.signal,
					}).then(outcome => {
						outcomes.push(outcome);
					}).catch(error => {
						outcomes.push({
							itemId: item.id,
							status: "failed",
							errorSummary: error instanceof Error ? error.message : String(error),
						});
					}).finally(() => {
						activeCount--;
						pump();
					});
				}
				if (activeCount === 0 && nextIndex >= queue.length) resolve();
			};
			pump();
		});

		if (input.signal.aborted || await this.isRunCancelledOrMissing(input.runId)) return { status: "cancelled-or-missing", resultRef: null };

		await this.options.taskStore.markGeneratedTasksStaleForSource("split-task", input.splitTask.taskId, activeItemIds, {
			latestSourceRunId: input.runId,
			latestSourceAttemptId: input.attemptId,
			latestSourceAt: now(),
		});

		const record = this.buildResultsRecord(worklist, outcomes);
		const validated = validateTeamWorklistResults(record, { requireFullCoverage: spec.collectPolicy.requireFullCoverage });
		const resultRef = await this.options.workspace.writeWorklistResults(input.runId, input.splitTask.taskId, input.attemptId, validated);
		const hasFailed = validated.summary.failed > 0 || validated.summary.cancelled > 0 || validated.summary.missing > 0;
		if (spec.collectPolicy.requireAllItemsSucceeded && hasFailed) {
			return { status: "failed", resultRef, errorSummary: "split-task child results did not all succeed" };
		}
		return { status: "succeeded", resultRef };
	}

	private async runOneItem(input: {
		runId: string;
		splitTask: TeamCanvasTask;
		attemptId: string;
		worklist: TeamWorklistRecord;
		item: TeamWorklistRecord["items"][number];
		publicBaseUrl?: string;
		signal: AbortSignal;
	}): Promise<SplitChildRunOutcome> {
		const spec = input.splitTask.splitTaskSpec!;
		const workUnit = compileSplitTaskItemWorkUnit({
			splitTaskTitle: input.splitTask.title,
			splitTaskId: input.splitTask.taskId,
			worklistId: input.worklist.worklistId,
			item: input.item,
			spec,
		});
		const upsert = await this.options.taskStore.upsertGeneratedTaskFromSource({
			sourceKind: "split-task",
			sourceTaskId: input.splitTask.taskId,
			sourceItemId: input.item.id,
			itemPayload: {
				id: input.item.id,
				title: input.item.title,
				input: input.item.input,
				...(input.item.acceptanceHints ? { acceptanceHints: input.item.acceptanceHints } : {}),
			},
			latestSourceRunId: input.runId,
			latestSourceAttemptId: input.attemptId,
			latestSourceAt: now(),
			leaderAgentId: input.splitTask.leaderAgentId,
			generatedWorkerAgentId: spec.generatedWorkerAgentId,
			generatedCheckerAgentId: spec.generatedCheckerAgentId,
			workUnit,
		});
		const childRun = await this.options.runs.createRun(upsert.task.taskId, {
			publicBaseUrl: input.publicBaseUrl,
			triggeredBy: {
				type: "split-generated-task",
				splitTaskId: input.splitTask.taskId,
				splitRunId: input.runId,
				splitAttemptId: input.attemptId,
				sourceItemId: input.item.id,
			},
		});
		try {
			await this.waitForTerminalRun(childRun.runId, input.signal);
		} catch (error) {
			if (input.signal.aborted) {
				await this.options.runs.cancelRun(childRun.runId, "split-task root run cancelled").catch(() => {});
			}
			throw error;
		}
		const latestRun = await this.options.runs.getRun(childRun.runId);
		const taskState = latestRun?.taskStates[upsert.task.taskId];
		const resultRef = taskState?.resultRef ?? null;
		const content = resultRef ? await this.options.workspace.readRunScopedFile(childRun.runId, resultRef) : null;
		if (taskState?.status === "succeeded") {
			return {
				itemId: input.item.id,
				generatedTaskId: upsert.task.taskId,
				generatedRunId: childRun.runId,
				status: "succeeded",
				resultRef,
				...(content ? { content } : {}),
			};
		}
		if (latestRun?.status === "cancelled" || taskState?.status === "cancelled") {
			return {
				itemId: input.item.id,
				generatedTaskId: upsert.task.taskId,
				generatedRunId: childRun.runId,
				status: "cancelled",
				resultRef,
				...(content ? { content } : {}),
				errorSummary: taskState?.errorSummary ?? latestRun?.lastError ?? "child run cancelled",
			};
		}
		return {
			itemId: input.item.id,
			generatedTaskId: upsert.task.taskId,
			generatedRunId: childRun.runId,
			status: taskState ? "failed" : "missing",
			resultRef,
			...(content ? { content } : {}),
			errorSummary: taskState?.errorSummary ?? latestRun?.lastError ?? "child run did not produce a result",
		};
	}

	private buildResultsRecord(worklist: TeamWorklistRecord, outcomes: SplitChildRunOutcome[]): TeamWorklistResultsRecord {
		const outcomeByItemId = new Map(outcomes.map(outcome => [outcome.itemId, outcome]));
		const results = worklist.items.map(item => {
			const outcome = outcomeByItemId.get(item.id);
			if (!outcome) {
				return { itemId: item.id, status: "missing" as const, errorSummary: "child run was not started" };
			}
			return {
				itemId: item.id,
				status: outcome.status,
				...(outcome.generatedTaskId ? { generatedTaskId: outcome.generatedTaskId } : {}),
				...(outcome.generatedRunId ? { generatedRunId: outcome.generatedRunId } : {}),
				...(outcome.resultRef ? { resultRef: outcome.resultRef } : {}),
				...(outcome.content ? { content: outcome.content } : {}),
				...(outcome.errorSummary ? { errorSummary: outcome.errorSummary } : {}),
			};
		});
		return {
			schemaVersion: "team/worklist-results-1",
			sourceWorklist: worklist,
			summary: {
				totalItems: worklist.items.length,
				succeeded: results.filter(result => result.status === "succeeded").length,
				failed: results.filter(result => result.status === "failed").length,
				cancelled: results.filter(result => result.status === "cancelled").length,
				missing: results.filter(result => result.status === "missing").length,
			},
			results,
			createdAt: now(),
		};
	}

	private async readInputWorklist(runId: string, inputPortId: string, boundInputs: TeamTaskBoundInput[]): Promise<TeamWorklistRecord> {
		const boundInput = boundInputs.find(input => input.inputPortId === inputPortId);
		if (!boundInput) throw new Error(`split-task worklist input not found for port: ${inputPortId}`);
		if (boundInput.source === "canvas-source") {
			if (boundInput.artifact.type !== "worklist") throw new Error("split-task input artifact type must be worklist");
			return parseTeamWorklistContent(boundInput.artifact.content ?? boundInput.artifact.preview);
		}
		const artifactInput = boundInput as TeamTaskArtifactBoundInput;
		if (artifactInput.artifact.type !== "worklist") throw new Error("split-task input artifact type must be worklist");
		const fullContent = await this.options.workspace.readRunScopedFile(artifactInput.artifact.sourceRunId || runId, artifactInput.artifact.fileRef);
		return parseTeamWorklistContent(fullContent ?? artifactInput.artifact.content ?? artifactInput.artifact.preview);
	}

	private async waitForTerminalRun(runId: string, signal: AbortSignal): Promise<void> {
		while (true) {
			if (signal.aborted) throw new Error("run cancelled");
			const run = await this.options.runs.getRun(runId);
			if (!run) throw new Error(`split child run disappeared: ${runId}`);
			if (TERMINAL_RUN_STATUSES.has(run.status)) return;
			await delay(SPLIT_POLL_MS, signal);
		}
	}

	private async isRunCancelledOrMissing(runId: string): Promise<boolean> {
		const state = await this.options.runs.getRun(runId);
		return !state || state.status === "cancelled";
	}

	private async markSplitRunDispatching(runId: string, taskId: string): Promise<void> {
		const timestamp = now();
		await this.options.workspace.patchState(runId, (state) => {
			const taskState = state.taskStates[taskId];
			if (taskState) {
				taskState.status = "running";
				taskState.errorSummary = null;
				taskState.progress = {
					phase: "writing_result",
					message: "正在派发并运行 split-task 子任务",
					updatedAt: timestamp,
				};
			}
			state.status = "running";
			state.currentTaskId = taskId;
			state.updatedAt = timestamp;
		});
	}
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
