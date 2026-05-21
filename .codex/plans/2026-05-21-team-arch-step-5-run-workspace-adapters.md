# Step 5: split RunWorkspace responsibilities behind smaller adapters

Date: 2026-05-21

## Goal

Reduce `RunWorkspace` Interface breadth without changing the on-disk layout. Keep the filesystem contract stable, but introduce smaller adapters or internal stores so callers only depend on what they need.

This step is structural. It must not migrate existing run data.

## Current baseline

- Prefer starting after Steps 1-3 are complete, because those steps clarify caller needs.
- `RunWorkspace` currently owns:
  - run state persistence
  - `patchState`
  - leases/admission
  - attempt metadata/files
  - expansion/decomposition records
  - child task state append
  - final report
  - run-scoped reference reading

## Must-read files

- `AGENTS.md`
- `docs/team-runtime.md`
- `.codex/plans/2026-05-21-team-architecture-optimization-index.md`
- `src/team/run-workspace.ts`
- `src/team/orchestrator.ts`
- `src/team/output-validator.ts`
- `src/team/routes.ts`
- `test/team-run-workspace.test.ts`
- `test/team-path-refs.test.ts`
- `test/team-output-validator.test.ts`
- `test/team-sse-attempt-api.test.ts`

## Scope boundary

Allowed files:

- `src/team/run-workspace.ts`
- optional new files under `src/team/` for state/artifact/attempt/expansion adapters
- caller files only for import/constructor rewiring:
  - `src/team/orchestrator.ts`
  - `src/team/output-validator.ts`
  - `src/team/routes.ts`
- focused tests listed above
- `docs/team-runtime.md`
- `docs/change-log.md`

## Forbidden

- Do not change directory layout under `.data/team/runs`.
- Do not change persisted JSON schema.
- Do not migrate old run files.
- Do not rename persisted attempt files.
- Do not rewrite route behavior.
- Do not combine this with UI or prompt refactors.
- Do not create a database abstraction.
- Do not do broad formatting.

## Design guidance

Use the Deletion test correctly:

- `RunWorkspace` is valuable because it hides disk layout.
- The problem is not that it exists.
- The problem is that its Interface is too wide.

Possible split:

- `RunStateStore`: `loadState`, `saveState`, `patchState`, list/admission/lease state operations
- `RunAttemptStore`: attempt metadata and role output files
- `RunExpansionStore`: expansion/decomposition records and generated child state append
- `RunArtifactStore`: final report and run-scoped file/reference reads

Do not force this exact naming if the existing code suggests a better local style. Keep each Interface small.

## Required tests before implementation

Add or preserve tests proving:

1. Existing run state can still be loaded.
2. `patchState` still serializes concurrent writes and advances `updatedAt`.
3. Attempt file write/read paths are unchanged.
4. `readRunScopedFile` and role workspace reference rules remain unchanged.
5. Expansion/decomposition records still read/write the same JSON shape.
6. Routes that expose attempts/final report still work.

## Implementation steps

1. Add/confirm path and persistence tests.
2. Introduce adapters with tiny Interfaces.
3. Move code mechanically from `RunWorkspace` into adapters, preserving helper behavior.
4. Keep `RunWorkspace` as a facade if that minimizes caller churn.
5. Rewire only callers that benefit from narrower Interfaces.
6. Do not change filesystem paths or JSON content.
7. Update docs/change-log briefly.

## Verification

```powershell
node --test --import tsx test/team-run-workspace.test.ts
node --test --import tsx test/team-path-refs.test.ts
node --test --import tsx test/team-output-validator.test.ts
node --test --import tsx test/team-sse-attempt-api.test.ts
npm run test:team
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
git ls-files --eol src/team/run-workspace.ts test/team-run-workspace.test.ts test/team-path-refs.test.ts test/team-output-validator.test.ts test/team-sse-attempt-api.test.ts
```

## Commit message suggestion

```text
refactor(team): narrow run workspace storage interfaces
```

## Delivery report template

```text
完成 Step 5：RunWorkspace adapter 拆分。

Commit:
- <hash> refactor(team): narrow run workspace storage interfaces

实现摘要:
- <新增/调整的 adapters>
- <RunWorkspace 是否保留 facade>
- <确认磁盘布局和 JSON schema 未变>

验证:
- node --test --import tsx test/team-run-workspace.test.ts: <结果>
- node --test --import tsx test/team-path-refs.test.ts: <结果>
- node --test --import tsx test/team-output-validator.test.ts: <结果>
- node --test --import tsx test/team-sse-attempt-api.test.ts: <结果>
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
请接手 E:\AII\ugk-pi 的 Team architecture Step 5：拆分 RunWorkspace adapter。

当前基线：
- 请确认 Step 1-3 已完成，至少不要在 parallel/orchestrator 大改未稳定时开始

必须先读：
- AGENTS.md
- docs/team-runtime.md
- .codex/plans/2026-05-21-team-architecture-optimization-index.md
- .codex/plans/2026-05-21-team-arch-step-5-run-workspace-adapters.md
- src/team/run-workspace.ts
- src/team/orchestrator.ts
- src/team/output-validator.ts
- src/team/routes.ts
- test/team-run-workspace.test.ts
- test/team-path-refs.test.ts
- test/team-output-validator.test.ts
- test/team-sse-attempt-api.test.ts

本轮只做：
- 在不改变磁盘布局的前提下，把 RunWorkspace 的 state/attempt/artifact/expansion 职责拆成更小 adapter 或内部 store
- 可以保留 RunWorkspace facade，减少调用方 churn
- 补真实路径和持久化兼容测试

禁止做：
- 不改 .data/team/runs 目录布局
- 不改 persisted JSON schema
- 不迁移旧 run 数据
- 不重命名 attempt 文件
- 不碰 UI / prompt
- 不创建数据库抽象
- 不做整文件格式化或换行符转换
- 不提交 .env/.data/runtime/public 产物/temp 文件/未知 .pi/skills/*/skills-lock.json

执行要求：
- 先补测试，再写实现
- 本 Step 一个 commit
- 遇到计划外问题先停下说明
- 如果小改动产生超大 diff，先检查 EOL/formatter churn

最终验证：
- node --test --import tsx test/team-run-workspace.test.ts
- node --test --import tsx test/team-path-refs.test.ts
- node --test --import tsx test/team-output-validator.test.ts
- node --test --import tsx test/team-sse-attempt-api.test.ts
- npm run test:team
- npx tsc --noEmit
- git diff --check
- git diff --stat / git diff --numstat

完成后按计划里的交付报告模板回复。
```
