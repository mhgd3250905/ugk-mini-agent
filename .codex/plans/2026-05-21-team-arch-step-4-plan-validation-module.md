# Step 4: extract plan validation module

Date: 2026-05-21

## Goal

Move Team plan validation rules out of `PlanStore` into a dedicated validation Module. `PlanStore` should persist validated plans; it should not be the only place where schema policy lives.

This is a low-risk structural refactor. Public validation behavior and error messages should remain stable unless a test explicitly approves a clearer message.

## Current baseline

- Start after Step 1 at minimum. Prefer after Step 3.
- `src/team/plan-store.ts` currently contains:
  - decomposer validation
  - outputCheck validation
  - task type validation
  - `forEach.mode` validation
  - parallel + decomposer policy
  - create/update persistence

## Must-read files

- `AGENTS.md`
- `docs/team-runtime.md`
- `.codex/plans/2026-05-21-team-architecture-optimization-index.md`
- `src/team/plan-store.ts`
- `src/team/types.ts`
- `test/team-plan-store.test.ts`
- `test/team-routes.test.ts`
- `.pi/skills/team-plan-creator/SKILL.md` only for wording compatibility; do not edit unless needed

## Scope boundary

Allowed files:

- `src/team/plan-store.ts`
- new `src/team/plan-validation.ts`
- `src/team/types.ts` only for type exports if necessary
- `test/team-plan-store.test.ts`
- `test/team-routes.test.ts`
- `docs/team-runtime.md`
- `docs/change-log.md`

## Forbidden

- Do not change plan JSON shape.
- Do not change create/update route behavior.
- Do not change `runCount > 0` immutability rules unless already in PlanStore and mechanically moved.
- Do not edit `.pi/skills/team-plan-creator/SKILL.md` unless a validation wording doc mismatch is discovered and explicitly scoped.
- Do not do formatter/EOL churn.

## Module design constraints

Create a Module with a small Interface. Good candidates:

- `validateCreatePlanInput(input): void`
- `validatePlanTasks(tasks): void`
- `validatePlanPatch(patch): void`

Do not expose every tiny helper unless tests or callers need it.

Keep validation deterministic. Do not add async validation or filesystem access.

## Required tests before implementation

Existing tests likely cover most behavior. Add targeted tests only if missing:

1. Unknown `forEach.mode` still rejects and mentions `sequential` / `parallel`.
2. `parallel` + `taskTemplate.decomposer.mode=leaf` rejects.
3. `parallel` + no decomposer or `none` allows.
4. Invalid `outputCheck` still rejects.
5. Existing valid plans still create/update.

## Implementation steps

1. Add/confirm validation tests around current behavior.
2. Create `src/team/plan-validation.ts`.
3. Move validation constants/helpers from `plan-store.ts`.
4. Keep `PlanStore` calling the new validation Module before persistence.
5. Do not alter stored plan fields.
6. Update docs/change-log if the internal source of validation is worth noting.

## Verification

```powershell
node --test --import tsx test/team-plan-store.test.ts
node --test --import tsx test/team-routes.test.ts
npm run test:team
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
git ls-files --eol src/team/plan-store.ts test/team-plan-store.test.ts test/team-routes.test.ts
```

## Commit message suggestion

```text
refactor(team): extract plan validation rules
```

## Delivery report template

```text
完成 Step 4：plan validation module 抽取。

Commit:
- <hash> refactor(team): extract plan validation rules

实现摘要:
- <新 Module 文件/导出的验证入口>
- <PlanStore 剩余职责>
- <确认 validation 行为/错误语义未变>

验证:
- node --test --import tsx test/team-plan-store.test.ts: <结果>
- node --test --import tsx test/team-routes.test.ts: <结果>
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
请接手 E:\AII\ugk-pi 的 Team architecture Step 4：抽取 plan validation module。

当前基线：
- 请确认至少 Step 1 已完成；最好 Step 3 也已完成
- 本任务是结构性小重构，不改变 Plan 行为

必须先读：
- AGENTS.md
- docs/team-runtime.md
- .codex/plans/2026-05-21-team-architecture-optimization-index.md
- .codex/plans/2026-05-21-team-arch-step-4-plan-validation-module.md
- src/team/plan-store.ts
- src/team/types.ts
- test/team-plan-store.test.ts
- test/team-routes.test.ts

本轮只做：
- 把 Plan validation 规则从 PlanStore 抽到 src/team/plan-validation.ts
- PlanStore 继续负责持久化
- 保持 create/update validation 行为不变
- 补/保留真实 validation 测试

禁止做：
- 不改 plan JSON shape
- 不改 create/update route 行为
- 不碰 runtime execution
- 不碰 UI
- 不做整文件格式化或换行符转换
- 不提交 .env/.data/runtime/public 产物/temp 文件/未知 .pi/skills/*/skills-lock.json

执行要求：
- 先补测试，再写实现
- 本 Step 一个 commit
- 遇到计划外问题先停下说明
- 如果小改动产生超大 diff，先检查 EOL/formatter churn

最终验证：
- node --test --import tsx test/team-plan-store.test.ts
- node --test --import tsx test/team-routes.test.ts
- npm run test:team
- npx tsc --noEmit
- git diff --check
- git diff --stat / git diff --numstat

完成后按计划里的交付报告模板回复。
```
