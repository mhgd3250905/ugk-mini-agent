# Step 2: extract child execution module

Date: 2026-05-21

## Goal

Extract the execution topology for expanded child tasks from `TeamOrchestrator` into a small internal Module. The new Module owns sequential/parallel child admission, pool refill, parent status aggregation, and child skip/retry behavior.

This is a refactor. Behavior must remain unchanged.

## Current baseline

- Start this step only after Step 1 is committed.
- Latest expected previous commit: `refactor(team): make parallel state writes explicit`
- Existing runtime behavior:
  - `for_each.sequential`: children execute in order.
  - `for_each.parallel`: fixed pool capacity 3, refill-on-completion, not batch mode.
  - Parent status:
    - any child succeeded -> parent succeeded
    - all children skipped -> parent skipped
    - otherwise parent failed
  - `force_rerun` and `skip` dispositions apply to generated children.

## Must-read files

- `AGENTS.md`
- `docs/team-runtime.md`
- `.codex/plans/2026-05-21-team-architecture-optimization-index.md`
- `.codex/plans/2026-05-21-team-arch-step-1-parallel-state-writer.md`
- `src/team/orchestrator.ts`
- `src/team/task-expansion-planner.ts`
- `src/team/run-workspace.ts`
- `test/team-parallel-foreach.test.ts`
- `test/team-orchestrator-dynamic-expansion.test.ts`
- `test/team-orchestrator-controls.test.ts`

## Scope boundary

Allowed files:

- `src/team/orchestrator.ts`
- new `src/team/*child*execution*.ts` or similarly clear internal module
- `test/team-parallel-foreach.test.ts`
- `test/team-orchestrator-dynamic-expansion.test.ts`
- `test/team-orchestrator-controls.test.ts`
- `docs/team-runtime.md`
- `docs/change-log.md`

## Forbidden

- Do not modify `TaskExpansionPlanner` behavior.
- Do not change expansion record format.
- Do not change child task ID format.
- Do not change parent aggregation semantics.
- Do not introduce a general DAG scheduler.
- Do not add configurable concurrency in this step.
- Do not touch UI.
- Do not touch agent role prompts.
- Do not do EOL/formatter churn.

## Module design constraints

The new Module must be deeper than its Interface:

- Interface should describe child execution in domain terms.
- Implementation may hide:
  - sequential loop
  - parallel pool active set
  - fatal drain
  - parent summary aggregation
  - stale write guard integration from Step 1

The Module must not expose internal pool arrays/maps to callers.

`TeamOrchestrator` should still own run-level lifecycle and task ordering. It should call the child execution Module when a parent task already has generated child tasks.

## Required tests before implementation

Add/keep tests for:

1. Sequential children still run in order.
2. Parallel children still refill as soon as capacity is available.
3. Parallel fatal child error drains active siblings before run failure.
4. Parent partial-success semantics remain unchanged.
5. Rerun uses existing expansion record and does not duplicate children.
6. Pause/cancel still prevents stale write-back and stops admitting new children.

Tests must verify real state and attempts, not just helper names.

## Implementation steps

1. Add focused tests if existing tests do not directly cover the required behaviors.
2. Create the new child execution Module with a narrow constructor/input.
3. Move child execution internals from:
   - `executeChildrenParallel`
   - child loop inside `executeExpandedChildren`
   - child skip handling if it belongs to topology
4. Keep `executeForEachTask` and decomposition flow behavior stable.
5. Keep `TeamOrchestrator` as the high-level coordinator.
6. Update docs to describe the internal child execution Module only if useful; do not over-document private code.
7. Add `docs/change-log.md` entry.

## Verification

```powershell
node --test --import tsx test/team-parallel-foreach.test.ts
node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts
node --test --import tsx test/team-orchestrator-controls.test.ts
npm run test:team
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
git ls-files --eol src/team/orchestrator.ts test/team-parallel-foreach.test.ts test/team-orchestrator-dynamic-expansion.test.ts test/team-orchestrator-controls.test.ts
```

## Commit message suggestion

```text
refactor(team): extract child task execution module
```

## Delivery report template

```text
完成 Step 2：child execution module 抽取。

Commit:
- <hash> refactor(team): extract child task execution module

实现摘要:
- <新 Module 文件/职责>
- <TeamOrchestrator 缩减了哪些 child execution 细节>
- <确认行为未变>

验证:
- node --test --import tsx test/team-parallel-foreach.test.ts: <结果>
- node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts: <结果>
- node --test --import tsx test/team-orchestrator-controls.test.ts: <结果>
- npm run test:team: <结果>
- npx tsc --noEmit: <结果>
- git diff --check: <结果>
- git diff --stat / --numstat reviewed: yes/no

EOL/formatter churn:
- <没有 / 如有说明>

未提交文件:
- <确认 runtime/public/.env/.data/旧计划未提交>

风险/阻塞:
- <无 / 说明>
```

## Sendable message

```text
请接手 E:\AII\ugk-pi 的 Team architecture Step 2：抽取 child execution module。

当前基线：
- 请确认 Step 1 已完成并提交：refactor(team): make parallel state writes explicit
- Step 1 未完成就不要开始本任务

必须先读：
- AGENTS.md
- docs/team-runtime.md
- .codex/plans/2026-05-21-team-architecture-optimization-index.md
- .codex/plans/2026-05-21-team-arch-step-2-child-execution-module.md
- src/team/orchestrator.ts
- src/team/task-expansion-planner.ts
- src/team/run-workspace.ts
- test/team-parallel-foreach.test.ts
- test/team-orchestrator-dynamic-expansion.test.ts
- test/team-orchestrator-controls.test.ts

本轮只做：
- 把 expanded child 的 sequential/parallel 执行拓扑从 TeamOrchestrator 抽成内部 Module
- 保持 for_each sequential/parallel 行为、parent aggregation、pause/cancel/rerun 语义不变
- 补真实行为测试

禁止做：
- 不改 TaskExpansionPlanner 行为
- 不改 expansion record 格式
- 不改 child task ID 格式
- 不引入 DAG scheduler
- 不做可配置 concurrency
- 不碰 UI / role prompts
- 不做整文件格式化或换行符转换
- 不提交 .env/.data/runtime/public 产物/temp 文件/未知 .pi/skills/*/skills-lock.json

执行要求：
- 先补测试，再写实现
- 本 Step 一个 commit
- 遇到计划外问题先停下说明
- 如果小改动产生超大 diff，先检查 EOL/formatter churn

最终验证：
- node --test --import tsx test/team-parallel-foreach.test.ts
- node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts
- node --test --import tsx test/team-orchestrator-controls.test.ts
- npm run test:team
- npx tsc --noEmit
- git diff --check
- git diff --stat / git diff --numstat

完成后按计划里的交付报告模板回复。
```
