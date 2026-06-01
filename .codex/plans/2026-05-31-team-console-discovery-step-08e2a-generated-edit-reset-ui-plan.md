# Team Console Discovery Step 08E2A Plan: Generated Task Light Edit And Reset UI

Date: 2026-05-31

## Goal

Add the first 5174 UI affordance for managing generated Tasks inside the Discovery subcanvas:

- light-edit a generated child Task from its generated card.
- reset a customized generated child Task back to the latest managed WorkUnit snapshot through the Step 08E1 API adapter.
- keep generated children out of the root canvas and root Task branch state.

This is intentionally only Step 08E2A. Failed dispatch diagnostics are Step 08E2B. Do not combine them. GLM turning this into one heroic UI sweep would be how we get a diff nobody wants to review.

## Current Baseline

- Repo: `E:\AII\ugk-pi`
- Branch state: `main...origin/main [ahead 6]`
- Latest commit: `af0362a docs(team-console): record task chain validation`
- Discovery local steps completed and reviewed:
  - Step 08A: Team Console data/API seam for generated child catalog.
  - Step 08B: root Discovery card identity and summary row.
  - Step 08C: Discovery subcanvas catalog panel.
  - Step 08D: generated child run/cancel, latest-run observer, Worker/Checker process, file detail.
  - Step 08E1: backend/shared contract/API adapter reset seam.
- Step 08E1 reviewed verification:
  - `node --test --import tsx test/team-task-store.test.ts`: 27 passed.
  - `node --test --import tsx test/team-task-routes.test.ts`: 37 passed.
  - `npm --prefix apps/team-console test -- --run src/tests/team-api.test.ts src/tests/team-contract-drift.test.ts`: 90 passed.
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx`: 35 passed.
  - Team Console `tsc`, top-level `npx tsc --noEmit`, `git diff --check`, and empty staged diff passed.
- Existing dirty boundaries remain:
  - `.pi/skills/anthropics/skill-creator/**` tracked deletions are pre-existing and out of scope.
  - `.pi/skills/skill-creator/` is untracked and out of scope.
  - `.codex/plans/*` are local planning files unless explicitly asked to stage later.
  - public/runtime report artifacts, temp HTML/scripts, `.env`, `.data`, browser screenshots, and unknown `.pi/skills/*/skills-lock.json` are out of scope.

## Must Read First

- `AGENTS.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`
- `.codex/plans/2026-05-31-team-console-discovery-step-08e1-generated-reset-contract-plan.md`
- `apps/team-console/README.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/app/use-task-branch-stack.ts`
- `apps/team-console/src/app/use-team-console-live-data.ts`
- `apps/team-console/src/api/team-api.ts`
- `apps/team-console/src/api/team-types.ts`
- `apps/team-console/src/fixtures/team-fixtures.ts`
- `apps/team-console/src/graph/execution-map.css`
- `apps/team-console/src/tests/app-live-data.test.tsx`
- `apps/team-console/src/tests/team-api.test.ts`

## Absolute Scope Boundary

Allowed production files:

- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/app/use-task-branch-stack.ts`
- `apps/team-console/src/app/use-team-console-live-data.ts`
- `apps/team-console/src/graph/execution-map.css`

Allowed test files:

- `apps/team-console/src/tests/app-live-data.test.tsx`
- `apps/team-console/src/tests/team-api.test.ts` only if an existing adapter/mock assertion needs a tiny update. Step 08E1 already covers the API adapter, so avoid touching this unless necessary.

Allowed docs/plans:

- `apps/team-console/README.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`

Do not edit backend routes/store/runtime, dispatcher, scheduler, role prompt/parser, `ExecutionMap.tsx`, `atlas-geometry.ts`, main `/playground`, or `.pi/skills/**`.

## Do Not Do

- Do not add failed dispatch diagnostics in this step.
- Do not archive, delete, hide, or rerun dispatcher for generated Tasks.
- Do not add new backend endpoints.
- Do not edit `src/team/**` unless the plan is wrong and you stop to report.
- Do not put generated children into root `tasks`, root `tasksById`, root `taskNodes`, or root canvas cards.
- Do not make generated child edit use the root Task menu branch as if the generated child were a root node.
- Do not expose or edit generated source identity fields: `sourceDiscoveryTaskId`, `sourceItemId`, `itemPayload`, latest discovery ids, `itemStatus`.
- Do not build a full WorkUnit visual editor. This step is light edit only.
- Do not suppress console warnings broadly.
- Do not run broad formatters or convert line endings.
- Do not stage, commit, push, or use `git add -A`.

## Existing Code Facts

- Generated cards already render inside:

```text
[data-discovery-subcanvas-for="<discoveryTaskId>"] [data-generated-task-id="<generatedTaskId>"]
```

- Generated card actions already use:

```text
data-generated-action="run"
data-generated-action="cancel"
data-generated-action="observe-run"
```

- Step 08E1 already added:

```ts
CanvasTaskGateway.resetGeneratedTaskWorkUnit(taskId): Promise<TeamTaskMutationResponse>
LiveTeamApi.resetGeneratedTaskWorkUnit(taskId)
MockTeamApi.resetGeneratedTaskWorkUnit(taskId)
TeamGeneratedTaskSource.latestManagedWorkUnit?: TeamWorkUnitDefinition
```

- Root Task edit state already exists:
  - `taskEditDraftByTaskId`
  - `openTaskEditDraft(task)`
  - `updateTaskEditDraft(...)`
  - `saveTaskEdit(taskId)`
  - `replaceTaskEditDraft(response.task)`
  - `taskEditSavingByTaskId`
  - `taskEditWarningByTaskId`

Generated children are not in `tasksById`, so `saveTaskEdit()` must not keep using only `tasksById.get(taskId)`. It needs to resolve `tasksById.get(taskId) ?? generatedTasksById.get(taskId)` for edit saves.

## Required UI Behavior

Inside each generated card:

1. Add an edit action:

```html
data-generated-action="edit"
```

Clicking it opens a generated edit child panel sourced from the Discovery subcanvas panel, not from the root Task menu.

Recommended panel ids:

```text
sourceId: `discovery-subcanvas-${rootBranch.nodeId}`
panel id: `generated-task-edit-${rootBranch.nodeId}-${generatedTaskId}`
```

Panel must expose:

```html
data-generated-edit-task-id="<generatedTaskId>"
```

2. Generated light edit fields:

- Task name.
- Leader Agent.
- Worker Agent.
- Checker Agent.

Do not expose source identity fields or full WorkUnit input/output/acceptance editing.

3. Generated edit save semantics:

- Reuse the existing `api.updateTask(taskId, patch)` route.
- If generated Task title changes, update both visible `title` and `workUnit.title` in the patch so the backend marks the generated WorkUnit `customized`. Otherwise Discovery rerun can overwrite what looked like a user edit. Yes, this is subtle, and yes, it matters.
- If worker/checker changes, patch the full current `workUnit` with only the agent id changed.
- If leader changes, patch `leaderAgentId`.
- Do not change `generatedSource` directly.
- On success, update only `generatedTasksByDiscoveryTaskId[sourceDiscoveryTaskId]`; do not insert the generated Task into root `tasks` or `taskNodes`.
- Keep the Discovery subcanvas open after save.
- If an edit panel is open for the same generated Task, refresh its draft from the returned task.

4. Add reset-to-managed action:

```html
data-generated-action="reset-workunit"
```

Show it only when:

- `generatedSource.workUnitMode === "customized"`
- `generatedSource.latestManagedWorkUnit` exists

Or render it disabled with a clear title when no snapshot exists. Prefer hidden for managed Tasks and visible for customized Tasks with a snapshot, because generated cards are already dense.

Clicking reset must:

- call `api.resetGeneratedTaskWorkUnit(generatedTask.taskId)`.
- update the generated catalog state with the returned task.
- change the card `data-generated-workunit-mode` to `managed`.
- restore the visible generated card title to `latestManagedWorkUnit.title`.
- keep source identity and item status unchanged.
- keep the Discovery subcanvas open.
- not touch root canvas nodes.

5. Add stable state attributes/classes:

Recommended:

```html
data-generated-editing="true|false"
data-generated-reset-saving="true|false"
```

Use local state for reset saving, e.g. `generatedResetSavingByTaskId`.

6. Stored state compatibility:

If you add a field such as `discoveryGeneratedEditTaskId?: string` to `TaskBranchState`, update localStorage parsing so:

- old stored state still works.
- malformed generated edit task id is ignored without dropping the root Discovery branch.

## Implementation Tasks

### 1. Tests first

Add failing tests in `apps/team-console/src/tests/app-live-data.test.tsx`.

Required tests:

- Mock generated edit:
  - Render `<App />` in mock mode.
  - Open `发现云服务候选`.
  - Open `Discovery 子画布`.
  - Find `task_generated_vultr` card.
  - Click `[data-generated-action="edit"]`.
  - Assert `[data-generated-edit-task-id="task_generated_vultr"]` exists.
  - Change the generated Task title field to `用户改写 Vultr generated`.
  - Save.
  - Assert the card title updates.
  - Assert `data-generated-workunit-mode="customized"`.
  - Assert root canvas still has no root card/button named `用户改写 Vultr generated`.

