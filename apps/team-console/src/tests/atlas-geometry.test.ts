import { describe, it, expect } from "vitest";
import {
  AGENT_NODE_HEIGHT,
  CANVAS_TASK_NODE_HEIGHT,
  CANVAS_TASK_PORT_ROW_EXTRA_HEIGHT,
  CANVAS_SOURCE_NODE_HEIGHT,
  canvasTaskPortRowCount,
  canvasTaskNodeHeight,
  atlasDragEntryHeight,
  taskNodeRect,
  sourceNodeRect,
  rightMiddleAnchor,
  leftTopAnchor,
  connectorAnchors,
  rightMiddleToLeftTopPath,
  nearestZoomLevel,
  nextZoomLevel,
  snapCanvasOffset,
  normalizeAtlasViewport,
  ATLAS_ZOOM_LEVELS,
} from "../graph/atlas-geometry";
import { linkMidpoint } from "../graph/link-layout";
import type { TeamCanvasTask } from "../api/team-types";

function makeWorkUnit(overrides: Record<string, unknown> = {}) {
  return {
    title: "Test WorkUnit",
    input: { text: "" },
    inputPorts: [] as [],
    outputPorts: [] as [],
    outputContract: { text: "" },
    acceptance: { rules: [] as string[] },
    workerAgentId: "worker",
    checkerAgentId: "checker",
    ...overrides,
  };
}

function makeTask(overrides: Record<string, unknown> = {}): TeamCanvasTask {
  return {
    taskId: "task_1",
    title: "Test Task",
    status: "ready",
    leaderAgentId: "main",
    workUnit: makeWorkUnit(),
    createdAt: "",
    updatedAt: "",
    archived: false,
    ...overrides,
  } as TeamCanvasTask;
}

describe("atlas-geometry: node sizing", () => {
  it("canvasTaskPortRowCount returns 0 for task without ports", () => {
    expect(canvasTaskPortRowCount(makeTask())).toBe(0);
    expect(canvasTaskPortRowCount(undefined)).toBe(0);
  });

  it("canvasTaskPortRowCount counts input and output port rows", () => {
    const withInput = makeTask({ workUnit: makeWorkUnit({ inputPorts: [{ id: "in1", type: "md", label: "input" }] }) });
    expect(canvasTaskPortRowCount(withInput)).toBe(1);

    const withBoth = makeTask({ workUnit: makeWorkUnit({ inputPorts: [{ id: "in1", type: "md", label: "input" }], outputPorts: [{ id: "out1", type: "md", label: "output" }] }) });
    expect(canvasTaskPortRowCount(withBoth)).toBe(2);
  });

  it("canvasTaskNodeHeight returns base height without ports", () => {
    expect(canvasTaskNodeHeight(undefined)).toBe(CANVAS_TASK_NODE_HEIGHT);
    expect(canvasTaskNodeHeight(makeTask())).toBe(CANVAS_TASK_NODE_HEIGHT);
  });

  it("canvasTaskNodeHeight adds port row extra height", () => {
    const withBoth = makeTask({ workUnit: makeWorkUnit({ inputPorts: [{ id: "in1", type: "md", label: "input" }], outputPorts: [{ id: "out1", type: "md", label: "output" }] }) });
    expect(canvasTaskNodeHeight(withBoth)).toBe(CANVAS_TASK_NODE_HEIGHT + 2 * CANVAS_TASK_PORT_ROW_EXTRA_HEIGHT);
  });

  it("atlasDragEntryHeight returns correct height per kind", () => {
    expect(atlasDragEntryHeight("agent")).toBe(AGENT_NODE_HEIGHT);
    expect(atlasDragEntryHeight("source")).toBe(CANVAS_SOURCE_NODE_HEIGHT);
    expect(atlasDragEntryHeight("task")).toBe(CANVAS_TASK_NODE_HEIGHT);
    expect(atlasDragEntryHeight("task", makeTask())).toBe(CANVAS_TASK_NODE_HEIGHT);
  });
});

describe("atlas-geometry: rect builders", () => {
  it("taskNodeRect returns position-based rect with dynamic height", () => {
    const node = { nodeId: "n1", kind: "canvas-task" as const, taskId: "t1", position: { x: 100, y: 200 } };
    const rect = taskNodeRect(node, makeTask());
    expect(rect.x).toBe(100);
    expect(rect.y).toBe(200);
    expect(rect.width).toBe(280);
    expect(rect.height).toBe(CANVAS_TASK_NODE_HEIGHT);
  });

  it("sourceNodeRect returns fixed-height source rect", () => {
    const node = { nodeId: "s1", kind: "canvas-source" as const, sourceNodeId: "sn1", position: { x: 50, y: 80 } };
    const rect = sourceNodeRect(node);
    expect(rect.x).toBe(50);
    expect(rect.y).toBe(80);
    expect(rect.width).toBe(280);
    expect(rect.height).toBe(CANVAS_SOURCE_NODE_HEIGHT);
  });
});

