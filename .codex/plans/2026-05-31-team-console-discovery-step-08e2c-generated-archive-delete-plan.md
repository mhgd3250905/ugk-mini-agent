# Team Console Discovery Step 08E2C Plan: Generated Child Archive/Delete UI

Date: 2026-05-31

## Goal

Add a tightly scoped generated child cleanup affordance inside the 5174 Team Console Discovery subcanvas:

- generated child cards can be user-deleted through the existing soft archive route.
- the archived generated child disappears from the Discovery subcanvas catalog.
- the root Discovery card summary updates its generated item counts.
- Discovery subcanvas, root Discovery branch, and root canvas ownership stay intact.

This step means user-facing "delete" with existing soft archive semantics. Do not add hard delete, restore, permanent purge, or a new backend endpoint. Calling this "delete" while using archive is slightly ugly, but it matches the existing root Task menu behavior and avoids inventing a second deletion model.

## Current Baseline

- Repo: `E:\AII\ugk-pi`
- Branch state: `main...origin/main [ahead 6]`
- Latest commit: `af0362a docs(team-console): record task chain validation`
- Current worktree contains local, unstaged Discovery work through Step 08E2B.
- Step 08E2B review status: accepted with one report wording fix only. Browser console evidence should say `favicon.ico 404; no app runtime warning/error`, not `[]`.
- Fresh verification observed during Step 08E2B review:
  - focused App live-data / ExecutionMap UI tests: 156 passed.
  - Team Console API/contract drift tests: 90 passed.
  - Team Console `tsc --noEmit`: passed.
  - Team Console build: passed.
  - Team Console full Vitest: 518 passed.
  - top-level `npx tsc --noEmit`: passed.
  - `git diff --check`: passed.
  - `git diff --cached --stat`: empty.
- Existing dirty boundaries remain:
  - `.pi/skills/anthropics/skill-creator/**` tracked deletions are pre-existing and out of scope.
  - `.pi/skills/skill-creator/` is untracked and out of scope.
  - `.codex/plans/*` are local planning files unless explicitly asked to stage later.
  - public/runtime report artifacts, temp HTML/scripts, `.env`, `.data`, browser screenshots, and unknown `.pi/skills/*/skills-lock.json` are out of scope.
- Staging policy: do not stage and do not commit.

## Must Read First

- `AGENTS.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`
- `.codex/plans/2026-05-31-team-console-discovery-step-08e2a-generated-edit-reset-ui-plan.md`
- `.codex/plans/2026-05-31-team-console-discovery-step-08e2b-failed-dispatch-diagnostics-plan.md`
- `apps/team-console/src/api/team-api.ts`
- `apps/team-console/src/app/use-team-console-live-data.ts`
- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/fixtures/team-fixtures.ts`
- `apps/team-console/src/graph/execution-map.css`
- `apps/team-console/src/tests/app-live-data.test.tsx`
- `apps/team-console/README.md`
- `docs/team-runtime.md`
- `docs/change-log.md`

## Existing Code Facts

- `CanvasTaskGateway.archiveTask(taskId)` already exists.
- `LiveTeamApi.archiveTask(taskId)` already calls `POST /v1/team/tasks/:taskId/archive`.
- `MockTeamApi.archiveTask(taskId)` already marks any matching mock Task `archived: true` and `status: "archived"`.
- `MockTeamApi.listGeneratedTasks(discoveryTaskId)` excludes archived generated Tasks unless `includeArchived` is set.
- `App.archiveTask(task, nodeId?)` is for root Task cleanup. It refreshes root Tasks and closes the root branch. Do not reuse it directly for generated child archive; that would close the Discovery root branch and accidentally treat generated children like root nodes.
- Generated child cards already render inside:

```text
[data-discovery-subcanvas-for="<discoveryTaskId>"] [data-generated-task-id="<generatedTaskId>"]
```

- Existing generated card actions:

```text
data-generated-action="edit"
data-generated-action="reset-workunit"
data-generated-action="run"
data-generated-action="cancel"
data-generated-action="observe-run"
```

- Root Discovery summary is rendered from `discoverySummariesByTaskId`; if generated catalog state changes locally, the summary count must also be updated.
- Generated children must still stay out of root `tasks`, root `tasksById`, root `taskNodes`, and the root canvas.

## Absolute Scope Boundary

Allowed production files:

- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/app/use-team-console-live-data.ts` only if needed to expose a narrow summary/catalog update helper or summary setter.
- `apps/team-console/src/graph/execution-map.css` only for minimal button/confirm styling.

