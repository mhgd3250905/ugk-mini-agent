# 2026-05-20 Team run actions review fix plan

## Goal

Fix the review findings in the current Team mindmap task disposition work:

1. Make `renderRunActions(...)` safely escape dynamic `runId` values when building inline `onclick` handlers.
2. Remove or repair the drift between the inline Team page renderer in `src/ui/team-page.ts` and the test helper mirror in `src/ui/team-page-helpers.ts`.
3. Strengthen tests so they verify actual rendered behavior and escaping, not only string presence or a stubbed helper.

This is a narrow review-fix task. Do not redesign Team Runtime, rerun semantics, task disposition APIs, or the mindmap UI.

## Current Baseline

- Repo path: `E:\AII\ugk-pi`
- Latest commit: `577170c feat(conn): add manual run cancellation`
- Current dirty worktree includes multiple unrelated / inherited changes:
  - `.codex/skills/glm-plan/SKILL.md`
  - `docs/change-log.md`
  - `src/team/orchestrator.ts`
  - `src/ui/conn-page-js.ts`
  - `src/ui/team-page.ts`
  - `test/server.test.ts`
  - `test/team-orchestrator-controls.test.ts`
  - `test/team-page-ui.test.ts`
  - untracked `.codex/plans/2026-05-19-team-mindmap-task-disposition-controls-plan.md`
  - untracked `test/conn-page-ui.test.ts`
  - runtime/report artifacts under `public/` and `runtime/ruflo-research/`
- Known recent verification reported before this review:
  - `npm run test:team` -> 748 tests, 746 pass, 0 fail, 2 skip
  - `npx tsc --noEmit` -> clean
  - focused Team tests -> 19 pass / 9 pass, 0 fail
- Review findings to fix:
  - `src/ui/team-page.ts` `renderRunActions(...)` currently interpolates `r.runId` directly into inline JavaScript strings.
  - `src/ui/team-page.ts` `renderPlanRunCard(...)` now calls `renderRunActions(run)`, so the unsafe `runId` path affects plan run cards too.
  - `src/ui/team-page-helpers.ts` `renderPlanRunCard(...)` still reflects the old terminal action logic; cancelled runs do not show rerun in the helper mirror.
  - Some tests check source strings or use a stubbed `renderRunActions`, so they can pass while helper and inline behavior drift.

## Must-Read Files

- `AGENTS.md`
- `docs/change-log.md`
- `.codex/plans/2026-05-19-team-mindmap-task-disposition-controls-plan.md` if present
- `src/ui/team-page.ts`
- `src/ui/team-page-helpers.ts`
- `test/team-page-ui.test.ts`
- `test/server.test.ts`
- `src/team/orchestrator.ts`
- `test/team-orchestrator-controls.test.ts`

## Absolute Scope Boundary

Only address the Team run action review findings:

- Safe escaping for run action onclick handlers.
- Helper mirror parity for plan run cards.
- Tests for actual rendered output and escaping.
- A small `docs/change-log.md` note if behavior/test contract changes.

Allowed likely files:

- `src/ui/team-page.ts`
- `src/ui/team-page-helpers.ts`
- `test/team-page-ui.test.ts`
- `test/server.test.ts` only if a focused smoke assertion is useful
- `docs/change-log.md`

## 禁止做

- Do not clean, revert, or commit unrelated dirty files.
- Do not touch conn daily schedule fixes unless a test command requires reading them.
- Do not touch Team browser/defaultBrowserId fallback in this task.
- Do not change rerun backend semantics beyond what is already dirty.
- Do not redesign mindmap disposition controls.
- Do not start Chrome or use browser automation; the user will test UI manually.
- Do not restart services.
- Do not commit `.env`, `.data`, runtime artifacts, temp files, unknown `.pi/skills/*`, `skills-lock.json`, public reports, `runtime/ruflo-research/`, or file `0`.
- Do not run broad formatters on unrelated files.
- Preserve existing line endings and formatting. Do not convert LF to CRLF or CRLF to LF unless explicitly doing a dedicated EOL normalization commit.
- If a small fix creates thousands of changed lines, stop immediately and inspect for EOL / formatter churn before continuing.

