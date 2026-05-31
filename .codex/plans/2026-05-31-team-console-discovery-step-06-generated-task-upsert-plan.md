# Step 06 Plan: Discovery Generated Task Upsert

Date: 2026-05-31

## Goal

After a Discovery root Canvas Task succeeds and writes `discovery-result.json`, dispatch each discovered item through the Discovery dispatcher role and create or reuse real generated `TeamCanvasTask` records.

This step must implement identity reuse, managed/customized overwrite rules, stale marking, and dispatch outcome recording. It must not auto-run generated Tasks; that is Step 07. Do not touch the 5174 UI in this step. UI folks can wait; half-wired backend state is how you get haunted dashboards.

## Current Baseline

- Latest commit: `af0362a docs(team-console): record task chain validation`
- Branch state: `main...origin/main [ahead 6]`
- Stable tag already pushed to GitHub and Gitee: `stable/team-console-task-chain-2026-05-30`
- Step 01/01A local changes exist and are not committed:
  - `src/team/types.ts`
  - `src/team/public-contract.ts`
  - `apps/team-console/src/api/team-types.ts`
  - `apps/team-console/src/tests/team-contract-drift.test.ts`
- Step 02 local changes exist and are not committed:
  - `src/team/task-validation.ts`
  - `src/team/task-store.ts`
  - `test/team-task-store.test.ts`
- Step 03 local changes exist and are not committed:
  - `src/team/routes.ts`
  - `src/team/route-parsers.ts`
  - `test/team-task-routes.test.ts`
  - `docs/team-runtime.md`
  - `apps/team-console/README.md`
  - `docs/change-log.md`
- Step 04 local changes exist and are not committed:
  - `src/team/types.ts`
  - `src/team/output-validator.ts`
  - `src/team/task-run-service.ts`
  - `src/team/canvas-task-attempt-runner.ts`
  - `test/team-output-validator.test.ts`
  - `test/team-task-run-process.test.ts`
  - `docs/team-runtime.md`
  - `docs/change-log.md`
- Step 05 local changes exist and are not committed:
  - `src/team/role-runner.ts`
  - `src/team/role-prompt-contract.ts`
  - `src/team/agent-profile-role-runner.ts`
  - `test/team-role-prompt-contract.test.ts`
  - `test/team-role-runner.test.ts`
  - `test/team-agent-profile-runner.test.ts`
  - `docs/team-runtime.md`
  - `docs/change-log.md`
- Step 05 review verification:
  - `node --test --import tsx test/team-role-prompt-contract.test.ts` passed with 11 tests.
  - `node --test --import tsx test/team-role-runner.test.ts` passed with 10 tests.
  - `node --test --import tsx test/team-agent-profile-runner.test.ts` passed with 59 tests.
  - `npm run test:team` passed with 1108 tests, 1106 pass, 2 skipped.
  - Team Console contract drift test, Team Console `tsc`, top-level `npx tsc --noEmit`, and `git diff --check` passed.
- Relevant requirement file:
  - `.codex/plans/2026-05-30-team-console-discovery-requirements.md`

## Must-Read Files

- `AGENTS.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`
- `.codex/plans/2026-05-31-team-console-discovery-step-06-generated-task-upsert-plan.md`
- `src/team/types.ts`
- `src/team/task-store.ts`
- `src/team/task-validation.ts`
- `src/team/task-run-service.ts`
- `src/team/run-workspace.ts`
- `src/team/run-workspace-attempts.ts`
- `src/team/role-runner.ts`
- `test/team-task-store.test.ts`
- `test/team-task-run-process.test.ts`
- `test/team-run-workspace.test.ts`

## Scope

Allowed production files:

- `src/team/types.ts`
- `src/team/run-workspace.ts`
- `src/team/run-workspace-attempts.ts`
- `src/team/task-store.ts`
- `src/team/task-validation.ts` only if needed for shared internal input types or validation reuse.
- `src/team/task-run-service.ts`

