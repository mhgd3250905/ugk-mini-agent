# Step 02 Plan: Discovery Validation And TaskStore Semantics

Date: 2026-05-30

## Goal

Implement backend validation and persistence semantics for Discovery root Tasks and generated Tasks at the `TaskStore` layer only. This step must not expose new routes, run Discovery, dispatch items, or change the Team Console UI.

The point is to make the repository able to safely persist these records before route/runner/UI work starts. If this layer is loose, every later step turns into guesswork. We are not doing that.

## Baseline

- Step 01/01A added shared Discovery contracts:
  - `TeamCanvasTaskKind`
  - `TeamDiscoverySpec`
  - `TeamGeneratedTaskSource`
  - `TeamWorkUnitDefinition.outputCheck?`
- Latest verification from Codex review:
  - `npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts` passed with 12 tests
  - `npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json` passed
  - `npx tsc --noEmit` passed
  - `git diff --check` passed
- Relevant requirement document:
  - `.codex/plans/2026-05-30-team-console-discovery-requirements.md`

## Scope

Allowed production files:

- `src/team/task-validation.ts`
- `src/team/task-store.ts`

Allowed tests:

- `test/team-task-store.test.ts`

Do not modify:

- `src/team/routes.ts`
- `src/team/task-run-service.ts`
- `src/team/canvas-task-attempt-runner.ts`
- `src/team/role-prompt-contract.ts`
- `src/team/agent-profile-role-runner.ts`
- `apps/team-console/src/**`
- `.pi/skills/**`
- docs except this plan/message set

## Required Behavior

### Validation

Extend `CreateTeamCanvasTaskInput` and `UpdateTeamCanvasTaskInput` only as needed for store-layer persistence:

- Creation may accept:
  - `canvasKind?: "task" | "discovery"`
  - `discoverySpec?: TeamDiscoverySpec`
  - `generatedSource?: TeamGeneratedTaskSource`
- Update may accept:
  - `discoverySpec?: TeamDiscoverySpec`
  - `workUnit?: TeamWorkUnitDefinition`
  - existing fields as before
- Do not add route parsing in this step.

Validation rules:

- Missing `canvasKind` means normal root Task.
- `canvasKind: "task"` behaves like missing `canvasKind`.
- `canvasKind: "discovery"` requires a valid `discoverySpec`.
- Normal root Task must not carry `discoverySpec`.
- Discovery root Task must not carry `generatedSource`.
- Generated Task must carry `generatedSource`, must not be `canvasKind: "discovery"`, and must not carry `discoverySpec`.
- Invalid `canvasKind` is rejected.

Validate `TeamDiscoverySpec`:

- `schemaVersion` exactly `"team/discovery-spec-1"`.
- `discoveryGoal`, `outputKey`, `dispatchGoal`, `dispatcherAgentId`, `generatedWorkerAgentId`, `generatedCheckerAgentId` are non-empty strings.
- `itemIdField` exactly `"id"`.
- `requiredItemFields` is a non-empty array of non-empty strings and must include `"id"`.
- `recommendedItemFields`, if present, is an array of non-empty strings.
- `dispatcherAgentId`, `generatedWorkerAgentId`, and `generatedCheckerAgentId` must exist in the known Agent catalog when the store has `getAgentIds`.
- `autoRun.enabled` must be `true`.
- `autoRun.concurrency` must be `3`.

Validate `TeamGeneratedTaskSource`:

- `schemaVersion` exactly `"team/generated-task-source-1"`.
- `sourceDiscoveryTaskId` and `sourceItemId` are non-empty strings.
- `itemStatus` is `"active"` or `"stale"`.
- `itemPayload` is a plain object, not null and not an array.
- `workUnitMode` is `"managed"` or `"customized"`.
- Optional latest run/attempt/discovered-at fields, if present, are non-empty strings.

Validate `TeamWorkUnitDefinition.outputCheck?` enough to reject obvious garbage:

- `type` must be one of the existing `TeamTaskOutputCheck` types.
- Optional string fields must be non-empty strings.
- Optional string arrays must contain only non-empty strings.
- Optional booleans must be booleans.
- This is schema validation only; do not run output validation here.

### Store behavior

Extend `TaskStore.create()` to persist the new allowed fields after validation.

Extend `TaskStore.update()`:

- It may update `discoverySpec` on a Discovery root Task.
- It must reject adding `discoverySpec` to a normal root Task or generated Task.
- It must not allow changing `canvasKind` through update.
- It must not allow changing `generatedSource` through public update input.
- If an existing generated Task is updated with a new `workUnit`, set `generatedSource.workUnitMode` to `"customized"` in the stored task.
- If an existing generated Task is updated without `workUnit`, preserve current `workUnitMode`.

Extend list/query behavior:

- `TaskStore.list()` default excludes archived tasks and generated Tasks.
- `TaskStore.list({ includeGenerated: true })` includes generated Tasks as well as root Tasks, still respecting `includeArchived` unless set.
- Add a helper such as `listGeneratedForDiscoveryTask(discoveryTaskId, options?)` or equivalent:
  - returns generated Tasks where `generatedSource.sourceDiscoveryTaskId === discoveryTaskId`
  - includes active and stale generated Tasks
  - excludes archived by default
  - sorts consistently with `list()`

Do not change the physical storage path. Records still live under `.data/team/tasks/*.json`.

## Tests To Add

Add focused tests in `test/team-task-store.test.ts`:

- Creates a valid Discovery root Task and preserves `canvasKind: "discovery"` plus `discoverySpec`.
- Rejects Discovery Task missing `discoverySpec`.
- Rejects Discovery spec with missing `"id"` in `requiredItemFields`.
- Rejects unknown `dispatcherAgentId`, `generatedWorkerAgentId`, or `generatedCheckerAgentId`.
- Rejects normal root Task carrying `discoverySpec`.
- Creates a generated Task through `TaskStore.create()` with valid `generatedSource`.
- Rejects generated Task that also has `canvasKind: "discovery"` or `discoverySpec`.
- `TaskStore.list()` excludes generated Tasks by default.
- `TaskStore.list({ includeGenerated: true })` includes generated Tasks.
- generated-task helper returns only Tasks for the requested Discovery id and includes stale generated Tasks.
- Updating a generated Task `workUnit` changes `generatedSource.workUnitMode` to `"customized"`.
- Updating a generated Task title/status without `workUnit` does not change `workUnitMode`.
- Rejects invalid `workUnit.outputCheck` shape and preserves a valid one.

Use existing temp-dir store patterns in the file. Do not touch route tests in this step.

## Verification Commands

Focused:

```powershell
node --test --import tsx test/team-task-store.test.ts
```

Final:

```powershell
node --test --import tsx test/team-task-store.test.ts
npx tsc --noEmit
git diff --check
git diff --stat -- src/team/task-validation.ts src/team/task-store.ts test/team-task-store.test.ts
git diff --numstat -- src/team/task-validation.ts src/team/task-store.ts test/team-task-store.test.ts
git diff --cached --stat
```

If the focused store test triggers unrelated failures, stop and report the exact failure before broadening scope.

## Delivery Report Template

Report:

- Files changed.
- Validation rules added.
- Store methods/options added.
- Exact tests added.
- Focused verification command outputs.
- `npx tsc --noEmit` result.
- `git diff --check` result.
- Diff stat/numstat.
- Confirmation that no routes, runtime runner, UI, scheduler, docs, or `.pi/skills` were changed.
- Whether any EOL or formatter churn occurred.

Do not stage or commit.
