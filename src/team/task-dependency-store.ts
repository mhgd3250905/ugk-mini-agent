import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateTaskDependencyId } from "./ids.js";
import { resolveDependencyStaleReason, wouldCreateTaskGraphCycle, type TaskGraphEdge } from "./task-chain-contract.js";
import type { TaskStore } from "./task-store.js";
import type { ResolvedTaskDependency, TeamTaskDependency, TeamTaskConnection } from "./types.js";

const now = () => new Date().toISOString();

export class TaskDependencyStore {
	private readonly filePath: string;
	private getExistingConnections: (() => Promise<TeamTaskConnection[]>) | undefined;

	constructor(
		private readonly rootDir: string,
		private readonly taskStore: TaskStore,
	) {
		this.filePath = join(rootDir, "task-dependencies.json");
	}

	setExistingConnections(connections: () => Promise<TeamTaskConnection[]>): void {
		this.getExistingConnections = connections;
	}

	async list(): Promise<TeamTaskDependency[]> {
		const dependencies = await this.readAll();
		return dependencies.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	}

	async listFromTask(taskId: string): Promise<TeamTaskDependency[]> {
		return (await this.list()).filter(dep => dep.fromTaskId === taskId);
	}

	async listResolved(): Promise<ResolvedTaskDependency[]> {
		const dependencies = await this.list();
		const resolved: ResolvedTaskDependency[] = [];
		for (const dep of dependencies) {
			const sourceTask = await this.taskStore.get(dep.fromTaskId);
			const targetTask = await this.taskStore.get(dep.toTaskId);
			const staleReason = resolveDependencyStaleReason(sourceTask, targetTask);
			resolved.push({
				...dep,
				status: staleReason ? "stale" : "active",
				...(staleReason ? { staleReason } : {}),
			});
		}
		return resolved;
	}

	async create(input: { fromTaskId: string; toTaskId: string }): Promise<TeamTaskDependency> {
		const fromTaskId = assertStableString(input.fromTaskId, "fromTaskId is required");
		const toTaskId = assertStableString(input.toTaskId, "toTaskId is required");
		if (fromTaskId === toTaskId) {
			throw new Error("task dependency cannot target the same task");
		}

		const fromTask = await this.taskStore.get(fromTaskId);
		if (!fromTask) throw new Error(`task not found: ${fromTaskId}`);
		if (fromTask.archived) throw new Error(`archived task cannot be dependency source: ${fromTaskId}`);
		const toTask = await this.taskStore.get(toTaskId);
		if (!toTask) throw new Error(`task not found: ${toTaskId}`);
		if (toTask.archived) throw new Error(`archived task cannot be dependency target: ${toTaskId}`);

		return this.withMutationLock(async () => {
			const dependencies = await this.readAll();
			if (dependencies.some(dep =>
				dep.fromTaskId === fromTaskId &&
				dep.toTaskId === toTaskId
			)) {
				throw new Error("task dependency already exists");
			}

			const edges: TaskGraphEdge[] = [
				...dependencies.map(d => ({ fromTaskId: d.fromTaskId, toTaskId: d.toTaskId })),
			];
			const existingConns = this.getExistingConnections ? await this.getExistingConnections() : [];
			if (existingConns.length > 0) {
				edges.push(...existingConns.map(c => ({ fromTaskId: c.fromTaskId, toTaskId: c.toTaskId })));
			}
			if (wouldCreateTaskGraphCycle(edges, fromTaskId, toTaskId)) {
				throw new Error("task dependency would create a cycle");
			}

			const timestamp = now();
			const dependency: TeamTaskDependency = {
				schemaVersion: "team/task-dependency-1",
				dependencyId: generateTaskDependencyId(),
				fromTaskId,
				toTaskId,
				trigger: "on_success",
				createdAt: timestamp,
				updatedAt: timestamp,
			};
			await this.writeAll([...dependencies, dependency]);
			return dependency;
		});
	}

	async delete(dependencyId: string): Promise<boolean> {
		return this.withMutationLock(async () => {
			const dependencies = await this.readAll();
			const next = dependencies.filter(dep => dep.dependencyId !== dependencyId);
			if (next.length === dependencies.length) return false;
			await this.writeAll(next);
			return true;
		});
	}

	private async readAll(): Promise<TeamTaskDependency[]> {
		let content: string;
		try {
			content = await readFile(this.filePath, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw new Error(`task dependency store read failed: ${(error as Error).message}`);
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(content);
		} catch {
			throw new Error("task dependency store contains invalid JSON");
		}
		if (!Array.isArray(parsed)) {
			throw new Error("task dependency store does not contain an array");
		}
		return parsed
			.filter((dep: unknown) => (dep as Record<string, unknown>)?.schemaVersion === "team/task-dependency-1")
			.map(dep => dep as TeamTaskDependency);
	}

	private async withMutationLock<T>(fn: () => Promise<T>): Promise<T> {
		await mkdir(this.rootDir, { recursive: true });
		const lockDir = join(this.rootDir, ".task-dependencies.lock");
		let acquired = false;
		for (let attempt = 0; attempt < 100; attempt++) {
			try {
				await mkdir(lockDir);
				acquired = true;
				break;
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (code !== "EEXIST" && code !== "EPERM") throw error;
				await new Promise(resolve => setTimeout(resolve, 10));
			}
		}
		if (!acquired) {
			throw new Error("task dependency store lock busy");
		}
		try {
			return await fn();
		} finally {
			await rm(lockDir, { recursive: true, force: true });
		}
	}

	private async writeAll(dependencies: TeamTaskDependency[]): Promise<void> {
		await mkdir(this.rootDir, { recursive: true });
		const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
		try {
			await writeFile(tmp, JSON.stringify(dependencies, null, 2), "utf8");
			await rename(tmp, this.filePath);
		} finally {
			await rm(tmp, { force: true }).catch(() => {});
		}
	}
}

function assertStableString(value: unknown, message: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(message);
	}
	return value.trim();
}
