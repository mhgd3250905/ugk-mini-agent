---
name: conn-orchestrator
description: 用于提醒、定时任务、周期总结、后台自动执行和一次性延迟执行。通过 `conn` 工具直接管理任务，而不是发明关键字匹配器或表单式追问。
---

# Conn Orchestrator

## 何时使用

当用户表达下面这些意图时，优先使用这个技能：

- “明天提醒我……”
- “每天 / 每周 / 每月帮我……”
- “隔一段时间自动跑一次……”
- “到点后把结果发给我……”
- “查一下我的后台任务 / 定时任务 / conn”
- “暂停 / 恢复 / 删除某个后台任务”
- “这个任务最近跑过没有”
- “看一下上一次执行结果”

## 核心原则

1. 直接依赖 agent 的正常语言理解能力和 `conn` 工具，不要搞关键字命中、正则路由、意图枚举这种低级活。
2. 默认把结果投递到任务消息 / 全局通知。
3. 如果用户刚上传或复用了文件，并且希望任务后续继续使用这些资料，要把当前回合可见的 `assetRefs` 一起传给 `conn`，不要要求用户手填资源 ID。
4. 如果时间表达不清楚，只追问一个最小必要问题，不要把用户拖进配置地狱。
5. 每次创建、更新、暂停、恢复、删除或立即执行后，都给用户一个简洁结果摘要。
6. 涉及执行 Agent 的写操作，必须先复述意图并等待确认。

## 调度映射

- 一次性任务：`schedule.kind = "once"`
- 固定间隔任务：`schedule.kind = "interval"`，用 `everyMs`
- 每天固定时间：使用 `schedule.kind = "cron"`，表达式形如 `0 7 * * *`
- 如果用户明确提到时区，必须传对应 IANA `timezone`
- 如果用户没有单独指定时区，默认按用户当前口径使用 `Asia/Shanghai`，不要沿用容器 / 宿主机时区
- `once.at` 和 `interval.startAt` 如果来自用户的本地时间表达，优先传不带 `Z` 的本地 wall-clock 字符串，并同时传 `timezone: "Asia/Shanghai"`；例如北京时间下午 1 点应传 `at: "2026-04-23T13:00:00", timezone: "Asia/Shanghai"`，由后端归一化成 UTC `05:00`
- 如果你已经明确算出了 UTC 时间，可以传带 `Z` 的 ISO 字符串；但不要把用户说的北京时间 13:00 直接写成 `13:00Z`

## 目标映射

- 默认目标：任务消息 `target = { type: "task_inbox" }`；也可以省略 `target`，由工具默认补齐。
- Legacy 会话目标仅用于读取或维护旧任务；不要为新任务编造 `conversationId`。

新建任务使用任务消息目标。

## 文件与资料

如果用户在当前回合附带了文件、复用文件或明确说“用我刚选的资料”，要这样处理：

- 从当前输入上下文里读取这些资料对应的 `assetRefs`
- 创建或更新 `conn` 时把 `assetRefs` 一起传给 `conn` 工具
- 不要让用户手填内部资源 ID
- 不要把文件内容硬塞回 prompt 正文里冒充“已保存”

## 执行 Agent 映射

Conn 支持选择执行 Agent。自然语言配置时不要发明新字段，直接使用现有字段：

- “用某某 agent 跑这个任务” -> `profileId`

写入前必须先查事实源：

- `GET /v1/agents`：确认目标 Agent profile 存在。
- `conn(action="get", connId=...)` 或 `GET /v1/conns/:connId`：更新已有任务前先确认当前配置。

写操作确认模板：

```text
我理解你要做的是：

- 目标对象：<Conn 标题 / connId>
- 操作：<创建任务 / 修改执行 Agent>
- 执行 Agent：<profileId>
- 影响范围：只影响后续 run
- 不会做的事：不影响正在运行中的任务

请确认是否执行。
```

默认不要在普通对话里直接调用 `conn(action="create" | "update", ...)` 或对应 HTTP API 写入执行 Agent 变更；必须先复述目标对象、目标 Agent 和影响范围，等待用户确认。完成后必须重新查询 conn，确认 `profileId` 已按预期保存。

浏览器配置不属于 Conn 自然语言编排能力。不要查询、透露或修改浏览器实例、浏览器绑定字段或 Chrome profile 信息。用户要求“给这个任务换浏览器 / 绑定 Chrome / 跟随某个浏览器”时，只能说明：这项配置需要用户在 Playground 的 Conn 编辑界面手动设置。

不要通过 Conn 编排流程执行这些动作：

- 编辑 conn SQLite。
- 绕过 `conn` 工具或 `/v1/conns` API 直接改存储。

## Conn 运行时文件契约

后台 conn run 会获得这些环境变量：

- `INPUT_DIR`：本次 run 的输入文件快照，只用于读取。
- `WORK_DIR`：本次 run 的临时中间产物，不保证跨 run 可用。
- `OUTPUT_DIR`：本次 run 的最终交付产物；写在这里的文件会被平台索引，并展示给用户。
- `LOGS_DIR`：本次 run 的日志目录。
- `CONN_SHARED_DIR`：同一个 conn 跨多次 run 的私有持久化目录。
- `CONN_PUBLIC_DIR`：同一个 conn 的长期公开文件目录，适合放稳定 URL 要访问的 HTML、JSON、图片等公开产物。
- `CONN_PUBLIC_BASE_URL`：`CONN_PUBLIC_DIR` 对应的公开 URL 前缀。
- `CONN_OUTPUT_BASE_URL`：本次 run 的 `OUTPUT_DIR` 对应 URL 前缀。
- `SITE_PUBLIC_DIR`：可选；多个 conn 共同维护同一个站点时使用的站点级公开目录。
- `SITE_PUBLIC_BASE_URL`：可选；`SITE_PUBLIC_DIR` 对应的公开 URL 前缀。
- `ARTIFACT_PUBLIC_DIR`：本次 run 的官方产物交付目录。开启产物交付保障后，系统会在 Agent 执行完毕后自动验证此目录，确保文件存在且格式正确。

