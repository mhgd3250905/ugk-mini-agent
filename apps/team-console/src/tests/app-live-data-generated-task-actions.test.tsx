import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
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
  canvasTaskRun,
  discoveryRootAttempt,
  generatedAttempt,
  getGeneratedCard,
  resetGeneratedSnapshot,
  revealStaleGeneratedTasks,
} from "./app-live-data-helpers";

describe("App live data generated Task actions", () => {
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
  });});
