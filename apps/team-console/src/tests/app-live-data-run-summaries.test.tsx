import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useTeamConsoleLiveData } from "../app/use-team-console-live-data";
import type { TeamCanvasTask, TeamRunState } from "../api/team-types";
import {
  mockDiscoveryGeneratedTasks,
  mockDiscoveryRootTask,
  mockTeamTasks,
  resetMockTeamApiState,
} from "../fixtures/team-fixtures";
import {
  byTaskRunsResponse,
  canvasTaskRun,
  generatedSummary,
  noop,
  rootSummaryResponse,
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

type LiveReferenceSnapshot = {
  task: TeamCanvasTask | null;
  run: TeamRunState | null;
  generated: TeamCanvasTask | null;
  generatedHasWorkUnit: boolean;
};

let latestLiveReferenceSnapshot: LiveReferenceSnapshot | null = null;

function LiveReferenceProbe({
  openDiscoveryTaskIds = [],
  targetTaskId,
}: { openDiscoveryTaskIds?: string[]; targetTaskId?: string } = {}) {
  const liveData = useTeamConsoleLiveData({
    onApplyLiveTasks: noop,
    onApplyLiveSources: noop,
    onCloseBranches: noop,
    onResetContextUi: noop,
    selectedTaskId: null,
    openDiscoveryTaskIds,
  });
  const task = (targetTaskId ? liveData.tasks.find((candidate) => candidate.taskId === targetTaskId) : null)
    ?? liveData.tasks[0]
    ?? null;
  const run = task ? liveData.taskRunsByTaskId[task.taskId]?.[0] ?? null : null;
  const generated = Object.values(liveData.generatedTasksByDiscoveryTaskId).flat()
    .find((candidate) => candidate.taskId === "task_generated_vultr") ?? null;
  latestLiveReferenceSnapshot = {
    task,
    run,
    generated,
    generatedHasWorkUnit: Boolean((generated as Partial<TeamCanvasTask> | null)?.workUnit),
  };
  return (
    <div>
      <button type="button" onClick={() => void liveData.refreshLiveTasks()}>probe refresh</button>
      <button type="button" onClick={() => void liveData.ensureGeneratedTaskDetail("task_generated_vultr")}>ensure generated detail</button>
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

describe("App live data run summaries", () => {
  beforeEach(() => {
    resetMockTeamApiState();
    latestLiveReferenceSnapshot = null;
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("listTaskRunsByTaskIds([]) does not trigger a fetch call", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const liveTask = mockTeamTasks[0]!;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
      if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
    });

    render(<LiveDataProbe />);

    await waitFor(() => expect(readLiveDataProbe().tasks).toEqual([liveTask.taskId]));

    const byTaskUrls = vi.mocked(fetch).mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.startsWith("/v1/team/task-runs/by-task?"));
    expect(byTaskUrls).toHaveLength(1);
    const params = new URLSearchParams(byTaskUrls[0]!.split("?")[1]);
    expect(params.get("taskIds")).toBe(liveTask.taskId);
  });

  it("splits >100 taskIds into multiple bulk by-task requests and merges results", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const { TASK_RUNS_BY_TASK_IDS_CHUNK_SIZE } = await import("../api/team-api");
    const rootTask = mockTeamTasks[0]!;
    const discoveryTask = mockDiscoveryRootTask;
    const generatedTasks: TeamCanvasTask[] = [];
    for (let i = 0; i < TASK_RUNS_BY_TASK_IDS_CHUNK_SIZE + 5; i++) {
      const baseGen = mockDiscoveryGeneratedTasks[0]!;
      generatedTasks.push({
        ...baseGen,
        taskId: `task_gen_bulk_${i}`,
        title: `Generated ${i}`,
        workUnit: { ...baseGen.workUnit, title: `Generated ${i}` },
        generatedSource: {
          ...baseGen.generatedSource!,
          sourceItemId: `item_${i}`,
          itemPayload: { id: `item_${i}`, title: `Item ${i}` },
        },
      });
    }
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/console/root-summary") return rootSummaryResponse({ tasks: [rootTask, discoveryTask] });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [rootTask, discoveryTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${discoveryTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({});
      }
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
    });

    render(<LiveDataProbe openDiscoveryTaskIds={[discoveryTask.taskId]} />);

    await waitFor(() => {
      expect(readLiveDataProbe().generated[discoveryTask.taskId]).toHaveLength(TASK_RUNS_BY_TASK_IDS_CHUNK_SIZE + 5);
    });

    const byTaskUrls = vi.mocked(fetch).mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.startsWith("/v1/team/task-runs/by-task?"));
    expect(byTaskUrls.length).toBeGreaterThanOrEqual(2);
    const individualRunCalls = vi.mocked(fetch).mock.calls
      .map(([url]) => String(url))
      .filter((url) => /^\/v1\/team\/tasks\/[^/]+\/runs$/.test(url));
    expect(individualRunCalls).toHaveLength(0);

    const requestedTaskIds = new Set(
      byTaskUrls.flatMap((url) => new URLSearchParams(url.split("?")[1]).get("taskIds")?.split(",") ?? []),
    );
    expect([...requestedTaskIds].sort()).toEqual([...new Set([discoveryTask.taskId, ...generatedTasks.map((t) => t.taskId)])].sort());
  });

  it("keeps runsByTaskId state when >100 root+generated ids are loaded without N+1 fallback", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const { TASK_RUNS_BY_TASK_IDS_CHUNK_SIZE } = await import("../api/team-api");
    const rootTask = mockTeamTasks[0]!;
    const discoveryTask = mockDiscoveryRootTask;
    const generatedTasks: TeamCanvasTask[] = [];
    for (let i = 0; i < TASK_RUNS_BY_TASK_IDS_CHUNK_SIZE + 2; i++) {
      const baseGen = mockDiscoveryGeneratedTasks[0]!;
      generatedTasks.push({
        ...baseGen,
        taskId: `task_gen_state_${i}`,
        title: `Gen state ${i}`,
        workUnit: { ...baseGen.workUnit, title: `Gen state ${i}` },
        generatedSource: {
          ...baseGen.generatedSource!,
          sourceItemId: `item_state_${i}`,
          itemPayload: { id: `item_state_${i}`, title: `Item state ${i}` },
        },
      });
    }
    const runForRoot = canvasTaskRun(rootTask.taskId, "run_state_root");
    const runForDiscovery = canvasTaskRun(discoveryTask.taskId, "run_state_discovery");
    const runsByTaskId: Record<string, TeamRunState[]> = {
      [rootTask.taskId]: [runForRoot],
      [discoveryTask.taskId]: [runForDiscovery],
    };
    for (let i = 0; i < 3; i++) {
      const genId = generatedTasks[i]!.taskId;
      runsByTaskId[genId] = [canvasTaskRun(genId, `run_state_gen_${i}`, i === 0 ? "running" : "completed")];
    }
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [rootTask, discoveryTask] }), { status: 200 });
      if (url.startsWith(`/v1/team/tasks/${discoveryTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse(runsByTaskId);
      }
      if (url === "/v1/team/task-runs/run_state_gen_0") {
        return new Response(JSON.stringify(runsByTaskId[generatedTasks[0]!.taskId]![0]), { status: 200 });
      }
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
    });

    render(<LiveDataProbe openDiscoveryTaskIds={[discoveryTask.taskId]} />);

    await waitFor(() => {
      const probe = readLiveDataProbe();
      expect(probe.runKeys).toContain(rootTask.taskId);
      expect(probe.runKeys).toContain(discoveryTask.taskId);
      expect(probe.generated[discoveryTask.taskId]).toBeTruthy();
    });

    const individualRunCalls = vi.mocked(fetch).mock.calls
      .map(([url]) => String(url))
      .filter((url) => /^\/v1\/team\/tasks\/[^/]+\/runs$/.test(url));
    expect(individualRunCalls).toHaveLength(0);

    const probe = readLiveDataProbe();
    expect(probe.summaries[discoveryTask.taskId]).toBeTruthy();
    expect(probe.summaries[discoveryTask.taskId]!.generatedTaskCount).toBe(TASK_RUNS_BY_TASK_IDS_CHUNK_SIZE + 2);
  });

  it("keeps unchanged live Task, run summary, and full generated detail references stable across refresh", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const rootTask = mockTeamTasks[0]!;
    const rootRun = canvasTaskRun(rootTask.taskId, "run_reference_root", "completed");
    const fullGeneratedTask = mockDiscoveryGeneratedTasks.find((task) => task.taskId === "task_generated_vultr")!;
    const generatedTasks = [generatedSummary(fullGeneratedTask)];
    let rootSummaryRequests = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url.startsWith("/v1/team/console/root-summary")) {
        rootSummaryRequests += 1;
        return rootSummaryResponse({
          tasks: [{ ...rootTask }, { ...mockDiscoveryRootTask }],
          taskRunsByTaskId: { [rootTask.taskId]: [{ ...rootRun }] },
          taskCatalogVersion: "2026-06-03T00:00:00.000Z",
          taskRunSummaryVersion: "2026-06-03T00:00:10.000Z",
        });
      }
      if (url === "/v1/team/tasks") {
        return new Response(JSON.stringify({ tasks: [{ ...rootTask }, { ...mockDiscoveryRootTask }] }), { status: 200 });
      }
      if (url.startsWith(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`)) {
        return new Response(JSON.stringify({ tasks: generatedTasks.map((task) => ({ ...task })) }), { status: 200 });
      }
      if (url === "/v1/team/tasks/task_generated_vultr") {
        return new Response(JSON.stringify({ task: { ...fullGeneratedTask } }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse({ [rootTask.taskId]: [{ ...rootRun }] });
      }
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
    });

    render(<LiveReferenceProbe openDiscoveryTaskIds={[mockDiscoveryRootTask.taskId]} targetTaskId={rootTask.taskId} />);

    await waitFor(() => {
      expect(latestLiveReferenceSnapshot?.task?.taskId).toBe(rootTask.taskId);
      expect(latestLiveReferenceSnapshot?.run?.runId).toBe(rootRun.runId);
      expect(latestLiveReferenceSnapshot?.generated?.taskId).toBe("task_generated_vultr");
    });
    fireEvent.click(screen.getByRole("button", { name: "ensure generated detail" }));
    await waitFor(() => expect(latestLiveReferenceSnapshot?.generatedHasWorkUnit).toBe(true));
    const before = latestLiveReferenceSnapshot!;

    fireEvent.click(screen.getByRole("button", { name: "probe refresh" }));
    await waitFor(() => expect(rootSummaryRequests).toBe(2));
    await act(async () => { await Promise.resolve(); });

    expect(latestLiveReferenceSnapshot?.task).toBe(before.task);
    expect(latestLiveReferenceSnapshot?.run).toBe(before.run);
    expect(latestLiveReferenceSnapshot?.generated).toBe(before.generated);
    expect(latestLiveReferenceSnapshot?.generatedHasWorkUnit).toBe(true);
  });

  it("uses since cursors for live Task and run summary refresh without clearing empty increments", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const rootTask = mockTeamTasks[0]!;
    const rootRun = canvasTaskRun(rootTask.taskId, "run_incremental_root", "completed");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") {
        return new Response(JSON.stringify({
          tasks: [rootTask],
          deletedTaskIds: [],
          serverVersion: "2026-06-03T00:00:00.000Z",
        }), { status: 200 });
      }
      if (url === "/v1/team/tasks?since=2026-06-03T00%3A00%3A00.000Z") {
        return new Response(JSON.stringify({
          tasks: [],
          deletedTaskIds: [],
          serverVersion: "2026-06-03T00:00:00.000Z",
        }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        const params = new URLSearchParams(url.split("?")[1]);
        if (params.get("since") === "2026-06-03T00:00:10.000Z") {
          return byTaskRunsResponse({});
        }
        return new Response(JSON.stringify({
          runsByTaskId: { [rootTask.taskId]: [rootRun] },
          deletedRunIdsByTaskId: { [rootTask.taskId]: [] },
          serverVersion: "2026-06-03T00:00:10.000Z",
        }), { status: 200 });
      }
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
    });

    render(<LiveDataProbe />);

    await waitFor(() => expect(readLiveDataProbe().tasks).toEqual([rootTask.taskId]));
    await waitFor(() => expect(readLiveDataProbe().runKeys).toEqual([rootTask.taskId]));

    fireEvent.click(screen.getByRole("button", { name: "probe refresh" }));

    await waitFor(() => {
      const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
      expect(urls).toContain("/v1/team/tasks?since=2026-06-03T00%3A00%3A00.000Z");
      expect(urls.some((url) => (
        url.startsWith("/v1/team/task-runs/by-task?")
        && new URLSearchParams(url.split("?")[1]).get("since") === "2026-06-03T00:00:10.000Z"
      ))).toBe(true);
    });
    expect(readLiveDataProbe().tasks).toEqual([rootTask.taskId]);
    expect(readLiveDataProbe().runKeys).toEqual([rootTask.taskId]);
  });

  it("uses the root summary endpoint for live initial load and manual refresh", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const rootTask = mockTeamTasks[0]!;
    const rootRun = canvasTaskRun(rootTask.taskId, "run_root_summary_live", "completed");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/console/root-summary") {
        return new Response(JSON.stringify({
          tasks: [rootTask],
          deletedTaskIds: [],
          taskRunsByTaskId: { [rootTask.taskId]: [rootRun] },
          deletedRunIdsByTaskId: { [rootTask.taskId]: [] },
          sourceNodes: [],
          sourceConnections: [],
          taskConnections: [],
          taskDependencies: [],
          serverVersion: {
            taskCatalog: "2026-06-03T00:00:00.000Z",
            taskRunSummary: "2026-06-03T00:00:10.000Z",
          },
        }), { status: 200 });
      }
      if (url === "/v1/team/console/root-summary?taskSince=2026-06-03T00%3A00%3A00.000Z&runSince=2026-06-03T00%3A00%3A10.000Z") {
        return new Response(JSON.stringify({
          tasks: [],
          deletedTaskIds: [],
          taskRunsByTaskId: { [rootTask.taskId]: [] },
          deletedRunIdsByTaskId: { [rootTask.taskId]: [] },
          sourceNodes: [],
          sourceConnections: [],
          taskConnections: [],
          taskDependencies: [],
          serverVersion: {
            taskCatalog: "2026-06-03T00:00:00.000Z",
            taskRunSummary: "2026-06-03T00:00:10.000Z",
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500 });
    });

    render(<LiveDataProbe />);

    await waitFor(() => expect(readLiveDataProbe().tasks).toEqual([rootTask.taskId]));
    await waitFor(() => expect(readLiveDataProbe().runKeys).toEqual([rootTask.taskId]));
    fireEvent.click(screen.getByRole("button", { name: "probe refresh" }));

    await waitFor(() => {
      const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
      expect(urls).toContain("/v1/team/console/root-summary");
      expect(urls).toContain("/v1/team/console/root-summary?taskSince=2026-06-03T00%3A00%3A00.000Z&runSince=2026-06-03T00%3A00%3A10.000Z");
    });
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url === "/v1/team/tasks" || url.startsWith("/v1/team/tasks?since="))).toBe(false);
    expect(readLiveDataProbe().tasks).toEqual([rootTask.taskId]);
    expect(readLiveDataProbe().runKeys).toEqual([rootTask.taskId]);
  });

  it("uses generated child summary since cursor without clearing empty increments", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const rootTask = mockTeamTasks[0]!;
    const generated = generatedSummary(mockDiscoveryGeneratedTasks[0]!);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/console/root-summary") {
        return new Response(JSON.stringify({
          tasks: [rootTask, mockDiscoveryRootTask],
          deletedTaskIds: [],
          taskRunsByTaskId: {},
          deletedRunIdsByTaskId: {},
          sourceNodes: [],
          sourceConnections: [],
          taskConnections: [],
          taskDependencies: [],
          serverVersion: {
            taskCatalog: "2026-06-03T00:00:00.000Z",
            taskRunSummary: null,
          },
        }), { status: 200 });
      }
      if (url.startsWith("/v1/team/console/root-summary?")) {
        return new Response(JSON.stringify({
          tasks: [],
          deletedTaskIds: [],
          taskRunsByTaskId: {},
          deletedRunIdsByTaskId: {},
          sourceNodes: [],
          sourceConnections: [],
          taskConnections: [],
          taskDependencies: [],
          serverVersion: {
            taskCatalog: "2026-06-03T00:00:00.000Z",
            taskRunSummary: null,
          },
        }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks?view=summary`) {
        return new Response(JSON.stringify({
          tasks: [generated],
          deletedTaskIds: [],
          serverVersion: "2026-06-03T00:00:20.000Z",
        }), { status: 200 });
      }
      if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks?view=summary&since=2026-06-03T00%3A00%3A20.000Z`) {
        return new Response(JSON.stringify({
          tasks: [],
          deletedTaskIds: [],
          serverVersion: "2026-06-03T00:00:20.000Z",
        }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return new Response(JSON.stringify({
          runsByTaskId: {},
          deletedRunIdsByTaskId: {},
          serverVersion: "2026-06-03T00:00:30.000Z",
        }), { status: 200 });
      }
      if (url.includes("/attempts")) return new Response(JSON.stringify({ attempts: [] }), { status: 200 });
      return new Response(JSON.stringify({ error: `unexpected ${url}` }), { status: 500 });
    });

    render(<LiveDataProbe openDiscoveryTaskIds={[mockDiscoveryRootTask.taskId]} />);

    await waitFor(() => expect(readLiveDataProbe().generated[mockDiscoveryRootTask.taskId]).toEqual([generated.taskId]));
    fireEvent.click(screen.getByRole("button", { name: "probe refresh" }));

    await waitFor(() => {
      const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
      expect(urls).toContain(`/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks?view=summary&since=2026-06-03T00%3A00%3A20.000Z`);
    });
    expect(readLiveDataProbe().generated[mockDiscoveryRootTask.taskId]).toEqual([generated.taskId]);
  });

  it("removes deleted root Task runs from live state during refresh", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const taskA = { ...mockTeamTasks[0]!, taskId: "task_root_keep", title: "Keep root" };
    const taskB = { ...mockTeamTasks[1]!, taskId: "task_root_delete", title: "Delete root" };
    const runA = canvasTaskRun(taskA.taskId, "run_root_keep");
    const runB = canvasTaskRun(taskB.taskId, "run_root_delete");
    let returnDeletedTask = true;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") {
        const tasks = returnDeletedTask ? [taskA, taskB] : [taskA];
        return new Response(JSON.stringify({ tasks }), { status: 200 });
      }
      if (url.startsWith("/v1/team/task-runs/by-task?")) {
        return byTaskRunsResponse(returnDeletedTask
          ? { [taskA.taskId]: [runA], [taskB.taskId]: [runB] }
          : { [taskA.taskId]: [runA] }
        );
      }
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
    });

    render(<LiveDataProbe />);

    await waitFor(() => expect(readLiveDataProbe().tasks).toEqual([taskA.taskId, taskB.taskId]));
    await waitFor(() => expect(readLiveDataProbe().runKeys).toEqual([taskB.taskId, taskA.taskId]));

    returnDeletedTask = false;
    fireEvent.click(screen.getByRole("button", { name: "probe refresh" }));

    await waitFor(() => expect(readLiveDataProbe().tasks).toEqual([taskA.taskId]));
    expect(readLiveDataProbe().runKeys).toEqual([taskA.taskId]);
  });

  it("polls only lightweight run summaries when root active runs are not expanded", async () => {
    window.localStorage.setItem("ugk-team-console:data-source", "live");
    const rootTasks = Array.from({ length: 10 }, (_, index) => {
      const base = mockTeamTasks[0]!;
      const taskId = `task_active_root_${index}`;
      return {
        ...base,
        taskId,
        title: `Active root ${index}`,
        workUnit: { ...base.workUnit, title: `Active root ${index}` },
      };
    });
    const runsByTaskId = Object.fromEntries(rootTasks.map((task, index) => [
      task.taskId,
      [canvasTaskRun(task.taskId, `run_active_root_${index}`, "running")],
    ]));
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: rootTasks }), { status: 200 });
      if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse(runsByTaskId);
      const summaryMatch = url.match(/^\/v1\/team\/task-runs\/(run_active_root_\d+)\?view=summary&taskId=(task_active_root_\d+)$/);
      if (summaryMatch) {
        const taskId = summaryMatch[2]!;
        return new Response(JSON.stringify(runsByTaskId[taskId]![0]), { status: 200 });
      }
      return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
    });

    render(<LiveDataProbe />);

    await waitFor(() => expect(readLiveDataProbe().runKeys).toHaveLength(10));
    await waitFor(() => {
      const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
      const polledTaskIds = new Set(urls
        .map((url) => url.match(/\/v1\/team\/task-runs\/run_active_root_\d+\?view=summary&taskId=(task_active_root_\d+)$/)?.[1])
        .filter((taskId): taskId is string => Boolean(taskId)));
      expect(polledTaskIds).toEqual(new Set(rootTasks.map((task) => task.taskId)));
    });
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => /^\/v1\/team\/task-runs\/run_active_root_\d+$/.test(url))).toHaveLength(0);
    expect(urls.some((url) => url.includes("/attempts"))).toBe(false);
    expect(urls.some((url) => url.includes("/files/"))).toBe(false);
    expect(urls.some((url) => url.includes("view=process-summary"))).toBe(false);
  });
});
