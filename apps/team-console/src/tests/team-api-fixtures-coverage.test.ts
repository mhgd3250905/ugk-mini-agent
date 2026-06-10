import { describe, it, expect } from "vitest";
import {
  makeSequentialRun,
  makeDiscoveryForEachRun,
  makeOrphanRun,
  makeLargeChildRun,
} from "../fixtures/team-fixtures";

describe("Fixtures coverage", () => {
  it("sequential run has plan tasks in order", () => {
    const run = makeSequentialRun();
    expect(Object.keys(run.taskStates)).toEqual(["task_1", "task_2", "task_3"]);
  });

  it("discovery run has generated children with parentTaskId", () => {
    const run = makeDiscoveryForEachRun();
    expect(run.taskDefinitions).toBeDefined();
    const children = run.taskDefinitions!.filter((t) => t.parentTaskId === "process_each");
    expect(children.length).toBe(3);
    expect(children[0].generatedSource).toBe("for_each");
  });

  it("orphan run has task without parent match", () => {
    const run = makeOrphanRun();
    expect(run.taskDefinitions).toBeDefined();
    const orphan = run.taskDefinitions!.find((t) => t.id === "orphan_child_001");
    expect(orphan).toBeDefined();
    expect(orphan!.parentTaskId).toBeUndefined();
  });

  it("large child run has 10 children", () => {
    const run = makeLargeChildRun();
    expect(run.taskDefinitions!.length).toBe(10);
    expect(run.summary.totalTasks).toBe(12);
  });

  it("failed run has errorSummary on failed task", async () => {
    const { makeFailedRun } = await import("../fixtures/team-fixtures");
    const run = makeFailedRun();
    expect(run.taskStates["task_2"].errorSummary).toBeTruthy();
    expect(run.taskStates["task_2"].status).toBe("failed");
  });
});
