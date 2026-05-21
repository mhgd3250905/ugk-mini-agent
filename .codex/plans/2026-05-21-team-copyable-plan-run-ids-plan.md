# Team Plan / Run ID 完整展示与点击复制计划

日期：2026-05-21

## Goal

在 `/playground/team` 中，让 Plan ID 和该 Plan 下 Run ID 像 Conn 运行详情里的 `.conn-run-id-label` 一样：

- 完整展示，不再只显示截断版本。
- 点击即可复制对应 ID。
- 点击复制不触发卡片展开、进入详情、创建运行等外层点击行为。
- 复制成功后短暂显示 `已复制` 并恢复原 ID；失败时使用现有 Team toast 提示。

这是纯 Team UI 行为增强，不改变 Team API、Plan/Run ID 生成、runtime 状态机、worker、rerun、pause/cancel 逻辑。

## Current Baseline

- 最新 commit：`857b4b9 fix(team): use escapeHtml for data-task-id attributes, safe anchor lookup`
- 最近已完成：
  - Team `for_each.parallel v1`
  - rerun `force_rerun` 成功后自动清除标记
  - disposition 修改后保持 run detail 滚动位置
  - `data-task-id` 改用 `escapeHtml`，anchor lookup 不再拼 unsafe selector
- 当前已知验证：
  - 最近完整 Team 验证曾通过：`npm run test:team`
  - 最近类型检查曾通过：`npx tsc --noEmit`
- 当前工作区有未跟踪运行/计划产物，不能提交，见本文末尾。

## Must-read Files

- `AGENTS.md`
- `docs/team-runtime.md`
- `docs/change-log.md`
- `src/ui/team-page.ts`
- `src/ui/team-page-helpers.ts`
- `src/ui/conn-page-js.ts`
- `src/ui/conn-page-css.ts`
- `test/team-page-ui.test.ts`

重点参考：

- Conn ID 复制参考：
  - `src/ui/conn-page-js.ts` 中 `writeClipboardText(...)`、`copyToClipboard(...)`、`.conn-run-id-label` click handler
  - `src/ui/conn-page-css.ts` 中 `.conn-run-id-label`
- Team 当前问题点：
  - `src/ui/team-page.ts` 中 `renderPlanDashboardCard(...)` 当前只显示标题/芯片，不显示完整 Plan ID
  - `src/ui/team-page.ts` 中 `renderPlanDetailContent(...)` 当前详情顶部不显示完整 Plan ID
  - `src/ui/team-page.ts` 中 `renderPlanRunCard(...)` 当前显示 `run.runId.slice(0, 12) + '...'`
  - `src/ui/team-page-helpers.ts` 中 helper mirror 也截断 Run ID，必须同步

## Absolute Scope Boundary

本轮只做 `/playground/team` 页面里的 Plan ID / Run ID 展示与复制体验。

允许修改：

- `src/ui/team-page.ts`
- `src/ui/team-page-helpers.ts`
- `test/team-page-ui.test.ts`
- `docs/team-runtime.md`（只补 UI 行为描述，若确实需要）
- `docs/change-log.md`

不要修改：

- `src/team/**` runtime / orchestrator / stores / schema
- `src/routes/**` API 行为
- `src/ui/conn-*`，Conn 只作为参考，不要重构它
- `.pi/skills/**`
- `.env`, `.data/**`, `runtime/**`, `public/**`
- 任何模型 provider、Team worker、Docker 配置

## 禁止做

- 不要重新设计 Team 页面布局。
- 不要把 ID 改成图标按钮或只放在 tooltip 中；用户要求是完整展示。
- 不要继续截断 Plan ID / Run ID。
- 不要把 `jsArg(...)` 用作 HTML 属性值。属性值和可见文本用 `escapeHtml(...)`。
- 不要拼接 raw ID 到 CSS selector，例如 `querySelector('[data-run-id="' + runId + '"]')` 这种新增代码不要写；需要查找属性时用 `querySelectorAll(...)` + `getAttribute(...)` 比对。
- 不要让点击 ID label 触发外层卡片的 `onclick`。
- 不要提交 `.codex/plans/**`、`.env`、`.data/**`、`runtime/**`、`public/**`、temp 文件、未知 `.pi/skills/**` 或 `skills-lock.json`。
- 不要做整文件格式化、换行符转换、无关重构。

## Implementation Tasks

### Task 1 — 补 UI 行为测试：完整 ID 展示与 helper parity

先在 `test/team-page-ui.test.ts` 增加失败测试，再实现。

覆盖点：

