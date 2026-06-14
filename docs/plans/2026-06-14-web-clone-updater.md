# Web Clone Updater Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a web page that lets clone-based deployments check and pull the latest `origin/main` without using the terminal.

**Architecture:** Add a small backend updater service that shells out to `git` and `npm` through `execFile`, with clear status responses and no shell interpolation. Register `/v1/system/update/status`, `/v1/system/update/apply`, and a standalone `/playground/update` page that calls those APIs.

**Tech Stack:** Fastify routes, Node `child_process.execFile`, TypeScript, node:test, standalone HTML page helpers.

---

### Task 1: Backend Status And Apply API

**Files:**
- Create: `src/system/clone-updater.ts`
- Create: `src/routes/system-update.ts`
- Test: `test/system-update-routes.test.ts`

**Steps:**
1. Write failing route tests for status, dirty worktree refusal, and a successful apply using injected fake command runner.
2. Implement a minimal clone updater that runs `git rev-parse`, `git fetch`, `git status --porcelain`, `git pull --ff-only`, and conditionally `npm install`.
3. Run `node --test --test-concurrency=1 --import tsx test\system-update-routes.test.ts`.

### Task 2: Web Page

**Files:**
- Create: `src/ui/update-page.ts`
- Modify: `src/routes/playground.ts`
- Test: `test/system-update-page.test.ts`

**Steps:**
1. Write failing render/route tests for `/playground/update`.
2. Implement the standalone page with check/update buttons, version fields, dirty-worktree warnings, and restart-needed messaging.
3. Run `node --test --test-concurrency=1 --import tsx test\system-update-page.test.ts test\server.test.ts`.

### Task 3: Main Server Registration And Docs

**Files:**
- Modify: `src/server.ts`
- Modify: `README.md`
- Modify: `docs/change-log.md`

**Steps:**
1. Add failing server registration test for `/v1/system/update/status`.
2. Register update routes with the app project root.
3. Document clone updater usage and limitations.
4. Run focused tests, `npx tsc --noEmit`, and `git diff --check`.
