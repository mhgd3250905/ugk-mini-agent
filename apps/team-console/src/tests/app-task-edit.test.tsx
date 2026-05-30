import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { mockTeamTasks, resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { TeamCanvasTask } from "../api/team-types";
import { getAtlasNodes } from "./app-dom-test-utils";
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

  describe("task edit and archive", () => {
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
  });
});
