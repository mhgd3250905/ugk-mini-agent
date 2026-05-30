import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { MOCK_AGENTS, mockTeamTasks, resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { TeamCanvasSourceConnection, TeamCanvasSourceNode, TeamCanvasTask } from "../api/team-types";
import { getAtlasNodes, firePointer } from "./app-dom-test-utils";
import { cloneTaskFixture } from "./team-task-test-fixtures";
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

  describe("root trash", () => {
    it("does not render direct archive/remove buttons on root cards", async () => {
      const task: TeamCanvasTask = {
        ...cloneTaskFixture(),
        taskId: "task_no_button_test",
        title: "无按钮 Task",
        workUnit: {
          ...cloneTaskFixture().workUnit,
          title: "无按钮 Task",
          inputPorts: [{ id: "in1", label: "输入", type: "string" }],
          outputPorts: [],
        },
      };
      const sourceNode: TeamCanvasSourceNode = {
        schemaVersion: "team/source-node-1",
        sourceNodeId: "source_no_button_test",
        title: "无按钮 Source",
        nodeType: "text",
        outputPort: { id: "value", label: "文本", type: "string" },
        content: { text: "test" },
        createdAt: "2026-05-27T00:00:00.000Z",
        updatedAt: "2026-05-27T00:00:00.000Z",
      };
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [task] }), { status: 200 });
        if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        if (url === "/v1/team/source-nodes") return new Response(JSON.stringify({ sourceNodes: [sourceNode] }), { status: 200 });
        if (url === "/v1/team/source-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      // Task root card: no archive button
      const atlasNodes = getAtlasNodes(container);
      const taskCard = await within(atlasNodes).findByRole("button", { name: "无按钮 Task" });
      expect(within(taskCard).queryByRole("button", { name: /归档 Task/ })).toBeNull();
      expect(within(taskCard).queryByRole("button", { name: "收纳 Task" })).toBeNull();

      // Source root card: no archive button
      const sourceCard = await within(atlasNodes).findByRole("group", { name: "无按钮 Source" });
      expect(within(sourceCard).queryByRole("button", { name: /归档 Source/ })).toBeNull();
      expect(within(sourceCard).queryByRole("button", { name: "收纳 Source" })).toBeNull();

      // Agent root card: no remove button
      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      const agentCard = within(getAtlasNodes(container)).getByRole("button", { name: "主 Agent" });
      expect(within(agentCard).queryByRole("button", { name: /移出画布 Agent/ })).toBeNull();
      expect(within(agentCard).queryByRole("button", { name: "收纳 Agent" })).toBeNull();
    });

    async function dragNodeToTrash(cont: HTMLElement, nodeEl: HTMLElement) {
      const PID = 42;
      const startX = 100;
      const startY = 100;

      firePointer(nodeEl, "pointerdown", { pointerId: PID, clientX: startX, clientY: startY });

      // Move past drag threshold so hasMoved becomes true and isAtlasDragging renders the trash
      firePointer(nodeEl, "pointermove", { pointerId: PID, clientX: startX + 10, clientY: startY + 10 });

      // Wait for the trash element to appear (rendered conditionally when isAtlasDragging)
      const trashEl = await waitFor(() => {
        const el = cont.querySelector(".emap-root-trash");
        if (!el) throw new Error("trash not rendered");
        return el as HTMLElement;
      });
      const trashRect = { x: 500, y: 500, width: 60, height: 40, left: 500, top: 500, right: 560, bottom: 540, toJSON: () => ({}) };
      vi.spyOn(trashEl, "getBoundingClientRect").mockReturnValue(trashRect as unknown as DOMRect);

      // Move into trash area
      firePointer(nodeEl, "pointermove", { pointerId: PID, clientX: 530, clientY: 520 });
      // Drop on trash
      firePointer(nodeEl, "pointerup", { pointerId: PID, clientX: 530, clientY: 520 });
    }

    it("archives Source root nodes via trash drop", async () => {
      const task: TeamCanvasTask = {
        ...cloneTaskFixture(),
        taskId: "task_source_archive_target",
        title: "接收 Source Task",
        workUnit: {
          ...cloneTaskFixture().workUnit,
          title: "接收 Source Task",
          inputPorts: [{ id: "source_text", label: "文本输入", type: "string" }],
          outputPorts: [],
        },
      };
      const sourceNode: TeamCanvasSourceNode = {
        schemaVersion: "team/source-node-1",
        sourceNodeId: "source_archive_test_1",
        title: "待归档文本",
        nodeType: "text",
        outputPort: { id: "value", label: "文本", type: "string" },
        content: { text: "即将归档" },
        createdAt: "2026-05-27T00:00:00.000Z",
        updatedAt: "2026-05-27T00:00:00.000Z",
      };
      const sourceConnection: TeamCanvasSourceConnection = {
        schemaVersion: "team/source-connection-1",
        connectionId: "source_conn_archive_test_1",
        fromSourceNodeId: sourceNode.sourceNodeId,
        fromOutputPortId: "value",
        toTaskId: task.taskId,
        toInputPortId: "source_text",
        type: "string",
        createdAt: "2026-05-27T00:00:00.000Z",
        updatedAt: "2026-05-27T00:00:00.000Z",
      };
      let sourceArchived = false;
      let sourceArchiveRequests = 0;
      let sourceListRequests = 0;
      let sourceConnectionListRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [task] }), { status: 200 });
        if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        if (url === "/v1/team/source-nodes" && method === "GET") {
          sourceListRequests += 1;
          return new Response(JSON.stringify({
            sourceNodes: sourceArchived ? [] : [sourceNode],
          }), { status: 200 });
        }
        if (url === `/v1/team/source-nodes/${sourceNode.sourceNodeId}/archive` && method === "POST") {
          sourceArchiveRequests += 1;
          sourceArchived = true;
          return new Response(JSON.stringify({ sourceNode: { ...sourceNode, archived: true } }), { status: 200 });
        }
        if (url === "/v1/team/source-connections" && method === "GET") {
          sourceConnectionListRequests += 1;
          return new Response(JSON.stringify({
            connections: sourceArchived ? [] : [sourceConnection],
          }), { status: 200 });
        }
        if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const atlasNodes = getAtlasNodes(container);
      const sourceCard = await within(atlasNodes).findByRole("group", { name: "待归档文本" });
      expect(sourceCard).toBeInTheDocument();
      expect(container.querySelector(`[data-source-connection-id="${sourceConnection.connectionId}"]`)).toBeTruthy();

      // Drag source node to trash
      const sourceEl = container.querySelector(`[data-source-node-id="${sourceNode.sourceNodeId}"]`) as HTMLElement;
      expect(sourceEl).toBeTruthy();
      await dragNodeToTrash(container, sourceEl);

      // Confirm modal opens
      expect(sourceArchiveRequests).toBe(0);
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      const confirmButton = within(dialog).getByRole("button", { name: "确认归档" });
      expect(confirmButton).toBeInTheDocument();

      fireEvent.click(confirmButton);

      await waitFor(() => expect(sourceArchiveRequests).toBe(1));
      await waitFor(() => expect(sourceListRequests).toBeGreaterThanOrEqual(2));
      await waitFor(() => expect(sourceConnectionListRequests).toBeGreaterThanOrEqual(2));
      await waitFor(() => {
        expect(container.querySelector(`[data-source-node-id="${sourceNode.sourceNodeId}"]`)).toBeNull();
      });
      expect(container.querySelector(`[data-source-connection-id="${sourceConnection.connectionId}"]`)).toBeNull();
    });

    it("archives Task root nodes via trash drop", async () => {
      const api = mockLiveTaskEditorApi();
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const atlasNodes = getAtlasNodes(container);
      const taskCard = await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" });
      expect(taskCard).toBeInTheDocument();

      // Drag task node to trash
      const taskEl = container.querySelector('[data-task-id="task_research_medtrum"]') as HTMLElement;
      expect(taskEl).toBeTruthy();
      await dragNodeToTrash(container, taskEl);

      expect(api.archiveRequests).toBe(0);
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(within(dialog).getByText(/调查 Medtrum 云资产/)).toBeInTheDocument();
      const confirmButton = within(dialog).getByRole("button", { name: "确认归档" });
      expect(confirmButton).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "取消" })).toBeInTheDocument();

      fireEvent.click(confirmButton);

      await waitFor(() => expect(api.archiveRequests).toBe(1));
      await waitFor(() => {
        expect(container.querySelector('[data-task-id="task_research_medtrum"]')).toBeNull();
      });
    });

    it("returns a Task root node to its original position after cancelling trash confirmation", async () => {
      const api = mockLiveTaskEditorApi();
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const atlasNodes = getAtlasNodes(container);
      await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" });
      const taskEl = container.querySelector('[data-task-id="task_research_medtrum"]') as HTMLElement;
      expect(taskEl).toBeTruthy();
      const originalLeft = Number.parseFloat(taskEl.style.left);
      const originalTop = Number.parseFloat(taskEl.style.top);

      await dragNodeToTrash(container, taskEl);

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      await waitFor(() => {
        expect(Number.parseFloat(taskEl.style.left)).toBeCloseTo(originalLeft, 4);
        expect(Number.parseFloat(taskEl.style.top)).toBeCloseTo(originalTop, 4);
      });

      fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));

      expect(api.archiveRequests).toBe(0);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(Number.parseFloat(taskEl.style.left)).toBeCloseTo(originalLeft, 4);
      expect(Number.parseFloat(taskEl.style.top)).toBeCloseTo(originalTop, 4);
    });

    it("prefers trash drop when the pointer is inside trash even if the dragged root node intersects Dock", async () => {
      const api = mockLiveTaskEditorApi();
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const atlasNodes = getAtlasNodes(container);
      const taskCard = await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" });
      expect(taskCard).toBeInTheDocument();

      const taskEl = container.querySelector('[data-task-id="task_research_medtrum"]') as HTMLElement;
      const dockEl = container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(taskEl).toBeTruthy();
      expect(dockEl).toBeTruthy();
      vi.spyOn(dockEl!, "getBoundingClientRect").mockReturnValue({
        x: 0, y: 0, width: 1000, height: 1000,
        left: 0, top: 0, right: 1000, bottom: 1000,
        toJSON: () => ({}),
      } as DOMRect);

      const originalLeft = parseFloat(taskEl.style.left);
      const originalTop = parseFloat(taskEl.style.top);
      const PID = 46;
      const startX = originalLeft + 50;
      const startY = originalTop + 30;
      firePointer(taskEl, "pointerdown", { pointerId: PID, clientX: startX, clientY: startY });
      firePointer(taskEl, "pointermove", { pointerId: PID, clientX: startX + 10, clientY: startY + 10 });

      const trashEl = await waitFor(() => {
        const el = container.querySelector(".emap-root-trash");
        if (!el) throw new Error("trash not rendered");
        return el as HTMLElement;
      });
      vi.spyOn(trashEl, "getBoundingClientRect").mockReturnValue({
        x: 500, y: 500, width: 60, height: 40,
        left: 500, top: 500, right: 560, bottom: 540,
        toJSON: () => ({}),
      } as DOMRect);

      firePointer(taskEl, "pointermove", { pointerId: PID, clientX: 530, clientY: 520 });
      firePointer(taskEl, "pointerup", { pointerId: PID, clientX: 530, clientY: 520 });

      expect(api.archiveRequests).toBe(0);
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(within(dialog).getByText(/调查 Medtrum 云资产/)).toBeInTheDocument();
      expect(within(dockEl!).queryByRole("button", { name: /复原 Task 调查 Medtrum 云资产/ })).not.toBeInTheDocument();
    });

    it("keeps Task root nodes when root archive via trash fails", async () => {
      const api = mockLiveTaskEditorApi({ archiveStatus: 500, archiveError: "root task archive failed" });
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const atlasNodes = getAtlasNodes(container);
      const taskCard = await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" });
      expect(taskCard).toBeInTheDocument();

      // Drag task node to trash
      const taskEl = container.querySelector('[data-task-id="task_research_medtrum"]') as HTMLElement;
      expect(taskEl).toBeTruthy();
      await dragNodeToTrash(container, taskEl);

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      const confirmButton = within(dialog).getByRole("button", { name: "确认归档" });
      expect(confirmButton).toBeInTheDocument();

      fireEvent.click(confirmButton);

      await waitFor(() => expect(api.archiveRequests).toBe(1));
      expect(await screen.findByText("root task archive failed")).toBeInTheDocument();
      expect(container.querySelector('[data-task-id="task_research_medtrum"]')).toBeTruthy();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "确认归档" })).toBeInTheDocument();
    });

    it("removes Agent root nodes from the local canvas via trash drop", async () => {
      let agentArchiveCalled = false;
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: mockTeamTasks }), { status: 200 });
        if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        if (url === "/v1/team/source-nodes" && method === "GET") return new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 });
        if (url === "/v1/team/source-connections" && method === "GET") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
        if (url.includes("/v1/agents/") && url.endsWith("/archive") && method === "POST") {
          agentArchiveCalled = true;
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      const atlasNodes = getAtlasNodes(container);
      const agentCard = within(atlasNodes).getByRole("button", { name: "主 Agent" });
      expect(agentCard).toBeInTheDocument();

      // Drag agent node to trash
      const agentEl = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement;
      expect(agentEl).toBeTruthy();
      await dragNodeToTrash(container, agentEl);

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      const confirmButton = within(dialog).getByRole("button", { name: "确认移出画布" });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(container.querySelector('.emap-agent-node[data-agent-id="main"]')).toBeNull();
      });
      expect(agentArchiveCalled).toBe(false);

      const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
      if (dock) {
        expect(within(dock).queryByRole("button", { name: /复原 Agent 主 Agent/ })).toBeNull();
      }
    });

    it("keeps Source root nodes when archive via trash fails", async () => {
      const sourceNode: TeamCanvasSourceNode = {
        schemaVersion: "team/source-node-1",
        sourceNodeId: "source_archive_fail_1",
        title: "归档失败文本",
        nodeType: "text",
        outputPort: { id: "value", label: "文本", type: "string" },
        content: { text: "不会消失" },
        createdAt: "2026-05-27T00:00:00.000Z",
        updatedAt: "2026-05-27T00:00:00.000Z",
      };
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        if (url === "/v1/team/source-nodes" && method === "GET") return new Response(JSON.stringify({ sourceNodes: [sourceNode] }), { status: 200 });
        if (url === `/v1/team/source-nodes/${sourceNode.sourceNodeId}/archive` && method === "POST") {
          return new Response(JSON.stringify({ error: "source archive failed" }), { status: 500 });
        }
        if (url === "/v1/team/source-connections" && method === "GET") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const atlasNodes = getAtlasNodes(container);
      await within(atlasNodes).findByRole("group", { name: "归档失败文本" });

      // Drag source node to trash
      const sourceEl = container.querySelector(`[data-source-node-id="${sourceNode.sourceNodeId}"]`) as HTMLElement;
      expect(sourceEl).toBeTruthy();
      await dragNodeToTrash(container, sourceEl);

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      const confirmButton = within(dialog).getByRole("button", { name: "确认归档" });
      fireEvent.click(confirmButton);

      expect(await screen.findByText("source archive failed")).toBeInTheDocument();
      expect(container.querySelector(`[data-source-node-id="${sourceNode.sourceNodeId}"]`)).toBeTruthy();
    });
  });
});
