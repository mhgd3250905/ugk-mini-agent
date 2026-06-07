# 更新记录

这份文档用来记录仓库层面的可追溯更新。

规则很简单，别搞花活：

- 任何影响外部行为、运行方式、接口、文档结构或协作约定的改动，都要在同一轮补一条记录
- 每条记录至少写清：日期、主题、影响范围、对应入口
- 本文件只保留近期窗口，目标不超过 500 行或最近 30 天；稳定旧记录交给 Git 历史
- 新条目写结论和入口，不贴长命令输出、完整测试矩阵、排障直播或单次 UI 微调细节
- 如果只是纯局部代码重构且对外无感，可以不记；但只要会影响下一个接手的人，就应该记

当前配置事实不要从旧流水账里倒推。历史条目里出现的 `deepseek-anthropic`、DeepSeek `openai-completions`、智谱复用 `ANTHROPIC_AUTH_TOKEN`、或通过 `*-api.txt` 注入 key，均只表示当时发生过，不代表当前规范。当前模型源以 `docs/model-providers.md`、`runtime/pi-agent/models.json`、`.env.example` 和 `/v1/model-config` 为准。

---

## 2026-06-07 — Team Console Task node visual focus

- **主题**: Team Console 根 Task 节点选中阴影改为跟随“最后点击的 Task”，不再跟随 Task branch stack 的最后展开项。A/B/A 场景中，第三次点击 A 会收起 A 的 Task 操作面板，但 A 仍保持选中视觉；B 的面板仍可保持展开，视觉焦点不会错误落回 B。
- **影响范围**: 仅 5174 Team Console Execution Atlas 根 Task 节点的 selected class 计算。Task branch 多面板栈、Discovery 子画布、run history/observer 子面板布局 id 和拖拽位置不变。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/src/tests/app-static-contracts.test.ts`。

## 2026-06-07 — Team Console run history lightweight paging

- **主题**: Team Console Task 运行记录面板首屏改为轻量分页。打开运行记录时只请求 `limit=3&offset=0`，面板显示已加载数量和总数，点击“加载更多”再按 3 条分页追加，避免以后 Task run 历史很多时首屏请求直接搬 50 条。
- **接口跟进**: `/v1/team/tasks/:taskId/run-history` 继续返回 `total/limit/offset/runs`，新增 `hasMore`；后端改用 `listRunSummariesByTaskIds()` 的 run state index summary 读取路径，不再为 history 列表读取完整 run state 后再截断。history summary 仍省略 heavy `boundInputs`。
- **视觉收口**: `.emap-run-history-list` 补齐浅色/深色主题 scrollbar 样式，避免运行记录列表退回系统白色滚动条。
- **对应入口**: `src/team/routes.ts`、`src/team/types.ts`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/app/app.css`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/src/tests/app-static-contracts.test.ts`、`test/team-task-run-routes.test.ts`。

## 2026-06-07 — Team Console Agent branch mini/full chat embed

- **主题**: Team Console Agent 卡片展开改为两阶段对话。普通画布分支打开 `/playground?embed=team-console&embedMode=mini`，只保留新会话、上下文用量、消息区和输入框；点击最大化或双击分支头后切到 `/playground?embed=team-console&embedMode=full`，恢复完整 Playground 历史列表、文件库、后台任务和 Team Runtime 入口。mini 顶栏中“新会话”固定左侧，上下文用量固定右侧，API 源不再单独占位，避免和上下文悬浮详情重复；新会话 tooltip 在 mini 内左对齐弹出，不再被 iframe 左边缘裁切。
- **跟进**: Agent/Leader iframe 增加 `allow="clipboard-write; clipboard-read"`，修复嵌入对话气泡右下角“复制正文”按钮在 iframe 权限层没有作用的问题。
- **影响范围**: 仅 Team Console 嵌入式 `/playground` iframe 和 `embed=team-console&embedMode=mini` 的 scoped CSS；主 `/playground` 普通入口不进入 mini 样式。Task 创建和 Task Leader 对话仍使用 full embed。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/graph/ExecutionMap.tsx`、`src/ui/playground.ts`、`src/ui/playground-styles.ts`、`apps/team-console/src/tests/app-branch-windowing.test.tsx`、`test/playground-agent-switch.test.ts`。

## 2026-06-07 — Team typed artifact file-first handoff

- **主题**: Team typed artifact 下游交付改为 file-first。typed connection 触发 worker 前，runtime 会把每个上游 typed artifact 的完整文件复制到当前 worker `workDir/bound-inputs/`，并在 payload/prompt 中提供 `workspaceFileRef` / `workspaceFilePath`；prompt 中的 artifact 内容只作为预览和追溯，不再作为唯一数据来源。
- **影响范围**: 修复大 JSON / Discovery aggregation 因 `TEAM_TASK_ARTIFACT_CONTENT_LIMIT` 截断导致下游只处理部分数据的问题。状态 payload 仍保留有限 `content` 和 `preview` 防止 prompt/state 膨胀；超限 artifact 会标记 `contentTruncated` 与 `originalContentLength`。
- **验证**: 新增普通 typed artifact、public worker JSON、超大 JSON、Discovery aggregation 和历史 run selection 回归；`npx tsc --noEmit`、`npx tsx --test test/team-task-artifact-handoff.test.ts`、`npx tsx --test test/team-task-run-process.test.ts`、`npm run test:team` 通过。
- **对应入口**: `src/team/task-bound-input-materialization.ts`、`src/team/canvas-task-attempt-runner.ts`、`src/team/task-artifact-handoff.ts`、`src/team/types.ts`、`test/team-task-artifact-handoff.test.ts`、`test/team-task-run-process.test.ts`。

## 2026-06-07 — Team Console Discovery root run history placement

- **主题**: 修复 Discovery 子画布打开时，点击 root Task 菜单“运行记录”会把 Discovery root 运行记录挂到子画布下一级的问题。现在 root 运行记录会关闭子画布，并作为与 Discovery 子画布同级的 Task child panel 展开；点击 generated card 打开 generated Task 运行记录仍保留在子画布下一级，且 generated history 使用独立布局 id，不再和 root history 混用拖拽位置。
- **跟进**: run history 条目恢复“查看运行过程”主动作，整张运行记录卡片都可点击选中/展开 observer，操作按钮会阻止冒泡避免误展开；Discovery root 最近运行 observer、root history observer 和 generated history observer 使用不同 panel id，避免拖拽位置串用。
- **视觉收口**: 深色模式 selected run history action 不再被浅色按钮样式覆盖；run observer 外层取消大滚动，保持内容自适应高度，Worker / Checker 过程区继续使用固定高度与内部滚动。
- **影响范围**: 仅 5174 Team Console 的 Discovery root Task / generated Task 运行记录 panel 层级、run history 卡片交互、observer panel 布局 id 和局部样式；后端 run history、Discovery generated catalog、GroupRun 和 Conn contract 不变。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/app/app.css`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/src/tests/app-run-observer.test.tsx`、`apps/team-console/src/tests/app-static-contracts.test.ts`。

## 2026-06-06 — Team Console run observer upward drag fix

