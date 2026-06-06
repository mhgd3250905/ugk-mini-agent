# Team Runtime v2

更新时间：2026-06-06

> 2026-06-06 补充：`team_group` Conn 对 mutable Group 的 start failure 诊断已补齐。已保存 Conn 指向的 Group 如果后来变成 empty/invalid，`POST /v1/team/task-groups/:groupId/runs` 返回 400 时 ConnRun 会保持 `failed`，并写入 `resolvedSnapshot.executionType="team_group"`、`groupId`、`groupRunStartStatus` 和 `groupRunStartError`。`/playground/conn` 与 `/playground` Conn manager 的 run detail 会在没有 `groupRunId` 时仍显示 Team Group block、start status/error 和 Group JSON；409 active guard 仍是 succeeded skipped。

> 2026-06-06 补充：Team Task Group definition 现在允许持久化空 Group 或语义 invalid membership。`POST/PATCH /v1/team/task-groups` 只做 title 和 `taskIds` shape 校验，`ResolvedTeamTaskGroup.status/headTaskIds/validation.errors` 是 definition read model；空 Group 会返回 `status="invalid"`、`headTaskIds=[]` 和 `no_head_task`。硬运行闸门移到 `POST /v1/team/task-groups/:groupId/runs`：empty/invalid Group start 返回 400 `invalid task group`，不使用 409。新建 `TeamTaskGroupRun` 会保存 `definitionSnapshot: { taskIds, headTaskIds }`，`refreshGroupRun()` / `cancelGroupRun()` 优先使用该 snapshot membership，旧 run 缺 snapshot 时才 fallback 当前 Group membership。此步不做 typed/control edge 版本化 snapshot，active edge 仍读取当前 store。

> 2026-06-05 补充：Team Task GroupRun 的完成态按 Group 内真实 Task 流水线聚合，而不是按所有诊断 run 一票否决。`entry` / `downstream` Group 成员 run 和内部 typed/control delivery 仍决定 GroupRun 终态；Discovery root 触发的 `discovery-generated` child run 会继续保留在 `observedRuns` 里用于诊断、展示和取消 active run，但 generated child 的 `failed` / `completed_with_failures` 不再把已完成的 Group 主流水线标记为 `completed_with_failures`。既有已落盘终态 GroupRun 不自动回算。

> 2026-06-05 补充：Team Console 运行记录抽屉已收口为状态化历史卡片。每条 run history item 带 `data-run-status`，当前选中行使用 `aria-current="true"` 和更强的 selected 高亮；Discovery 子画布里点击 generated child 打开运行记录后，来源 card 会保留 `is-history-open` 高亮和顶部标记，避免右侧记录面板打开后不知道来自哪个 child。Execution Atlas 的 running / busy 执行态统一使用蓝青色，橙红色继续留给危险、失败或警告语义。

> 2026-06-05 补充：Team Console Discovery 子画布默认隐藏 `stale` generated child。`GET /v1/team/tasks/:taskId/generated-tasks?view=summary` 仍返回 active/stale 非 archived catalog，root Discovery 卡片也继续显示 generated 总数、active、stale 和 blocked 诊断计数；但子画布主 generated grid 只渲染 active items，running/queued/done 和 visible/total 也只按 active 统计。`stale` item 折叠成“显示 N 个旧项”，展开后进入独立 stale lane 用于诊断、reset-to-managed 或归档，不放回 root canvas，也不改变后端 upsert / stale marking 合同。

> 2026-06-05 补充：Conn scheduler Step 05/06 已接入 Team Group 后端执行合同和 Conn UI。Conn definition 新增 `execution: { type: "agent_prompt" } | { type: "team_group", groupId: string }`，旧 Conn 和旧 SQLite row 默认归一化为 `agent_prompt`；`team_group` Conn run 由独立 worker 调主服务 GroupRun API：`POST /v1/team/task-groups/:groupId/runs` 启动，`GET /v1/team/task-group-runs/:groupRunId` 轮询，取消时 best-effort 调 `POST /v1/team/task-group-runs/:groupRunId/cancel`。active guard 的 409 会记录为 succeeded skipped，summary 以 `Skipped:` 开头。Playground Conn manager 和 `/playground/conn` 独立页都能在 `agent_prompt` / `team_group` 间切换；`team_group` 只从 `GET /v1/team/task-groups` 选择后端已有 Group，保存 `execution: { type: "team_group", groupId }`，不把 Group 写进 `target.type`，也不允许选择单个 Task。

> 2026-06-05 补充：Team Console Live API 已接入手动 GroupRun UI。Live backend Group 的展开 frame 会读取 `GET /v1/team/task-groups/:groupId/runs` 的最新 run，显示 `queued/running/completed/completed_with_failures/failed/cancelled` 状态、observed run 数和操作按钮；“运行”调用 `POST /v1/team/task-groups/:groupId/runs`，“终止”调用 `POST /v1/team/task-group-runs/:groupRunId/cancel`。active GroupRun 会轻量轮询 `GET /v1/team/task-group-runs/:groupRunId`，并在启动、终止或进入终态后 silent refresh 内部 Canvas Task run summary；Group 内已有 active Task run 时禁用 Group 运行按钮并显示“内部运行中”。此步仍不接 Conn schema/worker/UI，不改 `src/team/**` 后端 GroupRun contract，不把 GroupRun 合进 `GET /v1/team/console/root-summary`。

> 2026-06-05 补充：Team Task GroupRun 后端 contract 已建立。`TeamTaskGroupRun` 保存到 `.data/team/task-group-runs.json`，schema 为 `team/task-group-run-1`，记录 `groupRunId/groupId/status/source/entryRuns/observedRuns/startedAt/finishedAt/lastError`。新增 `POST /v1/team/task-groups/:groupId/runs`、`GET /v1/team/task-groups/:groupId/runs`、`GET /v1/team/task-group-runs/:groupRunId`、`POST /v1/team/task-group-runs/:groupRunId/cancel`。启动 GroupRun 会先拒绝 active GroupRun 和 Group 内 active Canvas Task run，再同轮启动所有 `headTaskIds`；如果部分 entry 启动失败，会取消已启动 entry run，并把 GroupRun 标记为 `failed`。读取 GroupRun 会递归观察本次 entry 触发的 Group 内 downstream run 和 discovery-generated run；entry 已 completed 但 Group 内 active outgoing typed/control edge 尚无 downstream run 或 attempt delivery outcome 证据时，GroupRun 仍是 `running`，避免 `markRunSucceeded()` 早于 `triggerDownstreamRuns()` 的窗口提前完成。取消 GroupRun 会取消 Group 内所有 active Canvas Task run，不只取消 entry runs。此步不接 Conn schema/worker，不改 Team Console UI，不把 GroupRun 合进 `GET /v1/team/console/root-summary`。

> 2026-06-05 补充：Team Console Live API 已接入后端 Group definition。Live 模式初始加载和“刷新 Task”会读取 `GET /v1/team/task-groups`，画布 Group 由 `ResolvedTeamTaskGroup.taskIds[]` 映射到当前 root Task node 渲染；创建 Group 调 `POST /v1/team/task-groups` 并发送真实 `taskIds`，移除 Group 调 `POST /v1/team/task-groups/:groupId/archive`，不删除 Task、connections 或 Task runs。浏览器 `canvas-ui-state` 在 Live 模式只保存 `taskGroupDisplayStates: Array<{ groupId, collapsed, locked }>`；旧 live `taskGroups[].taskNodeIds` 只用于迁移展示态，不再作为 Group membership 权威数据。Mock 模式仍保留 UI-only Group。此步不做 GroupRun UI/运行按钮/终止按钮，不接 Conn。

> 2026-06-05 补充：Team Task Group 已有第一版后端持久 definition contract。`TeamTaskGroup` 保存到 `.data/team/task-groups.json`，只包含 `groupId/title/taskIds/archived/createdAt/updatedAt` 等业务字段；collapsed、locked、frame rect 和画布位置仍属于 Team Console UI state。Group 创建/更新会拒绝不存在、归档或 generated child Task，并要求 active typed task connection 与 active control dependency 的两端都在 Group 内；stale 边不参与边界闭合和头节点计算。`ResolvedTeamTaskGroup` 会返回 `status`、`headTaskIds` 和 validation errors。本步只提供 `GET/POST/PATCH/archive /v1/team/task-groups` contract，不实现 GroupRun，不接 Conn，不改 Team Console UI。

> 2026-06-05 补充：真实运行排障确认，`task_e1846fa41c83` 从 Team Console 启动时前端已正确发送 `upstreamRunSelections[]`，此前新 run 仍缺 `source.boundInputs[]` 的原因是本地 `ugk-pi` 主后端和 `ugk-pi-team-worker` 仍运行旧进程；Step 01 后端代码提交后必须重启这两个非 watch 进程，不能只刷新 `5174`。重启后，直接 HTTP POST 和 UI 启动的新 run 都会写入 `source.manualUpstreamSelections[]` / `source.boundInputs[]`，验证 run `run_416bd5c5c693` 已 completed 并生成报告。

> 2026-06-05 补充：typed artifact handoff 已收口为 runtime 合同。普通 Task-to-Task artifact 现在会按连接类型优先选择上游 attempt 的 worker public output 机器可消费文件；例如 `json` connection 会优先绑定 `agent-workspaces/<attemptId>/worker/output/*.json` 中可解析为 JSON object/array 的文件。Discovery 上游仍优先 `discovery-aggregation.json`，再 fallback `discovery-result.json`。没有匹配 public output 时才 fallback 到 checker `accepted-result.md`，后者继续作为人类验收摘要和兼容结果。

> 2026-06-04 补充：Step 01 新增的 `upstreamRunSelections[]` 已在 API/read model 层钉死响应形状。`GET /v1/team/task-runs/:runId` 默认/full detail 会保留 `source.boundInputs[]` 和 `source.manualUpstreamSelections[]`，且手动启动的下游 run 不会伪造 `source.triggeredBy`。summary 类响应继续省略 heavy `source.boundInputs`：包括 `GET /v1/team/task-runs/by-task?view=summary`、`GET /v1/team/task-runs/:runId?view=summary`、`GET /v1/team/task-runs/:runId?view=process-summary`、`GET /v1/team/tasks/:taskId/run-history` 和 `GET /v1/team/console/root-summary`；这些 lightweight 响应可保留 `source.manualUpstreamSelections[]` 作为诊断用 trace metadata。run history 仍是分页、summary-only，不新增 endpoint。

> 2026-06-04 补充：Team Console run observer 现在会在手动上游输入 run 中展示独立“输入来源”诊断区。手动启动的下游 run 触发标签仍显示“手动”，不会伪造成 `source.triggeredBy`；诊断区使用 `source.manualUpstreamSelections[]` 显示 `connectionId`、`fromTaskId`、`fromRunId`、`fromAttemptId`、`fromOutputPortId -> toInputPortId` 和 `artifactId`。只有当前展开的 observed run 带 `manualUpstreamSelections[]` 时，前端才额外调用既有 `GET /v1/team/task-runs/:runId` full detail，并只从 `source.boundInputs[]` 派生 artifact `type` / `fileRef` 等轻量 metadata；同一个 opened observer run 内 full detail enrichment 成功或失败都只尝试一次，不随 active run 的 2 秒 process-summary poll 重复请求。full detail 失败不影响 observer，且不把 artifact `content`、完整 artifact 或 preview 写入 `localStorage` / 持久 UI state。

> 2026-06-04 补充：Team Console 已增加 Task 级历史 run 装载 UI 状态，并在手动启动下游 Task 时接入 `upstreamRunSelections[]`。运行记录行提供“装载此记录”/“取消装载”，可见标记为“已装载”；若同一 Task 有 queued/running/paused active run，标记降级为“已装载（活跃 run 优先）”，只保留引用而不把历史 run 展示成当前活跃上下文。该状态只在 Team Console `canvas-ui-state` 中保存 `loadedTaskRunSelections: Array<{ taskId, runId }>`，不保存 artifact/content/attempt/files；当前页面内另有非持久化 loaded run snapshot 用于记住本次从 run history 装载时看到的 status。启动某个 Task 时，前端只查看指向该 Task 的非 stale typed task connection；如果上游 Task 有 loaded run、同一上游 Task 当前没有 active run、且当前内存态未判定该 loaded run 为非 `completed`，才把 `{ connectionId, fromRunId }` 放进 `upstreamRunSelections[]`。缺失 loaded run、stale connection、active upstream run、当前内存态已知非 completed loaded run 都保持普通 run 请求；从持久化 UI state 恢复后状态未知的 selection 交由后端最终校验，不补最新 run、不查询历史、不读取旧 asset。

> 2026-06-04 补充：Discovery dispatcher agent 现在只输出 semantic patch：`itemId`、`title`、`workerInstruction`，以及可选 `itemAcceptanceHints` / `outputContractHint`。实时 runner 会先递归拒绝 `workUnit`、`outputContract`、`acceptance`、worker/checker/source identity 等越界字段，再由本地 deterministic compiler 使用 `DiscoveryDispatchInput + semantic patch` 生成最终 `workUnit`。`TeamRoleRunner.runDiscoveryDispatcher()` 对 `DiscoveryRunLifecycle` 的成功返回 shape 仍是 `{ ok: true, itemId, workUnit, runtimeContext? }`；`workUnit.outputContract.text` 和 `workUnit.acceptance.rules` 由 compiler 保底生成，不再依赖模型输出完整 WorkUnit。Discovery pipeline、generated Task upsert schema、单 dispatcher producer 和固定 3 并发 generated run queue 均不变。

> 2026-06-04 补充：Discovery dispatch / generated auto-run pipeline 已按 producer/consumer 边界收口。root worker/checker 通过并写出 `discovery-result.json` 后，runtime 使用单 dispatcher producer 顺序消费 raw `items[]`；每个 item upsert 出 active generated Task 后会立即 enqueue 到独立 generated run queue。generated run queue 固定 3 并发消费，不等待全部 items dispatch 完才启动 child run。因此任一时刻的设计上限是 `1` 个 dispatcher producer + `3` 个 generated child runs。`attempt.discoveryDispatch` 和 `attempt.discoveryGeneratedRuns` 会随进度增量写入；缺失/blocked item 和 stale marking 语义不变。root 仍必须等 dispatch producer、stale marking、generated run queue drain 和 `discovery-aggregation.json` 写入后才 `completed` 并触发 typed downstream；取消 root 会停止后续 dispatch/launch，并取消已启动的 generated child runs。

> 2026-06-03 补充：Team Console refresh API 尾项已收口。`GET /v1/team/console/root-summary` 一次返回 root Tasks、source/connection/dependency basic、root latest run summary、deleted ids 和独立 `serverVersion.taskCatalog` / `serverVersion.taskRunSummary`；前端初始加载和手动刷新优先消费该 endpoint，旧拆分请求保留 fallback。`GET /v1/team/tasks/:taskId/generated-tasks?view=summary&since=<iso>` 返回 changed generated child summaries、`deletedTaskIds` 和 `serverVersion`；打开 Discovery 子画布后 generated catalog 和 child/root run summary 都按 cursor 增量刷新，空增量不会清空已打开子画布。

