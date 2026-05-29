import { findInputPort, findOutputPort } from "./task-port-contract.js";
import type { TaskConnectionStaleReason, TaskDependencyStaleReason, TeamCanvasTask, TeamTaskConnection, TeamTaskDependency } from "./types.js";

// --- Edge type ---

export interface TaskGraphEdge {
	fromTaskId: string;
	toTaskId: string;
}

// --- Edge collection ---

export function typedEdgesFromConnections(connections: TeamTaskConnection[]): TaskGraphEdge[] {
	return connections.map(c => ({ fromTaskId: c.fromTaskId, toTaskId: c.toTaskId }));
}

export function controlEdgesFromDependencies(dependencies: TeamTaskDependency[]): TaskGraphEdge[] {
	return dependencies.map(d => ({ fromTaskId: d.fromTaskId, toTaskId: d.toTaskId }));
}

// --- Stale detection ---

export function resolveConnectionStaleReason(
	sourceTask: TeamCanvasTask | null,
	targetTask: TeamCanvasTask | null,
	connection: TeamTaskConnection,
): TaskConnectionStaleReason | null {
	if (!sourceTask) return "source_task_missing";
	if (sourceTask.archived) return "source_task_archived";
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

export function resolveDependencyStaleReason(
	sourceTask: TeamCanvasTask | null,
	targetTask: TeamCanvasTask | null,
): TaskDependencyStaleReason | null {
	if (!sourceTask) return "source_task_missing";
	if (sourceTask.archived) return "source_task_archived";
	if (!targetTask) return "target_task_missing";
	if (targetTask.archived) return "target_task_archived";
	return null;
}

// --- Duplicate detection ---

export function isDuplicateTypedConnection(
	connections: TeamTaskConnection[],
	fromTaskId: string,
	fromOutputPortId: string,
	toTaskId: string,
	toInputPortId: string,
): boolean {
	return connections.some(c =>
		c.fromTaskId === fromTaskId &&
		c.fromOutputPortId === fromOutputPortId &&
		c.toTaskId === toTaskId &&
		c.toInputPortId === toInputPortId,
	);
}

export function isDuplicateDependency(
	dependencies: TeamTaskDependency[],
	fromTaskId: string,
	toTaskId: string,
): boolean {
	return dependencies.some(d =>
		d.fromTaskId === fromTaskId &&
		d.toTaskId === toTaskId,
	);
}

// --- Cycle detection ---

export function wouldCreateCycle(
	existingEdges: TaskGraphEdge[],
	fromTaskId: string,
	toTaskId: string,
): boolean {
	const outgoing = new Map<string, string[]>();
	for (const edge of existingEdges) {
		const targets = outgoing.get(edge.fromTaskId) ?? [];
		targets.push(edge.toTaskId);
		outgoing.set(edge.fromTaskId, targets);
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

export function wouldCreateMixedCycle(
	connections: TeamTaskConnection[],
	dependencies: TeamTaskDependency[],
	fromTaskId: string,
	toTaskId: string,
): boolean {
	const edges: TaskGraphEdge[] = [
		...typedEdgesFromConnections(connections),
		...controlEdgesFromDependencies(dependencies),
	];
	return wouldCreateCycle(edges, fromTaskId, toTaskId);
}
