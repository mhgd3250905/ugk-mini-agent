# Team Runtime v2

更新时间：2026-05-17

本文档是 Team Runtime v2 的唯一权威源。v0.1 域名调查历史见文末归档章节。

## 当前目标

提供 plan-driven sequential multi-role pipeline：给定一个 Plan（有序任务列表 + 验收标准），系统自动按 worker → checker → watcher → finalizer 四角色流水线顺序执行每个 task，产出结构化结果和汇总报告。

## 当前状态

- v2 基础链路已验证通过（mock + 真实 runner）
- AbortSignal 全链路传播：cancel/pause 能中断正在执行的 agent session
- 真实 runner smoke test：`run_1c54aaa7e442`，status: completed，P0_REAL_RUNNER_OK
- 最新验证：`npm run test:team` 272 pass，`npx tsc --noEmit` 通过

## 核心概念

### TeamUnit

可复用的团队预设，绑定 5 个 AgentProfile 到 5 个角色：

- `workerProfileId` — 执行 Agent，负责完成 task
- `checkerProfileId` — 验收 Agent，评审 worker 输出（pass / revise / fail）
- `watcherProfileId` — 复盘 Agent，post-task review（accept_task / confirm_failed / request_revision）
- `finalizerProfileId` — 汇总 Agent，生成最终报告
- `decomposerProfileId` — 任务拆分 Agent，用于 controlled runtime decomposition

同一 AgentProfile 可填充多个角色。归档后的 TeamUnit 不能用于新 run。

旧 TeamUnit JSON 缺失 `decomposerProfileId` 时自动 fallback 到 `workerProfileId`。

### Plan

有序任务列表 + 目标 + 输出契约。关键字段：

- `planId` — 唯一标识
- `defaultTeamUnitId` — 默认绑定 TeamUnit
- `goal` — 计划目标
- `tasks[]` — 有序任务列表，每个 task 有 `id`、`title`、`input.text`、`acceptance.rules`，可选 `decomposer`
- `outputContract` — 最终输出格式
- `runCount` — 已产生的 run 数量；`runCount > 0` 后任务主体不可改

#### task.decomposer（P21-B/P21-C）

Plan task 可声明受控拆分策略：

```json
{
  "decomposer": {
    "mode": "none",
    "maxChildren": 8
  }
}
```

- `mode` 允许值：`none`、`leaf`、`propagate`
- `maxChildren` 可选，必须是 `1..20` 的整数
- 旧 task 缺失 `decomposer` 时按 `none` 理解
- `forEach.taskTemplate.decomposer` 与普通 task 使用同一套校验
- `TeamOrchestrator` 会在 `leaf` / `propagate` task 执行 worker 前先调用 decomposer

语义边界：

- `none` — 当前任务不可拆分
- `leaf` — 可拆成普通 child task；child task 必须是 `decomposer.mode="none"`
- `propagate` — 可拆成普通 child task；child task 只能是 `none | leaf`，不能继续生成 `propagate`

权限矩阵：

| parent mode | child mode | 结果 |
|-------------|------------|------|
| `propagate` | `leaf` | 允许 |
| `propagate` | `none` | 允许 |
| `propagate` | `propagate` | 拒绝 |
| `leaf` | `none` | 允许 |
| `leaf` | `leaf` / `propagate` | 拒绝 |
| `none` | 任意 child | 不调用 decomposer |

`decomposer` 和 `for_each` 是两件事，别混着用，混了就是给未来的自己挖坑：

- `for_each` 适合未知数量 item：先用 `discovery` 找到数组，再按模板生成同构任务。
- `decomposer.leaf` 适合某个已知大任务太粗：例如某个方法内还要拆 `collect-known-ips`、`ptr-lookup`、`passive-dns-otx`。
- `decomposer.propagate` 只给少数顶层任务使用：它最多生成一层 `leaf` child，不能无限传播。
- Medtrum 风格推荐：`discover_methods -> for_each(methods)`，每个 method task 如 reverse DNS / passive DNS 可设 `decomposer.leaf`，leaf children 正常顺序执行并进入 finalizer 汇总。

### Controlled Runtime Decomposition (P21-C)

`TeamOrchestrator` 对 `normal`、`discovery` 和动态生成的 normal child task 使用同一条受控拆分入口：

- `decomposer.mode="none"`：不调用 decomposer，直接执行原 task 的 worker→checker→watcher。
- `decision="no_split"`：写入 decomposition record 后，原 task 按普通 task 执行。
- `decision="split"`：parent task 变成 container，不执行 parent worker/checker/watcher；系统写入 decomposition record，append child task states，然后按记录顺序执行 child tasks。
- child task 必须是 `normal`，runtime 不接受 decomposer 生成的 `discovery` / `for_each` child task。
- runtime 强制模式矩阵：`propagate -> leaf | none`，`leaf -> none`，`none` 不拆。
- `maxChildren` 默认 8，单 task policy 可设 `1..20`；单 run 当前最多 50 个 task state，避免无限扩张。
- 既有 decomposition record 会优先于再次调用 decomposer；resume/reclaim 时会复用 record 中的完整 child `TeamTask` 定义。
- pause/cancel/timeout 使用现有 run control 机制；split parent 没有 active attempt，未完成 parent/children 会按 run 状态统一标记。
- parent 状态由 child 汇总：全部 child 成功则 parent `succeeded`，任一 child 失败则 parent `failed`，错误摘要指向失败 child。
- 当 `discovery` parent 被 `split` 时，parent 仍不执行 worker/checker/watcher；runtime 会按 decomposition record 中的 child 顺序读取每个 normal child 的 `accepted-result.md`，缺失时 fallback 到 `worker-output-001.md`，并聚合为 parent 的 `discovery.outputKey` 结果供下游 `for_each.itemsFrom` 使用。
- decomposed discovery child 输出支持两种形状：包含 parent `discovery.outputKey` 数组的 JSON object，例如 `{ "items": [...] }`；或直接输出 item object 数组，例如 `[{"id":"a"}]`。
- decomposed discovery child 输出必须提供 item object 数组；任一 child 输出 malformed、缺少目标数组、或数组元素不是 object 时，discovery parent 会失败，downstream `for_each` 不会从 partial data 扩展。
- finalizer 输入来自完整 `state.taskStates`，因此能看到 decomposed child 的 result/error 信息。

### Dynamic Task Expansion (P15)

