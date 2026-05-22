import { describe, it, expect } from "vitest";
import { buildExecutionMapModel } from "../graph/execution-map-model";
import type { TeamPlan, RunDetail, TaskDefinition } from "../api/team-types";

function makePlanAndRun(
  tasks: TeamPlan["tasks"],
  taskStates: RunDetail["taskStates"],
  extra?: Partial<RunDetail>,
  taskDefs?: TaskDefinition[],
): { plan: TeamPlan; run: RunDetail } {
  const plan: TeamPlan = {
    planId: "p1",
    title: "Test Plan",
    defaultTeamUnitId: "tu1",
    goal: { text: "test" },
    tasks,
    outputContract: { text: "test" },
    archived: false,
    runCount: 1,
  };
  const run: RunDetail = {
    runId: "r1",
    planId: "p1",
    teamUnitId: "tu1",
    status: "completed",
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    currentTaskId: null,
    taskStates,
    summary: { totalTasks: Object.keys(taskStates).length, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    taskDefinitions: taskDefs,
    ...extra,
  };
  return { plan, run };
}

describe("buildExecutionMapModel", () => {
  it("orders main tasks by plan order", () => {
    const { plan, run } = makePlanAndRun(
      [
        { id: "a", title: "A", input: { text: "a" }, acceptance: { rules: [] } },
        { id: "b", title: "B", input: { text: "b" }, acceptance: { rules: [] } },
        { id: "c", title: "C", input: { text: "c" }, acceptance: { rules: [] } },
      ],
      {
        a: { status: "succeeded", attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: null, progress: { phase: "succeeded", message: "", updatedAt: "" } },
        b: { status: "succeeded", attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: null, progress: { phase: "succeeded", message: "", updatedAt: "" } },
        c: { status: "succeeded", attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: null, progress: { phase: "succeeded", message: "", updatedAt: "" } },
      },
    );
    const model = buildExecutionMapModel(plan, run);
    const mainIds = model.mainTasks.map((n) => n.taskId);
    expect(mainIds).toEqual(["a", "b", "c"]);
  });

  it("groups for_each children by parentTaskId", () => {
    const childA: TaskDefinition = {
      id: "parent__a", title: "Child A", type: "normal",
      input: { text: "" }, acceptance: { rules: [] },
      parentTaskId: "parent", generated: true, generatedSource: "for_each",
    };
    const childB: TaskDefinition = {
      id: "parent__b", title: "Child B", type: "normal",
      input: { text: "" }, acceptance: { rules: [] },
      parentTaskId: "parent", generated: true, generatedSource: "for_each",
    };
    const { plan, run } = makePlanAndRun(
      [{ id: "parent", title: "Parent", type: "for_each", input: { text: "" }, acceptance: { rules: [] } }],
      {
        parent: { status: "succeeded", attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: null, progress: { phase: "succeeded", message: "", updatedAt: "" } },
        "parent__a": { status: "succeeded", attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: null, progress: { phase: "succeeded", message: "", updatedAt: "" } },
        "parent__b": { status: "succeeded", attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: null, progress: { phase: "succeeded", message: "", updatedAt: "" } },
      },
      undefined,
      [childA, childB],
    );
    const model = buildExecutionMapModel(plan, run);
    const parent = model.mainTasks[0];
    expect(parent.children).toHaveLength(2);
    expect(parent.children.map((c) => c.taskId)).toEqual(["parent__a", "parent__b"]);
  });

  it("groups decomposition children", () => {
    const child: TaskDefinition = {
      id: "big__sub1", title: "Sub 1", type: "normal",
      input: { text: "" }, acceptance: { rules: [] },
      parentTaskId: "big", generated: true, generatedSource: "decomposition",
    };
    const { plan, run } = makePlanAndRun(
      [{ id: "big", title: "Big", input: { text: "" }, acceptance: { rules: [] }, decomposer: { mode: "leaf" } }],
      {
        big: { status: "succeeded", attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: null, progress: { phase: "succeeded", message: "", updatedAt: "" } },
        "big__sub1": { status: "succeeded", attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: null, progress: { phase: "succeeded", message: "", updatedAt: "" } },
      },
      undefined,
      [child],
    );
    const model = buildExecutionMapModel(plan, run);
    expect(model.mainTasks[0].children).toHaveLength(1);
    expect(model.mainTasks[0].children[0].generatedSource).toBe("decomposition");
  });

  it("uses id prefix fallback when no explicit parentTaskId", () => {
    const orphanWithPrefix: TaskDefinition = {
      id: "task_1__derived", title: "Derived", type: "normal",
      input: { text: "" }, acceptance: { rules: [] },
      generated: true, generatedSource: "for_each",
    };
    const { plan, run } = makePlanAndRun(
      [{ id: "task_1", title: "T1", input: { text: "" }, acceptance: { rules: [] } }],
      {
        task_1: { status: "succeeded", attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: null, progress: { phase: "succeeded", message: "", updatedAt: "" } },
        "task_1__derived": { status: "succeeded", attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: null, progress: { phase: "succeeded", message: "", updatedAt: "" } },
      },
      undefined,
      [orphanWithPrefix],
    );
    const model = buildExecutionMapModel(plan, run);
    expect(model.mainTasks[0].children).toHaveLength(1);
    expect(model.mainTasks[0].children[0].fallback).toBe(true);
  });

  it("places orphan tasks in orphan group", () => {
    const orphan: TaskDefinition = {
      id: "mystery_task", title: "Mystery", type: "normal",
      input: { text: "" }, acceptance: { rules: [] },
      generated: true, generatedSource: "for_each",
    };
    const { plan, run } = makePlanAndRun(
      [{ id: "task_1", title: "T1", input: { text: "" }, acceptance: { rules: [] } }],
      {
        task_1: { status: "succeeded", attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: null, progress: { phase: "succeeded", message: "", updatedAt: "" } },
        mystery_task: { status: "succeeded", attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: null, progress: { phase: "succeeded", message: "", updatedAt: "" } },
      },
      undefined,
      [orphan],
    );
    const model = buildExecutionMapModel(plan, run);
    expect(model.orphanGroup).toHaveLength(1);
    expect(model.orphanGroup[0].taskId).toBe("mystery_task");
  });

  it("extracts error first line from failed nodes", () => {
    const { plan, run } = makePlanAndRun(
      [{ id: "t1", title: "T1", input: { text: "" }, acceptance: { rules: [] } }],
      {
        t1: { status: "failed", attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: "Worker timeout\nStack trace line 2", progress: { phase: "failed", message: "", updatedAt: "" } },
      },
    );
    const model = buildExecutionMapModel(plan, run);
    expect(model.mainTasks[0].errorFirstLine).toBe("Worker timeout");
  });

  it("includes root run node", () => {
    const { plan, run } = makePlanAndRun(
      [{ id: "t1", title: "T1", input: { text: "" }, acceptance: { rules: [] } }],
      { t1: { status: "succeeded", attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: null, progress: { phase: "succeeded", message: "", updatedAt: "" } } },
    );
    const model = buildExecutionMapModel(plan, run);
    expect(model.rootNode).toBeDefined();
    expect(model.rootNode.runId).toBe("r1");
  });

  it("provides parent chain lookup for selection highlighting", () => {
    const child: TaskDefinition = {
      id: "p__c1", title: "C1", type: "normal",
      input: { text: "" }, acceptance: { rules: [] },
      parentTaskId: "p", generated: true, generatedSource: "for_each",
    };
    const { plan, run } = makePlanAndRun(
      [{ id: "p", title: "P", type: "for_each", input: { text: "" }, acceptance: { rules: [] } }],
      {
        p: { status: "succeeded", attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: null, progress: { phase: "succeeded", message: "", updatedAt: "" } },
        "p__c1": { status: "succeeded", attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: null, progress: { phase: "succeeded", message: "", updatedAt: "" } },
      },
      undefined,
      [child],
    );
    const model = buildExecutionMapModel(plan, run);
    const chain = model.parentChainLookup.get("p__c1");
    expect(chain).toBeDefined();
    expect(chain).toContain("p");
  });
});
