import { useState } from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { ExecutionMap, type AtlasTaskNode } from "../graph/ExecutionMap";
import {
  MockTeamApi,
  mockTeamTasks,
  makeSequentialPlan,
  makeSequentialRun,
  makeRealSuccessForEachPlan,
  makeRealSuccessForEachRun,
} from "../fixtures/team-fixtures";
import type { TeamAttemptMetadata } from "../api/team-types";

async function realSuccessOfficialAttempts(): Promise<TeamAttemptMetadata[]> {
  return new MockTeamApi().listAttempts(
    "run_real_success_foreach_001",
    "explore_direction__official-search-apis",
  );
}

describe("Canvas pan and zoom", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function firePointer(
    target: Element,
    type: "pointerdown" | "pointermove" | "pointerup",
    init: { pointerId: number; clientX: number; clientY: number; buttons?: number; button?: number },
  ) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      pointerId: { value: init.pointerId },
      clientX: { value: init.clientX },
      clientY: { value: init.clientY },
      buttons: { value: init.buttons ?? 1 },
      button: { value: init.button ?? 0 },
    });
    fireEvent(target, event);
  }

  function renderCanvasMap() {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const result = render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={() => {}} />);
    const container = result.container.querySelector(".execution-map-container") as HTMLElement;
    const stage = result.container.querySelector(".execution-map-scroll") as HTMLElement;
    expect(container).toBeTruthy();
    expect(stage).toBeTruthy();
    return { ...result, container, stage };
  }

  it("mouse wheel changes zoom percentage and stage transform", () => {
    const { container, stage } = renderCanvasMap();

    fireEvent.wheel(container, { deltaY: -120, clientX: 120, clientY: 120 });

    expect(screen.queryByLabelText(/当前缩放/)).toBeNull();
    expect(stage.style.transform).toContain("scale(1.1)");
  });

  it("wheel zoom updates the stage immediately and commits viewport after the wheel burst settles", () => {
    vi.useFakeTimers();
    const onViewportChange = vi.fn();
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const { container } = render(
      <ExecutionMap
        plan={plan}
        run={run}
        selectedTaskId={null}
        onSelectTask={() => {}}
        viewport={{ x: 0, y: 0, scale: 1 }}
        onViewportChange={onViewportChange}
      />,
    );
    const viewport = container.querySelector(".execution-map-container") as HTMLElement;
    const stage = container.querySelector(".execution-map-scroll") as HTMLElement;

    fireEvent.wheel(viewport, { deltaY: -120, clientX: 120, clientY: 120 });
    fireEvent.wheel(viewport, { deltaY: -120, clientX: 120, clientY: 120 });

    expect(stage.style.transform).toContain("scale(1.25)");
    expect(onViewportChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(180);
    });

    expect(onViewportChange).toHaveBeenCalledTimes(1);
    expect(onViewportChange).toHaveBeenLastCalledWith(expect.objectContaining({ scale: 1.25 }));
    vi.useRealTimers();
  });

  it("registers wheel zoom as a non-passive native listener", () => {
    const addSpy = vi.spyOn(HTMLElement.prototype, "addEventListener");

    renderCanvasMap();

    expect(addSpy).toHaveBeenCalledWith("wheel", expect.any(Function), { passive: false });
    addSpy.mockRestore();
  });

  it("wheel zoom clamps at min and max without rendering zoom controls", () => {
    const { container, stage } = renderCanvasMap();

    expect(screen.queryByRole("button", { name: "放大" })).toBeNull();
    expect(screen.queryByRole("button", { name: "缩小" })).toBeNull();
    expect(screen.queryByRole("button", { name: "重置视图" })).toBeNull();

    for (let i = 0; i < 20; i += 1) fireEvent.wheel(container, { deltaY: -120, clientX: 120, clientY: 120 });
    expect(stage.style.transform).toContain("scale(1.8)");

    for (let i = 0; i < 40; i += 1) fireEvent.wheel(container, { deltaY: 120, clientX: 120, clientY: 120 });
    expect(stage.style.transform).toContain("scale(0.45)");
  });

  it("does not render the obsolete reset view control", () => {
    const { container, stage } = renderCanvasMap();

    fireEvent.wheel(container, { deltaY: -120, clientX: 120, clientY: 120 });
    firePointer(container, "pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
    firePointer(container, "pointermove", { pointerId: 1, clientX: 40, clientY: 50 });
    expect(stage.style.transform).not.toBe("translate(0px, 0px) scale(1)");
    expect(screen.queryByRole("button", { name: "重置视图" })).toBeNull();
  });

  it("dragging empty canvas changes pan", () => {
    const { container, stage } = renderCanvasMap();

    firePointer(container, "pointerdown", { pointerId: 1, clientX: 12, clientY: 20 });
    firePointer(container, "pointermove", { pointerId: 1, clientX: 42, clientY: 56 });
    firePointer(container, "pointerup", { pointerId: 1, clientX: 42, clientY: 56, buttons: 0 });

    expect(stage.style.transform).toContain("translate(30px, 36px)");
  });

  it("keeps pan movement local until the pointer gesture is committed", () => {
    const onViewportChange = vi.fn();
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const { container } = render(
      <ExecutionMap
        plan={plan}
        run={run}
        selectedTaskId={null}
        onSelectTask={() => {}}
        viewport={{ x: 0, y: 0, scale: 1 }}
        onViewportChange={onViewportChange}
      />,
    );
    const viewport = container.querySelector(".execution-map-container") as HTMLElement;
    const stage = container.querySelector(".execution-map-scroll") as HTMLElement;

    firePointer(viewport, "pointerdown", { pointerId: 11, clientX: 12, clientY: 20 });
    firePointer(viewport, "pointermove", { pointerId: 11, clientX: 42, clientY: 56 });

    expect(stage.style.transform).toContain("translate(30px, 36px)");
    expect(onViewportChange).not.toHaveBeenCalled();

    firePointer(viewport, "pointerup", { pointerId: 11, clientX: 42, clientY: 56, buttons: 0 });

    expect(onViewportChange).toHaveBeenCalledTimes(1);
    expect(onViewportChange).toHaveBeenLastCalledWith({ x: 30, y: 36, scale: 1 });
  });

  it("snaps canvas pan offsets to device pixels", () => {
    const devicePixelRatioDescriptor = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });

    try {
      const { container, stage } = renderCanvasMap();

      firePointer(container, "pointerdown", { pointerId: 2, clientX: 10, clientY: 10 });
      firePointer(container, "pointermove", { pointerId: 2, clientX: 40.25, clientY: 46.25 });
      firePointer(container, "pointerup", { pointerId: 2, clientX: 40.25, clientY: 46.25, buttons: 0 });

      expect(stage.style.transform).toContain("translate(30.5px, 36.5px)");
    } finally {
      if (devicePixelRatioDescriptor) {
        Object.defineProperty(window, "devicePixelRatio", devicePixelRatioDescriptor);
      } else {
        delete (window as { devicePixelRatio?: number }).devicePixelRatio;
      }
    }
  });

  it("uses rendering hints that reduce scaled text blur", () => {
    const css = readFileSync("src/graph/execution-map.css", "utf8");
    expect(css).toContain("text-rendering: optimizeLegibility");
    expect(css).toContain("-webkit-font-smoothing: antialiased");
    expect(css).toContain("backface-visibility: hidden");
  });

  it("pointer down on a node does not start pan and still supports click", () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    const onSelectTask = vi.fn();
    const { container } = render(<ExecutionMap plan={plan} run={run} selectedTaskId={null} onSelectTask={onSelectTask} />);
    const viewport = container.querySelector(".execution-map-container") as HTMLElement;
    const stage = container.querySelector(".execution-map-scroll") as HTMLElement;
    const nodeButton = screen.getByRole("button", { name: /Research vendor B/ });

    firePointer(nodeButton, "pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
    firePointer(viewport, "pointermove", { pointerId: 1, clientX: 60, clientY: 60 });
    firePointer(viewport, "pointerup", { pointerId: 1, clientX: 60, clientY: 60, buttons: 0 });
    fireEvent.click(nodeButton);

    expect(stage.style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(onSelectTask).toHaveBeenCalledWith("task_2");
  });

  it("caches dock and trash hit-test geometry while dragging atlas root nodes", async () => {
    const task = mockTeamTasks[0]!;
    const taskNode: AtlasTaskNode = {
      nodeId: "task-node",
      kind: "canvas-task",
      taskId: task.taskId,
      position: { x: 280, y: 220 },
    };
    const onMoveCanvasTask = vi.fn();
    const rectReads: string[] = [];
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getMockRect(this: HTMLElement) {
      const className = String(this.getAttribute("class") ?? "");
      if (
        className.includes("emap-root-dock")
        || className.includes("emap-root-trash")
        || className.includes("execution-map-nodes")
      ) {
        rectReads.push(className);
      }
      if (className.includes("emap-root-dock")) {
        return { left: 900, top: 24, right: 1180, bottom: 120, width: 280, height: 96, x: 900, y: 24, toJSON: () => ({}) } as DOMRect;
      }
      if (className.includes("emap-root-trash")) {
        return { left: 900, top: 500, right: 1180, bottom: 620, width: 280, height: 120, x: 900, y: 500, toJSON: () => ({}) } as DOMRect;
      }
      if (className.includes("execution-map-nodes")) {
        return { left: 0, top: 0, right: 1400, bottom: 900, width: 1400, height: 900, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
      }
      return originalGetBoundingClientRect.call(this);
    });

    const { container } = render(
      <ExecutionMap
        plan={makeSequentialPlan()}
        run={makeSequentialRun()}
        selectedTaskId={null}
        onSelectTask={() => {}}
        taskNodes={[taskNode]}
        tasksById={new Map([[task.taskId, task]])}
        onMoveCanvasTask={onMoveCanvasTask}
      />,
    );
    const renderedTaskNode = await within(container).findByRole("button", { name: task.title });

    firePointer(renderedTaskNode, "pointerdown", { pointerId: 72, clientX: 320, clientY: 260 });
    firePointer(renderedTaskNode, "pointermove", { pointerId: 72, clientX: 360, clientY: 290 });
    const readsAfterCache = rectReads.length;
    firePointer(renderedTaskNode, "pointermove", { pointerId: 72, clientX: 390, clientY: 310 });
    firePointer(renderedTaskNode, "pointerup", { pointerId: 72, clientX: 390, clientY: 310, buttons: 0 });

    expect(readsAfterCache).toBeGreaterThan(0);
    expect(rectReads).toHaveLength(readsAfterCache);
    expect(onMoveCanvasTask).toHaveBeenCalled();
  });

  it("previews atlas root node dragging locally and commits the parent move on pointerup", async () => {
    const task = mockTeamTasks[0]!;
    const taskNode: AtlasTaskNode = {
      nodeId: "task-node",
      kind: "canvas-task",
      taskId: task.taskId,
      position: { x: 280, y: 220 },
    };
    const onMoveCanvasTask = vi.fn();

    const { container } = render(
      <ExecutionMap
        plan={makeSequentialPlan()}
        run={makeSequentialRun()}
        selectedTaskId={null}
        onSelectTask={() => {}}
        taskNodes={[taskNode]}
        tasksById={new Map([[task.taskId, task]])}
        onMoveCanvasTask={onMoveCanvasTask}
      />,
    );
    const renderedTaskNode = await within(container).findByRole("button", { name: task.title }) as HTMLElement;

    firePointer(renderedTaskNode, "pointerdown", { pointerId: 73, clientX: 320, clientY: 260 });
    firePointer(renderedTaskNode, "pointermove", { pointerId: 73, clientX: 360, clientY: 290 });

    expect(Number.parseFloat(renderedTaskNode.style.left)).toBeCloseTo(320, 4);
    expect(Number.parseFloat(renderedTaskNode.style.top)).toBeCloseTo(250, 4);
    expect(onMoveCanvasTask).not.toHaveBeenCalled();

    firePointer(renderedTaskNode, "pointerup", { pointerId: 73, clientX: 360, clientY: 290, buttons: 0 });

    expect(onMoveCanvasTask).toHaveBeenCalledTimes(1);
    expect(onMoveCanvasTask).toHaveBeenLastCalledWith("task-node", { x: 320, y: 250 });
  });

  it("selecting an expanded child after zoom does not enter a measurement feedback loop", async () => {
    const plan = makeRealSuccessForEachPlan();
    const run = makeRealSuccessForEachRun();
    const childId = "explore_direction__official-search-apis";
    const api = new MockTeamApi();
    const attempts = await realSuccessOfficialAttempts();
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const stage = document.querySelector(".execution-map-scroll") as HTMLElement | null;
      const scale = stage?.style.transform.includes("scale(1.1)") ? 1.1 : 1;
      if (this.classList.contains("emap-evidence-node")) {
        const layoutHeight = Number.parseInt(this.style.minHeight) || 56;
        const visualHeight = layoutHeight * scale;
        return { height: visualHeight, width: 240, x: 600, y: 128, top: 128, left: 600, bottom: 128 + visualHeight, right: 840 } as DOMRect;
      }
      return { height: 56, width: 280, x: 0, y: 0, top: 0, left: 0, bottom: 56, right: 280 } as DOMRect;
    });
    const offsetDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return this.classList.contains("emap-evidence-node") ? 56 : 56;
      },
    });

    function Harness() {
      const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
      return (
        <ExecutionMap
          plan={plan}
          run={run}
          selectedTaskId={selectedTaskId}
          onSelectTask={(taskId) => setSelectedTaskId((current) => current === taskId ? null : taskId)}
          attemptsByTaskId={{ [childId]: attempts }}
          readAttemptFile={api.readAttemptFile.bind(api)}
        />
      );
    }

    const { container } = render(<Harness />);
    const viewport = container.querySelector(".execution-map-container") as HTMLElement;

    fireEvent.click(screen.getByRole("button", { name: /展开 13 个子任务/ }));
    fireEvent.wheel(viewport, { deltaY: -120, clientX: 120, clientY: 120 });
    fireEvent.click(screen.getByRole("button", { name: /探寻方向：搜索引擎官方免费 API/ }));

    expect(await screen.findByText("Worker 输出 1")).toBeInTheDocument();
    expect(screen.queryByLabelText(/当前缩放/)).toBeNull();
    expect((container.querySelector(".execution-map-scroll") as HTMLElement).style.transform).toContain("scale(1.1)");

    rectSpy.mockRestore();
    if (offsetDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetDescriptor);
    } else {
      delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
    }
  });
});