Plan 支持三种任务类型：

- `normal`（默认）— 标准 worker→checker→watcher 顺序执行
- `discovery` — 执行标准 worker→checker→watcher 循环，但输出被期望为包含可提取 JSON 的内容。JSON 中由 `discovery.outputKey` 指定的键值是一个数组，提供给下游 `for_each` 任务。
- `for_each` — 运行时动态扩展：根据上游 `discovery` 任务发现的 item 数组，从模板生成子任务。所有子任务顺序执行，每个子任务经历完整的 worker→checker→watcher 生命周期。

#### discovery 任务

```json
{
  "id": "discover",
  "type": "discovery",
  "title": "Discover items",
  "input": { "text": "Find all items related to X" },
  "acceptance": { "rules": ["output is valid JSON with 'items' array"] },
  "discovery": { "outputKey": "items" }
}
```

- `discovery.outputKey`（必填）— worker 输出 JSON 中包含 item 数组的键名
- worker 输出必须包含可提取的 JSON（raw JSON、fenced code block、或 brace-matched）
- 系统按 `outputKey` 提取数组后，供 `for_each` 任务引用

#### for_each 任务

```json
{
  "id": "process_each",
  "type": "for_each",
  "title": "Process each item",
  "input": { "text": "Placeholder" },
  "acceptance": { "rules": ["ok"] },
  "forEach": {
    "itemsFrom": "discover.items",
    "mode": "sequential",
    "taskTemplate": {
      "title": "Process {{item.title}}",
      "input": { "text": "Process item {{item.id}}" },
      "acceptance": { "rules": ["output valid for {{item.id}}"] }
    }
  }
}
```

- `forEach.itemsFrom`（必填）— dot-path 格式 `{upstreamTaskId}.{outputKey}`
- `forEach.mode`（必填）— 当前仅支持 `"sequential"`
- `forEach.taskTemplate`（必填）— 子任务模板，支持以下占位符：
  - `{{item.<field>}}` — 任意 top-level item 字段；对象/数组 JSON-stringified；null/缺失为空字符串
  - `{{item}}` — 完整 item JSON
  - `{{run.id}}`、`{{plan.id}}`、`{{parentTask.id}}` — run-scoped 变量
  - `{{task.outputDir}}` — run-scoped 输出目录（`.data/team/runs/<runId>/generated/<parentTaskId>`）
- 每个 item 必须有稳定的非空字符串 `id` 字段
- 子任务 ID 格式：`{parentTaskId}__{sanitizedItemId}`
- 扩展记录持久化在 `runs/<runId>/expansions/<parentTaskId>.json`
- 扩展记录包含完整子任务定义（`task` 字段），确保 resume/reclaim 后子任务 input/acceptance 不漂移
- 旧格式记录（无 `task` 字段）仍可读取，fallback 为 title-based input
- 幂等扩展：pause/resume 不会重复生成子任务
- `for_each` 父任务状态由子任务结果推导：全部成功→succeeded，有失败→failed
- 0 个 item 时，`for_each` 直接标记为 succeeded

#### 实现组件

| 文件 | 职责 |
|------|------|
| `src/team/task-expansion-planner.ts` | `TaskExpansionPlanner` 接口和 `TemplateTaskExpansionPlanner` 模板实现 |
| `src/team/run-workspace.ts` | `writeExpansion` / `readExpansion` / `appendChildTaskStates`，以及 `writeDecomposition` / `readDecomposition` 持久化方法 |
| `src/team/orchestrator.ts` | 按 task type 分发执行：normal / discovery / for_each；处理 controlled decomposition；`TaskExpansionPlanner` 通过构造函数注入 |

#### Plan 验证

- `PlanStore.create()` 和 `PlanStore.updateEditablePlan()` 都调用 `validateTasks()` 检查任务列表
- 未知 `task.type` 被拒绝（只允许 `normal`、`discovery`、`for_each`）
- 未知 `task.decomposer.mode` 被拒绝（只允许 `none`、`leaf`、`propagate`）
- `task.decomposer.maxChildren` 和 `forEach.taskTemplate.decomposer.maxChildren` 必须是 `1..20` 的整数
- `PATCH /v1/team/plans/:planId` 在 `runCount=0` 时验证新 tasks
- 旧无 type 计划仍兼容（默认 `normal`）

#### 扩展策略注入

- `TeamOrchestratorOptions.taskExpansionPlanner?: TaskExpansionPlanner`
- 构造函数默认使用 `TemplateTaskExpansionPlanner`
- 自定义实现可通过选项注入

### Run

一次 Plan 的执行实例。生命周期：

```
queued → running → completed / completed_with_failures / failed / cancelled
                     ↑              ↓
                   paused ←─────────┘（可 resume）
```

关键字段：

- `runId` — 唯一标识
- `planId` — 关联 Plan
- `teamUnitId` — 关联 TeamUnit
- `status` — 当前状态
- `currentTaskId` — 当前正在执行的 task
- `taskStates{}` — 每个 task 的执行状态
- `summary` — { totalTasks, succeededTasks, failedTasks, cancelledTasks }
- `activeElapsedMs` — 累计活跃时间（毫秒）
- `lastError` — 最近错误
- `pauseReason` — 暂停原因
- `finalizerRuntimeContext` — finalizer session 的实际 profile/browser 解析结果；旧 state 可能缺失该字段

### Task State

每个 task 在 run 中的执行状态：

- `status` — pending / running / interrupted / succeeded / failed / cancelled
- `attemptCount` — 已尝试次数
- `activeAttemptId` — 当前 attempt
- `resultRef` — 结果文件引用（run 相对路径）
- `errorSummary` — 错误摘要
- `progress` — { phase, message, updatedAt }

### Attempt

一次 worker + checker + watcher 的完整循环。watcher 可请求 revision，触发新 attempt。

#### Attempt Lifecycle Metadata

每个 attempt 维护结构化生命周期元数据（`TeamAttemptMetadata`）：

- `phase` — 当前生命周期阶段：`created → worker_running → worker_completed → checker_reviewing → checker_passed/checker_revising/checker_failed → watcher_reviewing → watcher_accepted/watcher_revision_requested/watcher_confirmed_failed → succeeded/failed/interrupted/cancelled`
- `worker[]` — worker 输出摘要数组，每次 worker 执行追加一条 `{ outputRef, outputIndex, runtimeContext? }`
- `checker[]` — checker 评审摘要数组，每次 checker 评审追加一条 `{ verdict, reason, feedback, revisionIndex, recordRef, feedbackRef, runtimeContext? }`
- `watcher` — watcher 评审摘要（单条，后写覆盖），`{ decision, reason, revisionMode, feedback, recordRef, runtimeContext? }`
- `resultRef` — 最终结果文件引用
- `errorSummary` — 错误摘要
- `finishedAt` — 完成时间

