import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { useTeamConsoleLiveData } from "../app/use-team-console-live-data";
import type { TeamCanvasTask, TeamRunState } from "../api/team-types";
import {
  MOCK_AGENTS,
  mockDiscoveryGeneratedTasks,
  mockDiscoveryRootTask,
  mockTeamTasks,
  resetMockTeamApiState,
} from "../fixtures/team-fixtures";
import { getAtlasNodes, firePointer, deferred } from "./app-dom-test-utils";
import {
  byTaskRunsResponse,
  canvasTaskRun,
  expectRootFilterCount,
  generatedSummary,
  noop,
  rootSummaryResponse,
} from "./app-live-data-helpers";

function LiveDataProbe({ openDiscoveryTaskIds = [] }: { openDiscoveryTaskIds?: string[] } = {}) {
  const liveData = useTeamConsoleLiveData({
    onApplyLiveTasks: noop,
    onApplyLiveSources: noop,
    onCloseBranches: noop,
    onResetContextUi: noop,
    selectedTaskId: null,
    openDiscoveryTaskIds,
  });
  return (
    <div>
      <pre data-testid="live-data-probe">
        {JSON.stringify({
          tasks: liveData.tasks.map((task) => task.taskId),
          generated: Object.fromEntries(Object.entries(liveData.generatedTasksByDiscoveryTaskId).map(([taskId, tasks]) => [
            taskId,
            tasks.map((task) => task.taskId),
          ])),
          runKeys: Object.keys(liveData.taskRunsByTaskId).sort(),
          summaries: liveData.discoverySummariesByTaskId,
          diagnostics: (liveData as {
            discoveryDispatchDiagnosticsByTaskId?: Record<string, Array<{ itemId: string; error: string | null }>>;
          }).discoveryDispatchDiagnosticsByTaskId ?? {},
          refreshing: liveData.liveTasksRefreshing,
        })}
      </pre>
      <button type="button" onClick={() => void liveData.refreshLiveTasks()}>probe refresh</button>
    </div>
  );
}

type LiveReferenceSnapshot = {
  task: TeamCanvasTask | null;
  run: TeamRunState | null;
  generated: TeamCanvasTask | null;
  generatedHasWorkUnit: boolean;
};

let latestLiveReferenceSnapshot: LiveReferenceSnapshot | null = null;

function LiveReferenceProbe({
  openDiscoveryTaskIds = [],
  targetTaskId,
}: { openDiscoveryTaskIds?: string[]; targetTaskId?: string } = {}) {
  const liveData = useTeamConsoleLiveData({
    onApplyLiveTasks: noop,
    onApplyLiveSources: noop,
    onCloseBranches: noop,
    onResetContextUi: noop,
    selectedTaskId: null,
    openDiscoveryTaskIds,
  });
  const task = (targetTaskId ? liveData.tasks.find((candidate) => candidate.taskId === targetTaskId) : null)
    ?? liveData.tasks[0]
    ?? null;
  const run = task ? liveData.taskRunsByTaskId[task.taskId]?.[0] ?? null : null;
  const generated = Object.values(liveData.generatedTasksByDiscoveryTaskId).flat()
    .find((candidate) => candidate.taskId === "task_generated_vultr") ?? null;
  latestLiveReferenceSnapshot = {
    task,
    run,
    generated,
    generatedHasWorkUnit: Boolean((generated as Partial<TeamCanvasTask> | null)?.workUnit),
  };
  return (
    <div>
      <button type="button" onClick={() => void liveData.refreshLiveTasks()}>probe refresh</button>
      <button type="button" onClick={() => void liveData.ensureGeneratedTaskDetail("task_generated_vultr")}>ensure generated detail</button>
    </div>
  );
}

function readLiveDataProbe(): {
  tasks: string[];
  generated: Record<string, string[]>;
  runKeys: string[];
  summaries: Record<string, {
    generatedTaskCount: number;
    activeGeneratedTaskCount: number;
    staleGeneratedTaskCount: number;
    runningGeneratedRunCount: number;
    failedDispatchCount?: number;
  }>;
  diagnostics: Record<string, Array<{ itemId: string; error: string | null }>>;
  refreshing?: boolean;
} {
  return JSON.parse(screen.getByTestId("live-data-probe").textContent || "{}");
}

