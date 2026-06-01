# Step 08E1: Generated Managed WorkUnit Snapshot And Reset API Seam

Date: 2026-05-31

## Goal

Make reset-to-managed technically real before adding any 5174 UI button.

Generated Tasks already distinguish `workUnitMode: "managed" | "customized"`, but the current source record does not preserve the latest dispatcher-managed WorkUnit after a user customizes the visible WorkUnit. A UI reset button without a stored managed snapshot would be fakery. This step adds the contract/store/route/API seam needed for a later UI step.

## Current Baseline

- Branch: `main`
- Current local status: `main...origin/main [ahead 6]`
- Latest commit: `af0362a docs(team-console): record task chain validation`
- Step 08D is reviewed and accepted locally:
  - generated child run/cancel controls work inside the Discovery subcanvas
  - generated child latest-run observer and file detail work
  - generated child Tasks are not in root `tasks`, root `tasksById`, root `taskNodes`, or root canvas cards
- Existing dirty/untracked boundaries still apply:
  - `.pi/skills/anthropics/skill-creator/**` tracked deletions are pre-existing; do not stage, restore, or delete them
  - `.pi/skills/skill-creator/` is untracked; do not commit
  - `.codex/plans/*` are local planning files; do not commit unless explicitly told
  - public/runtime report artifacts, screenshots, browser profiles, temp HTML, `.env`, `.data`, deploy packages, unknown `.pi/skills/*/skills-lock.json` are out of scope

## Must-Read Files

