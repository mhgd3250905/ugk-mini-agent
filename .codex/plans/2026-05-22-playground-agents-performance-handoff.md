# Playground Agents Performance Handoff

Date: 2026-05-22
Workspace: `E:\AII\ugk-pi`
Implementation tip: `4de63b2 fix(agents): surface skills load failures`
Current local stack includes later conn documentation commit: `9d0c5ae docs(conn): preserve performance handoff`

## Current Status

The `/playground/agents` performance plan has been implemented through Task 5, with extra follow-up fixes for skill count and skill fetch failure handling.

Completed agents-specific commits:

- `9b9a36b perf(agents): reuse main skills on initial load`
- `d6f2a58 perf(agents): lazy render selected skills`
- `bbf3ea0 fix(agents): show dash for unloaded skill count instead of zero`
- `592ec45 perf(agents): cache scoped skills per agent`
- `40cc2ad fix(agents): loaded flag only on fetch success; capture agentId in mutation handlers`
- `23689bf fix(agents): preserve skill cache on fetch failure`
- `08d248b perf(agents): defer editor support catalogs`
- `a503086 perf(agents): render agent detail in stable sections`
- `4de63b2 fix(agents): surface skills load failures`

The extra fix commits are intentional. They close the edge cases discovered while executing the performance plan: unloaded skill counts must not masquerade as zero, failed skill fetches must remain retryable, and async skill mutation results must not repaint the wrong selected Agent.

## Behavior Now

- `/playground/agents` first load reuses the main Agent skill response for both the installable gallery and the initially selected main Agent.
- Selected Agent skills are collapsed by default; the page does not mount all `.ag-skill-item` rows on first detail render.
- Per-Agent skills are cached with explicit loaded metadata; switching back to an already loaded Agent does not refetch unless the user refreshes or a mutation requires it.
- Skills fetch failures are visible and retryable instead of being swallowed into an empty list.
- Browser and model support catalogs load lazily when create/edit editor opens, not during the first screen.
- Editor save is guarded while support catalogs or model config are unavailable.
- Selected Agent detail uses stable regions for header/actions, stats, config/rules, and skills; skill loading and mutations update local regions without rebuilding the whole body.
- Installable skill select is rebuilt only when the gallery signature changes.

## Key Files

- `src/ui/agents-page.ts`
- `src/routes/agent-profiles.ts`
- `src/agent/agent-profile-catalog.ts`
- `src/agent/agent-service-registry.ts`
- `test/server.test.ts`
- `test/playground-agent-switch.test.ts`
- `test/agent-profile.test.ts`
- `test/agent-profile-catalog.test.ts`
- `test/agent-service-registry.test.ts`
- `docs/playground-current.md`
- `docs/change-log.md`

## Verification Record

Latest verification run by Codex after completing the full performance stack:

- `npm test` passed: `1690 pass`, `2 skipped`, `0 fail`
- During Task handoffs, focused verification included `node --test --import tsx test/server.test.ts`, `node --test --import tsx test/playground-agent-switch.test.ts`, `npx tsc --noEmit`, and `git diff --check`.

Browser verification reported during task deliveries:

- Reloading `/playground/agents` no longer duplicates the initial `GET /v1/agents/main/skills`.
- Skill list rows are deferred until the skills panel is opened.
- Switching away and back to a loaded Agent reuses skill cache.
- Opening create/edit editor loads browser and model catalogs on demand.

## Workspace Boundary

Tracked source/test/docs changes for the agents performance work are already committed.

This handoff preserves the planning artifacts:

- `.codex/plans/2026-05-22-playground-agents-performance-plan.md`
- `.codex/plans/2026-05-22-playground-agents-performance-message.txt`
- `.codex/plans/2026-05-22-playground-agents-performance-step-*.txt`
- `.codex/plans/2026-05-22-playground-agents-performance-handoff.md`

Do not mix in unrelated chat/conn/runtime artifacts unless intentionally committing their own handoff records.

## Integration Warning

`main` is ahead of `origin/main` by a large multi-feature stack. Pushing `main` now would include chat, agents, conn, model, Docker doctor, and UI styling commits together. Decide whether the whole stack should move as one before pushing or deploying.

## Next Step Options

1. Keep local only.
2. Push the full stack after explicit approval.
3. Cherry-pick/split a smaller branch if only agents work should move.
4. Deploy only after the remote/update boundary is clear.
