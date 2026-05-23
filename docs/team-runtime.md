# Team Runtime v2

更新时间：2026-05-21

本文档是 Team Runtime v2 的唯一权威源。v0.1 域名调查历史见文末归档章节。

## 当前目标

提供 plan-driven sequential multi-role pipeline：给定一个 Plan（有序任务列表 + 验收标准），系统自动按 worker → checker → watcher → finalizer 四角色流水线顺序执行每个 task，产出结构化结果和汇总报告。

## 当前状态

- v2 基础链路已验证通过（mock + 真实 runner）
- AbortSignal 全链路传播：cancel/pause 能中断正在执行的 agent session
- 真实 runner smoke test：`run_1c54aaa7e442`，status: completed，P0_REAL_RUNNER_OK
- 最新验证：P26 output contract validation 已覆盖 deterministic validator、真实 orchestrator regression、`npm run test:team` 和 `npx tsc --noEmit`
- 独立 Team Console 前端预览已建立（`apps/team-console/`），使用 Vite + React + TypeScript，实现纵向 Execution Map 原型。当前 `/playground/team` 仍是生产入口，Team Console 不替换任何现有页面。
- Team Console preview 的 Live API 模式已真实接线：切换后请求 `GET /v1/team/plans` 和 `GET /v1/team/runs`，按 `createdAt` 选择最新 run，再请求 `GET /v1/team/runs/:runId` 获取详情并按 `planId` 匹配 plan；当前没有 live run picker，也不调用 pause/resume/cancel、manual disposition、rerun 或 attempt 文件读取接口。
- Team Console preview 的 Execution Map 建模按优先级挂载 generated child：显式 `parentTaskId`、仅在单一 `for_each` parent 时使用的安全 `sourceItemId` fallback、标记 `fallback: true` 的 id prefix fallback，仍无法归属的任务进入 orphan group；model builder 不修改传入的 plan/run/taskDefinitions。大量子任务折叠 summary node 会按隐藏子任务状态汇总，不再固定显示成功。
- Execution Map 视觉已从 list-like 测试 UI 进化为纵向流式布局：根节点顶部、主任务沿左侧 spine 向下、子任务分支右侧；节点有 4px 彩色状态条、选中发光、chain-selected 半透明路径、失败红色渐变和错误首行、折叠虚线、orphan 点线；连接线使用三次贝塞尔(spine)和 L 形直角(branch)；responsive 断口在 720px。

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
- `tasks[]` — 有序任务列表，每个 task 有 `id`、`title`、`input.text`、`acceptance.rules`，可选 `decomposer` / `outputCheck`
- `outputContract` — 最终输出格式
- `runCount` — 已产生的 run 数量；`runCount > 0` 后任务主体不可改

#### Plan draft

Plan draft 是创建 Plan 前的只读草案层。它只根据用户自然语言目标生成一份可检查、可再提交的 `POST /v1/team/plans` payload，不持久化 Plan，不创建 Run，也不修改 `runCount`。

