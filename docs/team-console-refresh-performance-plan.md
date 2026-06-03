# Team Console 刷新性能优化分析与行动方案

更新时间：`2026-06-03`

本文档记录 Team Console / Canvas Task 在 Task 数量、并行 run 数和 Discovery generated child 增多后的刷新性能问题、现有数据路径、目标架构和执行计划。它是下一轮优化任务的专题入口；不要把这些细节继续塞进 `docs/handoff-current.md`。

## 背景

用户通过远程 FRP 使用 `http://139.196.23.72:5174/`，真实体验里出现两类问题：

- Task 增多、并行 run 增多后，画布刷新越来越慢，甚至出现“画布加载中”后重新进入。
- Discovery root 第一步完成后，用户不容易看出系统处于 dispatch / generated child 启动阶段，容易误以为子画布没有运行。

已确认一次 `team-console` 前端容器重启会让远程用户看到“画布加载中”，但这不是刷新性能退化的根因。根因仍是实时刷新路径和画布渲染边界没有按用户可见展开状态分层。

## 用户提出的目标模型

用户希望画布刷新只围绕当前可见信息：

1. 所有 root Task 都刷新基础运行态：执行中、成功、失败、取消、最近更新时间。
2. 未展开的 Task 不刷新过程、attempt、文件、Discovery 子画布详情。
3. 展开了 2 个 Task 的过程节点，就只刷新所有 Task 的基础状态 + 这 2 个 Task 的过程详情。
4. 打开了 1 个 Discovery 子画布，就额外刷新这 1 个 Discovery 的 generated child summary。
5. 如果 Discovery 子画布里的 child Task 再展开过程节点，才刷新该 child 的过程详情。

这个方向是正确的。需要补充的是：分层必须发生在 API / 数据请求层，而不是前端拿到全量数据后再过滤。否则网络、后端读盘和 React 状态更新压力仍然存在。

## 当前实现摸排

### 前端主刷新入口

`apps/team-console/src/app/use-team-console-live-data.ts` 是当前 Live API 数据入口。

当前已经有几项局部瘦身：

- root run summary 使用 `api.listTaskRunsByTaskIds(taskIds, { limit: 1, view: "summary" })`，见 `readTaskRunsForTasks()`。
- Discovery 子画布 generated catalog 首屏使用 `listGeneratedTaskSummaries()`，只在编辑 generated Task 时 lazy fetch full task detail。
- Discovery dispatch diagnostics 使用 `listTaskRunAttempts(..., { view: "dispatch-diagnostics" })`，后端会省略 heavy role process。
- 打开 Discovery 子画布时才 lazy load generated catalog。
- `refreshLiveTasks({ silent: true })` 已用于后台刷新，避免抢占顶部“刷新 Task”按钮 loading。

但主路径仍有几个放大点：

- 初始 live load / 手动刷新会读取 `GET /v1/team/tasks`、connections、dependencies、source catalog，再对全部 root Tasks 读取 latest run summary。
- active run polling 每 2 秒遍历 `taskRunsByTaskId` 里的所有 active run，并逐个调用 `GET /v1/team/task-runs/:runId`。这个接口返回 full run state，不区分“未展开只需要状态”和“展开后需要过程”。
- `getTaskRun()` 返回的 full run state 会进入共享 `taskRunsByTaskId`，导致未展开节点也可能携带更多运行态对象变化。
- 打开 Discovery 子画布后，`loadDiscoveryCatalogsForTaskIds()` 会读取该 root 的 generated task summaries，再对 root + all generated tasks 读取 latest run summary，再读取 root dispatch diagnostics。
- `discoverySummariesByTaskId` 会从 generated catalog + `taskRunsByTaskId` 派生，generated 数量越多，派生计算越重。
- `App.tsx` 中 `taskChildBranchPanels` / `taskBranchPanelItems` 依赖很宽；`taskRunsByTaskId` 每次变化都可能触发大量面板重新计算。

### 后端现有 API

当前已有这些轻量化入口：

- `GET /v1/team/tasks/:taskId/generated-tasks?view=summary`
- `GET /v1/team/task-runs/by-task?taskIds=...&limit=1&view=summary`
- `GET /v1/team/task-runs/:runId/tasks/:taskId/attempts?view=dispatch-diagnostics`
- `GET /v1/team/tasks/:taskId/run-history`

但 summary 还不够“基础运行态”：

- `summarizeRunState()` 目前基本只是省略 `source.boundInputs`，仍返回接近完整 `TeamRunState`。
- `GET /v1/team/task-runs/:runId` 没有 summary/detail view，active polling 只能拿 full run state。
- 没有 `since` / `updatedAfter` / version 增量语义。即使只有 1 个 Task 变化，刷新也常返回全部请求范围的数据。
- 没有把 root task run summary、expanded run process summary、Discovery child summary 建成明确的三个 contract。

