import type { TeamCanvasTask, TeamRunState, TeamAttemptMetadata } from "../api/team-types";
import { isActiveRun } from "../shared/status";

export type TeamDiscoveryStage =
  | "idle"
  | "discovering"
  | "dispatching"
  | "auto-running"
  | "aggregating"
  | "completed"
  | "cancelled";

export interface TeamDiscoverySummary {
  stage: TeamDiscoveryStage;
  generatedTaskCount: number;
  activeGeneratedTaskCount: number;
  staleGeneratedTaskCount: number;
  runningGeneratedRunCount: number;
  completedGeneratedRunCount: number;
  failedDispatchCount: number;
  dispatchProcessedCount: number;
  latestDispatchRunId?: string;
  latestDispatchAttemptId?: string;
}

export interface TeamDiscoveryDispatchDiagnostic {
  itemId: string;
  status: "blocked";
  error: string | null;
  createdAt: string;
  runId: string;
  attemptId: string;
}

export type TeamDiscoveryDispatchProgress = {
  processedCount: number;
  blockedCount: number;
  latestRunId?: string;
  latestAttemptId?: string;
};

function selectLatestRun(runs: TeamRunState[]): TeamRunState | null {
  if (!runs.length) return null;
  return runs.reduce((latest, run) => {
    const latestTime = Date.parse(latest.createdAt);
    const runTime = Date.parse(run.createdAt);
    if (!Number.isFinite(runTime)) return latest;
    if (!Number.isFinite(latestTime)) return run;
    return runTime >= latestTime ? run : latest;
  }, runs[0]);
}

export function discoveryRootTasks(tasks: TeamCanvasTask[]): TeamCanvasTask[] {
  return tasks.filter((task) => task.canvasKind === "discovery" && !task.generatedSource);
}

export function flattenGeneratedTasks(generatedTasksByDiscoveryTaskId: Record<string, TeamCanvasTask[]>): TeamCanvasTask[] {
  return Object.values(generatedTasksByDiscoveryTaskId).flat();
}

function discoveryStage(input: {
  latestRootRun: TeamRunState | null;
  generatedTaskCount: number;
  runningGeneratedRunCount: number;
  dispatchProcessedCount: number;
}): TeamDiscoveryStage {
  const status = input.latestRootRun?.status;
  if (status === "cancelled") return "cancelled";
  if (status === "completed" || status === "completed_with_failures" || status === "failed") return "completed";
  if (input.runningGeneratedRunCount > 0) return "auto-running";
  if (input.generatedTaskCount > 0 && input.latestRootRun && isActiveRun(input.latestRootRun.status)) return "aggregating";
  if (input.dispatchProcessedCount > 0) return "dispatching";
  if (input.latestRootRun && isActiveRun(input.latestRootRun.status)) return "discovering";
  return "idle";
}

function attemptTime(attempt: TeamAttemptMetadata): number {
  const updatedAt = Date.parse(attempt.updatedAt);
  if (Number.isFinite(updatedAt)) return updatedAt;
  const createdAt = Date.parse(attempt.createdAt);
  return Number.isFinite(createdAt) ? createdAt : Number.NEGATIVE_INFINITY;
}

function selectLatestAttempt(attempts: TeamAttemptMetadata[]): TeamAttemptMetadata | null {
  if (!attempts.length) return null;
  return attempts.reduce((latest, attempt) => {
    const latestTime = attemptTime(latest);
    const currentTime = attemptTime(attempt);
    return currentTime >= latestTime ? attempt : latest;
  }, attempts[0]);
}

function blockedDispatchDiagnosticsFromAttempt(
  run: TeamRunState,
  attempt: TeamAttemptMetadata | null,
): TeamDiscoveryDispatchDiagnostic[] {
  if (!attempt || !Array.isArray(attempt.discoveryDispatch)) return [];
  return attempt.discoveryDispatch
    .filter((outcome) => outcome.status === "blocked")
    .map((outcome) => {
      const itemId = typeof outcome.itemId === "string" ? outcome.itemId.trim() : "";
      const error = typeof outcome.error === "string" && outcome.error.trim() ? outcome.error : null;
      const createdAt = typeof outcome.createdAt === "string" && outcome.createdAt
        ? outcome.createdAt
        : attempt.updatedAt || attempt.createdAt;
      return {
        itemId,
        status: "blocked" as const,
        error,
        createdAt,
        runId: run.runId,
        attemptId: attempt.attemptId,
      };
    })
    .filter((diagnostic) => diagnostic.itemId.length > 0);
}

