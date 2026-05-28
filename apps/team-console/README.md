# Team Console

独立 Team Runtime 执行图预览前端。与主项目 `/playground/team` 隔离，不影响现有生产入口。

## 安装

```bash
npm install
```

## 启动开发

```bash
npm run dev
# 访问 http://127.0.0.1:5174
```

## 测试

```bash
npm test              # vitest run
npm run build         # tsc + vite build
```

## 根项目快捷命令

```bash
npm run team-console:dev    # 启动开发
npm run team-console:build  # 构建
npm run team-console:test   # 测试
```

## 数据源

默认使用 Mock fixture 数据。顶部可切换 Live API 模式。

本地开发时，Live API 和嵌入式主 `/playground` iframe 都走 Vite dev server 的同源代理。代理覆盖 `/v1`、`/playground`、`/assets`、`/runtime` 和 `/vendor` 等主服务路径，避免远程访问 `http://<host>:5174/` 时把浏览器导向开发机自己的 `127.0.0.1`。Agent 卡片状态复用主项目 `GET /v1/agents/status`，显示真实空闲 / 运行中状态。默认代理目标是主 `ugk-pi` 服务：

```bash
http://127.0.0.1:3000
```

所以使用 Live API preview 或 Agent 分支 iframe 前，需要先确保主服务已经运行在 `http://127.0.0.1:3000`。如主服务不在默认端口，可用 `TEAM_CONSOLE_API_TARGET` 覆盖 Vite 服务端代理目标；这个值不会暴露给前端 iframe URL。默认 iframe URL 是同源相对路径 `/playground?...`，远程 FRP 访问时仍留在 `5174` 入口，由 Vite 转发到真实后端。

```bash
TEAM_CONSOLE_API_TARGET=http://127.0.0.1:<port> npm run dev
```

如果确实要让 iframe 绕过 Vite，直接打开一个浏览器可访问的后端公网入口，可显式设置 `VITE_TEAM_CONSOLE_PLAYGROUND_BASE_URL`，例如 `http://139.196.23.72`。远程用户场景不要把它设成 `http://127.0.0.1:3000`，那会重新变成访问用户自己机器的 loopback。

Team Console shell 的 Live API 模式会真实请求：

- `GET /v1/agents`
- `GET /v1/agents/status`
- `GET /v1/team/tasks`
- `GET /v1/team/source-nodes`
- `POST /v1/team/source-nodes`
- `PATCH /v1/team/source-nodes/:sourceNodeId`
- `POST /v1/team/source-nodes/:sourceNodeId/archive`
- `GET /v1/team/source-connections`
- `POST /v1/team/source-connections`
- `DELETE /v1/team/source-connections/:connectionId`
- `GET /v1/team/task-connections`
- `POST /v1/team/task-connections`
- `GET /v1/team/task-dependencies`
- `POST /v1/team/task-dependencies`
- `DELETE /v1/team/task-dependencies/:dependencyId`
- `GET /v1/team/tasks/:taskId/runs`
- `POST /v1/team/tasks/:taskId/runs`
- `GET /v1/team/task-runs/:runId`
- `POST /v1/team/task-runs/:runId/cancel`
- `GET /v1/team/task-runs/:runId/tasks/:taskId/attempts`
- `GET /v1/team/task-runs/:runId/tasks/:taskId/attempts/:attemptId/files/:fileName`
- `PATCH /v1/team/tasks/:taskId`
- `POST /v1/team/tasks/:taskId/archive`
- `GET /v1/team/plans`
- `GET /v1/team/runs`
- `GET /v1/team/runs/:runId`
- `GET /v1/team/runs/:runId/tasks/:taskId/attempts`
- `GET /v1/team/runs/:runId/tasks/:taskId/attempts/:attemptId/files/:fileName`

Agent 分支卡片默认通过同源 `/playground?view=chat&agentId=<agentId>&embed=team-console` iframe 打开主项目页面；开发态由 Vite 代理到主服务，显式配置 `VITE_TEAM_CONSOLE_PLAYGROUND_BASE_URL` 时才改为对应公网 origin。主 `/playground` 负责读取 `agentId` URL hint、切到对应 Agent 并继续处理自己的路由、对话、文件库、后台任务等行为；`embed=team-console` 会把 iframe 顶部 Agent 标签固定为只读标识，关闭 hover 切换菜单和点击跳转，避免 iframe 内 Agent 切换污染其他分支或主页面的 active Agent 选择。

