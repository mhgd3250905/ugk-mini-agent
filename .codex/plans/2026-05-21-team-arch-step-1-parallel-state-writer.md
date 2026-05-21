# Step 1: replace parallel saveState monkey-patch with explicit state writer

Date: 2026-05-21

## Goal

Make `for_each.parallel` state writes explicit and local. Remove the current runtime method override shape in `executeChildrenParallel`, where `this.workspace.saveState` is monkey-patched during active child execution.

This is a structural refactor only. Runtime behavior must remain identical:

- fixed parallel pool capacity remains 3
- parent partial-success semantics remain unchanged
- pause/cancel/resume/rerun behavior remains unchanged
- fatal drain behavior remains unchanged
- `patchState` monotonic `updatedAt` behavior remains unchanged

## Current baseline

- Latest commit: `961074d fix(team): preserve mindmap disposition scroll timing`
- Team parallel v1 is already complete and tested.
- Current risky shape:
  - `src/team/orchestrator.ts`
  - `executeChildrenParallel`
  - temporary override of `this.workspace.saveState`
  - `parallelTaskId` / `AsyncLocalStorage`
  - writes are redirected to `RunWorkspace.patchState`

## Must-read files

- `AGENTS.md`
- `docs/team-runtime.md`
- `.codex/plans/2026-05-21-team-architecture-optimization-index.md`
- `src/team/orchestrator.ts`
- `src/team/run-workspace.ts`
- `test/team-parallel-foreach.test.ts`
- `test/team-orchestrator-controls.test.ts`
- `test/team-orchestrator-dynamic-expansion.test.ts`

## Scope boundary

Only change the internal state-write plumbing used by parallel child execution.

Allowed files:

- `src/team/orchestrator.ts`
- optional new file under `src/team/`, only if it keeps the Interface small and is clearly named
- `test/team-parallel-foreach.test.ts`
- `test/team-orchestrator-controls.test.ts`
- `test/team-orchestrator-dynamic-expansion.test.ts`
- `docs/team-runtime.md`
- `docs/change-log.md`

## Forbidden

- Do not change Plan schema.
- Do not change `forEach.mode` semantics.
- Do not change parallel capacity.
- Do not change parent aggregation rules.
- Do not touch Team UI.
- Do not rewrite `RunWorkspace`.
- Do not broaden into Step 2 child execution extraction.
- Do not commit runtime/public artifacts or old untracked plans.
- Do not do whole-file formatting or EOL normalization.

## Implementation guidance

The current code mutates a shared dependency method:

```ts
const origSave = this.workspace.saveState.bind(this.workspace);
this.workspace.saveState = async function(s: TeamRunState) { ... };
...
this.workspace.saveState = origSave;
```

Replace this with an explicit writer seam. Keep it boring.

Acceptable shape:

- Add a small internal type such as `TeamStateWriter`:
  - `saveState(state: TeamRunState): Promise<void>`
  - `patchState(runId: string, mutator: (state: TeamRunState) => void | Promise<void>): Promise<TeamRunState>`
- Add a helper that creates a child-scoped writer for a specific `taskId`.
- Make task execution accept the writer only where needed, or pass a narrow execution context through the parallel child path.
- Sequential execution should continue using normal workspace writes.

Do not invent a full event-sourced store, transaction framework, or scheduler. This step is not that. If the refactor grows beyond a narrow state writer seam, stop.

## Required tests before implementation

Add or strengthen tests that prove real behavior, not function names:

1. Parallel child success still writes only its own task state when siblings are active.
2. Unexpected child throw still becomes deterministic child failure and does not stop siblings.
3. Fatal `patchState` failure still fails the run and restores normal full-state writes afterward.
4. Timeout terminal state is still preserved and not narrowed to a child task.
5. Pause/cancel stale writes cannot move interrupted/cancelled child tasks back to running.

Prefer extending existing tests in:

- `test/team-parallel-foreach.test.ts`
- `test/team-orchestrator-controls.test.ts`

Weak tests are banned:

- do not only assert that a helper exists
- do not accept `running` in terminal lifecycle assertions
- do not use broad `assert.ok(A || B || C)` unless the test explains why

## Implementation steps

