import type {
  AgentAssetSummary,
  AgentChatActiveRun,
  AgentChatHistoryMessage,
  AgentChatResponse,
  AgentChatStreamEvent,
  AgentChatStreamRequest,
  AgentChatStatus,
  AgentConversationCatalogResponse,
  AgentConversationEventsRequest,
  AgentConversationState,
  AgentConversationResponse,
  AgentInterruptResponse,
  AgentQueueMessageRequest,
  AgentQueueMessageResponse,
  AgentRunStatus,
  AgentSummary,
  AgentSwitchConversationResponse,
  TeamPlan,
  RunDetail,
  TeamRunState,
  TeamTask,
  TeamTaskState,
  TaskDefinition,
  TeamAttemptMetadata,
} from "../api/team-types";

function ts(offsetMin = 0): string {
  return new Date(Date.now() + offsetMin * 60000).toISOString();
}

const planTask = (
  id: string,
  title: string,
  type: TeamTask["type"] = "normal",
  extra?: Partial<TeamTask>,
): TeamTask => ({
  id,
  type,
  title,
  input: { text: title },
  acceptance: { rules: ["output is valid"] },
  ...extra,
});

function taskState(
  status: TeamTaskState["status"] = "succeeded",
  extra?: Partial<TeamTaskState>,
): TeamTaskState {
  return {
    status,
    attemptCount: 1,
    activeAttemptId: null,
    resultRef: status === "succeeded" ? `tasks/x/attempts/y/accepted-result.md` : null,
    errorSummary: null,
    progress: { phase: status === "succeeded" ? "succeeded" : "pending", message: "", updatedAt: ts() },
    ...extra,
  };
}

export function makeSequentialPlan(): TeamPlan {
  return {
    planId: "plan_seq_001",
    title: "Sequential Research Plan",
    defaultTeamUnitId: "tu_001",
    goal: { text: "Research three vendors" },
    tasks: [
      planTask("task_1", "Research vendor A"),
      planTask("task_2", "Research vendor B"),
      planTask("task_3", "Research vendor C"),
    ],
    outputContract: { text: "Summary report" },
    archived: false,
    runCount: 1,
  };
}

