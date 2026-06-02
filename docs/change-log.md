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

## 2026-06-02 — Team Console root filter refresh flicker

- **主题**: 修复刷新 Team Console 时根节点筛选先显示 `ALL`、随后跳回上次 `Agent`/`Task` 的闪缩；root filter 会优先从本地 canvas UI state 初始化，若 live 共享布局还没加载完则暂不渲染画布，避免先显示错误 filter。
- **影响范围**: `5174` Execution Atlas 顶部 `ALL / Agent / Task` segmented control 和刷新后的首屏布局稳定性；共享 live layout hydration 完成后再一次性显示正确筛选。
- **验证**: Docker 内 focused Vitest 通过，Docker 内 Team Console build 通过；浏览器切到 live 后打开 `http://127.0.0.1:5174/`，最终 DOM 为 `data-active-filter="task"` 且 `Task` 按钮 active，`ALL` 不 active。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/tests/app-canvas-state.test.tsx`。

## 2026-06-02 — Team Console maximized branch dark theme

- **主题**: 修复 Team Console 深色模式下最大化 Agent/Task 分支 header 变成浅色的问题；最大化 overlay 通过 portal 挂到 `body` 时会丢失 App 根节点的主题作用域，现在 overlay 自身携带 `data-theme`。
- **影响范围**: `5174` Execution Atlas 的最大化对话分支、Leader 对话分支和其他可最大化分支；普通非最大化分支不变。
- **验证**: Docker 内 focused Vitest 通过，Docker 内 Team Console build 通过；浏览器在 `http://127.0.0.1:5174/` 深色模式下确认 overlay 为 `data-theme="dark"`，header 背景为 `rgba(15, 24, 38, 0.96)`。
- **对应入口**: `apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/tests/app-branch-windowing.test.tsx`。

## 2026-06-02 — Team Console shared canvas layout across ports

- **主题**: Team Console live 模式的画布 UI 状态改为通过主后端共享保存，避免不同端口因 `localStorage` 按 origin 隔离导致节点位置、viewport、展开分支和 dock 状态不一致。
- **影响范围**: `5174`/`3000` 等不同入口打开 Team Console live 模式时的画布布局恢复；mock/fixture 模式仍保留本地隔离，不影响示例数据调试。
- **验证**: `node --test --import tsx --test-name-pattern "console-layout" test/team-task-run-routes.test.ts`、`npx vitest run src/tests/app-canvas-state.test.tsx --testNamePattern "shared Team Console layout API"`、`npm --prefix apps/team-console run build`、浏览器打开 `http://127.0.0.1:5174/` 确认页面非空且画布节点渲染。
- **对应入口**: `src/team/routes.ts`、`apps/team-console/src/api/team-api.ts`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/tests/app-canvas-state.test.tsx`、`test/team-task-run-routes.test.ts`。

## 2026-06-02 — Team Console Refresh Task perceived latency

- **主题**: 优化顶部“刷新 Task”按钮的体感延迟，手动刷新在 root Task catalog、source/connection catalog 和 root run summary 完成后即释放按钮；已打开的 Discovery 子画布 generated catalog、generated run summary 和 dispatch diagnostics 改为后台继续刷新并合入。
- **影响范围**: `5174` Live API 的工具栏“刷新 Task”按钮、打开中的 Discovery 子画布刷新链路；不新增 backend endpoint，不把 generated child 放进 root task list/root canvas。
- **验证**: 新增回归测试覆盖按钮在 delayed generated run summary 未返回时已恢复；focused Team Console Vitest 294 passed。
- **对应入口**: `apps/team-console/src/app/use-team-console-live-data.ts`、`apps/team-console/src/tests/app-live-data.test.tsx`。

## 2026-06-02 — Team Console Discovery summary catalog loading

- **主题**: 优化 Discovery 子画布 generated catalog 加载路径，打开子画布时读取轻量 summary，只有编辑等需要完整 WorkUnit 时再 lazy fetch full task detail。
- **影响范围**: `5174` Live API 的 Discovery 子画布、generated card 操作菜单、generated Task 编辑入口和 `/v1/team/tasks/:taskId/generated-tasks?view=summary` 后端 route；generated Tasks 仍不进入 root canvas/root task list。
- **验证**: `docker exec -w /app/apps/team-console ugk-pi-ugk-pi-team-console-1 npx vitest run src/tests/app-live-data.test.tsx src/tests/team-api.test.ts`、`docker exec -w /app/apps/team-console ugk-pi-ugk-pi-team-console-1 npm run build`、`docker exec -w /app ugk-pi-ugk-pi-1 node --test --test-concurrency=1 --import tsx --test-name-pattern "view=summary|default view still returns full|unknown view|includeArchived" test/team-task-routes.test.ts`、浏览器确认子画布走 `?view=summary` 且旧 `/tasks/:id/runs` fan-out 未恢复。
- **对应入口**: `src/team/routes.ts`、`src/team/types.ts`、`apps/team-console/src/api/team-api.ts`、`apps/team-console/src/app/use-team-console-live-data.ts`、`apps/team-console/src/app/App.tsx`。

## 2026-06-01 — Team Console light theme surface completion

- **主题**: 补齐 Team Console 浅色主题覆盖，避免子画布和 Agent workspace 局部面板继续使用暗色硬编码。
- **影响范围**: `5174` Execution Atlas 的 Discovery 子画布、generated child card、dispatch diagnostics、Agent workspace 面板、上下文用量、对话气泡、composer、资产行和归档确认 modal；暗色主题通过 `[data-theme="dark"]` override 保留原暗色层级。
- **验证**: `docker exec -w /app/apps/team-console ugk-pi-ugk-pi-team-console-1 npm run test -- src/tests/app-static-contracts.test.ts`、`docker exec -w /app/apps/team-console ugk-pi-ugk-pi-team-console-1 npm run build`、`git diff --check`；浏览器 computed style 验证浅色/暗色切换。
- **对应入口**: `apps/team-console/src/app/app.css`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/tests/app-static-contracts.test.ts`、Team Console `http://127.0.0.1:5174/`。

## 2026-06-01 — Discovery live run validation handoff

- **主题**: 记录 `task_c70580219a00` 最新真实 Discovery run 的 root gating、generated auto-run pool 和 aggregation 验证结论。
- **影响范围**: Team Console / Canvas Task / Discovery runtime 接手事实；确认 `run_614c9ccdb9f8` 在 17 个 generated child 全部终态后才完成，并写出 `discovery-aggregation.json`。
- **验证**: 通过只读 Team Live API 监控确认 17 generated / 12 succeeded / 5 failed；`discovery-aggregation.json` summary 为 `totalItems=17`、`generatedTasks=17`、`succeeded=12`、`failed=5`、`missingResult=0`。
- **对应入口**: `docs/handoff-current.md`、`docs/team-runtime.md`、Team Console `http://127.0.0.1:5174/`、root Task `task_c70580219a00`。

## 2026-06-01 — Team Console ID copy drag gesture split

- **主题**: 修复节点 ID 区域短按复制与拖拽卡片的手势冲突。
- **影响范围**: Execution Atlas root Agent / Task 卡片 ID 复制按钮。
- **验证**: `npm --prefix apps\team-console run test -- --run src\tests\app-atlas-drag.test.tsx src\tests\app.test.tsx`、`npx tsc --noEmit`、`git diff --check`。
- **对应入口**: `apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/tests/app-atlas-drag.test.tsx`。

