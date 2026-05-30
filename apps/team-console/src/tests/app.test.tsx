import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { mockTeamTasks, resetMockTeamApiState } from "../fixtures/team-fixtures";
import { getAtlas, getAtlasNodes, getAtlasStage, firePointer } from "./app-dom-test-utils";

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

  it("renders the add agent entry in mock mode", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "添加 Agent" })).toBeInTheDocument();
  });

  it("adds a unique mock agent card to the atlas node layer", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    const mainOption = await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ });

    fireEvent.click(mainOption);

    const atlasNodes = getAtlasNodes(container);
    const agentNode = atlasNodes.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
    expect(agentNode).toBeTruthy();
    expect(agentNode!).toHaveAttribute("aria-label", "主 Agent");
    expect(within(agentNode!).getByText("主 Agent")).toBeInTheDocument();
    expect(within(agentNode!).getByRole("button", { name: "复制 Agent ID main" })).toBeInTheDocument();
    expect(container.querySelector(".agent-canvas-board")).toBeNull();
    expect(screen.queryByRole("button", { name: /主 Agent[\s\S]*已加入/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    const joinedOption = screen.getByRole("button", { name: /主 Agent[\s\S]*已加入/ });
    expect(joinedOption).toBeDisabled();

    fireEvent.click(joinedOption);
    expect(atlasNodes.querySelectorAll('.emap-agent-node[data-agent-id="main"]')).toHaveLength(1);
  });

  it("renders mock agent run states on atlas cards", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(screen.getByRole("button", { name: /搜索 Agent[\s\S]*search/ }));

    const mainNode = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
    const searchNode = container.querySelector('.emap-agent-node[data-agent-id="search"]') as HTMLElement | null;
    expect(mainNode).toBeTruthy();
    expect(searchNode).toBeTruthy();

    await waitFor(() => {
      expect(mainNode!).toHaveAttribute("data-agent-run-state", "idle");
      expect(searchNode!).toHaveAttribute("data-agent-run-state", "busy");
    });
    expect(within(mainNode!).getByText("空闲")).toBeInTheDocument();
    expect(within(searchNode!).getByText("运行中")).toBeInTheDocument();
  });

  it("expands an agent card into an embedded playground branch and keeps the atlas visible", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "顺序 run" }));
    expect(screen.getByText("执行运行")).toBeInTheDocument();
    expect(screen.getByText("Research vendor A")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(screen.getByRole("button", { name: /搜索 Agent[\s\S]*search/ }));

    const atlas = getAtlas(container);
    const stage = getAtlasStage(container);
    const initialTransform = stage.style.transform;
    expect(atlas).toHaveAttribute("data-agent-focus", "none");
    expect(atlas.querySelectorAll(".emap-agent-node")).toHaveLength(2);

    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }));

    expect(atlas).toHaveAttribute("data-agent-focus", "main");
    expect(atlas).toHaveAttribute("data-interaction-mode", "free");
    expect(stage.style.transform).toBe(initialTransform);
    expect(stage).not.toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".agent-focus-workspace")).toBeNull();
    expect(screen.getByText("执行运行")).toBeInTheDocument();
    expect(screen.getByText("Research vendor A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "搜索 Agent" })).toBeInTheDocument();
    const mainNode = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
    const searchNode = container.querySelector('.emap-agent-node[data-agent-id="search"]') as HTMLElement | null;
    const branchShell = container.querySelector(".emap-agent-branch-shell") as HTMLElement | null;
    expect(mainNode).toBeTruthy();
    expect(searchNode).toBeTruthy();
    expect(branchShell).toBeTruthy();
    expect(Number.parseFloat(branchShell!.style.left)).toBeCloseTo(
      Number.parseFloat(mainNode!.style.left) + Number.parseFloat(mainNode!.style.width) + 48,
      4,
    );
    expect(Number.parseFloat(branchShell!.style.left)).toBeLessThan(
      Number.parseFloat(searchNode!.style.left) + Number.parseFloat(searchNode!.style.width),
    );

    const branch = container.querySelector(".agent-playground-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    expect(within(branch!).getByText("主 Agent")).toBeInTheDocument();
    expect(within(branch!).getByText("main")).toBeInTheDocument();
    const iframe = branch!.querySelector("iframe") as HTMLIFrameElement | null;
    expect(iframe).toBeTruthy();
    expect(iframe).toHaveAttribute("title", "主 Agent 主项目对话");
    expect(iframe?.getAttribute("src")).toContain("/playground?view=chat&agentId=main");
    expect(iframe?.getAttribute("src")).toContain("embed=team-console");
    expect(iframe?.getAttribute("src")).not.toContain("teamTaskMode=create");
    expect(iframe?.getAttribute("src")).not.toContain("127.0.0.1");
  });

  it("clicking the expanded agent card collapses the embedded branch", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    const agentNode = within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" });

    fireEvent.click(agentNode);
    expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
    fireEvent.click(agentNode);

    expect(getAtlas(container)).toHaveAttribute("data-agent-focus", "none");
    expect(container.querySelector(".agent-playground-branch")).toBeNull();
  });

  it("opens a Task card into an action menu branch", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    const branchShell = container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
    expect(branch).toBeTruthy();
    expect(branchShell).toBeTruthy();
    expect(branchShell!.style.width).toBe("max-content");
    expect(branchShell!.style.height).toBe("auto");
    expect(branchShell!.style.width).not.toBe("820px");
    expect(branchShell!.style.height).not.toBe("620px");
    expect(within(branch!).getByText("Task 操作")).toBeInTheDocument();
    expect(within(branch!).getByText("调查 Medtrum 云资产")).toBeInTheDocument();
    expect(within(branch!).getByText("task_research_medtrum")).toBeInTheDocument();
    expect(within(branch!).getByRole("button", { name: "运行" })).toBeEnabled();
    expect(within(branch!).getByRole("button", { name: "编辑" })).toBeInTheDocument();
    expect(within(branch!).getByRole("button", { name: "对话 Leader" })).toBeInTheDocument();
    expect(within(branch!).getByRole("button", { name: "删除" })).toBeInTheDocument();
    expect(branch!.querySelector("iframe")).toBeNull();
  });

  it("collapses the Task action branch when the same Task is clicked again", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
    fireEvent.click(taskNode);
    expect(container.querySelector(".task-action-branch")).toBeTruthy();

    fireEvent.click(taskNode);

    expect(container.querySelector(".task-action-branch")).toBeNull();
  });

  it("keeps a Task action branch open when an Agent branch opens", async () => {
    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    expect(container.querySelector(".task-action-branch")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }));

    expect(container.querySelector(".task-action-branch")).toBeTruthy();
    expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
  });

  it("keeps an Agent chat branch open when a Task run observer opens", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" }));
    expect(container.querySelector(".agent-playground-branch")).toBeTruthy();

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    await waitFor(() => {
      expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
      expect(container.querySelector('.emap-task-child-branch-shell[data-panel-id^="run-observer"]')).toBeTruthy();
    });
  });

  it("keeps multiple Task action branches open when another Task is clicked", async () => {
    const firstTask = mockTeamTasks[0]!;
    const secondTask = {
      ...firstTask,
      taskId: "task_review_medtrum",
      title: "复核 Medtrum 证据",
      leaderAgentId: "search",
      workUnit: {
        ...firstTask.workUnit,
        title: "复核 Medtrum 证据",
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
      if (url === "/v1/agents/status") {
        return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      }
      if (url === "/v1/team/tasks") {
        return new Response(JSON.stringify({ tasks: [firstTask, secondTask] }), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    await waitFor(() => {
      const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      expect(within(branch!).getByText("task_research_medtrum")).toBeInTheDocument();
    });

    fireEvent.click(getAtlasNodes(container).querySelector('[data-task-id="task_review_medtrum"]') as HTMLElement);

    const branches = Array.from(container.querySelectorAll(".task-action-branch")) as HTMLElement[];
    expect(branches).toHaveLength(2);
    expect(branches.some((branch) => branch.textContent?.includes("调查 Medtrum 云资产"))).toBe(true);
    expect(branches.some((branch) => branch.textContent?.includes("task_research_medtrum"))).toBe(true);
    expect(branches.some((branch) => branch.textContent?.includes("复核 Medtrum 证据"))).toBe(true);
    expect(branches.some((branch) => branch.textContent?.includes("task_review_medtrum"))).toBe(true);
    for (const branch of branches) {
      expect(branch.querySelector("iframe")).toBeNull();
    }

    fireEvent.click(getAtlasNodes(container).querySelector('[data-task-id="task_review_medtrum"]') as HTMLElement);

    const remainingBranches = Array.from(container.querySelectorAll(".task-action-branch")) as HTMLElement[];
    expect(remainingBranches).toHaveLength(1);
    expect(remainingBranches[0]).toHaveTextContent("调查 Medtrum 云资产");
    expect(remainingBranches[0]).not.toHaveTextContent("复核 Medtrum 证据");
  });

  it("keeps every open Task action branch draggable after another Task is focused", async () => {
    const firstTask = mockTeamTasks[0]!;
    const secondTask = {
      ...firstTask,
      taskId: "task_review_medtrum",
      title: "复核 Medtrum 证据",
      leaderAgentId: "search",
      workUnit: {
        ...firstTask.workUnit,
        title: "复核 Medtrum 证据",
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
      if (url === "/v1/agents/status") {
        return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      }
      if (url === "/v1/team/tasks") {
        return new Response(JSON.stringify({ tasks: [firstTask, secondTask] }), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(getAtlasNodes(container).querySelector('[data-task-id="task_review_medtrum"]') as HTMLElement);

    const menuShells = await waitFor(() => {
      const shells = Array.from(container.querySelectorAll(".emap-task-branch-shell")) as HTMLElement[];
      expect(shells).toHaveLength(2);
      return shells;
    });
    const firstMenuShell = menuShells.find((shell) => shell.textContent?.includes("调查 Medtrum 云资产"));
    const secondMenuShell = menuShells.find((shell) => shell.textContent?.includes("复核 Medtrum 证据"));
    expect(firstMenuShell).toBeTruthy();
    expect(secondMenuShell).toBeTruthy();

    const firstLeftBefore = Number.parseFloat(firstMenuShell!.style.left);
    const firstTopBefore = Number.parseFloat(firstMenuShell!.style.top);
    const firstHeader = firstMenuShell!.querySelector(".task-leader-branch-head") as HTMLElement | null;
    expect(firstHeader).toBeTruthy();
    firePointer(firstHeader!, "pointerdown", { pointerId: 301, clientX: 420, clientY: 220 });
    firePointer(firstHeader!, "pointermove", { pointerId: 301, clientX: 485, clientY: 255 });
    firePointer(firstHeader!, "pointerup", { pointerId: 301, clientX: 485, clientY: 255, buttons: 0 });

    expect(Number.parseFloat(firstMenuShell!.style.left)).toBeCloseTo(firstLeftBefore + 65, 4);
    expect(Number.parseFloat(firstMenuShell!.style.top)).toBeCloseTo(firstTopBefore + 35, 4);

    const secondLeftBefore = Number.parseFloat(secondMenuShell!.style.left);
    const secondTopBefore = Number.parseFloat(secondMenuShell!.style.top);
    const secondHeader = secondMenuShell!.querySelector(".task-leader-branch-head") as HTMLElement | null;
    expect(secondHeader).toBeTruthy();
    firePointer(secondHeader!, "pointerdown", { pointerId: 302, clientX: 520, clientY: 250 });
    firePointer(secondHeader!, "pointermove", { pointerId: 302, clientX: 580, clientY: 295 });
    firePointer(secondHeader!, "pointerup", { pointerId: 302, clientX: 580, clientY: 295, buttons: 0 });

    expect(Number.parseFloat(secondMenuShell!.style.left)).toBeCloseTo(secondLeftBefore + 60, 4);
    expect(Number.parseFloat(secondMenuShell!.style.top)).toBeCloseTo(secondTopBefore + 45, 4);
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

  it("vite proxy includes the Team Console API surface and embedded playground route", () => {
    const config = readFileSync("vite.config.ts", "utf8");
    expect(config).toContain('"/v1"');
    expect(config).toContain('"/playground"');
    expect(config).toContain('"/assets"');
    expect(config).toContain('"/runtime"');
    expect(config).toContain('"/vendor"');
    expect(config).not.toContain("VITE_TEAM_CONSOLE_API_TARGET");
    expect(config).not.toContain('"/v1/conns"');
    expect(config).not.toContain('"/v1/activity"');
    expect(config).toContain("teamApiTarget");
  });

  it("keeps atlas content from stretching the app width during node drag", () => {
    const appCss = readFileSync("src/app/app.css", "utf8");
    const mapCss = readFileSync("src/graph/execution-map.css", "utf8");

    expect(appCss).toMatch(/\.app-main\s*{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(appCss).toMatch(/\.workspace\s*{[^}]*min-width:\s*0;/s);
    expect(appCss).toMatch(/\.workspace-map\s*{[^}]*min-width:\s*0;/s);
    expect(mapCss).toMatch(/\.execution-map-container\s*{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s);
  });

  it("keeps the merged run observer outer panel auto-height while process sections use themed internal scrollbars", () => {
    const mapCss = readFileSync("src/graph/execution-map.css", "utf8");
    const panelRule = mapCss.match(/\.emap-run-observer-panel\s*{[^}]*}/)?.[0] ?? "";
    const stageRule = mapCss.match(/\.emap-run-observer-stage\s*{[^}]*}/)?.[0] ?? "";
    const processTopRule = mapCss.match(/\.emap-run-observer-panel\s+\.emap-observer-process-top\s*{[^}]*}/)?.[0] ?? "";
    const scrollbarRule = mapCss.match(/\.emap-run-observer-panel\s+\.emap-observer-process-top::-webkit-scrollbar\s*{[^}]*}/)?.[0] ?? "";
    const thumbRule = mapCss.match(/\.emap-run-observer-panel\s+\.emap-observer-process-top::-webkit-scrollbar-thumb\s*{[^}]*}/)?.[0] ?? "";
    const checkerThumbRule = mapCss.match(/\.emap-run-observer-stage\.checker\s+\.emap-observer-process-top::-webkit-scrollbar-thumb\s*{[^}]*}/)?.[0] ?? "";
    const connectorSocketRule = mapCss.match(/\.emap-connector-sockets\s*{[^}]*}/)?.[0] ?? "";
    const sourceSocketRule = mapCss.match(/\.emap-connector-source-socket\s*{[^}]*}/)?.[0] ?? "";
    const taskConnectionSocketRule = mapCss.match(/\.emap-connector-socket-task-connection\s+\.emap-connector-source-socket\s*{[^}]*}/)?.[0] ?? "";
    const agentSocketRule = mapCss.match(/\.emap-connector-socket-agent-branch\s+\.emap-connector-source-socket\s*{[^}]*}/)?.[0] ?? "";
    const evidenceSocketRule = mapCss.match(/\.emap-connector-socket-evidence\s+\.emap-connector-source-socket\s*{[^}]*}/)?.[0] ?? "";
    const detailBodyRule = mapCss.match(/\.emap-observer-file-detail-body\s*{[^}]*}/)?.[0] ?? "";
    const detailScrollbarRule = mapCss.match(/\.emap-observer-file-detail-body::-webkit-scrollbar\s*{[^}]*}/)?.[0] ?? "";
    const detailThumbRule = mapCss.match(/\.emap-observer-file-detail-body::-webkit-scrollbar-thumb\s*{[^}]*}/)?.[0] ?? "";

    expect(panelRule).toContain("overflow: visible");
    expect(panelRule).not.toContain("overflow: auto");
    expect(stageRule).toContain("height: 204px");
    expect(processTopRule).toContain("overflow-y: auto");
    expect(processTopRule).toContain("scrollbar-width: thin");
    expect(processTopRule).toContain("scrollbar-color");
    expect(scrollbarRule).toContain("width: 8px");
    expect(scrollbarRule).not.toContain("display: none");
    expect(thumbRule).toContain("rgba(121, 216, 208");
    expect(checkerThumbRule).toContain("rgba(255, 206, 118");
    expect(detailBodyRule).toContain("scrollbar-width: thin");
    expect(detailBodyRule).toContain("scrollbar-color");
    expect(detailScrollbarRule).toContain("width: 8px");
    expect(detailThumbRule).toContain("rgba(121, 216, 208");
    expect(connectorSocketRule).toContain("pointer-events: none");
    expect(sourceSocketRule).toContain("stroke-width: 1.6");
    expect(sourceSocketRule).toContain("stroke-linecap: round");
    expect(sourceSocketRule).toContain("vector-effect: non-scaling-stroke");
    expect(sourceSocketRule).toContain("rgba(255, 190, 96");
    expect(taskConnectionSocketRule).toContain("rgba(103, 210, 168");
    expect(agentSocketRule).toContain("rgba(121, 216, 208");
    expect(evidenceSocketRule).toContain("rgba(121, 216, 208");
    expect(mapCss).not.toContain(".emap-connector-anchor-ring");
    expect(mapCss).not.toContain(".emap-connector-anchor-dot");
  });

  it("keeps Task action run summaries readable instead of clipping runtime text", () => {
    const mapCss = readFileSync("src/graph/execution-map.css", "utf8");
    const taskActionRule = mapCss.match(/\.task-action-branch\s*{[^}]*}/)?.[0] ?? "";
    const taskTitleRule = mapCss.match(/\.task-action-branch\s+\.task-leader-branch-title\s+strong\s*{[^}]*}/)?.[0] ?? "";
    const taskMenuRule = mapCss.match(/\.task-action-menu\s*{[^}]*}/)?.[0] ?? "";
    const summaryRule = mapCss.match(/\.task-run-summary\s*{[^}]*}/)?.[0] ?? "";
    const metricsRule = mapCss.match(/\.task-run-summary-metrics\s+strong\s*{[^}]*}/)?.[0] ?? "";
    const messageRule = mapCss.match(/\.task-run-summary-message\s*{[^}]*}/)?.[0] ?? "";
    const runIdRule = mapCss.match(/\.task-run-summary\s+code\s*{[^}]*}/)?.[0] ?? "";

    expect(taskActionRule).toContain("width: 320px");
    expect(taskActionRule).not.toContain("max-width: 280px");
    expect(taskTitleRule).toContain("white-space: normal");
    expect(taskTitleRule).not.toContain("text-overflow: ellipsis");
    expect(taskMenuRule).toContain("width: 100%");
    expect(summaryRule).toContain("width: 100%");
    expect(metricsRule).toContain("overflow-wrap: anywhere");
    expect(metricsRule).not.toContain("text-overflow: ellipsis");
    expect(messageRule).toContain("white-space: normal");
    expect(messageRule).not.toContain("text-overflow: ellipsis");
    expect(runIdRule).toContain("overflow-wrap: anywhere");
    expect(runIdRule).not.toContain("text-overflow: ellipsis");
  });

  it("uses a warm accent for busy Agent cards", () => {
    const mapCss = readFileSync("src/graph/execution-map.css", "utf8");
    const busyRule = mapCss.match(/\.emap-agent-node\[data-agent-run-state="busy"\]\s*{[^}]*}/)?.[0];
    const busyBarRule = mapCss.match(/\.emap-agent-node\[data-agent-run-state="busy"\]\s+\.emap-node-status-bar\s*{[^}]*}/)?.[0];
    const busyPillRule = mapCss.match(/\.emap-agent-node\[data-agent-run-state="busy"\]\s+\.emap-node-state-pill\.running\s*{[^}]*}/)?.[0];

    expect(busyRule).toContain("rgba(255, 104, 64");
    expect(busyRule).not.toContain("rgba(121, 216, 208");
    expect(busyBarRule).toContain("rgb(255, 104, 64)");
    expect(busyPillRule).toContain("rgba(255, 104, 64");
  });

  it("uses a stronger warm accent for running Task cards", () => {
    const mapCss = readFileSync("src/graph/execution-map.css", "utf8");
    const runningRule = mapCss.match(/\.emap-canvas-task-node\.status-running\s*{[^}]*}/)?.[0] ?? "";
    const runningBarRule = mapCss.match(/\.emap-canvas-task-node\.status-running\s+\.emap-node-status-bar\s*{[^}]*}/)?.[0] ?? "";
    const runningPillRule = mapCss.match(/\.emap-canvas-task-node\.status-running\s+\.emap-node-state-pill\.running,\n\.emap-canvas-task-node\.status-running\s+\.emap-node-state-pill\.queued\s*{[^}]*}/)?.[0] ?? "";
    const atlasCardRule = mapCss.match(/\.emap-atlas-card\s*{[^}]*}/)?.[0] ?? "";
    const taskNodeContentRule = mapCss.match(/\.emap-canvas-task-node\s+\.emap-node-content\s*{[^}]*}/)?.[0] ?? "";
    const idCopyRule = mapCss.match(/\.emap-node-id-copy\s*{[^}]*}/)?.[0] ?? "";
    const executionMapSource = readFileSync("src/graph/ExecutionMap.tsx", "utf8");
    const taskAgentGridRule = mapCss.match(/\.emap-task-agent-grid\s*{[^}]*}/)?.[0] ?? "";
    const taskAgentRule = mapCss.match(/\.emap-task-agent-row\s*{[^}]*}/)?.[0] ?? "";
    const taskLeaderRule = mapCss.match(/\.emap-task-agent-row\.role-leader\s*{[^}]*}/)?.[0] ?? "";
    const taskWorkerRule = mapCss.match(/\.emap-task-agent-row\.role-worker\s*{[^}]*}/)?.[0] ?? "";
    const taskCheckerRule = mapCss.match(/\.emap-task-agent-row\.role-checker\s*{[^}]*}/)?.[0] ?? "";

    expect(runningRule).toContain("rgba(255, 104, 64");
    expect(runningBarRule).toContain("rgb(255, 104, 64)");
    expect(runningBarRule).toContain("animation: pulse-bar");
    expect(runningPillRule).toContain("display: inline-flex");
    expect(atlasCardRule).not.toContain("--emap-card-action-rail");
    expect(mapCss).not.toContain(".emap-atlas-card::before");
    expect(mapCss).not.toContain(".emap-node-minimize-button");
    expect(taskNodeContentRule).toContain("padding-right: 44px");
    expect(idCopyRule).toContain("cursor: copy");
    expect(idCopyRule).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(idCopyRule).toContain("justify-self: start");
    expect(idCopyRule).toContain("width: fit-content");
    expect(idCopyRule).toContain("max-width: min(100%, 178px)");
    expect(idCopyRule).not.toContain("width: 100%");
    expect(executionMapSource).toContain("AGENT_NODE_HEIGHT");
    const atlasGeometrySource = readFileSync("src/graph/atlas-geometry.ts", "utf8");
    expect(atlasGeometrySource).toContain("export const AGENT_NODE_HEIGHT = 132");
    expect(taskAgentGridRule).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(taskAgentGridRule).toContain("padding: 4px");
    expect(taskAgentRule).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(taskAgentRule).toContain("border-left");
    expect(taskLeaderRule).toContain("grid-column: 1 / -1");
    expect(taskLeaderRule).toContain("grid-template-columns: 46px minmax(0, 1fr)");
    expect(taskWorkerRule).toContain("rgba(121, 216, 208");
    expect(taskCheckerRule).toContain("rgba(255, 214, 128");
  });

  it("centers link cut buttons on the connector point instead of using fixed offsets", () => {
    const mapCss = readFileSync("src/graph/execution-map.css", "utf8");
    const cutRule = mapCss.match(/\.emap-link-cut-button\s*{[^}]*}/)?.[0] ?? "";
    const visibleRule = mapCss.match(/\.emap-link-cut-button\.is-visible,\n\.emap-link-cut-button:hover,\n\.emap-link-cut-button:focus-visible\s*{[^}]*}/)?.[0] ?? "";

    expect(cutRule).toContain("box-sizing: border-box");
    expect(cutRule).toContain("transform: translate(-50%, -50%) scale(0.78)");
    expect(visibleRule).toContain("transform: translate(-50%, -50%) scale(1)");
  });

  it("documents Agent Atlas mock and live behavior", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("Agent Atlas MVP");
    expect(readme).toContain("Agent workspace");
    expect(readme).toContain("/v1/agents");
    expect(readme).toContain("/v1/agents/status");
    expect(readme).toContain("同源代理");
    expect(readme).toContain("不会暴露给前端 iframe URL");
    expect(readme).toContain("真实状态投到卡片状态条和状态 pill");
    expect(readme).toContain("id chip 可点击复制，默认只显示实际 id");
    expect(readme).toContain("运行中 Task 使用暖橘红边框");
    expect(readme).toContain("Agent 分支卡片");
    expect(readme).toContain("/playground?view=chat&agentId=<agentId>");
    expect(readme).toContain("embed=team-console");
    expect(readme).toContain("主 `/playground` 负责读取 `agentId` URL hint");
    expect(readme).toContain("不写入主页面共用的 active-agent localStorage");
    expect(readme).toContain("主 Agent 卡片打开主 Agent 对话");
    expect(readme).toContain("搜索 Agent 卡片打开搜索 Agent 对话");
    expect(readme).toContain("允许覆盖其他节点");
    expect(readme).toContain("拖动分支标题栏调整位置");
    expect(readme).toContain("右下角调整分支宽高");
    expect(readme).toContain("左键长按后拖动可框选");
    expect(readme).toContain("最大化按钮");
    expect(readme).toContain(".emap-atlas-card");
    expect(readme).toContain("平滑三次贝塞尔曲线");
    expect(readme).toContain("Live API 下已添加 Agent、Task 和 Source 的拖动位置会写入浏览器 `localStorage`");
    expect(readme).toContain("刷新还会恢复当前画布 viewport");
    expect(readme).toContain("底部 Dock 收纳状态");
    expect(readme).toContain("只保存 Team Console 画布 UI 引用");
    expect(readme).toContain("不修改真实 Agent profile、Task 定义或 Source 内容");
    expect(readme).toContain("标题栏双击也可最大化 / 还原");
    expect(readme).toContain("Task 内部包含一个 WorkUnit");
    expect(readme).toContain("leaderAgentId");
    expect(readme).toContain("/v1/team/tasks");
    expect(readme).toContain("/team-task");
    expect(readme).toContain("teamTaskId=<taskId>");
    expect(readme).toContain("创建 Task");
    expect(readme).toContain("Team Console 只打开 leader Agent iframe，不直接创建 Task");
    expect(readme).toContain("teamTaskMode=create");
    expect(readme).toContain("`/team-task` skill 调用 `POST /v1/team/tasks`");
    expect(readme).toContain("手动点击“刷新 Task”");
    expect(readme).toContain("active Canvas Task run 进入终态");
    expect(readme).toContain("typed chain 自动触发的下游 Task run");
    expect(readme).toContain("关闭创建分支后会重新请求 `GET /v1/team/tasks`");
    expect(readme).toContain("点击 Task 卡片会先展开紧凑 Task 操作菜单节点");
    expect(readme).toContain("POST /v1/team/tasks/:taskId/runs");
    expect(readme).toContain("GET /v1/team/task-runs/:runId/tasks/:taskId/attempts");
    expect(readme).toContain("Run observer");
    expect(readme).toContain("roleProcesses");
    expect(readme).toContain("Worker 过程");
    expect(readme).toContain("Checker 过程");
    expect(readme).toContain("不再渲染下半部 tool / method 调用明细");
    expect(readme).toContain("缺少 `roleProcesses`");
    expect(readme).toContain("只隐藏 DOM 明细");
    expect(readme).toContain("formatAssistantText");
    expect(readme).toContain("最新行显示在顶部");
    expect(readme).toContain("不显示 tool group 折叠区或隐藏计数");
    expect(readme).toContain("不接 SSE");
    expect(readme).toContain("只展示 Agent 名字（从 agentsById 解析）、文件名和路径");
    expect(readme).toContain("不会进入 `/v1/team/runs` 的 Plan run 列表");
    expect(readme).toContain("第一版 Task run 只执行 WorkUnit 的 worker → checker");
    expect(readme).toContain("Task → 菜单 → 二级节点");
    expect(readme).toContain("底部 Dock");
    expect(readme).toContain("拖入 Dock 收纳");
    expect(readme).toContain("Agent / Task / Source 根卡片");
    expect(readme).toContain("“文本输出”会创建可编辑 text source");
    expect(readme).toContain("“文件输出”会打开文件选择器");
    expect(readme).toContain("source connection 只允许连到类型相同的 Task input port");
    expect(readme).toContain("“编辑”是浅编辑节点");
    expect(readme).toContain("base snapshot 和 dirty fields");
    expect(readme).toContain("同一字段在草稿打开后已被后台刷新改变");
    expect(readme).toContain("POST /v1/team/tasks/:taskId/archive");
    expect(readme).toContain("Team Console 不再维护本地 transcript + composer");
    expect(readme).not.toContain("Focus Mode 是特殊 Agent 对话界面");
    expect(readme).not.toContain("文件上传与文件库在 Live 模式接 `/v1/assets`");
    expect(readme).not.toContain("当前聊天仍是非 stream scoped chat");

    const runtimeDoc = readFileSync("../../docs/team-runtime.md", "utf8");
    expect(runtimeDoc).toContain("单击 Agent 节点会展开 Agent 分支卡片");
    expect(runtimeDoc).toContain("GET /v1/agents/status");
    expect(runtimeDoc).toContain("同源代理承载 Live API 和嵌入式主 `/playground` iframe");
    expect(runtimeDoc).toContain("不再暴露给浏览器端 iframe");
    expect(runtimeDoc).toContain("卡片状态条与状态 pill 会随真实运行态显示空闲、运行中或状态未知");
    expect(runtimeDoc).toContain("id chip 可点击复制，默认只显示实际 id");
    expect(runtimeDoc).toContain("Task 运行中状态使用暖橘红边框");
    expect(runtimeDoc).toContain("/playground?view=chat&agentId=<agentId>");
    expect(runtimeDoc).toContain("embed=team-console");
    expect(runtimeDoc).toContain("Team Console 不再维护本地 transcript + composer");
    expect(runtimeDoc).toContain("主 `/playground` 读取 `agentId` URL hint");
    expect(runtimeDoc).toContain("active-agent localStorage");
    expect(runtimeDoc).toContain("允许覆盖其他节点");
    expect(runtimeDoc).toContain("拖动分支标题栏移动分支");
    expect(runtimeDoc).toContain("右下角调整分支宽高");
    expect(runtimeDoc).toContain("空白画布左键长按框选多个 Agent / Task 节点");
    expect(runtimeDoc).toContain("标题栏双击最大化到全浏览器 viewport");
    expect(runtimeDoc).toContain("position: fixed; inset: 0");
    expect(runtimeDoc).toContain("没有单独的还原按钮");
    expect(runtimeDoc).toContain("Agent 分支、Task Leader 分支和创建 Task 分支三类对话分支均支持此行为");
    expect(runtimeDoc).toContain(".emap-dialog-branch");
    expect(runtimeDoc).toContain("Live API 下已添加 Agent 与拖动后的画布位置会写入浏览器 `localStorage`");
    expect(runtimeDoc).toContain("底部 Dock 收纳状态和 segmented filter 选择");
    expect(runtimeDoc).toContain("不修改真实 Agent profile 或 Task 定义");
    expect(runtimeDoc).toContain("pan/zoom viewport 会随 Team Console canvas UI state 持久化");
    expect(runtimeDoc).toContain("Task 内部包含一个 WorkUnit");
    expect(runtimeDoc).toContain("leader Agent");
    expect(runtimeDoc).toContain("Team Console 不解析 iframe 聊天文本创建 Task");
    expect(runtimeDoc).toContain("Team Canvas Task frontend workflow");
    expect(runtimeDoc).toContain("teamTaskMode=create");
    expect(runtimeDoc).toContain("teamTaskMode=edit");
    expect(runtimeDoc).toContain("点击已有 Task 先打开紧凑操作菜单节点");
    expect(runtimeDoc).toContain("POST /v1/team/tasks/:taskId/runs");
    expect(runtimeDoc).toContain(".data/team/task-runs/runs/<runId>");
    expect(runtimeDoc).toContain("第一版 Task run 只执行 `workUnit.workerAgentId` 和 `workUnit.checkerAgentId`");
    expect(runtimeDoc).toContain("Run observer 不再单独渲染 Run 状态 canvas 子节点");
    expect(runtimeDoc).toContain("摘要区域直接展示运行状态、阶段、耗时、attempt 数、进度消息和 run id");
    expect(runtimeDoc).toContain("attempt metadata 和 attempt files");
    expect(runtimeDoc).toContain("roleProcesses.worker");
    expect(runtimeDoc).toContain("roleProcesses.checker");
    expect(runtimeDoc).toContain("Worker 过程");
    expect(runtimeDoc).toContain("Checker 过程");
    expect(runtimeDoc).toContain("不再渲染下半部 tool / method 调用明细");
    expect(runtimeDoc).toContain("additive frontend contract");
    expect(runtimeDoc).toContain("formatAssistantText");
    expect(runtimeDoc).toContain("最新行显示在顶部");
    expect(runtimeDoc).toContain("translate(-50%, -50%)");
    expect(runtimeDoc).toContain("前端不丢弃后端数据，只隐藏 DOM 明细");
    expect(runtimeDoc).toContain("SSE 观察流仍是后续后端能力");
    expect(runtimeDoc).toContain("base snapshot + dirty fields");
    expect(runtimeDoc).toContain("input text、output contract、acceptance rules");
    expect(runtimeDoc).toContain("关闭创建分支、浅编辑保存成功、归档成功后会重新请求 `GET /v1/team/tasks`");
    expect(runtimeDoc).toContain("active Canvas Task run 通过 `GET /v1/team/task-runs/:runId` 轮询进入终态");
    expect(runtimeDoc).toContain("所有 Task run 列表");
    expect(runtimeDoc).not.toContain("Focus Mode 特殊 Agent 对话界面");
    expect(runtimeDoc).not.toContain("WorkUnit run 未实现");

    const playgroundCurrent = readFileSync("../../docs/playground-current.md", "utf8");
    expect(playgroundCurrent).toContain("2026-05-25 Team Console Task run process nodes");
    expect(playgroundCurrent).toContain("Worker 过程");
    expect(playgroundCurrent).toContain("Checker 过程");
    expect(playgroundCurrent).toContain("roleProcesses");
    expect(playgroundCurrent).toContain("不再渲染下半部 tool / method 调用明细");
    expect(playgroundCurrent).toContain("中文标点自然断句");
    expect(playgroundCurrent).toContain("完整过程数据仍保留在后端 attempt metadata 中");
    expect(playgroundCurrent).toContain("不接 SSE");

    const changeLog = readFileSync("../../docs/change-log.md", "utf8");
    expect(changeLog).toContain("2026-05-25 — Team Console Task run process nodes UI budget");
    expect(changeLog).toContain("2026-05-26 — Team Console 自动发现下游 Task run");
    expect(changeLog).toContain("不接 SSE");
    expect(changeLog).toContain("2026-05-25 — Team Console Task run process nodes 前端实现");
    expect(changeLog).toContain("roleProcesses.worker");
    expect(changeLog).toContain("roleProcesses.checker");
    expect(changeLog).toContain("Team Console 过程节点隐藏方法调用明细");
    expect(changeLog).toContain("过程节点不再渲染下半部 tool / method 调用明细");
    expect(changeLog).toContain("Team Console 过程展示与根卡片 UI 优化");
    expect(changeLog).toContain("Task ID");
    expect(changeLog).toContain("Worker 过程");
    expect(changeLog).toContain("Checker 过程");
    expect(changeLog).toContain("不改 `src/team/**`");
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
