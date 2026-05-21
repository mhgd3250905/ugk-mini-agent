# GLM Task: Team rerun force_rerun autoclear and disposition scroll preservation

Date: 2026-05-21

## Goal

Fix two Team Runtime usability issues around terminal run manual task controls:

1. After a terminal run is rerun, any task marked `force_rerun` that successfully finishes in that rerun should automatically clear its force-rerun marker. Otherwise users get trapped in a stupid loop where a successfully repaired task keeps rerunning every later rerun.
2. When users click task disposition controls in the run mindmap/detail view (`跳过` / `强制重跑` / `恢复默认`), the page must preserve the current scroll position and stay near the operated task instead of jumping back to the top of the run detail.

This is a focused behavior/UX fix. Do not redesign Team Runtime, rerun semantics, or the Team page.

## Current baseline

- Repo: `E:\AII\ugk-pi`
- Latest commit: `b545d98 docs(team): clarify parallel decomposer policy`
- Team `for_each.parallel` v1 is complete.
- Recent known verification:
  - `npm run test:team` -> `782 pass / 0 fail / 2 skipped`
  - `npx tsc --noEmit` -> clean
- Current relevant behavior:
  - `src/team/orchestrator.ts`
    - `shouldExecuteOnRerun(ts)` returns true for `manualDisposition === "force_rerun"`.
    - `rerunRun(runId)` resets forced tasks to `pending`.
    - successful forced tasks are not automatically reset to default after the rerun succeeds.
  - `src/ui/team-page.ts`
    - `setTaskDisposition(runId, taskId, disposition, sourceEl)` PATCHes the disposition.
    - Then it does `dEl.style.display = 'none'; toggleRunDetail(runId, dEl);`.
    - That reloads the entire run detail and can jump the viewport back to the top, which is painful when users need to mark many tasks in sequence.

## Must-read files