跨 run 状态必须写入 `CONN_SHARED_DIR`，例如：

- 去重历史
- 冷却时间戳
- 游标 / checkpoint
- 审计记录
- 最近处理过的 ID

不要把跨 run 状态写到：

- `/tmp`
- `/app/runtime`
- `/app/runtime/skills-user`
- `OUTPUT_DIR`

`runtime/skills-user` 只放技能代码和技能资源，不是数据库。`OUTPUT_DIR` 只放用户可见的本次结果，不要塞内部状态。

如果文件需要一个长期稳定公开 URL，写入 `CONN_PUBLIC_DIR`，然后用 `CONN_PUBLIC_BASE_URL/<path>` 输出链接。不要把私有状态放进 `CONN_PUBLIC_DIR`。

如果用户明确要求多个 conn 周期性维护同一个网站，任务需要配置同一个 `publicSiteId`，运行时会提供 `SITE_PUBLIC_DIR` 和 `SITE_PUBLIC_BASE_URL`。这种站点目录只放最终公开网站文件，不放 token、cookie、游标、checkpoint 或审计记录。

## 推荐工具动作

- 创建任务：`conn(action="create", ...)`
- 查看列表：`conn(action="list")`
- 查看单个任务：`conn(action="get", connId=...)`
- 更新任务：`conn(action="update", connId=..., ...)`
- 暂停任务：`conn(action="pause", connId=...)`
- 恢复任务：`conn(action="resume", connId=...)`
- 删除任务：`conn(action="delete", connId=...)`
- 立即执行：`conn(action="run_now", connId=...)`
- 查看最近运行：`conn(action="list_runs", connId=...)`
- 查看单次运行详情：`conn(action="get_run", connId=..., runId=...)`

## 创建任务时最少要确认的事

创建 `conn` 前，至少明确这四件事：

- 任务要做什么
- 什么时间执行
- 执行一次还是周期执行
- 结果发到哪里

如果用户没给标题：

- 自动生成一个短标题，要求清楚、可识别
- 不要写成废话，比如“任务 1”“新的后台任务”

## 对用户的回报格式

每次操作后至少回报这些信息：

- `connId`
- 标题
- schedule
- target
- 当前状态
- `nextRunAt`，如果有

如果用户问“上次跑得怎么样”：

- 先查 `list_runs`
- 必要时再查 `get_run`
- 不要靠猜

## 产物交付保障

Conn 支持产物交付保障（artifact delivery validation）。开启后，系统会在 Agent 执行完毕后自动检查产物目录，确保文件存在且格式正确。如果验证失败且配置了修复次数，系统会自动让 Agent 修复后重试。

### 何时建议开启

- 任务需要生成 HTML 网页、Excel、PDF、CSV 等文件给用户
- 产物质量关键，不能接受空文件或格式错误
- Agent 偶尔会忘记写文件或写错位置

### 创建 / 更新任务时的配置

`artifactDelivery` 字段控制产物交付保障：

```json
{
  "artifactDelivery": {
    "enabled": true,
    "expectedKind": "web",
    "repairMaxAttempts": 2
  }
}
```

- `enabled`：是否开启验证
- `expectedKind`：期望产物类型，可选值 `auto`（自动判断）、`web`、`xlsx`、`pdf`、`csv`、`markdown`、`file`
- `repairMaxAttempts`：验证失败时自动修复的最大次数（0-3，默认 2）

### 产物目录与 OUTPUT_DIR 的区别

- `OUTPUT_DIR`：传统的交付目录，文件会被索引展示给用户
- `ARTIFACT_PUBLIC_DIR`：官方产物交付目录，开启产物保障后使用此目录

两者都是合法的交付位置。`ARTIFACT_PUBLIC_DIR` 的优势是系统会自动验证内容，并可通过专用的产物路由（`/v1/conns/:connId/runs/:runId/artifacts/*`）访问。

### Agent 写产物的指引

在 prompt 中引导 Agent 把最终产物写入 `ARTIFACT_PUBLIC_DIR`：

- 网页类：放入完整的 `index.html` 及所有本地 CSS/JS/图片
- Excel/PDF/CSV：直接放入文件
- 多文件：都可以放，系统会扫描整个目录

系统会自动在 prompt 里注入 `ARTIFACT_PUBLIC_DIR` 路径和相关指引，不需要手动拼路径。

### 自然语言触发

当用户表达这些意图时，可以考虑开启产物交付保障：

- "确保产出文件"/"要检查产出文件"
- "生成报告并验证"/"保证文件没问题"
- "生成网页，确保能打开"

不要默认开启。只在用户明确要求或任务明显需要产出文件时才建议开启。

## 禁止事项

- 不要发明独立的“conn 文本命令系统”
- 不要让用户手输内部 `assetId`
- 新建任务使用任务消息作为默认目标
- 不要猜测、编造或依赖当前 `conversationId` 来创建后台任务
- 不要把内部执行过程中的瞬时报错夸大成最终失败
