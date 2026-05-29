import { generateSourceConnectionId } from "./ids.js";
import { JsonCollectionStore } from "./json-collection-store.js";
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
	private readonly collection: JsonCollectionStore<TeamCanvasSourceConnection>;

	constructor(
		private readonly rootDir: string,
		private readonly sourceNodeStore: SourceNodeStore,
		private readonly taskStore: TaskStore,
	) {
		this.collection = new JsonCollectionStore<TeamCanvasSourceConnection>({
			rootDir,
			fileName: "source-connections.json",
			schemaVersion: "team/source-connection-1",
			lockDirName: ".source-connections.lock",
			errorLabel: "source connection store",
		});
	}

	async list(): Promise<TeamCanvasSourceConnection[]> {
		const connections = await this.collection.readAll();
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

		return this.collection.withMutationLock(async () => {
			const connections = await this.collection.readAll();
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
