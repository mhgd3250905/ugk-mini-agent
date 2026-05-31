# Team Console Discovery Step 08E2A Review Fixes Plan

Date: 2026-05-31

## Goal

Fix two narrow review findings left by Step 08E2A generated child light edit/reset UI:

1. A restored `discoveryGeneratedEditTaskId` can mark a generated card as editing after reload while no edit draft/panel exists.
2. Closing the whole Discovery task branch does not clear the generated child edit draft, so stale unsaved generated draft state can reappear after reopening.

This is a review-fix step for Step 08E2A only. It must not start Step 08E2B failed dispatch diagnostics. Keep the work boring and small; this is not the time to "polish" the console into a different product.

## Current Baseline

- Repo: `E:\AII\ugk-pi`
- Latest commit: `af0362a docs(team-console): record task chain validation`
- Current Step 08E2A delivery is local and unstaged.
- Known Step 08E2A verification already passed before review:
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx`: 39 passed.
  - `npm --prefix apps/team-console test -- --run src/tests/team-api.test.ts src/tests/team-contract-drift.test.ts`: 90 passed.
  - Team Console `tsc`, Team Console build/full Vitest, top-level `npx tsc --noEmit`, and `git diff --check` passed.
- Existing dirty boundaries remain:
  - `.pi/skills/anthropics/skill-creator/**` tracked deletions are pre-existing and out of scope.
  - `.pi/skills/skill-creator/` is untracked and out of scope.
  - `.codex/plans/*` are planning files unless explicitly asked to stage later.
  - public/runtime report artifacts, temp HTML/scripts, `.env`, `.data`, browser screenshots, and unknown `.pi/skills/*/skills-lock.json` are out of scope.
- Staging policy: do not stage and do not commit.

## Must Read First

- `AGENTS.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`
- `.codex/plans/2026-05-31-team-console-discovery-step-08e2a-generated-edit-reset-ui-plan.md`
- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/app/use-task-branch-stack.ts`
- `apps/team-console/src/app/use-task-edit-state.ts`
- `apps/team-console/src/tests/app-live-data.test.tsx`
- `apps/team-console/README.md`
- `docs/team-runtime.md`
- `docs/change-log.md`

## Absolute Scope Boundary

Allowed production files:

- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/app/use-task-branch-stack.ts`

Allowed test files:

- `apps/team-console/src/tests/app-live-data.test.tsx`

Allowed docs:

- `docs/change-log.md` only if you change user-visible behavior wording or need to record this review fix.

Do not edit backend routes/store/runtime, dispatcher, scheduler, role prompt/parser, API adapter, fixture schema, `ExecutionMap.tsx`, `atlas-geometry.ts`, main `/playground`, or `.pi/skills/**`.

## Review Findings To Fix

### Finding 1: restored generated edit id can create fake editing UI

Current code restores `discoveryGeneratedEditTaskId` from localStorage in `App.tsx`, then computes:

```ts
const generatedIsEditing = branch.discoveryGeneratedEditTaskId === generatedTask.taskId;
```

But `taskEditDraftByTaskId` is not persisted. The panel only renders when a draft exists. After reload, the generated card can display `data-generated-editing="true"` and "收起编辑" while `[data-generated-edit-task-id="<taskId>"]` does not exist. First click only clears the stale branch id; second click opens the panel. That is a broken state transition.

Preferred fix:

- When a restored/generated edit branch id resolves to a real generated task and there is no draft, hydrate the draft from that generated task.
- Keep old stored branch state compatible.
- If the stored id is malformed or does not resolve to a generated task, do not drop the Discovery subcanvas branch. It can simply show no generated edit panel.

### Finding 2: closing a root Discovery branch leaves generated draft behind

`use-task-branch-stack.ts` currently clears only `closing.taskId` when closing one branch:

```ts
if (closing) onClearTaskPanelState(closing.taskId);
```

For a generated edit panel, the draft key is the generated child task id in `closing.discoveryGeneratedEditTaskId`, not the root Discovery task id. If the user opens a generated edit panel, changes an unsaved draft, closes the whole root branch, reopens the subcanvas, and opens edit again, the stale unsaved draft can reappear because `openTaskEditDraft()` intentionally preserves existing drafts.

Preferred fix:

- When closing a single branch, clear the root task state and also clear `closing.discoveryGeneratedEditTaskId` when present and different from `closing.taskId`.
- Closing all branches already calls `onClearTaskPanelState()` with no id and should keep clearing all state.

## Implementation Tasks

### 1. Add failing tests first

Add focused tests to `apps/team-console/src/tests/app-live-data.test.tsx`.

Required test coverage:

1. Persisted generated edit state:
   - Seed `ugk-team-console:canvas-ui-state:v1` with an expanded Discovery subcanvas branch containing:
     - `detailMode: "discovery-subcanvas"`
     - `discoveryGeneratedEditTaskId: "task_generated_vultr"`
   - Render `<App />`.
   - Assert the Discovery subcanvas remains open.
   - Assert `[data-generated-edit-task-id="task_generated_vultr"]` appears without needing a second user click.
   - Assert the `task_generated_vultr` card has `data-generated-editing="true"`.

2. Generated draft cleanup on branch close:
   - Open the Discovery subcanvas in mock data.
   - Open edit for `task_generated_vultr`.
   - Change a draft field, for example title, to a clearly stale value such as `Unsaved stale generated title`.
   - Close the whole root Discovery branch, not just the generated edit panel.
   - Reopen the Discovery subcanvas and open edit for the same generated task.
   - Assert the draft title is the current generated task title, not the stale unsaved value.

Use existing test helpers and patterns. Do not create a new test file unless the existing file structure makes that unavoidable.

### 2. Implement the smallest state fix

Suggested implementation shape:

- In `App.tsx`, add a small effect that scans `expandedTaskBranches` for branches with `detailMode === "discovery-subcanvas"` and `discoveryGeneratedEditTaskId`.
- Resolve the id through `generatedTasksById`.
- If the generated task exists and `taskEditDraftByTaskId[taskId]` is missing, call `openTaskEditDraft(generatedTask)`.
- Make sure dependencies are correct and the effect cannot loop endlessly. `openTaskEditDraft()` already guards existing drafts.

Do not call state setters from render.

### 3. Clear generated draft when closing branch

In `use-task-branch-stack.ts`, update `closeTaskBranch(nodeId)` so closing one branch clears both:

- `closing.taskId`
- `closing.discoveryGeneratedEditTaskId`, when present and different from `closing.taskId`

Do not change the semantics of closing all branches.

### 4. Optional docs

If you judge this user-visible enough to record, add a concise `docs/change-log.md` entry under `2026-05-31` saying Step 08E2A generated edit restore/branch-close draft cleanup was fixed.

Do not touch `docs/team-runtime.md` unless the runtime contract text is inaccurate.

## Verification

Focused verification:

```powershell
npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx
```

Final verification:

```powershell
npm --prefix apps/team-console test -- --run src/tests/team-api.test.ts src/tests/team-contract-drift.test.ts
npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json
npm --prefix apps/team-console run build
npm --prefix apps/team-console test
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
git ls-files --eol apps/team-console/src/app/App.tsx apps/team-console/src/app/use-task-branch-stack.ts apps/team-console/src/tests/app-live-data.test.tsx docs/change-log.md
git diff --cached --stat
```

If no docs were touched, omit `docs/change-log.md` from the EOL command.

## Browser Verification

Use the real local Team Console entry:

```text
http://127.0.0.1:5174/
```

Required browser evidence:

1. Reload restore behavior:
   - Open the mock/sample Discovery subcanvas.
   - Open generated edit for `task_generated_vultr`.
   - Reload the page.
   - Report:
     - `[data-discovery-subcanvas-for="task_discovery_cloud_vendors"]` count.
     - `[data-generated-edit-task-id="task_generated_vultr"]` count after reload.
     - `task_generated_vultr` card `data-generated-editing`.

2. Branch-close cleanup behavior:
   - Open generated edit for `task_generated_vultr`.
   - Type an unsaved stale title.
   - Close the whole root Discovery branch.
   - Reopen the subcanvas and edit panel.
   - Report the title input value and confirm it is not the stale unsaved title.

3. Regression boundary:
   - Report root canvas generated title matches count remains 0.
   - Report browser console issues.
   - Save a screenshot under `runtime/` and do not stage it.

If browser automation cannot access localStorage directly, do not ask the user to run snippets. Use the UI reload path above.

## Delivery Report Template

Reply with:

1. Modified files.
2. Tests added first and the RED failure summary.
3. Implementation summary.
4. Persisted edit restore behavior evidence.
5. Branch-close stale draft cleanup evidence.
6. Browser verification evidence for `http://127.0.0.1:5174/`.
7. Verification command results.
8. Diff/EOL hygiene:
   - `git diff --stat`
   - `git diff --numstat`
   - `git ls-files --eol ...`
   - whether any formatter/EOL churn occurred
9. Staging state:
   - `git diff --cached --stat`
10. Non-goals respected:
   - no 08E2B diagnostics
   - no backend/runtime/store/route changes
   - no root generated tasks/root canvas injection
   - no `.pi/skills/**`
   - no stage/commit
