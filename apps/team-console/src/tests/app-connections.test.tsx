import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { MOCK_AGENTS, mockTeamTasks, resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { TeamCanvasTask, TeamTaskConnection, TeamTaskDependency } from "../api/team-types";
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

    it("raises direct Task connections with the last selected connected Task", async () => {
      const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
      const activeConnection: TeamTaskConnection = {
        schemaVersion: "team/task-connection-1",
        connectionId: "conn_active_layer_test",
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

      const atlasNodes = getAtlasNodes(container);
      const targetTask = await within(atlasNodes).findByRole("button", { name: htmlTask.title }) as HTMLElement;
      fireEvent.click(targetTask);

      await waitFor(() => {
        expect(container.querySelector('.execution-map-link-layer-active [data-task-connection-id="conn_active_layer_test"]')).toBeTruthy();
      });
      expect(container.querySelector('.execution-map-link-layer-base [data-task-connection-id="conn_active_layer_test"]')).toBeNull();
    });

    it("raises direct Task connections while hovering a connected Task", async () => {
      const { collectTask, htmlTask } = makeTypedTaskChainFixtures();
      const activeConnection: TeamTaskConnection = {
        schemaVersion: "team/task-connection-1",
        connectionId: "conn_hover_layer_test",
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

      const atlasNodes = getAtlasNodes(container);
      const targetTask = await within(atlasNodes).findByRole("button", { name: htmlTask.title }) as HTMLElement;
      fireEvent.mouseEnter(targetTask);

      await waitFor(() => {
        expect(targetTask.classList.contains("is-layer-active")).toBe(true);
        expect(container.querySelector('.execution-map-link-layer-active [data-task-connection-id="conn_hover_layer_test"]')).toBeTruthy();
      });
      expect(container.querySelector('.execution-map-link-layer-base [data-task-connection-id="conn_hover_layer_test"]')).toBeNull();
    });

    it("raises the active Task branch connector with its Task action panel", async () => {
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
      const targetTask = await within(atlasNodes).findByRole("button", { name: htmlTask.title }) as HTMLElement;
      fireEvent.click(targetTask);

      await waitFor(() => {
        expect(container.querySelector(".task-action-branch")).toBeTruthy();
        expect(container.querySelector(".execution-map-link-layer-active .emap-link-task-branch")).toBeTruthy();
      });
      expect(container.querySelector(".execution-map-link-layer-child .emap-link-task-branch")).toBeNull();
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
