import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { MockTeamApi, makeSequentialPlan, makeSequentialRun, resetMockTeamApiState } from "../fixtures/team-fixtures";

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

function mockContextUsage() {
  return {
    provider: "zhipu-glm",
    model: "glm-5.1",
    currentTokens: 0,
    contextWindow: 128000,
    reserveTokens: 16384,
    maxResponseTokens: 16384,
    availableTokens: 111616,
    percent: 0,
    status: "safe" as const,
    mode: "estimate" as const,
  };
}

function mockAsset(assetId: string, fileName = `${assetId}.md`) {
  return {
    assetId,
    fileName,
    mimeType: "text/markdown",
    sizeBytes: 1024,
    kind: "text" as const,
    createdAt: "2026-05-24T00:00:00.000Z",
  };
}

describe("App", () => {
  beforeEach(() => {
    resetMockTeamApiState();
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

  it("renders an isolated focused agent workspace and restores the canvas", async () => {
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
    expect(stage.style.transform).not.toBe(initialTransform);
    expect(stage.style.transform).toContain("scale(1.08)");
    expect(stage).toHaveAttribute("aria-hidden", "true");

    const focusWorkspace = container.querySelector(".agent-focus-workspace") as HTMLElement | null;
    expect(focusWorkspace).toBeTruthy();
    expect(focusWorkspace?.querySelector(".agent-focus-chat-stage")).toBeTruthy();
    expect(focusWorkspace?.querySelector(".agent-focus-command-deck")).toBeTruthy();
    expect(focusWorkspace?.querySelector(".agent-focus-composer")).toBeTruthy();
    expect(within(focusWorkspace!).getByText("主 Agent")).toBeInTheDocument();
    expect(within(focusWorkspace!).getByText("主 Agent / main")).toBeInTheDocument();
    expect(within(focusWorkspace!).getByText("UGK CLAW")).toBeInTheDocument();
    expect(focusWorkspace?.querySelector(".agent-switcher")).toBeNull();

    expect(screen.queryByRole("button", { name: /搜索 Agent/ })).toBeNull();
    expect(screen.queryByText("搜索 Agent / search")).toBeNull();
    expect(screen.queryByText("执行运行")).toBeNull();
    expect(screen.queryByText("Research vendor A")).toBeNull();

    fireEvent.click(focusWorkspace!);
    expect(atlas).toHaveAttribute("data-agent-focus", "main");
    expect(screen.queryByText("搜索 Agent / search")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "收起" }));

    expect(atlas).toHaveAttribute("data-agent-focus", "none");
    expect(stage.style.transform).toBe(initialTransform);
    expect(stage).not.toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText("主 Agent / main")).toBeNull();
    expect(atlas.querySelectorAll(".emap-agent-node")).toHaveLength(2);
    expect(screen.getByText("执行运行")).toBeInTheDocument();
    expect(screen.getByText("Research vendor A")).toBeInTheDocument();
  });

  it("renders focus topbar entries without the agent switcher or composer shortcut hint", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    const focusWorkspace = container.querySelector(".agent-focus-workspace") as HTMLElement | null;
    expect(focusWorkspace).toBeTruthy();
    const focusTopbar = within(focusWorkspace!).getByLabelText("Agent Focus topbar");

    expect(within(focusTopbar).getByRole("button", { name: "新会话" })).toBeInTheDocument();
    expect(within(focusTopbar).getByRole("button", { name: "文件库" })).toBeInTheDocument();
    expect(within(focusTopbar).queryByRole("button", { name: "后台任务" })).toBeNull();
    expect(within(focusTopbar).queryByRole("link", { name: "Team Runtime" })).toBeNull();
    expect(within(focusTopbar).getByRole("button", { name: /上下文使用/ })).toBeInTheDocument();
    expect(within(focusTopbar).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(focusWorkspace!.querySelector(".agent-switcher")).toBeNull();
    expect(within(focusWorkspace!).queryByRole("button", { name: /添加 Agent|打开 Agent 页面/ })).toBeNull();
    expect(within(focusWorkspace!).queryByText("Shift+Enter 换行")).toBeNull();
  });

  it("loads the scoped conversation catalog when entering agent focus", async () => {
    const catalogSpy = vi.spyOn(MockTeamApi.prototype, "listAgentConversations");
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    await waitFor(() => expect(catalogSpy).toHaveBeenCalledWith("main"));
  });

  it("restores focused agent server conversation state", async () => {
    vi.spyOn(MockTeamApi.prototype, "listAgentConversations").mockResolvedValue({
      currentConversationId: "conv_main_current",
      conversations: [{
        conversationId: "conv_main_current",
        title: "Current",
        preview: "server assistant",
        messageCount: 2,
        createdAt: "2026-05-24T00:00:00.000Z",
        updatedAt: "2026-05-24T00:01:00.000Z",
        running: false,
      }],
    });
    const stateSpy = vi.spyOn(MockTeamApi.prototype, "getAgentConversationState").mockResolvedValue({
      conversationId: "conv_main_current",
      running: false,
      contextUsage: mockContextUsage(),
      messages: [],
      viewMessages: [
        {
          id: "m1",
          kind: "user",
          title: "User",
          text: "server user",
          createdAt: "2026-05-24T00:00:00.000Z",
        },
        {
          id: "m2",
          kind: "assistant",
          title: "Agent",
          text: "server assistant",
          createdAt: "2026-05-24T00:01:00.000Z",
        },
      ],
      activeRun: null,
      historyPage: { hasMore: false, limit: 80 },
      updatedAt: "2026-05-24T00:01:00.000Z",
    });
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    expect(await screen.findByText("server assistant")).toBeInTheDocument();
    expect(screen.getByText("server user")).toBeInTheDocument();
    expect(stateSpy).toHaveBeenCalledWith("main", "conv_main_current", 80);
  });

  it("keeps focused conversations isolated between agents", async () => {
    vi.spyOn(MockTeamApi.prototype, "listAgentConversations").mockImplementation(async (agentId: string) => ({
      currentConversationId: `conv_${agentId}`,
      conversations: [{
        conversationId: `conv_${agentId}`,
        title: agentId,
        preview: agentId,
        messageCount: 1,
        createdAt: "2026-05-24T00:00:00.000Z",
        updatedAt: "2026-05-24T00:01:00.000Z",
        running: false,
      }],
    }));
    vi.spyOn(MockTeamApi.prototype, "getAgentConversationState").mockImplementation(async (agentId: string, conversationId: string) => ({
      conversationId,
      running: false,
      contextUsage: mockContextUsage(),
      messages: [],
      viewMessages: [{
        id: `message_${agentId}`,
        kind: "assistant",
        title: "Agent",
        text: `${agentId} server history`,
        createdAt: "2026-05-24T00:00:00.000Z",
      }],
      activeRun: null,
      historyPage: { hasMore: false, limit: 80 },
      updatedAt: "2026-05-24T00:00:00.000Z",
    }));
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(screen.getByRole("button", { name: /搜索 Agent[\s\S]*search/ }));

    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));
    expect(await screen.findByText("main server history")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "收起" }));

    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /搜索 Agent/ }));
    expect(await screen.findByText("search server history")).toBeInTheDocument();
    expect(screen.queryByText("main server history")).toBeNull();
  });

  it("starts a new scoped conversation and refreshes empty state", async () => {
    vi.spyOn(MockTeamApi.prototype, "listAgentConversations").mockResolvedValue({
      currentConversationId: "",
      conversations: [],
    });
    vi.spyOn(MockTeamApi.prototype, "getAgentConversationState").mockResolvedValue({
      conversationId: "mock-main-new",
      running: false,
      contextUsage: mockContextUsage(),
      messages: [],
      viewMessages: [],
      activeRun: null,
      historyPage: { hasMore: false, limit: 80 },
      updatedAt: "2026-05-24T00:00:00.000Z",
    });
    const createSpy = vi.spyOn(MockTeamApi.prototype, "createAgentConversation")
      .mockResolvedValue({ conversationId: "mock-main-new", currentConversationId: "mock-main-new", created: true });
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));
    const focusWorkspace = container.querySelector(".agent-focus-workspace") as HTMLElement;
    fireEvent.click(within(focusWorkspace).getByRole("button", { name: "文件库" }));
    const library = await within(focusWorkspace).findByRole("dialog", { name: "文件库" });
    fireEvent.click(within(library).getByRole("button", { name: "复用 mock-reference.md" }));
    expect(within(focusWorkspace).getByText("mock-reference.md")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新会话" }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith("main"));
    await waitFor(() => expect(MockTeamApi.prototype.getAgentConversationState).toHaveBeenCalledWith("main", "mock-main-new", 80));
    expect(within(focusWorkspace).queryByText("mock-reference.md")).toBeNull();
    expect(screen.getByText("当前 Agent 会话尚未开始。")).toBeInTheDocument();
  });

  it("shows state restore errors without disabling the focus workspace", async () => {
    vi.spyOn(MockTeamApi.prototype, "listAgentConversations").mockResolvedValue({
      currentConversationId: "conv_broken",
      conversations: [{
        conversationId: "conv_broken",
        title: "Broken",
        preview: "",
        messageCount: 0,
        createdAt: "2026-05-24T00:00:00.000Z",
        updatedAt: "2026-05-24T00:00:00.000Z",
        running: false,
      }],
    });
    vi.spyOn(MockTeamApi.prototype, "getAgentConversationState").mockRejectedValue({ message: "state down" });
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    const focusWorkspace = container.querySelector(".agent-focus-workspace") as HTMLElement;
    expect(await within(focusWorkspace).findByRole("alert")).toHaveTextContent("state down");
    expect(within(focusWorkspace).getByLabelText("Agent message")).toBeEnabled();
    expect(within(focusWorkspace).getByRole("button", { name: "发送" })).toBeDisabled();
  });

  it("supports focus composer file selection, selected file removal, and file library reuse", async () => {
    const uploadSpy = vi.spyOn(
      MockTeamApi.prototype as unknown as {
        uploadFilesAsAssets(files: File[], conversationId?: string): Promise<Array<{
          assetId: string;
          fileName: string;
          mimeType: string;
          sizeBytes: number;
          kind: "text" | "binary" | "metadata";
        }>>;
      },
      "uploadFilesAsAssets",
    ).mockImplementation(async (files: File[]) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const file = files[0];
      return [{
        assetId: "mock-upload-brief",
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        kind: "text",
      }];
    });
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    const focusWorkspace = container.querySelector(".agent-focus-workspace") as HTMLElement;
    const fileButton = within(focusWorkspace).getByRole("button", { name: "选择文件" });
    const fileInput = focusWorkspace.querySelector('input[type="file"][multiple]') as HTMLInputElement | null;
    expect(fileButton).toBeInTheDocument();
    expect(fileInput).toBeTruthy();

    const file = new File(["hello"], "brief.md", { type: "text/markdown" });
    fireEvent.change(fileInput!, { target: { files: [file] } });
    expect(within(focusWorkspace).getByText("上传中")).toBeInTheDocument();
    expect(await within(focusWorkspace).findByText("brief.md")).toBeInTheDocument();
    expect(uploadSpy).toHaveBeenCalledWith([file], undefined);

    fireEvent.click(within(focusWorkspace).getByRole("button", { name: "移除 brief.md" }));
    expect(within(focusWorkspace).queryByText("brief.md")).toBeNull();

    fireEvent.click(within(focusWorkspace).getByRole("button", { name: "文件库" }));
    const library = await within(focusWorkspace).findByRole("dialog", { name: "文件库" });
    expect(within(library).getByText("mock-reference.md")).toBeInTheDocument();

    fireEvent.click(within(library).getByRole("button", { name: "复用 mock-reference.md" }));
    expect(within(focusWorkspace).getByText("mock-reference.md")).toBeInTheDocument();
  });

  it("sends selected focus composer asset refs with the fixed agent chat request", async () => {
    const streamSpy = vi.spyOn(MockTeamApi.prototype, "streamAgentMessage");
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    const focusWorkspace = container.querySelector(".agent-focus-workspace") as HTMLElement;
    fireEvent.click(within(focusWorkspace).getByRole("button", { name: "文件库" }));
    const library = await within(focusWorkspace).findByRole("dialog", { name: "文件库" });
    fireEvent.click(within(library).getByRole("button", { name: "复用 mock-reference.md" }));

    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "请结合附件总结" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(streamSpy).toHaveBeenCalled());
    const call = streamSpy.mock.calls[0];
    expect(call[0]).toBe("main");
    expect(call[1]).toMatchObject({
      message: "请结合附件总结",
      assetRefs: ["mock-reference-asset"],
    });
  });

  it("uses a non-empty default message when sending only selected focus assets", async () => {
    const streamSpy = vi.spyOn(MockTeamApi.prototype, "streamAgentMessage");
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    const focusWorkspace = container.querySelector(".agent-focus-workspace") as HTMLElement;
    fireEvent.click(within(focusWorkspace).getByRole("button", { name: "文件库" }));
    const library = await within(focusWorkspace).findByRole("dialog", { name: "文件库" });
    fireEvent.click(within(library).getByRole("button", { name: "复用 mock-reference.md" }));
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(streamSpy).toHaveBeenCalled());
    const call = streamSpy.mock.calls[0];
    expect(call[0]).toBe("main");
    expect(call[1]).toMatchObject({
      message: "请结合我引用的资产一起处理",
      assetRefs: ["mock-reference-asset"],
    });
    expect(await within(focusWorkspace).findByText("请结合我引用的资产一起处理")).toBeInTheDocument();
  });

  it("uploads focus files with the scoped conversation id after the first streamed turn", async () => {
    const uploadSpy = vi.spyOn(MockTeamApi.prototype, "uploadFilesAsAssets");
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));
    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "建立会话" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("[main] mock reply: 建立会话")).toBeInTheDocument();

    const focusWorkspace = container.querySelector(".agent-focus-workspace") as HTMLElement;
    const fileInput = focusWorkspace.querySelector('input[type="file"][multiple]') as HTMLInputElement | null;
    const file = new File(["hello"], "after-conversation.md", { type: "text/markdown" });
    fireEvent.change(fileInput!, { target: { files: [file] } });

    await waitFor(() => expect(uploadSpy).toHaveBeenCalled());
    expect(uploadSpy.mock.calls.at(-1)).toEqual([[file], "mock-main-1"]);
  });

  it("keeps selected asset chips when a focused stream fails before a terminal event", async () => {
    vi.spyOn(MockTeamApi.prototype, "streamAgentMessage").mockRejectedValueOnce({ message: "network down" });
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    const focusWorkspace = container.querySelector(".agent-focus-workspace") as HTMLElement;
    fireEvent.click(within(focusWorkspace).getByRole("button", { name: "文件库" }));
    const library = await within(focusWorkspace).findByRole("dialog", { name: "文件库" });
    fireEvent.click(within(library).getByRole("button", { name: "复用 mock-reference.md" }));
    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "会失败" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("network down");
    expect(focusWorkspace.querySelector(".agent-focus-selected-assets .agent-focus-file-chip")).toHaveTextContent("mock-reference.md");
  });

  it("dedupes file library selections by asset id", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    const focusWorkspace = container.querySelector(".agent-focus-workspace") as HTMLElement;
    fireEvent.click(within(focusWorkspace).getByRole("button", { name: "文件库" }));
    let library = await within(focusWorkspace).findByRole("dialog", { name: "文件库" });
    fireEvent.click(within(library).getByRole("button", { name: "复用 mock-reference.md" }));
    fireEvent.click(within(focusWorkspace).getByRole("button", { name: "文件库" }));
    fireEvent.click(within(focusWorkspace).getByRole("button", { name: "文件库" }));
    library = await within(focusWorkspace).findByRole("dialog", { name: "文件库" });

    expect(within(library).getByRole("button", { name: "复用 mock-reference.md" })).toBeDisabled();
    expect(focusWorkspace.querySelectorAll(".agent-focus-file-chip")).toHaveLength(1);
  });

  it("renders restored history asset refs as readable attachment metadata", async () => {
    vi.spyOn(MockTeamApi.prototype, "listAgentConversations").mockResolvedValue({
      currentConversationId: "conv_with_assets",
      conversations: [{
        conversationId: "conv_with_assets",
        title: "History with assets",
        preview: "请看附件",
        messageCount: 1,
        createdAt: "2026-05-24T00:00:00.000Z",
        updatedAt: "2026-05-24T00:00:00.000Z",
        running: false,
      }],
    });
    vi.spyOn(MockTeamApi.prototype, "getAgentConversationState").mockResolvedValue({
      conversationId: "conv_with_assets",
      running: false,
      contextUsage: mockContextUsage(),
      messages: [],
      viewMessages: [{
        id: "message_with_asset",
        kind: "user",
        title: "User",
        text: "请看附件",
        createdAt: "2026-05-24T00:00:00.000Z",
        assetRefs: [mockAsset("history-asset", "history-ref.md")],
      }],
      activeRun: null,
      historyPage: { hasMore: false, limit: 80 },
      updatedAt: "2026-05-24T00:00:00.000Z",
    });
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    expect(await screen.findByText("history-ref.md")).toBeInTheDocument();
  });

  it("prevents selecting more than 20 focused assets before upload", async () => {
    const uploadSpy = vi.spyOn(MockTeamApi.prototype, "uploadFilesAsAssets");
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    const focusWorkspace = container.querySelector(".agent-focus-workspace") as HTMLElement;
    const fileInput = focusWorkspace.querySelector('input[type="file"][multiple]') as HTMLInputElement | null;
    const files = Array.from({ length: 21 }, (_, index) => (
      new File([`file-${index}`], `limit-${index}.md`, { type: "text/markdown" })
    ));
    fireEvent.change(fileInput!, { target: { files } });

    expect(await screen.findByRole("alert")).toHaveTextContent("最多选择 20 个文件");
    expect(uploadSpy).not.toHaveBeenCalled();
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
    expect(screen.queryByRole("button", { name: "添加 Agent" })).toBeNull();
    expect(screen.queryByRole("button", { name: "放大" })).toBeNull();
    expect(screen.queryByRole("button", { name: "缩小" })).toBeNull();
    expect(screen.queryByRole("button", { name: "重置视图" })).toBeNull();

    fireEvent.wheel(atlas, { deltaY: -120, clientX: 120, clientY: 120 });
    firePointer(atlas, "pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
    firePointer(atlas, "pointermove", { pointerId: 1, clientX: 70, clientY: 88 });
    firePointer(atlas, "pointerup", { pointerId: 1, clientX: 70, clientY: 88, buttons: 0 });

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
    expect(container.querySelector(".agent-focus-workspace")).toBeNull();
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
    expect(container.querySelector(".agent-focus-workspace")).toBeTruthy();
    expect(screen.getByText("主 Agent / main")).toBeInTheDocument();
  });

  it("does not expose movable agent cards while focus mode is locked", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

    const agentNode = within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }) as HTMLElement;
    fireEvent.click(agentNode);

    expect(getAtlas(container)).toHaveAttribute("data-interaction-mode", "locked");
    expect(within(getAtlas(container)).queryByRole("button", { name: /主 Agent/ })).toBeNull();
    expect(screen.getByText("主 Agent / main")).toBeInTheDocument();
  });

  it("sends a message from the focused agent panel", async () => {
    const streamSpy = vi.spyOn(MockTeamApi.prototype, "streamAgentMessage");
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "请总结画布状态" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(screen.getByText("请总结画布状态")).toBeInTheDocument();
    await waitFor(() => expect(streamSpy).toHaveBeenCalled());
    expect(streamSpy.mock.calls[0][0]).toBe("main");
    expect(streamSpy.mock.calls[0][1]).toMatchObject({ message: "请总结画布状态" });
    expect(await screen.findByText("[main] mock reply: 请总结画布状态")).toBeInTheDocument();
  });

  it("keeps the stop button enabled while a focused agent stream is running", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "mock-hold" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("发送中...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打断" })).toBeEnabled();
  });

  it("renders text_delta before the focused stream finishes", async () => {
    let finishStream!: () => void;
    vi.spyOn(MockTeamApi.prototype, "streamAgentMessage").mockImplementation(async (_agentId, request, onEvent) => {
      const conversationId = request.conversationId || "conv_delta";
      onEvent({ type: "run_started", conversationId, runId: "run_delta" });
      onEvent({ type: "text_delta", textDelta: "partial answer" });
      await new Promise<void>((resolve) => {
        finishStream = () => {
          onEvent({ type: "done", conversationId, runId: "run_delta", text: "partial answer done" });
          resolve();
        };
      });
    });
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));
    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "stream slowly" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("partial answer")).toBeInTheDocument();
    await act(async () => {
      finishStream();
    });
    expect(await screen.findByText("partial answer done")).toBeInTheDocument();
  });

  it("starts a new scoped conversation from the focus topbar", async () => {
    const createSpy = vi.spyOn(
      MockTeamApi.prototype as unknown as {
        createAgentConversation(agentId: string): Promise<{ conversationId: string; currentConversationId: string; created: boolean }>;
      },
      "createAgentConversation",
    ).mockResolvedValue({ conversationId: "mock-main-new", currentConversationId: "mock-main-new", created: true });
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "草稿" } });
    fireEvent.click(screen.getByRole("button", { name: "新会话" }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith("main"));
    expect(screen.getByLabelText("Agent message")).toHaveValue("");
    expect(screen.getByText("当前 Agent 会话尚未开始。")).toBeInTheDocument();
  });

  it("reuses a focused agent conversation id across chat turns", async () => {
    const streamSpy = vi.spyOn(MockTeamApi.prototype, "streamAgentMessage")
      .mockImplementationOnce(async (_agentId, request, onEvent) => {
        onEvent({ type: "run_started", conversationId: "conv_main_1", runId: "run_1" });
        onEvent({ type: "done", conversationId: "conv_main_1", runId: "run_1", text: "第一轮回复" });
      })
      .mockImplementationOnce(async (_agentId, request, onEvent) => {
        onEvent({ type: "run_started", conversationId: request.conversationId || "conv_main_1", runId: "run_2" });
        onEvent({ type: "done", conversationId: request.conversationId || "conv_main_1", runId: "run_2", text: "第二轮回复" });
      });
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "第一轮" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(await screen.findByText("第一轮回复")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "第二轮" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(streamSpy).toHaveBeenCalledTimes(2));
    expect(streamSpy.mock.calls[0][0]).toBe("main");
    expect(streamSpy.mock.calls[0][1]).toMatchObject({ message: "第一轮" });
    expect(streamSpy.mock.calls[1][1]).toMatchObject({ message: "第二轮", conversationId: "conv_main_1" });
  });

  it("shows chat errors without removing the sent user message", async () => {
    vi.spyOn(MockTeamApi.prototype, "streamAgentMessage").mockImplementationOnce(async (_agentId, request, onEvent) => {
      const conversationId = request.conversationId || "conv_error";
      onEvent({ type: "run_started", conversationId, runId: "run_error" });
      onEvent({ type: "error", conversationId, runId: "run_error", message: "agent offline" });
      throw { message: "agent offline" };
    });
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

  it("interrupts a running focused agent stream", async () => {
    const interruptSpy = vi.spyOn(MockTeamApi.prototype, "interruptAgentChat");
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));
    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "mock-hold" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    const stopButton = await screen.findByRole("button", { name: "打断" });
    expect(stopButton).toBeEnabled();
    fireEvent.click(stopButton);

    await waitFor(() => expect(interruptSpy).toHaveBeenCalled());
    expect(await screen.findByText("本轮已中断")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打断" })).toBeDisabled();
  });

  it("queues a focused agent message while a stream is running", async () => {
    const queueSpy = vi.spyOn(MockTeamApi.prototype, "queueAgentMessage");
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));
    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "mock-hold" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("发送中...")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "排队消息" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(queueSpy).toHaveBeenCalled());
    expect(queueSpy.mock.calls[0][0]).toBe("main");
    expect(queueSpy.mock.calls[0][1]).toMatchObject({ message: "排队消息", mode: "steer" });
    expect(await screen.findByText("消息已加入队列")).toBeInTheDocument();
  });

  it("ignores stale stream events after focusing another agent", async () => {
    let emitMainDelta!: () => void;
    vi.spyOn(MockTeamApi.prototype, "streamAgentMessage").mockImplementation(async (_agentId, request, onEvent) => {
      const conversationId = request.conversationId || "conv_stale";
      onEvent({ type: "run_started", conversationId, runId: "run_stale" });
      await new Promise<void>((resolve) => {
        emitMainDelta = () => {
          onEvent({ type: "text_delta", textDelta: "stale main text" });
          resolve();
        };
      });
    });
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(screen.getByRole("button", { name: /搜索 Agent[\s\S]*search/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));
    fireEvent.change(screen.getByLabelText("Agent message"), { target: { value: "start stale stream" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(await screen.findByText("发送中...")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /搜索 Agent/ }));
    emitMainDelta();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("stale main text")).toBeNull();
    expect(screen.getByText("搜索 Agent / search")).toBeInTheDocument();
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
    expect(config).toContain('"/v1/assets"');
    expect(config).not.toContain('"/v1/conns"');
    expect(config).not.toContain('"/v1/activity"');
    expect(config).not.toContain('"/playground"');
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
    expect(readme).toContain("Focus Mode 是特殊 Agent 对话界面");
    expect(readme).toContain("transcript + composer");
    expect(readme).toContain("Focus 顶部保留新会话、文件库和上下文使用量入口");
    expect(readme).toContain("暂不显示后台任务和 Team Runtime 入口");
    expect(readme).toContain("文件上传与文件库在 Live 模式接 `/v1/assets`");
  });
});
