# GLM Task: Team for_each.parallel Step 5 - Docs and team-plan-creator

请接手 `E:\AII\ugk-pi` 的 Team `for_each.parallel` Step 5：文档和 `team-plan-creator` 更新。

## 当前基线

- 必须基于 Step 1-4 已提交后的最新 HEAD。
- 总计划文件：`.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- 本步骤只做 Step 5。

## 必须先读

- `AGENTS.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `.pi/skills/team-plan-creator/SKILL.md`

## 本轮只做

- 更新 `docs/team-runtime.md`，记录 parallel for_each 真实行为。
- 更新 `.pi/skills/team-plan-creator/SKILL.md`，让用户可以自然语言创建 parallel for_each Plan。
- 更新 `docs/change-log.md`。

## 必须写清

- `forEach.mode` 支持 `"sequential" | "parallel"`。
- `parallel` 固定容量 3。
- `parallel` 是 worker-pool/semaphore，child 结束就补位，不是批处理。
- partial failure：至少一个 child succeeded 时 parent succeeded；全部 failed 才 failed；全部 skipped 时 skipped。
- `parallel + taskTemplate.decomposer` 创建时拒绝。
- skill 仍然只创建 TeamUnit/Plan，不启动 Run。

## 禁止做

- 不改 runtime 源码。
- 不改测试。
- 不改 Team UI。
- 不做整文件格式化或换行符转换。
- 不提交 `.env`、`.data`、runtime 产物、temp 文件、未知 `.pi/skills/*`、`skills-lock.json`。

## 当前未跟踪文件不要提交

- `.codex/plans/2026-05-20-handoff-team-router-next-session.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-5-docs-skill.md`
- `public/github-trending-report.html`
- `public/medtrum-view/`
- `public/ruflo-research-report.html`
- `runtime/agent-search/`
- `runtime/ruflo-research/`

## 验证

```powershell
Select-String -Path docs/team-runtime.md,.pi/skills/team-plan-creator/SKILL.md -Pattern "parallel|sequential|decomposer"
git diff --check -- docs/team-runtime.md docs/change-log.md .pi/skills/team-plan-creator/SKILL.md
```

## 提交

只提交一个 commit：

```text
docs(team): document parallel for_each planning
```

完成后按总计划文件里的 Delivery Report 简短汇报，并说明是否发生 EOL/formatter 变更。
