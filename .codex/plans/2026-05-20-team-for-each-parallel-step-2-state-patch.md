# GLM Task: Team for_each.parallel Step 2 - Safe state patch helper

请接手 `E:\AII\ugk-pi` 的 Team `for_each.parallel` Step 2：最小安全 state patch helper。

## 当前基线

- 必须基于 Step 1 已提交后的最新 HEAD。
- 总计划文件：`.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- 本步骤只做 Step 2，不做 parallel worker-pool。

## 必须先读

- `AGENTS.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- `src/team/run-workspace.ts`
- `src/team/orchestrator.ts`
- `test/team-orchestrator-dynamic-expansion.test.ts`

## 本轮只做

- 增加一个最小 state patch/merge helper，供后续并行 child 防止 stale full-state overwrite。
- helper 必须在 state write lock 内重新读取最新 state，再应用 narrow mutation，再写回。
- 保持 `saveState` 兼容，不大范围替换 sequential 路径。

## 先写测试

- 两个近似并发 patch 更新不同 taskStates 后，最终 state 两边都保留。
- capacity-available patch 不应失败为 `state write lock busy`。
- 测试必须读取真实持久化 state，不要只验证 helper 被调用。

## 禁止做

- 不实现 `for_each.parallel` 执行池。
- 不改 Plan schema。
- 不改 UI/docs/skill。
- 不把 workspace 重写成新持久化系统。
- 不做整文件格式化或换行符转换。
- 不提交 `.env`、`.data`、runtime 产物、temp 文件、未知 `.pi/skills/*`、`skills-lock.json`。

## 当前未跟踪文件不要提交

- `.codex/plans/2026-05-20-handoff-team-router-next-session.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-2-state-patch.md`
- `public/github-trending-report.html`
- `public/medtrum-view/`
- `public/ruflo-research-report.html`
- `runtime/agent-search/`
- `runtime/ruflo-research/`

## 验证

```powershell
node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts
git diff --check -- src/team/run-workspace.ts test/team-orchestrator-dynamic-expansion.test.ts
```

## 提交

只提交一个 commit：

```text
fix(team): add safe team state patch helper
```

完成后按总计划文件里的 Delivery Report 简短汇报，并说明是否发生 EOL/formatter 变更。
