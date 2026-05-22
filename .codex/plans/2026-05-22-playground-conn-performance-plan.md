# Playground Conn Page Performance Optimization Plan

Date: 2026-05-22
Target page: `/playground/conn`
Reviewed baseline commit: `4de63b2 fix(agents): surface skills load failures`
Backup context: main is ahead of `origin/main`; tracked workspace was clean before this planning update.

## Goal

Make the standalone background task cockpit responsive during first load, task selection, run history inspection, and realtime updates.

This is not a redesign of the conn runtime. The goal is to reduce unnecessary network payload, avoid whole-panel DOM rebuilds, and make the existing UI update in bounded, predictable chunks.

## Current Findings

This review is based on source inspection plus the previous browser baseline captured in this plan. The old numeric timings are still useful directionally, but GLM must re-run browser verification after each task because the repository has moved since the original `8b1c5ee` baseline.

Current implementation facts:

- `/playground/conn` standalone page is assembled by `src/ui/conn-page.ts`, `src/ui/conn-page-js.ts`, and `src/ui/conn-page-css.ts`.
- `loadData()` currently fetches `/v1/conns`, `/v1/agents`, `/v1/browsers`, and `/v1/model-config` on first load. The last three are primarily editor/support catalogs, not necessary for the initial list/details screen.
- `init()` calls `loadData()`, then auto-selects the first conn through `handleConnSelect()`. `handleConnSelect()` calls `apiFetchRuns(connId)` if the runs cache is missing, so first load still pulls a full run history.
- `apiFetchRuns(connId)` calls `/v1/conns/:connId/runs` without query parameters.
- `GET /v1/conns/:connId/runs` in `src/routes/conns.ts` calls `listRunsForConn(connId)` and returns the full history. `ConnRunStore.listRunsForConn()` is also unbounded.
- `GET /v1/conns/:connId/runs/:runId/events` already has bounded event pagination; do not confuse event pagination with run-list pagination.
- `connectSSE()` ignores the SSE event payload and calls `loadData()` on every notification. That reloads conns plus editor catalogs, which is far too broad for conn result broadcasts.
- `handlePause()`, `handleResume()`, `handleDelete()`, and `handleMarkAllRead()` still use broad `renderAll()` paths where targeted renders would do.
- `handleMarkAllRead()` currently calls `loadRuns(state.selectedId)`, but no `loadRuns()` function exists in `src/ui/conn-page-js.ts`. This stale call must be cleaned up when touching read-all / targeted run refresh. Classic "works until someone clicks it" landmine.

Previous browser baseline from the old plan:

- Document `/playground/conn`: about `205.9KB`
- `GET /v1/conns`: about `126KB`
- First-load editor catalogs: `/v1/agents`, `/v1/browsers`, `/v1/model-config`
- Auto-selected first task triggered `GET /v1/conns/:connId/runs`: about `60KB`
- Switching a long-history task triggered a run-history payload around `237KB`

## Must Read

- `AGENTS.md`
- `docs/playground-current.md`
- `docs/runtime-assets-conn-feishu.md`
- `docs/change-log.md`
- `.codex/plans/2026-05-22-playground-conn-performance-plan.md`
- `src/ui/conn-page-js.ts`
- `src/ui/conn-page-css.ts`
- `src/ui/conn-page.ts`
- `src/routes/conns.ts`
- `src/routes/conn-route-presenters.ts`
- `src/routes/notifications.ts`
- `src/agent/conn-run-store.ts`
- `src/agent/conn-sqlite-store.ts`
- `src/types/api.ts`
- `test/server.test.ts`
- `test/conn-page-ui.test.ts`
- Relevant conn tests under `test/conn*.test.ts`

## Scope Boundary

Allowed:

- Optimize only the standalone `/playground/conn` page data loading and rendering.
- Add optional, backward-compatible pagination parameters for conn run history.
- Improve frontend refresh granularity and notification coalescing.
- Add focused tests proving behavior.
- Update `docs/playground-current.md` and `docs/change-log.md` when a task changes behavior.

Forbidden:

- Do not change conn worker scheduling semantics.
- Do not change run execution, lease, heartbeat, stale recovery, workspace layout, or artifact delivery.
- Do not change Feishu delivery behavior.
- Do not change database schema unless a task explicitly proves it is necessary and backward compatible.
- Do not redesign the page visually beyond minor loading/placeholder states needed for performance.
- Do not modify `/playground` embedded Conn Manager unless a task explicitly says so. This plan targets standalone `/playground/conn`.
- Do not run broad formatters or cause EOL-only churn.
- Do not commit `.env`, `.data`, `runtime/*`, `public/*`, screenshots, browser profiles, `curate_news*.py`, `zhihu-hotlist-*.json`, `reddit-*` reports, `qwen-3-7-max-reviews.html`, odd session jsonl files, or unrelated `.codex/plans` files.

## Execution Rules

