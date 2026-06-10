import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { resetMockTeamApiState } from "../fixtures/team-fixtures";
import { getAtlasNodes, firePointer } from "./app-dom-test-utils";

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

  describe("run observer panel drag", () => {
    async function setupObserverOpen(container: HTMLElement) {
      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        const observerPanel = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]');
        expect(observerPanel).toBeTruthy();
      });

      return { branch: branch! };
    }

    it("keeps the merged observer panel draggable after method-call groups are hidden", async () => {
      const { container } = render(<App />);
      await setupObserverOpen(container);

      const workerProcessNode = container.querySelector('.emap-observer-process-node[data-process-role="worker"]') as HTMLElement | null;
      expect(workerProcessNode).toBeTruthy();
      expect(workerProcessNode!.querySelector(".emap-process-tool-groups")).toBeNull();
      expect(workerProcessNode!.querySelectorAll(".emap-process-tool-group")).toHaveLength(0);

      const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement | null;
      expect(observerShell).toBeTruthy();
      const leftBefore = Number.parseFloat(observerShell!.style.left);
      const topBefore = Number.parseFloat(observerShell!.style.top);
      firePointer(observerShell!, "pointerdown", { pointerId: 104, clientX: 600, clientY: 300 });
      firePointer(observerShell!, "pointermove", { pointerId: 104, clientX: 655, clientY: 340 });
      firePointer(observerShell!, "pointerup", { pointerId: 104, clientX: 655, clientY: 340, buttons: 0 });

      expect(Number.parseFloat(observerShell!.style.left)).toBeCloseTo(leftBefore + 55, 4);
      expect(Number.parseFloat(observerShell!.style.top)).toBeCloseTo(topBefore + 40, 4);
      expect(workerProcessNode!.querySelectorAll(".emap-process-tool-group")).toHaveLength(0);
    });

    it("keeps menu action buttons clickable via pointer sequence after menu drag is implemented", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();

      // Use pointerdown + pointerup + click sequence (no drag movement) on "运行" button
      const runButton = within(branch!).getByRole("button", { name: "运行" });
      firePointer(runButton, "pointerdown", { pointerId: 93, clientX: 300, clientY: 200 });
      firePointer(runButton, "pointerup", { pointerId: 93, clientX: 300, clientY: 200, buttons: 0 });
      fireEvent.click(runButton);

      expect(await within(branch!).findByText("最近运行")).toBeInTheDocument();
      expect(within(branch!).getByText("已完成")).toBeInTheDocument();
    });

    it("drags edit node independently without moving menu", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "编辑" }));

      await waitFor(() => {
        expect(container.querySelector(".task-edit-branch")).toBeTruthy();
      });

      const menuShell = container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
      expect(menuShell).toBeTruthy();
      const editShell = container.querySelector(".emap-task-child-branch-shell") as HTMLElement | null;
      expect(editShell).toBeTruthy();

      const menuLeftBefore = Number.parseFloat(menuShell!.style.left);
      const menuTopBefore = Number.parseFloat(menuShell!.style.top);
      const editLeftBefore = Number.parseFloat(editShell!.style.left);
      const editTopBefore = Number.parseFloat(editShell!.style.top);

      // Drag from the edit branch header (not form controls)
      const editHeader = editShell!.querySelector(".task-leader-branch-head") as HTMLElement | null;
      expect(editHeader).toBeTruthy();
      firePointer(editHeader!, "pointerdown", { pointerId: 94, clientX: 500, clientY: 300 });
      firePointer(editHeader!, "pointermove", { pointerId: 94, clientX: 560, clientY: 350 });
      firePointer(editHeader!, "pointerup", { pointerId: 94, clientX: 560, clientY: 350, buttons: 0 });

      const dx = 60;
      const dy = 50;

      // Edit node moved
      expect(Number.parseFloat(editShell!.style.left)).toBeCloseTo(editLeftBefore + dx, 4);
      expect(Number.parseFloat(editShell!.style.top)).toBeCloseTo(editTopBefore + dy, 4);

      // Menu did not move
      expect(Number.parseFloat(menuShell!.style.left)).toBeCloseTo(menuLeftBefore, 4);
      expect(Number.parseFloat(menuShell!.style.top)).toBeCloseTo(menuTopBefore, 4);
    });

    it("moves file detail when dragging merged observer panel", async () => {
      const { container } = render(<App />);
      await setupObserverOpen(container);

      const workerFileRow = await waitFor(() => {
        const node = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      // Expand detail
      fireEvent.click(workerFileRow);

      await waitFor(() => {
        expect(container.querySelector(".emap-observer-file-detail-node")).toBeTruthy();
      });

      const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement | null;
      expect(observerShell).toBeTruthy();
      const detailShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="file-detail-"]') as HTMLElement | null;
      expect(detailShell).toBeTruthy();

      const observerLeftBefore = Number.parseFloat(observerShell!.style.left);
      const observerTopBefore = Number.parseFloat(observerShell!.style.top);
      const detailLeftBefore = Number.parseFloat(detailShell!.style.left);
      const detailTopBefore = Number.parseFloat(detailShell!.style.top);

      // Drag merged observer panel
      firePointer(observerShell!, "pointerdown", { pointerId: 95, clientX: 500, clientY: 300 });
      firePointer(observerShell!, "pointermove", { pointerId: 95, clientX: 570, clientY: 350 });
      firePointer(observerShell!, "pointerup", { pointerId: 95, clientX: 570, clientY: 350, buttons: 0 });

      const dx = 70;
      const dy = 50;

      // Observer shell moved
      expect(Number.parseFloat(observerShell!.style.left)).toBeCloseTo(observerLeftBefore + dx, 4);
      expect(Number.parseFloat(observerShell!.style.top)).toBeCloseTo(observerTopBefore + dy, 4);

      // Detail shell also moved by same delta
      expect(Number.parseFloat(detailShell!.style.left)).toBeCloseTo(detailLeftBefore + dx, 4);
      expect(Number.parseFloat(detailShell!.style.top)).toBeCloseTo(detailTopBefore + dy, 4);
    });

    it("opens file detail to the right of a dragged merged observer panel", async () => {
      const { container } = render(<App />);
      await setupObserverOpen(container);

      const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement | null;
      expect(observerShell).toBeTruthy();

      // Drag observer panel to a new position
      firePointer(observerShell!, "pointerdown", { pointerId: 99, clientX: 500, clientY: 300 });
      firePointer(observerShell!, "pointermove", { pointerId: 99, clientX: 660, clientY: 330 });
      firePointer(observerShell!, "pointerup", { pointerId: 99, clientX: 660, clientY: 330, buttons: 0 });

      // Now click a file row to open detail
      const workerFileRow = await waitFor(() => {
        const row = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
        expect(row).toBeTruthy();
        return row!;
      });
      // The first click after a drag may be suppressed; click twice to ensure it opens
      fireEvent.click(workerFileRow);
      fireEvent.click(workerFileRow);

      const detailShell = await waitFor(() => {
        const detail = container.querySelector(".emap-observer-file-detail-node")?.closest(".emap-task-child-branch-shell") as HTMLElement | null;
        expect(detail).toBeTruthy();
        return detail!;
      });

      const observerLeft = Number.parseFloat(observerShell!.style.left);
      const observerWidth = Number.parseFloat(observerShell!.style.width);
      const detailLeft = Number.parseFloat(detailShell.style.left);

      expect(detailLeft).toBeGreaterThanOrEqual(observerLeft + observerWidth);
    });

    it("moves only file detail without moving merged observer panel", async () => {
      const { container } = render(<App />);
      await setupObserverOpen(container);

      const workerFileRow = await waitFor(() => {
        const node = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      fireEvent.click(workerFileRow);

      await waitFor(() => {
        const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
        expect(detail).toBeTruthy();
      });

      const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement | null;
      expect(observerShell).toBeTruthy();
      const detailShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="file-detail-"]') as HTMLElement | null;
      expect(detailShell).toBeTruthy();

      const observerLeftBefore = Number.parseFloat(observerShell!.style.left);
      const observerTopBefore = Number.parseFloat(observerShell!.style.top);
      const detailLeftBefore = Number.parseFloat(detailShell!.style.left);
      const detailTopBefore = Number.parseFloat(detailShell!.style.top);

      // Drag detail panel only
      firePointer(detailShell!, "pointerdown", { pointerId: 96, clientX: 800, clientY: 400 });
      firePointer(detailShell!, "pointermove", { pointerId: 96, clientX: 860, clientY: 450 });
      firePointer(detailShell!, "pointerup", { pointerId: 96, clientX: 860, clientY: 450, buttons: 0 });

      // Detail moved
      expect(Number.parseFloat(detailShell!.style.left)).toBeCloseTo(detailLeftBefore + 60, 4);
      expect(Number.parseFloat(detailShell!.style.top)).toBeCloseTo(detailTopBefore + 50, 4);

      // Observer panel did not move
      expect(Number.parseFloat(observerShell!.style.left)).toBeCloseTo(observerLeftBefore, 4);
      expect(Number.parseFloat(observerShell!.style.top)).toBeCloseTo(observerTopBefore, 4);
    });

  });
});
