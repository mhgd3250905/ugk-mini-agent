# Team Runtime v2

更新时间：2026-05-26

本文档是 Team Runtime v2 的唯一权威源。v0.1 域名调查历史见文末归档章节。

## 当前目标

提供 plan-driven sequential multi-role pipeline：给定一个 Plan（有序任务列表 + 验收标准），系统自动按 worker → checker → watcher → finalizer 四角色流水线顺序执行每个 task，产出结构化结果和汇总报告。

## 当前状态

- v2 基础链路已验证通过（mock + 真实 runner）
- AbortSignal 全链路传播：cancel/pause 能中断正在执行的 agent session
- 真实 runner smoke test：`run_1c54aaa7e442`，status: completed，P0_REAL_RUNNER_OK
- 最新验证：P26 output contract validation 已覆盖 deterministic validator、真实 orchestrator regression、`npm run test:team` 和 `npx tsc --noEmit`
- 独立 Team Console 前端预览已建立（`apps/team-console/`），使用 Vite + React + TypeScript，实现纵向 Execution Map 原型。当前 `/playground/team` 仍是生产入口，Team Console 不替换任何现有页面。
- Team Console Vite dev server 默认以同源代理承载 Live API 和嵌入式主 `/playground` iframe：`/v1`、`/playground`、`/assets`、`/runtime`、`/vendor` 等路径转发到 `TEAM_CONSOLE_API_TARGET`（手动 `npm run dev` 默认 `http://127.0.0.1:3000`，本地 Docker Compose 固定服务 `ugk-pi-team-console` 使用 `http://ugk-pi:3000`），但该后端目标不再暴露给浏览器端 iframe。`http://127.0.0.1:5174/` 是本地 Team Console 固定入口，随 `docker compose up -d` 由 Docker 管理；远程 FRP 访问 `http://<host>:5174/` 时，iframe 默认仍使用相对 `/playground?...`，避免浏览器误连用户自己机器的 `127.0.0.1`；只有显式设置 `VITE_TEAM_CONSOLE_PLAYGROUND_BASE_URL` 时才使用独立公网后端 origin。
- Team Console preview 的 Live API 模式已真实接线：切换后默认停在干净 `Agent workspace`，只加载 Agent catalog/status，不会在刷新或重新进入时自动渲染历史 run；用户点击“最新 Run”后才请求 `GET /v1/team/plans` 和 `GET /v1/team/runs`，按 `createdAt` 选择最新 run，再请求 `GET /v1/team/runs/:runId` 获取详情并按 `planId` 匹配 plan。点击 task 时会通过现有只读 attempt API 读取 `TeamAttemptMetadata` 和 attempt file。当前不调用 pause/resume/cancel、manual disposition、rerun 或任何写接口。
- Team Console preview 的 Agent 能力已收口为 Agent Atlas：通过 `GET /v1/agents` 读取主项目 Agent catalog，并通过 `GET /v1/agents/status` 读取每个 Agent 的真实空闲 / 运行中状态；Agent 节点加入同一张 Execution Atlas，复用网格、节点样式、pan/zoom 和“重置视图”，卡片状态条与状态 pill 会随真实运行态显示空闲、运行中或状态未知；默认 Mock 入口是干净 `Agent workspace`，不显示旧 demo run。画布内同一 `agentId` 只能出现一次；普通画布态可拖拽 Agent / Task 卡片，按住 Shift 在空白画布框选可选中多个 Agent / Task 节点并整体拖动（空白画布左键长按也可触发框选）；顶部 segmented filter 可按 `ALL / Agent / Task` 分类过滤可见根节点，底部 Dock 承载已收纳根节点；Live API 下已添加 Agent 与拖动后的画布位置会写入浏览器 `localStorage`，刷新后恢复；当前画布 viewport、已展开 Agent / Task 分支、底部 Dock 收纳状态和 segmented filter 选择也会保存到 Team Console 专用 UI state，并在刷新后按当前 catalog 校验恢复，这只保存画布引用，不修改真实 Agent profile 或 Task 定义。Agent 或分支节点向右拖动时只改变画布内世界坐标，不允许撑开外层页面宽度或带动画布 pan。单击 Agent 节点会展开 Agent 分支卡片，而不是进入特殊 Focus 视窗；普通节点层、其他 Agent、runtime nodes、links、evidence、添加入口和缩放工具继续显示。点击同一 Agent 节点会收起该分支，点击另一个 Agent 节点会切换分支。分支卡片按上层浮窗处理，不再为了避让周围节点自动右移，允许覆盖其他节点；用户可拖动画布、拖动分支标题栏移动分支，并可从右下角调整分支宽高。对话分支支持最大化到未缩放画布 overlay，聚焦 iframe 操作并减少缩放世界里的文字模糊；还原后回到原画布节点。分支位置使用画布世界坐标，允许拖过原点上方或左侧；拖动分支标题栏不会带动画布平移。Agent 到分支的连接线统一使用节点右侧中点到目标左侧中点的短 hook 曲线。分支内部是主项目 `/playground` iframe，URL 形如 `/playground?view=chat&agentId=<agentId>&embed=team-console`；Team Console 不再维护本地 transcript + composer，也不再复制 scoped chat stream/state/history/queue/interrupt/file library。主 `/playground` 读取 `agentId` URL hint 进入对应 Agent，`embed=team-console` 下会把 iframe 顶部 Agent 标签锁定为只读标识，关闭 hover 切换菜单和点击跳转，并且不会把 iframe 内 Agent 切换写入主页面共用的 active-agent localStorage，因此主 Agent 卡片打开主 Agent 对话，搜索 Agent 卡片打开搜索 Agent 对话，且互不污染；iframe 内路由跳转继续由主项目自己处理。该能力只引用现有 Agent profile，不创建 clone、instance、overlay 或画布局部技能安装，不把 Agent 节点本身变成 Plan 编排；仍不接 artifact preview，不处理移动端 toolbar / 添加入口专项修复。
- Team Task 后端契约已建立：`Task` 是 Team Console 画布上的独立最小编排节点，内部包含一个 `workUnit`，不复用 `Plan tasks.length === 1`；`leaderAgentId` 负责运行前和用户澄清边界并维护 WorkUnit 草案，`workerAgentId` / `checkerAgentId` 分别代表未来真实执行和验收 Agent。主项目新增 `/v1/team/tasks` REST API 和 `.pi/skills/team-task-creator/SKILL.md`；skill 只能在 `/team-task` 显式触发后创建 / 更新 Task draft，必须先展示完整 Task JSON 并等待确认，不启动 run，不解析 iframe 聊天文本，不修改 Agent profile、模型、browser binding 或技能安装逻辑。Team Console 画布 UI 的前端消费边界见下一条。
- Team Console preview 现在会消费 `GET /v1/team/tasks` 作为 Task catalog：Task 内部包含一个 WorkUnit，Atlas Task 卡片展示 leader Agent、worker Agent 和 checker Agent。点击 Task 后先展开紧凑操作菜单节点，菜单只保留操作按钮和紧凑运行摘要。多个 Task 的菜单可以同时展开，每个 Task 的编辑、Leader chat 和 Run observer 作为按 Task 独立的二级 panel 同时存在；打开新 Task 的二级 panel 不会关闭或替换其他 Task 已展开的二级节点。Task 操作菜单中的所有二级入口（"编辑""对话 Leader""最近运行"）统一具备 toggle 行为：再次点击同一入口会收起当前二级节点回到菜单状态，第三次点击重新展开；toggle 只作用于被点击的 Task branch。打开编辑节点时只在没有现存 draft 时初始化 draft，toggle 收起再展开不会丢失未保存的编辑草稿。编辑草稿（`taskEditDraftByTaskId`）、保存中状态（`taskEditSavingByTaskId`）和冲突警告（`taskEditWarningByTaskId`）按 `taskId` 隔离存储，多个编辑节点互不覆盖。Run observer panel id 稳定命名为 `run-observer-${branch.nodeId}`，不随打开数量变化，确保拖动位置在后续操作中保持。”运行”调用独立 Canvas Task run API，后端把 run 存到 `.data/team/task-runs/runs/<runId>`，不进入 `/v1/team/runs` 的 Plan run 列表，也不把 Task 转换成持久化 Plan；第一版只执行 WorkUnit 的 worker → checker，不启动 watcher/finalizer。菜单会展示最近 Task run 状态，active run 通过 `GET /v1/team/task-runs/:runId` 轮询，停止调用 `POST /v1/team/task-runs/:runId/cancel`。点击菜单里的”最近运行”或”运行中”摘要会展开或收起 Run observer。Run observer 使用单个合并 `run-observer` 面板，而不是多个独立 canvas 子节点。合并面板内部固定顺序为：worker 过程 → worker 输出文件 → checker 过程 → checker 输出文件 → result 文件。文件条目以紧凑行（`.emap-observer-file-row`）展示在合并面板内部，而不是单独的 canvas 节点。点击文件行会在右侧展开第二级文件详情面板，根据文件扩展名使用安全渲染（JSON pretty print、Markdown 使用 `marked` 安全渲染、文本原样展示），不执行原始 HTML，不注入 script；Markdown 渲染通过 `apps/team-console/src/shared/markdown.ts` 的 `renderTeamMarkdown()`，配置与主项目 `src/ui/playground-markdown.ts` 一致（GFM tables、HTML 转义、只允许 http/https 链接、`target="_blank" rel="noreferrer noopener"`）。过程部分消费 additive contract `attempt.roleProcesses.worker` / `attempt.roleProcesses.checker`，按优先级展示 `assistantText.content`（Agent 自述 / 推理文本），缺失时回退到 current action + 最新 narration；前端不再渲染下半部 tool / method 调用明细。完整过程数据仍来自后端 attempt metadata，前端只隐藏 DOM 明细。缺少 `roleProcesses` 时前端保持兼容渲染等待态，不影响菜单运行摘要、文件行和文件详情。合并 observer 面板支持拖动：拖动 Task 根节点会以相同 dx/dy 移动菜单及已展开的 observer 面板和文件详情面板；拖动菜单节点同样带走 observer 和文件详情；拖动 observer 面板只移动自身；拖动文件详情叶子节点只移动自身。编辑节点的拖动把手在标题栏，表单控件区域不参与拖动。所有拖动系统使用延迟 pointer capture：pointerdown 时不调用 setPointerCapture，只有 pointermove 距离超过 4px 阈值后才捕获 pointer。连接线使用 fixed right-middle 到 left-middle 锚点，反向角度时自动重路由，source 出线端显示吸附在卡片右边缘的半圆 socket，target 入线端不再显示圆环或圆点。文件详情节点支持右下角拖动调整宽高，最小尺寸 360×280；详情内容区无固定 max-height 限制。Task 操作菜单、编辑节点、Leader 对话节点、Run observer 面板被用户手动拖动后，在同一页面会话内收起再展开时会保留上一次的画布世界坐标位置；可 resize 的编辑节点和 Leader 对话节点调整尺寸后收起再展开也会保留上一次尺寸。拖动后子节点 connector 使用节点 final rect 位置，不会残留旧坐标。节点轮询 `GET /v1/team/task-runs/:runId` 读取 run state、attempt metadata 和 attempt files，当前使用轮询不接 SSE。”编辑”只允许浅改 Task 名称、leader Agent、worker Agent、checker Agent，并作为菜单右侧二级节点展开；”对话 Leader”同样作为二级节点打开 `/playground?view=chat&agentId=<leaderAgentId>&embed=team-console&teamTaskId=<taskId>&teamTaskMode=edit` iframe，并复用 Agent 分支卡片的 header、iframe、右下角 resize handle 和最大化按钮。Leader 对话分支打开时不再展示完整 Task context 预览文本，只在 header 右侧提供”复制 Task 上下文”按钮；按钮会把 taskId、title、status、agents、input text、input/output ports、output contract、acceptance rules、teamTaskMode、teamTaskId 复制为格式化纯文本。复制优先使用 Clipboard API，远程 HTTP 非安全上下文自动 fallback 到隐藏 textarea + `execCommand("copy")`；两种路径都失败时显示”复制失败”状态提示，并临时展开一个小型只读文本框自动选中上下文，用户可按 Ctrl+C 手动复制。连接线使用 fixed right-middle 到 left-middle 锚点，并显示同一套 source 半圆 socket 标记。”删除”二次确认仍留在一级菜单里，确认后调用 `POST /v1/team/tasks/:taskId/archive` 软归档并刷新。浅编辑保存使用 base snapshot + dirty fields：只 PATCH 用户实际改过的字段，worker/checker 变更会基于最新 Task catalog 合成完整当前 `workUnit`，同字段后台刷新冲突会阻止保存并提示重新打开编辑节点。Live API 工具栏的”创建 Task”和”刷新 Task”收纳为 Task 操作组，Agent / Task 数量以统计 pill 展示。Live API 工具栏的”创建 Task”只负责选择 leader Agent 并打开 `/playground?view=chat&agentId=<leaderAgentId>&embed=team-console&teamTaskMode=create` iframe；真正创建和复杂 WorkUnit 更新仍由 `/team-task` skill 完成。Team Console 不解析 iframe 聊天文本创建 Task，不把 Task 定义或 Task run 状态写入 localStorage；Live API 下只持久化 Task 卡片的画布位置，手动刷新、关闭创建分支、浅编辑保存和归档成功后会重新请求 `GET /v1/team/tasks`。
- Team Console Task run observer 使用单个合并 `run-observer` 面板，而不是多个独立 canvas branch node。合并面板内部固定顺序为：worker 过程 → worker 输出文件 → checker 过程 → checker 输出文件 → result 文件；视觉上按阶段流展示，过程区不再像独立小卡片堆叠。Worker / Checker 过程段固定高度并在段内滚动，使用符合主题的细滚动块（worker 偏青色，checker 偏金色），observer 外层不显示滚动条并按实际内容高度自适应测量，让画布连接线跟随真实节点高度。文件条目以紧凑行（`.emap-observer-file-row`）展示在合并面板内部，而不是单独的 canvas 节点；只有实际存在文件时才渲染对应文件 tray，运行刚开始时空的第 2 / 4 / 5 段不显示“暂无文件”占位。过程部分消费 Canvas Task run attempt metadata 的 additive frontend contract：`roleProcesses.worker` / `roleProcesses.checker`；旧 Live API attempt 缺少 `roleProcesses` 时显示等待过程数据，role process 为 `null` 或条目为空时显示暂无过程条目。过程部分按优先级展示 `assistantText.content`（Agent 自述 / 推理文本，`formatAssistantText()` 保留换行、中文标点自然断句、每行独立 `<p>`，最多 5 行超限显示"已隐藏 X 行"，单行超过 200 字符会截断并显示"已截断 X 长行"，`max-height: 172px` 内部滚动），`assistantText` 缺失时回退到 current action + 最新 narration；前端不再渲染下半部 tool / method 调用明细，也不显示 tool group 折叠区或隐藏计数。完整过程数据仍来自 attempt metadata，前端只隐藏 DOM 明细，不改后端过程存储。运行中的 observer 不渲染空文件占位节点，不显示 `正在刷新...` / `最后刷新` 这类随轮询变化的刷新元信息，active run 轮询的瞬时连接失败不插入红色错误节点，以保留现有画面稳定性；终态 run 的读取失败仍显示错误。拖动 Task 根节点、菜单节点或 resize 文件详情时，前端会暂停 Task branch / child panel 的自动高度测量，避免运行中轮询刷新强制 layout 导致卡顿和闪烁。节点间连接线使用单条连续 cubic：source 固定右侧出线，target 固定左侧入线；反向角度只通过两端水平控制柄表达出入线，不再拆成多段 hook，避免近距离斜向连接出现切角。source 出线端显示吸附在卡片右边缘的半圆 socket：typed Task connection 使用绿色 socket，Agent 分支偏青色，Task 分支偏金色；target 入线端不再画标记。当前仍使用现有 run state / attempt metadata / attempt file API 轮询，不接 SSE，不新增 endpoint，不改后端过程存储。
- Team Console Typed Task Chain V1 已建立最小积木契约：Task 可声明 `inputPorts` / `outputPorts`，port 使用稳定 `id` 和类型字符串 `type`；connection 持久化为 `fromTaskId/fromOutputPortId -> toTaskId/toInputPortId`，后端创建时校验 Task 存在、未归档、port 存在、`output.type === input.type`、非自连接、非重复且不会形成环。上游 Canvas Task run 成功并通过 checker 后，`accepted-result.md` 会被封装为 typed artifact（type、source task/run/attempt、fileRef、preview、content），再作为 `boundInputs` 写入自动启动的下游 Task run；下游 prompt 明确收到绑定输入，不靠 Agent 猜文件路径。V1 只跑 typed port 连接和自动下游触发，不做自由画布复杂编排、条件分支、循环、SSE 或真实 TTS。
- Team Console Canvas source input 后端契约已建立：source node 持久化为独立画布输入节点，source connection 只表示 source node `value` output 到 Task input port 的绑定。直接点击 Task “运行”时，`POST /v1/team/tasks/:taskId/runs` 会把 active source connection 注入 `state.source.boundInputs[]`、worker/checker payload 和 prompt；source node 不伪装成 Task artifact，不写 `sourceTaskId` / `sourceRunId` / `sourceAttemptId`，也不会自动触发下游 Task run。
- Team Console Canvas source 前端已接入 Live API：工具栏”文本输出”创建可编辑 `string` source node，”文件输出”通过浏览器文件选择器创建 file source 并按扩展名推断 `md` / `json` / `html` / `string` / `file`。Source 节点是独立根节点，可拖动、框选、连到同类型 Task input port，并可收纳到底部 Dock；本地只保存 source 节点坐标和 Dock 收纳 id，不保存 source 内容。Agent 对话分支、Task Leader 对话分支和 observer 文件详情面板支持标题栏双击最大化 / 还原，原有标题栏拖动和右下角 resize 行为保持不变。
- Team Console Execution Atlas 根卡片清理入口已收口为垃圾桶 drop target：Agent / Task / Source 根卡片不再提供直接”归档”或”移除”按钮，根节点清理统一通过拖入右下角垃圾桶触发确认 modal。Source 和 Task 确认后分别调用 `POST /v1/team/source-nodes/:sourceNodeId/archive` 和 `POST /v1/team/tasks/:taskId/archive`，归档成功后根卡片、Dock 条目、相关连接线、展开分支和本地 UI 状态同步清理。Agent 确认后只从 Team Console 画布移除本地引用，不会调用 Agent profile archive API。归档失败时节点保留并在顶部 error banner 显示错误信息。Task dependency handle 已从右下角裸文本 `dep` 改为右侧中部的 amber 圆形 socket，有语义化 aria-label 区分”设为依赖源”、”设为依赖目标”和”已选依赖源”三种状态。
- Team Console preview 的 Execution Map 建模按优先级挂载 generated child：显式 `parentTaskId`、仅在单一 `for_each` parent 时使用的安全 `sourceItemId` fallback、标记 `fallback: true` 的 id prefix fallback，仍无法归属的任务进入 orphan group；model builder 不修改传入的 plan/run/taskDefinitions。大量子任务折叠 summary node 会按隐藏子任务状态汇总，不再固定显示成功。
- Execution Map 视觉已收口为 Execution Atlas：根节点顶部、主任务沿左侧 spine 向下、子任务分支右侧；节点有状态色条、选中发光、chain-selected 路径、失败错误首行、折叠虚线、orphan 点线；Agent / Task 画布卡片共享 `.emap-atlas-card` 基类，Task 一级菜单使用 `.emap-menu-branch`，iframe 对话分支使用 `.emap-dialog-branch`；连接线统一使用平滑三次贝塞尔曲线；responsive 断口在 720px。
- Team Console Task run 并发边界：不同 Task 可以同时运行，前端 run state（`taskRunsByTaskId`、`taskRunSavingByTaskId`）按 `taskId` 独立维护；后端 Canvas Task run admission 也只做同一 Task active guard，不使用 Plan run 的 `TEAM_MAX_CONCURRENT_RUNS` 全局 admission。每个 Task 同时只允许一个 active run，有 active run 时该 Task 的"运行"按钮显示"运行中"并禁用，只暴露该 Task 自己的"停止"按钮。其他 Task 不受影响，"运行"按钮保持可用。Run observer 和轮询按 `taskId + runId` 独立工作。不引入全局画布级 run queue 或 semaphore。用户需自行注意跨 Task 的 Agent 资源冲突。
- Team Console preview 当前点击任务后不再打开固定右侧详情栏，也不在节点内部堆叠大段详情；结果 / 错误 / 尝试 / 进度会作为 evidence card 分支从 selected task 旁边长出。选中 task 有真实 attempt metadata 时，Worker 输出、Checker 验收、Watcher 复盘和最终 / 失败 / 发现结果会作为 artifact card 展示；只有通过当前 task/attempt 匹配且存在于 attempt metadata `files` 白名单中的 file-backed artifact card 可点击预览。Fallback Error / Attempt / Progress evidence 是静态卡片，不会伪造可预览文件。点击可预览 artifact card 后读取同一 run/task/attempt 下的真实文件并展开第二级预览节点，文本安全转义，JSON pretty print，HTML 只进 sandbox iframe。
- Execution Atlas 桌面画布支持鼠标滚轮缩放、背景拖拽平移、空白画布左键长按框选多个 Agent / Task 节点（Shift + 拖动仍兼容直接框选）、拖动已选节点集合和”放大 / 缩小 / 重置视图”工具按钮；pan/zoom viewport 会随 Team Console canvas UI state 持久化，框选选择态仍只是本地瞬时状态。Evidence / preview 高度测量使用 transform-independent `offsetHeight` 优先，避免缩放后把 `getBoundingClientRect().height` 写回 layout 造成测量反馈循环；滚轮缩放使用原生 non-passive `wheel` listener。移动端本轮不做深度设计，`720px` 以下仍走纵向流式布局并隐藏自定义 pan/zoom 工具条，只保证不明显横向炸版。
- Team Console mock fixtures 已加入脱敏真实 run snapshot（`plan_real_snap_001` / `run_real_snap_001`），用于验证真实 completed_with_failures 数据、for_each 子任务、长错误、API 错误、resultRef、ghost result 和最终汇报 evidence。
- Team Console mock fixtures 已加入脱敏真实 run snapshot 2（`plan_real_success_foreach_001` / `run_real_success_foreach_001`），16 个任务（3 主任务 + 13 for_each 子任务）全部成功，用于验证折叠/展开交互和大量子任务布局。
- Execution Atlas collapsed summary 已支持展开/收起：超过 `CHILD_COLLAPSE_THRESHOLD`(6) 个子任务时折叠为摘要节点；点击摘要节点展开全部子任务，展开后末尾显示"收起"按钮再次点击收起。布局在展开/收起时同步更新。
- Execution Atlas evidence 规则：for_each 父任务有 visible children（子任务数 ≤ 阈值或已展开）时不显示 evidence；无 visible children 时显示当前任务自身的结果 / 错误 / 进度。
- Team Console 多 Task 聚焦布局稳定：切换聚焦 Task 不会导致其他 Task 的二级面板重定位或连接线锚错父菜单。每个活跃 Task 菜单维护独立的 shell 尺寸测量（`taskBranchMeasuredSizes` / `taskBranchShellRefs` map 替代旧单例），child panel connector 只锚定自己的 parent menu，`sourceId` 无法解析时不再回退到主 `taskBranchNode`。

