import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { MOCK_AGENTS, resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { TeamCanvasSourceConnection, TeamCanvasSourceNode, TeamRunState, TeamTaskConnection } from "../api/team-types";
import { getAtlasNodes, getAtlasStage } from "./app-dom-test-utils";
import { cloneTaskFixture, makeTypedTaskChainFixtures } from "./team-task-test-fixtures";
import { makeLegacyAttemptFixture, makeLiveTaskRunFixture } from "./team-run-test-fixtures";

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

  describe("canvas connections", () => {
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

    it("discovers downstream runs when an open observer consumes the upstream terminal transition", async () => {
      const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
      const connection: TeamTaskConnection = {
        schemaVersion: "team/task-connection-1",
        connectionId: "conn_observer_auto_md",
        fromTaskId: collectTask.taskId,
        fromOutputPortId: "draft_md",
        toTaskId: htmlTask.taskId,
        toInputPortId: "source_md",
        type: "md",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z",
      };
      const upstreamRunning: TeamRunState = {
        ...makeLiveTaskRunFixture(collectTask, "run_upstream_observer_auto"),
        status: "running",
        finishedAt: null,
        taskStates: {
          [collectTask.taskId]: {
            status: "running",
            attemptCount: 1,
            activeAttemptId: "attempt_upstream_observer_auto",
            resultRef: null,
            errorSummary: null,
            progress: { phase: "worker_running", message: "running", updatedAt: "2026-05-25T00:00:02.000Z" },
          },
        },
        summary: { totalTasks: 1, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
      };
      const upstreamCompleted: TeamRunState = {
        ...makeLiveTaskRunFixture(collectTask, "run_upstream_observer_auto"),
        status: "completed",
        finishedAt: "2026-05-25T00:00:10.000Z",
      };
      const downstreamRunning: TeamRunState = {
        ...makeLiveTaskRunFixture(htmlTask, "run_downstream_observer_auto"),
        source: {
          type: "canvas-task",
          taskId: htmlTask.taskId,
          triggeredBy: {
            type: "task-connection",
            connectionId: connection.connectionId,
            fromTaskId: collectTask.taskId,
            fromRunId: upstreamCompleted.runId,
            fromAttemptId: "attempt_upstream_observer_auto",
          },
        },
        status: "running",
        createdAt: "2026-05-25T00:00:10.250Z",
        startedAt: "2026-05-25T00:00:10.300Z",
        finishedAt: null,
        taskStates: {
          [htmlTask.taskId]: {
            status: "running",
            attemptCount: 1,
            activeAttemptId: "attempt_downstream_observer_auto",
            resultRef: null,
            errorSummary: null,
            progress: { phase: "worker_running", message: "observer-discovered downstream", updatedAt: "2026-05-25T00:00:11.000Z" },
          },
        },
        summary: { totalTasks: 1, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
      };
      const upstreamAttempt = {
        ...makeLegacyAttemptFixture(collectTask),
        attemptId: "attempt_upstream_observer_auto",
        status: "succeeded" as const,
        phase: "succeeded",
      };
      let upstreamRunRequests = 0;
      let observerSawTerminal = false;
      let downstreamRunRequestsAfterObserver = 0;

      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [collectTask, htmlTask] }), { status: 200 });
        if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [connection] }), { status: 200 });
        if (url === `/v1/team/tasks/${collectTask.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [observerSawTerminal ? upstreamCompleted : upstreamRunning] }), { status: 200 });
        }
        if (url === `/v1/team/tasks/${htmlTask.taskId}/runs`) {
          if (!observerSawTerminal) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
          downstreamRunRequestsAfterObserver += 1;
          return new Response(JSON.stringify({ runs: [downstreamRunning] }), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${upstreamRunning.runId}`) {
          upstreamRunRequests += 1;
          if (upstreamRunRequests === 1) return new Response(JSON.stringify(upstreamRunning), { status: 200 });
          observerSawTerminal = true;
          return new Response(JSON.stringify(upstreamCompleted), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${upstreamRunning.runId}/tasks/${collectTask.taskId}/attempts`) {
          return new Response(JSON.stringify({ attempts: [upstreamAttempt] }), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${downstreamRunning.runId}`) {
          return new Response(JSON.stringify(downstreamRunning), { status: 200 });
        }
        if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const atlasNodes = getAtlasNodes(container);
      const collectNode = await within(atlasNodes).findByRole("button", { name: "搜集内容 Task" });
      await waitFor(() => expect(upstreamRunRequests).toBeGreaterThanOrEqual(1));
      fireEvent.click(collectNode);
      const upstreamBranch = await screen.findByRole("region", { name: "搜集内容 Task Task 操作" });
      const upstreamRunId = await within(upstreamBranch).findByText("run_upstream_observer_auto");
      fireEvent.click(upstreamRunId.closest("button")!);

      await waitFor(() => {
        const downstreamNode = atlasNodes.querySelector(`[data-task-id="${htmlTask.taskId}"]`);
        expect(downstreamNode).toHaveClass("status-running");
      });

      fireEvent.click(atlasNodes.querySelector(`[data-task-id="${htmlTask.taskId}"]`) as HTMLElement);
      const branch = await screen.findByRole("region", { name: "HTML 制作 Task Task 操作" });
      expect(within(branch).getByText("run_downstream_observer_auto")).toBeInTheDocument();
      expect(within(branch).getByText("observer-discovered downstream")).toBeInTheDocument();
      expect(downstreamRunRequestsAfterObserver).toBeGreaterThanOrEqual(1);
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
  });
});
