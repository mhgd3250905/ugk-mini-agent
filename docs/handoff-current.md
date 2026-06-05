# 当前交接快照

更新时间：`2026-06-05`

这份文档只记录当前接手所需事实。历史流水账不要塞回来；需要追溯旧阶段时用 Git 历史、专题文档和 `docs/change-log.md`。若本文件与当前用户提示、`git status` 或真实运行结果冲突，以后者为准。

## 当前维护边界

- 当前维护对象：Team Console / Canvas Task / runtime `/team-task` / Discovery 的 run-context 合同。
- 不维护：主 `/playground` UI 重做、云服务器推送、无关 `.pi/skills/**`、运行时 public 产物。
- 固定 Team Console 本地入口：`http://127.0.0.1:5174/`。
- 固定主后端入口：`http://127.0.0.1:3000`。
- Team Console Live API 通过 `5174` 同源代理访问 `/v1`、`/playground`、`/assets`、`/runtime`、`/vendor`。

## 接手先读

常规 Team Console / Canvas Task / Discovery 接手只读这些：

1. `AGENTS.md`
2. `docs/handoff-current.md`
3. `apps/team-console/README.md`
4. `docs/team-runtime.md`
5. `.codex/plans/2026-06-04-team-task-run-context-requirements.md`
6. `.pi/skills/team-task-creator/SKILL.md`
7. `src/team/types.ts`
8. `src/team/task-run-service.ts`
9. `src/team/run-workspace.ts`
10. 相关测试：`test/team-task-run-process.test.ts`、`test/team-task-run-routes.test.ts`、`apps/team-console/src/tests/team-api.test.ts`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/src/tests/app-run-observer.test.tsx`

## 当前 Git 现场

- 分支状态：本地 `main` 已包含 Team Group / GroupRun 系列提交；继续前仍以 `git status --short --branch` 为准。
- 最新已推送主线包含 `757dd3b Merge PR #6 Team Console lasso groups`；Team Group / GroupRun 系列如未推送，先用 `git log --oneline origin/main..HEAD` 确认本地领先提交。
- 当前已保存并推送的关键提交：
  - `81b7eea Support manual upstream run selection`
  - `9342b41 Pin manual upstream run read models`
  - `35eae0c Add Team Console loaded run state`
  - `81a51f8 Wire loaded upstream runs into Team Console launches`
  - `6f8c37b Add manual upstream input diagnostics`
  - `1fcfbb1 Document Team Task run context handoff`
  - `4d4adc0 Fix Team Task typed artifact handoff`
  - `119b99c Document Team Task user validation`
  - `757dd3b Merge PR #6 Team Console lasso groups`
- 当前 Team Group / GroupRun 本地关键提交：
  - `40f7eb5 Add Team Task Group definition contract`
  - `28aabb5 Add Team Task GroupRun backend contract`
  - `0f67e81 Connect Team Console to backend Task Groups`
  - Team Console manual GroupRun UI 已完成并保存；准确 hash 以 `git log -1 --oneline` 为准。
- 不要提交这些本地未跟踪物件：`.codex/config.toml`、既有 `.codex/plans/**`、`.omo/`、`github-trending.txt`、`public/developer-forum-sources-report.html`、`public/forum-sources-report.html`、`public/medtrum-view/`。

继续工作前先执行：

```bash
git status --short --branch
git log -6 --oneline
git diff --stat
git diff --cached --stat
git log --oneline origin/main..HEAD
```

## 当前已完成事实