Live API 模式默认进入干净的 `Agent workspace`，不会在刷新或重新进入时自动渲染历史 Plan run。需要查看 Plan 运行图时，点击顶部 live 运行图切换条里的“最新 Run”，页面会按 `createdAt` 选择最新 run，再用该 run 的 `planId` 匹配 plan 后渲染执行图。Agent workspace 工具栏支持手动点击“刷新 Task”重新请求 `GET /v1/team/tasks`；刷新中会禁用重复点击，失败只显示错误，不清空现有 Task 卡片。当前端轮询到已知 active Canvas Task run 进入终态时，也会自动执行一次 live Task refresh，重新读取 `GET /v1/team/tasks`、`GET /v1/team/task-connections` 和每个 Task 的 `GET /v1/team/tasks/:taskId/runs`，用于发现 typed chain 自动触发的下游 Task run；用户从上游 Task 切到下游 Task 时不需要手动刷新。Task 操作菜单里的“运行”会单独调用 Canvas Task run API，不写入 Plan run 列表。请求失败会在页面顶部显示错误，不会继续展示旧 mock 数据。

为了兼容尚未部署 Typed Task Chain V1 后端的主服务，`GET /v1/team/task-connections` 返回 404 时前端会当作空连接列表处理，不阻断 Agent / Task catalog 和“创建 Task”入口；但创建连接、画真实连接线和上游完成后自动触发下游 run 仍需要后端提供 `/v1/team/task-connections` 写接口和 typed artifact 触发逻辑。source node / source connection 后端能力也已独立接入 Live API adapter；前端最小封装只负责请求真实 source catalog 和连接写接口，不把 source node 存进 Task 定义或本地画布状态。

## Agent Atlas MVP

Team Console preview 现在把 Agent 节点放进同一张 Execution Atlas 画布，不再额外打开独立 Agent Canvas。默认 Mock 入口是干净的 `Agent workspace`，不显示旧 demo run；需要验证运行图时再切换到“顺序 run”等 fixture。

Mock 模式使用 deterministic Agent fixture，可把主 Agent、搜索 Agent 等真实主项目 Agent profile 概念加入 Atlas；同一个 `agentId` 在同一画布内只能加入一次，已加入项会在选择器里禁用。Agent 节点复用 Execution Atlas 的网格、节点样式、pan/zoom 和“重置视图”工具，并把 `GET /v1/agents/status` 的真实状态投到卡片状态条和状态 pill 上：空闲为绿色静态条，运行中为暖橘红脉冲条，状态读取失败时显示“状态未知”。普通画布态可拖拽 Agent / Task / Source 卡片；在空白画布左键长按后拖动可框选多个 Agent / Task / Source 节点（Shift + 拖动仍兼容直接框选），再拖动任一已选节点会整体移动选中集合。顶部 segmented filter 可按 `ALL / Agent / Task` 分类过滤可见根节点，filter 切换只影响显示不删除状态。底部 macOS-like Dock 承载已收纳的 Agent / Task / Source 根节点，可拖入 Dock 收纳（带缩小飞入动画），点击 Dock item 恢复到收纳前位置（带弹出动画）。拖动根节点时右下角出现垃圾桶 drop target，拖入后对 Task / Source 走软归档确认，对 Agent 走本地移出确认。Live API 下已添加 Agent、Task 和 Source 的拖动位置会写入浏览器 `localStorage`，刷新后恢复；刷新还会恢复当前画布 viewport、已展开的 Agent / Task 分支、底部 Dock 收纳状态和 segmented filter 选择，这些只保存 Team Console 画布 UI 引用，不修改真实 Agent profile、Task 定义或 Source 内容。Agent 或分支节点向右拖动时只改变画布内世界坐标，不允许撑开外层页面宽度或带动画布 pan。