## 核心概念

### Task

Task 是 Team Console 画布上的最小编排节点，独立于 Plan 存在。不要把它实现成 `Plan tasks.length === 1`，这不是语义洁癖，是避免以后画布节点、运行快照和多任务 Plan 全部互相污染。

关键字段：

- `taskId` — 唯一标识，当前由 `src/team/ids.ts` 生成 `task_...`
- `title` — 画布 Task 标题
- `leaderAgentId` — 必填，运行前负责和用户沟通、澄清边界并维护 WorkUnit 草案的 Agent
- `workUnit` — Task 内部的单个 WorkUnit 定义
- `status` — `drafting | ready | locked | archived`；本轮创建 / 更新只开放 `drafting | ready`，`locked` 预留给未来 run snapshot
- `archived` — 软归档标记；默认列表不返回归档 Task

`workUnit` 关键字段：

- `title`
- `input.text`
- `inputPorts?: { id; label?; type }[]`
- `outputContract.text`
- `outputPorts?: { id; label?; type }[]`
- `acceptance.rules[]`
- `workerAgentId`
- `checkerAgentId`

`leaderAgentId`、`workerAgentId`、`checkerAgentId` 都必须指向当前未归档 Agent profile。`workerAgentId === checkerAgentId` 第一版允许，但 API 会返回 warning，skill 预览也必须提醒“同 Agent 自检会削弱验收独立性”。

Task 持久化在 `.data/team/tasks/<taskId>.json`，通过 `src/team/task-store.ts` 读写；旧记录缺 `status` 时按 `drafting`，缺 `archived` 时按 `false`。

`team-task-creator` runtime skill 只创建 / 更新 Task draft：

- 显式关键词：`/team-task`
- 先读 `GET /v1/agents`
- 先展示完整 Task JSON 预览并等用户确认
- 创建走 `POST /v1/team/tasks`
- 更新走 `GET /v1/team/tasks`、`GET /v1/team/tasks/:taskId`、`PATCH /v1/team/tasks/:taskId`
- 不启动 run，不调用 `POST /v1/team/plans/:planId/runs`，不直接写 `.data/team`，不改 Agent profile / 模型 / browser binding / 技能安装

### Typed Task Chain V1

Typed Task Chain V1 把 Task 设计成可组合的最小积木，但刻意不把 Team Console 做成万能工作流平台。规则很简单，也必须简单：每条连接要求 `output.type === input.type`；同一个 output port 可以连接到多个不同下游 Task 的同类型 input port（fan-out）；但每条连接的四元组 `(fromTaskId, fromOutputPortId, toTaskId, toInputPortId)` 必须唯一。

端口契约：

- `workUnit.inputPorts[]` 和 `workUnit.outputPorts[]` 都是可选字段；旧 Task 没有 ports 时仍能照常创建、编辑和运行，只是不能作为 typed connection 的端点。
- 每个 port 必须有稳定 `id` 和 `type`；`label` 只用于 UI 展示。
- `id` 只允许字母开头的短标识；`type` 使用小写类型字符串，例如 `md`、`html`、`json`、`audio`。
- 连接规则固定为 `output.type === input.type`。`md -> md` 可以连接；`md -> html` 不可以直接连接。HTML 制作 Task 的正确建模是 `inputPorts: [{ type: "md" }]`、`outputPorts: [{ type: "html" }]`。

连接契约：

- 持久化文件：`.data/team/task-connections.json`
- API：`GET /v1/team/task-connections`、`POST /v1/team/task-connections`、`DELETE /v1/team/task-connections/:connectionId`
- 数据结构：`{ connectionId, fromTaskId, fromOutputPortId, toTaskId, toInputPortId, createdAt }`
- 后端创建 connection 时必须校验 Task 存在、未归档、port 存在、类型相等、非自连接、非重复连接，并拒绝会形成环的连接。
- `create()` 和 `delete()` 使用 mkdir-based mutation lock 保护 read-modify-write 区间，防止并发丢失连接。`list()` / `listResolved()` 不加锁——原子 rename 保证读者看到完整文件。
- `task-connections.json` 缺失仍返回空列表；但 invalid JSON、non-array JSON 或不可读文件会抛出错误，API 层返回 500，不再静默返回空列表。
- `GET /v1/team/task-connections` 返回每条连接附带运行时派生的 `status: "active" | "stale"` 和可选 `staleReason`；这些字段不写入 `task-connections.json`，只在 API 请求时从当前 Task/port 状态推导。stale 连接不触发下游 run，前端不渲染 stale 连接线。
- stale 判定规则（任一命中即标记 stale）：
  - `source_task_missing` — source Task 不存在
  - `source_task_archived` — source Task 已归档
  - `target_task_missing` — target Task 不存在
  - `target_task_archived` — target Task 已归档
  - `source_output_port_missing` — source output port 在当前 WorkUnit 中找不到
  - `target_input_port_missing` — target input port 在当前 WorkUnit 中找不到
  - `source_output_port_type_mismatch` — source output port type 与 connection type 不一致
  - `target_input_port_type_mismatch` — target input port type 与 connection type 不一致
- 上游 run 完成后触发 downstream 时，如果 source Task 在 run 期间被归档，downstream 不会被触发；上游 accepted run 不受下游 stale 影响。
- Fan-out 交付规则：上游 accepted result 作为 typed artifact 分发给每个下游 Task 的连接；每个下游 Task 独立创建自己的 Canvas Task run。某个下游失败（例如已有 active run）只记录 `failed` delivery outcome，不阻塞其他下游或把上游 run 改成失败。不同下游 Task 可并行运行。

Source node 输入契约：

- source node 持久化文件：`.data/team/source-nodes.json`；source connection 持久化文件：`.data/team/source-connections.json`。
- API：`GET /v1/team/source-nodes`、`POST /v1/team/source-nodes`、`PATCH /v1/team/source-nodes/:sourceNodeId`、`POST /v1/team/source-nodes/:sourceNodeId/archive`、`GET /v1/team/source-connections`、`POST /v1/team/source-connections`、`DELETE /v1/team/source-connections/:connectionId`。
- source node 目前只支持 `nodeType: "text" | "file"`，输出端口固定为 `outputPort.id = "value"`。text source 默认输出 `string`；file source 会按文件扩展名推断 `md`、`json`、`html`、`string` 或兜底 `file`。
- source connection 数据结构是 `{ connectionId, fromSourceNodeId, fromOutputPortId, toTaskId, toInputPortId, type, createdAt, updatedAt }`，只连接 source node 到 Task input port，不写 Task artifact 的 `sourceTaskId`、`sourceRunId` 或 `sourceAttemptId`。
- 后端创建 source connection 时校验 source node 存在且未归档、source output port 存在、target Task 存在且未归档、target input port 存在，并要求 source output type 与 target input type 相等。重复连接会被拒绝。
- `GET /v1/team/source-connections` 返回运行时派生的 `status: "active" | "stale"` 和可选 `staleReason`；stale 规则包括 source node 缺失/归档、target Task 缺失/归档、两端 port 缺失或类型漂移。stale source connection 在直接 Task run 时会被跳过，不阻断该 run。
- 直接 Canvas Task run 会收集指向当前 Task 的 active source connection，构建 `schemaVersion: "team/source-artifact-1"` 的 `TeamCanvasSourceArtifact`，并以 `source: "canvas-source"` 的 bound input 写入 `TeamRunState.source.boundInputs[]`、Agent payload 和 prompt。
- Task-to-Task typed artifact 自动下游链路仍只消费 `task-connections.json` 和 accepted-result typed artifact；source node / source connection 不会因为内容变化或连接创建而自动启动 Task。