> 2026-06-02 补充：Canvas Task 独立 run 的 worker/checker phase timeout 已改为 adaptive idle timeout + hard cap。worker/checker 的既有 phase timeout 值现在作为 idle 窗口：只有 `tool_execution_end` 或 role public output 目录中文件新增/变化这类结构性进展会刷新 idle 窗口；普通文本输出和 thinking delta 不续命。worker hard cap 默认 60 分钟，checker hard cap 默认 30 分钟，hard cap 到点会强制失败，即使期间持续有工具完成事件。timeout 失败会在 attempt failed result 中写入 `timeoutType`、`idleMs`、`hardCapMs`、`elapsedMs` 和 `lastStructuralActivityReason`，便于区分“真的没结构性进展”和“被总时长兜底截断”。

> 2026-06-04 补充：Canvas Task 独立 run 由主服务进程内的 `CanvasTaskRunService` 后台执行，不由 `ugk-pi-team-worker` lease/reclaim。服务进程重启或后台执行链路丢失后，历史 `queued` Canvas run 会在 Team routes 注册时重新启动；历史 `running` Canvas run 会被收口为 `failed`，`lastError="canvas task run interrupted before completion"`，避免无后台执行者的 run 长时间假运行。

> 2026-06-03 真实运行验证：用户从 Team Console 启动 Discovery root Task `task_99e064aea8e3`，root run 为 `run_d5f4d7975885`，root attempt 为 `attempt_3ac49ea2c5af`。root worker 在多轮 SearXNG/bash 工具完成后正常进入 checker 并 `succeeded`，未被旧固定 15 分钟窗口误杀；root attempt 写出 `accepted-result.md`、`discovery-result.json`、`checker-verdict-001.json` 和 `worker-output-001.md`。dispatcher 随后创建 10 个、更新 4 个 generated Tasks，并将 9 个旧 generated items 标记 stale；auto-run pool 以固定并发 3 启动本轮 generated child runs。观察到 child `task_071756d4a504` 的 worker 在早期工具结束后继续产生新的 `tool_execution_end`，idle 窗口被刷新，最终从 `worker_running` 进入 `checker_reviewing`，证明 adaptive idle 在真实 run 中按结构性进展续命。

> 2026-06-03 补充：Team Task 已支持模板 Task、复制和 UI-only Group。模板通过 `templateConfig` 描述参数，`/team-task` skill 必须使用 `{{parameterId}}` 占位并在预览确认后走 `POST /v1/team/tasks`；实例化/复制走 `POST /v1/team/tasks/:taskId/clone`，带 `templateBindings`，只复制 Task 定义，不复制 run history、active run 或 generated child。普通工具型 Task 也可通过同一路由复制并改名；generated Task 不允许走 root clone route。Team Console Task 菜单新增“复制”面板；Execution Atlas 可从框选的 root Task 创建 UI-only Group，Group 仅保存到 canvas UI state，支持折叠/展开成员 Task，不写后端 Task 数据。

> 2026-06-03 补充：模板 Task 本体现在可以直接运行。`templateConfig` 只描述参数 schema/default/required；当前/最近参数独立保存在 `templateState.currentBindings`，旧模板缺该字段按空状态读取。`POST /v1/team/tasks/:taskId/runs` 可接收 per-run `templateBindings`，显式 override 会保存为当前参数；未传 override 时使用当前参数和 parameter default。缺 required 参数返回 400，Team Console 会打开“参数”面板而不是启动 run。每次 run 都在 `source.templateBindings` 记录当次快照，后续修改当前参数不会改写历史 run；生成 plan、worker prompt、workUnit、Discovery `discoveryGoal/dispatchGoal`、output contract 和 acceptance 时必须使用绑定后的值，不得把 `{{parameterId}}` 泄漏到执行输入。真实验证锚点：模板 Task `task_ae82bc41efad` 通过参数面板填写 `keyword=Minimax M3是不是很糟糕` 后启动 run `run_83673cbd8acc`，`source.templateBindings`、`plan.json` 和 worker 首条 prompt 均已使用绑定值；worker 后续把搜索词简化为 `Minimax M3` 属于执行 Agent 搜索策略，不是 runtime 绑定失败。

> 2026-06-03 补充：Team Console Discovery 子画布刷新已收口为 scoped subscription。live 初始加载、手动刷新和 root active run 基础轮询不会默认请求 generated catalog 或 dispatch diagnostics；只有打开某个 `Discovery 子画布` 时，才按该 `discoveryTaskId` 独立读取 `GET /v1/team/tasks/:taskId/generated-tasks?view=summary`、root/generated latest run summary 和 `view=dispatch-diagnostics` attempts。多个 Discovery 子画布同时打开时按 ID 分别刷新；关闭其中一个后，该 ID 的迟到 response 会被忽略，不影响仍打开的子画布。generated child observer 继续使用 `GET /v1/team/task-runs/:runId?view=process-summary&taskId=:taskId`，只有展开 observer 时才读取过程摘要。

> 2026-06-03 补充：Team Console Live API refresh 的前端合并已开始保持引用稳定。root Task catalog、root/generated run summary 和 Discovery generated summary 在内容未变化时复用旧对象，减少 Execution Atlas 因后台 summary refresh 触发的大面积重渲染；已 lazy fetched 的 generated full detail 不会被轻量 summary 覆盖。root Task 从 live catalog 删除或归档后，对应 root run state 会清理。`GET /v1/team/tasks?since=<serverVersion>` 和 `GET /v1/team/task-runs/by-task?...&since=<serverVersion>` 已接入第一版增量 contract，返回 changed items、删除占位和新的 `serverVersion`；Discovery child summary 的增量语义仍未接入。

> 2026-06-02 补充：Team Console Discovery 子画布的 generated catalog 首屏加载改为 summary view。`GET /v1/team/tasks/:taskId/generated-tasks?view=summary` 只返回卡片展示、状态排序和 `canResetToManaged` 所需轻量字段，不返回 `workUnit`、`latestManagedWorkUnit`、`generatedSource.itemPayload` 等 heavy detail；默认无 `view` 仍返回 full generated Tasks 以保持兼容。5174 打开子画布时消费 summary，编辑 generated Task 前再 lazy fetch `GET /v1/team/tasks/:generatedTaskId` 取得完整 Task；full detail 请求按 `dataSource:taskId` 去重，summary refresh 不覆盖已经取得的 full detail，full detail 失败会清理半开编辑状态并允许下一次点击重试。

> 2026-06-02 补充：Canvas Task run history 现在有用户可见的 Task 级入口。`GET /v1/team/tasks/:taskId/run-history` 返回 summary-only 历史列表并合并 `.data/team/task-runs/run-annotations.json` 中的 best / archived / note；`PATCH /v1/team/task-runs/:runId/annotation` 只写标注索引，`best=true` 会清除同一 Task 其他 run 的 best。真实过程、attempt metadata、result 和文件内容仍来自 `.data/team/task-runs/runs/<runId>` 及既有 attempts/files API；软归档只隐藏默认历史列表，不删除 run 目录。

> 2026-05-31 补充：Team Console Live API 在 Discovery root run 进入终态后，会继续用有限延迟刷新追踪 `GET /v1/team/tasks/:taskId/generated-tasks` 和 generated child run summaries；打开 `Discovery 子画布` 时也会主动刷新并启动同一组延迟刷新。这个机制用于覆盖 root 完成后 dispatcher / generated child auto-run 晚到数十秒到数分钟的窗口，避免用户看到空子画布或旧 run 状态。它只消费既有只读 catalog/run API，不新增 backend endpoint，也不把 generated child 放进 root task list/root canvas。

> 2026-06-01 补充：Team Console Run observer 文件详情会先嗅探内容本身。内容去掉首尾空白后以 `{` 或 `[` 开头、且能解析为 JSON object/array 时，会优先按 JSON pretty print 渲染，即使文件名是 `accepted-result.md`；普通 Markdown 仍走安全 Markdown 渲染，避免 Discovery generated child 的 JSON 结果被 Markdown 链接化或压成不可读长行。

> 2026-06-01 补充：Canvas Task run 对 Discovery root 的终态语义按整棵 Discovery 画布计算。root worker/checker 通过后，root run 会继续保持 active，直到 dispatcher 完成 generated child catalog 写入、固定 3 并发 auto-run pool 中的 generated child run 全部结束，才标记 root run `completed` 并触发 typed downstream / control downstream。这样下游 Task 不会在 generated child 仍运行时提前消费 Discovery root output；取消 root Discovery run 时，会级联取消本轮自动启动的 generated child runs，并停止继续启动后续 queued items。Discovery root 触发 typed downstream 时，优先交付 `discovery-aggregation.json` artifact；它汇总 root `discovery-result.json` 的 item 清单、dispatcher outcome、generated child run 状态和每个 child 的 accepted result 内容。`discovery-result.json` 仍是 root 发现阶段的标准来源清单和旧 run fallback，不再是存在 generated child 时传给下游的最终 JSON。即使 accepted result 只是 `worker/...json` 工作区文件引用，下游 `json` input 也会收到稳定、可追溯的 run-scoped JSON fileRef 和内容预览，而不是私有 worker 相对路径字符串。普通 Task 的下游触发语义保持不变。Team Console 的 `Discovery 子画布` 会把有 active generated run 的 child 排在顶部。

> 2026-06-01 补充：Canvas Task role session 会注入 `ARTIFACT_PUBLIC_DIR` 和 `ARTIFACT_PUBLIC_BASE_URL`。需要交付或让 checker 访问的文件必须写入 `ARTIFACT_PUBLIC_DIR`，对外链接必须基于 `/v1/team/task-runs/:runId/artifacts/:roleKey/:role/...`，不要再启动临时 `localhost` 文件服务。Task run 的 `source.publicBaseUrl` 会从配置或请求 host/proto 推导；`PUBLIC_BASE_URL=auto` 表示自动推导。

> 2026-06-01 真实运行验证：用户从 Team Console Live API 重新运行 Discovery root Task `task_c70580219a00`，root run 为 `run_614c9ccdb9f8`。本轮 root 发现 17 个 item，dispatcher/upsert 17 个 active generated Task 且 0 blocked，固定 3 并发 auto-run pool 启动全部 17 个 generated child。最终 12 succeeded、5 failed，root 在所有 child 终态后才 `completed`，并写出 `discovery-aggregation.json`；aggregation summary 为 `totalItems=17`、`generatedTasks=17`、`succeeded=12`、`failed=5`、`missingResult=0`。失败集中在 worker timeout、模型侧 `data_inspection_failed` 和 checker 抓出的伪造/不可验证输出，不是 root gating 或 aggregation handoff 问题。

本文档是 Team Runtime v2 的唯一权威源。v0.1 域名调查历史见文末归档章节。

## 当前目标

提供 plan-driven sequential multi-role pipeline：给定一个 Plan（有序任务列表 + 验收标准），系统自动按 worker → checker → watcher → finalizer 四角色流水线顺序执行每个 task，产出结构化结果和汇总报告。

## 当前状态