describe("App", () => {
  beforeEach(() => {
    resetMockTeamApiState();
    latestLiveReferenceSnapshot = null;
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("live data", () => {
    it("has mock and live options", () => {
      render(<App />);
      const options = screen.getAllByRole("option");
      const values = options.map((o) => (o as HTMLOptionElement).value);
      const labels = options.map((o) => o.textContent);
      expect(values).toContain("mock");
      expect(values).toContain("live");
      expect(labels).toContain("示例数据");
      expect(labels).toContain("实时 API");
      expect(screen.queryByText("示例：")).toBeNull();
    });

    it("does not render the obsolete mock fixture switcher", () => {
      render(<App />);

      expect(screen.queryByRole("button", { name: "发现 + 逐项处理" })).toBeNull();
      expect(screen.queryByRole("button", { name: "任务拆分" })).toBeNull();
      expect(screen.queryByText("Discovery + ForEach")).toBeNull();
      expect(screen.queryByText("Decomposition split")).toBeNull();
    });

    it("keeps Live API on a clean agent workspace until a run is requested", async () => {
      const liveTask = mockTeamTasks[0]!;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse({ tasks: [liveTask] });
        return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500 });
      });

      render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await waitFor(() => expect(fetch).toHaveBeenCalledWith("/v1/team/console/root-summary"));
      const calledUrls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
      expect(calledUrls).toEqual(expect.arrayContaining([
        "/v1/agents",
        "/v1/team/console/root-summary",
      ]));
      expect(fetch).toHaveBeenCalledWith("/v1/agents/status", {
        method: "GET",
        headers: { accept: "application/json" },
      });
      expect(screen.queryByText("运行图：")).toBeNull();
      expect(screen.queryByRole("button", { name: "Agent workspace" })).toBeNull();
      expect(screen.queryByRole("button", { name: "最新 Run" })).toBeNull();
      expect(screen.queryByText("执行运行")).toBeNull();
      expect(screen.queryByText("Research vendor A")).toBeNull();
      expect(calledUrls).not.toContain("/v1/team/plans");
      expect(calledUrls).not.toContain("/v1/team/runs");
      expect(calledUrls).not.toContain("/v1/team/tasks");
      expect(calledUrls).not.toContain("/v1/team/task-connections");
      expect(calledUrls.filter((url) => /^\/v1\/team\/tasks\/[^/]+\/runs$/.test(url))).toHaveLength(0);
      expect(calledUrls.some((url) => url.includes("/run-history"))).toBe(false);
      expect(calledUrls.some((url) => url.includes("/attempts"))).toBe(false);
      expect(await screen.findByText(liveTask.title)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "添加 Agent" })).toBeEnabled();
    });

    it("keeps Live API usable when the typed connection endpoint is not deployed yet", async () => {
      const liveTask = mockTeamTasks[0]!;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return new Response("not found", { status: 404 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
        if (url === "/v1/team/task-connections") return new Response("not found", { status: 404 });
        if (url === "/v1/team/task-dependencies") return new Response(JSON.stringify({ dependencies: [] }), { status: 200 });
        if (url === "/v1/team/source-nodes") return new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 });
        if (url === "/v1/team/source-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
        return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await waitFor(() => expect(fetch).toHaveBeenCalledWith("/v1/team/task-connections"));
      expect(screen.queryByText("请求失败 (404)")).toBeNull();
      expect(await screen.findByText(liveTask.title)).toBeInTheDocument();
      expect(container.querySelector(".task-create-btn")).toBeEnabled();
    });

    it("loads live agent catalog when switching to Live API", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [{ agentId: "main", name: "主 Agent", status: "idle" }] }), { status: 200 });
        }
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse();
        return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500 });
      });

      render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await waitFor(() => expect(fetch).toHaveBeenCalledWith("/v1/team/console/root-summary"));
      const calledUrls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
      expect(calledUrls).toEqual(expect.arrayContaining([
        "/v1/agents",
        "/v1/team/console/root-summary",
      ]));
      expect(fetch).toHaveBeenCalledWith("/v1/agents/status", {
        method: "GET",
        headers: { accept: "application/json" },
      });
    });

    it("keeps Task creation disabled in mock mode", () => {
      const { container } = render(<App />);

      const createTaskButton = screen.getByRole("button", { name: "创建 Task" });
      expect(createTaskButton).toBeDisabled();

      fireEvent.click(createTaskButton);

      expect(container.querySelector(".agent-playground-branch")).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });

    it("shows live leader choices from the Agent catalog for Task creation", async () => {
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
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        return new Response(JSON.stringify([]), { status: 200 });
      });

      render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(fetch).toHaveBeenCalledWith("/v1/team/tasks"));

      const createTaskButton = screen.getByRole("button", { name: "创建 Task" });
      expect(createTaskButton).toBeEnabled();
      fireEvent.click(createTaskButton);

      const leaderCatalog = screen.getByLabelText("Task leader catalog");
      expect(within(leaderCatalog).getByRole("button", { name: /主 Agent[\s\S]*main/ })).toBeInTheDocument();
      expect(within(leaderCatalog).getByRole("button", { name: /搜索 Agent[\s\S]*search/ })).toBeInTheDocument();
    });

    it("adds the selected leader Agent and opens a Task creation branch", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(fetch).toHaveBeenCalledWith("/v1/team/tasks"));

      fireEvent.click(screen.getByRole("button", { name: "创建 Task" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      const leaderNode = container.querySelector('.emap-agent-node[data-agent-id="main"]');
      expect(leaderNode).toBeTruthy();
      const branch = container.querySelector(".agent-playground-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      expect(within(branch!).getByText("创建 Task")).toBeInTheDocument();
      expect(within(branch!).getByText("主 Agent")).toBeInTheDocument();
      const iframe = branch!.querySelector("iframe") as HTMLIFrameElement | null;
      expect(iframe).toHaveAttribute("title", "主 Agent Task 创建");
      expect(iframe).toHaveAttribute("allow", "clipboard-write; clipboard-read");
      expect(iframe?.getAttribute("src")).toContain("/playground?view=chat&agentId=main");
      expect(iframe?.getAttribute("src")).toContain("embed=team-console");
      expect(iframe?.getAttribute("src")).toContain("embedMode=full");
      expect(iframe?.getAttribute("src")).toContain("teamTaskMode=create");
      expect(iframe?.getAttribute("src")).not.toContain("teamTaskId=");
    });

    it("refreshes live Task cards from the Task toolbar action", async () => {
      const liveTask = mockTeamTasks[0]!;
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          return new Response(JSON.stringify({ tasks: taskRequests === 1 ? [] : [liveTask] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(taskRequests).toBe(1));
      expectRootFilterCount("Task", 0);

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

      await waitFor(() => expect(taskRequests).toBe(2));
      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();
      expectRootFilterCount("Task", 1);
    });

    it("keeps existing live Task cards and shows an error when Task refresh fails", async () => {
      const liveTask = mockTeamTasks[0]!;
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          if (taskRequests === 1) {
            return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
          }
          return new Response("down", { status: 500 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

      expect(await screen.findByText("请求失败 (500)")).toBeInTheDocument();
      expect(within(getAtlasNodes(container)).getByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();
      expectRootFilterCount("Task", 1);
    });

    it("clears a stale Task refresh error after a later successful refresh", async () => {
      const liveTask = mockTeamTasks[0]!;
      const refreshedTask = {
        ...liveTask,
        taskId: "task_error_recovered",
        title: "错误恢复后的 Task",
        workUnit: {
          ...liveTask.workUnit,
          title: "错误恢复后的 Task",
        },
      };
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          if (taskRequests === 1) {
            return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
          }
          if (taskRequests === 2) {
            return new Response("down", { status: 500 });
          }
          return new Response(JSON.stringify({ tasks: [liveTask, refreshedTask] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));
      expect(await screen.findByText("请求失败 (500)")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "错误恢复后的 Task" })).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText("请求失败 (500)")).toBeNull());
    });

    it("deduplicates concurrent live Task refresh clicks", async () => {
      const firstTask = mockTeamTasks[0]!;
      const secondTask = {
        ...firstTask,
        taskId: "task_refresh_deduped",
        title: "刷新防重后的 Task",
        workUnit: {
          ...firstTask.workUnit,
          title: "刷新防重后的 Task",
        },
      };
      const refreshResponse = deferred<Response>();
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          if (taskRequests === 1) {
            return new Response(JSON.stringify({ tasks: [firstTask] }), { status: 200 });
          }
          if (taskRequests === 2) {
            return refreshResponse.promise;
          }
          return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));
      const refreshingButton = await screen.findByRole("button", { name: "刷新中..." });
      expect(refreshingButton).toBeDisabled();
      fireEvent.click(refreshingButton);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(taskRequests).toBe(2);

      refreshResponse.resolve(new Response(JSON.stringify({ tasks: [firstTask, secondTask] }), { status: 200 }));

      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "刷新防重后的 Task" })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("button", { name: "刷新 Task" })).toBeEnabled());
      expectRootFilterCount("Task", 2);
    });

    it("refreshes live Task cards after closing a Task creation branch", async () => {
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(taskRequests).toBe(1));

      fireEvent.click(screen.getByRole("button", { name: "创建 Task" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(screen.getByRole("button", { name: /收起 主 Agent 创建 Task分支/ }));

      await waitFor(() => expect(taskRequests).toBe(2));
    });

    it("refreshes live Task cards after leaving a Task creation branch for an Agent chat branch", async () => {
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(taskRequests).toBe(1));

      fireEvent.click(screen.getByRole("button", { name: "创建 Task" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      const agentNode = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
      expect(agentNode).toBeTruthy();
      fireEvent.click(agentNode!);

      await waitFor(() => expect(taskRequests).toBe(2));
      expect(screen.getByLabelText("主 Agent 主项目对话")).toBeInTheDocument();
    });

    it("keeps live Task creation branch when opening an existing Task branch", async () => {
      const liveTask = mockTeamTasks[0]!;
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      expect(taskRequests).toBe(1);

      fireEvent.click(screen.getByRole("button", { name: "创建 Task" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(taskNode);

      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());
      expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
      expect(taskRequests).toBe(1);
      expect(screen.getByLabelText("调查 Medtrum 云资产 Task 操作")).toBeInTheDocument();
    });

    it("persists Live API agent cards and dragged positions across remounts", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [{ agentId: "main", name: "主 Agent", status: "idle" }] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const first = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      const firstAgentNode = within(getAtlasNodes(first.container)).getByRole("button", { name: "主 Agent" }) as HTMLElement;
      firePointer(firstAgentNode, "pointerdown", { pointerId: 31, clientX: 120, clientY: 120 });
      firePointer(firstAgentNode, "pointermove", { pointerId: 31, clientX: 190, clientY: 155 });
      firePointer(firstAgentNode, "pointerup", { pointerId: 31, clientX: 190, clientY: 155, buttons: 0 });

      await waitFor(() => {
        expect(window.localStorage.getItem("ugk-team-console:data-source")).toBe("live");
        expect(window.localStorage.getItem("ugk-team-console:live-agent-layout:v1")).toContain("\"agentId\":\"main\"");
      });
      first.unmount();

      const second = render(<App />);
      expect(await screen.findByRole("combobox", undefined, { timeout: 2500 })).toHaveValue("live");

      const restoredAgentNode = await within(getAtlasNodes(second.container)).findByRole("button", { name: "主 Agent" }) as HTMLElement;
      expect(Number.parseFloat(restoredAgentNode.style.left)).toBeCloseTo(430, 4);
      expect(Number.parseFloat(restoredAgentNode.style.top)).toBeCloseTo(35, 4);
    });

    it("persists Live API Task card positions without storing Task definitions", async () => {
      const liveTask = mockTeamTasks[0]!;
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
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        }
        if (url === "/v1/team/tasks") {
          return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const first = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const firstTaskNode = await within(getAtlasNodes(first.container)).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      firePointer(firstTaskNode, "pointerdown", { pointerId: 41, clientX: 120, clientY: 120 });
      firePointer(firstTaskNode, "pointermove", { pointerId: 41, clientX: 190, clientY: 155 });
      firePointer(firstTaskNode, "pointerup", { pointerId: 41, clientX: 190, clientY: 155, buttons: 0 });

      await waitFor(() => {
        const stored = JSON.parse(window.localStorage.getItem("ugk-team-console:live-task-layout:v1") ?? "{}") as {
          schemaVersion?: number;
          tasks?: Array<{ taskId: string; position: { x: number; y: number }; title?: string }>;
        };
        expect(stored.schemaVersion).toBe(1);
        expect(stored.tasks?.[0]).toEqual({
          taskId: "task_research_medtrum",
          position: { x: 350, y: 255 },
        });
        expect(JSON.stringify(stored)).not.toContain("workUnit");
        expect(JSON.stringify(stored)).not.toContain("leaderAgentId");
      });
      first.unmount();

      const second = render(<App />);
      expect(await screen.findByRole("combobox", undefined, { timeout: 2500 })).toHaveValue("live");
      const restoredTaskNode = await within(getAtlasNodes(second.container)).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      expect(Number.parseFloat(restoredTaskNode.style.left)).toBeCloseTo(350, 4);
      expect(Number.parseFloat(restoredTaskNode.style.top)).toBeCloseTo(255, 4);
    });

    it("keeps live Task refresh storage limited to layout metadata", async () => {
      const firstTask = mockTeamTasks[0]!;
      const secondTask = {
        ...firstTask,
        taskId: "task_refresh_storage",
        title: "刷新后只存布局的 Task",
        leaderAgentId: "search",
        workUnit: {
          ...firstTask.workUnit,
          title: "刷新后只存布局的 Task",
        },
      };
      let taskRequests = 0;
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
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        }
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          return new Response(JSON.stringify({
            tasks: taskRequests === 1 ? [firstTask] : [firstTask, secondTask],
          }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const firstTaskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      const firstTaskX = Number.parseFloat(firstTaskNode.style.left);
      const firstTaskY = Number.parseFloat(firstTaskNode.style.top);

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

      const secondTaskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "刷新后只存布局的 Task" }) as HTMLElement;
      const refreshedFirstTaskNode = within(getAtlasNodes(container)).getByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      expect(Number.parseFloat(refreshedFirstTaskNode.style.left)).toBeCloseTo(firstTaskX, 4);
      expect(Number.parseFloat(refreshedFirstTaskNode.style.top)).toBeCloseTo(firstTaskY, 4);
      expect(Number.parseFloat(secondTaskNode.style.top)).toBeGreaterThanOrEqual(220);

      await waitFor(() => {
        const stored = JSON.parse(window.localStorage.getItem("ugk-team-console:live-task-layout:v1") ?? "{}") as {
          tasks?: Array<Record<string, unknown>>;
        };
        expect(stored.tasks?.every((task) => (
          "taskId" in task
          && "position" in task
          && !("title" in task)
          && !("leaderAgentId" in task)
          && !("workUnit" in task)
        ))).toBe(true);
      });
    });

    it("refreshes live Task cards from the toolbar without a run mode switch", async () => {
      const firstTask = mockTeamTasks[0]!;
      const secondTask = {
        ...firstTask,
        taskId: "task_refresh_created",
        title: "刷新后出现的新 Task",
        workUnit: {
          ...firstTask.workUnit,
          title: "刷新后出现的新 Task",
        },
      };
      let taskRequests = 0;
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
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        }
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          return new Response(JSON.stringify({
            tasks: taskRequests === 1 ? [firstTask] : [firstTask, secondTask],
          }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

      await waitFor(() => expect(taskRequests).toBe(2));
      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "刷新后出现的新 Task" })).toBeInTheDocument();
    });

    it("keeps dragged live Task positions after a live Task refresh", async () => {
      const liveTask = mockTeamTasks[0]!;
      let taskRequests = 0;
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
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        }
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      firePointer(taskNode, "pointerdown", { pointerId: 42, clientX: 120, clientY: 120 });
      firePointer(taskNode, "pointermove", { pointerId: 42, clientX: 190, clientY: 155 });
      firePointer(taskNode, "pointerup", { pointerId: 42, clientX: 190, clientY: 155, buttons: 0 });

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

      await waitFor(() => expect(taskRequests).toBe(2));
      const refreshedTaskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      expect(Number.parseFloat(refreshedTaskNode.style.left)).toBeCloseTo(350, 4);
      expect(Number.parseFloat(refreshedTaskNode.style.top)).toBeCloseTo(255, 4);
    });

    it("keeps live agent workspace usable when no live team run exists", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [{ agentId: "main", name: "主 Agent", status: "idle" }] }), { status: 200 });
        }
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse();
        return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await waitFor(() => expect(fetch).toHaveBeenCalledWith("/v1/team/console/root-summary"));
      const calledUrls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
      expect(calledUrls).not.toContain("/v1/team/runs");
      expect(calledUrls).not.toContain("/v1/team/tasks");
      expect(calledUrls.filter((url) => /^\/v1\/team\/tasks\/[^/]+\/runs$/.test(url))).toHaveLength(0);
      expect(calledUrls.some((url) => url.includes("/run-history"))).toBe(false);
      expect(calledUrls.some((url) => url.includes("/attempts"))).toBe(false);
      expect(screen.queryByText("没有可显示的 live run")).toBeNull();
      expect(screen.getByRole("button", { name: "添加 Agent" })).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      expect(within(getAtlasNodes(container)).getByText("主 Agent")).toBeInTheDocument();
    });

    it("shows an error banner when live loading fails", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("down", { status: 500 }));

      render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      expect(await screen.findByText("请求失败 (500)")).toBeInTheDocument();
    });

    it("listTaskRunsByTaskIds([]) does not trigger a fetch call", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const liveTask = mockTeamTasks[0]!;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      render(<LiveDataProbe />);

      await waitFor(() => expect(readLiveDataProbe().tasks).toEqual([liveTask.taskId]));

      const byTaskUrls = vi.mocked(fetch).mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.startsWith("/v1/team/task-runs/by-task?"));
      expect(byTaskUrls).toHaveLength(1);
      const params = new URLSearchParams(byTaskUrls[0]!.split("?")[1]);
      expect(params.get("taskIds")).toBe(liveTask.taskId);
    });

    it("splits >100 taskIds into multiple bulk by-task requests and merges results", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const { TASK_RUNS_BY_TASK_IDS_CHUNK_SIZE } = await import("../api/team-api");
      const rootTask = mockTeamTasks[0]!;
      const discoveryTask = mockDiscoveryRootTask;
      const generatedTasks: TeamCanvasTask[] = [];
      for (let i = 0; i < TASK_RUNS_BY_TASK_IDS_CHUNK_SIZE + 5; i++) {
        const baseGen = mockDiscoveryGeneratedTasks[0]!;
        generatedTasks.push({
          ...baseGen,
          taskId: `task_gen_bulk_${i}`,
          title: `Generated ${i}`,
          workUnit: { ...baseGen.workUnit, title: `Generated ${i}` },
          generatedSource: {
            ...baseGen.generatedSource!,
            sourceItemId: `item_${i}`,
            itemPayload: { id: `item_${i}`, title: `Item ${i}` },
          },
        });
      }
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") return rootSummaryResponse({ tasks: [rootTask, discoveryTask] });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [rootTask, discoveryTask] }), { status: 200 });
        if (url.startsWith(`/v1/team/tasks/${discoveryTask.taskId}/generated-tasks`)) {
          return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) {
          return byTaskRunsResponse({});
        }
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      render(<LiveDataProbe openDiscoveryTaskIds={[discoveryTask.taskId]} />);

      await waitFor(() => {
        expect(readLiveDataProbe().generated[discoveryTask.taskId]).toHaveLength(TASK_RUNS_BY_TASK_IDS_CHUNK_SIZE + 5);
      });

      const byTaskUrls = vi.mocked(fetch).mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.startsWith("/v1/team/task-runs/by-task?"));
      expect(byTaskUrls.length).toBeGreaterThanOrEqual(2);
      const individualRunCalls = vi.mocked(fetch).mock.calls
        .map(([url]) => String(url))
        .filter((url) => /^\/v1\/team\/tasks\/[^/]+\/runs$/.test(url));
      expect(individualRunCalls).toHaveLength(0);

      const requestedTaskIds = new Set(
        byTaskUrls.flatMap((url) => new URLSearchParams(url.split("?")[1]).get("taskIds")?.split(",") ?? []),
      );
      expect([...requestedTaskIds].sort()).toEqual([...new Set([discoveryTask.taskId, ...generatedTasks.map((t) => t.taskId)])].sort());
    });

    it("keeps runsByTaskId state when >100 root+generated ids are loaded without N+1 fallback", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const { TASK_RUNS_BY_TASK_IDS_CHUNK_SIZE } = await import("../api/team-api");
      const rootTask = mockTeamTasks[0]!;
      const discoveryTask = mockDiscoveryRootTask;
      const generatedTasks: TeamCanvasTask[] = [];
      for (let i = 0; i < TASK_RUNS_BY_TASK_IDS_CHUNK_SIZE + 2; i++) {
        const baseGen = mockDiscoveryGeneratedTasks[0]!;
        generatedTasks.push({
          ...baseGen,
          taskId: `task_gen_state_${i}`,
          title: `Gen state ${i}`,
          workUnit: { ...baseGen.workUnit, title: `Gen state ${i}` },
          generatedSource: {
            ...baseGen.generatedSource!,
            sourceItemId: `item_state_${i}`,
            itemPayload: { id: `item_state_${i}`, title: `Item state ${i}` },
          },
        });
      }
      const runForRoot = canvasTaskRun(rootTask.taskId, "run_state_root");
      const runForDiscovery = canvasTaskRun(discoveryTask.taskId, "run_state_discovery");
      const runsByTaskId: Record<string, TeamRunState[]> = {
        [rootTask.taskId]: [runForRoot],
        [discoveryTask.taskId]: [runForDiscovery],
      };
      for (let i = 0; i < 3; i++) {
        const genId = generatedTasks[i]!.taskId;
        runsByTaskId[genId] = [canvasTaskRun(genId, `run_state_gen_${i}`, i === 0 ? "running" : "completed")];
      }
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [rootTask, discoveryTask] }), { status: 200 });
        if (url.startsWith(`/v1/team/tasks/${discoveryTask.taskId}/generated-tasks`)) {
          return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) {
          return byTaskRunsResponse(runsByTaskId);
        }
        if (url === "/v1/team/task-runs/run_state_gen_0") {
          return new Response(JSON.stringify(runsByTaskId[generatedTasks[0]!.taskId]![0]), { status: 200 });
        }
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      render(<LiveDataProbe openDiscoveryTaskIds={[discoveryTask.taskId]} />);

      await waitFor(() => {
        const probe = readLiveDataProbe();
        expect(probe.runKeys).toContain(rootTask.taskId);
        expect(probe.runKeys).toContain(discoveryTask.taskId);
        expect(probe.generated[discoveryTask.taskId]).toBeTruthy();
      });

      const individualRunCalls = vi.mocked(fetch).mock.calls
        .map(([url]) => String(url))
        .filter((url) => /^\/v1\/team\/tasks\/[^/]+\/runs$/.test(url));
      expect(individualRunCalls).toHaveLength(0);

      const probe = readLiveDataProbe();
      expect(probe.summaries[discoveryTask.taskId]).toBeTruthy();
      expect(probe.summaries[discoveryTask.taskId]!.generatedTaskCount).toBe(TASK_RUNS_BY_TASK_IDS_CHUNK_SIZE + 2);
    });

    it("keeps unchanged live Task, run summary, and full generated detail references stable across refresh", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const rootTask = mockTeamTasks[0]!;
      const rootRun = canvasTaskRun(rootTask.taskId, "run_reference_root", "completed");
      const fullGeneratedTask = mockDiscoveryGeneratedTasks.find((task) => task.taskId === "task_generated_vultr")!;
      const generatedTasks = [generatedSummary(fullGeneratedTask)];
      let rootSummaryRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url.startsWith("/v1/team/console/root-summary")) {
          rootSummaryRequests += 1;
          return rootSummaryResponse({
            tasks: [{ ...rootTask }, { ...mockDiscoveryRootTask }],
            taskRunsByTaskId: { [rootTask.taskId]: [{ ...rootRun }] },
            taskCatalogVersion: "2026-06-03T00:00:00.000Z",
            taskRunSummaryVersion: "2026-06-03T00:00:10.000Z",
          });
        }
        if (url === "/v1/team/tasks") {
          return new Response(JSON.stringify({ tasks: [{ ...rootTask }, { ...mockDiscoveryRootTask }] }), { status: 200 });
        }
        if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
          return new Response(JSON.stringify({ tasks: generatedTasks.map((task) => ({ ...task })) }), { status: 200 });
        }
        if (url === "/v1/team/tasks/task_generated_vultr") {
          return new Response(JSON.stringify({ task: { ...fullGeneratedTask } }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) {
          return byTaskRunsResponse({ [rootTask.taskId]: [{ ...rootRun }] });
        }
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      render(<LiveReferenceProbe openDiscoveryTaskIds={[mockDiscoveryRootTask.taskId]} targetTaskId={rootTask.taskId} />);

      await waitFor(() => {
        expect(latestLiveReferenceSnapshot?.task?.taskId).toBe(rootTask.taskId);
        expect(latestLiveReferenceSnapshot?.run?.runId).toBe(rootRun.runId);
        expect(latestLiveReferenceSnapshot?.generated?.taskId).toBe("task_generated_vultr");
      });
      fireEvent.click(screen.getByRole("button", { name: "ensure generated detail" }));
      await waitFor(() => expect(latestLiveReferenceSnapshot?.generatedHasWorkUnit).toBe(true));
      const before = latestLiveReferenceSnapshot!;

      fireEvent.click(screen.getByRole("button", { name: "probe refresh" }));
      await waitFor(() => expect(rootSummaryRequests).toBe(2));
      await act(async () => { await Promise.resolve(); });

      expect(latestLiveReferenceSnapshot?.task).toBe(before.task);
      expect(latestLiveReferenceSnapshot?.run).toBe(before.run);
      expect(latestLiveReferenceSnapshot?.generated).toBe(before.generated);
      expect(latestLiveReferenceSnapshot?.generatedHasWorkUnit).toBe(true);
    });

    it("uses since cursors for live Task and run summary refresh without clearing empty increments", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const rootTask = mockTeamTasks[0]!;
      const rootRun = canvasTaskRun(rootTask.taskId, "run_incremental_root", "completed");
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") {
          return new Response(JSON.stringify({
            tasks: [rootTask],
            deletedTaskIds: [],
            serverVersion: "2026-06-03T00:00:00.000Z",
          }), { status: 200 });
        }
        if (url === "/v1/team/tasks?since=2026-06-03T00%3A00%3A00.000Z") {
          return new Response(JSON.stringify({
            tasks: [],
            deletedTaskIds: [],
            serverVersion: "2026-06-03T00:00:00.000Z",
          }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) {
          const params = new URLSearchParams(url.split("?")[1]);
          if (params.get("since") === "2026-06-03T00:00:10.000Z") {
            return byTaskRunsResponse({});
          }
          return new Response(JSON.stringify({
            runsByTaskId: { [rootTask.taskId]: [rootRun] },
            deletedRunIdsByTaskId: { [rootTask.taskId]: [] },
            serverVersion: "2026-06-03T00:00:10.000Z",
          }), { status: 200 });
        }
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      render(<LiveDataProbe />);

      await waitFor(() => expect(readLiveDataProbe().tasks).toEqual([rootTask.taskId]));
      await waitFor(() => expect(readLiveDataProbe().runKeys).toEqual([rootTask.taskId]));

      fireEvent.click(screen.getByRole("button", { name: "probe refresh" }));

      await waitFor(() => {
        const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
        expect(urls).toContain("/v1/team/tasks?since=2026-06-03T00%3A00%3A00.000Z");
        expect(urls.some((url) => (
          url.startsWith("/v1/team/task-runs/by-task?")
          && new URLSearchParams(url.split("?")[1]).get("since") === "2026-06-03T00:00:10.000Z"
        ))).toBe(true);
      });
      expect(readLiveDataProbe().tasks).toEqual([rootTask.taskId]);
      expect(readLiveDataProbe().runKeys).toEqual([rootTask.taskId]);
    });

    it("uses the root summary endpoint for live initial load and manual refresh", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const rootTask = mockTeamTasks[0]!;
      const rootRun = canvasTaskRun(rootTask.taskId, "run_root_summary_live", "completed");
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") {
          return new Response(JSON.stringify({
            tasks: [rootTask],
            deletedTaskIds: [],
            taskRunsByTaskId: { [rootTask.taskId]: [rootRun] },
            deletedRunIdsByTaskId: { [rootTask.taskId]: [] },
            sourceNodes: [],
            sourceConnections: [],
            taskConnections: [],
            taskDependencies: [],
            serverVersion: {
              taskCatalog: "2026-06-03T00:00:00.000Z",
              taskRunSummary: "2026-06-03T00:00:10.000Z",
            },
          }), { status: 200 });
        }
        if (url === "/v1/team/console/root-summary?taskSince=2026-06-03T00%3A00%3A00.000Z&runSince=2026-06-03T00%3A00%3A10.000Z") {
          return new Response(JSON.stringify({
            tasks: [],
            deletedTaskIds: [],
            taskRunsByTaskId: { [rootTask.taskId]: [] },
            deletedRunIdsByTaskId: { [rootTask.taskId]: [] },
            sourceNodes: [],
            sourceConnections: [],
            taskConnections: [],
            taskDependencies: [],
            serverVersion: {
              taskCatalog: "2026-06-03T00:00:00.000Z",
              taskRunSummary: "2026-06-03T00:00:10.000Z",
            },
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500 });
      });

      render(<LiveDataProbe />);

      await waitFor(() => expect(readLiveDataProbe().tasks).toEqual([rootTask.taskId]));
      await waitFor(() => expect(readLiveDataProbe().runKeys).toEqual([rootTask.taskId]));
      fireEvent.click(screen.getByRole("button", { name: "probe refresh" }));

      await waitFor(() => {
        const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
        expect(urls).toContain("/v1/team/console/root-summary");
        expect(urls).toContain("/v1/team/console/root-summary?taskSince=2026-06-03T00%3A00%3A00.000Z&runSince=2026-06-03T00%3A00%3A10.000Z");
      });
      const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
      expect(urls.some((url) => url === "/v1/team/tasks" || url.startsWith("/v1/team/tasks?since="))).toBe(false);
      expect(readLiveDataProbe().tasks).toEqual([rootTask.taskId]);
      expect(readLiveDataProbe().runKeys).toEqual([rootTask.taskId]);
    });

    it("uses generated child summary since cursor without clearing empty increments", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const rootTask = mockTeamTasks[0]!;
      const generated = generatedSummary(mockDiscoveryGeneratedTasks[0]!);
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/console/root-summary") {
          return new Response(JSON.stringify({
            tasks: [rootTask, mockDiscoveryRootTask],
            deletedTaskIds: [],
            taskRunsByTaskId: {},
            deletedRunIdsByTaskId: {},
            sourceNodes: [],
            sourceConnections: [],
            taskConnections: [],
            taskDependencies: [],
            serverVersion: {
              taskCatalog: "2026-06-03T00:00:00.000Z",
              taskRunSummary: null,
            },
          }), { status: 200 });
        }
        if (url.startsWith("/v1/team/console/root-summary?")) {
          return new Response(JSON.stringify({
            tasks: [],
            deletedTaskIds: [],
            taskRunsByTaskId: {},
            deletedRunIdsByTaskId: {},
            sourceNodes: [],
            sourceConnections: [],
            taskConnections: [],
            taskDependencies: [],
            serverVersion: {
              taskCatalog: "2026-06-03T00:00:00.000Z",
              taskRunSummary: null,
            },
          }), { status: 200 });
        }
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks?view=summary`) {
          return new Response(JSON.stringify({
            tasks: [generated],
            deletedTaskIds: [],
            serverVersion: "2026-06-03T00:00:20.000Z",
          }), { status: 200 });
        }
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks?view=summary&since=2026-06-03T00%3A00%3A20.000Z`) {
          return new Response(JSON.stringify({
            tasks: [],
            deletedTaskIds: [],
            serverVersion: "2026-06-03T00:00:20.000Z",
          }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) {
          return new Response(JSON.stringify({
            runsByTaskId: {},
            deletedRunIdsByTaskId: {},
            serverVersion: "2026-06-03T00:00:30.000Z",
          }), { status: 200 });
        }
        if (url.includes("/attempts")) return new Response(JSON.stringify({ attempts: [] }), { status: 200 });
        return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500 });
      });

      render(<LiveDataProbe openDiscoveryTaskIds={[mockDiscoveryRootTask.taskId]} />);

      await waitFor(() => expect(readLiveDataProbe().generated[mockDiscoveryRootTask.taskId]).toEqual([generated.taskId]));
      fireEvent.click(screen.getByRole("button", { name: "probe refresh" }));

      await waitFor(() => {
        const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
        expect(urls).toContain(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks?view=summary&since=2026-06-03T00%3A00%3A20.000Z`);
      });
      expect(readLiveDataProbe().generated[mockDiscoveryRootTask.taskId]).toEqual([generated.taskId]);
    });

    it("removes deleted root Task runs from live state during refresh", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const taskA = { ...mockTeamTasks[0]!, taskId: "task_root_keep", title: "Keep root" };
      const taskB = { ...mockTeamTasks[1]!, taskId: "task_root_delete", title: "Delete root" };
      const runA = canvasTaskRun(taskA.taskId, "run_root_keep");
      const runB = canvasTaskRun(taskB.taskId, "run_root_delete");
      let returnDeletedTask = true;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") {
          const tasks = returnDeletedTask ? [taskA, taskB] : [taskA];
          return new Response(JSON.stringify({ tasks }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) {
          return byTaskRunsResponse(returnDeletedTask
            ? { [taskA.taskId]: [runA], [taskB.taskId]: [runB] }
            : { [taskA.taskId]: [runA] }
          );
        }
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      render(<LiveDataProbe />);

      await waitFor(() => expect(readLiveDataProbe().tasks).toEqual([taskA.taskId, taskB.taskId]));
      await waitFor(() => expect(readLiveDataProbe().runKeys).toEqual([taskB.taskId, taskA.taskId]));

      returnDeletedTask = false;
      fireEvent.click(screen.getByRole("button", { name: "probe refresh" }));

      await waitFor(() => expect(readLiveDataProbe().tasks).toEqual([taskA.taskId]));
      expect(readLiveDataProbe().runKeys).toEqual([taskA.taskId]);
    });

    it("polls only lightweight run summaries when root active runs are not expanded", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const rootTasks = Array.from({ length: 10 }, (_, index) => {
        const base = mockTeamTasks[0]!;
        const taskId = `task_active_root_${index}`;
        return {
          ...base,
          taskId,
          title: `Active root ${index}`,
          workUnit: { ...base.workUnit, title: `Active root ${index}` },
        };
      });
      const runsByTaskId = Object.fromEntries(rootTasks.map((task, index) => [
        task.taskId,
        [canvasTaskRun(task.taskId, `run_active_root_${index}`, "running")],
      ]));
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: rootTasks }), { status: 200 });
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse(runsByTaskId);
        const summaryMatch = url.match(/^\/v1\/team\/task-runs\/(run_active_root_\d+)\?view=summary&taskId=(task_active_root_\d+)$/);
        if (summaryMatch) {
          const taskId = summaryMatch[2]!;
          return new Response(JSON.stringify(runsByTaskId[taskId]![0]), { status: 200 });
        }
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      render(<LiveDataProbe />);

      await waitFor(() => expect(readLiveDataProbe().runKeys).toHaveLength(10));
      await waitFor(() => {
        const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
        const polledTaskIds = new Set(urls
          .map((url) => url.match(/\/v1\/team\/task-runs\/run_active_root_\d+\?view=summary&taskId=(task_active_root_\d+)$/)?.[1])
          .filter((taskId): taskId is string => Boolean(taskId)));
        expect(polledTaskIds).toEqual(new Set(rootTasks.map((task) => task.taskId)));
      });
      const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
      expect(urls.filter((url) => /^\/v1\/team\/task-runs\/run_active_root_\d+$/.test(url))).toHaveLength(0);
      expect(urls.some((url) => url.includes("/attempts"))).toBe(false);
      expect(urls.some((url) => url.includes("/files/"))).toBe(false);
      expect(urls.some((url) => url.includes("view=process-summary"))).toBe(false);
    });
  });
});
