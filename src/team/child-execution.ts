import type { TeamPlan, TeamRunState, TeamTask } from "./types.js";
import type { RunWorkspace } from "./run-workspace.js";

export type ParallelChildStateWriterWorkspace = Pick<RunWorkspace, "patchState">;

export type ExpandedChildExecutionWorkspace = Pick<RunWorkspace,
	| "getState"
	| "saveState"
	| "patchState"
	| "readExpansion"
>;
import { computeTeamRunSummary } from "./team-summary.js";
import { progressMessages } from "./progress.js";

export interface TeamStateWriter {
	saveState(state: TeamRunState): Promise<void>;
}

export const TERMINAL_TASK_STATUSES = new Set(["succeeded", "failed", "cancelled", "skipped"]);

const now = () => new Date().toISOString();
const PARALLEL_FOR_EACH_CONCURRENCY = 3;

export class ParallelChildStateWriter implements TeamStateWriter {
	constructor(
		private readonly workspace: ParallelChildStateWriterWorkspace,
		private readonly runId: string,
		private readonly taskId: string,
	) {}

	async saveState(state: TeamRunState): Promise<void> {
		await this.workspace.patchState(this.runId, (latest) => {
			if (latest.status !== "running") return;
			const latestTask = latest.taskStates[this.taskId];
			if (latestTask && (TERMINAL_TASK_STATUSES.has(latestTask.status) || latestTask.status === "interrupted")) {
				return;
			}
			latest.taskStates[this.taskId] = state.taskStates[this.taskId]!;
			latest.summary = computeTeamRunSummary(latest.taskStates);
		});
	}
}

export function hydrateExpandedChildTasks(
	children: NonNullable<Awaited<ReturnType<ExpandedChildExecutionWorkspace["readExpansion"]>>>["children"],
	parentTaskId: string,
): TeamTask[] {
	return children.map(c => {
		if (c.task) {
			const t = c.task;
			return {
				...t,
				generated: t.generated ?? true,
				sourceItemId: t.sourceItemId ?? c.sourceItemId,
				sourceItem: t.sourceItem ?? c.sourceItem,
			};
		}
		return {
			id: c.taskId,
			type: "normal" as const,
			title: c.title,
			input: { text: c.title },
			acceptance: { rules: ["output is valid"] },
			parentTaskId,
			sourceItemId: c.sourceItemId,
			sourceItem: c.sourceItem,
			generated: true,
		};
	});
}

export interface ExpandedChildExecutionModuleOptions {
	workspace: ExpandedChildExecutionWorkspace;
	shouldStop: (state: TeamRunState | null | undefined) => boolean;
	isTimedOut: (state: TeamRunState) => boolean;
	handleTimeout: (state: TeamRunState, plan: TeamPlan) => Promise<void>;
	executeChild: (state: TeamRunState, child: TeamTask, plan: TeamPlan, signal: AbortSignal, writer: TeamStateWriter) => Promise<void>;
}

export interface ExpandedChildExecutionInput {
	runId: string;
	parentTask: TeamTask;
	childTasks: TeamTask[];
	plan: TeamPlan;
	mode: "sequential" | "parallel";
	signal: AbortSignal;
}

export class ExpandedChildExecutionModule {
	constructor(private readonly options: ExpandedChildExecutionModuleOptions) {}

	async execute(input: ExpandedChildExecutionInput): Promise<void> {
		if (input.mode === "parallel") {
			await this.executeParallel(input);
			return;
		}
		await this.executeSequential(input);
	}

	private async executeSequential(input: ExpandedChildExecutionInput): Promise<void> {
		const { workspace, shouldStop, isTimedOut, handleTimeout, executeChild } = this.options;
		let state: TeamRunState;
		for (const child of input.childTasks) {
			state = (await workspace.getState(input.runId))!;
			if (state.status !== "running" || shouldStop(state)) break;
			if (TERMINAL_TASK_STATUSES.has(state.taskStates[child.id]?.status ?? "pending")) continue;
			if (input.signal.aborted) break;
			if (isTimedOut(state)) {
				await handleTimeout(state, input.plan);
				return;
			}
			await executeChild(state, child, input.plan, input.signal, workspace);
		}
		await this.applySequentialParentSummary(input);
	}

