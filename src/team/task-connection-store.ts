import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateTaskConnectionId } from "./ids.js";
import { findInputPort, findOutputPort } from "./task-port-contract.js";
import { resolveConnectionStaleReason, wouldCreateTaskConnectionCycle } from "./task-chain-contract.js";
import type { TaskStore } from "./task-store.js";
import type { ResolvedTaskConnection, TeamTaskConnection } from "./types.js";

export interface CreateTaskConnectionInput {
	fromTaskId: string;
	fromOutputPortId: string;
	toTaskId: string;
	toInputPortId: string;
}

const now = () => new Date().toISOString();

export class TaskConnectionStore {
	private readonly filePath: string;

	constructor(
		private readonly rootDir: string,
		private readonly taskStore: TaskStore,
	) {
		this.filePath = join(rootDir, "task-connections.json");
	}

	async list(): Promise<TeamTaskConnection[]> {
		const connections = await this.readAll();
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

		return this.withMutationLock(async () => {
			const connections = await this.readAll();
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
			await this.writeAll([...connections, connection]);
			return connection;
		});
	}

	async delete(connectionId: string): Promise<boolean> {
		return this.withMutationLock(async () => {
			const connections = await this.readAll();
			const next = connections.filter(connection => connection.connectionId !== connectionId);
			if (next.length === connections.length) return false;
			await this.writeAll(next);
			return true;
		});
	}

	private async readAll(): Promise<TeamTaskConnection[]> {
		let content: string;
		try {
			content = await readFile(this.filePath, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw new Error(`task connection store read failed: ${(error as Error).message}`);
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(content);
		} catch {
			throw new Error("task connection store contains invalid JSON");
		}
		if (!Array.isArray(parsed)) {
			throw new Error("task connection store does not contain an array");
		}
		return parsed
			.filter((connection: unknown) => (connection as Record<string, unknown>)?.schemaVersion === "team/task-connection-1")
			.map(connection => connection as TeamTaskConnection);
	}

	private async withMutationLock<T>(fn: () => Promise<T>): Promise<T> {
		await mkdir(this.rootDir, { recursive: true });
		const lockDir = join(this.rootDir, ".task-connections.lock");
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
			throw new Error("task connection store lock busy");
		}
		try {
			return await fn();
		} finally {
			await rm(lockDir, { recursive: true, force: true });
		}
	}

	private async writeAll(connections: TeamTaskConnection[]): Promise<void> {
		await mkdir(this.rootDir, { recursive: true });
		const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
		try {
			await writeFile(tmp, JSON.stringify(connections, null, 2), "utf8");
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
