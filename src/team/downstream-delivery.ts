import { resolveConnectionStaleReason, resolveDependencyStaleReason } from "./task-chain-contract.js";
import type {
	TaskConnectionStaleReason,
	TaskDependencyStaleReason,
	TeamCanvasTask,
	TeamTaskConnection,
	TeamTaskDependency,
} from "./types.js";

// --- Input types ---

export interface DownstreamSource {
	runId: string;
	taskId: string;
	attemptId: string;
	resultRef: string;
	resultContent: string;
}

export interface DownstreamPlanContext {
	sourceTask: TeamCanvasTask | null;
	connections: TeamTaskConnection[];
	dependencies: TeamTaskDependency[];
	getTask: (taskId: string) => TeamCanvasTask | null;
}

// --- Action types ---

export interface TriggerTypedRunAction {
	type: "trigger_typed_run";
	connection: TeamTaskConnection;
	targetTask: TeamCanvasTask;
	artifactParams: {
		type: string;
		sourceTaskId: string;
		sourceRunId: string;
		sourceAttemptId: string;
		sourceOutputPortId: string;
		fileRef: string;
		content: string;
	};
	triggeredBy: {
		type: "task-connection";
		connectionId: string;
		fromTaskId: string;
		fromRunId: string;
		fromAttemptId: string;
	};
}

export interface TriggerControlRunAction {
	type: "trigger_control_run";
	dependency: TeamTaskDependency;
	targetTask: TeamCanvasTask;
	triggeredBy: {
		type: "task-dependency";
		dependencyId: string;
		fromTaskId: string;
		fromRunId: string;
		fromAttemptId: string;
	};
}

export interface SkipTypedAction {
	type: "skip_typed";
	connectionId: string;
	toTaskId: string;
	toInputPortId: string;
	staleReason: TaskConnectionStaleReason;
}

export interface SkipControlAction {
	type: "skip_control";
	dependencyId: string;
	toTaskId: string;
	staleReason: TaskDependencyStaleReason;
}

export type DownstreamAction =
	| TriggerTypedRunAction
	| TriggerControlRunAction
	| SkipTypedAction
	| SkipControlAction;

// --- Planner ---

export function planDownstreamDelivery(
	source: DownstreamSource,
	context: DownstreamPlanContext,
): DownstreamAction[] {
	const { sourceTask, connections, dependencies, getTask } = context;
	const actions: DownstreamAction[] = [];

	if (!sourceTask || sourceTask.archived) {
		for (const connection of connections) {
			const staleReason = resolveConnectionStaleReason(sourceTask, null, connection);
			actions.push({
				type: "skip_typed",
				connectionId: connection.connectionId,
				toTaskId: connection.toTaskId,
				toInputPortId: connection.toInputPortId,
				staleReason: staleReason ?? (sourceTask?.archived ? "source_task_archived" : "source_task_missing"),
			});
		}
		for (const dep of dependencies) {
			const staleReason = resolveDependencyStaleReason(sourceTask, null);
			actions.push({
				type: "skip_control",
				dependencyId: dep.dependencyId,
				toTaskId: dep.toTaskId,
				staleReason: staleReason ?? (sourceTask?.archived ? "source_task_archived" : "source_task_missing"),
			});
		}
		return actions;
	}

	for (const connection of connections) {
		const targetTask = getTask(connection.toTaskId);
		const staleReason = resolveConnectionStaleReason(sourceTask, targetTask, connection);
		if (staleReason) {
			actions.push({
				type: "skip_typed",
				connectionId: connection.connectionId,
				toTaskId: connection.toTaskId,
				toInputPortId: connection.toInputPortId,
				staleReason,
			});
			continue;
		}
		actions.push({
			type: "trigger_typed_run",
			connection,
			targetTask: targetTask!,
			artifactParams: {
				type: connection.type,
				sourceTaskId: source.taskId,
				sourceRunId: source.runId,
				sourceAttemptId: source.attemptId,
				sourceOutputPortId: connection.fromOutputPortId,
				fileRef: source.resultRef,
				content: source.resultContent,
			},
			triggeredBy: {
				type: "task-connection",
				connectionId: connection.connectionId,
				fromTaskId: source.taskId,
				fromRunId: source.runId,
				fromAttemptId: source.attemptId,
			},
		});
	}

	for (const dep of dependencies) {
		const targetTask = getTask(dep.toTaskId);
		const staleReason = resolveDependencyStaleReason(sourceTask, targetTask);
		if (staleReason) {
			actions.push({
				type: "skip_control",
				dependencyId: dep.dependencyId,
				toTaskId: dep.toTaskId,
				staleReason,
			});
			continue;
		}
		actions.push({
			type: "trigger_control_run",
			dependency: dep,
			targetTask: targetTask!,
			triggeredBy: {
				type: "task-dependency",
				dependencyId: dep.dependencyId,
				fromTaskId: source.taskId,
				fromRunId: source.runId,
				fromAttemptId: source.attemptId,
			},
		});
	}

	return actions;
}