- Mock generated reset:
  - Use `task_generated_hetzner`, which starts customized and has `latestManagedWorkUnit`.
  - Assert reset action exists.
  - Click `[data-generated-action="reset-workunit"]`.
  - Assert card title becomes `generatedSource.latestManagedWorkUnit.title`.
  - Assert `data-generated-workunit-mode="managed"`.
  - Assert reset action disappears or is disabled after reset.
  - Assert source item id/status stays visible/unchanged.

- Live reset:
  - Use live data fetch mock style already in `app-live-data.test.tsx`.
  - Return root tasks plus generated children.
  - Click reset on `task_generated_hetzner`.
  - Assert fetch includes:

```text
POST /v1/team/tasks/task_generated_hetzner/generated-workunit/reset
```

  - Return `{ task, warnings: [] }`, then ensure the child catalog refresh or local replacement makes the card managed.
  - Assert generated child still is not a root canvas card.

- Error path:
  - Mock reset or edit failure returns an API error.
  - Assert the page error banner/text shows the message and the generated edit/subcanvas remains open.

Avoid weak tests that only check a button exists. Each test must prove state changed, source ownership stayed nested, and root canvas did not get polluted.

### 2. Implement generated edit state and panel

Recommended state extension in `use-task-branch-stack.ts`:

```ts
discoveryGeneratedEditTaskId?: string;
```

Parsing in `App.tsx` should accept it only when it is a non-empty string. If malformed, drop only that nested field.

In the generated card actions:

- Add edit button.
- Toggle `branch.discoveryGeneratedEditTaskId`.
- Call `openTaskEditDraft(generatedTask)` when opening.
- Do not change `branch.detailMode`; it must remain `"discovery-subcanvas"`.

Render a generated edit panel in `taskChildBranchPanels` after the generated subcanvas panel, similar to how generated observer panels are pushed. It should reuse the existing Task edit form structure but with text tailored to generated children:

```text
Generated Task 浅编辑
只允许修改名称和执行 Agent；sourceDiscoveryTaskId / sourceItemId / item payload 由 Discovery 维护。
```

Panel source id must be `discovery-subcanvas-${branch.nodeId}`.

### 3. Adapt save/update for generated Tasks

Update `saveTaskEdit(taskId)` so it can resolve a generated Task:

```ts
const task = tasksById.get(taskId) ?? generatedTasksById.get(taskId);
```

When `task.generatedSource` exists:

- title dirty means patch both `title` and `workUnit.title`.
- worker/checker dirty means patch `workUnit`.
- leader dirty means patch `leaderAgentId`.

After a generated update:

- live mode may call `refreshLiveTasks()`.
- mock mode should update `generatedTasksByDiscoveryTaskId[sourceDiscoveryTaskId]` from the returned task or by calling `api.listGeneratedTasks(sourceDiscoveryTaskId)`.
- do not call `setTasks()` / `makeTaskNodes()` with generated children.

If `useTeamConsoleLiveData()` needs to expose `setGeneratedTasksByDiscoveryTaskId`, do that narrowly and include it in the return type. Do not move all catalog ownership into `App.tsx`.

### 4. Implement reset action

Add a callback such as `resetGeneratedTaskWorkUnit(generatedTask)`.

Rules:

- It must refuse silently or show a clear error if `generatedTask.generatedSource` is missing.
- It must call the existing API adapter method.
- It must update generated catalog state, not root task state.
- It should refresh the edit draft if the generated edit panel is open for the same task.
- It should set a per-task saving state so the reset button cannot be double-clicked.

### 5. Add scoped CSS

Only style the generated edit/reset controls and generated edit panel if necessary.

Allowed CSS selectors:

- `.discovery-generated-action`
- `.discovery-generated-action.reset`
- `.discovery-generated-card.is-editing`
- `.generated-task-edit-branch`
- small variants of existing `.task-edit-*`

Do not restyle root cards, root Task edit panels, normal run observer panels, or the whole child panel system.

### 6. Docs

Update only factual docs:

- `apps/team-console/README.md`: generated child cards now support light edit and reset-to-managed through existing API adapter; diagnostics still future.
- `docs/team-runtime.md`: record Step 08E2A behavior and boundary.
- `docs/change-log.md`: add `2026-05-31 — Team Console Discovery generated Task edit/reset UI`.
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`: mark Step 08E2A completed locally only after implementation and verification; keep failed dispatch diagnostics as Step 08E2B/future.

## Browser Verification Required

Use the real Team Console entry:

```text
http://127.0.0.1:5174/
```

Use mock / 示例数据.

Required browser actions:

1. Clear relevant Team Console localStorage or start from a clean mock view.
2. Click `发现云服务候选`.
3. Click `Discovery 子画布`.
4. In `task_generated_vultr`, click generated edit.
5. Change generated Task title, save.
6. In `task_generated_hetzner`, click reset-to-managed.

Required measured evidence:

- `[data-canvas-kind="discovery"]` count.
- `[data-discovery-subcanvas-for="task_discovery_cloud_vendors"]` count.
- `[data-generated-task-id]` count inside the subcanvas.
- `[data-generated-edit-task-id="task_generated_vultr"]` count before/after close or save.
- `task_generated_vultr` title and `data-generated-workunit-mode` after edit.
- `task_generated_hetzner` title and `data-generated-workunit-mode` after reset.
- root canvas matches for generated titles remain 0.
- rects for:
  - Discovery subcanvas panel.
  - generated edit panel.
- screenshot path under `runtime/`, for example:

```text
runtime/team-console-step08e2a-generated-edit-reset.png
```

The screenshot is runtime output and must not be staged.

If browser automation is unavailable, report it as a limitation. Do not make the user manually verify if automation is available.

## Verification Commands

Focused checks:

```powershell
npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx
npm --prefix apps/team-console test -- --run src/tests/team-api.test.ts src/tests/team-contract-drift.test.ts
npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json
```

Final checks:

```powershell
npm --prefix apps/team-console run build
npm --prefix apps/team-console test
npx tsc --noEmit
git diff --check
git diff --cached --stat
```

Diff/EOL inspection:

```powershell
git diff --stat -- apps/team-console/src/app/App.tsx apps/team-console/src/app/use-task-branch-stack.ts apps/team-console/src/app/use-team-console-live-data.ts apps/team-console/src/graph/execution-map.css apps/team-console/src/tests/app-live-data.test.tsx apps/team-console/src/tests/team-api.test.ts apps/team-console/README.md docs/team-runtime.md docs/change-log.md .codex/plans/2026-05-30-team-console-discovery-requirements.md
git diff --numstat -- apps/team-console/src/app/App.tsx apps/team-console/src/app/use-task-branch-stack.ts apps/team-console/src/app/use-team-console-live-data.ts apps/team-console/src/graph/execution-map.css apps/team-console/src/tests/app-live-data.test.tsx apps/team-console/src/tests/team-api.test.ts apps/team-console/README.md docs/team-runtime.md docs/change-log.md .codex/plans/2026-05-30-team-console-discovery-requirements.md
git ls-files --eol apps/team-console/src/app/App.tsx apps/team-console/src/app/use-task-branch-stack.ts apps/team-console/src/app/use-team-console-live-data.ts apps/team-console/src/graph/execution-map.css apps/team-console/src/tests/app-live-data.test.tsx apps/team-console/src/tests/team-api.test.ts apps/team-console/README.md docs/team-runtime.md docs/change-log.md .codex/plans/2026-05-30-team-console-discovery-requirements.md
```

If a new file is created, also run:

```powershell
Select-String -LiteralPath <new-file> -Pattern '[ \t]+$'
git ls-files --eol --others --exclude-standard <new-file>
```

## Stop Conditions

Stop and report if:

- Generated edit requires generated Tasks to enter root `tasksById` / `taskNodes`.
- Reset requires backend route/store changes.
- Existing generated run/observer tests regress.
- A title edit cannot be made customized without broad backend changes.
- Live/mock catalog refresh requires a large data-hook rewrite.
- Browser verification cannot be automated.
- Diff size suggests formatter or EOL churn.

## Commit Policy

No stage, no commit, no push unless explicitly authorized. Do not use `git add -A`.

Suggested commit message if later approved:

```text
feat(team-console): edit and reset discovery generated tasks
```

## Delivery Report Template

Reply with:

1. Modified files.
2. UI behavior changes: generated edit and reset.
3. State/data ownership details proving generated children did not enter root canvas state.
4. How generated title/agent edits map to API patch, especially title -> `workUnit.title` for generated tasks.
5. Reset behavior and exact API adapter method used.
6. Tests added/updated and what old missing behavior they catch.
7. Browser verification evidence with URL, selectors, counts, measured rects, and screenshot path.
8. Docs updated.
9. Explicit non-goals not implemented, especially failed dispatch diagnostics.
10. Verification commands and pass/fail results.
11. Diff stat/numstat summary and EOL/formatter churn status.
12. `git diff --cached --stat` result proving nothing is staged.
13. Any plan assumption that was wrong.

## Review Checklist For Codex

- Generated edit panel is nested under Discovery subcanvas, not root Task menu.
- Generated Tasks remain absent from root canvas/root `tasksById`/root `taskNodes`.
- Generated title edit sends `workUnit.title` and marks `workUnitMode="customized"`.
- Reset calls `resetGeneratedTaskWorkUnit()` and restores latest managed snapshot.
- Source identity fields are not rendered as editable controls.
- Existing generated run/cancel/observer behavior still passes.
- Docs do not claim failed dispatch diagnostics are done.
- No backend/runtime/dispatcher/scheduler/main `/playground`/`.pi/skills` changes.
