# Step 04 Plan: Discovery Run Output Validation And Persistence

Date: 2026-05-30

## Goal

Make a Discovery root Canvas Task actually run as a runtime `TeamTask` of type `discovery`, require accepted output to contain the configured item array with stable item ids, and persist the accepted item list as the standard `team/discovery-result-1` record.

This step deliberately stops before dispatcher/decomposer, generated Task upsert, stale marking, auto-run scheduling, and UI. Those are later steps. If GLM tries to jump there, it will make a mess that looks productive and costs us review time. Keep the knife small.

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
- Step 03 review verification:
  - `node --test --import tsx test/team-task-routes.test.ts` passed with 35 tests.
  - `node --test --import tsx test/team-task-store.test.ts` passed with 19 tests.
  - `npm run test:team` passed with 1090 tests, 1088 pass, 2 skipped.
  - `npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts` passed with 12 tests.
  - `npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json` passed.
  - `npx tsc --noEmit` passed.
  - `git diff --check` passed.
- Relevant requirement file:
  - `.codex/plans/2026-05-30-team-console-discovery-requirements.md`

## Must-Read Files

- `AGENTS.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`
- `.codex/plans/2026-05-30-team-console-discovery-step-04-run-output-validation-plan.md`
- `src/team/types.ts`
- `src/team/output-validator.ts`
- `src/team/task-run-service.ts`
- `src/team/canvas-task-attempt-runner.ts`
- `src/team/run-workspace.ts`
- `src/team/run-workspace-attempts.ts`
- `test/team-output-validator.test.ts`
- `test/team-task-run-process.test.ts`
- `test/team-canvas-attempt-lifecycle.test.ts`

## Scope

Allowed production files:

- `src/team/types.ts`
- `src/team/output-validator.ts`
- `src/team/task-run-service.ts`
- `src/team/canvas-task-attempt-runner.ts`

Allowed tests:

- `test/team-output-validator.test.ts`
- `test/team-task-run-process.test.ts`
- `test/team-canvas-attempt-lifecycle.test.ts` only if a small runner-level test is cleaner than adding everything to service tests.

Allowed docs:

- `docs/team-runtime.md`
- `docs/change-log.md`

Do not modify:

- `src/team/routes.ts`
- `src/team/route-parsers.ts`
- `src/team/task-store.ts`
- `src/team/task-validation.ts`
- `src/team/orchestrator.ts`
- `src/team/role-prompt-contract.ts`
- `src/team/agent-profile-role-runner.ts`
- `apps/team-console/src/**`
- `apps/team-console/README.md`
- `.pi/skills/**`
- main `/playground` UI files

## Required Behavior

### Canvas Task to runtime Task mapping

Update the Canvas Task run conversion in `src/team/task-run-service.ts`:

- Normal root Tasks and generated Tasks continue to run as runtime `type: "normal"`.
- Discovery root Tasks (`canvasKind === "discovery"`) run as runtime `type: "discovery"`.
- Discovery runtime Tasks include `discovery: { outputKey: canvasTask.discoverySpec.outputKey }`.
- Runtime Tasks preserve `workUnit.outputCheck` as `TeamTask.outputCheck`.
- Bound input prompt text behavior must stay compatible with current runs.
- Existing run source metadata (`state.source.type === "canvas-task"`, `taskId`, `triggeredBy`, `boundInputs`) must not change.

### Output validation and parsed items

`src/team/output-validator.ts` already validates `task.type === "discovery"` by deriving `json_items` from `task.discovery.outputKey`. Extend this carefully:

- Successful `json_items` validation should expose the parsed array as `items?: Array<Record<string, unknown>>` on `TeamOutputValidationResult`.
- This optional field should be present for `kind === "discovery"` and may also be present for `kind === "json_items"`.
- Do not change existing failure check names:
  - `json_parse`
  - `outputKey_array`
  - `item_object`
  - `item_stable_id`
  - `required_field`
- Do not weaken referenced-file safety.
- Do not broaden `allowDirectArray` for Discovery. Discovery still requires the configured output key object.

