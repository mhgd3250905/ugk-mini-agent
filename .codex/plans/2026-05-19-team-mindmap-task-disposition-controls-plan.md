# Team mindmap task disposition controls plan

## Goal

Add manual task disposition controls directly to Team Runtime mindmap task nodes, so users can mark a task as `skip`, `force_rerun`, or `default` while staying on the mindmap tab instead of scrolling through the tall detail table.

This plan covers only the first optimization explicitly requested by the user:

- Existing mindmap task nodes should show context-appropriate disposition buttons: `跳过`, `强制重跑`, `恢复默认`.
- The controls must call the existing manual disposition API path through existing UI helper `setTaskDisposition(...)`.
- The run-level `按标记重跑` button must remain visible after marking tasks.

The user mentioned "two optimization items" but only specified item 1. Do not invent item 2.

## Current Baseline

- Repository: `E:\AII\ugk-pi`
- Latest commit: `577170c feat(conn): add manual run cancellation`
- Current branch/worktree status at plan creation:
  - Dirty tracked files already exist from Codex's current Team UI fixes:
    - `src/team/orchestrator.ts`
    - `src/ui/team-page.ts`
    - `test/server.test.ts`
    - `test/team-orchestrator-controls.test.ts`
    - `test/team-page-ui.test.ts`
  - These existing dirty changes include:
    - `_planCache` declaration/fallback plan hardening.
    - Missing plan fallback for historical runs.
    - Plan detail run cards reuse `renderRunActions(run)`.
    - `cancelled` runs can be rerun and show `按标记重跑`.
- Known verification already run for the existing dirty changes:
  - `node --test --import tsx --test-name-pattern "GET /playground/team" test/server.test.ts`
  - `node --test --import tsx --test-name-pattern "rerun reopens cancelled run|rerun rejects active|rerun resets failed run|rerun with skip" test/team-orchestrator-controls.test.ts`
  - `node --test --import tsx --test-name-pattern "P24: POST rerun|behavioral: renderRunActions|behavioral: plan run cards reuse" test/team-routes.test.ts test/team-page-ui.test.ts`
  - `npx tsc --noEmit`
  - `git diff --check`

### Important before external agent starts

Prefer that Codex/user commits the current dirty Team UI fixes before external GLM starts. If not committed first, the external agent must treat the dirty files as user/Codex-owned work, must not revert them, and must keep its own changes surgically scoped. One-task-one-commit becomes ambiguous while inherited dirty changes exist, so stop and ask before committing if the workspace is still dirty.

## Must Read

Read these first, in order:

1. `AGENTS.md`
2. `docs/team-runtime.md`
3. `docs/change-log.md`
4. `src/ui/team-page.ts`
5. `test/team-page-ui.test.ts`
6. `test/server.test.ts`
7. `src/team/routes.ts`
8. `src/team/orchestrator.ts`
9. `test/team-routes.test.ts`
10. `test/team-orchestrator-controls.test.ts`

Use this plan as the execution source:

- `.codex/plans/2026-05-19-team-mindmap-task-disposition-controls-plan.md`

## Scope Boundary

In scope:

- Mindmap UI only:
  - Add disposition buttons to task nodes in `renderMindmapNode(...)`.
  - Render current manual disposition badge/status on mindmap nodes.
  - Ensure buttons work for normal tasks, generated `for_each` children, decomposition children, and orphan generated nodes when those nodes represent real task ids.
- Reuse existing frontend function:
  - `setTaskDisposition(runId, taskId, disposition, sourceEl)`.
- Reuse existing backend API:
  - `PATCH /v1/team/runs/:runId/tasks/:taskId/manual-disposition`.
- Preserve run-level `按标记重跑` action.
- Add regression tests that verify behavior in rendered page script/HTML and, where possible, helper logic.
- Update `docs/change-log.md`.

Out of scope:

- Do not add a new backend route.
- Do not change `TeamOrchestrator` rerun semantics unless a test proves the current API cannot support mindmap buttons.
- Do not redesign the mindmap layout.
- Do not implement the user's unspecified second optimization item.
- Do not move the Team UI out of `team-page.ts`.
- Do not refactor unrelated inline script sections.
- Do not change persisted Team state schema.

## Explicit Forbidden List

- Do not run `git reset --hard`, `git checkout --`, or destructive cleanup.
- Do not revert current dirty changes in:
  - `src/team/orchestrator.ts`
  - `src/ui/team-page.ts`
  - `test/server.test.ts`
  - `test/team-orchestrator-controls.test.ts`
  - `test/team-page-ui.test.ts`
