import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  MockTeamApi,
  resetMockTeamApiState,
  mockDiscoveryGeneratedTasks,
  mockDiscoveryRootTask,
  mockTeamTasks,
} from "../fixtures/team-fixtures";
import { LiveTeamApi } from "../api/team-api";
import {
  ALL_FIXTURES,
  makeSequentialRun,
  makeDiscoveryForEachRun,
  makeOrphanRun,
  makeLargeChildRun,
} from "../fixtures/team-fixtures";

function sseResponse(body: string, status = 200): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
    {
      status,
      headers: { "content-type": "text/event-stream" },
    },
  );
}

describe("MockTeamApi", () => {
  const api = new MockTeamApi();

  beforeEach(() => {
    resetMockTeamApiState();
  });

  it("returns plans list", async () => {
    const plans = await api.listPlans();
    expect(plans.length).toBe(ALL_FIXTURES.length);
  });

  it("returns stable run detail data", async () => {
    const run = await api.getRunDetail("run_seq_001");
    expect(run.runId).toBe("run_seq_001");
    expect(run.status).toBe("completed");
    expect(run.taskStates).toHaveProperty("task_1");
  });

  it("throws for unknown run", async () => {
    await expect(api.getRunDetail("nonexistent")).rejects.toEqual({
      message: "Run not found: nonexistent",
    });
  });

  it("returns attempt metadata for real snapshot 2 child task", async () => {
    const attempts = await api.listAttempts("run_real_success_foreach_001", "explore_direction__official-search-apis");

    expect(attempts).toHaveLength(1);
    expect(attempts[0].attemptId).toBe("attempt_68ce15110a99");
    expect(attempts[0].worker.map((w) => w.outputRef)).toEqual([
      "tasks/explore_direction__official-search-apis/attempts/attempt_68ce15110a99/worker-output-001.md",
      "tasks/explore_direction__official-search-apis/attempts/attempt_68ce15110a99/worker-output-002.md",
    ]);
    expect(attempts[0].checker.map((c) => c.recordRef)).toEqual([
      "tasks/explore_direction__official-search-apis/attempts/attempt_68ce15110a99/checker-verdict-001.json",
      "tasks/explore_direction__official-search-apis/attempts/attempt_68ce15110a99/checker-verdict-002.json",
    ]);
    expect(attempts[0].watcher?.recordRef).toBe(
      "tasks/explore_direction__official-search-apis/attempts/attempt_68ce15110a99/watcher-review.json",
    );
    expect(attempts[0].resultRef).toBe(
      "tasks/explore_direction__official-search-apis/attempts/attempt_68ce15110a99/accepted-result.md",
    );
    expect(attempts[0].files).toContain("accepted-result.md");
  });

  it("reads deterministic attempt fixture content", async () => {
    const content = await api.readAttemptFile(
      "run_real_success_foreach_001",
      "explore_direction__official-search-apis",
      "attempt_68ce15110a99",
      "checker-verdict-001.json",
    );

    expect(JSON.parse(content)).toMatchObject({
      verdict: "revise",
      reason: expect.stringContaining("补充"),
    });
  });

  it("returns mock agents for canvas selection", async () => {
    const agents = await (api as unknown as {
      listAgents(): Promise<Array<{ agentId: string; name: string; description: string }>>;
    }).listAgents();

    expect(agents.length).toBeGreaterThanOrEqual(3);
    expect(agents.map((agent) => agent.agentId)).toEqual(expect.arrayContaining(["main", "search"]));
  });

  it("returns deterministic mock agent run statuses", async () => {
    const statuses = await api.listAgentRunStatuses();

    expect(statuses.find((status) => status.agentId === "main")?.status).toBe("idle");
    expect(statuses.find((status) => status.agentId === "search")).toMatchObject({
      status: "busy",
      activeConversationId: "mock-search-active",
    });
  });

  it("returns deterministic mock Team Tasks", async () => {
    const tasks = await api.listTasks();

    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0]?.taskId).toBe("task_research_medtrum");
    expect(tasks.some((task) => task.taskId === mockDiscoveryRootTask.taskId && task.canvasKind === "discovery")).toBe(true);
    expect(tasks.every((task) => task.generatedSource === undefined)).toBe(true);
    expect(tasks[0]?.leaderAgentId).toBeTruthy();
    expect(tasks[0]?.workUnit.workerAgentId).toBeTruthy();
    expect(tasks[0]?.workUnit.checkerAgentId).toBeTruthy();
    expect(tasks[0]?.workUnit.acceptance.rules.length).toBeGreaterThan(0);
  });

  it("keeps mock generated Discovery children behind listGeneratedTasks", async () => {
    const rootTasks = await api.listTasks();
    const generatedTasks = await api.listGeneratedTasks(mockDiscoveryRootTask.taskId);
    const generatedWithArchived = await api.listGeneratedTasks(mockDiscoveryRootTask.taskId, { includeArchived: true });

    expect(rootTasks.map((task) => task.taskId)).toContain(mockDiscoveryRootTask.taskId);
    expect(rootTasks.map((task) => task.taskId)).not.toEqual(
      expect.arrayContaining(mockDiscoveryGeneratedTasks.map((task) => task.taskId)),
    );
    expect(generatedTasks.map((task) => task.taskId)).toEqual([
      "task_generated_vultr",
      "task_generated_hetzner",
    ]);
    expect(new Set(generatedTasks.map((task) => task.generatedSource?.itemStatus))).toEqual(new Set(["active", "stale"]));
    expect(generatedWithArchived.map((task) => task.taskId)).toEqual([
      "task_generated_vultr",
      "task_generated_hetzner",
      "task_generated_archived_ovh",
    ]);
  });

  it("resets mock generated Discovery children to the stored managed snapshot", async () => {
    const before = (await api.listGeneratedTasks(mockDiscoveryRootTask.taskId, { includeArchived: true }))
      .find((task) => task.taskId === "task_generated_hetzner");

    expect(before?.generatedSource?.workUnitMode).toBe("customized");
    expect(before?.generatedSource?.latestManagedWorkUnit).toBeDefined();

    const response = await api.resetGeneratedTaskWorkUnit("task_generated_hetzner");

    expect(response.task.taskId).toBe("task_generated_hetzner");
    expect(response.task.title).toBe(before?.generatedSource?.latestManagedWorkUnit?.title);
    expect(response.task.workUnit).toEqual(before?.generatedSource?.latestManagedWorkUnit);
    expect(response.task.generatedSource).toMatchObject({
      sourceDiscoveryTaskId: mockDiscoveryRootTask.taskId,
      sourceItemId: "hetzner",
      itemStatus: "stale",
      workUnitMode: "managed",
      itemPayload: before?.generatedSource?.itemPayload,
    });
    expect(response.task.generatedSource?.latestManagedWorkUnit).toEqual(before?.generatedSource?.latestManagedWorkUnit);

    const after = (await api.listGeneratedTasks(mockDiscoveryRootTask.taskId, { includeArchived: true }))
      .find((task) => task.taskId === "task_generated_hetzner");
    expect(after).toEqual(response.task);
  });

  it("updates mock Team Tasks and preserves warnings", async () => {
    const task = mockTeamTasks[0]!;

    const response = await api.updateTask(task.taskId, {
      title: "更新后的 Task",
      workUnit: {
        ...task.workUnit,
        checkerAgentId: task.workUnit.workerAgentId,
      },
    });

    expect(response.task.title).toBe("更新后的 Task");
    expect(response.task.workUnit.checkerAgentId).toBe(task.workUnit.workerAgentId);
    expect(response.warnings?.[0]).toContain("self-checking weakens independent acceptance");
    const listed = await api.listTasks();
    expect(listed.find((candidate) => candidate.taskId === task.taskId)).toEqual(response.task);
    expect(listed.some((candidate) => candidate.generatedSource)).toBe(false);
  });

  it("clones mock Team Tasks", async () => {
    const task = mockTeamTasks[0]!;

    const response = await (api as unknown as {
      cloneTask(taskId: string, input: { title?: string; templateBindings?: Record<string, string> }): Promise<{ task: typeof task }>;
    }).cloneTask(task.taskId, { title: "复制后的工具 Task" });

    expect(response.task.taskId).not.toBe(task.taskId);
    expect(response.task.title).toBe("复制后的工具 Task");
    expect(response.task.workUnit).toEqual(task.workUnit);
    const listed = await api.listTasks();
    expect(listed.map((candidate) => candidate.taskId)).toContain(response.task.taskId);
  });

  it("archives mock Team Tasks without deleting the fixture definition", async () => {
    const task = mockTeamTasks[0]!;

    const response = await api.archiveTask(task.taskId);

    expect(response.task.archived).toBe(true);
    expect(response.task.status).toBe("archived");
    await expect(api.listTasks()).resolves.not.toEqual(expect.arrayContaining([expect.objectContaining({
      taskId: task.taskId,
    })]));
    expect(mockTeamTasks[0]?.archived).toBe(false);
  });

  it("creates, lists, reads, and cancels mock Canvas Task runs", async () => {
    const task = mockTeamTasks[0]!;

    const run = await api.createTaskRun(task.taskId);

    expect(run.source).toEqual({ type: "canvas-task", taskId: task.taskId });
    expect(run.status).toBe("completed");
    await expect(api.listTaskRuns(task.taskId)).resolves.toEqual([run]);
    await expect(api.getTaskRun(run.runId)).resolves.toEqual(run);

    const cancelled = await api.cancelTaskRun(run.runId);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.taskStates[task.taskId]?.status).toBe("cancelled");
  });

  it("returns deterministic mock agent chat replies", async () => {
    const response = await (api as unknown as {
      sendAgentMessage(agentId: string, message: string): Promise<{ text: string }>;
    }).sendAgentMessage("search", "查一下 agent canvas");

    expect(response.text).toContain("search");
    expect(response.text).toContain("查一下 agent canvas");
  });

  it("streams deterministic mock chat events and stores conversation state", async () => {
    const events: unknown[] = [];

    await api.streamAgentMessage("main", {
      message: "请总结 mock 状态",
      assetRefs: ["mock-reference-asset"],
    }, (event) => events.push(event));

    expect(events.map((event) => (event as { type: string }).type)).toEqual([
      "run_started",
      "text_delta",
      "done",
    ]);
    const done = events.at(-1) as { type: "done"; conversationId: string; text: string };
    const state = await api.getAgentConversationState("main", done.conversationId, 20);
    expect(state.viewMessages.map((message) => message.text)).toEqual([
      "请总结 mock 状态",
      "[main] mock reply: 请总结 mock 状态",
    ]);
    expect(state.viewMessages[0].assetRefs?.map((asset) => asset.assetId)).toEqual(["mock-reference-asset"]);
    expect(state.running).toBe(false);
  });

  it("uses the same non-empty asset-only message in mock stream history", async () => {
    const events: unknown[] = [];

    await api.streamAgentMessage("search", {
      message: "请结合我引用的资产一起处理",
      assetRefs: ["mock-reference-asset"],
    }, (event) => events.push(event));

    const done = events.at(-1) as { type: "done"; conversationId: string };
    const state = await api.getAgentConversationState("search", done.conversationId, 20);
    const assetOnlyMessage = state.viewMessages.find((message) => message.text === "请结合我引用的资产一起处理");
    expect(assetOnlyMessage).toBeTruthy();
    expect(assetOnlyMessage?.assetRefs?.[0].fileName).toBe("mock-reference.md");
  });

  it("keeps the mock user message when the stream returns an error", async () => {
    const events: unknown[] = [];

    await expect(api.streamAgentMessage("main", {
      message: "mock-error",
    }, (event) => events.push(event))).rejects.toEqual({ message: "mock stream error" });

    expect(events.map((event) => (event as { type: string }).type)).toEqual(["run_started", "error"]);
    const errorEvent = events.at(-1) as { type: "error"; conversationId: string };
    const state = await api.getAgentConversationState("main", errorEvent.conversationId, 20);
    expect(state.viewMessages.map((message) => message.text)).toContain("mock-error");
    expect(state.activeRun?.status).toBe("error");
    expect(state.running).toBe(false);
  });

  it("returns interrupted state for mock interrupt while running", async () => {
    const events: unknown[] = [];
    const streamPromise = api.streamAgentMessage("reviewer", {
      message: "mock-hold",
    }, (event) => events.push(event));

    await vi.waitFor(() => {
      expect(events.map((event) => (event as { type: string }).type)).toContain("run_started");
    });
    const started = events[0] as { type: "run_started"; conversationId: string };
    const interrupted = await api.interruptAgentChat("reviewer", started.conversationId);

    await streamPromise;

    expect(interrupted).toEqual({ conversationId: started.conversationId, interrupted: true });
    expect(events.map((event) => (event as { type: string }).type)).toEqual(["run_started", "interrupted"]);
    const state = await api.getAgentConversationState("reviewer", started.conversationId, 20);
    expect(state.activeRun?.status).toBe("interrupted");
    expect(state.running).toBe(false);
  });

  it("creates, lists, and deletes mock Task dependencies", async () => {
    const dep = await api.createTaskDependency({
      fromTaskId: "task_a",
      toTaskId: "task_b",
    });

    expect(dep.dependencyId).toMatch(/^mock_dep_/);
    expect(dep.trigger).toBe("on_success");

    const all = await api.listTaskDependencies();
    expect(all).toHaveLength(1);
    expect(all[0]!.fromTaskId).toBe("task_a");

    await api.deleteTaskDependency(dep.dependencyId);
    await expect(api.listTaskDependencies()).resolves.toEqual([]);
  });

  it("rejects mock self dependency", async () => {
    await expect(api.createTaskDependency({
      fromTaskId: "task_a",
      toTaskId: "task_a",
    })).rejects.toEqual({ message: "task dependency cannot target the same task" });
  });

  it("rejects duplicate mock dependency", async () => {
    await api.createTaskDependency({
      fromTaskId: "task_a",
      toTaskId: "task_b",
    });
    await expect(api.createTaskDependency({
      fromTaskId: "task_a",
      toTaskId: "task_b",
    })).rejects.toEqual({ message: "task dependency already exists" });
  });
});

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

  it("lists live Canvas Task runs for a Task", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      runs: [{
        runId: "run_canvas_1",
        planId: "canvas_task_task_1",
        source: { type: "canvas-task", taskId: "task_1" },
        teamUnitId: "canvas_task_unit_task_1",
        status: "completed",
        createdAt: "2026-05-25T00:00:00.000Z",
        startedAt: "2026-05-25T00:00:00.000Z",
        finishedAt: "2026-05-25T00:00:01.000Z",
        currentTaskId: null,
        taskStates: {},
        summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
      }],
    }), { status: 200 }));

    const runs = await api.listTaskRuns("task/a b");

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks/task%2Fa%20b/runs");
    expect(runs[0]?.runId).toBe("run_canvas_1");
  });

  it("lists live Canvas Task run history with paging and archived rows", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      taskId: "task/a b",
      total: 1,
      limit: 20,
      offset: 40,
      runs: [{
        run: {
          runId: "run_canvas_1",
          planId: "canvas_task_task_1",
          source: { type: "canvas-task", taskId: "task/a b" },
          teamUnitId: "canvas_task_unit_task_1",
          status: "completed",
          createdAt: "2026-05-25T00:00:00.000Z",
          startedAt: "2026-05-25T00:00:00.000Z",
          finishedAt: "2026-05-25T00:00:01.000Z",
          currentTaskId: null,
          taskStates: {},
          summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
        },
        annotation: {
          runId: "run_canvas_1",
          taskId: "task/a b",
          best: true,
          archived: false,
          note: "质量最好",
          updatedAt: "2026-05-25T00:00:03.000Z",
        },
      }],
    }), { status: 200 }));

    const history = await api.listTaskRunHistory("task/a b", { limit: 20, offset: 40, includeArchived: true });

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks/task%2Fa%20b/run-history?limit=20&offset=40&includeArchived=1");
    expect(history.runs[0]?.run.runId).toBe("run_canvas_1");
    expect(history.runs[0]?.annotation.best).toBe(true);
  });

  it("patches live Canvas Task run annotations", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      annotation: {
        runId: "run/a b",
        taskId: "task_1",
        best: true,
        archived: false,
        note: "质量最好",
        updatedAt: "2026-05-25T00:00:03.000Z",
      },
    }), { status: 200 }));

    const response = await api.updateTaskRunAnnotation("run/a b", { best: true, note: "质量最好" });

    expect(fetch).toHaveBeenCalledWith("/v1/team/task-runs/run%2Fa%20b/annotation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ best: true, note: "质量最好" }),
    });
    expect(response.annotation.best).toBe(true);
  });

  it("lists live Canvas Task run summaries by task id with limit and summary view", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      runsByTaskId: {
        task_1: [{
          runId: "run_canvas_1",
          planId: "canvas_task_task_1",
          source: { type: "canvas-task", taskId: "task_1" },
          teamUnitId: "canvas_task_unit_task_1",
          status: "completed",
          createdAt: "2026-05-25T00:00:00.000Z",
          startedAt: "2026-05-25T00:00:00.000Z",
          finishedAt: "2026-05-25T00:00:01.000Z",
          currentTaskId: null,
          taskStates: {},
          summary: { totalTasks: 1, succeededTasks: 1, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
        }],
      },
    }), { status: 200 }));

    const response = await api.listTaskRunsByTaskIds(["task_1"], { limit: 1, view: "summary" });

    expect(fetch).toHaveBeenCalledWith("/v1/team/task-runs/by-task?taskIds=task_1&limit=1&view=summary");
    expect(response.runsByTaskId.task_1?.[0]?.runId).toBe("run_canvas_1");
  });

  it("creates, reads, and cancels live Canvas Task runs", async () => {
    const api = new LiveTeamApi("/v1/team");
    const run = {
      runId: "run_canvas_1",
      planId: "canvas_task_task_1",
      source: { type: "canvas-task", taskId: "task_1" },
      teamUnitId: "canvas_task_unit_task_1",
      status: "queued",
      createdAt: "2026-05-25T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      currentTaskId: null,
      taskStates: {},
      summary: { totalTasks: 1, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    };
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify(run), { status: 201 }));

    await api.createTaskRun("task/a b");
    await api.getTaskRun("run/a b");
    await api.cancelTaskRun("run/a b");

    expect(fetch).toHaveBeenNthCalledWith(1, "/v1/team/tasks/task%2Fa%20b/runs", {
      method: "POST",
      headers: { accept: "application/json" },
    });
    expect(fetch).toHaveBeenNthCalledWith(2, "/v1/team/task-runs/run%2Fa%20b");
    expect(fetch).toHaveBeenNthCalledWith(3, "/v1/team/task-runs/run%2Fa%20b/cancel", {
      method: "POST",
      headers: { accept: "application/json" },
    });
  });

  it("posts live Canvas Task run template bindings when provided", async () => {
    const api = new LiveTeamApi("/v1/team");
    const run = {
      runId: "run_template",
      planId: "canvas_task_task_1",
      source: { type: "canvas-task", taskId: "task_1", templateBindings: { keyword: "MiniMax M3" } },
      teamUnitId: "canvas_task_unit_task_1",
      status: "queued",
      createdAt: "2026-05-25T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      currentTaskId: null,
      taskStates: {},
      summary: { totalTasks: 1, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(run), { status: 201 }));

    const response = await api.createTaskRun("task/a b", { templateBindings: { keyword: "MiniMax M3" } });

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks/task%2Fa%20b/runs", {
      method: "POST",
      headers: { accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ templateBindings: { keyword: "MiniMax M3" } }),
    });
    expect(response.source?.templateBindings).toEqual({ keyword: "MiniMax M3" });
  });

  it("posts live Canvas Task run upstream selections when provided", async () => {
    const api = new LiveTeamApi("/v1/team");
    const run = {
      runId: "run_upstream",
      planId: "canvas_task_task_1",
      source: { type: "canvas-task", taskId: "task_1" },
      teamUnitId: "canvas_task_unit_task_1",
      status: "queued",
      createdAt: "2026-05-25T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      currentTaskId: null,
      taskStates: {},
      summary: { totalTasks: 1, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(run), { status: 201 }));

    await api.createTaskRun("task/a b", {
      upstreamRunSelections: [{ connectionId: "conn/a b", fromRunId: "run/a b" }],
    });

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks/task%2Fa%20b/runs", {
      method: "POST",
      headers: { accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        upstreamRunSelections: [{ connectionId: "conn/a b", fromRunId: "run/a b" }],
      }),
    });
  });

  it("posts live Canvas Task run template bindings and upstream selections together", async () => {
    const api = new LiveTeamApi("/v1/team");
    const run = {
      runId: "run_template_upstream",
      planId: "canvas_task_task_1",
      source: { type: "canvas-task", taskId: "task_1", templateBindings: { keyword: "MiniMax M3" } },
      teamUnitId: "canvas_task_unit_task_1",
      status: "queued",
      createdAt: "2026-05-25T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      currentTaskId: null,
      taskStates: {},
      summary: { totalTasks: 1, succeededTasks: 0, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(run), { status: 201 }));

    await api.createTaskRun("task/a b", {
      templateBindings: { keyword: "MiniMax M3" },
      upstreamRunSelections: [{ connectionId: "conn/a b", fromRunId: "run/a b" }],
    });

    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks/task%2Fa%20b/runs", {
      method: "POST",
      headers: { accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        templateBindings: { keyword: "MiniMax M3" },
        upstreamRunSelections: [{ connectionId: "conn/a b", fromRunId: "run/a b" }],
      }),
    });
  });

  it("reads live Canvas Task run attempts and files from task-run endpoints", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        attempts: [{
          attemptId: "attempt/a b",
          taskId: "task/c d",
          status: "succeeded",
          phase: "succeeded",
          createdAt: "2026-05-25T00:00:00.000Z",
          updatedAt: "2026-05-25T00:00:02.000Z",
          finishedAt: "2026-05-25T00:00:02.000Z",
          worker: [],
          checker: [],
          watcher: null,
          resultRef: "tasks/task/c d/attempts/attempt/a b/accepted-result.md",
          errorSummary: null,
          files: ["accepted-result.md"],
        }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("accepted result", { status: 200 }));

    const attempts = await api.listTaskRunAttempts("run/a b", "task/c d");
    const content = await api.readTaskRunAttemptFile("run/a b", "task/c d", "attempt/a b", "accepted-result.md");

    expect(fetch).toHaveBeenNthCalledWith(1, "/v1/team/task-runs/run%2Fa%20b/tasks/task%2Fc%20d/attempts");
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/v1/team/task-runs/run%2Fa%20b/tasks/task%2Fc%20d/attempts/attempt%2Fa%20b/files/accepted-result.md",
    );
    expect(attempts[0]?.attemptId).toBe("attempt/a b");
    expect(content).toBe("accepted result");
  });

  it("reads live Canvas Task dispatch diagnostics attempts with a light view", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      attempts: [{
        attemptId: "attempt_dispatch",
        taskId: "task_dispatch",
        status: "succeeded",
        phase: "succeeded",
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:02.000Z",
        finishedAt: "2026-05-25T00:00:02.000Z",
        worker: [],
        checker: [],
        watcher: null,
        resultRef: null,
        errorSummary: null,
        discoveryDispatch: [{
          itemId: "item_1",
          status: "blocked",
          error: "missing id",
          createdAt: "2026-05-25T00:00:01.000Z",
        }],
      }],
    }), { status: 200 }));

    const attempts = await api.listTaskRunAttempts("run/a b", "task/c d", { view: "dispatch-diagnostics" });

    expect(fetch).toHaveBeenCalledWith(
      "/v1/team/task-runs/run%2Fa%20b/tasks/task%2Fc%20d/attempts?view=dispatch-diagnostics",
    );
    expect(attempts[0]?.discoveryDispatch?.[0]?.status).toBe("blocked");
  });

  it("preserves downstream delivery outcomes from live Canvas Task attempts", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      attempts: [{
        attemptId: "attempt_dd_1",
        taskId: "task_dd",
        status: "succeeded",
        phase: "succeeded",
        createdAt: "2026-05-26T00:00:00.000Z",
        updatedAt: "2026-05-26T00:00:02.000Z",
        finishedAt: "2026-05-26T00:00:02.000Z",
        worker: [],
        checker: [],
        watcher: null,
        resultRef: "tasks/task_dd/attempts/attempt_dd_1/accepted-result.md",
        errorSummary: null,
        files: ["accepted-result.md"],
        downstreamDelivery: [{
          connectionId: "conn_dd_1",
          toTaskId: "task_dd_downstream",
          toInputPortId: "source_md",
          status: "failed",
          error: "downstream task not found",
          createdAt: "2026-05-26T00:00:03.000Z",
        }],
      }],
    }), { status: 200 }));

    const attempts = await api.listTaskRunAttempts("run_dd", "task_dd");

    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.downstreamDelivery).toBeDefined();
    expect(attempts[0]!.downstreamDelivery!).toHaveLength(1);
    expect(attempts[0]!.downstreamDelivery![0]!.status).toBe("failed");
    expect(attempts[0]!.downstreamDelivery![0]!.error).toBe("downstream task not found");
    expect((attempts[0]!.downstreamDelivery![0] as { connectionId: string }).connectionId).toBe("conn_dd_1");
    expect(attempts[0]!.downstreamDelivery![0]!.toTaskId).toBe("task_dd_downstream");
  });

  it("getRunDetail URL-encodes the run id", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(makeSequentialRun()), { status: 200 }));

    await api.getRunDetail("run/a b");

    expect(fetch).toHaveBeenCalledWith("/v1/team/runs/run%2Fa%20b");
  });

  it("listAttempts URL-encodes run and task ids", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ attempts: [] }), { status: 200 }));

    await api.listAttempts("run/a b", "task/c d");

    expect(fetch).toHaveBeenCalledWith("/v1/team/runs/run%2Fa%20b/tasks/task%2Fc%20d/attempts");
  });

  it("readAttemptFile URL-encodes run, task, attempt, and file names", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response("file body", { status: 200 }));

    await api.readAttemptFile("run/a b", "task/c d", "attempt/e f", "worker output.md");

    expect(fetch).toHaveBeenCalledWith(
      "/v1/team/runs/run%2Fa%20b/tasks/task%2Fc%20d/attempts/attempt%2Fe%20f/files/worker%20output.md",
    );
  });

  it("turns non-OK responses into readable API errors", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 503 }));

    await expect(api.listPlans()).rejects.toEqual({
      message: "请求失败 (503)",
      status: 503,
    });
  });

  it("turns attempt file non-OK responses into readable API errors", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response("missing", { status: 404 }));

    await expect(api.readAttemptFile("run_1", "task_1", "attempt_1", "missing.md")).rejects.toEqual({
      message: "请求失败 (404)",
      status: 404,
    });
  });

  it("turns network errors into readable API errors", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(api.listAttempts("run_1", "task_1")).rejects.toEqual({
      message: "无法连接服务器",
      status: 0,
    });
  });

  it("listAgents calls /v1/agents and returns agents", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      agents: [
        { agentId: "main", name: "主 Agent", description: "默认综合 agent" },
      ],
    }), { status: 200 }));

    const agents = await (api as unknown as {
      listAgents(): Promise<Array<{ agentId: string; name: string; description: string }>>;
    }).listAgents();

    expect(fetch).toHaveBeenCalledWith("/v1/agents");
    expect(agents).toEqual([
      { agentId: "main", name: "主 Agent", description: "默认综合 agent" },
    ]);
  });

  it("coalesces concurrent identical live JSON GET requests", async () => {
    const api = new LiveTeamApi("/v1/team");
    let resolveResponse: (response: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValue(new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    }));

    const first = api.listTasks();
    const second = api.listTasks();
    resolveResponse(new Response(JSON.stringify({ tasks: [mockTeamTasks[0]!] }), { status: 200 }));

    await expect(Promise.all([first, second])).resolves.toEqual([
      [mockTeamTasks[0]!],
      [mockTeamTasks[0]!],
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/v1/team/tasks");
  });

  it("listAgentRunStatuses calls /v1/agents/status and returns statuses", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      agents: [
        {
          agentId: "main",
          name: "主 Agent",
          status: "busy",
          activeConversationId: "conv_active",
          activeSince: "2026-05-24T00:00:00.000Z",
        },
      ],
    }), { status: 200 }));

    const statuses = await api.listAgentRunStatuses();

    expect(fetch).toHaveBeenCalledWith("/v1/agents/status", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    expect(statuses).toEqual([
      {
        agentId: "main",
        name: "主 Agent",
        status: "busy",
        activeConversationId: "conv_active",
        activeSince: "2026-05-24T00:00:00.000Z",
      },
    ]);
  });

  it("sendAgentMessage posts to scoped agent chat endpoint", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      conversationId: "conv_1",
      text: "收到",
    }), { status: 200 }));

    const response = await (api as unknown as {
      sendAgentMessage(agentId: string, message: string): Promise<{ conversationId?: string; text: string }>;
    }).sendAgentMessage("search/agent", "帮我查一下");

    expect(fetch).toHaveBeenCalledWith("/v1/agents/search%2Fagent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "帮我查一下" }),
    });
    expect(response).toEqual({ conversationId: "conv_1", text: "收到" });
  });

  it("sendAgentMessage reuses an existing scoped conversation id", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      conversationId: "conv_1",
      text: "继续",
    }), { status: 200 }));

    await (api as unknown as {
      sendAgentMessage(agentId: string, message: string, conversationId?: string): Promise<{ conversationId?: string; text: string }>;
    }).sendAgentMessage("main", "继续刚才的问题", "conv_1");

    expect(fetch).toHaveBeenCalledWith("/v1/agents/main/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "继续刚才的问题", conversationId: "conv_1" }),
    });
  });

  it("sendAgentMessage sends selected asset refs when present", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      conversationId: "conv_1",
      text: "收到附件",
    }), { status: 200 }));

    await (api as unknown as {
      sendAgentMessage(agentId: string, message: string, conversationId?: string, assetRefs?: string[]): Promise<{ conversationId?: string; text: string }>;
    }).sendAgentMessage("main", "看附件", undefined, ["asset_1"]);

    expect(fetch).toHaveBeenCalledWith("/v1/agents/main/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "看附件", assetRefs: ["asset_1"] }),
    });
  });

  it("createAgentConversation posts to the scoped conversation endpoint", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      conversationId: "conv_new",
      currentConversationId: "conv_new",
      created: true,
    }), { status: 200 }));

    const response = await (api as unknown as {
      createAgentConversation(agentId: string): Promise<{ conversationId: string; currentConversationId: string; created: boolean }>;
    }).createAgentConversation("main");

    expect(fetch).toHaveBeenCalledWith("/v1/agents/main/chat/conversations", {
      method: "POST",
      headers: { accept: "application/json" },
    });
    expect(response.conversationId).toBe("conv_new");
  });

  it("listAgentConversations calls the scoped conversation catalog endpoint", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      currentConversationId: "conv_current",
      conversations: [
        {
          conversationId: "conv_current",
          title: "当前会话",
          preview: "hello",
          messageCount: 2,
          createdAt: "2026-05-24T00:00:00.000Z",
          updatedAt: "2026-05-24T00:01:00.000Z",
          running: false,
        },
      ],
    }), { status: 200 }));

    const response = await api.listAgentConversations("main/agent");

    expect(fetch).toHaveBeenCalledWith("/v1/agents/main%2Fagent/chat/conversations", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    expect(response.currentConversationId).toBe("conv_current");
    expect(response.conversations).toHaveLength(1);
  });

  it("switchAgentConversation posts the scoped current conversation id", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      conversationId: "conv_2",
      currentConversationId: "conv_2",
      switched: true,
    }), { status: 200 }));

    const response = await api.switchAgentConversation("main", "conv_2");

    expect(fetch).toHaveBeenCalledWith("/v1/agents/main/chat/current", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: "conv_2" }),
    });
    expect(response.switched).toBe(true);
  });

  it("getAgentConversationState reads scoped state with a view limit", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      conversationId: "conv_1",
      running: false,
      contextUsage: {
        provider: "zhipu-glm",
        model: "glm-5.1",
        currentTokens: 8,
        contextWindow: 128000,
        reserveTokens: 16384,
        maxResponseTokens: 16384,
        availableTokens: 111608,
        percent: 1,
        status: "safe",
        mode: "usage",
      },
      messages: [],
      viewMessages: [],
      activeRun: null,
      historyPage: { hasMore: false, limit: 80 },
      updatedAt: "2026-05-24T00:00:00.000Z",
    }), { status: 200 }));

    const response = await api.getAgentConversationState("main", "conv_1", 80);

    expect(fetch).toHaveBeenCalledWith("/v1/agents/main/chat/state?conversationId=conv_1&viewLimit=80", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    expect(response.conversationId).toBe("conv_1");
  });

  it("streamAgentConversationEvents subscribes to scoped run events after the active cursor", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(sseResponse([
      'data: {"type":"text_delta","textDelta":"继续"}',
      "",
      'data: {"type":"done","conversationId":"conv_1","runId":"run_1","text":"继续完成"}',
      "",
      "",
    ].join("\n")));
    const events: unknown[] = [];

    await (api as unknown as {
      streamAgentConversationEvents(
        agentId: string,
        request: { conversationId: string; afterEventCursor?: number },
        onEvent: (event: unknown) => void,
      ): Promise<void>;
    }).streamAgentConversationEvents("search/agent", {
      conversationId: "conv_1",
      afterEventCursor: 7,
    }, (event) => events.push(event));

    expect(fetch).toHaveBeenCalledWith("/v1/agents/search%2Fagent/chat/events?conversationId=conv_1&afterEventCursor=7", {
      method: "GET",
      headers: { accept: "text/event-stream" },
    });
    expect(events).toEqual([
      { type: "text_delta", textDelta: "继续" },
      { type: "done", conversationId: "conv_1", runId: "run_1", text: "继续完成" },
    ]);
  });

  it("getAgentChatStatus reads scoped run status", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      conversationId: "conv_1",
      running: false,
      contextUsage: {
        provider: "zhipu-glm",
        model: "glm-5.1",
        currentTokens: 2048,
        contextWindow: 128000,
        reserveTokens: 16384,
        maxResponseTokens: 16384,
        availableTokens: 109568,
        percent: 2,
        status: "safe",
        mode: "usage",
      },
    }), { status: 200 }));

    await (api as unknown as {
      getAgentChatStatus(agentId: string, conversationId: string): Promise<{ running: boolean }>;
    }).getAgentChatStatus("main", "conv_1");

    expect(fetch).toHaveBeenCalledWith("/v1/agents/main/chat/status?conversationId=conv_1", {
      method: "GET",
      headers: { accept: "application/json" },
    });
  });

  it("interruptAgentChat posts to the scoped interrupt endpoint", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      conversationId: "conv_1",
      interrupted: true,
    }), { status: 200 }));

    await (api as unknown as {
      interruptAgentChat(agentId: string, conversationId: string): Promise<{ interrupted: boolean }>;
    }).interruptAgentChat("main", "conv_1");

    expect(fetch).toHaveBeenCalledWith("/v1/agents/main/chat/interrupt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: "conv_1" }),
    });
  });

  it("queueAgentMessage posts to the scoped queue endpoint", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      conversationId: "conv_1",
      mode: "steer",
      queued: true,
    }), { status: 200 }));

    const response = await api.queueAgentMessage("main", {
      conversationId: "conv_1",
      message: "追加一个约束",
      mode: "steer",
      assetRefs: ["asset_1"],
    });

    expect(fetch).toHaveBeenCalledWith("/v1/agents/main/chat/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: "conv_1",
        message: "追加一个约束",
        mode: "steer",
        assetRefs: ["asset_1"],
      }),
    });
    expect(response.queued).toBe(true);
  });

  it("streamAgentMessage posts scoped chat stream payload and parses SSE events", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(sseResponse([
      'data: {"type":"run_started","conversationId":"conv_1","runId":"run_1"}',
      "",
      'data: {"type":"text_delta","textDelta":"你"}',
      "",
      'data: {"type":"done","conversationId":"conv_1","runId":"run_1","text":"你好"}',
      "",
      "",
    ].join("\n")));
    const events: unknown[] = [];

    await api.streamAgentMessage("search/agent", {
      conversationId: "conv_1",
      message: "查一下",
      assetRefs: ["asset_1"],
    }, (event) => events.push(event));

    expect(fetch).toHaveBeenCalledWith("/v1/agents/search%2Fagent/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
    });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      conversationId: "conv_1",
      message: "查一下",
      assetRefs: ["asset_1"],
    });
    expect(events).toEqual([
      { type: "run_started", conversationId: "conv_1", runId: "run_1" },
      { type: "text_delta", textDelta: "你" },
      { type: "done", conversationId: "conv_1", runId: "run_1", text: "你好" },
    ]);
  });

  it("streamAgentMessage throws a useful API error for non-OK streaming responses", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({
      error: { message: "agent busy" },
    }), { status: 409 }));

    await expect(api.streamAgentMessage("main", {
      conversationId: "conv_1",
      message: "hello",
    }, () => {})).rejects.toEqual({
      message: "agent busy",
      status: 409,
    });
  });

  it("streamAgentMessage ignores malformed SSE chunks but surfaces terminal error events", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(sseResponse([
      "data: not json",
      "",
      'data: {"type":"text_delta","textDelta":"partial"}',
      "",
      'data: {"type":"error","conversationId":"conv_1","runId":"run_1","message":"boom"}',
      "",
      "",
    ].join("\n")));
    const events: unknown[] = [];

    await expect(api.streamAgentMessage("main", {
      conversationId: "conv_1",
      message: "hello",
    }, (event) => events.push(event))).rejects.toEqual({
      message: "boom",
    });
    expect(events).toEqual([
      { type: "text_delta", textDelta: "partial" },
      { type: "error", conversationId: "conv_1", runId: "run_1", message: "boom" },
    ]);
  });

  it("listAssets reads the reusable file library", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ assets: [] }), { status: 200 }));

    await (api as unknown as { listAssets(limit?: number): Promise<unknown[]> }).listAssets(40);

    expect(fetch).toHaveBeenCalledWith("/v1/assets?limit=40", {
      method: "GET",
      headers: { accept: "application/json" },
    });
  });

  it("uploadFilesAsAssets posts multipart files to /v1/assets/upload", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ assets: [] }), { status: 200 }));
    const file = new File(["hello"], "brief.md", { type: "text/markdown" });

    await (api as unknown as { uploadFilesAsAssets(files: File[], conversationId?: string): Promise<unknown[]> }).uploadFilesAsAssets([file], "conv_1");

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/v1/assets/upload");
    expect(init).toMatchObject({
      method: "POST",
      headers: { accept: "application/json" },
    });
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it("accepts connection responses with status and staleReason", async () => {
    const api = new LiveTeamApi("/v1/team");
    const staleConnection = {
      schemaVersion: "team/task-connection-1",
      connectionId: "conn_stale_1",
      fromTaskId: "task_a",
      fromOutputPortId: "draft_md",
      toTaskId: "task_b",
      toInputPortId: "source_md",
      type: "md",
      status: "stale",
      staleReason: "target_task_archived",
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
    } as const;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ connections: [staleConnection] }), { status: 200 }));

    const connections = await api.listTaskConnections();

    expect(fetch).toHaveBeenCalledWith("/v1/team/task-connections");
    expect(connections[0]?.status).toBe("stale");
    expect(connections[0]?.staleReason).toBe("target_task_archived");
  });

  it("lists, creates, updates, and archives live source nodes", async () => {
    const api = new LiveTeamApi("/v1/team");
    const sourceNode = {
      schemaVersion: "team/source-node-1",
      sourceNodeId: "source_1",
      title: "需求说明",
      nodeType: "text",
      outputPort: { id: "value", type: "string" },
      content: { text: "source text" },
      archived: false,
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
    } as const;
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ sourceNodes: [sourceNode] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sourceNode }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sourceNode: { ...sourceNode, title: "更新后" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sourceNode: { ...sourceNode, archived: true } }), { status: 200 }));

    const listed = await api.listSourceNodes();
    const created = await api.createSourceNode({
      title: "需求说明",
      nodeType: "text",
      content: { text: "source text" },
    });
    const updated = await api.updateSourceNode("source/1", { title: "更新后" });
    const archived = await api.archiveSourceNode("source/1");

    expect(fetch).toHaveBeenNthCalledWith(1, "/v1/team/source-nodes");
    expect(fetch).toHaveBeenNthCalledWith(2, "/v1/team/source-nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "需求说明",
        nodeType: "text",
        content: { text: "source text" },
      }),
    });
    expect(fetch).toHaveBeenNthCalledWith(3, "/v1/team/source-nodes/source%2F1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "更新后" }),
    });
    expect(fetch).toHaveBeenNthCalledWith(4, "/v1/team/source-nodes/source%2F1/archive", {
      method: "POST",
      headers: { accept: "application/json" },
    });
    expect(listed).toEqual([sourceNode]);
    expect(created).toEqual(sourceNode);
    expect(updated.title).toBe("更新后");
    expect(archived.archived).toBe(true);
  });

  it("lists, creates, and deletes live source connections without task-connection endpoint", async () => {
    const api = new LiveTeamApi("/v1/team");
    const sourceConnection = {
      schemaVersion: "team/source-connection-1",
      connectionId: "source_conn_1",
      fromSourceNodeId: "source_1",
      fromOutputPortId: "value",
      toTaskId: "task_1",
      toInputPortId: "source_text",
      type: "string",
      status: "active",
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
    } as const;
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ connections: [sourceConnection] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ connection: sourceConnection }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const listed = await api.listSourceConnections();
    const created = await api.createSourceConnection({
      fromSourceNodeId: "source_1",
      fromOutputPortId: "value",
      toTaskId: "task_1",
      toInputPortId: "source_text",
    });
    await api.deleteSourceConnection("source/conn 1");

    expect(fetch).toHaveBeenNthCalledWith(1, "/v1/team/source-connections");
    expect(fetch).toHaveBeenNthCalledWith(2, "/v1/team/source-connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromSourceNodeId: "source_1",
        fromOutputPortId: "value",
        toTaskId: "task_1",
        toInputPortId: "source_text",
      }),
    });
    expect(fetch).toHaveBeenNthCalledWith(3, "/v1/team/source-connections/source%2Fconn%201", {
      method: "DELETE",
    });
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).not.toContain("/v1/team/task-connections");
    expect(listed).toEqual([sourceConnection]);
    expect(created).toEqual(sourceConnection);
  });

  it("lists live Task dependencies from the task-dependencies endpoint", async () => {
    const api = new LiveTeamApi("/v1/team");
    const dependency = {
      schemaVersion: "team/task-dependency-1",
      dependencyId: "dep_1",
      fromTaskId: "task_a",
      toTaskId: "task_b",
      trigger: "on_success",
      status: "active",
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
    } as const;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ dependencies: [dependency] }), { status: 200 }));

    const dependencies = await api.listTaskDependencies();

    expect(fetch).toHaveBeenCalledWith("/v1/team/task-dependencies");
    expect(dependencies).toEqual([dependency]);
  });

  it("treats missing Task dependencies endpoint as an empty list", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response("not found", { status: 404 }));

    await expect(api.listTaskDependencies()).resolves.toEqual([]);
  });

  it("creates live Task dependencies by posting fromTaskId and toTaskId", async () => {
    const api = new LiveTeamApi("/v1/team");
    const dependency = {
      schemaVersion: "team/task-dependency-1",
      dependencyId: "dep_new",
      fromTaskId: "task_a",
      toTaskId: "task_b",
      trigger: "on_success",
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ dependency }), { status: 201 }));

    const created = await api.createTaskDependency({ fromTaskId: "task_a", toTaskId: "task_b" });

    expect(fetch).toHaveBeenCalledWith("/v1/team/task-dependencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromTaskId: "task_a", toTaskId: "task_b" }),
    });
    expect(created.dependencyId).toBe("dep_new");
    expect(created.trigger).toBe("on_success");
  });

  it("deletes live Task dependencies by dependency id", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await api.deleteTaskDependency("dep/a b");

    expect(fetch).toHaveBeenCalledWith("/v1/team/task-dependencies/dep%2Fa%20b", {
      method: "DELETE",
    });
  });

  it("preserves stale Task dependency status and staleReason in list response", async () => {
    const api = new LiveTeamApi("/v1/team");
    const staleDep = {
      schemaVersion: "team/task-dependency-1",
      dependencyId: "dep_stale",
      fromTaskId: "task_archived",
      toTaskId: "task_b",
      trigger: "on_success",
      status: "stale",
      staleReason: "source_task_archived",
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
    } as const;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ dependencies: [staleDep] }), { status: 200 }));

    const dependencies = await api.listTaskDependencies();

    expect(dependencies[0]?.status).toBe("stale");
    expect(dependencies[0]?.staleReason).toBe("source_task_archived");
  });

  it("lists live Task Groups from the task-groups endpoint", async () => {
    const api = new LiveTeamApi("/v1/team");
    const taskGroup = {
      schemaVersion: "team/task-group-1",
      groupId: "group_1",
      title: "Backend Group",
      taskIds: ["task_a", "task_b"],
      archived: false,
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:00.000Z",
      status: "valid",
      headTaskIds: ["task_a"],
      validation: { errors: [] },
    } as const;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ taskGroups: [taskGroup] }), { status: 200 }));

    const groups = await api.listTaskGroups();

    expect(fetch).toHaveBeenCalledWith("/v1/team/task-groups");
    expect(groups).toEqual([taskGroup]);
  });

  it("accepts the current backend groups response shape for live Task Groups", async () => {
    const api = new LiveTeamApi("/v1/team");
    const group = {
      schemaVersion: "team/task-group-1",
      groupId: "group_backend",
      title: "Backend Shape",
      taskIds: ["task_a"],
      archived: false,
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:00.000Z",
      status: "valid",
      headTaskIds: ["task_a"],
      validation: { errors: [] },
    } as const;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ groups: [group] }), { status: 200 }));

    await expect(api.listTaskGroups()).resolves.toEqual([group]);
  });

  it("treats missing live Task Groups endpoint as an empty list", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch).mockResolvedValue(new Response("not found", { status: 404 }));

    await expect(api.listTaskGroups()).resolves.toEqual([]);
  });

  it("creates live Task Groups by posting title and taskIds", async () => {
    const api = new LiveTeamApi("/v1/team");
    const taskGroup = {
      schemaVersion: "team/task-group-1",
      groupId: "group_new",
      title: "Group 1",
      taskIds: ["task_a", "task_b"],
      archived: false,
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:00.000Z",
      status: "valid",
      headTaskIds: ["task_a"],
      validation: { errors: [] },
    } as const;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ taskGroup }), { status: 201 }));

    const created = await api.createTaskGroup({ title: "Group 1", taskIds: ["task_a", "task_b"] });

    expect(fetch).toHaveBeenCalledWith("/v1/team/task-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Group 1", taskIds: ["task_a", "task_b"] }),
    });
    expect(created).toEqual(taskGroup);
  });

  it("archives live Task Groups with URL-encoded group ids", async () => {
    const api = new LiveTeamApi("/v1/team");
    const taskGroup = {
      schemaVersion: "team/task-group-1",
      groupId: "group/a b",
      title: "Group 1",
      taskIds: ["task_a"],
      archived: true,
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:01.000Z",
      status: "valid",
      headTaskIds: ["task_a"],
      validation: { errors: [] },
    } as const;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ group: taskGroup }), { status: 200 }));

    const archived = await api.archiveTaskGroup("group/a b");

    expect(fetch).toHaveBeenCalledWith("/v1/team/task-groups/group%2Fa%20b/archive", {
      method: "POST",
      headers: { accept: "application/json" },
    });
    expect(archived.archived).toBe(true);
  });

  it("preserves backend Task Group validation messages on create and archive failures", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: "Group boundary is not closed" },
      }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: "group already archived" },
      }), { status: 409 }));

    await expect(api.createTaskGroup({ title: "Broken", taskIds: ["task_a", "task_b"] })).rejects.toEqual({
      message: "Group boundary is not closed",
      status: 400,
    });
    await expect(api.archiveTaskGroup("group_1")).rejects.toEqual({
      message: "group already archived",
      status: 409,
    });
  });

  it("starts live Task Group runs with URL-encoded group ids", async () => {
    const api = new LiveTeamApi("/v1/team");
    const groupRun = {
      schemaVersion: "team/task-group-run-1",
      groupRunId: "group_run_1",
      groupId: "group/a b",
      status: "running",
      source: { type: "manual" },
      entryRuns: [{ taskId: "task_a", runId: "run_a" }],
      observedRuns: [{ taskId: "task_a", runId: "run_a", role: "entry" }],
      startedAt: "2026-06-05T00:00:00.000Z",
      finishedAt: null,
      lastError: null,
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:00.000Z",
    } as const;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ groupRun }), { status: 201 }));

    const started = await api.startTaskGroupRun("group/a b");

    expect(fetch).toHaveBeenCalledWith("/v1/team/task-groups/group%2Fa%20b/runs", {
      method: "POST",
      headers: { accept: "application/json" },
    });
    expect(started).toEqual(groupRun);
  });

  it("lists live Task Group runs with URL-encoded group ids", async () => {
    const api = new LiveTeamApi("/v1/team");
    const groupRun = {
      schemaVersion: "team/task-group-run-1",
      groupRunId: "group_run_1",
      groupId: "group/a b",
      status: "completed",
      source: { type: "manual" },
      entryRuns: [],
      observedRuns: [],
      startedAt: "2026-06-05T00:00:00.000Z",
      finishedAt: "2026-06-05T00:01:00.000Z",
      lastError: null,
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:01:00.000Z",
    } as const;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ groupRuns: [groupRun] }), { status: 200 }));

    const groupRuns = await api.listTaskGroupRuns("group/a b");

    expect(fetch).toHaveBeenCalledWith("/v1/team/task-groups/group%2Fa%20b/runs");
    expect(groupRuns).toEqual([groupRun]);
  });

  it("gets live Task Group runs by URL-encoded run id", async () => {
    const api = new LiveTeamApi("/v1/team");
    const groupRun = {
      schemaVersion: "team/task-group-run-1",
      groupRunId: "group_run/a b",
      groupId: "group_1",
      status: "running",
      source: { type: "manual" },
      entryRuns: [],
      observedRuns: [],
      startedAt: "2026-06-05T00:00:00.000Z",
      finishedAt: null,
      lastError: null,
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:00:00.000Z",
    } as const;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ groupRun }), { status: 200 }));

    const fresh = await api.getTaskGroupRun("group_run/a b");

    expect(fetch).toHaveBeenCalledWith("/v1/team/task-group-runs/group_run%2Fa%20b");
    expect(fresh).toEqual(groupRun);
  });

  it("cancels live Task Group runs with URL-encoded run ids", async () => {
    const api = new LiveTeamApi("/v1/team");
    const groupRun = {
      schemaVersion: "team/task-group-run-1",
      groupRunId: "group_run/a b",
      groupId: "group_1",
      status: "cancelled",
      source: { type: "manual" },
      entryRuns: [],
      observedRuns: [],
      startedAt: "2026-06-05T00:00:00.000Z",
      finishedAt: "2026-06-05T00:01:00.000Z",
      lastError: "cancelled by user",
      createdAt: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-06-05T00:01:00.000Z",
    } as const;
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ groupRun }), { status: 200 }));

    const cancelled = await api.cancelTaskGroupRun("group_run/a b");

    expect(fetch).toHaveBeenCalledWith("/v1/team/task-group-runs/group_run%2Fa%20b/cancel", {
      method: "POST",
      headers: { accept: "application/json" },
    });
    expect(cancelled).toEqual(groupRun);
  });

  it("preserves backend Task Group run messages on start and cancel failures", async () => {
    const api = new LiveTeamApi("/v1/team");
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: "active task group run already exists" },
      }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: "task group run is already terminal" },
      }), { status: 409 }));

    await expect(api.startTaskGroupRun("group_1")).rejects.toEqual({
      message: "active task group run already exists",
      status: 409,
    });
    await expect(api.cancelTaskGroupRun("group_run_1")).rejects.toEqual({
      message: "task group run is already terminal",
      status: 409,
    });
  });

});

