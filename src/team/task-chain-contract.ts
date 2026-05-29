import { wouldCreateCycle, typedEdgesFromConnections, controlEdgesFromDependencies } from "./task-graph.js";
import type { TeamTaskConnection, TeamTaskDependency } from "./types.js";

export {
	type TaskGraphEdge,
	wouldCreateCycle as wouldCreateTaskGraphCycle,
	wouldCreateMixedCycle,
	typedEdgesFromConnections,
	controlEdgesFromDependencies,
	isDuplicateTypedConnection,
	isDuplicateDependency,
	resolveConnectionStaleReason,
	resolveDependencyStaleReason,
} from "./task-graph.js";

export function wouldCreateTaskConnectionCycle(
	connections: TeamTaskConnection[],
	fromTaskId: string,
	toTaskId: string,
): boolean {
	const edges = typedEdgesFromConnections(connections);
	return wouldCreateCycle(edges, fromTaskId, toTaskId);
}

export function wouldCreateTaskDependencyCycle(
	dependencies: TeamTaskDependency[],
	fromTaskId: string,
	toTaskId: string,
): boolean {
	const edges = controlEdgesFromDependencies(dependencies);
	return wouldCreateCycle(edges, fromTaskId, toTaskId);
}