单击 Agent 节点会展开一个 Agent 分支卡片，而不是进入特殊 Focus 视窗。普通 Execution Atlas 节点层、其他 Agent、runtime nodes、links、evidence 和添加 / 缩放工具都会继续显示；点击同一 Agent 节点会收起该分支，点击另一个 Agent 节点会把分支切换到对应 `agentId`。分支卡片按上层浮窗处理，不再为了避让周围节点自动右移；允许覆盖其他节点，用户可拖动画布或拖动分支标题栏调整位置，并可从右下角调整分支宽高。对话分支提供最大化按钮，标题栏双击也可最大化 / 还原；最大化后会渲染到未缩放的画布 overlay，避免在缩放世界里继续放大 iframe 造成文字发糊；还原后回到原画布节点。分支位置使用画布世界坐标，允许拖过原点上方或左侧；拖动分支标题栏不会带动画布平移。Agent 到分支的连接线统一使用节点右侧中点到目标左侧中点的短 hook 曲线，端点附近快速转出，中段保持低弯曲。

Agent 分支卡片内部是主项目 `/playground` 的 iframe，URL 形如 `/playground?view=chat&agentId=main&embed=team-console`。Team Console 不再维护本地 transcript + composer、不再复制 scoped chat stream/state/history/queue/interrupt/file library；这些真实行为全部交还给主 `/playground`。主 `/playground` 读取 `agentId` URL hint 后进入对应 Agent，因此主 Agent 卡片打开主 Agent 对话，搜索 Agent 卡片打开搜索 Agent 对话；`embed=team-console` 会锁定 iframe 顶部 Agent 标签，关闭 hover 切换菜单和点击跳转，同时不写入主页面共用的 active-agent localStorage，避免一个分支或主页面的手动切换污染其他 Agent 分支。iframe 内的主项目路由跳转继续由主项目自己处理。当前仍不做 Agent clone、instance、profile overlay、画布局部技能安装、WorkUnit 节点或 Plan 编排，也不恢复 Team Runtime 按钮、移动端专项或 artifact preview。

## Task / WorkUnit 画布准备

Task 内部包含一个 WorkUnit。Team Console preview 现在从 `GET /v1/team/tasks` 读取 Task catalog，Mock fixture 也提供 deterministic Task / WorkUnit 数据；Task 不是单任务 Plan，也不会从 iframe 聊天文本里临时拼出来。Task 卡片会展示 `leaderAgentId`、`workerAgentId` 和 `checkerAgentId` 对应的 Agent 名称，让用户在 Atlas 里先看清谁负责澄清、谁负责执行、谁负责验收。

Task / WorkUnit 的 typed chain V1 已把 Task 卡片变成可连接的积木单元：Task 可声明 `inputPorts` 和 `outputPorts`，每个 port 必须有 `type`，例如 `md`、`html`、`json`、`audio`。前端只允许从上游 output port 连到下游 input port，且 `output.type === input.type`；类型不匹配时会在 UI 直接拦截，后端创建 `fromTaskId/fromOutputPortId -> toTaskId/toInputPortId` connection 时仍会做权威校验，并拒绝重复连接、自连接和会形成环的连接。连接成功后 Execution Atlas 会渲染 Task 间连接线。上游 Task run 成功并通过 checker 后，后端会用 accepted result 生成 typed artifact（包含 type、来源 Task、来源 run、文件引用、文本预览和内容片段），并把它作为 bound input 自动启动下游 Task run；下游 Agent 不需要靠猜测文件路径接活。V1 只做 typed port 连接和自动下游触发，不做任意复杂自由画布编排、条件分支、循环或真实 TTS；同一 output port 可以 fan-out 连接到多个不同下游 Task 的同类型 input port，上游 accepted result 会独立分发给每个下游。

