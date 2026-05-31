# Team Console Discovery Node Requirements

Date: 2026-05-30

## Objective

Build a new Discovery capability for the 5174 Team Console. This is not a reuse of the old `/playground/team` UI. The old runtime idea worth preserving is: a discovery step finds structured `items[]`, then each item becomes an executable unit. The new product model must make those executable units real Team Canvas Tasks so they inherit the current Task runtime, observer, worker/checker, file detail, run control, and future parallel execution behavior.

This is a large multi-subsystem feature. Do not hand the whole thing to GLM in one pass. Each step must stop for Codex review before the next step starts.

## Current Baseline

- Branch: `main`
- Current local state: `main...origin/main [ahead 6]`
- Latest commit: `af0362a docs(team-console): record task chain validation`
- Stable tag already pushed to GitHub and Gitee: `stable/team-console-task-chain-2026-05-30`
- Relevant completed commits before this plan:
  - `cb59730 fix(team-console): poll all task run observers`
  - `45a992e fix(team-console): remove task branch single fallback`
  - `5f8b370 refactor(team-console): remove task branch single props`
  - `1d244cd refactor(team-console): clarify focused task branch state`
  - `f8981d4 fix(team-console): discover downstream runs from observers`
  - `af0362a docs(team-console): record task chain validation`
- Dirty boundary that must not be staged or restored:
  - tracked deletion: `.pi/skills/anthropics/skill-creator/**`
  - untracked runtime/local files: `.pi/skills/skill-creator/`, `.codex/plans/*`, public/runtime reports, temporary report scripts/templates

## Completed Local Steps

These Discovery steps are completed locally but not staged or committed yet. The latest Git commit remains `af0362a`.

- Step 01 / 01A: shared Discovery / generated Task contracts were added and the generated default agent fields were renamed to `generatedWorkerAgentId` / `generatedCheckerAgentId`.
  - Modified files: `src/team/types.ts`, `src/team/public-contract.ts`, `apps/team-console/src/api/team-types.ts`, `apps/team-console/src/tests/team-contract-drift.test.ts`.
  - Review verification: `npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts`, `npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json`, `npx tsc --noEmit`, `git diff --check`.
- Step 02: backend validation and `TaskStore` semantics were added.
  - Modified files: `src/team/task-validation.ts`, `src/team/task-store.ts`, `test/team-task-store.test.ts`.
  - Review verification: `node --test --import tsx test/team-task-store.test.ts` passed with 19 tests; `npm run test:team` passed with 1081 tests, 1079 pass, 2 skipped; `npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts`, Team Console `tsc`, top-level `npx tsc --noEmit`, and `git diff --check` passed.
  - Codex added focused tests for invalid `canvasKind`, Discovery-only `discoverySpec` update, and public update rejection for `canvasKind/generatedSource`.
- Step 03: Task API routes and catalog docs were added.
  - Modified files: `src/team/routes.ts`, `src/team/route-parsers.ts`, `test/team-task-routes.test.ts`, `docs/team-runtime.md`, `apps/team-console/README.md`, `docs/change-log.md`.
  - Route behavior: `GET /v1/team/tasks` hides generated Tasks by default and supports `includeGenerated=1|true`; `POST /v1/team/tasks` accepts Discovery root fields and rejects public `generatedSource`; `PATCH /v1/team/tasks/:taskId` forwards `discoverySpec` and rejects `canvasKind/generatedSource`; `GET /v1/team/tasks/:taskId/generated-tasks` returns one Discovery root's generated child catalog.
  - Review verification: `node --test --import tsx test/team-task-routes.test.ts` passed with 35 tests; `node --test --import tsx test/team-task-store.test.ts` passed with 19 tests; `npm run test:team` passed with 1090 tests, 1088 pass, 2 skipped; Team Console contract drift test, Team Console `tsc`, top-level `npx tsc --noEmit`, and `git diff --check` passed.
- Step 04: Discovery run output validation and persistence were added.
  - Modified files: `src/team/types.ts`, `src/team/output-validator.ts`, `src/team/task-run-service.ts`, `src/team/canvas-task-attempt-runner.ts`, `test/team-output-validator.test.ts`, `test/team-task-run-process.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`.
  - Runtime behavior: `canvasKind="discovery"` Canvas Task runs are mapped to runtime `TeamTask.type="discovery"` with `discovery.outputKey`; Canvas Task runs preserve `workUnit.outputCheck`; accepted Discovery output must validate configured output key array and stable string item ids; successful Discovery runs write `accepted-result.md` plus `discovery-result.json`; invalid Discovery output fails the run and writes no standard Discovery result.
  - Review verification: `node --test --import tsx test/team-output-validator.test.ts` passed with 11 tests; `node --test --import tsx test/team-task-run-process.test.ts` passed with 22 tests; Step 03/02 focused route/store tests passed; Team Console contract drift test, Team Console `tsc`, top-level `npx tsc --noEmit`, and `git diff --check` passed. One `npm run test:team` run hit the known time-sensitive decomposition timeout test; targeted repro passed and the rerun full suite passed with 1095 tests, 1093 pass, 2 skipped.
