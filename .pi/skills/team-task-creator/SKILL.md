---
name: team-task-creator
description: Use when and only when the user message contains the explicit keyword "/team-task". This skill guides the Agent through creating or updating Team Console Task drafts via the /v1/team/tasks REST API. If the user merely mentions "task", "任务卡片", WorkUnit, or Team Console without "/team-task", do not activate automatically; tell them they can use `/team-task ...` to start the guarded Task creation flow.
---

# Team Task Creator

Use this skill to create or update Team Console Task draft resources through the REST API. A Task is the smallest canvas orchestration node. Each Task contains exactly one WorkUnit definition. This skill only creates or updates Task drafts; it must not start implementation work or launch any Team Runtime run.

## Activation Contract

This skill has a strict activation keyword:

- **MUST activate** when the user message contains `/team-task`.
- **MUST NOT activate automatically** when the user only mentions `task`, `Task`, `任务`, `任务卡片`, `WorkUnit`, `Team Console`, or "我想做个任务".
- If the user expresses an intent to create a Task without `/team-task`, reply briefly: "可以用 `/team-task ...` 启动 Task 创建流程。" Do not create or update anything yet.
- Treat `/team-task` as an intent boundary. Once active, stay in Task-draft mode and do not start a run.

## Product Model

- `Agent` is the smallest execution-capability unit.
- `Task` is the smallest Team Console canvas orchestration node.
- `Task.workUnit` is the single runnable contract inside that Task.
- `leaderAgentId` is required. It represents the current/spec-leading Agent that talks with the user before execution, clarifies boundaries, and maintains the WorkUnit draft.
- `workerAgentId` is required. It is the Agent that will execute the WorkUnit in a future run.
- `checkerAgentId` is required. It is the Agent that will accept or reject the WorkUnit result in a future run.
- A Task is not `Plan tasks.length === 1`, not a single-task Plan, and not a TeamUnit.

## Workflow

### Step 1: Confirm User Intent

Ask for the Task goal and expected deliverable before touching any write API.

Clarify:

- Task title
- WorkUnit input
- WorkUnit output contract
- Acceptance rules
- Preferred worker Agent
- Preferred checker Agent

### Step 2: Read Agent Catalog

Before selecting or confirming roles, call:

```
GET /v1/agents
```

Use only active Agent profiles from that catalog. Do not guess Agent IDs from memory.

Role defaults:

- `leaderAgentId`: default to the current conversation Agent when it appears in the catalog.
- `workerAgentId`: choose or ask for the Agent that should actually execute the WorkUnit.
- `checkerAgentId`: choose or ask for the Agent that should validate the WorkUnit output.

If `workerAgentId === checkerAgentId`, show this warning in the preview:

> 同 Agent 自检会削弱验收独立性；第一版允许这样做，但请确认这是你想要的。

### Step 3: Preview Full Task JSON

Before calling `POST /v1/team/tasks` or `PATCH /v1/team/tasks/:taskId`, show the user the full Task JSON preview and wait for explicit confirmation.

Creation preview shape:

```json
{
  "title": "调查 Medtrum 相关云服务器资产",
  "leaderAgentId": "main",
  "status": "ready",
  "workUnit": {
    "title": "调查 Medtrum 相关云服务器资产",
    "input": {
      "text": "围绕 Medtrum 相关公开云服务器资产进行搜索和证据整理，区分官方、第三方和可疑线索。"
    },
    "outputContract": {
      "text": "输出中文 Markdown 报告，包含发现列表、证据来源、归类判断、风险说明和不确定项。"
    },
    "acceptance": {
      "rules": [
        "每条发现必须包含来源或搜索线索",
        "必须区分官方、第三方、可疑和证据不足",
        "不确定项不能编造成结论"
      ]
    },
    "workerAgentId": "search",
    "checkerAgentId": "main"
  }
}
```

Do not summarize the JSON as prose instead of showing it. The user must see the exact payload shape.

### Step 4: Create Task After Confirmation

Only after the user confirms the full Task JSON preview, call:

```
POST /v1/team/tasks
```

Send the exact reviewed payload. Report the returned `task.taskId`, `status`, and any API `warnings`.

### Step 5: Update Existing Task After Confirmation

If the user wants to update an existing Task:

1. List candidates:

```
GET /v1/team/tasks
```

2. Read the selected Task:

```
GET /v1/team/tasks/:taskId
```

3. Show the full patch preview and the resulting intended Task shape.
4. Wait for explicit user confirmation.
5. Call:

```
PATCH /v1/team/tasks/:taskId
```

Do not patch archived Tasks. Do not try to edit a locked Task's `workUnit`.

## Task Draft Rules

- `title` must be specific and non-empty.
- `leaderAgentId` must be a real active Agent from `GET /v1/agents`.
- `workUnit.title` must be specific and non-empty.
- `workUnit.input.text` must describe the actual work clearly.
- `workUnit.outputContract.text` must describe the expected output format and required content.
- `workUnit.acceptance.rules` must contain at least one concrete, checkable rule.
- `workUnit.workerAgentId` must be a real active Agent from `GET /v1/agents`.
- `workUnit.checkerAgentId` must be a real active Agent from `GET /v1/agents`.
- Use `status: "drafting"` while details are still being clarified.
- Use `status: "ready"` only when the user agrees the WorkUnit contract is ready for future execution.

## Prohibitions

This skill MUST NOT:

1. Start a Task run.
2. Create a Team Run.
3. Call `POST /v1/team/plans/:planId/runs`.
4. Create a Plan as a substitute for a Task.
5. Treat a Task as `Plan tasks.length === 1`.
6. Directly write `.data/team` or `.data/team/tasks/*.json`.
7. Create, edit, archive, or otherwise modify Agent profile data.
8. Install skills, change models, or change browser binding.
9. Call any worker/checker execution chain.
10. Write to the API before the user confirms the full Task JSON preview.

If the user asks to start execution, say that this skill only creates or updates Task drafts. Future Task execution is outside this skill.

## Verification

After creating or updating a Task, the user can verify with:

- `GET /v1/team/tasks`
- `GET /v1/team/tasks/:taskId`

This skill does not verify run progress, worker output, checker verdicts, or final reports. Those are outside its scope.
