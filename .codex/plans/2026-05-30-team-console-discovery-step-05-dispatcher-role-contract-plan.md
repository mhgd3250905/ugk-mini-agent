# Step 05 Plan: Discovery Dispatcher Role Contract

Date: 2026-05-30

## Goal

Add a dedicated Discovery dispatcher role contract that turns one validated Discovery item into a generated Task WorkUnit draft.

This step is intentionally only the role/prompt/parser/runner contract. It must not create generated Tasks, upsert generated sources, mark stale items, auto-run generated Tasks, or change the 5174 UI. The old Plan `runDecomposer` contract splits a `TeamTask` into child tasks; do not overload it. Discovery dispatch is a different role: it receives `Discovery context + one item payload + dispatch goal` and returns one managed WorkUnit draft for that item.

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
- Step 04 review verification:
  - `node --test --import tsx test/team-output-validator.test.ts` passed with 11 tests.
  - `node --test --import tsx test/team-task-run-process.test.ts` passed with 22 tests.
  - `node --test --import tsx test/team-task-routes.test.ts` passed with 35 tests.
  - `node --test --import tsx test/team-task-store.test.ts` passed with 19 tests.
  - `npm run test:team` passed on rerun with 1095 tests, 1093 pass, 2 skipped. A first run hit the known time-sensitive decomposition timeout test; targeted repro passed.
  - Team Console contract drift test, Team Console `tsc`, top-level `npx tsc --noEmit`, and `git diff --check` passed.
- Relevant requirement file:
  - `.codex/plans/2026-05-30-team-console-discovery-requirements.md`

## Must-Read Files

- `AGENTS.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`
- `.codex/plans/2026-05-30-team-console-discovery-step-05-dispatcher-role-contract-plan.md`
- `src/team/role-runner.ts`
- `src/team/role-prompt-contract.ts`
- `src/team/agent-profile-role-runner.ts`
- `src/team/types.ts`
- `test/team-role-prompt-contract.test.ts`
- `test/team-role-runner.test.ts`
- `test/team-agent-profile-runner.test.ts`
- `test/team-worker.test.ts`

## Scope

Allowed production files:

- `src/team/role-runner.ts`
- `src/team/role-prompt-contract.ts`
- `src/team/agent-profile-role-runner.ts`

Allowed tests:

- `test/team-role-prompt-contract.test.ts`
- `test/team-role-runner.test.ts`
- `test/team-agent-profile-runner.test.ts`
- `test/team-worker.test.ts` only if needed for `setProfileIds` compatibility coverage.

Allowed docs:

- `docs/team-runtime.md`
- `docs/change-log.md`

Do not modify:

- `src/team/types.ts`
- `src/team/output-validator.ts`
- `src/team/task-run-service.ts`
- `src/team/canvas-task-attempt-runner.ts`
- `src/team/task-store.ts`
- `src/team/task-validation.ts`
- `src/team/routes.ts`
- `src/team/route-parsers.ts`
- `src/team/orchestrator.ts`
- `src/workers/team-worker.ts`
- `apps/team-console/src/**`
- `apps/team-console/README.md`
- `.pi/skills/**`
- main `/playground` UI files

## Required Behavior

### Role types and runner surface

Update `src/team/role-runner.ts`:

- Add exported role-local types for Discovery dispatch. Keep them in `role-runner.ts`; do not add public API DTOs in `src/team/types.ts` in this step.
- Add `runDiscoveryDispatcher(input: DiscoveryDispatchInput): Promise<DiscoveryDispatchOutput>` to `TeamRoleRunner`.
- Add optional `dispatcherProfileId?: string` to `ProfileAwareTeamRoleRunner.setProfileIds(...)` without breaking existing call sites.
- Extend `MockRoleRunnerConfig` with optional `discoveryDispatchOutputs?: DiscoveryDispatchOutput[]`.
- Add a `discoveryDispatcherCallIndex` and reset it in `reset()`.
- `MockRoleRunner.runDiscoveryDispatcher()` default should return a deterministic valid `ok: true` draft for `input.itemId`. Configured outputs should cycle like worker/checker/decomposer outputs.

Recommended type shape:

```ts
export interface DiscoveryDispatchInput {
  runId: string;
  discoveryTaskId: string;
  discoveryTaskTitle: string;
  discoveryGoal: string;
  dispatchGoal: string;
  outputKey: string;
  itemId: string;
  itemPayload: Record<string, unknown>;
  requiredItemFields: string[];
  recommendedItemFields?: string[];
  generatedWorkerAgentId?: string;
  generatedCheckerAgentId?: string;
  signal?: AbortSignal;
}

export interface DiscoveryDispatchWorkUnitDraft {
  title: string;
  input: { text: string };
  outputContract: { text: string };
  acceptance: { rules: string[] };
}

export type DiscoveryDispatchOutput =
  | { ok: true; itemId: string; workUnit: DiscoveryDispatchWorkUnitDraft; runtimeContext?: TeamRoleRuntimeContext }
  | { ok: false; itemId: string; error: string; rawContent?: string; runtimeContext?: TeamRoleRuntimeContext };
```

