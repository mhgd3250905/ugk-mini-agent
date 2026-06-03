---
name: glm-plan
description: Creates repo-local requirement/step plans and ready-to-send messages for a separate GLM/coding agent. Use when the user says to call glm-plan, asks to hand work to another agent, or wants a detailed plan/message/file for an external agent to implement.
---

# glm-plan

## Purpose

Use this skill to turn a desired next task into repo-local planning artifacts and a ready-to-send instruction for a lower-capability external coding agent.

Default deliverables:

1. A repo-local requirement or execution plan saved under `.codex/plans/`.
2. A step-specific message document under `.codex/plans/` when the task is part of a larger series.
3. A concise sendable message in the final response that the user can paste directly to the external agent.

This skill is for coding-agent handoff work in this repository. It must not create or edit runtime product skills under `.pi/skills/`.

Assume GLM is a useful executor but weaker at inference, scope control, and architectural judgment. Do not leave it to infer intent, boundaries, hidden prerequisites, or verification standards. If a senior reviewer would hold a fact in their head, write it into the plan or message.

Treat GLM as a literal low-inference worker, not as a peer reviewer. If the workspace is messy or the plan has implicit protected behavior, GLM will likely damage it. Prevent that before handoff; do not blame the executor after the fact.

## GLM Failure Patterns To Guard Against

Recent GLM handoffs in this repository have often been sent back for rework for predictable reasons. Every plan and sendable message should proactively block these failure modes:

- Treating implementation as proof: the agent changes code and reports success without proving the user-visible behavior at the real entry point.
- Weak UI verification: tests only check that an element exists, not that geometry, phase, state transition, interaction result, or visual placement actually changed as intended.
- Fake animation or async behavior: state jumps directly to the final value, timers are not guarded against stale callbacks, or tests do not observe the intermediate state.
- Broad warning suppression: console warnings are silenced with `includes(...)` or other wide filters instead of fixing the root cause or narrowing the suppression to one known case.
- Manual-verification handoff: the agent asks the user to run browser console snippets when the task can be verified by the coding agent with available browser/devtools automation.
- Happy-path-only tests: edge cases such as restore after minimize, stale timeout, failed API call, concurrent click, old data, or hidden/minimized state are not covered.
- Scope drift disguised as polish: unrelated formatting, refactors, visual redesign, or extra commits appear because the task boundary was not strict enough.
- Overloaded mega-task failure: a large request is handed to GLM as one vague mission, so it guesses sequencing, mixes unrelated edits, and produces a diff that is hard to review.
- Dirty-workspace confusion: GLM receives uncommitted unrelated or previously completed work in the same files it must edit, then overwrites or "simplifies" behavior it was never told to preserve.
- Protected-UI regression: a plan says "do not change UI" but does not name the exact classes, DOM structure, visible labels, screenshots, tests, or browser evidence that must remain unchanged.
- Implicit-state regression: persisted UI state, dock/minimize state, cached data, or local optimistic guards are not listed as protected invariants, so GLM breaks them while changing data loading.
- Literalism failure: GLM follows the files named in the plan but misses surrounding constraints because they were described abstractly instead of as exact selectors, endpoints, test names, and forbidden edits.
- Tracked-diff tunnel vision: GLM reports `git diff --stat` / `git diff --check` as if they cover untracked new files. They do not. New files need separate `git ls-files --others --exclude-standard`, EOL, and trailing-whitespace checks.
- Incomplete file-change accounting: GLM says "1 file changed" when a new untracked Module exists, because normal diff stats omit the new file. Plans must require a changed-files section that combines `git status --short`, tracked diff stats, and explicit untracked new files.
- Test-passing-as-clean-code: GLM leaves unused imports or decorative comments because `tsc` does not necessarily enforce `noUnusedLocals`, ASCII-only edits, or comment quality. Plans must call out import cleanup and non-functional code hygiene explicitly.
- Cosmetic structure comments: GLM adds section-divider comments or decorative non-ASCII characters in new files. For this repo, ban decorative comments; comments must explain non-obvious behavior, not label obvious sections.
- Overclaiming protected-boundary compliance: GLM reports protected files were untouched without proving it. Plans must require exact `git diff -- <protected-file>` or equivalent status evidence when working in a dirty tree.
- Shape-unchanged handwaving: GLM says "response shape unchanged" because tests passed, without naming the protected endpoint fields. Plans must require the delivery report to list the exact protected contracts and the tests or route assertions that cover them.
- Broad-refactor temptation in shared files: GLM treats extracting a Module as permission to rewrite nearby hook, route, or service logic. Plans must explicitly distinguish "move these exact helpers" from "do not rewrite lifecycle/API/timer/rendering code".

