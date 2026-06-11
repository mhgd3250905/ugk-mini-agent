import type { TeamSplitTaskSpec, TeamWorkUnitDefinition, TeamWorklistItem } from "./types.js";

function uniqueNonEmpty(values: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const value of values) {
		const trimmed = value.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		out.push(trimmed);
	}
	return out;
}

export function compileSplitTaskItemWorkUnit(input: {
	splitTaskTitle: string;
	splitTaskId: string;
	worklistId: string;
	item: TeamWorklistItem;
	spec: TeamSplitTaskSpec;
}): Omit<TeamWorkUnitDefinition, "workerAgentId" | "checkerAgentId"> {
	const itemJson = JSON.stringify(input.item, null, 2);
	const title = input.item.title.trim() || `Process ${input.item.id}`;
	return {
		title,
		input: {
			text: [
				`Split task: ${input.splitTaskTitle}`,
				`Split task id: ${input.splitTaskId}`,
				`Worklist id: ${input.worklistId}`,
				`Exact item id: ${input.item.id}`,
				"",
				"Dispatch goal:",
				input.spec.dispatchGoal,
				"",
				"Full worklist item JSON:",
				"```json",
				itemJson,
				"```",
				"",
				"Boundary:",
				`Only process this exact worklist item (${input.item.id}). Do not process adjacent items, historical run artifacts, or the whole worklist.`,
			].join("\n"),
		},
		outputContract: {
			text: [
				`Return the result for worklist item "${input.item.id}" only.`,
				"Include enough structured content or file references for checker validation.",
				"Do not include results for other worklist items.",
			].join("\n"),
		},
		acceptance: {
			rules: uniqueNonEmpty([
				`Result addresses only worklist item "${input.item.id}".`,
				"Result satisfies the output contract and is specific enough for downstream collection.",
				...(input.item.acceptanceHints ?? []),
			]),
		},
	};
}