Control dependency 是 typed connection 之外的另一条边，只表达"Task A 成功完成后自动启动 Task B"，不传数据、不要求 `inputPorts` / `outputPorts`、不生成 typed artifact、不写 `boundInputs`。无 ports 的 Task 也可以通过 control dependency 串行运行。用户在 Task 卡片上点击 dependency handle（区别于 typed port chip），选择 source Task，再点击 target Task 的 dependency handle 完成创建；Execution Atlas 会渲染一条 dashed amber 线（`.emap-link-task-dependency`）。后端 API 为 `GET /v1/team/task-dependencies`、`POST /v1/team/task-dependencies`、`DELETE /v1/team/task-dependencies/:dependencyId`，持久化为 `.data/team/task-dependencies.json`。Cycle 防护覆盖 typed connections + control dependencies 的混合图。Stale dependency（source 或 target Task 缺失 / 归档）不渲染线、不触发下游。Mock 模式下 dependency handle 可正常交互。
Canvas source node 是另一条更窄的输入链路：工具栏“文本输出”会创建可编辑 text source，输出类型为 `string`；“文件输出”会打开文件选择器并按扩展名推断 `md` / `json` / `html` / `string` / `file`。source node 只提供 `value` output，可作为独立根节点拖动、框选和收纳到底部 Dock；source connection 只允许连到类型相同的 Task input port。直接点击 Task “运行”时，后端会把 active source connection 注入该 run 的 `source.boundInputs[]`、payload 和 prompt。source node 不伪装成 Task artifact，不携带 `sourceTaskId` / `sourceRunId` / `sourceAttemptId`，也不会因为创建、更新或连接 source node 自动启动 Task；它只是 direct Canvas Task run 的显式输入。

点击 Task 卡片会先展开紧凑 Task 操作菜单节点，而不是直接进入 iframe 或撑开大面板。菜单只保留操作按钮（”运行””编辑””对话 Leader””删除”）和紧凑运行摘要：运行调用 `POST /v1/team/tasks/:taskId/runs` 启动独立 Canvas Task run，运行状态通过 `GET /v1/team/task-runs/:runId` 轮询回菜单和 Task 卡片；这个 run 存在独立 task-runs 工作区，不会进入 `/v1/team/runs` 的 Plan run 列表，也不会把 Task 偷换成 `Plan tasks.length === 1`。后端 Canvas Task run admission 只按同一 Task active run 做 guard：不同 Task 可以同时运行，同一 Task 同时只允许一个 active run；`TEAM_MAX_CONCURRENT_RUNS` 只约束 Plan / TeamOrchestrator run，不约束 Canvas Task run。第一版 Task run 只执行 WorkUnit 的 worker → checker，leader 仍只负责运行前沟通和草案维护，不额外启动 watcher/finalizer；运行中菜单显示”运行中”和”停止”，停止会调用 `POST /v1/team/task-runs/:runId/cancel`。点击菜单里的”最近运行”或”运行中”摘要会展开或收起 Run observer。Run observer 使用单个合并 `run-observer` 面板，而不是多个独立 canvas 子节点。合并面板内部固定顺序为：Worker 过程 → worker 输出文件 → Checker 过程 → checker 输出文件 → result 文件；视觉上按阶段流展示，Worker / Checker 过程段固定高度并在段内滚动，使用符合主题的细滚动块（worker 偏青色，checker 偏金色），整个 observer 外层不显示滚动条并按实际内容高度自适应测量。过程区不再像独立小卡片堆叠，只有实际存在文件时才渲染对应文件 tray，运行刚开始时空的第 2 / 4 / 5 段不显示“暂无文件”占位。文件条目以紧凑行（`.emap-observer-file-row`）展示在合并面板内部，而不是单独的 canvas 节点；文件行只展示 Agent 名字（从 agentsById 解析）、文件名和路径。点击文件行会在右侧展开第二级文件详情面板，根据文件扩展名使用安全渲染（JSON pretty print、Markdown 使用 `marked` 安全渲染、文本原样展示），不执行原始 HTML，不注入 script；Markdown 渲染通过 `src/shared/markdown.ts` 的 `renderTeamMarkdown()`，配置与主项目 `src/ui/playground-markdown.ts` 一致（GFM tables、HTML 转义、只允许 http/https 链接、`target="_blank" rel="noreferrer noopener"`）；JSON 解析失败时会显示 parse error 消息。

过程部分消费 additive contract `attempt.roleProcesses.worker` / `attempt.roleProcesses.checker`，按优先级展示：(1) `assistantText.content`（Agent 自述 / 推理文本，`formatAssistantText()` 保留换行、中文标点自然断句、每行独立 `<p>`，最多 5 行超限显示”已隐藏 X 行”，单行超过 200 字符会截断并显示”已截断 X 长行”，`max-height: 172px` 内部滚动），(2) `assistantText` 缺失时的 current action + 最新 narration 回退。过程部分不再渲染下半部 tool / method 调用明细，不显示 tool group 折叠区或隐藏计数；完整过程数据仍来自后端 attempt metadata，前端不丢数据，只隐藏 DOM 明细。

