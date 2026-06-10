import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { CLEAN_AGENT_WORKSPACE_ID } from "../app/use-team-console-live-data";
import type { TeamCanvasTask } from "../api/team-types";
import {
  MOCK_AGENTS,
  mockDiscoveryRootTask,
  mockTeamTasks,
  resetMockTeamApiState,
} from "../fixtures/team-fixtures";
import { getAtlasNodes } from "./app-dom-test-utils";
import {
  byTaskRunsResponse,
  canvasTaskRun,
  generatedAttempt,
  getGeneratedCard,
  openMockDiscoverySubcanvas,
} from "./app-live-data-helpers";

describe("App task branch live data", () => {
  beforeEach(() => {
    resetMockTeamApiState();
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("clones a normal Task from the Task action menu", async () => {
    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    const normalTask = mockTeamTasks[0]!;
    const normalTaskNode = await within(atlas).findByRole("button", { name: normalTask.title });

    fireEvent.click(normalTaskNode);
    const menu = await screen.findByLabelText(`${normalTask.title} 操作菜单`);
    fireEvent.click(within(menu).getByRole("button", { name: "复制" }));

    const clonePanel = await screen.findByLabelText(`${normalTask.title} Task 复制`);
    fireEvent.change(within(clonePanel).getByLabelText("新 Task 名称"), {
      target: { value: "复制后的论坛查询 Task" },
    });
    fireEvent.click(within(clonePanel).getByRole("button", { name: "创建复制" }));

    expect(await within(getAtlasNodes(container)).findByRole("button", { name: "复制后的论坛查询 Task" })).toBeInTheDocument();
  });

  it("opens template parameters before running a live template Task with missing required bindings", async () => {
    const templateTask: TeamCanvasTask = {
      ...mockTeamTasks[0]!,
      taskId: "task_template_keyword",
      title: "全网查询 {{keyword}}",
      workUnit: {
        ...mockTeamTasks[0]!.workUnit,
        title: "全网查询 {{keyword}}",
        input: { text: "围绕 {{keyword}} 进行公开来源检索。" },
      },
      templateConfig: {
        schemaVersion: "team/task-template-1",
        parameters: [{ id: "keyword", label: "关键词", required: true }],
      },
      templateState: undefined,
    };
    const updatedTemplateTask: TeamCanvasTask = {
      ...templateTask,
      templateState: {
        schemaVersion: "team/task-template-state-1",
        currentBindings: { keyword: "MiniMax M3" },
        updatedAt: "2026-06-03T00:00:00.000Z",
      },
    };
    const run = canvasTaskRun(templateTask.taskId, "run_template_keyword");
    run.source = { type: "canvas-task", taskId: templateTask.taskId, templateBindings: { keyword: "MiniMax M3" } };

    window.localStorage.setItem("ugk-team-console:data-source", "live");
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/v1/team/console-layout") return new Response(JSON.stringify({ state: null, updatedAt: null }), { status: 200 });
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [templateTask] }), { status: 200 });
      if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
      if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === "/v1/team/task-dependencies") return new Response(JSON.stringify({ dependencies: [] }), { status: 200 });
      if (url === "/v1/team/source-nodes") return new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 });
      if (url === "/v1/team/source-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === `/v1/team/tasks/${templateTask.taskId}` && init?.method === "PATCH") {
        return new Response(JSON.stringify({ task: updatedTemplateTask }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${templateTask.taskId}/runs` && init?.method === "POST") {
        return new Response(JSON.stringify(run), { status: 201 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container));
    fireEvent.click(await within(atlas).findByRole("button", { name: templateTask.title }));
    const menu = await screen.findByLabelText(`${templateTask.title} 操作菜单`);

    fireEvent.click(within(menu).getByRole("button", { name: "运行" }));

    const parameterPanel = await screen.findByLabelText(`${templateTask.title} Task 参数`);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).not.toContain(`/v1/team/tasks/${templateTask.taskId}/runs`);
    fireEvent.change(within(parameterPanel).getByLabelText(/关键词/), {
      target: { value: "MiniMax M3" },
    });
    fireEvent.click(within(parameterPanel).getByRole("button", { name: "保存并运行" }));

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([url, init]) =>
        String(url) === `/v1/team/tasks/${templateTask.taskId}` && init?.method === "PATCH"
      )).toBe(true);
      expect(vi.mocked(fetch).mock.calls.some(([url, init]) =>
        String(url) === `/v1/team/tasks/${templateTask.taskId}/runs`
        && init?.method === "POST"
        && String(init.body).includes("MiniMax M3")
      )).toBe(true);
    });
  });

  it("renders typed template parameter controls and submits normalized string bindings", async () => {
    const templateTask: TeamCanvasTask = {
      ...mockTeamTasks[0]!,
      taskId: "task_template_email",
      title: "发送邮件 {{subject}}",
      workUnit: {
        ...mockTeamTasks[0]!.workUnit,
        title: "发送邮件 {{subject}}",
        input: { text: "发送给 {{recipients}}：{{body}}" },
      },
      templateConfig: {
        schemaVersion: "team/task-template-1",
        parameters: [
          { id: "recipients", label: "收件人", inputType: "email_list", required: true },
          { id: "subject", label: "主题", inputType: "text", required: true },
          { id: "body", label: "正文", inputType: "textarea", required: true },
          {
            id: "priority",
            label: "优先级",
            inputType: "select",
            required: false,
            defaultValue: "normal",
            options: [
              { value: "normal", label: "普通" },
              { value: "high", label: "高" },
            ],
          },
        ],
      },
      templateState: undefined,
    };
    const updatedTemplateTask: TeamCanvasTask = {
      ...templateTask,
      templateState: {
        schemaVersion: "team/task-template-state-1",
        currentBindings: {
          recipients: "first@example.com,second@example.com",
          subject: "每日简报",
          body: "<p>完成</p>",
          priority: "high",
        },
        updatedAt: "2026-06-03T00:00:00.000Z",
      },
    };
    const run = canvasTaskRun(templateTask.taskId, "run_template_email");
    run.source = {
      type: "canvas-task",
      taskId: templateTask.taskId,
      templateBindings: updatedTemplateTask.templateState!.currentBindings,
    };

    window.localStorage.setItem("ugk-team-console:data-source", "live");
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/v1/team/console-layout") return new Response(JSON.stringify({ state: null, updatedAt: null }), { status: 200 });
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [templateTask] }), { status: 200 });
      if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
      if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === "/v1/team/task-dependencies") return new Response(JSON.stringify({ dependencies: [] }), { status: 200 });
      if (url === "/v1/team/source-nodes") return new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 });
      if (url === "/v1/team/source-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === `/v1/team/tasks/${templateTask.taskId}` && init?.method === "PATCH") {
        return new Response(JSON.stringify({ task: updatedTemplateTask }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${templateTask.taskId}/runs` && init?.method === "POST") {
        return new Response(JSON.stringify(run), { status: 201 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container));
    fireEvent.click(await within(atlas).findByRole("button", { name: templateTask.title }));
    const menu = await screen.findByLabelText(`${templateTask.title} 操作菜单`);

    fireEvent.click(within(menu).getByRole("button", { name: "运行" }));

    const parameterPanel = await screen.findByLabelText(`${templateTask.title} Task 参数`);
    expect(within(parameterPanel).getByLabelText(/正文/).tagName).toBe("TEXTAREA");
    expect(within(parameterPanel).getByRole("combobox", { name: /优先级/ })).toBeInTheDocument();

    fireEvent.change(within(parameterPanel).getByLabelText(/收件人/), {
      target: { value: " first@example.com ; second@example.com " },
    });
    fireEvent.change(within(parameterPanel).getByLabelText(/主题/), {
      target: { value: "每日简报" },
    });
    fireEvent.change(within(parameterPanel).getByLabelText(/正文/), {
      target: { value: "<p>完成</p>" },
    });
    fireEvent.change(within(parameterPanel).getByRole("combobox", { name: /优先级/ }), {
      target: { value: "high" },
    });
    fireEvent.click(within(parameterPanel).getByRole("button", { name: "保存并运行" }));

    await waitFor(() => {
      const runCall = vi.mocked(fetch).mock.calls.find(([url, init]) =>
        String(url) === `/v1/team/tasks/${templateTask.taskId}/runs` && init?.method === "POST"
      );
      expect(runCall).toBeTruthy();
      expect(JSON.parse(String(runCall![1]?.body))).toEqual({
        templateBindings: {
          recipients: "first@example.com,second@example.com",
          subject: "每日简报",
          body: "<p>完成</p>",
          priority: "high",
        },
      });
    });
  });

  it("runs a live template Task directly when current bindings already exist", async () => {
    const templateTask: TeamCanvasTask = {
      ...mockTeamTasks[0]!,
      taskId: "task_template_current_keyword",
      title: "全网查询 {{keyword}}",
      templateConfig: {
        schemaVersion: "team/task-template-1",
        parameters: [{ id: "keyword", label: "关键词", required: true }],
      },
      templateState: {
        schemaVersion: "team/task-template-state-1",
        currentBindings: { keyword: "GLM-5.1" },
        updatedAt: "2026-06-03T00:00:00.000Z",
      },
    };
    const run = canvasTaskRun(templateTask.taskId, "run_template_current_keyword");
    run.source = { type: "canvas-task", taskId: templateTask.taskId, templateBindings: { keyword: "GLM-5.1" } };
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/v1/team/console-layout") return new Response(JSON.stringify({ state: null, updatedAt: null }), { status: 200 });
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [templateTask] }), { status: 200 });
      if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
      if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === "/v1/team/task-dependencies") return new Response(JSON.stringify({ dependencies: [] }), { status: 200 });
      if (url === "/v1/team/source-nodes") return new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 });
      if (url === "/v1/team/source-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === `/v1/team/tasks/${templateTask.taskId}/runs` && init?.method === "POST") {
        return new Response(JSON.stringify(run), { status: 201 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container));
    fireEvent.click(await within(atlas).findByRole("button", { name: templateTask.title }));
    const menu = await screen.findByLabelText(`${templateTask.title} 操作菜单`);

    fireEvent.click(within(menu).getByRole("button", { name: "运行" }));

    await waitFor(() => {
      const runCall = vi.mocked(fetch).mock.calls.find(([url, init]) =>
        String(url) === `/v1/team/tasks/${templateTask.taskId}/runs` && init?.method === "POST"
      );
      expect(runCall).toBeTruthy();
      expect(runCall?.[1]?.body).toBeUndefined();
    });
    expect(screen.queryByLabelText(`${templateTask.title} Task 参数`)).toBeNull();
  });

  it("opens a compact per-Task run history branch card with summary actions", async () => {
    const liveTask = mockTeamTasks[0]!;
    const latestRun = canvasTaskRun(liveTask.taskId, "run_history_latest");
    latestRun.createdAt = "2026-06-02T01:00:00.000Z";
    latestRun.startedAt = "2026-06-02T01:00:01.000Z";
    latestRun.finishedAt = "2026-06-02T01:00:04.000Z";
    const olderRun = canvasTaskRun(liveTask.taskId, "run_history_older");
    olderRun.createdAt = "2026-06-01T01:00:00.000Z";
    olderRun.startedAt = "2026-06-01T01:00:01.000Z";
    olderRun.finishedAt = "2026-06-01T01:00:05.000Z";
    const thirdRun = canvasTaskRun(liveTask.taskId, "run_history_third");
    thirdRun.createdAt = "2026-05-31T01:00:00.000Z";
    thirdRun.startedAt = "2026-05-31T01:00:01.000Z";
    thirdRun.finishedAt = "2026-05-31T01:00:05.000Z";
    const pagedRun = canvasTaskRun(liveTask.taskId, "run_history_paged");
    pagedRun.createdAt = "2026-05-30T01:00:00.000Z";
    pagedRun.startedAt = "2026-05-30T01:00:01.000Z";
    pagedRun.finishedAt = "2026-05-30T01:00:05.000Z";
    const attempt = generatedAttempt(liveTask.taskId, "attempt_history_latest");

    window.localStorage.setItem("ugk-team-console:data-source", "live");
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/v1/team/console-layout") return new Response(JSON.stringify({ state: null, updatedAt: null }), { status: 200 });
      if (url === "/v1/agents") {
        return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      }
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({ [liveTask.taskId]: [latestRun] });
      }
      if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === "/v1/team/task-dependencies") return new Response(JSON.stringify({ dependencies: [] }), { status: 200 });
      if (url === "/v1/team/source-nodes") return new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 });
      if (url === "/v1/team/source-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === `/v1/team/tasks/${liveTask.taskId}/run-history?limit=3&offset=0`) {
        return new Response(JSON.stringify({
          taskId: liveTask.taskId,
          total: 4,
          limit: 3,
          offset: 0,
          hasMore: true,
          runs: [
            { run: latestRun, annotation: { runId: latestRun.runId, taskId: liveTask.taskId, best: false, archived: false, updatedAt: "2026-06-02T01:00:05.000Z" } },
            { run: olderRun, annotation: { runId: olderRun.runId, taskId: liveTask.taskId, best: true, archived: false, note: "质量最好", updatedAt: "2026-06-01T01:00:05.000Z" } },
            { run: thirdRun, annotation: { runId: thirdRun.runId, taskId: liveTask.taskId, best: false, archived: false, updatedAt: "2026-05-31T01:00:05.000Z" } },
          ],
        }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${liveTask.taskId}/run-history?limit=3&offset=3`) {
        return new Response(JSON.stringify({
          taskId: liveTask.taskId,
          total: 4,
          limit: 3,
          offset: 3,
          hasMore: false,
          runs: [
            { run: pagedRun, annotation: { runId: pagedRun.runId, taskId: liveTask.taskId, best: false, archived: false, updatedAt: "2026-05-30T01:00:05.000Z" } },
          ],
        }), { status: 200 });
      }
      if (url === `/v1/team/task-runs/${latestRun.runId}/tasks/${liveTask.taskId}/attempts`) {
        return new Response(JSON.stringify({ attempts: [attempt] }), { status: 200 });
      }
      if (url === `/v1/team/task-runs/${latestRun.runId}/tasks/${liveTask.taskId}/attempts/${attempt.attemptId}/files/accepted-result.md`) {
        return new Response("accepted history result", { status: 200 });
      }
      if (url === `/v1/team/task-runs/${latestRun.runId}/annotation` && init?.method === "PATCH") {
        return new Response(JSON.stringify({
          annotation: { runId: latestRun.runId, taskId: liveTask.taskId, best: true, archived: false, updatedAt: "2026-06-02T01:00:06.000Z" },
        }), { status: 200 });
      }
      if (url === `/v1/team/task-runs/${olderRun.runId}/annotation` && init?.method === "PATCH") {
        return new Response(JSON.stringify({
          annotation: { runId: olderRun.runId, taskId: liveTask.taskId, best: true, archived: true, note: "质量最好", updatedAt: "2026-06-01T01:00:06.000Z" },
        }), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container));
    const taskNode = await within(atlas).findByRole("button", { name: liveTask.title });
    fireEvent.click(taskNode);
    const menu = await screen.findByLabelText(`${liveTask.title} 操作菜单`);

    fireEvent.click(within(menu).getByRole("button", { name: "运行记录" }));
    const historyPanel = await screen.findByRole("region", { name: `${liveTask.title} 运行记录` });
    expect(screen.queryByRole("complementary", { name: `${liveTask.title} 运行记录` })).toBeNull();

    const latestRow = historyPanel.querySelector(`[data-run-id="${latestRun.runId}"]`) as HTMLElement | null;
    const olderRow = historyPanel.querySelector(`[data-run-id="${olderRun.runId}"]`) as HTMLElement | null;
    expect(latestRow).toBeTruthy();
    expect(olderRow).toBeTruthy();
    expect(historyPanel.querySelector(`[data-run-id="${thirdRun.runId}"]`)).toBeTruthy();
    expect(historyPanel.querySelector(`[data-run-id="${pagedRun.runId}"]`)).toBeNull();
    expect(within(historyPanel).getByText("3 / 4")).toBeInTheDocument();
    expect(latestRow).toHaveAttribute("data-run-status", "completed");
    expect(latestRow).toHaveTextContent("状态");
    expect(latestRow).toHaveTextContent("开始时间");
    expect(latestRow).toHaveTextContent("执行时间");
    expect(latestRow).not.toHaveTextContent("run_history_latest");
    expect(olderRow).not.toHaveTextContent("run_history_older");
    expect(historyPanel).not.toHaveTextContent("质量最好");
    expect(within(latestRow!).getAllByRole("button")).toHaveLength(4);
    expect(within(latestRow!).getByRole("button", { name: "查看运行过程" })).toBeInTheDocument();
    expect(within(latestRow!).getByRole("button", { name: "装载记录" })).toBeInTheDocument();
    expect(within(latestRow!).getByRole("button", { name: "标为最佳" })).toBeInTheDocument();
    expect(within(latestRow!).getByRole("button", { name: "归档记录" })).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).not.toContain(
      `/v1/team/task-runs/${latestRun.runId}/tasks/${liveTask.taskId}/attempts`,
    );

    fireEvent.click(within(historyPanel).getByRole("button", { name: "加载更多" }));
    await waitFor(() => {
      expect(historyPanel.querySelector(`[data-run-id="${pagedRun.runId}"]`)).toBeTruthy();
      expect(within(historyPanel).getByText("4 / 4")).toBeInTheDocument();
    });
    expect(vi.mocked(fetch).mock.calls.some(([url]) =>
      String(url) === `/v1/team/tasks/${liveTask.taskId}/run-history?limit=3&offset=3`
    )).toBe(true);

    fireEvent.click(within(latestRow!).getByRole("button", { name: "标为最佳" }));
    await waitFor(() => {
      expect(historyPanel.querySelector(`[data-run-id="${latestRun.runId}"]`)).toHaveAttribute("data-run-best", "true");
    });

    fireEvent.click(within(olderRow!).getByRole("button", { name: "归档记录" }));
    await waitFor(() => {
      expect(historyPanel.querySelector(`[data-run-id="${olderRun.runId}"]`)).toBeNull();
    });
  });

  it("restores an open Discovery subcanvas from stored Task branch state", async () => {
    window.localStorage.setItem("ugk-team-console:canvas-ui-state:v1", JSON.stringify({
      schemaVersion: 1,
      dataSource: "mock",
      selectedFixtureId: CLEAN_AGENT_WORKSPACE_ID,
      expandedTaskBranches: [{
        nodeId: `task-node-${mockDiscoveryRootTask.taskId}`,
        taskId: mockDiscoveryRootTask.taskId,
        detailMode: "discovery-subcanvas",
        discoveryStaleExpanded: true,
      }],
    }));

    const { container } = render(<App />);

    await waitFor(() => {
      const panel = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(panel).toBeTruthy();
      expect(getGeneratedCard(panel!, "task_generated_hetzner")).toHaveAttribute("data-generated-item-status", "stale");
    }, { timeout: 2500 });
  });

  it("hydrates a generated edit draft when restored Discovery branch state includes a generated edit id", async () => {
    window.localStorage.setItem("ugk-team-console:canvas-ui-state:v1", JSON.stringify({
      schemaVersion: 1,
      dataSource: "mock",
      selectedFixtureId: CLEAN_AGENT_WORKSPACE_ID,
      expandedTaskBranches: [{
        nodeId: `task-node-${mockDiscoveryRootTask.taskId}`,
        taskId: mockDiscoveryRootTask.taskId,
        detailMode: "discovery-subcanvas",
        discoveryGeneratedEditTaskId: "task_generated_vultr",
      }],
    }));

    const { container } = render(<App />);

    const panel = await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    }, { timeout: 2500 });
    const vultrCard = getGeneratedCard(panel, "task_generated_vultr");
    expect(vultrCard).toHaveAttribute("data-generated-editing", "true");
    await waitFor(() => {
      expect(container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]')).toBeTruthy();
    });
  });

  it("clears a generated child edit draft when the root Discovery branch is closed", async () => {
    const staleTitle = "Unsaved stale generated title";
    const { container } = render(<App />);
    const { panel } = await openMockDiscoverySubcanvas(container);
    const vultrCard = getGeneratedCard(panel, "task_generated_vultr");

    fireEvent.click(vultrCard.querySelector('[data-generated-action="edit"]')!);
    const firstEditPanel = await waitFor(() => {
      const node = container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.change(within(firstEditPanel).getByLabelText("Task 名称"), {
      target: { value: staleTitle },
    });

    fireEvent.click(screen.getByRole("button", { name: `收起 ${mockDiscoveryRootTask.title} Task 操作` }));
    await waitFor(() => {
      expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeNull();
      expect(container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]')).toBeNull();
    });

    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    fireEvent.click(within(atlas).getByRole("button", { name: "发现云服务候选" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
    const reopenedPanel = await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    const reopenedCard = getGeneratedCard(reopenedPanel, "task_generated_vultr");
    fireEvent.click(reopenedCard.querySelector('[data-generated-action="edit"]')!);

    const reopenedEditPanel = await waitFor(() => {
      const node = container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    expect(within(reopenedEditPanel).getByLabelText("Task 名称")).toHaveValue("核查 Vultr 公开证据");
    expect(within(reopenedEditPanel).getByLabelText("Task 名称")).not.toHaveValue(staleTitle);
  });

  it("ignores malformed stored generated observer state without dropping the Discovery subcanvas branch", async () => {
    window.localStorage.setItem("ugk-team-console:canvas-ui-state:v1", JSON.stringify({
      schemaVersion: 1,
      dataSource: "mock",
      selectedFixtureId: CLEAN_AGENT_WORKSPACE_ID,
      expandedTaskBranches: [{
        nodeId: `task-node-${mockDiscoveryRootTask.taskId}`,
        taskId: mockDiscoveryRootTask.taskId,
        detailMode: "discovery-subcanvas",
        discoveryGeneratedObserver: { taskId: 123, runId: "" },
      }],
    }));

    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
    }, { timeout: 2500 });
    expect(container.querySelector("[data-generated-observer-task-id]")).toBeNull();
  });

});
