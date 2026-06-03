# 当前交接快照

更新时间：`2026-06-03`

这份文档只记录当前接手所需事实。历史流水账不要塞回来；需要追溯旧阶段时用 Git 历史和专题文档。若本文件与当前用户提示、`git status` 或真实运行结果冲突，以后者为准。

## 当前维护边界

- 当前维护对象：Team Console / Canvas Task / runtime `/team-task` 创建与 Discovery 运行路径。
- 不维护：主 `/playground` UI 重做、云服务器部署推送、无关 `.pi/skills/**`、运行时 public 产物。
- 固定 Team Console 本地入口：`http://127.0.0.1:5174/`。
- 固定主后端入口：`http://127.0.0.1:3000`。
- Team Console Live API 通过 `5174` 同源代理访问 `/v1`、`/playground`、`/assets`、`/runtime`、`/vendor`。

## 接手先读

常规接手只读这些，不要全文吞旧日志：

1. `AGENTS.md`
2. `docs/handoff-current.md`
3. `apps/team-console/README.md`
4. `docs/team-runtime.md`
5. `docs/team-console-refresh-performance-plan.md`
6. `.pi/skills/team-task-creator/SKILL.md`
7. `src/team/types.ts`
8. `src/team/task-run-service.ts`
9. `src/team/run-workspace.ts`
10. `src/team/run-workspace-attempts.ts`
11. 相关测试：`test/team-task-creator-skill.test.ts`、`test/team-task-run-process.test.ts`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/src/tests/app-run-observer.test.tsx`

`docs/change-log.md` 现在只保留近期窗口。需要旧事实时用：

```bash
git log -- docs/change-log.md
git show <commit>:docs/change-log.md
git log -- <path>
```

## 文档生命周期规则

别再把文档当垃圾桶。当前规则：

- `docs/handoff-current.md` 只放当前接手事实，目标不超过 150 行；新一轮交接直接替换旧快照。
- `docs/change-log.md` 只放近期窗口，目标不超过 500 行或最近 30 天；稳定旧记录靠 Git 追溯。
- `AGENTS.md` 只放跨任务长期规则、场景索引和硬边界；单次排障、验证流水账、旧事实不要塞进去。
- `.codex/plans/` 只保留未执行、待确认或仍有复用价值的计划；已完成计划应删除、压缩进交接，或提升为专题文档。
- 专题文档承载稳定机制，不承载过程直播；超过约 1000 行时先考虑拆成索引和子文档。

## 当前 Git 现场

当前已确认：

- 分支：`main`。
- 当前分支状态和最新本地提交以 `git status --short --branch` / `git log -1 --oneline` 为准；本轮已提交 Team Console refresh performance plan Step 4 第二段增量 contract 和 Step 5 Discovery 阶段可见性。
- 当前 tracked 工作区应为空；继续工作前仍要重新确认 `git status --short --branch`。
- 本地 ahead 提交包含 Team Console refresh performance plan Step 1/2/3、Step 4 引用稳定与增量 contract、Step 5 Discovery 阶段可见性、handoff 记录，以及前序 Team Console run history、Canvas Task adaptive timeout、Team Task 模板/clone API、Team Console 复制面板、UI-only Group 和模板参数直接运行修复。
- 本轮不提交 `.codex/config.toml`、`.codex/plans/*`、`.omo/`、`github-trending.txt`、runtime/public 报告产物或截图。
- 未跟踪 runtime/public 产物禁止提交：
  - `public/developer-forum-sources-report.html`
  - `public/forum-sources-report.html`
  - `public/medtrum-view/`

继续工作前仍要重新执行：

```bash
git status --short --branch
git log -5 --oneline
git diff --stat
git diff --cached --stat
git remote -v
git log --oneline origin/main..HEAD
```

## 当前已完成事实

- Team Console refresh performance plan 已完成 Step 1/2：active root run 走 `GET /v1/team/task-runs/:runId?view=summary&taskId=:taskId`；展开 Run observer 才走 `GET /v1/team/task-runs/:runId?view=process-summary&taskId=:taskId`。
- Team Console refresh performance plan 已完成 Step 3：Discovery 子画布 scoped refresh；未打开 Discovery 子画布时不请求 generated catalog / dispatch diagnostics；打开多个 Discovery 子画布时按 `discoveryTaskId` 独立刷新，关闭后忽略迟到 response。
- Team Console refresh performance plan 已完成 Step 4 第一段：前端 live refresh 合并保持 root Task、run summary、generated full detail 引用稳定；generated summary 不覆盖已经 lazy fetched 的 full generated Task detail；root Task 从 live catalog 消失时清理对应 root run state。
- Team Console refresh performance plan 已完成 Step 4 第二段：`GET /v1/team/tasks?since=...` 返回 changed root Tasks、`deletedTaskIds` 和 `serverVersion`；`GET /v1/team/task-runs/by-task?...&since=...` 返回 changed root run summaries、预留 `deletedRunIdsByTaskId` 和 `serverVersion`；`LiveTeamApi` / `MockTeamApi` / `use-team-console-live-data.ts` 都真实消费 cursor，空增量不会清空现有 state。
- Team Console refresh performance plan 已完成 Step 5 第一版：Discovery root 卡片和 Discovery 子画布显示 `Discovery` / `Dispatch` / `Auto-run` / `Aggregation` / `Cancelled` 阶段，并显示 processed、running、completed、generated、blocked 聚合计数；本步不改 dispatcher / auto-run pool / aggregation runtime 行为。
- Team Console refresh performance plan 已完成 Step 6 runtime：Discovery dispatcher 仍顺序处理 item，但每个 item upsert 成 active generated Task 后会立即进入固定 3 并发 auto-run pool；root gating、cancel cascade、stale marking、aggregation 和 typed downstream 语义保持不变。
- `/team-task` skill 已改成通用 Task 设计向导，支持外行用户自然语言创建普通 Task 或 Discovery Task。
- Discovery root run 已修正：root 不再在 generated child 运行中提前完成；取消 root 会级联取消本轮 generated child；子画布 active child 置顶。
- Discovery aggregation 已实现：generated child 全部终态后，root attempt 写 `discovery-aggregation.json`。
- typed downstream 优先接 `discovery-aggregation.json`，不再优先消费 root `discovery-result.json`。
- Run observer 已支持 `.md` 文件内容为 JSON 时按 JSON pretty print 展示。
- terminal run 没有可展示 attempt 文件时，文案不再误导用户等待“刚启动后补齐”。
- Discovery 子画布只展示当前 root run 对应的 generated child run；新 root 运行期间不会继续露出上一轮 child 的旧完成状态，active child 置顶，终态 child 按完成时间倒序。
- Team Console 后台刷新已区分 silent refresh；active run 终态刷新、打开 Discovery 子画布和延迟 catalog refresh 不再抢占工具栏“刷新 Task”按钮加载态。
- Team Console 顶部“刷新 Task”按钮已进一步收口：手动刷新在 root Task/source/connection/root run summary 完成后立即释放按钮；已打开 Discovery 子画布的 generated catalog/run summary/dispatch diagnostics 在后台合入，不再拖住按钮。
- Discovery 子画布 generated catalog 已改走 lightweight summary；只有编辑 generated Task 等需要完整 WorkUnit 时才 lazy fetch full task detail。
- `/v1/team/task-runs/by-task?view=summary` 会省略 heavy `source.boundInputs`；`/v1/team/task-runs/:runId/tasks/:taskId/attempts?view=dispatch-diagnostics` 会省略 heavy role process 字段，只保留 dispatch diagnostics 所需摘要。
- Team Console live 模式画布 UI 状态已改为通过 `/v1/team/console-layout` 共享保存；从 `3000`、`5174` 等不同入口打开时，节点位置、viewport、展开分支、dock/收纳状态保持一致。mock/fixture 仍保留本地隔离。
- Team Console 画布恢复态已设置 1 秒最小可见时长，并使用 `role="status"` 的动画 loading 与滚动进度条；刷新时不会再让 root filter 或恢复文案一闪而过。
- Team Console Task 操作菜单已增加“运行记录”入口，按 Task 在 Execution Atlas 内展开历史 run 列表子节点；历史列表只请求 summary，不把全部历史 run/attempt/file 渲染进主画布节点，点击单条 run 后才懒加载 attempts 和文件内容。
- 从历史 run 列表打开的运行观察卡片会在顶部显示开始时间、结束时间和“复制给 Agent 分析”按钮；普通最新运行观察卡片不显示这块历史摘要。
- Canvas Task run 标注已独立持久化到 `.data/team/task-runs/run-annotations.json`；支持每个 Task 单一 best 标记、软归档和备注，不改写 `.data/team/task-runs/runs/<runId>` 下的 run/attempt/result/process 文件本体。
- 新增 `GET /v1/team/tasks/:taskId/run-history` 和 `PATCH /v1/team/task-runs/:runId/annotation`；详情仍复用既有 `GET /v1/team/task-runs/:runId`、attempts 和 attempt file API。
- Discovery 子画布 generated child card 的操作入口已收口为悬浮时显示的纵向菜单按钮；点击后在按钮下方弹出 popover，允许超出子画布边界显示，并包含编辑、归档、运行记录和运行入口。generated Task 浅编辑面板按内容自适应高度，不再在表单内部显示滚动条。
- Canvas Task 独立 run 的 worker/checker phase timeout 已改为 adaptive idle timeout + hard cap；`tool_execution_end` 和 role public output 文件变化会刷新 idle，普通文本 / thinking 不续命，timeout 失败会在 attempt failed result 中留下 `timeoutType`、`elapsedMs` 和 `lastStructuralActivityReason` 等证据。
- Team Task 模板契约已接入：Task 可带 `templateConfig.parameters`，正文使用 `{{parameterId}}` 占位；`/team-task` skill 在模板 Task 场景下必须生成模板预览。模板 Task 本体现在可直接运行，当前/最近参数保存在 `templateState.currentBindings`，run 快照保存在 `source.templateBindings`；复制/实例化仍走 `POST /v1/team/tasks/:taskId/clone` 并填 `templateBindings`，但不再是参数化运行主路径。
- Team Task clone API 已接入：普通 root Task 可复制改名，模板 Task 可复制并替换参数，clone 不复制 run history、active run 或 generated child；generated Task 禁止走 root clone route。
- Team Console Task 操作菜单已增加“复制”面板；普通工具型 Task 可直接复制改名，模板 Task 会渲染参数输入。
- Team Console Execution Atlas 已增加 UI-only Group：框选多个 root Task 后可创建 Group，Group 只保存到 canvas UI state，支持折叠/展开成员 Task，不写后端 Task 数据。
- 真实验证 run 仍在继续跑：用户启动 Discovery root Task `task_99e064aea8e3`，root run `run_d5f4d7975885` 的 root attempt `attempt_3ac49ea2c5af` 已 `succeeded`，并写出 `accepted-result.md` / `discovery-result.json`；dispatcher 创建 10 个、更新 4 个 generated Tasks，标记 9 个旧 item stale；generated child auto-run pool 已按并发 3 运行。观察到 child `task_071756d4a504` 在多轮工具完成后刷新 worker idle 并进入 checker，证明 adaptive timeout 真实生效。不要取消这个 run，除非用户明确要求。
- Canvas Task run 会记录 `source.publicBaseUrl`；`PUBLIC_BASE_URL=auto` 表示按当前请求 host/proto 或本地端口自动推导公开 base URL。
- Team role session 注入 `ARTIFACT_PUBLIC_DIR` 和 `ARTIFACT_PUBLIC_BASE_URL`；需要交付的报告/HTML 应写到 public output 目录，并通过 `/v1/team/task-runs/:runId/artifacts/:roleKey/:role/...` 稳定访问。
- `/playground/agents` 子 Agent 技能区已支持从主 Agent 覆盖更新单个技能。
- Team Console Execution Atlas 已修复 root Agent / Task / Source 位置、dock 收纳状态、Task 操作/子面板布局持久化、dock 翻页按钮，以及 ID 区域短按复制 / 拖动卡片手势冲突。
- 用户已在真实 UI 验证上述 Team Console 画布、ID 复制/拖拽修复和 1 秒画布恢复 loading 通过。

## 真实 UI 验证事实

- 用户在 Team Console Live API 重新运行 Discovery root Task `task_c70580219a00`。
- 最新 root run：`run_614c9ccdb9f8`；root attempt：`attempt_d3dbed73acf1`。
- root 发现阶段产出 17 个 item；dispatcher/upsert 完成本轮 17 个 active generated Task，且 0 blocked。
- 固定 3 并发 auto-run pool 正常补位，17/17 个 generated child run 都被启动并进入终态。
- generated child 结果：12 succeeded，5 failed；root 在全部 child 终态前保持 `running`，最后才 `completed`。
- root attempt 已写出 `discovery-aggregation.json`，summary 为 `totalItems=17`、`generatedTasks=17`、`succeeded=12`、`failed=5`、`cancelled=0`、`missingResult=0`。
- aggregation 文件：`.data/team/task-runs/runs/run_614c9ccdb9f8/tasks/task_c70580219a00/attempts/attempt_d3dbed73acf1/discovery-aggregation.json`。
- 失败项：
  - `reddit-claudeai`：`worker timeout`
  - `github-opencode-discussions`：`worker timeout`
  - `reddit-cursor`：模型侧 `data_inspection_failed`
  - `hn-algolia`：checker 判定 findings 伪造 / 不可验证
  - `zhihu-topic-ai-coding`：checker 判定知乎 URL / 数据明显幻觉
- 结论：Discovery root gating、generated child auto-run pool 和 aggregation 落盘链路健康；当前主要风险是 generated child 的数据源可达性、worker timeout 和 checker 抓出的幻觉输出。
- 用户在 Team Console Live API 对模板 Task `task_ae82bc41efad` 通过弹出的“参数”节点填写并运行，keyword 为 `Minimax M3是不是很糟糕`。
- 模板参数链路已真实验证：Task 本体仍保留 `{{keyword}}`，`templateState.currentBindings.keyword` 保存当前参数；run `run_83673cbd8acc` / attempt `attempt_6f01a41df589` 的 `source.templateBindings.keyword` 记录同一快照。
- `run_83673cbd8acc` 的 `plan.json` 中 `{{keyword}}` 出现次数为 0，`Minimax M3是不是很糟糕` 出现 6 次；worker 首条 prompt 标题和描述均使用绑定后的 keyword。worker 后续搜索时把查询简化为 `Minimax M3`，这是执行 Agent 搜索策略，不是 runtime 参数绑定失败。
- 该 run 的 root worker/checker 已 succeeded 并写出 `accepted-result.md`、`discovery-result.json`、`checker-verdict-001.json`、`worker-output-001.md`；dispatcher 已开始生成 Discovery child Tasks，例如 `zhihu`、`hackernews`、`github`、`twitter_x`、`openrouter`、`bilibili`、`reddit`、`v2ex`。

## 已验证命令

- `node --test --import tsx --test-name-pattern "root-summary|generated-tasks view=summary supports since" test\team-task-run-routes.test.ts`：3 passed。
- `node --test --import tsx test\team-task-run-routes.test.ts`：38 passed。
- `npx vitest run src\tests\team-api.test.ts src\tests\app-live-data.test.tsx src\tests\app-run-observer.test.tsx`：194 passed。
- `npm --prefix apps\team-console run build`：passed；仍有既有 Vite chunk size warning。
- `npx tsc --noEmit`：passed。
- `npm test`：2061 passed，2 skipped，0 failed。
- `git diff --check`：passed。
- Docker smoke：已重启 `ugk-pi`、`ugk-pi-team-worker`、`ugk-pi-team-console`；`http://127.0.0.1:3000/healthz` 返回 `{"ok":true}`；`http://127.0.0.1:5174/` 返回 200；`GET /v1/team/console/root-summary` 返回 root summary payload 和 `serverVersion`。
- `node --test --import tsx test\team-task-routes.test.ts`：45 passed。
- `node --test --import tsx test\team-task-run-routes.test.ts`：34 passed。
- `npm --prefix apps\team-console run test -- --run src\tests\team-api.test.ts src\tests\app-live-data.test.tsx src\tests\app-run-observer.test.tsx`：186 passed。
- `npm --prefix apps\team-console run build`：passed；仍有既有 Vite chunk size warning。
- `npx tsc --noEmit`：passed。
- `git diff --check`：passed。
- `node --test --import tsx test\team-task-store.test.ts`：31 passed。
- `node --test --import tsx test\team-task-routes.test.ts`：45 passed。
- `node --test --import tsx test\team-task-run-process.test.ts`：40 passed。
- `npm --prefix apps\team-console run test -- --run src\tests\team-api.test.ts src\tests\app-live-data.test.tsx`：162 passed。
- `node --test --import tsx test\team-task-creator-skill.test.ts`：23 passed。
- `npx tsc --noEmit`：passed。
- `git diff --check`：passed。
- `task_c70580219a00` 最新真实运行监控：`run_614c9ccdb9f8` completed，aggregation summary 为 17 generated / 12 succeeded / 5 failed。
- `node --test --import tsx --test-name-pattern "extends worker idle|artifact file|text or thinking|hard cap" test\team-task-run-process.test.ts`：4 passed。
- `node --test --import tsx test\team-task-run-process.test.ts`：39 passed。
- `node --test --import tsx test\team-task-run-routes.test.ts`：32 passed。
- `npx tsc --noEmit`：passed。
- `npm test`：2041 passed，2 skipped，0 failed。
- `git diff --check`：passed。
- 真实运行跟踪：`task_99e064aea8e3` / `run_d5f4d7975885` root worker/checker passed；generated child pool running，未取消。
- `node --test --import tsx test\team-agent-profile-runner.test.ts`：60 passed。
- `npm --prefix apps\team-console run test -- --run src\tests\app-live-data.test.tsx`：53 passed。
- `npm --prefix apps\team-console run test -- --run src\tests\app-run-observer.test.tsx`：18 passed。
- `npm --prefix apps\team-console run test -- --run src\tests\app-root-dock.test.tsx src\tests\app-canvas-state.test.tsx src\tests\app-atlas-drag.test.tsx`：passed。
- `npm --prefix apps\team-console run test -- --run src\tests\app-branch-windowing.test.tsx src\tests\app-task-branches.test.tsx src\tests\app-task-leader.test.tsx`：passed。
- `npm --prefix apps\team-console run test -- --run src\tests\app-atlas-drag.test.tsx src\tests\app.test.tsx`：passed。
- `node --test --import tsx test\chat-agent-routes.test.ts test\agent-model-ui.test.ts`：23 passed。
- `npx tsc --noEmit`：passed。
- `git diff --check`：passed。
- `npm test`：2013 tests，2011 passed，2 skipped，0 failed。
- Docker 服务已重启过，`/healthz` 正常。
- `npm exec tsc -- --noEmit --pretty false`：passed。
- `node --test --import tsx --test-name-pattern "console-layout|view=summary|dispatch-diagnostics" test/team-task-run-routes.test.ts`：4 passed。
- `npm --prefix apps/team-console run build`：passed。
- `npx vitest run src/tests/app-canvas-state.test.tsx src/tests/app-live-data.test.tsx src/tests/team-api.test.ts --testNamePattern "shared Team Console layout API|Refresh Task|summary|dispatch"`：13 passed，145 skipped。
- `docker exec -w /app/apps/team-console ugk-pi-ugk-pi-team-console-1 npx vitest run src/tests/app-canvas-state.test.tsx --testNamePattern "root filter|delayed shared"`：2 passed，6 skipped。
- `node --test --import tsx test\team-task-run-routes.test.ts`：32 passed。
- `npm --prefix apps\team-console run test -- --run src\tests\app-live-data.test.tsx src\tests\app-run-observer.test.tsx`：86 passed。
- `npm --prefix apps\team-console run test -- --run src\tests\team-api.test.ts --testNamePattern "run history|annotations"`：2 passed，85 skipped。
- `npm --prefix apps\team-console run build`：passed。
- `npx tsc --noEmit`：passed。
- 浏览器验证 `http://127.0.0.1:5174/`：Live API Task “运行记录”入口可打开 Atlas 子节点历史列表；只打开列表时请求 `run-history`，点击 run 后才请求 attempts，点击文件后在下游详情节点展示预览。
- `npm --prefix apps/team-console run test -- --run src/tests/app-live-data.test.tsx src/tests/app-run-observer.test.tsx`：86 passed。
- `npm --prefix apps/team-console run build`：passed。
- `git diff --check`：passed。
- Docker Team Console 已重启；`http://127.0.0.1:5174/` 返回 200，`http://127.0.0.1:3000/healthz` 返回 `{"ok":true}`。
- `npm --prefix apps\team-console run test -- --run src\tests\app-live-data.test.tsx`：69 passed。
- `npm --prefix apps\team-console run build`：passed。
- `npx tsc --noEmit`：passed。
- `git diff --check`：passed。
- 浏览器验证 `http://127.0.0.1:5174/`：Discovery generated child card popover 菜单和 generated Task 浅编辑面板通过；表单 `overflow-y: visible` 且无内部滚动条，用户确认通过。
- Docker compose 已按项目口径启动；`http://127.0.0.1:3000/playground`、`http://127.0.0.1:3000/healthz`、`http://127.0.0.1:5174/` 均返回 200。
- `node --test --import tsx test\team-task-routes.test.ts`：46 passed。
- `node --test --import tsx test\team-task-run-routes.test.ts`：35 passed。
- `npm --prefix apps\team-console run test -- --run src\tests\team-api.test.ts src\tests\app-live-data.test.tsx src\tests\app-run-observer.test.tsx`：190 passed。
- `npm --prefix apps\team-console run build`：passed；仍有既有 Vite chunk size warning。
- `npx tsc --noEmit`：passed。
- `git diff --check`：passed。

## 未完成 / 风险

- Team Console refresh performance plan 的 refresh/API 主线已完成到当前可收口版本：root catalog、root run summary、generated child summary 都有 `since` / `serverVersion` contract，前端优先消费聚合型 `GET /v1/team/console/root-summary`，旧拆分请求仅作为兼容 fallback；Step 6 runtime 也已完成，不要再把它和刷新性能/API/UI 阶段提示混在一个大改里。
- 用户反馈 Task 和并行 run 增多后，Team Console 通过远程 FRP 使用时刷新越来越慢，且打开期间偶发整屏“画布加载中”。已落地专题分析和行动方案：`docs/team-console-refresh-performance-plan.md`。当前 Step 1-6 已完成到第一版可消费 contract / 阶段可见性 / runtime overlap；下一轮应基于真实 FRP 大量 run 观测做针对性调优，或另起 deterministic / bulk dispatcher runtime 设计。
- `task_fb6e3f9cd973` 最近旧 Discovery runs 说明大量 item 场景下曾卡在逐 item dispatcher 阶段：`run_169c5d988eb7` 产出 56 items 但 `discoveryDispatchCount=0` / `discoveryGeneratedRunsCount=0` 后被 `user cancel`；`run_fa6daa6ad620` 产出 50 items，dispatch created 5 / updated 12 / blocked 33 / stale_marked 10 后被 `user cancel`。Step 6 已缓解“全部 dispatch 后才 auto-run”的等待，但每 item dispatcher 成本、blocked item 和源站可达性仍可能拖慢真实 run。
- 已真实 UI 复测：模板 Task 本体直接运行已有正式参数绑定。`templateState.currentBindings` 保存当前/最近参数，缺 required 参数时 Team Console 打开参数面板；已有参数或 default 时直接运行；`POST /v1/team/tasks/:taskId/runs` 可接收本次 `templateBindings` override 并写回当前参数；每次 run 在 `source.templateBindings` 记录当时快照，生成 workUnit / discoverySpec / plan / prompt 时使用绑定后的值，不再保留 `{{keyword}}`。
- 下游“JSON 数据生成 HTML 报告”Task 的 checker timeout 需要后续优化；这不是 Discovery aggregation bug。
- 真实 Discovery child 失败集中在 worker timeout、模型内容检查拦截和 checker 抓 hallucination；优先考虑缩小 generated Task 范围、改进 checker acceptance、增加源站反爬/可达性说明，而不是改 root aggregation。
- 旧 run 或旧 worker 输出里可能仍同时提到临时 `localhost:9001` 和 `/v1/files/...`；新 Task role prompt / env 已要求使用 `ARTIFACT_PUBLIC_BASE_URL`，但具体报告 Task 的 checker 仍需要按 acceptance 验证可访问性。
- deterministic validator 当前不做 URL 可达性通用机制；可达性要求应由用户创建 Task 时写入 checker acceptance，只有高频复用再考虑可选 `outputCheck`。

## 禁止事项

- 不 push；用户测试和确认后再决定。
- 不提交 `.env`、`.data/`、runtime/public 报告产物、截图、部署包、备份目录。
- 不提交 `.codex/plans/*`，除非用户明确要求。
- 不改主 `/playground` 产品 UI，除非用户明确要求。
- 不新增 backend endpoint 来绕过 Discovery 创建或 aggregation。
- 不手工 POST API 当作真实用户测试主路径。
- 不把 generated child 塞进 root tasks / root canvas。
- 不碰无关 `.pi/skills/**`；只有用户明确要求 `/team-task` skill 优化时才改 `.pi/skills/team-task-creator/SKILL.md`。

## 下一步判断

等待用户说明新的优化项，再判断落点：

- Team Console 刷新性能：refresh/API 主线已收口；后续先看真实 FRP / 大量 run 下的具体慢点，再决定是继续压缩 payload、减少轮询、还是做视窗化渲染，不要凭感觉继续堆 endpoint。
- Discovery runtime 行为：Step 6 已完成；后续若要做 deterministic / bulk dispatcher，需要另起 runtime 设计，不要和 Team Console refresh 合并提交。
- `/team-task` 体验：改 `.pi/skills/team-task-creator/SKILL.md` 和 skill 测试。
- Team Console UI：改 `apps/team-console/src/app/**` 和对应 vitest。
- runtime 行为：改 `src/team/**` 和 `test/team-task-run-process.test.ts`。
- checker/output contract：优先改 Task contract / checker acceptance；不要急着加通用 validator。
- 文档收口：保持短文档，旧事实进 Git 历史，不再堆长快照。