### 真实运行问题锚点

`task_fb6e3f9cd973` 最近几次真实 run 说明了 Discovery 感知问题：

- `run_169c5d988eb7`：root worker/checker 成功，产出 56 个 items；最终 `cancelled / user cancel`；`discoveryDispatchCount=0`，`discoveryGeneratedRunsCount=0`。run 目录里有 56 个 dispatcher workspace，但无 session/output，说明未真正进入 child auto-run。
- `run_fa6daa6ad620`：root worker/checker 成功，产出 50 个 items；dispatch 结果为 created 5、updated 12、blocked 33、stale_marked 10；blocked 原因是 `user cancel`；未进入 generated child auto-run。
- `run_439278783a30`：产出 5 个 items，dispatch 创建 5 个 generated Tasks，auto-run 启动 3 个 child runs；root 被取消后 child runs 级联取消。

这证明用户看到“第一步完成后子画布没跑起来”并非 UI 幻觉：大量 item 场景下，系统卡在逐 item dispatcher 阶段，UI 没有足够明确的阶段提示；用户取消后 generated child 没机会运行。

## 目标架构

### 核心原则

实时刷新应从“全局刷新一切”改成“按画布订阅刷新”：

- Root summary 永远轻量刷新。
- Task process 只有展开过程节点才刷新。
- Discovery child summary 只有打开该 Discovery 子画布才刷新。
- Generated child process 只有展开该 child observer 才刷新。
- 历史、文件、accepted result、worker/checker 长过程不进入全局实时刷新。

### 分层数据模型

建议定义 4 层 contract。

#### 1. Root Task Summary

用于根画布和 Dock。所有 root Task 可刷新。

字段建议：

- `taskId`
- `title`
- `status`
- `canvasKind`
- `generatedSource` 不返回或只返回必要身份；root list 默认不含 generated。
- `updatedAt`
- `latestRun`: `runId`, `status`, `createdAt`, `startedAt`, `finishedAt`, `updatedAt`, `lastError`, 当前 task 的 `phase/resultRef/errorSummary/attemptCount` 摘要。
- `active`: boolean
- `version` 或 `updatedAt` 用于增量合并。

不返回：

- full `workUnit`
- full run `taskStates`
- `source.boundInputs`
- attempts
- role process
- files
- Discovery generated catalog

#### 2. Expanded Task Process Summary

用于 Task 过程节点 / run observer。只有展开 observer 的 Task + run 需要刷新。

字段建议：

- run summary
- latest attempt summary
- worker/checker status、phase、assistant text 摘要、current action、少量 narration
- file descriptors，但不含文件内容
- error summary

文件内容继续使用现有 attempt file API，点击文件后懒加载。

#### 3. Discovery Child Summary

用于打开的 Discovery 子画布。只刷新打开的 Discovery root。

字段建议：

- discovery root task/run/attempt id
- dispatch progress：total items、processed、created、updated、blocked、stale、current phase。
- generated child cards：generatedTaskId、itemId、title、itemStatus、workUnitMode、latestDiscoveryRunId、latestRun basic status。
- queued/running/done/failed 聚合计数。

不返回：

- generated full WorkUnit
- `generatedSource.itemPayload`
- child attempts / role processes
- child accepted result

#### 4. Detail / History / File

用户点击时一次性读取，不参与默认轮询：

- full task detail：编辑 generated Task 时读取。
- run history：打开运行记录时读取。
- attempts full：打开 run observer 时读取。
- attempt file content：点击文件时读取。

## API 优化建议

推荐先做 HTTP 分层轮询，不急着上 WebSocket/SSE。当前问题主要是 payload 和渲染边界，不是传输协议本身。

### 第一阶段 API

1. 新增或扩展 root summary API：
   - 方案 A：`GET /v1/team/tasks?view=summary`
   - 方案 B：新增 `GET /v1/team/console/root-summary`
   - 推荐 B。它可以一次返回 root tasks + source/connection basic + latest run basic，避免前端初始加载拆成多组请求。

2. 新增 run process summary view：
   - `GET /v1/team/task-runs/:runId?view=process-summary&taskId=:taskId`
   - 只返回该 task 的 latest attempt process 摘要。

3. 新增 Discovery summary endpoint：
   - `GET /v1/team/tasks/:taskId/discovery-summary?runId=:runId`
   - 只返回打开子画布需要的数据，包括 dispatch progress 和 generated child run basic。