	private async executeParallel(input: ExpandedChildExecutionInput): Promise<void> {
		const { workspace, shouldStop, isTimedOut, handleTimeout, executeChild } = this.options;
		let state = (await workspace.getState(input.runId))!;
		const queue: TeamTask[] = [];
		for (const child of input.childTasks) {
			const cs = state.taskStates[child.id];
			if (!cs || !TERMINAL_TASK_STATUSES.has(cs.status)) {
				queue.push(child);
			}
		}

		if (queue.length > 0) {
			const active = new Set<Promise<void>>();
			let nextIdx = 0;

			const startChild = async (child: TeamTask): Promise<void> => {
				let needsTimeout = false;
				try {
					const current = await workspace.getState(input.runId);
					if (!current || current.status !== "running" || shouldStop(current) || input.signal.aborted) return;
					if (isTimedOut(current)) {
						needsTimeout = true;
						return;
					}
					const cs = current.taskStates[child.id];
					if (cs && TERMINAL_TASK_STATUSES.has(cs.status)) return;
					const scopedWriter = new ParallelChildStateWriter(workspace, input.runId, child.id);
					await executeChild(current, child, input.plan, input.signal, scopedWriter);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					await workspace.patchState(input.runId, (latest) => {
						if (latest.status !== "running") return;
						const childState = latest.taskStates[child.id];
						if (childState && !TERMINAL_TASK_STATUSES.has(childState.status)) {
							childState.status = "failed";
							childState.errorSummary = `unexpected error: ${msg}`;
							childState.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
						}
						latest.summary = computeTeamRunSummary(latest.taskStates);
					});
				}
				if (needsTimeout) {
					await handleTimeout((await workspace.getState(input.runId))!, input.plan);
				}
			};

			const launch = (child: TeamTask) => {
				const p = startChild(child).finally(() => { active.delete(p); });
				active.add(p);
			};

			while (nextIdx < queue.length && active.size < PARALLEL_FOR_EACH_CONCURRENCY) {
				const current = await workspace.getState(input.runId);
				if (!current || current.status !== "running" || shouldStop(current) || input.signal.aborted) break;
				if (isTimedOut(current)) {
					await handleTimeout(current, input.plan);
					break;
				}
				launch(queue[nextIdx]!);
				nextIdx++;
			}

			let fatalError: unknown = null;

			while (active.size > 0 && !fatalError) {
				try {
					await Promise.race(active);
				} catch (err) {
					fatalError = err;
					break;
				}
				while (nextIdx < queue.length && active.size < PARALLEL_FOR_EACH_CONCURRENCY) {
					const current = await workspace.getState(input.runId);
					if (!current || current.status !== "running" || shouldStop(current) || input.signal.aborted) break;
					if (isTimedOut(current)) {
						await handleTimeout(current, input.plan);
						break;
					}
					launch(queue[nextIdx]!);
					nextIdx++;
				}
			}

			if (active.size > 0) {
				await Promise.allSettled(Array.from(active));
			}

			if (fatalError) {
				throw fatalError;
			}
		}

		await this.applyParallelParentSummary(input);
	}

	private async applySequentialParentSummary(input: ExpandedChildExecutionInput): Promise<void> {
		const { workspace, shouldStop } = this.options;
		const state = (await workspace.getState(input.runId))!;
		if (state.status !== "running" || shouldStop(state)) return;
		const allDone = input.childTasks.every(c => {
			const cs = state.taskStates[c.id];
			return cs && TERMINAL_TASK_STATUSES.has(cs.status);
		});
		if (!allDone) return;
		const ts = state.taskStates[input.parentTask.id]!;
		if (TERMINAL_TASK_STATUSES.has(ts.status)) return;
		const anyFailed = input.childTasks.some(c => state.taskStates[c.id]?.status === "failed");
		if (anyFailed) {
			ts.status = "failed";
			ts.errorSummary = "one or more child tasks failed";
			ts.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
		} else {
			const allSkipped = input.childTasks.every(c => state.taskStates[c.id]?.status === "skipped");
			if (allSkipped) {
				ts.status = "skipped";
				ts.errorSummary = null;
				ts.progress = { phase: "skipped", message: progressMessages.skipped, updatedAt: now() };
			} else {
				ts.status = "succeeded";
				ts.errorSummary = null;
				ts.progress = { phase: "succeeded", message: progressMessages.succeeded, updatedAt: now() };
			}
		}
		state.updatedAt = now();
		state.summary = computeTeamRunSummary(state.taskStates);
		await workspace.saveState(state);
	}

	private async applyParallelParentSummary(input: ExpandedChildExecutionInput): Promise<void> {
		const { workspace, shouldStop } = this.options;
		await workspace.patchState(input.runId, (s) => {
			if (s.status !== "running" || shouldStop(s)) return;
			const allDone = input.childTasks.every(c => {
				const cs = s.taskStates[c.id];
				return cs && TERMINAL_TASK_STATUSES.has(cs.status);
			});
			if (!allDone) return;
			const anySucceeded = input.childTasks.some(c => s.taskStates[c.id]?.status === "succeeded");
			const allSkipped = input.childTasks.every(c => s.taskStates[c.id]?.status === "skipped");
			const ts = s.taskStates[input.parentTask.id]!;
			if (anySucceeded) {
				ts.status = "succeeded";
				ts.errorSummary = null;
				ts.progress = { phase: "succeeded", message: progressMessages.succeeded, updatedAt: now() };
			} else if (allSkipped) {
				ts.status = "skipped";
				ts.errorSummary = null;
				ts.progress = { phase: "skipped", message: progressMessages.skipped, updatedAt: now() };
			} else {
				ts.status = "failed";
				ts.errorSummary = "one or more child tasks failed";
				ts.progress = { phase: "failed", message: progressMessages.failed, updatedAt: now() };
			}
			s.summary = computeTeamRunSummary(s.taskStates);
		});
	}
}