export function makeSequentialRun(): RunDetail {
  const plan = makeSequentialPlan();
  return {
    runId: "run_seq_001",
    planId: plan.planId,
    teamUnitId: "tu_001",
    status: "completed",
    createdAt: ts(-60),
    startedAt: ts(-59),
    finishedAt: ts(-10),
    currentTaskId: null,
    taskStates: {
      task_1: taskState("succeeded"),
      task_2: taskState("succeeded"),
      task_3: taskState("succeeded"),
    },
    summary: { totalTasks: 3, succeededTasks: 3, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
  };
}

export function makeDiscoveryForEachPlan(): TeamPlan {
  return {
    planId: "plan_dyn_001",
    title: "Discovery + ForEach Plan",
    defaultTeamUnitId: "tu_001",
    goal: { text: "Discover and process items" },
    tasks: [
      planTask("discover", "Discover items", "discovery", {
        discovery: { outputKey: "items" },
      }),
      planTask("process_each", "Process each item", "for_each", {
        forEach: {
          itemsFrom: "discover.items",
          mode: "sequential",
          taskTemplate: {
            title: "Process {{item.title}}",
            input: { text: "Process item {{item.id}}" },
            acceptance: { rules: ["output valid"] },
          },
        },
      }),
    ],
    outputContract: { text: "Aggregated report" },
    archived: false,
    runCount: 1,
  };
}

export function makeDiscoveryForEachRun(): RunDetail {
  const plan = makeDiscoveryForEachPlan();
  const childTasks: TaskDefinition[] = [
    {
      id: "process_each__item_a",
      title: "Process Alpha",
      type: "normal",
      input: { text: "Process item_a" },
      acceptance: { rules: ["ok"] },
      parentTaskId: "process_each",
      sourceItemId: "item_a",
      generated: true,
      generatedSource: "for_each",
    },
    {
      id: "process_each__item_b",
      title: "Process Beta",
      type: "normal",
      input: { text: "Process item_b" },
      acceptance: { rules: ["ok"] },
      parentTaskId: "process_each",
      sourceItemId: "item_b",
      generated: true,
      generatedSource: "for_each",
    },
    {
      id: "process_each__item_c",
      title: "Process Gamma",
      type: "normal",
      input: { text: "Process item_c" },
      acceptance: { rules: ["ok"] },
      parentTaskId: "process_each",
      sourceItemId: "item_c",
      generated: true,
      generatedSource: "for_each",
    },
  ];

  const childStates: Record<string, TeamTaskState> = {};
  for (const ct of childTasks) {
    childStates[ct.id] = taskState("succeeded");
  }

  return {
    runId: "run_dyn_001",
    planId: plan.planId,
    teamUnitId: "tu_001",
    status: "completed",
    createdAt: ts(-60),
    startedAt: ts(-59),
    finishedAt: ts(-5),
    currentTaskId: null,
    taskStates: {
      discover: taskState("succeeded"),
      process_each: taskState("succeeded"),
      ...childStates,
    },
    summary: { totalTasks: 5, succeededTasks: 5, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    taskDefinitions: childTasks,
  };
}

export function makeDecompositionPlan(): TeamPlan {
  return {
    planId: "plan_decomp_001",
    title: "Decomposition Plan",
    defaultTeamUnitId: "tu_001",
    goal: { text: "Split large task" },
    tasks: [
      planTask("big_task", "Big task to decompose", "normal", {
        decomposer: { mode: "leaf", maxChildren: 4 },
      }),
    ],
    outputContract: { text: "Decomposed results" },
    archived: false,
    runCount: 1,
  };
}

export function makeDecompositionRun(): RunDetail {
  const childTasks: TaskDefinition[] = [
    {
      id: "big_task__sub_1",
      title: "Sub-task 1: Collect data",
      type: "normal",
      input: { text: "Collect data" },
      acceptance: { rules: ["ok"] },
      parentTaskId: "big_task",
      generated: true,
      generatedSource: "decomposition",
    },
    {
      id: "big_task__sub_2",
      title: "Sub-task 2: Analyze data",
      type: "normal",
      input: { text: "Analyze data" },
      acceptance: { rules: ["ok"] },
      parentTaskId: "big_task",
      generated: true,
      generatedSource: "decomposition",
    },
  ];

  return {
    runId: "run_decomp_001",
    planId: "plan_decomp_001",
    teamUnitId: "tu_001",
    status: "completed",
    createdAt: ts(-30),
    startedAt: ts(-29),
    finishedAt: ts(-5),
    currentTaskId: null,
    taskStates: {
      big_task: taskState("succeeded"),
      "big_task__sub_1": taskState("succeeded"),
      "big_task__sub_2": taskState("succeeded"),
    },
    summary: { totalTasks: 3, succeededTasks: 3, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    taskDefinitions: childTasks,
  };
}

export function makeFailedRun(): RunDetail {
  const plan = makeSequentialPlan();
  return {
    runId: "run_fail_001",
    planId: plan.planId,
    teamUnitId: "tu_001",
    status: "failed",
    createdAt: ts(-45),
    startedAt: ts(-44),
    finishedAt: ts(-30),
    currentTaskId: "task_2",
    taskStates: {
      task_1: taskState("succeeded"),
      task_2: taskState("failed", {
        errorSummary: "Worker timeout: exceeded 900000ms limit",
        resultRef: null,
      }),
      task_3: taskState("pending", {
        attemptCount: 0,
        progress: { phase: "pending", message: "", updatedAt: ts() },
      }),
    },
    summary: { totalTasks: 3, succeededTasks: 1, failedTasks: 1, cancelledTasks: 0, skippedTasks: 0 },
  };
}

export function makeOrphanRun(): RunDetail {
  const orphanChild: TaskDefinition = {
    id: "orphan_child_001",
    title: "Orphan child task",
    type: "normal",
    input: { text: "Mystery task" },
    acceptance: { rules: ["ok"] },
    generated: true,
    generatedSource: "for_each",
  };

  return {
    runId: "run_orphan_001",
    planId: "plan_seq_001",
    teamUnitId: "tu_001",
    status: "completed",
    createdAt: ts(-20),
    startedAt: ts(-19),
    finishedAt: ts(-5),
    currentTaskId: null,
    taskStates: {
      task_1: taskState("succeeded"),
      orphan_child_001: taskState("succeeded"),
    },
    summary: { totalTasks: 2, succeededTasks: 2, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    taskDefinitions: [orphanChild],
  };
}

export function makeLargeChildRun(): RunDetail {
  const parentTaskId = "process_each";
  const childTasks: TaskDefinition[] = [];
  const childStates: Record<string, TeamTaskState> = {};

  for (let i = 1; i <= 10; i++) {
    const id = `process_each__item_${i}`;
    childTasks.push({
      id,
      title: `Process Item ${i}`,
      type: "normal",
      input: { text: `Process item_${i}` },
      acceptance: { rules: ["ok"] },
      parentTaskId,
      sourceItemId: `item_${i}`,
      generated: true,
      generatedSource: "for_each",
    });
    childStates[id] = taskState("succeeded");
  }

  return {
    runId: "run_large_001",
    planId: "plan_dyn_001",
    teamUnitId: "tu_001",
    status: "completed",
    createdAt: ts(-120),
    startedAt: ts(-119),
    finishedAt: ts(-10),
    currentTaskId: null,
    taskStates: {
      discover: taskState("succeeded"),
      process_each: taskState("succeeded"),
      ...childStates,
    },
    summary: { totalTasks: 12, succeededTasks: 12, failedTasks: 0, cancelledTasks: 0, skippedTasks: 0 },
    taskDefinitions: childTasks,
  };
}

export function makeSkippedRun(): RunDetail {
  const plan = makeSequentialPlan();
  return {
    runId: "run_skip_001",
    planId: plan.planId,
    teamUnitId: "tu_001",
    status: "completed",
    createdAt: ts(-15),
    startedAt: ts(-14),
    finishedAt: ts(-5),
    currentTaskId: null,
    taskStates: {
      task_1: taskState("succeeded"),
      task_2: taskState("skipped", {
        manualDisposition: "skip",
        resultRef: null,
      }),
      task_3: taskState("succeeded"),
    },
    summary: { totalTasks: 3, succeededTasks: 2, failedTasks: 0, cancelledTasks: 0, skippedTasks: 1 },
  };
}

export interface FixtureEntry {
  id: string;
  label: string;
  plan: TeamPlan;
  run: RunDetail;
}

export function makeRealSnapshotPlan(): TeamPlan {
  return {
    planId: "plan_real_snap_001",
    title: "社交媒体平台搜索调研",
    defaultTeamUnitId: "team_real_snap",
    goal: { text: "对多个社交媒体平台进行信息搜索与汇总" },
    tasks: [
      planTask("discover_platforms", "发现目标平台", "discovery", {
        discovery: { outputKey: "platforms" },
      }),
      planTask("search_platform", "按平台搜索", "for_each", {
        forEach: {
          itemsFrom: "discover_platforms.platforms",
          mode: "sequential",
          taskTemplate: {
            title: "搜索 {{item.name}}",
            input: { text: "搜索平台 {{item.id}}" },
            acceptance: { rules: ["结果真实来自平台搜索"] },
          },
        },
      }),
      planTask("assemble_report", "汇总报告"),
    ],
    outputContract: { text: "结构化搜索报告" },
    archived: false,
    runCount: 1,
  };
}

export function makeRealSnapshotRun(): RunDetail {
  const childTasks: TaskDefinition[] = [
    {
      id: "search_platform__zhihu",
      title: "搜索 知乎",
      type: "normal",
      input: { text: "搜索平台 zhihu" },
      acceptance: { rules: ["结果真实来自平台搜索"] },
      parentTaskId: "search_platform",
      sourceItemId: "zhihu",
      generated: true,
      generatedSource: "for_each",
    },
    {
      id: "search_platform__xiaohongshu",
      title: "搜索 小红书",
      type: "normal",
      input: { text: "搜索平台 xiaohongshu" },
      acceptance: { rules: ["结果真实来自平台搜索"] },
      parentTaskId: "search_platform",
      sourceItemId: "xiaohongshu",
      generated: true,
      generatedSource: "for_each",
    },
    {
      id: "search_platform__weibo",
      title: "搜索 微博",
      type: "normal",
      input: { text: "搜索平台 weibo" },
      acceptance: { rules: ["结果真实来自平台搜索"] },
      parentTaskId: "search_platform",
      sourceItemId: "weibo",
      generated: true,
      generatedSource: "for_each",
    },
    {
      id: "search_platform__tieba",
      title: "搜索 贴吧",
      type: "normal",
      input: { text: "搜索平台 tieba" },
      acceptance: { rules: ["结果真实来自平台搜索"] },
      parentTaskId: "search_platform",
      sourceItemId: "tieba",
      generated: true,
      generatedSource: "for_each",
    },
  ];

  return {
    runId: "run_real_snap_001",
    planId: "plan_real_snap_001",
    teamUnitId: "team_real_snap",
    status: "completed_with_failures",
    createdAt: "2026-05-20T17:08:02.763Z",
    startedAt: "2026-05-20T17:08:04.359Z",
    finishedAt: "2026-05-20T18:28:12.133Z",
    currentTaskId: null,
    taskStates: {
      discover_platforms: taskState("succeeded", {
        activeAttemptId: "attempt_13d62b6bb4e1",
        resultRef: "tasks/discover_platforms/attempts/attempt_13d62b6bb4e1/accepted-result.md",
      }),
      search_platform: taskState("failed", {
        attemptCount: 0,
        activeAttemptId: null,
        resultRef: null,
        errorSummary: "one or more child tasks failed",
      }),
      assemble_report: taskState("failed", {
        attemptCount: 2,
        activeAttemptId: "attempt_fa28d6fc08bf",
        resultRef: "tasks/assemble_report/attempts/attempt_fa28d6fc08bf/accepted-result.md",
        errorSummary: "exceeded max watcher revisions",
      }),
      "search_platform__zhihu": taskState("failed", {
        attemptCount: 2,
        activeAttemptId: "attempt_d62e0d2ff9d5",
        resultRef: "tasks/search_platform__zhihu/attempts/attempt_d62e0d2ff9d5/failed-result.md",
        errorSummary:
          "验收标准1明确要求检索知乎平台2026年1月以来的目标产品相关结果，且验收标准4要求结果真实来自平台搜索、不编造数据。" +
          "Worker 输出的2条结果日期分别为2021-09-15和2019-05-15，均远早于2026年1月，完全不符合2026年以来的时间范围要求。" +
          "Worker自述通过搜狗移动搜索间接检索到2条结果，但这些结果并非2026年以来的内容，且知乎平台直接的搜索尝试均因反爬虫验证失败而未能获取任何数据。" +
          "Worker未能满足'检索到知乎平台2026年1月以来的目标产品相关结果'这一核心验收标准，且结果均为旧内容，无法通过修改达到要求。",
      }),
      "search_platform__xiaohongshu": taskState("failed", {
        attemptCount: 2,
        activeAttemptId: "attempt_e848df111333",
        resultRef: "tasks/search_platform__xiaohongshu/attempts/attempt_e848df111333/failed-result.md",
        errorSummary: "worker timeout",
      }),
      "search_platform__weibo": taskState("failed", {
        attemptCount: 1,
        activeAttemptId: "attempt_df0e33d5439b",
        resultRef: null,
        errorSummary:
          "unexpected error: 400 event:error\n" +
          'data:{"request_id":"req-sanitized","code":"InvalidParameter","message":' +
          '"data: {\\"error\\":{\\"code\\":\\"invalid_parameter_error\\",\\"param\\":null,' +
          '\\"message\\":\\"Range of input length should be [1, 260096]\\",' +
          '\\"type\\":\\"invalid_request_error\\"},\\"id\\":\\"chatcmpl-sanitized\\"}"}\n\n',
      }),
      "search_platform__tieba": taskState("failed", {
        attemptCount: 2,
        activeAttemptId: "attempt_c32f79825477",
        resultRef: "tasks/search_platform__tieba/attempts/attempt_c32f79825477/accepted-result.md",
        errorSummary: "worker timeout",
      }),
    },
    summary: {
      totalTasks: 7,
      succeededTasks: 1,
      failedTasks: 6,
      cancelledTasks: 0,
      skippedTasks: 0,
    },
    taskDefinitions: childTasks,
  };
}

export function makeRealSuccessForEachPlan(): TeamPlan {
  return {
    planId: "plan_real_success_foreach_001",
    title: "Agent 免费无限量网络搜索方案全量探寻",
    defaultTeamUnitId: "team_real_sfe",
    goal: { text: "穷尽全球所有免费、不限额的网络搜索方案，按方向分组探寻，最终产出对比报告" },
    tasks: [
      planTask("discover_directions", "Phase 1 — 发现所有搜索方案方向", "discovery", {
        discovery: { outputKey: "directions" },
      }),
      planTask("explore_direction", "Phase 2 — 逐方向探寻方案", "for_each", {
        forEach: {
          itemsFrom: "discover_directions.directions",
          mode: "sequential",
          taskTemplate: {
            title: "探寻方向：{{item.name}}",
            input: { text: "探寻方向 {{item.id}} 的所有方案" },
            acceptance: { rules: ["方案已找到并评估"] },
          },
        },
      }),
      planTask("assemble_report", "Phase 3 — 组装最终对比报告"),
    ],
    outputContract: { text: "精致深色主题 HTML 对比报告" },
    archived: false,
    runCount: 1,
  };
}

export function makeRealSuccessForEachRun(): RunDetail {
  const directions = [
    { id: "official-search-apis", name: "搜索引擎官方免费 API", attempt: "attempt_68ce15110a99", desc: "主流搜索引擎官方提供的免费层或免费额度 API", kw: "Google Custom Search API free tier, Bing Web Search API free", est: "10-15" },
    { id: "third-party-search-aggregators", name: "第三方搜索 API 聚合服务", attempt: "attempt_0530fd01b4f0", desc: "中间层服务商将各大搜索引擎结果封装为统一 API", kw: "SerpAPI free, Serper.dev free tier, Tavily search API free", est: "20-30" },
    { id: "self-hosted-open-source", name: "开源自部署搜索方案", attempt: "attempt_15e9ae5043ec", desc: "可在自有服务器部署的开源搜索引擎或元搜索引擎", kw: "SearXNG self-hosted, Whoogle search self-hosted", est: "15-25" },
    { id: "llm-builtin-search", name: "LLM 内建搜索能力", attempt: "attempt_daf295ff9001", desc: "大型语言模型原生集成的搜索能力，通常以联网浏览或 grounding 方式提供", kw: "ChatGPT browse search, Gemini grounding search", est: "10-15" },
    { id: "scraping-unofficial", name: "非官方抓取/爬虫方案", attempt: "attempt_94764f169afe", desc: "通过对搜索引擎页面进行 HTML 抓取获得搜索结果的开源库和方案", kw: "google search scraping Python, googlesearch-python", est: "25-40", attemptCount: 2 },
    { id: "vertical-academic-apis", name: "垂直/学术/专业搜索 API", attempt: "attempt_647160886a39", desc: "专注于特定垂直领域的搜索 API，适合学术、新闻、技术等场景", kw: "arXiv API free, PubMed E-utilities API, Semantic Scholar API free", est: "30-50" },
    { id: "public-proxy-instances", name: "公共免费代理/实例", attempt: "attempt_7e03e5ec8d56", desc: "他人部署的可公开访问的搜索实例或网关，无需自行部署即可使用", kw: "public SearXNG instance list, searx.space", est: "100-300+" },
    { id: "mcp-agent-tools", name: "MCP/Agent 协议搜索工具", attempt: "attempt_b6e916603703", desc: "为 AI Agent 设计的搜索工具封装，通过 MCP 等协议暴露搜索能力", kw: "MCP web search server, Function Calling search tool", est: "20-35" },
    { id: "federated-distributed-search", name: "联邦/去中心化搜索网络", attempt: "attempt_3035ef4c1752", desc: "不依赖中心化服务器的分布式搜索方案", kw: "YaCy P2P search network, Presearch decentralized search", est: "5-10" },
    { id: "rss-feed-aggregation", name: "RSS/Feed 聚合搜索", attempt: "attempt_06de1ce05ca7", desc: "基于 RSS/Atom Feed 的内容聚合和搜索方案", kw: "RSS search API, feed search API, Huginn search", est: "10-15" },
    { id: "knowledge-graph-apis", name: "知识图谱/语义搜索 API", attempt: "attempt_d66cc97bdbe4", desc: "基于结构化知识库的搜索 API，返回实体关联和事实数据", kw: "Wikipedia API, Wikidata Query Service, DBpedia API", est: "8-15" },
    { id: "media-search-apis", name: "媒体/图片/视频搜索 API", attempt: "attempt_82ab1d61402f", desc: "专注于图片、视频、音频等媒体内容的搜索 API", kw: "Unsplash API free, Pexels API free, Pixabay API free", est: "10-20" },
    { id: "proxy-vpn-tor-gateways", name: "代理/VPN/Tor 搜索网关", attempt: "attempt_daa4ca1eebca", desc: "通过代理、VPN 或 Tor 网络访问搜索服务的方案", kw: "Tor search engine, proxy search gateway", est: "5-10" },
  ];

  const childTasks: TaskDefinition[] = directions.map((d) => ({
    id: `explore_direction__${d.id}`,
    type: "normal" as const,
    title: `探寻方向：${d.name}`,
    input: { text: `探寻方向 ${d.id} 的所有免费方案并生成 HTML 信息块` },
    acceptance: { rules: ["方案已找到并评估", "HTML 信息块已保存"] },
    parentTaskId: "explore_direction",
    sourceItemId: d.id,
    generated: true,
    generatedSource: "for_each" as const,
    sourceItem: {
      id: d.id,
      data: { id: d.id, name: d.name, description: d.desc, searchKeywords: d.kw, estimatedCount: d.est },
    },
  }));

  const childStates: Record<string, TeamTaskState> = {};
  for (const d of directions) {
    childStates[`explore_direction__${d.id}`] = taskState("succeeded", {
      attemptCount: d.attemptCount ?? 1,
      activeAttemptId: d.attempt,
      resultRef: `tasks/explore_direction__${d.id}/attempts/${d.attempt}/accepted-result.md`,
    });
  }

  return {
    runId: "run_real_success_foreach_001",
    planId: "plan_real_success_foreach_001",
    teamUnitId: "team_real_sfe",
    status: "completed",
    createdAt: "2026-05-20T03:33:53.852Z",
    startedAt: "2026-05-20T03:33:53.996Z",
    finishedAt: "2026-05-20T05:47:12.166Z",
    currentTaskId: null,
    taskStates: {
      discover_directions: taskState("succeeded", {
        activeAttemptId: "attempt_c5dc0861fc00",
        resultRef: "tasks/discover_directions/attempts/attempt_c5dc0861fc00/accepted-result.md",
      }),
      explore_direction: taskState("succeeded", {
        attemptCount: 0,
        activeAttemptId: null,
        resultRef: null,
      }),
      assemble_report: taskState("succeeded", {
        attemptCount: 3,
        activeAttemptId: "attempt_fb7a225ccd0d",
        resultRef: "tasks/assemble_report/attempts/attempt_fb7a225ccd0d/accepted-result.md",
      }),
      ...childStates,
    },
    summary: {
      totalTasks: 16,
      succeededTasks: 16,
      failedTasks: 0,
      cancelledTasks: 0,
      skippedTasks: 0,
    },
    taskDefinitions: childTasks,
  };
}

const realSuccessOfficialTaskId = "explore_direction__official-search-apis";
const realSuccessOfficialAttemptId = "attempt_68ce15110a99";
const realSuccessDiscoverTaskId = "discover_directions";
const realSuccessDiscoverAttemptId = "attempt_c5dc0861fc00";
const realSuccessAssembleTaskId = "assemble_report";
const realSuccessAssembleAttemptId = "attempt_fb7a225ccd0d";

function ref(taskId: string, attemptId: string, fileName: string): string {
  return `tasks/${taskId}/attempts/${attemptId}/${fileName}`;
}

const realSuccessOfficialAttempt: TeamAttemptMetadata = {
  attemptId: realSuccessOfficialAttemptId,
  taskId: realSuccessOfficialTaskId,
  status: "succeeded",
  phase: "succeeded",
  createdAt: "2026-05-20T03:46:16.000Z",
  updatedAt: "2026-05-20T03:54:29.000Z",
  finishedAt: "2026-05-20T03:54:29.000Z",
  worker: [
    {
      outputIndex: 1,
      outputRef: ref(realSuccessOfficialTaskId, realSuccessOfficialAttemptId, "worker-output-001.md"),
    },
    {
      outputIndex: 2,
      outputRef: ref(realSuccessOfficialTaskId, realSuccessOfficialAttemptId, "worker-output-002.md"),
    },
  ],
  checker: [
    {
      verdict: "revise",
      reason: "需要补充官方免费层限制和可用性说明。",
      feedback: "请补充 Google Programmable Search、Bing Web Search 和 Brave Search 的免费层差异。",
      resultContentRef: ref(realSuccessOfficialTaskId, realSuccessOfficialAttemptId, "checker-output-001.md"),
      revisionIndex: 1,
      recordRef: ref(realSuccessOfficialTaskId, realSuccessOfficialAttemptId, "checker-verdict-001.json"),
      feedbackRef: ref(realSuccessOfficialTaskId, realSuccessOfficialAttemptId, "checker-output-001.md"),
    },
    {
      verdict: "pass",
      reason: "官方搜索 API 方向已覆盖主要候选，并标注免费额度限制。",
      resultContentRef: ref(realSuccessOfficialTaskId, realSuccessOfficialAttemptId, "checker-output-002.md"),
      revisionIndex: 2,
      recordRef: ref(realSuccessOfficialTaskId, realSuccessOfficialAttemptId, "checker-verdict-002.json"),
      feedbackRef: null,
    },
  ],
  watcher: {
    decision: "accept_task",
    reason: "验收链路完整，worker 修订后覆盖官方 API 免费层与限制。",
    recordRef: ref(realSuccessOfficialTaskId, realSuccessOfficialAttemptId, "watcher-review.json"),
  },
  resultRef: ref(realSuccessOfficialTaskId, realSuccessOfficialAttemptId, "accepted-result.md"),
  errorSummary: null,
  files: [
    "worker-output-001.md",
    "worker-output-002.md",
    "checker-verdict-001.json",
    "checker-output-001.md",
    "checker-verdict-002.json",
    "checker-output-002.md",
    "watcher-review.json",
    "accepted-result.md",
  ],
};

const realSuccessDiscoverAttempt: TeamAttemptMetadata = {
  attemptId: realSuccessDiscoverAttemptId,
  taskId: realSuccessDiscoverTaskId,
  status: "succeeded",
  phase: "succeeded",
  createdAt: "2026-05-20T03:33:54.000Z",
  updatedAt: "2026-05-20T03:43:21.000Z",
  finishedAt: "2026-05-20T03:43:21.000Z",
  worker: [],
  checker: [],
  watcher: null,
  resultRef: ref(realSuccessDiscoverTaskId, realSuccessDiscoverAttemptId, "accepted-result.md"),
  errorSummary: null,
  files: ["accepted-result.md"],
};

const realSuccessAssembleAttempt: TeamAttemptMetadata = {
  attemptId: realSuccessAssembleAttemptId,
  taskId: realSuccessAssembleTaskId,
  status: "succeeded",
  phase: "succeeded",
  createdAt: "2026-05-20T05:35:02.000Z",
  updatedAt: "2026-05-20T05:47:12.000Z",
  finishedAt: "2026-05-20T05:47:12.000Z",
  worker: [],
  checker: [],
  watcher: null,
  resultRef: ref(realSuccessAssembleTaskId, realSuccessAssembleAttemptId, "accepted-result.md"),
  errorSummary: null,
  files: ["accepted-result.md"],
};

const attemptFixtures = new Map<string, TeamAttemptMetadata[]>([
  [`run_real_success_foreach_001/${realSuccessDiscoverTaskId}`, [realSuccessDiscoverAttempt]],
  [`run_real_success_foreach_001/${realSuccessOfficialTaskId}`, [realSuccessOfficialAttempt]],
  [`run_real_success_foreach_001/${realSuccessAssembleTaskId}`, [realSuccessAssembleAttempt]],
]);

const attemptFileFixtures = new Map<string, string>([
  [
    `run_real_success_foreach_001/${realSuccessDiscoverTaskId}/${realSuccessDiscoverAttemptId}/accepted-result.md`,
    [
      "# 发现所有搜索方案方向",
      "",
      "本轮发现 13 个可拆分探索方向，覆盖官方 API、聚合服务、自部署、Agent 工具和垂直搜索等类别。",
    ].join("\n"),
  ],
  [
    `run_real_success_foreach_001/${realSuccessOfficialTaskId}/${realSuccessOfficialAttemptId}/worker-output-001.md`,
    [
      "# 搜索引擎官方免费 API",
      "",
      "- Google Programmable Search Engine 提供有限免费查询额度。",
      "- Bing Web Search API 曾提供 Azure 免费层，但可用性需按当前区域核验。",
    ].join("\n"),
  ],
  [
    `run_real_success_foreach_001/${realSuccessOfficialTaskId}/${realSuccessOfficialAttemptId}/worker-output-002.md`,
    [
      "# 官方免费层补充",
      "",
      "- Brave Search API 有免费试用额度，生产使用需要关注速率限制。",
      "- Wikipedia / Wikidata API 免费开放，但属于知识库检索，不等价于通用网页搜索。",
    ].join("\n"),
  ],
  [
    `run_real_success_foreach_001/${realSuccessOfficialTaskId}/${realSuccessOfficialAttemptId}/checker-verdict-001.json`,
    JSON.stringify({
      verdict: "revise",
      reason: "需要补充官方免费层限制和可用性说明。",
      feedback: "请补充 Google Programmable Search、Bing Web Search 和 Brave Search 的免费层差异。",
    }, null, 2),
  ],
  [
    `run_real_success_foreach_001/${realSuccessOfficialTaskId}/${realSuccessOfficialAttemptId}/checker-output-001.md`,
    "请补充免费额度、区域限制、速率限制和是否适合 Agent 长期调用。",
  ],
  [
    `run_real_success_foreach_001/${realSuccessOfficialTaskId}/${realSuccessOfficialAttemptId}/checker-verdict-002.json`,
    JSON.stringify({
      verdict: "pass",
      reason: "官方搜索 API 方向已覆盖主要候选，并标注免费额度限制。",
    }, null, 2),
  ],
  [
    `run_real_success_foreach_001/${realSuccessOfficialTaskId}/${realSuccessOfficialAttemptId}/checker-output-002.md`,
    "验收通过：候选 API、免费层、限制和适用性都已列明。",
  ],
  [
    `run_real_success_foreach_001/${realSuccessOfficialTaskId}/${realSuccessOfficialAttemptId}/watcher-review.json`,
    JSON.stringify({
      decision: "accept_task",
      reason: "验收链路完整，worker 修订后覆盖官方 API 免费层与限制。",
    }, null, 2),
  ],
  [
    `run_real_success_foreach_001/${realSuccessOfficialTaskId}/${realSuccessOfficialAttemptId}/accepted-result.md`,
    [
      "# 官方搜索 API 方向结论",
      "",
      "官方 API 可以作为稳定搜索入口，但不存在真正无限量免费方案。",
      "适合 Agent 的策略是组合低额度免费层、缓存和按需降级。",
    ].join("\n"),
  ],
  [
    `run_real_success_foreach_001/${realSuccessAssembleTaskId}/${realSuccessAssembleAttemptId}/accepted-result.md`,
    [
      "# 最终对比报告",
      "",
      "最终报告汇总 13 个搜索方案方向，按可用性、免费额度、稳定性和 Agent 集成成本排序。",
    ].join("\n"),
  ],
]);

export const MOCK_AGENTS: AgentSummary[] = [
  {
    agentId: "main",
    name: "主 Agent",
    description: "默认综合 agent，保持现有会话、技能和运行方式。",
    defaultModelProvider: "glm",
    defaultModelId: "glm-4.5",
  },
  {
    agentId: "search",
    name: "搜索 Agent",
    description: "用于搜索、查证和资料整理的独立 agent。",
    defaultBrowserId: "default",
    defaultModelProvider: "deepseek",
    defaultModelId: "deepseek-chat",
  },
  {
    agentId: "reviewer",
    name: "Review Agent",
    description: "用于验收输出、指出风险并给出修订建议的 agent。",
    defaultModelProvider: "glm",
    defaultModelId: "glm-4.5",
  },
];

export const MOCK_AGENT_RUN_STATUSES: AgentRunStatus[] = [
  {
    agentId: "main",
    name: "主 Agent",
    status: "idle",
  },
  {
    agentId: "search",
    name: "搜索 Agent",
    status: "busy",
    activeConversationId: "mock-search-active",
    activeSince: "2026-05-24T00:00:00.000Z",
  },
  {
    agentId: "reviewer",
    name: "Review Agent",
    status: "idle",
  },
];

export const ALL_FIXTURES: FixtureEntry[] = [
  { id: "sequential", label: "顺序 run", plan: makeSequentialPlan(), run: makeSequentialRun() },
  { id: "discovery", label: "发现 + 逐项处理", plan: makeDiscoveryForEachPlan(), run: makeDiscoveryForEachRun() },
  { id: "decomposition", label: "任务拆分", plan: makeDecompositionPlan(), run: makeDecompositionRun() },
  { id: "failed", label: "失败 run", plan: makeSequentialPlan(), run: makeFailedRun() },
  { id: "orphan", label: "含未归属子任务", plan: makeSequentialPlan(), run: makeOrphanRun() },
  { id: "large", label: "大量子任务 (10)", plan: makeDiscoveryForEachPlan(), run: makeLargeChildRun() },
  { id: "skipped", label: "含跳过任务", plan: makeSequentialPlan(), run: makeSkippedRun() },
  { id: "real-snapshot", label: "真实 run snapshot", plan: makeRealSnapshotPlan(), run: makeRealSnapshotRun() },
  { id: "real-success-foreach", label: "真实 run snapshot 2", plan: makeRealSuccessForEachPlan(), run: makeRealSuccessForEachRun() },
];

const MOCK_CONTEXT_USAGE: AgentChatStatus["contextUsage"] = {
  provider: "zhipu-glm",
  model: "glm-5.1",
  currentTokens: 0,
  contextWindow: 128000,
  reserveTokens: 16384,
  maxResponseTokens: 16384,
  availableTokens: 111616,
  percent: 0,
  status: "safe",
  mode: "estimate",
};

const MOCK_ASSETS: AgentAssetSummary[] = [
  {
    assetId: "mock-reference-asset",
    fileName: "mock-reference.md",
    mimeType: "text/markdown",
    sizeBytes: 1024,
    kind: "text",
    createdAt: "2026-05-24T00:00:00.000Z",
  },
];

type MockConversation = {
  conversationId: string;
  agentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentChatHistoryMessage[];
  activeRun: AgentChatActiveRun | null;
  running: boolean;
};

type MockPendingRun = {
  conversationId: string;
  runId: string;
  listeners: Set<(event: AgentChatStreamEvent) => void>;
  resolve: () => void;
};

const mockConversationsByAgent = new Map<string, Map<string, MockConversation>>();
const mockCurrentConversationIds = new Map<string, string>();
const mockPendingRuns = new Map<string, MockPendingRun>();
let mockConversationCounter = 0;
let mockRunCounter = 0;
let mockMessageCounter = 0;

export function resetMockTeamApiState() {
  mockConversationsByAgent.clear();
  mockCurrentConversationIds.clear();
  mockPendingRuns.clear();
  mockConversationCounter = 0;
  mockRunCounter = 0;
  mockMessageCounter = 0;
}

function getAgentConversations(agentId: string): Map<string, MockConversation> {
  const existing = mockConversationsByAgent.get(agentId);
  if (existing) return existing;
  const next = new Map<string, MockConversation>();
  mockConversationsByAgent.set(agentId, next);
  return next;
}

function resolveMockAssets(assetRefs?: string[]): AgentAssetSummary[] {
  return (assetRefs ?? []).map((assetId) => (
    MOCK_ASSETS.find((asset) => asset.assetId === assetId) ?? {
      assetId,
      fileName: assetId,
      mimeType: "application/octet-stream",
      sizeBytes: 0,
      kind: "metadata",
    }
  ));
}

function createMockConversation(agentId: string): MockConversation {
  mockConversationCounter += 1;
  const createdAt = ts();
  const conversationId = `mock-${agentId}-${mockConversationCounter}`;
  const conversation: MockConversation = {
    conversationId,
    agentId,
    title: "Mock conversation",
    createdAt,
    updatedAt: createdAt,
    messages: [],
    activeRun: null,
    running: false,
  };
  getAgentConversations(agentId).set(conversationId, conversation);
  mockCurrentConversationIds.set(agentId, conversationId);
  return conversation;
}

function getMockConversation(agentId: string, conversationId?: string): MockConversation {
  const conversations = getAgentConversations(agentId);
  const currentConversationId = conversationId || mockCurrentConversationIds.get(agentId);
  if (currentConversationId && conversations.has(currentConversationId)) {
    const conversation = conversations.get(currentConversationId)!;
    mockCurrentConversationIds.set(agentId, conversation.conversationId);
    return conversation;
  }
  return createMockConversation(agentId);
}

function mockHistoryMessage(
  kind: AgentChatHistoryMessage["kind"],
  text: string,
  extra?: Partial<AgentChatHistoryMessage>,
): AgentChatHistoryMessage {
  return {
    id: `mock-message-${++mockMessageCounter}`,
    kind,
    title: kind === "user" ? "User" : "Agent",
    text,
    createdAt: ts(),
    ...extra,
  };
}

function updateMockConversation(conversation: MockConversation) {
  conversation.updatedAt = ts();
  if (conversation.messages.length > 0) {
    conversation.title = conversation.messages[0].text.slice(0, 32) || conversation.title;
  }
}

function emitMockPendingRunEvent(conversationId: string, event: AgentChatStreamEvent) {
  const pending = mockPendingRuns.get(conversationId);
  if (!pending) return;
  for (const listener of pending.listeners) {
    listener(event);
  }
}

function isTerminalMockEvent(event: AgentChatStreamEvent): boolean {
  return event.type === "done" || event.type === "error" || event.type === "interrupted";
}

export class MockTeamApi {
  async listPlans(): Promise<TeamPlan[]> {
    return ALL_FIXTURES.map((f) => f.plan);
  }

  async listRuns(): Promise<TeamRunState[]> {
    return ALL_FIXTURES.map((f) => f.run);
  }

  async getRunDetail(runId: string): Promise<RunDetail> {
    const entry = ALL_FIXTURES.find((f) => f.run.runId === runId);
    if (!entry) throw { message: `Run not found: ${runId}` };
    return entry.run;
  }

  async listAttempts(runId: string, taskId: string): Promise<TeamAttemptMetadata[]> {
    return attemptFixtures.get(`${runId}/${taskId}`) ?? [];
  }

  async readAttemptFile(runId: string, taskId: string, attemptId: string, fileName: string): Promise<string> {
    const content = attemptFileFixtures.get(`${runId}/${taskId}/${attemptId}/${fileName}`);
    if (content == null) throw { message: `Attempt file not found: ${fileName}` };
    return content;
  }

  async listAgents(): Promise<AgentSummary[]> {
    return MOCK_AGENTS;
  }

  async listAgentRunStatuses(): Promise<AgentRunStatus[]> {
    return MOCK_AGENT_RUN_STATUSES;
  }

  async createAgentConversation(agentId: string): Promise<AgentConversationResponse> {
    const conversation = createMockConversation(agentId);
    return {
      conversationId: conversation.conversationId,
      currentConversationId: conversation.conversationId,
      created: true,
    };
  }

  async listAgentConversations(agentId: string): Promise<AgentConversationCatalogResponse> {
    const conversations = [...getAgentConversations(agentId).values()];
    return {
      currentConversationId: mockCurrentConversationIds.get(agentId) ?? "",
      conversations: conversations
        .slice()
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .map((conversation) => ({
          conversationId: conversation.conversationId,
          title: conversation.title,
          preview: conversation.messages.at(-1)?.text ?? "",
          messageCount: conversation.messages.length,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          running: conversation.running,
        })),
    };
  }

  async switchAgentConversation(agentId: string, conversationId: string): Promise<AgentSwitchConversationResponse> {
    const conversation = getAgentConversations(agentId).get(conversationId);
    if (!conversation) {
      return {
        conversationId,
        currentConversationId: mockCurrentConversationIds.get(agentId) ?? "",
        switched: false,
        reason: "not_found",
      };
    }
    mockCurrentConversationIds.set(agentId, conversationId);
    return {
      conversationId,
      currentConversationId: conversationId,
      switched: true,
    };
  }

  async getAgentConversationState(agentId: string, conversationId: string, viewLimit = 80): Promise<AgentConversationState> {
    const conversation = getMockConversation(agentId, conversationId);
    const safeLimit = Number.isFinite(viewLimit) && viewLimit > 0 ? Math.trunc(viewLimit) : 80;
    const viewMessages = conversation.messages.slice(-safeLimit);
    return {
      conversationId: conversation.conversationId,
      running: conversation.running,
      contextUsage: MOCK_CONTEXT_USAGE,
      messages: conversation.messages,
      viewMessages,
      activeRun: conversation.activeRun,
      historyPage: {
        hasMore: conversation.messages.length > viewMessages.length,
        limit: safeLimit,
      },
      updatedAt: conversation.updatedAt,
    };
  }

  async getAgentChatStatus(agentId: string, conversationId: string): Promise<AgentChatStatus> {
    const conversation = getMockConversation(agentId, conversationId);
    return {
      conversationId: conversation.conversationId,
      running: conversation.running,
      contextUsage: MOCK_CONTEXT_USAGE,
    };
  }

  async interruptAgentChat(agentId: string, conversationId: string): Promise<AgentInterruptResponse> {
    const conversation = getMockConversation(agentId, conversationId);
    const pending = mockPendingRuns.get(conversation.conversationId);
    if (pending) {
      conversation.running = false;
      conversation.activeRun = {
        ...conversation.activeRun!,
        status: "interrupted",
        loading: false,
        updatedAt: ts(),
      };
      updateMockConversation(conversation);
      emitMockPendingRunEvent(conversation.conversationId, {
        type: "interrupted",
        conversationId: conversation.conversationId,
        runId: pending.runId,
      });
      mockPendingRuns.delete(conversation.conversationId);
      pending.resolve();
    }
    return {
      conversationId: conversation.conversationId,
      interrupted: true,
    };
  }

  async sendAgentMessage(agentId: string, message: string, conversationId?: string, assetRefs?: string[]): Promise<AgentChatResponse> {
    if (!message.trim()) {
      throw { message: 'Field "message" must be a non-empty string' };
    }
    const conversation = getMockConversation(agentId, conversationId);
    conversation.messages.push(mockHistoryMessage("user", message, { assetRefs: resolveMockAssets(assetRefs) }));
    const text = `[${agentId}] mock reply: ${message}`;
    conversation.messages.push(mockHistoryMessage("assistant", text));
    updateMockConversation(conversation);
    return {
      conversationId: conversation.conversationId,
      text,
    };
  }

  async queueAgentMessage(agentId: string, request: AgentQueueMessageRequest): Promise<AgentQueueMessageResponse> {
    if (!request.message.trim()) {
      throw { message: 'Field "message" must be a non-empty string' };
    }
    const conversation = getMockConversation(agentId, request.conversationId);
    if (!conversation.running || !conversation.activeRun) {
      return {
        conversationId: conversation.conversationId,
        mode: request.mode,
        queued: false,
        reason: "not_running",
      };
    }

    const queue = conversation.activeRun.queue ?? { steering: [], followUp: [] };
    const nextQueue = {
      steering: request.mode === "steer" ? [...queue.steering, request.message] : queue.steering,
      followUp: request.mode === "followUp" ? [...queue.followUp, request.message] : queue.followUp,
    };
    conversation.activeRun = {
      ...conversation.activeRun,
      queue: nextQueue,
      updatedAt: ts(),
    };
    updateMockConversation(conversation);
    emitMockPendingRunEvent(conversation.conversationId, {
      type: "queue_updated",
      steering: nextQueue.steering,
      followUp: nextQueue.followUp,
    });
    return {
      conversationId: conversation.conversationId,
      mode: request.mode,
      queued: true,
    };
  }

  async streamAgentMessage(
    agentId: string,
    request: AgentChatStreamRequest,
    onEvent: (event: AgentChatStreamEvent) => void,
  ): Promise<void> {
    if (!request.message.trim()) {
      throw { message: 'Field "message" must be a non-empty string' };
    }
    const conversation = getMockConversation(agentId, request.conversationId);
    const runId = `mock-run-${++mockRunCounter}`;
    const assistantMessageId = `mock-assistant-${runId}`;
    const inputAssets = resolveMockAssets(request.assetRefs);
    conversation.running = true;
    conversation.messages.push(mockHistoryMessage("user", request.message, { assetRefs: inputAssets }));
    conversation.activeRun = {
      runId,
      status: "running",
      assistantMessageId,
      input: {
        message: request.message,
        inputAssets,
      },
      text: "",
      process: null,
      queue: null,
      loading: true,
      startedAt: ts(),
      updatedAt: ts(),
    };
    updateMockConversation(conversation);
    onEvent({ type: "run_started", conversationId: conversation.conversationId, runId });

    if (request.message === "mock-hold") {
      await new Promise<void>((resolve) => {
        mockPendingRuns.set(conversation.conversationId, {
          conversationId: conversation.conversationId,
          runId,
          listeners: new Set([onEvent]),
          resolve,
        });
      });
      return;
    }

    if (request.message === "mock-error") {
      conversation.running = false;
      conversation.activeRun = {
        ...conversation.activeRun,
        status: "error",
        loading: false,
        updatedAt: ts(),
      };
      updateMockConversation(conversation);
      onEvent({
        type: "error",
        conversationId: conversation.conversationId,
        runId,
        message: "mock stream error",
      });
      throw { message: "mock stream error" };
    }

    const text = `[${agentId}] mock reply: ${request.message}`;
    conversation.activeRun = {
      ...conversation.activeRun,
      text,
      updatedAt: ts(),
    };
    onEvent({ type: "text_delta", textDelta: text });
    conversation.running = false;
    conversation.activeRun = null;
    conversation.messages.push(mockHistoryMessage("assistant", text, { id: assistantMessageId, runId }));
    updateMockConversation(conversation);
    onEvent({
      type: "done",
      conversationId: conversation.conversationId,
      runId,
      text,
      inputAssets,
    });
  }

  async streamAgentConversationEvents(
    agentId: string,
    request: AgentConversationEventsRequest,
    onEvent: (event: AgentChatStreamEvent) => void,
  ): Promise<void> {
    void agentId;
    void request.afterEventCursor;
    const pending = mockPendingRuns.get(request.conversationId);
    if (!pending) return;
    await new Promise<void>((resolve) => {
      const listener = (event: AgentChatStreamEvent) => {
        onEvent(event);
        if (isTerminalMockEvent(event)) {
          pending.listeners.delete(listener);
          resolve();
        }
      };
      const onAbort = () => {
        pending.listeners.delete(listener);
        resolve();
      };
      pending.listeners.add(listener);
      if (request.signal?.aborted) {
        onAbort();
        return;
      }
      request.signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  async listAssets(): Promise<AgentAssetSummary[]> {
    return MOCK_ASSETS;
  }

  async uploadFilesAsAssets(files: File[]): Promise<AgentAssetSummary[]> {
    return files.map((file, index) => ({
      assetId: `mock-upload-${index}-${file.name}`,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      kind: file.type.startsWith("text/") ? "text" : "binary",
      createdAt: "2026-05-24T00:00:00.000Z",
    }));
  }

}
