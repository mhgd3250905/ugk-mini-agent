# Team for_each.parallel execution plan

Date: 2026-05-20

## Goal

Implement the first version of Team Runtime `for_each.parallel`.

The feature is intentionally small:

- `forEach.mode` supports `"sequential"` and `"parallel"`.
- Existing `"sequential"` behavior stays unchanged.
- `"parallel"` runs generated child tasks through a fixed-capacity pool of 3.
- The pool is a refill-on-completion worker pool, not batch execution.
- Partial branch failure is allowed: one failed child does not fail the parent if at least one child succeeded.
- First version rejects `parallel + forEach.taskTemplate.decomposer`.
- Team plan creation skill docs are updated so users can ask for parallel research plans naturally.

## Current baseline

- Latest commit: `0867197 feat(agent): add http access skill`
- Previous Team baseline: `fa80edc fix(team): tighten rerun controls and follow-up UI fixes`
- Known recent verification:
  - `npm run test:team` -> 756 pass / 0 fail / 2 skip
  - `npx tsc --noEmit` -> clean
- Current Team behavior:
  - `src/team/types.ts` only allows `forEach.mode: "sequential"`.
  - `src/team/plan-store.ts` rejects any other `forEach.mode`.
  - `src/team/orchestrator.ts` expands `for_each` children and executes them sequentially in `executeForEachTask(...)`.
  - `docs/team-runtime.md` documents `for_each` as sequential only.
  - `.pi/skills/team-plan-creator/SKILL.md` says parallel is not supported.

## Must-read files

