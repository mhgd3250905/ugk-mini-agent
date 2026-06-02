import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { CLEAN_AGENT_WORKSPACE_ID, useTeamConsoleLiveData } from "../app/use-team-console-live-data";
import type { TeamAttemptMetadata, TeamCanvasTask, TeamRunState } from "../api/team-types";
import {
  MOCK_AGENTS,
  mockDiscoveryGeneratedTasks,
  mockDiscoveryRootTask,
  mockTeamTasks,
  resetMockTeamApiState,
} from "../fixtures/team-fixtures";
import { getAtlasNodes, firePointer, deferred } from "./app-dom-test-utils";

function noop() {}

function canvasTaskRun(taskId: string, runId: string, status: TeamRunState["status"] = "completed"): TeamRunState {
  return {
    runId,
    planId: `canvas_task_${taskId}`,
    source: { type: "canvas-task", taskId },
    teamUnitId: `canvas_task_unit_${taskId}`,
    status,
    createdAt: "2026-05-31T00:00:00.000Z",
    startedAt: status === "queued" ? null : "2026-05-31T00:00:01.000Z",
    finishedAt: status === "running" || status === "queued" ? null : "2026-05-31T00:00:02.000Z",
    currentTaskId: status === "running" ? taskId : null,
    taskStates: {
      [taskId]: {
        status: status === "running" || status === "queued" ? "running" : "succeeded",
        attemptCount: status === "queued" ? 0 : 1,
        activeAttemptId: status === "queued" ? null : `attempt_${runId}`,
        resultRef: status === "completed" ? `tasks/${taskId}/attempts/attempt_${runId}/accepted-result.md` : null,
        errorSummary: null,
        progress: {
          phase: status,
          message: status === "running" ? "执行中" : "",
          updatedAt: "2026-05-31T00:00:02.000Z",
        },
      },
    },
    summary: {
      totalTasks: 1,
      succeededTasks: status === "completed" ? 1 : 0,
      failedTasks: 0,
      cancelledTasks: 0,
      skippedTasks: 0,
    },
  };
}

function generatedCanvasTaskRun(
  taskId: string,
  runId: string,
  input: {
    status?: TeamRunState["status"];
    discoveryTaskId: string;
    discoveryRunId: string;
    sourceItemId: string;
    createdAt?: string;
    finishedAt?: string | null;
  },
): TeamRunState {
  const status = input.status ?? "completed";
  return {
    ...canvasTaskRun(taskId, runId, status),
    createdAt: input.createdAt ?? "2026-05-31T00:00:00.000Z",
    finishedAt: input.finishedAt === undefined
      ? status === "running" || status === "queued" ? null : "2026-05-31T00:00:02.000Z"
      : input.finishedAt,
    source: {
      type: "canvas-task",
      taskId,
      triggeredBy: {
        type: "discovery-generated-task",
        discoveryTaskId: input.discoveryTaskId,
        discoveryRunId: input.discoveryRunId,
        discoveryAttemptId: `attempt_${input.discoveryRunId}`,
        sourceItemId: input.sourceItemId,
      },
    },
  };
}

function generatedAttempt(taskId = "task_generated_vultr", attemptId = "attempt_generated_vultr"): TeamAttemptMetadata {
  return {
    attemptId,
    taskId,
    status: "succeeded",
    phase: "succeeded",
    createdAt: "2026-05-31T00:00:01.000Z",
    updatedAt: "2026-05-31T00:00:02.000Z",
    finishedAt: "2026-05-31T00:00:02.000Z",
    worker: [{
      outputIndex: 1,
      outputRef: `tasks/${taskId}/attempts/${attemptId}/worker-output-001.md`,
      runtimeContext: {
        requestedProfileId: "search",
        resolvedProfileId: "search",
        fallbackUsed: false,
        browserId: null,
        browserScope: `team-task:${taskId}:worker`,
      },
    }],
    checker: [{
      verdict: "pass",
      reason: "accepted",
      resultContentRef: null,
      revisionIndex: 1,
      recordRef: `tasks/${taskId}/attempts/${attemptId}/checker-verdict-001.json`,
      feedbackRef: null,
      runtimeContext: {
        requestedProfileId: "reviewer",
        resolvedProfileId: "reviewer",
        fallbackUsed: false,
        browserId: null,
        browserScope: `team-task:${taskId}:checker`,
      },
    }],
    watcher: null,
    resultRef: `tasks/${taskId}/attempts/${attemptId}/accepted-result.md`,
    errorSummary: null,
    files: ["worker-output-001.md", "checker-verdict-001.json", "accepted-result.md"],
    roleProcesses: {
      worker: {
        role: "worker",
        profileId: "search",
        status: "succeeded",
        startedAt: "2026-05-31T00:00:01.000Z",
        updatedAt: "2026-05-31T00:00:02.000Z",
        finishedAt: "2026-05-31T00:00:02.000Z",
        assistantText: { content: "generated Worker process loaded", updatedAt: "2026-05-31T00:00:02.000Z" },
        process: { title: "Worker 过程", narration: ["done"], currentAction: "生成输出", kind: "ok", isComplete: true, entries: [] },
      },
      checker: {
        role: "checker",
        profileId: "reviewer",
        status: "succeeded",
        startedAt: "2026-05-31T00:00:01.000Z",
        updatedAt: "2026-05-31T00:00:02.000Z",
        finishedAt: "2026-05-31T00:00:02.000Z",
        assistantText: { content: "generated Checker process loaded", updatedAt: "2026-05-31T00:00:02.000Z" },
        process: { title: "Checker 过程", narration: ["accepted"], currentAction: "验收输出", kind: "ok", isComplete: true, entries: [] },
      },
    },
  };
}

function byTaskRunsResponse(runsByTaskId: Record<string, TeamRunState[]>): Response {
  return new Response(JSON.stringify({ runsByTaskId }), { status: 200 });
}

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
  );
}

