# Step 07 Plan: Discovery Generated Task Auto-Run Scheduler

Date: 2026-05-31

## Goal

After Step 06 creates or reuses generated `TeamCanvasTask` records from a successful Discovery run, automatically run the active generated Tasks with the existing Canvas Task runner.

This step is backend runtime only. It must add the fixed v1 concurrency pool of 3, record launch diagnostics, and preserve generated run audit metadata. It must not add 5174 UI, creation UX, runtime skills, or new public routes. We are not building a workflow engine; we are wiring the one missing automatic launch step.

## Current Baseline

- Latest commit: `af0362a docs(team-console): record task chain validation`
- Branch state: `main...origin/main [ahead 6]`
- Stable tag already pushed to GitHub and Gitee: `stable/team-console-task-chain-2026-05-30`
- Discovery Steps 01-06 are completed locally but not staged or committed.
- Step 06 Codex review added one guardrail after GLM delivery:
  - `src/team/task-store.ts`: validate managed generated Task reuse before write.
  - `test/team-task-store.test.ts`: reject invalid managed generated WorkUnit updates and preserve the existing task.
- Step 06 review verification:
  - `node --test --import tsx test/team-task-store.test.ts`: 24 pass.
  - `node --test --import tsx test/team-task-run-process.test.ts`: 27 pass.
  - `node --test --import tsx test/team-run-workspace.test.ts`: 47 pass.
  - `npm run test:team`: first run hit the known decomposition timeout timing flake; targeted file passed; rerun full suite passed with 1122 tests, 1120 pass, 2 skipped.
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
- `src/team/task-run-service.ts`
- `src/team/task-store.ts`
- `src/team/run-workspace.ts`
- `src/team/run-workspace-attempts.ts`
- `apps/team-console/src/api/team-types.ts`
- `apps/team-console/src/tests/team-contract-drift.test.ts`
- `test/team-task-run-process.test.ts`
- `test/team-run-workspace.test.ts`
- `docs/team-runtime.md`
- `docs/change-log.md`

## Scope

Allowed production files:

- `src/team/types.ts`
- `src/team/task-run-service.ts`
- `src/team/run-workspace.ts`
- `src/team/run-workspace-attempts.ts`
- `apps/team-console/src/api/team-types.ts`
- `apps/team-console/src/tests/team-contract-drift.test.ts`

Allowed tests:

- `test/team-task-run-process.test.ts`
- `test/team-run-workspace.test.ts`

Allowed docs:

- `docs/team-runtime.md`
- `docs/change-log.md`

Do not modify:

- `src/team/routes.ts`
- `src/team/route-parsers.ts`
- `src/team/task-store.ts` unless a compile-time type adjustment is unavoidable; Step 06 store behavior is done.
- `src/team/task-validation.ts`
- `src/team/role-runner.ts`
- `src/team/role-prompt-contract.ts`
- `src/team/agent-profile-role-runner.ts`
- `src/team/canvas-task-attempt-runner.ts`
- `src/team/orchestrator.ts`
- `src/workers/team-worker.ts`
- `apps/team-console/src/**` except the two type/drift files explicitly allowed above.
- `apps/team-console/README.md`
- `.pi/skills/**`
- main `/playground` UI files.

## Required Behavior

### Generated run launch metadata

Add a separate attempt-level diagnostic record for generated Task auto-run launches. Do not overload the Step 06 `discoveryDispatch[]` statuses; that array answers "what happened when turning item -> generated Task". Step 07 needs a separate answer to "what happened when launching generated Task runs".

Recommended additive types in `src/team/types.ts`:

```ts
export type TeamDiscoveryGeneratedRunOutcomeStatus =
  | "started"
  | "skipped_already_running"
  | "skipped_not_runnable"
  | "failed";

export interface TeamDiscoveryGeneratedRunOutcome {
  itemId: string;
  generatedTaskId: string;
  status: TeamDiscoveryGeneratedRunOutcomeStatus;
  generatedRunId?: string;
  error?: string;
  createdAt: string;
}
```

