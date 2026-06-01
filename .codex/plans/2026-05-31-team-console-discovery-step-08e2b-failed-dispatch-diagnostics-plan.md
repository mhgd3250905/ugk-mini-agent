# Team Console Discovery Step 08E2B Plan: Failed Dispatch Diagnostics

Date: 2026-05-31

## Goal

Surface failed Discovery dispatcher outcomes that already exist in `TeamAttemptMetadata.discoveryDispatch[]` inside the 5174 Team Console:

- root Discovery card summary should show a compact failed/blocked dispatch count.
- Discovery subcanvas should show the latest blocked dispatch item diagnostics with item id and error.
- generated child Tasks must still stay out of root `tasks`, root `taskNodes`, and the root canvas.

This step is only a read/display pass over existing metadata. Do not add backend runtime behavior, routes, stores, scheduler changes, or new dispatcher logic. We are not building a second observability product here; keep it tight or the diff will turn into soup again.

## Current Baseline

- Repo: `E:\AII\ugk-pi`
- Latest commit: `af0362a docs(team-console): record task chain validation`
- Current worktree contains local, unstaged Discovery work through Step 08E2A plus review fixes.
- Recently verified by Codex after 08E2A review fixes:
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx`: 41 passed.
  - `npm --prefix apps/team-console test -- --run src/tests/team-api.test.ts src/tests/team-contract-drift.test.ts`: 90 passed.
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
- `.codex/plans/2026-05-31-team-console-discovery-step-08e2a-review-fixes-plan.md`
- `apps/team-console/src/api/team-api.ts`
- `apps/team-console/src/api/team-types.ts`
- `apps/team-console/src/app/use-team-console-live-data.ts`
- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/graph/ExecutionMap.tsx`
- `apps/team-console/src/graph/execution-map.css`
- `apps/team-console/src/fixtures/team-fixtures.ts`
- `apps/team-console/src/tests/app-live-data.test.tsx`
- `apps/team-console/src/tests/execution-map-ui.test.tsx`
- `apps/team-console/README.md`
- `docs/team-runtime.md`
- `docs/change-log.md`

## Existing Code Facts

- `TeamAttemptMetadata.discoveryDispatch?: TeamDiscoveryDispatchOutcome[]` already exists in both backend and Team Console API types.
- `TeamDiscoveryDispatchOutcome.status` is `"created" | "updated" | "blocked" | "stale_marked"`.
- Failed dispatcher outcomes for this UI step mean `status === "blocked"`.
- Existing Canvas Task API adapter already has:

```ts
listTaskRuns(taskId): Promise<TeamRunState[]>
listTaskRunAttempts(runId, taskId): Promise<TeamAttemptMetadata[]>
```

- `useTeamConsoleLiveData()` already loads root Discovery generated catalog and produces `discoverySummariesByTaskId`.
- `ExecutionMap` already renders root Discovery summary from `discoverySummariesByTaskId`.
- `App` already renders Discovery subcanvas cards from `generatedTasksByDiscoveryTaskId`.

## Absolute Scope Boundary

Allowed production files:

- `apps/team-console/src/app/use-team-console-live-data.ts`
- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/graph/ExecutionMap.tsx`
- `apps/team-console/src/graph/execution-map.css`
- `apps/team-console/src/fixtures/team-fixtures.ts`

Allowed test files:

- `apps/team-console/src/tests/app-live-data.test.tsx`
- `apps/team-console/src/tests/execution-map-ui.test.tsx`

Allowed docs/plans:

- `apps/team-console/README.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`

Do not edit backend routes/store/runtime/dispatcher/scheduler files under `src/team/**`. The metadata already exists. If you think backend changes are needed, stop and report; do not improvise.

## Do Not Do

- Do not add new backend endpoints.
- Do not edit `src/team/**`.
- Do not change `TeamDiscoveryDispatchOutcome` schema.
- Do not create or rerun Discovery dispatcher behavior.
- Do not create generated Tasks from diagnostics.
- Do not archive/delete generated Tasks.
- Do not touch generated child edit/reset code except for necessary adjacency in `App.tsx`.
- Do not put generated children into root `tasks`, root `tasksById`, root `taskNodes`, or root canvas cards.
- Do not expose raw `itemPayload` or large raw role output in the UI.
- Do not suppress console warnings broadly.
- Do not run broad formatters or convert line endings.
- Do not edit main `/playground`.
- Do not touch `.pi/skills/**`.
- Do not stage, commit, push, or use `git add -A`.

## Required Behavior

### Data layer

Extend Team Console Discovery summary state to include failed dispatch diagnostics derived from the latest Discovery root Canvas Task run:

Recommended additions:

```ts
export interface TeamDiscoveryDispatchDiagnostic {
  itemId: string;
  status: "blocked";
  error: string | null;
  createdAt: string;
  runId: string;
  attemptId: string;
}

export interface TeamDiscoverySummary {
  generatedTaskCount: number;
  activeGeneratedTaskCount: number;
  staleGeneratedTaskCount: number;
  runningGeneratedRunCount: number;
  failedDispatchCount: number;
  latestDispatchRunId?: string;
  latestDispatchAttemptId?: string;
}
```

You may keep diagnostics in a sibling state such as `discoveryDispatchDiagnosticsByTaskId` if that is cleaner for `App.tsx`; root card only needs the count.

Load strategy:

1. For each root Discovery task, use existing `listTaskRuns(discoveryTaskId)` result.
2. Pick the latest Discovery root run with the same `selectLatestRun()` helper pattern already used in the file.
3. Call existing `listTaskRunAttempts(latestRun.runId, discoveryTaskId)`.
4. Pick the latest attempt, preferably by `createdAt` / `updatedAt` / array order consistently with existing code.
5. Count and expose `attempt.discoveryDispatch.filter(outcome => outcome.status === "blocked")`.
6. If there is no run, no attempts, old attempt metadata, or malformed/missing `discoveryDispatch`, count is 0 and diagnostics list is empty.
7. If `listTaskRunAttempts()` fails for diagnostics, do not drop generated catalog and do not close UI. Keep diagnostics as 0 or last-known-safe empty for this load; optionally set a narrow error only if existing data load patterns require it.

Do not make `discoverySummariesByTaskId` read root `tasksById` as a source of generated children. Generated children still come only from generated catalog.

### Root card UI

In `ExecutionMap`, root Discovery card summary should expose the failed dispatch count.

Required observable:

```html
data-discovery-failed-dispatch-count="<number>"
```

Attach it either to the root Discovery task node or to the summary row. Prefer the root Discovery task node if it keeps tests simple.

Visible summary:

- If count is 0, the summary can omit the label or show `0 blocked`; choose the least noisy option.
- If count is > 0, show a compact label such as `1 blocked` or `1 dispatch failed`.

Normal Task cards must not show Discovery failed dispatch UI.

### Discovery subcanvas UI

Inside the Discovery subcanvas panel, show latest blocked dispatch diagnostics for that Discovery root when count > 0.

Required observable:

```html
data-discovery-dispatch-diagnostics-for="<discoveryTaskId>"
data-dispatch-blocked-count="<number>"
data-dispatch-item-id="<itemId>"
```

Recommended visible content:

- short heading: `派发阻塞` or `Dispatch blocked`
- count
- each blocked item id
- concise error text if present

Rules:

- Show only blocked outcomes, not created/updated/stale_marked successes.
- Escape error text through React rendering; do not use raw HTML.
- Do not show raw `itemPayload`.
- Do not make each diagnostic a generated Task card.
- Do not add run/cancel/edit/reset actions to diagnostics.

## Implementation Tasks

### 1. Tests first

Add focused failing tests before implementation.

In `apps/team-console/src/tests/app-live-data.test.tsx`:

1. Live data seam test:
   - mock `/v1/team/tasks` with a root Discovery task.
   - mock `/v1/team/tasks/:taskId/generated-tasks` with existing generated tasks.
   - mock `/v1/team/tasks/:taskId/runs` with one Discovery root run.
   - mock `/v1/team/task-runs/:runId/tasks/:taskId/attempts` with one attempt containing:

```ts
discoveryDispatch: [
  { itemId: "vultr", status: "created", generatedTaskId: "task_generated_vultr", createdAt: "..." },
  { itemId: "digitalocean", status: "blocked", error: "dispatcher output parse error: invalid JSON", createdAt: "..." },
]
```

   - assert `discoverySummariesByTaskId[discoveryTaskId].failedDispatchCount === 1`.
   - assert diagnostics expose `digitalocean` and the error text, but not created-only `vultr` as a failed diagnostic.
   - assert the attempts endpoint was called.

2. Live UI test:
   - render `<App />` with live fetch mocks.
   - assert root Discovery card has `data-discovery-failed-dispatch-count="1"`.
   - open `Discovery 子画布`.
   - assert `[data-discovery-dispatch-diagnostics-for="<taskId>"]` exists with `data-dispatch-blocked-count="1"`.
   - assert `[data-dispatch-item-id="digitalocean"]` exists and contains the error.
   - assert generated children still do not render as root canvas cards.

3. Missing/old metadata test:
   - attempts response has no `discoveryDispatch` or an empty array.
   - assert failed count is 0 and diagnostics block is absent.
   - subcanvas still opens and generated catalog still renders.

In `apps/team-console/src/tests/execution-map-ui.test.tsx`:

4. Root summary rendering test:
   - pass `discoverySummariesByTaskId` with `failedDispatchCount: 2`.
   - assert only Discovery root card has failed dispatch count/text.
   - assert normal Task card has no `data-discovery-failed-dispatch-count`.

Use existing helpers and keep tests exact. Do not accept weak assertions like "some blocked text exists somewhere in body".

### 2. Implement the data seam

- Extend `TeamDiscoverySummary`.
- Add a typed helper to summarize blocked dispatch outcomes from latest attempt metadata.
- Reuse existing `listTaskRuns()` and `listTaskRunAttempts()`; do not add an API adapter method.
- Ensure initial mock mode can show at least one blocked diagnostic in the 5174 sample if needed for browser verification. This can be done by seeding mock task run/attempt metadata in `team-fixtures.ts`; keep it minimal.
- Keep generated Tasks out of root `tasks`.

### 3. Implement root/subcanvas UI

- Pass the new summary field to `ExecutionMap`.
- Render compact failed dispatch count only for root Discovery card.
- Render the blocked item diagnostics block inside Discovery subcanvas.
- Add minimal CSS only if layout needs it; no visual redesign.

### 4. Update docs

Update:

- `apps/team-console/README.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`

Mark Step 08E2B completed locally only after implementation and verification pass.

## Focused Verification

Run after implementation:

```powershell
npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx src/tests/execution-map-ui.test.tsx
```

Also run API/contract drift because shared frontend API metadata shapes are involved:

```powershell
npm --prefix apps/team-console test -- --run src/tests/team-api.test.ts src/tests/team-contract-drift.test.ts
```

## Final Verification

```powershell
npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json
npm --prefix apps/team-console run build
npm --prefix apps/team-console test
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
git ls-files --eol apps/team-console/src/app/use-team-console-live-data.ts apps/team-console/src/app/App.tsx apps/team-console/src/graph/ExecutionMap.tsx apps/team-console/src/graph/execution-map.css apps/team-console/src/fixtures/team-fixtures.ts apps/team-console/src/tests/app-live-data.test.tsx apps/team-console/src/tests/execution-map-ui.test.tsx apps/team-console/README.md docs/team-runtime.md docs/change-log.md .codex/plans/2026-05-30-team-console-discovery-requirements.md
git diff --cached --stat
```

If you do not touch one of the listed files, omit it from the EOL command. If you create any new untracked file, run:

```powershell
Select-String -LiteralPath <new-file> -Pattern '[ \t]+$'
git ls-files --eol --others --exclude-standard <new-file>
```

## Browser Verification

Use the real local Team Console entry:

```text
http://127.0.0.1:5174/
```

Required evidence:

- data source: mock/sample unless live is specifically needed.
- `[data-canvas-kind="discovery"]` count.
- root Discovery card `data-discovery-failed-dispatch-count`.
- visible root summary failed/blocked label text.
- open `Discovery 子画布`.
- `[data-discovery-subcanvas-for="task_discovery_cloud_vendors"]` count.
- `[data-discovery-dispatch-diagnostics-for="task_discovery_cloud_vendors"]` count.
- `data-dispatch-blocked-count`.
- visible blocked item id and error text.
- panel `[data-generated-task-id]` count still equals non-archived generated children.
- root canvas generated title matches remains 0.
- screenshot path under `runtime/`; do not stage it.
- console issues: report warn/error list.

If 5174 serves old code, restart the Team Console dev service/container and state that you did so. Do not ask the user to manually run browser console snippets.

## Delivery Report Template

Reply with:

1. Modified files.
2. Tests added first and RED failure summary.
3. Data seam behavior:
   - how latest root Discovery run/attempt is selected.
   - what counts as failed dispatch.
   - what happens with missing/old metadata.
4. UI behavior:
   - root card failed count.
   - subcanvas diagnostics.
5. State ownership:
   - generated children still only from generated catalog.
   - no root tasks/root taskNodes/root canvas injection.
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
   - no backend/runtime/store/route changes
   - no dispatcher/scheduler changes
   - no generated archive/delete
   - no main `/playground`
   - no `.pi/skills/**`
   - no stage/commit
