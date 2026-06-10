import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_FIXTURES,
  MockTeamApi,
  mockDiscoveryGeneratedTasks,
  mockDiscoveryRootTask,
  mockTeamTasks,
  resetMockTeamApiState,
} from "../fixtures/team-fixtures";

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
