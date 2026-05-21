# GLM Task: Team for_each.parallel Step 1 - Schema and validation

请接手 `E:\AII\ugk-pi` 的 Team `for_each.parallel` Step 1：schema 和 Plan 校验。

## 当前基线

- 最新 commit: `0867197 feat(agent): add http access skill`
- 总计划文件：`.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- 本步骤只做 Step 1，不做 runtime 并行执行。

## 必须先读

- `AGENTS.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- `docs/team-runtime.md`
- `src/team/types.ts`
- `src/team/plan-store.ts`
- `test/team-plan-store.test.ts`
- `test/team-routes.test.ts`

## 本轮只做

- `TeamTask.forEach.mode` 支持 `"sequential" | "parallel"`。
- `PlanStore` 接受 `parallel`。
- 未知 mode 继续拒绝。
- `parallel + forEach.taskTemplate.decomposer.mode leaf/propagate` 创建或更新时拒绝。
- `sequential` 现有行为不变。

## 先写测试

- `test/team-plan-store.test.ts`
  - valid `for_each` with mode `parallel` is accepted
  - unknown mode is rejected
  - `parallel + taskTemplate.decomposer leaf/propagate` is rejected
  - `parallel + no decomposer` or `mode none` is accepted
- `test/team-routes.test.ts`
  - `POST /v1/team/plans` accepts parallel dynamic plan
  - `PATCH /v1/team/plans/:planId` rejects `parallel + template decomposer` while `runCount=0`

## 禁止做

- 不改 `src/team/orchestrator.ts` 的执行逻辑。
- 不新增 `maxConcurrency`。
- 不改 Team UI。
- 不改 `.pi/skills/team-plan-creator/SKILL.md`。
- 不做整文件格式化或换行符转换。
- 不提交 `.env`、`.data`、runtime 产物、temp 文件、未知 `.pi/skills/*`、`skills-lock.json`。

## 当前未跟踪文件不要提交

- `.codex/plans/2026-05-20-handoff-team-router-next-session.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-1-schema.md`
- `public/github-trending-report.html`
- `public/medtrum-view/`
- `public/ruflo-research-report.html`
- `runtime/agent-search/`
- `runtime/ruflo-research/`

## 验证

```powershell
node --test --import tsx test/team-plan-store.test.ts
node --test --import tsx --test-name-pattern "for_each|dynamic plan|parallel" test/team-routes.test.ts
git diff --check -- src/team/types.ts src/team/plan-store.ts test/team-plan-store.test.ts test/team-routes.test.ts
```

## 提交

只提交一个 commit：

```text
feat(team): accept parallel for_each mode
```

完成后按总计划文件里的 Delivery Report 简短汇报，并说明是否发生 EOL/formatter 变更。
