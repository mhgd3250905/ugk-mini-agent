---
name: team-task-creator
description: Use when the user message contains "/team-task" or clearly asks to create, update, design, or complete a Team Console Task / WorkUnit / 任务卡片 through natural-language conversation. This skill guides the Agent through guarded Task draft creation via /v1/team/tasks, including typed IN/OUT ports for task-chain connections. Do not use for running Tasks, observing progress, debugging runs, or generic discussion that does not request Task creation or update.
---

# Team Task Creator

Use this skill to create or update Team Console Task draft resources through the REST API. A Task is the smallest canvas orchestration node. Each Task contains exactly one WorkUnit definition. This skill only creates or updates Task drafts; it must not start implementation work or launch any Team Runtime run.

## Activation Contract

This skill has two activation paths:

- **MUST activate** when the user message contains `/team-task`.
- **MUST activate** when the user clearly asks to create or update a `Team Console Task`, `Task`, `WorkUnit`, `任务卡片`, or `工作单元`, even if they describe it in natural-language conversation instead of using `/team-task`.
- **MUST NOT activate** for requests to run a Task, observe progress, check status, debug a run, inspect performance, connect existing ports, or discuss Task concepts without creating or updating a Task draft.
- If the intent is ambiguous, ask one short clarification. You can say: "可以用 `/team-task ...` 启动 Task 创建流程。"
- Once active, stay in Task-draft mode and do not start a run.

## Product Model

- `Agent` is the smallest execution-capability unit.
- `Task` is the smallest Team Console canvas orchestration node.
- `Task.workUnit` is the single runnable contract inside that Task.
- `Task.workUnit.inputPorts` and `Task.workUnit.outputPorts` are the typed IN/OUT standard used by task-chain connections.
- `leaderAgentId` is required. It represents the current/spec-leading Agent that talks with the user before execution, clarifies boundaries, and maintains the WorkUnit draft.
- `workerAgentId` is required. It is the Agent that will execute the WorkUnit in a future run.
- `checkerAgentId` is required. It is the Agent that will accept or reject the WorkUnit result in a future run.
- A Task is not `Plan tasks.length === 1`, not a single-task Plan, and not a TeamUnit.

## Typed Port Contract

Every Task draft preview and API payload must include both arrays:

- `workUnit.inputPorts`: typed artifacts this Task can receive from upstream Tasks. Use an empty array `[]` for source Tasks that do not consume an upstream artifact.
- `workUnit.outputPorts`: typed artifacts this Task can produce for downstream Tasks. Use an empty array `[]` only when the Task truly has no reusable downstream output.

Do not confuse natural-language fields with ports:

- `workUnit.input.text` tells the worker what to do.
- `workUnit.outputContract.text` tells the checker what final result to expect.
- `inputPorts` / `outputPorts` define machine-readable connection points for the canvas.

Port shape:

```json
{ "id": "source_md", "label": "Markdown 文稿", "type": "md" }
```

Port rules:

- `id` must be stable ASCII, start with a letter, and use only letters, digits, `_`, or `-`.
- `type` must be lowercase and stable, such as `md`, `html`, `json`, `text`, `csv`, `pdf`, `image`, or `audio`.
- `label` should be short user-facing text, usually Chinese.
- If the user's natural language implies a file or artifact format, infer the matching typed port before previewing JSON.
- If the format or direction is unclear, ask before previewing. Do not silently omit ports.

Common natural-language mappings:

- "选择中文古诗并输出 Markdown 文件" -> `inputPorts: []`, `outputPorts: [{ "id": "poem_md", "label": "中文古诗 Markdown", "type": "md" }]`
- "翻译中文 Markdown 文件为英文" -> `inputPorts: [{ "id": "source_md", "label": "中文 Markdown", "type": "md" }]`, `outputPorts: [{ "id": "translated_md", "label": "英文 Markdown", "type": "md" }]`
- "把 Markdown 做成 HTML 页面" -> `inputPorts: [{ "id": "source_md", "label": "Markdown 文稿", "type": "md" }]`, `outputPorts: [{ "id": "page_html", "label": "HTML 页面", "type": "html" }]`
- "整理数据并输出 JSON" -> `inputPorts` based on the source, `outputPorts: [{ "id": "result_json", "label": "结构化 JSON", "type": "json" }]`

## Workflow

### Step 1: Confirm User Intent

Ask for the Task goal and expected deliverable before touching any write API.

Clarify:

- Task title
- WorkUnit input
- Typed input ports (`workUnit.inputPorts`)
- WorkUnit output contract
- Typed output ports (`workUnit.outputPorts`)
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
  "title": "把中文 Markdown 翻译为英文 Markdown",
  "leaderAgentId": "main",
  "status": "ready",
  "workUnit": {
    "title": "把中文 Markdown 翻译为英文 Markdown",
    "input": {
      "text": "接收一份中文 Markdown 文稿，保留标题层级、列表、引用和表格结构，翻译为自然准确的英文。"
    },
    "inputPorts": [
      { "id": "source_md", "label": "中文 Markdown", "type": "md" }
    ],
    "outputPorts": [
      { "id": "translated_md", "label": "英文 Markdown", "type": "md" }
    ],
    "outputContract": {
      "text": "输出英文 Markdown 文件，保持原文结构和 Markdown 语法，不额外改写事实。"
    },
    "acceptance": {
      "rules": [
        "输出必须是 Markdown 格式",
        "必须保留原始标题层级、列表、引用和表格结构",
        "不得新增原文没有的事实或结论"
      ]
    },
    "workerAgentId": "main",
    "checkerAgentId": "main"
  }
}
```

For a source Task with no upstream input, still include `inputPorts: []`. Do not summarize the JSON as prose instead of showing it. The user must see the exact payload shape, including typed ports.

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
4. Preserve existing `inputPorts` and `outputPorts` unless the user explicitly changes the Task's IN/OUT standard. Warn when a port id or type change can break existing task-chain connections.
5. Wait for explicit user confirmation.
6. Call:

```
PATCH /v1/team/tasks/:taskId
```

Do not patch archived Tasks. Do not try to edit a locked Task's `workUnit`.

## Task Draft Rules

- `title` must be specific and non-empty.
- `leaderAgentId` must be a real active Agent from `GET /v1/agents`.
- `workUnit.title` must be specific and non-empty.
- `workUnit.input.text` must describe the actual work clearly.
- `workUnit.inputPorts` must be present in every preview and payload; use `[]` when the Task has no typed upstream input.
- `workUnit.outputPorts` must be present in every preview and payload; use `[]` only when the Task truly has no reusable typed output.
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