产物传递契约：

- 上游 Canvas Task run 必须成功并通过 checker，才会把 `accepted-result.md` 封装成 typed artifact。
- artifact 至少包含 `artifactId`、`type`、`sourceTaskId`、`sourceRunId`、`sourceAttemptId`、`fileRef`、`preview` 和 `content`。
- 下游自动 run 的 `TeamRunState.source` 会写入 `triggeredBy: { type: "task-connection", connectionId, fromTaskId, fromRunId, fromAttemptId }` 和 `boundInputs[]`。
- `boundInputs[]` 会进入下游 WorkUnit 的 prompt 和 payload，Agent 看到的是明确绑定的 typed artifact 输入，不需要自己猜上游文件在哪。
- Prompt 中的每个 bound input 包含完整追溯 metadata：`connectionId`、`inputPortId`、`artifactId`、`sourceTaskId`、`sourceRunId`、`sourceAttemptId`、`sourceOutputPortId`、`fileRef`。
- Artifact 内容被 `BEGIN_TYPED_ARTIFACT_CONTENT <artifactId>` 和 `END_TYPED_ARTIFACT_CONTENT <artifactId>` 包裹，不使用 Markdown code fence，因为 artifact 自身可能包含 triple backtick。
- Prompt 格式是纯格式层契约；payload 仍携带结构化 `boundInputs` 对象，截断限制不变：content 30,000 字符，preview 1,200 字符。
- 下游启动失败不会回滚已经验收通过的上游 run；失败只影响连接触发链路本身。

下游交付诊断：

- 上游 attempt 成功后，系统会为每个存在的 outgoing connection 记录一条 `TeamTaskDeliveryOutcome`，写入 `TeamAttemptMetadata.downstreamDelivery`。
- 三种状态：`delivered`（成功启动下游 run，附带 `downstreamRunId`）、`skipped`（连接 stale 或 source task 中途归档/缺失，附带 `staleReason`）、`failed`（启动下游 run 失败，附带裁剪后的短 `error`）。
- 没有 outgoing connection 时不记录任何 outcome。
- 诊断写入是 best-effort：写入失败不会回滚已完成的 upstream run。
- 可通过现有 `GET /v1/team/task-runs/:runId/tasks/:taskId/attempts` 读取，不需要新 endpoint。

边界：

- V1 不做任意复杂自由画布编排、条件分支、循环、真实 TTS 或 SSE 观察流。
- Source node 只作为直接 Canvas Task run 的输入绑定，不是工作流触发器，不提供条件、循环、广播、多源聚合或自由执行引擎。
- TTS 只作为类型系统 fixture：未来 `md -> audio` 的 Task 可以复用同一套 port / artifact / connection 规则。
- 第一条真实验收链路固定为”搜集内容 Task 输出 `md` -> HTML 制作 Task 输入 `md`、输出 `html`”。

### Task Control Dependencies

Control dependency 是 typed connection 之外的第二类 Task DAG 边。它只表达”Task A 成功完成后自动启动 Task B”，不传数据、不要求端口、不生成 artifact、不写 `boundInputs`。

与 typed connection 的区别：

| | Typed Connection | Control Dependency |
|---|---|---|
| 数据传递 | 有（typed artifact → boundInputs） | 无 |
| 端口要求 | 需要 output/input port 且类型匹配 | 不需要 ports |
| 产物类型 | accepted result → typed artifact | 不生成 artifact |
| 下游输入 | `boundInputs` 写入 prompt 和 payload | 不写 `boundInputs` |
| 线条样式 | 实线 + source socket | 虚线 amber（`.emap-link-task-dependency`） |

后端契约：

- 持久化文件：`.data/team/task-dependencies.json`
- API：`GET /v1/team/task-dependencies`、`POST /v1/team/task-dependencies`、`DELETE /v1/team/task-dependencies/:dependencyId`
- 数据结构：`{ dependencyId, fromTaskId, toTaskId, trigger: “on_success”, createdAt, updatedAt }`
- 后端创建 dependency 时校验 Task 存在、未归档、非自连接、非重复、不与现有 typed connections + control dependencies 合并后形成环。
- `GET` 返回运行时派生的 `status: “active” | “stale”` 和可选 `staleReason`（`source_task_missing` / `source_task_archived` / `target_task_missing` / `target_task_archived`）。
- Cycle 防护覆盖混合图（typed connections + control dependencies 共同参与环检测）。

下游触发：

- 上游 Canvas Task run 成功并通过 checker 后，系统检查所有从该 Task 出发的 active control dependency，为每个下游 Task 创建独立的 Canvas Task run。
- 下游 run 的 `state.source.triggeredBy` 记录 `{ type: “task-dependency”, dependencyId, fromTaskId, fromRunId, fromAttemptId }`。
- 下游 run 不写 `state.source.boundInputs`（除非该 Task 同时有 active typed connection 的 source binding）。
- 上游失败或取消不触发 dependency 下游。
- Stale dependency 记录 `skipped` delivery outcome，不阻塞上游 accepted run。
- Delivery outcome 类型为 `TeamTaskControlDependencyDeliveryOutcome`（`edgeKind: “control-dependency”`），与 typed connection 的 `TeamTaskTypedConnectionDeliveryOutcome`（默认 `edgeKind: “typed-connection”`）构成 union。

### Canvas Task Run

Canvas Task Run 是 Task 的独立运行轨道，不是 Plan run 的别名。后端会为 Task run 构造一个仅用于 run snapshot 的内部执行 envelope，但不会写入 `PlanStore`，不会出现在 `GET /v1/team/runs`，也不会增加任何 Plan 的 `runCount`。持久化目录是 `.data/team/task-runs/runs/<runId>`。

运行规则：

- 启动入口：`POST /v1/team/tasks/:taskId/runs`
- 只允许 `status="ready"` 且未归档的 Task 启动
- 同一个 Task 同时只允许一个 active run（`queued | running | paused`）
- 不同 Task 可以同时有 active run；Canvas Task run 创建不走 `TEAM_MAX_CONCURRENT_RUNS` / `createRunWithAdmission`
- worker 使用 `workUnit.workerAgentId`
- checker 使用 `workUnit.checkerAgentId`
- leader 不参与运行阶段，只负责运行前沟通和 WorkUnit 草案维护
- 第一版不启动 watcher/finalizer，不支持 pause/resume/rerun
- active run 可用 `POST /v1/team/task-runs/:runId/cancel` 停止
- worker/checker attempt metadata 和输出文件仍复用 `RunWorkspace` 的 attempt 结构，只是 rootDir 指向 `task-runs`
- worker/checker 过程观测不新造 Team 专属 tool log schema：`AgentSessionLike.subscribe()` 原始事件先经 `createAgentSessionEventAdapter()` 转成 `ChatStreamEvent`，再经 `applyChatStreamEventToActiveRunView()` 得到和主聊天一致的 `ChatProcessBody`
- attempt metadata 可包含 `roleProcesses.worker` / `roleProcesses.checker`，每个 role process 记录 `role`、`profileId`、`status`、`startedAt`、`updatedAt`、`finishedAt`、`process` 和可选 `assistantText`（Agent 自述 / 推理文本）
- role process 写盘策略：role start、`tool_started`、`tool_finished`、completion/failure/cancel 立即 flush；`tool_updated`、`text_delta`、heartbeat 等高频事件按 300-500ms 节流合并；completion/failure/cancel 前必须 flush 最新状态
- 单条 process entry 的 `detail` 持久化前截断到约 8,000 字符并追加 `...[truncated]`，长输出继续以 attempt 文件为准
- 通过 typed connection 自动触发的下游 run 会在 `state.source.triggeredBy` 记录来源 connection / upstream run，并在 `state.source.boundInputs` 记录输入 artifact
- 用户直接启动 Canvas Task run 时会注入 active source connection bound input；这类 bound input 使用 `source: "canvas-source"` 区分，不包含上游 Task/run/attempt 追溯字段
- 旧 attempt metadata 没有 `roleProcesses` 时继续按旧结构返回，不需要迁移

### Team Canvas Task frontend workflow

Team Console 的 Task 前端闭环只负责画布入口和刷新，不拥有 Task 定义本身：

- `GET /v1/team/tasks` 是 Task catalog 唯一来源；Live API 下 Task 卡片位置只把 `taskId` 和画布坐标写入 `localStorage`，不保存 `workUnit`、`leaderAgentId`、`workerAgentId` 或 `checkerAgentId`。
- Task 卡片会渲染声明过的 typed input/output ports。用户点击 output port 后只能连接同类型 input port；前端会提前拦截类型不匹配，但最终合法性以后端 `POST /v1/team/task-connections` 为准。
- 连接成功后前端保存并渲染 Task 间 connection path；刷新 Task catalog 时也会重新请求 `GET /v1/team/task-connections`，确保画布线来自后端事实而不是本地猜测。
- 点击已有 Task 先打开紧凑操作菜单节点：运行调用独立 Canvas Task run API；编辑只开放 Task 名称、leader Agent、worker Agent、checker Agent，并在菜单右侧展开二级编辑节点；对话 Leader 在菜单右侧展开 leader Agent 的 `/playground?view=chat&agentId=<leaderAgentId>&embed=team-console&teamTaskId=<taskId>&teamTaskMode=edit` iframe，并可像 Agent 对话分支一样 resize / 最大化。Leader 对话分支打开时不再展示完整 Task context 预览文本，只在 header 右侧提供“复制 Task 上下文”按钮；按钮会把 taskId、title、status、agents、input text、input/output ports、output contract、acceptance rules、teamTaskMode、teamTaskId 复制为格式化纯文本。复制优先使用 Clipboard API，远程 HTTP 非安全上下文自动 fallback 到隐藏 textarea + `execCommand("copy")`；两种路径都失败时显示”复制失败”状态提示，并临时展开一个小型只读文本框自动选中上下文，用户可按 Ctrl+C 手动复制。Team Console 仍不解析 iframe 聊天文本，仍不自动更新 Task 定义；删除调用 archive 软归档。
- 浅编辑保存时，标题和 leader Agent 只发送 dirty 顶层字段；worker/checker 变更会基于最新 Task catalog 里的当前 `workUnit` 合成完整 PATCH 并只替换 Agent 绑定。编辑节点打开后如果同一字段已经被后台刷新改变，旧草稿保存会被阻止并提示重新打开编辑节点。input text、output contract、acceptance rules 等复杂 WorkUnit 字段不进入 Team Console 可视化编辑 UI。
- 点击“创建 Task”先选择 leader Agent，再打开 `/playground?view=chat&agentId=<leaderAgentId>&embed=team-console&teamTaskMode=create` iframe；Team Console 只打开 leader Agent iframe，不直接创建 Task。
- 创建 / 更新仍由 iframe 内用户显式触发 `/team-task`，并由 runtime skill 调 `POST /v1/team/tasks` 或 `PATCH /v1/team/tasks/:taskId`；Team Console 不解析 iframe 聊天文本创建 Task，不替用户确认 skill 预览 JSON。
- 用户可手动点击“刷新 Task”重新拉取 `GET /v1/team/tasks`；刷新中禁用重复点击，失败保留当前 Task 卡片并显示错误。
- 当已知 active Canvas Task run 通过 `GET /v1/team/task-runs/:runId` 轮询进入终态时，Live API 前端会自动触发一次 Task refresh，重新读取 Task catalog、connections 和所有 Task run 列表，用于发现 typed chain 自动启动的下游 run；用户从上游 Task 切到下游 Task 时不需要手动刷新。
- 关闭创建分支、浅编辑保存成功、归档成功后会重新请求 `GET /v1/team/tasks`，用于把后端事实刷回画布。
- 点击“运行”会调用 `POST /v1/team/tasks/:taskId/runs` 启动独立 Canvas Task run；前端通过 `GET /v1/team/tasks/:taskId/runs` 读取历史，通过 `GET /v1/team/task-runs/:runId` 轮询 active 状态。这个 run 只属于 Canvas Task，不进入 Plan run 列表，也不会增加 Plan `runCount`。
- 点击 Task 菜单里的”最近运行”或”运行中”摘要会展开或收起 Run observer；摘要区域直接展示运行状态、阶段、耗时、attempt 数、进度消息和 run id；Run observer 不再单独渲染 Run 状态 canvas 子节点。Run observer 使用单个合并 `run-observer` 面板，而不是多个独立 canvas 子节点。合并面板内部固定顺序为：worker 过程 → worker 输出文件 → checker 过程 → checker 输出文件 → result 文件。文件条目以紧凑行（`.emap-observer-file-row`）展示在合并面板内部，而不是单独的 canvas 节点。点击文件行会在右侧展开第二级文件详情面板，根据文件扩展名使用安全渲染（JSON pretty print、Markdown 使用 `marked` 安全渲染、文本原样展示），不执行 HTML，不使用 `dangerouslySetInnerHTML`；JSON 解析失败时会显示 parse error 消息。文件详情节点支持右下角拖动调整宽高，最小尺寸 360×280，拖动后连接线和布局同步更新。连接线使用 fixed right-middle 到 left-middle 锚点，反向角度时自动重路由，并只在 source 出线端显示半圆 socket。SSE 观察流仍是后续后端能力，不在第一版里硬做。
- Run observer 的过程部分读取 `attempt.roleProcesses.worker` / `attempt.roleProcesses.checker`，在合并面板中分别以"Worker 过程"和"Checker 过程"标题展示，按优先级展示 `assistantText.content`（Agent 自述 / 推理，`formatAssistantText()` 保留换行、中文标点断句、每行独立 `<p>`，最多 5 行超限提示，单行超过 200 字符会截断）、current action + 最新 narration（fallback）。过程部分不再渲染下半部 tool / method 调用明细；完整过程数据仍在 attempt metadata 中，前端不丢弃后端数据，只隐藏 DOM 明细。缺少 `roleProcesses` 时前端保持兼容渲染等待态，不影响菜单运行摘要、文件行和文件详情。
- 第一版 Task run 只执行 `workUnit.workerAgentId` 和 `workUnit.checkerAgentId`，不启动 watcher/finalizer，不支持 pause/resume/rerun；active run 可通过 `POST /v1/team/task-runs/:runId/cancel` 停止。

### TeamUnit

可复用的团队预设，绑定 5 个 AgentProfile 到 5 个角色：

