# Step 03 Plan: Discovery Task API Routes And Catalog Docs

Date: 2026-05-30

## Goal

Expose the already-validated Discovery Task catalog behavior through the Team backend HTTP API, and document the additive route surface. This step is the API catalog layer only: it must not run Discovery, dispatch items, upsert generated Tasks from output, auto-run generated Tasks, or change the 5174 Team Console UI.

Step 01/01A gave us types. Step 02 gave us store validation. Step 03 should now make those fields reachable through the existing `/v1/team/tasks` API without opening a backdoor for public callers to forge generated Task identity.

## Current Baseline

- Latest commit: `af0362a docs(team-console): record task chain validation`
- Branch state: `main...origin/main [ahead 6]`
- Step 01/01A local changes exist and are not committed:
  - `src/team/types.ts`
  - `src/team/public-contract.ts`
  - `apps/team-console/src/api/team-types.ts`
  - `apps/team-console/src/tests/team-contract-drift.test.ts`
- Step 02 local changes exist and are not committed:
  - `src/team/task-validation.ts`
  - `src/team/task-store.ts`
  - `test/team-task-store.test.ts`
- Step 02 review verification:
  - `node --test --import tsx test/team-task-store.test.ts` passed with 19 tests.
  - `npm run test:team` passed with 1081 tests, 1079 pass, 2 skipped.
  - `npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts` passed with 12 tests.
  - `npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json` passed.
  - `npx tsc --noEmit` passed.
  - `git diff --check` passed.
- Relevant requirement file:
  - `.codex/plans/2026-05-30-team-console-discovery-requirements.md`

## Must-Read Files

- `AGENTS.md`
- `apps/team-console/README.md`
- `docs/team-runtime.md`
- `.codex/plans/2026-05-30-team-console-discovery-requirements.md`
- `src/team/routes.ts`
- `src/team/route-parsers.ts`
- `src/team/route-presenters.ts`
- `src/team/task-validation.ts`
- `src/team/task-store.ts`
- `test/team-task-routes.test.ts`
- `test/team-task-store.test.ts`

## Scope

Allowed production files:

- `src/team/routes.ts`
- `src/team/route-parsers.ts` only if adding a focused `parseIncludeGenerated()` helper is cleaner than inline query parsing.

Allowed tests:

- `test/team-task-routes.test.ts`

Allowed docs:

- `docs/team-runtime.md`
- `apps/team-console/README.md`
- `docs/change-log.md`

Do not modify:

- `src/team/task-run-service.ts`
- `src/team/canvas-task-attempt-runner.ts`
- `src/team/role-prompt-contract.ts`
- `src/team/agent-profile-role-runner.ts`
- `src/team/orchestrator.ts`
- `src/team/task-store.ts`
- `src/team/task-validation.ts`
- `apps/team-console/src/**`
- `.pi/skills/**`
- main `/playground` UI files

## Required API Behavior

### `GET /v1/team/tasks`

Preserve current default behavior:

- `GET /v1/team/tasks` returns root Tasks only:
  - normal root Tasks
  - Discovery root Tasks
  - no generated Tasks
- `?includeArchived=1` keeps its existing meaning.

Add additive query support:

- `?includeGenerated=1` or `?includeGenerated=true` includes generated Tasks in the returned `tasks` array.
- Generated Tasks remain hidden unless this query is explicitly present.
- `includeArchived` and `includeGenerated` compose:
  - default: no archived, no generated
  - `includeGenerated=1`: generated active/stale records included, archived records still hidden
  - `includeArchived=1&includeGenerated=1`: archived generated records may appear

### `POST /v1/team/tasks`

Keep normal Task creation exactly compatible.

Expose Discovery root Task creation by forwarding these body fields to `TaskStore.create()`:

- `canvasKind`
- `discoverySpec`
- existing fields: `title`, `leaderAgentId`, `status`, `workUnit`, `createdByAgentId`

Public route must not allow callers to create generated Tasks directly:

- If request body contains `generatedSource`, return `400`.
- Do not silently ignore `generatedSource`; silent ignore is how API contracts rot.

Expected outcomes:

- Valid Discovery root payload returns `201` with `{ task, warnings }`.
- Invalid Discovery spec returns `400` with the store validation message.
- Public generated Task creation attempt returns `400`.

### `PATCH /v1/team/tasks/:taskId`

Keep normal Task patch compatibility.

Expose Discovery spec editing by forwarding `discoverySpec` to `TaskStore.update()`.

Public route must not allow source identity mutation:

- If body contains `canvasKind`, return `400`.
- If body contains `generatedSource`, return `400`.
- Do not silently ignore these fields.

Expected outcomes:

- Updating `discoverySpec` on a Discovery root Task returns `200`.
- Updating `discoverySpec` on a normal Task returns `400` from store validation.
- Updating `discoverySpec` on a generated Task is already blocked at store level; this route step only needs route coverage if a generated Task is seeded in the test.
- Updating a generated Task `workUnit` through the public route should still mark `generatedSource.workUnitMode` as `"customized"` if the test seeds a generated Task directly.

### `GET /v1/team/tasks/:taskId/generated-tasks`

Add a read-only child catalog route:

- If `taskId` does not exist, return `404`.
- If `taskId` exists but is not a Discovery root Task (`canvasKind !== "discovery"`), return `400`.
- Otherwise return `{ tasks }`, where `tasks` is `TaskStore.listGeneratedForDiscoveryTask(taskId, { includeArchived })`.
- Include active and stale generated Tasks.
- Exclude archived generated Tasks by default.
- Support `?includeArchived=1` or `?includeArchived=true`.
- Do not attach run summaries in this step. That belongs after run/upsert integration exists.

## Tests To Add

