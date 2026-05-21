# Step 6: extract testable Team page UI modules

Date: 2026-05-21

## Goal

Reduce `src/ui/team-page.ts` risk by extracting one small, testable Team UI behavior module. Do not attempt to rewrite the whole page.

Recommended first extraction: run detail scroll/disposition behavior or run detail/mindmap state helpers, because recent regressions happened there.

## Current baseline

- `src/ui/team-page.ts` is a large inline HTML/JS renderer.
- `src/ui/team-page-helpers.ts` exists but is partly a helper/mirror surface.
- `test/team-page-ui.test.ts` is large and includes many static string/regex assertions.
- Recent real bug: clicking task disposition after mindmap expansion could scroll to top; static tests missed the timing until a focused regression was added.

## Must-read files

- `AGENTS.md`
- `docs/team-runtime.md`
- `.codex/plans/2026-05-21-team-architecture-optimization-index.md`
- `src/ui/team-page.ts`
- `src/ui/team-page-helpers.ts`
- `test/team-page-ui.test.ts`
- `docs/team-runtime.md`
- `docs/change-log.md`

## Scope boundary

Allowed files:

- `src/ui/team-page.ts`
- `src/ui/team-page-helpers.ts`
- optional new `src/ui/team-*.ts` module
- `test/team-page-ui.test.ts`
- `docs/team-runtime.md`
- `docs/change-log.md`

## Forbidden

- Do not redesign the Team page.
- Do not change CSS visual design unless required by the extracted behavior.
- Do not start a frontend build system.
- Do not introduce React/Vue/etc.
- Do not rewrite the whole inline script.
- Do not weaken existing tests.
- Do not touch backend runtime.
- Do not do formatter/EOL churn on the giant UI file.

## Design guidance

This task must be a small extraction, not a vanity rewrite.

Good candidates:

- Pure helper for disposition scroll snapshot/restore decisions.
- Pure helper for mindmap expanded state transitions.
- Pure render helper for task ID anchors / copyable IDs, if it removes duplication.

The new Module should be testable without a browser. Keep browser DOM code in the inline adapter where necessary.

Avoid creating a second mirror of the same logic. If a helper is extracted, make `team-page.ts` use it as source of truth where practical.

## Required tests before implementation

Tests must verify real behavior:

1. Disposition update captures scroll snapshot before network PATCH.
2. Refresh restores to the selected task anchor and does not collapse run detail.
3. Unsafe task IDs are safely rendered and safely looked up.
4. Existing copyable plan/run ID behavior still works.

Do not add tests that only assert a function name exists.

## Implementation steps

1. Pick exactly one UI behavior cluster to extract.
2. Add/strengthen focused tests first.
3. Create a small helper Module or move logic into `team-page-helpers.ts` only if that file becomes the source of truth.
4. Update `team-page.ts` minimally to call the helper.
5. Preserve current HTML output except for intentional safe escaping/source-of-truth changes.
6. Update docs/change-log briefly.

## Verification

```powershell
node --test --import tsx --test-name-pattern "disposition|mindmap|scroll|copy|anchor|team id|run id" test/team-page-ui.test.ts
node --test --import tsx test/team-page-ui.test.ts
npm run test:team
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
git ls-files --eol src/ui/team-page.ts src/ui/team-page-helpers.ts test/team-page-ui.test.ts
```

## Commit message suggestion

```text
refactor(team): extract run detail ui behavior helpers
```

## Delivery report template

```text
完成 Step 6：Team page UI behavior module 抽取。

Commit:
- <hash> refactor(team): extract run detail ui behavior helpers

实现摘要:
- <抽取了哪一个 UI behavior cluster>
- <team-page.ts 如何变薄>
- <确认视觉/交互行为未变或说明唯一变化>

验证:
- node --test --import tsx --test-name-pattern "...": <结果>
- node --test --import tsx test/team-page-ui.test.ts: <结果>
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
请接手 E:\AII\ugk-pi 的 Team architecture Step 6：抽取 Team page UI behavior helper。

当前基线：
- 请确认后端 runtime 重构步骤已稳定；本任务只碰 Team UI 小范围行为抽取

必须先读：
- AGENTS.md
- docs/team-runtime.md
- .codex/plans/2026-05-21-team-architecture-optimization-index.md
- .codex/plans/2026-05-21-team-arch-step-6-team-page-ui-modules.md
- src/ui/team-page.ts
- src/ui/team-page-helpers.ts
- test/team-page-ui.test.ts

本轮只做：
- 只抽取一个小 UI behavior cluster，优先 run detail scroll/disposition/mindmap anchor 相关逻辑
- 让测试验证真实行为，不要只查字符串
- 保持视觉和交互行为不变

禁止做：
- 不重写整页
- 不引入 React/Vue/构建系统
- 不改后端 runtime
- 不弱化已有测试
- 不做整文件格式化或换行符转换，尤其不要污染 src/ui/team-page.ts
- 不提交 .env/.data/runtime/public 产物/temp 文件/未知 .pi/skills/*/skills-lock.json

执行要求：
- 先补测试，再写实现
- 本 Step 一个 commit
- 遇到计划外问题先停下说明
- 如果小改动产生超大 diff，先检查 EOL/formatter churn

最终验证：
- node --test --import tsx --test-name-pattern "disposition|mindmap|scroll|copy|anchor|team id|run id" test/team-page-ui.test.ts
- node --test --import tsx test/team-page-ui.test.ts
- npm run test:team
- npx tsc --noEmit
- git diff --check
- git diff --stat / git diff --numstat

完成后按计划里的交付报告模板回复。
```
