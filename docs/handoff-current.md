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

- 分支状态：`main...origin/main [ahead 1]`，本轮 typed artifact handoff 修复完成后会继续 ahead。
- 最新已确认本地 commit：`2d2ceb7 Document Team Task downstream runtime validation`；本轮修复提交以 `git log -1 --oneline` 为准。
- 2026-06-05 typed handoff 修复开始前 tracked diff 为空，staged diff 为空。
- 当前已保存提交：
  - `81b7eea Support manual upstream run selection`
  - `9342b41 Pin manual upstream run read models`
  - `35eae0c Add Team Console loaded run state`
  - `81a51f8 Wire loaded upstream runs into Team Console launches`
  - `6f8c37b Add manual upstream input diagnostics`
  - `1fcfbb1 Document Team Task run context handoff`
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
- 如果 `5174/src/app/App.tsx` 已是新源码但页面 DOM 仍像旧版，只重启 `ugk-pi-team-console` 容器并硬刷新；不要重启主 `ugk-pi` 或乱开临时后端端口。
- Team Console Vite build 的 chunk size warning 是既有非阻塞 warning，不等于本轮失败。

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
- 若用户要求发布，才 push `main` 到 `origin` / `gitee`；当前不要提交运行产物、`.data`、public 报告或 `.codex/plans/**`。

## 禁止事项

- 不提交 `.env`、`.data/`、runtime/public 报告产物、截图、部署包、备份目录。
- 不提交 `.codex/plans/**`，除非用户明确要求。
- 不改主 `/playground` 产品 UI，除非用户明确要求。
- 不新增 backend endpoint 来绕过 typed connection / run-context 合同。
- 不手工 POST API 当作真实用户测试主路径。
- 不把 generated child 塞进 root tasks / root canvas。
- 不碰无关 `.pi/skills/**`。