合并 observer 面板支持拖动：拖动 Task 根节点会以相同 dx/dy 移动菜单及已展开的 observer 面板和文件详情面板；拖动菜单节点同样会带走 observer 和文件详情；拖动 observer 面板只移动自身；拖动文件详情叶子节点只移动自身。编辑节点的拖动把手在标题栏，表单控件区域不参与拖动。所有拖动系统使用延迟 pointer capture：pointerdown 时不调用 setPointerCapture，只有 pointermove 距离超过 4px 阈值后才捕获 pointer，避免微小手抖阻止正常的点击和文本选择。节点间连接线使用单条连续 cubic：source 固定右侧中点 / 右侧出线，target 固定左侧中点 / 左侧入线；反向角度只通过两端水平控制柄表达出入线，不再拆成多段 hook，避免近距离斜向连接出现切角。连接线只在 source 出线端显示吸附在卡片右边缘的半圆 socket，target 入线端不再显示圆环或圆点，减少视觉噪音。文件详情节点支持右下角拖动调整宽高，最小尺寸 360×280；详情内容区无固定 max-height 限制，resize 后内容 flex-fill。拖动后子节点的 SVG connector 会使用父节点的新位置作为 source，不会残留旧坐标。Live API 后端缺少 `roleProcesses` 时会显示等待过程数据，role process 为 `null` 或条目为空时显示暂无过程条目，不报错。运行中的 observer 不渲染空文件占位节点，不显示 `正在刷新...` / `最后刷新` 这类随轮询变化的刷新元信息，active run 轮询的瞬时连接失败也不插入红色错误节点，以保留现有画面稳定性；终态 run 的读取失败仍显示错误。拖动 Task 根节点、菜单节点或 resize 文件详情时，会暂停 Task branch / child panel 的自动高度测量，避免运行中轮询刷新强制 layout 导致节点拖动卡顿或闪烁。Run observer 当前使用 `GET /v1/team/task-runs/:runId` 轮询读取 run state，不接 SSE，也不新增 endpoint。

整体布局遵循 Task → 菜单 → 二级节点（编辑/leader chat/run observer/文件详情）的层级关系。多个 Task 的菜单可以同时展开，每个 Task 的编辑、Leader chat 和 Run observer 作为按 Task 独立的二级 panel 同时存在，互不影响。每个活跃 Task 菜单的 shell 高度测量独立维护（`taskBranchMeasuredSizes` / `taskBranchShellRefs` map），切换聚焦 Task 不会让其他 Task 的二级面板重新定位或连接线错锚；child panel connector 只锚定自己所属的 parent menu，不再因 `sourceId` 无法解析而回退到主 `taskBranchNode`。Task 操作菜单中的所有二级入口（”编辑””对话 Leader””最近运行”）统一具备 toggle 行为：再次点击同一入口会收起当前二级节点回到菜单状态，第三次点击重新展开；toggle 只作用于被点击的 Task branch，不影响其他 Task 已展开的菜单或二级 panel。打开编辑节点时只在没有现存 draft 时初始化 draft，toggle 收起再展开不会丢失未保存的编辑草稿。点击”编辑”或”对话 Leader”不会替换一级菜单，也不会关闭其他 Task 的二级节点，而是在对应菜单右侧展开二级编辑节点或 leader Agent iframe 节点，连接线使用 fixed right-middle 到 left-middle 锚点；对话 Leader 复用 Agent 分支卡片的 header、iframe、右下角 resize handle、最大化按钮和标题栏双击最大化 / 还原，URL 形如 `/playground?view=chat&agentId=<leaderAgentId>&embed=team-console&teamTaskId=<taskId>&teamTaskMode=edit`；observer 文件详情面板也支持标题栏双击最大化 / 还原，左键按住标题栏拖动仍保持原行为。Run observer panel id 按 `branch.nodeId` 稳定命名（`run-observer-${branch.nodeId}`），不因打开数量变化而切换 id，确保布局状态（`panelPositionOverrides` / `panelMeasuredHeights` / `panelSizeOverrides`）在打开新 observer 时不会丢失。Task 操作菜单、编辑节点、Leader 对话节点、Run observer 面板被用户手动拖动后，收起再展开时会保留上一次的画布世界坐标位置；可 resize 的编辑节点和 Leader 对话节点调整尺寸后，收起再展开时也会保留上一次尺寸。编辑草稿（`taskEditDraftByTaskId`）、保存中状态（`taskEditSavingByTaskId`）和冲突警告（`taskEditWarningByTaskId`）按 `taskId` 隔离，多个编辑节点同时打开时互不覆盖。删除会二次确认并调用 `POST /v1/team/tasks/:taskId/archive` 做软归档，成功后重新请求 `GET /v1/team/tasks` 并关闭分支。Agent / Task / Source 根卡片可通过右下角收纳按钮或拖入底部 Dock 收纳；收纳时根卡片、对应分支和连接线不占用画布空间，收纳有缩小飞入动画。点击 Dock 条目会把根节点弹出恢复到收纳前位置，并恢复收纳前保留的展开状态。拖动根节点时右下角出现垃圾桶 drop target，拖入后对 Task / Source 走软归档确认流程，对 Agent 只做本地画布移出。顶部 segmented filter（`ALL / Agent / Task`）可按分类过滤可见根节点，切换不影响节点位置、收纳状态或展开状态。空白画布左键长按后拖动可框选多个根节点，拖动任一已选节点会整体移动选中集合。

