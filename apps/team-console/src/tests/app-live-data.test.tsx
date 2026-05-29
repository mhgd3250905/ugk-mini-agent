import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { makeDiscoveryForEachPlan, makeDiscoveryForEachRun, makeSequentialPlan, makeSequentialRun, MOCK_AGENTS, mockTeamTasks, resetMockTeamApiState } from "../fixtures/team-fixtures";
import { getAtlasNodes, firePointer, deferred } from "./app-dom-test-utils";

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
      expect(screen.getByText("示例：")).toBeInTheDocument();
    });

    it("localizes visible fixture menu labels", () => {
      render(<App />);

      expect(screen.getByRole("button", { name: "发现 + 逐项处理" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "任务拆分" })).toBeInTheDocument();
      expect(screen.queryByText("Discovery + ForEach")).toBeNull();
      expect(screen.queryByText("Decomposition split")).toBeNull();
    });

    it("switches back to the old demo fixture for runtime atlas regression", () => {
      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "顺序 run" }));

      expect(screen.getByText("执行运行")).toBeInTheDocument();
      expect(screen.getByText("Research vendor A")).toBeInTheDocument();
    });

    it("keeps Live API on a clean agent workspace until a run is requested", async () => {
      const liveTask = mockTeamTasks[0]!;
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ dependencies: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }));

      render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(7));
      expect(fetch).toHaveBeenNthCalledWith(1, "/v1/agents");
      expect(fetch).toHaveBeenNthCalledWith(2, "/v1/agents/status", {
        method: "GET",
        headers: { accept: "application/json" },
      });
      expect(fetch).toHaveBeenNthCalledWith(3, "/v1/team/tasks");
      expect(fetch).toHaveBeenNthCalledWith(4, "/v1/team/task-connections");
      expect(fetch).toHaveBeenNthCalledWith(5, "/v1/team/task-dependencies");
      expect(fetch).toHaveBeenNthCalledWith(6, "/v1/team/source-nodes");
      expect(fetch).toHaveBeenNthCalledWith(7, "/v1/team/source-connections");
      expect(screen.getByRole("button", { name: "Agent workspace" })).toHaveClass("active");
      expect(screen.getByRole("button", { name: "最新 Run" })).not.toHaveClass("active");
      expect(screen.queryByText("执行运行")).toBeNull();
      expect(screen.queryByText("Research vendor A")).toBeNull();
      expect(fetch).not.toHaveBeenCalledWith("/v1/team/plans");
      expect(fetch).not.toHaveBeenCalledWith("/v1/team/runs");
      expect(await screen.findByText(liveTask.title)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "添加 Agent" })).toBeEnabled();
    });

    it("keeps Live API usable when the typed connection endpoint is not deployed yet", async () => {
      const liveTask = mockTeamTasks[0]!;
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 }))
        .mockResolvedValueOnce(new Response("not found", { status: 404 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }))
        .mockResolvedValue(new Response(JSON.stringify({ runs: [] }), { status: 200 }));

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await waitFor(() => expect(fetch).toHaveBeenCalledWith("/v1/team/task-connections"));
      expect(screen.queryByText("请求失败 (404)")).toBeNull();
      expect(await screen.findByText(liveTask.title)).toBeInTheDocument();
      expect(container.querySelector(".task-create-btn")).toBeEnabled();
    });

    it("fetches live plans, runs, and selected run detail when latest Run is requested", async () => {
      const plan = makeSequentialPlan();
      const run = makeSequentialRun();
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ dependencies: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify([plan]), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify([run]), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(run), { status: 200 }));

      render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(7));
      fireEvent.click(screen.getByRole("button", { name: "最新 Run" }));

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(10));
      expect(fetch).toHaveBeenNthCalledWith(1, "/v1/agents");
      expect(fetch).toHaveBeenNthCalledWith(2, "/v1/agents/status", {
        method: "GET",
        headers: { accept: "application/json" },
      });
      expect(fetch).toHaveBeenNthCalledWith(3, "/v1/team/tasks");
      expect(fetch).toHaveBeenNthCalledWith(4, "/v1/team/task-connections");
      expect(fetch).toHaveBeenNthCalledWith(5, "/v1/team/task-dependencies");
      expect(fetch).toHaveBeenNthCalledWith(6, "/v1/team/source-nodes");
      expect(fetch).toHaveBeenNthCalledWith(7, "/v1/team/source-connections");
      expect(fetch).toHaveBeenNthCalledWith(8, "/v1/team/plans");
      expect(fetch).toHaveBeenNthCalledWith(9, "/v1/team/runs");
      expect(fetch).toHaveBeenNthCalledWith(10, "/v1/team/runs/run_seq_001");
    });

    it("loads live agent catalog when switching to Live API", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify({
          agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
        }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [{ agentId: "main", name: "主 Agent", status: "idle" }] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ dependencies: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }));

      render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(7));
      expect(fetch).toHaveBeenNthCalledWith(1, "/v1/agents");
      expect(fetch).toHaveBeenNthCalledWith(2, "/v1/agents/status", {
        method: "GET",
        headers: { accept: "application/json" },
      });
      expect(fetch).toHaveBeenNthCalledWith(3, "/v1/team/tasks");
      expect(fetch).toHaveBeenNthCalledWith(4, "/v1/team/task-connections");
      expect(fetch).toHaveBeenNthCalledWith(5, "/v1/team/task-dependencies");
      expect(fetch).toHaveBeenNthCalledWith(6, "/v1/team/source-nodes");
      expect(fetch).toHaveBeenNthCalledWith(7, "/v1/team/source-connections");
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
      expect(iframe?.getAttribute("src")).toContain("/playground?view=chat&agentId=main");
      expect(iframe?.getAttribute("src")).toContain("embed=team-console");
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
      expect(screen.getByLabelText("当前 Task 数量")).toHaveTextContent("0 个 Task");

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

      await waitFor(() => expect(taskRequests).toBe(2));
      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();
      expect(screen.getByLabelText("当前 Task 数量")).toHaveTextContent("1 个 Task");
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
      expect(screen.getByLabelText("当前 Task 数量")).toHaveTextContent("1 个 Task");
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
      expect(screen.getByLabelText("当前 Task 数量")).toHaveTextContent("2 个 Task");
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
      expect(screen.getByRole("combobox")).toHaveValue("live");

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
      expect(screen.getByRole("combobox")).toHaveValue("live");
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

    it("refreshes live Task cards when returning to Agent workspace", async () => {
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
      const plan = makeSequentialPlan();
      const run = makeSequentialRun();
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
        if (url === "/v1/team/plans") return new Response(JSON.stringify([plan]), { status: 200 });
        if (url === "/v1/team/runs") return new Response(JSON.stringify([run]), { status: 200 });
        if (url === "/v1/team/runs/run_seq_001") return new Response(JSON.stringify(run), { status: 200 });
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "最新 Run" }));
      expect(await screen.findByText("Research vendor A")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Agent workspace" }));

      await waitFor(() => expect(taskRequests).toBe(2));
      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "刷新后出现的新 Task" })).toBeInTheDocument();
    });

    it("keeps dragged live Task positions after a live Task refresh", async () => {
      const liveTask = mockTeamTasks[0]!;
      const plan = makeSequentialPlan();
      const run = makeSequentialRun();
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
        if (url === "/v1/team/plans") return new Response(JSON.stringify([plan]), { status: 200 });
        if (url === "/v1/team/runs") return new Response(JSON.stringify([run]), { status: 200 });
        if (url === "/v1/team/runs/run_seq_001") return new Response(JSON.stringify(run), { status: 200 });
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      firePointer(taskNode, "pointerdown", { pointerId: 42, clientX: 120, clientY: 120 });
      firePointer(taskNode, "pointermove", { pointerId: 42, clientX: 190, clientY: 155 });
      firePointer(taskNode, "pointerup", { pointerId: 42, clientX: 190, clientY: 155, buttons: 0 });

      fireEvent.click(screen.getByRole("button", { name: "最新 Run" }));
      expect(await screen.findByText("Research vendor A")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Agent workspace" }));

      await waitFor(() => expect(taskRequests).toBe(2));
      const refreshedTaskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      expect(Number.parseFloat(refreshedTaskNode.style.left)).toBeCloseTo(350, 4);
      expect(Number.parseFloat(refreshedTaskNode.style.top)).toBeCloseTo(255, 4);
    });

    it("renders the selected live run after loading", async () => {
      const plan = {
        ...makeSequentialPlan(),
        planId: "plan_live_001",
        tasks: [
          {
            ...makeSequentialPlan().tasks[0],
            id: "live_task_1",
            title: "Live-only vendor task",
          },
        ],
      };
      const run = {
        ...makeSequentialRun(),
        runId: "run_live_001",
        planId: "plan_live_001",
        taskStates: {
          live_task_1: makeSequentialRun().taskStates.task_1,
        },
        summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
      };
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ dependencies: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify([plan]), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify([run]), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify(run), { status: 200 }));

      render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(7));
      fireEvent.click(screen.getByRole("button", { name: "最新 Run" }));

      expect(await screen.findByText("Live-only vendor task")).toBeInTheDocument();
    });

    it("renders source sockets on atlas parent-child branch links", async () => {
      const plan = makeDiscoveryForEachPlan();
      const run = makeDiscoveryForEachRun();
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        if (url === "/v1/team/plans") return new Response(JSON.stringify([plan]), { status: 200 });
        if (url === "/v1/team/runs") return new Response(JSON.stringify([run]), { status: 200 });
        if (url === `/v1/team/runs/${run.runId}`) return new Response(JSON.stringify(run), { status: 200 });
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      fireEvent.click(await screen.findByRole("button", { name: "最新 Run" }));

      expect(await screen.findByText("Process Alpha")).toBeInTheDocument();
      const branchPath = container.querySelector(".emap-link-branch") as SVGPathElement | null;
      const sourceSocket = branchPath?.parentElement?.querySelector(".emap-connector-socket-task-branch .emap-connector-source-socket") as SVGPathElement | null;
      const branchD = branchPath?.getAttribute("d") ?? "";
      const moveMatch = branchD.match(/^M([\d.]+),([\d.]+)/);
      expect(sourceSocket).toBeTruthy();
      expect(moveMatch).toBeTruthy();
      const sourceX = Number.parseFloat(moveMatch![1]!);
      const sourceY = Number.parseFloat(moveMatch![2]!);
      expect(sourceSocket!.getAttribute("d")).toBe(`M${sourceX},${sourceY - 6} A6,6 0 0 1 ${sourceX},${sourceY + 6}`);
    });

    it("keeps live agent workspace usable when no live team run exists", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify({
          agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
        }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [{ agentId: "main", name: "主 Agent", status: "idle" }] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ dependencies: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }));

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(7));
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
  });
});
