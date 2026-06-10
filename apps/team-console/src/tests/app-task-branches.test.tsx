import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { TeamCanvasTask } from "../api/team-types";
import { getAtlasNodes } from "./app-dom-test-utils";

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

  describe("multiple Task child panel isolation", () => {
    const taskA: TeamCanvasTask = {
      taskId: "mtask_alpha",
      title: "Alpha Task",
      leaderAgentId: "main",
      status: "ready",
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
      archived: false,
      workUnit: {
        title: "Alpha Task",
        input: { text: "Alpha input" },
        outputPorts: [],
        outputContract: { text: "Alpha output" },
        acceptance: { rules: [] },
        workerAgentId: "main",
        checkerAgentId: "main",
      },
    };
    const taskB: TeamCanvasTask = {
      taskId: "mtask_beta",
      title: "Beta Task",
      leaderAgentId: "main",
      status: "ready",
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
      archived: false,
      workUnit: {
        title: "Beta Task",
        input: { text: "Beta input" },
        outputPorts: [],
        outputContract: { text: "Beta output" },
        acceptance: { rules: [] },
        workerAgentId: "search",
        checkerAgentId: "main",
      },
    };
    const taskC: TeamCanvasTask = {
      taskId: "mtask_gamma",
      title: "Gamma Task",
      leaderAgentId: "main",
      status: "ready",
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
      archived: false,
      workUnit: {
        title: "Gamma Task",
        input: { text: "Gamma input" },
        outputPorts: [],
        outputContract: { text: "Gamma output" },
        acceptance: { rules: [] },
        workerAgentId: "main",
        checkerAgentId: "search",
      },
    };
    const allTasks = [taskA, taskB, taskC];

    function setupLiveMultiTaskApi() {
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [
              { agentId: "main", name: "主 Agent", description: "默认" },
              { agentId: "search", name: "搜索 Agent", description: "搜索" },
            ],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks" && method === "GET") {
          return new Response(JSON.stringify({ tasks: allTasks }), { status: 200 });
        }
        if (url === "/v1/team/task-connections") return new Response(JSON.stringify([]), { status: 200 });
        if (url === "/v1/team/source-nodes") return new Response(JSON.stringify([]), { status: 200 });
        if (url === "/v1/team/source-connections") return new Response(JSON.stringify([]), { status: 200 });
        if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
        // PATCH for task edits
        for (const task of allTasks) {
          if (url === `/v1/team/tasks/${task.taskId}` && method === "PATCH") {
            const body = JSON.parse(String(init?.body ?? "{}"));
            const updated = { ...task, ...body, updatedAt: "2026-05-27T01:00:00.000Z" };
            return new Response(JSON.stringify({ task: updated }), { status: 200 });
          }
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });
    }

    it("multiple Task edit panels can be open simultaneously", async () => {
      setupLiveMultiTaskApi();
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      // Open Task A menu
      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());

      // Click edit for Task A
      const branchA = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      )!;
      const editButtonA = Array.from(branchA.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("编辑"),
      )!;
      fireEvent.click(editButtonA);
      await waitFor(() => expect(container.querySelectorAll(".task-edit-branch").length).toBeGreaterThanOrEqual(1));

      // Open Task B menu
      const taskBNode = within(getAtlasNodes(container)).getByRole("button", { name: taskB.title });
      fireEvent.click(taskBNode);
      await waitFor(() => {
        const branches = container.querySelectorAll(".task-action-branch");
        expect(branches.length).toBeGreaterThanOrEqual(2);
      });

      // Click edit for Task B
      const branchB = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskB.taskId),
      )!;
      const editButtonB = Array.from(branchB.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("编辑"),
      )!;
      fireEvent.click(editButtonB);

      // Both edit panels should exist
      await waitFor(() => {
        const editPanels = container.querySelectorAll(".task-edit-branch");
        expect(editPanels.length).toBe(2);
      });

      // Each edit panel should contain its own task title/id
      const editPanels = container.querySelectorAll(".task-edit-branch");
      const panelTexts = Array.from(editPanels).map((el) => el.textContent);
      const hasAlpha = panelTexts.some((t) => t?.includes(taskA.title));
      const hasBeta = panelTexts.some((t) => t?.includes(taskB.title));
      expect(hasAlpha).toBe(true);
      expect(hasBeta).toBe(true);
    });

    it("closing one Task action branch clears only that Task edit draft", async () => {
      setupLiveMultiTaskApi();
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());
      const branchA = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      ) as HTMLElement | undefined;
      expect(branchA).toBeTruthy();
      const editButtonA = Array.from(branchA!.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("编辑"),
      )!;
      fireEvent.click(editButtonA);
      await waitFor(() => expect(container.querySelector(".task-edit-branch")).toBeTruthy());
      const editPanelA = Array.from(container.querySelectorAll(".task-edit-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      ) as HTMLElement | undefined;
      expect(editPanelA).toBeTruthy();
      fireEvent.change(within(editPanelA!).getByLabelText("Task 名称"), { target: { value: "Unsaved Alpha" } });

      const taskBNode = within(getAtlasNodes(container)).getByRole("button", { name: taskB.title });
      fireEvent.click(taskBNode);
      await waitFor(() => {
        expect(container.querySelectorAll(".task-action-branch").length).toBeGreaterThanOrEqual(2);
      });
      const branchB = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskB.taskId),
      ) as HTMLElement | undefined;
      expect(branchB).toBeTruthy();
      const editButtonB = Array.from(branchB!.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("编辑"),
      )!;
      fireEvent.click(editButtonB);
      await waitFor(() => expect(container.querySelectorAll(".task-edit-branch")).toHaveLength(2));
      const editPanelB = Array.from(container.querySelectorAll(".task-edit-branch")).find(
        (el) => el.textContent?.includes(taskB.taskId),
      ) as HTMLElement | undefined;
      expect(editPanelB).toBeTruthy();
      fireEvent.change(within(editPanelB!).getByLabelText("Task 名称"), { target: { value: "Unsaved Beta" } });

      fireEvent.click(within(branchA!).getByRole("button", { name: `收起 ${taskA.title} Task 操作` }));

      await waitFor(() => {
        const remainingEditPanels = Array.from(container.querySelectorAll(".task-edit-branch")) as HTMLElement[];
        expect(remainingEditPanels).toHaveLength(1);
        expect(remainingEditPanels[0]).toHaveTextContent(taskB.taskId);
        expect(remainingEditPanels[0]).not.toHaveTextContent(taskA.taskId);
      });
      const remainingEditPanel = container.querySelector(".task-edit-branch") as HTMLElement;
      expect(within(remainingEditPanel).getByLabelText("Task 名称")).toHaveValue("Unsaved Beta");
      expect(container.querySelector(".task-action-branch")!).toHaveTextContent(taskB.taskId);

      fireEvent.click(taskANode);
      await waitFor(() => {
        const branches = Array.from(container.querySelectorAll(".task-action-branch"));
        expect(branches.some((el) => el.textContent?.includes(taskA.taskId))).toBe(true);
      });
      const reopenedBranchA = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      ) as HTMLElement | undefined;
      expect(reopenedBranchA).toBeTruthy();
      const reopenedEditButtonA = Array.from(reopenedBranchA!.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("编辑"),
      )!;
      fireEvent.click(reopenedEditButtonA);

      await waitFor(() => {
        const reopenedEditPanelA = Array.from(container.querySelectorAll(".task-edit-branch")).find(
          (el) => el.textContent?.includes(taskA.taskId),
        ) as HTMLElement | undefined;
        expect(reopenedEditPanelA).toBeTruthy();
        expect(within(reopenedEditPanelA!).getByLabelText("Task 名称")).toHaveValue(taskA.title);
      });
      const stillOpenEditPanelB = Array.from(container.querySelectorAll(".task-edit-branch")).find(
        (el) => el.textContent?.includes(taskB.taskId),
      ) as HTMLElement | undefined;
      expect(stillOpenEditPanelB).toBeTruthy();
      expect(within(stillOpenEditPanelB!).getByLabelText("Task 名称")).toHaveValue("Unsaved Beta");
    });

    it("multiple Task leader chat panels can be open simultaneously", async () => {
      setupLiveMultiTaskApi();
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      // Open Task A menu
      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());

      // Click "对话 Leader" for Task A
      const branchA = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      )!;
      const leaderButtonA = Array.from(branchA.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("对话 Leader"),
      )!;
      fireEvent.click(leaderButtonA);
      await waitFor(() => expect(container.querySelectorAll(".task-leader-chat-branch").length).toBeGreaterThanOrEqual(1));

      // Open Task B menu
      const taskBNode = within(getAtlasNodes(container)).getByRole("button", { name: taskB.title });
      fireEvent.click(taskBNode);
      await waitFor(() => {
        const branches = container.querySelectorAll(".task-action-branch");
        expect(branches.length).toBeGreaterThanOrEqual(2);
      });

      // Click "对话 Leader" for Task B
      const branchB = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskB.taskId),
      )!;
      const leaderButtonB = Array.from(branchB.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("对话 Leader"),
      )!;
      fireEvent.click(leaderButtonB);

      // Both leader chat panels should exist
      await waitFor(() => {
        const chatPanels = container.querySelectorAll(".task-leader-chat-branch");
        expect(chatPanels.length).toBe(2);
      });

      // Each should have an iframe with the correct teamTaskId
      const chatPanels = container.querySelectorAll(".task-leader-chat-branch iframe");
      expect(chatPanels.length).toBe(2);
      const srcs = Array.from(chatPanels).map((iframe) => iframe.getAttribute("src") ?? "");
      expect(srcs.some((src) => src.includes(`teamTaskId=${taskA.taskId}`))).toBe(true);
      expect(srcs.some((src) => src.includes(`teamTaskId=${taskB.taskId}`))).toBe(true);
    });

    it("keeps manual copy fallback scoped to the clicked Leader chat panel", async () => {
      setupLiveMultiTaskApi();
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(document, "execCommand", {
        value: vi.fn().mockReturnValue(false),
        writable: true,
        configurable: true,
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());
      const branchA = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      )!;
      fireEvent.click(Array.from(branchA.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("对话 Leader"),
      )!);

      const taskBNode = within(getAtlasNodes(container)).getByRole("button", { name: taskB.title });
      fireEvent.click(taskBNode);
      await waitFor(() => {
        expect(container.querySelectorAll(".task-action-branch").length).toBeGreaterThanOrEqual(2);
      });
      const branchB = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskB.taskId),
      )!;
      fireEvent.click(Array.from(branchB.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("对话 Leader"),
      )!);

      await waitFor(() => {
        expect(container.querySelectorAll(".task-leader-chat-branch").length).toBe(2);
      });

      const chatA = Array.from(container.querySelectorAll(".task-leader-chat-branch")).find(
        (el) => el.textContent?.includes(taskA.title),
      ) as HTMLElement | undefined;
      const chatB = Array.from(container.querySelectorAll(".task-leader-chat-branch")).find(
        (el) => el.textContent?.includes(taskB.title),
      ) as HTMLElement | undefined;
      expect(chatA).toBeTruthy();
      expect(chatB).toBeTruthy();

      fireEvent.click(within(chatA!).getByRole("button", { name: /复制 Task 上下文/ }));

      await waitFor(() => {
        const manualCopy = within(chatA!).getByLabelText("手动复制 Task 上下文") as HTMLTextAreaElement;
        expect(manualCopy.value).toContain(`taskId: ${taskA.taskId}`);
        expect(manualCopy.value).not.toContain(`taskId: ${taskB.taskId}`);
      });
      expect(within(chatB!).queryByLabelText("手动复制 Task 上下文")).toBeNull();
    });

    it("clears stale Leader copy fallback when reopening the same Leader chat", async () => {
      setupLiveMultiTaskApi();
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(document, "execCommand", {
        value: vi.fn().mockReturnValue(false),
        writable: true,
        configurable: true,
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());

      const branchA = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      )!;
      const leaderButton = () => Array.from(branchA.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("对话 Leader"),
      )!;

      fireEvent.click(leaderButton());
      await waitFor(() => expect(container.querySelector(".task-leader-chat-branch")).toBeTruthy());

      let chatA = container.querySelector(".task-leader-chat-branch") as HTMLElement;
      fireEvent.click(within(chatA).getByRole("button", { name: /复制 Task 上下文/ }));

      await waitFor(() => {
        expect(within(chatA).getByRole("status").textContent).toContain("复制失败");
        expect(within(chatA).getByLabelText("手动复制 Task 上下文")).toBeInTheDocument();
      });

      fireEvent.click(leaderButton());
      await waitFor(() => expect(container.querySelector(".task-leader-chat-branch")).toBeNull());

      fireEvent.click(leaderButton());
      await waitFor(() => expect(container.querySelector(".task-leader-chat-branch")).toBeTruthy());

      chatA = container.querySelector(".task-leader-chat-branch") as HTMLElement;
      expect(within(chatA).queryByRole("status")).toBeNull();
      expect(within(chatA).queryByLabelText("手动复制 Task 上下文")).toBeNull();
      expect(chatA).not.toHaveTextContent("复制失败");
      expect(chatA).not.toHaveTextContent("已复制");
    });

    it("closing one leader chat does not close the other", async () => {
      setupLiveMultiTaskApi();
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      // Open both leader chats
      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());
      const branchA = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      )!;
      const leaderButtonA = Array.from(branchA.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("对话 Leader"),
      )!;
      fireEvent.click(leaderButtonA);

      const taskBNode = within(getAtlasNodes(container)).getByRole("button", { name: taskB.title });
      fireEvent.click(taskBNode);
      await waitFor(() => {
        const branches = container.querySelectorAll(".task-action-branch");
        expect(branches.length).toBeGreaterThanOrEqual(2);
      });
      const branchB = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskB.taskId),
      )!;
      const leaderButtonB = Array.from(branchB.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("对话 Leader"),
      )!;
      fireEvent.click(leaderButtonB);

      await waitFor(() => {
        expect(container.querySelectorAll(".task-leader-chat-branch").length).toBe(2);
      });

      // Close Task A's leader chat (find its collapse button)
      const allChats = container.querySelectorAll(".task-leader-chat-branch");
      const chatA = Array.from(allChats).find((el) => el.textContent?.includes(taskA.title));
      expect(chatA).toBeTruthy();
      const collapseA = chatA!.querySelector(".agent-playground-branch-collapse") as HTMLElement | null;
      expect(collapseA).toBeTruthy();
      fireEvent.click(collapseA!);

      // Task A's chat is gone, but Task B's remains
      await waitFor(() => {
        const remaining = container.querySelectorAll(".task-leader-chat-branch");
        expect(remaining.length).toBe(1);
        expect(remaining[0]!.textContent).toContain(taskB.title);
      });

      // Task B's menu should still be present
      const remainingBranches = container.querySelectorAll(".task-action-branch");
      const branchBStill = Array.from(remainingBranches).find((el) => el.textContent?.includes(taskB.taskId));
      expect(branchBStill).toBeTruthy();
    });

    it("closing one Task action branch clears only its own delete confirmation", async () => {
      setupLiveMultiTaskApi();
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskANode = await within(getAtlasNodes(container)).findByRole("button", { name: taskA.title });
      fireEvent.click(taskANode);
      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());
      const branchA = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskA.taskId),
      ) as HTMLElement | undefined;
      expect(branchA).toBeTruthy();

      const deleteButtonA = Array.from(branchA!.querySelectorAll(".task-action-menu-button")).find(
        (btn) => btn.textContent?.includes("删除"),
      )!;
      fireEvent.click(deleteButtonA);
      expect(within(branchA!).getByRole("group", { name: `${taskA.title} 删除确认` })).toBeInTheDocument();

      const taskBNode = within(getAtlasNodes(container)).getByRole("button", { name: taskB.title });
      fireEvent.click(taskBNode);
      await waitFor(() => {
        expect(container.querySelectorAll(".task-action-branch").length).toBeGreaterThanOrEqual(2);
      });
      const branchB = Array.from(container.querySelectorAll(".task-action-branch")).find(
        (el) => el.textContent?.includes(taskB.taskId),
      ) as HTMLElement | undefined;
      expect(branchB).toBeTruthy();
      expect(within(branchB!).queryByRole("group", { name: `${taskA.title} 删除确认` })).toBeNull();

      fireEvent.click(within(branchA!).getByRole("button", { name: `收起 ${taskA.title} Task 操作` }));

      await waitFor(() => {
        const remainingBranches = Array.from(container.querySelectorAll(".task-action-branch")) as HTMLElement[];
        expect(remainingBranches).toHaveLength(1);
        expect(remainingBranches[0]).toHaveTextContent(taskB.taskId);
        expect(remainingBranches[0]).not.toHaveTextContent(taskA.taskId);
      });
      expect(container.querySelector(".task-delete-confirm")).toBeNull();
      expect(container.querySelector(".task-edit-branch")).toBeNull();
    });

  });

});