describe("Fixtures coverage", () => {
  it("sequential run has plan tasks in order", () => {
    const run = makeSequentialRun();
    expect(Object.keys(run.taskStates)).toEqual(["task_1", "task_2", "task_3"]);
  });

  it("discovery run has generated children with parentTaskId", () => {
    const run = makeDiscoveryForEachRun();
    expect(run.taskDefinitions).toBeDefined();
    const children = run.taskDefinitions!.filter((t) => t.parentTaskId === "process_each");
    expect(children.length).toBe(3);
    expect(children[0].generatedSource).toBe("for_each");
  });

  it("orphan run has task without parent match", () => {
    const run = makeOrphanRun();
    expect(run.taskDefinitions).toBeDefined();
    const orphan = run.taskDefinitions!.find((t) => t.id === "orphan_child_001");
    expect(orphan).toBeDefined();
    expect(orphan!.parentTaskId).toBeUndefined();
  });

  it("large child run has 10 children", () => {
    const run = makeLargeChildRun();
    expect(run.taskDefinitions!.length).toBe(10);
    expect(run.summary.totalTasks).toBe(12);
  });

  it("failed run has errorSummary on failed task", async () => {
    const { makeFailedRun } = await import("../fixtures/team-fixtures");
    const run = makeFailedRun();
    expect(run.taskStates["task_2"].errorSummary).toBeTruthy();
    expect(run.taskStates["task_2"].status).toBe("failed");
  });
});
