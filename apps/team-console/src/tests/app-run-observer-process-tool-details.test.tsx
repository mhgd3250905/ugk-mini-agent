import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { AgentChatProcessEntry, TeamAttemptMetadata, TeamRunState } from "../api/team-types";
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

});
