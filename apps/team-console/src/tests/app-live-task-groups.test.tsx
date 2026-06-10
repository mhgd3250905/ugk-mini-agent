import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { ResolvedTeamTaskGroup, TeamCanvasTask, TeamRunState, TeamTaskGroupRun } from "../api/team-types";
import { getAtlas, getAtlasNodes, firePointer } from "./app-dom-test-utils";

describe("App", () => {
  beforeEach(() => {
    resetMockTeamApiState();
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  function makeLiveTask(taskId: string, title: string): TeamCanvasTask {
    return {
      taskId,
      title,
      leaderAgentId: "main",
      status: "ready",
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:00.000Z",
      archived: false,
      workUnit: {
        title,
        input: { text: `${title} input` },
        inputPorts: [{ id: "source", type: "md" }],
        outputPorts: [{ id: "result", type: "md" }],
        outputContract: { text: `${title} output` },
        acceptance: { rules: [`${title} accepted`] },
        workerAgentId: "main",
        checkerAgentId: "main",
      },
    };
  }

  function makeResolvedTaskGroup(input: {
    groupId: string;
    title: string;
    taskIds: string[];
    archived?: boolean;
    status?: ResolvedTeamTaskGroup["status"];
    headTaskIds?: string[];
    validationErrors?: ResolvedTeamTaskGroup["validation"]["errors"];
  }): ResolvedTeamTaskGroup {
    const status = input.status ?? (input.taskIds.length > 0 ? "valid" : "invalid");
    const validationErrors = input.validationErrors ?? (status === "invalid"
      ? [{ code: "no_head_task", message: "Group has no head task" }]
      : []);
    return {
      schemaVersion: "team/task-group-1",
      groupId: input.groupId,
      title: input.title,
      taskIds: input.taskIds,
      archived: input.archived ?? false,
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:00.000Z",
      status,
      headTaskIds: input.headTaskIds ?? (status === "valid" ? input.taskIds.slice(0, 1) : []),
      validation: { errors: validationErrors },
    };
  }

  function makeTaskRun(task: TeamCanvasTask, runId: string, status: TeamRunState["status"] = "running"): TeamRunState {
    return {
      schemaVersion: "team/state-1",
      runId,
      planId: `plan_${runId}`,
      source: { type: "canvas-task", taskId: task.taskId },
      teamUnitId: "team_console_test",
      status,
      createdAt: "2026-06-05T00:00:00.000Z",
      startedAt: status === "queued" ? null : "2026-06-05T00:00:00.000Z",
      finishedAt: ["completed", "failed", "cancelled"].includes(status) ? "2026-06-05T00:02:00.000Z" : null,
      currentTaskId: task.taskId,
      taskStates: {},
      summary: {
        totalTasks: 1,
        succeededTasks: status === "completed" ? 1 : 0,
        failedTasks: status === "failed" ? 1 : 0,
        cancelledTasks: status === "cancelled" ? 1 : 0,
        skippedTasks: 0,
      },
      updatedAt: "2026-06-05T00:00:00.000Z",
    };
  }

  function makeTaskGroupRun(input: {
    groupId: string;
    groupRunId: string;
    status: TeamTaskGroupRun["status"];
    entryRuns?: Array<{ taskId: string; runId: string }>;
    observedRuns?: TeamTaskGroupRun["observedRuns"];
    createdAt?: string;
  }): TeamTaskGroupRun {
    const entryRuns = input.entryRuns ?? [];
    return {
      schemaVersion: "team/task-group-run-1",
      groupRunId: input.groupRunId,
      groupId: input.groupId,
      status: input.status,
      source: { type: "manual" },
      entryRuns,
      observedRuns: input.observedRuns ?? entryRuns.map((run) => ({ ...run, role: "entry" })),
      startedAt: input.status === "queued" ? null : "2026-06-05T00:00:00.000Z",
      finishedAt: ["completed", "completed_with_failures", "failed", "cancelled"].includes(input.status)
        ? "2026-06-05T00:02:00.000Z"
        : null,
      lastError: null,
      createdAt: input.createdAt ?? "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:00.000Z",
    };
  }

  function setupLiveGroupApi(options: {
    tasks: TeamCanvasTask[];
    groups?: ResolvedTeamTaskGroup[];
    createErrorMessage?: string;
    taskRunsByTaskId?: Record<string, TeamRunState[]>;
    groupRunsByGroupId?: Record<string, TeamTaskGroupRun[]>;
    onStartGroupRun?: (group: ResolvedTeamTaskGroup) => TeamTaskGroupRun;
    onGetGroupRun?: (groupRun: TeamTaskGroupRun) => TeamTaskGroupRun;
    onCancelGroupRun?: (groupRun: TeamTaskGroupRun) => TeamTaskGroupRun;
  }) {
    let groups = [...(options.groups ?? [])];
    const taskRunsByTaskId: Record<string, TeamRunState[]> = {
      ...Object.fromEntries(options.tasks.map((task) => [task.taskId, []])),
      ...(options.taskRunsByTaskId ?? {}),
    };
    const groupRunsByGroupId: Record<string, TeamTaskGroupRun[]> = { ...(options.groupRunsByGroupId ?? {}) };
    const findGroupRun = (groupRunId: string): TeamTaskGroupRun | null => {
      for (const groupRuns of Object.values(groupRunsByGroupId)) {
        const groupRun = groupRuns.find((candidate) => candidate.groupRunId === groupRunId);
        if (groupRun) return groupRun;
      }
      return null;
    };
    const replaceGroupRun = (next: TeamTaskGroupRun) => {
      groupRunsByGroupId[next.groupId] = (groupRunsByGroupId[next.groupId] ?? []).map((groupRun) => (
        groupRun.groupRunId === next.groupRunId ? next : groupRun
      ));
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/v1/agents") {
        return new Response(JSON.stringify({
          agents: [{ agentId: "main", name: "主 Agent", description: "默认" }],
        }), { status: 200 });
      }
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/console-layout" && method === "GET") {
        return new Response(JSON.stringify({ state: null, updatedAt: null }), { status: 200 });
      }
      if (url === "/v1/team/console-layout" && method === "PATCH") {
        return new Response(JSON.stringify({ state: JSON.parse(String(init?.body ?? "{}")).state }), { status: 200 });
      }
      if (url === "/v1/team/console/root-summary") {
        return new Response(JSON.stringify({
          tasks: options.tasks,
          deletedTaskIds: [],
          taskRunsByTaskId,
          deletedRunIdsByTaskId: {},
          sourceNodes: [],
          sourceConnections: [],
          taskConnections: [],
          taskDependencies: [],
          serverVersion: {
            taskCatalog: "2026-06-05T00:00:00.000Z",
            taskRunSummary: "2026-06-05T00:00:00.000Z",
          },
        }), { status: 200 });
      }
      if (url === "/v1/team/task-groups" && method === "GET") {
        return new Response(JSON.stringify({ taskGroups: groups.filter((group) => !group.archived) }), { status: 200 });
      }
      if (url === "/v1/team/task-groups" && method === "POST") {
        if (options.createErrorMessage) {
          return new Response(JSON.stringify({ error: { message: options.createErrorMessage } }), { status: 400 });
        }
        const body = JSON.parse(String(init?.body ?? "{}")) as { title?: string; taskIds: string[] };
        const group = makeResolvedTaskGroup({
          groupId: "group_created",
          title: body.title ?? "Group 1",
          taskIds: body.taskIds,
        });
        groups = [...groups, group];
        return new Response(JSON.stringify({ taskGroup: group }), { status: 201 });
      }
      if (url.startsWith("/v1/team/task-groups/") && method === "PATCH") {
        const groupId = decodeURIComponent(url.slice("/v1/team/task-groups/".length));
        const existing = groups.find((group) => group.groupId === groupId);
        if (!existing) return new Response(JSON.stringify({ error: { message: "group not found" } }), { status: 404 });
        const body = JSON.parse(String(init?.body ?? "{}")) as { title?: string; taskIds?: string[] };
        const taskIds = Array.isArray(body.taskIds) ? body.taskIds : existing.taskIds;
        const group = makeResolvedTaskGroup({
          groupId: existing.groupId,
          title: body.title ?? existing.title,
          taskIds,
          archived: existing.archived,
          status: taskIds.length > 0 ? "valid" : "invalid",
          headTaskIds: taskIds.length > 0 ? taskIds.slice(0, 1) : [],
          validationErrors: taskIds.length > 0 ? [] : [{ code: "no_head_task", message: "Group has no head task" }],
        });
        groups = groups.map((candidate) => candidate.groupId === group.groupId ? group : candidate);
        return new Response(JSON.stringify({ taskGroup: group }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-groups/") && url.endsWith("/archive") && method === "POST") {
        const groupId = decodeURIComponent(url.split("/").at(-2)!);
        const archived = groups.find((group) => group.groupId === groupId);
        if (!archived) return new Response(JSON.stringify({ error: { message: "group not found" } }), { status: 404 });
        groups = groups.filter((group) => group.groupId !== groupId);
        return new Response(JSON.stringify({ taskGroup: { ...archived, archived: true } }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-groups/") && url.endsWith("/runs") && method === "GET") {
        const groupId = decodeURIComponent(url.slice("/v1/team/task-groups/".length, -"/runs".length));
        return new Response(JSON.stringify({ groupRuns: groupRunsByGroupId[groupId] ?? [] }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-groups/") && url.endsWith("/runs") && method === "POST") {
        const groupId = decodeURIComponent(url.slice("/v1/team/task-groups/".length, -"/runs".length));
        const group = groups.find((candidate) => candidate.groupId === groupId);
        if (!group) return new Response(JSON.stringify({ error: { message: "group not found" } }), { status: 404 });
        const groupRun = options.onStartGroupRun?.(group) ?? makeTaskGroupRun({
          groupId,
          groupRunId: `group_run_${groupId}`,
          status: "running",
          entryRuns: group.headTaskIds.map((taskId) => ({ taskId, runId: `run_${taskId}` })),
        });
        groupRunsByGroupId[groupId] = [groupRun, ...(groupRunsByGroupId[groupId] ?? [])];
        return new Response(JSON.stringify({ groupRun }), { status: 201 });
      }
      if (url.startsWith("/v1/team/task-group-runs/") && method === "GET") {
        const groupRunId = decodeURIComponent(url.slice("/v1/team/task-group-runs/".length));
        const groupRun = findGroupRun(groupRunId);
        if (!groupRun) return new Response(JSON.stringify({ error: { message: "group run not found" } }), { status: 404 });
        const next = options.onGetGroupRun?.(groupRun) ?? groupRun;
        replaceGroupRun(next);
        return new Response(JSON.stringify({ groupRun: next }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-group-runs/") && url.endsWith("/cancel") && method === "POST") {
        const groupRunId = decodeURIComponent(url.slice("/v1/team/task-group-runs/".length, -"/cancel".length));
        const groupRun = findGroupRun(groupRunId);
        if (!groupRun) return new Response(JSON.stringify({ error: { message: "group run not found" } }), { status: 404 });
        const next = options.onCancelGroupRun?.(groupRun) ?? {
          ...groupRun,
          status: "cancelled" as const,
          finishedAt: "2026-06-05T00:02:00.000Z",
          updatedAt: "2026-06-05T00:02:00.000Z",
        };
        replaceGroupRun(next);
        return new Response(JSON.stringify({ groupRun: next }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return new Response(JSON.stringify({
          runsByTaskId: taskRunsByTaskId,
          deletedRunIdsByTaskId: {},
          serverVersion: "2026-06-05T00:00:00.000Z",
        }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/") && method === "GET") {
        const pathname = new URL(url, "http://team-console.test").pathname;
        const runId = decodeURIComponent(pathname.slice("/v1/team/task-runs/".length));
        const run = Object.values(taskRunsByTaskId).flat().find((candidate) => candidate.runId === runId);
        if (!run) return new Response(JSON.stringify({ error: { message: "run not found" } }), { status: 404 });
        return new Response(JSON.stringify(run), { status: 200 });
      }
      if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      if (url === "/v1/team/task-dependencies") return new Response(JSON.stringify({ dependencies: [] }), { status: 200 });
      if (url === "/v1/team/source-nodes") return new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 });
      if (url === "/v1/team/source-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });
  }

  describe("live Task Groups", () => {
    const SELECTION_LONG_PRESS_MS = 200;

    it("renders backend Task Groups on initial Live API load without storing default Group state", async () => {
      const taskA = makeLiveTask("task_live_a", "Live Alpha");
      const taskB = makeLiveTask("task_live_b", "Live Beta");
      setupLiveGroupApi({
        tasks: [taskA, taskB],
        groups: [makeResolvedTaskGroup({
          groupId: "group_live_1",
          title: "Backend Group",
          taskIds: [taskA.taskId, taskB.taskId],
        })],
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");

      render(<App />);

      const group = await screen.findByRole("group", { name: "Backend Group" });
      expect(within(group).getByText("2 Tasks")).toBeInTheDocument();
      await waitFor(() => {
        const raw = window.localStorage.getItem("ugk-team-console:canvas-ui-state:v1");
        expect(raw).toBeTruthy();
        const state = JSON.parse(raw!);
        expect(state.taskGroups).toBeUndefined();
        expect(state.taskGroupDisplayStates).toEqual([]);
        expect(JSON.stringify(state)).not.toContain("taskNodeIds");
        expect(JSON.stringify(state)).not.toContain("taskIds");
      });
    });

    it("keeps an empty invalid Live Task Group visible and disables running it", async () => {
      const taskA = makeLiveTask("task_live_a", "Live Alpha");
      setupLiveGroupApi({
        tasks: [taskA],
        groups: [makeResolvedTaskGroup({
          groupId: "group_empty",
          title: "Empty Backend Group",
          taskIds: [],
          status: "invalid",
          headTaskIds: [],
          validationErrors: [{ code: "no_head_task", message: "Group has no head task" }],
        })],
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");

      render(<App />);

      const group = await screen.findByRole("group", { name: "Empty Backend Group" });
      expect(group).toHaveAttribute("data-task-group-empty", "true");
      expect(within(group).getByText("0 Tasks")).toBeInTheDocument();
      expect(within(group).getByText("Group 当前不可运行")).toBeInTheDocument();
      expect(within(group).getByRole("button", { name: "运行 Empty Backend Group" })).toBeDisabled();
      await waitFor(() => {
        const raw = window.localStorage.getItem("ugk-team-console:canvas-ui-state:v1");
        expect(raw).toBeTruthy();
        const stateText = JSON.stringify(JSON.parse(raw!));
        expect(stateText).not.toContain("taskNodeIds");
        expect(stateText).not.toContain("taskIds");
      });
    });

    it("adds selected Tasks to an empty Live Task Group through PATCH", async () => {
      const taskA = makeLiveTask("task_live_a", "Live Alpha");
      const taskB = makeLiveTask("task_live_b", "Live Beta");
      setupLiveGroupApi({
        tasks: [taskA, taskB],
        groups: [makeResolvedTaskGroup({
          groupId: "group/live empty",
          title: "Editable Group",
          taskIds: [],
          status: "invalid",
          headTaskIds: [],
          validationErrors: [{ code: "no_head_task", message: "Group has no head task" }],
        })],
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");

      const { container } = render(<App />);
      await screen.findByRole("button", { name: "Live Alpha" });
      await screen.findByRole("button", { name: "Live Beta" });
      const atlas = getAtlas(container);

      vi.useFakeTimers();
      firePointer(atlas, "pointerdown", { pointerId: 63, clientX: 240, clientY: 180 });
      act(() => { vi.advanceTimersByTime(SELECTION_LONG_PRESS_MS + 1); });
      firePointer(atlas, "pointermove", { pointerId: 63, clientX: 940, clientY: 430 });
      firePointer(atlas, "pointerup", { pointerId: 63, clientX: 940, clientY: 430, buttons: 0 });
      vi.useRealTimers();

      const group = await screen.findByRole("group", { name: "Editable Group" });
      fireEvent.click(within(group).getByRole("button", { name: "添加选中 Editable Group" }));

      await within(group).findByText("2 Tasks");
      const patchCall = vi.mocked(fetch).mock.calls.find(([url, init]) => (
        String(url) === "/v1/team/task-groups/group%2Flive%20empty" && init?.method === "PATCH"
      ));
      expect(patchCall).toBeTruthy();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
        taskIds: [taskA.taskId, taskB.taskId],
      });
    });

    it("removes the final Live Group member and keeps the empty Group visible", async () => {
      const taskA = makeLiveTask("task_live_a", "Live Alpha");
      setupLiveGroupApi({
        tasks: [taskA],
        groups: [makeResolvedTaskGroup({
          groupId: "group_live_single",
          title: "Single Group",
          taskIds: [taskA.taskId],
        })],
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");

      render(<App />);

      const group = await screen.findByRole("group", { name: "Single Group" });
      fireEvent.click(within(group).getByRole("button", { name: "移除成员 Live Alpha" }));

      await within(group).findByText("0 Tasks");
      expect(screen.getByRole("group", { name: "Single Group" })).toHaveAttribute("data-task-group-empty", "true");
      expect(within(group).getByRole("button", { name: "运行 Single Group" })).toBeDisabled();
      const patchCall = vi.mocked(fetch).mock.calls.find(([url, init]) => (
        String(url) === "/v1/team/task-groups/group_live_single" && init?.method === "PATCH"
      ));
      expect(patchCall).toBeTruthy();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({ taskIds: [] });
    });

    it("creates a Live Task Group through the backend using real task ids", async () => {
      const taskA = makeLiveTask("task_live_a", "Live Alpha");
      const taskB = makeLiveTask("task_live_b", "Live Beta");
      setupLiveGroupApi({ tasks: [taskA, taskB] });
      window.localStorage.setItem("ugk-team-console:data-source", "live");

      const { container } = render(<App />);
      await screen.findByRole("button", { name: "Live Alpha" });
      await screen.findByRole("button", { name: "Live Beta" });
      const atlas = getAtlas(container);

      vi.useFakeTimers();
      firePointer(atlas, "pointerdown", { pointerId: 61, clientX: 240, clientY: 180 });
      act(() => { vi.advanceTimersByTime(SELECTION_LONG_PRESS_MS + 1); });
      firePointer(atlas, "pointermove", { pointerId: 61, clientX: 940, clientY: 430 });
      firePointer(atlas, "pointerup", { pointerId: 61, clientX: 940, clientY: 430, buttons: 0 });
      vi.useRealTimers();

      fireEvent.click(screen.getByRole("button", { name: /创建 Group/ }));

      await screen.findByRole("group", { name: "Group 1" });
      const createCall = vi.mocked(fetch).mock.calls.find(([url, init]) => (
        String(url) === "/v1/team/task-groups" && init?.method === "POST"
      ));
      expect(createCall).toBeTruthy();
      expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
        title: "Group 1",
        taskIds: [taskA.taskId, taskB.taskId],
      });
      expect(JSON.stringify(createCall?.[1]?.body)).not.toContain("task-node-");
    });

    it("shows the backend validation message when Live Task Group creation fails", async () => {
      const taskA = makeLiveTask("task_live_a", "Live Alpha");
      const taskB = makeLiveTask("task_live_b", "Live Beta");
      setupLiveGroupApi({
        tasks: [taskA, taskB],
        createErrorMessage: "Group boundary is not closed",
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");

      const { container } = render(<App />);
      await screen.findByRole("button", { name: "Live Alpha" });
      await screen.findByRole("button", { name: "Live Beta" });
      const atlas = getAtlas(container);

      vi.useFakeTimers();
      firePointer(atlas, "pointerdown", { pointerId: 62, clientX: 240, clientY: 180 });
      act(() => { vi.advanceTimersByTime(SELECTION_LONG_PRESS_MS + 1); });
      firePointer(atlas, "pointermove", { pointerId: 62, clientX: 940, clientY: 430 });
      firePointer(atlas, "pointerup", { pointerId: 62, clientX: 940, clientY: 430, buttons: 0 });
      vi.useRealTimers();

      fireEvent.click(screen.getByRole("button", { name: /创建 Group/ }));

      expect(await screen.findByText("Group boundary is not closed")).toBeInTheDocument();
    });

    it("renames an unlocked Live Task Group through the backend", async () => {
      const taskA = makeLiveTask("task_live_a", "Live Alpha");
      const taskB = makeLiveTask("task_live_b", "Live Beta");
      setupLiveGroupApi({
        tasks: [taskA, taskB],
        groups: [
          makeResolvedTaskGroup({
            groupId: "group_live_1",
            title: "Group 1",
            taskIds: [taskA.taskId, taskB.taskId],
          }),
        ],
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");

      render(<App />);

      const group = await screen.findByRole("group", { name: "Group 1" });
      fireEvent.click(within(group).getByRole("button", { name: "命名 Group 1" }));
      fireEvent.change(within(group).getByRole("textbox", { name: "Group 名称 Group 1" }), {
        target: { value: "糖尿病周报链路" },
      });
      fireEvent.click(within(group).getByRole("button", { name: "保存 Group 1 名称" }));

      expect(await screen.findByRole("group", { name: "糖尿病周报链路" })).toBeInTheDocument();
      const patchCall = vi.mocked(fetch).mock.calls.find(([url, init]) => (
        String(url) === "/v1/team/task-groups/group_live_1" && init?.method === "PATCH"
      ));
      expect(patchCall).toBeTruthy();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({ title: "糖尿病周报链路" });
    });

    it("archives an unlocked Live Task Group without removing Task nodes", async () => {
      const taskA = makeLiveTask("task_live_a", "Live Alpha");
      const taskB = makeLiveTask("task_live_b", "Live Beta");
      setupLiveGroupApi({
        tasks: [taskA, taskB],
        groups: [makeResolvedTaskGroup({
          groupId: "group/live 1",
          title: "Backend Group",
          taskIds: [taskA.taskId, taskB.taskId],
        })],
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");

      const { container } = render(<App />);
      const group = await screen.findByRole("group", { name: "Backend Group" });
      const atlasNodes = getAtlasNodes(container);

      fireEvent.click(within(group).getByRole("button", { name: "移除 Backend Group" }));

      await waitFor(() => expect(screen.queryByRole("group", { name: "Backend Group" })).toBeNull());
      expect(vi.mocked(fetch).mock.calls.some(([url, init]) => (
        String(url) === "/v1/team/task-groups/group%2Flive%201/archive" && init?.method === "POST"
      ))).toBe(true);
      expect(await within(atlasNodes).findByRole("button", { name: "Live Alpha" })).toBeInTheDocument();
      expect(await within(atlasNodes).findByRole("button", { name: "Live Beta" })).toBeInTheDocument();
    });

    it("shows active backend GroupRun status and keeps the expanded Group frame controls separate", async () => {
      const taskA = makeLiveTask("task_live_a", "Live Alpha");
      const taskB = makeLiveTask("task_live_b", "Live Beta");
      const group = makeResolvedTaskGroup({
        groupId: "group_live_1",
        title: "Backend Group",
        taskIds: [taskA.taskId, taskB.taskId],
      });
      setupLiveGroupApi({
        tasks: [taskA, taskB],
        groups: [group],
        groupRunsByGroupId: {
          [group.groupId]: [makeTaskGroupRun({
            groupId: group.groupId,
            groupRunId: "group_run_active",
            status: "running",
            entryRuns: [{ taskId: taskA.taskId, runId: "run_live_alpha" }],
          })],
        },
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");

      render(<App />);

      const frame = await screen.findByRole("group", { name: "Backend Group" });
      await within(frame).findByText("Running");
      expect(within(frame).getByText("1 runs")).toBeInTheDocument();
      expect(within(frame).getByRole("button", { name: "运行 Backend Group" })).toBeDisabled();
      expect(within(frame).getByRole("button", { name: "终止 Backend Group" })).toBeEnabled();
      expect(frame).toHaveAttribute("data-task-group-run-status", "running");

      fireEvent.click(within(frame).getByRole("button", { name: "终止 Backend Group" }));

      await within(frame).findByText("Cancelled");
      expect(screen.getByRole("group", { name: "Backend Group" })).toHaveAttribute("data-task-group-run-status", "cancelled");
      expect(vi.mocked(fetch).mock.calls.some(([url, init]) => (
        String(url) === "/v1/team/task-group-runs/group_run_active/cancel" && init?.method === "POST"
      ))).toBe(true);
    });

    it("starts a Live GroupRun and refreshes internal Task run state", async () => {
      const taskA = makeLiveTask("task_live_a", "Live Alpha");
      const taskB = makeLiveTask("task_live_b", "Live Beta");
      const taskRunsByTaskId = {
        [taskA.taskId]: [] as TeamRunState[],
        [taskB.taskId]: [] as TeamRunState[],
      };
      const group = makeResolvedTaskGroup({
        groupId: "group/live 1",
        title: "Backend Group",
        taskIds: [taskA.taskId, taskB.taskId],
      });
      setupLiveGroupApi({
        tasks: [taskA, taskB],
        groups: [group],
        taskRunsByTaskId,
        onStartGroupRun: () => {
          taskRunsByTaskId[taskA.taskId].push(makeTaskRun(taskA, "run_live_alpha", "running"));
          return makeTaskGroupRun({
            groupId: group.groupId,
            groupRunId: "group_run_started",
            status: "running",
            entryRuns: [{ taskId: taskA.taskId, runId: "run_live_alpha" }],
          });
        },
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");

      render(<App />);

      const frame = await screen.findByRole("group", { name: "Backend Group" });
      fireEvent.click(within(frame).getByRole("button", { name: "运行 Backend Group" }));

      await within(frame).findByText("Running");
      expect(screen.getByRole("group", { name: "Backend Group" })).toHaveAttribute("data-task-group-run-status", "running");
      expect(vi.mocked(fetch).mock.calls.some(([url, init]) => (
        String(url) === "/v1/team/task-groups/group%2Flive%201/runs" && init?.method === "POST"
      ))).toBe(true);
      expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).startsWith("/v1/team/task-runs/by-task?"))).toBe(true);
    });

    it("active GroupRun remains running without re-polling before the 2s interval", async () => {
      const taskA = makeLiveTask("task_live_a", "Live Alpha");
      const taskB = makeLiveTask("task_live_b", "Live Beta");
      const group = makeResolvedTaskGroup({
        groupId: "group_live_1",
        title: "Backend Group",
        taskIds: [taskA.taskId, taskB.taskId],
      });
      const stableGroupRun = makeTaskGroupRun({
        groupId: group.groupId,
        groupRunId: "group_run_stable",
        status: "running",
        entryRuns: [{ taskId: taskA.taskId, runId: "run_live_alpha" }],
      });
      setupLiveGroupApi({
        tasks: [taskA, taskB],
        groups: [group],
        groupRunsByGroupId: { [group.groupId]: [stableGroupRun] },
        onGetGroupRun: () => stableGroupRun,
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const groupRunDetailGetCount = () => vi.mocked(fetch).mock.calls.filter(([url, init]) => (
        String(url) === "/v1/team/task-group-runs/group_run_stable"
        && (init?.method ?? "GET") === "GET"
      )).length;

      vi.useFakeTimers();
      try {
        render(<App />);

        for (let i = 0; i < 12 && groupRunDetailGetCount() === 0; i += 1) {
          await act(async () => {
            await Promise.resolve();
          });
        }
        expect(screen.getByRole("group", { name: "Backend Group" })).toBeInTheDocument();
        expect(groupRunDetailGetCount()).toBe(1);
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });
        expect(groupRunDetailGetCount()).toBe(1);

        await act(async () => {
          vi.advanceTimersByTime(1999);
          await Promise.resolve();
        });
        expect(groupRunDetailGetCount()).toBe(1);

        await act(async () => {
          vi.advanceTimersByTime(1);
          await Promise.resolve();
        });
        expect(groupRunDetailGetCount()).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("blocks GroupRun start while an internal Task run is active", async () => {
      const taskA = makeLiveTask("task_live_a", "Live Alpha");
      const taskB = makeLiveTask("task_live_b", "Live Beta");
      setupLiveGroupApi({
        tasks: [taskA, taskB],
        groups: [makeResolvedTaskGroup({
          groupId: "group_live_1",
          title: "Backend Group",
          taskIds: [taskA.taskId, taskB.taskId],
        })],
        taskRunsByTaskId: {
          [taskA.taskId]: [makeTaskRun(taskA, "run_live_alpha", "running")],
          [taskB.taskId]: [],
        },
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");

      render(<App />);

      const frame = await screen.findByRole("group", { name: "Backend Group" });
      await within(frame).findByText("内部运行中");
      expect(within(frame).getByRole("button", { name: "运行 Backend Group" })).toBeDisabled();
      expect(vi.mocked(fetch).mock.calls.some(([url, init]) => (
        String(url) === "/v1/team/task-groups/group_live_1/runs" && init?.method === "POST"
      ))).toBe(false);
    });

    it("polls active GroupRun detail and refreshes Task runs after completion", async () => {
      const taskA = makeLiveTask("task_live_a", "Live Alpha");
      const taskB = makeLiveTask("task_live_b", "Live Beta");
      const taskRunsByTaskId = {
        [taskA.taskId]: [makeTaskRun(taskA, "run_live_alpha", "running")],
        [taskB.taskId]: [] as TeamRunState[],
      };
      const group = makeResolvedTaskGroup({
        groupId: "group_live_1",
        title: "Backend Group",
        taskIds: [taskA.taskId, taskB.taskId],
      });
      let detailPollCount = 0;
      setupLiveGroupApi({
        tasks: [taskA, taskB],
        groups: [group],
        taskRunsByTaskId,
        groupRunsByGroupId: {
          [group.groupId]: [makeTaskGroupRun({
            groupId: group.groupId,
            groupRunId: "group_run_polling",
            status: "running",
            entryRuns: [{ taskId: taskA.taskId, runId: "run_live_alpha" }],
          })],
        },
        onGetGroupRun: (groupRun) => {
          detailPollCount += 1;
          taskRunsByTaskId[taskA.taskId].splice(0, taskRunsByTaskId[taskA.taskId].length, makeTaskRun(taskA, "run_live_alpha", "completed"));
          return { ...groupRun, status: "completed", finishedAt: "2026-06-05T00:02:00.000Z" };
        },
      });
      window.localStorage.setItem("ugk-team-console:data-source", "live");

      render(<App />);

      const frame = await screen.findByRole("group", { name: "Backend Group" });
      await waitFor(() => expect(within(frame).getByText("Completed")).toBeInTheDocument(), { timeout: 4500 });
      expect(detailPollCount).toBeGreaterThanOrEqual(1);
      expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).startsWith("/v1/team/task-runs/by-task?"))).toBe(true);
    });

    it("does not call GroupRun endpoints for Mock UI-only Groups", async () => {
      render(<App />);

      await screen.findByRole("button", { name: "调查 Medtrum 云资产" });

      expect(vi.mocked(fetch).mock.calls.some(([url]) => (
        String(url).includes("/v1/team/task-group-runs/")
        || String(url).includes("/v1/team/task-groups/")
      ))).toBe(false);
    });
  });
});