## 2026-06-01 — Team Console branch panel layout persistence

- **主题**: 补齐 Team Console 画布展开面板的位置持久化，修复刷新后 Task 操作/详情面板回到自动布局的问题。
- **影响范围**: Execution Atlas 中 Agent 对话面板、Task 操作面板、Task 子面板的位置和尺寸恢复。
- **验证**: `npm --prefix apps\team-console run test -- --run src\tests\app-canvas-state.test.tsx src\tests\app-branch-windowing.test.tsx src\tests\app-task-branches.test.tsx src\tests\app-task-leader.test.tsx`、`npx tsc --noEmit`、`git diff --check`。
- **对应入口**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/tests/app-canvas-state.test.tsx`。

## 2026-06-01 — Team Console canvas dock and Agent skill fixes

- **主题**: 修复子 Agent 技能更新、Team Console 画布收纳、布局恢复、dock 翻页和节点 ID 拖拽冲突。
- **变更内容**:
  - `/playground/agents` 子 Agent 技能区新增从主 Agent 覆盖更新单个技能的接口和按钮，更新前会清理目标技能目录，避免旧文件残留。
  - 画布底部 dock 同时稳定收纳 Agent / Task / Source，不再被顶部 Agent/Task 筛选器误隐藏；Task 收纳后继续显示最新 run 状态。
  - 画布 root Agent / Task / Source 的位置和收纳状态写入 canvas UI state，刷新或重开页面后恢复；live loading 空列表不再误清理收纳状态。
  - dock 隐藏原生横向滚动条，改用左右翻页按钮；节点 ID 复制按钮保留点击复制，但拖动时交回卡片处理。
- **影响范围**: `/playground/agents`、Team Console Execution Atlas root canvas、bottom dock、canvas UI localStorage 状态。
- **验证**: `npm test` 通过（2013 tests / 2011 passed / 2 skipped / 0 failed），`npx tsc --noEmit`，`git diff --check`。
- **对应入口**: `src/routes/agent-profiles.ts`、`src/agent/agent-profile-catalog.ts`、`src/ui/agents-page.ts`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/graph/execution-map.css`。

## 2026-06-01 — Team Task public artifact URL and quiet refresh contract

- **主题**: 收口 Canvas Task 交付文件的公开访问契约，并避免后台 Discovery 刷新抢占“刷新 Task”按钮状态。
- **变更内容**:
  - Canvas Task run 记录请求推导出的 `source.publicBaseUrl`；`PUBLIC_BASE_URL=auto` 视为自动模式，由请求 `Host` / `X-Forwarded-Proto` 或本地端口推导公开 origin。
  - Team role session 注入 `ARTIFACT_PUBLIC_DIR` 和 `ARTIFACT_PUBLIC_BASE_URL`，worker/checker 需要把可交付文件写入该目录，并输出基于 `/v1/team/task-runs/:runId/artifacts/:roleKey/:role/...` 的稳定 URL，不再启动临时 `localhost` 文件服务。
  - Team Console 的 Discovery 后台刷新和 active run 终态刷新改为 silent refresh，不再让工具栏“刷新 Task”进入误导性的加载态。
  - Discovery 子画布只展示当前 root run 对应的 generated child run；新 root 运行期间旧 child run 状态会清空为“等待本轮发现”，排序保持 active child 优先、终态按完成时间倒序。
- **影响范围**: Team Console Live API、Canvas Task role runner 环境、Task artifact HTTP route、Discovery 子画布展示。
- **验证**: `npm --prefix apps\team-console run test -- --run src\tests\app-live-data.test.tsx`、`npm --prefix apps\team-console run test -- --run src\tests\app-run-observer.test.tsx`、`node --test --import tsx test\team-task-run-routes.test.ts`、`node --test --import tsx test\team-agent-profile-runner.test.ts`、`node --test --import tsx test\team-task-run-process.test.ts`、`npx tsc --noEmit`。
- **对应入口**: `src/team/routes.ts`、`src/team/agent-profile-role-runner.ts`、`apps/team-console/src/app/use-team-console-live-data.ts`、`apps/team-console/src/app/App.tsx`。

## 2026-06-01 — Documentation lifecycle rules

- **主题**: 给仓库文档增加容量上限和生命周期规则，防止 `change-log`、handoff 和计划目录重新膨胀。
- **变更内容**:
  - `AGENTS.md` 明确 `handoff-current`、`change-log`、`.codex/plans/` 和专题文档的职责、软上限和归档口径。
  - `docs/handoff-current.md` 增加当前接手必须遵守的文档生命周期规则。
  - `docs/change-log.md` 头部规则补充近期窗口、500 行目标和禁止写入长流水账的约束。
- **影响范围**: 后续 agent 的文档写入、交接整理、计划文件清理和上下文读取成本。
- **验证**: `git diff --check`。
- **对应入口**: `AGENTS.md`、`docs/handoff-current.md`、`docs/change-log.md`。

## 2026-06-01 — Documentation log retention cleanup

- **主题**: 收口文档流水账保留窗口，避免每次接手都吞掉已稳定的历史记录。
- **变更内容**:
  - `docs/change-log.md` 只保留当前活跃窗口和最近高风险行为变更；`2026-05-29` 及更早稳定记录改由 Git 历史追溯。
  - `docs/handoff-current.md` 重写为当前 Team Console / Canvas Task / Discovery 接手摘要，不再堆叠旧快照。
  - `AGENTS.md` 明确 `change-log` 是近期窗口，不是全量历史档案；常规接手不应全文读取历史日志。
- **影响范围**: 文档接手路径和后续 coding agent 的上下文读取成本。
- **验证**: `git diff --check`。
- **对应入口**: `docs/change-log.md`、`docs/handoff-current.md`、`AGENTS.md`。

## 2026-06-01 — Discovery aggregation downstream JSON handoff

- **主题**: 修正 Discovery root 触发 typed downstream 时的 JSON artifact 交付语义，让下游消费 generated child 搜索结果汇总，而不是 root source list 或 worker 私有相对路径字符串。
- **变更内容**:
  - Discovery root 在 dispatcher 写入 generated child catalog、固定 3 并发 auto-run pool 全部 terminal 后，会在 root attempt 下写入标准 `discovery-aggregation.json`。
  - `discovery-aggregation.json` 汇总 root `discovery-result.json` 的 item、dispatcher outcome、generated task/run id、generated run 状态，以及每个 generated child 的 accepted/failed result 内容；这是 Discovery root typed downstream 的优先 JSON artifact。
  - `discovery-result.json` 继续作为 root 发现阶段的标准来源清单和旧 run fallback；当 aggregation 缺失时才用于下游交付。
  - Discovery root 的 accepted result 如果只是 `worker/...json` 这类 agent workspace 内部引用，typed downstream 不再把该字符串当作 JSON 内容或对外 source ref 交给下游。
  - Team Console Run observer 在 terminal run 没有可展示 attempt 文件时，不再提示“运行刚启动时这里会随轮询补齐”，改为区分无 attempt、失败 attempt 无文件、普通无文件三类状态。
  - 新增回归测试覆盖 Discovery 下游收到 generated child aggregation JSON，以及 accepted result 为 worker 文件引用时 aggregation 不暴露内部 worker path；并覆盖 terminal empty observer 文案不再误导用户等待轮询。