Allowed test files:

- `apps/team-console/src/tests/app-live-data.test.tsx`

Allowed docs/plans:

- `apps/team-console/README.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`

Do not edit backend routes/store/runtime/dispatcher/scheduler files under `src/team/**`. The archive endpoint already exists. If you think backend changes are needed, stop and report.

## Do Not Do

- Do not add a backend endpoint.
- Do not add hard delete or physical file removal.
- Do not add restore/unarchive UI.
- Do not edit `src/team/**`.
- Do not change Discovery dispatch, generated upsert, auto-run scheduler, or `TeamDiscoveryDispatchOutcome`.
- Do not change generated reset/edit semantics except where needed to clear generated child UI state after archive.
- Do not create generated Tasks from diagnostics.
- Do not put generated children into root `tasks`, root `tasksById`, root `taskNodes`, or root canvas cards.
- Do not close the root Discovery branch after archiving a generated child.
- Do not remove or hide the root Discovery Task itself.
- Do not archive/delete blocked diagnostics; diagnostics are not generated Tasks.
- Do not edit main `/playground`.
- Do not touch `.pi/skills/**`, runtime skills, or `skills-lock.json`.
- Do not create plan-unrelated files.
- Do not run broad formatters or convert line endings.
- Do not stage, commit, push, or use `git add -A`.

## Required Behavior

### Generated child action

Inside each generated child card in the Discovery subcanvas, add a delete/archive action:

```html
data-generated-action="archive"
```

Visible label may be `删除` or `归档`; use the same soft archive language as the existing root Task menu. The action must be scoped to the generated child card, not the root Task menu.

Recommended confirmation UI:

```html
data-generated-archive-confirm-for="<generatedTaskId>"
data-generated-action="archive-confirm"
data-generated-action="archive-cancel"
```

Use inline confirmation inside the generated card or a small scoped confirmation block inside the subcanvas. Do not reuse the root trash modal; that modal is for root Agent/Task/Source nodes.

### Archive call and state update

On confirm:

1. Call existing `api.archiveTask(generatedTask.taskId)`.
2. Do not call a new endpoint.
3. Remove the generated child from `generatedTasksByDiscoveryTaskId[sourceDiscoveryTaskId]` if the returned task is archived.
4. Keep the Discovery subcanvas open.
5. Keep the root Discovery Task branch open.
6. Update `discoverySummariesByTaskId[sourceDiscoveryTaskId]` so root summary counts reflect the filtered generated catalog.
7. Clear generated child UI state for the archived child:
   - `discoveryGeneratedEditTaskId` if it points to that generated task.
   - `discoveryGeneratedObserver` if it points to that generated task.
   - selected generated observer file keys for that archived task.
   - task edit draft/warning/saving state for that generated task.
8. Do not remove root Task nodes or root canvas positions.
9. Do not cancel active generated runs in this step. If the generated task has an active run, archive behavior follows the existing endpoint; do not add a new run lifecycle rule unless an existing test proves the endpoint rejects it.

### Error behavior

If `archiveTask()` fails:

- show the existing app error banner.
- keep the generated card visible.
- keep the Discovery subcanvas open.
- clear saving state.
- do not mutate generated catalog state.
- do not close edit/observer state.

### Summary behavior

After successful archive:

- `[data-discovery-subcanvas-for="<discoveryTaskId>"] [data-generated-task-id="<archivedTaskId>"]` is absent.
- sibling generated cards remain visible.
- root Discovery summary generated count drops by one.
- active/stale counts reflect the remaining non-archived generated children.
- blocked dispatch count is preserved; archiving a generated child does not delete dispatch diagnostics.
- root canvas generated title matches remain 0.

## Implementation Tasks

### 1. Tests first

Add failing tests in `apps/team-console/src/tests/app-live-data.test.tsx` before implementation.

Required tests:

1. Mock generated archive happy path:
   - render `<App />` in mock data.
   - open root Discovery Task menu and `Discovery 子画布`.
   - assert two non-archived generated cards are visible.
   - click `[data-generated-task-id="task_generated_vultr"] [data-generated-action="archive"]`.
   - assert confirmation block appears with `data-generated-archive-confirm-for="task_generated_vultr"`.
   - confirm archive.
   - assert `task_generated_vultr` card disappears.
   - assert `task_generated_hetzner` remains.
   - assert the Discovery subcanvas stays open.
   - assert the root Discovery card summary now shows `1 items`, `0 active`, `1 stale`, and still `1 blocked` from Step 08E2B.
   - assert the root canvas still has no `核查 Vultr 公开证据` or `核查 Hetzner 公开证据` root card.

2. Generated archive clears nested generated edit/observer state:
   - open a generated child edit panel or observer for `task_generated_vultr`.
   - archive that same generated child.
   - assert `[data-generated-edit-task-id="task_generated_vultr"]` is absent.
   - assert generated observer/file detail panel for that task is absent if one was opened.
   - assert root Discovery subcanvas remains open.

3. Live generated archive uses existing archive endpoint without root Task ownership:
   - set live data source.
   - mock `/v1/team/tasks` with only the root Discovery task.
   - mock `/v1/team/tasks/:discoveryTaskId/generated-tasks` with non-archived generated tasks.
   - mock `POST /v1/team/tasks/task_generated_vultr/archive` and return `{ task: { ...generatedTask, archived: true, status: "archived" }, warnings: [] }`.
   - click archive/confirm in the subcanvas.
   - assert the fetch call used `POST /v1/team/tasks/task_generated_vultr/archive`.
   - assert root `/v1/team/tasks` is not used to insert or render generated children as root cards.
   - assert root canvas generated title matches remain 0.

4. Generated archive failure path:
   - mock live archive endpoint returning an error payload.
   - assert the error banner text appears.
   - assert the generated card remains visible.
   - assert the Discovery subcanvas remains open.
   - assert generated count is unchanged.

Keep assertions scoped to the Discovery subcanvas/root card. Do not use weak `document.body` text checks where a scoped selector is available.

### 2. Implement scoped generated archive state

In `App.tsx`, add a generated-child-specific archive helper. Do not call the root `archiveTask()` helper for generated children.

Recommended state:

```ts
const [generatedArchiveConfirmTaskId, setGeneratedArchiveConfirmTaskId] = useState<string | null>(null);
const [generatedArchiveSavingByTaskId, setGeneratedArchiveSavingByTaskId] = useState<Record<string, boolean>>({});
```

Recommended helper shape:

```ts
const archiveGeneratedTask = useCallback(async (generatedTask: TeamCanvasTask) => {
  const sourceDiscoveryTaskId = generatedTask.generatedSource?.sourceDiscoveryTaskId;
  if (!sourceDiscoveryTaskId) return;
  setGeneratedArchiveSavingByTaskId((current) => ({ ...current, [generatedTask.taskId]: true }));
  try {
    const api = dataSource === "mock" ? new MockTeamApi() : new LiveTeamApi();
    const response = await api.archiveTask(generatedTask.taskId);
    // Filter from generated catalog only when returned task is archived.
    // Update Discovery summary counts from the remaining generated catalog.
    // Clear edit/observer state for this generated task.
    setError(null);
  } catch (e) {
    setError(errorMessage(e));
  } finally {
    setGeneratedArchiveSavingByTaskId((current) => ({ ...current, [generatedTask.taskId]: false }));
  }
}, [...]);
```

