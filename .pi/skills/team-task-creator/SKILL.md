---
name: team-task-creator
description: Guided Team Console Task design advisor and creation/update helper. Use when the user says "/team-task" or asks in natural-language to create, update, design, or complete a Team Console Task, WorkUnit, Discovery Task, reusable/template task, worklist-producing task, split-task, 任务卡片, 发现任务, 分片任务, or a multi-source research workflow. Helps non-expert users turn fuzzy goals into the right Task shape, asks plain-language questions, previews full JSON, and writes only through /v1/team/tasks after confirmation. Do not use for running, observing, or debugging Tasks.
---

# Team Task Creator

Use this skill to help a non-expert user design and create or update Team Console Task drafts through the REST API. This skill only creates or updates Task definitions. It must not start a run, observe progress, debug output, or execute worker/checker chains.

## Progressive Disclosure

Keep the live conversation focused on the user's business goal. Do not expose schema terms until the full JSON preview.

For normal Tasks, worklist producer Tasks, and split-task roots, prefer the Task factory CLI instead of hand-authoring full payloads. The factory accepts narrow business parameters, generates the full Task JSON, and runs backend validation before any write.

Read `references/task-contracts.md` only when you need exact payload fields, factory spec examples, port rules, template parameter rules, Discovery contract, worklist contract, split-task contract, or API examples. Read it before showing any full JSON preview or calling `POST /v1/team/tasks` / `PATCH /v1/team/tasks/:taskId`.

## Activation

- Activate when the user message contains `/team-task`.
- Activate when the user clearly asks to create or update a Team Console Task, WorkUnit, Task card, Discovery Task, template Task, worklist-producing Task, split-task, 任务卡片, 发现任务, 分片任务, or similar reusable Team Canvas node.
- Do not activate for requests to run a Task, observe progress, inspect logs, debug a run, connect existing ports, or discuss concepts without creating/updating a draft.
- If intent is ambiguous, ask one short clarification. You can say: "可以用 `/team-task ...` 启动 Task 创建流程。"

## Conversation Posture

Assume the user has a rough goal, not schema knowledge. Talk in business language first: "要处理什么、从哪里来、最后给谁用、怎样算合格". Do not ask the user to choose `canvasKind`, `inputPorts`, `outputPorts`, `templateConfig`, `discoverySpec`, `worklist`, `splitTaskSpec`, Agent ids, or any other internal field.

Own the recommendation. Evaluate the task shape yourself, explain the recommendation in one or two plain sentences, then ask only the missing business choices. Prefer 1-3 targeted questions; if the intent is already clear, proceed to a human-readable design summary and then the JSON preview.

Use examples like:

> 这不是一个单次搜索任务。你现在有一批上游结果需要先整理成清单，然后逐条处理并确保全部回收。我会设计成两段：第一段整理清单，第二段按清单分发处理。

## Task Shape Selection

Evaluate the shape before collecting fields. Do not ask the user to choose between technical task types before you have made a recommendation.

- Use a normal Task when the work is one bounded execution with one deliverable.
- Use a template Task when the same Task will be reused later with small fill-in values, such as keyword, recipient, subject, date range, or priority.
- Use Discovery when the Task must first discover unknown items, sources, platforms, candidates, URLs, repos, products, papers, leads, or records before per-item work.
- Use a worklist producer when the input is already known or upstream-provided, but large or messy, and must be standardized into a complete item list before further processing.
- Use split-task when an existing standard list should be processed item-by-item, checked independently, and collected with full coverage.
- Use a downstream normal Task when `worklist-results` needs final business synthesis, formatting, email delivery, report writing, or another final artifact.

Important distinction:

- "帮我调研多个渠道/平台，先找一批对象再逐个分析" usually means Discovery.
- "上游已经给了大 JSON/文件/历史结果，把它拆开逐项处理，别漏回收" usually means worklist producer + split-task.

For complex workflows, propose a small chain instead of forcing one oversized Task. Example: "整理清单 Task -> 分片处理 Task -> 汇总报告 Task".

## Interview Checklist

Ask only what changes the contract:

- Goal: what outcome the Task must produce.
- Input/source: upstream artifact, file, existing data, search scope, or no input.
- Output: report, JSON, HTML, email body, file, worklist, worklist-results, or another artifact.
- Acceptance: concrete rules a checker can verify.
- Reuse: fixed Task or template with fill-in values.
- Volume: single item, unknown item discovery, or known large list.
- Per-item work: what each item should do and how each item result is judged.
- Collection policy: whether any failed/missing item should fail the parent.
- Agent roles: ask by capability only if the active Agent catalog does not make a safe default obvious.

For email/notification Tasks, ask user-facing questions such as recipient, subject, body source, cc/bcc/reply-to. Internally map these to template parameters and ports.

For worklist producer Tasks, ask about item boundary, required item information, deduplication, and how to handle ambiguous or unprocessable records.

For split-task roots, ask about the upstream list source, per-item execution goal, generated worker/checker capability, concurrency preference, and whether every item must succeed.

For worklist-producing Tasks, distinguish artifact shape from runtime handoff. The worklist JSON file must match `team/worklist-1`, and the worker's final message must be a machine-readable output reference generated by the factory, not a prose summary.

## Workflow

1. Clarify the user's goal in plain language.
2. Recommend the Task shape or small Task chain and explain why.
3. Read `GET /v1/agents`; use only active Agent profiles. Do not guess Agent ids from memory.
4. Produce a concise human-readable design summary: purpose, inputs, outputs, acceptance, roles, and any template variables.
5. If the user agrees or the design is clear enough, read `references/task-contracts.md`.
6. For normal, worklist producer, or split-task creation, build a small factory spec and run `npm run team:task-factory -- --spec <file>` to generate the full JSON preview. If the factory returns an error, correct the small spec and rerun it; do not bypass the factory.
7. For Discovery, template, clone, or update flows not covered by the factory, build the exact payload/patch from the contract reference.
8. Show the exact full JSON payload or patch preview and wait for explicit confirmation before any write API.
9. Create with `POST /v1/team/tasks`, or update with `PATCH /v1/team/tasks/:taskId`.
10. Report the returned `task.taskId`, status, and warnings. For Discovery or split-task, remind the user that generated child Tasks are created later by running the root Task.

If `workerAgentId === checkerAgentId`, or generated worker/checker are the same Agent, warn that same-Agent self-checking weakens independent acceptance. Same-Agent validation is allowed only after the user sees the tradeoff.

## Update Existing Tasks

When updating:

1. List candidates with `GET /v1/team/tasks`.
2. Read the selected Task with `GET /v1/team/tasks/:taskId`.
3. Preserve existing ports unless the user explicitly changes the IN/OUT standard.
4. Warn that changing a port id or type may break downstream connections.
5. Preserve `canvasKind`; a normal Task cannot be converted into Discovery or split-task by PATCH.
6. Show the patch preview and the intended resulting Task shape.
7. Wait for explicit confirmation, then call `PATCH /v1/team/tasks/:taskId`.

Do not patch archived Tasks or locked WorkUnits.

## Hard Rules

- Full JSON preview before every write.
- No write before user confirmation.
- No direct `.data/team` file writes.
- Do not hand-write full JSON for normal, worklist producer, or split-task creation when the Task factory can generate and validate it.
- No new backend endpoint.
- No Task run, Team Run, Plan run, worker/checker chain, Agent profile edit, skill install, model change, or browser binding change.
- No generated child Tasks in public create/update payloads.
- No `generatedSource` in public `POST /v1/team/tasks` or `PATCH /v1/team/tasks/:taskId` payloads.
- Do not ask the user to hand-author technical schemas when you can infer and preview them.

## Verification

After create/update, verify with:

- `GET /v1/team/tasks`
- `GET /v1/team/tasks/:taskId`

For Team Console UI verification, open `http://127.0.0.1:9999/`, confirm Live API, create through the iframe conversation using `/team-task`, inspect the JSON preview, explicitly confirm, and then verify the new Task appears on the canvas.

For Discovery or split-task, the created Task is only the root. Generated children appear after a future run; run quality, checker verdicts, and final reports are outside this skill.