- Step 05: Discovery dispatcher role contract was added.
  - Modified files: `src/team/role-runner.ts`, `src/team/role-prompt-contract.ts`, `src/team/agent-profile-role-runner.ts`, `test/team-role-prompt-contract.test.ts`, `test/team-role-runner.test.ts`, `test/team-agent-profile-runner.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`.
  - Role behavior: added role-local `DiscoveryDispatchInput` / `DiscoveryDispatchWorkUnitDraft` / `DiscoveryDispatchOutput`; added `buildDiscoveryDispatchPrompt()` and `parseDiscoveryDispatchRoleOutput()`; `MockRoleRunner` and `AgentProfileRoleRunner` implement `runDiscoveryDispatcher(input)`; profile fallback is `dispatcherProfileId > decomposerProfileId > workerProfileId`; role name is `discovery-dispatcher` with path-safe role keys.
  - Review verification: focused role prompt/runner/AgentProfile runner tests passed; Team Console contract drift test, Team Console `tsc`, top-level `npx tsc --noEmit`, `npm run test:team` passed with 1108 tests, 1106 pass, 2 skipped; `git diff --check` passed.
  - Review note: `TeamRoleRunner.runDiscoveryDispatcher` is optional to avoid forcing every legacy test fake runner to implement it. Future runtime integration must explicitly handle missing dispatcher support instead of assuming the method exists.
- Step 06: Discovery generated Task upsert and rerun reuse was added.
  - Modified files: `src/team/types.ts`, `src/team/run-workspace.ts`, `src/team/run-workspace-attempts.ts`, `src/team/task-store.ts`, `src/team/task-run-service.ts`, `test/team-task-store.test.ts`, `test/team-run-workspace.test.ts`, `test/team-task-run-process.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`. The cumulative diff also includes prior Step 02 changes in `src/team/task-validation.ts`.
  - Runtime behavior: successful Discovery root runs read `discovery-result.json`, call optional `runDiscoveryDispatcher()` per item, create/reuse generated `TeamCanvasTask` records, protect customized WorkUnits, mark missing generated Tasks stale, and persist `discoveryDispatch[]` attempt diagnostics. Generated Task auto-run is still not implemented in Step 06.
  - Codex review fix: `TaskStore.upsertGeneratedTaskFromDiscovery()` now validates the managed reuse write path before persisting, with a regression test proving an invalid dispatcher/fake WorkUnit cannot corrupt an existing generated Task. Tiny guardrail, big headache avoided.
  - Review verification: focused store/runtime/workspace/role tests passed; Team Console contract drift test, Team Console `tsc`, top-level `npx tsc --noEmit`, and `git diff --check` passed. One `npm run test:team` run hit the known `run timeout fails unfinished decomposed children and parent` timing flake; the target file passed alone and the rerun full suite passed with 1122 tests, 1120 pass, 2 skipped.
- Step 07: Discovery generated Task auto-run scheduler was added.
  - Modified files: `src/team/types.ts`, `src/team/task-run-service.ts`, `src/team/run-workspace.ts`, `src/team/run-workspace-attempts.ts`, `apps/team-console/src/api/team-types.ts`, `apps/team-console/src/tests/team-contract-drift.test.ts`, `test/team-run-workspace.test.ts`, `test/team-task-run-process.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`.
  - Runtime behavior: after Discovery dispatch/upsert succeeds, only current `created` / `updated` active generated Tasks are auto-run through `CanvasTaskRunService.createRun()`; blocked, stale, non-ready, and already-running children are skipped. The scheduler uses a real fixed concurrency pool of 3 and waits for generated runs to reach terminal state before refilling slots.
  - Audit behavior: generated runs carry `source.triggeredBy.type="discovery-generated-task"` with Discovery task/run/attempt and item metadata; attempts persist `discoveryGeneratedRuns[]` launch outcomes.
  - Codex review fix: two timing-sensitive tests were tightened outside the Step 07 runtime core: `test/team-orchestrator-decomposition.test.ts` now waits for child worker start before lowering timeout, and `test/team-parallel-foreach.test.ts` now asserts actual pool refill ordering instead of brittle end-order timing.
  - Review verification: focused Step 07 backend/workspace/store/role tests passed; `npm run test:team` passed with 1130 tests, 1128 pass, 2 skipped; Team Console contract drift test, Team Console `tsc`, top-level `npx tsc --noEmit`, `git diff --check`, empty staged diff, and LF EOL checks passed.
