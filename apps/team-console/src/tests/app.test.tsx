import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { MockTeamApi, makeSequentialPlan, makeSequentialRun } from "../fixtures/team-fixtures";

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

  it("focuses an agent card above a chat panel and restores the canvas", async () => {
    const { container } = render(<App />);

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
    expect(stage.style.transform).not.toBe(initialTransform);
    expect(stage.style.transform).toContain("scale(1.08)");
    expect(screen.getByText("Agent Chat Panel")).toBeInTheDocument();
    expect(screen.getByText("主 Agent / main")).toBeInTheDocument();
    expect(within(atlas).getByText("搜索 Agent")).toBeInTheDocument();
    expect(atlas.querySelectorAll(".agent-chat-panel")).toHaveLength(1);

    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /搜索 Agent/ }));

    expect(atlas).toHaveAttribute("data-agent-focus", "search");
    expect(screen.getByText("搜索 Agent / search")).toBeInTheDocument();
    expect(atlas.querySelectorAll(".agent-chat-panel")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "收起" }));

    expect(atlas).toHaveAttribute("data-agent-focus", "none");
    expect(stage.style.transform).toBe(initialTransform);
    expect(screen.queryByText("Agent Chat Panel")).toBeNull();
    expect(atlas.querySelectorAll(".emap-agent-node")).toHaveLength(2);
  });

  it("locks atlas pan and zoom while an agent is focused and restores free mode after collapse", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

    const atlas = getAtlas(container);
    const stage = getAtlasStage(container);
    const agentNode = within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ });
    fireEvent.click(agentNode);

    const focusedTransform = stage.style.transform;
    expect(atlas).toHaveAttribute("data-interaction-mode", "locked");
    expect(screen.getByRole("button", { name: "放大" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "缩小" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重置视图" })).toBeDisabled();

    fireEvent.wheel(atlas, { deltaY: -120, clientX: 120, clientY: 120 });
    firePointer(atlas, "pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
    firePointer(atlas, "pointermove", { pointerId: 1, clientX: 70, clientY: 88 });
    firePointer(atlas, "pointerup", { pointerId: 1, clientX: 70, clientY: 88, buttons: 0 });
    fireEvent.click(screen.getByRole("button", { name: "放大" }));

    expect(stage.style.transform).toBe(focusedTransform);

    fireEvent.click(screen.getByRole("button", { name: "收起" }));

    expect(atlas).toHaveAttribute("data-interaction-mode", "free");
    expect(screen.getByRole("button", { name: "放大" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "缩小" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "重置视图" })).toBeEnabled();

    firePointer(atlas, "pointerdown", { pointerId: 2, clientX: 10, clientY: 10 });
    firePointer(atlas, "pointermove", { pointerId: 2, clientX: 34, clientY: 46 });
    firePointer(atlas, "pointerup", { pointerId: 2, clientX: 34, clientY: 46, buttons: 0 });
    expect(stage.style.transform).toContain("translate(24px, 36px)");

    fireEvent.click(screen.getByRole("button", { name: "重置视图" }));
    fireEvent.click(screen.getByRole("button", { name: "放大" }));
    expect(stage.style.transform).toContain("scale(1.1)");
  });

  it("drags an agent card by world coordinates without opening focus", async () => {
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
    expect(screen.queryByText("Agent Chat Panel")).toBeNull();
  });

  it("allows a later click to focus an agent after a drag gesture", async () => {
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
    expect(screen.getByText("Agent Chat Panel")).toBeInTheDocument();
  });

  it("does not move agent cards while focus mode is locked", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

    const agentNode = within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }) as HTMLElement;
    fireEvent.click(agentNode);

    const focusedLeft = agentNode.style.left;
    const focusedTop = agentNode.style.top;
    expect(getAtlas(container)).toHaveAttribute("data-interaction-mode", "locked");

    firePointer(agentNode, "pointerdown", { pointerId: 8, clientX: 100, clientY: 100 });
    firePointer(agentNode, "pointermove", { pointerId: 8, clientX: 180, clientY: 144 });
    firePointer(agentNode, "pointerup", { pointerId: 8, clientX: 180, clientY: 144, buttons: 0 });

    expect(agentNode.style.left).toBe(focusedLeft);
    expect(agentNode.style.top).toBe(focusedTop);
  });

  it("sends a message from the focused agent panel", async () => {
    const sendSpy = vi.spyOn(MockTeamApi.prototype, "sendAgentMessage");
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "请总结画布状态" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(screen.getByText("请总结画布状态")).toBeInTheDocument();
    await waitFor(() => expect(sendSpy).toHaveBeenCalledWith("main", "请总结画布状态"));
    expect(await screen.findByText("[main] mock reply: 请总结画布状态")).toBeInTheDocument();
  });

  it("reuses a focused agent conversation id across chat turns", async () => {
    const sendSpy = vi.spyOn(MockTeamApi.prototype, "sendAgentMessage")
      .mockResolvedValueOnce({ conversationId: "conv_main_1", text: "第一轮回复" })
      .mockResolvedValueOnce({ conversationId: "conv_main_1", text: "第二轮回复" });
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "第一轮" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(await screen.findByText("第一轮回复")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "第二轮" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(sendSpy).toHaveBeenCalledTimes(2));
    expect(sendSpy).toHaveBeenNthCalledWith(1, "main", "第一轮");
    expect(sendSpy).toHaveBeenNthCalledWith(2, "main", "第二轮", "conv_main_1");
  });

  it("shows chat errors without removing the sent user message", async () => {
    vi.spyOn(MockTeamApi.prototype, "sendAgentMessage").mockRejectedValueOnce({ message: "agent offline" });
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "这条会失败" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(screen.getByText("这条会失败")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("agent offline");
    expect(screen.getByText("这条会失败")).toBeInTheDocument();
  });

  it("does not submit empty agent messages", async () => {
    const sendSpy = vi.spyOn(MockTeamApi.prototype, "sendAgentMessage");
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(sendSpy).not.toHaveBeenCalled();
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

  it("fetches live plans, runs, and selected run detail when switching to Live API", async () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([plan]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([run]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(run), { status: 200 }));

    render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(fetch).toHaveBeenNthCalledWith(1, "/v1/agents");
    expect(fetch).toHaveBeenNthCalledWith(2, "/v1/team/plans");
    expect(fetch).toHaveBeenNthCalledWith(3, "/v1/team/runs");
    expect(fetch).toHaveBeenNthCalledWith(4, "/v1/team/runs/run_seq_001");
  });

  it("loads live agent catalog when switching to Live API", async () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([plan]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([run]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(run), { status: 200 }));

    render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(fetch).toHaveBeenNthCalledWith(1, "/v1/agents");
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
      .mockResolvedValueOnce(new Response(JSON.stringify([plan]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([run]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(run), { status: 200 }));

    render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    expect(await screen.findByText("Live-only vendor task")).toBeInTheDocument();
  });

  it("keeps live agent workspace usable when no live team run exists", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

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

  it("vite proxy includes the scoped agent API", () => {
    const config = readFileSync("vite.config.ts", "utf8");
    expect(config).toContain('"/v1/agents"');
    expect(config).toContain("teamApiTarget");
  });

  it("documents Agent Atlas mock and live behavior", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("Agent Atlas MVP");
    expect(readme).toContain("Agent workspace");
    expect(readme).toContain("/v1/agents");
    expect(readme).toContain("/v1/agents/:agentId/chat");
    expect(readme).toContain("conversationId");
    expect(readme).toContain("拖拽只改变 Team Console 画布引用位置");
    expect(readme).toContain("Focus Mode 是固定锁定视窗");
  });
});