- **影响范围**: `src/team/types.ts`、`src/team/run-workspace.ts`、`src/team/run-workspace-attempts.ts`、`src/team/task-run-service.ts`、`test/team-task-run-process.test.ts`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/tests/app-run-observer.test.tsx`、`docs/team-runtime.md`。
- **验证**: `node --test --import tsx test\team-task-run-process.test.ts` 通过（35 passed）；`npm --prefix apps\team-console run test -- --run src\tests\app-run-observer.test.tsx` 通过（18 passed）。
- **对应入口**: Team Console `http://127.0.0.1:5174/` -> Live API -> Discovery root Task -> typed JSON connection 下游；Run observer -> terminal run empty attempt files。

## 2026-06-01 — Discovery run downstream gating, cancellation, and subcanvas ordering

- **主题**: 修正 Discovery root run 过早进入完成态、提前触发下游 Task、以及 root cancel 不级联 generated child 的状态语义。
- **变更内容**:
  - Discovery root worker/checker 通过后，Canvas Task run 继续保持 active，等待 dispatcher 写入 generated child catalog，并等待固定 3 并发 auto-run pool 中的 generated child run 全部结束。
  - 只有整棵 Discovery generated auto-run pool 完成后，root run 才标记 `completed` 并触发 typed downstream / control downstream；普通 Task 的下游触发顺序不变。
  - 取消 root Discovery run 时按 `triggeredBy.discoveryRunId` 级联取消本轮已自动启动的 generated child runs，并阻止 auto-run pool 继续启动 queued items。
  - `Discovery 子画布` 中有 active generated run 的 child card 排在顶部，避免正在执行的 item 被压到列表底部。
  - 新增回归测试覆盖 Discovery typed downstream 不会在 generated child 仍运行时启动、root cancel 级联停止 generated child，以及 running generated child 置顶。
- **影响范围**: `src/team/task-run-service.ts`、`test/team-task-run-process.test.ts`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/README.md`、`docs/team-runtime.md`。
- **验证**: `node --test --import tsx test\team-task-run-process.test.ts` 通过（33 passed）；`npm --prefix apps\team-console run test -- --run src\tests\app-live-data.test.tsx` 通过（50 passed，保留既有 React act warning）。
- **对应入口**: Team Console `http://127.0.0.1:5174/` -> Live API -> Discovery root Task -> generated auto-run -> typed Task connection 下游。

## 2026-06-01 — Team Console Run observer JSON result rendering

- **主题**: 修复 Discovery generated child 的 `accepted-result.md` 承载 JSON 时被当作 Markdown 渲染的问题。
- **变更内容**:
  - Run observer 文件详情现在先检查内容本身：去掉首尾空白后以 `{` 或 `[` 开头、且能解析为 JSON object/array 时，优先按 JSON pretty print 渲染。
  - `.md` / `.markdown` 的普通报告仍走既有安全 Markdown 渲染；`.json` 文件仍走 JSON 渲染和解析失败提示。
  - 新增回归测试覆盖 Live API 返回 `accepted-result.md` 但内容是结构化 JSON 的真实显示路径，避免 URL 被 Markdown 链接化或 JSON 被压成不可读长行。
- **影响范围**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/tests/app-run-observer.test.tsx`、`apps/team-console/README.md`、`docs/team-runtime.md`。
- **验证**: `npm --prefix apps\team-console run test -- --run src\tests\app-run-observer.test.tsx` 通过，17 passed。
- **对应入口**: Team Console `http://127.0.0.1:5174/` -> Live API -> Discovery 子画布 -> generated child latest run observer -> `accepted-result.md` 文件详情。

## 2026-05-31 — Playground 画布水印居中

- **主题**: 将 `3000` `/playground` 对话画布背景从 ASCII 水印改为居中的 UGK Claw SVG icon 水印。
- **影响范围**: `src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`。
- **对应入口**: 主项目对话页 `http://127.0.0.1:3000/playground`。
- **验证**: `node --test --import tsx test/server.test.ts --test-name-pattern "GET /playground uses a desktop geek cockpit layout"` 通过。

## 2026-05-30 — Team Console 浅色主题与明暗切换

- **主题**: 将 `5174` Team Console 功能界面切到浅色默认主题，并提供明暗主题切换。
- **变更内容**:
  - `apps/team-console/src/app/app.css` 的全局 token、画布内 toolbar、segmented filter 和统计 pill 改为浅色表面。
  - `apps/team-console/src/graph/execution-map.css` 的画布网格、工具栏、根卡片、底部 Dock、Task 操作菜单和分支面板改为浅色层级；`创建 Task` 的 leader 选择菜单同步浅色化。
  - 新增主题切换按钮，使用 `ugk-team-console:theme:v1` 保存 `light` / `dark`，默认浅色，深色保留原有暗色画布口径；主题切换和数据来源选择移动到画布 toolbar 右侧。
  - 将 Team Console 改为沉浸式画布：移除页面 header、Mock fixture 切换栏、Live API 下旧的 `运行图：Agent workspace / 最新 Run` 切换条，以及右侧 `+ / - / 1:1 / 100%` 缩放控件；保留滚轮缩放、拖动画布、Agent / Task workspace 主入口和 Mock fixture 回归数据。
  - 增加静态 CSS 契约测试，锁定浅色 token、浅色 atlas canvas、leader picker 浅色表面、主题切换入口、Task 子面板浅色表面、连接控件浅色表面和深色卡片内部回归覆盖。
- **影响范围**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/app/app.css`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/tests/app-static-contracts.test.ts`、`docs/team-runtime.md`。
- **验证**: Team Console build、Team Console 全量 Vitest、顶层 `npx tsc --noEmit`、`node --test --import tsx test\server.test.ts` 和 `git diff --check` 已在 PR merge 前验证通过。
- **对应入口**: Team Console 固定入口 `http://127.0.0.1:5174/`。

## 2026-05-31 — Team Console Discovery delayed generated catalog refresh

- **主题**: 修复 Discovery root 完成后 generated child 晚到，导致子画布空白或显示旧 run 状态的问题。
- **变更内容**:
  - `scheduleLiveTaskDiscoveryRefresh()` 从两次短刷新扩展为有限延迟刷新序列，覆盖 dispatcher / generated auto-run 在 root run 终态后数十秒到数分钟才写入 catalog 的窗口。
  - 打开 `Discovery 子画布` 时主动执行一次 Live Task refresh，并启动同一组延迟刷新，避免用户必须手动点“刷新 Task”才能看到新 child 或最新 generated run 状态。
  - 刷新仍只消费既有 `GET /v1/team/tasks`、`GET /v1/team/tasks/:taskId/generated-tasks`、`GET /v1/team/tasks/:taskId/runs` 等 API；不新增 backend endpoint，不把 generated child 放进 root task list/root canvas。
  - 回归测试覆盖 root run 已经完成但 generated catalog 前几次仍为空，后续延迟刷新才出现 child 的真实时序。
