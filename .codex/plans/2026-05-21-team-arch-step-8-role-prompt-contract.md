# Step 8: extract role prompt contract

Date: 2026-05-21

## Goal

Finish the remaining half of Step 7 as a separate, narrow refactor:

- Move Team role prompt builders, JSONish parsers, and output normalizers out of `src/team/agent-profile-role-runner.ts`.
- Keep `AgentProfileRoleRunner` as the adapter for profile resolution, workspace creation, session invocation, abort handling, browser scope routing, and runtime context.

This is a structure-only change. It must not change prompt text, parser fallback behavior, role outputs, model/session/browser behavior, run state, routes, SSE, or UI.

## Current baseline

- Repo: `E:\AII\ugk-pi`
- Latest commit at plan creation: `a8b61b0 refactor(team): extract run response presenter`
- Completed architecture cleanup:
  - Step 1: explicit parallel state writer
  - Step 2: child execution module
  - Step 3: task attempt lifecycle runner
  - Step 4: plan validation module
  - Step 5: RunWorkspace storage adapters
  - Step 6: run detail UI behavior helpers
  - Step 7 Part 1: run response presenter
- Step 7 Part 2 was intentionally not done because prompt/parser/session boundaries were too risky for the same commit.
- Current known verification after Step 7 review:
  - `npm run test:team`: 815 pass / 0 fail / 2 skip
  - `npx tsc --noEmit`: clean
  - `git diff --check a8b61b0^ a8b61b0`: clean
- Current `git status --short` contains only historical untracked plan/runtime/report artifacts. Do not commit them unless explicitly requested.

## Must-read files

- `AGENTS.md`
- `docs/team-runtime.md`
- `.codex/plans/2026-05-21-team-architecture-optimization-index.md`
- `.codex/plans/2026-05-21-team-arch-step-7-routes-and-role-runner.md`
- `.codex/plans/2026-05-21-team-arch-step-8-role-prompt-contract.md`
- `src/team/agent-profile-role-runner.ts`
- `src/team/role-runner.ts`
- `src/team/types.ts`
- `test/team-agent-profile-runner.test.ts`
- `test/team-role-runner.test.ts`

## Scope boundary

Allowed files:

- `src/team/agent-profile-role-runner.ts`
- new `src/team/role-prompt-contract.ts` or similarly named contract module
- `test/team-agent-profile-runner.test.ts`
- optional new `test/team-role-prompt-contract.test.ts` if focused pure-module tests keep the existing runner test file from growing further
- `docs/team-runtime.md`
- `docs/change-log.md`

Forbidden files unless a compile error proves they are directly necessary:

- `src/team/routes.ts`
- `src/team/orchestrator.ts`
- `src/team/child-execution.ts`
- `src/team/task-attempt-runner.ts`
- `src/team/run-workspace.ts`
- `src/ui/*`
- `.pi/skills/*`
- runtime product data under `.data`, `runtime`, or `public`

## Forbidden behavior changes

- Do not change prompt text intentionally. Mechanical movement only.
- Do not change parser fallback order:
  1. stripped full JSON
  2. fenced `json` block
  3. first balanced `{ ... }`
  4. role-specific JSONish fallback where it exists
- Do not change checker fallback reasons:
  - invalid normalized parsed object: `checker output parse error: invalid verdict`
  - no parseable checker output: `checker output parse error`
- Do not change watcher fallback reasons:
  - invalid normalized parsed object: `watcher output parse error: invalid decision`
  - no parseable watcher output: `watcher output parse error`
- Do not change decomposer fallback:
  - invalid schema: `decomposer output parse error: invalid schema`
  - parse error: `decomposer output parse error`
  - fallback decision remains `no_split` with `children: []`
- Do not change browser scope format or sanitization.
- Do not change `AgentSession` creation input.
- Do not change abort handling.
- Do not change resultRef file reading behavior.
- Do not change runtimeContext attachment.
- Do not broaden this into route, orchestrator, UI, or scheduler cleanup.
- Do not run broad formatters or convert line endings.

## Target design

Create a pure role prompt contract module. Good module responsibilities:

- Source item identity blocks:
  - generated child source item fallback
  - worker identity prompt block
  - checker mismatch fail instruction
  - watcher mismatch reject instruction
- Output contract prompt blocks:
  - discovery outputKey
  - html_fragment
  - json_items / json_object
  - file_exists
- Validation evidence prompt blocks for checker and watcher.
- Prompt builders:
  - `buildWorkerPrompt`
  - `buildCheckerPrompt`
  - `buildWatcherPrompt`
  - `buildFinalizerPrompt`
  - `buildDecomposerPrompt`
- Parser and normalizer helpers:
  - checker role output parser/normalizer
  - watcher role output parser/normalizer
  - decomposer output parser/normalizer

Keep these in `AgentProfileRoleRunner`:

- `buildDefaultRef`
- profile resolution
- role workspace creation
- `readRefContent`
- `promptWithAbort`
- browser scope route setup and cleanup
- `buildTeamBrowserScope` and `sanitizeScopePart` unless the extracted module genuinely needs them, which it should not
- `runSession`
- attaching `runtimeContext` to final role outputs

The new module should not import `BackgroundAgentSessionFactory`, `AgentSessionLike`, browser helpers, filesystem helpers, or route/server code.

## Required tests before implementation

Add focused characterization tests before moving code. These tests must verify real behavior, not just exported function names.

Recommended tests:

1. Worker prompt includes the same source item identity and machine-consumable output contract for generated discovery tasks.
2. Checker prompt includes output validation evidence and forbids `pass` when `outputValidation.ok=false`.
3. Watcher prompt includes output validation evidence and forbids `accept_task` when `outputValidation.ok=false`.
4. Checker output parser preserves:
   - strict JSON pass
   - fenced JSON
   - embedded balanced JSON
   - JSONish unescaped quote tolerance
   - invalid output -> fail fallback reason
5. Watcher output parser preserves:
   - strict JSON accept
   - JSONish fallback
   - invalid output -> confirm_failed fallback reason
6. Decomposer output parser preserves:
   - valid split with normalized child task
   - no_split
   - invalid schema -> no_split fallback reason
7. Runner integration still captures the same prompt content through `session.prompt`.
8. Runner integration still passes browser scope and runtimeContext unchanged.

Prefer a new `test/team-role-prompt-contract.test.ts` for pure builder/parser tests, while leaving session/browser integration tests in `test/team-agent-profile-runner.test.ts`.

Do not add giant full-prompt snapshots unless there is already a local pattern for them. Prefer exact assertions for critical substrings and exact parser output objects.

## Implementation steps

1. Inspect the current `src/team/agent-profile-role-runner.ts` and identify pure prompt/parser/normalizer helpers.
2. Add characterization tests for the behavior listed above.
3. Run the focused tests and confirm they pass before refactor.
4. Create `src/team/role-prompt-contract.ts`.
5. Move pure helpers into the new module.
6. Export a small API. Suggested shape:

```ts
export function buildWorkerPrompt(...): string;
export function buildCheckerPrompt(...): string;
export function buildWatcherPrompt(...): string;
export function buildFinalizerPrompt(...): string;
export function buildDecomposerPrompt(...): string;
export function parseCheckerRoleOutput(content: string): Omit<CheckerOutput, "runtimeContext">;
export function parseWatcherRoleOutput(content: string): Omit<WatcherOutput, "runtimeContext">;
export function parseDecomposerRoleOutput(content: string, maxChildren: number): Omit<DecomposerOutput, "runtimeContext">;
```

7. Rewire `AgentProfileRoleRunner`:
   - build prompts using the new module
   - parse role output using the new module
   - attach `runtimeContext` in the runner, not in the prompt contract module
8. Keep `readRefContent` in the runner so file IO stays adapter-side.
9. Keep browser scope/session/abort code untouched except for import cleanup.
10. Update `docs/team-runtime.md` with one short architecture note.
11. Update `docs/change-log.md` with one dated entry.
12. Inspect `git diff --stat`, `git diff --numstat`, and EOL before committing.

## Focused verification

Run:

```powershell
node --test --import tsx test/team-role-prompt-contract.test.ts
node --test --import tsx test/team-agent-profile-runner.test.ts
node --test --import tsx test/team-role-runner.test.ts
npx tsc --noEmit
git diff --check
```

If no new `test/team-role-prompt-contract.test.ts` is created, replace the first command with the focused runner test command that covers the new contract behavior:

```powershell
node --test --import tsx --test-name-pattern "prompt|parse|jsonish|decomposer|validation|browser scope|runtimeContext" test/team-agent-profile-runner.test.ts
```

## Final verification

Run before handoff:

```powershell
npm run test:team
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
git ls-files --eol src/team/agent-profile-role-runner.ts src/team/role-prompt-contract.ts test/team-agent-profile-runner.test.ts test/team-role-prompt-contract.test.ts docs/team-runtime.md docs/change-log.md
```

If `test/team-sse-attempt-api.test.ts` is included in any broad run and hits SQLite `database is locked`, rerun that file with:

```powershell
node --test --test-concurrency=1 --import tsx test/team-sse-attempt-api.test.ts
```

Do not hide the first failure. Report it as a test harness concurrency note if the single-process rerun passes.

## Commit message suggestion

```text
refactor(team): extract role prompt contract
```

## Delivery report template

```text
完成 Step 8：role prompt contract 抽取。

Commit:
- <hash> refactor(team): extract role prompt contract

实现摘要:
- 新增 <module path>，抽出 prompt builders / parser / normalizer
- AgentProfileRoleRunner 保留 profile/session/browser/workspace/abort/runtimeContext adapter 职责
- 确认 prompt 文本、JSONish fallback、decomposer fallback、browser scope、session invocation 未改

验证:
- node --test --import tsx test/team-role-prompt-contract.test.ts: <结果，如无该文件说明替代命令>
- node --test --import tsx test/team-agent-profile-runner.test.ts: <结果>
- node --test --import tsx test/team-role-runner.test.ts: <结果>
- npm run test:team: <结果>
- npx tsc --noEmit: <结果>
- git diff --check: <结果>
- git diff --stat / --numstat: 已复核 <简述>
- git ls-files --eol <touched files>: <结果>

EOL/formatter churn:
- <没有 / 如有说明并说明是否已清理>

未提交文件:
- <确认 .codex/plans、.env、.data、runtime、public 产物未提交>

风险/阻塞:
- <无 / 说明>
```

## Review checklist

- The new module is pure: no filesystem, session, browser, Fastify, or server imports.
- `AgentProfileRoleRunner` still owns adapter behavior.
- Prompt text is not intentionally changed.
- Parser fallback order is preserved.
- Fallback reasons are exact.
- Runtime context is still attached by runner methods.
- Browser scope values and cleanup behavior are unchanged.
- Test coverage includes both pure contract behavior and runner integration.
- Diff size matches a refactor, not a rewrite.
- EOL remains LF for touched files.
- Historical untracked runtime/report artifacts are not committed.
