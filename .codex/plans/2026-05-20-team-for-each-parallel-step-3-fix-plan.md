# Team for_each.parallel Step 3 Fix Plan

## Goal

Fix the safety issues introduced by `4f39c26 feat(team): run parallel for_each children with fixed pool` before continuing to Step 4.

This is a narrow hardening pass for `for_each.mode = "parallel"` execution. Do not add new user-facing controls, docs, router behavior, or scheduler abstractions in this step.

## Current Baseline

- Repository: `E:\AII\ugk-pi`
- Latest commit: `4f39c26 feat(team): run parallel for_each children with fixed pool`
- Relevant previous commits:
  - `da304b2 fix(team): add safe team state patch helper`
  - `2008b7a feat(team): accept parallel for_each mode`
  - `c123fc7 feat(model): add ali codeplan provider`
- Known Step 3 verification before review:
  - `node --test --import tsx test/team-parallel-foreach.test.ts` passed
  - `node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts` passed
  - `npx tsc --noEmit` passed
  - `git diff --check da304b2..4f39c26` passed
- Review status: Step 3 is not acceptable yet. It has state-safety bugs that must be fixed before Step 4.

## Dirty / Untracked Files To Avoid

Do not commit or modify these unless explicitly instructed:

- `.codex/plans/*`
- `public/agent-search-report.html`
- `public/github-trending-report.html`
- `public/medtrum-view/`
- `public/ruflo-research-report.html`
- `runtime/agent-search/`
- `runtime/medtrum-news-2026/`
- `runtime/ruflo-research/`
- `.env`
- `.data/`
- runtime temp artifacts
- unknown `.pi/skills/*`
- `skills-lock.json`

## Must Read

- `AGENTS.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-3-worker-pool.md`
- `src/team/orchestrator.ts`
- `src/team/run-workspace.ts`
- `test/team-parallel-foreach.test.ts`
- `test/team-orchestrator-dynamic-expansion.test.ts`

## Absolute Scope Boundary

Only fix Step 3 parallel execution safety.

Likely files to modify:

- `src/team/orchestrator.ts`
- `src/team/run-workspace.ts`
- `test/team-parallel-foreach.test.ts`
- possibly a focused helper test file if the existing test file becomes too crowded

Do not continue to:

- Step 4 pause/resume/cancel UI or controls
- docs / skill updates
- team router / execution templates
- model provider changes
- web-access / http-access changes
- broad orchestrator refactors
- full DAG scheduler rewrite

## Problems To Fix

### 1. `saveState` override is not restored in `finally`

Current `executeChildrenParallel` mutates `this.workspace.saveState` and restores it only at the normal end of the `if (queue.length > 0)` block.

If `ws.getState`, `handleTimeout`, `Promise.race`, `patchState`, or any unexpected path throws, the override can remain installed and pollute later tasks/runs.

Required fix:

- Store the original method.
- Wrap the whole override lifetime in `try/finally`.
- Always restore the original method in `finally`.
- Add a regression test that fails before the fix.

### 2. Child scoped `saveState` override can swallow run-level state changes

Current override checks `parallelTaskId.getStore()` and, when set, writes only:

- `latest.taskStates[taskId] = s.taskStates[taskId]!`
- `latest.summary = computeTeamRunSummary(latest.taskStates)`

That is acceptable only for child task-state writes. It is unsafe for run-level writes such as timeout/fail/cancel paths, because `handleTimeout(current, plan)` can update run status, unfinished tasks, `lastError`, `finishedAt`, `updatedAt`, and related terminal metadata.

Required fix:

- Do not allow run-level terminal mutations to be narrowed to a single child task patch.
- Prefer the simplest safe design:
  - Keep child task execution writes scoped through `patchState`.
  - Run timeout / stopped / aborted checks outside the `parallelTaskId` AsyncLocalStorage scope, or handle timeout after leaving the child scope.
  - If a run-level terminal transition is needed, perform it with the original `saveState` or a dedicated safe `patchState` path that updates all intended run-level fields and affected tasks.
- Add a regression test for timeout in the parallel path:
  - A parallel run reaches timeout.
  - Final run status is terminal failed.
  - `lastError` / timeout summary is preserved.
  - Unfinished children are not left `running` as if the timeout write was swallowed.

### 3. `catch {}` silently hides unexpected child errors

Current `startChild` catches everything and does nothing. This can leave a child in `running` or `pending`, and the parent summary later sees `allDone = false` and silently returns without a clear failure.

Required fix:

- Replace silent `catch {}` with deterministic behavior.
- For unexpected child errors, mark that child `failed` with a useful `errorSummary` and failed progress.
- Keep the pool running for ordinary child failure so one bad branch does not kill the whole parallel group.
- Add a regression test:
  - one parallel child throws unexpectedly,
  - another child succeeds,
  - failed child becomes terminal `failed`,
  - successful child remains `succeeded`,
  - parent follows the agreed semantics: any succeeded child means parent `succeeded`,
  - no child is left `pending` or `running`.

### 4. `patchState.updatedAt` should be monotonic enough for same-millisecond writes