## Task 1 - Add failing tests for run action escaping

Write tests before implementation.

Target:

- `test/team-page-ui.test.ts`

Requirements:

- Add a focused test around the inline `renderRunActions(...)` source or executable extracted function that verifies a malicious/special `runId` containing `'`, `"`, `<`, and `\` does not appear raw inside generated inline handlers.
- Prefer executing the real inline `renderRunActions` function extracted from `src/ui/team-page.ts` with minimal stubs, instead of only asserting that a function name exists.
- Verify completed/failed/cancelled terminal actions still include expected buttons:
  - completed / completed_with_failures / failed: detail toggle, view report, rerun, delete
  - cancelled: detail toggle, rerun, delete, and no view report
- Verify the generated onclick arguments use escaped / JSON-safe values. Do not accept broad `assert.ok(A || B || C)` style tests.

Focused command:

```powershell
node --test --import tsx --test-name-pattern "renderRunActions|plan run card|malicious run data|cancelled" test/team-page-ui.test.ts
```

Expected result before implementation: at least one new escaping test should fail.

## Task 2 - Fix `renderRunActions(...)` escaping in the inline Team page

Target:

- `src/ui/team-page.ts`

Implementation guidance:

- In `renderRunActions(r)`, compute a safe run id argument once:
  - use existing `jsArg(r.runId)` for JavaScript string arguments.
  - keep `escapeHtml(...)` for HTML text / attributes when needed.
- Replace inline patterns like:

```js
"toggleRunDetail(\\'" + r.runId + "\\',this)"
```

with `jsArg`-based concatenation, for example:

```js
"toggleRunDetail(" + runIdArg + ",this)"
```

- Apply the same safe argument to:
  - `toggleRunDetail`
  - `pauseRunWithConfirm`
  - `cancelRunWithConfirm`
  - `resumeRunWithConfirm`
  - `viewReport`
  - `rerunRunConfirm`
  - `deleteRun`
- Keep the existing visible labels and status gating.
- Do not broaden `renderRunActions` API unless tests show plan cards need separate detail-toggle behavior. If adding an options parameter, keep backward compatibility.

Focused command:

```powershell
node --test --import tsx --test-name-pattern "renderRunActions|plan run card|malicious run data|cancelled" test/team-page-ui.test.ts
```

## Task 3 - Repair helper mirror drift or explicitly remove its authority

Target:

- `src/ui/team-page-helpers.ts`
- `test/team-page-ui.test.ts`

Preferred path:

- Update `src/ui/team-page-helpers.ts` `renderPlanRunCard(...)` so its terminal action behavior matches the inline renderer:
  - completed / completed_with_failures / failed include report, rerun, delete
  - cancelled includes rerun and delete, no report
  - active states preserve pause/resume/cancel behavior
- Make its escaping at least as safe as the existing helper style. If adding a helper-local `jsArg` equivalent is necessary, keep it local and small.
- Strengthen helper tests:
  - completed helper output includes `rerunRunConfirm`
  - cancelled helper output includes `rerunRunConfirm` and does not include `viewReport`
  - malicious terminal run id is safely escaped in helper output
- Adjust parity tests so they no longer rely on a fake `renderRunActions` stub that can mask drift. If a stub is unavoidable because `renderPlanRunCard` calls an outer inline function, make the test explicitly verify both:
  - real `renderRunActions` output
  - `renderPlanRunCard` integration shape

Alternative path:

- If helper mirror is intentionally obsolete, remove or narrow tests that present it as authoritative and document the decision in the test comments. Do not leave a helper that silently contradicts production UI.

Focused command:

```powershell
node --test --import tsx --test-name-pattern "renderPlanRunCard|parity|malicious run data|cancelled" test/team-page-ui.test.ts
```

## Task 4 - Keep server smoke tests useful but not brittle

Targets:

- `test/server.test.ts`
- `test/team-page-ui.test.ts`

Requirements:

- Avoid adding more tests that only assert source text like `function renderMindmapNode(...)` exists unless that is already the established smoke style for the page shell.
- For this review fix, prefer behavioral tests in `test/team-page-ui.test.ts`.
- If touching `test/server.test.ts`, keep it to one or two broad HTML shell assertions that verify the page includes the updated action path, not every implementation detail.

Focused command:

```powershell
node --test --import tsx --test-name-pattern "GET /playground/team|renderRunActions|plan run card" test/team-page-ui.test.ts test/server.test.ts
```

## Task 5 - Update documentation and inspect diff hygiene

Targets:

- `docs/change-log.md` if behavior/test contract changed.

Requirements:

- Add a short entry under `2026-05-20` or extend the existing Team entry, explaining:
  - run action onclick arguments now use safe JS argument escaping
  - helper parity / tests were tightened
- Do not edit unrelated changelog sections.
- Inspect diff size and EOL before final handoff:

```powershell
git diff --stat
git diff --numstat
git diff --check
git ls-files --eol src/ui/team-page.ts src/ui/team-page-helpers.ts test/team-page-ui.test.ts test/server.test.ts docs/change-log.md
```

If `git diff --stat` or `git diff --numstat` shows thousands of changed lines for this small fix, stop and investigate EOL / formatter churn. Revert unintended mechanical churn before handoff.

## Final Verification Commands

Run focused checks first:

```powershell
node --test --import tsx --test-name-pattern "renderRunActions|renderPlanRunCard|parity|malicious run data|cancelled|GET /playground/team" test/team-page-ui.test.ts test/server.test.ts
```

Then run broader Team checks:

```powershell
npm run test:team
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
```

If large UI/test files were touched, inspect EOL:

```powershell
git ls-files --eol src/ui/team-page.ts src/ui/team-page-helpers.ts test/team-page-ui.test.ts test/server.test.ts docs/change-log.md
```

## Commit Message Suggestions

Use one task, one commit. Suggested commits:

1. `test(team-ui): cover run action escaping and cancelled rerun`
2. `fix(team-ui): escape run action handlers safely`
3. `test(team-ui): restore plan run card helper parity`

If the final diff is tiny, Tasks 1 and 2 may be one commit only if the user approves. Do not bundle unrelated dirty files.

## Delivery Report Template

```text
完成：Team run action review fixes

改动：
- <file>: <what changed>
- <file>: <what changed>

验证：
- <command> -> <result>
- <command> -> <result>

影响分析：
- 直接影响：<callers / UI entry points>
- 间接影响：<refresh/render paths>
- 数据兼容：<persisted state changes or none>

Diff / EOL：
- git diff --stat / --numstat reviewed: <yes/no, notable sizes>
- git diff --check: <result>
- EOL normalization or mechanical formatting occurred: <no/yes with explanation>

未做：
- <explicit non-goals not touched>
```

## Review Checklist

Reviewer should check:

- `renderRunActions(...)` no longer interpolates raw `r.runId` into JavaScript handlers.
- Completed / failed / cancelled run actions are still visible where intended.
- Cancelled runs can still show `按标记重跑`.
- `src/ui/team-page-helpers.ts` no longer contradicts production inline behavior, or tests clearly document that it is not authoritative.
- Tests execute meaningful rendered behavior and escaping, not only source string existence.
- `git diff --stat` / `git diff --numstat` do not show suspicious large churn.
- `git diff --check` is clean.
- No `.env`, `.data`, runtime output, public reports, unknown `.pi/skills/*`, `skills-lock.json`, or temp files are included.
- No unrelated dirty work was reverted or committed.
