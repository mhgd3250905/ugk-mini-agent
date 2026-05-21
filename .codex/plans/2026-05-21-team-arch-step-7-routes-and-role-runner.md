# Step 7: slim routes and split role runner prompt contract

Date: 2026-05-21

## Goal

Perform final Team architecture cleanup in two small areas:

1. Slim `src/team/routes.ts` by moving response shaping into a presenter Module.
2. Split prompt/parsing contract logic out of `AgentProfileTeamRoleRunner`.

If this feels too large during implementation, stop after part 1 and report that part 2 needs its own plan. Do not force both into one risky commit.

## Current baseline

- Prefer starting after Steps 1-6 are complete.
- `routes.ts` currently mixes:
  - Fastify route adapter
  - request validation
  - orchestrator construction
  - run detail response shaping
  - SSE/file endpoints
- `agent-profile-role-runner.ts` currently mixes:
  - prompt construction
  - JSONish parsing
  - role result normalization
  - browser scope/session adapter wiring

## Must-read files

- `AGENTS.md`
- `docs/team-runtime.md`
- `.codex/plans/2026-05-21-team-architecture-optimization-index.md`
- `src/team/routes.ts`
- `src/team/agent-profile-role-runner.ts`
- `src/team/types.ts`
- `test/team-routes.test.ts`
- `test/team-sse-attempt-api.test.ts`
- `test/team-agent-profile-runner.test.ts`
- `test/team-role-runner.test.ts`

## Scope boundary

Allowed files:

- `src/team/routes.ts`
- new `src/team/run-presenter.ts` or similarly named presenter
- `src/team/agent-profile-role-runner.ts`
- new `src/team/role-prompt-contract.ts` or similarly named prompt/parser module
- focused tests listed above
- `docs/team-runtime.md`
- `docs/change-log.md`

## Forbidden

- Do not change API response shape unless a test intentionally documents it.
- Do not change route URLs.
- Do not change SSE event semantics.
- Do not change role prompt text unless mechanically moved.
- Do not change model/session/browser behavior.
- Do not do both parts if the first part already produces a large diff.
- Do not touch UI.
- Do not do broad formatting.

## Part 1 design guidance: route presenter

Move pure response shaping out of Fastify route handlers.

Good target:

- run detail response builder
- plan/run/team list presenter helpers if they are pure

Do not move Fastify-specific `request` / `reply` objects into the presenter.

Presenter tests should assert API shape from real sample states, not just that a function exists.

## Part 2 design guidance: role prompt contract

Move prompt builder/parser/normalizer logic into a prompt contract Module.

Keep `AgentProfileTeamRoleRunner` as the Adapter to:

- `AgentServiceRegistry`
- `AgentSession`
- browser scope/binding
- signal handling

Prompt text and parsing behavior should be unchanged.

## Required tests before implementation

Part 1:

1. Run detail route response shape remains unchanged for normal run.
2. Attempts/final report routes still work.
3. SSE route behavior still works if touched.

Part 2:

1. Worker/checker/watcher/finalizer/decomposer prompt content is unchanged or intentionally snapshotted.
2. JSONish parsing behavior remains unchanged.
3. Browser binding/session invocation behavior remains unchanged.

## Implementation steps

1. Start with Part 1 only.
2. Add/confirm route response shape tests.
3. Extract presenter Module and rewire `routes.ts`.
4. Run focused route tests.
5. Inspect diff size. If large, stop and commit Part 1 only.
6. If Part 1 is small and clean, proceed to Part 2.
7. Add/confirm role runner tests.
8. Extract prompt contract Module.
9. Keep session/browser adapter behavior unchanged.
10. Update docs/change-log.

## Verification

```powershell
node --test --import tsx test/team-routes.test.ts
node --test --import tsx test/team-sse-attempt-api.test.ts
node --test --import tsx test/team-agent-profile-runner.test.ts
node --test --import tsx test/team-role-runner.test.ts
npm run test:team
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
git ls-files --eol src/team/routes.ts src/team/agent-profile-role-runner.ts test/team-routes.test.ts test/team-agent-profile-runner.test.ts
```

## Commit message suggestions

If doing only Part 1:

```text
refactor(team): extract run response presenter
```

If doing only Part 2 later:

```text
refactor(team): extract role prompt contract
```

If both are genuinely tiny and safe:

```text
refactor(team): slim routes and role runner contracts
```

## Delivery report template

```text
完成 Step 7：routes / role runner contract cleanup。

Commit:
- <hash> <message>

实现摘要:
- Part 1 route presenter: <完成/未做，原因>
- Part 2 role prompt contract: <完成/未做，原因>
- <确认 API shape / prompt behavior 未变>

验证:
- node --test --import tsx test/team-routes.test.ts: <结果>
- node --test --import tsx test/team-sse-attempt-api.test.ts: <结果>
- node --test --import tsx test/team-agent-profile-runner.test.ts: <结果>
- node --test --import tsx test/team-role-runner.test.ts: <结果>
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
请接手 E:\AII\ugk-pi 的 Team architecture Step 7：routes presenter / role prompt contract cleanup。

当前基线：
- 请确认 Step 1-6 已完成或明确跳过；本任务是最后的结构清理
- 如果 diff 变大，优先只做 routes presenter，role prompt contract 另开一轮

必须先读：
- AGENTS.md
- docs/team-runtime.md
- .codex/plans/2026-05-21-team-architecture-optimization-index.md
- .codex/plans/2026-05-21-team-arch-step-7-routes-and-role-runner.md
- src/team/routes.ts
- src/team/agent-profile-role-runner.ts
- test/team-routes.test.ts
- test/team-sse-attempt-api.test.ts
- test/team-agent-profile-runner.test.ts
- test/team-role-runner.test.ts

本轮只做：
- 优先把 routes.ts 的纯 response shaping 抽成 presenter
- 如果仍然小且安全，再把 role runner 的 prompt builder/parser/normalizer 抽成 prompt contract
- 保持 API shape、SSE、prompt 文本、session/browser 行为不变

禁止做：
- 不改 route URL
- 不改 API response shape
- 不改 SSE 语义
- 不改 role prompt text
- 不改模型/session/browser行为
- 不碰 UI
- 不做整文件格式化或换行符转换
- 不提交 .env/.data/runtime/public 产物/temp 文件/未知 .pi/skills/*/skills-lock.json

执行要求：
- 先补测试，再写实现
- 如果 Part 1 diff 已经较大，提交 Part 1 后停止，不要硬做 Part 2
- 本 Step 最多一个 commit；若拆成 Part 1/Part 2，要先向用户说明
- 遇到计划外问题先停下说明

最终验证：
- node --test --import tsx test/team-routes.test.ts
- node --test --import tsx test/team-sse-attempt-api.test.ts
- node --test --import tsx test/team-agent-profile-runner.test.ts
- node --test --import tsx test/team-role-runner.test.ts
- npm run test:team
- npx tsc --noEmit
- git diff --check
- git diff --stat / git diff --numstat

完成后按计划里的交付报告模板回复。
```