- `GET /v1/team/plan-templates` 返回模板 registry。当前可用模板是 `single_agent` 和 `parallel_research`；`coding_fix`、`deep_research_with_review` 只作为 planned 模板返回，不能用于 draft 生成，也不在 `/playground/team` 的可创建选项中展示。
- `POST /v1/team/plan-drafts` 接收 `prompt`、`defaultTeamUnitId` 和可选 `preferredTemplateId`；路由会先校验 TeamUnit 存在且未归档，再生成 draft，并用 `validateCreatePlanInput()` 校验返回的 plan。
- Plan draft v1.1 router 仍是确定性薄 heuristic，不调用 LLM：多对象研究、竞品/供应商/产品/pricing/alternatives/market map 等信号稳定进入 `parallel_research`；普通单点研究保持 `single_agent`；代码修复信号优先走 `single_agent`，不会被 `pricing` 里的 `ci` 之类字符串误判成 CI 修复。
- `parallel_research` draft 生成 `discover_items` discovery 任务和 `research_each` `for_each.mode="parallel"` 任务；discovery prompt 要求输出 3 到 8 个高价值结构化 item，child prompt 锁定单个 source item 身份，final output contract 要求执行摘要、逐项发现表格、横向对比、来源线索、风险/未知项和建议。
- 并行 child 模板不设置 `leaf` / `propagate` decomposer，避免和 parallel for_each 校验冲突。
- 显式请求 planned/unsupported `preferredTemplateId` 会返回 400；没有 preferred template 时只会选择当前 supported 模板。

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
- pause/cancel/timeout 使用现有 run control 机制；未完成 parent/children 会按 run 状态统一标记。
- parent 状态由 child 汇总：全部 child 成功则 parent `succeeded`，任一 child 失败则 parent `failed`，错误摘要指向失败 child。
- 当 `discovery` parent 被 `split` 时，parent 仍不执行 worker/checker/watcher；runtime 会按 decomposition record 中的 child 顺序尝试读取每个 normal child 的 `accepted-result.md` 和 `worker-output-001.md`，以第一个能解析出 item 数组的内容为准，并聚合为 parent 的 `discovery.outputKey` 结果供下游 `for_each.itemsFrom` 使用。
- 聚合成功后，runtime 为 parent 创建一个 **聚合 attempt**（无 worker/checker/watcher），写入标准化 `discovery-result.json`（`tasks/<parentTaskId>/attempts/<attemptId>/discovery-result.json`），parent task state 的 `activeAttemptId` 指向该聚合 attempt。resume/reclaim 时优先读取此标准文件，不再重新聚合子级输出。旧 run 无此文件时回退到传统子级聚合。
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
- P26 起，discovery 输出在 runtime 中有硬约束：必须能解析为 `{ [outputKey]: [...] }`，数组元素必须是 object，且每个 item 必须有稳定非空 string `id`
- worker 可以直接输出机器可消费 JSON，也可以在 `accepted-result.md` / `worker-output-001.md` 中引用 run-scoped 文件；例如 `worker/hk-cloud-server-scan.json` 会解析到当前 attempt 的 worker role workspace
- checker/watcher 的口头通过不能绕过 discovery 协议；deterministic validator 的 `ok=false` 会把该 work unit 置为 failed

#### discovery-result.json 标准化合约

discovery 任务通过 deterministic output validation、checker 和 watcher 后，runtime 会将提取到的 items 写入标准化文件 `discovery-result.json`：

```
tasks/<taskId>/attempts/<attemptId>/discovery-result.json
```

文件内容为 `TeamDiscoveryResultRecord`（schemaVersion: `team/discovery-result-1`），包含 `taskId`、`attemptId`、`outputKey`、`items`（对象数组）、`sourceRef`、`createdAt`。

- `items` 必须为对象数组（`Record<string, unknown>[]`），且每个 item 必须有 `string` 类型的 `id` 字段
- 标准化失败时（items 含非对象值、缺少 id、outputKey 不匹配、引用文件缺失或越界），discovery task 会标记为 `failed`
- `for_each.itemsFrom` 解析时优先读取 `discovery-result.json`，并验证 `outputKey` 与 `itemsFrom` 引用一致
- 若 run 无 `discovery-result.json`（旧 run 或旧 attempt），runtime 回退到传统解析：依次尝试 `accepted-result.md`、`worker-output-001.md`、以及其中引用的 run-scoped 文件路径。legacy fallback 纯为向后兼容，新 run 一律走标准化路径
- `accepted-result.md` 仍是人类可读结果（checker/watcher 产出），不再是 `for_each` 的主数据源

#### Output Contract Validation (P26)

`TeamOutputValidationResult` 是 runtime 生成的确定性证据，不由 LLM 自评产生。结构包含 `ok`、`kind`、`sourceRef`、`normalizedRef` 和逐项 `checks[]`。

支持的 `outputCheck`：

```json
{ "type": "json_items", "outputKey": "vendors", "allowDirectArray": false, "requiredFields": ["id"] }
{ "type": "json_object", "requiredFields": ["summary"] }
{ "type": "html_fragment", "requiredSubstrings": ["vendor-card"], "forbiddenTags": ["html", "body"], "requireFence": false }
{ "type": "file_exists", "path": "worker/report.html" }
```

