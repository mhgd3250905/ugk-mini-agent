# Split Task Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full `split-task` model that consumes a validated `worklist`, dispatches item-level child work with checker validation, collects all child results, validates coverage, and emits `worklist-results`.

**Architecture:** The implementation introduces `split-task` as a first-class Canvas Task kind rather than a Discovery mode. Discovery-specific generated child concepts are generalized into a reusable derived task model, so Discovery and split-task can share child catalog, child run, and subcanvas infrastructure while keeping separate semantics and schemas.

**Tech Stack:** TypeScript, Node test runner, Team Canvas runtime, Team Console React/Vite tests.

---

## Design Decisions

- Use code name `split-task`; UI label can be `分片任务`.
- Introduce two structured port artifact types:
  - `worklist`: `team/worklist-1`
  - `worklist-results`: `team/worklist-results-1`
- Treat `worklist` production as a normal Task responsibility. A normal Task can search, read a large JSON, or inspect any upstream data and output a validated worklist.
- Treat `split-task` as a runtime executor. It does not decide the worklist. It validates input, dispatches each item, waits for child runs, validates collection coverage, and writes `worklist-results`.
- Generalize Discovery generated child storage/API instead of duplicating a second child system.
- Keep Discovery behavior intact during the first implementation. After split-task is stable, Discovery can be rebuilt as explicit nodes: source/search Task -> worklist Task -> split-task -> collect/report Task.

## Target Data Contracts

### `team/worklist-1`

```json
{
  "schemaVersion": "team/worklist-1",
  "worklistId": "worklist_news_20260611",
  "title": "Diabetes news normalization chunks",
  "items": [
    {
      "id": "chunk-001",
      "title": "Normalize source items 1-40",
      "input": {
        "items": []
      },
      "acceptanceHints": [
        "Return only normalized news JSON items for this chunk."
      ]
    }
  ],
  "metadata": {
    "sourceRef": "optional upstream artifact ref"
  }
}
```

Required:
- `schemaVersion === "team/worklist-1"`
- `worklistId` non-empty string
- `title` non-empty string
- `items` non-empty array by default
- every item is an object with unique non-empty `id`
- every item has non-empty `title`
- every item has `input`
- `acceptanceHints`, if present, must be string[]

### `team/worklist-results-1`

```json
{
  "schemaVersion": "team/worklist-results-1",
  "sourceWorklist": {
    "schemaVersion": "team/worklist-1",
    "worklistId": "worklist_news_20260611",
    "title": "Diabetes news normalization chunks",
    "items": []
  },
  "summary": {
    "totalItems": 10,
    "succeeded": 10,
    "failed": 0,
    "cancelled": 0,
    "missing": 0
  },
  "results": [
    {
      "itemId": "chunk-001",
      "status": "succeeded",
      "resultRef": "tasks/.../accepted-result.md",
      "content": "child accepted result"
    }
  ],
  "createdAt": "2026-06-11T00:00:00.000Z"
}
```

Required:
- `sourceWorklist` must validate as `team/worklist-1`
- every result `itemId` must exist in `sourceWorklist.items[].id`
- no duplicate `itemId`
- no extra result
- default policy requires every worklist item to have a result
- `succeeded` results require readable `content` or `resultRef`
- `failed` / `cancelled` / `missing` require `errorSummary`
- `summary` must match actual results

---

## Task 1: Add Structured Worklist Validators

**Files:**
- Create: `src/team/worklist-contract.ts`
- Modify: `src/team/types.ts`
- Modify: `src/team/output-validator.ts`
- Test: `test/team-worklist-contract.test.ts`
- Test: `test/team-output-validator-worklist.test.ts`

**Step 1: Write validator tests**

Add tests covering:
- valid `team/worklist-1`
- duplicate item id rejected
- missing item input rejected
- valid `team/worklist-results-1`
- result for unknown item rejected
- missing result rejected when full coverage is required
- summary mismatch rejected

Run:

```powershell
npm test -- test/team-worklist-contract.test.ts test/team-output-validator-worklist.test.ts
```

Expected: fail because validators do not exist.

**Step 2: Implement validators**

Create `src/team/worklist-contract.ts` with:
- `validateTeamWorklist(value: unknown): TeamWorklistRecord`
- `validateTeamWorklistResults(value: unknown, options?: { requireFullCoverage?: boolean }): TeamWorklistResultsRecord`
- `parseTeamWorklistContent(content: string): TeamWorklistRecord`
- `parseTeamWorklistResultsContent(content: string): TeamWorklistResultsRecord`

Use existing JSON extraction behavior from `output-validator.ts` or move shared extraction into a helper if needed.

**Step 3: Extend output checks**

Extend `TeamTaskOutputCheck` with:

```ts
| { type: "worklist"; allowEmpty?: boolean }
| { type: "worklist_results"; requireFullCoverage?: boolean }
```

Then update `validateOutputCheck()` and `validateTeamOutput()`.

**Step 4: Run tests**

```powershell
npm test -- test/team-worklist-contract.test.ts test/team-output-validator-worklist.test.ts test/team-task-store-output-check.test.ts
```

Expected: pass.

---

## Task 2: Add Typed Artifact Resolution For Special Port Types

**Files:**
- Modify: `src/team/task-run-service.ts`
- Test: `test/team-task-run-downstream-process.test.ts`

**Step 1: Write failing tests**

Add tests:
- output port type `worklist` selects a worker public `.json` file only if it validates as `team/worklist-1`
- output port type `worklist-results` selects a worker public `.json` file only if it validates as `team/worklist-results-1`
- invalid special JSON falls back to accepted result only if accepted result validates
- invalid accepted result produces no accepted artifact / delivery failure

Run:

```powershell
npm test -- test/team-task-run-downstream-process.test.ts
```

Expected: fail.

**Step 2: Implement special artifact matching**

Update:
- `resolveTypedArtifactExtensions()` to map `worklist` and `worklist-results` to `.json`
- `contentMatchesArtifactType()` to use worklist validators for these two types

**Step 3: Run tests**

```powershell
npm test -- test/team-task-run-downstream-process.test.ts
```

Expected: pass.

---

## Task 3: Generalize Generated Child Source Model

**Files:**
- Modify: `src/team/types.ts`
- Modify: `src/team/task-validation.ts`
- Modify: `src/team/task-store.ts`
- Modify: `src/team/route-presenters.ts`
- Test: `test/team-task-store-generated-workunit.test.ts`
- Test: `test/team-task-routes.test.ts`
- Test: `apps/team-console/src/tests/team-contract-drift.test.ts`

**Step 1: Write failing tests**

Add tests for a generalized generated source:

```ts
generatedSource: {
  schemaVersion: "team/generated-task-source-2",
  sourceKind: "split-task",
  sourceTaskId: "task_parent",
  sourceItemId: "chunk-001",
  itemStatus: "active",
  itemPayload: {},
  latestSourceRunId: "run_parent",
  latestSourceAttemptId: "attempt_parent",
  latestSourceAt: "2026-06-11T00:00:00.000Z",
  workUnitMode: "managed"
}
```

Also keep legacy `team/generated-task-source-1` readable for current Discovery tasks.

**Step 2: Implement type compatibility**

Add:
- `TeamGeneratedTaskSourceV1`
- `TeamGeneratedTaskSourceV2`
- `TeamGeneratedTaskSource = TeamGeneratedTaskSourceV1 | TeamGeneratedTaskSourceV2`

Normalize helper:
- `getGeneratedSourceKind(source)`
- `getGeneratedSourceParentTaskId(source)`
- `getGeneratedSourceItemId(source)`
- `getGeneratedSourceLatestRunId(source)`

**Step 3: Update task store methods**

Keep existing Discovery methods, but internally use generic helpers:
- `listGeneratedForSourceTask(sourceKind, sourceTaskId)`
- `upsertGeneratedTaskFromSource(input)`
- `markGeneratedTasksStaleForSource(sourceKind, sourceTaskId, activeSourceItemIds, input)`

Keep old public wrappers:
- `listGeneratedForDiscoveryTask()`
- `upsertGeneratedTaskFromDiscovery()`
- `markGeneratedTasksStaleForDiscovery()`

**Step 4: Run tests**

```powershell
npm test -- test/team-task-store-generated-workunit.test.ts test/team-task-routes.test.ts
npm --prefix apps/team-console run test -- src/tests/team-contract-drift.test.ts
```

Expected: pass.

---

## Task 4: Add `split-task` Canvas Kind And Spec

**Files:**
- Modify: `src/team/types.ts`
- Modify: `src/team/task-validation.ts`
- Modify: `src/team/task-run-service.ts`
- Modify: `apps/team-console/src/api/team-types.ts`
- Test: `test/team-task-store.test.ts`
- Test: `test/team-task-routes.test.ts`
- Test: `apps/team-console/src/tests/team-contract-drift.test.ts`

**Step 1: Define spec**

Add:

```ts
export interface TeamSplitTaskSpec {
  schemaVersion: "team/split-task-spec-1";
  inputPortId: string;
  dispatchGoal: string;
  generatedWorkerAgentId: string;
  generatedCheckerAgentId: string;
  autoRun: {
    enabled: true;
    concurrency: number;
  };
  collectPolicy: {
    requireAllItemsSucceeded: boolean;
    requireFullCoverage: boolean;
  };
}
```

