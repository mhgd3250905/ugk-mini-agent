import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { useTeamConsoleLiveData } from "../app/use-team-console-live-data";
import type { TeamCanvasTask } from "../api/team-types";
import {
  MOCK_AGENTS,
  mockDiscoveryGeneratedTasks,
  mockDiscoveryRootTask,
  mockTeamTasks,
  resetMockTeamApiState,
} from "../fixtures/team-fixtures";
import { getAtlasNodes, deferred } from "./app-dom-test-utils";
import {
  byTaskRunsResponse,
  generatedSummary,
  getGeneratedCard,
  noop,
  openMockDiscoverySubcanvas,
  revealStaleGeneratedTasks,
} from "./app-live-data-helpers";

function LiveDataProbe({ openDiscoveryTaskIds = [] }: { openDiscoveryTaskIds?: string[] } = {}) {
  const liveData = useTeamConsoleLiveData({
    onApplyLiveTasks: noop,
    onApplyLiveSources: noop,
    onCloseBranches: noop,
    onResetContextUi: noop,
    selectedTaskId: null,
    openDiscoveryTaskIds,
  });
  return (
    <div>
      <pre data-testid="live-data-probe">
        {JSON.stringify({
          tasks: liveData.tasks.map((task) => task.taskId),
          generated: Object.fromEntries(Object.entries(liveData.generatedTasksByDiscoveryTaskId).map(([taskId, tasks]) => [
            taskId,
            tasks.map((task) => task.taskId),
          ])),
          runKeys: Object.keys(liveData.taskRunsByTaskId).sort(),
          summaries: liveData.discoverySummariesByTaskId,
          diagnostics: (liveData as {
            discoveryDispatchDiagnosticsByTaskId?: Record<string, Array<{ itemId: string; error: string | null }>>;
          }).discoveryDispatchDiagnosticsByTaskId ?? {},
          refreshing: liveData.liveTasksRefreshing,
        })}
      </pre>
      <button type="button" onClick={() => void liveData.refreshLiveTasks()}>probe refresh</button>
    </div>
  );
}

function GeneratedDetailProbe({ openDiscoveryTaskIds = [] }: { openDiscoveryTaskIds?: string[] } = {}) {
  const liveData = useTeamConsoleLiveData({
    onApplyLiveTasks: noop,
    onApplyLiveSources: noop,
    onCloseBranches: noop,
    onResetContextUi: noop,
    selectedTaskId: null,
    openDiscoveryTaskIds,
  });
  const generatedDetails = Object.fromEntries(Object.values(liveData.generatedTasksByDiscoveryTaskId).flat().map((task) => [
    task.taskId,
    {
      title: task.title,
      hasWorkUnit: Boolean((task as Partial<TeamCanvasTask>).workUnit),
      workerAgentId: (task as Partial<TeamCanvasTask>).workUnit?.workerAgentId ?? null,
    },
  ]));
  return (
    <div>
      <pre data-testid="generated-detail-probe">{JSON.stringify(generatedDetails)}</pre>
      <button type="button" onClick={() => void liveData.ensureGeneratedTaskDetail("task_generated_vultr")}>ensure vultr</button>
      <button
        type="button"
        onClick={() => {
          void liveData.ensureGeneratedTaskDetail("task_generated_vultr");
          void liveData.ensureGeneratedTaskDetail("task_generated_vultr");
        }}
      >
        ensure vultr twice
      </button>
      <button type="button" onClick={() => void liveData.refreshLiveTasks()}>refresh</button>
    </div>
  );
}

function readLiveDataProbe(): {
  tasks: string[];
  generated: Record<string, string[]>;
  runKeys: string[];
  summaries: Record<string, {
    generatedTaskCount: number;
    activeGeneratedTaskCount: number;
    staleGeneratedTaskCount: number;
    runningGeneratedRunCount: number;
    failedDispatchCount?: number;
  }>;
  diagnostics: Record<string, Array<{ itemId: string; error: string | null }>>;
  refreshing?: boolean;
} {
  return JSON.parse(screen.getByTestId("live-data-probe").textContent || "{}");
}