- One task, one commit.
- Tests first, then implementation.
- If a task's assumption is wrong, stop and report before expanding scope.
- Before browser verification, run `npm run docker:doctor`.
- If `docker:doctor` reports a host `node` listener shadowing `127.0.0.1:3000`, stop and report. Do not start a separate host Node server to "work around" it. We have already wasted enough time on localhost shadow puppetry.
- Final browser verification must use `http://127.0.0.1:3000/playground/conn`.
- Prefer `docker compose restart ugk-pi` after frontend/server code changes.

## Task 1 - Defer Editor Support Catalogs

Problem:

First load fetches `/v1/agents`, `/v1/browsers`, and `/v1/model-config` even when the user only wants to inspect the task list. These catalogs are mostly needed by create/edit forms.

Implementation:

- Split `loadData()` into a conn list refresh and an editor/support catalog loader.
- First load should fetch `/v1/conns` only.
- Load `/v1/agents`, `/v1/browsers`, and `/v1/model-config` lazily when opening create/edit editor.
- Cache successful support catalogs for subsequent editor opens.
- While catalogs are loading or unavailable, disable editor save or guard payload creation so the page cannot submit broken provider/browser/agent values.
- Manual refresh may refresh conns immediately; it does not need to refetch support catalogs unless the editor is open or a force refresh path is intentionally added.

Tests first:

- Test `loadData()` no longer includes `apiFetchAgentCatalog()`, `apiFetchBrowserCatalog()`, or `apiFetchModelConfig()` on initial load.
- Test `openEditor()` or the editor render path triggers/can await a support catalog loader.
- Test cached catalogs are reused across create/edit opens.
- Test save is disabled or guarded while required editor catalogs are not ready.

Verification:

- Reload `/playground/conn`; initial waterfall should not include `/v1/agents`, `/v1/browsers`, or `/v1/model-config`.
- Open create editor; those catalogs should load then.
- Open edit editor afterward; cached catalogs should be reused without duplicate requests.

Commit suggestion:

`perf(conn): defer editor support catalogs`

## Task 2 - Stop Auto-Fetching Full Runs On First Load

Problem:

`init()` auto-selects the first conn through `handleConnSelect()`, which fetches full run history. That spends network and render work before user intent.

Implementation:

- It is acceptable to visually select the first conn after `/v1/conns`, but selection must not call `apiFetchRuns(firstConnId)`.
- Use `conn.latestRun` from `/v1/conns` to render the initial detail summary.
- Add `runsLoadedByConnId` or equivalent state so the page can distinguish "selected" from "run history loaded".
- Add an explicit load affordance for the run history section, e.g. compact "加载运行历史".
- Do not erase a valid loaded empty array; empty loaded history is different from not loaded.
- Avoid stale async rendering: if the user switches selected conn while a history load is in flight, only render the result if `state.selectedId` still matches.

Tests first:

- Test `init()` / first-load path no longer chains auto-selection into `apiFetchRuns(firstConnId)`.
- Test first detail render can use `latestRun` without full `runsByConnId`.
- Test selecting a conn shows lazy run-history state without fetching until the explicit action.
- Test async history result is guarded by selected conn id.

Verification:

- Reload `/playground/conn`; initial waterfall should not include `/v1/conns/:connId/runs`.
- Page still shows task list, stats, selected state, detail summary, and no broken empty panel.

Commit suggestion:

`perf(conn): defer initial run history loading`

## Task 3 - Add Bounded Run History Pagination

Problem:

`GET /v1/conns/:connId/runs` returns all runs, but the UI renders only the first 10. Large histories still travel over the network.

Implementation:

- Extend `ConnRunStoreLike.listRunsForConn()` and `ConnRunStore.listRunsForConn()` with optional pagination options while preserving current no-argument behavior.
- Extend `GET /v1/conns/:connId/runs` with optional `limit` and stable cursor query parameters.
- Keep old callers compatible: omitting query parameters should still return the full history unless this task explicitly updates that caller.
- Prefer a stable cursor that respects current ordering: `scheduled_at DESC, created_at DESC, run_id DESC`. Avoid timestamp-only cursors that break on ties.
- Return `runs`, `hasMore`, `nextBefore` or equivalent metadata, and `limit`.
- Update frontend `apiFetchRuns(connId)` to request a bounded first page such as `limit=10`.
- Add "加载更多" that appends additional runs without resetting selected conn, expanded run, or scroll position.

Tests first:

- Route tests for `GET /v1/conns/:connId/runs?limit=10`.
- Boundary tests for invalid `limit` and invalid cursor.
- Store tests proving stable pagination order and tie-break behavior.
- Frontend test proving the first run-history fetch sends a bounded query.
- Frontend test proving "加载更多" appends runs instead of replacing selected task state.

Verification:

- Selecting a long-history task should fetch a bounded first page.
- "加载更多" should fetch the next page and append.
- Run detail expansion must still fetch `/runs/:runId` and `/events` on demand.

Commit suggestion:

`perf(conn): paginate standalone run history`

## Task 4 - Coalesce And Narrow Realtime Refresh

Problem:

`connectSSE()` calls `loadData()` on every notification. That refetches conns and editor catalogs even for a single conn completion event.

