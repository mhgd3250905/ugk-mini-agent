# Playground 当前状态

更新时间：`2026-05-26`

## 2026-05-25 Team Console Typed Task Chain V1

- 独立 Team Console preview 现在把 Task 卡片渲染为 typed port 积木：`inputPorts` / `outputPorts` 会显示在卡片底部，port chip 标出 label 和 type。
- 用户从 output port 发起连接，只能连到同类型 input port；前端会拦截 `md -> html` 这种错误直连，后端 `POST /v1/team/task-connections` 仍是权威校验，负责拒绝类型不匹配、重复连接、自连接和 DAG cycle。
- Live API 初始化和刷新现在会请求 `GET /v1/team/task-connections`，连接成功后 Execution Atlas 画出 Task 间 connection path；连接数据结构是 `fromTaskId/fromOutputPortId -> toTaskId/toInputPortId`。
- 上游 Canvas Task run 成功并通过 checker 后，后端会把 `accepted-result.md` 封装成 typed artifact（type、source task/run/attempt、fileRef、preview、content），并作为 `boundInputs` 自动启动下游 Task run；下游 Agent 收到明确绑定输入，不需要猜上游文件路径。
- V1 只做 typed port 连接和自动下游触发，不做自由画布复杂编排、条件分支、循环、真实 TTS 或 SSE。第一条真实验收链路按“搜集内容 Task 输出 `md` -> HTML 制作 Task 输入 `md`、输出 `html`”验证。
- 相关源码：`src/team/task-port-contract.ts`、`src/team/task-connection-store.ts`、`src/team/task-run-service.ts`、`src/team/routes.ts`、`apps/team-console/src/api/team-api.ts`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/graph/execution-map.css`

## 2026-05-26 Team Console Merged Run Observer Panel

- Task Run observer 使用单个合并 `run-observer` 面板，替代之前多个独立 canvas 子节点（Worker 过程、Checker 过程、文件节点、文件详情）。
- 合并面板内部固定顺序为：worker 过程 → worker 输出文件 → checker 过程 → checker 输出文件 → result 文件。
- 文件条目以紧凑行（`.emap-observer-file-row`）展示在合并面板内部，而不是单独的 canvas 节点。
- 点击文件行会在右侧展开第二级文件详情面板。
- Task 菜单只保留操作按钮和紧凑运行摘要。
- 连接线使用 fixed right-middle 到 left-middle 锚点；反向角度时仍从父节点右侧先出线，再用平滑 S 曲线绕回子节点左侧；卡片接触点显示圆环 + 中心点标记，让接线处更明确。
- 拖动语义保持层级化：拖 Task 根节点或菜单节点仍会带动已展开 observer 面板和文件详情面板，单独拖 observer 面板只移动自身，拖文件详情叶子节点只移动自身。

## 2026-05-25 Team Console Task run process nodes

- 过程数据已合并进单个 `run-observer` 面板（见 2026-05-26 变更日志）。过程部分消费 `attempt.roleProcesses.worker` / `attempt.roleProcesses.checker`；缺少 `roleProcesses` 或 role process 为 `null` 时显示等待过程数据 / 暂无过程条目，不报错。
- 过程部分按优先级展示：(1) `assistantText.content`（Agent 自述 / 推理文本，保留换行、按中文标点自然断句、每行独立渲染为 `<p>`，最多 5 行超出显示”已隐藏 X 行”，单行超过 200 字符会截断并显示”已截断 X 长行”，`max-height: 172px` 内部滚动），(2) current action + 最新 narration（assistantText 缺失时的 fallback）。
- 过程部分不再渲染下半部 tool / method 调用明细，不显示 tool group 折叠区或隐藏计数；完整过程数据仍保留在后端 attempt metadata 中。
- 完整过程数据仍来自后端 attempt metadata；Team Console 前端只做 DOM 渲染限流，不丢弃完整过程数据。
- 运行中的 observer 不渲染空文件占位节点，不显示 `正在刷新...` / `最后刷新` 这类随轮询变化的刷新元信息，active run 轮询的瞬时连接失败不插入红色错误节点，避免”暂无 attempt 文件””无法连接服务器”和刷新时间在运行中随轮询闪烁；拖动 Task 根节点、菜单节点或 resize 文件详情时，会暂停 Task branch / child panel 自动高度测量，避免运行中轮询刷新强制 layout 导致卡顿和闪烁；仍不接 SSE，不新增 endpoint，不改主 `/playground`。
- 相关源码：`apps/team-console/src/api/team-types.ts`、`apps/team-console/src/fixtures/team-fixtures.ts`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/tests/app.test.tsx`

## 2026-05-25 Team Console Task run observer 拖拽与安全 Markdown

- 合并 observer 面板和文件详情面板均可自由拖动：pointerdown 只记录起点，pointermove 超过 4px 阈值后才进入拖动状态并移动面板；未超阈值时 click 正常传递，点击文件行能正常展开详情；拖动结束后下一次 click 会被抑制，防止误触展开。Task 操作树使用层级拖动语义：拖动 Task 根节点会以相同 dx/dy 移动菜单及已展开的 observer 面板和文件详情面板；拖动菜单节点同样带走 observer 和文件详情；拖动 observer 面板只移动自身；拖动文件详情叶子节点只移动自身。编辑节点的拖动把手在标题栏，表单控件不参与拖动。所有拖动系统使用延迟 pointer capture：pointerdown 时不调用 setPointerCapture，只有 pointermove 距离超过 4px 阈值后才捕获 pointer，避免微小手抖阻止正常点击和文本选择。
- 文件详情内容使用 `marked` 安全 Markdown 渲染（`apps/team-console/src/shared/markdown.ts`），配置与主项目 `src/ui/playground-markdown.ts` 一致：GFM tables、HTML 转义、只允许 http/https 链接、`target="_blank" rel="noreferrer noopener"`。
- 文件详情节点内容区移除固定 max-height 限制，resize 后内容 flex-fill。
- 子节点 connector 和新展开的文件详情节点都使用父节点的 final（拖动后的）rect 作为 source / anchor；连接线使用 fixed right-middle 到 left-middle 锚点，反向角度时仍从父节点右侧先出线，再用平滑 S 曲线绕回子节点左侧；source / target 接触点渲染圆环 + 圆点锚点。
- 仍不接 SSE；前端轮询现有 Task run state、attempt metadata 和 attempt file API。

## 2026-05-25 Team Console Task run observer 多节点渲染

- 独立 Team Console preview 的 Task 操作菜单中，"最近运行"或 active run 的"运行中"摘要现在是可点击入口，会展开 Run observer。
- Run observer 使用单个合并 `run-observer` 面板（见 2026-05-26 变更日志），内部固定顺序：worker 过程 → worker 输出文件 → checker 过程 → checker 输出文件 → result 文件；视觉上按阶段流展示，不再像几个小节点堆在同一壳里。Worker / Checker 过程段固定高度并在段内滚动，使用符合主题的细滚动块（worker 偏青色，checker 偏金色）；observer 外层不显示滚动条，节点高度按固定过程段和实际文件 tray 自适应测量。
- 文件条目以紧凑行（`.emap-observer-file-row`）展示在合并面板内部，只展示 Agent 名字（从 agentsById 解析）、文件名和路径，不展示 runtime context 长文本或 verdict 摘要；只有实际存在文件时才显示对应文件 tray，运行刚开始时空文件区不显示“暂无文件”占位。
- 点击文件行会在右侧展开第二级文件详情面板，根据文件扩展名使用安全渲染：JSON pretty print（解析失败显示 parse error）、Markdown 使用 `marked` 安全渲染（`renderTeamMarkdown()`）、其他文本原样 `<pre>` 展示。文件详情面板支持右下角拖动调整宽高，最小尺寸 360×280。
- 这仍属于 `apps/team-console/` 独立 preview 行为，不替换 `/playground/team`，也不解析嵌入 iframe 的聊天文本。
- 相关源码：`apps/team-console/src/app/App.tsx`、`apps/team-console/src/graph/ExecutionMap.tsx`、`apps/team-console/src/graph/execution-map.css`、`apps/team-console/src/shared/markdown.ts`、`apps/team-console/src/api/team-api.ts`、`apps/team-console/src/fixtures/team-fixtures.ts`

## 2026-05-23 Qwen reasoning stream heartbeat

- `ali-codeplan / qwen3.7-max` 这类 Anthropic-compatible 流式响应可能先返回较长 reasoning / thinking 阶段；后端现在把 `thinking_start`、`thinking_delta`、`thinking_end` 转成内部 `heartbeat` 事件保活，不展示 thinking 内容，也不写入最终回答文本。
- Playground 收到 `heartbeat` 时只更新助手状态为“正在推理”，不追加 `state.streamingText`，后续 `text_delta` 和 `done` 仍按原路径完成。
- 运行日志分页把 `heartbeat` 和 `text_delta` 一样视为噪声事件过滤，避免长推理模型把历史事件列表刷满。
- 相关源码：`src/agent/agent-session-event-adapter.ts`、`src/agent/agent-run-events.ts`、`src/routes/chat.ts`、`src/ui/playground-stream-controller.ts`、`src/types/api.ts`

## 2026-05-23 Team 计划详情团队预设

- `/playground/team` 的计划详情页现在在任务结构和运行记录之前显示当前计划绑定的预设团队。
- 预设团队区域展示执行、验收、复盘、汇总、任务拆分五个角色对应的 Agent；可直接切换到其他活跃团队。
- 点击“编辑团队”会复用预设团队编辑弹窗；保存后计划详情里的团队信息会同步刷新。
- 相关源码：`src/ui/team-page.ts`、`test/team-page-ui.test.ts`、`test/server.test.ts`

## 2026-05-23 Playground 独立工作台同标签跳转

- `/playground` 顶部的当前 Agent 标签和“后台任务”入口不再调用 `window.open(..., "_blank")`，而是用当前标签跳转到 `/playground/agents` 与 `/playground/conn`。
- 桌面顶部与手机更多菜单里的 `Team Runtime` 入口不再带 `target="_blank"`；点击后在当前标签进入 `/playground/team`。
- `/playground/agents`、`/playground/conn` 和 `/playground/team` 的左上角“返回对话”统一指向 `/playground?view=chat`；主 Playground 识别 `view=chat` 后直接恢复当前 Agent 的对话界面，而不是落回 Agent 选择首页。
- `/playground?view=chat&agentId=<agentId>` 会把 `agentId` URL hint 作为初始 active Agent；普通页面会同步写入 `ugk-pi:active-agent-id`，Team Console iframe 使用 `embed=team-console` 时只在当前页面内生效，不写入共享 localStorage，避免不同 Agent 分支互相污染。`embed=team-console` 下顶部 Agent 标签是固定标识，不打开 hover 切换菜单，也不会点击跳转独立 Agents 页。
- Team 页面仍是独立工作台，不嵌进主聊天 workspace；用户显式点击 Agent 菜单里的“返回首页”时会清掉 `view=chat` URL hint，避免刷新后又跳回对话。
- 相关源码：`src/ui/playground.ts`、`src/ui/agents-page.ts`、`src/ui/conn-page.ts`、`src/ui/playground-agent-manager.ts`、`src/ui/playground-conn-activity-controller.ts`、`src/ui/playground-page-shell.ts`、`src/ui/team-page.ts`、`test/server.test.ts`、`test/team-page-ui.test.ts`、`test/playground-agent-switch.test.ts`、`test/agent-model-ui.test.ts`

## 2026-05-23 Agents 技能卡片状态降噪

- `/playground/agents` 技能卡片不再显示单独的 `已启用 / 已关闭` 状态 badge；启用状态只由左侧 `开 / 关` switch 表达，避免同一卡片重复说同一件事。
- 技能卡片继续保留 `系统技能 / Agent 安装` 来源 badge 和压缩保存路径。
- 相关源码：`src/ui/agents-page.ts`、`test/server.test.ts`

## 2026-05-22 Agents 技能卡片密度与来源展示

- `/playground/agents` 选中 Agent 后点击“查看技能”，技能列表在桌面宽度下改为两列卡片，窄屏回退单列，避免一张技能卡片横向占满整个详情区。
- 每张技能卡片现在显示技能保存来源和压缩后的保存路径；来源由后端 `/v1/agents/:agentId/skills` 返回的 `storageKind` / `storageRoot` 判断，区分系统技能和 Agent 安装技能。
- 技能路径显示为可扫描的项目内短路径，完整路径保留在 hover title 中；深色和浅色主题都覆盖来源 badge，避免浅色模式低对比。
- 相关源码：`src/agent/agent-profile-catalog.ts`、`src/types/api.ts`、`src/ui/agents-page.ts`、`test/agent-profile-catalog.test.ts`、`test/server.test.ts`

## 2026-05-22 Chat 左侧会话列表降噪

- `/playground` Chat 左侧会话列表不再渲染第二行 `.mobile-conversation-preview` 小字摘要；每条会话只保留标题摘要和时间 / 运行中状态。
- 会话列表不再渲染消息条数 pill，避免标题、摘要、时间、条数四种信息挤在窄列里互相抢注意力。
- 移动会话抽屉复用同一渲染路径，行结构同步收成标题 + 时间两行；虚拟滚动移动 row pitch 从 `100px` 调整为 `80px`，继续与 CSS 行高 + gap 对齐。
- 相关源码：`src/ui/playground-conversations-controller.ts`、`src/ui/playground-styles.ts`、`src/ui/playground-assets.ts`、`src/ui/playground-theme-controller.ts`、`test/playground-conversations-controller.test.ts`、`test/server.test.ts`

## 2026-05-22 Conn 独立页 run history 加载状态

- `/playground/conn` 的运行历史现在显式区分未加载、加载中、加载失败、已加载空数组、可继续分页和分页加载中状态；这些状态都收在原 run history 区域内，不引入新的页面布局或装饰卡片。
- 首次点击“加载运行历史”后，区域会进入紧凑 loading 状态；失败时显示错误信息和“重试加载”按钮，已加载但无记录时显示“暂无运行历史”。
- 错误重试会检查当前 `selectedId`；如果用户已经切换到其他后台任务，旧任务面板残留按钮不会把旧 conn 的历史重新拉回来。
- “加载更多”在分页请求进行中会进入 `loading-more` 状态，禁用当前按钮并保留已加载列表、展开 run 和详情滚动位置。
- loading / error / loading-more 样式继续使用现有主题 token，深色和浅色主题共用同一套语义变量，不写单主题硬编码颜色。
- 相关源码：`src/ui/conn-page-js.ts`、`src/ui/conn-page-css.ts`、`test/conn-page-ui.test.ts`、`test/server.test.ts`

## 2026-05-22 Conn 独立页操作局部渲染

- `/playground/conn` 的暂停、恢复、删除、立即执行和全部已读路径不再用 `renderAll()` 反复重建统计、列表和详情；小状态变化改为更新 stats、list、selected detail actions 或 run history 对应区域。
- `renderAll()` 继续保留给首屏加载和整页 fallback；操作按钮的 `处理中 / 暂停中 / 恢复中 / 删除中 / 入队中` 反馈通过局部 action 渲染更新。
- run history 刷新、展开 run、终止 run 和加载更多事件走 run-history 局部渲染，并保持详情区滚动位置。
- 异步 action 返回前如果用户已经切换到其他任务，旧任务结果只更新缓存 / 列表，不会重画新选中任务详情面板。
- “全部已读”继续只请求 `POST /v1/conns/runs/read-all`，不会引用旧的 `loadRuns()`，也不会额外强制拉取运行历史。
- 相关源码：`src/ui/conn-page-js.ts`、`test/conn-page-ui.test.ts`、`test/server.test.ts`

## 2026-05-22 Conn 独立页 realtime refresh 收窄

- `/playground/conn` 订阅 `GET /v1/notifications/stream` 后会解析 SSE `event.data`；只有 `source === "conn"` 且带有效 `sourceId` 的广播才触发后台任务刷新。
- conn 广播进入 500ms 合并窗口；窗口内多条 notification 只触发一次实际刷新，避免后台 run 完成 burst 把页面打成重复请求风暴。
- notification 路径默认只刷新 `GET /v1/conns`，不会重拉 editor 支撑目录 `GET /v1/agents`、`GET /v1/browsers` 或 `GET /v1/model-config`。
- 如果被影响的是当前选中任务，且该任务 run history 已经加载过，notification 刷新后只补拉当前选中任务的第一页 `GET /v1/conns/:connId/runs?limit=10`；未加载的 run history 继续保持懒加载。
- 非 conn notification 不会触发 `/playground/conn` 全量刷新；手动刷新按钮仍走显式用户刷新路径。
- 相关源码：`src/ui/conn-page-js.ts`、`test/conn-page-ui.test.ts`

## 2026-05-22 Conn 独立页 run history 延迟加载与分页

- `/playground/conn` 首屏读取 `GET /v1/conns` 后可以自动选中第一条后台任务，但不会再因为自动选中而请求 `GET /v1/conns/:connId/runs`。
- 选中任务的详情区先使用 `/v1/conns` 返回的 `latestRun` 展示最近一次运行摘要；完整运行历史保持未加载状态。
- 运行历史区域提供显式“加载运行历史”入口；用户点击后，前端请求 `GET /v1/conns/:connId/runs?limit=10` 的第一页，不再把完整历史一次性拖回浏览器。
- `GET /v1/conns/:connId/runs` 保持无 query 参数的旧行为，仍返回完整历史；带 `limit` / `before` 时返回 `hasMore`、`nextBefore` 和 `limit` 分页元数据。`before` 游标按 `scheduledAt|createdAt|runId` 对齐后端排序，避免同时间戳 run 分页错乱。
- 已加载第一页后，运行历史底部会显示“加载更多”；继续用 `nextBefore` 拉下一页并追加到当前列表，不重置当前选中任务、展开的 run 或详情滚动位置。
- 前端通过 `runHistoryStateByConnId` 区分未加载、加载中、已加载和加载失败；已加载的空数组会显示“暂无运行历史”，不会退回成未加载提示。
- run history 异步返回前如果用户已经切换选中任务，旧任务的返回结果只写入缓存，不会重画当前详情面板。
- 相关源码：`src/routes/conns.ts`、`src/agent/conn-run-store.ts`、`src/types/api.ts`、`src/ui/conn-page-js.ts`、`src/ui/conn-page-css.ts`、`test/server.test.ts`、`test/conn-run-store.test.ts`、`test/conn-page-ui.test.ts`

## 2026-05-22 Conn 独立页 editor 支撑目录延迟加载

- `/playground/conn` 首屏只加载 `GET /v1/conns` 来渲染后台任务列表、统计和详情摘要，不再为了尚未打开的 create/edit editor 提前请求 `GET /v1/agents`、`GET /v1/browsers` 或 `GET /v1/model-config`。
- `执行 Agent`、浏览器和模型配置目录改为打开新建 / 编辑任务 editor 时通过 `loadEditorSupportCatalogs()` 按需加载；成功后缓存到页面状态，后续再次打开 create/edit editor 复用缓存，不重复请求支撑目录。
- editor 支撑目录加载期间会禁用 Agent、浏览器、模型下拉和保存按钮；如果目录或模型配置不可用，`guardEditorSupportCatalogs()` 会阻止提交，避免写入错误的 `profileId`、`browserId`、`modelProvider` 或 `modelId`。
- 编辑已有任务时，原 `profileId`、`browserId`、`modelProvider` 和 `modelId` 会作为 pending select value 保留到支撑目录加载完成，不能因为 `<select>` 暂时没有 options 就回落到默认 Agent、默认浏览器或默认模型。
- 手动刷新按钮继续只刷新当前 conn 列表；不强制刷新已经缓存的 editor 支撑目录。
- 相关源码：`src/ui/conn-page-js.ts`、`test/conn-page-ui.test.ts`

## 2026-05-22 会话列表性能优化

