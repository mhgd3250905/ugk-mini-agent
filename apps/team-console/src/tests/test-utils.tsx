import { expect, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import type { TeamAttemptMetadata, TeamCanvasTask, TeamRunState } from "../api/team-types";
import { mockTeamTasks } from "../fixtures/team-fixtures";

export function getAtlas(container: HTMLElement): HTMLElement {
  const atlas = container.querySelector(".execution-map-container") as HTMLElement | null;
  expect(atlas).toBeTruthy();
  return atlas!;
}

export function getAtlasNodes(container: HTMLElement): HTMLElement {
  const atlasNodes = container.querySelector(".execution-map-nodes") as HTMLElement | null;
  expect(atlasNodes).toBeTruthy();
  return atlasNodes!;
}

export function getAtlasStage(container: HTMLElement): HTMLElement {
  const stage = container.querySelector(".execution-map-scroll") as HTMLElement | null;
  expect(stage).toBeTruthy();
  return stage!;
}

export function firePointer(
  target: Element,
  type: string,
  init: {
    pointerId: number;
    clientX: number;
    clientY: number;
    button?: number;
    buttons?: number;
    shiftKey?: boolean;
  },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId },
    clientX: { value: init.clientX },
    clientY: { value: init.clientY },
    button: { value: init.button ?? 0 },
    buttons: { value: init.buttons ?? 1 },
    shiftKey: { value: init.shiftKey ?? false },
  });
  fireEvent(target, event);
}

