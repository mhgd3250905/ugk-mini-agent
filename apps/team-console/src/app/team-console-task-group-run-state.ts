import type { TeamTaskGroupRun } from "../api/team-types";

export function isActiveTaskGroupRun(groupRun: TeamTaskGroupRun | null | undefined): boolean {
  return groupRun?.status === "queued" || groupRun?.status === "running";
}

export function hasSameTaskGroupRunPollingSignature(
  a: TeamTaskGroupRun | null | undefined,
  b: TeamTaskGroupRun,
): boolean {
  return Boolean(a)
    && a!.groupRunId === b.groupRunId
    && a!.status === b.status
    && a!.updatedAt === b.updatedAt
    && a!.finishedAt === b.finishedAt
    && a!.observedRuns.length === b.observedRuns.length
    && a!.entryRuns.length === b.entryRuns.length;
}

export function selectLatestTaskGroupRun(groupRuns: TeamTaskGroupRun[]): TeamTaskGroupRun | null {
  if (!groupRuns.length) return null;
  return groupRuns.reduce((latest, groupRun) => {
    if (isActiveTaskGroupRun(groupRun) && !isActiveTaskGroupRun(latest)) return groupRun;
    if (!isActiveTaskGroupRun(groupRun) && isActiveTaskGroupRun(latest)) return latest;
    const latestTime = Date.parse(latest.createdAt);
    const runTime = Date.parse(groupRun.createdAt);
    if (!Number.isFinite(runTime)) return latest;
    if (!Number.isFinite(latestTime)) return groupRun;
    return runTime >= latestTime ? groupRun : latest;
  }, groupRuns[0]);
}
