# Team Task Contracts Reference

Load this reference after the user-facing design is clear and before showing a full JSON preview or calling Team Task write APIs.

## Contents

- Common Task payload
- Task factory
- Template parameters
- Typed ports
- Discovery root
- Worklist producer
- Split-task root
- Create/update APIs

## Task Factory

Use the factory for `normal`, `worklist-producer`, and `split-task` creation. The factory returns a validated full `POST /v1/team/tasks` payload; show that payload to the user before writing.

Preview:

```bash
npm run team:task-factory -- --spec task-spec.json
```

Apply after explicit user confirmation:

```bash
npm run team:task-factory -- --spec task-spec.json --apply
```

Worklist producer factory spec:

```json
{
  "kind": "worklist-producer",
  "title": "糖尿病新闻分批打包",
  "leaderAgentId": "main",
  "workerAgentId": "team-worker",
  "checkerAgentId": "team-checker",
  "sourceDescription": "上游 Discovery 输出的大 JSON 新闻集合。",
  "itemBoundary": "按原始新闻条目分组。",
  "batchSize": 20
}
```

The factory adds the runtime handoff protocol automatically: the worker must write the completed worklist to `output/worklist.json` and make its final output message the JSON reference `{"outputPath":"output/worklist.json"}`. Do not remove this rule from the preview, even when adding custom acceptance rules.

Split-task factory spec:

```json
{
  "kind": "split-task",
  "title": "糖尿病新闻分批标准化",
  "leaderAgentId": "main",
  "workerAgentId": "team-worker",
  "checkerAgentId": "team-checker",
  "worklistDescription": "接收上游 worklist，每个 item 是最多 20 条新闻。",
  "dispatchGoal": "只处理当前 item 内的新闻，输出标准化 JSON 数组。",
  "concurrency": 3
}
```

Factory errors are correction signals. Fix the small spec and rerun the factory; do not bypass it by writing `.data/team` or hand-authoring a replacement payload.

## Common Task Payload

Every Task draft preview and API payload includes one WorkUnit:

```json
{
  "title": "把中文 Markdown 翻译为英文 Markdown",
  "leaderAgentId": "main",
  "status": "ready",
  "workUnit": {
    "title": "把中文 Markdown 翻译为英文 Markdown",
    "input": { "text": "接收一份中文 Markdown 文稿，保留结构并翻译为英文。" },
    "inputPorts": [{ "id": "source_md", "label": "中文 Markdown", "type": "md" }],
    "outputPorts": [{ "id": "translated_md", "label": "英文 Markdown", "type": "md" }],
    "outputContract": { "text": "输出英文 Markdown 文件，保持原文结构和 Markdown 语法。" },
    "acceptance": { "rules": ["输出必须是 Markdown 格式", "必须保留标题层级、列表、引用和表格结构"] },
    "workerAgentId": "team-worker",
    "checkerAgentId": "team-checker"
  }
}
```

Draft rules:

- `title`, `workUnit.title`, `workUnit.input.text`, and `workUnit.outputContract.text` must be specific and non-empty.
- `leaderAgentId`, `workerAgentId`, and `checkerAgentId` must be active Agents from `GET /v1/agents`.
- `workUnit.inputPorts` and `workUnit.outputPorts` must always be present; use `[]` when there is no typed upstream input or downstream output.
- `workUnit.acceptance.rules` must contain at least one concrete, checkable rule.
- Use `status: "drafting"` while details are still being clarified and `status: "ready"` only when the user agrees the contract is ready.

## Template Parameters

Use `templateConfig.schemaVersion: "team/task-template-1"` when the Task is reusable and some values will be filled later.

```json
{
  "templateConfig": {
    "schemaVersion": "team/task-template-1",
    "parameters": [
      { "id": "keyword", "label": "关键词", "required": true, "inputType": "text" }
    ]
  }
}
```

Supported `inputType` values: `text`, `textarea`, `email`, `email_list`, `number`, `select`. For `select`, include non-empty `options`. Use placeholders only in human-facing strings. For email or notification Tasks, prefer template parameters such as `recipients` with `inputType: "email_list"` and placeholder `{{recipients}}`, plus `subject` with `inputType: "text"` and placeholder `{{subject}}`, instead of hard-coding repeated delivery values.

Existing template clone path:

```json
{ "templateBindings": { "keyword": "GLM-5.1" } }
```

Call `POST /v1/team/tasks/:taskId/clone` only when the user explicitly asks to copy / clone / 实例化 an existing template Task. Running an existing template is outside this skill.

## Typed Ports

Port shape:

```json
{ "id": "source_md", "label": "Markdown 文稿", "type": "md" }
```

Rules:

- `id` is stable ASCII, starts with a letter, and uses only letters, digits, `_`, or `-`.
- `type` is lowercase and stable, such as `md`, `html`, `json`, `text`, `csv`, `pdf`, `image`, `audio`, `worklist`, or `worklist-results`.
- `label` is short user-facing text, usually Chinese.

Mappings:

- "选择中文古诗并输出 Markdown 文件" -> `inputPorts: []`, `outputPorts: [{ "id": "poem_md", "label": "中文古诗 Markdown", "type": "md" }]`
- "翻译中文 Markdown 文件为英文" -> input `source_md:md`, output `translated_md:md`
- "把 Markdown 做成 HTML 页面" -> input `source_md:md`, output `page_html:html`
- "整理数据并输出 JSON" -> output `result_json:json`
- "把上游大 JSON 拆成待处理清单" -> output `worklist:worklist`
- "按清单逐项处理并汇总" -> input `worklist:worklist`, output `results:worklist-results`, with a split-task root

## Discovery Root

Use a Discovery root when the first step is to discover unknown items before per-item work. Public create payload uses existing `POST /v1/team/tasks`; do not add a backend endpoint.