- 会话列表从全量渲染改为虚拟滚动：`computeVirtualWindow()` 根据滚动位置计算可见行范围，只渲染视口内行 + 上下 5 行 overscan 缓冲，上下 spacer 以行高 × 行数填充真实滚动高度。桌面行高 60px（58px item + 2px gap），移动行高 80px（72px item + 8px gap），与 CSS 对齐。
- 滚动事件通过 `requestAnimationFrame` 合并调度，pending rAF 期间丢弃后续 scroll 回调，避免连续滚动帧反复重建 DOM。
- 隐藏桌面/移动容器中的重复列表渲染：桌面视口渲染时清空移动列表容器，反之亦然。
- 会话目录同步带 500ms 合并窗口：`scheduleConversationCatalogRefresh()` 在窗口内多次调用只触发一次实际同步，避免 `requestUpdateConversation` 后立即 force-refresh 产生冗余请求和 `ERR_ABORTED` 竞态。
- 首屏不再加载非聊天面板数据：文件库、任务消息和后台任务未读统计延迟到面板首次打开或通知推送时加载。
- 行点击和菜单操作改为容器级事件委托：`handleConversationListClick()` 通过 `event.target.closest()` 分派选择会话、菜单触发、菜单操作和颜色选择，消除了每行 2 个 addEventListener。菜单按钮使用 `data-action` 属性，色板使用 `data-color` 属性。容器清空使用 `replaceChildren()` 替代 `innerHTML = ""`。按钮内容使用 `createElement` 直接构建替代 innerHTML 字符串 + querySelector。
- 相关源码：`src/ui/playground-conversations-controller.ts`、`src/ui/playground-mobile-shell-controller.ts`

## 2026-05-22 Agent 管理页首屏 skills 去重、延迟渲染、按 Agent 缓存与 editor 支撑目录延迟加载

- `/playground/agents` 首屏仍会加载 `GET /v1/agents`、`GET /v1/agents/status` 和一次 `GET /v1/agents/main/skills`，其中 main skills 结果同时作为 installable skill gallery 和主 Agent scoped skills 缓存。
- `/playground/agents` 首屏不再为了尚未打开的新建/编辑表单阻塞加载 `GET /v1/browsers` 和 `GET /v1/model-config`；这两个支撑目录改为打开 create/edit editor 时通过 `loadSupportCatalogs()` 按需加载并缓存。
- create/edit editor 在支撑目录加载期间会展示紧凑提示并禁用浏览器、模型下拉和保存按钮；如果浏览器目录或模型配置不可用，保存路径会被 `guardEditorSupportCatalogs()` 拦住，避免提交半截 `defaultModelProvider/defaultModelId` 或误清空浏览器/模型绑定。
- 首次自动选中 `main` 时复用 gallery 缓存，不再额外触发第二次 `GET /v1/agents/main/skills`。手动刷新技能仍会按当前选中 Agent 主动重拉对应 skills。
- selected Agent 详情面板的 skills 区域默认折叠：首屏不挂载 `.ag-skill-item` 行和 switch 按钮，只显示技能数摘要和”查看技能”按钮。用户点击后展开并按需加载 skills。
- per-agent skill cache 使用 `skillsLoadedByAgentId` 标记已加载的 Agent；展开 skills 时若已加载则直接渲染缓存，不重复请求。已加载空数组也是有效缓存。只有手动刷新或 toggle/remove/install 等 mutation 才刷新对应 Agent 的 skills。
- 技能数统计使用 `getSkillCountText(agentId)` 区分”未加载”（显示 `—`）与”已加载空数组”（显示 `0`），折叠摘要使用 `getCollapsedSkillSummary(agentId)` 显示对应文案。
- 切换 Agent 时 `skillsExpanded` 重置为 `false`，不会残留上一 Agent 的 skill rows。
- selected Agent 详情区现在由稳定 shell 承载 `header/actions`、mini stats、基础配置/规则和 skills panel 四个子区域；Agent 切换、skills loading、刷新和 mutation 不再无条件重写整块 detail body。
- skills loading、展开、手动刷新、install/remove/toggle 只更新 skills region 和必要统计；局部刷新会保留 detail body 的滚动位置，避免技能加载时把用户滚回顶部。
- installable skill 下拉使用 gallery signature 判断是否需要重建 options；gallery 未变化时不会重复 `populateSkillSelect()` 重建下拉。
- 异步 skills load/mutation 在 await/then 前捕获操作开始时的 `agentId`，渲染前检查 `state.selectedId` 仍然匹配，避免旧 Agent 结果画到新面板。
- scoped skills 拉取失败不会标记 loaded，也不会把未加载状态渲染成空列表；展开失败会显示“技能加载失败，请重试”，手动刷新失败会清掉 loading 并允许再次刷新。
- installable skill 下拉继续读取 main skills gallery，包含主 Agent 已关闭的 disabled entries，并保留”主 Agent 已关闭”提示。
- 相关源码：`src/ui/agents-page.ts`

## 2026-05-21 Chat 对话界面质感优化

- 主 `/playground` 对话界面新增聊天专用主题 token：消息表面、用户气泡、代码块、表格、composer 和悬浮滚动按钮均通过 `--chat-*` 变量管理。
- 深色主题和浅色主题分别定义自己的聊天表面与交互颜色；浅色主题不再沿用深色半透明底色，也不再用高饱和绿色作为用户气泡主色。
- 消息区保留工作型 cockpit 约束：无投影、4px 圆角、紧凑排版，assistant 输出提升正文可读性，宽表格支持横向滚动。
- 主消息气泡内部的代码块、复制工具条、附件下载项不再重复画多层边框；消息体保留唯一主边界，内部内容以弱底色和间距区分层级。
- Composer 继续作为单一输入控制面；focus 状态通过边框与 outline 反馈，不使用阴影模拟层级。
- 桌面左侧会话栏定位为低干扰 chat sidebar：会话项按轻量列表行展示，默认只突出标题摘要和时间；消息条数、第二行 preview 和三点菜单默认降噪，当前会话才显著高亮。移动端会话抽屉复用标题 + 时间的紧凑行结构。
- 页面背景已从散点 / 斜纹 / 漂移动画收口为静态细网格和线性边缘高光；深浅主题分别维护自己的背景网格透明度，避免“波点科技感”压过对话内容。
- 相关源码：`src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`

## 2026-05-21 文件库列表与下载入口优化

- `/playground` 文件库列表项改为更接近文件管理器的层级：日期分组以跨列章节标题展示，并显示该日期文件数；卡片左侧文件类型徽标同时展示扩展名和 `TEXT / BIN / META` 类别，徽标按 archive / code / web / data / image / document / binary 等文件类型着色，右侧只保留文件名、大小和短 asset id，不再展示文件内容摘要。
- 每个有 `downloadUrl` 的资产现在在文件库里直接展示“下载”入口；前端复用既有 `buildDownloadUrl()`，会把链接转换为 `/v1/files/:assetId?download=1`，让后端以附件方式交付。
- “复用 / 下载 / 删除”保持并列操作，但下载使用独立视觉权重，删除仍维持低干扰危险色；列表项 hover / active、日期章节线和浅色主题分别管理，不把深色半透明样式硬套到浅色主题。
- 文件库内容区保留滚动能力但隐藏浏览器滚动条，避免右侧滚动条抢占 cockpit 视觉。
- 相关源码：`src/ui/playground-assets.ts`、`src/ui/playground-assets-controller.ts`、`src/ui/playground-theme-controller.ts`

## 2026-05-21 Team 自然语言 Plan 草案

- `/playground/team` 仍是独立 Team Runtime 工作台，不嵌进主聊天 workspace。
- Plan 创建现在有三种模式：普通计划、发现后逐项处理、自然语言草案。自然语言草案模式输入目标后调用 `POST /v1/team/plan-drafts`，只生成可检查的 Plan create payload，不落盘、不创建 Plan、不创建或启动 Run。
- 阶段边界已确认：不要继续把 `/playground/team` 做成可视化 Plan 创建器。复杂 Plan 设计主要在 Agent 对话和 `team-plan-creator` skill 中完成；Team 页面保留轻量创建辅助，重点转向 Run 执行、审计、结果查看和排错。
- 自然语言草案模式现在显式提供 supported template 选择：`自动匹配`、`单 Agent`、`并行研究`。`自动匹配` 不传 `preferredTemplateId`；另外两个选项分别传 `single_agent` 和 `parallel_research`。
- 草案预览会展示模板命中、reason、warnings 和 Plan JSON；用户确认后才把同一份 payload 提交给 `POST /v1/team/plans`。
- API 暴露 `GET /v1/team/plan-templates` 作为模板 registry；当前 `/playground/team` 不请求 registry 渲染创建项，也不展示 `coding_fix` / `deep_research_with_review` 这类 planned 模板。planned 模板由 API 标记为 `planned`，draft endpoint 不执行。
- `parallel_research` 草案仍是 discovery -> `for_each.mode="parallel"`：先发现 3 到 8 个高价值条目，再按每个 source item 并行生成 child research 任务；最终输出契约要求中文执行摘要、逐项发现、横向对比、来源线索、风险/未知项和建议。
- Run 仍由 `POST /v1/team/plans/:planId/runs` 创建 queued run；run detail、events、attempt 文件和 final report 继续以 `docs/team-runtime.md` 的 Team Runtime v2 API 为准。
- 相关源码：`src/ui/team-page.ts`、`src/ui/team-page-helpers.ts`、`src/team/plan-draft.ts`、`src/team/routes.ts`

## 2026-05-14 Team Runtime 独立工作台

- Playground 新增 `/playground/team` 独立页面，和 `/playground/conn`、`/playground/agents` 一样复用 standalone cockpit 视觉系统，不嵌进聊天 workspace。
- 主 `/playground` 桌面顶部操作区和手机更多菜单都提供 `Team Runtime` 入口；当前行为是在同一标签进入独立页面，并通过页面左上角返回 `/playground?view=chat` 恢复对话。
- 独立页面通过 Team Runtime v2 的 Plans / TeamUnits / Runs API 管理状态；页面不直接绕过 Team API 读 `.data/team`。
- 相关源码：`src/ui/team-page.ts`、`src/routes/playground.ts`、`src/ui/playground-page-shell.ts`、`src/ui/playground-styles.ts`

## 2026-05-13 手机首页 Agent 列表滚动

- 手机首页不能假设 Agent 数量很少；`.shell[data-home="true"] .landing-screen` 是首页内容滚动容器，Agent 卡片变多时必须在该区域内纵向滚动，不能撑出视口高度。
- 首页 logo 是滚动内容头部，不是背景水印；滚动到最顶部时必须先看到 logo，再看到 Agent 卡片列表。移动端 `.landing-grid` 禁止用居中布局把超高内容顶到负坐标。
- 移动断点使用 `100dvh` 和 `-webkit-overflow-scrolling: touch`，同时保留应用壳全屏和首页背景，不让滚动泄漏到其他 workspace。
- 相关源码：`src/ui/playground-styles.ts`

## 2026-05-13 Conn 列表排序与状态色

- 后台任务列表不按“最近完成”粗暴排序。真正的优先级是：已完成但有未读结果的任务排最前，并按最新未读 run 时间倒序；没有未读结果的任务再按生命周期排序：运行中 > 暂停 > 已完成且不会再执行。
- 同一生命周期内，优先按 `nextRunAt` 升序展示即将执行的任务；没有下次执行时间时，再按最近 run / 更新时间倒序、标题和 connId 兜底。
- `/playground/conn` 独立页使用 `state.unreadLatestRunTimesByConnId`；Playground 内嵌 Conn 管理器使用 `state.connManagerUnreadLatestRunTimesByConnId`，两者数据都来自 `GET /v1/conns`。
- 状态色固定为：运行中绿色、暂停橙黄色、已完成灰色；深色和浅色主题都不能把“已完成不会再执行”渲染成成功绿或可继续运行的蓝色。
- 相关源码：`src/routes/conns.ts`、`src/agent/conn-run-store.ts`、`src/ui/conn-page-js.ts`、`src/ui/conn-page-css.ts`、`src/ui/playground-conn-activity-controller.ts`、`src/ui/playground-conn-activity.ts`、`src/ui/playground-theme-controller.ts`

## 2026-05-12 Chat 视图背景氛围统一

- Landing 页使用 `.shell[data-home="true"]::before/::after` 伪元素 + `--ugk-*` CSS 变量绘制动态网格纹理。
- Chat 视图复用同一套 `--ugk-*` 变量，通过 `.shell:not([data-home="true"])` 的 `background-image` 渲染，不需要伪元素（shell background 直接铺在所有子元素下方）。
- 暗色和浅色主题各自定义独立的 `--ugk-*` 调色板。`body::before/::after` 提供次要环境层（网格漂移动画 + 径向发光）。
- 相关源码：`src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`

## 2026-05-12 Agent 状态指示与跨 Agent 切换

- Agent 切换悬浮菜单和首页 Agent 卡片现在展示运行状态彩色圆点：`busy`（运行中）使用绿色脉冲动画，`idle`（空闲）使用暗灰静态点，`unknown` 使用更暗灰点。
- 状态数据来自 `GET /v1/agents/status`，该接口返回每个 agent 的 `status`（`busy` / `idle` / `unknown`）和可选的 `activeSince` 时间戳。
- 切换菜单项根据状态添加 CSS 类 `is-busy` / `is-idle` / `is-unknown`；busy agent 的菜单项右侧会显示运行时长（分钟），鼠标悬浮展示"运行时间"提示。
- 用户可以在当前 Agent 运行期间切换到另一个 Agent：`switchAgent()` 不再阻止跨 Agent 切换，它会把当前 Agent 的 stream / events / state 同步全部清理，然后进入目标 Agent 的 scoped 会话。这允许用户在等待某个 Agent 任务完成的同时切换到另一个 Agent 继续工作。
- 首页 Agent 卡片同样展示状态圆点和运行时长；busy 卡片额外标记 `is-busy` 类。
- 相关源码：`src/ui/playground.ts`（`renderAgentSwitcherMeta()`、`renderAgentSelector()`、`switchAgent()`、`loadAgentRunStatus()`）、`src/ui/playground-styles.ts`（`agent-switcher-item.is-busy` / `is-idle` / `is-unknown` 样式、`landing-agent-status-dot` 样式）、`src/routes/chat.ts`（`GET /v1/agents/status`）

## 2026-05-12 Per-Agent 技能启用/禁用开关

- 每个 Agent 的已安装技能支持按技能粒度启用/禁用，不再只有"安装 / 删除"两种状态。
- `GET /v1/agents/:agentId/skills` 返回技能清单及 `enabled` / `required` 状态；`PATCH /v1/agents/:agentId/skills/:skillName` 切换 `enabled`（请求体 `{ "enabled": true/false }`）。
- `required` 技能（`agent-skill-ops`、`agent-runtime-ops`、`agent-filesystem-ops` 三件套）不可禁用，对应 UI 开关显示为禁用态。
- Playground Agent 操作台和独立 Agent 管理页（`/playground/agents`）的技能列表都提供开关按钮（`ag-skill-toggle`），使用 `role="switch"` + `aria-checked`，开/关分别显示"开"/"关"文字和绿色/黄色配色。
- 切换操作调用 `PATCH /v1/agents/:agentId/skills/:skillName`，成功后重新拉取技能列表并刷新渲染；失败时保留开关状态并提示错误。
- 禁用后技能在列表中以降低透明度（`ag-skill-item--disabled`）展示，但不会从磁盘删除；重新启用即可恢复。
- 相关源码：`src/routes/chat.ts`（`GET /v1/agents/:agentId/skills`、`PATCH /v1/agents/:agentId/skills/:skillName`）、`src/types/api.ts`（`AgentSkillListResponseBody`、`UpdateAgentSkillRequestBody`、`UpdateAgentSkillResponseBody`）、`src/ui/agents-page.ts`（`apiToggleSkill()`、`renderSkills()`）、`src/agent/agent-service.ts`

## 2026-05-12 Per-Agent 默认模型选择器

- Agent 管理页（`/playground/agents`）和 Playground 内嵌 Agent 操作台都支持为每个 Agent 独立选择默认模型提供商和模型。
- 主 Agent（agentId `main`）的模型选择器被隐藏，始终跟随全局设置（`.pi/settings.json`）。
- 新建和编辑 Agent 时均可设置模型；provider 变更会动态刷新 model 下拉列表。
- 对话页左下角设置菜单里的“模型源”会跟随当前操作视窗：`main` 仍读写项目全局默认；非主 Agent 打开时优先显示该 Agent 的 `defaultModelProvider/defaultModelId`，保存时写回当前 Agent，而不是误改全局默认。
- 如果模型配置读取失败，编辑保存时必须保留 Agent 已有默认模型，不得因为下拉为空而提交 `null/null` 清空配置。
- 如果 Agent 保存的默认模型已从当前 `models.json` 移除，运行态和展示上下文都回落项目全局默认模型。
- 后端 PATCH `/v1/agents/:agentId` 对模型字段做 live validate（创建真实 agent session 验证），Agent 有运行中任务时返回 409。
- 模型优先级链：Conn 显式指定 > Agent 默认 > 项目全局默认。
- 相关源码：`src/ui/agents-page.ts`、`src/ui/playground-agent-manager.ts`、`src/routes/chat.ts`、`src/agent/agent-session-factory.ts`

## 2026-05-11 Conn 立即执行反馈

- 后台任务“立即执行”不是无反馈按钮：点击后当前任务按钮必须立刻切到“入队中”，创建 run 成功后显示“已触发执行，正在后台运行”，并把新 run 插到运行历史顶部。
- 只要该任务存在 `pending` 或 `running` run，“立即执行”按钮必须显示“执行中”并禁用，避免用户因为页面看起来没反应而连续点击出多条手动 run。
- `/playground/conn` 独立页面和 Playground 内嵌后台任务入口使用同一口径：入队后短轮询刷新 run 历史，终态回来后再恢复按钮。
- 相关源码：`src/ui/conn-page-js.ts`、`src/ui/playground-conn-activity-controller.ts`

## 2026-05-11 Conn 未读结果统计

- `/playground/conn` 顶部右侧“未读结果”统计的是后台 run 结果，不是任务消息页的 `agent_activity_items` 未读消息数。
- 统计范围已经收口为当前仍存在的 conn：只计算这些 conn 下 `succeeded / failed` 且 `read_at IS NULL` 的 run；已软删除任务的历史 run 不再混入顶部总数。
- 列表卡片上的单个 conn 未读徽章和顶部总数使用同一批 conn id 作为过滤范围；“全部已读”和展开单条 run 自动已读后的总数刷新也按这个口径返回。
- “全部已读”成功后会同步清空页面内未读计数、未读排序时间和已加载 run history / latestRun 的本地 `readAt`，不再额外触发运行历史刷新请求。
- 对话页顶部“后台任务”按钮上的数字徽章也使用 `/v1/conns` 的 `totalUnreadRuns`，刷新、重新聚焦页面或收到后台通知时都会同步；它不再使用任务消息 `/v1/activity/summary` 的未读数。
- 相关源码：`src/routes/conns.ts`、`src/agent/conn-run-store.ts`、`src/ui/playground-conn-activity-controller.ts`、`src/ui/playground-task-inbox.ts`

## 2026-05-11 Agent 按钮独立页面入口

- 对话页顶部当前 Agent 标签按钮现在直接在当前标签进入独立 `/playground/agents` 页面，行为和后台任务按钮进入 `/playground/conn` 一致；两个页面都通过左上角返回 `/playground?view=chat` 恢复对话。
- 点击该按钮不再展示旧的内嵌 Agent workspace 区域；旧 workspace 代码暂时只作为兼容实现保留，不再作为顶部 Agent 按钮的入口。
- 悬浮 Agent 切换菜单仍保留：菜单项内部点击会阻止冒泡，继续用于快速切换当前 Agent。
- 相关源码：`src/ui/playground-agent-manager.ts`、`src/ui/playground-page-shell.ts`

## 2026-05-11 文件库指定文件删除