Allowed tests:

- `test/team-task-store.test.ts`
- `test/team-task-run-process.test.ts`
- `test/team-run-workspace.test.ts` only if new attempt metadata normalization needs direct coverage.

Allowed docs:

- `docs/team-runtime.md`
- `docs/change-log.md`

Do not modify:

- `src/team/routes.ts`
- `src/team/route-parsers.ts`
- `src/team/role-runner.ts`
- `src/team/role-prompt-contract.ts`
- `src/team/agent-profile-role-runner.ts`
- `src/team/canvas-task-attempt-runner.ts`
- `src/team/orchestrator.ts`
- `src/workers/team-worker.ts`
- `apps/team-console/src/**`
- `apps/team-console/README.md`
- `.pi/skills/**`
- main `/playground` UI files

## Required Behavior

### Attempt dispatch outcome metadata

Add a small persisted outcome record for Discovery dispatch results.

Recommended additive type in `src/team/types.ts`:

```ts
export type TeamDiscoveryDispatchOutcomeStatus = "created" | "updated" | "blocked" | "stale_marked";

export interface TeamDiscoveryDispatchOutcome {
  itemId: string;
  status: TeamDiscoveryDispatchOutcomeStatus;
  generatedTaskId?: string;
  workUnitMode?: TeamGeneratedTaskWorkUnitMode;
  error?: string;
  createdAt: string;
}
```

Add optional `discoveryDispatch?: TeamDiscoveryDispatchOutcome[]` to `TeamAttemptMetadata`.

Update `RunWorkspace` / `RunAttemptStore`:

- Add `recordAttemptDiscoveryDispatchOutcomes(runId, taskId, attemptId, outcomes)`.
- Do not add the key when `outcomes.length === 0`.
- Normalize old attempts without the key exactly as today.
- Normalize malformed `discoveryDispatch` as absent, not as a crash.

### TaskStore generated upsert primitives

Add internal TaskStore methods rather than abusing the public `update()` path. Public `update()` intentionally rejects `generatedSource` and marks WorkUnit edits as `customized`; Discovery upsert needs controlled identity updates without turning managed WorkUnits into customized ones.

Recommended methods:

```ts
async upsertGeneratedTaskFromDiscovery(input: {
  sourceDiscoveryTaskId: string;
  sourceItemId: string;
  itemPayload: Record<string, unknown>;
  latestDiscoveryRunId: string;
  latestDiscoveryAttemptId: string;
  latestDiscoveredAt: string;
  leaderAgentId: string;
  generatedWorkerAgentId: string;
  generatedCheckerAgentId: string;
  workUnit: {
    title: string;
    input: { text: string };
    outputContract: { text: string };
    acceptance: { rules: string[] };
  };
}): Promise<{ task: TeamCanvasTask; created: boolean; workUnitUpdated: boolean }>;

async markGeneratedTasksStaleForDiscovery(
  discoveryTaskId: string,
  activeSourceItemIds: ReadonlySet<string>,
  input: { latestDiscoveryRunId: string; latestDiscoveryAttemptId: string; latestDiscoveredAt: string },
): Promise<TeamCanvasTask[]>;
```

Required semantics:

- Identity key is `sourceDiscoveryTaskId + sourceItemId`.
- First active appearance creates a generated Task:
  - `title` from dispatcher draft.
  - `leaderAgentId` from Discovery root.
  - `workUnit.title/input/outputContract/acceptance` from dispatcher draft.
  - `workUnit.workerAgentId` from `discoverySpec.generatedWorkerAgentId`.
  - `workUnit.checkerAgentId` from `discoverySpec.generatedCheckerAgentId`.
  - `status: "ready"`.
  - `generatedSource.schemaVersion: "team/generated-task-source-1"`.
  - `generatedSource.itemStatus: "active"`.
  - `generatedSource.workUnitMode: "managed"`.
  - latest run / attempt / discovered timestamp set from the Discovery run.
