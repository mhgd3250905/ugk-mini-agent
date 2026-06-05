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