- `AGENTS.md`
- `.codex/plans/2026-05-20-handoff-team-router-next-session.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `src/team/types.ts`
- `src/team/orchestrator.ts`
- `src/team/routes.ts`
- `src/team/run-workspace.ts`
- `src/team/progress.ts`
- `src/ui/team-page.ts`
- `src/ui/team-page-helpers.ts`
- `test/team-orchestrator-controls.test.ts`
- `test/team-routes.test.ts`
- `test/team-page-ui.test.ts`

## Dirty / untracked files that must not be committed

Do not add or commit these unless the user explicitly asks:

- `.codex/plans/2026-05-20-handoff-team-router-next-session.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-1-schema.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-2-state-patch.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-3-drain-fatal-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-3-fix-followup-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-3-fix-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-3-worker-pool.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-4-controls-followup-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-4-controls.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-5-docs-skill.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-6-final-verify.md`
- `public/agent-search-report.html`
- `public/github-trending-report.html`
- `public/medtrum-view/`
- `public/ruflo-research-report.html`
- `runtime/agent-search/`
- `runtime/medtrum-news-2026/`
- `runtime/ruflo-research/`

## Absolute scope boundary

Allowed changes:

- `src/team/orchestrator.ts`
- `src/ui/team-page.ts`
- `docs/team-runtime.md`
- `docs/change-log.md`
- Focused tests in:
  - `test/team-orchestrator-controls.test.ts`
  - `test/team-page-ui.test.ts`
  - optionally `test/team-routes.test.ts` only if API response shape needs coverage

Forbidden work:

- Do not change `for_each.parallel` worker-pool behavior.
- Do not change `skip` disposition semantics.
- Do not clear `force_rerun` before the task actually succeeds.
- Do not clear `force_rerun` for tasks that fail, are cancelled, are interrupted, remain pending/running, or are skipped.
- Do not add new disposition values.
- Do not change API route paths or request bodies.
- Do not redesign the Team page.
- Do not start Chrome.
- Do not restart services unless the user explicitly asks.
- Do not touch `.data`, `.env`, runtime artifacts, reports, unknown `.pi/skills/*`, or `skills-lock.json`.
- Do not run broad formatters or make EOL-only changes.

## Behavior contract

### Auto-clear `force_rerun`

When a user marks one or more tasks as `force_rerun`, then reruns a terminal run:

- At rerun start:
  - `force_rerun` still means execute regardless of previous status.
  - Existing rerun reset behavior remains.
- During/after rerun:
  - If a task with `manualDisposition === "force_rerun"` reaches `status === "succeeded"`, clear the marker back to default.
  - Clearing means no longer showing “已设强制重跑” and no longer causing the task to rerun on the next rerun.
  - Prefer setting `manualDisposition = "default"` and updating `manualDispositionUpdatedAt`, because existing UI/API already treats explicit default as cleared. If the existing local style prefers deleting optional default fields, explain and test it. Do not leave `force_rerun`.
- Do not clear:
  - `manualDisposition === "skip"` tasks.
  - forced tasks that end as `failed`, `cancelled`, `interrupted`, `pending`, `running`, or `skipped`.
- Apply this to:
  - normal plan tasks,
  - generated `for_each` children,
  - decomposed children,
  - parent/container tasks if they were explicitly marked `force_rerun` and end as `succeeded`.
- This must work whether the overall run ends `completed`, `completed_with_failures`, or `failed` due to other tasks/finalizer. The criterion is the individual task result, not only the overall run status.

### Preserve scroll / position after disposition click

When a terminal run detail is open and the user clicks a disposition button:

- PATCH disposition as today.
- Refresh the visible run detail so the badge/button state updates.
- Preserve the user's viewport position, or better, keep the operated task near the same screen position.
- Do not collapse the run detail.
- Do not switch between mindmap/detail view.
- Do not force the browser to the top of the run card.
- The fix must apply to both:
  - mindmap disposition buttons,
  - table/detail disposition buttons.

Implementation preference:

- Avoid the current pattern:

```js
dEl.style.display = 'none';
toggleRunDetail(runId, dEl);
```

That toggles/collapses/reloads and is the likely top-jump cause. Create a small in-place refresh helper or update the existing flow so it reloads `renderRunDetailShell(...)` without flipping display state.

Recommended UI approach:

1. Before refresh, capture:
   - `window.scrollX`
   - `window.scrollY`
   - optionally the clicked button/task node bounding rect relative to viewport
2. Refresh `detailEl.innerHTML` in place.
3. Restore scroll after DOM update using `requestAnimationFrame(...)`.
4. If adding stable anchors is simple, add `data-task-id="<escaped task id>"` to task nodes/rows and restore by keeping that element at the same viewport offset. If that makes the patch too large, simple scroll preservation is acceptable for v1.

## Task 1 - Backend tests for force_rerun autoclear

Commit suggestion: `test(team): cover force rerun disposition autoclear`

Write tests first in `test/team-orchestrator-controls.test.ts`.

Required tests:

1. Normal task:
   - Create a run with two tasks.
   - First run completes.
   - Set `task_2.manualDisposition = "force_rerun"`.
   - Rerun and execute.
   - Assert `task_2.status === "succeeded"`.
   - Assert `task_2.manualDisposition` is no longer `"force_rerun"`; explicit `"default"` or `undefined` is acceptable only if the implementation is consistent.
   - Rerun again.
   - Assert `task_2` is not executed again when it is already succeeded/default.

2. Failed forced task:
   - Mark a task `force_rerun`.
   - Make the rerun fail that task.
   - Assert `manualDisposition === "force_rerun"` remains so the user can rerun the failed branch again.

3. Generated child task:
   - Use an existing `for_each` rerun fixture if available.
   - Mark a generated child `force_rerun`.
   - Rerun and let that child succeed.
   - Assert the generated child marker is cleared and expansion is not duplicated.

Test quality rules:

- Do not use broad `assert.ok(A || B || C)` unless checking the explicit cleared representation.
- Do not accept `running` / `pending` as terminal.
- Verify actual persisted state from `workspace.getState(...)`, not only an in-memory object.

Focused verification:

```powershell
node --test --import tsx test/team-orchestrator-controls.test.ts
git diff --check -- test/team-orchestrator-controls.test.ts
```

## Task 2 - Backend implementation for force_rerun autoclear

Commit suggestion: `fix(team): clear successful force rerun markers`

Implementation guidance:

- Add a small helper in `src/team/orchestrator.ts`, for example:

```ts
function clearSuccessfulForceRerunDispositions(state: TeamRunState): boolean
```

or a private method on `TeamOrchestrator`.

- Helper behavior:
  - Iterate `state.taskStates`.
  - If `ts.manualDisposition === "force_rerun"` and `ts.status === "succeeded"`, set it to default/cleared and update `manualDispositionUpdatedAt`.
  - Return whether anything changed.
- Call the helper at the end of run execution after task statuses have settled and before returning/persisting final state.
- Also cover failure paths where some tasks succeeded but the overall run becomes `failed` due to another task or finalizer. A successful forced task should still be cleared.
- Do not clear markers in `rerunRun(...)` before execution; that would break the whole feature.
- Do not change `shouldExecuteOnRerun(...)`.
- Do not mutate summary counts while clearing disposition; manual disposition is not a status.

Likely places to inspect:

- `runToCompletion(...)` normal return path.
- `failRun(...)` and timeout/cancel paths if they can leave successful forced tasks behind.
- Any existing terminal-state save logic.

Focused verification:

```powershell
node --test --import tsx test/team-orchestrator-controls.test.ts
npx tsc --noEmit
git diff --check -- src/team/orchestrator.ts test/team-orchestrator-controls.test.ts
```

## Task 3 - UI tests and implementation for scroll-preserving disposition refresh

Commit suggestion: `fix(team): preserve run detail position after disposition changes`

Write tests first in `test/team-page-ui.test.ts`.

Because this test file mostly does static/inline-script behavior checks, acceptable focused tests are:

1. Assert `setTaskDisposition(...)` no longer hides/collapses the detail before reloading:
   - It must not contain the old pattern `dEl.style.display = 'none'; toggleRunDetail(runId, dEl);`.
2. Assert `setTaskDisposition(...)` captures and restores scroll:
   - Look for `window.scrollY` / `window.scrollX` capture.
   - Look for `window.scrollTo(...)`.
   - Look for `requestAnimationFrame(...)` or an equivalent delayed restore after DOM update.
3. Assert the refresh is in-place:
   - It should call a helper that updates `detailEl.innerHTML = renderRunDetailShell(...)` while leaving the detail displayed.
   - It should preserve `getRunDetailView(runId)` state.

Implementation guidance in `src/ui/team-page.ts`:

- Add a helper near `toggleRunDetail(...)`, for example:

```js
async function refreshRunDetailInPlace(runId, sourceEl) { ... }
```

- Reuse the same data-loading logic as `toggleRunDetail(...)` as much as practical.
  - Keep patch small. If duplication becomes ugly, extract a small shared loader for state/plan/attempts.
  - Do not rewrite the whole Team page script.
- Update `setTaskDisposition(...)`:
  - On success, refresh detail in place.
  - Preserve viewport position before/after refresh.
  - Do not collapse the detail.
  - Keep `showSuccess('已更新任务标记')`.
- Ensure both mindmap and table buttons still pass `sourceEl` and work.

Do not overfit the test to every line of implementation, but do protect against the exact regression: no collapse/top jump after clicking disposition.

Focused verification:

```powershell
node --test --import tsx --test-name-pattern "disposition|mindmap|scroll|setTaskDisposition" test/team-page-ui.test.ts
git diff --check -- src/ui/team-page.ts test/team-page-ui.test.ts
```

If `src/ui/team-page.ts` diff becomes suspiciously huge, stop and inspect EOL:

```powershell
git ls-files --eol src/ui/team-page.ts test/team-page-ui.test.ts
git diff --numstat -- src/ui/team-page.ts test/team-page-ui.test.ts
```

## Task 4 - Docs and change log

Commit suggestion: `docs(team): document rerun disposition cleanup`

Update only if implementation is complete:

- `docs/team-runtime.md`
  - In Manual Disposition / Rerun section, document:
    - `force_rerun` executes on rerun.
    - Once a forced task succeeds in that rerun, the marker is cleared back to default.
    - Failed forced tasks keep the marker.
    - `skip` is not auto-cleared.
- `docs/change-log.md`
  - Add a dated entry for this UX/semantics fix.
  - Include affected files and verification commands.

Focused verification:

```powershell
Select-String -Path docs/team-runtime.md,docs/change-log.md -Pattern "force_rerun|强制重跑|manualDisposition|scroll|滚动"
git diff --check -- docs/team-runtime.md docs/change-log.md
```

## Task 5 - Final verification and delivery

Commit suggestion: no extra commit unless fixing a real issue.

Run:

```powershell
node --test --import tsx test/team-orchestrator-controls.test.ts
node --test --import tsx --test-name-pattern "disposition|mindmap|scroll|setTaskDisposition" test/team-page-ui.test.ts
npm run test:team
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
```

If touched files show suspicious line churn, inspect EOL:

```powershell
git ls-files --eol src/team/orchestrator.ts src/ui/team-page.ts docs/team-runtime.md docs/change-log.md test/team-orchestrator-controls.test.ts test/team-page-ui.test.ts
```

## Formatting and EOL hygiene

- Preserve existing line endings and formatting.
- Do not run broad formatters.
- Formatting is allowed only for intentionally changed files and only if it matches existing tooling.
- Review `git diff --stat`, `git diff --numstat`, and suspicious large diffs before accepting work.
- If a small feature produces thousands of changed lines, stop and investigate line-ending or formatter churn before committing.
- Delivery report must state whether mechanical formatting or EOL normalization occurred. If it happened unintentionally, revert it before handoff.

## Testing rules

Tests must verify real behavior, not just that a function name exists.

Do not write weak tests such as:

- only checking that a helper name exists,
- accepting contradictory terminal states,
- accepting `running` as a valid terminal lifecycle result,
- broad `assert.ok(A || B || C)` without a precise reason,
- checking only UI strings while leaving the old collapse behavior intact.

Required coverage:

- Successful forced rerun clears marker.
- Failed forced rerun keeps marker.
- Generated child forced rerun clears marker after success.
- Second rerun does not re-execute already successful tasks whose force marker was cleared.
- Disposition UI refreshes without collapsing the run detail.
- Disposition UI preserves scroll/position after click.

## Human/Codex review checklist

- `force_rerun` is not cleared before execution.
- `force_rerun` is cleared only for tasks that actually end `succeeded`.
- `skip` remains persistent and is not auto-cleared.
- Existing `shouldExecuteOnRerun(...)` decision table still matches docs.
- Parent/generated/decomposed task handling is covered.
- No `for_each.parallel` regression.
- UI no longer uses the old hide + `toggleRunDetail(...)` reload pattern in `setTaskDisposition(...)`.
- Scroll/position is restored after disposition update.
- No `.env`, `.data`, runtime artifacts, temp files, unknown `.pi/skills/*`, or `skills-lock.json` are committed.
- No EOL-only or formatter-only churn.

## Delivery report template

```text
完成 Team rerun disposition cleanup / scroll preservation。

Commits:
- <hash> <message>

实现摘要:
- force_rerun autoclear:
- Failed/skip marker behavior:
- Generated child coverage:
- UI scroll preservation:
- Docs:

验证:
- node --test --import tsx test/team-orchestrator-controls.test.ts: <result>
- node --test --import tsx --test-name-pattern "disposition|mindmap|scroll|setTaskDisposition" test/team-page-ui.test.ts: <result>
- npm run test:team: <result>
- npx tsc --noEmit: <result>
- git diff --check: <result>
- git diff --stat / --numstat reviewed: <yes/no>

未提交文件:
- <list remaining untracked runtime/report/plan artifacts>

EOL/formatter:
- 是否发生机械格式化或换行符转换；如果没有，写“没有”。

阻塞/风险:
- <none or details>
```
