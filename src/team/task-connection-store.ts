import { generateTaskConnectionId } from "./ids.js";
import { JsonCollectionStore } from "./json-collection-store.js";
import { findInputPort, findOutputPort } from "./task-port-contract.js";
import { resolveConnectionStaleReason, wouldCreateTaskConnectionCycle, wouldCreateTaskGraphCycle, type TaskGraphEdge } from "./task-chain-contract.js";
import type { TaskStore } from "./task-store.js";
import type { ResolvedTaskConnection, TeamTaskConnection, TeamTaskDependency } from "./types.js";

export interface CreateTaskConnectionInput {
	fromTaskId: string;
	fromOutputPortId: string;
	toTaskId: string;
	toInputPortId: string;
}

const now = () => new Date().toISOString();

export class TaskConnectionStore {
	private readonly collection: JsonCollectionStore<TeamTaskConnection>;

	constructor(
		private readonly rootDir: string,
		private readonly taskStore: TaskStore,
	) {
		this.collection = new JsonCollectionStore<TeamTaskConnection>({
			rootDir,
			fileName: "task-connections.json",
			schemaVersion: "team/task-connection-1",
			lockDirName: ".task-connections.lock",
			errorLabel: "task connection store",
		});
	}

	setExistingDependencies(deps: () => Promise<TeamTaskDependency[]>): void {
		this.getExistingDependencies = deps;
	}

	private getExistingDependencies: (() => Promise<TeamTaskDependency[]>) | undefined;

	async list(): Promise<TeamTaskConnection[]> {
		const connections = await this.collection.readAll();
		return connections.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	}

	async listFromTask(taskId: string): Promise<TeamTaskConnection[]> {
		return (await this.list()).filter(connection => connection.fromTaskId === taskId);
	}

	async listResolved(): Promise<ResolvedTaskConnection[]> {
		const connections = await this.list();
		const resolved: ResolvedTaskConnection[] = [];
		for (const connection of connections) {
			const sourceTask = await this.taskStore.get(connection.fromTaskId);
			const targetTask = await this.taskStore.get(connection.toTaskId);
			const staleReason = resolveConnectionStaleReason(sourceTask, targetTask, connection);
			resolved.push({
				...connection,
				status: staleReason ? "stale" : "active",
				...(staleReason ? { staleReason } : {}),
			});
		}
		return resolved;
	}

	async create(input: CreateTaskConnectionInput): Promise<TeamTaskConnection> {
		const fromTaskId = assertStableString(input.fromTaskId, "fromTaskId is required");
		const fromOutputPortId = assertStableString(input.fromOutputPortId, "fromOutputPortId is required");
		const toTaskId = assertStableString(input.toTaskId, "toTaskId is required");
		const toInputPortId = assertStableString(input.toInputPortId, "toInputPortId is required");
		if (fromTaskId === toTaskId) {
			throw new Error("task connection cannot target the same task");
		}

		const fromTask = await this.taskStore.get(fromTaskId);
		if (!fromTask) throw new Error(`task not found: ${fromTaskId}`);
		if (fromTask.archived) throw new Error(`archived task cannot be connected: ${fromTaskId}`);
		const toTask = await this.taskStore.get(toTaskId);
		if (!toTask) throw new Error(`task not found: ${toTaskId}`);
		if (toTask.archived) throw new Error(`archived task cannot be connected: ${toTaskId}`);

		const fromPort = findOutputPort(fromTask.workUnit, fromOutputPortId);
		if (!fromPort) throw new Error(`output port not found: ${fromTaskId}.${fromOutputPortId}`);
		const toPort = findInputPort(toTask.workUnit, toInputPortId);
		if (!toPort) throw new Error(`input port not found: ${toTaskId}.${toInputPortId}`);
		if (fromPort.type !== toPort.type) {
			throw new Error(`port type mismatch: ${fromPort.type} -> ${toPort.type}`);
		}

		return this.collection.withMutationLock(async () => {
			const connections = await this.collection.readAll();
			if (connections.some(connection =>
				connection.fromTaskId === fromTaskId &&
				connection.fromOutputPortId === fromOutputPortId &&
				connection.toTaskId === toTaskId &&
				connection.toInputPortId === toInputPortId
			)) {
				throw new Error("task connection already exists");
			}
			if (wouldCreateTaskConnectionCycle(connections, fromTaskId, toTaskId)) {
				throw new Error("task connection would create a cycle");
			}
			const existingDeps = this.getExistingDependencies ? await this.getExistingDependencies() : [];
			if (existingDeps.length > 0) {
				const edges: TaskGraphEdge[] = [
					...connections.map(c => ({ fromTaskId: c.fromTaskId, toTaskId: c.toTaskId })),
					...existingDeps.map(d => ({ fromTaskId: d.fromTaskId, toTaskId: d.toTaskId })),
				];
				if (wouldCreateTaskGraphCycle(edges, fromTaskId, toTaskId)) {
					throw new Error("task connection would create a cycle");
				}
			}

			const timestamp = now();
			const connection: TeamTaskConnection = {
				schemaVersion: "team/task-connection-1",
				connectionId: generateTaskConnectionId(),
				fromTaskId,
				fromOutputPortId,
				toTaskId,
				toInputPortId,
				type: fromPort.type,
				createdAt: timestamp,
				updatedAt: timestamp,
			};
			await this.collection.writeAll([...connections, connection]);
			return connection;
		});
	}

	async delete(connectionId: string): Promise<boolean> {
		return this.collection.withMutationLock(async () => {
			const connections = await this.collection.readAll();
			const next = connections.filter(connection => connection.connectionId !== connectionId);
			if (next.length === connections.length) return false;
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
