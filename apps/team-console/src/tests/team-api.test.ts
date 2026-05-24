import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { MockTeamApi } from "../fixtures/team-fixtures";
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
