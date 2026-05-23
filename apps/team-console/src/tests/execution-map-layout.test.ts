import { describe, it, expect } from "vitest";
import { buildExecutionMapModel } from "../graph/execution-map-model";
import { layoutExecutionMap } from "../graph/execution-map-layout";
import type { TeamPlan, RunDetail, TaskDefinition, TaskStatus } from "../api/team-types";

function makePlanAndRun(
  tasks: TeamPlan["tasks"],
  taskStates: RunDetail["taskStates"],
  taskDefs?: TaskDefinition[],
): { plan: TeamPlan; run: RunDetail } {
  const plan: TeamPlan = {
    planId: "p1", title: "Test", defaultTeamUnitId: "tu1",
    goal: { text: "" }, tasks, outputContract: { text: "" },
    archived: false, runCount: 1,
  };
  const run: RunDetail = {
    runId: "r1", planId: "p1", teamUnitId: "tu1", status: "completed",
    createdAt: "", startedAt: "", finishedAt: "", currentTaskId: null,
    taskStates, summary: { totalTasks: 0, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    taskDefinitions: taskDefs,
  };
  return { plan, run };
}

function st(status: TaskStatus = "succeeded") {
  return { status, attemptCount: 1, activeAttemptId: null, resultRef: null, errorSummary: null, progress: { phase: status, message: "", updatedAt: "" } };
}

describe("layoutExecutionMap", () => {
  it("places root at top center", () => {
    const { plan, run } = makePlanAndRun(
      [{ id: "t1", title: "T1", input: { text: "" }, acceptance: { rules: [] } }],
      { t1: st() },
    );
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);
    expect(layout.rootNode).toBeDefined();
    expect(layout.rootNode.y).toBe(0);
  });

  it("places main tasks on spine at x=0", () => {
    const { plan, run } = makePlanAndRun(
      [
        { id: "a", title: "A", input: { text: "" }, acceptance: { rules: [] } },
        { id: "b", title: "B", input: { text: "" }, acceptance: { rules: [] } },
      ],
      { a: st(), b: st() },
    );
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);
    for (const node of layout.mainTaskNodes) {
      expect(node.x).toBe(0);
    }
    expect(layout.mainTaskNodes[1].y).toBeGreaterThan(layout.mainTaskNodes[0].y);
  });

  it("places children to the right of parent", () => {
    const child: TaskDefinition = {
      id: "p__c1", title: "C1", type: "normal",
      input: { text: "" }, acceptance: { rules: [] },
      parentTaskId: "p", generated: true, generatedSource: "for_each",
    };
    const { plan, run } = makePlanAndRun(
      [{ id: "p", title: "P", type: "for_each", input: { text: "" }, acceptance: { rules: [] } }],
      { p: st(), "p__c1": st() },
      [child],
    );
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);
    const childNode = layout.nodePositions.get("p__c1");
    expect(childNode).toBeDefined();
    expect(childNode!.x).toBeGreaterThan(0);
  });

  it("outputs links connecting parent to children", () => {
    const child: TaskDefinition = {
      id: "p__c1", title: "C1", type: "normal",
      input: { text: "" }, acceptance: { rules: [] },
      parentTaskId: "p", generated: true, generatedSource: "for_each",
    };
    const { plan, run } = makePlanAndRun(
      [{ id: "p", title: "P", type: "for_each", input: { text: "" }, acceptance: { rules: [] } }],
      { p: st(), "p__c1": st() },
      [child],
    );
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);
    const parentToChildLink = layout.links.find((l) => l.sourceId === "p" && l.targetId === "p__c1");
    expect(parentToChildLink).toBeDefined();
  });

  it("collapses children beyond threshold", () => {
    const children: TaskDefinition[] = [];
    const states: Record<string, ReturnType<typeof st>> = {};
    for (let i = 1; i <= 8; i++) {
      const id = `p__c${i}`;
      children.push({
        id, title: `Child ${i}`, type: "normal",
        input: { text: "" }, acceptance: { rules: [] },
        parentTaskId: "p", generated: true, generatedSource: "for_each",
      });
      states[id] = st();
    }
    const { plan, run } = makePlanAndRun(
      [{ id: "p", title: "P", type: "for_each", input: { text: "" }, acceptance: { rules: [] } }],
      { p: st(), ...states },
      children,
    );
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);
    const parentPos = layout.nodePositions.get("p")!;
    const collapsedNode = layout.nodePositions.get("p__collapsed");
    expect(collapsedNode).toBeDefined();
    expect(collapsedNode!.x).toBeGreaterThan(parentPos.x);
  });

  it("links from root to first main task", () => {
    const { plan, run } = makePlanAndRun(
      [{ id: "t1", title: "T1", input: { text: "" }, acceptance: { rules: [] } }],
      { t1: st() },
    );
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);
    const rootLink = layout.links.find((l) => l.sourceId === "__root__");
    expect(rootLink).toBeDefined();
    expect(rootLink!.targetId).toBe("t1");
  });

  it("links between consecutive main tasks", () => {
    const { plan, run } = makePlanAndRun(
      [
        { id: "a", title: "A", input: { text: "" }, acceptance: { rules: [] } },
        { id: "b", title: "B", input: { text: "" }, acceptance: { rules: [] } },
      ],
      { a: st(), b: st() },
    );
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);
    const spineLink = layout.links.find((l) => l.sourceId === "a" && l.targetId === "b");
    expect(spineLink).toBeDefined();
  });

  it("places orphan group below main tasks", () => {
    const orphan: TaskDefinition = {
      id: "orphan", title: "Orphan", type: "normal",
      input: { text: "" }, acceptance: { rules: [] },
      generated: true, generatedSource: "for_each",
    };
    const { plan, run } = makePlanAndRun(
      [{ id: "t1", title: "T1", input: { text: "" }, acceptance: { rules: [] } }],
      { t1: st(), orphan: st() },
      [orphan],
    );
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);
    expect(layout.orphanNodes.length).toBeGreaterThan(0);
    const orphanPos = layout.orphanNodes[0];
    expect(orphanPos.y).toBeGreaterThan(layout.mainTaskNodes[layout.mainTaskNodes.length - 1].y);
  });

  it("keeps all main tasks at the same x coordinate", () => {
    const { plan, run } = makePlanAndRun(
      [
        { id: "a", title: "A", input: { text: "" }, acceptance: { rules: [] } },
        { id: "b", title: "B", input: { text: "" }, acceptance: { rules: [] } },
        { id: "c", title: "C", input: { text: "" }, acceptance: { rules: [] } },
      ],
      { a: st(), b: st(), c: st() },
    );
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);
    const xs = layout.mainTaskNodes.map((n) => n.x);
    expect(new Set(xs).size).toBe(1);
  });

  it("positions child branch nodes to the right of parent center", () => {
    const child: TaskDefinition = {
      id: "p__c1", title: "C1", type: "normal",
      input: { text: "" }, acceptance: { rules: [] },
      parentTaskId: "p", generated: true, generatedSource: "for_each",
    };
    const child2: TaskDefinition = {
      id: "p__c2", title: "C2", type: "normal",
      input: { text: "" }, acceptance: { rules: [] },
      parentTaskId: "p", generated: true, generatedSource: "for_each",
    };
    const { plan, run } = makePlanAndRun(
      [{ id: "p", title: "P", type: "for_each", input: { text: "" }, acceptance: { rules: [] } }],
      { p: st(), "p__c1": st(), "p__c2": st() },
      [child, child2],
    );
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);
    const parentPos = layout.nodePositions.get("p")!;
    const childPos = layout.nodePositions.get("p__c1")!;
    expect(childPos.x).toBeGreaterThan(parentPos.x);
  });

  it("positions collapsed node to the right of its parent", () => {
    const children: TaskDefinition[] = [];
    const states: Record<string, ReturnType<typeof st>> = {};
    for (let i = 1; i <= 8; i++) {
      const id = `p__c${i}`;
      children.push({
        id, title: `Child ${i}`, type: "normal",
        input: { text: "" }, acceptance: { rules: [] },
        parentTaskId: "p", generated: true, generatedSource: "for_each",
      });
      states[id] = st();
    }
    const { plan, run } = makePlanAndRun(
      [{ id: "p", title: "P", type: "for_each", input: { text: "" }, acceptance: { rules: [] } }],
      { p: st(), ...states },
      children,
    );
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);
    const parentPos = layout.nodePositions.get("p")!;
    const collapsedPos = layout.nodePositions.get("p__collapsed")!;
    expect(collapsedPos.x).toBeGreaterThan(parentPos.x);
    expect(collapsedPos.x).toBeGreaterThan(parentPos.x + parentPos.width / 2);
  });
});