- Playground 文件库现在在每个可复用资产卡片上提供“删除”操作，和“复用”并列展示。
- 删除前必须弹出确认框；确认后调用 `DELETE /v1/assets/:assetId`，成功后从文件库列表、聊天输入区已选资产、conn 编辑器已选附加资料中同步移除该资产。
- 删除语义以资产库为准：后端会移除资产索引记录，并在底层 blob 不再被其他资产复用时删除物理文件；不会修改历史聊天正文、任务消息正文或后台 run 历史里曾经展示过的旧文本。
- 相关源码：`src/ui/playground-assets.ts`、`src/ui/playground-assets-controller.ts`、`src/routes/files.ts`、`src/agent/asset-store.ts`

## 2026-05-11 Conn 独立页面空列表新建任务

- `/playground/conn` 独立后台任务工作台在当前任务列表为空时，点击顶部“新建任务”后，左侧列表必须显示一个选中的“新建任务”虚拟卡片，并在卡片内展示“保存任务 / 取消”按钮。
- 这个虚拟卡片属于编辑态，不应被普通“暂无任务”空态截断；`renderList()` 需要先判断 `state.editorOpen && state.editorMode === "create" && conns.length === 0`，再进入普通空列表分支。
- 有任务列表时，新建任务仍显示在左侧列表顶部；编辑已有任务时，保存 / 取消按钮仍显示在被编辑的任务卡片上。
- 相关源码：`src/ui/conn-page-js.ts`

## 2026-05-09 Agent / Conn 浏览器绑定手动化

- 浏览器绑定从自然语言 Agent 能力中撤出：Agent 不再通过 `.pi/skills/agent-profile-ops` 或 `.pi/skills/conn-orchestrator` 查询浏览器清单、生成浏览器绑定提案或修改浏览器绑定字段。
- Chrome 绑定是用户手动配置：Agent 默认浏览器仍在 Agent 操作台设置，Conn 任务浏览器仍在 Conn 编辑器设置；UI 继续使用 `GET /v1/browsers` 渲染下拉，并通过正式 API 保存。
- 服务端保留确认闸门和审计：如果浏览器 / 执行路由字段真实变化但请求没有确认头，或来源不是 `playground`，接口返回 400，并记录 `status: "rejected_unconfirmed"` 或 `status: "rejected_non_ui_source"`；UI 正常保存会携带确认头和 `playground` 来源。
- `web-access` 只负责使用平台分配的浏览器路由，不负责查看、解释、切换或配置浏览器绑定。用户在对话里要求改浏览器时，Agent 应引导用户到 Playground 设置界面手动操作。
- 相关源码 / 规则：`.pi/skills/agent-profile-ops/SKILL.md`、`.pi/skills/conn-orchestrator/SKILL.md`、`runtime/skills-user/web-access/SKILL.md`、`src/routes/chat.ts`、`src/routes/conns.ts`、`src/routes/browsers.ts`

## 2026-05-08 Chrome 工作台

- Playground 新增 `Chrome 工作台`，桌面入口在右侧设置菜单，手机入口在更多菜单。它是浏览器运行态查看面板，不负责复制登录态，也不把浏览器生命周期塞进 Agent profile。
- 工作台读取 `GET /v1/browsers` 渲染已注册 Chrome，再按选中 `browserId` 调用 `GET /v1/browsers/:browserId/status` 读取 CDP 在线状态、版本信息和当前 targets；前台默认只展示 `type=page` 的真实页面，iframe / service worker 等浏览器内部 target 只用中文提示折叠数量，避免外行用户把内部对象误认为打开了很多网页。
- 页面条目用绿色 `页面` 类别标签和高亮网址作为主识别信息；菜单和状态文案使用中文口径，例如 `在线 / 离线`、`系统默认 / 独立登录态`、`技术地址`。
- 页面条目会展示页面级负载估算：`JS 内存`、`页面元素`、`事件`，并用 `占用正常 / 占用较多 / 占用偏高 / 占用未知` 帮普通用户快速判断哪个页面可能拖慢服务器。这里不是 Docker 容器总内存；准确容器 RSS 需要后续接入受控 actuator 或 cgroup 读取，不能把 Docker socket 直接交给主服务。
- `启动` 按钮已经接到 `POST /v1/browsers/:browserId/start` 扩展点，但当前 app 没有 Docker 管理权限，默认返回“不支持从 Web 启动”。后续如果要真启动，只能接受控 actuator，不能把 Docker socket 直接塞给前台服务。
- 相关源码：`src/browser/browser-control.ts`、`src/browser/browser-target-usage.ts`、`src/routes/browsers.ts`、`src/ui/playground-browser-workbench.ts`、`src/ui/playground.ts`

## 2026-05-08 Conn 浏览器选择

- 后台任务创建 / 编辑器现在提供“浏览器”下拉，选项来自 `GET /v1/browsers`；不指定时显示“跟随执行 Agent”。
- Conn 的浏览器优先级是：conn 自身 `browserId` > 执行 Agent 的 `defaultBrowserId` > Browser Registry 默认浏览器。执行 Agent 仍只决定规则、技能、模型和身份快照，浏览器登录态由 conn 独立选择或继承。
- 后台任务列表会展示当前浏览器策略，避免只看到执行 Agent 却猜不到实际会用哪个 Chrome。
- 相关源码：`src/ui/playground-conn-activity.ts`、`src/ui/playground-conn-activity-controller.ts`、`src/routes/conns.ts`、`src/agent/background-agent-runner.ts`

## 2026-05-08 Agent 默认浏览器配置

- Agent 操作台现在会读取 `GET /v1/browsers` 的浏览器目录，但只引用浏览器实例，不负责创建 / 启停 Chrome 容器。
- Agent 列表和详情会展示当前 `defaultBrowserId`；未指定时显示“跟随系统默认”，实际默认值由 Browser Registry 的 `defaultBrowserId` 决定。
- 新建 Agent 和编辑 Agent 都提供“默认浏览器”下拉，保存时通过 `POST /v1/agents` 或 `PATCH /v1/agents/:agentId` 写入 `defaultBrowserId`；浏览器 ID 仍由后端 Browser Registry 校验。默认浏览器是 Agent 全局运行参数，该 Agent 有运行中对话时服务端会拒绝切换，用户需要等当前运行结束后再改。
- 相关源码：`src/ui/playground.ts`、`src/ui/playground-agent-manager.ts`、`src/routes/chat.ts`、`src/routes/browsers.ts`

## 2026-05-07 UI 层级与主题一致性收口

- 桌面 workspace 页面不再保留独立关闭按钮层级；文件库、后台任务、Agent 操作台和任务消息的返回语义统一交给全局 topbar 的“回到会话”，移动端全屏工作页继续使用 `.mobile-work-back-button` 返回。
- 文件库和任务消息的桌面 header 只保留一套 command-bar 样式来源：`src/ui/playground-assets.ts`。不要再在 `src/ui/playground-styles.ts` 里重复塑形 `.asset-modal-head` / `.task-inbox-head`，否则浅色主题按钮、强调线和分段工具条会互相覆盖。
- `asset-head-close-button` 与 `task-inbox-head-close-button` 已作为废弃样式移除；当前真实 DOM 使用的是移动端返回按钮 `.mobile-work-back-button`，桌面断点隐藏。
- 浅色主题下 Agent 操作台、Agent 编辑器和规则编辑器的 `.asset-modal-body` 使用浅灰蓝工作底，条目、详情字段、规则卡片、技能项和输入框才使用白色承载面；不能让页面网格直接透到详情区域里。
- 相关源码：`src/ui/playground-styles.ts`、`src/ui/playground-assets.ts`、`src/ui/playground-theme-controller.ts`、`src/ui/playground-agent-manager.ts`、`src/ui/playground-task-inbox.ts`

## 2026-05-06 任务消息列表重设计

- 任务消息页不再提供“未读 / 全部”筛选按钮；入口始终加载全部任务消息，未读数量只作为入口徽标和页头提示。
- 列表内用状态区分阅读层级：未读消息使用红色左侧强调线和更亮卡片背景，并默认展开正文与操作；已读消息默认折叠，只显示标题和时间，点击条目后再展开 / 收起。
- 浅色主题下，任务消息列表使用浅灰蓝底承接，单条消息使用白色卡片、细边框和独立内边距，避免白色页面、白色列表和白色条目糊成一整块。
- 浅色主题的后台任务列表和 Agent 操作台也使用同样的层级口径：后台任务页 body 是浅灰蓝工作底，列表透明承接，条目 / 技能 / 规则 / 详情字段是白色卡片，正文、标签、状态和代码字段使用深色语义色，不能继续沿用深色主题的半透明浅字。
- 每条任务消息的时间抬到标题同级，使用等宽数字和更高字重展示；来源、正文、任务 ID、附件和操作按钮只在展开态展示。
- “全部已读”会把当前列表内未读项标记为已读并收起；单条未读消息被点击或执行复制 / 查看过程操作后会保留展开状态，避免刚点开就塌回去。
- 相关源码：`src/ui/playground-task-inbox.ts`、`src/ui/playground.ts`、`src/ui/playground-theme-controller.ts`

## 2026-05-06 运行中文件库可用

- 会话运行中继续禁用“新会话”和会话切换类操作，避免 active run 归属被切走。
- 文件库入口在运行中保持可点击，用户可以打开文件库、复用已有资产，并把选中的文件补到 composer；随后发送会走运行中追加消息链路。
- 移动端更多菜单里的“文件库”同样不再因运行中状态禁用。
- 运行中进入桌面 workspace 后，topbar 左侧按钮会从“新会话”切换为“回到会话”；此时它承担关闭面板返回对话的语义，必须保持可点击。返回 chat 后按钮恢复“新会话”语义，并继续按运行中状态禁用。
- 资产刷新按钮只在真实加载资产列表时由 `loadAssets()` 临时禁用，不再被全局 `setLoading(true)` 锁死。
- 相关源码：`src/ui/playground-status-controller.ts`、`src/ui/playground-workspace-controller.ts`、`src/ui/playground-assets-controller.ts`

## 2026-05-06 会话更多菜单

- 桌面左侧会话列表和移动端历史抽屉的每条会话右侧统一使用“更多”菜单，不再裸露单独删除按钮。
- 菜单支持重命名、置顶 / 取消置顶、设置背景颜色和删除；背景颜色保留跟随浅 / 深主题的默认项，默认色块在浅色主题显示浅色、深色主题显示深色，并只提供浅蓝、薄荷、蜜桃、浅粉、浅灰这类浅色卡片色；删除仍走既有二次确认弹窗。
- 会话元数据持久化在服务端 catalog 中，新增 `pinned` 与 `backgroundColor` 字段；旧会话默认未置顶、无背景色，读取时有兼容默认值。
- 会话列表排序变为置顶优先，其余仍按 `updatedAt` 倒序。运行中会话仍不能切换 / 删除 / 改名 / 改色，避免 active run 归属被改乱。
- 相关源码：`src/agent/conversation-store.ts`、`src/agent/agent-conversation-catalog.ts`、`src/routes/chat.ts`、`src/ui/playground-conversations-controller.ts`、`src/ui/playground-styles.ts`

## 2026-05-06 Markdown 代码块宽度约束

- 对话气泡中的 Markdown 代码块 `.code-block` 与内部 `pre` 现在和表格一样受消息正文宽度约束：外层不再被长代码行撑破，长行只在代码块内部横向滚动。
- 相关源码：`src/ui/playground-styles.ts`、`test/server.test.ts`

## 2026-05-06 刷新时保留当前 Agent

- Playground 当前操作视窗以 `localStorage` 的 `ugk-pi:active-agent-id` 为刷新恢复入口，服务端 `/v1/agents` catalog 只用于校验和展示。
- 如果刷新、网络抖动或服务刚重建时 `/v1/agents` 短暂失败，前端不再用兜底 `[main, search]` 列表把已选自定义 Agent 覆盖成 `main`；只有可靠拿到 catalog 且当前 agent 确实不存在时才回退。
- catalog 失败期间，选择器会临时显示当前已存 agent id，随后会话恢复仍走对应 scoped `/v1/agents/:agentId/chat/*` API。
- 相关源码：`src/ui/playground.ts`

## 2026-05-06 桌面上下文用量 tooltip 不常驻

- 桌面 Web 模式下，上下文用量按钮只用 hover / focus-visible 展示 tooltip；鼠标移走后 tooltip 消失。
- 点击上下文用量按钮在桌面端不再切换 `data-expanded="true"` 常驻态，避免点一下后必须再点一次才能收起。
- 移动端仍保留点击打开完整上下文详情 dialog 的行为，因为移动端没有可靠 hover。
- 相关源码：`src/ui/playground-context-usage-controller.ts`

## 2026-05-06 桌面 workspace 头部视觉升级

- 桌面 Web 模式下，文件库和任务消息等 workspace 页面头部不再直接暴露成手机全屏页式的粗糙 topbar；`.chat-stage > .workspace-contained` 内的 `.asset-modal-head` / `.task-inbox-head` 统一升级为紧凑 command bar。
- 头部采用两列 grid：左侧只保留竖向强调线和页面标题，不再显示 `工作区 /` 面包屑、副标题或数量胶囊；右侧承载刷新、全部已读等操作按钮。按钮区右对齐并使用小型分段控制视觉，避免操作页顶部像一排随手堆的按钮。
- 桌面 workspace 下 `.mobile-work-back-button` 强制隐藏，返回对话仍由全局 topbar 左侧“回到会话”承担；移动端全屏工作页继续保留返回箭头和原有结构。
- 浅色主题同步提供白底、冷蓝边框和弱阴影口径；深色主题使用克制的暗色承载、底部分隔线和左侧细强调条，避免整块 header 和列表内容糊成一团。
- 相关源码：`src/ui/playground-assets.ts`

## 2026-05-05 桌面工作区头部与交互收口

- 桌面端文件库和任务消息 header 不再复用 `mobile-work-topbar` 手机结构。桌面 workspace 下 header 为透明工具栏：左侧 `工作区 / 页面名称 [N]` 面包屑 + 标题 + 数量徽标，右侧操作按钮，← 返回箭头在 `min-width: 641px` 下强制隐藏。手机端（`max-width: 640px`）保持原有全屏页结构不变。
- 任务消息列表项改为完整卡片容器：每条独立 `#0b0c18` 背景 + 4px 圆角，标题从药丸按钮变成干净文字，未读项左侧有 `linear-gradient(180deg, #c9d2ff, #8dffb2)` 渐变亮条，元数据（时间/任务ID/文件数）收为 18px 小徽标，操作按钮改为无边框透明风格，已读项文字和正文颜色变暗。
- workspace 面板的打开/关闭统一通过 topbar 左侧按钮：正常对话时显示"新会话"（点击创建新会话），进入文件库/后台任务/消息/Agent 管理后自动变为"回到会话"（点击关闭面板返回对话）。面板不再各自提供 × 关闭按钮。
- 在 workspace 面板打开时点击左侧会话列表项，会先关闭当前面板再切换到目标会话，避免面板与会话界面重叠。
- 相关源码：`src/ui/playground-assets.ts`、`src/ui/playground-task-inbox.ts`、`src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`、`src/ui/playground-workspace-controller.ts`、`src/ui/playground-conversations-controller.ts`、`src/ui/playground.ts`

## 2026-05-05 Agent 切换悬浮菜单

- topbar 右侧 agent label 按钮新增悬浮弹出菜单（`.agent-switcher-meta`），鼠标悬浮时展示可切换的 agent 列表。
- `/playground?view=chat&agentId=<agentId>` 会把 `agentId` URL hint 作为初始 active Agent；普通页面会同步写入 `ugk-pi:active-agent-id`，Team Console iframe 使用 `embed=team-console` 时只在当前页面内生效，不写入共享 `localStorage`。在 `embed=team-console` 下，topbar 右侧 agent label 只作为当前 Agent 标识，不打开 hover 切换菜单，也不会点击跳转独立 Agents 页。
- 弹出菜单沿用 `context-usage-meta` 的定位/显隐模式：`position: absolute` + `opacity: 0` + `pointer-events: none`，hover/focus-visible 时 `opacity: 1` + `pointer-events: auto`。
- 每个 agent 项显示名称、agentId 和当前激活标识（"当前"徽标），已激活项 disabled 不可点击，其他项点击直接切换 agent。
- agent label 文字包装在 `.agent-switcher-label` span 中，避免 `textContent` 赋值清除弹出子元素。
- `renderAgentSelector()` 拆分为：更新隐藏 `<select>`（旧逻辑）、更新 label 文字、调用 `renderAgentSwitcherMeta()` 渲染弹出列表。
- 相关源码：`src/ui/playground-page-shell.ts`、`src/ui/playground.ts`、`src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`

## 2026-05-02 多 Agent 操作视窗补充

- Playground 桌面端新增 agent 选择器，第一版只内置 `main` 和 `search` 两个操作视窗。`main` 是既有主 Agent，继续兼容旧 `/v1/chat/*` 和 `/v1/debug/skills`；`search` 是第一个独立 agent profile 样板。
- 桌面端 agent 切换入口位于左侧历史会话 rail 底部的“设置”菜单中；topbar 右侧上下文按钮左边显示当前激活 agent 的紧凑标签，该标签同时是 Agent 操作台入口。当前激活 agent 会写入浏览器 `localStorage` 的 `ugk-pi:active-agent-id`，刷新后继续保持；如果保存的 agent 已不存在，则回退到 `main`。
- 切换 agent 后，会话目录、当前会话、`GET /v1/chat/state` 对应的新 scoped 请求、发送消息、追加队列、打断、运行日志和查看技能都走 `/v1/agents/:agentId/...`。文件库、任务消息和后台任务当前仍作为共享运行能力，不在第一版拆成 agent 私有库；但后台任务创建 / 编辑时可以选择“执行 Agent”，只借用目标 Agent 的运行规则和技能快照，不把后台 run 写进该 Agent 的前台聊天历史。
- `conn` 后台任务默认投递到任务消息 / 全局通知，创建时不再绑定当前 `conversationId`；旧 `conversation` target 只作为 legacy 数据兼容。删除前台会话不应影响后台任务执行、run 历史、任务消息或输出文件链接。
- 主 Agent 的 agent 元操作技能是 `.pi/skills/agent-profile-ops`。第一版后端接口支持 `GET /v1/agents`、`POST /v1/agents` 创建运行态 agent profile，以及 `POST /v1/agents/:agentId/archive` 归档 agent；创建出的 profile 记录在 `.data/agents/profiles.json`，归档目录为 `.data/agents-archive/`。主 Agent 给其他 agent profile 安装技能时只能复制主 Agent 当前已有且来源明确的技能；主 Agent 没有的技能不能代装，用户应切换到目标 agent 自己安装或创建。
- Agent 注册状态以 `GET /v1/agents` 为准；`.data/agents/profiles.json` 只记录用户创建的自定义 agent profile，不是完整运行时注册表。`main` 和默认 `search` 来自代码内置 profile，不一定写入 `profiles.json`；因此 `profiles.json` 没有 `search` 只能说明它不是用户创建记录，不能说明未注册。若 `search` 被归档，`/v1/agents` 不再返回它，才表示当前运行时不可用。
- `.data/agents/profiles.json` 禁止作为 agent 创建、恢复、归档或修复入口。agent 元操作必须走 `/v1/agents` API，因为 API 会同时维护磁盘 catalog、运行目录和进程内 `AgentServiceRegistry`；手动改 JSON 只会改磁盘，容易造成 `POST /v1/agents` 报重复但 `GET /v1/agents` 看不到的运行时分裂。
- Playground 新增 Agent 操作台：入口统一为 topbar / 手机状态栏里的当前 Agent 标签，不再额外放 `Agent 管理` 按钮或手机更多菜单项。桌面端操作台占据 `chat-stage` 工作区，移动端作为全屏工作页打开；页面展示包括主 Agent 在内的全部操作视窗。主 Agent 可查看、可切换但不可编辑 / 删除，且不在该页管理技能；其他 agent profile 支持新建、编辑名称 / 描述、查看 scoped 技能、复制安装主 Agent 已有技能、删除自身非基础技能、查看并编辑 `AGENTS.md`、切换和删除。右侧详情先展示一行 `AGENTS.md` 规则文件卡片，点击后在弹窗中完整阅读、编辑并保存；下半部分固定作为技能透明视图，避免规则文件和技能列表互相压缩。新建 Agent 在右侧完整创建页完成：`agentId` 由名称自动生成，用户填写名称和用途描述，页面实时预览将写入的 `AGENTS.md`，三件套基础技能默认内置，额外初始系统技能只能从主 Agent 当前已有技能中勾选并通过 `initialSystemSkillNames` 复制。编辑调用 `PATCH /v1/agents/:agentId`，删除仍调用归档接口 `POST /v1/agents/:agentId/archive`，规则文件读取调用 `GET /v1/agents/:agentId/rules`，保存调用 `PATCH /v1/agents/:agentId/rules`，创建后技能复制安装调用 `POST /v1/agents/:agentId/skills`，技能删除调用 `DELETE /v1/agents/:agentId/skills/:skillName`。
- Playground agent session 的 `AGENTS.md` 采用运行态隔离：主 Agent 读取 `.data/agent/AGENTS.md`，其他 agent 读取 `.data/agents/<agentId>/AGENTS.md`，并在 resource loader 中替换仓库根 `AGENTS.md`。仓库根 `AGENTS.md` 只给维护 `ugk-pi` 代码的 coding agent 使用，不再进入 Playground 日常 agent 的默认上下文；旧 `.data/agent/AGENTS.local.md` 仅作为主 Agent 运行规则迁移来源。
- 每个 agent 的默认 `AGENTS.md` 都包含 Karpathy Guidelines，作为通用工作纪律：先想再写、简洁优先、外科手术式修改和目标驱动验证。主 Agent 与后续新建 agent 都应默认带上这段规则。
- 涉及 agent profile 创建、配置、技能复制安装、归档、删除或可能改变当前操作视窗的动作时，主 Agent 必须先说明影响并取得用户明确确认；不能把“要不要继续”替用户决定。UI 操作台可以由用户手动切换当前激活 agent；主 Agent 在对话里不能替用户擅自完成这类切换决策。
- `search` 的技能清单必须只来自 `.data/agents/search/pi/skills` 和 `.data/agents/search/user-skills` 对应的 `allowedSkillPaths`，不能因为项目存在 `.pi/skills` 或 `runtime/skills-user` 就看到主 Agent 技能。用户问“你有哪些技能”时，Playground 的查看技能入口也必须查询当前 agent 的 scoped debug skills。
- 浏览器本地历史缓存按 `agentId + conversationId` 分区；不能让两个 agent 的同名或相似会话在 localStorage 里串场。
- 当前这只是“单进程多 agent profile”底座，不是强隔离容器；创建、编辑和归档接口已经存在，但仍只负责运行态 profile 管理，不等于把其他 agent 变成主 Agent 的下属子进程。

