# Team for_each.parallel Step 3 Fix Follow-up Plan

## Goal

Fix the remaining review findings in `f4ae5e7 fix(team): harden parallel for_each state handling`.

This is not Step 4. This is a small follow-up to make Step 3 acceptable.

## Current Baseline

- Repository: `E:\AII\ugk-pi`
- Latest commit: `f4ae5e7 fix(team): harden parallel for_each state handling`
- Previous Step 3 commit: `4f39c26 feat(team): run parallel for_each children with fixed pool`
- Review result: Step 3 fix is close, but not accepted yet.
- Current verification already rerun by reviewer:
  - `node --test --import tsx test/team-parallel-foreach.test.ts`: 10 pass / 0 fail
  - `node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts`: 33 pass / 0 fail
  - `npx tsc --noEmit`: clean
  - `git diff --check f4ae5e7^..f4ae5e7`: clean
  - `npm run test:team`: 776 pass / 0 fail / 2 skip

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
- `.codex/plans/2026-05-20-team-for-each-parallel-step-3-fix-plan.md`
- `src/team/orchestrator.ts`
- `test/team-parallel-foreach.test.ts`
- `test/team-orchestrator-dynamic-expansion.test.ts`

## Absolute Scope Boundary

Only fix the two remaining Step 3 review findings:

1. Fatal state-write errors inside parallel child error handling must not be swallowed.
2. Add a regression test that proves the temporary `workspace.saveState` override is restored on an exception path.

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

## Problems To Fix

### 1. `patchState` failure is still silently swallowed

Current code around `src/team/orchestrator.ts` catches a child execution error and then tries to mark the child failed:

```ts
try {
  await ws.patchState(...)
} catch {
  // Best-effort: if patchState also fails, child may remain non-terminal
}
```

This is not acceptable. A business child error can be converted into a failed child, but failure to persist that conversion is an infrastructure/state error. It must not disappear.

Required behavior:

- If child execution throws, attempt to mark that child failed.
- If marking the child failed succeeds, the pool continues and siblings can continue.
- If marking the child failed fails, the error must propagate out of `startChild`.
- `launch` may use `finally` to remove the promise from `active`, but must not swallow the rejection.
- The outer orchestrator should then fail the run through the existing `runToCompletion` / `failRun` path.
- `workspace.saveState` must still be restored via the existing `finally`.

Important distinction:

- Ordinary worker/checker/watcher child failure: isolate to that child.
- State persistence failure while recording that outcome: fail the run. Do not pretend the child was handled.

### 2. Missing direct test for `saveState` override restoration

`f4ae5e7` added `try/finally`, but did not add a regression test that forces an exception while the override is installed and verifies the original behavior is restored.

Required test:

- Create a parallel for_each run.
- Force the parallel execution path to throw after `workspace.saveState` has been overridden.
- Verify the run becomes failed or otherwise reaches the existing run failure path.
- Then verify `workspace.saveState` is usable in its normal full-state form after the failed run.
- The assertion must prove that a later normal `workspace.saveState(state)` is not still narrowed by `parallelTaskId`.

Suggested ways to force the exception:

- Monkey-patch `workspace.patchState` to throw only when recording the failed child state, while preserving normal `saveState`.
- Or use another narrow test double that causes the fatal state-write path in `startChild` to reject.

The test must not rely only on checking method identity if that is brittle. Prefer verifying real behavior:

- After the failed run, mutate a run-level field such as `lastError`, `status`, or a second task state using `workspace.saveState`.
- Reload state from disk.
- Confirm the full-state write persisted as expected.

## Tasks

### Task 1 - Add failing regression test

Add a focused test in `test/team-parallel-foreach.test.ts`.

Test name suggestion:

```ts
test("parallel for_each: fatal child failure restores saveState override and fails run", async () => {
  // ...
});
```

The test should fail against `f4ae5e7` or at least prove the currently missing behavior.

Do not add broad or weak assertions like:

- `assert.ok(A || B || C)` for terminal state unless each allowed state is explicitly justified.
- accepting `running` or `pending` as a valid terminal outcome.
- checking only that a string exists.

### Task 2 - Stop swallowing fatal state-write errors

Update `src/team/orchestrator.ts` minimally:

- Remove the inner `catch {}` around the `ws.patchState` call that records unexpected child failure.
- Let `patchState` rejection propagate out of `startChild`.
- Change `launch` from `.then(success, failure)` swallowing rejection to a pattern that removes the promise from `active` without hiding the rejection, for example:

```ts
const p = startChild(child).finally(() => {
  active.delete(p);
});
active.add(p);
```

Use the project's existing style. Do not refactor unrelated pool logic.

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

If anything outside the narrow files is touched, stop and explain why before committing.

Commit suggestion:

```text
fix(team): propagate parallel state write failures
```

One focused commit only.

## 禁止做

- 不进入 Step 4。
- 不改 pause/resume/cancel。
- 不改 Team UI。
- 不改 API routes。
- 不改 docs / product runtime skills。
- 不改 model provider / web-access / http-access。
- 不重写 parallel pool。
- 不新增并发配置。
- 不提交 `.env`、`.data`、runtime artifacts、public reports、temp files、未知 `.pi/skills/*`、`skills-lock.json`、`.codex/plans/*`。
- 不做整文件格式化或换行符转换；保持 touched files 既有 EOL/格式。

## Delivery Report Template

```text
完成 Team for_each.parallel Step 3 follow-up fix。

Commits:
- <hash> fix(team): propagate parallel state write failures

修复摘要:
- fatal state-write errors: <说明 patchState 失败如何冒泡>
- saveState override restoration: <说明异常路径如何验证恢复>

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

- No `catch {}` remains in the fatal state-write path.
- Child business errors still become deterministic child failures.
- `patchState` failure while recording a child error propagates and fails the run.
- `launch` removes promises from `active` without swallowing rejection.
- `workspace.saveState` override is restored on the fatal exception path.
- A real behavior test proves later full-state `saveState` is not narrowed after failure.
- Existing timeout and partial-success tests still pass.
- Diff is limited to the expected files and has no EOL/formatter churn.