`runtimeContext` 记录角色 session 的实际解析结果：`requestedProfileId`、`resolvedProfileId`、`fallbackUsed`、`fallbackReason`、`browserId`、`browserScope`。旧 attempt 不含该字段时仍可正常读取。

#### checker revise vs watcher request_revision

- **checker revise**：同一个 attempt 内 worker 重新执行。checker 每次评审结果追加到 `checker[]`，worker 输出追加到 `worker[]`。attempt 不变。
- **watcher request_revision**：当前 attempt 结束（status=`interrupted`，phase=`watcher_revision_requested`），创建新 attempt 从头开始。旧 attempt 的 watcher summary 记录在 `watcher` 字段。

#### Attempt 终态

- `succeeded` — checker pass + watcher accept_task
- `failed` — checker fail / checker revision limit / watcher confirm_failed / worker timeout / checker timeout / watcher revision limit
- `interrupted` — watcher request_revision / run paused
- `cancelled` — run cancelled

#### 旧 attempt.json 兼容

缺少 lifecycle 字段的旧 `attempt.json` 通过 `normalizeAttempt()` 补默认值：`phase` 从 `status` 推导，`worker`/`checker` 为空数组，`watcher` 为 null。API 不会 500。

### resultRef

run 内相对路径，指向 accepted 或 failed 结果文件。格式如 `tasks/task_1/attempts/attempt_xxx/accepted-result.md`。finalizer 会读取 resultRef 文件内容来生成报告。

## API

### TeamUnit API

| 方法 | 路径 | 语义 |
|------|------|------|
| GET | `/v1/team/team-units` | 列出所有 TeamUnit |
| POST | `/v1/team/team-units` | 创建 TeamUnit；4 个 AgentProfile 必须存在 |
| GET | `/v1/team/team-units/:teamUnitId` | 查看 TeamUnit |
| PATCH | `/v1/team/team-units/:teamUnitId` | 修改未归档、未被活跃 run 锁住的 TeamUnit |
| POST | `/v1/team/team-units/:teamUnitId/archive` | 归档未被活跃 run 锁住的 TeamUnit |
| DELETE | `/v1/team/team-units/:teamUnitId` | 删除未被活跃 run 锁住的 TeamUnit |

### Plan API

| 方法 | 路径 | 语义 |
|------|------|------|
| GET | `/v1/team/plans` | 列出 Plans |
| POST | `/v1/team/plans` | 创建 Plan；`defaultTeamUnitId` 必须存在且未归档 |
| GET | `/v1/team/plans/:planId` | 查看 Plan |
| PATCH | `/v1/team/plans/:planId` | 修改未归档 Plan；已有 run 后任务主体不可改 |
| PATCH | `/v1/team/plans/:planId/default-team` | 切换默认 TeamUnit |
| POST | `/v1/team/plans/:planId/archive` | 归档未被活跃 run 锁住的 Plan |
| DELETE | `/v1/team/plans/:planId` | 删除未产生 run 的 Plan |

### Run API

| 方法 | 路径 | 语义 |
|------|------|------|
| POST | `/v1/team/plans/:planId/runs` | 创建 queued run；不内联执行 |
| GET | `/v1/team/runs` | 列出所有 run states |
| GET | `/v1/team/runs/:runId` | 查看 run state（含所有 taskStates） |
| POST | `/v1/team/runs/:runId/pause` | 暂停 running run；触发 AbortSignal |
| POST | `/v1/team/runs/:runId/resume` | 恢复 paused run 为 queued |
| POST | `/v1/team/runs/:runId/cancel` | 取消 run；触发 AbortSignal |
| DELETE | `/v1/team/runs/:runId` | 删除 terminal run |

### final-report API

| 方法 | 路径 | 语义 |
|------|------|------|
| GET | `/v1/team/runs/:runId/final-report` | 读取 final-report.md（text/markdown） |

final report 优先由 finalizer agent 生成。若 finalizer 失败，orchestrator 会写入 deterministic fallback report，并把 run 标记为 `completed_with_failures`；只有 run 尚未完成或报告文件不存在时返回 404。

### SSE 事件流

| 方法 | 路径 | 语义 |
|------|------|------|
| GET | `/v1/team/runs/:runId/events` | SSE 端点，推送 run state snapshot |

- Content-Type: `text/event-stream`
- 连接建立后立即发送当前 state snapshot（`{ type: "snapshot", data: <TeamRunState> }`）
- 对于 active run（queued/running/paused），服务端优先通过 `RunStateEvents` 订阅同进程 `saveState()` 通知，状态变更后立即推送 snapshot；同时保留 1 秒 change-detect fallback 读取磁盘 state，覆盖独立 worker 进程写入的状态变更
- run 进入 terminal 状态后发送最终 snapshot 并关闭连接
- 15 秒 SSE heartbeat 保持连接活跃
- 客户端断开自动清理 subscription 和 heartbeat

### Attempt 只读 API

| 方法 | 路径 | 语义 |
|------|------|------|
| GET | `/v1/team/runs/:runId/tasks/:taskId/attempts` | 列出 task 的所有 attempts |
| GET | `/v1/team/runs/:runId/tasks/:taskId/attempts/:attemptId/files/:fileName` | 读取 attempt 文件 |

- `listAttempts` 返回每个 attempt 的完整 `TeamAttemptMetadata`（`attemptId`、`status`、`phase`、`worker[]`、`checker[]`、`watcher`、`resultRef`、`errorSummary`、`finishedAt`、`updatedAt`）以及 `files[]`
- `readAttemptFile` 只允许安全文件名（`[a-zA-Z0-9._-]`），路径不能逃逸 run 目录
- 缺失的 run/task/file 返回 404；非法文件名返回 400

## 执行链路

### HTTP 只入队

`POST /v1/team/plans/:planId/runs` 只创建 `queued` run 并返回 state，不执行任何工作。HTTP 路由不做 inline 执行。

### ugk-pi-team-worker 接管

