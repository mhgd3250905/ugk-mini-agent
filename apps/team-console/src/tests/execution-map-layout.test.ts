import { describe, it, expect } from "vitest";
import { buildExecutionMapModel } from "../graph/execution-map-model";
import { layoutExecutionMap, NODE_HEIGHT, straightPath } from "../graph/execution-map-layout";
import type { TeamPlan, RunDetail, TaskDefinition, TaskStatus } from "../api/team-types";
import { makeRealSnapshotPlan, makeRealSnapshotRun, makeRealSuccessForEachPlan, makeRealSuccessForEachRun } from "../fixtures/team-fixtures";

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
  it("draws branch connectors as smooth curves", () => {
    const path = straightPath(280, 56, 640, 144);

    expect(path).toMatch(/^M280,56 C/);
    expect(path).toContain("640,144");
    expect(path).not.toContain(" L");
  });

  it("keeps reverse node connectors as compact endpoint hooks with a gentle middle curve", () => {
    const path = straightPath(862, 393, 528, 596.5);
    const coords = Array.from(path.matchAll(/([\d.]+),([\d.]+)/g)).map((match) => ({
      x: Number.parseFloat(match[1]!),
      y: Number.parseFloat(match[2]!),
    }));
    const allXs = coords.map((coord) => coord.x);

    expect((path.match(/\sC/g) ?? []).length).toBe(3);
    expect(path).not.toContain(" L");
    expect(Math.max(...allXs)).toBeLessThanOrEqual(926);
    expect(Math.min(...allXs)).toBeGreaterThanOrEqual(464);
    expect(coords).toHaveLength(10);
    expect(coords[0]).toEqual({ x: 862, y: 393 });
    expect(coords[9]).toEqual({ x: 528, y: 596.5 });
    expect(coords[1]!.x - coords[0]!.x).toBeGreaterThan(34);
    expect(coords[1]!.x - coords[0]!.x).toBeLessThanOrEqual(64);
    expect(coords[9]!.x - coords[8]!.x).toBeGreaterThan(34);
    expect(coords[9]!.x - coords[8]!.x).toBeLessThanOrEqual(64);
    expect(coords[3]!.y).toBeGreaterThan(coords[0]!.y);
    expect(coords[6]!.y).toBeLessThan(coords[9]!.y);
  });

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

  it("does not double-gap after collapsed branch", () => {
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
      [
        { id: "p", title: "P", type: "for_each", input: { text: "" }, acceptance: { rules: [] } },
        { id: "q", title: "Q", input: { text: "" }, acceptance: { rules: [] } },
        { id: "r", title: "R", input: { text: "" }, acceptance: { rules: [] } },
      ],
      { p: st(), q: st(), r: st(), ...states },
      children,
    );
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);

    const posP = layout.nodePositions.get("p")!;
    const posQ = layout.nodePositions.get("q")!;
    const posR = layout.nodePositions.get("r")!;

    // Q follows P (which has collapsed children) — gap should equal normal spine gap
    const gapAfterCollapsed = posQ.y - (posP.y + NODE_HEIGHT);
    // R follows Q (no children) — baseline gap
    const normalGap = posR.y - (posQ.y + NODE_HEIGHT);

    expect(gapAfterCollapsed).toBe(normalGap);
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

  it("does not expand selected task beyond base height", () => {
    const { plan, run } = makePlanAndRun(
      [
        { id: "a", title: "A", input: { text: "" }, acceptance: { rules: [] } },
        { id: "b", title: "B", input: { text: "" }, acceptance: { rules: [] } },
      ],
      { a: st(), b: st() },
    );
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);
    const posA = layout.nodePositions.get("a")!;
    expect(posA.height).toBe(NODE_HEIGHT);
  });

  it("uses taller base height for failed task nodes with error first line", () => {
    const { plan, run } = makePlanAndRun(
      [
        { id: "a", title: "A", input: { text: "" }, acceptance: { rules: [] } },
        { id: "b", title: "B", input: { text: "" }, acceptance: { rules: [] } },
      ],
      {
        a: st(),
        b: {
          ...st("failed"),
          errorSummary: "Worker timeout: exceeded 900000ms limit",
        },
      },
    );
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);

    const failedPos = layout.nodePositions.get("b")!;

    expect(failedPos.height).toBeGreaterThan(NODE_HEIGHT);
    expect(failedPos.height).toBeGreaterThanOrEqual(72);
  });

  it("pushes later main tasks below a failed task with error text", () => {
    const { plan, run } = makePlanAndRun(
      [
        { id: "a", title: "A", input: { text: "" }, acceptance: { rules: [] } },
        { id: "b", title: "B", input: { text: "" }, acceptance: { rules: [] } },
        { id: "c", title: "C", input: { text: "" }, acceptance: { rules: [] } },
      ],
      {
        a: st(),
        b: {
          ...st("failed"),
          errorSummary: "Worker timeout: exceeded 900000ms limit",
        },
        c: st(),
      },
    );
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);

    const failedPos = layout.nodePositions.get("b")!;
    const nextPos = layout.nodePositions.get("c")!;

    expect(failedPos.height).toBeGreaterThan(NODE_HEIGHT);
    expect(nextPos.y).toBeGreaterThanOrEqual(failedPos.y + failedPos.height);
  });

  it("pushes later tasks below evidence reserved height for selected leaf task", () => {
    const { plan, run } = makePlanAndRun(
      [
        { id: "a", title: "A", input: { text: "" }, acceptance: { rules: [] } },
        { id: "b", title: "B", input: { text: "" }, acceptance: { rules: [] } },
      ],
      { a: st(), b: st() },
    );
    const model = buildExecutionMapModel(plan, run);
    const baseline = layoutExecutionMap(model);
    const layout = layoutExecutionMap(model, { selectedTaskId: "a", selectedReservedHeight: 200 });

    const posA = layout.nodePositions.get("a")!;
    const posB = layout.nodePositions.get("b")!;
    const baselineB = baseline.nodePositions.get("b")!;

    expect(posA.height).toBe(NODE_HEIGHT);
    expect(posB.y).toBeGreaterThan(baselineB.y);
    expect(posB.y).toBeGreaterThanOrEqual(posA.y + 200);
  });

  it("keeps selected node visual height at base when reserving evidence space", () => {
    const { plan, run } = makePlanAndRun(
      [
        { id: "a", title: "A", input: { text: "" }, acceptance: { rules: [] } },
        { id: "b", title: "B", input: { text: "" }, acceptance: { rules: [] } },
      ],
      { a: st(), b: st() },
    );
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model, { selectedTaskId: "a", selectedReservedHeight: 300 });

    expect(layout.nodePositions.get("a")!.height).toBe(NODE_HEIGHT);
  });

  it("does not affect layout without both selectedTaskId and selectedReservedHeight", () => {
    const { plan, run } = makePlanAndRun(
      [
        { id: "a", title: "A", input: { text: "" }, acceptance: { rules: [] } },
        { id: "b", title: "B", input: { text: "" }, acceptance: { rules: [] } },
      ],
      { a: st(), b: st() },
    );
    const model = buildExecutionMapModel(plan, run);
    const baseline = layoutExecutionMap(model);
    const noOptions = layoutExecutionMap(model, {});
    const noHeight = layoutExecutionMap(model, { selectedTaskId: "a" });
    const noTaskId = layoutExecutionMap(model, { selectedReservedHeight: 200 });

    const baseY = baseline.nodePositions.get("b")!.y;
    expect(noOptions.nodePositions.get("b")!.y).toBe(baseY);
    expect(noHeight.nodePositions.get("b")!.y).toBe(baseY);
    expect(noTaskId.nodePositions.get("b")!.y).toBe(baseY);
  });

  it("discover_platforms evidence pushes search_platform and its children down", () => {
    const plan = makeRealSnapshotPlan();
    const run = makeRealSnapshotRun();
    const model = buildExecutionMapModel(plan, run);

    const evidenceH = 48 + 12 + 40 + 12 + 56;
    const layout = layoutExecutionMap(model, { selectedTaskId: "discover_platforms", selectedReservedHeight: evidenceH });

    const discoverPos = layout.nodePositions.get("discover_platforms")!;
    const searchPos = layout.nodePositions.get("search_platform")!;

    expect(discoverPos.height).toBe(NODE_HEIGHT);
    expect(searchPos.y).toBeGreaterThanOrEqual(discoverPos.y + evidenceH);
  });

  it("real success foreach collapses 13 children into single collapsed node", () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);

    const collapsedPos = layout.nodePositions.get("explore_direction__collapsed");
    expect(collapsedPos).toBeDefined();

    const parentPos = layout.nodePositions.get("explore_direction")!;
    expect(collapsedPos!.x).toBeGreaterThan(parentPos.x);

    // 13 individual children should NOT have positions
    expect(layout.nodePositions.get("explore_direction__official-search-apis")).toBeUndefined();
  });

  it("real success foreach has 3 main tasks on spine", () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);

    expect(layout.mainTaskNodes.length).toBe(3);
    expect(layout.mainTaskNodes[0].nodeId).toBe("discover_directions");
    expect(layout.mainTaskNodes[1].nodeId).toBe("explore_direction");
    expect(layout.mainTaskNodes[2].nodeId).toBe("assemble_report");
  });

  it("real success foreach spine gap after collapsed branch equals normal gap", () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    const model = buildExecutionMapModel(plan, run);
    const layout = layoutExecutionMap(model);

    const posExplore = layout.nodePositions.get("explore_direction")!;
    const posAssemble = layout.nodePositions.get("assemble_report")!;

    const gapAfterCollapsed = posAssemble.y - (posExplore.y + NODE_HEIGHT);
    // Should be a normal spine gap, not double-gapped
    expect(gapAfterCollapsed).toBeGreaterThanOrEqual(20);
    expect(gapAfterCollapsed).toBeLessThanOrEqual(80);
  });
});
