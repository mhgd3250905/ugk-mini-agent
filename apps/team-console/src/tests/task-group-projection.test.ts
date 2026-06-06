import { describe, expect, it } from "vitest";
import type { ResolvedTeamTaskGroup, TeamCanvasTask, TeamRunState, TeamTaskGroupRun } from "../api/team-types";
import { buildLiveTaskGroups } from "../app/team-console-task-group-projection";

function task(taskId: string, title: string): TeamCanvasTask {
  return { taskId, title } as unknown as TeamCanvasTask;
}

function run(status: TeamRunState["status"]): TeamRunState {
  return { status } as unknown as TeamRunState;
}

function group(input: {
  groupId?: string;
  title?: string;
  taskIds: string[];
  headTaskIds?: string[];
  archived?: boolean;
  status?: ResolvedTeamTaskGroup["status"];
  errors?: ResolvedTeamTaskGroup["validation"]["errors"];
}): ResolvedTeamTaskGroup {
  return {
    schemaVersion: "team/task-group-1",
    groupId: input.groupId ?? "group_a",
    title: input.title ?? "Group A",
    taskIds: input.taskIds,
    archived: input.archived ?? false,
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    status: input.status ?? "valid",
    headTaskIds: input.headTaskIds ?? input.taskIds.slice(0, 1),
    validation: { errors: input.errors ?? [] },
  };
}

function groupRun(overrides: Partial<TeamTaskGroupRun>): TeamTaskGroupRun {
  return {
    schemaVersion: "team/task-group-run-1",
    groupRunId: "group_run_a",
    groupId: "group_a",
    status: "running",
    source: { type: "manual" },
    definition: { taskIds: ["task_a"], headTaskIds: ["task_a"] },
    entryRuns: [{ taskId: "task_a", runId: "run_a" }],
    observedRuns: [
      { taskId: "task_a", runId: "run_a", role: "entry" },
      { taskId: "task_b", runId: "run_b", role: "downstream" },
    ],
    startedAt: "2026-06-06T00:00:00.000Z",
    finishedAt: null,
    lastError: null,
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    ...overrides,
  };
}

describe("Team Console Task Group projection", () => {
  it("projects live groups into atlas groups with display and run state", () => {
    const result = buildLiveTaskGroups({
      groups: [group({ taskIds: ["task_a", "task_b"], headTaskIds: ["task_a"] })],
      taskNodes: [
        { kind: "canvas-task", nodeId: "node_a", taskId: "task_a", position: { x: 0, y: 0 } },
        { kind: "canvas-task", nodeId: "node_b", taskId: "task_b", position: { x: 100, y: 0 } },
      ],
      selectedTaskIds: ["task_c"],
      displayStates: [{ groupId: "group_a", collapsed: true, locked: true }],
      runUiState: {
        latestByGroupId: { group_a: groupRun({}) },
        savingByGroupId: { group_a: true },
      },
      taskRunsByTaskId: { task_b: [run("running")] },
      tasksById: new Map([
        ["task_a", task("task_a", "Collect")],
        ["task_b", task("task_b", "Summarize")],
      ]),
    });

    expect(result).toEqual([{
      groupId: "group_a",
      title: "Group A",
      taskNodeIds: ["node_a", "node_b"],
      taskIds: ["task_a", "task_b"],
      headTaskIds: ["task_a"],
      status: "valid",
      validationErrors: [],
      members: [
        { taskId: "task_a", title: "Collect" },
        { taskId: "task_b", title: "Summarize" },
      ],
      canAddSelectedTasks: true,
      collapsed: true,
      locked: true,
      groupRun: {
        status: "running",
        groupRunId: "group_run_a",
        entryCount: 1,
        observedCount: 2,
        saving: true,
        blockedByActiveTask: true,
      },
    }]);
  });

  it("filters archived groups and falls back to task ids for missing task titles", () => {
    const result = buildLiveTaskGroups({
      groups: [
        group({ groupId: "group_archived", taskIds: ["task_archived"], archived: true }),
        group({
          groupId: "group_invalid",
          title: "Invalid",
          taskIds: ["task_missing"],
          status: "invalid",
          headTaskIds: [],
          errors: [{ code: "missing_task", message: "Missing task" }],
        }),
      ],
      taskNodes: [],
      selectedTaskIds: ["task_missing"],
      displayStates: [],
      runUiState: { latestByGroupId: {}, savingByGroupId: {} },
      taskRunsByTaskId: { task_missing: [run("completed")] },
      tasksById: new Map(),
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.groupId).toBe("group_invalid");
    expect(result[0]?.taskNodeIds).toEqual([]);
    expect(result[0]?.members).toEqual([{ taskId: "task_missing", title: "task_missing" }]);
    expect(result[0]?.canAddSelectedTasks).toBe(false);
    expect(result[0]?.collapsed).toBe(false);
    expect(result[0]?.locked).toBe(false);
    expect(result[0]?.validationErrors).toEqual([{ code: "missing_task", message: "Missing task" }]);
    expect(result[0]?.groupRun).toEqual({
      status: "idle",
      groupRunId: undefined,
      entryCount: 0,
      observedCount: 0,
      saving: false,
      blockedByActiveTask: false,
    });
  });
});
