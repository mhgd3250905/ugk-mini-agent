import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { mockTeamTasks, resetMockTeamApiState } from "../fixtures/team-fixtures";
import { dragRootNodeToDock, firePointer, getAtlas, getAtlasNodes, getAtlasStage } from "./app-dom-test-utils";

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

  describe("canvas state", () => {
    it("initializes the root filter from stored canvas state after the minimum restore loading time", async () => {
      window.localStorage.setItem("ugk-team-console:canvas-ui-state-by-context:v1", JSON.stringify({
        schemaVersion: 1,
        states: {
          "mock:agent-workspace": {
            schemaVersion: 1,
            dataSource: "mock",
            selectedFixtureId: "agent-workspace",
            rootNodeFilter: "agent",
          },
        },
      }));

      const { container } = render(<App />);

      expect(screen.getByRole("status")).toHaveTextContent("正在恢复画布状态...");
      expect(container.querySelector(".root-filter-segment")).toBeNull();

      await act(async () => {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 900));
      });

      expect(screen.getByRole("status")).toHaveTextContent("正在恢复画布状态...");
      expect(container.querySelector(".root-filter-segment")).toBeNull();

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Agent" })).toHaveClass("is-active");
        expect(screen.getByRole("tab", { name: "ALL" })).not.toHaveClass("is-active");
        expect(container.querySelector(".root-filter-segment")).toHaveAttribute("data-active-filter", "agent");
      }, { timeout: 1600 });
    });

    it("does not render the root filter before delayed shared live layout hydration", async () => {
      const liveTask = mockTeamTasks[0]!;
      let resolveLayout: ((response: Response) => void) | null = null;
      const layoutResponse = new Promise<Response>((resolve) => {
        resolveLayout = resolve;
      });
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        }
        if (url === "/v1/team/console-layout") {
          return layoutResponse;
        }
        if (url === "/v1/team/tasks") {
          return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) {
          return new Response(JSON.stringify({ runsByTaskId: { [liveTask.taskId]: [] } }), { status: 200 });
        }
        if (url.includes("connections")) {
          return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        }
        if (url === "/v1/team/task-dependencies") {
          return new Response(JSON.stringify({ dependencies: [] }), { status: 200 });
        }
        if (url === "/v1/team/source-nodes") {
          return new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");

      const { container } = render(<App />);

      expect(container.querySelector(".root-filter-segment")).toBeNull();
      expect(screen.getByText("正在恢复画布状态...")).toBeInTheDocument();

      resolveLayout!(new Response(JSON.stringify({
        state: {
          schemaVersion: 1,
          states: {
            live: {
              schemaVersion: 1,
              dataSource: "live",
              taskNodePositions: [{ taskId: liveTask.taskId, position: { x: 420, y: 260 } }],
              rootNodeFilter: "task",
            },
          },
        },
      }), { status: 200 }));

      await waitFor(() => {
        expect(container.querySelector(".root-filter-segment")).toHaveAttribute("data-active-filter", "task");
        expect(screen.getByRole("tab", { name: "Task" })).toHaveClass("is-active");
        expect(screen.getByRole("tab", { name: "ALL" })).not.toHaveClass("is-active");
      }, { timeout: 1600 });
    });

    it("restores open live canvas branches and viewport after a browser reload", async () => {
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
        if (url === "/v1/team/task-connections") {
          return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        }
        if (url === `/v1/team/tasks/${liveTask.taskId}/runs`) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const first = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      fireEvent.click(await screen.findByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(within(getAtlasNodes(first.container)).getByRole("button", { name: "主 Agent" }));
      fireEvent.click(await within(getAtlasNodes(first.container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
      fireEvent.wheel(getAtlas(first.container), { deltaY: -120, clientX: 120, clientY: 120 });

      expect(first.container.querySelector(".agent-playground-branch")).toBeTruthy();
      expect(first.container.querySelector(".task-action-branch")).toBeTruthy();
      const transformBefore = getAtlasStage(first.container).style.transform;
      first.unmount();

      const second = render(<App />);

      await waitFor(() => {
        expect(second.container.querySelector(".agent-playground-branch")).toBeTruthy();
        expect(second.container.querySelector(".task-action-branch")).toBeTruthy();
        expect(getAtlasStage(second.container).style.transform).toBe(transformBefore);
      });
    });

    it("normalizes legacy stored canvas zoom to the nearest readable level", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        }
        if (url === "/v1/team/tasks") {
          return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        }
        if (url === "/v1/team/task-connections") {
          return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      window.localStorage.setItem("ugk-team-console:canvas-ui-state:v1", JSON.stringify({
        schemaVersion: 1,
        dataSource: "live",
        viewport: { x: 10.25, y: 20.25, scale: 0.91 },
      }));

      const { container } = render(<App />);

      await waitFor(() => {
        expect(getAtlasStage(container).style.transform).toBe("translate(10px, 20px) scale(0.9)");
      });
    });

    it("hydrates live canvas layout from the shared Team Console layout API", async () => {
      const liveTask = mockTeamTasks[0]!;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        }
        if (url === "/v1/team/console-layout") {
          return new Response(JSON.stringify({
            state: {
              schemaVersion: 1,
              states: {
                live: {
                  schemaVersion: 1,
                  dataSource: "live",
                  taskNodePositions: [{ taskId: liveTask.taskId, position: { x: 420, y: 260 } }],
                  viewport: { x: 18, y: 30, scale: 0.9 },
                },
              },
            },
          }), { status: 200 });
        }
        if (url === "/v1/team/tasks") {
          return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) {
          return new Response(JSON.stringify({ runsByTaskId: { [liveTask.taskId]: [] } }), { status: 200 });
        }
        if (url.includes("connections")) {
          return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        }
        if (url === "/v1/team/task-dependencies") {
          return new Response(JSON.stringify({ dependencies: [] }), { status: 200 });
        }
        if (url === "/v1/team/source-nodes") {
          return new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");

      const { container } = render(<App />);

      await waitFor(() => {
        const taskNode = container.querySelector(`.emap-canvas-task-node[data-task-id="${liveTask.taskId}"]`) as HTMLElement | null;
        expect(taskNode).toBeTruthy();
        expect(Number.parseFloat(taskNode!.style.left)).toBeCloseTo(420, 4);
        expect(Number.parseFloat(taskNode!.style.top)).toBeCloseTo(260, 4);
        expect(getAtlasStage(container).style.transform).toBe("translate(18px, 30px) scale(0.9)");
      });
    });

    it("persists moved root positions and docked nodes across a browser reload", async () => {
      const first = render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      const agentNode = within(getAtlasNodes(first.container)).getByRole("button", { name: "主 Agent" }) as HTMLElement;
      const taskNode = await within(getAtlasNodes(first.container)).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;

      const agentLeft = Number.parseFloat(agentNode.style.left);
      const agentTop = Number.parseFloat(agentNode.style.top);
      firePointer(agentNode, "pointerdown", { pointerId: 101, clientX: agentLeft + 20, clientY: agentTop + 20 });
      firePointer(agentNode, "pointermove", { pointerId: 101, clientX: agentLeft + 84, clientY: agentTop + 52 });
      firePointer(agentNode, "pointerup", { pointerId: 101, clientX: agentLeft + 84, clientY: agentTop + 52, buttons: 0 });

      const movedAgentLeft = Number.parseFloat(agentNode.style.left);
      const movedAgentTop = Number.parseFloat(agentNode.style.top);
      expect(movedAgentLeft).toBeCloseTo(agentLeft + 64, 4);
      expect(movedAgentTop).toBeCloseTo(agentTop + 32, 4);

      const taskLeft = Number.parseFloat(taskNode.style.left);
      const taskTop = Number.parseFloat(taskNode.style.top);
      firePointer(taskNode, "pointerdown", { pointerId: 102, clientX: taskLeft + 20, clientY: taskTop + 20 });
      firePointer(taskNode, "pointermove", { pointerId: 102, clientX: taskLeft + 132, clientY: taskTop + 72 });
      firePointer(taskNode, "pointerup", { pointerId: 102, clientX: taskLeft + 132, clientY: taskTop + 72, buttons: 0 });
      const movedTaskLeft = Number.parseFloat(taskNode.style.left);
      const movedTaskTop = Number.parseFloat(taskNode.style.top);
      expect(movedTaskLeft).toBeCloseTo(taskLeft + 112, 4);
      expect(movedTaskTop).toBeCloseTo(taskTop + 52, 4);

      dragRootNodeToDock(first.container, taskNode, 103);
      expect(first.container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]')).toBeNull();
      first.unmount();

      const second = render(<App />);
      await waitFor(() => {
        const restoredAgent = second.container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
        expect(restoredAgent).toBeTruthy();
        expect(Number.parseFloat(restoredAgent!.style.left)).toBeCloseTo(movedAgentLeft, 4);
        expect(Number.parseFloat(restoredAgent!.style.top)).toBeCloseTo(movedAgentTop, 4);
        expect(second.container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]')).toBeNull();
      });

      const dock = second.container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(dock).toBeTruthy();
      fireEvent.click(within(dock!).getByRole("button", { name: /复原 Task 调查 Medtrum 云资产/ }));
      await waitFor(() => {
        const restoredTask = second.container.querySelector('.emap-canvas-task-node[data-task-id="task_research_medtrum"]') as HTMLElement | null;
        expect(restoredTask).toBeTruthy();
        expect(Number.parseFloat(restoredTask!.style.left)).toBeCloseTo(movedTaskLeft, 4);
        expect(Number.parseFloat(restoredTask!.style.top)).toBeCloseTo(movedTaskTop, 4);
      });
    });

    it("keeps live docked root nodes when switching to mock data and back", async () => {
      const liveTask = mockTeamTasks[0]!;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        }
        if (url === "/v1/team/tasks") {
          return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) {
          return new Response(JSON.stringify({ runsByTaskId: { [liveTask.taskId]: [] } }), { status: 200 });
        }
        if (url.includes("/connections")) {
          return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        }
        if (url === "/v1/team/task-dependencies") {
          return new Response(JSON.stringify({ dependencies: [] }), { status: 200 });
        }
        if (url === "/v1/team/source-nodes") {
          return new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 });
        }
        if (url === "/v1/team/source-connections") {
          return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      window.localStorage.setItem("ugk-team-console:canvas-ui-state:v1", JSON.stringify({
        schemaVersion: 1,
        dataSource: "live",
        taskNodePositions: [{ taskId: liveTask.taskId, position: { x: 280, y: 220 } }],
        minimizedTaskNodeIds: [`task-node-${liveTask.taskId}`],
      }));

      const { container } = render(<App />);

      const dock = await waitFor(() => {
        const node = container.querySelector(".emap-root-dock") as HTMLElement | null;
        expect(node).toBeTruthy();
        expect(within(node!).getByRole("button", { name: new RegExp(`复原 Task ${liveTask.title}`) })).toBeInTheDocument();
        expect(container.querySelector(`.emap-canvas-task-node[data-task-id="${liveTask.taskId}"]`)).toBeNull();
        return node!;
      });

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "mock" } });
      await waitFor(() => {
        expect(screen.getByRole("combobox")).toHaveValue("mock");
        expect(container.querySelector(".emap-canvas-task-node")).toBeTruthy();
      });

      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => {
        expect(screen.getByRole("combobox")).toHaveValue("live");
        expect(within(dock).getByRole("button", { name: new RegExp(`复原 Task ${liveTask.title}`) })).toBeInTheDocument();
        expect(container.querySelector(`.emap-canvas-task-node[data-task-id="${liveTask.taskId}"]`)).toBeNull();
      });
    });

    it("persists dragged Task branch panel positions across a browser reload", async () => {
      const first = render(<App />);

      const taskNode = await within(getAtlasNodes(first.container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      fireEvent.click(taskNode);

      const branchShell = await waitFor(() => {
        const shell = first.container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
        expect(shell).toBeTruthy();
        return shell!;
      });
      const header = branchShell.querySelector(".task-leader-branch-head") as HTMLElement | null;
      expect(header).toBeTruthy();

      const initialLeft = Number.parseFloat(branchShell.style.left);
      const initialTop = Number.parseFloat(branchShell.style.top);
      firePointer(header!, "pointerdown", { pointerId: 104, clientX: initialLeft + 20, clientY: initialTop + 20 });
      firePointer(branchShell, "pointermove", { pointerId: 104, clientX: initialLeft + 124, clientY: initialTop + 68 });
      firePointer(branchShell, "pointerup", { pointerId: 104, clientX: initialLeft + 124, clientY: initialTop + 68, buttons: 0 });

      const movedLeft = Number.parseFloat(branchShell.style.left);
      const movedTop = Number.parseFloat(branchShell.style.top);
      expect(movedLeft).toBeCloseTo(initialLeft + 104, 4);
      expect(movedTop).toBeCloseTo(initialTop + 48, 4);
      await waitFor(() => {
        expect(window.localStorage.getItem("ugk-team-console:canvas-ui-state:v1")).toContain('"branchLayout"');
        expect(window.localStorage.getItem("ugk-team-console:canvas-ui-state:v1")).toContain('"taskBranchPositions"');
      });

      first.unmount();
      const second = render(<App />);

      await waitFor(() => {
        const restoredShell = second.container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
        expect(restoredShell).toBeTruthy();
        expect(Number.parseFloat(restoredShell!.style.left)).toBeCloseTo(movedLeft, 4);
        expect(Number.parseFloat(restoredShell!.style.top)).toBeCloseTo(movedTop, 4);
      });
    });
  });
});
