# Step 3: extract task attempt lifecycle module

Date: 2026-05-21

## Goal

Extract the worker -> checker -> watcher attempt lifecycle from `TeamOrchestrator` into a focused internal Module.

This should reduce the size and responsibility of `TeamOrchestrator` without changing behavior.

## Current baseline

- Start only after Step 2 is committed.
- Expected previous commit: `refactor(team): extract child task execution module`
- Current `TeamOrchestrator` owns:
  - run lifecycle
  - task ordering
  - dynamic expansion/decomposition
  - attempt creation
  - worker/checker/watcher execution
  - output validation
  - result writing
  - finalizer
  - run controls

This step extracts only the attempt lifecycle, not the whole orchestrator.

## Must-read files

- `AGENTS.md`
- `docs/team-runtime.md`
- `.codex/plans/2026-05-21-team-architecture-optimization-index.md`
- `src/team/orchestrator.ts`
- `src/team/agent-profile-role-runner.ts`
- `src/team/output-validator.ts`
- `src/team/run-workspace.ts`
- `test/team-orchestrator-lifecycle.test.ts`
- `test/team-orchestrator-success.test.ts`
- `test/team-orchestrator-failure.test.ts`
- `test/team-orchestrator-timeout.test.ts`
- `test/team-output-contract-regression.test.ts`

## Scope boundary

Allowed files:

- `src/team/orchestrator.ts`
- new `src/team/task-attempt-runner.ts` or similarly clear name
- `src/team/types.ts` only if small exported type extraction is necessary
- focused tests listed above
- `docs/team-runtime.md`
- `docs/change-log.md`

## Forbidden

- Do not change role prompt content.
- Do not change checker/watcher decision schema.
- Do not change output validation semantics.
- Do not change retry limits.
- Do not move finalizer in this step unless it is mechanically required.
- Do not change decomposition or for_each behavior.
- Do not change persisted attempt file names.
- Do not do broad formatting.

## Module design constraints

The extracted Module should hide the attempt loop:

- mark task running
- create attempt
- run worker
- run deterministic validation
- run checker
- run watcher
- write accepted/failed result
- update task state

The Module should expose a small domain-level Interface, such as "run one task attempt lifecycle". Do not expose worker/checker/watcher phase internals unless tests need them through behavior.

Keep `TeamOrchestrator` responsible for:

- which task to run
- when to stop
- decomposition/expansion decisions
- run finalization
- run controls

## Required tests before implementation

Add/keep tests proving:

1. Happy path task still succeeds and writes accepted result.
2. Checker revise path still creates another attempt.
3. Checker fail path still fails the task.
4. Watcher request_revision path still creates another attempt.
5. Deterministic output validation failure still blocks checker/watcher bypass.
6. Abort/timeout still produces the same task/run terminal state as before.

Do not write tests that only check class names or extracted file existence.

## Implementation steps

1. Identify the smallest contiguous behavior currently in `executeTask`, `runWorkUnit`, and `runWatcherPhase`.
2. Add tests for any behavior not already locked.
3. Create a new task attempt lifecycle Module.
4. Move phase helper code into the new Module with minimal changes.
5. Inject only the dependencies it needs:
   - role runner
   - workspace or narrow store/writer
   - output validator
   - clock/id helpers if already used
6. Update `TeamOrchestrator.executeTask` to delegate.
7. Keep public behavior and persisted files unchanged.
8. Update docs/change-log briefly.

## Verification

```powershell
node --test --import tsx test/team-orchestrator-lifecycle.test.ts
node --test --import tsx test/team-orchestrator-success.test.ts
node --test --import tsx test/team-orchestrator-failure.test.ts
node --test --import tsx test/team-orchestrator-timeout.test.ts
node --test --import tsx test/team-output-contract-regression.test.ts
npm run test:team
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
git ls-files --eol src/team/orchestrator.ts test/team-orchestrator-lifecycle.test.ts test/team-orchestrator-timeout.test.ts
```

## Commit message suggestion

```text
refactor(team): extract task attempt lifecycle runner
```

## Delivery report template

```text
完成 Step 3：task attempt lifecycle module 抽取。

Commit:
- <hash> refactor(team): extract task attempt lifecycle runner

实现摘要:
- <新 Module 文件/职责>
- <TeamOrchestrator 现在只保留哪些 run-level 职责>
- <确认 attempt 文件和状态语义未变>

验证:
- node --test --import tsx test/team-orchestrator-lifecycle.test.ts: <结果>
- node --test --import tsx test/team-orchestrator-success.test.ts: <结果>
- node --test --import tsx test/team-orchestrator-failure.test.ts: <结果>
- node --test --import tsx test/team-orchestrator-timeout.test.ts: <结果>
- node --test --import tsx test/team-output-contract-regression.test.ts: <结果>
- npm run test:team: <结果>
- npx tsc --noEmit: <结果>
- git diff --check: <结果>

EOL/formatter churn:
- <没有 / 如有说明>

未提交文件:
- <确认 runtime/public/.env/.data/旧计划未提交>

风险/阻塞:
- <无 / 说明>
```

## Sendable message

```text
请接手 E:\AII\ugk-pi 的 Team architecture Step 3：抽取 task attempt lifecycle runner。

当前基线：
- 请确认 Step 2 已完成并提交：refactor(team): extract child task execution module
- Step 2 未完成就不要开始本任务

必须先读：
- AGENTS.md
- docs/team-runtime.md
- .codex/plans/2026-05-21-team-architecture-optimization-index.md
- .codex/plans/2026-05-21-team-arch-step-3-attempt-lifecycle-module.md
- src/team/orchestrator.ts
- src/team/agent-profile-role-runner.ts
- src/team/output-validator.ts
- src/team/run-workspace.ts
- test/team-orchestrator-lifecycle.test.ts
- test/team-orchestrator-success.test.ts
- test/team-orchestrator-failure.test.ts
- test/team-orchestrator-timeout.test.ts

本轮只做：
- 从 TeamOrchestrator 抽出 worker -> checker -> watcher attempt 生命周期
- 保持 retry、output validation、attempt 文件、task 状态语义不变
- 补真实行为测试

禁止做：
- 不改 role prompt
- 不改 checker/watcher schema
- 不改 output validation 语义
- 不改 decomposition / for_each
- 不改 persisted file names
- 不做整文件格式化或换行符转换
- 不提交 .env/.data/runtime/public 产物/temp 文件/未知 .pi/skills/*/skills-lock.json

执行要求：
- 先补测试，再写实现
- 本 Step 一个 commit
- 遇到计划外问题先停下说明
- 如果小改动产生超大 diff，先检查 EOL/formatter churn

最终验证：
- node --test --import tsx test/team-orchestrator-lifecycle.test.ts
- node --test --import tsx test/team-orchestrator-success.test.ts
- node --test --import tsx test/team-orchestrator-failure.test.ts
- node --test --import tsx test/team-orchestrator-timeout.test.ts
- node --test --import tsx test/team-output-contract-regression.test.ts
- npm run test:team
- npx tsc --noEmit
- git diff --check
- git diff --stat / git diff --numstat

完成后按计划里的交付报告模板回复。
```
