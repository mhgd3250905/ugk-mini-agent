# 2026-05-21 新会话交接：Team for_each.parallel v1 已完成，Router / Parallel Researcher 待设计

## 当前状态

- Repo: `E:\AII\ugk-pi`
- HEAD: `b545d98 docs(team): clarify parallel decomposer policy`
- Team `for_each.parallel` v1 已完成并验证通过。
- Step 6 是最终验证任务，没有新增 commit。
- 当前 `git status --short` 只有未跟踪计划文件和运行 / 研究产物；不要提交这些产物，除非用户明确要求。

## 本阶段已完成并提交

### http-access

- `0867197 feat(agent): add http access skill`
- 新增系统技能 `http-access`，默认关闭。
- 目标：不用 Chrome 实体接管公开网页、JSON API、RSS、sitemap、GitHub/raw、package metadata、普通下载、HEAD/状态码/重定向检查、静态 HTML 抽取等轻量网络请求。
- `web-access` 不需要知道 `http-access` 存在；两者通过 agent skill 安装隔离和 UI 开关避免冲突。

### 阿里 CodePlan provider

- `c123fc7 feat(model): add ali codeplan provider`
- 按 Anthropic-compatible 标准接入阿里 CodePlan API 源。
- `.env` 已由用户要求填好，服务已重启生效；不要在文档或回复里泄露 key。

### Team for_each.parallel v1

提交链路：

- `2008b7a feat(team): accept parallel for_each mode`
- `da304b2 fix(team): add safe team state patch helper`
- `4f39c26 feat(team): run parallel for_each children with fixed pool`
- `f4ae5e7 fix(team): harden parallel for_each state handling`
- `6164bc5 fix(team): propagate parallel state write failures`
- `0089443 fix(team): drain parallel children on fatal errors`
- `278fb2b fix(team): align parallel for_each run controls`
- `41311fa fix(team): resume interrupted parallel children safely`
- `66ddbb8 fix(team): remove controls test BOM`
- `93a907a docs(team): document parallel for_each planning`
- `b545d98 docs(team): clarify parallel decomposer policy`

实现摘要：

- Schema / validation:
  - `forEach.mode` 支持 `"sequential" | "parallel"`。
  - `parallel + forEach.taskTemplate.decomposer.mode = "leaf" | "propagate"` 在 Plan 创建 / 更新时拒绝。
  - `parallel + no decomposer` 或 `decomposer.mode = "none"` 允许，不触发进一步拆分。
- Runtime worker-pool:
  - 固定容量池 3。
  - child 完成即补位，不是 batch 模式。
  - 每个 child 仍走 worker -> checker -> watcher。
- 并发状态安全：
  - `RunWorkspace.patchState(runId, mutator)` 在 state write lock 内重新读取最新 state，再做窄 patch 和原子写。
  - `parallelTaskId` `AsyncLocalStorage` + `saveState` override 把并行 child 写入路由到 `patchState`，避免 stale overwrite。
  - fatal state-write error 会冒泡到 run-level failure；fatal 后会 drain active children，再恢复 `saveState` override。
- Parent partial-failure semantics:
  - 0 child：parent `succeeded`。
  - 至少一个 child `succeeded`：parent `succeeded`。
  - 全部 child `skipped`：parent `skipped`。
  - 没有成功且存在失败：parent `failed`。
  - 失败 child 的 audit / result / errorSummary 保留。
- Pause / cancel / rerun:
  - pause 标记所有 running 子任务为 `interrupted`，停止继续入池。
  - cancel 标记未完成子任务为 `cancelled`。
  - resume 把 `interrupted` 子任务重置为 `pending`，允许重新执行。
  - rerun `force_rerun` / `skip` 对 parallel child 生效，expansion record 复用，不重复生成。
- Docs / skill:
  - `docs/team-runtime.md` 已记录 parallel mode、固定容量、partial-failure、pause/cancel/rerun、decomposer policy。
  - `.pi/skills/team-plan-creator/SKILL.md` 已教 plan creator 何时建议 parallel。
  - `docs/change-log.md` 已记录 Team parallel 相关更新。

## 验证记录

最终复核已通过：

