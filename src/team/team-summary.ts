import type { TeamTaskState } from "./types.js";

export interface TeamRunSummary {
	totalTasks: number;
	succeededTasks: number;
	failedTasks: number;
	cancelledTasks: number;
	skippedTasks: number;
}

export function computeTeamRunSummary(taskStates: Record<string, TeamTaskState>): TeamRunSummary {
	const states = Object.values(taskStates);
	return {
		totalTasks: states.length,
		succeededTasks: states.filter(ts => ts.status === "succeeded").length,
		failedTasks: states.filter(ts => ts.status === "failed").length,
		cancelledTasks: states.filter(ts => ts.status === "cancelled").length,
		skippedTasks: states.filter(ts => ts.status === "skipped").length,
	};
}
