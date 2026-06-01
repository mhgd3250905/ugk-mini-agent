# Team Console Discovery Step 08A Plan - Console Data/API Seam

Date: 2026-05-31

## Goal

Teach the 5174 Team Console data layer how to see Discovery generated child catalogs without building the visual Discovery subcanvas yet.

This step is intentionally narrow. The backend/runtime already creates, reuses, marks stale, and auto-runs generated Tasks. The console now needs the API seam and state model so later UI work can render from stable facts instead of guessing from root canvas state.

## Current Baseline

- Branch: `main`
- Repo status before this plan: `main...origin/main [ahead 6]`
- Latest commit before Discovery work: `af0362a docs(team-console): record task chain validation`
- Stable tag already pushed before this feature stream: `stable/team-console-task-chain-2026-05-30`
- Discovery Steps 01-07 are locally implemented, verified, not staged, and not committed.
- Dirty boundary still includes existing `.pi/skills/anthropics/skill-creator/**` tracked deletion and untracked runtime/local artifacts. Do not stage or restore those files.

## Must Read First

1. `AGENTS.md`
2. `docs/handoff-current.md`
3. `docs/change-log.md`
4. `docs/team-runtime.md`
5. `apps/team-console/README.md`
6. `.codex/plans/2026-05-30-team-console-discovery-requirements.md`
7. `apps/team-console/src/api/team-api.ts`
8. `apps/team-console/src/api/team-types.ts`
9. `apps/team-console/src/app/use-team-console-live-data.ts`
10. `apps/team-console/src/fixtures/team-fixtures.ts`
11. `apps/team-console/src/tests/team-api.test.ts`
12. `apps/team-console/src/tests/app-live-data.test.tsx`

## Allowed Scope

Preferred files:

- `apps/team-console/src/api/team-api.ts`
- `apps/team-console/src/app/use-team-console-live-data.ts`
- `apps/team-console/src/fixtures/team-fixtures.ts`
- `apps/team-console/src/tests/team-api.test.ts`
- `apps/team-console/src/tests/app-live-data.test.tsx`
- `apps/team-console/README.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`

Optional, only if it keeps the hook readable:

- one small helper under `apps/team-console/src/app/` for Discovery summary derivation.

## Explicit Non-Goals

Do not modify these in Step 08A:

- `apps/team-console/src/graph/ExecutionMap.tsx`
- `apps/team-console/src/graph/execution-map.css`
- visual subcanvas UI
- Task card/menu visual design
- backend routes/store/runtime/scheduler/dispatcher
- role prompt/parser or agent profile runner
- Plan orchestrator
- `.pi/skills/**`
- main `/playground` product UI

If visual UI files become necessary, stop and report why. Do not quietly expand the step.

## Required Behavior

### 1. Public Team Console API seam

Add a generated child catalog method to the Team Console API abstraction:

```ts
listGeneratedTasks(
  discoveryTaskId: string,
  options?: { includeArchived?: boolean },
): Promise<TeamCanvasTask[]>
```

Live API behavior:

- call `GET /v1/team/tasks/:taskId/generated-tasks`
- URL-encode `taskId`
- append `includeArchived=1` only when requested
- accept the backend shape `{ tasks }`
- optionally tolerate a bare array response for mock/older compatibility
- treat a `404` response as an empty list so the console stays usable against older local servers during development

Mock API behavior:

- return generated Tasks from fixture data by `generatedSource.sourceDiscoveryTaskId`
- exclude archived generated Tasks by default
- include archived only when `includeArchived` is true
- keep `listTasks()` returning root Tasks only

### 2. Fixture coverage

Add minimal fixture data for:

- one Discovery root Task with `canvasKind: "discovery"` and a valid `discoverySpec`
- at least one active generated Task
- at least one stale generated Task

Do not pollute the root mock task list with generated Tasks. Generated fixture records should be reachable only through `listGeneratedTasks()`.

### 3. Live data state

Extend `useTeamConsoleLiveData()` with non-visual generated catalog state:

```ts
generatedTasksByDiscoveryTaskId: Record<string, TeamCanvasTask[]>
```

Recommended summary state:

```ts
discoverySummariesByTaskId: Record<string, {
  generatedTaskCount: number;
  activeGeneratedTaskCount: number;
  staleGeneratedTaskCount: number;
  runningGeneratedRunCount: number;
}>;
```

Rules:

- identify Discovery roots from root Tasks where `canvasKind === "discovery"`
- fetch generated child catalogs for those Discovery roots during initial live load and refresh
- do not place generated Tasks into the root `tasks` state
- do not render generated Tasks on the main canvas in this step
- if generated child tasks are fetched, load their run summaries into the existing `taskRunsByTaskId` map so later UI can reuse current run detail plumbing
- if there are no Discovery roots, do not call generated catalog endpoints

Failed dispatch counts are intentionally deferred unless already trivial from existing loaded metadata. They require attempt metadata and should not force this step into observer/detail work.

### 4. Refresh behavior

When root Task refresh runs:

- root Tasks remain the canonical main canvas list
- generated catalogs refresh after root Tasks are known
- generated catalog failure should not erase already loaded root Tasks
- old backend `404` for generated catalog should become an empty generated list, not a full console failure

Do not add generated Task auto-run behavior in the frontend. The backend owns that.

## Tests To Add Or Update

### `apps/team-console/src/tests/team-api.test.ts`

Cover:

- `LiveTeamApi.listGeneratedTasks("task/a b")` calls the encoded endpoint and returns `tasks`
- `includeArchived: true` adds the expected query
- `404` returns `[]`
- `MockTeamApi.listTasks()` returns root Tasks only
- `MockTeamApi.listGeneratedTasks()` returns active/stale generated children for a Discovery root and respects archived filtering

### `apps/team-console/src/tests/app-live-data.test.tsx`

Cover:

- live load with no Discovery root does not call `/generated-tasks`
- live load with one Discovery root fetches that root's generated catalog
- generated Tasks are not applied to the root `tasks` list/main atlas state
- generated child run summaries are loaded into `taskRunsByTaskId` if the hook exposes that state in the test harness

Keep these tests focused. Do not rewrite broad existing live-data tests just because the fetch sequence changed.

## Documentation

Update:

- `apps/team-console/README.md`
  - generated child catalog route is now consumed by the 5174 data layer
  - backend runtime supports Discovery run/dispatch/upsert/auto-run; visual subcanvas still pending
- `docs/team-runtime.md`
  - add current Team Console Step 08A status
- `docs/change-log.md`
  - add a dated Step 08A entry
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`
  - mark Step 08A completion details after implementation

## Verification Commands

Run at minimum:

```powershell
npm --prefix apps/team-console test -- --run src/tests/team-api.test.ts
npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx
npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts
npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json
npx tsc --noEmit
git diff --check
git diff --cached --stat
```

If the change touches shared app behavior more broadly, also run:

```powershell
npm --prefix apps/team-console test
```

No browser verification is required for Step 08A if no visual UI is changed. If visual UI files are touched, stop and ask for a new Step 08B/08C plan.

## Completion Report Format

Reply in the established GLM format:

1. changed files
2. behavior changes
3. tests added/updated
4. documentation updates
5. explicit non-changes
6. verification results
7. diff stat / numstat
8. EOL / formatter-only churn
9. plan assumptions or deviations

Do not stage, commit, push, or use `git add -A`.
