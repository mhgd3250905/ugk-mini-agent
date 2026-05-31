# Team Console Discovery Step 08B Plan - Root Summary Surface

Date: 2026-05-31

## Goal

Make Discovery root Tasks visibly distinct on the 5174 main canvas and show the Step 08A non-visual summary counts on the root card.

This step is a small UI surface step. It must not build the Discovery subcanvas. The only product behavior is: a Discovery root card on the main canvas is recognizable as Discovery and shows generated child counts without allowing generated children to flood the root canvas.

## Current Baseline

- Branch: `main`
- Local state: `main...origin/main [ahead 6]`
- Latest commit: `af0362a docs(team-console): record task chain validation`
- Discovery Steps 01-08A are completed locally, verified, not staged, and not committed.
- Step 08A already added:
  - `LiveTeamApi.listGeneratedTasks(discoveryTaskId, options?)`
  - `generatedTasksByDiscoveryTaskId`
  - `discoverySummariesByTaskId`
  - generated child run summaries merged into `taskRunsByTaskId`
- Codex review fixed Step 08A build-only unused symbols. `npm --prefix apps/team-console run build`, Team Console full tests, Team Console tsc, top-level `npx tsc --noEmit`, and `git diff --check` passed after that fix.
- Dirty boundary still includes existing `.pi/skills/anthropics/skill-creator/**` tracked deletion and untracked runtime/local artifacts. Do not stage or restore those files.

## Must Read First

1. `AGENTS.md`
2. `docs/handoff-current.md`
3. `docs/change-log.md`
4. `docs/team-runtime.md`
5. `apps/team-console/README.md`
6. `.codex/plans/2026-05-30-team-console-discovery-requirements.md`
7. `.codex/plans/2026-05-31-team-console-discovery-step-08a-console-data-seam-plan.md`
8. `apps/team-console/src/app/use-team-console-live-data.ts`
9. `apps/team-console/src/app/App.tsx`
10. `apps/team-console/src/graph/ExecutionMap.tsx`
11. `apps/team-console/src/graph/atlas-geometry.ts`
12. `apps/team-console/src/graph/execution-map.css`
13. `apps/team-console/src/fixtures/team-fixtures.ts`
14. `apps/team-console/src/tests/execution-map-ui.test.tsx`
15. `apps/team-console/src/tests/app-live-data.test.tsx`

## Allowed Scope

Expected production files:

- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/app/use-team-console-live-data.ts`
- `apps/team-console/src/graph/ExecutionMap.tsx`
- `apps/team-console/src/graph/atlas-geometry.ts`
- `apps/team-console/src/graph/execution-map.css`

Expected tests:

- `apps/team-console/src/tests/execution-map-ui.test.tsx`
- `apps/team-console/src/tests/app-live-data.test.tsx`

Expected docs:

- `apps/team-console/README.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`

Only touch `apps/team-console/src/fixtures/team-fixtures.ts` if mock-mode browser verification needs a stable Discovery root summary fixture exposed through existing fixture exports.

## Explicit Non-Goals

Do not do any of this in Step 08B:

- no Discovery subcanvas
- no generated Task cards on the root canvas
- no generated Task edit panel work
- no failed dispatch count observer/attempt metadata fetch
- no Discovery creation panel
- no backend route/store/runtime/scheduler/dispatcher changes
- no role prompt/parser changes
- no `.pi/skills/**` changes
- no main `/playground` product UI changes
- no broad visual redesign of the Atlas cards

If implementing the summary requires touching unrelated interaction code, stop and report the assumption mismatch.

## Required Behavior

### 1. Pass summary data into the map

Wire `discoverySummariesByTaskId` from `useTeamConsoleLiveData()` through `App.tsx` into `ExecutionMap`.

`ExecutionMap` should accept an optional prop with this shape:

```ts
discoverySummariesByTaskId?: Record<string, {
  generatedTaskCount: number;
  activeGeneratedTaskCount: number;
  staleGeneratedTaskCount: number;
  runningGeneratedRunCount: number;
}>;
```

Keep this optional so existing tests and old callers do not need noisy setup.

### 2. Render Discovery identity on root cards

For a root canvas Task where `task.canvasKind === "discovery"` and `!task.generatedSource`:

- render the kind label as `Discovery`, not `Task`
- add a stable DOM attribute such as `data-canvas-kind="discovery"`
- add a stable CSS class such as `emap-discovery-task-node`
- preserve existing click, drag, dock, dependency handle, port, run status, and observer behavior

Normal Tasks must keep the existing `Task` label and not receive Discovery classes/attributes.

### 3. Render compact summary counts

For Discovery root cards only, render a compact summary row using `discoverySummariesByTaskId[task.taskId]`:

- generated total count
- active generated count
- stale generated count
- running generated run count

Use concise visible labels. Suggested copy:

- `2 items`
- `1 active`
- `1 stale`
- `1 running`

When the summary is missing, render zero counts instead of crashing.

Do not include failed dispatch count in Step 08B. That needs attempt metadata and belongs to a later observer/detail step.

### 4. Keep layout stable

The summary row must not overlap:

- task title
- node id copy button
- Leader / Worker / Checker rows
- input/output ports
- dependency handle
- node status pill

If the row needs vertical room, add a Discovery-only height increment in `atlas-geometry.ts` so all connector geometry, drag hitboxes, dock flight geometry, and dependency links use the same height source. Do not hardcode a CSS-only height that disagrees with geometry helpers.

### 5. Browser-verifiable mock Discovery root

Make the mock 5174 workspace able to show the Discovery root summary at `http://127.0.0.1:5174/` without needing a live backend with pre-existing Discovery data.

Acceptable approach:

- mock mode root Tasks include the Discovery root fixture from Step 08A
- generated child fixtures remain hidden from root canvas
- mock mode initializes `discoverySummariesByTaskId` from the generated child fixtures

Do not add generated child root nodes just to make browser verification easy. That would violate the core requirement.

## Tests To Add Or Update

### `apps/team-console/src/tests/execution-map-ui.test.tsx`

Add focused tests proving:

- a Discovery root card renders `Discovery`, `data-canvas-kind="discovery"`, and `emap-discovery-task-node`
- the summary counts render for a Discovery root with a supplied summary
- a normal Task card still renders `Task` and does not render Discovery summary/counts
- the Discovery root card height is larger than a normal Task card or otherwise explicitly high enough to fit the summary row without overlap

Use DOM queries scoped with `within(node)` so the assertions do not pass because some unrelated part of the page contains the same text.

### `apps/team-console/src/tests/app-live-data.test.tsx`

Add or update an App/hook-level test proving:

- live data summary from Step 08A reaches `ExecutionMap`
- generated child titles are not rendered as root canvas cards
- the Discovery root card shows the expected counts after the generated catalog fetch resolves

Do not rewrite broad tests just because fetch ordering changes. Keep the new test narrow.

## Browser Verification Required

Because Step 08B is visual UI work, verify the real local entry point:

```text
http://127.0.0.1:5174/
```

Use Browser/DevTools automation. Do not ask the user to manually inspect if automation is available.

If the dev server is not already running, start the Team Console dev server. Do not start temporary backend ports such as `3100`.

Required browser evidence to report:

- URL used
- data source used (`mock` is acceptable and preferred for deterministic verification)
- DOM count for `[data-canvas-kind="discovery"]`
- DOM count proving generated child titles such as `核查 Vultr 公开证据` and `核查 Hetzner 公开证据` are not root cards
- visible summary text on the Discovery card
- at least one bounding rect measurement proving the summary row is inside the Discovery card bounds and not overlapping the agent grid
- screenshot path if the browser tool can capture one

## Verification Commands

Run at minimum:

```powershell
npm --prefix apps/team-console test -- --run src/tests/execution-map-ui.test.tsx
npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx
npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts
npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json
npm --prefix apps/team-console run build
npx tsc --noEmit
git diff --check
git diff --cached --stat
```

Because this touches `ExecutionMap`, also run the full Team Console test suite unless the focused tests and build are the only touched surface:

```powershell
npm --prefix apps/team-console test
```

Inspect scoped diff:

```powershell
git diff --stat -- apps/team-console/src/app/App.tsx apps/team-console/src/app/use-team-console-live-data.ts apps/team-console/src/graph/ExecutionMap.tsx apps/team-console/src/graph/atlas-geometry.ts apps/team-console/src/graph/execution-map.css apps/team-console/src/tests/execution-map-ui.test.tsx apps/team-console/src/tests/app-live-data.test.tsx apps/team-console/README.md docs/team-runtime.md docs/change-log.md
git diff --numstat -- apps/team-console/src/app/App.tsx apps/team-console/src/app/use-team-console-live-data.ts apps/team-console/src/graph/ExecutionMap.tsx apps/team-console/src/graph/atlas-geometry.ts apps/team-console/src/graph/execution-map.css apps/team-console/src/tests/execution-map-ui.test.tsx apps/team-console/src/tests/app-live-data.test.tsx apps/team-console/README.md docs/team-runtime.md docs/change-log.md
git ls-files --eol -- apps/team-console/src/app/App.tsx apps/team-console/src/app/use-team-console-live-data.ts apps/team-console/src/graph/ExecutionMap.tsx apps/team-console/src/graph/atlas-geometry.ts apps/team-console/src/graph/execution-map.css apps/team-console/src/tests/execution-map-ui.test.tsx apps/team-console/src/tests/app-live-data.test.tsx apps/team-console/README.md docs/team-runtime.md docs/change-log.md
```

If any new untracked file is created, also run:

```powershell
Select-String -LiteralPath <new-file> -Pattern '[ \t]+$'
git ls-files --eol --others --exclude-standard <new-file>
```

## Delivery Report Template

Reply in the established GLM format:

1. changed files
2. UI/data behavior changes
3. tests added/updated
4. browser verification evidence
5. documentation updates
6. explicit non-changes
7. verification results
8. diff stat / numstat
9. EOL / formatter-only churn
10. plan assumptions or deviations

Do not stage, commit, push, or use `git add -A`.
