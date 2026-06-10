import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { TeamAttemptMetadata, TeamCanvasTask, TeamRunState } from "../api/team-types";
import { getAtlasNodes, firePointer } from "./app-dom-test-utils";
import { cloneTaskFixture } from "./team-task-test-fixtures";
import { makeLiveTaskRunFixture, makeLegacyAttemptFixture } from "./team-run-test-fixtures";

describe("App", () => {
  beforeEach(() => {
    resetMockTeamApiState();
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function byTaskRunsResponse(runsByTaskId: Record<string, TeamRunState[]>): Response {
    return new Response(JSON.stringify({ runsByTaskId }), { status: 200 });
  }

  function processSummaryResponse(run: TeamRunState, attempts: TeamAttemptMetadata[]): Response {
    return new Response(JSON.stringify({ run, attempts }), { status: 200 });
  }

  function rootSummaryResponse(
    tasks: TeamCanvasTask[],
    taskRunsByTaskId: Record<string, TeamRunState[]> = {},
  ): Response {
    return new Response(JSON.stringify({
      tasks,
      deletedTaskIds: [],
      taskRunsByTaskId,
      deletedRunIdsByTaskId: {},
      sourceNodes: [],
      sourceConnections: [],
      taskConnections: [],
      taskDependencies: [],
      serverVersion: {
        taskCatalog: null,
        taskRunSummary: null,
      },
    }), { status: 200 });
  }

  describe("assistantText priority in process nodes", () => {
    function makeLiveRunWithAssistantText(
      task: TeamCanvasTask,
      assistantText: { content: string; updatedAt: string } | null,
      currentAction = "执行搜索",
    ): { taskRun: TeamRunState; attempt: TeamAttemptMetadata } {
      const taskRun = makeLiveTaskRunFixture(task);
      const attempt: TeamAttemptMetadata = {
        ...makeLegacyAttemptFixture(task),
        roleProcesses: {
          worker: {
            role: "worker",
            profileId: task.workUnit.workerAgentId,
            status: "running",
            startedAt: "2026-05-25T00:00:01.000Z",
            updatedAt: "2026-05-25T00:00:05.000Z",
            finishedAt: null,
            assistantText,
            process: {
              title: "Worker 过程",
              narration: ["Worker 正在搜索"],
              currentAction,
              kind: "tool",
              isComplete: false,
              entries: [{
                id: "entry-search",
                kind: "tool",
                title: "x-search-latest started",
                detail: "正在搜索",
                createdAt: "2026-05-25T00:00:04.000Z",
                toolCallId: "tool-search",
                toolName: "x-search-latest",
              }],
            },
          },
        },
      };
      return { taskRun, attempt };
    }

    function setupLiveApi(task: TeamCanvasTask, taskRun: TeamRunState, attempt: TeamAttemptMetadata) {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [
              { agentId: "main", name: "主 Agent", description: "默认" },
              { agentId: "search", name: "搜索", description: "搜索" },
            ],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse([task], { [task.taskId]: [taskRun] });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [task] }), { status: 200 });
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({ [task.taskId]: [taskRun] });
        if (url === `/v1/team/task-runs/${taskRun.runId}?view=process-summary&taskId=${task.taskId}`) {
          return processSummaryResponse(taskRun, [attempt]);
        }
        if (url === `/v1/team/tasks/${task.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [taskRun] }), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${taskRun.runId}`) {
          return new Response(JSON.stringify(taskRun), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${taskRun.runId}/tasks/${task.taskId}/attempts`) {
          return new Response(JSON.stringify({ attempts: [attempt] }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });
    }

    async function openRunObserver(container: HTMLElement) {
      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);
      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);
      return waitFor(() => {
        const node = container.querySelector('.emap-observer-process-node[data-process-role="worker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
    }

    it("shows assistantText.content as primary display when present", async () => {
      const task = cloneTaskFixture();
      const { taskRun, attempt } = makeLiveRunWithAssistantText(
        task,
        { content: "正在分析代码库结构，准备生成实现方案。", updatedAt: "2026-05-25T00:00:05.000Z" },
      );
      setupLiveApi(task, taskRun, attempt);
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const workerNode = await openRunObserver(container);
      const assistantBlock = workerNode.querySelector(".emap-observer-process-assistant-text") as HTMLElement | null;
      expect(assistantBlock).toBeTruthy();
      expect(assistantBlock).toHaveTextContent("正在分析代码库结构");
      expect(assistantBlock).toHaveTextContent("Agent");
      expect(workerNode.querySelector(".emap-observer-process-line")).toBeNull();
    });

    it("falls back to currentAction/narration when assistantText is absent", async () => {
      const task = cloneTaskFixture();
      const { taskRun, attempt } = makeLiveRunWithAssistantText(task, null);
      setupLiveApi(task, taskRun, attempt);
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const workerNode = await openRunObserver(container);
      expect(workerNode.querySelector(".emap-observer-process-assistant-text")).toBeNull();
      const lineEl = workerNode.querySelector(".emap-observer-process-line") as HTMLElement | null;
      expect(lineEl).toBeTruthy();
      expect(lineEl).toHaveTextContent("执行搜索");
    });

    it("truncates long assistantText without blowing up the node", async () => {
      const longText = Array.from({ length: 20 }, (_, i) => `第 ${i + 1} 行内容填充文本。`).join("\n");
      const task = cloneTaskFixture();
      const { taskRun, attempt } = makeLiveRunWithAssistantText(
        task,
        { content: longText, updatedAt: "2026-05-25T00:00:05.000Z" },
      );
      setupLiveApi(task, taskRun, attempt);
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const workerNode = await openRunObserver(container);
      const assistantBlock = workerNode.querySelector(".emap-observer-process-assistant-text") as HTMLElement | null;
      expect(assistantBlock).toBeTruthy();
      const paragraphs = assistantBlock!.querySelectorAll("p");
      expect(paragraphs.length).toBeLessThanOrEqual(5);
      const truncated = assistantBlock!.querySelector(".emap-observer-process-assistant-truncated") as HTMLElement | null;
      expect(truncated).toBeTruthy();
      expect(truncated).toHaveTextContent("已隐藏");
      const style = getComputedStyle(assistantBlock!);
      expect(style.maxHeight).not.toBe("none");
    });

    it("hides tool groups alongside assistantText", async () => {
      const task = cloneTaskFixture();
      const { taskRun, attempt } = makeLiveRunWithAssistantText(
        task,
        { content: "正在执行工具调用。", updatedAt: "2026-05-25T00:00:05.000Z" },
      );
      setupLiveApi(task, taskRun, attempt);
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const workerNode = await openRunObserver(container);
      expect(workerNode.querySelector(".emap-observer-process-assistant-text")).toBeTruthy();
      expect(workerNode.querySelector(".emap-process-tool-groups")).toBeNull();
      expect(workerNode.querySelectorAll(".emap-process-tool-group")).toHaveLength(0);
      expect(workerNode).not.toHaveTextContent("x-search-latest");
      expect(workerNode).not.toHaveTextContent("正在搜索");
    });

    it("does not regress drag semantics with assistantText present", async () => {
      const task = cloneTaskFixture();
      const { taskRun, attempt } = makeLiveRunWithAssistantText(
        task,
        { content: "Agent 正在工作。", updatedAt: "2026-05-25T00:00:05.000Z" },
      );
      setupLiveApi(task, taskRun, attempt);
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const workerNode = await openRunObserver(container);
      const workerShell = workerNode.closest(".emap-task-child-branch-shell") as HTMLElement | null;
      expect(workerShell).toBeTruthy();
      const header = workerShell!.querySelector(".emap-observer-process-head") as HTMLElement | null;
      expect(header).toBeTruthy();

      const leftBefore = Number.parseFloat(workerShell!.style.left);
      const topBefore = Number.parseFloat(workerShell!.style.top);
      firePointer(header!, "pointerdown", { pointerId: 201, clientX: 300, clientY: 200 });
      firePointer(header!, "pointermove", { pointerId: 201, clientX: 360, clientY: 260 });
      firePointer(header!, "pointerup", { pointerId: 201, clientX: 360, clientY: 260, buttons: 0 });
      expect(Number.parseFloat(workerShell!.style.left)).toBeCloseTo(leftBefore + 60, 4);
      expect(Number.parseFloat(workerShell!.style.top)).toBeCloseTo(topBefore + 60, 4);
    });

    it("renders multi-line assistantText as separate paragraphs", async () => {
      const task = cloneTaskFixture();
      const { taskRun, attempt } = makeLiveRunWithAssistantText(
        task,
        { content: "第一行内容。\n第二行内容。\n第三行内容。", updatedAt: "2026-05-25T00:00:05.000Z" },
      );
      setupLiveApi(task, taskRun, attempt);
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const workerNode = await openRunObserver(container);
      const assistantBlock = workerNode.querySelector(".emap-observer-process-assistant-text") as HTMLElement | null;
      expect(assistantBlock).toBeTruthy();
      const paragraphs = assistantBlock!.querySelectorAll("p");
      expect(paragraphs.length).toBe(3);
      expect(paragraphs[0]!.textContent).toBe("第三行内容。");
      expect(paragraphs[1]!.textContent).toBe("第二行内容。");
      expect(paragraphs[2]!.textContent).toBe("第一行内容。");
      expect(assistantBlock!.querySelector(".emap-observer-process-assistant-truncated")).toBeNull();
    });

    it("splits lineless Chinese assistantText by sentence punctuation", async () => {
      const task = cloneTaskFixture();
      const { taskRun, attempt } = makeLiveRunWithAssistantText(
        task,
        { content: "已完成搜索，找到多个线索。正在整理结果；准备生成报告。", updatedAt: "2026-05-25T00:00:05.000Z" },
      );
      setupLiveApi(task, taskRun, attempt);
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const workerNode = await openRunObserver(container);
      const assistantBlock = workerNode.querySelector(".emap-observer-process-assistant-text") as HTMLElement | null;
      expect(assistantBlock).toBeTruthy();
      const paragraphs = assistantBlock!.querySelectorAll("p");
      expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    });

    it("shows truncated hint when assistantText exceeds line budget", async () => {
      const lines = Array.from({ length: 10 }, (_, i) => `行 ${i + 1} 内容`).join("\n");
      const task = cloneTaskFixture();
      const { taskRun, attempt } = makeLiveRunWithAssistantText(
        task,
        { content: lines, updatedAt: "2026-05-25T00:00:05.000Z" },
      );
      setupLiveApi(task, taskRun, attempt);
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const workerNode = await openRunObserver(container);
      const assistantBlock = workerNode.querySelector(".emap-observer-process-assistant-text") as HTMLElement | null;
      const paragraphs = assistantBlock!.querySelectorAll("p");
      expect(paragraphs.length).toBeLessThanOrEqual(5);
      expect(paragraphs[0]!.textContent).toBe("行 10 内容");
      expect(paragraphs[4]!.textContent).toBe("行 6 内容");
      const hint = assistantBlock!.querySelector(".emap-observer-process-assistant-truncated");
      expect(hint).toBeTruthy();
      expect(hint).toHaveTextContent("已隐藏");
    });

    it("does not render tool groups even when an active tool exists", async () => {
      const task = cloneTaskFixture();
      const taskRun: TeamRunState = {
        ...makeLiveTaskRunFixture(task),
        status: "running",
        finishedAt: null,
        currentTaskId: task.taskId,
        taskStates: {
          [task.taskId]: {
            status: "running",
            attemptCount: 1,
            activeAttemptId: "at-1",
            resultRef: null,
            errorSummary: null,
            progress: { phase: "worker_running", message: "Worker", updatedAt: "2026-05-25T00:00:05.000Z" },
          },
        },
        summary: { totalTasks: 1, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
      };
      const attempt: TeamAttemptMetadata = {
        ...makeLegacyAttemptFixture(task),
        status: "running",
        phase: "worker_running",
        finishedAt: null,
        roleProcesses: {
          worker: {
            role: "worker",
            profileId: task.workUnit.workerAgentId,
            status: "running",
            startedAt: "2026-05-25T00:00:01.000Z",
            updatedAt: "2026-05-25T00:00:05.000Z",
            finishedAt: null,
            process: {
              title: "Worker 过程",
              narration: ["正在执行"],
              currentAction: "执行中",
              kind: "tool",
              isComplete: false,
              entries: [
                { id: "e1", kind: "tool", title: "read started", detail: "d1", createdAt: "2026-05-25T00:00:02.000Z", toolCallId: "tool-read", toolName: "read" },
                { id: "e2", kind: "ok", title: "read finished", detail: "d2", createdAt: "2026-05-25T00:00:03.000Z", toolCallId: "tool-read", toolName: "read" },
                { id: "e3", kind: "tool", title: "search started", detail: "d3", createdAt: "2026-05-25T00:00:04.000Z", toolCallId: "tool-search", toolName: "x-search" },
              ],
            },
          },
        },
      };
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [{ agentId: "main", name: "主 Agent", description: "默认" }, { agentId: "search", name: "搜索", description: "搜索" }] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse([task], { [task.taskId]: [taskRun] });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [task] }), { status: 200 });
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({ [task.taskId]: [taskRun] });
        if (url === `/v1/team/task-runs/${taskRun.runId}?view=process-summary&taskId=${task.taskId}`) return processSummaryResponse(taskRun, [attempt]);
        if (url === `/v1/team/tasks/${task.taskId}/runs`) return new Response(JSON.stringify({ runs: [taskRun] }), { status: 200 });
        if (url === `/v1/team/task-runs/${taskRun.runId}`) return new Response(JSON.stringify(taskRun), { status: 200 });
        if (url === `/v1/team/task-runs/${taskRun.runId}/tasks/${task.taskId}/attempts`) return new Response(JSON.stringify({ attempts: [attempt] }), { status: 200 });
        return new Response(JSON.stringify({}), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);
      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      const runSummary = await within(branch!).findByRole("button", { name: /运行中[\s\S]*执行中/ });
      fireEvent.click(runSummary);

      const workerNode = await waitFor(() => {
        const node = container.querySelector('.emap-observer-process-node[data-process-role="worker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      expect(workerNode.querySelector(".emap-process-tool-groups")).toBeNull();
      expect(workerNode.querySelector(".emap-process-budget-note")).toBeNull();
      expect(workerNode.querySelectorAll(".emap-process-tool-group")).toHaveLength(0);
      expect(workerNode).not.toHaveTextContent("x-search");
      expect(workerNode).not.toHaveTextContent("d3");
    });

    it("truncates long punctuationless text and shows truncated hint", async () => {
      const longText = "A".repeat(8000);
      const task = cloneTaskFixture();
      const { taskRun, attempt } = makeLiveRunWithAssistantText(
        task,
        { content: longText, updatedAt: "2026-05-25T00:00:05.000Z" },
      );
      setupLiveApi(task, taskRun, attempt);
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const workerNode = await openRunObserver(container);
      const assistantBlock = workerNode.querySelector(".emap-observer-process-assistant-text") as HTMLElement | null;
      expect(assistantBlock).toBeTruthy();
      const paragraph = assistantBlock!.querySelector("p") as HTMLElement | null;
      expect(paragraph).toBeTruthy();
      expect(paragraph!.textContent!.length).toBeLessThanOrEqual(203);
      expect(paragraph!.textContent!.endsWith("...")).toBe(true);
      const hint = assistantBlock!.querySelector(".emap-observer-process-assistant-truncated");
      expect(hint).toBeTruthy();
      expect(hint).toHaveTextContent("已截断");
    });
  });

  describe("task run concurrency scope", () => {
    const taskA: TeamCanvasTask = {
      ...cloneTaskFixture(),
      taskId: "task_concurrency_a",
      title: "并行 Task A",
    };
    const taskB: TeamCanvasTask = {
      ...cloneTaskFixture(),
      taskId: "task_concurrency_b",
      title: "并行 Task B",
    };

    function makeActiveRun(task: TeamCanvasTask, runId: string): TeamRunState {
      return {
        runId,
        planId: `canvas_task_${task.taskId}`,
        source: { type: "canvas-task", taskId: task.taskId },
        teamUnitId: `canvas_task_unit_${task.taskId}`,
        status: "running",
        createdAt: "2026-05-27T00:00:00.000Z",
        startedAt: "2026-05-27T00:00:01.000Z",
        finishedAt: null,
        currentTaskId: task.taskId,
        taskStates: {
          [task.taskId]: {
            status: "running",
            attemptCount: 1,
            activeAttemptId: `attempt_${task.taskId}_1`,
            resultRef: null,
            errorSummary: null,
            progress: { phase: "running", message: "执行中", updatedAt: "2026-05-27T00:00:02.000Z" },
          },
        },
        summary: { totalTasks: 1, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
      };
    }

    it("allows Task B to start a run while Task A has an active run", async () => {
      const runA = makeActiveRun(taskA, "run_concurrency_a_1");
      let createRunRequestsByTask: Record<string, number> = {};

      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [
              { agentId: "main", name: "主 Agent", description: "默认综合 agent" },
              { agentId: "search", name: "搜索 Agent", description: "搜索" },
            ],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") {
          return rootSummaryResponse([taskA, taskB], { [taskA.taskId]: [runA], [taskB.taskId]: [] });
        }
        if (url === "/v1/team/tasks" && method === "GET") {
          return new Response(JSON.stringify({ tasks: [taskA, taskB] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) {
          return byTaskRunsResponse({ [taskA.taskId]: [runA], [taskB.taskId]: [] });
        }
        if (url === `/v1/team/tasks/${taskA.taskId}/runs` && method === "GET") {
          return new Response(JSON.stringify({ runs: [runA] }), { status: 200 });
        }
        if (url === `/v1/team/tasks/${taskB.taskId}/runs` && method === "GET") {
          return new Response(JSON.stringify({ runs: [] }), { status: 200 });
        }
        if (url === `/v1/team/tasks/${taskA.taskId}/runs` && method === "POST") {
          createRunRequestsByTask[taskA.taskId] = (createRunRequestsByTask[taskA.taskId] ?? 0) + 1;
          return new Response(JSON.stringify(runA), { status: 201 });
        }
        if (url === `/v1/team/tasks/${taskB.taskId}/runs` && method === "POST") {
          createRunRequestsByTask[taskB.taskId] = (createRunRequestsByTask[taskB.taskId] ?? 0) + 1;
          const runB = {
            ...runA,
            runId: "run_concurrency_b_1",
            source: { type: "canvas-task", taskId: taskB.taskId },
          };
          return new Response(JSON.stringify(runB), { status: 201 });
        }
        if (url.startsWith("/v1/team/task-runs/")) {
          if (url.includes(runA.runId)) return new Response(JSON.stringify(runA), { status: 200 });
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      // Open Task A menu — run button should be disabled with "运行中" text
      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      const branchA = await waitFor(() => {
        const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
        expect(branch).toBeTruthy();
        return branch!;
      });
      const runButtonA = branchA!.querySelector(".task-action-menu-button") as HTMLButtonElement | null;
      expect(runButtonA).toBeTruthy();
      expect(runButtonA!.textContent).toContain("运行中");
      expect(runButtonA!.disabled).toBe(true);
      expect(branchA!.querySelector('.task-action-menu-button:not([disabled])')).toBeTruthy();

      // Open Task B menu — run button should be enabled, NOT disabled by Task A's active run
      const taskBNode = within(getAtlasNodes(container)).getByRole("button", { name: taskB.title });
      fireEvent.click(taskBNode);

      // There are now two task-action-branch elements; find the one for Task B
      const branchB = await waitFor(() => {
        const allBranches = container.querySelectorAll(".task-action-branch");
        const branch = Array.from(allBranches).find((el) => el.textContent?.includes(taskB.taskId)) as HTMLElement | null;
        expect(branch).toBeTruthy();
        return branch!;
      });
      const runButtonB = branchB!.querySelector(".task-action-menu-button") as HTMLButtonElement | null;
      expect(runButtonB).toBeTruthy();
      expect(runButtonB!.textContent).toContain("运行");
      expect(runButtonB!.disabled).toBe(false);

      // Click Task B's run button — should call POST for Task B
      fireEvent.click(runButtonB!);
      await waitFor(() => expect(createRunRequestsByTask[taskB.taskId]).toBe(1));

      // Task A should NOT have a create-run request
      expect(createRunRequestsByTask[taskA.taskId] ?? 0).toBe(0);
    });

    it("disables the run button for a Task that already has an active run", async () => {
      const runA = makeActiveRun(taskA, "run_concurrency_a_dup");
      let pollRequests = 0;

      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [
              { agentId: "main", name: "主 Agent", description: "默认综合 agent" },
              { agentId: "search", name: "搜索 Agent", description: "搜索" },
            ],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse([taskA], { [taskA.taskId]: [runA] });
        if (url === "/v1/team/tasks" && method === "GET") {
          return new Response(JSON.stringify({ tasks: [taskA] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({ [taskA.taskId]: [runA] });
        if (url === `/v1/team/tasks/${taskA.taskId}/runs` && method === "GET") {
          return new Response(JSON.stringify({ runs: [runA] }), { status: 200 });
        }
        if (url === `/v1/team/tasks/${taskA.taskId}/runs` && method === "POST") {
          return new Response(JSON.stringify(runA), { status: 201 });
        }
        if (url.startsWith("/v1/team/task-runs/") && url.includes(runA.runId)) {
          pollRequests += 1;
          return new Response(JSON.stringify(runA), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();

      // Run button (first .task-action-menu-button) shows "运行中" and is disabled
      const runButton = branch!.querySelector(".task-action-menu-button") as HTMLButtonElement | null;
      expect(runButton).toBeTruthy();
      expect(runButton!.textContent).toContain("运行中");
      expect(runButton!.disabled).toBe(true);

      // Stop button is present for the active run and enabled
      const stopButtons = branch!.querySelectorAll('.task-action-menu-button:not([disabled])');
      const stopButton = Array.from(stopButtons).find((btn) => btn.textContent === "停止");
      expect(stopButton).toBeTruthy();

      // Wait for active run polling to complete so React settles before test teardown
      await waitFor(() => expect(pollRequests).toBeGreaterThan(0));
    });

    it("polls both active runs independently by runId", async () => {
      const runA = makeActiveRun(taskA, "run_poll_a");
      const runB = makeActiveRun(taskB, "run_poll_b");
      const polledRunIds: string[] = [];

      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [
              { agentId: "main", name: "主 Agent", description: "默认综合 agent" },
              { agentId: "search", name: "搜索 Agent", description: "搜索" },
            ],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") {
          return rootSummaryResponse([taskA, taskB], { [taskA.taskId]: [runA], [taskB.taskId]: [runB] });
        }
        if (url === "/v1/team/tasks") {
          return new Response(JSON.stringify({ tasks: [taskA, taskB] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) {
          return byTaskRunsResponse({ [taskA.taskId]: [runA], [taskB.taskId]: [runB] });
        }
        if (url === `/v1/team/tasks/${taskA.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [runA] }), { status: 200 });
        }
        if (url === `/v1/team/tasks/${taskB.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [runB] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/")) {
          const runId = url.replace("/v1/team/task-runs/", "").split(/[/?]/)[0]!;
          polledRunIds.push(runId);
          if (runId === runA.runId) return new Response(JSON.stringify(runA), { status: 200 });
          if (runId === runB.runId) return new Response(JSON.stringify(runB), { status: 200 });
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      // Wait for initial data load
      await screen.findByText("并行 Task A");

      // Wait for at least one polling cycle to hit both run IDs
      await waitFor(() => {
        expect(polledRunIds).toContain(runA.runId);
        expect(polledRunIds).toContain(runB.runId);
      }, { timeout: 5000 });
    });
  });
});