When writing a plan, convert any relevant failure pattern into an explicit task, test, or acceptance criterion. Do not rely on the external agent to infer the quality bar. Spell it out.

## Observed GLM Review Corrections

When prior GLM work in this repo came back for review, Codex repeatedly had to ask for small but telling corrections. Every future handoff should proactively prevent these:

- If the task creates a new file, require GLM to say "normal `git diff --stat` excludes this untracked file" and then list the new file separately.
- If the repo has approved dirty work from earlier steps, require GLM to preserve it and provide a protected-file diff check in the report.
- If moving code into a new Module, require GLM to remove unused imports created by the move even when TypeScript passes.
- If creating a new source file, require ASCII-only content unless the moved code already contained necessary non-ASCII user-visible strings.
- If adding comments, require GLM to justify why each comment explains non-obvious behavior. Ban decorative section dividers and comments that only restate names.
- If asserting "no API/UI behavior changed", require GLM to name the concrete endpoints, exported functions, selectors, or tests that prove that claim.
- If reporting EOL/whitespace cleanliness, require separate evidence for both tracked touched files and untracked new files.

## Mandatory Handoff Workspace Preparation

Before writing or sending any GLM plan/message, Codex must make the workspace hard to misuse.

1. Inspect the workspace:
   - run `git status --short --branch`
   - run `git diff --stat`
   - run `git diff --cached --stat`
   - run `git log -5 --oneline`
2. Classify all dirty tracked changes:
   - completed and approved work
   - work GLM is supposed to continue
   - unrelated user/generated changes
   - accidental or suspicious changes
3. Do not hand GLM a broad dirty source tree. If completed work exists in files GLM may touch, first either:
   - commit it with user approval or an explicit user request to save work, or
   - stop and ask the user whether to commit, stash, or defer GLM.
4. If GLM must continue a dirty diff, the plan must list every dirty tracked file, say which files it may modify, and require GLM to stop if any other tracked file changes.
5. Keep untracked artifacts out of GLM's path:
   - list exact untracked files/directories that must not be touched
   - distinguish existing untracked artifacts from new files allowed for the current step
   - require separate status/EOL/trailing-whitespace checks for every allowed new untracked file
   - never tell GLM to run `git add -A`
   - default to no stage/no commit
6. For UI work already verified by Codex, preserve a baseline before GLM:
   - commit the baseline when the user has asked to save it, or
   - capture the exact protected DOM/classes/visible behavior/tests/browser evidence in the requirement and message
7. If the workspace cannot be made safe, do not generate a paste-ready GLM instruction yet. Report the blocker and propose the smallest cleanup step.

This is not bureaucracy. Giving a weak executor a messy workspace is negligent project management.

## Low-Inference Plan Writing Rules

Write plans as if GLM will do exactly what is written and nothing that is merely implied.

- Prefer exact file paths, function names, route names, selectors, ARIA labels, CSS class names, data attributes, and test names over prose.
- Include "protected invariants" for any behavior that must survive the step, especially previously restored UI, persisted state, cached state, local optimistic guards, endpoint request budgets, and no-regression browser flows.
- Include "must not change" selectors/classes when UI is nearby, even if the task is nominally backend or data loading.
- Include "stop conditions": baseline commit mismatch, unexpected dirty files, unexpected endpoint shape, unexpectedly large diff, EOL churn, failed focused test, browser evidence contradicting tests.
- Require GLM to prove absence of regression, not just presence of the new feature.
- When the task touches a high-risk file such as `App.tsx`, CSS, shared hooks, route files, or persistence code, include at least one regression test or browser check for the most valuable existing behavior in that file.
- Avoid vague verbs such as "clean up", "simplify", "align", "polish", or "refactor" unless the plan immediately defines the exact block and acceptable diff.
- Do not ask GLM to interpret screenshots or product taste unless the message includes exact observable acceptance criteria.
- For every "do not change X", include the test, selector, or grep/static contract that will catch X changing when feasible.
- For every protected dirty file, include the exact command GLM must run to prove it did not change, such as `git diff -- <path>`.
- For every new file, include the exact command GLM must run to prove it is present and clean, such as `git ls-files --others --exclude-standard <path>` plus trailing-whitespace and EOL checks.
- If a step is a mechanical extraction, name the exact functions/helpers/classes to move and state which nearby lifecycle/API/timer/rendering code must stay in place.
- Require report claims to be evidence-shaped: "endpoint X still returns fields A/B/C, protected by test Y" is acceptable; "shape unchanged" by itself is not.

