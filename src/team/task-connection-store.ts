import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateTaskConnectionId } from "./ids.js";
import { findInputPort, findOutputPort } from "./task-port-contract.js";
import type { TaskStore } from "./task-store.js";
import type { ResolvedTaskConnection, TaskConnectionStaleReason, TeamTaskConnection } from "./types.js";

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
			const staleReason = await this.resolveStaleReason(connection);
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

		const connections = await this.readAll();
		if (connections.some(connection =>
			connection.fromTaskId === fromTaskId &&
			connection.fromOutputPortId === fromOutputPortId &&
			connection.toTaskId === toTaskId &&
			connection.toInputPortId === toInputPortId
		)) {
			throw new Error("task connection already exists");
		}
		if (this.wouldCreateCycle(connections, fromTaskId, toTaskId)) {
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
	}

	async delete(connectionId: string): Promise<boolean> {
		const connections = await this.readAll();
		const next = connections.filter(connection => connection.connectionId !== connectionId);
		if (next.length === connections.length) return false;
		await this.writeAll(next);
		return true;
	}

	private async resolveStaleReason(connection: TeamTaskConnection): Promise<TaskConnectionStaleReason | null> {
		const sourceTask = await this.taskStore.get(connection.fromTaskId);
		if (!sourceTask) return "source_task_missing";
		if (sourceTask.archived) return "source_task_archived";
		const targetTask = await this.taskStore.get(connection.toTaskId);
		if (!targetTask) return "target_task_missing";
		if (targetTask.archived) return "target_task_archived";
		const outputPort = findOutputPort(sourceTask.workUnit, connection.fromOutputPortId);
		if (!outputPort) return "source_output_port_missing";
		if (outputPort.type !== connection.type) return "source_output_port_type_mismatch";
		const inputPort = findInputPort(targetTask.workUnit, connection.toInputPortId);
		if (!inputPort) return "target_input_port_missing";
		if (inputPort.type !== connection.type) return "target_input_port_type_mismatch";
		return null;
	}

	private wouldCreateCycle(connections: TeamTaskConnection[], fromTaskId: string, toTaskId: string): boolean {
		const outgoing = new Map<string, string[]>();
		for (const connection of connections) {
			const targets = outgoing.get(connection.fromTaskId) ?? [];
			targets.push(connection.toTaskId);
			outgoing.set(connection.fromTaskId, targets);
		}
		const stack = [toTaskId];
		const seen = new Set<string>();
		while (stack.length > 0) {
			const current = stack.pop()!;
			if (current === fromTaskId) return true;
			if (seen.has(current)) continue;
			seen.add(current);
			for (const next of outgoing.get(current) ?? []) {
				stack.push(next);
			}
		}
		return false;
	}

	private async readAll(): Promise<TeamTaskConnection[]> {
		try {
			const content = await readFile(this.filePath, "utf8");
			const parsed = JSON.parse(content);
			if (!Array.isArray(parsed)) return [];
			return parsed
				.filter(connection => connection?.schemaVersion === "team/task-connection-1")
				.map(connection => connection as TeamTaskConnection);
		} catch {
			return [];
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
