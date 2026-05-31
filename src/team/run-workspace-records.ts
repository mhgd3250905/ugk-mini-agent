import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renameWithTransientRetry } from "../file-system.js";
import { progressMessages } from "./progress.js";
import type { RunStateStore } from "./run-workspace-state.js";
import type { TaskDecompositionRecord, TaskExpansionRecord, TeamRunState, TeamTask } from "./types.js";

function taskRecordFileName(taskId: string): string {
	return `${encodeURIComponent(taskId)}.json`;
}

export class RunRecordStore {
	constructor(
		private readonly rootDir: string,
		private readonly stateStore: Pick<RunStateStore, "patchState">,
	) {}

	async writeExpansion(runId: string, record: TaskExpansionRecord): Promise<void> {
		const dir = join(this.rootDir, "runs", runId, "expansions");
		await mkdir(dir, { recursive: true });
		const filePath = join(dir, taskRecordFileName(record.parentTaskId));
		const tmp = filePath + ".tmp";
		await writeFile(tmp, JSON.stringify(record, null, 2), "utf8");
		await renameWithTransientRetry(tmp, filePath);
	}

	async readExpansion(runId: string, parentTaskId: string): Promise<TaskExpansionRecord | null> {
		return this.readJson<TaskExpansionRecord>(join(this.rootDir, "runs", runId, "expansions", taskRecordFileName(parentTaskId)));
	}

	async writeDecomposition(runId: string, record: TaskDecompositionRecord): Promise<void> {
		const dir = join(this.rootDir, "runs", runId, "decompositions");
		await mkdir(dir, { recursive: true });
		const filePath = join(dir, taskRecordFileName(record.parentTaskId));
		const tmp = filePath + ".tmp";
		await writeFile(tmp, JSON.stringify(record, null, 2), "utf8");
		await renameWithTransientRetry(tmp, filePath);
	}

	async readDecomposition(runId: string, parentTaskId: string): Promise<TaskDecompositionRecord | null> {
		return this.readJson<TaskDecompositionRecord>(join(this.rootDir, "runs", runId, "decompositions", taskRecordFileName(parentTaskId)));
	}

	async appendChildTaskStates(runId: string, children: TeamTask[]): Promise<TeamRunState> {
		return this.stateStore.patchState(runId, (state) => {
			const ts = new Date().toISOString();
			for (const child of children) {
				if (state.taskStates[child.id]) continue;
				state.taskStates[child.id] = {
					status: "pending",
					attemptCount: 0,
					activeAttemptId: null,
					resultRef: null,
					errorSummary: null,
					progress: { phase: "pending", message: progressMessages.pending, updatedAt: ts },
				};
			}
			state.summary.totalTasks = Object.keys(state.taskStates).length;
			state.updatedAt = ts;
		});
	}

	private async readJson<T>(filePath: string): Promise<T | null> {
		try {
			const data = await readFile(filePath, "utf8");
			return JSON.parse(data) as T;
		} catch {
			return null;
		}
	}
}