## Required Outputs

- Small task plan file: `.codex/plans/YYYY-MM-DD-<topic>-plan.md`
- Large task requirement/index file: `.codex/plans/YYYY-MM-DD-<topic>-requirements.md` or `.codex/plans/YYYY-MM-DD-<topic>-step-index.md`
- Per-step plan file for large tasks: `.codex/plans/YYYY-MM-DD-<topic>-step-NN-<slug>-plan.md`
- Per-step message file for large tasks: `.codex/plans/YYYY-MM-DD-<topic>-step-NN-<slug>-message.txt`
- Sendable message: included in the final response in a fenced `text` block, usually matching the message file

If the user asks for a large or ongoing initiative, do not hand GLM the whole initiative. Create or update the requirement/index document, then prepare only the next small executable step unless the user explicitly asks for a full batch of messages.

If the user only says "调用 glm-plan" without a topic, infer the topic from the current conversation and latest project state. If inference is risky, ask one short clarification question.

## Workflow

1. Read the minimum project context:
   - `AGENTS.md`
   - relevant docs, usually `docs/team-runtime.md`, `docs/change-log.md`, and current handoff/plan files
   - relevant source and test files for the requested task
   - `git log --oneline -10` and `git status --short`
2. Identify the exact current baseline:
   - latest commit hash
   - what phases/tasks are already completed
   - current test status if known
   - dirty/untracked files that the external agent must not commit
3. Prepare the handoff workspace:
   - if tracked source changes are completed, get them committed/saved before GLM edits nearby files
   - if tracked dirty files must remain dirty, list them explicitly and define which ones GLM may touch
   - if unrelated dirty files exist, do not proceed until they are isolated, committed, stashed with approval, or excluded by exact instructions
   - never rely on GLM to distinguish "existing good dirty work" from "work it should replace"
4. Define protected invariants:
   - previously completed behavior that must not regress
   - DOM/CSS selectors, state keys, request budgets, route shapes, or tests that protect those behaviors
   - explicit stop conditions if these invariants cannot be verified
5. Classify task size:
   - Small: one bounded behavior, one subsystem, a small file set, and one verification loop.
   - Large: multiple subsystems, multiple user-visible behaviors, migration/refactor series, ambiguous sequencing, or likely more than one review/commit checkpoint.
6. For a small task, write one plan file under `.codex/plans/`.
7. For a large task:
   - write or update a requirement/index document with the overall objective, non-goals, phase list, known facts, and done criteria
   - choose the next smallest safe step
   - write a step-specific plan file
   - write a step-specific message file
8. Write a sendable message that points the external agent to the exact plan/message files.
9. Final response should include:
   - the requirement/index file path when created or updated
   - the plan file path
   - the message file path when created
   - the message to send
   - any local untracked files to warn about
   - whether the tracked workspace is clean enough for GLM and what cleanup was done or deliberately deferred

After each external-agent step, Codex should review the diff, rerun verification, decide whether to commit, and only then generate the next step. Do not pre-authorize GLM to continue through multiple steps without review.

## Large Task Slicing Rules

Large work must be sliced into steps that GLM can finish without architectural improvisation. Each step should satisfy most of these constraints:

- One primary behavior, test group, module boundary, or mechanical migration.
- One expected commit.
- Usually 1-3 production files or 1-3 test files.
- A focused diff that a reviewer can audit in one pass.
- A focused verification command that completes quickly.
- Clear stop conditions if the baseline differs from the plan.
- No dependency on GLM remembering previous chat context beyond the files named in the message.