describe("atlas-geometry: anchors", () => {
  const rect = { x: 100, y: 200, width: 280, height: 132 };

  it("rightMiddleAnchor returns right edge midpoint", () => {
    const anchor = rightMiddleAnchor(rect);
    expect(anchor.x).toBe(380);
    expect(anchor.y).toBe(266);
  });

  it("leftTopAnchor returns top-left corner", () => {
    const anchor = leftTopAnchor(rect);
    expect(anchor.x).toBe(100);
    expect(anchor.y).toBe(200);
  });

  it("connectorAnchors returns source right-mid and target left-top", () => {
    const source = { x: 0, y: 0, width: 280, height: 132 };
    const target = { x: 400, y: 100, width: 280, height: 132 };
    const anchors = connectorAnchors(source, target);
    expect(anchors.source).toEqual({ x: 280, y: 66 });
    expect(anchors.target).toEqual({ x: 400, y: 100 });
  });
});

describe("atlas-geometry: connector paths", () => {
  it("rightMiddleToLeftTopPath generates a straight path string", () => {
    const source = { x: 0, y: 0, width: 280, height: 132 };
    const target = { x: 400, y: 100, width: 280, height: 132 };
    const path = rightMiddleToLeftTopPath(source, target);
    expect(path).toContain("M280,66");
    expect(path).toContain("400,100");
  });
});

describe("atlas-geometry: zoom snapping", () => {
  it("nearestZoomLevel returns the closest allowed level", () => {
    expect(nearestZoomLevel(1)).toBe(1);
    expect(nearestZoomLevel(0.91)).toBe(0.9);
    expect(nearestZoomLevel(0.96)).toBe(1);
    expect(nearestZoomLevel(1.3)).toBe(1.25);
    expect(nearestZoomLevel(0.2)).toBe(0.45);
    expect(nearestZoomLevel(2.0)).toBe(1.8);
  });

  it("nextZoomLevel steps through allowed levels", () => {
    expect(nextZoomLevel(1, "in")).toBe(1.1);
    expect(nextZoomLevel(1, "out")).toBe(0.9);
    expect(nextZoomLevel(0.45, "out")).toBe(0.45);
    expect(nextZoomLevel(1.8, "in")).toBe(1.8);
  });

  it("all ATLAS_ZOOM_LEVELS are in ascending order", () => {
    for (let i = 1; i < ATLAS_ZOOM_LEVELS.length; i++) {
      expect(ATLAS_ZOOM_LEVELS[i]).toBeGreaterThan(ATLAS_ZOOM_LEVELS[i - 1]);
    }
  });
});

describe("atlas-geometry: device-pixel pan snapping", () => {
  it("snapCanvasOffset rounds to device pixel at DPR 1", () => {
    expect(snapCanvasOffset(30)).toBe(30);
    expect(snapCanvasOffset(30.3)).toBe(30);
    expect(snapCanvasOffset(30.5)).toBe(31);
  });

  it("snapCanvasOffset snaps to half-pixel at DPR 2", () => {
    const dprDescriptor = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    try {
      expect(snapCanvasOffset(30.25)).toBe(30.5);
      expect(snapCanvasOffset(30.1)).toBe(30);
    } finally {
      if (dprDescriptor) {
        Object.defineProperty(window, "devicePixelRatio", dprDescriptor);
      } else {
        delete (window as { devicePixelRatio?: number }).devicePixelRatio;
      }
    }
  });
});

describe("atlas-geometry: normalizeAtlasViewport", () => {
  it("snaps scale to nearest zoom level", () => {
    const vp = normalizeAtlasViewport({ x: 0, y: 0, scale: 0.91 });
    expect(vp.scale).toBe(0.9);
  });

  it("snaps pan offsets to device pixels", () => {
    const vp = normalizeAtlasViewport({ x: 10.3, y: 20.7, scale: 1 });
    expect(vp.x).toBe(10);
    expect(vp.y).toBe(21);
  });
});

describe("link-layout: linkMidpoint", () => {
  it("computes midpoint between two points", () => {
    const mid = linkMidpoint({ x: 100, y: 200 }, { x: 300, y: 400 });
    expect(mid.x).toBe(200);
    expect(mid.y).toBe(300);
  });

  it("handles same point", () => {
    const mid = linkMidpoint({ x: 50, y: 50 }, { x: 50, y: 50 });
    expect(mid.x).toBe(50);
    expect(mid.y).toBe(50);
  });
});