- `AGENTS.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `src/team/types.ts`
- `src/team/plan-store.ts`
- `src/team/orchestrator.ts`
- `src/team/run-workspace.ts`
- `src/team/task-expansion-planner.ts`
- `src/team/role-runner.ts`
- `src/team/agent-profile-role-runner.ts`
- `test/team-plan-store.test.ts`
- `test/team-routes.test.ts`
- `test/team-orchestrator-dynamic-expansion.test.ts`
- `test/team-orchestrator-controls.test.ts`
- `.pi/skills/team-plan-creator/SKILL.md`

## Dirty/untracked files that must not be committed

Do not add or commit these unless the user explicitly asks:

- `.codex/plans/2026-05-20-handoff-team-router-next-session.md`
- `public/github-trending-report.html`
- `public/medtrum-view/`
- `public/ruflo-research-report.html`
- `runtime/agent-search/`
- `runtime/ruflo-research/`

## Absolute scope boundary

This work only implements `for_each.parallel` v1.

Allowed likely source changes:

- `src/team/types.ts`
- `src/team/plan-store.ts`
- `src/team/orchestrator.ts`
- `src/team/run-workspace.ts`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `.pi/skills/team-plan-creator/SKILL.md`
- Team tests named above

Forbidden work:

- Do not redesign Team Runtime as a DAG scheduler.
- Do not add configurable `maxConcurrency`; v1 is fixed at 3.
- Do not change Team page plan creation UI.
- Do not support `parallel + taskTemplate.decomposer`; reject it at plan validation time.
- Do not change `web-access`, `http-access`, browser routing, or AgentProfile skill selection.
- Do not change `.data`, `.env`, runtime artifacts, report outputs, unknown `.pi/skills/*`, or `skills-lock.json`.
- Do not run broad formatters.
- Do not convert LF/CRLF line endings unless a file already requires it and the diff proves no EOL churn.

## Behavior contract

### Plan schema

`TeamTask.forEach.mode` becomes:

```ts
"sequential" | "parallel"
```

Validation rules:

- Missing or unknown mode is rejected.
- `"sequential"` preserves all current semantics.
- `"parallel"` is accepted only when `forEach.taskTemplate.decomposer` is absent or `{ mode: "none" }`.
- `"parallel"` does not imply any new API field.

### Runtime execution

For `for_each.parallel`:

1. Resolve discovery items exactly as today.
2. Create or reuse the existing expansion record exactly as today.
3. Append child task states exactly as today.
4. Build a waiting queue from non-terminal child tasks.
5. Start up to 3 child tasks.
6. When any child reaches terminal state, immediately start the next waiting child.
7. Continue until all children are terminal, the run is paused/cancelled/timed out, or the external signal aborts.

This is a worker-pool/semaphore model. It must not be implemented as "run 3, wait for all 3, then run the next 3".

Each child still runs the full worker -> checker -> watcher lifecycle.

### Parent summary semantics

For `parallel` only:

- 0 children: parent `succeeded`, same as current behavior.
- At least one child `succeeded`: parent `succeeded`.
- All children `skipped`: parent `skipped`.
- No child succeeded and at least one child `failed`: parent `failed`.
- Failed children keep their `resultRef`, `errorSummary`, attempts, and audit files for UI/finalizer.

Do not apply this partial-failure semantic to current `sequential` unless explicitly needed by existing shared helper extraction.

### State safety

The hard part is not the pool; it is state writes.

Current code often does:

1. load full `state.json`
2. mutate one task
3. `saveState(state)` writes the whole file

That is unsafe when multiple children run concurrently. A write lock prevents corrupt files, but it does not prevent stale full-state overwrite.

Implement the minimum safe patch/merge foundation needed for parallel child execution:

- A helper should load the latest state under the state write lock, apply a narrow mutation, recompute summary when needed, and write that latest state.
- Do not replace the entire Team persistence model.
- Do not convert sequential paths wholesale unless strictly necessary.
- Tests must prove two concurrent patches for different child tasks both survive.

## Task 1 - Schema and validation

Commit suggestion: `feat(team): accept parallel for_each mode`

Write tests first:

- In `test/team-plan-store.test.ts`:
  - valid `for_each` with `mode: "parallel"` is accepted.
  - invalid unknown mode is rejected with a message mentioning `sequential` and `parallel`.
  - `parallel + forEach.taskTemplate.decomposer.mode="leaf"` is rejected.
  - `parallel + forEach.taskTemplate.decomposer.mode="propagate"` is rejected.
  - `parallel + no decomposer` or `parallel + mode none` is accepted.
- In `test/team-routes.test.ts`:
  - `POST /v1/team/plans` accepts a dynamic plan with `forEach.mode: "parallel"`.
  - `PATCH /v1/team/plans/:planId` rejects the forbidden decomposer combination while `runCount=0`.

Implementation:

- Update `src/team/types.ts`.
- Update `src/team/plan-store.ts` validation.
- Keep existing required-field validation.
- Do not touch runtime execution yet.

Focused verification:

```powershell
node --test --import tsx test/team-plan-store.test.ts
node --test --import tsx --test-name-pattern "for_each|dynamic plan|parallel" test/team-routes.test.ts
git diff --check -- src/team/types.ts src/team/plan-store.ts test/team-plan-store.test.ts test/team-routes.test.ts
```

## Task 2 - Minimal safe state patch helper

Commit suggestion: `fix(team): add safe team state patch helper`

Write tests first.

Suggested test location:

- Prefer `test/team-orchestrator-dynamic-expansion.test.ts` if testing through orchestrator is practical.
- If a direct workspace-level test is cleaner, add it near existing `TeamRunWorkspace` coverage if such a file exists; otherwise keep it in a focused Team test file without creating a broad new test harness.

Test requirements:

- Two near-concurrent updates to different task states both survive in final `state.json`.
- A capacity-available patch must not fail with `state write lock busy`.
- The test must verify actual persisted state, not just that a helper function exists.

Implementation:

- Add a narrow helper in `src/team/run-workspace.ts`, for example:

```ts
async patchState(runId: string, mutator: (state: TeamRunState) => void | Promise<void>): Promise<TeamRunState>
```

- The helper must:
  - acquire the existing state write lock,
  - read the latest `state.json` while inside the lock,
  - run the mutator against that latest state,
  - update `updatedAt` if the caller did not,
  - write the full latest state to disk,
  - return the saved state.
- Avoid calling the existing public `saveState` from inside the same lock if that would deadlock.
- Keep `saveState` behavior compatible for existing sequential code.

Focused verification:

```powershell
node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts
git diff --check -- src/team/run-workspace.ts test/team-orchestrator-dynamic-expansion.test.ts
```

## Task 3 - Parallel worker-pool execution

Commit suggestion: `feat(team): run parallel for_each children with fixed pool`

Write tests first in `test/team-orchestrator-dynamic-expansion.test.ts`.

Required tests:

- A `parallel` `for_each` with 4 or more items succeeds.
- Active child count never exceeds 3.
- The implementation refills the pool when one child finishes; it must not wait for an entire batch of 3.
- Partial failure: one child fails, at least one child succeeds, parent is `succeeded`, and failed child audit remains.
- All failed: parent is `failed`.
- All skipped: parent is `skipped`.
- 0 items remains parent `succeeded`.
- Expansion record is written once and reused on resume/rerun.

Implementation:

- In `src/team/orchestrator.ts`, split `executeForEachTask(...)` by mode:
  - existing sequential code path stays equivalent,
  - new parallel path uses a fixed `const PARALLEL_FOR_EACH_CONCURRENCY = 3`.
- The parallel pool should:
  - read fresh state before admitting each child,
  - skip terminal children,
  - stop admitting new children when run is not running, shouldStop is true, signal is aborted, or run timeout is reached,
  - execute each child with `executeMaybeDecomposedTask(...)` only if validation already prevents decomposer for parallel templates.
- Use the safe state patch helper where stale writes are possible.
- After all active work settles, reload latest state and summarize parent using the parallel summary semantics.

Do not:

- add `maxConcurrency`,
- add child priorities,
- add nested parallel,
- add scheduler abstractions.

Focused verification:

```powershell
node --test --import tsx test/team-orchestrator-dynamic-expansion.test.ts
git diff --check -- src/team/orchestrator.ts test/team-orchestrator-dynamic-expansion.test.ts
```

## Task 4 - Pause/cancel/rerun controls

Commit suggestion: `test(team): cover parallel for_each run controls`

This task may include implementation fixes if Task 3 exposes control bugs.

Write tests first in `test/team-orchestrator-controls.test.ts`.

Required tests:

- Pausing a run with active parallel children interrupts active children and does not admit new waiting children.
- Cancelling a run with active parallel children marks unfinished children consistently and does not leave contradictory terminal states.
- Rerun/manual disposition keeps existing generated-child semantics:
  - forced rerun children execute again,
  - skipped children remain skipped,
  - already terminal children are not duplicated,
  - expansion is not regenerated.

Implementation:

- Prefer small fixes in `src/team/orchestrator.ts`.
- Do not broaden manual disposition APIs.
- Do not change UI.

Focused verification:

```powershell
node --test --import tsx test/team-orchestrator-controls.test.ts
git diff --check -- src/team/orchestrator.ts test/team-orchestrator-controls.test.ts
```

## Task 5 - Docs and team-plan-creator skill

Commit suggestion: `docs(team): document parallel for_each planning`

Implementation:

- Update `docs/team-runtime.md`:
  - current target should no longer imply every dynamic child is sequential only.
  - `forEach.mode` supports `"sequential"` and `"parallel"`.
  - `parallel` fixed capacity is 3.
  - `parallel` uses refill-on-completion worker pool.
  - parent summary semantics include partial failure.
  - `parallel + taskTemplate.decomposer` is rejected.
  - known limitation "for_each only sequential" must be removed or replaced with the new limitation.
- Update `.pi/skills/team-plan-creator/SKILL.md`:
  - `forEach.mode` can be `"sequential"` or `"parallel"`.
  - Use `"parallel"` when the user asks for parallel research, multi-source investigation, concurrent per-item processing, or similar.
  - Keep the skill prohibition against starting runs.
  - Mention fixed concurrency 3 and no decomposer under parallel.
- Update `docs/change-log.md` with date, subject, affected files, behavior, verification.

Tests/verification:

```powershell
Select-String -Path docs/team-runtime.md,.pi/skills/team-plan-creator/SKILL.md -Pattern "parallel|sequential|decomposer"
git diff --check -- docs/team-runtime.md docs/change-log.md .pi/skills/team-plan-creator/SKILL.md
```

## Task 6 - Final verification and handoff

Commit suggestion: no extra commit unless a real fix is needed.

Run:

```powershell
npm run test:team
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
```

If touched files are unexpectedly huge, inspect EOL:

```powershell
git ls-files --eol src/team/types.ts src/team/plan-store.ts src/team/orchestrator.ts src/team/run-workspace.ts docs/team-runtime.md .pi/skills/team-plan-creator/SKILL.md
```

If a small feature produces thousands of changed lines, stop and investigate line-ending or formatter churn before committing.

## Formatting and EOL hygiene

- Preserve existing line endings and formatting.
- Do not run broad formatters.
- Formatting is allowed only for intentionally changed files and only if it matches existing tooling.
- Review `git diff --stat`, `git diff --numstat`, and suspicious large diffs before accepting work.
- Delivery report must state whether mechanical formatting or EOL normalization occurred.

## Testing rules

Tests must verify real behavior, not just strings.

Do not write weak tests such as:

- only checking that a function name exists,
- allowing contradictory terminal states in one assertion,
- accepting `running` as a terminal result,
- broad `assert.ok(A || B || C)` without a precise reason.

Concurrency tests must verify:

- pool capacity,
- refill-on-completion behavior,
- no lost task state,
- cancel/pause boundaries,
- capacity-available requests do not fail with lock-busy errors.

## Final delivery report template

Use this report format:

```text
完成 Team for_each.parallel v1。

Commits:
- <hash> <message>

实现摘要:
- Schema/validation:
- Runtime worker-pool:
- Parent partial-failure semantics:
- Pause/cancel/rerun:
- Docs/skill:

验证:
- npm run test:team: <result>
- npx tsc --noEmit: <result>
- git diff --check: <result>
- git diff --stat / --numstat reviewed: <yes/no>

未提交文件:
- <list remaining untracked runtime/report artifacts>

EOL/formatter:
- 是否发生机械格式化或换行符转换；如果没有，写“没有”。

阻塞/风险:
- <none or details>
```

## Human/Codex review checklist

- `sequential` path did not regress.
- `parallel` is a fixed-capacity pool, not batch execution.
- Pool capacity is exactly 3.
- Partial failure semantics match the contract.
- All failed / all skipped / zero items are covered.
- Pause/cancel/rerun tests do not accept contradictory states.
- State patch helper prevents stale write-back, not merely file corruption.
- `team-plan-creator` only creates plans and does not start runs.
- Docs and change log match actual behavior.
- No `.env`, `.data`, runtime artifacts, temp files, unknown `.pi/skills/*`, or `skills-lock.json` are committed.
- No EOL-only or formatter-only churn.