- v2 基础链路已验证通过（mock + 真实 runner）
- AbortSignal 全链路传播：cancel/pause 能中断正在执行的 agent session
- 真实 runner smoke test：`run_1c54aaa7e442`，status: completed，P0_REAL_RUNNER_OK
- 最新验证：P26 output contract validation 已覆盖 deterministic validator、真实 orchestrator regression、`npm run test:team` 和 `npx tsc --noEmit`
- 独立 Team Console 前端预览已建立（`apps/team-console/`），使用 Vite + React + TypeScript，实现纵向 Execution Map 原型。当前 `/playground/team` 仍是生产入口，Team Console 不替换任何现有页面。
- Team Console 默认使用浅色主题：沉浸式 atlas 画布、画布内 toolbar、根卡片、底部 Dock、Task 操作菜单、`创建 Task` leader picker、Task/Agent 分支面板、Discovery 子画布、generated child card、Agent workspace 面板、对话气泡、composer、资产行和归档确认 modal 都以浅色表面呈现；Task 运行中仍保留暖橘红状态色，Task 默认琥珀、Agent / Source 青绿色继续作为身份和状态辅助色。页面不再渲染外层 header；明暗主题切换按钮和数据来源选择收进画布 toolbar 右侧，使用 `ugk-team-console:theme:v1` 在浏览器 `localStorage` 中保存 `light` / `dark`，默认浅色；深色模式通过 `[data-theme="dark"]` override 恢复原暗色层级。主题入口集中在 `apps/team-console/src/app/App.tsx`、`apps/team-console/src/app/app.css` 与 `apps/team-console/src/graph/execution-map.css`，静态契约测试在 `apps/team-console/src/tests/app-static-contracts.test.ts`。
- Team Console Vite dev server 默认以同源代理承载 Live API 和嵌入式主 `/playground` iframe：`/v1`、`/playground`、`/assets`、`/runtime`、`/vendor` 等路径转发到 `TEAM_CONSOLE_API_TARGET`（手动 `npm run dev` 默认 `http://127.0.0.1:3000`，本地 Docker Compose 固定服务 `ugk-pi-team-console` 使用 `http://ugk-pi:3000`），但该后端目标不再暴露给浏览器端 iframe。`http://127.0.0.1:5174/` 是本地 Team Console 固定入口，随 `docker compose up -d` 由 Docker 管理；远程 FRP 访问 `http://<host>:5174/` 时，iframe 默认仍使用相对 `/playground?...`，避免浏览器误连用户自己机器的 `127.0.0.1`；只有显式设置 `VITE_TEAM_CONSOLE_PLAYGROUND_BASE_URL` 时才使用独立公网后端 origin。
- Team worker 的 agent bash 环境与 Chat、Conn worker 共用 `/app/.runtime-deps/python-venv-linux`，通过 compose 持久挂载到 `${UGK_RUNTIME_DEPS_HOST_DIR:-./.data/runtime-deps}`；Team agent 正常执行 `python` / `pip install` 即命中共享 venv，不需要按入口区分 Python 包安装位置。系统级工具仍必须进 `Dockerfile` 并重建镜像。
- Team Console preview 的 Live API 模式已真实接线：切换后默认停在干净 `Agent workspace`，只加载 Agent catalog/status，不会在刷新或重新进入时自动渲染历史 run，也不再显示旧的 live 运行图切换条。Mock fixture 切换栏也从页面移除，Plan run 旧视图只保留在 mock 数据和测试中作为回归入口；Live API 主路径以 Agent / Task workspace、Canvas Task run 和 Task refresh 为准。点击 task 时会通过现有只读 attempt API 读取 `TeamAttemptMetadata` 和 attempt file。当前不调用 pause/resume/cancel、manual disposition、rerun 或任何写接口。
- Team Console preview 的 Agent 能力已收口为 Agent Atlas：通过 `GET /v1/agents` 读取主项目 Agent catalog，并通过 `GET /v1/agents/status` 读取每个 Agent 的真实空闲 / 运行中状态；Agent 节点加入同一张 Execution Atlas，复用网格、节点样式、滚轮缩放和画布平移能力，卡片状态条与状态 pill 会随真实运行态显示空闲、运行中或状态未知；Agent / Task 根卡片内的 id chip 可点击复制，默认只显示实际 id 且边框按内容收缩，复制成功后同一位置短暂显示 `已复制`，复制按钮会阻止父卡片点击，避免误打开 Agent 分支或 Task 菜单；Agent 根卡片会为底部 model/browser binding 预留完整内边距，不允许 binding 贴到卡片边框；Task 运行中状态使用暖橘红边框、状态条和 pill 脉冲，区别于普通 ready / completed 状态。默认 Mock 入口是干净 `Agent workspace`，不显示旧 demo run。画布内同一 `agentId` 只能出现一次；普通画布态可拖拽 Agent / Task 卡片，按住 Shift 在空白画布框选可选中多个 Agent / Task 节点并整体拖动（空白画布左键长按也可触发框选）；顶部 segmented filter 可按 `ALL / Agent / Task` 分类过滤可见根节点，底部 Dock 承载已收纳根节点；Live API 下已添加 Agent 与拖动后的画布位置会写入浏览器 `localStorage`，刷新后恢复；当前画布 viewport、已展开 Agent / Task 分支、底部 Dock 收纳状态和 segmented filter 选择也会保存到 Team Console 专用 UI state，并在刷新后按当前 catalog 校验恢复，这只保存画布引用，不修改真实 Agent profile 或 Task 定义。Agent 或分支节点向右拖动时只改变画布内世界坐标，不允许撑开外层页面宽度或带动画布 pan。单击 Agent 节点会展开 Agent 分支卡片，而不是进入特殊 Focus 视窗；普通节点层、其他 Agent、runtime nodes、links、evidence 和添加入口继续显示；右侧 `+ / - / 1:1 / 100%` 缩放控件已移除，画布仍支持鼠标滚轮缩放和拖动平移。点击同一 Agent 节点会收起该分支，点击另一个 Agent 节点会切换分支。分支卡片按上层浮窗处理，不再为了避让周围节点自动右移，允许覆盖其他节点；用户可拖动画布、拖动分支标题栏移动分支，并可从右下角调整分支宽高。对话分支支持标题栏双击最大化到全浏览器 viewport（`position: fixed; inset: 0`），还原同样通过标题栏双击完成，没有单独的还原按钮；`收起` 是关闭分支，不等同于还原。Agent 分支、Task Leader 分支和创建 Task 分支三类对话分支均支持此行为。还原后回到原画布节点。分支位置使用画布世界坐标，允许拖过原点上方或左侧；拖动分支标题栏不会带动画布平移。Agent 到分支的连接线统一使用节点右侧中点到目标左侧中点的短 hook 曲线。分支内部是主项目 `/playground` iframe，URL 形如 `/playground?view=chat&agentId=<agentId>&embed=team-console`；Team Console 不再维护本地 transcript + composer，也不再复制 scoped chat stream/state/history/queue/interrupt/file library。主 `/playground` 读取 `agentId` URL hint 进入对应 Agent，`embed=team-console` 下会把 iframe 顶部 Agent 标签锁定为只读标识，关闭 hover 切换菜单和点击跳转，并且不会把 iframe 内 Agent 切换写入主页面共用的 active-agent localStorage，因此主 Agent 卡片打开主 Agent 对话，搜索 Agent 卡片打开搜索 Agent 对话，且互不污染；iframe 内路由跳转继续由主项目自己处理。该能力只引用现有 Agent profile，不创建 clone、instance、overlay 或画布局部技能安装，不把 Agent 节点本身变成 Plan 编排；仍不接 artifact preview，不处理移动端 toolbar / 添加入口专项修复。
- Team Task 后端契约已建立：`Task` 是 Team Console 画布上的独立最小编排节点，内部包含一个 `workUnit`，不复用 `Plan tasks.length === 1`；`leaderAgentId` 负责运行前和用户澄清边界并维护 WorkUnit 草案，`workerAgentId` / `checkerAgentId` 分别代表未来真实执行和验收 Agent。主项目新增 `/v1/team/tasks` REST API 和 `.pi/skills/team-task-creator/SKILL.md`；skill 只能在 `/team-task` 显式触发后创建 / 更新 Task draft，必须先展示完整 Task JSON 并等待确认，不启动 run，不解析 iframe 聊天文本，不修改 Agent profile、模型、browser binding 或技能安装逻辑。Team Console 画布 UI 的前端消费边界见下一条。
- `/team-task` runtime skill 是 Task 设计向导，不是字段收集表。它必须先把用户的口语化需求判断为更适合普通 Task 还是 Discovery Task，并说明推荐理由；多平台 / 多来源 / 多候选项调研自然语言默认推断为 Discovery Task 候选，例如“调研某个产品或模型在多个社区、代码托管和模型托管平台上的用户反馈和评价”。用户不需要知道或编写 `canvasKind`、`discoverySpec`、`outputKey` 或 item schema；skill 负责从对话和 active Agent catalog 推导并补齐合法 Discovery payload，只对真正缺失的 Agent 角色、来源边界、输出格式或验收规则做少量针对性追问，最后仍必须展示完整 JSON preview 并等用户显式确认后调用既有 `POST /v1/team/tasks`。这是一条通用任务形态规则，不是针对某个产品、站点或平台的补丁。
- Team Console “创建 Task”选择的 leader Agent 可能是自定义 Agent profile；这类 Agent 使用自己的 `.data/agents/:agentId/user-skills` 或 `.data/agents/:agentId/pi/skills` 副本，不一定自动读取主 `.pi/skills/team-task-creator` 的最新内容。更新主 skill 后，如果真实 iframe 仍表现为旧字段表流程，先查 `GET /v1/agents/:agentId/skills` 和 `GET /v1/agents/:agentId/debug/skills`；需要同步时走 `POST /v1/agents/:agentId/skills` 重新复制主 Agent 当前 skill，不要手工编辑 `.data`。
- 本地 Docker Compose 的主服务运行 `npm start` / `tsx src/server.ts`，不是 watch 模式；修改 `src/team/**` 路由/store 或 `.pi/skills/team-task-creator` 后，真实 `5174` Live API 验证前必须至少 `docker compose restart ugk-pi ugk-pi-team-worker`。如果 `POST /v1/team/tasks` 返回 201 但新 Task 缺少 `canvasKind` / `discoverySpec`，或普通 Task 的 `PATCH discoverySpec` 被静默 200，优先怀疑旧 `ugk-pi` 进程还没重启，别继续怪 skill。
- Team Console preview 现在会消费 `GET /v1/team/tasks` 作为 Task catalog：Task 内部包含一个 WorkUnit，Atlas Task 卡片展示 leader Agent、worker Agent 和 checker Agent。点击 Task 后先展开紧凑操作菜单节点，菜单只保留操作按钮和紧凑运行摘要。多个 Task 的菜单可以同时展开，每个 Task 的编辑、参数、Leader chat 和 Run observer 作为按 Task 独立的二级 panel 同时存在；打开新 Task 的二级 panel 不会关闭或替换其他 Task 已展开的二级节点。Task 操作菜单中的所有二级入口（"编辑""参数""对话 Leader""最近运行"）统一具备 toggle 行为：再次点击同一入口会收起当前二级节点回到菜单状态，第三次点击重新展开；toggle 只作用于被点击的 Task branch。模板 Task 点“运行”时，如果 required 参数缺失，会打开参数面板并阻止 run；已有当前参数或默认值时直接调用 `POST /v1/team/tasks/:taskId/runs`。参数面板保存会 PATCH `templateState.currentBindings`，保存并运行会带 `templateBindings` override 启动 run；这些参数状态不写入 canvas layout、dock、group 或 run history UI state。打开编辑节点时只在没有现存 draft 时初始化 draft，toggle 收起再展开不会丢失未保存的编辑草稿。编辑草稿（`taskEditDraftByTaskId`）、参数草稿、保存中状态和冲突警告按 `taskId` 隔离存储，多个编辑节点互不覆盖。Run observer panel id 稳定命名为 `run-observer-${branch.nodeId}`，不随打开数量变化，确保拖动位置在后续操作中保持。”运行”调用独立 Canvas Task run API，后端把 run 存到 `.data/team/task-runs/runs/<runId>`，不进入 `/v1/team/runs` 的 Plan run 列表，也不把 Task 转换成持久化 Plan；第一版只执行 WorkUnit 的 worker → checker，不启动 watcher/finalizer。菜单会展示最近 Task run 状态，active run 通过 `GET /v1/team/task-runs/:runId` 轮询，停止调用 `POST /v1/team/task-runs/:runId/cancel`。点击菜单里的”最近运行”或”运行中”摘要会展开或收起 Run observer。Run observer 使用单个合并 `run-observer` 面板，而不是多个独立 canvas 子节点。合并面板内部固定顺序为：worker 过程 → worker 输出文件 → checker 过程 → checker 输出文件 → result 文件。文件条目以紧凑行（`.emap-observer-file-row`）展示在合并面板内部，而不是单独的 canvas 节点。点击文件行会在右侧展开第二级文件详情面板，根据文件扩展名使用安全渲染（JSON pretty print、Markdown 使用 `marked` 安全渲染、文本原样展示），不执行原始 HTML，不注入 script；Markdown 渲染通过 `apps/team-console/src/shared/markdown.ts` 的 `renderTeamMarkdown()`，配置与主项目 `src/ui/playground-markdown.ts` 一致（GFM tables、HTML 转义、只允许 http/https 链接、`target="_blank" rel="noreferrer noopener"`）。过程部分消费 additive contract `attempt.roleProcesses.worker` / `attempt.roleProcesses.checker`，按优先级展示 `assistantText.content`（Agent 自述 / 推理文本），缺失时回退到 current action + 最新 narration；前端不再渲染下半部 tool / method 调用明细。完整过程数据仍来自后端 attempt metadata，前端只隐藏 DOM 明细。缺少 `roleProcesses` 时前端保持兼容渲染等待态，不影响菜单运行摘要、文件行和文件详情。合并 observer 面板支持拖动：拖动 Task 根节点会以相同 dx/dy 移动菜单及已展开的 observer 面板和文件详情面板；拖动菜单节点同样带走 observer 和文件详情；拖动 observer 面板只移动自身；拖动文件详情叶子节点只移动自身。编辑节点的拖动把手在标题栏，表单控件区域不参与拖动。所有拖动系统使用延迟 pointer capture：pointerdown 时不调用 setPointerCapture，只有 pointermove 距离超过 4px 阈值后才捕获 pointer。连接线使用 fixed right-middle 到 left-middle 锚点，反向角度时自动重路由，source 出线端显示吸附在卡片右边缘的半圆 socket，target 入线端不再显示圆环或圆点。文件详情节点支持右下角拖动调整宽高，最小尺寸 360×280；详情内容区无固定 max-height 限制。Task 操作菜单、编辑节点、参数节点、Leader 对话节点、Run observer 面板被用户手动拖动后，在同一页面会话内收起再展开时会保留上一次的画布世界坐标位置；可 resize 的编辑节点和 Leader 对话节点调整尺寸后收起再展开也会保留上一次尺寸。拖动后子节点 connector 使用节点 final rect 位置，不会残留旧坐标。节点轮询 `GET /v1/team/task-runs/:runId` 读取 run state、attempt metadata 和 attempt files，当前使用轮询不接 SSE。”编辑”只允许浅改 Task 名称、leader Agent、worker Agent、checker Agent，并作为菜单右侧二级节点展开；”对话 Leader”同样作为二级节点打开 `/playground?view=chat&agentId=<leaderAgentId>&embed=team-console&teamTaskId=<taskId>&teamTaskMode=edit` iframe，并复用 Agent 分支卡片的 header、iframe、右下角 resize handle 和最大化按钮。Leader 对话分支打开时不再展示完整 Task context 预览文本，只在 header 右侧提供”复制 Task 上下文”按钮；按钮会把 taskId、title、status、agents、input text、input/output ports、output contract、acceptance rules、teamTaskMode、teamTaskId 复制为格式化纯文本。复制优先使用 Clipboard API，远程 HTTP 非安全上下文自动 fallback 到隐藏 textarea + `execCommand("copy")`；两种路径都失败时显示”复制失败”状态提示，并临时展开一个小型只读文本框自动选中上下文，用户可按 Ctrl+C 手动复制。连接线使用 fixed right-middle 到 left-middle 锚点，并显示同一套 source 半圆 socket 标记。”删除”二次确认仍留在一级菜单里，确认后调用 `POST /v1/team/tasks/:taskId/archive` 软归档并刷新。浅编辑保存使用 base snapshot + dirty fields：只 PATCH 用户实际改过的字段，worker/checker 变更会基于最新 Task catalog 合成完整当前 `workUnit`，同字段后台刷新冲突会阻止保存并提示重新打开编辑节点。Live API 工具栏的”创建 Task”和”刷新 Task”收纳为 Task 操作组，Agent / Task 数量以统计 pill 展示。Live API 工具栏的”创建 Task”只负责选择 leader Agent 并打开 `/playground?view=chat&agentId=<leaderAgentId>&embed=team-console&teamTaskMode=create` iframe；真正创建和复杂 WorkUnit 更新仍由 `/team-task` skill 完成。Team Console 不解析 iframe 聊天文本创建 Task，不把 Task 定义或 Task run 状态写入 localStorage；Live API 下只持久化 Task 卡片的画布位置，手动刷新、关闭创建分支、浅编辑保存、参数保存和归档成功后会重新请求或本地合入 `GET /v1/team/tasks` 的 Task 事实。
- Team Console Task run observer 使用单个合并 `run-observer` 面板，而不是多个独立 canvas branch node。合并面板内部固定顺序为：worker 过程 → worker 输出文件 → checker 过程 → checker 输出文件 → result 文件；视觉上按阶段流展示，过程区不再像独立小卡片堆叠。Worker / Checker 过程段固定高度并在段内滚动，使用符合主题的细滚动块（worker 偏青色，checker 偏金色），observer 外层不显示滚动条并按实际内容高度自适应测量，让画布连接线跟随真实节点高度。文件条目以紧凑行（`.emap-observer-file-row`）展示在合并面板内部，而不是单独的 canvas 节点；只有实际存在文件时才渲染对应文件 tray，运行刚开始时空的第 2 / 4 / 5 段不显示“暂无文件”占位。过程部分消费 Canvas Task run attempt metadata 的 additive frontend contract：`roleProcesses.worker` / `roleProcesses.checker`；旧 Live API attempt 缺少 `roleProcesses` 时显示等待过程数据，role process 为 `null` 或条目为空时显示暂无过程条目。过程部分按优先级展示 `assistantText.content`（Agent 自述 / 推理文本，`formatAssistantText()` 保留换行、中文标点自然断句、每行独立 `<p>`，最新行显示在顶部，旧行向下隐藏；最多 5 行超限显示"已隐藏 X 行"，单行超过 200 字符会截断并显示"已截断 X 长行"，`max-height: 172px` 内部滚动），`assistantText` 缺失时回退到 current action + 最新 narration；前端不再渲染下半部 tool / method 调用明细，也不显示 tool group 折叠区或隐藏计数。完整过程数据仍来自 attempt metadata，前端只隐藏 DOM 明细，不改后端过程存储。运行中的 observer 不渲染空文件占位节点，不显示 `正在刷新...` / `最后刷新` 这类随轮询变化的刷新元信息，active run 轮询的瞬时连接失败不插入红色错误节点，以保留现有画面稳定性；终态 run 的读取失败仍显示错误。拖动 Task 根节点、菜单节点或 resize 文件详情时，前端会暂停 Task branch / child panel 的自动高度测量，避免运行中轮询刷新强制 layout 导致卡顿和闪烁。节点间连接线使用单条连续 cubic：source 固定右侧出线，target 固定左侧入线；反向角度只通过两端水平控制柄表达出入线，不再拆成多段 hook，避免近距离斜向连接出现切角。source 出线端显示吸附在卡片右边缘的半圆 socket：typed Task connection 使用绿色 socket，Agent 分支偏青色，Task 分支偏金色；target 入线端不再画标记。连接线中点切断按钮的 `left/top` 是连接点本身，按钮用 CSS `translate(-50%, -50%)` 居中，避免偏纵向线段上出现固定 offset 偏移。当前仍使用现有 run state / attempt metadata / attempt file API 轮询，不接 SSE，不新增 endpoint，不改后端过程存储。
- Team Console Typed Task Chain V1 已建立最小积木契约：Task 可声明 `inputPorts` / `outputPorts`，port 使用稳定 `id` 和类型字符串 `type`；connection 持久化为 `fromTaskId/fromOutputPortId -> toTaskId/toInputPortId`，后端创建时校验 Task 存在、未归档、port 存在、`output.type === input.type`、非自连接、非重复且不会形成环。上游 Canvas Task run 成功并通过 checker 后，`accepted-result.md` 会被封装为 typed artifact（type、source task/run/attempt、fileRef、preview、content），再作为 `boundInputs` 写入自动启动的下游 Task run；下游 prompt 明确收到绑定输入，不靠 Agent 猜文件路径。V1 只跑 typed port 连接和自动下游触发，不做自由画布复杂编排、条件分支、循环、SSE 或真实 TTS。
- Team Console Canvas source input 后端契约已建立：source node 持久化为独立画布输入节点，source connection 只表示 source node `value` output 到 Task input port 的绑定。直接点击 Task “运行”时，`POST /v1/team/tasks/:taskId/runs` 会把 active source connection 注入 `state.source.boundInputs[]`、worker/checker payload 和 prompt；source node 不伪装成 Task artifact，不写 `sourceTaskId` / `sourceRunId` / `sourceAttemptId`，也不会自动触发下游 Task run。
- Team Console Canvas source 前端已接入 Live API：工具栏”文本输出”创建可编辑 `string` source node，”文件输出”通过浏览器文件选择器创建 file source 并按扩展名推断 `md` / `json` / `html` / `string` / `file`。Source 节点是独立根节点，可拖动、框选、连到同类型 Task input port，并可收纳到底部 Dock；本地只保存 source 节点坐标和 Dock 收纳 id，不保存 source 内容。Agent 对话分支、Task Leader 对话分支、创建 Task 对话分支和 observer 文件详情面板支持标题栏双击最大化 / 还原，最大化覆盖整个浏览器 viewport（`position: fixed; inset: 0`），没有单独的还原按钮，还原靠标题栏双击；原有标题栏拖动和右下角 resize 行为保持不变。
- Team Console Execution Atlas 根卡片清理入口已收口为垃圾桶 drop target：Agent / Task / Source 根卡片不再提供直接”归档”或”移除”按钮，根节点清理统一通过拖入右下角垃圾桶触发确认 modal。Source 和 Task 确认后分别调用 `POST /v1/team/source-nodes/:sourceNodeId/archive` 和 `POST /v1/team/tasks/:taskId/archive`，归档成功后根卡片、Dock 条目、相关连接线、展开分支和本地 UI 状态同步清理。Agent 确认后只从 Team Console 画布移除本地引用，不会调用 Agent profile archive API。归档失败时节点保留并在顶部 error banner 显示错误信息。Task dependency handle 已从右下角裸文本 `dep` 改为右侧中部的 amber 圆形 socket，有语义化 aria-label 区分”设为依赖源”、”设为依赖目标”和”已选依赖源”三种状态。Control dependency 渲染的 dashed amber 线 source 端有半圆 socket，中点有切断按钮可直接删除。
- Team Console Discovery runtime 已接通到 generated Task 自动执行：`POST /v1/team/tasks` 可创建 `canvasKind="discovery"` 的 root Task 并保存 `discoverySpec`，`GET /v1/team/tasks/:taskId/generated-tasks` 只读返回该 Discovery root 下的 active/stale generated Task catalog；Discovery root 的 Canvas Task run 会按 runtime `type="discovery"` 执行、持久化标准 `discovery-result.json`、调用 dispatcher 创建/复用 generated Tasks、标记 stale，并对本次 dispatch 成功且仍 active/ready 的 generated Tasks 通过固定 3 并发池自动启动 Canvas Task runs。public POST/PATCH 仍拒绝 `generatedSource`，避免调用方伪造 generated Task 身份。
- Discovery generated Task reset-to-managed 契约和 5174 子画布 UI 已接入：`TeamGeneratedTaskSource.latestManagedWorkUnit` 可选保存最新 managed WorkUnit snapshot；Discovery rerun 会在 managed/customized 两条路径都刷新该 snapshot。public WorkUnit 编辑仍会把 generated Task 标记为 `customized` 且保留 snapshot；`POST /v1/team/tasks/:taskId/generated-workunit/reset` 可将非 archived generated Task 的可见 `title/workUnit` 恢复为最新 managed snapshot 并标记回 `managed`。5174 Discovery 子画布只对 customized 且有 snapshot 的 generated child 显示 reset-to-managed。
- Team Console 5174 data layer 已开始消费 Discovery generated child catalog 和 failed dispatch diagnostics：Live API adapter 暴露 `listGeneratedTasks(discoveryTaskId, { includeArchived })`，旧后端 404 按空 catalog 处理；`useTeamConsoleLiveData()` 在 root Tasks 中识别 `canvasKind="discovery"` 后读取 generated child catalog，并用既有 `listTaskRuns()` / `listTaskRunAttempts()` 读取最新 root Discovery run attempt 的 `discoveryDispatch[]`。它维护 `generatedTasksByDiscoveryTaskId`、`discoverySummariesByTaskId`、`discoveryDispatchDiagnosticsByTaskId` 和 generated Task 的 `taskRunsByTaskId` run summaries；只有 `status="blocked"` 的 dispatch outcome 计入 failed dispatch。generated Tasks 仍不会进入 root `tasks` state 或主 canvas/root list；没有 Discovery root 时不请求 generated catalog endpoint。
- Team Console 5174 Discovery root summary、子画布 catalog、failed dispatch diagnostics、generated run observer、generated light edit/reset 和 generated scoped archive 已接入：root Discovery Task 卡片使用 `canvasKind="discovery"` 身份渲染为 Discovery 卡片，并显示 generated 总数、active、stale、running 和 blocked dispatch 计数；Task 操作菜单中的 `Discovery 子画布` toggle 会从既有 child panel 系统打开 generated catalog panel，展示非 archived generated Tasks 的 title、active/stale、managed/customized 和 latest run status。子画布会显示最新 blocked dispatch item 的 item id 和 concise error，不展示 raw `itemPayload`，也不会把 diagnostics 伪造成 generated Task。generated child card 可直接运行、停止 active run，从 latest run 打开 Worker / Checker observer 和 attempt 文件详情，也可打开 `data-generated-edit-task-id` 浅编辑 panel 修改 Task 名称、Leader / Worker / Checker Agent。generated title edit 会同时 PATCH `title` 和 `workUnit.title`，让后端按既有规则把 generated WorkUnit 标记为 `customized`；reset 调用 Team Console adapter 的 `resetGeneratedTaskWorkUnit(taskId)` 并只替换对应 Discovery catalog child。generated child 归档调用既有 `POST /v1/team/tasks/:taskId/archive` 软归档，成功后只从 `generatedTasksByDiscoveryTaskId[sourceDiscoveryTaskId]` 移除该 child，清理该 child 的 edit/observer/file-detail UI 状态，并保持 root Discovery branch 和子画布打开。普通 Task 卡片不显示 Discovery 身份、summary 或子画布入口；generated Tasks 仍不会出现在主 root canvas。
- Team Console Execution Atlas 交互和视觉已完成一轮收口：Task 菜单删除确认按具体 branch `nodeId` 隔离，不再被最后聚焦的菜单串台；根节点拖入垃圾桶后如果在确认 modal 选择取消，会把 Agent / Task / Source 恢复到拖拽前坐标，Task 子树同步回滚。顶部工具栏按 command deck 分成筛选 / 添加 / 统计和全局视图设置区；Agent / Task / Source 根卡片统一按身份区、内容区和底部 I/O 区分层，不再显示卡片内“收”按钮，也不再使用右侧 action rail 切割；收纳统一通过拖入底部 Dock 完成，Task dependency handle 仍保留在 Task 卡片右侧中部；Task 根卡片角色区使用单个 crew panel，Leader 是主协调行，Worker / Checker 是双轨执行与验收行；带 typed ports 的 Task 根卡片高度按端口行数增长，`IN` + `OUT` 双端口卡片必须完整显示两行 port chip，相关连接锚点、框选、Dock restore 和拖拽碰撞区域同步使用同一动态高度。画布缩放改为鼠标滚轮驱动的固定可读档位 `45 / 50 / 67 / 75 / 90 / 100 / 110 / 125 / 150 / 180%`，显式 `+ / - / 1:1 / 100%` 缩放控件已移除；pan offset 按 `devicePixelRatio` 对齐到设备像素，并配合字体渲染 hint 降低 DOM transform 缩放后的文字发虚。
- Team Console Execution Atlas 三类连接线（typed Task connection、Source connection、control dependency）均可从画布切断：每条 active 线段中点有一个小型切断按钮，但默认隐藏；鼠标悬浮到连接线透明命中区域或按钮获得 focus 时才显示，避免画布上常驻叉号噪音。按钮颜色随连接线类型（绿色/青色/琥珀色），`aria-label` 包含源和目标名称，点击后直接调用对应 DELETE API，删除中按钮禁用，失败时保留原线并显示 error banner。
- Team Console 底部 Dock 已优化为常驻根节点托盘：默认半隐藏在画布下方；即使没有已收纳节点也保留一个根节点宽度的 2D 玻璃面板，不再渲染顶部发光把手或渐变底色。鼠标悬浮、键盘 focus、指针进入 Dock，或拖动中的根节点外框碰到 Dock 露出边缘时会动画上探展开；空 Dock 在鼠标移走后立即收回，非空 Dock 在鼠标移走后 3 秒收回。松手收纳同样按根节点外框与 Dock 矩形碰撞判断，不要求指针点已进入 Dock 内部。每个 Dock item 按 kind 带左侧色条 glyph（Agent 绿 A、Task 琥珀 T、Source 青 S）和 title/meta 信息，固定宽度避免 hover 抖动，Dock item 与边框四向 padding 保持一致，hover 时 `translateY(-4px)` 上浮；drop active 态有 inset guide 视觉；flight 动画补充节点 title；支持 `prefers-reduced-motion` 降级。
- Team Console preview 的 Execution Map 建模按优先级挂载 generated child：显式 `parentTaskId`、仅在单一 `for_each` parent 时使用的安全 `sourceItemId` fallback、标记 `fallback: true` 的 id prefix fallback，仍无法归属的任务进入 orphan group；model builder 不修改传入的 plan/run/taskDefinitions。大量子任务折叠 summary node 会按隐藏子任务状态汇总，不再固定显示成功。
- Execution Map 视觉已收口为 Execution Atlas：根节点顶部、主任务沿左侧 spine 向下、子任务分支右侧；节点有状态色条、选中发光、chain-selected 路径、失败错误首行、折叠虚线、orphan 点线；Agent / Task 画布卡片共享 `.emap-atlas-card` 基类，Task 一级菜单使用 `.emap-menu-branch`，iframe 对话分支使用 `.emap-dialog-branch`；连接线统一使用平滑三次贝塞尔曲线；responsive 断口在 720px。
- Team Console Task run 并发边界：不同 Task 可以同时运行，前端 run state（`taskRunsByTaskId`、`taskRunSavingByTaskId`）按 `taskId` 独立维护；后端 Canvas Task run admission 也只做同一 Task active guard，不使用 Plan run 的 `TEAM_MAX_CONCURRENT_RUNS` 全局 admission。每个 Task 同时只允许一个 active run，有 active run 时该 Task 的"运行"按钮显示"运行中"并禁用，只暴露该 Task 自己的"停止"按钮。其他 Task 不受影响，"运行"按钮保持可用。Run observer 和轮询按 `taskId + runId` 独立工作。不引入全局画布级 run queue 或 semaphore。用户需自行注意跨 Task 的 Agent 资源冲突。
- Team Console preview 当前点击任务后不再打开固定右侧详情栏，也不在节点内部堆叠大段详情；结果 / 错误 / 尝试 / 进度会作为 evidence card 分支从 selected task 旁边长出。选中 task 有真实 attempt metadata 时，Worker 输出、Checker 验收、Watcher 复盘和最终 / 失败 / 发现结果会作为 artifact card 展示；只有通过当前 task/attempt 匹配且存在于 attempt metadata `files` 白名单中的 file-backed artifact card 可点击预览。Fallback Error / Attempt / Progress evidence 是静态卡片，不会伪造可预览文件。点击可预览 artifact card 后读取同一 run/task/attempt 下的真实文件并展开第二级预览节点，文本安全转义，JSON pretty print，HTML 只进 sandbox iframe。
- Execution Atlas 桌面画布支持鼠标滚轮缩放、背景拖拽平移、空白画布左键长按框选多个 Agent / Task 节点（Shift + 拖动仍兼容直接框选）和拖动已选节点集合；显式 `+ / - / 1:1 / 100%` 缩放控件已移除。pan/zoom viewport 会随 Team Console canvas UI state 持久化，框选选择态仍只是本地瞬时状态。Evidence / preview 高度测量使用 transform-independent `offsetHeight` 优先，避免缩放后把 `getBoundingClientRect().height` 写回 layout 造成测量反馈循环；滚轮缩放使用原生 non-passive `wheel` listener。移动端本轮不做深度设计，`720px` 以下仍走纵向流式布局并隐藏自定义 pan/zoom 工具条，只保证不明显横向炸版。
- Team Console mock fixtures 已加入脱敏真实 run snapshot（`plan_real_snap_001` / `run_real_snap_001`），用于验证真实 completed_with_failures 数据、for_each 子任务、长错误、API 错误、resultRef、ghost result 和最终汇报 evidence。
- Team Console mock fixtures 已加入脱敏真实 run snapshot 2（`plan_real_success_foreach_001` / `run_real_success_foreach_001`），16 个任务（3 主任务 + 13 for_each 子任务）全部成功，用于验证折叠/展开交互和大量子任务布局。
- Execution Atlas collapsed summary 已支持展开/收起：超过 `CHILD_COLLAPSE_THRESHOLD`(6) 个子任务时折叠为摘要节点；点击摘要节点展开全部子任务，展开后末尾显示"收起"按钮再次点击收起。布局在展开/收起时同步更新。
- Execution Atlas evidence 规则：for_each 父任务有 visible children（子任务数 ≤ 阈值或已展开）时不显示 evidence；无 visible children 时显示当前任务自身的结果 / 错误 / 进度。
- Team Console 多 Task 聚焦布局稳定：切换聚焦 Task 不会导致其他 Task 的二级面板重定位或连接线锚错父菜单。每个活跃 Task 菜单维护独立的 shell 尺寸测量（`taskBranchMeasuredSizes` / `taskBranchShellRefs` map 替代旧单例），child panel connector 只锚定自己的 parent menu，`sourceId` 无法解析时不再回退到主 `taskBranchNode`。