- `discovery` 会自动派生 `json_items` 校验，`outputKey` 来自 `discovery.outputKey`，并强制 `requiredFields=["id"]`
- 普通 task 可显式声明 `task.outputCheck`
- `forEach.taskTemplate.outputCheck` 会随生成子任务持久化到 expansion record；占位符如 `{{item.id}}` 会在展开时替换，resume/reclaim 使用持久化后的 child task 定义
- checker prompt 会收到 `outputValidation` evidence；当 `ok=false` 时不得输出 `verdict="pass"`
- watcher prompt 也会收到同一 evidence；当 `ok=false` 时不得输出 `decision="accept_task"`
- runtime 在 checker pass 后仍会重新校验 checker `resultContent` 和 worker output；两者都无效时直接失败，checker/watcher 无法用自然语言“通过”绕过协议
- run-scoped 引用只允许当前 run / attempt 范围内的文件：`worker/...`、`checker/...`、`watcher/...`、`output/...`、`work/...`、`runs/<runId>/...`、`/app/.data/team/runs/<runId>/...`
- 明确拒绝越界路径和主机绝对路径，例如 `worker/../../.env`、`/etc/passwd`、`C:/...`
- P26 incident `run_943b995d6adc` 的失败形状已回归覆盖：checker 只写“JSON 数据文件：worker/hk-cloud-server-scan.json（...）”时，runtime 能安全解析 role workspace 相对引用；文件缺失或缺少 `vendors` 数组时会在展开 `for_each` 前失败

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
- `forEach.mode`（必填）— 支持 `"sequential"` 或 `"parallel"`
- `forEach.taskTemplate`（必填）— 子任务模板，支持以下占位符：
  - `{{item.<field>}}` — 任意 top-level item 字段；对象/数组 JSON-stringified；null/缺失为空字符串
  - `{{item}}` — 完整 item JSON
  - `{{run.id}}`、`{{plan.id}}`、`{{parentTask.id}}` — run-scoped 变量
  - `{{task.outputDir}}` — run-scoped 输出目录（`.data/team/runs/<runId>/generated/<parentTaskId>`）
- 每个 item 必须有稳定的非空字符串 `id` 字段
- 子任务 ID 格式：`{parentTaskId}__{sanitizedItemId}`

#### for_each parallel mode

`forEach.mode = "parallel"` 时，子任务并发执行：

- 固定容量池（`PARALLEL_FOR_EACH_CONCURRENCY = 3`），child 完成即补位，不是批处理模式
- `forEach.taskTemplate.decomposer.mode` 为 `"leaf"` 或 `"propagate"` 时在 Plan 创建/更新时被拒绝——parallel child 不允许进一步拆分。`decomposer.mode = "none"` 或无 decomposer 字段时允许（不会触发拆分）
- 并发 child 使用 scoped `ParallelChildStateWriter`（实现 `TeamStateWriter` 接口），通过 `patchState` 隔离写入；sequential child 继续使用普通 `saveState`
- parent 状态由子任务聚合：
  - 至少一个 child succeeded → parent `succeeded`（partial success）
  - 全部 child skipped → parent `skipped`
  - 其他情况（全 failed / mixed failed+skipped）→ parent `failed`
- 0 个 item 时与 sequential 相同，parent 直接 `succeeded`
- pause：所有 running 子任务标记为 `interrupted`，新子任务不再入池
- cancel：所有未完成子任务标记为 `cancelled`
- resume：`interrupted` 子任务重置为 `pending`，等待 worker 接管后重新执行
- rerun：`force_rerun` 子任务重新执行；`skip` 子任务保持 skipped；expansion record 复用不重复生成

#### for_each sequential mode

`forEach.mode = "sequential"`（默认）时，子任务按顺序逐个执行，与既有行为完全一致。

- 扩展记录持久化在 `runs/<runId>/expansions/<parentTaskId>.json`
- 扩展记录包含完整子任务定义（`task` 字段），确保 resume/reclaim 后子任务 input/acceptance 不漂移
- 旧格式记录（无 `task` 字段）仍可读取，fallback 为 title-based input
- 幂等扩展：pause/resume 不会重复生成子任务
- `for_each` 父任务状态由子任务结果推导：全部成功→succeeded，有失败→failed
- 0 个 item 时，`for_each` 直接标记为 succeeded

#### for_each 子任务 item 身份隔离 (P23)

Discovery 任务可以看到完整的 item 列表——它的职责是找到这个列表。`for_each` 展开后，每个生成的子任务**只能绑定一个 source item**。

