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