独立 Node 进程 `src/workers/team-worker.ts`，通过 `npm run worker:team` 启动。每 3 秒轮询 runnable run，通过 run lease 原子 claim 后调用 `TeamOrchestrator.runToCompletion()` 执行。

worker 会为每个 claim 到的 run 写入 `state.lease`：

- `ownerId`：当前 worker 实例 ID，默认由进程号 + 时间戳生成；可用 `TEAM_WORKER_ID` 覆盖。
- `acquiredAt`：lease 获取时间。
- `heartbeatAt`：最近一次 heartbeat。
- `expiresAt`：lease 过期时间。

只有 `queued` run 或 `running` 且 lease 过期的 run 可被 claim。claim 使用 run 目录下的临时 lock 目录做原子互斥，避免多个 worker 同时抢同一个 run。worker 执行期间定期 heartbeat；如果 heartbeat 发现 lease 已被其他 worker 接走，会 abort 当前 run。orchestrator 在 phase 写回前也会校验 lease owner，防止旧 worker 迟到写回。

跨进程取消机制：worker 内部 watcher 每 2 秒检测 run state 变化，发现外部 cancel/pause 后触发 `AbortController.abort()`，信号经 orchestrator 传到 agent session。

P10 已补齐独立 worker 的真实 runner 接线：`src/workers/team-worker.ts` 与 HTTP route 使用同一套 browser binding lifecycle。生产 worker 在 `TEAM_USE_MOCK_RUNNER=false` 时会把 canonical scope 贯穿 `setBrowserScopeRoute()`、session factory、scoped agent env、`closeBrowserTargetsForScope()` 和 route 清理。注意：Team run 的实际执行者是独立 worker，不是 HTTP route；后续改真实 runner 接线必须同时覆盖 worker 入口。

多 worker 运维口径：

- 单个 worker 进程一次只 claim 并执行一个 run。
- 需要并发执行多个 run 时，先把 `TEAM_MAX_CONCURRENT_RUNS` 设为大于 1，再启动多个 `ugk-pi-team-worker` 实例。
- 本地 compose 可用 `docker compose up -d --scale ugk-pi-team-worker=2` 扩容；生产 compose 同理，但必须确认共享的 `TEAM_DATA_DIR` 是同一个持久目录。
- 多 worker 扩容时不要在共享 `.env` 里写死同一个 `TEAM_WORKER_ID`；默认自动生成 ID 更安全。只有单 worker 排障时才建议手动指定 `TEAM_WORKER_ID`。
- worker 崩溃后，其他 worker 会在 `TEAM_WORKER_LEASE_TTL_MS` 到期后 reclaim `running` run；TTL 不要设得比真实 phase timeout 还激进，否则慢任务会被误抢。

### worker → checker → watcher

每个 task 的执行流程：

```
┌─ WorkUnit Loop ──────────────────────────────────┐
│                                                    │
│  worker: 执行 task，产出内容                        │
│     ↓                                              │
│  checker: 评审 worker 输出                          │
│     ├─ pass → accepted，写 accepted-result.md      │
│     ├─ revise → 带 feedback 重新跑 worker（max 3）  │
│     └─ fail → 写 failed-result.md                  │
│                                                    │
└────────────────────────────────────────────────────┘
     ↓
  watcher: post-task review
     ├─ accept_task → task 成功或失败（由 WorkUnit 结果决定）
     ├─ confirm_failed → task 失败
     └─ request_revision → 新 attempt，重新进 WorkUnit Loop（max 1）
```

### finalizer

所有 task 完成后运行。读取每个 task 的 `resultRef` 文件内容，传入 finalizer prompt，生成中文 Markdown 汇总报告写入 `final-report.md`。

### pause / resume / cancel

- **pause**：写入 `paused` 状态 + 触发 `AbortController.abort()`，当前 phase 被中断。task 标记为 `interrupted`。resume 后从下一个未完成的 task 继续。
- **cancel**：写入 `cancelled` 状态 + 触发 abort。所有未完成 task 标记为 `cancelled`。terminal 状态不可逆。
- **resume**：将 `paused` run 恢复为 `queued`，等待 worker 接管。跳过已 succeeded/failed/cancelled 的 task。

关键安全机制：每个 phase（worker/checker/watcher/finalizer）返回后，orchestrator 重新从磁盘读取 state。如果状态已变为 cancelled 或 paused，立即停止写回，不会覆盖 terminal state。

## AgentProfile runner

### TEAM_USE_MOCK_RUNNER=true（默认）

使用 `MockRoleRunner`，不调用真实模型。worker 返回固定文本，checker 默认 pass，watcher 默认 accept，finalizer 返回简单报告。用于开发和测试。

### TEAM_USE_MOCK_RUNNER=false（真实 runner）

使用 `AgentProfileRoleRunner`，通过 `BackgroundAgentSessionFactory` 创建真实 AgentProfile session。每个角色按 TeamUnit 绑定的 AgentProfile 解析模型、skills、规则文件。

`AgentProfileRoleRunner` 通过 `BackgroundAgentProfileResolver` → `AgentTemplateRegistry` → playground profile lookup 解析 profile。profile 不存在时 fallback 到 `main`。

### Profile-aware browser binding

每个角色 session 的 browser ID 优先级：

1. `snapshot.defaultBrowserId`（resolved AgentProfile 携带的浏览器绑定）
2. `options.defaultBrowserId`（构造时传入的 fallback）
3. `undefined`（无浏览器绑定）

Browser scope 先按 `team:<runId>:<role>:<roleKey>:<profileId>` 构建 role/attempt 身份，再与 browser ID 收口为 canonical cleanup scope。该 canonical scope 会贯穿：

- `setBrowserScopeRoute(scope, browserId)`
- `ProjectBackgroundSessionFactory.createSession({ browserScope: scope })`
- `runWithScopedAgentEnvironment(scope, ...)`
- `closeBrowserTargetsForScope(scope, { browserId })`
- `runtimeContext.browserScope`

worker/checker/watcher 的 attempt 元数据会记录 `runtimeContext`，用于排查 profile fallback、实际 browser ID 和 browser scope。finalizer 的 runtime context 写入 run state 的 `finalizerRuntimeContext`。

P9 对齐了 Team 与 chat agent / conn worker 已有的 browser binding 链路。Team 不创建新的浏览器资源系统，不调度 Chrome profile，也不改变 sidecar 拓扑；browser ID 到真实 CDP/Chrome profile 的映射仍由既有 browser registry / env 配置决定。

