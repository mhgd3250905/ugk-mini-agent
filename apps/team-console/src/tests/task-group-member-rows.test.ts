import { describe, expect, it } from "vitest";
import type { TeamTaskConnection } from "../api/team-types";
import { buildTaskGroupMemberRows, taskGroupHeaderBandHeight } from "../graph/task-group-member-rows";

function connection(fromTaskId: string, toTaskId: string, status: TeamTaskConnection["status"] = "active"): TeamTaskConnection {
  return {
    schemaVersion: "team/task-connection-1",
    connectionId: `conn_${fromTaskId}_${toTaskId}`,
    fromTaskId,
    fromOutputPortId: "out",
    toTaskId,
    toInputPortId: "in",
    type: "json",
    status,
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
  };
}

describe("Task Group member rows", () => {
  it("uses backend headTaskIds to render each Group chain as a row", () => {
    const rows = buildTaskGroupMemberRows(
      {
        taskIds: ["task_a", "task_b", "task_c", "task_d"],
        headTaskIds: ["task_a", "task_c"],
      },
      [],
      [connection("task_a", "task_b"), connection("task_c", "task_d")],
      new Map([
        ["task_a", { title: "A" }],
        ["task_b", { title: "B" }],
        ["task_c", { title: "C" }],
        ["task_d", { title: "D" }],
      ]),
    );

    expect(rows.map((row) => row.map((member) => member.title))).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
  });

  it("falls back to derived heads and ignores stale connections", () => {
    const rows = buildTaskGroupMemberRows(
      { taskIds: ["task_a", "task_b", "task_c"] },
      [],
      [connection("task_a", "task_b"), connection("task_b", "task_c", "stale")],
      undefined,
    );

    expect(rows.map((row) => row.map((member) => member.taskId))).toEqual([
      ["task_a", "task_b"],
      ["task_c"],
    ]);
  });

  it("places unvisited members in a fallback row", () => {
    const rows = buildTaskGroupMemberRows(
      {
        taskIds: ["task_a", "task_b", "task_c"],
        headTaskIds: ["task_a"],
      },
      [],
      [connection("task_a", "task_b")],
      undefined,
    );

    expect(rows.map((row) => row.map((member) => member.taskId))).toEqual([
      ["task_a", "task_b"],
      ["task_c"],
    ]);
  });

  it("computes the expanded header band from member row count", () => {
    expect(taskGroupHeaderBandHeight(true, 3)).toBe(42);
    expect(taskGroupHeaderBandHeight(false, 0)).toBe(76);
    expect(taskGroupHeaderBandHeight(false, 3)).toBe(136);
  });
});
