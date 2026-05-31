# Team Console Discovery Step 08D Plan: Generated Task Run Controls And Observer

## Goal

Make generated Tasks inside the 5174 Discovery subcanvas behave like real Tasks for the first operational slice:

- run a generated Task from its subcanvas card.
- cancel an active generated Task run when present.
- open the latest generated Task run observer from inside the Discovery subcanvas.
- show Worker / Checker process data and attempt file rows using the existing Task run observer pipeline.
- open generated run file details using the existing file-detail node pattern.

This step must not put generated Tasks into the root canvas. It also must not add generated Task edit/archive/reset or failed dispatch diagnostics; those are Step 08E.

## Current Baseline

- Repo: `E:\AII\ugk-pi`
- Branch state before this plan: `main...origin/main [ahead 6]`
- Latest commit before this Discovery series: `af0362a docs(team-console): record task chain validation`
- Completed Discovery UI steps:
  - Step 08A: Team Console data/API seam added `generatedTasksByDiscoveryTaskId`, `discoverySummariesByTaskId`, and generated child run summaries.
  - Step 08B: root Discovery card identity and summary row.
  - Step 08C: root Discovery Task menu has `Discovery 子画布`; subcanvas catalog panel displays non-archived generated children with stable data attrs and latest run status.
- Codex Step 08C review verification:
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx src/tests/execution-map-ui.test.tsx`: 145 passed.
  - `npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts`: 13 passed.
  - Team Console `tsc`, Team Console build, Team Console full tests, top-level `npx tsc --noEmit`, and `git diff --check` passed.
  - Browser verification at `http://127.0.0.1:5174/`: one Discovery root, one subcanvas, two generated child cards, zero generated child root cards.
- Current dirty boundaries:
  - `.pi/skills/anthropics/skill-creator/**` tracked deletions are pre-existing and out of scope.
  - `.pi/skills/skill-creator/` is untracked and out of scope.
  - `.codex/plans/*` are local plan artifacts.
  - Runtime reports, screenshots, temp HTML, `generate_report.py`, `generate_report_v2.py`, and `report_template.html` are out of scope.

## Must Read First

- `AGENTS.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`
- `.codex/plans/2026-05-31-team-console-discovery-step-08c-subcanvas-catalog-plan.md`
- `apps/team-console/README.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/app/use-task-branch-stack.ts`
- `apps/team-console/src/app/use-team-console-live-data.ts`
- `apps/team-console/src/graph/ExecutionMap.tsx`
- `apps/team-console/src/graph/execution-map.css`
- `apps/team-console/src/fixtures/team-fixtures.ts`
- `apps/team-console/src/tests/app-live-data.test.tsx`
- `apps/team-console/src/tests/app-run-observer.test.tsx`
- `apps/team-console/src/tests/app-run-observer-detail.test.tsx`

## Absolute Scope Boundary

Allowed production files:

- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/app/use-task-branch-stack.ts`
- `apps/team-console/src/graph/execution-map.css`

Allowed test files:

- `apps/team-console/src/tests/app-live-data.test.tsx`
- `apps/team-console/src/tests/app-run-observer.test.tsx` only if shared observer rendering is extracted and existing observer coverage needs a small assertion update.
- `apps/team-console/src/tests/app-run-observer-detail.test.tsx` only if shared observer behavior requires a small existing test adjustment.

Allowed docs:

- `apps/team-console/README.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`

Do not edit backend code, API routes, fixtures, generated Task store/runtime, dispatcher, scheduler, `ExecutionMap.tsx`, `atlas-geometry.ts`, or `.pi/skills/**` unless you stop and get approval first. Current `MockTeamApi.createTaskRun()` already works for generated Tasks because generated Tasks are in `mockCanvasTasks`; do not invent duplicate mock APIs.

## Do Not Do

- Do not render generated Tasks as root canvas nodes.
- Do not put generated Tasks into root `tasks`, root `tasksById`, root `taskNodes`, or root `TaskBranchRoot`.
- Do not change backend route behavior or TaskStore/runtime semantics.
- Do not add generated Task edit, archive/delete, reset-to-managed, or dispatch error UI in this step.
- Do not add new API endpoints.
- Do not modify `.pi/skills/**`, runtime skills, or `skills-lock.json`.
- Do not modify the main `/playground` product UI.
- Do not create a second run observer data-fetching pipeline. Reuse `listTaskRunAttempts()` and `readTaskRunAttemptFile()` through the existing `taskRunObserverByRunId` mechanism.
- Do not suppress warnings broadly.
- Do not run broad formatters or convert line endings.
- Do not stage, commit, push, or use `git add -A`.

## Data Ownership Rules

Generated children are real `TeamCanvasTask` objects but they are not root canvas nodes. Step 08D must model them as nested Discovery subcanvas state, not as root task branches.

Recommended state shape:

```ts
export type TaskBranchGeneratedObserverState = {
  taskId: string;
  runId: string;
  selectedFileKeys?: string[];
};

export type TaskBranchState = {
  nodeId: string;
  taskId: string;
  detailMode: TaskBranchDetailMode | null;
  observedRunId?: string;
  selectedFileKeys?: string[];
  discoveryGeneratedObserver?: TaskBranchGeneratedObserverState;
};
```

Rules:

- `detailMode: "discovery-subcanvas"` keeps the root Discovery subcanvas open.
- `discoveryGeneratedObserver` is nested under that root Discovery branch and points at a generated child task/run.
- Do not switch the root branch to `detailMode: "run-observer"` for generated child observer; that mode remains for root Task observer.
- `readStoredTaskBranches()` must accept old stored state where `discoveryGeneratedObserver` is absent.
- If persisted generated observer state is malformed, ignore only that nested observer object; do not drop the whole root branch.

Add an in-`App.tsx` derived map:

```ts
const generatedTasksById = useMemo(() => new Map(
  Object.values(generatedTasksByDiscoveryTaskId).flat().map((task) => [task.taskId, task]),
), [generatedTasksByDiscoveryTaskId]);
```

Use this map for generated observer lookup. Do not use root `tasksById` for generated children.

## Required UI Behavior

Inside each generated card in `[data-discovery-subcanvas-for="<discoveryTaskId>"]`:

1. Show a run button for the generated Task.
   - Use existing `runTask(generatedTask)`.
   - Disable when `taskRunSavingByTaskId[generatedTask.taskId]` is true, when the generated Task has an active run, or when `generatedTask.status !== "ready"`.
   - Do not disable merely because `generatedSource.itemStatus === "stale"`; stale Tasks are not auto-run, but they are still real Tasks for manual operation.
2. Show a stop button when the generated Task has an active run.
   - Use existing `cancelTaskRun(generatedTask, activeRun)`.
3. Show a latest run summary button when a latest generated run exists.
   - Click toggles `branch.discoveryGeneratedObserver`.
   - The Discovery subcanvas must remain open.
   - The root Task action menu must remain open.
4. Add stable data attrs for generated card operation:

```html
data-generated-task-id="<generatedTaskId>"
data-generated-item-status="active|stale"
data-generated-workunit-mode="managed|customized"
data-generated-run-status="<latest status or none>"
```

5. Add stable action selectors, for example:

```html
data-generated-action="run"
data-generated-action="cancel"
data-generated-action="observe-run"
```

6. Add a generated observer child panel sourced from the Discovery subcanvas panel, not the root Task menu:

```text
sourceId: `discovery-subcanvas-${rootBranch.nodeId}`
panel id: `generated-run-observer-${rootBranch.nodeId}-${generatedTaskId}`
```

7. The generated observer panel must identify the generated Task:

```html
data-generated-observer-task-id="<generatedTaskId>"
data-generated-observer-run-id="<runId>"
```

8. The generated observer panel should render the same Worker / Checker process nodes and file sections as normal root Task run observer.
9. Clicking a generated observer file row opens a file detail child panel sourced from the generated observer panel.
10. Closing/toggling the generated observer must not close the Discovery subcanvas.

## Implementation Guidance

### 1. Write failing tests first

Add focused tests before implementation.

Required tests:

- Mock generated run and observer:
  - Render `<App />` in mock mode.
  - Open `发现云服务候选`.
  - Open `Discovery 子画布`.
  - Find `task_generated_vultr` inside the subcanvas.
  - Click its generated run button.
  - Assert the card `data-generated-run-status` becomes `completed`.
  - Assert root canvas still has zero root buttons/cards named `核查 Vultr 公开证据`.
  - Click the generated latest run summary button.
  - Assert a panel with `data-generated-observer-task-id="task_generated_vultr"` and `data-generated-observer-run-id` exists.
  - Assert Worker / Checker process nodes render.
  - Assert file rows include `worker-output-001.md`, `checker-verdict-001.json`, and `accepted-result.md`.
  - Click `worker-output-001.md`.
  - Assert file detail renders content containing `Mock worker output for 核查 Vultr 公开证据`.

- Subcanvas remains open while observing:
  - After opening generated observer, assert `[data-discovery-subcanvas-for="task_discovery_cloud_vendors"]` still exists.
  - Toggle the generated run summary again and assert only the generated observer panel closes.

- Active generated run state:
  - Use live fetch mock pattern already present in `app-live-data.test.tsx`.
  - Return `mockDiscoveryRootTask`, non-archived generated children, and a running run for `task_generated_vultr`.
  - Open subcanvas.
  - Assert generated run button is disabled or labeled running, stop button is visible/enabled, and observe action opens generated observer.
  - Assert observer attempt request URL includes `/task-runs/<runId>/tasks/task_generated_vultr/attempts`.

- Stored state compatibility:
  - Old stored branches without `discoveryGeneratedObserver` still restore the subcanvas.
  - Stored malformed `discoveryGeneratedObserver` is ignored without dropping the root Discovery branch.

Run existing root observer tests after implementation. If root observer behavior changes, that is a regression unless the change is explicitly covered and justified.

### 2. Implement generated run controls

In `App.tsx`:

- Derive `generatedTasksById`.
- In the subcanvas card render block:
  - compute `runs`, `latestGeneratedRun`, `activeGeneratedRun`, `runSaving`.
  - add run, stop, and latest run observer buttons.
  - do not call `openTaskEditDraft`, `archiveTask`, or root branch observer logic for generated children.
- Update `taskChildBranchPanels` dependencies carefully. Do not omit `generatedTasksById` or new state fields.

### 3. Extend observer targets and panel rendering without duplicating a second pipeline

Update `runObserverTargets` so it includes:

- existing root Task observers (`detailMode === "run-observer"`).
- generated child observers from `branch.discoveryGeneratedObserver`.

The effect that calls `listTaskRunAttempts()` / `readTaskRunAttemptFile()` should remain a single effect over `runObserverTargets`.

For rendering:

- Prefer extracting a small local helper inside `taskChildBranchPanels` or nearby in `App.tsx` that can push observer panels for both root and generated runs.
- Keep root Task observer output equivalent. Existing root observer tests must still pass.
- Generated observer panels should use `sourceId: discoverySubcanvasPanelId`, while root observer panels keep `sourceId: taskMenuPanelId(branch.nodeId)`.
- File detail panels for generated observer should use source id of the generated observer panel.

Do not extract a broad new component file unless the local helper becomes unreadable. This step should stay reviewable in one pass.

### 4. Add scoped CSS

Use `execution-map.css` for compact generated card action styling only:

- action row.
- run/stop/observer buttons inside generated cards.
- selected/observed card state if helpful.

Do not restyle root Task cards, normal observer panels, or the whole child panel system.

### 5. Update docs

Update factual docs only:

- `apps/team-console/README.md`: Discovery subcanvas generated children now support run/cancel and latest run observer/file details.
- `docs/team-runtime.md`: record Step 08D behavior and boundary.
- `docs/change-log.md`: add `2026-05-31 — Team Console Discovery generated Task observer`.
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`: mark Step 08D completed locally only after implementation and verification.

Do not claim generated child edit/archive/reset or dispatch diagnostics are complete.

## Browser Verification Required

Use the real Team Console entry:

```text
http://127.0.0.1:5174/
```

Use mock / 示例数据 for deterministic browser evidence.

Required actions:

1. Clear local storage or reload cleanly enough that no old open branch state fakes the result.
2. Click `发现云服务候选`.
3. Click `Discovery 子画布`.
4. In the `task_generated_vultr` card, click generated run.
5. Open its latest generated run observer.
6. Click `worker-output-001.md` file row.

Required measured evidence:

- `[data-canvas-kind="discovery"]` count.
- `[data-discovery-subcanvas-for="task_discovery_cloud_vendors"]` count.
- panel `[data-generated-task-id]` count.
- `task_generated_vultr` card attrs after run, including `data-generated-run-status`.
- root canvas matches for `核查 Vultr 公开证据` and `核查 Hetzner 公开证据` remain 0.
- `[data-generated-observer-task-id="task_generated_vultr"]` count.
- Worker / Checker process node counts inside generated observer.
- generated observer file rows count.
- generated file detail panel count and visible content sample.
- rects:
  - Discovery subcanvas panel.
  - generated observer panel.
  - file detail panel.
- screenshot path under `runtime/`, for example:

```text
runtime/team-console-step08d-generated-observer.png
```

The screenshot is runtime output and must not be staged.

If browser automation is unavailable, report it as a limitation. Do not hand manual verification back to the user when automation is available.

## Verification Commands

Focused checks:

```powershell
npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx src/tests/app-run-observer.test.tsx src/tests/app-run-observer-detail.test.tsx
npm --prefix apps/team-console test -- --run src/tests/execution-map-ui.test.tsx src/tests/team-contract-drift.test.ts
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
git diff --stat -- apps/team-console/src/app/App.tsx apps/team-console/src/app/use-task-branch-stack.ts apps/team-console/src/graph/execution-map.css apps/team-console/src/tests/app-live-data.test.tsx apps/team-console/src/tests/app-run-observer.test.tsx apps/team-console/src/tests/app-run-observer-detail.test.tsx apps/team-console/README.md docs/team-runtime.md docs/change-log.md .codex/plans/2026-05-30-team-console-discovery-requirements.md
git diff --numstat -- apps/team-console/src/app/App.tsx apps/team-console/src/app/use-task-branch-stack.ts apps/team-console/src/graph/execution-map.css apps/team-console/src/tests/app-live-data.test.tsx apps/team-console/src/tests/app-run-observer.test.tsx apps/team-console/src/tests/app-run-observer-detail.test.tsx apps/team-console/README.md docs/team-runtime.md docs/change-log.md .codex/plans/2026-05-30-team-console-discovery-requirements.md
git ls-files --eol apps/team-console/src/app/App.tsx apps/team-console/src/app/use-task-branch-stack.ts apps/team-console/src/graph/execution-map.css apps/team-console/src/tests/app-live-data.test.tsx apps/team-console/src/tests/app-run-observer.test.tsx apps/team-console/src/tests/app-run-observer-detail.test.tsx apps/team-console/README.md docs/team-runtime.md docs/change-log.md .codex/plans/2026-05-30-team-console-discovery-requirements.md
```

If you create a new test file, also run:

```powershell
Select-String -LiteralPath <new-file> -Pattern '[ \t]+$'
git ls-files --eol --others --exclude-standard <new-file>
```

## Stop Conditions

Stop and report if:

- Generated observer requires putting generated Tasks into root `tasksById` or root `taskNodes`.
- Existing root run observer tests start failing and the fix requires a broad rewrite.
- You need backend route/store/runtime changes.
- Mock generated run attempts/files are not available from `MockTeamApi`.
- Browser verification cannot be automated.
- Diff size suggests formatter or EOL churn.

## Commit Policy

No stage, no commit, no push unless explicitly authorized. Do not use `git add -A`.

Suggested commit message if later approved:

```text
feat(team-console): add discovery generated task observer
```

## Delivery Report Template

Reply with:

1. Modified files.
2. UI/data behavior changes.
3. State/data ownership details proving generated children did not enter root canvas state.
4. Tests added/updated and what old missing behavior they catch.
5. Browser verification evidence with exact URL, selectors, counts, measured rects, and screenshot path.
6. Docs updated.
7. Explicit non-goals not implemented.
8. Verification commands and pass/fail results.
9. Diff stat/numstat summary and EOL/formatter churn status.
10. `git diff --cached --stat` result proving nothing is staged.
11. Any plan assumption that was wrong.

## Review Checklist For Codex

- Generated run/cancel uses existing Task run API adapter and does not create a duplicate API path.
- Generated observer uses `generatedTasksById` / `generatedTasksByDiscoveryTaskId`, not root `tasksById`.
- Root Task observer behavior and tests still pass.
- Generated observer attempts/files request uses generated `taskId`.
- File detail works for generated run files.
- Discovery subcanvas remains open while generated observer/file detail opens.
- Generated Tasks are still absent from root canvas.
- Docs do not claim edit/archive/reset/dispatch diagnostics are complete.
- No `.pi/skills`, backend, runtime, or main `/playground` changes.
