# Team for_each.parallel Step 4 Controls Follow-up Plan

## Goal

Fix the review failures in `278fb2b fix(team): align parallel for_each run controls`.

This is a narrow Step 4 follow-up. Do not start Step 5.

Current Step 4 is not acceptable because:

1. `npx tsc --noEmit` fails.
2. Parallel `pause -> resume -> completion` is not covered and likely broken by the new `interrupted` guard.
3. `test/team-parallel-foreach.test.ts` still has a flaky refill timing test; do not claim full verification without addressing or explicitly reporting it.

## Current Baseline

- Repository: `E:\AII\ugk-pi`
- Latest commit: `278fb2b fix(team): align parallel for_each run controls`
- Relevant previous commits:
  - `0089443 fix(team): drain parallel children on fatal errors`
  - `6164bc5 fix(team): propagate parallel state write failures`
  - `f4ae5e7 fix(team): harden parallel for_each state handling`
  - `4f39c26 feat(team): run parallel for_each children with fixed pool`

Reviewer verification:

- `node --test --import tsx test/team-orchestrator-controls.test.ts`: 37 pass / 0 fail
- `node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts`: 33 pass / 0 fail
- `node --test --import tsx test/team-parallel-foreach.test.ts`: failed once on `parallel for_each: refills pool when child completes, not batch`
- `npx tsc --noEmit`: failed
- `git diff --check HEAD^..HEAD`: clean

TypeScript errors to fix:

```text
test/team-orchestrator-controls.test.ts(1652,16): error TS18047: 'expansion2' is possibly 'null'.
test/team-orchestrator-controls.test.ts(1723,16): error TS18047: 'expansion2' is possibly 'null'.
```

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
- `.codex/plans/2026-05-20-team-for-each-parallel-step-4-controls.md`
- `src/team/orchestrator.ts`
- `test/team-orchestrator-controls.test.ts`
- `test/team-parallel-foreach.test.ts`

## Absolute Scope Boundary

Only fix Step 4 control behavior and verification failures.

Likely files to modify:

- `src/team/orchestrator.ts`
- `test/team-orchestrator-controls.test.ts`
- optional: `test/team-parallel-foreach.test.ts` only if you make the existing refill test non-flaky without weakening the behavior assertion

Do not modify:

- Team UI
- Team routes
- PlanStore schema
- docs / runtime skills
- model provider config
- web-access / http-access
- Step 5 docs/skill/final verification content
- scheduler/router/template design

## Problems To Fix

### 1. `tsc` is red

Fix the two nullable `expansion2` errors correctly.

Required:

- Add `assert.ok(expansion2, "...")` before reading `expansion2.children`.
- Do not silence TypeScript with unsafe casts unless a real assertion already proves non-null.
- Re-run `npx tsc --noEmit`.

### 2. Parallel pause -> resume is likely broken

Current code:

```ts
if (latestTask && (TERMINAL_TASK_STATUSES.has(latestTask.status) || latestTask.status === "interrupted")) {
  return;
}
```

This prevents stale child writes after pause, but it also blocks a resumed run from writing an interrupted child back to `running` / terminal states.

Why:

- `pauseRun` changes active parallel children from `running` to `interrupted`.
- `resumeRun` changes run status from `paused` to `queued`, but it does not reset interrupted child tasks to `pending`.
- On resume, `executeChildrenParallel` includes interrupted children in the queue because they are not terminal.
- `executeTask` tries to save the child as `running`, but the parallel `saveState` override sees latest child status is `interrupted` and returns without writing.
- The child can get stuck as `interrupted`.

Required behavior:

- While the run is paused/cancelled/non-running, stale child writes must not overwrite pause/cancel state.
- After resume and the run is running again, interrupted child tasks selected for execution must be allowed to transition to `running` and then terminal states.

Acceptable implementation options:

- Option A, preferred: in `resumeRun`, reset interrupted tasks that should execute on rerun/resume to `pending` before saving queued state. Be careful not to reset cancelled/skipped/succeeded/failed tasks.
- Option B: refine the parallel saveState override guard so it blocks interrupted overwrite only when `latest.status !== "running"` or when the incoming child state is an old stale write, but allows intentional `interrupted -> running` for the currently executing child after resume.

Pick the smallest safe implementation that passes real behavior tests. Do not simply delete all guards; pause/cancel stale-write protection must remain.

### 3. Missing real behavior test for parallel pause -> resume -> completion

Add a test in `test/team-orchestrator-controls.test.ts`.

Required test shape:

- Create a `for_each` plan with `mode: "parallel"` and at least 3-4 generated children.
- Start `runToCompletion`.
- Wait until at least one parallel child is active.
- Call `pauseRun`.
- Await the in-flight `runToCompletion` and assert run is `paused` and no task is `running`.
- Call `resumeRun`.
- Call `runToCompletion` again.
- Assert final run completes or completes_with_failures according to the test runner behavior.
- Assert previously interrupted child tasks are no longer `interrupted` and reach expected terminal status.
- Assert no child is left `running` or `pending`.
- Assert no duplicate expansion children are created.

Do not write a weak test that only checks `resumeRun` returns `queued`. That would miss the bug.

### 4. Existing parallel refill test is flaky

The reviewer saw:

```text
parallel for_each: refills pool when child completes, not batch
AssertionError: next should start before slow children finish
```

This may be an old timing-test flake, but Step 4 is touching parallel controls, so do not ignore it.

Required:

- Re-run `node --test --import tsx test/team-parallel-foreach.test.ts`.
- If it fails again, make the test less timing-fragile while preserving the behavior assertion.
- Prefer event/order instrumentation over absolute millisecond margins.
- Do not weaken it to “some parallelism happened”; it must still prove refill-on-completion, not batch execution.

## Tasks

### Task 1 - Fix TypeScript null errors

Patch `test/team-orchestrator-controls.test.ts`:

- Add `assert.ok(expansion2, "...")` before both `expansion2.children` reads.
- Run `npx tsc --noEmit`.

### Task 2 - Add parallel pause/resume real behavior test

Add the missing test described above.

The test should fail or expose the bug before implementation if possible.

### Task 3 - Fix interrupted child resume behavior

Implement the smallest safe runtime fix in `src/team/orchestrator.ts`.

Do not regress:

- pause keeps active children from being overwritten back to `running` by stale writes,
- cancel keeps unfinished children `cancelled`,
- rerun force_rerun/skip still works,
- fatal drain behavior from `0089443` still works.

### Task 4 - Stabilize or report refill test

Run `test/team-parallel-foreach.test.ts`.

If flaky:

- adjust the test using event order / start sequence instrumentation,
- keep the original behavioral purpose,
- do not change production code just to satisfy a timing artifact unless production behavior is actually wrong.

### Task 5 - Verification and commit

Run:

```powershell
node --test --import tsx test/team-orchestrator-controls.test.ts
node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts
node --test --import tsx test/team-parallel-foreach.test.ts
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
```

If all pass, optionally run:

```powershell
npm run test:team
```

Commit suggestion:

```text
fix(team): resume interrupted parallel children safely
```

One focused commit only.

## 禁止做

- 不进入 Step 5。
- 不改 Team UI。
- 不改 API routes。
- 不改 docs / product runtime skills。
- 不改 model provider / web-access / http-access。
- 不重写 parallel pool / scheduler。
- 不删除 pause/cancel stale-write protection。
- 不用 `as any` 或 unsafe casts 糊 TypeScript 错误。
- 不用 sleep 或 retry 掩盖并发测试问题。
- 不提交 `.env`、`.data`、runtime artifacts、public reports、temp files、未知 `.pi/skills/*`、`skills-lock.json`、`.codex/plans/*`。
- 不做整文件格式化或换行符转换；保持 touched files 既有 EOL/格式。

## Delivery Report Template

```text
完成 Team for_each.parallel Step 4 follow-up fix。

Commits:
- <hash> fix(team): resume interrupted parallel children safely

修复摘要:
- tsc: <说明 expansion null errors 如何修复>
- pause/resume: <说明 interrupted child 如何重新执行，同时 stale write guard 如何保留>
- refill test: <说明是否调整，如何证明 refill-on-completion>

新增/更新测试:
- <测试名/覆盖点>

验证:
- node --test --import tsx test/team-orchestrator-controls.test.ts: <结果>
- node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts: <结果>
- node --test --import tsx test/team-parallel-foreach.test.ts: <结果>
- npx tsc --noEmit: <结果>
- git diff --check: <结果>
- git diff --stat / --numstat: <是否有异常>
- npm run test:team: <如已运行，写结果；未运行则说明未运行>

未提交文件:
- 确认未提交 .env/.data/runtime/public reports/.codex/plans 等运行或计划产物

EOL/formatter:
- 是否发生格式化或换行符归一化；如无，写“没有”

阻塞/风险:
- <没有则写“无”>
```

## Reviewer Checklist

- `npx tsc --noEmit` is clean.
- Parallel pause stops active children and blocks stale writes.
- Parallel resume lets previously interrupted children execute to terminal status.
- Cancelled children are not overwritten by late child writes.
- Rerun `force_rerun` and `skip` for parallel children still work.
- `test/team-parallel-foreach.test.ts` passes without timing luck.
- No unrelated files or EOL/formatter churn.