## 核心概念

### Task

Task 是 Team Console 画布上的最小编排节点，独立于 Plan 存在。不要把它实现成 `Plan tasks.length === 1`，这不是语义洁癖，是避免以后画布节点、运行快照和多任务 Plan 全部互相污染。

关键字段：

- `taskId` — 唯一标识，当前由 `src/team/ids.ts` 生成 `task_...`
- `title` — 画布 Task 标题
- `leaderAgentId` — 必填，运行前负责和用户沟通、澄清边界并维护 WorkUnit 草案的 Agent
- `workUnit` — Task 内部的单个 WorkUnit 定义
- `status` — `drafting | ready | locked | archived`；本轮创建 / 更新只开放 `drafting | ready`，`locked` 预留给未来 run snapshot
- `archived` — 软归档标记；默认列表不返回归档 Task

`workUnit` 关键字段：

- `title`
- `input.text`
- `inputPorts?: { id; label?; type }[]`
- `outputContract.text`
- `outputPorts?: { id; label?; type }[]`
- `acceptance.rules[]`
- `workerAgentId`
- `checkerAgentId`

`leaderAgentId`、`workerAgentId`、`checkerAgentId` 都必须指向当前未归档 Agent profile。`workerAgentId === checkerAgentId` 第一版允许，但 API 会返回 warning，skill 预览也必须提醒“同 Agent 自检会削弱验收独立性”。