- 每个生成的子任务携带 `sourceItem` 快照（`{ id, data }`），包含完整的 discovery item 副本
- 扩展记录（expansion JSON）中持久化 `sourceItem`，resume/reclaim 使用存储的快照，不会从可能已变化的 discovery 结果重新渲染
- Worker/checker/watcher 的 prompt 中注入**权威 source item 身份块**，明确声明当前 item 的 `id` 和 `title`/`name`/`label`
- Prompt 指令：任何参考资料、历史文件、全局清单、编号表如果与当前 item 冲突，必须以当前 item 为准
- Checker prompt 要求：如果 worker 输出处理了错误的 item（与 source item 不匹配），verdict 必须为 `fail`
- Watcher prompt 包含任务描述（`task.input.text`），不得认可切换了 item 的结果
- 自动追加的 acceptance rules 包含 item identity 约束（基于 `item.id` 和 display field）
- 旧扩展记录（无 `sourceItem`）仍兼容，fallback 使用已有的 `sourceItemId` 和存储的 `task`

**典型 incident**：如果 `item.id=battle_08` 且 `item.title=藏经阁大战`，worker 读到一份共享评分表说 `8=雁门关外自尽`，worker 不得将任务主体切换到"雁门关外自尽"。Checker 必须拒绝这种输出。

#### 实现组件

| 文件 | 职责 |
|------|------|
| `src/team/task-expansion-planner.ts` | `TaskExpansionPlanner` 接口和 `TemplateTaskExpansionPlanner` 模板实现 |
| `src/team/child-execution.ts` | `for_each` expanded child 的 sequential / parallel 执行拓扑、固定并发池、child state writer 和 parent 聚合 |
| `src/team/task-attempt-runner.ts` | 单个 task attempt 的 worker -> checker -> watcher 生命周期：attempt 创建、phase transition、retry、output validation、accepted/failed result 写入 |
| `src/team/run-workspace.ts` | Run workspace facade，保持既有调用入口并委托 state / attempt / artifact / record stores |
| `src/team/run-workspace-state.ts` | run state、admission、lease、`patchState` 和 state event 通知 |
| `src/team/run-workspace-attempts.ts` | attempt metadata、worker/checker/watcher 文件、discovery-result 和 role workspace 文件读取 |
| `src/team/run-workspace-artifacts.ts` | final report 与 run-scoped 文件读取 |
| `src/team/run-workspace-records.ts` | expansion / decomposition records，以及 generated child task state append |
| `src/team/orchestrator.ts` | 按 task type 分发执行：normal / discovery / for_each；处理 controlled decomposition；组合 `TaskExpansionPlanner`、child execution module 和 task attempt runner |

#### Plan 验证

- Plan schema policy 集中在 `src/team/plan-validation.ts`；`PlanStore` 只负责调用验证入口、持久化 Plan 和维护 `runCount` 不变式
- `PlanStore.create()` 调用 `validateCreatePlanInput()`；`PlanStore.updateEditablePlan()` 在 `runCount=0` 且 patch 包含 `tasks` 时调用 `validatePlanTasks()`
- 未知 `task.type` 被拒绝（只允许 `normal`、`discovery`、`for_each`）
- 未知 `task.decomposer.mode` 被拒绝（只允许 `none`、`leaf`、`propagate`）
- `task.decomposer.maxChildren` 和 `forEach.taskTemplate.decomposer.maxChildren` 必须是 `1..20` 的整数
- `forEach.mode = "parallel"` + `forEach.taskTemplate.decomposer.mode` 为 `"leaf"` 或 `"propagate"` 时在 Plan 创建/更新时被拒绝。`decomposer.mode = "none"` 或无 decomposer 字段时允许
- `task.outputCheck` 和 `forEach.taskTemplate.outputCheck` 使用同一套 schema 校验；旧 plan 缺失该字段时继续兼容
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
| GET | `/v1/team/plan-templates` | 列出 Plan draft 模板 registry（含 supported / planned 状态） |
| POST | `/v1/team/plan-drafts` | 根据自然语言目标生成可检查的 Plan create payload；不持久化 Plan，不创建 Run |
| GET | `/v1/team/plans` | 列出 Plans |
| POST | `/v1/team/plans` | 创建 Plan；`defaultTeamUnitId` 必须存在且未归档 |
| GET | `/v1/team/plans/:planId` | 查看 Plan |
| PATCH | `/v1/team/plans/:planId` | 修改未归档 Plan；已有 run 后任务主体不可改 |
| PATCH | `/v1/team/plans/:planId/default-team` | 切换默认 TeamUnit |
| POST | `/v1/team/plans/:planId/archive` | 归档未被活跃 run 锁住的 Plan |
| DELETE | `/v1/team/plans/:planId` | 删除 Plan；已有 run 保留在 run workspace，不因 plan 删除而 500 |

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
| PATCH | `/v1/team/runs/:runId/tasks/:taskId/manual-disposition` | 设置单任务 rerun disposition |
| PATCH | `/v1/team/runs/:runId/tasks/manual-dispositions` | 批量设置任务 rerun disposition |
| POST | `/v1/team/runs/:runId/rerun` | 按任务标记重开 terminal run |

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
- `saveState()` 使用 run-scoped `.state.lock` 串行化 `state.json` 写入，并为每次写入使用唯一 temp 文件；`getState()` 会短暂重试 transient 读取失败，避免 Windows rename 窗口或 heartbeat/progress/control 并发写入被误判为 run 丢失
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