- Step 08A: Team Console Discovery data/API seam was added.
  - Modified files: `apps/team-console/src/api/team-api.ts`, `apps/team-console/src/app/use-team-console-live-data.ts`, `apps/team-console/src/fixtures/team-fixtures.ts`, `apps/team-console/src/tests/team-api.test.ts`, `apps/team-console/src/tests/app-live-data.test.tsx`, `apps/team-console/README.md`, `docs/team-runtime.md`, `docs/change-log.md`, and this requirements file.
  - API/data behavior: 5174 API abstraction now exposes `listGeneratedTasks(discoveryTaskId, options?)`; live mode calls encoded `GET /v1/team/tasks/:taskId/generated-tasks`, supports `includeArchived`, accepts `{ tasks }` and bare array, and treats 404 as an empty catalog for older local backends.
  - Mock behavior: fixture data now contains one Discovery root plus active/stale/archived generated children. `MockTeamApi.listTasks()` still returns root Tasks only; generated children are only reachable through `listGeneratedTasks()`, with archived children excluded by default.
  - Hook behavior: `useTeamConsoleLiveData()` maintains `generatedTasksByDiscoveryTaskId` and `discoverySummariesByTaskId`, fetches child catalogs only for root Tasks whose `canvasKind === "discovery"`, keeps generated Tasks out of root `tasks` state/main canvas, and merges generated child run summaries into `taskRunsByTaskId`.
  - Deferred behavior: no Discovery subcanvas, no root card summary surface, no failed dispatch count observer read, no ExecutionMap visual changes, no backend route/runtime changes, no `.pi/skills` changes.
  - Review verification: `npm --prefix apps/team-console test -- --run src/tests/team-api.test.ts` passed with 73 tests; `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx` passed with 28 tests. Broader Step 08A verification is tracked in the handoff report.
- Step 08B: Team Console Discovery root summary surface was added.
  - Modified files: `apps/team-console/src/graph/ExecutionMap.tsx`, `apps/team-console/src/graph/atlas-geometry.ts`, `apps/team-console/src/graph/execution-map.css`, `apps/team-console/src/app/App.tsx`, `apps/team-console/src/app/use-team-console-live-data.ts`, `apps/team-console/src/tests/execution-map-ui.test.tsx`, `apps/team-console/src/tests/app-live-data.test.tsx`, `apps/team-console/README.md`, `docs/team-runtime.md`, `docs/change-log.md`, and this requirements file.
  - UI behavior: root Discovery Tasks render with `Discovery` identity, `data-canvas-kind="discovery"`, Discovery-specific card styling, and an `items / active / stale / running` summary row sourced from `discoverySummariesByTaskId`.
  - Geometry behavior: Discovery root card height grows through `canvasTaskNodeHeight()`, so visual layout, drag hitbox, Dock flight and dependency geometry share the same card height.
  - Boundary behavior: generated child Tasks still do not enter root `tasks` state or main root canvas cards; Discovery subcanvas, generated child card rendering and failed dispatch observer counts remain deferred.
  - Review verification: focused ExecutionMap UI/live-data/contract drift tests, Team Console `tsc`, Team Console build, Team Console full Vitest, top-level `npx tsc --noEmit`, `git diff --check`, and 5174 mock browser verification passed.
- Step 08C: Team Console Discovery subcanvas catalog panel was added.
  - Modified files: `apps/team-console/src/app/App.tsx`, `apps/team-console/src/app/use-task-branch-stack.ts`, `apps/team-console/src/graph/execution-map.css`, `apps/team-console/src/tests/app-live-data.test.tsx`, `apps/team-console/README.md`, `docs/team-runtime.md`, `docs/change-log.md`, and this requirements file.
  - UI behavior: root Discovery Task action menus show `Discovery 子画布`; the toggle opens a child panel connected from the Task menu branch, sourced from `generatedTasksByDiscoveryTaskId[discoveryTaskId]`.
  - Catalog behavior: the panel lists non-archived generated children with title, item status, WorkUnit mode, latest run status, and stable data attrs for subcanvas/task/status/mode/run-state assertions.
  - Boundary behavior: generated child Tasks still do not enter root `tasks` state or main root canvas cards; generated child edit/run/cancel/delete/archive/observer/file-detail and failed dispatch observer counts remain deferred to later steps.
  - Review verification: focused App live-data / ExecutionMap UI tests passed. Broader Step 08C verification is tracked in the handoff report.