Agent / Task / Source 根卡片右下角除收纳按钮外，还各带一个清理入口。Source 根卡片和 Task 根卡片的清理按钮调用”归档”，点击后弹出自定义确认 modal（`role=”dialog”`、`aria-modal=”true”`），包含对象名称、影响说明、”取消”和”确认归档”按钮；确认后分别调用 `POST /v1/team/source-nodes/:sourceNodeId/archive` 和 `POST /v1/team/tasks/:taskId/archive`，归档成功后根卡片、Dock 条目、相关连接线、展开分支和本地 UI 状态同步清理，刷新页面后不会恢复已归档的 Task / Source。Agent 根卡片的清理按钮调用”移除”，确认后只从 Team Console 画布移除本地引用（canvas 节点、Dock 条目、展开分支和 localStorage 位置），不会调用 Agent profile archive API，真实 Agent profile 不受影响。垃圾桶 drop 支持批量确认：多选根节点拖入垃圾桶时会打开批量确认 modal，列出数量和前几个名称；确认后按类型执行对应清理语义。归档失败时 modal 保持打开并在页面顶部 error banner 显示错误信息；Escape 键可在非保存中关闭 modal。

打开 Leader 对话分支时，header 右侧提供”复制 Task 上下文”紧凑按钮，点击后将 taskId、title、status、agents、input text、input/output ports、output contract、acceptance rules、teamTaskMode 和 teamTaskId 等格式化纯文本复制到剪贴板，方便粘贴到 Leader 对话中。复制优先使用 Clipboard API，远程 HTTP 非安全上下文自动 fallback 到隐藏 textarea + `execCommand("copy")`；两种路径都失败时显示”复制失败”状态提示，并临时展开一个小型只读文本框自动选中上下文，用户可按 Ctrl+C 手动复制。面板默认不展示完整 Task context 预览文本。Team Console 仍不解析 iframe 聊天文本，仍不自动更新 Task 定义。

菜单里的“编辑”是浅编辑节点，只允许修改 Task 名称、`leaderAgentId`、`workerAgentId` 和 `checkerAgentId`。编辑节点打开时会记录 base snapshot 和 dirty fields；保存时只发送用户实际改过的字段。如果只改 Task 名称或 leader Agent，前端只发送对应字段；如果改 worker/checker，前端用最新 Task catalog 里的 `workUnit` 合成完整 PATCH 并只替换对应 Agent 绑定，避免旧草稿覆盖 Leader 对话或刷新带回的新 WorkUnit 数据。若同一字段在草稿打开后已被后台刷新改变，保存会被阻止并提示重新打开编辑节点。复杂需求、input text、output contract 和 acceptance rules 仍必须通过 Leader 对话里的 `/team-task` 流程维护；Team Console 不解析 iframe 聊天文本创建或更新 Task，不把复杂 WorkUnit 字段做成可视化编辑器。

