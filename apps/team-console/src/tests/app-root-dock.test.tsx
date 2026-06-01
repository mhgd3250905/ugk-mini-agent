import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { mockDiscoveryRootTask, mockTeamTasks, resetMockTeamApiState } from "../fixtures/team-fixtures";
import { getAtlasNodes, firePointer, dragRootNodeToDock } from "./app-dom-test-utils";

describe("App", () => {
  beforeEach(() => {
    resetMockTeamApiState();
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("root dock", () => {
    it("minimizes root Agent and Task nodes into the bottom dock and restores them", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }));
      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));

      const agentNode = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
      const taskNode = container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]') as HTMLElement | null;
      expect(agentNode).toBeTruthy();
      expect(taskNode).toBeTruthy();
      expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
      expect(container.querySelector(".task-action-branch")).toBeTruthy();

      dragRootNodeToDock(container, agentNode!, 11);
      dragRootNodeToDock(container, taskNode!, 12);

      expect(container.querySelector('.emap-agent-node[data-agent-id="main"]')).toBeNull();
      expect(container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]')).toBeNull();
      expect(container.querySelector(".agent-playground-branch")).toBeNull();
      expect(container.querySelector(".task-action-branch")).toBeNull();

      const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(dock).toBeTruthy();
      expect(within(dock!).getByRole("button", { name: /复原 Agent 主 Agent/ })).toBeInTheDocument();
      expect(within(dock!).getByRole("button", { name: /复原 Task 调查 Medtrum 云资产/ })).toBeInTheDocument();

      fireEvent.click(within(dock!).getByRole("button", { name: /复原 Agent 主 Agent/ }));
      fireEvent.click(within(dock!).getByRole("button", { name: /复原 Task 调查 Medtrum 云资产/ }));

      await waitFor(() => {
        expect(container.querySelector('.emap-agent-node[data-agent-id="main"]')).toBeTruthy();
        expect(container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]')).toBeTruthy();
        expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
        expect(container.querySelector(".task-action-branch")).toBeTruthy();
      });
    });

    it("keeps an empty Dock panel visible without a handle and collapses immediately after pointer leave", async () => {
      vi.useFakeTimers();
      try {
        const { container } = render(<App />);

        const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
        expect(dock).toBeTruthy();
        expect(dock).toHaveAttribute("data-empty", "true");
        expect(dock).toHaveAttribute("data-dock-state", "collapsed");
        expect(dock!.querySelector(".emap-root-dock-peek")).toBeNull();

        fireEvent.pointerEnter(dock!);
        expect(dock).toHaveAttribute("data-dock-state", "expanded");

        fireEvent.mouseMove(window, { clientX: 20, clientY: 20 });
        expect(dock).toHaveAttribute("data-dock-state", "collapsed");
      } finally {
        vi.useRealTimers();
      }
    });

    it("waits 3 seconds to collapse a non-empty Dock after pointer leave", async () => {
      const { container } = render(<App />);
      const taskEl = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      dragRootNodeToDock(container, taskEl, 13);

      const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(dock).toBeTruthy();
      expect(dock).toHaveAttribute("data-empty", "false");

      vi.useFakeTimers();
      try {
        fireEvent.pointerEnter(dock!);
        expect(dock).toHaveAttribute("data-dock-state", "expanded");
        fireEvent.mouseMove(window, { clientX: 20, clientY: 20 });

        await act(async () => {
          vi.advanceTimersByTime(2999);
        });
        expect(dock).toHaveAttribute("data-dock-state", "expanded");

        await act(async () => {
          vi.advanceTimersByTime(1);
        });
        expect(dock).toHaveAttribute("data-dock-state", "collapsed");
      } finally {
        vi.useRealTimers();
      }
    });

    it("expands the Dock while dragging a root node over the collapsed panel and collapses when leaving empty", async () => {
      const { container } = render(<App />);
      const taskEl = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });

      vi.useFakeTimers();
      try {
        const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
        expect(dock).toBeTruthy();
        expect(dock).toHaveAttribute("data-dock-state", "collapsed");
        vi.spyOn(dock!, "getBoundingClientRect").mockReturnValue({
          x: 330, y: 748, width: 560, height: 78,
          left: 330, top: 748, right: 890, bottom: 826,
          toJSON: () => ({}),
        } as DOMRect);

        const PID = 44;
        firePointer(taskEl, "pointerdown", { pointerId: PID, clientX: 300, clientY: 300 });
        firePointer(taskEl, "pointermove", { pointerId: PID, clientX: 420, clientY: 762 });
        expect(dock).toHaveAttribute("data-dock-state", "expanded");
        expect(dock!.classList.contains("is-drop-hover")).toBe(true);

        firePointer(taskEl, "pointermove", { pointerId: PID, clientX: 120, clientY: 180 });
        expect(dock).toHaveAttribute("data-dock-state", "collapsed");
        firePointer(taskEl, "pointerup", { pointerId: PID, clientX: 120, clientY: 180 });
      } finally {
        vi.useRealTimers();
      }
    });

    it("expands and accepts Dock drop when a dragged root node collides with the collapsed edge", async () => {
      const { container } = render(<App />);
      const taskEl = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      const originalLeft = parseFloat(taskEl.style.left);
      const originalTop = parseFloat(taskEl.style.top);
      expect(Number.isFinite(originalLeft)).toBe(true);
      expect(Number.isFinite(originalTop)).toBe(true);

      vi.useFakeTimers();
      try {
        const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
        expect(dock).toBeTruthy();
        expect(dock).toHaveAttribute("data-dock-state", "collapsed");
        const dockTop = originalTop + 260;
        vi.spyOn(dock!, "getBoundingClientRect").mockReturnValue({
          x: originalLeft - 20, y: dockTop, width: 360, height: 72,
          left: originalLeft - 20, top: dockTop, right: originalLeft + 340, bottom: dockTop + 72,
          toJSON: () => ({}),
        } as DOMRect);

        const PID = 45;
        const startX = originalLeft + 50;
        const startY = originalTop + 30;
        const targetY = dockTop - 54;
        const taskHeight = Number.parseFloat(taskEl.style.height);
        expect(targetY).toBeLessThan(dockTop);
        expect(originalTop + taskHeight + (targetY - startY)).toBeGreaterThan(dockTop);

        firePointer(taskEl, "pointerdown", { pointerId: PID, clientX: startX, clientY: startY });
        firePointer(taskEl, "pointermove", { pointerId: PID, clientX: startX, clientY: targetY });
        expect(dock).toHaveAttribute("data-dock-state", "expanded");
        expect(dock!.classList.contains("is-drop-hover")).toBe(true);

        fireEvent.pointerMove(window, { clientX: startX + 1, clientY: targetY + 1 });
        expect(dock).toHaveAttribute("data-dock-state", "expanded");
        expect(dock!.classList.contains("is-drop-hover")).toBe(true);

        firePointer(taskEl, "pointermove", { pointerId: PID, clientX: startX + 1, clientY: targetY + 1 });
        expect(dock).toHaveAttribute("data-dock-state", "expanded");
        expect(dock!.classList.contains("is-drop-hover")).toBe(true);

        firePointer(taskEl, "pointerup", { pointerId: PID, clientX: startX, clientY: targetY });
        expect(container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]')).toBeNull();
        expect(within(dock!).getByRole("button", { name: /复原 Task 调查 Medtrum 云资产/ })).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("keeps the Dock shell flat glass with one-root minimum width and even padding", () => {
      const executionMapCss = readFileSync("src/graph/execution-map.css", "utf8");
      const dockBlock = executionMapCss.match(/\.emap-root-dock \{(?<block>[\s\S]*?)\n\}/)?.groups?.block ?? "";

      expect(dockBlock).toContain("min-width: min(72vw, var(--emap-root-dock-min-width, 280px))");
      expect(dockBlock).toContain("padding: 12px");
      expect(dockBlock).toContain("background: rgba(");
      expect(dockBlock).toContain("backdrop-filter: blur(");
      expect(dockBlock).not.toContain("linear-gradient");
    });

    it("restores Agent root node to pre-drag position after drag-to-dock minimize", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      const agentNode = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
      expect(agentNode).toBeTruthy();

      const originalLeft = parseFloat(agentNode!.style.left);
      const originalTop = parseFloat(agentNode!.style.top);
      expect(Number.isFinite(originalLeft)).toBe(true);
      expect(Number.isFinite(originalTop)).toBe(true);

      // Mock dock getBoundingClientRect so it is a valid drop target
      const dockEl = container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(dockEl).toBeTruthy();
      vi.spyOn(dockEl!, "getBoundingClientRect").mockReturnValue({
        x: 200, y: 700, width: 400, height: 60,
        left: 200, top: 700, right: 600, bottom: 760,
        toJSON: () => ({}),
      } as DOMRect);

      // Drag the agent node into the dock area
      const PID = 1;
      firePointer(agentNode!, "pointerdown", { pointerId: PID, clientX: originalLeft + 50, clientY: originalTop + 30 });
      firePointer(agentNode!, "pointermove", { pointerId: PID, clientX: 300, clientY: 720 });
      firePointer(agentNode!, "pointerup", { pointerId: PID, clientX: 300, clientY: 720 });

      // Agent should be minimized
      expect(container.querySelector('.emap-agent-node[data-agent-id="main"]')).toBeNull();
      const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(within(dock!).getByRole("button", { name: /复原 Agent 主 Agent/ })).toBeInTheDocument();

      // Restore from dock
      fireEvent.click(within(dock!).getByRole("button", { name: /复原 Agent 主 Agent/ }));

      // Agent is back on canvas after restore flight completes
      const restoredNode = await waitFor(() => {
        const el = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
        expect(el).toBeTruthy();
        return el!;
      });
      const restoredLeft = parseFloat(restoredNode.style.left);
      const restoredTop = parseFloat(restoredNode.style.top);
      expect(restoredLeft).toBe(originalLeft);
      expect(restoredTop).toBe(originalTop);
    });

    it("restores Task root node to pre-drag position after drag-to-dock minimize", async () => {
      const { container } = render(<App />);

      // Task should be visible from mock fixture
      await waitFor(() => {
        expect(container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]')).toBeTruthy();
      });
      const taskEl = container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]') as HTMLElement;

      const originalLeft = parseFloat(taskEl.style.left);
      const originalTop = parseFloat(taskEl.style.top);
      expect(Number.isFinite(originalLeft)).toBe(true);
      expect(Number.isFinite(originalTop)).toBe(true);

      // Mock dock getBoundingClientRect
      const dockEl = container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(dockEl).toBeTruthy();
      vi.spyOn(dockEl!, "getBoundingClientRect").mockReturnValue({
        x: 200, y: 700, width: 400, height: 60,
        left: 200, top: 700, right: 600, bottom: 760,
        toJSON: () => ({}),
      } as DOMRect);

      // Drag the task node into the dock
      const PID = 2;
      firePointer(taskEl, "pointerdown", { pointerId: PID, clientX: originalLeft + 50, clientY: originalTop + 30 });
      firePointer(taskEl, "pointermove", { pointerId: PID, clientX: 300, clientY: 720 });
      firePointer(taskEl, "pointerup", { pointerId: PID, clientX: 300, clientY: 720 });

      // Task should be minimized
      expect(container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]')).toBeNull();
      const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(within(dock!).getByRole("button", { name: /复原 Task 调查 Medtrum 云资产/ })).toBeInTheDocument();

      // Restore from dock
      fireEvent.click(within(dock!).getByRole("button", { name: /复原 Task 调查 Medtrum 云资产/ }));

      // Task is back on canvas after restore flight completes
      const restoredNode = await waitFor(() => {
        const el = container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]') as HTMLElement | null;
        expect(el).toBeTruthy();
        return el!;
      });
      const restoredLeft = parseFloat(restoredNode.style.left);
      const restoredTop = parseFloat(restoredNode.style.top);
      expect(restoredLeft).toBe(originalLeft);
      expect(restoredTop).toBe(originalTop);
    });

    it("dock items have data-kind, kind class, icon, and copy DOM", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }));
      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));

      const agentNode = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
      const taskNode = container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]') as HTMLElement | null;
      expect(agentNode).toBeTruthy();
      expect(taskNode).toBeTruthy();

      dragRootNodeToDock(container, agentNode!, 21);
      dragRootNodeToDock(container, taskNode!, 22);

      const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(dock).toBeTruthy();

      const agentItem = dock!.querySelector('.emap-root-dock-item[data-kind="agent"]');
      expect(agentItem).toBeTruthy();
      expect(agentItem!.classList.contains("emap-root-dock-item-agent")).toBe(true);
      expect(agentItem!.querySelector(".emap-root-dock-icon")).toBeTruthy();
      expect(agentItem!.querySelector(".emap-root-dock-copy")).toBeTruthy();

      const taskItem = dock!.querySelector('.emap-root-dock-item[data-kind="task"]');
      expect(taskItem).toBeTruthy();
      expect(taskItem!.classList.contains("emap-root-dock-item-task")).toBe(true);
      expect(taskItem!.querySelector(".emap-root-dock-icon")).toBeTruthy();
      expect(taskItem!.querySelector(".emap-root-dock-copy")).toBeTruthy();
    });

    it("keeps minimized Agent and Task nodes visible in Dock while root filters change", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      const agentNode = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      expect(agentNode).toBeTruthy();

      dragRootNodeToDock(container, agentNode!, 26);
      dragRootNodeToDock(container, taskNode, 27);

      fireEvent.click(screen.getByRole("tab", { name: "Task" }));
      const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(dock).toBeTruthy();
      expect(within(dock!).getByRole("button", { name: /复原 Agent 主 Agent/ })).toBeInTheDocument();
      expect(within(dock!).getByRole("button", { name: /复原 Task 调查 Medtrum 云资产/ })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("tab", { name: "Agent" }));
      expect(within(dock!).getByRole("button", { name: /复原 Agent 主 Agent/ })).toBeInTheDocument();
      expect(within(dock!).getByRole("button", { name: /复原 Task 调查 Medtrum 云资产/ })).toBeInTheDocument();
    });

    it("shows the latest minimized Task run status in the Dock", async () => {
      const { container } = render(<App />);
      const taskNode = await waitFor(() => {
        const el = container.querySelector(`.emap-canvas-task-node[data-task-id="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
        expect(el).toBeTruthy();
        return el!;
      });

      dragRootNodeToDock(container, taskNode, 28);

      const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(dock).toBeTruthy();
      const dockTask = dock!.querySelector(`.emap-root-dock-item-task[data-task-run-status="completed"]`);
      expect(dockTask).toBeTruthy();
      expect(within(dockTask as HTMLElement).getByText("已完成")).toBeInTheDocument();
    });

    it("pages the Dock items with left and right arrow buttons instead of exposing a scrollbar", async () => {
      const { container } = render(<App />);
      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;

      dragRootNodeToDock(container, taskNode, 29);

      const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(dock).toBeTruthy();
      const dockItems = dock!.querySelector(".emap-root-dock-items") as HTMLElement | null;
      expect(dockItems).toBeTruthy();
      Object.defineProperty(dockItems!, "clientWidth", { configurable: true, value: 200 });
      Object.defineProperty(dockItems!, "scrollWidth", { configurable: true, value: 600 });
      Object.defineProperty(dockItems!, "scrollLeft", { configurable: true, writable: true, value: 0 });
      fireEvent.scroll(dockItems!);

      const leftButton = within(dock!).getByRole("button", { name: "Dock 向左翻页" });
      const rightButton = within(dock!).getByRole("button", { name: "Dock 向右翻页" });
      expect(leftButton).toBeDisabled();
      expect(rightButton).not.toBeDisabled();

      fireEvent.click(rightButton);
      expect(dockItems!.scrollLeft).toBe(164);
      expect(leftButton).not.toBeDisabled();

      fireEvent.click(leftButton);
      expect(dockItems!.scrollLeft).toBe(0);
    });

    it("hides the native Dock scrollbar and reserves side controls for paging", () => {
      const executionMapCss = readFileSync("src/graph/execution-map.css", "utf8");
      const dockBlock = executionMapCss.match(/\.emap-root-dock \{(?<block>[\s\S]*?)\n\}/)?.groups?.block ?? "";
      const itemsBlock = executionMapCss.match(/\.emap-root-dock-items \{(?<block>[\s\S]*?)\n\}/)?.groups?.block ?? "";
      const pageButtonBlock = executionMapCss.match(/\.emap-root-dock-page-btn \{(?<block>[\s\S]*?)\n\}/)?.groups?.block ?? "";

      expect(dockBlock).toContain("overflow: hidden");
      expect(itemsBlock).toContain("overflow-x: auto");
      expect(itemsBlock).toContain("scrollbar-width: none");
      expect(pageButtonBlock).toContain("width: 24px");
    });

    it("restores Task menu branch position after drag-to-dock minimize", async () => {
      const { container } = render(<App />);

      // Click task to open menu
      fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));

      // Task branch should be visible
      const taskBranchShell = await waitFor(() => {
        const el = container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
        expect(el).toBeTruthy();
        return el!;
      });

      // Record original task root position and branch shell position
      const taskEl = container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]') as HTMLElement | null;
      expect(taskEl).toBeTruthy();
      const taskOriginalLeft = parseFloat(taskEl!.style.left);
      const taskOriginalTop = parseFloat(taskEl!.style.top);
      const branchOriginalLeft = parseFloat(taskBranchShell.style.left);
      const branchOriginalTop = parseFloat(taskBranchShell.style.top);
      expect(Number.isFinite(branchOriginalLeft)).toBe(true);
      expect(Number.isFinite(branchOriginalTop)).toBe(true);

      // Mock dock getBoundingClientRect
      const dockEl = container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(dockEl).toBeTruthy();
      vi.spyOn(dockEl!, "getBoundingClientRect").mockReturnValue({
        x: 200, y: 700, width: 400, height: 60,
        left: 200, top: 700, right: 600, bottom: 760,
        toJSON: () => ({}),
      } as DOMRect);

      // Drag the task root node into the dock
      const PID = 3;
      firePointer(taskEl!, "pointerdown", { pointerId: PID, clientX: taskOriginalLeft + 50, clientY: taskOriginalTop + 30 });
      firePointer(taskEl!, "pointermove", { pointerId: PID, clientX: 300, clientY: 720 });
      firePointer(taskEl!, "pointerup", { pointerId: PID, clientX: 300, clientY: 720 });

      // Task and branch should be minimized
      expect(container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]')).toBeNull();
      expect(container.querySelector(".emap-task-branch-shell")).toBeNull();

      const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(within(dock!).getByRole("button", { name: /复原 Task 调查 Medtrum 云资产/ })).toBeInTheDocument();

      // Restore from dock
      fireEvent.click(within(dock!).getByRole("button", { name: /复原 Task 调查 Medtrum 云资产/ }));

      // Task root is back after restore flight completes
      const restoredTask = await waitFor(() => {
        const el = container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]') as HTMLElement | null;
        expect(el).toBeTruthy();
        return el!;
      });
      expect(parseFloat(restoredTask.style.left)).toBe(taskOriginalLeft);
      expect(parseFloat(restoredTask.style.top)).toBe(taskOriginalTop);

      // Task menu branch should also be restored at the original position
      const restoredBranch = container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
      expect(restoredBranch).toBeTruthy();
      const restoredBranchLeft = parseFloat(restoredBranch!.style.left);
      const restoredBranchTop = parseFloat(restoredBranch!.style.top);
      expect(restoredBranchLeft).toBe(branchOriginalLeft);
      expect(restoredBranchTop).toBe(branchOriginalTop);
    });

    it("shows restore flight animation when clicking Dock item and preserves position", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      const agentNode = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
      expect(agentNode).toBeTruthy();
      const originalLeft = parseFloat(agentNode!.style.left);
      const originalTop = parseFloat(agentNode!.style.top);

      dragRootNodeToDock(container, agentNode!, 23);
      expect(container.querySelector('.emap-agent-node[data-agent-id="main"]')).toBeNull();

      const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(dock).toBeTruthy();
      const restoreButton = within(dock!).getByRole("button", { name: /复原 Agent 主 Agent/ });

      // Enable fake timers right before the click that triggers flight
      vi.useFakeTimers({ toFake: ["setTimeout", "requestAnimationFrame"] });
      try {
        fireEvent.click(restoreButton);

        // Phase 1: FLIP flight starts visually over the Dock item, with target-sized card scaled down.
        const flightFrom = container.querySelector('.emap-root-dock-flight[data-flight-kind="restore"][data-flight-phase="from"]');
        expect(flightFrom).toBeTruthy();
        const fromTransform = (flightFrom as HTMLElement).style.transform;
        expect(fromTransform).not.toBe("translate3d(0, 0, 0) scale(1)");
        expect(fromTransform).toContain("scale(");
        expect(parseFloat((flightFrom as HTMLElement).style.width)).toBeGreaterThan(100);
        expect(flightFrom!.querySelector(".emap-root-dock-flight-dock-face")).toBeTruthy();
        expect(flightFrom!.querySelector(".emap-root-dock-flight-node-face")).toBeTruthy();

        // Real node must not be visible while flight is active (flicker guard)
        expect(container.querySelector('.emap-agent-node[data-agent-id="main"]')).toBeNull();

        // Dock item should be disabled during pending restore
        const dockItem = dock!.querySelector('.emap-root-dock-item[data-kind="agent"]');
        expect(dockItem).toBeTruthy();
        expect(dockItem!.getAttribute("data-restoring")).toBe("true");
        expect(dockItem!.getAttribute("aria-disabled")).toBe("true");

        // Advance RAF + timers to trigger "to" phase
        await act(async () => {
          vi.advanceTimersByTime(64);
        });

        const flightTo = container.querySelector('.emap-root-dock-flight[data-flight-kind="restore"][data-flight-phase="to"]');
        expect(flightTo).toBeTruthy();
        const toTransform = (flightTo as HTMLElement).style.transform;
        // "to" transform lands on the target card position.
        expect(toTransform).toBe("translate3d(0, 0, 0) scale(1)");
        expect(flightTo!.querySelector(".emap-root-dock-flight-node-face.emap-agent-node")).toBeTruthy();

        // Real node still hidden during "to" phase
        expect(container.querySelector('.emap-agent-node[data-agent-id="main"]')).toBeNull();

        // Flight clears after timeout
        await act(async () => {
          vi.advanceTimersByTime(400);
        });

        expect(container.querySelector(".emap-root-dock-flight")).toBeNull();

        const restoredNode = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
        expect(restoredNode).toBeTruthy();
        expect(parseFloat(restoredNode!.style.left)).toBe(originalLeft);
        expect(parseFloat(restoredNode!.style.top)).toBe(originalTop);
      } finally {
        vi.useRealTimers();
      }
    });

    it("hides real Task node during restore flight and prevents duplicate restore", async () => {
      const baseTask = mockTeamTasks[0]!;
      const originalInputPorts = baseTask.workUnit.inputPorts;
      baseTask.workUnit.inputPorts = [{ id: "source_md", label: "Markdown 输入", type: "md" }];
      resetMockTeamApiState();

      const { container } = render(<App />);

      try {
        // Task should be visible from mock fixture
        await waitFor(() => {
          expect(container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]')).toBeTruthy();
        });
        const taskEl = container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]') as HTMLElement;
        const originalLeft = parseFloat(taskEl.style.left);
        const originalTop = parseFloat(taskEl.style.top);

        // Minimize task
        dragRootNodeToDock(container, taskEl, 24);
        expect(container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]')).toBeNull();

        const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
        expect(dock).toBeTruthy();
        const restoreButton = within(dock!).getByRole("button", { name: /复原 Task 调查 Medtrum 云资产/ });

        vi.useFakeTimers({ toFake: ["setTimeout", "requestAnimationFrame"] });
        fireEvent.click(restoreButton);

        // Flight starts — real Task node must not be visible
        const flightFrom = container.querySelector('.emap-root-dock-flight[data-flight-kind="restore"][data-flight-phase="from"]');
        expect(flightFrom).toBeTruthy();
        expect((flightFrom as HTMLElement).style.transform).not.toBe("translate3d(0, 0, 0) scale(1)");
        expect(parseFloat((flightFrom as HTMLElement).style.width)).toBeGreaterThan(100);
        expect(flightFrom!.querySelector(".emap-root-dock-flight-dock-face")).toBeTruthy();
        expect(flightFrom!.querySelector(".emap-root-dock-flight-node-face")).toBeTruthy();
        expect(container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]')).toBeNull();

        // Dock item is disabled during pending restore
        const dockItem = dock!.querySelector('.emap-root-dock-item[data-kind="task"]');
        expect(dockItem).toBeTruthy();
        expect(dockItem!.getAttribute("data-restoring")).toBe("true");

        // Advance to "to" phase — still hidden
        await act(async () => {
          vi.advanceTimersByTime(64);
        });
        const flightTo = container.querySelector('.emap-root-dock-flight[data-flight-kind="restore"][data-flight-phase="to"]') as HTMLElement | null;
        expect(flightTo).toBeTruthy();
        expect(flightTo!.style.transform).toBe("translate3d(0, 0, 0) scale(1)");
        expect(flightTo!.style.getPropertyValue("--emap-flight-content-scale")).toBeTruthy();
        const nodeFace = flightTo!.querySelector(".emap-root-dock-flight-node-face.emap-canvas-task-node") as HTMLElement | null;
        expect(nodeFace).toBeTruthy();
        expect(nodeFace!.querySelector(".emap-task-ports")).toBeTruthy();
        expect(nodeFace!.querySelector(".emap-task-port-row-input")).toBeTruthy();
        expect(nodeFace!.querySelector(".emap-task-port-row-output")).toBeTruthy();
        expect(within(nodeFace!).getByText("Markdown 输入")).toBeInTheDocument();
        expect(within(nodeFace!).getByText("Markdown 报告")).toBeInTheDocument();
        expect(nodeFace!.querySelector(".emap-task-dep-handle")).toBeTruthy();
        expect(container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]')).toBeNull();

        // Flight clears — real Task node appears at original position
        await act(async () => {
          vi.advanceTimersByTime(400);
        });
        expect(container.querySelector(".emap-root-dock-flight")).toBeNull();

        const restoredNode = container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]') as HTMLElement | null;
        expect(restoredNode).toBeTruthy();
        expect(parseFloat(restoredNode!.style.left)).toBe(originalLeft);
        expect(parseFloat(restoredNode!.style.top)).toBe(originalTop);

        // data-restoring should be cleared
        const dockItemAfter = dock!.querySelector('.emap-root-dock-item[data-kind="task"]');
        expect(dockItemAfter).toBeNull();
      } finally {
        vi.useRealTimers();
        baseTask.workUnit.inputPorts = originalInputPorts;
        resetMockTeamApiState();
      }
    });

    it("keeps Dock restore flight transition active under reduced-motion", () => {
      const executionMapCss = readFileSync("src/graph/execution-map.css", "utf8");
      const reducedMotionFlightBlock = executionMapCss.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.emap-root-dock-flight \{(?<block>[\s\S]*?)\n  \}/)?.groups?.block ?? "";

      expect(reducedMotionFlightBlock).toContain("transform 0.18s ease-out");
      expect(reducedMotionFlightBlock).toContain("opacity 0.12s ease-out");
      expect(reducedMotionFlightBlock).not.toContain("transition: none");
    });

    it("keeps Dock flight node face layout scaled after base node CSS", () => {
      const executionMapCss = readFileSync("src/graph/execution-map.css", "utf8");
      const flightNodeFaceBlock = executionMapCss.match(/\.emap-root-dock-flight \.emap-root-dock-flight-node-face \{(?<block>[\s\S]*?)\n\}/)?.groups?.block ?? "";

      expect(flightNodeFaceBlock).toContain("width: calc(100% / var(--emap-flight-content-scale, 1))");
      expect(flightNodeFaceBlock).toContain("height: calc(100% / var(--emap-flight-content-scale, 1))");
      expect(flightNodeFaceBlock).toContain("min-height: calc(100% / var(--emap-flight-content-scale, 1))");
      expect(flightNodeFaceBlock).toContain("bottom: auto");
      expect(flightNodeFaceBlock).toContain("transform: scale(var(--emap-flight-content-scale, 1))");
    });

    it("hides Dock item content while its restore flight is active", () => {
      const executionMapCss = readFileSync("src/graph/execution-map.css", "utf8");
      const restoringItemBlock = executionMapCss.match(/\.emap-root-dock-item\[data-restoring="true"\] \{(?<block>[\s\S]*?)\n\}/)?.groups?.block ?? "";
      const restoringContentBlock = executionMapCss.match(/\.emap-root-dock-item\[data-restoring="true"\] \.emap-root-dock-icon,\n\.emap-root-dock-item\[data-restoring="true"\] \.emap-root-dock-copy \{(?<block>[\s\S]*?)\n\}/)?.groups?.block ?? "";
      const restoringAfterBlock = executionMapCss.match(/\.emap-root-dock-item\[data-restoring="true"\]::after \{(?<block>[\s\S]*?)\n\}/)?.groups?.block ?? "";

      expect(restoringItemBlock).toContain("cursor: default");
      expect(restoringItemBlock).toContain("opacity: 0");
      expect(restoringItemBlock).toContain("background: transparent");
      expect(restoringItemBlock).toContain("transform: none");
      expect(restoringItemBlock).toContain("transition: none");
      expect(restoringAfterBlock).toContain("content: none");
      expect(restoringContentBlock).toContain("opacity: 0");
      expect(restoringContentBlock).toContain("translateY(-6px) scale(0.92)");
      expect(restoringContentBlock).toContain("transition: none");
    });

    it("prevents duplicate restore when Dock item is clicked during pending restore", async () => {
      const { container } = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      const agentNode = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
      expect(agentNode).toBeTruthy();

      dragRootNodeToDock(container, agentNode!, 25);
      expect(container.querySelector('.emap-agent-node[data-agent-id="main"]')).toBeNull();

      const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(dock).toBeTruthy();
      const restoreButton = within(dock!).getByRole("button", { name: /复原 Agent 主 Agent/ });

      vi.useFakeTimers({ toFake: ["setTimeout", "requestAnimationFrame"] });
      try {
        // First click starts restore
        fireEvent.click(restoreButton);
        expect(container.querySelector('.emap-root-dock-flight[data-flight-kind="restore"]')).toBeTruthy();

        // Dock item is now disabled — second click should be ignored
        const dockItem = dock!.querySelector('.emap-root-dock-item[data-kind="agent"]') as HTMLButtonElement;
        expect(dockItem.disabled).toBe(true);

        // Attempting another click on the disabled button should not create a second flight
        // (HTML disabled buttons don't fire click events, but verify the state)
        expect(dockItem.getAttribute("data-restoring")).toBe("true");

        // Only one flight exists
        const flights = container.querySelectorAll('.emap-root-dock-flight[data-flight-kind="restore"]');
        expect(flights.length).toBe(1);

        // Complete the flight
        await act(async () => {
          vi.advanceTimersByTime(400);
        });
        expect(container.querySelector(".emap-root-dock-flight")).toBeNull();

        // Node restored exactly once
        const restoredNode = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
        expect(restoredNode).toBeTruthy();
      } finally {
        vi.useRealTimers();
      }
    });


  });
});