`orchestrator` 通过 `ProfileAwareTeamRoleRunner` 接口（`src/team/role-runner.ts`）在执行前注入 TeamUnit 的 profile IDs，不再依赖 class cast。`MockRoleRunner` 不实现该接口，保持兼容。

P8-E 已补齐端到端审计覆盖：finalizer 失败、取消、超时路径会保持 `finalizerRuntimeContext: null`；`GET /v1/team/runs/:runId` 会原样返回已持久化的 finalizer runtime context；Team UI 对 worker/checker/watcher/finalizer runtime context 的动态值执行 HTML 转义。

### Decomposer runner（P21-B）

`TeamRoleRunner` 现在包含 `runDecomposer(input)`：

- 输入包含 `runId`、完整 `plan`、当前 `task`、`maxChildren` 和可选 `AbortSignal`
- 输出为 `{ decision: "split" | "no_split", reason, children?, runtimeContext? }`
- `MockRoleRunner` 默认返回 `no_split`
- `AgentProfileRoleRunner` 使用 TeamUnit 的 `decomposerProfileId` 解析 AgentProfile，并用 `decomposer` role scope 建立 session / browser binding / cleanup
- 真实 runner prompt 要求只输出 JSON；解析失败或 schema 不合法时安全返回 `no_split`，并保留 `runtimeContext`
- P21-C 起 orchestrator 会在可拆 task 执行 worker 前调用 `runDecomposer()`

### Decomposition record（P21-B）

`RunWorkspace` 支持把拆分决策持久化到：

```text
runs/<runId>/decompositions/<encodeURIComponent(parentTaskId)>.json
```

记录 schema：

```ts
interface TaskDecompositionRecord {
  schemaVersion: "team/task-decomposition-1";
  parentTaskId: string;
  mode: "leaf" | "propagate";
  decision: "split" | "no_split";
  reason: string;
  decomposedAt: string;
  children: Array<{ taskId: string; title: string; task: TeamTask }>;
  runtimeContext?: TeamRoleRuntimeContext;
}
```

记录必须保留完整 child `TeamTask` 定义，确保 resume/reclaim 不会丢失 child input/acceptance/decomposer 策略。旧 run 没有 `decompositions/` 目录时 `readDecomposition()` 返回 `null`，不影响 state/attempt 读取。

### resultRef 和 finalizer prompt

`runFinalizer()` 调用 `readRefContent()` 读取每个 task 的 `resultRef` 文件内容，传入 `buildFinalizerPrompt()`。文件不存在时 fallback 为 ref 字符串。

### JSON 解析

checker、watcher 和 decomposer 输出 JSON。`parseJsonResponse` 使用三层提取：

1. 快速路径：strip fence markers + `JSON.parse`
2. fenced block regex：` ```json ... ``` `
3. balanced braces：从第一个 `{` 到匹配的 `}`

解析失败时 checker 默认 `fail`，watcher 默认 `confirm_failed`，decomposer 默认 `no_split`。

## 锁机制

活跃 run（状态为 `queued`、`running`、`paused`）会锁住关联资源：

- **Plan**：锁住期间不允许归档或删除
- **TeamUnit**：锁住期间不允许修改、归档或删除
- **AgentProfile**：锁住 TeamUnit 中五个 AgentProfile（含 decomposer），不允许编辑、归档、安装/删除/启停技能或修改规则文件

锁计算由 `computeTeamConfigLocks()` 在路由层执行。违反锁的写操作返回 409 Conflict。

## Docker / 环境变量

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `TEAM_RUNTIME_ENABLED` | 无（false） | 必须设为 `"true"` 才注册路由和启动 worker |
| `TEAM_USE_MOCK_RUNNER` | `true` | mock runner；真实 runner 需显式设 `"false"` |
| `TEAM_DATA_DIR` | `.data/team` | Team 数据目录 |
| `TEAM_WORKER_POLL_INTERVAL_MS` | 3000 | worker 轮询间隔 |
| `TEAM_WORKER_LEASE_TTL_MS` | 60000 | run lease 过期时间；worker 崩溃超过该时间后可被其他 worker 接走 |
| `TEAM_WORKER_HEARTBEAT_INTERVAL_MS` | 10000 | worker heartbeat 间隔；实际值会被限制在 lease TTL 的一半以内 |
| `TEAM_MAX_CONCURRENT_RUNS` | 1 | 最大并发 active run 数（queued/running/paused）；通过原子 admission lock 执行；多个 worker 进程可通过 lease 机制 claim 不同的 queued run |
| `TEAM_WORKER_ID` | 自动生成 | 单 worker 排障时可覆盖；多 worker 扩容时不要在共享 `.env` 中写死同一个值 |
| `TEAM_WORKER_PHASE_TIMEOUT_MS` | 900000 | Worker phase 超时（默认 15 分钟） |
| `TEAM_CHECKER_PHASE_TIMEOUT_MS` | 300000 | Checker phase 超时（默认 5 分钟） |
| `TEAM_WATCHER_PHASE_TIMEOUT_MS` | 300000 | Watcher phase 超时（默认 5 分钟） |
| `TEAM_FINALIZER_PHASE_TIMEOUT_MS` | 300000 | Finalizer phase 超时（默认 5 分钟） |
| `TEAM_MAX_RUN_DURATION_MINUTES` | 100 | Run 最大持续时间（分钟）；可 per-run override |

Docker Compose 默认设置：

- `docker-compose.yml`：`TEAM_USE_MOCK_RUNNER=true`，`TEAM_RUNTIME_ENABLED=true`
- `docker-compose.prod.yml`：同上 + `ugk-pi-team-worker` 独立容器 + Team 数据挂载

## 本地验证命令

```bash
# 跑 Team 模块测试（串行，避免 SQLite 锁）
npm run test:team

# 跑单个测试文件
node --test --import tsx test/team-orchestrator-controls.test.ts
node --test --test-concurrency=1 --import tsx test/team-worker.test.ts

# 类型检查
npx tsc --noEmit

# 全量测试
npm test

# Docker 启动
docker compose up -d
docker compose restart ugk-pi      # 代码改动后
docker compose restart ugk-pi-team-worker  # worker 改动后
docker compose up -d --scale ugk-pi-team-worker=2  # 多 worker 验证
```

## 真实 runner smoke test 记录