describe("App lazy Discovery catalog live data", () => {
  beforeEach(() => {
    resetMockTeamApiState();
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("lazy Discovery catalog loading", () => {
    it("does not request /generated-tasks on initial load with Discovery root but no open subcanvas", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const rootTask = mockTeamTasks[0]!;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [rootTask, mockDiscoveryRootTask] }), { status: 200 });
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      render(<LiveDataProbe />);

      await waitFor(() => expect(readLiveDataProbe().tasks).toEqual([rootTask.taskId, mockDiscoveryRootTask.taskId]));
      await waitFor(() => expect(readLiveDataProbe().runKeys.length).toBeGreaterThanOrEqual(1));

      const calledUrls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
      const generatedCalls = calledUrls.filter((url) => url.includes("/generated-tasks"));
      const individualRunCalls = calledUrls.filter((url) => /^\/v1\/team\/tasks\/[^/]+\/runs$/.test(url));
      expect(generatedCalls).toHaveLength(0);
      expect(individualRunCalls).toHaveLength(0);
      expect(readLiveDataProbe().generated).toEqual({});
    });

    it("requests /generated-tasks only for open Discovery roots when subcanvas is open", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const rootTask = mockTeamTasks[0]!;
      const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [rootTask, mockDiscoveryRootTask] }), { status: 200 });
        if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
          return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      render(<LiveDataProbe openDiscoveryTaskIds={[mockDiscoveryRootTask.taskId]} />);

      await waitFor(() => {
        expect(readLiveDataProbe().generated[mockDiscoveryRootTask.taskId]).toEqual([
          "task_generated_vultr",
          "task_generated_hetzner",
        ]);
      });

      const calledUrls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
      const generatedCalls = calledUrls.filter((url) => url.includes("/generated-tasks"));
      const individualRunCalls = calledUrls.filter((url) => /^\/v1\/team\/tasks\/[^/]+\/runs$/.test(url));
      expect(generatedCalls).toHaveLength(1);
      expect(generatedCalls[0]).toContain(mockDiscoveryRootTask.taskId);
      expect(individualRunCalls).toHaveLength(0);
    });

    it("refreshes multiple open Discovery subcanvases independently by id", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const secondDiscoveryTask: TeamCanvasTask = {
        ...mockDiscoveryRootTask,
        taskId: "task_discovery_second",
        title: "第二个 Discovery root",
        workUnit: { ...mockDiscoveryRootTask.workUnit, title: "第二个 Discovery root" },
      };
      const firstGeneratedTask = mockDiscoveryGeneratedTasks.find((task) => task.taskId === "task_generated_vultr")!;
      const secondGeneratedTask: TeamCanvasTask = {
        ...firstGeneratedTask,
        taskId: "task_generated_second",
        title: "Second generated",
        workUnit: { ...firstGeneratedTask.workUnit, title: "Second generated" },
        generatedSource: {
          ...firstGeneratedTask.generatedSource!,
          sourceDiscoveryTaskId: secondDiscoveryTask.taskId,
          sourceItemId: "second-item",
          itemPayload: { id: "second-item", title: "Second item" },
        },
      };
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask, secondDiscoveryTask] }), { status: 200 });
        if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
          return new Response(JSON.stringify({ tasks: [generatedSummary(firstGeneratedTask)] }), { status: 200 });
        }
        if (url.startsWith(`/v1/team/tasks/${secondDiscoveryTask.taskId}/generated-tasks`)) {
          return new Response(JSON.stringify({ tasks: [generatedSummary(secondGeneratedTask)] }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      render(<LiveDataProbe openDiscoveryTaskIds={[mockDiscoveryRootTask.taskId, secondDiscoveryTask.taskId]} />);

      await waitFor(() => {
        const probe = readLiveDataProbe();
        expect(probe.generated[mockDiscoveryRootTask.taskId]).toEqual(["task_generated_vultr"]);
        expect(probe.generated[secondDiscoveryTask.taskId]).toEqual(["task_generated_second"]);
      });

      const generatedCalls = vi.mocked(fetch).mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.includes("/generated-tasks"));
      expect(generatedCalls).toEqual([
        `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks?view=summary`,
        `/v1/team/tasks/${secondDiscoveryTask.taskId}/generated-tasks?view=summary`,
      ]);
    });

    it("ignores a closed Discovery subcanvas response without dropping still-open subcanvas data", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const secondDiscoveryTask: TeamCanvasTask = {
        ...mockDiscoveryRootTask,
        taskId: "task_discovery_late_close",
        title: "迟到关闭 Discovery root",
        workUnit: { ...mockDiscoveryRootTask.workUnit, title: "迟到关闭 Discovery root" },
      };
      const firstGeneratedTask = mockDiscoveryGeneratedTasks.find((task) => task.taskId === "task_generated_vultr")!;
      const secondGeneratedTask: TeamCanvasTask = {
        ...firstGeneratedTask,
        taskId: "task_generated_late_close",
        title: "Late generated",
        workUnit: { ...firstGeneratedTask.workUnit, title: "Late generated" },
        generatedSource: {
          ...firstGeneratedTask.generatedSource!,
          sourceDiscoveryTaskId: secondDiscoveryTask.taskId,
          sourceItemId: "late-close-item",
          itemPayload: { id: "late-close-item", title: "Late close item" },
        },
      };
      const firstCatalog = deferred<Response>();
      const secondCatalog = deferred<Response>();
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask, secondDiscoveryTask] }), { status: 200 });
        if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
          return firstCatalog.promise;
        }
        if (url.startsWith(`/v1/team/tasks/${secondDiscoveryTask.taskId}/generated-tasks`)) {
          return secondCatalog.promise;
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      const { rerender } = render(<LiveDataProbe openDiscoveryTaskIds={[mockDiscoveryRootTask.taskId, secondDiscoveryTask.taskId]} />);

      await waitFor(() => {
        const generatedCalls = vi.mocked(fetch).mock.calls
          .map(([url]) => String(url))
          .filter((url) => url.includes("/generated-tasks"));
        expect(generatedCalls).toHaveLength(2);
      });

      rerender(<LiveDataProbe openDiscoveryTaskIds={[mockDiscoveryRootTask.taskId]} />);

      await act(async () => {
        firstCatalog.resolve(new Response(JSON.stringify({ tasks: [generatedSummary(firstGeneratedTask)] }), { status: 200 }));
        secondCatalog.resolve(new Response(JSON.stringify({ tasks: [generatedSummary(secondGeneratedTask)] }), { status: 200 }));
        await Promise.all([firstCatalog.promise, secondCatalog.promise]);
      });

      await waitFor(() => {
        expect(readLiveDataProbe().generated[mockDiscoveryRootTask.taskId]).toEqual(["task_generated_vultr"]);
      });
      expect(readLiveDataProbe().generated[secondDiscoveryTask.taskId]).toBeUndefined();
    });

    it("does not refresh closed Discovery subcanvas on silent refresh", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const rootTask = mockTeamTasks[0]!;
      const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
      let generatedCatalogRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [rootTask, mockDiscoveryRootTask] }), { status: 200 });
        if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
          generatedCatalogRequests += 1;
          return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      const { rerender } = render(<LiveDataProbe openDiscoveryTaskIds={[mockDiscoveryRootTask.taskId]} />);

      await waitFor(() => {
        expect(readLiveDataProbe().generated[mockDiscoveryRootTask.taskId]).toEqual([
          "task_generated_vultr",
          "task_generated_hetzner",
        ]);
      });
      const openCount = generatedCatalogRequests;
      expect(openCount).toBeGreaterThanOrEqual(1);

      rerender(<LiveDataProbe openDiscoveryTaskIds={[]} />);

      await act(async () => { await Promise.resolve(); });

      const probeAfterClose = readLiveDataProbe();
      expect(probeAfterClose.generated[mockDiscoveryRootTask.taskId]).toEqual([
        "task_generated_vultr",
        "task_generated_hetzner",
      ]);

      await act(async () => { await Promise.resolve(); });
      const afterCloseCount = generatedCatalogRequests;
      expect(afterCloseCount).toBe(openCount);
    });

    it("App click open Discovery subcanvas produces exactly one /generated-tasks request", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived).map(generatedSummary);
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
        if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
          return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      const { container } = render(<App />);
      const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
      const discoveryNode = await within(atlas).findByRole("button", { name: mockDiscoveryRootTask.title });
      fireEvent.click(discoveryNode);
      fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));

      const panel = await waitFor(() => {
        const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      await waitFor(() => {
        expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(1);
      });

      const calledUrls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
      const generatedCalls = calledUrls.filter((url) => url.includes("/generated-tasks"));
      const individualRunCalls = calledUrls.filter((url) => /^\/v1\/team\/tasks\/[^/]+\/runs$/.test(url));
      expect(generatedCalls).toHaveLength(1);
      expect(generatedCalls[0]).toBe(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks?view=summary`);
      expect(individualRunCalls).toHaveLength(0);
    });

    it("caps the initial live Discovery queue render and expands it on demand", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const baseGeneratedTask = mockDiscoveryGeneratedTasks[0]!;
      const generatedTasks = Array.from({ length: 30 }, (_, index): TeamCanvasTask => ({
        ...baseGeneratedTask,
        taskId: `task_generated_perf_${index}`,
        title: `Generated perf ${index}`,
        updatedAt: `2026-05-31T00:${String(index).padStart(2, "0")}:00.000Z`,
        generatedSource: {
          ...baseGeneratedTask.generatedSource!,
          sourceItemId: `perf_item_${index}`,
          itemPayload: { id: `perf_item_${index}`, title: `Perf item ${index}` },
        },
      })).map(generatedSummary);
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
        if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
          return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
        return new Response(JSON.stringify({ connections: [], dependencies: [], sourceNodes: [] }), { status: 200 });
      });

      const { container } = render(<App />);
      const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
      const discoveryNode = await within(atlas).findByRole("button", { name: mockDiscoveryRootTask.title });
      fireEvent.click(discoveryNode);
      fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));

      const panel = await waitFor(() => {
        const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      await waitFor(() => {
        expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(18);
      });
      const queueGrid = panel.querySelector(".discovery-subcanvas-queue-grid") as HTMLElement | null;
      expect(queueGrid).toHaveAttribute("data-generated-queue-visible-count", "18");
      expect(queueGrid).toHaveAttribute("data-generated-queue-total-count", "30");
      expect(panel.querySelector('[data-generated-task-id="task_generated_perf_18"]')).toBeNull();

      fireEvent.click(within(panel).getByRole("button", { name: "显示全部 30 个 generated Task" }));
      await waitFor(() => {
        expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(30);
      });
      expect(panel.querySelector('[data-generated-task-id="task_generated_perf_29"]')).toBeTruthy();
    });

    it("live summary-only generated edit fetches full detail exactly once and opens the edit panel", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const fullTask = mockDiscoveryGeneratedTasks.find((task) => task.taskId === "task_generated_vultr")!;
      const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived).map(generatedSummary);
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
        if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
          return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
        }
        if (url === "/v1/team/tasks/task_generated_vultr") {
          return new Response(JSON.stringify({ task: fullTask }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
        return new Response(JSON.stringify({ connections: [], dependencies: [], sourceNodes: [] }), { status: 200 });
      });

      const { container } = render(<App />);
      const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
      const discoveryNode = await within(atlas).findByRole("button", { name: mockDiscoveryRootTask.title });
      fireEvent.click(discoveryNode);
      fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
      const panel = await waitFor(() => {
        const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      const vultrCard = getGeneratedCard(panel, "task_generated_vultr");

      fireEvent.click(vultrCard.querySelector('[data-generated-action="edit"]')!);

      const editPanel = await waitFor(() => {
        const node = container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      expect(within(editPanel).getByLabelText("Task 名称")).toHaveValue(fullTask.title);
      const fullDetailCalls = vi.mocked(fetch).mock.calls
        .map(([url]) => String(url))
        .filter((url) => url === "/v1/team/tasks/task_generated_vultr");
    expect(fullDetailCalls).toHaveLength(1);
    });

    it("retries generated edit after the first full detail request fails without leaving a half-open edit state", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const fullTask = mockDiscoveryGeneratedTasks.find((task) => task.taskId === "task_generated_vultr")!;
      const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived).map(generatedSummary);
      let detailShouldFail = true;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
        if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
          return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
        }
        if (url === "/v1/team/tasks/task_generated_vultr") {
          if (detailShouldFail) {
            return new Response(JSON.stringify({ error: "detail unavailable" }), { status: 500 });
          }
          return new Response(JSON.stringify({ task: fullTask }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
        return new Response(JSON.stringify({ connections: [], dependencies: [], sourceNodes: [] }), { status: 200 });
      });

      const { container } = render(<App />);
      const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
      const discoveryNode = await within(atlas).findByRole("button", { name: mockDiscoveryRootTask.title });
      fireEvent.click(discoveryNode);
      fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
      const panel = await waitFor(() => {
        const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      const vultrCard = getGeneratedCard(panel, "task_generated_vultr");
      const editButton = vultrCard.querySelector('[data-generated-action="edit"]') as HTMLButtonElement;

      fireEvent.click(editButton);

      await waitFor(() => {
        const fullDetailCalls = vi.mocked(fetch).mock.calls
          .map(([url]) => String(url))
          .filter((url) => url === "/v1/team/tasks/task_generated_vultr");
        expect(fullDetailCalls).toHaveLength(1);
      });
      await waitFor(() => {
        expect(container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]')).toBeNull();
        expect(vultrCard).not.toHaveAttribute("data-generated-editing", "true");
        expect(editButton).toHaveTextContent("编辑");
      });

      detailShouldFail = false;
      fireEvent.click(editButton);

      const editPanel = await waitFor(() => {
        const node = container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]') as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      expect(within(editPanel).getByLabelText("Task 名称")).toHaveValue(fullTask.title);
      const fullDetailCalls = vi.mocked(fetch).mock.calls
        .map(([url]) => String(url))
        .filter((url) => url === "/v1/team/tasks/task_generated_vultr");
      expect(fullDetailCalls).toHaveLength(2);
    });

    it("dedupes synchronous generated detail ensures for the same task", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const fullTask = mockDiscoveryGeneratedTasks.find((task) => task.taskId === "task_generated_vultr")!;
      const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived).map(generatedSummary);
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
        if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
          return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
        }
        if (url === "/v1/team/tasks/task_generated_vultr") {
          return new Response(JSON.stringify({ task: fullTask }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
        if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        if (url === "/v1/team/task-dependencies") return new Response(JSON.stringify({ dependencies: [] }), { status: 200 });
        if (url === "/v1/team/source-nodes") return new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 });
        if (url === "/v1/team/source-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        return new Response(JSON.stringify({}), { status: 200 });
      });

      render(<GeneratedDetailProbe openDiscoveryTaskIds={[mockDiscoveryRootTask.taskId]} />);

      await waitFor(() => {
        const details = JSON.parse(screen.getByTestId("generated-detail-probe").textContent || "{}");
        expect(details.task_generated_vultr).toMatchObject({ hasWorkUnit: false });
      });
      fireEvent.click(screen.getByRole("button", { name: "ensure vultr twice" }));

      await waitFor(() => {
        const details = JSON.parse(screen.getByTestId("generated-detail-probe").textContent || "{}");
        expect(details.task_generated_vultr).toMatchObject({ hasWorkUnit: true });
      });
      const fullDetailCalls = vi.mocked(fetch).mock.calls
        .map(([url]) => String(url))
        .filter((url) => url === "/v1/team/tasks/task_generated_vultr");
      expect(fullDetailCalls).toHaveLength(1);
    });

    it("mock generated edit does not request the live full detail endpoint", async () => {
      const { container } = render(<App />);
      const { panel } = await openMockDiscoverySubcanvas(container);
      const vultrCard = getGeneratedCard(panel, "task_generated_vultr");

      fireEvent.click(vultrCard.querySelector('[data-generated-action="edit"]')!);

      await waitFor(() => {
        expect(container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]')).toBeTruthy();
      });
      const liveDetailCalls = vi.mocked(fetch).mock.calls
        .map(([url]) => String(url))
        .filter((url) => url === "/v1/team/tasks/task_generated_vultr");
      expect(liveDetailCalls).toHaveLength(0);
    });

    it("keeps lazy fetched full generated detail when a later summary refresh arrives", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const fullTask = mockDiscoveryGeneratedTasks.find((task) => task.taskId === "task_generated_vultr")!;
      const initialSummaries = mockDiscoveryGeneratedTasks.filter((task) => !task.archived).map(generatedSummary);
      const refreshedSummaries = initialSummaries.map((summary) => summary.taskId === "task_generated_vultr"
        ? { ...summary, title: "Summary refreshed Vultr", updatedAt: "2026-05-31T00:30:00.000Z" }
        : summary
      );
      let useRefreshedSummary = false;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
        if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
          return new Response(JSON.stringify({ tasks: useRefreshedSummary ? refreshedSummaries : initialSummaries }), { status: 200 });
        }
        if (url === "/v1/team/tasks/task_generated_vultr") {
          return new Response(JSON.stringify({ task: fullTask }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
        if (url === "/v1/team/task-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        if (url === "/v1/team/task-dependencies") return new Response(JSON.stringify({ dependencies: [] }), { status: 200 });
        if (url === "/v1/team/source-nodes") return new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 });
        if (url === "/v1/team/source-connections") return new Response(JSON.stringify({ connections: [] }), { status: 200 });
        return new Response(JSON.stringify({}), { status: 200 });
      });

      render(<GeneratedDetailProbe openDiscoveryTaskIds={[mockDiscoveryRootTask.taskId]} />);

      await waitFor(() => {
        const details = JSON.parse(screen.getByTestId("generated-detail-probe").textContent || "{}");
        expect(details.task_generated_vultr).toMatchObject({ hasWorkUnit: false });
      });
      fireEvent.click(screen.getByRole("button", { name: "ensure vultr" }));
      await waitFor(() => {
        const details = JSON.parse(screen.getByTestId("generated-detail-probe").textContent || "{}");
        expect(details.task_generated_vultr).toMatchObject({ hasWorkUnit: true, workerAgentId: fullTask.workUnit.workerAgentId });
      });

      useRefreshedSummary = true;
      fireEvent.click(screen.getByRole("button", { name: "refresh" }));

      await waitFor(() => {
        const summaryCalls = vi.mocked(fetch).mock.calls
          .map(([url]) => String(url))
          .filter((url) => url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`));
        expect(summaryCalls).toHaveLength(2);
      });
      await waitFor(() => {
        const details = JSON.parse(screen.getByTestId("generated-detail-probe").textContent || "{}");
        expect(details.task_generated_vultr).toMatchObject({
          title: "Summary refreshed Vultr",
          hasWorkUnit: true,
          workerAgentId: fullTask.workUnit.workerAgentId,
        });
      });
    });

    it("shows reset to managed for customized summary-only generated cards", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived).map(generatedSummary);
      const hetznerSummary = generatedTasks.find((task) => task.taskId === "task_generated_hetzner")!;
      expect((hetznerSummary as Partial<TeamCanvasTask>).workUnit).toBeUndefined();
      expect(hetznerSummary.generatedSource).toMatchObject({
        workUnitMode: "customized",
        canResetToManaged: true,
      });
      expect((hetznerSummary.generatedSource as { latestManagedWorkUnit?: unknown }).latestManagedWorkUnit).toBeUndefined();
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
        if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
          return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
        return new Response(JSON.stringify({ connections: [], dependencies: [], sourceNodes: [] }), { status: 200 });
      });

      const { container } = render(<App />);
      const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
      fireEvent.click(await within(atlas).findByRole("button", { name: mockDiscoveryRootTask.title }));
      fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));

      const panel = await waitFor(() => {
        const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      revealStaleGeneratedTasks(panel);
      const hetznerCard = getGeneratedCard(panel, "task_generated_hetzner");
      expect(hetznerCard.querySelector('[data-generated-action="reset-workunit"]')).toHaveTextContent("恢复 managed");
    });

    it("App close Discovery subcanvas then manual refresh produces zero new /generated-tasks requests", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
      let generatedCatalogRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
        if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
          generatedCatalogRequests += 1;
          return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      const { container } = render(<App />);
      const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
      const discoveryNode = await within(atlas).findByRole("button", { name: mockDiscoveryRootTask.title });
      fireEvent.click(discoveryNode);
      fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));

      await waitFor(() => {
        expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
      });
      await waitFor(() => {
        const panel = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)!;
        expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(1);
      });
      const openCount = generatedCatalogRequests;
      expect(openCount).toBeGreaterThanOrEqual(1);

      fireEvent.click(screen.getByRole("button", { name: `收起 ${mockDiscoveryRootTask.title} Discovery 子画布` }));
      await waitFor(() => {
        expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeNull();
      });

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "刷新 Task" })).toBeEnabled());

      expect(generatedCatalogRequests).toBe(openCount);
    });

    it("clears scoped catalog error on successful retry", async () => {
      window.localStorage.setItem("ugk-team-console:data-source", "live");
      const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
      let failCatalog = true;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
        if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
          if (failCatalog) {
            failCatalog = false;
            return new Response(JSON.stringify({ error: { message: "catalog load failed" } }), { status: 500 });
          }
          return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      function CatalogErrorProbe({ openDiscoveryTaskIds }: { openDiscoveryTaskIds: string[] }) {
        const liveData = useTeamConsoleLiveData({
          onApplyLiveTasks: noop,
          onApplyLiveSources: noop,
          onCloseBranches: noop,
          onResetContextUi: noop,
          selectedTaskId: null,
          openDiscoveryTaskIds,
        });
        return (
          <div>
            <span data-testid="catalog-error">{liveData.error ?? "none"}</span>
            <button type="button" onClick={() => void liveData.refreshLiveTasks()}>refresh</button>
          </div>
        );
      }

      render(<CatalogErrorProbe openDiscoveryTaskIds={[mockDiscoveryRootTask.taskId]} />);

      await waitFor(() => {
        expect(screen.getByTestId("catalog-error")).not.toHaveTextContent("none");
      });

      fireEvent.click(screen.getByRole("button", { name: "refresh" }));

      await waitFor(() => {
        expect(screen.getByTestId("catalog-error")).toHaveTextContent("none");
      });
    });
  });
});
