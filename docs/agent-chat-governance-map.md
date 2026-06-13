# Agent / Chat 治理地图

日期：`2026-05-06`

这份文档服务于架构治理批次 E。目标是梳理前台 Chat、scoped Agent profile 路由和 `AgentService` run 生命周期的边界，判断哪些重复可以后续抽薄，哪些看着重复但实际上是兼容成本。当前结论很直接：可以治理 route wrapper，不要强拆 `AgentService.runChat()`。

## 2026-05-06 小步源码治理记录

- `src/routes/chat.ts` 已新增 `resolveScopedAgentServiceOrSend()`，把 scoped agent service 解析和 unknown agent `404 NOT_FOUND` 响应收口到一个 helper。
- scoped debug skills、agent profile 元操作、rules 文件、scoped conversation、state/status/history/events、chat/stream/queue/reset/interrupt 等路由已复用该 helper。
- 外部 URL、响应体、unknown agent 不 fallback main、SSE 格式和 `AgentService` 调用方式均未改变。
- 验证已跑：
  - `npx tsc --noEmit`
  - `node --test --import tsx test/chat-agent-routes.test.ts`
  - `git diff --check`

## 当前结论

- `src/routes/chat.ts` 同时承载 main `/v1/chat/*` 与 scoped `/v1/agents/:agentId/chat/*` 路由，存在明显 wrapper 重复。
- 这些重复主要是 HTTP 壳层重复：解析 query/body、选择 `AgentService`、返回 bad request / unknown agent / SSE。
- 底层关键 helper 已经拆出：`chat-route-parsers.ts` 管输入解析，`chat-sse.ts` 管 SSE，`agent-run-*` 和 `agent-conversation-*` 管运行与会话局部逻辑。
- `AgentService.runChat()` 虽然长，但它串联的是同一轮 run 的创建、active state、session prompt、event adapter、result、terminal snapshot。这里不是优先拆分点。
- scoped agent 的外部语义不能改变：未知 agent 必须 404，不得回退 main；`main` 必须继续兼容旧 `/v1/chat/*`。

## 主链路地图

### 1. HTTP Route 层

入口：

- `src/routes/chat.ts`
- `src/routes/chat-route-parsers.ts`
- `src/routes/chat-sse.ts`
- `src/routes/http-errors.ts`

职责：

- 注册 main 路由：`/v1/chat/*`、`/v1/debug/skills`
- 注册 scoped agent 路由：`/v1/agents/:agentId/chat/*`、`/v1/agents/:agentId/debug/skills`
- 注册 agent profile 元操作：`GET /v1/agents`、创建、更新、归档、规则文件、技能安装与删除
- 将 HTTP body / query 转成 `AgentService` 输入
- 管理 SSE 响应生命周期和网络断连容错

当前重复点：

| 路由语义 | main 路由 | scoped 路由 | 可治理性 |
| --- | --- | --- | --- |
| skills | `/v1/debug/skills` | `/v1/agents/:agentId/debug/skills` | 可抽薄 handler 工厂 |
| conversation catalog | `/v1/chat/conversations` | `/v1/agents/:agentId/chat/conversations` | 可抽薄 handler 工厂 |
| create / update metadata / delete / switch | `/v1/chat/...` | `/v1/agents/:agentId/chat/...` | 可抽薄，但要保留路径语义 |
| state / status / history | `/v1/chat/...` | `/v1/agents/:agentId/chat/...` | 可抽薄 query 解析 |
| events / run logs | `/v1/chat/events`、`/v1/chat/runs/:runId/events` | scoped 对应路径 | 可抽薄 SSE 与 pagination handler |
| chat / stream / queue / reset / interrupt | `/v1/chat...` | scoped 对应路径 | 可抽薄 wrapper，但必须保留 main/scoped 服务选择差异 |

治理建议：后续如果动源码，优先抽一个小型 route handler factory 或 `withChatService()` helper，让 main 与 scoped 路由共享 handler。不要改 URL，不要改响应体，不要把 unknown scoped agent 默默映射到 main。

### 2. AgentService 层

入口：

- `src/agent/agent-service.ts`

核心状态：

- `activeRuns`
- `terminalRuns`
- `ConversationStore` 当前会话指针
- session messages / session file
- run event buffer
- agent run scope

已拆出的 helper：

- 会话目录：`agent-conversation-catalog.ts`
- 会话命令：`agent-conversation-commands.ts`
- 会话上下文：`agent-conversation-context.ts`
- 会话 session：`agent-conversation-session.ts`
- canonical state：`agent-conversation-state.ts`
- 历史分页：`agent-conversation-history.ts`
- active run view：`agent-active-run-view.ts`
- run event 分发：`agent-run-events.ts`
- run result：`agent-run-result.ts`
- run scope：`agent-run-scope.ts`
- terminal run：`agent-terminal-run.ts`
- session event adapter：`agent-session-event-adapter.ts`
- prompt assets：`agent-prompt-assets.ts`
- queue message：`agent-queue-message.ts`

这说明项目已经做过一轮有意义的拆分。继续治理时别装作这里还是一整块原始泥巴。真正要守的是生命周期所有权。

### 3. Run 生命周期

前台 streaming 主链路：