Add optional `discoveryGeneratedRuns?: TeamDiscoveryGeneratedRunOutcome[]` to `TeamAttemptMetadata`.

Update `RunWorkspace` / `RunAttemptStore`:

- Add `recordAttemptDiscoveryGeneratedRunOutcomes(runId, taskId, attemptId, outcomes)`.
- Do not add the key when `outcomes.length === 0`.
- Normalize old attempts without the key exactly as today.
- Normalize malformed `discoveryGeneratedRuns` as absent, not as a crash.
- Preserve existing `discoveryDispatch[]` normalization.

Because `TeamAttemptMetadataPublic` is exposed to the 5174 client, update `apps/team-console/src/api/team-types.ts` and the drift guard deliberately.

### Generated run source audit

Generated runs should preserve Discovery origin metadata in `TeamRunState.source.triggeredBy`.

Extend the existing triggeredBy union with:

```ts
{
  type: "discovery-generated-task";
  discoveryTaskId: string;
  discoveryRunId: string;
  discoveryAttemptId: string;
  sourceItemId: string;
}
```

Requirements:

- Generated Task run state still has `source.type === "canvas-task"` and `source.taskId === generatedTask.taskId`.
- `triggeredBy.type` identifies the run as Discovery-generated.
- The metadata must reference the Discovery root task id, Discovery run id, Discovery attempt id, and item id.
- Update the frontend mirror type and drift guard.

### Auto-run scheduler semantics

In `src/team/task-run-service.ts`, after a successful Discovery run has finished Step 06 dispatch/upsert:

- Build the auto-run candidate list only from active generated Tasks that were created or updated for the latest Discovery result.
- Do not auto-run stale generated Tasks.
- Do not auto-run items with blocked dispatch outcomes.
- Do not auto-run generated Tasks whose `generatedSource.itemStatus !== "active"`.
- Do not auto-run generated Tasks whose current `status !== "ready"`; record `skipped_not_runnable`.
- If `discoverySpec.autoRun.enabled !== true`, do nothing. In v1 validation requires true, but do not assume future data is perfect.
- Use `discoverySpec.autoRun.concurrency` only if it is exactly `3`; otherwise clamp/fallback to `3`. The product contract is fixed concurrency 3 in v1.
- Maximum active generated Task runs launched by this Discovery batch at any moment must be 3.
- If a generated Task already has an active run (`queued`, `running`, or `paused`), do not launch another run. Record `skipped_already_running` with the existing run id if available.
- If launch fails for another reason, record `failed` with sanitized error text and continue the batch.
- A launch outcome must never convert the accepted Discovery run to failed.
- Starting generated runs must use the existing `CanvasTaskRunService.createRun()` path so worker/checker, observer, cancellation, output validation, files, and downstream delivery remain unchanged.
- Generated runs must call `createRun(generatedTaskId, { triggeredBy: { type: "discovery-generated-task", ... } })`.
- Do not call Plan orchestrator or `src/workers/team-worker.ts`.
- Do not create a new persistent queue file in this step.

Implementation shape:

- Keep Step 06 dispatch/upsert logic isolated.
- Prefer returning a small internal result from `dispatchDiscoveryGeneratedTasks(...)`, for example:

```ts
{
  attemptId: string;
  autoRunCandidates: Array<{ itemId: string; task: TeamCanvasTask }>;
}
```

- Add a helper such as `autoRunDiscoveryGeneratedTasks(...)`.
- The helper may be awaited after dispatch diagnostics are persisted. If it waits for generated runs to reach terminal state to enforce true concurrency 3, it must not mutate the Discovery run terminal status. This is acceptable for v1 tests. Do not fake concurrency by launching all runs immediately and merely chunking promises; that is not a concurrency pool, that is decorative math.
- If you choose a detached background queue instead, it must still be testable without asking the user to manually wait. The tests must wait for launch outcomes and generated run states.

## Tests To Add First

Add failing tests before implementation.

### `test/team-run-workspace.test.ts`

Add focused attempt metadata tests:

1. `recordAttemptDiscoveryGeneratedRunOutcomes` persists started/skipped/failed launch outcomes.
2. old attempts without `discoveryGeneratedRuns` still normalize without the key.
3. empty outcome arrays do not add the key.
4. malformed `discoveryGeneratedRuns` metadata is ignored as absent.

### `test/team-task-run-process.test.ts`

Add runtime tests:

1. `Step07: successful Discovery dispatch auto-runs active generated Tasks`.
   - Discovery emits at least two valid items.
   - Dispatcher creates valid WorkUnits.
   - Assert generated Tasks are created.
   - Assert each generated Task has exactly one run.
   - Assert generated run `source.triggeredBy.type === "discovery-generated-task"`.
   - Assert triggeredBy metadata references the Discovery root task id, Discovery run id, attempt id, and item id.
   - Assert attempt metadata contains `discoveryGeneratedRuns` with `started` outcomes and generated run ids.

2. `Step07: auto-run enforces concurrency 3`.
   - Discovery emits four valid items.
   - Generated Task worker should be gated so the first three generated runs remain active.
   - Assert only three generated workers start before releasing one gate.
   - Release one generated worker and assert the fourth starts only after capacity opens.
   - Assert final generated runs all become terminal.
   - Track `maxActiveGeneratedWorkers` in the fake runner and assert it never exceeds 3.

3. `Step07: already-running generated Task is skipped without failing Discovery`.
   - First Discovery run creates a generated Task and starts its generated run.
   - Keep that generated run active with a gated worker.
   - Rerun the Discovery root with the same item id.
   - Assert no second active run is launched for that generated Task.
   - Assert launch outcome is `skipped_already_running` and references the existing run id if available.
   - Assert the second Discovery run remains `completed`.

4. `Step07: not-ready generated Task launch is recorded as skipped_not_runnable or failed without failing Discovery`.
   - Create a generated Task via Discovery once.
   - Update that generated Task status to `drafting` through `TaskStore.update()`.
   - Rerun Discovery with the same item id.
   - Assert upsert/source metadata still updates.
   - Assert no new run starts for the drafting generated Task.
   - Assert launch outcome is `skipped_not_runnable` or `failed` with a clear error.
   - Assert Discovery run remains `completed`.

5. `Step07: blocked dispatch items and stale items are not auto-run`.
   - One item returns dispatcher `ok:false`.
   - One previous generated item becomes stale on rerun.
   - Assert neither blocked nor stale items receive new generated runs.
   - Assert launch outcomes only cover runnable active generated Tasks.

Keep tests deterministic. Do not rely on arbitrary sleeps when you can gate worker promises and wait for concrete run/attempt metadata.

## Implementation Notes

- Reuse `ACTIVE_RUN_STATUSES` and `TERMINAL_RUN_STATUSES` already in `task-run-service.ts`.
- Add a small helper to wait for a generated run to reach terminal state if your concurrency pool needs it. Poll `getRun(runId)` with a short interval and respect the parent signal.
- Do not use `setTimeout` without cleanup in tests. Use explicit deferred promises/gates.
- Do not start generated Tasks from `TaskStore` or `RunWorkspace`; the launch must go through `CanvasTaskRunService.createRun()`.
- Do not alter normal Task direct-run behavior.
- Do not alter downstream typed/control delivery behavior except for preserving it around the new auto-run call ordering.
- If `createRun()` throws `active task run already exists: <runId>`, normalize that to `skipped_already_running` rather than `failed`.
- Use the same `sanitizeDeliveryError()` limit/pattern for launch errors.
- Do not add user-visible frontend controls in this step. UI can wait until there is a stable API/runtime truth to show.

## Fix Impact Analysis

- Direct impact:
  - Discovery root Canvas Task success now launches generated Task runs.
  - Attempt metadata gains optional `discoveryGeneratedRuns[]`.
  - Generated run states gain a new `source.triggeredBy` variant.