Task 持久化在 `.data/team/tasks/<taskId>.json`，通过 `src/team/task-store.ts` 读写；旧记录缺 `status` 时按 `drafting`，缺 `archived` 时按 `false`。

`team-task-creator` runtime skill 只创建 / 更新 Task draft：

- 显式关键词：`/team-task`
- 先读 `GET /v1/agents`
- 普通 Task 和 Discovery root Task 都必须先展示完整 Task JSON 预览并等用户确认
- 创建走 `POST /v1/team/tasks`
- 更新走 `GET /v1/team/tasks`、`GET /v1/team/tasks/:taskId`、`PATCH /v1/team/tasks/:taskId`
- Discovery root Task 创建必须在同一个 `POST /v1/team/tasks` payload 中携带 `canvasKind="discovery"` 和合法 `discoverySpec`；不新增后端 endpoint，不写 `generatedSource`
- Discovery 角色必须从 `GET /v1/agents` 的 active Agent catalog 选择，包括 root leader/worker/checker、`dispatcherAgentId`、`generatedWorkerAgentId`、`generatedCheckerAgentId`；不要按具体平台或供应商写死 Agent
- 不启动 run，不调用 `POST /v1/team/plans/:planId/runs`，不直接写 `.data/team`，不改 Agent profile / 模型 / browser binding / 技能安装

### Discovery Task catalog and run validation

Discovery Task 是 Team Console 画布上的 root Task，`canvasKind="discovery"`，必须携带 `discoverySpec`。当前已开放 catalog/API 层，并接入 Canvas Task run 的输出校验和标准结果持久化：

- `POST /v1/team/tasks` 继续兼容普通 Task 创建，同时接受 Discovery root Task 的 `canvasKind` 和 `discoverySpec`，返回 `{ task, warnings }`。
- `PATCH /v1/team/tasks/:taskId` 继续兼容普通 Task 浅编辑，同时只允许 Discovery root Task 更新 `discoverySpec`；normal root Task 携带 `discoverySpec` 会被拒绝。
- public `POST /v1/team/tasks` 不允许携带 `generatedSource`，public `PATCH /v1/team/tasks/:taskId` 不允许携带 `canvasKind` 或 `generatedSource`。generated Task 身份只能由后续 Discovery dispatch/upsert 逻辑维护，不能由外部调用方伪造。
- `GET /v1/team/tasks` 默认只返回 root catalog：normal root Task 和 Discovery root Task。generated Tasks 默认隐藏，只有显式 `?includeGenerated=1` 或 `?includeGenerated=true` 才会并入 `tasks` 数组；`includeArchived` 语义保持不变并可与 `includeGenerated` 组合。
- `GET /v1/team/tasks/:taskId/generated-tasks` 是只读子 catalog route，只接受真实 Discovery root Task。缺失 parent 返回 404，normal root parent 返回 400。响应为 `{ tasks }`，默认排除 archived generated Tasks，`?includeArchived=1|true` 时包含。
- Discovery root 被直接运行时，Canvas Task 会转换为 runtime `TeamTask` 的 `type="discovery"`，并携带 `discovery.outputKey = discoverySpec.outputKey`；normal root 和 generated Task 仍按 `type="normal"` 运行。
- Canvas Task run 会把 `workUnit.outputCheck` 透传到 runtime `TeamTask.outputCheck`。因此 normal Task 配置了 JSON/object/html/file 输出校验时，checker 口头 pass 不能绕过 runtime validation。
- Discovery accepted output 必须是可解析 JSON object，且配置的 `outputKey` 值必须是 item object array；每个 item 必须有非空 string `id`。校验失败时 run 进入 `completed_with_failures`，Task state 为 `failed`，不会写 `discovery-result.json`。
- Discovery 校验成功后仍写 `accepted-result.md`，并额外写 `discovery-result.json`，schema 为 `team/discovery-result-1`，包含 `taskId`、`attemptId`、`outputKey`、`items`、`sourceRef`、`createdAt`。attempt `resultRef` 继续指向 `accepted-result.md`。当 generated child auto-run pool 结束后，root attempt 还会写 `discovery-aggregation.json`，schema 为 `team/discovery-aggregation-1`，作为 typed downstream 的优先 JSON artifact。
- 当前 route 不附加 run summary，也不新增 5174 UI 控件；generated Task 创建/复用、stale marking 和 auto-run scheduler 都在 Canvas Task run service 的 Discovery 成功路径内完成。实现边界是单 dispatcher producer + generated run queue consumer：producer 负责从 `discovery-result.json` 的 raw item 生成/更新 Task 并 enqueue，consumer 负责固定 3 并发启动 generated child run。

### Discovery dispatcher role contract

Discovery dispatcher 是独立 role，不复用旧 Plan decomposer。旧 `runDecomposer` 仍只负责把一个 Plan `TeamTask` 拆成 child `TeamTask[]`；Discovery dispatcher 输入一个 Discovery item，只输出这个 item 的 semantic patch，完整 generated Task WorkUnit 由本地 deterministic compiler 生成。

- `src/team/role-runner.ts` 的 `DiscoveryDispatchInput`、`DiscoveryDispatchOutput` 和 `runDiscoveryDispatcher(input)` 保持 role 边界；成功返回仍对 runtime 暴露 `{ ok: true, itemId, workUnit, runtimeContext? }`。
- Dispatcher input 包含 `runId`、Discovery task id/title、Discovery goal、dispatch goal、`outputKey`、exact `itemId`、完整 `itemPayload`、required/recommended item fields，以及默认 `generatedWorkerAgentId` / `generatedCheckerAgentId` 上下文。
- `generatedWorkerAgentId` / `generatedCheckerAgentId` 只能作为 prompt 上下文；dispatcher semantic patch 不允许选择或覆盖 worker、checker、leader、source identity、`outputPorts`、`outputCheck`、`workUnit`、`outputContract` 或 `acceptance`。
- Dispatcher JSON output 固定为 `{ "itemId": "...", "title": "...", "workerInstruction": "...", "itemAcceptanceHints": ["..."], "outputContractHint": "..." }`；prompt 不使用 JSON code fence 示例，并明确要求 trim 后第一个字符是 `{`、最后一个字符是 `}`。
- `parseDiscoveryDispatchSemanticPatch()` 接受 bare JSON object；若模型把整个 JSON object 包在单一 markdown code fence 中，会先 deterministic unwrap 再解析。文字包裹 JSON、embedded JSON、item mismatch、invalid schema 或 forbidden fields 都返回 `ok: false`，不 throw。旧 `parseDiscoveryDispatchRoleOutput()` 仅保留 legacy parser coverage，不再是实时 dispatcher 成功路径。
- `AgentProfileRoleRunner.runDiscoveryDispatcher()` 对 semantic patch parse failure 会做一次格式修复 retry：把错误原因和原始输出打回 dispatcher，要求只重写 bare JSON object。retry 仍失败才把 item 记录为 blocked；不做无限重试，也不从解释文字中抽取 embedded JSON。
- `AgentProfileRoleRunner` 使用独立 role name `discovery-dispatcher`，role key 由 `discoveryTaskId + itemId` 派生并做 path-safe sanitization，避免 raw item id 进入 workspace 路径；profile 选择顺序是 `dispatcherProfileId > decomposerProfileId > workerProfileId`。
- 当前 dispatcher contract 只产出 semantic patch，不创建或更新 generated Tasks，不标记 stale，不启动 generated Task auto-run，不新增 route，不改 5174 UI。

### Typed Task Chain V1

Typed Task Chain V1 把 Task 设计成可组合的最小积木，但刻意不把 Team Console 做成万能工作流平台。规则很简单，也必须简单：每条连接要求 `output.type === input.type`；同一个 output port 可以连接到多个不同下游 Task 的同类型 input port（fan-out）；但每条连接的四元组 `(fromTaskId, fromOutputPortId, toTaskId, toInputPortId)` 必须唯一。

端口契约：

- `workUnit.inputPorts[]` 和 `workUnit.outputPorts[]` 都是可选字段；旧 Task 没有 ports 时仍能照常创建、编辑和运行，只是不能作为 typed connection 的端点。
- 每个 port 必须有稳定 `id` 和 `type`；`label` 只用于 UI 展示。
- `id` 只允许字母开头的短标识；`type` 使用小写类型字符串，例如 `md`、`html`、`json`、`audio`。
- 连接规则固定为 `output.type === input.type`。`md -> md` 可以连接；`md -> html` 不可以直接连接。HTML 制作 Task 的正确建模是 `inputPorts: [{ type: "md" }]`、`outputPorts: [{ type: "html" }]`。

连接契约：

- 持久化文件：`.data/team/task-connections.json`
- API：`GET /v1/team/task-connections`、`POST /v1/team/task-connections`、`DELETE /v1/team/task-connections/:connectionId`
- 数据结构：`{ connectionId, fromTaskId, fromOutputPortId, toTaskId, toInputPortId, createdAt }`
- 后端创建 connection 时必须校验 Task 存在、未归档、port 存在、类型相等、非自连接、非重复连接，并拒绝会形成环的连接。
- `create()` 和 `delete()` 使用 mkdir-based mutation lock 保护 read-modify-write 区间，防止并发丢失连接。`list()` / `listResolved()` 不加锁——原子 rename 保证读者看到完整文件。
- `task-connections.json` 缺失仍返回空列表；但 invalid JSON、non-array JSON 或不可读文件会抛出错误，API 层返回 500，不再静默返回空列表。
- `GET /v1/team/task-connections` 返回每条连接附带运行时派生的 `status: "active" | "stale"` 和可选 `staleReason`；这些字段不写入 `task-connections.json`，只在 API 请求时从当前 Task/port 状态推导。stale 连接不触发下游 run，前端不渲染 stale 连接线。
- stale 判定规则（任一命中即标记 stale）：
  - `source_task_missing` — source Task 不存在
  - `source_task_archived` — source Task 已归档
  - `target_task_missing` — target Task 不存在
  - `target_task_archived` — target Task 已归档
  - `source_output_port_missing` — source output port 在当前 WorkUnit 中找不到
  - `target_input_port_missing` — target input port 在当前 WorkUnit 中找不到
  - `source_output_port_type_mismatch` — source output port type 与 connection type 不一致
  - `target_input_port_type_mismatch` — target input port type 与 connection type 不一致
- 上游 run 完成后触发 downstream 时，如果 source Task 在 run 期间被归档，downstream 不会被触发；上游 accepted run 不受下游 stale 影响。
- Fan-out 交付规则：上游 accepted result 作为 typed artifact 分发给每个下游 Task 的连接；每个下游 Task 独立创建自己的 Canvas Task run。某个下游失败（例如已有 active run）只记录 `failed` delivery outcome，不阻塞其他下游或把上游 run 改成失败。不同下游 Task 可并行运行。

Source node 输入契约：

- source node 持久化文件：`.data/team/source-nodes.json`；source connection 持久化文件：`.data/team/source-connections.json`。
- API：`GET /v1/team/source-nodes`、`POST /v1/team/source-nodes`、`PATCH /v1/team/source-nodes/:sourceNodeId`、`POST /v1/team/source-nodes/:sourceNodeId/archive`、`GET /v1/team/source-connections`、`POST /v1/team/source-connections`、`DELETE /v1/team/source-connections/:connectionId`。
- source node 目前只支持 `nodeType: "text" | "file"`，输出端口固定为 `outputPort.id = "value"`。text source 默认输出 `string`；file source 会按文件扩展名推断 `md`、`json`、`html`、`string` 或兜底 `file`。
- source connection 数据结构是 `{ connectionId, fromSourceNodeId, fromOutputPortId, toTaskId, toInputPortId, type, createdAt, updatedAt }`，只连接 source node 到 Task input port，不写 Task artifact 的 `sourceTaskId`、`sourceRunId` 或 `sourceAttemptId`。
- 后端创建 source connection 时校验 source node 存在且未归档、source output port 存在、target Task 存在且未归档、target input port 存在，并要求 source output type 与 target input type 相等。重复连接会被拒绝。
- `GET /v1/team/source-connections` 返回运行时派生的 `status: "active" | "stale"` 和可选 `staleReason`；stale 规则包括 source node 缺失/归档、target Task 缺失/归档、两端 port 缺失或类型漂移。stale source connection 在直接 Task run 时会被跳过，不阻断该 run。
- 直接 Canvas Task run 会收集指向当前 Task 的 active source connection，构建 `schemaVersion: "team/source-artifact-1"` 的 `TeamCanvasSourceArtifact`，并以 `source: "canvas-source"` 的 bound input 写入 `TeamRunState.source.boundInputs[]`、Agent payload 和 prompt。
- Task-to-Task typed artifact 自动下游链路只消费 `task-connections.json` 和上游 run 的 typed artifact resolver；source node / source connection 不会因为内容变化或连接创建而自动启动 Task。

产物传递契约：

