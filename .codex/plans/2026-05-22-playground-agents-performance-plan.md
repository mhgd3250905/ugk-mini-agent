# Playground Agents Page Performance Optimization Plan

Date: 2026-05-22
Target page: `/playground/agents`
Baseline commit: `8b1c5ee perf(playground): defer non-chat panel data loading`

## Goal

Make the standalone Agent management page feel responsive on initial load, Agent switching, skill inspection, and refresh.

This page is a management cockpit, not a chat surface. The correct optimization is to avoid duplicate skill requests, lazy-load heavyweight skill panels, cache per-agent skills, and keep rendering bounded.

## Real Browser Findings

Measured with Chrome DevTools MCP against `http://127.0.0.1:3000/playground/agents`.

Initial page load:

- Document `/playground/agents`: `27.7ms`, encoded body about `90.8KB`
- `GET /v1/browsers`: `13.4ms`
- `GET /v1/model-config`: `11.1ms`
- `GET /v1/agents`: `2.6ms`
- `GET /v1/agents/status`: `3ms`
- `GET /v1/agents/main/skills`: `162.9ms`
- Duplicate `GET /v1/agents/main/skills`: `129.1ms`
- DOM after first render: `537` nodes, `9` agent rows, `47` skill rows, `48` select options, `71` buttons

Switch to `agent-patent-excavator`:

- `GET /v1/agents/agent-patent-excavator/skills`: `419.4ms`
- DOM after switch: `332` nodes, `5` skill rows, `48` select options, `31` buttons

Search input:

- No network request
- DOM filter is local and cheap with current `9` agents

Primary bottlenecks:

- `/v1/agents` and `/v1/agents/status` are not the slow part.
- The first screen fetches `main` skills twice: once as installable gallery, then again after auto-selecting `main`.
- The page renders all selected-agent skills immediately, creating many switches/buttons.
- The installable skill `<select>` contains all gallery skills and is rebuilt for every detail render.
- Selecting an Agent always renders detail once in loading state and again after skills load, with whole body HTML replacement.
- Per-agent skill fetch has no freshness/cached state beyond stored data. Revisiting an agent can still trigger avoidable work depending on flow.

## Must Read

- `AGENTS.md`
- `docs/playground-current.md`
- `docs/change-log.md`
- `src/ui/agents-page.ts`
- `src/routes/agent-profiles.ts`
- `src/agent/agent-profile-catalog.ts`
- `src/agent/agent-service-registry.ts`
- `test/server.test.ts`
- `test/playground-agent-switch.test.ts`
- Agent profile related tests under `test/agent-profile*.test.ts`

## Scope Boundary

Allowed:

- Optimize `/playground/agents` frontend loading, caching, rendering, and small UX loading states.
- Add small response-shape helpers only if they are strictly needed and backward compatible.
- Add focused tests and update docs.

Forbidden:

- Do not change Agent runtime semantics.
- Do not change profile creation/archive rules except for UI refresh behavior.
- Do not change skill enable/disable semantics.
- Do not edit `.data/agents/profiles.json` directly.
- Do not change Team profile lock behavior.
- Do not redesign the page visually beyond minor loading/placeholder states required for performance.
- Do not run broad formatters or cause EOL-only churn.
- Do not commit `.env`, `.data`, `runtime/*`, `public/*`, screenshots, browser profiles, `curate_news*.py`, or unrelated `.codex/plans` files.

## Task 1 - Remove Duplicate Initial Main Skills Request

Problem:

Initial load currently calls `apiFetchGallerySkills()` for `/v1/agents/main/skills`, then auto-selects `main` and calls `apiFetchAgentSkills("main")`, causing the same endpoint to run twice. Real measurement showed `162.9ms` plus `129.1ms`.

Implementation:

- Reuse the gallery skills result as `skillsByAgentId.main` when the selected/active agent is `main`.
- Or split gallery metadata from scoped skill list so the page does not need the same endpoint twice.
- Keep disabled skill entries available for the installable-skill picker.
- Ensure refresh still refreshes both agent summaries and gallery skills intentionally.

Tests first:

- Add a test proving initial script/path does not fetch `/v1/agents/main/skills` twice.
- Add behavior-level test or script assertion that selecting `main` after gallery load uses cached data.

Verification:

- Browser reload `/playground/agents`; network waterfall should show only one `/v1/agents/main/skills` request.
- Skill count and installable skill dropdown remain populated.

Commit suggestion:

`perf(agents): reuse main skills on initial load`

## Task 2 - Lazy-Render Selected Agent Skills

Problem:

First detail render mounts `47` skill rows and many switch buttons. This is operationally noisy and makes the page look heavier than the task at hand.

Implementation:

- Keep the selected Agent summary visible immediately.
- Collapse or defer the skill list body until the user opens the skills section, scrolls it into view, or clicks a compact "查看技能" control.
- Keep skill count available from cached data if already loaded.
- When skill list is closed, do not mount all `.ag-skill-item` rows.
- Preserve enable/disable, delete, copy install, and refresh behavior once opened.

Tests first:

- Test initial selected detail does not mount all skill rows.
- Test opening the skill section loads/renders skills.
- Test toggling a skill still calls `PATCH /v1/agents/:agentId/skills/:skillName`.

Verification:

- DOM count after first render should drop significantly below the measured `537` nodes.
- User can still open skills and operate switches.

Commit suggestion:

`perf(agents): lazy render selected skills`

## Task 3 - Cache Per-Agent Skills With Explicit Refresh

Problem:

Switching to a custom Agent measured `419.4ms` for `/v1/agents/agent-patent-excavator/skills`. Once loaded, switching away and back should not block on the same request unless the user refreshes or a mutation invalidates the cache.

Implementation:

- Add per-agent skill cache metadata, e.g. `skillsLoadedByAgentId`.
- `selectAgent(agentId)` should render cached skills immediately when available.
- Fetch missing skills only when the skills section is opened or the selected agent has no cache.
- Invalidate only the touched agent after install/remove/toggle.
- Manual "刷新技能" should force refetch selected agent skills.

Tests first:

- Test revisiting an already loaded agent does not refetch skills.
- Test toggle/remove/install invalidates or refreshes only the selected agent.
- Test manual skill refresh still fetches.

Verification:

- Browser: select one Agent, wait for skills, select another, then select first again. No duplicate skill request for first agent unless refresh clicked.

Commit suggestion:

`perf(agents): cache scoped skills per agent`

## Task 4 - Defer Support Catalogs Until Editor Or Skill Picker Needs Them

Problem:

Initial load fetches browsers and model config before the user opens create/edit. These requests are small but not first-screen critical unless the editor opens.

Implementation:

- Keep `/v1/agents` and `/v1/agents/status` on first load.
- Defer `/v1/browsers` and `/v1/model-config` until create/edit form opens.
- Cache loaded support catalogs.
- If opening editor before catalog load completes, show compact loading state and disable save until required options are ready.
- Keep browser count stat either hidden, stale-free, or loaded in a delayed non-blocking pass. Do not block first render.

Tests first:

- Test initial `/playground/agents` script no longer awaits browsers/model-config before rendering agent list.
- Test editor opening triggers catalog loading.
- Test create/edit submit remains guarded while model config is unavailable.

Verification:

- Browser reload: first network waterfall should prioritize `/v1/agents`, `/v1/agents/status`, and one main skills/gallery request if still needed.
- Opening editor fetches browsers/model config and renders fields correctly.

Commit suggestion:

`perf(agents): defer editor support catalogs`

## Task 5 - Reduce Whole-Body Rerenders On Selection

Problem:

`selectAgent()` currently sets loading, renders list and detail, fetches skills, then renders skills/stats/detail again. This is acceptable for small data, but it scales badly with long skill lists.

Implementation:

- Split detail into stable shell and replace only subregions:
  - header/actions
  - stats mini cards
  - config/rules
  - skills panel
- Avoid rebuilding the installable skill select unless gallery changed.
- Preserve scroll position inside the detail body when switching skill loading state.

Tests first:

- Add script tests proving `populateSkillSelect()` is not called on every `renderDetailBody()` unless gallery changes.
- Add test that selection renders shell once and skills region separately.

Verification:

- Browser select agents repeatedly; no visible flicker, no duplicated controls, no stale selected row.

Commit suggestion:

`perf(agents): render agent detail in stable sections`

## Final Verification

Run:

```text
node --test --import tsx test/server.test.ts
node --test --import tsx test/playground-agent-switch.test.ts
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
git status --short --branch
```

If route/profile logic is touched, also run:

```text
node --test --import tsx test/agent-profile.test.ts
node --test --import tsx test/agent-profile-catalog.test.ts
node --test --import tsx test/agent-service-registry.test.ts
```

Browser verification:

- Reload `/playground/agents`.
- Confirm only one `/v1/agents/main/skills` request on first load.
- Confirm first render shows agent list quickly.
- Confirm skill list is lazy or cached.
- Select a custom agent, then switch away and back; cache should prevent repeated skill fetch.
- Open create/edit; browsers and model config should load then.

## EOL And Formatting Hygiene

- Preserve existing line endings.
- Do not run broad formatters.
- If a small task creates a large diff, stop and inspect EOL/formatter churn.
- Include `git diff --check` and `git diff --stat` in every delivery report.

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