- Indirect impact:
  - `GET /v1/team/tasks/:taskId/runs` for generated Tasks will now return auto-created runs after a Discovery parent succeeds.
  - Existing Step 06 test that asserted no auto-run must be updated or replaced; do not leave contradictory tests.
  - Normal root Task runs must remain unchanged.
  - Existing downstream typed/control delivery must remain best-effort and should not fail because auto-run launch has errors.
- Data compatibility:
  - Old run states do not have the new triggeredBy variant and remain valid.
  - Old attempt metadata does not have `discoveryGeneratedRuns` and must still load.
  - Malformed new metadata must be ignored, not crash observers.

## Verification Commands

Focused:

```powershell
node --test --import tsx test/team-run-workspace.test.ts
node --test --import tsx test/team-task-run-process.test.ts
npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts
npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json
```

Final:

```powershell
node --test --import tsx test/team-run-workspace.test.ts
node --test --import tsx test/team-task-run-process.test.ts
node --test --import tsx test/team-task-store.test.ts
node --test --import tsx test/team-role-prompt-contract.test.ts
node --test --import tsx test/team-role-runner.test.ts
node --test --import tsx test/team-agent-profile-runner.test.ts
npm run test:team
npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts
npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json
npx tsc --noEmit
git diff --check
git diff --stat -- src/team/types.ts src/team/task-run-service.ts src/team/run-workspace.ts src/team/run-workspace-attempts.ts apps/team-console/src/api/team-types.ts apps/team-console/src/tests/team-contract-drift.test.ts test/team-task-run-process.test.ts test/team-run-workspace.test.ts docs/team-runtime.md docs/change-log.md
git diff --numstat -- src/team/types.ts src/team/task-run-service.ts src/team/run-workspace.ts src/team/run-workspace-attempts.ts apps/team-console/src/api/team-types.ts apps/team-console/src/tests/team-contract-drift.test.ts test/team-task-run-process.test.ts test/team-run-workspace.test.ts docs/team-runtime.md docs/change-log.md
git ls-files --eol src/team/types.ts src/team/task-run-service.ts src/team/run-workspace.ts src/team/run-workspace-attempts.ts apps/team-console/src/api/team-types.ts apps/team-console/src/tests/team-contract-drift.test.ts test/team-task-run-process.test.ts test/team-run-workspace.test.ts docs/team-runtime.md docs/change-log.md
git diff --cached --stat
```

If `npm run test:team` hits the known `run timeout fails unfinished decomposed children and parent` timing flake, rerun `node --test --import tsx test/team-orchestrator-decomposition.test.ts` and then rerun `npm run test:team`. Report both runs honestly.

## Commit Message Suggestion

Do not commit unless explicitly authorized. If later committed after Codex review:

```text
feat(team): auto-run generated discovery tasks
```

## Delivery Report Template

Report:

1. Files changed.
2. Auto-run scheduler behavior, including candidate selection and concurrency limit.
3. Generated run audit metadata behavior.
4. Attempt metadata / launch outcome behavior.
5. Tests added, including which old/missing behavior each test catches.
6. Documentation updated.
7. Explicit confirmation that 5174 UI, routes, role prompt/parser, AgentProfile runner, Plan orchestrator, team worker, runtime skills, and main `/playground` were not changed.
8. Every verification command and result.
9. Diff stat and numstat, with a note on whether there is abnormal formatting noise.
10. EOL / formatter-only churn status.
11. Whether any plan assumption failed.

Do not stage or commit.

## Review Checklist For Codex

- Generated Tasks are launched only after valid Discovery dispatch/upsert.
- Blocked dispatch items are not launched.
- Stale generated Tasks are not launched.
- Active generated Tasks launch through `CanvasTaskRunService.createRun()`.
- Generated run `triggeredBy` metadata references Discovery task/run/attempt/item.
- Already-running generated Tasks are skipped with a diagnostic, not duplicated.
- Launch failures do not fail the accepted Discovery run.
- Concurrency is real: no more than 3 generated Task runs from the batch are active at once.
- Old attempt metadata and old run states remain readable.
- Team Console public type drift is updated intentionally.
- No 5174 UI or runtime skill work sneaks into this backend step.