**Step 2: Extend task kind**

```ts
export type TeamCanvasTaskKind = "task" | "discovery" | "split-task";
```

Creation rules:
- `split-task` requires `splitTaskSpec`
- `split-task` cannot carry `discoverySpec`
- `split-task` requires an input port matching `splitTaskSpec.inputPortId`
- that input port type must be `worklist`
- generated worker/checker agent ids must exist
- autoRun enabled must be true
- concurrency must be positive and bounded, recommended max 10

**Step 3: Run tests**

```powershell
npm test -- test/team-task-store.test.ts test/team-task-routes.test.ts
npm --prefix apps/team-console run test -- src/tests/team-contract-drift.test.ts
```

Expected: pass.

---

## Task 5: Add Split Dispatcher Prompt And Compiler

**Files:**
- Create: `src/team/split-dispatch-workunit-compiler.ts`
- Modify: `src/team/role-runner.ts`
- Modify: `src/team/agent-profile-role-runner.ts`
- Modify: `src/team/role-prompt-contract.ts`
- Test: `test/team-split-dispatch-workunit-compiler.test.ts`
- Test: `test/team-agent-profile-runner-split-tests.ts`

**Step 1: Mirror Discovery semantic patch pattern**

Add split dispatcher input/output:

```ts
export interface SplitDispatchInput {
  runId: string;
  splitTaskId: string;
  splitTaskTitle: string;
  dispatchGoal: string;
  worklistId: string;
  itemId: string;
  itemPayload: Record<string, unknown>;
  generatedWorkerAgentId?: string;
  generatedCheckerAgentId?: string;
  signal?: AbortSignal;
}
```

The dispatcher outputs a semantic patch with:
- `itemId`
- `title`
- `workerInstruction`
- optional `itemAcceptanceHints`
- optional `outputContractHint`

Compile it into a generated WorkUnit. The generated task must only process the exact worklist item.

**Step 2: Implement tests**

Cover:
- item mismatch rejected
- forbidden fields rejected
- compiler includes full item payload
- compiler adds boundary rule

**Step 3: Run tests**

```powershell
npm test -- test/team-split-dispatch-workunit-compiler.test.ts test/team-agent-profile-runner-split-tests.ts
```

Expected: pass.

---

## Task 6: Implement Split Task Lifecycle

**Files:**
- Create: `src/team/split-task-lifecycle.ts`
- Modify: `src/team/task-run-service.ts`
- Modify: `src/team/run-workspace-attempts.ts`
- Modify: `src/team/progress.ts`
- Test: `test/team-task-run-split-process.test.ts`

**Step 1: Write lifecycle tests**

Scenarios:
- split-task rejects missing bound `worklist`
- split-task rejects invalid `worklist`
- split-task dispatches one child per worklist item
- split-task waits until all generated children reach terminal states
- split-task writes `worklist-results.json`
- split-task fails parent when collect policy requires all succeeded and one child fails
- split-task still writes diagnostic `worklist-results.json` on child failure if possible
- split-task triggers downstream `worklist-results` typed port after success

**Step 2: Implement workspace helpers**

Add:
- `writeWorklistResults(runId, taskId, attemptId, record)`
- `readWorklistResults(runId, taskId, attemptId)`

File name:

```text
worklist-results.json
```

**Step 3: Implement lifecycle**

`SplitTaskLifecycle` should:
- read validated `worklist` from bound input artifact content or workspace materialized file
- record parent progress as dispatching
- dispatch items through split dispatcher
- upsert generated tasks using `sourceKind: "split-task"`
- enqueue child runs with bounded concurrency
- wait for terminal child runs
- collect child accepted result content
- produce `team/worklist-results-1`
- validate collect coverage
- return final `resultRef`

**Step 4: Hook into `CanvasTaskRunService.completeRunSucceeded()`**

For `canvasKind === "split-task"`:
- after root worker/checker passes, run split lifecycle
- parent remains running until children are done
- mark parent succeeded only if collect policy passes
- trigger downstream from `worklist-results.json`

**Step 5: Run tests**

```powershell
npm test -- test/team-task-run-split-process.test.ts
```

Expected: pass.

---

## Task 7: Generalize Child Catalog Routes

**Files:**
- Modify: `src/team/routes.ts`
- Modify: `src/team/route-presenters.ts`
- Modify: `apps/team-console/src/api/team-api.ts`
- Modify: `apps/team-console/src/api/team-types.ts`
- Test: `test/team-task-routes.test.ts`
- Test: `apps/team-console/src/tests/team-api-live-task-routes.test.ts`

**Step 1: Add generic endpoint**

Add:

```text
GET /v1/team/tasks/:taskId/generated-tasks
```