function dispatchProgressFromAttempt(
  run: TeamRunState,
  attempt: TeamAttemptMetadata | null,
): TeamDiscoveryDispatchProgress {
  if (!attempt || !Array.isArray(attempt.discoveryDispatch)) return { processedCount: 0, blockedCount: 0 };
  return {
    processedCount: attempt.discoveryDispatch.length,
    blockedCount: attempt.discoveryDispatch.filter((outcome) => outcome.status === "blocked").length,
    latestRunId: run.runId,
    latestAttemptId: attempt.attemptId,
  };
}

export function summarizeDiscoveryCatalogs(
  generatedTasksByDiscoveryTaskId: Record<string, TeamCanvasTask[]>,
  taskRunsByTaskId: Record<string, TeamRunState[]>,
  discoveryDispatchDiagnosticsByTaskId: Record<string, TeamDiscoveryDispatchDiagnostic[]> = {},
  discoveryDispatchProgressByTaskId: Record<string, TeamDiscoveryDispatchProgress> = {},
): Record<string, TeamDiscoverySummary> {
  return Object.fromEntries(Object.entries(generatedTasksByDiscoveryTaskId).map(([discoveryTaskId, generatedTasks]) => [
    discoveryTaskId,
    (() => {
      const diagnostics = discoveryDispatchDiagnosticsByTaskId[discoveryTaskId] ?? [];
      const progress = discoveryDispatchProgressByTaskId[discoveryTaskId];
      const latestRootRun = selectLatestRun(taskRunsByTaskId[discoveryTaskId] ?? []);
      const runningGeneratedRunCount = generatedTasks.reduce((count, task) => (
        count + (taskRunsByTaskId[task.taskId] ?? []).filter((run) => isActiveRun(run.status)).length
      ), 0);
      const completedGeneratedRunCount = generatedTasks.reduce((count, task) => (
        count + (taskRunsByTaskId[task.taskId] ?? []).filter((run) => run.status === "completed").length
      ), 0);
      const dispatchProcessedCount = progress?.processedCount ?? diagnostics.length;
      const stage = discoveryStage({
        latestRootRun,
        generatedTaskCount: generatedTasks.length,
        runningGeneratedRunCount,
        dispatchProcessedCount,
      });
      return {
        stage,
        generatedTaskCount: generatedTasks.length,
        activeGeneratedTaskCount: generatedTasks.filter((task) => task.generatedSource?.itemStatus === "active").length,
        staleGeneratedTaskCount: generatedTasks.filter((task) => task.generatedSource?.itemStatus === "stale").length,
        runningGeneratedRunCount,
        completedGeneratedRunCount,
        failedDispatchCount: diagnostics.length,
        dispatchProcessedCount,
        ...(progress?.latestRunId ? { latestDispatchRunId: progress.latestRunId } : diagnostics[0]?.runId ? { latestDispatchRunId: diagnostics[0].runId } : {}),
        ...(progress?.latestAttemptId ? { latestDispatchAttemptId: progress.latestAttemptId } : diagnostics[0]?.attemptId ? { latestDispatchAttemptId: diagnostics[0].attemptId } : {}),
      };
    })(),
  ]));
}

export async function readDiscoveryDispatchForTasks(
  api: Pick<import("../api/team-api").LiveTeamApi, "listTaskRunAttempts">,
  discoveryTasks: TeamCanvasTask[],
  taskRunsByTaskId: Record<string, TeamRunState[]>,
): Promise<{
  diagnosticsByTaskId: Record<string, TeamDiscoveryDispatchDiagnostic[]>;
  progressByTaskId: Record<string, TeamDiscoveryDispatchProgress>;
}> {
  const entries = await Promise.all(discoveryTasks.map(async (task) => {
    const latestRun = selectLatestRun(taskRunsByTaskId[task.taskId] ?? []);
    if (!latestRun) {
      return [task.taskId, { diagnostics: [] as TeamDiscoveryDispatchDiagnostic[], progress: { processedCount: 0, blockedCount: 0 } }] as const;
    }
    try {
      const attempts = await api.listTaskRunAttempts(latestRun.runId, task.taskId, { view: "dispatch-diagnostics" });
      const latestAttempt = selectLatestAttempt(attempts);
      return [
        task.taskId,
        {
          diagnostics: blockedDispatchDiagnosticsFromAttempt(latestRun, latestAttempt),
          progress: dispatchProgressFromAttempt(latestRun, latestAttempt),
        },
      ] as const;
    } catch {
      return [task.taskId, { diagnostics: [] as TeamDiscoveryDispatchDiagnostic[], progress: { processedCount: 0, blockedCount: 0 } }] as const;
    }
  }));
  return {
    diagnosticsByTaskId: Object.fromEntries(entries.map(([taskId, result]) => [taskId, result.diagnostics])),
    progressByTaskId: Object.fromEntries(entries.map(([taskId, result]) => [taskId, result.progress])),
  };
}
