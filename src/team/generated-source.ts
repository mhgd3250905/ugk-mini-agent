import type {
	TeamGeneratedTaskSource,
	TeamGeneratedTaskSourceKind,
	TeamGeneratedTaskSourceV2,
	TeamWorkUnitDefinition,
} from "./types.js";

export interface GeneratedSourceLatestPatch {
	latestSourceRunId: string;
	latestSourceAttemptId: string;
	latestSourceAt: string;
}

export function getGeneratedSourceKind(source: TeamGeneratedTaskSource): TeamGeneratedTaskSourceKind {
	return source.schemaVersion === "team/generated-task-source-2" ? source.sourceKind : "discovery";
}

export function getGeneratedSourceParentTaskId(source: TeamGeneratedTaskSource): string {
	return source.schemaVersion === "team/generated-task-source-2" ? source.sourceTaskId : source.sourceDiscoveryTaskId;
}

export function getGeneratedSourceItemId(source: TeamGeneratedTaskSource): string {
	return source.sourceItemId;
}

export function getGeneratedSourceLatestRunId(source: TeamGeneratedTaskSource): string | undefined {
	return source.schemaVersion === "team/generated-task-source-2" ? source.latestSourceRunId : source.latestDiscoveryRunId;
}

export function getGeneratedSourceLatestAttemptId(source: TeamGeneratedTaskSource): string | undefined {
	return source.schemaVersion === "team/generated-task-source-2" ? source.latestSourceAttemptId : source.latestDiscoveryAttemptId;
}

export function getGeneratedSourceLatestAt(source: TeamGeneratedTaskSource): string | undefined {
	return source.schemaVersion === "team/generated-task-source-2" ? source.latestSourceAt : source.latestDiscoveredAt;
}

export function createGeneratedTaskSourceV2(input: {
	sourceKind: TeamGeneratedTaskSourceKind;
	sourceTaskId: string;
	sourceItemId: string;
	itemPayload: Record<string, unknown>;
	latestSourceRunId: string;
	latestSourceAttemptId: string;
	latestSourceAt: string;
	workUnitMode?: "managed" | "customized";
	latestManagedWorkUnit?: TeamWorkUnitDefinition;
}): TeamGeneratedTaskSourceV2 {
	return {
		schemaVersion: "team/generated-task-source-2",
		sourceKind: input.sourceKind,
		sourceTaskId: input.sourceTaskId,
		sourceItemId: input.sourceItemId,
		itemStatus: "active",
		itemPayload: input.itemPayload,
		latestSourceRunId: input.latestSourceRunId,
		latestSourceAttemptId: input.latestSourceAttemptId,
		latestSourceAt: input.latestSourceAt,
		workUnitMode: input.workUnitMode ?? "managed",
		...(input.latestManagedWorkUnit ? { latestManagedWorkUnit: input.latestManagedWorkUnit } : {}),
	};
}

export function patchGeneratedSourceLatest(source: TeamGeneratedTaskSource, patch: GeneratedSourceLatestPatch): TeamGeneratedTaskSource {
	if (source.schemaVersion === "team/generated-task-source-2") {
		return {
			...source,
			latestSourceRunId: patch.latestSourceRunId,
			latestSourceAttemptId: patch.latestSourceAttemptId,
			latestSourceAt: patch.latestSourceAt,
		};
	}
	return {
		...source,
		latestDiscoveryRunId: patch.latestSourceRunId,
		latestDiscoveryAttemptId: patch.latestSourceAttemptId,
		latestDiscoveredAt: patch.latestSourceAt,
	};
}