- 上游 Canvas Task run 必须成功并通过 checker，才会封装 typed artifact。普通 Task 会按 connection type 优先选择 worker public output 中类型匹配且可读取的机器可消费文件：`json` 只接受 `.json` 且内容能解析为 JSON object/array，`html` 优先 `.html` / `.htm`，`md` / `markdown` 优先 `.md` / `.markdown`，`text` / `txt` / `string` 优先 `.txt` 再 `.md`；未知类型不猜测，直接 fallback。
- 候选文件只来自当前 run/attempt 的 `agent-workspaces/<attemptId>/worker/output/**`，`fileRef` 使用 run-scoped 相对路径，不暴露宿主绝对路径；候选排序稳定：类型扩展名优先、路径越浅越优先、其余按路径字典序。
- Discovery 上游仍保持专用优先级：先 `discovery-aggregation.json`，再 `discovery-result.json`，最后才 fallback 到普通 resultRef。
- 没有匹配 public output 或内容校验失败时，runtime 使用既有 `resultRef` fallback，通常是 `tasks/<taskId>/attempts/<attemptId>/accepted-result.md`。
- artifact 至少包含 `artifactId`、`type`、`sourceTaskId`、`sourceRunId`、`sourceAttemptId`、`fileRef`、`preview` 和 `content`。
- 下游自动 run 的 `TeamRunState.source` 会写入 `triggeredBy: { type: "task-connection", connectionId, fromTaskId, fromRunId, fromAttemptId }` 和 `boundInputs[]`。
- `boundInputs[]` 会进入下游 WorkUnit 的 prompt 和 payload，Agent 看到的是明确绑定的 typed artifact 输入，不需要自己猜上游文件在哪。
- Prompt 中的每个 bound input 包含完整追溯 metadata：`connectionId`、`inputPortId`、`artifactId`、`sourceTaskId`、`sourceRunId`、`sourceAttemptId`、`sourceOutputPortId`、`fileRef`。
- Artifact 内容被 `BEGIN_TYPED_ARTIFACT_CONTENT <artifactId>` 和 `END_TYPED_ARTIFACT_CONTENT <artifactId>` 包裹，不使用 Markdown code fence，因为 artifact 自身可能包含 triple backtick。
- Prompt 格式是纯格式层契约；payload 仍携带结构化 `boundInputs` 对象，截断限制不变：content 30,000 字符，preview 1,200 字符。
- 下游启动失败不会回滚已经验收通过的上游 run；失败只影响连接触发链路本身。

下游交付诊断：

- 上游 attempt 成功后，系统会为每个存在的 outgoing connection 记录一条 `TeamTaskDeliveryOutcome`，写入 `TeamAttemptMetadata.downstreamDelivery`。
- 三种状态：`delivered`（成功启动下游 run，附带 `downstreamRunId`）、`skipped`（连接 stale 或 source task 中途归档/缺失，附带 `staleReason`）、`failed`（启动下游 run 失败，附带裁剪后的短 `error`）。
- 没有 outgoing connection 时不记录任何 outcome。
- 诊断写入是 best-effort：写入失败不会回滚已完成的 upstream run。
- 可通过现有 `GET /v1/team/task-runs/:runId/tasks/:taskId/attempts` 读取，不需要新 endpoint。

边界：

- V1 不做任意复杂自由画布编排、条件分支、循环、真实 TTS 或 SSE 观察流。
- Source node 只作为直接 Canvas Task run 的输入绑定，不是工作流触发器，不提供条件、循环、广播、多源聚合或自由执行引擎。
- TTS 只作为类型系统 fixture：未来 `md -> audio` 的 Task 可以复用同一套 port / artifact / connection 规则。
- 第一条真实验收链路固定为”搜集内容 Task 输出 `md` -> HTML 制作 Task 输入 `md`、输出 `html`”。

### Manual Upstream Run Selection

Typed Task Chain 的自动下游由刚完成的上游 run 触发；手动启动下游 Task run 时，Manual Upstream Run Selection 允许显式指定上游历史 run 作为输入来源。

- `POST /v1/team/tasks/:taskId/runs` 新增可选 body 字段 `upstreamRunSelections: Array<{ connectionId, fromRunId }>`。
- 每个 selection 的 `connectionId` 必须指向当前 active typed task connection，且该 connection 的 `toTaskId` 等于目标 Task。
- `fromRunId` 必须属于 connection 的 `fromTaskId`，且该 run 必须处于 terminal 状态并成功通过 checker。
- artifact 解析逻辑与自动下游一致：Discovery 类型上游优先 `discovery-aggregation.json`，fallback `discovery-result.json`；普通 Task 按 connection type 优先匹配 worker public output，找不到才使用 `resultRef`。
- `TeamRunState.source` 记录 `manualUpstreamSelections[]`，与 `triggeredBy` 分开——`triggeredBy` 描述自动触发来源，`manualUpstreamSelections` 描述手动选择的上游输入。
- `source.boundInputs[]` 包含选中的上游 artifact，结构和自动下游一致。
- Team Console 启动下游 Task 时只从当前 UI 已装载的上游 run 生成 selection；没有有效 selection 时 `POST /v1/team/tasks/:taskId/runs` 保持原 body 语义，模板参数和 `upstreamRunSelections[]` 可同时存在。

### Task Control Dependencies

Control dependency 是 typed connection 之外的第二类 Task DAG 边。它只表达”Task A 成功完成后自动启动 Task B”，不传数据、不要求端口、不生成 artifact、不写 `boundInputs`。

与 typed connection 的区别：

| | Typed Connection | Control Dependency |
|---|---|---|
| 数据传递 | 有（typed artifact → boundInputs） | 无 |
| 端口要求 | 需要 output/input port 且类型匹配 | 不需要 ports |
| 产物类型 | accepted result → typed artifact | 不生成 artifact |
| 下游输入 | `boundInputs` 写入 prompt 和 payload | 不写 `boundInputs` |
| 线条样式 | 实线 + source socket | 虚线 amber（`.emap-link-task-dependency`） |

后端契约：

- 持久化文件：`.data/team/task-dependencies.json`
- API：`GET /v1/team/task-dependencies`、`POST /v1/team/task-dependencies`、`DELETE /v1/team/task-dependencies/:dependencyId`
- 数据结构：`{ dependencyId, fromTaskId, toTaskId, trigger: “on_success”, createdAt, updatedAt }`
- 后端创建 dependency 时校验 Task 存在、未归档、非自连接、非重复、不与现有 typed connections + control dependencies 合并后形成环。
- `GET` 返回运行时派生的 `status: “active” | “stale”` 和可选 `staleReason`（`source_task_missing` / `source_task_archived` / `target_task_missing` / `target_task_archived`）。
- Cycle 防护覆盖混合图（typed connections + control dependencies 共同参与环检测）。

下游触发：

- 上游 Canvas Task run 成功并通过 checker 后，系统检查所有从该 Task 出发的 active control dependency，为每个下游 Task 创建独立的 Canvas Task run。
- 下游 run 的 `state.source.triggeredBy` 记录 `{ type: “task-dependency”, dependencyId, fromTaskId, fromRunId, fromAttemptId }`。
- 下游 run 不写 `state.source.boundInputs`（除非该 Task 同时有 active typed connection 的 source binding）。
- 上游失败或取消不触发 dependency 下游。
- Stale dependency 记录 `skipped` delivery outcome，不阻塞上游 accepted run。
- Delivery outcome 类型为 `TeamTaskControlDependencyDeliveryOutcome`（`edgeKind: “control-dependency”`），与 typed connection 的 `TeamTaskTypedConnectionDeliveryOutcome`（默认 `edgeKind: “typed-connection”`）构成 union。

### Team Task Group Definition

Team Task Group 是 Team Runtime 的持久结构单位，不再只是浏览器 localStorage 里的 UI frame。Group definition 可独立持久化，运行可用性通过 resolved view 表达：

- 持久化文件：`.data/team/task-groups.json`，写入由 `.task-groups.lock` 保护。
- 数据结构：`schemaVersion="team/task-group-1"`、`groupId`、`title`、`taskIds`、`archived`、`createdAt`、`updatedAt`。
- `taskIds` 会 trim、去重并保持输入顺序；允许空数组。请求里 `taskIds` 必须是数组，entries 必须是非空字符串。
- `collapsed`、`locked`、frame rect、卡片位置和本地展示状态仍属于 Team Console UI state，不进入 `TeamTaskGroup` schema。
- 创建和更新只硬校验 title 与 `taskIds` shape；Task 不存在、Task 已归档、Task 是 generated child、空 Group 或边界泄漏都会保存为 `status="invalid"`。
- 边界闭合校验只看 active typed task connection 与 active control dependency。只要一端在 Group 内，另一端也应在 Group 内；外部上游连入 Group、Group 内 Task 输出到外部 Task 都会作为 `validation.errors` 暴露。
- stale typed connection / dependency 不参与边界闭合，也不参与头节点计算；`resolve()` 仍会返回 resolved view，避免旧数据诊断时崩溃。
- 头节点定义为 Group 内没有 incoming internal active edge 的 Task；internal edge 包含 typed task connection 和 control dependency。多条独立链会返回多个 `headTaskIds`，孤立 Task 本身就是 head。
- 如果 Group 内没有任何 head Task，Group invalid；空 Group 会持久化并返回 `no_head_task`。
- 归档 Group 是软归档，不删除 Task、typed connection、control dependency 或 Task run history。

Resolved view:

```ts
interface ResolvedTeamTaskGroup extends TeamTaskGroup {
  status: "valid" | "invalid";
  headTaskIds: string[];
  validation: { errors: TeamTaskGroupValidationIssue[] };
}
```

Group definition 阶段的非目标是：不把 Group 合进 `GET /v1/team/console/root-summary`，不把 generated child 放进 root canvas，不新增绕过 typed connection / run-context / GroupRun 合同的 endpoint。

### Team Task GroupRun

Team Task GroupRun 是 Group 的运行聚合视图，持久化在 `.data/team/task-group-runs.json`。它只聚合 Group 内 Canvas Task runs，不进入 Plan run API，也不写入 `GET /v1/team/console/root-summary`。

- `POST /v1/team/task-groups/:groupId/runs` 启动 GroupRun；后端会拒绝 invalid/empty Group（400）、active GroupRun（409）和 Group 内 active Task run（409）。
- `GET /v1/team/task-groups/:groupId/runs` 列出某 Group 的 GroupRuns；Team Console 只用它选取最新 active 或最新 created run 做 frame 展示。
- `GET /v1/team/task-group-runs/:groupRunId` 读取并刷新单个 GroupRun 的聚合状态；Team Console 只在 `queued/running` 时轻量轮询。
- `POST /v1/team/task-group-runs/:groupRunId/cancel` 取消 active GroupRun，并级联取消 Group 内 active Canvas Task runs。
- 新建 `TeamTaskGroupRun.definitionSnapshot` 固定本次运行启动时的 `{ taskIds, headTaskIds }`。刷新、聚合和取消优先使用 snapshot membership；旧 run 没有 snapshot 时 fallback 当前 Group membership，避免旧数据 500。
- 当前不冻结 typed/control edge 版本；内部 downstream dispatch 和 pending delivery 检查仍读取当前 active edge store。
- Team Console 的 GroupRun 状态只是运行视图，不保存进 `canvas-ui-state`；本地只保存 Group 折叠/锁定展示态。
- Conn scheduler 后端 worker 可通过 Conn `execution.type="team_group"` 定时触发既有 GroupRun API；Playground Conn manager 和 `/playground/conn` 独立页已经接入后端 Group 选择。Conn 表单仍必须把 Group 写入 `execution`，`target` 只表示结果投递目标；不能让 Conn 选择单个 Task。

### Canvas Task Run

Canvas Task Run 是 Task 的独立运行轨道，不是 Plan run 的别名。后端会为 Task run 构造一个仅用于 run snapshot 的内部执行 envelope，但不会写入 `PlanStore`，不会出现在 `GET /v1/team/runs`，也不会增加任何 Plan 的 `runCount`。持久化目录是 `.data/team/task-runs/runs/<runId>`。

运行规则：

- 启动入口：`POST /v1/team/tasks/:taskId/runs`
- 只允许 `status="ready"` 且未归档的 Task 启动
- 同一个 Task 同时只允许一个 active run（`queued | running | paused`）
- 不同 Task 可以同时有 active run；Canvas Task run 创建不走 `TEAM_MAX_CONCURRENT_RUNS` / `createRunWithAdmission`
- worker 使用 `workUnit.workerAgentId`
- checker 使用 `workUnit.checkerAgentId`
- leader 不参与运行阶段，只负责运行前沟通和 WorkUnit 草案维护
- 第一版不启动 watcher/finalizer，不支持 pause/resume/rerun
- active run 可用 `POST /v1/team/task-runs/:runId/cancel` 停止
- worker/checker attempt metadata 和输出文件仍复用 `RunWorkspace` 的 attempt 结构，只是 rootDir 指向 `task-runs`
- worker/checker 过程观测不新造 Team 专属 tool log schema：`AgentSessionLike.subscribe()` 原始事件先经 `createAgentSessionEventAdapter()` 转成 `ChatStreamEvent`，再经 `applyChatStreamEventToActiveRunView()` 得到和主聊天一致的 `ChatProcessBody`
- attempt metadata 可包含 `roleProcesses.worker` / `roleProcesses.checker`，每个 role process 记录 `role`、`profileId`、`status`、`startedAt`、`updatedAt`、`finishedAt`、`process` 和可选 `assistantText`（Agent 自述 / 推理文本）
- role process 写盘策略：role start、`tool_started`、`tool_finished`、completion/failure/cancel 立即 flush；`tool_updated`、`text_delta`、heartbeat 等高频事件按 300-500ms 节流合并；completion/failure/cancel 前必须 flush 最新状态
- 单条 process entry 的 `detail` 持久化前截断到约 8,000 字符并追加 `...[truncated]`，长输出继续以 attempt 文件为准
- 通过 typed connection 自动触发的下游 run 会在 `state.source.triggeredBy` 记录来源 connection / upstream run，并在 `state.source.boundInputs` 记录输入 artifact
- 用户直接启动 Canvas Task run 时会注入 active source connection bound input；这类 bound input 使用 `source: "canvas-source"` 区分，不包含上游 Task/run/attempt 追溯字段
- 旧 attempt metadata 没有 `roleProcesses` 时继续按旧结构返回，不需要迁移

### Team Canvas Task frontend workflow

Team Console 的 Task 前端闭环只负责画布入口和刷新，不拥有 Task 定义本身：

