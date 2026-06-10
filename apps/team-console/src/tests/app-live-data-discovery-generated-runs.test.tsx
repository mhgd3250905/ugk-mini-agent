import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { useTeamConsoleLiveData } from "../app/use-team-console-live-data";
import type { TeamCanvasTask, TeamDiscoveryChannelSet, TeamRunState } from "../api/team-types";
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
  canvasTaskRun,
  discoveryRootAttempt,
  generatedAttempt,
  generatedCanvasTaskRun,
  generatedSummary,
  getGeneratedCard,
  noop,
  resetGeneratedSnapshot,
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

function LiveRefreshProbe({ openDiscoveryTaskIds = [] }: { openDiscoveryTaskIds?: string[] } = {}) {
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
      <span data-testid="live-refreshing">{String(liveData.liveTasksRefreshing)}</span>
      <button type="button" onClick={() => liveData.scheduleLiveTaskDiscoveryRefresh()}>schedule</button>
      <button type="button" onClick={() => void liveData.refreshLiveTasks()}>manual</button>
      <button type="button" onClick={() => void liveData.refreshLiveTasks({ silent: true })}>silent</button>
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

describe("App Discovery generated live-data runs", () => {
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

  it("does not request generated child catalogs when live root Tasks contain no Discovery root", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const liveTask = mockTeamTasks[0]!;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
      if (url === "/v1/team/tasks/task_research_medtrum/runs") {
        return new Response(JSON.stringify({ runs: [canvasTaskRun(liveTask.taskId, "run_root_task")] }), { status: 200 });
      }
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
    });

    render(<LiveDataProbe />);

    await waitFor(() => expect(readLiveDataProbe().tasks).toEqual([liveTask.taskId]));
    await waitFor(() => expect(readLiveDataProbe().runKeys).toEqual([liveTask.taskId]));
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url)).some((url) => url.includes("/generated-tasks"))).toBe(false);
    expect(readLiveDataProbe().generated).toEqual({});
  });

  it("loads Discovery generated task runs with a single bulk by-task request and zero individual run calls", async () => {
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
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({});
      }
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
    const byTaskCalls = calledUrls.filter((url) => url.startsWith("/v1/team/task-runs/by-task?"));
    const individualRunCalls = calledUrls.filter((url) => /^\/v1\/team\/tasks\/[^/]+\/runs$/.test(url));
    expect(byTaskCalls.length).toBeGreaterThanOrEqual(1);
    expect(individualRunCalls).toHaveLength(0);
  });

  it("loads Discovery generated child catalogs without putting generated Tasks in root live state", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const rootTask = mockTeamTasks[0]!;
    const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
    const generatedRun = canvasTaskRun("task_generated_vultr", "run_generated_vultr", "running");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [rootTask, mockDiscoveryRootTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({
          [rootTask.taskId]: [canvasTaskRun(rootTask.taskId, "run_root_task")],
          [mockDiscoveryRootTask.taskId]: [canvasTaskRun(mockDiscoveryRootTask.taskId, "run_discovery_root")],
          task_generated_vultr: [generatedRun],
          task_generated_hetzner: [canvasTaskRun("task_generated_hetzner", "run_generated_hetzner")],
        });
      }
      if (url === "/v1/team/task-runs/run_generated_vultr") {
        return new Response(JSON.stringify({ message: "not polled in this test" }), { status: 404 });
      }
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
    });

    render(<LiveDataProbe openDiscoveryTaskIds={[mockDiscoveryRootTask.taskId]} />);

    await waitFor(() => {
      expect(readLiveDataProbe().generated[mockDiscoveryRootTask.taskId]).toEqual([
        "task_generated_vultr",
        "task_generated_hetzner",
      ]);
    });
    const probe = readLiveDataProbe();
    expect(probe.tasks).toEqual([rootTask.taskId, mockDiscoveryRootTask.taskId]);
    expect(probe.runKeys).toEqual([
      mockDiscoveryRootTask.taskId,
      "task_generated_hetzner",
      "task_generated_vultr",
      rootTask.taskId,
    ]);
    expect(probe.summaries[mockDiscoveryRootTask.taskId]).toEqual(expect.objectContaining({
      generatedTaskCount: 2,
      activeGeneratedTaskCount: 1,
      staleGeneratedTaskCount: 1,
      runningGeneratedRunCount: 1,
      failedDispatchCount: 0,
    }));
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(
      `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks?view=summary`,
    );
  });

  it("continues polling delayed Discovery generated catalogs after the root run completes", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
    const runningDiscoveryRun = canvasTaskRun(mockDiscoveryRootTask.taskId, "run_delayed_discovery", "running");
    const completedDiscoveryRun = canvasTaskRun(mockDiscoveryRootTask.taskId, "run_delayed_discovery", "completed");
    let rootRunCompleted = false;
    let generatedCatalogRequests = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        generatedCatalogRequests += 1;
        return new Response(JSON.stringify({
          tasks: generatedCatalogRequests >= 5 ? generatedTasks : [],
        }), { status: 200 });
      }
      if (url.startsWith("/v1/team/tasks")) {
        return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({
          [mockDiscoveryRootTask.taskId]: [rootRunCompleted ? completedDiscoveryRun : runningDiscoveryRun],
        });
      }
      if (url === `/v1/team/task-runs/${runningDiscoveryRun.runId}`) {
        rootRunCompleted = true;
        return new Response(JSON.stringify(completedDiscoveryRun), { status: 200 });
      }
      if (url === `/v1/team/task-runs/${runningDiscoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts?view=dispatch-diagnostics`) {
        return new Response(JSON.stringify({ attempts: [] }), { status: 200 });
      }
      if (url === `/v1/team/task-runs/${completedDiscoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts?view=dispatch-diagnostics`) {
        return new Response(JSON.stringify({ attempts: [] }), { status: 200 });
      }
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
    });

    render(<LiveDataProbe openDiscoveryTaskIds={[mockDiscoveryRootTask.taskId]} />);

    await waitFor(() => expect(readLiveDataProbe().tasks).toEqual([mockDiscoveryRootTask.taskId]));
    await waitFor(() => {
      expect(readLiveDataProbe().generated[mockDiscoveryRootTask.taskId]).toEqual([
        "task_generated_vultr",
        "task_generated_hetzner",
      ]);
    }, { timeout: 7000 });
    expect(generatedCatalogRequests).toBeGreaterThanOrEqual(5);
  }, 10000);

  it("loads blocked Discovery dispatch diagnostics from the latest root attempt metadata", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
    const discoveryRun = canvasTaskRun(mockDiscoveryRootTask.taskId, "run_discovery_root");
    const discoveryAttempt = discoveryRootAttempt([
      {
        itemId: "vultr",
        status: "created",
        generatedTaskId: "task_generated_vultr",
        createdAt: "2026-05-31T00:05:10.000Z",
      },
      {
        itemId: "digitalocean",
        status: "blocked",
        error: "dispatcher output parse error: invalid JSON",
        createdAt: "2026-05-31T00:05:11.000Z",
      },
    ]);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({ [mockDiscoveryRootTask.taskId]: [discoveryRun] });
      }
      if (url === `/v1/team/task-runs/${discoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts?view=dispatch-diagnostics`) {
        return new Response(JSON.stringify({ attempts: [discoveryAttempt] }), { status: 200 });
      }
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
    });

    render(<LiveDataProbe openDiscoveryTaskIds={[mockDiscoveryRootTask.taskId]} />);

    await waitFor(() => {
      expect(readLiveDataProbe().summaries[mockDiscoveryRootTask.taskId]?.failedDispatchCount).toBe(1);
    });
    const probe = readLiveDataProbe();
    expect(probe.diagnostics[mockDiscoveryRootTask.taskId]).toEqual([
      expect.objectContaining({
        itemId: "digitalocean",
        error: "dispatcher output parse error: invalid JSON",
      }),
    ]);
    expect(probe.diagnostics[mockDiscoveryRootTask.taskId]?.some((item) => item.itemId === "vultr")).toBe(false);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(
      `/v1/team/task-runs/${discoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts?view=dispatch-diagnostics`,
    );
  });

  it("shows Discovery dispatch progress stage from partial dispatch diagnostics", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const discoveryRun = canvasTaskRun(mockDiscoveryRootTask.taskId, "run_discovery_dispatching", "running");
    const discoveryAttempt = discoveryRootAttempt([
      {
        itemId: "vultr",
        status: "created",
        generatedTaskId: "task_generated_vultr",
        createdAt: "2026-05-31T00:05:10.000Z",
      },
      {
        itemId: "digitalocean",
        status: "blocked",
        error: "dispatcher output parse error: invalid JSON",
        createdAt: "2026-05-31T00:05:11.000Z",
      },
    ]);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({ [mockDiscoveryRootTask.taskId]: [discoveryRun] });
      }
      if (url === `/v1/team/task-runs/${discoveryRun.runId}`) {
        return new Response(JSON.stringify(discoveryRun), { status: 200 });
      }
      if (url === `/v1/team/task-runs/${discoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts?view=dispatch-diagnostics`) {
        return new Response(JSON.stringify({ attempts: [discoveryAttempt] }), { status: 200 });
      }
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
      const refreshedNode = container.querySelector(`[data-task-id="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(refreshedNode).toHaveAttribute("data-discovery-stage", "dispatching");
      expect(within(refreshedNode!).getByText("Dispatch")).toBeInTheDocument();
      expect(within(refreshedNode!).getByText("2 processed")).toBeInTheDocument();
    });
    const stage = panel.querySelector(`[data-discovery-stage-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
    expect(stage).toHaveAttribute("data-discovery-stage", "dispatching");
    expect(stage).toHaveTextContent("Dispatch");
    expect(stage).toHaveTextContent("2 processed");
    expect(stage).toHaveTextContent("1 blocked");
  });

  it("shows Discovery auto-run and cancellation stages without confusing them with failure", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
    const activeDiscoveryRun = canvasTaskRun(mockDiscoveryRootTask.taskId, "run_discovery_auto", "running");
    const cancelledDiscoveryRun = canvasTaskRun(mockDiscoveryRootTask.taskId, "run_discovery_auto", "cancelled");
    const generatedRun = generatedCanvasTaskRun("task_generated_vultr", "run_generated_vultr", {
      status: "running",
      discoveryTaskId: mockDiscoveryRootTask.taskId,
      discoveryRunId: activeDiscoveryRun.runId,
      sourceItemId: "vultr",
    });
    let cancelled = false;
    let taskCatalogRequests = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") {
        taskCatalogRequests += 1;
        if (taskCatalogRequests >= 2) cancelled = true;
        return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
      }
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({
          [mockDiscoveryRootTask.taskId]: [cancelled ? cancelledDiscoveryRun : activeDiscoveryRun],
          task_generated_vultr: [generatedRun],
        });
      }
      if (url === `/v1/team/task-runs/${activeDiscoveryRun.runId}`) {
        return new Response(JSON.stringify(activeDiscoveryRun), { status: 200 });
      }
      if (url === `/v1/team/task-runs/${generatedRun.runId}`) {
        return new Response(JSON.stringify(generatedRun), { status: 200 });
      }
      if (url === `/v1/team/task-runs/${activeDiscoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts?view=dispatch-diagnostics`) {
        return new Response(JSON.stringify({ attempts: [] }), { status: 200 });
      }
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
      const stage = panel.querySelector(`[data-discovery-stage-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(stage).toHaveAttribute("data-discovery-stage", "auto-running");
      expect(stage).toHaveTextContent("Auto-run");
      expect(stage).toHaveTextContent("1 running");
    });

    fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

    await waitFor(() => {
      const stage = panel.querySelector(`[data-discovery-stage-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(stage).toHaveAttribute("data-discovery-stage", "cancelled");
      expect(stage).toHaveTextContent("Cancelled");
      expect(stage).not.toHaveTextContent("Failed");
    });
  });

  it("clears stale generated child run status while a new Discovery root run is active", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const activeDiscoveryRun = canvasTaskRun(mockDiscoveryRootTask.taskId, "run_current_discovery", "running");
    const generatedTasks = mockDiscoveryGeneratedTasks
      .filter((task) => !task.archived)
      .map((task) => ({
        ...task,
        generatedSource: task.generatedSource
          ? { ...task.generatedSource, latestDiscoveryRunId: "run_previous_discovery" }
          : task.generatedSource,
      }));
    const oldGeneratedRun = generatedCanvasTaskRun("task_generated_vultr", "run_previous_vultr", {
      discoveryTaskId: mockDiscoveryRootTask.taskId,
      discoveryRunId: "run_previous_discovery",
      sourceItemId: "vultr",
    });

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({
          [mockDiscoveryRootTask.taskId]: [activeDiscoveryRun],
          task_generated_vultr: [oldGeneratedRun],
        });
      }
      if (url === `/v1/team/task-runs/${activeDiscoveryRun.runId}`) {
        return new Response(JSON.stringify(activeDiscoveryRun), { status: 200 });
      }
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
    const vultrCard = getGeneratedCard(panel, "task_generated_vultr");
    expect(vultrCard).toHaveAttribute("data-generated-run-status", "none");
    expect(vultrCard).toHaveAttribute("data-generated-run-scope", "pending-current-discovery");
    expect(vultrCard).toHaveAttribute("data-generated-visual-state", "queued");
    expect(vultrCard).not.toHaveTextContent("已完成");
    expect(vultrCard.querySelector('[data-generated-action="observe-run"]')).toBeNull();
  });

  it("shows channel-set generated child runs even when generated catalog came from an older Discovery run", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const activeDiscoveryRun = canvasTaskRun(mockDiscoveryRootTask.taskId, "run_from_channel_set", "running");
    activeDiscoveryRun.source = {
      type: "canvas-task",
      taskId: mockDiscoveryRootTask.taskId,
      discoveryChannelSetId: "dcs_selected_channels",
    };
    const generatedTasks = mockDiscoveryGeneratedTasks
      .filter((task) => !task.archived)
      .map((task) => ({
        ...task,
        generatedSource: task.generatedSource
          ? { ...task.generatedSource, itemStatus: "active", latestDiscoveryRunId: "run_previous_discovery" }
          : task.generatedSource,
      }));
    const selectedGeneratedTask = generatedTasks[0]!;
    const unselectedGeneratedTask = generatedTasks[1]!;
    const channelSet: TeamDiscoveryChannelSet = {
      schemaVersion: "team/discovery-channel-set-1",
      channelSetId: "dcs_selected_channels",
      sourceDiscoveryTaskId: mockDiscoveryRootTask.taskId,
      title: "精选渠道",
      items: [{
        generatedTaskId: selectedGeneratedTask.taskId,
        sourceItemId: selectedGeneratedTask.generatedSource!.sourceItemId,
        title: selectedGeneratedTask.title,
        itemPayload: { ...selectedGeneratedTask.generatedSource!.itemPayload },
        workUnitSnapshot: selectedGeneratedTask.workUnit,
        workUnitMode: selectedGeneratedTask.generatedSource!.workUnitMode,
        latestDiscoveryRunId: selectedGeneratedTask.generatedSource!.latestDiscoveryRunId,
        latestDiscoveryAttemptId: selectedGeneratedTask.generatedSource!.latestDiscoveryAttemptId,
        latestDiscoveredAt: selectedGeneratedTask.generatedSource!.latestDiscoveredAt,
      }],
      archived: false,
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
    };
    const selectedGeneratedRun = generatedCanvasTaskRun(selectedGeneratedTask.taskId, "run_selected_channel_child", {
      status: "running",
      discoveryTaskId: mockDiscoveryRootTask.taskId,
      discoveryRunId: activeDiscoveryRun.runId,
      sourceItemId: selectedGeneratedTask.generatedSource!.sourceItemId,
    });

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/discovery-channel-sets`) {
        return new Response(JSON.stringify({ channelSets: [channelSet] }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({
          [mockDiscoveryRootTask.taskId]: [activeDiscoveryRun],
          [selectedGeneratedTask.taskId]: [selectedGeneratedRun],
        });
      }
      if (url === `/v1/team/task-runs/${activeDiscoveryRun.runId}`) {
        return new Response(JSON.stringify(activeDiscoveryRun), { status: 200 });
      }
      if (url === `/v1/team/task-runs/${selectedGeneratedRun.runId}`) {
        return new Response(JSON.stringify(selectedGeneratedRun), { status: 200 });
      }
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
      expect(within(panel).getByText("1 running · 0 queued · 0 done")).toBeInTheDocument();
    });
    const selectedCard = getGeneratedCard(panel, selectedGeneratedTask.taskId);
    expect(selectedCard).toHaveAttribute("data-generated-run-status", "running");
    expect(selectedCard).toHaveAttribute("data-generated-run-scope", "current");
    expect(selectedCard).toHaveAttribute("data-generated-visual-state", "running");
    const unselectedCard = getGeneratedCard(panel, unselectedGeneratedTask.taskId);
    expect(unselectedCard).toHaveAttribute("data-generated-run-status", "none");
    expect(unselectedCard).toHaveAttribute("data-generated-run-scope", "current");
    expect(unselectedCard).toHaveAttribute("data-generated-visual-state", "idle");
  });

  it("keeps Discovery subcanvas order stable: running first, then completed by finished time descending", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const baseGenerated = mockDiscoveryGeneratedTasks.filter((task) => !task.archived)[0]!;
    const makeGenerated = (taskId: string, itemId: string, title: string): TeamCanvasTask => ({
      ...baseGenerated,
      taskId,
      title,
      workUnit: { ...baseGenerated.workUnit, title },
      generatedSource: {
        ...baseGenerated.generatedSource!,
        sourceItemId: itemId,
        itemPayload: { id: itemId, title },
        latestDiscoveryRunId: "run_current_discovery",
        latestDiscoveredAt: "2026-05-31T00:00:00.000Z",
      },
    });
    const alpha = makeGenerated("task_generated_alpha", "alpha", "Alpha");
    const beta = makeGenerated("task_generated_beta", "beta", "Beta");
    const gamma = makeGenerated("task_generated_gamma", "gamma", "Gamma");
    const rootRun = canvasTaskRun(mockDiscoveryRootTask.taskId, "run_current_discovery", "completed");
    const runsByTaskId: Record<string, TeamRunState[]> = {
      [alpha.taskId]: [generatedCanvasTaskRun(alpha.taskId, "run_alpha", {
        discoveryTaskId: mockDiscoveryRootTask.taskId,
        discoveryRunId: "run_current_discovery",
        sourceItemId: "alpha",
        finishedAt: "2026-05-31T00:03:00.000Z",
      })],
      [beta.taskId]: [generatedCanvasTaskRun(beta.taskId, "run_beta", {
        discoveryTaskId: mockDiscoveryRootTask.taskId,
        discoveryRunId: "run_current_discovery",
        sourceItemId: "beta",
        finishedAt: "2026-05-31T00:05:00.000Z",
      })],
      [gamma.taskId]: [generatedCanvasTaskRun(gamma.taskId, "run_gamma", {
        status: "running",
        discoveryTaskId: mockDiscoveryRootTask.taskId,
        discoveryRunId: "run_current_discovery",
        sourceItemId: "gamma",
        createdAt: "2026-05-31T00:01:00.000Z",
      })],
    };

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: [alpha, beta, gamma] }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({ [mockDiscoveryRootTask.taskId]: [rootRun], ...runsByTaskId });
      }
      if (url === "/v1/team/task-runs/run_gamma") {
        return new Response(JSON.stringify(runsByTaskId[gamma.taskId]![0]), { status: 200 });
      }
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
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
    await waitFor(() => {
      expect(Array.from(panel.querySelectorAll("[data-generated-task-id]")).map((node) => node.getAttribute("data-generated-task-id"))).toEqual([
        gamma.taskId,
        beta.taskId,
        alpha.taskId,
      ]);
    });
    expect(within(panel).getByText("generated Task 网格")).toBeInTheDocument();
    expect(within(panel).getByText("1 running · 0 queued · 2 done")).toBeInTheDocument();
    expect(within(panel).queryByText("正在运行")).toBeNull();
    expect(within(panel).queryByText("执行队列")).toBeNull();
  });

  it("keeps the Refresh Task button idle while a silent live task refresh is in flight", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    let taskRequests = 0;
    let resolveDelayedTasks: ((response: Response) => void) | null = null;
    const delayedTasks = new Promise<Response>((resolve) => {
      resolveDelayedTasks = resolve;
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") {
        taskRequests += 1;
        if (taskRequests >= 2) return delayedTasks;
        return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
      }
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/runs`) {
        return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      }
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
    });

    render(<LiveRefreshProbe />);
    await waitFor(() => expect(taskRequests).toBe(1));
    expect(screen.getByTestId("live-refreshing")).toHaveTextContent("false");

    fireEvent.click(screen.getByRole("button", { name: "silent" }));
    await waitFor(() => expect(taskRequests).toBe(2));
    expect(screen.getByTestId("live-refreshing")).toHaveTextContent("false");

    resolveDelayedTasks!(new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 }));
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("releases the Refresh Task button before open Discovery subcanvas refresh finishes", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived).map(generatedSummary);
    const delayedGeneratedRunSummary = deferred<Response>();
    let manualRefreshStarted = false;
    let delayedGeneratedRunSummaryStarted = false;
    let initialGeneratedRunSummaryRequests = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        const params = new URL(url, "http://localhost").searchParams;
        const taskIds = (params.get("taskIds") ?? "").split(",");
        if (manualRefreshStarted && taskIds.includes("task_generated_vultr")) {
          delayedGeneratedRunSummaryStarted = true;
          return delayedGeneratedRunSummary.promise;
        }
        if (taskIds.includes("task_generated_vultr")) {
          initialGeneratedRunSummaryRequests += 1;
        }
        return byTaskRunsResponse({});
      }
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
    });

    render(<LiveRefreshProbe openDiscoveryTaskIds={[mockDiscoveryRootTask.taskId]} />);
    await waitFor(() => expect(initialGeneratedRunSummaryRequests).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByTestId("live-refreshing")).toHaveTextContent("false"));

    manualRefreshStarted = true;
    fireEvent.click(screen.getByRole("button", { name: "manual" }));
    await waitFor(() => expect(delayedGeneratedRunSummaryStarted).toBe(true));
    await waitFor(() => expect(screen.getByTestId("live-refreshing")).toHaveTextContent("false"));

    delayedGeneratedRunSummary.resolve(byTaskRunsResponse({}));
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("passes live Discovery summary into the root canvas without rendering generated children as root cards", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const rootTask = mockTeamTasks[0]!;
    const generatedTasks = [...mockDiscoveryGeneratedTasks.filter((task) => !task.archived)].reverse();
    const generatedRun = canvasTaskRun(generatedTasks[0]!.taskId, "run_generated_vultr", "running");
    const discoveryRun = canvasTaskRun(mockDiscoveryRootTask.taskId, "run_discovery_root");
    const discoveryAttempt = discoveryRootAttempt([
      {
        itemId: "vultr",
        status: "created",
        generatedTaskId: "task_generated_vultr",
        createdAt: "2026-05-31T00:05:10.000Z",
      },
      {
        itemId: "digitalocean",
        status: "blocked",
        error: "dispatcher output parse error: invalid JSON",
        createdAt: "2026-05-31T00:05:11.000Z",
      },
    ]);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [rootTask, mockDiscoveryRootTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({
          [rootTask.taskId]: [canvasTaskRun(rootTask.taskId, "run_root_task")],
          [mockDiscoveryRootTask.taskId]: [discoveryRun],
          task_generated_vultr: [generatedRun],
          task_generated_hetzner: [canvasTaskRun("task_generated_hetzner", "run_generated_hetzner")],
        });
      }
      if (url === `/v1/team/task-runs/${discoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts?view=dispatch-diagnostics`) {
        return new Response(JSON.stringify({ attempts: [discoveryAttempt] }), { status: 200 });
      }
      if (url === "/v1/team/task-runs/run_generated_vultr") {
        return new Response(JSON.stringify({ message: "not polled in this test" }), { status: 404 });
      }
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
    });

    const { container } = render(<App />);

    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });
    expect(within(atlas).queryByRole("button", { name: "核查 Vultr 公开证据" })).toBeNull();
    expect(within(atlas).queryByRole("button", { name: "核查 Hetzner 公开证据" })).toBeNull();

    fireEvent.click(discoveryNode);
    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));

    await waitFor(() => expect(within(discoveryNode).getByText("2 items")).toBeInTheDocument());
    await waitFor(() => expect(discoveryNode).toHaveAttribute("data-discovery-failed-dispatch-count", "1"));
    expect(within(discoveryNode).getByText("1 active")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 stale")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 running")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 blocked")).toBeInTheDocument();
    const panel = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
    expect(panel).toBeTruthy();
    const vultrCard = panel!.querySelector('[data-generated-task-id="task_generated_vultr"]') as HTMLElement | null;
    const cards = Array.from(panel!.querySelectorAll<HTMLElement>("[data-generated-task-id]"));
    expect(cards[0]).toHaveAttribute("data-generated-task-id", "task_generated_vultr");
    expect(vultrCard).toHaveAttribute("data-generated-item-status", "active");
    expect(vultrCard).toHaveAttribute("data-generated-workunit-mode", "managed");
    expect(vultrCard).toHaveAttribute("data-generated-run-status", "running");
    expect(vultrCard).toHaveAttribute("data-generated-visual-state", "running");
    const diagnostics = panel!.querySelector(`[data-discovery-dispatch-diagnostics-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
    expect(diagnostics).toBeTruthy();
    expect(diagnostics).toHaveAttribute("data-dispatch-blocked-count", "1");
    const blockedItem = diagnostics!.querySelector('[data-dispatch-item-id="digitalocean"]') as HTMLElement | null;
    expect(blockedItem).toBeTruthy();
    expect(blockedItem).toHaveTextContent("dispatcher output parse error: invalid JSON");
    expect(diagnostics!.querySelector('[data-dispatch-item-id="vultr"]')).toBeNull();
  });

  it("keeps old Discovery attempt metadata safe with zero failed dispatch diagnostics", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
    const discoveryRun = canvasTaskRun(mockDiscoveryRootTask.taskId, "run_discovery_root");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/runs`) {
        return new Response(JSON.stringify({ runs: [discoveryRun] }), { status: 200 });
      }
      if (url === `/v1/team/task-runs/${discoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts?view=dispatch-diagnostics`) {
        return new Response(JSON.stringify({ attempts: [discoveryRootAttempt()] }), { status: 200 });
      }
      if (/^\/v1\/team\/tasks\/[^/]+\/runs$/.test(url)) {
        return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      }
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });
    await waitFor(() => expect(discoveryNode).toHaveAttribute("data-discovery-failed-dispatch-count", "0"));
    expect(within(discoveryNode).queryByText(/blocked|dispatch failed/i)).toBeNull();

    fireEvent.click(discoveryNode);
    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
    const panel = await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    expect(panel.querySelector("[data-discovery-dispatch-diagnostics-for]")).toBeNull();
    expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(1);
  });

  it("opens a live active generated Task observer from the Discovery subcanvas without root Task state ownership", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const rootTask = mockTeamTasks[0]!;
    const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
    let generatedRun = canvasTaskRun("task_generated_vultr", "run_generated_vultr", "running");
    const generatedRunAttempt = generatedAttempt("task_generated_vultr", "attempt_run_generated_vultr");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [rootTask, mockDiscoveryRootTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({
          [rootTask.taskId]: [canvasTaskRun(rootTask.taskId, "run_root_task")],
          [mockDiscoveryRootTask.taskId]: [canvasTaskRun(mockDiscoveryRootTask.taskId, "run_discovery_root")],
          task_generated_vultr: [generatedRun],
          task_generated_hetzner: [canvasTaskRun("task_generated_hetzner", "run_generated_hetzner")],
        });
      }
      if (url === "/v1/team/task-runs/run_generated_vultr") {
        return new Response(JSON.stringify(generatedRun), { status: 200 });
      }
      if (url === "/v1/team/task-runs/run_generated_vultr/cancel") {
        generatedRun = canvasTaskRun("task_generated_vultr", "run_generated_vultr", "cancelled");
        return new Response(JSON.stringify(generatedRun), { status: 200 });
      }
      if (url === "/v1/team/task-runs/run_generated_vultr/tasks/task_generated_vultr/attempts") {
        return new Response(JSON.stringify({ attempts: [generatedRunAttempt] }), { status: 200 });
      }
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });
    fireEvent.click(discoveryNode);
    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));

    const panel = await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    const vultrCard = panel.querySelector('[data-generated-task-id="task_generated_vultr"]') as HTMLElement | null;
    expect(vultrCard).toHaveAttribute("data-generated-run-status", "running");
    const runButton = vultrCard!.querySelector('[data-generated-action="run"]') as HTMLButtonElement | null;
    const cancelButton = vultrCard!.querySelector('[data-generated-action="cancel"]') as HTMLButtonElement | null;
    const observeButton = vultrCard!.querySelector('[data-generated-action="observe-run"]') as HTMLButtonElement | null;
    expect(runButton).toBeDisabled();
    expect(runButton).toHaveTextContent("运行中");
    expect(cancelButton).toBeTruthy();
    expect(cancelButton).toBeEnabled();
    expect(observeButton).toBeTruthy();

    fireEvent.click(observeButton!);
    const observerPanel = await waitFor(() => {
      const node = container.querySelector('[data-generated-observer-task-id="task_generated_vultr"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    expect(observerPanel).toHaveAttribute("data-generated-observer-run-id", "run_generated_vultr");
    expect(within(atlas).queryByRole("button", { name: "核查 Vultr 公开证据" })).toBeNull();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(
      "/v1/team/task-runs/run_generated_vultr/tasks/task_generated_vultr/attempts",
    );

    fireEvent.click(cancelButton!);
    await waitFor(() => {
      expect(getGeneratedCard(panel, "task_generated_vultr")).toHaveAttribute("data-generated-run-status", "cancelled");
    });
    const cancelCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url) === "/v1/team/task-runs/run_generated_vultr/cancel");
    expect(cancelCall?.[1]).toMatchObject({ method: "POST" });
  });

  it("resets a live generated Task through the existing reset endpoint without root Task ownership", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
    const resetTask = resetGeneratedSnapshot(generatedTasks.find((task) => task.taskId === "task_generated_hetzner")!);
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
      }
      if (url === "/v1/team/tasks/task_generated_hetzner/generated-workunit/reset") {
        expect(init).toMatchObject({ method: "POST" });
        return new Response(JSON.stringify({ task: resetTask, warnings: [] }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({});
      }
      if (/^\/v1\/team\/tasks\/[^/]+\/runs$/.test(url)) {
        return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ connections: [], dependencies: [], sourceNodes: [] }), { status: 200 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });
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

    revealStaleGeneratedTasks(panel);
    const hetznerCard = getGeneratedCard(panel, "task_generated_hetzner");
    fireEvent.click(hetznerCard.querySelector('[data-generated-action="reset-workunit"]')!);

    await waitFor(() => {
      const refreshedCard = getGeneratedCard(panel, "task_generated_hetzner");
      expect(within(refreshedCard).getByText(resetTask.title)).toBeInTheDocument();
      expect(refreshedCard).toHaveAttribute("data-generated-workunit-mode", "managed");
    });
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(
      "/v1/team/tasks/task_generated_hetzner/generated-workunit/reset",
    );
    expect(within(atlas).queryByRole("button", { name: resetTask.title })).toBeNull();
  });

  it("archives a live generated Task through the existing archive endpoint without root Task ownership", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
    const vultrTask = generatedTasks.find((task) => task.taskId === "task_generated_vultr")!;
    const archivedVultrTask: TeamCanvasTask = {
      ...vultrTask,
      archived: true,
      status: "archived",
      updatedAt: "2026-05-31T00:20:00.000Z",
    };
    const discoveryRun = canvasTaskRun(mockDiscoveryRootTask.taskId, "run_discovery_root");
    const discoveryAttempt = discoveryRootAttempt([
      {
        itemId: "vultr",
        status: "created",
        generatedTaskId: "task_generated_vultr",
        createdAt: "2026-05-31T00:05:10.000Z",
      },
      {
        itemId: "digitalocean",
        status: "blocked",
        error: "dispatcher output parse error: invalid JSON",
        createdAt: "2026-05-31T00:05:11.000Z",
      },
    ]);
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({ [mockDiscoveryRootTask.taskId]: [discoveryRun] });
      }
      if (url === `/v1/team/task-runs/${discoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts?view=dispatch-diagnostics`) {
        return new Response(JSON.stringify({ attempts: [discoveryAttempt] }), { status: 200 });
      }
      if (url === "/v1/team/tasks/task_generated_vultr/archive") {
        expect(init).toMatchObject({ method: "POST" });
        return new Response(JSON.stringify({ task: archivedVultrTask, warnings: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ connections: [], dependencies: [], sourceNodes: [] }), { status: 200 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });
    fireEvent.click(discoveryNode);
    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
    await waitFor(() => expect(within(discoveryNode).getByText("2 items")).toBeInTheDocument());
    await waitFor(() => expect(discoveryNode).toHaveAttribute("data-discovery-failed-dispatch-count", "1"));
    const panel = await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(1);
    const rootTaskFetchCountBeforeArchive = vi.mocked(fetch).mock.calls
      .filter(([url]) => String(url) === "/v1/team/tasks").length;

    fireEvent.click(getGeneratedCard(panel, "task_generated_vultr").querySelector('[data-generated-action="archive"]')!);
    const confirm = await waitFor(() => {
      const node = panel.querySelector('[data-generated-archive-confirm-for="task_generated_vultr"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "确认归档" }));

    await waitFor(() => {
      expect(panel.querySelector('[data-generated-task-id="task_generated_vultr"]')).toBeNull();
      expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(0);
    });
    revealStaleGeneratedTasks(panel);
    expect(getGeneratedCard(panel, "task_generated_hetzner")).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(
      "/v1/team/tasks/task_generated_vultr/archive",
    );
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/v1/team/tasks")).toHaveLength(rootTaskFetchCountBeforeArchive);
    expect(within(discoveryNode).getByText("1 items")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("0 active")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 stale")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 blocked")).toBeInTheDocument();
    expect(within(atlas).queryByRole("button", { name: "核查 Vultr 公开证据" })).toBeNull();
    expect(within(atlas).queryByRole("button", { name: "核查 Hetzner 公开证据" })).toBeNull();
  });

  it("keeps Discovery summary aligned with refreshed generated catalog when archive resolves after refresh", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const initialGeneratedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
    const vultrTask = initialGeneratedTasks.find((task) => task.taskId === "task_generated_vultr")!;
    const archivedVultrTask: TeamCanvasTask = {
      ...vultrTask,
      archived: true,
      status: "archived",
      updatedAt: "2026-05-31T00:21:00.000Z",
    };
    const scalewayTask: TeamCanvasTask = {
      ...vultrTask,
      taskId: "task_generated_scaleway",
      title: "核查 Scaleway 公开证据",
      createdAt: "2026-05-31T00:10:00.000Z",
      updatedAt: "2026-05-31T00:10:00.000Z",
      generatedSource: {
        ...vultrTask.generatedSource!,
        sourceItemId: "scaleway",
        itemStatus: "active",
        itemPayload: { id: "scaleway", title: "Scaleway", type: "cloud-provider" },
        latestDiscoveredAt: "2026-05-31T00:10:00.000Z",
      },
      workUnit: {
        ...vultrTask.workUnit,
        title: "核查 Scaleway 公开证据",
        input: { text: "核查 Scaleway 的官网、产品和公开证据。" },
      },
    };
    const refreshedGeneratedTasks = [...initialGeneratedTasks, scalewayTask];
    const archiveResponse = deferred<Response>();
    const discoveryRun = canvasTaskRun(mockDiscoveryRootTask.taskId, "run_discovery_root");
    const discoveryAttempt = discoveryRootAttempt([
      {
        itemId: "digitalocean",
        status: "blocked",
        error: "dispatcher output parse error: invalid JSON",
        createdAt: "2026-05-31T00:05:11.000Z",
      },
    ]);
    let showRefreshedGeneratedCatalog = false;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({
          tasks: showRefreshedGeneratedCatalog ? refreshedGeneratedTasks : initialGeneratedTasks,
        }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({ [mockDiscoveryRootTask.taskId]: [discoveryRun] });
      }
      if (url === `/v1/team/task-runs/${discoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts?view=dispatch-diagnostics`) {
        return new Response(JSON.stringify({ attempts: [discoveryAttempt] }), { status: 200 });
      }
      if (url === "/v1/team/tasks/task_generated_vultr/archive") {
        expect(init).toMatchObject({ method: "POST" });
        return archiveResponse.promise;
      }
      return new Response(JSON.stringify({ connections: [], dependencies: [], sourceNodes: [] }), { status: 200 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });

    fireEvent.click(discoveryNode);
    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
    await waitFor(() => expect(within(discoveryNode).getByText("2 items")).toBeInTheDocument());
    expect(within(discoveryNode).getByText("1 active")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 stale")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 blocked")).toBeInTheDocument();

    const panel = await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    await waitFor(() => {
      expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(1);
    });

    fireEvent.click(getGeneratedCard(panel, "task_generated_vultr").querySelector('[data-generated-action="archive"]')!);
    const confirm = await waitFor(() => {
      const node = panel.querySelector('[data-generated-archive-confirm-for="task_generated_vultr"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "确认归档" }));

    showRefreshedGeneratedCatalog = true;
    fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

    await waitFor(() => {
      expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(2);
      expect(getGeneratedCard(panel, "task_generated_scaleway")).toBeTruthy();
      expect(within(discoveryNode).getByText("3 items")).toBeInTheDocument();
    });

    archiveResponse.resolve(new Response(JSON.stringify({ task: archivedVultrTask, warnings: [] }), { status: 200 }));

    await waitFor(() => {
      expect(panel.querySelector('[data-generated-task-id="task_generated_vultr"]')).toBeNull();
      expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(1);
      expect(getGeneratedCard(panel, "task_generated_scaleway")).toBeTruthy();
      expect(within(discoveryNode).getByText("2 items")).toBeInTheDocument();
      expect(within(discoveryNode).getByText("1 active")).toBeInTheDocument();
      expect(within(discoveryNode).getByText("1 stale")).toBeInTheDocument();
      expect(within(discoveryNode).getByText("1 blocked")).toBeInTheDocument();
    });
    expect(within(atlas).queryByRole("button", { name: "核查 Scaleway 公开证据" })).toBeNull();
    expect(within(atlas).queryByRole("button", { name: "核查 Vultr 公开证据" })).toBeNull();
    expect(within(atlas).queryByRole("button", { name: "核查 Hetzner 公开证据" })).toBeNull();
  });

  it("keeps the Discovery subcanvas and generated catalog when live generated archive fails", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
      }
      if (url === "/v1/team/tasks/task_generated_vultr/archive") {
        return new Response(JSON.stringify({ error: { message: "archive failed" } }), { status: 500 });
      }
      if (/^\/v1\/team\/tasks\/[^/]+\/runs$/.test(url)) {
        return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ connections: [], dependencies: [], sourceNodes: [] }), { status: 200 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });
    fireEvent.click(discoveryNode);
    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
    await waitFor(() => expect(within(discoveryNode).getByText("2 items")).toBeInTheDocument());
    const panel = await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    await waitFor(() => {
      expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(1);
    });

    fireEvent.click(getGeneratedCard(panel, "task_generated_vultr").querySelector('[data-generated-action="archive"]')!);
    const confirm = await waitFor(() => {
      const node = panel.querySelector('[data-generated-archive-confirm-for="task_generated_vultr"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "确认归档" }));

    expect(await screen.findByText("archive failed")).toBeInTheDocument();
    expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
    expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(1);
    expect(getGeneratedCard(panel, "task_generated_vultr")).toBeTruthy();
    expect(within(discoveryNode).getByText("2 items")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 active")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 stale")).toBeInTheDocument();
    expect(within(atlas).queryByRole("button", { name: "核查 Vultr 公开证据" })).toBeNull();
  });

  it("keeps the Discovery subcanvas open and shows an error when generated reset fails", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
      }
      if (url === "/v1/team/tasks/task_generated_hetzner/generated-workunit/reset") {
        return new Response(JSON.stringify({ error: { message: "reset failed" } }), { status: 500 });
      }
      if (/^\/v1\/team\/tasks\/[^/]+\/runs$/.test(url)) {
        return new Response(JSON.stringify({ runs: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ connections: [], dependencies: [], sourceNodes: [] }), { status: 200 });
    });

    const { container } = render(<App />);
    const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
    const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });
    fireEvent.click(discoveryNode);
    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
    const panel = await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });

    revealStaleGeneratedTasks(panel);
    fireEvent.click(getGeneratedCard(panel, "task_generated_hetzner").querySelector('[data-generated-action="reset-workunit"]')!);

    expect(await screen.findByText("reset failed")).toBeInTheDocument();
    expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
    expect(getGeneratedCard(panel, "task_generated_hetzner")).toHaveAttribute("data-generated-workunit-mode", "customized");
    expect(within(atlas).queryByRole("button", { name: "核查 Hetzner 公开证据" })).toBeNull();
  });
});