Prefer many boring steps over one clever step. A clever mega-plan is how you get creative damage and then spend the afternoon cleaning it up. If the task cannot be sliced cleanly, write the uncertainty into the requirement/index document and make the next step an investigation-only plan.

Each large-task requirement/index document must include:

- Overall objective and why it matters.
- Current repo baseline and latest relevant commits.
- Completed steps and their commit hashes, when known.
- Workspace hygiene status: clean tracked tree preferred; otherwise exact dirty tracked files and why they are safe.
- Remaining backlog in recommended order.
- Non-goals and forbidden systems/files.
- Protected invariants from completed steps, with tests/selectors/browser checks that prove they remain intact.
- Shared verification baseline for the whole series.
- Per-step review gate: GLM stops after delivery, Codex audits before the next step.
- Commit policy: whether GLM may commit; default is no stage/no commit unless the user explicitly says otherwise.

Each per-step plan must include:

- Step name and sequence number.
- The exact subset of the requirement it handles.
- The exact files it may read and modify.
- The exact current dirty-file boundary and what to do if it differs.
- Protected invariants and forbidden regressions for nearby code.
- The exact tests or blocks to move/change when the task is mechanical.
- Import cleanup rules and known symbols to preserve.
- Focused baseline command to run before editing when useful.
- Focused verification commands and final verification commands.
- Delivery report template with enough detail for Codex to review without guessing.
- A "report accuracy" section when new files or dirty protected files are involved: normal tracked diff stats are incomplete; GLM must combine `git status`, tracked diff stats, and explicit untracked-file evidence.

Each per-step message file must be paste-ready and self-contained. It must not say "see the conversation above". It should include baseline, must-read files, exact scope, forbidden scope, execution rules, verification commands, and delivery format.

## Plan File Contract

The plan must be usable by an agent that has never seen the project. Include:

- Goal
- Current baseline
- Workspace hygiene / dirty-file boundary
- Must-read files
- Absolute scope boundary
- Protected invariants / existing behavior that must not regress
- Explicit "Do not do" list
- Task-by-task execution steps
- Exact files likely to modify
- Tests to write before implementation
- Focused verification commands per task
- Final verification commands
- Commit message suggestions
- Delivery report template
- Review checklist for the human/Codex reviewer

For UI or browser-visible work, the plan must also include:

- The exact local URL or route to verify, for example `http://127.0.0.1:5174/`.
- The real DOM selectors, ARIA labels, or user actions that exercise the changed behavior.
- The expected before/after observable evidence: bounding rects, computed styles, data attributes, network status, screenshots, canvas pixels, or visible state changes.
- The protected UI evidence that must remain unchanged, including class names, data attributes, visible text that must stay absent/present, and persisted localStorage keys when relevant.
- A browser automation requirement. If browser automation is unavailable, the agent must report it as a blocker or limitation; it must not silently replace it with "please manually verify" unless the user explicitly accepts that.

Prefer 4-8 tasks for a normal plan. For a GLM step plan, prefer 1-3 tasks and one reviewable commit boundary.

For GLM, "concise" must never mean "underspecified". Use concrete file paths, test names, command lines, route names, selectors, block markers, and commit boundaries. Vague instructions such as "clean this up", "split related tests", or "verify normally" are not acceptable unless immediately followed by exact examples and boundaries.

For extraction/refactor steps, include a "do not improvise" clause with this shape:

- Move only these exact functions/classes: `<names>`.
- Keep these systems in place: `<React state/effects/API calls/timers/routes/public exports/etc.>`.
- Preserve these import/export contracts: `<exported symbol and old import path>`.
- If the extracted Module appears to require wider rewrites, stop and report instead of simplifying the caller.

## Behavior Evidence Contract

Every plan must define what evidence is strong enough to accept the work. Use this hierarchy:

1. Real behavior at the real entry point.
2. Focused automated tests that would fail on the old bug or missing feature.
3. Type/build/static checks.
4. Diff and commit purity checks.

Do not let the external agent invert that hierarchy. A green unit test is not enough for a visual or interaction task if the real browser behavior is unverified.

Require the external agent to include concrete evidence in its delivery report:

- For UI motion or layout: sample at least two frames or states and report the actual measured values, not just "animation works".
- For async/timer behavior: prove the intermediate state and final cleanup state, and guard stale callbacks with an id/token when relevant.
- For API behavior: include status codes and payload shape checks from the real route or route test.
- For warning suppression: quote the exact warning pattern being suppressed and explain why the filter cannot hide unrelated warnings.
- For bug fixes: name the old failing behavior and the test or browser step that now catches it.
- For regression-sensitive work: name the existing behavior protected by the step and include evidence that it still works.
- For mechanical migration: prove equivalence with block comparison, test counts, or another concrete invariant.
- For new files: list the file under both "created files" and "untracked files", and include EOL/trailing-whitespace evidence because normal `git diff --check` will not inspect it.
- For protected dirty files: quote the exact command used to prove the file's diff did not change during the step.

Ban delivery claims such as "should work", "manual verification recommended", "looks fine", or "implemented according to plan" when no runtime evidence is supplied.
Also ban vague report claims such as "shape unchanged", "clean execution", "files untouched", or "EOL ok" unless the report includes the concrete command/test/contract evidence behind the claim.

## Formatting And EOL Hygiene

Every generated plan and sendable message must explicitly protect against format-only churn:

- External agents must preserve existing line endings and file formatting. Do not convert LF to CRLF or CRLF to LF unless the task explicitly requires an EOL normalization commit.
- External agents must not run broad formatters on unrelated files. Formatting is allowed only for files intentionally changed and only when it matches the repo's existing tooling.
- Plans must require reviewers to inspect `git diff --stat`, `git diff --numstat`, and suspicious large diffs before accepting work.
- If a small feature produces thousands of changed lines, the external agent must stop and investigate line ending/formatter churn before continuing.
- Verification must include `git diff --check`; when large UI/test files are touched, also include `git ls-files --eol <touched files>` or equivalent EOL inspection if diff size looks suspicious.
- For untracked new files, `git diff --check` is not enough. Require an explicit trailing-whitespace and EOL check, for example `Select-String -LiteralPath <new-file> -Pattern '[ \t]+$'` and `git ls-files --eol --others --exclude-standard <new-file>` on Windows.
- Delivery reports must mention whether any mechanical formatting or EOL normalization occurred. If it occurred unintentionally, it must be reverted before handoff.
- Delivery reports must not summarize changed files from `git diff --stat` alone when new untracked files exist. They must show tracked diff stats and untracked created files separately.
- New source files must use plain ASCII comments unless a non-ASCII string is required for user-visible copy or copied existing behavior. Decorative dividers, box-drawing characters, and ornamental headings are not acceptable.
- Import cleanup is a required hygiene check even if `npx tsc --noEmit` passes; some TypeScript configs do not reject unused imports.

## External Agent Control Rules

Always include these rules in the plan and sendable message:

- Strictly follow the plan; do not redesign the system.
- Before editing, run the baseline `git status --short --branch` and stop if it does not match the message's expected dirty-file boundary.
- Default to no stage and no commit. If the user explicitly authorizes commits, use one task, one commit.
- Write tests before implementation where behavior changes.
- Do not broaden scope.
- Do not modify files outside the allowed list. If a compile error appears to require another file, stop and report unless the plan explicitly allows a tiny alignment edit.
- Preserve all protected invariants listed in the message. If an invariant conflicts with the implementation, stop rather than deleting or simplifying it.
- Preserve existing line endings and formatting; do not create EOL-only or formatter-only churn.
- Stop and report if blocked or if a plan assumption is wrong.
- Do not commit `.env`, `.data`, runtime artifacts, temp files, unknown `.pi/skills/*`, or `skills-lock.json`.
- For UI work, verify in the browser at the real local URL and include measured evidence. Do not push browser verification onto the user if automation is available.
- Do not suppress warnings broadly. Fix the cause, or narrow the suppression to the exact known message and element/source.
- Do not add decorative section comments or ornamental non-ASCII separators. Comments must explain non-obvious behavior.
- When the task is a refactor/extraction, do not rewrite adjacent lifecycle/API/timer/rendering logic unless the plan names that exact logic.
- In the final report, do not use `git diff --stat` as the only source of truth for changed files. Include `git status --short --branch` and explicit untracked-file evidence.

