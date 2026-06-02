---
name: team-task-creator
description: Task design advisor / 创建向导 for Team Console Task creation. Use when the user says "/team-task" or asks in natural-language to create, update, design, or complete a Team Console Task, WorkUnit, Discovery Task, 任务卡片, or multi-platform/multi-source research task that may need generated child Tasks. Guides non-expert users from fuzzy intent to a precise normal-vs-Discovery task contract, previews full JSON, and writes only through /v1/team/tasks after confirmation. Do not use for running, observing, or debugging Tasks.
---

# Team Task Creator

Use this skill to create or update Team Console Task draft resources through the REST API. A Task is the smallest canvas orchestration node. Each Task contains exactly one WorkUnit definition. This skill only creates or updates Task drafts; it must not start implementation work or launch any Team Runtime run.

## Activation Contract

This skill has two activation paths:

- **MUST activate** when the user message contains `/team-task`.
- **MUST activate** when the user clearly asks to create or update a `Team Console Task`, `Task`, `WorkUnit`, `Discovery Task`, `任务卡片`, `发现任务`, or `工作单元`, even if they describe it in natural-language conversation instead of using `/team-task`.
- **MUST NOT activate** for requests to run a Task, observe progress, check status, debug a run, inspect performance, connect existing ports, or discuss Task concepts without creating or updating a Task draft.
- If the intent is ambiguous, ask one short clarification. You can say: "可以用 `/team-task ...` 启动 Task 创建流程。"
- Once active, stay in Task-draft mode and do not start a run.

## Product Model

- `Agent` is the smallest execution-capability unit.
- `Task` is the smallest Team Console canvas orchestration node.
- `Task.workUnit` is the single runnable contract inside that Task.
- `Task.workUnit.inputPorts` and `Task.workUnit.outputPorts` are the typed IN/OUT standard used by task-chain connections.
- A normal Task is the default canvas node. A Discovery root Task is still a Task, but its creation payload MUST include `canvasKind: "discovery"` and a valid `discoverySpec`.
- `leaderAgentId` is required. It represents the current/spec-leading Agent that talks with the user before execution, clarifies boundaries, and maintains the WorkUnit draft.
- `workerAgentId` is required. It is the Agent that will execute the WorkUnit in a future run.
- `checkerAgentId` is required. It is the Agent that will accept or reject the WorkUnit result in a future run.
- A Task is not `Plan tasks.length === 1`, not a single-task Plan, and not a TeamUnit.

## Template Task Contract

Use a template Task / 模板 Task when the user wants a reusable Task shape where only a keyword or small variable changes later, such as "域名查询模板，关键词先空出来", "后续填写关键词", "各大论坛搜索 {{keyword}} 讨论", or a reusable md-to-html utility. A template Task is still created through `POST /v1/team/tasks`; it is not a run and must not start execution.

Template placeholders must use double braces, for example `{{keyword}}`. Do not use vague blanks, Chinese brackets, or invisible empty strings. Put placeholders only in human-facing strings such as `title`, `workUnit.title`, `workUnit.input.text`, `workUnit.outputContract.text`, `workUnit.acceptance.rules`, and Discovery `discoveryGoal` / `dispatchGoal`.

Template preview payloads must include `templateConfig`:

```json
{
  "templateConfig": {
    "schemaVersion": "team/task-template-1",
    "parameters": [
      {
        "id": "keyword",
        "label": "关键词",
        "description": "后续复制或实例化时填写的查询关键词。",
        "required": true
      }
    ]
  }
}
```

When the user wants to copy / clone / 复制 / 实例化 an existing template Task, show the required `templateBindings` and wait for confirmation, then call `POST /v1/team/tasks/:taskId/clone`. Example clone payload:

```json
{ "templateBindings": { "keyword": "GLM-5.1" } }
```

For non-template utility Tasks, cloning may use only a new `title`; it still must not start a run. Generated child Tasks are Discovery-managed and must not be cloned by this skill.

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

## Guided Task Design Advisor

Act as a Task design advisor / 创建向导, not as a passive form filler. Assume the user is a non-expert / 外行 who does not know the Team Console task forms, Discovery concepts, typed ports, Agent roles, or API fields. Do not ask the user to choose between normal Task and Discovery before you have evaluated the work. You own the task-form recommendation.

