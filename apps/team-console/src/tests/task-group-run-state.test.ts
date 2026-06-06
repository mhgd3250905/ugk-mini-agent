import { describe, expect, it } from "vitest";
import type { TeamTaskGroupRun } from "../api/team-types";
import {
  hasSameTaskGroupRunPollingSignature,
  isActiveTaskGroupRun,
  selectLatestTaskGroupRun,
} from "../app/team-console-task-group-run-state";

function groupRun(overrides: Partial<TeamTaskGroupRun>): TeamTaskGroupRun {
  return {
    schemaVersion: "team/task-group-run-1",
    groupRunId: "group_run_base",
    groupId: "group_1",
    status: "completed",
    source: { type: "manual" },
    definitionSnapshot: { taskIds: ["task_1"], headTaskIds: ["task_1"] },
    entryRuns: [],
    observedRuns: [],
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    lastError: null,
    ...overrides,
  };
}

describe("Team Console task group run state", () => {
  it("treats only queued and running GroupRuns as active", () => {
    expect(isActiveTaskGroupRun(groupRun({ status: "queued" }))).toBe(true);
    expect(isActiveTaskGroupRun(groupRun({ status: "running" }))).toBe(true);
    expect(isActiveTaskGroupRun(groupRun({ status: "completed" }))).toBe(false);
    expect(isActiveTaskGroupRun(null)).toBe(false);
  });

  it("selects an active GroupRun before newer terminal history", () => {
    const active = groupRun({
      groupRunId: "group_run_active",
      status: "running",
      createdAt: "2026-06-06T00:00:00.000Z",
    });
    const newerTerminal = groupRun({
      groupRunId: "group_run_done",
      status: "completed",
      createdAt: "2026-06-06T01:00:00.000Z",
    });

    expect(selectLatestTaskGroupRun([newerTerminal, active])?.groupRunId).toBe("group_run_active");
  });

  it("selects the newest GroupRun when activity class matches", () => {
    const older = groupRun({
      groupRunId: "group_run_older",
      createdAt: "2026-06-06T00:00:00.000Z",
    });
    const newer = groupRun({
      groupRunId: "group_run_newer",
      createdAt: "2026-06-06T02:00:00.000Z",
    });

    expect(selectLatestTaskGroupRun([older, newer])?.groupRunId).toBe("group_run_newer");
  });

  it("compares the polling signature fields App uses to skip render churn", () => {
    const current = groupRun({
      groupRunId: "group_run_same",
      status: "running",
      updatedAt: "2026-06-06T00:00:01.000Z",
      observedRuns: [{ taskId: "task_1", runId: "run_1", role: "entry" }],
    });

    expect(hasSameTaskGroupRunPollingSignature(current, { ...current })).toBe(true);
    expect(hasSameTaskGroupRunPollingSignature(current, {
      ...current,
      observedRuns: [
        ...current.observedRuns,
        { taskId: "task_2", runId: "run_2", role: "downstream" },
      ],
    })).toBe(false);
  });
});
