# GLM Task: Team for_each.parallel Step 3 - Fixed pool runtime

请接手 `E:\AII\ugk-pi` 的 Team `for_each.parallel` Step 3：固定容量 3 的 parallel worker-pool runtime。

## 当前基线

- 必须基于 Step 1 和 Step 2 都已提交后的最新 HEAD。
- 总计划文件：`.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- 本步骤只做 Step 3，不做 pause/cancel/rerun 专项扩展，不改 docs/skill。

## 必须先读

- `AGENTS.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- `src/team/orchestrator.ts`
- `src/team/run-workspace.ts`
- `src/team/task-expansion-planner.ts`
- `test/team-orchestrator-dynamic-expansion.test.ts`

## 本轮只做

- `executeForEachTask` 按 mode 分支。
- `sequential` 路径保持等价。
- `parallel` 路径读取/创建 expansion 后，用固定容量 3 的 worker-pool 执行非 terminal child。
- 任一 child 完成后立即补入等待队列中的下一个 child，不做批处理。
- child 仍走 worker -> checker -> watcher。

## Parent 汇总语义

- 至少一个 child `succeeded` => parent `succeeded`
- 全部 child `skipped` => parent `skipped`
- 没有 `succeeded` 且至少一个 child `failed` => parent `failed`
- 0 items => parent `succeeded`

## 先写测试

- 4+ children 时 active child count never exceeds 3。
- 证明不是批处理：一个 child 提前完成后立即补位。
- 部分 child failed 且至少一个 succeeded 时 parent succeeded，失败 child 审计保留。
- 全部 child failed 时 parent failed。
- 全部 child skipped 时 parent skipped。
- 0 items 仍 succeeded。
- expansion 只写一次，resume/rerun 不重复扩展。

## 禁止做

- 不新增 `maxConcurrency`。
- 不支持 `parallel + decomposer`。
- 不重写 DAG scheduler。
- 不改 Team UI。
- 不改 `docs/team-runtime.md` 或 `.pi/skills/team-plan-creator/SKILL.md`。
- 不做整文件格式化或换行符转换。
- 不提交 `.env`、`.data`、runtime 产物、temp 文件、未知 `.pi/skills/*`、`skills-lock.json`。

## 当前未跟踪文件不要提交

- `.codex/plans/2026-05-20-handoff-team-router-next-session.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-3-worker-pool.md`
- `public/github-trending-report.html`
- `public/medtrum-view/`
- `public/ruflo-research-report.html`
- `runtime/agent-search/`
- `runtime/ruflo-research/`

## 验证

```powershell
node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts
git diff --check -- src/team/orchestrator.ts test/team-orchestrator-dynamic-expansion.test.ts
```

## 提交

只提交一个 commit：

```text
feat(team): run parallel for_each children with fixed pool
```

完成后按总计划文件里的 Delivery Report 简短汇报，并说明是否发生 EOL/formatter 变更。
