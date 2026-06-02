import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { mockTeamTasks, resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { AgentChatProcessEntry, TeamAttemptMetadata, TeamRunState } from "../api/team-types";
import { getAtlasNodes, firePointer } from "./app-dom-test-utils";
import { cloneTaskFixture } from "./team-task-test-fixtures";
import { makeLiveTaskRunFixture, makeLegacyAttemptFixture } from "./team-run-test-fixtures";

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

  function byTaskRunsResponse(runsByTaskId: Record<string, TeamRunState[]>): Response {
    return new Response(JSON.stringify({ runsByTaskId }), { status: 200 });
  }

  describe("run observer", () => {
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
          if (acceptedResultFileCalls === 2) return acceptedResultFile;
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
        expect(acceptedResultFileCalls).toBe(2);
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

    it("hides process tool entries and keeps only the role summary visible", async () => {
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
      expect(workerProcessNode.querySelector(".emap-observer-process-top")).toBeTruthy();
      expect(workerProcessNode.querySelector(".emap-process-tool-groups")).toBeNull();
      expect(workerProcessNode.querySelector(".emap-process-budget-note")).toBeNull();
      expect(workerProcessNode.querySelectorAll(".emap-process-tool-group")).toHaveLength(0);
      expect(workerProcessNode).not.toHaveTextContent("x-search-latest");
      expect(workerProcessNode).not.toHaveTextContent("找到官网、云平台和公开登录入口线索");
    });

    it("keeps large role process histories out of the DOM while retaining the summary", async () => {
      const task = cloneTaskFixture();
      const taskRun = makeLiveTaskRunFixture(task);
      const oldToolEntries: AgentChatProcessEntry[] = Array.from({ length: 12 }, (_, index) => {
        const number = String(index + 1).padStart(2, "0");
        return {
          id: `bulk-tool-${number}`,
          kind: "ok",
          title: `bulk tool ${number} finished`,
          detail: `bulk group ${number} detail`,
          createdAt: `2026-05-25T00:00:${number}.000Z`,
          toolCallId: `tool-bulk-${number}`,
          toolName: `bulk-tool-${number}`,
        };
      });
      const deepToolEntries: AgentChatProcessEntry[] = Array.from({ length: 20 }, (_, index) => {
        const number = String(index + 1).padStart(2, "0");
        return {
          id: `deep-entry-${number}`,
          kind: index === 19 ? "ok" : "tool",
          title: `deep entry ${number}`,
          detail: `deep detail ${number}`,
          createdAt: `2026-05-25T00:01:${number}.000Z`,
          toolCallId: "tool-bulk-deep",
          toolName: "bulk-deep-tool",
        };
      });
      const attempt: TeamAttemptMetadata = {
        ...makeLegacyAttemptFixture(task),
        roleProcesses: {
          worker: {
            role: "worker",
            profileId: task.workUnit.workerAgentId,
            status: "succeeded",
            startedAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:02:00.000Z",
            finishedAt: "2026-05-25T00:02:00.000Z",
            process: {
              title: "Worker 过程",
              narration: ["Worker 开始长任务", "Worker 已汇总大量过程数据"],
              currentAction: "压缩长任务过程视图",
              kind: "ok",
              isComplete: true,
              entries: [...oldToolEntries, ...deepToolEntries],
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
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({ [task.taskId]: [taskRun] });
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

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      const workerProcessNode = await waitFor(() => {
        const node = container.querySelector('.emap-observer-process-node[data-process-role="worker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      expect(workerProcessNode).toHaveTextContent("压缩长任务过程视图");
      expect(workerProcessNode).toHaveTextContent("Worker 已汇总大量过程数据");
      expect(workerProcessNode.querySelector(".emap-process-tool-groups")).toBeNull();
      expect(workerProcessNode.querySelector(".emap-process-budget-note")).toBeNull();
      expect(workerProcessNode.querySelectorAll(".emap-process-tool-group")).toHaveLength(0);
      expect(workerProcessNode).not.toHaveTextContent("bulk tool 01 finished");
      expect(workerProcessNode).not.toHaveTextContent("bulk-deep-tool");
      expect(workerProcessNode).not.toHaveTextContent("deep detail 01");
      expect(workerProcessNode).not.toHaveTextContent("deep detail 20");
      expect(workerProcessNode.querySelectorAll(".emap-process-tool-entry")).toHaveLength(0);
    });

    it("truncates process node summary text and hides tool detail", async () => {
      const task = cloneTaskFixture();
      const taskRun = makeLiveTaskRunFixture(task);
      const longCurrentAction = [
        "工具结束 · read",
        "A".repeat(220),
        "CURRENT_ACTION_SENTINEL_AFTER_LIMIT",
      ].join(" ");
      const longNarration = [
        "工具结束 · read",
        "B".repeat(360),
        "NARRATION_SENTINEL_AFTER_LIMIT",
      ].join(" ");
      const attempt: TeamAttemptMetadata = {
        ...makeLegacyAttemptFixture(task),
        roleProcesses: {
          worker: {
            role: "worker",
            profileId: task.workUnit.workerAgentId,
            status: "succeeded",
            startedAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:05.000Z",
            finishedAt: "2026-05-25T00:00:05.000Z",
            process: {
              title: "Worker 过程",
              narration: [longNarration],
              currentAction: longCurrentAction,
              kind: "ok",
              isComplete: true,
              entries: [{
                id: "tool-detail-full",
                kind: "ok",
                title: "read finished",
                detail: `完整 tool detail 保留 FULL_TOOL_DETAIL_SENTINEL ${"C".repeat(260)}`,
                createdAt: "2026-05-25T00:00:04.000Z",
                toolCallId: "tool-detail-full",
                toolName: "read",
              }],
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
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({ [task.taskId]: [taskRun] });
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

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      const workerProcessNode = await waitFor(() => {
        const node = container.querySelector('.emap-observer-process-node[data-process-role="worker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      const summary = workerProcessNode.querySelector(".emap-observer-process-top") as HTMLElement | null;
      expect(summary).toBeTruthy();
      expect(summary).toHaveTextContent("工具结束 · read");
      expect(summary).toHaveTextContent("...");
      expect(summary).not.toHaveTextContent("CURRENT_ACTION_SENTINEL_AFTER_LIMIT");
      expect(summary).not.toHaveTextContent("NARRATION_SENTINEL_AFTER_LIMIT");
      expect(workerProcessNode.querySelector(".emap-process-tool-groups")).toBeNull();
      expect(workerProcessNode).not.toHaveTextContent("FULL_TOOL_DETAIL_SENTINEL");
    });

    it("hides active process tool details while a role is running", async () => {
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
            activeAttemptId: "legacy-attempt-1",
            resultRef: null,
            errorSummary: null,
            progress: {
              phase: "worker_running",
              message: "Worker 正在执行",
              updatedAt: "2026-05-25T00:00:05.000Z",
            },
          },
        },
        summary: { totalTasks: 1, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
      };
      const runningAttempt: TeamAttemptMetadata = {
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
              narration: ["Worker 正在调用搜索工具"],
              currentAction: "调用搜索工具",
              kind: "tool",
              isComplete: false,
              entries: [{
                id: "active-search-started",
                kind: "tool",
                title: "x-search-latest started",
                detail: "正在搜索 Medtrum 云资产",
                createdAt: "2026-05-25T00:00:04.000Z",
                toolCallId: "tool-active-web",
                toolName: "x-search-latest",
              }],
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
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({ [task.taskId]: [taskRun] });
        if (url === `/v1/team/tasks/${task.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [taskRun] }), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${taskRun.runId}`) {
          return new Response(JSON.stringify(taskRun), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${taskRun.runId}/tasks/${task.taskId}/attempts`) {
          return new Response(JSON.stringify({ attempts: [runningAttempt] }), { status: 200 });
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

      const workerProcessNode = await waitFor(() => {
        const node = container.querySelector('.emap-observer-process-node[data-process-role="worker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      expect(workerProcessNode).toHaveTextContent("执行中");
      expect(workerProcessNode.querySelector(".emap-process-tool-groups")).toBeNull();
      expect(workerProcessNode.querySelectorAll(".emap-process-tool-group")).toHaveLength(0);
      expect(workerProcessNode).not.toHaveTextContent("x-search-latest");
      expect(workerProcessNode).not.toHaveTextContent("正在搜索 Medtrum 云资产");
    });

    it("renders legacy Live API attempt files while roleProcesses is missing", async () => {
      const task = cloneTaskFixture();
      const taskRun = makeLiveTaskRunFixture(task);
      const attemptId = "legacy-attempt-1";
      const workerOutputRef = `tasks/${task.taskId}/attempts/${attemptId}/worker-output-legacy.md`;
      const checkerVerdictRef = `tasks/${task.taskId}/attempts/${attemptId}/checker-verdict-legacy.json`;
      const resultRef = `tasks/${task.taskId}/attempts/${attemptId}/accepted-result-legacy.md`;
      const legacyAttempt: TeamAttemptMetadata = {
        ...makeLegacyAttemptFixture(task),
        worker: [{
          outputIndex: 1,
          outputRef: workerOutputRef,
          runtimeContext: {
            requestedProfileId: task.workUnit.workerAgentId,
            resolvedProfileId: task.workUnit.workerAgentId,
            fallbackUsed: false,
            browserId: null,
            browserScope: `team-task:${task.taskId}:worker`,
          },
        }],
        checker: [{
          verdict: "pass",
          reason: "legacy checker accepted",
          revisionIndex: 1,
          resultContentRef: null,
          recordRef: checkerVerdictRef,
          feedbackRef: null,
          runtimeContext: {
            requestedProfileId: task.workUnit.checkerAgentId,
            resolvedProfileId: task.workUnit.checkerAgentId,
            fallbackUsed: false,
            browserId: null,
            browserScope: `team-task:${task.taskId}:checker`,
          },
        }],
        resultRef,
        files: ["worker-output-legacy.md", "checker-verdict-legacy.json", "accepted-result-legacy.md"],
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
        if (url === `/v1/team/task-runs/${taskRun.runId}`) {
          return new Response(JSON.stringify(taskRun), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${taskRun.runId}/tasks/${task.taskId}/attempts`) {
          return new Response(JSON.stringify({ attempts: [legacyAttempt] }), { status: 200 });
        }
        if (url.endsWith("/files/worker-output-legacy.md")) {
          return new Response("# Legacy worker output\n\nLive API old attempt file.", { status: 200 });
        }
        if (url.endsWith("/files/checker-verdict-legacy.json")) {
          return new Response(JSON.stringify({ verdict: "pass", reason: "legacy checker accepted" }), { status: 200 });
        }
        if (url.endsWith("/files/accepted-result-legacy.md")) {
          return new Response("# Legacy accepted result", { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
      fireEvent.click(runSummary);

      await waitFor(() => {
        expect(container.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
      });
      const workerProcessNode = container.querySelector('.emap-observer-process-node[data-process-role="worker"]') as HTMLElement | null;
      const checkerProcessNode = container.querySelector('.emap-observer-process-node[data-process-role="checker"]') as HTMLElement | null;
      expect(workerProcessNode).toHaveTextContent("等待过程数据");
      expect(checkerProcessNode).toHaveTextContent("等待过程数据");

      const workerFileRow = await waitFor(() => {
        const node = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      expect(within(workerFileRow).getByText("worker-output-legacy.md")).toBeInTheDocument();
      expect(container.querySelector('.emap-observer-file-row[data-file-kind="checker"]')).toHaveTextContent("checker-verdict-legacy.json");
      expect(container.querySelector('.emap-observer-file-row[data-file-kind="result"]')).toHaveTextContent("accepted-result-legacy.md");

      fireEvent.click(workerFileRow);
      const detailNode = await waitFor(() => {
        const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
        expect(detail).toBeTruthy();
        return detail!;
      });
      expect(detailNode).toHaveTextContent("Legacy worker output");
    });

    it("pretty-prints structured JSON from markdown-named accepted result files", async () => {
      const task = cloneTaskFixture();
      const taskRun = makeLiveTaskRunFixture(task, "run_json_md_result");
      const attemptId = "attempt_json_md_result";
      const resultRef = `tasks/${task.taskId}/attempts/${attemptId}/accepted-result.md`;
      const attempt: TeamAttemptMetadata = {
        ...makeLegacyAttemptFixture(task),
        attemptId,
        resultRef,
        files: ["accepted-result.md"],
      };
      taskRun.taskStates[task.taskId] = {
        ...taskRun.taskStates[task.taskId]!,
        activeAttemptId: attemptId,
        resultRef,
      };
      const resultContent = JSON.stringify({
        platform: "Reddit",
        sentiment: "mixed",
        sources: [{ url: "https://www.reddit.com/r/LocalLLaMA/" }],
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
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [task] }), { status: 200 });
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({ [task.taskId]: [taskRun] });
        if (url === `/v1/team/tasks/${task.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [taskRun] }), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${taskRun.runId}`) {
          return new Response(JSON.stringify(taskRun), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${taskRun.runId}/tasks/${task.taskId}/attempts`) {
          return new Response(JSON.stringify({ attempts: [attempt] }), { status: 200 });
        }
        if (url.endsWith("/files/accepted-result.md")) {
          return new Response(resultContent, { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: task.title });
      fireEvent.click(taskNode);

      const branch = await waitFor(() => {
        const node = container.querySelector(".task-action-branch") as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      const runSummary = await waitFor(() => {
        const node = branch.querySelector(".task-run-summary") as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      fireEvent.click(runSummary);

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
      const jsonPre = detailNode.querySelector('pre[data-file-format="json"]');
      expect(jsonPre).toBeTruthy();
      expect(jsonPre).toHaveTextContent('"platform": "Reddit"');
      expect(jsonPre).toHaveTextContent('"url": "https://www.reddit.com/r/LocalLLaMA/"');
      expect(detailNode.querySelector('[data-file-format="markdown"]')).toBeNull();
    });

    it("renders HTML-like content as text in file detail, not as injected HTML", async () => {
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

      expect(detailNode).toHaveTextContent("<script>alert(1)</script>");
      expect(detailNode.querySelector("script")).toBeNull();
      expect(detailNode.querySelector("details")).toBeNull();
    });

    it("shows run status in the menu summary and keeps compact file index nodes", async () => {
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

      expect(runSummary).toHaveTextContent("阶段");
      expect(runSummary).toHaveTextContent("succeeded");
      expect(runSummary).toHaveTextContent(/耗时(?:0ms|4秒)/);
      expect(runSummary).toHaveTextContent("Attempts");
      expect(runSummary).toHaveTextContent("已通过");
      expect(container.querySelector(".emap-observer-status-node")).toBeNull();

      // File rows should NOT show checker reason / verdict summary text
      const checkerFileRow = container.querySelector('.emap-observer-file-row[data-file-kind="checker"]') as HTMLElement | null;
      expect(checkerFileRow).toBeTruthy();
      expect(checkerFileRow!.textContent).not.toContain("Mock checker accepted the worker output.");
      expect(checkerFileRow!.querySelector(".emap-observer-file-summary")).toBeNull();
      expect(checkerFileRow!.querySelector(".emap-observer-file-runtime")).toBeNull();

      // File rows should show agent name resolved from agentsById
      const workerFileRow = container.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
      expect(workerFileRow).toBeTruthy();
      expect(workerFileRow!.textContent).toContain("搜索 Agent");

      const checkerResolvedAgent = checkerFileRow!.textContent ?? "";
      expect(checkerResolvedAgent).toContain("主 Agent");

      // Result file shows agent role fallback
      const resultFileRow = container.querySelector('.emap-observer-file-row[data-file-kind="result"]') as HTMLElement | null;
      expect(resultFileRow).toBeTruthy();
      expect(resultFileRow!.textContent).toContain("accepted-result.md");

      // File rows should still show file name and path
      expect(within(workerFileRow!).getByText("worker-output-001.md")).toBeInTheDocument();
      expect(workerFileRow!.querySelector(".emap-observer-file-row-path")).toBeTruthy();
    });

    it("renders file detail with resize handle for observer file rows", async () => {
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

      // JSON detail still shows pretty-printed content
      expect(within(detailNode).getByText(/"verdict": "pass"/)).toBeInTheDocument();

      // File detail shell must have a resize handle
      const allShells = () => Array.from(container.querySelectorAll(".emap-task-child-branch-shell"));
      const detailShell = allShells().find((s) => s.querySelector(".emap-observer-file-detail-node")) as HTMLElement | undefined;
      expect(detailShell).toBeTruthy();
      const resizeHandle = detailShell!.querySelector(".emap-panel-resize-handle") as HTMLElement | null;
      expect(resizeHandle).toBeTruthy();

      // Drag resize handle to increase size
      const initialWidth = Number.parseFloat(detailShell!.style.width);
      const initialHeight = Number.parseFloat(detailShell!.style.height);

      firePointer(resizeHandle!, "pointerdown", { pointerId: 61, clientX: 800, clientY: 500 });
      firePointer(resizeHandle!, "pointermove", { pointerId: 61, clientX: 900, clientY: 560 });
      firePointer(resizeHandle!, "pointerup", { pointerId: 61, clientX: 900, clientY: 560, buttons: 0 });

      expect(Number.parseFloat(detailShell!.style.width)).toBeCloseTo(initialWidth + 100, 4);
      expect(Number.parseFloat(detailShell!.style.height)).toBeCloseTo(initialHeight + 60, 4);
    });

    it("starts a live Task run through the Task run API", async () => {
      const liveTask = mockTeamTasks[0]!;
      let createRunRequests = 0;
      const taskRun: TeamRunState = {
        runId: "run_canvas_task_001",
        planId: `canvas_task_${liveTask.taskId}`,
        source: { type: "canvas-task", taskId: liveTask.taskId },
        teamUnitId: `canvas_task_unit_${liveTask.taskId}`,
        status: "queued",
        createdAt: "2026-05-25T00:00:00.000Z",
        startedAt: null,
        finishedAt: null,
        currentTaskId: null,
        taskStates: {
          [liveTask.taskId]: {
            status: "pending",
            attemptCount: 0,
            activeAttemptId: null,
            resultRef: null,
            errorSummary: null,
            progress: { phase: "pending", message: "等待执行", updatedAt: "2026-05-25T00:00:00.000Z" },
          },
        },
        summary: { totalTasks: 1, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
      };

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
        if (url === "/v1/team/tasks" && method === "GET") {
          return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?") && method === "GET") {
          return byTaskRunsResponse({ [liveTask.taskId]: createRunRequests > 0 ? [taskRun] : [] });
        }
        if (url === "/v1/team/tasks/task_research_medtrum/runs" && method === "GET") {
          return new Response(JSON.stringify({ runs: createRunRequests > 0 ? [taskRun] : [] }), { status: 200 });
        }
        if (url === "/v1/team/tasks/task_research_medtrum/runs" && method === "POST") {
          createRunRequests += 1;
          return new Response(JSON.stringify(taskRun), { status: 201 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);
      fireEvent.click(screen.getByRole("button", { name: "运行" }));

      await waitFor(() => expect(createRunRequests).toBe(1));
      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      expect(within(branch!).getByRole("button", { name: /运行中[\s\S]*排队中/ })).toBeInTheDocument();
      expect(within(branch!).getByText("排队中")).toBeInTheDocument();
      expect(within(branch!).getByRole("button", { name: "运行中" })).toBeDisabled();
    });

  });
});