but make it work for both:
- Discovery root
- split-task root

Update error text from "Discovery root tasks" to "tasks with generated children".

**Step 2: Preserve Discovery channel set routes**

Discovery channel set routes remain Discovery-only.

**Step 3: Add split-task summary shape**

Generated summary should use neutral fields:
- `sourceKind`
- `sourceTaskId`
- `sourceItemId`
- `latestSourceRunId`
- `latestSourceAttemptId`

For legacy Discovery v1, presenter can map old fields into neutral fields while still exposing legacy fields if needed.

**Step 4: Run tests**

```powershell
npm test -- test/team-task-routes.test.ts
npm --prefix apps/team-console run test -- src/tests/team-api-live-task-routes.test.ts
```

Expected: pass.

---

## Task 8: Team Console Full UI Support

**Files:**
- Modify: `apps/team-console/src/app/App.tsx`
- Modify: `apps/team-console/src/api/team-types.ts`
- Modify: `apps/team-console/src/tests/app-live-data.test.tsx`
- Modify: `apps/team-console/src/tests/execution-map-ui.test.tsx`
- Modify: `apps/team-console/src/tests/team-contract-drift.test.ts`

**Step 1: Add split-task node identity**

Display:
- badge: `Split`
- Chinese label: `分片任务`
- summary row: total / succeeded / failed / missing

**Step 2: Generalize subcanvas button**

Replace Discovery-only "Discovery 子画布" concept with generated-child subcanvas:
- Discovery label can stay `Discovery 子画布`
- split-task label should be `分片子画布`
- underlying fetch can call the same generated task catalog API

**Step 3: Add split-task fixtures**

Add mock split-task root and generated children.

**Step 4: Run tests**

```powershell
npm --prefix apps/team-console run test -- src/tests/app-live-data.test.tsx src/tests/execution-map-ui.test.tsx src/tests/team-contract-drift.test.ts
npm --prefix apps/team-console run test
```

Expected: pass.

---

## Task 9: Skill And Documentation Updates

**Files:**
- Modify: `.pi/skills/team-task-creator/SKILL.md`
- Modify: `docs/team-runtime.md`
- Modify: `docs/traceability-map.md`
- Modify: `docs/handoff-current.md`
- Test: `test/team-task-creator-skill.test.ts`

**Step 1: Update creator skill**

Teach the skill:
- Use normal Task when producing `worklist`
- Use `split-task` when user wants to execute a validated worklist in parallel
- Use normal Task to consume `worklist-results` and produce final business output
- Do not use Discovery for deterministic upstream artifact splitting

**Step 2: Add runtime docs**

Document:
- `team/worklist-1`
- `team/worklist-results-1`
- `team/split-task-spec-1`
- generalized generated source model
- migration direction away from Discovery as a monolithic discovery+dispatch abstraction

**Step 3: Run tests**

```powershell
npm test -- test/team-task-creator-skill.test.ts
```

Expected: pass.

---

## Task 10: End-To-End Regression

**Files:**
- Create: `test/team-task-run-split-chain.test.ts`

**Step 1: Add E2E chain test**

Build a chain:

```text
normal task -> worklist
split-task -> worklist-results
normal task -> final json
```

Assert:
- first task output validates as worklist
- split-task receives worklist
- split-task creates generated child tasks
- each child runs worker/checker
- split-task writes valid worklist-results
- downstream task receives typed artifact with type `worklist-results`

**Step 2: Run targeted tests**

```powershell
npm test -- test/team-task-run-split-chain.test.ts test/team-task-run-split-process.test.ts
```

Expected: pass.

**Step 3: Run broader verification**

```powershell
npm test
npm --prefix apps/team-console run test
npm run team-console:build
git diff --check
```

Expected:
- tests pass
- build passes, existing chunk-size warning acceptable
- no whitespace errors

---

## Risk Notes

- The largest risk is over-reusing Discovery names. Avoid that by introducing neutral generated source v2 fields and neutral frontend presentation helpers.
- The second largest risk is making `split-task` root worker do too much. Root worker should only provide/accept the already validated worklist input; runtime owns dispatch and collect.
- If child output schemas are business-specific, do not encode business schema into `worklist-results`. Store child accepted content and let the downstream business Task merge/normalize.
- Do not remove Discovery in this implementation. Keep it working, then later replace specific Discovery chains with explicit node graphs.

## Suggested Commit Boundaries

1. `Add worklist contract validation`
2. `Resolve worklist typed artifacts`
3. `Generalize generated task sources`
4. `Add split task model`
5. `Implement split task lifecycle`
6. `Expose split child catalog in Team API`
7. `Add split task support to Team Console`
8. `Document split task runtime`