Implementation:

- Parse the SSE event payload. Notification events have `source`, `sourceId`, `runId`, `kind`, and timestamps.
- For `source === "conn"`, schedule a narrow conn refresh.
- Add a short coalescing window, such as 500ms, so bursts of events produce one refresh.
- Notification refresh should fetch `/v1/conns` only by default.
- If the selected conn is affected and its run history is already loaded, refresh only the selected conn's first run page or upsert the affected run by fetching detail when appropriate.
- Do not refetch `/v1/agents`, `/v1/browsers`, or `/v1/model-config` from notification paths.
- Manual refresh remains an explicit user action and may refresh the full currently needed state.
- Avoid parallel duplicate refreshes; late events should join a pending refresh.

Tests first:

- Behavior test: multiple notification events within the window produce one conn refresh.
- Test notification refresh does not call agent/browser/model loaders.
- Test non-conn events are ignored or handled without full page reload.
- Test manual refresh still refreshes the intended user-facing data.

Verification:

- Simulate or trigger a notification; network should be bounded to `/v1/conns` and, only when needed, selected run-history refresh.
- No duplicate rows, stale selected row, or editor catalog refetches after notification bursts.

Commit suggestion:

`perf(conn): narrow realtime refresh scope`

## Task 5 - Split Rendering Into Targeted Updates

Problem:

Several handlers call `renderAll()` repeatedly. `renderAll()` rebuilds stats, list, and detail even when only action state or one task row changed.

Implementation:

- Keep `renderAll()` for initial load and major fallback only.
- Introduce or clarify targeted render helpers for:
  - stats only
  - list only
  - selected detail header/body
  - run history only
- Replace repeated `renderAll()` in `handlePause()`, `handleResume()`, `handleDelete()`, `handleMarkAllRead()`, and related action paths with targeted renders.
- Fix the stale `loadRuns(state.selectedId)` call in `handleMarkAllRead()` by using the current run-history loader/refresh helper from Tasks 2-3.
- Preserve current selection, scroll position, expanded run, and mobile list/detail panel state.
- Add async selected-id guards where a delayed action could repaint a stale conn.

Tests first:

- Script test proving pause/resume/delete/read-all no longer each call `renderAll()` before, during, and after a small mutation.
- Test `handleMarkAllRead()` no longer references undefined `loadRuns`.
- Test one representative action updates visible list/detail state through targeted renders.
- Test selected-id guard on an async run-history/action result.

Verification:

- Browser operate pause/resume/run-now/delete/read-all.
- No duplicate buttons, stale selected row, scroll jump, or mobile panel reset.

Commit suggestion:

`perf(conn): render targeted task updates`

## Task 6 - Improve Loading States Without Visual Redesign

Problem:

Lazy and paginated run history needs honest loading, empty, error, retry, and has-more states. Without these, the UI can look broken even when it is simply waiting or paginating.

Implementation:

- Add compact loading state for run history first page.
- Add error state with retry for run history fetch.
- Add explicit empty loaded state.
- Add has-more / loading-more state for pagination.
- Keep the current cockpit visual system and dark/light theme tokens.
- Do not add decorative cards, marketing copy, new layout systems, or broad visual redesign.

Tests first:

- Test loading, empty, error, retry, and has-more states exist in the generated page script.
- Test retry uses the selected conn id and does not fetch stale conn history.
- If CSS is touched, test the class names exist and use theme variables rather than hard-coded single-theme colors.

Verification:

- Toggle dark/light theme and inspect run history states.
- State transitions should not cause the whole detail panel to jump.

Commit suggestion:

`ux(conn): add bounded run history loading states`

## Final Verification

Run at the end of each task unless the task-specific message narrows it:

```text
node --test --import tsx test/server.test.ts
node --test --import tsx test/conn-page-ui.test.ts
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
git status --short --branch
```

If touching route or store logic, also run relevant conn tests:

```text
node --test --import tsx test/conn-route-presenters.test.ts
node --test --import tsx test/conn-run-store.test.ts
node --test --import tsx test/conn-sqlite-store.test.ts
```

Before browser checks:

```text
npm run docker:doctor
docker compose restart ugk-pi
```

Browser verification:

- Reload `/playground/conn`.
- After Task 1, first waterfall must not include editor support catalogs.
- After Task 2, first waterfall must not include `/v1/conns/:connId/runs`.
- After Task 3, selecting a long-history task should request a bounded first run page.
- Search input should not trigger network requests.
- Manual refresh should still work.
- Notification refresh should be conn-scoped and coalesced.

## Delivery Report Template

```text
Task <n> completed.

Commit:
- <hash> <subject>

Files changed:
- <file>: <summary>

Behavior changed:
- <what changed>

Tests:
- <commands and pass/fail>

Browser verification:
- <network/DOM/interaction observations>

EOL / formatting:
- Whether mechanical formatting or EOL normalization occurred: yes/no

Dirty workspace:
- Confirm unrelated untracked files were not staged or committed.

Known residual risk:
- <risk or none>
```