Carry-over from Step 2 review: `RunWorkspace.patchState` currently does:

```ts
if (state.updatedAt === before) {
  state.updatedAt = now();
}
```

If `now()` returns the same millisecond string, `updatedAt` may not advance.

Required fix:

- Ensure automatic `updatedAt` changes when the mutator did not manually change it.
- A small helper is fine, but keep it local and boring.
- Do not normalize all timestamps or rewrite existing state shape.
- Add a focused test if there is already a suitable `RunWorkspace` test surface. If no clean test surface exists, add the minimal test in the closest existing team workspace test file.

## Tasks

### Task 1 - Add failing tests for the three Step 3 bugs

Write tests before implementation where practical.

Required test coverage:

- `saveState` override restoration after an exception path in parallel execution.
- parallel timeout preserves run-level terminal state.
- unexpected child throw becomes deterministic child failure and does not leave dangling child statuses.
- `patchState.updatedAt` auto-bump advances when the mutator does not set it.

Testing guidance:

- Tests must verify real run state, not just function names or strings.
- Do not accept `running` as a terminal lifecycle result.
- Avoid broad `assert.ok(A || B || C)` unless the allowed states are explicitly part of the behavior under test.
- Prefer direct state assertions from `workspace.getState(runId)`.

Commit after this task only if tests fail for the expected reason and the repo convention allows red commits. If not, keep tests unstaged until Task 2 and make one fix commit.

### Task 2 - Harden `executeChildrenParallel`

Implement the smallest safe fix.

Requirements:

- Restore `this.workspace.saveState` in `finally`.
- Keep refill-on-completion fixed pool behavior with capacity `3`.
- Preserve parent semantics:
  - any child succeeded -> parent succeeded
  - all children skipped -> parent skipped
  - otherwise parent failed
- Preserve ordinary child failure isolation: a failed child should not automatically stop sibling branches.
- Do not introduce configurable max concurrency in this step.
- Do not rewrite the whole orchestrator.

### Task 3 - Fix `RunWorkspace.patchState` timestamp auto-update

Requirements:

- If the mutator leaves `updatedAt` unchanged, set it to a timestamp that is observably different from the previous value.
- If the mutator intentionally changes `updatedAt`, preserve the mutator value.
- Keep atomic tmp+rename write behavior.
- Do not route `patchState` through `saveState`, because that can deadlock under the write lock.

### Task 4 - Focused verification and commit

Run:

```powershell
node --test --import tsx test/team-parallel-foreach.test.ts
node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
```

If timeout/control behavior is touched beyond the narrow parallel path, also run the relevant team control tests.

Inspect diff size:

- If a small fix creates huge line changes, stop and check for EOL or formatter churn.
- Preserve existing line endings and formatting.
- Do not run broad formatters on unrelated files.

Commit suggestion:

```text
fix(team): harden parallel for_each state handling
```

## 禁止做

- 不进入 Step 4。
- 不改 Team UI。
- 不改 docs / runtime skill unless explicitly asked later.
- 不重写完整 scheduler / DAG executor。
- 不把 `parallel` 塞进 unrelated planning/router logic。
- 不新增用户可配的 parallel capacity。
- 不提交 `.env`、`.data`、runtime artifacts、public reports、temp files、未知 `.pi/skills/*`、`skills-lock.json`、`.codex/plans/*`。
- 不做整文件格式化或换行符转换。
- 不用大范围 formatter 制造无关 diff。

## Delivery Report Template

```text
完成 Team for_each.parallel Step 3 fix。

Commits:
- <hash> fix(team): harden parallel for_each state handling

修复摘要:
- saveState override: <说明 finally 恢复>
- run-level writes: <说明 timeout / terminal transition 不再被 child patch 吞掉>
- child unexpected error: <说明如何落为 child failed>
- patchState updatedAt: <说明同毫秒自动推进>

新增/更新测试:
- <测试名/覆盖点>

验证:
- node --test --import tsx test/team-parallel-foreach.test.ts: <结果>
- node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts: <结果>
- npx tsc --noEmit: <结果>
- git diff --check: <结果>
- git diff --stat / --numstat: <是否有异常>

未提交文件:
- 确认未提交 .env/.data/runtime/public reports/.codex/plans 等运行或计划产物

EOL/formatter:
- 是否发生格式化或换行符归一化；如无，写“没有”

阻塞/风险:
- <没有则写“无”>
```

## Reviewer Checklist

- `executeChildrenParallel` restores `saveState` in `finally`.
- No run-level terminal transition is narrowed to one child task update.
- Timeout in parallel path produces terminal run status and preserves `lastError` / unfinished task handling.
- Unexpected child exceptions never disappear into `catch {}`.
- Parent summary still uses agreed partial-success semantics.
- Fixed pool is still refill-on-completion, not batch execution.
- `RunWorkspace.patchState` does not call `saveState` under the write lock.
- `updatedAt` auto-bump is observably changed when mutator leaves it untouched.
- `git diff --stat` and `git diff --numstat` show no EOL/formatter churn.