- `workerProfileId` — 执行 Agent，负责完成 task
- `checkerProfileId` — 验收 Agent，评审 worker 输出（pass / revise / fail）
- `watcherProfileId` — 复盘 Agent，post-task review（accept_task / confirm_failed / request_revision）
- `finalizerProfileId` — 汇总 Agent，生成最终报告
- `decomposerProfileId` — 任务拆分 Agent，用于 controlled runtime decomposition

同一 AgentProfile 可填充多个角色。归档后的 TeamUnit 不能用于新 run。

旧 TeamUnit JSON 缺失 `decomposerProfileId` 时自动 fallback 到 `workerProfileId`。

### Plan

有序任务列表 + 目标 + 输出契约。关键字段：

- `planId` — 唯一标识
- `defaultTeamUnitId` — 默认绑定 TeamUnit
- `goal` — 计划目标
- `tasks[]` — 有序任务列表，每个 task 有 `id`、`title`、`input.text`、`acceptance.rules`，可选 `decomposer` / `outputCheck`
- `outputContract` — 最终输出格式
- `runCount` — 已产生的 run 数量；`runCount > 0` 后任务主体不可改

#### Plan draft

Plan draft 是创建 Plan 前的只读草案层。它只根据用户自然语言目标生成一份可检查、可再提交的 `POST /v1/team/plans` payload，不持久化 Plan，不创建 Run，也不修改 `runCount`。

- `GET /v1/team/plan-templates` 返回模板 registry。当前可用模板是 `single_agent` 和 `parallel_research`；`coding_fix`、`deep_research_with_review` 只作为 planned 模板返回，不能用于 draft 生成，也不在 `/playground/team` 的可创建选项中展示。
- `POST /v1/team/plan-drafts` 接收 `prompt`、`defaultTeamUnitId` 和可选 `preferredTemplateId`；路由会先校验 TeamUnit 存在且未归档，再生成 draft，并用 `validateCreatePlanInput()` 校验返回的 plan。
- Plan draft v1.1 router 仍是确定性薄 heuristic，不调用 LLM：多对象研究、竞品/供应商/产品/pricing/alternatives/market map 等信号稳定进入 `parallel_research`；普通单点研究保持 `single_agent`；代码修复信号优先走 `single_agent`，不会被 `pricing` 里的 `ci` 之类字符串误判成 CI 修复。
- `parallel_research` draft 生成 `discover_items` discovery 任务和 `research_each` `for_each.mode="parallel"` 任务；discovery prompt 要求输出 3 到 8 个高价值结构化 item，child prompt 锁定单个 source item 身份，final output contract 要求执行摘要、逐项发现表格、横向对比、来源线索、风险/未知项和建议。
- 并行 child 模板不设置 `leaf` / `propagate` decomposer，避免和 parallel for_each 校验冲突。
- 显式请求 planned/unsupported `preferredTemplateId` 会返回 400；没有 preferred template 时只会选择当前 supported 模板。

#### task.decomposer（P21-B/P21-C）

Plan task 可声明受控拆分策略：

```json
{
  "decomposer": {
    "mode": "none",
    "maxChildren": 8
  }
}
```

- `mode` 允许值：`none`、`leaf`、`propagate`
- `maxChildren` 可选，必须是 `1..20` 的整数
- 旧 task 缺失 `decomposer` 时按 `none` 理解
- `forEach.taskTemplate.decomposer` 与普通 task 使用同一套校验
- `TeamOrchestrator` 会在 `leaf` / `propagate` task 执行 worker 前先调用 decomposer

语义边界：

- `none` — 当前任务不可拆分
- `leaf` — 可拆成普通 child task；child task 必须是 `decomposer.mode="none"`
- `propagate` — 可拆成普通 child task；child task 只能是 `none | leaf`，不能继续生成 `propagate`

权限矩阵：

| parent mode | child mode | 结果 |
|-------------|------------|------|
| `propagate` | `leaf` | 允许 |
| `propagate` | `none` | 允许 |
| `propagate` | `propagate` | 拒绝 |
| `leaf` | `none` | 允许 |
| `leaf` | `leaf` / `propagate` | 拒绝 |
| `none` | 任意 child | 不调用 decomposer |

`decomposer` 和 `for_each` 是两件事，别混着用，混了就是给未来的自己挖坑：

- `for_each` 适合未知数量 item：先用 `discovery` 找到数组，再按模板生成同构任务。
- `decomposer.leaf` 适合某个已知大任务太粗：例如某个方法内还要拆 `collect-known-ips`、`ptr-lookup`、`passive-dns-otx`。
- `decomposer.propagate` 只给少数顶层任务使用：它最多生成一层 `leaf` child，不能无限传播。
- Medtrum 风格推荐：`discover_methods -> for_each(methods)`，每个 method task 如 reverse DNS / passive DNS 可设 `decomposer.leaf`，leaf children 正常顺序执行并进入 finalizer 汇总。

### Controlled Runtime Decomposition (P21-C)

`TeamOrchestrator` 对 `normal`、`discovery` 和动态生成的 normal child task 使用同一条受控拆分入口：

- `decomposer.mode="none"`：不调用 decomposer，直接执行原 task 的 worker→checker→watcher。
- `decision="no_split"`：写入 decomposition record 后，原 task 按普通 task 执行。
- `decision="split"`：parent task 变成 container，不执行 parent worker/checker/watcher；系统写入 decomposition record，append child task states，然后按记录顺序执行 child tasks。
- child task 必须是 `normal`，runtime 不接受 decomposer 生成的 `discovery` / `for_each` child task。
- runtime 强制模式矩阵：`propagate -> leaf | none`，`leaf -> none`，`none` 不拆。
- `maxChildren` 默认 8，单 task policy 可设 `1..20`；单 run 当前最多 50 个 task state，避免无限扩张。
- 既有 decomposition record 会优先于再次调用 decomposer；resume/reclaim 时会复用 record 中的完整 child `TeamTask` 定义。
- pause/cancel/timeout 使用现有 run control 机制；未完成 parent/children 会按 run 状态统一标记。
- parent 状态由 child 汇总：全部 child 成功则 parent `succeeded`，任一 child 失败则 parent `failed`，错误摘要指向失败 child。
- 当 `discovery` parent 被 `split` 时，parent 仍不执行 worker/checker/watcher；runtime 会按 decomposition record 中的 child 顺序尝试读取每个 normal child 的 `accepted-result.md` 和 `worker-output-001.md`，以第一个能解析出 item 数组的内容为准，并聚合为 parent 的 `discovery.outputKey` 结果供下游 `for_each.itemsFrom` 使用。
- 聚合成功后，runtime 为 parent 创建一个 **聚合 attempt**（无 worker/checker/watcher），写入标准化 `discovery-result.json`（`tasks/<parentTaskId>/attempts/<attemptId>/discovery-result.json`），parent task state 的 `activeAttemptId` 指向该聚合 attempt。resume/reclaim 时优先读取此标准文件，不再重新聚合子级输出。旧 run 无此文件时回退到传统子级聚合。
- decomposed discovery child 输出支持两种形状：包含 parent `discovery.outputKey` 数组的 JSON object，例如 `{ "items": [...] }`；或直接输出 item object 数组，例如 `[{"id":"a"}]`。
- decomposed discovery child 输出必须提供 item object 数组；任一 child 输出 malformed、缺少目标数组、或数组元素不是 object 时，discovery parent 会失败，downstream `for_each` 不会从 partial data 扩展。
- finalizer 输入来自完整 `state.taskStates`，因此能看到 decomposed child 的 result/error 信息。

### Dynamic Task Expansion (P15)

Plan 支持三种任务类型：

- `normal`（默认）— 标准 worker→checker→watcher 顺序执行
- `discovery` — 执行标准 worker→checker→watcher 循环，但输出被期望为包含可提取 JSON 的内容。JSON 中由 `discovery.outputKey` 指定的键值是一个数组，提供给下游 `for_each` 任务。
- `for_each` — 运行时动态扩展：根据上游 `discovery` 任务发现的 item 数组，从模板生成子任务。所有子任务顺序执行，每个子任务经历完整的 worker→checker→watcher 生命周期。

#### discovery 任务

```json
{
  "id": "discover",
  "type": "discovery",
  "title": "Discover items",
  "input": { "text": "Find all items related to X" },
  "acceptance": { "rules": ["output is valid JSON with 'items' array"] },
  "discovery": { "outputKey": "items" }
}
```

- `discovery.outputKey`（必填）— worker 输出 JSON 中包含 item 数组的键名
- worker 输出必须包含可提取的 JSON（raw JSON、fenced code block、或 brace-matched）
- 系统按 `outputKey` 提取数组后，供 `for_each` 任务引用
- P26 起，discovery 输出在 runtime 中有硬约束：必须能解析为 `{ [outputKey]: [...] }`，数组元素必须是 object，且每个 item 必须有稳定非空 string `id`
- worker 可以直接输出机器可消费 JSON，也可以在 `accepted-result.md` / `worker-output-001.md` 中引用 run-scoped 文件；例如 `worker/hk-cloud-server-scan.json` 会解析到当前 attempt 的 worker role workspace
- checker/watcher 的口头通过不能绕过 discovery 协议；deterministic validator 的 `ok=false` 会把该 work unit 置为 failed

#### discovery-result.json 标准化合约

discovery 任务通过 deterministic output validation、checker 和 watcher 后，runtime 会将提取到的 items 写入标准化文件 `discovery-result.json`：

```
tasks/<taskId>/attempts/<attemptId>/discovery-result.json
```

文件内容为 `TeamDiscoveryResultRecord`（schemaVersion: `team/discovery-result-1`），包含 `taskId`、`attemptId`、`outputKey`、`items`（对象数组）、`sourceRef`、`createdAt`。

- `items` 必须为对象数组（`Record<string, unknown>[]`），且每个 item 必须有 `string` 类型的 `id` 字段
- 标准化失败时（items 含非对象值、缺少 id、outputKey 不匹配、引用文件缺失或越界），discovery task 会标记为 `failed`
- `for_each.itemsFrom` 解析时优先读取 `discovery-result.json`，并验证 `outputKey` 与 `itemsFrom` 引用一致
- 若 run 无 `discovery-result.json`（旧 run 或旧 attempt），runtime 回退到传统解析：依次尝试 `accepted-result.md`、`worker-output-001.md`、以及其中引用的 run-scoped 文件路径。legacy fallback 纯为向后兼容，新 run 一律走标准化路径
- `accepted-result.md` 仍是人类可读结果（checker/watcher 产出），不再是 `for_each` 的主数据源

#### Output Contract Validation (P26)

`TeamOutputValidationResult` 是 runtime 生成的确定性证据，不由 LLM 自评产生。结构包含 `ok`、`kind`、`sourceRef`、`normalizedRef` 和逐项 `checks[]`。

支持的 `outputCheck`：

```json
{ "type": "json_items", "outputKey": "vendors", "allowDirectArray": false, "requiredFields": ["id"] }
{ "type": "json_object", "requiredFields": ["summary"] }
{ "type": "html_fragment", "requiredSubstrings": ["vendor-card"], "forbiddenTags": ["html", "body"], "requireFence": false }
{ "type": "file_exists", "path": "worker/report.html" }
```

- `discovery` 会自动派生 `json_items` 校验，`outputKey` 来自 `discovery.outputKey`，并强制 `requiredFields=["id"]`
- 普通 task 可显式声明 `task.outputCheck`
- `forEach.taskTemplate.outputCheck` 会随生成子任务持久化到 expansion record；占位符如 `{{item.id}}` 会在展开时替换，resume/reclaim 使用持久化后的 child task 定义
- checker prompt 会收到 `outputValidation` evidence；当 `ok=false` 时不得输出 `verdict="pass"`
- watcher prompt 也会收到同一 evidence；当 `ok=false` 时不得输出 `decision="accept_task"`
- runtime 在 checker pass 后仍会重新校验 checker `resultContent` 和 worker output；两者都无效时直接失败，checker/watcher 无法用自然语言“通过”绕过协议
- run-scoped 引用只允许当前 run / attempt 范围内的文件：`worker/...`、`checker/...`、`watcher/...`、`output/...`、`work/...`、`runs/<runId>/...`、`/app/.data/team/runs/<runId>/...`
- 明确拒绝越界路径和主机绝对路径，例如 `worker/../../.env`、`/etc/passwd`、`C:/...`
- P26 incident `run_943b995d6adc` 的失败形状已回归覆盖：checker 只写“JSON 数据文件：worker/hk-cloud-server-scan.json（...）”时，runtime 能安全解析 role workspace 相对引用；文件缺失或缺少 `vendors` 数组时会在展开 `for_each` 前失败

#### for_each 任务

```json
{
  "id": "process_each",
  "type": "for_each",
  "title": "Process each item",
  "input": { "text": "Placeholder" },
  "acceptance": { "rules": ["ok"] },
  "forEach": {
    "itemsFrom": "discover.items",
    "mode": "sequential",
    "taskTemplate": {
      "title": "Process {{item.title}}",
      "input": { "text": "Process item {{item.id}}" },
      "acceptance": { "rules": ["output valid for {{item.id}}"] }
    }
  }
}
```

- `forEach.itemsFrom`（必填）— dot-path 格式 `{upstreamTaskId}.{outputKey}`
- `forEach.mode`（必填）— 支持 `"sequential"` 或 `"parallel"`
- `forEach.taskTemplate`（必填）— 子任务模板，支持以下占位符：
  - `{{item.<field>}}` — 任意 top-level item 字段；对象/数组 JSON-stringified；null/缺失为空字符串
  - `{{item}}` — 完整 item JSON
  - `{{run.id}}`、`{{plan.id}}`、`{{parentTask.id}}` — run-scoped 变量
  - `{{task.outputDir}}` — run-scoped 输出目录（`.data/team/runs/<runId>/generated/<parentTaskId>`）
- 每个 item 必须有稳定的非空字符串 `id` 字段
- 子任务 ID 格式：`{parentTaskId}__{sanitizedItemId}`

#### for_each parallel mode

`forEach.mode = "parallel"` 时，子任务并发执行：

- 固定容量池（`PARALLEL_FOR_EACH_CONCURRENCY = 3`），child 完成即补位，不是批处理模式
- `forEach.taskTemplate.decomposer.mode` 为 `"leaf"` 或 `"propagate"` 时在 Plan 创建/更新时被拒绝——parallel child 不允许进一步拆分。`decomposer.mode = "none"` 或无 decomposer 字段时允许（不会触发拆分）
- 并发 child 使用 scoped `ParallelChildStateWriter`（实现 `TeamStateWriter` 接口），通过 `patchState` 隔离写入；sequential child 继续使用普通 `saveState`
- parent 状态由子任务聚合：
  - 至少一个 child succeeded → parent `succeeded`（partial success）
  - 全部 child skipped → parent `skipped`
  - 其他情况（全 failed / mixed failed+skipped）→ parent `failed`