- Step 08D: Team Console generated Task run controls and observer integration was added.
  - Modified files: `apps/team-console/src/app/App.tsx`, `apps/team-console/src/app/use-task-branch-stack.ts`, `apps/team-console/src/graph/execution-map.css`, `apps/team-console/src/tests/app-live-data.test.tsx`, `apps/team-console/README.md`, `docs/team-runtime.md`, `docs/change-log.md`, and this requirements file.
  - UI behavior: generated child cards inside the Discovery subcanvas now expose run / stop / latest-run observer operations with stable `data-generated-action` selectors; run/stop call the existing Canvas Task run API adapter.
  - Observer behavior: generated observer state is nested under the root Discovery branch as `discoveryGeneratedObserver`, keeps `detailMode="discovery-subcanvas"` open, and reuses the existing `taskRunObserverByRunId` attempts/files effect for Worker / Checker process nodes and file detail panels.
  - Boundary behavior: generated child Tasks still do not enter root `tasks`, root `tasksById`, root `taskNodes`, or the root canvas. Generated child edit/archive/delete/reset-to-managed and failed dispatch diagnostics remain deferred to Step 08E.
  - Review verification: focused App live-data / root observer tests and Team Console `tsc` passed. Broader Step 08D verification is tracked in the handoff report.
- Step 08E1: generated managed WorkUnit snapshot and reset API seam was added.
  - Modified files: `src/team/types.ts`, `src/team/task-validation.ts`, `src/team/task-store.ts`, `src/team/routes.ts`, `apps/team-console/src/api/team-types.ts`, `apps/team-console/src/api/team-api.ts`, `apps/team-console/src/fixtures/team-fixtures.ts`, `test/team-task-store.test.ts`, `test/team-task-routes.test.ts`, `apps/team-console/src/tests/team-api.test.ts`, `apps/team-console/src/tests/team-contract-drift.test.ts`, `apps/team-console/README.md`, `docs/team-runtime.md`, `docs/change-log.md`.
  - Contract behavior: `TeamGeneratedTaskSource.latestManagedWorkUnit?: TeamWorkUnitDefinition` is optional for old generated records and validated as a full WorkUnit when present.
  - Store/API behavior: Discovery create, managed rerun, and customized rerun all refresh the latest managed snapshot. Public generated WorkUnit edits still mark `workUnitMode="customized"` and preserve the snapshot. `POST /v1/team/tasks/:taskId/generated-workunit/reset` restores visible `title/workUnit` from the snapshot and marks the generated Task back to `managed`.
  - Team Console seam: `CanvasTaskGateway.resetGeneratedTaskWorkUnit(taskId)` is implemented by both live and mock adapters; mock reset updates the generated catalog instead of returning a fake object.
  - Review verification: `test/team-task-store.test.ts` 27 passed, `test/team-task-routes.test.ts` 37 passed, Team Console API/contract tests 90 passed, `app-live-data.test.tsx` 35 passed, Team Console `tsc`, top-level `npx tsc --noEmit`, `git diff --check`, and empty staged diff passed.
- Step 08E2A: Team Console generated Task light edit/reset UI was added.
  - Modified files: `apps/team-console/src/app/App.tsx`, `apps/team-console/src/app/use-task-branch-stack.ts`, `apps/team-console/src/app/use-team-console-live-data.ts`, `apps/team-console/src/graph/execution-map.css`, `apps/team-console/src/tests/app-live-data.test.tsx`, `apps/team-console/README.md`, `docs/team-runtime.md`, `docs/change-log.md`, and this requirements file.
  - UI behavior: generated child cards in the Discovery subcanvas expose `data-generated-action="edit"` and `data-generated-action="reset-workunit"`; edit opens `data-generated-edit-task-id` panel from the Discovery subcanvas branch and only edits title / Leader / Worker / Checker.
  - Data behavior: generated edit resolves tasks from `tasksById ?? generatedTasksById`; generated title edits patch both visible `title` and `workUnit.title`; reset calls `resetGeneratedTaskWorkUnit(taskId)` and replaces only the generated catalog entry under `sourceDiscoveryTaskId`.
  - Boundary behavior: generated child Tasks still do not enter root `tasks`, root `tasksById`, root `taskNodes`, or root canvas. Archive and delete remain follow-up work.
  - Verification: `app-live-data.test.tsx` 39 passed, Team Console API/contract tests 90 passed, Team Console `tsc`, Team Console build/full Vitest, and top-level `npx tsc --noEmit` passed. Browser and diff hygiene evidence are tracked in the Step 08E2A delivery report.
- Step 08E2B: Team Console failed dispatch diagnostics were added.
  - Modified files: `apps/team-console/src/app/use-team-console-live-data.ts`, `apps/team-console/src/app/App.tsx`, `apps/team-console/src/graph/ExecutionMap.tsx`, `apps/team-console/src/graph/execution-map.css`, `apps/team-console/src/fixtures/team-fixtures.ts`, `apps/team-console/src/tests/app-live-data.test.tsx`, `apps/team-console/src/tests/execution-map-ui.test.tsx`, `apps/team-console/README.md`, `docs/team-runtime.md`, `docs/change-log.md`, and this requirements file.
  - Data behavior: 5174 data layer reads existing `listTaskRuns()` and `listTaskRunAttempts()` for root Discovery Tasks, selects the latest root run and latest attempt, and derives `discoveryDispatchDiagnosticsByTaskId` from `TeamAttemptMetadata.discoveryDispatch[]`.
  - UI behavior: root Discovery cards show blocked dispatch count and expose `data-discovery-failed-dispatch-count`; Discovery subcanvas panels show latest blocked item diagnostics with `data-discovery-dispatch-diagnostics-for`, `data-dispatch-blocked-count`, and `data-dispatch-item-id`.
  - Boundary behavior: only `status="blocked"` counts as failed dispatch. Missing/old metadata and failed attempt reads degrade to 0 diagnostics without hiding generated catalog; diagnostics do not create generated Tasks and generated children still do not enter root `tasks`, root `taskNodes`, or root canvas.
  - Verification: focused App live-data / ExecutionMap UI tests cover live data, UI, old metadata, and non-Discovery card behavior. Full Step 08E2B verification is tracked in the delivery report.
  - Review status: Codex accepted Step 08E2B with one non-blocking delivery report correction: browser console evidence should report the unrelated `/favicon.ico` 404 if observed, not claim an empty console.