- `GET /v1/team/tasks` 是 Task catalog 唯一来源；Live API 下 Task 卡片位置只把 `taskId` 和画布坐标写入 `localStorage`，不保存 `workUnit`、`leaderAgentId`、`workerAgentId` 或 `checkerAgentId`。
- Task 卡片会渲染声明过的 typed input/output ports。用户点击 output port 后只能连接同类型 input port；前端会提前拦截类型不匹配，但最终合法性以后端 `POST /v1/team/task-connections` 为准。
- 连接成功后前端保存并渲染 Task 间 connection path；刷新 Task catalog 时也会重新请求 `GET /v1/team/task-connections`，确保画布线来自后端事实而不是本地猜测。
- 点击已有 Task 先打开紧凑操作菜单节点：运行调用独立 Canvas Task run API；编辑只开放 Task 名称、leader Agent、worker Agent、checker Agent，并在菜单右侧展开二级编辑节点；对话 Leader 在菜单右侧展开 leader Agent 的 `/playground?view=chat&agentId=<leaderAgentId>&embed=team-console&teamTaskId=<taskId>&teamTaskMode=edit` iframe，并可像 Agent 对话分支一样 resize / 最大化。Leader 对话分支打开时不再展示完整 Task context 预览文本，只在 header 右侧提供“复制 Task 上下文”按钮；按钮会把 taskId、title、status、agents、input text、input/output ports、output contract、acceptance rules、teamTaskMode、teamTaskId 复制为格式化纯文本。复制优先使用 Clipboard API，远程 HTTP 非安全上下文自动 fallback 到隐藏 textarea + `execCommand("copy")`；两种路径都失败时显示”复制失败”状态提示，并临时展开一个小型只读文本框自动选中上下文，用户可按 Ctrl+C 手动复制。Team Console 仍不解析 iframe 聊天文本，仍不自动更新 Task 定义；删除调用 archive 软归档。
- 浅编辑保存时，标题和 leader Agent 只发送 dirty 顶层字段；worker/checker 变更会基于最新 Task catalog 里的当前 `workUnit` 合成完整 PATCH 并只替换 Agent 绑定。编辑节点打开后如果同一字段已经被后台刷新改变，旧草稿保存会被阻止并提示重新打开编辑节点。input text、output contract、acceptance rules 等复杂 WorkUnit 字段不进入 Team Console 可视化编辑 UI。
- 点击“创建 Task”先选择 leader Agent，再打开 `/playground?view=chat&agentId=<leaderAgentId>&embed=team-console&teamTaskMode=create` iframe；Team Console 只打开 leader Agent iframe，不直接创建 Task。
- 创建 / 更新仍由 iframe 内用户显式触发 `/team-task`，并由 runtime skill 调 `POST /v1/team/tasks` 或 `PATCH /v1/team/tasks/:taskId`；Team Console 不解析 iframe 聊天文本创建 Task，不替用户确认 skill 预览 JSON。
- 用户可手动点击“刷新 Task”重新拉取 `GET /v1/team/tasks`；刷新中禁用重复点击，失败保留当前 Task 卡片并显示错误。
- 当已知 active Canvas Task run 通过 `GET /v1/team/task-runs/:runId?view=summary&taskId=:taskId` 轮询基础状态并进入终态时，Live API 前端会自动触发一次 Task refresh，重新读取 Task catalog、connections 和所有 Task run 列表，用于发现 typed chain 自动启动的下游 run；用户从上游 Task 切到下游 Task 时不需要手动刷新。
- 关闭创建分支、浅编辑保存成功、归档成功后会重新请求 `GET /v1/team/tasks`，用于把后端事实刷回画布。
- 点击“运行”会调用 `POST /v1/team/tasks/:taskId/runs` 启动独立 Canvas Task run；前端通过 `GET /v1/team/tasks/:taskId/runs` 读取历史，通过 `GET /v1/team/task-runs/:runId?view=summary&taskId=:taskId` 轮询未展开 active 状态。这个 run 只属于 Canvas Task，不进入 Plan run 列表，也不会增加 Plan `runCount`。
- 点击 Task 菜单里的”最近运行”或”运行中”摘要会展开或收起 Run observer；摘要区域直接展示运行状态、阶段、耗时、attempt 数、进度消息和 run id；Run observer 不再单独渲染 Run 状态 canvas 子节点。Run observer 使用 `GET /v1/team/task-runs/:runId?view=process-summary&taskId=:taskId` 读取展开 run 的过程摘要，并使用单个合并 `run-observer` 面板，而不是多个独立 canvas 子节点。合并面板内部固定顺序为：worker 过程 → worker 输出文件 → checker 过程 → checker 输出文件 → result 文件。文件条目以紧凑行（`.emap-observer-file-row`）展示在合并面板内部，而不是单独的 canvas 节点。点击文件行会在右侧展开第二级文件详情面板，根据文件扩展名使用安全渲染（JSON pretty print、Markdown 使用 `marked` 安全渲染、文本原样展示），不执行 HTML，不使用 `dangerouslySetInnerHTML`；JSON 解析失败时会显示 parse error 消息。文件详情节点支持右下角拖动调整宽高，最小尺寸 360×280，拖动后连接线和布局同步更新。连接线使用 fixed right-middle 到 left-middle 锚点，反向角度时自动重路由，并只在 source 出线端显示半圆 socket。SSE 观察流仍是后续后端能力，不在第一版里硬做。
- Run observer 的过程部分读取 `attempt.roleProcesses.worker` / `attempt.roleProcesses.checker`，在合并面板中分别以"Worker 过程"和"Checker 过程"标题展示，按优先级展示 `assistantText.content`（Agent 自述 / 推理，`formatAssistantText()` 保留换行、中文标点断句、每行独立 `<p>`，最多 5 行超限提示，单行超过 200 字符会截断）、current action + 最新 narration（fallback）。过程部分不再渲染下半部 tool / method 调用明细；完整过程数据仍在 attempt metadata 中，前端不丢弃后端数据，只隐藏 DOM 明细。缺少 `roleProcesses` 时前端保持兼容渲染等待态，不影响菜单运行摘要、文件行和文件详情。
- 第一版 Task run 只执行 `workUnit.workerAgentId` 和 `workUnit.checkerAgentId`，不启动 watcher/finalizer，不支持 pause/resume/rerun；active run 可通过 `POST /v1/team/task-runs/:runId/cancel` 停止。

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

#### discovery-aggregation.json 下游合约

Discovery root 有 generated child auto-run 时，`discovery-result.json` 只是 root 发现阶段的 item 清单；它不是最终给下游报告 / 汇总 Task 消费的数据。generated child auto-run pool 结束后，runtime 会在同一 root attempt 下写入：

```
tasks/<taskId>/attempts/<attemptId>/discovery-aggregation.json
```

文件内容为 `TeamDiscoveryAggregationRecord`（schemaVersion: `team/discovery-aggregation-1`），包含 root discovery item、dispatcher outcome、generated task id、generated run id / status，以及每个 generated child 的 terminal result：

- `summary` 统计 `totalItems`、`generatedTasks`、`succeeded`、`failed`、`cancelled`、`skipped`、`missingResult`
- `items[].itemPayload` 保留 root `discovery-result.json` 中的原始 item
- `items[].dispatch` 保留该 item 的 dispatch/upsert outcome；blocked item 不伪造成 generated result
- `items[].result.content` 是 generated child 的 accepted / failed result 内容快照；同时保留 `resultRef` 和 `generatedRunId` 方便追溯原 child run
- Discovery root 触发 typed downstream 时优先交付 `discovery-aggregation.json`；只有旧 run 或 aggregation 缺失时才 fallback 到 `discovery-result.json`
- `sourceResultRef` 对外固定指向标准 `discovery-result.json` fileRef，不暴露 `worker/...json` 或 `agent-workspaces/...` 这类内部路径

#### Discovery generated Task upsert（Step 06）

Discovery root Canvas Task 成功后，Canvas Task run service 会读取本次 attempt 的 `discovery-result.json`，按每个 item 调用当前 role runner 的 `runDiscoveryDispatcher()`，并把合法 dispatcher draft 写成真实 generated `TeamCanvasTask`。

- generated Task 身份键为 `sourceDiscoveryTaskId + sourceItemId`；同一 Discovery root 的同一 item id rerun 会复用同一个 `taskId`
- 首次出现会创建 `status="ready"` 的 generated Task；`leaderAgentId` 继承 Discovery root，`workerAgentId` / `checkerAgentId` 使用 `discoverySpec.generatedWorkerAgentId` / `generatedCheckerAgentId`
- `generatedSource` 使用 `schemaVersion="team/generated-task-source-1"`，并记录 `itemStatus="active"`、`itemPayload`、latest run / attempt / discoveredAt 和 `workUnitMode="managed"`
- `generatedSource.latestManagedWorkUnit` 是可选 latest managed snapshot；旧 generated Task 缺字段继续可读，字段存在时必须满足完整 WorkUnit schema
- rerun 时始终更新 source metadata 和 `latestManagedWorkUnit`；只有 `workUnitMode="managed"` 时才覆盖 generated Task `title` 和可见 `workUnit`
- 用户通过 public Task update 修改 generated Task `workUnit` 后，`workUnitMode` 会变成 `customized` 且保留 `latestManagedWorkUnit`；之后 Discovery rerun 不覆盖用户改过的 title/input/output contract/acceptance rules，但仍刷新 latest managed snapshot
- `POST /v1/team/tasks/:taskId/generated-workunit/reset` 会把非 archived generated Task 的可见 `title/workUnit` 恢复到 `latestManagedWorkUnit` 并把 `workUnitMode` 标记回 `managed`；缺失 snapshot 的旧数据返回 409，不猜测重建
- 最新 `discovery-result.json` 中缺失的同源 generated Tasks 会标记 `generatedSource.itemStatus="stale"`；不 archive，不改 WorkUnit，不影响其他 Discovery root 的 generated Tasks
- dispatcher 输出 `ok:false`、item mismatch、TaskStore upsert 错误或缺失 optional `runDiscoveryDispatcher()` 时，只记录该 item 的 blocked outcome，不把已 accepted 的 Discovery run 改成 failed
- attempt metadata 可选记录 `discoveryDispatch[]`，status 为 `created` / `updated` / `blocked` / `stale_marked`；每条 outcome 的 `createdAt` 记录该 item 实际落盘时间，旧 attempt 没有该字段时继续按缺省读取

#### Discovery generated Task auto-run scheduler（Step 07）

Discovery dispatch/upsert diagnostics 写入后，runtime 会对本次 Discovery result 中成功创建或更新、`generatedSource.itemStatus="active"` 且当前 `status="ready"` 的 generated Tasks 自动调用 `CanvasTaskRunService.createRun()`。这是固定 v1 调度，不引入新的持久化队列文件，也不绕过现有 worker/checker、observer、cancel、output validation 和文件记录路径。

- v1 并发固定为 3；即使旧数据里的 `discoverySpec.autoRun.concurrency` 异常，也回退到 3。调度池会等待一个 generated run 进入 terminal 后再启动下一个候选，不会一次性把全部 run launch 出去再假装 chunk。
- 候选只来自本次 dispatch 成功的 active generated Tasks；blocked dispatch item、stale generated Task、`generatedSource.itemStatus !== "active"` 的 Task 都不会 auto-run。
- generated Task 当前不是 `ready` 时不启动，记录 `skipped_not_runnable`；已有 queued/running/paused run 时记录 `skipped_already_running`，并尽量带上 existing `generatedRunId`。
- launch 失败只写 attempt metadata，不把已经 accepted 的 Discovery run 改成 failed。
- generated run 的 `TeamRunState.source` 仍是 `{ type: "canvas-task", taskId: <generatedTaskId> }`；`source.triggeredBy` 使用 `{ type: "discovery-generated-task", discoveryTaskId, discoveryRunId, discoveryAttemptId, sourceItemId }` 记录 Discovery 溯源。
- attempt metadata 可选记录 `discoveryGeneratedRuns[]`，status 为 `started` / `skipped_already_running` / `skipped_not_runnable` / `failed`；旧 attempt 或 malformed metadata 继续按缺省读取。

#### Team Console Discovery data/API seam、root summary、subcanvas catalog、generated observer、dispatch diagnostics 和 scoped archive（Step 08A-08E2C）

5174 Team Console 的 API/data seam 现在能读取 Discovery root 的 generated child catalog，并从最新 root Discovery run attempt metadata 读取 blocked dispatch diagnostics，再把聚合 summary 投到 root Discovery 卡片；root Discovery Task 菜单还能打开独立 Discovery subcanvas catalog panel。这个 panel 支持 generated child run/cancel、latest-run observer、attempt file detail、light edit、reset-to-managed、blocked dispatch diagnostics 和 scoped soft archive/delete。

- `LiveTeamApi.listGeneratedTasks(discoveryTaskId, options?)` 调用 `GET /v1/team/tasks/:taskId/generated-tasks`，会 URL encode `taskId`，并只在 `includeArchived` 为 true 时追加 `includeArchived=1`。
- live adapter 接受 `{ tasks }` 响应，也兼容 bare array；404 返回空数组，避免旧本地后端让整个 console 挂掉。
- Mock API fixture 包含一个 Discovery root、active generated child、stale generated child 和 archived generated child；`listTasks()` 仍只返回 root Tasks，generated children 只能通过 `listGeneratedTasks()` 读取，默认排除 archived。
- `useTeamConsoleLiveData()` 维护非视觉状态：`generatedTasksByDiscoveryTaskId`、`discoverySummariesByTaskId` 和 `discoveryDispatchDiagnosticsByTaskId`。summary 当前包含 Discovery 阶段、generated 总数、active 数、stale 数、running/completed generated run 数、dispatch processed 数和 failed dispatch 数；failed dispatch 只统计最新 root Discovery attempt 的 `discoveryDispatch[].status === "blocked"`。
- 初始 live load 和 `refreshLiveTasks()` 都先以 root `GET /v1/team/tasks` 为主画布 canonical list，再按 Discovery roots 拉 child catalog；generated Tasks 不进入 root `tasks` state，也不会出现在主 canvas/root list。
- generated children 的 `GET /v1/team/tasks/:taskId/runs` 结果会并入现有 `taskRunsByTaskId`，subcanvas run/cancel 和 observer 均复用当前 Canvas Task run 管线。
- Root Discovery 卡片显示 `Discovery` 身份、阶段 pill 和 `items / active / stale / running / blocked` summary row，并暴露 `data-discovery-stage` / `data-discovery-failed-dispatch-count`；该 summary 只来自 `discoverySummariesByTaskId`，缺失时回退为 0，不把 generated child 直接挂进 root `tasks`。
- Discovery 卡片额外高度由 `canvasTaskNodeHeight()` 统一计算，避免 summary row 挤压 agent grid、typed ports、dependency handle 或 drag/drop hitbox。
- Task 操作菜单只在 root Discovery Task 上显示 `Discovery 子画布` toggle；普通 Task 和 generated child 不显示该入口。
- Subcanvas catalog panel 复用既有 `taskChildBranchPanels` child panel 系统，`sourceId` 指向当前 Task menu panel，并从 `generatedTasksByDiscoveryTaskId[discoveryTaskId]` 渲染非 archived generated Tasks；顶部阶段条暴露 `data-discovery-stage-for`，显示 Discovery / Dispatch / Auto-run / Aggregation / Cancelled 阶段和 processed、running、completed、generated、blocked 聚合计数。
- Subcanvas diagnostics block 暴露 `data-discovery-dispatch-diagnostics-for`、`data-dispatch-blocked-count` 和 `data-dispatch-item-id`，只显示 blocked item id 与 concise error，不展示 raw `itemPayload`，也不把 diagnostics 生成 Task。
- 每张 generated card 暴露稳定 data attrs：`data-discovery-subcanvas-for`、`data-generated-task-id`、`data-generated-item-status`、`data-generated-workunit-mode`、`data-generated-run-status`，并用 `data-generated-action="run|cancel|observe-run|edit|reset-workunit|archive"` 标记 run/stop/latest-run observer、浅编辑、reset 和 scoped 归档操作。
- generated child observer 是 root Discovery branch 的嵌套状态：`detailMode="discovery-subcanvas"` 保持子画布打开，`discoveryGeneratedObserver` 指向 generated task/run/file selection。它使用 `generatedTasksByDiscoveryTaskId` 派生的 generated lookup，不读 root `tasksById`，也不把 generated Task 塞进 root `taskNodes`。
- generated observer 继续走单一 `taskRunObserverByRunId` effect，调用既有 `GET /v1/team/task-runs/:runId/tasks/:taskId/attempts` 和 attempt file API；panel 暴露 `data-generated-observer-task-id` / `data-generated-observer-run-id`，文件详情从 generated observer panel 继续向右展开。
- generated child archive/delete 只在 Discovery 子画布 generated card 内显示 scoped confirm（`data-generated-archive-confirm-for`），确认后调用 Team Console adapter 的 `archiveTask(taskId)` / 既有 `POST /v1/team/tasks/:taskId/archive`。成功时只过滤所属 `generatedTasksByDiscoveryTaskId[sourceDiscoveryTaskId]` 并重算 root Discovery generated/active/stale/running summary，blocked dispatch count 保持独立；失败时保留 generated card 和 Discovery 子画布并显示页面 error banner。

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
| `src/team/run-workspace-attempts.ts` | attempt metadata、worker/checker/watcher 文件、discovery-result、discovery-aggregation 和 role workspace 文件读取 |
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
- `discoveryDispatch[]` — Discovery item 转 generated Task 的诊断记录，status 为 `created` / `updated` / `blocked` / `stale_marked`
- `discoveryGeneratedRuns[]` — Discovery generated Task auto-run launch 诊断记录，status 为 `started` / `skipped_already_running` / `skipped_not_runnable` / `failed`

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