The exact implementation can differ, but it must satisfy the state ownership rules above.

If `use-team-console-live-data.ts` needs to expose a summary setter/helper, keep it narrow. Do not restructure the whole hook.

### 3. Render scoped UI

Add the action and confirmation UI inside the existing generated card action row:

- default state: archive/delete button visible.
- confirmation state: scoped confirm/cancel controls visible for only that generated card.
- saving state: disable relevant buttons and expose a stable state attribute, for example:

```html
data-generated-archive-saving="true|false"
```

Use existing `.discovery-generated-action` styling where possible. Add only minimal CSS for danger/confirm layout.

### 4. Update docs and requirement index

Update:

- `apps/team-console/README.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`

Document that generated child delete is soft archive through existing `POST /v1/team/tasks/:taskId/archive`, not a hard delete.

## Browser Verification

Use the in-app browser or DevTools automation at:

```text
http://127.0.0.1:5174/
```

Required evidence:

- data source: `示例数据` / mock.
- `[data-canvas-kind="discovery"]` count before archive.
- root Discovery card summary before archive: `2 items`, `1 active`, `1 stale`, `1 blocked`.
- open `Discovery 子画布`.
- before archive, `[data-generated-task-id]` count is 2.
- click archive/delete for `task_generated_vultr`, confirm.
- after archive, `[data-generated-task-id]` count is 1.
- `task_generated_vultr` absent from subcanvas.
- `task_generated_hetzner` still visible.
- root Discovery card summary after archive: `1 items`, `0 active`, `1 stale`, `1 blocked`.
- root canvas generated title matches remain 0.
- Discovery subcanvas stays open.
- screenshot path under `runtime/`, do not stage it.
- console issues. The known `/favicon.ico` 404 may be reported as unrelated if it appears; do not claim console is empty if it is not.

If 5174 serves an old bundle, restart the Team Console dev service/container and repeat browser verification. Do not ask the user to run console snippets.

## Final Verification Commands

Run at minimum:

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
git ls-files --eol apps/team-console/src/app/App.tsx apps/team-console/src/app/use-team-console-live-data.ts apps/team-console/src/graph/execution-map.css apps/team-console/src/tests/app-live-data.test.tsx apps/team-console/README.md docs/team-runtime.md docs/change-log.md .codex/plans/2026-05-30-team-console-discovery-requirements.md
git diff --cached --stat
```

If you create a new untracked file unexpectedly, stop and justify it. For new/untracked plan or screenshot files, report them and do not stage.

## Delivery Report Template

Use this exact structure:

1. Modified files.
2. Tests added first and RED failure summary.
3. Generated archive/delete behavior:
   - endpoint used.
   - soft archive semantics.
   - success state update.
   - failure state behavior.
4. State ownership:
   - Discovery subcanvas stays open.
   - generated child removed only from generated catalog.
   - root tasks/root taskNodes/root canvas unchanged.
   - edit/observer state cleanup for archived child.
5. Browser verification evidence for `http://127.0.0.1:5174/`.
6. Verification command results.
7. Diff/EOL hygiene:
   - `git diff --stat`.
   - `git diff --numstat`.
   - `git ls-files --eol ...`.
   - formatter/EOL churn statement.
8. Staging state: `git diff --cached --stat`.
9. Non-goals respected.

Do not stage. Do not commit.

## Review Checklist

- Tests prove old missing archive action behavior RED before implementation.
- Generated child archive uses existing `archiveTask()` adapter and route.
- No backend endpoint or schema change.
- Root `archiveTask()` helper is not reused in a way that closes the Discovery root branch.
- Generated child is removed from `generatedTasksByDiscoveryTaskId`, not from root `tasks`.
- Root Discovery summary counts update after archive.
- Blocked dispatch count remains independent from generated archive.
- Failure path keeps card/subcanvas visible.
- Browser verification uses `http://127.0.0.1:5174/` and reports actual console state.
- No `.pi/skills/**`, `/playground`, `.env`, `.data`, runtime artifacts, staging, or commit.