- `POST /v1/team/tasks/:taskId/runs` 支持可选 `upstreamRunSelections: Array<{ connectionId, fromRunId }>`；不传该字段时保持旧行为。
- 后端会把选中的上游历史 run 解析为显式 `source.boundInputs[]`，并把提示词/payload 指向该 bound input，避免 worker 自己猜旧 asset 或旧 workspace 文件。
- 手动选择 trace 记录在 `source.manualUpstreamSelections[]`；手动直接启动的下游 run 不伪造 `source.triggeredBy`。
- 自动 typed downstream 仍使用 `source.triggeredBy.type === "task-connection"` 和 `downstreamDelivery`。
- Full run detail 保留 heavy `source.boundInputs[]` 和 `source.manualUpstreamSelections[]`。
- Summary-style API 继续省略 heavy `source.boundInputs[]`，但可保留 lightweight `source.manualUpstreamSelections[]` 作为诊断 trace。
- Discovery 作为上游时，手动选择的历史 run 优先绑定该 run 的 `discovery-aggregation.json`，没有 aggregation 时 fallback 到 `discovery-result.json`。
- Team Console 运行记录行可 `装载此记录` / `取消装载`；已装载状态只保存 `{ taskId, runId }` 引用，不保存 artifact/content/attempt/files。
- 启动下游 Task 时，Team Console 只从指向目标 Task 的非 stale typed connection 生成 `upstreamRunSelections[]`。
- 上游 Task 有 queued/running/paused active run 时，active upstream run 优先于 historical loaded run。
- 当前页面内已知 loaded run 非 `completed` 时，前端不发送该 selection；从持久化 UI state 恢复后状态未知的 selection 交由后端最终校验。
- Step 05 run observer 诊断区展示 lightweight manual upstream trace；artifact `type` / `fileRef` 只通过当前 opened observer run 的 full detail enrichment 补齐。
- Step 05 full-detail enrichment 对每个 opened observer run 只尝试一次；成功和失败都会设置 attempted guard，不随 2 秒 active poll 重复拉取。
- Run observer 不持久化、不渲染 artifact content、preview 或完整 artifact 对象。
- 2026-06-05 真实运行确认：Team Console UI 对 `task_e1846fa41c83` 发送的 `upstreamRunSelections[]` 正确，选择的是 connection `conn_52ab18a4ffc3` 和上游历史 run `run_3cfcffe71bec`。此前 UI 跑出的裸 run 不是前端选择丢失，而是 `ugk-pi` 主后端和 `ugk-pi-team-worker` 仍运行旧进程；磁盘已有 Step 01 后端代码，但 `npm start` / `worker:team` 不是 watch 模式，未重启不会加载新 route/service 逻辑。
- 已重启 `ugk-pi` 和 `ugk-pi-team-worker`。重启后直接 HTTP POST 和 Team Console UI 启动都能把 `source.manualUpstreamSelections[]` 与 `source.boundInputs[]` 写入新 run。
- 验证 run：`task_e1846fa41c83` 的 `run_416bd5c5c693` 已 `completed`，`taskState.status="succeeded"`，`resultRef=tasks/task_e1846fa41c83/attempts/attempt_518df0a903c2/accepted-result.md`，报告 URL 为 `http://127.0.0.1:3000/v1/team/task-runs/run_416bd5c5c693/artifacts/attempt_518df0a903c2/worker/report.html`，HTTP 200。
- 普通 Task-to-Task typed artifact handoff 已修复：手动 `upstreamRunSelections[]` 和自动 typed downstream 共用 runtime resolver。Discovery 上游保持 `discovery-aggregation.json` -> `discovery-result.json` 优先级；普通 Task 按 connection type 优先选择当前 attempt 的 `agent-workspaces/<attemptId>/worker/output/**` 机器可消费文件，`json` 只接受可解析 JSON object/array 的 `.json`；没有匹配时才 fallback 到 `accepted-result.md` / 既有 `resultRef`。
- 2026-06-05 修复后真实链路验证：重启 `ugk-pi` / `ugk-pi-team-worker` 后，用 `task_e1846fa41c83` + `conn_52ab18a4ffc3` + 上游 `run_3cfcffe71bec` 启动新 run `run_4af859e1d834`。该 run 已 `completed`，`taskState.status="succeeded"`，`source.boundInputs[0].artifact.fileRef="agent-workspaces/attempt_b541b6717710/worker/output/structured-report.json"`，不是 `accepted-result.md`。下游 worker 生成的 HTML 报告实际文件为 `diabetes-report.html`，URL `http://127.0.0.1:3000/v1/team/task-runs/run_4af859e1d834/artifacts/attempt_a5b5ef9409ef/worker/diabetes-report.html` 返回 HTTP 200。
- 2026-06-05 用户侧正常路径验证通过：用户从 Team Console 启动 `task_e1846fa41c83` 后，过程界面显示“手动上游输入”。后端 run `run_221b63509573` 已 `completed`，`taskState.status="succeeded"`，`source.boundInputs[0].artifact.fileRef="agent-workspaces/attempt_b541b6717710/worker/output/structured-report.json"`，下游报告 `diabetes-industry-report.html` URL `http://127.0.0.1:3000/v1/team/task-runs/run_221b63509573/artifacts/attempt_1033900d9857/worker/diabetes-industry-report.html` 返回 HTTP 200。用户确认测试通过。
- Team Console Execution Atlas 框选和 UI-only Group 交互已优化：框选节点高亮增强，点击已选集合外的空白或其他节点会清空框选；折叠 Group 可拖动，展开 Group 可上锁/解锁/移除；锁定 Group 不能移动/删除，内部 Task 单独拖动或混合多选拖动时都不会被移动。
- 2026-06-05 PR #6 合并后用户看到旧 UI，根因确认是 `ugk-pi-team-console` 的 Vite dev server 仍返回旧 transformed module。宿主和容器 `/app` 源码均已是新代码，但 `http://127.0.0.1:5174/src/graph/ExecutionMap.tsx` 一度不含 `onToggleTaskGroupLock` / `lockedTaskGroupNodeIdSet` / `data-task-group-locked`；执行 `docker compose restart ugk-pi-team-console` 后这些标记已返回，页面加载正常。
- Team Task Group definition 已成为后端持久结构单位。Live Team Console Group membership 以后端 `TeamTaskGroup.taskIds[]` 为准；`canvas-ui-state` 只保存 `{ groupId, collapsed, locked }` 展示态。Mock 模式仍保留 UI-only Group。
- Team Task GroupRun 后端 contract 已建立。启动 GroupRun 会并行启动 Group 内所有 head tasks，拒绝 active GroupRun 和 Group 内 active Canvas Task run；取消 GroupRun 会取消 Group 内 active Canvas Task runs。
- Team Console Live backend Group 展开 frame 已接入手动 GroupRun UI。“运行”调用 `POST /v1/team/task-groups/:groupId/runs`，“终止”调用 `POST /v1/team/task-group-runs/:groupRunId/cancel`；active GroupRun 约 2 秒轮询详情，并在启动、终止或进入终态后 silent refresh 内部 Task run summary。
- GroupRun active polling 已补紧循环回归保护：相同 `groupRunId/status/updatedAt/finishedAt/observedRuns.length/entryRuns.length` 不写 React state，避免 `setState -> effect 重建 -> 立即 GET`。
- Conn 后端 execution contract 已接入 Team Group：`execution` 支持 `{ type: "agent_prompt" }` 和 `{ type: "team_group", groupId }`，旧 Conn 默认归一化为 `agent_prompt`。SQLite 新增 `execution_json`，`/v1/conns` create/update/list/detail 均返回 normalized execution。
- `ugk-pi-conn-worker` 对 `team_group` Conn run 不启动 BackgroundAgentRunner，而是调用主服务 GroupRun API 启动/轮询/取消；409 active guard 会作为 succeeded skipped 记录，summary 以 `Skipped:` 开头。
- Conn 管理 UI 已接入 Team Group 执行对象：`/playground` 的 Conn manager 和 `/playground/conn` 独立页都可在 `agent_prompt` 与 `team_group` 间选择。选择 `team_group` 时只从后端 `GET /v1/team/task-groups` 读取 Group，不允许选择单 Task；保存 payload 使用 `execution: { type: "team_group", groupId }`，`target` 仍只表示结果投递目标。
- Conn run detail 的 Team Group `Skipped` 展示只以 `resolvedSnapshot.skipped === true` 为准；failed GroupRun 不应显示 Skipped，而应保留普通 `groupRunStatus`、`errorText/resultText/resultSummary` 展示链路。