## Run Rerun 与 Manual Task Control (P24)

### Rerun vs Pause/Resume

| | Pause/Resume | Rerun |
|---|---|---|
| 触发时机 | run 正在执行（running） | run 已结束（completed/failed/completed_with_failures） |
| 状态变化 | running → paused → queued | terminal → queued |
| 任务状态 | 保持不变 | 按 disposition 决策表重置 |
| run ID | 不变 | 不变（不创建新 run） |
| plan.runCount | 不变 | 不变（不递增） |
| active elapsed timer | 保留累计活跃时间 | 清零，重新计算本次执行窗口 |
| final report | 保留 | 清除旧的 final-report.md |

### Manual Disposition

每个 task 可以设置 `manualDisposition`，影响 rerun 时的行为：

| Disposition | 含义 | Rerun 行为 |
|---|---|---|
| `default` | 无覆盖 | succeeded → 复用结果；其他状态 → 重新执行 |
| `skip` | 跳过 | 无论之前什么状态，不执行，标记为 skipped |
| `force_rerun` | 强制重跑 | 无论之前什么状态，重新执行；成功后自动清除标记回 `default` |

### 决策表

`shouldExecuteOnRerun(taskState)` 的完整决策：

| manualDisposition | taskStatus | 结果 |
|---|---|---|
| default | succeeded | 复用（不执行） |
| default | pending | 执行 |
| default | failed | 执行 |
| default | interrupted | 执行 |
| default | cancelled | 执行 |
| default | skipped | 执行 |
| skip | *任何状态* | 不执行，标记 skipped |
| force_rerun | *任何状态* | 执行；成功后标记自动清除回 `default` |

### force_rerun 自动清除

当一个 task 的 `manualDisposition === "force_rerun"` 在 rerun 中执行并最终 `status === "succeeded"`，该标记自动清除为 `"default"`。这避免用户陷入"成功修复的任务反复重跑"的循环。

- 不清除的情况：task 结果为 `failed`、`cancelled`、`interrupted`、`pending`、`running` 或 `skipped`
- `skip` 标记不自动清除
- 适用于所有 task 类型：normal、generated `for_each` child、decomposed child、parent/container task
- 清除时机：run 进入终端状态时（正常完成、completed_with_failures、failed、timeout），针对每个 task 的实际结果独立判断，不受整体 run 状态影响

### Expanded Task 行为

- **parent 标 skip**：无论 `for_each` 还是 `decomposer` parent，所有子任务标记为 `skipped`（包括之前 succeeded/failed/pending/cancelled 的子任务），worker 和 decomposer 均不被调用。子任务 `errorSummary` 置 null，`resultRef` 保留可审计
- **summary 重算**：`skipGeneratedChildren` 调用 `recomputeSummary` 从全量 taskStates 重新计数，不依赖 `++`，避免重复计数
- **子任务标 skip**：仅该子任务跳过，不影响兄弟任务；parent 聚合时按 all-skipped → skipped、any-failed → failed、otherwise → succeeded 规则判断
- **Expansion/decomposition record**：rerun 复用已有记录，不重复生成子任务

### API 端点

