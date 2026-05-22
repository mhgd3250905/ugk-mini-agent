# Runtime / Assets / Conn / Feishu

更新时间：`2026-05-11`

这份文档只讲四类运行能力：

- 文件上传与统一资产库
- `assetRefs`、`ugk-file`、`send_file`
- `conn` 定时 / 周期任务
- Agent Activity / 任务消息时间线
- Feishu WebSocket 接入

如果你要查 playground 视觉和交互，去看 [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)。

## 1. 统一资产体系

当前项目不再把“用户上传文件”和“agent 产出文件”拆成两套逻辑，而是统一进入 `AssetStore`。

关键事实：

- 用户上传文件会注册为资产，可被后续 `assetRefs` 复用
- `POST /v1/assets/upload` 是浏览器侧标准文件上传入口，使用 `multipart/form-data` / `FormData` 注册可复用资产，供 `conn` 编辑器或后续会话继续选用
- `GET /v1/assets` 保留资产列表查询；`POST /v1/assets` 不再接受 JSON `attachments` 上传，浏览器上传不要再让 PDF / Word 先 base64 膨胀再塞 JSON
- 上传限制当前按“单文件 64MiB、一次最多 5 个文件、生产 nginx 总请求 80m”收口
- agent 回复中的 `ugk-file` 会被提取并写入资产库
- agent 生成了真实文件时，优先通过 `send_file` 交付
- `/v1/files/:fileId` 负责文件内容返回
- `/v1/assets` 与 `/v1/assets/:assetId` 提供资产元数据
- `DELETE /v1/assets/:assetId` 删除指定资产。删除会移除资产索引记录；如果该资产的 blob 内容没有被其他资产记录复用，后端会同步删除物理 blob。删除不存在的资产返回 `404`。
- `AssetStore` 的 `asset-index.json` 写入走进程内串行队列，并通过同目录临时文件 + `rename` 原子替换落盘；主 chat 上传、`conn` 上传和 agent `send_file` / `ugk-file` 输出即使在同一进程内并发写入，也不能互相覆盖资产索引记录。不要把它退回成普通 `readIndex()` + `writeFile()`，那是并发丢资产记录的老坑。
- `AssetStore` 读 `asset-index.json` 时会先规整条目：畸形条目不会进入资产列表，`createdAt` 不是字符串的记录不会参与排序；`hasContent=true` 但 `blobPath` 不在 blobs 目录内的记录会降级为仅元数据资产，不暴露 `/v1/files/:fileId` 下载链接。不要把文件库恢复成“读到什么就展示什么”，那是在邀请坏索引把前端拖进 404 表演。
- Playground 文件库中的“删除”按钮只删除资产库记录与可安全删除的 blob，不会回写或改写历史聊天消息、后台任务历史、任务消息文本或已经生成的外部引用。历史里曾经引用过的 `assetId` 删除后不能再作为后续 `assetRefs` 复用，这正是删除的真实语义。

关键入口：

- [src/agent/asset-store.ts](/E:/AII/ugk-pi/src/agent/asset-store.ts)
- [src/routes/files.ts](/E:/AII/ugk-pi/src/routes/files.ts)
- [src/agent/file-artifacts.ts](/E:/AII/ugk-pi/src/agent/file-artifacts.ts)
- [src/agent/agent-file-history.ts](/E:/AII/ugk-pi/src/agent/agent-file-history.ts)
- [.pi/extensions/send-file.ts](/E:/AII/ugk-pi/.pi/extensions/send-file.ts)

## 2. 文件交付协议

`src/agent/file-artifacts.ts` 会给每轮 prompt 注入统一协议。

当前口径：

- agent 内部允许使用 `/app/...` 和 `file:///app/...` 做本地 artifact 引用
- 如果用户要在浏览器里打开产物，运行时负责把受支持的本地路径桥接成 HTTP
- 如果用户要拿到真实文件，优先使用 `send_file`
- `ugk-file` 只作为小文本文件兜底

这层协议不只是“告诉 agent 怎么说”，还对应真实实现：

- [src/agent/file-artifacts.ts](/E:/AII/ugk-pi/src/agent/file-artifacts.ts) 负责协议与用户可见文本重写
- [src/agent/agent-file-history.ts](/E:/AII/ugk-pi/src/agent/agent-file-history.ts) 负责把 `send_file` 工具结果规范化为 agent 文件与历史消息文件卡片，并合并去重
- [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts) 负责在正文、流式增量、工具输出里应用重写
- [src/routes/files.ts](/E:/AII/ugk-pi/src/routes/files.ts) 提供 `GET /v1/local-file?path=...`

## 3. `send_file`

`send_file` 是正式文件交付通道，不是聊天框 base64 搬运工。

适用场景：

- 图片、PDF、压缩包、报告等真实文件
- agent 已经在项目目录生成了目标文件
- 用户明确说“把文件发给我”

数据流：

1. agent 调用 `send_file`
2. 工具校验路径必须位于项目根目录内
3. 文件以 Buffer 形式写入资产库
4. `AgentService` 通过 `agent-file-history` 从 `tool_execution_end` 中提取文件元数据
5. `done.files` 返回给前端
6. playground 渲染文件卡片
7. canonical conversation history 也会把这些 `send_file` 结果挂回对应 assistant 消息；如果这一轮只有 `toolResult(send_file)`、没有可挂载的 assistant 正文，后端会补一条 synthetic assistant history entry 承载文件，避免文件卡片在刷新或晚到的 state 回包后凭空消失

关键约束：

- 只允许项目目录内文件
- 不允许路径穿越
- 不要再让 agent 手动 `cat | base64`

关键入口：