- `renderPlanDashboardCard(...)` 输出完整 `plan.planId`，包含可点击复制 label，title 为 `点击复制 Plan ID`。
- `renderPlanRunCard(...)` 输出完整 `run.runId`，包含可点击复制 label，title 为 `点击复制 Run ID`。
- Run ID 不再出现旧的 `slice(0, 12) + '...'` 行为；测试要断言完整 ID 出现，截断字符串不作为唯一展示。
- inline renderer 与 `src/ui/team-page-helpers.ts` helper 输出关键 token 保持一致。
- 恶意 `planId` / `runId` 在可见文本和属性中被 HTML escape，不出现 raw `<script>`、raw 引号破坏属性或 handler。

建议测试位置：

- 放在现有 `P19-T2: renderPlanDashboardCard...`
- 放在现有 `P19-T5: renderPlanRunCard...`
- 放在 `PARITY TESTS` 区域补 inline/helper 对齐测试

Focused verification：

```powershell
node --test --import tsx --test-name-pattern "Plan ID|Run ID|renderPlanDashboardCard|renderPlanRunCard|copy" test/team-page-ui.test.ts
```

### Task 2 — Team 页面新增可复用 ID label 样式与复制 helper

修改 `src/ui/team-page.ts`。

要求：

- 新增 Team 专用样式，例如 `.team-id-label` / `.team-id-row`，参考 `.conn-run-id-label`：
  - mono 字体
  - 小号字体
  - muted 文本色
  - elevated / border 背景
  - hover 变主色
  - `.is-copied` 成功色
  - `cursor: pointer`
  - `user-select: none`
  - `overflow-wrap: anywhere` 或等价策略，保证完整 ID 可换行展示，不用省略号
- 新增 clipboard helper：
  - 优先 `navigator.clipboard.writeText(...)`
  - 非 secure context / clipboard 不可用时 fallback 到临时 textarea + `document.execCommand("copy")`
  - 复用现有 Team toast（如 `showSuccess` / `showError`，按当前代码实际名称）
  - 成功后 label 文本变 `已复制`，加 `.is-copied`，约 1200ms 后恢复原完整 ID
  - handler 必须 `event.stopPropagation()` 和 `event.preventDefault()`

建议函数形态：

```js
async function writeTeamClipboardText(text) { ... }
function copyTeamIdToClipboard(event, value, labelEl) { ... }
```

如果采用 inline `onclick`，只能对 JS 参数使用 `jsArg(value)`；可见文本和 HTML 属性继续用 `escapeHtml(value)`。

Focused verification：

```powershell
node --test --import tsx --test-name-pattern "copy|clipboard|Plan ID|Run ID" test/team-page-ui.test.ts
```

### Task 3 — 渲染 Plan ID：Dashboard card + Plan detail

修改 `src/ui/team-page.ts` 和 `src/ui/team-page-helpers.ts`。

要求：

- `renderPlanDashboardCard(plan, runs)` 在 Plan 标题附近显示完整 `planId`：
  - title：`点击复制 Plan ID`
  - class 使用 Task 2 新增的 ID label class
  - 点击只复制，不触发 card 或按钮行为
  - Plan ID 为空时不要渲染奇怪的 `undefined`
- `renderPlanDetailContent(plan, runs)` 在详情顶部显示完整 `planId`：
  - 同样可点击复制
  - 不影响 goal、outputContract、任务结构、运行记录
- helper mirror 至少要覆盖 dashboard card 的 Plan ID 输出；如果 helper 中没有 detail renderer，则不要为了它新建大函数。

注意：

- `data-plan-id` 属性继续用 `escapeHtml(safePlan.planId || '')`。
- 不要顺手修 `startRun('\\x27' + safePlan.planId + '\\x27)` 这类历史代码，除非测试证明本轮新增复制功能必须改；本轮目标不是全页面 onclick 安全审计。

Focused verification：

```powershell
node --test --import tsx --test-name-pattern "Plan ID|renderPlanDashboardCard|plan detail" test/team-page-ui.test.ts
```

### Task 4 — 渲染 Run ID：替换截断展示为完整可复制 label

修改 `src/ui/team-page.ts` 和 `src/ui/team-page-helpers.ts`。

要求：

- `renderPlanRunCard(run, plan)` 将当前：

```js
run.runId.slice(0, 12) + '...'
```

替换为完整 `run.runId`。

- label title：`点击复制 Run ID`
- label click 不触发外层 `togglePlanRunDetail(...)`
- 继续保留状态 badge、elapsed、progress、current task、run actions、detail container
- helper mirror 必须同步
- 如果 `run.runId` 包含引号、HTML、CSS selector 特殊字符，仍必须安全展示和安全复制

