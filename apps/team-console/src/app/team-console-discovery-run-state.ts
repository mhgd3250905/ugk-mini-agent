import type { TeamCanvasTask, TeamRunState } from "../api/team-types";
import { isActiveRun } from "../shared/status";
import type { TeamDiscoveryStage, TeamDiscoverySummary } from "./use-team-console-live-data";

export type DiscoveryGeneratedVisualState = "running" | "queued" | "done" | "failed" | "stale" | "idle";

export function selectLatestRun(runs: TeamRunState[]): TeamRunState | null {
  if (!runs.length) return null;
  return runs.reduce((latest, run) => {
    const latestTime = Date.parse(latest.createdAt);
    const runTime = Date.parse(run.createdAt);
    if (!Number.isFinite(runTime)) return latest;
    if (!Number.isFinite(latestTime)) return run;
    return runTime >= latestTime ? run : latest;
  }, runs[0]);
}

export function runTimeForOrdering(run: TeamRunState | null | undefined): number {
  if (!run) return Number.NEGATIVE_INFINITY;
  const finishedAt = Date.parse(run.finishedAt ?? "");
  if (Number.isFinite(finishedAt)) return finishedAt;
  const startedAt = Date.parse(run.startedAt ?? "");
  if (Number.isFinite(startedAt)) return startedAt;
  const createdAt = Date.parse(run.createdAt);
  return Number.isFinite(createdAt) ? createdAt : Number.NEGATIVE_INFINITY;
}

export function selectActiveDiscoveryRootRun(
  discoveryTaskId: string,
  taskRunsByTaskId: Record<string, TeamRunState[]>,
): TeamRunState | null {
  return (taskRunsByTaskId[discoveryTaskId] ?? []).find((run) => isActiveRun(run.status)) ?? null;
}

export function isGeneratedRunFromDiscoveryRun(run: TeamRunState, discoveryTaskId: string, discoveryRunId: string): boolean {
  return run.source?.triggeredBy?.type === "discovery-generated-task"
    && run.source.triggeredBy.discoveryTaskId === discoveryTaskId
    && run.source.triggeredBy.discoveryRunId === discoveryRunId;
}

export function isDiscoveryChannelSetRootRun(run: TeamRunState | null): boolean {
  return typeof run?.source?.discoveryChannelSetId === "string" && run.source.discoveryChannelSetId.length > 0;
}

export function visibleDiscoveryGeneratedRuns(
  generatedTask: TeamCanvasTask,
  discoveryTaskId: string,
  activeDiscoveryRun: TeamRunState | null,
  taskRunsByTaskId: Record<string, TeamRunState[]>,
): TeamRunState[] {
  const runs = taskRunsByTaskId[generatedTask.taskId] ?? [];
  if (!activeDiscoveryRun) return runs;
  if (isDiscoveryChannelSetRootRun(activeDiscoveryRun)) {
    return runs.filter((run) => isGeneratedRunFromDiscoveryRun(run, discoveryTaskId, activeDiscoveryRun.runId));
  }
  const generatedSourceRunId = generatedTask.generatedSource?.latestDiscoveryRunId;
  if (generatedSourceRunId !== activeDiscoveryRun.runId) return [];
  return runs.filter((run) => isGeneratedRunFromDiscoveryRun(run, discoveryTaskId, activeDiscoveryRun.runId));
}

