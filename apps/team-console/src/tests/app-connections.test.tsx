import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { MOCK_AGENTS, mockTeamTasks, resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { ResolvedTeamTaskGroup, TeamCanvasTask, TeamRunState, TeamTaskConnection, TeamTaskDependency, TeamTaskGroupRun } from "../api/team-types";
import { getAtlas, getAtlasNodes, firePointer } from "./app-dom-test-utils";
import { cloneTaskFixture, makeTypedTaskChainFixtures } from "./team-task-test-fixtures";

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

  describe("task control dependency UI", () => {
    const depTaskA: TeamCanvasTask = {
      taskId: "dep_alpha",
      title: "Dep Alpha",
      leaderAgentId: "main",
      status: "ready",
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
      archived: false,
      workUnit: {
        title: "Dep Alpha",
        input: { text: "Alpha input" },
        outputPorts: [],
        outputContract: { text: "Alpha output" },
        acceptance: { rules: [] },
        workerAgentId: "main",
        checkerAgentId: "main",
      },
    };
    const depTaskB: TeamCanvasTask = {
      taskId: "dep_beta",
      title: "Dep Beta",
      leaderAgentId: "main",
      status: "ready",
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
      archived: false,
      workUnit: {
        title: "Dep Beta",
        input: { text: "Beta input" },
        outputPorts: [],
        outputContract: { text: "Beta output" },
        acceptance: { rules: [] },
        workerAgentId: "main",
        checkerAgentId: "main",
      },
    };

    function setupDepApi(options?: {
      dependencies?: TeamTaskDependency[];
      onCreate?: (dep: TeamTaskDependency) => void;
    }) {
      const deps = [...(options?.dependencies ?? [])];
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks" && method === "GET") {
          return new Response(JSON.stringify({ tasks: [depTaskA, depTaskB] }), { status: 200 });
        }
        if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        if (url === "/v1/team/task-dependencies" && method === "GET") {
          return new Response(JSON.stringify({ dependencies: deps }), { status: 200 });
        }
        if (url === "/v1/team/task-dependencies" && method === "POST") {
          const body = JSON.parse(String(init?.body ?? "{}")) as { fromTaskId: string; toTaskId: string };
          const dep: TeamTaskDependency = {
            schemaVersion: "team/task-dependency-1",
            dependencyId: `dep_${Date.now()}`,
            fromTaskId: body.fromTaskId,
            toTaskId: body.toTaskId,
            trigger: "on_success",
            createdAt: "2026-05-27T01:00:00.000Z",
            updatedAt: "2026-05-27T01:00:00.000Z",
          };
          deps.push(dep);
          options?.onCreate?.(dep);
          return new Response(JSON.stringify({ dependency: dep }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-dependencies/") && method === "DELETE") {
          const depId = url.split("/").pop()!;
          const idx = deps.findIndex((d) => d.dependencyId === depId);
          if (idx >= 0) deps.splice(idx, 1);
          return new Response(null, { status: 204 });
        }
        if (url === "/v1/team/source-nodes") return new Response(JSON.stringify([]), { status: 200 });
        if (url === "/v1/team/source-connections") return new Response(JSON.stringify([]), { status: 200 });
        if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
        return new Response(JSON.stringify([]), { status: 200 });
      });
    }

    it("renders dependency handles on Task cards with accessible labels", async () => {
      setupDepApi();
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await screen.findByText(depTaskA.title);
      const handles = container.querySelectorAll(".emap-task-dep-handle");
      expect(handles.length).toBeGreaterThanOrEqual(2);
      // Handle should not display bare "dep" text
      for (const handle of Array.from(handles)) {
        const text = handle.textContent?.trim() ?? "";
        expect(text).not.toBe("dep");
        expect(handle).toHaveAttribute("aria-label");
      }
    });

    it("renders dependency with source half socket and cut button", async () => {
      const existingDep: TeamTaskDependency = {
        schemaVersion: "team/task-dependency-1",
        dependencyId: "dep_existing_1",
        fromTaskId: depTaskA.taskId,
        toTaskId: depTaskB.taskId,
        trigger: "on_success",
        status: "active",
        createdAt: "2026-05-27T01:00:00.000Z",
        updatedAt: "2026-05-27T01:00:00.000Z",
      };
      setupDepApi({ dependencies: [existingDep] });
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await screen.findByText(depTaskA.title);

      const depPath = container.querySelector('[data-task-dependency-id="dep_existing_1"]');
      expect(depPath).toBeTruthy();

      const g = depPath!.closest("g");
      expect(g).toBeTruthy();
      const socket = g!.querySelector(".emap-connector-socket-task-dependency .emap-connector-source-socket");
      expect(socket).toBeTruthy();

      const cutButton = screen.getByRole("button", { name: /切断依赖.*Dep Alpha.*Dep Beta/ });
      expect(cutButton).toBeTruthy();
      expect(cutButton.closest(".emap-link-cut-dep")).toBeTruthy();
      expect(cutButton).toHaveAttribute("data-visible", "false");

      const hitArea = g!.querySelector('[data-link-cut-key="dep:dep_existing_1"]') as SVGPathElement | null;
      expect(hitArea).toBeTruthy();
      fireEvent.pointerEnter(hitArea!);
      expect(cutButton).toHaveAttribute("data-visible", "true");
    });

    it("cuts a dependency from the canvas cut button", async () => {
      const existingDep: TeamTaskDependency = {
        schemaVersion: "team/task-dependency-1",
        dependencyId: "dep_cut_1",
        fromTaskId: depTaskA.taskId,
        toTaskId: depTaskB.taskId,
        trigger: "on_success",
        status: "active",
        createdAt: "2026-05-27T01:00:00.000Z",
        updatedAt: "2026-05-27T01:00:00.000Z",
      };
      setupDepApi({ dependencies: [existingDep] });
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await screen.findByText(depTaskA.title);

      expect(container.querySelector('[data-task-dependency-id="dep_cut_1"]')).toBeTruthy();

      const cutButton = screen.getByRole("button", { name: /切断依赖/ });
      fireEvent.click(cutButton);

      await waitFor(() => {
        expect(container.querySelector('[data-task-dependency-id="dep_cut_1"]')).toBeNull();
      });
    });

    it("keeps dependency line on delete failure and shows error", async () => {
      const existingDep: TeamTaskDependency = {
        schemaVersion: "team/task-dependency-1",
        dependencyId: "dep_fail_1",
        fromTaskId: depTaskA.taskId,
        toTaskId: depTaskB.taskId,
        trigger: "on_success",
        status: "active",
        createdAt: "2026-05-27T01:00:00.000Z",
        updatedAt: "2026-05-27T01:00:00.000Z",
      };
      const deps = [existingDep];
      vi.mocked(fetch).mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [{ agentId: "main", name: "主 Agent", description: "默认" }] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks" && method === "GET") return new Response(JSON.stringify({ tasks: [depTaskA, depTaskB] }), { status: 200 });
        if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        if (url === "/v1/team/task-dependencies" && method === "GET") return new Response(JSON.stringify({ dependencies: deps }), { status: 200 });
        if (url === `/v1/team/task-dependencies/${existingDep.dependencyId}` && method === "DELETE") {
          return new Response(JSON.stringify({ error: "internal error" }), { status: 500 });
        }
        if (url === "/v1/team/source-nodes") return new Response(JSON.stringify([]), { status: 200 });
        if (url === "/v1/team/source-connections") return new Response(JSON.stringify([]), { status: 200 });
        if (url.endsWith("/runs")) return new Response(JSON.stringify({ runs: [] }), { status: 200 });
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await screen.findByText(depTaskA.title);

      const cutButton = screen.getByRole("button", { name: /切断依赖/ });
      fireEvent.click(cutButton);

      await waitFor(() => {
        expect(container.querySelector(".error-banner")).toBeTruthy();
      });
      expect(container.querySelector('[data-task-dependency-id="dep_fail_1"]')).toBeTruthy();
    });

    it("creates a dependency via source then target click", async () => {
      let created = false;
      setupDepApi({
        onCreate: () => { created = true; },
      });
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await screen.findByText(depTaskA.title);
      const handles = container.querySelectorAll(".emap-task-dep-handle");
      // Click source handle on Alpha
      const alphaHandle = Array.from(handles).find(
        (h) => h.closest("[data-task-id]")?.getAttribute("data-task-id") === depTaskA.taskId,
      );
      expect(alphaHandle).toBeTruthy();
      fireEvent.click(alphaHandle!);

      // Click target handle on Beta
      const betaHandle = Array.from(handles).find(
        (h) => h.closest("[data-task-id]")?.getAttribute("data-task-id") === depTaskB.taskId,
      );
      expect(betaHandle).toBeTruthy();
      fireEvent.click(betaHandle!);

      await waitFor(() => expect(created).toBe(true));
    });

    it("renders dependency line with data-task-dependency-id", async () => {
      setupDepApi({
        dependencies: [{
          schemaVersion: "team/task-dependency-1",
          dependencyId: "dep_test_1",
          fromTaskId: depTaskA.taskId,
          toTaskId: depTaskB.taskId,
          trigger: "on_success",
          createdAt: "2026-05-27T00:00:00.000Z",
          updatedAt: "2026-05-27T00:00:00.000Z",
        }],
      });
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await screen.findByText(depTaskA.title);
      const depLine = container.querySelector('[data-task-dependency-id="dep_test_1"]');
      expect(depLine).toBeTruthy();
      expect(depLine?.classList.contains("emap-link-task-dependency")).toBe(true);
    });

    it("rejects self-dependency via source-then-same-source click", async () => {
      let postCalled = false;
      setupDepApi({
        onCreate: () => { postCalled = true; },
      });
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await screen.findByText(depTaskA.title);
      const handles = container.querySelectorAll(".emap-task-dep-handle");
      const alphaHandle = Array.from(handles).find(
        (h) => h.closest("[data-task-id]")?.getAttribute("data-task-id") === depTaskA.taskId,
      );
      expect(alphaHandle).toBeTruthy();
      fireEvent.click(alphaHandle!);

      // Click Alpha's handle again — draft source is Alpha, so fromTaskId === toTaskId
      // The component should reject this (completeTaskDependency checks fromTaskId !== toTaskId)
      const alphaHandleAgain = Array.from(container.querySelectorAll(".emap-task-dep-handle")).find(
        (h) => h.closest("[data-task-id]")?.getAttribute("data-task-id") === depTaskA.taskId,
      );
      fireEvent.click(alphaHandleAgain!);

      // Should NOT have created a dependency
      expect(postCalled).toBe(false);
    });

    it("does not render stale dependency lines", async () => {
      setupDepApi({
        dependencies: [{
          schemaVersion: "team/task-dependency-1",
          dependencyId: "dep_stale_1",
          fromTaskId: depTaskA.taskId,
          toTaskId: depTaskB.taskId,
          trigger: "on_success",
          status: "stale",
          staleReason: "target_task_archived",
          createdAt: "2026-05-27T00:00:00.000Z",
          updatedAt: "2026-05-27T00:00:00.000Z",
        }],
      });
      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await screen.findByText(depTaskA.title);
      const depLine = container.querySelector('[data-task-dependency-id="dep_stale_1"]');
      expect(depLine).toBeNull();
    });

    it("creates dependency in mock mode via MockTeamApi", async () => {
      // Push a second mock task so we can create a real dependency between two tasks
      const secondTaskId = "task_mock_dep_second";
      mockTeamTasks.push({
        taskId: secondTaskId,
        title: "Mock Dep Target",
        leaderAgentId: "main",
        status: "ready",
        createdAt: "2026-05-28T00:00:00.000Z",
        updatedAt: "2026-05-28T00:00:00.000Z",
        archived: false,
        workUnit: {
          title: "Mock Dep Target",
          input: { text: "Target input" },
          outputPorts: [],
          outputContract: { text: "Target output" },
          acceptance: { rules: [] },
          workerAgentId: "main",
          checkerAgentId: "main",
        },
      });
      resetMockTeamApiState();
      try {
        const { container } = render(<App />);
        // Wait for both tasks to render
        await screen.findByText("调查 Medtrum 云资产");
        await screen.findByText("Mock Dep Target");
        const handles = container.querySelectorAll(".emap-task-dep-handle");
        expect(handles.length).toBeGreaterThanOrEqual(2);
        // Click source handle on the first task
        const sourceHandle = Array.from(handles).find(
          (h) => h.closest("[data-task-id]")?.getAttribute("data-task-id") === "task_research_medtrum",
        );
        expect(sourceHandle).toBeTruthy();
        fireEvent.click(sourceHandle!);
        // Click target handle on the second task — triggers MockTeamApi.createTaskDependency
        const targetHandle = Array.from(handles).find(
          (h) => h.closest("[data-task-id]")?.getAttribute("data-task-id") === secondTaskId,
        );
        expect(targetHandle).toBeTruthy();
        fireEvent.click(targetHandle!);
        // Dependency line should render
        await waitFor(() => {
          const depLine = container.querySelector(".emap-link-task-dependency");
          expect(depLine).toBeTruthy();
        });
        const depLine = container.querySelector(".emap-link-task-dependency")!;
        expect(depLine.getAttribute("data-task-dependency-id")).toMatch(/^mock_dep_\d+$/);
        // No error toast
        expect(screen.queryByText(/创建依赖失败/)).toBeNull();
      } finally {
        mockTeamTasks.pop();
        resetMockTeamApiState();
      }
    });
  });

  describe("root category segmented filter", () => {
    it("defaults to ALL showing Task nodes from the fixture", async () => {
      const { container } = render(<App />);
      const atlasNodes = getAtlasNodes(container);
      await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" });
      expect(atlasNodes.querySelector(".emap-canvas-task-node")).toBeTruthy();
    });

    it("hides Task when switching to Agent filter", async () => {
      const { container } = render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      const atlasNodes = getAtlasNodes(container);
      await within(atlasNodes).findByRole("button", { name: "主 Agent" });
      expect(atlasNodes.querySelector(".emap-canvas-task-node")).toBeTruthy();

      const agentFilter = screen.getByRole("tab", { name: /^Agent\b/ });
      fireEvent.click(agentFilter);

      expect(atlasNodes.querySelector(".emap-canvas-task-node")).toBeNull();
      expect(atlasNodes.querySelector(".emap-agent-node")).toBeTruthy();
    });

    it("shows Task but hides Agent and Source when switching to Task filter", async () => {
      const { container } = render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      const atlasNodes = getAtlasNodes(container);
      await within(atlasNodes).findByRole("button", { name: "主 Agent" });

      const taskFilter = screen.getByRole("tab", { name: /^Task\b/ });
      fireEvent.click(taskFilter);

      expect(atlasNodes.querySelector(".emap-agent-node")).toBeNull();
      expect(atlasNodes.querySelector(".emap-canvas-task-node")).toBeTruthy();
      expect(atlasNodes.querySelector(".emap-canvas-source-node")).toBeNull();
    });

    it("restores all nodes when switching back to ALL", async () => {
      const { container } = render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      const atlasNodes = getAtlasNodes(container);
      await within(atlasNodes).findByRole("button", { name: "主 Agent" });

      fireEvent.click(screen.getByRole("tab", { name: /^Agent\b/ }));
      expect(atlasNodes.querySelector(".emap-canvas-task-node")).toBeNull();

      fireEvent.click(screen.getByRole("tab", { name: /^ALL\b/ }));
      expect(atlasNodes.querySelector(".emap-agent-node")).toBeTruthy();
      expect(atlasNodes.querySelector(".emap-canvas-task-node")).toBeTruthy();
    });
  });

  describe("long-press lasso selection", () => {
    const SELECTION_LONG_PRESS_MS = 200;

    it("selects Agent and Task after left-button long-press", async () => {
      const { container } = render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      const atlas = getAtlas(container);
      const atlasNodes = getAtlasNodes(container);
      const agentNode = within(atlasNodes).getByRole("button", { name: "主 Agent" }) as HTMLElement;
      const taskNode = await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;

      vi.useFakeTimers();
      firePointer(atlas, "pointerdown", { pointerId: 41, clientX: 220, clientY: 0 });
      act(() => { vi.advanceTimersByTime(SELECTION_LONG_PRESS_MS + 1); });
      firePointer(atlas, "pointermove", { pointerId: 41, clientX: 720, clientY: 420 });
      firePointer(atlas, "pointerup", { pointerId: 41, clientX: 720, clientY: 420, buttons: 0 });
      vi.useRealTimers();

      expect(agentNode).toHaveClass("is-atlas-selected");
      expect(taskNode).toHaveClass("is-atlas-selected");
    });

    it("creates a UI-only Group from selected Tasks and toggles its collapsed card", async () => {
      const { container } = render(<App />);
      const atlas = getAtlas(container);
      const atlasNodes = getAtlasNodes(container);
      const firstTask = await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      const secondTask = await within(atlasNodes).findByRole("button", { name: "发现云服务候选" }) as HTMLElement;

      vi.useFakeTimers();
      firePointer(atlas, "pointerdown", { pointerId: 43, clientX: 240, clientY: 180 });
      act(() => { vi.advanceTimersByTime(SELECTION_LONG_PRESS_MS + 1); });
      firePointer(atlas, "pointermove", { pointerId: 43, clientX: 940, clientY: 430 });
      firePointer(atlas, "pointerup", { pointerId: 43, clientX: 940, clientY: 430, buttons: 0 });
      vi.useRealTimers();

      expect(firstTask).toHaveClass("is-atlas-selected");
      expect(secondTask).toHaveClass("is-atlas-selected");

      fireEvent.click(screen.getByRole("button", { name: /创建 Group/ }));

      const group = await screen.findByRole("group", { name: "Group 1" });
      expect(within(group).getByText("2 Tasks")).toBeInTheDocument();

      fireEvent.click(within(group).getByRole("button", { name: "折叠 Group 1" }));
      expect(atlasNodes.querySelector('[data-task-id="task_research_medtrum"]')).toBeNull();
      expect(atlasNodes.querySelector('[data-task-id="task_discovery_cloud_vendors"]')).toBeNull();
      const collapsedGroup = await screen.findByRole("button", { name: "展开 Group 1 2 Tasks" });

      fireEvent.click(collapsedGroup);
      expect(await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();
      expect(await within(atlasNodes).findByRole("button", { name: "发现云服务候选" })).toBeInTheDocument();
    });

    it("keeps grouped Tasks out of Dock collection and docks the Group as one object", async () => {
      const { container } = render(<App />);
      const atlas = getAtlas(container);
      const atlasNodes = getAtlasNodes(container);
      const firstTask = await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      await within(atlasNodes).findByRole("button", { name: "发现云服务候选" });

      vi.useFakeTimers();
      firePointer(atlas, "pointerdown", { pointerId: 44, clientX: 240, clientY: 180 });
      act(() => { vi.advanceTimersByTime(SELECTION_LONG_PRESS_MS + 1); });
      firePointer(atlas, "pointermove", { pointerId: 44, clientX: 940, clientY: 430 });
      firePointer(atlas, "pointerup", { pointerId: 44, clientX: 940, clientY: 430, buttons: 0 });
      vi.useRealTimers();

      fireEvent.click(screen.getByRole("button", { name: /创建 Group/ }));
      const group = await screen.findByRole("group", { name: "Group 1" });
      const dock = container.querySelector(".emap-root-dock") as HTMLElement | null;
      expect(dock).toBeTruthy();
      vi.spyOn(dock!, "getBoundingClientRect").mockReturnValue({
        x: 200, y: 700, width: 460, height: 72,
        left: 200, top: 700, right: 660, bottom: 772,
        toJSON: () => ({}),
      } as DOMRect);

      const left = parseFloat(firstTask.style.left || "0");
      const top = parseFloat(firstTask.style.top || "0");
      firePointer(firstTask, "pointerdown", { pointerId: 45, clientX: left + 24, clientY: top + 24 });
      firePointer(firstTask, "pointermove", { pointerId: 45, clientX: 320, clientY: 720 });
      firePointer(firstTask, "pointerup", { pointerId: 45, clientX: 320, clientY: 720 });

      expect(atlasNodes.querySelector('[data-task-id="task_research_medtrum"]')).toBeTruthy();
      expect(screen.getByRole("group", { name: "Group 1" })).toBeInTheDocument();
      expect(dock!.querySelector('.emap-root-dock-item[data-kind="task"]')).toBeNull();

      fireEvent.click(within(group).getByRole("button", { name: "收纳 Group 1" }));
      expect(screen.queryByRole("group", { name: "Group 1" })).toBeNull();
      expect(atlasNodes.querySelector('[data-task-id="task_research_medtrum"]')).toBeNull();
      expect(atlasNodes.querySelector('[data-task-id="task_discovery_cloud_vendors"]')).toBeNull();
      expect(within(dock!).getByRole("button", { name: /复原 Group Group 1/ })).toBeInTheDocument();
      expect(dock!.querySelector('.emap-root-dock-item[data-kind="task"]')).toBeNull();

      fireEvent.click(within(dock!).getByRole("button", { name: /复原 Group Group 1/ }));
      expect(await screen.findByRole("group", { name: "Group 1" })).toBeInTheDocument();
      expect(await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();
      expect(await within(atlasNodes).findByRole("button", { name: "发现云服务候选" })).toBeInTheDocument();
    });

    it("clears lasso selection when clicking outside selected nodes", async () => {
      const { container } = render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      const atlas = getAtlas(container);
      const atlasNodes = getAtlasNodes(container);
      const firstTask = await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      const secondTask = await within(atlasNodes).findByRole("button", { name: "发现云服务候选" }) as HTMLElement;
      const agentNode = within(atlasNodes).getByRole("button", { name: "主 Agent" }) as HTMLElement;

      vi.useFakeTimers();
      firePointer(atlas, "pointerdown", { pointerId: 44, clientX: 240, clientY: 180 });
      act(() => { vi.advanceTimersByTime(SELECTION_LONG_PRESS_MS + 1); });
      firePointer(atlas, "pointermove", { pointerId: 44, clientX: 940, clientY: 430 });
      firePointer(atlas, "pointerup", { pointerId: 44, clientX: 940, clientY: 430, buttons: 0 });
      vi.useRealTimers();

      expect(firstTask).toHaveClass("is-atlas-selected");
      expect(secondTask).toHaveClass("is-atlas-selected");

      firePointer(firstTask, "pointerdown", { pointerId: 45, clientX: 260, clientY: 210 });
      firePointer(firstTask, "pointerup", { pointerId: 45, clientX: 260, clientY: 210, buttons: 0 });
      expect(firstTask).toHaveClass("is-atlas-selected");
      expect(secondTask).toHaveClass("is-atlas-selected");

      firePointer(agentNode, "pointerdown", { pointerId: 46, clientX: 80, clientY: 120 });
      firePointer(agentNode, "pointerup", { pointerId: 46, clientX: 80, clientY: 120, buttons: 0 });
      expect(firstTask).not.toHaveClass("is-atlas-selected");
      expect(secondTask).not.toHaveClass("is-atlas-selected");

      vi.useFakeTimers();
      firePointer(atlas, "pointerdown", { pointerId: 47, clientX: 240, clientY: 180 });
      act(() => { vi.advanceTimersByTime(SELECTION_LONG_PRESS_MS + 1); });
      firePointer(atlas, "pointermove", { pointerId: 47, clientX: 940, clientY: 430 });
      firePointer(atlas, "pointerup", { pointerId: 47, clientX: 940, clientY: 430, buttons: 0 });
      vi.useRealTimers();

      expect(firstTask).toHaveClass("is-atlas-selected");
      firePointer(atlas, "pointerdown", { pointerId: 48, clientX: 20, clientY: 20 });
      firePointer(atlas, "pointerup", { pointerId: 48, clientX: 20, clientY: 20, buttons: 0 });
      expect(firstTask).not.toHaveClass("is-atlas-selected");
    });

    it("moves a collapsed Group by dragging its card", async () => {
      const { container } = render(<App />);
      const atlas = getAtlas(container);
      const atlasNodes = getAtlasNodes(container);
      await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" });
      await within(atlasNodes).findByRole("button", { name: "发现云服务候选" });

      vi.useFakeTimers();
      firePointer(atlas, "pointerdown", { pointerId: 49, clientX: 240, clientY: 180 });
      act(() => { vi.advanceTimersByTime(SELECTION_LONG_PRESS_MS + 1); });
      firePointer(atlas, "pointermove", { pointerId: 49, clientX: 940, clientY: 430 });
      firePointer(atlas, "pointerup", { pointerId: 49, clientX: 940, clientY: 430, buttons: 0 });
      vi.useRealTimers();
      fireEvent.click(screen.getByRole("button", { name: /创建 Group/ }));
      const group = await screen.findByRole("group", { name: "Group 1" });
      fireEvent.click(within(group).getByRole("button", { name: "折叠 Group 1" }));
      const collapsedGroup = await screen.findByRole("button", { name: "展开 Group 1 2 Tasks" }) as HTMLElement;

      const groupLeft = parseFloat(collapsedGroup.style.left || "0");
      const groupTop = parseFloat(collapsedGroup.style.top || "0");

      firePointer(collapsedGroup, "pointerdown", { pointerId: 50, clientX: groupLeft + 20, clientY: groupTop + 20 });
      firePointer(collapsedGroup, "pointermove", { pointerId: 50, clientX: groupLeft + 80, clientY: groupTop + 50 });
      firePointer(collapsedGroup, "pointerup", { pointerId: 50, clientX: groupLeft + 80, clientY: groupTop + 50, buttons: 0 });

      expect(parseFloat(collapsedGroup.style.left || "0")).toBe(groupLeft + 60);
      expect(parseFloat(collapsedGroup.style.top || "0")).toBe(groupTop + 30);
    });

    it("locks a Group so it cannot be moved or removed until unlocked", async () => {
      const { container } = render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      const atlas = getAtlas(container);
      const atlasNodes = getAtlasNodes(container);
      const agentNode = within(atlasNodes).getByRole("button", { name: "主 Agent" }) as HTMLElement;
      const firstTask = await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;

      vi.useFakeTimers();
      firePointer(atlas, "pointerdown", { pointerId: 51, clientX: 20, clientY: 80 });
      act(() => { vi.advanceTimersByTime(SELECTION_LONG_PRESS_MS + 1); });
      firePointer(atlas, "pointermove", { pointerId: 51, clientX: 940, clientY: 430 });
      firePointer(atlas, "pointerup", { pointerId: 51, clientX: 940, clientY: 430, buttons: 0 });
      vi.useRealTimers();
      expect(agentNode).toHaveClass("is-atlas-selected");
      fireEvent.click(screen.getByRole("button", { name: /创建 Group/ }));
      const group = await screen.findByRole("group", { name: "Group 1" });
      fireEvent.click(within(group).getByRole("button", { name: "上锁 Group 1" }));

      expect(group).toHaveClass("is-locked");
      const removeButton = within(group).getByRole("button", { name: "移除 Group 1" });
      expect(removeButton).toBeDisabled();
      fireEvent.click(removeButton);
      expect(screen.getByRole("group", { name: "Group 1" })).toBeInTheDocument();

      const firstLeft = parseFloat(firstTask.style.left || "0");
      const firstTop = parseFloat(firstTask.style.top || "0");
      firePointer(firstTask, "pointerdown", { pointerId: 52, clientX: firstLeft + 20, clientY: firstTop + 20 });
      firePointer(firstTask, "pointermove", { pointerId: 52, clientX: firstLeft + 100, clientY: firstTop + 60 });
      firePointer(firstTask, "pointerup", { pointerId: 52, clientX: firstLeft + 100, clientY: firstTop + 60, buttons: 0 });
      expect(parseFloat(firstTask.style.left || "0")).toBe(firstLeft);
      expect(parseFloat(firstTask.style.top || "0")).toBe(firstTop);

      const agentLeft = parseFloat(agentNode.style.left || "0");
      const agentTop = parseFloat(agentNode.style.top || "0");
      firePointer(agentNode, "pointerdown", { pointerId: 53, clientX: agentLeft + 20, clientY: agentTop + 20 });
      firePointer(agentNode, "pointermove", { pointerId: 53, clientX: agentLeft + 100, clientY: agentTop + 60 });
      firePointer(agentNode, "pointerup", { pointerId: 53, clientX: agentLeft + 100, clientY: agentTop + 60, buttons: 0 });
      expect(parseFloat(agentNode.style.left || "0")).toBe(agentLeft + 80);
      expect(parseFloat(agentNode.style.top || "0")).toBe(agentTop + 40);
      expect(parseFloat(firstTask.style.left || "0")).toBe(firstLeft);
      expect(parseFloat(firstTask.style.top || "0")).toBe(firstTop);

      fireEvent.click(within(group).getByRole("button", { name: "解锁 Group 1" }));
      expect(group).not.toHaveClass("is-locked");
      fireEvent.click(within(group).getByRole("button", { name: "移除 Group 1" }));
      expect(screen.queryByRole("group", { name: "Group 1" })).toBeNull();
      expect(await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();
    });

    it("pans instead of selecting on quick drag before long-press delay", async () => {
      const { container } = render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      const atlas = getAtlas(container);
      const atlasNodes = getAtlasNodes(container);
      const agentNode = within(atlasNodes).getByRole("button", { name: "主 Agent" }) as HTMLElement;
      const taskNode = await within(atlasNodes).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;

      vi.useFakeTimers();
      firePointer(atlas, "pointerdown", { pointerId: 42, clientX: 300, clientY: 200 });
      act(() => { vi.advanceTimersByTime(50); });
      firePointer(atlas, "pointermove", { pointerId: 42, clientX: 400, clientY: 300 });
      firePointer(atlas, "pointerup", { pointerId: 42, clientX: 400, clientY: 300, buttons: 0 });
      vi.useRealTimers();

      expect(agentNode).not.toHaveClass("is-atlas-selected");
      expect(taskNode).not.toHaveClass("is-atlas-selected");
    });
  });

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

  describe("task connection rendering", () => {
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
});