Focused verification：

```powershell
node --test --import tsx --test-name-pattern "Run ID|renderPlanRunCard|malicious runId|parity" test/team-page-ui.test.ts
```

### Task 5 — 文档、完整验证与提交

文档：

- `docs/change-log.md` 添加 `2026-05-21` 条目：
  - 主题：Team Plan / Run ID 完整展示与点击复制
  - 影响范围：`src/ui/team-page.ts`, `src/ui/team-page-helpers.ts`, `test/team-page-ui.test.ts`, `docs/change-log.md`
- `docs/team-runtime.md` 若更新 `/playground/team 控制台` UI 描述，则只补一句 Plan card / Run card 可完整展示并复制 ID；不要扩写 runtime 章节。

最终验证：

```powershell
node --test --import tsx test/team-page-ui.test.ts
npm run test:team
npx tsc --noEmit
git diff --check
git diff --stat
git diff --numstat
git ls-files --eol src/ui/team-page.ts src/ui/team-page-helpers.ts test/team-page-ui.test.ts docs/change-log.md docs/team-runtime.md
```

如果 `git diff --stat` / `--numstat` 显示几千行变化，必须停下检查是否 EOL 或 formatter churn。小 UI 功能不应该产生大规模重排。

## Expected Files To Modify

- `src/ui/team-page.ts`
- `src/ui/team-page-helpers.ts`
- `test/team-page-ui.test.ts`
- `docs/change-log.md`
- `docs/team-runtime.md`（可选，仅当补 UI 文档）

## Commit Suggestions

每个 task 独立 commit，建议：

1. `test(team): cover copyable plan and run ids`
2. `fix(team): show copyable plan ids`
3. `fix(team): show copyable run ids`
4. `docs(team): document copyable plan and run ids`

也可以将 Task 2-4 合并为一个实现 commit，但测试 commit 和文档 commit 建议分开。不要把格式化/EOL 修复混进功能 commit；若真出现 EOL 修复，单独说明并先征求确认。

## Delivery Report Template

完成后请按以下格式汇报：

```text
完成 Team Plan / Run ID 完整展示与复制。

Commits:
- <hash> <message>
- ...

实现摘要:
- Plan dashboard/detail 中完整展示 planId，点击复制
- Plan 下 run card 中完整展示 runId，点击复制
- 复制成功/失败反馈与事件冒泡处理
- helper mirror 与 inline renderer 保持一致

验证:
- node --test --import tsx test/team-page-ui.test.ts: <结果>
- npm run test:team: <结果>
- npx tsc --noEmit: <结果>
- git diff --check: <结果>
- git diff --stat / --numstat reviewed: yes/no
- EOL/formatter churn: 有/无；如有说明原因

未提交文件:
- 确认未提交 .codex/plans、public、runtime、.env、.data 等产物

阻塞/风险:
- 无 / <说明>
```

## Review Checklist

Reviewer 重点检查：

- Plan ID 和 Run ID 是否真的完整展示，不是 hover/title 才能看到。
- 点击 Plan ID / Run ID 是否只复制，不触发外层卡片点击或 run detail 展开。
- 成功后是否短暂显示 `已复制` 并恢复原 ID。
- 复制失败是否有 toast，而不是静默失败。
- `escapeHtml` / `jsArg` 是否职责分明：
  - HTML 属性和可见文本使用 `escapeHtml`
  - JS 字符串参数才使用 `jsArg`
- 是否新增了 raw selector 拼接风险。
- helper mirror 是否和 inline renderer 对齐。
- tests 是否验证真实行为和 escaping，不只是检查函数名存在。
- `git diff --stat` / `--numstat` 是否没有格式化噪音。
- 未跟踪运行产物是否没有被提交。

## Untracked Files To Avoid Committing

当前已知未跟踪文件包括：

- `.codex/plans/2026-05-20-handoff-team-router-next-session.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-plan.md`
- `.codex/plans/2026-05-20-team-for-each-parallel-step-*.md`
- `.codex/plans/2026-05-21-team-rerun-disposition-autoclear-and-scroll-preserve-plan.md`
- `public/agent-search-report.html`
- `public/github-trending-report.html`
- `public/medtrum-social-report.html`
- `public/medtrum-view/`
- `public/ruflo-research-report.html`
- `runtime/agent-search/`
- `runtime/medtrum-news-2026/`
- `runtime/ruflo-research/`

本计划文件自身 `.codex/plans/2026-05-21-team-copyable-plan-run-ids-plan.md` 也是给 GLM 的计划产物，除非用户明确要求，否则不要提交。