Live API 工具栏的“创建 Task”会先展示当前 Agent catalog，让用户选择 leader Agent；选择后 Team Console 只打开 leader Agent iframe，不直接创建 Task。创建分支 URL 形如 `/playground?view=chat&agentId=<leaderAgentId>&embed=team-console&teamTaskMode=create`，不携带 `teamTaskId`。真正的创建由 iframe 内用户显式使用 `/team-task` skill 调用 `POST /v1/team/tasks` 完成；Team Console 不读 iframe 聊天文本、不替用户确认 JSON、不把 draft 写进本地状态。关闭创建分支后会重新请求 `GET /v1/team/tasks`，用于把 skill 创建成功后的 Task 卡片刷新回画布。

Live API 模式下 Task / Source 卡片拖动位置会写入浏览器 `localStorage` 并在刷新后恢复，但只保存 id 和画布坐标，不保存 WorkUnit 内容、`leaderAgentId`、`workerAgentId`、`checkerAgentId`、Source 内容或 Task run 定义。Team Console 另用 `canvas-ui-state` 保存 viewport、展开分支、Dock 收纳 id 和 segmented filter 选择；恢复时会按当前 Agent / Task / Source catalog 清理过期 id。Task 定义始终以后端 `GET /v1/team/tasks` 返回为准；Source 定义始终以后端 `GET /v1/team/source-nodes` 返回为准；Task run 状态始终以后端 `GET /v1/team/tasks/:taskId/runs` / `GET /v1/team/task-runs/:runId` 返回为准。

Mock fixture 覆盖以下场景：

- 顺序 run
- 发现 + 逐项处理动态 run
- 任务拆分 run
- 失败 run
- 含未归属子任务 run
- 大量子任务 run（10 个子任务）
- 含跳过任务 run
- 真实 run snapshot（脱敏后的真实执行记录，用于验证长错误、API 错误、resultRef、ghost result 和最终汇报）
- 真实 run snapshot 2（脱敏后的全成功 for_each 执行记录，用于验证 13 个子任务折叠/展开、真实 attempt metadata/file、artifact preview 和桌面 pan/zoom）

## Execution Atlas 视觉设计

纵向流式执行图，根节点在顶部，主任务沿左侧 spine 向下排列，子任务分支到右侧。当前目标是执行地图展示，不是编辑器、拖拽脑图或运行时控制台。

### 节点样式

- 每个节点有 4px 左侧状态色条（running=蓝色脉冲、succeeded=绿色、failed=红色、paused=黄色、dimmed=灰色半透明）
- 选中节点有 accent 色发光边框；chain-selected（从根到选中节点的路径）使用 `color-mix` 半透明混合
- 失败节点有红色边框渐变和错误首行文本
- 折叠节点使用虚线边框，orphan 节点使用点线边框
- `data-kind` 属性支持按节点类型做 CSS 选择器
- Agent / Task 画布卡片共享 `.emap-atlas-card` 基类；Task 一级菜单使用 `.emap-menu-branch`；iframe 对话分支使用 `.emap-dialog-branch`

### 连接线

- Spine（根→主任务→主任务）：center-to-center 三次贝塞尔曲线
- Branch（主任务→子任务、Task 菜单、Agent / Leader 分支）：平滑三次贝塞尔曲线；所有前后节点连接的 source 端统一显示吸附在卡片右边缘的半圆 socket，target 端不显示额外标记
- 选中链路的连接线高亮为 accent 色

### 任务 evidence 分支

点击 root 或普通 task 节点会切换选中状态；再次点击同一节点会收起。Collapsed summary 可展开/收起。

选中普通 task 后，任务节点本身保持紧凑，不再打开固定右侧栏，也不再在节点内部堆大段详情。可展示的信息会作为 `.execution-map-nodes` 的同级 evidence card 从任务节点旁边长出来：

- 结果：来自当前 task 的 `resultRef`，显示 filename、已接受 / 失败 / 最终汇报标签和弱化路径
- 错误：来自 `errorSummary` 的错误摘要卡片
- 尝试：来自 `activeAttemptId` 的 attempt 卡片
- 进度：来自 `progress.phase` / `progress.message` 的进度卡片
- Worker / Checker / Watcher / 最终结果 artifact：优先来自真实 `TeamAttemptMetadata`，不会为缺失文件伪造卡片
- for_each 父任务：有 visible children（子任务数 ≤ 阈值或已展开）时**不显示** evidence；无 visible children 时显示当前任务自身的结果 / 错误 / 进度