## Testing Guidance

Tell the external agent that tests must verify real behavior, not just strings.

Ban weak tests such as:

- only checking that a function name exists
- allowing contradictory terminal states in one assertion
- accepting `running` as a valid result for a terminal lifecycle test
- broad `assert.ok(A || B || C)` unless the plan explicitly explains why

Require tests for:

- happy path
- ordinary throw/error path
- timeout path when relevant
- contention/concurrency boundaries when adding locks, leases, admission limits, queues, or schedulers; verify capacity-available requests do not fail with lock-busy errors
- cancel/pause/stale write-back when relevant
- old data compatibility when changing persisted data
- API response shape when changing routes
- UI escaping when rendering dynamic data
- UI state transitions, geometry, and cleanup for visual interactions
- intermediate and terminal states for animations, timers, optimistic updates, and pending UI

For frontend visual work, require at least one test that fails against the previous bad behavior. Examples:

- A restore animation test should assert `from` state, `to` state, transform/rect change, and cleanup.
- A dock or drag test should assert original position, minimized/hidden state, restored position, and any related panel position.
- A connection delete test should assert the correct connection kind is removed and unrelated links remain.
- A warning-filter test or setup review should ensure unrelated console warnings still surface.

## Sendable Message Template

```text
请接手 <repo path> 的 <task name>。

当前基线：
- 最新 commit: <hash and subject>
- 分支状态: <branch/ahead/behind>
- 已完成: <completed phases or commits>
- 当前验证: <known verification result>
- 暂存区: <empty or exact state>
- tracked 工作区: <clean or exact dirty files>
- 未跟踪文件禁止触碰: <exact list>

工作区整理状态：
- Codex 已保存/提交的基线: <commit or not applicable>
- GLM 允许修改的 dirty tracked files: <none or exact list>
- 如果 `git status --short --branch` 与本消息不一致，立刻停止并报告，不要继续编辑

必须先读：
- AGENTS.md
- <requirement/index file if any>
- <plan file>
- <relevant docs>
- <relevant source/tests>

严格按计划文件执行：
- <plan file>

本轮只做：
- <scope bullet 1>
- <scope bullet 2>

必须保护的既有行为：
- <invariant 1, with selector/test/browser evidence>
- <invariant 2, with selector/test/browser evidence>
- 如果实现会破坏以上任一行为，停止并报告，不要删除、简化或重做它

禁止做：
- 不做 <explicit non-goals>
- 不改 <forbidden files/systems>
- 不改允许列表之外的文件；如果编译错误似乎需要改别的文件，先停止说明
- 不创建计划外文件
- 不做整文件格式化或换行符转换；保持 touched files 的既有 EOL/格式
- 不 stage、不 commit，除非本条消息明确授权
- 不使用 git add -A
- 不提交 .env/.data/runtime 产物/temp 文件/报告产物/未知 .pi/skills/*/skills-lock.json

执行要求：
- 这是第 <N> 步，只处理本步范围，完成后停下交付
- 编辑前先运行 `git status --short --branch`，确认工作区边界与本消息一致
- 行为变更先补测试，再写实现；纯机械迁移必须做等价性检查
- 遇到计划外问题先停下说明，不要顺手扩范围
- 不要重构、重排或“顺手优化”计划没有点名的代码块
- 对高风险文件（App.tsx、CSS、共享 hook、route、持久化状态）必须包含既有行为回归证据
- 如果小改动产生超大 diff，先检查是否为 EOL/formatter churn，修正后再继续
- UI/交互任务必须在真实入口做浏览器验证，交付 measured evidence；不要把可自动验证的步骤丢给用户手动做
- 不允许宽泛 suppress console warning；必须修根因或精确限定到已知 warning

最终验证：
- <focused test command>
- <combined or full test command>
- <build command if relevant>
- npx tsc --noEmit
- git diff --check
- git diff --stat / git diff --numstat，确认没有异常大规模格式噪声
- git ls-files --eol <touched files>
- 对新 untracked 文件补充 trailing whitespace 和 EOL 检查
- git diff --cached --stat

完成后按计划里的交付报告模板回复。不要 stage，不要 commit。
```
