# Team for_each.parallel Step 3 Fatal Drain Plan

## Goal

Fix the remaining fatal-error drain bug introduced by `6164bc5 fix(team): propagate parallel state write failures`.

This is still Step 3 cleanup. Do not start Step 4.

The bug is concrete and reproduced locally: when one active child rejects fatally, `Promise.race(active)` exits immediately, `executeChildrenParallel` restores the `saveState` override, but other already-started children can still be running and writing files/state. On Windows this showed up as `ENOTEMPTY` during test cleanup because background async work was still touching the run directory.

## Current Baseline

- Repository: `E:\AII\ugk-pi`
- Latest commit: `6164bc5 fix(team): propagate parallel state write failures`
- Previous commits:
  - `f4ae5e7 fix(team): harden parallel for_each state handling`
  - `4f39c26 feat(team): run parallel for_each children with fixed pool`
- Current reviewer verification:
  - `node --test --import tsx test/team-parallel-foreach.test.ts`: **failed**, 10 pass / 1 fail
  - Failing test: `parallel for_each: fatal state-write failure restores saveState and fails run`
  - Error: `ENOTEMPTY: directory not empty, rmdir ...\runs\run_*`
  - `node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts`: 33 pass
  - `npx tsc --noEmit`: clean
  - `git diff --check 6164bc5^..6164bc5`: clean

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
- `.codex/plans/2026-05-20-team-for-each-parallel-step-3-fix-followup-plan.md`
- `src/team/orchestrator.ts`
- `test/team-parallel-foreach.test.ts`

## Absolute Scope Boundary

Only fix fatal-error draining in `executeChildrenParallel` and adjust the failing regression test if needed.

Likely files to modify:

- `src/team/orchestrator.ts`
- `test/team-parallel-foreach.test.ts`

Do not modify:

- Team UI
- Team routes
- PlanStore schema
- docs / skills
- model provider config
- web-access / http-access
- Step 4 pause/resume/cancel controls
- scheduler/router/template design

## Bug To Fix

Current pattern:

```ts
while (active.size > 0) {
  await Promise.race(active);
  // refill...
}
```

After `6164bc5`, a fatal child error now rejects. That is correct. But `Promise.race(active)` throws immediately and exits the function while sibling promises in `active` may still be running.

That causes two problems:

1. The `finally` restores `workspace.saveState` before sibling children stop writing.
2. Tests and callers can proceed while background child tasks still own file handles or write state.

Required behavior:

- On the first fatal rejection from an active child:
  - stop refilling new children,
  - remember the fatal error,
  - wait for all currently active child promises to settle,
  - keep the `saveState` override installed until those active children have settled,
  - then leave the `try/finally`, restore original `saveState`, and rethrow the remembered fatal error so existing `runToCompletion` / `failRun` handles the run.
- Ordinary child business failures that are successfully recorded as child `failed` must still not stop sibling branches.
- Timeout handling must still produce terminal timeout run state and not leave children `running/pending`.

Do not solve this by sleeping in tests. Do not make cleanup retries hide the issue. This is a runtime lifecycle bug, not a flaky test.

## Implementation Guidance

Use the smallest clear control flow. A reasonable shape:

```ts
let fatalError: unknown = null;

const waitForActiveToDrain = async () => {
  const results = await Promise.allSettled(Array.from(active));
  fatalError ??= results.find(r => r.status === "rejected")?.reason;
};

while (active.size > 0) {
  try {
    await Promise.race(active);
  } catch (err) {
    fatalError = err;
    break;
  }
  if (fatalError) break;
  // refill only when no fatal error
}

if (fatalError) {
  await waitForActiveToDrain();
  throw fatalError;
}
```

Adjust as needed for TypeScript and local style, but preserve the semantics:

- no refill after fatal,
- drain active before restoring `saveState`,
- rethrow after drain.

Be careful with the `finally` on each child promise:

```ts
const p = startChild(child).finally(() => { active.delete(p); });
```

If you call `Promise.allSettled(Array.from(active))`, make sure it captures the promises that are active at that moment. Do not iterate a mutating set in a way that misses running promises.

## Tests To Write / Fix

### Task 1 - Make the existing fatal test reliably expose the drain behavior

The test `parallel for_each: fatal state-write failure restores saveState and fails run` currently fails locally with `ENOTEMPTY`.

Keep the test meaningful:

- It should not use arbitrary sleeps to paper over background work.
- It should prove `runToCompletion` returns only after active child work has settled.
- It should prove later normal full-state `workspace.saveState` works after the fatal path.

Suggested strengthening:

- Make the non-failing sibling child slow enough that it is definitely still active when the fatal child rejects.
- Track runner active worker count or end markers after `runToCompletion`.
- Assert there are no active workers after `runToCompletion` returns.
- Then perform the full-state `saveState` verification.
- Then cleanup should succeed without retry hacks.

### Task 2 - Fix `executeChildrenParallel` fatal drain

Change only the parallel pool control flow.

Requirements:

- Fatal rejection stops refill.
- Active child promises are drained before leaving the override scope.
- Original `saveState` is restored exactly once in `finally`.
- The remembered fatal error is rethrown after drain.
- Parent summary patch should not run after a fatal error; the outer run failure path should own the terminal run result.

### Task 3 - Focused verification and commit

Run:

```powershell
node --test --import tsx test/team-parallel-foreach.test.ts
node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
```

If `test/team-parallel-foreach.test.ts` fails with `ENOTEMPTY`, the bug is not fixed.

If you touch anything beyond `src/team/orchestrator.ts` and `test/team-parallel-foreach.test.ts`, stop and explain why before committing.

Commit suggestion:

```text
fix(team): drain parallel children on fatal errors
```

One focused commit only.

## 禁止做

- 不进入 Step 4。
- 不改 pause/resume/cancel。
- 不改 Team UI。
- 不改 API routes。
- 不改 docs / product runtime skills。
- 不改 model provider / web-access / http-access。
- 不重写 parallel pool into a DAG scheduler。
- 不新增并发配置。
- 不用 sleep / cleanup retry 掩盖后台任务未收束。
- 不提交 `.env`、`.data`、runtime artifacts、public reports、temp files、未知 `.pi/skills/*`、`skills-lock.json`、`.codex/plans/*`。
- 不做整文件格式化或换行符转换；保持 touched files 既有 EOL/格式。

## Delivery Report Template

```text
完成 Team for_each.parallel Step 3 fatal drain fix。

Commits:
- <hash> fix(team): drain parallel children on fatal errors

修复摘要:
- fatal drain: <说明 fatal 后如何 stop refill + drain active + rethrow>
- saveState override lifetime: <说明 active child settle 前 override 仍保持，之后 finally 恢复>
- test hardening: <说明如何证明没有后台 child 残留>

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

- Fatal child rejection no longer exits the pool while siblings are still running.
- No refill happens after fatal error is recorded.
- All already-active promises settle before `workspace.saveState` override is restored.
- Fatal error is rethrown after drain so `failRun` owns terminal run state.
- Existing ordinary child throw test still passes and preserves partial-success semantics.
- Timeout test still passes and no children remain `running/pending`.
- The fatal regression test passes without cleanup retry or arbitrary sleep.
- `git diff --stat` and `git diff --numstat` show no EOL/formatter churn.
