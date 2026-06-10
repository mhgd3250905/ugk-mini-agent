import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { LiveTeamApi } from "../api/team-api";
import {
  mockDiscoveryGeneratedTasks,
  mockTeamTasks,
  makeSequentialRun,
} from "../fixtures/team-fixtures";

describe("LiveTeamApi", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("listPlans calls /v1/team/plans", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    await api.listPlans();

    expect(fetch).toHaveBeenCalledWith("/v1/team/plans");
  });

  it("listRuns calls /v1/team/runs", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    await api.listRuns();

    expect(fetch).toHaveBeenCalledWith("/v1/team/runs");
  });

  it("fetches live Team Task catalog", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      tasks: [{
        taskId: "task_medtrum",
        title: "调查 Medtrum 云资产",
        leaderAgentId: "main",
        status: "ready",
        createdAt: "2026-05-24T00:00:00.000Z",
        updatedAt: "2026-05-24T00:00:00.000Z",
        archived: false,
        workUnit: {
          title: "调查 Medtrum 云资产",
          input: { text: "调查 Medtrum 相关公开云资产。" },
          outputContract: { text: "输出中文 Markdown 报告。" },
          acceptance: { rules: ["每条结论必须有来源"] },
          workerAgentId: "search",
          checkerAgentId: "main",
        },
      }],
    }), { status: 200 }));

    const tasks = await api.listTasks();

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks");
    expect(tasks[0]?.taskId).toBe("task_medtrum");
    expect(tasks[0]?.workUnit.workerAgentId).toBe("search");
  });

  it("fetches live Team Task catalog incrementally with since cursor", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      tasks: [],
      deletedTaskIds: ["task_archived"],
      serverVersion: "2026-06-03T00:00:01.000Z",
    }), { status: 200 }));

    const catalog = await api.listTaskCatalog({ since: "2026-06-03T00:00:00.000Z" });

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks?since=2026-06-03T00%3A00%3A00.000Z");
    expect(catalog).toEqual({
      tasks: [],
      deletedTaskIds: ["task_archived"],
      serverVersion: "2026-06-03T00:00:01.000Z",
    });
  });

  it("accepts bare array live Team Task catalog responses", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([{
      taskId: "task_array_shape",
      title: "数组响应 Task",
      leaderAgentId: "main",
      status: "drafting",
      createdAt: "2026-05-24T00:00:00.000Z",
      updatedAt: "2026-05-24T00:00:00.000Z",
      archived: false,
      workUnit: {
        title: "数组响应 Task",
        input: { text: "验证早期后端数组响应。" },
        outputContract: { text: "输出验证结果。" },
        acceptance: { rules: ["必须保留 worker/checker"] },
        workerAgentId: "search",
        checkerAgentId: "main",
      },
    }]), { status: 200 }));

    const tasks = await api.listTasks();

    expect(tasks[0]?.taskId).toBe("task_array_shape");
    expect(tasks[0]?.status).toBe("drafting");
  });

  it("fetches live generated Discovery child catalog with an encoded task id", async () => {
    const api = new LiveTeamApi("/v1/team");
    const generatedTask = mockDiscoveryGeneratedTasks[0]!;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ tasks: [generatedTask] }), { status: 200 }));

    const tasks = await api.listGeneratedTasks("task/a b");

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks/task%2Fa%20b/generated-tasks");
    expect(tasks).toEqual([generatedTask]);
  });

  it("adds includeArchived only for live generated Discovery child catalog requests that need it", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ tasks: [] }), { status: 200 }));

    await api.listGeneratedTasks("task/a b", { includeArchived: true });

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks/task%2Fa%20b/generated-tasks?includeArchived=1");
  });

  it("treats missing live generated Discovery child catalog endpoint as an empty list", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response("not found", { status: 404 }));

    await expect(api.listGeneratedTasks("task_discovery")).resolves.toEqual([]);
  });

  it("accepts bare array live generated Discovery child catalog responses", async () => {
    const api = new LiveTeamApi("/v1/team");
    const generatedTask = mockDiscoveryGeneratedTasks[1]!;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([generatedTask]), { status: 200 }));

    await expect(api.listGeneratedTasks("task_discovery")).resolves.toEqual([generatedTask]);
  });

  it("listGeneratedTaskSummaries calls /generated-tasks?view=summary", async () => {
    const api = new LiveTeamApi("/v1/team");
    const summary = {
      taskId: "task_summary_1",
      title: "Summary item",
      leaderAgentId: "main",
      status: "ready",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      archived: false,
      generatedSource: {
        schemaVersion: "team/generated-task-source-1" as const,
        sourceDiscoveryTaskId: "task_discovery",
        sourceItemId: "item_1",
        itemStatus: "active" as const,
        workUnitMode: "customized" as const,
        canResetToManaged: true,
      },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ tasks: [summary] }), { status: 200 }));

    const summaries = await api.listGeneratedTaskSummaries("task_discovery");

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks/task_discovery/generated-tasks?view=summary");
    expect(summaries).toEqual([summary]);
  });

  it("listGeneratedTaskSummaries includes includeArchived parameter", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ tasks: [] }), { status: 200 }));

    await api.listGeneratedTaskSummaries("task/a b", { includeArchived: true });

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks/task%2Fa%20b/generated-tasks?view=summary&includeArchived=1");
  });

  it("listGeneratedTaskSummaries treats 404 as empty", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response("not found", { status: 404 }));

    await expect(api.listGeneratedTaskSummaries("task_discovery")).resolves.toEqual([]);
  });

  it("listGeneratedTaskSummaries normalizes malformed body to empty array", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ tasks: null }), { status: 200 }));

    await expect(api.listGeneratedTaskSummaries("task_discovery")).resolves.toEqual([]);
  });

  it("fetches live generated Discovery child summaries incrementally with since cursor", async () => {
    const api = new LiveTeamApi("/v1/team");
    const summary = {
      taskId: "task_summary_changed",
      title: "Changed Summary",
      leaderAgentId: "main",
      status: "ready",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-03T00:00:01.000Z",
      archived: false,
      generatedSource: {
        schemaVersion: "team/generated-task-source-1" as const,
        sourceDiscoveryTaskId: "task_discovery",
        sourceItemId: "item_changed",
        itemStatus: "active" as const,
        workUnitMode: "managed" as const,
      },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      tasks: [summary],
      deletedTaskIds: ["task_deleted"],
      serverVersion: "2026-06-03T00:00:02.000Z",
    }), { status: 200 }));

    const catalog = await api.listGeneratedTaskSummaryCatalog("task_discovery", {
      since: "2026-06-03T00:00:00.000Z",
    });

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks/task_discovery/generated-tasks?view=summary&since=2026-06-03T00%3A00%3A00.000Z");
    expect(catalog).toEqual({
      tasks: [summary],
      deletedTaskIds: ["task_deleted"],
      serverVersion: "2026-06-03T00:00:02.000Z",
    });
  });

  it("fetches live Team Console root summary with independent cursors", async () => {
    const api = new LiveTeamApi("/v1/team");
    const task = mockTeamTasks[0]!;
    const run = makeSequentialRun();
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      tasks: [task],
      deletedTaskIds: ["task_deleted"],
      taskRunsByTaskId: { [task.taskId]: [run] },
      deletedRunIdsByTaskId: { [task.taskId]: [] },
      sourceNodes: [],
      sourceConnections: [],
      taskConnections: [],
      taskDependencies: [],
      serverVersion: {
        taskCatalog: "2026-06-03T00:00:01.000Z",
        taskRunSummary: "2026-06-03T00:00:02.000Z",
      },
    }), { status: 200 }));

    const summary = await api.getRootSummary({
      taskSince: "2026-06-03T00:00:00.000Z",
      runSince: "2026-06-03T00:00:01.000Z",
    });

    expect(fetch).toHaveBeenCalledWith("/v1/team/console/root-summary?taskSince=2026-06-03T00%3A00%3A00.000Z&runSince=2026-06-03T00%3A00%3A01.000Z");
    expect(summary.tasks).toEqual([task]);
    expect(summary.deletedTaskIds).toEqual(["task_deleted"]);
    expect(summary.taskRunsByTaskId[task.taskId]?.[0]?.runId).toBe(run.runId);
    expect(summary.serverVersion.taskCatalog).toBe("2026-06-03T00:00:01.000Z");
    expect(summary.serverVersion.taskRunSummary).toBe("2026-06-03T00:00:02.000Z");
  });

  it("getTask fetches a single task by id", async () => {
    const api = new LiveTeamApi("/v1/team");
    const task = mockTeamTasks[0]!;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ task }), { status: 200 }));

    const result = await api.getTask("task/a b");

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks/task%2Fa%20b");
    expect(result).toEqual(task);
  });

  it("getTask returns null for 404", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response("not found", { status: 404 }));

    await expect(api.getTask("task_missing")).resolves.toBeNull();
  });

  it("lists and creates live typed Task connections", async () => {
    const api = new LiveTeamApi("/v1/team");
    const connection = {
      schemaVersion: "team/task-connection-1",
      connectionId: "conn_1",
      fromTaskId: "task_a",
      fromOutputPortId: "draft_md",
      toTaskId: "task_b",
      toInputPortId: "source_md",
      type: "md",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
    } as const;
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [connection] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ connection }), { status: 201 }));

    const connections = await api.listTaskConnections();
    const created = await api.createTaskConnection({
      fromTaskId: "task_a",
      fromOutputPortId: "draft_md",
      toTaskId: "task_b",
      toInputPortId: "source_md",
    });

    expect(fetch).toHaveBeenNthCalledWith(1, "/v1/team/task-connections");
    expect(fetch).toHaveBeenNthCalledWith(2, "/v1/team/task-connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromTaskId: "task_a",
        fromOutputPortId: "draft_md",
        toTaskId: "task_b",
        toInputPortId: "source_md",
      }),
    });
    expect(connections).toEqual([connection]);
    expect(created).toEqual(connection);
  });

  it("treats missing live Task connection endpoint as an empty connection list", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response("not found", { status: 404 }));

    await expect(api.listTaskConnections()).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledWith("/v1/team/task-connections");
  });

  it("patches live Team Tasks and preserves response warnings", async () => {
    const api = new LiveTeamApi("/v1/team");
    const task = { ...mockTeamTasks[0]!, title: "更新后的 Task" };
    const patch = { title: "更新后的 Task" };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      task,
      warnings: ["workerAgentId and checkerAgentId are the same; self-checking weakens independent acceptance."],
    }), { status: 200 }));

    const response = await api.updateTask("task/a b", patch);

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks/task%2Fa%20b", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    expect(response.task.title).toBe("更新后的 Task");
    expect(response.warnings).toEqual([
      "workerAgentId and checkerAgentId are the same; self-checking weakens independent acceptance.",
    ]);
  });

  it("posts live Task clone requests to the encoded clone endpoint", async () => {
    const api = new LiveTeamApi("/v1/team");
    const task = { ...mockTeamTasks[0]!, taskId: "task_cloned", title: "GLM-5.1 论坛查询" };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ task }), { status: 201 }));

    const response = await (api as unknown as {
      cloneTask(taskId: string, input: { title?: string; templateBindings?: Record<string, string> }): Promise<{ task: typeof task }>;
    }).cloneTask("task/a b", {
      title: "GLM-5.1 论坛查询",
      templateBindings: { keyword: "GLM-5.1" },
    });

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks/task%2Fa%20b/clone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "GLM-5.1 论坛查询",
        templateBindings: { keyword: "GLM-5.1" },
      }),
    });
    expect(response.task.taskId).toBe("task_cloned");
  });

  it("archives live Team Tasks through the soft archive endpoint", async () => {
    const api = new LiveTeamApi("/v1/team");
    const task = { ...mockTeamTasks[0]!, archived: true, status: "archived" };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ task }), { status: 200 }));

    const response = await api.archiveTask("task/a b");

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks/task%2Fa%20b/archive", {
      method: "POST",
      headers: { accept: "application/json" },
    });
    expect(response.task.archived).toBe(true);
  });

  it("posts live generated WorkUnit reset to the encoded endpoint", async () => {
    const api = new LiveTeamApi("/v1/team");
    const task = {
      ...mockDiscoveryGeneratedTasks[0]!,
      generatedSource: {
        ...mockDiscoveryGeneratedTasks[0]!.generatedSource!,
        workUnitMode: "managed" as const,
      },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ task, warnings: [] }), { status: 200 }));

    const response = await api.resetGeneratedTaskWorkUnit("task/a b");

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks/task%2Fa%20b/generated-workunit/reset", {
      method: "POST",
      headers: { accept: "application/json" },
    });
    expect(response.task.taskId).toBe(task.taskId);
    expect(response.warnings).toEqual([]);
  });

  it("maps non-OK live generated WorkUnit reset responses through API errors", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      error: "latest managed WorkUnit snapshot is missing",
    }), { status: 409 }));

    await expect(api.resetGeneratedTaskWorkUnit("task_without_snapshot")).rejects.toEqual({
      message: "latest managed WorkUnit snapshot is missing",
      status: 409,
    });
  });

});