**2026-05-16** — P0 真实 runner 端到端验收

- runId: `run_1c54aaa7e442`
- status: `completed`
- task_1: `succeeded`
- resultRef: `tasks/task_1/attempts/attempt_d7211b0ad1b2/accepted-result.md`
- marker: `P0_REAL_RUNNER_OK`
- final report: 已生成，包含 `P0_REAL_RUNNER_OK`
- `TEAM_USE_MOCK_RUNNER=false`
- 四个角色均绑定 `main` AgentProfile

验证结果：

- `npx tsc --noEmit`：通过
- `npm run test:team`：101 pass（P1.5 后 133 pass，P15 后 169 pass）
- `npm test`：819 pass

## 文件清单

| 文件 | 职责 |
|------|------|
| `src/team/types.ts` | TeamUnit / Plan / Run / role result 类型（含 discovery / for_each / decomposer task types 和 decomposition record） |
| `src/team/routes.ts` | v2 TeamUnit / Plan / Run / SSE / Attempt HTTP API |
| `src/team/orchestrator.ts` | run 创建、状态迁移、worker/checker/watcher/finalizer 编排（含 discovery / for_each 动态扩展和 controlled decomposition） |
| `src/team/run-workspace.ts` | run 目录、state、attempt、resultRef、final-report、attempt 文件读取、expansion / decomposition 持久化 |
| `src/team/run-state-events.ts` | 进程内 run state 变更通知（subscribe/notify） |
| `src/team/team-unit-store.ts` | TeamUnit 存储 |
| `src/team/plan-store.ts` | Plan 存储和 runCount 不变式 |
| `src/team/config-locks.ts` | 活跃 run 对 Plan / TeamUnit / AgentProfile 的锁计算 |
| `src/team/agent-profile-role-runner.ts` | 真实 AgentProfile runner（含 decomposer strict JSON prompt/parser） |
| `src/team/role-runner.ts` | mock runner 与 runner interface（含 `runDecomposer` contract） |
| `src/team/task-expansion-planner.ts` | 动态任务扩展：`TaskExpansionPlanner` 接口、`TemplateTaskExpansionPlanner` 模板实现 |
| `src/team/ids.ts` | ID 生成 |
| `src/team/path-refs.ts` | resultRef 路径验证和解析 |
| `src/team/progress.ts` | progress phase/message 常量 |
| `src/team/timing.ts` | timing span 写入 |
| `src/workers/team-worker.ts` | 独立 Team worker 轮询 queued run |
| `src/routes/agent-profiles.ts` | AgentProfile 写接口上的 Team active-run 锁 |
| `src/ui/team-page.ts` | `/playground/team` 控制台（含 SSE 实时更新、中文 phase 标签、页面内 toast/confirm、Plan modal 表单、结构化 Plan 卡片、JSON 查看器） |
| `.pi/skills/team-plan-creator/SKILL.md` | 只创建 TeamUnit / Plan 的运行时 skill |

### /playground/team 控制台

独立页面提供 Team Runtime 的可视化管理。P19 Dashboard Redesign 重构为以 Plan 为中心的导航架构（P12 Console UX Refresh + P13 Structured Plan Cards + P14 Compact Card Layout + P19 Dashboard Redesign）。

#### 页面结构

页面顶部为控制台头部（标题 + 副标题 + 三个摘要计数器），下方为 tab 导航：

1. **计划仪表盘**（默认视图）
2. **运行记录**（全局辅助审计视图）
3. **预设团队**（不变）

#### 计划仪表盘（默认视图）

响应式卡片网格展示所有 Plan。每张卡片包含：

- 标题 + 芯片（任务数 / 运行数）
- 目标摘要（截断显示）
- 计划类型标签：`普通` 或 `动态`（含 discovery → for_each 的 Plan）
- 活跃/最新 Run 摘要：状态 badge、当前任务、耗时
- 活跃 Run 进度条：已成功 / 已失败 / 总任务数
- 有活跃 Run 的 Plan 卡片：accent 色边框动画高亮
- 最近 Run 状态为 failed 的 Plan 卡片：红色左边框

点击 Plan 卡片进入 **计划详情视图**。

##### 计划详情视图

替换卡片网格，显示单个 Plan 的完整信息：

- **顶部**：返回按钮（回到仪表盘）+ Plan 标题
- **基本信息**：完整 goal、outputContract
- **任务结构**：
  - 普通计划：有序步骤列表，每步显示 title 和 input 摘要
  - 动态计划：**设计图**，可视化展示 discovery 节点 → `outputKey` → `for_each` 模板 → 运行时扩展概念
- **Run 列表**：仅展示该 Plan 关联的 Run（复用运行记录的卡片样式）

Run 卡片可展开，点击后展示该 Run 的 **任务时间线**：

- 有序任务节点，每个节点显示状态图标和标题
- 动态生成的子任务在父任务下方缩进展示
- `decomposer.mode="leaf"` / `propagate` 的 Plan task 在任务结构中显示紧凑 badge；`none` 不额外刷屏
- 被 decomposer split 的 parent 在时间线中标记为「拆分容器」，child task 以「拆分子任务」分组缩进展示
- `for_each` 生成的 child task 标记为「动态子任务」，和 decomposed child 区分展示
- 中文 phase 标签和颜色编码

#### 运行记录 tab

全局辅助审计视图，展示所有 Run（不区分 Plan）：

- 关联 Plan 标题、runId、状态 badge
- 人性化耗时格式（X时Y分 / X分Y秒）
- 格式化时间戳（创建/开始/完成）
- 任务进度条 + 成功/失败/取消统计
- SSE 实时更新（active run 自动订阅，terminal 自动断开）
- 动态生成的子任务在父任务下方以「子任务」分组展示
- 活跃运行排在列表前面
- 空状态包含下一步操作引导

#### 运行操作（全局）

- 暂停/恢复直接执行，不需要二次确认
- 取消使用自定义确认弹窗，带不可恢复影响说明
- 删除仅允许 terminal run，需确认
- 操作期间按钮 disabled

#### 计划管理

- 页面内 modal 表单创建计划（名称、目标、任务、验收标准、输出契约）
- 验收标准按行拆分为 `acceptance.rules`
- 两种创建模式：**普通计划**（单任务顺序执行）、**发现后逐项处理**（discovery + for_each 动态计划）
- 动态模式：填写发现任务和子任务模板，自动生成 canonical Plan JSON，预览后再提交
- 删除未使用计划（需确认）
- 「查看 JSON」弹层：使用 `textContent` 安全展示完整 Plan JSON

