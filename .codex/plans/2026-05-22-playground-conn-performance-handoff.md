# Playground Conn Performance Handoff

Date: 2026-05-22
Workspace: `E:\AII\ugk-pi`
Current HEAD: `b60b0ed ux(conn): add bounded run history loading states`
Branch state: `main...origin/main [ahead 28]`

## Current Status

The `/playground/conn` performance plan has been implemented through Task 6.

Completed conn-specific commits:

- `60df2a8 perf(conn): defer editor support catalogs`
- `abfd561 perf(conn): defer initial run history loading`
- `ea91ee0 perf(conn): paginate standalone run history`
- `b00ee1b fix(conn): clear loaded run state after read-all`
- `4a7688b perf(conn): narrow realtime refresh scope`
- `701ff3a perf(conn): render targeted task updates`
- `b60b0ed ux(conn): add bounded run history loading states`

The extra read-all commit is intentional: it fixes the stale `loadRuns()` path found during the performance review.

## Behavior Now

- `/playground/conn` first load fetches `GET /v1/conns` only.
- Editor support catalogs (`GET /v1/agents`, `GET /v1/browsers`, `GET /v1/model-config`) load lazily when create/edit opens and then reuse cache.
- Auto-selecting the first conn no longer fetches full run history.
- Run history loads only after explicit user action and requests `GET /v1/conns/:connId/runs?limit=10`.
- `GET /v1/conns/:connId/runs` remains backward compatible without query parameters and supports bounded pagination with `limit` / `before`.
- Realtime conn notifications are parsed, coalesced, and narrowed to conn refreshes instead of broad `loadData()`.
- Pause/resume/delete/run/read-all paths use targeted rendering instead of repeated `renderAll()`.
- Run history now exposes compact loading, empty, error/retry, has-more, and loading-more states without changing conn runtime semantics.
- Retry checks the current `selectedId` before fetching so stale panels cannot reload an old conn after selection changes.

## Key Files

- `src/ui/conn-page-js.ts`
- `src/ui/conn-page-css.ts`
- `src/routes/conns.ts`
- `src/agent/conn-run-store.ts`
- `src/types/api.ts`
- `test/conn-page-ui.test.ts`
- `test/server.test.ts`
- `test/conn-run-store.test.ts`
- `docs/playground-current.md`
- `docs/change-log.md`

## Verification Record

Latest verification run by Codex after Task 6 review:

- `node --test --import tsx test/conn-page-ui.test.ts` passed: `20/20`
- `node --test --import tsx test/server.test.ts` passed: `160/160`
- `npx tsc --noEmit` passed
- `git diff --check b60b0ed^ b60b0ed` passed
- `npm run docker:doctor` passed; port 3000 was owned by Docker, no host shadow listener
- `npm test` passed: `1690 pass`, `2 skipped`, `0 fail`

Browser note:

- Task 6 delivery reported `/playground/conn` browser verification in dark and light themes.
- During Codex review, Chrome DevTools MCP could not open a fresh page because its local profile was already locked. This was treated as a tool limitation, not a page failure. Automated and source-level verification passed.

## Workspace Boundary

Tracked source/test/docs changes for the conn performance work are already committed.

Current untracked files are not part of the conn implementation unless the user explicitly decides to preserve planning docs:

- `.codex/plans/2026-05-22-playground-conn-performance-*.txt`
- `.codex/plans/2026-05-22-playground-conn-performance-plan.md`
- `.codex/plans/2026-05-22-playground-conn-performance-handoff.md`
- Other `.codex/plans/2026-05-22-playground-agents-*` and `playground-chat-*` planning docs

Do not commit these runtime/temp/report files without explicit review:

- `runtime/reddit-ai-employment-report.md`
- `runtime/reddit-ai-report.html`
- `public/reddit-ai-report.html`
- `qwen-3-7-max-reviews.html`
- `zhihu-hotlist-20260522.json`
- The odd untracked session jsonl path rendered as escaped `E...data...sessions...jsonl`

## Integration Warning

`main` is ahead of `origin/main` by 28 commits. Pushing `main` now would push conn, agents, chat, model, docker doctor, and UI commits together. Do not treat this as a small one-commit push.

Before any remote push or production deploy, decide whether the whole 28-commit stack should move together. If not, create a separate branch or cherry-pick intentionally.

## Next Step Options

1. Keep local only: no action; current commits stay on local `main`.
2. Preserve planning docs: add only the intended `.codex/plans/2026-05-22-playground-conn-performance-*` docs in a documentation commit.
3. Push the full stack: only if the user accepts that all 28 ahead commits go to the remote.
4. Deploy: use the documented incremental server flow after deciding the remote/update target.