## 验证证据

- Step 01 backend 验证通过：
  - `node --test --import tsx test\team-task-run-process.test.ts test\team-task-run-routes.test.ts`：91/91 pass。
  - `npx tsc --noEmit`：pass。
  - `git diff --check`：pass。
- Step 02 read model 验证通过：
  - manual upstream / summary focused route tests：11/11 pass。
  - upstream run selection / Discovery / manual upstream focused process tests：6/6 pass。
  - `node --test --import tsx test\team-task-run-routes.test.ts`：42/42 pass。
  - `npx tsc --noEmit`、`git diff --check`：pass。
- Step 03 Team Console loaded run state 验证通过：
  - `app-run-observer.test.tsx`：23/23 pass。
  - `app-live-data.test.tsx` + `app-run-observer.test.tsx`：105/105 pass。
  - Team Console build、`npx tsc --noEmit`、`git diff --check`：pass。
- Step 04 launch wiring 验证通过：
  - `app-run-observer.test.tsx`：33/33 pass。
  - `team-api.test.ts` + `app-live-data.test.tsx` + `app-run-observer.test.tsx`：210/210 pass。
  - Team Console build、`npx tsc --noEmit`、`git diff --check`：pass。
- Step 05 diagnostics 验证通过：
  - `app-run-observer.test.tsx`：39/39 pass。
  - `team-api.test.ts` + `app-live-data.test.tsx` + `app-run-observer.test.tsx`：216/216 pass。
  - Team Console build、`npx tsc --noEmit`、`git diff --check`：pass。