- Later appearance with the same identity reuses the existing generated Task.
- Reuse always updates:
  - `generatedSource.itemPayload`
  - `generatedSource.latestDiscoveryRunId`
  - `generatedSource.latestDiscoveryAttemptId`
  - `generatedSource.latestDiscoveredAt`
  - `generatedSource.itemStatus = "active"`
- Reuse updates `title` and `workUnit` only when `generatedSource.workUnitMode === "managed"`.
- Reuse must not overwrite `title`, `workUnit.title`, `workUnit.input.text`, `workUnit.outputContract.text`, or `workUnit.acceptance.rules` when `workUnitMode === "customized"`.
- Stale marking:
  - For generated Tasks under the same Discovery root whose `sourceItemId` is not in the latest result, set `generatedSource.itemStatus = "stale"`.
  - Do not archive stale Tasks.
  - Do not alter stale Task WorkUnits.
  - Do not mark generated Tasks belonging to other Discovery roots.

Archive behavior is not defined by product requirements yet. Do not invent resurrection logic. If an archived generated Task creates ambiguity, leave it out of this step and report it as a follow-up note instead of creating duplicate magic.

### Canvas Task run integration

Update `src/team/task-run-service.ts`:

- When `canvasTask.canvasKind === "discovery"` and the attempt outcome is succeeded:
  - read `discovery-result.json` using `workspace.readDiscoveryResult(runId, task.id, attemptId)`.
  - if missing, record a blocked dispatch outcome and do not throw.
  - use `canvasTask.discoverySpec` for dispatch context and default generated worker/checker ids.
  - call `roleRunner.runDiscoveryDispatcher(input)` once per item if available.
  - if `runDiscoveryDispatcher` is missing, record blocked outcomes for all items and do not throw.
  - pass `dispatcherProfileId: discoverySpec.dispatcherAgentId` in `setProfileIds(...)` when the role runner is profile-aware.
  - valid dispatcher output creates or updates generated Tasks through TaskStore upsert.
  - invalid dispatcher output records `blocked` with the parser error and does not create/update that item.
  - after processing latest active items, mark missing generated Tasks stale.
  - persist all created/updated/blocked/stale outcomes to attempt metadata.
- Discovery dispatch failures must not change the accepted Discovery run from `completed` to failed.
- Do not start any generated Task runs in this step.
- Do not call `CanvasTaskRunService.createRun()` for generated Tasks in this step.
- Existing downstream typed/control delivery should continue to be best-effort and should not be converted into Discovery dispatch logic.

## Tests To Add First

Add failing tests before implementation.

### `test/team-task-store.test.ts`

Add focused store tests:

1. `upsertGeneratedTaskFromDiscovery` creates a managed generated Task with active source metadata.
   - Assert default `list()` hides it.
   - Assert `listGeneratedForDiscoveryTask()` returns it.
   - Assert worker/checker agents are the generated defaults, not dispatcher or Discovery worker.
2. Reusing the same `sourceDiscoveryTaskId + sourceItemId` updates an existing managed WorkUnit and latest source metadata.
3. Reusing a customized generated Task updates only source metadata and preserves user-edited title/workUnit.
4. `markGeneratedTasksStaleForDiscovery` marks only missing generated Tasks under the same Discovery root as stale and does not archive them.

### `test/team-run-workspace.test.ts`

Only touch this file if you add `discoveryDispatch` metadata. Add focused coverage that:

1. `recordAttemptDiscoveryDispatchOutcomes()` writes outcomes to attempt metadata.
2. old attempts without `discoveryDispatch` still normalize without the key.
3. empty outcome arrays do not add the key.

### `test/team-task-run-process.test.ts`

Add runtime tests around `CanvasTaskRunService`:

1. Successful Discovery run dispatches items and creates generated Tasks without starting generated runs.
   - Use a Discovery root Task with two valid items.
   - Use a runner that succeeds worker/checker and implements `runDiscoveryDispatcher`.
   - Assert Discovery run stays `completed`.
   - Assert generated tasks exist via `taskStore.listGeneratedForDiscoveryTask(discovery.taskId)`.
   - Assert generated tasks are `ready`, source status `active`, source run/attempt ids set, and WorkUnit uses dispatcher draft plus generated worker/checker ids.
   - Assert `service.listRuns(generatedTaskId)` is empty for each generated Task.
   - Assert attempt `discoveryDispatch` includes `created` outcomes.
2. Rerunning Discovery with same and changed item ids reuses managed generated Tasks and marks missing old ids stale.
   - First run emits `vultr` and `hetzner`.
   - Second run emits updated `vultr` and new `ovh`.
   - Assert `vultr` keeps the same generated `taskId` and receives updated WorkUnit/source metadata.
   - Assert `hetzner` is stale.
   - Assert `ovh` is created.
3. Customized generated WorkUnit is protected on rerun.
   - After first run, update the generated Task through public `taskStore.update(..., { workUnit })` so `workUnitMode` becomes `customized`.
   - Rerun Discovery with same item and a different dispatcher draft.
   - Assert source metadata updates but customized title/workUnit remains unchanged.
4. Invalid dispatcher output blocks only that item and records an error.
   - One item returns `ok:false`, one item returns `ok:true`.
   - Assert valid item creates a generated Task.
   - Assert blocked item has no generated Task.
   - Assert Discovery run remains `completed`.
   - Assert attempt `discoveryDispatch` includes one `blocked` outcome with an error.
5. Missing `runDiscoveryDispatcher` support is handled.
   - Use an existing fake runner that does not implement `runDiscoveryDispatcher`.
   - Assert Discovery run remains `completed`, no generated Tasks are created, and blocked outcomes explain missing dispatcher support.

Keep these tests deterministic. Do not wait for real timers beyond the existing `waitForTerminalRun()` polling helper.

## Implementation Notes

- Prefer a private helper in `task-run-service.ts` such as `dispatchDiscoveryGeneratedTasks(...)` to keep `runToCompletion()` readable.
- Use the same `roleRunner` instance that ran worker/checker for dispatch so profile-aware runners can use the already configured profile ids.
- Set `dispatcherProfileId` before the attempt starts:

```ts
dispatcherProfileId: canvasTask.discoverySpec?.dispatcherAgentId
```

- Since `runDiscoveryDispatcher` is optional, guard it:

```ts
if (typeof roleRunner.runDiscoveryDispatcher !== "function") { ...blocked outcomes... }
```

- Do not throw from dispatch for ordinary invalid dispatcher output. Record `blocked` and continue the batch.
- Use one timestamp per dispatch batch unless tests require distinct values. Stable tests are more valuable than pretending timestamps are meaningful here.
- Use `item.id` as the source item id. Step 04 validation already enforces stable string ids.
- Do not derive generated task prompts by string concatenating Discovery goal and item data. Use dispatcher draft output.
- Do not allow dispatcher output to set worker/checker; Step 05 parser already blocks those fields.
- Do not include `outputPorts` or `outputCheck` in generated WorkUnits in this step.
- Keep generated Tasks hidden from default `TaskStore.list()` through the Step 02 behavior.
- Preserve existing line endings and style. TypeScript files use tabs; match local style rather than running a broad formatter.

## Fix Impact Analysis

- Direct impact:
  - `TaskStore` gains internal generated upsert/stale helpers.
  - `CanvasTaskRunService` gains post-success Discovery dispatch behavior.
  - `RunWorkspace` / attempt metadata gain optional `discoveryDispatch` diagnostics.
- Indirect impact:
  - Existing Step 04 Discovery output tests using runners without `runDiscoveryDispatcher` must still complete the Discovery run; they may now record blocked dispatch outcomes but must not fail the accepted Discovery run.
  - Normal Canvas Task runs must remain unchanged.
  - Existing downstream typed/control delivery must remain best-effort and independent.