- **影响范围**: `apps/team-console/src/app/use-team-console-live-data.ts`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/README.md`、`docs/team-runtime.md`。
- **验证**: `npm --prefix apps\team-console run test -- --run src\tests\app-live-data.test.tsx` 通过（50 passed）。
- **对应入口**: Team Console `http://127.0.0.1:5174/` -> Live API -> Discovery root Task -> `Discovery 子画布`。

## 2026-05-31 — Team task creator Discovery root payload flow

- **主题**: 扩展 `/team-task` runtime skill，让 Team Console “创建 Task” iframe 能创建 Discovery root Task。
- **变更内容**:
  - `.pi/skills/team-task-creator/SKILL.md` 新增 Discovery Task 创建流程：完整 JSON preview 必须包含 `canvasKind="discovery"`、合法 `discoverySpec`、Discovery root WorkUnit 和输出校验提示。
  - Discovery 创建继续调用既有 `POST /v1/team/tasks`，明确不新增 backend endpoint、不发送 `generatedSource`、不手工创建 generated child。
  - skill 要求先读 `GET /v1/agents`，从 active Agent catalog 选择 leader/worker/checker、dispatcher、generated worker/checker，避免按具体平台或供应商写死 Agent。
  - skill 现在会把多平台 / 多来源 / 多候选项调研自然语言默认推断为 Discovery 候选，例如调研某个产品或模型在多个社区、代码托管和模型托管平台上的用户反馈和评价；用户不需要手写 `canvasKind`、`discoverySpec`、`outputKey` 或 item schema，skill 负责少量追问、推导并补齐 payload。这是通用任务形态规则，不是针对某个产品、站点或平台的补丁。
  - 普通 Task 草案中途如果用户要求改用 Discovery 或拆成 generated child，skill 必须转为 Discovery root Task 设计，而不是反问 Discovery 是什么机制。
  - skill 定位补强为 Task 设计向导：先判断用户需求更适合普通 Task 还是 Discovery，说明推荐理由，再用少量针对性追问把模糊意图落成精确目标、范围、输出、验收和 Agent 角色；禁止先让外行用户选择 Task 形态或先给普通 Task 字段确认表。
  - 按 `skill-creator` 规范补强 frontmatter：`description` 直接承担触发条件和核心行为说明，明确这是面向外行用户的 Task 设计向导，并把多平台 / 多来源 Discovery 候选放进触发描述；SKILL body 保持在 500 行以内，不新增无关 README / quick reference。
  - 文档补充自定义 leader Agent 技能副本边界：已有 Agent profile 可能继续使用 `.data/agents/:agentId/user-skills/team-task-creator` 旧副本，真实 UI 测试前需用 agent skills API 重新复制主 Agent 当前技能，不能手工编辑 `.data`。
  - 文档补充本地 Docker 运行边界：`ugk-pi` 主服务不是 watch 模式，修改 Team Task route/store 或 `/team-task` skill 后，真实 5174 Live API 验证前需重启 `ugk-pi` 和 `ugk-pi-team-worker`；否则旧进程可能静默忽略 `canvasKind` / `discoverySpec`。
  - `test/team-task-creator-skill.test.ts` 补充 Discovery contract tests，锁定预览、确认、agent catalog 和 5174 Live API 验证指引。
- **影响范围**: `.pi/skills/team-task-creator/SKILL.md`、`test/team-task-creator-skill.test.ts`、`apps/team-console/README.md`、`docs/team-runtime.md`。
- **验证**: `node --test --import tsx test\team-task-creator-skill.test.ts`（21 passed）、`node --test --import tsx test\team-task-routes.test.ts`（37 passed）、`node --test --import tsx test\team-task-store.test.ts`（27 passed）、`npm --prefix apps\team-console run test -- --run src\tests\app-static-contracts.test.ts`（11 passed）、`PYTHONUTF8=1 python C:\Users\29485\.codex\skills\.system\skill-creator\scripts\quick_validate.py .pi\skills\team-task-creator`、`npx tsc --noEmit`、`git diff --check` 均通过；`npm test` 全量已跑两次，均为 1998 tests / 1995 passed / 2 skipped / 1 failed，失败分别是无关的 Windows 临时目录 rename `EPERM` 和 `local-cdp-browser` scoped target persistence 抖动，两个失败文件单独重跑均通过；本地执行 `docker compose restart ugk-pi ugk-pi-team-worker` 后，`/healthz` 正常，`PATCH discoverySpec` 到普通 Task 返回 400，Live API 显示新建 Discovery root `task_8c6b00af5b65`。
- **对应入口**: Team Console `http://127.0.0.1:5174/` -> Live API -> “创建 Task” -> leader Agent iframe -> `/team-task`。

## 2026-05-31 — Cross-platform atomic JSON write retry

- **主题**: 收口 Windows/跨平台临时文件占用导致的 atomic JSON replace 间歇失败。
- **变更内容**:
  - 新增共享 `renameWithTransientRetry()`，对 atomic write 的最终 rename/replace 步骤遇到 transient `EACCES` / `EBUSY` / `EPERM` 时做有限重试和线性退避。
  - `ConversationStore`、`AssetStore`、Feishu settings/conversation map、browser scope routes、Team plan/run/task/source-node/unit/json collection stores 等原有 temp-file -> rename 写入点统一改走共享 helper。
  - 保持现有写入模型不变：仍先写临时文件，再原子替换目标文件；非 transient rename 错误继续抛出。
  - focused tests 覆盖 ConversationStore 与 Feishu conversation map 的 transient rename retry。
- **影响范围**: `src/file-system.ts`、`src/agent/conversation-store.ts`、`src/agent/asset-store.ts`、`src/agent/agent-profile-catalog.ts`、`src/browser/browser-scope-routes.ts`、`src/integrations/feishu/*store.ts`、`src/team/*store.ts`、相关测试。
- **验证**: `npm test` 通过，1991 tests / 1989 passed / 2 skipped / 0 failed；`npx tsc --noEmit` 和 `git diff --check` 通过。
- **对应入口**: 本地 JSON state/catalog/index 文件持久化路径；这是跨平台 I/O 稳定性修复，不改变 API contract 或业务数据结构。

## 2026-05-31 — Team Console Discovery generated child archive/delete UI

- **主题**: 给 5174 Discovery 子画布 generated child card 增加 scoped soft archive/delete 操作。
- **变更内容**:
  - generated child card 新增 `data-generated-action="archive"` 和局部确认块 `data-generated-archive-confirm-for`，不复用 root Task 的归档 modal 或 root `archiveTask()` branch cleanup。
  - 确认后调用既有 `CanvasTaskGateway.archiveTask(taskId)` / `POST /v1/team/tasks/:taskId/archive`；这是软归档，不新增 endpoint，不做 hard delete、restore 或 unarchive。
  - 成功后只从 `generatedTasksByDiscoveryTaskId[sourceDiscoveryTaskId]` 移除该 generated child，并重算 root Discovery generated/active/stale/running summary；blocked dispatch count 继续来自 diagnostics，不随 child archive 删除。
  - 归档同一个 generated child 时同步清理该 child 的 edit draft、warning/saving、generated observer 和 generated observer file-detail selection；root Discovery branch 和 Discovery 子画布保持打开。
  - 失败时保留 generated card 和 Discovery 子画布，并通过现有页面 error banner 展示错误。