- Do not commit `.env`, `.data`, runtime artifacts, public reports, temp files, unknown `.pi/skills/*`, `skills-lock.json`, or `0`.
- Do not edit `references/pi-mono/` unless explicitly instructed.
- Do not broaden this into a full Team UI redesign.
- Do not satisfy the feature by adding string-only tests that merely check a function name exists.

## Current Code Facts

- `renderRunDetailShell(...)` defaults to mindmap view.
- `renderTeamMindmap(runId, state, plan, attemptsMap)` calls `buildMindmapNodes(...)`, then `renderMindmapNode(...)`.
- `renderMindmapNode(node, depth, runId, attemptsMap)` currently shows status, attempts, files, details, and children. It does not expose disposition controls.
- Detail table rows already expose disposition controls in `renderTaskDetail(...)` by calling:
  - `setTaskDisposition(runId, task.id, 'skip', this)`
  - `setTaskDisposition(runId, task.id, 'force_rerun', this)`
  - `setTaskDisposition(runId, task.id, 'default', this)`
- Manual disposition is stored in `state.taskStates[taskId].manualDisposition`.
- Terminal runs that should allow disposition changes include:
  - `completed`
  - `completed_with_failures`
  - `failed`
  - `cancelled`
- Active runs must not show disposition buttons because the backend rejects active-run manual disposition updates.

## Task 1 - Add Test Coverage For Mindmap Disposition Controls

Write tests before implementation.

Likely file:

- `test/team-page-ui.test.ts`

Required assertions:

- `renderMindmapNode(...)` or the inline script includes a disposition-control render path for mindmap nodes.
- Mindmap task controls call `setTaskDisposition(...)` with:
  - `skip`
  - `force_rerun`
  - `default`
- Controls are gated by terminal run status, not shown for active runs.
- `manualDisposition` from task state is carried into the mindmap node model.
- Dynamic/generated child nodes can carry `manualDisposition`.
- Escaping remains safe:
  - task id must go through `jsArg(...)`
  - run id must go through `jsArg(...)`
  - badge text must not interpolate raw dynamic HTML.

Avoid weak tests:

- Do not only assert the string `setTaskDisposition` exists somewhere in the page.
- Do not accept contradictory states like "running OR completed OR cancelled" without explaining the UI condition.
- Do not assert only the button label; assert that the actual call is wired with the right disposition value.

Focused verification:

```bash
node --test --import tsx --test-name-pattern "mindmap.*disposition|renderMindmapNode|manual disposition" test/team-page-ui.test.ts
```

## Task 2 - Carry Manual Disposition Into Mindmap Nodes

Likely file:

- `src/ui/team-page.ts`

Implementation notes:

- In `buildMindmapNodes(...)`, add `manualDisposition` to every task node where `ts` / `childTs` exists:
  - plan task nodes
  - generated child nodes
  - orphan generated nodes
- Do not mutate `state.taskStates`.
- Use a normalized display value:
  - missing/`default` means no warning badge or only neutral/default state depending on design choice.
  - `skip` displays "已设跳过".
  - `force_rerun` displays "已设强制重跑".

Focused verification:

```bash
node --test --import tsx --test-name-pattern "mindmap.*manualDisposition|taskDefinitions wins|orphan" test/team-page-ui.test.ts
```

## Task 3 - Render Mindmap Disposition Actions

Likely file:

- `src/ui/team-page.ts`

Implementation notes:

- Add a small helper in the inline script, for example:
  - `isTerminalRunForDisposition(status)`
  - `renderTaskDispositionControls(runId, taskId, disposition, source)`
- Prefer reusing the existing detail-table button rendering semantics instead of duplicating labels in multiple places.
- `renderMindmapNode(...)` currently receives `node`, `depth`, `runId`, `attemptsMap`; it also needs run status or a precomputed boolean to know whether to show controls.
  - Conservative option: pass `runStatus` through `renderMindmapNode(node, depth, runId, attemptsMap, runStatus)`.
  - Root call in `renderTeamMindmap(...)` should pass `state.status`.
  - Recursive calls must pass the same `runStatus`.
- Do not show controls on the root node or orphan group container itself.
- Do show controls on actual task nodes, including generated/orphan child task nodes.
- Buttons should use compact styles so the mindmap does not become another giant scrolling wall.
- Buttons must call:
  - `event.stopPropagation(); setTaskDisposition(runId, node.id, 'skip', this)`
  - `event.stopPropagation(); setTaskDisposition(runId, node.id, 'force_rerun', this)`
  - `event.stopPropagation(); setTaskDisposition(runId, node.id, 'default', this)`
