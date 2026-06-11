import type { TeamGeneratedTaskSource } from "../api/team-types";

export function generatedSourceParentTaskId(source: TeamGeneratedTaskSource | undefined): string | undefined {
  if (!source) return undefined;
  return source.schemaVersion === "team/generated-task-source-2"
    ? source.sourceTaskId
    : source.sourceDiscoveryTaskId;
}

export function generatedSourceLatestRunId(source: TeamGeneratedTaskSource | undefined): string | undefined {
  if (!source) return undefined;
  return source.schemaVersion === "team/generated-task-source-2"
    ? source.latestSourceRunId
    : source.latestDiscoveryRunId;
}

export function generatedSourceLatestAt(source: TeamGeneratedTaskSource | undefined): string | undefined {
  if (!source) return undefined;
  return source.schemaVersion === "team/generated-task-source-2"
    ? source.latestSourceAt
    : source.latestDiscoveredAt;
}