- **主题**: 修复 Team Console Task 最近运行/运行观察子面板无法向画布原点上方拖动的问题。Task child panel 现在保留用户拖拽产生的负 `y` override，不再在布局阶段把 `top` 钳到 `0`。
- **影响范围**: 仅 5174 Team Console Execution Atlas 的 Task 子面板拖拽行为，覆盖运行观察中的 Worker/Checker 过程节点和同一布局链路下的 Task child panel。`x` 轴非负限制、后端 TaskRun/GroupRun/Conn contract 均不变。
- **验证**: 用户真实页面测试确认通过；新增回归断言要求 observer process panel 能拖到 `top < 0`。相关 observer/UI 测试、build、typecheck 和 `git diff --check` 已通过。
- **对应入口**: `apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/tests/app-run-observer-interactions.test.tsx`。

## 2026-06-06 — Team Console load smoothness

- **主题**: 优化 Team Console 初始加载流畅性。Live hydration 不再触发无意义的首次 `PATCH /v1/team/console-layout`，恢复加载最短显示时间从 1000ms 收敛到 160ms，并修正 loading -> workspace 切换时的布局抖动。
- **影响范围**: 仅 5174 Team Console 初始加载、canvas restore/hydration 和 loading skeleton。后端 API、Conn、GroupRun、Discovery contract 不变。
- **验证**: 真实浏览器 PerformanceObserver 显示初始加载 CLS 从约 0.48 降为 0.00，初始网络只剩 GET，无 layout PATCH；Team Console 相关测试、build、typecheck 和 `git diff --check` 已通过。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/app/app.css`、`apps/team-console/src/tests/app-canvas-state.test.tsx`。

## 2026-06-06 — Team Console Group dock and toolbar consolidation

- **主题**: Team Console 根节点筛选与数量统计合并为一个高密度 segmented control：`ALL`、`Agent`、`Task`、`Source` 四个筛选项直接显示数量，独立 Agent/Task/Source 统计块移除。`Task` 筛选不再顺带显示 Source，Source 有独立筛选入口。
- **影响范围**: 仅 5174 Team Console Execution Atlas 前端交互、Dock 和测试合同。Group 内 Task 拖到画布底部 Dock 区域时不再触发 Task 收纳，避免 Group 成员被误收起导致 Group 看起来缺成员；展开 Group 新增“收纳”操作，收纳的是整个 Group，Dock 中显示为 Group 对象，点击后恢复 Group 和成员 Task。
- **跟进**: mock 工作区初始化会把 Discovery catalog 返回的 root/generated run summary 合回 `taskRunsByTaskId`，让 Dock 和画布状态能够按最新 run status 显示，而不是退回静态 Task status。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/app/use-team-console-live-data.ts`、`apps/team-console/src/app/app.css`、`apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/graph/execution-map.css`。

## 2026-06-06 — Team Console run history audit-card redesign

- **主题**: Team Console 运行记录从字段堆叠式卡片改为运行审计卡片。运行记录主视觉现在优先展示开始时间和执行时间，状态作为紧凑 badge，结果产物降级为证据路径，操作按钮收口到卡片底部工具条。
- **影响范围**: 仅 5174 Team Console run history / run observer 前端展示与 canvas child panel 布局兜底；后端 RunHistory、TaskRun、GroupRun、Conn contract 不变。运行观察不再展示 `connectionId` / upstream run / artifact / fileRef 这类内部账本，输入来源只在右上角标记为“手动上游输入”或“自然运行流入”。子面板会 clamp 负坐标，运行观察长内容使用内部滚动，避免打开后标题或底部内容被视口裁掉。
- **跟进**: 运行记录卡片进一步精简为时间线列表，仅展示开始时间、状态、执行时间和装载记录 / 标为最佳 / 归档记录三个操作；runId、结果产物、触发来源、已装载/最佳/归档徽标与 note 不再作为可见内容展示，只保留必要 `data-*` 状态给交互和测试使用。
- **跟进**: Discovery 子画布 generated Task 打开的运行历史面板重新锚定到对应子画布 panel，不再从上一级 root Task 菜单引线；地图 panel DOM 增加 `data-panel-source-id` 便于回归验证 child panel 链路。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/app/app.css`、`apps/team-console/src/graph/ExecutionMap.tsx`。

## 2026-06-06 — Team Console Group member chain rows

- **主题**: 5174 Team Console 展开 backend Group 时，顶部成员 chip 不再按视觉坐标或原始 `taskIds` 平铺，而是按 Group 的头结点流水线分行展示：一个 `headTaskId` 一行，沿 active internal `TeamTaskConnection` 顺着下游 Task 排列。
- **影响范围**: Group 成员展示顺序现在以后端 `ResolvedTeamTaskGroup.headTaskIds` 和当前 active 内部连接为准；旧 mock / 缺 head 数据只作为 fallback。展开 Group 同步补齐最小宽度、完整操作按钮、`1 Task` 单复数、底部可复制 `groupId` chip 和 validation message 的间距展示。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/tests/app-static-contracts.test.ts`、`docs/handoff-current.md`。

## 2026-06-06 — Conn invalid Team Group start diagnostics

- **主题**: 已保存的 `team_group` Conn 指向后来变成 empty/invalid 的 Team Group 时，GroupRun start 返回 400 会把 ConnRun 明确标记为 `failed`，并写入 Team Group start failure 诊断 snapshot。
- **影响范围**: 非 2xx/non-409 GroupRun start failure 会保存 `resolvedSnapshot.executionType="team_group"`、`groupId`、`groupRunStartStatus` 和 `groupRunStartError`；`/playground/conn` 与 `/playground` Conn manager 的 run detail 在没有 `groupRunId` 时仍显示 Team Group、start status/error 和 Group JSON。409 active guard 仍是 succeeded skipped，Conn editor 继续禁用 invalid Group 并要求选择可运行 Group。
- **对应入口**: `src/workers/team-group-conn-runner.ts`、`test/conn-team-group-runner.test.ts`、`src/ui/conn-page-js.ts`、`src/ui/playground-conn-activity-controller.ts`、`test/server.test.ts`、`docs/runtime-assets-conn-feishu.md`、`docs/team-runtime.md`。

## 2026-06-06 — Team Console mutable Group membership UI

