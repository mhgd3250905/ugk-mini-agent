import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { makeSequentialPlan, makeSequentialRun, mockTeamTasks, resetMockTeamApiState } from "../fixtures/team-fixtures";

function getAtlas(container: HTMLElement): HTMLElement {
  const atlas = container.querySelector(".execution-map-container") as HTMLElement | null;
  expect(atlas).toBeTruthy();
  return atlas!;
}

function getAtlasNodes(container: HTMLElement): HTMLElement {
  const atlasNodes = container.querySelector(".execution-map-nodes") as HTMLElement | null;
  expect(atlasNodes).toBeTruthy();
  return atlasNodes!;
}

function getAtlasStage(container: HTMLElement): HTMLElement {
  const stage = container.querySelector(".execution-map-scroll") as HTMLElement | null;
  expect(stage).toBeTruthy();
  return stage!;
}

function firePointer(
  target: Element,
  type: string,
  init: {
    pointerId: number;
    clientX: number;
    clientY: number;
    button?: number;
    buttons?: number;
  },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId },
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    button: { value: init.button ?? 0 },
    buttons: { value: init.buttons ?? 1 },
  });
  fireEvent(target, event);
}

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

  it("renders mock Task cards in the Agent workspace", async () => {
    const { container } = render(<App />);

    const atlasNodes = getAtlasNodes(container);
    const taskNode = await within(atlasNodes).findByRole("button", { name: /调查 Medtrum 云资产/ });
    expect(taskNode).toBeInTheDocument();
    expect(within(taskNode).getByText("leader: 主 Agent")).toBeInTheDocument();
    expect(within(taskNode).getByText("worker: 搜索 Agent")).toBeInTheDocument();
    expect(within(taskNode).getByText("checker: 主 Agent")).toBeInTheDocument();
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
    expect(within(atlasNodes).getByText("主 Agent")).toBeInTheDocument();
    expect(within(atlasNodes).getByText("main")).toBeInTheDocument();
    expect(container.querySelector(".agent-canvas-board")).toBeNull();
    expect(screen.queryByRole("button", { name: /主 Agent[\s\S]*已加入/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    const joinedOption = screen.getByRole("button", { name: /主 Agent[\s\S]*已加入/ });
    expect(joinedOption).toBeDisabled();

    fireEvent.click(joinedOption);
    expect(within(atlasNodes).getAllByText("main")).toHaveLength(1);
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

    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    expect(atlas).toHaveAttribute("data-agent-focus", "main");
    expect(atlas).toHaveAttribute("data-interaction-mode", "free");
    expect(stage.style.transform).toBe(initialTransform);
    expect(stage).not.toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".agent-focus-workspace")).toBeNull();
    expect(screen.getByText("执行运行")).toBeInTheDocument();
    expect(screen.getByText("Research vendor A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /搜索 Agent/ })).toBeInTheDocument();
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
  });

  it("clicking the expanded agent card collapses the embedded branch", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    const agentNode = within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ });

    fireEvent.click(agentNode);
    expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
    fireEvent.click(agentNode);

    expect(getAtlas(container)).toHaveAttribute("data-agent-focus", "none");
    expect(container.querySelector(".agent-playground-branch")).toBeNull();
  });

  it("switches the embedded playground branch to the clicked agent id", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(screen.getByRole("button", { name: /搜索 Agent[\s\S]*search/ }));

    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));
    expect(container.querySelector("iframe")?.getAttribute("src")).toContain("agentId=main");

    const searchNode = within(getAtlasNodes(container)).getByRole("button", { name: /搜索 Agent/ });
    firePointer(searchNode, "pointerdown", { pointerId: 12, clientX: 220, clientY: 80 });
    firePointer(searchNode, "pointerup", { pointerId: 12, clientX: 220, clientY: 80, buttons: 0 });
    fireEvent.click(searchNode);

    const branch = container.querySelector(".agent-playground-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    expect(within(branch!).getByText("搜索 Agent")).toBeInTheDocument();
    expect(branch!.querySelector("iframe")?.getAttribute("src")).toContain("/playground?view=chat&agentId=search");
    expect(branch!.querySelector("iframe")?.getAttribute("src")).toContain("embed=team-console");
  });

  it("drags the embedded playground branch by its title bar", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    const branchShell = container.querySelector(".emap-agent-branch-shell") as HTMLElement | null;
    const titleBar = container.querySelector(".agent-playground-branch-head") as HTMLElement | null;
    const atlasStage = container.querySelector(".execution-map-scroll") as HTMLElement | null;
    expect(branchShell).toBeTruthy();
    expect(titleBar).toBeTruthy();
    expect(atlasStage).toBeTruthy();
    const initialLeft = Number.parseFloat(branchShell!.style.left);
    const initialTop = Number.parseFloat(branchShell!.style.top);
    const initialStageTransform = atlasStage!.style.transform;

    firePointer(titleBar!, "pointerdown", { pointerId: 21, clientX: 300, clientY: 120 });
    firePointer(titleBar!, "pointermove", { pointerId: 21, clientX: 380, clientY: 155 });
    firePointer(titleBar!, "pointerup", { pointerId: 21, clientX: 380, clientY: 155, buttons: 0 });

    expect(Number.parseFloat(branchShell!.style.left)).toBeCloseTo(initialLeft + 80, 4);
    expect(Number.parseFloat(branchShell!.style.top)).toBeCloseTo(initialTop + 35, 4);
    expect(atlasStage!.style.transform).toBe(initialStageTransform);
  });

  it("allows dragging the embedded playground branch above the atlas origin", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    const branchShell = container.querySelector(".emap-agent-branch-shell") as HTMLElement | null;
    const titleBar = container.querySelector(".agent-playground-branch-head") as HTMLElement | null;
    expect(branchShell).toBeTruthy();
    expect(titleBar).toBeTruthy();
    const initialTop = Number.parseFloat(branchShell!.style.top);

    firePointer(titleBar!, "pointerdown", { pointerId: 25, clientX: 300, clientY: 120 });
    firePointer(titleBar!, "pointermove", { pointerId: 25, clientX: 300, clientY: -80 });
    firePointer(titleBar!, "pointerup", { pointerId: 25, clientX: 300, clientY: -80, buttons: 0 });

    expect(Number.parseFloat(branchShell!.style.top)).toBeCloseTo(initialTop - 200, 4);
  });

  it("anchors the embedded playground branch link to the nearest sides after dragging below the agent", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    const titleBar = container.querySelector(".agent-playground-branch-head") as HTMLElement | null;
    expect(titleBar).toBeTruthy();

    firePointer(titleBar!, "pointerdown", { pointerId: 24, clientX: 500, clientY: 120 });
    firePointer(titleBar!, "pointermove", { pointerId: 24, clientX: 172, clientY: 420 });
    firePointer(titleBar!, "pointerup", { pointerId: 24, clientX: 172, clientY: 420, buttons: 0 });

    const branchLink = container.querySelector(".emap-link-agent-branch") as SVGPathElement | null;
    expect(branchLink).toBeTruthy();
    expect(branchLink!.getAttribute("d")).toContain("M500,112");
    expect(branchLink!.getAttribute("d")).not.toContain("M640,56");
  });

  it("resizes the embedded playground branch from the bottom-right handle", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    const branchShell = container.querySelector(".emap-agent-branch-shell") as HTMLElement | null;
    const resizeHandle = container.querySelector(".emap-agent-branch-resize-handle") as HTMLElement | null;
    expect(branchShell).toBeTruthy();
    expect(resizeHandle).toBeTruthy();
    const initialWidth = Number.parseFloat(branchShell!.style.width);
    const initialHeight = Number.parseFloat(branchShell!.style.height);

    firePointer(resizeHandle!, "pointerdown", { pointerId: 22, clientX: 900, clientY: 620 });
    firePointer(resizeHandle!, "pointermove", { pointerId: 22, clientX: 1020, clientY: 690 });
    firePointer(resizeHandle!, "pointerup", { pointerId: 22, clientX: 1020, clientY: 690, buttons: 0 });

    expect(Number.parseFloat(branchShell!.style.width)).toBeCloseTo(initialWidth + 120, 4);
    expect(Number.parseFloat(branchShell!.style.height)).toBeCloseTo(initialHeight + 70, 4);
  });

  it("drags an agent card by world coordinates without opening the embedded branch", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(screen.getByRole("button", { name: "放大" }));

    const atlas = getAtlas(container);
    const agentNode = within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }) as HTMLElement;
    const initialLeft = Number.parseFloat(agentNode.style.left);
    const initialTop = Number.parseFloat(agentNode.style.top);

    firePointer(agentNode, "pointerdown", { pointerId: 7, clientX: 100, clientY: 100 });
    firePointer(agentNode, "pointermove", { pointerId: 7, clientX: 155, clientY: 133 });
    firePointer(agentNode, "pointerup", { pointerId: 7, clientX: 155, clientY: 133, buttons: 0 });
    fireEvent.click(agentNode);

    expect(Number.parseFloat(agentNode.style.left)).toBeCloseTo(initialLeft + 50, 4);
    expect(Number.parseFloat(agentNode.style.top)).toBeCloseTo(initialTop + 30, 4);
    expect(atlas).toHaveAttribute("data-agent-focus", "none");
    expect(container.querySelector(".agent-playground-branch")).toBeNull();
  });

  it("allows a later click to expand an agent branch after a drag gesture", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

    const agentNode = within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }) as HTMLElement;

    firePointer(agentNode, "pointerdown", { pointerId: 9, clientX: 100, clientY: 100 });
    firePointer(agentNode, "pointermove", { pointerId: 9, clientX: 150, clientY: 130 });
    firePointer(agentNode, "pointerup", { pointerId: 9, clientX: 150, clientY: 130, buttons: 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    fireEvent.click(agentNode);

    expect(getAtlas(container)).toHaveAttribute("data-agent-focus", "main");
    expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
    expect(within(container.querySelector(".agent-playground-branch") as HTMLElement).getByText("主 Agent")).toBeInTheDocument();
  });
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 }));

    render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenNthCalledWith(1, "/v1/agents");
    expect(fetch).toHaveBeenNthCalledWith(2, "/v1/agents/status", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    expect(fetch).toHaveBeenNthCalledWith(3, "/v1/team/tasks");
    expect(screen.getByRole("button", { name: "Agent workspace" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "最新 Run" })).not.toHaveClass("active");
    expect(screen.queryByText("执行运行")).toBeNull();
    expect(screen.queryByText("Research vendor A")).toBeNull();
    expect(fetch).not.toHaveBeenCalledWith("/v1/team/plans");
    expect(fetch).not.toHaveBeenCalledWith("/v1/team/runs");
    expect(await screen.findByText(liveTask.title)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加 Agent" })).toBeEnabled();
  });

  it("fetches live plans, runs, and selected run detail when latest Run is requested", async () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([plan]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([run]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(run), { status: 200 }));

    render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole("button", { name: "最新 Run" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
    expect(fetch).toHaveBeenNthCalledWith(1, "/v1/agents");
    expect(fetch).toHaveBeenNthCalledWith(2, "/v1/agents/status", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    expect(fetch).toHaveBeenNthCalledWith(3, "/v1/team/tasks");
    expect(fetch).toHaveBeenNthCalledWith(4, "/v1/team/plans");
    expect(fetch).toHaveBeenNthCalledWith(5, "/v1/team/runs");
    expect(fetch).toHaveBeenNthCalledWith(6, "/v1/team/runs/run_seq_001");
  });

  it("loads live agent catalog when switching to Live API", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [{ agentId: "main", name: "主 Agent", status: "idle" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [] }), { status: 200 }));

    render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenNthCalledWith(1, "/v1/agents");
    expect(fetch).toHaveBeenNthCalledWith(2, "/v1/agents/status", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    expect(fetch).toHaveBeenNthCalledWith(3, "/v1/team/tasks");
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

    const firstAgentNode = within(getAtlasNodes(first.container)).getByRole("button", { name: /主 Agent/ }) as HTMLElement;
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

    const restoredAgentNode = await within(getAtlasNodes(second.container)).findByRole("button", { name: /主 Agent/ }) as HTMLElement;
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

    const firstTaskNode = await within(getAtlasNodes(first.container)).findByRole("button", { name: /调查 Medtrum 云资产/ }) as HTMLElement;
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
    const restoredTaskNode = await within(getAtlasNodes(second.container)).findByRole("button", { name: /调查 Medtrum 云资产/ }) as HTMLElement;
    expect(Number.parseFloat(restoredTaskNode.style.left)).toBeCloseTo(350, 4);
    expect(Number.parseFloat(restoredTaskNode.style.top)).toBeCloseTo(255, 4);
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
      .mockResolvedValueOnce(new Response(JSON.stringify([plan]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([run]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(run), { status: 200 }));

    render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole("button", { name: "最新 Run" }));

    expect(await screen.findByText("Live-only vendor task")).toBeInTheDocument();
  });

  it("keeps live agent workspace usable when no live team run exists", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [{ agentId: "main", name: "主 Agent", status: "idle" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [] }), { status: 200 }));

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
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

  it("vite proxy includes the Team Console API surface", () => {
    const config = readFileSync("vite.config.ts", "utf8");
    expect(config).toContain('"/v1/team"');
    expect(config).toContain('"/v1/agents"');
    expect(config).toContain('"/v1/assets"');
    expect(config).toContain("VITE_TEAM_CONSOLE_API_TARGET");
    expect(config).not.toContain('"/v1/conns"');
    expect(config).not.toContain('"/v1/activity"');
    expect(config).not.toContain('"/playground"');
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

  it("documents Agent Atlas mock and live behavior", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("Agent Atlas MVP");
    expect(readme).toContain("Agent workspace");
    expect(readme).toContain("/v1/agents");
    expect(readme).toContain("/v1/agents/status");
    expect(readme).toContain("真实状态投到卡片状态条和状态 pill");
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
    expect(readme).toContain("Live API 下已添加 Agent 与拖动后的画布位置会写入浏览器 `localStorage`");
    expect(readme).toContain("这只保存 Team Console 画布引用位置，不修改真实 Agent profile");
    expect(readme).toContain("Team Console 不再维护本地 transcript + composer");
    expect(readme).not.toContain("Focus Mode 是特殊 Agent 对话界面");
    expect(readme).not.toContain("文件上传与文件库在 Live 模式接 `/v1/assets`");
    expect(readme).not.toContain("当前聊天仍是非 stream scoped chat");

    const runtimeDoc = readFileSync("../../docs/team-runtime.md", "utf8");
    expect(runtimeDoc).toContain("单击 Agent 节点会展开 Agent 分支卡片");
    expect(runtimeDoc).toContain("GET /v1/agents/status");
    expect(runtimeDoc).toContain("卡片状态条与状态 pill 会随真实运行态显示空闲、运行中或状态未知");
    expect(runtimeDoc).toContain("/playground?view=chat&agentId=<agentId>");
    expect(runtimeDoc).toContain("embed=team-console");
    expect(runtimeDoc).toContain("Team Console 不再维护本地 transcript + composer");
    expect(runtimeDoc).toContain("主 `/playground` 读取 `agentId` URL hint");
    expect(runtimeDoc).toContain("active-agent localStorage");
    expect(runtimeDoc).toContain("允许覆盖其他节点");
    expect(runtimeDoc).toContain("拖动分支标题栏移动分支");
    expect(runtimeDoc).toContain("右下角调整分支宽高");
    expect(runtimeDoc).toContain("Live API 下已添加 Agent 与拖动后的画布位置会写入浏览器 `localStorage`");
    expect(runtimeDoc).toContain("这只保存 Team Console 画布引用位置，不修改真实 Agent profile");
    expect(runtimeDoc).not.toContain("Focus Mode 特殊 Agent 对话界面");
    expect(runtimeDoc).toContain("仍不落地 WorkUnit / Plan 编排");
  });
});
