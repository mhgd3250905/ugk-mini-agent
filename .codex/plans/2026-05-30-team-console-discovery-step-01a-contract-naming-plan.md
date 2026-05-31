# Step 01A Plan: Discovery Contract Naming Correction

Date: 2026-05-30

## Goal

Correct one ambiguous contract name before backend behavior is implemented. `TeamDiscoverySpec.workerAgentId` / `checkerAgentId` are too easy to confuse with `TeamWorkUnitDefinition.workerAgentId` / `checkerAgentId` on the Discovery Task itself. In the Discovery spec, these fields mean the default agents for generated item Tasks, not the agents that run the Discovery node.

This is a tiny contract correction step. Do not add runtime behavior.

## Baseline

- Step 01 added Discovery contract types in:
  - `src/team/types.ts`
  - `src/team/public-contract.ts`
  - `apps/team-console/src/api/team-types.ts`
  - `apps/team-console/src/tests/team-contract-drift.test.ts`
- Step 01 verification passed:
  - `npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts`
  - `npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json`
  - `npx tsc --noEmit`
  - `git diff --check`

## Scope

Only rename the ambiguous fields in shared frontend/backend contracts and drift tests.

Allowed files:

- `src/team/types.ts`
- `apps/team-console/src/api/team-types.ts`
- `apps/team-console/src/tests/team-contract-drift.test.ts` only if needed

Do not modify:

- `src/team/task-validation.ts`
- `src/team/task-store.ts`
- `src/team/routes.ts`
- `src/team/task-run-service.ts`
- `src/team/role-prompt-contract.ts`
- `apps/team-console/src/app/*`
- `apps/team-console/src/graph/*`
- `.pi/skills/**`

## Required Change

Rename in `TeamDiscoverySpec`:

```ts
workerAgentId: string;
checkerAgentId: string;
```

to:

```ts
generatedWorkerAgentId: string;
generatedCheckerAgentId: string;
```

Meaning:

- `TeamCanvasTask.workUnit.workerAgentId/checkerAgentId`: agents that execute and check the Discovery node itself.
- `TeamDiscoverySpec.generatedWorkerAgentId/generatedCheckerAgentId`: default agents used by generated item Tasks after dispatch.
- `TeamDiscoverySpec.dispatcherAgentId`: agent that designs each generated WorkUnit.

Do not keep backward aliases in this step. No persisted Discovery records exist yet, so this is the right time to fix the names cleanly.

## Tests

Update compile-time type tests if needed so the backend and frontend `TeamDiscoverySpec` stay exact mirrors.

Do not add runtime route/store tests in this step.

## Verification Commands

```powershell
npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts
npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json
npx tsc --noEmit
git diff --check
git diff --stat -- src/team/types.ts apps/team-console/src/api/team-types.ts apps/team-console/src/tests/team-contract-drift.test.ts
git diff --numstat -- src/team/types.ts apps/team-console/src/api/team-types.ts apps/team-console/src/tests/team-contract-drift.test.ts
git diff --cached --stat
```

## Delivery Report Template

Report:

- Exact fields renamed.
- Confirmation that no runtime behavior, route, store, UI, runner, scheduler, or skill was changed.
- Verification command results.
- Diff stat/numstat.
- Whether EOL or formatter churn occurred.

Do not stage or commit.