```json
{
  "canvasKind": "discovery",
  "title": "发现可分析的候选项目",
  "leaderAgentId": "main",
  "status": "ready",
  "workUnit": {
    "title": "发现可分析的候选项目",
    "input": { "text": "围绕用户目标发现可逐项分析的候选项目；输出 JSON object，顶层 items 为数组。" },
    "inputPorts": [],
    "outputPorts": [{ "id": "discovery_items", "label": "发现项 JSON", "type": "json" }],
    "outputContract": { "text": "输出 parseable JSON object；items 是数组；每个 item 有非空字符串 id。" },
    "outputCheck": { "type": "json_items", "outputKey": "items", "requiredFields": ["id"] },
    "acceptance": { "rules": ["结果必须是可解析 JSON object", "items 必须是数组", "每个 item 必须包含非空字符串 id"] },
    "workerAgentId": "team-worker",
    "checkerAgentId": "team-checker"
  },
  "discoverySpec": {
    "schemaVersion": "team/discovery-spec-1",
    "discoveryGoal": "发现可逐项分析的候选项目。",
    "outputKey": "items",
    "itemIdField": "id",
    "requiredItemFields": ["id"],
    "recommendedItemFields": ["title", "summary", "sourceUrl"],
    "dispatchGoal": "为每个发现项生成一个可执行、可验收的子 WorkUnit。",
    "dispatcherAgentId": "team-dispatcher",
    "generatedWorkerAgentId": "team-worker",
    "generatedCheckerAgentId": "team-checker",
    "autoRun": { "enabled": true, "concurrency": 3 }
  }
}
```

Rules:

- `discoverySpec.schemaVersion` is exactly `team/discovery-spec-1`.
- `discoverySpec.itemIdField` is exactly `id`.
- `discoverySpec.requiredItemFields` includes `id`.
- `discoverySpec.autoRun.enabled` is `true`; default `concurrency` is `3`.
- `dispatcherAgentId`, `generatedWorkerAgentId`, and `generatedCheckerAgentId` must be active Agents.
- `generatedSource` must not appear in public create/update payloads.

## Worklist Producer

Use a normal Task that produces a `worklist` when known upstream input must be standardized before fan-out.

Output must validate as `team/worklist-1`:

- `schemaVersion: "team/worklist-1"`
- `worklistId`
- `title`
- non-empty `items`
- each item has stable `id`, `title`, `input`, and optional `acceptanceHints`

Payload rules:

- `canvasKind` stays absent or normal.
- `workUnit.outputPorts` contains `{ "id": "worklist", "label": "处理清单", "type": "worklist" }`.
- `workUnit.outputCheck` is `{ "type": "worklist" }`.
- The output contract requires no missing items, no duplicates, and explicit handling of ambiguous or unprocessable records.
- Artifact shape and runtime handoff are separate: the JSON file content must validate as `team/worklist-1`, and the worker's final message must be the machine-readable reference `{"outputPath":"output/worklist.json"}`.
- The worklist producer should write the canonical file to `output/worklist.json`; avoid prose-only final messages such as "任务完成，文件已生成".

## Split-task Root

Use a split-task root when a validated worklist should be distributed item-by-item, checked independently, and collected with full coverage.

```json
{
  "canvasKind": "split-task",
  "title": "按清单逐项处理并汇总",
  "leaderAgentId": "main",
  "status": "ready",
  "workUnit": {
    "title": "按清单逐项处理并汇总",
    "input": { "text": "接收标准 worklist，按每个 item 创建子任务并收集结果。" },
    "inputPorts": [{ "id": "worklist", "label": "处理清单", "type": "worklist" }],
    "outputPorts": [{ "id": "results", "label": "分片处理结果", "type": "worklist-results" }],
    "outputContract": { "text": "输出 team/worklist-results-1 JSON，必须覆盖输入 worklist 的全部 item。" },
    "outputCheck": { "type": "worklist_results", "requireFullCoverage": true },
    "acceptance": { "rules": ["每个输入 item 必须有对应结果", "不得混入清单外 item"] },
    "workerAgentId": "team-worker",
    "checkerAgentId": "team-checker"
  },
  "splitTaskSpec": {
    "schemaVersion": "team/split-task-spec-1",
    "inputPortId": "worklist",
    "outputPortId": "results",
    "dispatchGoal": "按每个清单 item 独立执行并提交结构化结果。",
    "generatedWorkerAgentId": "team-worker",
    "generatedCheckerAgentId": "team-checker",
    "autoRun": { "enabled": true, "concurrency": 3 },
    "collectPolicy": { "requireAllItemsSucceeded": true, "requireFullCoverage": true }
  }
}
```

Rules:

- `splitTaskSpec.schemaVersion` is exactly `team/split-task-spec-1`.
- `splitTaskSpec.inputPortId` references a `workUnit.inputPorts` entry whose type is `worklist`.
- `splitTaskSpec.outputPortId` references a `workUnit.outputPorts` entry whose type is `worklist-results`.
- `generatedWorkerAgentId` and `generatedCheckerAgentId` must be active Agents.
- `splitTaskSpec.autoRun.enabled` defaults to `true`; default `concurrency` is `3`.
- `splitTaskSpec.collectPolicy.requireAllItemsSucceeded` and `requireFullCoverage` default to `true`.
- `generatedSource` must not appear in public create/update payloads.

## Create/Update APIs

Create:

```http
POST /v1/team/tasks
```

Update:

```http
PATCH /v1/team/tasks/:taskId
```

Inspect:

```http
GET /v1/team/tasks
GET /v1/team/tasks/:taskId
GET /v1/agents
```

Never call `POST /v1/team/plans/:planId/runs` from this skill.