- [.pi/extensions/send-file.ts](/E:/AII/ugk-pi/.pi/extensions/send-file.ts)
- [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
- [src/agent/asset-store.ts](/E:/AII/ugk-pi/src/agent/asset-store.ts)

## 4. 本地 artifact 浏览器桥接

宿主浏览器打不开容器里的 `file:///app/...`，这不是用户的错，也不该靠 agent 临时记忆规避。

现在的正式出口是：

```text
GET /v1/local-file?path=...
```

支持的本地路径语义：

- `/app/public/...`
- `/app/runtime/...`
- `file:///app/public/...`
- `file:///app/runtime/...`
- `public/...`
- `runtime/...`

注意区别：

- agent 内部：允许继续用本地路径
- 用户可见文本：运行时会自动改写成宿主可访问的 `/v1/local-file?path=...`
- 已经是 `/v1/local-file?path=...` 的用户可见链接不能再次被路径重写器包一层；如果历史消息里出现 `path=http://.../v1/local-file?path=...` 这类双层链接，`/v1/local-file` 会拆出内层真实 artifact 路径后再按白名单服务
- 用户拿真实文件：优先 `send_file`

## 5. 文件预览与下载

`/v1/files/:fileId` 现在分开处理预览和下载：

- 默认按 MIME 决定 `inline` 或 `attachment`
- `.md`、`.txt`、`.csv`、`.json`、`.xml`、`.yaml`、`.js`、`.svg` 这类文本型资产通过 `/v1/files/:fileId` 预览时必须带 `charset=utf-8`；否则中文 Markdown 在浏览器里打开时可能被当成错误编码解读，乱码别甩锅给 agent
- 强制下载使用 `?download=1`
- 中文文件名通过 `filename` + `filename*` 处理

playground 卡片当前规则：

- 图片 / PDF / txt / md / json / csv 这类有“打开”
- 所有文件都有“下载”

## 5.1 web-access 生命周期清理

- browser cleanup scope 现在收口为“稳定的会话级 scope”，不再给每轮 run 拼随机后缀；否则一旦某轮 finally 没跑干净，后续谁也不知道该去清哪批残页
- `AgentService` 会在真正 `session.prompt(...)` 前先对当前会话 scope 做一次预清理，把之前漏掉的旧页面先扫掉
- 正常完成、报错或中断后，`AgentService` 仍会在 `finally` 里 best-effort 调用 `closeBrowserTargetsForScope(scope)`，收尾清理本轮页面
- 这层清理是“补强现有稳定链路”，不是重写技能；清理失败只记 warn，不覆盖原始任务结果
- 关键入口：
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [src/agent/browser-cleanup.ts](/E:/AII/ugk-pi/src/agent/browser-cleanup.ts)
  - [test/browser-cleanup.test.ts](/E:/AII/ugk-pi/test/browser-cleanup.test.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)

## 6. `conn`

创建 / 更新 `conn` 时，当前也支持这几类运行时索引字段：
- `profileId`
- `browserId`
- `agentSpecId`
- `skillSetId`
- `modelProvider` / `modelId`
- `modelPolicyId`（旧任务和底层策略兼容）
- `upgradePolicy`
- `artifactDelivery`：可选 artifact 交付验证配置，启用后 run 完成时验证 `artifact-public/` 目录产物合规性，未通过则自动修复重试

这些字段的作用是让后台 worker 在真正执行时，按 ID 解析当前 agent 规范、skill 集和任务级模型选择，而不是把整套运行时定义硬编码进 conn 本身。

运行时 Agent 通过 `.pi/skills/conn-orchestrator/SKILL.md` 使用自然语言创建或更新 conn 时，也必须走同一套字段和接口，不允许发明新的“文本命令系统”。执行 Agent 变更必须先复述目标对象、目标 Agent 和影响范围，等待用户确认后执行：

- “用某某 agent 跑这个任务”映射为 `profileId`。
- 写入前必须查 `GET /v1/agents` 确认目标 Agent 真实存在；更新已有 conn 前还要先读取当前 conn。
- 浏览器配置不属于自然语言 conn 编排能力；Agent 不应查询、透露或修改 `browserId`。用户要改 conn 浏览器时，只能引导到 Playground 的 Conn 编辑界面手动设置。
- 用户确认后才通过正式 API 写入执行 Agent；写完后必须重新读取 conn，确认 `profileId` 已按预期保存，不能只靠模型嘴上说“好了”。

playground 现在可以直接创建和编辑 `conn`，表单字段会映射到同一套后端定义：
- `title` / `prompt`：后台任务名称和执行输入。
- `prompt` 继续由用户直接填写，作为后台任务的真实执行说明。
- 前台 chat 和后台 `conn` runner 在真正把用户输入交给 agent 之前，都会自动补一行 `[当前时间：<IANA 时区> <YYYY-MM-DD HH:mm:ss>]` 作为显式时间锚点；这是运行时内部上下文，不应在用户可见 transcript 里回显。
- `target`：当前前台主选项是 `task_inbox`、`feishu_chat` 和 `feishu_user`；旧的 `conversation` 目标只保留后端兼容读取。目标在创建 / 编辑时固化，后续切换当前会话不会改变历史 conn 的投递归属。
- 目标预览：playground 会在编辑器里展示目标摘要和目标编号。`task_inbox` 会明确提示结果进入任务消息页；飞书目标会提示“通过飞书 adapter 发送，任务消息页仍保留追溯记录”。
- 默认表单只展示常用字段，目标编号、调度细节和高级设置按需展开；模型选择在常用区用 `API 源` / `模型` 下拉框完成，不再把 `modelPolicyId` 手写框甩给用户，界面不是飞控面板。
- 时间配置收口成三种：`定时执行`、`间隔执行`、`每日执行`。playground 仍会映射成后端真正使用的 `once / interval / cron`，但界面不再暴露 cron、工作日或每周这些额外分支。
- 三种模式的表单固定为：`定时执行` -> `执行时间`；`间隔执行` -> `首次执行时间 + 间隔（分钟）`；`每日执行` -> `每日执行时间`。
- 后台任务列表的主要摘要已经收口为 `结果发到 / 执行方式 / 运行节奏 / 执行 Agent / 模型` 这几行人话口径，不再直接把 `target / schedule / next / last / maxRunMs` 这类字段名扔给使用者。
- 任务消息页里的来源和文件摘要统一成人话：来源显示为 `后台任务 / 飞书 / 助手 / 通知`，文件显示为“附 N 个文件”。
- `schedule`：支持 `once`、`interval`、`cron`；`interval` 表单按分钟输入，落库仍是毫秒。
- `maxRunMs`：表单按秒输入，提交时转换成毫秒；空值表示不设置单次运行上限。
- `assetRefs`：用户侧文案叫“附加资料”，前端通过“选择复用文件 / 上传新文件”两条入口维护，提交时仍落成内部 `assetRefs` 数组，供后台 workspace 快照输入文件；不要再要求用户手填内部 `assetId`。
- “上传新文件”走 `POST /v1/assets/upload` 的 multipart 标准上传，上传期间前端会把按钮切成“上传中”并临时禁用保存 / 上传；失败时错误文案必须带上 HTTP 状态，别再让用户点完文件选择器后面对一个装死的表单。conn 编辑器上传的新资产使用 `conn:<connId>` 或 `conn:draft` 这类稳定内部归属，不再借当前前台 `conversationId`；真正绑定后台任务的是保存时写入的 `assetRefs`。
- 主 chat 输入区选择或拖拽文件也走同一个 `POST /v1/assets/upload`，上传成功后自动加入已选资产，再由发送请求携带 `assetRefs`；不再把文件内容塞进 `/v1/chat/stream` 或 `/v1/chat/queue` 的 JSON body。
- `conn` 编辑器加载最近资产列表时，不会再因为 `/v1/assets?limit=40` 没带上某个旧资料，就把已经选中的 `assetRefs` 静默洗掉；缺失的已选资产会按需补请求 `/v1/assets/:assetId` 拉回详情
- `profileId`：在界面上叫“执行 Agent”，保存的是 Playground agent profile id，新建任务默认 `main`。后台任务只借用该 Agent 的运行规则文件和 scoped skills，不写入它的前台聊天历史；别再把它理解成旧“任务身份”，这个名字太容易把人带偏。
- `browserId`：在界面上叫“浏览器”，保存的是 Browser Registry 中的 Chrome 实例 id；不填时跟随执行 Agent 的 `defaultBrowserId`，再没有才使用系统默认浏览器。Conn 指定浏览器只决定 `web-access` 打到哪个 CDP / 登录态，不改变执行 Agent 的规则、技能或模型。
- Chrome 绑定现在按用户手动配置处理：只允许 Playground UI 写入，不再提供自然语言 Agent 配置路径。不要把 run 期间的 `browser-scope-routes.json`、`WEB_ACCESS_BROWSER_ID` 或 Chrome profile 当成默认浏览器配置入口。
- Agent / Conn 浏览器绑定写入会追加审计 JSONL 到 `.data/audit/browser-bindings.jsonl`。记录包含目标对象、来源、前端是否带确认标记、变更字段、旧值和新值；审计写入失败只记 warning，不阻塞正常保存。这个文件用于追溯“刚才到底改了谁、从哪个 Chrome 改到哪个 Chrome”，不要拿运行态 scope route 反推长期配置。
- 服务端会拒绝非 UI 来源的浏览器 / 执行路由变更：如果 `PATCH /v1/agents/:agentId` 或 `PATCH /v1/conns/:connId` 导致 `defaultBrowserId`、`profileId` 或 `browserId` 真实变化，但请求没有 `x-ugk-browser-binding-confirmed: true` 或来源不是 `playground`，接口会返回 400，并写入 `status: "rejected_unconfirmed"` 或 `status: "rejected_non_ui_source"` 审计。这个闸门用于防止 Agent 绕过 UI 手动设置流程裸调 API。
- `agentSpecId` / `skillSetId` / `upgradePolicy`：在界面上分别叫“执行模板 / 能力包 / 版本跟随方式”，底层仍作为 legacy/background registry 兼容字段传给 worker 解析快照。`modelPolicyId` 只保留给旧任务和工具级兼容，用户可见编辑器不再提供手写入口。

`cron` 调度当前支持显式 `timezone`：

```json
{
  "kind": "cron",
  "expression": "0 9 * * *",
  "timezone": "Asia/Shanghai"
}
```

如果创建时没有传 `timezone`，存储层会在落库时补成默认用户时区：优先 `CONN_DEFAULT_TIMEZONE`，否则使用 `Asia/Shanghai`。这样可以避免“每天下午 1 点”跟随 Docker 容器的 UTC 时区，被错误调度到北京时间晚上 9 点。

`once` 和 `interval.startAt` 也支持显式 `timezone`。如果时间字符串已经带 `Z` 或 `+08:00` 这类偏移量，后端会按显式绝对时间解析；如果时间字符串不带偏移量，后端会按传入 `timezone` 解释为本地 wall-clock 时间。例如：

```json
{
  "kind": "once",
  "at": "2026-04-23T13:00:00",
  "timezone": "Asia/Shanghai"
}
```

会被归一化为 UTC `2026-04-23T05:00:00.000Z`。agent 通过 `conn` 工具创建提醒时，用户没特别说明时区就按 `Asia/Shanghai` 传，不要把北京时间 `13:00` 直接写成 `13:00Z`。

对于一次性 `once` 调度，后端现在会在创建 / 更新时直接校验 `at` 是否已经落到过去时间：

- 如果 `once.at <= now`，存储层会拒绝写入，并返回 `Invalid conn schedule: once.at is in the past`
- `POST /v1/conns` 与 `PATCH /v1/conns/:connId` 会把这类调度校验映射成 `400 BAD_REQUEST`
- 这样做的目的不是装严谨，而是避免 agent 把明显无效的过去时间写进队列，然后还假装自己创建成功

当前支持：

- `once`
- `interval`
- `cron`

Run 查询接口：
- `GET /v1/conns/:connId/runs`：查看某个 conn 的历史 run；无 query 参数时保持旧的完整历史响应，带 `limit` / `before` 时按 `scheduled_at DESC, created_at DESC, run_id DESC` 分页，并返回 `hasMore`、`nextBefore`、`limit`。`before` 使用 `scheduledAt|createdAt|runId` 稳定游标，避免同时间戳 run 分页错乱。
- `GET /v1/conns/:connId/runs/:runId`：查看单次 run 的状态、结果摘要和输出文件索引。
- `GET /v1/conns/:connId/runs/:runId/events`：查看单次 run 的过程事件；如果 run 不属于该 conn，返回 `404`。
- `GET /v1/conns` 返回的 `totalUnreadRuns` 是当前仍存在的 conn 下，状态为 `succeeded / failed` 且 `read_at IS NULL` 的 run 数；它不是任务消息 `agent_activity_items` 的未读数，也不会再把已软删除 conn 的历史 run 算进顶部“未读结果”。
- `POST /v1/conns/runs/read-all` 只把当前仍存在的 conn 范围内的未读 run 标记为已读；已软删除 conn 的历史 run 保留原始 read 状态，交给维护任务或排障时查看。

当前运行口径：
- 前台 `ugk-pi` 进程只负责创建 / 查询 / 暂停 / 恢复 conn，以及把 `POST /v1/conns/:connId/run` 写成一条 `pending` run。
- `POST /v1/conns` 和 `.pi/extensions/conn` 工具在未传 `target` 时，默认目标是 `{ "type": "task_inbox" }`；如果显式传了 `target`，仍以请求里的目标类型和值为准。旧的 `conversation` 目标只保留后端兼容读取，不再作为前台默认投递路径，也不参与后台 worker 执行前置校验。
- `conn` 系统技能当前以 [.pi/skills/conn-orchestrator/SKILL.md](/E:/AII/ugk-pi/.pi/skills/conn-orchestrator/SKILL.md) 为准：agent 直接依赖语言理解与 `conn` 工具，不搞低级文字匹配；默认投递到任务消息页，当前回合如果已有上传或复用文件，应把可见 `assetRefs` 一起带入 `conn`。
- 删除聊天会话不应删除、暂停或破坏任何 conn 定义、pending run、历史 run、任务消息或输出文件链接。后台任务的执行身份是 `connId + runId + workspace + resolvedSnapshot`，不是前台 `conversationId`。
- 本地 `docker compose` 会把 `conn.sqlite` 放到 named volume `ugk-pi-conn-db`，避开 Docker Desktop bind mount 上的多进程 SQLite 打开问题；如果 volume 里还是空库，而 legacy `.data/agent/conn/conn.sqlite` 已存在，初始化时会自动迁移这份旧库。
- 后台执行由独立 `ugk-pi-conn-worker` 进程轮询 SQLite，领取 due run 后在 `.data/agent/background/runs/<runId>/` 创建独立 workspace。worker 会按 `conn.profileId` 解析 Playground agent profile，生成 run 级能力快照：使用该 Agent 的 `AGENTS.md`、允许技能目录、执行身份和模型解析结果，但 session、workspace、history 仍属于这条后台 run，不污染目标 Agent 的前台 conversation。这个快照不是工具权限沙箱；`bash`、文件写入、`conn` 等底层 runtime 工具仍是基础执行能力，不按 Agent profile 限制。
- 后台 Agent 解析现在有一层 `AgentTemplateRegistry`：缓存的是 `AgentProfile` 构建出的 `AgentTemplate`，不是活的 session。每次 conn run 启动时会从当前模板冻结 `BackgroundAgentSnapshot` / `resolvedSnapshot`，之后本轮 run 只使用自己的 snapshot、workspace 和 session；运行中即使 Agent profile、rules、skills 或默认浏览器变化，也不会改写正在执行的任务。模板变更采用“先构建新模板，成功后原子替换”的语义；构建失败时保留旧模板，避免 conn 拿到半成品。任务级 `modelProvider` / `modelId` 和 `upgradePolicy` 属于 run snapshot 覆盖，不参与模板缓存切分；否则同一个 Agent 会因为不同任务策略生成一堆重复模板。`conn-worker` 是独立进程，所以不能依赖前台 server 的内存通知；worker 会按模板 signature 懒刷新，前台 Agent 创建、编辑、归档、技能增删和 rules 保存只是额外主动失效当前进程缓存。
- 后台 run 的浏览器路由独立解析：优先使用 conn 自身 `browserId`，否则使用 resolved Agent snapshot 里的 `defaultBrowserId`，再否则显式使用 Browser Registry 的 `defaultBrowserId`。runner 会把最终 browserId 写入 browser scope route，并通过后台 session 的 Bash 工具注入 `CLAUDE_AGENT_ID` / `CLAUDE_HOOK_AGENT_ID` / `agent_id` 和 `WEB_ACCESS_BROWSER_ID`，同时把 `UGK_BROWSER_INSTANCES_JSON` 收缩到当前绑定的单个 Chrome 实例，所以 Agent 环境里不会暴露其他 Chrome 清单。前台 chat session 和后台 conn session 还会在 run workspace 前置一个受控 `curl` wrapper：只要命令访问 `http://127.0.0.1:3456` 或 `http://localhost:3456`，wrapper 会自动补上本轮 `metaAgentScope`。`web-access` 对带 `metaAgentScope` 的请求只按 scope route 选路，请求传入的浏览器 id 不参与选择；没有命中 scope route 时会使用系统默认浏览器。不要把“没有选择浏览器”实现成空值；空值会让旧 proxy 自己用进程环境兜底，浏览器切换后就很容易串到上一次的 Chrome。
- 如果 `profileId` 指向的 Agent 已归档或当前不存在，后台 run 不应直接失败，而是降级到 `main` / main-like 能力继续执行；run 事件必须记录 `agent_profile_fallback`，`resolvedSnapshot` 必须带 `fallbackUsed / fallbackReason`，让用户在任务消息和 run detail 里看见这次降级。后台任务因为配置漂移直接断掉，体验上跟闹钟到点不响差不多，别这么干。
- 后台任务创建 / 编辑界面会从 `GET /v1/model-config` 读取和前台对话同源的 API 源与模型列表，并把选中的 `modelProvider / modelId` 保存到 conn 本身。后台 run 解析 snapshot 时优先使用任务级模型，其次才看 `modelPolicyId` 指向的策略，最后才回退项目默认模型；默认模型运行态通过 `UGK_MODEL_SETTINGS_PATH=/app/.data/agent/model-settings.json` 持久化，缺失时才回退仓库 `.pi/settings.json`。不要再指望通过同步前台 `.pi/settings.json` 来控制 worker。
- 后台 conn worker 使用和前台会话同一套模型 registry/settings。当前 DeepSeek 必须解析为 `deepseek/deepseek-v4-pro` 或 `deepseek/deepseek-v4-flash`，并按 provider 配置走 `anthropic-messages` / `https://api.deepseek.com/anthropic` / `DEEPSEEK_API_KEY`；不要把旧 `ANTHROPIC_AUTH_TOKEN`、`deepseek-anthropic`、`openai-completions` 或 `deepseek-api.txt` 当成当前后台任务配置源。历史 `deepseek-anthropic/*` 只在旧 snapshot alias 迁移里出现。
- 底层 `@mariozechner/pi-coding-agent` 已升级到 `0.70.6` 系列，带上游 DeepSeek V4 replay 修复；后台任务和前台会话复用同一个 session 工厂，因此工具调用后的多轮 DeepSeek 历史回放不应再因为缺少 assistant `reasoning_content` 被上游拒绝。
- 后台 worker 创建 agent session 时必须使用 resolved snapshot 中的 `provider / model` 显式解析模型；如果 `runtime/pi-agent/models.json` 找不到对应模型，run 应明确失败，不允许静默 fallback 到 registry 第一个模型。唯一例外是旧 DeepSeek provider 的显式兼容 alias：历史 `deepseek-anthropic/deepseek-v4-pro` 会迁移到 `deepseek/deepseek-v4-pro`，历史 `deepseek-anthropic/deepseek-v4-flash` 会迁移到恢复后的 `deepseek/deepseek-v4-flash`；其他模型缺失仍然失败。否则后台定时任务会悄悄换模型，账单和效果都变成盲盒，别这么玩。
- 后台 runner 在写入 `run_succeeded` 前必须检查最后一条 assistant message。如果底层 provider 返回 `stopReason: "error"`，run 必须进入 `run_failed` / `failed`，错误写入 `errorText`，不能因为 `session.prompt()` 返回了就假装成功。2026-05-14 的 `DS测试` 两个旧 run 曾因旧 conn-worker 环境里的 `ANTHROPIC_AUTH_TOKEN` 污染而 401，却被标成 succeeded；这是历史脏数据，不是当前成功判据。
- 后台 runner 注入给模型的 workspace contract 现在明确五件事：需要命令、文件或浏览器自动化时必须调用工具；只有写入 `output/` 的最终交付物会被索引为持久 conn run 输出；跨 run 私有状态必须写入 `CONN_SHARED_DIR`；长期公开文件必须写入明确的 public 目录；没有完成必要工具调用时不得汇报执行成功。不要再写“运行某技能”这种玄学 prompt 后期待模型自动悟道，脚本型任务应给出明确命令或明确的工具执行步骤。
- 每条 conn 会获得独立的跨 run 共享目录：`CONN_SHARED_DIR=/app/.data/agent/background/shared/<connId>`。该目录用于去重历史、冷却时间戳、游标、checkpoint、审计记录等私有状态；不同 conn 彼此隔离，容器重建后只要 `/app/.data/agent` 仍挂在 shared 运行态上就会保留。不要把这类状态写进 `/tmp`、`/app/runtime`、`/app/runtime/skills-user`、`OUTPUT_DIR` 或 public 目录。当前平台不在删除 conn 时自动清理 `CONN_SHARED_DIR`，避免误删生产状态；需要清理时必须走显式维护动作。
- 每条 conn 还会获得独立的长期公开目录：`CONN_PUBLIC_DIR=/app/.data/agent/background/shared/<connId>/public`，对应 URL 为 `GET /v1/conns/:connId/public/<path>`，运行时别名是 `CONN_PUBLIC_BASE_URL`。这个目录只放用户可以长期公开打开的文件，例如稳定站点 HTML、公开 JSON、图片和下载物；不要放 token、cookie、游标、checkpoint、审计记录或其他私有状态。路由只服务 `public/` 子目录，`shared/<connId>` 下其他文件不会被公开。
- 如果多个 conn 需要共同维护同一个网站，应给这些 conn 配置同一个 `publicSiteId`。后台 run 会创建 `SITE_PUBLIC_DIR=/app/.data/agent/background/sites/<publicSiteId>/public` 并注入 `SITE_PUBLIC_BASE_URL`，对应 URL 为 `GET /v1/sites/:siteId/<path>`。站点级目录是公开网站出口，不是共享数据库；多个 conn 的私有状态仍分别写回各自的 `CONN_SHARED_DIR`。
- 每条 conn run 还会获得 run 级 artifact 交付目录：`ARTIFACT_PUBLIC_DIR=<runRoot>/artifact-public/`，对应 URL 为 `GET /v1/conns/:connId/runs/:runId/artifacts/*` 和 `GET /v1/conns/:connId/artifacts/latest/*`。该目录与 `output/` 和 `CONN_PUBLIC_DIR` 平行，专门用于经过验证的正式交付产物。后台 session 同时会收到 `ARTIFACT_PUBLIC_DIR` 和 `ARTIFACT_PUBLIC_BASE_URL` 环境变量。
- Artifact 交付验证流程：当 conn 的 `artifactDelivery.enabled` 为 true 时，run 完成后会扫描 `artifact-public/` 目录，校验产物文件存在性、格式匹配、敏感文件泄漏和容器路径残留。编码在 `/v1/local-file?path=...` 里的 `/app/public` / `/app/runtime` 也会被识别为容器路径泄漏，不能靠 URL 编码蒙混过关。验证不通过时，`artifact-repair-loop.ts` 会向 agent session 追加修复 prompt，要求使用 `ARTIFACT_PUBLIC_DIR` 产物目录和 `ARTIFACT_PUBLIC_BASE_URL` 用户可见链接重新执行，最多 `repairMaxAttempts` 轮。所有修复尝试和验证结果记入 run 事件。验证配置和 contract 定义见 `src/agent/artifact-contract.ts`，验证逻辑见 `src/agent/artifact-validation.ts`，路由见 `src/routes/artifacts.ts`。
- conn run 的 `finishedAt`、`run_succeeded` / `run_failed` 事件时间、输出文件索引时间和任务消息 `createdAt` 均以真实终止时刻为准，不再复用 worker 领取任务时的 `tick(now)`。如果 `startedAt == finishedAt`，现在更能代表任务确实瞬间结束，而不是后台跑了 100 秒但时钟被写瞎。
- 后台任务完成 / 失败 / 取消后写入任务消息页的 activity 正文，会在开头追加 `执行 Agent：...` 和 `执行模型：provider / model`。Agent 行来自该 run 的 `resolvedSnapshot.agentName/agentId`；如果发生降级，要显示“原执行 Agent 不可用，已由主 Agent 完成”这类可见提示。模型行来自 `resolvedSnapshot.provider/model`，展示实际执行模型，不拿当前设置或 conn 表单字段猜。
- 后台 runner 生成 `resultText` 时会优先保留用户真正要的可见答案；如果最后一条 assistant 文本只是“输出文件已写入”这类低信息量收尾，会回退到前面更有用的回答。别再让通知正文只剩一个文件路径，用户不是来猜谜的。
- run 成功后会扫描该 workspace 的 `output/` 目录，并把真实输出文件写入 `conn_run_files`；因此 run 详情里的“输出文件索引”应与后台生成物对齐。
- run 详情里的 `files[]` 会为 `output/` 下的文件补充可打开链接：单次产物走 `GET /v1/conns/:connId/runs/:runId/output/<path>`，某个 conn 的最新成功产物走 `GET /v1/conns/:connId/output/latest/<path>`。这两个入口只服务已经写入 `conn_run_files` 的索引文件，并按 `workspacePath/output` 做路径边界校验，不恢复 worker 对 `/app/public` 的直写。HTML / 图片 / PDF / 文本类 conn output 默认 `inline`，浏览器应直接打开；需要强制下载时加 `?download=true`。后台 session 同时会收到 `OUTPUT_DIR`、`CONN_SHARED_DIR`、`CONN_PUBLIC_DIR`、`CONN_OUTPUT_BASE_URL`、`CONN_PUBLIC_BASE_URL` 和兼容字段 `ZHIHU_REPORT_BASE_URL`；配置了 `publicSiteId` 时还会收到 `SITE_PUBLIC_DIR` 与 `SITE_PUBLIC_BASE_URL`。
- 如果模型或旧脚本仍然把可访问 URL 写成 `/app/public` 对应的短链接，后台 runner 会在 run 结束时按结果正文中的 public URL 或 `/app/public/...` 路径做 best-effort 收编：确认 public 文件存在后复制到本轮 `output/`，再由标准 `conn_run_files` 索引和 `/v1/conns/.../output/...` 暴露。这个兼容层只用来兜底旧脚本和模型乱写，不把 `/app/public` 恢复成 conn 的主输出目录。
- `conn-worker` 写入任务消息 activity 时会把已索引的 `output/` 文件同步挂到 `files[]`，任务消息页会渲染平台生成的可靠文件链接；飞书全局通知镜像也会尝试发送这些文件，失败时才降级为公开 URL 文本。不要依赖模型正文里手写的 `/zhihu-browse/...` 这类业务短链接，那玩意儿一旦和实际输出目录不一致就会 404。
- conn 终态结果当前主链路写入 `agent_activity_items`，由任务消息页读取展示；成功、失败和超时失败都会留下记录，不会再以“写回前台 conversation transcript”作为默认投递方式。
- playground 在任务消息页或后台任务列表里遇到 `source=conn` 且带 `sourceId + runId` 的条目时，会显示“查看后台任务过程”入口；点开后分别请求 run 详情和 run 事件，展示状态、workspace、结果摘要、输出文件和过程日志。
- 这类条目依赖 `source / sourceId / runId` 维持可追溯性；如果这些字段丢了，优先查 activity 写入与前端条目归一化，不要再朝 conversation transcript 那条旧路上瞎补。
- 旧的进程内 `conn-scheduler` / `conn-runner` 已移除，别再按前台同步执行链路排查。
- Medtrum 舆情监控这类长链路任务定义要走 subagent 工具的 single / parallel / chain 能力，不要让主模型手写一堆 prompt 文件再串行拉 CLI。平台检索可以并行，汇总单独收口，邮件发送必须由最终主流程直接执行并留下完整输出；不要使用 `tee | tail` 这类会截断真实错误的管道。
- 本地 `GET /v1/conns` 当前没有 Medtrum 舆情监控 conn，`GET /v1/assets/6d82261f-afb5-433c-a3c0-f11db172fb2a` 也返回 `404`；因此这台本地环境无法确认报告里提到的 v2 asset 已生效。生产排查时先查目标服务器的 `GET /v1/conns` 和 asset detail，再决定是否更新 conn `assetRefs`。

### Conn Worker 运行验收清单

这份清单用于验证 conn worker 当前主链路，尤其适合改完后台任务、output、通知或部署后做回归。不要只看页面上出现“成功”两个字，那个最多说明模型会说漂亮话，不说明产物链路真的通。

1. 新建或编辑 conn 时，如果没有显式传 `target`，后端应落成 `{ "type": "task_inbox" }`，不能再自动绑定当前前台 `conversationId`。
2. 删除或切换前台聊天会话后，既有 conn 定义、pending run、历史 run、任务消息和输出文件链接仍应可查询。
3. 手动触发 run 后，`GET /v1/conns/:connId/runs/:runId` 应返回真实终态；成功 run 的 `files[]` 应包含 `output/` 下的真实产物。
4. 成功 run 应写入 `agent_activity_items`，任务消息页和 `/v1/activity` 能看到对应 activity；在线 toast 只是提醒层，不是结果真源。
5. output 文件的 run URL 和 latest URL 都应能从公网访问；HTML / Markdown / 文本类默认可直接打开，强制下载才使用 `?download=true`。
6. 如果 agent 正文里写了一个自造路径或旧 public 链接，验收时以 run detail 的 `files[].url / latestUrl` 为准；模型正文不能当事实来源。
7. `GET /v1/debug/cleanup` 用于看最近 7 天是否仍有 legacy 风险；`recentRuns.succeededWithoutOutputFiles > 0` 才代表成功任务缺产物索引需要处理。
8. 修复后验收应优先使用 `GET /v1/debug/cleanup?since=<ISO time>`，只看修复时间之后的 run，避免被修复前历史假成功 / 无产物旧账误导。
9. 查看 run events 时，如果 `turn_end` 或 `message_update` 里出现 assistant `stopReason: "error"`，该 run 现在应是 `failed`。如果仍显示 `succeeded`，优先怀疑后台 runner 状态传播或 worker 没重启，不要被 UI 绿色徽章糊弄。
10. 阿里云和腾讯云都应分别跑 `npm run server:ops -- <aliyun|tencent> verify`，再查对应公网 `/v1/debug/cleanup?since=...`；只看 `/healthz` 太粗，约等于体检只量身高。

2026-05-05 本轮双云验收事实：

- 阿里云在 `?since=2026-05-05T06:00:00.000Z` 口径下返回 `ok=true`，成功 run 有 activity 和 output files，`risks=[]`。
- 腾讯云在同一 `since` 口径下返回 `ok=true`，用户手动触发的 V2EX AI run 成功生成 `output/v2ex-report.md`，run URL 和 latest URL 均返回 HTTP `200`。
- 腾讯云未加 `since` 时仍可能看到一个修复前历史 succeeded run 缺 output 索引；这是旧数据残留，不代表当前 conn output 链路失败。

### Conn / Feishu Legacy 口径

- `conversation` target：只作为后端兼容读取保留，新建 conn 默认和推荐目标都是 `task_inbox`；新 UI、文档和 prompt 不应再引导用户填写 conversation target。
- `conversation_notifications`：旧会话通知数据表已退出 schema；当前 conn 结果主链路是 `agent_activity_items`，不要把后台任务结果重新写回 conversation transcript 或旧通知表。conversation-scoped notification store 已移除，旧库升级到 user_version 6 时会丢弃该表；cleanup debug 只对异常旧库保留只读兼容统计。
- Feishu `mapped` mode：只作为兼容模式保留；默认是 current conversation mode，也就是飞书作为 Web 当前会话的外挂收发窗口。
- legacy subagent `.pi/agents`：保留旧 scout / planner / worker / reviewer 链路，但用户说“agent”时默认指 Playground agent profile 和 `/v1/agents`，不是 legacy subagent。
- Windows host IPC：只作为本机调试 fallback；生产浏览器链路默认 Docker Chrome sidecar + direct CDP。

关键入口：

- [src/agent/conn-store.ts](/E:/AII/ugk-pi/src/agent/conn-store.ts)
- [src/agent/conn-db.ts](/E:/AII/ugk-pi/src/agent/conn-db.ts)
- [src/agent/conn-sqlite-store.ts](/E:/AII/ugk-pi/src/agent/conn-sqlite-store.ts)
- [src/agent/conn-run-store.ts](/E:/AII/ugk-pi/src/agent/conn-run-store.ts)
- [src/agent/agent-activity-store.ts](/E:/AII/ugk-pi/src/agent/agent-activity-store.ts)
- [src/agent/background-agent-runner.ts](/E:/AII/ugk-pi/src/agent/background-agent-runner.ts)
- [src/workers/conn-worker.ts](/E:/AII/ugk-pi/src/workers/conn-worker.ts)
- [src/routes/conns.ts](/E:/AII/ugk-pi/src/routes/conns.ts)
- [src/routes/conn-route-parsers.ts](/E:/AII/ugk-pi/src/routes/conn-route-parsers.ts)
- [src/routes/activity.ts](/E:/AII/ugk-pi/src/routes/activity.ts)

`POST /v1/conns`、`PATCH /v1/conns/:connId` 和 `POST /v1/conns/bulk-delete` 的请求解析集中在 `src/routes/conn-route-parsers.ts`；`src/routes/conns.ts` 只负责 HTTP 编排、store 调用、run 查询和响应转换。别又把字段解析塞回路由主文件，入口层不是垃圾桶。

## 7. Feishu

当前入口：

- `src/workers/feishu-worker.ts` 通过飞书官方 `@larksuiteoapi/node-sdk` 的 `WSClient` + `EventDispatcher` 建立长连接订阅。
- `ugk-pi` 主服务不再注册 `POST /v1/integrations/feishu/events`；HTTP webhook 已退出主链路，避免公网回调、验签和主服务路由耦合。
- `playground` 桌面侧栏和手机端更多菜单提供“飞书设置”入口；`GET /v1/integrations/feishu/settings` 只返回脱敏配置，`PUT /v1/integrations/feishu/settings` 保存启用状态、`App ID`、`App Secret`、白名单和后台通知接收人，`POST /v1/integrations/feishu/test-message` 用当前配置发送测试消息。
- 动态配置持久化到 `UGK_AGENT_DATA_DIR/feishu/settings.json`，也就是容器内默认 `.data/agent/feishu/settings.json`；写入采用同目录临时文件 + `rename` 原子替换。`App Secret` 保存后不会通过 API 回显，前端只显示 `hasAppSecret` 状态。
- `.env` 里的 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_API_BASE`、`FEISHU_ALLOWED_CHAT_IDS`、`FEISHU_ACTIVITY_CHAT_IDS` 和 `FEISHU_ACTIVITY_OPEN_IDS` 现在都是 bootstrap fallback；Web 保存过动态配置后，以 `settings.json` 为准。新服务器只需要先让服务跑起来，再在 Web 里填飞书 App 凭据和接收人，不要为了改机器人凭据 SSH 进服务器翻 env，太原始了。
- `ugk-pi-feishu-worker` 会轮询配置版本，配置变化后关闭旧 WebSocket 连接并用新 App 凭据重连；`conn-worker` 发送后台任务全局飞书通知时也会按次读取动态配置，不再依赖启动时快照。
- worker 只在 WebSocket `start()` 成功后确认当前配置签名；如果飞书侧临时返回 `system busy`、网络抖动或 SDK 启动失败，同一份配置会在下一轮继续重试，不会因为失败配置被提前记住而卡死。
- `PUT /v1/integrations/feishu/settings` 会拒绝包含空格、换行或制表符的 `App ID` / `App Secret`；保存成功后的用户实测验收记录为飞书测试消息通过，代码侧验收为 `npm test` 全量 `447 pass`。

已接通：

- `im.message.receive_v1`
- WebSocket 长连接只负责收事件；出站文本、文件上传和附件下载继续复用现有 `FeishuClient` / `FeishuDeliveryService`，不重造轮子。
- worker 通过 `FEISHU_AGENT_BASE_URL` 调用主服务 `/v1/chat/conversations`、`/v1/chat/status`、`/v1/chat/interrupt`、`/v1/chat` 和 `/v1/chat/queue`，主服务仍是唯一 `AgentService` 真源。不要在飞书 worker 里直接创建第二个前台 agent，否则 Web 和飞书会变成两套运行锁。
- 飞书侧控制命令不会进入普通 agent prompt：
  - `/status`：读取 Web 当前会话状态，返回是否运行中、上下文占用、当前输入和当前输出摘要。
  - `/stop`：调用主服务 `POST /v1/chat/interrupt`，语义等同 Web playground 点击打断按钮；命令不会进入队列，也不会交给 agent prompt。
  - `/new`：调用主服务 `POST /v1/chat/conversations`，真正新建并切换 Web 当前会话；如果当前有 active run，会明确提示不能新建，而不是让 agent 嘴上假装新建。
  - `/whoami`：返回当前飞书会话 `chat_id` 和发送者 `open_id`，用于配置后台通知发到群聊或机器人私聊。
- 后台任务全局通知可以镜像到飞书：
  - `FEISHU_ACTIVITY_CHAT_IDS`：发到固定飞书 chat，适合群聊或已知私聊 `chat_id`。
  - `FEISHU_ACTIVITY_OPEN_IDS`：发到用户私聊，适合直接投递给机器人私聊用户。
  - 两个配置都为空时不启用飞书全局通知镜像；飞书发送失败只记录 warning，不影响后台任务完成、任务消息页写入或 Web toast。
- 当前默认采用 `current conversation mode`：飞书是 Web 当前会话的外挂收发窗口，入站消息永远投递到服务端当前 `conversationId`，不再默认按飞书群聊派生独立本地会话。Web playground 和飞书观察 / 输入的是同一个 agent 当前上下文。
- 飞书新发起一轮空闲 chat 时会发送轻量进度反馈：先立即回 `收到，正在处理...`，再按节流间隔读取主服务 `GET /v1/chat/state` 的 `activeRun.process.currentAction` 或当前输出摘要，内容变化时发送 `正在处理：...`。这不是第二套流式 runtime，只是飞书 worker 旁路观察同一条 Web active run；最终结果仍由 `/v1/chat` 完成后统一发送，带文件时继续复用 `FeishuDeliveryService`。
- 兼容层仍保留 `mapped` 模式；该模式才会使用 `FeishuConversationMapStore` 把飞书 `chat_id` 映射到 `feishu:chat:<chatId>`。映射文件由 `FeishuConversationMapStore` 串行 mutation，并通过同目录临时文件 + `rename` 原子替换写入，避免多个飞书群聊/用户同时触发 webhook 时把彼此的映射覆盖掉。不要把这个兼容模式重新当默认主链路。
- 当前会话解析在 `FeishuConversationResolver` 内完成，`AgentService` 只暴露只读 `getCurrentConversationId()`；飞书适配逻辑不能散进主 agent 编排层，飞书只是外挂组件，不是第二套 runtime。
- 可通过 `FEISHU_ALLOWED_CHAT_IDS` 配置允许写入当前会话的飞书 chat id，多个 id 用逗号分隔；配置为空表示不限制。current mode 下建议生产配置白名单，否则多个飞书群聊都能把消息混入当前 Web 会话。
- 入站消息按飞书 `message_id` 做进程内幂等；重复 webhook 不会重复调用 agent。当前默认去重是进程内保护，重启后的持久化幂等后续再按生产需要扩展。
- 入站文件 / 图片不再只传文件名元数据；服务层会先下载飞书资源，再桥接成可直接喂给 agent 的 `ChatAttachment`
- 出站结果现在先发文本，再尝试把 agent 返回的文件上传回飞书并发送 file message；上传失败时才退回文件 URL 文本，避免把“应该给文件”退化成一串链接
- 单窗口消息队列不再靠中断关键字硬匹配瞎猜。当前策略由 `queue-policy` 根据消息内容决定：
  - 纯文本补充：优先 `steer`
  - 带附件补充：优先 `followUp`
- 当前 Feishu 模块已经按职责拆开，避免把 WebSocket、下载、队列和回传又揉成一锅：
  - `ws-subscription`：封装飞书官方 SDK 的 `WSClient` / `EventDispatcher`
  - `http-agent-gateway`：把飞书 worker 的入站消息转发到主服务聊天 API，保持单 agent 运行态
  - `message-parser`：解析飞书 inbound message
  - `attachment-bridge`：下载飞书附件并转成 agent 可消费的附件结构
  - `conversation-resolver`：决定飞书消息进入当前 Web 会话还是兼容映射会话
  - `message-deduper`：按飞书 `message_id` 做入站幂等
  - `queue-policy`：在单窗口约束下决定追加消息的排队策略
  - `delivery`：发送文本、上传回传文件、失败时降级到链接
  - `conversation-map-store`：维护飞书 chat/user 到本地 `conversationId` 的稳定映射，写入时串行化并原子替换 JSON
  - `client`：tenant access token、消息发送、文件上传、资源下载
  - `service`：把这些模块编排进统一 Feishu 接入流程

关键入口：

- [src/workers/feishu-worker.ts](/E:/AII/ugk-pi/src/workers/feishu-worker.ts)
- [src/routes/feishu-settings.ts](/E:/AII/ugk-pi/src/routes/feishu-settings.ts)
- [src/integrations/feishu/settings-store.ts](/E:/AII/ugk-pi/src/integrations/feishu/settings-store.ts)
- [src/integrations/feishu/ws-subscription.ts](/E:/AII/ugk-pi/src/integrations/feishu/ws-subscription.ts)
- [src/integrations/feishu/http-agent-gateway.ts](/E:/AII/ugk-pi/src/integrations/feishu/http-agent-gateway.ts)
- [src/integrations/feishu/message-parser.ts](/E:/AII/ugk-pi/src/integrations/feishu/message-parser.ts)
- [src/integrations/feishu/attachment-bridge.ts](/E:/AII/ugk-pi/src/integrations/feishu/attachment-bridge.ts)
- [src/integrations/feishu/conversation-resolver.ts](/E:/AII/ugk-pi/src/integrations/feishu/conversation-resolver.ts)
- [src/integrations/feishu/message-deduper.ts](/E:/AII/ugk-pi/src/integrations/feishu/message-deduper.ts)
- [src/integrations/feishu/queue-policy.ts](/E:/AII/ugk-pi/src/integrations/feishu/queue-policy.ts)
- [src/integrations/feishu/delivery.ts](/E:/AII/ugk-pi/src/integrations/feishu/delivery.ts)
- [src/integrations/feishu/conversation-map-store.ts](/E:/AII/ugk-pi/src/integrations/feishu/conversation-map-store.ts)
- [src/integrations/feishu/service.ts](/E:/AII/ugk-pi/src/integrations/feishu/service.ts)
- [src/integrations/feishu/client.ts](/E:/AII/ugk-pi/src/integrations/feishu/client.ts)
- [test/feishu-service.test.ts](/E:/AII/ugk-pi/test/feishu-service.test.ts)

## 8. 当前最容易踩坑的点

- 不要再把聊天框当文件传输层
- 不要把容器 `file:///app/...` 直接给宿主浏览器
- 不要把 “agent 内部允许 file” 和 “用户可见地址必须可打开” 混成一锅
- 查文件问题时，先区分：
  - 是内部工作路径问题
  - 还是用户交付出口问题

## 9. Docker sidecar 与本地 artifact

`web-access` 现在默认通过 Docker Chrome sidecar 打开真实浏览器页面。这里有一个非常容易踩的网络视角问题：

- 用户可见链接使用 `PUBLIC_BASE_URL`，本地通常是 `http://127.0.0.1:3000`
- sidecar Chrome 自动化使用 `WEB_ACCESS_BROWSER_PUBLIC_BASE_URL`，compose 内默认是 `http://ugk-pi:3000`
- sidecar Chrome 不能直接打开 `file:///app/...`，也不能把 `127.0.0.1:3000` 当成 app 容器

因此 agent 内部可以继续写 `/app/runtime/report.html`，但浏览器预览和截图必须经由：

```text
GET /v1/local-file?path=...
```

如果是给用户拿真实文件，仍然优先使用 `send_file`，不要把浏览器预览链路当文件交付链路。

## Conn Realtime Broadcast

- `conn-worker` 在把结果写入 `agent_activity_items` 之后，会再 best-effort 调用 `POST /v1/internal/notifications/broadcast`，把实时事件扔给前台 server 进程内的 `NotificationHub`。
- `NotificationHub` 负责把事件扇出到 `GET /v1/notifications/stream` 的所有在线 SSE 订阅者；断线或无人在线时不会影响持久化结果。
- 本地和生产 compose 都显式给 `ugk-pi-conn-worker` 注入 `NOTIFICATION_BROADCAST_URL=http://ugk-pi:3000/v1/internal/notifications/broadcast`，避免 worker 在容器里误把 `127.0.0.1` 打回自己。
- 这条链路只负责“在线提醒”，不改变结果的真实落点；真实落点仍然以 conn 创建时固化的 `target` 为准，默认就是任务消息页。
- `/playground/conn` 独立页消费这条 SSE 时会先解析 `source/sourceId/runId`；只有 `source=conn` 的事件触发页面刷新，并在 500ms 窗口内合并。默认只刷新 `GET /v1/conns`，仅当当前选中 conn 的 run history 已加载时，才额外补拉该 conn 的第一页 runs。
- 关键入口：
  - [src/workers/conn-worker.ts](/E:/AII/ugk-pi/src/workers/conn-worker.ts)
  - [src/routes/notifications.ts](/E:/AII/ugk-pi/src/routes/notifications.ts)
  - [src/agent/notification-hub.ts](/E:/AII/ugk-pi/src/agent/notification-hub.ts)
  - [docker-compose.yml](/E:/AII/ugk-pi/docker-compose.yml)
  - [docker-compose.prod.yml](/E:/AII/ugk-pi/docker-compose.prod.yml)

## Conn Worker Parallelism

- `ConnWorker.tick()` 现在会先 claim 多条 due run，再并行执行，`maxConcurrency` 不再是名义参数。
- 本地与生产 compose 默认给 `ugk-pi-conn-worker` 注入 `CONN_WORKER_MAX_CONCURRENCY=${CONN_WORKER_MAX_CONCURRENCY:-3}`，单个 worker 容器默认可同时处理 3 条后台任务。
- 这条并发能力依然是“单 worker 进程内并发”；如果后续要扩成多 worker 副本，还需要补 lease heartbeat / 超时回收策略，避免超长任务被别的 worker 重领。

## Conn Run Heartbeat

- 运行中的 conn run 现在会由 worker 周期性刷新 `updatedAt` 和 `leaseUntil`，不再长时间停在 claim 那一刻的时间戳上装死。
- heartbeat 只允许当前 `leaseOwner` 续租，避免别的 worker 抢跑后把 lease 写乱。
- 默认 heartbeat 间隔会按 lease 自动推导；显式传入的 heartbeat 间隔会被原样尊重，便于测试和后续调参。
- runner / worker 完成或失败 run 时会带上当前 `leaseOwner` 做条件更新；如果 run 已经因租约过期被其他 worker 接管，迟到的旧 worker 不能再把它标成成功或失败，也不能污染 owning conn 的 `lastRunId`。
- runner 写入 runtime metadata、过程事件和输出文件索引时也会带上当前 `leaseOwner`；旧 worker 迟到的 sessionFile、run event 或 output file 不能混进新 owner 的 run 详情。
- 过程事件和输出文件写入必须在 SQLite 事务内完成 run/lease 校验与插入；如果用户在后台任务删除后还有迟到 event/file，写入应直接跳过或保持在原 run 历史内，不能再用外键错误把 `conn-worker` 打崩。session event 持久化失败只允许记 warning，不应覆盖后台任务本身的成功 / 失败收口。

## Stale Run Recovery

- worker 每次 tick 开头都会先扫描 `lease_until <= now` 的 `running` run，并将它们标记为失败，而不是静默重领继续跑。
- stale run 会追加 `run_stale` 事件，保留原 lease 信息和回收时间，方便之后排查为什么被判死。
- 这样做的取舍是：宁可把可疑 run 清晰标错，也不把同一份后台任务在不确定状态下偷偷重跑成“双份结果”。

## Conn Run Detail Lease Visibility

- `GET /v1/conns/:connId/runs/:runId` 现在会把 `leaseOwner` 和 `leaseUntil` 一起返回给前台，不再只暴露结果摘要。
- `playground` 的“查看后台任务过程”弹层会额外展示 `claimed / started / updated / lease owner / lease until`，并给 `running` run 计算一个人能看懂的 health 文案：
  - `running / lease active`
  - `running / stale suspected`
  - 以及非运行态直接回显真实 `status`
- 这层展示的目标不是替代事件日志，而是让用户第一眼就知道后台任务到底还活着、已经结束，还是 lease 看起来已经悬了。

## Conn Max Runtime

- `conn` 现在支持可选字段 `maxRunMs`，用于限制单次后台 run 的最长执行时间。
- 创建或更新 `conn` 时可以通过 `POST /v1/conns` / `PATCH /v1/conns/:connId` 传入正数毫秒值；未设置时保持原先不设上限的行为。
- worker 会在执行期为设置了 `maxRunMs` 的任务挂一条真实超时闸门；一旦超时：
  - 先写入 `run_timed_out` 事件
  - 再中止后台 session
  - 最终把 run 标记为 `failed`
- 超时失败也会写入全局任务消息，并通过实时广播推给在线 playground；通知标题使用 `<conn title> failed`，正文优先展示 `errorText`。
- 这条超时约束是运行期硬约束，不只是前端显示字段；对应 run detail / events 可以直接看到超时留痕。
 
## Conn Playground 管理入口

- `playground` 现在有可视化后台任务管理面：桌面端首页右侧 `后台任务`，手机端右上角更多菜单里的 `后台任务`。
- 管理面只复用现有后端 API，不改变调度模型：
  - `GET /v1/conns` 读取 conn 列表；响应里的每个 conn 会带 `latestRun` 摘要，打开管理面不再为每个 conn 额外请求 runs
  - `POST /v1/conns` 创建 conn
  - `PATCH /v1/conns/:connId` 更新 conn
  - `GET /v1/conns/:connId/runs` 按需读取某个 conn 的完整 run 列表，当前主要在展开单个 conn 时触发
  - `POST /v1/conns/:connId/run` 手动入队一次 run
  - `POST /v1/conns/:connId/pause` 暂停调度
  - `POST /v1/conns/:connId/resume` 恢复调度
  - `DELETE /v1/conns/:connId` 删除 conn
  - `POST /v1/conns/bulk-delete` 批量删除 conn，入参是去重后的 `connIds`
- `POST /v1/conns` 与 `PATCH /v1/conns/:connId` 现在共用同一套 payload 解析逻辑：创建时统一 trim 文本，未显式传入 `target` 时补 `{ "type": "task_inbox" }`，不读取当前服务端会话；编辑时如果显式传入 `title` 或 `prompt`，则必须是去空白后仍非空的字符串，不再把空白值默默吞掉。
- 当前删除是软删除：`ConnSqliteStore` 会给 `conns.deleted_at` 写入时间、把任务从 `GET /v1/conns` 和管理面隐藏、停止后续调度，并清理 `source=conn` 且 `source_id=<connId>` 的全局 activity；不会在 HTTP 请求内级联删除该 conn 的 run / event / file 历史。这个取舍是为了避免用了很久的后台任务在删除时同步清扫大量 SQLite 行，把主服务线程和前端请求一起卡住。后续如果需要真正清理历史数据，应做单独维护任务，而不是恢复请求内硬删除。
- 保存成功后，管理面会保留一条状态提示并高亮对应 conn；最近 run 历史默认折叠，打开管理面时只使用 `/v1/conns` 返回的 `latestRun` 展示最新状态摘要，需要排障时再展开并按需读取完整 runs。
- 管理面现在有状态筛选、选择当前、清空选择和删除所选，用来批量清掉测试 conn；单个正式任务仍建议先暂停确认，再决定是否删除。删除后任务从 UI 消失，但 run 历史仍保留在 SQLite 中供维护期排查或后续清理。
- 前台 agent 正在运行时，管理面仍可打开和操作；这是刻意保留的解耦行为。conn worker 是否执行、执行到哪里，仍以 SQLite run 状态和 worker 日志为准。
- 从管理面点 `查看` 会复用 `conn` run 详情弹层，请求 `GET /v1/conns/:connId/runs/:runId` 和 `/events`，用于追溯 workspace、结果、文件和事件。

## Agent Activity Timeline

- `agent_activity_items` 是跨会话的任务消息读模型，不替代 conversation transcript。别把主聊天流硬改成“全局伪对话”，那是把上下文和观察层搅成一锅，后面一定会炸。
- `conn-worker` 对所有终态 conn run 都会 best-effort 写入一条 `agent_activity_items`。成功、失败和超时结果都会进入任务消息页。
- `agent_activity_items` 对带 `runId` 的投递使用数据库唯一约束 `source + sourceId + runId`；`AgentActivityStore.create()` 如果遇到并发插入已经赢了，会返回现有 activity，而不是把 SQLite 唯一约束错误当成普通写入失败。别再只靠“先 SELECT 再 INSERT”去重，那在多 worker 场景里就是纸门锁。
- activity item 保留 `source / sourceId / runId / conversationId / title / text / files / createdAt / readAt`。其中 `source=conn` 且带有 `sourceId + runId` 的条目可以继续打开原有 conn run detail。
- API：
  - `GET /v1/activity?limit=50`：按时间倒序读取任务消息列表，支持 `limit`、`conversationId`、`before`、`unreadOnly=true`；响应包含 `activities`、`hasMore` 和可选 `nextBefore`。
  - `POST /v1/activity/:activityId/read`：标记活动已读。
  - `POST /v1/activity/read-all`：批量标记全部任务消息已读。
- `playground` 桌面端顶部状态栏提供 `任务消息`，手机端更多菜单也有同名入口。打开后统一读取 `/v1/activity?limit=50` 全量时间线，并从展开条目跳转到已有的后台任务过程弹层。
- 手机端右上角 `更多` 按钮自身也会显示任务消息未读数字徽标，颜色统一为 `#ff1744`，超过 99 显示 `99+`；不要只把数字藏在更多菜单内部。
- 任务消息页不再提供 `未读 / 全部` 筛选；未读条目在全部列表里红色高亮并默认展开，已读条目默认折叠，只显示标题和时间，点击后展开 / 收起。
- 未读状态按条处理：点击未读条目本身，或点击 `任务ID / 复制 / 查看过程` 才会把当前条目标成已读；进入页面本身不再自动清空未读。
- 实时广播到达时，页面会刷新任务消息列表；后台 conn 结果不再要求匹配当前聊天会话，也不把前台 `conversationId` 当作展示前置条件。在线 toast 仍只是提醒层，真实记录以 SQLite activity 表为准。
- 关键入口：
  - [src/agent/agent-activity-store.ts](/E:/AII/ugk-pi/src/agent/agent-activity-store.ts)
  - [src/agent/background-agent-runner.ts](/E:/AII/ugk-pi/src/agent/background-agent-runner.ts)
  - [src/routes/activity.ts](/E:/AII/ugk-pi/src/routes/activity.ts)
  - [src/workers/conn-worker.ts](/E:/AII/ugk-pi/src/workers/conn-worker.ts)
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)
  - [src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)
  - [test/agent-activity-store.test.ts](/E:/AII/ugk-pi/test/agent-activity-store.test.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
## 任务消息收件箱（2026-04-23）

- 后台 `conn` 结果的主投递面已经收口为 `agent_activity_items` + `任务消息` 页面；不再把“发到某个会话”当成默认主路径。
- `POST /v1/conns` 和 `.pi/extensions/conn` 工具在未显式传入 `target` 时，默认目标现在是 `{ "type": "task_inbox" }`，不再自动绑定服务端当前会话。
- `playground` 里的 conn 创建 / 编辑器当前只向用户暴露三类目标：`task_inbox`、`feishu_chat`、`feishu_user`。旧的 `conversation` 目标只保留后端兼容读取，不再作为前台主选项。
- `conn-worker` 对所有终态 run 都会写入 `agent_activity_items`，并广播 activity 事件；旧的会话通知写法已经退出主链路。
- 任务消息读模型的补充接口：
  - `GET /v1/activity/summary`：返回未读数量
  - `GET /v1/activity?limit=50`：返回任务消息列表，支持 `unreadOnly=true` 与 `before` 分页，响应带 `hasMore` / `nextBefore`
  - `POST /v1/activity/:activityId/read`：标记已读
  - `POST /v1/activity/read-all`：全部标记已读
- `playground` 任务消息页当前不会在打开时自动清未读；未读 badge、条目红点、高亮背景和展开状态都以后端 `readAt` 为准，避免前端假已读。
- 任务消息页始终按时间倒序翻完整记录，底部 `加载更多` 用 `nextBefore` 游标继续取下一页；`unreadOnly=true` 仍是后端兼容查询能力，不再是当前前端默认入口。