- 0 个 item 时与 sequential 相同，parent 直接 `succeeded`
- pause：所有 running 子任务标记为 `interrupted`，新子任务不再入池
- cancel：所有未完成子任务标记为 `cancelled`
- resume：`interrupted` 子任务重置为 `pending`，等待 worker 接管后重新执行
- rerun：`force_rerun` 子任务重新执行；`skip` 子任务保持 skipped；expansion record 复用不重复生成

#### for_each sequential mode

`forEach.mode = "sequential"`（默认）时，子任务按顺序逐个执行，与既有行为完全一致。

- 扩展记录持久化在 `runs/<runId>/expansions/<parentTaskId>.json`
- 扩展记录包含完整子任务定义（`task` 字段），确保 resume/reclaim 后子任务 input/acceptance 不漂移
- 旧格式记录（无 `task` 字段）仍可读取，fallback 为 title-based input
- 幂等扩展：pause/resume 不会重复生成子任务
- `for_each` 父任务状态由子任务结果推导：全部成功→succeeded，有失败→failed
- 0 个 item 时，`for_each` 直接标记为 succeeded

#### for_each 子任务 item 身份隔离 (P23)

Discovery 任务可以看到完整的 item 列表——它的职责是找到这个列表。`for_each` 展开后，每个生成的子任务**只能绑定一个 source item**。

- 每个生成的子任务携带 `sourceItem` 快照（`{ id, data }`），包含完整的 discovery item 副本
- 扩展记录（expansion JSON）中持久化 `sourceItem`，resume/reclaim 使用存储的快照，不会从可能已变化的 discovery 结果重新渲染
- Worker/checker/watcher 的 prompt 中注入**权威 source item 身份块**，明确声明当前 item 的 `id` 和 `title`/`name`/`label`
- Prompt 指令：任何参考资料、历史文件、全局清单、编号表如果与当前 item 冲突，必须以当前 item 为准
- Checker prompt 要求：如果 worker 输出处理了错误的 item（与 source item 不匹配），verdict 必须为 `fail`
- Watcher prompt 包含任务描述（`task.input.text`），不得认可切换了 item 的结果
- 自动追加的 acceptance rules 包含 item identity 约束（基于 `item.id` 和 display field）
- 旧扩展记录（无 `sourceItem`）仍兼容，fallback 使用已有的 `sourceItemId` 和存储的 `task`

**典型 incident**：如果 `item.id=battle_08` 且 `item.title=藏经阁大战`，worker 读到一份共享评分表说 `8=雁门关外自尽`，worker 不得将任务主体切换到"雁门关外自尽"。Checker 必须拒绝这种输出。

#### 实现组件

| 文件 | 职责 |
|------|------|
| `src/team/task-expansion-planner.ts` | `TaskExpansionPlanner` 接口和 `TemplateTaskExpansionPlanner` 模板实现 |
| `src/team/child-execution.ts` | `for_each` expanded child 的 sequential / parallel 执行拓扑、固定并发池、child state writer 和 parent 聚合 |
| `src/team/task-attempt-runner.ts` | 单个 task attempt 的 worker -> checker -> watcher 生命周期：attempt 创建、phase transition、retry、output validation、accepted/failed result 写入 |
| `src/team/run-workspace.ts` | Run workspace facade，保持既有调用入口并委托 state / attempt / artifact / record stores |
| `src/team/run-workspace-state.ts` | run state、admission、lease、`patchState` 和 state event 通知 |
| `src/team/run-workspace-attempts.ts` | attempt metadata、worker/checker/watcher 文件、discovery-result 和 role workspace 文件读取 |
| `src/team/run-workspace-artifacts.ts` | final report 与 run-scoped 文件读取 |
| `src/team/run-workspace-records.ts` | expansion / decomposition records，以及 generated child task state append |
| `src/team/orchestrator.ts` | 按 task type 分发执行：normal / discovery / for_each；处理 controlled decomposition；组合 `TaskExpansionPlanner`、child execution module 和 task attempt runner |

#### Plan 验证

- Plan schema policy 集中在 `src/team/plan-validation.ts`；`PlanStore` 只负责调用验证入口、持久化 Plan 和维护 `runCount` 不变式
- `PlanStore.create()` 调用 `validateCreatePlanInput()`；`PlanStore.updateEditablePlan()` 在 `runCount=0` 且 patch 包含 `tasks` 时调用 `validatePlanTasks()`
- 未知 `task.type` 被拒绝（只允许 `normal`、`discovery`、`for_each`）
- 未知 `task.decomposer.mode` 被拒绝（只允许 `none`、`leaf`、`propagate`）
- `task.decomposer.maxChildren` 和 `forEach.taskTemplate.decomposer.maxChildren` 必须是 `1..20` 的整数
- `forEach.mode = "parallel"` + `forEach.taskTemplate.decomposer.mode` 为 `"leaf"` 或 `"propagate"` 时在 Plan 创建/更新时被拒绝。`decomposer.mode = "none"` 或无 decomposer 字段时允许
- `task.outputCheck` 和 `forEach.taskTemplate.outputCheck` 使用同一套 schema 校验；旧 plan 缺失该字段时继续兼容
- `PATCH /v1/team/plans/:planId` 在 `runCount=0` 时验证新 tasks
- 旧无 type 计划仍兼容（默认 `normal`）

#### 扩展策略注入

- `TeamOrchestratorOptions.taskExpansionPlanner?: TaskExpansionPlanner`
- 构造函数默认使用 `TemplateTaskExpansionPlanner`
- 自定义实现可通过选项注入

### Run

一次 Plan 的执行实例。生命周期：

```
queued → running → completed / completed_with_failures / failed / cancelled
                     ↑              ↓
                   paused ←─────────┘（可 resume）
```

关键字段：

- `runId` — 唯一标识
- `planId` — 关联 Plan
- `teamUnitId` — 关联 TeamUnit
- `status` — 当前状态
- `currentTaskId` — 当前正在执行的 task
- `taskStates{}` — 每个 task 的执行状态
- `summary` — { totalTasks, succeededTasks, failedTasks, cancelledTasks }
- `activeElapsedMs` — 累计活跃时间（毫秒）
- `lastError` — 最近错误
- `pauseReason` — 暂停原因
- `finalizerRuntimeContext` — finalizer session 的实际 profile/browser 解析结果；旧 state 可能缺失该字段

### Task State

每个 task 在 run 中的执行状态：

- `status` — pending / running / interrupted / succeeded / failed / cancelled
- `attemptCount` — 已尝试次数
- `activeAttemptId` — 当前 attempt
- `resultRef` — 结果文件引用（run 相对路径）
- `errorSummary` — 错误摘要
- `progress` — { phase, message, updatedAt }

### Attempt

一次 worker + checker + watcher 的完整循环。watcher 可请求 revision，触发新 attempt。

#### Attempt Lifecycle Metadata

每个 attempt 维护结构化生命周期元数据（`TeamAttemptMetadata`）：

- `phase` — 当前生命周期阶段：`created → worker_running → worker_completed → checker_reviewing → checker_passed/checker_revising/checker_failed → watcher_reviewing → watcher_accepted/watcher_revision_requested/watcher_confirmed_failed → succeeded/failed/interrupted/cancelled`
- `worker[]` — worker 输出摘要数组，每次 worker 执行追加一条 `{ outputRef, outputIndex, runtimeContext? }`
- `checker[]` — checker 评审摘要数组，每次 checker 评审追加一条 `{ verdict, reason, feedback, revisionIndex, recordRef, feedbackRef, runtimeContext? }`
- `watcher` — watcher 评审摘要（单条，后写覆盖），`{ decision, reason, revisionMode, feedback, recordRef, runtimeContext? }`
- `resultRef` — 最终结果文件引用
- `errorSummary` — 错误摘要
- `finishedAt` — 完成时间

`runtimeContext` 记录角色 session 的实际解析结果：`requestedProfileId`、`resolvedProfileId`、`fallbackUsed`、`fallbackReason`、`browserId`、`browserScope`。旧 attempt 不含该字段时仍可正常读取。

#### checker revise vs watcher request_revision

- **checker revise**：同一个 attempt 内 worker 重新执行。checker 每次评审结果追加到 `checker[]`，worker 输出追加到 `worker[]`。attempt 不变。
- **watcher request_revision**：当前 attempt 结束（status=`interrupted`，phase=`watcher_revision_requested`），创建新 attempt 从头开始。旧 attempt 的 watcher summary 记录在 `watcher` 字段。

#### Attempt 终态

- `succeeded` — checker pass + watcher accept_task
- `failed` — checker fail / checker revision limit / watcher confirm_failed / worker timeout / checker timeout / watcher revision limit
- `interrupted` — watcher request_revision / run paused
- `cancelled` — run cancelled

#### 旧 attempt.json 兼容

缺少 lifecycle 字段的旧 `attempt.json` 通过 `normalizeAttempt()` 补默认值：`phase` 从 `status` 推导，`worker`/`checker` 为空数组，`watcher` 为 null。API 不会 500。

### resultRef

run 内相对路径，指向 accepted 或 failed 结果文件。格式如 `tasks/task_1/attempts/attempt_xxx/accepted-result.md`。finalizer 会读取 resultRef 文件内容来生成报告。

## API

### TeamUnit API

| 方法 | 路径 | 语义 |
|------|------|------|
| GET | `/v1/team/team-units` | 列出所有 TeamUnit |
| POST | `/v1/team/team-units` | 创建 TeamUnit；4 个 AgentProfile 必须存在 |
| GET | `/v1/team/team-units/:teamUnitId` | 查看 TeamUnit |
| PATCH | `/v1/team/team-units/:teamUnitId` | 修改未归档、未被活跃 run 锁住的 TeamUnit |
| POST | `/v1/team/team-units/:teamUnitId/archive` | 归档未被活跃 run 锁住的 TeamUnit |
| DELETE | `/v1/team/team-units/:teamUnitId` | 删除未被活跃 run 锁住的 TeamUnit |

### Task API

| 方法 | 路径 | 语义 |
|------|------|------|
| GET | `/v1/team/tasks` | 列出未归档 Task；`?includeArchived=1` 可包含归档记录 |
| POST | `/v1/team/tasks` | 创建 Task draft；必须包含 `leaderAgentId` 和完整 `workUnit` |
| GET | `/v1/team/tasks/:taskId` | 查看单个 Task |
| PATCH | `/v1/team/tasks/:taskId` | 更新未归档 Task draft 的 `title`、`leaderAgentId`、`workUnit` 或 `status`；不允许修改 locked Task 的 `workUnit` |
| POST | `/v1/team/tasks/:taskId/archive` | 软归档 Task |
| GET | `/v1/team/tasks/:taskId/runs` | 列出某个 Canvas Task 的独立 Task run |
| POST | `/v1/team/tasks/:taskId/runs` | 启动某个 ready Canvas Task 的 worker → checker run |
| GET | `/v1/team/task-runs/:runId` | 读取独立 Task run 状态 |
| POST | `/v1/team/task-runs/:runId/cancel` | 取消 active Task run |
| GET | `/v1/team/task-runs/:runId/tasks/:taskId/attempts` | 读取 Task run 的 attempt metadata，包含可选 `roleProcesses.worker` / `roleProcesses.checker` |
| GET | `/v1/team/task-runs/:runId/tasks/:taskId/attempts/:attemptId/files/:fileName` | 读取 Task run 的 attempt 文件 |

`POST /v1/team/tasks` 仍只创建 Task draft，不会创建 Plan，也不会自动启动 worker/checker。Task run 必须显式调用 `POST /v1/team/tasks/:taskId/runs`；Task run 存在 `.data/team/task-runs`，不进入 Plan run API，也不受 `TEAM_MAX_CONCURRENT_RUNS` 约束。同一 Task active guard 仍由 Canvas Task run service 自己按 `taskId` 执行。

### Plan API

| 方法 | 路径 | 语义 |
|------|------|------|
| GET | `/v1/team/plan-templates` | 列出 Plan draft 模板 registry（含 supported / planned 状态） |
| POST | `/v1/team/plan-drafts` | 根据自然语言目标生成可检查的 Plan create payload；不持久化 Plan，不创建 Run |
| GET | `/v1/team/plans` | 列出 Plans |
| POST | `/v1/team/plans` | 创建 Plan；`defaultTeamUnitId` 必须存在且未归档 |
| GET | `/v1/team/plans/:planId` | 查看 Plan |
| PATCH | `/v1/team/plans/:planId` | 修改未归档 Plan；已有 run 后任务主体不可改 |
| PATCH | `/v1/team/plans/:planId/default-team` | 切换默认 TeamUnit |
| POST | `/v1/team/plans/:planId/archive` | 归档未被活跃 run 锁住的 Plan |
| DELETE | `/v1/team/plans/:planId` | 删除 Plan；已有 run 保留在 run workspace，不因 plan 删除而 500 |

### Run API

| 方法 | 路径 | 语义 |
|------|------|------|
| POST | `/v1/team/plans/:planId/runs` | 创建 queued run；不内联执行 |
| GET | `/v1/team/runs` | 列出所有 run states |
| GET | `/v1/team/runs/:runId` | 查看 run state（含所有 taskStates） |
| POST | `/v1/team/runs/:runId/pause` | 暂停 running run；触发 AbortSignal |
| POST | `/v1/team/runs/:runId/resume` | 恢复 paused run 为 queued |
| POST | `/v1/team/runs/:runId/cancel` | 取消 run；触发 AbortSignal |
| DELETE | `/v1/team/runs/:runId` | 删除 terminal run |
| PATCH | `/v1/team/runs/:runId/tasks/:taskId/manual-disposition` | 设置单任务 rerun disposition |
| PATCH | `/v1/team/runs/:runId/tasks/manual-dispositions` | 批量设置任务 rerun disposition |
| POST | `/v1/team/runs/:runId/rerun` | 按任务标记重开 terminal run |

### final-report API

| 方法 | 路径 | 语义 |
|------|------|------|
| GET | `/v1/team/runs/:runId/final-report` | 读取 final-report.md（text/markdown） |

final report 优先由 finalizer agent 生成。若 finalizer 失败，orchestrator 会写入 deterministic fallback report，并把 run 标记为 `completed_with_failures`；只有 run 尚未完成或报告文件不存在时返回 404。

### SSE 事件流

| 方法 | 路径 | 语义 |
|------|------|------|
| GET | `/v1/team/runs/:runId/events` | SSE 端点，推送 run state snapshot |

- Content-Type: `text/event-stream`
- 连接建立后立即发送当前 state snapshot（`{ type: "snapshot", data: <TeamRunState> }`）
- 对于 active run（queued/running/paused），服务端优先通过 `RunStateEvents` 订阅同进程 `saveState()` 通知，状态变更后立即推送 snapshot；同时保留 1 秒 change-detect fallback 读取磁盘 state，覆盖独立 worker 进程写入的状态变更
- `saveState()` 使用 run-scoped `.state.lock` 串行化 `state.json` 写入，并为每次写入使用唯一 temp 文件；`getState()` 会短暂重试 transient 读取失败，避免 Windows rename 窗口或 heartbeat/progress/control 并发写入被误判为 run 丢失
- run 进入 terminal 状态后发送最终 snapshot 并关闭连接
- 15 秒 SSE heartbeat 保持连接活跃
- 客户端断开自动清理 subscription 和 heartbeat