### Task API

| 方法 | 路径 | 语义 |
|------|------|------|
| GET | `/v1/team/console/root-summary` | Team Console root 轻量摘要聚合接口；返回 root Tasks、source nodes/connections、task connections/dependencies、root latest run summaries、deleted ids 和 `{ taskCatalog, taskRunSummary }` serverVersion；支持 `taskSince` / `runSince` 独立 cursor |
| GET | `/v1/team/tasks` | 列出未归档 root Task；`?includeArchived=1` 可包含归档 root，`?includeGenerated=1|true` 才包含 generated Tasks |
| POST | `/v1/team/tasks` | 创建普通 Task draft 或 Discovery root Task；必须包含 `leaderAgentId` 和完整 `workUnit`，Discovery root 还需 `canvasKind="discovery"` 和 `discoverySpec`；public route 拒绝 `generatedSource` |
| GET | `/v1/team/tasks/:taskId` | 查看单个 Task |
| GET | `/v1/team/tasks/:taskId/generated-tasks` | 只读列出某个 Discovery root Task 旗下 generated Tasks；默认排除 archived，`?includeArchived=1|true` 时包含；`?view=summary&since=<iso>` 返回 changed summaries、`deletedTaskIds` 和 `serverVersion` |
| POST | `/v1/team/tasks/:taskId/generated-workunit/reset` | 将非 archived generated Task 的 visible WorkUnit/title 恢复到 `generatedSource.latestManagedWorkUnit`，并把 `workUnitMode` 标记回 `managed`；缺失 snapshot 返回 409 |
| PATCH | `/v1/team/tasks/:taskId` | 更新未归档 Task draft 的 `title`、`leaderAgentId`、`workUnit`、`status` 或 Discovery root 的 `discoverySpec`；public route 拒绝 `canvasKind` / `generatedSource`，不允许修改 locked Task 的 `workUnit` |
| POST | `/v1/team/tasks/:taskId/archive` | 软归档 Task |
| GET | `/v1/team/tasks/:taskId/runs` | 列出某个 Canvas Task 的独立 Task run |
| POST | `/v1/team/tasks/:taskId/runs` | 启动某个 ready Canvas Task 的 worker → checker run |
| GET | `/v1/team/task-runs/:runId` | 读取独立 Task run 状态 |
| GET | `/v1/team/task-runs/:runId?view=summary&taskId=:taskId` | 读取某个 Task 在该 run 内的轻量状态，用于未展开 active run polling |
| GET | `/v1/team/task-runs/:runId?view=process-summary&taskId=:taskId` | 读取展开 Run observer 所需的 run summary 与 attempts process summary，不返回 heavy process entries |
| POST | `/v1/team/task-runs/:runId/cancel` | 取消 active Task run |
| GET | `/v1/team/task-groups` | 列出未归档 Team Task Groups；`?includeArchived=1|true` 时包含已归档 Group，响应为 `{ groups: ResolvedTeamTaskGroup[] }` |
| POST | `/v1/team/task-groups` | 创建持久 Team Task Group；请求 `{ title, taskIds }`，只校验 title 与 taskIds shape，empty/invalid membership 会保存并通过 `{ group.status, group.headTaskIds, group.validation.errors }` 暴露 |
| GET | `/v1/team/task-groups/:groupId` | 读取单个 Group 的 resolved view，找不到返回 404 |
| PATCH | `/v1/team/task-groups/:groupId` | 更新 Group 的 `title` 和/或 `taskIds`，保存后返回 resolved view；non-array 或非空字符串以外的 `taskIds` entries 返回 400 |
| POST | `/v1/team/task-groups/:groupId/archive` | 软归档 Group；不删除 Task、connection、dependency 或 run history |
| POST | `/v1/team/task-groups/:groupId/runs` | 启动 GroupRun；同轮启动 Group head tasks，invalid/empty Group 返回 400，active GroupRun 或 Group 内 active Task run 返回 409 |
| GET | `/v1/team/task-groups/:groupId/runs` | 列出某 Group 的 GroupRuns |
| GET | `/v1/team/task-group-runs/:groupRunId` | 读取并刷新单个 GroupRun 聚合状态 |
| POST | `/v1/team/task-group-runs/:groupRunId/cancel` | 取消 active GroupRun，并取消 Group 内 active Canvas Task runs |
| GET | `/v1/team/task-runs/:runId/tasks/:taskId/attempts` | 读取 Task run 的 attempt metadata，包含可选 `roleProcesses.worker` / `roleProcesses.checker` |
| GET | `/v1/team/task-runs/:runId/tasks/:taskId/attempts/:attemptId/files/:fileName` | 读取 Task run 的 attempt 文件 |
| GET | `/v1/team/task-runs/:runId/artifacts/:roleKey/:role/*` | 读取 role public output 目录中的交付文件；默认文件为 `index.html`，路径限制在该 role 的 `output` 目录内 |

`POST /v1/team/tasks` 仍只创建 Task draft，不会创建 Plan，也不会自动启动 worker/checker。Task run 必须显式调用 `POST /v1/team/tasks/:taskId/runs`；Task run 存在 `.data/team/task-runs`，不进入 Plan run API，也不受 `TEAM_MAX_CONCURRENT_RUNS` 约束。同一 Task active guard 仍由 Canvas Task run service 自己按 `taskId` 执行。

Canvas Task 的 worker/checker/finalizer 等 role workspace 有稳定 public output 目录。真实 AgentProfile runner 会把当前 role 的 `output` 目录写入 `ARTIFACT_PUBLIC_DIR`，并把基于当前 run、roleKey 和 role 拼出的公开 URL 写入 `ARTIFACT_PUBLIC_BASE_URL`。Role prompt 会要求 agent 把可交付文件写到该目录；私有中间文件仍可留在当前工作目录。这个契约用于替代临时 `python -m http.server`、`localhost:9001/report.html` 一类只能在 worker 容器内部短暂可见的链接。

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
- 需要并发执行多个 Plan / TeamOrchestrator run 时，先把 `TEAM_MAX_CONCURRENT_RUNS` 设为大于 1，再启动多个 `ugk-pi-team-worker` 实例；Canvas Task run 不使用这个全局 admission。
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
| `TEAM_MAX_CONCURRENT_RUNS` | 1 | Plan / TeamOrchestrator 最大并发 active run 数（queued/running/paused）；通过原子 admission lock 执行；多个 worker 进程可通过 lease 机制 claim 不同的 queued run；不约束 Canvas Task run |
| `TEAM_WORKER_ID` | 自动生成 | 单 worker 排障时可覆盖；多 worker 扩容时不要在共享 `.env` 中写死同一个值 |
| `TEAM_WORKER_PHASE_TIMEOUT_MS` | 900000 | Worker phase 超时（默认 15 分钟） |
| `TEAM_CHECKER_PHASE_TIMEOUT_MS` | 300000 | Checker phase 超时（默认 5 分钟） |
| `TEAM_WATCHER_PHASE_TIMEOUT_MS` | 300000 | Watcher phase 超时（默认 5 分钟） |
| `TEAM_FINALIZER_PHASE_TIMEOUT_MS` | 300000 | Finalizer phase 超时（默认 5 分钟） |
| `TEAM_MAX_RUN_DURATION_MINUTES` | 100 | Run 最大持续时间（分钟）；可 per-run override |

Docker Compose 默认设置：

- `docker-compose.yml`：`TEAM_USE_MOCK_RUNNER=true`，`TEAM_RUNTIME_ENABLED=true`
- `docker-compose.yml`：`ugk-pi-team-console` 固定暴露 `127.0.0.1:5174`，通过 `TEAM_CONSOLE_API_TARGET=http://ugk-pi:3000` 代理到真实后端 `ugk-pi:3000`
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
docker compose up -d ugk-pi ugk-pi-team-console  # 只启动后端 + Team Console 固定入口
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
| `src/team/run-workspace-attempts.ts` | attempt metadata、attempt 文件、role workspace 文件、discovery-result 和 discovery-aggregation 持久化 |
| `src/team/run-workspace-artifacts.ts` | final-report 和 run-scoped 文件读取 |
| `src/team/run-workspace-records.ts` | expansion / decomposition records 与 generated child task state append |
| `src/team/output-validator.ts` | P26 deterministic output contract validator：JSON items/object、HTML fragment、file exists、run-scoped file reference safety |
| `src/team/run-state-events.ts` | 进程内 run state 变更通知（subscribe/notify） |
| `src/team/team-unit-store.ts` | TeamUnit 存储 |
| `src/team/task-store.ts` | Team Canvas Task 持久化：`.data/team/tasks/<taskId>.json`、旧字段兼容、归档过滤 |
| `src/team/task-port-contract.ts` | Typed Task port contract：port id/type 校验、input/output port 查找和展示标签 |
| `src/team/task-connection-store.ts` | Typed Task connection store：`.data/team/task-connections.json`、类型匹配、重复连接和 DAG cycle 防护 |
| `src/team/task-validation.ts` | Task create/update schema policy：leader / worker / checker Agent、WorkUnit 输入 / 输出契约 / typed ports / 验收规则校验 |
| `src/team/task-run-service.ts` | Canvas Task 独立 run service：ready 校验、worker → checker 执行、task-runs 工作区、cancel、typed artifact 下游触发 |
| `src/team/task-run-process-recorder.ts` | Canvas Task role process recorder：复用主 chat process 投影、节流写入 attempt `roleProcesses`、取消 / 失败 / 完成 flush |
| `src/team/plan-store.ts` | Plan 持久化和 runCount 不变式 |
| `src/team/plan-validation.ts` | Plan create/update schema policy：task type、decomposer、for_each、outputCheck 校验 |
| `src/team/config-locks.ts` | 活跃 run 对 Plan / TeamUnit / AgentProfile 的锁计算 |
| `src/team/agent-profile-role-runner.ts` | 真实 AgentProfile runner adapter：profile/session/browser/workspace/abort/runtimeContext 接线 |
| `src/team/role-prompt-contract.ts` | 纯 role prompt contract：worker/checker/watcher/finalizer/decomposer/discovery-dispatcher prompt builder、JSONish parser 和 output normalizer |
| `src/team/role-runner.ts` | mock runner 与 runner interface（含 `runDecomposer` 和 `runDiscoveryDispatcher` contract） |
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
| `.pi/skills/team-task-creator/SKILL.md` | 只创建 / 更新 Team Canvas Task draft 的运行时 skill |

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

Canvas Task 独立 run 只对 worker/checker 使用 adaptive phase timeout：

- `TEAM_WORKER_PHASE_TIMEOUT_MS` / `TEAM_CHECKER_PHASE_TIMEOUT_MS` 仍是外部配置入口，但在 Canvas Task run 中语义为 idle window，而不是固定总时长。
- 结构性进展只包括 role session 的 `tool_execution_end` 和 role public output 目录文件新增/变化；普通 message text/thinking 不刷新 idle window。
- hard cap 是内部兜底：worker 默认 3600000ms，checker 默认 1800000ms。hard cap 优先防止工具循环或持续写文件无限续命。
- timeout 失败仍使用既有 `worker timeout` / `checker timeout` 摘要；attempt result 会额外写 timeout 证据字段。
- 如果主服务重启导致 Canvas Task 后台执行者丢失，`registerTeamRoutes()` 会调用 `CanvasTaskRunService.recoverDetachedRuns()`：detached `queued` run 重新进入后台执行，detached `running` run 直接失败收口，不再无限显示 running。
- Plan / TeamOrchestrator run 仍使用原固定 `runWithTimeout` 路径，watcher/finalizer 不受 Canvas adaptive timeout 影响。

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
3. **Plan 默认单活跃 run** — `TEAM_MAX_CONCURRENT_RUNS` 默认为 `1`，即 Plan / TeamOrchestrator 全局只允许一个 queued/running/paused run。设置为更大的值可允许并发 Plan active run，但单个 worker 进程仍顺序执行；多 worker 进程可通过 lease 机制分别 claim 不同的 queued run。Canvas Task run 不使用该限制，只保留同一 Task 一个 active run 的 guard。
4. **默认 run timeout 100 分钟** — 可通过 `TEAM_MAX_RUN_DURATION_MINUTES` 或 per-run override 调整。
5. **浏览器实例由既有 browser registry/env 决定** — Team 复用 chat/conn 的 browser binding 链路，不负责创建或调度 Chrome profile。多个 role 是否真正落到不同浏览器实例，取决于 AgentProfile 的 `defaultBrowserId` 与 `UGK_BROWSER_INSTANCES_JSON` 等既有配置。
6. **Plan draft router 只是确定性浅层 heuristic** — 不调用 LLM，不做语义规划；当前只支持 `single_agent` 和 `parallel_research`。`/playground/team` 只展示 `自动匹配` / `单 Agent` / `并行研究`，planned 模板只保留在 registry 里说明未来方向，不能生成 draft。
7. **可视化 Plan 创建不是本阶段重点** — UI builder 只保留普通计划、discovery → for_each 常见模式和快速 Plan draft 辅助。高级 Plan 结构或复杂任务设计优先通过 Agent 对话 / `team-plan-creator` skill 产出，再由 Team Runtime 执行和审计；不要继续把 `/playground/team` 扩成完整 Plan 编辑器。
8. **for_each parallel 固定容量** — 并行模式使用固定池（容量 3），不可配置；嵌套 for_each 尚未支持。
9. **Controlled decomposition 只支持有界顺序执行** — 运行时只允许 `propagate -> leaf | none`、`leaf -> none`；child task 必须是 normal；不支持并行 child execution、无限传播或 nested for_each。
10. **Decomposition UI 只展示，不编辑** — `/playground/team` 只显示 decomposer badge 和 split hierarchy；不提供可视化编辑器。Run detail API 通过 `taskDefinitions` 暴露由 expansion/decomposition records 汇总出的 generated child definitions；旧 run 或缺少记录的 run 会退回为普通「子任务」分组。
11. **无 AgentTaskExpansionPlanner** — 动态任务扩展目前使用模板展开（`TemplateTaskExpansionPlanner`），尚无 AI 驱动的智能扩展。
12. **Typed Task Chain V1 不是工作流平台** — 当前支持 typed port 连接、上游通过 checker 后自动触发下游、同一 output port fan-out 到多个不同下游 Task；不支持条件分支、循环、多上游 merge、wait-all、同一 target Task 多 input bundling 或自由工作流编排。

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
