import { generateTaskDependencyId } from "./ids.js";
import { JsonCollectionStore } from "./json-collection-store.js";
import { resolveDependencyStaleReason, wouldCreateTaskGraphCycle, type TaskGraphEdge } from "./task-chain-contract.js";
import type { TaskStore } from "./task-store.js";
import type { ResolvedTaskDependency, TeamTaskDependency, TeamTaskConnection } from "./types.js";

const now = () => new Date().toISOString();

export class TaskDependencyStore {
	private readonly collection: JsonCollectionStore<TeamTaskDependency>;
	private getExistingConnections: (() => Promise<TeamTaskConnection[]>) | undefined;

	constructor(
		private readonly rootDir: string,
		private readonly taskStore: TaskStore,
	) {
		this.collection = new JsonCollectionStore<TeamTaskDependency>({
			rootDir,
			fileName: "task-dependencies.json",
			schemaVersion: "team/task-dependency-1",
			lockDirName: ".task-dependencies.lock",
			errorLabel: "task dependency store",
		});
	}

	setExistingConnections(connections: () => Promise<TeamTaskConnection[]>): void {
		this.getExistingConnections = connections;
	}

	async list(): Promise<TeamTaskDependency[]> {
		const dependencies = await this.collection.readAll();
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

		return this.collection.withMutationLock(async () => {
			const dependencies = await this.collection.readAll();
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
			await this.collection.writeAll([...dependencies, dependency]);
			return dependency;
		});
	}

	async delete(dependencyId: string): Promise<boolean> {
		return this.collection.withMutationLock(async () => {
			const dependencies = await this.collection.readAll();
			const next = dependencies.filter(dep => dep.dependencyId !== dependencyId);
			if (next.length === dependencies.length) return false;
			await this.collection.writeAll(next);
			return true;
		});
	}
}

function assertStableString(value: unknown, message: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(message);
	}
	return value.trim();
}