- **影响范围**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/app/use-team-console-live-data.ts`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/README.md`、`docs/team-runtime.md`、`.codex/plans/2026-05-30-team-console-discovery-requirements.md`。
- **验证**: focused App live-data tests 已按 TDD 先 RED 后 GREEN，覆盖 mock success、state cleanup、live endpoint 和 failure path；完整 Step 08E2C 验证见本轮交付报告。
- **对应入口**: 5174 Team Console root Discovery Task -> `Discovery 子画布` -> generated child card；本步不改 `src/team/**` backend routes/store/runtime/dispatcher/scheduler，不改 Discovery dispatch/upsert/auto-run/schema，不碰主 `/playground` 或 `.pi/skills/**`。

## 2026-05-31 — Team Console Discovery failed dispatch diagnostics

- **主题**: 在 5174 Discovery root summary 和子画布显示 blocked dispatcher diagnostics。
- **变更内容**:
  - `useTeamConsoleLiveData()` 从既有 `listTaskRuns()` / `listTaskRunAttempts()` 读取最新 root Discovery run attempt 的 `TeamAttemptMetadata.discoveryDispatch[]`，只把 `status="blocked"` 计入 failed dispatch diagnostics。
  - root Discovery 卡片 summary 新增 blocked dispatch 计数，并暴露 `data-discovery-failed-dispatch-count`；普通 Task 卡片不显示该计数或属性。
  - Discovery 子画布新增 diagnostics block，暴露 `data-discovery-dispatch-diagnostics-for`、`data-dispatch-blocked-count` 和 `data-dispatch-item-id`，只展示 blocked item id 与 concise error。
  - 旧 metadata 缺失 `discoveryDispatch` 或 attempt 读取失败时安全降级为 0，不影响 generated child catalog 或子画布打开。
- **影响范围**: `apps/team-console/src/app/use-team-console-live-data.ts`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/fixtures/team-fixtures.ts`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/src/tests/execution-map-ui.test.tsx`、`apps/team-console/README.md`、`docs/team-runtime.md`。
- **验证**: focused App live-data / ExecutionMap UI tests 覆盖 RED/GREEN；完整 Step 08E2B 验证见本轮交付报告。
- **对应入口**: 5174 Team Console root Discovery Task card 和 `Discovery 子画布`；本步不新增后端 endpoint，不改 `src/team/**` runtime/store/route/dispatcher/scheduler，不创建 generated Tasks from diagnostics，不改主 `/playground` 或 `.pi/skills/**`。

## 2026-05-31 — Team Console Discovery generated Task edit/reset UI

- **主题**: 给 5174 Discovery 子画布 generated child card 增加浅编辑和 reset-to-managed UI。
- **变更内容**:
  - generated child card 新增 `data-generated-action="edit"`，从 Discovery subcanvas 派生 `data-generated-edit-task-id` panel，只允许修改 Task 名称、Leader Agent、Worker Agent、Checker Agent。
  - generated Task 保存继续调用既有 `PATCH /v1/team/tasks/:taskId`；标题变更会同时 patch visible `title` 和 `workUnit.title`，让后端按现有规则把 `workUnitMode` 标记为 `customized`，避免 Discovery rerun 误覆盖用户标题。
  - customized 且存在 `generatedSource.latestManagedWorkUnit` 的 generated child 新增 `data-generated-action="reset-workunit"`，调用 `resetGeneratedTaskWorkUnit(taskId)`，只替换 `generatedTasksByDiscoveryTaskId[sourceDiscoveryTaskId]` 中的对应 child。
  - generated edit/reset 状态挂在 root Discovery branch 的 `discoveryGeneratedEditTaskId` 和 generated catalog state 下；generated children 仍不进入 root `tasks`、root `tasksById`、root `taskNodes` 或主 root canvas。
  - Review fix: reload 恢复 `discoveryGeneratedEditTaskId` 时会为真实 generated child hydrate edit draft；关闭整个 root Discovery branch 时同步清理 generated child edit draft，避免 stale 未保存草稿复活。
- **影响范围**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/app/use-task-branch-stack.ts`、`apps/team-console/src/app/use-team-console-live-data.ts`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/README.md`、`docs/team-runtime.md`。
- **验证**: focused App live-data tests 已覆盖 mock edit、mock reset、live reset endpoint 和 reset failure 保持子画布打开；完整 Step 08E2A 验证见本轮交付报告。
- **对应入口**: 5174 Team Console root Discovery Task -> `Discovery 子画布` -> generated child card；本步不实现 failed dispatch diagnostics、generated archive/delete，不改 backend routes/store/runtime/dispatcher/scheduler、主 `/playground` 或 `.pi/skills`。

## 2026-05-31 — Team Console Discovery generated WorkUnit reset contract

- **主题**: 为 Discovery generated Task 增加 latest managed WorkUnit 快照和 reset-to-managed API seam。
- **变更内容**:
  - `TeamGeneratedTaskSource` 新增可选 `latestManagedWorkUnit?: TeamWorkUnitDefinition`，旧 generated Task 无该字段继续可读；字段存在时按 WorkUnit schema 校验。
  - `TaskStore.upsertGeneratedTaskFromDiscovery()` 在 create、managed rerun 和 customized rerun 都刷新 latest managed snapshot；customized rerun 仍不覆盖 visible `title/workUnit`。
  - public generated WorkUnit edit 继续标记 `workUnitMode="customized"` 且保留 snapshot；新增 `TaskStore.resetGeneratedTaskWorkUnit()` 和 `POST /v1/team/tasks/:taskId/generated-workunit/reset`，只对非 archived generated Task 且存在 snapshot 时恢复 visible WorkUnit/title 并标记 managed。
  - Team Console API adapter 新增 `resetGeneratedTaskWorkUnit(taskId)`；Mock adapter 真实更新 generated catalog，不是假返回。
- **影响范围**: `src/team/types.ts`、`src/team/task-validation.ts`、`src/team/task-store.ts`、`src/team/routes.ts`、`apps/team-console/src/api/team-types.ts`、`apps/team-console/src/api/team-api.ts`、`apps/team-console/src/fixtures/team-fixtures.ts`、相关测试、`docs/team-runtime.md`、`apps/team-console/README.md`。
- **验证**: focused store/routes/API/contract tests 已通过；完整 Step 08E1 验证见本轮交付报告。
- **对应入口**: `POST /v1/team/tasks/:taskId/generated-workunit/reset`；本步只做 contract/store/route/API adapter，不做 5174 UI，不改 generated child light edit/diagnostics、scheduler、dispatcher、主 `/playground` 或 `.pi/skills`。

## 2026-05-31 — Team Console Discovery generated Task observer

- **主题**: 给 5174 Discovery 子画布 generated child card 增加 run/cancel 和 latest run observer/file detail。
- **变更内容**:
  - generated child card 新增 `data-generated-action="run|cancel|observe-run"` 操作，run/stop 继续调用既有 Canvas Task run API adapter，不新增后端接口。
  - `TaskBranchState` 增加嵌套 `discoveryGeneratedObserver`，让 generated observer 挂在 root Discovery subcanvas branch 下；旧存储状态兼容，malformed nested observer 只忽略该 observer，不丢 root branch。
  - generated observer 使用 `generatedTasksByDiscoveryTaskId` 派生的 `generatedTasksById` 查找 generated child，不读 root `tasksById`，也不把 generated child 放进 root `taskNodes`。
  - run observer attempts/files 继续复用单一 `taskRunObserverByRunId` effect、`listTaskRunAttempts()` 和 `readTaskRunAttemptFile()`，generated observer panel 暴露 `data-generated-observer-task-id` / `data-generated-observer-run-id`，文件详情从该 panel 派生。