- **主题**: 5174 Team Console Live API 模式接入 mutable Group membership 编辑。empty/invalid backend Group 不再因没有可见成员 Task 从 Execution Atlas 消失；空 Group 会显示稳定 carrier、`0 Tasks` 和 `data-task-group-empty="true"`，并禁用 `运行 <Group>`。
- **影响范围**: Live Group 可通过 `PATCH /v1/team/task-groups/:groupId` 添加当前选中 Task 或移除单个成员；移除最后成员后保留 empty invalid Group 可见。Live `canvas-ui-state` 仍只保存 `taskGroupDisplayStates`，不保存 backend `taskIds` 或 `taskNodeIds`。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/tests/app-connections.test.tsx`、`apps/team-console/src/tests/team-api.test.ts`。

## 2026-06-06 — Team Group mutable membership backend contract

- **主题**: Team Task Group definition 保存阶段与运行阶段语义拆分。`POST/PATCH /v1/team/task-groups` 现在允许 empty/invalid membership 持久化，并通过 `ResolvedTeamTaskGroup.status/headTaskIds/validation.errors` 表达 read model；`POST /v1/team/task-groups/:groupId/runs` 才硬拒绝 empty/invalid Group，返回 400 `invalid task group`，不使用 409。
- **影响范围**: 新建 `TeamTaskGroupRun` 增加 `definitionSnapshot: { taskIds, headTaskIds }`；GroupRun refresh/cancel 优先使用 snapshot membership，旧 run 缺 snapshot 时 fallback 当前 Group。Conn `team_group` active guard 的 409 skipped 语义保持不变，invalid/empty Group start 会作为 failed ConnRun 处理。
- **对应入口**: `src/team/types.ts`、`src/team/task-group-store.ts`、`src/team/task-group-run-store.ts`、`src/team/task-group-run-service.ts`、`test/team-task-group-routes.test.ts`、`test/team-task-group-run-routes.test.ts`、`docs/team-runtime.md`、`docs/runtime-assets-conn-feishu.md`。

## 2026-06-05 — Team GroupRun completion follows Group pipeline

- **主题**: Team Task GroupRun 终态聚合改为按 Group 内真实 Task 流水线判断。`entry` / `downstream` Group 成员 run 和内部 typed/control delivery 仍决定 GroupRun 是否 `completed`、`completed_with_failures`、`cancelled`；由 Discovery root 触发的 `discovery-generated` child run 继续进入 `observedRuns` 作为诊断，但其失败不再把已完成的 Group 主流水线拖成 `completed_with_failures`。
- **影响范围**: `team_group` Conn scheduler 的结果语义随之收窄：当 Group 主流水线完成时，generated child 的 checker 格式错误或模型内容安全拒绝不会让 ConnRun 失败；真正的 Group 成员 Task 失败、取消或内部边交付失败仍会传播为非成功终态。既有已落盘终态 GroupRun 不自动回算。
- **对应入口**: `src/team/task-group-run-service.ts`、`test/team-task-group-run-routes.test.ts`、`docs/team-runtime.md`、`docs/runtime-assets-conn-feishu.md`。

## 2026-06-05 — Team Console run history visual polish

- **主题**: Team Console 运行记录抽屉改为状态化历史卡片，选中 run 使用更明确的高亮和 `aria-current`；Discovery 子画布点击 generated child 展开运行记录时，来源卡片保留蓝青高亮边框和顶部标记；running / busy 执行态统一改为蓝青色，不再使用类似危险态的橙红色。
- **影响范围**: 仅 5174 Team Console 运行记录和 Execution Atlas 前端展示、样式合同测试与文档。后端 run history、TaskRun、GroupRun、Discovery catalog 合同不变。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/app/app.css`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/src/tests/app-static-contracts.test.ts`、`apps/team-console/README.md`、`docs/team-runtime.md`。

## 2026-06-05 — Team Console hides stale Discovery generated items by default

- **主题**: Team Console Discovery 子画布默认只在主 generated grid 显示 active generated child，`stale` child 折叠为“显示旧项”诊断入口；展开后进入单独 stale lane，可继续 reset-to-managed 或归档。
- **影响范围**: 仅 5174 Team Console Discovery 子画布展示口径、样式、测试和文档。后端 generated catalog / stale marking / upsert 合同不变，root Discovery 卡片仍显示 stale 计数，generated child 仍不进入 root canvas。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/README.md`、`docs/team-runtime.md`。

## 2026-06-05 — Conn Team Group run detail diagnostics

- **主题**: `/playground/conn` 和 `/playground` Conn manager 的 Team Group run detail 增加轻量 JSON 诊断链接。存在 `groupId` 时显示同源 `/v1/team/task-groups/<encoded groupId>`，存在 `groupRunId` 时显示同源 `/v1/team/task-group-runs/<encoded groupRunId>`，链接新窗口打开并使用 `noreferrer`。
- **影响范围**: 仅 `src/ui` run detail 展示、静态页面合同测试和 Conn 运行文档；不新增后端 endpoint，不改变 Conn worker、GroupRun、TaskRun 执行 / 取消 / 状态映射，`agent_prompt` Conn 旧路径保持不变。
- **对应入口**: `src/ui/conn-page-js.ts`、`src/ui/playground-conn-activity-controller.ts`、`test/server.test.ts`、`docs/runtime-assets-conn-feishu.md`。

## 2026-06-05 — Conn Team Group safe E2E and empty POST fix

- **主题**: 完成 `team_group` Conn 的安全真实 E2E，并修复 Conn worker 启动 GroupRun 时空体 `POST` 携带 `content-type: application/json` 导致 Fastify 直接返回 `400 Bad Request` 的问题。`TeamGroupConnRunner` 现在只有请求体存在时才设置 JSON content-type，避免空 body 被主服务 JSON parser 拦截。
- **影响范围**: `src/workers/team-group-conn-runner.ts`、focused runner test、本地 `ugk-pi-conn-worker` 镜像运行口径。真实入口验证覆盖 `/playground/conn` UI 创建 `team_group` Conn、UI 立即执行、ConnRun 记录 `resolvedSnapshot.executionType="team_group"`、GroupRun 启动内部 TaskRun、5174 Live Team Console 显示 Group `Running` / `内部运行中`，以及画布 Group 终止后 GroupRun、TaskRun、ConnRun 同步取消。测试 Conn 已删除，测试 Group 已归档。
- **对应入口**: `src/workers/team-group-conn-runner.ts`、`test/conn-team-group-runner.test.ts`、`docs/runtime-assets-conn-feishu.md`、`docs/handoff-current.md`。

## 2026-06-05 — Conn Team Group real entry validation

- **主题**: 完成 Team Group + Conn Scheduler Step 07 真实入口验收与最终文档收口。`/playground` 后台任务入口可跳转到 `/playground/conn`；`/playground/conn` 会读取 `GET /v1/team/task-groups`，无 Group 时显示空态并禁用 `team_group` 保存；`5174` Live API 正常读取 root summary 和 task groups，Vite 源模块包含 Group 锁定标记。
- **影响范围**: 仅文档事实更新；本地没有安全测试 Group，未触发真实 `team_group` Conn run，后续 E2E 需要先准备闭合测试 Group。
- **对应入口**: `docs/handoff-current.md`、`docs/team-runtime.md`、`apps/team-console/README.md`。

## 2026-06-05 — Conn UI selects Team Group execution

- **主题**: Playground Conn manager 和 `/playground/conn` 独立页接入 `execution.type` 选择。旧 `agent_prompt` Conn 保持 prompt、Agent、browser、model、assets、binding confirmation 旧流程；新 `team_group` Conn 通过 `GET /v1/team/task-groups` 选择后端已有 Group，只保存 `execution: { type: "team_group", groupId }`，不把 Group 写进 `target.type`。本地无可用 Group 时显示空态并禁用保存。
- **影响范围**: `src/ui` Conn 编辑器、Conn 列表/详情执行对象展示、run detail 的 Team Group snapshot 展示和静态 UI 合同测试；不改 `src/agent/**`、`src/routes/conns.ts`、`src/workers/**`、`src/team/**`、`apps/team-console/**` 或 `.pi/**`。
- **对应入口**: `src/ui/playground-conn-activity.ts`、`src/ui/playground-conn-activity-controller.ts`、`src/ui/playground.ts`、`src/ui/conn-page-js.ts`、`src/ui/conn-page-css.ts`、`test/server.test.ts`。

