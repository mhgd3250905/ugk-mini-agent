# Team Console Discovery Step 08E2C Review Fixes Plan

Date: 2026-05-31

## Goal

Fix two review findings in the already implemented Team Console Discovery Step 08E2C generated child archive/delete UI:

1. Generated archive success currently recomputes the root Discovery summary from a stale closure snapshot after an async archive call. If a live generated catalog refresh lands while archive is pending, the subcanvas catalog and summary can drift.
2. Generated archive confirm/saving UI state can survive Discovery subcanvas/root branch close and reappear stale when the subcanvas is reopened.

This is a review-fix step, not a new feature step. Do not redesign Discovery archive/delete. Do not re-open backend scope. The previous implementation mostly works; the bug is state ownership, not endpoint semantics.

## Current Baseline

- Repo: `E:\AII\ugk-pi`
- Branch: `main...origin/main [ahead 6]`
- Latest commit: `af0362a docs(team-console): record task chain validation`
- Current worktree is intentionally dirty with local, unstaged Team Console Discovery work through Step 08E2C plus older unrelated files.
- Current known 08E2C verification from the previous delivery:
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx`: 47 passed.
  - `npm --prefix apps/team-console test -- --run src/tests/team-api.test.ts src/tests/team-contract-drift.test.ts`: 90 passed.
  - `npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json`: passed.
  - `npm --prefix apps/team-console run build`: passed.
  - `npm --prefix apps/team-console test`: 522 passed.
  - `npx tsc --noEmit`: passed.
  - `git diff --check`: passed.
  - `git diff --cached --stat`: empty.
- Known dirty boundaries:
  - `.pi/skills/anthropics/skill-creator/**` tracked deletions are pre-existing and out of scope.
  - `.pi/skills/skill-creator/`, public/runtime reports, temp HTML/scripts, and most `.codex/plans/*` are local/untracked and out of scope.
  - Do not stage or commit anything.

## Must Read First

- `AGENTS.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`
- `.codex/plans/2026-05-31-team-console-discovery-step-08e2c-generated-archive-delete-plan.md`
- `.codex/plans/2026-05-31-team-console-discovery-step-08e2c-generated-archive-delete-message.txt`
- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/app/use-team-console-live-data.ts`
- `apps/team-console/src/app/use-task-branch-stack.ts`
- `apps/team-console/src/tests/app-live-data.test.tsx`
- `apps/team-console/src/fixtures/team-fixtures.ts`

## Allowed Files

Expected production files:

- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/app/use-team-console-live-data.ts`

Expected test file:

- `apps/team-console/src/tests/app-live-data.test.tsx`

Do not edit docs for this review-fix unless the implementation behavior changes beyond these bug fixes. Do not edit CSS unless a test proves the existing confirm UI cannot be used after state cleanup.

## Do Not Do

- Do not add a backend endpoint.
- Do not edit `src/team/**`.
- Do not change Discovery dispatch, generated upsert, auto-run scheduler, or `TeamDiscoveryDispatchOutcome`.
- Do not change generated edit/reset/archive user-facing semantics except to fix the two state bugs.
- Do not add hard delete, physical delete, restore, or unarchive.
- Do not put generated children into root `tasks`, `tasksById`, `taskNodes`, or root canvas.
- Do not close the root Discovery branch after successful generated archive.
- Do not archive the root Discovery Task.
- Do not touch main `/playground`.
- Do not touch `.pi/skills/**`, runtime skills, or `skills-lock.json`.
- Do not create plan-unrelated files.
- Do not run broad formatters or convert line endings.
- Do not stage, commit, push, or use `git add -A`.

## Review Findings To Fix

### Finding 1: summary drift from stale archive closure

Current risky shape in `App.tsx`:

```ts
const remainingTasks = (generatedTasksByDiscoveryTaskId[sourceDiscoveryTaskId] ?? [])
  .filter((generatedTask) => generatedTask.taskId !== taskId);
setGeneratedTasksByDiscoveryTaskId((current) => ({
  ...current,
  [sourceDiscoveryTaskId]: (current[sourceDiscoveryTaskId] ?? []).filter((generatedTask) => generatedTask.taskId !== taskId),
}));
updateDiscoverySummaryForGeneratedCatalog(sourceDiscoveryTaskId, remainingTasks);
```

The catalog update uses `current`, but the summary uses an async closure snapshot. If live refresh updates generated catalog while archive is pending, the catalog can contain one list and the summary can describe another list. That is the bug; do not hand-wave it away because the happy path test passes.

Preferred fix:

- In `use-team-console-live-data.ts`, make `discoverySummariesByTaskId` a derived `useMemo` from:
  - `generatedTasksByDiscoveryTaskId`
  - `taskRunsByTaskId`
  - `discoveryDispatchDiagnosticsByTaskId`
- Remove the separate `useState` for `discoverySummariesByTaskId`.
- Remove `setDiscoverySummariesByTaskId` from the hook return type and from `App.tsx` destructuring.
- Remove `updateDiscoverySummaryForGeneratedCatalog` from `App.tsx`.
- In `archiveGeneratedTask`, only mutate `generatedTasksByDiscoveryTaskId` through a current-state updater. The summary should follow automatically because it is derived.

This is less clever and more correct. Summary is a projection; storing it separately after local catalog mutations is how drift creeps in.

### Finding 2: stale generated archive confirmation after close/reopen

Current risky facts:

- `generatedArchiveConfirmTaskId` is global App state.
- Generated archive confirm opens when clicking `data-generated-action="archive"`.
- Discovery subcanvas collapse clears edit/observer state but does not clear generated archive confirm/saving state.
- Closing root branch via `closeTaskBranch` clears root task panel state and generated edit state, but not archive confirm state for generated children.

Preferred fix:

- Add a small helper in `App.tsx` near the generated archive state:

```ts
const clearGeneratedArchiveUiForTasks = useCallback((taskIds: string[]) => {
  if (taskIds.length === 0) return;
  const taskIdSet = new Set(taskIds);
  setGeneratedArchiveConfirmTaskId((current) => (
    current && taskIdSet.has(current) ? null : current
  ));
  setGeneratedArchiveSavingByTaskId((current) => {
    let changed = false;
    const next = { ...current };
    for (const taskId of taskIdSet) {
      if (taskId in next) {
        delete next[taskId];
        changed = true;
      }
    }
    return changed ? next : current;
  });
}, []);
```

- Use it when collapsing a Discovery subcanvas. Pass the generated task ids currently owned by that root Discovery task:

```ts
clearGeneratedArchiveUiForTasks(
  (generatedTasksByDiscoveryTaskId[task.taskId] ?? []).map((generatedTask) => generatedTask.taskId),
);
```

- Also guard root branch close/open paths. If direct `closeTaskBranch` integration is awkward because the hook only accepts `onClearTaskPanelState`, add a focused `useEffect` in `App.tsx`:
  - compute the set of generated task ids that are still visible in currently open `detailMode === "discovery-subcanvas"` branches.
  - if `generatedArchiveConfirmTaskId` exists but is not in that open set, clear it.
  - remove saving map entries for generated task ids that no longer exist in any current generated catalog.

Do not overbuild a generic branch lifecycle system just for this. This is a local cleanup bug.

## Tests First

Add tests in `apps/team-console/src/tests/app-live-data.test.tsx` before implementation and run them to confirm RED.

### Test 1: stale confirm is cleared after close/reopen

Suggested name:

```ts
it("clears generated archive confirmation when the Discovery subcanvas is closed", async () => {
  // ...
});
```

Test steps:

1. Render `<App />` in mock mode.
2. Open mock Discovery subcanvas using existing helper.
3. Click `task_generated_vultr` card's `[data-generated-action="archive"]`.
4. Assert `[data-generated-archive-confirm-for="task_generated_vultr"]` exists.
5. Click the Discovery subcanvas header button with name like `/收起 .* Discovery 子画布/`.
6. Assert the subcanvas is absent.
7. Reopen the Discovery subcanvas from the root Discovery task menu.
8. Assert `task_generated_vultr` card exists.
9. Assert `[data-generated-archive-confirm-for="task_generated_vultr"]` is absent.

Expected RED on the current implementation: the confirm block reappears after reopening.

### Test 2: summary follows latest generated catalog after archive/refresh interleave

Suggested name:

```ts
it("keeps Discovery summary aligned with refreshed generated catalog when archive resolves after refresh", async () => {
  // ...
});
```

Use live mode and a controllable archive response. The old bug needs an async interleave; a plain happy path will not catch it.

Recommended shape:

1. Set `window.localStorage.setItem("ugk-team-console:data-source", "live")`.
2. Define two generated catalogs:
   - `initialGeneratedTasks`: current non-archived mock generated tasks (`task_generated_vultr`, `task_generated_hetzner`).
   - `refreshedGeneratedTasks`: `initialGeneratedTasks` plus one extra active generated task. You can clone `task_generated_vultr` into a new task id/title/source item id, for example `task_generated_scaleway`, as long as it remains generated by the same Discovery root and is not archived.
3. Mock `fetch`:
   - `/v1/agents`, `/v1/agents/status`, root `/v1/team/tasks`, task connections/deps/source routes as existing live tests do.
   - `/v1/team/tasks/${mockDiscoveryRootTask.taskId}/generated-tasks` returns `initialGeneratedTasks` first, then `refreshedGeneratedTasks` for the manual refresh.
   - `POST /v1/team/tasks/task_generated_vultr/archive` returns a manually controlled promise and does not resolve immediately.
   - `/v1/team/tasks/:taskId/runs` returns empty runs for generated tasks unless the test needs otherwise.
4. Render `<App />`, wait for root Discovery summary `2 items`.
5. Open Discovery subcanvas; assert two generated cards.
6. Click `task_generated_vultr` archive, click confirm, but keep archive promise pending.
7. Click toolbar `刷新 Task` and wait for the generated catalog refresh to add the extra generated card.
8. Assert subcanvas now has three generated cards while archive is still pending.
9. Resolve the pending archive response with `{ task: archivedVultrTask, warnings: [] }`.
10. Wait for `task_generated_vultr` to disappear.
11. Assert subcanvas has two generated cards: `task_generated_hetzner` and the extra refreshed task.
12. Assert root Discovery summary says `2 items`, not `1 items`.

Expected RED on current implementation: catalog count becomes 2, but summary can still say `1 items` because it was computed from the stale two-item closure minus Vultr.

If the exact UI refresh timing is difficult, stop and report. Do not replace this with a weaker test that only checks the happy path; the whole point is the interleave.

## Implementation Steps

1. Add the two tests above and run:

```powershell
npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx
```

Record the focused RED failure summary.

2. Refactor `use-team-console-live-data.ts` summary ownership:

- keep `summarizeDiscoveryCatalogs(...)` as the single summary builder.
- replace `const [discoverySummariesByTaskId, setDiscoverySummariesByTaskId] = useState(...)` with a derived `useMemo`.
- remove `discoverySummariesByTaskId` from `DiscoveryCatalogLoadResult`.
- remove `setDiscoverySummariesByTaskId(...)` calls from:
  - `applyDiscoveryCatalogLoadResult`
  - mock fixture initialization
  - live workspace clearing
- remove `setDiscoverySummariesByTaskId` from `UseTeamConsoleLiveDataReturn`.

3. Update `App.tsx`:

- remove `setDiscoverySummariesByTaskId` destructuring.
- remove `updateDiscoverySummaryForGeneratedCatalog`.
- in `archiveGeneratedTask`, remove `remainingTasks` closure summary logic. Only filter generated catalog through `setGeneratedTasksByDiscoveryTaskId((current) => ...)`.
- add generated archive UI cleanup helper.
- clear generated archive confirm/saving state when closing the Discovery subcanvas and via a defensive effect if needed.

4. Re-run focused tests and fix only failures caused by this review-fix.

## Browser Verification

Because this is a UI state fix, verify at the real local Team Console entry:

```text
http://127.0.0.1:5174/
```

Required browser evidence:

- data source: mock / 示例数据.
- Open root Discovery card, then `Discovery 子画布`.
- Open archive confirm for `task_generated_vultr`.
- Close the Discovery subcanvas.
- Reopen the Discovery subcanvas.
- Confirm `[data-generated-archive-confirm-for="task_generated_vultr"]` is absent.
- Then run the normal generated archive happy path once:
  - before: `[data-generated-task-id]` count = 2 and root summary `2 items / 1 active / 1 stale / 1 blocked`.
  - archive `task_generated_vultr`.
  - after: `[data-generated-task-id]` count = 1 and root summary `1 items / 0 active / 1 stale / 1 blocked`.
  - Discovery subcanvas stays open.
  - root canvas generated title matches = 0.
- Report screenshot path under `runtime/`; do not stage it.
- Report console issues honestly. Known `/favicon.ico` 404 is unrelated if it appears. Do not claim console is empty if it is not.

If `http://127.0.0.1:5174/` serves an old bundle, restart the Team Console dev service/container and repeat verification. Do not ask the user to run console snippets.

## Final Verification Commands

Run:

```powershell
npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx
npm --prefix apps/team-console test -- --run src/tests/team-api.test.ts src/tests/team-contract-drift.test.ts
npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json
npm --prefix apps/team-console run build
npm --prefix apps/team-console test
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
git ls-files --eol apps/team-console/src/app/App.tsx apps/team-console/src/app/use-team-console-live-data.ts apps/team-console/src/tests/app-live-data.test.tsx
git diff --cached --stat
```

Do not stage. Do not commit.

## Delivery Report Template

Use this exact structure:

1. Modified files.
2. Tests added first and RED failure summary.
3. Fix 1: summary/catalog consistency:
   - what stale-closure behavior was caught.
   - how summary is now derived.
   - archive/refresh interleave result.
4. Fix 2: generated archive confirm cleanup:
   - close/reopen behavior.
   - subcanvas/root branch state behavior.
5. Generated archive behavior regression check:
   - endpoint still used.
   - generated child still removed only from generated catalog.
   - root tasks/root taskNodes/root canvas unchanged.
6. Browser verification evidence for `http://127.0.0.1:5174/`.
7. Verification command results.
8. Diff/EOL hygiene:
   - `git diff --stat`.
   - `git diff --numstat`.
   - `git ls-files --eol ...`.
   - formatter/EOL churn statement.
9. Staging state: `git diff --cached --stat`.
10. Non-goals respected.

## Review Checklist

- The new interleave test fails against stale summary ownership and passes after the fix.
- The new close/reopen test fails against stale confirm state and passes after the fix.
- `discoverySummariesByTaskId` cannot drift from generated catalog state after local archive updates.
- `App.tsx` no longer exposes or calls `setDiscoverySummariesByTaskId`.
- Generated archive still calls existing `archiveTask(taskId)` / `POST /v1/team/tasks/:taskId/archive`.
- Generated child removal remains scoped to `generatedTasksByDiscoveryTaskId[sourceDiscoveryTaskId]`.
- Root Discovery branch and subcanvas remain open after successful archive.
- No backend, `/playground`, `.pi/skills/**`, formatter churn, stage, or commit.