- **影响范围**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/app/use-task-branch-stack.ts`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/README.md`、`docs/team-runtime.md`。
- **验证**: focused App live-data / root run observer tests 和 Team Console `tsc` 已通过；完整 Step 08D 验证见本轮交付报告。
- **对应入口**: 5174 Team Console root Discovery Task action menu -> `Discovery 子画布`；本步不改 backend routes/store/runtime runner/dispatcher/scheduler、`.pi/skills`、主 `/playground`、generated child edit/archive/delete/reset-to-managed 或 failed dispatch diagnostics。

## 2026-05-31 — Team Console Discovery subcanvas catalog panel

- **主题**: 给 5174 root Discovery Task 菜单增加 generated child catalog 子画布。
- **变更内容**:
  - `App` 新增 `discovery-subcanvas` Task branch detail mode，root Discovery Task 的操作菜单显示 `Discovery 子画布` toggle；普通 Task 不显示该入口。
  - Discovery 子画布复用既有 `taskChildBranchPanels`，`sourceId` 指向当前 Task menu panel，并从 `generatedTasksByDiscoveryTaskId[discoveryTaskId]` 渲染非 archived generated Tasks。
  - generated child card 暴露 `data-discovery-subcanvas-for`、`data-generated-task-id`、`data-generated-item-status`、`data-generated-workunit-mode`、`data-generated-run-status`，展示 title、active/stale、managed/customized 和 latest run status。
  - generated Tasks 仍不进入 root canvas；本步不实现 generated child edit/run/cancel/archive/observer/file-detail。
- **影响范围**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/app/use-task-branch-stack.ts`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/README.md`、`docs/team-runtime.md`。
- **验证**: focused App live-data / ExecutionMap UI tests 已通过；完整 Step 08C 验证见本轮交付报告。
- **对应入口**: 5174 Team Console root Discovery Task action menu；本步不改 backend routes/store/runtime/scheduler/dispatcher、role prompt/parser、`.pi/skills`、主 `/playground` 或 generated child 操作能力。

## 2026-05-31 — Team Console Discovery root summary surface

- **主题**: 在 5174 Team Console root Discovery 卡片上显示 Discovery 身份和 generated child summary。
- **变更内容**:
  - `ExecutionMap` 接收 `discoverySummariesByTaskId`，仅对 `canvasKind="discovery"` 且非 generated child 的 root Task 渲染 `Discovery` 身份、`data-canvas-kind="discovery"`、专用卡片 class 和 `items / active / stale / running` summary row。
  - `App` 将 live data hook 的 Discovery summary 传入 Execution Atlas；mock data source 默认包含 Discovery root 和非 archived generated catalog，便于 5174 本地视觉验证。
  - `atlas-geometry` 为 Discovery root 卡片增加统一高度，drag hitbox、Dock flight、dependency geometry 和视觉卡片高度使用同一计算源。
  - generated child Tasks 仍只保留在 child catalog / generated summaries 中，不作为主 root canvas cards 渲染。
- **影响范围**: `apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/graph/atlas-geometry.ts`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/app/use-team-console-live-data.ts`、`apps/team-console/src/tests/execution-map-ui.test.tsx`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/README.md`、`docs/team-runtime.md`。
- **验证**: focused ExecutionMap UI / live-data / contract drift tests、Team Console `tsc`、Team Console build、Team Console full Vitest、top-level `npx tsc --noEmit`、`git diff --check` 和 5174 mock 浏览器验证均已通过。
- **对应入口**: 5174 Team Console root canvas Discovery 卡片；本步不改 backend routes/store/runtime/scheduler/dispatcher、role prompt/parser、`.pi/skills`、主 `/playground` 或 Discovery subcanvas。

## 2026-05-31 — Team Console Discovery data/API seam

- **主题**: 让 5174 Team Console data layer 消费 Discovery generated child catalog，并产出非视觉 Discovery summary。
- **变更内容**:
  - `LiveTeamApi` / `MockTeamApi` 新增 `listGeneratedTasks(discoveryTaskId, options?)`；live route 调 `GET /v1/team/tasks/:taskId/generated-tasks`，URL encode `taskId`，`includeArchived` 时追加查询参数，404 按空列表处理，并兼容 `{ tasks }` 和 bare array。
  - Mock fixture 增加 Discovery root、active generated child、stale generated child 和 archived generated child；`listTasks()` 仍只返回 root Tasks，generated children 只能通过 `listGeneratedTasks()` 读取，默认排除 archived。
  - `useTeamConsoleLiveData()` 新增 `generatedTasksByDiscoveryTaskId` 和 `discoverySummariesByTaskId`，初始 live load / refresh 只在 root catalog 包含 `canvasKind="discovery"` 时读取 child catalog。
  - generated Tasks 不进入 root `tasks` state，也不渲染到主 canvas/root list；generated child run summaries 会并入既有 `taskRunsByTaskId`，供后续 subcanvas/UI 复用。