- Step 05 browser 验证使用 `http://127.0.0.1:5174/`，在只重启 `ugk-pi-team-console` 清理 Vite stale transformed module 后确认：
  - manual downstream observer 渲染 `data-observer-section="input-diagnostics"`。
  - manual row 渲染 `data-input-diagnostic-kind="manual-upstream"`。
  - active poll 刷新期间 manual detail request count 保持 1。
  - heavy artifact content / preview 字符串未渲染。
  - ordinary run observer full-detail diagnostic request count 为 0。
  - console error/warn count 为 0。
- 2026-06-05 typed artifact handoff 修复验证通过：
  - `node --test --import tsx --test-name-pattern "typed artifact|upstream run selection|manual upstream|downstream" test\team-task-run-process.test.ts`：21/21 pass。
  - `node --test --import tsx test\team-task-artifact-handoff.test.ts`：14/14 pass。
  - `node --test --import tsx test\team-task-run-process.test.ts test\team-task-run-routes.test.ts`：93/93 pass。
  - `npx tsc --noEmit`、`git diff --check`：pass。

## 已知运行口径

- Browser revalidation 对纯 Step 06 文档收口不是必需项；若以后声称新的浏览器证据，必须来自 `http://127.0.0.1:5174/` 且使用自动化。
- 如果 `5174` 页面仍像旧版，先直接请求 `http://127.0.0.1:5174/src/graph/ExecutionMap.tsx` 和 `http://127.0.0.1:5174/src/app/App.tsx` 查是否包含新标记；若宿主/容器 `/app` 是新源码但 `5174` 返回旧 transformed module，只重启 `ugk-pi-team-console` 并硬刷新浏览器。不要重启主 `ugk-pi` 或乱开临时后端端口。
- Team Console Vite build 的 chunk size warning 是既有非阻塞 warning，不等于本轮失败。
- Team Console lasso selection / UI-only Group 交互优化：
  - PR review 时新增锁定 Group 混合多选拖拽回归测试，先红后绿：锁定 Group 内部 Task 不会被已选未锁 Agent 拖拽带走。
  - `npm --prefix apps/team-console run test -- --run src/tests/app-connections.test.tsx -t "locks a Group"`：1 passed。
  - PR 作者已验证：`app-connections.test.tsx`、`app-static-contracts.test.ts`、`execution-map-ui.test.tsx` Discovery root、`atlas-geometry.test.ts`、Team Console build、`git diff --check` 和本地浏览器 reload console error count 0。
  - `npm --prefix apps/team-console run build`：passed；仍有既有 Vite chunk size warning。
