import { expect } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { TeamAttemptMetadata, TeamCanvasTask, TeamDiscoveryGeneratedTaskSummary, TeamRunState } from "../api/team-types";
import { mockDiscoveryRootTask } from "../fixtures/team-fixtures";
import { getAtlasNodes } from "./app-dom-test-utils";

export function noop() {}

export function expectRootFilterCount(label: "ALL" | "Agent" | "Task" | "Source", count: number) {
  const tab = screen.getByRole("tab", { name: new RegExp(`^${label}\\b`) });
  expect(within(tab).getByText(String(count))).toBeInTheDocument();
}

export function canvasTaskRun(taskId: string, runId: string, status: TeamRunState["status"] = "completed"): TeamRunState {
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

export function generatedCanvasTaskRun(
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

export function generatedAttempt(taskId = "task_generated_vultr", attemptId = "attempt_generated_vultr"): TeamAttemptMetadata {
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

export function byTaskRunsResponse(runsByTaskId: Record<string, TeamRunState[]>): Response {
  return new Response(JSON.stringify({ runsByTaskId }), { status: 200 });
}

export function rootSummaryResponse(input: {
  tasks?: TeamCanvasTask[];
  taskRunsByTaskId?: Record<string, TeamRunState[]>;
  taskCatalogVersion?: string | null;
  taskRunSummaryVersion?: string | null;
} = {}): Response {
  return new Response(JSON.stringify({
    tasks: input.tasks ?? [],
    deletedTaskIds: [],
    taskRunsByTaskId: input.taskRunsByTaskId ?? {},
    deletedRunIdsByTaskId: {},
    sourceNodes: [],
    sourceConnections: [],
    taskConnections: [],
    taskDependencies: [],
    serverVersion: {
      taskCatalog: input.taskCatalogVersion ?? null,
      taskRunSummary: input.taskRunSummaryVersion ?? null,
    },
  }), { status: 200 });
}

export function generatedSummary(task: TeamCanvasTask): TeamDiscoveryGeneratedTaskSummary {
  const source = task.generatedSource;
  if (!source) throw new Error(`Missing generated source for ${task.taskId}`);
  return {
    taskId: task.taskId,
    canvasKind: task.canvasKind,
    title: task.title,
    leaderAgentId: task.leaderAgentId,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    archived: task.archived,
    generatedSource: {
      schemaVersion: source.schemaVersion,
      sourceDiscoveryTaskId: source.sourceDiscoveryTaskId,
      sourceItemId: source.sourceItemId,
      itemStatus: source.itemStatus,
      latestDiscoveryRunId: source.latestDiscoveryRunId,
      latestDiscoveryAttemptId: source.latestDiscoveryAttemptId,
      latestDiscoveredAt: source.latestDiscoveredAt,
      workUnitMode: source.workUnitMode,
      canResetToManaged: Boolean(source.latestManagedWorkUnit),
    },
  };
}

export async function openMockDiscoverySubcanvas(container: HTMLElement): Promise<{
  atlas: HTMLElement;
  panel: HTMLElement;
}> {
  const atlas = await waitFor(() => getAtlasNodes(container), { timeout: 2000 });
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

export function getGeneratedCard(panel: HTMLElement, taskId: string): HTMLElement {
  const card = panel.querySelector(`[data-generated-task-id="${taskId}"]`) as HTMLElement | null;
  expect(card).toBeTruthy();
  return card!;
}

export function revealStaleGeneratedTasks(panel: HTMLElement): void {
  const button = within(panel).queryByRole("button", { name: /显示 \d+ 个旧项/ });
  if (button) {
    fireEvent.click(button);
  }
}

export function resetGeneratedSnapshot(task: TeamCanvasTask): TeamCanvasTask {
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

export function discoveryRootAttempt(discoveryDispatch?: TeamAttemptMetadata["discoveryDispatch"]): TeamAttemptMetadata {
  const attempt = generatedAttempt(mockDiscoveryRootTask.taskId, "attempt_discovery_root");
  return {
    ...attempt,
    createdAt: "2026-05-31T00:05:00.000Z",
    updatedAt: "2026-05-31T00:06:00.000Z",
    ...(discoveryDispatch !== undefined ? { discoveryDispatch } : {}),
  };
}