4. 为 summary endpoint 增加增量参数：
   - `since=<iso or version>`
   - 服务端返回 `{ changed, deleted, cursor }` 或 `{ items, serverVersion }`。
   - 第一版可以先只支持 root summary 的 `since`，后续扩展到 discovery summary。

### 兼容要求

- 旧 API 保留，不破坏 `LiveTeamApi` 现有 full detail 行为。
- MockTeamApi 和 LiveTeamApi 必须同时补 contract。
- summary view 不能删字段造成旧 UI 崩溃；新 UI 使用新方法。
- route 错误语义清楚：unknown view 400、task missing 404、run/task mismatch 404 或 400。

## 前端优化建议

### 订阅状态

把当前展开状态显式变成 refresh subscription：

- `rootSummary`: always on
- `expandedRunObservers`: `Array<{ taskId, runId, kind }>`
- `openDiscoverySubcanvases`: `Array<{ discoveryTaskId, activeRunId? }>`
- `expandedGeneratedObservers`: `Array<{ generatedTaskId, runId, discoveryTaskId }>`

这些订阅来自 `expandedTaskBranches`，但不要让所有刷新逻辑直接依赖巨大的 branch object。应派生稳定 key，例如：

- `root`
- `process:taskId:runId`
- `discovery:taskId:runId`
- `generated-process:taskId:runId`

### 刷新节奏

建议节奏：

- root summary：2-3 秒一次；如果无 active runs，可退避到 8-15 秒。
- expanded process：active run 1-2 秒一次；terminal run 停止轮询。
- Discovery summary：root active 或 dispatch active 时 2 秒一次；terminal 后做 2-3 次延迟刷新后停止。
- Agent status：维持现有 3 秒或并入 root summary，后续再决定。

### 状态合并

前端合并必须保证：

- 未变化 task/run 对象保持引用不变，避免 React/ExecutionMap 全量重渲染。
- summary 不覆盖已经 lazy fetched 的 full task detail。
- 收起面板后取消或忽略旧请求，避免 stale response 污染界面。
- 打开子画布时只添加对应 discovery subscription；关闭后停止 discovery polling。
- 历史、文件内容、编辑 draft 不被后台 summary refresh 清空。

### 画布渲染

优化不只在网络。需要检查 `App.tsx` 和 `ExecutionMap`：

- `taskBranchPanelItems` / `taskChildBranchPanels` 的 useMemo 依赖过宽，后续应拆小，至少避免每次 root summary 更新都重建所有 child panel。
- Discovery child list 超过阈值时继续保持窗口化或分页；不要一次 DOM 渲染 50+ 个完整 child observer。
- root node props 应只传基础状态，不传 full `taskRunsByTaskId` 大对象；可改为 `taskRunSummaryByTaskId`。
- branch panels 只接收自己的 process summary，而不是从全局大 map 中每次筛选。

## Discovery 运行体验补充

本刷新优化不能单独解决“大量 item dispatch 很慢”的运行时设计问题，但必须把阶段展示清楚。

建议在 Discovery summary 中显示：

- `发现阶段`
- `生成子任务阶段`
- `启动子任务阶段`
- `子任务执行阶段`
- `聚合阶段`

对于 `task_fb6e3f9cd973` 这种 50+ item：

- root worker/checker 成功后，应显示“正在生成子任务 17/56”，而不是让用户以为子画布已空转。
- 如果 root 被取消，显示取消发生在哪个阶段：discovery、dispatch、auto-run、aggregation。
- dispatch outcomes 应在过程中增量落盘或至少周期性落盘；当前最新 run 出现 workspace 已创建但 `discoveryDispatch` 为空，诊断价值不足。

运行时后续可选优化：

- 边 dispatch 边启动 generated child，而不是全部 dispatch 完才 auto-run。
- 或用 deterministic / bulk dispatcher 减少每 item 一次模型调用。
- 这些属于 runtime 行为优化，应作为第二阶段，不要和本轮 UI 刷新瘦身混在一个大提交里。

## 行动计划

### Step 1：建立 root summary 数据面

目标：

- 新增 root summary API 或 `tasks?view=summary`。
- 前端初始加载和手动刷新只拿 root summary。
- root 画布不需要 full task/run 即可渲染基础状态。

进度：

- 已完成第一段落地：`GET /v1/team/task-runs/:runId?view=summary&taskId=:taskId` 支持单 run 轻量状态，`GET /v1/team/task-runs/by-task?...&view=summary` 会把 `taskStates` 裁到对应 Task。
- active root run polling 已改为按 `taskId` 请求 run summary；10 个 active root Task 全部未展开时，不请求 full run process / attempts / files。
- 尚未新增聚合型 `GET /v1/team/console/root-summary`；初始加载和手动刷新仍沿用现有 root catalog + bulk latest run summary 组合。

