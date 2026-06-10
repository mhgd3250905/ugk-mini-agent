import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { TeamCanvasTask, TeamRunState } from "../api/team-types";
import { getAtlasNodes, firePointer } from "./app-dom-test-utils";

describe("App", () => {
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

  describe("multiple Task child panel isolation", () => {
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

    function setupLiveMultiTaskApi() {
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
        if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
        // PATCH for task edits
        for (const task of allTasks) {
          if (url === `/v1/team/tasks/${task.taskId}` && method === "PATCH") {
            const body = JSON.parse(String(init?.body ?? "{}"));
            const updated = { ...task, ...body, updatedAt: "2026-05-27T01:00:00.000Z" };
            return new Response(JSON.stringify({ task: updated }), { status: 200 });
          }
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });
    }

    it("multiple run observer panels preserve positions when opening new ones", async () => {
      const runA: TeamRunState = {
        runId: "mrun_alpha_1",
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
            activeAttemptId: "matt_alpha_1",
            resultRef: null,
            errorSummary: null,
            progress: { phase: "succeeded", message: "完成", updatedAt: "2026-05-27T00:00:05.000Z" },
          },
        },
        summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
      };
      const runB: TeamRunState = {
        runId: "mrun_beta_1",
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
            activeAttemptId: "matt_beta_1",
            resultRef: null,
            errorSummary: null,
            progress: { phase: "succeeded", message: "完成", updatedAt: "2026-05-27T00:00:05.000Z" },
          },
        },
        summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
      };

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

      // Open Task A menu and click its run summary to open observer
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

      // Wait for observer A to appear
      const observerA = await waitFor(() => {
        const shell = container.querySelector(`.emap-task-child-branch-shell[data-panel-id^="run-observer"]`);
        expect(shell).toBeTruthy();
        return shell!;
      });
      const observerALeft = (observerA as HTMLElement).style.left;
      const observerATop = (observerA as HTMLElement).style.top;

      // Open Task B menu and click its run summary
      await waitFor(() => {
        expect(within(getAtlasNodes(container)).getByRole("button", { name: taskB.title })).toHaveAttribute("data-task-run-status", "completed");
      });
      const taskBNode = within(getAtlasNodes(container)).getByRole("button", { name: taskB.title });
      fireEvent.click(taskBNode);
      await waitFor(() => {
        const branches = container.querySelectorAll(".task-action-branch");
        expect(branches.length).toBeGreaterThanOrEqual(2);
      });
      const branchB = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskB.taskId),
      )!;
      const runSummaryB = await within(branchB as HTMLElement).findByRole("button", { name: /最近运行/ });
      fireEvent.click(runSummaryB);

      // Both observers should be visible
      await waitFor(() => {
        const observers = container.querySelectorAll('.emap-task-child-branch-shell[data-panel-id^="run-observer"]');
        expect(observers.length).toBe(2);
      });

      // Observer A's position should NOT have changed after opening observer B
      container.querySelector(`.emap-task-child-branch-shell[data-panel-id^="run-observer-${taskANode.getAttribute("data-node-id") ?? ""}"]`)
        ?? container.querySelectorAll('.emap-task-child-branch-shell[data-panel-id^="run-observer"]')[0];
      // Find observer A by checking which panel is still at the original position
      const allObservers = container.querySelectorAll('.emap-task-child-branch-shell[data-panel-id^="run-observer"]');
      const observerAPanel = Array.from(allObservers).find((el) =>
        (el as HTMLElement).style.left === observerALeft && (el as HTMLElement).style.top === observerATop,
      );
      expect(observerAPanel).toBeTruthy();
    });

    it("closing one observer does not affect the other's position", async () => {
      const runA: TeamRunState = {
        runId: "mrun_alpha_2",
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
            activeAttemptId: "matt_alpha_2",
            resultRef: null,
            errorSummary: null,
            progress: { phase: "succeeded", message: "完成", updatedAt: "2026-05-27T00:00:05.000Z" },
          },
        },
        summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
      };
      const runB: TeamRunState = {
        runId: "mrun_beta_2",
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
            activeAttemptId: "matt_beta_2",
            resultRef: null,
            errorSummary: null,
            progress: { phase: "succeeded", message: "完成", updatedAt: "2026-05-27T00:00:05.000Z" },
          },
        },
        summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
      };

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

      // Open both observers
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
        expect(container.querySelectorAll('.emap-task-child-branch-shell[data-panel-id^="run-observer"]').length).toBeGreaterThanOrEqual(1);
      });

      await waitFor(() => {
        expect(within(getAtlasNodes(container)).getByRole("button", { name: taskB.title })).toHaveAttribute("data-task-run-status", "completed");
      });
      const taskBNode = within(getAtlasNodes(container)).getByRole("button", { name: taskB.title });
      fireEvent.click(taskBNode);
      await waitFor(() => {
        const branches = container.querySelectorAll(".task-action-branch");
        expect(branches.length).toBeGreaterThanOrEqual(2);
      });
      const branchB = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskB.taskId),
      )!;
      const runSummaryB = await within(branchB as HTMLElement).findByRole("button", { name: /最近运行/ });
      fireEvent.click(runSummaryB);

      await waitFor(() => {
        expect(container.querySelectorAll('.emap-task-child-branch-shell[data-panel-id^="run-observer"]').length).toBe(2);
      });

      // Record observer B's position
      const observers = container.querySelectorAll('.emap-task-child-branch-shell[data-panel-id^="run-observer"]');
      const observerB = Array.from(observers).find((el) =>
        el.textContent?.includes(taskB.title),
      ) ?? observers[1];
      expect(observerB).toBeTruthy();
      const observerBLeft = (observerB! as HTMLElement).style.left;
      const observerBTop = (observerB! as HTMLElement).style.top;

      // Close observer A by clicking its run summary again (toggle)
      const runSummaryAAgain = within(branchA as HTMLElement).getByRole("button", { name: /最近运行/ });
      fireEvent.click(runSummaryAAgain);

      await waitFor(() => {
        const remaining = container.querySelectorAll('.emap-task-child-branch-shell[data-panel-id^="run-observer"]');
        expect(remaining.length).toBe(1);
      });

      // Observer B's position should be unchanged
      const observerBAfter = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]');
      expect(observerBAfter).toBeTruthy();
      expect((observerBAfter! as HTMLElement).style.left).toBe(observerBLeft);
      expect((observerBAfter! as HTMLElement).style.top).toBe(observerBTop);
    });

    it("clicking Edit twice toggles the Task edit panel closed", async () => {
      setupLiveMultiTaskApi();
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(window.localStorage.getItem("ugk-team-console:canvas-ui-state:v1")).toContain('"dataSource":"live"'));

      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());

      const branchA = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      )!;
      const editButton = Array.from(branchA.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("编辑"),
      )!;

      // First click opens edit
      fireEvent.click(editButton);
      await waitFor(() => expect(container.querySelector(".task-edit-branch")).toBeTruthy());

      // Second click closes edit (toggle)
      const editButtonAgain = Array.from(branchA.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("编辑"),
      )!;
      fireEvent.click(editButtonAgain);
      await waitFor(() => expect(container.querySelector(".task-edit-branch")).toBeNull());

      // Menu should still be present
      expect(container.querySelector(".task-action-branch")).toBeTruthy();

      // Third click opens edit again
      const editButton3 = Array.from(branchA.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("编辑"),
      )!;
      fireEvent.click(editButton3);
      await waitFor(() => expect(container.querySelector(".task-edit-branch")).toBeTruthy());
    });

    it("clicking Leader twice toggles the leader chat panel closed", async () => {
      setupLiveMultiTaskApi();
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(window.localStorage.getItem("ugk-team-console:canvas-ui-state:v1")).toContain('"dataSource":"live"'));

      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());

      const branchA = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      )!;
      const leaderButton = Array.from(branchA.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("对话 Leader"),
      )!;

      // First click opens leader chat
      fireEvent.click(leaderButton);
      await waitFor(() => expect(container.querySelector(".task-leader-chat-branch")).toBeTruthy());

      // Second click closes leader chat (toggle)
      const leaderButtonAgain = Array.from(branchA.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("对话 Leader"),
      )!;
      fireEvent.click(leaderButtonAgain);
      await waitFor(() => expect(container.querySelector(".task-leader-chat-branch")).toBeNull());

      // Menu should still be present
      expect(container.querySelector(".task-action-branch")).toBeTruthy();

      // Third click opens again
      const leaderButton3 = Array.from(branchA.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("对话 Leader"),
      )!;
      fireEvent.click(leaderButton3);
      await waitFor(() => expect(container.querySelector(".task-leader-chat-branch")).toBeTruthy());
    });

    it("toggling one Task detail does not close another Task detail", async () => {
      setupLiveMultiTaskApi();
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(window.localStorage.getItem("ugk-team-console:canvas-ui-state:v1")).toContain('"dataSource":"live"'));

      // Open Task A edit
      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());
      const branchA = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      )!;
      const editButtonA = Array.from(branchA.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("编辑"),
      )!;
      fireEvent.click(editButtonA);
      await waitFor(() => expect(container.querySelectorAll(".task-edit-branch").length).toBeGreaterThanOrEqual(1));

      // Open Task B leader chat
      const taskBNode = within(getAtlasNodes(container)).getByRole("button", { name: taskB.title });
      fireEvent.click(taskBNode);
      await waitFor(() => {
        expect(container.querySelectorAll(".task-action-branch").length).toBeGreaterThanOrEqual(2);
      });
      const branchB = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskB.taskId),
      )!;
      const leaderButtonB = Array.from(branchB.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("对话 Leader"),
      )!;
      fireEvent.click(leaderButtonB);
      await waitFor(() => expect(container.querySelector(".task-leader-chat-branch")).toBeTruthy());

      // Toggle Task A edit closed
      const editButtonA2 = Array.from(branchA.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("编辑"),
      )!;
      fireEvent.click(editButtonA2);
      await waitFor(() => expect(container.querySelector(".task-edit-branch")).toBeNull());

      // Task B leader chat should still exist
      expect(container.querySelector(".task-leader-chat-branch")).toBeTruthy();
      // Both menus still exist
      expect(container.querySelectorAll(".task-action-branch").length).toBeGreaterThanOrEqual(2);
    });

    it("clicking run summary toggle opens and closes observer without closing menu", async () => {
      const run: TeamRunState = {
        runId: "mrun_toggle_1",
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
            activeAttemptId: "matt_toggle_1",
            resultRef: null,
            errorSummary: null,
            progress: { phase: "succeeded", message: "完成", updatedAt: "2026-05-27T00:00:05.000Z" },
          },
        },
        summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
      };

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
          return new Response(JSON.stringify({ runs: [run] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/") && url.includes("/tasks/") && url.includes("/attempts")) {
          return new Response(JSON.stringify({ attempts: [] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/")) {
          if (url.includes(run.runId)) return new Response(JSON.stringify(run), { status: 200 });
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(window.localStorage.getItem("ugk-team-console:canvas-ui-state:v1")).toContain('"dataSource":"live"'));

      await waitFor(() => {
        expect(within(getAtlasNodes(container)).getByRole("button", { name: taskA.title })).toHaveAttribute("data-task-run-status", "completed");
      });
      const taskANode = within(getAtlasNodes(container)).getByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());

      const branch = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      )!;
      const runSummary = await within(branch as HTMLElement).findByRole("button", { name: /最近运行/ });

      // First click opens observer
      fireEvent.click(runSummary);
      await waitFor(() => expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]')).toBeTruthy());

      // Second click closes observer (toggle)
      const runSummaryAgain = within(branch as HTMLElement).getByRole("button", { name: /最近运行/ });
      fireEvent.click(runSummaryAgain);
      await waitFor(() => expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]')).toBeNull());

      // Menu should still exist
      expect(container.querySelector(".task-action-branch")).toBeTruthy();
    });

    it("edit toggle preserves unsaved draft on reopen", async () => {
      setupLiveMultiTaskApi();
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(window.localStorage.getItem("ugk-team-console:canvas-ui-state:v1")).toContain('"dataSource":"live"'));

      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());

      const branchA = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      )!;
      const editButton = Array.from(branchA.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("编辑"),
      )!;

      // Open edit, change title
      fireEvent.click(editButton);
      await waitFor(() => expect(container.querySelector(".task-edit-branch")).toBeTruthy());
      const titleInput = container.querySelector('.task-edit-form input') as HTMLInputElement;
      expect(titleInput).toBeTruthy();
      fireEvent.change(titleInput, { target: { value: "Modified Alpha" } });

      // Toggle closed
      const editButton2 = Array.from(branchA.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("编辑"),
      )!;
      fireEvent.click(editButton2);
      await waitFor(() => expect(container.querySelector(".task-edit-branch")).toBeNull());

      // Toggle open again - draft should still contain modified title
      const editButton3 = Array.from(branchA.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("编辑"),
      )!;
      fireEvent.click(editButton3);
      await waitFor(() => expect(container.querySelector(".task-edit-branch")).toBeTruthy());
      const titleInputAfter = container.querySelector('.task-edit-form input') as HTMLInputElement;
      expect(titleInputAfter.value).toBe("Modified Alpha");
    });

    it("Task menu preserves drag position after collapse/reopen", async () => {
      setupLiveMultiTaskApi();
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(window.localStorage.getItem("ugk-team-console:canvas-ui-state:v1")).toContain('"dataSource":"live"'));

      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".emap-task-branch-shell")).toBeTruthy());

      const menuShell = container.querySelector(".emap-task-branch-shell") as HTMLElement;
      expect(menuShell).toBeTruthy();

      // Drag menu header to create a position override
      const menuHeader = menuShell.querySelector(".task-leader-branch-head") as HTMLElement;
      expect(menuHeader).toBeTruthy();
      firePointer(menuHeader, "pointerdown", { pointerId: 101, clientX: 400, clientY: 200 });
      firePointer(menuHeader, "pointermove", { pointerId: 101, clientX: 470, clientY: 260 });
      firePointer(menuHeader, "pointerup", { pointerId: 101, clientX: 470, clientY: 260, buttons: 0 });

      const draggedLeft = Number.parseFloat(menuShell.style.left);
      const draggedTop = Number.parseFloat(menuShell.style.top);
      expect(draggedLeft).not.toBeNaN();
      expect(draggedTop).not.toBeNaN();

      // Collapse menu by clicking Task root again
      const taskANodeAgain = within(getAtlasNodes(container)).getByRole("button", { name: taskA.title });
      fireEvent.click(taskANodeAgain);
      await waitFor(() => expect(container.querySelector(".emap-task-branch-shell")).toBeNull());

      // Reopen menu
      const taskANodeReopen = within(getAtlasNodes(container)).getByRole("button", { name: taskA.title });
      fireEvent.click(taskANodeReopen);
      await waitFor(() => expect(container.querySelector(".emap-task-branch-shell")).toBeTruthy());

      const reopenedShell = container.querySelector(".emap-task-branch-shell") as HTMLElement;
      expect(Number.parseFloat(reopenedShell.style.left)).toBeCloseTo(draggedLeft, 1);
      expect(Number.parseFloat(reopenedShell.style.top)).toBeCloseTo(draggedTop, 1);
    });

    it("Edit panel preserves drag position after toggle close/reopen", async () => {
      setupLiveMultiTaskApi();
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(window.localStorage.getItem("ugk-team-console:canvas-ui-state:v1")).toContain('"dataSource":"live"'));

      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());

      const branch = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      )!;
      const editButton = Array.from(branch.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("编辑"),
      )!;
      fireEvent.click(editButton);
      await waitFor(() => expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id^="task-edit-"]')).toBeTruthy());

      const editShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="task-edit-"]') as HTMLElement;
      expect(editShell).toBeTruthy();

      // Drag edit panel header
      const editHeader = editShell.querySelector(".task-leader-branch-head") as HTMLElement;
      expect(editHeader).toBeTruthy();
      firePointer(editHeader, "pointerdown", { pointerId: 102, clientX: 500, clientY: 250 });
      firePointer(editHeader, "pointermove", { pointerId: 102, clientX: 560, clientY: 310 });
      firePointer(editHeader, "pointerup", { pointerId: 102, clientX: 560, clientY: 310, buttons: 0 });

      const draggedLeft = Number.parseFloat(editShell.style.left);
      const draggedTop = Number.parseFloat(editShell.style.top);
      expect(draggedLeft).not.toBeNaN();

      // Resize edit panel via resize handle
      const editResizeHandle = editShell.querySelector(".emap-panel-resize-handle") as HTMLElement;
      expect(editResizeHandle).toBeTruthy();
      firePointer(editResizeHandle, "pointerdown", { pointerId: 112, clientX: 800, clientY: 500 });
      firePointer(editResizeHandle, "pointermove", { pointerId: 112, clientX: 850, clientY: 560 });
      firePointer(editResizeHandle, "pointerup", { pointerId: 112, clientX: 850, clientY: 560, buttons: 0 });
      const editResizedWidth = Number.parseFloat(editShell.style.width);
      const editResizedHeight = Number.parseFloat(editShell.style.height);
      expect(editResizedWidth).not.toBeNaN();
      expect(editResizedHeight).not.toBeNaN();

      // Toggle edit closed via menu button
      const editToggle = Array.from(branch.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("编辑"),
      )!;
      fireEvent.click(editToggle);
      await waitFor(() => expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id^="task-edit-"]')).toBeNull());

      // Toggle edit open again
      const editToggle2 = Array.from(branch.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("编辑"),
      )!;
      fireEvent.click(editToggle2);
      await waitFor(() => expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id^="task-edit-"]')).toBeTruthy());

      const reopenedShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="task-edit-"]') as HTMLElement;
      expect(Number.parseFloat(reopenedShell.style.left)).toBeCloseTo(draggedLeft, 1);
      expect(Number.parseFloat(reopenedShell.style.top)).toBeCloseTo(draggedTop, 1);
      expect(Number.parseFloat(reopenedShell.style.width)).toBeCloseTo(editResizedWidth, 1);
      expect(Number.parseFloat(reopenedShell.style.height)).toBeCloseTo(editResizedHeight, 1);
    });

    it("Leader chat panel preserves drag position and size after toggle close/reopen", async () => {
      setupLiveMultiTaskApi();
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(window.localStorage.getItem("ugk-team-console:canvas-ui-state:v1")).toContain('"dataSource":"live"'));

      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());

      const branch = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      )!;
      const leaderButton = Array.from(branch.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("对话 Leader"),
      )!;
      fireEvent.click(leaderButton);
      await waitFor(() => expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id^="task-leader-chat-"]')).toBeTruthy());

      const leaderShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="task-leader-chat-"]') as HTMLElement;
      expect(leaderShell).toBeTruthy();

      // Drag leader panel header
      const leaderHeader = leaderShell.querySelector(".agent-playground-branch-head") as HTMLElement;
      expect(leaderHeader).toBeTruthy();
      firePointer(leaderHeader, "pointerdown", { pointerId: 103, clientX: 600, clientY: 300 });
      firePointer(leaderHeader, "pointermove", { pointerId: 103, clientX: 680, clientY: 380 });
      firePointer(leaderHeader, "pointerup", { pointerId: 103, clientX: 680, clientY: 380, buttons: 0 });

      const draggedLeft = Number.parseFloat(leaderShell.style.left);
      const draggedTop = Number.parseFloat(leaderShell.style.top);
      expect(draggedLeft).not.toBeNaN();

      // Resize leader panel via resize handle
      const resizeHandle = leaderShell.querySelector(".emap-panel-resize-handle") as HTMLElement;
      expect(resizeHandle).toBeTruthy();
      firePointer(resizeHandle, "pointerdown", { pointerId: 104, clientX: 900, clientY: 600 });
      firePointer(resizeHandle, "pointermove", { pointerId: 104, clientX: 940, clientY: 660 });
      firePointer(resizeHandle, "pointerup", { pointerId: 104, clientX: 940, clientY: 660, buttons: 0 });
      const resizedWidth = Number.parseFloat(leaderShell.style.width);
      const resizedHeight = Number.parseFloat(leaderShell.style.height);
      expect(resizedWidth).not.toBeNaN();
      expect(resizedHeight).not.toBeNaN();

      // Toggle leader chat closed via menu button
      const leaderToggle = Array.from(branch.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("对话 Leader"),
      )!;
      fireEvent.click(leaderToggle);
      await waitFor(() => expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id^="task-leader-chat-"]')).toBeNull());

      // Toggle open again
      const leaderToggle2 = Array.from(branch.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("对话 Leader"),
      )!;
      fireEvent.click(leaderToggle2);
      await waitFor(() => expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id^="task-leader-chat-"]')).toBeTruthy());

      const reopenedShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="task-leader-chat-"]') as HTMLElement;
      expect(Number.parseFloat(reopenedShell.style.left)).toBeCloseTo(draggedLeft, 1);
      expect(Number.parseFloat(reopenedShell.style.top)).toBeCloseTo(draggedTop, 1);
      expect(Number.parseFloat(reopenedShell.style.width)).toBeCloseTo(resizedWidth, 1);
      expect(Number.parseFloat(reopenedShell.style.height)).toBeCloseTo(resizedHeight, 1);
    });

    it("Run observer preserves drag position after toggle close/reopen", async () => {
      const run: TeamRunState = {
        runId: "mrun_pos_1",
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
            activeAttemptId: "matt_pos_1",
            resultRef: null,
            errorSummary: null,
            progress: { phase: "succeeded", message: "完成", updatedAt: "2026-05-27T00:00:05.000Z" },
          },
        },
        summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
      };

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
          return new Response(JSON.stringify({ runs: [run] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/") && url.includes("/tasks/") && url.includes("/attempts")) {
          return new Response(JSON.stringify({ attempts: [] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/")) {
          if (url.includes(run.runId)) return new Response(JSON.stringify(run), { status: 200 });
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(window.localStorage.getItem("ugk-team-console:canvas-ui-state:v1")).toContain('"dataSource":"live"'));

      await waitFor(() => {
        expect(within(getAtlasNodes(container)).getByRole("button", { name: taskA.title })).toHaveAttribute("data-task-run-status", "completed");
      });
      const taskANode = within(getAtlasNodes(container)).getByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());

      const branch = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      )!;
      const runSummary = await within(branch as HTMLElement).findByRole("button", { name: /最近运行/ });
      fireEvent.click(runSummary);

      const observerShell = await waitFor(() => {
        const shell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]');
        expect(shell).toBeTruthy();
        return shell! as HTMLElement;
      });

      // Drag observer panel
      firePointer(observerShell, "pointerdown", { pointerId: 105, clientX: 600, clientY: 300 });
      firePointer(observerShell, "pointermove", { pointerId: 105, clientX: 680, clientY: 370 });
      firePointer(observerShell, "pointerup", { pointerId: 105, clientX: 680, clientY: 370, buttons: 0 });

      const draggedLeft = Number.parseFloat(observerShell.style.left);
      const draggedTop = Number.parseFloat(observerShell.style.top);
      expect(draggedLeft).not.toBeNaN();

      // Toggle observer closed via run summary
      const runSummaryAgain = within(branch as HTMLElement).getByRole("button", { name: /最近运行/ });
      fireEvent.click(runSummaryAgain);
      await waitFor(() => expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]')).toBeNull());

      // Toggle open again
      const runSummaryReopen = await within(branch as HTMLElement).findByRole("button", { name: /最近运行/ });
      fireEvent.click(runSummaryReopen);
      await waitFor(() => expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]')).toBeTruthy());

      const reopenedShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement;
      expect(Number.parseFloat(reopenedShell.style.left)).toBeCloseTo(draggedLeft, 1);
      expect(Number.parseFloat(reopenedShell.style.top)).toBeCloseTo(draggedTop, 1);
    });

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

});
