import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { mockTeamTasks, resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { TeamAttemptMetadata, TeamRunState, TeamTaskConnection } from "../api/team-types";
import { getAtlasNodes } from "./app-dom-test-utils";
import { cloneTaskFixture, makeTypedTaskChainFixtures } from "./team-task-test-fixtures";
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

  function processSummaryResponse(run: TeamRunState, attempts: TeamAttemptMetadata[]): Response {
    return new Response(JSON.stringify({ run, attempts }), { status: 200 });
  }

  function rootSummaryResponse(
    tasks = mockTeamTasks,
    taskRunsByTaskId: Record<string, TeamRunState[]> = {},
    taskConnections: TeamTaskConnection[] = [],
  ): Response {
    return new Response(JSON.stringify({
      tasks,
      deletedTaskIds: [],
      taskRunsByTaskId,
      deletedRunIdsByTaskId: {},
      sourceNodes: [],
      sourceConnections: [],
      taskConnections,
      taskDependencies: [],
      serverVersion: {
        taskCatalog: null,
        taskRunSummary: null,
      },
    }), { status: 200 });
  }

  function runHistoryResponse(taskId: string, runs: TeamRunState[]): Response {
    return new Response(JSON.stringify({
      taskId,
      total: runs.length,
      limit: 3,
      offset: 0,
      hasMore: runs.length > 3,
      runs: runs.map((run) => ({
        run,
        annotation: {
          runId: run.runId,
          taskId,
          best: false,
          archived: false,
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
      })),
    }), { status: 200 });
  }

  function parsePostBody(body: BodyInit | null | undefined): unknown {
    return typeof body === "string" ? JSON.parse(body) : body;
  }

  async function openLiveRunObserver(options: {
    taskTitle: string;
    taskId: string;
    runId: string;
    container: HTMLElement;
  }) {
    const atlas = await waitFor(() => getAtlasNodes(options.container));
    const taskNode = await within(atlas).findByRole("button", { name: options.taskTitle });
    fireEvent.click(taskNode);
    const menu = await screen.findByLabelText(`${options.taskTitle} 操作菜单`);
    const runSummary = await waitFor(() => {
      const node = menu.querySelector("button.task-run-summary") as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.click(runSummary);
    return await waitFor(() => {
      const observer = options.container.querySelector(
        '.emap-task-child-branch-shell[data-panel-id^="run-observer"]',
      ) as HTMLElement | null;
      expect(observer).toBeTruthy();
      return observer!;
    });
  }

  describe("run observer", () => {
    it("renders manual upstream input diagnostics with full-detail artifact metadata", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
      const manualRun: TeamRunState = {
        ...makeLiveTaskRunFixture(htmlTask, "run_manual_upstream_observed"),
        source: {
          type: "canvas-task",
          taskId: htmlTask.taskId,
          manualUpstreamSelections: [{
            connectionId: "conn_collect_to_html",
            fromTaskId: collectTask.taskId,
            fromRunId: "run_collect_loaded_old",
            fromAttemptId: "attempt_collect_old",
            fromOutputPortId: "draft_md",
            toInputPortId: "source_md",
            artifactId: "artifact_collect_old",
            createdAt: "2026-06-04T01:00:00.000Z",
          }],
        },
      };
      const fullDetailRun: TeamRunState = {
        ...manualRun,
        source: {
          ...manualRun.source!,
          boundInputs: [{
            source: "task-artifact",
            connectionId: "conn_collect_to_html",
            inputPortId: "source_md",
            artifact: {
              schemaVersion: "team/task-artifact-1",
              artifactId: "artifact_collect_old",
              type: "md",
              sourceTaskId: collectTask.taskId,
              sourceRunId: "run_collect_loaded_old",
              sourceAttemptId: "attempt_collect_old",
              sourceOutputPortId: "draft_md",
              fileRef: "tasks/task_collect/attempts/attempt_collect_old/accepted-result.md",
              preview: "不要把这段 preview 存到 observer state，别犯低级错误",
              content: "heavy content must not render",
              createdAt: "2026-06-04T01:00:00.000Z",
            },
          }],
        },
      };
      const attempt = makeLegacyAttemptFixture(htmlTask);

      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/team/console-layout") return new Response(JSON.stringify({ state: null, updatedAt: null }), { status: 200 });
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse([collectTask, htmlTask], { [htmlTask.taskId]: [manualRun] });
        if (url === `/v1/team/task-runs/${manualRun.runId}?view=process-summary&taskId=${htmlTask.taskId}`) {
          return processSummaryResponse(manualRun, [attempt]);
        }
        if (url === `/v1/team/task-runs/${manualRun.runId}`) return new Response(JSON.stringify(fullDetailRun), { status: 200 });
        if (url.endsWith("/files/worker-output-001.md")) return new Response("worker output", { status: 200 });
        if (url.endsWith("/files/checker-verdict-001.json")) return new Response('{"verdict":"pass"}', { status: 200 });
        if (url.endsWith("/files/accepted-result.md")) return new Response("accepted result", { status: 200 });
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      const { container } = render(<App />);
      const observer = await openLiveRunObserver({
        taskTitle: htmlTask.title,
        taskId: htmlTask.taskId,
        runId: manualRun.runId,
        container,
      });

      const inputSource = await waitFor(() => {
        const source = observer.querySelector(".emap-run-observer-input-source") as HTMLElement | null;
        expect(source).toBeTruthy();
        return source!;
      });
      expect(inputSource).toHaveTextContent("手动上游输入");
      expect(inputSource).toHaveAttribute("data-input-source-kind", "manual");
      expect(observer.querySelector('[data-observer-section="input-diagnostics"]')).toBeNull();
      expect(observer).not.toHaveTextContent("conn_collect_to_html");
      expect(observer).not.toHaveTextContent("run_collect_loaded_old");
      expect(observer).not.toHaveTextContent("attempt_collect_old");
      expect(observer).not.toHaveTextContent("tasks/task_collect/attempts/attempt_collect_old/accepted-result.md");
      expect(observer).not.toHaveTextContent("heavy content must not render");
      expect(observer).not.toHaveTextContent("不要把这段 preview");
    });

    it("enriches an active manual upstream run only once across observer polls", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
      const activeManualRun: TeamRunState = {
        ...makeLiveTaskRunFixture(htmlTask, "run_active_manual_upstream"),
        status: "running",
        finishedAt: null,
        currentTaskId: htmlTask.taskId,
        source: {
          type: "canvas-task",
          taskId: htmlTask.taskId,
          manualUpstreamSelections: [{
            connectionId: "conn_collect_to_html",
            fromTaskId: collectTask.taskId,
            fromRunId: "run_collect_loaded_old",
            fromAttemptId: "attempt_collect_old",
            fromOutputPortId: "draft_md",
            toInputPortId: "source_md",
            artifactId: "artifact_collect_old",
            createdAt: "2026-06-04T01:00:00.000Z",
          }],
        },
      };
      const fullDetailRun: TeamRunState = {
        ...activeManualRun,
        source: {
          ...activeManualRun.source!,
          boundInputs: [{
            source: "task-artifact",
            connectionId: "conn_collect_to_html",
            inputPortId: "source_md",
            artifact: {
              schemaVersion: "team/task-artifact-1",
              artifactId: "artifact_collect_old",
              type: "md",
              sourceTaskId: collectTask.taskId,
              sourceRunId: "run_collect_loaded_old",
              sourceAttemptId: "attempt_collect_old",
              sourceOutputPortId: "draft_md",
              fileRef: "tasks/task_collect/attempts/attempt_collect_old/accepted-result.md",
              preview: "heavy preview must not be stored",
              content: "heavy content must not be stored",
              createdAt: "2026-06-04T01:00:00.000Z",
            },
          }],
        },
      };
      let processSummaryRequests = 0;
      let fullDetailRequests = 0;

      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/team/console-layout") return new Response(JSON.stringify({ state: null, updatedAt: null }), { status: 200 });
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse([collectTask, htmlTask], { [htmlTask.taskId]: [activeManualRun] });
        if (url === `/v1/team/task-runs/${activeManualRun.runId}?view=summary&taskId=${htmlTask.taskId}`) {
          return new Response(JSON.stringify(activeManualRun), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${activeManualRun.runId}?view=process-summary&taskId=${htmlTask.taskId}`) {
          processSummaryRequests += 1;
          return processSummaryResponse(activeManualRun, [makeLegacyAttemptFixture(htmlTask)]);
        }
        if (url === `/v1/team/task-runs/${activeManualRun.runId}`) {
          fullDetailRequests += 1;
          return new Response(JSON.stringify(fullDetailRun), { status: 200 });
        }
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      const { container, unmount } = render(<App />);
      const observer = await openLiveRunObserver({
        taskTitle: htmlTask.title,
        taskId: htmlTask.taskId,
        runId: activeManualRun.runId,
        container,
      });
      await waitFor(() => {
        const inputSource = observer.querySelector(".emap-run-observer-input-source") as HTMLElement | null;
        expect(inputSource).toBeTruthy();
        expect(inputSource).toHaveTextContent("手动上游输入");
      });
      expect(observer.querySelector('[data-observer-section="input-diagnostics"]')).toBeNull();
      expect(processSummaryRequests).toBe(1);
      expect(fullDetailRequests).toBe(1);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2200));
      });
      await waitFor(() => expect(processSummaryRequests).toBeGreaterThanOrEqual(2));
      expect(fullDetailRequests).toBe(1);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2200));
      });
      await waitFor(() => expect(processSummaryRequests).toBeGreaterThanOrEqual(3));
      expect(fullDetailRequests).toBe(1);
      unmount();
    });

    it("renders compact manual downstream run history without source internals", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
      const manualRun: TeamRunState = {
        ...makeLiveTaskRunFixture(htmlTask, "run_manual_trigger_label"),
        source: {
          type: "canvas-task",
          taskId: htmlTask.taskId,
          manualUpstreamSelections: [{
            connectionId: "conn_collect_to_html",
            fromTaskId: collectTask.taskId,
            fromRunId: "run_collect_loaded_old",
            fromAttemptId: "attempt_collect_old",
            fromOutputPortId: "draft_md",
            toInputPortId: "source_md",
            artifactId: "artifact_collect_old",
            createdAt: "2026-06-04T01:00:00.000Z",
          }],
        },
      };

      let processSummaryRequests = 0;

      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/team/console-layout") return new Response(JSON.stringify({ state: null, updatedAt: null }), { status: 200 });
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse([collectTask, htmlTask], { [htmlTask.taskId]: [] });
        if (url === `/v1/team/tasks/${htmlTask.taskId}/run-history?limit=3&offset=0`) {
          return runHistoryResponse(htmlTask.taskId, [manualRun]);
        }
        if (url === `/v1/team/task-runs/${manualRun.runId}?view=process-summary&taskId=${htmlTask.taskId}`) {
          processSummaryRequests += 1;
          return processSummaryResponse(manualRun, [makeLegacyAttemptFixture(htmlTask)]);
        }
        if (url === `/v1/team/task-runs/${manualRun.runId}`) return new Response(JSON.stringify(manualRun), { status: 200 });
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      const { container } = render(<App />);
      const atlas = await waitFor(() => getAtlasNodes(container));
      fireEvent.click(await within(atlas).findByRole("button", { name: htmlTask.title }));
      const menu = await screen.findByLabelText(`${htmlTask.title} 操作菜单`);
      fireEvent.click(within(menu).getByRole("button", { name: "运行记录" }));
      const historyPanel = await screen.findByRole("region", { name: `${htmlTask.title} 运行记录` });
      const historyRow = await waitFor(() => {
        const row = historyPanel.querySelector(`[data-run-id="${manualRun.runId}"]`) as HTMLElement | null;
        expect(row).toBeTruthy();
        return row!;
      });
      expect(historyRow).toHaveTextContent("状态");
      expect(historyRow).toHaveTextContent("开始时间");
      expect(historyRow).toHaveTextContent("执行时间");
      expect(historyRow).not.toHaveTextContent("手动");
      expect(historyRow).not.toHaveTextContent("Discovery 生成");
      expect(historyRow).not.toHaveTextContent(manualRun.runId);
      expect(historyRow).not.toHaveTextContent("结果产物");
      expect(historyRow).not.toHaveTextContent("conn_collect_to_html");
      expect(within(historyRow).queryByRole("button", { name: /运行详情/ })).toBeNull();
      expect(within(historyRow).getAllByRole("button")).toHaveLength(4);
      expect(within(historyRow).getByRole("button", { name: "查看运行过程" })).toBeInTheDocument();
      expect(within(historyRow).getByRole("button", { name: "装载记录" })).toBeInTheDocument();
      expect(within(historyRow).getByRole("button", { name: "标为最佳" })).toBeInTheDocument();
      expect(within(historyRow).getByRole("button", { name: "归档记录" })).toBeInTheDocument();
      expect(container.querySelector('[data-observer-section="input-diagnostics"]')).toBeNull();
      expect(processSummaryRequests).toBe(0);
    });

    it("keeps previously opened Task run history panels scoped to their Task", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const { collectTask, htmlTask, ttsTask } = makeTypedTaskChainFixtures();
      const collectRun = makeLiveTaskRunFixture(collectTask, "run_collect_history_scoped");
      const htmlRun = makeLiveTaskRunFixture(htmlTask, "run_html_history_scoped");
      const ttsRun = makeLiveTaskRunFixture(ttsTask, "run_tts_history_scoped");
      const historyRequests: Record<string, number> = {};

      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/team/console-layout") return new Response(JSON.stringify({ state: null, updatedAt: null }), { status: 200 });
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse([collectTask, htmlTask, ttsTask], {
          [collectTask.taskId]: [],
          [htmlTask.taskId]: [],
          [ttsTask.taskId]: [],
        });
        if (url === `/v1/team/tasks/${collectTask.taskId}/run-history?limit=3&offset=0`) {
          historyRequests[collectTask.taskId] = (historyRequests[collectTask.taskId] ?? 0) + 1;
          return runHistoryResponse(collectTask.taskId, [collectRun]);
        }
        if (url === `/v1/team/tasks/${htmlTask.taskId}/run-history?limit=3&offset=0`) {
          historyRequests[htmlTask.taskId] = (historyRequests[htmlTask.taskId] ?? 0) + 1;
          return runHistoryResponse(htmlTask.taskId, [htmlRun]);
        }
        if (url === `/v1/team/tasks/${ttsTask.taskId}/run-history?limit=3&offset=0`) {
          historyRequests[ttsTask.taskId] = (historyRequests[ttsTask.taskId] ?? 0) + 1;
          return runHistoryResponse(ttsTask.taskId, [ttsRun]);
        }
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      const { container } = render(<App />);
      const atlas = await waitFor(() => getAtlasNodes(container));

      fireEvent.click(await within(atlas).findByRole("button", { name: collectTask.title }));
      const collectMenu = await screen.findByLabelText(`${collectTask.title} 操作菜单`);
      fireEvent.click(within(collectMenu).getByRole("button", { name: "运行记录" }));
      const collectHistoryPanel = await screen.findByRole("region", { name: `${collectTask.title} 运行记录` });
      await waitFor(() => {
        expect(collectHistoryPanel.querySelector(`[data-run-id="${collectRun.runId}"]`)).toBeTruthy();
      });

      fireEvent.click(await within(atlas).findByRole("button", { name: htmlTask.title }));
      const htmlMenu = await screen.findByLabelText(`${htmlTask.title} 操作菜单`);
      fireEvent.click(within(htmlMenu).getByRole("button", { name: "运行记录" }));
      const htmlHistoryPanel = await screen.findByRole("region", { name: `${htmlTask.title} 运行记录` });

      await waitFor(() => {
        expect(htmlHistoryPanel.querySelector(`[data-run-id="${htmlRun.runId}"]`)).toBeTruthy();
      });
      expect(collectHistoryPanel.querySelector(`[data-run-id="${collectRun.runId}"]`)).toBeTruthy();
      expect(collectHistoryPanel.querySelector(`[data-run-id="${htmlRun.runId}"]`)).toBeNull();

      fireEvent.click(await within(atlas).findByRole("button", { name: ttsTask.title }));
      const ttsMenu = await screen.findByLabelText(`${ttsTask.title} 操作菜单`);
      fireEvent.click(within(ttsMenu).getByRole("button", { name: "运行记录" }));
      const ttsHistoryPanel = await screen.findByRole("region", { name: `${ttsTask.title} 运行记录` });

      await waitFor(() => {
        expect(ttsHistoryPanel.querySelector(`[data-run-id="${ttsRun.runId}"]`)).toBeTruthy();
      });
      expect(historyRequests[collectTask.taskId]).toBe(1);
      expect(historyRequests[htmlTask.taskId]).toBe(1);
      expect(historyRequests[ttsTask.taskId]).toBe(1);
      expect(within(collectHistoryPanel).queryByText("正在加载运行记录...")).toBeNull();
      expect(within(htmlHistoryPanel).queryByText("正在加载运行记录...")).toBeNull();
    });

    it("does not render input diagnostics or request full detail for an ordinary run", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const task = {
        ...cloneTaskFixture(),
        taskId: "task_ordinary_observer",
        title: "Ordinary Observer Task",
        workUnit: { ...cloneTaskFixture().workUnit, title: "Ordinary Observer Task" },
      };
      const run = makeLiveTaskRunFixture(task, "run_ordinary_observer");
      const requestedUrls: string[] = [];

      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url === "/v1/team/console-layout") return new Response(JSON.stringify({ state: null, updatedAt: null }), { status: 200 });
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse([task], { [task.taskId]: [run] });
        if (url === `/v1/team/task-runs/${run.runId}?view=process-summary&taskId=${task.taskId}`) {
          return processSummaryResponse(run, [makeLegacyAttemptFixture(task)]);
        }
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      const { container } = render(<App />);
      const observer = await openLiveRunObserver({
        taskTitle: task.title,
        taskId: task.taskId,
        runId: run.runId,
        container,
      });

      await waitFor(() => expect(observer.querySelector('[data-observer-section="worker-process"]')).toBeTruthy());
      expect(observer.querySelector('[data-observer-section="input-diagnostics"]')).toBeNull();
      expect(requestedUrls.filter((url) => url === `/v1/team/task-runs/${run.runId}`)).toHaveLength(0);
    });

    it("falls back to lightweight manual upstream trace when full-detail enrichment fails", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
      const manualRun: TeamRunState = {
        ...makeLiveTaskRunFixture(htmlTask, "run_manual_upstream_fallback"),
        source: {
          type: "canvas-task",
          taskId: htmlTask.taskId,
          manualUpstreamSelections: [{
            connectionId: "conn_collect_to_html",
            fromTaskId: collectTask.taskId,
            fromRunId: "run_collect_loaded_old",
            fromAttemptId: "attempt_collect_old",
            fromOutputPortId: "draft_md",
            toInputPortId: "source_md",
            artifactId: "artifact_collect_old",
            createdAt: "2026-06-04T01:00:00.000Z",
          }],
        },
      };

      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/team/console-layout") return new Response(JSON.stringify({ state: null, updatedAt: null }), { status: 200 });
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse([collectTask, htmlTask], { [htmlTask.taskId]: [manualRun] });
        if (url === `/v1/team/task-runs/${manualRun.runId}?view=process-summary&taskId=${htmlTask.taskId}`) {
          return processSummaryResponse(manualRun, [makeLegacyAttemptFixture(htmlTask)]);
        }
        if (url === `/v1/team/task-runs/${manualRun.runId}`) {
          return new Response(JSON.stringify({ error: "full detail failed" }), { status: 500 });
        }
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      const { container } = render(<App />);
      const observer = await openLiveRunObserver({
        taskTitle: htmlTask.title,
        taskId: htmlTask.taskId,
        runId: manualRun.runId,
        container,
      });

      const inputSource = await waitFor(() => {
        const source = observer.querySelector(".emap-run-observer-input-source") as HTMLElement | null;
        expect(source).toBeTruthy();
        return source!;
      });
      expect(inputSource).toHaveTextContent("手动上游输入");
      expect(inputSource).toHaveAttribute("data-input-source-kind", "manual");
      expect(observer.querySelector('[data-observer-section="input-diagnostics"]')).toBeNull();
      expect(observer).not.toHaveTextContent("conn_collect_to_html");
      expect(observer).not.toHaveTextContent("run_collect_loaded_old");
      expect(observer).not.toHaveTextContent("attempt_collect_old");
      expect(observer).not.toHaveTextContent("artifact_collect_old");
      expect(observer).not.toHaveTextContent("请求失败");
      expect(observer).not.toHaveTextContent("full detail failed");
    });

    it("does not retry failed manual upstream full-detail enrichment on active observer polls", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
      const activeManualRun: TeamRunState = {
        ...makeLiveTaskRunFixture(htmlTask, "run_active_manual_upstream_full_detail_failed"),
        status: "running",
        finishedAt: null,
        currentTaskId: htmlTask.taskId,
        source: {
          type: "canvas-task",
          taskId: htmlTask.taskId,
          manualUpstreamSelections: [{
            connectionId: "conn_collect_to_html",
            fromTaskId: collectTask.taskId,
            fromRunId: "run_collect_loaded_old",
            fromAttemptId: "attempt_collect_old",
            fromOutputPortId: "draft_md",
            toInputPortId: "source_md",
            artifactId: "artifact_collect_old",
            createdAt: "2026-06-04T01:00:00.000Z",
          }],
        },
      };
      let processSummaryRequests = 0;
      let fullDetailRequests = 0;

      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/team/console-layout") return new Response(JSON.stringify({ state: null, updatedAt: null }), { status: 200 });
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse([collectTask, htmlTask], { [htmlTask.taskId]: [activeManualRun] });
        if (url === `/v1/team/task-runs/${activeManualRun.runId}?view=summary&taskId=${htmlTask.taskId}`) {
          return new Response(JSON.stringify(activeManualRun), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${activeManualRun.runId}?view=process-summary&taskId=${htmlTask.taskId}`) {
          processSummaryRequests += 1;
          return processSummaryResponse(activeManualRun, [makeLegacyAttemptFixture(htmlTask)]);
        }
        if (url === `/v1/team/task-runs/${activeManualRun.runId}`) {
          fullDetailRequests += 1;
          return new Response(JSON.stringify({ error: "full detail failed" }), { status: 500 });
        }
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      const { container, unmount } = render(<App />);
      const observer = await openLiveRunObserver({
        taskTitle: htmlTask.title,
        taskId: htmlTask.taskId,
        runId: activeManualRun.runId,
        container,
      });
      const inputSource = await waitFor(() => {
        const source = observer.querySelector(".emap-run-observer-input-source") as HTMLElement | null;
        expect(source).toBeTruthy();
        return source!;
      });
      expect(inputSource).toHaveTextContent("手动上游输入");
      expect(inputSource).toHaveAttribute("data-input-source-kind", "manual");
      expect(observer.querySelector('[data-observer-section="input-diagnostics"]')).toBeNull();
      expect(observer).not.toHaveTextContent("conn_collect_to_html");
      expect(observer).not.toHaveTextContent("run_collect_loaded_old");
      expect(fullDetailRequests).toBe(1);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2200));
      });
      await waitFor(() => expect(processSummaryRequests).toBeGreaterThanOrEqual(2));
      expect(fullDetailRequests).toBe(1);
      expect(observer).not.toHaveTextContent("full detail failed");
      unmount();
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

    it("loads and unloads a historical Task run from run history without starting a Task run", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const task = {
        ...cloneTaskFixture(),
        taskId: "task_loaded_history",
        title: "Loaded History Task",
        workUnit: { ...cloneTaskFixture().workUnit, title: "Loaded History Task" },
      };
      const historicalRun = makeLiveTaskRunFixture(task, "run_loaded_history");
      const createdRun = makeLiveTaskRunFixture(task, "run_loaded_history_created");
      const runPostBodies: Array<BodyInit | null | undefined> = [];

      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url === "/v1/team/console-layout") return new Response(JSON.stringify({ state: null, updatedAt: null }), { status: 200 });
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse([task], { [task.taskId]: [] });
        if (url === `/v1/team/tasks/${task.taskId}/run-history?limit=3&offset=0`) {
          return runHistoryResponse(task.taskId, [historicalRun]);
        }
        if (url === `/v1/team/tasks/${task.taskId}/runs` && method === "POST") {
          runPostBodies.push(init?.body);
          return new Response(JSON.stringify(createdRun), { status: 201 });
        }
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      const { container } = render(<App />);
      const atlas = await waitFor(() => getAtlasNodes(container));
      const taskNode = await within(atlas).findByRole("button", { name: task.title });
      fireEvent.click(taskNode);
      const menu = await screen.findByLabelText(`${task.title} 操作菜单`);
      fireEvent.click(within(menu).getByRole("button", { name: "运行记录" }));

      const historyPanel = await screen.findByRole("region", { name: `${task.title} 运行记录` });
      const historicalRow = await waitFor(() => {
        const row = historyPanel.querySelector(`[data-run-id="${historicalRun.runId}"]`) as HTMLElement | null;
        expect(row).toBeTruthy();
        return row!;
      });
      fireEvent.click(within(historicalRow).getByRole("button", { name: "装载记录" }));

      const loadedRow = await waitFor(() => {
        const row = historyPanel.querySelector(`[data-run-id="${historicalRun.runId}"]`) as HTMLElement | null;
        expect(row).toBeTruthy();
        expect(row).toHaveAttribute("data-loaded-run", "true");
        expect(row).toHaveAttribute("data-loaded-run-state", "loaded");
        return row!;
      });
      expect(within(loadedRow).queryByText("已装载")).toBeNull();
      expect(screen.getByRole("region", { name: `${task.title} 运行记录` })).toBeInTheDocument();
      expect(runPostBodies).toHaveLength(0);

      fireEvent.click(within(loadedRow).getByRole("button", { name: "取消装载" }));
      await waitFor(() => {
        expect(historyPanel.querySelector(`[data-run-id="${historicalRun.runId}"]`)).toHaveAttribute("data-loaded-run-state", "none");
        expect(within(historyPanel).queryByText("已装载")).toBeNull();
      });
      expect(screen.getByRole("region", { name: `${task.title} 运行记录` })).toBeInTheDocument();
      expect(runPostBodies).toHaveLength(0);

      fireEvent.click(within(historyPanel).getByRole("button", { name: "装载记录" }));
      fireEvent.click(within(menu).getByRole("button", { name: "运行" }));
      await waitFor(() => expect(runPostBodies).toHaveLength(1));
      expect(runPostBodies[0]).toBeUndefined();
    });

    async function startDownstreamTaskWithOptionalLoadedUpstream(options: {
      loadUpstream?: boolean;
      upstreamRun?: TeamRunState;
      taskRunsByTaskId?: Record<string, TeamRunState[]>;
      connection?: TeamTaskConnection;
    } = {}) {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
      const upstreamRun = options.upstreamRun ?? makeLiveTaskRunFixture(collectTask, "run_collect_loaded_old");
      const createdRun = makeLiveTaskRunFixture(htmlTask, "run_html_created_from_loaded");
      const connection: TeamTaskConnection = options.connection ?? {
        schemaVersion: "team/task-connection-1",
        connectionId: "conn_collect_to_html",
        fromTaskId: collectTask.taskId,
        fromOutputPortId: "draft_md",
        toTaskId: htmlTask.taskId,
        toInputPortId: "source_md",
        type: "md",
        status: "active",
        createdAt: "2026-06-04T00:00:00.000Z",
        updatedAt: "2026-06-04T00:00:00.000Z",
      };
      const taskRunsByTaskId = options.taskRunsByTaskId ?? {
        [collectTask.taskId]: [upstreamRun],
        [htmlTask.taskId]: [],
      };
      const runPostBodies: Array<BodyInit | null | undefined> = [];

      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url === "/v1/team/console-layout") return new Response(JSON.stringify({ state: null, updatedAt: null }), { status: 200 });
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse([collectTask, htmlTask], taskRunsByTaskId, [connection]);
        if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [connection] }), { status: 200 });
        if (url === "/v1/team/task-dependencies") return new Response(JSON.stringify({ dependencies: [] }), { status: 200 });
        if (url === "/v1/team/source-nodes") return new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 });
        if (url === "/v1/team/source-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse(taskRunsByTaskId);
        if (url.startsWith("/v1/team/task-runs/") && url.includes("?view=summary&taskId=")) {
          const runId = decodeURIComponent(url.split("/v1/team/task-runs/")[1]!.split("?")[0]!);
          const run = Object.values(taskRunsByTaskId).flat().find((candidate) => candidate.runId === runId);
          return run
            ? new Response(JSON.stringify(run), { status: 200 })
            : new Response(JSON.stringify({ error: "missing run" }), { status: 404 });
        }
        if (url === `/v1/team/tasks/${collectTask.taskId}/run-history?limit=3&offset=0`) {
          return runHistoryResponse(collectTask.taskId, [upstreamRun]);
        }
        if (url === `/v1/team/tasks/${htmlTask.taskId}/runs` && method === "POST") {
          runPostBodies.push(init?.body);
          return new Response(JSON.stringify(createdRun), { status: 201 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      const atlas = await waitFor(() => getAtlasNodes(container));

      if (options.loadUpstream !== false) {
        fireEvent.click(await within(atlas).findByRole("button", { name: collectTask.title }));
        const upstreamMenu = await screen.findByLabelText(`${collectTask.title} 操作菜单`);
        fireEvent.click(within(upstreamMenu).getByRole("button", { name: "运行记录" }));
        const historyPanel = await screen.findByRole("region", { name: `${collectTask.title} 运行记录` });
        const historicalRow = await waitFor(() => {
          const row = historyPanel.querySelector(`[data-run-id="${upstreamRun.runId}"]`) as HTMLElement | null;
          expect(row).toBeTruthy();
          return row!;
        });
        fireEvent.click(within(historicalRow).getByRole("button", { name: "装载记录" }));
        await waitFor(() => expect(historicalRow).toHaveAttribute("data-loaded-run", "true"));
      }

      fireEvent.click(await within(atlas).findByRole("button", { name: htmlTask.title }));
      const downstreamMenu = await screen.findByLabelText(`${htmlTask.title} 操作菜单`);
      fireEvent.click(within(downstreamMenu).getByRole("button", { name: "运行" }));
      await waitFor(() => expect(runPostBodies).toHaveLength(1));
      return { runPostBodies, upstreamRun, connection };
    }

    it("sends loaded completed upstream run selection when starting a downstream Task", async () => {
      const { runPostBodies, upstreamRun, connection } = await startDownstreamTaskWithOptionalLoadedUpstream();

      expect(parsePostBody(runPostBodies[0])).toEqual({
        upstreamRunSelections: [{ connectionId: connection.connectionId, fromRunId: upstreamRun.runId }],
      });
    });

    it("keeps ordinary downstream Task run POST body empty when no upstream run is loaded", async () => {
      const { runPostBodies } = await startDownstreamTaskWithOptionalLoadedUpstream({ loadUpstream: false });

      expect(runPostBodies[0]).toBeUndefined();
    });

    it("does not send loaded upstream selection for a stale inbound connection", async () => {
      const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
      const staleConnection: TeamTaskConnection = {
        schemaVersion: "team/task-connection-1",
        connectionId: "conn_stale_collect_to_html",
        fromTaskId: collectTask.taskId,
        fromOutputPortId: "draft_md",
        toTaskId: htmlTask.taskId,
        toInputPortId: "source_md",
        type: "md",
        status: "stale",
        staleReason: "source_output_port_missing",
        createdAt: "2026-06-04T00:00:00.000Z",
        updatedAt: "2026-06-04T00:00:00.000Z",
      };
      const { runPostBodies } = await startDownstreamTaskWithOptionalLoadedUpstream({ connection: staleConnection });

      expect(runPostBodies[0]).toBeUndefined();
    });

    it.each(["failed", "cancelled", "completed_with_failures"] as const)(
      "does not send loaded upstream selection when the loaded run is %s",
      async (status) => {
        const { collectTask } = makeTypedTaskChainFixtures();
        const upstreamRun = {
          ...makeLiveTaskRunFixture(collectTask, `run_collect_loaded_${status}`),
          status,
        };
        const { runPostBodies } = await startDownstreamTaskWithOptionalLoadedUpstream({ upstreamRun });

        expect(runPostBodies[0]).toBeUndefined();
      },
    );

    it.each(["failed", "cancelled", "completed_with_failures"] as const)(
      "does not send loaded historical upstream selection when the loaded run is %s but latest summary has another completed run",
      async (status) => {
        const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
        const upstreamRun = {
          ...makeLiveTaskRunFixture(collectTask, `run_collect_loaded_history_${status}`),
          status,
        };
        const latestCompletedRun = makeLiveTaskRunFixture(collectTask, "run_collect_latest_completed");
        const { runPostBodies } = await startDownstreamTaskWithOptionalLoadedUpstream({
          upstreamRun,
          taskRunsByTaskId: {
            [collectTask.taskId]: [latestCompletedRun],
            [htmlTask.taskId]: [],
          },
        });

        expect(runPostBodies[0]).toBeUndefined();
      },
    );

    it("does not send loaded historical upstream selection while the same upstream Task has an active run", async () => {
      const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
      const historicalRun = makeLiveTaskRunFixture(collectTask, "run_collect_loaded_completed");
      const activeRun = {
        ...makeLiveTaskRunFixture(collectTask, "run_collect_active"),
        status: "running" as const,
        finishedAt: null,
      };
      const { runPostBodies } = await startDownstreamTaskWithOptionalLoadedUpstream({
        upstreamRun: historicalRun,
        taskRunsByTaskId: {
          [collectTask.taskId]: [activeRun, historicalRun],
          [htmlTask.taskId]: [],
        },
      });

      expect(runPostBodies[0]).toBeUndefined();
    });

    it("marks a loaded historical run as suppressed while the same Task has an active run", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const task = {
        ...cloneTaskFixture(),
        taskId: "task_loaded_active_override",
        title: "Loaded Active Override Task",
        workUnit: { ...cloneTaskFixture().workUnit, title: "Loaded Active Override Task" },
      };
      const runningRun = { ...makeLiveTaskRunFixture(task, "run_active_override_current"), status: "running" as const, finishedAt: null };
      const historicalRun = makeLiveTaskRunFixture(task, "run_active_override_history");

      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/team/console-layout") return new Response(JSON.stringify({ state: null, updatedAt: null }), { status: 200 });
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse([task], { [task.taskId]: [runningRun] });
        if (url === `/v1/team/tasks/${task.taskId}/run-history?limit=3&offset=0`) {
          return runHistoryResponse(task.taskId, [historicalRun]);
        }
        if (url === `/v1/team/task-runs/${runningRun.runId}?view=summary&taskId=${task.taskId}`) {
          return new Response(JSON.stringify(runningRun), { status: 200 });
        }
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      const { container } = render(<App />);
      const atlas = await waitFor(() => getAtlasNodes(container));
      const taskNode = await within(atlas).findByRole("button", { name: task.title });
      fireEvent.click(taskNode);
      const menu = await screen.findByLabelText(`${task.title} 操作菜单`);
      fireEvent.click(within(menu).getByRole("button", { name: "运行记录" }));

      const historyPanel = await screen.findByRole("region", { name: `${task.title} 运行记录` });
      const historicalRow = await waitFor(() => {
        const row = historyPanel.querySelector(`[data-run-id="${historicalRun.runId}"]`) as HTMLElement | null;
        expect(row).toBeTruthy();
        return row!;
      });
      fireEvent.click(within(historicalRow).getByRole("button", { name: "装载记录" }));

      const loadedRow = await waitFor(() => {
        const row = historyPanel.querySelector(`[data-run-id="${historicalRun.runId}"]`) as HTMLElement | null;
        expect(row).toBeTruthy();
        expect(row).toHaveAttribute("data-loaded-run", "true");
        expect(row).toHaveAttribute("data-loaded-run-state", "suppressed");
        return row!;
      });
      expect(within(loadedRow).queryByText("已装载（活跃 run 优先）")).toBeNull();
      expect(loadedRow.querySelector("[data-loaded-run-marker]")).toBeNull();
    });

    it("restores valid loaded run selection and prunes stale selections from canvas UI state", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const task = {
        ...cloneTaskFixture(),
        taskId: "task_loaded_restore",
        title: "Loaded Restore Task",
        workUnit: { ...cloneTaskFixture().workUnit, title: "Loaded Restore Task" },
      };
      const historicalRun = makeLiveTaskRunFixture(task, "run_loaded_restore_history");
      const staleTaskId = "task_missing_loaded_selection";
      window.localStorage.setItem("ugk-team-console:canvas-ui-state:v1", JSON.stringify({
        schemaVersion: 1,
        dataSource: "live",
        taskNodePositions: [{
          taskId: task.taskId,
          position: { x: 160, y: 120 },
        }],
        expandedTaskBranches: [],
        loadedTaskRunSelections: [
          { taskId: task.taskId, runId: historicalRun.runId },
          { taskId: staleTaskId, runId: "run_stale_loaded_selection" },
        ],
      }));

      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/team/console-layout") return new Response(JSON.stringify({ state: null, updatedAt: null }), { status: 200 });
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse([task], { [task.taskId]: [] });
        if (url === `/v1/team/tasks/${task.taskId}/run-history?limit=3&offset=0`) {
          return runHistoryResponse(task.taskId, [historicalRun]);
        }
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      const { container } = render(<App />);
      const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
      const taskNode = await within(atlas).findByRole("button", { name: task.title });
      fireEvent.click(taskNode);
      const menu = await screen.findByLabelText(`${task.title} 操作菜单`);
      fireEvent.click(within(menu).getByRole("button", { name: "运行记录" }));

      const historyPanel = await screen.findByRole("region", { name: `${task.title} 运行记录` });
      const loadedRow = await waitFor(() => {
        const row = historyPanel.querySelector(`[data-run-id="${historicalRun.runId}"]`) as HTMLElement | null;
        expect(row).toBeTruthy();
        expect(row).toHaveAttribute("data-loaded-run", "true");
        expect(row).toHaveAttribute("data-loaded-run-state", "loaded");
        return row!;
      });
      expect(within(loadedRow).queryByText("已装载")).toBeNull();

      await waitFor(() => {
        const raw = window.localStorage.getItem("ugk-team-console:canvas-ui-state:v1");
        expect(raw).toBeTruthy();
        const stored = JSON.parse(raw!) as { loadedTaskRunSelections?: Array<{ taskId: string; runId: string }> };
        expect(stored.loadedTaskRunSelections).toEqual([{ taskId: task.taskId, runId: historicalRun.runId }]);
        expect(stored.loadedTaskRunSelections?.some((selection) => selection.taskId === staleTaskId)).toBe(false);
      });
    });

    it("renders with old canvas UI state that has no loaded run selection field", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "mock");
      window.localStorage.setItem("ugk-team-console:canvas-ui-state:v1", JSON.stringify({
        schemaVersion: 1,
        dataSource: "mock",
        selectedFixtureId: "agent-workspace",
        taskNodePositions: mockTeamTasks.map((task, index) => ({
          taskId: task.taskId,
          position: { x: 160 + index * 220, y: 120 },
        })),
        expandedTaskBranches: [],
      }));

      const { container } = render(<App />);

      const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
      expect(await within(atlas).findByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();
    });

  });
});