- Step 08E2C: Team Console generated child archive/delete UI was added.
  - Modified files: `apps/team-console/src/app/App.tsx`, `apps/team-console/src/app/use-team-console-live-data.ts`, `apps/team-console/src/graph/execution-map.css`, `apps/team-console/src/tests/app-live-data.test.tsx`, `apps/team-console/README.md`, `docs/team-runtime.md`, `docs/change-log.md`, and this requirements file.
  - UI behavior: generated child cards in the Discovery subcanvas expose `data-generated-action="archive"` plus scoped confirm controls `data-generated-archive-confirm-for`, `data-generated-action="archive-confirm"` and `data-generated-action="archive-cancel"`.
  - Data behavior: confirm calls existing `CanvasTaskGateway.archiveTask(taskId)` / `POST /v1/team/tasks/:taskId/archive`; successful soft archive removes only that child from `generatedTasksByDiscoveryTaskId[sourceDiscoveryTaskId]` and updates root Discovery generated/active/stale/running summary while preserving blocked dispatch count.
  - State behavior: archiving a generated child clears that child's edit draft/warning/saving state, generated observer, and generated observer file detail selection, while keeping the root Discovery branch and Discovery subcanvas open.
  - Boundary behavior: generated child Tasks still do not enter root `tasks`, root `tasksById`, root `taskNodes`, or root canvas. This step adds no endpoint, no hard delete, no restore/unarchive, no backend route/store/runtime/dispatcher/scheduler change, and no diagnostics-to-task behavior.
  - Verification: focused App live-data tests cover mock success, state cleanup, live endpoint usage, and failure behavior. Full Step 08E2C verification is tracked in the delivery report.

## Product Decisions Locked

- Discovery runs in the 5174 Team Console, not in the old `/playground/team` UI.
- A Discovery node is a first-class canvas node, not a Source node.
- Discovery output is structured JSON. First version uses `items[]` by default.
- Each item must have a stable string `id`; `title` and `type` are recommended.
- `items[]` becomes real generated `TeamCanvasTask[]`.
- Generated Tasks are real Tasks: they can run, stop, show observer data, show files, and support light edit.
- Generated Tasks are displayed inside the Discovery node's independent subcanvas by default. They must not flood the main 5174 root canvas or the normal root Task list.
- Same `discoveryTaskId + item.id` reuses the same generated Task across Discovery reruns.
- New item id creates a new generated Task.
- Item id missing from the latest run marks the generated Task `stale`; it is not auto-archived and not auto-run.
- Generated Task source identity is locked: user edits must not change its Discovery owner, `sourceItemId`, latest item payload, or origin run metadata.
- User-edited generated WorkUnits are protected from rerun overwrite.
- Discovery success triggers automatic generated Task creation and automatic generated Task runs.
- Automatic generated runs use a fixed concurrency pool of 3 in v1.
- A dedicated dispatcher/decomposer agent designs per-item WorkUnits after Discovery output is known.
- Dispatcher/decomposer v1 may generate title, input prompt, output contract, and acceptance rules only. It must not choose worker/checker agents.
- Dispatcher/decomposer output must be strict JSON and must be schema-validated. Invalid output blocks the affected generated Task creation/run rather than launching low-quality work.
- Creation UX starts in 5174: Agent-assisted draft plus panel confirmation.
- A supporting runtime skill is expected later: `.pi/skills/team-discovery-creator/SKILL.md`. Do not create it until the dedicated skill step.

## Vocabulary

- Discovery Task: a `TeamCanvasTask` whose canvas kind is discovery. It runs a worker/checker cycle that must produce JSON with an `items[]` array.
- Discovery spec: the saved structured configuration that says what to discover and how discovered items should be dispatched.
- Dispatch goal: the user-confirmed instruction that says how each discovered item should become a useful Task. This is not a string concatenation of main goal plus item.
- Dispatcher/decomposer agent: the agent role that turns `global discovery context + item payload + dispatch goal` into a generated Task WorkUnit.
- Generated Task: a real `TeamCanvasTask` created from a discovery item. It is hidden from the normal root canvas by default and appears in the Discovery subcanvas.
- Managed WorkUnit: generated Task WorkUnit still controlled by the Discovery dispatch output.
- Customized WorkUnit: generated Task WorkUnit was edited by the user/Leader; Discovery reruns must not overwrite it unless the user explicitly resets it.
- Stale item task: generated Task whose `sourceItemId` did not appear in the latest Discovery result.