First evaluate task form before collecting fields:

- Consider normal Task when the work is one bounded execution that produces one deliverable.
- Consider Discovery when the work must first discover, normalize, or split multiple items, sources, platforms, candidates, URLs, repos, accounts, products, or records before per-item execution.
- If there is a better option / 更好的选择 than the user's implied form, say so plainly and explain the rationale / 理由 in one or two sentences.
- Then guide the user through targeted clarifying questions. Do not dump a large parameter table as the first response.

Convert fuzzy intent / 口语化 or 模糊用户意图 into a precise executable task contract:

- precise goal / 精确可执行目标: what result the Task must produce.
- scope / 范围: sources, platforms, limits, exclusions, freshness, and fallback behavior when a source is unavailable.
- deliverable / 输出物 / 输出格式: Markdown report, JSON, file artifact, comparison table, or other typed output.
- acceptance / 验收: concrete rules the checker can validate.
- Agent roles: leader, worker, checker, and Discovery dispatcher/generated worker/generated checker when needed.

Ask only targeted clarifying questions for genuine choices that affect the contract. Prefer a short recommendation plus 1-3 numbered questions. If the user's intent is already enough, use sensible defaults and move to JSON preview.

For a generic multi-source feedback example:

> `/team-task 我想调研某个产品或模型在多个社区、代码托管和模型托管平台上的用户反馈和评价。`

Recommend Discovery before confirming parameters. Explain that the root Discovery Task should discover / 规范化 the platform/source items, and each generated child should research one platform/source and summarize feedback evidence. Do not present a normal Task confirmation table first, and do not treat this as a single ordinary search Task unless the user explicitly rejects Discovery. This is a task-shape rule, not a patch for any specific product, vendor, website, or platform.

## Conversational Discovery Inference

Users do not need to know, write, or spell out Discovery schema fields such as `canvasKind`, `discoverySpec`, `outputKey`, `itemIdField`, or `requiredItemFields`. Do not ask the user to write those fields. When the user describes the desired work in plain language, translate, derive, convert, and fill the technical Discovery payload yourself, then show the complete JSON preview for confirmation.

Default to Discovery when the request is naturally about discovering or splitting a set of items before per-item work:

- multi-platform or multi-source research, including "多平台", "多来源", "多个平台", "多个渠道", "各个平台", or "分别查询".
- user feedback, reviews, reputation, comparisons, or evaluations across several sources.
- discovering candidates, tools, vendors, papers, repos, products, accounts, leads, URLs, datasets, or other items that should become generated child Tasks.
- "先找一批对象，再逐个分析 / 抓取 / 验证 / 写报告" style workflows.

Example:

> `/team-task 我想调研某个产品或模型在多个社区、代码托管和模型托管平台上的用户反馈和评价。`

This should default to Discovery. The root Discovery Task discovers and normalizes the platform/source items, and each generated child Task separately researches and analyzes one platform's user feedback and evaluation evidence. Do not ask the user to author `canvasKind`, `discoverySpec`, `outputKey`, or the item schema. Keep the logic generic: the same reasoning must apply to products, models, vendors, repositories, datasets, leads, papers, accounts, or any other discoverable item set.

Use a small number of clarifying questions. Ask one or two questions at most before previewing when the remaining choices are genuinely user decisions, such as:

- Which active Agent should be root/generated worker if the Agent catalog has multiple plausible search/research Agents?
- Whether the sources are fixed to the named platforms or can expand to other relevant platforms.
- Whether the final result should be a brief comparison, a structured JSON report, or a narrative report.

If the user's language already provides enough information, do not run a long questionnaire. State the inference briefly, for example:

> 我会按 Discovery Task 来设计：root 负责发现/规范化来源项，generated child 负责逐平台搜集用户反馈和评价。下面是完整 JSON 预览，确认后我再创建。

For inferred Discovery payloads:

- Default `outputKey` to `items`.
- Default `itemIdField` to `id`.
- Default `requiredItemFields` to `["id"]`.
- Use `recommendedItemFields` that fit the domain, commonly `["title", "platform", "sourceUrl", "summary"]` for platform/source research.
- Use `workUnit.outputCheck.type: "json_items"` with the same `outputKey`.
- Use `inputPorts: []` and a JSON output port unless the user clearly needs upstream artifacts or another artifact type.
- Keep the design cross-platform and cross-Agent. Do not create special cases for a vendor, marketplace, social platform, or hosting provider.