- Data structure compatibility:
  - `TeamAttemptMetadata.discoveryDispatch` is optional; old attempt files must still load.
  - `TeamGeneratedTaskSource` shape is unchanged.
  - No frontend public contract changes are required unless TypeScript shared types force drift. If shared DTOs change, update the Team Console drift guard deliberately.

## Verification Commands

Focused:

```powershell
node --test --import tsx test/team-task-store.test.ts
node --test --import tsx test/team-task-run-process.test.ts
```

If `test/team-run-workspace.test.ts` is touched:

```powershell
node --test --import tsx test/team-run-workspace.test.ts
```

Final:

```powershell
node --test --import tsx test/team-task-store.test.ts
node --test --import tsx test/team-task-run-process.test.ts
node --test --import tsx test/team-run-workspace.test.ts
node --test --import tsx test/team-role-prompt-contract.test.ts
node --test --import tsx test/team-role-runner.test.ts
node --test --import tsx test/team-agent-profile-runner.test.ts
npm run test:team
npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts
npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json
npx tsc --noEmit
git diff --check
git diff --stat -- src/team/types.ts src/team/run-workspace.ts src/team/run-workspace-attempts.ts src/team/task-store.ts src/team/task-validation.ts src/team/task-run-service.ts test/team-task-store.test.ts test/team-task-run-process.test.ts test/team-run-workspace.test.ts docs/team-runtime.md docs/change-log.md
git diff --numstat -- src/team/types.ts src/team/run-workspace.ts src/team/run-workspace-attempts.ts src/team/task-store.ts src/team/task-validation.ts src/team/task-run-service.ts test/team-task-store.test.ts test/team-task-run-process.test.ts test/team-run-workspace.test.ts docs/team-runtime.md docs/change-log.md
git ls-files --eol src/team/types.ts src/team/run-workspace.ts src/team/run-workspace-attempts.ts src/team/task-store.ts src/team/task-validation.ts src/team/task-run-service.ts test/team-task-store.test.ts test/team-task-run-process.test.ts test/team-run-workspace.test.ts docs/team-runtime.md docs/change-log.md
git diff --cached --stat
```

If `src/team/task-validation.ts` or `test/team-run-workspace.test.ts` is not touched, omit it from scoped diff/EOL commands and state that explicitly.

## Commit Message Suggestion

Do not commit unless explicitly authorized. If later committed after Codex review:

```text
feat(team): upsert generated tasks from discovery results
```

## Delivery Report Template

Report:

1. Files changed.
2. Store behavior added, specifically upsert identity, managed/customized overwrite rule, and stale marking.
3. Runtime behavior added, specifically Discovery success dispatch, generated Task creation/reuse, blocked dispatch handling, and no auto-run.
4. Attempt metadata / dispatch outcome behavior added.
5. Tests added, including which old/missing behavior each test would have caught.
6. Documentation updated.
7. Explicit confirmation that generated Task auto-run scheduler, routes, UI, role prompt/parser, AgentProfile runner, and `.pi/skills` were not changed.
8. Every verification command and result.
9. Diff stat and numstat, with a note on whether there is abnormal formatting noise.
10. EOL / formatter-only churn status.
11. Whether any plan assumption failed.

Do not stage or commit.

## Review Checklist For Codex

- Discovery success creates generated Tasks only through `discovery-result.json` and dispatcher output.
- Generated identity reuses `sourceDiscoveryTaskId + sourceItemId`.
- Managed generated WorkUnits are updated on rerun.
- Customized generated WorkUnits are protected on rerun while source metadata still updates.
- Missing items become stale and are not archived.
- Invalid dispatcher output blocks only that item and records an outcome.
- Missing optional `runDiscoveryDispatcher` support does not fail accepted Discovery runs.
- No generated Task runs are started in this step.
- Default Task list still hides generated Tasks.
- Existing normal Task runs and downstream delivery behavior remain unchanged.
