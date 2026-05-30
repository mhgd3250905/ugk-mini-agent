import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { MOCK_AGENTS, mockTeamTasks, resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { TeamCanvasSourceConnection, TeamCanvasSourceNode, TeamCanvasTask, TeamRunState, TeamTaskConnection } from "../api/team-types";
import { getAtlas, getAtlasNodes, getAtlasStage, firePointer } from "./app-dom-test-utils";
import { cloneTaskFixture, makeTypedTaskChainFixtures } from "./team-task-test-fixtures";
import { makeLiveTaskRunFixture } from "./team-run-test-fixtures";
import { mockLiveTaskEditorApi } from "./team-api-test-mocks";

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

  it("renders typed input and output ports on live Task cards", async () => {
    const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [collectTask, htmlTask] }), { status: 200 });
      if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    const atlasNodes = getAtlasNodes(container);
    const collectNode = await within(atlasNodes).findByRole("button", { name: "搜集内容 Task" });
    const htmlNode = await within(atlasNodes).findByRole("button", { name: "HTML 制作 Task" });
    expect(within(collectNode).getByRole("button", { name: "输出 Markdown 文稿 md" })).toBeInTheDocument();
    expect(within(htmlNode).getByRole("button", { name: "输入 Markdown 文稿 md" })).toBeInTheDocument();
    expect(within(htmlNode).getByRole("button", { name: "输出 HTML 页面 html" })).toBeInTheDocument();
    expect(collectNode).toHaveAttribute("data-port-row-count", "1");
    expect(htmlNode).toHaveAttribute("data-port-row-count", "2");
    const collectHeight = Number.parseFloat((collectNode as HTMLElement).style.height);
    const htmlHeight = Number.parseFloat((htmlNode as HTMLElement).style.height);
    expect(collectHeight).toBe(212);
    expect(htmlHeight).toBe(240);
    expect(htmlHeight).toBeGreaterThan(collectHeight);
  });

  it("creates same-type Task port connections and draws the connection line", async () => {
    const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
    const createdConnection: TeamTaskConnection = {
      schemaVersion: "team/task-connection-1",
      connectionId: "conn_live_md",
      fromTaskId: collectTask.taskId,
      fromOutputPortId: "draft_md",
      toTaskId: htmlTask.taskId,
      toInputPortId: "source_md",
      type: "md",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
    };
    const postBodies: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [collectTask, htmlTask] }), { status: 200 });
      if (url === "/v1/team/task-connections" && method === "GET") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === "/v1/team/task-connections" && method === "POST") {
        postBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({ connection: createdConnection }), { status: 201 });
      }
      if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    const outputPort = await screen.findByRole("button", { name: "输出 Markdown 文稿 md" });
    fireEvent.click(outputPort);
    fireEvent.click(screen.getByRole("button", { name: "输入 Markdown 文稿 md" }));

    await waitFor(() => {
      expect(postBodies).toEqual([{
        fromTaskId: collectTask.taskId,
        fromOutputPortId: "draft_md",
        toTaskId: htmlTask.taskId,
        toInputPortId: "source_md",
      }]);
      expect(container.querySelector('[data-task-connection-id="conn_live_md"]')).toBeTruthy();
    });

    const connectionPath = container.querySelector('[data-task-connection-id="conn_live_md"]') as SVGPathElement | null;
    const sourceSocket = connectionPath?.parentElement?.querySelector(".emap-connector-socket-task-connection .emap-connector-source-socket") as SVGPathElement | null;
    const connectionD = connectionPath?.getAttribute("d") ?? "";
    const moveMatch = connectionD.match(/^M([\d.]+),([\d.]+)\s+C[\d.]+,[\d.]+\s+[\d.]+,[\d.]+\s+([\d.]+),([\d.]+)/);
    expect(sourceSocket).toBeTruthy();
    expect(moveMatch).toBeTruthy();
    const sourceX = Number.parseFloat(moveMatch![1]!);
    const sourceY = Number.parseFloat(moveMatch![2]!);
    const targetX = Number.parseFloat(moveMatch![3]!);
    const targetY = Number.parseFloat(moveMatch![4]!);
    const collectNode = container.querySelector(`[data-task-id="${collectTask.taskId}"]`) as HTMLElement | null;
    const htmlNode = container.querySelector(`[data-task-id="${htmlTask.taskId}"]`) as HTMLElement | null;
    expect(collectNode).toBeTruthy();
    expect(htmlNode).toBeTruthy();
    expect(sourceX).toBe(Number.parseFloat(collectNode!.style.left) + Number.parseFloat(collectNode!.style.width));
    expect(sourceY).toBe(Number.parseFloat(collectNode!.style.top) + Number.parseFloat(collectNode!.style.height) / 2);
    expect(targetX).toBe(Number.parseFloat(htmlNode!.style.left));
    expect(targetY).toBe(Number.parseFloat(htmlNode!.style.top));
    const cutButton = screen.getByRole("button", { name: /切断 Task 连接/ }) as HTMLElement;
    expect(Number.parseFloat(cutButton.style.left)).toBeCloseTo((sourceX + targetX) / 2, 4);
    expect(Number.parseFloat(cutButton.style.top)).toBeCloseTo((sourceY + targetY) / 2, 4);
    expect(sourceSocket!.getAttribute("d")).toBe(`M${sourceX},${sourceY - 6} A6,6 0 0 1 ${sourceX},${sourceY + 6}`);
  });

  it("cuts a typed Task connection from the canvas cut button", async () => {
    const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
    const existingConnection: TeamTaskConnection = {
      schemaVersion: "team/task-connection-1",
      connectionId: "conn_cut_md",
      fromTaskId: collectTask.taskId,
      fromOutputPortId: "draft_md",
      toTaskId: htmlTask.taskId,
      toInputPortId: "source_md",
      type: "md",
      status: "active",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
    };
    let connections = [existingConnection];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [collectTask, htmlTask] }), { status: 200 });
      if (url === "/v1/team/task-connections" && method === "GET") return new Response(JSON.stringify({ connections }), { status: 200 });
      if (url === `/v1/team/task-connections/${existingConnection.connectionId}` && method === "DELETE") {
        connections = [];
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    const cutButton = await screen.findByRole("button", { name: /切断 Task 连接/ });
    expect(cutButton).toBeTruthy();
    expect(cutButton.closest(".emap-link-cut-task")).toBeTruthy();

    expect(container.querySelector('[data-task-connection-id="conn_cut_md"]')).toBeTruthy();
    fireEvent.click(cutButton);

    await waitFor(() => {
      expect(container.querySelector('[data-task-connection-id="conn_cut_md"]')).toBeNull();
    });
    expect(container.querySelector(".emap-link-cut-button")).toBeNull();
  });

  it("reveals the Task connection cut button only while hovering the connection line", async () => {
    const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
    const existingConnection: TeamTaskConnection = {
      schemaVersion: "team/task-connection-1",
      connectionId: "conn_hover_md",
      fromTaskId: collectTask.taskId,
      fromOutputPortId: "draft_md",
      toTaskId: htmlTask.taskId,
      toInputPortId: "source_md",
      type: "md",
      status: "active",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [collectTask, htmlTask] }), { status: 200 });
      if (url === "/v1/team/task-connections" && method === "GET") return new Response(JSON.stringify({ connections: [existingConnection] }), { status: 200 });
      if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    const cutButton = await screen.findByRole("button", { name: /切断 Task 连接/ });
    const hitArea = container.querySelector('[data-link-cut-key="task:conn_hover_md"]') as SVGPathElement | null;
    expect(hitArea).toBeTruthy();
    expect(cutButton).toHaveAttribute("data-visible", "false");

    fireEvent.pointerEnter(hitArea!);
    expect(cutButton).toHaveAttribute("data-visible", "true");

    fireEvent.pointerLeave(hitArea!);
    expect(cutButton).toHaveAttribute("data-visible", "false");
  });

  it("keeps Task connection line on delete failure and shows error", async () => {
    const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
    const existingConnection: TeamTaskConnection = {
      schemaVersion: "team/task-connection-1",
      connectionId: "conn_fail_md",
      fromTaskId: collectTask.taskId,
      fromOutputPortId: "draft_md",
      toTaskId: htmlTask.taskId,
      toInputPortId: "source_md",
      type: "md",
      status: "active",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [collectTask, htmlTask] }), { status: 200 });
      if (url === "/v1/team/task-connections" && method === "GET") return new Response(JSON.stringify({ connections: [existingConnection] }), { status: 200 });
      if (url === `/v1/team/task-connections/${existingConnection.connectionId}` && method === "DELETE") {
        return new Response(JSON.stringify({ error: "internal error" }), { status: 500 });
      }
      if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    const cutButton = await screen.findByRole("button", { name: /切断 Task 连接/ });
    fireEvent.click(cutButton);

    await waitFor(() => {
      expect(container.querySelector(".error-banner")).toBeTruthy();
    });
    expect(container.querySelector('[data-task-connection-id="conn_fail_md"]')).toBeTruthy();
  });

  it("cuts a Source connection from the canvas cut button", async () => {
    const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
    const sourceNode: TeamCanvasSourceNode = {
      schemaVersion: "team/source-node-1",
      sourceNodeId: "src_brief",
      title: "brief.md 文件",
      nodeType: "file",
      outputPort: { id: "value", label: "Markdown 文稿", type: "md" },
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
    };
    const sourceConnection: TeamCanvasSourceConnection = {
      schemaVersion: "team/source-connection-1",
      connectionId: "sc_cut_md",
      fromSourceNodeId: "src_brief",
      fromOutputPortId: "value",
      toTaskId: htmlTask.taskId,
      toInputPortId: "source_md",
      type: "md",
      status: "active",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
    };
    let connections = [sourceConnection];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [collectTask, htmlTask] }), { status: 200 });
      if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === "/v1/team/source-nodes") return new Response(JSON.stringify({ sourceNodes: [sourceNode] }), { status: 200 });
      if (url === "/v1/team/source-connections" && method === "GET") return new Response(JSON.stringify({ connections }), { status: 200 });
      if (url === `/v1/team/source-connections/${sourceConnection.connectionId}` && method === "DELETE") {
        connections = [];
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    const cutButton = await screen.findByRole("button", { name: /切断 Source 连接/ });
    expect(cutButton).toBeTruthy();
    expect(cutButton.closest(".emap-link-cut-source")).toBeTruthy();

    expect(container.querySelector('[data-source-connection-id="sc_cut_md"]')).toBeTruthy();
    fireEvent.click(cutButton);

    await waitFor(() => {
      expect(container.querySelector('[data-source-connection-id="sc_cut_md"]')).toBeNull();
    });
  });

  it("clears live Source cards and resets viewport when switching back to the clean mock workspace", async () => {
    const liveSourceNode: TeamCanvasSourceNode = {
      schemaVersion: "team/source-node-1",
      sourceNodeId: "src_live_reset_probe",
      title: "Live reset probe.md",
      nodeType: "file",
      outputPort: { id: "value", label: "Markdown 文稿", type: "md" },
      content: { fileName: "Live reset probe.md", mimeType: "text/markdown", size: 12 },
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z",
    };

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
      if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === "/v1/team/task-dependencies") return new Response(JSON.stringify({ dependencies: [] }), { status: 200 });
      if (url === "/v1/team/source-nodes") return new Response(JSON.stringify({ sourceNodes: [liveSourceNode] }), { status: 200 });
      if (url === "/v1/team/source-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    await waitFor(() => {
      expect(container.querySelector('[data-source-node-id="src_live_reset_probe"]')).toBeTruthy();
    });
    expect(within(getAtlasNodes(container)).getByRole("group", { name: "Live reset probe.md" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "放大" }));
    expect(screen.getByLabelText("当前缩放 110%")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "mock" } });
    fireEvent.click(screen.getByRole("button", { name: "Agent workspace" }));

    await waitFor(() => {
      expect(container.querySelector('[data-source-node-id="src_live_reset_probe"]')).toBeNull();
      expect(screen.getByLabelText("当前缩放 100%")).toBeInTheDocument();
      expect(getAtlasStage(container).style.transform).toBe("translate(0px, 0px) scale(1)");
    });
  });

  it("creates editable text source nodes and connects them to same-type Task inputs", async () => {
    const task = {
      ...cloneTaskFixture(),
      taskId: "task_accept_string_source",
      title: "接收文本 Task",
      workUnit: {
        ...cloneTaskFixture().workUnit,
        title: "接收文本 Task",
        inputPorts: [{ id: "source_text", label: "文本输入", type: "string" }],
        outputPorts: [],
      },
    };
    const sourceNode: TeamCanvasSourceNode = {
      schemaVersion: "team/source-node-1",
      sourceNodeId: "source_text_1",
      title: "文本输出",
      nodeType: "text",
      outputPort: { id: "value", label: "文本", type: "string" },
      content: { text: "初始文本" },
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
    };
    const sourceConnection: TeamCanvasSourceConnection = {
      schemaVersion: "team/source-connection-1",
      connectionId: "source_conn_text_1",
      fromSourceNodeId: sourceNode.sourceNodeId,
      fromOutputPortId: "value",
      toTaskId: task.taskId,
      toInputPortId: "source_text",
      type: "string",
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
    };
    const createSourceBodies: unknown[] = [];
    const createConnectionBodies: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [task] }), { status: 200 });
      if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === "/v1/team/source-nodes" && method === "GET") return new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 });
      if (url === "/v1/team/source-nodes" && method === "POST") {
        createSourceBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({ sourceNode }), { status: 201 });
      }
      if (url === "/v1/team/source-connections" && method === "GET") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === "/v1/team/source-connections" && method === "POST") {
        createConnectionBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({ connection: sourceConnection }), { status: 201 });
      }
      if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    fireEvent.click(await screen.findByRole("button", { name: "文本输出" }));

    const sourceCard = await within(getAtlasNodes(container)).findByRole("group", { name: "文本输出" });
    expect(within(sourceCard).getByLabelText("文本输出内容")).toHaveValue("初始文本");
    expect(createSourceBodies).toEqual([{
      title: "文本输出",
      nodeType: "text",
      outputPort: { id: "value", label: "文本", type: "string" },
      content: { text: "" },
    }]);

    fireEvent.click(within(sourceCard).getByRole("button", { name: "输出 文本 string" }));
    fireEvent.click(await screen.findByRole("button", { name: "输入 文本输入 string" }));

    await waitFor(() => {
      expect(createConnectionBodies).toEqual([{
        fromSourceNodeId: sourceNode.sourceNodeId,
        fromOutputPortId: "value",
        toTaskId: task.taskId,
        toInputPortId: "source_text",
      }]);
      expect(container.querySelector('[data-source-connection-id="source_conn_text_1"]')).toBeTruthy();
    });
  });

  it("creates file source nodes and infers md output type from selected files", async () => {
    const sourceNode: TeamCanvasSourceNode = {
      schemaVersion: "team/source-node-1",
      sourceNodeId: "source_file_md_1",
      title: "brief.md",
      nodeType: "file",
      outputPort: { id: "value", label: "文件", type: "md" },
      content: { fileName: "brief.md", mimeType: "text/markdown", size: 7 },
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
    };
    const createSourceBodies: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
      if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === "/v1/team/source-nodes" && method === "GET") return new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 });
      if (url === "/v1/team/source-nodes" && method === "POST") {
        createSourceBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({ sourceNode }), { status: 201 });
      }
      if (url === "/v1/team/source-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    const input = await screen.findByLabelText("选择输出文件");
    fireEvent.change(input, {
      target: {
        files: [new File(["# Brief"], "brief.md", { type: "text/markdown" })],
      },
    });

    const sourceCard = await within(getAtlasNodes(container)).findByRole("group", { name: "brief.md" });
    expect(within(sourceCard).getAllByText("brief.md").length).toBeGreaterThan(0);
    expect(within(sourceCard).getByRole("button", { name: "输出 文件 md" })).toBeInTheDocument();
    expect(createSourceBodies).toEqual([{
      title: "brief.md",
      nodeType: "file",
      outputPort: { id: "value", label: "文件", type: "md" },
      content: { fileName: "brief.md", mimeType: "text/markdown", size: 7 },
    }]);
  });

  it("discovers an auto-started downstream Task run after the upstream run finishes", async () => {
    const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
    const connection: TeamTaskConnection = {
      schemaVersion: "team/task-connection-1",
      connectionId: "conn_auto_md",
      fromTaskId: collectTask.taskId,
      fromOutputPortId: "draft_md",
      toTaskId: htmlTask.taskId,
      toInputPortId: "source_md",
      type: "md",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
    };
    const upstreamRunning: TeamRunState = {
      ...makeLiveTaskRunFixture(collectTask, "run_upstream_auto"),
      status: "running",
      finishedAt: null,
      taskStates: {
        [collectTask.taskId]: {
          status: "running",
          attemptCount: 1,
          activeAttemptId: "attempt_upstream_auto",
          resultRef: null,
          errorSummary: null,
          progress: { phase: "worker_running", message: "running", updatedAt: "2026-05-25T00:00:02.000Z" },
        },
      },
      summary: { totalTasks: 1, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    };
    const upstreamCompleted: TeamRunState = {
      ...makeLiveTaskRunFixture(collectTask, "run_upstream_auto"),
      status: "completed",
      finishedAt: "2026-05-25T00:00:10.000Z",
    };
    const downstreamRunning: TeamRunState = {
      ...makeLiveTaskRunFixture(htmlTask, "run_downstream_auto"),
      source: {
        type: "canvas-task",
        taskId: htmlTask.taskId,
        triggeredBy: {
          type: "task-connection",
          connectionId: connection.connectionId,
          fromTaskId: collectTask.taskId,
          fromRunId: upstreamCompleted.runId,
          fromAttemptId: "attempt_upstream_auto",
        },
        boundInputs: [{
          connectionId: connection.connectionId,
          inputPortId: "source_md",
          artifact: {
            schemaVersion: "team/task-artifact-1",
            artifactId: "artifact_downstream_auto_md",
            type: "md",
            sourceTaskId: collectTask.taskId,
            sourceRunId: upstreamCompleted.runId,
            sourceAttemptId: "attempt_upstream_auto",
            sourceOutputPortId: "draft_md",
            fileRef: "accepted-result.md",
            preview: "accepted markdown",
            content: "# Accepted markdown",
            createdAt: "2026-05-25T00:00:10.000Z",
          },
        }],
      },
      status: "running",
      createdAt: "2026-05-25T00:00:10.250Z",
      startedAt: "2026-05-25T00:00:10.300Z",
      finishedAt: null,
      taskStates: {
        [htmlTask.taskId]: {
          status: "running",
          attemptCount: 1,
          activeAttemptId: "attempt_downstream_auto",
          resultRef: null,
          errorSummary: null,
          progress: { phase: "worker_running", message: "downstream running", updatedAt: "2026-05-25T00:00:11.000Z" },
        },
      },
      summary: { totalTasks: 1, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    };
    let taskRequests = 0;
    let upstreamTerminalObserved = false;
    let downstreamRunRequestsAfterTerminal = 0;

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") {
        taskRequests += 1;
        return new Response(JSON.stringify({ tasks: [collectTask, htmlTask] }), { status: 200 });
      }
      if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [connection] }), { status: 200 });
      if (url === `/v1/team/tasks/${collectTask.taskId}/runs`) {
        return new Response(JSON.stringify({ runs: [upstreamTerminalObserved ? upstreamCompleted : upstreamRunning] }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${htmlTask.taskId}/runs`) {
        if (!upstreamTerminalObserved) {
          return new Response(JSON.stringify({ runs: [] }), { status: 200 });
        }
        downstreamRunRequestsAfterTerminal += 1;
        return new Response(JSON.stringify({ runs: downstreamRunRequestsAfterTerminal >= 2 ? [downstreamRunning] : [] }), { status: 200 });
      }
      if (url === `/v1/team/task-runs/${upstreamRunning.runId}`) {
        upstreamTerminalObserved = true;
        return new Response(JSON.stringify(upstreamCompleted), { status: 200 });
      }
      if (url === `/v1/team/task-runs/${downstreamRunning.runId}`) {
        return new Response(JSON.stringify(downstreamRunning), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    const atlasNodes = getAtlasNodes(container);
    await waitFor(() => expect(atlasNodes.querySelector('[data-task-id="task_collect_md"]')).toBeTruthy());
    await waitFor(() => expect(taskRequests).toBeGreaterThanOrEqual(2));

    fireEvent.click(atlasNodes.querySelector('[data-task-id="task_html_build"]') as HTMLElement);

    const branch = await waitFor(() => {
      const panel = container.querySelector(".task-action-branch") as HTMLElement | null;
      expect(panel).toBeTruthy();
      expect(within(panel!).getByText("run_downstream_auto")).toBeInTheDocument();
      return panel!;
    });
    expect(within(branch).getByText("downstream running")).toBeInTheDocument();
    expect(downstreamRunRequestsAfterTerminal).toBeGreaterThanOrEqual(2);
  });

  it("blocks mismatched Task port connections before calling the API", async () => {
    const { collectTask, ttsTask } = makeTypedTaskChainFixtures();
    const postBodies: unknown[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [collectTask, ttsTask] }), { status: 200 });
      if (url === "/v1/team/task-connections" && method === "GET") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === "/v1/team/task-connections" && method === "POST") {
        postBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({ error: "should not post" }), { status: 500 });
      }
      if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    fireEvent.click(await screen.findByRole("button", { name: "输出 Markdown 文稿 md" }));
    fireEvent.click(screen.getByRole("button", { name: "输入 HTML 文稿 html" }));

    expect(await screen.findByText("端口类型不匹配: md -> html")).toBeInTheDocument();
    expect(postBodies).toEqual([]);
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

  it("opens the Task leader chat iframe from the action menu", async () => {
    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

    expect(container.querySelector(".task-action-branch")).toBeTruthy();
    const branch = container.querySelector(".task-leader-chat-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    expect(container.querySelector(".emap-task-child-branch-shell")).toBeTruthy();
    expect(container.querySelector(".emap-link-task-child-branch")).toBeTruthy();
    expect(branch).toHaveClass("agent-playground-branch");
    expect(branch!.querySelector(".agent-playground-branch-head")).toBeTruthy();
    expect(branch!.querySelector(".agent-playground-branch-collapse")).toBeTruthy();
    expect(container.querySelector(".emap-task-child-branch-shell .emap-panel-resize-handle")).toBeTruthy();
    expect(within(branch!).getByText("Leader 对话")).toBeInTheDocument();
    expect(within(branch!).getByText("调查 Medtrum 云资产")).toBeInTheDocument();

    const iframe = branch!.querySelector("iframe") as HTMLIFrameElement | null;
    expect(iframe).toHaveClass("agent-playground-iframe");
    expect(iframe).toHaveAttribute("title", "调查 Medtrum 云资产 leader 对话");
    expect(iframe?.getAttribute("src")).toContain("/playground?view=chat&agentId=main");
    expect(iframe?.getAttribute("src")).toContain("embed=team-console");
    expect(iframe?.getAttribute("src")).toContain("teamTaskId=task_research_medtrum");
    expect(iframe?.getAttribute("src")).toContain("teamTaskMode=edit");
  });

  it("no longer renders large context preview in the Leader chat branch", async () => {
    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

    const branch = container.querySelector(".task-leader-chat-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();

    // No large context preview block or <pre> element
    expect(branch!.querySelector(".task-leader-context-copy")).toBeNull();
    expect(branch!.querySelector(".task-leader-context-copy-text")).toBeNull();
    expect(branch!.querySelector("pre")).toBeNull();

    // Compact copy button is inside the header
    const header = branch!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
    expect(header).toBeTruthy();
    expect(within(header!).getByRole("button", { name: /复制 Task 上下文/ })).toBeInTheDocument();

    // iframe still present with correct src params
    const iframe = branch!.querySelector("iframe") as HTMLIFrameElement | null;
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute("src")).toContain("/playground?view=chat");
    expect(iframe?.getAttribute("src")).toContain("agentId=main");
    expect(iframe?.getAttribute("src")).toContain("embed=team-console");
    expect(iframe?.getAttribute("src")).toContain("teamTaskId=task_research_medtrum");
    expect(iframe?.getAttribute("src")).toContain("teamTaskMode=edit");
  });

  it("copies current Task context from the Leader chat branch header", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

    const branch = container.querySelector(".task-leader-chat-branch") as HTMLElement | null;
    const header = branch!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
    const copyButton = within(header!).getByRole("button", { name: /复制 Task 上下文/ });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const copiedText = writeText.mock.calls[0][0] as string;
    expect(copiedText).toContain("taskId: task_research_medtrum");
    expect(copiedText).toContain("/team-task");
    expect(copiedText).toContain("workUnit.acceptance.rules");

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("已复制");
    });
  });

  it("keeps branch functional when clipboard copy fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("not allowed"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

    const branch = container.querySelector(".task-leader-chat-branch") as HTMLElement | null;
    const header = branch!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
    const copyButton = within(header!).getByRole("button", { name: /复制 Task 上下文/ });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("复制失败");
    });

    // Iframe remains present
    expect(branch!.querySelector("iframe")).toBeTruthy();
  });

  it("falls back to execCommand when clipboard API rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("not allowed"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });
    const execCopy = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      value: execCopy,
      writable: true,
      configurable: true,
    });

    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

    const branch = container.querySelector(".task-leader-chat-branch") as HTMLElement | null;
    const header = branch!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
    fireEvent.click(within(header!).getByRole("button", { name: /复制 Task 上下文/ }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("已复制");
    });

    // Temp textarea was cleaned up
    expect(document.querySelector("textarea[data-copy-fallback]")).toBeNull();
  });

  it("falls back to execCommand when clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const execCopy = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      value: execCopy,
      writable: true,
      configurable: true,
    });

    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

    const branch = container.querySelector(".task-leader-chat-branch") as HTMLElement | null;
    const header = branch!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
    fireEvent.click(within(header!).getByRole("button", { name: /复制 Task 上下文/ }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("已复制");
    });

    expect(document.querySelector("textarea[data-copy-fallback]")).toBeNull();
  });

  it("shows a selectable manual copy fallback when both clipboard API and execCommand fail", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const execCopy = vi.fn().mockReturnValue(false);
    Object.defineProperty(document, "execCommand", {
      value: execCopy,
      writable: true,
      configurable: true,
    });

    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

    const branch = container.querySelector(".task-leader-chat-branch") as HTMLElement | null;
    const header = branch!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
    fireEvent.click(within(header!).getByRole("button", { name: /复制 Task 上下文/ }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("复制失败");
    });

    // Iframe and branch remain present
    expect(branch!.querySelector("iframe")).toBeTruthy();
    expect(document.querySelector("textarea[data-copy-fallback]")).toBeNull();
    const manualCopy = screen.getByLabelText("手动复制 Task 上下文") as HTMLTextAreaElement;
    expect(manualCopy.value).toContain("taskId: task_research_medtrum");
    expect(manualCopy.value).toContain("/team-task");
  });

  it("closes the Task leader chat branch from its header action", async () => {
    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));
    expect(container.querySelector(".task-leader-chat-branch iframe")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /收起 调查 Medtrum 云资产 leader 对话/ }));

    expect(container.querySelector(".task-leader-chat-branch")).toBeNull();
    expect(container.querySelector(".task-action-branch")).toBeTruthy();
  });

  it("drags and resizes the Task leader chat child branch like an Agent branch", async () => {
    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

    const branchShell = container.querySelector(".emap-task-child-branch-shell") as HTMLElement | null;
    const titleBar = container.querySelector(".task-leader-chat-branch .agent-playground-branch-head") as HTMLElement | null;
    const resizeHandle = container.querySelector(".emap-task-child-branch-shell .emap-panel-resize-handle") as HTMLElement | null;
    expect(branchShell).toBeTruthy();
    expect(titleBar).toBeTruthy();
    expect(resizeHandle).toBeTruthy();
    const initialLeft = Number.parseFloat(branchShell!.style.left);
    const initialTop = Number.parseFloat(branchShell!.style.top);
    const initialWidth = Number.parseFloat(branchShell!.style.width);
    const initialHeight = Number.parseFloat(branchShell!.style.height);

    firePointer(titleBar!, "pointerdown", { pointerId: 51, clientX: 600, clientY: 220 });
    firePointer(titleBar!, "pointermove", { pointerId: 51, clientX: 650, clientY: 255 });
    firePointer(titleBar!, "pointerup", { pointerId: 51, clientX: 650, clientY: 255, buttons: 0 });

    expect(Number.parseFloat(branchShell!.style.left)).toBeCloseTo(initialLeft + 50, 4);
    expect(Number.parseFloat(branchShell!.style.top)).toBeCloseTo(initialTop + 35, 4);

    firePointer(resizeHandle!, "pointerdown", { pointerId: 52, clientX: 1000, clientY: 700 });
    firePointer(resizeHandle!, "pointermove", { pointerId: 52, clientX: 1080, clientY: 760 });
    firePointer(resizeHandle!, "pointerup", { pointerId: 52, clientX: 1080, clientY: 760, buttons: 0 });

    expect(Number.parseFloat(branchShell!.style.width)).toBeCloseTo(initialWidth + 80, 4);
    expect(Number.parseFloat(branchShell!.style.height)).toBeCloseTo(initialHeight + 60, 4);
  });

  it("opens a shallow Task edit form with title and Agent selections only", async () => {
    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    expect(container.querySelector(".task-action-branch")).toBeTruthy();
    const branch = container.querySelector(".task-edit-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    expect(container.querySelector(".emap-task-child-branch-shell")).toBeTruthy();
    expect(container.querySelector(".emap-link-task-child-branch")).toBeTruthy();
    expect(within(branch!).getByLabelText("Task 名称")).toHaveValue("调查 Medtrum 云资产");
    expect(within(branch!).getByLabelText("Leader Agent")).toHaveValue("main");
    expect(within(branch!).getByLabelText("Worker Agent")).toHaveValue("search");
    expect(within(branch!).getByLabelText("Checker Agent")).toHaveValue("main");
    expect(within(branch!).queryByLabelText(/input/i)).toBeNull();
    expect(within(branch!).queryByLabelText(/output/i)).toBeNull();
    expect(within(branch!).queryByLabelText(/acceptance/i)).toBeNull();
    expect(within(branch!).getByText(/复杂需求和验收规则继续通过/)).toBeInTheDocument();
  });

  it("saves a title-only Task edit without sending workUnit", async () => {
    const api = mockLiveTaskEditorApi();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    fireEvent.change(screen.getByLabelText("Task 名称"), { target: { value: "更新后的 Task" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(api.patchBodies).toHaveLength(1));
    expect(api.patchBodies[0]).toEqual({ title: "更新后的 Task" });
  });

  it("saves a leader-only Task edit without sending workUnit", async () => {
    const api = mockLiveTaskEditorApi();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    fireEvent.change(screen.getByLabelText("Leader Agent"), { target: { value: "reviewer" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(api.patchBodies).toHaveLength(1));
    expect(api.patchBodies[0]).toEqual({ leaderAgentId: "reviewer" });
  });

  it("saves worker and checker changes with the full existing workUnit", async () => {
    const api = mockLiveTaskEditorApi();
    const original = cloneTaskFixture();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    fireEvent.change(screen.getByLabelText("Worker Agent"), { target: { value: "reviewer" } });
    fireEvent.change(screen.getByLabelText("Checker Agent"), { target: { value: "search" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(api.patchBodies).toHaveLength(1));
    expect(api.patchBodies[0]).toEqual({
      workUnit: {
        ...original.workUnit,
        workerAgentId: "reviewer",
        checkerAgentId: "search",
      },
    });
  });

  it("does not send stale unchanged agent fields after a live Task refresh", async () => {
    const api = mockLiveTaskEditorApi();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    api.mutateCurrentTask((task) => ({
      ...task,
      updatedAt: "2026-05-25T01:00:00.000Z",
      workUnit: {
        ...task.workUnit,
        workerAgentId: "reviewer",
        checkerAgentId: "search",
      },
    }));
    fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));
    await waitFor(() => expect(api.taskRequests).toBe(2));

    fireEvent.change(screen.getByLabelText("Task 名称"), { target: { value: "只改标题的本地草稿" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(api.patchBodies).toHaveLength(1));
    expect(api.patchBodies[0]).toEqual({ title: "只改标题的本地草稿" });
  });

  it("builds worker and checker edits from the latest refreshed workUnit", async () => {
    const api = mockLiveTaskEditorApi();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    api.mutateCurrentTask((task) => ({
      ...task,
      updatedAt: "2026-05-25T01:10:00.000Z",
      workUnit: {
        ...task.workUnit,
        input: { text: "Leader 对话刷新后的最新输入" },
        acceptance: { rules: [...task.workUnit.acceptance.rules, "刷新后的验收规则"] },
      },
    }));
    fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));
    await waitFor(() => expect(api.taskRequests).toBe(2));

    fireEvent.change(screen.getByLabelText("Worker Agent"), { target: { value: "reviewer" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(api.patchBodies).toHaveLength(1));
    expect(api.patchBodies[0]).toEqual({
      workUnit: {
        ...api.currentTask.workUnit,
        workerAgentId: "reviewer",
      },
    });
  });

  it("blocks saving a dirty field when the same Task field changed after the draft opened", async () => {
    const api = mockLiveTaskEditorApi();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("Task 名称"), { target: { value: "旧草稿标题" } });

    api.mutateCurrentTask((task) => ({
      ...task,
      title: "Leader 已经更新的标题",
      workUnit: { ...task.workUnit, title: "Leader 已经更新的标题" },
      updatedAt: "2026-05-25T01:20:00.000Z",
    }));
    fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));
    await waitFor(() => expect(api.taskRequests).toBe(2));

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await within(container.querySelector(".task-edit-branch")!).findByText(/Task 已经在后台更新/)).toBeInTheDocument();
    expect(api.patchBodies).toHaveLength(0);
  });

  it("refreshes live Tasks after a successful shallow edit", async () => {
    const api = mockLiveTaskEditorApi();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    fireEvent.change(screen.getByLabelText("Task 名称"), { target: { value: "刷新后的 Task" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(api.taskRequests).toBe(2));
    await waitFor(() => {
      expect(container.querySelector('[data-task-id="task_research_medtrum"]')).toHaveTextContent("刷新后的 Task");
    });
    await waitFor(() => expect(screen.queryByText("请求失败 (500)")).toBeNull());
  });

  it("keeps the edit panel open and input intact when shallow save fails", async () => {
    mockLiveTaskEditorApi({ patchStatus: 500, patchError: "update failed" });
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    fireEvent.change(screen.getByLabelText("Task 名称"), { target: { value: "失败时保留的输入" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("update failed")).toBeInTheDocument();
    expect(container.querySelector(".task-edit-branch")).toBeTruthy();
    expect(screen.getByLabelText("Task 名称")).toHaveValue("失败时保留的输入");
  });

  it("shows Task mutation warnings as non-blocking edit notes", async () => {
    mockLiveTaskEditorApi({
      warnings: ["workerAgentId and checkerAgentId are the same; self-checking weakens independent acceptance."],
    });
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    fireEvent.change(screen.getByLabelText("Worker Agent"), { target: { value: "main" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await within(container.querySelector(".task-edit-branch")!).findByText(/self-checking weakens independent acceptance/)).toBeInTheDocument();
    expect(screen.queryByText("请求失败 (500)")).toBeNull();
  });

  it("opens a soft archive confirmation from the Task delete action", async () => {
    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    const confirm = container.querySelector(".task-delete-confirm") as HTMLElement | null;
    expect(confirm).toBeTruthy();
    expect(within(confirm!).getByText(/archive 软归档/)).toBeInTheDocument();
    expect(within(confirm!).getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(within(confirm!).getByRole("button", { name: "确认删除" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps Task delete confirmation scoped to the clicked menu when another Task was focused last", async () => {
    const secondTask: TeamCanvasTask = {
      ...cloneTaskFixture(),
      taskId: "task_delete_scope_b",
      title: "删除范围测试 B",
      workUnit: {
        ...cloneTaskFixture().workUnit,
        title: "删除范围测试 B",
      },
    };
    mockTeamTasks.push(secondTask);
    resetMockTeamApiState();
    try {
      const { container } = render(<App />);
      const atlasNodes = getAtlasNodes(container);
      fireEvent.click(await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" }));
      fireEvent.click(await within(atlasNodes).findByRole("button", { name: "删除范围测试 B" }));

      const firstMenu = screen.getByLabelText("调查 Medtrum 云资产 Task 操作");
      const secondMenu = screen.getByLabelText("删除范围测试 B Task 操作");
      fireEvent.click(within(firstMenu).getByRole("button", { name: "删除" }));

      expect(within(firstMenu).getByRole("group", { name: "调查 Medtrum 云资产 删除确认" })).toBeInTheDocument();
      expect(within(firstMenu).getByText(/archive 软归档/)).toBeInTheDocument();
      expect(secondMenu.querySelector(".task-delete-confirm")).toBeNull();
      expect(container.querySelectorAll(".task-delete-confirm")).toHaveLength(1);
    } finally {
      mockTeamTasks.pop();
      resetMockTeamApiState();
    }
  });

  it("cancels Task delete confirmation without archiving", async () => {
    const api = mockLiveTaskEditorApi();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(api.archiveRequests).toBe(0);
    expect(container.querySelector(".task-delete-confirm")).toBeNull();
    expect(container.querySelector(".task-action-branch")).toBeTruthy();
  });

  it("archives a live Task from the delete confirmation and refreshes the atlas", async () => {
    const api = mockLiveTaskEditorApi();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(api.archiveRequests).toBe(1));
    await waitFor(() => expect(api.taskRequests).toBe(2));
    await waitFor(() => {
      expect(container.querySelector('[data-task-id="task_research_medtrum"]')).toBeNull();
    });
    expect(container.querySelector(".task-action-branch")).toBeNull();
  });

  it("keeps the Task delete confirmation open when archive fails", async () => {
    mockLiveTaskEditorApi({ archiveStatus: 500, archiveError: "archive failed" });
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(await screen.findByText("archive failed")).toBeInTheDocument();
    expect(container.querySelector(".task-delete-confirm")).toBeTruthy();
    expect(container.querySelector('[data-task-id="task_research_medtrum"]')).toBeTruthy();
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

  // ── Stale connection rendering ──

  it("does not render stale Task connections as active SVG connection paths", async () => {
    const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
    const staleConnection: TeamTaskConnection = {
      schemaVersion: "team/task-connection-1",
      connectionId: "conn_stale_test",
      fromTaskId: collectTask.taskId,
      fromOutputPortId: "draft_md",
      toTaskId: htmlTask.taskId,
      toInputPortId: "source_md",
      type: "md",
      status: "stale",
      staleReason: "target_task_archived",
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [collectTask, htmlTask] }), { status: 200 });
      if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [staleConnection] }), { status: 200 });
      if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    await waitFor(() => {
      expect(container.querySelector('[data-task-id="task_collect_md"]')).toBeTruthy();
    });

    expect(container.querySelector('[data-task-connection-id="conn_stale_test"]')).toBeNull();
  });

  it("does not render Task connection when port id is missing from task", async () => {
    const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
    const connectionWithMissingPort: TeamTaskConnection = {
      schemaVersion: "team/task-connection-1",
      connectionId: "conn_missing_port",
      fromTaskId: collectTask.taskId,
      fromOutputPortId: "nonexistent_port",
      toTaskId: htmlTask.taskId,
      toInputPortId: "source_md",
      type: "md",
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [collectTask, htmlTask] }), { status: 200 });
      if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [connectionWithMissingPort] }), { status: 200 });
      if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    await waitFor(() => {
      expect(container.querySelector('[data-task-id="task_collect_md"]')).toBeTruthy();
    });

    expect(container.querySelector('[data-task-connection-id="conn_missing_port"]')).toBeNull();
  });

  it("renders active Task connection normally", async () => {
    const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
    const activeConnection: TeamTaskConnection = {
      schemaVersion: "team/task-connection-1",
      connectionId: "conn_active_test",
      fromTaskId: collectTask.taskId,
      fromOutputPortId: "draft_md",
      toTaskId: htmlTask.taskId,
      toInputPortId: "source_md",
      type: "md",
      status: "active",
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [collectTask, htmlTask] }), { status: 200 });
      if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [activeConnection] }), { status: 200 });
      if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    await waitFor(() => {
      expect(container.querySelector('[data-task-connection-id="conn_active_test"]')).toBeTruthy();
    });

    const connectionPath = container.querySelector('[data-task-connection-id="conn_active_test"]') as SVGPathElement | null;
    expect(connectionPath).toBeTruthy();
    expect(connectionPath!.getAttribute("d")).toBeTruthy();
  });

  it("allows same output port to connect to two different target Tasks (fan-out)", async () => {
    const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
    const targetC: TeamCanvasTask = {
      ...cloneTaskFixture(),
      taskId: "task_target_c",
      title: "Target C Task",
      workUnit: {
        ...cloneTaskFixture().workUnit,
        title: "Target C Task",
        inputPorts: [{ id: "source_md", label: "Markdown 文稿", type: "md" }],
      },
    };
    const connB: TeamTaskConnection = {
      schemaVersion: "team/task-connection-1",
      connectionId: "conn_fanout_b",
      fromTaskId: collectTask.taskId,
      fromOutputPortId: "draft_md",
      toTaskId: htmlTask.taskId,
      toInputPortId: "source_md",
      type: "md",
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
    };
    const connC: TeamTaskConnection = {
      schemaVersion: "team/task-connection-1",
      connectionId: "conn_fanout_c",
      fromTaskId: collectTask.taskId,
      fromOutputPortId: "draft_md",
      toTaskId: targetC.taskId,
      toInputPortId: "source_md",
      type: "md",
      createdAt: "2026-05-27T00:00:01.000Z",
      updatedAt: "2026-05-27T00:00:01.000Z",
    };
    const postBodies: unknown[] = [];
    let createIndex = 0;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [collectTask, htmlTask, targetC] }), { status: 200 });
      if (url === "/v1/team/task-connections" && method === "GET") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === "/v1/team/task-connections" && method === "POST") {
        createIndex++;
        postBodies.push(JSON.parse(String(init?.body ?? "{}")));
        const conn = createIndex === 1 ? connB : connC;
        return new Response(JSON.stringify({ connection: conn }), { status: 201 });
      }
      if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    // First connection: source -> target B
    const outputPort = await screen.findByRole("button", { name: "输出 Markdown 文稿 md" });
    fireEvent.click(outputPort);
    const inputB = screen.getAllByRole("button", { name: "输入 Markdown 文稿 md" })[0]!;
    fireEvent.click(inputB);

    await waitFor(() => {
      expect(container.querySelector('[data-task-connection-id="conn_fanout_b"]')).toBeTruthy();
    });

    // Second connection: same output -> target C
    const outputPortAgain = screen.getByRole("button", { name: "输出 Markdown 文稿 md" });
    fireEvent.click(outputPortAgain);
    const inputC = screen.getAllByRole("button", { name: "输入 Markdown 文稿 md" })[1]!;
    fireEvent.click(inputC);

    await waitFor(() => {
      expect(postBodies.length).toBe(2);
      expect(postBodies[0]).toEqual({
        fromTaskId: collectTask.taskId,
        fromOutputPortId: "draft_md",
        toTaskId: htmlTask.taskId,
        toInputPortId: "source_md",
      });
      expect(postBodies[1]).toEqual({
        fromTaskId: collectTask.taskId,
        fromOutputPortId: "draft_md",
        toTaskId: targetC.taskId,
        toInputPortId: "source_md",
      });
      // Both POST bodies share the same fromTaskId/fromOutputPortId
      expect((postBodies[0] as any).fromTaskId).toBe((postBodies[1] as any).fromTaskId);
      expect((postBodies[0] as any).fromOutputPortId).toBe((postBodies[1] as any).fromOutputPortId);
      // But toTaskId differs
      expect((postBodies[0] as any).toTaskId).not.toBe((postBodies[1] as any).toTaskId);
    });

    // Both connection paths should be rendered in DOM
    expect(container.querySelector('[data-task-connection-id="conn_fanout_b"]')).toBeTruthy();
    expect(container.querySelector('[data-task-connection-id="conn_fanout_c"]')).toBeTruthy();
  });
});