## Functional Requirements

### 1. Discovery creation

- 5174 provides a Discovery creation panel.
- The panel can ask an Agent to draft a Discovery spec from a user goal.
- The user must confirm structured spec before saving.
- Required creation fields:
  - title
  - leaderAgentId
  - generatedWorkerAgentId
  - generatedCheckerAgentId
  - discovery goal
  - item output key, default `items`
  - item id field, default `id`
  - required item fields, minimum `id`
  - recommended item fields, default `title`, `type`
  - dispatch goal
  - dispatcherAgentId
  - autoRun enabled, default true
  - autoRun concurrency, fixed 3 in v1

### 2. Discovery execution

- Running a Discovery Task converts it to a runtime `TeamTask` of type `discovery`, not normal.
- Worker/checker output validation must require parseable JSON containing the configured output key array.
- Each item must have a stable non-empty string id.
- Accepted Discovery result must be persisted as a standard record equivalent to `team/discovery-result-1`.
- If Discovery output is invalid, the Discovery run fails or completes with validation failure and must not create generated Tasks.

### 3. Dispatch and generated Task creation

- After a Discovery run succeeds, the system dispatches each active item.
- For each item, dispatcher/decomposer receives:
  - Discovery Task title and goal
  - Dispatch goal
  - item payload
  - item schema guidance
  - default worker/checker/output settings
- Dispatcher/decomposer returns strict JSON with:
  - generated Task title
  - WorkUnit input text
  - output contract text
  - acceptance rules
  - optional generated Task output ports if the spec allows them later
- Dispatcher/decomposer must echo the exact `item.id` it is designing for.
- Invalid dispatcher output blocks that item and records a dispatch error.
- Valid output creates or updates a generated Task.

### 4. Generated Task identity and reuse

- Identity key: `sourceDiscoveryTaskId + sourceItemId`.
- First appearance creates a generated Task.
- Later appearances reuse the same generated Task.
- Reuse always updates:
  - latest item payload
  - latest Discovery run id
  - latest Discovery attempt id
  - item status to `active`
  - last discovered timestamp
- Reuse updates WorkUnit only when the generated Task is still managed.
- If WorkUnit is customized, do not overwrite title/input/output contract/acceptance rules.
- Missing item ids after a rerun mark existing generated Tasks `stale`.
- Stale generated Tasks remain visible in the Discovery subcanvas, greyed or clearly labeled, and are not auto-run.

### 5. Generated Task running

- Active generated Tasks auto-run after dispatch if autoRun is enabled.
- Concurrency v1: maximum 3 active generated Task runs per Discovery dispatch batch.
- If a generated Task already has an active run, skip launching another and record `already_running`.
- Generated runs use the existing Canvas Task runner so observer, cancellation, checker, files, and downstream delivery remain the same.
- Generated runs must carry source metadata for audit.

### 6. 5174 UI behavior

- Main canvas displays Discovery root nodes.
- Normal root Task list and root canvas do not show generated Tasks by default.
- Discovery node opens an independent subcanvas.
- Subcanvas shows:
  - active generated Tasks
  - stale generated Tasks
  - each generated Task status and latest run summary
  - run observer and file detail via existing Task panels
  - dispatch errors per item
- Discovery root card should show item counts:
  - active
  - stale
  - failed dispatch
  - running/generated runs
- Generated Tasks in the subcanvas can be light-edited like current Tasks, but source identity fields are not editable.

### 7. Runtime skill

- Add `.pi/skills/team-discovery-creator/SKILL.md` in a later dedicated step only.
- The skill should support `/team-discovery`.
- It should guide user and Leader through:
  - discovery goal
  - item schema
  - dispatch goal
  - default worker/checker/dispatcher agents
  - preview full Discovery JSON
  - wait for explicit confirmation
  - call the REST API
- It must not start Discovery runs.
- It must not create normal Task as a substitute for Discovery.
- It must not modify Agent profiles, models, browser bindings, or unrelated skills.

## Data Contract Direction

Recommended additive fields:

```ts
type TeamCanvasTaskKind = "task" | "discovery";

type TeamGeneratedTaskItemStatus = "active" | "stale";
type TeamGeneratedTaskWorkUnitMode = "managed" | "customized";

interface TeamDiscoverySpec {
  schemaVersion: "team/discovery-spec-1";
  discoveryGoal: string;
  outputKey: string;
  itemIdField: "id";
  requiredItemFields: string[];
  recommendedItemFields?: string[];
  dispatchGoal: string;
  dispatcherAgentId: string;
  generatedWorkerAgentId: string;
  generatedCheckerAgentId: string;
  autoRun: { enabled: true; concurrency: 3 };
}

interface TeamGeneratedTaskSource {
  schemaVersion: "team/generated-task-source-1";
  sourceDiscoveryTaskId: string;
  sourceItemId: string;
  itemStatus: TeamGeneratedTaskItemStatus;
  itemPayload: Record<string, unknown>;
  latestDiscoveryRunId?: string;
  latestDiscoveryAttemptId?: string;
  latestDiscoveredAt?: string;
  workUnitMode: TeamGeneratedTaskWorkUnitMode;
  latestManagedWorkUnit?: TeamWorkUnitDefinition;
}
```

`TeamCanvasTask` should become:

```ts
interface TeamCanvasTask {
  canvasKind?: TeamCanvasTaskKind; // missing means "task" for old data
  discoverySpec?: TeamDiscoverySpec;
  generatedSource?: TeamGeneratedTaskSource;
  ...
}
```

`TeamWorkUnitDefinition` should support optional `outputCheck?: TeamTaskOutputCheck` so Canvas Task runs can reuse existing output validation logic.

## API Direction

- `GET /v1/team/tasks`
  - default returns root tasks only: normal root tasks plus Discovery root tasks.
  - excludes generated tasks by default.
  - later may support `includeGenerated=1`.
- `POST /v1/team/tasks`
  - accepts normal Task payloads exactly as today.
  - accepts Discovery Task payloads when `canvasKind="discovery"` and `discoverySpec` is valid.
- `PATCH /v1/team/tasks/:taskId`
  - normal Task update remains compatible.
  - generated Task light edit marks `generatedSource.workUnitMode="customized"` when WorkUnit fields change.
  - source identity fields cannot be changed by normal patch.
- `GET /v1/team/tasks/:taskId/generated-tasks`
  - returns generated Tasks for one Discovery Task, including active/stale state and latest run summary if available.
- `POST /v1/team/tasks/:taskId/generated-workunit/reset`
  - generated Task only.
  - restores visible `title/workUnit` from `generatedSource.latestManagedWorkUnit`.
  - marks `workUnitMode` back to `managed`.
  - rejects archived generated Tasks and old generated records without a latest managed snapshot.
- `POST /v1/team/discovery-drafts`
  - later draft endpoint for 5174 Agent-assisted spec creation.
  - not part of the first contract-only step unless explicitly assigned.

## Implementation Roadmap

### Step 01: Contract foundation

Add shared backend/frontend types, old-data defaults, and compile-time drift guard. Do not implement runtime behavior, UI, or skill yet.

### Step 02: Backend validation and TaskStore semantics

Validate Discovery Task and generated Task records, hide generated Tasks from default TaskStore root list, add generated-task store query helpers, and mark generated WorkUnit edits as customized. Do not add API routes in this step.

### Step 03: Task API routes and docs for Discovery catalog behavior

Expose Discovery Task creation through `/v1/team/tasks`, add generated-task query routes, preserve root list behavior, and document the additive API surface.

### Step 04: Discovery run output validation and persistence

Make Canvas Task runs support discovery type, require `items[]`, and persist a standardized Discovery result.

### Step 05: Dispatcher/decomposer role

Add a dedicated dispatch prompt/parser/runner contract. Validate strict JSON and produce generated WorkUnit drafts. This is not the old Plan `runDecomposer` split contract.

### Step 06: Generated Task upsert and rerun reuse

Implement `sourceDiscoveryTaskId + item.id` upsert, stale marking, managed/customized overwrite rules, and dispatch error recording.

### Step 07: Generated Task auto-run scheduler

Run active generated Tasks after dispatch with a fixed concurrency pool of 3. Record skipped/already-running/failed launch outcomes.

### Step 08A: Team Console Discovery data/API seam

Add the 5174 API/data seam for generated child catalogs and non-visual Discovery summary data. Do not build the subcanvas or visual card treatment yet.

Status: completed locally in Step 08A. See "Completed Local Steps" for exact files, behavior, and focused verification.

### Step 08B: Team Console Discovery summary surface

Surface Discovery summary affordances on root Discovery cards/menus without changing generated Task edit semantics.

Status: completed locally in Step 08B for root Discovery card identity and summary row. Discovery subcanvas catalog panel is tracked by Step 08C.

### Step 08C: Team Console Discovery subcanvas catalog panel

Add a Discovery-only action menu entry that opens an independent child panel from the existing Task menu branch. The panel shows the generated Task catalog for that Discovery root, including active/stale item status, managed/customized WorkUnit mode, and latest run status. Generated Tasks must still stay out of the root canvas. Do not add generated Task editing, run/cancel controls, or observer/file-detail integration in this step.