- `PATCH /v1/team/runs/:runId/tasks/:taskId/manual-disposition` — 单任务 disposition，body: `{ disposition: "skip" | "force_rerun" | "default" }`
- `PATCH /v1/team/runs/:runId/tasks/manual-dispositions` — 批量 disposition，body: `{ updates: [{ taskId, disposition }] }`。原子操作：任一无效则全部拒绝
- `POST /v1/team/runs/:runId/rerun` — 重开 terminal run。active/cancelled run 返回 409

所有 disposition API 拒绝 active run（queued/running/paused）。

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

#### P25: 权威运行汇总

Finalizer prompt 包含来自 `TeamRunState.summary` 的权威运行汇总（totalTasks / succeededTasks / failedTasks / cancelledTasks / skippedTasks）。finalizer 被指示不得重新计算或改写这些计数，报告中引用任务计数时必须使用权威数据。

#### P25: Skipped 任务语义

- `skipped` 是独立于 `failed` 的状态。当前 `errorSummary` 为 null（不携带旧错误）。
- 跳过前的原始错误持久化在 `TeamTaskState.previousErrorSummary` 中，作为审计上下文传入 finalizer prompt，标记为历史/审计数据，不得作为当前失败。旧 persisted state 无此字段时兼容加载。
- 重新执行（非 skip）的任务清除 `previousErrorSummary`。
- `completed` + `skippedTasks > 0` + `failedTasks === 0` 的 run 是合法终态。
- Fallback report 遍历 `state.taskStates`（含 generated/decomposed 子任务），不限于 `plan.tasks`。summary 来自 `TeamRunState.summary`，detail 中 skipped 任务显示"跳过"并附上 `previousErrorSummary`（如有）。

#### P25: Succeeded-but-limited 汇总口径

如果某个 `succeeded` 任务的产出提到外部数据源限制（如 API 需要登录、只有部分数据可用），finalizer 应将其列入"限制与警告"部分，但必须归入"已完成"区域。只有运行时状态为 `failed` 或 `cancelled` 的任务才能出现在"失败/未完成"部分。

### pause / resume / cancel

- **pause**：写入 `paused` 状态 + 触发 `AbortController.abort()`，当前 phase 被中断。所有 running task（含 parallel 子任务）标记为 `interrupted`。resume 后从下一个未完成的 task 继续；`interrupted` 子任务重置为 `pending` 重新执行。
- **cancel**：写入 `cancelled` 状态 + 触发 abort。所有未完成 task（含 parallel 子任务）标记为 `cancelled`。terminal 状态不可逆。
- **resume**：将 `paused` run 恢复为 `queued`，等待 worker 接管。跳过已 succeeded/failed/cancelled 的 task。`interrupted` task 重置为 `pending` 重新入队。
- **stale-write protection**：`ParallelChildStateWriter` 内 guard 检查 `latest.status !== "running"` 和 task terminal/interrupted 状态，防止 pause/cancel 后的迟到子任务覆盖已中断/取消状态。

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