export function dragRootNodeToDock(container: HTMLElement, nodeEl: HTMLElement, pointerId = 91) {
  const dockEl = container.querySelector(".emap-root-dock") as HTMLElement | null;
  expect(dockEl).toBeTruthy();
  vi.spyOn(dockEl!, "getBoundingClientRect").mockReturnValue({
    x: 200,
    y: 700,
    width: 400,
    height: 60,
    left: 200,
    top: 700,
    right: 600,
    bottom: 760,
    toJSON: () => ({}),
  } as DOMRect);

  const originalLeft = parseFloat(nodeEl.style.left || "0");
  const originalTop = parseFloat(nodeEl.style.top || "0");
  firePointer(nodeEl, "pointerdown", { pointerId, clientX: originalLeft + 50, clientY: originalTop + 30 });
  firePointer(nodeEl, "pointermove", { pointerId, clientX: 300, clientY: 720 });
  firePointer(nodeEl, "pointerup", { pointerId, clientX: 300, clientY: 720, buttons: 0 });
  return dockEl!;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

export function cloneTaskFixture(task = mockTeamTasks[0]!) {
  return {
    ...task,
    workUnit: {
      ...task.workUnit,
      input: { ...task.workUnit.input },
      inputPorts: task.workUnit.inputPorts ? task.workUnit.inputPorts.map((port) => ({ ...port })) : undefined,
      outputPorts: task.workUnit.outputPorts ? task.workUnit.outputPorts.map((port) => ({ ...port })) : undefined,
      outputContract: { ...task.workUnit.outputContract },
      acceptance: { rules: [...task.workUnit.acceptance.rules] },
    },
  };
}

export function makeLiveTaskRunFixture(task: TeamCanvasTask, runId = "live-task-run-1"): TeamRunState {
  return {
    runId,
    planId: `canvas_task_${task.taskId}`,
    source: { type: "canvas-task", taskId: task.taskId },
    teamUnitId: `canvas_task_unit_${task.taskId}`,
    status: "completed",
    createdAt: "2026-05-25T00:00:00.000Z",
    startedAt: "2026-05-25T00:00:01.000Z",
    finishedAt: "2026-05-25T00:00:05.000Z",
    currentTaskId: null,
    taskStates: {
      [task.taskId]: {
        status: "succeeded",
        attemptCount: 1,
        activeAttemptId: "legacy-attempt-1",
        resultRef: null,
        errorSummary: null,
        progress: {
          phase: "succeeded",
          message: "已通过",
          updatedAt: "2026-05-25T00:00:05.000Z",
        },
      },
    },
    summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
  };
}

export function makeLegacyAttemptFixture(task: TeamCanvasTask): TeamAttemptMetadata {
  return {
    attemptId: "legacy-attempt-1",
    taskId: task.taskId,
    status: "succeeded",
    phase: "succeeded",
    createdAt: "2026-05-25T00:00:01.000Z",
    updatedAt: "2026-05-25T00:00:05.000Z",
    finishedAt: "2026-05-25T00:00:05.000Z",
    worker: [],
    checker: [],
    watcher: null,
    resultRef: null,
    errorSummary: null,
    files: [],
  };
}

export function mockLiveTaskEditorApi(options?: {
  patchStatus?: number;
  patchError?: string;
  archiveStatus?: number;
  archiveError?: string;
  warnings?: string[];
}) {
  let currentTask = cloneTaskFixture();
  let taskArchived = false;
  let taskRequests = 0;
  let archiveRequests = 0;
  const patchBodies: unknown[] = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/v1/agents") {
      return new Response(JSON.stringify({
        agents: [
          { agentId: "main", name: "主 Agent", description: "默认综合 agent" },
          { agentId: "search", name: "搜索 Agent", description: "搜索" },
          { agentId: "reviewer", name: "Review Agent", description: "复核" },
        ],
      }), { status: 200 });
    }
    if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
    if (url === "/v1/team/tasks" && method === "GET") {
      taskRequests += 1;
      return new Response(JSON.stringify({ tasks: taskArchived ? [] : [currentTask] }), { status: 200 });
    }
    if (url === "/v1/team/tasks/task_research_medtrum" && method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        title?: string;
        leaderAgentId?: string;
        workUnit?: typeof currentTask.workUnit;
      };
      patchBodies.push(body);
      if (options?.patchStatus && options.patchStatus >= 400) {
        return new Response(JSON.stringify({ error: options.patchError ?? "update failed" }), { status: options.patchStatus });
      }
      currentTask = {
        ...currentTask,
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.leaderAgentId !== undefined ? { leaderAgentId: body.leaderAgentId } : {}),
        ...(body.workUnit !== undefined ? { workUnit: body.workUnit } : {}),
        updatedAt: "2026-05-25T00:00:00.000Z",
      };
      return new Response(JSON.stringify({ task: currentTask, warnings: options?.warnings }), { status: 200 });
    }
    if (url === "/v1/team/tasks/task_research_medtrum/archive" && method === "POST") {
      archiveRequests += 1;
      if (options?.archiveStatus && options.archiveStatus >= 400) {
        return new Response(JSON.stringify({ error: options.archiveError ?? "archive failed" }), { status: options.archiveStatus });
      }
      taskArchived = true;
      return new Response(JSON.stringify({
        task: { ...currentTask, archived: true, status: "archived" },
      }), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
  return {
    patchBodies,
    replaceCurrentTask(nextTask: typeof currentTask) {
      currentTask = cloneTaskFixture(nextTask);
    },
    mutateCurrentTask(mutator: (task: typeof currentTask) => typeof currentTask) {
      currentTask = cloneTaskFixture(mutator(currentTask));
    },
    get currentTask() {
      return currentTask;
    },
    get taskRequests() {
      return taskRequests;
    },
    get archiveRequests() {
      return archiveRequests;
    },
  };
}

export function makeTypedTaskChainFixtures() {
  const collectTask: TeamCanvasTask = {
    ...cloneTaskFixture(),
    taskId: "task_collect_md",
    title: "搜集内容 Task",
    workUnit: {
      ...cloneTaskFixture().workUnit,
      title: "搜集内容 Task",
      outputPorts: [{ id: "draft_md", label: "Markdown 文稿", type: "md" }],
    },
  };
  const htmlTask: TeamCanvasTask = {
    ...cloneTaskFixture(),
    taskId: "task_html_build",
    title: "HTML 制作 Task",
    workUnit: {
      ...cloneTaskFixture().workUnit,
      title: "HTML 制作 Task",
      inputPorts: [{ id: "source_md", label: "Markdown 文稿", type: "md" }],
      outputPorts: [{ id: "page_html", label: "HTML 页面", type: "html" }],
    },
  };
  const ttsTask: TeamCanvasTask = {
    ...cloneTaskFixture(),
    taskId: "task_tts_fixture",
    title: "TTS Fixture Task",
    workUnit: {
      ...cloneTaskFixture().workUnit,
      title: "TTS Fixture Task",
      inputPorts: [{ id: "source_html", label: "HTML 文稿", type: "html" }],
      outputPorts: [{ id: "voice_audio", label: "音频", type: "audio" }],
    },
  };
  return { collectTask, htmlTask, ttsTask };
}