```text
npm run test:team
-> 782 pass / 0 fail / 2 skipped

npx tsc --noEmit
-> clean

git diff --check
-> clean

git diff --stat / git diff --numstat
-> 当前 tracked diff 为空；Step 3-5 变更规模已人工审查

git ls-files --eol src/team/types.ts src/team/plan-store.ts src/team/orchestrator.ts src/team/run-workspace.ts docs/team-runtime.md docs/change-log.md .pi/skills/team-plan-creator/SKILL.md test/team-orchestrator-controls.test.ts test/team-parallel-foreach.test.ts
-> 全部 i/lf w/lf
```

补充复核结论：

- 当前 HEAD：`b545d98`
- 工作区无 tracked diff。
- Step 6 没有新增 commit，符合“没有验证失败就不新增 commit”的要求。
- 文档口径已从“一律拒绝 parallel + decomposer”修正为“只拒绝 leaf / propagate；none 或无 decomposer 允许”。

## 当前未跟踪文件，不要提交

计划文件：

- `.codex/plans/2026-05-20-handoff-team-router-next-session.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-1-schema.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-2-state-patch.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-3-drain-fatal-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-3-fix-followup-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-3-fix-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-3-worker-pool.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-4-controls-followup-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-4-controls.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-5-docs-skill.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-6-final-verify.md`

运行 / 研究产物：

- `public/agent-search-report.html`
- `public/github-trending-report.html`
- `public/medtrum-view/`
- `public/ruflo-research-report.html`
- `runtime/agent-search/`
- `runtime/medtrum-news-2026/`
- `runtime/ruflo-research/`

## 下一阶段方向

用户下一步想讨论 Team 功能拓展，不是继续修 parallel v1。

已形成但未实现的方向：

1. 并行 researcher 是最明显的提效场景。
2. 推荐先做显式 execution template + 轻量 heuristic router，而不是直接重写完整 DAG scheduler。
3. 推荐模板：
   - `single_agent`
   - `parallel_research`
   - `coding_fix`
   - `deep_research_with_review`
4. `parallel_research` 可包含：
   - docs researcher
   - source researcher
   - examples/tests researcher
   - ecosystem/issues researcher
   - synthesizer
   - reviewer 可选
5. 不建议每个 task 都固定 worker -> checker -> watcher，这会过慢且成本高。
6. Router / planner 应按任务类型、复杂度、可并行性、浏览器需求、资源预算决定哪些 agent 上场。

## 下一步建议

如果用户继续 Team Router / execution template：

1. 先用 `brainstorming` 继续厘清设计，不要直接写代码。
2. 必须先读：
   - `AGENTS.md`
   - `docs/team-runtime.md`
   - `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
   - `src/team/types.ts`
   - `src/team/orchestrator.ts`
   - `src/team/plan-store.ts`
   - `src/team/agent-profile-role-runner.ts`
   - `src/team/routes.ts`
   - `src/workers/team-worker.ts`
3. 如果要交给 GLM 做，使用 `glm-plan`，并把任务拆成多个独立 step，不要把大计划揉成一坨。
4. 新计划建议命名：
   - `.codex/plans/YYYY-MM-DD-team-execution-template-router-plan.md`

## 禁止事项

- 不要启动 Chrome，除非用户明确要求。
- 不要重启服务，除非用户明确要求。
- 不要清理 `.data`、`.env`、`runtime/`、`public/` 产物。
- 不要提交上述未跟踪计划 / 运行 / 研究产物，除非用户明确要求。
- 不要把 Router 设计直接塞进 `for_each.mode`；动态展开和执行拓扑别混成一锅粥。
- 不要把 Team Runtime 直接重写成完整 DAG scheduler；这会扩大 pause/cancel/rerun/UI 审计链路风险。
- 不要把 runtime 产品技能 `.pi/skills/` 和维护仓库用的 `.codex/skills/` 混用。

## 给下个会话的最短开场

```text
请接手 E:\AII\ugk-pi。先读 AGENTS.md、docs/team-runtime.md、.codex/plans/2026-05-20-handoff-team-router-next-session.md。Team for_each.parallel v1 已完成，HEAD 是 b545d98，最终验证 npm run test:team 782 pass / 0 fail / 2 skipped，npx tsc --noEmit clean。当前只有未跟踪计划文件和 public/runtime 研究产物，不要提交或清理。接下来讨论 Team execution template router / parallel_research，请先 brainstorming，不要直接改代码。
```
