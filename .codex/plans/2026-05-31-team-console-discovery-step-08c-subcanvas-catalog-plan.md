# Team Console Discovery Step 08C Plan: Subcanvas Catalog Panel

## Goal

Build the first 5174 Discovery subcanvas slice: a Discovery-only action from a root Discovery Task menu opens an independent child panel that displays the generated Task catalog for that Discovery root.

This step is deliberately narrow. It should make generated Tasks visible in a dedicated Discovery child panel without putting them on the root canvas and without adding generated Task editing, run/cancel, observer, or file-detail actions yet. Those belong in Step 08D.

## Current Baseline

- Repo: `E:\AII\ugk-pi`
- Branch state before this plan: `main...origin/main [ahead 6]`
- Latest commit before this Discovery series: `af0362a docs(team-console): record task chain validation`
- Stable tag already pushed earlier: `stable/team-console-task-chain-2026-05-30`
- Completed Discovery steps:
  - Step 01/01A: shared contract and naming.
  - Step 02: backend validation and TaskStore generated Task semantics.
  - Step 03: routes and generated catalog API.
  - Step 04: Discovery run output validation and persistence.
  - Step 05: Discovery dispatcher role contract.
  - Step 06: generated Task upsert/rerun reuse.
  - Step 07: generated Task auto-run scheduler.
  - Step 08A: Team Console API/data seam.
  - Step 08B: root Discovery card identity and summary row.
- Latest known Step 08B verification by Codex:
  - focused Team Console tests passed.
  - Team Console `tsc`, Team Console build, Team Console full Vitest, top-level `npx tsc --noEmit`, and `git diff --check` passed.
  - Browser verification at `http://127.0.0.1:5174/` in mock mode found one root Discovery card and zero generated child root cards.
- Current dirty boundaries:
  - `.pi/skills/anthropics/skill-creator/**` tracked deletions are pre-existing and out of scope.
  - `.pi/skills/skill-creator/` is untracked and out of scope.
  - `.codex/plans/*` are local plan artifacts.
  - Runtime reports, screenshots, temp HTML, `generate_report.py`, `generate_report_v2.py`, and `report_template.html` are out of scope.

## Must Read First

- `AGENTS.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`
- `.codex/plans/2026-05-31-team-console-discovery-step-08b-root-summary-surface-plan.md`
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
- `apps/team-console/src/tests/execution-map-ui.test.tsx`

## Absolute Scope Boundary

This step may modify only the Team Console UI/data display layer and docs for this UI slice:

- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/app/use-task-branch-stack.ts`
- `apps/team-console/src/graph/execution-map.css`
- `apps/team-console/src/tests/app-live-data.test.tsx`
- `apps/team-console/src/tests/execution-map-ui.test.tsx`
- `apps/team-console/src/tests/app.test.tsx` only if an existing assertion needs a small update from new visible text.
- `apps/team-console/README.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`

If you believe another file is required, stop and report before editing. Do not improvise. That is how this kind of UI diff turns into soup.

## Do Not Do

- Do not modify backend routes, stores, validation, runtime runner, dispatcher, scheduler, or Team worker.
- Do not modify `.pi/skills/**`, including runtime skills and `skills-lock.json`.
- Do not modify the main `/playground` product UI.
- Do not render generated child Tasks as root canvas cards.
- Do not add generated Task edit, run/cancel, delete/archive, observer, attempt file, or file-detail actions in this step.
- Do not reuse root `taskNodes` or root `tasksById` for generated children. Generated children come from `generatedTasksByDiscoveryTaskId`.
- Do not broaden the persisted task branch state beyond the single new detail mode needed here.
- Do not restyle the whole ExecutionMap. Add scoped Discovery subcanvas classes only.
- Do not run broad formatters or convert line endings.
- Do not stage, commit, push, or use `git add -A`.

## Known Implementation Anchors

- `App.tsx` already destructures `discoverySummariesByTaskId` from `useTeamConsoleLiveData()`, but Step 08C also needs `generatedTasksByDiscoveryTaskId`.
- `tasksById` intentionally contains root Tasks only. Generated child Tasks are in `generatedTasksByDiscoveryTaskId[discoveryTaskId]`.
- `use-task-branch-stack.ts` currently defines:

```ts
export type TaskBranchDetailMode = "leader-chat" | "edit" | "run-observer";
```

Add one mode, for example `"discovery-subcanvas"`, and update `readStoredTaskBranches()` in `App.tsx` to accept it.

- `taskBranchPanelItems` in `App.tsx` renders the root Task action menu. Add the Discovery-only toggle button there when `task.canvasKind === "discovery"`.
- `taskChildBranchPanels` in `App.tsx` already feeds child panels to `ExecutionMap`. Add the Discovery subcanvas panel there with `sourceId: taskMenuPanelId(branch.nodeId)`.
- `ExecutionMap.tsx` already supports `taskChildBranchPanels`, so this step should not create a second panel system.
- `execution-map.css` already has general child branch panel styles such as `.emap-task-child-branch-shell`, `.task-leader-branch`, `.task-action-branch`, and observer styles. Add scoped classes such as `.discovery-subcanvas-panel`, `.discovery-generated-card`, `.discovery-generated-card.is-stale`.
- `team-fixtures.ts` already exports:
  - `mockDiscoveryRootTask`
  - `mockDiscoveryGeneratedTasks`
  - active child `task_generated_vultr`
  - stale child `task_generated_hetzner`
  - archived child `task_generated_archived_ovh`

## User-Visible Behavior Required

1. Opening a root Discovery Task action menu shows a Discovery-only action button, for example `Discovery 子画布`.
2. Normal root Tasks do not show this button.
3. Clicking the button toggles a child panel connected from the Task action menu branch.
4. The panel has a stable selector:

```html
data-discovery-subcanvas-for="<discoveryTaskId>"
```

5. The panel lists non-archived generated children from `generatedTasksByDiscoveryTaskId[discoveryTaskId]`.
6. Each generated child card has stable selectors:

```html
data-generated-task-id="<taskId>"
data-generated-item-status="active|stale"
data-generated-workunit-mode="managed|customized"
data-generated-run-status="<latest run status or none>"
```

7. The mock Discovery panel displays at least:
   - `核查 Vultr 公开证据`, `active`, `managed`, latest run status if present.
   - `核查 Hetzner 公开证据`, `stale`, `customized`, latest run status if present.
8. Generated child Tasks remain absent from the root canvas node set.
9. Empty generated catalog should render an empty state inside the panel, not crash.
10. If the subcanvas is open and the user clicks the toggle again, the panel closes and the menu remains usable.

## Execution Steps

### 1. Write failing tests first

Update focused tests before implementation.

Expected test coverage:

- App mock interaction:
  - Render `<App />` with mock data.
  - Click root Discovery card `发现云服务候选`.
  - Assert the Task action menu contains a Discovery subcanvas toggle.
  - Click the toggle.
  - Assert `[data-discovery-subcanvas-for="task_discovery_cloud_vendors"]` exists.
  - Assert generated cards for `task_generated_vultr` and `task_generated_hetzner` exist inside that panel.
  - Assert `task_generated_archived_ovh` does not appear.
  - Assert root canvas still has zero root buttons/cards named `核查 Vultr 公开证据` or `核查 Hetzner 公开证据`.

- Normal Task interaction:
  - Open a normal Task action menu.
  - Assert the Discovery subcanvas toggle is absent.

- Live data interaction:
  - Reuse the existing live fetch mock pattern in `app-live-data.test.tsx`.
  - Root live Tasks include `mockDiscoveryRootTask`.
  - Generated catalog includes active/stale children.
  - Generated run for `task_generated_vultr` is `running`.
  - Open Discovery subcanvas and assert generated card data/status shows the running state.

- Branch state:
  - Add a small assertion that stored `detailMode: "discovery-subcanvas"` survives `readStoredTaskBranches()` if existing tests cover stored branch hydration. If not, cover this through an App remount/localStorage test only if it stays small.

Avoid tests that only check a string exists somewhere in the document. Scope assertions to the subcanvas panel or root canvas container.

### 2. Implement the narrow UI/data wiring

- Destructure `generatedTasksByDiscoveryTaskId` from `liveData` in `App.tsx`.
- Add `"discovery-subcanvas"` to `TaskBranchDetailMode`.
- Update `readStoredTaskBranches()` to keep that mode.
- Add a Discovery-only toggle button in `taskBranchPanelItems`.
- In `taskChildBranchPanels`, handle `branch.detailMode === "discovery-subcanvas"` and `task.canvasKind === "discovery"`.
- Build a presentational panel directly in `App.tsx` unless a very small local helper improves readability. Do not create a new broad component file unless the JSX becomes unreviewably large.
- Use `selectLatestRun(taskRunsByTaskId[generatedTask.taskId] ?? [])` for generated child latest run display.
- Use `RUN_STATUS_LABELS` and existing status helpers where practical.
- Do not call `runTask`, `cancelTaskRun`, `openTaskEditDraft`, `archiveTask`, or observer code for generated children in this step.

### 3. Add scoped CSS only

- Add Discovery subcanvas styles to `execution-map.css`.
- Keep cards compact and readable inside the existing child panel shell.
- Do not restyle normal Task menus, run observers, root canvas cards, or global token rules.
- Ensure long generated Task titles and item IDs wrap without overflowing.
- Stale generated children should be visually distinct but not disabled or hidden.

### 4. Update docs

Update only factual docs:

- `apps/team-console/README.md`: 5174 now has a Discovery subcanvas catalog panel; generated child actions/observer remain deferred.
- `docs/team-runtime.md`: record current UI scope and boundaries.
- `docs/change-log.md`: add a dated `2026-05-31` entry for Step 08C.
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`: mark Step 08C completed locally after implementation, with exact files and verification.

Do not describe generated child edit/run/observer as completed.

## Browser Verification Required

Use the real Team Console entry:

```text
http://127.0.0.1:5174/
```

If the dev server is not running, start or reuse the Team Console dev server. Do not open a random backend on `3100`. If a port is occupied by the correct Vite server, reuse it.

Browser evidence must include:

- Data source is mock / 示例数据.
- Root Discovery card count: `[data-canvas-kind="discovery"]`.
- User actions performed:
  - click `发现云服务候选`
  - click `Discovery 子画布` toggle
- Panel selector count:

```js
document.querySelectorAll('[data-discovery-subcanvas-for="task_discovery_cloud_vendors"]').length
```

- Generated card count inside the panel:

```js
panel.querySelectorAll('[data-generated-task-id]').length
```

- Generated child root-card proof stays zero for `核查 Vultr 公开证据` and `核查 Hetzner 公开证据` in the root canvas node container.
- Measured rects:
  - subcanvas panel width/height
  - first generated card width/height
  - whether generated cards are inside the panel bounds
- Screenshot path under `runtime/`, for example:

```text
runtime/team-console-step08c-discovery-subcanvas.png
```

The screenshot is runtime output and must not be staged.

If browser automation is unavailable, report that as a limitation. Do not ask the user to manually verify when automation is available.

## Verification Commands

Run focused checks first:

```powershell
npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx src/tests/execution-map-ui.test.tsx
npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts
npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json
```

Then run final checks:

```powershell
npm --prefix apps/team-console run build
npm --prefix apps/team-console test
npx tsc --noEmit
git diff --check
git diff --cached --stat
```

Also inspect diff and EOL:

```powershell
git diff --stat -- apps/team-console/src/app/App.tsx apps/team-console/src/app/use-task-branch-stack.ts apps/team-console/src/graph/execution-map.css apps/team-console/src/tests/app-live-data.test.tsx apps/team-console/src/tests/execution-map-ui.test.tsx apps/team-console/README.md docs/team-runtime.md docs/change-log.md .codex/plans/2026-05-30-team-console-discovery-requirements.md
git diff --numstat -- apps/team-console/src/app/App.tsx apps/team-console/src/app/use-task-branch-stack.ts apps/team-console/src/graph/execution-map.css apps/team-console/src/tests/app-live-data.test.tsx apps/team-console/src/tests/execution-map-ui.test.tsx apps/team-console/README.md docs/team-runtime.md docs/change-log.md .codex/plans/2026-05-30-team-console-discovery-requirements.md
git ls-files --eol apps/team-console/src/app/App.tsx apps/team-console/src/app/use-task-branch-stack.ts apps/team-console/src/graph/execution-map.css apps/team-console/src/tests/app-live-data.test.tsx apps/team-console/src/tests/execution-map-ui.test.tsx apps/team-console/README.md docs/team-runtime.md docs/change-log.md .codex/plans/2026-05-30-team-console-discovery-requirements.md
```

If you create a new test file, also run:

```powershell
Select-String -LiteralPath <new-file> -Pattern '[ \t]+$'
git ls-files --eol --others --exclude-standard <new-file>
```

## Stop Conditions

Stop and report instead of continuing if:

- `generatedTasksByDiscoveryTaskId` is missing from the hook return type.
- `taskChildBranchPanels` no longer exists or no longer supports `sourceId`.
- The Discovery mock fixture no longer has the expected generated children.
- Implementing this requires generated child edit/run/observer actions.
- Focused tests require broad unrelated rewrites.
- Diff stat suggests line-ending or formatter churn.

## Commit Policy

No stage, no commit, no push unless the user explicitly authorizes it. Do not use `git add -A`.

Suggested commit message if later approved:

```text
feat(team-console): add discovery generated task subcanvas
```

## Delivery Report Template

Reply with:

1. Modified files.
2. UI/data behavior changes.
3. Tests added or updated, including what old missing behavior they catch.
4. Browser verification evidence with exact URL, selectors, counts, measured rects, and screenshot path.
5. Docs updated.
6. Explicit non-goals not implemented.
7. Verification commands and pass/fail results.
8. Diff stat/numstat summary and whether any formatting/EOL churn occurred.
9. `git diff --cached --stat` result proving nothing is staged.
10. Any plan assumption that was wrong.

## Review Checklist For Codex

- Generated child Tasks appear only in the Discovery subcanvas, not root canvas.
- Normal root Tasks have no Discovery subcanvas button.
- The subcanvas uses `generatedTasksByDiscoveryTaskId`, not root `tasksById`.
- No generated child edit/run/cancel/archive/observer behavior leaked into this step.
- Browser evidence proves real 5174 behavior, not just unit tests.
- Docs match the actual scope and do not overclaim Step 08D features.
- Dirty runtime artifacts and `.pi/skills` boundaries remain untouched.
