# Step 01 Plan: Team Console Discovery Contract Foundation

Date: 2026-05-30

## Goal

Add the shared TypeScript contracts for Discovery Tasks and generated Tasks without changing runtime behavior. This step is intentionally contract-only so later backend, UI, runner, scheduler, and skill work can build on stable names instead of inventing fields mid-implementation.

## Baseline

- Branch: `main`
- Latest commit: `af0362a docs(team-console): record task chain validation`
- Current branch state: `main...origin/main [ahead 6]`
- Requirement/index file: `.codex/plans/2026-05-30-team-console-discovery-requirements.md`
- Existing Task contract:
  - backend authoritative type: `src/team/types.ts`
  - public browser-safe export: `src/team/public-contract.ts`
  - frontend mirror: `apps/team-console/src/api/team-types.ts`
  - drift guard: `apps/team-console/src/tests/team-contract-drift.test.ts`

## Scope

Only add static/additive contracts and tests that prove backend/frontend shape compatibility. Do not implement behavior.

Allowed production files:

- `src/team/types.ts`
- `src/team/public-contract.ts` only if a new public type needs explicit export
- `apps/team-console/src/api/team-types.ts`

Allowed test files:

- `apps/team-console/src/tests/team-contract-drift.test.ts`
- `test/team-types.test.ts` only for backend type/default helper tests if existing patterns fit

Do not modify:

- `src/team/task-run-service.ts`
- `src/team/task-store.ts`
- `src/team/routes.ts`
- `src/team/agent-profile-role-runner.ts`
- `src/team/role-prompt-contract.ts`
- `src/team/orchestrator.ts`
- `apps/team-console/src/app/*`
- `apps/team-console/src/graph/*`
- `.pi/skills/**`
- docs except this plan, unless explicitly asked by Codex after review

## Required Contract Additions

Add backend and frontend matching types:

```ts
export type TeamCanvasTaskKind = "task" | "discovery";
export type TeamGeneratedTaskItemStatus = "active" | "stale";
export type TeamGeneratedTaskWorkUnitMode = "managed" | "customized";

export interface TeamDiscoverySpec {
  schemaVersion: "team/discovery-spec-1";
  discoveryGoal: string;
  outputKey: string;
  itemIdField: "id";
  requiredItemFields: string[];
  recommendedItemFields?: string[];
  dispatchGoal: string;
  dispatcherAgentId: string;
  workerAgentId: string;
  checkerAgentId: string;
  autoRun: {
    enabled: true;
    concurrency: 3;
  };
}

export interface TeamGeneratedTaskSource {
  schemaVersion: "team/generated-task-source-1";
  sourceDiscoveryTaskId: string;
  sourceItemId: string;
  itemStatus: TeamGeneratedTaskItemStatus;
  itemPayload: Record<string, unknown>;
  latestDiscoveryRunId?: string;
  latestDiscoveryAttemptId?: string;
  latestDiscoveredAt?: string;
  workUnitMode: TeamGeneratedTaskWorkUnitMode;
}
```

Add optional fields to `TeamCanvasTask`:

```ts
canvasKind?: TeamCanvasTaskKind;
discoverySpec?: TeamDiscoverySpec;
generatedSource?: TeamGeneratedTaskSource;
```

Add optional field to `TeamWorkUnitDefinition`:

```ts
outputCheck?: TeamTaskOutputCheck;
```

Important compatibility rule:

- Missing `canvasKind` means existing normal Task. Do not make it required in v1, because existing persisted `.data/team/tasks/*.json` records do not have it.
- Missing `generatedSource` means root Task.
- `discoverySpec` is present only when `canvasKind === "discovery"`; validation comes in a later step, not this one.
- Do not rename existing `generated` fields on old Plan `TeamTask`; that is a different type.

## Tests

Add or update compile-time drift tests:

- Backend `TeamCanvasTask` remains assignable to frontend `TeamCanvasTask`.
- New frontend Discovery types mirror backend types.
- A generated Task payload type can include `generatedSource`.
- A Discovery Task payload type can include `canvasKind: "discovery"` and `discoverySpec`.
- `TeamWorkUnitDefinition.outputCheck` accepts existing `TeamTaskOutputCheck`.

These tests may use `expectTypeOf`; no runtime mocks are needed.

Do not add weak tests that only check string existence.

## Verification Commands

Focused:

```powershell
npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts
node --test --import tsx test/team-types.test.ts
```

If `test/team-types.test.ts` is not touched or no focused backend type test is added, report that explicitly and do not invent a fake command result.

Final for this step:

```powershell
npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
git diff --cached --stat
```

If any touched file produces unexpectedly large diff, stop and inspect whether EOL/formatter churn occurred.

## Delivery Report Template

Report:

- Files changed.
- Exact new public types added.
- Confirmation that no runtime behavior, API route, UI, runner, scheduler, or skill was changed.
- Focused command outputs.
- `npx tsc --noEmit` result.
- `git diff --check` result.
- `git diff --stat` / `git diff --numstat` summary.
- Whether any EOL or formatter-only churn occurred.
- Any assumptions that failed.

Do not stage or commit.
