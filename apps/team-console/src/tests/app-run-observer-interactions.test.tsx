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

  describe("run observer interactions", () => {
    it("drags an observer process panel and updates connector", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
      });

      const processShell = container
        .querySelector('.emap-observer-process-node[data-process-role="worker"]')
        ?.closest(".emap-task-child-branch-shell") as HTMLElement | null;
      expect(processShell).toBeTruthy();

      const initialLeft = Number.parseFloat(processShell!.style.left);
      const initialTop = Number.parseFloat(processShell!.style.top);

      const upwardDelta = initialTop + 80;
      firePointer(processShell!, "pointerdown", { pointerId: 71, clientX: 600, clientY: 500 });
      firePointer(processShell!, "pointermove", { pointerId: 71, clientX: 660, clientY: 500 - upwardDelta });
      firePointer(processShell!, "pointerup", { pointerId: 71, clientX: 660, clientY: 500 - upwardDelta, buttons: 0 });

      expect(Number.parseFloat(processShell!.style.left)).toBeCloseTo(initialLeft + 60, 4);
      expect(Number.parseFloat(processShell!.style.top)).toBeLessThan(0);
      expect(Number.parseFloat(processShell!.style.top)).toBeCloseTo(initialTop - upwardDelta, 4);

      const connectorPaths = container.querySelectorAll(".emap-link-task-child-branch");
      expect(connectorPaths.length).toBeGreaterThanOrEqual(1);
    });

    it("drags merged observer panel without accidentally toggling file detail", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
      });

      const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement | null;
      expect(observerShell).toBeTruthy();
      const initialLeft = Number.parseFloat(observerShell!.style.left);

      // Drag the merged observer panel
      firePointer(observerShell!, "pointerdown", { pointerId: 72, clientX: 500, clientY: 300 });
      firePointer(observerShell!, "pointermove", { pointerId: 72, clientX: 560, clientY: 340 });
      firePointer(observerShell!, "pointerup", { pointerId: 72, clientX: 560, clientY: 340, buttons: 0 });

      expect(Number.parseFloat(observerShell!.style.left)).toBeCloseTo(initialLeft + 60, 4);
      // No file detail should have opened from the drag
      expect(container.querySelector(".emap-observer-file-detail-node")).toBeNull();
    });

    it("drags file detail node and resizes it independently", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
      });

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

      const detailShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="file-detail-"]') as HTMLElement | null;
      expect(detailShell).toBeTruthy();

      const initialLeft = Number.parseFloat(detailShell!.style.left);
      const initialTop = Number.parseFloat(detailShell!.style.top);

      firePointer(detailShell!, "pointerdown", { pointerId: 73, clientX: 700, clientY: 350 });
      firePointer(detailShell!, "pointermove", { pointerId: 73, clientX: 750, clientY: 380 });
      firePointer(detailShell!, "pointerup", { pointerId: 73, clientX: 750, clientY: 380, buttons: 0 });

      expect(Number.parseFloat(detailShell!.style.left)).toBeCloseTo(initialLeft + 50, 4);
      expect(Number.parseFloat(detailShell!.style.top)).toBeCloseTo(initialTop + 30, 4);

      const resizeHandle = detailShell!.querySelector(".emap-panel-resize-handle") as HTMLElement | null;
      expect(resizeHandle).toBeTruthy();
      const preResizeWidth = Number.parseFloat(detailShell!.style.width);

      firePointer(resizeHandle!, "pointerdown", { pointerId: 74, clientX: 800, clientY: 500 });
      firePointer(resizeHandle!, "pointermove", { pointerId: 74, clientX: 880, clientY: 560 });
      firePointer(resizeHandle!, "pointerup", { pointerId: 74, clientX: 880, clientY: 560, buttons: 0 });

      expect(Number.parseFloat(detailShell!.style.width)).toBeCloseTo(preResizeWidth + 80, 4);
    });

    it("renders Markdown file detail with safe marked-based output", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
      });

      const resultFileRow = await waitFor(() => {
        const node = container.querySelector('.emap-observer-file-row[data-file-kind="result"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      fireEvent.click(resultFileRow);

      const detailNode = await waitFor(() => {
        const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
        expect(detail).toBeTruthy();
        return detail!;
      });

      // accepted-result.md contains "# Mock accepted result" which should be rendered as <h1> or <h2> via marked
      expect(detailNode.innerHTML).toContain("<h");
      expect(detailNode.innerHTML).toContain("Mock accepted result");
      // Must not contain the old hand-written parser class names
      expect(detailNode.querySelector(".task-run-md-body")).toBeNull();
      expect(detailNode.querySelector(".task-run-md-heading")).toBeNull();
    });

    it("renders Markdown table in file detail content", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
      });

      const workerFileRow = await waitFor(() => {
        const node = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      fireEvent.click(workerFileRow);

      const detailNode = await waitFor(() => {
        const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
        expect(detail).toBeTruthy();
        return detail!;
      });

      // Worker output contains "# Worker output" which marked renders as <h1>
      expect(detailNode.innerHTML).toContain("<h");
      expect(detailNode.innerHTML).toContain("Worker output");
      // Raw HTML like <script> and <details> must be escaped
      expect(detailNode.innerHTML).toContain("&lt;script&gt;");
      expect(detailNode.innerHTML).toContain("&lt;details&gt;");
      expect(detailNode.querySelector("script")).toBeNull();
      expect(detailNode.querySelector("details")).toBeNull();
    });

    it("expands file detail on normal pointerdown+up without drag movement", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
      });

      const workerFileRow = await waitFor(() => {
        const node = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });

      // pointerdown + pointerup at same position (no move) should NOT suppress click
      firePointer(workerFileRow, "pointerdown", { pointerId: 80, clientX: 500, clientY: 300 });
      firePointer(workerFileRow, "pointerup", { pointerId: 80, clientX: 500, clientY: 300, buttons: 0 });
      fireEvent.click(workerFileRow);

      await waitFor(() => {
        expect(container.querySelector(".emap-observer-file-detail-node")).toBeTruthy();
      });
    });

    it("suppresses file detail click after drag exceeds threshold", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
      });

      const workerFileRow = await waitFor(() => {
        const node = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });

      // pointerdown + pointermove exceeding threshold + pointerup + click
      firePointer(workerFileRow, "pointerdown", { pointerId: 81, clientX: 500, clientY: 300 });
      firePointer(workerFileRow, "pointermove", { pointerId: 81, clientX: 560, clientY: 340 });
      firePointer(workerFileRow, "pointerup", { pointerId: 81, clientX: 560, clientY: 340, buttons: 0 });
      // The drag suppress mechanism should swallow this click
      fireEvent.click(workerFileRow);

      // Detail must NOT appear because click was suppressed after drag
      expect(container.querySelector(".emap-observer-file-detail-node")).toBeNull();
    });

    it("detail connector follows merged observer panel after drag", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
      });

      const workerFileRow = await waitFor(() => {
        const node = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      // Open detail first
      fireEvent.click(workerFileRow);

      await waitFor(() => {
        expect(container.querySelector(".emap-observer-file-detail-node")).toBeTruthy();
      });

      const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement | null;
      expect(observerShell).toBeTruthy();

      // Drag the merged observer panel to a new position
      const initialLeft = Number.parseFloat(observerShell!.style.left);
      firePointer(observerShell!, "pointerdown", { pointerId: 82, clientX: 500, clientY: 300 });
      firePointer(observerShell!, "pointermove", { pointerId: 82, clientX: 580, clientY: 360 });
      firePointer(observerShell!, "pointerup", { pointerId: 82, clientX: 580, clientY: 360, buttons: 0 });

      const newLeft = Number.parseFloat(observerShell!.style.left);
      expect(newLeft).toBeCloseTo(initialLeft + 80, 4);

      // Find the detail panel connector and verify its source matches the observer panel's new position
      const detailShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="file-detail-"]') as HTMLElement | null;
      expect(detailShell).toBeTruthy();

      // After drag, the detail connector's source x should reflect the observer panel's new position
      const allConnectors = container.querySelectorAll<SVGPathElement>(".emap-link-task-child-branch");
      expect(allConnectors.length).toBeGreaterThanOrEqual(2);
      // The detail panel's connector source x should be observer's new right edge (newLeft + width)
      const observerWidth = Number.parseFloat(observerShell!.style.width);
      const expectedSourceX = newLeft + observerWidth;
      // Check that at least one connector path starts near the expected source x
      let foundMatchingConnector = false;
      allConnectors.forEach((path) => {
        const d = path.getAttribute("d") ?? "";
        const match = d.match(/^M\s*([\d.]+)/);
        if (match && Math.abs(Number.parseFloat(match[1]!) - expectedSourceX) < 2) {
          foundMatchingConnector = true;
        }
      });
      expect(foundMatchingConnector).toBe(true);
    });

    it("removes fixed max-height on detail content areas", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
      });

      const checkerFileRow = await waitFor(() => {
        const node = container.querySelector('.emap-observer-file-row[data-file-kind="checker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      fireEvent.click(checkerFileRow);

      const detailNode = await waitFor(() => {
        const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
        expect(detail).toBeTruthy();
        return detail!;
      });

      const pre = detailNode.querySelector("pre");
      if (pre) {
        const computedStyle = window.getComputedStyle(pre);
        expect(computedStyle.maxHeight).not.toBe("360px");
        expect(computedStyle.maxHeight).not.toBe("240px");
      }
    });

    // --- Merged run observer panel ---

    async function setupMergedObserverOpen(container: HTMLElement) {
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

    it("renders Task run observer as one merged result panel", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      // There must be exactly one merged run-observer shell
      await waitFor(() => {
        const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]');
        expect(observerShell).toBeTruthy();
      });

      // No independent process shells
      expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id="process-worker"]')).toBeNull();
      expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id="process-checker"]')).toBeNull();

      // No independent file shells (unless file detail is open)
      const fileShells = Array.from(container.querySelectorAll('.emap-task-child-branch-shell[data-panel-id^="file-"]'))
        .filter((s) => !s.querySelector(".emap-observer-file-detail-node"));
      expect(fileShells).toHaveLength(0);

      // Menu must NOT contain process or file rows
      expect(branch!.querySelector(".emap-observer-process-node")).toBeNull();
      expect(branch!.querySelector(".emap-observer-file-row")).toBeNull();
    });

    it("orders merged observer sections from worker to checker to result", async () => {
      const { container } = render(<App />);
      await setupMergedObserverOpen(container);

      const observerPanel = container.querySelector('.emap-run-observer-panel') as HTMLElement | null;
      expect(observerPanel).toBeTruthy();
      expect(observerPanel!.querySelector(".emap-run-observer-head")).toHaveTextContent("运行观察");

      const sections = Array.from(observerPanel!.querySelectorAll("[data-observer-section]"));
      const sectionIds = sections.map((s) => s.getAttribute("data-observer-section"));

      expect(sectionIds).toEqual([
        "worker-process",
        "worker-files",
        "checker-process",
        "checker-files",
        "result-files",
      ]);

      // Worker process should contain worker process node
      const workerProcessSection = sections.find((s) => s.getAttribute("data-observer-section") === "worker-process");
      expect(workerProcessSection).toBeTruthy();
      expect(workerProcessSection!.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();

      // Checker process should contain checker process node
      const checkerProcessSection = sections.find((s) => s.getAttribute("data-observer-section") === "checker-process");
      expect(checkerProcessSection).toBeTruthy();
      expect(checkerProcessSection!.querySelector('.emap-observer-process-node[data-process-role="checker"]')).toBeTruthy();

      // Worker files section should contain worker file rows
      const workerFilesSection = sections.find((s) => s.getAttribute("data-observer-section") === "worker-files");
      expect(workerFilesSection).toBeTruthy();
      expect(workerFilesSection!.querySelector('.emap-observer-file-row[data-file-kind="worker"]')).toBeTruthy();

      // Checker files section should contain checker file rows
      const checkerFilesSection = sections.find((s) => s.getAttribute("data-observer-section") === "checker-files");
      expect(checkerFilesSection).toBeTruthy();
      expect(checkerFilesSection!.querySelector('.emap-observer-file-row[data-file-kind="checker"]')).toBeTruthy();

      // Result files section should contain result file rows
      const resultFilesSection = sections.find((s) => s.getAttribute("data-observer-section") === "result-files");
      expect(resultFilesSection).toBeTruthy();
      expect(resultFilesSection!.querySelector('.emap-observer-file-row[data-file-kind="result"]')).toBeTruthy();
    });

    it("opens file detail from merged observer file rows", async () => {
      const { container } = render(<App />);
      await setupMergedObserverOpen(container);

      // Click a worker file row inside the merged observer
      const workerFileRow = await waitFor(() => {
        const row = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
        expect(row).toBeTruthy();
        return row!;
      });

      expect(container.querySelector(".emap-observer-file-detail-node")).toBeNull();
      fireEvent.click(workerFileRow);

      const detailNode = await waitFor(() => {
        const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
        expect(detail).toBeTruthy();
        return detail!;
      });

      // Detail shell must exist with a file-detail panel id
      const detailShell = detailNode.closest('.emap-task-child-branch-shell[data-panel-id^="file-detail-"]') as HTMLElement | null;
      expect(detailShell).toBeTruthy();

      // Clicking the same row again closes detail
      fireEvent.click(workerFileRow);
      await waitFor(() => {
        expect(container.querySelector(".emap-observer-file-detail-node")).toBeNull();
      });
    });

    it("double-clicks an observer file detail header to maximize and restore it", async () => {
      const { container } = render(<App />);
      await setupMergedObserverOpen(container);

      const workerFileRow = await waitFor(() => {
        const row = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
        expect(row).toBeTruthy();
        return row!;
      });
      fireEvent.click(workerFileRow);

      const detailShell = await waitFor(() => {
        const shell = container.querySelector('.execution-map-scroll .emap-task-child-branch-shell[data-panel-id^="file-detail-"]') as HTMLElement | null;
        expect(shell).toBeTruthy();
        return shell!;
      });
      const detailHeader = detailShell.querySelector(".emap-observer-node-head") as HTMLElement | null;
      expect(detailHeader).toBeTruthy();

      fireEvent.doubleClick(detailHeader!);

      const overlay = document.querySelector(".emap-maximized-branch-shell") as HTMLElement | null;
      expect(overlay).toBeTruthy();
      expect(overlay!.querySelector(".emap-observer-file-detail-node")).toBeTruthy();
      expect(container.querySelector(".execution-map-scroll .emap-observer-file-detail-node")).toBeNull();

      const overlayHeader = overlay!.querySelector(".emap-observer-node-head") as HTMLElement | null;
      expect(overlayHeader).toBeTruthy();
      fireEvent.doubleClick(overlayHeader!);

      expect(document.querySelector(".emap-maximized-branch-shell")).toBeNull();
      expect(container.querySelector(".execution-map-scroll .emap-observer-file-detail-node")).toBeTruthy();
    });

    it("keeps multiple observer file detail panels open until each one is explicitly closed", async () => {
      const { container } = render(<App />);
      await setupMergedObserverOpen(container);

      const workerFileRow = await waitFor(() => {
        const row = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
        expect(row).toBeTruthy();
        return row!;
      });
      const resultFileRow = await waitFor(() => {
        const row = container.querySelector('.emap-observer-file-row[data-file-kind="result"]') as HTMLElement | null;
        expect(row).toBeTruthy();
        return row!;
      });

      fireEvent.click(workerFileRow);
      fireEvent.click(resultFileRow);

      const detailNodes = await waitFor(() => {
        const nodes = Array.from(container.querySelectorAll(".emap-observer-file-detail-node")) as HTMLElement[];
        expect(nodes).toHaveLength(2);
        return nodes;
      });
      expect(detailNodes.some((detail) => detail.textContent?.includes("Worker output"))).toBe(true);
      expect(detailNodes.some((detail) => detail.textContent?.includes("Mock accepted result"))).toBe(true);
      expect(workerFileRow).toHaveClass("selected");
      expect(resultFileRow).toHaveClass("selected");
      const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement | null;
      const detailShells = Array.from(container.querySelectorAll('.emap-task-child-branch-shell[data-panel-id^="file-detail-"]')) as HTMLElement[];
      expect(observerShell).toBeTruthy();
      expect(detailShells).toHaveLength(2);
      expect(Number.parseFloat(detailShells[0]!.style.left)).toBeGreaterThan(Number.parseFloat(observerShell!.style.left));
      expect(Number.parseFloat(detailShells[1]!.style.left)).toBe(Number.parseFloat(detailShells[0]!.style.left));
      expect(Number.parseFloat(detailShells[1]!.style.top)).toBeGreaterThan(Number.parseFloat(detailShells[0]!.style.top));

      fireEvent.click(workerFileRow);
      await waitFor(() => {
        const nodes = Array.from(container.querySelectorAll(".emap-observer-file-detail-node")) as HTMLElement[];
        expect(nodes).toHaveLength(1);
        expect(nodes[0]).toHaveTextContent("Mock accepted result");
      });
      expect(workerFileRow).not.toHaveClass("selected");
      expect(resultFileRow).toHaveClass("selected");
    });

    it("keeps file detail attached when merged observer panel moves", async () => {
      const { container } = render(<App />);
      await setupMergedObserverOpen(container);

      // Open file detail
      const workerFileRow = await waitFor(() => {
        const row = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
        expect(row).toBeTruthy();
        return row!;
      });
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
      firePointer(observerShell!, "pointerdown", { pointerId: 80, clientX: 600, clientY: 300 });
      firePointer(observerShell!, "pointermove", { pointerId: 80, clientX: 670, clientY: 360 });
      firePointer(observerShell!, "pointerup", { pointerId: 80, clientX: 670, clientY: 360, buttons: 0 });

      const dx = 70;
      const dy = 60;

      // Observer moved
      expect(Number.parseFloat(observerShell!.style.left)).toBeCloseTo(observerLeftBefore + dx, 4);
      expect(Number.parseFloat(observerShell!.style.top)).toBeCloseTo(observerTopBefore + dy, 4);

      // Detail also moved by same delta
      expect(Number.parseFloat(detailShell!.style.left)).toBeCloseTo(detailLeftBefore + dx, 4);
      expect(Number.parseFloat(detailShell!.style.top)).toBeCloseTo(detailTopBefore + dy, 4);
    });

    it("uses right-middle to left-middle source sockets for task child panels", async () => {
      const { container } = render(<App />);
      await setupMergedObserverOpen(container);

      const connectorPaths = container.querySelectorAll<SVGPathElement>(".emap-link-task-child-branch");
      expect(connectorPaths.length).toBeGreaterThanOrEqual(1);

      const menuShell = container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
      const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement | null;
      expect(menuShell).toBeTruthy();
      expect(observerShell).toBeTruthy();

      // Menu width is "max-content" in inline style but falls back to 280 in the layout logic
      const menuLeft = Number.parseFloat(menuShell!.style.left);
      const menuTop = Number.parseFloat(menuShell!.style.top);
      const observerLeft = Number.parseFloat(observerShell!.style.left);
      const observerTop = Number.parseFloat(observerShell!.style.top);

      // Parse first connector path's starting M command
      const firstPath = connectorPaths[0]!;
      const d = firstPath.getAttribute("d") ?? "";
      const moveMatch = d.match(/^M([\d.]+),([\d.]+)/);
      expect(moveMatch).toBeTruthy();

      const pathStartX = Number.parseFloat(moveMatch![1]!);
      const pathStartY = Number.parseFloat(moveMatch![2]!);
      const markerGroup = firstPath.parentElement?.querySelector(".emap-connector-socket-task-child-branch") as SVGGElement | null;
      const sourceSocket = markerGroup?.querySelector(".emap-connector-source-socket") as SVGPathElement | null;
      expect(markerGroup).toBeTruthy();
      expect(sourceSocket).toBeTruthy();
      expect(sourceSocket!.getAttribute("d")).toBe(`M${pathStartX},${pathStartY - 6} A6,6 0 0 1 ${pathStartX},${pathStartY + 6}`);
      expect(markerGroup!.querySelector(".emap-connector-anchor-ring")).toBeNull();
      expect(markerGroup!.querySelector(".emap-connector-anchor-dot")).toBeNull();

      // Source x must be to the right of the menu left and to the left of the observer
      expect(pathStartX).toBeGreaterThan(menuLeft);
      expect(pathStartX).toBeLessThan(observerLeft);
      // Source y should be near the menu's vertical center
      expect(pathStartY).toBeGreaterThan(menuTop - 20);

      // Check that path ends at observer top-left
      const lastCoordMatch = d.match(/([\d.]+),([\d.]+)\s*$/);
      expect(lastCoordMatch).toBeTruthy();
      const pathEndX = Number.parseFloat(lastCoordMatch![1]!);
      const pathEndY = Number.parseFloat(lastCoordMatch![2]!);

      // Target should be at observer left edge
      expect(pathEndX).toBeCloseTo(observerLeft, 0);
      expect(pathEndY).toBeCloseTo(observerTop, 0);

      // Default layout: normal right-side child must NOT use reverse detour (no L command)
      expect(d).not.toContain(" L");
      // Path max x must not overshoot past the observer left edge by more than 8px
      const allCoords = Array.from(d.matchAll(/([\d.]+),([\d.]+)/g));
      const allXs = allCoords.map((m) => Number.parseFloat(m[1]!));
      const maxX = Math.max(...allXs);
      expect(maxX).toBeLessThanOrEqual(observerLeft + 8);
    });

    it("routes reverse task child connector as a compact endpoint-hook curve", async () => {
      const { container } = render(<App />);
      await setupMergedObserverOpen(container);

      const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement | null;
      expect(observerShell).toBeTruthy();

      // Drag observer far to the left to create a reverse angle
      const initialLeft = Number.parseFloat(observerShell!.style.left);
      const menuShell = container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
      const menuLeft = Number.parseFloat(menuShell!.style.left);

      // Move observer to the left of the menu to create reverse angle
      const dx = -initialLeft + menuLeft - 50;
      firePointer(observerShell!, "pointerdown", { pointerId: 81, clientX: 600, clientY: 300 });
      firePointer(observerShell!, "pointermove", { pointerId: 81, clientX: 600 + dx, clientY: 350 });
      firePointer(observerShell!, "pointerup", { pointerId: 81, clientX: 600 + dx, clientY: 350, buttons: 0 });

      // Get connector path after drag
      const connectorPaths = container.querySelectorAll<SVGPathElement>(".emap-link-task-child-branch");
      expect(connectorPaths.length).toBeGreaterThanOrEqual(1);

      const firstPath = connectorPaths[0]!;
      const d = firstPath.getAttribute("d") ?? "";

      // Parse all x coordinates from the path
      const allCoords = Array.from(d.matchAll(/([\d.]+),([\d.]+)/g));
      const allXs = allCoords.map((m) => Number.parseFloat(m[1]!));

      const maxX = Math.max(...allXs);
      const minX = Math.min(...allXs);
      const moveMatch = d.match(/^M([\d.]+),([\d.]+)/);
      expect(moveMatch).toBeTruthy();
      const sourceRightX = Number.parseFloat(moveMatch![1]!);
      const endMatch = d.match(/([\d.]+),([\d.]+)\s*$/);
      expect(endMatch).toBeTruthy();
      const targetLeftX = Number.parseFloat(endMatch![1]!);

      // Reverse layout exits from the parent right side, but only as a short endpoint hook.
      expect(maxX).toBeGreaterThan(sourceRightX);
      expect(maxX).toBeLessThanOrEqual(sourceRightX + 68);
      // It approaches the child from the left side without drawing a wide loop around the canvas.
      expect(minX).toBeLessThan(targetLeftX);
      expect(minX).toBeGreaterThanOrEqual(targetLeftX - 68);

      // Reverse detour stays as one continuous cubic, not angular segments or a multi-part loop.
      expect(d).not.toContain(" L");
      expect((d.match(/\sC/g) ?? []).length).toBe(1);

      // A compact endpoint-hook connector is one cubic: start, two handles, target.
      expect(allCoords).toHaveLength(4);
    });

    // --- Task operation tree drag ---

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

    it("moves observer panels with existing overrides when dragging Task root", async () => {
      const { container } = render(<App />);
      await setupObserverOpen(container);

      const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement | null;
      expect(observerShell).toBeTruthy();

      // Manually drag an observer panel to create a position override.
      firePointer(observerShell!, "pointerdown", { pointerId: 90, clientX: 600, clientY: 300 });
      firePointer(observerShell!, "pointermove", { pointerId: 90, clientX: 660, clientY: 340 });
      firePointer(observerShell!, "pointerup", { pointerId: 90, clientX: 660, clientY: 340, buttons: 0 });

      const menuShell = container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
      expect(menuShell).toBeTruthy();
      const menuLeftBefore = Number.parseFloat(menuShell!.style.left);
      const menuTopBefore = Number.parseFloat(menuShell!.style.top);
      const observerLeftBefore = Number.parseFloat(observerShell!.style.left);
      const observerTopBefore = Number.parseFloat(observerShell!.style.top);

      // Drag Task root node
      const taskNode = container.querySelector(".emap-canvas-task-node") as HTMLElement | null;
      expect(taskNode).toBeTruthy();
      const dx = 60;
      const dy = 40;
      firePointer(taskNode!, "pointerdown", { pointerId: 91, clientX: 200, clientY: 200 });
      firePointer(taskNode!, "pointermove", { pointerId: 91, clientX: 200 + dx, clientY: 200 + dy });
      firePointer(taskNode!, "pointerup", { pointerId: 91, clientX: 200 + dx, clientY: 200 + dy, buttons: 0 });

      // Menu follows task root (derived from task position)
      expect(Number.parseFloat(menuShell!.style.left)).toBeCloseTo(menuLeftBefore + dx, 4);
      expect(Number.parseFloat(menuShell!.style.top)).toBeCloseTo(menuTopBefore + dy, 4);

      // Observer panel with override also follows.
      expect(Number.parseFloat(observerShell!.style.left)).toBeCloseTo(observerLeftBefore + dx, 4);
      expect(Number.parseFloat(observerShell!.style.top)).toBeCloseTo(observerTopBefore + dy, 4);
    });

    it("moves observer panels when dragging menu shell header", async () => {
      const { container } = render(<App />);
      await setupObserverOpen(container);

      const menuShell = container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
      expect(menuShell).toBeTruthy();

      const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement | null;
      expect(observerShell).toBeTruthy();

      const menuLeftBefore = Number.parseFloat(menuShell!.style.left);
      const menuTopBefore = Number.parseFloat(menuShell!.style.top);
      const observerLeftBefore = Number.parseFloat(observerShell!.style.left);
      const observerTopBefore = Number.parseFloat(observerShell!.style.top);

      // Drag from the menu header area (not a button)
      const menuHeader = menuShell!.querySelector(".task-leader-branch-head") as HTMLElement | null;
      expect(menuHeader).toBeTruthy();
      firePointer(menuHeader!, "pointerdown", { pointerId: 92, clientX: 400, clientY: 200 });
      firePointer(menuHeader!, "pointermove", { pointerId: 92, clientX: 470, clientY: 250 });
      firePointer(menuHeader!, "pointerup", { pointerId: 92, clientX: 470, clientY: 250, buttons: 0 });

      const dx = 70;
      const dy = 50;

      expect(Number.parseFloat(menuShell!.style.left)).toBeCloseTo(menuLeftBefore + dx, 4);
      expect(Number.parseFloat(menuShell!.style.top)).toBeCloseTo(menuTopBefore + dy, 4);
      expect(Number.parseFloat(observerShell!.style.left)).toBeCloseTo(observerLeftBefore + dx, 4);
      expect(Number.parseFloat(observerShell!.style.top)).toBeCloseTo(observerTopBefore + dy, 4);
    });

    it("moves merged observer panel when dragging Task root", async () => {
      const { container } = render(<App />);
      await setupObserverOpen(container);

      const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement | null;
      expect(observerShell).toBeTruthy();

      const observerLeftBefore = Number.parseFloat(observerShell!.style.left);
      const observerTopBefore = Number.parseFloat(observerShell!.style.top);

      const taskNode = container.querySelector(".emap-canvas-task-node") as HTMLElement | null;
      expect(taskNode).toBeTruthy();
      firePointer(taskNode!, "pointerdown", { pointerId: 101, clientX: 200, clientY: 200 });
      firePointer(taskNode!, "pointermove", { pointerId: 101, clientX: 250, clientY: 235 });
      firePointer(taskNode!, "pointerup", { pointerId: 101, clientX: 250, clientY: 235, buttons: 0 });

      expect(Number.parseFloat(observerShell!.style.left)).toBeCloseTo(observerLeftBefore + 50, 4);
      expect(Number.parseFloat(observerShell!.style.top)).toBeCloseTo(observerTopBefore + 35, 4);
    });

    it("moves merged observer panel when dragging menu shell header", async () => {
      const { container } = render(<App />);
      await setupObserverOpen(container);

      const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement | null;
      expect(observerShell).toBeTruthy();
      const observerLeftBefore = Number.parseFloat(observerShell!.style.left);
      const observerTopBefore = Number.parseFloat(observerShell!.style.top);

      const menuHeader = container.querySelector(".emap-task-branch-shell .task-leader-branch-head") as HTMLElement | null;
      expect(menuHeader).toBeTruthy();
      firePointer(menuHeader!, "pointerdown", { pointerId: 102, clientX: 400, clientY: 200 });
      firePointer(menuHeader!, "pointermove", { pointerId: 102, clientX: 455, clientY: 245 });
      firePointer(menuHeader!, "pointerup", { pointerId: 102, clientX: 455, clientY: 245, buttons: 0 });

      expect(Number.parseFloat(observerShell!.style.left)).toBeCloseTo(observerLeftBefore + 55, 4);
      expect(Number.parseFloat(observerShell!.style.top)).toBeCloseTo(observerTopBefore + 45, 4);
    });

    it("drags merged observer panel as a single unit", async () => {
      const { container } = render(<App />);
      await setupObserverOpen(container);

      const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement | null;
      const menuShell = container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
      expect(observerShell).toBeTruthy();
      expect(menuShell).toBeTruthy();

      const observerLeftBefore = Number.parseFloat(observerShell!.style.left);
      const observerTopBefore = Number.parseFloat(observerShell!.style.top);
      const menuLeftBefore = Number.parseFloat(menuShell!.style.left);
      const menuTopBefore = Number.parseFloat(menuShell!.style.top);

      firePointer(observerShell!, "pointerdown", { pointerId: 103, clientX: 600, clientY: 300 });
      firePointer(observerShell!, "pointermove", { pointerId: 103, clientX: 670, clientY: 340 });
      firePointer(observerShell!, "pointerup", { pointerId: 103, clientX: 670, clientY: 340, buttons: 0 });

      // Observer moved
      expect(Number.parseFloat(observerShell!.style.left)).toBeCloseTo(observerLeftBefore + 70, 4);
      expect(Number.parseFloat(observerShell!.style.top)).toBeCloseTo(observerTopBefore + 40, 4);
      // Menu did not move
      expect(Number.parseFloat(menuShell!.style.left)).toBeCloseTo(menuLeftBefore, 4);
      expect(Number.parseFloat(menuShell!.style.top)).toBeCloseTo(menuTopBefore, 4);
    });

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
