import { findInputPort, findOutputPort } from "./task-port-contract.js";
import type { TaskConnectionStaleReason, TeamCanvasTask, TeamTaskConnection } from "./types.js";

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

export function wouldCreateTaskConnectionCycle(
	connections: TeamTaskConnection[],
	fromTaskId: string,
	toTaskId: string,
): boolean {
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
