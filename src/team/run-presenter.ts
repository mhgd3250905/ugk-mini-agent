import type { RunWorkspace } from "./run-workspace.js";
import type { TeamPlan, TeamRunState, TeamTask } from "./types.js";

export type TeamRunDetailTaskDefinition = TeamTask & {
	generatedSource?: "for_each" | "decomposition";
};

export type TeamRunDetailResponse = TeamRunState & {
	taskDefinitions?: TeamRunDetailTaskDefinition[];
};

type RunDetailWorkspaceReader = Pick<RunWorkspace, "readExpansion" | "readDecomposition">;

function expansionChildFallback(parentTask: TeamTask, child: { taskId: string; sourceItemId: string; title: string; task?: TeamTask }): TeamTask {
	return child.task ?? {
		id: child.taskId,
		type: "normal",
		title: child.title,
		input: { text: child.title },
		acceptance: { rules: ["output is valid"] },
		parentTaskId: parentTask.id,
		sourceItemId: child.sourceItemId,
		generated: true,
	};
}

export async function buildRunDetailResponse(
	state: TeamRunState,
	plan: TeamPlan | null,
	workspace: RunDetailWorkspaceReader,
): Promise<TeamRunDetailResponse> {
	if (!plan) return state;
	const definitions = new Map<string, TeamRunDetailTaskDefinition>();
	const planTasks = Array.isArray(plan.tasks) ? plan.tasks : [];
	const queue: TeamTask[] = [...planTasks];
	const seen = new Set<string>();

	while (queue.length) {
		const task = queue.shift()!;
		if (seen.has(task.id)) continue;
		seen.add(task.id);

		if ((task.type ?? "normal") === "for_each") {
			const expansion = await workspace.readExpansion(state.runId, task.id).catch(() => null);
			for (const child of expansion?.children ?? []) {
				const childTask: TeamRunDetailTaskDefinition = {
					...expansionChildFallback(task, child),
					generatedSource: "for_each",
				};
				definitions.set(childTask.id, childTask);
				queue.push(childTask);
			}
		}

		const decomposition = await workspace.readDecomposition(state.runId, task.id).catch(() => null);
		if (decomposition?.decision === "split") {
			for (const child of decomposition.children) {
				const childTask: TeamRunDetailTaskDefinition = {
					...child.task,
					generatedSource: "decomposition",
				};
				definitions.set(childTask.id, childTask);
				queue.push(childTask);
			}
		}
	}

	return {
		...state,
		taskDefinitions: [...definitions.values()],
	};
}
