# GLM Task: Team for_each.parallel Step 6 - Final verification

请接手 `E:\AII\ugk-pi` 的 Team `for_each.parallel` Step 6：最终验证和交付报告。

## 当前基线

- 必须基于 Step 1-5 已提交后的最新 HEAD。
- 总计划文件：`.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- 本步骤只做最终验证；除非验证失败需要最小修复，否则不改代码。

## 必须先读

- `AGENTS.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- `docs/team-runtime.md`
- `docs/change-log.md`

## 本轮只做

- 跑最终验证。
- 检查 diff/stat/numstat/EOL 风险。
- 如果发现失败，做最小修复并提交；如果没有失败，不新增无意义 commit。

## 最终验证

```powershell
npm run test:team
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
```

如果 diff 异常巨大，执行：

```powershell
git ls-files --eol src/team/types.ts src/team/plan-store.ts src/team/orchestrator.ts src/team/run-workspace.ts docs/team-runtime.md .pi/skills/team-plan-creator/SKILL.md
```

## 禁止做

- 不做新功能。
- 不做 broad formatter。
- 不提交 `.env`、`.data`、runtime 产物、temp 文件、未知 `.pi/skills/*`、`skills-lock.json`。

## 当前未跟踪文件不要提交

- `.codex/plans/2026-05-20-handoff-team-router-next-session.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-6-final-verify.md`
- `public/github-trending-report.html`
- `public/medtrum-view/`
- `public/ruflo-research-report.html`
- `runtime/agent-search/`
- `runtime/ruflo-research/`

## 完成报告格式

```text
完成 Team for_each.parallel v1。

Commits:
- <hash> <message>

实现摘要:
- Schema/validation:
- Runtime worker-pool:
- Parent partial-failure semantics:
- Pause/cancel/rerun:
- Docs/skill:

验证:
- npm run test:team: <result>
- npx tsc --noEmit: <result>
- git diff --check: <result>
- git diff --stat / --numstat reviewed: <yes/no>

未提交文件:
- <list remaining untracked runtime/report artifacts>

EOL/formatter:
- 是否发生机械格式化或换行符转换；如果没有，写“没有”。

阻塞/风险:
- <none or details>
```
