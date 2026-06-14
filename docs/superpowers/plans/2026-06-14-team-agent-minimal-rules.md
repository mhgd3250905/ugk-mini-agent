# Team Agent Minimal Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the built-in Team Agent runtime `AGENTS.md` templates so they describe only job posture and communication standards, without leaking orchestration roles or internal Team Task schema.

**Architecture:** Keep the existing default profile and `http-access` bootstrap behavior. Change only the three role-specific default rule strings in `src/agent/agent-profile-bootstrap.ts`, tighten tests in `test/agent-profile-bootstrap.test.ts`, and update the existing design spec so future edits preserve the minimal-context rule.

**Tech Stack:** TypeScript, Node.js `node:test`, markdown specs.

---

### Task 1: Tighten Runtime Rule Tests

**Files:**
- Modify: `test/agent-profile-bootstrap.test.ts`

- [ ] **Step 1: Write failing assertions**

Update the Team Task agent runtime test to assert minimal-context posture:

```ts
assert.match(workerRules, /认真理解当前任务/);
assert.match(workerRules, /主动想办法完成/);
assert.doesNotMatch(workerRules, /checker|WorkUnit|Team Canvas|Team Task|Canvas Task/);

assert.match(checkerRules, /认真、细致、严格/);
assert.match(checkerRules, /待检查内容/);
assert.doesNotMatch(checkerRules, /worker|WorkUnit|Team Canvas|Team Task|Canvas Task/);

assert.match(dispatcherRules, /认真理解当前条目/);
assert.match(dispatcherRules, /严格输出当前提示要求的 JSON/);
assert.doesNotMatch(dispatcherRules, /generated child|WorkUnit|compiler|Team Canvas|Team Task|Canvas Task/);
```

- [ ] **Step 2: Run failing test**

```powershell
node --test --test-concurrency=1 --import tsx test\agent-profile-bootstrap.test.ts
```

Expected: FAIL because current templates mention checker, Team Canvas Task, worker, generated child Task, WorkUnit, and compiler.

### Task 2: Rewrite Role Templates

**Files:**
- Modify: `src/agent/agent-profile-bootstrap.ts`

- [ ] **Step 1: Replace role strings**

Replace the three `TEAM_*_AGENT_DEFAULT_RULES` strings with minimal job-posture text:

```md
# Team Worker Agent

你是 Team Worker Agent。
默认优先使用简体中文交流；只有用户或当前提示明确要求其他语言时才切换。
你的职责是认真理解当前任务，主动想办法完成任务，并交付清晰、可用、符合要求的结果。
```

Do the same for checker and dispatcher, using “认真、细致、严格” for checker and “认真理解当前条目、严格输出当前提示要求的 JSON” for dispatcher.

- [ ] **Step 2: Run focused test**

```powershell
node --test --test-concurrency=1 --import tsx test\agent-profile-bootstrap.test.ts
```

Expected: PASS.

### Task 3: Update Design Spec

**Files:**
- Modify: `docs/superpowers/specs/2026-06-14-team-task-default-agents-design.md`

- [ ] **Step 1: Replace Runtime AGENTS.md design section**

Rewrite the three role descriptions to remove references to checker, worker, WorkUnit, generated child Task, compiler, Team Task internals, and Canvas internals. Keep `http-access` and Chinese-first communication rules.

- [ ] **Step 2: Check docs and tests**

```powershell
node --test --test-concurrency=1 --import tsx test\agent-profile-bootstrap.test.ts
npx tsc --noEmit
git diff --check
```

Expected: all pass.

### Task 4: Commit

**Files:**
- Commit all changed files from Tasks 1-3.

- [ ] **Step 1: Commit**

```powershell
git add src/agent/agent-profile-bootstrap.ts test/agent-profile-bootstrap.test.ts docs/superpowers/specs/2026-06-14-team-task-default-agents-design.md docs/superpowers/plans/2026-06-14-team-agent-minimal-rules.md
git commit -m "feat: simplify team agent runtime rules"
```
