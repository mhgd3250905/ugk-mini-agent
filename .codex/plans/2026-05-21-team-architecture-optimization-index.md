# Team architecture optimization plan index

Date: 2026-05-21

## Current baseline

- Repo: `E:\AII\ugk-pi`
- Latest commit before this plan package: `961074d fix(team): preserve mindmap disposition scroll timing`
- Current known verification from the baseline:
  - `node --test --import tsx test/team-page-ui.test.ts`: 277 pass / 0 fail / 2 skip
  - `npm run test:team`: 806 pass / 0 fail / 2 skip
  - `npx tsc --noEmit`: clean
  - `git diff --check`: clean
- Current `git status --short` contains only historical untracked plan/runtime/report artifacts. Do not commit them unless explicitly requested.

## Goal

Improve Team module architecture through small, reviewable, independently committable steps. GLM must not receive this whole package as one implementation task. Send exactly one step plan at a time.

## Execution order

1. `.codex/plans/2026-05-21-team-arch-step-1-parallel-state-writer.md`
   - Remove the risky `saveState` monkey-patch shape from parallel `for_each`.
   - Highest priority because parallel state writes affect pause/cancel/rerun/fatal drain.

2. `.codex/plans/2026-05-21-team-arch-step-2-child-execution-module.md`
   - Extract child execution topology for sequential/parallel expanded children.
   - Depends on Step 1 so the state write seam is explicit first.

3. `.codex/plans/2026-05-21-team-arch-step-3-attempt-lifecycle-module.md`
   - Extract task attempt lifecycle from `TeamOrchestrator`.
   - Depends on Step 2 because child execution still calls task execution.

4. `.codex/plans/2026-05-21-team-arch-step-4-plan-validation-module.md`
   - Extract plan validation from `PlanStore`.
   - Independent after Step 1, but safer after runtime steps because it is schema-facing.

5. `.codex/plans/2026-05-21-team-arch-step-5-run-workspace-adapters.md`
   - Split `RunWorkspace` responsibilities behind smaller adapters without changing disk layout.
   - Do this after Step 1-3 so the real caller needs are clearer.

6. `.codex/plans/2026-05-21-team-arch-step-6-team-page-ui-modules.md`
   - Start extracting Team page UI behavior into testable modules.
   - Do this after backend runtime churn settles.

7. `.codex/plans/2026-05-21-team-arch-step-7-routes-and-role-runner.md`
   - Slim route presenter logic and split role prompt contract.
   - This is a final cleanup step; it can be split further if it feels too big.

8. `.codex/plans/2026-05-21-team-arch-step-8-role-prompt-contract.md`
   - Extract the remaining role prompt builder/parser/normalizer contract after Step 7 completed only the run response presenter.
   - Keep profile/session/browser/workspace behavior inside `AgentProfileRoleRunner`.

## Global rules for every step

- Strictly follow the step plan. Do not redesign the system.
- One step, one commit. If a step is too large, stop and ask Codex/user to split it.
- Tests before implementation where behavior or public structure changes.
- Preserve existing behavior unless the step explicitly says otherwise.
- Preserve existing line endings and formatting. Do not create EOL-only or formatter-only churn.
- Do not run broad formatters on unrelated files.
- Do not commit `.env`, `.data`, `runtime`, `public` reports, temp files, unknown `.pi/skills/*`, or `skills-lock.json`.
- Do not modify runtime product skills under `.pi/skills` unless the step explicitly names the file and reason.
- If a small refactor creates thousands of changed lines, stop and inspect `git diff --stat`, `git diff --numstat`, and EOL before continuing.

## Final full verification after all steps

Run after each step where feasible, and definitely after the whole series:

```powershell
npm run test:team
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
```

For large touched files, also inspect EOL:

```powershell
git ls-files --eol <touched files>
```