### Attempt 只读 API

| 方法 | 路径 | 语义 |
|------|------|------|
| GET | `/v1/team/runs/:runId/tasks/:taskId/attempts` | 列出 task 的所有 attempts |
| GET | `/v1/team/runs/:runId/tasks/:taskId/attempts/:attemptId/files/:fileName` | 读取 attempt 文件 |

- `listAttempts` 返回每个 attempt 的完整 `TeamAttemptMetadata`（`attemptId`、`status`、`phase`、`worker[]`、`checker[]`、`watcher`、`resultRef`、`errorSummary`、`finishedAt`、`updatedAt`）以及 `files[]`
- `readAttemptFile` 只允许安全文件名（`[a-zA-Z0-9._-]`），路径不能逃逸 run 目录
- 缺失的 run/task/file 返回 404；非法文件名返回 400

## Run Rerun 与 Manual Task Control (P24)

### Rerun vs Pause/Resume

| | Pause/Resume | Rerun |
|---|---|---|
| 触发时机 | run 正在执行（running） | run 已结束（completed/failed/completed_with_failures） |
| 状态变化 | running → paused → queued | terminal → queued |
| 任务状态 | 保持不变 | 按 disposition 决策表重置 |
| run ID | 不变 | 不变（不创建新 run） |
| plan.runCount | 不变 | 不变（不递增） |
| active elapsed timer | 保留累计活跃时间 | 清零，重新计算本次执行窗口 |
| final report | 保留 | 清除旧的 final-report.md |

### Manual Disposition

每个 task 可以设置 `manualDisposition`，影响 rerun 时的行为：

| Disposition | 含义 | Rerun 行为 |
|---|---|---|
| `default` | 无覆盖 | succeeded → 复用结果；其他状态 → 重新执行 |
| `skip` | 跳过 | 无论之前什么状态，不执行，标记为 skipped |
| `force_rerun` | 强制重跑 | 无论之前什么状态，重新执行；成功后自动清除标记回 `default` |

### 决策表

`shouldExecuteOnRerun(taskState)` 的完整决策：

| manualDisposition | taskStatus | 结果 |
|---|---|---|
| default | succeeded | 复用（不执行） |
| default | pending | 执行 |
| default | failed | 执行 |
| default | interrupted | 执行 |
| default | cancelled | 执行 |
| default | skipped | 执行 |
| skip | *任何状态* | 不执行，标记 skipped |
| force_rerun | *任何状态* | 执行；成功后标记自动清除回 `default` |

### force_rerun 自动清除

当一个 task 的 `manualDisposition === "force_rerun"` 在 rerun 中执行并最终 `status === "succeeded"`，该标记自动清除为 `"default"`。这避免用户陷入"成功修复的任务反复重跑"的循环。

- 不清除的情况：task 结果为 `failed`、`cancelled`、`interrupted`、`pending`、`running` 或 `skipped`
- `skip` 标记不自动清除
- 适用于所有 task 类型：normal、generated `for_each` child、decomposed child、parent/container task
- 清除时机：run 进入终端状态时（正常完成、completed_with_failures、failed、timeout），针对每个 task 的实际结果独立判断，不受整体 run 状态影响

### Expanded Task 行为

- **parent 标 skip**：无论 `for_each` 还是 `decomposer` parent，所有子任务标记为 `skipped`（包括之前 succeeded/failed/pending/cancelled 的子任务），worker 和 decomposer 均不被调用。子任务 `errorSummary` 置 null，`resultRef` 保留可审计
- **summary 重算**：`skipGeneratedChildren` 调用 `recomputeSummary` 从全量 taskStates 重新计数，不依赖 `++`，避免重复计数
- **子任务标 skip**：仅该子任务跳过，不影响兄弟任务；parent 聚合时按 all-skipped → skipped、any-failed → failed、otherwise → succeeded 规则判断
- **Expansion/decomposition record**：rerun 复用已有记录，不重复生成子任务

### API 端点

- `PATCH /v1/team/runs/:runId/tasks/:taskId/manual-disposition` — 单任务 disposition，body: `{ disposition: "skip" | "force_rerun" | "default" }`
- `PATCH /v1/team/runs/:runId/tasks/manual-dispositions` — 批量 disposition，body: `{ updates: [{ taskId, disposition }] }`。原子操作：任一无效则全部拒绝
- `POST /v1/team/runs/:runId/rerun` — 重开 terminal run。active/cancelled run 返回 409

所有 disposition API 拒绝 active run（queued/running/paused）。

## 执行链路

### HTTP 只入队

`POST /v1/team/plans/:planId/runs` 只创建 `queued` run 并返回 state，不执行任何工作。HTTP 路由不做 inline 执行。

### ugk-pi-team-worker 接管

独立 Node 进程 `src/workers/team-worker.ts`，通过 `npm run worker:team` 启动。每 3 秒轮询 runnable run，通过 run lease 原子 claim 后调用 `TeamOrchestrator.runToCompletion()` 执行。

worker 会为每个 claim 到的 run 写入 `state.lease`：

- `ownerId`：当前 worker 实例 ID，默认由进程号 + 时间戳生成；可用 `TEAM_WORKER_ID` 覆盖。
- `acquiredAt`：lease 获取时间。
- `heartbeatAt`：最近一次 heartbeat。
- `expiresAt`：lease 过期时间。

只有 `queued` run 或 `running` 且 lease 过期的 run 可被 claim。claim 使用 run 目录下的临时 lock 目录做原子互斥，避免多个 worker 同时抢同一个 run。worker 执行期间定期 heartbeat；如果 heartbeat 发现 lease 已被其他 worker 接走，会 abort 当前 run。orchestrator 在 phase 写回前也会校验 lease owner，防止旧 worker 迟到写回。

跨进程取消机制：worker 内部 watcher 每 2 秒检测 run state 变化，发现外部 cancel/pause 后触发 `AbortController.abort()`，信号经 orchestrator 传到 agent session。

P10 已补齐独立 worker 的真实 runner 接线：`src/workers/team-worker.ts` 与 HTTP route 使用同一套 browser binding lifecycle。生产 worker 在 `TEAM_USE_MOCK_RUNNER=false` 时会把 canonical scope 贯穿 `setBrowserScopeRoute()`、session factory、scoped agent env、`closeBrowserTargetsForScope()` 和 route 清理。注意：Team run 的实际执行者是独立 worker，不是 HTTP route；后续改真实 runner 接线必须同时覆盖 worker 入口。

多 worker 运维口径：

- 单个 worker 进程一次只 claim 并执行一个 run。
- 需要并发执行多个 Plan / TeamOrchestrator run 时，先把 `TEAM_MAX_CONCURRENT_RUNS` 设为大于 1，再启动多个 `ugk-pi-team-worker` 实例；Canvas Task run 不使用这个全局 admission。
- 本地 compose 可用 `docker compose up -d --scale ugk-pi-team-worker=2` 扩容；生产 compose 同理，但必须确认共享的 `TEAM_DATA_DIR` 是同一个持久目录。
- 多 worker 扩容时不要在共享 `.env` 里写死同一个 `TEAM_WORKER_ID`；默认自动生成 ID 更安全。只有单 worker 排障时才建议手动指定 `TEAM_WORKER_ID`。
- worker 崩溃后，其他 worker 会在 `TEAM_WORKER_LEASE_TTL_MS` 到期后 reclaim `running` run；TTL 不要设得比真实 phase timeout 还激进，否则慢任务会被误抢。

### worker → checker → watcher

每个 task 的执行流程：

```
┌─ WorkUnit Loop ──────────────────────────────────┐
│                                                    │
│  worker: 执行 task，产出内容                        │
│     ↓                                              │
│  checker: 评审 worker 输出                          │
│     ├─ pass → accepted，写 accepted-result.md      │
│     ├─ revise → 带 feedback 重新跑 worker（max 3）  │
│     └─ fail → 写 failed-result.md                  │
│                                                    │
└────────────────────────────────────────────────────┘
     ↓
  watcher: post-task review
     ├─ accept_task → task 成功或失败（由 WorkUnit 结果决定）
     ├─ confirm_failed → task 失败
     └─ request_revision → 新 attempt，重新进 WorkUnit Loop（max 1）
```

### finalizer

所有 task 完成后运行。读取每个 task 的 `resultRef` 文件内容，传入 finalizer prompt，生成中文 Markdown 汇总报告写入 `final-report.md`。

#### P25: 权威运行汇总

Finalizer prompt 包含来自 `TeamRunState.summary` 的权威运行汇总（totalTasks / succeededTasks / failedTasks / cancelledTasks / skippedTasks）。finalizer 被指示不得重新计算或改写这些计数，报告中引用任务计数时必须使用权威数据。

#### P25: Skipped 任务语义

- `skipped` 是独立于 `failed` 的状态。当前 `errorSummary` 为 null（不携带旧错误）。
- 跳过前的原始错误持久化在 `TeamTaskState.previousErrorSummary` 中，作为审计上下文传入 finalizer prompt，标记为历史/审计数据，不得作为当前失败。旧 persisted state 无此字段时兼容加载。
- 重新执行（非 skip）的任务清除 `previousErrorSummary`。
- `completed` + `skippedTasks > 0` + `failedTasks === 0` 的 run 是合法终态。
- Fallback report 遍历 `state.taskStates`（含 generated/decomposed 子任务），不限于 `plan.tasks`。summary 来自 `TeamRunState.summary`，detail 中 skipped 任务显示"跳过"并附上 `previousErrorSummary`（如有）。

#### P25: Succeeded-but-limited 汇总口径

如果某个 `succeeded` 任务的产出提到外部数据源限制（如 API 需要登录、只有部分数据可用），finalizer 应将其列入"限制与警告"部分，但必须归入"已完成"区域。只有运行时状态为 `failed` 或 `cancelled` 的任务才能出现在"失败/未完成"部分。

### pause / resume / cancel

- **pause**：写入 `paused` 状态 + 触发 `AbortController.abort()`，当前 phase 被中断。所有 running task（含 parallel 子任务）标记为 `interrupted`。resume 后从下一个未完成的 task 继续；`interrupted` 子任务重置为 `pending` 重新执行。
- **cancel**：写入 `cancelled` 状态 + 触发 abort。所有未完成 task（含 parallel 子任务）标记为 `cancelled`。terminal 状态不可逆。
- **resume**：将 `paused` run 恢复为 `queued`，等待 worker 接管。跳过已 succeeded/failed/cancelled 的 task。`interrupted` task 重置为 `pending` 重新入队。
- **stale-write protection**：`ParallelChildStateWriter` 内 guard 检查 `latest.status !== "running"` 和 task terminal/interrupted 状态，防止 pause/cancel 后的迟到子任务覆盖已中断/取消状态。

关键安全机制：每个 phase（worker/checker/watcher/finalizer）返回后，orchestrator 重新从磁盘读取 state。如果状态已变为 cancelled 或 paused，立即停止写回，不会覆盖 terminal state。

## AgentProfile runner

### TEAM_USE_MOCK_RUNNER=true（默认）

使用 `MockRoleRunner`，不调用真实模型。worker 返回固定文本，checker 默认 pass，watcher 默认 accept，finalizer 返回简单报告。用于开发和测试。

### TEAM_USE_MOCK_RUNNER=false（真实 runner）

使用 `AgentProfileRoleRunner`，通过 `BackgroundAgentSessionFactory` 创建真实 AgentProfile session。每个角色按 TeamUnit 绑定的 AgentProfile 解析模型、skills、规则文件。

`AgentProfileRoleRunner` 通过 `BackgroundAgentProfileResolver` → `AgentTemplateRegistry` → playground profile lookup 解析 profile。profile 不存在时 fallback 到 `main`。

### Profile-aware browser binding

每个角色 session 的 browser ID 优先级：

1. `snapshot.defaultBrowserId`（resolved AgentProfile 携带的浏览器绑定）
2. `options.defaultBrowserId`（构造时传入的 fallback）
3. `undefined`（无浏览器绑定）

Browser scope 先按 `team:<runId>:<role>:<roleKey>:<profileId>` 构建 role/attempt 身份，再与 browser ID 收口为 canonical cleanup scope。该 canonical scope 会贯穿：

- `setBrowserScopeRoute(scope, browserId)`
- `ProjectBackgroundSessionFactory.createSession({ browserScope: scope })`
- `runWithScopedAgentEnvironment(scope, ...)`
- `closeBrowserTargetsForScope(scope, { browserId })`
- `runtimeContext.browserScope`

worker/checker/watcher 的 attempt 元数据会记录 `runtimeContext`，用于排查 profile fallback、实际 browser ID 和 browser scope。finalizer 的 runtime context 写入 run state 的 `finalizerRuntimeContext`。

P9 对齐了 Team 与 chat agent / conn worker 已有的 browser binding 链路。Team 不创建新的浏览器资源系统，不调度 Chrome profile，也不改变 sidecar 拓扑；browser ID 到真实 CDP/Chrome profile 的映射仍由既有 browser registry / env 配置决定。

`orchestrator` 通过 `ProfileAwareTeamRoleRunner` 接口（`src/team/role-runner.ts`）在执行前注入 TeamUnit 的 profile IDs，不再依赖 class cast。`MockRoleRunner` 不实现该接口，保持兼容。

P8-E 已补齐端到端审计覆盖：finalizer 失败、取消、超时路径会保持 `finalizerRuntimeContext: null`；`GET /v1/team/runs/:runId` 会原样返回已持久化的 finalizer runtime context；Team UI 对 worker/checker/watcher/finalizer runtime context 的动态值执行 HTML 转义。

### Decomposer runner（P21-B）

`TeamRoleRunner` 现在包含 `runDecomposer(input)`：

- 输入包含 `runId`、完整 `plan`、当前 `task`、`maxChildren` 和可选 `AbortSignal`
- 输出为 `{ decision: "split" | "no_split", reason, children?, runtimeContext? }`
- `MockRoleRunner` 默认返回 `no_split`
- `AgentProfileRoleRunner` 使用 TeamUnit 的 `decomposerProfileId` 解析 AgentProfile，并用 `decomposer` role scope 建立 session / browser binding / cleanup
- 真实 runner prompt 要求只输出 JSON；解析失败或 schema 不合法时安全返回 `no_split`，并保留 `runtimeContext`
- P21-C 起 orchestrator 会在可拆 task 执行 worker 前调用 `runDecomposer()`

### Decomposition record（P21-B）

`RunWorkspace` 支持把拆分决策持久化到：

```text
runs/<runId>/decompositions/<encodeURIComponent(parentTaskId)>.json
```

记录 schema：

```ts
interface TaskDecompositionRecord {
  schemaVersion: "team/task-decomposition-1";
  parentTaskId: string;
  mode: "leaf" | "propagate";
  decision: "split" | "no_split";
  reason: string;
  decomposedAt: string;
  children: Array<{ taskId: string; title: string; task: TeamTask }>;
  runtimeContext?: TeamRoleRuntimeContext;
}
```

