import { randomUUID } from "node:crypto";

const compact = (): string => randomUUID().replaceAll("-", "").slice(0, 12);

export const generateTeamUnitId = (): string => `team_${compact()}`;
export const generatePlanId = (): string => `plan_${compact()}`;
export const generateTaskId = (): string => `task_${compact()}`;
export const generateRunId = (): string => `run_${compact()}`;
export const generateAttemptId = (): string => `attempt_${compact()}`;
export const generateTimingSpanId = (): string => `timing_${compact()}`;
export const generateTaskConnectionId = (): string => `conn_${compact()}`;
export const generateSourceNodeId = (): string => `source_${compact()}`;
export const generateSourceConnectionId = (): string => `source_conn_${compact()}`;
export const generateSourceArtifactId = (): string => `source_artifact_${compact()}`;
export const generateTaskArtifactId = (): string => `artifact_${compact()}`;
export const generateTaskDependencyId = (): string => `dep_${compact()}`;