### Discovery result persistence

Update `src/team/canvas-task-attempt-runner.ts`:

- After checker passes and accepted output validation succeeds, write `accepted-result.md` as today.
- For `task.type === "discovery"`:
  - require `task.discovery.outputKey`
  - require the accepted validation to contain parsed `items`
  - require every item to have non-empty string `id`
  - write `discovery-result.json` through `workspace.writeDiscoveryResult()`
  - record shape:

```ts
{
  schemaVersion: "team/discovery-result-1",
  taskId: task.id,
  attemptId,
  outputKey: task.discovery.outputKey,
  items,
  sourceRef,
  createdAt: new Date().toISOString()
}
```

- Prefer a file-backed `sourceRef`. If validation source is `checker.resultContent`, use the `accepted-result.md` ref returned by `writeAcceptedResult()` instead.
- Keep attempt `resultRef` pointing at `accepted-result.md` unless there is a concrete reason to change it. The new standard record is an additional attempt file, not a replacement for the accepted text result in this step.
- If Discovery validation fails, the run must be `completed_with_failures`, the Task state must be `failed`, and no `discovery-result.json` should exist.
- If a normal Task has `workUnit.outputCheck`, invalid accepted output must fail the Canvas Task run instead of being accepted.

## Tests To Add First

Add failing tests before implementation. Recommended test locations:

### `test/team-output-validator.test.ts`

Add or adjust focused tests:

1. Discovery validator returns parsed `items` for a valid configured output key.
   - Input: runtime task `type: "discovery"`, `discovery.outputKey = "vendors"`.
   - Content: `{"vendors":[{"id":"vultr","name":"Vultr"}]}`.
   - Assert `result.ok === true`, `result.kind === "discovery"`, and `result.items` equals the parsed array.

2. JSON items outputCheck also returns parsed `items` if the implementation exposes it for non-Discovery `json_items`.
   - Keep this test small and do not turn it into a broad validator rewrite.

### `test/team-task-run-process.test.ts`

Use the existing `CanvasTaskRunService` test harness because it exercises the real Canvas Task conversion and background run path.

Add tests:

1. Discovery Canvas Task run writes `discovery-result.json` after accepted output.
   - Create a Discovery root Task through `TaskStore.create()` with valid `discoverySpec` and `canvasKind: "discovery"`.
   - Use a custom `TeamRoleRunner` whose checker returns `resultContent: JSON.stringify({ vendors: [{ id: "vultr", name: "Vultr" }] })`.
   - Run through `CanvasTaskRunService.createRun()`.
   - Wait for terminal state.
   - Assert final run status `completed`, Task state `succeeded`.
   - Assert `workspace.readDiscoveryResult(runId, taskId, attemptId)` returns `team/discovery-result-1`, `outputKey === "vendors"`, and item ids match.
   - Assert the attempt file list includes `accepted-result.md` and `discovery-result.json`.

2. Discovery Canvas Task run rejects invalid output and writes no standard result.
   - Checker returns `{"vendors":[{"name":"Missing id"}]}` or missing `vendors`.
   - Assert final status `completed_with_failures`.
   - Assert Task state `failed`.
   - Assert error summary mentions output validation / stable id.
   - Assert `workspace.readDiscoveryResult(...)` returns `null`.

3. Normal Canvas Task run honors `workUnit.outputCheck`.
   - Create a normal Task with `workUnit.outputCheck: { type: "json_object", requiredFields: ["summary"] }`.
   - Checker returns JSON missing `summary`.
   - Assert final status `completed_with_failures`.
   - This test proves `task-run-service.ts` actually passes `workUnit.outputCheck` into the runtime `TeamTask`.

Only add `test/team-canvas-attempt-lifecycle.test.ts` coverage if it helps isolate `CanvasTaskAttemptRunner` persistence. Do not duplicate the same behavior in three files for no reason.

## Implementation Notes