#### 预设团队 tab

CRUD + 归档，每个角色绑定 AgentProfile 下拉选择。与 P19 前行为一致。

#### 任务详情

- 中文 phase 标签（执行中/验收中/复盘中/生成报告等），带颜色编码
- 尝试历史卡片（状态、ID、时间戳、file-chip 文件按钮）
- `runtimeContext` 默认折叠（`<details>/<summary>`），点击展开详情
- 错误摘要使用高亮样式
- split parent 本身没有 worker attempt；如果 child 失败，parent 错误摘要和失败 child 会同时出现在时间线中，方便定位卡住的子任务
- 文件内容弹窗查看（调用 Attempt API，统一 modal-panel 样式）

#### 最终报告

统一 modal 弹窗，支持一键复制报告文本。

#### 通用特性

- **页面内反馈**：所有操作反馈通过 toast 通知（success/error/info），不使用浏览器原生 `alert()`/`confirm()`/`prompt()`
- **自定义确认弹窗**：危险操作使用 `confirmAction()` modal，带影响说明文案
- **移动端响应式**：`@media (max-width: 720px)` 适配（modal 全宽、摘要隐藏、按钮换行、表格缩窄、卡片网格单列）
- **安全性**：所有动态文本经过 `escapeHtml()` 转义，toast 使用 `textContent`

### Checker/Watcher JSON Output Format

Both checker and watcher agents must output **strict JSON only** — no markdown, no surrounding text.

**Checker output schema:**
```json
{"verdict": "pass|revise|fail", "reason": "...", "resultContent": "...", "feedback": "..."}
```
- `verdict` must be lowercase: `pass`, `revise`, or `fail`
- `feedback` is required when `verdict=revise` (default: "checker requested revision")
- `resultContent` is optional for pass/fail

**Watcher output schema:**
```json
{"decision": "accept_task|confirm_failed|request_revision", "reason": "...", "revisionMode": "amend|redo", "feedback": "..."}
```
- `decision` must be lowercase: `accept_task`, `confirm_failed`, or `request_revision`
- `feedback` is required when `decision=request_revision` (default: "watcher requested revision")
- `revisionMode` only `amend` or `redo`; invalid values are ignored

**JSONish fallback:** When strict JSON parsing fails, the system uses a regex-based fallback extractor for common model quirks (e.g., unescaped Chinese quotes in string values). This is not a general JSON repair tool — if both strict and JSONish parsing fail:
- Checker → `verdict=fail, reason="checker output parse error"`
- Watcher → `decision=confirm_failed, reason="watcher output parse error"`

**Limitation:** The fallback does not handle arbitrary malformed JSON.

### Phase Timeout

Each role phase has an independent timeout:
- `TEAM_WORKER_PHASE_TIMEOUT_MS` (default 900000 = 15 min)
- `TEAM_CHECKER_PHASE_TIMEOUT_MS` (default 300000 = 5 min)
- `TEAM_WATCHER_PHASE_TIMEOUT_MS` (default 300000 = 5 min)
- `TEAM_FINALIZER_PHASE_TIMEOUT_MS` (default 300000 = 5 min)

### Run Timeout

- Default max run duration: `TEAM_MAX_RUN_DURATION_MINUTES` (default 100)
- Per-run override: `POST /v1/team/plans/:planId/runs` accepts `maxRunDurationMinutes` (1–1440)
- `TeamRunState.maxRunDurationMinutes` persists per-run override; old states without this field fall back to constructor default
- UI create-run flow prompts for timeout before starting

Timeout behavior:
- Worker timeout: task marked failed, `errorSummary="worker timeout"`
- Checker timeout: work unit failed, `errorSummary="checker timeout"`
- Watcher timeout: treated as `confirm_failed` with `reason="watcher timeout"`
- Finalizer timeout: deterministic fallback report, run status `completed_with_failures`, `lastError="finalizer timeout"`
- Run timeout: all unfinished tasks marked failed, run status `failed`, `lastError="run timeout"`

Cancel/pause always takes priority over phase timeout — if a run is already cancelled/paused when timeout resolves, the cancelled/paused status is preserved.

### Timing Spans

`timings.jsonl` now records **real elapsed time** for each phase (worker, checker, watcher, finalizer). Each span includes `startedAt`, `finishedAt` (ISO timestamps), and `durationMs` (real milliseconds). Previously all spans had `durationMs: 0`.

## 已知限制

1. **默认 mock runner** — 真实 runner 需显式 `TEAM_USE_MOCK_RUNNER=false`。
2. **SSE 跨进程 fallback 延迟** — 同进程状态变更通过 `RunStateEvents` 立即推送；独立 worker 进程写入的状态变更通过 1 秒 change-detect fallback 捕获，因此跨进程更新可能有短暂延迟。
3. **默认单活跃 run** — `TEAM_MAX_CONCURRENT_RUNS` 默认为 `1`，即全局只允许一个 queued/running/paused run。设置为更大的值可允许并发 active run，但单个 worker 进程仍顺序执行；多 worker 进程可通过 lease 机制分别 claim 不同的 queued run。
4. **默认 run timeout 100 分钟** — 可通过 `TEAM_MAX_RUN_DURATION_MINUTES` 或 per-run override 调整。
5. **浏览器实例由既有 browser registry/env 决定** — Team 复用 chat/conn 的 browser binding 链路，不负责创建或调度 Chrome profile。多个 role 是否真正落到不同浏览器实例，取决于 AgentProfile 的 `defaultBrowserId` 与 `UGK_BROWSER_INSTANCES_JSON` 等既有配置。
6. **动态计划仅支持 discovery → for_each 常见模式** — UI builder 覆盖「先发现再逐项处理」的标准场景；高级 plan 结构（如多 discovery、嵌套 for_each）仍需通过 JSON/API 直接创建。
7. **for_each 仅顺序执行** — 并行执行和嵌套 for_each 尚未支持。
8. **Controlled decomposition 只支持有界顺序执行** — 运行时只允许 `propagate -> leaf | none`、`leaf -> none`；child task 必须是 normal；不支持并行 child execution、无限传播或 nested for_each。
9. **Decomposition UI 只展示，不编辑** — `/playground/team` 只显示 decomposer badge 和 split hierarchy；不提供可视化编辑器。当前 run state API 不直接暴露 decomposition record 列表，UI 优先使用可见的 generated task metadata / `parentTaskId`，旧 run 或缺少 metadata 的 run 会退回为普通「子任务」分组。
10. **无 AgentTaskExpansionPlanner** — 动态任务扩展目前使用模板展开（`TemplateTaskExpansionPlanner`），尚无 AI 驱动的智能扩展。