function LiveRefreshProbe() {
  const liveData = useTeamConsoleLiveData({
    onApplyLiveTasks: noop,
    onApplyLiveSources: noop,
    onCloseBranches: noop,
    onResetContextUi: noop,
    selectedTaskId: null,
    openDiscoveryTaskIds: [],
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

async function openMockDiscoverySubcanvas(container: HTMLElement): Promise<{
  atlas: HTMLElement;
  panel: HTMLElement;
}> {
  const atlas = getAtlasNodes(container);
  const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });
  fireEvent.click(discoveryNode);
  fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
  const panel = await waitFor(() => {
    const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
    expect(node).toBeTruthy();
    return node!;
  });
  return { atlas, panel };
}

function getGeneratedCard(panel: HTMLElement, taskId: string): HTMLElement {
  const card = panel.querySelector(`[data-generated-task-id="${taskId}"]`) as HTMLElement | null;
  expect(card).toBeTruthy();
  return card!;
}

function resetGeneratedSnapshot(task: TeamCanvasTask): TeamCanvasTask {
  const latestManagedWorkUnit = task.generatedSource?.latestManagedWorkUnit;
  if (!task.generatedSource || !latestManagedWorkUnit) {
    throw new Error(`Missing generated managed snapshot for ${task.taskId}`);
  }
  return {
    ...task,
    title: latestManagedWorkUnit.title,
    workUnit: { ...latestManagedWorkUnit },
    generatedSource: {
      ...task.generatedSource,
      workUnitMode: "managed",
      latestManagedWorkUnit: { ...latestManagedWorkUnit },
    },
    updatedAt: "2026-05-31T00:12:00.000Z",
  };
}

function discoveryRootAttempt(discoveryDispatch?: TeamAttemptMetadata["discoveryDispatch"]): TeamAttemptMetadata {
  const attempt = generatedAttempt(mockDiscoveryRootTask.taskId, "attempt_discovery_root");
  return {
    ...attempt,
    createdAt: "2026-05-31T00:05:00.000Z",
    updatedAt: "2026-05-31T00:06:00.000Z",
    ...(discoveryDispatch !== undefined ? { discoveryDispatch } : {}),
  };
}

describe("App", () => {
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

  it("opens the mock Discovery generated catalog from the root Task menu without root child cards", async () => {
    const { container } = render(<App />);
    const atlas = getAtlasNodes(container);
    const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });

    fireEvent.click(discoveryNode);
    const toggle = await screen.findByRole("button", { name: "Discovery 子画布" });
    fireEvent.click(toggle);

    const panel = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
    expect(panel).toBeTruthy();
    expect(panel!.querySelectorAll("[data-generated-task-id]")).toHaveLength(2);

    const vultrCard = panel!.querySelector('[data-generated-task-id="task_generated_vultr"]') as HTMLElement | null;
    const hetznerCard = panel!.querySelector('[data-generated-task-id="task_generated_hetzner"]') as HTMLElement | null;
    expect(vultrCard).toHaveAttribute("data-generated-item-status", "active");
    expect(vultrCard).toHaveAttribute("data-generated-workunit-mode", "managed");
    expect(vultrCard).toHaveAttribute("data-generated-run-status", "none");
    expect(hetznerCard).toHaveAttribute("data-generated-item-status", "stale");
    expect(hetznerCard).toHaveAttribute("data-generated-workunit-mode", "customized");
    expect(hetznerCard).toHaveAttribute("data-generated-run-status", "none");
    expect(within(vultrCard!).getByText("核查 Vultr 公开证据")).toBeInTheDocument();
    expect(within(hetznerCard!).getByText("核查 Hetzner 公开证据")).toBeInTheDocument();
    expect(panel!.querySelector('[data-generated-task-id="task_generated_archived_ovh"]')).toBeNull();
    expect(within(atlas).queryByRole("button", { name: "核查 Vultr 公开证据" })).toBeNull();
    expect(within(atlas).queryByRole("button", { name: "核查 Hetzner 公开证据" })).toBeNull();

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Discovery 子画布" })).toBeInTheDocument();
  });

  it("light-edits a mock generated Task inside the Discovery subcanvas without creating a root card", async () => {
    const { container } = render(<App />);
    const { atlas, panel } = await openMockDiscoverySubcanvas(container);
    const vultrCard = getGeneratedCard(panel, "task_generated_vultr");
    const editButton = vultrCard.querySelector('[data-generated-action="edit"]') as HTMLButtonElement | null;
    expect(editButton).toBeTruthy();

    fireEvent.click(editButton!);

    const editPanel = await waitFor(() => {
      const node = container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.change(within(editPanel).getByLabelText("Task 名称"), {
      target: { value: "用户改写 Vultr generated" },
    });
    fireEvent.click(within(editPanel).getByRole("button", { name: "保存" }));

    await waitFor(() => {
      const refreshedCard = getGeneratedCard(panel, "task_generated_vultr");
      expect(within(refreshedCard).getByText("用户改写 Vultr generated")).toBeInTheDocument();
      expect(refreshedCard).toHaveAttribute("data-generated-workunit-mode", "customized");
    });
    expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
    expect(within(atlas).queryByRole("button", { name: "用户改写 Vultr generated" })).toBeNull();
  });

  it("resets a mock customized generated Task to its managed snapshot inside the Discovery subcanvas", async () => {
    const { container } = render(<App />);
    const { atlas, panel } = await openMockDiscoverySubcanvas(container);
    const hetznerCard = getGeneratedCard(panel, "task_generated_hetzner");
    expect(hetznerCard).toHaveAttribute("data-generated-item-status", "stale");
    expect(hetznerCard).toHaveAttribute("data-generated-workunit-mode", "customized");
    expect(hetznerCard).toHaveAttribute("data-generated-visual-state", "stale");
    expect(hetznerCard.querySelector(".discovery-generated-card-watermark")).toHaveTextContent("02");
    const resetButton = hetznerCard.querySelector('[data-generated-action="reset-workunit"]') as HTMLButtonElement | null;
    expect(resetButton).toBeTruthy();

    fireEvent.click(resetButton!);

    await waitFor(() => {
      const refreshedCard = getGeneratedCard(panel, "task_generated_hetzner");
      expect(within(refreshedCard).getByText("派发器核查 Hetzner 公开证据")).toBeInTheDocument();
      expect(refreshedCard).toHaveAttribute("data-generated-workunit-mode", "managed");
      expect(refreshedCard).toHaveAttribute("data-generated-item-status", "stale");
      expect(refreshedCard).toHaveAttribute("data-generated-visual-state", "stale");
      expect(refreshedCard.querySelector('[data-generated-action="reset-workunit"]')).toBeNull();
    });
    expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
    expect(within(atlas).queryByRole("button", { name: "派发器核查 Hetzner 公开证据" })).toBeNull();
  });

  it("soft-archives a mock generated Task from the Discovery subcanvas without creating root cards", async () => {
    const { container } = render(<App />);
    const { atlas, panel } = await openMockDiscoverySubcanvas(container);
    const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });
    await waitFor(() => expect(within(discoveryNode).getByText("2 items")).toBeInTheDocument());
    expect(within(discoveryNode).getByText("1 active")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 stale")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 blocked")).toBeInTheDocument();
    expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(2);

    const vultrCard = getGeneratedCard(panel, "task_generated_vultr");
    fireEvent.click(vultrCard.querySelector('[data-generated-action="archive"]')!);
    const confirm = await waitFor(() => {
      const node = panel.querySelector('[data-generated-archive-confirm-for="task_generated_vultr"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });

    fireEvent.click(within(confirm).getByRole("button", { name: "确认归档" }));

    await waitFor(() => {
      expect(panel.querySelector('[data-generated-task-id="task_generated_vultr"]')).toBeNull();
      expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(1);
    });
    expect(getGeneratedCard(panel, "task_generated_hetzner")).toBeTruthy();
    expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
    expect(within(discoveryNode).getByText("1 items")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("0 active")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 stale")).toBeInTheDocument();
    expect(within(discoveryNode).getByText("1 blocked")).toBeInTheDocument();
    expect(within(atlas).queryByRole("button", { name: "核查 Vultr 公开证据" })).toBeNull();
    expect(within(atlas).queryByRole("button", { name: "核查 Hetzner 公开证据" })).toBeNull();
  });

  it("clears generated archive confirmation when the Discovery subcanvas is closed", async () => {
    const { container } = render(<App />);
    const { panel } = await openMockDiscoverySubcanvas(container);
    const vultrCard = getGeneratedCard(panel, "task_generated_vultr");

    fireEvent.click(vultrCard.querySelector('[data-generated-action="archive"]')!);
    await waitFor(() => {
      expect(panel.querySelector('[data-generated-archive-confirm-for="task_generated_vultr"]')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: `收起 ${mockDiscoveryRootTask.title} Discovery 子画布` }));

    await waitFor(() => {
      expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeNull();
    });

    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
    const reopenedPanel = await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });

    expect(getGeneratedCard(reopenedPanel, "task_generated_vultr")).toBeTruthy();
    expect(reopenedPanel.querySelector('[data-generated-archive-confirm-for="task_generated_vultr"]')).toBeNull();
  });

  it("clears generated edit observer and file detail state after archiving that generated child", async () => {
    const { container } = render(<App />);
    const { panel } = await openMockDiscoverySubcanvas(container);
    const vultrCard = getGeneratedCard(panel, "task_generated_vultr");

    fireEvent.click(vultrCard.querySelector('[data-generated-action="edit"]')!);
    await waitFor(() => {
      expect(container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]')).toBeTruthy();
    });

    fireEvent.click(vultrCard.querySelector('[data-generated-action="run"]')!);
    const observeButton = await waitFor(() => {
      expect(vultrCard).toHaveAttribute("data-generated-run-status", "completed");
      const button = vultrCard.querySelector('[data-generated-action="observe-run"]') as HTMLButtonElement | null;
      expect(button).toBeTruthy();
      return button!;
    });
    fireEvent.click(observeButton);
    const observerPanel = await waitFor(() => {
      const node = container.querySelector('[data-generated-observer-task-id="task_generated_vultr"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    const workerFileRow = observerPanel.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
    expect(workerFileRow).toBeTruthy();
    fireEvent.click(workerFileRow!);
    await waitFor(() => {
      expect(container.querySelector(".emap-observer-file-detail-node")).toBeTruthy();
    });

    fireEvent.click(vultrCard.querySelector('[data-generated-action="archive"]')!);
    const confirm = await waitFor(() => {
      const node = panel.querySelector('[data-generated-archive-confirm-for="task_generated_vultr"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "确认归档" }));

    await waitFor(() => {
      expect(panel.querySelector('[data-generated-task-id="task_generated_vultr"]')).toBeNull();
      expect(container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]')).toBeNull();
      expect(container.querySelector('[data-generated-observer-task-id="task_generated_vultr"]')).toBeNull();
      expect(container.querySelector(".emap-observer-file-detail-node")).toBeNull();
    });
    expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
  });

  it("runs a mock generated Task and opens its observer and file detail from the Discovery subcanvas", async () => {
    const { container } = render(<App />);
    const atlas = getAtlasNodes(container);
    const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });

    fireEvent.click(discoveryNode);
    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));

    const panel = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
    expect(panel).toBeTruthy();
    const vultrCard = panel!.querySelector('[data-generated-task-id="task_generated_vultr"]') as HTMLElement | null;
    expect(vultrCard).toBeTruthy();

    const runButton = vultrCard!.querySelector('[data-generated-action="run"]') as HTMLButtonElement | null;
    expect(runButton).toBeTruthy();
    expect(runButton).toBeEnabled();
    fireEvent.click(runButton!);

    await waitFor(() => {
      expect(vultrCard).toHaveAttribute("data-generated-run-status", "completed");
    });
    expect(within(atlas).queryByRole("button", { name: "核查 Vultr 公开证据" })).toBeNull();
    expect(within(atlas).queryByRole("button", { name: "核查 Hetzner 公开证据" })).toBeNull();

    const observeButton = await waitFor(() => {
      const button = vultrCard!.querySelector('[data-generated-action="observe-run"]') as HTMLButtonElement | null;
      expect(button).toBeTruthy();
      return button!;
    });
    fireEvent.click(observeButton);

    const observerPanel = await waitFor(() => {
      const panelNode = container.querySelector('[data-generated-observer-task-id="task_generated_vultr"]') as HTMLElement | null;
      expect(panelNode).toBeTruthy();
      return panelNode!;
    });
    expect(observerPanel).toHaveAttribute("data-generated-observer-run-id");
    expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();

    expect(observerPanel.querySelector('.emap-observer-process-node[data-process-role="worker"]')).toBeTruthy();
    expect(observerPanel.querySelector('.emap-observer-process-node[data-process-role="checker"]')).toBeTruthy();
    expect(within(observerPanel).getByText("worker-output-001.md")).toBeInTheDocument();
    expect(within(observerPanel).getByText("checker-verdict-001.json")).toBeInTheDocument();
    expect(within(observerPanel).getByText("accepted-result.md")).toBeInTheDocument();

    const workerFileRow = observerPanel.querySelector('.emap-observer-file-row[data-file-kind="worker"]') as HTMLElement | null;
    expect(workerFileRow).toBeTruthy();
    fireEvent.click(workerFileRow!);
    const fileDetail = await waitFor(() => {
      const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
      expect(detail).toBeTruthy();
      return detail!;
    });
    expect(fileDetail).toHaveTextContent("Mock worker output for 核查 Vultr 公开证据");

    fireEvent.click(observeButton);
    await waitFor(() => {
      expect(container.querySelector('[data-generated-observer-task-id="task_generated_vultr"]')).toBeNull();
    });
    expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
  });

  it("does not show the Discovery subcanvas toggle for normal root Tasks", async () => {
    const { container } = render(<App />);
    const atlas = getAtlasNodes(container);
    const normalTask = mockTeamTasks[0]!;
    const normalTaskNode = await within(atlas).findByRole("button", { name: normalTask.title });

    fireEvent.click(normalTaskNode);

    const menu = await screen.findByLabelText(`${normalTask.title} 操作菜单`);
    expect(within(menu).queryByRole("button", { name: "Discovery 子画布" })).toBeNull();
  });

  it("restores an open Discovery subcanvas from stored Task branch state", async () => {
    window.localStorage.setItem("ugk-team-console:canvas-ui-state:v1", JSON.stringify({
      schemaVersion: 1,
      dataSource: "mock",
      selectedFixtureId: CLEAN_AGENT_WORKSPACE_ID,
      expandedTaskBranches: [{
        nodeId: `task-node-${mockDiscoveryRootTask.taskId}`,
        taskId: mockDiscoveryRootTask.taskId,
        detailMode: "discovery-subcanvas",
      }],
    }));

    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
    });
  });

  it("hydrates a generated edit draft when restored Discovery branch state includes a generated edit id", async () => {
    window.localStorage.setItem("ugk-team-console:canvas-ui-state:v1", JSON.stringify({
      schemaVersion: 1,
      dataSource: "mock",
      selectedFixtureId: CLEAN_AGENT_WORKSPACE_ID,
      expandedTaskBranches: [{
        nodeId: `task-node-${mockDiscoveryRootTask.taskId}`,
        taskId: mockDiscoveryRootTask.taskId,
        detailMode: "discovery-subcanvas",
        discoveryGeneratedEditTaskId: "task_generated_vultr",
      }],
    }));

    const { container } = render(<App />);

    const panel = await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    const vultrCard = getGeneratedCard(panel, "task_generated_vultr");
    expect(vultrCard).toHaveAttribute("data-generated-editing", "true");
    await waitFor(() => {
      expect(container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]')).toBeTruthy();
    });
  });

  it("clears a generated child edit draft when the root Discovery branch is closed", async () => {
    const staleTitle = "Unsaved stale generated title";
    const { container } = render(<App />);
    const { panel } = await openMockDiscoverySubcanvas(container);
    const vultrCard = getGeneratedCard(panel, "task_generated_vultr");

    fireEvent.click(vultrCard.querySelector('[data-generated-action="edit"]')!);
    const firstEditPanel = await waitFor(() => {
      const node = container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.change(within(firstEditPanel).getByLabelText("Task 名称"), {
      target: { value: staleTitle },
    });

    fireEvent.click(screen.getByRole("button", { name: `收起 ${mockDiscoveryRootTask.title} Task 操作` }));
    await waitFor(() => {
      expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeNull();
      expect(container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]')).toBeNull();
    });

    const atlas = getAtlasNodes(container);
    fireEvent.click(within(atlas).getByRole("button", { name: "发现云服务候选" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
    const reopenedPanel = await waitFor(() => {
      const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    const reopenedCard = getGeneratedCard(reopenedPanel, "task_generated_vultr");
    fireEvent.click(reopenedCard.querySelector('[data-generated-action="edit"]')!);

    const reopenedEditPanel = await waitFor(() => {
      const node = container.querySelector('[data-generated-edit-task-id="task_generated_vultr"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    expect(within(reopenedEditPanel).getByLabelText("Task 名称")).toHaveValue("核查 Vultr 公开证据");
    expect(within(reopenedEditPanel).getByLabelText("Task 名称")).not.toHaveValue(staleTitle);
  });

  it("ignores malformed stored generated observer state without dropping the Discovery subcanvas branch", async () => {
    window.localStorage.setItem("ugk-team-console:canvas-ui-state:v1", JSON.stringify({
      schemaVersion: 1,
      dataSource: "mock",
      selectedFixtureId: CLEAN_AGENT_WORKSPACE_ID,
      expandedTaskBranches: [{
        nodeId: `task-node-${mockDiscoveryRootTask.taskId}`,
        taskId: mockDiscoveryRootTask.taskId,
        detailMode: "discovery-subcanvas",
        discoveryGeneratedObserver: { taskId: 123, runId: "" },
      }],
    }));

    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
    });
    expect(container.querySelector("[data-generated-observer-task-id]")).toBeNull();
  });

  describe("live data", () => {
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
          if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
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
          if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
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
        const generatedTasks = mockDiscoveryGeneratedTasks.filter((task) => !task.archived);
        vi.mocked(fetch).mockImplementation(async (input) => {
          const url = String(input);
          if (url === "/v1/agents") return new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 });
          if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
          if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
          if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
            return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
          }
          if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
          return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
        });

        const { container } = render(<App />);
        const atlas = getAtlasNodes(container);
        const discoveryNode = await within(atlas).findByRole("button", { name: mockDiscoveryRootTask.title });
        fireEvent.click(discoveryNode);
        fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));

        const panel = await waitFor(() => {
          const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
          expect(node).toBeTruthy();
          return node!;
        });
        await waitFor(() => {
          expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(2);
        });

        const calledUrls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
        const generatedCalls = calledUrls.filter((url) => url.includes("/generated-tasks"));
        const individualRunCalls = calledUrls.filter((url) => /^\/v1\/team\/tasks\/[^/]+\/runs$/.test(url));
        expect(generatedCalls).toHaveLength(1);
        expect(generatedCalls[0]).toContain(mockDiscoveryRootTask.taskId);
        expect(individualRunCalls).toHaveLength(0);
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
          if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
            generatedCatalogRequests += 1;
            return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
          }
          if (url.startsWith("/v1/team/task-runs/by-task?")) return byTaskRunsResponse({});
          return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
        });

        const { container } = render(<App />);
        const atlas = getAtlasNodes(container);
        const discoveryNode = await within(atlas).findByRole("button", { name: mockDiscoveryRootTask.title });
        fireEvent.click(discoveryNode);
        fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));

        await waitFor(() => {
          expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
        });
        await waitFor(() => {
          const panel = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)!;
          expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(2);
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
          if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
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
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
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
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
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
      expect(probe.summaries[mockDiscoveryRootTask.taskId]).toEqual({
        generatedTaskCount: 2,
        activeGeneratedTaskCount: 1,
        staleGeneratedTaskCount: 1,
        runningGeneratedRunCount: 1,
        failedDispatchCount: 0,
      });
      expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toContain(
        `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`,
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
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [mockDiscoveryRootTask] }), { status: 200 });
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
          generatedCatalogRequests += 1;
          return new Response(JSON.stringify({
            tasks: generatedCatalogRequests >= 5 ? generatedTasks : [],
          }), { status: 200 });
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
        if (url === `/v1/team/task-runs/${completedDiscoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts`) {
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
    });

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
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
          return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) {
          return byTaskRunsResponse({ [mockDiscoveryRootTask.taskId]: [discoveryRun] });
        }
        if (url === `/v1/team/task-runs/${discoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts`) {
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
        `/v1/team/task-runs/${discoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts`,
      );
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
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
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
      const atlas = getAtlasNodes(container);
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
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
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
      const atlas = getAtlasNodes(container);
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
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
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
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
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
        if (url === `/v1/team/task-runs/${discoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts`) {
          return new Response(JSON.stringify({ attempts: [discoveryAttempt] }), { status: 200 });
        }
        if (url === "/v1/team/task-runs/run_generated_vultr") {
          return new Response(JSON.stringify({ message: "not polled in this test" }), { status: 404 });
        }
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      const { container } = render(<App />);

      const atlas = getAtlasNodes(container);
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
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
          return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
        }
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/runs`) {
          return new Response(JSON.stringify({ runs: [discoveryRun] }), { status: 200 });
        }
        if (url === `/v1/team/task-runs/${discoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts`) {
          return new Response(JSON.stringify({ attempts: [discoveryRootAttempt()] }), { status: 200 });
        }
        if (/^\/v1\/team\/tasks\/[^/]+\/runs$/.test(url)) {
          return new Response(JSON.stringify({ runs: [] }), { status: 200 });
        }
        return new Response(JSON.stringify(url.includes("connections") ? { connections: [] } : []), { status: 200 });
      });

      const { container } = render(<App />);
      const atlas = getAtlasNodes(container);
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
      expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(2);
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
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
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
      const atlas = getAtlasNodes(container);
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
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
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
      const atlas = getAtlasNodes(container);
      const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });
      fireEvent.click(discoveryNode);
      fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
      const panel = await waitFor(() => {
        const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });
      await waitFor(() => {
        expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(2);
      });

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
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
          return new Response(JSON.stringify({ tasks: generatedTasks }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) {
          return byTaskRunsResponse({ [mockDiscoveryRootTask.taskId]: [discoveryRun] });
        }
        if (url === `/v1/team/task-runs/${discoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts`) {
          return new Response(JSON.stringify({ attempts: [discoveryAttempt] }), { status: 200 });
        }
        if (url === "/v1/team/tasks/task_generated_vultr/archive") {
          expect(init).toMatchObject({ method: "POST" });
          return new Response(JSON.stringify({ task: archivedVultrTask, warnings: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ connections: [], dependencies: [], sourceNodes: [] }), { status: 200 });
      });

      const { container } = render(<App />);
      const atlas = getAtlasNodes(container);
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
      expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(2);
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
        expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(1);
      });
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
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
          return new Response(JSON.stringify({
            tasks: showRefreshedGeneratedCatalog ? refreshedGeneratedTasks : initialGeneratedTasks,
          }), { status: 200 });
        }
        if (url.startsWith("/v1/team/task-runs/by-task?")) {
          return byTaskRunsResponse({ [mockDiscoveryRootTask.taskId]: [discoveryRun] });
        }
        if (url === `/v1/team/task-runs/${discoveryRun.runId}/tasks/${mockDiscoveryRootTask.taskId}/attempts`) {
          return new Response(JSON.stringify({ attempts: [discoveryAttempt] }), { status: 200 });
        }
        if (url === "/v1/team/tasks/task_generated_vultr/archive") {
          expect(init).toMatchObject({ method: "POST" });
          return archiveResponse.promise;
        }
        return new Response(JSON.stringify({ connections: [], dependencies: [], sourceNodes: [] }), { status: 200 });
      });

      const { container } = render(<App />);
      const atlas = getAtlasNodes(container);
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
        expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(2);
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
        expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(3);
        expect(getGeneratedCard(panel, "task_generated_scaleway")).toBeTruthy();
        expect(within(discoveryNode).getByText("3 items")).toBeInTheDocument();
      });

      archiveResponse.resolve(new Response(JSON.stringify({ task: archivedVultrTask, warnings: [] }), { status: 200 }));

      await waitFor(() => {
        expect(panel.querySelector('[data-generated-task-id="task_generated_vultr"]')).toBeNull();
        expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(2);
        expect(getGeneratedCard(panel, "task_generated_hetzner")).toBeTruthy();
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
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
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
      const atlas = getAtlasNodes(container);
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
        expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(2);
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
      expect(panel.querySelectorAll("[data-generated-task-id]")).toHaveLength(2);
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
        if (url === `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks`) {
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
      const atlas = getAtlasNodes(container);
      const discoveryNode = await within(atlas).findByRole("button", { name: "发现云服务候选" });
      fireEvent.click(discoveryNode);
      fireEvent.click(await screen.findByRole("button", { name: "Discovery 子画布" }));
      const panel = await waitFor(() => {
        const node = container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`) as HTMLElement | null;
        expect(node).toBeTruthy();
        return node!;
      });

      fireEvent.click(getGeneratedCard(panel, "task_generated_hetzner").querySelector('[data-generated-action="reset-workunit"]')!);

      expect(await screen.findByText("reset failed")).toBeInTheDocument();
      expect(container.querySelector(`[data-discovery-subcanvas-for="${mockDiscoveryRootTask.taskId}"]`)).toBeTruthy();
      expect(getGeneratedCard(panel, "task_generated_hetzner")).toHaveAttribute("data-generated-workunit-mode", "customized");
      expect(within(atlas).queryByRole("button", { name: "核查 Hetzner 公开证据" })).toBeNull();
    });

    it("has mock and live options", () => {
      render(<App />);
      const options = screen.getAllByRole("option");
      const values = options.map((o) => (o as HTMLOptionElement).value);
      const labels = options.map((o) => o.textContent);
      expect(values).toContain("mock");
      expect(values).toContain("live");
      expect(labels).toContain("示例数据");
      expect(labels).toContain("实时 API");
      expect(screen.queryByText("示例：")).toBeNull();
    });

    it("does not render the obsolete mock fixture switcher", () => {
      render(<App />);

      expect(screen.queryByRole("button", { name: "发现 + 逐项处理" })).toBeNull();
      expect(screen.queryByRole("button", { name: "任务拆分" })).toBeNull();
      expect(screen.queryByText("Discovery + ForEach")).toBeNull();
      expect(screen.queryByText("Decomposition split")).toBeNull();
    });

    it("keeps Live API on a clean agent workspace until a run is requested", async () => {
      const liveTask = mockTeamTasks[0]!;
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ dependencies: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }));

      render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(7));
      expect(fetch).toHaveBeenNthCalledWith(1, "/v1/agents");
      expect(fetch).toHaveBeenNthCalledWith(2, "/v1/agents/status", {
        method: "GET",
        headers: { accept: "application/json" },
      });
      expect(fetch).toHaveBeenNthCalledWith(3, "/v1/team/tasks");
      expect(fetch).toHaveBeenNthCalledWith(4, "/v1/team/task-connections");
      expect(fetch).toHaveBeenNthCalledWith(5, "/v1/team/task-dependencies");
      expect(fetch).toHaveBeenNthCalledWith(6, "/v1/team/source-nodes");
      expect(fetch).toHaveBeenNthCalledWith(7, "/v1/team/source-connections");
      expect(screen.queryByText("运行图：")).toBeNull();
      expect(screen.queryByRole("button", { name: "Agent workspace" })).toBeNull();
      expect(screen.queryByRole("button", { name: "最新 Run" })).toBeNull();
      expect(screen.queryByText("执行运行")).toBeNull();
      expect(screen.queryByText("Research vendor A")).toBeNull();
      expect(fetch).not.toHaveBeenCalledWith("/v1/team/plans");
      expect(fetch).not.toHaveBeenCalledWith("/v1/team/runs");
      expect(await screen.findByText(liveTask.title)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "添加 Agent" })).toBeEnabled();
    });

    it("keeps Live API usable when the typed connection endpoint is not deployed yet", async () => {
      const liveTask = mockTeamTasks[0]!;
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify({ agents: MOCK_AGENTS }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 }))
        .mockResolvedValueOnce(new Response("not found", { status: 404 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }))
        .mockResolvedValue(new Response(JSON.stringify({ runs: [] }), { status: 200 }));

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await waitFor(() => expect(fetch).toHaveBeenCalledWith("/v1/team/task-connections"));
      expect(screen.queryByText("请求失败 (404)")).toBeNull();
      expect(await screen.findByText(liveTask.title)).toBeInTheDocument();
      expect(container.querySelector(".task-create-btn")).toBeEnabled();
    });

    it("loads live agent catalog when switching to Live API", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify({
          agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
        }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [{ agentId: "main", name: "主 Agent", status: "idle" }] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ dependencies: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }));

      render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(7));
      expect(fetch).toHaveBeenNthCalledWith(1, "/v1/agents");
      expect(fetch).toHaveBeenNthCalledWith(2, "/v1/agents/status", {
        method: "GET",
        headers: { accept: "application/json" },
      });
      expect(fetch).toHaveBeenNthCalledWith(3, "/v1/team/tasks");
      expect(fetch).toHaveBeenNthCalledWith(4, "/v1/team/task-connections");
      expect(fetch).toHaveBeenNthCalledWith(5, "/v1/team/task-dependencies");
      expect(fetch).toHaveBeenNthCalledWith(6, "/v1/team/source-nodes");
      expect(fetch).toHaveBeenNthCalledWith(7, "/v1/team/source-connections");
    });

    it("keeps Task creation disabled in mock mode", () => {
      const { container } = render(<App />);

      const createTaskButton = screen.getByRole("button", { name: "创建 Task" });
      expect(createTaskButton).toBeDisabled();

      fireEvent.click(createTaskButton);

      expect(container.querySelector(".agent-playground-branch")).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });

    it("shows live leader choices from the Agent catalog for Task creation", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [
              { agentId: "main", name: "主 Agent", description: "默认综合 agent" },
              { agentId: "search", name: "搜索 Agent", description: "搜索" },
            ],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        return new Response(JSON.stringify([]), { status: 200 });
      });

      render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(fetch).toHaveBeenCalledWith("/v1/team/tasks"));

      const createTaskButton = screen.getByRole("button", { name: "创建 Task" });
      expect(createTaskButton).toBeEnabled();
      fireEvent.click(createTaskButton);

      const leaderCatalog = screen.getByLabelText("Task leader catalog");
      expect(within(leaderCatalog).getByRole("button", { name: /主 Agent[\s\S]*main/ })).toBeInTheDocument();
      expect(within(leaderCatalog).getByRole("button", { name: /搜索 Agent[\s\S]*search/ })).toBeInTheDocument();
    });

    it("adds the selected leader Agent and opens a Task creation branch", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(fetch).toHaveBeenCalledWith("/v1/team/tasks"));

      fireEvent.click(screen.getByRole("button", { name: "创建 Task" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      const leaderNode = container.querySelector('.emap-agent-node[data-agent-id="main"]');
      expect(leaderNode).toBeTruthy();
      const branch = container.querySelector(".agent-playground-branch") as HTMLElement | null;
      expect(branch).toBeTruthy();
      expect(within(branch!).getByText("创建 Task")).toBeInTheDocument();
      expect(within(branch!).getByText("主 Agent")).toBeInTheDocument();
      const iframe = branch!.querySelector("iframe") as HTMLIFrameElement | null;
      expect(iframe).toHaveAttribute("title", "主 Agent Task 创建");
      expect(iframe?.getAttribute("src")).toContain("/playground?view=chat&agentId=main");
      expect(iframe?.getAttribute("src")).toContain("embed=team-console");
      expect(iframe?.getAttribute("src")).toContain("teamTaskMode=create");
      expect(iframe?.getAttribute("src")).not.toContain("teamTaskId=");
    });

    it("refreshes live Task cards from the Task toolbar action", async () => {
      const liveTask = mockTeamTasks[0]!;
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          return new Response(JSON.stringify({ tasks: taskRequests === 1 ? [] : [liveTask] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(taskRequests).toBe(1));
      expect(screen.getByLabelText("当前 Task 数量")).toHaveTextContent("0 个 Task");

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

      await waitFor(() => expect(taskRequests).toBe(2));
      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();
      expect(screen.getByLabelText("当前 Task 数量")).toHaveTextContent("1 个 Task");
    });

    it("keeps existing live Task cards and shows an error when Task refresh fails", async () => {
      const liveTask = mockTeamTasks[0]!;
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          if (taskRequests === 1) {
            return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
          }
          return new Response("down", { status: 500 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

      expect(await screen.findByText("请求失败 (500)")).toBeInTheDocument();
      expect(within(getAtlasNodes(container)).getByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();
      expect(screen.getByLabelText("当前 Task 数量")).toHaveTextContent("1 个 Task");
    });

    it("clears a stale Task refresh error after a later successful refresh", async () => {
      const liveTask = mockTeamTasks[0]!;
      const refreshedTask = {
        ...liveTask,
        taskId: "task_error_recovered",
        title: "错误恢复后的 Task",
        workUnit: {
          ...liveTask.workUnit,
          title: "错误恢复后的 Task",
        },
      };
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          if (taskRequests === 1) {
            return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
          }
          if (taskRequests === 2) {
            return new Response("down", { status: 500 });
          }
          return new Response(JSON.stringify({ tasks: [liveTask, refreshedTask] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));
      expect(await screen.findByText("请求失败 (500)")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "错误恢复后的 Task" })).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText("请求失败 (500)")).toBeNull());
    });

    it("deduplicates concurrent live Task refresh clicks", async () => {
      const firstTask = mockTeamTasks[0]!;
      const secondTask = {
        ...firstTask,
        taskId: "task_refresh_deduped",
        title: "刷新防重后的 Task",
        workUnit: {
          ...firstTask.workUnit,
          title: "刷新防重后的 Task",
        },
      };
      const refreshResponse = deferred<Response>();
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          if (taskRequests === 1) {
            return new Response(JSON.stringify({ tasks: [firstTask] }), { status: 200 });
          }
          if (taskRequests === 2) {
            return refreshResponse.promise;
          }
          return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));
      const refreshingButton = await screen.findByRole("button", { name: "刷新中..." });
      expect(refreshingButton).toBeDisabled();
      fireEvent.click(refreshingButton);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(taskRequests).toBe(2);

      refreshResponse.resolve(new Response(JSON.stringify({ tasks: [firstTask, secondTask] }), { status: 200 }));

      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "刷新防重后的 Task" })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("button", { name: "刷新 Task" })).toBeEnabled());
      expect(screen.getByLabelText("当前 Task 数量")).toHaveTextContent("2 个 Task");
    });

    it("refreshes live Task cards after closing a Task creation branch", async () => {
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(taskRequests).toBe(1));

      fireEvent.click(screen.getByRole("button", { name: "创建 Task" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(screen.getByRole("button", { name: /收起 主 Agent 创建 Task分支/ }));

      await waitFor(() => expect(taskRequests).toBe(2));
    });

    it("refreshes live Task cards after leaving a Task creation branch for an Agent chat branch", async () => {
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      await waitFor(() => expect(taskRequests).toBe(1));

      fireEvent.click(screen.getByRole("button", { name: "创建 Task" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      const agentNode = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
      expect(agentNode).toBeTruthy();
      fireEvent.click(agentNode!);

      await waitFor(() => expect(taskRequests).toBe(2));
      expect(screen.getByLabelText("主 Agent 主项目对话")).toBeInTheDocument();
    });

    it("keeps live Task creation branch when opening an existing Task branch", async () => {
      const liveTask = mockTeamTasks[0]!;
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" });
      expect(taskRequests).toBe(1);

      fireEvent.click(screen.getByRole("button", { name: "创建 Task" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
      fireEvent.click(taskNode);

      await waitFor(() => expect(container.querySelector(".task-action-branch")).toBeTruthy());
      expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
      expect(taskRequests).toBe(1);
      expect(screen.getByLabelText("调查 Medtrum 云资产 Task 操作")).toBeInTheDocument();
    });

    it("persists Live API agent cards and dragged positions across remounts", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [{ agentId: "main", name: "主 Agent", status: "idle" }] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const first = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      const firstAgentNode = within(getAtlasNodes(first.container)).getByRole("button", { name: "主 Agent" }) as HTMLElement;
      firePointer(firstAgentNode, "pointerdown", { pointerId: 31, clientX: 120, clientY: 120 });
      firePointer(firstAgentNode, "pointermove", { pointerId: 31, clientX: 190, clientY: 155 });
      firePointer(firstAgentNode, "pointerup", { pointerId: 31, clientX: 190, clientY: 155, buttons: 0 });

      await waitFor(() => {
        expect(window.localStorage.getItem("ugk-team-console:data-source")).toBe("live");
        expect(window.localStorage.getItem("ugk-team-console:live-agent-layout:v1")).toContain("\"agentId\":\"main\"");
      });
      first.unmount();

      const second = render(<App />);
      expect(screen.getByRole("combobox")).toHaveValue("live");

      const restoredAgentNode = await within(getAtlasNodes(second.container)).findByRole("button", { name: "主 Agent" }) as HTMLElement;
      expect(Number.parseFloat(restoredAgentNode.style.left)).toBeCloseTo(430, 4);
      expect(Number.parseFloat(restoredAgentNode.style.top)).toBeCloseTo(35, 4);
    });

    it("persists Live API Task card positions without storing Task definitions", async () => {
      const liveTask = mockTeamTasks[0]!;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [
              { agentId: "main", name: "主 Agent", description: "默认综合 agent" },
              { agentId: "search", name: "搜索 Agent", description: "搜索" },
            ],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        }
        if (url === "/v1/team/tasks") {
          return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const first = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const firstTaskNode = await within(getAtlasNodes(first.container)).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      firePointer(firstTaskNode, "pointerdown", { pointerId: 41, clientX: 120, clientY: 120 });
      firePointer(firstTaskNode, "pointermove", { pointerId: 41, clientX: 190, clientY: 155 });
      firePointer(firstTaskNode, "pointerup", { pointerId: 41, clientX: 190, clientY: 155, buttons: 0 });

      await waitFor(() => {
        const stored = JSON.parse(window.localStorage.getItem("ugk-team-console:live-task-layout:v1") ?? "{}") as {
          schemaVersion?: number;
          tasks?: Array<{ taskId: string; position: { x: number; y: number }; title?: string }>;
        };
        expect(stored.schemaVersion).toBe(1);
        expect(stored.tasks?.[0]).toEqual({
          taskId: "task_research_medtrum",
          position: { x: 350, y: 255 },
        });
        expect(JSON.stringify(stored)).not.toContain("workUnit");
        expect(JSON.stringify(stored)).not.toContain("leaderAgentId");
      });
      first.unmount();

      const second = render(<App />);
      expect(screen.getByRole("combobox")).toHaveValue("live");
      const restoredTaskNode = await within(getAtlasNodes(second.container)).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      expect(Number.parseFloat(restoredTaskNode.style.left)).toBeCloseTo(350, 4);
      expect(Number.parseFloat(restoredTaskNode.style.top)).toBeCloseTo(255, 4);
    });

    it("keeps live Task refresh storage limited to layout metadata", async () => {
      const firstTask = mockTeamTasks[0]!;
      const secondTask = {
        ...firstTask,
        taskId: "task_refresh_storage",
        title: "刷新后只存布局的 Task",
        leaderAgentId: "search",
        workUnit: {
          ...firstTask.workUnit,
          title: "刷新后只存布局的 Task",
        },
      };
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [
              { agentId: "main", name: "主 Agent", description: "默认综合 agent" },
              { agentId: "search", name: "搜索 Agent", description: "搜索" },
            ],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        }
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          return new Response(JSON.stringify({
            tasks: taskRequests === 1 ? [firstTask] : [firstTask, secondTask],
          }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const firstTaskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      const firstTaskX = Number.parseFloat(firstTaskNode.style.left);
      const firstTaskY = Number.parseFloat(firstTaskNode.style.top);

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

      const secondTaskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "刷新后只存布局的 Task" }) as HTMLElement;
      const refreshedFirstTaskNode = within(getAtlasNodes(container)).getByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      expect(Number.parseFloat(refreshedFirstTaskNode.style.left)).toBeCloseTo(firstTaskX, 4);
      expect(Number.parseFloat(refreshedFirstTaskNode.style.top)).toBeCloseTo(firstTaskY, 4);
      expect(Number.parseFloat(secondTaskNode.style.top)).toBeGreaterThanOrEqual(220);

      await waitFor(() => {
        const stored = JSON.parse(window.localStorage.getItem("ugk-team-console:live-task-layout:v1") ?? "{}") as {
          tasks?: Array<Record<string, unknown>>;
        };
        expect(stored.tasks?.every((task) => (
          "taskId" in task
          && "position" in task
          && !("title" in task)
          && !("leaderAgentId" in task)
          && !("workUnit" in task)
        ))).toBe(true);
      });
    });

    it("refreshes live Task cards from the toolbar without a run mode switch", async () => {
      const firstTask = mockTeamTasks[0]!;
      const secondTask = {
        ...firstTask,
        taskId: "task_refresh_created",
        title: "刷新后出现的新 Task",
        workUnit: {
          ...firstTask.workUnit,
          title: "刷新后出现的新 Task",
        },
      };
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [
              { agentId: "main", name: "主 Agent", description: "默认综合 agent" },
              { agentId: "search", name: "搜索 Agent", description: "搜索" },
            ],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        }
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          return new Response(JSON.stringify({
            tasks: taskRequests === 1 ? [firstTask] : [firstTask, secondTask],
          }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

      await waitFor(() => expect(taskRequests).toBe(2));
      expect(await within(getAtlasNodes(container)).findByRole("button", { name: "刷新后出现的新 Task" })).toBeInTheDocument();
    });

    it("keeps dragged live Task positions after a live Task refresh", async () => {
      const liveTask = mockTeamTasks[0]!;
      let taskRequests = 0;
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") {
          return new Response(JSON.stringify({
            agents: [
              { agentId: "main", name: "主 Agent", description: "默认综合 agent" },
              { agentId: "search", name: "搜索 Agent", description: "搜索" },
            ],
          }), { status: 200 });
        }
        if (url === "/v1/agents/status") {
          return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        }
        if (url === "/v1/team/tasks") {
          taskRequests += 1;
          return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      firePointer(taskNode, "pointerdown", { pointerId: 42, clientX: 120, clientY: 120 });
      firePointer(taskNode, "pointermove", { pointerId: 42, clientX: 190, clientY: 155 });
      firePointer(taskNode, "pointerup", { pointerId: 42, clientX: 190, clientY: 155, buttons: 0 });

      fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

      await waitFor(() => expect(taskRequests).toBe(2));
      const refreshedTaskNode = await within(getAtlasNodes(container)).findByRole("button", { name: "调查 Medtrum 云资产" }) as HTMLElement;
      expect(Number.parseFloat(refreshedTaskNode.style.left)).toBeCloseTo(350, 4);
      expect(Number.parseFloat(refreshedTaskNode.style.top)).toBeCloseTo(255, 4);
    });

    it("keeps live agent workspace usable when no live team run exists", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(JSON.stringify({
          agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
        }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [{ agentId: "main", name: "主 Agent", status: "idle" }] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ dependencies: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ sourceNodes: [] }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [] }), { status: 200 }));

      const { container } = render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(7));
      expect(screen.queryByText("没有可显示的 live run")).toBeNull();
      expect(screen.getByRole("button", { name: "添加 Agent" })).toBeEnabled();

      fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
      fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

      expect(within(getAtlasNodes(container)).getByText("主 Agent")).toBeInTheDocument();
    });

    it("shows an error banner when live loading fails", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response("down", { status: 500 }));

      render(<App />);
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

      expect(await screen.findByText("请求失败 (500)")).toBeInTheDocument();
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
      const allTaskIds = [rootTask.taskId, discoveryTask.taskId, ...generatedTasks.map((t) => t.taskId)];
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/v1/agents") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
        if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [rootTask, discoveryTask] }), { status: 200 });
        if (url === `/v1/team/tasks/${discoveryTask.taskId}/generated-tasks`) {
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

      const probe = readLiveDataProbe();
      expect(probe.runKeys.length).toBe(allTaskIds.length);
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
        if (url === `/v1/team/tasks/${discoveryTask.taskId}/generated-tasks`) {
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
  });
});