## 2026-06-05 — Conn team_group execution backend contract

- **主题**: Conn definition 新增 `execution` 合同：`{ type: "agent_prompt" }` 继续走既有 BackgroundAgentRunner，`{ type: "team_group", groupId }` 由 Conn worker 调主服务 GroupRun API 执行。SQLite 新增 `execution_json`，旧 row、缺失字段和畸形 execution JSON 都归一化为 `agent_prompt`；`/v1/conns` create/update/list/detail 返回 normalized execution。
- **影响范围**: Conn store/schema/routes/API 类型、conn worker、docker compose worker 环境和 focused tests。`team_group` run 调 `POST /v1/team/task-groups/:groupId/runs` 并轮询 `GET /v1/team/task-group-runs/:groupRunId`；409 active guard 记 succeeded skipped，summary 以 `Skipped:` 开头；abort/cancel 已创建 GroupRun 时 best-effort 调取消 API。本步不改 `src/team/**`、`apps/team-console/**`、`src/ui/**` 或 `.pi/**`，也不让 Conn 选择单 Task。
- **对应入口**: `src/agent/conn-store.ts`、`src/agent/conn-db.ts`、`src/agent/conn-sqlite-store.ts`、`src/routes/conns.ts`、`src/routes/conn-route-parsers.ts`、`src/routes/conn-route-presenters.ts`、`src/workers/conn-worker.ts`、`src/workers/team-group-conn-runner.ts`、`test/conn-team-group-runner.test.ts`、`docs/runtime-assets-conn-feishu.md`、`docs/team-runtime.md`。

## 2026-06-05 — Team Console manual GroupRun UI

