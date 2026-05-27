import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateTaskId } from "./ids.js";
import type { TeamCanvasTask, TeamCanvasTaskStatus } from "./types.js";
import {
	type CreateTeamCanvasTaskInput,
	type TaskValidationContext,
	type UpdateTeamCanvasTaskInput,
	validateCreateTaskInput,
	validateTaskUpdateInput,
} from "./task-validation.js";

export interface TaskStoreListOptions {
	includeArchived?: boolean;
}

export interface TaskStoreOptions {
	getAgentIds?: () => Iterable<string>;
}

export class TaskStore {
	constructor(
		private readonly rootDir: string,
		private readonly options: TaskStoreOptions = {},
	) {}

	async create(input: CreateTeamCanvasTaskInput): Promise<TeamCanvasTask> {
		validateCreateTaskInput(input, this.validationContext());
		const now = new Date().toISOString();
		const task: TeamCanvasTask = {
			taskId: generateTaskId(),
			title: input.title,
			leaderAgentId: input.leaderAgentId,
			workUnit: input.workUnit,
			status: input.status ?? "drafting",
			createdAt: now,
			updatedAt: now,
			...(input.createdByAgentId ? { createdByAgentId: input.createdByAgentId } : {}),
			archived: false,
		};
		await this.write(task);
		return task;
	}

	async list(options: TaskStoreListOptions = {}): Promise<TeamCanvasTask[]> {
		const tasksDir = join(this.rootDir, "tasks");
		try {
			const { readdir } = await import("node:fs/promises");
			const files = await readdir(tasksDir);
			const tasks: TeamCanvasTask[] = [];
			for (const file of files) {
				if (!file.endsWith(".json")) continue;
				const data = await this.readJson<TeamCanvasTask>(join(tasksDir, file));
				if (!data) continue;
				const task = this.normalize(data);
				if (!options.includeArchived && task.archived) continue;
				tasks.push(task);
			}
			return tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		} catch {
			return [];
		}
	}

	async get(taskId: string): Promise<TeamCanvasTask | null> {
		const data = await this.readJson<TeamCanvasTask>(join(this.rootDir, "tasks", `${taskId}.json`));
		return data ? this.normalize(data) : null;
	}

	async update(taskId: string, patch: UpdateTeamCanvasTaskInput): Promise<TeamCanvasTask> {
		const existing = await this.get(taskId);
		if (!existing) throw new Error(`task not found: ${taskId}`);
		validateTaskUpdateInput(existing, patch, this.validationContext());
		const updated: TeamCanvasTask = {
			...existing,
			...patch,
			updatedAt: new Date().toISOString(),
		};
		await this.write(updated);
		return updated;
	}

	async archive(taskId: string): Promise<TeamCanvasTask> {
		const existing = await this.get(taskId);
		if (!existing) throw new Error(`task not found: ${taskId}`);
		if (existing.archived) throw new Error(`already archived: ${taskId}`);
		const updated: TeamCanvasTask = {
			...existing,
			status: "archived",
			archived: true,
			updatedAt: new Date().toISOString(),
		};
		await this.write(updated);
		return updated;
	}

	private validationContext(): TaskValidationContext {
		const ids = this.options.getAgentIds?.();
		return ids ? { availableAgentIds: new Set(ids) } : {};
	}

	private normalize(task: TeamCanvasTask): TeamCanvasTask {
		const status = (task.status ?? "drafting") as TeamCanvasTaskStatus;
		return {
			...task,
			status,
			archived: task.archived ?? false,
		};
	}

	private async write(task: TeamCanvasTask): Promise<void> {
		const tasksDir = join(this.rootDir, "tasks");
		await mkdir(tasksDir, { recursive: true });
		const filePath = join(tasksDir, `${task.taskId}.json`);
		const tmp = filePath + ".tmp";
		await writeFile(tmp, JSON.stringify(task, null, 2), "utf8");
		await rename(tmp, filePath);
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