1. `POST /v1/chat/stream` 或 `POST /v1/agents/:agentId/chat/stream`
2. `parseChatMessageBody()`
3. `AgentService.streamChat()`
4. `AgentService.runChat()`
5. `ensureCurrentConversationId()` / `openConversationSession()`
6. `preparePromptAssets()`
7. `createAgentRunScope(conversationId)`
8. 写入 `activeRuns`
9. `createAgentSessionEventAdapter()`
10. 建立 agent run scope
11. `runWithScopedAgentEnvironment()` + `session.prompt()`
12. `buildAgentRunResult()` + `buildDoneChatStreamEvent()`
13. `finally` 中 unsubscribe、保存会话信息、移除 active run、写 terminal run

不能破坏：

- 同一时刻全局只能有一个 active run。
- 同一 conversation 不能重复运行。
- `activeRuns` 与 `terminalRuns` 切换必须在 `finally` 中收口。
- SSE sink、subscriber 和网络断连都不能影响 run 本体。
- `send_file`、`ugk-file`、本地路径改写必须进入 `done` event 和 canonical history。

## Scoped Agent 边界

当前 scoped agent 不是 legacy `.pi/agents` subagent。它是 Playground agent profile。

运行时事实：

- `/v1/agents` 是当前注册列表真源。
- `AgentServiceRegistry` 负责按 agentId 取对应 `AgentService`。
- `.data/agents/profiles.json` 只是用户创建记录，不是完整 registry。
- `main` 继续兼容旧 `/v1/chat/*`。
- 非 main agent 走 `/v1/agents/:agentId/chat/*`。
- unknown scoped agent 必须返回 404，不能 fallback main。
- agent 规则文件读取 `runtimeAgentRulesPath`，不是仓库根 `AGENTS.md`。

后续抽 route helper 时必须保留这些差异。最容易犯的错是为了少写几行代码，把 scoped route 的 service 选择做成“找不到就用 main”。这不是兼容，这是串号。

## 可治理点

### P0：文档与测试锚点

- 保留 `chat-agent-routes.test.ts` 对 scoped agent 的关键保护：debug skills、conversation catalog、unknown agent 404、rules 文件读取、创建 / 归档行为。
- 保留 `agent-service.test.ts` 对 active run、terminal run、queue、interrupt、history/state、agent run scope 的覆盖。
- 涉及 SSE 时保留 `chat-sse.test.ts` 的断连容错、headers 和 terminal event 判断。

### P1：低风险代码整理候选

这些可以后续单独开小批次：

- 继续收窄 main/scoped route wrapper 的重复；scoped service 解析与 unknown agent 404 已由 `resolveScopedAgentServiceOrSend()` 先行收口。
- 抽 main/scoped 共享的 conversation handlers，但仍分别注册现有 URL。
- 抽 state/status/history 的 query parsing helper，避免两套 route 重复解析 `conversationId`、`viewLimit`、`limit`、`before`。
- 抽 stream route handler，复用 `configureSseResponse()`、heartbeat、terminal event 收尾和错误处理。
- 抽 run events pagination 到独立 helper，当前它与 conn run event pagination 语义相似但数据结构不同，不能强行合并。

### P2：谨慎评估

- 把 agent profile 元操作从 `chat.ts` 移到独立 `agent-profile-routes.ts` 是合理方向，但要保持 `registerChatRoutes()` 外部依赖不膨胀。
- 将 main 与 scoped chat route 注册改成同一个 `registerAgentChatRouteGroup(prefix, serviceResolver)` 可行，但需要先补测试锁定所有路径。
- 如果要压缩 `AgentService.runChat()`，只能抽“纯函数或窄 helper”，例如局部构造 run start event；不能把 active run map、terminal run map、session prompt 和 cleanup 分散给多个对象抢所有权。

## 不要做的事

- 不要删除 `/v1/chat/*` main 兼容路由。
- 不要让 scoped agent route 找不到 agent 时 fallback main。
- 不要把 `.data/agents/profiles.json` 当 registry 真源。
- 不要把 session event adapter、run result、terminal snapshot 再塞回 `AgentService`。
- 不要把 `AgentService.runChat()` 拆成多个互相回调的生命周期对象。那叫复杂化，不叫架构升级。
- 不要改 SSE event 格式；前端和 Feishu gateway 都依赖既有语义。
- 不要把 queue / interrupt 错误写进 transcript；它们应继续作为控制响应和顶部提示处理。

## 最小验证矩阵

| 改动范围 | 最小验证 |
| --- | --- |
| 纯文档治理 | `git diff --check` |
| chat parser | `git diff --check` + `node --test --import tsx test/chat-route-parsers.test.ts` |
| SSE | `git diff --check` + `node --test --import tsx test/chat-sse.test.ts` |
| scoped agent route | `git diff --check` + `node --test --import tsx test/chat-agent-routes.test.ts` |
| AgentService run 生命周期 | `git diff --check` + `node --test --import tsx test/agent-service.test.ts test/agent-run-events.test.ts test/agent-run-result.test.ts test/agent-terminal-run.test.ts` |
| conversation state/history | `git diff --check` + `node --test --import tsx test/agent-conversation-state.test.ts test/agent-conversation-history.test.ts test/agent-conversation-commands.test.ts` |
| 发布候选 | `git diff --check` + `npx tsc --noEmit` + `npm test` |

## 推荐下一步

批次 E 只完成治理地图，不做源码抽取。若要进入代码整理，建议先做一个很小的批次：只抽 scoped/main route 的 service resolver 与 unknown agent 404 helper，并跑 `chat-agent-routes.test.ts`。这比直接拆 `AgentService.runChat()`靠谱得多，也不会把已经稳定的 run 生命周期搅浑。