- **影响范围**: `apps/team-console/src/api/team-api.ts`、`apps/team-console/src/app/use-team-console-live-data.ts`、`apps/team-console/src/fixtures/team-fixtures.ts`、`apps/team-console/src/tests/team-api.test.ts`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/README.md`、`docs/team-runtime.md`。
- **验证**: focused Team Console API/live-data tests 已通过；完整 Step 08A 验证见本轮交付报告。
- **对应入口**: 5174 Team Console Live API data layer；本步不改 backend routes/runtime、ExecutionMap 视觉、Discovery subcanvas、Task 卡片/menu、`.pi/skills` 或主 `/playground` UI。

## 2026-05-31 — Team Console Discovery generated Task auto-run scheduler

- **主题**: Discovery dispatch/upsert 成功后自动运行本次 active generated Tasks，并记录 launch diagnostics。
- **变更内容**:
  - `CanvasTaskRunService` 在 Discovery attempt 成功且 `discoverySpec.autoRun.enabled === true` 时，只从本次 dispatch 成功创建/更新的 active generated Tasks 生成 auto-run 候选。
  - generated Task auto-run 通过 `CanvasTaskRunService.createRun()` 启动，固定 v1 并发池为 3；候选 run 进入 terminal 后才补下一个，避免一次性全量 launch。
  - blocked dispatch item、stale generated Task、`generatedSource.itemStatus !== "active"`、非 `ready` Task 和已有 active run 的 generated Task 不会重复启动；分别记录 `skipped_not_runnable` 或 `skipped_already_running`。
  - generated run `source.triggeredBy` 新增 `discovery-generated-task` variant，记录 Discovery root task/run/attempt 和 source item id。
  - attempt metadata 新增可选 `discoveryGeneratedRuns[]` outcome 记录，旧 attempt / malformed metadata 继续兼容读取。
- **影响范围**: `src/team/types.ts`、`src/team/run-workspace.ts`、`src/team/run-workspace-attempts.ts`、`src/team/task-run-service.ts`、`apps/team-console/src/api/team-types.ts`、`apps/team-console/src/tests/team-contract-drift.test.ts`、`test/team-run-workspace.test.ts`、`test/team-task-run-process.test.ts`、`docs/team-runtime.md`。
- **验证**: focused workspace / Canvas Task run tests 已通过；完整 Step 07 验证见本轮交付报告。
- **对应入口**: Team Console Discovery root Task run、generated Task Canvas Task run、attempt metadata diagnostics；本步不改 routes、5174 UI、role prompt/parser、AgentProfile runner、Plan orchestrator、team worker 或 `.pi/skills`。

## 2026-05-31 — Team Console Discovery generated Task upsert

- **主题**: Discovery root Task 成功后按 `discovery-result.json` 派发 item，并创建 / 复用真实 generated Team Canvas Tasks。
- **变更内容**:
  - `TaskStore` 新增内部 `upsertGeneratedTaskFromDiscovery()` 和 `markGeneratedTasksStaleForDiscovery()`，身份键为 `sourceDiscoveryTaskId + sourceItemId`；managed WorkUnit rerun 覆盖，customized WorkUnit 只更新 source metadata。
  - `CanvasTaskRunService` 在 Discovery attempt 成功后读取 `discovery-result.json`，逐 item 调用 optional `runDiscoveryDispatcher()`；合法 draft 创建或更新 generated Task，缺失 dispatcher / invalid output / upsert 错误只记录 blocked outcome，不改 Discovery run terminal status。
  - generated Task 创建时继承 Discovery root leader，使用 `discoverySpec.generatedWorkerAgentId` / `generatedCheckerAgentId`，状态为 `ready`，`generatedSource.itemStatus="active"` 且 `workUnitMode="managed"`。
  - 最新 Discovery result 缺失的同源 generated Tasks 标记为 `stale`，不 archive，不改 WorkUnit；本步不启动 generated Task auto-run scheduler。
  - attempt metadata 新增可选 `discoveryDispatch[]` outcome 记录，旧 attempt / malformed metadata 继续兼容读取。
- **影响范围**: `src/team/types.ts`、`src/team/run-workspace.ts`、`src/team/run-workspace-attempts.ts`、`src/team/task-store.ts`、`src/team/task-run-service.ts`、`test/team-task-store.test.ts`、`test/team-run-workspace.test.ts`、`test/team-task-run-process.test.ts`、`docs/team-runtime.md`。
- **验证**: focused store / workspace / Canvas Task run tests 已通过；完整 Step 06 验证见本轮交付报告。
- **对应入口**: Team Console Discovery root Task run、generated Task catalog、attempt metadata diagnostics；本步不改 routes、5174 UI、role prompt/parser、AgentProfile runner 或 `.pi/skills`。

## 2026-05-30 — Team Console Discovery dispatcher role contract

- **主题**: 新增 Discovery dispatcher role contract，把单个 Discovery item 转成 generated Task WorkUnit draft。
- **变更内容**:
  - `TeamRoleRunner` / `MockRoleRunner` / `AgentProfileRoleRunner` 增加 `runDiscoveryDispatcher(input)`，并新增 role-local input/output/draft types。
  - `role-prompt-contract` 新增 `buildDiscoveryDispatchPrompt()` 和 `parseDiscoveryDispatchRoleOutput()`；parser 对 invalid JSON、item mismatch、invalid schema、forbidden fields 返回 `ok:false`，不 throw。
  - Dispatcher prompt 包含 Discovery task、Discovery goal、dispatch goal、outputKey、required/recommended fields、exact item id、完整 item payload JSON 和 forbidden identity/source/output 字段约束。
  - 真实 AgentProfile runner 使用独立 `discovery-dispatcher` role，profile fallback 为 `dispatcherProfileId > decomposerProfileId > workerProfileId`，workspace role key 对 `discoveryTaskId + itemId` 做 path-safe sanitization。
- **影响范围**: `src/team/role-runner.ts`、`src/team/role-prompt-contract.ts`、`src/team/agent-profile-role-runner.ts`、`test/team-role-prompt-contract.test.ts`、`test/team-role-runner.test.ts`、`test/team-agent-profile-runner.test.ts`、`docs/team-runtime.md`。
- **验证**: focused role prompt/runner/AgentProfile runner tests 已通过；完整 Step 05 验证见本轮交付报告。
- **对应入口**: Team Console Discovery dispatcher role contract；本步不创建 generated Tasks、不标记 stale、不启动 auto-run scheduler。

## 2026-05-30 — Team Console Discovery run output validation

- **主题**: 让 Discovery root Canvas Task 按 runtime `type="discovery"` 执行，校验 accepted output 并持久化标准发现结果。
- **变更内容**:
  - Canvas Task run 转 runtime Task 时，`canvasKind="discovery"` 映射为 `type="discovery"` 并携带 `discovery.outputKey`；normal root / generated Task 仍为 `normal`。
  - Canvas Task run 透传 `workUnit.outputCheck`，normal Task 的结构化输出校验不再被 checker pass 绕过。
  - `json_items` / Discovery 输出校验成功时返回 parsed `items`；Discovery accepted output 缺少 configured outputKey array 或稳定 string `id` 时 run 失败且不写 `discovery-result.json`。
  - Discovery 成功 run 除继续写 `accepted-result.md` 外，额外写入 `discovery-result.json`，schemaVersion 为 `team/discovery-result-1`，attempt `resultRef` 仍指向 `accepted-result.md`。
- **影响范围**: `src/team/types.ts`、`src/team/output-validator.ts`、`src/team/task-run-service.ts`、`src/team/canvas-task-attempt-runner.ts`、`test/team-output-validator.test.ts`、`test/team-task-run-process.test.ts`、`docs/team-runtime.md`。
- **验证**: focused validator / Canvas Task run tests 已通过；完整 Step 04 验证见本轮交付报告。
- **对应入口**: Team Console Canvas Task run、Discovery root Task output validation、attempt 标准结果文件。

## 2026-05-30 — Team Console Discovery Task catalog routes

- **主题**: 开放 Discovery root Task 的 Task API catalog 层，并把 generated Tasks 默认从 root list 隐藏。
- **变更内容**:
  - `POST /v1/team/tasks` 继续兼容普通 Task 创建，同时转发 `canvasKind` / `discoverySpec` 创建 Discovery root Task，并明确拒绝 public `generatedSource`。
  - `PATCH /v1/team/tasks/:taskId` 支持 Discovery root 更新 `discoverySpec`，并明确拒绝 public `canvasKind` / `generatedSource` 身份字段更新。
  - `GET /v1/team/tasks` 默认只返回 root Tasks，显式 `includeGenerated=1|true` 才包含 generated Tasks；`includeArchived` 语义保持可组合。
  - 新增 `GET /v1/team/tasks/:taskId/generated-tasks` 只读子 catalog route，只接受 Discovery root parent，响应 `{ tasks }`，默认排除 archived generated Tasks。
- **影响范围**: `src/team/routes.ts`、`src/team/route-parsers.ts`、`test/team-task-routes.test.ts`、`docs/team-runtime.md`、`apps/team-console/README.md`。
- **验证**: `node --test --import tsx test/team-task-routes.test.ts` 已通过；完整 Step 03 验证见本轮交付报告。
- **对应入口**: Team Console Live API 的 Task catalog、Discovery root Task 创建 / spec 更新、generated Task 子 catalog。

## 2026-05-30 — Team Console observer 终态触发下游 run 发现

- **主题**: 修复打开 run observer 时，observer 轮询先把上游 run 写入终态，导致 active-run polling 失去终态转换检测机会、下游自动创建的 run 不会自动出现在前端的问题。
- **变更内容**:
  - Task run observer 轮询在发现自己观察的 active run 已进入终态时，也会触发 live Task/run 列表刷新和延迟发现刷新。
  - 新增回归测试覆盖“上游 observer 消费 terminal transition 后，下游新 run 仍能自动合入 `taskRunsByTaskId` 并显示 running”的竞态。
- **影响范围**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/tests/app-canvas-connections.test.tsx`。
- **验证**: focused canvas connection tests、Team Console 全量 tests、build、顶层 `tsc` 和 `git diff --check` 通过；真实 `task_aeb07a91d49a` 的 `run_dc95d1221603` 成功后，未手动刷新页面，前端自动显示下游 `task_d725e753ebd8` 的 `run_42096616784e` 为 running，并能看到 worker 过程数据。
- **对应入口**: Team Console Execution Atlas 的 Task dependency auto-start、Task action menu run summary 和 run observer。

