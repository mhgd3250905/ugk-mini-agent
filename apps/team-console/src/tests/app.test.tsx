import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app/App";
import { makeSequentialPlan, makeSequentialRun, mockTeamTasks, resetMockTeamApiState } from "../fixtures/team-fixtures";
import type { TeamAttemptMetadata, TeamCanvasTask, TeamRunState } from "../api/team-types";

function getAtlas(container: HTMLElement): HTMLElement {
  const atlas = container.querySelector(".execution-map-container") as HTMLElement | null;
  expect(atlas).toBeTruthy();
  return atlas!;
}

function getAtlasNodes(container: HTMLElement): HTMLElement {
  const atlasNodes = container.querySelector(".execution-map-nodes") as HTMLElement | null;
  expect(atlasNodes).toBeTruthy();
  return atlasNodes!;
}

function getAtlasStage(container: HTMLElement): HTMLElement {
  const stage = container.querySelector(".execution-map-scroll") as HTMLElement | null;
  expect(stage).toBeTruthy();
  return stage!;
}

function firePointer(
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function cloneTaskFixture(task = mockTeamTasks[0]!) {
  return {
    ...task,
    workUnit: {
      ...task.workUnit,
      input: { ...task.workUnit.input },
      outputContract: { ...task.workUnit.outputContract },
      acceptance: { rules: [...task.workUnit.acceptance.rules] },
    },
  };
}

function makeLiveTaskRunFixture(task: TeamCanvasTask, runId = "live-task-run-1"): TeamRunState {
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

function makeLegacyAttemptFixture(task: TeamCanvasTask): TeamAttemptMetadata {
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

function mockLiveTaskEditorApi(options?: {
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

describe("App", () => {
  beforeEach(() => {
    resetMockTeamApiState();
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the title", () => {
    render(<App />);
    expect(screen.getByText("团队控制台")).toBeInTheDocument();
  });

  it("renders the subtitle", () => {
    render(<App />);
    expect(screen.getByText("执行地图预览")).toBeInTheDocument();
  });

  it("renders datasource selector", () => {
    render(<App />);
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue("mock");
  });

  it("renders a clean agent atlas workspace by default", () => {
    const { container } = render(<App />);

    expect(screen.queryByText("Research vendor A")).toBeNull();
    expect(screen.queryByText("Research vendor B")).toBeNull();
    expect(screen.queryByText("Research vendor C")).toBeNull();
    expect(screen.queryByText("执行运行")).toBeNull();
    expect(screen.getByRole("button", { name: "添加 Agent" })).toBeEnabled();
    expect(container.querySelector(".execution-map-container")).toBeTruthy();
    expect(container.querySelector(".execution-map-toolbar")).toBeTruthy();
    expect(container.querySelector(".agent-canvas-board")).toBeNull();
  });

  it("groups atlas toolbar stats and Task actions", () => {
    const { container } = render(<App />);

    const toolbar = container.querySelector(".agent-atlas-actions") as HTMLElement | null;
    expect(toolbar).toBeTruthy();
    expect(toolbar!.querySelector(".agent-atlas-stats")).toBeTruthy();
    expect(toolbar!.querySelector(".task-toolbar-group")).toBeTruthy();
    expect(within(toolbar!).getByLabelText("Agent 数量")).toHaveTextContent("0");
    expect(within(toolbar!).getByLabelText("当前 Task 数量")).toHaveTextContent(`${mockTeamTasks.length} 个 Task`);
    expect(within(toolbar!.querySelector(".task-toolbar-group") as HTMLElement).getByRole("button", { name: "创建 Task" })).toBeInTheDocument();
    expect(within(toolbar!.querySelector(".task-toolbar-group") as HTMLElement).getByRole("button", { name: "刷新 Task" })).toBeInTheDocument();
  });

  it("renders mock Task cards in the Agent workspace", async () => {
    const { container } = render(<App />);

    const atlasNodes = getAtlasNodes(container);
    const taskNode = await within(atlasNodes).findByRole("button", { name: /调查 Medtrum 云资产/ });
    expect(taskNode).toBeInTheDocument();
    expect(within(taskNode).getByText("leader: 主 Agent")).toBeInTheDocument();
    expect(within(taskNode).getByText("worker: 搜索 Agent")).toBeInTheDocument();
    expect(within(taskNode).getByText("checker: 主 Agent")).toBeInTheDocument();
  });

  it("renders the add agent entry in mock mode", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "添加 Agent" })).toBeInTheDocument();
  });

  it("adds a unique mock agent card to the atlas node layer", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    const mainOption = await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ });

    fireEvent.click(mainOption);

    const atlasNodes = getAtlasNodes(container);
    expect(within(atlasNodes).getByText("主 Agent")).toBeInTheDocument();
    expect(within(atlasNodes).getByText("main")).toBeInTheDocument();
    expect(container.querySelector(".agent-canvas-board")).toBeNull();
    expect(screen.queryByRole("button", { name: /主 Agent[\s\S]*已加入/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    const joinedOption = screen.getByRole("button", { name: /主 Agent[\s\S]*已加入/ });
    expect(joinedOption).toBeDisabled();

    fireEvent.click(joinedOption);
    expect(within(atlasNodes).getAllByText("main")).toHaveLength(1);
  });

  it("renders mock agent run states on atlas cards", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(screen.getByRole("button", { name: /搜索 Agent[\s\S]*search/ }));

    const mainNode = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
    const searchNode = container.querySelector('.emap-agent-node[data-agent-id="search"]') as HTMLElement | null;
    expect(mainNode).toBeTruthy();
    expect(searchNode).toBeTruthy();

    await waitFor(() => {
      expect(mainNode!).toHaveAttribute("data-agent-run-state", "idle");
      expect(searchNode!).toHaveAttribute("data-agent-run-state", "busy");
    });
    expect(within(mainNode!).getByText("空闲")).toBeInTheDocument();
    expect(within(searchNode!).getByText("运行中")).toBeInTheDocument();
  });

  it("expands an agent card into an embedded playground branch and keeps the atlas visible", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "顺序 run" }));
    expect(screen.getByText("执行运行")).toBeInTheDocument();
    expect(screen.getByText("Research vendor A")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(screen.getByRole("button", { name: /搜索 Agent[\s\S]*search/ }));

    const atlas = getAtlas(container);
    const stage = getAtlasStage(container);
    const initialTransform = stage.style.transform;
    expect(atlas).toHaveAttribute("data-agent-focus", "none");
    expect(atlas.querySelectorAll(".emap-agent-node")).toHaveLength(2);

    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    expect(atlas).toHaveAttribute("data-agent-focus", "main");
    expect(atlas).toHaveAttribute("data-interaction-mode", "free");
    expect(stage.style.transform).toBe(initialTransform);
    expect(stage).not.toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".agent-focus-workspace")).toBeNull();
    expect(screen.getByText("执行运行")).toBeInTheDocument();
    expect(screen.getByText("Research vendor A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /搜索 Agent/ })).toBeInTheDocument();
    const mainNode = container.querySelector('.emap-agent-node[data-agent-id="main"]') as HTMLElement | null;
    const searchNode = container.querySelector('.emap-agent-node[data-agent-id="search"]') as HTMLElement | null;
    const branchShell = container.querySelector(".emap-agent-branch-shell") as HTMLElement | null;
    expect(mainNode).toBeTruthy();
    expect(searchNode).toBeTruthy();
    expect(branchShell).toBeTruthy();
    expect(Number.parseFloat(branchShell!.style.left)).toBeCloseTo(
      Number.parseFloat(mainNode!.style.left) + Number.parseFloat(mainNode!.style.width) + 48,
      4,
    );
    expect(Number.parseFloat(branchShell!.style.left)).toBeLessThan(
      Number.parseFloat(searchNode!.style.left) + Number.parseFloat(searchNode!.style.width),
    );

    const branch = container.querySelector(".agent-playground-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    expect(within(branch!).getByText("主 Agent")).toBeInTheDocument();
    expect(within(branch!).getByText("main")).toBeInTheDocument();
    const iframe = branch!.querySelector("iframe") as HTMLIFrameElement | null;
    expect(iframe).toBeTruthy();
    expect(iframe).toHaveAttribute("title", "主 Agent 主项目对话");
    expect(iframe?.getAttribute("src")).toContain("/playground?view=chat&agentId=main");
    expect(iframe?.getAttribute("src")).toContain("embed=team-console");
    expect(iframe?.getAttribute("src")).not.toContain("teamTaskMode=create");
  });

  it("clicking the expanded agent card collapses the embedded branch", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    const agentNode = within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ });

    fireEvent.click(agentNode);
    expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
    fireEvent.click(agentNode);

    expect(getAtlas(container)).toHaveAttribute("data-agent-focus", "none");
    expect(container.querySelector(".agent-playground-branch")).toBeNull();
  });

  it("opens a Task card into an action menu branch", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    const branchShell = container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
    expect(branch).toBeTruthy();
    expect(branchShell).toBeTruthy();
    expect(branchShell!.style.width).toBe("max-content");
    expect(branchShell!.style.height).toBe("auto");
    expect(branchShell!.style.width).not.toBe("820px");
    expect(branchShell!.style.height).not.toBe("620px");
    expect(within(branch!).getByText("Task 操作")).toBeInTheDocument();
    expect(within(branch!).getByText("调查 Medtrum 云资产")).toBeInTheDocument();
    expect(within(branch!).getByText("task_research_medtrum")).toBeInTheDocument();
    expect(within(branch!).getByRole("button", { name: "运行" })).toBeEnabled();
    expect(within(branch!).getByRole("button", { name: "编辑" })).toBeInTheDocument();
    expect(within(branch!).getByRole("button", { name: "对话 Leader" })).toBeInTheDocument();
    expect(within(branch!).getByRole("button", { name: "删除" })).toBeInTheDocument();
    expect(branch!.querySelector("iframe")).toBeNull();
  });

  it("starts a mock Task run from the action menu and shows the latest run state", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    const runButton = within(branch!).getByRole("button", { name: "运行" });
    expect(runButton).toBeEnabled();
    fireEvent.click(runButton);

    expect(await within(branch!).findByText("最近运行")).toBeInTheDocument();
    expect(within(branch!).getByText("已完成")).toBeInTheDocument();
    expect(within(branch!).getByRole("button", { name: "重新运行" })).toBeEnabled();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("opens node-based Task run observer with status, file nodes, and file detail", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    await waitFor(() => {
      const statusNode = container.querySelector(".emap-observer-status-node");
      expect(statusNode).toBeTruthy();
    });

    const allShells = () => Array.from(container.querySelectorAll(".emap-task-child-branch-shell"));
    const statusShell = allShells().find((shell) => shell.querySelector(".emap-observer-status-node")) as HTMLElement | undefined;
    expect(statusShell).toBeTruthy();
    expect(within(statusShell!).getByText("已完成")).toBeInTheDocument();

    const workerFileNode = await waitFor(() => {
      const node = container.querySelector('.emap-observer-file-node[data-file-kind="worker"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    const checkerFileNode = container.querySelector('.emap-observer-file-node[data-file-kind="checker"]') as HTMLElement | null;
    const resultFileNode = container.querySelector('.emap-observer-file-node[data-file-kind="result"]') as HTMLElement | null;
    expect(checkerFileNode).toBeTruthy();
    expect(resultFileNode).toBeTruthy();
    expect(within(workerFileNode).getByText("worker-output-001.md")).toBeInTheDocument();
    expect(within(checkerFileNode!).getByText("checker-verdict-001.json")).toBeInTheDocument();
    expect(within(resultFileNode!).getByText("accepted-result.md")).toBeInTheDocument();

    const fileShells = allShells().filter((shell) => shell.querySelector(".emap-observer-file-node")) as HTMLElement[];
    expect(fileShells.length).toBeGreaterThanOrEqual(3);

    // All top-level panels (run-status + file nodes) must stack vertically — same x, different y
    const topLevelShells: HTMLElement[] = [statusShell!, ...fileShells];
    const xs = topLevelShells.map((s) => Number.parseFloat(s.style.left));
    const ys = topLevelShells.map((s) => Number.parseFloat(s.style.top));
    const uniqueXs = new Set(xs);
    expect(uniqueXs.size).toBe(1);
    const uniqueYs = new Set(ys);
    expect(uniqueYs.size).toBe(topLevelShells.length);

    expect(container.querySelector(".emap-observer-file-detail-node")).toBeNull();

    fireEvent.click(checkerFileNode!);
    const detailNode = await waitFor(() => {
      const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
      expect(detail).toBeTruthy();
      return detail!;
    });
    expect(within(detailNode).getByText(/"verdict": "pass"/)).toBeInTheDocument();

    const detailCloseButton = detailNode.querySelector(".emap-observer-node-close") as HTMLElement | null;
    expect(detailCloseButton).toBeTruthy();

    // File detail x must be greater than its source file node x
    const checkerShell = allShells().find((s) => s.querySelector('.emap-observer-file-node[data-file-kind="checker"]')) as HTMLElement | undefined;
    const detailShell = allShells().find((s) => s.querySelector(".emap-observer-file-detail-node")) as HTMLElement | undefined;
    expect(checkerShell).toBeTruthy();
    expect(detailShell).toBeTruthy();
    expect(Number.parseFloat(detailShell!.style.left)).toBeGreaterThan(Number.parseFloat(checkerShell!.style.left));

    fireEvent.click(resultFileNode!);
    const updatedDetail = await waitFor(() => {
      const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
      expect(detail).toBeTruthy();
      return detail!;
    });
    expect(within(updatedDetail).getByText("Mock accepted result")).toBeInTheDocument();
    expect(updatedDetail.querySelector('pre[data-file-format="json"]')).toBeNull();
  });

  it("renders independent Worker and Checker process nodes in the Task run observer", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    const workerProcessNode = await waitFor(() => {
      const node = container.querySelector('.emap-observer-process-node[data-process-role="worker"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    const checkerProcessNode = container.querySelector('.emap-observer-process-node[data-process-role="checker"]') as HTMLElement | null;
    expect(checkerProcessNode).toBeTruthy();

    const workerProcessShell = workerProcessNode.closest(".emap-task-child-branch-shell") as HTMLElement | null;
    const checkerProcessShell = checkerProcessNode!.closest(".emap-task-child-branch-shell") as HTMLElement | null;
    expect(workerProcessShell).toBeTruthy();
    expect(checkerProcessShell).toBeTruthy();
    expect(workerProcessShell).not.toBe(checkerProcessShell);

    expect(workerProcessNode).not.toHaveClass("emap-observer-file-node");
    expect(checkerProcessNode).not.toHaveClass("emap-observer-file-node");
    expect(workerProcessNode.closest(".emap-observer-file-node")).toBeNull();
    expect(checkerProcessNode!.closest(".emap-observer-file-node")).toBeNull();

    expect(within(workerProcessNode).getByText("Worker 过程")).toBeInTheDocument();
    expect(within(workerProcessNode).getByText("成功")).toBeInTheDocument();
    expect(within(workerProcessNode).getByText("整理云资产证据")).toBeInTheDocument();
    expect(within(workerProcessNode).getByText("Worker 已生成资产调查草稿")).toBeInTheDocument();

    expect(within(checkerProcessNode!).getByText("Checker 过程")).toBeInTheDocument();
    expect(within(checkerProcessNode!).getByText("成功")).toBeInTheDocument();
    expect(within(checkerProcessNode!).getByText("复核输出契约")).toBeInTheDocument();
    expect(within(checkerProcessNode!).getByText("Checker 已确认输出满足验收规则")).toBeInTheDocument();
  });

  it("keeps the Task run observer usable when legacy attempts have no roleProcesses", async () => {
    const task = cloneTaskFixture();
    const taskRun = makeLiveTaskRunFixture(task);
    const legacyAttempt = makeLegacyAttemptFixture(task);
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
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [task] }), { status: 200 });
      if (url === `/v1/team/tasks/${task.taskId}/runs`) {
        return new Response(JSON.stringify({ runs: [taskRun] }), { status: 200 });
      }
      if (url === `/v1/team/task-runs/${taskRun.runId}`) {
        return new Response(JSON.stringify(taskRun), { status: 200 });
      }
      if (url === `/v1/team/task-runs/${taskRun.runId}/tasks/${task.taskId}/attempts`) {
        return new Response(JSON.stringify({ attempts: [legacyAttempt] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-status-node")).toBeTruthy();
    });
    const workerProcessNode = container.querySelector('.emap-observer-process-node[data-process-role="worker"]') as HTMLElement | null;
    const checkerProcessNode = container.querySelector('.emap-observer-process-node[data-process-role="checker"]') as HTMLElement | null;
    expect(workerProcessNode).toBeTruthy();
    expect(checkerProcessNode).toBeTruthy();
    expect(within(workerProcessNode!).getByText("Worker 过程")).toBeInTheDocument();
    expect(within(checkerProcessNode!).getByText("Checker 过程")).toBeInTheDocument();
    expect(workerProcessNode).toHaveTextContent("等待过程数据");
    expect(checkerProcessNode).toHaveTextContent("等待过程数据");
    expect(workerProcessNode).toHaveTextContent("暂无过程条目");
    expect(checkerProcessNode).toHaveTextContent("暂无过程条目");
  });

  it("groups process tool entries by toolCallId and toggles terminal groups", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    const workerProcessNode = await waitFor(() => {
      const node = container.querySelector('.emap-observer-process-node[data-process-role="worker"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    const searchGroup = workerProcessNode.querySelector('.emap-process-tool-group[data-tool-group-id="tool-worker-search"]') as HTMLElement | null;
    expect(searchGroup).toBeTruthy();

    const searchHeader = within(searchGroup!).getByRole("button", { name: /x-search-latest/ });
    expect(searchHeader).toHaveTextContent("完成");
    expect(searchHeader).toHaveTextContent("2");
    expect(within(searchGroup!).getByText("找到官网、云平台和公开登录入口线索")).toBeInTheDocument();

    const eventGroup = workerProcessNode.querySelector('.emap-process-tool-group[data-tool-group-id="event:worker-note-output"]') as HTMLElement | null;
    expect(eventGroup).toBeTruthy();
    expect(eventGroup).toHaveTextContent("普通事件");
    expect(eventGroup).toHaveTextContent("已把证据整理为 worker 输出文件");
    expect(searchGroup).not.toHaveTextContent("已把证据整理为 worker 输出文件");

    fireEvent.click(searchHeader);
    expect(searchGroup).toHaveTextContent("完成");
    expect(searchGroup).not.toHaveTextContent("找到官网、云平台和公开登录入口线索");

    fireEvent.click(searchHeader);
    expect(within(searchGroup!).getByText("找到官网、云平台和公开登录入口线索")).toBeInTheDocument();
  });

  it("expands the active process tool by default while a role is running", async () => {
    const task = cloneTaskFixture();
    const taskRun: TeamRunState = {
      ...makeLiveTaskRunFixture(task),
      status: "running",
      finishedAt: null,
      currentTaskId: task.taskId,
      taskStates: {
        [task.taskId]: {
          status: "running",
          attemptCount: 1,
          activeAttemptId: "legacy-attempt-1",
          resultRef: null,
          errorSummary: null,
          progress: {
            phase: "worker_running",
            message: "Worker 正在执行",
            updatedAt: "2026-05-25T00:00:05.000Z",
          },
        },
      },
      summary: { totalTasks: 1, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    };
    const runningAttempt: TeamAttemptMetadata = {
      ...makeLegacyAttemptFixture(task),
      status: "running",
      phase: "worker_running",
      finishedAt: null,
      roleProcesses: {
        worker: {
          role: "worker",
          profileId: task.workUnit.workerAgentId,
          status: "running",
          startedAt: "2026-05-25T00:00:01.000Z",
          updatedAt: "2026-05-25T00:00:05.000Z",
          finishedAt: null,
          process: {
            title: "Worker 过程",
            narration: ["Worker 正在调用搜索工具"],
            currentAction: "调用搜索工具",
            kind: "tool",
            isComplete: false,
            entries: [{
              id: "active-search-started",
              kind: "tool",
              title: "x-search-latest started",
              detail: "正在搜索 Medtrum 云资产",
              createdAt: "2026-05-25T00:00:04.000Z",
              toolCallId: "tool-active-web",
              toolName: "x-search-latest",
            }],
          },
        },
      },
    };
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
      if (url === "/v1/team/tasks") return new Response(JSON.stringify({ tasks: [task] }), { status: 200 });
      if (url === `/v1/team/tasks/${task.taskId}/runs`) {
        return new Response(JSON.stringify({ runs: [taskRun] }), { status: 200 });
      }
      if (url === `/v1/team/task-runs/${taskRun.runId}`) {
        return new Response(JSON.stringify(taskRun), { status: 200 });
      }
      if (url === `/v1/team/task-runs/${taskRun.runId}/tasks/${task.taskId}/attempts`) {
        return new Response(JSON.stringify({ attempts: [runningAttempt] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    const runSummary = await within(branch!).findByRole("button", { name: /运行中[\s\S]*执行中/ });
    fireEvent.click(runSummary);

    const activeGroup = await waitFor(() => {
      const group = container.querySelector('.emap-process-tool-group[data-tool-group-id="tool-active-web"]') as HTMLElement | null;
      expect(group).toBeTruthy();
      return group!;
    });
    const header = within(activeGroup).getByRole("button", { name: /x-search-latest/ });
    expect(header).toHaveTextContent("执行中");
    expect(activeGroup).toHaveTextContent("正在搜索 Medtrum 云资产");
  });

  it("renders HTML-like content as text in file detail, not as injected HTML", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-status-node")).toBeTruthy();
    });

    const workerFileNode = await waitFor(() => {
      const node = container.querySelector('.emap-observer-file-node[data-file-kind="worker"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.click(workerFileNode);

    const detailNode = await waitFor(() => {
      const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
      expect(detail).toBeTruthy();
      return detail!;
    });

    expect(detailNode).toHaveTextContent("<script>alert(1)</script>");
    expect(detailNode.querySelector("script")).toBeNull();
    expect(detailNode.querySelector("details")).toBeNull();
  });

  it("uses auto-height for run status panel and compact file index nodes", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-status-node")).toBeTruthy();
    });

    const allShells = () => Array.from(container.querySelectorAll(".emap-task-child-branch-shell"));

    // Status panel shell should not have the old fixed 220px height
    const statusShell = allShells().find((s) => s.querySelector(".emap-observer-status-node")) as HTMLElement | undefined;
    expect(statusShell).toBeTruthy();
    expect(statusShell!.style.height).not.toBe("220px");

    // File nodes should NOT show checker reason / verdict summary text
    const checkerFileNode = container.querySelector('.emap-observer-file-node[data-file-kind="checker"]') as HTMLElement | null;
    expect(checkerFileNode).toBeTruthy();
    expect(checkerFileNode!.textContent).not.toContain("Mock checker accepted the worker output.");
    expect(checkerFileNode!.querySelector(".emap-observer-file-summary")).toBeNull();
    expect(checkerFileNode!.querySelector(".emap-observer-file-runtime")).toBeNull();

    // File nodes should show agent name resolved from agentsById
    const workerFileNode = container.querySelector('.emap-observer-file-node[data-file-kind="worker"]') as HTMLElement | null;
    expect(workerFileNode).toBeTruthy();
    expect(workerFileNode!.textContent).toContain("搜索 Agent");

    const checkerResolvedAgent = checkerFileNode!.textContent ?? "";
    expect(checkerResolvedAgent).toContain("主 Agent");

    // Result file shows agent role fallback
    const resultFileNode = container.querySelector('.emap-observer-file-node[data-file-kind="result"]') as HTMLElement | null;
    expect(resultFileNode).toBeTruthy();
    expect(resultFileNode!.textContent).toContain("accepted-result.md");

    // File nodes should still show file name and path
    expect(within(workerFileNode!).getByText("worker-output-001.md")).toBeInTheDocument();
    expect(workerFileNode!.querySelector(".emap-observer-file-path")).toBeTruthy();
  });

  it("renders file detail with resize handle for observer file nodes", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-status-node")).toBeTruthy();
    });

    const checkerFileNode = await waitFor(() => {
      const node = container.querySelector('.emap-observer-file-node[data-file-kind="checker"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.click(checkerFileNode);

    const detailNode = await waitFor(() => {
      const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
      expect(detail).toBeTruthy();
      return detail!;
    });

    // JSON detail still shows pretty-printed content
    expect(within(detailNode).getByText(/"verdict": "pass"/)).toBeInTheDocument();

    // File detail shell must have a resize handle
    const allShells = () => Array.from(container.querySelectorAll(".emap-task-child-branch-shell"));
    const detailShell = allShells().find((s) => s.querySelector(".emap-observer-file-detail-node")) as HTMLElement | undefined;
    expect(detailShell).toBeTruthy();
    const resizeHandle = detailShell!.querySelector(".emap-panel-resize-handle") as HTMLElement | null;
    expect(resizeHandle).toBeTruthy();

    // Drag resize handle to increase size
    const initialWidth = Number.parseFloat(detailShell!.style.width);
    const initialHeight = Number.parseFloat(detailShell!.style.height);

    firePointer(resizeHandle!, "pointerdown", { pointerId: 61, clientX: 800, clientY: 500 });
    firePointer(resizeHandle!, "pointermove", { pointerId: 61, clientX: 900, clientY: 560 });
    firePointer(resizeHandle!, "pointerup", { pointerId: 61, clientX: 900, clientY: 560, buttons: 0 });

    expect(Number.parseFloat(detailShell!.style.width)).toBeCloseTo(initialWidth + 100, 4);
    expect(Number.parseFloat(detailShell!.style.height)).toBeCloseTo(initialHeight + 60, 4);
  });

  it("starts a live Task run through the Task run API", async () => {
    const liveTask = mockTeamTasks[0]!;
    let createRunRequests = 0;
    const taskRun = {
      runId: "run_canvas_task_001",
      planId: `canvas_task_${liveTask.taskId}`,
      source: { type: "canvas-task", taskId: liveTask.taskId },
      teamUnitId: `canvas_task_unit_${liveTask.taskId}`,
      status: "queued",
      createdAt: "2026-05-25T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      currentTaskId: null,
      taskStates: {
        [liveTask.taskId]: {
          status: "pending",
          attemptCount: 0,
          activeAttemptId: null,
          resultRef: null,
          errorSummary: null,
          progress: { phase: "pending", message: "等待执行", updatedAt: "2026-05-25T00:00:00.000Z" },
        },
      },
      summary: { totalTasks: 1, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    };

    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/v1/agents") {
        return new Response(JSON.stringify({
          agents: [
            { agentId: "main", name: "主 Agent", description: "默认综合 agent" },
            { agentId: "search", name: "搜索 Agent", description: "搜索" },
          ],
        }), { status: 200 });
      }
      if (url === "/v1/agents/status") return new Response(JSON.stringify({ agents: [] }), { status: 200 });
      if (url === "/v1/team/tasks" && method === "GET") {
        return new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 });
      }
      if (url === "/v1/team/tasks/task_research_medtrum/runs" && method === "GET") {
        return new Response(JSON.stringify({ runs: createRunRequests > 0 ? [taskRun] : [] }), { status: 200 });
      }
      if (url === "/v1/team/tasks/task_research_medtrum/runs" && method === "POST") {
        createRunRequests += 1;
        return new Response(JSON.stringify(taskRun), { status: 201 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);
    fireEvent.click(screen.getByRole("button", { name: "运行" }));

    await waitFor(() => expect(createRunRequests).toBe(1));
    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    expect(within(branch!).getByRole("button", { name: /运行中[\s\S]*排队中/ })).toBeInTheDocument();
    expect(within(branch!).getByText("排队中")).toBeInTheDocument();
    expect(within(branch!).getByRole("button", { name: "运行中" })).toBeDisabled();
  });

  it("collapses the Task action branch when the same Task is clicked again", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);
    expect(container.querySelector(".task-action-branch")).toBeTruthy();

    fireEvent.click(taskNode);

    expect(container.querySelector(".task-action-branch")).toBeNull();
  });

  it("clears a Task action branch when an Agent branch opens", async () => {
    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    expect(container.querySelector(".task-action-branch")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    expect(container.querySelector(".task-action-branch")).toBeNull();
    expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
  });

  it("switches the Task action branch when another Task is clicked", async () => {
    const firstTask = mockTeamTasks[0]!;
    const secondTask = {
      ...firstTask,
      taskId: "task_review_medtrum",
      title: "复核 Medtrum 证据",
      leaderAgentId: "search",
      workUnit: {
        ...firstTask.workUnit,
        title: "复核 Medtrum 证据",
      },
    };
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
        return new Response(JSON.stringify({ tasks: [firstTask, secondTask] }), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    expect(within(container.querySelector(".task-action-branch")!).getByText("task_research_medtrum")).toBeInTheDocument();

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /复核 Medtrum 证据/ }));

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    expect(within(branch!).getByText("复核 Medtrum 证据")).toBeInTheDocument();
    expect(within(branch!).getByText("task_review_medtrum")).toBeInTheDocument();
    expect(branch!.querySelector("iframe")).toBeNull();
  });

  it("opens the Task leader chat iframe from the action menu", async () => {
    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

    expect(container.querySelector(".task-action-branch")).toBeTruthy();
    const branch = container.querySelector(".task-leader-chat-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    expect(container.querySelector(".emap-task-child-branch-shell")).toBeTruthy();
    expect(container.querySelector(".emap-link-task-child-branch")).toBeTruthy();
    expect(branch).toHaveClass("agent-playground-branch");
    expect(branch!.querySelector(".agent-playground-branch-head")).toBeTruthy();
    expect(branch!.querySelector(".agent-playground-branch-collapse")).toBeTruthy();
    expect(container.querySelector(".emap-task-child-branch-shell .emap-agent-branch-resize-handle")).toBeTruthy();
    expect(within(branch!).getByText("Leader 对话")).toBeInTheDocument();
    expect(within(branch!).getByText("调查 Medtrum 云资产")).toBeInTheDocument();

    const iframe = branch!.querySelector("iframe") as HTMLIFrameElement | null;
    expect(iframe).toHaveClass("agent-playground-iframe");
    expect(iframe).toHaveAttribute("title", "调查 Medtrum 云资产 leader 对话");
    expect(iframe?.getAttribute("src")).toContain("/playground?view=chat&agentId=main");
    expect(iframe?.getAttribute("src")).toContain("embed=team-console");
    expect(iframe?.getAttribute("src")).toContain("teamTaskId=task_research_medtrum");
    expect(iframe?.getAttribute("src")).toContain("teamTaskMode=edit");
  });

  it("closes the Task leader chat branch from its header action", async () => {
    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));
    expect(container.querySelector(".task-leader-chat-branch iframe")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /收起 调查 Medtrum 云资产 leader 对话/ }));

    expect(container.querySelector(".task-leader-chat-branch")).toBeNull();
    expect(container.querySelector(".task-action-branch")).toBeTruthy();
  });

  it("drags and resizes the Task leader chat child branch like an Agent branch", async () => {
    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "对话 Leader" }));

    const branchShell = container.querySelector(".emap-task-child-branch-shell") as HTMLElement | null;
    const titleBar = container.querySelector(".task-leader-chat-branch .agent-playground-branch-head") as HTMLElement | null;
    const resizeHandle = container.querySelector(".emap-task-child-branch-shell .emap-agent-branch-resize-handle") as HTMLElement | null;
    expect(branchShell).toBeTruthy();
    expect(titleBar).toBeTruthy();
    expect(resizeHandle).toBeTruthy();
    const initialLeft = Number.parseFloat(branchShell!.style.left);
    const initialTop = Number.parseFloat(branchShell!.style.top);
    const initialWidth = Number.parseFloat(branchShell!.style.width);
    const initialHeight = Number.parseFloat(branchShell!.style.height);

    firePointer(titleBar!, "pointerdown", { pointerId: 51, clientX: 600, clientY: 220 });
    firePointer(titleBar!, "pointermove", { pointerId: 51, clientX: 650, clientY: 255 });
    firePointer(titleBar!, "pointerup", { pointerId: 51, clientX: 650, clientY: 255, buttons: 0 });

    expect(Number.parseFloat(branchShell!.style.left)).toBeCloseTo(initialLeft + 50, 4);
    expect(Number.parseFloat(branchShell!.style.top)).toBeCloseTo(initialTop + 35, 4);

    firePointer(resizeHandle!, "pointerdown", { pointerId: 52, clientX: 1000, clientY: 700 });
    firePointer(resizeHandle!, "pointermove", { pointerId: 52, clientX: 1080, clientY: 760 });
    firePointer(resizeHandle!, "pointerup", { pointerId: 52, clientX: 1080, clientY: 760, buttons: 0 });

    expect(Number.parseFloat(branchShell!.style.width)).toBeCloseTo(initialWidth + 80, 4);
    expect(Number.parseFloat(branchShell!.style.height)).toBeCloseTo(initialHeight + 60, 4);
  });

  it("opens a shallow Task edit form with title and Agent selections only", async () => {
    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    expect(container.querySelector(".task-action-branch")).toBeTruthy();
    const branch = container.querySelector(".task-edit-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    expect(container.querySelector(".emap-task-child-branch-shell")).toBeTruthy();
    expect(container.querySelector(".emap-link-task-child-branch")).toBeTruthy();
    expect(within(branch!).getByLabelText("Task 名称")).toHaveValue("调查 Medtrum 云资产");
    expect(within(branch!).getByLabelText("Leader Agent")).toHaveValue("main");
    expect(within(branch!).getByLabelText("Worker Agent")).toHaveValue("search");
    expect(within(branch!).getByLabelText("Checker Agent")).toHaveValue("main");
    expect(within(branch!).queryByLabelText(/input/i)).toBeNull();
    expect(within(branch!).queryByLabelText(/output/i)).toBeNull();
    expect(within(branch!).queryByLabelText(/acceptance/i)).toBeNull();
    expect(within(branch!).getByText(/复杂需求和验收规则继续通过/)).toBeInTheDocument();
  });

  it("saves a title-only Task edit without sending workUnit", async () => {
    const api = mockLiveTaskEditorApi();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    fireEvent.change(screen.getByLabelText("Task 名称"), { target: { value: "更新后的 Task" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(api.patchBodies).toHaveLength(1));
    expect(api.patchBodies[0]).toEqual({ title: "更新后的 Task" });
  });

  it("saves a leader-only Task edit without sending workUnit", async () => {
    const api = mockLiveTaskEditorApi();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    fireEvent.change(screen.getByLabelText("Leader Agent"), { target: { value: "reviewer" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(api.patchBodies).toHaveLength(1));
    expect(api.patchBodies[0]).toEqual({ leaderAgentId: "reviewer" });
  });

  it("saves worker and checker changes with the full existing workUnit", async () => {
    const api = mockLiveTaskEditorApi();
    const original = cloneTaskFixture();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    fireEvent.change(screen.getByLabelText("Worker Agent"), { target: { value: "reviewer" } });
    fireEvent.change(screen.getByLabelText("Checker Agent"), { target: { value: "search" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(api.patchBodies).toHaveLength(1));
    expect(api.patchBodies[0]).toEqual({
      workUnit: {
        ...original.workUnit,
        workerAgentId: "reviewer",
        checkerAgentId: "search",
      },
    });
  });

  it("does not send stale unchanged agent fields after a live Task refresh", async () => {
    const api = mockLiveTaskEditorApi();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    api.mutateCurrentTask((task) => ({
      ...task,
      updatedAt: "2026-05-25T01:00:00.000Z",
      workUnit: {
        ...task.workUnit,
        workerAgentId: "reviewer",
        checkerAgentId: "search",
      },
    }));
    fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));
    await waitFor(() => expect(api.taskRequests).toBe(2));

    fireEvent.change(screen.getByLabelText("Task 名称"), { target: { value: "只改标题的本地草稿" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(api.patchBodies).toHaveLength(1));
    expect(api.patchBodies[0]).toEqual({ title: "只改标题的本地草稿" });
  });

  it("builds worker and checker edits from the latest refreshed workUnit", async () => {
    const api = mockLiveTaskEditorApi();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    api.mutateCurrentTask((task) => ({
      ...task,
      updatedAt: "2026-05-25T01:10:00.000Z",
      workUnit: {
        ...task.workUnit,
        input: { text: "Leader 对话刷新后的最新输入" },
        acceptance: { rules: [...task.workUnit.acceptance.rules, "刷新后的验收规则"] },
      },
    }));
    fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));
    await waitFor(() => expect(api.taskRequests).toBe(2));

    fireEvent.change(screen.getByLabelText("Worker Agent"), { target: { value: "reviewer" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(api.patchBodies).toHaveLength(1));
    expect(api.patchBodies[0]).toEqual({
      workUnit: {
        ...api.currentTask.workUnit,
        workerAgentId: "reviewer",
      },
    });
  });

  it("blocks saving a dirty field when the same Task field changed after the draft opened", async () => {
    const api = mockLiveTaskEditorApi();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("Task 名称"), { target: { value: "旧草稿标题" } });

    api.mutateCurrentTask((task) => ({
      ...task,
      title: "Leader 已经更新的标题",
      workUnit: { ...task.workUnit, title: "Leader 已经更新的标题" },
      updatedAt: "2026-05-25T01:20:00.000Z",
    }));
    fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));
    await waitFor(() => expect(api.taskRequests).toBe(2));

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await within(container.querySelector(".task-edit-branch")!).findByText(/Task 已经在后台更新/)).toBeInTheDocument();
    expect(api.patchBodies).toHaveLength(0);
  });

  it("refreshes live Tasks after a successful shallow edit", async () => {
    const api = mockLiveTaskEditorApi();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    fireEvent.change(screen.getByLabelText("Task 名称"), { target: { value: "刷新后的 Task" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(api.taskRequests).toBe(2));
    await waitFor(() => {
      expect(container.querySelector('[data-task-id="task_research_medtrum"]')).toHaveTextContent("刷新后的 Task");
    });
    await waitFor(() => expect(screen.queryByText("请求失败 (500)")).toBeNull());
  });

  it("keeps the edit panel open and input intact when shallow save fails", async () => {
    mockLiveTaskEditorApi({ patchStatus: 500, patchError: "update failed" });
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    fireEvent.change(screen.getByLabelText("Task 名称"), { target: { value: "失败时保留的输入" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("update failed")).toBeInTheDocument();
    expect(container.querySelector(".task-edit-branch")).toBeTruthy();
    expect(screen.getByLabelText("Task 名称")).toHaveValue("失败时保留的输入");
  });

  it("shows Task mutation warnings as non-blocking edit notes", async () => {
    mockLiveTaskEditorApi({
      warnings: ["workerAgentId and checkerAgentId are the same; self-checking weakens independent acceptance."],
    });
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    fireEvent.change(screen.getByLabelText("Worker Agent"), { target: { value: "main" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await within(container.querySelector(".task-edit-branch")!).findByText(/self-checking weakens independent acceptance/)).toBeInTheDocument();
    expect(screen.queryByText("请求失败 (500)")).toBeNull();
  });

  it("opens a soft archive confirmation from the Task delete action", async () => {
    const { container } = render(<App />);

    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    const confirm = container.querySelector(".task-delete-confirm") as HTMLElement | null;
    expect(confirm).toBeTruthy();
    expect(within(confirm!).getByText(/archive 软归档/)).toBeInTheDocument();
    expect(within(confirm!).getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(within(confirm!).getByRole("button", { name: "确认删除" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cancels Task delete confirmation without archiving", async () => {
    const api = mockLiveTaskEditorApi();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(api.archiveRequests).toBe(0);
    expect(container.querySelector(".task-delete-confirm")).toBeNull();
    expect(container.querySelector(".task-action-branch")).toBeTruthy();
  });

  it("archives a live Task from the delete confirmation and refreshes the atlas", async () => {
    const api = mockLiveTaskEditorApi();
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(api.archiveRequests).toBe(1));
    await waitFor(() => expect(api.taskRequests).toBe(2));
    await waitFor(() => {
      expect(container.querySelector('[data-task-id="task_research_medtrum"]')).toBeNull();
    });
    expect(container.querySelector(".task-action-branch")).toBeNull();
  });

  it("keeps the Task delete confirmation open when archive fails", async () => {
    mockLiveTaskEditorApi({ archiveStatus: 500, archiveError: "archive failed" });
    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    fireEvent.click(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(await screen.findByText("archive failed")).toBeInTheDocument();
    expect(container.querySelector(".task-delete-confirm")).toBeTruthy();
    expect(container.querySelector('[data-task-id="task_research_medtrum"]')).toBeTruthy();
  });

  it("switches the embedded playground branch to the clicked agent id", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(screen.getByRole("button", { name: /搜索 Agent[\s\S]*search/ }));

    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));
    expect(container.querySelector("iframe")?.getAttribute("src")).toContain("agentId=main");

    const searchNode = within(getAtlasNodes(container)).getByRole("button", { name: /搜索 Agent/ });
    firePointer(searchNode, "pointerdown", { pointerId: 12, clientX: 220, clientY: 80 });
    firePointer(searchNode, "pointerup", { pointerId: 12, clientX: 220, clientY: 80, buttons: 0 });
    fireEvent.click(searchNode);

    const branch = container.querySelector(".agent-playground-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    expect(within(branch!).getByText("搜索 Agent")).toBeInTheDocument();
    expect(branch!.querySelector("iframe")?.getAttribute("src")).toContain("/playground?view=chat&agentId=search");
    expect(branch!.querySelector("iframe")?.getAttribute("src")).toContain("embed=team-console");
  });

  it("drags the embedded playground branch by its title bar", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    const branchShell = container.querySelector(".emap-agent-branch-shell") as HTMLElement | null;
    const titleBar = container.querySelector(".agent-playground-branch-head") as HTMLElement | null;
    const atlasStage = container.querySelector(".execution-map-scroll") as HTMLElement | null;
    expect(branchShell).toBeTruthy();
    expect(titleBar).toBeTruthy();
    expect(atlasStage).toBeTruthy();
    const initialLeft = Number.parseFloat(branchShell!.style.left);
    const initialTop = Number.parseFloat(branchShell!.style.top);
    const initialStageTransform = atlasStage!.style.transform;

    firePointer(titleBar!, "pointerdown", { pointerId: 21, clientX: 300, clientY: 120 });
    firePointer(titleBar!, "pointermove", { pointerId: 21, clientX: 380, clientY: 155 });
    firePointer(titleBar!, "pointerup", { pointerId: 21, clientX: 380, clientY: 155, buttons: 0 });

    expect(Number.parseFloat(branchShell!.style.left)).toBeCloseTo(initialLeft + 80, 4);
    expect(Number.parseFloat(branchShell!.style.top)).toBeCloseTo(initialTop + 35, 4);
    expect(atlasStage!.style.transform).toBe(initialStageTransform);
  });

  it("allows dragging the embedded playground branch above the atlas origin", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    const branchShell = container.querySelector(".emap-agent-branch-shell") as HTMLElement | null;
    const titleBar = container.querySelector(".agent-playground-branch-head") as HTMLElement | null;
    expect(branchShell).toBeTruthy();
    expect(titleBar).toBeTruthy();
    const initialTop = Number.parseFloat(branchShell!.style.top);

    firePointer(titleBar!, "pointerdown", { pointerId: 25, clientX: 300, clientY: 120 });
    firePointer(titleBar!, "pointermove", { pointerId: 25, clientX: 300, clientY: -80 });
    firePointer(titleBar!, "pointerup", { pointerId: 25, clientX: 300, clientY: -80, buttons: 0 });

    expect(Number.parseFloat(branchShell!.style.top)).toBeCloseTo(initialTop - 200, 4);
  });

  it("anchors the embedded playground branch link to the nearest sides after dragging below the agent", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    const titleBar = container.querySelector(".agent-playground-branch-head") as HTMLElement | null;
    expect(titleBar).toBeTruthy();

    firePointer(titleBar!, "pointerdown", { pointerId: 24, clientX: 500, clientY: 120 });
    firePointer(titleBar!, "pointermove", { pointerId: 24, clientX: 172, clientY: 420 });
    firePointer(titleBar!, "pointerup", { pointerId: 24, clientX: 172, clientY: 420, buttons: 0 });

    const branchLink = container.querySelector(".emap-link-agent-branch") as SVGPathElement | null;
    expect(branchLink).toBeTruthy();
    expect(branchLink!.getAttribute("d")).toContain("M500,112");
    expect(branchLink!.getAttribute("d")).not.toContain("M640,56");
  });

  it("resizes the embedded playground branch from the bottom-right handle", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    const branchShell = container.querySelector(".emap-agent-branch-shell") as HTMLElement | null;
    const resizeHandle = container.querySelector(".emap-agent-branch-resize-handle") as HTMLElement | null;
    expect(branchShell).toBeTruthy();
    expect(resizeHandle).toBeTruthy();
    const initialWidth = Number.parseFloat(branchShell!.style.width);
    const initialHeight = Number.parseFloat(branchShell!.style.height);

    firePointer(resizeHandle!, "pointerdown", { pointerId: 22, clientX: 900, clientY: 620 });
    firePointer(resizeHandle!, "pointermove", { pointerId: 22, clientX: 1020, clientY: 690 });
    firePointer(resizeHandle!, "pointerup", { pointerId: 22, clientX: 1020, clientY: 690, buttons: 0 });

    expect(Number.parseFloat(branchShell!.style.width)).toBeCloseTo(initialWidth + 120, 4);
    expect(Number.parseFloat(branchShell!.style.height)).toBeCloseTo(initialHeight + 70, 4);
  });

  it("maximizes an embedded playground branch outside the scaled canvas", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }));

    fireEvent.click(screen.getByRole("button", { name: "最大化对话分支" }));

    const overlay = container.querySelector(".emap-maximized-branch-shell") as HTMLElement | null;
    expect(overlay).toBeTruthy();
    expect(overlay!.parentElement).toHaveClass("execution-map-container");
    expect(container.querySelector(".execution-map-scroll .emap-agent-branch-shell")).toBeNull();
    expect(overlay!.querySelector(".agent-playground-iframe")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "还原对话分支" }));

    expect(container.querySelector(".emap-maximized-branch-shell")).toBeNull();
    expect(container.querySelector(".execution-map-scroll .emap-agent-branch-shell")).toBeTruthy();
  });

  it("drags an agent card by world coordinates without opening the embedded branch", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(screen.getByRole("button", { name: "放大" }));

    const atlas = getAtlas(container);
    const agentNode = within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }) as HTMLElement;
    const initialLeft = Number.parseFloat(agentNode.style.left);
    const initialTop = Number.parseFloat(agentNode.style.top);

    firePointer(agentNode, "pointerdown", { pointerId: 7, clientX: 100, clientY: 100 });
    firePointer(agentNode, "pointermove", { pointerId: 7, clientX: 155, clientY: 133 });
    firePointer(agentNode, "pointerup", { pointerId: 7, clientX: 155, clientY: 133, buttons: 0 });
    fireEvent.click(agentNode);

    expect(Number.parseFloat(agentNode.style.left)).toBeCloseTo(initialLeft + 50, 4);
    expect(Number.parseFloat(agentNode.style.top)).toBeCloseTo(initialTop + 30, 4);
    expect(atlas).toHaveAttribute("data-agent-focus", "none");
    expect(container.querySelector(".agent-playground-branch")).toBeNull();
  });

  it("box-selects atlas nodes and drags the selected set together", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

    const atlas = getAtlas(container);
    const atlasNodes = getAtlasNodes(container);
    const agentNode = within(atlasNodes).getByRole("button", { name: /主 Agent/ }) as HTMLElement;
    const taskNode = await within(atlasNodes).findByRole("button", { name: /调查 Medtrum 云资产/ }) as HTMLElement;
    const initialAgentLeft = Number.parseFloat(agentNode.style.left);
    const initialAgentTop = Number.parseFloat(agentNode.style.top);
    const initialTaskLeft = Number.parseFloat(taskNode.style.left);
    const initialTaskTop = Number.parseFloat(taskNode.style.top);

    firePointer(atlas, "pointerdown", { pointerId: 31, clientX: 220, clientY: 0, shiftKey: true });
    firePointer(atlas, "pointermove", { pointerId: 31, clientX: 720, clientY: 420, shiftKey: true });
    firePointer(atlas, "pointerup", { pointerId: 31, clientX: 720, clientY: 420, buttons: 0, shiftKey: true });

    expect(agentNode).toHaveClass("is-atlas-selected");
    expect(taskNode).toHaveClass("is-atlas-selected");

    firePointer(agentNode, "pointerdown", { pointerId: 32, clientX: 380, clientY: 40 });
    firePointer(agentNode, "pointermove", { pointerId: 32, clientX: 440, clientY: 80 });
    firePointer(agentNode, "pointerup", { pointerId: 32, clientX: 440, clientY: 80, buttons: 0 });

    expect(Number.parseFloat(agentNode.style.left)).toBeCloseTo(initialAgentLeft + 60, 4);
    expect(Number.parseFloat(agentNode.style.top)).toBeCloseTo(initialAgentTop + 40, 4);
    expect(Number.parseFloat(taskNode.style.left)).toBeCloseTo(initialTaskLeft + 60, 4);
    expect(Number.parseFloat(taskNode.style.top)).toBeCloseTo(initialTaskTop + 40, 4);
    expect(container.querySelector(".agent-playground-branch")).toBeNull();
  });

  it("allows a later click to expand an agent branch after a drag gesture", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加 Agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));

    const agentNode = within(getAtlasNodes(container)).getByRole("button", { name: /主 Agent/ }) as HTMLElement;

    firePointer(agentNode, "pointerdown", { pointerId: 9, clientX: 100, clientY: 100 });
    firePointer(agentNode, "pointermove", { pointerId: 9, clientX: 150, clientY: 130 });
    firePointer(agentNode, "pointerup", { pointerId: 9, clientX: 150, clientY: 130, buttons: 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    fireEvent.click(agentNode);

    expect(getAtlas(container)).toHaveAttribute("data-agent-focus", "main");
    expect(container.querySelector(".agent-playground-branch")).toBeTruthy();
    expect(within(container.querySelector(".agent-playground-branch") as HTMLElement).getByText("主 Agent")).toBeInTheDocument();
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
    expect(screen.getByText("示例：")).toBeInTheDocument();
  });

  it("localizes visible fixture menu labels", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "发现 + 逐项处理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "任务拆分" })).toBeInTheDocument();
    expect(screen.queryByText("Discovery + ForEach")).toBeNull();
    expect(screen.queryByText("Decomposition split")).toBeNull();
  });

  it("switches back to the old demo fixture for runtime atlas regression", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "顺序 run" }));

    expect(screen.getByText("执行运行")).toBeInTheDocument();
    expect(screen.getByText("Research vendor A")).toBeInTheDocument();
  });

  it("keeps Live API on a clean agent workspace until a run is requested", async () => {
    const liveTask = mockTeamTasks[0]!;
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [liveTask] }), { status: 200 }));

    render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenNthCalledWith(1, "/v1/agents");
    expect(fetch).toHaveBeenNthCalledWith(2, "/v1/agents/status", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    expect(fetch).toHaveBeenNthCalledWith(3, "/v1/team/tasks");
    expect(screen.getByRole("button", { name: "Agent workspace" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "最新 Run" })).not.toHaveClass("active");
    expect(screen.queryByText("执行运行")).toBeNull();
    expect(screen.queryByText("Research vendor A")).toBeNull();
    expect(fetch).not.toHaveBeenCalledWith("/v1/team/plans");
    expect(fetch).not.toHaveBeenCalledWith("/v1/team/runs");
    expect(await screen.findByText(liveTask.title)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加 Agent" })).toBeEnabled();
  });

  it("fetches live plans, runs, and selected run detail when latest Run is requested", async () => {
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([plan]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([run]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(run), { status: 200 }));

    render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole("button", { name: "最新 Run" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
    expect(fetch).toHaveBeenNthCalledWith(1, "/v1/agents");
    expect(fetch).toHaveBeenNthCalledWith(2, "/v1/agents/status", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    expect(fetch).toHaveBeenNthCalledWith(3, "/v1/team/tasks");
    expect(fetch).toHaveBeenNthCalledWith(4, "/v1/team/plans");
    expect(fetch).toHaveBeenNthCalledWith(5, "/v1/team/runs");
    expect(fetch).toHaveBeenNthCalledWith(6, "/v1/team/runs/run_seq_001");
  });

  it("loads live agent catalog when switching to Live API", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [{ agentId: "main", name: "主 Agent", status: "idle" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [] }), { status: 200 }));

    render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenNthCalledWith(1, "/v1/agents");
    expect(fetch).toHaveBeenNthCalledWith(2, "/v1/agents/status", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    expect(fetch).toHaveBeenNthCalledWith(3, "/v1/team/tasks");
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
    expect(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ })).toBeInTheDocument();
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
    expect(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

    expect(await screen.findByText("请求失败 (500)")).toBeInTheDocument();
    expect(within(getAtlasNodes(container)).getByRole("button", { name: /调查 Medtrum 云资产/ })).toBeInTheDocument();
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
    expect(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));
    expect(await screen.findByText("请求失败 (500)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

    expect(await within(getAtlasNodes(container)).findByRole("button", { name: /错误恢复后的 Task/ })).toBeInTheDocument();
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
    expect(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));
    const refreshingButton = await screen.findByRole("button", { name: "刷新中..." });
    expect(refreshingButton).toBeDisabled();
    fireEvent.click(refreshingButton);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(taskRequests).toBe(2);

    refreshResponse.resolve(new Response(JSON.stringify({ tasks: [firstTask, secondTask] }), { status: 200 }));

    expect(await within(getAtlasNodes(container)).findByRole("button", { name: /刷新防重后的 Task/ })).toBeInTheDocument();
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

  it("refreshes live Task cards after leaving a Task creation branch for an existing Task branch", async () => {
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
    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    expect(taskRequests).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "创建 Task" }));
    fireEvent.click(await screen.findByRole("button", { name: /主 Agent[\s\S]*main/ }));
    fireEvent.click(taskNode);

    await waitFor(() => expect(taskRequests).toBe(2));
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

    const firstAgentNode = within(getAtlasNodes(first.container)).getByRole("button", { name: /主 Agent/ }) as HTMLElement;
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

    const restoredAgentNode = await within(getAtlasNodes(second.container)).findByRole("button", { name: /主 Agent/ }) as HTMLElement;
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

    const firstTaskNode = await within(getAtlasNodes(first.container)).findByRole("button", { name: /调查 Medtrum 云资产/ }) as HTMLElement;
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
    const restoredTaskNode = await within(getAtlasNodes(second.container)).findByRole("button", { name: /调查 Medtrum 云资产/ }) as HTMLElement;
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

    const firstTaskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }) as HTMLElement;
    const firstTaskX = Number.parseFloat(firstTaskNode.style.left);
    const firstTaskY = Number.parseFloat(firstTaskNode.style.top);

    fireEvent.click(screen.getByRole("button", { name: "刷新 Task" }));

    const secondTaskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /刷新后只存布局的 Task/ }) as HTMLElement;
    const refreshedFirstTaskNode = within(getAtlasNodes(container)).getByRole("button", { name: /调查 Medtrum 云资产/ }) as HTMLElement;
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

  it("refreshes live Task cards when returning to Agent workspace", async () => {
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
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
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
      if (url === "/v1/team/plans") return new Response(JSON.stringify([plan]), { status: 200 });
      if (url === "/v1/team/runs") return new Response(JSON.stringify([run]), { status: 200 });
      if (url === "/v1/team/runs/run_seq_001") return new Response(JSON.stringify(run), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    expect(await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "最新 Run" }));
    expect(await screen.findByText("Research vendor A")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Agent workspace" }));

    await waitFor(() => expect(taskRequests).toBe(2));
    expect(await within(getAtlasNodes(container)).findByRole("button", { name: /刷新后出现的新 Task/ })).toBeInTheDocument();
  });

  it("keeps dragged live Task positions after a live Task refresh", async () => {
    const liveTask = mockTeamTasks[0]!;
    const plan = makeSequentialPlan();
    const run = makeSequentialRun();
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
      if (url === "/v1/team/plans") return new Response(JSON.stringify([plan]), { status: 200 });
      if (url === "/v1/team/runs") return new Response(JSON.stringify([run]), { status: 200 });
      if (url === "/v1/team/runs/run_seq_001") return new Response(JSON.stringify(run), { status: 200 });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }) as HTMLElement;
    firePointer(taskNode, "pointerdown", { pointerId: 42, clientX: 120, clientY: 120 });
    firePointer(taskNode, "pointermove", { pointerId: 42, clientX: 190, clientY: 155 });
    firePointer(taskNode, "pointerup", { pointerId: 42, clientX: 190, clientY: 155, buttons: 0 });

    fireEvent.click(screen.getByRole("button", { name: "最新 Run" }));
    expect(await screen.findByText("Research vendor A")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Agent workspace" }));

    await waitFor(() => expect(taskRequests).toBe(2));
    const refreshedTaskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ }) as HTMLElement;
    expect(Number.parseFloat(refreshedTaskNode.style.left)).toBeCloseTo(350, 4);
    expect(Number.parseFloat(refreshedTaskNode.style.top)).toBeCloseTo(255, 4);
  });

  it("renders the selected live run after loading", async () => {
    const plan = {
      ...makeSequentialPlan(),
      planId: "plan_live_001",
      tasks: [
        {
          ...makeSequentialPlan().tasks[0],
          id: "live_task_1",
          title: "Live-only vendor task",
        },
      ],
    };
    const run = {
      ...makeSequentialRun(),
      runId: "run_live_001",
      planId: "plan_live_001",
      taskStates: {
        live_task_1: makeSequentialRun().taskStates.task_1,
      },
      summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([plan]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([run]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(run), { status: 200 }));

    render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole("button", { name: "最新 Run" }));

    expect(await screen.findByText("Live-only vendor task")).toBeInTheDocument();
  });

  it("keeps live agent workspace usable when no live team run exists", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        agents: [{ agentId: "main", name: "主 Agent", description: "默认综合 agent" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ agents: [{ agentId: "main", name: "主 Agent", status: "idle" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [] }), { status: 200 }));

    const { container } = render(<App />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "live" } });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
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

  it("vite proxy includes the Team Console API surface", () => {
    const config = readFileSync("vite.config.ts", "utf8");
    expect(config).toContain('"/v1/team"');
    expect(config).toContain('"/v1/agents"');
    expect(config).toContain('"/v1/assets"');
    expect(config).toContain("VITE_TEAM_CONSOLE_API_TARGET");
    expect(config).not.toContain('"/v1/conns"');
    expect(config).not.toContain('"/v1/activity"');
    expect(config).not.toContain('"/playground"');
    expect(config).toContain("teamApiTarget");
  });

  it("keeps atlas content from stretching the app width during node drag", () => {
    const appCss = readFileSync("src/app/app.css", "utf8");
    const mapCss = readFileSync("src/graph/execution-map.css", "utf8");

    expect(appCss).toMatch(/\.app-main\s*{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(appCss).toMatch(/\.workspace\s*{[^}]*min-width:\s*0;/s);
    expect(appCss).toMatch(/\.workspace-map\s*{[^}]*min-width:\s*0;/s);
    expect(mapCss).toMatch(/\.execution-map-container\s*{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s);
  });

  it("uses a warm accent for busy Agent cards", () => {
    const mapCss = readFileSync("src/graph/execution-map.css", "utf8");
    const busyRule = mapCss.match(/\.emap-agent-node\[data-agent-run-state="busy"\]\s*{[^}]*}/)?.[0];
    const busyBarRule = mapCss.match(/\.emap-agent-node\[data-agent-run-state="busy"\]\s+\.emap-node-status-bar\s*{[^}]*}/)?.[0];
    const busyPillRule = mapCss.match(/\.emap-agent-node\[data-agent-run-state="busy"\]\s+\.emap-node-state-pill\.running\s*{[^}]*}/)?.[0];

    expect(busyRule).toContain("rgba(255, 104, 64");
    expect(busyRule).not.toContain("rgba(121, 216, 208");
    expect(busyBarRule).toContain("rgb(255, 104, 64)");
    expect(busyPillRule).toContain("rgba(255, 104, 64");
  });

  it("documents Agent Atlas mock and live behavior", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("Agent Atlas MVP");
    expect(readme).toContain("Agent workspace");
    expect(readme).toContain("/v1/agents");
    expect(readme).toContain("/v1/agents/status");
    expect(readme).toContain("真实状态投到卡片状态条和状态 pill");
    expect(readme).toContain("Agent 分支卡片");
    expect(readme).toContain("/playground?view=chat&agentId=<agentId>");
    expect(readme).toContain("embed=team-console");
    expect(readme).toContain("主 `/playground` 负责读取 `agentId` URL hint");
    expect(readme).toContain("不写入主页面共用的 active-agent localStorage");
    expect(readme).toContain("主 Agent 卡片打开主 Agent 对话");
    expect(readme).toContain("搜索 Agent 卡片打开搜索 Agent 对话");
    expect(readme).toContain("允许覆盖其他节点");
    expect(readme).toContain("拖动分支标题栏调整位置");
    expect(readme).toContain("右下角调整分支宽高");
    expect(readme).toContain("Shift 在空白画布框选");
    expect(readme).toContain("最大化按钮");
    expect(readme).toContain(".emap-atlas-card");
    expect(readme).toContain("平滑三次贝塞尔曲线");
    expect(readme).toContain("Live API 下已添加 Agent 与拖动后的画布位置会写入浏览器 `localStorage`");
    expect(readme).toContain("这只保存 Team Console 画布引用位置，不修改真实 Agent profile");
    expect(readme).toContain("Task 内部包含一个 WorkUnit");
    expect(readme).toContain("leaderAgentId");
    expect(readme).toContain("/v1/team/tasks");
    expect(readme).toContain("/team-task");
    expect(readme).toContain("teamTaskId=<taskId>");
    expect(readme).toContain("创建 Task");
    expect(readme).toContain("Team Console 只打开 leader Agent iframe，不直接创建 Task");
    expect(readme).toContain("teamTaskMode=create");
    expect(readme).toContain("`/team-task` skill 调用 `POST /v1/team/tasks`");
    expect(readme).toContain("手动点击“刷新 Task”");
    expect(readme).toContain("关闭创建分支后会重新请求 `GET /v1/team/tasks`");
    expect(readme).toContain("点击 Task 卡片会先展开紧凑 Task 操作菜单节点");
    expect(readme).toContain("POST /v1/team/tasks/:taskId/runs");
    expect(readme).toContain("GET /v1/team/task-runs/:runId/tasks/:taskId/attempts");
    expect(readme).toContain("Run observer");
    expect(readme).toContain("只展示 Agent 名字（从 agentsById 解析）、文件名和路径");
    expect(readme).toContain("不会进入 `/v1/team/runs` 的 Plan run 列表");
    expect(readme).toContain("第一版 Task run 只执行 WorkUnit 的 worker → checker");
    expect(readme).toContain("Task → 菜单 → 二级节点");
    expect(readme).toContain("“编辑”是浅编辑节点");
    expect(readme).toContain("base snapshot 和 dirty fields");
    expect(readme).toContain("同一字段在草稿打开后已被后台刷新改变");
    expect(readme).toContain("POST /v1/team/tasks/:taskId/archive");
    expect(readme).toContain("Team Console 不再维护本地 transcript + composer");
    expect(readme).not.toContain("Focus Mode 是特殊 Agent 对话界面");
    expect(readme).not.toContain("文件上传与文件库在 Live 模式接 `/v1/assets`");
    expect(readme).not.toContain("当前聊天仍是非 stream scoped chat");

    const runtimeDoc = readFileSync("../../docs/team-runtime.md", "utf8");
    expect(runtimeDoc).toContain("单击 Agent 节点会展开 Agent 分支卡片");
    expect(runtimeDoc).toContain("GET /v1/agents/status");
    expect(runtimeDoc).toContain("卡片状态条与状态 pill 会随真实运行态显示空闲、运行中或状态未知");
    expect(runtimeDoc).toContain("/playground?view=chat&agentId=<agentId>");
    expect(runtimeDoc).toContain("embed=team-console");
    expect(runtimeDoc).toContain("Team Console 不再维护本地 transcript + composer");
    expect(runtimeDoc).toContain("主 `/playground` 读取 `agentId` URL hint");
    expect(runtimeDoc).toContain("active-agent localStorage");
    expect(runtimeDoc).toContain("允许覆盖其他节点");
    expect(runtimeDoc).toContain("拖动分支标题栏移动分支");
    expect(runtimeDoc).toContain("右下角调整分支宽高");
    expect(runtimeDoc).toContain("Shift 框选多个 Agent / Task 节点");
    expect(runtimeDoc).toContain("最大化到未缩放画布 overlay");
    expect(runtimeDoc).toContain(".emap-dialog-branch");
    expect(runtimeDoc).toContain("Live API 下已添加 Agent 与拖动后的画布位置会写入浏览器 `localStorage`");
    expect(runtimeDoc).toContain("这只保存 Team Console 画布引用位置，不修改真实 Agent profile");
    expect(runtimeDoc).toContain("Task 内部包含一个 WorkUnit");
    expect(runtimeDoc).toContain("leader Agent");
    expect(runtimeDoc).toContain("Team Console 不解析 iframe 聊天文本创建 Task");
    expect(runtimeDoc).toContain("Team Canvas Task frontend workflow");
    expect(runtimeDoc).toContain("teamTaskMode=create");
    expect(runtimeDoc).toContain("teamTaskMode=edit");
    expect(runtimeDoc).toContain("点击已有 Task 先打开紧凑操作菜单节点");
    expect(runtimeDoc).toContain("POST /v1/team/tasks/:taskId/runs");
    expect(runtimeDoc).toContain(".data/team/task-runs/runs/<runId>");
    expect(runtimeDoc).toContain("第一版 Task run 只执行 `workUnit.workerAgentId` 和 `workUnit.checkerAgentId`");
    expect(runtimeDoc).toContain("Run 观察节点");
    expect(runtimeDoc).toContain("attempt metadata 和 attempt files");
    expect(runtimeDoc).toContain("SSE 观察流仍是后续后端能力");
    expect(runtimeDoc).toContain("base snapshot + dirty fields");
    expect(runtimeDoc).toContain("input text、output contract、acceptance rules");
    expect(runtimeDoc).toContain("关闭创建分支、浅编辑保存成功、归档成功后会重新请求 `GET /v1/team/tasks`");
    expect(runtimeDoc).not.toContain("Focus Mode 特殊 Agent 对话界面");
    expect(runtimeDoc).not.toContain("WorkUnit run 未实现");
  });

  it("drags observer status panel and updates connector", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-status-node")).toBeTruthy();
    });

    const allShells = () => Array.from(container.querySelectorAll(".emap-task-child-branch-shell"));
    const statusShell = allShells().find((s) => s.querySelector(".emap-observer-status-node")) as HTMLElement | undefined;
    expect(statusShell).toBeTruthy();

    const initialLeft = Number.parseFloat(statusShell!.style.left);
    const initialTop = Number.parseFloat(statusShell!.style.top);

    firePointer(statusShell!, "pointerdown", { pointerId: 71, clientX: 600, clientY: 300 });
    firePointer(statusShell!, "pointermove", { pointerId: 71, clientX: 660, clientY: 340 });
    firePointer(statusShell!, "pointerup", { pointerId: 71, clientX: 660, clientY: 340, buttons: 0 });

    expect(Number.parseFloat(statusShell!.style.left)).toBeCloseTo(initialLeft + 60, 4);
    expect(Number.parseFloat(statusShell!.style.top)).toBeCloseTo(initialTop + 40, 4);

    const connectorPaths = container.querySelectorAll(".emap-link-task-child-branch");
    expect(connectorPaths.length).toBeGreaterThanOrEqual(1);
  });

  it("drags file node without triggering detail expand when drag exceeds threshold", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-status-node")).toBeTruthy();
    });

    const workerFileNode = await waitFor(() => {
      const node = container.querySelector('.emap-observer-file-node[data-file-kind="worker"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });

    const allShells = () => Array.from(container.querySelectorAll(".emap-task-child-branch-shell"));
    const workerShell = allShells().find((s) => s.querySelector('.emap-observer-file-node[data-file-kind="worker"]')) as HTMLElement | undefined;
    expect(workerShell).toBeTruthy();
    const initialLeft = Number.parseFloat(workerShell!.style.left);

    firePointer(workerFileNode, "pointerdown", { pointerId: 72, clientX: 500, clientY: 300 });
    firePointer(workerFileNode, "pointermove", { pointerId: 72, clientX: 560, clientY: 340 });
    firePointer(workerFileNode, "pointerup", { pointerId: 72, clientX: 560, clientY: 340, buttons: 0 });

    expect(Number.parseFloat(workerShell!.style.left)).toBeCloseTo(initialLeft + 60, 4);
    expect(container.querySelector(".emap-observer-file-detail-node")).toBeNull();
  });

  it("drags file detail node and resizes it independently", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-status-node")).toBeTruthy();
    });

    const workerFileNode = await waitFor(() => {
      const node = container.querySelector('.emap-observer-file-node[data-file-kind="worker"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.click(workerFileNode);

    await waitFor(() => {
      const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
      expect(detail).toBeTruthy();
    });

    const allShells = () => Array.from(container.querySelectorAll(".emap-task-child-branch-shell"));
    const detailShell = allShells().find((s) => s.querySelector(".emap-observer-file-detail-node")) as HTMLElement | undefined;
    expect(detailShell).toBeTruthy();

    const initialLeft = Number.parseFloat(detailShell!.style.left);
    const initialTop = Number.parseFloat(detailShell!.style.top);

    firePointer(detailShell!, "pointerdown", { pointerId: 73, clientX: 700, clientY: 350 });
    firePointer(detailShell!, "pointermove", { pointerId: 73, clientX: 750, clientY: 380 });
    firePointer(detailShell!, "pointerup", { pointerId: 73, clientX: 750, clientY: 380, buttons: 0 });

    expect(Number.parseFloat(detailShell!.style.left)).toBeCloseTo(initialLeft + 50, 4);
    expect(Number.parseFloat(detailShell!.style.top)).toBeCloseTo(initialTop + 30, 4);

    const resizeHandle = detailShell!.querySelector(".emap-panel-resize-handle") as HTMLElement | null;
    expect(resizeHandle).toBeTruthy();
    const preResizeWidth = Number.parseFloat(detailShell!.style.width);

    firePointer(resizeHandle!, "pointerdown", { pointerId: 74, clientX: 800, clientY: 500 });
    firePointer(resizeHandle!, "pointermove", { pointerId: 74, clientX: 880, clientY: 560 });
    firePointer(resizeHandle!, "pointerup", { pointerId: 74, clientX: 880, clientY: 560, buttons: 0 });

    expect(Number.parseFloat(detailShell!.style.width)).toBeCloseTo(preResizeWidth + 80, 4);
  });

  it("renders Markdown file detail with safe marked-based output", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-status-node")).toBeTruthy();
    });

    const resultFileNode = await waitFor(() => {
      const node = container.querySelector('.emap-observer-file-node[data-file-kind="result"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.click(resultFileNode);

    const detailNode = await waitFor(() => {
      const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
      expect(detail).toBeTruthy();
      return detail!;
    });

    // accepted-result.md contains "# Mock accepted result" which should be rendered as <h1> or <h2> via marked
    expect(detailNode.innerHTML).toContain("<h");
    expect(detailNode.innerHTML).toContain("Mock accepted result");
    // Must not contain the old hand-written parser class names
    expect(detailNode.querySelector(".task-run-md-body")).toBeNull();
    expect(detailNode.querySelector(".task-run-md-heading")).toBeNull();
  });

  it("renders Markdown table in file detail content", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-status-node")).toBeTruthy();
    });

    const workerFileNode = await waitFor(() => {
      const node = container.querySelector('.emap-observer-file-node[data-file-kind="worker"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.click(workerFileNode);

    const detailNode = await waitFor(() => {
      const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
      expect(detail).toBeTruthy();
      return detail!;
    });

    // Worker output contains "# Worker output" which marked renders as <h1>
    expect(detailNode.innerHTML).toContain("<h");
    expect(detailNode.innerHTML).toContain("Worker output");
    // Raw HTML like <script> and <details> must be escaped
    expect(detailNode.innerHTML).toContain("&lt;script&gt;");
    expect(detailNode.innerHTML).toContain("&lt;details&gt;");
    expect(detailNode.querySelector("script")).toBeNull();
    expect(detailNode.querySelector("details")).toBeNull();
  });

  it("expands file detail on normal pointerdown+up without drag movement", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-status-node")).toBeTruthy();
    });

    const workerFileNode = await waitFor(() => {
      const node = container.querySelector('.emap-observer-file-node[data-file-kind="worker"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });

    // pointerdown + pointerup at same position (no move) should NOT suppress click
    firePointer(workerFileNode, "pointerdown", { pointerId: 80, clientX: 500, clientY: 300 });
    firePointer(workerFileNode, "pointerup", { pointerId: 80, clientX: 500, clientY: 300, buttons: 0 });
    fireEvent.click(workerFileNode);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-file-detail-node")).toBeTruthy();
    });
  });

  it("suppresses file detail click after drag exceeds threshold", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-status-node")).toBeTruthy();
    });

    const workerFileNode = await waitFor(() => {
      const node = container.querySelector('.emap-observer-file-node[data-file-kind="worker"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });

    // pointerdown + pointermove exceeding threshold + pointerup + click
    firePointer(workerFileNode, "pointerdown", { pointerId: 81, clientX: 500, clientY: 300 });
    firePointer(workerFileNode, "pointermove", { pointerId: 81, clientX: 560, clientY: 340 });
    firePointer(workerFileNode, "pointerup", { pointerId: 81, clientX: 560, clientY: 340, buttons: 0 });
    // The drag suppress mechanism should swallow this click
    fireEvent.click(workerFileNode);

    // Detail must NOT appear because click was suppressed after drag
    expect(container.querySelector(".emap-observer-file-detail-node")).toBeNull();
  });

  it("detail connector follows file node after drag", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-status-node")).toBeTruthy();
    });

    const workerFileNode = await waitFor(() => {
      const node = container.querySelector('.emap-observer-file-node[data-file-kind="worker"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    // Open detail first
    fireEvent.click(workerFileNode);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-file-detail-node")).toBeTruthy();
    });

    const allShells = () => Array.from(container.querySelectorAll(".emap-task-child-branch-shell"));
    const workerShell = allShells().find((s) => s.querySelector('.emap-observer-file-node[data-file-kind="worker"]')) as HTMLElement | undefined;
    expect(workerShell).toBeTruthy();

    // Drag the file node to a new position
    const initialLeft = Number.parseFloat(workerShell!.style.left);
    firePointer(workerFileNode, "pointerdown", { pointerId: 82, clientX: 500, clientY: 300 });
    firePointer(workerFileNode, "pointermove", { pointerId: 82, clientX: 580, clientY: 360 });
    firePointer(workerFileNode, "pointerup", { pointerId: 82, clientX: 580, clientY: 360, buttons: 0 });

    const newLeft = Number.parseFloat(workerShell!.style.left);
    expect(newLeft).toBeCloseTo(initialLeft + 80, 4);

    // Find the detail panel connector and verify its source matches the file node's new position
    const detailShell = allShells().find((s) => s.querySelector(".emap-observer-file-detail-node")) as HTMLElement | undefined;
    expect(detailShell).toBeTruthy();

    // After drag, the detail connector's source x should reflect the file node's new position
    const allConnectors = container.querySelectorAll<SVGPathElement>(".emap-link-task-child-branch");
    expect(allConnectors.length).toBeGreaterThanOrEqual(2);
    // The detail panel's connector source x should be file node's new right edge (newLeft + width)
    const workerWidth = Number.parseFloat(workerShell!.style.width);
    const expectedSourceX = newLeft + workerWidth;
    // Check that at least one connector path starts near the expected source x
    let foundMatchingConnector = false;
    allConnectors.forEach((path) => {
      const d = path.getAttribute("d") ?? "";
      const match = d.match(/^M\s*([\d.]+)/);
      if (match && Math.abs(Number.parseFloat(match[1]!) - expectedSourceX) < 2) {
        foundMatchingConnector = true;
      }
    });
    expect(foundMatchingConnector).toBe(true);
  });

  it("removes fixed max-height on detail content areas", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-status-node")).toBeTruthy();
    });

    const checkerFileNode = await waitFor(() => {
      const node = container.querySelector('.emap-observer-file-node[data-file-kind="checker"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.click(checkerFileNode);

    const detailNode = await waitFor(() => {
      const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
      expect(detail).toBeTruthy();
      return detail!;
    });

    const pre = detailNode.querySelector("pre");
    if (pre) {
      const computedStyle = window.getComputedStyle(pre);
      expect(computedStyle.maxHeight).not.toBe("360px");
      expect(computedStyle.maxHeight).not.toBe("240px");
    }
  });

  // --- Task operation tree drag ---

  async function setupObserverOpen(container: HTMLElement) {
    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "运行" }));

    const runSummary = await within(branch!).findByRole("button", { name: /最近运行[\s\S]*已完成/ });
    fireEvent.click(runSummary);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-status-node")).toBeTruthy();
    });

    return { branch: branch! };
  }

  it("moves observer panels with existing overrides when dragging Task root", async () => {
    const { container } = render(<App />);
    await setupObserverOpen(container);

    const allShells = () => Array.from(container.querySelectorAll(".emap-task-child-branch-shell"));
    const statusShell = allShells().find((s) => s.querySelector(".emap-observer-status-node")) as HTMLElement | undefined;
    expect(statusShell).toBeTruthy();

    // Manually drag status panel to create a position override
    firePointer(statusShell!, "pointerdown", { pointerId: 90, clientX: 600, clientY: 300 });
    firePointer(statusShell!, "pointermove", { pointerId: 90, clientX: 660, clientY: 340 });
    firePointer(statusShell!, "pointerup", { pointerId: 90, clientX: 660, clientY: 340, buttons: 0 });

    const menuShell = container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
    expect(menuShell).toBeTruthy();
    const menuLeftBefore = Number.parseFloat(menuShell!.style.left);
    const menuTopBefore = Number.parseFloat(menuShell!.style.top);
    const statusLeftBefore = Number.parseFloat(statusShell!.style.left);
    const statusTopBefore = Number.parseFloat(statusShell!.style.top);

    // Drag Task root node
    const taskNode = container.querySelector(".emap-canvas-task-node") as HTMLElement | null;
    expect(taskNode).toBeTruthy();
    const dx = 60;
    const dy = 40;
    firePointer(taskNode!, "pointerdown", { pointerId: 91, clientX: 200, clientY: 200 });
    firePointer(taskNode!, "pointermove", { pointerId: 91, clientX: 200 + dx, clientY: 200 + dy });
    firePointer(taskNode!, "pointerup", { pointerId: 91, clientX: 200 + dx, clientY: 200 + dy, buttons: 0 });

    // Menu follows task root (derived from task position)
    expect(Number.parseFloat(menuShell!.style.left)).toBeCloseTo(menuLeftBefore + dx, 4);
    expect(Number.parseFloat(menuShell!.style.top)).toBeCloseTo(menuTopBefore + dy, 4);

    // Status panel with override also follows
    expect(Number.parseFloat(statusShell!.style.left)).toBeCloseTo(statusLeftBefore + dx, 4);
    expect(Number.parseFloat(statusShell!.style.top)).toBeCloseTo(statusTopBefore + dy, 4);
  });

  it("moves observer panels when dragging menu shell header", async () => {
    const { container } = render(<App />);
    await setupObserverOpen(container);

    const menuShell = container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
    expect(menuShell).toBeTruthy();

    const allShells = () => Array.from(container.querySelectorAll(".emap-task-child-branch-shell"));
    const statusShell = allShells().find((s) => s.querySelector(".emap-observer-status-node")) as HTMLElement | undefined;
    expect(statusShell).toBeTruthy();

    const menuLeftBefore = Number.parseFloat(menuShell!.style.left);
    const menuTopBefore = Number.parseFloat(menuShell!.style.top);
    const statusLeftBefore = Number.parseFloat(statusShell!.style.left);
    const statusTopBefore = Number.parseFloat(statusShell!.style.top);

    // Drag from the menu header area (not a button)
    const menuHeader = menuShell!.querySelector(".task-leader-branch-head") as HTMLElement | null;
    expect(menuHeader).toBeTruthy();
    firePointer(menuHeader!, "pointerdown", { pointerId: 92, clientX: 400, clientY: 200 });
    firePointer(menuHeader!, "pointermove", { pointerId: 92, clientX: 470, clientY: 250 });
    firePointer(menuHeader!, "pointerup", { pointerId: 92, clientX: 470, clientY: 250, buttons: 0 });

    const dx = 70;
    const dy = 50;

    expect(Number.parseFloat(menuShell!.style.left)).toBeCloseTo(menuLeftBefore + dx, 4);
    expect(Number.parseFloat(menuShell!.style.top)).toBeCloseTo(menuTopBefore + dy, 4);
    expect(Number.parseFloat(statusShell!.style.left)).toBeCloseTo(statusLeftBefore + dx, 4);
    expect(Number.parseFloat(statusShell!.style.top)).toBeCloseTo(statusTopBefore + dy, 4);
  });

  it("moves process panels when dragging Task root", async () => {
    const { container } = render(<App />);
    await setupObserverOpen(container);

    const allShells = () => Array.from(container.querySelectorAll(".emap-task-child-branch-shell"));
    const workerShell = allShells().find((s) => s.querySelector('.emap-observer-process-node[data-process-role="worker"]')) as HTMLElement | undefined;
    const checkerShell = allShells().find((s) => s.querySelector('.emap-observer-process-node[data-process-role="checker"]')) as HTMLElement | undefined;
    expect(workerShell).toBeTruthy();
    expect(checkerShell).toBeTruthy();

    const workerLeftBefore = Number.parseFloat(workerShell!.style.left);
    const workerTopBefore = Number.parseFloat(workerShell!.style.top);
    const checkerLeftBefore = Number.parseFloat(checkerShell!.style.left);
    const checkerTopBefore = Number.parseFloat(checkerShell!.style.top);

    const taskNode = container.querySelector(".emap-canvas-task-node") as HTMLElement | null;
    expect(taskNode).toBeTruthy();
    firePointer(taskNode!, "pointerdown", { pointerId: 101, clientX: 200, clientY: 200 });
    firePointer(taskNode!, "pointermove", { pointerId: 101, clientX: 250, clientY: 235 });
    firePointer(taskNode!, "pointerup", { pointerId: 101, clientX: 250, clientY: 235, buttons: 0 });

    expect(Number.parseFloat(workerShell!.style.left)).toBeCloseTo(workerLeftBefore + 50, 4);
    expect(Number.parseFloat(workerShell!.style.top)).toBeCloseTo(workerTopBefore + 35, 4);
    expect(Number.parseFloat(checkerShell!.style.left)).toBeCloseTo(checkerLeftBefore + 50, 4);
    expect(Number.parseFloat(checkerShell!.style.top)).toBeCloseTo(checkerTopBefore + 35, 4);
  });

  it("moves process panels when dragging menu shell header", async () => {
    const { container } = render(<App />);
    await setupObserverOpen(container);

    const allShells = () => Array.from(container.querySelectorAll(".emap-task-child-branch-shell"));
    const workerShell = allShells().find((s) => s.querySelector('.emap-observer-process-node[data-process-role="worker"]')) as HTMLElement | undefined;
    expect(workerShell).toBeTruthy();
    const workerLeftBefore = Number.parseFloat(workerShell!.style.left);
    const workerTopBefore = Number.parseFloat(workerShell!.style.top);

    const menuHeader = container.querySelector(".emap-task-branch-shell .task-leader-branch-head") as HTMLElement | null;
    expect(menuHeader).toBeTruthy();
    firePointer(menuHeader!, "pointerdown", { pointerId: 102, clientX: 400, clientY: 200 });
    firePointer(menuHeader!, "pointermove", { pointerId: 102, clientX: 455, clientY: 245 });
    firePointer(menuHeader!, "pointerup", { pointerId: 102, clientX: 455, clientY: 245, buttons: 0 });

    expect(Number.parseFloat(workerShell!.style.left)).toBeCloseTo(workerLeftBefore + 55, 4);
    expect(Number.parseFloat(workerShell!.style.top)).toBeCloseTo(workerTopBefore + 45, 4);
  });

  it("drags a Worker process node without moving sibling observer panels", async () => {
    const { container } = render(<App />);
    await setupObserverOpen(container);

    const allShells = () => Array.from(container.querySelectorAll(".emap-task-child-branch-shell"));
    const workerShell = allShells().find((s) => s.querySelector('.emap-observer-process-node[data-process-role="worker"]')) as HTMLElement | undefined;
    const checkerShell = allShells().find((s) => s.querySelector('.emap-observer-process-node[data-process-role="checker"]')) as HTMLElement | undefined;
    const statusShell = allShells().find((s) => s.querySelector(".emap-observer-status-node")) as HTMLElement | undefined;
    const workerFileShell = allShells().find((s) => s.querySelector('.emap-observer-file-node[data-file-kind="worker"]')) as HTMLElement | undefined;
    expect(workerShell).toBeTruthy();
    expect(checkerShell).toBeTruthy();
    expect(statusShell).toBeTruthy();
    expect(workerFileShell).toBeTruthy();

    const workerLeftBefore = Number.parseFloat(workerShell!.style.left);
    const workerTopBefore = Number.parseFloat(workerShell!.style.top);
    const checkerLeftBefore = Number.parseFloat(checkerShell!.style.left);
    const checkerTopBefore = Number.parseFloat(checkerShell!.style.top);
    const statusLeftBefore = Number.parseFloat(statusShell!.style.left);
    const statusTopBefore = Number.parseFloat(statusShell!.style.top);
    const fileLeftBefore = Number.parseFloat(workerFileShell!.style.left);
    const fileTopBefore = Number.parseFloat(workerFileShell!.style.top);

    firePointer(workerShell!, "pointerdown", { pointerId: 103, clientX: 940, clientY: 350 });
    firePointer(workerShell!, "pointermove", { pointerId: 103, clientX: 1010, clientY: 390 });
    firePointer(workerShell!, "pointerup", { pointerId: 103, clientX: 1010, clientY: 390, buttons: 0 });

    expect(Number.parseFloat(workerShell!.style.left)).toBeCloseTo(workerLeftBefore + 70, 4);
    expect(Number.parseFloat(workerShell!.style.top)).toBeCloseTo(workerTopBefore + 40, 4);
    expect(Number.parseFloat(checkerShell!.style.left)).toBeCloseTo(checkerLeftBefore, 4);
    expect(Number.parseFloat(checkerShell!.style.top)).toBeCloseTo(checkerTopBefore, 4);
    expect(Number.parseFloat(statusShell!.style.left)).toBeCloseTo(statusLeftBefore, 4);
    expect(Number.parseFloat(statusShell!.style.top)).toBeCloseTo(statusTopBefore, 4);
    expect(Number.parseFloat(workerFileShell!.style.left)).toBeCloseTo(fileLeftBefore, 4);
    expect(Number.parseFloat(workerFileShell!.style.top)).toBeCloseTo(fileTopBefore, 4);
  });

  it("does not toggle a process tool group from the suppressed click after dragging the process panel", async () => {
    const { container } = render(<App />);
    await setupObserverOpen(container);

    const workerProcessNode = container.querySelector('.emap-observer-process-node[data-process-role="worker"]') as HTMLElement | null;
    expect(workerProcessNode).toBeTruthy();
    const searchGroup = workerProcessNode!.querySelector('.emap-process-tool-group[data-tool-group-id="tool-worker-search"]') as HTMLElement | null;
    expect(searchGroup).toBeTruthy();
    expect(searchGroup).toHaveTextContent("找到官网、云平台和公开登录入口线索");

    const workerShell = workerProcessNode!.closest(".emap-task-child-branch-shell") as HTMLElement | null;
    expect(workerShell).toBeTruthy();
    firePointer(workerShell!, "pointerdown", { pointerId: 104, clientX: 940, clientY: 350 });
    firePointer(workerShell!, "pointermove", { pointerId: 104, clientX: 995, clientY: 390 });
    firePointer(workerShell!, "pointerup", { pointerId: 104, clientX: 995, clientY: 390, buttons: 0 });

    const searchHeader = within(searchGroup!).getByRole("button", { name: /x-search-latest/ });
    fireEvent.click(searchHeader);
    expect(searchGroup).toHaveTextContent("找到官网、云平台和公开登录入口线索");
  });

  it("keeps menu action buttons clickable via pointer sequence after menu drag is implemented", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();

    // Use pointerdown + pointerup + click sequence (no drag movement) on "运行" button
    const runButton = within(branch!).getByRole("button", { name: "运行" });
    firePointer(runButton, "pointerdown", { pointerId: 93, clientX: 300, clientY: 200 });
    firePointer(runButton, "pointerup", { pointerId: 93, clientX: 300, clientY: 200, buttons: 0 });
    fireEvent.click(runButton);

    expect(await within(branch!).findByText("最近运行")).toBeInTheDocument();
    expect(within(branch!).getByText("已完成")).toBeInTheDocument();
  });

  it("drags edit node independently without moving menu", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "编辑" }));

    await waitFor(() => {
      expect(container.querySelector(".task-edit-branch")).toBeTruthy();
    });

    const menuShell = container.querySelector(".emap-task-branch-shell") as HTMLElement | null;
    expect(menuShell).toBeTruthy();
    const editShell = container.querySelector(".emap-task-child-branch-shell") as HTMLElement | null;
    expect(editShell).toBeTruthy();

    const menuLeftBefore = Number.parseFloat(menuShell!.style.left);
    const menuTopBefore = Number.parseFloat(menuShell!.style.top);
    const editLeftBefore = Number.parseFloat(editShell!.style.left);
    const editTopBefore = Number.parseFloat(editShell!.style.top);

    // Drag from the edit branch header (not form controls)
    const editHeader = editShell!.querySelector(".task-leader-branch-head") as HTMLElement | null;
    expect(editHeader).toBeTruthy();
    firePointer(editHeader!, "pointerdown", { pointerId: 94, clientX: 500, clientY: 300 });
    firePointer(editHeader!, "pointermove", { pointerId: 94, clientX: 560, clientY: 350 });
    firePointer(editHeader!, "pointerup", { pointerId: 94, clientX: 560, clientY: 350, buttons: 0 });

    const dx = 60;
    const dy = 50;

    // Edit node moved
    expect(Number.parseFloat(editShell!.style.left)).toBeCloseTo(editLeftBefore + dx, 4);
    expect(Number.parseFloat(editShell!.style.top)).toBeCloseTo(editTopBefore + dy, 4);

    // Menu did not move
    expect(Number.parseFloat(menuShell!.style.left)).toBeCloseTo(menuLeftBefore, 4);
    expect(Number.parseFloat(menuShell!.style.top)).toBeCloseTo(menuTopBefore, 4);
  });

  it("moves file detail descendant when dragging file node", async () => {
    const { container } = render(<App />);
    await setupObserverOpen(container);

    const workerFileNode = await waitFor(() => {
      const node = container.querySelector('.emap-observer-file-node[data-file-kind="worker"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    // Expand detail
    fireEvent.click(workerFileNode);

    await waitFor(() => {
      expect(container.querySelector(".emap-observer-file-detail-node")).toBeTruthy();
    });

    const allShells = () => Array.from(container.querySelectorAll(".emap-task-child-branch-shell"));
    const workerShell = allShells().find((s) => s.querySelector('.emap-observer-file-node[data-file-kind="worker"]')) as HTMLElement | undefined;
    expect(workerShell).toBeTruthy();
    const detailShell = allShells().find((s) => s.querySelector(".emap-observer-file-detail-node")) as HTMLElement | undefined;
    expect(detailShell).toBeTruthy();

    const workerLeftBefore = Number.parseFloat(workerShell!.style.left);
    const workerTopBefore = Number.parseFloat(workerShell!.style.top);
    const detailLeftBefore = Number.parseFloat(detailShell!.style.left);
    const detailTopBefore = Number.parseFloat(detailShell!.style.top);

    // Drag worker file node
    firePointer(workerFileNode, "pointerdown", { pointerId: 95, clientX: 500, clientY: 300 });
    firePointer(workerFileNode, "pointermove", { pointerId: 95, clientX: 570, clientY: 350 });
    firePointer(workerFileNode, "pointerup", { pointerId: 95, clientX: 570, clientY: 350, buttons: 0 });

    const dx = 70;
    const dy = 50;

    // Worker shell moved
    expect(Number.parseFloat(workerShell!.style.left)).toBeCloseTo(workerLeftBefore + dx, 4);
    expect(Number.parseFloat(workerShell!.style.top)).toBeCloseTo(workerTopBefore + dy, 4);

    // Detail shell also moved by same delta
    expect(Number.parseFloat(detailShell!.style.left)).toBeCloseTo(detailLeftBefore + dx, 4);
    expect(Number.parseFloat(detailShell!.style.top)).toBeCloseTo(detailTopBefore + dy, 4);
  });

  it("opens newly expanded file detail to the right of a dragged file node", async () => {
    const { container } = render(<App />);
    await setupObserverOpen(container);

    const workerFileNode = await waitFor(() => {
      const node = container.querySelector('.emap-observer-file-node[data-file-kind="worker"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });

    const workerShell = workerFileNode.closest(".emap-task-child-branch-shell") as HTMLElement | null;
    expect(workerShell).toBeTruthy();

    firePointer(workerFileNode, "pointerdown", { pointerId: 99, clientX: 500, clientY: 300 });
    firePointer(workerFileNode, "pointermove", { pointerId: 99, clientX: 660, clientY: 330 });
    firePointer(workerFileNode, "pointerup", { pointerId: 99, clientX: 660, clientY: 330, buttons: 0 });

    // The first click after a drag is intentionally suppressed.
    fireEvent.click(workerFileNode);
    fireEvent.click(workerFileNode);

    const detailShell = await waitFor(() => {
      const detail = container.querySelector(".emap-observer-file-detail-node")?.closest(".emap-task-child-branch-shell") as HTMLElement | null;
      expect(detail).toBeTruthy();
      return detail!;
    });

    const workerLeft = Number.parseFloat(workerShell!.style.left);
    const workerWidth = Number.parseFloat(workerShell!.style.width);
    const detailLeft = Number.parseFloat(detailShell.style.left);

    expect(detailLeft).toBeGreaterThanOrEqual(workerLeft + workerWidth);
  });

  it("moves only detail leaf without moving parent file node", async () => {
    const { container } = render(<App />);
    await setupObserverOpen(container);

    const workerFileNode = await waitFor(() => {
      const node = container.querySelector('.emap-observer-file-node[data-file-kind="worker"]') as HTMLElement | null;
      expect(node).toBeTruthy();
      return node!;
    });
    fireEvent.click(workerFileNode);

    await waitFor(() => {
      const detail = container.querySelector(".emap-observer-file-detail-node") as HTMLElement | null;
      expect(detail).toBeTruthy();
    });

    const allShells = () => Array.from(container.querySelectorAll(".emap-task-child-branch-shell"));
    const workerShell = allShells().find((s) => s.querySelector('.emap-observer-file-node[data-file-kind="worker"]')) as HTMLElement | undefined;
    expect(workerShell).toBeTruthy();
    const detailShell = allShells().find((s) => s.querySelector(".emap-observer-file-detail-node")) as HTMLElement | undefined;
    expect(detailShell).toBeTruthy();

    const workerLeftBefore = Number.parseFloat(workerShell!.style.left);
    const workerTopBefore = Number.parseFloat(workerShell!.style.top);
    const detailLeftBefore = Number.parseFloat(detailShell!.style.left);
    const detailTopBefore = Number.parseFloat(detailShell!.style.top);

    // Drag detail panel only
    firePointer(detailShell!, "pointerdown", { pointerId: 96, clientX: 800, clientY: 400 });
    firePointer(detailShell!, "pointermove", { pointerId: 96, clientX: 860, clientY: 450 });
    firePointer(detailShell!, "pointerup", { pointerId: 96, clientX: 860, clientY: 450, buttons: 0 });

    // Detail moved
    expect(Number.parseFloat(detailShell!.style.left)).toBeCloseTo(detailLeftBefore + 60, 4);
    expect(Number.parseFloat(detailShell!.style.top)).toBeCloseTo(detailTopBefore + 50, 4);

    // Worker file node did not move
    expect(Number.parseFloat(workerShell!.style.left)).toBeCloseTo(workerLeftBefore, 4);
    expect(Number.parseFloat(workerShell!.style.top)).toBeCloseTo(workerTopBefore, 4);
  });

  it("keeps leader chat usable: drag header, resize, maximize", async () => {
    const { container } = render(<App />);

    const taskNode = await within(getAtlasNodes(container)).findByRole("button", { name: /调查 Medtrum 云资产/ });
    fireEvent.click(taskNode);

    const branch = container.querySelector(".task-action-branch") as HTMLElement | null;
    expect(branch).toBeTruthy();
    fireEvent.click(within(branch!).getByRole("button", { name: "对话 Leader" }));

    await waitFor(() => {
      expect(container.querySelector(".emap-task-child-branch-shell iframe")).toBeTruthy();
    });

    const shell = container.querySelector(".emap-task-child-branch-shell") as HTMLElement | null;
    expect(shell).toBeTruthy();
    const header = shell!.querySelector(".agent-playground-branch-head") as HTMLElement | null;
    expect(header).toBeTruthy();

    // Drag header
    const leftBefore = Number.parseFloat(shell!.style.left);
    const topBefore = Number.parseFloat(shell!.style.top);
    firePointer(header!, "pointerdown", { pointerId: 97, clientX: 400, clientY: 200 });
    firePointer(header!, "pointermove", { pointerId: 97, clientX: 450, clientY: 260 });
    firePointer(header!, "pointerup", { pointerId: 97, clientX: 450, clientY: 260, buttons: 0 });
    expect(Number.parseFloat(shell!.style.left)).toBeCloseTo(leftBefore + 50, 4);
    expect(Number.parseFloat(shell!.style.top)).toBeCloseTo(topBefore + 60, 4);

    // Resize
    const resizeHandle = shell!.querySelector(".emap-agent-branch-resize-handle") as HTMLElement | null;
    expect(resizeHandle).toBeTruthy();
    const widthBefore = Number.parseFloat(shell!.style.width);
    const heightBefore = Number.parseFloat(shell!.style.height);
    firePointer(resizeHandle!, "pointerdown", { pointerId: 98, clientX: 800, clientY: 600 });
    firePointer(resizeHandle!, "pointermove", { pointerId: 98, clientX: 900, clientY: 700 });
    firePointer(resizeHandle!, "pointerup", { pointerId: 98, clientX: 900, clientY: 700, buttons: 0 });
    expect(Number.parseFloat(shell!.style.width)).toBeCloseTo(widthBefore + 100, 4);
    expect(Number.parseFloat(shell!.style.height)).toBeCloseTo(heightBefore + 100, 4);

    // Maximize
    const maximizeButton = shell!.querySelector(".emap-agent-branch-maximize-button") as HTMLElement | null;
    expect(maximizeButton).toBeTruthy();
    fireEvent.click(maximizeButton!);
    expect(container.querySelector(".emap-maximized-branch-shell")).toBeTruthy();
  });
});