- Team Group / GroupRun 系列验证通过：
  - `node --test --import tsx test\team-task-group-routes.test.ts`：12/12 pass。
  - `node --test --import tsx test\team-task-group-run-routes.test.ts`：11/11 pass。
  - `node --test --import tsx test\team-task-run-routes.test.ts`：42/42 pass。
  - `npm --prefix apps/team-console run test -- --run src/tests/team-api.test.ts src/tests/app-connections.test.tsx src/tests/app-run-observer.test.tsx`：178 pass。
  - `npm --prefix apps/team-console run test -- --run src/tests/app-static-contracts.test.ts`：27 pass。
  - `npm --prefix apps/team-console run build`：passed；仍有既有 Vite chunk size warning。
  - `npx tsc --noEmit`、`git diff --check`：pass。
- Conn Team Group UI 验证通过：
  - `node --test --import tsx test\server.test.ts`：168/168 pass。
  - `npx tsc --noEmit`：pass。
  - `git diff --check`：pass。
- Conn Scheduler Step 07 真实入口验收：
  - `/playground` 后台任务入口可点击，真实入口跳转到 `/playground/conn`。
  - `/playground/conn` 新建任务默认 `agent_prompt` 模式，Prompt、Agent、浏览器、模型控件可见；切到 `team_group` 后读取 `GET /v1/team/task-groups`，本地返回 `{"groups":[]}`，Team Group 选择器显示空态并禁用保存，Prompt 不再 required，Agent/浏览器/模型控件隐藏。
  - `5174` Team Console 可切到 Live API，网络请求包含 `GET /v1/team/console/root-summary` 和 `GET /v1/team/task-groups`；`ExecutionMap.tsx` 返回 `onToggleTaskGroupLock`、`lockedTaskGroupNodeIdSet`、`data-task-group-locked`，不是旧 Vite module。
  - 本地没有安全测试 Group，因此未触发真实 `team_group` Conn run；不要拿现有知乎/Medtrum 用户任务链路硬跑。

## 受保护不变式

- `POST /v1/team/tasks/:taskId/runs` 不带 `upstreamRunSelections` 时保持旧行为。
- Source node direct binding 仍使用 `source: "canvas-source"`，不自动触发 Task run。
- 自动 typed downstream 仍记录 `source.triggeredBy.type === "task-connection"` 和 `downstreamDelivery`。
- 手动 direct downstream run 不伪造 `source.triggeredBy`。
- Summary-style API responses 继续省略 heavy `source.boundInputs`。
- Full run detail 是暴露 heavy `source.boundInputs` 的唯一常规 read model。
- Team Console persisted state 只保存 `{ taskId, runId }`，不保存 artifact 内容。
- Run observer 不持久化或渲染 artifact content / preview / full artifact objects。
- Step 05 full-detail enrichment 对同一 opened observer run 保持一次尝试预算。

## 未完成 / 下一步候选

- 本轮 typed artifact handoff 代码级测试、真实链路和用户正常路径均已验证；后续若用户继续跑真实数据，可直接基于 `task_e1846fa41c83` 的成功 run `run_221b63509573` 检查报告质量或继续迭代下游 Task。
- Conn scheduler 后端和 Conn UI 已接入 Team Group。真实入口验收已覆盖 `/playground`、`/playground/conn` 和 `5174`；当前 blocker 是本地没有安全测试 Group。下一步若要做真实 Conn GroupRun E2E，先创建或确认一个闭合的测试 Group，再通过 UI 创建 `team_group` Conn 并触发运行；不要用现有知乎/Medtrum 这类真实用户任务链路。
- `origin/main` 已推送到 PR #6 合并版本；Gitee 未同步。当前不要提交运行产物、`.data`、public 报告或 `.codex/plans/**`。

## 禁止事项

- 不提交 `.env`、`.data/`、runtime/public 报告产物、截图、部署包、备份目录。
- 不提交 `.codex/plans/**`，除非用户明确要求。
- 不改主 `/playground` 产品 UI，除非用户明确要求。
- 不新增 backend endpoint 来绕过 typed connection / run-context 合同。
- 不手工 POST API 当作真实用户测试主路径。
- 不把 generated child 塞进 root tasks / root canvas。
- 不碰无关 `.pi/skills/**`。