During normal Task drafting, if the user says the work "应该用 discovery", "应该拆分", "按每个平台/每个候选项生成子任务", or otherwise asks to switch to Discovery, switch to Discovery instead of asking what Discovery means. Do not ask what Discovery means in this situation. Say that the draft will be converted to a Discovery root Task, with generated child Tasks created later by running the root. Then rebuild the JSON preview as a Discovery Task.

## Workflow

### Step 1: Confirm User Intent

Ask for the Task goal and expected deliverable before touching any write API.

Start by applying the Guided Task Design Advisor rules: evaluate whether the user's fuzzy intent is better modeled as a normal Task or Discovery Task, state the recommendation and reason, then clarify only the missing contract details.

Clarify:

- Task title
- Task kind: normal Task or Discovery Task. Infer Discovery first when the request matches the Conversational Discovery Inference rules above.
- WorkUnit input
- Typed input ports (`workUnit.inputPorts`)
- WorkUnit output contract
- Typed output ports (`workUnit.outputPorts`)
- Acceptance rules
- Preferred worker Agent
- Preferred checker Agent

For a Discovery Task, also clarify:

- Discovery goal: what the root Task must discover.
- `outputKey`: the JSON object key that will contain discovered items, defaulting to `items` when the user has no preference.
- Item schema: `requiredItemFields` must include `id`; add inferred `recommendedItemFields` only when useful.
- Dispatch goal: how each discovered item should be turned into a generated child WorkUnit.
- Root worker/checker Agents: who discovers the items and who validates the discovery result.
- `dispatcherAgentId`: who drafts generated child WorkUnits from each discovered item.
- `generatedWorkerAgentId` and `generatedCheckerAgentId`: defaults for generated child Tasks.

### Step 2: Read Agent Catalog

Before selecting or confirming roles, call:

```
GET /v1/agents
```

Use only active Agent profiles from that catalog. Do not guess Agent IDs from memory.

Do not hard-code vendor, platform, or scenario-specific Agent IDs. Match roles to the user's goal and the active Agent catalog. If the catalog does not clearly reveal capability from names/descriptions, ask the user to choose the leader/worker/checker/dispatcher/generated worker/generated checker Agents instead of inventing a platform-specific mapping.

Role defaults:

- `leaderAgentId`: default to the current conversation Agent when it appears in the catalog.
- `workerAgentId`: choose or ask for the Agent that should actually execute the WorkUnit.
- `checkerAgentId`: choose or ask for the Agent that should validate the WorkUnit output.
- Discovery `dispatcherAgentId`: choose or ask for the Agent that can convert one discovered item into a generated child WorkUnit draft.
- Discovery `generatedWorkerAgentId`: choose or ask for the Agent that should execute generated child Tasks.
- Discovery `generatedCheckerAgentId`: choose or ask for the Agent that should validate generated child Task outputs.

If `workerAgentId === checkerAgentId`, show this warning in the preview:

> 同 Agent 自检会削弱验收独立性；第一版允许这样做，但请确认这是你想要的。

For Discovery, show the same warning when any root worker/checker or generated worker/checker pair is the same Agent. Same-Agent validation is allowed, but the user must explicitly see the independence risk before confirming.

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

Discovery full Task JSON preview shape:

```json
{
  "canvasKind": "discovery",
  "title": "发现可分析的候选项目",
  "leaderAgentId": "main",
  "status": "ready",
  "workUnit": {
    "title": "发现可分析的候选项目",
    "input": {
      "text": "围绕用户给定目标发现可逐项分析的候选项目。输出必须是 JSON object，顶层 items 为数组，每个 item 至少包含稳定 id。"
    },
    "inputPorts": [],
    "outputPorts": [
      { "id": "discovery_items", "label": "发现项 JSON", "type": "json" }
    ],
    "outputContract": {
      "text": "输出 parseable JSON object，顶层 items 必须是数组；每个 item 必须包含非空字符串 id，并包含足够字段供 dispatcher 生成子任务。"
    },
    "outputCheck": {
      "type": "json_items",
      "outputKey": "items",
      "requiredFields": ["id"]
    },
    "acceptance": {
      "rules": [
        "结果必须是可解析 JSON object",
        "items 必须是数组",
        "每个 item 必须包含非空字符串 id",
        "不得把不确定事实写成已确认结论"
      ]
    },
    "workerAgentId": "search",
    "checkerAgentId": "main"
  },
  "discoverySpec": {
    "schemaVersion": "team/discovery-spec-1",
    "discoveryGoal": "发现可逐项分析的候选项目。",
    "outputKey": "items",
    "itemIdField": "id",
    "requiredItemFields": ["id"],
    "recommendedItemFields": ["title", "summary", "sourceUrl"],
    "dispatchGoal": "为每个发现项生成一个可执行、可验收的子 WorkUnit。",
    "dispatcherAgentId": "main",
    "generatedWorkerAgentId": "search",
    "generatedCheckerAgentId": "main",
    "autoRun": {
      "enabled": true,
      "concurrency": 3
    }
  }
}
```

Discovery preview rules:

- The Discovery JSON must include `canvasKind: "discovery"` and `discoverySpec`.
- `discoverySpec.schemaVersion` must be exactly `team/discovery-spec-1`.
- `discoverySpec.itemIdField` must be exactly `id`.
- `discoverySpec.requiredItemFields` must include `id`.
- `discoverySpec.autoRun.enabled` must be `true` and `discoverySpec.autoRun.concurrency` must be `3`.
- `workUnit.outputCheck.type` should be `json_items` with the same `outputKey` when the user wants runtime validation of the discovery result.
- `generatedSource` MUST NOT appear in a public create or update payload. Generated child identity is owned by the Discovery dispatcher/upsert runtime.
- Do not add a backend endpoint. Discovery root creation uses the existing `POST /v1/team/tasks`.

### Step 4: Create Task After Confirmation

Only after the user confirms the full Task JSON preview, call:

```
POST /v1/team/tasks
```

Send the exact reviewed payload. Report the returned `task.taskId`, `status`, and any API `warnings`.

For Discovery Task creation, also report that the returned Task is only the root Discovery Task. Generated child Tasks are created later by running that root Task; this skill must not manually create generated children.

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
5. For an existing Discovery root Task, preserve `canvasKind` and only patch `discoverySpec` when the user explicitly changes Discovery behavior. A normal Task cannot be converted into Discovery by PATCH.
6. Wait for explicit user confirmation.
7. Call:

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
- Discovery Tasks must include legal `canvasKind: "discovery"` and `discoverySpec`.
- Discovery `dispatcherAgentId`, `generatedWorkerAgentId`, and `generatedCheckerAgentId` must be real active Agents from `GET /v1/agents`.
- Discovery role selection must stay cross-platform and cross-Agent; do not patch around a specific vendor, site, marketplace, or platform.

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
11. Add or require a new backend endpoint for Discovery creation.
12. Put generated child Tasks into the root Task list or root canvas.
13. Hard-delete, restore, unarchive, or manually create generated child Tasks.
14. Send `generatedSource` in public `POST /v1/team/tasks` or `PATCH /v1/team/tasks/:taskId` payloads.

If the user asks to start execution, say that this skill only creates or updates Task drafts. Future Task execution is outside this skill.

## Verification

After creating or updating a Task, the user can verify with:

- `GET /v1/team/tasks`
- `GET /v1/team/tasks/:taskId`

For Team Console UI verification after creating a Discovery Task through the iframe:

1. Open `http://127.0.0.1:5174/`.
2. Confirm the data source is Live API.
3. Click `创建 Task`.
4. Select the leader Agent.
5. In the iframe conversation, use `/team-task` to create the Discovery Task.
6. Inspect the full JSON preview and explicitly confirm.
7. Return to Team Console and confirm the Discovery Task appears in the root canvas.
8. Run the Discovery Task.
9. After generated child Tasks appear, inspect the Discovery subcanvas and test generated child archive behavior.

This skill verifies Task creation and update contracts only. Run progress, worker output, checker verdicts, generated child execution quality, and final reports are outside this skill, but the user should test the real Team Console path above before treating the workflow as complete.