- Current disposition should be visually clear:
  - If `skip`, highlight/badge `已设跳过`.
  - If `force_rerun`, highlight/badge `已设强制重跑`.
  - If `default`, do not add visual clutter; button "恢复默认" can be disabled or omitted when already default.
- Prefer not to show "恢复默认" when disposition is already default. If you do show it, it must not break layout.

Focused verification:

```bash
node --test --import tsx --test-name-pattern "mindmap.*disposition|GET /playground/team includes mindmap" test/team-page-ui.test.ts test/server.test.ts
```

## Task 4 - Refresh UI Correctly After Mindmap Marking

Likely file:

- `src/ui/team-page.ts`

Current behavior to preserve:

- `setTaskDisposition(...)` calls the API and updates visible UI.
- Run-level actions must keep using `renderRunActions(...)`.
- `按标记重跑` must stay visible on terminal runs, including cancelled runs.

Required behavior:

- After clicking a mindmap disposition button:
  - the node badge/action state should update after the existing refresh path completes.
  - the run card should still show `按标记重跑`.
  - the selected run detail should remain usable; do not collapse the whole detail unexpectedly unless current code already does that for detail-table buttons.
- If current `setTaskDisposition(...)` refreshes only detail-table DOM assumptions, extend it carefully so mindmap refresh also works.

Tests:

- Add or update a UI test that checks `setTaskDisposition(...)` refresh path re-renders detail with cached `state.taskDefinitions` and keeps `renderRunActions(...)`.
- If a browser/e2e test already exists for Team page, extend it; otherwise keep focused script/HTML tests and include manual verification steps in final report.

Focused verification:

```bash
node --test --import tsx --test-name-pattern "setTaskDisposition|renderRunActions|mindmap" test/team-page-ui.test.ts test/server.test.ts
```

## Task 5 - Documentation And Change Log

Likely files:

- `docs/change-log.md`
- `docs/team-runtime.md` only if there is already a UI/manual disposition section that should mention mindmap controls.

Required:

- Add a dated `2026-05-19` change-log entry.
- State:
  - Team mindmap task nodes now expose manual disposition controls.
  - Existing backend manual disposition/rerun API is reused.
  - This reduces scrolling through tall task detail tables for large dynamic/decomposed runs.

Do not stuff implementation trivia into `AGENTS.md`.

Focused verification:

```bash
rg "mindmap|脑图|跳过|强制重跑|恢复默认" docs/change-log.md docs/team-runtime.md
```

## Final Verification Commands

Run all of these before reporting completion:

```bash
node --test --import tsx --test-name-pattern "mindmap|manual disposition|renderRunActions|GET /playground/team" test/team-page-ui.test.ts test/server.test.ts
node --test --import tsx --test-name-pattern "P24: PATCH manual-disposition|P24: POST rerun" test/team-routes.test.ts
npm run test:team
npx tsc --noEmit
git diff --check
```

Manual verification, if user/Codex asks for UI check:

1. Restart app:
   ```bash
   docker compose restart ugk-pi
   ```
2. Open:
   ```text
   http://127.0.0.1:3000/playground/team
   ```
3. Open a terminal run with many tasks, for example a dynamic/decomposed run.
4. Expand run detail and stay on `脑图`.
5. On task nodes, verify:
   - `跳过` works.
   - `强制重跑` works.
   - `恢复默认` works when a task has a non-default disposition.
   - `按标记重跑` remains visible on the run card.

## Commit Suggestions

If current dirty Team UI fixes are committed first:

1. `fix(team-ui): add mindmap task disposition controls`

If current dirty Team UI fixes are not committed first:

- Stop before committing and ask for instructions. Do not create a commit that mixes inherited dirty fixes with this new feature unless the user explicitly approves.

## Delivery Report Template

Use this format when finished:

```text
完成：Team 脑图节点标记控制

改动：
- <files and short behavior summary>

验证：
- <commands run and pass/fail>
- <manual UI result if performed>

影响分析：
- 直接影响：<renderMindmapNode / setTaskDisposition / rerun action>
- 间接影响：<run detail refresh / terminal run actions>
- 数据兼容：<no schema changes or any compatibility note>

未做：
- 未实现用户尚未明确的第二个优化项。
```

## Reviewer Checklist

- Mindmap task nodes, not only detail table rows, can mark task disposition.
- Buttons are hidden for active runs.
- Buttons appear for terminal runs: `completed`, `completed_with_failures`, `failed`, `cancelled`.
- Generated child task ids and orphan task ids use safe JS argument escaping.
- Disposition badge reflects current state.
- `按标记重跑` remains visible after marking tasks.
- No backend route proliferation.
- No unrelated UI redesign.
- `docs/change-log.md` updated.
- Tests cover real behavior, not just the existence of text labels.