- **Plan**：锁住期间不允许归档；删除已与 run 关联的 Plan 会移除 Plan 记录，run 数据保留不丢失
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
| `src/team/types.ts` | TeamUnit / Plan / Run / role result 类型（含 discovery / for_each / decomposer / outputCheck 和 validation result） |
| `src/team/routes.ts` | v2 TeamUnit / Plan draft / Plan / Run / SSE / Attempt HTTP API |
| `src/team/plan-draft.ts` | 确定性 Plan draft 模板 registry 和自然语言薄 heuristic router；只生成可检查的 Plan create payload |
| `src/team/run-presenter.ts` | Team run detail API response presenter：汇总 expansion / decomposition records 为 `taskDefinitions`，避免 route handler 直接拼响应形状 |
| `src/team/orchestrator.ts` | run 创建、状态迁移、task ordering、dynamic expansion、controlled decomposition、finalizer，以及 task attempt runner 组合 |
| `src/team/child-execution.ts` | expanded child task 执行模块：顺序 child 循环、parallel refill pool、fatal drain、parent status aggregation 和 scoped child state writer |
| `src/team/task-attempt-runner.ts` | task attempt 生命周期执行模块：worker/checker/watcher phase、checker/watcher retry、output validation gate、accepted/failed result 和 attempt metadata 写入 |
| `src/team/run-workspace.ts` | RunWorkspace facade，兼容既有 orchestrator/routes 调用并隐藏磁盘布局 |
| `src/team/run-workspace-state.ts` | run state、admission、lease、`patchState` 和 `RunStateEvents` |
| `src/team/run-workspace-attempts.ts` | attempt metadata、attempt 文件、role workspace 文件和 discovery-result 持久化 |
| `src/team/run-workspace-artifacts.ts` | final-report 和 run-scoped 文件读取 |
| `src/team/run-workspace-records.ts` | expansion / decomposition records 与 generated child task state append |
| `src/team/output-validator.ts` | P26 deterministic output contract validator：JSON items/object、HTML fragment、file exists、run-scoped file reference safety |
| `src/team/run-state-events.ts` | 进程内 run state 变更通知（subscribe/notify） |
| `src/team/team-unit-store.ts` | TeamUnit 存储 |
| `src/team/plan-store.ts` | Plan 持久化和 runCount 不变式 |
| `src/team/plan-validation.ts` | Plan create/update schema policy：task type、decomposer、for_each、outputCheck 校验 |
| `src/team/config-locks.ts` | 活跃 run 对 Plan / TeamUnit / AgentProfile 的锁计算 |
| `src/team/agent-profile-role-runner.ts` | 真实 AgentProfile runner adapter：profile/session/browser/workspace/abort/runtimeContext 接线 |
| `src/team/role-prompt-contract.ts` | 纯 role prompt contract：worker/checker/watcher/finalizer/decomposer prompt builder、JSONish parser 和 output normalizer |
| `src/team/role-runner.ts` | mock runner 与 runner interface（含 `runDecomposer` contract） |
| `src/team/task-expansion-planner.ts` | 动态任务扩展：`TaskExpansionPlanner` 接口、`TemplateTaskExpansionPlanner` 模板实现 |
| `src/team/ids.ts` | ID 生成 |
| `src/team/path-refs.ts` | resultRef 路径验证和解析 |
| `src/team/progress.ts` | progress phase/message 常量 |
| `src/team/timing.ts` | timing span 写入 |
| `src/workers/team-worker.ts` | 独立 Team worker 轮询 queued run |
| `src/routes/agent-profiles.ts` | AgentProfile 写接口上的 Team active-run 锁 |
| `src/ui/team-page.ts` | `/playground/team` 控制台（含 SSE 实时更新、中文 phase 标签、页面内 toast/confirm、Plan modal 表单、自然语言草案、结构化 Plan 卡片、JSON 查看器） |
| `src/ui/team-run-detail-behavior.ts` | Team run detail 滚动快照 / anchor 恢复 helper；`team-page.ts` 将这段脚本注入 inline UI |
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
- Plan ID：完整展示，点击可复制（`.team-id-label`）
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

Run 卡片中 Run ID 完整展示，点击可复制（`.team-id-label`）。Run 卡片可展开，点击后展示该 Run 的 **任务时间线**：

- 有序任务节点，每个节点显示状态图标和标题
- 动态生成的子任务在父任务下方缩进展示
- `decomposer.mode="leaf"` / `propagate` 的 Plan task 在任务结构中显示紧凑 badge；`none` 不额外刷屏
- 被 decomposer split 的 parent 在时间线中标记为「拆分容器」，child task 以「拆分子任务」分组缩进展示
- `for_each` 生成的 child task 标记为「动态子任务」，和 decomposed child 区分展示
- `GET /v1/team/runs/:runId` 返回 additive `taskDefinitions`，由 expansion/decomposition records 汇总生成；UI 优先使用该真实契约，不再靠 child id 前缀猜 parent
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
- 三种创建模式：**普通计划**（单任务顺序执行）、**发现后逐项处理**（discovery + for_each 动态计划）、**自然语言草案**（先生成可检查 Plan draft）
- 动态模式：填写发现任务和子任务模板，自动生成 canonical Plan JSON，预览后再提交
- 自然语言草案模式：输入目标后调用 `POST /v1/team/plan-drafts`，页面提供 supported template 显式选择：`自动匹配`（不传 `preferredTemplateId`）、`单 Agent`、`并行研究`；planned registry 不展示为可创建项
- 草案生成后页面展示模板命中、reason、warnings 和 Plan JSON；用户确认后才把草案 payload 提交到 `POST /v1/team/plans`，不会自动创建或启动 Run
- 阶段边界：本阶段不再继续增强可视化 Plan 创建器。复杂 Plan 设计优先在 Agent 对话和 `team-plan-creator` skill 中敲定；`/playground/team` 主要承担 Plan 查看、Run 创建、执行审计、失败排查和 rerun 决策。
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