记录必须保留完整 child `TeamTask` 定义，确保 resume/reclaim 不会丢失 child input/acceptance/decomposer 策略。旧 run 没有 `decompositions/` 目录时 `readDecomposition()` 返回 `null`，不影响 state/attempt 读取。

### resultRef 和 finalizer prompt

`runFinalizer()` 调用 `readRefContent()` 读取每个 task 的 `resultRef` 文件内容，传入 `buildFinalizerPrompt()`。文件不存在时 fallback 为 ref 字符串。

### JSON 解析

checker、watcher 和 decomposer 输出 JSON。`parseJsonResponse` 使用三层提取：

1. 快速路径：strip fence markers + `JSON.parse`
2. fenced block regex：` ```json ... ``` `
3. balanced braces：从第一个 `{` 到匹配的 `}`

解析失败时 checker 默认 `fail`，watcher 默认 `confirm_failed`，decomposer 默认 `no_split`。

## 锁机制

活跃 run（状态为 `queued`、`running`、`paused`）会锁住关联资源：

- **Plan**：锁住期间不允许归档；删除已与 run 关联的 Plan 会移除 Plan 记录，run 数据保留不丢失
- **TeamUnit**：锁住期间不允许修改、归档或删除
- **AgentProfile**：锁住 TeamUnit 中五个 AgentProfile（含 decomposer），不允许编辑、归档、安装/删除/启停技能或修改规则文件

锁计算由 `computeTeamConfigLocks()` 在路由层执行。违反锁的写操作返回 409 Conflict。

## Docker / 环境变量

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `TEAM_RUNTIME_ENABLED` | 无（false） | 必须设为 `"true"` 才注册路由和启动 worker |
| `TEAM_USE_MOCK_RUNNER` | `true` | mock runner；真实 runner 需显式设 `"false"` |
| `TEAM_DATA_DIR` | `.data/team` | Team 数据目录 |
| `TEAM_WORKER_POLL_INTERVAL_MS` | 3000 | worker 轮询间隔 |
| `TEAM_WORKER_LEASE_TTL_MS` | 60000 | run lease 过期时间；worker 崩溃超过该时间后可被其他 worker 接走 |
| `TEAM_WORKER_HEARTBEAT_INTERVAL_MS` | 10000 | worker heartbeat 间隔；实际值会被限制在 lease TTL 的一半以内 |
| `TEAM_MAX_CONCURRENT_RUNS` | 1 | Plan / TeamOrchestrator 最大并发 active run 数（queued/running/paused）；通过原子 admission lock 执行；多个 worker 进程可通过 lease 机制 claim 不同的 queued run；不约束 Canvas Task run |
| `TEAM_WORKER_ID` | 自动生成 | 单 worker 排障时可覆盖；多 worker 扩容时不要在共享 `.env` 中写死同一个值 |
| `TEAM_WORKER_PHASE_TIMEOUT_MS` | 900000 | Worker phase 超时（默认 15 分钟） |
| `TEAM_CHECKER_PHASE_TIMEOUT_MS` | 300000 | Checker phase 超时（默认 5 分钟） |
| `TEAM_WATCHER_PHASE_TIMEOUT_MS` | 300000 | Watcher phase 超时（默认 5 分钟） |
| `TEAM_FINALIZER_PHASE_TIMEOUT_MS` | 300000 | Finalizer phase 超时（默认 5 分钟） |
| `TEAM_MAX_RUN_DURATION_MINUTES` | 100 | Run 最大持续时间（分钟）；可 per-run override |

Docker Compose 默认设置：

- `docker-compose.yml`：`TEAM_USE_MOCK_RUNNER=true`，`TEAM_RUNTIME_ENABLED=true`
- `docker-compose.yml`：`ugk-pi-team-console` 固定暴露 `127.0.0.1:5174`，通过 `TEAM_CONSOLE_API_TARGET=http://ugk-pi:3000` 代理到真实后端 `ugk-pi:3000`
- `docker-compose.prod.yml`：同上 + `ugk-pi-team-worker` 独立容器 + Team 数据挂载

## 本地验证命令

```bash
# 跑 Team 模块测试（串行，避免 SQLite 锁）
npm run test:team

# 跑单个测试文件
node --test --import tsx test/team-orchestrator-controls.test.ts
node --test --test-concurrency=1 --import tsx test/team-worker.test.ts

# 类型检查
npx tsc --noEmit

# 全量测试
npm test

# Docker 启动
docker compose up -d
docker compose up -d ugk-pi ugk-pi-team-console  # 只启动后端 + Team Console 固定入口
docker compose restart ugk-pi      # 代码改动后
docker compose restart ugk-pi-team-worker  # worker 改动后
docker compose up -d --scale ugk-pi-team-worker=2  # 多 worker 验证
```

## 真实 runner smoke test 记录

**2026-05-16** — P0 真实 runner 端到端验收

- runId: `run_1c54aaa7e442`
- status: `completed`
- task_1: `succeeded`
- resultRef: `tasks/task_1/attempts/attempt_d7211b0ad1b2/accepted-result.md`
- marker: `P0_REAL_RUNNER_OK`
- final report: 已生成，包含 `P0_REAL_RUNNER_OK`
- `TEAM_USE_MOCK_RUNNER=false`
- 四个角色均绑定 `main` AgentProfile

验证结果：

- `npx tsc --noEmit`：通过
- `npm run test:team`：101 pass（P1.5 后 133 pass，P15 后 169 pass）
- `npm test`：819 pass

## 文件清单

| 文件 | 职责 |
|------|------|
| `src/team/types.ts` | TeamUnit / Plan / Run / role result 类型（含 discovery / for_each / decomposer / outputCheck 和 validation result） |
| `src/team/routes.ts` | v2 TeamUnit / Plan draft / Plan / Run / SSE / Attempt HTTP API |
| `src/team/plan-draft.ts` | 确定性 Plan draft 模板 registry 和自然语言薄 heuristic router；只生成可检查的 Plan create payload |
| `src/team/run-presenter.ts` | Team run detail API response presenter：汇总 expansion / decomposition records 为 `taskDefinitions`，避免 route handler 直接拼响应形状 |
| `src/team/orchestrator.ts` | run 创建、状态迁移、task ordering、dynamic expansion、controlled decomposition、finalizer，以及 task attempt runner 组合 |
| `src/team/child-execution.ts` | expanded child task 执行模块：顺序 child 循环、parallel refill pool、fatal drain、parent status aggregation 和 scoped child state writer |
| `src/team/task-attempt-runner.ts` | task attempt 生命周期执行模块：worker/checker/watcher phase、checker/watcher retry、output validation gate、accepted/failed result 和 attempt metadata 写入 |
| `src/team/run-workspace.ts` | RunWorkspace facade，兼容既有 orchestrator/routes 调用并隐藏磁盘布局 |
| `src/team/run-workspace-state.ts` | run state、admission、lease、`patchState` 和 `RunStateEvents` |
| `src/team/run-workspace-attempts.ts` | attempt metadata、attempt 文件、role workspace 文件和 discovery-result 持久化 |
| `src/team/run-workspace-artifacts.ts` | final-report 和 run-scoped 文件读取 |
| `src/team/run-workspace-records.ts` | expansion / decomposition records 与 generated child task state append |
| `src/team/output-validator.ts` | P26 deterministic output contract validator：JSON items/object、HTML fragment、file exists、run-scoped file reference safety |
| `src/team/run-state-events.ts` | 进程内 run state 变更通知（subscribe/notify） |
| `src/team/team-unit-store.ts` | TeamUnit 存储 |
| `src/team/task-store.ts` | Team Canvas Task 持久化：`.data/team/tasks/<taskId>.json`、旧字段兼容、归档过滤 |
| `src/team/task-port-contract.ts` | Typed Task port contract：port id/type 校验、input/output port 查找和展示标签 |
| `src/team/task-connection-store.ts` | Typed Task connection store：`.data/team/task-connections.json`、类型匹配、重复连接和 DAG cycle 防护 |
| `src/team/task-validation.ts` | Task create/update schema policy：leader / worker / checker Agent、WorkUnit 输入 / 输出契约 / typed ports / 验收规则校验 |
| `src/team/task-run-service.ts` | Canvas Task 独立 run service：ready 校验、worker → checker 执行、task-runs 工作区、cancel、typed artifact 下游触发 |
| `src/team/task-run-process-recorder.ts` | Canvas Task role process recorder：复用主 chat process 投影、节流写入 attempt `roleProcesses`、取消 / 失败 / 完成 flush |
| `src/team/plan-store.ts` | Plan 持久化和 runCount 不变式 |
| `src/team/plan-validation.ts` | Plan create/update schema policy：task type、decomposer、for_each、outputCheck 校验 |
| `src/team/config-locks.ts` | 活跃 run 对 Plan / TeamUnit / AgentProfile 的锁计算 |
| `src/team/agent-profile-role-runner.ts` | 真实 AgentProfile runner adapter：profile/session/browser/workspace/abort/runtimeContext 接线 |
| `src/team/role-prompt-contract.ts` | 纯 role prompt contract：worker/checker/watcher/finalizer/decomposer prompt builder、JSONish parser 和 output normalizer |
| `src/team/role-runner.ts` | mock runner 与 runner interface（含 `runDecomposer` contract） |
| `src/team/task-expansion-planner.ts` | 动态任务扩展：`TaskExpansionPlanner` 接口、`TemplateTaskExpansionPlanner` 模板实现 |
| `src/team/ids.ts` | ID 生成 |
| `src/team/path-refs.ts` | resultRef 路径验证和解析 |
| `src/team/progress.ts` | progress phase/message 常量 |
| `src/team/timing.ts` | timing span 写入 |
| `src/workers/team-worker.ts` | 独立 Team worker 轮询 queued run |
| `src/routes/agent-profiles.ts` | AgentProfile 写接口上的 Team active-run 锁 |
| `src/ui/team-page.ts` | `/playground/team` 控制台（含 SSE 实时更新、中文 phase 标签、页面内 toast/confirm、Plan modal 表单、自然语言草案、结构化 Plan 卡片、JSON 查看器） |
| `src/ui/team-run-detail-behavior.ts` | Team run detail 滚动快照 / anchor 恢复 helper；`team-page.ts` 将这段脚本注入 inline UI |
| `.pi/skills/team-plan-creator/SKILL.md` | 只创建 TeamUnit / Plan 的运行时 skill |
| `.pi/skills/team-task-creator/SKILL.md` | 只创建 / 更新 Team Canvas Task draft 的运行时 skill |

### /playground/team 控制台

独立页面提供 Team Runtime 的可视化管理。P19 Dashboard Redesign 重构为以 Plan 为中心的导航架构（P12 Console UX Refresh + P13 Structured Plan Cards + P14 Compact Card Layout + P19 Dashboard Redesign）。

#### 页面结构

页面顶部为控制台头部（标题 + 副标题 + 三个摘要计数器），下方为 tab 导航：

1. **计划仪表盘**（默认视图）
2. **运行记录**（全局辅助审计视图）
3. **预设团队**（不变）

#### 计划仪表盘（默认视图）

响应式卡片网格展示所有 Plan。每张卡片包含：

- 标题 + 芯片（任务数 / 运行数）
- Plan ID：完整展示，点击可复制（`.team-id-label`）
- 目标摘要（截断显示）
- 计划类型标签：`普通` 或 `动态`（含 discovery → for_each 的 Plan）
- 活跃/最新 Run 摘要：状态 badge、当前任务、耗时
- 活跃 Run 进度条：已成功 / 已失败 / 总任务数
- 有活跃 Run 的 Plan 卡片：accent 色边框动画高亮
- 最近 Run 状态为 failed 的 Plan 卡片：红色左边框

点击 Plan 卡片进入 **计划详情视图**。

##### 计划详情视图

替换卡片网格，显示单个 Plan 的完整信息：

- **顶部**：返回按钮（回到仪表盘）+ Plan 标题
- **基本信息**：完整 goal、outputContract
- **任务结构**：
  - 普通计划：有序步骤列表，每步显示 title 和 input 摘要
  - 动态计划：**设计图**，可视化展示 discovery 节点 → `outputKey` → `for_each` 模板 → 运行时扩展概念
- **Run 列表**：仅展示该 Plan 关联的 Run（复用运行记录的卡片样式）

Run 卡片中 Run ID 完整展示，点击可复制（`.team-id-label`）。Run 卡片可展开，点击后展示该 Run 的 **任务时间线**：

- 有序任务节点，每个节点显示状态图标和标题
- 动态生成的子任务在父任务下方缩进展示
- `decomposer.mode="leaf"` / `propagate` 的 Plan task 在任务结构中显示紧凑 badge；`none` 不额外刷屏
- 被 decomposer split 的 parent 在时间线中标记为「拆分容器」，child task 以「拆分子任务」分组缩进展示
- `for_each` 生成的 child task 标记为「动态子任务」，和 decomposed child 区分展示
- `GET /v1/team/runs/:runId` 返回 additive `taskDefinitions`，由 expansion/decomposition records 汇总生成；UI 优先使用该真实契约，不再靠 child id 前缀猜 parent
- 中文 phase 标签和颜色编码

#### 运行记录 tab

全局辅助审计视图，展示所有 Run（不区分 Plan）：

- 关联 Plan 标题、runId、状态 badge
- 人性化耗时格式（X时Y分 / X分Y秒）
- 格式化时间戳（创建/开始/完成）
- 任务进度条 + 成功/失败/取消统计
- SSE 实时更新（active run 自动订阅，terminal 自动断开）
- 动态生成的子任务在父任务下方以「子任务」分组展示
- 活跃运行排在列表前面
- 空状态包含下一步操作引导

#### 运行操作（全局）

- 暂停/恢复直接执行，不需要二次确认
- 取消使用自定义确认弹窗，带不可恢复影响说明
- 删除仅允许 terminal run，需确认
- 操作期间按钮 disabled

#### 计划管理

- 页面内 modal 表单创建计划（名称、目标、任务、验收标准、输出契约）
- 验收标准按行拆分为 `acceptance.rules`
- 三种创建模式：**普通计划**（单任务顺序执行）、**发现后逐项处理**（discovery + for_each 动态计划）、**自然语言草案**（先生成可检查 Plan draft）
- 动态模式：填写发现任务和子任务模板，自动生成 canonical Plan JSON，预览后再提交
- 自然语言草案模式：输入目标后调用 `POST /v1/team/plan-drafts`，页面提供 supported template 显式选择：`自动匹配`（不传 `preferredTemplateId`）、`单 Agent`、`并行研究`；planned registry 不展示为可创建项
- 草案生成后页面展示模板命中、reason、warnings 和 Plan JSON；用户确认后才把草案 payload 提交到 `POST /v1/team/plans`，不会自动创建或启动 Run
- 阶段边界：本阶段不再继续增强可视化 Plan 创建器。复杂 Plan 设计优先在 Agent 对话和 `team-plan-creator` skill 中敲定；`/playground/team` 主要承担 Plan 查看、Run 创建、执行审计、失败排查和 rerun 决策。
- 删除未使用计划（需确认）
- 「查看 JSON」弹层：使用 `textContent` 安全展示完整 Plan JSON

#### 预设团队 tab