测试：

- 后端 route 测试覆盖 summary 字段不含 heavy workUnit / boundInputs / attempts。
- Team API 测试覆盖 LiveTeamApi / MockTeamApi 新方法。
- App live-data 测试覆盖未展开时不会请求 full run / attempts。

### Step 2：按展开 observer 刷新过程详情

目标：

- run observer 打开时订阅该 `taskId + runId` process summary。
- 未展开 observer 的 active runs 只刷新 basic status。
- 收起 observer 后停止 process polling。

进度：

- 已新增 `GET /v1/team/task-runs/:runId?view=process-summary&taskId=:taskId`，返回当前 Task 的 run summary + attempts process summary；role process 保留状态、assistant text、current action / narration，清空 heavy `entries`。
- Team Console observer 已改为展开几个 observer 就请求几个 process summary；打开第二个 observer 不再重复首刷第一个 observer。
- 文件内容仍按 observer 文件路径读取，且已避免依赖重复刷新来解析正在读取的文件。

测试：

- 打开 2 个 observer 只请求 2 个 process summary。
- 10 个 active root runs 未展开时不请求 process summary。
- terminal run 停止轮询。

### Step 3：Discovery 子画布 scoped refresh

目标：

- 打开 Discovery 子画布时只刷新该 discovery 的 child summary。
- 同时打开多个 Discovery 子画布时按 ID 独立刷新。
- 关闭后取消/忽略后续 response。

测试：

- 未打开 Discovery 子画布时不请求 generated catalog / dispatch diagnostics。
- 打开 1 个只请求 1 个 discovery summary。
- generated child observer 展开时才请求 child process summary。

### Step 4：增量刷新和引用稳定

目标：

- root summary 支持 `since` 或版本 cursor。
- 前端 merge changed/deleted，未变化对象保持引用不变。
- 减少 `ExecutionMap` 大面积重渲染。

测试：

- unchanged task 对象引用保持。
- deleted/archived task 从画布、dock、branch state 清理。
- 后台 summary 不覆盖 full generated detail 和编辑 draft。

### Step 5：Discovery 阶段可见性

目标：

- UI 明确显示 discovery / dispatch / auto-run / aggregation 阶段。
- dispatch progress 可见。
- 被取消时显示取消阶段。

测试：

- attempt 有 discoveryDispatch partial 时显示 processed count。
- discoveryDispatch 为空但 root accepted + generated workspace 不应误显示 child running。
- user cancel 显示为取消，不显示成失败。

## 验证矩阵

最低验证命令建议：

```powershell
node --test --import tsx test\team-task-routes.test.ts
node --test --import tsx test\team-task-run-routes.test.ts
npm --prefix apps\team-console run test -- --run src\tests\team-api.test.ts src\tests\app-live-data.test.tsx src\tests\app-run-observer.test.tsx
npm --prefix apps\team-console run build
npx tsc --noEmit
git diff --check
```

如改到 Discovery runtime 行为，再补：

```powershell
node --test --import tsx test\team-task-run-process.test.ts
```

真实 UI 验证：

- 使用 Docker 口径，不启动本机 Node/Vite。
- 前端变更后执行 `docker compose restart ugk-pi-team-console`。
- 后端 route/runtime 变更后执行 `docker compose restart ugk-pi ugk-pi-team-worker`。
- 访问 `http://127.0.0.1:5174/` 和 `http://127.0.0.1:3000/healthz`。
- 在远程 FRP 场景下验证刷新不再频繁出现整屏“画布加载中”。

## 禁止事项

- 不改主 `/playground` 产品 UI。
- 不把 generated child 放进 root task list/root canvas。
- 不用前端全量拉取后过滤来假装优化。
- 不提交 `.data/`、public 报告产物、`.codex/plans/*`。
- 不开 `3100` 之类临时服务。
- 不把 Discovery runtime 的边 dispatch 边 auto-run 和 UI 刷新瘦身塞进同一个不可审查大提交。

## 推荐执行顺序

下一轮先做 Step 1 和 Step 2。理由很简单：这两步能直接解决“10 个 Task 并行但未展开时画布仍慢”的主痛点，且不会改变 Discovery runtime 语义。

Discovery 阶段提示和边 dispatch 边 run 很重要，但应该在 root summary / process summary 边界稳定后再做。不然继续在现在的大状态对象上打补丁，只会把刷新逻辑修成一锅浆糊。
