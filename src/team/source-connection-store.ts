import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateSourceConnectionId } from "./ids.js";
import { findInputPort } from "./task-port-contract.js";
import type { SourceNodeStore } from "./source-node-store.js";
import type { TaskStore } from "./task-store.js";
import type {
	ResolvedSourceConnection,
	SourceConnectionStaleReason,
	TeamCanvasSourceConnection,
	TeamCanvasSourceNode,
	TeamCanvasTask,
} from "./types.js";

export interface CreateSourceConnectionInput {
	fromSourceNodeId: string;
	fromOutputPortId: string;
	toTaskId: string;
	toInputPortId: string;
}

const now = () => new Date().toISOString();

export class SourceConnectionStore {
	private readonly filePath: string;

	constructor(
		private readonly rootDir: string,
		private readonly sourceNodeStore: SourceNodeStore,
		private readonly taskStore: TaskStore,
	) {
		this.filePath = join(rootDir, "source-connections.json");
	}

	async list(): Promise<TeamCanvasSourceConnection[]> {
		const connections = await this.readAll();
		return connections.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	}

	async listToTask(taskId: string): Promise<TeamCanvasSourceConnection[]> {
		return (await this.list()).filter(connection => connection.toTaskId === taskId);
	}

	async listResolved(): Promise<ResolvedSourceConnection[]> {
		const connections = await this.list();
		const resolved: ResolvedSourceConnection[] = [];
		for (const connection of connections) {
			const sourceNode = await this.sourceNodeStore.get(connection.fromSourceNodeId);
			const targetTask = await this.taskStore.get(connection.toTaskId);
			const staleReason = resolveSourceConnectionStaleReason(sourceNode, targetTask, connection);
			resolved.push({
				...connection,
				status: staleReason ? "stale" : "active",
				...(staleReason ? { staleReason } : {}),
			});
		}
		return resolved;
	}

	async create(input: CreateSourceConnectionInput): Promise<TeamCanvasSourceConnection> {
		const fromSourceNodeId = assertStableString(input.fromSourceNodeId, "fromSourceNodeId is required");
		const fromOutputPortId = assertStableString(input.fromOutputPortId, "fromOutputPortId is required");
		const toTaskId = assertStableString(input.toTaskId, "toTaskId is required");
		const toInputPortId = assertStableString(input.toInputPortId, "toInputPortId is required");

		const sourceNode = await this.sourceNodeStore.get(fromSourceNodeId);
		if (!sourceNode) throw new Error(`source node not found: ${fromSourceNodeId}`);
		if (sourceNode.archived) throw new Error(`archived source node cannot be connected: ${fromSourceNodeId}`);
		if (sourceNode.outputPort.id !== fromOutputPortId) {
			throw new Error(`source output port not found: ${fromSourceNodeId}.${fromOutputPortId}`);
		}

		const targetTask = await this.taskStore.get(toTaskId);
		if (!targetTask) throw new Error(`task not found: ${toTaskId}`);
		if (targetTask.archived) throw new Error(`archived task cannot be connected: ${toTaskId}`);
		const inputPort = findInputPort(targetTask.workUnit, toInputPortId);
		if (!inputPort) throw new Error(`input port not found: ${toTaskId}.${toInputPortId}`);
		if (sourceNode.outputPort.type !== inputPort.type) {
			throw new Error(`port type mismatch: ${sourceNode.outputPort.type} -> ${inputPort.type}`);
		}

		return this.withMutationLock(async () => {
			const connections = await this.readAll();
			if (connections.some(connection =>
				connection.fromSourceNodeId === fromSourceNodeId &&
				connection.fromOutputPortId === fromOutputPortId &&
				connection.toTaskId === toTaskId &&
				connection.toInputPortId === toInputPortId
			)) {
				throw new Error("source connection already exists");
			}

			const timestamp = now();
			const connection: TeamCanvasSourceConnection = {
				schemaVersion: "team/source-connection-1",
				connectionId: generateSourceConnectionId(),
				fromSourceNodeId,
				fromOutputPortId,
				toTaskId,
				toInputPortId,
				type: sourceNode.outputPort.type,
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

	private async readAll(): Promise<TeamCanvasSourceConnection[]> {
		let content: string;
		try {
			content = await readFile(this.filePath, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw new Error(`source connection store read failed: ${(error as Error).message}`);
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(content);
		} catch {
			throw new Error("source connection store contains invalid JSON");
		}
		if (!Array.isArray(parsed)) {
			throw new Error("source connection store does not contain an array");
		}
		return parsed
			.filter((connection: unknown) => (connection as Record<string, unknown>)?.schemaVersion === "team/source-connection-1")
			.map(connection => connection as TeamCanvasSourceConnection);
	}

	private async withMutationLock<T>(fn: () => Promise<T>): Promise<T> {
		await mkdir(this.rootDir, { recursive: true });
		const lockDir = join(this.rootDir, ".source-connections.lock");
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
			throw new Error("source connection store lock busy");
		}
		try {
			return await fn();
		} finally {
			await rm(lockDir, { recursive: true, force: true });
		}
	}

	private async writeAll(connections: TeamCanvasSourceConnection[]): Promise<void> {
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

export function resolveSourceConnectionStaleReason(
	sourceNode: TeamCanvasSourceNode | null,
	targetTask: TeamCanvasTask | null,
	connection: TeamCanvasSourceConnection,
): SourceConnectionStaleReason | null {
	if (!sourceNode) return "source_node_missing";
	if (sourceNode.archived) return "source_node_archived";
	if (!targetTask) return "target_task_missing";
	if (targetTask.archived) return "target_task_archived";
	if (sourceNode.outputPort.id !== connection.fromOutputPortId) return "source_output_port_missing";
	if (sourceNode.outputPort.type !== connection.type) return "source_output_port_type_mismatch";
	const inputPort = findInputPort(targetTask.workUnit, connection.toInputPortId);
	if (!inputPort) return "target_input_port_missing";
	if (inputPort.type !== connection.type) return "target_input_port_type_mismatch";
	return null;
}

function assertStableString(value: unknown, message: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(message);
	}
	return value.trim();
}