#### Run 脑图视图

展开 Run 详情时，默认展示纵向思维导图（`脑图`），可切换为传统任务时间线（`详情`）。

- **视图切换**：`脑图 / 详情` 分段控制，每 Run 独立记忆，SSE 刷新不丢失选择
- **纵向脑图**：
  - 根节点：Run 摘要（ID、状态、任务计数）
  - 主任务节点：按 Plan 顺序排列
  - 生成子任务：按 `parentTaskId` / `sourceItemId` 元数据挂载到父节点
  - 未归属子任务：归入 `未归属子任务` 分组
  - 节点类型标签：`任务`、`发现`、`逐项处理`、`动态子任务`、`拆分子任务`
- **状态视觉**：
  - running：左边框蓝色 + 轻微 pulse 动画
  - succeeded：左边框绿色
  - failed：左边框红色，紧凑态即显示错误首行
  - skipped / cancelled：整体淡化
  - 连接线：`.mindmap-children` 纵向主干 + 横向分支
- **自适应交互**：
  - 节点点击展开/收起详情（attempt、resultRef、error、file chips）
  - 失败节点默认展开
  - 超过 6 个子节点时折叠，`展开全部 N 个` / `收起`
  - task disposition 更新前捕获当前 run detail 滚动快照和 `data-task-id` anchor，刷新后由 `src/ui/team-run-detail-behavior.ts` 按属性比对恢复位置，避免特殊 task id 拼 selector 或跳回顶部
- **移动端**：`@media (max-width: 720px)` 收口为纵向树卡片，隐藏连接线，无横向滚动
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
- P26 起，checker prompt 会包含 runtime 生成的 `outputValidation` evidence；若 `ok=false`，checker 不得返回 `pass`

**Watcher output schema:**
```json
{"decision": "accept_task|confirm_failed|request_revision", "reason": "...", "revisionMode": "amend|redo", "feedback": "..."}
```
- `decision` must be lowercase: `accept_task`, `confirm_failed`, or `request_revision`
- `feedback` is required when `decision=request_revision` (default: "watcher requested revision")
- `revisionMode` only `amend` or `redo`; invalid values are ignored
- P26 起，watcher prompt 会包含同一 `outputValidation` evidence；若 `ok=false`，watcher 不得返回 `accept_task`

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
6. **Plan draft router 只是确定性浅层 heuristic** — 不调用 LLM，不做语义规划；当前只支持 `single_agent` 和 `parallel_research`。`/playground/team` 只展示 `自动匹配` / `单 Agent` / `并行研究`，planned 模板只保留在 registry 里说明未来方向，不能生成 draft。
7. **可视化 Plan 创建不是本阶段重点** — UI builder 只保留普通计划、discovery → for_each 常见模式和快速 Plan draft 辅助。高级 Plan 结构或复杂任务设计优先通过 Agent 对话 / `team-plan-creator` skill 产出，再由 Team Runtime 执行和审计；不要继续把 `/playground/team` 扩成完整 Plan 编辑器。
8. **for_each parallel 固定容量** — 并行模式使用固定池（容量 3），不可配置；嵌套 for_each 尚未支持。
9. **Controlled decomposition 只支持有界顺序执行** — 运行时只允许 `propagate -> leaf | none`、`leaf -> none`；child task 必须是 normal；不支持并行 child execution、无限传播或 nested for_each。
10. **Decomposition UI 只展示，不编辑** — `/playground/team` 只显示 decomposer badge 和 split hierarchy；不提供可视化编辑器。Run detail API 通过 `taskDefinitions` 暴露由 expansion/decomposition records 汇总出的 generated child definitions；旧 run 或缺少记录的 run 会退回为普通「子任务」分组。
11. **无 AgentTaskExpansionPlanner** — 动态任务扩展目前使用模板展开（`TemplateTaskExpansionPlanner`），尚无 AI 驱动的智能扩展。

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