## 2026-05-30 — Team Console Task 分支 focused 语义收口

- **主题**: 将 Task 分支栈里剩余的单数 `expandedTaskBranch` 语义改名为 `focusedTaskBranch`，避免后续代码继续把“最后一个展开分支”误当成全局唯一 Task 分支状态。
- **变更内容**:
  - `useTaskBranchStack` 继续保留 `expandedTaskBranches` 作为唯一多分支状态模型，单数派生值改名为 `focusedTaskBranch`，语义仍是最后一个展开分支。
  - 删除已经没有外部调用的 `setExpandedTaskBranch` 和 `TaskBranchUpdater`，减少重新引入单分支写入口的机会。
  - 静态契约测试锁定 hook / App 入口，禁止旧单数 hook API 和旧 `focusedTaskNodeId={expandedTaskBranch?.nodeId ?? null}` 回归。
- **影响范围**: `apps/team-console/src/app/use-task-branch-stack.ts`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/tests/app-static-contracts.test.ts`。
- **验证**: focused tests、Team Console 全量 tests、build、顶层 `tsc` 和 `git diff --check` 均通过。
- **对应入口**: Team Console Execution Atlas 的 Task branch state hook 与 Task 根卡片 focused 状态。

## 2026-05-30 — Team Console ExecutionMap Task 分支单数 props 移除

- **主题**: 移除 `ExecutionMap` 中遗留的 Task 分支单数 props，避免测试或后续代码继续从旧 `taskBranchPanel` / `taskChildBranchPanel` 路径绕回单分支假设。
- **变更内容**:
  - `ExecutionMap` 的 Task 分支入口统一为 `taskBranchPanels` 和 `taskChildBranchPanels`，删除单数 fallback layout、connector、drag/resize、maximize 和 render 分支。
  - 直接调用 `ExecutionMap` 的剩余测试迁移到 descriptor 数组，保留菜单测量、child panel 几何和 auto-height drag 暂停断言。
  - 静态契约测试禁止旧单数 props、旧 App 传参和旧单数 root-drag gate 回归。
- **影响范围**: `apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/tests/app-static-contracts.test.ts`、`apps/team-console/src/tests/execution-map-ui.test.tsx`。
- **验证**: Team Console focused tests、全量 tests、build、顶层 `tsc` 和真实 `http://127.0.0.1:5174/` 拖动 observer 验证均通过。
- **对应入口**: Team Console Execution Atlas 的 Task branch / child panel 布局与拖动链路。

## 2026-05-30 — Team Console Task 分支单数 fallback 移除

- **主题**: 移除 Team Console `App.tsx` 中遗留的单 Task 分支 fallback，避免 Task 菜单、运行观察和文件详情继续分裂成单数 / 多分支两套状态路径。
- **变更内容**:
  - 删除 `expandedTaskBranchPanel` 及仅服务该 fallback 的编辑、运行观察、归档、运行和停止 helper，Task 操作菜单统一走 `taskBranchPanels={taskBranchPanelItems}`。
  - `ExecutionMap` 的 Task 根节点拖动同步开关改为识别任意 Task branch tree，避免移除单数 `taskBranchPanel` 后，已有位置覆盖的 run observer 不再跟随根节点移动。
  - 静态契约测试锁定 `App.tsx` 不能重新接回单数 fallback，并锁定 Task 根拖动同步不能再只依赖旧 `taskBranchPanel` 单数 prop。
- **影响范围**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/tests/app-static-contracts.test.ts`。
- **验证**: focused tests 覆盖静态契约、多 Task 分支、run observer、observer 拖动交互；全量测试和 build 见本轮提交记录。
- **对应入口**: Team Console Execution Atlas 的 Task 操作菜单与 run observer，固定入口 `http://127.0.0.1:5174/`。

## 2026-05-30 — Team Console 运行观察多分支与文件详情修复

- **主题**: 修复 Team Task 串联运行后，多个 Task 运行观察面板同时展开时，上游面板无过程数据、Accepted Result 文件详情一直停在“正在读取文件”的问题。
- **变更内容**:
  - 运行观察轮询从单个当前 Task 分支改为覆盖所有已展开的 `run-observer` 分支，避免下游 Task 激活后把上游观察面板晾成空壳。
  - 观察目标依赖改为稳定签名，防止刷新 run 状态触发 effect 自我清理，导致 attempt 文件内容请求返回后被丢弃。
  - 回归测试覆盖多个观察分支同时展开、各自过程数据加载，以及延迟返回的 Accepted Result 文件内容能正常渲染。
- **影响范围**: `apps/team-console/src/app/App.tsx`、`apps/team-console/src/tests/app-run-observer.test.tsx`。
- **验证**: `npm --prefix apps/team-console run test -- --run src/tests/app-run-observer.test.tsx`；重启 `ugk-pi-team-console` 后在 `http://127.0.0.1:5174/` 验证 `task_aeb07a91d49a` 的过程与 Accepted Result 文件详情均能显示。
- **对应入口**: Team Console Execution Atlas 的 Task run observer，固定入口 `http://127.0.0.1:5174/`。

## 历史记录裁剪说明

- **主题**: 旧流水账从常规接手上下文移除，避免 `docs/change-log.md` 无限膨胀。
- **保留窗口**: 本文件只保留当前活跃工作窗口和最近高风险行为变更；截至本次整理，保留 `2026-05-30` 之后的 Team Console / Discovery / runtime 相关记录。
- **历史追溯**: `2026-05-29` 及更早的稳定记录不再复制到本文件；需要考古时使用 Git 历史，例如 `git log -- docs/change-log.md`、`git show <commit>:docs/change-log.md` 或按具体文件查 `git log -- <path>`。
- **维护规则**: 新增条目必须短、可追溯、面向后续接手；不要把单次 UI 微调、排障过程、部署流水账、长测试矩阵继续塞回这里。