## 运行时外部化模式

- 默认入口 `GET /playground` 仍使用 `src/ui/playground.ts` + `src/ui/playground-page-shell.ts` 的内联渲染，保证现有回归断言和源码调试路径不变。
- 设置 `PLAYGROUND_EXTERNALIZED=1` 后，服务会从当前 `src/ui/` 渲染出 `runtime/playground-factory/`，并在 `runtime/playground/` 缺少必要文件时初始化运行时副本。
- 外部化模式下 `/playground` 只加载 `/playground/styles.css`、`/playground/vendor/marked.umd.js`、`/playground/app.js` 和 `extensions/custom-*`；Agent 或开发者修改 `runtime/playground/styles.css` / `runtime/playground/app.js` / `runtime/playground/extensions/custom-styles.css` / `runtime/playground/extensions/custom-scripts.js` 后，刷新浏览器即可生效，不需要重启 `ugk-pi`。
- 这条“零重启”只适用于 `runtime/playground/` 运行时文件。修改 `src/ui/playground-styles.ts`、`src/ui/playground-page-shell.ts`、`src/ui/playground.ts` 或其他 `src/ui/` TypeScript 源码后，必须重启 `ugk-pi`，或使用 `npm run dev` 的 watch 进程让服务重新加载模块；运行中的 `tsx src/server.ts` / 生产 Docker 进程不会自动热加载这些源码。
- `POST /playground/reset` 会把 factory 文件重新复制到 `runtime/playground/`，用于运行时前端被改坏后的恢复。它不会重新加载 `src/ui/` TypeScript 模块；如果当前服务进程里的 factory 来自旧的内存模块，reset 会继续恢复旧 factory，直到服务重启或 watch 重新加载。`runtime/playground/` 和 `runtime/playground-factory/` 都是运行产物，不进 Git；源码真源仍在 `src/ui/`。
- 运行时 agent 通过项目级 skill `.pi/skills/playground-runtime-ui/SKILL.md` 获得这套用法；用户要求修改 playground UI、浅色主题、消息气泡、composer、logo、移动端布局或零重启前端调试时，应先触发该 skill，再决定是临时改 `runtime/playground/extensions/custom-styles.css`，还是把正式修复落回 `src/ui/`。

这份文档只记录当前 `playground` 的真实前端约束，避免下一个人又拿旧截图和过时口径瞎猜。

## 2026-04-30 主工作区切换补充

- 桌面端页面外层 padding 只由 `.shell` 统一提供，当前为 `22px 28px 26px`；左侧 `desktop-conversation-rail` 仍占满上下，左栏和右侧工作区之间保留 `16px` 间距。右侧 `topbar` 贴住右侧工作列顶部且不再自带外边距；右侧 `chat-stage` 不再叠加内部 padding，底部 `command-deck` / composer 宽度贴满右侧工作列并贴住可用底边。
- 桌面端 `topbar` 主工具条只保留页面切换入口，顺序固定为 `新会话`、`文件库`、`后台任务`、`消息`；当前 Agent 标签位于右侧上下文按钮左边，点击后进入 Agent 操作台。上传文件不再放在 topbar 文件菜单里，而是作为 composer 左侧的 `+` 按钮触发真实 `file-input`。技能入口不再作为桌面或移动端可见按钮展示。
- 外部化 playground 会按 factory manifest 的 `sourceHash` 自动同步 runtime 的核心文件；样式或脚本源码变化后，不应该再出现只重启容器但 `/playground/styles.css` 仍是旧内容的情况。runtime 的 `extensions/custom-styles.css` / `custom-scripts.js` 只在缺失时补回，避免覆盖本地运行态扩展。
- 深色主题下桌面端 `chat-stage` 不再使用边框或深色渐变背景；它只是负责布局裁切，保持 `border: 0`、`border-radius: 4px`、`background: transparent` 和 `overflow: hidden`。贴底的 `command-deck` / composer 同样用 `4px` 圆角和 `overflow: hidden` 收口，避免输入区背景把 `chat-stage` 底部圆角盖成直角。
- 桌面端 active 对话态的 `.stream-layout` 顶部 inset 为 `0`，对话消息列必须从 `chat-stage` 顶部开始占满背景框；`#transcript` 自身底部保留 `4px` 圆角，消息正文内部的 `message-body` padding 只作为内容排版留白，不再承担外层布局留白。
- 桌面端 `topbar` 内的 `landing-side-right` 工具条使用和会话栏一致的扁平承载面：深色主题纯 `#080c14`，浅色主题纯 `#ffffff`，不要再叠 `linear-gradient` 做浮层效果。
- 桌面端 `topbar` 的文件菜单不再靠纯 CSS `:hover` / `:focus-within` 控制；`desktop-file-menu` 使用 `data-open`、`aria-expanded`、外部点击和 `Escape` 统一管理打开状态，避免鼠标移向菜单时穿过空隙就关闭，或点击按钮后菜单被焦点状态锁死。
- 桌面端 `chat-stage` 现在有统一 `data-workspace-mode="chat|assets|conn|agents|task"`，由 `src/ui/playground-workspace-controller.ts` 负责切换、按钮激活态、桌面 / 移动断点分流和面板 DOM 放置；不要在资产库、后台任务、Agent 管理或任务消息控制器里散写 `chatStage.dataset.workspaceMode`。
- 桌面端点击 `项目文件`、`后台任务`、当前 Agent 标签或 `任务消息` 时，主工作画布会切到对应 workspace，并临时把既有面板作为 `.workspace-contained` 放进 `chat-stage`；返回或再次点击当前入口会回到对话。对话流式运行不会因为 workspace 切换暂停。
- 移动端继续沿用原来的全屏工作页：文件库、后台任务、Agent 管理和任务消息仍按 `.asset-modal-shell.open`、`.conn-manager-dialog.open`、`.agent-manager-dialog.open`、`.task-inbox-view.open` 的 `100dvh` 移动布局展示，不走桌面 workspace 内嵌布局。
- `workspaceMode` 只是视图壳层；业务状态仍由 `state.assetModalOpen`、`state.connManagerOpen`、`state.agentManagerOpen`、`state.taskInboxOpen` 管。资产加载继续走 `loadAssets()` / `renderAssetPickerList()`，任务消息继续走 `loadTaskInbox()`，后台任务继续走 `loadConnManager()`，Agent 管理继续走 `loadAgentCatalog()` / `renderAgentManager()`；不要新增绕过这些控制器的简化列表。
- `conn-editor-dialog`、`conn-run-details-dialog`、确认弹窗、上下文详情和模型 / 飞书设置仍是二级 modal，不塞进主 workspace。后台任务编辑或查看 run 过程时，应保持原有焦点恢复、Escape 顺序和遮罩点击关闭逻辑。

## 2026-04-29 UI 收口补充

- `bugs/ui-fixes-2026-04-29.tar.gz` 已按当前源码结构源码化落地；压缩包内生成后的 `index.html` / `custom-styles.css` 只作为对照，不是长期真源。
- `C:\Users\29485\Downloads\0429-ui-fix.md` 中的桌面布局重构已合回源码：桌面端左侧 `desktop-conversation-rail` 贯穿全高，底部承载 `设置` 菜单（模型源 / 飞书设置 / 主题切换）；右侧 `topbar` 移到第二列，只承载 `新会话`、`文件库`、`后台任务`、`消息` 和右侧上下文电池。上传文件入口已移到 composer 左侧 `+` 按钮，技能按钮不再作为可见导航项。手机端仍走独立 `mobile-topbar`，`max-width: 640px` 下只隐藏桌面操作按钮；上下文电池复用同一个 `topbar-context-slot` 并定位到手机状态栏右侧。
- 消息气泡导出图片现在会同时收集内联 `<style>` 和 `/playground/` 下的外链 stylesheet，再注入导出 SVG；runtime 外部化模式下的 `styles.css` / `extensions/custom-styles.css` 不应再导致 PNG 只剩纯文字。
- 深色主题 `body::after` 与浅色主题 `:root[data-theme="light"] body::after` 只保留顶部装饰光晕，不再叠加左右侧 `linear-gradient` 遮罩，避免页面两侧被压暗或染灰。
- 移动端顶部品牌和 `chat-stage-watermark` 使用 `public/ugk-claw-logo.svg` / `public/ugk-claw-logo-light.svg`，桌面端继续使用 ASCII 品牌；移动端隐藏 ASCII，避免 box drawing 字符在窄屏字体栈下变形。
- 浅色主题下 `file-download` 与 `asset-pill` 使用白色轻量承载面；深色主题保留冷色边框。
- “回到底部”按钮桌面端仍贴近 transcript 右下，移动端改为 fixed 并按 `env(safe-area-inset-bottom)` 避让底部 composer。

核心实现文件：