- Prefer adding optional `items?: Array<Record<string, unknown>>` to `TeamOutputValidationResult` rather than reparsing JSON in `CanvasTaskAttemptRunner`.
- Keep `okResult()` / `failResult()` call sites compatible by making the new value optional.
- In `validateJsonItems()`, return the filtered array only after every item is confirmed to be a plain object and required fields have passed.
- Discovery output requires item `id` because `getOutputCheckForTask()` derives `requiredFields: ["id"]`.
- Normal `json_items` outputCheck should respect its configured `requiredFields`; do not silently require `id` unless the check asks for it.
- Do not import `TaskStore` or route concepts into the runner.
- Do not move `writeDiscoveryResult()` out of `RunWorkspace`; it already exists.
- Do not touch Plan orchestrator discovery behavior. It already has its own standard-result path and fallback legacy parsing.
- Do not add generated Task creation here. The only new durable artifact from a successful Discovery run is `discovery-result.json`.

## Verification Commands

Focused:

```powershell
node --test --import tsx test/team-output-validator.test.ts
node --test --import tsx test/team-task-run-process.test.ts
```

If `test/team-canvas-attempt-lifecycle.test.ts` is touched:

```powershell
node --test --import tsx test/team-canvas-attempt-lifecycle.test.ts
```

Final:

```powershell
node --test --import tsx test/team-output-validator.test.ts
node --test --import tsx test/team-task-run-process.test.ts
node --test --import tsx test/team-task-routes.test.ts
node --test --import tsx test/team-task-store.test.ts
npm run test:team
npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts
npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json
npx tsc --noEmit
git diff --check
git diff --stat -- src/team/types.ts src/team/output-validator.ts src/team/task-run-service.ts src/team/canvas-task-attempt-runner.ts test/team-output-validator.test.ts test/team-task-run-process.test.ts test/team-canvas-attempt-lifecycle.test.ts docs/team-runtime.md docs/change-log.md
git diff --numstat -- src/team/types.ts src/team/output-validator.ts src/team/task-run-service.ts src/team/canvas-task-attempt-runner.ts test/team-output-validator.test.ts test/team-task-run-process.test.ts test/team-canvas-attempt-lifecycle.test.ts docs/team-runtime.md docs/change-log.md
git ls-files --eol src/team/types.ts src/team/output-validator.ts src/team/task-run-service.ts src/team/canvas-task-attempt-runner.ts test/team-output-validator.test.ts test/team-task-run-process.test.ts test/team-canvas-attempt-lifecycle.test.ts docs/team-runtime.md docs/change-log.md
git diff --cached --stat
```

If `test/team-canvas-attempt-lifecycle.test.ts` is not touched, omit it from scoped diff/EOL commands and state that explicitly.

## Commit Message Suggestion

Do not commit unless explicitly authorized. If later committed after Codex review:

```text
feat(team): persist discovery task run outputs
```

## Delivery Report Template

Report:

1. Files changed.
2. Runtime behavior changed, specifically Canvas Task type mapping, outputCheck preservation, and Discovery result persistence.
3. Tests added, including which old behavior each test would have caught.
4. Documentation updated.
5. Explicit confirmation that no routes, dispatcher/decomposer, generated Task upsert, scheduler, UI, or `.pi/skills` files were changed.
6. Every verification command and result.
7. Diff stat and numstat, with a note on whether there is abnormal formatting noise.
8. EOL / formatter-only churn status.
9. Whether any plan assumption failed.

Do not stage or commit.

## Review Checklist For Codex

- Discovery Canvas Tasks become runtime `type: "discovery"` and include `discovery.outputKey`.
- Normal Canvas Tasks preserve `workUnit.outputCheck`.
- Invalid Discovery output fails the run instead of being accepted by the mock checker.
- Valid Discovery output writes both `accepted-result.md` and `discovery-result.json`.
- `discovery-result.json` uses `schemaVersion: "team/discovery-result-1"` and stores the same stable ids that validation accepted.
- Attempt `resultRef` compatibility is preserved unless GLM documents a concrete reason to change it.
- No generated Task creation or auto-run logic appears in this diff.
- Plan orchestrator behavior is untouched.
- Docs no longer imply Discovery runtime validation is entirely future work after this step.