Status: completed locally in Step 08C for Discovery-only menu toggle and generated child catalog panel. Generated child edit/run/cancel/archive/observer/file-detail and failed dispatch observer counts remain separate follow-up work.

### Step 08D: Team Console generated Task run controls and observer integration

Reuse the generated child catalog from Step 08C to add carefully scoped generated Task run/cancel controls, latest-run observer integration, and generated run file details inside the Discovery subcanvas branch. This is intentionally separate because generated children are not root `taskNodes` and cannot blindly reuse the root Task branch lookup without breaking state ownership.

Status: completed locally in Step 08D for generated child run/cancel, latest-run observer, Worker / Checker process display and attempt file detail. Generated child light edit/reset and failed dispatch diagnostics remain separate Step 08E work.

### Step 08E1: Generated managed WorkUnit snapshot and reset API seam

Add a durable latest managed WorkUnit snapshot for generated Tasks, preserve that snapshot during Discovery reruns even when the visible generated Task has been customized, and expose a small reset-to-managed route/API adapter. This must be done before UI reset buttons; otherwise the UI would have no trustworthy managed WorkUnit to restore.

Status: completed locally in Step 08E1 for `latestManagedWorkUnit`, `TaskStore.resetGeneratedTaskWorkUnit()`, `POST /v1/team/tasks/:taskId/generated-workunit/reset`, and Team Console live/mock API adapter support. No 5174 UI was added in this step.

### Step 08E2A: Team Console generated Task light edit/reset UI

Use the Step 08E1 reset API to add generated child light edit/reset affordances in the Discovery subcanvas. This should respect locked generated source identity, customized WorkUnit protection, and the existing rule that generated child Tasks do not become root canvas cards.

Status: completed locally in Step 08E2A for generated child light edit and reset-to-managed UI.

### Step 08E2B: Team Console failed dispatch diagnostics

Surface failed dispatch diagnostics from existing Discovery attempt metadata in the root Discovery summary / subcanvas without adding new backend runtime behavior. This follows 08E2A so edit/reset UI does not get mixed with diagnostics rendering.

Status: completed locally in Step 08E2B for root Discovery blocked dispatch summary and Discovery subcanvas diagnostics. Generated archive/delete is tracked separately by Step 08E2C.

### Step 08E2C: Team Console generated child archive/delete UI

Add a scoped generated child cleanup affordance inside the Discovery subcanvas. This uses the existing Canvas Task soft archive route (`POST /v1/team/tasks/:taskId/archive`) through the existing Team Console API adapter, removes the archived generated child from the Discovery child catalog, updates root Discovery generated counts, and keeps generated children out of root `tasks`, root `taskNodes`, and the root canvas. This is not hard delete, restore, backend runtime work, or a new endpoint.

Status: completed locally in Step 08E2C for scoped generated child soft archive/delete UI.

### Step 09: `/team-discovery` runtime skill

Add the guarded conversation workflow for creating Discovery Tasks. Keep it separate from `/team-task`.

### Step 10: Integration verification and docs

Update docs, add mock/live fixtures, run browser verification at `http://127.0.0.1:5174/`, and capture measured evidence that generated Tasks do not flood the main canvas.

## Non-goals

- Do not resurrect or redesign old `/playground/team` UI.
- Do not change the main `/playground` product UI.
- Do not model Discovery as Canvas Source node.
- Do not create generated Tasks as root canvas nodes by default.
- Do not implement condition branches, wait-all merge, loops, nested Discovery, or arbitrary workflow engine in v1.
- Do not allow dispatcher to choose worker/checker agents in v1.
- Do not let Discovery rerun overwrite customized generated WorkUnits.
- Do not commit `.env`, `.data`, runtime artifacts, temp files, report outputs, unknown `.pi/skills/*/skills-lock.json`.
- Do not stage existing `.pi/skills/anthropics/skill-creator/**` deletions.

## Shared Verification Baseline

Run relevant focused tests for each step plus:

```powershell
npm --prefix apps/team-console test
npm --prefix apps/team-console run build
npx tsc --noEmit
git diff --check
```

For backend-only steps, use focused `node --test --import tsx ...` commands named in the step plan before the broader checks.

For UI steps, also verify the real entry point:

```text
http://127.0.0.1:5174/
```

Required browser evidence for UI steps:

- visible Discovery root node
- generated Tasks visible only inside Discovery subcanvas
- generated Tasks absent from root canvas by default
- active/stale counts visible
- at least one generated Task observer can open and display run state
- measured evidence such as DOM counts, bounding rects, data attributes, or screenshot path

## GLM Control Policy

- GLM must receive only one step at a time.
- Default: no stage, no commit.
- GLM must stop after completing the assigned step.
- Codex reviews diff, reruns verification, and decides whether to commit or prepare the next step.
- If a step assumption is wrong, GLM must stop and report instead of improvising architecture.
