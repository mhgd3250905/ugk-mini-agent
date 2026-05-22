# Playground Chat Performance Handoff

Date: 2026-05-22
Workspace: `E:\AII\ugk-pi`
Implementation tip: `e6d05e3 docs(playground): document chat performance refinements`
Current local stack includes later agents/conn commits through: `9d0c5ae docs(conn): preserve performance handoff`

## Current Status

The `/playground` chat performance plan has been implemented through Step 6.

Completed chat-specific commits:

- `9c95ac8 perf(playground): avoid hidden duplicate conversation list rendering`
- `4d32d42 perf(playground): virtualize conversation list rows`
- `d867465 fix(playground): repair conversation virtual scrolling`
- `f31842e perf(playground): coalesce conversation catalog refreshes`
- `8b1c5ee perf(playground): defer non-chat panel data loading`
- `3c9b99f perf(playground): delegate conversation row events`
- `e6d05e3 docs(playground): document chat performance refinements`

The virtual scrolling repair commit is intentional. It fixed mobile row pitch and changed the rAF behavior test from source-regex theater to actual fake-rAF behavior.

## Behavior Now

- Desktop and mobile conversation lists no longer render hidden duplicate rows at the same time.
- Conversation list rendering is virtualized with bounded visible rows and spacer elements.
- Desktop row pitch is `60px`; mobile row pitch is `100px`.
- Scroll handling is coalesced through `requestAnimationFrame`.
- Conversation catalog refreshes are coalesced and delayed after local updates instead of repeatedly force-refreshing.
- Sending a message no longer performs an unnecessary pre-send catalog sync.
- Non-chat panels defer first data loads until opened or explicitly refreshed.
- File library, task inbox, and conn manager initial data are gated by loaded-once flags.
- Conversation row click/menu/color actions use delegated handlers instead of per-row listener churn.
- Final docs were recorded in `docs/playground-current.md` and `docs/change-log.md`.

## Key Files

- `src/ui/playground-conversations-controller.ts`
- `src/ui/playground-mobile-shell-controller.ts`
- `src/ui/playground-conversation-api-controller.ts`
- `src/ui/playground-assets-controller.ts`
- `src/ui/playground-task-inbox-controller.ts`
- `src/ui/playground-conn-activity-controller.ts`
- `src/ui/playground.ts`
- `test/playground-conversations-controller.test.ts`
- `test/server.test.ts`
- `docs/playground-current.md`
- `docs/change-log.md`

## Verification Record

Latest verification run by Codex after completing the full performance stack:

- `npm test` passed: `1690 pass`, `2 skipped`, `0 fail`
- During Step handoffs, focused verification included `node --test --import tsx test/server.test.ts`, `node --test --import tsx test/playground-conversations-controller.test.ts`, `npx tsc --noEmit`, and `git diff --check`.

Browser verification reported during task deliveries:

- `/playground` first load no longer triggers the deferred non-chat panel data path.
- Desktop/mobile conversation lists render only the active branch.
- Scrolling the conversation list keeps DOM bounded.
- Opening file library, task inbox, conn manager, model config, and browser workbench still loads the needed data on demand.

## Workspace Boundary

Tracked source/test/docs changes for the chat performance work are already committed.

This handoff preserves the planning artifacts:

- `.codex/plans/2026-05-22-playground-chat-performance-plan.md`
- `.codex/plans/2026-05-22-playground-chat-performance-step-*.txt`
- `.codex/plans/2026-05-22-playground-chat-performance-handoff.md`

Do not commit runtime/public report files or unrelated `.data` session files as part of this handoff.

## Integration Warning

`main` is ahead of `origin/main` by a large multi-feature stack. Pushing `main` now would include chat, agents, conn, model, Docker doctor, and UI styling commits together. Decide whether the whole stack should move as one before pushing or deploying.

## Next Step Options

1. Keep local only.
2. Push the full stack after explicit approval.
3. Cherry-pick/split a smaller branch if only chat work should move.
4. Deploy only after the remote/update boundary is clear.
