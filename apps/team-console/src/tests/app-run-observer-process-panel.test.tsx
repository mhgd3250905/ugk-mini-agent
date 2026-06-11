import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { TeamAttemptMetadata, TeamRunState } from "../api/team-types";
import { getAtlasNodes } from "./app-dom-test-utils";
import { cloneTaskFixture } from "./team-task-test-fixtures";
import { makeLiveTaskRunFixture, makeLegacyAttemptFixture } from "./team-run-test-fixtures";

describe("App run observer process panel", () => {
  beforeEach(() => {
    resetMockTeamApiState();
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
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

    it("starts a mock Task run from the action menu and shows the latest run state", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      const runButton = within(branch!).getByRole("button", { name: "运行" });
      expect(runButton).toBeEnabled();
      fireEvent.click(runButton);

      expect(await within(branch!).findByText("最近运行")).toBeInTheDocument();
      expect(within(branch!).getByText("已完成")).toBeInTheDocument();
      expect(within(branch!).getByRole("button", { name: "重新运行" })).toBeEnabled();
      expect(container.querySelector("iframe")).toBeNull();
    });

    it("opens node-based Task run observer with run status in the Task menu, file nodes, and file detail", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      expect(runSummary).toHaveTextContent("已完成");
      expect(runSummary).toHaveTextContent("阶段");
      expect(runSummary).toHaveTextContent("succeeded");
      expect(runSummary).toHaveTextContent(/耗时(?:0ms|4秒)/);
      expect(runSummary).toHaveTextContent("Attempts");
      expect(runSummary).toHaveTextContent("1");
      expect(runSummary).toHaveTextContent("已通过");
      expect(runSummary).toHaveTextContent("收起输出");
      expect(container.querySelector(".emap-observer-status-node")).toBeNull();

      await waitFor(() => {
        const workerProcessNode = container.querySelector('.emap-observer-process-node[data-process-role="worker"]');
        expect(workerProcessNode).toBeTruthy();
      });

      const workerFileRow = await waitFor(() => {
        const node = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      const checkerFileRow = container.querySelector('.emap-observer-file-row[data-file-kind="checker"]') as HTMLElement | null;
      const resultFileRow = container.querySelector('.emap-observer-file-row[data-file-kind="result"]') as HTMLElement | null;
      expect(checkerFileRow).toBeTruthy();
      expect(resultFileRow).toBeTruthy();
      expect(within(workerFileRow).getByText("worker-output-001.md")).toBeInTheDocument();
      expect(within(checkerFileRow!).getByText("checker-verdict-001.json")).toBeInTheDocument();
      expect(within(resultFileRow!).getByText("accepted-result.md")).toBeInTheDocument();

      // All file rows live inside the merged observer panel (not independent shells)
      const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement | null;
      expect(observerShell).toBeTruthy();
      const fileRows = observerShell!.querySelectorAll('.emap-observer-file-row');
      expect(fileRows.length).toBeGreaterThanOrEqual(3);

      // No independent file-node or process shells exist
      expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id^="file-"]')).toBeNull();
      expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id="process-worker"]')).toBeNull();
      expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id="process-checker"]')).toBeNull();

      expect(container.querySelector(".emap-observer-file-detail-node")).toBeNull();

      fireEvent.click(checkerFileRow!);
      const detailNode = await waitFor(() => {
        const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
        expect(detail).toBeTruthy();
        return detail!;
      });
      expect(within(detailNode).getByText(/"verdict": "pass"/)).toBeInTheDocument();

      const detailCloseButton = detailNode.querySelector(".emap-observer-node-close") as HTMLElement | null;
      expect(detailCloseButton).toBeTruthy();

      // File detail opens to the observer's right side.
      const detailShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="file-detail-"]') as HTMLElement | undefined;
      expect(detailShell).toBeTruthy();
      expect(Number.parseFloat(detailShell!.style.left)).toBeGreaterThan(Number.parseFloat(observerShell!.style.left));

      fireEvent.click(resultFileRow!);
      const details = await waitFor(() => {
        const nodes = Array.from(container.querySelectorAll(".emap-observer-file-detail-node")) as HTMLElement[];
        expect(nodes).toHaveLength(2);
        return nodes;
      });
      expect(details.some((detail) => detail.textContent?.includes('"verdict": "pass"'))).toBe(true);
      const resultDetail = details.find((detail) => detail.textContent?.includes("Mock accepted result"));
      expect(resultDetail).toBeTruthy();
      expect(resultDetail!.querySelector('pre[data-file-format="json"]')).toBeNull();
    });

    it("renders Worker and Checker process nodes inside the merged run observer panel", async () => {
      const { container } = render(<App />);

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      const workerProcessNode = await waitFor(() => {
        const node = container.querySelector('.emap-observer-process-node[data-process-role="worker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      const checkerProcessNode = container.querySelector('.emap-observer-process-node[data-process-role="checker"]') as HTMLElement | null;
      expect(checkerProcessNode).toBeTruthy();

      // Both process nodes live inside the merged observer panel
      const observerShell = container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]') as HTMLElement | null;
      expect(observerShell).toBeTruthy();
      expect(observerShell!.contains(workerProcessNode)).toBe(true);
      expect(observerShell!.contains(checkerProcessNode!)).toBe(true);

      // No independent process shells exist
      expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id="process-worker"]')).toBeNull();
      expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id="process-checker"]')).toBeNull();

      expect(within(workerProcessNode).getByText("Worker 过程")).toBeInTheDocument();
      expect(within(workerProcessNode).getByText("成功")).toBeInTheDocument();
      expect(workerProcessNode.querySelector(".emap-observer-process-assistant-text")).toHaveTextContent("已完成云资产搜索");
      expect(within(workerProcessNode).queryByText("整理云资产证据")).toBeNull();

      expect(within(checkerProcessNode!).getByText("Checker 过程")).toBeInTheDocument();
      expect(within(checkerProcessNode!).getByText("成功")).toBeInTheDocument();
      expect(checkerProcessNode!.querySelector(".emap-observer-process-assistant-text")).toHaveTextContent("已审阅 Worker 提交的资产调查结果");
      expect(within(checkerProcessNode!).queryByText("复核输出契约")).toBeNull();
    });

    it("loads process data for every open Task run observer branch", async () => {
      const taskA = {
        ...cloneTaskFixture(),
        taskId: "task_observer_a",
        title: "Observer A Task",
        workUnit: { ...cloneTaskFixture().workUnit, title: "Observer A Task" },
      };
      const taskB = {
        ...cloneTaskFixture(),
        taskId: "task_observer_b",
        title: "Observer B Task",
        workUnit: { ...cloneTaskFixture().workUnit, title: "Observer B Task" },
      };
      const runA = makeLiveTaskRunFixture(taskA, "run_observer_a");
      const runB = makeLiveTaskRunFixture(taskB, "run_observer_b");
      const attemptA: TeamAttemptMetadata = {
        ...makeLegacyAttemptFixture(taskA),
        attemptId: "attempt_observer_a",
        resultRef: `tasks/${taskA.taskId}/attempts/attempt_observer_a/accepted-result-a.md`,
        files: ["accepted-result-a.md"],
        roleProcesses: {
          worker: {
            role: "worker",
            profileId: "main",
            status: "succeeded",
            startedAt: "2026-05-25T00:00:01.000Z",
            updatedAt: "2026-05-25T00:00:05.000Z",
            finishedAt: "2026-05-25T00:00:05.000Z",
            assistantText: { content: "A branch worker process loaded", updatedAt: "2026-05-25T00:00:05.000Z" },
            process: {
              title: "Worker",
              narration: ["A branch narration"],
              currentAction: "A branch action",
              isComplete: true,
              entries: [],
            },
          },
        },
      };
      const attemptB: TeamAttemptMetadata = {
        ...makeLegacyAttemptFixture(taskB),
        attemptId: "attempt_observer_b",
        roleProcesses: {
          worker: {
            role: "worker",
            profileId: "main",
            status: "succeeded",
            startedAt: "2026-05-25T00:00:01.000Z",
            updatedAt: "2026-05-25T00:00:05.000Z",
            finishedAt: "2026-05-25T00:00:05.000Z",
            assistantText: { content: "B branch worker process loaded", updatedAt: "2026-05-25T00:00:05.000Z" },
            process: {
              title: "Worker",
              narration: ["B branch narration"],
              currentAction: "B branch action",
              isComplete: true,
              entries: [],
            },
          },
        },
      };
      let acceptedResultFileCalls = 0;
      let resolveAcceptedResultFile: ((response: Response) => void) | null = null;
      const acceptedResultFile = new Promise<Response>((resolve) => {
        resolveAcceptedResultFile = resolve;
      });

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
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [taskA, taskB] }), { status: 200 });
        if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        if (url === "/v1/team/task-dependencies") return new Response(JSON.stringify({ dependencies: [] }), { status: 200 });
        if (url === "/v1/team/source-nodes") return new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 });
        if (url === "/v1/team/source-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        if (url.startsWith("/v1/team/task-runs/by-task?")) {
          return byTaskRunsResponse({ [taskA.taskId]: [runA], [taskB.taskId]: [runB] });
        }
        if (url === `/v1/team/tasks/${taskA.taskId}/runs`) return new Response(JSON.stringify({ runs: [runA] }), { status: 200 });
        if (url === `/v1/team/tasks/${taskB.taskId}/runs`) return new Response(JSON.stringify({ runs: [runB] }), { status: 200 });
        if (url === `/v1/team/task-runs/${runA.runId}`) return new Response(JSON.stringify(runA), { status: 200 });
        if (url === `/v1/team/task-runs/${runB.runId}`) return new Response(JSON.stringify(runB), { status: 200 });
        if (url === `/v1/team/task-runs/${runA.runId}/tasks/${taskA.taskId}/attempts`) {
          return new Response(JSON.stringify({ attempts: [attemptA] }), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${runB.runId}/tasks/${taskB.taskId}/attempts`) {
          return new Response(JSON.stringify({ attempts: [attemptB] }), { status: 200 });
        }
        if (url.endsWith("/files/accepted-result-a.md")) {
          acceptedResultFileCalls += 1;
          if (acceptedResultFileCalls === 1) return acceptedResultFile;
          return new Promise<Response>(() => {});
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      const branchA = await waitFor(() => {
        const branch = Array.from(container.querySelectorAll(".task-action-branch")).find(
          (el) => el.textContent?.includes(taskA.taskId),
        ) as HTMLElement | undefined;
        expect(branch).toBeTruthy();
        return branch!;
      });
      fireEvent.click(await within(branchA).findByRole("button", { name: /最近运行/ }));

      const resultFileRow = await waitFor(() => {
        const node = container.querySelector('.emap-observer-file-row[data-file-kind="result"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        expect(acceptedResultFileCalls).toBe(1);
        return node!;
      });

      const taskBNode = await within(getAtlasNodes(container)).findByRole("button", { name: taskB.title });
      fireEvent.click(taskBNode);
      const branchB = await waitFor(() => {
        const branch = Array.from(container.querySelectorAll(".task-action-branch")).find(
          (el) => el.textContent?.includes(taskB.taskId),
        ) as HTMLElement | undefined;
        expect(branch).toBeTruthy();
        return branch!;
      });
      fireEvent.click(await within(branchB).findByRole("button", { name: /最近运行/ }));

      await waitFor(() => {
        const observerShells = Array.from(container.querySelectorAll('.emap-task-child-branch-shell[data-panel-id^="run-observer"]')) as HTMLElement[];
        expect(observerShells).toHaveLength(2);
        expect(observerShells.some((shell) => shell.textContent?.includes("A branch worker process loaded"))).toBe(true);
        expect(observerShells.some((shell) => shell.textContent?.includes("B branch worker process loaded"))).toBe(true);
      });

      fireEvent.click(resultFileRow);
      await waitFor(() => {
        expect(acceptedResultFileCalls).toBe(1);
        expect(container.querySelector(".emap-observer-file-detail-node")).toHaveTextContent("正在读取文件");
      });
      await act(async () => {
        resolveAcceptedResultFile?.(new Response("# A accepted result", { status: 200 }));
        await acceptedResultFile;
      });

      await waitFor(() => {
        const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
        expect(detail).toBeTruthy();
        expect(detail).toHaveTextContent("A accepted result");
      });
    });

    it("refreshes process summary only for expanded active run observers", async () => {
      const taskA = {
        ...cloneTaskFixture(),
        taskId: "task_process_summary_a",
        title: "Process Summary A",
        workUnit: { ...cloneTaskFixture().workUnit, title: "Process Summary A" },
      };
      const taskB = {
        ...cloneTaskFixture(),
        taskId: "task_process_summary_b",
        title: "Process Summary B",
        workUnit: { ...cloneTaskFixture().workUnit, title: "Process Summary B" },
      };
      const taskC = {
        ...cloneTaskFixture(),
        taskId: "task_process_summary_c",
        title: "Process Summary C",
        workUnit: { ...cloneTaskFixture().workUnit, title: "Process Summary C" },
      };
      const runA = { ...makeLiveTaskRunFixture(taskA, "run_process_summary_a"), status: "running" as const, finishedAt: null };
      const runB = { ...makeLiveTaskRunFixture(taskB, "run_process_summary_b"), status: "running" as const, finishedAt: null };
      const runC = { ...makeLiveTaskRunFixture(taskC, "run_process_summary_c"), status: "running" as const, finishedAt: null };
      const attemptA: TeamAttemptMetadata = {
        ...makeLegacyAttemptFixture(taskA),
        roleProcesses: {
          worker: {
            role: "worker",
            profileId: "main",
            status: "running",
            startedAt: "2026-05-25T00:00:01.000Z",
            updatedAt: "2026-05-25T00:00:05.000Z",
            finishedAt: null,
            assistantText: { content: "A process summary loaded", updatedAt: "2026-05-25T00:00:05.000Z" },
            process: { title: "Worker", narration: [], currentAction: "A action", isComplete: false, entries: [] },
          },
        },
      };
      const attemptB: TeamAttemptMetadata = {
        ...makeLegacyAttemptFixture(taskB),
        roleProcesses: {
          worker: {
            role: "worker",
            profileId: "main",
            status: "running",
            startedAt: "2026-05-25T00:00:01.000Z",
            updatedAt: "2026-05-25T00:00:05.000Z",
            finishedAt: null,
            assistantText: { content: "B process summary loaded", updatedAt: "2026-05-25T00:00:05.000Z" },
            process: { title: "Worker", narration: [], currentAction: "B action", isComplete: false, entries: [] },
          },
        },
      };
      const runsByTaskId = {
        [taskA.taskId]: [runA],
        [taskB.taskId]: [runB],
        [taskC.taskId]: [runC],
      };
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
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [taskA, taskB, taskC] }), { status: 200 });
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse(runsByTaskId);
        if (url === `/v1/team/task-runs/${runA.runId}?view=summary&taskId=${taskA.taskId}`) return new Response(JSON.stringify(runA), { status: 200 });
        if (url === `/v1/team/task-runs/${runB.runId}?view=summary&taskId=${taskB.taskId}`) return new Response(JSON.stringify(runB), { status: 200 });
        if (url === `/v1/team/task-runs/${runC.runId}?view=summary&taskId=${taskC.taskId}`) return new Response(JSON.stringify(runC), { status: 200 });
        if (url === `/v1/team/task-runs/${runA.runId}?view=process-summary&taskId=${taskA.taskId}`) return processSummaryResponse(runA, [attemptA]);
        if (url === `/v1/team/task-runs/${runB.runId}?view=process-summary&taskId=${taskB.taskId}`) return processSummaryResponse(runB, [attemptB]);
        return new Response(JSON.stringify({}), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
      fireEvent.click(await within(atlas).findByRole("button", { name: taskA.title }));
      let branchA = await waitFor(() => {
        const branch = Array.from(container.querySelectorAll(".task-action-branch")).find(
          (el) => el.textContent?.includes(taskA.taskId),
        ) as HTMLElement | undefined;
        expect(branch).toBeTruthy();
        return branch!;
      });
      fireEvent.click(await within(branchA).findByRole("button", { name: /运行中[\s\S]*执行中/ }));

      fireEvent.click(await within(atlas).findByRole("button", { name: taskB.title }));
      const branchB = await waitFor(() => {
        const branch = Array.from(container.querySelectorAll(".task-action-branch")).find(
          (el) => el.textContent?.includes(taskB.taskId),
        ) as HTMLElement | undefined;
        expect(branch).toBeTruthy();
        return branch!;
      });
      fireEvent.click(await within(branchB).findByRole("button", { name: /运行中[\s\S]*执行中/ }));

      await waitFor(() => {
        const observerShells = Array.from(container.querySelectorAll('.emap-task-child-branch-shell[data-panel-id^="run-observer"]')) as HTMLElement[];
        expect(observerShells).toHaveLength(2);
        expect(observerShells.some((shell) => shell.textContent?.includes("A process summary loaded"))).toBe(true);
        expect(observerShells.some((shell) => shell.textContent?.includes("B process summary loaded"))).toBe(true);
      });

      const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
      expect(urls.filter((url) => url.includes("view=process-summary"))).toEqual([
        `/v1/team/task-runs/${runA.runId}?view=process-summary&taskId=${taskA.taskId}`,
        `/v1/team/task-runs/${runB.runId}?view=process-summary&taskId=${taskB.taskId}`,
      ]);
      expect(urls.some((url) => url === `/v1/team/task-runs/${runC.runId}?view=process-summary&taskId=${taskC.taskId}`)).toBe(false);
      expect(urls.some((url) => /^\/v1\/team\/task-runs\/run_process_summary_[abc]$/.test(url))).toBe(false);
      expect(urls.some((url) => url.includes("/attempts"))).toBe(false);
    });

    it("keeps the Task run observer usable when legacy attempts have no roleProcesses", async () => {
      const task = cloneTaskFixture();
      const taskRun = makeLiveTaskRunFixture(task);
      const legacyAttempt = makeLegacyAttemptFixture(task);
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
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [task] }), { status: 200 });
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({ [task.taskId]: [taskRun] });
        if (url === `/v1/team/tasks/${task.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [taskRun] }), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${taskRun.runId}`) {
          return new Response(JSON.stringify(taskRun), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${taskRun.runId}/tasks/${task.taskId}/attempts`) {
          return new Response(JSON.stringify({ attempts: [legacyAttempt] }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      let branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      await waitFor(() => {
        branch = container.querySelector(".task-action-branch") as HTMLElement | null;
        expect(branch).toBeTruthy();
      });
      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
      });
      const workerProcessNode = container.querySelector('.emap-observer-process-node[data-process-role="worker"]') as HTMLElement | null;
      const checkerProcessNode = container.querySelector('.emap-observer-process-node[data-process-role="checker"]') as HTMLElement | null;
      expect(workerProcessNode).toBeTruthy();
      expect(checkerProcessNode).toBeTruthy();
      expect(within(workerProcessNode!).getByText("Worker 过程")).toBeInTheDocument();
      expect(within(checkerProcessNode!).getByText("Checker 过程")).toBeInTheDocument();
      expect(workerProcessNode).toHaveTextContent("等待过程数据");
      expect(checkerProcessNode).toHaveTextContent("等待过程数据");
      expect(workerProcessNode).toHaveTextContent("暂无过程条目");
      expect(checkerProcessNode).toHaveTextContent("暂无过程条目");
    });

    it("does not flash empty file or transient server error nodes during an active Task run observer poll", async () => {
      const task = cloneTaskFixture();
      const taskRun = makeLiveTaskRunFixture(task, "active-task-run-1");
      const activeRun: TeamRunState = {
        ...taskRun,
        status: "running",
        finishedAt: null,
        currentTaskId: task.taskId,
        taskStates: {
          [task.taskId]: {
            ...taskRun.taskStates[task.taskId]!,
            status: "running",
            progress: {
              phase: "worker_running",
              message: "正在执行",
              updatedAt: "2026-05-25T00:00:03.000Z",
            },
          },
        },
      };
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
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [task] }), { status: 200 });
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({ [task.taskId]: [activeRun] });
        if (url === `/v1/team/tasks/${task.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [activeRun] }), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${activeRun.runId}`) {
          throw new TypeError("Failed to fetch");
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = await waitFor(() => {
        const node = container.querySelector(".task-action-branch") as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      const runSummary = await within(branch).findByRole("button", { name: /运行中[\s\S]*执行中/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector(".task-run-summary")).toHaveTextContent("正在执行");
      });
      expect(screen.queryByText("无法连接服务器")).toBeNull();
      expect(screen.queryByText("暂无 attempt 文件。运行刚启动时这里会随轮询补齐。")).toBeNull();
      expect(container.querySelector(".emap-observer-empty")).toBeNull();
      expect(container.querySelector(".emap-observer-file-empty")).toBeNull();
      expect(container.querySelector('[data-observer-section="worker-files"]')).toBeEmptyDOMElement();
      expect(container.querySelector('[data-observer-section="checker-files"]')).toBeEmptyDOMElement();
      expect(container.querySelector('[data-observer-section="result-files"]')).toBeEmptyDOMElement();
    });

    it("describes terminal run observers with no attempt files without implying polling will fill them", async () => {
      const task = cloneTaskFixture();
      const taskRun = makeLiveTaskRunFixture(task, "terminal-empty-files-run");
      const attempt: TeamAttemptMetadata = {
        ...makeLegacyAttemptFixture(task),
        status: "failed",
        phase: "failed",
        files: [],
        errorSummary: "worker failed before writing output",
      };
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
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [task] }), { status: 200 });
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({ [task.taskId]: [taskRun] });
        if (url === `/v1/team/tasks/${task.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [taskRun] }), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${taskRun.runId}/tasks/${task.taskId}/attempts`) {
          return new Response(JSON.stringify({ attempts: [attempt] }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = await waitFor(() => {
        const node = container.querySelector(".task-action-branch") as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      const runSummary = await within(branch).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      expect(await screen.findByText("该 attempt 未产生可展示文件。请查看 Worker / Checker 过程或错误摘要。")).toBeInTheDocument();
      expect(screen.queryByText("暂无 attempt 文件。运行刚启动时这里会随轮询补齐。")).toBeNull();
    });

    it("does not render volatile refresh metadata in an active Task run observer", async () => {
      const task = cloneTaskFixture();
      const taskRun = makeLiveTaskRunFixture(task, "active-task-run-2");
      const activeRun: TeamRunState = {
        ...taskRun,
        status: "running",
        finishedAt: null,
        currentTaskId: task.taskId,
        taskStates: {
          [task.taskId]: {
            ...taskRun.taskStates[task.taskId]!,
            status: "running",
            progress: {
              phase: "worker_running",
              message: "正在执行",
              updatedAt: "2026-05-25T00:00:03.000Z",
            },
          },
        },
      };
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
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [task] }), { status: 200 });
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({ [task.taskId]: [activeRun] });
        if (url === `/v1/team/tasks/${task.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [activeRun] }), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${activeRun.runId}`) {
          return new Response(JSON.stringify(activeRun), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${activeRun.runId}/tasks/${task.taskId}/attempts`) {
          return new Response(JSON.stringify({ attempts: [] }), { status: 200 });
        }
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

      await waitFor(() => {
        expect(container.querySelector(".task-run-summary")).toHaveTextContent("正在执行");
      });
      expect(screen.queryByText("正在刷新...")).toBeNull();
      expect(screen.queryByText(/最后刷新/)).toBeNull();
    });


});