export function sortDiscoveryGeneratedTasksForSubcanvas(
  tasks: TeamCanvasTask[],
  taskRunsByTaskId: Record<string, TeamRunState[]>,
  discoveryTaskId: string,
  activeDiscoveryRun: TeamRunState | null,
): TeamCanvasTask[] {
  return [...tasks].sort((a, b) => {
    const aRuns = visibleDiscoveryGeneratedRuns(a, discoveryTaskId, activeDiscoveryRun, taskRunsByTaskId);
    const bRuns = visibleDiscoveryGeneratedRuns(b, discoveryTaskId, activeDiscoveryRun, taskRunsByTaskId);
    const aActiveRun = aRuns.find((run) => isActiveRun(run.status)) ?? null;
    const bActiveRun = bRuns.find((run) => isActiveRun(run.status)) ?? null;
    const aActive = Boolean(aActiveRun);
    const bActive = Boolean(bActiveRun);
    if (aActive !== bActive) return aActive ? -1 : 1;
    if (aActive && bActive) {
      return runTimeForOrdering(bActiveRun) - runTimeForOrdering(aActiveRun);
    }
    const aLatest = selectLatestRun(aRuns);
    const bLatest = selectLatestRun(bRuns);
    const aHasTerminal = Boolean(aLatest && !isActiveRun(aLatest.status));
    const bHasTerminal = Boolean(bLatest && !isActiveRun(bLatest.status));
    if (aHasTerminal !== bHasTerminal) return aHasTerminal ? 1 : -1;
    if (aHasTerminal && bHasTerminal) {
      const diff = runTimeForOrdering(bLatest) - runTimeForOrdering(aLatest);
      if (diff !== 0) return diff;
    }
    const aDiscoveredAt = Date.parse(a.generatedSource?.latestDiscoveredAt ?? "");
    const bDiscoveredAt = Date.parse(b.generatedSource?.latestDiscoveredAt ?? "");
    if (Number.isFinite(aDiscoveredAt) || Number.isFinite(bDiscoveredAt)) {
      return (Number.isFinite(aDiscoveredAt) ? aDiscoveredAt : Number.NEGATIVE_INFINITY)
        - (Number.isFinite(bDiscoveredAt) ? bDiscoveredAt : Number.NEGATIVE_INFINITY);
    }
    return 0;
  });
}

export function discoveryGeneratedVisualState(
  itemStatus: string,
  latestRun: TeamRunState | null,
  activeRun: TeamRunState | null,
  waitingForCurrentDiscoveryRun: boolean,
): DiscoveryGeneratedVisualState {
  if (activeRun) return "running";
  if (waitingForCurrentDiscoveryRun) return "queued";
  if (latestRun?.status === "failed" || latestRun?.status === "cancelled" || latestRun?.status === "completed_with_failures") {
    return "failed";
  }
  if (latestRun && !isActiveRun(latestRun.status)) return "done";
  if (itemStatus === "stale") return "stale";
  return "idle";
}

export function discoveryStageLabel(stage: TeamDiscoveryStage): string {
  switch (stage) {
    case "discovering": return "Discovery";
    case "dispatching": return "Dispatch";
    case "auto-running": return "Auto-run";
    case "aggregating": return "Aggregation";
    case "completed": return "Aggregation";
    case "cancelled": return "Cancelled";
    default: return "Idle";
  }
}

export function discoveryStageFromRun(run: TeamRunState | null): TeamDiscoveryStage {
  if (run?.status === "cancelled") return "cancelled";
  if (run && isActiveRun(run.status)) return "discovering";
  if (run?.status === "completed" || run?.status === "completed_with_failures" || run?.status === "failed") return "completed";
  return "idle";
}

export function discoveryStageMeta(summary: TeamDiscoverySummary | undefined, latestRun: TeamRunState | null): {
  stage: TeamDiscoveryStage;
  label: string;
  processed: number;
  blocked: number;
  running: number;
  completed: number;
  generated: number;
} {
  const stage = summary?.stage ?? discoveryStageFromRun(latestRun);
  return {
    stage,
    label: discoveryStageLabel(stage),
    processed: summary?.dispatchProcessedCount ?? 0,
    blocked: summary?.failedDispatchCount ?? 0,
    running: summary?.runningGeneratedRunCount ?? 0,
    completed: summary?.completedGeneratedRunCount ?? 0,
    generated: summary?.generatedTaskCount ?? 0,
  };
}