CRUD + 归档，每个角色绑定 AgentProfile 下拉选择。与 P19 前行为一致。

#### 任务详情

- 中文 phase 标签（执行中/验收中/复盘中/生成报告等），带颜色编码
- 尝试历史卡片（状态、ID、时间戳、file-chip 文件按钮）
- `runtimeContext` 默认折叠（`<details>/<summary>`），点击展开详情
- 错误摘要使用高亮样式
- split parent 本身没有 worker attempt；如果 child 失败，parent 错误摘要和失败 child 会同时出现在时间线中，方便定位卡住的子任务
- 文件内容弹窗查看（调用 Attempt API，统一 modal-panel 样式）

#### 最终报告

统一 modal 弹窗，支持一键复制报告文本。

#### Run 脑图视图

展开 Run 详情时，默认展示纵向思维导图（`脑图`），可切换为传统任务时间线（`详情`）。

- **视图切换**：`脑图 / 详情` 分段控制，每 Run 独立记忆，SSE 刷新不丢失选择
- **纵向脑图**：
  - 根节点：Run 摘要（ID、状态、任务计数）
  - 主任务节点：按 Plan 顺序排列
  - 生成子任务：按 `parentTaskId` / `sourceItemId` 元数据挂载到父节点
  - 未归属子任务：归入 `未归属子任务` 分组
  - 节点类型标签：`任务`、`发现`、`逐项处理`、`动态子任务`、`拆分子任务`
- **状态视觉**：
  - running：左边框蓝色 + 轻微 pulse 动画
  - succeeded：左边框绿色
  - failed：左边框红色，紧凑态即显示错误首行
  - skipped / cancelled：整体淡化
  - 连接线：`.mindmap-children` 纵向主干 + 横向分支
- **自适应交互**：
  - 节点点击展开/收起详情（attempt、resultRef、error、file chips）
  - 失败节点默认展开
  - 超过 6 个子节点时折叠，`展开全部 N 个` / `收起`
  - task disposition 更新前捕获当前 run detail 滚动快照和 `data-task-id` anchor，刷新后由 `src/ui/team-run-detail-behavior.ts` 按属性比对恢复位置，避免特殊 task id 拼 selector 或跳回顶部
- **移动端**：`@media (max-width: 720px)` 收口为纵向树卡片，隐藏连接线，无横向滚动
#### 通用特性

- **页面内反馈**：所有操作反馈通过 toast 通知（success/error/info），不使用浏览器原生 `alert()`/`confirm()`/`prompt()`
- **自定义确认弹窗**：危险操作使用 `confirmAction()` modal，带影响说明文案
- **移动端响应式**：`@media (max-width: 720px)` 适配（modal 全宽、摘要隐藏、按钮换行、表格缩窄、卡片网格单列）
- **安全性**：所有动态文本经过 `escapeHtml()` 转义，toast 使用 `textContent`

### Checker/Watcher JSON Output Format

Both checker and watcher agents must output **strict JSON only** — no markdown, no surrounding text.

**Checker output schema:**
```json
{"verdict": "pass|revise|fail", "reason": "...", "resultContent": "...", "feedback": "..."}
```
- `verdict` must be lowercase: `pass`, `revise`, or `fail`
- `feedback` is required when `verdict=revise` (default: "checker requested revision")
- `resultContent` is optional for pass/fail
- P26 起，checker prompt 会包含 runtime 生成的 `outputValidation` evidence；若 `ok=false`，checker 不得返回 `pass`

**Watcher output schema:**
```json
{"decision": "accept_task|confirm_failed|request_revision", "reason": "...", "revisionMode": "amend|redo", "feedback": "..."}
```
- `decision` must be lowercase: `accept_task`, `confirm_failed`, or `request_revision`
- `feedback` is required when `decision=request_revision` (default: "watcher requested revision")
- `revisionMode` only `amend` or `redo`; invalid values are ignored
- P26 起，watcher prompt 会包含同一 `outputValidation` evidence；若 `ok=false`，watcher 不得返回 `accept_task`

**JSONish fallback:** When strict JSON parsing fails, the system uses a regex-based fallback extractor for common model quirks (e.g., unescaped Chinese quotes in string values). This is not a general JSON repair tool — if both strict and JSONish parsing fail:
- Checker → `verdict=fail, reason="checker output parse error"`
- Watcher → `decision=confirm_failed, reason="watcher output parse error"`

**Limitation:** The fallback does not handle arbitrary malformed JSON.

### Phase Timeout

Each role phase has an independent timeout:
- `TEAM_WORKER_PHASE_TIMEOUT_MS` (default 900000 = 15 min)
- `TEAM_CHECKER_PHASE_TIMEOUT_MS` (default 300000 = 5 min)
- `TEAM_WATCHER_PHASE_TIMEOUT_MS` (default 300000 = 5 min)
- `TEAM_FINALIZER_PHASE_TIMEOUT_MS` (default 300000 = 5 min)

### Run Timeout

- Default max run duration: `TEAM_MAX_RUN_DURATION_MINUTES` (default 100)
- Per-run override: `POST /v1/team/plans/:planId/runs` accepts `maxRunDurationMinutes` (1–1440)
- `TeamRunState.maxRunDurationMinutes` persists per-run override; old states without this field fall back to constructor default
- UI create-run flow prompts for timeout before starting

Timeout behavior:
- Worker timeout: task marked failed, `errorSummary="worker timeout"`
- Checker timeout: work unit failed, `errorSummary="checker timeout"`
- Watcher timeout: treated as `confirm_failed` with `reason="watcher timeout"`
- Finalizer timeout: deterministic fallback report, run status `completed_with_failures`, `lastError="finalizer timeout"`
- Run timeout: all unfinished tasks marked failed, run status `failed`, `lastError="run timeout"`

Cancel/pause always takes priority over phase timeout — if a run is already cancelled/paused when timeout resolves, the cancelled/paused status is preserved.

### Timing Spans

`timings.jsonl` now records **real elapsed time** for each phase (worker, checker, watcher, finalizer). Each span includes `startedAt`, `finishedAt` (ISO timestamps), and `durationMs` (real milliseconds). Previously all spans had `durationMs: 0`.

## 已知限制

1. **默认 mock runner** — 真实 runner 需显式 `TEAM_USE_MOCK_RUNNER=false`。
2. **SSE 跨进程 fallback 延迟** — 同进程状态变更通过 `RunStateEvents` 立即推送；独立 worker 进程写入的状态变更通过 1 秒 change-detect fallback 捕获，因此跨进程更新可能有短暂延迟。
3. **Plan 默认单活跃 run** — `TEAM_MAX_CONCURRENT_RUNS` 默认为 `1`，即 Plan / TeamOrchestrator 全局只允许一个 queued/running/paused run。设置为更大的值可允许并发 Plan active run，但单个 worker 进程仍顺序执行；多 worker 进程可通过 lease 机制分别 claim 不同的 queued run。Canvas Task run 不使用该限制，只保留同一 Task 一个 active run 的 guard。
4. **默认 run timeout 100 分钟** — 可通过 `TEAM_MAX_RUN_DURATION_MINUTES` 或 per-run override 调整。
5. **浏览器实例由既有 browser registry/env 决定** — Team 复用 chat/conn 的 browser binding 链路，不负责创建或调度 Chrome profile。多个 role 是否真正落到不同浏览器实例，取决于 AgentProfile 的 `defaultBrowserId` 与 `UGK_BROWSER_INSTANCES_JSON` 等既有配置。
6. **Plan draft router 只是确定性浅层 heuristic** — 不调用 LLM，不做语义规划；当前只支持 `single_agent` 和 `parallel_research`。`/playground/team` 只展示 `自动匹配` / `单 Agent` / `并行研究`，planned 模板只保留在 registry 里说明未来方向，不能生成 draft。
7. **可视化 Plan 创建不是本阶段重点** — UI builder 只保留普通计划、discovery → for_each 常见模式和快速 Plan draft 辅助。高级 Plan 结构或复杂任务设计优先通过 Agent 对话 / `team-plan-creator` skill 产出，再由 Team Runtime 执行和审计；不要继续把 `/playground/team` 扩成完整 Plan 编辑器。
8. **for_each parallel 固定容量** — 并行模式使用固定池（容量 3），不可配置；嵌套 for_each 尚未支持。
9. **Controlled decomposition 只支持有界顺序执行** — 运行时只允许 `propagate -> leaf | none`、`leaf -> none`；child task 必须是 normal；不支持并行 child execution、无限传播或 nested for_each。
10. **Decomposition UI 只展示，不编辑** — `/playground/team` 只显示 decomposer badge 和 split hierarchy；不提供可视化编辑器。Run detail API 通过 `taskDefinitions` 暴露由 expansion/decomposition records 汇总出的 generated child definitions；旧 run 或缺少记录的 run 会退回为普通「子任务」分组。
11. **无 AgentTaskExpansionPlanner** — 动态任务扩展目前使用模板展开（`TemplateTaskExpansionPlanner`），尚无 AI 驱动的智能扩展。
12. **Typed Task Chain V1 不是工作流平台** — 当前支持 typed port 连接、上游通过 checker 后自动触发下游、同一 output port fan-out 到多个不同下游 Task；不支持条件分支、循环、多上游 merge、wait-all、同一 target Task 多 input bundling 或自由工作流编排。

## 后续计划

1. ~~真实多 AgentProfile + 多 browserId 的 Team smoke test~~（P18 已完成，提供 `npm run team:browser-smoke` 命令）

### P17 审计覆盖（2026-05-17）

以下浏览器绑定不变式已由确定性测试覆盖（不依赖 Docker / Chrome / 模型）：

- TeamUnit 的 worker/checker/watcher/finalizer profile IDs 在执行前通过 `setProfileIds` 注入 runner
- 不同 AgentProfile 的 `defaultBrowserId` 会进入各自 role session
- Route setup、cleanup、route clear 使用匹配的 canonical scope 和 browserId
- Attempt metadata 持久化 worker/checker/watcher 的 `runtimeContext`（含 `requestedProfileId`、`resolvedProfileId`、`browserId`、`browserScope`）
- Run state 持久化 `finalizerRuntimeContext`
- Worker 构造时的 `main` 占位符会被 TeamUnit 实际 profile IDs 覆盖
- Mock runner 默认行为不变（`TEAM_USE_MOCK_RUNNER` 非精确 `"false"` 时使用 mock）

#### 手动多浏览器 Smoke 清单

在真实环境中验证多 profile 多浏览器绑定：

1. 配置 `UGK_BROWSER_INSTANCES_JSON` 包含至少两个 browser ID（如 `default` 和 `chrome-01`）
2. 创建两个 AgentProfile，分别设置不同的 `defaultBrowserId`
3. 创建一个 TeamUnit，将不同 profile 分配给 worker 和 finalizer（或 worker 和 checker）
4. 确保 `TEAM_RUNTIME_ENABLED=true` 和 `TEAM_USE_MOCK_RUNNER=false`
5. 启动 `ugk-pi` 和 `ugk-pi-team-worker`
6. 通过 `/playground/team` 创建并执行一个 run
7. 检查 attempt metadata 中的 `runtimeContext`：不同角色应有不同的 `browserId`
8. 检查 run state 中的 `finalizerRuntimeContext`：应包含 finalizer profile 的 browserId

Team 不创建 Chrome 实例，不复制 cookie 或登录态，不调度浏览器。browserId 到真实 CDP endpoint 的映射仍由 `UGK_BROWSER_INSTANCES_JSON` / Browser Registry 决定。

### P18 Browser Binding Smoke（2026-05-17）

自动化 smoke 脚本 `scripts/team-browser-binding-smoke.mjs` 通过 HTTP API 验证真实 Team run 的浏览器绑定：

```bash
npm run team:browser-smoke -- \
  --worker-profile smoke-worker \
  --checker-profile smoke-checker \
  --watcher-profile smoke-watcher \
  --finalizer-profile smoke-finalizer \
  --expect-worker-browser browser-a \
  --expect-checker-browser browser-b \
  --expect-watcher-browser browser-a \
  --expect-finalizer-browser browser-b
```

前提条件：

- `TEAM_RUNTIME_ENABLED=true`
- `TEAM_USE_MOCK_RUNNER=false`
- `UGK_BROWSER_INSTANCES_JSON` 包含所有期望的 browser ID
- HTTP server 和 `ugk-pi-team-worker` 正在运行
- 四个 AgentProfile 已存在且设置了匹配的 `defaultBrowserId`

脚本行为：

1. 创建临时 TeamUnit（绑定四个 profile）
2. 创建单任务 Plan
3. 创建 Run 并轮询至 terminal
4. 读取 task_1 的 attempt metadata
5. 校验 worker/checker/watcher 的 `requestedProfileId`、`browserId`、`browserScope`
6. 校验 run state 中的 `finalizerRuntimeContext`
7. 脚本不会删除创建的 TeamUnit/Plan/Run，保留供排查

所有 CLI 参数均可通过环境变量覆盖（`TEAM_SMOKE_WORKER_PROFILE` 等）。测试覆盖了 CLI 解析、HTTP 流程（mocked fetch）、超时/失败拒绝、以及严格的 runtime context 校验。

---

## 归档：v0.1 域名调查历史

以下是 Team Runtime v0.1 的历史资料，不是当前 v2 主接口。v0.1 基于 template / stream / submit tool 架构，已被 v2 的 plan-driven sequential pipeline 替代。这些内容仅供参考，不要按此开发。

### v0.1 一句话概述

给定一个品牌关键词（如 "Medtrum"），系统自动搜索相关域名，判断每个域名是官方的、第三方还是可疑的，最终生成调查报告。

### v0.1 架构

```
POST /v1/team/runs {keyword: "Medtrum"}
         │
         ▼
  ┌─── team-worker (轮询) ───┐
  │                            │
  │  TeamOrchestrator.tick()   │
  │  Discovery → Evidence → Classifier → Reviewer → Finalizer
  └────────────────────────────┘
```

v0.1 使用 `TeamTemplate`、`submitTeamStreamItem()`、`llm-tool-loop.ts` 等 v0.1 专用组件。v2 不再使用这些组件。相关文件（`src/team/team-template.ts`、`src/team/team-submit.ts`、`src/team/llm-tool-loop.ts` 等）仍在仓库中但已不被 v2 主流程引用。

### v0.1 数据目录

```
.data/team/
  runs/<teamRunId>/
    plan.json
    state.json
    events.jsonl
    streams/          # v0.1 stream 文件
    cursors/          # v0.1 cursor 文件
    artifacts/
      final_report.md
```

v2 使用相同的 `runs/<teamRunId>/` 目录结构，但内部文件不同（有 `tasks/`、`attempts/`、`results/`、`final-report.md` 等）。

### v0.1 环境变量

| 环境变量 | 说明 |
|----------|------|
| `TEAM_REAL_ROLES` | 逗号分隔的真实角色列表 |
| `TEAM_ROLE_TASK_TIMEOUT_MS` | 角色任务超时（默认 180000） |
| `TEAM_ROLE_TASK_MAX_RETRIES` | 失败重试次数 |

v2 不使用这些变量。
