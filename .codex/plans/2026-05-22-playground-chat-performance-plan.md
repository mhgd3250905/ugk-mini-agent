# Playground Chat Performance Plan

## Goal

Optimize the most-used `/playground` chat experience by reducing unnecessary conversation-list DOM, avoiding redundant catalog requests, and deferring non-chat work from the first interactive path.

This plan is scoped to frontend/UI and lightweight request orchestration. It must not change agent runtime semantics, chat route contracts, Team Runtime, conn worker execution, scheduler, worker leases, or server-side conversation persistence.

## Current Baseline

- Repo: `E:\AII\ugk-pi`
- Branch: `main`
- Current HEAD after Step 3: `f31842e perf(playground): coalesce conversation catalog refreshes`
- Local `main` is ahead of `origin/main` / `gitee/main`.
- Completed and reviewed:
  - Step 1: `9c95ac8 perf(playground): avoid hidden duplicate conversation list rendering`
  - Step 2: `d867465 fix(playground): repair conversation virtual scrolling`
  - Step 3: `f31842e perf(playground): coalesce conversation catalog refreshes`
- Extra Step 2 repair included in `d867465` / `f31842e` history:
  - Mobile virtual row height aligned to `100px` (`92px` mobile item + `8px` gap)
  - rAF virtual-scroll test changed from source-regex to real fake-rAF behavior
- Current workspace should be clean before Step 4:
  - `git status --short --branch`

## Must Read

- `AGENTS.md`
- `docs/playground-current.md`
- `docs/change-log.md`
- `docs/traceability-map.md`
- `src/ui/playground.ts`
- `src/ui/playground-page-shell.ts`
- `src/ui/playground-conversations-controller.ts`
- `src/ui/playground-stream-controller.ts`
- `src/ui/playground-assets-controller.ts`
- `src/ui/playground-task-inbox-controller.ts`
- `src/ui/playground-conn-manager.ts`
- `src/ui/playground-agent-manager.ts`
- `test/playground-conversations-controller.test.ts`
- `test/server.test.ts`

## Scope Boundary

Allowed:

- Gate or defer non-chat initial requests and panel rendering.
- Keep first chat screen fast and stable.
- Add lazy-load guards for panels that are not open.
- Preserve explicit refresh behavior when the user opens or refreshes a panel.
- Add focused tests for scripts and HTML wiring.
- Update docs/change-log when behavior changes.

Forbidden:

- Do not change chat API contracts.
- Do not change `AgentService`, session factory, Team Runtime, scheduler, workers, run workspace, conn execution, or database schema.
- Do not remove user-visible panel capabilities.
- Do not start Chrome unless explicitly required for visual/browser verification.
- Do not commit `.env`, `.data`, `runtime/*`, `public/*`, screenshots, browser profiles, deployment packages, `curate_news*.py`, unknown `.pi/skills/*`, or `skills-lock.json`.
- Do not run broad formatters or perform EOL normalization.

## Step 1: Stop Rendering Hidden Duplicate Conversation Lists

Status: completed in `9c95ac8`.

Outcome:

- Desktop renders only desktop conversation list and clears mobile list.
- Mobile drawer closed clears both lists.
- Mobile drawer open renders only mobile list.
- Runtime breakpoint listener refreshes the branch when crossing `641px`.

## Step 2: Virtualize Conversation List Rows

Status: completed and repaired in `4d32d42` + `d867465`.

Outcome:

- Conversation list rows are virtualized with top/bottom spacers.
- Desktop row pitch: `60px`.
- Mobile row pitch: `100px`.
- `renderConversationListInto()` computes the virtual window from saved `scrollTop` before clearing DOM.
- rAF scroll scheduling coalesces without cancel-and-swallow.
- Active/menu far-away rows are not forced into the visible range.

## Step 3: Coalesce Conversation Catalog Refreshes

Status: completed in `f31842e`.

Outcome:

- `requestUpdateConversation()` uses local upsert + 500ms delayed catalog refresh instead of force reload.
- `sendMessage()` no longer performs a redundant non-force catalog sync immediately before `resolveServerActiveConversation()`.
- `done` events schedule a delayed catalog refresh for message count/preview.
- Delete flow keeps force sync because deleting current conversation needs server-confirmed current state.

## Step 4: Lazy Non-Chat Data

Goal:

Keep the main chat entry path focused on chat state and conversation catalog. Defer non-chat data until the corresponding panel is opened or an explicit user action needs it.

Candidate non-chat work to inspect:

- Asset library requests and rendering
- Task inbox/activity summary/list requests
- Conn manager task list requests
- Browser workbench/browser list requests
- Model config requests
- Agent manager/profile metadata requests

Expected implementation shape:

- Add per-panel “loaded once / loading / stale” flags where missing.
- Do not fetch panel-heavy data during initial chat landing if the panel is closed.
- Load data on first open and on explicit refresh.
- Keep lightweight badges/summaries only if they are already intentionally part of the top-level shell.
- Avoid breaking existing mobile panel open flows.

Tests:

- HTML/script tests proving initial load does not eagerly call heavy non-chat loaders.
- Tests proving opening each relevant panel still triggers its data load.
- Tests proving explicit refresh buttons still refresh.
- Existing `test/server.test.ts` assertions should remain stable.

Verification:

- `node --test --import tsx test/server.test.ts`
- Add focused controller tests if touched controller already has a test file.
- `npx tsc --noEmit`
- `git diff --check`
- Browser/network verification if available: opening `/playground` should issue fewer first-path non-chat requests; opening panels should still load their data.

Suggested commit:

- `perf(playground): defer non-chat panel data loading`

## Step 5: Row Style And Interaction Cost

Goal:

Reduce per-row layout/style cost for large conversation catalogs while preserving current visual direction.

Candidate work:

- Avoid expensive per-row DOM or style churn.
- Keep menu DOM mounted only when needed.
- Keep hover/menu affordances low-cost.
- Avoid measuring layout in hot scroll paths.

Verification:

- Conversation list remains visually correct.
- DOM count remains bounded after Step 2.
- No text overflow regression in desktop/mobile rows.

Suggested commit:

- `perf(playground): reduce conversation row render cost`

## Step 6: Final Verification And Docs

Goal:

Run broad verification, update documentation, and produce a final performance handoff.

Required verification:

- `npm test`
- `npx tsc --noEmit`
- `git diff --check`
- `git diff --stat`
- `git diff --numstat`
- `git status --short --branch`

Recommended browser checks:

- `/playground` first load
- Enter main Agent
- Switch conversations
- Send a short message if safe
- Open and refresh file library, task inbox, conn, model config, and browser workbench panels
- Check desktop and mobile conversation drawer behavior

Docs:

- `docs/change-log.md`
- `docs/playground-current.md` if user-visible interaction or loading behavior changes

Suggested commit:

- `docs(playground): document chat performance refinements`

## Delivery Report Template

```text
Step <N> completed.

Commit:
- <hash> <message>

Files changed:
- <file>: <summary>

Behavior changes:
- <bullets>

Tests:
- <command>: <result>

Browser / runtime verification:
- <observations>

Formatting/EOL:
- Mechanical formatting or EOL normalization: yes/no
- git diff --check: <result>

Dirty workspace:
- Confirm unrelated .codex/plans deletions, runtime/public artifacts, curate_news*.py were not staged or committed.

Known residual risk:
- <none or specific>
```