Add focused route tests in `test/team-task-routes.test.ts`. Use existing `buildTestServer()` and `app.inject()` patterns.

Test cases:

1. `POST /v1/team/tasks` creates a Discovery root Task:
   - payload includes `canvasKind: "discovery"` and valid `discoverySpec`
   - response status `201`
   - response task preserves `canvasKind` and `discoverySpec`
   - no Plan is created

2. `POST /v1/team/tasks` rejects invalid Discovery payload:
   - missing `discoverySpec` returns `400`
   - unknown `generatedWorkerAgentId` or invalid `requiredItemFields` returns `400`

3. `POST /v1/team/tasks` rejects public `generatedSource`:
   - status `400`
   - error message clearly says generated Task source identity cannot be created through this route

4. `GET /v1/team/tasks` keeps generated Tasks out of the default root list:
   - create normal root Task through API
   - create Discovery root Task through API
   - seed generated Tasks directly through `TaskStore` or a local helper writing valid task JSON under the same `TEAM_DATA_DIR`
   - default `GET /v1/team/tasks` returns only normal + Discovery root Tasks
   - `GET /v1/team/tasks?includeGenerated=1` includes generated Tasks

5. `GET /v1/team/tasks/:taskId/generated-tasks` returns generated children for one Discovery root:
   - includes active and stale generated Tasks for that Discovery id
   - excludes generated Tasks from another Discovery id
   - excludes archived generated Tasks by default
   - `includeArchived=1` includes archived generated Tasks

6. `GET /v1/team/tasks/:taskId/generated-tasks` rejects bad parents:
   - missing parent returns `404`
   - normal root Task parent returns `400`

7. `PATCH /v1/team/tasks/:taskId` forwards `discoverySpec` only for Discovery root:
   - valid update on Discovery root returns `200`
   - same patch on normal root returns `400`

8. `PATCH /v1/team/tasks/:taskId` rejects public identity updates:
   - body with `canvasKind` returns `400`
   - body with `generatedSource` returns `400`

9. Optional but useful if the test seeds generated Tasks:
   - patching a generated Task `workUnit` through the public route returns `200` and marks `generatedSource.workUnitMode` as `"customized"`

Do not add UI/browser tests in this step; this is backend route behavior.

## Implementation Notes

- Prefer adding a tiny query parser helper in `src/team/route-parsers.ts`:
  - `parseIncludeGenerated(request): boolean`
  - same semantics as `parseIncludeArchived()`
- Remove the currently unused local `query` variable in `GET /v1/team/tasks` if still present.
- Keep response shape for task responses as `{ task, warnings }` via `sendTaskResponse()`.
- Keep generated task list response shape as `{ tasks }` to match existing list style.
- To seed generated Tasks in route tests, prefer using `TaskStore` directly against `teamDir` with a known `getAgentIds` catalog. If `buildTestServer()` does not expose `teamDir`, update the helper to return it. Do not use public POST with `generatedSource` as the seeding path because the route must reject that.
- Do not add a generated Task create API. That belongs to the later Discovery dispatch/upsert step.
- Do not run generated Tasks. No scheduler, no dispatcher, no output validation changes here.

## Verification Commands

Focused:

```powershell
node --test --import tsx test/team-task-routes.test.ts
node --test --import tsx test/team-task-store.test.ts
```

Final:

```powershell
node --test --import tsx test/team-task-routes.test.ts
node --test --import tsx test/team-task-store.test.ts
npm run test:team
npm --prefix apps/team-console test -- --run src/tests/team-contract-drift.test.ts
npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json
npx tsc --noEmit
git diff --check
git diff --stat -- src/team/routes.ts src/team/route-parsers.ts test/team-task-routes.test.ts docs/team-runtime.md apps/team-console/README.md docs/change-log.md
git diff --numstat -- src/team/routes.ts src/team/route-parsers.ts test/team-task-routes.test.ts docs/team-runtime.md apps/team-console/README.md docs/change-log.md
git ls-files --eol src/team/routes.ts src/team/route-parsers.ts test/team-task-routes.test.ts docs/team-runtime.md apps/team-console/README.md docs/change-log.md
git diff --cached --stat
```

If `src/team/route-parsers.ts`, `apps/team-console/README.md`, or `docs/change-log.md` are not touched, omit them from the scoped diff/EOL commands and state that explicitly.

`npm test` is not required for this GLM step because it timed out in Codex review at 184 seconds without assertion output. `npm run test:team` is the broader required Team verification.

## Commit Message Suggestion

Do not commit unless explicitly authorized. If later committed after Codex review:

```text
feat(team): expose discovery task catalog routes
```

## Delivery Report Template

Report:

1. Files changed.
2. New or changed route behavior.
3. Tests added, with the route status codes and response shapes they prove.
4. Documentation updated.
5. Explicit confirmation that no runner, scheduler, dispatcher, UI, or `.pi/skills` files were changed.
6. Every verification command and result.
7. Diff stat and numstat, with a note on whether there is abnormal formatting noise.
8. EOL / formatter-only churn status.
9. Whether any plan assumption failed.

Do not stage or commit.

## Review Checklist For Codex

- `POST /v1/team/tasks` forwards Discovery fields but rejects `generatedSource`.
- `PATCH /v1/team/tasks/:taskId` forwards `discoverySpec` but rejects `canvasKind/generatedSource`.
- `GET /v1/team/tasks` still hides generated Tasks by default.
- `includeGenerated` only affects list calls when explicitly set.
- `GET /v1/team/tasks/:taskId/generated-tasks` requires a real Discovery root parent.
- Tests seed generated Tasks without adding a public generated create route.
- Docs mention generated Tasks are catalog-visible only through explicit include/query routes, not root list by default.