- `AGENTS.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `src/team/types.ts`
- `src/team/public-contract.ts`
- `src/team/task-validation.ts`
- `src/team/task-store.ts`
- `src/team/routes.ts`
- `apps/team-console/src/api/team-types.ts`
- `apps/team-console/src/api/team-api.ts`
- `apps/team-console/src/fixtures/team-fixtures.ts`
- `apps/team-console/src/tests/team-contract-drift.test.ts`
- `apps/team-console/src/tests/team-api.test.ts`
- `test/team-task-store.test.ts`
- `test/team-task-routes.test.ts`

## Scope

Implement only the backend/shared-contract/API-adapter foundation for generated Task reset-to-managed.

Expected contract:

- Add optional `latestManagedWorkUnit?: TeamWorkUnitDefinition` to `TeamGeneratedTaskSource`.
- Existing generated Task records without `latestManagedWorkUnit` must still read and validate as old data.
- Discovery upsert must keep `latestManagedWorkUnit` current with the latest valid dispatcher WorkUnit.
- If an existing generated Task is still managed, Discovery rerun may update visible `title`/`workUnit` as it does today.
- If an existing generated Task is customized, Discovery rerun must not overwrite visible `title`/`workUnit`, but it must still update `generatedSource.itemPayload`, latest discovery metadata, and `latestManagedWorkUnit`.
- Public PATCH of a generated Task `workUnit` must continue marking `generatedSource.workUnitMode = "customized"` and must not erase `latestManagedWorkUnit`.
- Add a small reset route for generated Tasks, recommended path:
  - `POST /v1/team/tasks/:taskId/generated-workunit/reset`
  - Response shape should match existing mutation responses: `{ task, warnings? }`
- Reset semantics:
  - task must exist
  - task must be a generated Task
  - task must not be archived
  - `generatedSource.latestManagedWorkUnit` must exist
  - reset copies `latestManagedWorkUnit` into visible `workUnit`, sets visible `title` from that WorkUnit title, sets `generatedSource.workUnitMode = "managed"`, updates `updatedAt`, and preserves source identity, item payload, latest discovery metadata, and `latestManagedWorkUnit`
- Add Team Console gateway support for the reset route:
  - `CanvasTaskGateway.resetGeneratedTaskWorkUnit(taskId)`
  - `LiveTeamApi` POSTs to the route
  - `MockTeamApi` mirrors the behavior and warnings

## Explicit Non-Goals

- Do not add 5174 UI buttons or panels in this step.
- Do not edit `apps/team-console/src/app/App.tsx` except if a type import fails unexpectedly; prefer avoiding App changes entirely.
- Do not implement generated child visual light edit.
- Do not implement dispatch diagnostics UI.
- Do not archive, delete, or hide generated Tasks.
- Do not rerun the dispatcher from this route.
- Do not let the reset route modify `generatedSource.sourceDiscoveryTaskId`, `sourceItemId`, `itemPayload`, latest discovery ids, or `itemStatus`.
- Do not touch `.pi/skills/**`, runtime skills, main `/playground`, scheduler, dispatcher prompt/parser, AgentProfile runner, or Plan orchestrator.
- Do not stage or commit.

## Implementation Tasks

1. Contract and validation
   - Add `latestManagedWorkUnit?: TeamWorkUnitDefinition` to backend and Team Console mirrored types.
   - Keep it optional for old generated Tasks.
   - Validate it with the same WorkUnit schema when present.
   - Update public/shared contract exports and drift guard tests.

2. Store behavior
   - In `TaskStore.upsertGeneratedTaskFromDiscovery()`, set/update `generatedSource.latestManagedWorkUnit` from the dispatcher WorkUnit with generated worker/checker ids applied.
   - Preserve customized visible WorkUnits while updating source metadata and latest managed snapshot.
   - Add a store method such as `resetGeneratedTaskWorkUnit(taskId)` with the reset semantics above.
   - Keep public `update()` behavior: generated `workUnit` PATCH marks customized but keeps the latest managed snapshot.

3. Route and API seam
   - Add `POST /v1/team/tasks/:taskId/generated-workunit/reset`.
   - Add route tests for generated success, normal root rejection, Discovery root rejection, missing task, archived generated rejection, and old generated record without snapshot rejection.
   - Add Team Console `LiveTeamApi` and `MockTeamApi` support plus focused API tests.

4. Docs
   - Update `docs/team-runtime.md`, `apps/team-console/README.md`, and `docs/change-log.md`.
   - Record that Step 08E1 is API/contract foundation only; UI reset/edit/diagnostics remain Step 08E2.

## Tests To Add Or Update Before Implementation

- `test/team-task-store.test.ts`
  - generated create stores `latestManagedWorkUnit`
  - managed rerun updates visible WorkUnit and latest snapshot
  - customized rerun preserves visible WorkUnit but updates latest snapshot
  - public generated WorkUnit edit marks customized and preserves latest snapshot
  - reset restores latest snapshot and marks managed
  - reset rejects normal root / Discovery root / archived / missing latest snapshot
- `test/team-task-routes.test.ts`
  - reset route success response `{ task, warnings? }`
  - reset route rejects missing task, normal root, Discovery root, archived generated, generated without latest snapshot
  - public create/update still rejects `generatedSource`
- `apps/team-console/src/tests/team-api.test.ts`
  - `LiveTeamApi.resetGeneratedTaskWorkUnit()` hits encoded POST path
  - non-2xx maps through existing API error behavior
  - `MockTeamApi` reset updates generated catalog and preserves source identity
- `apps/team-console/src/tests/team-contract-drift.test.ts`
  - backend and frontend `TeamGeneratedTaskSource` stay aligned

## Focused Verification

Run at minimum:

```powershell
node --test --import tsx test/team-task-store.test.ts
node --test --import tsx test/team-task-routes.test.ts
npm --prefix apps/team-console test -- --run src/tests/team-api.test.ts src/tests/team-contract-drift.test.ts
npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json
npx tsc --noEmit
git diff --check
git diff --cached --stat
```

If the touched Team Console API/types surface is larger than expected, also run:

```powershell
npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx
```

Browser verification is not required for Step 08E1 because UI behavior is explicitly out of scope. If UI files are touched anyway, stop and explain why before continuing.

## Diff Hygiene

- Preserve existing LF line endings.
- Do not run broad formatters.
- Inspect:
  - `git diff --stat -- <touched files>`
  - `git diff --numstat -- <touched files>`
  - `git ls-files --eol <touched files>`
- Large diffs are suspicious unless they are focused tests.

## Delivery Report Template

Report in this exact shape:

1. Modified files.
2. Contract changes, including the exact `TeamGeneratedTaskSource` field added.
3. Store behavior: create, managed rerun, customized rerun, public edit, reset.
4. Route/API behavior and exact endpoint.
5. Tests added/updated and what old bug/missing behavior each test catches.
6. Docs updated.
7. Explicit non-goals respected.
8. Verification results with pass counts.
9. Diff stat/numstat and EOL/formatter notes.
10. Staging status: confirm `git diff --cached --stat` is empty.
11. Any plan assumption that failed.
