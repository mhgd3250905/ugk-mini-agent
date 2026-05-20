---
name: glm-plan
description: Creates a repo-local execution plan and a ready-to-send task message for a separate GLM/coding agent. Use when the user says to call glm-plan, asks to hand work to another agent, or wants a detailed plan/message/file for an external agent to implement.
---

# glm-plan

## Purpose

Use this skill to turn a desired next task into two deliverables:

1. A detailed implementation plan saved under `.codex/plans/`.
2. A concise message the user can send directly to the external agent.

This skill is for coding-agent handoff work in this repository. It must not create or edit runtime product skills under `.pi/skills/`.

## Required Outputs

- Plan file: `.codex/plans/YYYY-MM-DD-<topic>-plan.md`
- Sendable message: included in the final response in a fenced `text` block

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
3. Write a plan file under `.codex/plans/`.
4. Write a sendable message that points the external agent to that plan file.
5. Final response should include:
   - the plan file path
   - the message to send
   - any local untracked files to warn about

## Plan File Contract

The plan must be usable by an agent that has never seen the project. Include:

- Goal
- Current baseline
- Must-read files
- Absolute scope boundary
- Explicit "禁止做" list
- Task-by-task execution steps
- Exact files likely to modify
- Tests to write before implementation
- Focused verification commands per task
- Final verification commands
- Commit message suggestions
- Delivery report template
- Review checklist for the human/Codex reviewer

Prefer 4-8 tasks. Each task should be independently committable.

## Formatting And EOL Hygiene

Every generated plan and sendable message must explicitly protect against format-only churn:

- External agents must preserve existing line endings and file formatting. Do not convert LF to CRLF or CRLF to LF unless the task explicitly requires an EOL normalization commit.
- External agents must not run broad formatters on unrelated files. Formatting is allowed only for files intentionally changed and only when it matches the repo's existing tooling.
- Plans must require reviewers to inspect `git diff --stat`, `git diff --numstat`, and suspicious large diffs before accepting work.
- If a small feature produces thousands of changed lines, the external agent must stop and investigate line ending/formatter churn before continuing.
- Verification must include `git diff --check`; when large UI/test files are touched, also include `git ls-files --eol <touched files>` or equivalent EOL inspection if diff size looks suspicious.
- Delivery reports must mention whether any mechanical formatting or EOL normalization occurred. If it occurred unintentionally, it must be reverted before handoff.

## External Agent Control Rules

Always include these rules in the plan and sendable message:

- Strictly follow the plan; do not redesign the system.
- One task, one commit.
- Write tests before implementation where behavior changes.
- Do not broaden scope.
- Preserve existing line endings and formatting; do not create EOL-only or formatter-only churn.
- Stop and report if blocked or if a plan assumption is wrong.
- Do not commit `.env`, `.data`, runtime artifacts, temp files, unknown `.pi/skills/*`, or `skills-lock.json`.

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

## Sendable Message Template

```text
请接手 <repo path> 的 <task name>。

当前基线：
- 最新 commit: <hash>
- 已完成：<completed phases>
- 当前验证：<known verification result>

必须先读：
- AGENTS.md
- <plan file>
- <relevant docs>
- <relevant source/tests>

严格按计划文件执行：
- <plan file>

本轮只做：
- <scope bullets>

禁止做：
- 不做 <explicit non-goals>
- 不改 <forbidden files/systems>
- 不做整文件格式化或换行符转换；保持 touched files 的既有 EOL/格式
- 不提交 .env/.data/runtime 产物/temp 文件/未知 .pi/skills/*/skills-lock.json

执行要求：
- 每个 Task 先补测试，再写实现
- 每个 Task 单独 commit
- 遇到计划外问题先停下说明，不要顺手扩范围
- 如果小改动产生超大 diff，先检查是否为 EOL/formatter churn，修正后再继续

最终验证：
- npm run test:team
- npx tsc --noEmit
- git diff --check
- git diff --stat / git diff --numstat，确认没有异常大规模格式噪音

完成后按计划里的交付报告模板回复。
```