- **主题**: Team Console Live API 模式接入手动 GroupRun UI。Live backend Group 展开 frame 会读取最新 GroupRun，显示状态和 observed run 数；“运行”调用 `POST /v1/team/task-groups/:groupId/runs`，“终止”调用 `POST /v1/team/task-group-runs/:groupRunId/cancel`。active GroupRun 会轻量轮询详情，并在启动、终止或进入终态后 silent refresh 内部 Task run summary；Group 内已有 active Task run 时禁用 Group 运行并显示“内部运行中”。
- **影响范围**: `apps/team-console` API adapter、ExecutionMap Group frame、Live App 状态/轮询、focused tests 和文档；不改 `src/team/**` 后端 GroupRun contract，不接 Conn，不改主 `/playground`，不把 GroupRun 合进 `GET /v1/team/console/root-summary`。
- **对应入口**: `apps/team-console/src/api/team-types.ts`、`apps/team-console/src/api/team-api.ts`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/tests/team-api.test.ts`、`apps/team-console/src/tests/app-connections.test.tsx`、`apps/team-console/README.md`、`docs/team-runtime.md`。

## 2026-06-05 — Team Console backend Task Group integration

- **主题**: Team Console Live API 模式接入后端 `TeamTaskGroup` definition。初始加载和“刷新 Task”会读取 `/v1/team/task-groups`；画布 Group 由后端 `taskIds[]` 映射为 `AtlasTaskGroup.taskNodeIds[]`；创建 Group 调 `POST /v1/team/task-groups`，移除 Group 调 `POST /v1/team/task-groups/:groupId/archive`。Live `canvas-ui-state` 只保存 `taskGroupDisplayStates[{ groupId, collapsed, locked }]`，旧 live `taskGroups[].taskNodeIds` 只作为展示态迁移来源。
- **影响范围**: `apps/team-console` API adapter、Live data loader、App canvas state 和 focused tests；Mock UI-only Group 交互保留。本步不改 `src/team/**`、Conn、Playground、`.pi/skills/**`、`ExecutionMap.tsx` 或 CSS，不做 GroupRun UI/Conn 集成。
- **对应入口**: `apps/team-console/src/api/team-types.ts`、`apps/team-console/src/api/team-api.ts`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/app/use-team-console-live-data.ts`、`apps/team-console/src/tests/team-api.test.ts`、`apps/team-console/src/tests/app-connections.test.tsx`、`apps/team-console/README.md`、`docs/team-runtime.md`。

## 2026-06-05 — Team Task GroupRun backend contract

- **主题**: 新增 Team Task GroupRun 后端运行聚合 contract。`TeamTaskGroupRun` 保存到 `.data/team/task-group-runs.json`，支持启动 Group、列出某 Group 的 runs、读取/刷新单个 GroupRun、取消 GroupRun。启动前会拒绝 active GroupRun 和 Group 内 active Task run，并同轮启动所有 Group head tasks；部分 entry 启动失败会取消已启动 entry run 并把 GroupRun 标记为 failed。读取会递归观察 entry 触发的 Group 内 downstream run 和 discovery-generated run，并在 completed observed run 的 Group 内 active outgoing typed/control edge 尚无 downstream run 或 attempt delivery outcome 证据时保持 running，避免 entry completed 但下游尚未落盘时提前完成；取消会取消 Group 内所有 active Canvas Task run。
- **影响范围**: `src/team` 后端类型、GroupRun store/service/routes 与 route tests；不改 Team Console UI，不改 Conn worker/SQLite/schema，不改 Playground UI 或 `.pi/skills/**`，不把 GroupRun 合进 `GET /v1/team/console/root-summary`。
- **对应入口**: `src/team/types.ts`、`src/team/task-group-run-store.ts`、`src/team/task-group-run-service.ts`、`src/team/routes.ts`、`test/team-task-group-run-routes.test.ts`、`docs/team-runtime.md`。

## 2026-06-05 — Team Task Group backend definition contract

- **主题**: 新增 Team Task Group 后端持久 definition contract。`TeamTaskGroup` 保存到 `.data/team/task-groups.json`，支持 list/create/get/patch/archive routes，create/update 会校验 Group 边界闭合并计算 `headTaskIds`；active typed task connection 与 active control dependency 只要一端在 Group 内，另一端也必须在 Group 内。stale 边不参与闭合和头节点计算，generated child Task 和 archived Task 第一版不能加入 Group。
- **影响范围**: `src/team` 后端类型、store、routes 与 route tests；不实现 GroupRun，不改 Team Console UI，不改 Conn worker/SQLite，不改 Playground UI 或 `.pi/skills/**`。
- **对应入口**: `src/team/types.ts`、`src/team/task-group-store.ts`、`src/team/routes.ts`、`test/team-task-group-routes.test.ts`、`docs/team-runtime.md`。

## 2026-06-05 — Team Console PR #6 merge and Vite runtime refresh

- **主题**: 合并并推送 Team Console PR #6 的框选和 UI-only Group 交互优化。审查时补充锁定 Group 混合多选拖拽边界：锁定 Group 内部 Task 不会被已选未锁 Agent 拖拽带走。合并后用户看到旧 UI，根因确认不是 Git 或浏览器缓存，而是 `ugk-pi-team-console` Vite dev server 仍返回旧 transformed module；重启 `ugk-pi-team-console` 后 `5174/src/graph/ExecutionMap.tsx` 已包含 `onToggleTaskGroupLock`、`lockedTaskGroupNodeIdSet`、`data-task-group-locked`，页面重新加载后生效。
- **影响范围**: `5174` Team Console 本地运行口径、Execution Atlas lasso selection、UI-only Group 折叠/拖动/锁定/删除、文档交接；不改主后端、不改 `/playground`、不改 Team Task runtime。
- **验证**: PR 合并前通过 Team Console 交互相关 Vitest、`npx tsc --noEmit`、Team Console build 和 `git diff --check`；运行态排障时确认 `docker compose restart ugk-pi-team-console` 后源码模块和 CSS 均返回新标记，浏览器页面加载正常，控制台仅剩 `favicon.ico` 404。
- **对应入口**: `apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/graph/AtlasCanvasShell.tsx`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/app/App.tsx`、`docs/handoff-current.md`。

## 2026-06-05 — Team Task typed artifact handoff resolver

- **主题**: 修复普通 Task-to-Task typed artifact handoff 默认绑定 `accepted-result.md` 摘要的问题。手动 `upstreamRunSelections[]` 和自动 typed downstream 现在共用同一 runtime resolver：Discovery 继续优先 `discovery-aggregation.json` / `discovery-result.json`；普通 Task 按 connection type 优先选择当前 attempt 的 worker public output 机器可消费文件，`json` 只接受可解析 JSON object/array 的 `.json`，没有匹配时才 fallback 到既有 `resultRef`。
- **影响范围**: Canvas Task run 的 `source.boundInputs[].artifact.fileRef/content`、下游 worker prompt/payload、typed downstream fan-out；API 结构不变，不新增 endpoint，不改 Team Console UI 或主 `/playground`。
- **验证**: 新增 manual upstream selection 与 automatic typed downstream 回归测试；`node --test --import tsx --test-name-pattern "typed artifact|upstream run selection|manual upstream|downstream" test\team-task-run-process.test.ts`、`node --test --import tsx test\team-task-artifact-handoff.test.ts`、`node --test --import tsx test\team-task-run-process.test.ts test\team-task-run-routes.test.ts`、`npx tsc --noEmit`、`git diff --check` 均通过。重启 `ugk-pi` / `ugk-pi-team-worker` 后，真实下游 run `run_4af859e1d834` 已 completed，`source.boundInputs[0].artifact.fileRef` 指向 `agent-workspaces/attempt_b541b6717710/worker/output/structured-report.json`，HTML 报告 `diabetes-report.html` HTTP 200。用户随后从 Team Console 正常启动 `task_e1846fa41c83`，run `run_221b63509573` 也已 completed/succeeded，界面显示“手动上游输入”且绑定同一 worker public JSON，报告 `diabetes-industry-report.html` HTTP 200，用户确认测试通过。
- **对应入口**: `src/team/task-run-service.ts`、`src/team/run-workspace-attempts.ts`、`src/team/run-workspace.ts`、`test/team-task-run-process.test.ts`、`docs/team-runtime.md`。

## 2026-06-05 — Team Task typed downstream live-run revalidation

- **主题**: 真实链路排障确认 Team Console 对已装载历史上游 run 的启动请求已正确发送 `upstreamRunSelections[]`；此前 `task_e1846fa41c83` 裸跑的直接原因是本地 `ugk-pi` 主后端和 `ugk-pi-team-worker` 仍运行旧进程，未加载 Step 01 的后端 route/service 逻辑。重启这两个容器后，直接 HTTP POST 与 Team Console UI 启动的新 run 都能写入 `source.manualUpstreamSelections[]` 和 `source.boundInputs[]`。
- **影响范围**: 本地 Docker 运行口径和后续排障判断；这轮没有修改 production code。验证 run `run_416bd5c5c693` 已 `completed`，下游 `task_e1846fa41c83` 成功消费 `task_977d44da2fb9` 的历史 run `run_3cfcffe71bec` 并生成 HTML 报告。
- **后续缺口**: 普通 Task-to-Task typed artifact handoff 仍有文件选择问题：当前默认绑定 checker `accepted-result.md`，当该文件只是验收摘要而真实机器可消费 JSON 位于 worker public output 时，下游只能靠 agent 自行查找真实文件。下一步应修 artifact selection / handoff，让 `json` typed artifact 直接绑定真实输出文件，`accepted-result.md` 仅作 fallback 或人类摘要。
- **对应入口**: `docs/handoff-current.md`、`docs/team-runtime.md`、`src/team/task-run-service.ts`、`src/team/task-artifact-handoff.ts`、`test/team-task-run-process.test.ts`。

## 2026-06-04 — Team Console manual upstream input diagnostics

- **主题**: Team Console run observer 新增手动上游输入诊断区。手动启动的下游 run 触发标签仍显示“手动”，observer 额外在 `data-observer-section="input-diagnostics"` 中显示“手动上游输入”和 `connectionId`、上游 task/run/attempt、端口映射、`artifactId`，full detail 可用时补 artifact `type` / `fileRef`。
- **影响范围**: `5174` Team Console run observer、前端 API 类型和相关测试；不改 backend、不改 `src/team/**`、不改 `process-summary` 读模型、不改 Step 04 的 run 启动 body 构造或 loaded run 持久化规则。full detail enrichment 只在当前 observed run 有 `manualUpstreamSelections[]` 时调用，同一个 opened observer run 内成功或失败都只尝试一次，不随 active poll 重复拉 full detail；失败时保留 lightweight trace，不保存 artifact content / preview 到持久 UI state。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/api/team-types.ts`、`apps/team-console/src/tests/app-run-observer.test.tsx`、`apps/team-console/README.md`、`docs/team-runtime.md`。

## 2026-06-04 — Team Console loaded upstream run launch

- **主题**: Team Console 手动启动下游 Task 时，会把已装载的上游历史 run 转成 `upstreamRunSelections[]`。选择范围只限指向目标 Task 的非 stale typed task connection；上游 Task 没有 loaded run、同一上游 Task 有 active run、或当前内存态已知 loaded run 不是 `completed` 时，保持普通 run 请求。状态未知的持久化 selection 交由后端最终校验；前端不补最新 run、不查历史、不读旧 asset。
- **影响范围**: `5174` Team Console 的 Task 操作菜单运行请求和前端 API 请求类型；不改 backend、不新增 endpoint、不碰 `src/team/**`，模板 Task 的 `templateBindings` 可与 `upstreamRunSelections[]` 共存。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/api/team-types.ts`、`apps/team-console/src/tests/team-api.test.ts`、`apps/team-console/src/tests/app-run-observer.test.tsx`、`apps/team-console/README.md`、`docs/team-runtime.md`。

## 2026-06-04 — Team Console loaded historical Task run state

- **主题**: Team Console 运行记录面板新增历史 Task run 装载 UI 状态。每个 Task 可在 run history 行上“装载此记录”或“取消装载”，行内显示“已装载”；同一 Task 存在 active run 时显示“已装载（活跃 run 优先）”，避免历史 run 被误认为当前执行上下文。
- **影响范围**: `5174` Team Console UI 状态、运行记录面板和 canvas UI state 持久化；只保存 `{ taskId, runId }` 引用，不保存 artifact/content/attempt/files。本步不改 backend，不改 `LiveTeamApi.createTaskRun()` 请求语义，不发送 `upstreamRunSelections`。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/tests/app-run-observer.test.tsx`、`apps/team-console/README.md`、`docs/team-runtime.md`。

## 2026-06-04 — Manual upstream run selection

- **主题**: Canvas Task Run 支持手动选择上游历史 run 作为下游输入。`POST /v1/team/tasks/:taskId/runs` 新增可选 `upstreamRunSelections` 字段，允许指定 typed connection 对应的上游历史成功 run，而非自动取最新 run。artifact 解析逻辑与自动下游一致。
- **影响范围**: Canvas Task Run 创建 API 和 `TeamRunState.source`；不改主 `/playground` UI，不改 Team Console 展示结构，不影响 Plan / TeamOrchestrator run。
- **对应入口**: `docs/team-runtime.md`。

## 2026-06-04 — Manual upstream API read model contract

- **主题**: 钉死 manual upstream selection 的 API/read model 响应形状。full run detail 保留 `source.boundInputs[]` 和 `source.manualUpstreamSelections[]`；by-task summary、single summary、process-summary、run-history 和 root-summary 继续省略 heavy `source.boundInputs`，同时可保留 lightweight `source.manualUpstreamSelections[]` 作为诊断 trace。
- **影响范围**: Canvas Task Run 只读 API contract 和路由测试；production read model 当前已满足契约，本轮未改 `src/team/**` runtime 行为，不新增 endpoint，不碰 Team Console UI。
- **对应入口**: `test/team-task-run-routes.test.ts`、`docs/team-runtime.md`。

## 2026-06-04 — Team Console lasso selection and Group controls

- **主题**: Team Console Execution Atlas 框选和 UI-only Group 交互优化。框选后节点高亮增强，深色模式下选中态更明显；点击已选节点集合外的空白或其他节点会清空框选，点击/拖动已选节点保留多选。折叠 Group 可拖动并在右侧显示 Task 数量；展开 Group 支持上锁/解锁和移除，锁定后 Group 及内部 Task 都不能移动，也不能删除 Group；审查合并时补充覆盖了锁定 Task 不会被混合多选拖拽带走的边界。
- **影响范围**: `5174` Execution Atlas 的 lasso selection、root Task 多选、UI-only Group 折叠/展开/拖动/锁定/删除交互和对应本地 canvas UI state；不改后端 API、不删除 Task、不改 Discovery runtime。
- **验证**: `apps/team-console` 的 `app-connections.test.tsx`、Team Console build、`git diff --check` 和本地浏览器 `http://localhost:5174/` reload console error 检查通过。
- **对应入口**: `apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/graph/AtlasCanvasShell.tsx`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/tests/app-connections.test.tsx`。

## 2026-06-04 — Discovery subcanvas generated Task card interactions

- **主题**: Team Console Discovery 子画布 generated Task 网格交互收口：去掉 generated item 菜单里的“运行记录”入口，改为点击 item 卡片展开/再次点击收起运行记录；卡片增加 hover / active / 已展开视觉反馈，running 卡片保持橙红状态；item 右上角菜单外点自动收起。
- **影响范围**: `5174` Execution Atlas 的 Discovery 子画布 generated Task 网格、generated item 操作菜单和运行记录分支；不改 runtime、后端 API response shape 或主 `/playground` UI。
- **本地运行口径**: Docker Team Console dev server 可能在合并后继续执行旧 transformed module；若 `5174/src/app/App.tsx` 已是新源码但页面仍显示旧 generated item “运行记录”菜单或独立 running 区域，只重启 `ugk-pi-team-console` 容器并硬刷新浏览器。
- **验证**: Team Console live-data Vitest、Discovery subcanvas static contract、Team Console build、`git diff --check` 和本地浏览器 `http://127.0.0.1:5174/` reload console error 检查通过。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/src/tests/app-static-contracts.test.ts`。

## 2026-06-04 — Discovery dispatcher semantic compiler

- **主题**: Discovery dispatcher 实时 agent 输出从完整 WorkUnit JSON 改为 semantic patch。agent 只输出 `itemId`、`title`、`workerInstruction` 和可选 item-specific hints；本地 deterministic compiler 使用 `DiscoveryDispatchInput + semantic patch` 生成最终 `workUnit`，并保底 `outputContract.text` 与 `acceptance.rules`。
- **影响范围**: Canvas Task Discovery root run 的 dispatcher prompt / parser / runner integration；`TeamRoleRunner.runDiscoveryDispatcher()` 成功返回 shape 保持 `{ ok:true, itemId, workUnit, runtimeContext? }`。Dispatcher semantic prompt 不再包含 JSON code fence 示例，并明确要求输出首尾必须是 `{` / `}`；真实 GLM 仍可能把语义 JSON 包在单一 code fence 中，parser 会 deterministic unwrap 这种完整包装，但仍拒绝解释文字、embedded JSON、trailing prose 和 forbidden fields。若 semantic patch parse failure，runner 会把错误原因和原始输出打回 dispatcher 做一次格式修复 retry，retry 仍失败才 blocked。不改 Discovery pipeline、generated queue 3 并发、TaskStore generated schema、Team Console UI、主 `/playground` UI、`.pi/skills/**` 或 routes。
- **验证**: `node --test --import tsx test\team-role-prompt-contract.test.ts test\team-agent-profile-runner.test.ts test\team-task-run-process.test.ts`、`npx tsc --noEmit`、`npm test` 与 `git diff --check` 已通过。
- **对应入口**: `src/team/role-prompt-contract.ts`、`src/team/discovery-dispatch-workunit-compiler.ts`、`src/team/agent-profile-role-runner.ts`、`test/team-role-prompt-contract.test.ts`、`test/team-agent-profile-runner.test.ts`、`docs/team-runtime.md`。

## 2026-06-04 — Discovery dispatcher schema drift recovery

- **主题**: Discovery dispatcher parser 兼容真实模型常见 schema drift。模型把 `outputContract` / `acceptance` 错放到 `workUnit.input` 或 `workUnit.input.outputContract` 时，parser 会在字段完整且非空的前提下归位，不再把该 item 误标记为 blocked；仍拒绝缺失 contract、缺失 acceptance、item mismatch、forbidden fields 和 invalid JSON。`discoveryDispatch[].createdAt` 改为逐 outcome 记录真实落盘时间，避免整批 item 看起来同一秒完成。
- **影响范围**: Canvas Task Discovery root run 的 dispatcher output parsing 和 attempt diagnostics；同时把 dispatch / generated auto-run 实现边界整理为单 dispatcher producer + 固定 3 并发 generated run queue consumer。不改 Team Console UI、不改 generated Task 创建 API、不新增 endpoint。
- **验证**: `node --test --import tsx test\team-role-prompt-contract.test.ts test\team-task-run-process.test.ts` 已通过。
- **对应入口**: `src/team/role-prompt-contract.ts`、`src/team/discovery-run-lifecycle.ts`、`test/team-role-prompt-contract.test.ts`、`docs/team-runtime.md`。

## 2026-06-04 — Canvas Task detached run recovery

- **主题**: Canvas Task run 增加 detached active run 收口。主服务重启或后台执行链路丢失后，Team routes 注册会调用 `CanvasTaskRunService.recoverDetachedRuns()`；detached `queued` run 重新启动，detached `running` run 标记为 failed，避免无执行者的 run 长时间假运行。
- **影响范围**: `POST /v1/team/tasks/:taskId/runs` 产生的 Canvas Task / Discovery generated child run 的恢复语义；不改主 `/playground` UI，不改 Team Console 展示结构，不影响 Plan / TeamOrchestrator run。
- **验证**: `node --test --import tsx test\team-task-run-process.test.ts`、`node --test --import tsx test\team-task-run-routes.test.ts` 已通过。
- **对应入口**: `src/team/task-run-service.ts`、`src/team/routes.ts`、`test/team-task-run-process.test.ts`、`docs/team-runtime.md`。

## 2026-06-04 — Team Console architecture cleanup closeout

- **主题**: 完成 Team Console / Canvas Task / Discovery 收尾架构清理。Discovery lifecycle、Team Console summary read model、live refresh state、Discovery refresh projection、generated detail merge policy、Discovery subscription state、attempt/run workspace Interfaces、store reader Interfaces 等浅依赖已收口；`TeamOrchestrator` / `RunWorkspace` 经 Step 19 调查后决定不做 20-method shallow Interface，后续若要拆只单独规划 Discovery result assembly / aggregation Module。
- **影响范围**: 架构边界和后续维护入口；不改主 `/playground` UI，不新增 runtime 行为，不改外部 API response shape。最终源码基线为 `bd0a28f Narrow task dependency store task reader`。
- **验证**: Step 20 closeout 通过 `npm test`（2063 tests / 2061 pass / 2 skipped / 0 fail）、Team Console 定向 Vitest（194 tests）、`npm --prefix apps\team-console run build`、`npx tsc --noEmit`、`git diff --check`。Vite chunk size warning 与 browser-cleanup fetch failed 日志均为 exit 0 的非阻塞输出。
- **对应入口**: `src/team/task-run-service.ts`、`src/team/discovery-run-lifecycle.ts`、`src/team/console-summary-read-model.ts`、`apps/team-console/src/app/team-console-live-refresh-state.ts`、`docs/handoff-current.md`。

## 2026-06-03 — Team Console root-summary warm refresh cache

- **主题**: Team Console 聚合 root summary 后端刷新路径增加 warm cache / index。`TaskStore.list()` 使用 tasks 目录 mtime 缓存 catalog；`RunStateStore` 维护跨进程 `runs/state-index.json` 轻量 run summary index；`GET /v1/team/console/root-summary` 和 `GET /v1/team/task-runs/by-task?view=summary` 不再每次读取全部 Task/run state JSON。
- **影响范围**: `5174` Live API 手动“刷新 Task”、静默刷新、root latest run summary 和 generated/root summary 查询；完整 run detail、attempt、文件内容和主 `/playground` UI 不受影响。首次请求仍会构建 cache/index，后续同 cursor 增量走轻量路径。
- **验证**: `node --test --test-concurrency=1 --import tsx test\team-task-run-routes.test.ts test\team-task-routes.test.ts`、`npm run test:team`、`npx tsc --noEmit`、`npm --prefix apps\team-console run build`、`git diff --check`；Docker 本地实测 warm root-summary 增量 37-82ms。
- **对应入口**: `src/team/run-workspace-state.ts`、`src/team/task-store.ts`、`src/team/task-run-service.ts`、`src/team/routes.ts`、`docs/team-console-refresh-performance-plan.md`。

## 2026-06-03 — Team Console root and Discovery summary refresh contracts

- **主题**: Team Console refresh/API 主线补齐聚合型 root summary 与 Discovery generated child summary 增量 contract。新增 `GET /v1/team/console/root-summary` 聚合 root tasks、latest root run summaries、source / connection / dependency catalog，并支持独立 `taskSince` / `runSince` cursor；`GET /v1/team/tasks/:taskId/generated-tasks?view=summary&since=...` 返回 changed generated summaries、`deletedTaskIds` 和 `serverVersion`。
- **影响范围**: `5174` Live API 的初始加载、手动刷新、静默刷新和打开 Discovery 子画布后的 generated child summary 合并；前端优先 root summary endpoint，旧拆分 catalog / run summary 请求只作为兼容 fallback。空增量不会清空已打开的 Discovery child，generated full task detail 仍按需 lazy fetch。
- **验证**: focused root-summary / generated summary route tests 与 Team Console live-data / API tests 通过。
- **对应入口**: `src/team/routes.ts`、`apps/team-console/src/api/team-api.ts`、`apps/team-console/src/app/use-team-console-live-data.ts`、`docs/team-runtime.md`、`docs/team-console-refresh-performance-plan.md`。

## 2026-06-03 — Discovery dispatch auto-run overlap

- **主题**: Discovery root runtime 改为边 dispatch 边启动 generated child auto-run。dispatcher 仍顺序处理 item，但每个 item upsert 成 active generated Task 后立即进入固定 3 并发 auto-run pool；`attempt.discoveryDispatch` 和 `attempt.discoveryGeneratedRuns` 会随进度增量落盘。
- **影响范围**: Canvas Task Discovery root run 的 runtime 行为、cancel cascade、aggregation 和 typed downstream gating；不改主 `/playground` UI，不改 Team Console refresh API/UI，不新增 endpoint。
- **验证**: `node --test --import tsx test\team-task-run-process.test.ts`、`node --test --import tsx test\team-task-run-routes.test.ts`、`npx tsc --noEmit`、`git diff --check`。
- **对应入口**: `src/team/task-run-service.ts`、`test/team-task-run-process.test.ts`、`docs/team-runtime.md`、`docs/team-console-refresh-performance-plan.md`。

## 2026-06-03 — Team Console refresh performance Step 1-5

- **主题**: Team Console refresh 性能主线完成到 UI/API 第一版：run summary / process-summary 分层、Discovery scoped refresh、引用稳定合并、root catalog 和 root run summary `since` / `serverVersion` contract、Discovery 阶段可见性。
- **影响范围**: `5174` Live API 的 active polling、手动刷新、静默刷新、Discovery 子画布 catalog / dispatch diagnostics 和 Execution Atlas 阶段提示；旧 full run / full attempts 路径保留作兼容和排障。
- **验证**: Team Task route tests、Team Console API/live-data/run-observer Vitest、Team Console build、`npx tsc --noEmit`、`git diff --check` 分步通过。
- **对应入口**: `src/team/routes.ts`、`apps/team-console/src/api/team-api.ts`、`apps/team-console/src/app/use-team-console-live-data.ts`、`apps/team-console/src/app/App.tsx`、`docs/team-console-refresh-performance-plan.md`。

## 2026-06-03 — Team Task template current parameters

- **主题**: 模板 Task 本体支持直接运行和当前/最近参数复用。模板参数状态独立保存在 Task 的 `templateState.currentBindings`，`POST /v1/team/tasks/:taskId/runs` 可接收 per-run `templateBindings` override；每个 run 在 `source.templateBindings` 记录当次快照。
- **影响范围**: `/v1/team/tasks/:taskId/runs`、`PATCH /v1/team/tasks/:taskId` 的模板状态字段、`CanvasTaskRunService`、Team Console Task 操作菜单参数面板、Mock/Live Team API contract；clone API 保留但不再是模板参数运行主路径。
- **真实验证**: 用户通过 Team Console 参数面板运行模板 Task `task_ae82bc41efad`，keyword 为 `Minimax M3是不是很糟糕`；run `run_83673cbd8acc` 的 `source.templateBindings.keyword` 记录快照，`plan.json` 中 `{{keyword}}` 为 0 次。
- **对应入口**: `src/team/task-store.ts`、`src/team/task-run-service.ts`、`src/team/routes.ts`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/api/team-api.ts`、`.pi/skills/team-task-creator/SKILL.md`。

## 2026-06-03 — Team Task templates, clone API and UI groups

- **主题**: Team Task 支持模板参数、Task clone API、Team Console 复制面板和 UI-only Group。模板 Task 用 `templateConfig.parameters` 与 `{{parameterId}}` 占位；复制/实例化走 `POST /v1/team/tasks/:taskId/clone`；Execution Atlas 可从框选的 root Task 创建 Group，并在 canvas UI state 中保存折叠/展开状态。
- **影响范围**: `/team-task` skill 创建模板 Task 的契约、`/v1/team/tasks` payload、`/v1/team/tasks/:taskId/clone` API、Team Console Task 操作菜单和 Execution Atlas group UI；不改主 `/playground` 产品 UI，不把 Group 写进后端 Task 数据。
- **验证**: Team Task store/routes/creator-skill tests、Team Console API/contract/UI tests、`npx tsc --noEmit`、`git diff --check` 通过。
- **对应入口**: `src/team/task-store.ts`、`src/team/routes.ts`、`src/team/types.ts`、`.pi/skills/team-task-creator/SKILL.md`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/graph/ExecutionMap.tsx`。

## 2026-06-02 — Canvas Task adaptive phase timeout

- **主题**: Canvas Task 独立 run 的 worker/checker phase timeout 改为 adaptive idle timeout + hard cap；工具完成事件和 role public output 文件变化会刷新 idle 窗口，普通文本 / thinking 输出不会续命，hard cap 防止持续结构性进展无限运行。
- **影响范围**: `POST /v1/team/tasks/:taskId/runs` 启动的 Canvas Task worker/checker 执行路径、attempt timeout 失败证据和 `CanvasTaskRunService` 测试覆盖；Plan / TeamOrchestrator 的 watcher/finalizer 固定 timeout 路径不变，Team Console UI 不受影响。
- **验证**: Canvas Task run process/routes tests、`npx tsc --noEmit`、`npm test`、`git diff --check` 通过；真实运行中 generated child 在多轮工具完成后刷新 idle 并进入 checker。
- **对应入口**: `src/team/task-attempt-runner.ts`、`src/team/canvas-task-attempt-runner.ts`、`src/team/task-run-service.ts`、`test/team-task-run-process.test.ts`、`docs/team-runtime.md`。

## 2026-06-02 — Team Console UI refresh and Discovery child polish

- **主题**: 收口 Team Console 画布恢复 loading、root filter 刷新闪烁、shared canvas layout、Refresh Task perceived latency、Discovery summary catalog loading，以及 generated child card 菜单/浅编辑面板。
- **影响范围**: `5174` Execution Atlas 的画布状态恢复、手动刷新按钮加载态、跨端口 layout 共享、Discovery child catalog loading、generated child 操作 popover 和浅编辑面板；主 `/playground` UI 不受影响。
- **验证**: Team Console focused Vitest、build、`npx tsc --noEmit`、`git diff --check`，并在 Docker Team Console `http://127.0.0.1:5174/` 浏览器验证通过。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/app/use-team-console-live-data.ts`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/api/team-api.ts`。

## 2026-06-02 — Team Task run history

- **主题**: 为 Team Console Task 增加运行记录能力，最终收口为 Execution Atlas 子节点：先展示历史 run 列表卡片，点击单条记录后在其下游展开运行观察卡片；历史观察卡片顶部显示开始时间、结束时间和“复制给 Agent 分析”按钮。
- **影响范围**: `GET /v1/team/tasks/:taskId/run-history`、`PATCH /v1/team/task-runs/:runId/annotation`、Task 操作菜单、运行记录列表、历史 run 详情观察卡片和 run annotation 持久化；详情仍复用既有 run/attempt/file API。
- **验证**: Team task run route tests、Team Console live-data / run-observer tests、build、`npx tsc --noEmit`、`git diff --check` 和本地浏览器验证通过。
- **对应入口**: `src/team/routes.ts`、`src/team/task-run-annotations.ts`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/app/use-team-console-live-data.ts`。

## 2026-06-01 — Documentation lifecycle and refresh planning

- **主题**: 建立文档生命周期规则，并记录 Team Console 在 Task / 并行 run / Discovery generated child 增多后的刷新性能分析方案。
- **影响范围**: `AGENTS.md`、`docs/handoff-current.md`、`docs/change-log.md`、`.codex/plans/**` 的职责边界；后续 Team Console Live API 数据层、Canvas Task run summary API、Discovery 子画布 summary、run observer 轮询和 Execution Atlas 渲染边界。
- **对应入口**: `AGENTS.md`、`docs/handoff-current.md`、`docs/change-log.md`、`docs/team-console-refresh-performance-plan.md`。

## 2026-06-01 — Discovery aggregation and downstream handoff

- **主题**: Discovery root 不再在 generated child 运行中提前完成；root cancel 会级联取消本轮 generated child；generated child 全部终态后 root attempt 写 `discovery-aggregation.json`，typed downstream 优先消费 aggregation。
- **影响范围**: Discovery root run gating、cancel cascade、aggregation 文件 schema、typed downstream artifact resolution、Team Console 子画布 active child 排序和旧 child 隔离。
- **验证**: Team Task run process/routes tests、Team Console live-data/API tests、`npx tsc --noEmit`、`git diff --check` 通过；真实 Discovery run 验证 aggregation 落盘链路健康。
- **对应入口**: `src/team/task-run-service.ts`、`src/team/run-workspace.ts`、`src/team/routes.ts`、`apps/team-console/src/app/use-team-console-live-data.ts`、`docs/team-runtime.md`。

## 2026-06-01 — Team Console interaction and public artifact fixes

- **主题**: 收口 Team Console ID copy / drag 手势冲突、branch panel layout 持久化、canvas dock / Agent skill 修复、public artifact URL 和 quiet refresh contract。
- **影响范围**: Team Console Execution Atlas 交互、Agent 技能区、Team role artifact public URL、run observer JSON 结果展示和 terminal run 空 attempt 文件文案。
- **验证**: Team Console focused tests、agent route tests、`npx tsc --noEmit`、`npm test`、Docker smoke 和用户真实 UI 验证通过。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/graph/ExecutionMap.tsx`、`src/team/agent-profile-role-runner.ts`、`src/team/run-presenter.ts`、`src/team/routes.ts`。

## 历史记录裁剪说明

- **主题**: 旧流水账从常规接手上下文移除，避免 `docs/change-log.md` 无限膨胀。
- **保留窗口**: 本文件只保留当前活跃工作窗口和最近高风险行为变更；截至本次整理，保留 `2026-06-01` 之后的 Team Console / Discovery / runtime 相关记录。
- **历史追溯**: `2026-05-31` 及更早的稳定记录不再复制到本文件；需要考古时使用 Git 历史，例如 `git log -- docs/change-log.md`、`git show <commit>:docs/change-log.md` 或按具体文件查 `git log -- <path>`。
- **维护规则**: 新增条目必须短、可追溯、面向后续接手；不要把单次 UI 微调、排障过程、部署流水账、长测试矩阵继续塞回这里。