只有通过当前 task/attempt 匹配、且文件名存在于 attempt metadata `files` 白名单里的 file-backed artifact card 会渲染为可点击 `button`，并调用 `readAttemptFile()`。Fallback 的 Error / Attempt / Progress evidence 是静态信息卡，不会假装能打开文件，也不会点出"文件不在当前 attempt metadata 中"这类假预览错误。

点击可预览 artifact card 会读取同一 run/task/attempt 下的真实 attempt 文件并展开第二级预览节点：`.md` / `.txt` 按安全文本展示，`.json` pretty print，`.html` 只放进 sandbox iframe，不注入主 DOM。

桌面端 evidence / preview card 使用 absolute 定位在 selected node 右侧，并由 dashed SVG link 连接。桌面画布支持鼠标滚轮缩放、背景拖拽平移、空白画布左键长按框选多节点（Shift + 拖动仍兼容直接框选）、拖动已选节点集合，以及”放大 / 缩小 / 重置视图”工具按钮；这些只是本地 UI 状态，不持久化。Evidence / preview 的布局高度测量以 transform-independent 的 `offsetHeight` 为准，避免 CSS scale 后把 `getBoundingClientRect().height` 写回 layout 造成测量反馈循环；滚轮缩放使用原生 non-passive `wheel` listener。移动端 `720px` 以下 evidence / preview card 改为 normal flow，同级插入在 selected node 正下方，保持 8px gap 和无横向 overflow。

### 折叠行为

超过 `CHILD_COLLAPSE_THRESHOLD`(6) 个子任务时折叠为摘要节点，摘要状态按隐藏子任务聚合计算。点击摘要节点可展开全部子任务；展开后末尾显示"收起"按钮，再次点击收起。展开/收起时布局同步更新。

### 响应式

`@media (max-width: 720px)` 时连接线隐藏，节点改为纵向堆叠，并禁用自定义 pan/zoom 工具条。本轮没有做移动端 toolbar / 添加入口专项修复，也没有做移动端深度设计，只做不明显横向炸版的最小烟测。

## 架构

- `src/app/` — App shell、状态管理、数据源切换
- `src/api/` — Team API 类型定义和 adapter
- `src/fixtures/` — Mock fixture 数据
- `src/graph/` — Execution Map model、layout、React 组件、CSS
- `src/shared/` — 通用工具函数（含 `markdown.ts` 安全 Markdown 渲染）
- `src/features/` — 功能模块占位（后续迭代）

## 当前边界

- 仍是独立 preview，不替换 `/playground/team`
- 不调用 Plan run 的 manual disposition、rerun、pause/resume/cancel API；Canvas Task 菜单只接入独立 Task run 的 create/cancel
- 只通过现有只读 API 读取 attempt metadata 和 attempt file，不新增写操作
- Typed Task Chain V1 支持 typed port 连接、上游完成后的自动下游触发和同一 output port fan-out 到多个不同下游 Task；不做自由画布工作流编辑器、条件分支、循环、多上游 merge、wait-all 或同一 target Task 多 input bundling
- Agent Atlas 只引用已有 Agent catalog，不创建或修改主项目 Agent profile
- 不支持节点创建、minimap、持久化视图或编辑 Plan；Agent / Task 卡片拖拽只是本地画布引用位置调整，左键长按框选和 Shift 框选只影响当前画布选择态
- Execution Atlas 只做执行图展示、task evidence 选择、artifact 预览和桌面 pan/zoom；大量子任务会折叠为 summary node，并按隐藏子任务状态汇总显示；折叠节点可展开/收起
- Task run 并发边界：不同 Task 可以同时运行，每个 Task 内部同时只允许一个 active run。Task A 运行中不会禁用 Task B 的"运行"按钮；同一 Task 的"运行"按钮在有 active run 时显示"运行中"并禁用，直到该 run 进入终态。后端同样按 `taskId` 做 active guard，Canvas Task run 不使用 `TEAM_MAX_CONCURRENT_RUNS`；该变量只管 Plan / TeamOrchestrator run admission。Run observer 和轮询按 `taskId + runId` 独立工作。用户需自行注意跨 Task 资源冲突。
