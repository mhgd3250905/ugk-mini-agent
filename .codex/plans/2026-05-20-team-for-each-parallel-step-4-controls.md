# GLM Task: Team for_each.parallel Step 4 - Run controls

请接手 `E:\AII\ugk-pi` 的 Team `for_each.parallel` Step 4：parallel for_each 的 pause/cancel/rerun 控制覆盖。

## 当前基线

- 必须基于 Step 1-3 已提交后的最新 HEAD。
- 总计划文件：`.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- 本步骤只做 Step 4。

## 必须先读

- `AGENTS.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- `src/team/orchestrator.ts`
- `test/team-orchestrator-controls.test.ts`
- `test/team-orchestrator-dynamic-expansion.test.ts`

## 本轮只做

- 为 parallel for_each 增加 pause/cancel/rerun/manual disposition 控制测试。
- 如果测试暴露 runtime bug，只做最小修复。
- 保证 expansion 不重复生成，active children 不出现互相矛盾终态。

## 先写测试

- pause active parallel run: active children interrupted, no new waiting child admitted。
- cancel active parallel run: unfinished children consistently cancelled/failed per existing semantics, no contradictory terminal states。
- rerun/manual disposition:
  - forced rerun children execute again
  - skipped children remain skipped
  - terminal children are not duplicated
  - expansion is reused

## 禁止做

- 不改 UI。
- 不改 API shape。
- 不新增 scheduler 或 `maxConcurrency`。
- 不改 docs/skill。
- 不做整文件格式化或换行符转换。
- 不提交 `.env`、`.data`、runtime 产物、temp 文件、未知 `.pi/skills/*`、`skills-lock.json`。

## 当前未跟踪文件不要提交

- `.codex/plans/2026-05-20-handoff-team-router-next-session.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-4-controls.md`
- `public/github-trending-report.html`
- `public/medtrum-view/`
- `public/ruflo-research-report.html`
- `runtime/agent-search/`
- `runtime/ruflo-research/`

## 验证

```powershell
node --test --import tsx test/team-orchestrator-controls.test.ts
node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts
git diff --check -- src/team/orchestrator.ts test/team-orchestrator-controls.test.ts test/team-orchestrator-dynamic-expansion.test.ts
```

## 提交

只提交一个 commit。优先：

```text
test(team): cover parallel for_each run controls
```

如果包含实现修复，用：

```text
fix(team): align parallel for_each run controls
```

完成后按总计划文件里的 Delivery Report 简短汇报，并说明是否发生 EOL/formatter 变更。