Notes:

- `generatedWorkerAgentId` and `generatedCheckerAgentId` may be supplied as context only. Dispatcher output must not choose worker/checker/leader agents in v1.
- Do not include `outputPorts` or `outputCheck` in dispatcher output in this step. Product requirements say those are later/optional. Rejecting them is safer than pretending we support them.

### Prompt and parser contract

Update `src/team/role-prompt-contract.ts`:

- Add `buildDiscoveryDispatchPrompt(input: DiscoveryDispatchInput): string`.
- Add `parseDiscoveryDispatchRoleOutput(content: string, expectedItemId: string): Omit<DiscoveryDispatchOutput, "runtimeContext">`.
- Reuse existing private JSON extraction helpers if useful, but do not weaken checker/watcher/decomposer behavior.
- Prompt must include:
  - Discovery task id/title.
  - Discovery goal.
  - Dispatch goal.
  - Output key.
  - Required and recommended item fields.
  - Exact item id.
  - Full item payload as JSON.
  - Default generated worker/checker ids as non-output context when provided.
  - Strict JSON output schema.
  - Explicit ban on emitting worker/checker/leader/source identity fields.

Required output JSON shape:

```json
{
  "itemId": "exact_item_id",
  "workUnit": {
    "title": "Generated task title",
    "input": { "text": "Precise worker prompt for this item" },
    "outputContract": { "text": "Expected output contract" },
    "acceptance": { "rules": ["Concrete acceptance rule"] }
  }
}
```

Parser requirements:

- Return `ok: true` only when:
  - Top-level value is a JSON object.
  - `itemId` is a non-empty string and exactly equals `expectedItemId`.
  - `workUnit.title`, `workUnit.input.text`, and `workUnit.outputContract.text` are non-empty strings.
  - `workUnit.acceptance.rules` is a non-empty string array.
  - No forbidden identity/agent/source fields appear at the top level or inside `workUnit`.
- Return `ok: false` instead of throwing for invalid JSON, item mismatch, invalid schema, or forbidden fields.
- `ok: false` output must include `itemId: expectedItemId`, an actionable `error`, and `rawContent` when useful for diagnostics.
- Forbidden fields include at least:
  - `workerAgentId`
  - `checkerAgentId`
  - `leaderAgentId`
  - `generatedWorkerAgentId`
  - `generatedCheckerAgentId`
  - `canvasKind`
  - `discoverySpec`
  - `generatedSource`
  - `sourceDiscoveryTaskId`
  - `sourceItemId`
  - `itemPayload`
  - `itemStatus`
  - `workUnitMode`
  - `outputPorts`
  - `outputCheck`

### Agent profile runner

Update `src/team/agent-profile-role-runner.ts`:

- Add optional `dispatcherProfileId?: string` to `AgentProfileRoleRunnerOptions`.
- Update `setProfileIds()` to accept optional `dispatcherProfileId` and assign it when provided.
- Implement `runDiscoveryDispatcher(input)`.
- Profile selection:
  - Prefer `this.options.dispatcherProfileId`.
  - Fallback to `this.options.decomposerProfileId`.
  - Fallback to `this.options.workerProfileId`.
- Workspace and runtime context:
  - Use a distinct role name such as `"discovery-dispatcher"`.
  - Use a path-safe role key derived from `discoveryTaskId` and `itemId`; do not pass raw item ids into a filesystem path. Replace characters outside `[A-Za-z0-9_.-]` and cap length.
  - Run session with role metadata `{ role: "discovery-dispatcher", roleKey }`.
  - Parse content with `parseDiscoveryDispatchRoleOutput(content, input.itemId)`.
  - Return parsed result plus `runtimeContext`.

## Tests To Add First

Add failing tests before implementation.

### `test/team-role-prompt-contract.test.ts`

Add focused tests for the new prompt/parser:

1. `buildDiscoveryDispatchPrompt` includes Discovery goal, dispatch goal, exact item id, item payload, required/recommended fields, strict JSON schema, and the ban on worker/checker/source identity fields.
2. `parseDiscoveryDispatchRoleOutput` accepts valid JSON and returns `ok: true` with the expected `itemId` and normalized WorkUnit draft.
3. Parser rejects item id mismatch with `ok: false`.
4. Parser rejects forbidden fields such as `workerAgentId`, `generatedSource`, or `outputCheck`.
5. Parser rejects invalid/empty WorkUnit fields and invalid JSON with `ok: false` rather than throwing.

### `test/team-role-runner.test.ts`

Add MockRoleRunner tests:

1. Default `runDiscoveryDispatcher()` returns a deterministic valid draft for the supplied `itemId`.
2. Configured `discoveryDispatchOutputs` cycle through outputs.
3. `reset()` clears the discovery dispatcher call index.

### `test/team-agent-profile-runner.test.ts`

Add AgentProfileRoleRunner tests:

1. `runDiscoveryDispatcher` uses explicit `dispatcherProfileId` and a `"discovery-dispatcher"` browser/workspace scope.
2. The prompt sent to the session includes the Discovery dispatch context and exact item payload.
3. Valid session JSON returns `ok: true` plus runtime context.
4. Invalid session output returns `ok: false` plus runtime context.
5. Use an item id containing a slash or path-like character in one test to prove the role workspace key is sanitized and does not create raw nested item-id paths.