1. Add tests that lock the existing parallel behavior listed above.
2. Introduce the smallest explicit state writer/context needed by parallel child execution.
3. Update `executeChildrenParallel` to use that writer/context.
4. Delete the `this.workspace.saveState = ...` override and restore block.
5. Keep `RunWorkspace.patchState` unchanged unless a tiny typing change is unavoidable.
6. Update `docs/team-runtime.md` wording if it currently describes the old monkey-patch implementation.
7. Add a short `docs/change-log.md` entry.

## Verification

Run focused tests:

```powershell
node --test --import tsx test/team-parallel-foreach.test.ts
node --test --import tsx test/team-orchestrator-controls.test.ts
node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts
```

Then run:

```powershell
npm run test:team
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
git ls-files --eol src/team/orchestrator.ts test/team-parallel-foreach.test.ts test/team-orchestrator-controls.test.ts test/team-orchestrator-dynamic-expansion.test.ts
```

## Commit message suggestion

```text
refactor(team): make parallel state writes explicit
```

## Delivery report template

```text
完成 Step 1：parallel state writer 显式化。

Commit:
- <hash> refactor(team): make parallel state writes explicit

实现摘要:
- <说明新 state writer/context 形状>
- <确认已删除 saveState monkey-patch>
- <确认 parallel 行为未变>

验证:
- node --test --import tsx test/team-parallel-foreach.test.ts: <结果>
- node --test --import tsx test/team-orchestrator-controls.test.ts: <结果>
- node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts: <结果>
- npm run test:team: <结果>
- npx tsc --noEmit: <结果>
- git diff --check: <结果>
- git diff --stat / --numstat reviewed: yes/no

EOL/formatter churn:
- <没有 / 如有说明并确认是必要的>

未提交文件:
- <确认 .env/.data/runtime/public reports/.codex old plans 未提交>

风险/阻塞:
- <无 / 说明>
```

## Sendable message

```text
请接手 E:\AII\ugk-pi 的 Team architecture Step 1：parallel state writer 显式化。

当前基线：
- 最新 commit: 961074d fix(team): preserve mindmap disposition scroll timing
- 已完成：Team for_each.parallel v1、rerun disposition cleanup、Team ID copy、mindmap disposition scroll timing backup
- 当前验证：npm run test:team 806 pass / 0 fail / 2 skip；npx tsc --noEmit clean

必须先读：
- AGENTS.md
- docs/team-runtime.md
- .codex/plans/2026-05-21-team-architecture-optimization-index.md
- .codex/plans/2026-05-21-team-arch-step-1-parallel-state-writer.md
- src/team/orchestrator.ts
- src/team/run-workspace.ts
- test/team-parallel-foreach.test.ts
- test/team-orchestrator-controls.test.ts
- test/team-orchestrator-dynamic-expansion.test.ts

严格按计划文件执行：
- .codex/plans/2026-05-21-team-arch-step-1-parallel-state-writer.md

本轮只做：
- 删除 executeChildrenParallel 中的 saveState monkey-patch 形状
- 改成显式 state writer/context
- 保持 parallel pool、pause/cancel/resume/rerun、fatal drain、parent aggregation 语义不变
- 补真实行为回归测试

禁止做：
- 不改 Plan schema
- 不改 forEach.mode 语义
- 不改 parallel capacity
- 不碰 Team UI
- 不拆 RunWorkspace
- 不做 Step 2 child execution module
- 不做整文件格式化或换行符转换；保持 touched files 的既有 EOL/格式
- 不提交 .env/.data/runtime/public 产物/temp 文件/未知 .pi/skills/*/skills-lock.json

执行要求：
- 先补测试，再写实现
- 本 Step 一个 commit
- 遇到计划外问题先停下说明，不要顺手扩范围
- 如果小改动产生超大 diff，先检查是否为 EOL/formatter churn，修正后再继续

最终验证：
- node --test --import tsx test/team-parallel-foreach.test.ts
- node --test --import tsx test/team-orchestrator-controls.test.ts
- node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts
- npm run test:team
- npx tsc --noEmit
- git diff --check
- git diff --stat / git diff --numstat

完成后按计划里的交付报告模板回复。
```