## 后续计划

1. ~~真实多 AgentProfile + 多 browserId 的 Team smoke test~~（P18 已完成，提供 `npm run team:browser-smoke` 命令）

### P17 审计覆盖（2026-05-17）

以下浏览器绑定不变式已由确定性测试覆盖（不依赖 Docker / Chrome / 模型）：

- TeamUnit 的 worker/checker/watcher/finalizer profile IDs 在执行前通过 `setProfileIds` 注入 runner
- 不同 AgentProfile 的 `defaultBrowserId` 会进入各自 role session
- Route setup、cleanup、route clear 使用匹配的 canonical scope 和 browserId
- Attempt metadata 持久化 worker/checker/watcher 的 `runtimeContext`（含 `requestedProfileId`、`resolvedProfileId`、`browserId`、`browserScope`）
- Run state 持久化 `finalizerRuntimeContext`
- Worker 构造时的 `main` 占位符会被 TeamUnit 实际 profile IDs 覆盖
- Mock runner 默认行为不变（`TEAM_USE_MOCK_RUNNER` 非精确 `"false"` 时使用 mock）

#### 手动多浏览器 Smoke 清单

在真实环境中验证多 profile 多浏览器绑定：

1. 配置 `UGK_BROWSER_INSTANCES_JSON` 包含至少两个 browser ID（如 `default` 和 `chrome-01`）
2. 创建两个 AgentProfile，分别设置不同的 `defaultBrowserId`
3. 创建一个 TeamUnit，将不同 profile 分配给 worker 和 finalizer（或 worker 和 checker）
4. 确保 `TEAM_RUNTIME_ENABLED=true` 和 `TEAM_USE_MOCK_RUNNER=false`
5. 启动 `ugk-pi` 和 `ugk-pi-team-worker`
6. 通过 `/playground/team` 创建并执行一个 run
7. 检查 attempt metadata 中的 `runtimeContext`：不同角色应有不同的 `browserId`
8. 检查 run state 中的 `finalizerRuntimeContext`：应包含 finalizer profile 的 browserId

Team 不创建 Chrome 实例，不复制 cookie 或登录态，不调度浏览器。browserId 到真实 CDP endpoint 的映射仍由 `UGK_BROWSER_INSTANCES_JSON` / Browser Registry 决定。

### P18 Browser Binding Smoke（2026-05-17）

自动化 smoke 脚本 `scripts/team-browser-binding-smoke.mjs` 通过 HTTP API 验证真实 Team run 的浏览器绑定：

```bash
npm run team:browser-smoke -- \
  --worker-profile smoke-worker \
  --checker-profile smoke-checker \
  --watcher-profile smoke-watcher \
  --finalizer-profile smoke-finalizer \
  --expect-worker-browser browser-a \
  --expect-checker-browser browser-b \
  --expect-watcher-browser browser-a \
  --expect-finalizer-browser browser-b
```

前提条件：

- `TEAM_RUNTIME_ENABLED=true`
- `TEAM_USE_MOCK_RUNNER=false`
- `UGK_BROWSER_INSTANCES_JSON` 包含所有期望的 browser ID
- HTTP server 和 `ugk-pi-team-worker` 正在运行
- 四个 AgentProfile 已存在且设置了匹配的 `defaultBrowserId`

脚本行为：

1. 创建临时 TeamUnit（绑定四个 profile）
2. 创建单任务 Plan
3. 创建 Run 并轮询至 terminal
4. 读取 task_1 的 attempt metadata
5. 校验 worker/checker/watcher 的 `requestedProfileId`、`browserId`、`browserScope`
6. 校验 run state 中的 `finalizerRuntimeContext`
7. 脚本不会删除创建的 TeamUnit/Plan/Run，保留供排查

所有 CLI 参数均可通过环境变量覆盖（`TEAM_SMOKE_WORKER_PROFILE` 等）。测试覆盖了 CLI 解析、HTTP 流程（mocked fetch）、超时/失败拒绝、以及严格的 runtime context 校验。

---

## 归档：v0.1 域名调查历史

以下是 Team Runtime v0.1 的历史资料，不是当前 v2 主接口。v0.1 基于 template / stream / submit tool 架构，已被 v2 的 plan-driven sequential pipeline 替代。这些内容仅供参考，不要按此开发。

### v0.1 一句话概述

给定一个品牌关键词（如 "Medtrum"），系统自动搜索相关域名，判断每个域名是官方的、第三方还是可疑的，最终生成调查报告。

### v0.1 架构

```
POST /v1/team/runs {keyword: "Medtrum"}
         │
         ▼
  ┌─── team-worker (轮询) ───┐
  │                            │
  │  TeamOrchestrator.tick()   │
  │  Discovery → Evidence → Classifier → Reviewer → Finalizer
  └────────────────────────────┘
```

v0.1 使用 `TeamTemplate`、`submitTeamStreamItem()`、`llm-tool-loop.ts` 等 v0.1 专用组件。v2 不再使用这些组件。相关文件（`src/team/team-template.ts`、`src/team/team-submit.ts`、`src/team/llm-tool-loop.ts` 等）仍在仓库中但已不被 v2 主流程引用。

### v0.1 数据目录

```
.data/team/
  runs/<teamRunId>/
    plan.json
    state.json
    events.jsonl
    streams/          # v0.1 stream 文件
    cursors/          # v0.1 cursor 文件
    artifacts/
      final_report.md
```

v2 使用相同的 `runs/<teamRunId>/` 目录结构，但内部文件不同（有 `tasks/`、`attempts/`、`results/`、`final-report.md` 等）。

### v0.1 环境变量

| 环境变量 | 说明 |
|----------|------|
| `TEAM_REAL_ROLES` | 逗号分隔的真实角色列表 |
| `TEAM_ROLE_TASK_TIMEOUT_MS` | 角色任务超时（默认 180000） |
| `TEAM_ROLE_TASK_MAX_RETRIES` | 失败重试次数 |

v2 不使用这些变量。