### `test/team-worker.test.ts`

Only touch this file if TypeScript or focused tests show the optional `dispatcherProfileId` change needs compatibility coverage. Do not edit it preemptively.

## Implementation Notes

- Keep old Plan `runDecomposer` untouched. Existing decomposer tests must continue to pass.
- Do not rename `runDecomposer`, `buildDecomposerPrompt`, or `parseDecomposerRoleOutput`.
- Do not make Discovery dispatcher output child `TeamTask[]`. It returns one WorkUnit draft for one item.
- Do not import `TaskStore`, routes, `CanvasTaskRunService`, or generated Task creation logic into the role layer.
- Do not use dispatcher output to set `workerAgentId`, `checkerAgentId`, `leaderAgentId`, `canvasKind`, or `generatedSource`.
- Keep parser failure deterministic. A malformed dispatcher response should become `ok: false`, not a thrown exception that crashes the future dispatch batch.
- Preserve existing line endings and style. These files currently use tabs in TypeScript; match local style rather than running a broad formatter.

## Fix Impact Analysis

- Direct impact:
  - `TeamRoleRunner` gains one new method. All concrete implementations must implement it.
  - `MockRoleRunner` and `AgentProfileRoleRunner` are the concrete implementations in this step.
  - `ProfileAwareTeamRoleRunner.setProfileIds` should remain backward-compatible by making `dispatcherProfileId` optional.
- Indirect impact:
  - Existing Plan decomposer code must remain behaviorally unchanged.
  - Existing worker/checker/watcher/finalizer role prompts and parsers must remain behaviorally unchanged.
  - No scheduler/upsert route should start calling the new method in this step.
- Data structure compatibility:
  - New role-local types are additive.
  - No persisted data shape changes in this step.
  - No frontend contract drift should occur because public Team DTOs are not changed in this step.

## Verification Commands

Focused:

```powershell
node --test --import tsx test/team-role-prompt-contract.test.ts
node --test --import tsx test/team-role-runner.test.ts
node --test --import tsx test/team-agent-profile-runner.test.ts
```

If `test/team-worker.test.ts` is touched:

```powershell
node --test --import tsx test/team-worker.test.ts
```

Final:

```powershell
node --test --import tsx test/team-role-prompt-contract.test.ts
node --test --import tsx test/team-role-runner.test.ts
node --test --import tsx test/team-agent-profile-runner.test.ts
npm run test:team
npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts
npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json
npx tsc --noEmit
git diff --check
git diff --stat -- src/team/role-runner.ts src/team/role-prompt-contract.ts src/team/agent-profile-role-runner.ts test/team-role-prompt-contract.test.ts test/team-role-runner.test.ts test/team-agent-profile-runner.test.ts test/team-worker.test.ts docs/team-runtime.md docs/change-log.md
git diff --numstat -- src/team/role-runner.ts src/team/role-prompt-contract.ts src/team/agent-profile-role-runner.ts test/team-role-prompt-contract.test.ts test/team-role-runner.test.ts test/team-agent-profile-runner.test.ts test/team-worker.test.ts docs/team-runtime.md docs/change-log.md
git ls-files --eol src/team/role-runner.ts src/team/role-prompt-contract.ts src/team/agent-profile-role-runner.ts test/team-role-prompt-contract.test.ts test/team-role-runner.test.ts test/team-agent-profile-runner.test.ts test/team-worker.test.ts docs/team-runtime.md docs/change-log.md
git diff --cached --stat
```

If `test/team-worker.test.ts` is not touched, omit it from scoped diff/EOL commands and state that explicitly.

## Commit Message Suggestion

Do not commit unless explicitly authorized. If later committed after Codex review:

```text
feat(team): add discovery dispatcher role contract
```

## Delivery Report Template

Report:

1. Files changed.
2. Role contract behavior added, specifically new input/output types, prompt/parser, runner method, and profile selection.
3. Tests added, including which old/missing behavior each test would have caught.
4. Documentation updated.
5. Explicit confirmation that generated Task upsert, stale marking, auto-run scheduler, routes, UI, and `.pi/skills` were not changed.
6. Every verification command and result.
7. Diff stat and numstat, with a note on whether there is abnormal formatting noise.
8. EOL / formatter-only churn status.
9. Whether any plan assumption failed.

Do not stage or commit.

## Review Checklist For Codex

- Discovery dispatcher is a separate role method, not a mutation of old Plan `runDecomposer`.
- Parser returns `ok: false` for invalid/mismatched/forbidden output rather than throwing.
- Dispatcher output cannot choose worker/checker/leader/source identity fields.
- `AgentProfileRoleRunner` uses `dispatcherProfileId` when provided and records runtime context.
- Role workspace key is path-safe for arbitrary item ids.
- Existing decomposer tests still pass.
- No generated Task creation, stale marking, scheduler, route, UI, or `.pi/skills` logic appears in this diff.
