import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { TeamCanvasTask, TeamRunState } from "../api/team-types";
import { getAtlasNodes } from "./app-dom-test-utils";

describe("Task branch observer anchors", () => {
  beforeEach(() => {
    resetMockTeamApiState();
    window.localStorage.clear();
    const fetchMock = vi.fn();
    const mockImplementation = fetchMock.mockImplementation.bind(fetchMock);
    fetchMock.mockImplementation = ((implementation) => mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        const query = new URLSearchParams(url.slice(url.indexOf("?") + 1));
        const runsByTaskId: Record<string, TeamRunState[]> = {};
        for (const taskId of query.getAll("taskIds").flatMap((value) => value.split(",")).filter(Boolean)) {
          const response = await implementation(`/v1/team/tasks/${taskId}/runs`, { method: "GET" });
          const body = await response.json() as { runs?: TeamRunState[] };
          runsByTaskId[taskId] = body.runs ?? [];
        }
        return new Response(JSON.stringify({ runsByTaskId }), { status: 200 });
      }
      return implementation(input, init);
    })) as typeof fetchMock.mockImplementation;
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const taskA: TeamCanvasTask = {
    taskId: "mtask_alpha",
    title: "Alpha Task",
    leaderAgentId: "main",
    status: "ready",
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
    archived: false,
    workUnit: {
      title: "Alpha Task",
      input: { text: "Alpha input" },
      outputPorts: [],
      outputContract: { text: "Alpha output" },
      acceptance: { rules: [] },
      workerAgentId: "main",
      checkerAgentId: "main",
    },
  };
  const taskB: TeamCanvasTask = {
    taskId: "mtask_beta",
    title: "Beta Task",
    leaderAgentId: "main",
    status: "ready",
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
    archived: false,
    workUnit: {
      title: "Beta Task",
      input: { text: "Beta input" },
      outputPorts: [],
      outputContract: { text: "Beta output" },
      acceptance: { rules: [] },
      workerAgentId: "search",
      checkerAgentId: "main",
    },
  };
  const taskC: TeamCanvasTask = {
    taskId: "mtask_gamma",
    title: "Gamma Task",
    leaderAgentId: "main",
    status: "ready",
    createdAt: "2026-05-27T00:00:00.000Z",
    updatedAt: "2026-05-27T00:00:00.000Z",
    archived: false,
    workUnit: {
      title: "Gamma Task",
      input: { text: "Gamma input" },
      outputPorts: [],
      outputContract: { text: "Gamma output" },
      acceptance: { rules: [] },
      workerAgentId: "main",
      checkerAgentId: "search",
    },
  };
  const allTasks = [taskA, taskB, taskC];

  it("existing Task observer keeps position when another Task gets focus", async () => {
    const runA: TeamRunState = {
      runId: "focus_mrun_alpha",
      planId: "canvas_task_mtask_alpha",
      source: { type: "canvas-task", taskId: taskA.taskId },
      teamUnitId: "canvas_task_unit_mtask_alpha",
      status: "completed",
      createdAt: "2026-05-27T00:00:00.000Z",
      startedAt: "2026-05-27T00:00:01.000Z",
      finishedAt: "2026-05-27T00:00:05.000Z",
      currentTaskId: null,
      taskStates: {
        [taskA.taskId]: {
          status: "succeeded",
          attemptCount: 1,
          activeAttemptId: "focus_att_alpha",
          resultRef: null,
          errorSummary: null,
          progress: { phase: "succeeded", message: "完成", updatedAt: "2026-05-27T00:00:05.000Z" },
        },
      },
      summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    };
    const runB: TeamRunState = {
      runId: "focus_mrun_beta",
      planId: "canvas_task_mtask_beta",
      source: { type: "canvas-task", taskId: taskB.taskId },
      teamUnitId: "canvas_task_unit_mtask_beta",
      status: "completed",
      createdAt: "2026-05-27T00:00:00.000Z",
      startedAt: "2026-05-27T00:00:01.000Z",
      finishedAt: "2026-05-27T00:00:05.000Z",
      currentTaskId: null,
      taskStates: {
        [taskB.taskId]: {
          status: "succeeded",
          attemptCount: 1,
          activeAttemptId: "focus_att_beta",
          resultRef: null,
          errorSummary: null,
          progress: { phase: "succeeded", message: "完成", updatedAt: "2026-05-27T00:00:05.000Z" },
        },
      },
      summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    };

    // Mock offsetWidth/offsetHeight so that Task A's menu measures much wider than default 280.
    // The shell does not have data-task-id; use textContent of the inner .task-action-branch.
    const measuredWidthAlpha = 340;
    const measuredHeightAlpha = 320;
    const origOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    const origOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      get(this: HTMLElement) {
        if (this.classList.contains("emap-task-branch-shell")) {
          const section = this.querySelector(".task-action-branch");
          if (section?.textContent?.includes(taskA.taskId)) return measuredWidthAlpha;
          if (section?.textContent?.includes(taskB.taskId)) return 260;
        }
        return origOffsetWidth?.get?.call(this) ?? 0;
      },
      configurable: true,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      get(this: HTMLElement) {
        if (this.classList.contains("emap-task-branch-shell")) {
          const section = this.querySelector(".task-action-branch");
          if (section?.textContent?.includes(taskA.taskId)) return measuredHeightAlpha;
          if (section?.textContent?.includes(taskB.taskId)) return 280;
        }
        return origOffsetHeight?.get?.call(this) ?? 0;
      },
      configurable: true,
    });

    try {
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [
              { agentId: "main", name: "主 Agent", description: "默认" },
              { agentId: "search", name: "搜索 Agent", description: "搜索" },
            ],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks" && method === "GET") {
          return new Response(JSON.stringify({ tasks: allTasks }), { status: 200 });
        }
        if (url === "/v1/team/task-connections") return new Response(JSON.stringify([]), { status: 200 });
        if (url === "/v1/team/source-nodes") return new Response(JSON.stringify([]), { status: 200 });
        if (url === "/v1/team/source-connections") return new Response(JSON.stringify([]), { status: 200 });
        if (url === `/v1/team/tasks/${taskA.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [runA] }), { status: 200 });
        }
        if (url === `/v1/team/tasks/${taskB.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [runB] }), { status: 200 });
        }
        if (url === `/v1/team/tasks/${taskC.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/") && url.includes("/tasks/") && url.includes("/attempts")) {
          return new Response(JSON.stringify({ attempts: [] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/")) {
          if (url.includes(runA.runId)) return new Response(JSON.stringify(runA), { status: 200 });
          if (url.includes(runB.runId)) return new Response(JSON.stringify(runB), { status: 200 });
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(window.localStorage.getItem("ugk-team-console:canvas-ui-state:v1")).toContain('"dataSource":"live"'));

      // Open Task A menu
      await waitFor(() => {
        expect(within(getAtlasNodes(container)).getByRole("button", { name: taskA.title })).toHaveAttribute("data-task-run-status", "completed");
      });
      const taskANode = within(getAtlasNodes(container)).getByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());

      // Open Task A observer
      const branchA = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      )!;
      const runSummaryA = await within(branchA as HTMLElement).findByRole("button", { name: /最近运行/ });
      fireEvent.click(runSummaryA);
      await waitFor(() => {
        expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]')).toBeTruthy();
      });

      // Record Task A menu shell left position (x doesn't depend on measured width)
      const menuShellA = Array.from(container.querySelectorAll(".emap-task-branch-shell")).find((el) => {
        const section = el.querySelector(".task-action-branch");
        return section?.textContent?.includes(taskA.taskId);
      }) as HTMLElement;
      expect(menuShellA).toBeTruthy();
      const menuALeft = Number.parseFloat(menuShellA.style.left);

      // Now open Task B menu
      const taskBNode = within(getAtlasNodes(container)).getByRole("button", { name: taskB.title });
      fireEvent.click(taskBNode);
      await waitFor(() => {
        const branches = container.querySelectorAll(".task-action-branch");
        expect(branches.length).toBeGreaterThanOrEqual(2);
      });

      // Task A observer must still be positioned based on the measured Task A menu width (340),
      // not the default width (280). With the bug, Task A loses its measured size when focus
      // switches to Task B, and the observer shifts left to menuALeft + 280 + 32 = menuALeft + 312.
      // With the fix, observer stays at menuALeft + 340 + 32 = menuALeft + 372.
      await waitFor(() => {
        const observerShells = container.querySelectorAll('.emap-task-child-branch-shell[data-panel-id^="run-observer"]');
        expect(observerShells.length).toBeGreaterThanOrEqual(1);
        const observerA = Array.from(observerShells).find((el) =>
          el.querySelector(".emap-run-observer-panel"),
        ) as HTMLElement | null;
        expect(observerA).toBeTruthy();
        const observerALeft = Number.parseFloat(observerA!.style.left);
        // observer left should be at least menuALeft + measuredWidth (340)
        // because the gap (32) is added on top: menuLeft + measuredWidth + gap
        expect(observerALeft).toBeGreaterThanOrEqual(menuALeft + measuredWidthAlpha);
      });
    } finally {
      if (origOffsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", origOffsetWidth);
      if (origOffsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", origOffsetHeight);
    }
  });

  it("existing Task observer connector stays anchored to its own menu", async () => {
    const runA: TeamRunState = {
      runId: "anchor_mrun_alpha",
      planId: "canvas_task_mtask_alpha",
      source: { type: "canvas-task", taskId: taskA.taskId },
      teamUnitId: "canvas_task_unit_mtask_alpha",
      status: "completed",
      createdAt: "2026-05-27T00:00:00.000Z",
      startedAt: "2026-05-27T00:00:01.000Z",
      finishedAt: "2026-05-27T00:00:05.000Z",
      currentTaskId: null,
      taskStates: {
        [taskA.taskId]: {
          status: "succeeded",
          attemptCount: 1,
          activeAttemptId: "anchor_att_alpha",
          resultRef: null,
          errorSummary: null,
          progress: { phase: "succeeded", message: "完成", updatedAt: "2026-05-27T00:00:05.000Z" },
        },
      },
      summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    };
    const runB: TeamRunState = {
      runId: "anchor_mrun_beta",
      planId: "canvas_task_mtask_beta",
      source: { type: "canvas-task", taskId: taskB.taskId },
      teamUnitId: "canvas_task_unit_mtask_beta",
      status: "completed",
      createdAt: "2026-05-27T00:00:00.000Z",
      startedAt: "2026-05-27T00:00:01.000Z",
      finishedAt: "2026-05-27T00:00:05.000Z",
      currentTaskId: null,
      taskStates: {
        [taskB.taskId]: {
          status: "succeeded",
          attemptCount: 1,
          activeAttemptId: "anchor_att_beta",
          resultRef: null,
          errorSummary: null,
          progress: { phase: "succeeded", message: "完成", updatedAt: "2026-05-27T00:00:05.000Z" },
        },
      },
      summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    };

    // Mock offsetWidth/offsetHeight so Task A menu measures wider than default
    const measuredWidthAlpha = 340;
    const measuredHeightAlpha = 320;
    const origOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    const origOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      get(this: HTMLElement) {
        if (this.classList.contains("emap-task-branch-shell")) {
          const section = this.querySelector(".task-action-branch");
          if (section?.textContent?.includes(taskA.taskId)) return measuredWidthAlpha;
          if (section?.textContent?.includes(taskB.taskId)) return 260;
        }
        return origOffsetWidth?.get?.call(this) ?? 0;
      },
      configurable: true,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      get(this: HTMLElement) {
        if (this.classList.contains("emap-task-branch-shell")) {
          const section = this.querySelector(".task-action-branch");
          if (section?.textContent?.includes(taskA.taskId)) return measuredHeightAlpha;
          if (section?.textContent?.includes(taskB.taskId)) return 280;
        }
        return origOffsetHeight?.get?.call(this) ?? 0;
      },
      configurable: true,
    });

    try {
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [
              { agentId: "main", name: "主 Agent", description: "默认" },
              { agentId: "search", name: "搜索 Agent", description: "搜索" },
            ],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks" && method === "GET") {
          return new Response(JSON.stringify({ tasks: allTasks }), { status: 200 });
        }
        if (url === "/v1/team/task-connections") return new Response(JSON.stringify([]), { status: 200 });
        if (url === "/v1/team/source-nodes") return new Response(JSON.stringify([]), { status: 200 });
        if (url === "/v1/team/source-connections") return new Response(JSON.stringify([]), { status: 200 });
        if (url === `/v1/team/tasks/${taskA.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [runA] }), { status: 200 });
        }
        if (url === `/v1/team/tasks/${taskB.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [runB] }), { status: 200 });
        }
        if (url === `/v1/team/tasks/${taskC.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/") && url.includes("/tasks/") && url.includes("/attempts")) {
          return new Response(JSON.stringify({ attempts: [] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/")) {
          if (url.includes(runA.runId)) return new Response(JSON.stringify(runA), { status: 200 });
          if (url.includes(runB.runId)) return new Response(JSON.stringify(runB), { status: 200 });
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(window.localStorage.getItem("ugk-team-console:canvas-ui-state:v1")).toContain('"dataSource":"live"'));

      // Open Task A menu and observer
      await waitFor(() => {
        expect(within(getAtlasNodes(container)).getByRole("button", { name: taskA.title })).toHaveAttribute("data-task-run-status", "completed");
      });
      const taskANode = within(getAtlasNodes(container)).getByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());
      const branchA = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      )!;
      const runSummaryA = await within(branchA as HTMLElement).findByRole("button", { name: /最近运行/ });
      fireEvent.click(runSummaryA);
      await waitFor(() => {
        expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]')).toBeTruthy();
      });

      // Record Task A menu shell position
      const menuShellA = Array.from(container.querySelectorAll(".emap-task-branch-shell")).find((el) => {
        const section = el.querySelector(".task-action-branch");
        return section?.textContent?.includes(taskA.taskId);
      }) as HTMLElement;
      expect(menuShellA).toBeTruthy();
      const menuALeft = Number.parseFloat(menuShellA.style.left);
      const menuATop = Number.parseFloat(menuShellA.style.top);

      // Now click Task B to change focus
      const taskBNode = within(getAtlasNodes(container)).getByRole("button", { name: taskB.title });
      fireEvent.click(taskBNode);
      await waitFor(() => {
        const branches = container.querySelectorAll(".task-action-branch");
        expect(branches.length).toBeGreaterThanOrEqual(2);
      });

      // Find Task A observer shell
      const observerShells = container.querySelectorAll('.emap-task-child-branch-shell[data-panel-id^="run-observer"]');
      const observerAShell = Array.from(observerShells).find((el) =>
        el.querySelector(".emap-run-observer-panel"),
      ) as HTMLElement | null;
      expect(observerAShell).toBeTruthy();
      const observerALeft = Number.parseFloat(observerAShell!.style.left);
      const observerATop = Number.parseFloat(observerAShell!.style.top);

      // Find connector path for Task A's observer.
      // SVG path format: M sx,sy C cp1x,cp1y cp2x,cp2y tx,ty
      // The last pair of numbers is the target (tx,ty).
      const connectorPaths = container.querySelectorAll("path.emap-link-task-child-branch");
      const connectorA = Array.from(connectorPaths).find((path) => {
        const d = path.getAttribute("d") ?? "";
        // Extract all numbers from the path
        const nums = d.match(/[\d.]+/g);
        if (!nums || nums.length < 6) return false;
        const tx = Number.parseFloat(nums[nums.length - 2]!);
        const ty = Number.parseFloat(nums[nums.length - 1]!);
        // Target should match observer A's left,top
        return Math.abs(tx - observerALeft) < 5 && Math.abs(ty - observerATop) < 5;
      });
      expect(connectorA).toBeTruthy();

      // Extract source coordinates (first pair after M)
      const connectorD = connectorA!.getAttribute("d") ?? "";
      const sourceMatch = connectorD.match(/^M([\d.]+),([\d.]+)/);
      expect(sourceMatch).toBeTruthy();
      const sourceX = Number.parseFloat(sourceMatch![1]!);
      const sourceY = Number.parseFloat(sourceMatch![2]!);

      // Source x should be at Task A menu's right edge: menuALeft + measuredWidth
      // With the bug (default fallback): sourceX ≈ menuALeft + 280
      // With the fix: sourceX ≈ menuALeft + 340
      const expectedSourceX = menuALeft + measuredWidthAlpha;
      expect(Math.abs(sourceX - expectedSourceX)).toBeLessThan(5);

      // Source y should be at Task A menu's vertical middle: menuATop + measuredHeight / 2
      const expectedSourceY = menuATop + measuredHeightAlpha / 2;
      expect(Math.abs(sourceY - expectedSourceY)).toBeLessThan(5);
    } finally {
      if (origOffsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", origOffsetWidth);
      if (origOffsetHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", origOffsetHeight);
    }
  });
});