- [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
- [src/ui/playground-page-shell.ts](/E:/AII/ugk-pi/src/ui/playground-page-shell.ts)
- [src/ui/playground-styles.ts](/E:/AII/ugk-pi/src/ui/playground-styles.ts)
- [src/ui/playground-workspace-controller.ts](/E:/AII/ugk-pi/src/ui/playground-workspace-controller.ts)
- [src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)
- [src/ui/playground-assets-controller.ts](/E:/AII/ugk-pi/src/ui/playground-assets-controller.ts)
- [src/ui/playground-context-usage-controller.ts](/E:/AII/ugk-pi/src/ui/playground-context-usage-controller.ts)
- [src/ui/playground-conversations-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversations-controller.ts)
- [src/ui/playground-layout-controller.ts](/E:/AII/ugk-pi/src/ui/playground-layout-controller.ts)
- [src/ui/playground-transcript-renderer.ts](/E:/AII/ugk-pi/src/ui/playground-transcript-renderer.ts)
- [src/ui/playground-markdown.ts](/E:/AII/ugk-pi/src/ui/playground-markdown.ts)
- [src/ui/playground-mobile-shell-controller.ts](/E:/AII/ugk-pi/src/ui/playground-mobile-shell-controller.ts)
- [src/ui/playground-active-run-normalizer.ts](/E:/AII/ugk-pi/src/ui/playground-active-run-normalizer.ts)
- [src/ui/playground-conversation-api-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversation-api-controller.ts)
- [src/ui/playground-conversation-sync-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversation-sync-controller.ts)
- [src/ui/playground-conversation-state-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversation-state-controller.ts)
- [src/ui/playground-conversation-history-store.ts](/E:/AII/ugk-pi/src/ui/playground-conversation-history-store.ts)
- [src/ui/playground-history-pagination-controller.ts](/E:/AII/ugk-pi/src/ui/playground-history-pagination-controller.ts)
- [src/ui/playground-process-controller.ts](/E:/AII/ugk-pi/src/ui/playground-process-controller.ts)
- [src/ui/playground-status-controller.ts](/E:/AII/ugk-pi/src/ui/playground-status-controller.ts)
- [src/ui/playground-confirm-dialog-controller.ts](/E:/AII/ugk-pi/src/ui/playground-confirm-dialog-controller.ts)
- [src/ui/playground-notification-controller.ts](/E:/AII/ugk-pi/src/ui/playground-notification-controller.ts)
- [src/ui/playground-panel-focus-controller.ts](/E:/AII/ugk-pi/src/ui/playground-panel-focus-controller.ts)
- [src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)
- [src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)

回归入口：

- `http://127.0.0.1:3000/playground`
- [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)

## 1. 品牌与页面骨架

- 当前品牌文案为 `UGK CLAW`
- 桌面端首页重构为极客 cockpit 布局：`shell` 是 `250px-280px` 左侧历史会话栏 + 右侧工作台的两列网格，左侧历史会话栏头部由真实 DOM 的彩色 ASCII `desktop-brand` 组成唯一品牌信号，`topbar` 只承载右侧紧凑命令条，`chat-stage` 是真正的主工作画布。
- `chat-stage` 中心使用项目 ASCII 字标作为真实 DOM 水印：暗色主题为低透明冷白 / 青蓝，浅色主题为更低透明蓝灰；它必须在消息、composer 和弹层之下，不参与交互，也不能影响正文阅读。旧的 landing `hero-wordmark / hero-version` 空态 logo、旧 topbar 图片 logo 和旧 `UGK CLAW` 伪元素文字不再渲染，避免两套品牌层叠在聊天背景上。
- ASCII 标识必须使用支持 box drawing 的系统等宽字体链 `"Courier New", Consolas, "Cascadia Mono", monospace`，不要套项目默认 `Agave` mono，也不要再用 `.chat-stage::before { content: ... }` 承载整段字标；`Agave` 和 CSS 伪元素缩放都会把 `██╗╚═` 这类字符排成错位鬼影。
- 旧的 `.shell[data-transcript-state="idle"] .transcript-current:empty::before` 空态伪元素 logo 已下线；空 transcript 不再自己生成第二套品牌标识。
- 桌面端 landing 输入区是底部居中的 `760px` command deck，不再把整个页面做成居中表单。
- 手机端顶部状态栏左侧复用桌面 `desktop-brand` 的彩色 ASCII 图案，只做容器尺寸适配；不再渲染 `/ugk-claw-mobile-logo.png` 图片、右侧 `UGK Claw` 文字字标或单独缩水版 `ugk-ascii-logo-mobile`。
- 手机端全局顶部状态栏只作为透明导航层：`mobile-topbar`、移动断点下的 `.topbar`、`topbar-context-slot`、`mobile-brand-button`、`mobile-new-conversation-button`、`mobile-overflow-menu-button` 和顶部上下文电池入口都不使用背景或阴影；真正的层级交给页面背景、历史抽屉和更多菜单承载。
- 页面仍是单一 `landing` 壳子，通过 `data-transcript-state=idle|active` 切空态和会话态
- 当前整体视觉基调已从偏冷蓝电子夜景收口为“深空黑 + 暗紫星云 + 冷白星尘”，蓝色只保留极弱余光，不再主导页面气质
- 桌面端 landing 的工具入口现在直接挂在 `topbar` 命令条内；按钮只保留关键命令，减少首屏视觉负担。空态 landing 下命令条居中，active 会话态继续保持既有工作台节奏，避免首屏右侧工具组偏移。
- 页面背景层数和 `backdrop-filter` 已收口，避免用多层半透明玻璃效果把每次滚动和重绘都变成性能税。
- 桌面端深色主题使用近黑网格、左侧会话索引、右侧深色工作画布和低强度冷色状态线；浅色主题使用冷白网格、白色会话索引、浅色工作画布和蓝灰状态线。浅色主题必须覆盖桌面背景氛围层，不能让深色边缘压暗层漏进来把页面两侧染灰。

## 2. 消息区约束

- 消息宽度跟随 composer 实际宽度，不依赖写死常量
- transcript 只有在用户停留在底部附近时才自动跟随最新输出；用户明显上滑阅读历史时，`text_delta`、loading 和过程日志更新都不能强制滚到底部
- 除了用户主动点击“回到底部”、或页面本来就停留在底部附近的自然跟随外，会话切换、新会话恢复、后台静默同步、广播补同步这类接口回包都不能强制打断当前滚动位置，更不能一有 `GET /v1/chat/state` 回来就把 transcript 硬拽到底部
- 如果用户是在同一条会话里先看到本地恢复内容、随后又上滑阅读历史，晚到的 canonical `GET /v1/chat/state` 回包也必须保住当前阅读位置；不能因为整段 transcript 重绘或排队中的自动滚底 timer 继续执行，就把页面重新甩回底部
- 非强制滚底现在会做冷却合并；顶部加载历史的触发阈值也收窄到真正接近顶部，避免滚动过程中反复打断阅读。
- 浏览器端布局同步、composer textarea 自适应高度、`--conversation-width` / `--command-deck-offset` 更新、transcript 自动跟随、回到底部按钮、顶部加载更多触发、以及 `visibilitychange/pageshow/online` 恢复同步入口集中在 `src/ui/playground-layout-controller.ts`；`src/ui/playground.ts` 只保留主 state、DOM refs 和页面装配
- 浏览器端 transcript 条目拼装、assistant 状态壳层、运行日志入口、正文复制按钮、markdown hydration、代码块 copy toolbar、历史恢复后的消息渲染，以及 `bindPlaygroundTranscriptRenderer()` 初始化入口集中在 `src/ui/playground-transcript-renderer.ts`；`src/ui/playground.ts` 只保留会话恢复、流式事件和这些渲染函数的调用点
- 用户消息气泡使用绿色背景，气泡内链接和引用文件 chip 必须使用深色文字专用覆盖；不要让 assistant markdown 链接色或全局文件 chip 浅色文字漏进用户气泡。
- 浏览器端 `normalizeActiveRun()`、`normalizeProcessView()` 和 `formatProcessViewEntry()` 集中在 `src/ui/playground-active-run-normalizer.ts`；该文件只做 active run / process view 数据兜底，不负责消息 DOM 查找或渲染
- 浏览器端通知广播 SSE、active run 事件流 attach / teardown、断线恢复、`send / queue / interrupt` 主链路，以及 `bindPlaygroundStreamController()` 初始化入口集中在 `src/ui/playground-stream-controller.ts`；`src/ui/playground.ts` 不再兼任 stream lifecycle 泵站
- 浏览器端 `fetchConversationRunStatus()`、`fetchConversationState()`、`fetchConversationHistoryPage()` 集中在 `src/ui/playground-conversation-api-controller.ts`；这里只负责请求 `/v1/chat/status`、`/v1/chat/state`、`/v1/chat/history` 和响应兜底归一化，不负责 DOM 渲染或 sync ownership
- 浏览器端更早历史补页、`historyAutoLoadStatus`、服务端 history 分页合并、prepend 后滚动高度补偿集中在 `src/ui/playground-history-pagination-controller.ts`；会话恢复和 sync token 仍由 `src/ui/playground.ts` 编排
- 浏览器端顶部状态、loading 忙态、stage mode、error banner、控制动作错误文案集中在 `src/ui/playground-status-controller.ts`；`src/ui/playground.ts` 只保留对应 DOM refs 和初始化调用点
- 浏览器端弹层关闭前的焦点释放、关闭后的返回焦点恢复、确认框与文件库 / 任务消息 / 后台任务等面板共享的焦点 helper 集中在 `src/ui/playground-panel-focus-controller.ts`；`src/ui/playground.ts` 只负责注入脚本和调用这些 helper
- 浏览器端二次确认弹窗的 `openConfirmDialog()` / `closeConfirmDialog()`、默认文案、tone 标记和 Promise resolve 逻辑集中在 `src/ui/playground-confirm-dialog-controller.ts`；`src/ui/playground.ts` 只保留 DOM refs、事件绑定和脚本注入
- 浏览器端实时通知 toast 的 `normalizeNotificationBroadcastEvent()`、`showNotificationToast()`、live region 显隐、toast 自动移除和 notification 重连 timer 清理集中在 `src/ui/playground-notification-controller.ts`；`src/ui/playground-stream-controller.ts` 继续负责 SSE 连接与重连调度
- 浏览器端 slash command 也归 `src/ui/playground-stream-controller.ts` 管：`sendMessage()` 在计算正常 `outboundMessage` 和进入 `/v1/chat/stream` / `/v1/chat/queue` 前先调用 `parsePlaygroundSlashCommand()` 与 `runPlaygroundSlashCommand()`。当前只支持 `/new`，它复用既有 `startNewConversation()` 创建 / 激活新会话，不写 transcript、不追加用户气泡、不进入 agent runtime；未知 `/xxx` 指令只报错并保留草稿。指令不能和附件或引用资产一起发送，否则直接拦截并恢复 composer 草稿。这层是未来指令模式的入口，不要把 `/new` 当成聊天消息发给模型再让模型猜。
- 深色 / 浅色主题切换集中在 `src/ui/playground-theme-controller.ts`：该文件输出 light theme 覆盖样式与浏览器端持久化脚本，`src/ui/playground.ts` 只注入桌面和手机入口。主题值存入 `localStorage` 的 `ugk-pi:playground-theme`，并通过 `<html data-theme="dark|light">` 生效。
- 浅色主题现在按“冷白工作台”完整覆盖 chat、文件库、后台任务、任务消息、上下文详情弹窗、历史抽屉和移动更多菜单：根背景是 `#e8edf6` 冷白网格，主文字是 `#142033`，metadata 使用蓝灰，状态色继续区分成功 / 警告 / 危险。不能让深色主题的透明白文字漏到浅色卡片上，也不能在浅色工作页里保留整块黑色面板；markdown 标题 / strong / code / 表格滚动外壳、文件 metadata、任务消息 metadata、conn 状态徽标、上下文指标块和历史抽屉文字都必须有浅色专用映射。手机端品牌入口和历史抽屉头部只承担结构与文字，不承担层级背景，深浅主题都保持透明、无阴影。
- 浅色工作页的层级策略是“透明分组 + 白色承载面”：只负责排版的 `chat-stage`、`command-deck`、`.file-strip`、已选资产容器、顶部拖拽提示、表单字段、工具栏、列表外壳和高级设置容器保持透明；真正的 `#composer-drop-target.composer`、输入框本体、按钮、file chip、重复条目、结果气泡、目标预览和状态面板才使用浅色实体背景。`#message` 不能跟随外层分组透明化，它必须保留冷白输入承载面。后台任务创建页的 label / hint / `conn-editor-target-preview` / 时间输入 / 时间选择器日历 / focus ring 都由 `src/ui/playground-theme-controller.ts` 显式覆盖，不能再继承深色主题的白字、黑色输入块或默认浏览器黑色 focus 边。
- `src/ui/playground.ts` 当前尾部初始化已经收口为 `bindPlaygroundAssemblerEvents()` 与 `initializePlaygroundAssembler()`；旧的 `fetchConversationHistory()` 死 helper 已移除，页面入口不再继续堆散装初始化语句
- 用户离开底部阅读历史时，页面显示“回到底部”按钮；点击后立即回到底部，并恢复后续自动跟随。该按钮允许使用轻量描边和阴影提高可发现性，深色主题走青蓝提示，浅色主题走绿色提示，但不能抢发送按钮的主 CTA 注意力。
- active 对话态的 `transcript-current` 底部必须保留额外可滚动余量，让最后一条消息能被用户继续上拖到 composer 上方，不被底部输入框压住
- 当前 Web 入口采用“一个 agent、多个历史会话、一个全局当前会话”的模型；服务端维护 `currentConversationId`，不同浏览器 / 设备打开后都跟随这个当前会话
- 页面冷启动或刷新时，会先通过 `GET /v1/chat/conversations` 获取服务端会话目录和当前会话，再按当前 `conversationId` 请求一次 `GET /v1/chat/state` 同步真实历史与 active run
- 空闲旧会话的 `GET /v1/chat/state` / `GET /v1/chat/history` / `GET /v1/chat/status` 必须走轻量 session JSONL 消息读取；查看历史或切换旧会话不应该初始化完整 agent session、reload skills 或创建 runtime resource loader。只有发送新消息、续跑 active run、队列 steer/follow-up 这类真正需要 agent runtime 的动作才打开完整 session。
- 服务端 `ConversationStore` 对会话目录 index 使用进程内 `mtime` cache 和串行写队列；`GET /v1/chat/conversations`、`POST /v1/chat/current`、`POST /v1/chat/conversations` 这类高频路径不能再恢复成每次读写整份 JSON 且无队列保护的模型。写入必须保留同目录临时文件 + `rename` 的原子替换，避免高频切换时出现目录等待或并发覆盖。
- 会话激活现在是两阶段提交：`POST /v1/chat/current` 或 `POST /v1/chat/conversations` 确认目标 `conversationId` 后，前端立即切到目标会话 shell 并释放交互；canonical `GET /v1/chat/state` 只作为后台 hydrate 收口真实历史与 active run，不能再卡住切换 / 新建手感。
- 前端对会话历史恢复和运行态同步的异步 `GET /v1/chat/state` 回包现在统一走会话 sync ownership：会话切换会使旧 generation 失效，同一会话内较新的同步请求也会压过较早请求；如果旧会话请求慢回、或同会话旧请求晚于新请求返回，这个 stale response 都必须被直接丢弃，不能再把旧消息覆盖回当前 transcript
- 会话 sync ownership 不只负责丢弃旧回包，也会通过 `AbortController` 取消上一条未完成的 `/v1/chat/state` 请求；多次快速切换会话后再点 `新会话`，不应被一串已经过期的 state 请求排队拖慢。
- 会话目录同步现在带 `conversationCatalogSyncPromise` 复用与短时 freshness 冷却；切换 / 新建 / 删除会话后优先复用当前 catalog 结果并按需失效，避免把 `/v1/chat/current` 的切换手感拖成重复目录 round-trip
- 会话目录同步失效或强制刷新时，会通过 `AbortController` 取消上一条未完成的 `/v1/chat/conversations`；旧 catalog 请求不能继续占住后续 `新会话` / 恢复同步动作的等待链，也不能在 abort 后弹出错误提示。
- canonical `GET /v1/chat/state` 回包不再默认清空并重绘整段 transcript；前端会用 `buildConversationStateSignature()` 判断同会话同签名状态，命中时跳过 DOM 重绘，只同步 context usage 和 active run 壳层。消息窗口变化时先 patch 已渲染节点或 append 新节点，只有会话切换或当前消息序列无法对齐时才重建当前 transcript。
- 本地 `localStorage` 只作为当前设备的冷启动缓存和渲染快照，不再作为会话身份、当前会话指针或运行态事实源
- `GET /v1/chat/state` 必须返回后端已经归并好的 `viewMessages`：服务端负责把 canonical `messages` 与 active / terminal run 合成最终可渲染视图；前端优先渲染 `viewMessages`，不再保留自己补画 active input / active assistant 的兼容分支，否则同一轮刚结束就会显示成“问题 / 回答 / 问题 / 回答”
- 运行中的 active run 必须把“稳定历史”和“本轮进行中尾巴”分开：底层 `session.messages` 可能已经提前写入当前 run 的 user / assistant 片段，但这些片段在 `activeRun.loading=true` 时不能进入 canonical `messages`；`viewMessages` 只能由 run 开始前的稳定历史 + activeRun snapshot 合成，避免页面运行中偶发 `user-agent / user-agent` 双轮显示。刷新后正常不代表运行中正常，别又拿前端文本去重当创可贴。
- `GET /v1/chat/state` 支持 `viewLimit`，默认只返回最近 160 条可渲染历史，并通过 `historyPage.hasMore / nextBefore / limit` 告诉前端是否还有更早历史；别再让 state 为了切换会话把完整 JSONL 和完整 transcript 一口气塞给浏览器。
- 空闲旧会话的 `GET /v1/chat/state` 底层优先使用 `readRecentSessionMessages()` 从 session JSONL 尾部读取最近窗口；返回给前端的消息 id 仍按原始 session message 序号计算，`historyPage.nextBefore` 可以继续交给 `/v1/chat/history?before=...` 补页。`GET /v1/chat/history` 和 `GET /v1/chat/status` 仍保留完整读取语义，别为了省 I/O 把游标分页和上下文用量口径一起砍歪。
- `GET /v1/chat/history` 支持 `limit` 和 `before` 游标分页，响应带 `hasMore / nextBefore / limit`；聊天区不再显示“加载更多历史”分页按钮，用户向上滑到 transcript 顶部附近时自动补页，不能只吃 `localStorage` 里最近 160 条缓存。
- 当前 active run 在 transcript 里只保留一个助手气泡：正文上方是一条会持续改写的人话状态摘要，下面是一枚可点击的动态 loading 气泡；旧的独立“过程展开区”已经下线，不再额外制造第二层消息结构
- 手机端 active run 的状态摘要不再塞进助手气泡内部，而是作为气泡上方的浅灰色单行状态文本展示；运行日志 loading 按钮移动到 `助手` 标签右侧，只保留动态点，减少空正文气泡里的视觉噪音。
- active run 刚开始、助手正文还没吐出任何文字时，空 `.message-body` 不应显示成一块空白气泡；等真正有正文、文件或附件内容后再展示气泡主体。
- 空助手占位阶段也不能提前渲染 `.message-actions`；复制 / 导图按钮只有在该条消息已经有正文、附件、引用资产或文件结果时才挂到 `.message-body` 底部。否则操作栏本身会把空 body 撑开，老问题又回来，属于自找麻烦。操作栏不再叠加自己的上边距，助手气泡内部不再保留额外 `gap`，避免浅色气泡底部出现一截无意义空白。
- 用户消息气泡统一使用微信式绿色 `#95ec69` 与深色正文，深色 / 浅色主题都保持一致；导出图片走源码样式收集，所以这类气泡颜色必须固化在 `src/ui/playground-styles.ts` / `src/ui/playground-theme-controller.ts`，不能只靠 `runtime/playground/extensions/custom-styles.css` 覆盖。
- 手机端消息操作不再显示底部 `.message-actions` 图标行；长按有内容的消息气泡 500ms 会弹出菜单，提供“复制正文”和“导出图片”。桌面端仍保留气泡底部的轻量图标操作。
- 新一轮助手状态从无到有第一次出现时，会强制把 transcript 拉到底部，让用户看到 agent 已经开始响应；后续流式过程更新仍遵守“用户上滑阅读历史时不抢滚动”的规则。
- 状态摘要 `assistant-status-summary` 现在固定为单行省略；它负责给人一个稳定的人话进度感，不再允许换行把整条消息高度顶来顶去
- 浅色主题下 `assistant-status-summary` 和承载它的状态壳层保持透明，只承担文字进度提示；终态 `assistant-run-log-trigger.ok` 的“查看运行日志”文案必须使用可读的绿色文字，不能继承深色主题的低透明白字。
- 运行日志按钮不再显示工具执行结果、bash 输出或 JSON 长文本；页面可见层只保留动态点和“查看运行日志”入口，过程细节只留在运行日志弹层与按钮的辅助文案里
- 动态 loading 气泡点击后会打开运行日志弹层，并按 `conversationId + runId` 请求 `GET /v1/chat/runs/:runId/events`；任务过程追溯从对话正文里解耦，不再把工具过程当成正文的一部分硬塞进气泡
- 运行日志弹层按倒序分页展示：首次只取最新 2 条非 `text_delta` 事件，用户向下滚动到底部后按 `nextBefore` 增量加载更早日志；单条详情最多显示预览，避免长工具输出或最终正文撑爆弹层。
- active run 的状态摘要和运行日志入口在同一条助手消息内必须保持单例；前端每次挂载新的 `.assistant-status-shell` / `.assistant-run-log-trigger` 前都会清掉同卡片旧控件，避免流式 patch 或状态恢复把多个 loading 气泡堆在同一条消息里。刷新后才正常这种“薛定谔 UI”不算正常，必须在运行中就稳定。
- `done / error / interrupted` 终态 run 也会保留 `runId` 和 buffered events；刷新页面后，如果这轮仍是当前 terminal snapshot，用户应该还能从同一条助手气泡继续查看运行日志
- 会话列表按钮的可用状态必须跟随前端 `state.loading` 重绘：进入运行态时禁用切换 / 删除，任务 `done / error / interrupted` 或 canonical state 确认为 idle 后，`setLoading(false)` 必须重新渲染会话列表并释放 DOM 上残留的 `disabled`。不能只更新后端 `running=false` 或顶部状态文案，却让列表按钮继续假死。
- 从后端 session 恢复用户历史时，只展示用户原始消息；`<user_assets>`、`<asset_reference_protocol>`、`<file_response_protocol>` 这类运行时注入给模型的内部 prompt 协议不得出现在 transcript 里
- 用户切回旧会话继续发送消息时，后端必须继续复用这条会话原来的 `sessionFile` 上下文；不能因为项目技能目录更新、`skillFingerprint` 变化，就偷偷新开一条空 session 让 agent 当场失忆
- 从后端 session 恢复已完成任务时，连续的 assistant 消息片段必须在 `AgentService` 的 canonical history 中合并为同一条助手回复；不要让刷新后的页面把同一轮浏览器处理过程拆成多条“助手”气泡
- 历史消息默认先渲染最近一段；向上滚动到 transcript 顶部附近时，会自动继续向服务端补更多旧消息，并保持当前阅读位置。顶部只允许出现非交互的加载状态提示，不再放可点击分页按钮；聊天界面不是后台列表页，别把分页按钮硬塞进消息流。
- `landing` 模式下，对话区底部避让按“`chat-stage` 底部到 `command-deck` 顶部的真实距离”动态计算，不再偷懒拿固定值或只拿 `command-deck` 高度瞎猜
- 对话消息列宽度必须跟 `#command-deck.command-deck` 的左右边界一致；`syncConversationLayout()` 用 `commandDeck.getBoundingClientRect().width` 写入 `--conversation-width`，不要再改回按 `#composer-drop-target` 的内部输入区宽度计算，否则消息气泡会和底部命令区左右错位。
- `landing` 模式下 transcript 容器会被锁进可用高度内，多选文件 / 资产后应表现为对话区收缩并滚动，而不是继续向下顶进 `command-deck`
- 桌面端 active 会话虽然仍复用 `landing` 壳子，但 transcript 顶部不能继承空态 hero 的大留白；`data-transcript-state="active"` 下 `.stream-layout` 顶部 inset 固定收紧到 `18px`，让第一条消息靠近工作台顶部。空态 idle 仍保留较大的 hero 呼吸空间。
- 用户消息固定靠右
- 用户消息正文保持标准左对齐，避免右侧大段文字影响阅读
- 用户消息 `message-meta` 只显示时间，并贴右展示
- 浅色主题下用户消息必须有自己的轻量回显样式：右侧白色承载面、浅绿色来源边框、深色正文；不要再加右侧竖线，不要继承助手消息的整块白色阅读面，也不要继续使用深色主题留下来的灰黑气泡。
- 历史消息时间优先使用 session message 自带的 `timestamp` 透传成 `createdAt`；不要再把所有恢复消息默认写成 Unix epoch，否则前端会整排显示 `08:00:00`
- 每个消息气泡的操作栏固定放在 `.message-body` 内部底部，不再挂在气泡外层；操作栏只保留紧凑 icon-only 控件，贴近正文但不挤压 meta。
- 消息操作栏当前包含复制正文和保存图片两个按钮：复制只复制当前消息正文，不复制时间、角色标签和文件按钮；保存图片会把 `.message-body` 的渲染效果导出为 PNG，导出图排除操作栏自身，并在图片外层加 `UGK Claw 导出` 签名 label。导出副本必须是自包含内容：外部 `@import`、`@font-face`、非片段 `url(...)` 和消息内媒体节点都不能进入 canvas 绘制路径，媒体内容使用紧凑占位块替代；包含 `foreignObject` 的 SVG 中间图必须使用 `data:image/svg+xml`，不要回退成 `blob:` URL，避免 `toBlob()` 因 tainted canvas 失败。
- 消息操作栏按钮统一使用透明背景、无边框、无阴影，文字只保留在 `aria-label` / 隐藏文本里，不再占用纵向空间。
- composer textarea 默认使用 `rows="1"`，不要让浏览器按 textarea 默认 2 行去算空内容高度；默认最小高度已收口到 `52px`，桌面端使用 `14px` 上下内边距；自适应高度脚本在空内容和单行内容时必须保留 CSS `min-height`，让 placeholder 与正文按同一行高纵向居中，多行内容才按 `scrollHeight` 扩展。不要再让浏览器 `scrollHeight` 把单行输入框算歪。
- markdown 正文渲染使用 `marked`，不是项目内手写解析器；服务器端 `renderPlaygroundMarkdown()` 在 `src/ui/playground-markdown.ts`，`src/ui/playground.ts` 只负责 re-export 给测试和页面入口兼容；浏览器端 transcript hydration 仍在 `src/ui/playground-transcript-renderer.ts`。后续补 Markdown 能力时优先配置/升级渲染库，不要继续追加临时正则
- markdown 正文里的“普通段落 + 紧跟 fenced code block”必须能正常渲染，不能再把 `CODEBLOCK0` 之类占位符漏到用户界面上
- markdown 正文里的 pipe table 与 `---` 分割线必须渲染为真正的 HTML 结构，不能继续把 `|------|` 或 `---` 当普通字符显示
- 助手气泡里的 Markdown 正文使用更紧凑的阅读规格：正文 `12px`，`h1 / h2 / h3` 分别为 `18px / 16px / 14px`，链接、inline code、blockquote 和表格头使用轻量颜色区分；用户气泡不套这组助手正文色彩规则。
- markdown 表格由外层滚动容器控制最大宽度，`table` 本体按内容宽度展示，不强制撑满消息气泡；单元格允许长文本换行，宽表最多占满气泡并横向滚动。浅色主题下表格外壳使用冷白承载面和蓝灰边线，不能沿用深色半透明背景。
- `not_running`、`abort_not_supported` 这类运行态控制错误统一从顶部悬浮横幅提示，不再占用主内容流，也不再写进底部过程流
- 顶部错误横幅去掉边框，统一 `4px` 圆角，右侧提供 `x` 关闭按钮
- 顶部错误横幅使用不透明高对比背景，不能再用半透明红色叠在页面背景上糊成一片；手机端提示文案必须能直接读清楚
- 顶部错误横幅默认带 `hidden`，只有真正出现错误时才解除隐藏；刷新页面后不该再残留一个空壳横幅
- 同时使用 `.error-banner[hidden] { display: none !important; }` 兜底，不把显隐安全性全压在单条普通样式规则上
- 系统反馈在视觉上跟助手消息保持一致，不再单独走一套“提示条”布局
- transcript 里的消息视觉类型只保留两类：`user` 走用户气泡，其余 `assistant` / `system` / `error` 等语义都走助手气泡；真实语义继续保存在 `data-message-kind`
- `/v1/chat/stream` 请求被拒绝、网络失败和缺少 `done` 的异常收口到顶部错误横幅与当前助手气泡过程区，不再额外追加 `message error` 主内容气泡
- 所有矩形统一使用 `4px` 圆角

## 3. 助手“思考过程”区域

- 思考过程嵌在助手回复气泡内，只保留单个壳子
- 默认展开，按钮显示 `收起`
- 上半区显示过程叙述，自动滚到最新内容，最多展示 5 行
- 下半区显示“当前动作”，固定展示 2 行
- 点击 `收起` 后：
  - 隐藏上半区叙述
  - 隐藏“思考过程”标题
  - 只保留下半区当前动作
- 外层为深色底、无边框
- “当前动作”不再使用独立小卡片背景，只靠上下分割线区分

## 4. 文件与资产展示

- 文件上传区、文件 chip、已选资产区和资产库弹窗的静态样式 / HTML 现在集中在 `src/ui/playground-assets.ts`
- 文件上传、拖拽投放、附件 chip 渲染、资产库刷新 / 复用、已选资产和文件下载卡片运行时逻辑集中在 `src/ui/playground-assets-controller.ts`
- `src/ui/playground.ts` 只负责把文件 / 资产控制器片段注入到主浏览器脚本，并在发送、恢复、上下文估算等主流程里调用这些函数
- 手机端文件库不再按桌面居中弹窗或底部抽屉压缩显示，而是全屏工作页：`asset-modal-shell.open` 使用不透明 `#01030a` 背景，`asset-modal` 占满 `100dvh`，顶部是带 `topbar asset-modal-head mobile-work-topbar` 的统一状态栏；左侧是返回箭头和 `可复用资产` 标题，右侧直接放 `刷新文件库`，不再显示占位很蠢的 `回到对话` 文字按钮。顶部和列表都沿用无边框仪表盘语言：工作页头部克制承载导航，列表条目使用 `#0b0e19` 实心层级，靠背景深浅、字号和留白分区，不再靠浅色边框把每块内容圈起来。
- 待发送附件和已选资产统一用 chip 风格展示
- 待发送附件和已选资产的 chip 列表必须允许多行换行，文件名最多两行展示，列表自身最多占一小段高度后内部滚动；不要再把多个 PNG / TXT chip 挤成一条横向小火车，标题看不清就是失败。
- 一次最多只发送 5 个文件；用户选择超过 5 个时，提示走顶部错误 / 通知反馈，不得再写入 transcript，也不得渲染成孤零零的 `process-note-text`。
- chip 包含：
  - 类型 badge
  - 文件名
  - 可选删除按钮
- 选择区里的 chip 可删除
- 历史消息里的 chip 不显示删除按钮
- 已发送附件 / 引用资产会直接显示为 chip，不再自动补“引用资产:”文案
- 选择文件后，输入框不会自动注入文件清单文本
- 选择文件后，也不会再出现“文件已载入 / 待发送附件 / 文件上传中”这类额外对话提示；选文件只是 composer 本地资产上传动作，不是 agent run，不能调用 `updateStreamingProcess()` 或 `appendProcessEvent()` 生成空助手气泡。
- 打开或刷新文件库时，`GET /v1/assets?limit=40` 的正常请求和成功结果不再写入 transcript 过程提示；资产列表直接在文件库页面更新。只有失败才通过顶部错误和错误过程提示暴露，别再把“资产清单 · 请求 /v1/assets”这种内部流水账塞给用户看。
- 助手返回的文件下载卡片现在区分“打开”和“下载”两个动作：
  - 安全可预览文件（如 `png`、`jpg`、`gif`、`webp`、`pdf`、`txt`、`md`、`json`、`csv`）会显示“打开”按钮
  - “下载”按钮会显式走 `?download=1`，不再跟预览复用同一条附件响应
- agent 通过 `send_file` 交付的文件必须保留在 canonical conversation history 里；刷新会话或晚到的 `GET /v1/chat/state` 不能把已经出现过的文件卡片洗掉
- 如果某一轮只有 `toolResult(send_file)`、没有自然语言 assistant 正文，后端也必须补一条可见的 assistant history entry 承接文件卡片；别再让用户看着文件先出来、过一会儿又被 state 回包洗没
- 与 `web-access` 相关的页面清理现在走“会话级稳定 scope + 运行前预清理 + finally 收尾清理”；这层收口不改用户交互，但会直接影响长时间使用后的浏览器残页数量
- `/v1/files/:fileId` 对安全可预览文件默认使用 `inline`；不安全或不可预览类型仍保持 `attachment`
- `/v1/files/:fileId` 对 Markdown / 纯文本 / JSON / CSV 等文本型文件会补 `charset=utf-8`，避免中文 `.md` 预览被浏览器按错误编码打开成乱码
- `html`、`svg`、`js` 这类可执行或脚本风险较高的文件不会直接作为同源预览打开，别为了省事把安全边界拆了
- `conn` 创建 / 编辑器里的“附加资料”不再让用户硬填 `assetId`；界面提供“选择复用文件”和“上传新文件”两个入口，最终仍映射为内部 `assetRefs`
- `conn` 编辑器上传新文件时，前端会进入 `connEditorUploadingAssets` 忙态，把上传按钮显示为“上传中”，并临时禁用保存和再次上传；失败时会在编辑器错误区显示 `上传失败（HTTP xxx）` 这类带状态码的反馈，不允许再表现成“选择文件后没反应”
- 主 chat 输入区与 `conn` 附加资料上传都走 `POST /v1/assets/upload` 的 `FormData` / `multipart/form-data` 标准文件上传，不再把浏览器文件读成 base64 JSON；`POST /v1/assets` 不再接受 JSON 上传
- 主 chat 选择或拖拽文件后，前端会先把文件注册成资产并自动加入已选资产区；真正发送消息时只携带 `assetRefs`，不再向 `/v1/chat/stream` 或 `/v1/chat/queue` 塞文件内容
- 当前上传限制为单文件 64MiB、一次最多 5 个文件，生产 nginx 总请求上限 80m；前端和后端都要让失败有明确反馈，别再把限制做成沉默失败。
- 顶部“上下文使用”按钮对已选资产的估算要贴近后端真实 prompt 行为：大文本资产按后端 `readText()` 的截断上限估算，二进制资产按元数据引用估算；不要再因为选了个大文件就假装上下文瞬间爆满，吓唬人不算能力。
- 已选“附加资料”不再依赖最近 40 条资产列表死活；如果某个已选资产不在当前 recent 列表里，前端会按需补拉 `/v1/assets/:assetId`，而不是偷偷把它从表单里抹掉
- 资产详情按 id hydrate 时前端必须走 `assetDetailQueue` + `assetDetailInFlightById`：同一 assetId 的并发请求复用同一个 Promise，最多 4 路同时请求 `/v1/assets/:assetId`。不要把它改回裸 `Promise.all(assetIds.map(async ...))`，那是在附件多的时候主动制造请求风暴。

### 非 chat 工作页与弹窗视觉口径

- 除主聊天 transcript / composer 外，文件库、后台任务管理器、后台任务编辑页、任务消息页、运行日志弹窗、确认弹窗和后台任务过程弹窗都按“无边框深色仪表盘”处理。
- 普通状态下不要用浅灰边框划分结构，也不要用阴影制造层级；优先用 `#01030a` 页面背景、`#101421` header、`#0b0e19` 内容卡片、`#080a13` 次级条目、字号、留白和状态色制造层次。
- 圆角保持克制：页面外壳为 `0`，常规卡片和按钮以 `4px` 为主，独立信息面板最多 `8px`。别再把工作页做成一堆大圆角卡片，后台味和玩具味都会冒出来。
- 浅色模式不是把这些工作页反相成一堆灰卡片；对应口径是冷白页面、透明结构容器、白色输入 / 条目 / 结果承载面、蓝灰 metadata 和少量蓝色 focus / active 状态。任何白字、黑块、浅灰块叠浅灰块导致层级糊掉，都按主题缺陷处理。
- 浅色主题下运行日志弹窗和后台任务过程弹窗必须使用浅色面板 + 深色正文；不要把暗色主题的白字直接套到浅色背景上。

## 5. “查看技能”按钮行为

- 点击后会生成一条像助手回复的消息
- 先展示简化过程：
  - 接收到指令
  - 请求 `/v1/debug/skills`
  - 接口返回
  - 整理结果
- 最终结果会直接列出完整技能清单
- `GET /v1/debug/skills` 响应包含 `source: "fresh" | "cache"` 与 `cachedAt`；`DefaultAgentSessionFactory` 会在 skill fingerprint 未变化且 30 秒 TTL 内复用缓存，避免每次点“查看技能”都重建 resource loader 和 reload skills。技能文件变化会让 fingerprint 失效并刷新。
- 不再把旧的 system 调试噪音塞进 transcript

## 5.1 后台任务过程查看

- `playground` 里与 `conn` 相关的结果查看已经收口成统一的 run detail 入口，不再要求用户先切回某个会话才能追任务结果。
- 当任务消息或后台任务列表条目同时满足 `source=conn`、`sourceId`、`runId` 时，消息底部会出现一个小型“查看后台任务过程”入口。
- 点开后前端会分别请求：
  - `GET /v1/conns/:connId/runs/:runId`
  - `GET /v1/conns/:connId/runs/:runId/events`
- 后台任务过程的事件列表同样按倒序分页展示：首次只取最新 2 条，向下滚动继续按 `nextBefore` 加载更早事件；`text_delta` 类正文增量不展示，事件 JSON 详情只显示截断预览。
- 弹层里当前展示 run 状态、时间戳、workspace、sessionFile、结果摘要、输出文件索引和过程事件列表
- 后台 conn 通知正文来自 `conn_runs.resultText`。runner 会避免把“输出文件已写入”这种低信息量尾句当成唯一结果；如果模型先回答了问题、后面只是补一句文件写入提示，通知应优先展示真正回答。
- 后台 run 成功后会扫描该次 workspace 的 `output/` 目录并写入 `conn_run_files`；所以弹层里的输出文件索引应该能看到真实产物，而不是只在正文里出现一个打不开的路径。
- run 详情入口既服务任务消息页，也服务后台任务管理器；别再把“结果展示”和“当前聊天 transcript”捆成一坨，后面只会越来越乱。

## 5.2 任务消息页

- `playground` 现在提供独立的 `任务消息` 入口：桌面端顶部按钮是 `open-task-inbox-button`，手机端入口在更多菜单里的 `mobile-menu-task-inbox-button`。
- 任务消息读取 `GET /v1/activity?limit=50`，展示跨会话的 `agent_activity_items`；它是后台结果的独立收件箱，不再把结果硬塞进当前 conversation transcript。
- 这层是观察与追溯页面，不是新的聊天真源。当前会话仍然由 `GET /v1/chat/state` 驱动；后台结果页面只负责展示完成后的异步结果。
- 手机端任务消息页是全屏工作页，不再按贴底抽屉处理：顶部左侧是返回箭头和 `任务消息` 标题，右侧只放 `全部已读 / 刷新`；任务结果正文按对话气泡规格渲染，卡片结构是“标题时间 / 结果气泡 / 底部动作”，正文走与 transcript 相同的 markdown hydration，文件结果复用下载卡片；点开“查看过程”后的 run detail `Result` 也按同一套消息正文规格渲染完整 `resultText`；任务结果 Markdown 正文字号收口为 `12px`，标题按 `18px / 16px / 14px` 分级，链接、代码、引用和表格头使用轻量颜色区分；列表卡片最小触摸高度为 `64px`。
- 活动条目里的来源和文件信息走人话口径：来源显示为 `后台任务 / 飞书 / 助手 / 通知`，文件显示为“附 N 个文件”。
- `source=conn` 且带有 `sourceId + runId` 的 activity 条目会复用后台任务过程弹层，继续请求：
  - `GET /v1/conns/:connId/runs/:runId`
  - `GET /v1/conns/:connId/runs/:runId/events`
- 收到 `/v1/notifications/stream` 广播后，页面会静默刷新任务消息列表与未读数；即使用户已经切到另一个会话，也能在任务消息页里看到刚完成的 conn 结果。
- 页面断言入口在 [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)，运行时拼装入口在 [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)，任务消息 / conn 弹层静态片段在 [src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts) 与 [src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)，前端运行时控制器片段在 [src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)，后端读模型入口是 [src/routes/activity.ts](/E:/AII/ugk-pi/src/routes/activity.ts) 和 [src/agent/agent-activity-store.ts](/E:/AII/ugk-pi/src/agent/agent-activity-store.ts)。

## 6. 单工人多会话行为

- 当前项目按“一个 agent 工人，多条历史产线，但同一时刻只有一条全局当前产线”收口
- 服务端 `ConversationStore` 维护 `currentConversationId` 和会话目录；所有平台打开页面后都以服务端当前会话为准，不再固定写死 `agent:global`
- 浏览器端会话目录、新建会话、切换当前会话、运行中禁切、以及手机历史抽屉列表渲染集中在 `src/ui/playground-conversations-controller.ts`；`src/ui/playground.ts` 仍持有主 state，布局滚动与恢复入口已交给 `src/ui/playground-layout-controller.ts`，transcript 渲染入口已交给 `src/ui/playground-transcript-renderer.ts`，stream lifecycle 已交给 `src/ui/playground-stream-controller.ts`
- 桌面 Web 现在常驻左侧历史会话栏，和手机历史抽屉共用同一份 conversation catalog 渲染与切换逻辑；左栏是 cockpit 索引面板，不是后台列表卡片堆：宽度稳定在 `250px-280px`，用左侧冷色状态线、背景层级和紧凑条目区分状态，深浅主题都不能靠阴影撑层级。移动端仍走左侧抽屉，避免小屏再塞一条常驻侧栏。
- 手机端历史会话抽屉按“会话索引”而不是“大卡片列表”设计：抽屉沿用上下文详情的无边框仪表盘语言，外层是深色渐变面板，头部是 `#101421` raised surface，列表项用 `#0b0e19` 背景层和约 `92px` 稳定高度，当前会话用 `#151a2b` 高亮与左侧冷白蓝亮条，时间 / 条数做成小型信息胶囊，删除入口退成条目内部右上角的 icon-only 小按钮。
- 点击 `新会话` 会调用 `POST /v1/chat/conversations` 创建新的 `conversationId`，并把它设置成全局当前会话；旧会话不会被 reset 或删除
- 点击 `新会话` 时，前端用 `conversationCreatePending` 防止请求飞行中的重复创建；如果当前会话已经是无正文、无附件、无 active run 的空白会话，则再次点击直接 no-op，不再继续创建一串空白会话。创建成功后先本地插入会话目录并进入新会话，再让新会话的一次 canonical `GET /v1/chat/state` 在后台收口 UI，不再把用户挡在 hydrate 前面，也不再先额外 round-trip 一轮 `GET /v1/chat/conversations`。
- 手机端点击左侧品牌区会打开历史会话抽屉；点击历史项时前端应先立即关闭抽屉，再调用 `POST /v1/chat/current`，不能傻等服务端回包后才把侧边栏收起来
- 如果用户点的是当前已经选中的会话，也要立即关闭手机历史抽屉；当前项只允许在 `state.loading` 时禁用，不能因为 active 状态禁用点击事件，否则用户会以为界面卡死
- 会话切换成功后，前端会直接进入目标会话，并以目标会话的一次后台 canonical `GET /v1/chat/state` 收口真实历史与 active run；不再对同一条会话先拉 history restore、再补拉 run state，制造重复请求和重复滚底。任意会话切换请求未回包时，历史列表会临时冻结切换和删除动作，避免慢回包把用户刚点的目标会话覆盖回去。
- 历史会话项现在提供显式删除入口，调用 `DELETE /v1/chat/conversations/:conversationId`；删除后服务端会重算 `currentConversationId`，前端再按新的当前会话收口 UI
- 所有删除类动作都统一走自定义 `confirm-dialog`，不再调用系统 `confirm()`。风格、圆角、按钮语气都跟页面保持同一套，不再把原生弹窗硬插进来破坏节奏
- agent 正在运行时，后端拒绝新建或切换会话；前端显示“当前任务未结束，不能切换产线 / 开启新产线”
- 浏览器端当前通过 `conversationSyncGeneration + requestId` 管住 `/v1/chat/state` 的落地资格：会话切换时先失效旧 generation，再给新的同步请求发 token；只有仍属于当前 generation、且没被更新请求压过的响应，才允许写进当前页面
- 如果未来真的要支持多用户同时操作，不能把这个单工人模型当成权限系统继续堆，必须重新设计认证、控制权和会话隔离

## 7. 已知关联文件

- 页面脚本装配与最终 `renderPlaygroundPage()` 参数组装： [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
- playground 静态 HTML shell 与外层页面骨架： [src/ui/playground-page-shell.ts](/E:/AII/ugk-pi/src/ui/playground-page-shell.ts)
- playground 共享基础样式与移动断点主约束： [src/ui/playground-styles.ts](/E:/AII/ugk-pi/src/ui/playground-styles.ts)
- 服务器端 Markdown 安全渲染与 `renderPlaygroundMarkdown()` 导出： [src/ui/playground-markdown.ts](/E:/AII/ugk-pi/src/ui/playground-markdown.ts)
- 文件 / 资产静态样式与资产库弹窗 HTML： [src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)
- 文件 / 资产前端运行时控制器： [src/ui/playground-assets-controller.ts](/E:/AII/ugk-pi/src/ui/playground-assets-controller.ts)
- 上下文用量进度环、估算和详情弹层控制器： [src/ui/playground-context-usage-controller.ts](/E:/AII/ugk-pi/src/ui/playground-context-usage-controller.ts)
- 会话目录、新建、切换和手机历史抽屉列表控制器： [src/ui/playground-conversations-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversations-controller.ts)
- 布局同步、滚动跟随、回到底部和前后台恢复控制器： [src/ui/playground-layout-controller.ts](/E:/AII/ugk-pi/src/ui/playground-layout-controller.ts)
- transcript 渲染、markdown hydration、复制正文、状态壳层和运行日志弹层控制器： [src/ui/playground-transcript-renderer.ts](/E:/AII/ugk-pi/src/ui/playground-transcript-renderer.ts)
- stream lifecycle、通知 SSE、send / queue / interrupt 控制器： [src/ui/playground-stream-controller.ts](/E:/AII/ugk-pi/src/ui/playground-stream-controller.ts)
- transcript 清空必须同时清理 `transcript-current` 和 `transcript-archive`，不要给旧会话 DOM 残留留活口
- 手机端 topbar、更多菜单和历史抽屉外壳控制器： [src/ui/playground-mobile-shell-controller.ts](/E:/AII/ugk-pi/src/ui/playground-mobile-shell-controller.ts)
- 弹层焦点释放与返回焦点 helper： [src/ui/playground-panel-focus-controller.ts](/E:/AII/ugk-pi/src/ui/playground-panel-focus-controller.ts)
- Conn / 任务过程静态样式与弹窗 HTML： [src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)
- Conn / 任务过程前端运行时控制器： [src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)
- 页面返回断言： [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
- 资产与文件下载： [src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)、[src/ui/playground-assets-controller.ts](/E:/AII/ugk-pi/src/ui/playground-assets-controller.ts)、[src/agent/asset-store.ts](/E:/AII/ugk-pi/src/agent/asset-store.ts)、[src/routes/files.ts](/E:/AII/ugk-pi/src/routes/files.ts)
- 技能真实来源： [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts) 的 `GET /v1/debug/skills`
- 会话目录与当前会话来源： [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts) 的 `GET /v1/chat/conversations`
- 当前会话状态来源： [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts) 的 `GET /v1/chat/state`
- 新建 / 切换会话入口： [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts) 的 `POST /v1/chat/conversations` 与 `POST /v1/chat/current`

## 8. 运行态与 loading 约束

- 任务进行中必须在助手气泡下显示 loading 等待气泡，不能让用户猜 Agent 是运行、等待还是结束。
- loading 气泡会跟随 Agent 事件切换文案：接手任务、调用工具、等待工具返回、生成回复、完成、打断或失败。
- `done`、`interrupted`、`error` 都必须收口当前 loading 和过程日志，并同步释放前端 loading 状态。
- `error` 与 `interrupted` 不再只是当前流页面里的临时视觉效果；它们仍会进入 `GET /v1/chat/state` 的 canonical state，但 terminal snapshot 只在 session history 还没覆盖到同一终态时才继续暴露，别再把同一轮已写入 history 的部分回复和过程壳子重复画两遍。
- `interrupted` 的状态文案单独显示为“已打断”，不要再偷懒混成“已结束”；失败态继续明确显示“错误”。
- 刷新恢复运行态时，页面文案统一使用“当前任务正在运行 / 当前正在运行”，不要再写“上一轮仍在运行”。
- 手机浏览器前后台切换、页面 `visibilitychange`、`pageshow`、`online` 后不再一律核对 catalog + 拉取完整会话 state：`pageshow` 会强制做一次当前会话 state 校准；`visibilitychange` 只在 active run 或本地 state 超过恢复阈值时回源；`online` 优先用当前 active run 提示查状态并续订 `/v1/chat/events`。
- 如果 `/v1/chat/stream` 主连接因为前后台切换或网络短断结束，但 `GET /v1/chat/state` 仍显示后端任务运行中，页面会切到 `/v1/chat/events` 继续接收事件，不再提示“网络错误”并停止更新。
- 切到 `/v1/chat/events` 前，前端必须带上当前 `activeRun.eventCursor` 作为 `afterEventCursor`；后端只 replay 该 cursor 之后的 buffered events，避免 `GET /v1/chat/state` 已经渲染的 `activeRun.text` 和事件流从头回放的 `text_delta` 叠加成重复文字。
- 如果 `/v1/chat/stream` 断开时任务其实已经刚好完成或失败，前端要先信 `GET /v1/chat/state` 的收口结果；只要 canonical state 已经推进到终态，就不应继续报“流被中断 / network error”。
- 用户点击发送或把消息追加进运行中的会话后，composer 要立即清空，明确表示消息已经发出；如果请求在真正进入后端前失败，再把草稿恢复回输入区，不能让用户白丢内容

## 9. 排查顺序建议

如果 playground 又出现“明明改了但页面看着没变”的情况，按这个顺序查：

1. `src/ui/playground.ts` 真源是否已改
2. `test/server.test.ts` 是否覆盖到真实行为
3. `docker compose restart ugk-pi`
4. `http://127.0.0.1:3000/healthz`
5. 用 `Invoke-WebRequest` 或浏览器源码确认 `http://127.0.0.1:3000/playground` 实际返回了本轮新增的标记，例如 `scroll-to-bottom-button` 或对应函数名
6. 强刷 `http://127.0.0.1:3000/playground`

如果源码和测试都已经更新，但第 5 步看不到新标记，说明运行中的 `ugk-pi` 仍在端旧 HTML；先重启服务，不要让用户继续测旧页面。别再靠开新端口和肉眼猜缓存来制造额外脏状态了。

## 10. 手机 Web 重写口径

- 这一节覆盖并取代之前“只是做适配”的旧说法；当前手机端不是压缩版桌面，而是保留现有逻辑后单独重写的移动展示层
- 手机端继续沿用桌面端的深空黑 / 暗紫星云 / 冷白星尘视觉语言，但页面组织改成更接近原生聊天页的结构
- 手机端面板继续保持贴底抽屉和深色卡片结构，但圆角统一服从用户偏好：文件库 / 后台任务 / 新建后台任务 / 任务消息 / 后台 run 详情里的面板、卡片、工具栏和操作按钮都只使用 `4px` 圆角，不再回到 `22px` 或 `16px` 的大圆角语言。
- 顶部只保留紧凑品牌状态栏：左侧是可点击的彩色 ASCII logo 历史会话入口，右侧保留上下文电池条、`新会话` icon 与 `更多` icon；`技能 / 文件 / 文件库 / 后台任务 / 任务消息 / 主题切换` 收进右上角溢出菜单，每项统一是 `icon + 标题` 风格
- 主题切换不会触发会话同步、transcript 重绘或 agent 请求，只更新 `<html data-theme>`、按钮状态和 `localStorage` 持久化值；桌面端对应入口是 `theme-toggle-button`，手机端对应入口是 `mobile-menu-theme-button`。
- 手机端 topbar、更多菜单、历史抽屉开关、遮罩关闭、外部点击关闭和移动端入口绑定集中在 `src/ui/playground-mobile-shell-controller.ts`；历史列表渲染和会话切换由 `src/ui/playground-conversations-controller.ts` 负责，移动外壳控制器不反向持有 conversation catalog 逻辑
- 手机端品牌区点击后展开左侧历史会话抽屉，宽度收口为 `min(88vw, 360px)`，右侧保留透明点击遮罩用于关闭；抽屉头部 sticky，列表项展示标题、两行摘要、更新时间和消息数，最小触摸高度 `92px`，标题 / 摘要 / meta 必须显式设置移动端行高，不能继续继承全局 button 的紧缩排版；当前会话只用左侧冷白蓝亮条和深色层级标记，不再铺大面积蓝色块，也不再靠细边框分区；删除按钮位于条目内部右上角，不再作为条目外侧独立列挤压内容；侧边栏内关闭按钮、空态和会话项使用 `6px` / `8px` 的小圆角并保持无边框；历史列表保留纵向滚动但隐藏侧边滚动条；运行中禁止切换，避免一个 agent 工人被硬拽到另一条产线
- 手机端历史抽屉头部保持透明裸放，不再做 raised surface；信息分组交给抽屉外壳、列表项背景深浅、左侧状态色和留白。
- `新会话` 按钮现在走 `POST /v1/chat/conversations` 创建新的服务端会话并激活为 `currentConversationId`；不再 reset 旧会话，也不再只清本地 transcript
- 手机端 `文件库`、`后台任务`、`新建后台任务`、`任务消息` 和后台 run 详情统一走全屏工作页：点击入口后先立刻打开对应页面，页面内部再刷新数据；用户点按钮切界面不能等接口回完才出现反馈，这种体验慢得像在拨号上网。
- 这些手机工作页的共同约束是：顶部 `topbar` sticky，左侧固定返回箭头 + 标题，右侧放当前页面的关键动作；动作较多时允许横向滚动，但不要再把 `回到对话` 做成右侧文字按钮。内容区独立滚动并 `overscroll-behavior: contain`，主操作按钮最小高度约 `40px`，列表项最小高度 `64px`，底部 padding 包含 `env(safe-area-inset-bottom)`。
- 这些手机面板的视觉约束是硬朗、低圆角、少装饰；如果后续新增类似管理面板，默认按 `4px` 收口，别又把大圆角当移动端高级感，真的会很像套模板。
- 所有这类面板关闭前都要先把焦点归还给可见触发入口或底部输入框；如果归还目标不可见或浏览器拒绝聚焦，必须先 `blur()` 掉仍在面板里的 active element，再设置 `aria-hidden=true` / `hidden`。不能让焦点继续留在即将隐藏的关闭按钮、列表按钮或编辑器字段里；不然浏览器会直接给无障碍警告，用户用键盘 / 读屏时也会被塞进隐藏层。
- `landing-screen` 在手机端直接隐藏，不再让 hero、大标题和装饰块继续吞掉首屏高度
- 中间主区收口成全高 transcript 区域，去掉额外边框和背景壳层，优先把有限空间让给对话内容；空态时 transcript 中央展示方块字符组成的 `UGK` 标识，不再显示“开始一轮对话...”提示方块
- 手机端 active transcript 底部使用安全区感知的滚动缓冲，最后一条回复在滚到底后仍能被继续上拖一点，避免被底部 composer 遮挡
- 手机端 active 对话的 `.stream-layout`、`.transcript-pane` 和 `.transcript` 必须显式收口到 `width: 100% / min-width: 0 / max-width: 100%`；active `.stream-layout` 还必须在移动断点下重置为 `position: relative` 和 `inset: auto`，不能继承桌面端 absolute inset。这里不能依赖桌面端 `--conversation-width` 跟随 composer 的推导结果，否则部分视口会出现整列消息向右偏移、用户气泡贴边甚至被裁掉。
- 拖拽上传区在手机端隐藏；已选文件与资产改成可换行 chip 列表，超过可用高度后列表内部纵向滚动，避免多文件预览挤在同一行导致标题完全看不清。
- Landing 空态底部 `#composer-drop-target.composer` 不再使用大输入框口径；桌面 landing composer 使用 `6px 8px 6px 10px` padding，textarea 初始最小高度为 `40px`，发送 / 打断按钮最小高度为 `40px`，并通过 `align-self: end`、`height: fit-content`、`max-height: none` 防止外层 section 被旧高度规则卡死
- 底部 composer 改成手机优先结构：输入区单列铺满，右侧只保留紧凑 icon 控制；移动端 composer 背景使用单层纯色，不再叠加渐变；发送按钮使用居中的向上箭头 icon，打断按钮使用白色方形中断 icon，不再显示文字，也不再沿用桌面端按钮背景、边框和阴影；当前手机端这两个 icon 调整为 `28px`，避免把按钮本体撑大；中断按钮在未运行时也保留占位，只是禁用态变淡，不会直接消失；发送后的输入框立即清空，失败才回填草稿
- composer 输入框 placeholder 统一为“和我聊聊吧”；不要再让脚本初始化把 HTML 里的中文占位符覆盖成英文调试口吻；手机端单行空态按 line-height + 对称 padding 计算，让 placeholder 和正文视觉居中
- composer 的焦点态归外层 `#composer-drop-target.composer:focus-within` 负责：用户点进 `#message` 后，外层输入控制面显示 `var(--accent)` outline，textarea 自身继续 `outline: none`，也不再把自己的边框改成 accent。否则视觉上又会退回普通表单输入框。
- Active 对话态的 `#composer-drop-target.composer` 基础高度已经收口：普通对话中的 textarea 默认最小高度为 `52px`，空内容和单行内容保留最小高度以保证 placeholder / 正文纵向居中；多行输入时高度随输入行数自动增长，最多显示 10 行；超过 10 行后只在 textarea 内部纵向滚动，并禁用手动竖向 resize；`max-width: 960px` 下右侧发送 / 打断按钮横排，避免按钮掉到输入框下方继续撑高底部区域
- 手机端 active 对话态继续走更紧凑输入区约束，不只在 landing 空态生效；普通对话中的 textarea 最小高度收口为 `44px`，单行时使用 `12px 0` 对称 padding，landing 使用 `40px` 高度与 `10px 0` padding，同样按内容自适应到最多 10 行，超过后内部滚动，避免底部输入区吃掉约四分之一屏幕高度
- 手机端消息气泡、字号、留白、按钮尺寸都按小屏重新收口，用户消息宽度放宽到更适合单手阅读的比例
- 手机端富文本里的代码块继续沿用原有 markdown 逻辑，但展示层会额外收口：外层 `.code-block` 退成透明壳子，代码区域本身不再叠半透明背景，边框也收成全透明，只保留排版层次；工具条不再整条展示，只保留右上角一个透明背景的纯图标复制按钮，不显示文字 label；助手消息里的 `code` 背景也强制透明，同时限制最大宽度并让超长代码行在块内换行，避免把消息气泡横向撑爆
- 除 active 输入区基础高度收口外，手机端结构、顶部状态栏、icon-only 控制、代码块展示等移动重写仍只在 `max-width: 640px` 内生效

## Refresh Run Recovery

- `GET /v1/chat/state` 返回的 `viewMessages` 是唯一可信的 transcript 视图；后端必须在 canonical state 里自己处理 terminal run 与 session history 的重叠关系，前端不再负责“看起来像重复就删掉一条”这种补丁式去重。
- 对 still-loading active run，后端记录 run 开始时的 raw `session.messages.length`，构造 `GET /v1/chat/state` / `GET /v1/chat/history` 的稳定历史时只读取这条基线之前的 raw messages；上下文占用估算仍按完整 raw context 计算，避免 UI 去重顺手把 token 估算也砍掉。
- 对 `done / error / interrupted` 这类 terminal run，后端现在按“run 开始前的历史基线 + 本轮实际新增的 canonical history message”判断当前 turn 是否已经落盘，而不是继续拿 assistant 正文文本做模糊比对；这样可以同时避免“正文只差空格/换行却被重复渲染”和“连续两轮都发同一句话时误把当前轮吞掉”这两类相反问题。

- 刷新页面后，playground 先请求 `GET /v1/chat/conversations` 获取服务端当前会话，再按该 `conversationId` 请求 `GET /v1/chat/state`，把历史消息、当前 running 状态、active assistant 正文、状态壳层、队列和上下文占用作为 canonical state 渲染。
- `GET /v1/chat/history` 与 `GET /v1/chat/status` 继续保留兼容，但刷新恢复不再靠前端把 history、status、events、localStorage 和 DOM 指针拼成一份“猜出来的状态”。
- `/v1/chat/state` 与 `/v1/chat/history` 都会合并连续 assistant 历史消息，保证同一轮完成后的浏览器处理叙述和最终回答恢复为一个助手气泡，而不是刷新后散成多条独立消息。
- `/v1/chat/state` 的恢复响应现在是最近窗口，不是全量历史；空闲旧会话会优先从 session JSONL 尾部读取这个窗口，并保留原始 message index offset，避免最近窗口里的 `session-message-*` id 重新从 1 开始。需要更早消息时，前端用 `/v1/chat/history?before=...&limit=...` 按页补齐。`localStorage` 仍只保存最近快照，不能被当成完整历史源。
- 点击 `新会话` 后，如果当前不是空白会话，页面会请求 `POST /v1/chat/conversations` 创建并激活一条新会话，然后立即进入新会话 shell；新会话的一次 `GET /v1/chat/state` 作为后台真源恢复 UI。旧会话保留在历史列表里，不再先额外同步一轮 `GET /v1/chat/conversations`，也不再等待 hydrate 完成才给用户切过去。当前已经是空白会话时，重复点击 `新会话` 不再产生新的空会话。
- `localStorage` 只作为当前设备的冷启动缓存；一旦 `/v1/chat/state` 返回，页面必须以服务端 state 覆盖本地缓存。
- `activeRun` 存在时，前端仍只维护一个 active assistant 气泡；但气泡是否出现在 transcript、对应用户输入是否补齐，都以 `viewMessages` 为准，同一 run 不允许拆出多条“助手 / 过程区 / 结果区”消息。
- `activeRun.input.message` 仍可作为后端构造 `viewMessages` 的输入；前端收到 `viewMessages` 后只负责渲染，不再根据文本相等关系自行判断“当前用户任务是否已出现”。
- 对 `done / error / interrupted` 这类 terminal activeRun，如果 canonical history 尾部已经同时包含同一条用户输入和同一条助手结果，后端 `viewMessages` 会直接复用 history，不再额外带一组 active input / active assistant。这是为了处理“历史刚落盘但 activeRun 还没从 state 消失”的短窗口，不能用前端本地历史去重这种补丁糊过去。
- 对 `interrupted / error` 这类 terminal snapshot，如果 session history 已经带上当前轮的用户输入，后端会把 `activeRun.input.message` 清空，避免刷新页再凭 terminal snapshot 把原始提问补画第二遍。
- 这个“避免重复渲染”不能再只按前端文本相等拍脑袋；像连续两轮都发“继续”这种高频场景，后端必须在构造 `viewMessages` 时结合 active run 状态、assistant 覆盖位置和 canonical history 尾部的当前 turn 判断，前端不要再擅自按 DOM / localStorage 去重。
- `activeRun.process` 是后端维护的状态快照；前端只把它映射成当前助手气泡上的状态摘要和 loading 状态，不再把过程日志写回本地历史里的 `process` 字段，也不再从本地 process snapshot 恢复运行态。
- 恢复运行态后，playground 会继续请求 `/v1/chat/events`，重新订阅当前 active run 的 SSE 事件流；请求会携带 `/v1/chat/state` 快照里的 `activeRun.eventCursor`，服务端从该 cursor 之后继续 replay，后续 `text_delta`、工具事件、`done`、`interrupted`、`error` 继续更新同一个 active assistant 气泡。
- 如果 `/v1/chat/events` 接上后又无 terminal event 就直接 EOF，前端不能装死停在“已恢复”假象里；必须立刻回源 `GET /v1/chat/state` 再收口一次：后端若仍在 running 就继续续订，已终态就按 canonical state 落稳结果。
- 如果刷新时当前会话仍带着 terminal snapshot 但 `viewMessages` 里还没带出对应助手条目，前端会按 `assistantMessageId` 补建同一条助手气泡，再挂上状态壳层；别再让“有运行态、没载体消息”这种半截状态把 UI 弄成隐身人。
- 恢复态不再把任务称为“上一轮”；页面统一渲染为“当前任务正在运行 / 当前正在运行”，因为真实 agent run 并不会因为 web 刷新变成历史任务。
- 恢复运行态下继续发送普通消息会进入 `/v1/chat/queue`，不会重新打开 `/v1/chat/stream` 去撞出 `Conversation ... is already running`。
- 刷新、前后台切换或手机浏览器挂起导致的 `/v1/chat/stream` 暂态断线不算任务失败；只要 `GET /v1/chat/state` 仍显示 running，就切到 `/v1/chat/events` 继续追，不会再写入“网络 / network error”气泡。
- `/v1/chat/stream` 与 `/v1/chat/events` 允许服务端发送 SSE comment heartbeat；前端 `readEventStream()` 必须忽略没有 `data:` 的 comment frame，同时用 `STREAM_IDLE_TIMEOUT_MS` 监测长期无字节输入的连接。idle 超时不能直接渲染空回复，而是进入现有 canonical state / events 恢复链路。
- `/v1/chat/events` 只负责续订同一 active run 的后续增量；如果回源时已经不在 running，不要把 `not_running` 当成失败广播给页面，真正的终态应由 `/v1/chat/state` 提供。
- provider 真失败时，canonical `error` 事件会和 terminal snapshot 一起落到统一状态里；主流页面、观察页和刷新后的页面都应该看到同一份失败结果，而不是一个看见报错、另一个只看见任务蒸发。若 session history 已经包含同一轮 interrupted assistant 正文，`GET /v1/chat/state` 不应再额外返回重复的 terminal interrupted snapshot。
- 注意边界：本轮解决的是同一服务进程内 active run 的统一状态渲染；如果服务进程重启，实时过程日志仍需要持久化 run event log 才能跨进程完整回放。

## Context Usage Bar

- 上下文用量常量、DOM 引用、token 估算、电池式分段进度条渲染、详情弹层、展开切换、`GET /v1/chat/status` 占用同步和输入实时重算逻辑集中在 `src/ui/playground-context-usage-controller.ts`
- `src/ui/playground.ts` 仍保留 `state.contextUsage` / `contextUsageExpanded` / `contextUsageSyncToken`，因为这些状态会被会话恢复、流式事件和发送流程共同更新
- 桌面 Web 把上下文入口放进 `landing-side-right` 工具栏内部最右侧，手机端仍显示在顶部状态栏右侧；二者都不再占用 composer 底部区域。视觉上使用 `4px` 圆角的水平电池式分段进度条，颜色随 safe / caution / warning / danger 状态变化。
- 圆环中央只显示百分比；只要输入区里还有草稿、待发附件或已选资产，就按“预计发送后”口径计算。
- 基线数据来自后端状态接口返回的 `contextUsage`；草稿实时估算仍可通过 `GET /v1/chat/status` 刷新，前端只负责把草稿 / 附件 / 资产的估算 token 叠加上去，所以文案必须明确是估算。
- 风险态统一按 `safe / caution / warning / danger` 四档收口，圆环颜色会随风险变化。
- 桌面端 hover 或键盘 focus 时展示浮层详情；浮层从上下文电池按钮下方展开，并用 viewport 宽度限制避免跑出浏览器顶部或两侧。浮层层级必须高于聊天流卡片，不能被 `chat-stage` / `.stream-layout` 遮挡。点击可临时固定展开，别再要求用户盯着一个完整状态条。
- hover 浮层不是三行裸文本，而是小型上下文仪表盘：顶部显示当前 / 预计发送后与状态徽标，中部显示大百分比和 `current / window`，下方用三个紧凑指标块展示会话、待发、可用 token，底部再列模型、provider 和估算口径。
- 顶部上下文电池按钮右侧要给百分比文字保留轻微内边距，桌面端当前按钮宽度为 `88px`，不要再把 `0% / 100%` 贴到右边缘。
- 上下文详情弹层统一显示在页面上半区，和顶部入口保持同一视觉重心；不要把按钮放顶部、详情却从底部冒出来，像两个设计师隔空打架。
- 手机端点击上下文电池条后也在上半区展开详情，详情面板改为无边框仪表盘：外层深底、顶部大百分比、柔和进度条、四个指标块和底部模型信息条，通过背景深浅、字号、留白与状态色建立层次，不再把一整段文本塞进弹窗。关闭时必须先通过 `releasePanelFocusBeforeHide(contextUsageDialog, contextUsageShell)` 释放焦点，再设置 `hidden` / `aria-hidden=true` / `inert`，避免关闭按钮仍持焦时触发 `Blocked aria-hidden` 警告。内容包括：会话占用、待发占用、预留回复预算、provider / model、估算口径与剩余可用空间。

## Realtime Notification Broadcast

- `playground` 现在会常驻订阅 `GET /v1/notifications/stream`，专门接收后台 `conn` 完成后的实时广播。
- 广播事件先走持久化，再走实时推送；页面右上角轻提示只是在线提醒层，不替代 `GET /v1/chat/state`。
- 所有在线页面都会各自收到并展示提示；当前版本明确不做多页去重。
- 后台 `conn` 广播只刷新任务消息列表和未读数，不再用 `conversationId` 刷新当前 transcript；前台聊天 run 的恢复仍走 `GET /v1/chat/state` / events 链路。实时提醒不能强制把用户当前的 transcript 滚到底部。
- 页面关闭、`pagehide`、断网或 SSE 断开后会自动断开连接；回到前台、`pageshow` 或重新联网后会自动重连。
- 关键入口：
  - [src/routes/notifications.ts](/E:/AII/ugk-pi/src/routes/notifications.ts)
  - [src/agent/notification-hub.ts](/E:/AII/ugk-pi/src/agent/notification-hub.ts)
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/notification-hub.test.ts](/E:/AII/ugk-pi/test/notification-hub.test.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)

- 实时广播提示层必须保持高于页面其余 fixed overlay 的层级；否则 toast 已进入 DOM，用户视觉上仍会误以为没有收到通知。

## Conn Run Detail Dialog

- `conn` notification 右下角的过程入口除了结果、文件和事件，现在还要展示 run 生命周期关键信息：`claimed`、`started`、`updated`、`lease owner`、`lease until`。
- 过程弹层还会展示 `Execution Agent`：包含 requested agent、actual agent、fallback reason 和实际 `provider / model`。如果原 `profileId` 指向的 Agent 不存在或已归档，run detail 必须把“原执行 Agent 不可用，已由主 Agent 完成”展示出来，不能假装一切正常。
- 对 `running` run，弹层会在前端直接计算一条 health 文案，优先告诉用户它是：
  - `running / lease active`
  - 还是 `running / stale suspected`
- 对已经失败的超时 run，弹层会根据 `run_timed_out` 事件或 `errorText` 中的 `maxRunMs` 失败信息显示 `failed / timed out`，避免和普通模型失败混在一起。
- 这层文案只是可视化摘要，不替代真实 run status 和事件日志；真正排障仍以 `/v1/conns/:connId/runs/:runId` 与 `/events` 为准。

## Conversation Catalog Notifications

- `GET /v1/chat/conversations` 只负责聊天会话目录，不再为了后台 `conn` 结果合并 notification 到会话 `preview`、`messageCount` 或 `updatedAt`。
- 后台 `conn` 结果的列表、未读数和详情入口以 `GET /v1/activity` / `任务消息` 页面为准；旧的 conversation notification 只作为历史兼容数据存在，不是新建 conn 的投递路径。
- 任务消息不会反写进 session history；聊天正文仍以 `GET /v1/chat/state` 的 canonical conversation state 为准。

## Frontend Performance Budget

- 所有可见异步操作都必须在点击后立刻给反馈。短请求用按钮级 `处理中 / 保存中 / 刷新中 / 删除中` 文案并禁用当前操作；长任务触发用“已触发 / 正在后台运行”notice 或过程弹层承接。不能让按钮等接口返回后才变化，高延迟公网下这等于装死。
- pending 状态必须在深色和浅色主题下都可读，优先复用现有按钮禁用态、notice 和表单状态样式；如果只改深色主题导致浅色主题白底浅字，按回归处理。
- 会话切换 / 新建会话的交互预算按“服务端确认目标会话即可切屏”计算，`GET /v1/chat/state` hydrate 必须后台化；否则历史会话越大，用户越会把真实数据恢复误读成按钮卡死。
- 新建会话必须对“已经在空白会话里”保持幂等；只靠按钮 disabled 防连点挡不住本机快请求，最后还是会把历史列表灌满空会话，这种体验债不要再放回去。
- 发送消息时，如果前端已经持有 `conversationId`，不再每次串行等待 `GET /v1/chat/conversations` 和 `GET /v1/chat/state` 预检完成；消息先进入 `/v1/chat/stream`，会话目录改为后台静默刷新。
- 会话目录 index 读写属于用户可感知延迟预算的一部分；高频切换、新建和恢复同步只能命中 `ConversationStore` 的 mtime cache 或排队写入，不能让多个请求并发读旧快照再各自覆盖落盘。
- state hydrate 属于渲染预算，不只是接口预算；同签名回包必须跳过 transcript DOM 重绘，active assistant 文本和运行状态优先 patch 已有节点，别再把长 markdown 和代码块每次都重新 hydrate 一遍。
- composer 输入仍即时调整高度，但 context usage 估算改成 debounce，避免每个按键都触发完整占用量重算。
- `visibilitychange`、`pageshow`、`online` 现在统一走 `scheduleResumeConversationSync()` 做去重、冷却和选项合并，但会按触发原因分级：`online` 只在有 active run 迹象时查状态并重连事件流，`visibilitychange` 只在 active run 或 state 过期时回源，`pageshow` 才强制同步当前会话 state；catalog 只在当前会话缺失、列表为空或显式要求时读取，避免恢复链路把 `GET /v1/chat/conversations` 与 `GET /v1/chat/state` 又串成慢路径。
- 用户离开底部后，前端会取消尚未执行的自动滚底计划；同一会话的 async state 重绘也会恢复当前 scrollTop，而不是拿“重新渲染了一遍”当借口把阅读位置洗掉。
- layout 同步集中到 `scheduleConversationLayoutSync()`；`ResizeObserver` 只观察 composer 容器，不再盯住大面积页面节点。
- 本地历史快照写入 `localStorage` 改为 debounce，并在 `pagehide` / `beforeunload` 前 flush；这层缓存只服务冷启动，不是运行真源。
- 背景和玻璃效果已减负：删除重型 `backdrop-filter: blur(...)`，背景从多层径向堆叠收口为少量层次。
 
## Conn Manager

- `playground` 现在提供后台任务管理入口：桌面端 landing 右侧 `后台任务`，手机端右上角更多菜单里的 `后台任务`。
- 管理弹层使用 `conn-manager-dialog` / `conn-manager-list`，打开时只读取一次 `GET /v1/conns`；该列表响应已经带每个 conn 的 `latestRun` 摘要，不再为每个 conn 立即补一发 `GET /v1/conns/:connId/runs`。
- conn 的 run 历史默认折叠，只用 `latestRun` 展示最新状态摘要；用户展开某个 conn 时，前端才按需请求 `GET /v1/conns/:connId/runs` 补完整 run 列表。旧后端没有 `latestRun` 字段时，前端最多 4 路并发 fallback 拉取 runs，不能再退回无限制 N+1。
- 手机端后台任务管理器不再是贴底抽屉，而是全屏独立工作页：`conn-manager-dialog.open` 与 `conn-manager-panel` 占满 `100dvh`，顶部统一使用 `topbar asset-modal-head mobile-work-topbar`；左侧是返回箭头和 `后台任务` 标题，右侧直接放 `新建任务 / 刷新列表`，状态筛选和批量操作保留在内容区。conn 条目改成 `#0b0c18` 单列卡片，`立即执行 / 编辑 / 暂停 / 恢复 / 删除 / 查看` 这类操作以整宽网格按钮呈现，避免横向挤成一排小字按钮。
- 手机端后台任务创建 / 编辑同样不再是弹窗，而是全屏编辑页：`conn-editor-dialog.open` 与 `conn-editor-panel` 占满 `100dvh`，顶部统一状态栏左侧是返回箭头和页面标题，右侧直接放 `保存 / 取消`；表单按 `标题 / 让它做什么 / 投递目标 / 调度 / 模型选择 / 高级设置` 分块滚动，深色主题常用字段使用 `#0b0c18` 实心输入卡片；浅色主题下字段容器保持透明，输入框和目标预览使用白色 / 冷蓝承载面，label 与 hint 必须是深蓝灰文字。
- 管理弹层提供 `新建` 入口，每条 conn 提供 `编辑` 入口；编辑器使用 `conn-editor-dialog` / `conn-editor-form`，调用 `POST /v1/conns` 或 `PATCH /v1/conns/:connId`。
- conn 创建 / 编辑器默认只露出常用字段：标题、`让它做什么`、`结果发到哪里`、调度、执行 Agent、模型和保存。编号输入只在选择飞书目标时出现。
- 调度入口只保留三种：`定时执行`、`间隔执行`、`每日执行`。前端负责把这三种映射回后端 `once / interval / cron` payload，创建时不再让用户接触 cron 细节。
- conn 编辑器覆盖标题、prompt、投递目标、调度策略、任务级 API 源 / 模型选择和高级运行字段：
  - `执行 Agent` 使用 `GET /v1/agents` 返回的 Playground agent catalog 渲染下拉，保存为 `profileId`。后台 run 借用该 Agent 的 `AGENTS.md`、scoped skills、执行身份和模型解析结果，但运行 session 属于后台 run 自己，不进入该 Agent 的前台 conversation。这层能力快照不是工具权限沙箱；底层 runtime 工具仍保持可用。
  - `浏览器` 使用 `GET /v1/browsers` 返回的 Browser Registry 渲染下拉，保存为 `browserId`。空值表示跟随执行 Agent 默认浏览器；这不是创建 Chrome，也不是复制登录态。
  - `API 源 / 模型` 使用和前台模型源设置同源的 `/v1/model-config` 下拉列表，保存为 conn 自身的 `modelProvider / modelId`；不要退回手写 provider/model，也不要再靠同步前台 `.pi/settings.json` 控制后台 worker。
  - 目标支持任务消息、`feishu_chat`、`feishu_user`；旧的 conversation 目标只作为历史数据兼容，不再作为新建任务的默认入口。
- 调度区只保留三种模式：`定时执行`、`间隔执行`、`每日执行`。前端仍然映射回后端 `once / interval / cron`，但不再把 cron、工作日、每周这些复杂概念直接甩给用户。
- 三种模式对应的输入也固定下来：`定时执行` 只点选 `执行时间`；`间隔执行` 只点选 `首次执行时间` 并填写 `间隔（分钟）`；`每日执行` 只点选 `每日执行时间`。时间选择统一使用本地打包的 `flatpickr`，配置 `enableTime / time_24hr / disableMobile`，不再依赖系统原生 `datetime-local` / `time` 控件；浅色主题必须覆盖日历的月份、星期、日期、禁用日期、hover、today、selected 和前后月箭头，不能让深色主题白字漏在白色日历上。
- `每日执行时间` 解析现在兼容 `07:00`、`7:00` 与 `HH:mm:ss`，保存时不会再因为用户输入或浏览器差异误报“请填写每日执行时间”。
- “附加资料”区域现在提供显式文件入口：可从文件库复用已有资产，也可直接上传新文件；用户看到的是文件名与选中状态，内部才映射成 `assetRefs`。conn 编辑器直接上传的新文件使用 `conn:<connId>` 或 `conn:draft` 归属，不再借当前聊天会话 ID。
  - 高级字段默认收进 `高级设置`，用户可见名称分别是 `执行模板`、`能力包`、`版本跟随方式`、`最长等待时长（秒）` 和 `附加资料`；底层仍映射到 `agentSpecId`、`skillSetId`、`upgradePolicy`、`maxRunMs` 和 `assetRefs`。`profileId` 已经升级为常用区的 `执行 Agent` 下拉，模型不再靠手写 `modelPolicyId`，而是在常用区通过 `API 源` 和 `模型` 下拉框保存到 `modelProvider / modelId`。
- 目标选择区现在会显示 `conn-editor-target-preview`：把将要投递到 `任务消息` 还是飞书目标、目标编号和实际投递口径用中文展示出来；这里不能出现 `????` 这类乱码占位。
- 保存成功后，管理器会显示 `conn-manager-notice`，说明已创建 / 已更新的 conn 会投递到哪里，并高亮对应条目。
- conn 列表里的最近 run 默认折叠为一行 `conn-manager-run-summary`；需要查证据时再展开最近 3 条 run，避免管理面变成一堵日志墙。
- 后台任务列表现在按人话信息展示：`结果发到`、`执行方式`、`运行节奏`、`执行 Agent`、`浏览器`、`模型`。不再直接向用户暴露 `target / schedule / next / last / maxRunMs` 这类后台字段名。
- 列表状态与最近 run 结果统一显示为中文口径：`运行中 / 已暂停 / 已完成`、`待执行 / 执行中 / 成功 / 失败 / 已取消`，避免用户自己翻译状态码。
- 目标归属不要再脑补成“当前打开哪个会话就往哪个会话冒泡”。后台结果的主落点已经是任务消息页；飞书目标按各自 adapter 投递，聊天 transcript 不再承担这层异步收件箱职责。
- 管理器顶部提供状态筛选和批量工具：`conn-manager-filter` 按全部 / 运行中 / 已暂停 / 已完成过滤；`选择当前` 会选择当前筛选结果；`删除所选` 调用 `POST /v1/conns/bulk-delete`，用于一次清理多条测试 conn。
- 每个 conn 支持：
  - `立即执行`：调用 `POST /v1/conns/:connId/run`，只创建 pending run，不调用前台 agent。
  - `暂停` / `恢复`：按当前 `conn.status` 调用 `POST /v1/conns/:connId/pause` 或 `POST /v1/conns/:connId/resume`。
  - `删除`：二次确认后调用 `DELETE /v1/conns/:connId`。当前后端是软删除，会隐藏 conn、停止后续调度并清理该 conn 对应的任务消息 / activity 引用；run / event / file 历史不在 HTTP 请求内级联硬删。
  - 最近 run 的 `查看`：复用后台任务过程弹层，继续请求 run detail 和 events。
- 前台 agent 正在运行时不会禁用后台任务管理入口；conn 是独立 worker 处理的后台产线，不该被前台聊天 loading 卡住。真要把它绑死，那前面架构白做，属于自己给自己挖坑。
- 页面断言入口在 [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)，运行时拼装入口在 [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)，conn 管理 / 任务过程弹层的静态样式与 HTML 在 [src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)，任务消息主体在 [src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)，创建 / 编辑、管理器和 run 详情的前端控制器在 [src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)。
## 任务消息页（2026-04-23）

- `playground` 顶部状态栏现在有独立的 `任务消息` 入口，桌面端按钮是 `open-task-inbox-button`，手机端入口收在更多菜单里的 `mobile-menu-task-inbox-button`。
- 手机端如果存在未读任务消息，右上角 `mobile-overflow-menu-button` 本身也会显示未读数字徽标；用户不需要先打开更多菜单才知道任务消息里有几条未读。
- 任务消息相关红点和数字 badge 统一使用鲜红色 `#ff1744`，带浅色描边和红色 glow，不能再退回半透明粉色那种没精神的提醒色；更多按钮上的数字超过 99 时显示 `99+`。
- 任务消息不是 conversation，也不再把后台结果硬塞回当前会话；任务消息页现在像文件库一样是独立 fixed 工作页，不再通过 `data-primary-view=chat|tasks` 把聊天主壳内容替换掉。
- 任务消息页的主体结构在 [src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)，`src/ui/playground.ts` 只负责拼装入口和把页面挂在 `#shell` 外层，不再继续把任务消息逻辑堆进主文件。
- 列表数据来自 `GET /v1/activity?limit=50`，该响应会同时返回 `unreadCount`；`GET /v1/activity/summary` 只保留给页面初始化和极轻量兜底，不再作为打开任务消息后的固定第二跳。页面打开后不再偷偷清未读。
- 任务消息页不再提供 `未读 / 全部` 两个筛选；打开后始终请求 `GET /v1/activity?limit=50`，未读条目在完整时间线里红色高亮并默认展开，已读条目默认折叠，只显示标题和时间。
- 任务消息页头部只保留 `任务消息` 标题，不再显示“后台任务跑完……”说明句；顶部使用 `topbar pane-head task-inbox-head mobile-work-topbar`，左侧是返回箭头和标题，右侧直接放 `全部已读 / 刷新`。任务消息页外层是独立的 `task-inbox-view.open` fixed 页面壳，内层是 `task-inbox-pane`；手机端占满 `100dvh`，全局聊天用的 `<section id="mobile-topbar" class="mobile-topbar">` 不参与该页面。手机端任务消息页现在按全屏工作页处理：外层是 `#01030a`，sticky 头部是 `#060711`，任务结果卡片是 `#0b0c18` 实心面板，不再沿用透明头部和松散气泡。
- `GET /v1/activity` 响应包含 `hasMore` / `nextBefore` / `unreadCount`，前端据此显示 `加载更多` 并直接刷新 badge，继续用 `before=nextBefore` 分页拉取。不要再把一个固定 `limit=50` 当成全量收件箱，那个坑已经踩过了。
- 任务消息页现在按条处理未读：未读条目会显示红点、红色左侧强调线和更亮背景；点击条目本身，或点击 `任务ID / 复制 / 查看过程`，才会调用 `POST /v1/activity/:activityId/read` 把当前条目标记已读；该响应会返回新的 `unreadCount`，前端本地同步，不再补打一条 summary 请求。
- 任务消息页头部提供显式 `全部已读`，走 `POST /v1/activity/read-all`；该响应会返回 `markedCount` 与新的 `unreadCount`。这才是批量清空未读的正式入口，不再把“打开页面”伪装成“看过全部消息”。
- 每条任务消息的结果正文按对话气泡规格渲染：正文使用 `.message-content` 和 `renderMessageMarkdown()`，代码块、表格、链接和文件下载卡片与聊天 transcript 保持同一套视觉与交互；任务结果区域会覆盖全局 Markdown 标题字号，正文为 `12px`，`h1 / h2 / h3` 分别为 `18px / 16px / 14px`，并给链接、inline code、blockquote、表格头做颜色区分；底部固定提供复制任务 ID、复制正文、查看过程三类动作。其中 `source=conn` 且带 `sourceId + runId` 的条目会继续复用后台 run detail 弹层，弹层里的 `Result` 优先渲染完整 `resultText`，再兜底 `resultSummary`。
- 实时广播到达后，前端只刷新任务消息列表和未读数，不再因为后台结果广播去刷新当前 conversation transcript。
