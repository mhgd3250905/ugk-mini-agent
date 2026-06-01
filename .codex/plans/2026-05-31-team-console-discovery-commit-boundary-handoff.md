# Team Console Discovery commit boundary handoff

## Current status

- Date: 2026-05-31
- Branch: `main`
- Head: `af0362a docs(team-console): record task chain validation`
- Worktree state: dirty, unstaged, no cached changes.
- Scope of this handoff: classify the current dirty worktree so the next action can stage or commit deliberately.

## Verified in latest review

- `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx`: 49 passed.
- `npm --prefix apps/team-console test -- --run src/tests/team-api.test.ts src/tests/team-contract-drift.test.ts`: 90 passed.
- `npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json`: passed.
- `git diff --check`: passed.
- `git diff --cached --stat`: empty.
- EOL for 08E2C touched files: `i/lf w/lf`.
- Browser `http://127.0.0.1:5174/`: mock data; Discovery subcanvas archive confirm clears after close/reopen; console only has Vite/React dev messages and `/favicon.ico` 404.

## Staged boundary verification on 2026-05-31

- Staged Discovery boundary: 79 files, excluding `.pi/skills/**`, `runtime/**`, `public/**`, root report scripts, and other unrelated plan files.
- `npm --prefix apps/team-console test`: 524 passed.
- `npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json`: passed.
- `npm --prefix apps/team-console run build`: passed.
- `npx tsc --noEmit`: passed.
- `git diff --cached --check`: passed after removing trailing blank EOF lines from several plan docs.
- `npm test`: initially failed with 9 failures:
  - 8 transient Windows temp-file `EPERM rename` failures in agent/asset/background tests; targeted reruns of `test/agent-service.test.ts`, `test/asset-store.test.ts`, `test/background-agent-runner.test.ts`, and `test/team-task-store.test.ts` passed.
  - 1 stable failure in `test/team-orchestrator-timeout.test.ts`: `state-level maxRunDurationMinutes overrides constructor default` returned `completed` instead of expected `failed`.
- Timeout blocker fix: `src/team/orchestrator.ts` now checks run timeout again after the plan task loop and before finalizer/completion, so runs that exceed a state-level timeout on the last task fail as `run timeout`.
- `node --test --test-concurrency=1 --import tsx test/team-orchestrator-timeout.test.ts`: 12 passed after the fix.
- Full `npm test` rerun after the timeout fix: 1986 passed / 1 failed. The remaining failure was `test/agent-service.test.ts` with another Windows temp-file `EPERM rename` in `ConversationStore.writeState`.
- Targeted `test/agent-service.test.ts` rerun is intermittent: it passed once before the timeout fix and later failed on a different test with the same `EPERM rename` shape. Treat this as an existing Windows atomic-rename/flaky environment blocker unless deliberately starting a separate `ConversationStore` Windows write robustness task.

Do not claim root `npm test` is green unless a full rerun passes; Windows temp-file `EPERM rename` failures may need a rerun because they have reproduced as transient.

## Commit bucket A: Discovery 08E2C review fixes only

Use this bucket if the goal is to isolate the latest review fixes.

Files:

- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/app/use-team-console-live-data.ts`
- `apps/team-console/src/tests/app-live-data.test.tsx`

Important notes:

- These files also contain earlier Discovery 08A-08E2C changes, not only the final two-line review fix. If a tiny review-fix commit is required, use interactive staging by hunks and inspect every hunk.
- The latest review fix specifically covers:
  - generated archive success summary derived from current generated catalog instead of stale async closure.
  - generated archive confirm/saving state cleanup when the Discovery subcanvas/root branch closes.
- Do not include `src/team/**`, `.pi/skills/**`, `public/**`, or `runtime/**` in this bucket.

Minimum recheck before commit:

```powershell
npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx
git diff --cached --check
```

## Commit bucket B: Discovery 08A-08E2C Team Console UI/data chain

Use this bucket if the goal is to commit the whole frontend/API-adapter Discovery console chain.

Likely files:

- `apps/team-console/README.md`
- `apps/team-console/src/api/team-api.ts`
- `apps/team-console/src/api/team-types.ts`
- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/app/use-task-branch-stack.ts`
- `apps/team-console/src/app/use-team-console-live-data.ts`
- `apps/team-console/src/fixtures/team-fixtures.ts`
- `apps/team-console/src/graph/ExecutionMap.tsx`
- `apps/team-console/src/graph/atlas-geometry.ts`
- `apps/team-console/src/graph/execution-map.css`
- `apps/team-console/src/tests/app-live-data.test.tsx`
- `apps/team-console/src/tests/app.test.tsx`
- `apps/team-console/src/tests/execution-map-ui.test.tsx`
- `apps/team-console/src/tests/team-api.test.ts`
- `apps/team-console/src/tests/team-contract-drift.test.ts`
- `docs/team-runtime.md`
- `docs/change-log.md`
- Relevant `.codex/plans/2026-05-31-team-console-discovery-step-08*.md`
- Relevant `.codex/plans/2026-05-31-team-console-discovery-step-08*.txt`

Do not use this bucket if the backend Discovery runtime/store/routes work is not being committed at the same time and tests depend on shared contract changes.

Minimum recheck before commit:

```powershell
npm --prefix apps/team-console test
npm --prefix apps/team-console exec tsc -- --noEmit -p tsconfig.json
git diff --cached --check
```

## Commit bucket C: Discovery backend/runtime/store/API contract chain

Use this bucket if committing the backend Discovery foundation through generated task upsert/auto-run/reset.

Likely files:

- `src/team/agent-profile-role-runner.ts`
- `src/team/canvas-task-attempt-runner.ts`
- `src/team/output-validator.ts`
- `src/team/public-contract.ts`
- `src/team/role-prompt-contract.ts`
- `src/team/role-runner.ts`
- `src/team/route-parsers.ts`
- `src/team/routes.ts`
- `src/team/run-workspace-attempts.ts`
- `src/team/run-workspace.ts`
- `src/team/task-run-service.ts`
- `src/team/task-store.ts`
- `src/team/task-validation.ts`
- `src/team/types.ts`
- `test/team-agent-profile-runner.test.ts`
- `test/team-orchestrator-decomposition.test.ts`
- `test/team-output-validator.test.ts`
- `test/team-parallel-foreach.test.ts`
- `test/team-role-prompt-contract.test.ts`
- `test/team-role-runner.test.ts`
- `test/team-run-workspace.test.ts`
- `test/team-task-routes.test.ts`
- `test/team-task-run-process.test.ts`
- `test/team-task-store.test.ts`
- `apps/team-console/src/api/team-api.ts`
- `apps/team-console/src/api/team-types.ts`
- `apps/team-console/src/tests/team-api.test.ts`
- `apps/team-console/src/tests/team-contract-drift.test.ts`
- `docs/team-runtime.md`
- `docs/change-log.md`
- Relevant `.codex/plans/2026-05-30-team-console-discovery-step-*.md`
- Relevant `.codex/plans/2026-05-31-team-console-discovery-step-06*.md`
- Relevant `.codex/plans/2026-05-31-team-console-discovery-step-07*.md`
- Relevant `.codex/plans/2026-05-31-team-console-discovery-step-08e1*.md`

Minimum recheck before commit:

```powershell
node --test --import tsx test/team-task-store.test.ts test/team-task-routes.test.ts test/team-task-run-process.test.ts test/team-run-workspace.test.ts
npx tsc --noEmit
git diff --cached --check
```

## Explicitly do not stage without separate confirmation

- `.pi/skills/anthropics/skill-creator/**` tracked deletions.
- `.pi/skills/skill-creator/` untracked directory.
- `runtime/**` generated reports/pages/scratch evidence.
- `public/*report*.html`, `public/medtrum-view/`, `public/curated-index.json`, and other generated report artifacts.
- Root scratch scripts/files:
  - `generate_report.py`
  - `generate_report_v2.py`
  - `report_template.html`

These are unrelated to Team Console Discovery commit hygiene. Mixing them into a Discovery commit would be self-inflicted pain.

## Current risk

- The worktree contains multiple task chains at once. A full `git add -A` would stage unrelated runtime artifacts and `.pi/skills` changes.
- `docs/change-log.md` already contains a long set of Discovery entries, so if only a small review-fix commit is made, avoid duplicating those entries unless the commit also carries the corresponding implementation.
- `apps/team-console/src/app/App.tsx` and `apps/team-console/src/tests/app-live-data.test.tsx` are large diffs. Prefer feature-slice commits or hunk staging, not blind file-level staging, if the goal is fine-grained history.

## Recommended next action

1. Decide whether to commit one broad Discovery chain or split backend/runtime and Team Console UI into separate commits.
2. Before staging, run `git status --short` and compare against the buckets above.
3. Stage only the selected bucket.
4. Run the matching verification commands.
5. Confirm `git diff --cached --stat` contains only the intended files.
