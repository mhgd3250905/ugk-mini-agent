import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { mockTeamTasks, resetMockTeamApiState } from "../fixtures/team-fixtures";
import { getAtlasNodes, getAtlasStage, firePointer } from "./app-dom-test-utils";

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

  it("renders the title", () => {
    render(<App />);
    expect(screen.getByText("团队控制台")).toBeInTheDocument();
  });

  it("renders the subtitle", () => {
    render(<App />);
    expect(screen.getByText("执行地图预览")).toBeInTheDocument();
  });

  it("renders datasource selector", () => {
    render(<App />);
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue("mock");
  });

  it("renders a clean agent atlas workspace by default", () => {
    const { container } = render(<App />);

    expect(screen.queryByText("Research vendor A")).toBeNull();
    expect(screen.queryByText("Research vendor B")).toBeNull();
    expect(screen.queryByText("Research vendor C")).toBeNull();
    expect(screen.queryByText("执行运行")).toBeNull();
    expect(screen.getByRole("button", { name: "添加 Agent" })).toBeEnabled();
    expect(container.querySelector(".execution-map-container")).toBeTruthy();
    expect(container.querySelector(".execution-map-toolbar")).toBeTruthy();
    expect(container.querySelector(".agent-canvas-board")).toBeNull();
  });

  it("groups atlas toolbar stats and Task actions", () => {
    const { container } = render(<App />);

    expect(container.querySelector(".execution-map-toolbar-main")).toBeTruthy();
    expect(container.querySelector(".execution-map-toolbar-viewport")).toBeTruthy();
    expect(screen.getByRole("button", { name: "放大" })).toHaveClass("execution-map-icon-button");
    expect(screen.getByRole("button", { name: "重置视图" })).toHaveClass("execution-map-reset-button");
    const toolbar = container.querySelector(".agent-atlas-actions") as HTMLElement | null;
    expect(toolbar).toBeTruthy();
    expect(toolbar!.querySelector(".agent-atlas-stats")).toBeTruthy();
    expect(toolbar!.querySelector(".task-toolbar-group")).toBeTruthy();
    expect(within(toolbar!).getByLabelText("Agent 数量")).toHaveTextContent("0");
    expect(within(toolbar!).getByLabelText("当前 Task 数量")).toHaveTextContent(`${mockTeamTasks.length} 个 Task`);
    expect(within(toolbar!.querySelector(".task-toolbar-group") as HTMLElement).getByRole("button", { name: "创建 Task" })).toBeInTheDocument();
    expect(within(toolbar!.querySelector(".task-toolbar-group") as HTMLElement).getByRole("button", { name: "刷新 Task" })).toBeInTheDocument();
  });

  it("renders mock Task cards in the Agent workspace", async () => {
    const { container } = render(<App />);

    const atlasNodes = getAtlasNodes(container);
    const taskNode = await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" });
    expect(taskNode).toBeInTheDocument();
    expect(within(taskNode).getByText("Leader")).toBeInTheDocument();
    expect(within(taskNode).getByText("Worker")).toBeInTheDocument();
    expect(within(taskNode).getByText("Checker")).toBeInTheDocument();
    expect(taskNode.querySelector('.emap-task-agent-row[data-role="leader"]')).toHaveClass("role-leader");
    expect(taskNode.querySelector('.emap-task-agent-row[data-role="worker"]')).toHaveClass("role-worker");
    expect(taskNode.querySelector('.emap-task-agent-row[data-role="checker"]')).toHaveClass("role-checker");
    expect(within(taskNode).getAllByText("主 Agent").length).toBeGreaterThanOrEqual(2);
    expect(within(taskNode).getByText("搜索 Agent")).toBeInTheDocument();
  });

  it("copies Agent and Task ids from root cards without opening branches", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

    const atlasNodes = getAtlasNodes(container);
    const agentNode = await within(atlasNodes).findByRole("button", { name: "主 Agent" });
    const agentCopyButton = within(agentNode).getByRole("button", { name: "复制 Agent ID main" });
    expect(agentCopyButton).toHaveTextContent("main");
    expect(agentCopyButton).not.toHaveTextContent("Agent ID");
    expect(agentCopyButton).not.toHaveTextContent("复制");
    fireEvent.click(agentCopyButton);
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("main"));
    expect(container.querySelector(".emap-agent-branch-shell")).toBeNull();
    expect(within(agentNode).getByText("已复制")).toBeInTheDocument();

    const taskNode = await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" });
    const taskCopyButton = within(taskNode).getByRole("button", { name: "复制 Task ID task_research_medtrum" });
    expect(taskCopyButton).toHaveTextContent("task_research_medtrum");
    expect(taskCopyButton).not.toHaveTextContent("Task ID");
    expect(taskCopyButton).not.toHaveTextContent("复制");
    fireEvent.click(taskCopyButton);
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("task_research_medtrum"));
    expect(container.querySelector(".task-action-branch")).toBeNull();
    expect(within(taskNode).getByText("已复制")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "放大" }));

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
      liveRunMode: "workspace",
      viewport: { x: 10.25, y: 20.25, scale: 0.91 },
    }));

    const { container } = render(<App />);

    await waitFor(() => {
      expect(screen.getByText("90%")).toBeInTheDocument();
      expect(getAtlasStage(container).style.transform).toBe("translate(10px, 20px) scale(0.9)");
    });
  });

  it("keeps leader chat usable: drag header, resize, maximize", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "对话 Leader" }));

    await waitFor(() => {
      expect(container.querySelector(".emap-task-child-branch-shell iframe")).toBeTruthy();
    });

    const shell = container.querySelector(".emap-task-child-branch-shell") as HTMLElement | null;
    expect(shell).toBeTruthy();
    const header = shell!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
    expect(header).toBeTruthy();

    // Drag header
    const leftBefore = Number.parseFloat(shell!.style.left);
    const topBefore = Number.parseFloat(shell!.style.top);
    firePointer(header!, "pointerdown", { pointerId: 97, clientX: 400, clientY: 200 });
    firePointer(header!, "pointermove", { pointerId: 97, clientX: 450, clientY: 260 });
    firePointer(header!, "pointerup", { pointerId: 97, clientX: 450, clientY: 260, buttons: 0 });
    expect(Number.parseFloat(shell!.style.left)).toBeCloseTo(leftBefore + 50, 4);
    expect(Number.parseFloat(shell!.style.top)).toBeCloseTo(topBefore + 60, 4);

    // Resize
    const resizeHandle = shell!.querySelector(".emap-panel-resize-handle") as HTMLElement | null;
    expect(resizeHandle).toBeTruthy();
    const widthBefore = Number.parseFloat(shell!.style.width);
    const heightBefore = Number.parseFloat(shell!.style.height);
    firePointer(resizeHandle!, "pointerdown", { pointerId: 98, clientX: 800, clientY: 600 });
    firePointer(resizeHandle!, "pointermove", { pointerId: 98, clientX: 900, clientY: 700 });
    firePointer(resizeHandle!, "pointerup", { pointerId: 98, clientX: 900, clientY: 700, buttons: 0 });
    expect(Number.parseFloat(shell!.style.width)).toBeCloseTo(widthBefore + 100, 4);
    expect(Number.parseFloat(shell!.style.height)).toBeCloseTo(heightBefore + 100, 4);

    // Maximize with the visible branch control.
    const maximizeButton = shell!.querySelector(".emap-agent-branch-maximize-button") as HTMLElement | null;
    expect(maximizeButton).toBeTruthy();
    fireEvent.click(maximizeButton!);
    expect(document.querySelector(".emap-maximized-branch-shell")).toBeTruthy();
  });
});
