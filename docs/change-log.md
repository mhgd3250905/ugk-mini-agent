# 更新记录

这份文档用来记录仓库层面的可追溯更新。

规则很简单，别搞花活：

- 任何影响外部行为、运行方式、接口、文档结构或协作约定的改动，都要在同一轮补一条记录
- 每条记录至少写清：日期、主题、影响范围、对应入口
- 如果只是纯局部代码重构且对外无感，可以不记；但只要会影响下一个接手的人，就应该记

当前配置事实不要从旧流水账里倒推。历史条目里出现的 `deepseek-anthropic`、DeepSeek `openai-completions`、智谱复用 `ANTHROPIC_AUTH_TOKEN`、或通过 `*-api.txt` 注入 key，均只表示当时发生过，不代表当前规范。当前模型源以 `docs/model-providers.md`、`runtime/pi-agent/models.json`、`.env.example` 和 `/v1/model-config` 为准。

---

## 2026-05-23 — Team Console Execution Map 视觉重设计

- **主题**: Execution Map 从 list-like 测试 UI 进化为纵向流式执行图
- **影响范围**: `apps/team-console/src/graph/execution-map.css`, `apps/team-console/src/graph/ExecutionMap.tsx`, `apps/team-console/src/graph/execution-map-layout.ts`, `apps/team-console/src/tests/execution-map-ui.test.tsx`, `apps/team-console/src/tests/execution-map-layout.test.ts`, `apps/team-console/README.md`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 节点样式重写：4px 彩色状态条（running 蓝色脉冲、succeeded 绿色、failed 红色渐变+错误首行、paused 黄色、dimmed 灰色半透明）、选中发光边框、chain-selected `color-mix` 路径混合、折叠虚线、orphan 点线、`data-kind` 属性
  - 连接线优化：spine 使用 center-to-center 三次贝塞尔曲线、branch 使用 L 形直角折线、选中链路高亮
  - 布局间距收紧：`SPINE_Y_GAP` 80→72、`BRANCH_Y_GAP` 64→56
  - 新增 13 个测试（UI 9 个 + layout 4 个），总测试数从 55 增长到 68
  - 三个独立 commit：node styling、layout polish、status readability
  - 浏览器视觉验证通过：顺序/失败/Discovery+ForEach/Decomposition/大量子任务/跳过 共 6 个 fixture

## 2026-05-23 — Team Console dev server Live API proxy

- **主题**: Team Console Vite dev server 增加 `/v1/team` proxy，避免 Live API preview 打到 Vite 自己
- **影响范围**: `apps/team-console/vite.config.ts`, `apps/team-console/README.md`, `docs/change-log.md`
- **变更**:
  - `apps/team-console` 本地开发服务现在把 `/v1/team/*` 转发到默认 `http://127.0.0.1:3000`
  - 可通过 `TEAM_CONSOLE_API_TARGET` 覆盖代理目标
  - Live API preview 在 dev 模式下不再由 Vite 返回 `index.html` 冒充 JSON 响应

## 2026-05-23 — Team Console review blockers 修复

- **主题**: 接通独立 Team Console preview 的 Live API 模式，并修复 Execution Map 归属、纯函数和折叠状态问题
- **影响范围**: `apps/team-console/**`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - Live API 模式现在真实请求 `GET /v1/team/plans`、`GET /v1/team/runs`、`GET /v1/team/runs/:runId`，按 `createdAt` 默认选择最新 run
  - `buildExecutionMapModel()` 恢复安全 `sourceItemId` fallback，仅在单一 `for_each` parent 时归属；模糊归属继续进入 orphan group
  - `buildExecutionMapModel()` 不再修改传入的 plan/run/taskDefinitions
  - 大量子任务折叠 summary node 会根据隐藏子任务状态显示 failed/running/skipped/cancelled/succeeded，不再硬编码成功
  - Team Console 仍是独立 preview，未替换 `/playground/team`，未改 Team Runtime 后端

## 2026-05-23 — Team Console 独立前端预览

- **主题**: 建立 `apps/team-console/` 独立 Vite + React + TypeScript 前端项目，实现 Team Runtime 纵向 Execution Map 原型
- **影响范围**: `apps/team-console/**`（新目录）, `package.json`（新增 `team-console:*` 脚本）, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 新建独立前端子项目 `apps/team-console/`，可独立启动、构建、测试
  - 实现 mock fixture（覆盖顺序、动态、拆分、失败、大量子任务、未归属、跳过场景）和 Live API adapter
  - 实现纵向 Execution Map model/layout 纯函数（不依赖 DOM），42 个测试覆盖 model/layout/UI/adapter
  - 实现可点击节点的执行图 UI 和任务详情面板
  - 旧 `/playground/team` 页面和后端完全不受影响

## 2026-05-23 — Qwen reasoning stream heartbeat and GLM context metadata

- **主题**: 修复长 reasoning 流式响应保活，并校正阿里 CodePlan `glm-5.1` 上下文窗口
- **影响范围**: `src/agent/agent-session-event-adapter.ts`, `src/agent/agent-run-events.ts`, `src/routes/chat.ts`, `src/ui/playground-stream-controller.ts`, `src/types/api.ts`, `runtime/pi-agent/models.json`, `docs/model-providers.md`, `docs/playground-current.md`, `test/agent-session-event-adapter.test.ts`, `test/agent-run-events.test.ts`, `test/agent-session-factory.test.ts`, `test/model-config.test.ts`, `test/server.test.ts`
- **变更**:
  - `thinking_start` / `thinking_delta` / `thinking_end` 现在转成内部 `heartbeat` 事件，供 Playground 保活和展示“正在推理”
  - `heartbeat` 不追加 assistant 正文、不进入最终 `done.text`，运行日志分页也会过滤它
  - `ali-codeplan / glm-5.1` 的 `contextWindow` 从 `20000` 校正为 `200000`，并登记 `maxTokens: 128000`

## 2026-05-23 — Team plan detail preset team controls

- **主题**: 在 `/playground/team` 计划详情中展示并管理预设团队
- **影响范围**: `src/ui/team-page.ts`, `test/team-page-ui.test.ts`, `test/server.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - 计划详情页新增预设团队区域，展示当前计划绑定团队及执行、验收、复盘、汇总、任务拆分角色
  - 详情页可直接切换计划的默认团队，复用现有 `PATCH /v1/team/plans/:planId/default-team` 接口
  - “编辑团队”复用现有预设团队弹窗，保存后同步刷新计划详情中的团队信息

## 2026-05-23 — Playground standalone workbench same-tab navigation

- **主题**: 将 Agent、后台任务、Team Runtime 独立工作台入口收口为当前标签跳转
- **影响范围**: `src/ui/playground.ts`, `src/ui/agents-page.ts`, `src/ui/conn-page.ts`, `src/ui/playground-agent-manager.ts`, `src/ui/playground-conn-activity-controller.ts`, `src/ui/playground-page-shell.ts`, `src/ui/team-page.ts`, `test/server.test.ts`, `test/team-page-ui.test.ts`, `test/playground-agent-switch.test.ts`, `test/agent-model-ui.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - Agent 标签与后台任务入口从 `window.open(..., "_blank")` 改为 `window.location.assign(...)`
  - Team Runtime 的桌面和手机入口移除 `target="_blank"`，保持在当前标签进入 `/playground/team`
  - Agent、Conn、Team 独立页左上角统一返回 `/playground?view=chat`，主页面识别 `view=chat` 后恢复当前 Agent 的对话界面
  - 显式返回 Agent 首页时清理 `view=chat` URL hint，避免刷新行为被旧返回状态污染

## 2026-05-23 — Playground stream resume cursor dedupe

- **主题**: 修复对话进行中恢复事件流时 assistant 文字重复叠加
- **影响范围**: `src/agent/agent-service.ts`, `src/routes/chat.ts`, `src/types/api.ts`, `src/ui/playground-active-run-normalizer.ts`, `src/ui/playground-stream-controller.ts`, `test/agent-service.test.ts`, `test/server.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - `activeRun` 快照新增 `eventCursor`，标记 `/v1/chat/state` 已覆盖到的 active run 事件位置
  - `/v1/chat/events` 与 scoped agent events 支持 `afterEventCursor`，只 replay cursor 之后的 buffered events
  - Playground 恢复 running state 后订阅事件流时携带 cursor，避免 state 快照正文和从头 replay 的 `text_delta` 同时追加到同一助手气泡

## 2026-05-23 — Playground Agents skill card status dedupe

- **主题**: 移除 `/playground/agents` 技能卡片里的重复启用状态 badge
- **影响范围**: `src/ui/agents-page.ts`, `test/server.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - 技能卡片不再渲染 `.ag-skill-state` 和 `已启用 / 已关闭` 文案；启用状态只由左侧 `开 / 关` switch 表达
  - 保留 `系统技能 / Agent 安装` 来源 badge 和压缩保存路径
  - 测试增加反断言，避免重复状态 badge 回归

## 2026-05-22 — Playground Agents skill card density and storage labels

- **主题**: `/playground/agents` 技能列表改为双列卡片并展示保存来源
- **影响范围**: `src/agent/agent-profile-catalog.ts`, `src/types/api.ts`, `src/ui/agents-page.ts`, `test/agent-profile-catalog.test.ts`, `test/server.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - `/v1/agents/:agentId/skills` 在保留原字段的基础上新增 `storageKind` 和 `storageRoot`，由 agent 的 allowed skill root 顺序区分系统技能与 Agent 安装技能
  - Agents 页展开技能后，技能卡片在桌面宽度下使用两列布局，窄屏回退单列
  - 每张技能卡片显示 `系统技能 / Agent 安装` 来源 badge 和压缩后的保存路径，完整路径保留在 hover title 中
  - 补充深浅主题 badge 样式和对应测试断言

## 2026-05-22 — Playground Chat conversation list copy density

- **主题**: Chat 左侧会话列表移除第二行小字摘要和消息条数
- **影响范围**: `src/ui/playground-conversations-controller.ts`, `src/ui/playground-styles.ts`, `src/ui/playground-assets.ts`, `src/ui/playground-theme-controller.ts`, `test/playground-conversations-controller.test.ts`, `test/server.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - 会话行渲染不再创建 `.mobile-conversation-preview`，也不再创建消息条数 pill；列表只显示标题摘要和时间 / 运行中状态
  - 深色、浅色、桌面 rail 和移动抽屉里的 preview 专用样式同步删除，避免留下无效选择器误导后续维护
  - 移动会话抽屉行结构收成两行，虚拟滚动移动 row pitch 从 `100px` 调整为 `80px` 并更新测试断言
  - 文档同步记录新的 Chat 会话列表信息层级

## 2026-05-22 — Current handoff snapshot for stable playground baseline

- **主题**: 更新新会话接手入口到 Playground performance 稳定基线
- **影响范围**: `docs/handoff-current.md`, `docs/change-log.md`
- **变更**:
  - 将过期 Team Runtime 交接快照替换为 Chat / Agents / Conn performance 收口事实
  - 记录稳定 tag `stable/playground-performance-2026-05-22` 指向 `f0aa1fd`，并说明该 tag 已推送到 GitHub / Gitee
  - 明确远端 Git 更新不等于生产部署，新会话开始前必须重新确认 `git status`、当前 HEAD、tag 和 remote

## 2026-05-22 — Playground Conn run history loading states

- **主题**: `/playground/conn` 运行历史补齐 loading / empty / error / retry / has-more 状态
- **影响范围**: `src/ui/conn-page-js.ts`, `src/ui/conn-page-css.ts`, `test/server.test.ts`, `test/conn-page-ui.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - run history 未加载、加载中、加载失败、已加载空数组、分页可继续和分页加载中状态都有明确 DOM 标记与紧凑可视反馈
  - 错误态提供“重试加载”，点击前检查当前 `selectedId`，避免旧 conn 的错误按钮在用户切换任务后重拉旧历史
  - 分页“加载更多”增加 `loading-more` 标记、禁用态与 `aria-busy`，继续保留已加载列表、展开 run 和详情滚动位置
  - loading / error / loading-more 样式使用现有主题 token，避免深浅主题出现单主题硬编码颜色
  - 测试覆盖 loading、empty、error、retry、has-more 状态路径、selected-id retry guard 和 CSS token 断言

## 2026-05-22 — Playground Conn targeted action rendering

- **主题**: `/playground/conn` 操作路径从整页 `renderAll()` 收口为局部渲染
- **影响范围**: `src/ui/conn-page-js.ts`, `test/server.test.ts`, `test/conn-page-ui.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - 新增局部渲染 helper，分别覆盖 stats、list、selected detail actions、selected detail body 和 run history
  - `handlePause()`、`handleResume()`、`handleDelete()`、`handleMarkAllRead()` 不再在操作前后反复调用 `renderAll()`
  - `handleRunNow()`、run history refresh、run 展开 / 终止 / 事件加载改为局部渲染，并在异步返回时检查当前 `selectedId`
  - “全部已读”继续不引用旧的 `loadRuns()`，已加载历史直接更新本地 `readAt`，未加载历史保持懒加载
  - 测试覆盖 action handler 不回退到 `renderAll()`、`loadRuns()` 不再出现、局部渲染可更新可见状态，以及异步 action 不会重画新选中详情面板

## 2026-05-22 — Playground Conn realtime refresh scope narrowing

- **主题**: 收窄 `/playground/conn` 实时 notification 刷新范围并增加短窗口合并
- **影响范围**: `src/ui/conn-page-js.ts`, `test/conn-page-ui.test.ts`, `docs/playground-current.md`, `docs/runtime-assets-conn-feishu.md`, `docs/change-log.md`
- **变更**:
  - SSE `message` handler 现在解析 `event.data`，仅对 `source === "conn"` 且带有效 `sourceId` 的广播调度后台任务刷新
  - conn notification 进入 500ms 合并窗口，窗口内多条事件只触发一次实际刷新
  - notification 默认只请求 `GET /v1/conns`，不再经过 `loadData()` 路径重拉 editor 支撑目录
  - 当前选中 conn 的 run history 已加载时，受影响 conn 的 notification 会额外刷新该 conn 的第一页 runs；未加载 history 继续保持懒加载
  - 测试覆盖 burst 合并、非 conn 事件忽略、notification 不触发支撑目录请求，以及已加载选中 history 的第一页刷新

## 2026-05-22 — Playground Conn read-all cache cleanup

- **主题**: 清理 `/playground/conn` “全部已读”按钮里的旧运行历史刷新调用
- **影响范围**: `src/ui/conn-page-js.ts`, `test/conn-page-ui.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - `handleMarkAllRead()` 不再调用已经不存在的 `loadRuns()`，避免批量已读成功后又弹出 `loadRuns is not defined` 错误
  - 批量已读成功后同步清空页面内 `unreadCountsByConnId`、`unreadLatestRunTimesByConnId`，并把已加载 run history 与 `latestRun` 的本地 `readAt` 标记为已读
  - 保持前面性能优化口径：批量已读不会额外请求 `/v1/conns/:connId/runs`，已加载缓存直接更新，未加载历史继续保持懒加载
  - 测试覆盖“全部已读”成功路径，确认只请求 `POST /v1/conns/runs/read-all`、没有 stale refresh call、没有错误 toast

## 2026-05-22 — Playground Conn run history pagination

- **主题**: `/playground/conn` 运行历史从完整拉取改为后端游标分页
- **影响范围**: `src/routes/conns.ts`, `src/agent/conn-run-store.ts`, `src/types/api.ts`, `src/ui/conn-page-js.ts`, `src/ui/conn-page-css.ts`, `test/server.test.ts`, `test/conn-run-store.test.ts`, `test/conn-page-ui.test.ts`, `docs/playground-current.md`, `docs/runtime-assets-conn-feishu.md`, `docs/change-log.md`
- **变更**:
  - `GET /v1/conns/:connId/runs` 在无 query 参数时保持旧的完整历史响应；带 `limit` / `before` 时按 `scheduled_at DESC, created_at DESC, run_id DESC` 返回有界页，并携带 `hasMore`、`nextBefore`、`limit`
  - `ConnRunStore.listRunsForConn()` 支持 `limit` 和稳定三元游标，分页时不会因同时间戳 run 丢行或重复
  - `/playground/conn` 首次加载运行历史改为请求 `limit=10`，底部“加载更多”使用 `nextBefore` 追加下一页，保留选中任务、展开 run 和详情滚动位置
  - 测试覆盖 route 分页/非法 query、store tie-break 分页、前端有界请求与追加行为

## 2026-05-22 — Playground Conn initial run history lazy loading

- **主题**: `/playground/conn` 首屏不再因自动选中第一条任务而拉取完整 run history
- **影响范围**: `src/ui/conn-page-js.ts`, `src/ui/conn-page-css.ts`, `test/conn-page-ui.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - `handleConnSelect()` 只更新选中态和详情渲染，不再自动调用 `apiFetchRuns(connId)`
  - 新增 `runHistoryStateByConnId` 与 `loadRunHistory()`，区分未加载、加载中、已加载空数组和加载失败状态
  - 运行历史区域在未加载时使用 `conn.latestRun` 展示最近一次摘要，并提供显式“加载运行历史”按钮
  - run history 请求返回时检查 `state.selectedId`，避免旧任务异步结果重画到新选中任务面板
  - 测试覆盖 init 首屏、latestRun 摘要、懒加载入口、已加载空数组缓存和 selected-id guard

## 2026-05-22 — Playground Conn editor support catalog lazy loading

- **主题**: `/playground/conn` 首屏不再提前加载 create/edit editor 才需要的 Agent、浏览器和模型配置目录
- **影响范围**: `src/ui/conn-page-js.ts`, `test/conn-page-ui.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - `loadData()` 拆为 conn list refresh，首屏和手动刷新只请求 `GET /v1/conns`
  - 新增 `loadEditorSupportCatalogs()` lazy loader，打开 create/edit editor 时才请求并缓存 `GET /v1/agents`、`GET /v1/browsers` 和 `GET /v1/model-config`
  - editor 支撑目录加载或不可用时禁用保存，并通过 `guardEditorSupportCatalogs()` 阻止提交错误的执行 Agent、浏览器或模型字段
  - 编辑已有任务时保留原 `profileId`、`browserId`、`modelProvider` 和 `modelId` 的 pending select value，避免目录加载前的空 `<select>` 把现有绑定静默回落到默认值
  - 测试覆盖首屏请求清单、editor lazy loader/cache 复用和 catalog 未就绪保存 guard

## 2026-05-22 — Playground Agents skill fetch failure handling

- **主题**: `/playground/agents` scoped skills 拉取失败时不再被吞成成功或空列表
- **影响范围**: `src/ui/agents-page.ts`, `test/server.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - `apiFetchAgentSkills()` 不再空 `catch` 吞掉 `fetchJson` 失败；调用侧可以进入自己的失败分支并提示用户
  - skills 展开失败时保留 `skillsLoadedByAgentId[agentId] = false`，skills region 显示“技能加载失败，请重试”，不再误显示“暂无 scoped 技能”
  - 手动刷新失败后会清除 `skillsLoadingAgentId` 并重画 skills region，避免按钮恢复但列表仍卡在“加载中”
  - toggle 后刷新 skills 的 Promise 会返回到外层链路，刷新失败会进入既有失败提示分支，不产生未捕获 rejection

## 2026-05-22 — Playground Agents stable detail section rendering

- **主题**: `/playground/agents` selected Agent 详情区拆成稳定 shell 与局部子区域更新，降低 Agent 切换和 skills 操作时的整块 DOM 重建
- **影响范围**: `src/ui/agents-page.ts`, `test/server.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - `renderDetailBody()` 改为确保 `ag-detail-header-region` / `ag-detail-stats-region` / `ag-detail-config-region` / `ag-detail-skills-region` 四个稳定 region，再分别更新 header/actions、summary、mini stats、基础配置和 skills panel
  - detail shell 不再以 `agentId` 变化作为整块重建条件；Agent 切换会复用 shell 并刷新子区域，切换时复位滚动，skills 局部刷新时保留滚动位置
  - `renderSkillsPanel()` 只在折叠/展开 shell 缺失时创建 skills controls；`populateSkillSelect()` 用 gallery signature 避免 gallery 未变化时重复重建 installable skill 下拉 options
  - skills loading、展开、手动刷新、install/remove/toggle 通过 `renderSkillsList(agentId)` 和必要统计局部更新，不再调用整块 `renderDetailBody()`
  - 所有异步 skills load/mutation 在操作开始时捕获 `agentId`，渲染前检查 `state.selectedId`，避免旧 Agent 的请求结果 stale paint 到新选择的面板
  - 测试覆盖稳定 detail shell、installable skill select 重建条件、skills 局部 loading/mutation 更新、重复控件约束和 stale async guard

## 2026-05-22 — Playground Agents editor support catalog lazy loading

- **主题**: `/playground/agents` 首屏不再阻塞加载 create/edit editor 才需要的浏览器目录和模型配置
- **影响范围**: `src/ui/agents-page.ts`, `test/server.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - `init()` 首屏仅保留 `GET /v1/agents`、`GET /v1/agents/status` 和既有 `GET /v1/agents/main/skills` gallery/cache 请求，不再 await `GET /v1/browsers` 或 `GET /v1/model-config`
  - 新增 `loadSupportCatalogs()` lazy loader 与 `supportCatalogsLoaded/supportCatalogsLoading/supportCatalogsError` 状态，create/edit editor 打开时才拉取并缓存浏览器目录和模型配置
  - editor 支撑目录加载期间禁用浏览器、模型下拉和保存按钮，并显示紧凑提示；支撑目录或模型配置不可用时 `guardEditorSupportCatalogs()` 会阻止 create/edit submit
  - 左侧重新选择 Agent 时会退出 editor mode，避免支撑目录异步加载完成后把已离开的 create/edit 表单重新渲染回来
  - `buildEditorModelPatch()` 在模型配置不可用时返回 `null` 并提示错误，避免构造半截 `defaultModelProvider/defaultModelId`
  - 测试覆盖首屏请求路径、create/edit 触发 lazy loader、loading disabled 状态以及 model config unavailable submit guard

## 2026-05-22 — Playground Agents per-agent skill cache

- **主题**: Agent 技能列表按 agentId 缓存，切换回已加载的 Agent 不重复请求 skills 接口
- **影响范围**: `src/ui/agents-page.ts`, `test/server.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - 新增 `skillsLoadedByAgentId` 状态标记，`apiFetchAgentSkills` 和 `apiFetchGallerySkills` 仅在成功拿到响应并写入 skills 后标记 `true`；fetch 失败不标记，也不清空已有 scoped skills 缓存，允许用户重试
  - `handleExpandSkills` 使用 `skillsLoadedByAgentId` 判断缓存命中，命中时直接渲染不请求；已加载空数组视为有效缓存
  - toggle/remove/install 等 mutation 仅刷新当前 touched agent 的 skills，不影响其他 agent 缓存
  - `handleRemoveSkill` / `handleCopySkill` 在 await 前捕获 `agentId = state.selectedId`，后续 API 和刷新都用局部变量；render 前检查 `state.selectedId === agentId` 防止切换后画到新面板
  - 手动"刷新"按钮始终 force refetch 当前 selected agent
  - 测试覆盖：成功才标记 loaded / 失败不标记、缓存命中跳过 fetch、mutation 捕获 agentId 并守卫 render、gallery 写入 main 缓存

## 2026-05-22 — Local Docker port shadow doctor

- **主题**: 新增本地 `3000` 端口影子进程检测，避免宿主机 Node 截胡 Docker 入口
- **影响范围**: `scripts/local-port-doctor.mjs`, `package.json`, `test/local-port-doctor.test.ts`, `docs/docker-local-ops.md`, `AGENTS.md`, `docs/change-log.md`
- **变更**:
  - 新增 `npm run docker:doctor`，检查本机 `3000` 监听者并在 `127.0.0.1:3000` 被非 Docker 进程监听时失败
  - 覆盖 Windows 上 Docker backend 发布 `0.0.0.0:3000`、宿主机 `node.exe` 同时监听 `127.0.0.1:3000` 的影子入口场景
  - 本地 Docker 排障文档和 agent 接手规则新增端口 doctor 口径，避免把影子服务的“密钥未配置/旧 UI”误判成模型源或容器问题

## 2026-05-22 — Ali CodePlan Qwen 3.7 Max model option

- **主题**: 在阿里 CodePlan 模型源下新增 `qwen3.7-max` 可选模型
- **影响范围**: `runtime/pi-agent/models.json`, `docs/model-providers.md`, `test/model-config.test.ts`, `test/agent-session-factory.test.ts`, `docs/change-log.md`
- **变更**:
  - `ali-codeplan` provider 继续使用 `ALI_CODEPLAN_API_KEY`、`anthropic-messages` 和现有阿里 CodePlan endpoint，只新增模型选项，不新增 provider
  - `/v1/model-config` 暴露的阿里模型列表从 `glm-5.1` / `kimi-k2.6` / `deepseek-v4-pro` 扩展为 `glm-5.1` / `kimi-k2.6` / `deepseek-v4-pro` / `qwen3.7-max`
  - `qwen3.7-max` 上下文窗口登记为 `1000000`
  - 增加 registry 与 model-config 测试覆盖，避免模型只写进文档但没有进入真实下拉

## 2026-05-22 — Playground Agents lazy render selected skills

- **主题**: selected Agent 详情面板 skills 区域默认折叠，首屏不挂载 skill rows，用户点击后按需展开加载
- **影响范围**: `src/ui/agents-page.ts`, `test/server.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - 新增 `skillsExpanded` 状态标志，默认 `false`；切换 Agent 时重置
  - 折叠态显示技能数摘要和"查看技能"按钮，不挂载 `.ag-skill-item` 行和 switch 按钮
  - `handleExpandSkills()` 设置 `skillsExpanded = true`，优先使用 `skillsByAgentId` 缓存，未命中时才调 `apiFetchAgentSkills()`
  - 新增 `getSkillCountText(agentId)` / `getCollapsedSkillSummary(agentId)` helper，区分"未加载"（`—`）与"已加载空数组"（`0`）
  - `getStatCounts()` 和 mini card "技能数" 改用 `getSkillCountText()`，折叠摘要改用 `getCollapsedSkillSummary()`
  - 测试覆盖：首屏无 skill rows、展开后加载渲染、toggle PATCH 仍正确、skill count 未知态显示

## 2026-05-22 — Playground Agents initial main skills dedupe

- **主题**: 复用 `/playground/agents` 首屏 main skills gallery 结果，去掉自动选中主 Agent 时的重复 skills 请求
- **影响范围**: `src/ui/agents-page.ts`, `test/server.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - `apiFetchGallerySkills()` 拉取 `GET /v1/agents/main/skills` 后同步写入 `state.skillsByAgentId.main`，让 installable skill gallery 和主 Agent scoped skills 共用同一份首屏结果
  - `selectAgent()` 先检查 `skillsByAgentId[agentId]` 缓存，命中时直接渲染详情和统计，不再调用 `apiFetchAgentSkills(agentId)`
  - 新增 `/playground/agents` 页面脚本断言，锁定 gallery 结果会写入 main 缓存，且 initial main selection 不走无条件二次 fetch

## 2026-05-22 — Playground conversation row event delegation

- **主题**: 将会话列表逐行 addEventListener 替换为容器级事件委托，降低大量会话时的 DOM/交互成本
- **影响范围**: `src/ui/playground-conversations-controller.ts`, `src/ui/playground-mobile-shell-controller.ts`, `test/playground-conversations-controller.test.ts`, `docs/change-log.md`, `docs/playground-current.md`
- **变更**:
  - 新增 `handleConversationListClick()` 容器级委托处理器，通过 `event.target.closest()` 分派：菜单触发 → `toggleConversationMenu`、菜单操作（`data-action="rename|pin|delete"`）→ 对应请求、颜色色板（`data-color`）→ `requestUpdateConversation`、行按钮 → `selectConversationFromDrawer`
  - 移除行循环和菜单按钮内的所有 `addEventListener`，改为 `data-action` / `data-color` 属性驱动
  - 按钮内容从 `innerHTML` 字符串 + `querySelector` 改为 `createElement` + `appendChild` 直接构建
  - 容器清空从 `innerHTML = ""` 改为 `replaceChildren()`
  - `playground-mobile-shell-controller.ts` 在两个容器上绑定 `click → handleConversationListClick`
  - 测试覆盖：5 个行为测试（eval 委托函数 + mock event target，断言 toggle/update/select 调用正确性）、`renderConversationListInto` 无 addEventListener 断言、mobile shell 接线断言

---

## 2026-05-22 — Playground conversation list virtualization

- **主题**: 会话列表从全量渲染改为虚拟滚动，只渲染视口可见行 + 上下 overscan 缓冲
- **影响范围**: `src/ui/playground-conversations-controller.ts`, `src/ui/playground-styles.ts`, `test/playground-conversations-controller.test.ts`, `docs/change-log.md`
- **变更**:
  - 新增 `computeVirtualWindow()` 纯函数：根据 `scrollTop / viewportHeight / itemHeight / overscan / total` 计算可见行范围和上下 spacer 高度
  - 桌面行高 `60px`（58px item + 2px gap），移动行高 `100px`（92px item + 8px gap），overscan 5 行
  - `renderConversationListInto()` 改为先清空容器，再渲染 top spacer + 可见行循环 + bottom spacer
  - 滚动事件通过 `requestAnimationFrame` 合并调度，pending rAF 期间丢弃后续 scroll 回调
  - 隐藏桌面/移动容器中的重复列表渲染：桌面渲染时清空移动列表，反之亦然
  - 测试覆盖：`computeVirtualWindow` 6 项数学正确性测试（eval 纯函数 + 断言 spacer/范围）、rAF 合并调度行为测试、虚拟滚动常量与 CSS 对齐断言

---

## 2026-05-22 — Playground non-chat panel data lazy loading

- **主题**: 延迟首屏聊天入口的非聊天面板数据请求，减少首屏网络开销
- **影响范围**: `src/ui/playground.ts`, `src/ui/playground-assets-controller.ts`, `src/ui/playground-stream-controller.ts`, `src/ui/playground-conn-activity-controller.ts`, `test/playground-assets-controller.test.ts`, `test/playground-conn-activity-controller.test.ts`, `test/server.test.ts`, `docs/change-log.md`
- **变更**:
  - `initializePlaygroundAssembler()` 不再在首屏调用 `loadAssets(true)`、`syncTaskInboxSummary`、`syncConnManagerUnreadSummary`，这 3 个请求从首屏延迟到面板首次打开或通知推送时加载
  - 新增 `state.assetsLoadedOnce` / `state.connManagerLoadedOnce` lazy gate flag
  - `openAssetLibrary()` 首次打开时才调用 `loadAssets(true)`
  - 流式 "done" 事件中 `loadAssets(true)` 改为 `assetsLoadedOnce` 条件调用，未打开过文件库时不刷新
  - `window.focus` / `visibilitychange` 中 `syncConnManagerUnreadSummary` 改为 `connManagerLoadedOnce` 条件调用
  - 保留首屏必要加载：`loadAgentStatusAndRenderCards()`（首页 Agent 卡片）、`syncRuntimeSummary()`（顶部 shell 模型/浏览器信息）
  - 保留通知推送时的 `loadTaskInbox` 和 `syncConnManagerUnreadSummary` 调用，badge 在有通知时才更新

---

## 2026-05-22 — Playground conversation catalog refresh coalescing

- **主题**: 消除 `/playground` 会话列表的重复 `GET /chat/conversations` 请求和 `net::ERR_ABORTED` 竞态
- **影响范围**: `src/ui/playground-conversations-controller.ts`, `src/ui/playground-stream-controller.ts`, `test/playground-conversations-controller.test.ts`, `docs/change-log.md`
- **变更**:
  - 新增 `scheduleConversationCatalogRefresh()` — 500ms 窗口内多次调用合并为一次非 force 的 `syncConversationCatalog`，timer callback 内先 `conversationCatalogSyncedAt = 0` 再调 sync，保证过期 catalog 被刷新但不 abort 正在进行的请求
  - `requestUpdateConversation()` 改为本地 `upsertConversationCatalogItem` + `scheduleConversationCatalogRefresh`，不再每次 `invalidateConversationCatalog` + `force: true` 重拉
  - `sendMessage()` 删除 `resolveServerActiveConversation` 前的多余非 force catalog sync（它被紧接的 force sync abort，是 `ERR_ABORTED` 的直接原因）
  - "done" 事件后调用 `scheduleConversationCatalogRefresh()`，延迟更新侧栏消息数和摘要
  - `requestDeleteConversation()` 仍保留 `invalidateConversationCatalog` + `force: true`，因为删除当前会话后需要服务端确定新 current conversation
  - 测试覆盖：`scheduleConversationCatalogRefresh` 行为测试（eval + fake setTimeout，断言合并、sync 调用次数、syncedAt 重置、flush 后可再调度），`requestUpdateConversation` 非 force 断言，`sendMessage` 无 premature sync 断言，done 事件 catalog refresh 断言

---

## 2026-05-22 — Playground conversation virtual scroll repair

- **主题**: 修复 `/playground` 会话列表虚拟滚动在移动端行高不匹配和 rAF 调度测试失真的问题
- **影响范围**: `src/ui/playground-conversations-controller.ts`, `test/playground-conversations-controller.test.ts`, `docs/change-log.md`
- **变更**:
  - 将移动端会话虚拟行高从 `80px` 调整为 `100px`，与真实移动样式 `92px` item 高度和 `8px` 列表间距对齐，避免移动抽屉滚动越深偏移越大
  - 将虚拟滚动 rAF 测试从源码正则检查改为实际调用调度函数并 flush pending callback，覆盖快速连续 scroll 只合并一次且不吞 render 的行为
  - 测试同步断言 `/playground` 样式中的移动端 item 高度与 gap，防止后续 CSS 改动再次让虚拟滚动数学漂移

---

## 2026-05-21 — Ali CodePlan DeepSeek model option

- **主题**: 在阿里 CodePlan 模型源下新增 `deepseek-v4-pro` 可选模型
- **影响范围**: `runtime/pi-agent/models.json`, `docs/model-providers.md`, `test/model-config.test.ts`, `test/agent-session-factory.test.ts`, `docs/change-log.md`
- **变更**:
  - `ali-codeplan` provider 继续使用 `ALI_CODEPLAN_API_KEY`、`anthropic-messages` 和现有阿里 CodePlan endpoint，只新增模型选项，不新增 provider
  - `/v1/model-config` 暴露的阿里模型列表从 `glm-5.1` / `kimi-k2.6` 扩展为 `glm-5.1` / `kimi-k2.6` / `deepseek-v4-pro`
  - 阿里模型上下文窗口按模型区分：`glm-5.1 = 20000`、`kimi-k2.6 = 256000`、`deepseek-v4-pro = 1000000`
  - 增加 registry 与 model-config 测试覆盖，避免模型只写进文档但没有进入真实下拉

---

## 2026-05-21 — Web-access scoped browser fallback fix

- **主题**: 修复带 `metaAgentScope` 但未命中 scope route 时，`web-access` 代理可能继承旧代理进程浏览器绑定的问题
- **影响范围**: `runtime/skills-user/web-access/scripts/local-cdp-browser.mjs`, `test/local-cdp-browser.test.ts`, `docs/change-log.md`
- **变更**:
  - scoped 请求如果找不到 `browser-scope-routes.json` 中的匹配 route，现在固定回落到 Browser Registry 的 `default` browserId，不再读取代理进程环境里的 `UGK_DEFAULT_BROWSER_ID`
  - 增加回归测试覆盖旧代理进程环境为 `chrome-02`、请求 scope 无 route 时仍应返回 `default` 的场景
  - 保持已有 route 优先级不变：命中 scope route 时继续使用 route 内的 `browserId` / CDP endpoint

---

## 2026-05-21 — Playground chat surface refinement

- **主题**: 优化主 `/playground` 对话界面的深浅主题视觉质感与基础交互
- **影响范围**: `src/ui/playground-styles.ts`, `src/ui/playground-theme-controller.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - 新增聊天专用 `--chat-*` 主题变量，分别管理深色与浅色主题下的消息表面、用户气泡、代码块、表格、composer 和悬浮滚动按钮
  - 将主聊天用户气泡从高饱和绿色改为更克制的主题化处理，浅色主题单独映射为冷白/淡绿边界
  - 优化消息正文、代码块、表格横向滚动、composer focus 和滚动到底按钮，保持无阴影、紧凑工作型 cockpit 风格
  - 移除主对话和首页背景里的散点、斜纹与漂移动画，改为静态细网格和线性边缘高光，让极客感来自工程化结构而不是波点装饰
  - 收敛消息气泡内部代码块、复制工具条和附件下载项的重复边框，减少“框套框”层级噪音
  - 将桌面左侧会话栏从卡片墙降级为低干扰聊天列表，隐藏非必要消息条数和默认菜单噪音，只突出当前会话

---

## 2026-05-21 — Playground asset library refinement

- **主题**: 优化 `/playground` 文件库列表主次层级并增加下载入口
- **影响范围**: `src/ui/playground-assets.ts`, `src/ui/playground-assets-controller.ts`, `src/ui/playground-theme-controller.ts`, `test/server.test.ts`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - 文件库资产项改为文件类型徽标、文件名、大小和短 id 的分层结构，去掉文件内容摘要，降低列表噪音；类型徽标按 archive / code / web / data / image / document / binary 等类型着色，并修正双行文字居中
  - 日期分组升级为跨列章节标题并显示该日期文件数，文件库内容区保留滚动但隐藏浏览器滚动条
  - 每个带 `downloadUrl` 的资产新增显式“下载”链接，复用 `/v1/files/:assetId?download=1` 的附件交付能力
  - 深色与浅色主题分别维护列表项、类型徽标、下载按钮和 active 状态，不把同一套半透明颜色强行混用

---

## 2026-05-21 — Team Plan UI scope boundary

- **主题**: 明确本阶段不再继续扩展 `/playground/team` 的可视化 Plan 创建能力
- **影响范围**: `docs/handoff-current.md`, `docs/team-runtime.md`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - 将 `/playground/team` 定位收口为 Team Runtime 执行、审计和排错 cockpit
  - 明确复杂 Plan 设计优先在 Agent 对话和 `team-plan-creator` skill 中完成，UI 只保留轻量创建辅助
  - 后续产品优先级转向真实运行 UX、失败恢复、attempt 查看、rerun 决策和测试 harness 小治理

---

## 2026-05-21 — Team parallel_research Plan draft v1.1

- **主题**: 增强 Team `parallel_research` 草案路由、模板文案和 `/playground/team` supported 模板显式选择
- **影响范围**: `src/team/plan-draft.ts`, `src/team/routes.ts`, `src/ui/team-page.ts`, `src/ui/team-page-helpers.ts`, `test/team-plan-draft.test.ts`, `test/team-routes.test.ts`, `test/team-page-ui.test.ts`, `docs/team-runtime.md`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - Plan draft router 仍是 deterministic heuristic，不调用 LLM；多对象研究、竞品/供应商/产品/pricing/alternatives/market map 等信号更稳定进入 `parallel_research`，普通单点研究仍走 `single_agent`
  - `parallel_research` draft 的 discovery / child research / final output contract 文案增强，明确 3 到 8 个高价值 item、source item identity、来源线索、横向对比和风险/未知项
  - `/playground/team` 自然语言草案模式新增 supported template 选择：`自动匹配`、`单 Agent`、`并行研究`；planned 模板仍只在 registry 中说明，不展示为可创建项
  - `POST /v1/team/plan-drafts` 仍只返回可检查的 Plan create payload，不持久化 Plan、不创建 Run、不修改 `runCount`

---

## 2026-05-21 — Team 自然语言 Plan 草案

- **主题**: 新增 Team Plan draft 的确定性模板层、API 和 `/playground/team` 自然语言创建模式
- **影响范围**: `src/team/plan-draft.ts`, `src/team/routes.ts`, `src/ui/team-page.ts`, `src/ui/team-page-helpers.ts`, `test/team-plan-draft.test.ts`, `test/team-routes.test.ts`, `test/team-page-ui.test.ts`, `docs/team-runtime.md`, `docs/playground-current.md`, `docs/change-log.md`
- **变更**:
  - 新增 `single_agent` / `parallel_research` supported 模板和 `coding_fix` / `deep_research_with_review` planned 模板；router 仅做确定性 shallow heuristic，不调用 LLM
  - 新增 `GET /v1/team/plan-templates` 和 `POST /v1/team/plan-drafts`；draft endpoint 只生成可检查的 Plan create payload，不持久化 Plan、不创建 Run、不修改 `runCount`
  - `/playground/team` Plan modal 新增「自然语言草案」模式：先生成草案并预览 JSON，用户确认后才提交 `POST /v1/team/plans`
  - 更新 Team Runtime / Playground 文档，明确 draft 和 run execution 的边界，planned 模板当前只展示不可执行

---

## 2026-05-21 — Team role prompt contract 抽取

- **主题**: 将真实 Team role runner 的 prompt builder、JSONish parser 和 output normalizer 抽到纯 contract 模块
- **影响范围**: `src/team/agent-profile-role-runner.ts`, `src/team/role-prompt-contract.ts`, `test/team-role-prompt-contract.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 新增 `src/team/role-prompt-contract.ts`，集中维护 worker/checker/watcher/finalizer/decomposer prompt 构造、checker/watcher JSONish fallback 和 decomposer 输出归一化
  - `AgentProfileRoleRunner` 保留 profile resolution、workspace 创建、AgentSession 调用、browser scope route/cleanup、abort handling 和 runtimeContext 附加职责
  - 新增纯模块 characterization 测试，覆盖 source item identity、output validation evidence、checker/watcher parser fallback、decomposer fallback 和 finalizer 权威汇总 prompt

---

## 2026-05-21 — Team run detail presenter 抽取

- **主题**: 将 Team run detail API 的 response shaping 从 `routes.ts` 抽到 presenter，route handler 只保留请求/响应适配
- **影响范围**: `src/team/routes.ts`, `src/team/run-presenter.ts`, `test/team-routes.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 新增 `src/team/run-presenter.ts`，集中构造 `GET /v1/team/runs/:runId` 和 disposition/rerun 后返回体中的 additive `taskDefinitions`
  - 保持 API shape 不变：`taskDefinitions` 继续由 expansion / decomposition records 汇总，旧 run / legacy plan 仍返回空数组
  - 新增 presenter 级测试，用真实 run state 形状验证 for_each 与 decomposition child definitions 的输出顺序和 `generatedSource`
  - 本轮未抽 role prompt contract；`agent-profile-role-runner.ts` 的 prompt/parser/session 边界较大，留给独立小步更稳，避免把最后清理扩大成高风险迁移

---

## 2026-05-21 — Team run detail scroll behavior helper 抽取

- **主题**: 将 Team run detail 的滚动快照、anchor 查找和滚动恢复逻辑抽到可单测的 UI behavior helper
- **影响范围**: `src/ui/team-page.ts`, `src/ui/team-run-detail-behavior.ts`, `test/team-page-ui.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 新增 `src/ui/team-run-detail-behavior.ts`，导出 `captureRunDetailScrollSnapshot()`、`findRunDetailScrollAnchor()`、`restoreRunDetailScrollSnapshot()` 和注入 inline UI 的脚本片段
  - `refreshRunDetailInPlace()` 保留原地刷新职责，滚动恢复改为调用 helper；`setTaskDisposition()` 仍在 `PATCH /manual-disposition` 前捕获 snapshot
  - 新增真实行为测试，用 fake DOM/window 验证特殊 task id 通过 `data-task-id` 属性比对恢复 anchor，不拼 unsafe selector，也不 collapse run detail

---

## 2026-05-21 — Team RunWorkspace adapters 拆分

- **主题**: 将 `RunWorkspace` 内部 state、attempt、artifact、record 读写职责拆到小 store，保留 facade 兼容既有调用
- **影响范围**: `src/team/run-workspace.ts`, `src/team/run-workspace-state.ts`, `src/team/run-workspace-attempts.ts`, `src/team/run-workspace-artifacts.ts`, `src/team/run-workspace-records.ts`, `src/team/output-validator.ts`, `src/team/routes.ts`, `test/team-run-workspace.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 新增 `RunStateStore`、`RunAttemptStore`、`RunArtifactStore`、`RunRecordStore`，分别承接 run state/lease、attempt metadata/files、final report/run-scoped reads、expansion/decomposition 与 child state append
  - `RunWorkspace` 保留原公开方法并委托给 adapters；`.data/team/runs` 目录布局、attempt 文件名和 persisted JSON schema 不变
  - `output-validator` 改为依赖窄 reader 接口；final report 路由改走 workspace artifact facade，不再直接拼磁盘路径
  - 补充 adapter 兼容性测试，验证 adapters 写出的 state/attempt/final-report/expansion/child state 仍可由 facade 读回

---

## 2026-05-21 — Team plan validation module 抽取

- **主题**: 将 Team Plan create/update schema policy 从 `PlanStore` 抽到专用 validation module
- **影响范围**: `src/team/plan-validation.ts`, `src/team/plan-store.ts`, `test/team-plan-store.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 新增 `validateCreatePlanInput()` 和 `validatePlanTasks()`，集中维护 task type、decomposer、`for_each`、outputCheck 规则
  - `PlanStore` 保留 Plan 持久化、读取、删除、归档和 `runCount` 不变式；create/update 行为和错误语义不变
  - 补充模块级 validation 测试，并保留原有 PlanStore/API validation 覆盖

---

## 2026-05-21 — Team task attempt lifecycle runner 抽取

- **主题**: 将单个 task 的 worker/checker/watcher attempt 生命周期从 `TeamOrchestrator` 抽到专用 runner
- **影响范围**: `src/team/task-attempt-runner.ts`, `src/team/orchestrator.ts`, `test/team-orchestrator-lifecycle.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 新增 `TaskAttemptLifecycleRunner`，集中处理 attempt 创建、worker/checker/watcher phase、checker retry、watcher retry、timeout、output validation、accepted/failed result 写入和 attempt metadata 记录
  - `TeamOrchestrator` 保留 run lifecycle、task ordering、dynamic expansion、controlled decomposition 和 finalizer，普通 task 执行委托给 attempt runner
  - 保持 worker/checker/watcher prompt schema、persisted file names、discovery standardization、pause/cancel/timeout 和 output validation 语义不变
  - 新增模块级真实状态测试，直接验证 runner 可写入 succeeded task state、`accepted-result.md` 与 worker/checker/watcher metadata

---

## 2026-05-21 — Team child execution module 抽取

- **主题**: 将 `for_each` expanded child 的 sequential / parallel 执行拓扑从 `TeamOrchestrator` 抽到内部模块
- **影响范围**: `src/team/child-execution.ts`, `src/team/orchestrator.ts`, `test/team-orchestrator-dynamic-expansion.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 新增 `ExpandedChildExecutionModule`，集中处理 sequential child loop、parallel refill pool、fatal drain、parent status aggregation 和 scoped child state writer
  - `TeamOrchestrator` 保留 expansion 生成、run-level 生命周期和 task type 分发，不再直接维护 expanded child 执行拓扑
  - 保持 expansion record、child task ID、`for_each.sequential` / `for_each.parallel` 父聚合、pause/cancel/rerun 行为不变
  - 新增模块级真实状态测试，覆盖 sequential child 顺序执行与失败 child 聚合

---

## 2026-05-21 — Team parallel state writer 显式化

- **主题**: 将 `executeChildrenParallel` 中的 `saveState` monkey-patch 替换为显式 `TeamStateWriter` / `ParallelChildStateWriter`
- **影响范围**: `src/team/orchestrator.ts`, `test/team-parallel-foreach.test.ts`, `test/team-orchestrator-controls.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 新增 `TeamStateWriter` 接口（`saveState(state: TeamRunState): Promise<void>`）和 `ParallelChildStateWriter` 内部类（scoped 到单个 child task，通过 `patchState` 隔离写入）
  - 删除 `AsyncLocalStorage`（`parallelTaskId`）和 `this.workspace.saveState` 临时覆盖/恢复块
  - `executeMaybeDecomposedTask` / `executeTask` / `runWorkUnit` / `runWatcherPhase` 接受 `writer: TeamStateWriter = this.workspace` 参数，parallel child 使用 scoped writer，sequential path 仍用默认 workspace
  - 补回归测试：parallel child state isolation（6 并发 child，各 resultRef 独立）、cancel during parallel（no child left running）

## 2026-05-21 — Team mindmap disposition scroll snapshot timing fix

- **主题**: 修复脑图 task 标记按钮点击后仍可能跳回顶部的问题
- **影响范围**: `src/ui/team-page.ts`, `test/team-page-ui.test.ts`, `docs/change-log.md`
- **变更**:
  - `setTaskDisposition()` 在发起 `PATCH /manual-disposition` 之前立即捕获当前 run detail 滚动快照和 `data-task-id` anchor，避免异步请求期间页面被刷新/焦点行为影响后才保存错误位置
  - `refreshRunDetailInPlace()` 支持接收预先捕获的 scroll snapshot，并继续使用属性比对方式恢复 anchor，避免 unsafe selector 拼接
  - 新增回归测试，明确约束 scroll snapshot 必须早于 PATCH 捕获，并传入原地刷新函数

---

## 2026-05-21 — Team Plan / Run ID 完整展示与点击复制

- **主题**: Team 页面 Plan ID 和 Run ID 完整展示，点击即可复制，不再截断显示
- **影响范围**: `src/ui/team-page.ts`, `src/ui/team-page-helpers.ts`, `test/team-page-ui.test.ts`, `docs/change-log.md`, `docs/team-runtime.md`
- **变更**:
  - Plan dashboard card 和 plan detail 顶部显示完整 `planId`，使用 `.team-id-label` 样式，点击复制
  - Run card 中 Run ID 从 `slice(0, 12) + '...'` 截断改为完整展示，使用 `.team-id-label` 样式，点击复制
  - 新增 `writeTeamClipboardText()` / `copyTeamIdToClipboard()` clipboard helper，优先 `navigator.clipboard.writeText`，fallback 到临时 textarea + `execCommand("copy")`
  - 复制成功后 label 文本变「已复制」并加 `.is-copied` 样式，约 1200ms 后恢复原 ID
  - 点击 ID label 不触发外层卡片行为（`event.stopPropagation()` + `event.preventDefault()`）
  - helper mirror (`team-page-helpers.ts`) 与 inline renderer 输出关键 token 保持一致
  - 恶意 planId/runId 在可见文本和 HTML 属性中使用 `escapeHtml()` 转义，JS 参数使用 `jsArg()` 转义

---

## 2026-05-21 — Team Runtime: force_rerun autoclear & disposition scroll preservation

- **主题**: 被强制重跑的任务在成功后自动清除标记；UI disposition 操作不再导致页面跳回顶部
- **影响范围**: `src/team/orchestrator.ts`, `src/ui/team-page.ts`, `docs/team-runtime.md`, `docs/change-log.md`, `test/team-orchestrator-controls.test.ts`, `test/team-page-ui.test.ts`
- **变更**:
  - `clearSuccessfulForceRerunDispositions()`: 在 run 进入终端状态时（finalizer 完成、failRun、handleTimeout），遍历 taskStates，将 `manualDisposition === "force_rerun"` 且 `status === "succeeded"` 的任务标记清除为 `"default"`，避免下次 rerun 重复执行
  - 不清除：failed/cancelled/interrupted/pending/running/skipped 的 forced task；`skip` 标记不自动清除
  - 适用所有 task 类型：normal、for_each child、decomposed child、parent
  - UI: `setTaskDisposition` 改为调用 `refreshRunDetailInPlace`（原地刷新），不再 hide+toggleRunDetail（避免 collapse+scroll jump）
  - `refreshRunDetailInPlace` 使用 anchor-based scroll restoration：`data-task-id` 属性标注 mindmap node 和 detail table row，操作后 `requestAnimationFrame` 恢复视口位置

---

## 2026-05-20 — Team Runtime P27: parallel for_each 并行执行与运行控制

- **主题**: `for_each` 任务支持并行执行模式，pause/cancel/rerun 已覆盖 parallel 子任务的状态保护和恢复
- **影响范围**: `src/team/orchestrator.ts`, `src/team/plan-store.ts`, `src/team/types.ts`, `src/team/task-expansion-planner.ts`, `test/team-orchestrator-controls.test.ts`, `test/team-orchestrator-dynamic-expansion.test.ts`, `test/team-parallel-foreach.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`, `.pi/skills/team-plan-creator/SKILL.md`
- **变更**:
  - `forEach.mode` 支持 `"parallel"`，子任务通过固定容量池（容量 3）并发执行，child 完成即补位
  - parallel 并发 state 写入使用 `patchState` + `parallelTaskId`（`AsyncLocalStorage`），避免并发覆盖
  - `parallel + taskTemplate.decomposer.mode leaf/propagate` 在 Plan 创建/更新时被拒绝；`decomposer.mode = "none"` 或无 decomposer 允许
  - `pauseRun` 标记所有 running 任务为 `interrupted`（含 parallel 子任务）
  - `resumeRun` 将 `interrupted` 任务重置为 `pending`，确保恢复后可重新执行
  - parallel `saveState` override 增加 stale-write protection：`latest.status !== "running"` 和 task terminal/interrupted guard，防止 pause/cancel 后的迟到写入覆盖中断/取消状态
  - partial success 语义：至少一个 child succeeded → parent succeeded；全部 skipped → skipped；否则 failed
  - rerun `force_rerun` / `skip` disposition 对 parallel 子任务同样生效；expansion record 复用不重复生成

---

## 2026-05-20 — 新增阿里 CodePlan 模型源

- **主题**: 接入阿里 CodePlan Anthropic-compatible 模型源，新增 `ali-codeplan` provider 与独立 `ALI_CODEPLAN_API_KEY`
- **影响范围**: `runtime/pi-agent/models.json`, `.env.example`, `src/config.ts`, `docs/model-providers.md`, `test/agent-session-factory.test.ts`, `test/model-config.test.ts`, `test/config.test.ts`, `test/containerization.test.ts`
- **变更**:
  - 新增 `ali-codeplan` provider，走 `anthropic-messages` 和 `https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic`
  - 登记 `glm-5.1` 与 `kimi-k2.6` 两个模型，key 使用环境变量 `ALI_CODEPLAN_API_KEY`
  - 本地 `阿里codeplan-api-2026-5.txt` 仅在 `UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP=true` 时作为开发 bootstrap 辅助读取
  - `readApiKeyFromText(...)` 兼容 `akikey` 拼写，避免把本地说明文件误当正式配置入口

---

## 2026-05-20 — 新增 http-access 轻量网络访问技能

- **主题**: 新增独立系统 skill `http-access`，用于无浏览器实体的 HTTP(S) 网络访问，当前默认关闭，由 Agent Profile 技能开关选择启用
- **影响范围**: `.pi/skills/http-access/SKILL.md`, `.pi/skills/http-access/scripts/http_access.mjs`
- **变更**:
  - 新增 `http-access` 技能说明，职责限定为普通 HTTP(S) 请求、JSON API、静态 HTML、RSS/sitemap、HEAD 检查和文件下载
  - 技能不感知也不协调 `web-access`；二者冲突由 Agent Profile / skill 开关 / 安装隔离处理
  - 新增 `http_access.mjs` CLI，支持 `request`、`json`、`html`、`extract`、`head`、`download`
  - 脚本仅接受 `http:` / `https:` URL，默认设置 timeout、最大响应体读取限制和 User-Agent
  - Agent 管理页的复制安装来源改为 `GET /v1/agents/main/skills`，使 main 已安装但 disabled 的系统技能仍可作为复制安装候选
- **验证**: `node --check .pi/skills/http-access/scripts/http_access.mjs`；临时本地 HTTP server 验证 `json/html/extract/head/download` 通过；focused `/playground/agents` 页面测试通过

---

## 2026-05-20 — Team Run Action 安全转义修复

- **主题**: 修复 `renderRunActions(...)` 中 `r.runId` 直接拼入 `onclick` handler 的 XSS 风险；收口 helper mirror 与 inline renderer 的行为漂移
- **影响范围**: `src/ui/team-page.ts`, `src/ui/team-page-helpers.ts`, `test/team-page-ui.test.ts`, `test/server.test.ts`
- **变更**:
  - `renderRunActions(...)`: `r.runId` 改用 `jsArg(r.runId)` 构建 onclick 参数，消除引号/HTML注入风险
  - `renderPlanRunCard` helper mirror: cancelled run 补上 `按标记重跑` 按钮；onclick 参数改用 `jsArg` 安全转义；与 inline renderer 行为对齐
  - 新增 `jsArg` helper 函数（非 export）用于安全 JS 参数构建
  - 新增 10 个测试覆盖恶意 runId 转义、cancelled/completed/failed 各状态按钮、helper mirror 行为
  - parity test 的假 `renderRunActions` stub 已移除，改为提取真实 inline 函数
- **验证**: focused tests 34 pass, `npm run test:team` 756 pass / 0 fail / 2 skip, `npx tsc --noEmit` clean

---

## 2026-05-20 — Conn 每日执行编辑保存修复

- **主题**: 修复后台任务编辑每日执行时，已选择时间仍提示“请填写每日执行时间”导致无法保存的问题
- **影响范围**: `src/ui/conn-page-js.ts`, `test/conn-page-ui.test.ts`
- **变更**:
  - 每日执行保存改为从日期时间选择器值中提取 `HH:mm`，兼容 `09:30`、`2026-05-20 09:30`、`2026/05/20 09:30`
  - 编辑已有每日执行任务时，从 `nextRunAt` 或 cron expression 回填时间输入，避免不改时间直接保存失败
- **验证**: `node --test --import tsx test/conn-page-ui.test.ts` 通过

---

## 2026-05-19 — Team 脑图 Task 标记控件

- **主题**: 在 Team run detail 脑图 task 节点上增加手动标记控件（跳过、强制重跑、恢复默认），复用已有 `setTaskDisposition(...)` 和 `PATCH /v1/team/runs/:runId/tasks/:taskId/manual-disposition`
- **影响范围**: `src/ui/team-page.ts`, `test/team-page-ui.test.ts`, `test/server.test.ts`
- **变更**:
  - `buildMindmapNodes(...)`: plan task / generated child / orphan child 节点携带 `manualDisposition`
  - `renderMindmapNode(...)`: 接受 `runStatus` 参数；对 terminal run 的实际 task 节点渲染 disposition 按钮和 badge
  - `renderTeamMindmap(...)`: 传递 `state.status` 给 `renderMindmapNode`
  - 控件仅对 terminal run（completed / completed_with_failures / failed / cancelled）显示，active run 不显示
  - `按标记重跑` 按钮在 run-level actions 中保持可见
  - 无后端 route 变更，无 persisted state schema 变更
- **验证**: focused mindmap disposition tests (team-page-ui + server.test), `npm run test:team` 746 pass / 0 fail / 2 skip, `npx tsc --noEmit` 通过

---

## 2026-05-19 — Conn Run 手动终止

- **主题**: 给后台 conn 运行任务补正式手动终止能力，替代直接修改运行态 SQLite 的救火操作
- **影响范围**: `src/agent/conn-run-store.ts`, `src/routes/conns.ts`, `src/workers/conn-worker.ts`, `src/ui/conn-page-js.ts`, `src/ui/conn-page-css.ts`, `test/conn-run-store.test.ts`, `test/conn-worker.test.ts`, `test/server.test.ts`
- **变更**:
  - 新增 `ConnRunStore.cancelRun()`：仅允许取消 `pending` / `running` run，写入 `cancelled`、`finished_at`，清理 `lease_owner` / `lease_until`
  - 新增 `POST /v1/conns/:connId/runs/:runId/cancel`：校验 run 属于目标 conn，终止后返回最新 run
  - conn worker 心跳发现 run 已被外部取消时，向后台 runner 传入的 `AbortSignal` 发出 abort
  - Conn 独立工作台在 `pending` / `running` 运行记录上显示“终止”按钮，带确认弹窗和状态刷新
- **验证**: `node --test --test-concurrency=1 --import tsx test/conn-run-store.test.ts`, `node --test --test-concurrency=1 --import tsx test/conn-worker.test.ts`, focused `test/server.test.ts`, `npx tsc --noEmit`, `git diff --check` 均通过

---

## 2026-05-19 — Team UI Skip 测试迁移

- **主题**: 收口 `npm run test:team` 中 73 个 `[MIGRATION: inline extraction]` skip 测试，从 73 降至 13
- **影响范围**: `src/ui/team-page.ts`, `src/ui/team-page-helpers.ts`（新增）, `test/team-page-ui.test.ts`
- **变更**:
  - 删除 `renderPlanCard`、`_legacyCards` 及关联死代码（renderPlanSummary、renderPlanTaskPreview 等）
  - 新增 `src/ui/team-page-helpers.ts`：提取纯函数（escapeHtml、dashboard 数据 helpers、renderPlanDashboardCard、renderDynamicPlanDesign、renderNormalPlanDesign、renderPlanRunCard 等）
  - 44 个 skip 测试改为从 helpers 模块直接导入测试（P19-T1/T2/T4/T5、P21-D1）
  - 16 个 skip 测试因关联 renderPlanCard 死代码被删除（P14-T1: 9、P16-T3: 7）
  - 更新 P13 测试引用当前 renderPlanDashboardCard/renderPlanDetailContent
- **剩余 13 skip 原因**:
  - P8-E (1): renderTaskDetail ~200 行 inline 函数，deep deps，需大规模重构
  - P15-fix (4): 同 renderTaskDetail 依赖链
  - P16-T1 (2): buildDynamicPlanPayload 直接读取 DOM，需分离纯逻辑
  - P21-D2 (4): 同 renderTaskDetail 依赖链
  - P21-D-fix (1): SSE 订阅模式，需浏览器上下文
  - P19-T5 updateRunCard (1): inline CSS selector 模式匹配
- **验证**: `npm run test:team` 707 pass / 13 skip / 0 fail, `npx tsc --noEmit` 通过

---

## 2026-05-19 — Team UI Run Detail Helper Extraction

- **主题**: 提取 dynamic plan payload builder 和 run detail view model helpers，从 13 skip 收口至 2
- **影响范围**: `src/ui/team-page-helpers.ts`, `test/team-page-ui.test.ts`
- **变更**:
  - 新增 `buildDynamicPlanPayloadFromValues(values)` 纯函数：分离 DOM 读取和 payload 构建逻辑，inline `buildDynamicPlanPayload()` 保留为 DOM wrapper
  - 新增 `splitAcceptanceLines(text)` 工具函数
  - 新增 `buildTaskDetailModel(state, plan)` view model builder：提取 generated child 分组、decomposition/for_each 分类、orphan 检测
  - 新增 `childSourceFor(parent, childIds, taskById)` 和 `childGroupLabel(source)` 分类 + 标签函数
  - 新增 `renderRuntimeContextHelper(role, ctx)` mirror helper（与 inline `renderRuntimeContext` parity-tested）
  - 移除 11 个 skip 测试，替换为 helper 直接测试 + inline parity 测试：
    - P16-T1 (2 → 0): `buildDynamicPlanPayloadFromValues` 纯函数测试 + inline parity
    - P8-E (1 → 2): `renderRuntimeContextHelper` escaping 测试 + inline parity
    - P15-fix (4 → 4): `buildTaskDetailModel` generated children 测试
    - P21-D2 (4 → 7): `buildTaskDetailModel` decomposition 测试 + inline renderTaskDetail parity
- **剩余 2 skip 原因**:
  - P19-T5 updateRunCard (1): inline CSS selector 模式匹配 + live DOM innerHTML mutation，需浏览器上下文
  - P21-D-fix SSE detail refresh (1): SSE EventSource 订阅模式，需浏览器上下文
- **验证**: `npm run test:team` 734 pass / 2 skip / 0 fail, `npx tsc --noEmit` 通过

---

## 2026-05-19 — Team UI Helper Parity Fix

- **主题**: 修复 team-page-helpers.ts 虚假自动同步注释，补 helper vs inline script parity 测试，恢复 dashboard active run current task title
- **影响范围**: `src/ui/team-page-helpers.ts`, `test/team-page-ui.test.ts`, `test/server.test.ts`
- **变更**:
  - 修正 `team-page-helpers.ts` 顶部注释：从声称 `buildHelpersBlock() + fn.toString()` 自动同步改为诚实描述为 parity-tested mirror helper
  - `renderPlanDashboardCard` helper 补上 active run current task title 查找逻辑（使用 `safePlan.tasks` 匹配 inline 行为）
  - 恢复 `P19-T2: active run card shows current task summary` 测试中的 `Task Two` 断言
  - 新增 8 个 parity 测试：提取 inline script 中对应函数，对同一输入比较关键输出 token
  - 覆盖函数：renderPlanDashboardCard、renderDynamicPlanDesign、renderNormalPlanDesign、renderPlanRunCard
  - 新增 `test/server.test.ts` scoped run detail expansion 测试（从 dirty hunk 中选择性 stage）
  - 更新 mindmap toggleMindmapNode 签名测试（sourceEl 参数）
  - P19-T5 updateRunCard skip 补 TODO 和 `[MIGRATION: inline extraction]` 标记
- **验证**: `npm run test:team` 715 pass / 13 skip / 0 fail, `npx tsc --noEmit` 通过

---

## 2026-05-19 — Team Summary 审核修复

- **主题**: 修复 Team run summary 派生逻辑的审核问题，确保所有路径保存的 summary 同步反映 taskStates
- **影响范围**: `src/team/orchestrator.ts`, `test/team-summary.test.ts`, `test/team-orchestrator-controls.test.ts`
- **变更**:
  - `test/team-summary.test.ts`: 用类型安全的 `taskState()` fixture 替换 `progress: null`，消除 `npx tsc --noEmit` 错误
  - `src/team/orchestrator.ts` `handleTimeout()`: 在 `finishUnfinishedActiveAttempts` 之后、`saveState` 之前插入 `computeTeamRunSummary(state.taskStates)`，修复 timeout 路径 stale summary
  - `src/team/orchestrator.ts`: 删除 `private recomputeSummary()`，`skipGeneratedChildren()` 改用 `computeTeamRunSummary(state.taskStates)`，修复 generated child skip 路径沿用旧 `totalTasks` 的 bug
  - `test/team-orchestrator-controls.test.ts`: 恢复 external AbortSignal 测试（从 `test.skip` 改为确定性 barrier），新增 timeout summary 和 generated child skip summary 回归测试
- **测试结果**: `npm run test:team` — 671 pass / 73 skip / 0 fail
- **验证**: `npx tsc --noEmit` 通过，`git diff --check` 通过

---

## 2026-05-19 — Team 测试基线对齐

- **主题**: 对齐测试断言与当前真实行为，让 `npm run test:team` 失败语义可信
- **影响范围**: `test/team-plan-store.test.ts`, `test/team-routes.test.ts`, `test/team-page-ui.test.ts`
- **变更**:
  - `team-plan-store.test.ts`: `runCount>0 cannot hard delete` 改为 `runCount>0 can hard delete (cee24fe)`，断言删除后 `get(planId) === null`
  - `team-routes.test.ts`: 新增 `Plan delete with existing runs succeeds (cee24fe)` 测试，验证删除 plan 后 run detail 不 500
  - `team-page-ui.test.ts`:
    - 修复 `renderRunActions` 测试：匹配当前 `pauseRunWithConfirm`/`resumeRunWithConfirm`/`cancelRunWithConfirm`
    - 修复 `P12-T4 pause/resume` 测试：匹配当前确认弹窗行为
    - 跳过 73 个基于 inline function extraction 的过期测试（P14 renderPlanCard、P15-fix、P16 buildDynamicPlanPayload、P19 dashboard helpers、P21 decomposer badges），标记为 `[MIGRATION: inline extraction]`
- **测试结果**: `npm run test:team` — 171 pass / 73 skip / 0 fail
- **验证**: `npx tsc --noEmit` 通过

---

## 2026-05-19 — Team Run 详情展开作用域修复

- **主题**: 修复同一 run 同时出现在计划详情和运行记录时，点击展开可能更新隐藏详情容器、可见区域一直显示加载中的问题
- **影响范围**: `src/ui/team-page.ts`, `test/server.test.ts`
- **变更**:
  - Team Run 详情展开、脑图节点折叠、详情 / 脑图切换、任务手动标记刷新统一优先按被点击卡片查找 `.run-detail`
  - 运行记录刷新后恢复已展开 run 时限定在当前列表容器内，避免重复 `run-detail-*` id 拿到隐藏节点
- **验证**:
  - `node --test --test-concurrency=1 --import tsx test/server.test.ts --test-name-pattern "scopes run detail|failed mindmap|adaptive node|mindmap view shell|safe detail"`
  - `npx tsc --noEmit`
  - `git diff --check -- src\ui\team-page.ts test\server.test.ts`
  - 真实入口 `http://127.0.0.1:3000/playground/team` 验证 `run_925716b3ec96` 在计划详情和运行记录中均可展开脑图

---

## 2026-05-18 — Team Run 纵向思维导图视觉打磨

- **主题**: 为 Team Run 详情添加科技感纵向思维导图视觉、响应式 CSS 和文档
- **影响范围**: `src/ui/team-page.ts`, `docs/team-runtime.md`
- **变更**:
  - 添加 mindmap CSS 类：`.mindmap-view-toggle`, `.team-mindmap`, `.mindmap-canvas`, `.mindmap-root-node`, `.mindmap-task-node`, `.mindmap-children`, `.mindmap-node-error`, `.mindmap-node-details`, `.mindmap-group-toggle`
  - 状态选择器：`[data-node-status="running"]` 带 pulse 动画，`succeeded` 绿色边框，`failed` 红色边框，`skipped`/`cancelled` 淡化
  - 连接线：`.mindmap-children::before` 纵向主干 + `.mindmap-task-node::before` 横向分支
  - 移动端 `@media (max-width: 720px)` 收口为纵向树卡片，隐藏连接线，禁止横向滚动
  - 替换渲染函数中 inline styles 为 CSS classes（保留动态 `margin-left`）
  - `renderTeamMindmap` 添加 `.mindmap-canvas` 内层包装
  - `renderRunDetailShell` toggle 使用 `.mindmap-view-toggle-btn` CSS class（`.active` 控制高亮）
  - 更新 `docs/team-runtime.md` Run 脑图视图段落
- **测试**: `test/server.test.ts` 新增 `mindmap visual polish CSS classes` 断言
- **commits**: (本轮提交)

---

## 2026-05-18 — Team Runtime P26: Output Contract Validation

- **主题**: 为 Team Runtime 增加确定性的输出协议校验，阻止 discovery / structured child 输出被 checker/watcher 口头通过绕过
- **影响范围**: `src/team/types.ts`, `src/team/output-validator.ts`, `src/team/orchestrator.ts`, `src/team/run-workspace.ts`, `src/team/role-runner.ts`, `src/team/agent-profile-role-runner.ts`, `src/team/task-expansion-planner.ts`, `docs/team-runtime.md`
- **变更**:
  - `TeamTask` 新增 `outputCheck`，`forEach.taskTemplate.outputCheck` 可随生成子任务持久化到 expansion record；旧 plan / 旧 expansion 缺失字段时兼容读取
  - 新增 deterministic `TeamOutputValidationResult` 与 `src/team/output-validator.ts`，覆盖 `json_items`、`json_object`、`html_fragment`、`file_exists`
  - discovery 自动派生 `{ type: "json_items", outputKey, requiredFields: ["id"] }` 硬校验；校验失败会让 work unit failed，checker/watcher 不能用自然语言 pass/accept 绕过
  - checker/watcher prompt 注入 validation evidence；`ok=false` 时明确禁止 `pass` / `accept_task`
  - 支持安全解析 run-scoped 引用文件，包含 `worker/foo.json`、`checker/...`、`watcher/...`、`output/...`、`work/...` 和当前 run 下的绝对/相对路径；拒绝 `worker/../../.env`、`/etc/passwd`、Windows drive path 等越界引用
  - 回归覆盖 `run_943b995d6adc` 失败形状：checker 只引用 `worker/hk-cloud-server-scan.json（...）` 时 runtime 能读取 role workspace JSON 并展开 `evaluate_each`
- **测试**:
  - `test/team-output-validator.test.ts`
  - `test/team-output-contract-regression.test.ts`
  - `test/team-agent-profile-runner.test.ts`
  - `test/team-task-expansion-planner.test.ts`
  - `test/team-orchestrator-lifecycle.test.ts`
- **commits**:
  - `9bbb424` feat(team): add output check contract types
  - `c0c1603` feat(team): add deterministic output validator
  - `526c9bc` fix(team): enforce output validation before acceptance
  - `32dfe61` fix(team): inject output validation into role prompts
  - `d9209a5` feat(team): validate structured outputs for generated children
  - `5365197` test(team): lock discovery referenced file regression

---

## 2026-05-18 — Local Team Worker Browser Environment Fix

- **主题**: 修复本地 `ugk-pi-team-worker` 缺少 browser runtime 环境导致 Team run 选择的 `chrome-01` / `chrome-02` 不生效
- **影响范围**: `docker-compose.yml`, `test/containerization.test.ts`
- **变更**:
  - 为本地 `ugk-pi-team-worker` 补齐 `WEB_ACCESS_BROWSER_PROVIDER`, `WEB_ACCESS_CDP_HOST`, `WEB_ACCESS_CDP_PORT`, `UGK_DEFAULT_BROWSER_ID`, `UGK_BROWSER_INSTANCES_JSON`, `UGK_BROWSER_SCOPE_ROUTE_CACHE_PATH`, `WEB_ACCESS_BROWSER_PUBLIC_BASE_URL` 和 browser upload bridge 环境变量
  - 为本地 `ugk-pi-team-worker` 挂载 `/app/.data/browser-upload`，与 app / sidecar 的上传桥保持一致
  - `containerization.test.ts` 增加 team worker service block 级断言，避免只因主服务包含 browser env 就误判 compose 正确
- **验证**:
  - `node --test --test-concurrency=1 --import tsx test/containerization.test.ts`
  - `npx tsc --noEmit`

---

## 2026-05-18 — Team Runtime P25: Finalizer Authoritative Summary and Skipped Semantics

- **主题**: Finalizer 接收权威运行汇总禁止重算；skipped 任务与失败分离；succeeded-but-limited 外部数据源不入失败汇总
- **影响范围**: `src/team/role-runner.ts`, `src/team/agent-profile-role-runner.ts`, `src/team/orchestrator.ts`, `docs/team-runtime.md`
- **变更**:
  - `FinalizerInput` 新增 `runSummary`（来自 `TeamRunState.summary`），`taskResults` 扩展支持 `cancelled` 状态、`previousErrorSummary`、`manualDisposition`
  - `buildFinalizerPrompt` 生成权威运行汇总块并指示 finalizer 不得重新计算计数
  - 跳过任务在 finalizer 输入中 `errorSummary` 置 null，旧错误移入 `previousErrorSummary` 标记为历史/审计上下文
  - `rerunRun` 对 skip disposition 的 task 清除 `errorSummary`
  - `generateFallbackReport` 包含权威运行汇总、中文状态标签、skipped 任务显示为"跳过"
  - Finalizer prompt 添加限制/警告指令：succeeded 任务提到外部数据源限制时列入"限制与警告"而非"失败/未完成"
- **测试**: 新增 3 个测试覆盖权威汇总 prompt、skipped error 语义、limited success 口径、fallback report 一致性
- **commits**:
  - `8993867` fix(team): pass authoritative run summary to finalizer
  - `29eb931` fix(team): separate skipped task state from previous errors
  - `b7c0e93` fix(team): keep limited successful tasks out of failure summaries
  - `d3f3343` fix(team): align fallback finalizer report with task summary semantics

---

## 2026-05-18 — Team Runtime P25 Review Fixes: Skipped Audit Persistence and Fallback Detail Parity

- **主题**: 修复 P25 审核发现的三个 wiring 缺陷：previousErrorSummary 未持久化、finalizer 从已清空的 errorSummary 读取、fallback report 只遍历 plan.tasks
- **影响范围**: `src/team/types.ts`, `src/team/orchestrator.ts`, `test/team-orchestrator-controls.test.ts`, `docs/team-runtime.md`
- **变更**:
  - `TeamTaskState` 新增 `previousErrorSummary?: string | null`，旧 persisted state 无此字段时兼容加载
  - `rerunRun()` skip 路径在清除 `errorSummary` 前保存到 `previousErrorSummary`；重新执行路径清除 `previousErrorSummary`
  - `runFinalizer()` 从持久化 `previousErrorSummary` 读取，而非已清空的 `errorSummary`
  - `generateFallbackReport()` 改为遍历 `state.taskStates`（含 generated/decomposed 子任务），用 `plan.tasks` 做 title 查找
  - 修复 bad `boolean.toString()` 测试断言
- **测试**: 新增 5 个测试覆盖 previousErrorSummary 持久化、旧数据兼容、真实 rerun 路径 finalizer 输入捕获、generated child fallback 报告、previousErrorSummary fallback 展示
- **commits**:
  - `9cd72be` fix(team): preserve previous error when skipping task on rerun
  - `da27b3f` fix(team): pass skipped task audit error to finalizer
  - `687869b` test(team): verify previousErrorSummary persistence and fallback report parity

---

## 2026-05-18 — Team Runtime P24: Run Rerun with Manual Task Control

- **主题**: 终态运行可按任务标记重跑——支持跳过、强制重跑、恢复默认三种 disposition
- **影响范围**: `src/team/types.ts`, `src/team/orchestrator.ts`, `src/team/run-workspace.ts`, `src/team/role-runner.ts`, `src/team/agent-profile-role-runner.ts`, `src/team/routes.ts`, `src/team/progress.ts`, `src/ui/team-page.ts`
- **变更**:
  - 类型新增 `TaskManualDisposition`（default/skip/force_rerun）、`"skipped"` 状态、`ProgressPhase.skipped`、`summary.skippedTasks`
  - `shouldExecuteOnRerun()` 决策表：skip→不执行、force_rerun→执行、default+succeeded→复用、default+非succeeded→执行
  - `rerunRun()` 重开终态运行，按 disposition 重置任务状态，清除旧 final report，并重置 activeElapsedMs/startedAt，避免旧执行窗口导致重跑秒超时
  - 父任务在子任务变更时自动重置为 pending，确保重跑时重新聚合
  - API 路由：单任务/批量 disposition PATCH、POST rerun
  - UI 控件：终态 run 显示"按标记重跑"按钮，任务行显示跳过/强制重跑/恢复默认操作
  - Finalizer 区分 skipped 与 failed，parent 聚合支持 all-skipped→skipped
- **测试**: 新增 34 个测试覆盖 disposition 决策表、rerun 生命周期、API 路由、parent 聚合

---

## 2026-05-18 — Team Page Inline Script Syntax Fix

- **主题**: 修复 Team 页面运行卡片增量更新脚本多余闭合括号导致页面无法加载的问题
- **影响范围**: `src/ui/team-page.ts`
- **变更**:
  - 移除 `updateRunCard` 中提前闭合函数体的多余 `}`，避免 inline script 在浏览器中抛出 `Unexpected token`
  - 保持终态 run 的 SSE 退订与刷新逻辑在 `updateRunCard` 内执行

---

## 2026-05-18 — Team Plan Creator Skill Dynamic Plan Guidance

- **主题**: 更新运行时 `team-plan-creator` skill 的 TeamUnit 五角色和 dynamic plan 创建口径
- **影响范围**: `.pi/skills/team-plan-creator/SKILL.md`
- **变更**:
  - TeamUnit 创建说明从 4 角色更新为 5 角色，补齐 `decomposerProfileId`，无专用 decomposer 时默认跟随 worker
  - Plan 设计阶段明确区分固定顺序 `normal`、未知清单 `discovery + for_each`、已知大任务 `decomposer`
  - `for_each.taskTemplate` 文档同步通用 `{{item.<field>}}`、`{{item}}` 和 run-scoped placeholders
  - 补充 P23 item identity 口径：共享参考资料不能覆盖当前 child task 的 `sourceItem` 身份
  - 强化 discovery item 必须有稳定 string `id`，建议提供 `title` / `name` / `label`

---

## 2026-05-17 — Team Runtime P23: for_each Item Isolation

- **主题**: 修复 `for_each` 生成的子任务 item 身份边界过软的问题——worker 可被共享参考文档误导切换到错误 item
- **影响范围**: `src/team/types.ts`, `src/team/task-expansion-planner.ts`, `src/team/orchestrator.ts`, `src/team/agent-profile-role-runner.ts`, `docs/team-runtime.md`
- **变更**:
  - `TeamTask` 新增 `sourceItem?: TeamTaskSourceItem`（`{ id, data }`），`TaskExpansionChildEntry` 同步新增
  - `TemplateTaskExpansionPlanner` 生成的子任务携带完整 source item 快照（shallow copy）
  - expansion record 持久化 `sourceItem`，resume 使用存储快照而非重新渲染
  - Worker/checker/watcher prompt 注入权威 source item 身份块，明确声明当前 item 的 id 和 display field
  - Checker prompt 要求 item 不匹配时 verdict 为 `fail`；watcher prompt 包含任务描述并拒绝切换 item 的结果
  - 自动追加 item identity acceptance rules（基于 `item.id` 和 `title`/`name`/`label`）
  - 旧扩展记录（无 `sourceItem`）仍兼容
- **测试**: 新增 17 个测试覆盖 source item 持久化、prompt 注入、acceptance rules、item drift rejection 行为、resume 兼容性
- **commits**:
  - `0802500` feat(team): persist for-each source item snapshots
  - `b772c06` feat(team): inject for-each item identity into role prompts
  - `a0e34a3` feat(team): add item identity acceptance rules for for-each children
  - `6d56261` test(team): reject for-each child item drift
  - `162292e` docs(team): document for-each item isolation

---

## 2026-05-17 — Team Runtime P22 Review Fix: Decomposed Discovery Standard Persistence

- **主题**: 修复 decomposed discovery parent 聚合后未持久化 `discovery-result.json` 的问题；修复 validation error 硬编码 `outputKey 'items'`
- **影响范围**: `src/team/orchestrator.ts`, `docs/team-runtime.md`
- **变更**:
  - decomposed discovery parent 聚合子级输出后，创建 parent aggregation attempt 并写入标准化 `discovery-result.json`
  - parent aggregation attempt 不含 worker/checker/watcher 条目
  - resume/reclaim 优先读取已有标准文件，不重新聚合子级输出
  - discovery validation error 信息使用实际 `task.discovery.outputKey` 而非硬编码 `'items'`
  - decomposed discovery child item 必须和普通 discovery 一样包含非空 string `id`，否则 parent 失败且不写标准结果
  - 旧 decomposed run（无 parent 标准文件）仍使用传统子级聚合 fallback
- **测试**: 4 个 P22 decomposed 测试增强为直接断言 `workspace.readDiscoveryResult()`；新增 outputKey error 与缺失 stable item id 回归测试

---

## 2026-05-17 — Team Runtime Discovery Result Standardization (P22)

- **主题**: 将 discovery → for_each 数据合约从 ad-hoc Markdown 解析升级为标准化 `discovery-result.json`
- **影响范围**: `src/team/types.ts`, `src/team/run-workspace.ts`, `src/team/orchestrator.ts`, `docs/team-runtime.md`
- **变更**:
  - 新增 `TeamDiscoveryResultRecord` 类型（schemaVersion: `team/discovery-result-1`）
  - `RunWorkspace` 新增 `writeDiscoveryResult` / `readDiscoveryResult` 方法，按 attempt 路径写入/读取标准化文件
  - orchestrator 在 discovery task 被 watcher accept 后，调用 `writeStandardDiscoveryResult` 写入标准化合约
  - 标准化使用 `strictItems` 模式：非对象值（string、null、array）不再静默过滤，而是导致 discovery task 失败
  - `for_each.itemsFrom` 解析优先读取 `discovery-result.json`，验证 `outputKey` 与引用一致；旧 run 回退到传统 `accepted-result.md` / `worker-output-001.md` 解析
  - decomposed discovery 聚合后同样写入标准化合约
- **测试**: 新增 18 个 P22 测试覆盖 workspace round-trip、orchestrator 标准化写入、for_each 优先读取、decomposed 聚合、strictItems 验证、legacy fallback

---

## 2026-05-17 — Team Runtime Discovery Referenced Output

- **主题**: 修复 discovery 结果 JSON 写在 agent workspace 输出文件中时 `for_each` 无法解析的问题
- **影响范围**: `src/team/orchestrator.ts`, `src/team/run-workspace.ts`, `test/team-orchestrator-dynamic-expansion.test.ts`
- **变更**:
  - discovery 解析在 `accepted-result.md` / `worker-output-001.md` 自身无 JSON 时，会读取其中引用的当前 run 范围内输出文件
  - 支持 `/app/.data/team/runs/<runId>/...` 和 `runs/<runId>/...` 两类 run-scoped 引用
  - 文件读取限制在当前 run 根目录内，避免把任意宿主路径读取暴露给 runtime
- **测试**: 新增回归测试覆盖 checker 只返回“输出文件位于 ...”而 JSON 实际保存在 `agent-workspaces/<attemptId>/worker/output/*.md` 的真实失败形态

---

## 2026-05-17 — Team Runtime State Write Lock

- **主题**: 修复真实运行中并发保存 run state 导致 `getState()` 瞬时返回 null 的问题
- **影响范围**: `src/team/run-workspace.ts`, `test/team-run-workspace.test.ts`
- **变更**:
  - `saveState()` 使用 run-scoped `.state.lock` 串行化 `state.json` 写入，避免 worker heartbeat / orchestrator / HTTP control 并发 rename 同一个 state 文件
  - `saveState()` 使用唯一 temp 文件名，不再共享 `state.json.tmp`
  - `getState()` 对短暂读取失败做小幅重试，避免把 rename 窗口误判为 run 不存在
- **测试**: 新增并发 `saveState()` 回归测试，覆盖 Windows 下 rename 竞争和遗留 tmp 文件清理

---

## 2026-05-17 — P21 Runtime Fix: Discovery Result Fallback

- **主题**: 修复 discovery → for_each 在 accepted result 为自然语言摘要时无法展开的问题
- **影响范围**: `src/team/orchestrator.ts`, `test/team-orchestrator-dynamic-expansion.test.ts`, `test/team-orchestrator-decomposition.test.ts`, `docs/team-runtime.md`
- **变更**:
  - discovery 结果解析不再“读到 accepted-result.md 就停止”；现在会依次尝试 `accepted-result.md` 和 `worker-output-001.md`
  - 只有某个候选内容能按 `discovery.outputKey` 解析出 item array，才作为下游 `for_each` 的数据源
  - decomposed discovery child aggregation 复用同一读取契约，避免 split discovery 在 child accepted summary 上复发
- **测试**: 新增普通 discovery 和 decomposed discovery 两条回归测试，覆盖 accepted result 是中文摘要、worker output 才含 JSON 的真实失败形态

---

## 2026-05-17 — P21-D Review Fix: Run Detail Task Definitions

- **主题**: 修复 Run timeline 层级展示依赖前端伪字段的问题
- **影响范围**: `src/team/routes.ts`, `src/ui/team-page.ts`, `test/team-routes.test.ts`, `test/team-page-ui.test.ts`, `docs/team-runtime.md`
- **变更**:
  - `GET /v1/team/runs/:runId` 现在返回 additive `taskDefinitions`，由 expansion/decomposition records 汇总生成
  - `taskDefinitions` 标记 `generatedSource="for_each" | "decomposition"`，供 UI 区分「动态子任务」和「拆分子任务」
  - Run detail UI 改为优先使用真实 API 返回的 `taskDefinitions`，保留旧 run / prefix fallback
  - Route 测试覆盖无 parent 前缀的 decomposed child，例如 `collect_ips` / `ptr_lookup`
- **测试**: 增加 run detail API contract 测试，并更新 P21-D UI hierarchy 测试使用真实响应形状

---

## 2026-05-17 — P21-D Decomposer UI and Docs

- **主题**: Team Console 展示 controlled decomposition 的 Plan badge 和运行层级
- **影响范围**: `src/ui/team-page.ts`, `test/team-page-ui.test.ts`, `docs/team-runtime.md`
- **变更**:
  - Plan Detail 的任务结构展示 `leaf` / `propagate` decomposer badge；`none` 保持安静不刷屏
  - Run timeline 将 split parent 标记为「拆分容器」，将 decomposed child 缩进到 parent 下方
  - `for_each` child 使用「动态子任务」标签，与 decomposed child 的「拆分子任务」区分
  - 文档补齐 decomposer 权限矩阵、与 `for_each` 的差异、Medtrum 风格使用方式和 UI 限制
- **测试**: `test/team-page-ui.test.ts` 增加 Plan badge 和 decomposed hierarchy 行为测试，使用真实 plan/run/state 形状渲染 helper

---

## 2026-05-17 — P21-C Review Fix: Decomposed Discovery Aggregation

- **主题**: 修复 decomposed discovery parent 的 child result aggregation
- **影响范围**: `src/team/orchestrator.ts`, `test/team-orchestrator-decomposition.test.ts`, `docs/team-runtime.md`
- **变更**:
  - `discovery` task 被 decomposer `split` 后，会从 normal child 的 accepted result 聚合 parent `discovery.outputKey`
  - child 输出支持 `{ "items": [...] }` 和直接数组 `[ ... ]` 两种形状
  - malformed child output 会让 discovery parent 明确失败，避免 downstream `for_each` 使用 partial data
  - resume/reclaim 复用既有 decomposition record 和 child result，不重复调用 decomposer、不重复 append child state
- **测试**: 新增 decomposed discovery → downstream `for_each` 真实流程测试，覆盖 object output、array output、malformed output 和 reclaim/resume path

---

## 2026-05-17 — P21-C Controlled Runtime Decomposition

- **主题**: Orchestrator 启用受控运行时拆分
- **影响范围**: `src/team/orchestrator.ts`, Team decomposition/orchestrator 测试, `docs/team-runtime.md`
- **变更**:
  - `decomposer.mode="leaf" | "propagate"` 的 task 会在 worker 前调用 `runDecomposer()`
  - `no_split` 记录 decomposition decision 后按原 task 正常执行
  - `split` 将 parent 作为 container，持久化 decomposition record，append normal child task states，并按记录顺序执行 child
  - parent worker/checker/watcher 不会在 `split` 后运行；parent 状态由 children 汇总
  - runtime 强制 `propagate -> leaf | none`、`leaf -> none`，拒绝 non-normal child、重复 child id、超限 child 和超过 50 个 task state 的扩张
  - resume/reclaim 优先读取既有 decomposition record，避免重复调用 decomposer 或重复生成 child task
  - pause/cancel/timeout 路径覆盖 decomposer phase 和 decomposed child task，finalizer 可见 child task 结果
- **测试**: 新增 `test/team-orchestrator-decomposition.test.ts`，覆盖真实 run state、decomposition record、resume、control、timeout 和 finalizer child visibility

---

## 2026-05-17 — P21-B Review Fixes

- **主题**: 收紧 decomposer child task 解析和 expansion/decomposition 记录落盘路径
- **影响范围**: `src/team/agent-profile-role-runner.ts`, `src/team/run-workspace.ts`, Team runner/workspace 测试
- **变更**:
  - `AgentProfileRoleRunner.runDecomposer()` 只接受 normal child task，避免 agent 输出未完整校验的 `discovery` / `for_each` child task
  - child task 的 `decomposer.maxChildren` 上限与 PlanStore schema 对齐为 `1..20`
  - expansion/decomposition record 文件名使用 `encodeURIComponent(parentTaskId)`，避免 task id 中的路径分隔符影响落盘路径
- **测试**: 增加 runner parser 和 workspace persistence 回归测试，覆盖非法 child policy、非 normal child task、危险 parentTaskId 编码

---

## 2026-05-17 — P21-B Decomposer Schema, Runner, and Persistence

- **主题**: 增加 task-level decomposer schema、runner contract 和 decomposition record 持久化
- **影响范围**: `src/team/types.ts`, `src/team/plan-store.ts`, `src/team/role-runner.ts`, `src/team/agent-profile-role-runner.ts`, `src/team/run-workspace.ts`, Team 相关测试, `docs/team-runtime.md`
- **变更**:
  - `TeamTask` 增加可选 `decomposer: { mode: "none" | "leaf" | "propagate"; maxChildren?: number }`
  - `PlanStore.create()` / `updateEditablePlan()` 校验 task decomposer 和 `forEach.taskTemplate.decomposer`
  - `TeamRoleRunner` 增加 `runDecomposer()`；`MockRoleRunner` 默认返回 `no_split`
  - `AgentProfileRoleRunner.runDecomposer()` 使用 `decomposerProfileId`，通过 strict JSON prompt/parser 解析 `split` / `no_split`
  - decomposer 解析失败安全返回 `no_split`，同时保留 role `runtimeContext`
  - `RunWorkspace` 增加 `writeDecomposition()` / `readDecomposition()`，记录完整 child `TeamTask` 定义
  - **本阶段不在 orchestrator 中调用 decomposer，不生成或执行 child task states**
- **提交**:
  - `f005c1f feat(team): add task decomposer schema validation`
  - `a212b24 feat(team): add decomposer runner contract`
  - `b7c1328 feat(team): run decomposer with agent profile`
  - `ce3c3e2 feat(team): persist task decomposition records`
- **测试**: 新增/更新 plan store、routes、mock runner、真实 runner、workspace persistence 和 fake runner 类型覆盖；重点证明 create/PATCH/runner/persistence 的真实流程

---

## 2026-05-17 — P21-A Review Fixes

- **主题**: 修复 Decomposer role foundation 的 UI 默认值和换行噪音
- **影响范围**: `src/ui/team-page.ts`, `test/team-page-ui.test.ts`, P21-A 相关源码/测试文件换行规范化
- **变更**:
  - TeamUnit 新建弹窗中，Decomposer Agent 默认跟随 Worker Agent；新建模式下切换 Worker 时同步 Decomposer
  - 编辑已有 TeamUnit 时不自动覆盖 decomposer 配置
  - 统一 P21-A 涉及文件的 LF 换行，恢复 `git diff --check` 可用性
- **测试**: 增加 UI 回归断言，覆盖新建团队的 decomposer 默认跟随逻辑

---

## 2026-05-17 — P21-A Decomposer Role Foundation

- **主题**: TeamUnit 增加第五角色 Decomposer 工位
- **影响范围**: `src/team/types.ts`, `src/team/team-unit-store.ts`, `src/team/routes.ts`, `src/team/config-locks.ts`, `src/team/role-runner.ts`, `src/team/agent-profile-role-runner.ts`, `src/team/orchestrator.ts`, `src/workers/team-worker.ts`, `src/ui/team-page.ts`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - `TeamUnit` 增加 `decomposerProfileId` 字段
  - 旧 TeamUnit JSON 缺失 `decomposerProfileId` 时 fallback 到 `workerProfileId`
  - API create/update 支持 `decomposerProfileId`，create 缺失时默认为 `workerProfileId`
  - Profile validation 和 active run locks 纳入 decomposer profile
  - `ProfileAwareTeamRoleRunner.setProfileIds` 包含 `decomposerProfileId`
  - `AgentProfileRoleRunnerOptions` 存储 `decomposerProfileId`
  - Worker 和 route 构造时 decomposer 默认为 `"main"` 占位符
  - Team UI modal 增加「任务拆分 Agent (Decomposer)」下拉选择
  - Team 卡片展示 decomposer profile（旧数据 fallback 到 worker）
  - **本阶段只增加工位，不执行任务拆分**，controlled decomposition runtime 留到 P21-B/P21-C
- **提交**:
  - `4587814 feat(team): add decomposer profile to team units`
  - `5f49094 feat(team): validate and lock decomposer profile`
  - `0f460ca feat(team): wire decomposer profile through role runners`
  - `c3657d9 feat(team-ui): expose decomposer team role`
- **测试**: 新增 13 个测试（store 4 + routes 5 + config-locks 1 + worker/lifecycle 类型更新 + UI 4）

---

## 2026-05-17 — P20 Review Fixes

- **主题**: 修复 P20 run timeout UI 默认值覆盖和页面脏字符
- **影响范围**: `src/ui/team-page.ts`, `test/team-page-ui.test.ts`, `test/team-orchestrator-timeout.test.ts`, `docs/change-log.md`
- **变更**:
  - UI 创建运行时，timeout 输入留空不再发送 `maxRunDurationMinutes`，改为尊重服务端 `TEAM_MAX_RUN_DURATION_MINUTES` 默认值
  - 清理 timeout prompt modal 前的 stray `t` 文本节点，并修复“取消”按钮乱码
  - 规范 `test/team-orchestrator-timeout.test.ts` 换行，避免 `git diff --check` 被 CRLF 噪音刷屏
- **测试**: `test/team-page-ui.test.ts` 增加回归断言，覆盖留空默认和 modal 文案

---

## 2026-05-17 — P20 Timeout and Expansion Patch

- **主题**: Team Runtime timeout 配置增强和 for_each 模板扩展修复
- **影响范围**: `src/team/task-expansion-planner.ts`, `src/team/types.ts`, `src/team/orchestrator.ts`, `src/team/run-workspace.ts`, `src/team/routes.ts`, `src/config.ts`, `src/workers/team-worker.ts`, `src/server.ts`, `src/ui/team-page.ts`, `.env.example`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - `{{item.description}}` 和任意 `{{item.<field>}}` 占位符现在正确替换（之前只支持 id/title）
  - 新增 run-scoped 占位符：`{{run.id}}`、`{{plan.id}}`、`{{parentTask.id}}`、`{{task.outputDir}}`
  - Worker phase timeout 默认从 10 分钟改为 15 分钟（`TEAM_WORKER_PHASE_TIMEOUT_MS=900000`）
  - Run timeout 默认从 60 分钟改为 100 分钟（`TEAM_MAX_RUN_DURATION_MINUTES=100`）
  - `POST /v1/team/plans/:planId/runs` 支持 `maxRunDurationMinutes` per-run override（1-1440）
  - Per-run timeout 持久化在 `TeamRunState.maxRunDurationMinutes`
  - UI 创建运行前弹出设置超时时间的输入框
  - 旧 run state 无 `maxRunDurationMinutes` 字段时 fallback 到 constructor default
- **提交**:
  - `ca57b9e fix(team): expand generic for-each item placeholders`
  - `f127658 feat(team): expose run-scoped paths in task expansion templates`
  - `9966ec1 feat(team): support configurable per-run timeout`
  - `d6b1ef5 feat(team-ui): allow run timeout override before start`
- **测试**: 新增 14 个测试（expansion planner 6 + orchestrator timeout 2 + routes 3 + UI 3）

---

## 2026-05-17 — P19 Team Console Dashboard Redesign

- **主题**: Team Runtime 控制台从工程调试页升级为生产级仪表盘
- **影响范围**: `src/ui/team-page.ts`, `test/team-page-ui.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 首页默认展示 Plan Dashboard 响应式卡片网格（替代旧列表）
  - Plan 卡片显示标题、目标摘要、任务数、计划类型、活跃/最新 Run 摘要和进度条
  - 活跃 Run 卡片 accent 边框脉冲动画，失败 Plan 卡片红色左边框
  - 点击 Plan 卡片进入 Plan Detail 视图（含返回导航）
  - Plan Detail 展示完整 goal、outputContract、任务结构设计图、Run 列表
  - Dynamic Plan 设计图可视化：discovery 节点 → outputKey → for_each 模板 → 运行时展开概念
  - Normal Plan 设计图：有序任务步骤列表
  - Run 卡片可展开为任务时间线（含动态生成的子任务）
  - SSE `updateRunCard` 同时更新 Dashboard、Plan Detail、全局运行记录三个视图
  - Plan 创建 modal 无变更（仅视觉验证一致性）
  - 全局 运行记录 tab 保留为辅助审计视图
- **提交**:
  - `042d0af feat(team-ui): add dashboard run summary helpers`
  - `33f2977 feat(team-ui): render plan dashboard cards`
  - `8066d8e feat(team-ui): add plan detail view`
  - `236d981 feat(team-ui): visualize dynamic plan structure`
  - `1f6e788 feat(team-ui): add expandable run timeline cards`
- **测试**: 225 个测试（含 12 T1 helpers + 14 T2 cards + 15 T3 detail + 11 T4 design + 8 T5 run cards）

---

## 2026-05-17 — P18 Browser Binding Smoke

- **主题**: Team Runtime 多 AgentProfile 浏览器绑定自动化 smoke 脚本
- **影响范围**: `scripts/team-browser-binding-smoke.mjs`, `test/team-browser-binding-smoke.test.ts`, `package.json`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 新增 `scripts/team-browser-binding-smoke.mjs`：通过 HTTP Team API 创建 TeamUnit/Plan/Run，轮询至 terminal，校验四个角色的 `requestedProfileId`、`browserId`、`browserScope`
  - 新增 `test/team-browser-binding-smoke.test.ts`：覆盖 CLI 解析、HTTP 流程（mocked fetch）、超时/失败拒绝、严格 runtime context 断言
  - `package.json` 新增 `team:browser-smoke` npm script
  - CLI 参数支持 `--worker-profile`/`--expect-worker-browser` 等，同时支持 `TEAM_SMOKE_*` 环境变量 fallback
  - 脚本不删除创建的数据，保留供排查
- **提交**:
  - `bc3326e feat(team): add browser binding smoke CLI validation`
  - `docs(team): document browser binding smoke workflow`
- **测试**: `npm run test:team` 新增 16 个测试

---

## 2026-05-17 — P17 Team Browser Binding Audit

- **主题**: Team Runtime 多 AgentProfile 多浏览器绑定确定性审计
- **影响范围**: `src/team/role-runner.ts`, `src/team/orchestrator.ts`, `src/team/agent-profile-role-runner.ts`, `test/team-orchestrator-lifecycle.test.ts`, `test/team-agent-profile-runner.test.ts`, `test/team-worker.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 新增 `ProfileAwareTeamRoleRunner` 接口，替代 `orchestrator` 中对 `AgentProfileRoleRunner` 的 class cast
  - 证明 orchestrator 在执行前通过 `setProfileIds` 注入 TeamUnit 的 4 个 profile ID
  - 证明 worker/checker/watcher/finalizer 分别解析各自的 profile，获得不同的 browserId 和 browserScope
  - 证明 route setup/cleanup/clear 使用匹配的 scope 和 browserId
  - 证明 attempt metadata 和 finalizerRuntimeContext 正确持久化角色浏览器绑定
  - 证明 worker 构造时的 `main` 占位符会被 TeamUnit profile IDs 覆盖
  - 不引入新的浏览器调度系统、不改变 Chrome sidecar 拓扑、不复制 cookie
- **提交**:
  - `cda3534 test(team): cover team unit profile injection`
  - `29cb593 test(team): cover multi-role browser bindings`
  - `8099afa test(team): persist role browser runtime context`
  - `ecd05f0 test(team-worker): cover real runner profile browser routing`
  - `docs(team): document multi-profile browser binding audit`
- **测试**: `npm run test:team` 新增 13 个测试

---

## 2026-05-17 — P16 Dynamic Plan Authoring UX

- **主题**: Team Console 动态计划创作 UI + `/team-plan` 技能指导强化
- **影响范围**: `src/ui/team-page.ts`, `test/team-page-ui.test.ts`, `test/team-routes.test.ts`, `.pi/skills/team-plan-creator/SKILL.md`, `test/team-plan-creator-skill.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 计划创建 modal 支持两种模式：普通计划 / 发现后逐项处理
  - 动态模式自动生成 discovery + for_each canonical Plan JSON，预览后再提交
  - 动态计划卡片：紧凑展示 discovery → for_each 结构，子任务模板可折叠
  - `/team-plan` 技能新增「禁止猜测未知数量静态任务」规则
  - 已知限制文档补充：UI builder 仅覆盖 discovery → for_each 标准场景
- **提交**:
  - `6bb09b7 feat(team-ui): add dynamic plan authoring mode`
  - `3bf230f feat(team-ui): create dynamic plans from console`
  - `69f0bf8 style(team-ui): clarify dynamic plan cards`
  - `docs(team): refine dynamic plan creator guidance`
- **测试**: `npm run test:team` 全量通过，新增 14 个测试

---

## 2026-05-17 — P15 Review Fixes

- **主题**: 修复 P15 Dynamic Task Expansion 的 4 个审核问题
- **影响范围**: `src/team/types.ts`, `src/team/plan-store.ts`, `src/team/orchestrator.ts`, `src/team/task-expansion-planner.ts`, `src/ui/team-page.ts`, `test/team-*.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - Finding 1: `TaskExpansionRecord.children[]` 持久化完整 `TeamTask` 定义；resume/reclaim 后子任务 input/acceptance 不漂移；旧格式记录兼容
  - Finding 2: Run detail UI 显示动态生成的子任务 attempts，以「子任务」分组
  - Finding 3: `PlanStore.create()` 和 `updateEditablePlan()` 拒绝未知 `task.type`；PATCH 在 `runCount=0` 时验证 tasks
  - Finding 4: `TeamOrchestratorOptions` 接受 `taskExpansionPlanner` 注入；默认使用 `TemplateTaskExpansionPlanner`
- **提交**:
  - `53cc573 fix(team): preserve generated child task definitions`
  - `c1dfc5e fix(team): validate dynamic plan tasks on update`
  - `f980451 fix(team): inject task expansion planner`
  - `867c356 fix(team-ui): show generated child task attempts`
  - `docs(team): document dynamic expansion fixes`
- **测试**: `npm run test:team` 全量通过，新增 13 个回归测试

---

## 2026-05-16 — P15: Dynamic Task Expansion

- **主题**: Team Runtime 支持运行时动态任务扩展：discovery 任务发现未知数量的 item，for_each 任务按模板展开为子任务
- **影响范围**: `src/team/types.ts`, `src/team/plan-store.ts`, `src/team/task-expansion-planner.ts`（新增）, `src/team/run-workspace.ts`, `src/team/orchestrator.ts`, `src/team/routes.ts`, `src/ui/team-page.ts`, `.pi/skills/team-plan-creator/SKILL.md`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 新增三种任务类型：`normal`（默认）、`discovery`（发现 item）、`for_each`（按模板展开子任务）
  - `TaskExpansionRecord` 持久化扩展记录到 `runs/<runId>/expansions/<parentTaskId>.json`
  - `TemplateTaskExpansionPlanner`：模板替换（`{{item.id}}`/`{{item.title}}`/`{{item}}`）、ID 清洗、重复检测
  - Orchestrator 按 task type 分发：discovery 提取 JSON 结果，for_each 动态生成子任务并顺序执行
  - 幂等扩展：pause/resume 不重复生成子任务；0 item 时 for_each 标记 succeeded
  - Plan Store 验证扩展：discovery 必须有 outputKey，for_each 必须有 itemsFrom + mode=sequential + taskTemplate
  - UI 渲染：discovery 显示蓝色 badge，for_each 显示紫色 badge + itemsFrom 引用
  - Skill 文档：新增 Task types 章节，包含 discovery/for_each 示例
- **提交**:
  - `feat(team): add dynamic task schema`
  - `feat(team): add template task expansion planner`
  - `feat(team): persist dynamic task expansions`
  - `feat(team): execute sequential dynamic task expansion`
  - `feat(team-ui): render dynamic task plans and runs`
  - `docs(team): document dynamic task expansion`
- **测试**: `npm run test:team` (169 pass), 42 个新增测试覆盖类型、验证、扩展规划、持久化、编排、路由、UI

---

## 2026-05-16 — P14: Compact Plan Card Layout

- **主题**: `/playground/team` 计划卡片从文本墙升级为紧凑、分层、可扫描的信息架构
- **影响范围**: `src/ui/team-page.ts`, `test/team-page-ui.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 卡片默认视图：标题 + 芯片（N 个任务、N 次运行），取代平铺文本
  - 新增 `renderPlanSummary()`：目标截断至 120 字，输出契约截断至 80 字，显示为标签+摘要行
  - 新增 `firstLine()` helper，辅助截取首行
  - 任务行显示任务号 + 标题 + 元数据（字数 / 验收数），长输入和验收规则通过 `<details>/<summary>` 折叠
  - 保留所有既有行为：创建运行、删除未使用计划、查看 JSON、展开全部任务、防御性渲染
  - 12 个新增行为测试：紧凑结构、截断文本、元数据芯片、折叠控件、展开全部、缺失字段、XSS 转义
- **提交**:
  - `feat(team-ui): compact plan card information hierarchy`
- **测试**: `npm run test:team` (345 pass)

---

## 2026-05-16 — P13: Structured Plan Cards

- **主题**: `/playground/team` 计划列表从简单标题卡片升级为结构化任务详情卡片
- **影响范围**: `src/ui/team-page.ts`, `test/team-page-ui.test.ts`, `docs/team-runtime.md`, `docs/change-log.md`
- **变更**:
  - 抽出 `renderPlanCard` / `renderPlanTaskPreview` / `renderAcceptanceRules` / `truncateText` 四个渲染 helper
  - 每个 Plan 卡片展示 goal、outputContract、每条 Task 的 title / input.text 摘要 / acceptance.rules 验收清单
  - 默认展示 3 条任务，超出时提供「展开全部任务」/「收起任务」切换
  - 「查看 JSON」弹层使用 `textContent` 安全展示完整 Plan JSON
  - 所有动态值经 `escapeHtml` 处理，planId 通过 `jsArg` 安全传入 onclick
  - 新增 `.plan-card` / `.plan-task-card` / `.acceptance-list` 等 CSS，含移动端响应式规则
- **提交**:
  - `feat(team-ui): render structured plan cards`
  - `feat(team-ui): expand long plan task lists`
  - `feat(team-ui): add plan json viewer`
  - `style(team-ui): polish structured plan cards`
- **测试**: `npm run test:team` (334 pass)

---

## 2026-05-16 — Team plan structured card defensive rendering

- **主题**: 修复 `/playground/team` 计划页在历史/不完整 Plan JSON 下加载失败的问题
- **影响范围**: `src/ui/team-page.ts`, `test/team-page-ui.test.ts`
- **变更**:
  - 结构化计划卡片渲染时，对缺失或非数组的 `tasks`、`acceptance.rules` 做防御性默认值处理
  - 缺失 `goal` / `outputContract` 时继续渲染卡片，不再让单个脏 Plan 阻断整个计划列表
- **测试**: `node --test --test-concurrency=1 --import tsx test/team-page-ui.test.ts`

---

## 2026-05-16 — Team Plan Creator explicit `/team-plan` trigger

- **主题**: 收紧 Team Plan 创建技能的触发边界，避免普通聊天里提到 team plan 时 Agent 直接开始创建或执行工作
- **影响范围**: `.pi/skills/team-plan-creator/SKILL.md`, `test/team-plan-creator-skill.test.ts`
- **变更**:
  - `team-plan-creator` 改为仅在用户消息包含显式关键词 `/team-plan` 时触发
  - 普通提到 `team plan`、`团队计划`、`Team Runtime` 或泛泛聊计划时，不自动创建资源；应提示用户使用 `/team-plan`
  - 保持原有安全边界：只创建/更新 TeamUnit 与 Plan，不启动 Run，不直接编辑 `.data/team`
  - 新增测试锁定 `/team-plan` 显式触发和普通提及不自动触发的说明
- **测试**: `node --test --test-concurrency=1 --import tsx test/team-plan-creator-skill.test.ts`

---

## 2026-05-16 — P12: Team Console UX Refresh

- **主题**: 把 `/playground/team` 从工程调试页优化为可用 Team 控制台
- **影响范围**: `src/ui/team-page.ts`, `test/team-page-ui.test.ts`, `docs/team-runtime.md`
- **变更**:
  - 移除所有 `alert()`/`confirm()`/`prompt()` 系统弹窗，改为页面内 toast 通知 + 自定义确认 modal
  - 新增 Plan 创建 modal 表单（名称、目标、任务、验收标准、输出契约），替代 `prompt()` 逐步输入
  - 新增控制台头部（标题 + 摘要计数器：计划/团队/活跃运行）
  - 运行操作区分 primary/danger，取消/删除使用 `confirmAction()` 二次确认
  - 统一 report/file modal 为 `modal-panel` 样式，报告支持一键复制
  - `runtimeContext` 改为 `<details>/<summary>` 折叠显示
  - 文件列表改用 `file-chip` 按钮样式，错误摘要高亮
  - 新增 `@media (max-width: 720px)` 移动端适配
  - 新增 9 个 P12-T5 测试，累计 109 个 UI 测试通过
- **提交**: 6 commits (`fix(team-ui): replace system dialogs`, `feat(team-ui): add plan creation modal`, `feat(team-ui): improve console overview`, `fix(team-ui): clarify run actions`, `style(team-ui): polish run detail modals`, `docs(team): document console ux refresh`)

---

## 2026-05-16 — P10: Team Worker Operations Parity

- **主题**: 补齐独立 Team worker 的真实 runner browser binding 接线，并明确多 worker 运维口径
- **影响范围**: `src/workers/team-worker.ts`, Team worker 测试, `docs/team-runtime.md`
- **变更**:
  - `ugk-pi-team-worker` 的真实 runner 入口显式注入既有 `setBrowserScopeRoute()` 和 `closeBrowserTargetsForScope()`
  - `createTeamWorkerRoleRunner()` 导出为可测试工厂；导入 worker 模块不再自动启动无限轮询
  - 新增测试覆盖默认 mock runner、`TEAM_USE_MOCK_RUNNER=false` 时的 route 写入/清理、cleanup browserId 与 runtime context scope 一致性
  - 文档补充多 worker 扩容口径：`TEAM_MAX_CONCURRENT_RUNS`、`--scale ugk-pi-team-worker=N`、共享 `TEAM_DATA_DIR`、不要在共享 `.env` 写死同一个 `TEAM_WORKER_ID`
- **测试**: `node --test --test-concurrency=1 --import tsx test/team-worker.test.ts` 2 pass
- **源码入口**: `src/workers/team-worker.ts`, `test/team-worker.test.ts`, `docs/team-runtime.md`

---

## 2026-05-16 — P9: Team Browser Binding Parity

- **主题**: 对齐 Team role runner 与 chat agent / conn worker 的 browser scope route 生命周期，避免重新造浏览器资源系统
- **影响范围**: `src/team/agent-profile-role-runner.ts`, `src/team/routes.ts`, Team 测试, `docs/team-runtime.md`
- **变更**:
  - Team role session 使用同一个 canonical scope 贯穿 route、session、agent scope、cleanup、runtime context
  - 生产 Team real runner 显式注入既有 `setBrowserScopeRoute()` 和 `closeBrowserTargetsForScope()`
  - `runtimeContext.browserScope` 记录实际传给成熟 browser binding 链路的 scope
  - 新增测试覆盖 scope route 写入/清理、cleanup browserId 参数、无 browserId 和 session 创建失败时的 route 清理语义
  - 明确 P9 不新增 browser provisioning、resource scheduler、browser pool 或 sidecar 拓扑
- **测试**: 270 pass
- **源码入口**: `src/team/agent-profile-role-runner.ts`, `src/team/routes.ts`, `test/team-agent-profile-runner.test.ts`

---

## 2026-05-16 — P8-E: Profile Browser Scope End-to-End Audit

- **主题**: 补齐 P8-A 至 P8-D 的 runtime context 边界审计覆盖，不引入新的运行时能力
- **影响范围**: Team 测试, `docs/team-runtime.md`
- **变更**:
  - finalizer 抛错、取消、超时时断言 `finalizerRuntimeContext` 保持 `null`
  - 路由测试覆盖 `GET /v1/team/runs/:runId` 返回已持久化的 finalizer runtime context
  - UI 行为测试执行 `renderTaskDetail()`，验证 worker/checker/watcher/finalizer runtime context 动态值不会形成 HTML 注入
  - 未发现需要修改生产代码的真实缺口
- **测试**: 267 pass
- **源码入口**: `test/team-finalizer-fallback.test.ts`, `test/team-orchestrator-timeout.test.ts`, `test/team-routes.test.ts`, `test/team-page-ui.test.ts`

---

## 2026-05-16 — P8-D: Persist Finalizer Runtime Context

- **主题**: 将 finalizer session 的 profile/browser 解析结果持久化到 run state，并在 Team UI 展示
- **影响范围**: `src/team/types.ts`, `src/team/run-workspace.ts`, `src/team/orchestrator.ts`, `src/ui/team-page.ts`, Team 测试, `docs/team-runtime.md`
- **变更**:
  - `TeamRunState` 新增可选 `finalizerRuntimeContext`
  - 新 run 初始化 `finalizerRuntimeContext: null`
  - finalizer 成功返回后，orchestrator 将 `finalizerOut.runtimeContext` 写入 run state
  - finalizer 抛错或超时时保留 `null`，fallback report 行为不变
  - `/playground/team` 任务详情展示 run 级 finalizer runtime context
  - 新增测试覆盖 finalizer context 持久化、类型字段和 UI 展示
- **测试**: 265 pass
- **源码入口**: `src/team/orchestrator.ts:runFinalizer`, `src/ui/team-page.ts:renderTaskDetail`

---

## 2026-05-16 — P8-C: Surface Role Runtime Context In Team UI

- **主题**: 在 `/playground/team` attempt 详情中展示 P8-B 写入的角色运行上下文
- **影响范围**: `src/ui/team-page.ts`, `test/team-page-ui.test.ts`, `docs/team-runtime.md`
- **变更**:
  - attempt 卡片新增 runtime context 展示，覆盖 worker/checker/watcher
  - 显示 requested/resolved profile、fallback reason、browser ID、browser scope
  - fallback 使用醒目标记，旧 attempt 没有 `runtimeContext` 时不显示该块
  - 所有 runtime context 动态值继续经过 `escapeHtml`
  - 新增 UI 测试覆盖展示入口、fallback badge、转义约束
- **测试**: 263 pass
- **源码入口**: `src/ui/team-page.ts:renderRuntimeContext`, `src/ui/team-page.ts:renderTaskDetail`

---

## 2026-05-16 — P8-B: Role Runtime Context Audit Trail

- **主题**: 将 Team 角色 session 的 profile/browser 解析结果写入 attempt 元数据，补齐 P8-A 后的可观测性
- **影响范围**: `src/team/types.ts`, `src/team/role-runner.ts`, `src/team/agent-profile-role-runner.ts`, `src/team/orchestrator.ts`, Team 测试
- **变更**:
  - 新增 `TeamRoleRuntimeContext`，记录 `requestedProfileId`、`resolvedProfileId`、`fallbackUsed`、`fallbackReason`、`browserId`、`browserScope`
  - `AgentProfileRoleRunner` 在 worker/checker/watcher/finalizer 输出中返回 runtime context
  - orchestrator 将 worker/checker/watcher 的 runtime context 写入 attempt metadata
  - 旧 attempt 不含 `runtimeContext` 时仍按可选字段兼容读取
  - 新增测试覆盖真实 runner runtime context 返回，以及 orchestrator 持久化到 attempt metadata
- **测试**: 260 pass
- **源码入口**: `src/team/agent-profile-role-runner.ts:runSession`, `src/team/orchestrator.ts:runWorkUnit`

---

## 2026-05-16 — P8-A: Profile-Aware Browser Scope

- **主题**: 让 Team 角色session honor resolved AgentProfile 的 `defaultBrowserId`，并按 role/attempt 构建 browser scope
- **影响范围**: `src/team/agent-profile-role-runner.ts`, `test/team-agent-profile-runner.test.ts`, `docs/team-runtime.md`
- **变更**:
  - `runSession()` 从 `snapshot.defaultBrowserId ?? options.defaultBrowserId` 选择 browser ID
  - Browser scope 从 `team:<runId>` 改为 `team:<runId>:<role>:<roleKey>:<profileId>`，worker/checker/watcher/finalizer 各有独立 scope
  - 新增 `buildTeamBrowserScope` 辅助函数（含 sanitize）
  - 清理回调接收与 session 创建完全一致的 scope
  - 5 个新测试用 capturing session factory 验证 browser ID 选择、scope 唯一性、cleanup 一致性
- **测试**: 258 pass
- **源码入口**: `src/team/agent-profile-role-runner.ts:runSession`

---

## 2026-05-16 — P6-B SSE 跨进程 fallback 修复

- **主题**: 修复事件驱动 SSE 只覆盖 HTTP 进程内状态写入、无法感知独立 worker 进程推进 run 的问题
- **影响范围**: `src/team/routes.ts`, `test/team-sse-attempt-api.test.ts`, `docs/team-runtime.md`
- **变更**:
  - Team run SSE 在 `RunStateEvents` 快路径之外增加 1 秒 change-detect fallback，只在磁盘 state 发生变化时推送 snapshot
  - 补充使用另一个 `RunWorkspace` 实例写入 state 的回归测试，模拟独立 worker 进程写入
  - 文档改为说明同进程立即推送、跨进程最多有短暂 fallback 延迟
  - admission lock 在 Windows 高并发下将临时 `EPERM` 也视为锁竞争并重试，避免 `.admission.lock` 创建/删除窗口造成随机失败
- **源码入口**: `src/team/routes.ts:/v1/team/runs/:runId/events`

---

## 2026-05-16 — P6-B: Event-Driven Run SSE

- **主题**: 将 `/v1/team/runs/:runId/events` 从 2 秒轮询改为事件驱动推送
- **影响范围**: `src/team/run-state-events.ts`, `src/team/run-workspace.ts`, `src/team/routes.ts`, `test/team-run-state-events.test.ts`, `test/team-sse-attempt-api.test.ts`
- **变更**:
  - 新增 `RunStateEvents` 进程内通知机制，按 `runId` 分发订阅
  - `RunWorkspace.saveState()` 在原子 `rename()` 完成后调用 `events.notify(state)`
  - SSE 路由订阅 `workspace.events` 替代 2 秒 `setInterval` 轮询
  - 保持 SSE payload shape（`{ type: "snapshot", data: <TeamRunState> }`）、初始 snapshot、terminal 关闭、15 秒 heartbeat 行为不变
  - 新增 5 个通知机制测试 + 2 个事件驱动 SSE 测试（含 300ms 延迟断言证明非轮询）
- **测试**: 252 pass
- **源码入口**: `src/team/run-state-events.ts`, `src/team/routes.ts:/v1/team/runs/:runId/events`

---

## 2026-05-16 — P6-A admission lock 高并发补强

- **主题**: 修复 admission lock 在容量未满的高并发创建下过早返回 `admission lock busy` 的问题
- **影响范围**: `src/team/run-workspace.ts`, `src/team/routes.ts`, `test/team-run-admission.test.ts`, `.codex/skills/glm-plan/SKILL.md`
- **变更**:
  - `withAdmissionLock()` 从固定 500ms 自旋改为 10 秒等待窗口，避免高并发但容量未满时误拒绝
  - run 创建路由将 `admission lock busy` 也映射为 409，避免暴露为普通 400
  - 补充容量未满高并发 admission 回归测试
  - `glm-plan` 技能补充锁/lease/admission/队列任务的并发边界测试要求
- **源码入口**: `src/team/run-workspace.ts:withAdmissionLock`

---

## 2026-05-16 — P6-A: Bounded Run Admission

- **主题**: 将 `TEAM_MAX_CONCURRENT_RUNS` 从已记录但未生效的配置变为真实的 run admission 限制
- **影响范围**: `src/team/run-workspace.ts`, `src/team/orchestrator.ts`, `src/team/routes.ts`, `src/server.ts`, 测试文件
- **变更**:
  - `RunWorkspace` 新增 `createRunWithAdmission(plan, teamUnitId, maxConcurrentRuns)` 方法，通过 admission lock 目录实现原子并发控制
  - `RunWorkspace` 新增 `withAdmissionLock()` 私有方法，复用 lock-directory 模式
  - `TeamOrchestratorOptions` 新增 `maxConcurrentRuns?: number`，默认 1 保持旧行为
  - `TeamOrchestrator.createRun()` 替换原有的非原子 active-run 检查，改用 `createRunWithAdmission()`
  - `TeamRouteOptions` 新增 `maxConcurrentRuns?: number`
  - `registerTeamRoutes()` 将 `maxConcurrentRuns` 传入 `makeOrchestrator()`
  - `buildServer()` 将 `config.teamMaxConcurrentRuns` 传入 `registerTeamRoutes()`
  - 错误消息统一为 `active run limit reached`，路由返回 HTTP 409
- **测试**: 244 pass（新增 14 个测试覆盖 admission 原子性、orchestrator limit、路由 409、multi-run lease claim）
- **源码入口**: `src/team/run-workspace.ts:createRunWithAdmission`, `src/team/orchestrator.ts:createRun`

---

## 2026-05-16 — P5: Attempt Lifecycle 重建

- **主题**: 为每个 attempt 添加结构化生命周期元数据，替代原有扁平 status-only 模型
- **影响范围**: `src/team/types.ts`, `src/team/run-workspace.ts`, `src/team/orchestrator.ts`, `src/ui/team-page.ts`, `src/team/routes.ts`, 测试文件
- **变更**:
  - 新增 `TeamAttemptMetadata` 类型，包含 `phase`、`worker[]`、`checker[]`、`watcher`、`resultRef`、`errorSummary`、`finishedAt`
  - `AttemptLifecyclePhase` 覆盖 worker/checker/watcher 全链路 15 个阶段
  - `RunWorkspace` 新增 `updateAttemptPhase`、`recordAttemptWorkerOutput`、`recordAttemptCheckerResult`、`recordAttemptWatcherResult`、`finishAttempt` 方法
  - `normalizeAttempt()` 兼容读取旧格式 attempt.json，补默认值
  - Orchestrator 在 worker/checker/watcher 各阶段写入生命周期元数据
  - checker pass 延迟到 watcher accept_task 后才 finishAttempt(succeeded)
  - 已 finished 的 attempt 不会被后续 watcher 阶段覆盖
  - pauseRun/cancelRun 对 active attempt 做 best-effort 标记（interrupted/cancelled）
  - Attempt API 返回完整 `TeamAttemptMetadata` 结构
  - UI attempt card 展示阶段标签、worker 输出次数、checker verdict 链、watcher decision
  - PHASE_LABELS/PHASE_COLORS 扩展覆盖所有 P5 阶段
- **测试**: 228 pass（新增 32 个测试覆盖类型、workspace、orchestrator lifecycle、API、UI）
- **源码入口**: `src/team/types.ts:TeamAttemptMetadata`, `src/team/run-workspace.ts:normalizeAttempt`, `src/team/orchestrator.ts:runWorkUnit`

### 审计补充
- `failRun()` 和 run timeout 现在会把未完成的 active attempt 收口为 `failed`，避免 run/task 已失败但 attempt 仍停在 `running` 或中间 phase。
- 收紧 cancel lifecycle 回归测试，不再允许 active attempt 仍为 `running` 也通过。
- 补充 worker/watcher 普通异常的回归测试，确保 active attempt 写入 `status=failed`、`phase=failed`、`finishedAt` 和错误摘要。

---

## 2026-05-16 — P4: Team UI 可用性完善

- **主题**: `/playground/team` 控制台可用性全面提升
- **影响范围**: `src/ui/team-page.ts`, `test/team-page-ui.test.ts`
- **变更**:
  - Run 列表显示关联 Plan 标题（从 plan cache 获取）
  - 耗时显示从原始秒数改为人性化格式（`formatDuration`: X时Y分 / X分Y秒）
  - 时间戳格式化显示（`formatTimestamp`: MM-DD HH:MM:SS）
  - Task progress phase 显示中文标签（`PHASE_LABELS` 映射 + 彩色 phase-label 徽标）
  - Attempt 详情改为独立卡片，展示状态、ID、创建时间和可点击文件列表
  - 文件内容弹窗查看（`viewAttemptFile` + file-viewer overlay）
  - 最终报告改为页面内弹窗展示（`viewReport` + report-modal），替代新窗口
  - 所有数据加载显示 spinner loading 状态
  - 加载失败显示错误信息和重试链接
  - 控制按钮（暂停/恢复/取消/删除）在操作期间禁用
  - `statusBadge` 输出经过 `escapeHtml` 转义
  - `escapeHtml` 覆盖所有动态文本：planTitle、currentTaskTitle、attempt status/ID、file name、report content
  - SSE `updateRunCard` 适配新的 run card 结构（formatDuration、task title 查找）
- **测试**: 193 pass（新增 P4 测试 27 个，适配旧测试 3 个）
- **源码入口**: `src/ui/team-page.ts`, `test/team-page-ui.test.ts`

### 审计补充
- attempt 文件查看的 inline `onclick` 参数改为 `JSON.stringify` 后再 `escapeHtml`，避免 task id / 文件名里的引号破坏事件处理器。
- `viewAttemptFile()` 请求路径段改为 `encodeURIComponent`，避免特殊字符导致 URL 断链或路径歧义。
- 补充 2 个回归测试锁定 attempt 文件链接的 JS 参数转义和 URL path segment 编码。

## 2026-05-16 — P3/P7: 输出可靠性 + Phase Timeout

- **主题**: checker/watcher 严格 JSON 输出校验 + phase 级超时 + 真实 timing duration
- **影响范围**: `src/team/agent-profile-role-runner.ts`, `src/team/orchestrator.ts`, `src/config.ts`, `src/team/routes.ts`, `src/workers/team-worker.ts`
- **变更**:
  - checker/watcher prompt 强化严格 JSON 要求
  - 新增 `normalizeCheckerOutput`/`normalizeWatcherOutput` 结构校验
  - 非法 verdict/decision 降级为 fail/confirm_failed parse error
  - revise/request_revision 缺失 feedback 时提供默认值
  - 新增 `runWithTimeout` helper，worker/checker/watcher/finalizer 各自独立超时
  - 4 个新环境变量: `TEAM_WORKER_PHASE_TIMEOUT_MS`, `TEAM_CHECKER_PHASE_TIMEOUT_MS`, `TEAM_WATCHER_PHASE_TIMEOUT_MS`, `TEAM_FINALIZER_PHASE_TIMEOUT_MS`
  - timing span 改用真实时间戳和 duration
- **测试**: 161 pass (新增 P3 测试 8 个 + P7 测试 8 个)
- **源码入口**: `src/team/agent-profile-role-runner.ts`, `src/team/orchestrator.ts`, `test/team-agent-profile-runner.test.ts`, `test/team-orchestrator-timeout.test.ts`

### 审计补充
- `runWithTimeout` 改为真正的 `Promise.race` 超时，不再只依赖 runner 响应 `AbortSignal`。
- finalizer phase 现在也写入 `timings.jsonl`，使用 `taskId: null` / `attemptId: null` 表示 run-level span。
- 补充 2 个回归测试：signal-ignoring runner 仍会超时返回、finalizer timing span 存在且记录真实 duration。
- 验证：`npm run test:team` 163 pass，`npx tsc --noEmit` 通过，`git diff --check` 通过。

## 2026-05-16
### Team Runtime v2 P2 worker lease / heartbeat / crash recovery
- 日期：2026-05-16
- 主题：为 Team worker 增加 durable run lease、heartbeat 和 stale running 恢复，避免多 worker 抢同一 run，并让 worker 崩溃后的 running run 可被重新接管。
- 影响范围：
  - `TeamRunState` 新增可选 `lease` 元数据：`ownerId`、`acquiredAt`、`heartbeatAt`、`expiresAt`。
  - `RunWorkspace` 新增 `claimNextRunnableRun()`、`claimRun()`、`heartbeatRunLease()`、`releaseRunLease()` 和 `clearRunLease()`；claim 使用 run 目录 `.lock` 原子互斥。
  - `team-worker` 不再直接找第一个 queued run，而是先 claim lease；执行期间 heartbeat，lease 丢失时 abort 当前 run。
  - `TeamOrchestrator.runToCompletion()` 可接收 `leaseOwnerId`，phase 写回前校验 lease owner，避免旧 worker 迟到写回。
  - `orchestrator.ts` 在 worker/checker/watcher 阶段推进 task progress，并写回 attempt 状态，避免 UI 长时间停在 `worker_running`。
  - `AgentProfileRoleRunner` 增加 checker/watcher JSONish 解析 fallback，兼容模型在 JSON 字符串字段里裸写中文引号的真实输出。
  - 新增 `TEAM_WORKER_LEASE_TTL_MS` 和 `TEAM_WORKER_HEARTBEAT_INTERVAL_MS` 环境变量。
  - 新增 `test/team-run-lease.test.ts`，并补充 lease 丢失后不写 accepted result、checker JSONish 输出解析的回归测试。

## 2026-05-16
### P1.5 Team Runtime 实时可观测性收口
- 日期：2026-05-16
- 主题：为 /playground/team 添加 SSE 实时状态更新和 attempt 级详情展示。
- 影响范围：
  - 新增 SSE 端点 `GET /v1/team/runs/:runId/events`：推送 run state snapshot，active run 每 2 秒轮询推送，terminal 后发送最终 snapshot 并关闭。15 秒 heartbeat 保持连接。客户端断开自动清理。
  - 新增 Attempt 只读 API：`GET .../tasks/:taskId/attempts`（列出 attempts 和文件）和 `GET .../attempts/:attemptId/files/:fileName`（安全文件读取，含路径遍历防护）。
  - `RunWorkspace` 新增 `listAttempts()` 和 `readAttemptFile()` 方法，含路径包含验证。
  - UI：active run 自动订阅 SSE，增量更新 badge/progress/elapsed/currentTask/error/progress bar。展开任务详情时获取 attempts 列表并展示。保留手动刷新按钮作为 fallback。
  - 新增 `test/team-sse-attempt-api.test.ts`（12 个测试）和 `test/team-page-ui.test.ts` 新增 8 个测试。npm run test:team 133 pass。

## 2026-05-16
### Team Runtime v2 finalizer fallback report + skill enhancement
- 日期：2026-05-16
- 主题：(1) Finalizer 失败时生成确定性 fallback report；(2) 增强 team-plan-creator skill 为交互式向导。
- 影响范围：
  - orchestrator.ts：runFinalizer 内部 catch finalizer 错误，调用 generateFallbackReport 生成包含 task status/resultRef/errorSummary 的系统报告。finalizer 失败时 run 状态为 completed_with_failures，lastError 保留错误信息。cancelled/paused 不写 fallback。
  - SKILL.md：重写为 5 步交互式向导（先问目标 -> 查已有 -> 复用/创建 TeamUnit -> 预览 JSON -> 创建 Plan）。增加任务拆分规则和禁止项。
  - 新增 test/team-finalizer-fallback.test.ts（4 个测试）和 test/team-plan-creator-skill.test.ts（8 个测试）。npm run test:team 113 pass。

## 2026-05-16
### Team Runtime v2 UI observability + docs rewrite to pure v2
- 日期：2026-05-16
- 主题：(1) 增强 /playground/team 可观测性 UI；(2) 重写 docs/team-runtime.md 为纯 v2 文档。
- 影响范围：
  - team-page.ts：Run 列表展示 lastError、currentTaskId、summary 细分。新增可展开 task detail panel，显示 title/status/phase/message/attemptCount/activeAttemptId/resultRef/errorSummary。新增刷新按钮和 cancelled run 删除。所有动态文本走 escapeHtml。
  - docs/team-runtime.md：重写为纯 v2 结构。v0.1 域名调查历史压缩到归档章节。
  - 8 个新 UI 断言测试。npm run test:team 101 pass。

## 2026-05-16
### Team Runtime v2 审计修复：stale write-back、finalizer resultRef、resume 跳过
- 日期：2026-05-16
- 主题：修复三个审计发现的问题：(1) cancel/pause 后迟到 phase 结果覆盖 terminal 状态；(2) finalizer 不读取 resultRef 文件内容；(3) resume 从第一个 task 重新跑。
- 影响范围：
  - `orchestrator.ts`：`runWorkUnit`/`runWatcherPhase`/`runFinalizer` 每个 phase 返回后 re-read state，发现 `cancelled`/`paused` 立即停止写回。`runToCompletion` 遍历 tasks 时跳过 `succeeded`/`failed`/`cancelled` 的 terminal task。
  - `agent-profile-role-runner.ts`：`runFinalizer` 读取每个 task 的 `resultRef` 文件内容传入 prompt；`buildFinalizerPrompt` 接受并展示 `resultContent`。文件不存在时 fallback 为 ref 字符串。
  - 新增 3 个回归测试：finalizer 返回前外部 cancel 不覆盖、finalizer prompt 包含 resultRef 内容、resume 跳过已成功 task 不重复执行。
  - `npm run test:team` 90 pass，`npm test` 819 pass。

## 2026-05-16
### Team Runtime v2 P0：真实 Agent session 强中断与 cancel 语义
- 日期：2026-05-16
- 主题：给 Team Runtime v2 补上真实 Agent session 级别的 abort 能力，使 cancel/pause 不再只停留在磁盘状态层面，而是能真正中断底层正在运行的 `session.prompt()`。
- 影响范围：
  - `WorkerInput`/`CheckerInput`/`WatcherInput`/`FinalizerInput` 新增可选 `signal?: AbortSignal` 字段。
  - `AgentProfileRoleRunner` 内部新增 `promptWithAbort()` 辅助函数，用 `Promise.race` 模式让 `session.prompt()` 与 `AbortSignal` 竞争；signal 触发时调用 `session.abort()` 强制中止 session。
  - `TeamOrchestrator.runToCompletion()` 接受可选 `{ signal?: AbortSignal }` 参数，内部创建 `AbortController` 并链接外部 signal。signal 通过 `executeTask` → `runWorkUnit` → `runWatcherPhase` → `runFinalizer` 全链路传播到每个 runner 调用。
  - `cancelRun()` 和 `pauseRun()` 在更新磁盘状态后，同时触发内部 `AbortController.abort()`，中断正在执行的 agent session。
  - `team-worker` tick 中创建 `AbortController`，并启动 2 秒间隔的状态轮询 watcher：检测到外部 cancel/pause 写入的状态变更后自动 abort 当前 run。
  - runner 返回后 orchestrator 重新读取磁盘状态，避免 aborted 后的迟到结果写回已 cancelled/paused run。
  - 新增 4 个测试：abort 时 session.abort() 被调用、外部 signal 传播、cancel 触发 abort、pause 触发 abort。`npm run test:team` 87 pass，`npm test` 816 pass。

## 2026-05-15
### Team Runtime v2 执行链路收口
- 日期：2026-05-15
- 主题：按 Team Runtime v2 设计 / 执行计划审计实现后，修复“看似完成、实际只是骨架”的高风险问题，收口 Run 执行所有权、AgentProfile 锁、生产 worker、真实 runner 结果输入和页面安全。
- 影响范围：
  - `POST /v1/team/plans/:planId/runs` 现在只创建 `queued` run，不再由 HTTP 请求内联执行；`resume` 也只恢复为 queued，执行交给 `ugk-pi-team-worker`。
  - `TeamOrchestrator.runToCompletion()` 捕获 runner 异常并把 run 收口为 `failed` / `completed_with_failures`，避免任务抛错后长期卡在 `running`。
  - TeamUnit 创建 / 修改会校验四个 AgentProfile ID；Plan 创建 / 切换默认团队会校验 TeamUnit 存在且未归档。
  - 活跃 Team run 会锁住对应 AgentProfile，阻止 profile 编辑、归档、技能安装 / 删除 / 启停和规则文件修改。
  - `TEAM_USE_MOCK_RUNNER` 默认改为 `true`；生产 compose 补齐 `ugk-pi-team-worker`、Team 数据挂载和 Team 环境变量，真实 runner 需显式 `TEAM_USE_MOCK_RUNNER=false`。
  - AgentProfile runner 的 watcher JSON 解析失败改为 `confirm_failed`；finalizer prompt 读取 task `resultRef` 文件内容，不再只看 state 摘要。
  - `/playground/team` 对 API 动态文本做 HTML escape，并补充任务进度、耗时统计、暂停 / 恢复 / 取消入口。
  - `team-plan-creator` skill 明确只创建 / 更新 TeamUnit 和 Plan，不得创建 / 启动 Run。
  - `npm run test:team` 改为串行执行，避免多个 Fastify 实例并发初始化 SQLite 时随机 `database is locked`。
  - `docs/team-runtime.md` 顶部补充 v2 当前接口、文件真源、验证记录和剩余限制；`docs/handoff-current.md` 补充本轮审计修复现场。
  - 新增 `.codex/plans/2026-05-15-team-runtime-v2-next-agent-execution-plan.md`，把剩余 P0/P1/P2 任务拆成下个 agent 可直接执行的交接计划。
- 验证：
  - `node --test --import tsx test/team-routes.test.ts test/team-orchestrator-controls.test.ts test/team-agent-profile-runner.test.ts test/team-page-ui.test.ts test/containerization.test.ts test/team-agent-profile-locks.test.ts`（35 pass / 0 fail）
  - `npx tsc --noEmit`
  - `npm run test:team`（83 pass / 0 fail）
- 对应入口：
  - `src/team/routes.ts`
  - `src/team/orchestrator.ts`
  - `src/team/agent-profile-role-runner.ts`
  - `src/routes/agent-profiles.ts`
  - `src/workers/team-worker.ts`
  - `docker-compose.prod.yml`
  - `src/ui/team-page.ts`
  - `.pi/skills/team-plan-creator/SKILL.md`
  - `docs/team-runtime.md`
  - `docs/handoff-current.md`
  - `.codex/plans/2026-05-15-team-runtime-v2-next-agent-execution-plan.md`

### 主体代码核查：统一错误响应、清理死代码、消除重复
- 日期：2026-05-15
- 主题：对 Routes / Agent / Browser 主体模块做全面代码核查，统一 API 错误响应格式，清理死代码和重复实现，为后续开发扫清隐患。
- 影响范围：
  - **错误响应契约统一**：所有路由现在返回统一的 `{ error: { code, message } }` 结构。`http-errors.ts` 新增 `sendNotFound`（404）、`sendConflict`（409）、`sendNotImplemented`（501）辅助函数。涉及 `artifacts.ts`（12 处）、`agent-profiles.ts`（11 处）、`browsers.ts`（2 处）。
  - **`src/types/api.ts`**：`ErrorResponseBody` 增加 `NOT_FOUND | CONFLICT | NOT_IMPLEMENTED` code；删除未使用的 `NotificationStreamEventBody` 类型。
  - **死代码清理**：`conn-run-store.ts` 删除从未调用的 `parseJson<T>`；`conn-db.ts` 删除重复创建的 `idx_conn_runs_unread` 索引。
  - **路径检查统一**：`isPathInside` 从三处重复实现合并到 `file-route-utils.ts` 一处导出（改用更健壮的 `relative()` 实现）。`static.ts` 和 `artifacts.ts` 改为导入。
  - **格式修复**：`conn-db.ts`、`background-workspace.ts` 缩进修正；`agent-profile-catalog.ts` 消除同一表达式内双重 `normalizeOptionalBrowserId` 调用。
- 验证：
  - `npx tsc --noEmit`（0 错误）
  - `server.test.ts`（126 pass）、`chat-agent-routes.test.ts`（14 pass）、`browser-routes.test.ts`（5 pass）、`artifact-routes.test.ts`（10 pass）
  - `npm run design:lint`（0 errors / 0 warnings）
- 对应入口：
  - `src/routes/http-errors.ts`
  - `src/types/api.ts`

### 审计修复：补全测试断言和 browsers.ts 错误格式
- 日期：2026-05-15
- 主题：架构去重后的回归审计发现部分测试文件和 browsers.ts 未完全迁移到新的嵌套错误格式，补全修复。
- 影响范围：
  - `test/chat-agent-browser-routes.test.ts`：2 处 `.json().message` → `.json().error.message`
  - `test/agent-model-chat-routes.test.ts`：3 处 `.json().message` → `.json().error.message`
  - `src/routes/browsers.ts`：closeTarget catch 块的内联错误响应改用 `sendBadRequest()`
- 验证：5 个受影响测试文件共 33 个用例全部通过
- 对应入口：同上

### 架构去重：SSE 基础设施、MIME 映射、路由工具函数
- 日期：2026-05-15
- 主题：架构审查后执行的机械性去重，消除跨文件重复代码。
- 影响范围：
  - **SSE 去重**：`notifications.ts` 删除本地 `writeSseEvent`/`endSseResponse`/SSE header 设置，改用 `chat-sse.ts` 的导出函数。`chat-sse.ts` 的 `writeSseEvent` 改为泛型以兼容不同事件类型。
  - **MIME 映射统一**：`file-route-utils.ts` 的 `CONTENT_TYPES` 扩展为超集（新增 `.htm`、`.xlsx`）。`static.ts` 和 `artifacts.ts` 删除本地映射，改为导入 `resolveContentType()`。
  - **路由工具函数提取**：新增 `src/routes/agent-route-utils.ts`，集中导出 `resolveScopedAgentServiceOrSend`、`sendUnknownAgent`、`validateBrowserId`。`chat.ts` 和 `agent-profiles.ts` 删除本地重复定义。
- 验证：
  - `npx tsc --noEmit`（0 错误）
  - server（126 pass）、chat-agent-routes（14 pass）、browser-routes（5 pass）、artifact-routes（10 pass）
- 对应入口：
  - `src/routes/agent-route-utils.ts`
  - `src/routes/chat-sse.ts`

## 2026-05-14
### Team Run 手动取消功能
- 日期：2026-05-14
- 主题：在 `/playground/team` 页面增加手动取消正在运行的 Team run 的能力，补齐交接文档中明确缺失的产品功能。
- 影响范围：
  - `src/team/team-events.ts`：新增 `team_run_cancelled` 事件类型。
  - `src/team/team-workspace.ts`：新增 `cancelRun()` 方法，校验状态、设置 `cancelled`/`finishedAt`/`stopSignals`、原子写入。
  - `src/team/team-orchestrator.ts`：`runBackgroundRoleTask()` 增加两处 `cancelled` 防御检查，防止已取消 run 的后台任务继续写入。
  - `src/routes/team.ts`：新增 `POST /v1/team/runs/:teamRunId/cancel`（200 成功、409 状态冲突、404 不存在）。
  - `src/ui/team-page.ts`：running/queued 状态显示"取消 Run"危险按钮，确认弹窗，防重复点击。
- 验证：
  - `npx tsc --noEmit`（0 错误）
  - `npm run test:team`（145 pass / 0 fail）
- 对应入口：
  - `src/routes/team.ts`
  - `src/ui/team-page.ts`

### Agent 容器补 DNS 查询工具
- 日期：2026-05-14
- 主题：在 Dockerfile 中加入 `dnsutils`，让 Team/Agent 运行容器具备 `dig`、`nslookup`、`host`，Evidence Agent 可稳定查询 MX/NS/TXT/CAA/SOA 等记录。
- 影响范围：
  - `Dockerfile`：`apt-get install` 列表新增 `dnsutils`。
- 验证：
  - `docker compose exec -T ugk-pi-team-worker sh -lc 'dig medtrum.com A +short && dig medtrum.com MX +short && dig medtrum.com NS +short && dig medtrum.com TXT +short'`（A/MX/NS/TXT 全部正常返回）
  - `curl -s http://127.0.0.1:3000/healthz`（`{"ok":true}`）
- 对应入口：
  - `Dockerfile`
  - `docs/team-runtime.md`

### Team Discovery 专业调查员 prompt
- 日期：2026-05-14
- 主题：把 Discovery 默认职责从“找关键词相关域名”升级为“专业域名调查员自己规划发现路径”，减少对用户显式点名 `crt.sh`、证书透明日志、DNS 等方法的依赖。
- 影响范围：
  - `src/team/templates/brand-domain-discovery.ts`：Discovery role responsibility 明确要求按需考虑搜索、官网链接、`crt.sh` / certificate transparency、DNS / subdomain clues、regional TLD、login / portal / app / support、docs、partners、social profiles、app stores、code/doc references 等公开线索。
  - `src/team/agent-profile-team-role-task-runner.ts`：绑定 Agent profile 的 Discovery prompt 明确“用户不一定知道调查方法，角色要自己规划策略”，并要求使用 CT 来源时标注 `sourceType: certificate_transparency` 和具体来源。
  - `src/team/team-role-prompts.ts`：默认 LLM Discovery prompt 同步专业调查员口径，避免退回单一搜索摘要。
  - `src/ui/team-page.ts`：右侧角色卡的默认 Discovery prompt 显示同样的调查员框架，用户可继续编辑但不必从零写专业方法。
  - `docs/team-runtime.md`：记录“用户给目标，Discovery 自己选方法；输出结构化提交”的运行口径。
- 验证：
  - `node --test --import tsx test/team-agent-profile-role-task-runner.test.ts test/team-role-task-runner.test.ts test/team-template-brand-domain.test.ts test/team-page-ui.test.ts`（28 pass / 0 fail）
  - `npx tsc --noEmit`
  - `npm run test:team`（136 pass / 0 fail）
- 对应入口：
  - `src/team/agent-profile-team-role-task-runner.ts`
  - `src/team/team-role-prompts.ts`
  - `src/ui/team-page.ts`
  - `docs/team-runtime.md`

### Team 角色配置右侧化与 prompt 可编辑
- 日期：2026-05-14
- 主题：把 `/playground/team` 的角色配置从左侧固定下拉框迁到右侧模板驱动角色卡片，并允许用户在创建 run 前编辑每个角色 prompt。
- 影响范围：
  - `src/routes/team.ts`：`GET /v1/team/templates*` 返回模板 `roles`，创建事件记录 `rolePromptOverrides`。
  - `src/team/types.ts`、`src/team/templates/brand-domain-discovery.ts`、`src/team/team-orchestrator.ts`：创建 run 时持久化 `rolePromptOverrides`，并在 role task input 中传入 `rolePromptOverride`。
  - `src/team/team-role-task-runner.ts`、`src/team/agent-profile-team-role-task-runner.ts`：LLM runner 与 Agent profile runner 都会应用用户 prompt override，同时保留默认 RoleBox / submit tool / stream 契约。
  - `src/ui/team-page.ts`：左侧保留创建基础表单和 Runs 列表；右侧按当前模板动态渲染角色卡片，每张卡可选择 Agent profile、编辑 prompt、重置 prompt。
  - `docs/team-runtime.md`：同步模板 roles、`rolePromptOverrides` 和页面交互口径。
- 验证：
  - `node --test --import tsx test/team-page-ui.test.ts test/team-routes.test.ts test/team-orchestrator.test.ts test/team-agent-profile-role-task-runner.test.ts test/team-role-task-runner.test.ts`（48 pass / 0 fail）
  - `npx tsc --noEmit`
  - `npm run test:team`（136 pass / 0 fail）
- 对应入口：
  - `src/ui/team-page.ts`
  - `src/routes/team.ts`
  - `src/team/team-orchestrator.ts`
  - `docs/team-runtime.md`

### Team Discovery 心跳式后台运行
- 日期：2026-05-14
- 主题：把绑定 Agent profile 的 Discovery 从固定墙钟超时改为后台活跃任务 + heartbeat watchdog，让它可以持续提交候选域名，同时不阻塞 Evidence 等下游角色推进。
- 影响范围：
  - `src/team/team-orchestrator.ts`：profile Discovery 启动后写入 `activeRoleTasks` 并以 `mode: "background"` 运行；`submitCandidateDomain` 接受结果时刷新 `lastHeartbeatAt` / `lastOutputAt`；watchdog 同时把 role task session JSONL 更新时间当作活跃信号；下游 tick 可以继续消费已提交的 `candidate_domains`；Finalizer 会等待 active role task 清空。
  - `src/team/types.ts`：新增 `TeamActiveRoleTask`，记录后台角色的 `startedAt`、`lastHeartbeatAt`、`lastOutputAt`、`outputCount` 和 profile 信息。
  - `src/team/team-events.ts`：新增 `role_task_watchdog` 事件，用于记录长时间无 heartbeat 的活跃角色被 watchdog 标记。
  - `test/team-orchestrator.test.ts`：覆盖 Discovery 未结束时 Evidence 可继续消费已提交候选，以及 watchdog 按 heartbeat / session 写入老化而不是启动时长判断。
  - `docs/team-runtime.md`：同步 Discovery 持续生产者、heartbeat watchdog 和 `TEAM_ROLE_TASK_TIMEOUT_MS` 新语义。
- 验证：
  - `node --test --import tsx test/team-orchestrator.test.ts`
  - `npx tsc --noEmit`
  - `npm run test:team`（132 pass / 0 fail）
- 对应入口：
  - `src/team/team-orchestrator.ts`
  - `src/team/types.ts`
  - `docs/team-runtime.md`

### Team Discovery 来源标签口径收口
- 日期：2026-05-14
- 主题：把 Discovery 的任务说明收口为“过程自由、结果结构化”，不硬编码具体找法，但要求提交候选域名时标清来源类型和来源证据。
- 影响范围：
  - `src/team/agent-profile-team-role-task-runner.ts`：Agent profile Discovery prompt 明确可自由使用当前 profile 的浏览器、web-access、搜索、shell、文档等能力，并要求 `sourceType` 选择最接近的来源标签。
  - `src/team/team-role-prompts.ts`：默认 LLM Discovery prompt 不再写成只处理固定 query，而是把 query 作为 seed，并要求不要只依赖单一 discovery method。
  - `test/team-agent-profile-role-task-runner.test.ts`、`test/team-role-task-runner.test.ts`：覆盖新的 Discovery prompt 口径。
  - `docs/team-runtime.md`：说明 `sourceType` 是候选域名来源标签，不是硬编码执行步骤。
- 验证：
  - `node --test --import tsx test/team-agent-profile-role-task-runner.test.ts test/team-role-task-runner.test.ts`
  - `npx tsc --noEmit`
  - `npm run test:team`（129 pass / 0 fail）
- 对应入口：
  - `src/team/agent-profile-team-role-task-runner.ts`
  - `src/team/team-role-prompts.ts`
  - `docs/team-runtime.md`

### Team 下游角色单条实时接力
- 日期：2026-05-14
- 主题：把 Brand Domain Discovery 的下游推进从“小批量消费”收口为“单条上游 item 接力”，让 Evidence / Classifier / Reviewer 的运行状态更容易在页面事件流里观察。
- 影响范围：
  - `src/team/templates/brand-domain-discovery.ts`：Evidence Collector、Classifier、Reviewer 每个 role task 只消费 1 条新上游 item，cursor 成功后逐条推进。
  - `src/team/team-orchestrator.ts`：`role_task_started` 事件增加 `consumes` 摘要，包含消费的 stream、item 数、itemId 和域名，方便 UI / 人类直接看出当前角色正在处理什么。
  - `test/team-template-brand-domain.test.ts`、`test/team-orchestrator.test.ts`：补充单条消费和事件摘要断言，并把完成态测试改为按真实 worker tick 节奏循环推进。
  - `docs/team-runtime.md`：同步下游单条接力和 `role_task_started.consumes` 的运行口径。
- 验证：
  - `npx tsc --noEmit`
  - `node --test --import tsx test/team-template-brand-domain.test.ts test/team-orchestrator.test.ts`
  - `npm run test:team`（129 pass / 0 fail）
- 对应入口：
  - `src/team/templates/brand-domain-discovery.ts`
  - `src/team/team-orchestrator.ts`
  - `test/team-template-brand-domain.test.ts`
  - `test/team-orchestrator.test.ts`

### Team 全角色接入 Agent profile
- 日期：2026-05-14
- 主题：把 Team role 的 Agent profile 执行化从 Discovery 扩展到 Evidence Collector、Classifier、Reviewer、Finalizer，让每个角色都能通过页面选择独立 Agent profile，继承对应模型源、skills、规则文件和默认 Chrome。
- 影响范围：
  - `src/team/agent-profile-team-role-task-runner.ts`：移除只允许 `discovery` 的限制，为 Evidence / Classifier / Reviewer 注入对应 Team submit tool，为 Finalizer 返回 profile 生成的 Markdown 报告。
  - `src/team/team-role-task-runner.ts`：`CompositeTeamRoleTaskRunner` 对任意绑定 `profileId` 的角色优先走 Agent profile runner；未绑定角色继续走原 Team LLM runner。
  - `src/ui/team-page.ts`：创建 run 表单增加五个角色的 Agent profile 下拉框，并提交完整 `roleProfileIds`。
  - `docker-compose.yml`：`ugk-pi-team-worker` 补齐 conn-worker 同口径的浏览器实例、scope route、上传目录和 public URL 环境变量，避免绑定 `chrome-02` 时实际落到默认浏览器。
  - `test/team-agent-profile-role-task-runner.test.ts`、`test/team-orchestrator.test.ts`、`test/team-page-ui.test.ts`：覆盖非 discovery submit tool、finalizer markdown、全角色 profile 绑定和页面提交字段。
  - `docs/team-runtime.md`：同步全角色 profile 化后的运行口径和剩余限制。
- 验证：
  - `npx tsc --noEmit`
  - `node --test --import tsx test/team-agent-profile-role-task-runner.test.ts test/team-orchestrator.test.ts test/team-page-ui.test.ts`
  - `npm run test:team`（127 pass / 0 fail）
- 对应入口：
  - `src/team/agent-profile-team-role-task-runner.ts`
  - `src/team/team-role-task-runner.ts`
  - `src/ui/team-page.ts`
  - `docker-compose.yml`

### Team Discovery 接入 Agent profile 执行链路
- 日期：2026-05-14
- 主题：让 `roleProfileIds.discovery` 不再只是状态字段，而是按后台任务 conn 的同一口径创建真实 AgentSession，继承绑定 Agent profile 的模型源、模型、skills、规则文件和默认 Chrome，并额外挂载 Team 的 `submitCandidateDomain` 工具。
- 影响范围：
  - `src/agent/background-agent-session-factory.ts`：从 conn worker 中抽出共享 `ProjectBackgroundSessionFactory`、resource loader 和模型解析逻辑，支持调用方追加 custom tools。
  - `src/workers/conn-worker.ts`：改为复用共享 session factory，并保留旧 helper re-export，避免旧测试和外部导入断裂。
  - `src/team/agent-profile-team-role-task-runner.ts`：新增 Agent profile role runner；当前只执行化 `discovery`，会 resolve profile snapshot、选择 profile/default Chrome、创建 team role workspace、注入 `submitCandidateDomain`，并保留 JSON envelope fallback。
  - `src/team/team-role-task-runner.ts`：`CompositeTeamRoleTaskRunner` 在 `discovery` 绑定 `profileId` 时优先走 Agent profile runner，未绑定时仍走原 LLM runner。
  - `src/workers/team-worker.ts`：初始化 Team worker 时创建 profile resolver、共享 session factory、browser registry，并把 profile runner 注入 composite runner。
  - `src/ui/team-page.ts`：创建 run 表单增加 `Discovery Agent profile` 下拉框，从 `/v1/agents` 拉取已有 Agent profile，选择后提交 `roleProfileIds.discovery`，方便直接在 Playground 测 `TeamAgent`。
  - `test/team-agent-profile-role-task-runner.test.ts`、`test/team-page-ui.test.ts`、`package.json`：新增覆盖 profile snapshot、模型、Chrome、Team submit tool 注入和页面提交字段的测试，并纳入 `npm run test:team`。
  - `docs/team-runtime.md`：同步当前能力边界，明确只有 Discovery 已 profile 执行化，其他角色仍未接入。
- 验证：
  - `node --test --import tsx test/team-agent-profile-role-task-runner.test.ts test/team-role-task-runner.test.ts`
  - `npx tsc --noEmit`
  - `npm run test:team`（125 pass / 0 fail）
  - `node --test --import tsx test/conn-worker.test.ts test/background-agent-runner.test.ts`
  - `git diff --check`
- 对应入口：
  - `src/team/agent-profile-team-role-task-runner.ts`
  - `src/agent/background-agent-session-factory.ts`
  - `src/workers/team-worker.ts`

### Team role 预埋 Agent profile 绑定
- 日期：2026-05-14
- 主题：为 Team run 增加 `roleProfileIds` 契约，允许创建 run 时声明某个 Team role 未来应由哪个 Agent profile 执行，为复用后台任务的 Agent 设置、skills、Chrome 和模型源做第一步铺垫。
- 影响范围：
  - `src/team/types.ts`：新增 `TeamRoleProfileBindings`，并在 `TeamRunState`、`CreateBrandDomainDiscoveryPlanInput`、`TeamRoleTaskExecutionInput` 中承载 role/profile 绑定。
  - `src/team/templates/brand-domain-discovery.ts`：创建 run 时规范化并持久化 `roleProfileIds`。
  - `src/team/team-orchestrator.ts`：执行 role task 前把对应 `profileId` 绑定到 task，并在 `role_task_started` 事件中记录。
  - `src/routes/team.ts`：`team_run_created` 事件包含本次 run 的 role profile 绑定。
  - `test/team-template-brand-domain.test.ts`、`test/team-orchestrator.test.ts`、`test/team-routes.test.ts`：覆盖绑定落盘、事件记录和 role task 输入。
  - `docs/team-runtime.md`：说明这是 Agent profile runner 的预埋契约，尚未真正让角色继承 profile skills / Chrome / 模型源。
- 验证：
  - `node --test --import tsx test/team-template-brand-domain.test.ts test/team-orchestrator.test.ts test/team-routes.test.ts`
  - `npx tsc --noEmit`
  - `git diff --check`
  - `npm run test:team`（124 pass / 0 fail）
- 对应入口：
  - `src/team/types.ts`
  - `src/team/templates/brand-domain-discovery.ts`
  - `src/team/team-orchestrator.ts`
  - `src/routes/team.ts`

### Team 下游角色低门槛触发
- 日期：2026-05-14
- 主题：把 `brand_domain_discovery` 的下游触发门槛从“攒够 10 条再推进”改为“至少 1 条新上游 item 就推进”，方便在 Playground 里观察 `candidate_domains`、`domain_evidence`、`domain_classifications`、`review_findings` 逐步出现。
- 影响范围：
  - `src/team/templates/brand-domain-discovery.ts`：Evidence Collector 只要看到 1 条新 `candidate_domains` 就创建任务；Classifier 只要看到 1 条新 `domain_evidence` 就创建任务；单次批处理上限仍保留 10 条。
  - `test/team-template-brand-domain.test.ts`：更新 readiness 断言，覆盖少量候选和少量证据也会推进下游。
  - `docs/team-runtime.md`：同步当前运行契约，说明低门槛触发是为了观测链路，不是 durable 并发 scheduler。
- 验证：
  - `node --test --import tsx test/team-template-brand-domain.test.ts test/team-orchestrator.test.ts`
  - `npx tsc --noEmit`
  - `git diff --check`
  - `npm run test:team`（121 pass / 0 fail）
- 对应入口：
  - `src/team/templates/brand-domain-discovery.ts`
  - `test/team-template-brand-domain.test.ts`

### Team Finalizer agent 生成中文最终报告
- 日期：2026-05-14
- 主题：激活 Team Runtime 里已有的 `finalizer` 角色，让 finalizer LLM 读取四类 stream 后生成中文 Markdown `final_report.md`；模板报告逻辑只作为 finalizer 失败时的中文 fallback。
- 影响范围：
  - `src/team/team-role-prompts.ts`：新增 finalizer prompt，明确只输出中文 Markdown，不输出 JSON，不编造未给出的事实。
  - `src/team/team-role-task-runner.ts`：`finalizer` 从空成功结果改为调用 LLM，并通过 `finalReportMarkdown` 返回报告正文。
  - `src/team/team-orchestrator.ts`：finalization 阶段把 streams、streamCounts、轮次、停止信号和 company hints 传给 finalizer；finalizer 成功时把 agent 生成的 Markdown 交给 template 写入 artifact，失败时继续走 fallback。
  - `src/team/templates/brand-domain-discovery.ts`、`src/team/templates/competitor-domain-discovery.ts`：fallback 报告中文化；存在 `finalReportMarkdown` 时优先写 agent 报告。
  - `docker-compose.yml`：默认真实角色列表增加 `finalizer`。
  - `test/team-role-task-runner.test.ts`、`test/team-orchestrator.test.ts`、`test/team-template-brand-domain.test.ts`、`test/team-template-competitor-domain.test.ts`：覆盖 finalizer agent 报告、artifact 写入和中文 fallback。
  - `docs/team-runtime.md`：同步最终报告主路径、fallback 边界和 `TEAM_REAL_ROLES` 配置。
- 验证：
  - `git diff --check`
  - `npx tsc --noEmit`
  - `npm run test:team`（120 pass / 0 fail）
  - `npm test`（900 pass / 0 fail）
- 对应入口：
  - `src/team/team-role-prompts.ts`
  - `src/team/team-role-task-runner.ts`
  - `src/team/team-orchestrator.ts`
  - `src/team/templates/brand-domain-discovery.ts`
  - `src/team/templates/competitor-domain-discovery.ts`

### Team 四角色 submit tool loop 接通
- 日期：2026-05-14
- 主题：把 Evidence Collector、Classifier、Reviewer 也接入 Team submit tool loop，让四个产物流角色都能在 tool-calling 模式下即时提交对应 stream item，并补齐真实模型调用所需的 tool 参数 schema 和状态即时落盘。
- 影响范围：
  - `src/team/team-role-task-runner.ts`：Evidence Collector / Classifier / Reviewer 从旧 `callLLMFn(prompt)` 路径改为构建 RoleBox 后调用 `callLLMForTask()`；存在 `llmConfig` 和 task 级 submit handler 时走 provider-api-aware submit tool loop，缺省时仍保持 JSON envelope fallback。
  - `src/team/team-role-task-runner.ts`：模型已通过 submit tool 提交阶段成果但最终 JSON envelope 损坏时，runner 按成功空 emits 收口，避免已提交结果又因收尾 JSON 失败触发 retry。
  - `src/team/team-orchestrator.ts`：run 进入 `running`、round 递增和 submit tool 接受 item 后立即写回 `state.json`，让 SSE 后的页面刷新能看到真实状态和 counters。
  - `src/team/team-submit-tools.ts`、`src/team/llm-tool-loop.ts`：submit tool spec 增加真实 `inputSchema`，Anthropic / OpenAI-compatible tool 声明不再发送空 schema。
  - `src/team/role-box.ts`：RoleBox contract 明确“工具可用时立即 submit，最终 JSON envelope 不重复已提交结果”，避免模型把 tool result 再批量塞回 `emits[]`。
  - `test/team-role-task-runner.test.ts`、`test/team-orchestrator.test.ts`、`test/team-submit-tools.test.ts`：新增三类非 Discovery 角色 submit tool loop、坏 JSON fallback、运行中状态/counter 即时持久化和 tool schema 回归测试。
  - `docs/team-runtime.md`、`.codex/plans/2026-05-14-handoff-team-realtime-submit.md`：同步当前边界，明确四个产物流角色已接入，但 durable 并发 scheduler 仍未实现。
- 验证：
  - `node --test --import tsx test/team-submit-tools.test.ts test/team-llm-tool-loop.test.ts test/team-role-task-runner.test.ts test/team-orchestrator.test.ts`
  - `npx tsc --noEmit`
  - `npm run test:team`
  - `npm test`
  - Docker live：`docker compose up -d` + `docker compose restart ugk-pi ugk-pi-team-worker` 后，`/healthz`、`/playground/team`、`/v1/team/templates` 均返回正常；真实 `teamrun_mp58i4yl_kjbc` 完成并生成 `final_report.md`。该 run 曾在修复过程中重启 worker，出现下游重复 stream，作为 durable scheduler 未完成的真实边界保留。
- 对应入口：
  - `src/team/team-role-task-runner.ts`
  - `src/team/team-orchestrator.ts`
  - `src/team/team-submit-tools.ts`
  - `src/team/llm-tool-loop.ts`
  - `src/team/role-box.ts`
  - `test/team-role-task-runner.test.ts`

### Team Discovery submit tracer bullet
- 日期：2026-05-14
- 主题：把 Discovery submit tool call 接入 TeamOrchestrator 的统一 stream 提交口，跑通 `submitCandidateDomain` 到 `candidate_domains` stream 再到下游 ready task 消费的最小闭环。
- 影响范围：
  - `src/team/team-role-task-runner.ts`：`TeamRoleTaskRunner` 支持可选 `runTaskWithSubmitToolHandler()`；`LLMTeamRoleTaskRunner` 和 `CompositeTeamRoleTaskRunner` 可在 task 级别接收 submit handler，项目统一 LLM 配置会被 tool loop 复用。
  - `src/team/team-orchestrator.ts`：执行 role task 时为支持 submit tool 的 runner 注入 handler；handler 调用 `submitTeamStreamItem()`，并即时写入 `stream_item_accepted` / `stream_item_rejected` / `stream_item_duplicate_skipped` 事件和 counter。
  - `test/team-orchestrator.test.ts`：新增 Discovery 在任务过程中 submit candidate 的 tracer bullet，验证候选域名立即落 stream，且 evidence collector 能在同一 tick 通过现有 ready-task 机制消费新增 item。
  - `docs/team-runtime.md`：更新 submit tool loop 当前边界，明确本阶段只证明 Discovery -> candidate stream -> evidence 消费闭环，不是完整并发 scheduler。
- 验证：
  - `node --test --import tsx test/team-orchestrator.test.ts test/team-role-task-runner.test.ts`
  - `npx tsc --noEmit`
- 对应入口：
  - `src/team/team-orchestrator.ts`
  - `src/team/team-role-task-runner.ts`
  - `test/team-orchestrator.test.ts`

### Team LLM submit tool loop 底座
- 日期：2026-05-14
- 主题：新增 Team LLM submit tool loop 底座，按 provider `api` 字段处理 Anthropic `tool_use` 和 OpenAI-compatible `tool_calls`，并为 Discovery runner 提供可选接入。
- 影响范围：
  - `src/team/llm-tool-loop.ts`：新增 `callLLMWithTeamSubmitTools()`，发送 provider-specific tool specs，映射 submit tool 到 stream，并把 handler 结果回传模型。
  - `src/team/team-role-task-runner.ts`：`LLMTeamRoleTaskRunner` 支持注入 `llmConfig` 和 `submitToolHandler`；存在 handler 时 Discovery prompt 可走 submit tool loop，默认仍保留原 JSON envelope 路径。
  - `test/team-llm-tool-loop.test.ts`、`test/team-role-task-runner.test.ts`、`package.json`：覆盖 Anthropic `tool_use`、OpenAI-compatible `tool_calls`、forbidden tool rejection 和 Discovery runner 可选接入。
  - `docs/team-runtime.md`：补充 tool loop 底座边界，明确默认 Team worker 尚未接 orchestrator/workspace handler，不能宣称完整实时 submit 已上线。
- 验证：
  - `node --test --import tsx test/team-llm-tool-loop.test.ts test/team-role-task-runner.test.ts`
  - `npx tsc --noEmit`
- 对应入口：
  - `src/team/llm-tool-loop.ts`
  - `src/team/team-role-task-runner.ts`
  - `test/team-llm-tool-loop.test.ts`

### Team run 事件实时观察入口
- 日期：2026-05-14
- 主题：新增 Team run 事件 SSE 订阅入口，并让 `/playground/team` 在选中 run 后接收 live events。
- 影响范围：
  - `src/routes/team.ts`：新增 `GET /v1/team/runs/:teamRunId/events/stream`，订阅时确认 run 存在，随后基于 `events.jsonl` 增量 tail/poll 写出 `text/event-stream`。
  - `src/ui/team-page.ts`：选中 run 后创建 `EventSource` 订阅事件流；收到 `stream_item_accepted` 时刷新 run detail 和对应 stream，断线时提示退回手动刷新。
  - `test/team-routes.test.ts`、`test/team-page-ui.test.ts`、`package.json`：补充 SSE 路由、404、页面订阅断言，并纳入 `npm run test:team`。
  - `docs/team-runtime.md`：补充事件流 API 和“观察层不是持久真源”的运行契约。
- 验证：
  - `node --test --import tsx test/team-routes.test.ts`
  - `node --test --import tsx test/team-page-ui.test.ts`
  - `npx tsc --noEmit`
- 对应入口：
  - `src/routes/team.ts`
  - `src/ui/team-page.ts`
  - `test/team-routes.test.ts`
  - `test/team-page-ui.test.ts`

### Team RoleBox 与 submit tool 规格
- 日期：2026-05-14
- 主题：为 Team Runtime 增加 RoleBox 角色契约和 submit tool 静态映射，为后续真实 tool calling 做边界准备，同时保持当前 JSON envelope 兼容模式。
- 影响范围：
  - `src/team/team-submit-tools.ts`：新增 role 到 submit tool 的静态规格，并提供 `mapSubmitToolToStream()` 统一映射到 Team stream。
  - `src/team/role-box.ts`：新增 `buildRoleBox()`，声明角色输入输出流、must-not-do、submit tool、JSON envelope 兼容契约，并包装 LLM prompt。
  - `src/team/team-role-task-runner.ts`：LLM runner 在完成搜索 / 输入整理后，通过 RoleBox 包装 prompt；mock runner 和 JSON envelope 解析路径不变。
  - `test/team-submit-tools.test.ts`、`test/team-role-box.test.ts`、`test/team-role-task-runner.test.ts`：覆盖工具映射、角色边界和 runner prompt 接入。
  - `docs/team-runtime.md`：补充 RoleBox 与 submit tool 规格的运行边界，明确尚未接真实 provider tool loop。
- 验证：
  - `node --test --import tsx test/team-submit-tools.test.ts`
  - `node --test --import tsx test/team-role-box.test.ts`
  - `node --test --import tsx test/team-role-task-runner.test.ts`
- 对应入口：
  - `src/team/team-submit-tools.ts`
  - `src/team/role-box.ts`
  - `src/team/team-role-task-runner.ts`
  - `test/team-role-box.test.ts`

### Team stream 统一提交口
- 日期：2026-05-14
- 主题：新增 Team Runtime 的 stream submit gate，把 role emit 的权限校验、payload 校验、candidate 去重和 stream 持久化从 orchestrator 内联逻辑收口到统一入口。
- 影响范围：
  - `src/team/team-submit.ts`：新增 `submitTeamStreamItem()`，基于 `TeamTemplate.roles[].outputStreams` 判定写权限，调用模板 validator，跳过重复 `candidate_domains`，并通过 `TeamWorkspace.appendStreamItem()` 写入 stream。
  - `src/team/team-orchestrator.ts`：`processEmit()` 改为调用 submit gate；仍由 orchestrator 负责 `stream_item_accepted` / `stream_item_rejected` / `stream_item_duplicate_skipped` 事件、counter 和 cursor 语义。
  - `test/team-submit.test.ts`、`package.json`：新增提交口行为测试，并纳入 `npm run test:team`。
  - `docs/team-runtime.md`：补充 Team stream 统一提交口运行契约。
- 验证：
  - `node --test --import tsx test/team-submit.test.ts`
  - `npm run test:team`
  - `npx tsc --noEmit`
- 对应入口：
  - `src/team/team-submit.ts`
  - `src/team/team-orchestrator.ts`
  - `test/team-submit.test.ts`
  - `docs/team-runtime.md`

### 模型源与 Conn 状态传播文档收口
- 日期：2026-05-14
- 主题：补齐 DeepSeek Anthropic-compatible 迁移、key 环境变量隔离、`*-api.txt` 非正式配置源、以及 Conn provider error 不得假成功的文档口径。
- 影响范围：
  - `docs/model-providers.md`：增加当前模型源事实和防误判清单，明确 DeepSeek 当前走 `deepseek` / `anthropic-messages` / `https://api.deepseek.com/anthropic` / `DEEPSEEK_API_KEY`。
  - `docs/team-runtime.md`：明确 Team Runtime 只消费统一 registry/settings，不拥有独立 DeepSeek 或 `deepseek-api.txt` 配置路径。
  - `docs/runtime-assets-conn-feishu.md`：明确 conn worker 复用统一模型配置，并把 assistant `stopReason: "error"` 映射为 run failed。
  - `docs/docker-local-ops.md`、双云部署文档、`docs/handoff-current.md`：补充 worker 重启、生产 key 位置和旧文档口径防误读。
- 验证：
  - `git diff --check`
  - `npx tsc --noEmit`
  - `node --test --import tsx test/background-agent-runner.test.ts test/config.test.ts test/model-config.test.ts test/team-llm-config.test.ts test/containerization.test.ts`
- 对应入口：
  - `docs/model-providers.md`
  - `docs/runtime-assets-conn-feishu.md`
  - `docs/docker-local-ops.md`

### Conn 后台任务 provider error 状态传播修复
- 日期：2026-05-14
- 主题：修复 Conn 后台任务中 assistant 最终消息 `stopReason: "error"` 仍被标记为 `succeeded` 的假成功问题。
- 影响范围：
  - `src/agent/background-agent-runner.ts`：后台 conn run 在写入 `run_succeeded` 前复用主聊天的 `assertAssistantMessageSucceeded()`，provider 认证失败、上游错误等最终 assistant error 会进入 `run_failed` / `failed`。
  - `test/background-agent-runner.test.ts`：新增 provider error 回归测试，覆盖 `stopReason: "error"` + `errorMessage` 的失败状态传播。
- 验证：
  - `node --test --import tsx test/background-agent-runner.test.ts`
- 对应入口：
  - `src/agent/background-agent-runner.ts`
  - `test/background-agent-runner.test.ts`

### 智谱 GLM key 从 Anthropic SDK 全局变量隔离
- 日期：2026-05-14
- 主题：按 pi 官方 custom provider 配置语义收口智谱 GLM 认证，避免 `ANTHROPIC_AUTH_TOKEN` 污染同进程内其他 `anthropic-messages` provider。
- 影响范围：
  - `runtime/pi-agent/models.json`：`zhipu-glm` 改用 `ZHIPU_GLM_API_KEY`，并设置 `authHeader: true`，继续走 `https://open.bigmodel.cn/api/anthropic` / `anthropic-messages`。
  - `.env.example`、`src/config.ts`、`test/config.test.ts`：本地 bootstrap 默认智谱 key 名改为 `ZHIPU_GLM_API_KEY`。
  - `docs/model-providers.md`、云部署文档：同步智谱 key 命名，明确不把 Anthropic SDK 专用 `ANTHROPIC_AUTH_TOKEN` 当多 provider 公共变量。
- 验证：
  - `node --test --import tsx test/config.test.ts test/model-config.test.ts test/agent-session-factory.test.ts test/team-llm-config.test.ts test/containerization.test.ts`
  - `npm run test:team`
  - `npx tsc --noEmit`
  - `npm test`
  - Docker live：`/v1/model-config/validate` 对 `deepseek/deepseek-v4-pro` 和 `zhipu-glm/glm-5.1` 均返回 `{"ok":true}`；Team LLM 直连返回 `UGK_TEAM_PROVIDER_OK`。
- 对应入口：
  - `runtime/pi-agent/models.json`
  - `src/config.ts`
  - `docs/model-providers.md`

### Team LLM 模型配置收口到项目统一 provider
- 日期：2026-05-14
- 主题：修正 Team Runtime 的 LLM 配置边界，DeepSeek 按项目统一模型 registry/settings 走 `anthropic-messages`，不再在 Team 里单独硬编码 DeepSeek / OpenAI-compatible 路径。
- 影响范围：
  - `runtime/pi-agent/models.json`：`deepseek` provider 的 `baseUrl` 调整为 `https://api.deepseek.com/anthropic`，`api` 调整为 `anthropic-messages`，作为正式模型 registry 配置。
  - `src/team/llm.ts`：`loadLLMConfig()` 改为读取项目统一 settings 和 model registry，返回 provider/model/api/baseUrl/auth；调用协议由 provider `api` 字段决定，不再用 `baseUrl.includes("/anthropic")` 推断。
  - `src/config.ts`、`.env.example`：`getAppConfig()` 默认不再读取本地 `*-api.txt` 临时文件；只有显式设置 `UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP=true` 时才启用本地开发 bootstrap。
  - `test/team-llm-config.test.ts`、`test/config.test.ts`、`package.json`：新增 Team LLM 配置和本地 api txt bootstrap 回归测试，并把 Team LLM 配置测试纳入 `npm run test:team`。
  - `docs/model-providers.md`、`docs/team-runtime.md`、`.codex/plans/2026-05-14-team-realtime-submit-and-incremental-scheduler.md`：同步 DeepSeek Anthropic-compatible 口径和 Team 复用项目模型配置的规则。
- 验证：
  - `node --test --import tsx test/team-llm-config.test.ts`
  - `node --test --import tsx test/config.test.ts test/team-llm-config.test.ts`
  - `node --test --import tsx test/agent-session-factory.test.ts test/model-config.test.ts test/team-llm-config.test.ts`
  - `npx tsc --noEmit`
  - `npm run test:team`
  - `npm test`
- 对应入口：
  - `src/team/llm.ts`
  - `runtime/pi-agent/models.json`
  - `docs/model-providers.md`

### Team Runtime 独立 Playground 页面
- 日期：2026-05-14
- 主题：新增 `/playground/team` 独立 Team Runtime 工作台，并在主 Playground 桌面入口和手机更多菜单暴露 `Team Runtime` 链接。
- 影响范围：
  - `src/ui/team-page.ts`：新增 standalone cockpit 页面，读取模板、创建 run，并查看 run detail、events、streams 和 artifacts。
  - `src/routes/playground.ts`：注册 `GET /playground/team`，保持 no-store 页面响应。
  - `src/team/team-workspace.ts`、`src/routes/team.ts`：新增 `GET /v1/team/runs?scope=all` 的 all-run 列表语义，默认 `GET /v1/team/runs` 继续只返回 runnable run，避免影响 worker 轮询。
  - `src/ui/playground-page-shell.ts`、`src/ui/playground-styles.ts`：主 `/playground` 增加桌面 / 手机入口，并让链接复用现有 telemetry / overflow 样式。
  - `test/team-page-ui.test.ts`、`test/server.test.ts`、`test/team-routes.test.ts`、`test/team-workspace.test.ts`：覆盖页面契约、Team API 调用点、独立路由、主 Playground 入口和 all-run 列表兼容。
  - `docs/team-runtime.md`、`docs/playground-current.md`、`docs/traceability-map.md`：同步 Team UI 入口和接手索引。
- 验证：
  - `node --test --import tsx test/server.test.ts test/team-page-ui.test.ts`
- 对应入口：
  - `src/ui/team-page.ts`
  - `src/routes/playground.ts`
  - `src/ui/playground-page-shell.ts`

### Team Runtime 模板发现 API
- 日期：2026-05-14
- 主题：补齐 Team Runtime 多模板能力的客户端发现层，新增模板 metadata / inputSchema，并开放只读模板发现接口。
- 影响范围：
  - `src/team/team-template.ts`：`TeamTemplate` 增加 metadata 契约，包含标题、描述、默认预算和轻量输入 schema。
  - `src/team/templates/brand-domain-discovery.ts`、`src/team/templates/competitor-domain-discovery.ts`：两个已注册模板补齐 metadata / inputSchema。
  - `src/team/team-template-registry.ts`：新增 `list()`，用于按注册顺序返回模板摘要。
  - `src/routes/team.ts`：新增 `GET /v1/team/templates` 和 `GET /v1/team/templates/:templateId`；未知模板 metadata 返回 `404`。
  - `test/team-template-registry.test.ts`、`test/team-routes.test.ts`：覆盖模板列表、单模板查询、未知模板查询。
  - `docs/team-runtime.md`：补充模板发现接口、轻量 schema 边界和客户端接入口径。
- 验证：
  - `npm run test:team`
  - `npx tsc --noEmit`
- 对应入口：
  - `src/team/team-template.ts`
  - `src/team/team-template-registry.ts`
  - `src/routes/team.ts`

### Team Runtime 第二模板与模板选择 API
- 日期：2026-05-14
- 主题：为 Team Runtime 增加第二个最小模板 `competitor_domain_discovery`，并让 `POST /v1/team/runs` 支持可选 `templateId`，旧请求继续默认创建 `brand_domain_discovery`。
- 影响范围：
  - `src/team/types.ts`：新增 `TeamTemplateId`，允许 run/plan/state 记录 `competitor_domain_discovery`。
  - `src/team/templates/competitor-domain-discovery.ts`：新增竞争对手域名调查模板，复用现有域名调查执行链路，输出 `competitor_domain_report.md`。
  - `src/team/team-template-registry.ts`：默认注册 `brand_domain_discovery` 与 `competitor_domain_discovery`。
  - `src/routes/team.ts`：`POST /v1/team/runs` 读取可选 `templateId`；未知模板返回 `400`，不再静默按默认模板创建。
  - `test/team-template-competitor-domain.test.ts`、`test/team-template-registry.test.ts`、`test/team-routes.test.ts`：覆盖第二模板 contract、注册表解析、兼容默认创建和未知模板拒绝。
  - `docs/team-runtime.md`、`docs/traceability-map.md`：同步多模板入口和接手索引。
- 验证：
  - `npm run test:team`
  - `npx tsc --noEmit`
- 对应入口：
  - `src/team/templates/competitor-domain-discovery.ts`
  - `src/team/team-template-registry.ts`
  - `src/routes/team.ts`

### TeamTemplate Runtime 基建抽象
- 日期：2026-05-14
- 主题：在不改变现有 `/v1/team/*` 外部 API 和 `.data/team` 序列化结构的前提下，为 Team Runtime 引入 `TeamTemplate` seam，把 `brand_domain_discovery` 收口为第一条注册模板。
- 影响范围：
  - `src/team/team-template.ts`、`src/team/team-template-registry.ts`：新增模板接口和默认注册表；当前只注册 `brand_domain_discovery`。
  - `src/team/templates/brand-domain-discovery.ts`：承载样板链路的 roles、streams、stream validators、role readiness、block policy 和 final report 生成。
  - `src/team/team-orchestrator.ts`：改为通用运行编排，只负责生命周期、role task 执行、timeout/retry、cursor 成功提交和事件写入；不再直接生成品牌域名报告。
  - `src/routes/team.ts`、`src/workers/team-worker.ts`：使用默认 template registry；`POST /v1/team/runs` 仍默认创建 `brand_domain_discovery`，请求体不变。
  - `src/team/team-search.ts`、`src/team/json-output.ts`、`src/team/team-gate.ts`、`src/team/team-role-task-runner.ts`：正式 runtime 不再从 `src/team-lab/` 导入搜索、JSON 清洗或域名归一化 helper；`team-lab` 继续作为 spike 实验区保留。
  - `package.json`：`npm run test:team` 纳入 template、registry、route、search 和 JSON helper 测试。
  - `docs/team-runtime.md`：更新当前架构、运行契约和剩余 MVP 局限。
- 验证：
  - `npm run test:team`
  - `npm run test:team-lab`
  - `npx tsc --noEmit`
- 对应入口：
  - `src/team/team-template.ts`
  - `src/team/templates/brand-domain-discovery.ts`
  - `src/team/team-orchestrator.ts`
  - `src/routes/team.ts`
  - `src/workers/team-worker.ts`

### Team Runtime 样板链路执行契约收口
- 日期：2026-05-14
- 主题：把 Team Runtime 的第一条 `brand_domain_discovery` 样板链路从“能跑通”推进到更适合作为后续 team 基建的执行契约：计划查询进入 Discovery 执行、角色失败不推进 cursor、role task timeout 成功后释放 timer。
- 影响范围：
  - `src/team/team-orchestrator.ts`：Discovery role task 读取 `plan.discoveryPlan.searchQueries`；下游角色只有 `success` 后才推进对应 cursor；role task timeout 改为 `finally` 清理，避免测试和 worker 被悬挂 timer 拖住。
  - `test/team-orchestrator.test.ts`：新增 plan queries 传递、失败不推进 evidence cursor、timeout 成功路径不拖住进程的回归测试。
  - `docs/team-runtime.md`：补充当前运行契约和 MVP 局限，明确当前仍是 `brand_domain_discovery` 专用状态机，不是完整通用 template 引擎。
- 验证：
  - `npm run test:team`
- 对应入口：
  - `src/team/team-orchestrator.ts`
  - `test/team-orchestrator.test.ts`
  - `docs/team-runtime.md`

## 2026-05-13
### 新接手 agent 交接快照更新
- 日期：2026-05-13
- 主题：更新当前交接快照，明确本轮 `2090fa4 Improve conn UX and mobile home scrolling` 已同步到 GitHub / Gitee，并已完成腾讯云、阿里云双云增量发布与验证。
- 影响范围：
  - `docs/handoff-current.md`：把“待发布”状态改为真实已发布状态，补充双云 shared 运行态备份位置、生产部署点和公网页面资源核验结果。
- 对应入口：
  - `docs/handoff-current.md`

### 手机首页 Agent 列表滚动
- 日期：2026-05-13
- 主题：修复手机首页 Agent 创建较多后卡片列表超出视口且无法滚动的问题。
- 影响范围：
  - `src/ui/playground-styles.ts`：将首页 `.landing-screen` 明确为滚动容器，移动端使用 `100dvh`、安全区 padding 和 `-webkit-overflow-scrolling: touch`，让 Agent 卡片多时在首页区域内滚动；同时让 `.landing-grid` 从顶部自然排列，避免超高内容被 flex 居中顶到负坐标导致 logo 看不见。
  - `test/server.test.ts`：补充手机首页滚动约束断言，避免后续又被居中全屏布局覆盖。
  - `docs/playground-current.md`：记录手机首页 Agent 列表滚动口径。
- 对应入口：`/playground` 手机首页。

### 前端异步按钮即时反馈
- 日期：2026-05-13
- 主题：补齐当前可见前端入口的异步按钮 pending 状态，避免腾讯云新加坡这类高延迟环境下按钮点击后像“没反应”。
- 影响范围：
  - `src/ui/conn-page-js.ts`：独立 Conn 页的保存、刷新、暂停 / 恢复、立即执行、删除、全部已读、加载更多事件增加禁用保护和“处理中 / 保存中 / 刷新中”等文案。
  - `src/ui/conn-page-js.ts`：同时修复 Conn 左侧列表项把保存 / 取消按钮嵌进 `<button>` 的非法 DOM 结构，避免新建任务取消无效、切换任务后保存 / 取消按钮跟着跑到其他卡片。
  - `src/ui/conn-page-js.ts`：移除左侧列表保存 / 取消按钮的重复 `editor-submit` / `editor-cancel` ID，改为局部 `data-editor-action` 事件绑定，避免保存新建任务时事件绑到错误按钮。
  - `src/ui/conn-page-js.ts`：新建任务默认填入 10 分钟后的执行时间，表单底部增加明确保存 / 取消按钮，并让保存失败提示跨重渲染保留，避免用户只看到“点了没反应”。
  - `src/routes/conns.ts`、`src/agent/conn-run-store.ts`、`src/ui/conn-page-js.ts`：Conn 列表排序调整为未读结果优先，其余按运行中、暂停、已完成分组；未读任务按最新未读 run 时间倒序。
  - `src/ui/conn-page-css.ts`：Conn 状态色调整为运行中绿色、暂停橙黄、已完成灰色，避免 completed 继续显示为成功绿。
  - `src/ui/agents-page.ts`：独立 Agent 管理页的归档、删除技能、刷新补齐 pending 文案和防重复点击。
  - `src/ui/playground-stream-controller.ts`、`src/ui/playground-status-controller.ts`：聊天运行中追加消息和打断任务增加“追加中 / 中断中”按钮状态。
  - `src/ui/playground-task-inbox.ts`、`src/ui/playground-assets-controller.ts`、`src/ui/playground-agent-manager.ts`、`src/ui/playground-conversations-controller.ts`、`src/ui/playground-conn-activity-controller.ts`：任务消息、文件库、Agent 管理、会话菜单和 Conn 管理器补齐刷新、删除、标记已读、技能开关、暂停 / 恢复、批量删除等 pending 状态。
  - `test/server.test.ts`：新增 Playground pending 文案和脚本拼装回归断言。
  - `docs/playground-current.md`：补充异步操作反馈约束。
- 对应入口：
  - `src/ui/conn-page-js.ts`
  - `src/ui/agents-page.ts`
  - `src/ui/playground-stream-controller.ts`
  - `src/ui/playground-status-controller.ts`
  - `src/ui/playground-task-inbox.ts`
  - `src/ui/playground-conn-activity-controller.ts`

### Conn artifact 交付链接保障
- 日期：2026-05-13
- 主题：修复启用 `artifactDelivery` 的 conn run 仍可能把旧 `/v1/local-file?path=/app/public/...` 链接写进最终结果，导致公网 IP 错误或手动改 IP 后仍 404 的问题。
- 影响范围：
  - `src/agent/background-agent-runner.ts`：后台任务新增 `ARTIFACT_PUBLIC_BASE_URL` 注入，让技能 / agent 能按平台官方 artifact 路由生成用户可见链接。
  - `src/agent/artifact-validation.ts`：容器路径泄漏检测会解码 URL 编码文本，防止 `%2Fapp%2Fpublic...` 形式的 `/v1/local-file` 链接绕过验证。
  - `src/agent/artifact-repair-loop.ts`：artifact 修复 prompt 明确要求使用 `ARTIFACT_PUBLIC_BASE_URL`，并禁止把 `/v1/local-file` 当 artifact 交付链接。
  - `test/artifact-validation.test.ts`、`test/background-agent-runner.test.ts`、`test/artifact-repair-loop.test.ts`：新增编码 local-file 容器路径、artifact URL 环境变量和修复 prompt 回归测试。
  - `docs/runtime-assets-conn-feishu.md`：同步 artifact 交付 URL 与错误链接修复口径。
- 对应入口：
  - `src/agent/background-agent-runner.ts`
  - `src/agent/artifact-validation.ts`
  - `src/agent/artifact-repair-loop.ts`
  - `docs/runtime-assets-conn-feishu.md`

### 用户气泡链接与文件引用对比度修复
- 日期：2026-05-13
- 主题：修复深色主题下用户绿色消息气泡内链接和引用文件 chip 继承浅色文字导致看不清的问题。
- 影响范围：
  - `src/ui/playground-styles.ts`：为 `.message.user .message-content a` 增加深色链接色和下划线色，避免继承 assistant / 全局链接色。
  - `src/ui/playground-assets.ts`：为 `.message.user` 内的 `.file-chip`、badge 和 label 增加绿色气泡专用深色文字与背景。
  - `test/server.test.ts`：新增用户气泡链接和文件 chip 对比度断言。
  - `docs/playground-current.md`：补充用户气泡内链接 / 文件 chip 颜色约束。
- 对应入口：
  - `src/ui/playground-styles.ts`
  - `src/ui/playground-assets.ts`
  - `test/server.test.ts`
  - `docs/playground-current.md`

### Conn 页面复制按钮兼容公网 HTTP
- 日期：2026-05-13
- 主题：修复正式服务器 HTTP 访问 `/playground/conn` 时复制按钮因 `navigator.clipboard` 不存在而报错的问题。
- 影响范围：
  - `src/ui/conn-page-js.ts`：Conn 独立页复制逻辑改为先使用安全上下文 Clipboard API，非安全上下文回退到隐藏 textarea + `document.execCommand("copy")`；Run ID 点击复制改为走统一复制 helper。
  - `test/server.test.ts`：新增 Conn 页面复制 fallback 回归断言，防止再次裸调 `navigator.clipboard.writeText(run.runId)`。
- 对应入口：
  - `src/ui/conn-page-js.ts`
  - `test/server.test.ts`

### Matt Pocock 工程技能配置
- 日期：2026-05-13
- 主题：为 `to-issues`、`to-prd`、`triage`、`diagnose`、`tdd`、`improve-codebase-architecture`、`zoom-out` 等工程技能补齐仓库级配置入口。
- 影响范围：
  - `CLAUDE.md` 新增 `Agent skills` 索引，指向 issue tracker、triage labels 和 domain docs 配置。
  - `docs/agents/issue-tracker.md` 记录 GitHub Issues 作为任务追踪入口。
  - `docs/agents/triage-labels.md` 记录默认五标签 triage 词汇。
  - `docs/agents/domain.md` 记录 single-context 领域文档读取规则。
- 对应入口：
  - `CLAUDE.md`
  - `docs/agents/issue-tracker.md`
  - `docs/agents/triage-labels.md`
  - `docs/agents/domain.md`

### 新同事接手交接快照刷新
- 日期：2026-05-13
- 主题：刷新 `docs/handoff-current.md`，把旧的未推送、旧 HEAD、旧生产版本等历史残留口径替换为当前真实交接状态，方便新同事按最短路径接手项目。
- 影响范围：
  - `docs/handoff-current.md`：重写为当前快照、双云部署状态、最小阅读顺序、关键禁区、验证记录和给同事的接手提示。
  - 明确当前交接提交为 `d7bcb4d Show runtime summary and sort conn tasks`，`origin/main` / `gitee/main` 已同步，腾讯云 / 阿里云均已增量更新并通过 verify。
- 对应入口：`docs/handoff-current.md`

### Playground 左栏运行汇总
- 日期：2026-05-13
- 主题：在 Playground 左侧会话列表底部增加当前运行汇总，展示当前有效 API 源 / 模型和当前 Chrome 实例，避免用户在运行前后无法确认实际使用的 provider 与浏览器。
- 影响范围：
  - `src/ui/playground-page-shell.ts`：在左侧设置区下方新增纯文本 `runtime-summary`，按“小字标题 + 正文”的形式展示 API 源和 Chrome。
  - `src/ui/playground.ts`：新增运行汇总读取与渲染逻辑，复用当前 Agent 模型优先、全局默认兜底的规则；Chrome 优先当前 Agent 默认浏览器，兜底全局默认浏览器。
  - `src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`：新增深色 / 浅色视觉样式，保持信息高亮但不做成按钮。
  - `test/server.test.ts`：新增 Playground 页面包含运行汇总信息与渲染函数的断言。
- 对应入口：`src/ui/playground-page-shell.ts`、`src/ui/playground.ts`

### Conn 任务列表按最近完成时间倒序
- 日期：2026-05-13
- 主题：优化 `/playground/conn` 左侧任务列表排序。列表现在优先按最近完成的 run 时间倒序展示，有未读结果的任务通常会因为刚完成而排到前面，用户看到未读数后进入页面无需再从旧任务里翻。
- 影响范围：
  - `src/routes/conn-route-presenters.ts`：新增 conn 列表排序 helper，优先使用 `latestRun.finishedAt` / `lastRunAt`，无完成记录的任务排在已完成任务之后。
  - `src/routes/conns.ts`：`GET /v1/conns` 返回前统一应用排序，避免只在某个前端入口里临时排序。
  - `src/ui/conn-page-js.ts`：独立 Conn 页面过滤后再次按最近完成时间排序，保证左侧列表局部刷新后仍稳定。
  - `test/conn-route-presenters.test.ts`、`test/server.test.ts`：新增排序规则和页面排序钩子断言。
- 对应入口：`src/routes/conns.ts`、`src/ui/conn-page-js.ts`

### Standalone Conn / Agents 首页同款 cockpit UI 与测试稳定化
- 日期：2026-05-13
- 主题：继续治理收尾并优化独立 Conn / Agents 页面。`npm test` 固定为串行执行，避免 Windows 本地多个 `buildServer()` 并发初始化默认 SQLite 时出现 `database is locked`；`/playground/conn` 和 `/playground/agents` 采用首页 Agent 选择页同源的 pixel cockpit 背景、扫描光、半透明边框和卡片 hover 语言。
- 影响范围：
  - `package.json`：`npm test` 增加 `--test-concurrency=1`，将全量验证命令固定为稳定口径。
  - `src/ui/standalone-page-shared.ts`：新增 `data-standalone-theme="cockpit"` 共享背景与 topbar 视觉系统。
  - `src/ui/conn-page.ts`、`src/ui/conn-page-css.ts`：Conn 独立页启用 cockpit 主题，并调整卡片、列表、详情面板、主按钮的视觉口径。
  - `src/ui/agents-page.ts`：Agents 独立页启用 cockpit 主题，并调整列表、详情、技能、文件卡片和主按钮的视觉口径。
  - `test/server.test.ts`、`test/agent-model-ui.test.ts`：新增 Conn / Agents standalone 页面 cockpit 主题断言。
- 对应入口：`src/ui/standalone-page-shared.ts`、`src/ui/conn-page.ts`、`src/ui/agents-page.ts`

### 架构治理 Batch B/C：Agent Profile 路由边界与 Server Store 装配显式化
- 日期：2026-05-13
- 主题：继续执行全项目架构治理计划，保持外部 API 不变的前提下，把 `/v1/agents*` 元操作从 `chat.ts` 抽到独立 route 模块，并将 `buildServer()` 的 conn store / run store / activity store 装配规则命名化，降低后续修改 scoped chat、agent profile 和 conn 测试注入时的误伤风险。
- 影响范围：
  - `src/routes/agent-profiles.ts`：新增 agent profile 管理路由注册器，承载 agent 列表、创建、更新、归档、技能安装/移除/启停、规则文件读写、默认 browser/model 绑定等 `/v1/agents*` 元操作。
  - `src/routes/chat.ts`：保留 main/scoped chat 路由，调用 `registerAgentProfileRoutes()` 注册原有 `/v1/agents*` URL，避免改动 server 注入面和外部 API。
  - `src/server.ts`：新增 `resolveConnStores()`，显式表达“三个 conn 相关 store 全部注入时不创建默认 ConnDatabase；部分注入时由默认数据库补齐缺失 store”的现有规则。
  - `AGENTS.md`、`docs/traceability-map.md`、`docs/architecture-governance-guide.md`、`docs/architecture-test-matrix.md`：同步更新接手索引、治理边界和测试注入规则。
- 验证：
  - `git diff --check`
  - `npx tsc --noEmit`
  - `node --test --import tsx test/agent-profile.test.ts test/agent-profile-catalog.test.ts test/agent-service-registry.test.ts`
  - `node --test --import tsx test/chat-agent-routes.test.ts test/agent-model-chat-routes.test.ts`
  - `node --test --import tsx test/server.test.ts --test-name-pattern "agent"`
- 对应入口：`src/routes/agent-profiles.ts`、`src/routes/chat.ts`、`src/server.ts`

### 架构治理 Batch A：外部资源与误提交防护
- 日期：2026-05-13
- 主题：执行全项目架构治理计划的第一批安全收口。独立 Conn 页面不再依赖 jsDelivr CDN 加载 flatpickr / marked，改为使用本地 vendor 路由和内联 bundled marked 脚本；同时补充 `.gitignore`，降低运行产物、截图、临时 HTML / JS 和 UI 草稿误入治理提交的风险。
- 影响范围：
  - `src/ui/conn-page.ts`：`/playground/conn` 改用 `/vendor/flatpickr/...` 本地资源，marked 使用 `node_modules/marked/lib/marked.umd.js` 内联脚本，与 Playground 的本地依赖口径对齐。
  - `test/server.test.ts`：新增独立 Conn 页面不含 `cdn.jsdelivr.net`、且包含本地 flatpickr / marked 脚本的回归断言。
  - `.gitignore`：补充当前高频运行产物和草稿目录忽略规则。
  - `docs/architecture-governance-guide.md`：新增提交前防误提交清单。
- 对应入口：`src/ui/conn-page.ts`、`.gitignore`、`docs/architecture-governance-guide.md`

### Conn Artifact 路由归属校验收口
- 日期：2026-05-13
- 主题：修复 artifact 独立服务路由只按 `runId` 拼目录、未校验 `connId` 与 run 归属的问题。现在 run 级 artifact 路由必须先读取 `ConnRunStore.getRun(runId)` 并确认 `run.connId === connId`，再使用 run 记录里的 `workspacePath/artifact-public` 作为产物目录。
- 影响范围：
  - `src/routes/artifacts.ts`：run 级 artifact、index 和 health 路由新增 run 归属校验；artifact 目录来源从 `backgroundDataDir + runId` 改为 `run.workspacePath`，并校验 workspace 必须位于 `backgroundDataDir` 内。
  - `test/artifact-routes.test.ts`：路由测试改为创建真实 conn/run 记录；新增错 connId 访问 run artifact 返回 404、workspace 越界返回 404 的回归测试。
- 对应入口：`src/routes/artifacts.ts`、`test/artifact-routes.test.ts`

### Conn Artifact Delivery Validation
- 日期：2026-05-13
- 主题：Conn 后台任务支持 artifact 交付验证与自动修复。用户在 conn 编辑器中启用 `artifactDelivery` 后，后台 run 会验证产物是否真实写入 `artifact-public/` 目录；未通过验证时自动追加修复 prompt 重试，最多 configurable 轮。验证通过后，产物通过独立 artifact 路由对外提供访问。
- 新增文件：
  - `src/agent/artifact-contract.ts`：定义 `ArtifactDeliveryConfig`、`ArtifactContract`、`ArtifactRequiredOutput`、`ArtifactCheck` 等 contract 类型，以及 `buildDefaultArtifactContract()` 默认 contract 生成。
  - `src/agent/artifact-validation.ts`：扫描 `artifact-public/` 目录，校验产物文件存在性、格式、敏感文件和容器路径泄漏，返回结构化 `ArtifactValidationResult`。
  - `src/agent/artifact-repair-loop.ts`：当验证不通过时，向 agent session 追加修复 prompt 并重新验证，最多 `repairMaxAttempts` 轮。
  - `src/routes/artifacts.ts`：artifact 独立服务路由，含 `GET /v1/conns/:connId/runs/:runId/artifacts/*`、`GET .../artifacts`、`GET .../artifacts/health` 和 `latest` 对应入口。
  - `test/artifact-contract.test.ts`、`test/artifact-validation.test.ts`、`test/artifact-repair-loop.test.ts`、`test/artifact-routes.test.ts`：contract 生成、目录扫描、修复循环和路由单元测试。
- 关键变更：
  - `src/types/api.ts`：`ConnDefinition` 新增 `artifactDelivery?: ArtifactDeliveryConfig`。
  - `src/routes/conn-route-parsers.ts`：解析和 normalize `artifactDelivery` 输入。
  - `src/routes/conns.ts`：create / update conn 时持久化 `artifactDelivery`。
  - `src/agent/background-workspace.ts`：`RunWorkspace` 新增 `artifactPublicDir`（`<runRoot>/artifact-public/`），初始化时递归创建。
  - `src/agent/background-agent-runner.ts`：run 完成后若 `artifactDelivery.enabled`，调用验证 + 修复循环；workspace contract 注入 `ARTIFACT_PUBLIC_DIR` 和 `ARTIFACT_PUBLIC_BASE_URL` 环境变量。
  - `src/ui/conn-page-js.ts`：Conn 编辑器新增 artifact delivery 开关和 `expectedKind` 选择。
- 环境变量：`ARTIFACT_PUBLIC_DIR`（每条 run 注入，指向 `<runRoot>/artifact-public/`）。
- 对应入口：`src/routes/artifacts.ts`、`src/agent/artifact-contract.ts`、`src/agent/artifact-validation.ts`、`src/agent/artifact-repair-loop.ts`

### Agent Skill 开关（Enable/Disable）
- 日期：2026-05-13
- 主题：每个 Agent 可单独开关已安装 skill，关闭后新建 session 不加载该 skill，重新开启无需重装。必需系统 skill 不可关闭。运行中 conversation 不允许切换 skill。
- 影响范围：
  - `src/agent/agent-profile.ts`：`AgentProfile` 新增 `disabledSkillNames?: string[]`。
  - `src/agent/agent-profile-catalog.ts`：`StoredAgentProfiles` 新增 `skillSettingsByAgentId`；新增 `listStoredAgentProfileSkills`、`updateStoredAgentProfileSkillEnabled`、`collectInstalledSkillNames`、`normalizeDisabledSkillNames`、`applySkillSettingsToProfiles`；所有 catalog mutation 保留 `skillSettingsByAgentId`。
  - `src/agent/agent-session-factory.ts`：新增 `createSkillFilteredResourceLoader`，在 `resourceLoader.getSkills()` 层过滤 disabled skills；`loadSkills` 和 `createSession` 改用 filtered loader；`buildSkillFingerprint` 包含 `disabledSkillNames`。
  - `src/server.ts`：`createDefaultAgentService` 传入 `profile.disabledSkillNames`。
  - `src/types/api.ts`：新增 `AgentSkillBody`、`AgentSkillListResponseBody`、`UpdateAgentSkillRequestBody`、`UpdateAgentSkillResponseBody`。
  - `src/routes/chat.ts`：新增 `GET /v1/agents/:agentId/skills`（管理接口，返回 enabled 状态）和 `PATCH /v1/agents/:agentId/skills/:skillName`（切换开关，含 running guard 返回 409）。
  - `src/ui/playground-agent-manager.ts`：Playground 内嵌 Agent 操作台的技能列表改用管理接口，新增 toggle switch UI 和 `updateAgentSkillEnabled` 函数。
  - `src/ui/agents-page.ts`：独立 Agent 管理台 `/playground/agents` 同步支持 skill toggle。
  - `test/server.test.ts`：新增 skill toggle UI 静态断言。
- 不变项：不删除 disabled skill 文件；不改变安装/移除语义；不修改 pi-coding-agent 源码；`debug/skills` 仍表示 runtime 真实技能。
- 对应入口：`src/routes/chat.ts`、`src/ui/agents-page.ts`、`src/ui/playground-agent-manager.ts`

### Conn 管理器排序（运行中优先 + 最新任务倒序）
- 日期：2026-05-12
- 主题：Conn 管理器列表按运行状态优先排序：running > pending > 其他，同组内按最新任务时间倒序。
- 影响范围：
  - `src/ui/playground-conn-activity-controller.ts`：新增 `getConnRunSortRank`、`getConnLatestRunTimeMs`、`compareConnManagerItems` 排序 helper；`renderConnManager` 中 `visibleConns` 使用 `.slice().sort(compareConnManagerItems)`。
  - `test/server.test.ts`：新增排序函数和 sort 调用的静态断言。
- 对应入口：`src/ui/playground-conn-activity-controller.ts`

## 2026-05-12
### Agent 悬浮状态展示与运行中跨 Agent 切换
- 日期：2026-05-12
- 主题：Agent 悬浮菜单显示每个 Agent 的运行状态（运行中/空闲/状态未知），并允许在另一个 Agent 运行时切换到其他 Agent，不会中断原 Agent 的后台任务。
- 影响范围：
  - `src/ui/playground.ts`：新增 `normalizeAgentRunStatus`、`loadAgentRunStatus` 函数和 `agentRunStatusByAgentId` 等 state 字段；`openAgentSwitcher` 打开时刷新状态；`renderAgentSwitcherMeta` 展示运行状态和彩色圆点；`switchAgent` 移除 `state.loading` 硬阻断，允许跨 Agent 切换并重置前端状态。
  - `src/ui/playground-stream-controller.ts`：新增 `createStreamOwner`、`isStreamOwnerCurrent` owner guard 函数；`sendMessage` 和 `attachActiveRunEventStream` 绑定 stream owner，丢弃旧 Agent 事件；finally/catch 中 UI 操作增加 owner 校验，防止旧 stream 污染新界面。
  - `src/ui/playground-styles.ts`：新增 `.agent-switcher-item.is-busy / .is-idle / .is-unknown` 样式，状态指示点使用 `var(--ok)` / `var(--warn)`。
  - `test/server.test.ts`：更新受影响的 HTML 断言，新增 owner guard 和状态展示断言。
- 保留限制：同一 Agent 内运行中切换会话的限制不变。
- 对应入口：`src/ui/playground.ts`、`src/ui/playground-stream-controller.ts`、`src/ui/playground-styles.ts`

### Chat view background atmosphere unification
- 日期：2026-05-12
- 主题：统一聊天视图与落地页的背景网格纹理，使用共享 `--ugk-*` CSS 变量。Shell `background-image` 替代 `body::before` 绘制背景，确保纹理在所有子元素之后。暗色主题 body 渐变微调，增强 grid / dot / pixel 纹理层次；亮色主题消息气泡改为半透明以显示底层纹理。
- 影响范围：
  - `src/ui/playground-styles.ts`：聊天视图（`.shell:not([data-home="true"])`）使用 `background-image` 引用 `--ugk-*` 变量，与落地页共用纹理定义。`body::before` 渐变角度和色值微调。暗色 `--ugk-dot-color` / `--ugk-pixel-color` 对比度增强。亮色主题消息气泡 `background` 改为 `rgba()` 半透明。
  - `src/ui/playground.ts`：移除落地页专属的纹理注入逻辑，统一由 CSS 变量驱动。
- 对应入口：`src/ui/playground-styles.ts`

### Light-theme FOUC fix + visual polish
- 日期：2026-05-11
- 主题：修复独立页面（conn、agents）亮色主题加载时 FOUC（Flash of Unstyled Content）。通过内联主题脚本在 CSS 加载前设置 `data-theme` 和 `colorScheme`。统一所有独立页面的 theme storage key。落地页 logo 替换为 SVG + ASCII 组合。新增 pixel-hacker 背景纹理。
- 影响范围：
  - `src/ui/standalone-page-shared.ts`：导出 `STANDALONE_THEME_INLINE_SCRIPT`，所有独立页面在 `<head>` 内联执行，从 `localStorage("ugk-pi:playground-theme")` 读取用户偏好并立即设置 `data-theme` / `colorScheme`，消除 CSS 加载前的白闪。
  - `src/ui/conn-page.ts`、`src/ui/agents-page.ts`：引入 `STANDALONE_THEME_INLINE_SCRIPT`，统一 theme storage key 为 `ugk-pi:playground-theme`。
  - `src/ui/playground.ts`：落地页 logo 从纯文本改为 SVG 图标 + ASCII art 组合。
  - `src/ui/playground-styles.ts`：落地页新增 pixel-hacker 风格背景纹理（grid + dot + pixel layer），与暗色主题氛围统一。
- 对应入口：`src/ui/standalone-page-shared.ts`、`src/ui/playground-styles.ts`

### 独立 Agents 页浏览器绑定确认补齐
- 日期：2026-05-12
- 主题：修复 `/playground/agents` 编辑 Agent 时修改默认浏览器会被后端返回 `Browser binding changes require explicit confirmation.` 的问题。
- 影响范围：
  - `src/ui/agents-page.ts`：独立 Agents 页在默认浏览器发生变化时弹出确认，并在 PATCH `/v1/agents/:agentId` 时携带 `x-ugk-browser-binding-confirmed: true` 和 `x-ugk-browser-binding-source: playground`，与 Playground 内嵌 Agent 管理器保持一致。
  - `test/agent-model-ui.test.ts`：补充回归断言，防止独立页面再次漏掉浏览器绑定确认头。
- 对应入口：`src/ui/agents-page.ts`、`test/agent-model-ui.test.ts`

### 腾讯云公网 IP 口径更新
- 日期：2026-05-12
- 主题：腾讯云新加坡生产公网 IP 从 `43.156.19.100` 更新为 `43.156.19.100`，同步调整运维脚本公网验收地址和接手文档。
- 影响范围：
  - `scripts/server-ops.mjs`：`tencent.publicHealthz` 改为 `http://43.156.19.100:3000/healthz`。
  - `AGENTS.md`、`docs/server-ops-quick-reference.md`、`docs/tencent-cloud-singapore-deploy.md`、`docs/handoff-current.md`：当前腾讯云入口和健康检查改为新 IP。
  - 当前本机 `ugk-claw-prod` SSH alias 若仍指向旧 IP，需要同步更新；若 `ssh ubuntu@43.156.19.100` 在 banner 阶段超时，应先检查腾讯云安全组 / 防火墙 `22/tcp` 入站规则。
- 对应入口：`scripts/server-ops.mjs`、`docs/tencent-cloud-singapore-deploy.md`

### Playground 模型源设置跟随当前 Agent
- 日期：2026-05-12
- 主题：修复对话页左下角“模型源”设置仍只读写全局默认的问题，使其在切换到非主 Agent 后显示并保存当前 Agent 的默认 API 源和模型。
- 影响范围：
  - `src/ui/playground.ts`：打开模型源弹窗时优先读取 active Agent 的 `defaultModelProvider/defaultModelId`，Agent 未单独设置或保存模型已失效时再显示全局默认；保存时 `main` 继续写 `/v1/model-config/default`，其他 Agent 改为 `PATCH /v1/agents/:agentId`。
  - `test/agent-model-ui.test.ts`：补充前端回归断言，锁定非主 Agent 的模型设置入口不会继续误写全局默认。
- 对应入口：`src/ui/playground.ts`、`test/agent-model-ui.test.ts`

### 本地 Conn Worker 公开链接口径修复
- 日期：2026-05-12
- 主题：修复本地 Docker 下 `ugk-pi-conn-worker` 继续继承 `.env` 生产 `PUBLIC_BASE_URL`，导致后台任务正文里生成公网链接的问题。
- 影响范围：
  - `docker-compose.yml`：为 `ugk-pi-conn-worker` 显式设置 `PUBLIC_BASE_URL=http://127.0.0.1:3000`，与主 app 和飞书 worker 的本地口径保持一致。
  - Conn 本地测试输出文件仍通过 `/v1/conns/:connId/runs/:runId/output/...` 服务，API 返回链接和 worker 注入给 agent 的 `CONN_OUTPUT_BASE_URL` 不应再互相打架。
- 对应入口：`docker-compose.yml`

### Per-Agent 默认模型选择器审查修复
- 日期：2026-05-12
- 主题：修复 Per-Agent 默认模型选择器的编辑态误清空和联动缺失问题，并统一失效模型回退行为。
- 影响范围：
  - `src/ui/playground-agent-manager.ts`：嵌入式 Agent 编辑器在模型配置读取失败或模型控件不可用时不再提交 `defaultModelProvider/defaultModelId: null`，避免用户只改名称/描述时误清空已有默认模型；provider/model 半选时给出前端错误。
  - `src/ui/agents-page.ts`：独立 Agent 管理页的模型 provider 变更联动同时适用于新建和编辑表单；保存时只有模型配置可用才提交模型字段。
  - `src/agent/agent-session-factory.ts`：Agent 保存的默认模型如果已不在当前 `models.json`，session 创建和默认模型上下文统一回落项目全局默认，避免展示与实际运行不一致。
  - `.gitignore` / `.claude/settings.local.json`：移除本地 Claude 权限配置并忽略 `.claude/`，避免本机工具状态进入仓库。
  - `test/agent-model-ui.test.ts`、`test/agent-model-session-factory.test.ts`、`test/agent-model-template-registry.test.ts`、`test/server.test.ts`：补充回归测试并校准当前 Playground 背景断言。
- 对应入口：`src/ui/playground-agent-manager.ts`、`src/ui/agents-page.ts`、`src/agent/agent-session-factory.ts`

### Per-Agent 默认模型源
- 日期：2026-05-12
- 主题：每个 Agent 可独立配置默认模型提供商和模型，不再仅依赖全局设置。模型优先级：Conn 显式指定 > Agent 默认 > 项目全局默认。
- 影响范围：
  - `src/agent/agent-profile.ts`：`AgentProfile` 接口新增 `defaultModelProvider` / `defaultModelId` 字段。
  - `src/agent/agent-profile-catalog.ts`：新增 `normalizeOptionalModelSelection()` 校验（成对必填），`updateStoredAgentProfile` 支持模型字段更新。
  - `src/agent/agent-session-factory.ts`：`resolveAgentDefaultSessionModel` / `resolveAgentDefaultModelContext` 实现优先级链。
  - `src/agent/agent-template-registry.ts`：playground 模板使用 agent 级模型，签名包含模型字段。
  - `src/agent/agent-service-registry.ts`：`updateProfile` 驱逐缓存 service（修复模型变更不生效的 critical bug）。
  - `src/routes/chat.ts`：POST/PATCH `/v1/agents` 支持模型字段、live validate、409 运行中保护。
  - `src/server.ts`：共享 `modelConfigStore` / `modelSelectionValidator` 实例。
  - `src/ui/agents-page.ts`：独立管理页新增模型提供商/模型下拉选择器。
  - `src/ui/playground-agent-manager.ts`：Playground 内嵌管理器新增模型选择器，主 Agent 隐藏选择器。
- 对应入口：`src/agent/agent-profile.ts`、`src/routes/chat.ts`、`src/ui/agents-page.ts`

## 2026-05-11

### 新同事 Agent 接手提示补齐
- 日期：2026-05-11
- 主题：为没有接触过项目的新同事 agent 准备第一条接手提示，明确阅读顺序、Docker 启动口径、双云增量更新规则和本地未跟踪产物禁区。
- 影响范围：
  - `docs/handoff-current.md` 顶部新增可直接复制给新 agent 的接手消息，避免新接手者误把 Playground 运行时 agent、仓库维护 agent、本地 Docker 和生产部署混在一起。
  - 保留现有文档分层，不新增散落文档；新 agent 先读 `AGENTS.md`、`docs/handoff-current.md`、`docs/traceability-map.md`，再按任务类型展开专题文档。
- 对应入口：`docs/handoff-current.md`

### 双云增量更新状态文档校准
- 日期：2026-05-11
- 主题：在腾讯云和阿里云都完成本轮增量更新后，校准接手文档里的双云生产状态，避免后续 agent 按旧提交判断服务器版本。
- 影响范围：
  - `AGENTS.md` 的当前阶段快照更新为本轮 Conn 未读徽章修复已完成双云增量发布，功能锚点为 `efb0de7 Align conn unread badge with run counts`。
  - `docs/handoff-current.md` 的当前结论改为 `origin/main` / `gitee/main` 与本文件所在 HEAD 同步，腾讯云和阿里云均已通过 `deploy` + `verify`，未跟踪运行产物仍不属于发布内容。
- 对应入口：`AGENTS.md`、`docs/handoff-current.md`

### Playground 后台任务入口未读徽章对齐 Conn 口径
- 日期：2026-05-11
- 主题：修正对话页顶部“后台任务”按钮数字徽章的数据源，让它和 `/playground/conn` 页面顶部“未读结果”保持一致。
- 影响范围：
  - Playground 新增 `connManagerUnreadCount` 状态，后台任务入口徽章改用 `/v1/conns` 返回的 `totalUnreadRuns`，不再复用任务消息 `/v1/activity/summary` 的未读数。
  - 页面初始化、窗口重新聚焦、标签页重新可见以及后台实时通知到达时都会刷新 conn 未读摘要，避免用户在 conn 页面点掉未读后，对话页刷新仍显示旧数字。
  - 任务消息入口仍继续使用 `agent_activity_items` 未读数；后台任务入口只表达 conn run 未读结果，两套读模型不再互相串台。
- 对应入口：`src/ui/playground.ts`、`src/ui/playground-conn-activity-controller.ts`、`src/ui/playground-task-inbox.ts`、`src/ui/playground-stream-controller.ts`、`test/server.test.ts`

### Conn 立即执行后端幂等与 Docker 启动口径加固
- 日期：2026-05-11
- 主题：补齐后台任务“立即执行”的服务端防重复，并修正近期重构后过期的测试契约；同时明确本项目标准启动方式是 Docker Compose。
- 影响范围：
  - `POST /v1/conns/:connId/run` 创建 run 前先复用当前 conn 已存在的 `pending / running` run，返回体增加 `reused: true` 标记，避免多标签、脚本调用或网络重试绕过前端按钮禁用后继续重复入队。
  - `ConnRunStore` 新增 `getActiveRunForConn(connId)` 和事务级 `createRunUnlessActive()`，按 `scheduled_at / created_at / run_id` 返回最新 active run，并用 `BEGIN IMMEDIATE` 把“查 active + 插入”收成一次 SQLite 写事务。
  - Conn 独立页面和 Playground 内嵌后台任务入口的 run 状态短轮询从最多 30 秒调整为最多 6 分钟，并在终态后清理 timer。
  - `containerization` 和 `playground-status-controller` 测试同步当前事实：compose app 命令是 `npm start`，`setStageMode` 已移除。
  - `README.md` 与 `docs/docker-local-ops.md` 明确不要把宿主机 `npm start` / `npm run dev` 当作正规启动方式，日常运行统一走 `docker compose`。
- 对应入口：`src/agent/conn-run-store.ts`、`src/routes/conns.ts`、`src/types/api.ts`、`src/ui/conn-page-js.ts`、`src/ui/playground-conn-activity-controller.ts`、`test/conn-run-store.test.ts`、`test/server.test.ts`、`test/containerization.test.ts`、`test/playground-status-controller.test.ts`、`README.md`、`docs/docker-local-ops.md`

### Conn 立即执行交互反馈防重复
- 日期：2026-05-11
- 主题：修复后台任务“立即执行”点击后前端反馈不明显，用户容易连续点击并创建多条手动 run 的问题。
- 影响范围：
  - `/playground/conn` 独立页面和 Playground 内嵌后台任务入口都会把当前任务的 `pending / running` run 识别为执行中，按钮文案切到“入队中 / 执行中”并禁用重复点击。
  - 手动入队成功后立即把新 run 插入运行历史，展开该任务的 run 列表，并短轮询刷新状态，避免页面一直停在旧视图里像是没反应。
  - 本次排查确认阿里云 2026-05-11 15:30 左右后端实际创建了两条手动 run，二者均已成功结束；重复 run 的直接原因是前端没有给出明确入队反馈。
- 对应入口：`src/ui/conn-page-js.ts`、`src/ui/playground-conn-activity-controller.ts`、`src/ui/playground.ts`、`test/server.test.ts`

### Conn 未读结果统计口径收口
- 日期：2026-05-11
- 主题：修正 `/playground/conn` 顶部“未读结果”总数，把统计范围收口到当前仍存在的 conn，避免已软删除任务的历史 run 继续混入总数。
- 影响范围：
  - `GET /v1/conns` 现在把当前 conn id 列表传给 `ConnRunStore.getTotalUnreadCount(connIds)`；单个 run 标记已读和“全部已读”后的总数刷新也使用同一口径。
  - `ConnRunStore.getTotalUnreadCount()` 保留不传参时的全局统计兼容；传入 `connIds` 时只统计这些 conn 下 `succeeded / failed` 且 `read_at IS NULL` 的 run。
  - `markAllRunsRead(connIds)` 只批量标记当前 conn 范围内的未读 run，避免用户在页面上点“全部已读”时顺手把已经删除的历史任务状态也清掉。
- 对应入口：`src/agent/conn-run-store.ts`、`src/routes/conns.ts`、`test/conn-run-store.test.ts`、`test/server.test.ts`

### Playground Agent 按钮改为独立页面入口
- 日期：2026-05-11
- 主题：对话页顶部当前 Agent 按钮不再打开旧的内嵌 Agent workspace，改为像后台任务入口一样打开独立 Agents 页面。
- 影响范围：
  - `agent-selector-status` 点击后调用 `window.open("/playground/agents", "_blank")`，不再触发 `openAgentManager(..., { mode: "workspace" })`。
  - 按钮可访问名称从“打开 Agent 管理”调整为“打开 Agent 页面”，与独立页面入口语义一致。
  - 旧 Agent workspace 代码暂时保留兼容，不作为顶部按钮入口展示；独立 `/playground/agents` 继续作为 Agent 管理主界面。
- 对应入口：`src/ui/playground-agent-manager.ts`、`src/ui/playground-page-shell.ts`、`test/playground-agent-switch.test.ts`

### 文件库指定文件删除
- 日期：2026-05-11
- 主题：文件库新增删除指定资产功能，支持从“可复用资产”列表中移除不再需要的上传文件或 agent 产出文件。
- 影响范围：
  - `AssetStore` 新增 `deleteAsset(assetId)`：删除资产索引记录；当底层 blob 没有被其他资产记录复用时同步删除物理 blob，避免共享内容被误删。
  - 新增 `DELETE /v1/assets/:assetId`，删除成功返回 `{ assetId, deleted: true }`，不存在或不支持删除时返回 `404`。
  - Playground 文件库卡片新增“删除”操作，删除前走确认弹窗；成功后同步移除最近资产列表、聊天输入区已选资产和 conn 编辑器已选资料。
  - 新增存储层、HTTP 路由和前端控制器断言，锁住删除接口、共享 blob 保护和 UI 调用链。
- 对应入口：`src/agent/asset-store.ts`、`src/routes/files.ts`、`src/types/api.ts`、`src/ui/playground-assets.ts`、`src/ui/playground-assets-controller.ts`、`test/asset-store.test.ts`、`test/server.test.ts`、`test/playground-assets-controller.test.ts`

### Conn 独立页面空列表新建任务卡片修复
- 日期：2026-05-11
- 主题：修复 `/playground/conn` 当前任务为空时点击“新建任务”后，左侧不显示“新建任务”虚拟卡片和“保存任务 / 取消”按钮的问题。
- 影响范围：
  - `renderList()` 现在先处理“正在新建且筛选后列表为空”的编辑态，再进入普通空态，避免空态分支提前 `return` 截断虚拟任务卡片渲染。
  - 复用同一个 `appendNewConnEditorItem()` 生成新建卡片，保持有任务和无任务两种场景的保存 / 取消按钮一致。
  - 新增页面渲染断言，锁住空列表新建任务卡片优先于普通空态的行为。
- 对应入口：`src/ui/conn-page-js.ts`、`test/server.test.ts`

## 2026-05-10

### Conn 运行结果未读标记
- 日期：2026-05-10
- 主题：conn_runs 表加 `read_at` 字段，conn 页面加"未读结果"stat card、列表卡片未读徽章、运行历史未读指示点，展开 run 时自动标记已读。
- 影响范围：
  - SQLite schema `user_version` 从 8 升到 9；`conn_runs` 表新增 `read_at TEXT` 列和 `idx_conn_runs_unread` 索引。
  - `ConnRunStore` 新增 `markRunRead()`、`getUnreadCountsByConn()`、`getTotalUnreadCount()` 三个方法。
  - `GET /v1/conns` 返回体新增 `unreadRunCountsByConnId` 和 `totalUnreadRuns`；新增 `POST /v1/conns/:connId/runs/:runId/read` 标记已读路由。
  - Conn 独立页面新增第 5 个紫色"未读结果"stat card；列表卡片在右侧展示红色未读条数徽章；运行历史时间线中已完成/失败的未读 run 显示红色圆点。
  - 点击展开 run detail 时自动调用 `POST .../read`，更新全局未读数并刷新 stat card 和列表徽章。
- 对应入口：`src/agent/conn-db.ts`、`src/agent/conn-run-store.ts`、`src/types/api.ts`、`src/routes/conns.ts`、`src/routes/conn-route-presenters.ts`、`src/ui/conn-page.ts`、`src/ui/conn-page-css.ts`、`src/ui/conn-page-js.ts`、`test/conn-db.test.ts`

### Conn 独立页面 UI 优化与共享 Markdown 渲染
- 日期：2026-05-10
- 主题：优化 conn 独立工作台的视觉细节，将任务结果从代码框样式改为 Markdown 渲染，复用 Playground 的 `renderMessageMarkdown` 公共方法。
- 影响范围：
  - 列表卡片背景从透明改为深蓝色 `#161E35`，hover 时 `#1A2440`，增强卡片与底色的区分度。
  - 未读徽章改为红色药丸样式（`var(--danger)` 背景，白色文字），与 stat card 风格一致。
  - 运行历史时间线未读指示改为红色圆点和红色边框卡片。
  - 任务结果展示从 `<pre><code>` 代码框改为 Markdown 渲染：引入 `marked` CDN 库，复用 `getBrowserMarkdownRendererScript()` 共享渲染方法，支持标题、表格、代码块、引用等完整 Markdown 语法。
  - "新建任务"按钮现在会清除已选卡片，避免同时显示编辑器和保存/取消按钮。
- 对应入口：`src/ui/conn-page-css.ts`、`src/ui/conn-page-js.ts`、`src/ui/conn-page.ts`

### Playground 桌面端消息按钮收口
- 日期：2026-05-10
- 主题：Playground 桌面端隐藏消息中心（inbox）按钮，将未读计数徽章迁移到后台任务管理按钮；点击后台任务按钮改为在新标签页打开 conn 独立页面。
- 影响范围：
  - 桌面端 inbox 按钮通过 `style="display:none"` 隐藏（仅桌面，不影响移动端）。
  - 后台任务管理按钮增加 `telemetry-action-with-badge` class 和 `<span id="conn-manager-unread-badge">` 子元素，同步显示未读任务结果数。
  - 点击后台任务按钮从嵌入式 workspace panel 改为 `window.open("/playground/conn", "_blank")`。
  - `playground-task-inbox.ts` 的 `renderTaskInboxToggleState()` 同步更新 conn manager badge 的显隐和数值。
- 对应入口：`src/ui/playground-page-shell.ts`、`src/ui/playground-conn-activity-controller.ts`、`src/ui/playground-task-inbox.ts`

### 本地 Docker 与运行态防踩坑文档
- 日期：2026-05-10
- 主题：新增本地 Docker 启动、重建、端口、SQLite、技能加载和运行态目录边界的专题防踩坑文档，并在 `AGENTS.md` 建立索引入口。
- 影响范围：
  - 后续 coding agent 在本地重启或重建 `ugk-pi` 前，应先区分本地 bind mount、生产镜像、端口 3000、orphan nginx 和 worker 重启范围。
  - 文档明确容器 `healthy` 不等于宿主入口可用，要求验证 `/healthz`、`/v1/debug/runtime`、`/v1/debug/skills`；新增技能要以 debug skills 为准。
  - 文档补充 conn SQLite、运行态目录、浏览器绑定、模型源 key、本地 / 生产命令边界，避免把生产 shared、Chrome profile、`.data` 或 key 文件卷进本地调试。
  - `docs/handoff-current.md` 和 `docs/traceability-map.md` 同步加入本轮增量更新接手口径。
- 对应入口：`docs/docker-local-ops.md`、`AGENTS.md`、`docs/handoff-current.md`、`docs/traceability-map.md`

### Conn 维护系统技能
- 日期：2026-05-10
- 主题：新增 `conn-maintenance` 系统技能，让运行时 Agent 能按安全流程协助诊断 conn 变慢、预估旧事件日志清理量，并在用户确认后引导执行维护。
- 影响范围：
  - 新技能要求先读取 `/v1/debug/runtime`、`/v1/conns`、conn run 详情等事实源，再执行 `scripts/maintain-conn-db.mjs --dry-run --json` 预估影响。
  - 正式清理前必须向用户汇报保留策略、预计清理 run 数和事件行数，并等待确认；技能明确禁止删除 `conn.sqlite`、`conn_runs`、`conn_run_files` 或手工改表。
  - 技能内置阿里云、腾讯云和本地 Docker 的维护窗口命令口径，强调停 `ugk-pi` / `ugk-pi-conn-worker` 后先备份 shared conn 目录，再清理；维护脚本默认执行 `VACUUM` / WAL checkpoint，完成后跑 verify。
- 对应入口：`.pi/skills/conn-maintenance/SKILL.md`、`test/conn-maintenance-skill.test.ts`

### Conn SQLite WAL 降级兼容补强
- 日期：2026-05-10
- 主题：修复本地 Docker / Windows bind mount 上 `PRAGMA journal_mode = WAL` 抛 `SQLITE_CANTOPEN` 时 app 启动循环的问题。
- 影响范围：`ConnDatabase` 的 WAL 降级判定除 `SQLITE_IOERR` 系列外，也把 `errcode=14` 视为可降级的 WAL 不可用场景，回退到 DELETE journal mode；只影响 WAL 初始化失败路径，不改变正常 Linux / named volume 下的 WAL 默认行为。
- 对应入口：`src/agent/conn-db.ts`、`test/conn-db.test.ts`

### CDP 代理默认拒绝无 scope 浏览器变更
- 日期：2026-05-10
- 主题：修复后台脚本直接调用 `127.0.0.1:3456` 时可能绕过 Agent / Conn 浏览器绑定的问题。
- 影响范围：
  - `cdp-proxy` 默认要求 `/new`、`/navigate` 和 `/session/*` 这类会创建、复用、导航或清理浏览器 target 的请求必须带 `metaAgentScope`。
  - 旧脚本如果裸调 `http://127.0.0.1:3456/session/navigate` 或 `/new`，现在会返回 `400 missing_agent_scope`，由运行中的 agent 根据错误修正脚本参数，而不是静默落到长驻代理进程的旧浏览器环境。
  - 保留 `UGK_ALLOW_UNSCOPED_BROWSER_PROXY=true` 作为显式 legacy 调试开关；正常 Agent / Conn run 不应开启。
- 对应入口：`runtime/skills-user/web-access/scripts/cdp-proxy.mjs`、`test/web-access-proxy.test.ts`

### Conn 事件日志瘦身与维护脚本
- 日期：2026-05-10
- 主题：降低后台 conn 任务事件库膨胀风险，并提供生产 SQLite 事件维护入口。
- 影响范围：
  - `ConnRunStore.appendEvent()` 不再持久化纯文本增量类 `message_update/text_delta` 事件；最终输出仍由 `conn_runs.result_text/result_summary` 保存，工具调用、生命周期和终态事件继续保留。
  - 新增 `scripts/maintain-conn-db.mjs`，可按 `--keep-days` 清理旧 run 的 `conn_run_events`，并用 `--keep-latest-runs-per-conn` 为每个 conn 保底保留最近若干 run 的详细事件；支持 `--dry-run`、`--json`、`--no-vacuum`。
  - 生产建议先 dry-run 看预计删除事件数，再停 `ugk-pi` / `ugk-pi-conn-worker`，用一次性容器执行清理和 `VACUUM`，最后重启并 verify。
- 对应入口：`src/agent/conn-run-store.ts`、`scripts/maintain-conn-db.mjs`、`test/conn-run-store.test.ts`、`test/conn-db-maintenance-script.test.ts`

### Agent 首页卡片与 SQLite 兼容性修复
- 日期：2026-05-10
- 主题：Playground 新增 Agent 首页（全屏卡片网格展示所有 agent 及忙闲状态），修复 Docker 生产环境 SQLite 启动崩溃。
- 影响范围：
  - **Agent 首页**：每次打开 Playground 先展示全屏首页，以卡片网格列出所有 agent（名称、描述、忙闲状态指示灯）。点击卡片进入对应 agent 的对话界面，对话界面与旧版完全一致。Agent switcher 下拉列表顶部新增"返回首页"入口。移动端适配。首页使用独立的 `data-home` 属性控制显示/隐藏，不触碰原有的 `data-stage-mode` CSS 规则，避免影响对话页面样式。
  - **SQLite WAL 兼容性**：`ConnDatabase.open()` 新增 `configureJournalMode()` 函数，优先 WAL 模式；仅在捕获到 `SQLITE_IOERR` 系列错误码（NTFS bind mount 共享内存文件不支持的典型表现）时降级到 DELETE 模式并记录 warning 日志（含 dbPath、errcode、errstr）。其他错误（权限、磁盘满、损坏）直接抛出不降级。降级后确认最终 journal_mode 并二次记录。Linux 生产环境保持 WAL 不受影响。
  - **CLAUDE.md 文档**：补充 ESM 模块解析规则、Multi-Agent Profiles、Browser Integration、SearXNG、Playground UI、Route Pattern 等子系统描述；新增 `.pi/` 目录结构说明和单文件/过滤测试命令。
- 对应入口：`src/ui/playground.ts`、`src/ui/playground-page-shell.ts`、`src/ui/playground-styles.ts`、`src/agent/conn-db.ts`、`CLAUDE.md`

## 2026-05-09

### 多 Agent 并行运行加固
- 日期：2026-05-09
- 主题：收口单进程多 agent / conn run 并行时的共享状态串扰，并补充 agent 忙闲可见性。
- 影响范围：前台 Agent run scope 改为 `AsyncLocalStorage`，不再通过全局 `process.env.CLAUDE_AGENT_ID` / `CLAUDE_HOOK_AGENT_ID` / `agent_id` 传递；子进程仍由 run 级 Bash 环境显式注入 scope。后台 Conn workspace env 同样改为 async context，并在真实 Bash spawn 时显式合并，避免并行任务串写 `OUTPUT_DIR` / `CONN_*`。浏览器 cleanup scope 纳入 `agentId + conversationId` 或 `connId + runId`，降低共享浏览器时误关其他 run 页面风险。新增 `GET /v1/agents/status` 返回 agent profile 级 `idle / busy`；同一 agent 忙时非流式 chat 返回 `409 AGENT_BUSY`，流式 chat 在 SSE hijack 前预检并返回 409。
- 特别说明：本轮没有按外部报告修改普通 `ModelRegistry.create()`，因为当前上游实现里 `create()` 只是构造 registry，`resetApiProviders()` 位于 `refresh()` / session reload 路径，不在普通会话创建路径。
- 对应入口：`src/agent/agent-scope-context.ts`、`src/agent/background-workspace-context.ts`、`src/agent/agent-errors.ts`、`src/agent/agent-run-scope.ts`、`src/agent/agent-service.ts`、`src/agent/background-agent-runner.ts`、`src/agent/agent-service-registry.ts`、`src/routes/chat.ts`、`src/workers/conn-worker.ts`、`test/agent-run-scope.test.ts`、`test/background-agent-runner.test.ts`、`test/server.test.ts`

### 模型源移除阿里并新增智谱 GLM
- 日期：2026-05-09
- 主题：从模型源注册表移除阿里 DashScope `dashscope-coding / glm-5`，新增智谱 GLM Anthropic 兼容源 `zhipu-glm / glm-5.1`。
- 影响范围：`GET /v1/model-config` 和 Playground / Conn 的模型源下拉不再展示阿里源；智谱源使用 `https://open.bigmodel.cn/api/anthropic`、`anthropic-messages` 和 `ANTHROPIC_AUTH_TOKEN` 环境变量。真实 token 仍只放运行态环境或 ignored 本地文件，不写入仓库；`.env.example` 只保留占位值。本地 `zhipu-api.txt` 兜底支持 `api-key: ...` 或 Claude 风格 JSON 的 `env.ANTHROPIC_AUTH_TOKEN`。
- 对应入口：`runtime/pi-agent/models.json`、`src/config.ts`、`.env.example`、`.gitignore`、`docs/model-providers.md`、`README.md`、`test/model-config.test.ts`、`test/agent-session-factory.test.ts`、`test/config.test.ts`、`test/containerization.test.ts`

### 浏览器绑定策略模块化收口
- 日期：2026-05-09
- 主题：把 Agent / Conn 浏览器绑定写入闸门从路由文件里的重复逻辑收口到独立策略模块，保持“UI 手动设置、Agent 只消费参数”的架构边界。
- 影响范围：新增 `browser-binding-policy` 统一读取确认 header、计算绑定字段变更、判断未确认 / 非 Playground 来源拒绝；`chat` 路由只保留 Agent profile 更新和 running conversation 拒绝逻辑，`conns` 路由只保留 Conn 更新逻辑。对外 API 行为不变，审计状态和错误文案保持兼容。
- 对应入口：`src/browser/browser-binding-policy.ts`、`src/browser/browser-binding-audit-log.ts`、`src/routes/chat.ts`、`src/routes/conns.ts`、`docs/traceability-map.md`

### 撤销 Agent 自然语言浏览器修改能力
- 日期：2026-05-09
- 主题：撤掉通过自然语言让 Agent 修改浏览器绑定的能力，将 Agent / Conn 浏览器配置收回为用户手动 UI 设置。
- 影响范围：`agent-profile-ops` 移除 `browsers / set-browser / clear-browser` 脚本动作和浏览器绑定工作流；`conn-orchestrator` 不再映射或写入 `browserId`；`web-access` 不再提供浏览器绑定配置指引，只消费平台分配的路由。UI、`GET /v1/browsers`、Agent / Conn 编辑保存接口、审计日志和服务端确认闸门保留；服务端进一步要求浏览器 / 执行路由变更必须来自 `playground` 来源，否则记录 `rejected_non_ui_source` 并拒绝。
- 隔离补强：删除旧自然语言浏览器绑定提案模块；`web-access` proxy 不再接受或转发 `metaBrowserId` / `x-nanoclaw-browser-id`，`local-cdp-browser` 不再把请求传入的 `browserId` 当作选路依据；run 级 Bash 环境只注入当前绑定浏览器的一条 `UGK_BROWSER_INSTANCES_JSON`，避免 Agent 从环境里看到其他 Chrome 实例。scope route 同时写入当前绑定的 CDP endpoint，避免长驻 `cdp-proxy` 被首次启动时的单浏览器环境固定到旧 Chrome；Agent run 启动的 proxy 现在会拒绝缺少 `metaAgentScope` 的浏览器变更请求，旧 runner 和文档示例同步补齐 scope，避免同一对话切换浏览器后无 scope 调用继续命中旧 Chrome。浏览器绑定变更是 Agent 全局参数变更；服务端会在该 Agent 有 running conversation 时返回 409 并记录 `rejected_running`，要求用户等当前运行结束后再切换。
- 对应入口：`.pi/skills/agent-profile-ops/SKILL.md`、`.pi/skills/agent-profile-ops/scripts/agent_profile_ops.mjs`、`.pi/skills/conn-orchestrator/SKILL.md`、`runtime/skills-user/web-access/SKILL.md`、`runtime/skills-user/web-access/scripts/local-cdp-browser.mjs`、`src/browser/browser-bound-bash.ts`、`docs/playground-current.md`

### Agent / Conn 浏览器绑定审计日志
- 日期：2026-05-09
- 主题：为 Agent 默认浏览器和 Conn 执行路由变更补充可追溯审计记录，避免只能靠最终状态反推操作过程。
- 影响范围：`PATCH /v1/agents/:agentId` 在 `defaultBrowserId` 变化时记录 `agent_browser_binding`；`PATCH /v1/conns/:connId` 在 `profileId` / `browserId` 变化时记录 `conn_execution_binding` 或 `conn_browser_binding`。Playground 已确认的保存请求会携带 `x-ugk-browser-binding-confirmed: true` 和来源头；服务端将目标对象、旧值、新值、来源、确认状态和写入结果追加到 `.data/audit/browser-bindings.jsonl`。审计失败只记录 warning，不阻断正常保存。
- 对应入口：`src/browser/browser-binding-audit-log.ts`、`src/routes/chat.ts`、`src/routes/conns.ts`、`src/ui/playground-agent-manager.ts`、`src/ui/playground-conn-activity-controller.ts`、`docs/runtime-assets-conn-feishu.md`、`docs/web-access-browser-bridge.md`
- 历史修正：`agent_profile_ops.mjs set-browser / clear-browser` 曾要求显式带 `--confirmed` 并发送浏览器绑定审计 header；该自然语言写入路径已在上方“撤销 Agent 自然语言浏览器修改能力”中移除。
- 服务端闸门：`PATCH /v1/agents/:agentId` 与 `PATCH /v1/conns/:connId` 现在会在浏览器 / 执行路由真实变化但缺少确认头时拒绝写入，并记录 `status: "rejected_unconfirmed"` 审计。这样即使 Agent 绕过脚本裸调 API，也不能静默修改 Chrome 绑定。

### Agent / Conn 浏览器绑定自然语言操作口径
- 日期：2026-05-09
- 主题：历史方案，曾尝试让主 Agent 通过运行时技能和确定性脚本处理浏览器绑定。
- 状态：已被上方“撤销 Agent 自然语言浏览器修改能力”取代；当前产品口径是只能由用户在 Playground UI 手动设置浏览器，Agent 不再生成浏览器绑定提案、不修改浏览器绑定字段。
- 当前处理：相关自然语言脚本动作、提案模块和计划文档已经清理；保留这条记录只为解释为什么同日会出现撤销和审计两类变更。
- 对应入口：当前事实以本节上方“撤销 Agent 自然语言浏览器修改能力”、`docs/playground-current.md` 和 `docs/web-access-browser-bridge.md` 为准。

### Conn 后台 Agent 模板缓存
- 日期：2026-05-09
- 主题：为 conn 后台任务引入 Agent 模板缓存层，加速按 `profileId` 组装临时后台 Agent 的启动路径，同时保持运行快照隔离。
- 影响范围：新增 `AgentTemplateRegistry`，缓存 `AgentProfile` 派生出的 rules、skills、默认浏览器和默认模型候选；`BackgroundAgentProfileResolver` 改为从模板冻结 `ResolvedBackgroundAgentSnapshot`，并把 `templateVersion / templateBuiltAt / templateSource` 写入 run snapshot 与 `snapshot_resolved` 事件。Agent 创建、编辑、归档、技能增删和 rules 保存会主动失效当前 server 进程缓存；独立 `conn-worker` 仍按模板 signature 懒刷新，不依赖前台内存事件。缓存的是模板，不是 session / workspace / history；任务级模型覆盖和 `upgradePolicy` 只进入 run snapshot，不切分模板；运行中的 conn run 不受模板替换影响。
- 对应入口：`src/agent/agent-template-registry.ts`、`src/agent/background-agent-profile.ts`、`src/agent/background-agent-runner.ts`、`src/routes/chat.ts`、`src/server.ts`、`docs/runtime-assets-conn-feishu.md`

## 2026-05-08

### Chrome 工作台第一阶段
- 日期：2026-05-08
- 主题：在 Playground 前台提供 Chrome 工作台，减少必须 SSH tunnel 到本地端口才能查看浏览器状态的原始操作。
- 影响范围：新增 `BrowserControlService`，`/v1/browsers/:browserId/status` 返回 CDP 在线状态、版本和页面 target 列表，并为真实页面补充 JS heap、DOM 节点和事件监听器等页面级负载估算；`/v1/browsers/:browserId/targets/:targetId/close` 支持关闭单个页面，`/v1/browsers/:browserId/start` 作为受控启动扩展点但当前默认 501。Playground 新增桌面 / 手机入口和工作区面板，可切换浏览器、刷新状态、查看页面并关闭 target；前台默认只展示真实页面，iframe / service worker 等底层 target 只折叠为中文提示，页面条目突出显示类别标签、网址和占用状态。当前不挂 Docker socket，不从 Web 直接重启或创建 Chrome，登录态仍由用户自己维护。
- 对应入口：`src/browser/browser-control.ts`、`src/browser/browser-target-usage.ts`、`src/routes/browsers.ts`、`src/ui/playground-browser-workbench.ts`、`src/ui/playground.ts`、`docs/playground-current.md`、`docs/web-access-browser-bridge.md`

### 多 Chrome browserId 注册表第一阶段
- 日期：2026-05-08
- 主题：为多 Chrome / 多登录态隔离打基础，引入只读 Browser Registry 和 Agent 默认 `browserId` 配置，不触碰现有 Chrome profile。
- 影响范围：新增 `src/browser/browser-instance.ts`、`src/browser/browser-registry.ts` 和 `src/routes/browsers.ts`；`GET /v1/browsers` / `GET /v1/browsers/:browserId` 返回用户配置的浏览器实例；未配置时自动合成现有 `default -> 172.31.250.10:9223`。Agent profile 支持可选 `defaultBrowserId`，创建 / 更新时按 Browser Registry 校验，`GET /v1/agents` 会展示该字段。
- 对应入口：`src/browser/browser-instance.ts`、`src/browser/browser-registry.ts`、`src/routes/browsers.ts`、`.codex/plans/2026-05-08-multi-chrome-browser-routing.md`、`docs/web-access-browser-bridge.md`、`.env.example`

### 建立 chrome-01 / chrome-02 独立 Chrome 实例
- 日期：2026-05-08
- 主题：在本地和生产 compose 中预置两个额外 Chrome sidecar 实例，供用户分别维护独立登录态。
- 影响范围：`docker-compose.yml` / `docker-compose.prod.yml` 新增 `ugk-pi-browser-chrome-01`、`ugk-pi-browser-chrome-01-cdp`、`ugk-pi-browser-chrome-02`、`ugk-pi-browser-chrome-02-cdp`。`chrome-01` 使用 `172.31.250.11:9223` 和 GUI `https://127.0.0.1:3902/`；`chrome-02` 使用 `172.31.250.12:9223` 和 GUI `https://127.0.0.1:3903/`。两个实例各自使用独立 profile/config 目录，登录态由用户自己维护。
- 对应入口：`docker-compose.yml`、`docker-compose.prod.yml`、`.env.example`、`docs/web-access-browser-bridge.md`

### 多浏览器运行链路架构收口
- 日期：2026-05-08
- 主题：收口多 Chrome 运行链路的职责边界，避免浏览器 scope 路由在前台会话结束后残留。
- 影响范围：新增 `src/browser/browser-bound-bash.ts`，把 run 级 `curl` 包装和浏览器 scope 注入从 `AgentSessionFactory` 中拆出。前台 `AgentService.runChat()` 在 run 开始时设置当前 scope 的浏览器路由，结束时无论页面清理是否成功都会清除该路由；`browser-scope-routes` 增加进程内同文件写入串行化；run 级 `curl` wrapper 默认写入 `.data/browser-bin`，旧根目录 `.ugk-browser-bin/` 加入 `.gitignore`。后续 2026-05-09 收口后，wrapper 只补 `metaAgentScope`，不再补浏览器 id。
- 对应入口：`src/browser/browser-bound-bash.ts`、`src/browser/browser-scope-routes.ts`、`src/agent/agent-service.ts`、`test/agent-service.test.ts`

### web-access run 级浏览器通道绑定
- 日期：2026-05-08
- 主题：把前台 Agent 和后台 Conn 的浏览器绑定从“传一组参数”收口为“运行环境里的 Chrome 通道”，避免裸 `curl 127.0.0.1:3456` 漏回默认 Chrome。
- 影响范围：Agent / Conn 创建 session 时会按最终 `browserId` 和 browser scope 生成 run 级 Bash 环境，注入 `CLAUDE_AGENT_ID` / `CLAUDE_HOOK_AGENT_ID` / `agent_id` / `WEB_ACCESS_BROWSER_ID`，并在 workspace 前置受控 `curl` wrapper。该 wrapper 只改写访问本地 `web-access` proxy 的 URL，自动补齐 `metaAgentScope`，使常规 `/new`、`/targets`、`/screenshot` 等裸 proxy 调用按本轮 scope route 命中绑定 Chrome；后续 2026-05-09 收口后，Agent 传入的浏览器 id 不再参与选路。
- 对应入口：`src/agent/agent-session-factory.ts`、`src/workers/conn-worker.ts`、`test/agent-session-factory.test.ts`、`docs/runtime-assets-conn-feishu.md`

### Conn 独立浏览器选择
- 日期：2026-05-08
- 主题：让后台 Conn 可以独立选择 `browserId`，而不是只能隐式跟随执行 Agent。
- 影响范围：`conns` 表新增 `browser_id` 并迁移到 `PRAGMA user_version = 8`；`POST /v1/conns` / `PATCH /v1/conns/:connId` 支持并校验 `browserId`；后台 runner 优先使用 Conn 自身浏览器，其次继承 resolved Agent snapshot 的 `defaultBrowserId`，最后显式使用 Browser Registry 的 `defaultBrowserId`，并把最终浏览器写入 scope route 与 Bash 工具环境。即使长驻 `cdp-proxy` 是在上一次 `chrome-02` 任务里启动的，后续主 Agent / 无默认浏览器 run 也会被 scope route 固定回系统默认浏览器，不再被 proxy 旧环境变量带跑。Playground Conn 编辑器新增“浏览器”下拉，列表展示实际策略。登录态仍由用户分别在对应 Chrome GUI 中维护，系统不复制 cookie 或 profile。
- 对应入口：`src/agent/conn-db.ts`、`src/agent/conn-sqlite-store.ts`、`src/routes/conns.ts`、`src/agent/background-agent-profile.ts`、`src/agent/background-agent-runner.ts`、`src/workers/conn-worker.ts`、`src/ui/playground-conn-activity.ts`、`src/ui/playground-conn-activity-controller.ts`、`docs/runtime-assets-conn-feishu.md`、`docs/playground-current.md`

### Agent 操作台默认浏览器 UI
- 日期：2026-05-08
- 主题：让 Playground Agent 操作台可以真实展示和编辑 Agent 的默认 `browserId`，避免只靠自然语言或手工 PATCH 配置。
- 影响范围：Agent 操作台加载时会并行读取 `/v1/agents` 与 `/v1/browsers`；列表、详情、新建页和编辑弹窗都展示浏览器绑定；创建 / 编辑 Agent 时会把 `defaultBrowserId` 写入既有 Agent API。前端只引用 Browser Registry，不创建、不启停 Chrome 容器，保持浏览器生命周期与 Agent profile 解耦。
- 对应入口：`src/ui/playground.ts`、`src/ui/playground-agent-manager.ts`、`test/playground-agent-switch.test.ts`、`docs/playground-current.md`

### web-access 长驻 proxy 浏览器路由顺序修复
- 日期：2026-05-08
- 主题：修复 Agent 默认浏览器从 `chrome-01` 切回 `chrome-02` 后，长驻 `cdp-proxy` 仍沿用旧 `WEB_ACCESS_BROWSER_ID` 导致页面继续开到旧 Chrome 的问题。
- 影响范围：`resolveBrowserIdFromMeta()` 选择顺序后续已再次收口为当前 `metaAgentScope` 的 scope route cache 优先；请求传入的浏览器 id 不再参与选路。如果请求带了 `metaAgentScope` 但没有命中 route，则直接使用系统默认浏览器，不再读取 proxy 进程环境里的 `WEB_ACCESS_BROWSER_ID`。只有无 scope 的手工请求才允许使用 proxy 进程环境兜底。
- 对应入口：`runtime/skills-user/web-access/scripts/local-cdp-browser.mjs`、`runtime/skills-user/web-access/SKILL.md`、`docs/web-access-browser-bridge.md`、`test/local-cdp-browser.test.ts`

### 多 Chrome browserId 路由落地
- 日期：2026-05-08
- 主题：把 Agent / chat 请求中的 `browserId` 真正接入 `web-access` CDP 路由，避免多任务继续争抢同一个 Chrome 前台。
- 影响范围：`AgentService` 会为本轮 run 记录 `browser cleanup scope -> browserId`，并把 scope / `WEB_ACCESS_BROWSER_ID` 注入 Bash 子进程；后续 2026-05-09 收口后，`web-access` 的 `cdp-proxy`、`host-bridge`、`local-cdp-browser` 不再接受请求级浏览器覆盖，带 scope 的请求只按 scope 路由缓存和默认浏览器选择 CDP 实例。每个 browserId 使用独立 target scope cache，避免误关其他 Chrome 的页面。登录态仍只由用户通过对应 GUI 自己维护，不复制 profile、不迁移 cookie。
- 对应入口：`src/agent/agent-service.ts`、`src/agent/agent-session-factory.ts`、`src/browser/browser-scope-routes.ts`、`src/agent/browser-cleanup.ts`、`runtime/skills-user/web-access/scripts/local-cdp-browser.mjs`、`runtime/skills-user/web-access/scripts/host-bridge.mjs`、`runtime/skills-user/web-access/scripts/cdp-proxy.mjs`、`runtime/skills-user/web-access/scripts/url-stage-executor.mjs`、`docs/web-access-browser-bridge.md`

## 2026-05-07

### v1.2.0 稳定版
- 日期：2026-05-07
- 主题：将当前双云已验证的 `260faf3 Add conn public directory contract` 标记为 `v1.2.0` 稳定版本。
- 影响范围：版本号提升到 `1.2.0`；本版本包含 Playground 会话菜单、任务消息与浅色主题收口、UI 层级清理，以及 conn 长期公开目录 / 站点级公开目录契约。腾讯云和阿里云均已增量更新到该代码基线并通过运行态检查。
- 对应入口：`package.json`、`package-lock.json`、`docs/change-log.md`

### Conn 长期公开目录契约
- 日期：2026-05-07
- 主题：为后台 conn 增加长期稳定公开目录和站点级公开目录，避免 agent 继续在 `CONN_SHARED_DIR`、`OUTPUT_DIR` 和 `/app/public` 之间猜。
- 影响范围：每条 conn run 会创建 `CONN_PUBLIC_DIR=<background>/shared/<connId>/public` 并注入 `CONN_PUBLIC_BASE_URL`；新增 `GET /v1/conns/:connId/public/<path>` 只服务该 public 子目录，不公开 `CONN_SHARED_DIR` 里的私有状态。conn 可选 `publicSiteId`，配置后 run 会创建 `SITE_PUBLIC_DIR=<background>/sites/<publicSiteId>/public` 并注入 `SITE_PUBLIC_BASE_URL`；新增 `GET /v1/sites/:siteId/<path>` 作为多个 conn 共建网站的公开出口。数据库 `conns` 表新增 `public_site_id`，迁移到 `PRAGMA user_version = 7`。
- 对应入口：`src/agent/background-workspace.ts`、`src/agent/background-agent-runner.ts`、`src/agent/conn-store.ts`、`src/agent/conn-sqlite-store.ts`、`src/agent/conn-db.ts`、`src/routes/conns.ts`、`src/routes/conn-route-parsers.ts`、`.pi/skills/conn-orchestrator/SKILL.md`、`docs/runtime-assets-conn-feishu.md`、`test/background-workspace.test.ts`、`test/background-agent-runner.test.ts`、`test/server.test.ts`

### Playground UI 层级与主题一致性排查
- 日期：2026-05-07
- 主题：收口桌面 workspace 的废弃关闭按钮样式、重复 header 规则和 Agent 操作台浅色主题透底问题。
- 影响范围：桌面文件库 / 任务消息 workspace 继续由 topbar “回到会话”承担返回语义，移除已废弃的 `asset-head-close-button` / `task-inbox-head-close-button` 样式和打歪的 CSS 片段；文件库与任务消息 header 统一使用 `playground-assets.ts` 的 command-bar 规则，浅色主题不再额外给 header 按钮补描边；Agent 操作台、编辑器和规则编辑器浅色 body 统一使用浅灰蓝工作底，真正内容项保持白色卡片承载。
- 对应入口：`src/ui/playground-styles.ts`、`src/ui/playground-assets.ts`、`src/ui/playground-theme-controller.ts`、`src/ui/playground-agent-manager.ts`、`src/ui/playground-task-inbox.ts`、`test/server.test.ts`、`docs/playground-current.md`

## 2026-05-06

### Playground 任务消息列表重设计
- 日期：2026-05-06
- 主题：移除任务消息页的“未读 / 全部”筛选入口，改为在全部消息列表里用展开状态和视觉高亮区分未读 / 已读。
- 影响范围：任务消息页始终请求 `/v1/activity` 全量列表，不再由前端追加 `unreadOnly=true`；未读消息红色高亮并默认展开，已读消息默认折叠且只显示标题和时间；时间提升到标题同级展示，展开态再显示来源、正文、任务 ID、附件和操作按钮；“全部已读”会同步收起当前列表；浅色主题补齐任务消息、后台任务和 Agent 操作台的浅灰蓝工作底、白色卡片、细边框和深色文字，避免条目与页面背景混在一起。
- 对应入口：`src/ui/playground-task-inbox.ts`、`src/ui/playground.ts`、`src/ui/playground-theme-controller.ts`、`src/ui/playground-assets.ts`、`src/ui/playground-agent-manager.ts`、`test/server.test.ts`、`docs/playground-current.md`

### Playground 会话菜单
- 日期：2026-05-06
- 主题：把会话列表里的单一删除按钮升级为会话更多菜单，支持重命名、置顶、背景颜色和删除。
- 影响范围：会话 catalog 元数据新增 `pinned` 与 `backgroundColor`，旧会话默认未置顶且无背景色；`PATCH /v1/chat/conversations/:conversationId` 和 scoped agent 同名接口可更新会话标题、置顶状态和颜色；会话列表按置顶优先、更新时间次序展示，并在深浅主题下显示菜单和颜色标识。背景颜色选项收口为“默认 + 浅蓝 / 薄荷 / 蜜桃 / 浅粉 / 浅灰”，默认项继续跟随浅 / 深主题，默认色块也按当前主题显示单色，自定义浅色卡片会切换深色文字；置顶标记改为更醒目的红色竖线。
- 对应入口：`src/agent/conversation-store.ts`、`src/agent/agent-service.ts`、`src/routes/chat.ts`、`src/ui/playground-conversations-controller.ts`、`src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`README.md`、`docs/traceability-map.md`、`docs/agent-chat-governance-map.md`

### Playground Markdown 代码块宽度约束
- 日期：2026-05-06
- 主题：修复对话气泡中 Markdown 代码块 `.code-block` 被长代码行撑出气泡宽度的问题。
- 影响范围：`.message-content`、`.code-block` 和内部 `pre` 补齐 `min-width / max-width / width / overflow` 约束，外层跟随气泡宽度，长代码行只在代码块内部横向滚动；表格渲染逻辑不变。
- 对应入口：`src/ui/playground-styles.ts`、`test/server.test.ts`、`docs/playground-current.md`

### Step Contract Designer 运行时技能
- 日期：2026-05-06
- 主题：将 `step-contract-designer` 项目级运行时技能从重型 step 契约生成流程，收口为“参考引导 + 诊断评估”两类辅助能力。
- 影响范围：后续用户要求“限制 agent 发散”“把任务拆成 step”“评估 step 是否能达成目标”时，运行时 Agent 不再默认进入强制 Phase、生成目录、落地文件或完整流水线；技能只辅助用户设计和诊断。新的核心约束是每个 step 必须有验证机制，但“怎样算合格”由用户决定，Agent 负责把用户验收口径转换为硬校验、软检查或人工确认，避免小任务被过度流程化。
- 对应入口：`.pi/skills/step-contract-designer/SKILL.md`

### Playground 刷新时保留当前 Agent
- 日期：2026-05-06
- 主题：修复刷新页面或短暂读取 `/v1/agents` 失败时，前端把已选自定义 Agent 误重置为 `main`，导致用户误以为当前 Agent 会话上下文消失的问题。
- 影响范围：`loadAgentCatalog()` 只有在可靠获取 agent catalog 后才会判断当前 agent 是否不存在并回退 `main`；catalog 请求失败时保留 `localStorage` 中的 active agent，并在选择器中临时显示该 agent，避免刷新期间把 scoped agent 会话切走。服务端 session 与 conversation index 不变。
- 对应入口：`src/ui/playground.ts`、`test/playground-agent-switch.test.ts`

### Conn 跨 run 共享目录
- 日期：2026-05-06
- 主题：为后台 conn run 提供平台级 `CONN_SHARED_DIR`，解决 zhihu-robot 等周期任务跨 run 去重、审计记录、冷却时间戳和 checkpoint 没有稳定持久目录的问题。
- 影响范围：每条 conn 的 run workspace 会创建同 conn 共享的 `background/shared/<connId>` 目录；后台 prompt 和环境变量会注入 `CONN_SHARED_DIR`；`conn-orchestrator` 基础技能和运行文档明确禁止把跨 run 状态写入 `/tmp`、`/app/runtime`、`runtime/skills-user` 或 `OUTPUT_DIR`。平台不在删除 conn 时自动清理该目录，避免误删生产状态。
- 对应入口：`src/agent/background-workspace.ts`、`src/agent/background-agent-runner.ts`、`.pi/skills/conn-orchestrator/SKILL.md`、`docs/runtime-assets-conn-feishu.md`、`test/background-workspace.test.ts`、`test/background-agent-runner.test.ts`

### Playground 桌面 workspace 头部视觉升级
- 日期：2026-05-06
- 主题：优化桌面 Web 模式下文件库、任务消息等操作页共用的 `asset-modal-head mobile-work-topbar` 头部布局，避免手机 topbar 风格直接塞进桌面工作区导致粗糙拥挤。
- 影响范围：桌面 workspace 头部统一为两列 command bar，左侧只保留竖向强调线和页面标题，不再显示 `工作区 /` 面包屑或标题旁数量胶囊；右侧操作按钮右对齐并采用小型分段控制视觉；桌面隐藏移动返回箭头，移动端全屏工作页结构不变。
- 对应入口：`src/ui/playground-assets.ts`、`src/ui/playground-task-inbox.ts`、`test/playground-styles.test.ts`、`test/server.test.ts`、`docs/playground-current.md`

### Playground 桌面上下文用量 tooltip 不常驻
- 日期：2026-05-06
- 主题：修复桌面 Web 模式下点击上下文用量按钮会把 hover tooltip 置为常驻展开的问题。
- 影响范围：桌面端上下文用量浮层只随 hover / focus-visible 展示，点击不再切换 `contextUsageExpanded`；移动端点击仍打开完整上下文详情 dialog。
- 对应入口：`src/ui/playground-context-usage-controller.ts`、`test/playground-context-usage-controller.test.ts`、`docs/playground-current.md`

### Playground 运行中文件库可用
- 日期：2026-05-06
- 主题：修复会话运行中“文件库”和 workspace“回到会话”被全局 loading 状态禁用的问题，允许运行中打开文件库并返回对话补充下一条消息。
- 影响范围：运行中仍禁用 chat 态“新会话”以保护 active run 归属；桌面文件库入口、移动端文件库菜单和资产刷新入口不再被 `setLoading(true)` 锁死；当 topbar 左侧按钮在 workspace 态显示为“回到会话”时保持可点击，返回 chat 后恢复“新会话”的运行中禁用规则。
- 对应入口：`src/ui/playground-status-controller.ts`、`src/ui/playground-workspace-controller.ts`、`src/ui/playground-assets-controller.ts`、`test/playground-status-controller.test.ts`、`test/playground-workspace-controller.test.ts`、`test/playground-assets-controller.test.ts`、`docs/playground-current.md`

### 架构治理交接快照刷新
- 日期：2026-05-06
- 主题：按 `feature-handoff` 流程刷新当前交接快照，校准本地 HEAD、origin/main、双云生产基线和未提交工作区边界。
- 影响范围：后续新 agent 接手时能看到 `379eb82` 本地架构治理交接提交、`425227e` 生产文件库 UI 细化发布基线、当前本地 ahead 2 状态，以及哪些 runtime 临时文件不应提交。
- 对应入口：`docs/handoff-current.md`、`.codex/plans/2026-05-06-handoff-architecture-governance.md`、`docs/change-log.md`

### Feature handoff 开发协作技能
- 日期：2026-05-06
- 主题：新增 repo-local `feature-handoff` 开发协作 skill，把维护本仓库的 coding agent 在功能完成后的记录、验证、提交边界和换 agent 前交接流程沉淀为可复用规范。
- 影响范围：后续 coding agent 在用户要求“做完记录”“收尾”“交接”“换 agent 前备份”时，应使用该技能整理 `docs/change-log.md`、模块文档、`.codex/plans/` 交接说明、验证结果和不应提交文件清单；明确 `.codex/skills/` 是开发协作层，不能和产品运行时 `.pi/skills/` 混用。
- 对应入口：`.codex/skills/feature-handoff/SKILL.md`、`AGENTS.md`、`docs/change-log.md`

### AGENTS.md 接手规范收口
- 日期：2026-05-06
- 主题：整理仓库根 `AGENTS.md` 的职责边界，明确它是高层接手契约，不再作为 UI、部署或排障流水账。
- 影响范围：新增 `AGENTS.md` 本文件维护规则，规定允许写入内容、禁止写入内容、细节去处、新增规则门槛和过期规则处理；将 `8.4 运行事实` 从细节堆叠收口为跨模块硬约束和专题文档入口，并补充架构治理指南在阅读顺序与文档分层中的位置。
- 对应入口：`AGENTS.md`、`docs/architecture-governance-guide.md`、`docs/change-log.md`

### 架构治理接手总入口
- 日期：2026-05-06
- 主题：新增后续 agent 接手与架构治理总入口，避免治理文档分散后继续靠猜测接手。
- 影响范围：新增 `docs/architecture-governance-guide.md`，汇总先读顺序、治理文档地图、模块边界、修改前检查清单、禁区、推荐治理节奏和验证口径；`README.md` 与 `docs/traceability-map.md` 已挂入该入口。
- 对应入口：`docs/architecture-governance-guide.md`、`README.md`、`docs/traceability-map.md`

### Chat scoped agent service resolver 收口
- 日期：2026-05-06
- 主题：按 Agent / Chat 治理地图执行第一步源码治理，把 `src/routes/chat.ts` 中 scoped agent service 解析与 unknown agent 404 响应收口到 `resolveScopedAgentServiceOrSend()`。
- 影响范围：scoped debug skills、agent profile 元操作、rules 文件、scoped chat conversations / state / status / history / events / stream / queue / reset / interrupt 等路由复用同一解析 helper；外部 URL、响应体、unknown agent 不 fallback main 和 `AgentService` run 生命周期不变。
- 对应入口：`src/routes/chat.ts`、`docs/agent-chat-governance-map.md`、`test/chat-agent-routes.test.ts`

### Agent / Chat 治理地图
- 日期：2026-05-06
- 主题：执行架构治理批次 E，新增前台 Chat、scoped Agent profile 路由与 `AgentService` run 生命周期的治理地图，区分可抽薄的 HTTP wrapper 和不应强拆的运行生命周期。
- 影响范围：梳理 main `/v1/chat/*`、scoped `/v1/agents/:agentId/chat/*`、agent profile 元操作、SSE、route parser、`activeRuns` / `terminalRuns`、browser cleanup 和 run result helper 的边界；明确 unknown scoped agent 不能 fallback main，`AgentService.runChat()` 暂不作为优先拆分点。
- 对应入口：`docs/agent-chat-governance-map.md`、`src/routes/chat.ts`、`src/agent/agent-service.ts`、`test/chat-agent-routes.test.ts`

### Conn / Activity / Legacy 治理地图
- 日期：2026-05-06
- 主题：执行架构治理批次 D，新增后台任务、任务消息、output 文件与 legacy 兼容层的治理地图，明确主链路、保留原因和删除条件。
- 影响范围：梳理 `conn` 定义、worker 执行、`workspace/output` 文件索引、`agent_activity_items` 任务消息、通知投递和 `/v1/debug/cleanup` 观测项；标注 `conversation` target、旧 `conversation_notifications`、`/app/public` output 收编、`modelPolicyId` 等兼容对象的保留边界。
- 对应入口：`docs/conn-activity-legacy-governance-map.md`、`docs/runtime-assets-conn-feishu.md`、`src/workers/conn-worker.ts`、`src/routes/cleanup-debug.ts`

### Playground UI 治理地图
- 日期：2026-05-06
- 主题：执行架构治理批次 C，新增 Playground UI 边界治理文档，明确 shell、脚本装配、共享样式、workspace 壳层和各 feature controller 的当前职责。
- 影响范围：记录 `playground.ts`、`playground-page-shell.ts`、`playground-styles.ts`、`playground-workspace-controller.ts` 与资产库 / 后台任务 / Agent 管理 / 任务消息等模块的真源边界；补充样式治理口径、禁止回退项、后续低风险整理队列和最小验证组合。
- 对应入口：`docs/playground-ui-governance-map.md`、`docs/playground-current.md`、`DESIGN.md`

### 架构治理测试矩阵
- 日期：2026-05-06
- 主题：执行架构治理批次 B，新增测试矩阵与风险闸门文档，明确后续不同业务域改动对应的最小验证命令和全量验证条件。
- 影响范围：按 Chat / Agent、Agent profile、Playground、Assets / Files、Conn / Activity / Output、Feishu、Runtime Debug / Deployment、Skills / Extensions 分组整理测试；同时标注 `test/server.test.ts` 哪些集成烟测应保留，哪些纯 UI 字符串断言可后续评估迁移。
- 对应入口：`docs/architecture-test-matrix.md`、`.codex/plans/2026-05-06-architecture-governance-next-batches.md`

### 架构治理批次 A 审计
- 日期：2026-05-06
- 主题：执行架构分析与优化计划的第一批只读审计，先建立当前架构地图、legacy 决策表、高风险调用链和候选优化 backlog，不修改业务源码。
- 影响范围：新增架构治理审计文档，明确 `server.ts` 装配层、Chat / Agent 主链路、Playground UI、conn / activity / output、Feishu 与 legacy 兼容层的当前边界；后续优化建议按批次 B/C/D/E 小步推进。
- 对应入口：`docs/architecture-governance-audit-2026-05-06.md`、`.codex/plans/2026-05-06-architecture-analysis-and-optimization-plan.md`

## 2026-05-05

### Agent 切换悬浮菜单
- 日期：2026-05-05
- 主题：topbar 右侧 agent label 按钮新增悬浮弹出菜单，hover 时展示可切换 agent 列表。
- 影响范围：
  - agent label 按钮内新增 `.agent-switcher-meta` 弹出容器和 `.agent-switcher-label` 文字包装 span。
  - 弹出菜单沿用 `context-usage-meta` 的 `opacity/pointer-events/transform` 显隐模式，深色/浅色主题均已适配。
  - 列表项展示名称、agentId、当前激活标识；已激活项 disabled，其他项点击直接调用 `switchAgent()`。
  - `renderAgentSelector()` 拆分为 label 更新 + `renderAgentSwitcherMeta()` 弹出列表渲染。
- 对应入口：`src/ui/playground-page-shell.ts`、`src/ui/playground.ts`、`src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`

### 桌面端工作区头部与交互优化
- 日期：2026-05-05
- 主题：重构桌面端文件库和任务消息页面的头部结构，统一 workspace 面板的打开/关闭交互。
- 影响范围：
  - 文件库 header：去除手机端遗留的 `mobile-work-topbar` 结构，← 返回箭头桌面端隐藏，改为 `工作区 / 可复用资产 [N]` 面包屑 + `刷新` 按钮。
  - 任务消息 header：同样去除手机遗留结构，改为 `工作区 / 任务消息 [N]` + 筛选按钮，未读计数显示在 header 徽标中。
  - 任务消息列表项：从透明碎片改为完整卡片容器（`#0b0c18` + 4px 圆角），标题从药丸按钮改为干净文字，元数据改为小徽标，未读项增加左侧渐变亮条，操作按钮改为无边框透明风格。
  - workspace 打开/关闭交互：topbar 左侧按钮在 workspace 激活时自动从"新会话"切换为"回到会话"，点击关闭面板返回对话；在 workspace 打开时点击左侧会话列表项，自动关闭面板并切换会话。
  - 桌面端（≥641px）强制隐藏所有 `.mobile-work-back-button`，手机端不受影响。
- 对应入口：`src/ui/playground-assets.ts`、`src/ui/playground-task-inbox.ts`、`src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`、`src/ui/playground-workspace-controller.ts`、`src/ui/playground-conversations-controller.ts`、`src/ui/playground.ts`

### 模型源默认选择改为运行态持久化
- 日期：2026-05-05
- 主题：修复生产上线后 Web 里选择的默认 API 源 / 模型回到仓库默认值的问题。
- 影响范围：`/v1/model-config`、前台 Agent session factory 和 conn worker 现在优先读取 `UGK_MODEL_SETTINGS_PATH=/app/.data/agent/model-settings.json`，运行态文件缺失时才回退 `.pi/settings.json`；保存默认选择只写运行态路径。生产 compose 和 server-ops 验收同步检查该路径，deploy 会在重建容器前把旧容器当前 `/app/.pi/settings.json` 迁移到 shared，避免第一次上线该修复时再丢一次用户偏好。
- 对应入口：`src/agent/model-config.ts`、`src/agent/agent-session-factory.ts`、`docker-compose.yml`、`docker-compose.prod.yml`、`scripts/server-ops.mjs`、`docs/model-providers.md`、`docs/server-ops.md`

### 校准全新接手文档
- 日期：2026-05-05
- 主题：把全新 agent `/init` 最容易先读到的接手入口校准到 `4a8c7e5` 双云验收后的事实，避免继续把 `48db6b8` 或更早云端基线当现状。
- 影响范围：`AGENTS.md` 只保留当前基线和渐进式披露入口，不塞发布流水账；`docs/handoff-current.md` 改回当前交接摘要；双云部署手册顶部补 `4a8c7e5` 发布记录和当前基线。
- 对应入口：`AGENTS.md`、`docs/handoff-current.md`、`docs/tencent-cloud-singapore-deploy.md`、`docs/aliyun-ecs-deploy.md`、`docs/project-cleanup-assessment-2026-05-05.md`

### 删除旧会话通知 SQLite 表
- 日期：2026-05-05
- 主题：把已经退出主链路的 `conversation_notifications` 从 conn SQLite schema、迁移目标和 conn 删除清理路径中移除。
- 影响范围：新初始化数据库不再创建旧表；旧数据库升级到 user_version 6 时会 `DROP TABLE IF EXISTS conversation_notifications`；`/v1/debug/cleanup` 对仍存在该表的异常旧库保持只读统计，正常新库返回 0。当前 conn 结果继续只走 `agent_activity_items` / 任务消息页。
- 对应入口：`src/agent/conn-db.ts`、`src/agent/conn-sqlite-store.ts`、`src/routes/cleanup-debug.ts`、`test/conn-db.test.ts`、`test/cleanup-debug.test.ts`

### 移除旧会话通知 Store
- 日期：2026-05-05
- 主题：删除已退出主链路的 `ConversationNotificationStore` 和对应功能测试，避免旧 conversation-scoped notification 入口继续误导维护者。
- 影响范围：当时保留 `conversation_notifications` SQLite 表、conn 删除清理和 `/v1/debug/cleanup` 只读观测；不恢复任何写入旧通知表的运行路径。后续旧表已在“删除旧会话通知 SQLite 表”中移出 schema。
- 对应入口：`src/agent/conversation-notification-store.ts`、`test/conversation-notification-store.test.ts`、`src/agent/conn-db.ts`、`src/agent/conn-sqlite-store.ts`、`src/routes/cleanup-debug.ts`

### Activity 文件类型与旧会话通知解绑
- 日期：2026-05-05
- 主题：把 `ConversationNotificationFile` 从旧 `ConversationNotificationStore` 中迁出为中性 `ActivityFile`，并给旧会话通知 store 标注 deprecated。
- 影响范围：`AgentActivityStore`、`conn-worker` 和当时仍保留的 legacy `ConversationNotificationStore` 共享 `src/agent/activity-file.ts` 的文件元数据类型；运行行为和 SQLite schema 不变。后续 `ConversationNotificationStore` 已在“移除旧会话通知 Store”中删除。
- 对应入口：`src/agent/activity-file.ts`、`src/agent/agent-activity-store.ts`、`src/agent/conversation-notification-store.ts`、`src/workers/conn-worker.ts`、`test/conversation-notification-store.test.ts`

### Legacy 清理决策表
- 日期：2026-05-05
- 主题：把 conn / Feishu / agent profile 相关 legacy 兼容层整理成明确决策表，先标记和观测，不在主链路刚稳定后冒进删代码。
- 影响范围：明确 `conversation` target、`conversation_notifications`、Feishu `mapped` mode、legacy subagent、Windows host IPC 和 `/playground/reset` 的保留原因、禁止事项和后续删除条件；运行文档同步补充 Conn / Feishu legacy 口径。
- 对应入口：`docs/project-cleanup-assessment-2026-05-05.md`、`docs/runtime-assets-conn-feishu.md`

### Conn worker 运行验收清单
- 日期：2026-05-05
- 主题：把 conn worker 会话解耦、任务消息投递、output 文件索引、公网链接和 cleanup debug 的验收口径固化到运行文档。
- 影响范围：新增“Conn Worker 运行验收清单”，明确改动或部署后应检查 `task_inbox`、会话删除不影响后台 run、activity 投递、output files、run/latest URL、公网可访问性和 `/v1/debug/cleanup?since=...`。
- 对应入口：`docs/runtime-assets-conn-feishu.md`

### Cleanup debug 支持 since 过滤
- 日期：2026-05-05
- 主题：为 `/v1/debug/cleanup` 增加 `?since=<ISO time>` 查询参数，用修复时间之后的 run 观察当前链路，避免修复前历史假成功 / 无产物 run 长期污染体检结果。
- 影响范围：未传 `since` 时仍按最近 7 天统计；传入合法 ISO 时间时，`recentRuns` 只统计该时间之后的 run，conn target 和 legacy conversation notification 统计保持全量只读。
- 对应入口：`src/routes/cleanup-debug.ts`、`test/cleanup-debug.test.ts`、`docs/project-cleanup-assessment-2026-05-05.md`

### Cleanup debug output 风险口径细化
- 日期：2026-05-05
- 主题：细化 `/v1/debug/cleanup` 对缺少 output 文件索引的风险判断，避免把失败 / 取消 run 没有产物也算成产物链路风险。
- 影响范围：`recentRuns` 新增 `succeededWithoutOutputFiles / failedWithoutOutputFiles / cancelledWithoutOutputFiles`；`risks[]` 只在成功 run 缺少 output 文件时提示 `recent succeeded conn runs without indexed output files`。失败和取消 run 的缺产物情况仍保留统计，但不默认报警。
- 对应入口：`src/routes/cleanup-debug.ts`、`src/types/api.ts`、`test/cleanup-debug.test.ts`、`docs/project-cleanup-assessment-2026-05-05.md`

### Legacy 清理只读体检接口
- 日期：2026-05-05
- 主题：新增 `/v1/debug/cleanup` 只读体检接口，用真实运行态数据评估旧 conn / activity / output 链路是否还能清理。
- 影响范围：接口读取 conn SQLite，不修改任何数据；返回未软删除 conn 的 target 分布、旧 `conversation_notifications` 统计、最近 7 天 run 与 `agent_activity_items` / `conn_run_files` 的对齐情况，以及可读 `risks[]`。该接口用于清理决策前的数据观察，不是迁移或删除入口。
- 对应入口：`src/routes/cleanup-debug.ts`、`src/server.ts`、`src/types/api.ts`、`test/cleanup-debug.test.ts`、`test/server.test.ts`、`docs/project-cleanup-assessment-2026-05-05.md`

### 项目旧链路清理评估与 HTML 文件卡片收口
- 日期：2026-05-05
- 主题：测试完成后补齐文档管理，整理当前项目主链路、legacy 兼容层和可清理候选；同时修复任务消息文件卡片未把 `text/html` 当作可打开预览文件的问题。
- 影响范围：新增项目清理评估文档，明确 conn / activity / output / Feishu / web-access / agent profile 等主链路与遗留兼容层边界；更新阿里云部署手册和 `AGENTS.md` 当前基线到 `48db6b8`。前端通用文件卡片现在会为 `text/html` 显示“打开”操作，和后端 inline preview 白名单保持一致。
- 对应入口：`docs/project-cleanup-assessment-2026-05-05.md`、`AGENTS.md`、`docs/aliyun-ecs-deploy.md`、`src/ui/playground-assets-controller.ts`、`test/server.test.ts`

### Conn HTML 输出链接可访问性修复
- 日期：2026-05-05
- 主题：修复后台 conn worker 生成 HTML 后，任务消息或飞书通知里给出的报告链接不可直接访问 / 只能下载的问题。
- 影响范围：conn output 文件接口继续以 `workspace/output/` 和 `conn_run_files` 为唯一持久产物出口，不新增知乎专属 `/zhihu-browse` 静态路由，也不恢复 `/app/public` 直写。`text/html` 现在纳入 inline 预览白名单，`GET /v1/conns/:connId/runs/:runId/output/<path>` 与 `GET /v1/conns/:connId/output/latest/<path>` 会让浏览器直接打开 HTML，只有显式 `?download=true` 才强制下载。`BackgroundAgentRunner` 会 best-effort 把结果正文中确实存在的 public 静态文件链接收编到本轮 `output/`，`conn-worker` 写入任务消息 activity 时会携带已索引 output 文件链接，飞书全局通知镜像也会复用这些平台生成的文件链接，减少模型正文手写错误 URL 导致的 404。
- 对应入口：`src/agent/background-agent-runner.ts`、`src/routes/file-route-utils.ts`、`src/workers/conn-worker.ts`、`test/background-agent-runner.test.ts`、`test/server.test.ts`、`test/conn-worker.test.ts`、`docs/runtime-assets-conn-feishu.md`

### Conn 后台任务解除前台会话默认绑定
- 日期：2026-05-05
- 主题：把 conn 创建与执行从前台聊天会话默认绑定中解耦，避免删除会话或编造无效 `conversationId` 影响后台任务。
- 影响范围：`.pi/extensions/conn` 工具未传 `target` 时默认创建 `{ "type": "task_inbox" }` 任务，系统技能不再要求为新任务猜测或编造 `conversationId`；playground conn 编辑器上传新资产改用 `conn:<connId>` / `conn:draft` 稳定归属，真正绑定后台任务的是保存时写入的 `assetRefs`。`conversation` target 保留 legacy 兼容读取，不再作为新建默认入口；`conn-worker` 继续通过全局任务消息和通知投递结果，删除前台会话不应破坏 conn 定义、run 历史、任务消息或输出文件链接。
- 对应入口：`.pi/extensions/conn/index.ts`、`.pi/skills/conn-orchestrator/SKILL.md`、`src/ui/playground-conn-activity-controller.ts`、`test/conn-extension.test.ts`、`test/playground-conn-activity-controller.test.ts`、`test/conn-worker.test.ts`、`docs/runtime-assets-conn-feishu.md`、`docs/playground-current.md`

### 双云增量更新到 05c3b59
- 日期：2026-05-05
- 主题：完成 `05c3b59 Harden runtime catalog and conn deletion` 的阿里云与腾讯云增量发布，并更新接手文档。
- 影响范围：阿里云从 `gitee/main`、腾讯云从 `origin/main` fast-forward 到 `05c3b59` 并重建 app / conn-worker / feishu-worker；两边 `server:ops verify` 均通过，`/v1/debug/runtime` 返回 `ok=true`。阿里云发布前备份为 `/root/ugk-claw-shared/backups/pre-deploy-05c3b59-20260505-095431`，发布后 `/v1/agents` 为 `main/search/zhihu`；腾讯云发布前备份为 `/home/ubuntu/ugk-claw-shared/backups/pre-deploy-05c3b59-20260505-100040`，发布后 `/v1/agents` 为 `main/search`。`docs/server-ops.md` 明确 `deploy` 脚本不自动备份，发布前必须手动备份 `.data/agent`、`.data/agents` 和 `runtime/skills-user`。
- 对应入口：`AGENTS.md`、`docs/server-ops.md`

### Agent profile catalog 原子写入与并发保护
- 日期：2026-05-05
- 主题：排查同类运行态数据丢失隐患后，修复自定义 Agent profile catalog 并发写入可能互相覆盖的问题。
- 影响范围：`profiles.json` 写入现在通过同目录临时文件 + `rename` 原子替换完成，并按 project root 串行化 catalog 读改写；并发创建、编辑、归档自定义 Agent 时会基于最新 catalog 合并，不再让后到的写入覆盖先到的 Agent。该改动只保护 catalog 元数据写入，不改变 Agent 技能目录删除和归档目录移动的既有 API 行为。
- 对应入口：`src/agent/agent-profile-catalog.ts`、`test/agent-profile-catalog.test.ts`

### Conn 后台任务删除改为软删除
- 日期：2026-05-05
- 主题：排查阿里云删除长期运行后台任务时长时间卡顿的问题，并移除请求内级联硬删除隐患。
- 影响范围：`DELETE /v1/conns/:connId` 与 `POST /v1/conns/bulk-delete` 现在通过 `conns.deleted_at` 做软删除，任务会从 `GET /v1/conns` 和管理面隐藏、停止后续调度，同时清理任务消息 / 会话通知引用；不再在 HTTP 请求内通过外键级联删除大量 run / event / file 历史，避免多年任务删除时阻塞 SQLite 和 Node 主线程。run 历史暂留在 SQLite，后续真实清理应走单独维护任务。
- 对应入口：`src/agent/conn-db.ts`、`src/agent/conn-sqlite-store.ts`、`test/conn-db.test.ts`、`test/conn-sqlite-store.test.ts`、`docs/runtime-assets-conn-feishu.md`

### Agent profile 跨挂载归档修复
- 日期：2026-05-05
- 主题：修复阿里云删除 / 归档 `search` Agent 时 `EXDEV: cross-device link not permitted` 的生产错误，并把 Playground agent 切换能力暴露为明确操作接口。
- 影响范围：Agent profile 归档仍优先使用同文件系统 `rename`；当 `.data/agents` 与 `.data/agents-archive` 位于不同挂载层导致 `EXDEV` 时，自动降级为递归复制到归档目录后删除源目录，避免前端删除 Agent 失败。Playground 暴露 `window.ugkPlaygroundAgentOps.switchAgent(agentId)` 给已理解用户明确意图的 agent 调用；不做“切换 / 切到 / 进入 + 名称”的前端自然语言文本匹配。`agent-profile-ops` 新增统一 `dispatch` 脚本：优先把 `search-engine` 这类用户创建的 agent profile 解析到 scoped chat，仍识别 `scout/worker` 等 legacy subagent，避免继续回答“不是 subagent 所以不能派发”。
- 对应入口：`src/agent/agent-profile-catalog.ts`、`src/ui/playground.ts`、`.pi/skills/agent-profile-ops/SKILL.md`、`.pi/skills/agent-profile-ops/scripts/agent_profile_ops.mjs`、`test/agent-profile-catalog.test.ts`、`test/agent-profile-ops-skill.test.ts`、`test/server.test.ts`

### Conn 输出 URL 双云上线与 AGENTS 渐进式披露收口
- 日期：2026-05-05
- 主题：记录 `ba9d7a0 Expose conn output files over HTTP` 已完成双云增量上线，并优化 `AGENTS.md` 的阅读顺序。
- 影响范围：腾讯云从 `origin/main`、阿里云从 `gitee/main` fast-forward 到 `ba9d7a0` 并重建 app / conn-worker / feishu-worker；发布后 `server:ops verify` 通过，阿里云 `/v1/agents` 确认 `main/search/zhihu` 仍可见。阿里云发布前已备份 shared 运行态到 `/root/ugk-claw-shared/backups/pre-deploy-ba9d7a0-20260505-000715`。`AGENTS.md` 增加渐进式披露阅读顺序，避免后续 agent 为简单任务全量翻部署长文或误把仓库根规则当 Playground agent 人格。
- 对应入口：`AGENTS.md`、`docs/server-ops.md`、`docs/runtime-assets-conn-feishu.md`

## 2026-05-04

### Conn 输出产物 URL 入口
- 日期：2026-05-04
- 主题：评估并落地前端提出的 conn 任务输出产物对外访问诉求。
- 影响范围：新增 `GET /v1/conns/:connId/runs/:runId/output/<path>` 打开单次 run 的已索引输出文件，新增 `GET /v1/conns/:connId/output/latest/<path>` 打开该 conn 最新成功 run 的同名输出文件；run detail 的 `files[]` 补充 `url/latestUrl`，前端 run 详情弹层把输出文件渲染成可点击链接。后台任务 prompt 和运行环境增加 `OUTPUT_DIR`、`CONN_OUTPUT_BASE_URL`，并兼容 `ZHIHU_REPORT_BASE_URL`。该方案继续以 run workspace 的 `output/` 为唯一持久产物出口，不恢复 `/app/public` 直写。
- 对应入口：`src/routes/conns.ts`、`src/routes/conn-route-presenters.ts`、`src/types/api.ts`、`src/agent/background-agent-runner.ts`、`src/workers/conn-worker.ts`、`src/ui/playground-conn-activity-controller.ts`、`src/ui/playground-conn-activity.ts`、`test/server.test.ts`、`test/background-agent-runner.test.ts`、`docs/runtime-assets-conn-feishu.md`

### 历史 bug 报告文档清理
- 日期：2026-05-04
- 主题：清理仓库内已完成落地的旧 `bugs/` 问题报告，避免 repo 同时保存“已处理源报告”和“当前运行文档”两套口径。
- 影响范围：删除已完成归档的旧报告文件；主文档保留对应修复记录和真实代码 / 文档入口，不再把已删除的 `bugs/` 文件列为当前入口。运行时临时产物仍不入 Git。
- 对应入口：`docs/change-log.md`、`.codex/plans/2026-04-27-bugs-triage-and-fix-plan.md`

### Conn 后台任务执行契约与时间戳修复
- 日期：2026-05-04
- 主题：修复 conn run 完成时间复用领取时间的问题，并加硬后台任务 workspace contract。
- 影响范围：`BackgroundAgentRunner` 现在在 session 实际完成 / 失败时记录 `finishedAt`、终态事件和输出文件索引时间；`ConnWorker` 创建任务消息和通知时优先使用 run 的 `finishedAt`。后台 prompt 也明确要求脚本 / 文件 / 浏览器类任务必须调用工具，持久产物写入 `output/`，不得在未完成工具调用时汇报成功，减少 `task_inbox` / 定时任务“嘴上执行成功”的假阳性。
- 对应入口：`src/agent/background-agent-runner.ts`、`src/workers/conn-worker.ts`、`test/background-agent-runner.test.ts`、`test/conn-worker.test.ts`、`docs/runtime-assets-conn-feishu.md`

### SearXNG 本机验收与运维口径补充
- 日期：2026-05-04
- 主题：补充 `/searx:` 显式搜索的本机验收结论、参数使用口径和阿里云出口网络限制。
- 影响范围：文档明确用户侧只需要记住 `/searx:` / `/searxng:` 前缀，脚本参数可作为高级入口；自然语言参数如果要稳定生效，需要后续显式解析，不能靠 agent 自由猜。同步记录本机 Playground 已实测可用，以及阿里云部署后搜索质量取决于服务器出口网络，Google 等不可达 engine 会失败但不应编造结果。
- 对应入口：`docs/searxng-search.md`

### SearXNG 显式搜索技能
- 日期：2026-05-04
- 主题：新增 `searxng-search` 用户技能，作为 SearXNG 试点入口，但只允许 `/searx:` / `/searxng:` 显式触发。
- 影响范围：该技能不接入 `web-access` 默认 staged router，也不从普通“搜索 / 查一下 / 最新”自然语言请求中自动触发；脚本通过 `SEARXNG_BASE_URL` / `SEARXNG_INTERNAL_BASE_URL` 调用内部 SearXNG JSON API，并在 JSON API 未启用、服务不可达或搜索源限流时明确失败。这样先验证服务器负载、结果质量和搜索源封锁情况，不把所有 agent 默认搜索流量压到同一个服务器出口 IP。
- 对应入口：`runtime/skills-user/searxng-search/SKILL.md`、`runtime/skills-user/searxng-search/scripts/searxng_search.mjs`、`test/searxng-search-skill.test.ts`

### SearXNG 内部容器试点
- 日期：2026-05-04
- 主题：为 `/searx:` 显式搜索技能补齐本地与生产 compose 的内部 SearXNG 服务。
- 影响范围：新增 `ugk-pi-searxng` 容器，默认只绑定宿主 `127.0.0.1:${SEARXNG_HOST_PORT:-48080}`，app 与 conn-worker 通过 compose 内网 `http://ugk-pi-searxng:8080` 调用；配置文件启用 `json` 输出格式，但不把 SearXNG 接入默认 `web-access` 路由，也不让主服务依赖它启动成功。`SEARXNG_SECRET`、缓存目录和内存上限写入 `.env.example`，便于生产用 shared 目录管理。
- 对应入口：`docker-compose.yml`、`docker-compose.prod.yml`、`.env.example`、`deploy/searxng/settings.yml`、`docs/searxng-search.md`、`README.md`、`test/containerization.test.ts`

### Conn Worker 事件写入崩溃防护
- 日期：2026-05-04
- 主题：修复后台 `conn-worker` 在运行中 conn/run 被删除或事件持久化失败时可能因 `FOREIGN KEY constraint failed` / 未处理 rejection 崩溃的问题。
- 影响范围：`ConnRunStore.appendEvent()` 与 `recordFile()` 现在在事务内完成 run/lease 校验和插入，已删除 run 的迟到事件会返回 `undefined` 而不是撞 SQLite 外键；`BackgroundAgentRunner` 的 session event 记录失败降级为 warning，不再杀掉当前后台任务或 worker 进程。
- 对应入口：`src/agent/conn-run-store.ts`、`src/agent/background-agent-runner.ts`、`test/conn-run-store.test.ts`、`test/background-agent-runner.test.ts`

### Playground 桌面错误提示关闭层级修复
- 日期：2026-05-04
- 主题：修复桌面端“当前 agent 仍在运行，先别切视窗。”错误提示关闭按钮无法点击的问题。
- 影响范围：`chat-stage` 的通用子元素层级规则此前会覆盖 `.error-banner` 和 `.notification-live-region` 自身的 `z-index`，导致桌面端错误提示可能被更高层工具栏区域压住。现在补充更具体的 `.chat-stage > .error-banner` / `.chat-stage > .notification-live-region` 层级规则，保留手机端现有行为。
- 对应入口：`src/ui/playground-styles.ts`、`test/server.test.ts`

### 阿里云增量更新默认走 Gitee
- 日期：2026-05-04
- 主题：将阿里云生产增量更新的默认 Git 拉取远端从 GitHub `origin` 改为 Gitee `gitee`。
- 影响范围：`scripts/server-ops.mjs` 现在按目标云选择 deploy remote：腾讯云继续 `origin`，阿里云默认 `gitee`。运维文档同步清理“阿里云优先 GitHub”的旧口径，避免发布脚本在阿里云网络上反复卡 GitHub TLS / HTTP2 问题。
- 对应入口：`scripts/server-ops.mjs`、`docs/server-ops.md`、`docs/server-ops-quick-reference.md`、`docs/aliyun-ecs-deploy.md`、`AGENTS.md`、`test/server-ops-script.test.ts`

### 自定义 Agent 运行态挂载修复
- 日期：2026-05-04
- 主题：把自定义 agent profile 运行态目录 `/app/.data/agents` 外置到 shared，避免生产容器重建后自定义 Agent 消失。
- 影响范围：生产 compose 现在通过 `UGK_AGENTS_DATA_DIR` 挂载 shared `.data/agents` 到 app / conn-worker / feishu-worker；服务器运维脚本新增 env guard 和容器内 `/app/.data/agents` 可写检查。`GET /v1/debug/runtime` 也新增 `agents data dir` 检查，避免绕过 server ops 时漏掉自定义 Agent 持久化目录。文档同步区分主 Agent 数据 `/app/.data/agent` 和自定义 agent profile 数据 `/app/.data/agents`，别再把两类状态混成一个目录。
- 对应入口：`docker-compose.prod.yml`、`.env.example`、`scripts/server-ops.mjs`、`src/config.ts`、`src/routes/runtime-debug.ts`、`docs/server-ops.md`、`AGENTS.md`、`test/containerization.test.ts`、`test/server-ops-script.test.ts`、`test/runtime-debug.test.ts`、`test/server.test.ts`

### Agent 运行态治理计划口径收口
- 日期：2026-05-04
- 主题：把运行态状态 API 化治理计划明确收口为“规范引导优先”，不宣称当前阶段已实现工具层硬拦截。
- 影响范围：计划文档现在明确：基础文件写能力不做粗暴限制；当前阶段通过规则、技能、文档测试和后续只读 diagnostics 引导 agent 避免绕 API 手写运行态底层状态。写入型 reload / repair / reconcile 入口必须更晚、更审慎，不能把“手改 JSON”换皮成危险的“HTTP repair”。
- 对应入口：`.codex/plans/2026-05-04-agent-runtime-state-api-guardrails.md`

### Chrome Tab 累积治理
- 日期：2026-05-04
- 主题：收口 `web-access` 同一 agent scope 下的 Chrome tab 累积问题。
- 影响范围：`LocalCdpBrowser` 的 `new_target` 现在会替换同一 scope 的旧默认 target；新增 `navigate_session` 行为和兼容代理 `POST /session/navigate`，人工导航优先复用 scoped default target，只有缺失时才新建。`web-access` skill 与浏览器桥文档同步改为推荐 `/session/navigate`，`close-all` 继续作为任务结束兜底。
- 对应入口：`runtime/skills-user/web-access/scripts/local-cdp-browser.mjs`、`runtime/skills-user/web-access/scripts/cdp-proxy.mjs`、`runtime/skills-user/web-access/SKILL.md`、`docs/web-access-browser-bridge.md`、`test/local-cdp-browser.test.ts`、`test/web-access-proxy.test.ts`

### Chrome Sidecar 内存防护
- 日期：2026-05-04
- 主题：为 Docker Chrome sidecar 增加容器内存上限、V8 old-space 软限制和发布验收。
- 影响范围：开发与生产 compose 的 `ugk-pi-browser` 增加 `mem_limit` / `mem_reservation`，默认 2GB / 512MB；Chrome 自动启动、healthcheck 自愈启动、GUI launcher 和 `npm run docker:chrome:restart` 路径统一使用 `--js-flags=--max-old-space-size=1536`。服务器发布脚本现在验收实际容器 `HostConfig.Memory` 和 Chrome 进程命令行，避免 compose 配置写了但线上没生效。
- 对应入口：`docker-compose.yml`、`docker-compose.prod.yml`、`.env.example`、`scripts/ensure-sidecar-chrome.sh`、`scripts/sidecar-chrome.mjs`、`scripts/server-ops.mjs`、`docs/web-access-browser-bridge.md`、`docs/server-ops.md`、`test/containerization.test.ts`、`test/server-ops-script.test.ts`

### Agent 阶段文档收口
- 日期：2026-05-04
- 主题：把后台任务执行 Agent、fallback 和能力快照边界整理成当前接手口径。
- 影响范围：README 补充后台任务支持执行 Agent 选择和可见 fallback；运行文档和 playground 当前状态明确：run 级能力快照覆盖规则文件、技能目录、执行身份和模型解析结果，但不是工具权限沙箱，底层 runtime 工具不按 agent profile 限制；fallback 文案统一改成“主 Agent”，避免继续出现“默认 Agent”这种不贴 UI 的说法。
- 对应入口：`README.md`、`AGENTS.md`、`docs/runtime-assets-conn-feishu.md`、`docs/playground-current.md`

### Agent Profile 操作接口规范
- 日期：2026-05-04
- 主题：禁止 agent 直接编辑 `.data/agents/profiles.json` 创建或修复 agent profile。
- 影响范围：`agent-profile-ops`、项目接手文档和追溯地图现在明确规定：agent profile 创建、归档和技能变更必须走 `/v1/agents` API；`profiles.json` 只能作为只读排障证据，不是操作入口。若出现 `POST /v1/agents` 报重复但 `GET /v1/agents` 看不到，按磁盘 catalog 与运行时 `AgentServiceRegistry` 分裂处理，通过 API 收口或重启服务重新加载，不允许继续手补 JSON。
- 对应入口：`.pi/skills/agent-profile-ops/SKILL.md`、`AGENTS.md`、`docs/playground-current.md`、`docs/traceability-map.md`、`test/agent-profile-ops-skill.test.ts`

### 后台任务执行 Agent 选择
- 日期：2026-05-04
- 主题：让 `conn` 后台任务可选择 Playground agent profile 作为执行 Agent，并在不可用时可见降级。
- 影响范围：`conn.profileId` 的新任务语义收口为执行 Agent id；worker 生成 run 级能力快照，使用被选 Agent 的规则文件和 scoped skills，但后台 session 不写入该 Agent 的前台会话。Agent 不存在或已归档时降级到 `main` / main-like 能力继续执行，记录 `agent_profile_fallback` 事件和 snapshot fallback 字段。Playground 后台任务编辑器新增执行 Agent 下拉，列表和 run detail 展示实际执行 Agent / fallback。
- 对应入口：`src/agent/background-agent-profile.ts`、`src/agent/background-agent-runner.ts`、`src/workers/conn-worker.ts`、`src/routes/conn-route-presenters.ts`、`src/types/api.ts`、`src/ui/playground-conn-activity.ts`、`src/ui/playground-conn-activity-controller.ts`、`test/background-agent-profile.test.ts`、`test/background-agent-runner.test.ts`、`test/conn-worker.test.ts`、`test/conn-route-presenters.test.ts`、`test/server.test.ts`、`docs/runtime-assets-conn-feishu.md`、`docs/playground-current.md`

### Agent 注册状态口径收口
- 日期：2026-05-04
- 主题：澄清 agent profile 的运行时注册状态与 `profiles.json` 自定义记录不是一回事。
- 影响范围：文档和 `agent-profile-ops` 现在明确要求：判断 agent 是否当前注册可用只看 `GET /v1/agents`；`.data/agents/profiles.json` 只记录用户创建的自定义 agent profile，不是完整运行时注册表。`main` 和默认 `search` 可能来自代码内置 profile，不能因为 `profiles.json` 没有记录就标成未注册；只有目录存在但 `/v1/agents` 不返回时，才说明当前运行时不可用或已归档。
- 对应入口：`AGENTS.md`、`.pi/skills/agent-profile-ops/SKILL.md`、`docs/playground-current.md`、`docs/traceability-map.md`

### Agent 操作台技能管理
- 日期：2026-05-04
- 主题：把其他 agent profile 的技能复制安装 / 删除补进后端接口和 Playground 操作台。
- 影响范围：新增 `POST /v1/agents/:agentId/skills`，只允许把主 Agent 当前已有且来源明确的技能复制到目标 agent 的 `.data/agents/<agentId>/user-skills`；新增 `DELETE /v1/agents/:agentId/skills/:skillName`，只删除目标 agent 自己目录里的非基础技能，拒绝通过该接口管理 `main`，并保护 `agent-skill-ops`、`agent-runtime-ops`、`agent-filesystem-ops` 三件套。Agent 操作台的技能透明视图现在对非主 Agent 展示可复制安装下拉和技能删除按钮，所有修改动作继续走确认弹窗；主 Agent 在该页只展示技能，不提供修改入口。
- 对应入口：`src/agent/agent-profile-catalog.ts`、`src/routes/chat.ts`、`src/ui/playground-agent-manager.ts`、`src/ui/playground.ts`、`.pi/skills/agent-profile-ops/SKILL.md`、`test/agent-profile-catalog.test.ts`、`test/chat-agent-routes.test.ts`、`docs/playground-current.md`

### Agent 创建失败收口
- 日期：2026-05-04
- 主题：修复 Agent 创建时初始技能校验和归档 ID 复用的边界问题。
- 影响范围：`POST /v1/agents` 现在会先确认所有 `initialSystemSkillNames` 都能从主 Agent 当前技能目录复制，再创建目标 agent 运行目录；技能查找同时支持直接目录和嵌套 `SKILL.md` 的 `name` 元数据，避免 `brainstorming` 这类嵌套系统技能在 UI 可见但创建时复制失败。如果技能缺失，返回 400 且不会留下半截 `.data/agents/<agentId>` 目录。复用曾经归档过的 `agentId` 时，会从 `archivedAgentIds` 中移除该 id，避免接口返回成功但 `/v1/agents` 列表过滤掉新 agent。
- 对应入口：`src/agent/agent-profile-catalog.ts`、`test/agent-profile-catalog.test.ts`

### Playground Agent 默认 Karpathy 规则
- 日期：2026-05-04
- 主题：让每个 agent 的默认 `AGENTS.md` 都携带 Karpathy Guidelines。
- 影响范围：主 Agent 默认运行态规则模板新增 Karpathy Guidelines；非主 Agent 模板保持已有 Karpathy Guidelines。当前本地 `.data/agent/AGENTS.md` 已同步补齐，后续新建 agent 和首次生成主 Agent 运行规则时都会默认包含这段行为纪律。
- 对应入口：`src/agent/agent-profile-bootstrap.ts`、`.data/agent/AGENTS.md`、`test/agent-profile-bootstrap.test.ts`、`docs/playground-current.md`

### Playground Agent 运行规则隔离
- 日期：2026-05-04
- 主题：将 Playground agent session 的 `AGENTS.md` 从仓库根项目接手文档中拆出，改为每个 agent profile 使用自己的运行态规则文件。
- 影响范围：`DefaultResourceLoader` 的 `agentsFilesOverride` 不再追加仓库根 `AGENTS.md`，而是只注入当前 agent 的运行态规则文件；主 Agent 默认规则文件改为 `.data/agent/AGENTS.md`，其他 agent 继续使用 `.data/agents/<agentId>/AGENTS.md`。旧 `.data/agent/AGENTS.local.md` 仅作为主 Agent 首次生成运行态规则时的迁移来源。Agent 管理页读取 / 保存主 Agent 规则时也指向运行态文件，不再读写仓库根 `AGENTS.md`。
- 对应入口：`src/agent/agent-session-factory.ts`、`src/agent/agent-profile.ts`、`src/agent/agent-profile-bootstrap.ts`、`src/routes/chat.ts`、`test/agent-session-factory.test.ts`、`test/agent-profile.test.ts`、`test/agent-profile-bootstrap.test.ts`、`test/chat-agent-routes.test.ts`、`docs/playground-current.md`

## 2026-05-03

### Playground Agent 管理界面
- 日期：2026-05-03
- 主题：新增 Playground 内的 Agent 操作台，并补齐 agent profile summary 更新接口。
- 影响范围：当前 Agent 标签升级为 Agent 操作台入口，独立 `Agent 管理` 按钮和手机更多菜单项不再展示；操作台在桌面端占据对话区工作画布，移动端保持全屏工作页。页面展示包括主 Agent 在内的全部操作视窗：主 Agent 可查看、可切换但不可编辑 / 删除，其他 agent profile 支持新建、编辑名称 / 描述、查看 scoped 技能、查看 `AGENTS.md`、切换和删除。右侧详情改为上方一行 `AGENTS.md` 规则文件卡片，点击后用独立弹窗完整阅读、编辑和保存；下半部分固定展示技能透明视图，避免规则文件和技能列表被压成过小窗口。新建 Agent 改为右侧完整创建页，自动生成 `agentId`，由用户填写名称和用途描述，实时预览将生成的 `AGENTS.md`，三件套基础技能天然内置，额外初始系统技能只能从主 Agent 当前已有技能中勾选并随 `POST /v1/agents` 的 `initialSystemSkillNames` 复制到目标 agent 系统技能目录。后端新增 `PATCH /v1/agents/:agentId`，允许更新非主 Agent 的显示名称和描述；新增 `GET /v1/agents/:agentId/rules` / `PATCH /v1/agents/:agentId/rules` 用于读取和保存对应规则文件；删除仍复用 `POST /v1/agents/:agentId/archive` 归档运行目录。桌面 workspace 新增 `agents` 模式。
- 对应入口：`src/agent/agent-profile.ts`、`src/agent/agent-profile-catalog.ts`、`src/agent/agent-service-registry.ts`、`src/routes/chat.ts`、`src/ui/playground-agent-manager.ts`、`src/ui/playground.ts`、`src/ui/playground-page-shell.ts`、`src/ui/playground-workspace-controller.ts`、`src/ui/playground-styles.ts`、`test/chat-agent-routes.test.ts`、`test/playground-agent-switch.test.ts`、`docs/playground-current.md`

### Agent Profile 元操作接口
- 日期：2026-05-03
- 主题：补齐主 Agent 管理独立 agent profile 的第一版元操作能力，新增 `agent-profile-ops` 系统技能和创建 / 归档接口。
- 影响范围：新增 `.pi/skills/agent-profile-ops`，用于指导主 Agent 查看、创建、配置、切换、验证和归档 agent profile；新增运行态 catalog `.data/agents/profiles.json`，自定义 agent 创建后写入独立 `.data/agents/:agentId` 目录；`POST /v1/agents` 创建 agent，`POST /v1/agents/:agentId/archive` 归档 agent，归档前拒绝运行中的 agent 且禁止归档 `main`；`AgentServiceRegistry` 支持运行时增删 profile。
- 对应入口：`src/agent/agent-profile.ts`、`src/agent/agent-profile-bootstrap.ts`、`src/agent/agent-profile-catalog.ts`、`src/agent/agent-service-registry.ts`、`src/routes/chat.ts`、`src/server.ts`、`.pi/skills/agent-profile-ops/SKILL.md`、`test/agent-profile-catalog.test.ts`、`test/chat-agent-routes.test.ts`、`docs/playground-current.md`
- 补充：`agent-profile-ops` 的技能安装边界收紧为“主 Agent 只能给其他 agent profile 复制安装主 Agent 当前已有且来源明确的技能”；主 Agent 没有的技能不能代装、不能外部下载、不能替其他 agent profile 新建业务技能，用户需要时应切换到目标 agent 自己操作。
- 补充：术语上避免把 agent profile / 操作视窗叫“子 Agent”，以免和 `.pi/agents` legacy subagent 混淆；文档中统一使用“其他 agent profile / 目标 agent / 操作视窗”。
- 补充：修正“我有哪些 agent”这类中文短句的默认语义：默认指 `/v1/agents` 的独立 agent profile / 操作视窗，不是 `.pi/agents` legacy subagent；只有用户明确说 subagent、`scout/planner/worker/reviewer` 或派发子任务时才进入 subagent 文件。
- 补充：agent profile 生命周期动作统一加确认门槛；创建、配置、技能复制安装、归档、删除或可能改变当前操作视窗前，主 Agent 必须说明影响并询问用户确认，不能自作主张继续执行，也不能声称能替用户切换 UI 激活 agent。

### Playground Agent 切换刷新保持
- 日期：2026-05-03
- 主题：修复桌面端切到搜索 Agent 后刷新页面又回到主 Agent 的问题。
- 影响范围：当前激活 agent 写入浏览器 `localStorage` 的 `ugk-pi:active-agent-id`；页面初始化时优先读取该值，agent catalog 加载后如果保存的 agent 已不存在则回退 `main`。左侧设置菜单的切换控件和 topbar 当前 agent 标签保持同步。
- 对应入口：`src/ui/playground.ts`、`test/playground-agent-switch.test.ts`、`docs/playground-current.md`

## 2026-05-02

### Search Agent MVP 底座
- 日期：2026-05-02
- 主题：新增单进程多 agent profile 的第一版底座，内置 `main` 与 `search` 两个 agent，并提供 agent-scoped chat/debug API。
- 影响范围：`main` 继续兼容旧 `/v1/chat/*` 与 `/v1/debug/skills`；新增 `/v1/agents`、`/v1/agents/:agentId/debug/skills` 和 `/v1/agents/:agentId/chat/*`。`search` 使用独立 `.data/agents/search`、独立 session / conversation index / workspace / `AGENTS.md` / skills 目录，技能可见性只来自自身 `allowedSkillPaths`。Playground 桌面端新增 agent 选择器，当前会话、历史、发送、运行日志和查看技能会随当前 agent 切换。
- 对应入口：`src/agent/agent-profile.ts`、`src/agent/agent-profile-bootstrap.ts`、`src/agent/agent-service-registry.ts`、`src/server.ts`、`src/routes/chat.ts`、`src/ui/playground.ts`、`src/ui/playground-page-shell.ts`、`src/ui/playground-conversation-api-controller.ts`、`src/ui/playground-conversations-controller.ts`、`src/ui/playground-stream-controller.ts`、`src/ui/playground-transcript-renderer.ts`、`src/ui/playground-process-controller.ts`、`test/agent-profile.test.ts`、`test/agent-profile-bootstrap.test.ts`、`test/agent-service-registry.test.ts`、`test/chat-agent-routes.test.ts`、`test/search-agent-skills.test.ts`、`test/playground-agent-switch.test.ts`
- 补充：搜索 Agent 的默认 `AGENTS.md` 现在明确要求“你有哪些技能”只以 `GET /v1/agents/search/debug/skills` 为事实源；当 scoped 技能清单为空时必须回答未加载技能，禁止从主 Agent、项目文档或历史记忆中推断技能。
- 补充：非主 agent profile 的技能目录改为仿照主 Agent 的两层结构：`.data/agents/{agentId}/pi/skills` 存放该 agent 的系统技能，`.data/agents/{agentId}/user-skills` 存放该 agent 的用户技能；`search` 默认系统技能中加入最小 `agent-skill-ops`，用于约束技能查询、来源解释和安装/创建技能时的目录边界。
- 补充：搜索 Agent 的默认 `AGENTS.md` 直接嵌入 `forrestchang/andrej-karpathy-skills` 的 Karpathy Guidelines 原文结构与关键句，并保留来源 / MIT License 标记；作为后续新 agent 模板的最小行为底座。
- 补充：默认非主 agent profile 系统技能扩展为三件套：`agent-skill-ops`、`agent-runtime-ops`、`agent-filesystem-ops`。三者分别负责技能事实源、运行时状态确认和文件操作边界，仍不默认携带搜索、邮件、浏览器等业务技能。
- 补充：Playground 桌面端 agent 切换入口从 topbar 挪到左侧会话 rail 底部“设置”菜单；topbar 右侧上下文按钮左侧新增当前激活 agent 标签；当前激活 agent 写入浏览器 `localStorage` 的 `ugk-pi:active-agent-id`，刷新后继续保持，若保存的 agent 不在 catalog 中则回退 `main`。

### AGENTS.md 合并 Karpathy 行为准则
- 日期：2026-05-02
- 主题：将 Karpathy 四条编码行为准则（Think Before Coding / Simplicity First / Surgical Changes / Goal-Driven Execution）合并到 AGENTS.md 作为第 2 节。保留原有通信准则、最高准则、项目边界、场景索引、关键路径、固定运行口径和当前稳定事实。
- 影响范围：AGENTS.md 结构调整，编号重排。Karpathy 四条作为最高级别的编码行为规范优先呈现，项目运行规则紧随其后。
- 对应入口：`/app/AGENTS.md`

### github-search 检索技能
- 日期：2026-05-02
- 主题：新增 `github-search` 技能，通过 GitHub REST API 实现仓库搜索、仓库信息（README/Releases/License/Contributors）、Issues/PRs 搜索、代码搜索、Trending、用户/组织信息六大功能。支持自然语言触发和显式命令 `/github:...` 触发。
- 影响范围：新增技能只负责 GitHub 数据检索，不接管其他网站搜索、登录交互或页面操作。代码搜索需要 GITHUB_TOKEN 认证，其他功能在无 Token 时也可正常工作。
- 对应入口：`runtime/skills-user/github-search/SKILL.md`、`runtime/skills-user/github-search/scripts/github_search.py`、`runtime/skills-user/github-search/evals/evals.json`

### 站点专项搜索技能设计元技能
- 日期：2026-05-02
- 主题：新增 `site-search-skill-designer` 元技能，用于在用户明确要求“为某个网站设计专项搜索 / 查询技能”时，指导 agent 产出窄触发的站点技能设计，而不是直接执行搜索。
- 影响范围：新增技能只覆盖技能设计场景，不接管普通网页搜索、GitHub 查询、知乎热榜、Reddit / X 等实际检索任务；技能内明确 API / 静态请求 / Jina / 页面内 fetch / CDP 的访问策略选择、证据门槛、fallback 条件和 GitHub / 知乎 / Reddit / 小红书示例。补充回归测试锁住“元技能、窄触发、非实际搜索”的边界。
- 对应入口：`.pi/skills/site-search-skill-designer/SKILL.md`、`test/site-search-skill-designer.test.ts`

## 2026-05-01

### web-access 富文本键盘输入端点
- 日期：2026-05-01
- 主题：为 web-access 兼容代理新增通用键盘输入能力，支撑 ProseMirror / Draft.js 多行富文本按真实键盘事件创建段落。
- 影响范围：新增 `POST /key?target=<id>&key=<key>` 与 `POST /enter?target=<id>`，底层通过 CDP `Input.dispatchKeyEvent` 发送 `keyDown/keyUp`，并保留 `press_enter` 兼容 action；`/type` 继续只负责 `Input.insertText`。小红书多页文字配图这类调用方应按“聚焦编辑器 -> 清空 -> 分行 `/type` -> 行间 `/enter`”接入，不再依赖 `execCommand('insertHTML')` 拼 `<p>`。
- 对应入口：`runtime/skills-user/web-access/scripts/cdp-proxy.mjs`、`runtime/skills-user/web-access/scripts/local-cdp-browser.mjs`、`runtime/skills-user/web-access/SKILL.md`、`docs/web-access-browser-bridge.md`、`test/web-access-proxy.test.ts`、`test/local-cdp-browser.test.ts`

### Pi session 默认模型读取与 DeepSeek Pro 误用修复
- 日期：2026-05-01
- 主题：修复 `.pi/settings.json` 含注释时 `/v1/model-config` 显示 Flash 但真实 Pi session 退回 `deepseek-v4-pro` 的运行态分裂问题。
- 影响范围：前台 chat session 创建时现在显式使用项目侧 JSONC 兼容设置解析生成 `SettingsManager`，并把当前项目默认模型作为显式 session model 传入，避免上游严格 `JSON.parse` 因注释忽略整份设置后选择高价 Pro 兜底，也避免旧会话继续恢复历史 Pro 快照；仓库版 `.pi/settings.json` 同步改回严格 JSON，减少生产配置踩雷面。后台 conn / subagent 仍按既有项目默认模型解析链路工作。
- 对应入口：`.pi/settings.json`、`src/agent/agent-session-factory.ts`、`src/agent/settings-json.ts`、`test/agent-session-factory.test.ts`

### DeepSeek provider 恢复 Flash
- 日期：2026-05-01
- 主题：按已调通的 pi 配置把 DeepSeek provider 从历史 `deepseek-anthropic` 迁移为 `deepseek`，恢复 `deepseek-v4-flash`，并同步校正 `deepseek-v4-pro` 参数。
- 影响范围：`runtime/pi-agent/models.json` 中 DeepSeek 现在走 `https://api.deepseek.com` + `openai-completions`，Pro / Flash 均登记 `contextWindow=1000000`、`maxTokens=384000`，并带 DeepSeek reasoning `compat` 配置；`.pi/settings.json` 当前默认选择更新为 `deepseek/deepseek-v4-flash`。后台 worker 保留旧 `deepseek-anthropic` 快照迁移，旧 Pro 指向新 Pro，旧 Flash 指向恢复后的新 Flash。
- 对应入口：`runtime/pi-agent/models.json`、`.pi/settings.json`、`src/workers/conn-worker.ts`、`test/model-config.test.ts`、`test/agent-session-factory.test.ts`、`test/conn-worker.test.ts`、`test/server.test.ts`、`docs/model-providers.md`、`docs/runtime-assets-conn-feishu.md`

### Playground 上下文入口恢复
- 日期：2026-05-01
- 主题：修复桌面 topbar 收口后 `.topbar-context-slot` 被基础样式隐藏，导致上下文用量按钮不可见的问题。
- 影响范围：桌面端恢复 topbar 右侧上下文电池入口；手机端复用同一个上下文入口并在移动断点定位到状态栏右侧，不再把 `.landing-side-right > .topbar-context-slot` 隐藏，也移除隐藏模板里的重复按钮壳，避免同功能入口“看似有两份、实际一份都不能用”的抽象事故。
- 对应入口：`src/ui/playground-page-shell.ts`、`src/ui/playground-styles.ts`、`test/playground-styles.test.ts`、`test/server.test.ts`、`docs/playground-current.md`

### Playground topbar 与上传入口收口
- 日期：2026-05-01
- 主题：将桌面 topbar 收口为纯页面切换导航，上传文件入口移动到 composer 左侧，移除可见技能按钮。
- 影响范围：桌面 topbar 顺序固定为 `新会话`、`文件库`、`后台任务`、`消息`；原 `项目文件` 文案改为 `文件库`，原 `任务消息` 顶栏文案改为 `消息`；原文件 hover 菜单、桌面技能按钮和移动端技能菜单项下线；`file-picker-action` 保留真实上传行为但改为 composer 左侧 `+` 按钮，不再占用 topbar。上传按钮图标使用居中 CSS mask，composer 聚焦高亮改为内部 ring，避免被贴底输入框的裁切吃掉。外部化 playground runtime 会在 factory `sourceHash` 变化时自动同步 `index.html`、`styles.css`、`app.js` 和 manifest，避免只重启容器仍吃旧 runtime 文件；已存在的 runtime 扩展覆盖文件不被自动覆盖。
- 对应入口：`src/ui/playground-page-shell.ts`、`src/ui/playground.ts`、`src/ui/playground-mobile-shell-controller.ts`、`src/ui/playground-assets-controller.ts`、`src/ui/playground-status-controller.ts`、`src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`、`src/ui/playground-externalized.ts`、`test/server.test.ts`、`docs/playground-current.md`

## 2026-04-30

### Playground 桌面右侧布局贴边收口
- 日期：2026-04-30
- 主题：按“页面只保留外层统一 padding”的口径收口桌面布局，移除右侧 `topbar`、`chat-stage` 和底部 `command-deck` 的二次内缩，并增加页面外边距与左右栏间距。
- 影响范围：左侧会话栏继续上下占满外层 padding 内可用高度；右侧 topbar 贴住工作列顶部和右边界，chat stage 不再叠加内部 padding，active 对话消息列从背景框顶部开始占满，底部 composer 通过 `command-deck` 贴住右侧工作列底边；topbar 工具条改为扁平纯色承载面，深浅主题都不再使用渐变浮层；深色 `chat-stage` 去掉边框和渐变背景，仅保留 `4px` 裁切圆角，`#transcript` 和贴底 `command-deck` / composer 同步裁切底部圆角。移动端全屏布局不变。
- 对应入口：`src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`

### Playground 桌面文件菜单状态修复
- 日期：2026-04-30
- 主题：修复桌面端 `topbar` 文件菜单 hover 穿过间隙即关闭、点击打开后因焦点状态无法自动消失的问题。
- 影响范围：文件菜单改为 `data-open` / `aria-expanded` 驱动，由前端脚本统一处理 hover 打开、点击切换、外部点击关闭和 `Escape` 关闭；上传文件和项目文件入口点击后会主动收起菜单。移动端更多菜单不受影响。
- 对应入口：`src/ui/playground-page-shell.ts`、`src/ui/playground.ts`、`src/ui/playground-styles.ts`、`src/ui/playground-assets-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`

### Playground 桌面主工作区切换
- 日期：2026-04-30
- 主题：将桌面端 `项目文件`、`后台任务`、`任务消息` 收口为 `chat-stage` 内的 workspace mode，由专用 workspace controller 统一处理视图模式、按钮激活态、桌面 / 移动分流和面板放置。
- 影响范围：桌面端点击三个入口时主工作画布切换为对应工作页，再次点击或返回按钮回到对话；移动端继续保留既有全屏工作页，资产、任务消息和后台任务仍复用原控制器与加载函数，不新增简化列表。`conn-editor`、run detail、确认框和设置弹窗仍作为二级 modal。
- 对应入口：`src/ui/playground-workspace-controller.ts`、`src/ui/playground.ts`、`src/ui/playground-page-shell.ts`、`src/ui/playground-styles.ts`、`src/ui/playground-assets-controller.ts`、`src/ui/playground-task-inbox.ts`、`src/ui/playground-conn-activity-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`

### Playground UI 细节修复
- 日期：2026-04-30
- 主题：修复 composer textarea 与外框背景色差、桌面端 markdown 表格长文本不换行、浅色主题代码块 toolbar / language 背景不一致，以及桌面 chat stage 上下文用量按钮位置漂移。
- 影响范围：影响 playground 桌面端消息渲染、代码块浅色主题展示、composer 输入区和 topbar 上下文用量入口；手机端既有 topbar 与 composer 覆盖规则保持独立，不改后台任务、聊天接口或会话状态逻辑。补充页面输出断言锁住这些 CSS 约束。
- 对应入口：`src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`、`test/server.test.ts`

### 项目级 subagent 使用技能
- 日期：2026-04-30
- 主题：新增项目级 `subagent-usage` skill，明确 `worker`、`scout`、`planner`、`reviewer` 四类子代理的用途、single / parallel / chain 调用场景，以及禁止使用不存在的 `default` 子代理。
- 影响范围：影响前台 chat agent 与后台 conn agent 在触发 subagent、并行分派、多平台检索、链式实现 / 评审时的默认指引；不改变 `subagent` 扩展参数、子代理定义或执行实现。补充测试确保该 skill 会被项目白名单加载。
- 对应入口：`.pi/skills/subagent-usage/SKILL.md`、`test/agent-session-factory.test.ts`

### 后台任务恢复项目级扩展加载
- 日期：2026-04-30
- 主题：修复后台 conn 任务创建 agent session 时用运行 workspace 作为 ResourceLoader 项目根的问题。后台任务现在仍在隔离 workspace 中执行命令，但扩展、项目 settings 和项目级工具加载回到真实项目根，避免 `subagent`、`conn`、`send_file`、`asset_store` 和 `project_guard` 在后台任务中缺失。
- 影响范围：影响 `conn-worker` 创建的后台 agent session 可用工具清单；不改变后台任务执行目录、workspace 隔离、模型选择、skill 白名单或 run 存储结构。新增回归测试覆盖“workspace 没有 `.pi/settings.json` 时仍加载项目扩展”的场景。
- 对应入口：`src/workers/conn-worker.ts`、`test/conn-worker.test.ts`

### 双云 SSH alias 接手口径固化
- 日期：2026-04-30
- 主题：补齐阿里云无密码 SSH key alias，并把双云标准登录入口写入运维文档；后续腾讯云统一使用 `ugk-claw-prod`，阿里云统一使用 `ugk-claw-aliyun`，`server:ops` 脚本不再裸连 IP 触发密码交互。
- 影响范围：影响生产服务器接手、`npm run server:ops -- <tencent|aliyun> <preflight|deploy|verify>` 的 SSH 连接方式，以及阿里云密码文件的长期使用口径；`ssh-key.txt`、`*-config.txt` 这类本地密码文件不应提交，也不应作为默认运维入口。
- 对应入口：`scripts/server-ops.mjs`、`docs/server-ops.md`、`docs/server-ops-quick-reference.md`、`docs/aliyun-ecs-deploy.md`

### 模型默认配置读取忽略注释残留
- 日期：2026-04-30
- 主题：修复 `.pi/settings.json` 中已注释或删除的 `defaultProvider` / `defaultModel` 文本仍被正则读取的问题，避免下架后的 `deepseek-v4-flash` 这类残留字符串在模型设置弹窗、subagent 默认模型或后台任务默认模型链路中被误当成有效配置。
- 影响范围：`/v1/model-config`、`resolveProjectDefaultModelContext()`、subagent 默认 provider/model 继承、后台 conn 未显式指定任务级模型时的项目默认模型解析；保存默认模型时只替换真实 JSON 属性，不再改写注释里的旧字段。后台 worker 对历史 `deepseek-v4-flash` 快照迁移到 `deepseek-v4-pro` 的兼容 alias 保持不变。
- 对应入口：`src/agent/settings-json.ts`、`src/agent/model-config.ts`、`src/agent/agent-session-factory.ts`、`test/model-config.test.ts`、`test/agent-session-factory.test.ts`

### 文档决策树补齐 runtime debug 入口
- 日期：2026-04-30
- 主题：把 `GET /v1/debug/runtime` 补入最高规则、README、追溯地图和 server ops 文档，让运行态挂载与公开配置排查有统一入口。
- 影响范围：文档层面明确 `/healthz` 只证明进程存活，运行态边界看 `/v1/debug/runtime`；云端发布仍以 `server:ops` 为默认入口，单云长手册继续作为深度排障材料。
- 对应入口：`AGENTS.md`、`README.md`、`docs/server-ops.md`、`docs/server-ops-quick-reference.md`、`docs/traceability-map.md`

### Playground 恢复链路回归测试补强
- 日期：2026-04-30
- 主题：补强 playground 刷新恢复、历史分页和 active run 续订相关回归断言，锁住同会话同 state signature 不重绘、用户离底阅读不强制滚动、历史 prepend 不清空现有消息，以及 active run 文案继续使用“当前正在运行”。
- 影响范围：本次只补测试，不改变 playground 运行逻辑；后续如果有人把恢复链路改回全量重绘、强制滚底或旧“上一轮仍在运行”文案，测试会直接拦住。
- 对应入口：`test/playground-conversation-state-controller.test.ts`、`test/playground-history-pagination-controller.test.ts`、`test/playground-conversation-sync-controller.test.ts`、`test/server.test.ts`

### 运行时诊断接口与发布验收接入
- 日期：2026-04-30
- 主题：新增只读 `GET /v1/debug/runtime`，并把它接入 `npm run server:ops -- <tencent|aliyun> <preflight|deploy|verify>` 的固定验收链路。
- 影响范围：接口会检查 agent data、session、skills、conn SQLite 等运行态目录，并只返回 `PUBLIC_BASE_URL`、`WEB_ACCESS_BROWSER_PROVIDER`、`WEB_ACCESS_BROWSER_PUBLIC_BASE_URL` 这类非敏感公开配置；`server:ops` 会打印 runtime debug 的 `ok` 与 failed check 名称，任一检查失败就中止验收。
- 对应入口：`src/routes/runtime-debug.ts`、`src/server.ts`、`src/types/api.ts`、`scripts/server-ops.mjs`、`test/runtime-debug.test.ts`、`test/server-ops-script.test.ts`、`README.md`、`docs/server-ops.md`、`docs/server-ops-quick-reference.md`、`docs/traceability-map.md`

### 服务器运维脚本硬闸门加固
- 日期：2026-04-30
- 主题：强化 `npm run server:ops -- <tencent|aliyun> <preflight|deploy|verify>` 的生产发布检查，把 shared agent data、容器内 agent data 挂载、direct CDP provider 和 sidecar CDP 探针纳入固定闸门。
- 影响范围：`server:ops` 现在除原有 Git clean、compose config、内外网 `/healthz`、skills 清单和 `/v1/debug/skills` 外，还会检查 `UGK_AGENT_DATA_DIR` 是否指向 shared `.data/agent`、`/app/.data/agent` 是否可写、`WEB_ACCESS_BROWSER_PROVIDER` 是否为 `direct_cdp`，以及 `ugk-pi-browser` 本机 `9222` 和 app 容器到 `172.31.250.10:9223` 的 CDP 连通性；deploy 后仍固定重启 nginx。
- 对应入口：`scripts/server-ops.mjs`、`test/server-ops-script.test.ts`、`docs/server-ops.md`、`docs/server-ops-quick-reference.md`

### 文档入口去噪与历史快照降级
- 日期：2026-04-30
- 主题：整理项目文档入口，把当前运维入口收口到 `docs/server-ops.md`，将 `docs/handoff-current.md` 和 `docs/playground-runtime-refactor-summary-2026-04-22.md` 明确标记为历史快照，避免后续 agent 把过期交接事实、archive 发布记录或旧 playground runtime 总结当作当前指令。
- 影响范围：README 文档导航、追溯地图、腾讯云 / 阿里云长部署手册顶部说明与历史发布记录提示；不删除历史记录，只把“当前入口”和“历史备查”分开。
- 对应入口：`README.md`、`docs/handoff-current.md`、`docs/playground-runtime-refactor-summary-2026-04-22.md`、`docs/traceability-map.md`、`docs/tencent-cloud-singapore-deploy.md`、`docs/aliyun-ecs-deploy.md`

### 双云服务器运维入口与脚本收口
- 日期：2026-04-30
- 主题：新增服务器更新唯一入口文档与双云运维脚本，把 preflight / deploy / verify 固化为可重复命令，避免每次从历史聊天或部署手册里复制命令导致漏检 shared skills、nginx 重启或远端脏工作树。
- 影响范围：新增 `npm run server:ops -- <tencent|aliyun> <preflight|deploy|verify>`；脚本会检查远端 Git 状态、`UGK_RUNTIME_SKILLS_USER_DIR`、compose config、内外网健康检查、容器技能清单和 `/v1/debug/skills`，deploy 时只允许 clean Git fast-forward 后重建并重启 nginx。
- 对应入口：`scripts/server-ops.mjs`、`docs/server-ops.md`、`package.json`、`test/server-ops-script.test.ts`

### 生产用户技能目录外置到 shared
- 日期：2026-04-30
- 主题：修复腾讯云 clean Git 工作目录下用户技能丢失的部署隐患。`runtime/skills-user/*` 在主仓库中大多被 `.gitignore` 忽略，只有少数技能被跟踪；如果生产继续把 repo 内目录直接 bind 到 `/app/runtime/skills-user`，clean checkout 或目录替换会把本地安装的 user skills 清掉。
- 影响范围：`docker-compose.prod.yml` 新增 `UGK_RUNTIME_SKILLS_USER_DIR` 挂载源配置，生产可将用户技能放到 `~/ugk-claw-shared/runtime/skills-user` 或 `/root/ugk-claw-shared/runtime/skills-user`；`.env.example`、`AGENTS.md` 与服务器运维速查同步说明恢复和验收口径。
- 对应入口：`docker-compose.prod.yml`、`.env.example`、`AGENTS.md`、`docs/server-ops-quick-reference.md`

### 双云生产环境增量更新到 `61ab0e9`
- 日期：2026-04-30
- 主题：将 GitHub / Gitee `main` 与腾讯云、阿里云生产环境增量更新到 `61ab0e9`，包含 `pi-coding-agent@0.70.6`、后台任务模型选择、任务消息执行模型展示，以及 `web-access` scope cache 正式入库。
- 影响范围：两台服务器均通过 Git fast-forward 和 `docker compose ... up --build -d` 重建 `ugk-pi`、`conn-worker`、`feishu-worker`；阿里云先把生产现场的 `web-access` scope cache 热修保存为 `stash@{0}: pre-61ab0e9-web-access-scope-cache-hotfix` 后再拉取正式提交。发布后因 app 容器重建导致 nginx upstream 旧 IP，已通过重启 nginx 恢复公网 `/healthz`。
- 对应入口：`docs/server-ops-quick-reference.md`、`docs/runtime-assets-conn-feishu.md`、`docs/web-access-browser-bridge.md`

### web-access scope cache 正式入库
- 日期：2026-04-30
- 主题：将阿里云生产环境里的 `web-access` scope target cache 热修正式收回仓库，避免后续增量发布时因为服务器工作区脏改被阻断，也避免重建镜像后丢失浏览器 scope 清理能力。
- 影响范围：`LocalCdpBrowser` 会把 scoped targets 与 default targets best-effort 持久化到 `WEB_ACCESS_SCOPE_CACHE_PATH`，默认 `/app/.data/browser-scope-cache.json`；兼容代理或 app 容器短暂重启后，`close_scope_targets` 仍可按 agent scope 清理上一实例登记过的页面。缓存损坏或写入失败只降级为内存态，不影响当前浏览器操作。
- 对应入口：`runtime/skills-user/web-access/scripts/local-cdp-browser.mjs`、`test/local-cdp-browser.test.ts`、`docs/web-access-browser-bridge.md`

### pi-coding-agent 升级到 0.70.6
- 日期：2026-04-30
- 主题：将 `@mariozechner/pi-coding-agent` 从 `0.67.6` 升级到 `0.70.6`，获取上游 DeepSeek V4 provider 与 session replay 兼容修复，包括 DeepSeek thinking 控制参数和工具调用后 assistant `reasoning_content` 回放。
- 影响范围：影响前台 Web agent、飞书转发到 Web agent 的会话、subagent CLI 入口以及后台 conn worker 创建的 agent session；升级适配了新版本 `SettingsManager.create(cwd)` 签名和 `DefaultResourceLoader` 必填 `agentDir`。本次不再自行仿写 DeepSeek 请求补丁，避免和上游协议适配打架。
- 对应入口：`package.json`、`package-lock.json`、`.pi/extensions/project-guard.ts`、`src/agent/agent-session-factory.ts`、`docs/runtime-assets-conn-feishu.md`

### 后台任务模型选择旧入口清理
- 日期：2026-04-30
- 主题：清理任务级模型选择上线后的旧入口残留：后台任务创建 / 编辑弹窗不再显示 `modelPolicyId` 手写框，`.pi/extensions/conn` 工具补齐 `modelProvider / modelId` 参数与摘要展示，避免 agent 工具创建任务时绕过新的模型选择机制。
- 影响范围：影响 playground 后台任务编辑器、conn 扩展工具创建 / 更新任务时可传递的模型字段，以及相关文档说明；底层 `modelPolicyId`、`model.default` 和 DeepSeek Flash 历史 alias 仍保留为旧任务兼容链路，不作为用户可见主路径。同步清理桌面浮层残留 `box-shadow`，让“无显性阴影”测试口径和当前 UI 约束重新对齐。
- 对应入口：`src/ui/playground-conn-activity.ts`、`src/ui/playground-conn-activity-controller.ts`、`src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`、`.pi/extensions/conn/index.ts`、`test/server.test.ts`、`docs/playground-current.md`、`docs/runtime-assets-conn-feishu.md`

### 任务消息显示后台任务实际执行模型
- 日期：2026-04-30
- 主题：后台任务完成、失败或取消后，任务消息页的 activity 正文开头显示 `执行模型：provider / model`，便于直接确认该 run 实际使用的模型。
- 影响范围：影响 conn-worker 写入 `agent_activity_items.text` 的内容，以及飞书任务通知中引用同一 activity 正文的展示；模型信息来自 run 的 `resolvedSnapshot.provider/model`，没有 snapshot 的异常 run 不臆造模型。
- 对应入口：`src/workers/conn-worker.ts`、`test/conn-worker.test.ts`、`docs/runtime-assets-conn-feishu.md`

### 后台任务支持任务级模型选择
- 日期：2026-04-30
- 主题：后台任务创建 / 编辑界面新增 API 源与模型下拉选择，复用前台 `/v1/model-config` 的 provider / model 列表，不再让用户手写模型策略 ID，也不再依赖前台 app 容器与 conn-worker 容器同步 `.pi/settings.json`。
- 影响范围：`conns` 表新增 `model_provider / model_id` 字段；`POST /v1/conns`、`PATCH /v1/conns/:connId` 和 `GET /v1/conns` 会透传任务级 `modelProvider / modelId`；后台 run 解析 snapshot 时优先使用任务级模型，其次才使用 `modelPolicyId` 策略和项目默认模型。已存在旧任务未编辑前继续走原有回退链路，新建和编辑保存后的任务会固定使用界面选择的模型。
- 对应入口：`src/agent/conn-db.ts`、`src/agent/conn-sqlite-store.ts`、`src/agent/background-agent-profile.ts`、`src/agent/background-agent-runner.ts`、`src/routes/conns.ts`、`src/ui/playground-conn-activity.ts`、`src/ui/playground-conn-activity-controller.ts`

### 双云生产环境增量更新到 `4dad21c`
- 日期：2026-04-30
- 主题：把腾讯云新加坡与阿里云 ECS 生产环境增量更新到 `4dad21c fix: migrate deprecated deepseek flash background model`，上线后台任务 DeepSeek Flash 历史快照定向迁移。
- 影响范围：腾讯云从 `9420e24` fast-forward 到 `4dad21c` 并重建 `ugk-pi`、`ugk-pi-conn-worker`、`ugk-pi-feishu-worker`；阿里云从 `921df49` fast-forward 到 `4dad21c`，保全服务器本地 `runtime/skills-user/web-access/scripts/local-cdp-browser.mjs` 热改 diff 到 `/root/ugk-claw-shared/backups/local-cdp-browser-pre-4dad21c-20260430-110018.patch` 后重建应用容器，遇到 nginx `502` 后按 runbook 强制重建 nginx 恢复。两边公网 `/healthz` 最终均返回 `{"ok":true}`。
- 对应入口：`src/workers/conn-worker.ts`、`docs/server-ops-quick-reference.md`、`docs/aliyun-ecs-deploy.md`、`docs/tencent-cloud-singapore-deploy.md`

### 后台任务 DeepSeek Flash 历史快照兼容
- 日期：2026-04-30
- 主题：修复下架 `deepseek-v4-flash` 后，旧 conn / 后台任务快照仍引用 `deepseek-anthropic/deepseek-v4-flash` 导致 worker 报 `Background agent model not found` 的问题。
- 影响范围：后台 worker 解析模型时仅对历史 `deepseek-anthropic/deepseek-v4-flash` 快照做显式迁移，改用 `deepseek-anthropic/deepseek-v4-pro`；其他 provider / model 缺失仍明确失败，不恢复任意 fallback，也不改变前台 Web 模型源选项。
- 对应入口：`src/workers/conn-worker.ts`、`test/conn-worker.test.ts`、`docs/runtime-assets-conn-feishu.md`

### 腾讯云生产环境增量更新到 `921df49`
- 日期：2026-04-30
- 主题：按腾讯云 clean Git 主流程把生产环境从 `fe4cca6 docs: add dual-cloud incremental deploy guide` fast-forward 到 `921df49 chore: remove deepseek flash model option`，上线飞书 `/stop`、subagent 模型源继承修复，以及 DeepSeek Flash 模型选项下架。
- 影响范围：腾讯云继续使用 `~/ugk-claw-repo` Git 工作目录和 `~/ugk-claw-shared` 运行态目录；本次执行 `git pull --ff-only origin main` 与 `docker compose ... up --build -d`，重建 `ugk-pi`、`ugk-pi-conn-worker` 和 `ugk-pi-feishu-worker`，没有整目录替换，也没有触碰 `.data/agent`、sidecar 登录态、资产、conn 或生产日志。发布后服务器 `git status --short` 为空，内网 / 公网 `/healthz` 均返回 `{"ok":true}`，`/v1/model-config` 确认不包含 `deepseek-v4-flash` 且仍包含 `deepseek-v4-pro`。
- 对应入口：`docs/tencent-cloud-singapore-deploy.md`、`docs/server-ops-quick-reference.md`、`src/integrations/feishu/service.ts`、`.pi/extensions/subagent/index.ts`、`runtime/pi-agent/models.json`

## 2026-04-29

### DeepSeek Flash 模型选项下架
- 日期：2026-04-30
- 主题：从 API 源模型注册表移除 `deepseek-v4-flash`，Web 模型源设置中 DeepSeek 只保留 `deepseek-v4-pro` 可选项。
- 影响范围：影响 `GET /v1/model-config` 返回的 DeepSeek 模型列表，以及新会话 / subagent 可选择的模型范围；不改变 DeepSeek provider、API key 环境变量、其他 provider 或当前用户本地未提交的 `.pi/settings.json` 选择现场。
- 对应入口：`runtime/pi-agent/models.json`、`test/model-config.test.ts`、`docs/model-providers.md`

### Subagent 模型源继承修复
- 日期：2026-04-30
- 主题：修复 subagent 子进程默认模型源没有跟随 Web 模型设置的问题。subagent 参数生成不再直接用 pi 原生 `SettingsManager.create(projectRoot)` 读取带注释的 `.pi/settings.json`，改为复用项目已有的默认模型解析入口，并显式传递 `--provider` / `--model` 给子进程。
- 影响范围：影响 `.pi/extensions/subagent` 启动子 agent 时的 provider/model 选择；不改变 subagent 工具白名单、skill 加载、并发策略、Web 主 agent 会话或后台 conn 模型策略。
- 对应入口：`.pi/extensions/subagent/index.ts`、`test/subagent.test.ts`

### 飞书 /stop 打断指令
- 日期：2026-04-30
- 主题：飞书入站新增 `/stop` 控制命令，语义对齐 Web playground 的打断按钮，直接调用主服务 `POST /v1/chat/interrupt` 中断当前 Web 会话 active run。
- 影响范围：影响飞书 worker 对控制命令的处理和 HTTP gateway 调用范围；`/stop` 不进入普通 agent prompt、不参与运行中消息队列，也不改变 Web 端打断 API、会话、资产或 conn 语义。
- 对应入口：`src/integrations/feishu/service.ts`、`src/integrations/feishu/http-agent-gateway.ts`、`test/feishu-service.test.ts`、`test/feishu-http-agent-gateway.test.ts`、`docs/runtime-assets-conn-feishu.md`

### 阿里云 Docker apt mirror 构建修复
- 日期：2026-04-30
- 主题：阿里云生产 `docker compose ... up --build -d` 卡在 Dockerfile 的 `apt-get update`，根因是默认 Debian 官方源在阿里云 ECS 上访问不稳定。`Dockerfile` 新增 `APT_MIRROR_HOST` build arg，`docker-compose.prod.yml` 透传该参数，阿里云 shared `compose.env` 设置 `APT_MIRROR_HOST=mirrors.aliyun.com` 后可切换到阿里云可达 apt 源；`cryptography` / `pyyaml` 同步改用 Debian 包安装，避免修完 apt 又卡在 PyPI。
- 影响范围：影响生产镜像构建阶段的 apt 源选择；默认不设置该变量时继续使用 Debian 官方源，不改变运行时 API、会话、资产、conn、飞书或 playground 业务逻辑。
- 对应入口：`Dockerfile`、`docker-compose.prod.yml`、`.env.example`、`test/containerization.test.ts`、`docs/server-ops-quick-reference.md`、`docs/aliyun-ecs-deploy.md`

### Playground 桌面布局合回与手机端隔离
- 日期：2026-04-29
- 主题：评估并合回 `C:\Users\29485\Downloads\0429-ui-fix.md` 中的桌面布局重构诉求：左侧会话 rail 改为贯穿全高并承载设置菜单，右侧 topbar 只保留新会话、文件、后台任务、任务消息、技能和上下文电池；文件入口收口为桌面子菜单，按钮 tooltip 使用 CSS 承载。移动端继续保留独立 `mobile-topbar`，仅隐藏桌面操作按钮和文件菜单，不隐藏上下文电池，避免桌面 grid 改动误伤 phone 端。
- 影响范围：影响 playground 桌面端导航布局、浅色主题下的桌面菜单样式、手机端断点隔离规则，以及消息气泡导出图片时的样式收集逻辑；不改变聊天、SSE、会话、资产、conn、飞书或模型源 API 语义。
- 对应入口：`src/ui/playground-page-shell.ts`、`src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`、`src/ui/playground-transcript-renderer.ts`、`test/playground-page-shell.test.ts`、`test/playground-styles.test.ts`、`test/server.test.ts`

### 双云增量更新规范渐进式披露
- 日期：2026-04-29
- 主题：为腾讯云新加坡和阿里云 ECS 分别补齐 agent 可读的增量更新规范：`AGENTS.md` 只放目标、路径、shared 目录、默认 Git fast-forward 和禁区；`docs/server-ops-quick-reference.md` 放两台服务器各自的发布命令、Gitee 兜底、验收清单和避坑说明，形成“先短规则、再速查、异常才看单机手册”的渐进式披露入口。
- 影响范围：只影响部署协作规范和未来 agent 接手流程；不改运行时代码，不改变服务器运行态目录，不把 `.env`、key、tar 包、`.data` 或临时报告纳入仓库。
- 对应入口：`AGENTS.md`、`docs/server-ops-quick-reference.md`

### 腾讯云 clean Git 更新主流程收口
- 日期：2026-04-29
- 主题：将腾讯云 `~/ugk-claw-repo` 从长期脏工作区收口为干净 Git 工作目录，并补齐 `gitee` 备用 remote；后续发布主流程统一为 `git pull --ff-only origin main`，GitHub 不通时走 `git pull --ff-only gitee main`。
- 影响范围：影响腾讯云生产发布流程和接手口径；保留 `~/ugk-claw-shared` 作为运行态目录，不把 agent 数据、Chrome 登录态、env 或日志并入 Git 仓库。
- 对应入口：`docs/tencent-cloud-singapore-deploy.md`、`docs/server-ops-quick-reference.md`、`AGENTS.md`

### 阿里云 Git 更新主流程迁移
- 日期：2026-04-29
- 主题：将阿里云 `/root/ugk-claw-repo` 从 archive 解包目录迁移为 Git 工作目录，`origin` 指向 GitHub，`gitee` 作为备用 remote；后续发布主流程改为 `git pull --ff-only origin main`，GitHub 不通时走 `git pull --ff-only gitee main`。
- 影响范围：影响阿里云生产发布流程和接手口径；保留 `/root/ugk-claw-shared` 作为运行态目录，不把 agent 数据、Chrome 登录态、env 或日志并入 Git 仓库。
- 对应入口：`docs/aliyun-ecs-deploy.md`、`docs/server-ops-quick-reference.md`、`AGENTS.md`

### 持久化运行态 AGENTS 规则注入
- 日期：2026-04-29
- 主题：修复 agent 在服务器上临时写入仓库版 `AGENTS.md` 后，后续 `git pull` 或 archive 发布覆盖导致规则丢失的问题。新增运行态规则入口 `/app/.data/agent/AGENTS.local.md`，该文件位于生产 shared agent data 目录内，并通过 agent session resource loader 作为额外 AGENTS 上下文注入。
- 影响范围：影响 agent session 上下文加载和生产规则沉淀边界；不改变仓库版 `AGENTS.md` 的项目准则职责，不把运行态规则塞回 Git 仓库，也不改变 skill 触发机制。
- 对应入口：`src/agent/agent-session-factory.ts`、`test/agent-session-factory.test.ts`、`AGENTS.md`、`docs/server-ops-quick-reference.md`

### Playground 消息与 composer UI 固化
- 日期：2026-04-29
- 主题：将 `bugs/4029开发日志.md` 中已经在运行时验证过的 playground UI 覆盖固化回源码：桌面端发送 / 打断按钮改为 icon-only，用户气泡统一改为微信绿，助手气泡去掉额外纵向间隔，手机端长按消息气泡弹出复制 / 导出图片菜单，并隐藏手机端底部消息操作行。
- 影响范围：影响 playground 消息气泡、导出图片样式、composer 动作按钮和手机端消息操作方式；不改变聊天、SSE、会话、文件资产、后台任务或模型源接口语义。
- 对应入口：`src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`、`src/ui/playground-transcript-renderer.ts`、`docs/playground-current.md`、`test/server.test.ts`

### Web-access 搜索引擎默认规则
- 日期：2026-04-29
- 主题：评估 `bugs/4029开发日志.md` 中“默认 Google 搜索导致国内服务器失败”的问题，结论为问题成立；在项目最高规则和 `web-access` skill 中明确普通网页搜索优先使用当前环境可达的 Bing、百度、搜狗等搜索引擎，不默认先撞 Google。
- 影响范围：影响 agent 执行网页搜索任务时的默认路线选择；不改变 `x-search-latest` 等显式平台检索 skill 的触发条件和脚本行为，也不禁止用户明确要求访问 Google / X 等境外站点。
- 对应入口：`AGENTS.md`、`runtime/skills-user/web-access/SKILL.md`

### SSL Checker 任务依赖预装评估与落地
- 日期：2026-04-29
- 主题：评估 `bugs/ssl-checker-optimization-report.md`，报告中“依赖每次安装导致 SSL 检查与邮件发送耗时过长”的问题成立；将 Python SSL 检查依赖和 Node 邮件发送依赖固化到镜像 / 根依赖，避免生产后台任务每次运行临时安装。
- 影响范围：影响 Docker 镜像构建层和根 `node_modules`；不直接把 `.data/agent/background/` 运行态任务文件纳入仓库，不改变现有后台任务调度协议。生产服务器需要重建镜像后才会获得依赖预装效果。
- 对应入口：`Dockerfile`、`package.json`、`package-lock.json`、`bugs/ssl-checker-optimization-report.md`

### 小米 MiMo 模型源接入
- 日期：2026-04-29
- 主题：接入小米 MiMo 的 Anthropic 兼容 API，把 `mimo-v2.5-pro` 按 `1048576` context window 登记为可选模型源，并按中国、新加坡、欧洲三套集群分别暴露 provider：`xiaomi-mimo-cn`、`xiaomi-mimo-sgp`、`xiaomi-mimo-ams`。同时为模型源补齐 `name / vendor / region / priority` 元数据，把阿里、DeepSeek、小米三类来源的展示顺序和归属管理收口到同一套结构。
- 影响范围：影响模型源列表、Web 模型配置接口、模型源展示文案和新部署的环境变量模板；不改变当前默认模型，现有 `deepseek-anthropic / deepseek-v4-flash` 默认选择保持不变。API Key 不写入仓库，统一通过 `XIAOMI_MIMO_API_KEY` 环境变量读取；本地可从 ignored 的 `小米api.txt` 兜底加载。模型源 live validator 不再要求 provider 原样复读固定口令，改为上游成功返回非空助手文本即通过，避免小米这类不严格复读指令的兼容源被误判失败。生产服务器如需使用小米模型，需要在 shared env 中补入 `XIAOMI_MIMO_API_KEY` 后重启/重建应用容器。
- 验证记录：`2026-04-29` 在腾讯云新加坡 `ugk-pi` 容器内用当前小米 key 真实 POST 三套 endpoint：CN 返回 `200`，SGP / AMS 均返回 `401 Invalid API Key`。这说明 SGP / AMS endpoint 在腾讯云新加坡网络可达，但当前 key 没有对应集群权限；如腾讯云要走 `xiaomi-mimo-sgp`，需要小米侧提供或开通 SGP 有效 key。同日已用增量包同步到腾讯云新加坡与阿里云 ECS：两端 `/v1/model-config` 均显示三套小米 provider `configured=true`，上下文窗口 `1048576`；两端 `POST /v1/model-config/validate` 验证 `xiaomi-mimo-cn / mimo-v2.5-pro` 均返回 `ok=true`，公网 `/healthz` 均正常。
- 对应入口：`runtime/pi-agent/models.json`、`src/config.ts`、`src/agent/model-config.ts`、`src/ui/playground.ts`、`.env.example`、`.gitignore`、`docs/model-providers.md`、`test/config.test.ts`、`test/model-config.test.ts`、`test/agent-session-factory.test.ts`、`test/server.test.ts`

### Playground UI 热修复包源码化
- 日期：2026-04-29
- 主题：审阅并落地 `bugs/ui-fixes-2026-04-29.tar.gz` 中仍适用于当前源码的 UI 修复：移除深色 / 浅色主题左右侧渐变遮罩，补齐浅色 `file-download` 承载面，调整“回到底部”按钮在移动端避让 composer，并将移动端顶部品牌和聊天水印从 ASCII 切换为 SVG 静态资产。
- 影响范围：只影响 playground 视觉层、移动端品牌显示和文件下载 / 资产 pill 的主题样式；不改变聊天、SSE、会话、文件资产 API、conn worker 或 browser sidecar 行为。压缩包内生成后的 `index.html` / `custom-styles.css` 未直接覆盖源码，只作为对照参考。
- 对应入口：`src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`、`src/ui/playground-assets.ts`、`src/ui/playground-page-shell.ts`、`public/ugk-claw-logo.svg`、`public/ugk-claw-logo-light.svg`、`docs/playground-current.md`

### 后台 conn 浏览器 scope 清理
- 日期：2026-04-29
- 主题：修复后台 conn run 使用 web-access 后浏览器页面残留的问题。`BackgroundAgentRunner` 现在按 `connId` 创建 browser cleanup scope，运行前清理同 scope 旧页面，执行 prompt 时通过 `runWithScopedAgentEnvironment()` 注入 `CLAUDE_AGENT_ID / CLAUDE_HOOK_AGENT_ID / agent_id`，并在 `finally` 中再次 best-effort 清理。`LocalCdpBrowser` 同步登记 `new_target` 创建的 scoped target，`close_scope_targets` 不再只清默认 target。`zhihu-tools` 的 API helper 改为 `try/finally` 关闭目标页，避免知乎 API / JSON 解析异常时漏关页面。
- 影响范围：后台 conn worker 的浏览器自动化清理语义、web-access CDP scoped target 管理、知乎查询 skill 的异常路径；不改变前台聊天 SSE、playground 会话模型、conn 调度接口或 sidecar 登录态目录。
- 对应入口：`src/agent/background-agent-runner.ts`、`runtime/skills-user/web-access/scripts/local-cdp-browser.mjs`、`runtime/skills-user/zhihu-tools/scripts/zhihu-api.mjs`、`test/background-agent-runner.test.ts`、`test/local-cdp-browser.test.ts`

### 飞书动态接入双云增量发布
- 日期：2026-04-29
- 主题：将飞书 WebSocket 接入、Web 动态设置入口、后台通知读取最新飞书配置，以及 worker 启动失败重试修复增量发布到腾讯云新加坡和阿里云 ECS 两套生产环境。两边均保留 shared 运行态目录，不替换 `.data/agent`、sidecar 登录态、资产、conn 或生产日志。
- 影响范围：腾讯云 `~/ugk-claw-repo` 因远端工作区存在未提交差异，本次没有 `git pull`，改用 `runtime/feishu-dynamic-6a1cbc9-incremental.tar.gz` 小包覆盖；阿里云 `/root/ugk-claw-repo` 仍不是 Git 工作目录，继续用 archive 小包覆盖。两端均通过 `up --build -d` 启动新增 `ugk-pi-feishu-worker`。阿里云重建后出现旧 nginx upstream `502`，应用容器自身健康，按 runbook `up -d --force-recreate nginx` 后恢复。
- 验证记录：腾讯云与阿里云内网 `/healthz`、公网 `/healthz` 均返回 `{"ok":true}`；两端 `/playground` HTML 均包含 `feishu-settings-dialog`；两端 compose 状态均显示 `ugk-pi-feishu-worker` 运行中；worker 日志均为 `[feishu-worker] disabled by settings`，表示生产配置当前未启用飞书而非 worker 异常。
- 对应入口：`docs/tencent-cloud-singapore-deploy.md`、`docs/aliyun-ecs-deploy.md`、`src/workers/feishu-worker.ts`、`src/routes/feishu-settings.ts`、`src/integrations/feishu/`、`docker-compose.prod.yml`

### 飞书接入测试通过与代码整理
- 日期：2026-04-29
- 主题：完成飞书动态绑定用户验收留存：Web 动态保存 App ID / App Secret、worker 自动重连和测试消息已通过实测。代码整理时清理未使用的 `FeishuSettingsStore.getVersion()`，并修复 worker 启动失败后的重试语义：WebSocket subscription 只有 `start()` 成功后才确认配置签名，临时失败不会让同一份配置被跳过。
- 影响范围：只影响飞书 worker 的失败重试韧性、飞书动态配置文档和接手索引；不改变 current conversation mode、不恢复 HTTP webhook、不增加第二套 agent runtime。同步更新 `AGENTS.md` 与 `docs/traceability-map.md`，移除已不存在的 `src/routes/feishu.ts` 路标。
- 验证记录：用户飞书测试通过；本地 `npx tsc --noEmit`、`npm test` 全量通过，结果为 `447 pass`。
- 对应入口：`src/workers/feishu-worker.ts`、`src/integrations/feishu/settings-store.ts`、`test/feishu-ws-subscription.test.ts`、`docs/runtime-assets-conn-feishu.md`、`docs/traceability-map.md`、`AGENTS.md`

### 飞书动态凭据空白字符校验
- 日期：2026-04-29
- 主题：定位飞书 App ID / App Secret 修改“没生效”的真实原因：动态配置已经写入并触发 worker 重连，但保存的 App ID 中混入空白字符，导致飞书 WebSocket 连接失败。后端保存接口新增凭据空白字符校验，拒绝包含空格、换行或制表符的 `appId` / `appSecret`，避免把明显无效的飞书凭据写入运行态配置。
- 影响范围：只影响 `PUT /v1/integrations/feishu/settings` 的输入校验；已有动态配置、worker 自动重连、后台任务通知读取逻辑不变。当前已保存的错误凭据不会被自动改写，需要用户在 Web 里重新填入正确 App ID / Secret。
- 对应入口：`src/routes/feishu-settings.ts`、`test/server.test.ts`

### 飞书 App 凭据与绑定 Web 动态配置
- 日期：2026-04-29
- 主题：把飞书 App ID / App Secret / 白名单 / 后台通知接收人从纯 `.env` 启动配置升级为 Web 可配置运行态。playground 新增“飞书设置”入口，后端新增脱敏读取、保存和测试消息 API；动态配置持久化到 `UGK_AGENT_DATA_DIR/feishu/settings.json`，`App Secret` 不通过 API 回显。飞书 worker 轮询配置变化并自动关闭旧 WebSocket 后用新凭据重连，`conn-worker` 发送后台任务飞书通知时按次读取最新配置。
- 影响范围：新服务器部署后只需保留 `.env` bootstrap fallback，真正绑定飞书 App 与接收人可在 Web 完成；不恢复 HTTP webhook，不创建第二套 agent runtime，不影响 Web 当前会话、任务消息页或已有后台任务记录。
- 对应入口：`src/routes/feishu-settings.ts`、`src/integrations/feishu/settings-store.ts`、`src/workers/feishu-worker.ts`、`src/workers/conn-worker.ts`、`src/ui/playground.ts`、`src/ui/playground-page-shell.ts`、`.env.example`、`test/feishu-settings-store.test.ts`、`test/feishu-ws-subscription.test.ts`、`test/server.test.ts`、`docs/runtime-assets-conn-feishu.md`

### 飞书轻量进度反馈
- 日期：2026-04-29
- 主题：为飞书 current conversation mode 增加轻量 loading / progress 反馈。飞书发起新的空闲 chat 后会先收到 `收到，正在处理...`，worker 随后节流读取主服务 `GET /v1/chat/state` 的 active run 摘要，内容变化时发送 `正在处理：...`，最终仍发送完整 agent 结果和文件。该机制只观察同一个 Web active run，不创建第二个 agent，不影响 Web SSE 和运行中消息排队逻辑。
- 影响范围：飞书入站空闲 chat 的用户体验、`FeishuService` 进度观察逻辑、飞书服务单测和 Feishu 运行文档；运行中追加消息仍走 `queueMessage()`，`/status`、`/new`、`/whoami` 控制命令不进入进度反馈。
- 对应入口：`src/integrations/feishu/service.ts`、`test/feishu-service.test.ts`、`docs/runtime-assets-conn-feishu.md`

### 飞书当前会话中转模式
- 日期：2026-04-29
- 主题：将飞书接入收口为 Web 当前会话的外挂收发窗口：默认 `current conversation mode` 下，飞书入站消息投递到服务端当前 `conversationId`，运行中消息继续复用 `queueMessage()`，纯文本走 `steer`，带附件走 `followUp`。保留 `mapped` 兼容模式，但不再作为默认主链路；新增飞书 `message_id` 进程内幂等与 `FEISHU_ALLOWED_CHAT_IDS` 白名单，避免 webhook 重试或非授权群聊重复 / 混入当前会话。
- 影响范围：飞书 webhook 入站路由到 conversation 的策略、飞书入站幂等、飞书 chat 白名单配置与对应单测；不改变 Web playground、conn 后台任务、飞书 client / delivery / attachment bridge 的主实现。
- 对应入口：`src/integrations/feishu/service.ts`、`src/integrations/feishu/conversation-resolver.ts`、`src/integrations/feishu/message-deduper.ts`、`src/agent/agent-service.ts`、`src/server.ts`、`.env.example`、`test/feishu-service.test.ts`、`docs/runtime-assets-conn-feishu.md`

### 后台任务事件日志体积上限
- 日期：2026-04-29
- 主题：定位腾讯云访问异常的根因不是 sidecar 页面过多，而是 `conn.sqlite` 与后台 session 历史膨胀导致 `ugk-pi` Node 进程多次 `JavaScript heap out of memory`。为 `ConnRunStore` 增加后台 run event 存储保护：单条事件递归截断超长字符串 / 深层结构，单个 run 只保留最近 2000 条事件，避免 `conn_run_events.event_json` 再次写到 GB 级。
- 影响范围：后台任务运行日志持久化与历史查看；最近日志、分页查看和任务结果不变，但超大工具输出只保留摘要与截断标记。生产清理需要先备份 `conn.sqlite` 和超大 session，再 prune 旧事件并 `VACUUM`。
- 对应入口：`src/agent/conn-run-store.ts`、`test/conn-run-store.test.ts`、`docs/server-ops-quick-reference.md`

### 双云增量发布流程与用户可见 URL 边界
- 日期：2026-04-29
- 主题：收口腾讯云 / 阿里云生产增量发布 runbook，明确“先选目标云”：腾讯云使用 GitHub 工作目录 fast-forward，阿里云当前使用 archive 小包覆盖 `/root/ugk-claw-repo`，两边都必须保留 shared 运行态并按改动类型选择 `restart`、`up --build -d` 或 nginx `--force-recreate`。同时在 agent 文件响应 prompt 中注入当前 `PUBLIC_BASE_URL`，要求最终用户可见服务链接只使用当前运行环境地址，避免阿里云 agent 主动引用腾讯云公网入口。
- 影响范围：部署文档、项目接手规则、agent 每轮文件交付 / 链接输出协议与对应回归测试；不改变 chat、SSE、sidecar CDP、会话或文件资产业务逻辑。
- 对应入口：`docs/server-ops-quick-reference.md`、`docs/tencent-cloud-singapore-deploy.md`、`docs/aliyun-ecs-deploy.md`、`AGENTS.md`、`src/agent/file-artifacts.ts`、`test/file-artifacts.test.ts`

### Web-access CDP 文本输入端点
- 日期：2026-04-29
- 主题：审核并落地 CDP `Input.insertText` 需求，为 web-access 兼容代理新增 `POST /type`，通过 `LocalCdpBrowser` 调用 CDP `Input.insertText` 向当前焦点输入文本，解决 Draft.js / React 富文本编辑器里 `execCommand('insertText')` 只改 DOM、不触发框架状态同步的问题。
- 影响范围：新增浏览器代理行为、web-access skill 使用说明、浏览器桥接文档与回归测试；调用方仍需先通过 `/eval` 或点击让目标编辑器 focus，`/type` 只负责在当前光标处插入文本，不负责清空或选择元素。
- 对应入口：`runtime/skills-user/web-access/scripts/cdp-proxy.mjs`、`runtime/skills-user/web-access/scripts/local-cdp-browser.mjs`、`runtime/skills-user/web-access/SKILL.md`、`docs/web-access-browser-bridge.md`、`test/local-cdp-browser.test.ts`、`test/web-access-proxy.test.ts`、`test/x-search-latest-skill.test.ts`

## 2026-04-28

### Agent 文件编辑效率规则
- 日期：2026-04-28
- 主题：复核 agent 文件编辑效率问题，确认 pi `edit` 工具适合精确小范围替换，不适合用大段 HTML / Markdown / 模板文本做 `oldText`。将项目级编辑策略写入 `AGENTS.md`：小范围唯一替换、多处独立改动合并到一次非重叠编辑、连续失败 2 次后停止猜测并切换策略、全文重写只作为有条件方案。
- 影响范围：只更新 agent 协作规则和问题报告，不改业务源码、不改 pi 官方工具实现。
- 对应入口：`AGENTS.md`

### Sidecar 图片上传路径桥接
- 日期：2026-04-28
- 主题：修复 sidecar 浏览器图片文件选择路径不统一的问题，新增共享上传目录桥：app / worker 侧写 `/app/.data/browser-upload`，sidecar Chrome 侧通过 `/config/upload` 选择，同一宿主目录由 `UGK_BROWSER_UPLOAD_DIR` 管理。
- 影响范围：`docker-compose.yml`、`docker-compose.prod.yml`、`.env.example`、agent 文件响应 prompt、`web-access` skill 和部署文档；不改 Chrome 登录态目录，不把整个 sidecar profile 暴露给 app。
- 对应入口：`docker-compose.yml`、`docker-compose.prod.yml`、`.env.example`、`src/agent/file-artifacts.ts`、`runtime/skills-user/web-access/SKILL.md`、`docs/web-access-browser-bridge.md`、`docs/tencent-cloud-singapore-deploy.md`、`docs/aliyun-ecs-deploy.md`

### Playground UI 报告问题落地修复
- 日期：2026-04-28
- 主题：按 playground UI 评估结论修复视觉问题：landing 空态命令条居中、markdown 表格单元格长文本换行、桌面历史栏蓝色竖线移除、桌面历史列表滚动条隐藏，以及“回到底部”按钮在深浅主题下提高可发现性。
- 影响范围：只调整 playground CSS、浅色主题覆盖、页面断言、当前状态文档和设计文档；不改变会话、SSE、文件资产、任务消息、conn 或 browser sidecar 逻辑。
- 对应入口：`src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`、`DESIGN.md`

### Playground 外部化热加载边界澄清
- 日期：2026-04-28
- 主题：评估 playground 外部化热加载边界，确认 `src/ui/` 源码修改后 `/playground/reset` 不能零重启生效的现象成立，但这是 TypeScript 模块已被运行中 Node/tsx 进程加载后的正常边界；外部化模式承诺的零重启只适用于 `runtime/playground/` 运行时文件。提交 `52f51fd Clarify playground runtime UI hot reload boundary` 已推送 GitHub，并以小包增量同步到腾讯云新加坡与阿里云 ECS。
- 影响范围：只更新项目级 skill、playground 当前状态文档和 bug 评估记录，不改运行代码、不改变 `/playground/reset` 行为、不引入 ESM 缓存清理。两台服务器只重启 `ugk-pi` 以重新加载项目级 skill，不替换 shared 运行态目录，不触碰 `.data/agent`、sidecar 登录态、资产、conn 数据或生产日志。
- 对应入口：`.pi/skills/playground-runtime-ui/SKILL.md`、`docs/playground-current.md`、`docs/tencent-cloud-singapore-deploy.md`、`docs/aliyun-ecs-deploy.md`

## 2026-04-27

### Playground 外部化双云增量发布
- 日期：2026-04-28
- 主题：将 `b288853 Pass playground externalized flag to containers` 以增量包 `runtime/playground-externalized-b288853-incremental.tar.gz` 发布到腾讯云新加坡与阿里云 ECS。两端均启用 `PLAYGROUND_EXTERNALIZED=1`，并确认 `/playground` 返回外部化资源引用 `/playground/styles.css` 与 `/playground/app.js`，容器内生成 `runtime/playground/app.js`，项目级 skill `.pi/skills/playground-runtime-ui/SKILL.md` 可用。
- 影响范围：只覆盖本次提交涉及的源码、文档、测试、项目级 skill 与 `docker-compose.prod.yml`，不替换 shared 运行态目录，不触碰 `.data/agent`、sidecar 登录态、资产、conn 数据或生产日志。阿里云重建应用容器后出现 nginx `502`，按 runbook 强制重建 nginx 后恢复。
- 对应入口：腾讯云 `http://43.156.19.100:3000/playground`，阿里云 `http://101.37.209.54:3000/playground`，部署记录见 `docs/tencent-cloud-singapore-deploy.md` 与 `docs/aliyun-ecs-deploy.md`。

### Playground 前端运行时外部化
- 日期：2026-04-27
- 主题：评估并落地 `proposal-playground-externalization.md` 的可行版本。原方案直接替换 `/playground` 内联渲染风险过高，本次改为 opt-in 外部化：默认仍使用现有 `renderPlaygroundPage()`，设置 `PLAYGROUND_EXTERNALIZED=1` 后从 `src/ui/` 生成 `runtime/playground-factory/`，初始化 `runtime/playground/`，并由 `/playground/styles.css`、`/playground/app.js`、`/playground/vendor/marked.umd.js` 提供运行时资源。修改运行时 CSS / JS 后刷新浏览器即可生效，不需要重启服务。
- 影响范围：新增 `POST /playground/reset` 恢复出厂 API；新增运行时资源路由；`runtime/playground/` 与 `runtime/playground-factory/` 作为运行产物忽略 Git。新增项目级 skill `playground-runtime-ui`，让运行时 `ugk-claw` agent 在用户要求修改 playground UI / 浅色主题 / 消息气泡 / composer / logo / 移动端布局时能知道外部化调试流程与正式落回源码的边界。生产 compose 显式透传 `PLAYGROUND_EXTERNALIZED`，避免 shared compose env 与 app env 分离时开关没有进入容器。默认模式保持兼容，不改变聊天、会话、SSE、文件资产或 conn 行为。
- 对应入口：`src/routes/playground.ts`、`src/ui/playground.ts`、`src/ui/playground-page-shell.ts`、`src/ui/playground-externalized.ts`、`.pi/skills/playground-runtime-ui/SKILL.md`、`docker-compose.prod.yml`、`test/server.test.ts`、`docs/playground-current.md`、`.codex/plans/2026-04-27-playground-externalization-plan.md`

### Playground 聊天背景 ASCII 标识
- 日期：2026-04-27
- 主题：把项目 ASCII 字标收口成真实 DOM `<pre>` 资产，桌面左侧历史栏头部与手机品牌入口共用同一套 `ugk-ascii-logo-topbar` 彩色图案，手机端只约束容器尺寸，不再使用单独缩水版会话按钮图案；`chat-stage` 中心使用低对比水印变体。移除旧 topbar 图片 logo、旧 `UGK CLAW` 伪元素文字、旧 landing `hero-wordmark / hero-version`、idle transcript `:empty::before` 伪元素 logo，以及 `.chat-stage::before { content: ... }` 巨型字符串。桌面端不再同时显示 `desktop-brand` 和“历史会话 / 常驻”头部，左侧历史栏头部就是唯一品牌入口，避免浅色主题下出现旧图标不变、字符错位和水印糊成一团。
- 影响范围：调整 playground 品牌 DOM、背景装饰层、浅色主题覆盖、landing shell 旧品牌 DOM、页面断言和设计文档；不改变会话状态、发送逻辑或运行日志接口。
- 发布记录：本地提交 `66dcae1 Unify playground ASCII branding`，使用 `runtime/playground-ascii-branding-incremental.tar.gz` 对腾讯云新加坡 `43.156.19.100` 和阿里云 ECS `101.37.209.54` 做增量覆盖更新；两端均保留 shared 运行态目录，不触碰 `.data/agent`、sidecar 登录态、资产、conn 或日志。腾讯云首次验收遇到 nginx upstream `502`，按 runbook 强制重建 nginx 后恢复；两端最终 `/healthz` 均返回 `{"ok":true}`，`/playground` 均确认包含 `mobile-brand-logo desktop-brand`、`ugk-ascii-logo-topbar`、`chat-stage-watermark`，且不再包含 `ugk-ascii-logo-mobile` 或 `ugk-claw-mobile-logo.png`。
- 对应入口：`src/ui/playground-styles.ts`、`src/ui/playground-theme-controller.ts`、`src/ui/playground-page-shell.ts`、`test/server.test.ts`、`docs/playground-current.md`、`DESIGN.md`

### Playground 运行日志倒序增量加载
- 日期：2026-04-27
- 主题：优化当前任务运行日志与后台任务过程日志，改为最新事件优先、首次 2 条、滚动到底增量加载更多，并过滤正文增量噪声。
- 影响范围：`GET /v1/chat/runs/:runId/events` 与 `GET /v1/conns/:connId/runs/:runId/events` 增加 `limit / before / hasMore / nextBefore` 分页口径；前端日志弹层增加截断预览和浅色主题可读样式。
- 对应入口：`src/routes/chat.ts`、`src/routes/conns.ts`、`src/agent/conn-run-store.ts`、`src/ui/playground-transcript-renderer.ts`、`src/ui/playground-conn-activity-controller.ts`、`src/ui/playground-styles.ts`、`src/ui/playground-conn-activity.ts`、`test/server.test.ts`、`docs/playground-current.md`、`DESIGN.md`

### Playground 消息列对齐 command-deck
- 日期：2026-04-27
- 主题：将 transcript 消息列宽度的运行时真源从 `#composer-drop-target` 改为 `#command-deck`，确保对话气泡左右边界与底部命令区一致对齐。
- 影响范围：只调整前端布局测量与页面断言，不改变消息 DOM、发送逻辑、文件上传或移动端结构；ResizeObserver 改为监听 `commandDeck`。
- 对应入口：`src/ui/playground-layout-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`、`DESIGN.md`

### Playground 文件选择不再生成助手气泡
- 日期：2026-04-27
- 主题：修复点击文件选择器上传文件时，composer 本地资产上传动作被 `updateStreamingProcess()` 当成 agent 运行过程，进而在 transcript 里生成空助手气泡的问题。
- 影响范围：主 chat 文件选择 / 拖拽上传仍会注册资产并加入已选资产区，但不再写入助手过程流；超过文件数限制走顶部反馈，不再用 `appendProcessEvent()` 生成对话提示。真正发送消息和 agent run 的过程流不变。
- 对应入口：`src/ui/playground-assets-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`

### Playground 消息操作栏间距收口
- 日期：2026-04-27
- 主题：优化对话气泡底部 `.message-actions` 与助手 `.message-body` 的叠加间距，取消操作栏额外 `margin-top`，并把助手气泡内部 grid 间距收紧，避免浅色主题消息底部出现空白尾巴；同时修正浅色 `#composer-drop-target.composer`、`.file-strip` 与 `#message` 的层级：composer 投放区和输入框本体保留冷白背景，文件条容器保持透明。
- 影响范围：只调整 playground 消息气泡内部视觉间距，不改变消息 DOM、复制正文、导出图片、附件渲染或深浅主题切换逻辑；同步补充页面断言与 UI 文档口径。
- 对应入口：`src/ui/playground-styles.ts`、`test/server.test.ts`、`docs/playground-current.md`、`DESIGN.md`

### Playground 浅色用户气泡来源边框
- 日期：2026-04-27
- 主题：移除浅色主题用户气泡右侧蓝色竖线，改用浅绿色边框区分用户来源，避免输入回显看起来像系统状态标记。
- 影响范围：只调整浅色 `.message.user` 视觉映射，不改变消息 DOM、历史渲染、复制 / 导图操作或深色主题样式；同步更新页面断言与 UI 文档。
- 对应入口：`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`、`DESIGN.md`

### Playground 浅色输入与工具壳层透明化
- 日期：2026-04-27
- 主题：优化浅色主题下 `telemetry-card`、`telemetry-action`、`command-deck`、`composer`、`selected-assets`、`drop-zone-top` 被同一组规则刷成半透明白底的问题，改为结构壳层透明，只让真正的输入、按钮、file chip 和状态面板承担可见背景。
- 影响范围：只调整浅色主题结构壳层视觉覆盖，不改变 composer 布局、发送行为、附件/资产状态和深色主题；同步更新页面断言与 UI 文档口径。
- 对应入口：`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`、`DESIGN.md`

### Playground 浅色 chat-stage 背景移除
- 日期：2026-04-27
- 主题：按浅色主题工作台口径移除 `.chat-stage` 的浅色实体背景，并显式覆盖为透明，避免基础深色 `.chat-stage` 背景或浅色白色面板继续套在对话工作区外层。
- 影响范围：只调整 `:root[data-theme="light"] .chat-stage` 的视觉覆盖，不改变深色主题、不改变 transcript 布局和消息渲染；同步更新页面断言与 UI 文档口径。
- 对应入口：`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`、`DESIGN.md`

### 腾讯云与阿里云生产增量发布到 `4aeb01e`
- 日期：2026-04-27
- 主题：将 `4aeb01e Fix playground light theme runtime polish` 增量发布到腾讯云新加坡与阿里云 ECS 两套生产环境，包含浅色用户气泡、后台任务模型解析、SSE heartbeat / idle timeout 与 nginx 长连接配置。
- 影响范围：腾讯云沿用 `~/ugk-claw-repo` Git 工作目录 fast-forward，从 `030d6f1` 更新到 `4aeb01e`，重建 `ugk-pi`、`ugk-pi-conn-worker` 并因 nginx 配置变更强制重建 nginx；阿里云仍是 archive 解包目录，通过本地 `git archive HEAD` 上传 `/root/ugk-claw-deploy.tar.gz`，替换 `/root/ugk-claw-repo` 代码目录并保留 `/root/ugk-claw-shared` 运行态。两边均验证 `/healthz`、`/playground` 样式标记、compose 状态与 `check-deps.mjs`。
- 对应入口：`docs/tencent-cloud-singapore-deploy.md`、`docs/aliyun-ecs-deploy.md`、`docs/server-ops-quick-reference.md`

### Playground 浅色用户气泡视觉收口
- 日期：2026-04-27
- 主题：修复浅色主题下用户对话气泡仍像深色块状面板的问题，把用户消息单独收口为右侧轻量输入回显：冷白承载面、深色正文、右侧蓝色窄强调条，并保持正文左对齐。
- 影响范围：只调整 playground 浅色主题 `.message.user` 视觉映射，不改变 transcript 数据结构、消息类型归一化、助手 markdown 渲染或运行态逻辑；同步补充 `/playground` 页面断言和 UI 设计文档，防止通用 `.message-body` 浅色覆盖再次误伤用户气泡。
- 对应入口：`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`、`DESIGN.md`

### 后台任务模型与 SSE 长连接稳定性修复
- 日期：2026-04-27
- 主题：执行 `bugs/` 目录问题评估计划的 P0 修复：后台 conn session 创建时显式使用 resolved snapshot 中的 provider/model，模型不存在时明确失败；生产 nginx 入口补齐 SSE 长连接 timeout 和关闭 buffering；聊天 SSE 增加 comment heartbeat，前端流式读取增加 idle 保护和恢复路径。
- 影响范围：后台任务不再静默 fallback 到 registry 第一个模型；`/v1/chat/stream`、`/v1/chat/events` 经 nginx 代理时允许 600 秒长读写并关闭响应缓冲，且后端会用 `: ping` 保活；前端会忽略 heartbeat comment frame，长时间无字节时回到 canonical state / events 恢复链路而不是渲染空回复。同步补充容器配置测试、SSE 测试、页面断言、运行手册和 conn 任务定义约束。
- 对应入口：`src/workers/conn-worker.ts`、`test/conn-worker.test.ts`、`deploy/nginx/default.conf`、`test/containerization.test.ts`、`src/routes/chat-sse.ts`、`src/routes/chat.ts`、`test/chat-sse.test.ts`、`src/ui/playground-stream-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`、`docs/runtime-assets-conn-feishu.md`、`docs/tencent-cloud-singapore-deploy.md`、`docs/aliyun-ecs-deploy.md`

### Playground 会话列表 idle 解锁修复
- 日期：2026-04-27
- 主题：修复 agent 任务已经结束、后端 `running=false`，但 playground 会话列表仍处于不可用状态的问题。根因是 `setLoading(true)` 会重绘会话列表并写入 `disabled`，而 `setLoading(false)` 只更新顶部状态和按钮，没有重新渲染会话列表，导致 DOM 残留禁用态。
- 影响范围：任务结束、错误或打断后，会话列表会立即按 `state.loading=false` 重新渲染并恢复切换 / 删除可用状态；不改变后端会话状态、不改变运行中禁止切换的规则。同步补充 `/playground` HTML 断言，避免 `renderConversationDrawer()` 再被塞回 `if (next)` 分支里。
- 对应入口：`src/ui/playground-status-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`

### Playground 浅色主题消息细节修正
- 日期：2026-04-27
- 主题：修正浅色主题下 active run 运行日志按钮、过程摘要和 Markdown 表格的视觉映射。终态 `assistant-run-log-trigger.ok` 的文字不再继承深色低透明白字；`assistant-status-summary` 与状态壳层保持透明；Markdown 表格滚动外壳、表头和单元格边线改为冷白 / 蓝灰承载面。
- 影响范围：只调整 playground 浅色主题视觉，不改接口语义、不改会话状态模型。同步补充 `/playground` HTML 断言，防止表格外壳回退成深灰背景或运行状态文字再次不可读。
- 对应入口：`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`、`DESIGN.md`

### 阿里云 ECS 首次部署与接手文档
- 日期：2026-04-27
- 主题：完成阿里云 ECS `101.37.209.54` 首次部署记录，公网入口为 `http://101.37.209.54:3000/playground`，健康检查为 `http://101.37.209.54:3000/healthz`。本次部署使用 `root` 用户、Ubuntu `22.04.5 LTS`、Docker Compose 生产栈，代码目录为 `/root/ugk-claw-repo`，shared 运行态目录为 `/root/ugk-claw-shared`。
- 影响范围：阿里云首次部署因服务器访问 GitHub 超时，采用本地 `git archive HEAD` 上传解包，当前 `/root/ugk-claw-repo` 不是 Git 工作目录；后续更新暂时不能照抄腾讯云 `git pull` 流程。部署过程中配置 Docker registry mirrors，安全组仅放行公网 TCP `3000`；`3901` 和 `9223` 继续禁止公网开放。阿里云服务已由服务器本机 `/healthz`、`/playground` 以及用户公网访问确认通过。
- 对应入口：`docs/aliyun-ecs-deploy.md`、`docs/server-ops-quick-reference.md`、`docs/handoff-current.md`、`docs/traceability-map.md`、`README.md`、`.gitignore`

### 生产服务器增量更新到 `fb3fc42`
- 日期：2026-04-27
- 主题：按“增量更新”流程把腾讯云新加坡生产目录 `~/ugk-claw-repo` 从 `2c309a5` fast-forward 到 `fb3fc42`，上线 DeepSeek Anthropic 兼容 provider、前端模型源查看 / 验证 / 保存入口，以及 DeepSeek `1M` context window 展示和动态上下文读取修复。
- 影响范围：发布前本地已通过 `npx tsc --noEmit`、`npm test`、`docker compose -f docker-compose.prod.yml config --quiet`；服务器发布前已备份 sidecar 登录态到 `~/ugk-claw-shared/backups/chrome-sidecar-20260427-144258.tar.gz`，并创建回滚 tag `server-pre-deploy-20260427-144258`。生产 `~/ugk-claw-shared/app.env` 已补充 `DEEPSEEK_API_KEY`，不输出也不提交真实密钥；`ugk-pi` / `ugk-pi-conn-worker` 已重建以读取新 env。
- 对应入口：`runtime/pi-agent/models.json`、`src/agent/model-config.ts`、`src/routes/model-config.ts`、`src/agent/agent-session-factory.ts`、`src/ui/playground.ts`、`docs/server-ops-quick-reference.md`

### DeepSeek API 源与前端模型源切换入口
- 日期：2026-04-27
- 主题：把 DeepSeek Anthropic 兼容源注册到项目级 `runtime/pi-agent/models.json`，新增 `deepseek-anthropic` provider，暴露 `deepseek-v4-pro` 与 `deepseek-v4-flash` 两个模型；同时新增 `/v1/model-config`、`/v1/model-config/validate`、`/v1/model-config/default`，让前端可以查看、测试并在后端验证通过后保存默认 provider / model。
- 影响范围：当前默认仍是 `dashscope-coding / glm-5`；新增 DeepSeek 可选源、`.env.example` 占位变量、本地密钥文件忽略规则和 playground “模型源”设置弹窗。保存默认模型源前后端都会走真实 provider 验证，验证失败不写 `.pi/settings.json`；真实 key 仍不得提交进仓库。DeepSeek 模型按 `1048576` context window 和 `262144` max tokens 登记，模型源列表会展示上下文信息，保存切换后上下文用量从当前默认模型动态读取，不再缓存服务启动时的旧窗口。
- 对应入口：`runtime/pi-agent/models.json`、`src/config.ts`、`src/agent/model-config.ts`、`src/agent/agent-session-factory.ts`、`src/routes/model-config.ts`、`src/ui/playground.ts`、`src/ui/playground-page-shell.ts`、`src/ui/playground-styles.ts`、`src/ui/playground-mobile-shell-controller.ts`、`.env.example`、`.gitignore`、`test/config.test.ts`、`test/agent-session-factory.test.ts`、`test/model-config.test.ts`、`test/server.test.ts`

### README 首页展示 social preview 横幅
- 日期：2026-04-27
- 主题：把 `docs/assets/github-social-preview.png` 同步放到 `README.md` 和 `README.en.md` 顶部，避免用户误以为提交 social preview 资产后 GitHub 仓库设置页会自动生效。GitHub 原生 social preview 仍需要在仓库 `Settings -> General -> Social preview` 手动上传；README 横幅用于仓库首页可见展示。
- 影响范围：只调整 README 展示图，不改运行代码、不改接口语义、不改部署配置。
- 对应入口：`README.md`、`README.en.md`、`docs/assets/github-social-preview.png`

### GitHub social preview 预览图
- 日期：2026-04-27
- 主题：为 GitHub 仓库设置页准备横版 social preview 图，尺寸为 `1280x640`，用于仓库分享卡片和社交平台预览。设计方向采用深色 agent cockpit 风格，突出 `UGK CLAW`、自托管 coding agent cockpit 定位，以及 agent runtime / streaming sessions / browser automation 等核心能力。
- 影响范围：只新增展示资产和设计说明，不改运行代码、不改接口语义、不改部署配置；GitHub 设置页仍需要手动上传该 PNG，或在 `gh` 重新登录后再自动配置。
- 对应入口：`docs/assets/github-social-preview.png`、`docs/github-social-preview-design.md`

### README 多语言展示入口
- 日期：2026-04-27
- 主题：按“首页展示中文”的要求，把仓库首页 `README.md` 改为中文展示页，并新增 `README.en.md` 作为英文版。两个版本顶部互相链接，项目定位、核心亮点、系统结构、快速开始、API 速览、项目地图和文档导航保持同一套信息结构。
- 影响范围：只调整 GitHub 展示文档，不改运行代码、不改接口语义、不改部署配置。
- 对应入口：`README.md`、`README.en.md`、`docs/change-log.md`

### GitHub 首页 README 展示收口
- 日期：2026-04-27
- 主题：把 `README.md` 从偏内部交接备忘录改成 GitHub 首页展示入口，强化项目定位、核心亮点、系统架构、快速启动、API 速览和文档导航。旧 README 里大量本机绝对路径链接不适合 GitHub 展示，已经改为仓库相对链接；内部交接和运维细节继续指向 `docs/` 下的专门文档。
- 影响范围：只调整项目展示文档，不改运行代码、不改接口语义、不改部署配置。
- 对应入口：`README.md`、`docs/handoff-current.md`、`docs/playground-current.md`、`docs/tencent-cloud-singapore-deploy.md`

### 腾讯云生产环境增量更新到 `cefa960`
- 日期：2026-04-27
- 主题：按用户确认的“1 推 GitHub、2 服务器增量发布”完成本轮架构整理收尾上线。GitHub `origin/main` 已从 `caa2eac` 推进到 `cefa960`；腾讯云新加坡生产仓库 `~/ugk-claw-repo` 通过 `git pull --ff-only origin main` 从 `46088a0` 增量更新到 `cefa960`，没有整目录替换，也没有触碰 `~/ugk-claw-shared` 下的 agent 数据和 sidecar 登录态。
- 影响范围：发布前本地通过 `npx tsc --noEmit`、`npm test`、`docker compose -f docker-compose.prod.yml config --quiet`；服务器发布前备份 sidecar 到 `/home/ubuntu/ugk-claw-shared/backups/chrome-sidecar-20260427-102259.tar.gz`，并给旧 `HEAD` 打本地回滚 tag `server-pre-deploy-20260427-102435`。发布后执行 `docker compose ... up --build -d`，内外网 `/healthz`、`/playground`、compose 状态与 `check-deps.mjs` 均验收通过。
- 对应入口：`docs/handoff-current.md`、`docs/tencent-cloud-singapore-deploy.md`、`docker-compose.prod.yml`

### 架构整理阶段收尾判断
- 日期：2026-04-27
- 主题：为本轮代码整理补充阶段性收尾判断。当前主线已经完成约 `85%-90%`，后续不建议继续按“大文件就拆”的方式推进；`AgentService` 应保留运行编排中心职责，尤其是 `activeRuns` / `terminalRuns`、`runChat()` 生命周期、interrupt 和 run events 订阅回放。
- 影响范围：只更新交接文档，不改运行代码。后续质量工作优先转向真实场景验证、新功能小范围测试和问题驱动拆分。
- 对应入口：`docs/handoff-current.md`

### Agent conversation command 编排收口
- 日期：2026-04-27
- 主题：把 `AgentService` 中的新建 / 删除 / 切换 / 重置会话命令规则抽到 `src/agent/agent-conversation-commands.ts`。这些规则本质是 conversation command 边界：运行中拒绝切线、空闲时更新 current pointer、删除或重置时清理 terminal run。继续让主服务类手写这些分支，只会让 `AgentService` 像个什么都管的居委会。
- 影响范围：外部接口语义不变；`POST /v1/chat/conversations`、`POST /v1/chat/current`、`DELETE /v1/chat/conversations/:conversationId`、`POST /v1/chat/reset` 仍保持原响应结构。`AgentService` 仍持有 active run / terminal run 状态，helper 只接收布尔运行态和 terminal cleanup callback，不反向窥探服务内部。
- 对应入口：`src/agent/agent-conversation-commands.ts`、`src/agent/agent-service.ts`、`test/agent-conversation-commands.test.ts`、`test/agent-service.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### Agent queue message 编排收口
- 日期：2026-04-27
- 主题：把 `AgentService.queueMessage()` 中的运行中队列消息编排抽到 `src/agent/agent-queue-message.ts`。队列消息不是 run 生命周期本体，继续塞在 `AgentService` 里只会让主服务类越来越像杂物间；现在附件 / 资产 prompt context、当前时间前缀、`steer` / `followUp` 显式 API 优先级和 fallback `prompt(..., { streamingBehavior })` 都有独立 helper 与聚焦测试覆盖。
- 影响范围：外部接口语义不变；`POST /v1/chat/queue` 运行中仍返回 queued，未运行仍由 `AgentService` 返回 `not_running`。运行中消息继续复用 `preparePromptAssets()` 和 `buildPromptWithAssetContext()`，`steer` / `followUp` 存在时不会退回 `prompt(streamingBehavior)`。
- 对应入口：`src/agent/agent-queue-message.ts`、`src/agent/agent-service.ts`、`test/agent-queue-message.test.ts`、`test/agent-service.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### SQLite / JSON 字段边界与任务消息分页游标加固
- 日期：2026-04-27
- 主题：按交接文档优先级完成非 Feishu 区域的 SQLite / JSON 边界扫描。坏 JSON 不应把列表、详情或后台 run 收尾拖垮；同 timestamp 的分页和 latest 选择也不能靠 SQLite 当前返回顺序碰运气。碰运气这种事适合抽卡，不适合生产系统。
- 影响范围：`ConversationNotificationStore.create()` 遇到同源 run 唯一冲突时回读已有通知；`ConnSqliteStore.list()` / `get()` 对坏 JSON conn 行降级为跳过 / 空详情；`ConnRunStore` 对坏 `resolved_snapshot_json` / `event_json` 降级，并允许 run 在 owning conn `schedule_json` 损坏时完成收尾；conn / run / notification / activity 查询补稳定 id tie-breaker。`GET /v1/activity` 的 `nextBefore` 改为不透明游标 `createdAt|activityId`，旧 timestamp-only `before` 入参继续兼容。
- 对应入口：`src/agent/agent-activity-store.ts`、`src/agent/conversation-notification-store.ts`、`src/agent/conn-sqlite-store.ts`、`src/agent/conn-run-store.ts`、`src/routes/activity.ts`、`test/agent-activity-store.test.ts`、`test/conversation-notification-store.test.ts`、`test/conn-sqlite-store.test.ts`、`test/conn-run-store.test.ts`、`test/server.test.ts`

## 2026-04-26

### 清理 AgentService 遗留 skipped 测试
- 日期：2026-04-26
- 主题：处理交接文档点名的两个 `test.skip`。其中 catalog 排序测试的旧断言已经和当前“后台任务通知不影响会话目录 preview / ordering”的稳定行为相冲突；删除会话推进 current 指针的测试已经被后续非 skipped 用例覆盖。删除过时 / 重复 skipped 用例后，全量测试不再包含跳过项。
- 影响范围：只调整测试与交接事实，不改生产代码。`test/agent-service.test.ts` 当前保留非 skipped 覆盖：后台任务结果不进入会话目录排序 / preview、删除会话后 current 指针推进。
- 对应入口：`test/agent-service.test.ts`、`docs/handoff-current.md`

### 腾讯云生产环境增量更新到 `46088a0`
- 日期：2026-04-26
- 主题：按用户明确确认的“增量更新”流程，把腾讯云新加坡生产环境从 `9d3cb37` 更新到 `46088a0`，上线本轮架构整理、会话 / 资产 / conn / playground 模块化收口以及最新交接文档。发布仍使用 GitHub 工作目录 `~/ugk-claw-repo`，没有整目录替换，也没有触碰 `~/ugk-claw-shared` 下的 agent 数据和 sidecar 登录态。
- 影响范围：发布前本地通过 `git diff --check`、`npx tsc --noEmit`、`npm test`、`docker compose -f docker-compose.prod.yml config --quiet`；服务器发布前备份 sidecar 到 `/home/ubuntu/ugk-claw-shared/backups/chrome-sidecar-20260426-234533.tar.gz`，并给旧 `HEAD` 打本地回滚 tag `server-pre-deploy-20260426-234533`。`git pull --ff-only` 后执行 `docker compose ... up --build -d`；nginx 曾短暂返回 `502`，已按手册 `up -d --force-recreate nginx` 恢复。内外网 `/healthz`、`/playground`、compose 状态与 `check-deps.mjs` 均验收通过。
- 对应入口：`docs/tencent-cloud-singapore-deploy.md`、`docs/server-ops-quick-reference.md`、`docs/handoff-current.md`

### 交接文档刷新与文档入口整理
- 日期：2026-04-26
- 主题：按用户要求为下一位 agent 刷新交接文档，把最近一轮架构整理、数据读边界防护、后续任务优先级和“现阶段跳过 Feishu”写进稳定入口。顺手修正追溯地图快速接手列表的重复编号，并把 README 阶段快照更新时间推到当前阶段。
- 影响范围：`docs/handoff-current.md` 重写为当前交接入口；`docs/traceability-map.md` 修正快速接手编号；`README.md` 指向最新交接文档。生产发布仍按增量更新，不做整目录替换。
- 对应入口：`docs/handoff-current.md`、`docs/traceability-map.md`、`README.md`

### Agent run result 助手消息检查收口
- 日期：2026-04-26
- 主题：把 `AgentService.runChat()` 中“查找最后一条 assistant message”和“provider error stopReason 转异常”的逻辑收进 `src/agent/agent-run-result.ts`。结果文本兜底和上游错误判断本来就是 run result 边界，继续散在主流程里只会让聊天编排掺杂消息结构细节。
- 影响范围：无 stream text 时仍使用最终 assistant message 兜底；assistant `stopReason === "error"` 仍抛出上游错误消息，缺少错误文本时继续使用 `Unknown upstream provider error`。新增测试覆盖最后助手消息选择和错误 fallback。
- 对应入口：`src/agent/agent-run-result.ts`、`src/agent/agent-service.ts`、`test/agent-run-result.test.ts`

### Agent terminal run snapshot 构造收口
- 日期：2026-04-26
- 主题：把 `AgentService.runChat()` 收尾阶段的 terminal run snapshot 构造抽进 `src/agent/agent-terminal-run.ts` 的 `buildTerminalRunSnapshot()`。是否保留 terminal run、如何 clone active view / events、以及缺少 persisted coverage 时如何从 run tail 推导，都归到 terminal run 边界里。
- 影响范围：completed / interrupted / error run 的刷新恢复快照语义保持不变；非 terminal run 不保存快照，terminal run 继续携带克隆后的 view / events 和 history coverage。新增测试覆盖非 terminal 跳过、已有 coverage 复用和 fallback coverage 推导。
- 对应入口：`src/agent/agent-terminal-run.ts`、`src/agent/agent-service.ts`、`test/agent-terminal-run.test.ts`

### Agent conversation session 生命周期收口
- 日期：2026-04-26
- 主题：把当前会话兜底、新建空会话、sessionFile 复用打开和默认模型上下文 fallback 抽到 `src/agent/agent-conversation-session.ts`。这些逻辑属于会话生命周期边界，不应该继续混在 `AgentService` 的聊天编排尾部；那样以后查“为什么新会话没有激活 / 为什么旧 session 没复用”会很低效。
- 影响范围：`GET /v1/chat/conversations` 的 current conversation 兜底、`POST /v1/chat/conversations` 新建空会话、无 conversationId 的 `POST /v1/chat` 新建运行会话、以及 context usage 的默认模型上下文语义保持不变。新增测试覆盖已存 current、提升既有会话、新建空会话、复用 sessionFile 和默认模型 fallback。
- 对应入口：`src/agent/agent-conversation-session.ts`、`src/agent/agent-service.ts`、`test/agent-conversation-session.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### Agent conversation context 读取路径收口
- 日期：2026-04-26
- 主题：把 `AgentService` 中 active session、persisted session、recent session window 的上下文读取逻辑抽到 `src/agent/agent-conversation-context.ts`。这块以前散在 run status、history、state 读取路径里，后续再查“为什么刷新后上下文窗口不一致”会很绕，现在统一成一个 helper 边界。
- 影响范围：`GET /v1/chat/status`、`GET /v1/chat/history`、`GET /v1/chat/state` 的消息来源语义保持不变；active run 和 terminal run 仍走全量上下文，idle state 优先读取 recent window 并携带 context usage anchor，缺少 recent reader 时再 fallback 到全量读取或打开 session。新增测试覆盖 active session 优先、持久化消息优先和 recent idle window。
- 对应入口：`src/agent/agent-conversation-context.ts`、`src/agent/agent-service.ts`、`test/agent-conversation-context.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### Agent terminal run snapshot 收口
- 日期：2026-04-26
- 主题：把 terminal run 是否持久化、刷新恢复时是否展示 terminal snapshot、以及重复输入 echo 隐藏逻辑抽到 `src/agent/agent-terminal-run.ts`。这块直接影响 completed / interrupted / error run 刷新后的可见状态，继续藏在 `AgentService` 私有方法里，后续排查“为什么刷新后又多一条助手气泡”会很费劲。
- 影响范围：`GET /v1/chat/state` 对已结束 run 的 terminal snapshot 展示规则保持不变；历史里已有助手回答时不重复展示，历史尾部已有同输入时隐藏 terminal input echo，terminal run 事件和 coverage 返回克隆副本。新增测试覆盖持久化状态白名单、echo 隐藏和历史覆盖跳过。
- 对应入口：`src/agent/agent-terminal-run.ts`、`src/agent/agent-service.ts`、`test/agent-terminal-run.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### Agent run event buffer 收口
- 日期：2026-04-26
- 主题：把 active run 事件投影、事件缓冲截断、primary sink 和订阅者 best-effort 投递收进 `src/agent/agent-run-events.ts` 的 `emitBufferedRunEvent()`。`AgentService` 不再手写“更新 view + push buffer + shift + 分发”的细节；这类流式事件 plumbing 留在服务主类里，后续一改就很容易漏掉断线客户端不应杀死 run 这种约束。
- 影响范围：`streamChat()`、`GET /v1/chat/events`、`GET /v1/chat/runs/:runId/events` 的事件缓冲和重放语义保持不变；新增测试覆盖 active view 更新、buffer 上限截断、主 sink 投递和失败订阅者隔离。
- 对应入口：`src/agent/agent-run-events.ts`、`src/agent/agent-service.ts`、`test/agent-run-events.test.ts`

### Agent conversation catalog 与 metadata 收口
- 日期：2026-04-26
- 主题：把会话目录 DTO 映射、空会话 metadata、会话标题 / 预览 / messageCount 生成抽到 `src/agent/agent-conversation-catalog.ts`。`AgentService` 继续负责会话读写和运行态判断，不再自己拼展示层 catalog；这种纯映射还赖在服务主类里，属于“方便当下，折磨后来人”的典型小债。
- 影响范围：`GET /v1/chat/conversations` 的排序、running 标记、标题 / 预览 / messageCount 兜底保持不变；新建空会话、首次创建 current 会话、chat / streamChat 持久化 metadata 都改走同一个 helper。新增测试覆盖 catalog fallback、running flag、metadata 摘要和空会话形状。
- 对应入口：`src/agent/agent-conversation-catalog.ts`、`src/agent/agent-service.ts`、`test/agent-conversation-catalog.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### Agent run scope 环境边界收口
- 日期：2026-04-26
- 主题：把 `AgentService` 底部的 browser cleanup scope 生成与 `CLAUDE_AGENT_ID` / `CLAUDE_HOOK_AGENT_ID` / `agent_id` 临时环境设置抽到 `src/agent/agent-run-scope.ts`。这块直接影响 web-access sidecar 页面清理范围，继续靠服务类底部几个裸函数撑着，后面一改就容易留下环境变量污染。
- 影响范围：`runChat()` 仍在每轮执行前后按 conversation scope 清理浏览器目标，agent scope 环境变量在正常返回和异常抛出后都会恢复；新增测试覆盖 scope sanitization、正常恢复和异常恢复。
- 对应入口：`src/agent/agent-run-scope.ts`、`src/agent/agent-service.ts`、`test/agent-run-scope.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### Agent conversation history 投影收口
- 日期：2026-04-26
- 主题：把 `AgentService` 私有的 session message 到 canonical conversation history 投影逻辑移入 `src/agent/agent-conversation-history.ts`。用户消息剥离内部 prompt 协议、助手消息合并、`send_file` 工具结果挂回文件卡片本来就是历史边界职责，继续留在服务编排类里，会让后续查“刷新后历史怎么变成这样”时绕远路。
- 影响范围：`getConversationHistory()`、`getConversationState()`、运行结束后的 terminal run coverage 和会话 metadata 继续使用同一投影语义；新增测试覆盖用户 prompt 协议剥离、连续助手消息合并和 `send_file` 历史文件挂载。
- 对应入口：`src/agent/agent-conversation-history.ts`、`src/agent/agent-service.ts`、`test/agent-conversation-history.test.ts`

### Agent prompt asset 准备逻辑收口
- 日期：2026-04-26
- 主题：把 `AgentService` 里的上传附件注册、引用资产解析、无 `assetStore` 兜底 prompt asset 组装抽到 `src/agent/agent-prompt-assets.ts`。这块属于资产输入边界，不该继续藏在聊天运行主流程里；否则后续调文件上传、资产复用、`assetRefs` 时还得在 `runChat()` 周边扒私有方法，维护体验太土了。
- 影响范围：`AgentService.chat()` / `queueMessage()` 调用语义不变，上传资产仍先于引用资产进入 prompt，缺失引用资产继续被忽略，无 `assetStore` 时仍生成 `inline-upload-*` 兜底上下文；新增 `test/agent-prompt-assets.test.ts` 锁定 inline fallback、上传注册和引用文本读取。
- 对应入口：`src/agent/agent-prompt-assets.ts`、`src/agent/agent-service.ts`、`test/agent-prompt-assets.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### Playground canonical state 控制器拆分
- 日期：2026-04-26
- 主题：把 `src/ui/playground.ts` 里的 `syncConversationRunState()`、`renderConversationState()`、active assistant 匹配和会话历史恢复编排整体移到 `src/ui/playground-conversation-state-controller.ts`。这组逻辑是 canonical state 落地边界，必须整体搬迁，不能拆成半截导致刷新恢复和 active run 壳层互相看不见。
- 影响范围：函数名、调用顺序、消息 diff / patch、滚动位置保护、active run 过程壳层挂载、历史补页入口和 sync token 校验语义保持不变；`src/ui/playground.ts` 只负责注入控制器与初始化装配。新增 `test/playground-conversation-state-controller.test.ts` 锁定 canonical state 控制器边界。
- 对应入口：`src/ui/playground-conversation-state-controller.ts`、`src/ui/playground.ts`、`test/playground-conversation-state-controller.test.ts`、`docs/playground-current.md`、`AGENTS.md`

### Playground 会话同步 ownership 控制器拆分
- 日期：2026-04-26
- 主题：把 `src/ui/playground.ts` 里的会话 state 请求 ownership token、AbortController 清理、陈旧回包判断和 active run 续订协调 helper 拆到 `src/ui/playground-conversation-sync-controller.ts`。这些逻辑是刷新恢复和跨会话切换的防护栏，不应该和 canonical state DOM 渲染挤在同一段代码里。
- 影响范围：`abortConversationStateSync()`、`releaseConversationStateSyncToken()`、`isConversationStateAbortError()`、`invalidateConversationSyncOwnership()`、`issueConversationSyncToken()`、`isConversationSyncTokenCurrent()`、`shouldApplyConversationState()`、`reconcileSyncedConversationState()` 函数名和调用语义保持不变；`syncConversationRunState()`、`renderConversationState()` 和 `restoreConversationHistoryFromServer()` 仍留在 `src/ui/playground.ts` 编排层。新增 `test/playground-conversation-sync-controller.test.ts` 锁定 ownership helper 边界。
- 对应入口：`src/ui/playground-conversation-sync-controller.ts`、`src/ui/playground.ts`、`test/playground-conversation-sync-controller.test.ts`、`docs/playground-current.md`、`docs/traceability-map.md`、`AGENTS.md`

### Playground 过程与技能控制器拆分
- 日期：2026-04-26
- 主题：把 `src/ui/playground.ts` 里的停止意图识别、过程摘要/叙述、流式过程状态、技能清单展示 helper 拆到 `src/ui/playground-process-controller.ts`。这些函数被 stream、asset、transcript 和移动菜单共同调用，属于过程展示边界，不该继续挤在页面装配层。
- 影响范围：`isInterruptIntentMessage()`、`summarizeDetail()`、`formatProcessAction()`、`formatSkillsReply()`、`describeProcessNarration()`、`appendProcessEvent()`、`updateStreamingProcess()`、`resetStreamingState()`、`loadSkills()` 函数名和浏览器脚本作用域保持不变；`src/ui/playground.ts` 只负责注入控制器。新增 `test/playground-process-controller.test.ts` 锁定过程/技能 helper 边界。
- 对应入口：`src/ui/playground-process-controller.ts`、`src/ui/playground.ts`、`test/playground-process-controller.test.ts`、`docs/playground-current.md`、`AGENTS.md`

### Playground 上下文用量控制器收口
- 日期：2026-04-26
- 主题：把 `src/ui/playground.ts` 里残留的 `toggleContextUsageDetails()` 和 `syncContextUsage()` 移入 `src/ui/playground-context-usage-controller.ts`。上下文用量的展开、移动端详情弹层、状态接口同步和错误兜底本来就属于同一个控制器，继续留在主脚本里只是让页面装配层背业务逻辑锅。
- 影响范围：函数名和调用语义保持不变；`contextUsageShell` 点击、composer 输入 debounce、会话状态同步和发送前后占用刷新仍调用同名 helper。新增 `test/playground-context-usage-controller.test.ts` 锁定控制器拥有 toggle / sync 边界。
- 对应入口：`src/ui/playground-context-usage-controller.ts`、`src/ui/playground.ts`、`test/playground-context-usage-controller.test.ts`、`docs/playground-current.md`、`AGENTS.md`

### Playground 本地历史存储拆分
- 日期：2026-04-26
- 主题：把 `src/ui/playground.ts` 里的 localStorage 历史索引、附件 / 资产 / 文件克隆、最近历史持久化和 transient network 错误过滤拆到 `src/ui/playground-conversation-history-store.ts`。这块是浏览器端历史缓存边界，不该继续混在会话恢复、分页补页和 DOM 渲染编排里。
- 影响范围：`getConversationHistoryStorageKey()`、`readConversationHistoryIndex()`、`writeConversationHistoryIndex()`、`cloneHistoryAttachments()`、`cloneHistoryAssetRefs()`、`cloneHistoryFiles()`、`loadConversationHistoryEntries()`、`persistConversationHistory()`、`scheduleConversationHistoryPersist()`、`flushConversationHistoryPersist()` 函数名和调用语义保持不变；`restoreConversationHistory()` / `restoreConversationHistoryFromServer()` 仍留在 `src/ui/playground.ts`。新增 `test/playground-conversation-history-store.test.ts` 锁定本地历史存储脚本边界。
- 对应入口：`src/ui/playground-conversation-history-store.ts`、`src/ui/playground.ts`、`test/playground-conversation-history-store.test.ts`、`docs/playground-current.md`、`docs/traceability-map.md`、`AGENTS.md`

### Playground 历史补页控制器拆分
- 日期：2026-04-26
- 主题：把 `src/ui/playground.ts` 里的更早历史补页 helper 拆到 `src/ui/playground-history-pagination-controller.ts`。触顶加载历史、补服务端分页、prepend DOM、保持滚动位置这些逻辑跟会话恢复相关，但不是 sync ownership 本体，继续塞在主脚本里会让“为什么一上滑就跳位置”这种问题很难查。
- 影响范围：`hasOlderConversationHistory()`、`syncHistoryAutoLoadStatus()`、`fetchOlderConversationHistoryFromServer()`、`renderMoreConversationHistory()` 函数名和调用语义保持不变；`restoreConversationHistory()`、`restoreConversationHistoryFromServer()` 和会话 sync token 仍留在 `src/ui/playground.ts` 编排层。新增 `test/playground-history-pagination-controller.test.ts` 锁定补页、prepend 和滚动补偿逻辑。
- 对应入口：`src/ui/playground-history-pagination-controller.ts`、`src/ui/playground.ts`、`test/playground-history-pagination-controller.test.ts`、`docs/playground-current.md`、`docs/traceability-map.md`、`AGENTS.md`

### Playground active run 归一化拆分
- 日期：2026-04-26
- 主题：把 `src/ui/playground.ts` 里的 `normalizeActiveRun()`、`normalizeProcessView()` 和 `formatProcessViewEntry()` 拆到 `src/ui/playground-active-run-normalizer.ts`。active run 是刷新恢复、流式续订和助手状态壳层的关键数据边界，归一化逻辑混在渲染编排里，后面一查“为什么 loading 还在 / process 文案不对”就很难下手。
- 影响范围：active run / process view 的字段兜底、状态白名单、输入资产归一化、队列归一化和 process narration 生成语义保持不变；`src/ui/playground.ts` 仍负责查找已渲染助手消息、应用 process view 和 DOM 更新。新增 `test/playground-active-run-normalizer.test.ts` 锁定归一化脚本片段。
- 对应入口：`src/ui/playground-active-run-normalizer.ts`、`src/ui/playground.ts`、`test/playground-active-run-normalizer.test.ts`、`docs/playground-current.md`、`docs/traceability-map.md`、`AGENTS.md`

### Playground 会话 API 控制器拆分
- 日期：2026-04-26
- 主题：把 `src/ui/playground.ts` 里的 `fetchConversationRunStatus()`、`fetchConversationState()`、`fetchConversationHistoryPage()` 拆到 `src/ui/playground-conversation-api-controller.ts`。这三段只是前端请求与 payload 归一化，不该继续夹在 DOM 状态、布局控制和会话渲染中间；否则一查 `/v1/chat/state` 分页问题就像在电线杆上找耳机线。
- 影响范围：三个浏览器函数名、请求路径、错误兜底、`historyPage` 默认值、`normalizeContextUsage()` 与 `normalizeActiveRun()` 调用语义保持不变；会话 sync ownership、DOM diff 渲染、历史补页入口仍留在 `src/ui/playground.ts` 当前编排层。新增 `test/playground-conversation-api-controller.test.ts` 锁定 status / state / history 三个前端请求入口。
- 对应入口：`src/ui/playground-conversation-api-controller.ts`、`src/ui/playground.ts`、`test/playground-conversation-api-controller.test.ts`、`docs/playground-current.md`、`docs/traceability-map.md`、`AGENTS.md`

### Playground 状态控制器拆分
- 日期：2026-04-26
- 主题：把 `src/ui/playground.ts` 里的 stage mode、顶部命令状态、loading 忙态、error banner 和控制动作错误文案拆到 `src/ui/playground-status-controller.ts`。这些函数被 stream、conversation、asset、task inbox、conn 和 transcript 多处调用，继续藏在主脚本中段，后续排查“按钮为什么禁用 / 状态为什么没恢复 / 错误为什么没清掉”就只能靠翻山越岭，太土了。
- 影响范围：`setStageMode()`、`setCommandStatus()`、`setLoading()`、`showError()`、`clearError()`、`getControlActionErrorMessage()` 的函数名和全局调用语义保持不变；主页面仍按原顺序注入 status helper 后再注入 layout、mobile、theme、conversation、transcript 和 stream 相关控制器。新增 `test/playground-status-controller.test.ts` 锁定按钮忙态、状态文案、错误文案和 drawer 收口调用。
- 对应入口：`src/ui/playground-status-controller.ts`、`src/ui/playground.ts`、`test/playground-status-controller.test.ts`、`docs/playground-current.md`、`docs/traceability-map.md`、`AGENTS.md`

### Playground 实时通知 toast 控制器拆分
- 日期：2026-04-26
- 主题：把 `src/ui/playground.ts` 里的实时通知 toast helper 拆到 `src/ui/playground-notification-controller.ts`。`playground-stream-controller.ts` 已经负责 SSE 连接和重连，主脚本继续混着事件规范化、toast DOM 拼装、live region 显隐和自动移除，只会让通知链路像一坨散装电线。
- 影响范围：`clearNotificationReconnectTimer()`、`normalizeNotificationBroadcastEvent()`、`showNotificationToast()`、`removeNotificationToast()` 等浏览器函数名和调用语义保持不变；`/v1/notifications/stream` 的连接生命周期仍由 `src/ui/playground-stream-controller.ts` 控制。新增 `test/playground-notification-controller.test.ts` 锁定事件规范化、toast 挂载、当前会话文案和自动移除逻辑。
- 对应入口：`src/ui/playground-notification-controller.ts`、`src/ui/playground-stream-controller.ts`、`src/ui/playground.ts`、`test/playground-notification-controller.test.ts`、`docs/playground-current.md`、`docs/traceability-map.md`、`AGENTS.md`

### Playground 确认弹窗控制器拆分
- 日期：2026-04-26
- 主题：把 `src/ui/playground.ts` 里的 `openConfirmDialog()` / `closeConfirmDialog()` 抽到 `src/ui/playground-confirm-dialog-controller.ts`。确认弹窗本来就是删除会话、删除后台任务等危险动作的公共边界，继续塞在主脚本里，只会让后续维护者在几千行浏览器脚本里翻 Promise resolve、焦点恢复和默认文案，属实没必要。
- 影响范围：`renderPlaygroundPage()` 注入顺序保持为焦点 helper 之后、确认弹窗控制器前后无外部行为变化；确认弹窗仍复用 `state.confirmDialogResolve`、`state.confirmDialogRestoreFocusElement`、`rememberPanelReturnFocus()` 和 `releasePanelFocusBeforeHide()`。新增 `test/playground-confirm-dialog-controller.test.ts` 锁定函数名、焦点释放、默认文案和 tone 写入。
- 对应入口：`src/ui/playground-confirm-dialog-controller.ts`、`src/ui/playground.ts`、`test/playground-confirm-dialog-controller.test.ts`、`docs/playground-current.md`、`docs/traceability-map.md`、`AGENTS.md`

### Playground 静态页面 shell 拆分
- 日期：2026-04-26
- 主题：把 `renderPlaygroundPage()` 里的外层 HTML shell、顶部栏、历史抽屉、主舞台、共享弹层和 vendor script 装配拆到 `src/ui/playground-page-shell.ts`。`playground.ts` 继续瘦身，只负责生成 styles、browser script 和各业务静态片段后传给 shell 渲染器；否则主文件迟早又变成“HTML、CSS、JS 三明治”，维护者看一眼血压就上来了。
- 影响范围：新增 `renderPlaygroundHtml()`，通过参数注入 `styles`、`markedBrowserScript`、`playgroundScript`、任务消息视图、conn 弹层和资产弹层；`renderPlaygroundPage()` 的对外导出不变，`/playground` 页面结构和脚本注入顺序保持不变。新增 `test/playground-page-shell.test.ts` 锁定 shell 对注入片段的拼装语义。
- 对应入口：`src/ui/playground-page-shell.ts`、`src/ui/playground.ts`、`test/playground-page-shell.test.ts`、`docs/playground-current.md`、`docs/traceability-map.md`、`AGENTS.md`

### Playground 基础样式模块拆分
- 日期：2026-04-26
- 主题：把 `src/ui/playground.ts` 里的巨大 `getPlaygroundStyles()` 静态样式块拆到 `src/ui/playground-styles.ts`。主页面入口本来就要装配 HTML、浏览器脚本、Markdown vendor 注入和各种控制器，再继续背几千行 CSS，后续 agent 修一个移动断点都得从脚本和 DOM 里穿过去，维护体验很烂。
- 影响范围：`renderPlaygroundPage()` 仍然通过 `<style>${getPlaygroundStyles()}</style>` 注入同一份 CSS；样式依赖的资产、conn、任务消息和主题 style fragment 改由 `playground-styles.ts` 导入，`playground.ts` 只保留页面结构与脚本装配。新增 `test/playground-styles.test.ts` 锁定移动 active transcript rail 的 `inset: auto` 回归约束。
- 对应入口：`src/ui/playground-styles.ts`、`src/ui/playground.ts`、`test/playground-styles.test.ts`、`docs/playground-current.md`、`docs/traceability-map.md`、`AGENTS.md`

### 手机端消息轨道右偏修复
- 日期：2026-04-26
- 主题：修复手机端 active 对话里用户 / 助手气泡整列向右偏移、右侧贴边甚至裁切的问题。根因是移动端消息轨道仍间接受桌面 `--conversation-width` / composer 宽度推导影响，最终 active `.stream-layout` 和 transcript 容器缺少 `width / min-width / max-width` 的硬边界。手机端还拿桌面宽度逻辑兜底，属于典型“桌面布局压成移动端”的坑。
- 影响范围：`src/ui/playground.ts` 在 `max-width: 640px` 下为 `.stream-layout`、landing active `.stream-layout`、`.transcript-pane` 和 `.transcript` 增加 `width: 100%`、`min-width: 0`、`max-width: 100%` 约束；`test/server.test.ts` 增加精确 CSS block 断言，避免后续又被宽松正则糊过去。`docs/playground-current.md` 同步手机端轨道约束。
- 追加校准：实际浏览器测量发现 active 桌面规则里的 `inset: 18px 34px ...` 仍会在移动端以相对偏移形式生效，导致 `.stream-layout` 从 `left=43` 延伸到视口外；移动断点现在同等优先级重置 `position: relative` 与 `inset: auto`，测试同步要求该约束存在。
- 对应入口：`src/ui/playground.ts`、`test/server.test.ts`、`docs/playground-current.md`

### 文件库加载提示降噪
- 日期：2026-04-26
- 主题：移除打开 / 刷新文件库时写入 transcript 的“资产清单 · 请求 /v1/assets”和“资产清单已加载 · N”过程提示。正常加载本来就应该在文件库页面里体现，把内部请求流水账塞进聊天流，只会把用户界面搞得像调试控制台。
- 影响范围：`src/ui/playground-assets-controller.ts` 的 `loadAssets()` 保留 `/v1/assets?limit=40` 请求、列表渲染、按钮忙态和失败提示，只删除正常请求与成功路径的 `appendProcessEvent()`；`test/server.test.ts` 增加页面断言，确保资产库仍请求接口但不再输出这两条过程提示。`docs/playground-current.md` 同步当前 UI 口径。
- 对应入口：`src/ui/playground-assets-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`

### Playground 弹层焦点控制器拆分
- 日期：2026-04-26
- 主题：把 `src/ui/playground.ts` 中多个弹层共用的焦点释放与返回焦点 helper 拆到独立浏览器脚本模块。`playground.ts` 已经够臃肿了，继续把确认框、文件库、任务消息和后台任务的通用焦点边界塞在主脚本里，后面排查弹层关闭后焦点乱跳时就会像翻垃圾堆。
- 影响范围：新增 `src/ui/playground-panel-focus-controller.ts` 与 `test/playground-panel-focus-controller.test.ts`，主页面通过 `getPlaygroundPanelFocusControllerScript()` 注入原有 helper；`rememberPanelReturnFocus()`、`releasePanelFocusBeforeHide()`、`restoreFocusAfterPanelClose()` 等函数名与调用语义保持不变。`AGENTS.md`、`docs/traceability-map.md` 和 `docs/playground-current.md` 同步新的维护入口。
- 对应入口：`src/ui/playground-panel-focus-controller.ts`、`src/ui/playground.ts`、`test/playground-panel-focus-controller.test.ts`、`docs/playground-current.md`、`docs/traceability-map.md`、`AGENTS.md`

### Conn 路由 response presenter 拆分
- 日期：2026-04-26
- 主题：把 `src/routes/conns.ts` 里的 conn / run / file / event 响应体映射拆到独立 presenter。`conns.ts` 已经承担 HTTP 编排、请求解析、状态变更和 run 查询，再继续把 DTO 映射塞在底部，只会让后续排查“接口字段为什么这样返回”时像翻旧账本一样烦。
- 影响范围：新增 `src/routes/conn-route-presenters.ts` 与 `test/conn-route-presenters.test.ts`，集中提供 `toConnListBody()`、`toConnRunBody()`、`toConnRunFileBody()` 和 `toConnRunEventBody()`；`src/routes/conns.ts` 改为导入这些纯映射函数，`GET /v1/conns`、run detail、run events 等响应结构保持不变。`AGENTS.md` 与 `docs/traceability-map.md` 同步新的排查入口。
- 对应入口：`src/routes/conn-route-presenters.ts`、`src/routes/conns.ts`、`test/conn-route-presenters.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### Agent activity 投递数据库级去重
- 日期：2026-04-26
- 主题：把任务消息投递去重从应用层“先查再插”升级到数据库约束。之前 `AgentActivityStore.create()` 虽然会先查同一个 `source/sourceId/runId`，但 `agent_activity_items` 只有普通索引，多 worker 或异常重放时仍可能插出重复任务消息。这种去重方式说好听叫乐观，说难听点就是纸门锁。
- 影响范围：`ConnDatabase` 升级到 `user_version=3`，为 `agent_activity_items(source, source_id, run_id)` 增加 `run_id IS NOT NULL` 的唯一索引，并在迁移时清理同源 run 的重复历史行；`AgentActivityStore.create()` 遇到 SQLite 唯一约束冲突时会回读并返回已存在的 activity，避免并发窗口变成 worker warning。新增数据库唯一约束和并发插入胜出回归测试。
- 对应入口：`src/agent/conn-db.ts`、`src/agent/agent-activity-store.ts`、`test/conn-db.test.ts`、`test/agent-activity-store.test.ts`、`docs/runtime-assets-conn-feishu.md`

### Session JSONL 全量历史读取容错
- 日期：2026-04-26
- 主题：统一 session JSONL 历史读取的坏行容错。之前 recent window 读取会跳过坏 JSON 行，但全量 `readSessionMessages()` 直接 `JSON.parse()`，旧会话里只要混进一行半截 JSON，就能把空闲会话的历史 / 状态恢复打崩。同一个文件两套容错口径，属于维护者看了会皱眉的低级不一致。
- 影响范围：`readSessionMessagesFromJsonl()` 复用 `parseSessionMessageLines()`，和 recent window 路径一样跳过空行、坏 JSON 行和非 message 事件；合法 message 的 timestamp 继承语义保持不变。`test/agent-session-factory.test.ts` 在全量历史读取用例中加入坏 JSON 行回归。
- 对应入口：`src/agent/agent-session-factory.ts`、`test/agent-session-factory.test.ts`

### AssetStore 资产索引读边界防护
- 日期：2026-04-26
- 主题：收口 `asset-index.json` 脏数据对文件库和下载入口的影响。之前资产索引读盘后几乎直接交给业务层，畸形条目缺少 `createdAt` 会让 `GET /v1/assets` 排序抛错；`hasContent=true` 但 `blobPath` 指到 blobs 目录外时，列表仍可能暴露下载链接，点开再 404，用户只会觉得文件库抽风。
- 影响范围：`AssetStore` 读索引时会过滤不可用条目，校正 MIME / 文件名 / size / kind / source，且只在 `blobPath` 位于配置的 blobs 目录内时保留 `hasContent` 和下载链接；不安全 blob 会降级为仅元数据资产。新增回归测试覆盖畸形条目排序和越界 blobPath 降级。
- 对应入口：`src/agent/asset-store.ts`、`test/asset-store.test.ts`、`docs/runtime-assets-conn-feishu.md`

### ConversationStore 会话索引读边界防护
- 日期：2026-04-26
- 主题：收口会话索引 JSON 脏数据对 playground 当前会话恢复的影响。之前 `ConversationStore` 会原样信任 `currentConversationId`，即使它已经指向不存在的会话；畸形会话条目缺少 `updatedAt` 时还会在列表排序阶段抛 `TypeError`。这类问题看起来像“小概率坏文件”，实际上线上重启、手工排障、半截写入恢复后最容易把首页拖进假死，属于该清就清的低级坑。
- 影响范围：`ConversationStore` 读盘时会把悬空 `currentConversationId` 规整到最近更新的有效会话；畸形会话条目会用 `1970-01-01T00:00:00.000Z` 作为排序兜底，并只对畸形条目补 `messageCount: 0`，正常旧索引缺失字段保持原兼容形状。新增回归测试覆盖悬空 current 指针与畸形 entries 列表排序。
- 对应入口：`src/agent/conversation-store.ts`、`test/conversation-store.test.ts`

### Conn run runtime 写入 lease owner 防护
- 日期：2026-04-26
- 主题：继续收紧 conn run 被新 worker 接管后的迟到写入问题。上一刀防住了终态，但旧 worker 仍可能把 `sessionFile`、过程事件或输出文件索引写进已被新 worker 接管的 run，结果就是状态没被污染，排障日志却混进幽灵进度，照样恶心。
- 影响范围：`UpdateConnRunRuntimeInput`、`AppendConnRunEventInput` 和 `RecordConnRunFileInput` 新增可选 `leaseOwner`；带 owner 时只有 `status='running'` 且 `lease_owner` 匹配才允许写 runtime metadata、event 和 file，否则返回 `undefined`。`BackgroundAgentRunner` 的 workspace / snapshot / session event / success / failure / output file 写入，以及 `ConnWorker` 的 timeout event 写入都传入当前 owner；stale recovery 仍保留无 owner 的强制回收事件语义。`test/conn-run-store.test.ts` 增加 stale owner metadata / event / file 回归测试，`docs/runtime-assets-conn-feishu.md` 同步运行口径。
- 对应入口：`src/agent/conn-run-store.ts`、`src/agent/background-agent-runner.ts`、`src/workers/conn-worker.ts`、`test/conn-run-store.test.ts`、`docs/runtime-assets-conn-feishu.md`

### Conn run 终态写入 lease owner 防护
- 日期：2026-04-26
- 主题：修复过期 worker 仍可完成已被新 worker 接管的 conn run 的风险。之前 `completeRun()` / `failRun()` 只按 `runId` 更新终态，worker-a 租约过期后如果 worker-b 已经重领，worker-a 的迟到完成仍能把 run 标成成功并污染 owning conn 的 `lastRunId`，这类竞态一旦发生排障会非常难看。
- 影响范围：`CompleteConnRunInput` 与 `FailConnRunInput` 新增可选 `leaseOwner`；带 owner 时 `ConnRunStore` 只允许 `status='running'` 且 `lease_owner` 匹配的 worker 写入终态，更新不到行时返回 `undefined` 且不更新 owning conn。`BackgroundAgentRunner` 和 `ConnWorker` 的正常完成 / 失败路径会传入当前 lease owner；stale recovery 仍保留无 owner 的强制回收语义。`test/conn-run-store.test.ts` 增加过期 worker 迟到完成的回归测试，`docs/runtime-assets-conn-feishu.md` 同步运行口径。
- 对应入口：`src/agent/conn-run-store.ts`、`src/agent/background-agent-runner.ts`、`src/workers/conn-worker.ts`、`test/conn-run-store.test.ts`、`docs/runtime-assets-conn-feishu.md`

### Feishu message parser 单测补齐
- 日期：2026-04-26
- 主题：补齐 Feishu 入站消息 parser 的独立测试。之前文本、文件、图片和坏 JSON 解析主要靠 `FeishuService` 集成测试间接兜着，真出问题时定位路径太绕，像隔着三层墙听水管漏水。
- 影响范围：新增 `test/feishu-message-parser.test.ts`，直接覆盖 `getFeishuEventType()` 的 top-level / nested header 读取，以及 `parseFeishuInboundMessage()` 对文本、文件、图片、无效 JSON 和畸形 message envelope 的处理；生产代码不变。`docs/traceability-map.md` 同步 Feishu parser 与测试入口。
- 对应入口：`src/integrations/feishu/message-parser.ts`、`test/feishu-message-parser.test.ts`、`docs/traceability-map.md`

### Feishu webhook 异步测试等待收口
- 日期：2026-04-26
- 主题：把 Feishu webhook 测试里的固定 `20ms` 睡眠改为按副作用完成条件轮询等待。`handleWebhook()` 本来就是先接受请求、再后台处理事件，测试还靠拍脑袋睡 20ms，机器稍微忙一点就会假失败，这种脆弱测试很会浪费维护时间。
- 影响范围：`test/feishu-service.test.ts` 新增基于 predicate 的 `waitForAsyncWebhookSideEffects()`，文本入站和附件入站两条测试分别等待 queue/chat 调用与 delivery 完成后再断言；生产代码、Feishu webhook 行为、队列模式和交付逻辑不变。
- 对应入口：`test/feishu-service.test.ts`

### Notification 广播 parser 拆分
- 日期：2026-04-26
- 主题：把实时通知内部广播 payload 解析从 `src/routes/notifications.ts` 拆到独立 helper。SSE 连接管理和广播请求校验是两类边界逻辑，继续混在一个路由文件里，后面要查“为什么通知没弹”时就得先穿过一堆字段校验废话。
- 影响范围：新增 `src/routes/notification-route-utils.ts` 与 `test/notification-route-utils.test.ts`，集中提供 `parseNotificationBroadcastEvent()`；`src/routes/notifications.ts` 保留 SSE header、订阅释放和广播响应编排，`POST /v1/internal/notifications/broadcast` 的必填字段、`notificationId` / `activityId` 兜底、可选 `conversationId` / `runId` 裁剪和 `202` 响应语义保持不变。`AGENTS.md` 与 `docs/traceability-map.md` 同步新的排查入口。
- 对应入口：`src/routes/notification-route-utils.ts`、`src/routes/notifications.ts`、`test/notification-route-utils.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### Activity 路由工具 helper 拆分
- 日期：2026-04-26
- 主题：把任务消息列表查询解析、分页 limit 规整和 `AgentActivityItem` 响应体转换从 `src/routes/activity.ts` 拆到独立 helper。任务消息接口本身已经承担 summary、分页列表、单条已读和全部已读，再把 query parser 和 DTO 映射也塞在一起，就是典型入口层继续发胖。
- 影响范围：新增 `src/routes/activity-route-utils.ts` 与 `test/activity-route-utils.test.ts`，集中提供 `parseActivityListOptions()`、`normalizeActivityListLimit()` 和 `toActivityBody()`；`src/routes/activity.ts` 改为只保留 HTTP 编排，`GET /v1/activity` 的 `limit`、`conversationId`、`before`、`unreadOnly` 解析、分页多取一条、`unreadCount` 返回和已读接口语义保持不变。`AGENTS.md` 与 `docs/traceability-map.md` 同步新的排查入口。
- 对应入口：`src/routes/activity-route-utils.ts`、`src/routes/activity.ts`、`test/activity-route-utils.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### 文件路由工具 helper 拆分
- 日期：2026-04-26
- 主题：把 multipart 上传附件转换、上传大小错误识别、下载 `Content-Disposition` / MIME 处理、本地 artifact 路径白名单解析从 `src/routes/files.ts` 拆到独立 helper。文件路由同时管上传、下载和本地文件桥接，继续把安全边界工具函数塞在路由底部，后续排障就是在刀尖上跳舞。
- 影响范围：新增 `src/routes/file-route-utils.ts` 与 `test/file-route-utils.test.ts`，集中提供 `toMultipartAttachment()`、`resolveLocalArtifactPath()`、`buildContentDispositionHeader()`、`resolveFileResponseContentType()`、`supportsInlinePreview()` 等 helper；`src/routes/files.ts` 改为只保留 HTTP 编排，`/v1/assets/upload`、`/v1/files/:fileId`、`/v1/local-file` 的上传限制、文本预览、下载 header、inline preview 和 public/runtime 白名单语义保持不变。`AGENTS.md` 与 `docs/traceability-map.md` 同步新的排查入口。
- 对应入口：`src/routes/file-route-utils.ts`、`src/routes/files.ts`、`test/file-route-utils.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### Agent process text helper 拆分
- 日期：2026-04-26
- 主题：把工具过程 payload 格式化、空字符清理、嵌套文本提取和 assistant 文本块合并从 `AgentService` 拆到独立 helper。工具输出清洗是纯文本边界逻辑，不该继续挂在聊天服务主类里当私有杂物。
- 影响范围：新增 `src/agent/agent-process-text.ts` 与 `test/agent-process-text.test.ts`，集中提供 `formatProcessPayload()`、`normalizeProcessText()` 和 `extractAssistantText()`；`src/agent/agent-service.ts` 改为导入这些 helper，流式工具过程、空字符清理、JSON fallback、assistant final text fallback 和本地 artifact 链接重写保持不变。`AGENTS.md` 与 `docs/traceability-map.md` 同步新的排查入口。
- 对应入口：`src/agent/agent-process-text.ts`、`src/agent/agent-service.ts`、`test/agent-process-text.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### Agent conversation history helper 拆分
- 日期：2026-04-26
- 主题：把 conversation history 分页、active run 视图去重、terminal input echo 隐藏、assistant 连续消息合并、历史文件卡片挂载等纯逻辑从 `AgentService` 拆到独立 helper。刷新恢复和历史分页这块最怕“顺手一改”，继续让它埋在服务主文件底部就是给后续维护挖坑。
- 影响范围：新增 `src/agent/agent-conversation-history.ts` 与 `test/agent-conversation-history.test.ts`，集中提供 `buildConversationViewMessages()`、`paginateConversationHistoryMessages()`、`derivePersistedTurnCoverageFromRunTail()`、`appendConversationHistoryMessage()`、`attachConversationHistoryFiles()` 等 helper；`src/agent/agent-service.ts` 改为导入这些纯逻辑，`GET /v1/chat/state`、`GET /v1/chat/history`、active run terminal snapshot、文件卡片合并和历史分页语义保持不变。`AGENTS.md` 与 `docs/traceability-map.md` 同步新的排查入口。
- 对应入口：`src/agent/agent-conversation-history.ts`、`src/agent/agent-service.ts`、`test/agent-conversation-history.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### Agent session event 守卫拆分
- 日期：2026-04-26
- 主题：把 raw agent session event 的类型守卫从 `AgentService` 拆到独立 helper。工具事件、消息事件、queue 事件的形状判断是输入边界，不是聊天服务生命周期本身；继续塞在主文件底部，就是给后续排障制造噪音。
- 影响范围：新增 `src/agent/agent-session-event-guards.ts` 与 `test/agent-session-event-guards.test.ts`，集中提供 `isMessageUpdateEvent()`、`isToolExecutionStartEvent()`、`isToolExecutionUpdateEvent()`、`isToolExecutionEndEvent()` 和 `isQueueUpdateEvent()`；`src/agent/agent-service.ts` 改为导入这些守卫，流式事件处理、工具输出提取、queue 更新和错误处理逻辑保持不变。`AGENTS.md` 与 `docs/traceability-map.md` 同步新的排查入口。
- 对应入口：`src/agent/agent-session-event-guards.ts`、`src/agent/agent-service.ts`、`test/agent-session-event-guards.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### Agent active run 视图 helper 拆分
- 日期：2026-04-26
- 主题：把 active run 视图创建、过程区条目追加、完成标记、状态 id 规整和深拷贝从 `AgentService` 拆到独立 helper。`AgentService` 应该管 run lifecycle，不应该把 UI 状态对象的每个小零件也攥在手里；这类膨胀迟早把维护者拖进泥潭。
- 影响范围：新增 `src/agent/agent-active-run-view.ts` 与 `test/agent-active-run-view.test.ts`，集中提供 `createActiveRunView()`、`appendProcessEntry()`、`completeProcess()`、`cloneActiveRunView()` 和 `sanitizeStateId()`；`src/agent/agent-service.ts` 改为导入这些 helper，active run 的 `runId` / `assistantMessageId` 形态、过程区 narration、queue 深拷贝和浏览器清理 scope 保持不变。`AGENTS.md` 与 `docs/traceability-map.md` 同步新的排查入口。
- 对应入口：`src/agent/agent-active-run-view.ts`、`src/agent/agent-service.ts`、`test/agent-active-run-view.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### Chat 路由请求 parser 拆分
- 日期：2026-04-26
- 主题：把聊天入口的 message、attachments、assetRefs、queue mode 和分页 limit 解析从 `src/routes/chat.ts` 拆到独立 helper。聊天路由已经要承接 SSE、续订、队列、打断和历史接口，再把请求体字段校验也堆在里面，就是典型“入口层越写越胖”的老毛病。
- 影响范围：新增 `src/routes/chat-route-parsers.ts` 和 `test/chat-route-parsers.test.ts`，集中提供 `parseChatMessageBody()`、`parseQueueMessageBody()`、`parseOptionalPositiveInteger()` 与 `isValidConversationId()`；`src/routes/chat.ts` 改为复用这些 parser，`/v1/chat`、`/v1/chat/stream`、`/v1/chat/queue` 的附件校验、资产引用裁剪、消息原文保留、队列模式错误文案和 SSE 错误事件字段保持不变。`AGENTS.md` 与 `docs/traceability-map.md` 同步新的排查入口。
- 对应入口：`src/routes/chat-route-parsers.ts`、`src/routes/chat.ts`、`test/chat-route-parsers.test.ts`、`AGENTS.md`、`docs/traceability-map.md`

### Conn 路由请求 parser 拆分
- 日期：2026-04-26
- 主题：把 `POST /v1/conns`、`PATCH /v1/conns/:connId` 和 `POST /v1/conns/bulk-delete` 的请求解析从 `src/routes/conns.ts` 拆到独立 parser 模块。路由文件继续同时负责 HTTP、store、run 查询、响应转换和一堆字段校验，那就是把入口层当垃圾桶用；现在至少把纯输入解析拿出去。
- 影响范围：新增 `src/routes/conn-route-parsers.ts`，集中放置 target、schedule、assetRefs、profile/runtime id、upgradePolicy、maxRunMs 和 conn id list 解析；`src/routes/conns.ts` 改为导入 `parseConnMutationBody()` 与 `parseConnIdList()`，API 状态码、错误文案、默认 `task_inbox` 目标和响应结构保持不变。`docs/runtime-assets-conn-feishu.md` 与 `docs/traceability-map.md` 同步新的排查入口。
- 对应入口：`src/routes/conn-route-parsers.ts`、`src/routes/conns.ts`、`docs/runtime-assets-conn-feishu.md`、`docs/traceability-map.md`

### Agent 文件历史 helper 拆分
- 日期：2026-04-26
- 主题：把 `send_file` 工具结果解析、agent 文件合并、历史消息文件卡片合并从 `AgentService` 主文件拆到独立 helper。文件交付不是 run lifecycle 本身，继续把这些纯 normalization 函数塞在 1800 行服务中枢底部，只会让后续维护者为了一个文件卡片问题去翻整条聊天主链路。
- 影响范围：新增 `src/agent/agent-file-history.ts`，集中提供 `extractSendFileArtifact()`、`extractConversationHistoryFiles()`、`mergeAgentFiles()` 和 `mergeConversationHistoryFiles()`；`src/agent/agent-service.ts` 改为导入这些纯 helper，流式事件、canonical history、synthetic assistant 文件承载和用户可见链接重写语义不变。`AGENTS.md`、`docs/runtime-assets-conn-feishu.md` 和 `docs/traceability-map.md` 同步新的文件交付排查入口。
- 对应入口：`src/agent/agent-file-history.ts`、`src/agent/agent-service.ts`、`AGENTS.md`、`docs/runtime-assets-conn-feishu.md`、`docs/traceability-map.md`

### Feishu 会话映射并发写入收口
- 日期：2026-04-26
- 主题：修复飞书 webhook 并发创建 chat 到本地 `conversationId` 映射时的 JSON 覆盖风险。之前 `FeishuConversationMapStore.getOrCreate()` 是读完整映射、改内存对象、直接 `writeFile()` 覆盖；多个群聊同时进来时，后写入者可以把先写入者洗掉。这种问题平时不吭声，一到真实 IM 流量就开始装死，很不体面。
- 影响范围：`src/integrations/feishu/conversation-map-store.ts` 新增进程内写队列和 `mutateIndex()`，读操作等待已排队写入完成，写入改为同目录临时文件 + `rename` 原子替换，失败时清理临时文件；`test/feishu-service.test.ts` 增加 24 路并发 `getOrCreate()` 回归，锁住所有飞书 chat 映射都能保留；`docs/runtime-assets-conn-feishu.md` 与 `docs/traceability-map.md` 同步 Feishu 映射存储入口。
- 对应入口：`src/integrations/feishu/conversation-map-store.ts`、`test/feishu-service.test.ts`、`docs/runtime-assets-conn-feishu.md`、`docs/traceability-map.md`

### Playground markdown renderer helper 拆分
- 日期：2026-04-26
- 主题：把 `renderPlaygroundMarkdown()` 及其 `marked` 配置从 `src/ui/playground.ts` 拆到独立 helper。主页面装配文件已经够胖了，继续把服务器端纯文本渲染器塞在顶部，只会让后续维护者在 UI 样式、浏览器脚本和 markdown 安全策略之间来回迷路。
- 影响范围：新增 `src/ui/playground-markdown.ts`，集中放置服务器端 markdown HTML 渲染、HTML 转义、链接白名单与 GFM parser 配置；`src/ui/playground.ts` 保持 `renderPlaygroundMarkdown` re-export，兼容现有 `test/server.test.ts` 导入路径，不改浏览器端 `marked.umd.js` 注入、transcript hydration、DOM 结构或 CSS。
- 对应入口：`src/ui/playground-markdown.ts`、`src/ui/playground.ts`、`test/server.test.ts`、`docs/playground-current.md`、`docs/traceability-map.md`

### Agent run event 纯 helper 拆分
- 日期：2026-04-26
- 主题：从 `AgentService` 主文件里拆出 chat run event 的纯工具函数。`cloneChatStreamEvent()` 和 `isTerminalChatStreamEvent()` 不拥有运行态，也不应该继续埋在 2000 行服务中枢底部让后续维护者翻垃圾堆。
- 影响范围：新增 `src/agent/agent-run-events.ts`，集中放置 run event clone 与 terminal event 判断；`src/agent/agent-service.ts` 改为导入该 helper，`activeRuns`、`terminalRuns`、session 生命周期和事件结构均不变。`test/agent-service.test.ts` 继续锁住 run event replay、completed run event buffer、terminal snapshot 等行为。
- 对应入口：`src/agent/agent-run-events.ts`、`src/agent/agent-service.ts`、`test/agent-service.test.ts`、`docs/traceability-map.md`

### 路由错误响应 helper 收口
- 日期：2026-04-26
- 主题：把路由层重复的 `BAD_REQUEST` / `PAYLOAD_TOO_LARGE` / `INTERNAL_ERROR` 响应拼装收口到统一 helper。之前 `chat`、`conns`、`activity`、`notifications`、`files` 各写各的错误 body，短期能跑，长期就是改一个接口漏三个地方的经典温床。
- 影响范围：新增 `src/routes/http-errors.ts`，集中提供 `sendBadRequest()`、`sendPayloadTooLarge()` 和 `sendInternalError()`；`src/routes/chat.ts`、`src/routes/conns.ts`、`src/routes/activity.ts`、`src/routes/notifications.ts`、`src/routes/files.ts` 改为复用 helper，业务 parser、状态码和响应 body 语义保持不变。顺手补齐 `/v1/chat/stream` fallback error SSE 的 `runId` 字段，让它符合 `ChatStreamEvent` 类型。
- 对应入口：`src/routes/http-errors.ts`、`src/routes/chat.ts`、`src/routes/conns.ts`、`src/routes/activity.ts`、`src/routes/notifications.ts`、`src/routes/files.ts`、`test/server.test.ts`

### 空闲会话 state 最近窗口 JSONL 尾读
- 日期：2026-04-26
- 主题：继续收口长会话切换和刷新恢复的后端成本。之前 `GET /v1/chat/state` 虽然响应层只返回最近 160 条可渲染历史，但底层仍可能先把整份 session JSONL 全量读入并解析，再在内存里截尾；这不叫优化，顶多叫把大箱子搬到门口再说“我只拿了最后一件”。现在默认 session factory 增加 `readRecentSessionMessages()`，可以从 JSONL 尾部读取最近消息窗口，并在需要上下文用量时向前补到最近的 assistant usage anchor；损坏的旧行不会让最近窗口恢复直接炸掉。
- 影响范围：`src/agent/agent-session-factory.ts` 新增 recent reader、原始 message index offset 和轻量前缀 message 计数；`src/agent/agent-service.ts` 的空闲会话 `getConversationState()` 优先使用 recent reader，保持 `GET /v1/chat/history` 游标分页和 `GET /v1/chat/status` 完整读取语义不变。`test/agent-session-factory.test.ts` 覆盖尾读、损坏行跳过、末尾无全量解析和 usage anchor；`test/agent-service.test.ts` 覆盖 state 使用 recent window 时不打开 agent session、不调用完整 reader、`session-message-*` id 与 `historyPage.nextBefore` 仍可用于补页。
- 对应入口：`src/agent/agent-session-factory.ts`、`src/agent/agent-service.ts`、`test/agent-session-factory.test.ts`、`test/agent-service.test.ts`、`docs/playground-current.md`

### AssetStore 并发索引写入收口
- 日期：2026-04-26
- 主题：修复 `AssetStore` 在同一进程内并发注册用户上传和 agent 输出资产时的索引覆盖风险。之前 `registerAttachments()`、`saveFiles()` 和 `saveFileBuffers()` 都是读完整 `asset-index.json`、改内存对象、再直接 `writeFile()` 覆盖；多个上传 / `send_file` 同时完成时，后写入者可能把先写入者的资产元数据洗掉。这个坑很低级，但破坏性不小，尤其文件卡片刷新后消失会让用户以为 agent 把文件弄丢了。
- 影响范围：`src/agent/asset-store.ts` 新增进程内写队列，所有资产索引 mutation 串行执行；`asset-index.json` 改为同目录临时文件写入后 `rename` 原子替换，失败时清理临时文件；`test/asset-store.test.ts` 增加并发 `registerAttachments()` 以及 `saveFiles()` + `registerAttachments()` 混合写入回归，锁住 24 条并发资产不丢记录且持久化 JSON 合法；`docs/runtime-assets-conn-feishu.md` 同步资产索引并发写入口径。
- 对应入口：`src/agent/asset-store.ts`、`test/asset-store.test.ts`、`docs/runtime-assets-conn-feishu.md`

### 腾讯云生产环境增量更新到 `9d3cb37`
- 日期：2026-04-26
- 主题：按增量发布流程把腾讯云新加坡生产环境从 `95b32f7` 更新到 `9d3cb37`，上线 playground slash command `/new` 指令基础。继续使用 GitHub 工作目录 `~/ugk-claw-repo`，没有整目录替换，也没有触碰 `~/ugk-claw-shared` 下的 agent 数据、sidecar 登录态或日志目录。
- 影响范围：服务器先备份 sidecar 登录态到 `/home/ubuntu/ugk-claw-shared/backups/chrome-sidecar-20260426-002901.tar.gz`，再给旧 `HEAD` 打回滚 tag `server-pre-deploy-20260426-003227`；执行 `git fetch --tags origin`、`git pull --ff-only origin main`、`docker compose --env-file ~/ugk-claw-shared/compose.env -p ugk-pi-claw -f docker-compose.prod.yml config --quiet` 与 `up --build -d`，重建 `ugk-pi` 和 `ugk-pi-conn-worker`。发布后内网 / 公网 `/healthz` 均返回 `{"ok":true}`，内网 / 公网 `/playground` 源码均包含 `parsePlaygroundSlashCommand`，`check-deps.mjs`、sidecar `9222` 和 app 到 CDP `9223` 探针均通过。
- 对应入口：`docs/tencent-cloud-singapore-deploy.md`、`docs/server-ops-quick-reference.md`

## 2026-04-25

### Playground slash command `/new` 指令基础
- 日期：2026-04-25
- 主题：新增 playground 浏览器端 slash command 分发层，并先接入 `/new`。这不是把特殊文本塞给 agent 让模型自行理解，那个做法太糙，还会污染会话历史；现在 `/new` 会在正常发送链路之前被解析并执行，直接复用现有新会话流程。
- 影响范围：`src/ui/playground-stream-controller.ts` 新增 `parsePlaygroundSlashCommand()` 与 `runPlaygroundSlashCommand()`，`sendMessage()` 在进入 `/v1/chat/stream` / `/v1/chat/queue` 前先分发指令；`/new` 调用 `startNewConversation()`，成功后清空 composer，不写 transcript、不创建 user 气泡、不触发 agent runtime；未知 `/xxx` 指令报错并保留草稿；指令携带附件或引用资产时直接拦截，避免 `/new` + 文件这种语义混乱的输入。`test/server.test.ts` 增加页面脚本回归断言，锁住指令分发入口、`/new` 处理器和“不进 stream / queue”的约束；`.codex/plans/2026-04-25-slash-command-new.md` 留存实现计划。
- 对应入口：`src/ui/playground-stream-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`、`.codex/plans/2026-04-25-slash-command-new.md`

### Playground 上下文电池按钮与 hover 浮层仪表盘化
- 日期：2026-04-25
- 主题：优化顶部上下文百分比按钮的右侧留白，修复 hover tooltip 被聊天区域卡片遮挡的问题，并把上下文 hover 内容从三行裸文本升级成小型仪表盘。按钮贴边、浮层越界、内容像 debug 文本，这三件小事叠在一起就会显得很糙，不能留。
- 影响范围：`src/ui/playground.ts` 将桌面上下文电池按钮宽度调整为 `88px`，增加右侧 padding 与百分比文字右侧留白；提高桌面 `topbar` 与 `.context-usage-meta` 层级，确保浮层在聊天流卡片之上；`.context-usage-meta` 改为从触发按钮下方展开、限制宽度不超过 viewport，并按标题 / 百分比 / token 指标 / 模型信息分块渲染；`src/ui/playground-context-usage-controller.ts` 新增结构化 tooltip HTML 渲染；`src/ui/playground-theme-controller.ts` 补齐浅色主题映射；`test/server.test.ts` 增加样式与结构回归断言；`DESIGN.md` 与 `docs/playground-current.md` 同步上下文按钮与 hover 浮层口径。
- 对应入口：`src/ui/playground.ts`、`src/ui/playground-context-usage-controller.ts`、`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground 桌面 active 会话顶部留白收紧
- 日期：2026-04-25
- 主题：修复桌面深色会话态顶部出现一大片空白的问题。根因是 active 聊天仍复用 `landing` 壳子，而 `.stream-layout` 继承了空态 hero 用的 `78px` 顶部 inset；聊天流不是展示海报，继续留这么大一块空地很傻。
- 影响范围：`src/ui/playground.ts` 为 `data-transcript-state="active"` 单独把 `.stream-layout` 顶部 inset 收紧到 `18px`，保留 idle 空态的 hero 呼吸空间；`test/server.test.ts` 增加 active inset 回归断言；`DESIGN.md` 与 `docs/playground-current.md` 同步桌面 active 聊天顶部间距口径。
- 对应入口：`src/ui/playground.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground 桌面端极客 cockpit 视觉重构
- 日期：2026-04-25
- 主题：把桌面端 playground 从旧的松散居中布局收口成极客 cockpit 工作台。左侧常驻历史会话索引，右侧是完整 chat stage，顶部改成左品牌信号 + 右侧紧凑命令条，landing composer 变成底部居中的 command deck。顺手把浅色主题的桌面氛围层补齐，避免深色边缘压暗层漏到浅色页面里，把浅色版弄得像蒙了一层灰。
- 影响范围：`src/ui/playground.ts` 重写桌面 shell 网格、topbar 品牌、命令条、左侧会话栏、chat stage 和 landing composer 的桌面视觉规则；`src/ui/playground-theme-controller.ts` 补齐桌面 light theme 的 topbar、命令条、左栏、chat stage、command deck 与 `body::after` 氛围层映射；`test/server.test.ts` 增加桌面 cockpit 布局和浅色背景层回归断言；`DESIGN.md` 与 `docs/playground-current.md` 同步桌面端设计口径。
- 对应入口：`src/ui/playground.ts`、`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground composer 焦点态上移到外层控制面
- 日期：2026-04-25
- 主题：把聊天输入焦点高亮从 `#message` textarea 自身移到外层 `#composer-drop-target.composer:focus-within`。输入区是一个完整控制台，不是一只孤零零的后台表单框，继续让 textarea 自己亮边确实显土。
- 影响范围：`src/ui/playground.ts` 新增 composer 外层 `focus-within` outline，并把 composer 内 textarea / input / select 的 focus 样式收回到 `outline: none`、非 accent 边框；`test/server.test.ts` 增加回归断言，锁住“外层高亮、内层不抢焦点”的视觉口径；`DESIGN.md` 与 `docs/playground-current.md` 同步 composer focus 规则。
- 对应入口：`src/ui/playground.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground 全局可见阴影移除
- 日期：2026-04-25
- 主题：按新的视觉口径移除 playground 里的所有可见阴影效果。项目现在不靠阴影装层级，继续用背景深浅、字号、留白、状态色和必要 focus outline 区分功能区；这比一边说“无边框仪表盘”，一边到处塞 glow 和 shadow 要清醒得多。
- 影响范围：`src/ui/playground.ts`、`src/ui/playground-assets.ts`、`src/ui/playground-task-inbox.ts`、`src/ui/playground-conn-activity.ts`、`src/ui/playground-theme-controller.ts` 中所有实际 `box-shadow`、`drop-shadow`、`text-shadow` 效果归零，保留必要的 `box-shadow: none` 作为全局按钮样式兜底；输入 focus 改用 outline，不再用阴影模拟 focus ring；`test/server.test.ts` 新增 `/playground` 输出不得包含可见 shadow 效果的回归测试；`DESIGN.md` 与 `docs/playground-current.md` 同步 shadow-free 设计口径。
- 对应入口：`src/ui/playground.ts`、`src/ui/playground-assets.ts`、`src/ui/playground-task-inbox.ts`、`src/ui/playground-conn-activity.ts`、`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground 手机端顶部导航与历史抽屉头部透明化
- 日期：2026-04-25
- 主题：按当前手机端视觉口径，把 `mobile-brand-button`、`mobile-topbar`、`topbar-context-slot`、`mobile-new-conversation-button`、`mobile-overflow-menu-button` 和历史会话抽屉头部从“独立 raised surface”收回到透明导航层。这里再加背景和阴影只会把顶部做成一排多余小卡片，用户点名不要，那就别硬凹层级。
- 影响范围：`src/ui/playground.ts` 将移动断点下全局 `.topbar`、`.mobile-topbar`、顶部上下文槽、上下文电池入口和两个移动顶部 icon 按钮改为透明背景、无阴影；`src/ui/playground-assets.ts` 将移动端 `.mobile-drawer-head` 改为透明背景、无阴影；`src/ui/playground-theme-controller.ts` 同步浅色主题下移动顶部导航、`.mobile-brand` 与 `.mobile-drawer-head` 的透明 / 无阴影覆盖，只保留必要文字颜色映射；`test/server.test.ts` 增加深浅主题断言，防止后续又把背景或阴影加回来；`DESIGN.md` 与 `docs/playground-current.md` 同步手机端顶部导航和历史抽屉头部的透明口径。
- 对应入口：`src/ui/playground.ts`、`src/ui/playground-assets.ts`、`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground 浅色工作页细节复验与收口
- 日期：2026-04-25
- 主题：继续收口浅色主题，重点修复后台任务创建页 label / hint 仍继承深色白字、时间选择器月份 / 星期 / 日期仍是白字、表单字段被浅灰块层层包住、上下文详情模型信息条残留深色 pill、输入框 focus 使用浏览器默认黑边的问题。浅色模式不是半成品反色皮肤，白字漏出来和灰块套灰块都属于设计缺陷。
- 影响范围：`src/ui/playground-theme-controller.ts` 将后台任务创建 / 编辑页的结构容器改成透明分组，只保留输入框、目标预览、列表条目和结果面板作为浅色承载面；补齐 `conn-editor-field span`、`conn-editor-field-hint`、`conn-editor-time-input`、`conn-editor-target-preview`、`conn-time-picker-calendar` 子元素、`context-usage-dialog`、`context-usage-dialog-model span` 与表单 focus ring 的浅色映射；`test/server.test.ts` 增加浅色工作页和时间选择器断言，防止白字、黑块和灰块堆叠回潮；已用移动端 CDP 打开新建后台任务并点开时间选择器，确认表单与日历 computed styles 都走浅色主题。
- 对应入口：`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground 历史消息改为触顶自动加载
- 日期：2026-04-25
- 主题：移除聊天区顶部可见的“加载更多历史”按钮，改成用户上滑到 transcript 顶部附近时自动加载更早消息。聊天历史本来就是滚动阅读流，塞一个后台分页按钮确实别扭，还容易让手机端误以为要点按钮才会继续加载。
- 影响范围：`src/ui/playground.ts` 将 `history-load-more-button` 替换为非交互的 `history-auto-load-status`，只在补页过程中通过 `aria-live` 短暂提示；`src/ui/playground-layout-controller.ts` 把触发阈值放宽到 `24px` 并通过 `hasOlderConversationHistory()` 判断是否需要补页；`src/ui/playground-transcript-renderer.ts` 与 light theme 覆盖同步改名；`test/server.test.ts` 更新断言，锁住“不再有按钮、触顶自动加载”的行为。
- 对应入口：`src/ui/playground.ts`、`src/ui/playground-layout-controller.ts`、`src/ui/playground-transcript-renderer.ts`、`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground 运行中对话重复渲染根因修复
- 日期：2026-04-25
- 主题：修复发送消息后偶发 `user-agent / user-agent` 双轮显示的问题。根因不是前端 DOM 没删干净，而是运行中的 `AgentService.getConversationState()` 直接把底层 session 已经提前写入的本轮 user / assistant 片段当成稳定 canonical history 返回，随后 `viewMessages` 又基于 activeRun snapshot 补了一组当前输入和助手输出，页面当然会看起来像 agent 复读。刷新后正常只是因为 active run 结束后 terminal snapshot 被 history 覆盖，不能拿刷新当修复。
- 影响范围：`src/agent/agent-service.ts` 现在在 run 开始时记录 raw `session.messages.length`，当 `activeRun.loading=true` 时，`GET /v1/chat/state` 与 `GET /v1/chat/history` 的稳定历史只读取 run 开始前的 raw session messages；当前轮仍由 activeRun snapshot 合成一次 `viewMessages`。上下文占用估算继续使用完整 raw context，避免修重复渲染时误改 token 用量口径。`test/agent-service.test.ts` 新增运行中 session tail 回归测试，先复现重复历史，再锁住修复。
- 对应入口：`src/agent/agent-service.ts`、`test/agent-service.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground active run 空助手气泡复发修复
- 日期：2026-04-25
- 主题：修复发送消息后、agent 正文还没开始输出时，页面又显示一个空 `.message-body` / `.message-content.is-empty` 气泡的问题。根因是前一轮把 `.message-actions` 移进 `.message-body` 后，空助手占位也提前挂了复制 / 导图操作栏，导致旧的“只有空正文时隐藏 body”规则失效。继续靠 CSS 选择器遮羞就是补丁摞补丁，这次把操作栏挂载条件收回到 transcript renderer 源头。
- 影响范围：`src/ui/playground-transcript-renderer.ts` 新增 `shouldRenderMessageActions()` 与 `syncRenderedMessageActions()`，只有消息存在正文、附件、引用资产或文件结果时才创建 `.message-actions`；流式正文从空变非空时再同步挂载复制和导图按钮，正文清空时移除操作栏；`test/server.test.ts` 增加回归断言锁住该渲染门槛；`DESIGN.md` 与 `docs/playground-current.md` 同步消息操作栏不得撑开空助手占位的口径。
- 对应入口：`src/ui/playground-transcript-renderer.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground 浅色主题完整收口
- 日期：2026-04-25
- 主题：把前一版半成品浅色主题收口成可用的冷白工作台主题。重点修复白字落在浅色卡片上、局部黑色面板残留、浅色层级过近导致页面像糊成一片的问题；覆盖 chat、文件库、后台任务、任务消息、上下文详情弹窗、历史抽屉和移动更多菜单。
- 影响范围：`src/ui/playground-theme-controller.ts` 更新 light theme token 到 `#e8edf6 / #142033` 体系，并补齐 markdown 标题 / strong / code、消息导出按钮、composer 图标、资产 metadata、任务消息 metadata、conn 状态徽标、上下文详情真实类名和历史抽屉头部的浅色覆盖；`test/server.test.ts` 更新主题 token 与关键浅色覆盖断言；`DESIGN.md` 与 `docs/playground-current.md` 同步浅色主题质量口径。
- 对应入口：`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### 腾讯云生产环境增量更新到 `9a9f016`
- 日期：2026-04-25
- 主题：按增量更新流程把腾讯云新加坡生产环境从 `45e7efb` 更新到 `9a9f016`，上线本轮 playground 手机端 UI、浅色主题、任务消息独立页面和消息图片导出 canvas 污染修复。继续使用 GitHub 工作目录 `~/ugk-claw-repo`，没有整目录替换，也没有触碰 `~/ugk-claw-shared` 下的 agent 数据和 sidecar 登录态。
- 影响范围：生产服务器执行 `git fetch --tags origin`、`git pull --ff-only origin main`、`docker compose --env-file ~/ugk-claw-shared/compose.env -p ugk-pi-claw -f docker-compose.prod.yml up --build -d`，重建 `ugk-pi` 与 `ugk-pi-conn-worker`；发布前已备份 sidecar 登录态到 `/home/ubuntu/ugk-claw-shared/backups/chrome-sidecar-20260425-084932.tar.gz`，并给旧 `HEAD` 打本地回滚 tag `server-pre-deploy-20260425-085105`；发布后内外网 `/healthz` 与 `/playground`、页面源码标记、`check-deps.mjs`、Chrome CDP 和容器状态均已验收通过。
- 对应入口：`docs/tencent-cloud-singapore-deploy.md`、`docs/server-ops-quick-reference.md`

### Playground 消息图片导出 canvas 污染修复
- 日期：2026-04-25
- 主题：修复点击 chat 消息底部“保存为图片”时，SVG / canvas 导出链路因为 `blob:` SVG `foreignObject`、外部样式资源或消息媒体节点导致 `HTMLCanvasElement.toBlob()` 抛出 tainted canvas `SecurityError` 的问题；同时把错误兜底从不存在的 `showErrorBanner()` 改回真实的 `showError()`。导出失败之后再因为兜底函数不存在继续炸，这种错误套娃不能留。
- 影响范围：`src/ui/playground-transcript-renderer.ts` 在导出前清理 `@import`、`@font-face`、非片段 `url(...)`，并把消息内 `img / video / iframe / canvas` 替换成导出占位块；包含 `foreignObject` 的 SVG 中间图改用 `data:image/svg+xml`，不再用会污染 canvas 的 `blob:` URL；`src/ui/playground.ts` 增加导出媒体占位块样式；`test/server.test.ts` 锁定导出净化、媒体替换、data SVG 和错误提示函数；`DESIGN.md` 与 `docs/playground-current.md` 同步消息图片导出的 origin-clean 约束。
- 对应入口：`src/ui/playground-transcript-renderer.ts`、`src/ui/playground.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground 任务消息独立页面化
- 日期：2026-04-25
- 主题：把任务消息从聊天 `#shell` 内的 `data-primary-view=chat|tasks` 内容切换，改成和文件库同层级的独立 fixed 工作页。之前只隐藏全局手机顶栏只是把症状盖住，结构还是挂在聊天壳子里，确实不够像“新页面”；这次把任务消息页挂到 `#shell` 外层，用 `taskInboxOpen` / `.task-inbox-view.open` 管理打开状态、焦点归还和移动端全屏。
- 影响范围：`src/ui/playground-task-inbox.ts` 将 `task-inbox-view` 改为 fixed 页面壳，`task-inbox-pane` 改为独立页面板并在手机端占满 `100dvh`，控制器移除 `setPrimaryView()` / `shell.dataset.primaryView` 依赖；`src/ui/playground.ts` 将任务消息 DOM 挂到 `#shell` 外层，新增 `taskInboxOpen` / `taskInboxRestoreFocusElement` 状态和 Escape 关闭；`src/ui/playground-theme-controller.ts` 补齐浅色主题下 `task-inbox-pane` 映射；`test/server.test.ts` 改为断言独立页面结构、打开类和移动端全屏约束；`DESIGN.md` 与 `docs/playground-current.md` 同步非 chat 工作页应使用独立 fixed 页面壳的口径。
- 对应入口：`src/ui/playground-task-inbox.ts`、`src/ui/playground.ts`、`src/ui/playground-theme-controller.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground 深浅主题切换
- 日期：2026-04-25
- 主题：为 playground 增加与当前深色仪表盘风格一一对应的浅色版本，并提供桌面端与手机端主题切换入口。浅色不是把页面刷白完事，那叫照明事故；这次保留同一套工作台信息层级、小圆角、无边框实体层和状态色，只把背景、文字、面板和阴影映射到冷白工作台语义。
- 影响范围：新增 `src/ui/playground-theme-controller.ts`，集中输出 light theme CSS 覆盖和浏览器端主题持久化脚本；`src/ui/playground.ts` 注入 `data-theme="dark"` 初始属性、桌面 `theme-toggle-button`、手机 `mobile-menu-theme-button`，并挂载主题控制器；主题值写入 `localStorage` 的 `ugk-pi:playground-theme`，切换时不触发会话同步、transcript 重绘或 agent 请求；`test/server.test.ts` 增加浅色 token、主要页面 / 弹窗覆盖、按钮入口和持久化脚本断言；`DESIGN.md`、`docs/playground-current.md` 同步深浅主题口径。
- 对应入口：`src/ui/playground-theme-controller.ts`、`src/ui/playground.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground 消息操作栏与运行态 loading 去重
- 日期：2026-04-25
- 主题：修复当前任务运行中同一条助手消息可能堆出多个 `assistant-run-log-trigger` loading 气泡的问题，并把消息操作栏收进 `.message-body` 底部，同时新增“保存为图片”导出能力。刷新后才看起来正常那种前端状态债，本质就是运行中 DOM 挂载没收口，不能拿刷新当疗法。
- 影响范围：`src/ui/playground-transcript-renderer.ts` 在挂载助手状态壳层前清理同卡片旧的 `.assistant-status-shell` / `.assistant-run-log-trigger`，复用流式状态时同步维护 loading dots 与 run-log trigger 引用；消息操作栏改为追加到 `.message-body` 内部，新增图片导出按钮，导出 PNG 时克隆消息正文、移除操作栏并添加 `UGK Claw 导出` 签名；`src/ui/playground.ts` 同步操作栏、导出画布和签名样式；`test/server.test.ts` 增加状态控件去重、操作栏位置、复制 / 导图按钮样式和导出函数断言；`DESIGN.md`、`docs/playground-current.md` 同步消息操作与运行态单例口径。
- 对应入口：`src/ui/playground-transcript-renderer.ts`、`src/ui/playground.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground 非 chat 页面与弹窗无边框仪表盘收口
- 日期：2026-04-25
- 主题：继续沿用用户确认喜欢的深色仪表盘美术方向，把文件库、任务消息、后台任务管理器、后台任务编辑页、运行日志、确认弹窗和后台任务过程弹窗从“浅边框分区”收口为实体深色层级，减少后台表单味。
- 影响范围：`src/ui/playground-assets.ts` 将手机工作页头部、文件 / conn 卡片、后台任务工具条、任务编辑字段和后台过程弹窗改为无边框深色层级；`src/ui/playground-task-inbox.ts` 将任务消息页头部与结果气泡同步为 `#101421 / #0b0e19` 层级；`src/ui/playground-conn-activity.ts` 与 `src/ui/playground.ts` 将运行日志、确认弹窗和后台任务过程详情改成小圆角、无边框、实体背景；`test/server.test.ts` 增加精确 CSS block 断言，避免贪婪正则假绿；`DESIGN.md`、`docs/playground-current.md` 同步非 chat 工作页视觉口径。
- 对应入口：`src/ui/playground-assets.ts`、`src/ui/playground-task-inbox.ts`、`src/ui/playground-conn-activity.ts`、`src/ui/playground.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground 手机端历史侧边栏无边框仪表盘化
- 日期：2026-04-25
- 主题：把手机端历史会话侧边栏同步到上下文详情弹窗的无边框深色仪表盘设计，减少线框感，让会话索引更像当前主题的一部分。
- 影响范围：`src/ui/playground-assets.ts` 重做移动端 `.mobile-conversation-drawer`、`.mobile-drawer-head`、`.mobile-conversation-item`、`.mobile-conversation-item.is-active`、`.conversation-item-delete` 和空态样式，改为背景层级、留白、阴影和左侧亮条组织信息；`test/server.test.ts` 增加无边框侧边栏视觉断言；`DESIGN.md`、`docs/playground-current.md` 同步侧边栏设计口径。
- 对应入口：`src/ui/playground-assets.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground 上下文弹窗焦点与无边框视觉收口
- 日期：2026-04-25
- 主题：修复手机端打开上下文详情后关闭时出现 `Blocked aria-hidden` 的无障碍警告，并把上下文详情弹窗从临时文本盒重做成无边框仪表盘。
- 影响范围：`src/ui/playground-context-usage-controller.ts` 在关闭上下文弹窗前先释放焦点回到上下文入口，再设置 `hidden` / `aria-hidden=true` / `inert`，并将上下文详情渲染为百分比、进度条、指标块和模型信息条；`src/ui/playground.ts` 将上下文弹窗重做为靠背景层级、字号、留白和阴影区分功能的无边框面板；`test/server.test.ts` 增加焦点释放顺序和仪表盘视觉断言；`DESIGN.md`、`docs/playground-current.md` 同步“优先背景层次、少用边框”的设计口径。
- 对应入口：`src/ui/playground-context-usage-controller.ts`、`src/ui/playground.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

### Playground 历史会话删除按钮内收
- 日期：2026-04-25
- 主题：把侧边栏历史会话条目的删除按钮从条目外侧独立列挪进会话条目内部右上角，避免删除入口挤压标题和摘要。
- 影响范围：`src/ui/playground-conversations-controller.ts` 将 `conversation-item-delete` 追加到 `.mobile-conversation-item` 内部，并阻止删除点击冒泡触发会话切换；`src/ui/playground.ts` 与 `src/ui/playground-assets.ts` 将删除按钮改为条目内绝对定位并给条目右侧预留空间；`test/server.test.ts` 增加 DOM 与移动端样式断言；`DESIGN.md`、`docs/playground-current.md` 同步当前侧边栏口径。
- 对应入口：`src/ui/playground-conversations-controller.ts`、`src/ui/playground.ts`、`src/ui/playground-assets.ts`、`test/server.test.ts`、`DESIGN.md`、`docs/playground-current.md`

## 2026-04-24

### Playground 手机端历史会话抽屉重设计
- 日期：2026-04-24
- 主题：重做手机端会话选择侧边栏，把原来臃肿、装饰感偏重的历史会话列表收口成更贴近主页 chat 的紧凑会话索引。之前那套看着像临时塞进去的卡片堆，确实不该继续忍。
- 影响范围：`src/ui/playground-assets.ts` 重写手机端 `.mobile-conversation-drawer`、列表项、当前会话状态、信息胶囊和删除按钮样式；`src/ui/playground-conversations-controller.ts` 将删除入口改为 icon-only；`DESIGN.md` 补充 mobile conversation drawer / item 组件口径；`test/server.test.ts` 增加页面断言锁住新抽屉视觉约束；`docs/playground-current.md` 同步当前移动端会话索引口径。
- 对应入口：`src/ui/playground-assets.ts`、`src/ui/playground-conversations-controller.ts`、`DESIGN.md`、`test/server.test.ts`、`docs/playground-current.md`

### 接入 DESIGN.md 设计系统工具
- 日期：2026-04-24
- 主题：安装 Google Labs 的 `@google/design.md` CLI，并给 playground 补一份根目录 `DESIGN.md` 视觉 identity 文件，让后续前端改动有可读、可 lint 的设计系统入口。靠“凭感觉调 CSS”不是设计流程，是抽奖。
- 影响范围：`package.json` / `package-lock.json` 新增 `@google/design.md` 开发依赖和 `npm run design:lint` 脚本；`DESIGN.md` 记录 UGK Claw 的颜色、字体、圆角、间距和组件语义；`AGENTS.md` 同步要求视觉 token / 组件口径变更时参考并校验 `DESIGN.md`。
- 对应入口：`DESIGN.md`、`package.json`、`package-lock.json`、`AGENTS.md`

### Playground 错误横幅不透明背景
- 日期：2026-04-24
- 主题：修复顶部错误横幅使用半透明红色背景导致手机端提示文案看不清的问题。错误提示这种东西如果还要用户眯眼猜，那基本就是给错误又加了一个错误。
- 影响范围：`src/ui/playground.ts` 将 `.error-banner` 背景改为不透明高对比色，并同步提高关闭按钮背景和文字对比；`test/server.test.ts` 增加页面断言锁住不透明背景与关闭按钮背景；`docs/playground-current.md` 同步当前错误横幅可读性口径。
- 对应入口：`src/ui/playground.ts`、`test/server.test.ts`、`docs/playground-current.md`

### 交接文档刷新到 `45e7efb` 生产态
- 日期：2026-04-24
- 主题：为项目交接给下一个 agent 刷新当前态文档，把 `docs/handoff-current.md` 从旧的 `0b63cd7` 消息系统发布阶段更新到当前生产运行代码 `45e7efb1dc2643d9e73d4d6288c0a09394091e94`，并明确 GitHub 最新 `26031a3` 只是发布记录文档提交。别让下一个接手的人拿旧生产提交、旧回滚 tag 和旧 sidecar 备份当现状，项目交接不是考古节目。
- 影响范围：`docs/handoff-current.md` 重写当前结论、已完成 Playground UX 大扫除、生产状态、回滚锚点、发布口径和下一阶段建议；`README.md` 同步修正 `POST /v1/conns` 默认目标，明确未传 `target` 时默认进入任务消息页 `{ "type": "task_inbox" }`，不再自动绑定当前会话。
- 对应入口：`docs/handoff-current.md`、`README.md`

### 腾讯云生产环境增量更新到 `45e7efb`
- 日期：2026-04-24
- 主题：按增量更新流程把腾讯云新加坡生产环境从 `58c12e9` 更新到 `45e7efb1dc2643d9e73d4d6288c0a09394091e94`，让后台任务过程详情、运行日志和确认弹层关闭前先释放内部焦点，避免浏览器控制台出现 `Blocked aria-hidden on an element because its descendant retained focus`。
- 影响范围：服务器继续沿用 GitHub 工作目录 `~/ugk-claw-repo` 和 shared 运行态目录 `~/ugk-claw-shared`，没有做整目录替换，也没有触碰 `.data/agent` 或 sidecar 登录态；发布前备份 sidecar 到 `/home/ubuntu/ugk-claw-shared/backups/chrome-sidecar-20260424-223012.tar.gz`，并给旧 `HEAD` 打本地回滚 tag `server-pre-deploy-20260424-223012`。`git pull --ff-only` 后执行 `docker compose ... up --build -d`，随后因 nginx 老容器未跟上 app 重建后的 upstream 状态短暂出现 `502`，已通过 `up -d --force-recreate nginx` 恢复。内外网 `/healthz`、`/playground`、页面修复标记、sidecar `check-deps.mjs` 和容器健康状态均已验收通过。
- 对应入口：`src/ui/playground.ts`、`src/ui/playground-conn-activity-controller.ts`、`src/ui/playground-transcript-renderer.ts`、`docs/tencent-cloud-singapore-deploy.md`、`docs/server-ops-quick-reference.md`

### Playground 弹层关闭前释放内部焦点
- 日期：2026-04-24
- 主题：修复打开后台任务过程后关闭详情弹层时，焦点仍停在 `button#conn-run-details-close`，随后父级 `#conn-run-details-dialog` 被设置为 `aria-hidden=true` 导致浏览器控制台提示 `Blocked aria-hidden on an element because its descendant retained focus` 的问题。这类警告不是装饰噪音，而是键盘 / 读屏用户可能被塞进隐藏区域的真实体验债。
- 影响范围：`src/ui/playground.ts` 新增 `releasePanelFocusBeforeHide()`，在隐藏面板前优先把焦点归还到可见触发入口或底部输入框，归还失败时对仍在面板内的 active element 执行 `blur()`；`src/ui/playground-conn-activity-controller.ts` 的后台任务过程详情、`src/ui/playground-transcript-renderer.ts` 的运行日志弹层、确认弹层关闭路径都改成先释放焦点再设置 `hidden / aria-hidden`；`test/server.test.ts` 增加页面脚本断言锁住关闭顺序与 `blur()` 兜底；`docs/playground-current.md` 同步当前无障碍口径。
- 对应入口：`src/ui/playground.ts`、`src/ui/playground-conn-activity-controller.ts`、`src/ui/playground-transcript-renderer.ts`、`test/server.test.ts`、`docs/playground-current.md`

### 腾讯云生产环境增量更新到 `58c12e9`
- 日期：2026-04-24
- 主题：按增量更新流程把腾讯云新加坡生产环境从 `0fdcef7` 更新到 `58c12e92fa28a93d7373d65a0c387d8f09d6f29b`。这次继续沿用 GitHub 工作目录 `~/ugk-claw-repo`，运行态仍留在 `~/ugk-claw-shared`，没有做整目录替换，也没有触碰 `.data/agent`、sidecar 登录态或日志目录。
- 影响范围：服务器先备份 sidecar 登录态到 `/home/ubuntu/ugk-claw-shared/backups/chrome-sidecar-20260424-180357.tar.gz`，并给旧 `HEAD` 打本地回滚 tag `server-pre-deploy-20260424-180357`；随后执行 `git fetch --tags origin`、`git pull --ff-only origin main`、生产 compose config 验证与 `docker compose ... up --build -d`。发布后内外网 `/healthz`、`/playground`、sidecar `check-deps.mjs`、容器健康状态与页面源码标记均已验证通过。
- 对应入口：`docs/tencent-cloud-singapore-deploy.md`、`docs/server-ops-quick-reference.md`

### Playground 资产详情 hydrate 增加并发阀门
- 日期：2026-04-24
- 主题：继续清理文件 / 资产入口里的隐形请求风暴。之前 `loadAssetDetails()` 对缺失的 asset id 直接 `Promise.all` 并发请求 `/v1/assets/:assetId`，同一个 id 如果被两个恢复链路同时需要，也会各打一遍请求。历史附件、conn 附加资料和文件库状态一多，这种代码看着短，实际就是把浏览器连接池和后端一起推去排队。现在资产详情补拉统一进 `assetDetailQueue`，最多 4 路并发，同一 assetId 的进行中请求通过 `assetDetailInFlightById` 复用。
- 影响范围：`src/ui/playground-assets-controller.ts` 新增 `ASSET_DETAIL_CONCURRENCY_LIMIT`、`fetchAssetDetail()`、`enqueueAssetDetailLoad()` 和 `pumpAssetDetailQueue()`；`src/ui/playground.ts` 增加资产详情队列与 in-flight 状态；`test/server.test.ts` 锁定并发上限、同 id 复用和禁止回退到裸 `Promise.all(async fetch)`；`docs/playground-current.md`、本清扫计划与 `AGENTS.md` 同步当前口径。
- 对应入口：`src/ui/playground-assets-controller.ts`、`src/ui/playground.ts`、`test/server.test.ts`、`docs/playground-current.md`、`docs/plans/2026-04-24-playground-ux-debt-cleanup.md`、`AGENTS.md`

### Playground 任务消息未读数随主请求返回
- 日期：2026-04-24
- 主题：继续清理任务消息入口的隐形双请求。之前打开任务消息会先 `GET /v1/activity`，随后再补 `GET /v1/activity/summary`；单条标记已读和全部已读也是先写状态，再补 summary。这个未读数本来就是同一个收件箱的读模型，却被拆成两次网络往返，移动端弱网下就是典型“看起来没多少代码，点起来就是慢”的设计。现在列表、单条已读和全部已读响应都直接带新的 `unreadCount`，前端直接应用到 badge、筛选按钮和全部已读按钮状态；实时通知广播刷新任务消息列表后也不再额外补 summary。
- 影响范围：`src/routes/activity.ts` 为 `GET /v1/activity`、`POST /v1/activity/:activityId/read`、`POST /v1/activity/read-all` 增加 `unreadCount`；`src/types/api.ts` 更新响应类型；`src/ui/playground-task-inbox.ts` 新增 `applyTaskInboxUnreadCount()` 并移除任务消息加载 / 已读动作后的固定 summary 请求；`src/ui/playground-stream-controller.ts` 去掉通知广播里的重复 summary 刷新；`test/server.test.ts` 增加 API 与页面脚本回归；`docs/playground-current.md`、本清扫计划与 `AGENTS.md` 同步当前口径。
- 对应入口：`src/routes/activity.ts`、`src/types/api.ts`、`src/ui/playground-task-inbox.ts`、`src/ui/playground-stream-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`、`docs/plans/2026-04-24-playground-ux-debt-cleanup.md`、`AGENTS.md`

### Playground 恢复同步按生命周期原因分级
- 日期：2026-04-24
- 主题：继续清理多次切换 / 前后台恢复后的用户可感知慢路径。之前 `visibilitychange`、`pageshow`、`online` 虽然统一走了 `scheduleResumeConversationSync()`，但最终还是容易把 catalog 与 canonical state 串起来跑一遍；用户只是网络恢复或从后台切回来，也可能被拖进一次 `GET /v1/chat/conversations` + `GET /v1/chat/state`。这类“看起来很保险”的恢复链路，其实就是把慢请求伪装成勤快，体验上非常要命。现在恢复同步会合并 in-flight 选项并按触发原因分级：`pageshow` 强制校准当前会话 state，`visibilitychange` 只在 active run 或 state 超过恢复阈值时回源，`online` 优先查当前 active run 状态并续订 `/v1/chat/events`；catalog 只在当前会话缺失、列表为空或显式要求时读取。
- 影响范围：`src/ui/playground-layout-controller.ts` 新增 `RESUME_SYNC_STALE_MS`、恢复选项合并、catalog/state 判定与 active run 重连入口；`src/ui/playground.ts` 记录 `resumeSyncPendingOptions` 与 `lastConversationStateSyncAt`；`test/server.test.ts` 锁住分级恢复脚本结构；`docs/playground-current.md`、本清扫计划与 `AGENTS.md` 同步当前口径。
- 对应入口：`src/ui/playground-layout-controller.ts`、`src/ui/playground.ts`、`test/server.test.ts`、`docs/playground-current.md`、`docs/plans/2026-04-24-playground-ux-debt-cleanup.md`、`AGENTS.md`

### Playground canonical state 改为 transcript diff 渲染
- 日期：2026-04-24
- 主题：继续清理 state hydrate 对用户阅读体验的打扰。之前 `renderConversationState()` 每次拿到 canonical state 都会清空当前 transcript、重置 streaming state，再把最近历史重新渲染一遍；接口瘦身以后还这么干，就等于后端省下来的时间又拿去重跑 markdown hydrate 和代码块 toolbar，长会话里尤其蠢。现在前端用 `buildConversationStateSignature()` 判断同会话同签名回包，命中时跳过 transcript DOM 重绘；消息窗口变化时优先 patch 已渲染节点或 append 新节点，只有会话切换或消息序列无法对齐时才重建当前 transcript。
- 影响范围：`src/ui/playground.ts` 新增 `renderedConversationId / renderedConversationStateSignature` 状态，并让 `renderConversationState()` 按签名决定是否重绘；`src/ui/playground-transcript-renderer.ts` 新增 `syncRenderedConversationHistory()`、`updateRenderedTranscriptEntry()` 和消息签名 helper，用于 patch 文本、runId 与已渲染窗口；`src/ui/playground-stream-controller.ts` 扩展 `buildConversationStateSignature()`，把 `viewMessages`、分页边界与 active run 关键信息纳入签名；`test/server.test.ts` 增加页面脚本回归。
- 对应入口：`src/ui/playground.ts`、`src/ui/playground-transcript-renderer.ts`、`src/ui/playground-stream-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`、`docs/plans/2026-04-24-playground-ux-debt-cleanup.md`、`AGENTS.md`

### ConversationStore 增加 mtime cache 和串行写队列
- 日期：2026-04-24
- 主题：继续清理会话切换和新建会话的后端慢路径。`ConversationStore` 之前每次 `get/list/getCurrent/set/current` 都会重新读写整份会话目录 JSON，并且并发 `set()` 与 `setCurrentConversationId()` 会基于各自读到的旧快照落盘，轻则重复 I/O，重则把刚写入的 sessionFile、title、preview 或 current pointer 覆盖掉。现在会话目录 index 按文件 `mtime` 复用进程内 state，写操作统一进串行队列，并用同目录临时文件加 `rename` 原子替换落盘。
- 影响范围：`src/agent/conversation-store.ts` 新增 cache、写队列、原子写和 clone 返回，读路径在未变更时复用内存 state，写路径排队读最新 state 后再落盘；`test/conversation-store.test.ts` 增加缓存命中与并发写不丢字段的回归。`docs/playground-current.md`、`AGENTS.md` 与大扫除计划同步记录该运行口径。
- 对应入口：`src/agent/conversation-store.ts`、`test/conversation-store.test.ts`、`docs/playground-current.md`、`AGENTS.md`、`docs/plans/2026-04-24-playground-ux-debt-cleanup.md`

### Playground 后台任务管理器去掉打开时的 N+1 runs 请求
- 日期：2026-04-24
- 主题：继续清理用户可感知慢路径。后台任务管理器之前打开时先请求 `GET /v1/conns`，再对每个 conn 并发请求一次 `/v1/conns/:connId/runs`；conn 数量一多，请求数和浏览器连接池都会被自己打爆，属于典型列表页翻车。现在 `GET /v1/conns` 直接带每个 conn 的 `latestRun` 摘要，管理器打开只需要一次列表请求，完整 runs 改为展开单个 conn 时按需读取。
- 影响范围：`src/agent/conn-run-store.ts` 新增 `listLatestRunsForConns()` 批量读取每个 conn 最新 run；`src/routes/conns.ts` 的列表响应为 conn 条目补充 `latestRun`，无 run 时明确返回 `null`；`src/types/api.ts` 更新 `ConnBody`；`src/ui/playground-conn-activity-controller.ts` 改为从列表响应 hydrate 最新 run，并保留旧后端 4 路并发 fallback；`src/ui/playground.ts` 补充管理器 runs 加载状态；`test/server.test.ts` 与 `test/conn-run-store.test.ts` 增加回归。
- 对应入口：`src/routes/conns.ts`、`src/agent/conn-run-store.ts`、`src/ui/playground-conn-activity-controller.ts`、`src/ui/playground.ts`、`src/types/api.ts`、`test/server.test.ts`、`test/conn-run-store.test.ts`、`docs/playground-current.md`、`docs/runtime-assets-conn-feishu.md`、`docs/plans/2026-04-24-playground-ux-debt-cleanup.md`

### Playground 技能列表查询增加缓存元信息
- 日期：2026-04-24
- 主题：继续清理用户可点击入口里的隐形重活。`查看技能` 看起来只是一个信息面板，之前每次点击却会重新创建 resource loader 并 `reload()` skills；技能目录一多、挂载一慢，这个按钮就会把用户拖进一次小型启动流程。现在技能列表查询在 fingerprint 未变化且 TTL 内复用缓存，技能文件变化时才刷新。
- 影响范围：`src/agent/agent-session-factory.ts` 为 `getAvailableSkills()` 增加 30 秒 TTL 缓存、fingerprint invalidation 和 `source / cachedAt` 元信息；`src/agent/agent-service.ts` 与 `src/routes/chat.ts` 平铺返回新的 debug skills 响应；`src/types/api.ts` 更新 `DebugSkillsResponseBody`；`test/agent-session-factory.test.ts` 覆盖缓存命中与 fingerprint 变化刷新，`test/server.test.ts` 覆盖 API 元信息。
- 对应入口：`src/agent/agent-session-factory.ts`、`src/agent/agent-service.ts`、`src/routes/chat.ts`、`src/types/api.ts`、`test/agent-session-factory.test.ts`、`test/agent-service.test.ts`、`test/server.test.ts`、`docs/playground-current.md`、`docs/plans/2026-04-24-playground-ux-debt-cleanup.md`

### Playground 会话 state/history 改为分页读取
- 日期：2026-04-24
- 主题：继续收口历史会话越用越慢的问题。之前 `GET /v1/chat/state` 仍会把完整会话历史转换并返回给前端，然后浏览器再截取最近 160 条；这不是优化，是把账单从后端搬到浏览器，长会话迟早要卡。现在 state 响应默认只给最近窗口，并通过 `historyPage` 告诉前端还有没有更早消息；旧历史由独立的 history 分页接口按需加载。
- 影响范围：`src/agent/agent-service.ts` 新增 state/history 分页结果与 terminal run 覆盖关系的页内索引修正；`src/routes/chat.ts` 透传 `viewLimit`、`limit` 和 `before`；`src/types/api.ts` 补齐分页元信息；`src/ui/playground.ts` 在恢复 state 时请求最近 160 条，并把“加载更多历史”改成 `/v1/chat/history?before=...&limit=...` 服务端分页补页，本地缓存只继续作为最近快照；`test/agent-service.test.ts` 与 `test/server.test.ts` 覆盖长历史 state 截窗、history 游标分页和页面脚本入口。
- 对应入口：`src/agent/agent-service.ts`、`src/routes/chat.ts`、`src/types/api.ts`、`src/ui/playground.ts`、`test/agent-service.test.ts`、`test/server.test.ts`、`docs/playground-current.md`、`docs/plans/2026-04-24-playground-ux-debt-cleanup.md`

### Playground 会话激活改成两阶段提交
- 日期：2026-04-24
- 主题：继续收口多次切换历史会话后 `新会话` / 旧会话切换手感变慢的问题。后端 state 读已经轻量化，但前端之前仍把“切到目标会话”绑死在 `GET /v1/chat/state` hydrate 完成之后；只要旧会话很大、网络抖动或浏览器连接池排队，用户点了按钮却还停在旧界面，体验上就像又卡死了。现在会话创建或切换只等待服务端确认目标 `conversationId`，随后立即进入目标会话 shell，真实历史与 active run 由后台 canonical state 同步补齐。
- 影响范围：`src/ui/playground-conversations-controller.ts` 将 `activateConversation()` 改为后台调用 `restoreConversationHistoryFromServer()`，并为 `startNewConversation()` 增加 `conversationCreatePending` 防重入；当前已经是无正文、无附件、无 active run 的空白会话时，重复点击 `新会话` 会直接 no-op，不再继续创建一串空会话。历史列表在任意切换请求未回包时冻结切换 / 删除动作，避免慢回包覆盖用户最新目标。`src/ui/playground.ts` 补充会话创建与切换 pending 状态，并让新会话按钮在创建请求飞行期间保持禁用。`test/server.test.ts` 锁住两阶段激活、创建防重入、空白会话幂等和切换 pending 行为；`docs/playground-current.md` 与本清扫计划同步更新。
- 对应入口：`src/ui/playground-conversations-controller.ts`、`src/ui/playground.ts`、`test/server.test.ts`、`docs/playground-current.md`、`docs/plans/2026-04-24-playground-ux-debt-cleanup.md`

### Playground 会话目录同步增加过期请求取消
- 日期：2026-04-24
- 主题：修复多次切换历史会话后 `GET /v1/chat/conversations` 变慢并拖住 `新会话` 的问题。后端裸接口本身很轻，真正的问题是前端 `conversationCatalogSyncPromise` 会无条件复用旧目录请求；当旧请求被浏览器连接池或网络抖动拖住时，后续强制刷新、恢复同步和部分前置动作会一起等这条旧 promise，像是被接口本身卡住。
- 影响范围：`src/ui/playground-conversations-controller.ts` 为会话目录同步增加 `AbortController`；catalog 失效或 `force` 刷新会主动取消旧 `/v1/chat/conversations`，并用带所有权的 `releaseConversationCatalogSync()` 避免旧请求 finally 清掉新请求状态。`src/ui/playground.ts` 补充 catalog abort controller 状态位，`test/server.test.ts` 和 `docs/playground-current.md` 同步锁住前端行为。
- 对应入口：`src/ui/playground-conversations-controller.ts`、`src/ui/playground.ts`、`test/server.test.ts`、`docs/playground-current.md`

### Playground 会话 state 同步增加过期请求取消
- 日期：2026-04-24
- 主题：修复多次切换历史会话后点击 `新会话` 变慢的问题。根因是前端已有的 conversation sync ownership 只会在旧 `/v1/chat/state` 回包回来后丢弃结果，但不会取消请求本身；快速切换时一串过期 state 请求仍然占着浏览器连接和后端计算，新建空会话还要 `await` 自己的 state 同步，于是用户看到按钮卡在 `fetchConversationState` 调用链上。
- 影响范围：`src/ui/playground.ts` 为 canonical conversation state 同步增加 `AbortController`，新同步开始或会话 ownership 失效时主动 abort 上一条未完成的 `/v1/chat/state`；abort 错误静默收口，不再误报成会话历史加载失败。`test/server.test.ts` 补页面脚本断言锁住取消机制，`docs/playground-current.md` 同步当前前端口径。
- 对应入口：`src/ui/playground.ts`、`test/server.test.ts`、`docs/playground-current.md`

### Playground canonical `viewMessages` 改成按 run 落盘覆盖关系收口
- 日期：2026-04-24
- 主题：修复 playground 在 terminal run 场景下把同一轮问答渲染成两次的问题。根因不是前端 DOM 去重失败，而是后端 `AgentService` 之前在组装 canonical `viewMessages` 时，用 assistant 正文文本去猜当前 terminal run 是否已经被 session history 覆盖；一旦流式正文和最终落盘正文只是在空格、换行或 markdown 断句上有差异，就会误判成“历史里还没有这轮结果”，把同一轮 `user + assistant` 再补画一遍。
- 影响范围：`src/agent/agent-service.ts` 现在在 run 开始时记录会话历史基线，在 `done / interrupted / error` 进入 terminal 态时直接根据“本轮 run 之后新落盘了哪些 canonical history message”生成覆盖关系，并把这份覆盖信息用于 `GET /v1/chat/state` 的 `viewMessages` 组装；因此当前轮是否已经被 history 覆盖，改成由 run 自己的真实落盘结果决定，不再依赖 brittle 的正文字符串比对。`test/agent-service.test.ts` 同步补强了两类回归：正文空白差异时仍然只渲染一轮，以及连续两轮同样输入时不会误吞当前 terminal turn。
- 对应入口：`src/agent/agent-service.ts`、`test/agent-service.test.ts`

### Playground 断流恢复链路改成 state -> events -> state 单一收口
- 日期：2026-04-24
- 主题：修掉 playground 在主 `/v1/chat/stream` 断开后显示“页面连接已恢复……已重新订阅当前运行任务”，但实际又卡住、刷新后结果还可能蒸发的异常。根因不是少调一次接口，而是前端把“canonical state 说还在 running”和“事件流真的已经安全接续”混成同一件事；`/v1/chat/events` 如果在终态竞态窗口里没收到 terminal event 就直接 EOF，页面就会挂着恢复文案原地装死。
- 影响范围：`src/ui/playground.ts` 新增统一的 `reconcileSyncedConversationState()`，把 state 回包后的“继续 attach `/v1/chat/events` / 停止 loading”决策收口到单一入口，不再让 `syncConversationRunState()` 和 `restoreConversationHistoryFromServer()` 各写一份半同步逻辑；`src/ui/playground-stream-controller.ts` 为 active run event stream 增加 terminal 判定与 EOF 回源收口，事件流若未带 `done / error / interrupted` 就结束，会立即再走一次 canonical state 同步，决定继续续订还是按终态落稳；`test/server.test.ts` 新增页面断言锁住这条恢复链路；`docs/playground-current.md` 同步更新口径。
- 对应入口：`src/ui/playground.ts`、`src/ui/playground-stream-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`

### Playground 消息系统改成状态壳层 + 运行日志
- 日期：2026-04-24
- 主题：把前端对话运行态从“正文 + 过程展开区 + 各种补画壳子”的缝合怪，重构成单一助手消息上的状态壳层模型：回复开始后只显示一条会持续改写的人话状态摘要和一个可点击的动态 loading，最终结果继续写回同一条正文；运行过程详情从 transcript 解耦，改为独立运行日志弹层。
- 影响范围：`src/types/api.ts` 为 chat run 事件响应补齐 `runId` / `ChatRunEventsResponseBody`；`src/agent/agent-service.ts` 持久化完成态 run 的 buffered events、开放按 `conversationId + runId` 读取运行日志，并让 `viewMessages` / stream terminal 事件都带 `runId`；`src/routes/chat.ts` 新增 `GET /v1/chat/runs/:runId/events`；`src/ui/playground.ts`、`src/ui/playground-transcript-renderer.ts`、`src/ui/playground-stream-controller.ts` 把前端运行态收口为“状态摘要 + loading + 结果正文 + 日志弹层”，并移除旧的 assistant process shell 样式和页面断言；相关回归测试补到 `test/server.test.ts` 与 `test/agent-service.test.ts`。
- 对应入口：[src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)、[src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)、[src/types/api.ts](/E:/AII/ugk-pi/src/types/api.ts)、[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-transcript-renderer.ts](/E:/AII/ugk-pi/src/ui/playground-transcript-renderer.ts)、[src/ui/playground-stream-controller.ts](/E:/AII/ugk-pi/src/ui/playground-stream-controller.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 运行态摘要与日志入口进一步收口
- 日期：2026-04-24
- 主题：继续压缩运行态视觉噪音。`assistant-status-summary` 现在固定为单行省略，不再因为长摘要换行把消息高度顶得一跳一跳；运行日志按钮去掉了可见的动态长文本，不再把工具结果、bash 输出或 JSON 片段塞进 loading 气泡里撑爆宽度，只保留稳定的动态点和“查看运行日志”入口。
- 影响范围：`src/ui/playground.ts` 收紧状态摘要和运行日志按钮的样式约束，移除 `assistant-loading-label`；`src/ui/playground-transcript-renderer.ts` 改成仅通过按钮的 `aria-label` 记录当前过程状态，页面可见层不再显示过程长文；`test/server.test.ts` 更新页面断言，锁住“摘要单行省略 + 无可见 loading label”的收口结果。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-transcript-renderer.ts](/E:/AII/ugk-pi/src/ui/playground-transcript-renderer.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)

### 腾讯云生产环境增量更新到 `0b63cd7`
- 日期：2026-04-24
- 主题：按用户确认的“增量更新”方式，把腾讯云新加坡生产环境从 `0847852` 更新到 `0b63cd7 feat: consolidate playground run-state rendering`，让线上拿到消息系统后端归并、运行态壳层、运行日志入口和断流恢复链路的完整收口。继续让文档停在旧线上提交，只会把下一次接手的人重新送回坑里。
- 影响范围：服务器发布前已创建 sidecar 备份 `/home/ubuntu/ugk-claw-shared/backups/chrome-sidecar-20260424-121817.tar.gz`，并给旧 `HEAD` 打本地回滚 tag `server-pre-deploy-20260424-121817`；执行了 `git fetch --tags origin`、`git pull --ff-only origin main`、`docker compose --env-file ~/ugk-claw-shared/compose.env -p ugk-pi-claw -f docker-compose.prod.yml config` 与 `up --build -d`；验收通过内外网 `/healthz`、内外网 `/playground`、`check-deps.mjs`、`docker compose ps`，以及页面源码中 `assistant-run-log-trigger` / `assistant-status-summary` 在场且 `assistant-loading-label` 已不再可见。
- 对应入口：[docs/server-ops-quick-reference.md](/E:/AII/ugk-pi/docs/server-ops-quick-reference.md)、[docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)、[docs/handoff-current.md](/E:/AII/ugk-pi/docs/handoff-current.md)

### Agent 显式时间锚点与过期 once 调度拦截
- 日期：2026-04-24
- 主题：给前台 chat 和后台 `conn` runner 发往 agent 的用户消息统一补上 `[当前时间：时区 时间]` 前缀，减少模型把“几分钟后”“待会儿”这类相对时间理解歪的概率；同时把一次性 `once` 调度的过去时间直接判成非法，别再把明显失效的任务写进库里装作创建成功。
- 影响范围：`src/agent/agent-service.ts` 与 `src/agent/background-agent-runner.ts` 在真正送 prompt 前统一注入当前时间上下文；`src/agent/file-artifacts.ts` 负责生成并在用户可见历史中剥离这段内部前缀，避免 transcript 被运行时协议污染；`src/agent/conn-sqlite-store.ts` 对过去的 `once.at` 直接抛校验错误，`src/routes/conns.ts` 将其映射成 `400 BAD_REQUEST`；相关测试补到 `test/agent-service.test.ts`、`test/background-agent-runner.test.ts`、`test/conn-sqlite-store.test.ts`、`test/server.test.ts`。
- 对应入口：[src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)、[src/agent/background-agent-runner.ts](/E:/AII/ugk-pi/src/agent/background-agent-runner.ts)、[src/agent/file-artifacts.ts](/E:/AII/ugk-pi/src/agent/file-artifacts.ts)、[src/agent/conn-sqlite-store.ts](/E:/AII/ugk-pi/src/agent/conn-sqlite-store.ts)、[src/routes/conns.ts](/E:/AII/ugk-pi/src/routes/conns.ts)、[docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

## 2026-04-23

### 生产增量更新到任务面板体验收口版本
- 日期：2026-04-23
- 主题：按增量更新流程把腾讯云新加坡生产环境更新到 `42ef655f80ab7089c844a81a7bf896e78b6963d7`，上线任务结果 Markdown / 对话气泡渲染、composer 单行居中，以及任务消息 / 文件库 / 后台任务管理器透明单行头部。发布过程中还顺手抓住一个 PowerShell 远程命令事故生成的 `-C` 大文件，不然下次构建还得背着 1.4GB 垃圾跑，纯属给服务器负重训练。
- 影响范围：`docs/tencent-cloud-singapore-deploy.md` 追加本次生产增量发布记录、sidecar 备份、回滚 tag、验收结果和事故处理；`docs/server-ops-quick-reference.md` 更新当前线上应用提交。
- 对应入口：[docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)、[docs/server-ops-quick-reference.md](/E:/AII/ugk-pi/docs/server-ops-quick-reference.md)

### 管理面板头部背景透明化
- 日期：2026-04-23
- 主题：统一去掉任务消息、文件库和后台任务管理器头部这块区域的独立背景，尤其是手机端 sticky 头部原来的深色渐变。刚把说明文案拿掉、菜单收成一行，结果又留一块深色底板，视觉上还是在占地盘；这次直接改成透明，让它融进页面。
- 影响范围：`src/ui/playground-task-inbox.ts` 将 `.task-inbox-head` 基础与移动端背景都设为 `transparent`；`src/ui/playground-assets.ts` 将文件库 / 后台任务共享弹层头部改成透明单行动作工具栏，并去掉文件库说明句；`src/ui/playground-conn-activity.ts` 去掉后台任务管理器说明句，并把管理工具条背景改透明；`test/server.test.ts` 增加页面 CSS / DOM 断言锁住透明背景、单行动作区和说明句移除；`docs/playground-current.md` 同步三类面板头部口径；`AGENTS.md` 补充当前稳定事实，避免后续接手把头部又改回旧布局。
- 对应入口：[src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)、[src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)、[src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)

### 任务消息页头部收口
- 日期：2026-04-23
- 主题：压缩任务消息页顶部占用面积，移除“后台任务跑完的结果统一收在这里，不再往当前会话里乱塞。”说明句，把 `未读 / 全部 / 全部已读 / 刷新 / 返回对话` 收进同一行工具栏。之前标题、说明、筛选、动作拆了好几层，信息密度低得像在给按钮办展览；这次让入口回到工具栏该有的样子。
- 影响范围：`src/ui/playground-task-inbox.ts` 调整任务消息页 DOM 和 CSS，桌面与手机端头部均使用不换行横向工具栏；`test/server.test.ts` 锁定说明句移除、筛选按钮位置和移动端单行样式；`docs/playground-current.md` 同步当前交互口径。
- 对应入口：[src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Composer 单行输入纵向居中
- 日期：2026-04-23
- 主题：修复底部输入框 placeholder 和正文单行状态看起来没有纵向居中的老问题。根因不是 placeholder 单独缺样式，而是 `#message` 没写 `rows="1"`，浏览器把 textarea 默认当 2 行算，`syncComposerTextareaHeight()` 又在空内容 / 单行内容时直接用这个 `scrollHeight` 写内联高度，绕开了 CSS `min-height` 这条真正负责居中的约束；这就是典型的“CSS 说居中，JS 和浏览器默认值联手抢方向盘”。
- 影响范围：`src/ui/playground.ts` 把主 composer textarea 明确设为 `rows="1"`，并修正桌面 composer textarea 的 `max-height` 计算，让 10 行高度包含 `14px` 对称 padding 和边框；`src/ui/playground-layout-controller.ts` 在空内容和单行内容时保留 computed `min-height`，多行时才按内容高度增长，并把 overflow 判断改成基于内容高度；`test/server.test.ts` 锁住单行最小高度逻辑和 `rows="1"`；`docs/playground-current.md` 同步 composer 真实口径。
- 对应入口：[src/ui/playground-layout-controller.ts](/E:/AII/ugk-pi/src/ui/playground-layout-controller.ts)、[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### 助手对话 Markdown 层级同步收口
- 日期：2026-04-23
- 主题：把任务结果里已经验证过的 Markdown 视觉层级同步到普通助手对话气泡。助手正文从 `14px` 收到 `12px`，`h1 / h2 / h3` 收口到 `18px / 16px / 14px`，链接、inline code、引用块和表格头沿用任务结果那套轻量颜色区分；用户气泡不跟着改，别把用户输入也设计得像系统输出。
- 影响范围：`src/ui/playground.ts` 在 `.message.assistant .message-content` 下新增助手专属 Markdown 字号和格式色彩覆盖；`test/server.test.ts` 增加页面 CSS 断言并确认 `.message.user` 没有被套同款标题规则；`docs/playground-current.md` 同步 transcript Markdown 真实口径。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### 任务结果卡片按对话气泡规格渲染
- 日期：2026-04-23
- 主题：把任务消息页里的任务结果卡片从干巴巴的纯文本块收口成对话气泡规格。结果正文现在复用 transcript 的 markdown 渲染和 hydration，代码块、表格、链接和文件下载卡片都按消息正文处理；卡片结构也调整为“消息元信息 / 结果气泡 / 底部动作”。点开“查看过程”后的 run detail `Result` 同步改成 `.message-content` 气泡，并优先渲染完整 `resultText`，别再把后台结果做成一条灰色日志。
- 影响范围：`src/ui/playground-task-inbox.ts` 新增 `task-inbox-result-bubble` 结构与样式，任务结果正文改用 `.message-content`、`renderMessageMarkdown()`、`hydrateMarkdownContent()` 和 `appendFileDownloadList()`；`src/ui/playground-conn-activity-controller.ts` 与 `src/ui/playground-conn-activity.ts` 补齐 run detail `Result` 的 markdown 渲染和气泡样式；`test/server.test.ts` 增加页面断言锁住任务结果气泡、run detail markdown 渲染和文件卡片复用；`docs/playground-current.md` 同步任务消息页真实口径。
- 对应入口：[src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)、[src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)、[src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### 任务结果 Markdown 层级收口
- 日期：2026-04-23
- 主题：继续收小任务结果 Markdown 的排版层级。任务结果列表和 run detail `Result` 的正文从 `14px` 收到 `12px`，`h1 / h2 / h3` 分别收口到 `18px / 16px / 14px`，同时给链接、inline code、引用块和表格头做轻量颜色区分，避免后台结果看起来像一整坨同色日志，或者标题大到像在宣读圣旨。
- 影响范围：`src/ui/playground-task-inbox.ts` 调整 `task-inbox-result-bubble` 内 `.message-content` 的字号、标题和格式色彩；`src/ui/playground-conn-activity.ts` 对 `conn-run-result-bubble` 使用同一套收口规则；`test/server.test.ts` 增加 CSS 断言锁住字号和格式色彩；`docs/playground-current.md` 同步任务结果 Markdown 视觉口径。
- 对应入口：[src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)、[src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### 阶段交接文档与下阶段入口整理
- 日期：2026-04-23
- 主题：在任务消息、标准上传和生产增量发布完成后，重写当前交接总览并整理追溯入口，为下一个阶段准备清晰起点。继续拿旧的 `b896f05 / viewMessages` 交接文档当当前事实，那就等于下阶段一开局先踩自己埋的坑。
- 影响范围：`docs/handoff-current.md` 更新为当前阶段交接版，明确 GitHub 最新提交、生产实际运行代码、回滚 tag、sidecar 备份、已完成能力、发布验收和下阶段建议；`docs/traceability-map.md` 修正任务消息页真实入口到 `src/ui/playground-task-inbox.ts`，并清理文件上传章节里混进来的旧 conn 排障项；`docs/server-ops-quick-reference.md` 补充改 nginx 配置后必须 `--force-recreate nginx` 并验证 `client_max_body_size` 的运维口径。
- 对应入口：[docs/handoff-current.md](/E:/AII/ugk-pi/docs/handoff-current.md)、[docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)、[docs/server-ops-quick-reference.md](/E:/AII/ugk-pi/docs/server-ops-quick-reference.md)

### 腾讯云生产环境增量更新到任务消息与标准上传版本
- 日期：2026-04-23
- 主题：按增量更新流程把腾讯云新加坡生产环境从 `bbd8735` 更新到 `4b78f21 feat: consolidate task inbox and asset uploads`，上线标准 multipart 文件上传、任务消息独立收件箱、未读筛选分页、手机端更多按钮数字徽标和后台结果不再默认写回当前会话的收口。
- 影响范围：服务器继续使用 GitHub 工作目录 `~/ugk-claw-repo` 与 shared 运行态 `~/ugk-claw-shared`；发布前备份 sidecar 登录态到 `/home/ubuntu/ugk-claw-shared/backups/chrome-sidecar-20260423-180038.tar.gz`，并给旧 `HEAD` 打本地回滚 tag `server-pre-deploy-20260423-180038`；执行 `git pull --ff-only origin main`、生产 compose config、`up --build -d`，随后因 nginx 单文件 bind mount 旧 inode 问题额外 `--force-recreate nginx`，确认 `client_max_body_size 80m` 真正在容器内生效。
- 验证结果：内网 `/healthz` 返回 `{"ok":true}`，内网 `/playground` 返回 `HTTP/1.1 200 OK`；公网 `http://43.156.19.100:3000/healthz` 返回 `{"ok":true}`，公网 `/playground` 返回 `200`；`check-deps.mjs` 返回 `host-browser: ok` 与 `proxy: ready`；compose 状态显示 `nginx`、`ugk-pi`、`ugk-pi-browser` healthy，`ugk-pi-browser-cdp` 与 `ugk-pi-conn-worker` 正常运行；页面源码包含 `mobile-overflow-task-inbox-badge`、`task-inbox-filter-unread-button` 和 `/v1/assets/upload`；`GET /v1/activity/summary` 正常返回未读数。
- 对应入口：[docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)、[docs/server-ops-quick-reference.md](/E:/AII/ugk-pi/docs/server-ops-quick-reference.md)

### 本轮上传与任务消息收口整理备份
- 日期：2026-04-23
- 主题：整理最近一组上传、任务消息和手机端未读提醒改动的文档口径与备份记录。重点是把 `conn` 默认目标从旧的“当前会话”彻底改成“任务消息页”，并记录当前本地备份包，避免下次接手又拿旧会话投递逻辑当真。
- 影响范围：`docs/runtime-assets-conn-feishu.md` 清理旧的 `POST /v1/conns` 默认绑定当前会话说法，明确默认 `{ "type": "task_inbox" }`；补充手机端 `更多` 按钮任务消息未读数字徽标口径；源码侧确认旧 `mobile-overflow-task-inbox-dot` / `mobile-topbar-notification-dot` 命名无残留，旧 `pendingAttachments` 仅保留为页面断言里的反向检查。
- 备份记录：本地备份包写入 `runtime/backups/20260423-task-inbox-upload-ui-backup.zip`，包含本轮重点源码、测试和文档入口；浏览器验证截图保留在 `runtime/task-inbox-mobile-overflow-count-badge.png`。这两个路径属于本地运行态备份，不作为 GitHub 主仓库内容。
- 验证记录：`node --test --import tsx test\server.test.ts --test-name-pattern "GET /playground returns the test UI html|uses a compact mobile topbar"` 通过；`npx tsc --noEmit` 通过；`git diff --check` 通过；本地 `docker compose restart ugk-pi` 后 `/healthz` 返回 `{"ok":true}`，手机宽度浏览器实测更多按钮数字徽标显示未读数。
- 对应入口：[docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)

### 手机端任务消息未读数字徽标强化
- 日期：2026-04-23
- 主题：让手机端右上角 `更多` 按钮跟随任务消息未读数显示数字徽标，并把任务消息相关红点 / badge 从半透明粉色改成鲜艳高饱和红色 `#ff1744`。之前只在更多菜单里的 `任务消息` 项显示数字，用户不打开菜单就看不到提醒；只放一个点也不够直接，应该在第一层就把数量露出来。
- 影响范围：`src/ui/playground.ts` 在 `mobile-overflow-menu-button` 内增加 `mobile-overflow-task-inbox-badge`；`src/ui/playground-task-inbox.ts` 统一驱动手机更多按钮数字徽标、菜单内任务消息 badge、桌面任务消息 badge 和任务条目未读红点；`test/server.test.ts` 锁定 DOM、样式和状态同步；`docs/playground-current.md` 同步手机端交互口径。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### 任务消息未读筛选与分页收口
- 日期：2026-04-23
- 主题：修复任务消息顶部红标显示未读数、进入页面却看不到未读红点的问题。根因是 `/v1/activity/summary` 统计全库未读，而任务消息页只取最新 50 条；如果未读消息都在更早记录里，前端当然看不到。这个坑很隐蔽，但也很蠢，典型的“统计口径和列表口径不一致”。
- 影响范围：`src/agent/agent-activity-store.ts` 支持 `unreadOnly` 查询；`src/routes/activity.ts` 为 `GET /v1/activity` 增加 `unreadOnly=true`、`hasMore` 和 `nextBefore`；`src/types/api.ts` 补充列表响应字段；`src/agent/conn-db.ts` 增加 activity 未读查询索引；`src/ui/playground-task-inbox.ts` 增加 `未读 / 全部` 筛选和 `加载更多`，顶部有未读时默认进入未读视图；`src/ui/playground.ts` 补齐任务消息分页状态；测试和文档同步更新。
- 对应入口：[src/agent/agent-activity-store.ts](/E:/AII/ugk-pi/src/agent/agent-activity-store.ts)、[src/routes/activity.ts](/E:/AII/ugk-pi/src/routes/activity.ts)、[src/types/api.ts](/E:/AII/ugk-pi/src/types/api.ts)、[src/agent/conn-db.ts](/E:/AII/ugk-pi/src/agent/conn-db.ts)、[src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)、[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[test/agent-activity-store.test.ts](/E:/AII/ugk-pi/test/agent-activity-store.test.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

### 浏览器文件上传标准化与旧 JSON 上传清理
- 日期：2026-04-23
- 主题：修复 `conn` 创建 / 编辑器上传文档时，文件选择后前端看起来没反应、线上上传失败的问题，并把浏览器侧所有文件上传从 base64 JSON 迁到标准 `multipart/form-data`。真正相关链路是文件上传，不是 Immersive Translate 或 `/v1/notifications/stream` 那堆噪音；盯着插件报错抓空气，纯属给自己加戏。
- 影响范围：新增依赖 `@fastify/multipart`；`src/routes/files.ts` 新增 `POST /v1/assets/upload`，支持 `FormData` 标准文件上传并注册为可复用资产，限制为单文件 64MiB、一次最多 5 个文件，并支持 `ASSET_UPLOAD_FILE_LIMIT_BYTES` 环境变量覆盖；移除旧 `POST /v1/assets` JSON `attachments` 上传入口，`POST /v1/assets` 不再接收上传；`src/types/api.ts` 移除旧资产上传请求体并补充 `PAYLOAD_TOO_LARGE` 错误码；`deploy/nginx/default.conf` 将 `client_max_body_size` 对齐到 80m；`src/ui/playground-assets-controller.ts` 新增 `uploadFilesAsAssets()` 并让主 chat 文件选择 / 拖拽上传后自动变成已选资产，同时清掉旧 `pendingAttachments` / FileReader base64 链路；`src/ui/playground-context-usage-controller.ts` 把已选资产的上下文占用估算改成贴近后端真实 prompt 行为：大文本按读取上限估算、二进制按元数据引用估算，不再因大文件误报满上下文；`src/ui/playground-stream-controller.ts` 发送消息时只携带 `assetRefs`，不再塞附件内容；`src/ui/playground-conn-activity-controller.ts` 的“上传新文件”改走 multipart，上传期间禁用保存 / 上传并显示“上传中”，失败时显示带 HTTP 状态的错误；`test/server.test.ts` 增加 multipart 上传、超限 `413`、旧 JSON 上传拒绝和页面无旧 base64 读取函数 / 旧 pending 附件状态断言；运行文档同步新限制与交互口径。
- 对应入口：[src/routes/files.ts](/E:/AII/ugk-pi/src/routes/files.ts)、[src/types/api.ts](/E:/AII/ugk-pi/src/types/api.ts)、[deploy/nginx/default.conf](/E:/AII/ugk-pi/deploy/nginx/default.conf)、[src/ui/playground-assets-controller.ts](/E:/AII/ugk-pi/src/ui/playground-assets-controller.ts)、[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### 腾讯云生产环境增量更新到 conn 时区修复基线
- 日期：2026-04-23
- 主题：按用户确认的“增量更新”方式，将腾讯云新加坡生产环境从 `b896f05` 快进到 `dbb682d fix: normalize conn schedule timezone`，让线上新增 / 编辑 `conn` 任务时也使用新的用户时区语义，避免“北京时间下午 1 点”被错误存成 `13:00Z` 后拖到北京时间晚上 9 点执行。
- 影响范围：服务器仍使用 GitHub 工作目录 `~/ugk-claw-repo` 与 shared 运行态 `~/ugk-claw-shared`，执行 `git pull --ff-only origin main` 与 `docker compose --env-file ~/ugk-claw-shared/compose.env -p ugk-pi-claw -f docker-compose.prod.yml up --build -d`；未触碰旧目录 `~/ugk-pi-claw`，未清理 `.data/agent`、`.data/chrome-sidecar` 或日志目录。
- 验证结果：生产 compose config 通过；`GET /healthz` 返回 `{"ok":true}`；`HEAD /playground` 返回 `200 OK`；web-access 依赖检查返回 `host-browser: ok` 与 `proxy: ready`；compose 状态显示 `ugk-pi` healthy、`ugk-pi-browser` healthy、`nginx` healthy、`ugk-pi-conn-worker` running；线上临时创建 `2099-04-23T13:00:00 + Asia/Shanghai` 的一次性 conn 后，实际归一化为 `2099-04-23T05:00:00.000Z`，临时 conn 已删除且无残留。

### Conn 调度默认时区修复
- 日期：2026-04-23
- 主题：修复 agent 创建后台任务时把用户说的“北京时间下午 1 点”落成 `13:00Z`、导致实际北京时间晚上 9 点才执行的问题。根因是 `cron` 缺省时区原先跟随容器 / 宿主机运行环境，Docker 里通常就是 UTC；一次性任务和间隔任务的 `at / startAt` 也没有本地 wall-clock 时区语义，agent 一旦传错，后端只能照单全收。让提醒准时这件事不该靠 agent 每次心算时区，系统层要兜住。
- 影响范围：`src/agent/conn-store.ts` 将 conn 默认用户时区固定为 `CONN_DEFAULT_TIMEZONE` 或 `Asia/Shanghai`，不再跟随宿主环境；`src/agent/conn-sqlite-store.ts` 支持 `once.timezone` 与 `interval.timezone`，并把无偏移量的本地时间按 IANA 时区归一化成 UTC ISO；`src/routes/conns.ts`、`src/types/api.ts` 与 `.pi/extensions/conn/index.ts` 放开 once / interval 的 timezone 字段；`.pi/skills/conn-orchestrator/SKILL.md` 明确 agent 默认按 `Asia/Shanghai` 解释用户时间，不要把北京时间 `13:00` 直接写成 `13:00Z`；`docs/runtime-assets-conn-feishu.md` 同步新的调度口径。
- 对应入口：`src/agent/conn-store.ts`、`src/agent/conn-sqlite-store.ts`、`src/routes/conns.ts`、`src/types/api.ts`、`.pi/extensions/conn/index.ts`、`.pi/skills/conn-orchestrator/SKILL.md`、`docs/runtime-assets-conn-feishu.md`、`test/conn-sqlite-store.test.ts`、`test/conn-extension.test.ts`

### 腾讯云生产环境增量更新到 b896f05
- 日期：2026-04-23
- 主题：按用户确认的“增量更新”方式把腾讯云新加坡生产环境从 `0a34e81` 更新到 `b896f05 fix: consolidate playground conversation view state`，让线上拿到后端 `viewMessages` 会话状态收口、当前会话抽屉点击修复和重复问答根因治理。本次仍走 `~/ugk-claw-repo` GitHub 工作目录，不碰旧目录 `~/ugk-pi-claw`，也不洗 shared 运行态。部署这种事最怕“应该是新的吧”，所以 commit、tag、备份和验收结果都落文档。
- 影响范围：服务器发布前已创建 sidecar 登录态备份 `/home/ubuntu/ugk-claw-shared/backups/chrome-sidecar-20260423-113909.tar.gz`，并给旧 `HEAD` 打本地回滚 tag `server-pre-deploy-20260423-113909`；`docker compose --env-file ~/ugk-claw-shared/compose.env -p ugk-pi-claw -f docker-compose.prod.yml config`、`up --build -d`、内外网 `/healthz`、内外网 `/playground`、`check-deps.mjs`、`docker compose ps` 和 `/v1/chat/state` 的 `viewMessages` 结构均已验收通过；文档同步更新当前线上提交、回滚点、sidecar 备份和本次 Windows PowerShell CRLF 远程脚本踩坑。
- 对应入口：[docs/handoff-current.md](/E:/AII/ugk-pi/docs/handoff-current.md)、[docs/server-ops-quick-reference.md](/E:/AII/ugk-pi/docs/server-ops-quick-reference.md)、[docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)

### Playground 当前会话抽屉点击与服务端 viewMessages 收口
- 日期：2026-04-23
- 主题：修复手机端历史会话抽屉里点击“当前会话”没有任何反馈的问题，并把同一轮刚结束时偶发“问题 / 回答 / 问题 / 回答”重复渲染从架构上收口。根因前者是当前会话项被 `disabled` 禁掉，点击事件根本到不了 `selectConversationFromDrawer()`；后者是 `GET /v1/chat/state` 在短时窗口里可能同时带有已落到 `messages` 的 canonical 问答和一个 terminal `activeRun`，让前端自己猜两者怎么合并，等于把数据库视图问题扔给浏览器做玄学判断。
- 影响范围：`src/ui/playground-conversations-controller.ts` 中历史会话项只在 `state.loading` 时禁用，当前会话项保持可点击，点中后直接关闭移动抽屉；`src/agent/agent-service.ts` 为 `GET /v1/chat/state` 新增后端归并后的 `viewMessages`，把 canonical `messages` 与 active / terminal run 的可视消息在服务端一次性算好，并用“当前 turn 相对位置”判断 terminal activeRun 是否已被 history 覆盖，避免连续两轮同文本时误吞当前输入；`src/ui/playground.ts` 优先渲染 `viewMessages`，只把 `activeRun` 用作 loading、状态、过程区和事件续订依据，旧的前端补画 active input / assistant 兼容分支已删除；`test/agent-service.test.ts` 与 `test/server.test.ts` 增加回归断言，锁住 terminal overlap 不重复、重复文本不误吞和页面不再保留前端 dedupe helper。
- 对应入口：[src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)、[src/types/api.ts](/E:/AII/ugk-pi/src/types/api.ts)、[src/ui/playground-conversations-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversations-controller.ts)、[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### 旧会话继续对话时保持原会话记忆
- 日期：2026-04-23
- 主题：修复旧会话切回后继续对话时，agent 因 `skillFingerprint` 变化误开空白 session、导致“历史还在但记忆失效、上下文重新从零开始”的问题。会话能显示历史却一开口就失忆，这种行为跟装傻没有区别。
- 影响范围：`src/agent/agent-service.ts` 的 `openSession()` 不再因为技能指纹变化拒绝复用已有会话的 `sessionFile`，旧会话继续发送消息时仍沿用原上下文；`test/agent-service.test.ts` 新增回归断言，锁住“技能目录变化后仍要按旧会话 session 继续跑”的行为；`docs/playground-current.md` 补充该运行时约束，避免下次接手又把这个坑挖回来。
- 对应入口：[src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)、[test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Runtime 文件交付与 conn 资料选择收口
- 日期：2026-04-23
- 主题：继续收口三条烦人的稳定性问题：`web-access` 任务结束后残页会越积越多、agent 通过 `send_file` 交付的文件会在 state 回包后消失、`conn` 编辑器会因为 recent 资产列表裁剪偷偷洗掉已选“附加资料”。这种问题最恶心的地方就在于表面像偶发，实际是代码自己在背后拆台。
- 影响范围：`src/agent/agent-service.ts` 把 browser cleanup scope 从随机 run 级收成稳定的会话级 scope，并在 `session.prompt(...)` 前先预清一轮旧页面、在 `finally` 再收尾清理；同文件的 canonical history 组装逻辑会在只有 `toolResult(send_file)`、没有 assistant 正文时补 synthetic assistant history entry，保证文件卡片不会被 `/v1/chat/state` 洗掉；`src/ui/playground-assets-controller.ts` 不再按 recent 资产列表批量过滤 `selectedAssetRefs` / `connEditorSelectedAssetRefs`，而是按需请求 `/v1/assets/:assetId` 补齐缺失详情；`test/agent-service.test.ts` 与 `test/server.test.ts` 补了对应回归断言，文档同步更新真实口径。
- 对应入口：[src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)、[src/ui/playground-assets-controller.ts](/E:/AII/ugk-pi/src/ui/playground-assets-controller.ts)、[test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Markdown 文件预览编码修复
- 日期：2026-04-23
- 主题：修复 agent 通过 `send_file` 发出的中文 Markdown 文件在浏览器里“打开”后可能显示乱码的问题。根因不是 agent 写坏了 `.md`，而是 `/v1/files/:fileId` 对 `text/markdown` 这类文本资产只返回裸 MIME，没有声明 `charset=utf-8`，浏览器就有机会自作聪明按错编码解析。让浏览器猜编码，这种设计属于把锅外包给玄学。
- 影响范围：`src/routes/files.ts` 对文本型文件响应统一补 `charset=utf-8`，并让 inline 预览判断忽略 MIME 参数，避免加了 charset 后反而从预览退化成下载；`test/server.test.ts` 新增中文 Markdown 回归用例，锁住 `/v1/files/:fileId` 的 `text/markdown; charset=utf-8` 响应头；运行文档同步补充文本文件预览编码口径。
- 对应入口：[src/routes/files.ts](/E:/AII/ugk-pi/src/routes/files.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Runtime / Conn / Feishu 稳定性与交互收口
- 日期：2026-04-23
- 主题：收口一轮真正会影响运行与交互体验的改动：`web-access` 任务结束后按本轮 scope 清理遗留页面，`send_file` 产物不再在会话恢复后消失，`playground` 历史会话支持删除与自定义确认弹窗，输入框纵向居中，上下文详情弹层上移，`/v1/chat/current` 周边的会话目录同步去重降噪，`conn` 编辑器不再逼用户手填 `assetId`，并把 `conn` 系统技能与 Feishu 单窗口接入链路按模块拆开。继续让稳定链路带着重复请求、消失文件和系统弹窗满街跑，那不叫迭代，叫放任脏活长期驻场。
- 影响范围：`src/agent/agent-service.ts` 为每轮 chat 注入 browser cleanup scope、清理 `web-access` 页面并把 `send_file` 文件回挂到 canonical history，同时补 `deleteConversation()` 与会话目录 notification summary；`src/routes/chat.ts`、`src/types/api.ts` 暴露 `DELETE /v1/chat/conversations/:conversationId`；`src/routes/files.ts` 增加 `POST /v1/assets`；`src/ui/playground.ts`、`src/ui/playground-conversations-controller.ts`、`src/ui/playground-assets-controller.ts`、`src/ui/playground-conn-activity-controller.ts` 收口确认弹窗、输入框纵向居中、上下文详情位置、catalog freshness 与 conn 文件选择入口；`.pi/extensions/conn/index.ts` 与 `.pi/skills/conn-orchestrator/SKILL.md` 对齐真实 `conn` 能力、`assetRefs` 与 run 查询；`src/integrations/feishu/` 新增 `message-parser`、`attachment-bridge`、`queue-policy`、`delivery`、`types` 等模块，把文件收发和单窗口消息排队从 service 主文件里拆出来。
- 对应入口：[src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)、[src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)、[src/routes/files.ts](/E:/AII/ugk-pi/src/routes/files.ts)、[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-conversations-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversations-controller.ts)、[src/ui/playground-assets-controller.ts](/E:/AII/ugk-pi/src/ui/playground-assets-controller.ts)、[src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)、[.pi/extensions/conn/index.ts](/E:/AII/ugk-pi/.pi/extensions/conn/index.ts)、[.pi/skills/conn-orchestrator/SKILL.md](/E:/AII/ugk-pi/.pi/skills/conn-orchestrator/SKILL.md)、[src/integrations/feishu/service.ts](/E:/AII/ugk-pi/src/integrations/feishu/service.ts)、[src/integrations/feishu/message-parser.ts](/E:/AII/ugk-pi/src/integrations/feishu/message-parser.ts)、[src/integrations/feishu/attachment-bridge.ts](/E:/AII/ugk-pi/src/integrations/feishu/attachment-bridge.ts)、[src/integrations/feishu/queue-policy.ts](/E:/AII/ugk-pi/src/integrations/feishu/queue-policy.ts)、[src/integrations/feishu/delivery.ts](/E:/AII/ugk-pi/src/integrations/feishu/delivery.ts)、[test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[test/conn-extension.test.ts](/E:/AII/ugk-pi/test/conn-extension.test.ts)、[test/feishu-service.test.ts](/E:/AII/ugk-pi/test/feishu-service.test.ts)

### 腾讯云生产环境增量更新到 0a34e81
- 日期：2026-04-23
- 主题：按用户确认的“增量更新”方式把腾讯云新加坡生产环境从 `21f1a5a` 更新到 `0a34e81 feat: refine playground desktop and mobile UX`，并同步记录最新线上 commit、发布前回滚 tag、sidecar 登录态备份和验收结果。生产事实不写文档，下一次接手就会继续拿旧 commit 当真相，这种坑属于自己挖给未来的自己跳。
- 影响范围：`docs/handoff-current.md` 更新当前本地最新提交、服务器已部署提交、最新回滚 tag 与 sidecar 备份；`docs/server-ops-quick-reference.md` 更新当前线上提交；`docs/tencent-cloud-singapore-deploy.md` 更新部署快照并追加 2026-04-23 增量发布记录，包含 `git pull --ff-only`、`up --build -d`、`healthz`、`playground`、`check-deps.mjs` 和 `docker compose ps` 验收结果。
- 对应入口：[docs/handoff-current.md](/E:/AII/ugk-pi/docs/handoff-current.md)、[docs/server-ops-quick-reference.md](/E:/AII/ugk-pi/docs/server-ops-quick-reference.md)、[docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)

## 2026-04-22

### Playground 桌面与文件预览体验再收口
- 日期：2026-04-23
- 主题：按用户最新反馈继续收口桌面与移动细节：桌面 topbar 工具按钮居中、桌面常驻左侧历史会话栏、桌面上下文电池条放进 `landing-side-right` 内部最右侧、手机历史抽屉头部透明、文件 / 资产 chip 多选后可换行可读、超过 5 个文件改成系统对话提示、上下文入口从 composer 底部移到顶部并改成电池式分段进度条。底部再挂一个小圆环和一行莫名文字，确实很像 UI 自己在碎碎念。
- 影响范围：`src/ui/playground.ts` 调整 shell 双栏布局、桌面历史会话栏、顶部上下文电池条和 composer 底部结构；`src/ui/playground-conversations-controller.ts` 让桌面常驻栏与手机抽屉共用同一份会话目录渲染；`src/ui/playground-mobile-shell-controller.ts` 增加桌面会话列表 DOM 引用；`src/ui/playground-context-usage-controller.ts` 改为驱动 CSS 分段电池进度；`src/ui/playground-assets.ts` 收口文件 chip 换行、4px 圆角、列表内部滚动和手机抽屉头部透明；`src/ui/playground-assets-controller.ts` 把超过 5 个文件的提醒转为 transcript 系统提示，并拦截对应 process-note；`test/server.test.ts` 和 `docs/playground-current.md` 同步新口径。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-conversations-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversations-controller.ts)、[src/ui/playground-mobile-shell-controller.ts](/E:/AII/ugk-pi/src/ui/playground-mobile-shell-controller.ts)、[src/ui/playground-context-usage-controller.ts](/E:/AII/ugk-pi/src/ui/playground-context-usage-controller.ts)、[src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)、[src/ui/playground-assets-controller.ts](/E:/AII/ugk-pi/src/ui/playground-assets-controller.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 手机端操作面板体验收口
- 日期：2026-04-22
- 主题：把手机端 `文件库`、`后台任务`、`全局活动`、后台 run 详情和历史会话侧边栏，从“桌面弹窗压缩版”收口成统一的移动端抽屉 / 卡片交互。继续让用户在窄屏上点一排小按钮，那不是高级，是折磨拇指。
- 影响范围：`src/ui/playground-assets.ts` 在 `max-width: 640px` 内新增贴底抽屉、sticky 标题区、safe-area 底部留白、触摸网格按钮、文件库 / 后台任务 / 全局活动的 64px 列表卡片、后台任务单列工具栏、run 详情贴底面板，以及历史会话抽屉的宽屏卡片化外观、sticky 头部和 active 左侧亮条；`src/ui/playground.ts` 新增面板关闭后的焦点归还 helper，`src/ui/playground-assets-controller.ts`、`src/ui/playground-mobile-shell-controller.ts`、`src/ui/playground-conn-activity-controller.ts` 在打开 / 关闭文件库、后台任务、全局活动、run 详情和编辑器时记录并归还焦点，避免关闭弹层后焦点还卡在 `aria-hidden` 容器里；`test/server.test.ts` 新增页面断言锁住这些手机端 UI 与焦点约束；`docs/playground-current.md` 同步移动端真实交互口径。
- 对应入口：[src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)、[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-assets-controller.ts](/E:/AII/ugk-pi/src/ui/playground-assets-controller.ts)、[src/ui/playground-mobile-shell-controller.ts](/E:/AII/ugk-pi/src/ui/playground-mobile-shell-controller.ts)、[src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 手机历史会话抽屉文字可读性修复
- 日期：2026-04-23
- 主题：修复手机端会话选择侧边栏里标题、摘要和时间文字被压扁到几乎看不见的问题。根因是历史项作为 `button` 继承了全局按钮排版和 disabled 压暗，上轮只改了卡片外观，没有把移动列表文字自己的 `line-height / opacity / letter-spacing` 收回来，这种半截字 UI 看着就像被门夹过。
- 影响范围：`src/ui/playground-assets.ts` 仅调整移动历史会话抽屉：宽度改为 `min(94vw, 380px)`，右侧遮罩加深，历史项最小高度改为 `78px`，标题 / 摘要 / meta 显式设置移动行高，active 当前项不再因 disabled 整体压暗，active 左侧亮条退到文字层下方；`test/server.test.ts` 更新页面断言锁住这些真实视觉约束；`docs/playground-current.md` 同步最新手机历史抽屉口径。
- 对应入口：[src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 手机历史会话抽屉 4px 与去色块二次收口
- 日期：2026-04-23
- 主题：按实机截图继续修手机会话选择侧边栏：第一条 active 会话仍然横向挤压，蓝色选中块过重，圆角也没有遵守用户要求的 `4px`。上一轮能读了，但还丑，这种“能用但碍眼”的状态不能当完成。
- 影响范围：`src/ui/playground-assets.ts` 在移动历史抽屉内把关闭按钮、空态、会话项和 active 亮条统一收成 `4px` 圆角；历史项最小高度提高到 `108px`，采用三行网格排版，摘要显式允许两行换行；active 当前项取消大面积蓝色填充，仅保留细边框和左侧亮条；`test/server.test.ts` 增加断言锁住 `108px`、两行摘要、`4px` 和去色块约束；`docs/playground-current.md` 同步最新口径。
- 对应入口：[src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground Conn 编辑器时间选择改为点选控件
- 日期：2026-04-23
- 主题：把后台任务编辑器里的 `定时执行`、`间隔执行`、`每日执行` 时间输入从系统原生控件改成点选式时间选择。用户填 `07:00` 还提示“请填写每日执行时间”，这就不是用户问题，是控件和校验在给人添堵。
- 影响范围：新增 `flatpickr` 本地依赖，`src/routes/static.ts` 只暴露 `/vendor/flatpickr/` 下的 JS/CSS 与中文 locale；`src/ui/playground.ts` 加载本地 flatpickr 资源；`src/ui/playground-conn-activity.ts` 把 once / interval start / daily time 输入改为 flatpickr 文本入口并补齐深色主题样式；`src/ui/playground-conn-activity-controller.ts` 初始化 `enableTime / time_24hr / disableMobile` 点选控件，并让每日时间解析兼容 `7:00`、`07:00`、`HH:mm:ss`；`test/server.test.ts` 增加页面和静态资源断言；`docs/playground-current.md` 同步当前交互口径。
- 对应入口：[package.json](/E:/AII/ugk-pi/package.json)、[src/routes/static.ts](/E:/AII/ugk-pi/src/routes/static.ts)、[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)、[src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 手机后台面板 4px 圆角统一
- 日期：2026-04-23
- 主题：按用户明确偏好，把 `新建后台任务`、`后台任务`、`全局活动` 和后台 run 详情这些手机面板的大圆角全部收成 `4px`。继续保留 22px / 16px 这种“移动端默认圆润感”，就是跟用户主题对着干，没必要。
- 影响范围：`src/ui/playground-assets.ts` 在移动端覆写里把 `asset-modal`、面板 handle、操作按钮、后台任务 / 全局活动列表卡片、后台任务工具栏、筛选器、run 条目和 run 详情面板统一改为 `4px`；`src/ui/playground-conn-activity.ts` 同步基础 run detail 圆角；顺手修正 `src/ui/playground-conn-activity-controller.ts` 的每日时间正则多转义问题，避免 `07:00` 被误判为空；`test/server.test.ts` 更新断言锁住 `4px` 与正则不再多转义；`docs/playground-current.md` 同步当前视觉规则。
- 对应入口：[src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)、[src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)、[src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 同会话异步回包保住阅读位置
- 日期：2026-04-22
- 主题：修复用户点击一个历史较长的会话后，先看到本地恢复内容并上滑阅读，结果晚到的 `GET /v1/chat/state` 回包又把 transcript 甩回底部的问题。根因不只是一句 `scrollTranscriptToBottom()`，而是同一会话的 canonical state 重绘会整段清空再重画，同时旧的自动滚底 timer 还可能排队补刀，双管齐下把用户阅读位置当不存在。
- 影响范围：`src/ui/playground-layout-controller.ts` 新增取消排队自动滚底的逻辑，用户离开底部后会立即清掉尚未执行的 transcript auto-scroll；`src/ui/playground.ts` 在同一会话的 canonical state 重绘前记录当前 `scrollTop`，重绘后恢复阅读位置并维持 `autoFollowTranscript = false`；`test/server.test.ts` 新增页面断言锁住“用户上滑后取消排队滚底”和“同会话 async state 重绘保住 scrollTop”这两条行为；`docs/playground-current.md` 同步补齐当前交互口径。
- 对应入口：[src/ui/playground-layout-controller.ts](/E:/AII/ugk-pi/src/ui/playground-layout-controller.ts)、[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 会话切换与新会话交互减重
- 日期：2026-04-22
- 主题：收口 `playground` 在切换会话、新会话、恢复同步和广播补同步时的重复请求与强制滚底。之前那套“点一下先等一串 catalog/state round-trip，再顺手把 transcript 拽回底部”的交互，体验烂得很稳定，属于自己给自己找骂。
- 影响范围：`src/ui/playground-conversations-controller.ts` 现在在切换会话时只做一次 canonical `GET /v1/chat/state` 收口，不再先 restore 再 sync run；手机历史抽屉点击后会先立即关闭，再等待 `POST /v1/chat/current` 回包；点击 `新会话` 后会先乐观插入新目录项，再直接激活新会话，不再额外立刻同步 `GET /v1/chat/conversations`。`src/ui/playground-layout-controller.ts` 与 `src/ui/playground-stream-controller.ts` 的恢复 / 广播补同步也改为单次 state 收口；`src/ui/playground.ts` 的历史恢复与状态渲染不再默认 `force` 滚到底部；`test/server.test.ts` 补了回归断言锁住这些行为；`docs/playground-current.md` 同步当前交互口径。
- 对应入口：[src/ui/playground-conversations-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversations-controller.ts)、[src/ui/playground-layout-controller.ts](/E:/AII/ugk-pi/src/ui/playground-layout-controller.ts)、[src/ui/playground-stream-controller.ts](/E:/AII/ugk-pi/src/ui/playground-stream-controller.ts)、[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### 交接文档与发布口径补齐
- 日期：2026-04-22
- 主题：把当前交接所需的发布事实、线上提交、稳定 tag、回滚锚点和推荐阅读顺序补成显式文档入口，免得后续接手继续在 `README`、部署手册、change-log 和聊天记录之间来回抽搐。文档系统如果没有一个交接总览页，表面上看资料不少，实际上还是靠运气找真相。
- 影响范围：新增 [docs/handoff-current.md](/E:/AII/ugk-pi/docs/handoff-current.md) 作为当前交接总览；[README.md](/E:/AII/ugk-pi/README.md) 的稳定事实与文档导航补齐最新稳定 tag 和 handoff 入口；[docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md) 在快速接手与部署场景补 handoff 入口；[docs/server-ops-quick-reference.md](/E:/AII/ugk-pi/docs/server-ops-quick-reference.md) 增加当前线上提交与稳妥增量更新步骤；[docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md) 记录 2026-04-22 最新增量发布结果与 `v4.1.1 -> v4.1.2` 的修正口径。
- 对应入口：[docs/handoff-current.md](/E:/AII/ugk-pi/docs/handoff-current.md)、[README.md](/E:/AII/ugk-pi/README.md)、[docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)、[docs/server-ops-quick-reference.md](/E:/AII/ugk-pi/docs/server-ops-quick-reference.md)、[docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)

### 生产 compose YAML 缩进修正
- 日期：2026-04-22
- 主题：在服务器做增量更新时，`docker-compose.prod.yml` 因为 healthcheck 下的 `retries` 缩进错误直接解析失败，导致 `up --build -d` 根本起不来。这个坑不修，前面 tag 打得再漂亮也只是给自己做纪念册。
- 影响范围：修正 [docker-compose.prod.yml](/E:/AII/ugk-pi/docker-compose.prod.yml) 中 `ugk-pi` 服务 healthcheck 的 YAML 缩进，使生产 compose 能重新通过解析并执行标准增量发布；本条记录补进 [docs/change-log.md](/E:/AII/ugk-pi/docs/change-log.md) 方便后续追溯这次线上发布阻塞点。
- 对应入口：[docker-compose.prod.yml](/E:/AII/ugk-pi/docker-compose.prod.yml)、[docs/change-log.md](/E:/AII/ugk-pi/docs/change-log.md)

### Playground runtime 阶段总结文档补齐
- 日期：2026-04-22
- 主题：把这轮 `playground` runtime 拆分、竞态修复和 assembler 收口补成一份独立阶段总结文档，免得后续 `/init` 或继续改前端的人只能翻 `change-log` 和提交记录拼拼图。只靠零散记录追溯 controller 边界、sync ownership、stream lifecycle 和已修过的坑，效率低得像在拿牙签挖地基。
- 影响范围：新增 [docs/playground-runtime-refactor-summary-2026-04-22.md](/E:/AII/ugk-pi/docs/playground-runtime-refactor-summary-2026-04-22.md)，集中记录本轮 `playground` 拆分阶段、当前边界、关键提交、备份锚点、已修真实问题和后续接手建议；[README.md](/E:/AII/ugk-pi/README.md) 的文档导航新增该文档入口；[docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md) 在快速接手与 playground 场景里补了这份阶段总结入口。
- 对应入口：[docs/playground-runtime-refactor-summary-2026-04-22.md](/E:/AII/ugk-pi/docs/playground-runtime-refactor-summary-2026-04-22.md)、[README.md](/E:/AII/ugk-pi/README.md)、[docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### Playground assembler cleanup 收口
- 日期：2026-04-22
- 主题：继续做 `playground.ts` 的最后一层 assembler cleanup，删掉 stream split 之后遗留的死 helper，并把页面尾部那串散装初始化 / 事件绑定收成明确入口。继续把这些零散语句摊在脚本尾巴上，文件虽然名义上叫 assembler，读起来还是像把 TODO 倒进去了。
- 影响范围：`src/ui/playground.ts` 删除未使用的 `fetchConversationHistory()`，新增 `bindPlaygroundAssemblerEvents()` 与 `initializePlaygroundAssembler()` 收口页面初始化和事件绑定；`test/server.test.ts` 增加页面断言，锁住死 helper 已移除且 assembler 入口存在；`docs/playground-current.md` 同步当前页面装配口径。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 桌面 topbar 合并 landing 工具栏
- 日期：2026-04-22
- 主题：按当前桌面 Web 交互收口，把原本悬浮在 landing hero 上方的 `landing-side-right` 菜单栏直接并入 `<header class="topbar">`，替换掉旧的 `topbar-signal` 字标占位。继续让右侧工具栏飘在首屏上面，结构上就还是两套头部，后面谁改桌面导航谁倒霉。
- 影响范围：`src/ui/playground.ts` 调整桌面 topbar DOM 结构与 `landing-side-right` 布局，移除 `topbar-signal` 标记和对应旧样式；`test/server.test.ts` 改为断言桌面工具栏已经进入 `topbar` 且不再渲染旧字标；`docs/playground-current.md` 同步桌面头部当前事实。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 历史消息时间戳透传修复
- 日期：2026-04-22
- 主题：修复刷新后历史消息气泡时间统一显示 `08:00:00` 的问题。根因不是前端时间格式化，而是 `AgentService` 在把 session message 转成 canonical history 时把 `createdAt` 硬写成了 Unix epoch，东八区一格式化就整排早八。
- 影响范围：`src/agent/agent-service.ts` 现在会优先读取 session message 的 `timestamp`（支持 number / ISO string）并透传成 `createdAt`；只有源消息确实没有时间时才继续回退到 epoch。`src/agent/context-usage.ts` 与 `src/agent/agent-session-factory.ts` 同步补了 `timestamp` 类型；`test/agent-service.test.ts` 新增回归断言，锁死 history 时间戳透传。
- 对应入口：[src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)、[src/agent/context-usage.ts](/E:/AII/ugk-pi/src/agent/context-usage.ts)、[src/agent/agent-session-factory.ts](/E:/AII/ugk-pi/src/agent/agent-session-factory.ts)、[test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground interrupted refresh duplicate 收口
- 日期：2026-04-22
- 主题：修复 `playground` 在“运行中补充消息 -> 中断 -> 刷新”之后，把已经写进 canonical history 的 interrupted partial reply 又作为 terminal `activeRun` 重新返回一遍，导致刷新页同时看到旧助手正文、补充消息和一份重复的中断过程壳子。
- 影响范围：`src/agent/agent-service.ts` 现在会在 `getConversationState()` 内先看 session history 是否已经覆盖 terminal snapshot；如果 interrupted / error 的 terminal run 正文已经存在于 canonical history 里，就不再重复把它塞回 `activeRun`。对于仍需保留的 terminal snapshot，如果 history 末尾已经带上当前轮 user 输入，也会把 `activeRun.input.message` 清空，避免刷新页再把原提问补画第二遍。`test/agent-service.test.ts` 新增两条回归断言，分别锁死“部分回复 + steer + interrupt”的重复 terminal snapshot，以及“无正文即中断”时的输入重复回显。
- 对应入口：[src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)、[test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 会话恢复竞态收口
- 日期：2026-04-22
- 主题：修复 `playground` 在新会话、刷新恢复和异步状态同步时偶发混入旧会话消息的问题。根因不是后端 current conversation 指针错了，而是前端对异步 `GET /v1/chat/state` 回包缺少“当前仍是这条会话”的校验，旧请求慢回时会覆盖当前页面；同时 transcript 清空时没有同步清掉 `transcript-archive`，给旧 DOM 残留留了口子。
- 影响范围：`src/ui/playground.ts` 现在会在 `syncConversationRunState()`、`restoreConversationHistoryFromServer()` 和 `renderConversationState()` 内忽略 stale conversation response；`src/ui/playground-transcript-renderer.ts` 的 `clearRenderedTranscript()` 会同时清空 `transcript-current` 与 `transcript-archive`；`test/server.test.ts` 新增对应回归断言，锁死旧会话异步回包覆盖当前 transcript 的竞态。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-transcript-renderer.ts](/E:/AII/ugk-pi/src/ui/playground-transcript-renderer.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground transcript renderer 拆分
- 日期：2026-04-22
- 主题：继续执行 playground runtime split，把 transcript 条目渲染、assistant loading / process shell、正文复制按钮、markdown hydration、代码块 copy toolbar 和 `bindPlaygroundTranscriptRenderer()` 初始化入口拆到独立 renderer。主文件继续一边拼页面一边手搓消息渲染，迟早又会把 stream 生命周期和消息展示搅成一锅。
- 影响范围：新增 `src/ui/playground-transcript-renderer.ts`，导出浏览器端 markdown renderer 和 transcript renderer inline classic script；`src/ui/playground.ts` 继续持有主 state、会话恢复、流式事件和页面组装，只保留对 transcript 渲染函数的调用点。消息 DOM 结构、复制按钮样式、markdown / code block 展示、历史恢复合并口径和现有 DOM id 保持不变。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-transcript-renderer.ts](/E:/AII/ugk-pi/src/ui/playground-transcript-renderer.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### Playground 布局滚动控制器拆分
- 日期：2026-04-22
- 主题：继续执行 playground runtime split，把 composer 高度同步、会话宽度同步、transcript 自动跟随、回到底部按钮、顶部加载更多触发、以及前后台/联网恢复同步入口拆到独立布局控制器。主文件继续吃这些滚动细节，下一次改消息渲染就又要在泥潭里摸电线，没必要。
- 影响范围：新增 `src/ui/playground-layout-controller.ts`，导出布局常量、布局/滚动/恢复控制函数和事件绑定入口；`src/ui/playground.ts` 继续持有主 state、DOM refs、transcript 渲染、stream 生命周期和页面组装。`--conversation-width`、`--command-deck-offset`、`--transcript-bottom-scroll-buffer`、用户上滑不强制滚底、`visibilitychange/pageshow/online` 恢复同步、以及现有 DOM id 保持不变。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-layout-controller.ts](/E:/AII/ugk-pi/src/ui/playground-layout-controller.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### Playground 会话目录控制器拆分
- 日期：2026-04-22
- 主题：继续执行 playground runtime split，把会话目录加载、新建会话、切换当前会话、运行中禁切和手机历史抽屉列表渲染拆到独立控制器。主文件再继续包办这堆会话入口，就不是页面组装器了，是前端杂物间。
- 影响范围：新增 `src/ui/playground-conversations-controller.ts`，导出会话目录、创建、切换、激活和抽屉列表渲染相关的 inline classic script 片段；`src/ui/playground.ts` 继续持有主 state、transcript 恢复、stream 生命周期、布局滚动和页面组装。`GET /v1/chat/conversations`、`POST /v1/chat/conversations`、`POST /v1/chat/current` 的外部行为、运行中禁止新建/切换、手机历史抽屉展示和现有 DOM id 保持不变。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-conversations-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversations-controller.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### Playground 手机外壳控制器拆分
- 日期：2026-04-22
- 主题：继续给 `src/ui/playground.ts` 减负，把手机端 topbar、更多菜单、历史抽屉开关、遮罩关闭、外部点击关闭和移动端入口绑定拆到独立控制器。注意，这一刀只拆移动外壳，不把 conversation catalog 渲染、切换和服务端同步一起硬搬；那是下一阶段的活，混着拆只会把边界拆成一锅粥。
- 影响范围：新增 `src/ui/playground-mobile-shell-controller.ts`，导出移动端 DOM 引用、shell 控制函数和事件绑定脚本片段；`src/ui/playground.ts` 继续持有主 state、conversation drawer 列表渲染、会话创建/切换和 inline classic script 组装入口。页面 DOM id、移动端视觉、`新会话`、`更多`、`技能 / 文件 / 文件库 / 后台任务 / 全局活动` 入口行为保持不变。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-mobile-shell-controller.ts](/E:/AII/ugk-pi/src/ui/playground-mobile-shell-controller.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### Playground 上下文用量控制器拆分
- 日期：2026-04-22
- 主题：继续拆 `src/ui/playground.ts`，把上下文 token 估算、进度环渲染、详情弹层、状态同步和输入实时重算逻辑拆成独立控制器。这个东西继续挂在主脚本里，后面谁改 composer、文件上传或会话恢复都要顺手绕过一堆 token 计算，纯属给自己找罪受。
- 影响范围：新增 `src/ui/playground-context-usage-controller.ts`，导出上下文用量常量、DOM 引用、控制器函数和事件绑定脚本片段；`src/ui/playground.ts` 保留 `state.contextUsage*` 状态字段和会话主流程里的调用点。进度环 DOM id、详情弹层、估算规则、`GET /v1/chat/status` 同步口径和用户交互不变。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-context-usage-controller.ts](/E:/AII/ugk-pi/src/ui/playground-context-usage-controller.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### Playground 文件/资产运行时控制器拆分
- 日期：2026-04-22
- 主题：继续拆 `src/ui/playground.ts`，把文件上传、拖拽投放、附件 chip、资产库刷新 / 复用、已选资产和输出文件下载这组浏览器运行时逻辑拆到独立控制器。主文件继续包办这些细枝末节，那就不是入口文件，是前端垃圾压缩包。
- 影响范围：新增 `src/ui/playground-assets-controller.ts`，导出文件 / 资产 DOM 引用、运行时 helper 和事件绑定脚本片段；`src/ui/playground.ts` 只保留主页面拼装、会话 / transcript 主流程和对资产控制器函数的调用。顺手移除未使用的 `formatMessageWithContext()` 内联函数。DOM id、HTTP 接口、上传限制、资产复用和下载行为不变。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)、[src/ui/playground-assets-controller.ts](/E:/AII/ugk-pi/src/ui/playground-assets-controller.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### Playground 文件/资产静态片段拆分
- 日期：2026-04-22
- 主题：继续给 `src/ui/playground.ts` 减负，把文件上传、文件 chip、已选资产和资产库弹窗这组静态 UI 片段拆到独立文件。之前主文件已经开始像前端杂物间了，再不分区，后面每改一次 conn 或消息区都要顺手撞到资产库逻辑。
- 影响范围：新增 `src/ui/playground-assets.ts`，承接 drop zone、file chip、selected assets、asset modal 的静态样式片段和资产弹窗 HTML；conn / 全局活动列表样式继续归在 `src/ui/playground-conn-activity.ts`，避免资产模块反向持有后台任务选择器；`src/ui/playground.ts` 保留主页面拼装入口、共享响应式约束和现有运行时逻辑。DOM id、接口路径、事件绑定和用户交互不变。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)、[src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### Conn 后台结果摘要与输出文件索引收口
- 日期：2026-04-22
- 主题：修复同一个 conn 两次运行时通知正文一会儿展示真实答案、一会儿只展示“输出文件已写入”的不稳定体验。根因是后台 runner 只取最后一条 assistant 可见文本，而模型在写完 `output/result.txt` 后可能用一句低信息量的文件提示收尾。
- 影响范围：`src/agent/background-agent-runner.ts` 现在会避开“仅说明输出文件已写入”的尾句，优先保留前面更有用的答案；同时在 run 成功后扫描 workspace 的 `output/` 目录，把实际产物写入 `conn_run_files`，让 run 详情里的输出文件索引和后台生成物对齐。`test/background-agent-runner.test.ts` 增加结果抽取和 output 文件索引回归。
- 对应入口：[src/agent/background-agent-runner.ts](/E:/AII/ugk-pi/src/agent/background-agent-runner.ts)、[test/background-agent-runner.test.ts](/E:/AII/ugk-pi/test/background-agent-runner.test.ts)、[docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground conn/activity 运行时控制器拆分
- 日期：2026-04-22
- 主题：继续把 `src/ui/playground.ts` 里的 conn / 全局活动前端运行时代码拆出去，把创建 / 编辑、管理器、全局活动、run 详情、API 拉取和事件绑定集中到独立控制器片段里。之前这个文件已经涨到离谱，再继续硬塞，后面每改一次 UI 都像在拆炸弹。
- 影响范围：新增 `src/ui/playground-conn-activity-controller.ts`，承接浏览器内联脚本里的 conn/activity 常量、DOM 引用、编辑器逻辑、API helper、渲染函数和事件绑定；`src/ui/playground.ts` 只保留主页面拼装入口并通过模板片段注入这些脚本。外部 DOM id、接口路径、弹层结构和用户交互不变。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)、[src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### Playground conn/activity 静态片段拆分
- 日期：2026-04-22
- 主题：把 `playground` 里继续膨胀的 conn / 全局活动静态 UI 片段先拆出主文件，避免 `src/ui/playground.ts` 继续把样式、弹窗 HTML、运行时脚本和业务状态全搅在一起。
- 影响范围：新增 `src/ui/playground-conn-activity.ts`，承接后台任务过程弹层样式、后台任务管理 / 编辑 / 全局活动样式，以及对应弹窗 HTML；`src/ui/playground.ts` 保留运行时脚本、共享文件 / 资产样式和模块调用入口。外部页面结构、DOM id、接口调用和用户交互不变。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### Conn 路由解析收口与编辑校验补齐
- 日期：2026-04-22
- 主题：把 `POST /v1/conns` 与 `PATCH /v1/conns/:connId` 里重复的 payload 解析收成一套，并补上编辑接口对空白 `title / prompt` 的显式校验，避免传了空白值却被路由悄悄当成“没改”吞掉。
- 影响范围：`src/routes/conns.ts` 新增统一的 conn mutation 解析逻辑，创建与编辑共享 `title / prompt / target / schedule / assetRefs / runtime policy / maxRunMs` 校验；创建继续支持按当前服务端会话补默认目标；编辑在显式传入空白 `title` 或 `prompt` 时返回 `400`；`test/server.test.ts` 新增 PATCH 回归用例；`docs/runtime-assets-conn-feishu.md` 同步接口口径。
- 对应入口：[src/routes/conns.ts](/E:/AII/ugk-pi/src/routes/conns.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

### Conn 列表与活动口径收口
- 日期：2026-04-22
- 主题：继续给 conn 管理界面减负，把后台任务列表和全局活动里的机器口径收成用户能直接读懂的人话，同时顺手清理 `playground` 里 conn 渲染辅助函数的职责边界。
- 影响范围：`src/ui/playground.ts` 为 conn 状态、run 状态、执行方式、结果目标和运行节奏补统一的说明函数；后台任务列表改成 `结果发到 / 执行方式 / 运行节奏` 三行摘要；最近 run 与全局活动里的 `source / conversation / files` 也改成中文口径；`test/server.test.ts` 锁定新 helper 和页面文案；`docs/playground-current.md` 同步当前交互事实。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Conn 每日执行时间校验修复
- 日期：2026-04-22
- 主题：修复 conn 创建 / 编辑里 `每日执行` 明明填了 `09:00` 仍然报“请填写每日执行时间”的问题；根因不是用户没填，而是 `playground` 内联脚本模板把正则里的 `\d`、`\s` 转义吃掉了，浏览器实际执行到的是失效正则。
- 影响范围：`src/ui/playground.ts` 修正 `parseConnCronExpression()`、`parseConnTimeOfDay()` 以及相关脚本里的正则转义，`每日执行时间` 现在兼容 `HH:mm` 和 `HH:mm:ss`；`test/server.test.ts` 与类型检查继续通过；文档同步补齐当前口径。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Conn 创建表单降噪
- 日期：2026-04-22
- 主题：这是当天早些时候的一版中间探索，目标是先把 conn 创建 / 编辑界面从“工程控制台”收成常用优先的产品表单。
- 影响范围：当时尝试过 `conn-editor-schedule-preset`、`conn-editor-schedule-details`、`applyConnSchedulePreset()` 和 `updateConnEditorComplexity()` 这套快捷调度入口；这套口径后来没有保留，已在同日被更晚的“三种调度模式”实现替代。保留这条记录只是为了追溯当天演进路径，不代表当前界面事实。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

### Conn 表单字段人话化
- 日期：2026-04-22
- 主题：把 conn 创建 / 编辑表单里过于工程化的字段改成用户意图文案，避免 `profileId / agentSpecId / skillSetId / modelPolicyId / assetRefs` 这类内部术语直接砸到使用者脸上。
- 影响范围：`src/ui/playground.ts` 把 `任务提示词` 改成 `让它做什么`、把 `目标` 改成 `结果发到哪里`，并把高级区改成 `高级设置`；其中 `profileId / agentSpecId / skillSetId / modelPolicyId / upgradePolicy / maxRunMs / assetRefs` 在前台分别显示为 `任务身份 / 执行模板 / 能力包 / 模型策略 / 版本跟随方式 / 最长等待时长（秒） / 附加资料`，同时补充简短解释；`test/server.test.ts` 增加文案与辅助函数断言；文档同步更新。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

### Conn 触发时间配置收口成人话调度器
- 日期：2026-04-22
- 主题：这是当天早些时候的一版时间配置探索，曾尝试把调度规则扩成六种人话模式。
- 影响范围：当时前端短暂出现过 `一次 / 每隔一段时间 / 每天固定时间 / 工作日固定时间 / 每周固定时间 / Conn 定时表达式` 六种规则；这套交互后来没有保留，已在同日被更晚的 `定时执行 / 间隔执行 / 每日执行` 三种模式替代。保留这条记录用于追溯，不代表当前界面事实。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

### Conn 管理器批量清理与硬删除收口
- 日期：2026-04-22
- 主题：把后台任务管理器从单条删除补齐到可筛选、可多选、可批量删除，并让硬删除同步清理对应 notification / activity，避免测试 conn 删了但全局活动里还残留点不开的旧引用。
- 影响范围：`src/routes/conns.ts` 新增 `POST /v1/conns/bulk-delete`；`src/agent/conn-sqlite-store.ts` 新增 `deleteMany()`，单条 / 批量删除都会清理 `conversation_notifications` 与 `agent_activity_items` 中 `source=conn` 的对应记录；`src/ui/playground.ts` 新增状态筛选、选择当前、清空选择、删除所选和选择计数；`test/server.test.ts`、`test/conn-sqlite-store.test.ts` 补齐回归；文档同步当前硬删除口径。
- 对应入口：[src/routes/conns.ts](/E:/AII/ugk-pi/src/routes/conns.ts)、[src/agent/conn-sqlite-store.ts](/E:/AII/ugk-pi/src/agent/conn-sqlite-store.ts)、[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[test/conn-sqlite-store.test.ts](/E:/AII/ugk-pi/test/conn-sqlite-store.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

### Conn 管理器补删除入口
- 日期：2026-04-22
- 主题：给 playground 后台任务管理器补 `删除` 操作，用二次确认调用已有 `DELETE /v1/conns/:connId`，方便清理测试创建的 conn。
- 影响范围：`src/ui/playground.ts` 新增 `deleteConn(conn)`、危险按钮样式和删除后列表移除 / notice 反馈；`test/server.test.ts` 增加页面断言和 `DELETE /v1/conns/:connId` 路由断言；文档明确当前删除是硬删除，会级联清理该 conn 的 run / event / file 记录。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/routes/conns.ts](/E:/AII/ugk-pi/src/routes/conns.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

### Conn 目标归属可视化与管理器减负
- 日期：2026-04-22
- 主题：在 conn 创建 / 编辑链路里直接展示投递目标、目标 ID 和跨会话观察口径；保存成功后高亮对应 conn，并把最近 run 历史默认折叠，避免后台任务管理面继续堆成日志墙。
- 影响范围：`src/ui/playground.ts` 新增 `conn-editor-target-preview`、`conn-manager-notice`、目标描述辅助函数、保存后高亮反馈和折叠 run 摘要；`test/server.test.ts` 增加页面断言；`docs/playground-current.md` 与 `docs/runtime-assets-conn-feishu.md` 同步口径。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

### Conn 创建 / 编辑 UI 与 playground 前端减负
- 日期：2026-04-22
- 主题：把后台任务管理从“只能看和手动执行”推进到可在 playground 里创建 / 编辑 conn，同时按前端性能报告收口首屏工具堆叠、发送前串行预检、输入重算、页面恢复重复请求、滚动和本地缓存写入等问题。
- 影响范围：`src/ui/playground.ts` 新增 `conn-editor-dialog` / `conn-editor-form`、`POST /v1/conns` / `PATCH /v1/conns/:connId` 提交流程、桌面 landing 顶部紧凑工具栏、layout / resume / scroll / localStorage 调度合并；`test/server.test.ts` 增加 conn editor 与性能减负断言；`docs/playground-current.md` 与 `docs/runtime-assets-conn-feishu.md` 同步当前口径。
- 对应入口：[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

### Conn 失败终态也回投 notification
- 日期：2026-04-22
- 主题：让后台 conn run 在 `failed` / `cancelled` 等终态也向目标 conversation 写入 notification，避免超时或模型失败时前台只看到 run 记录、收不到正文反馈。
- 影响范围：`src/workers/conn-worker.ts` 的通知出口从“仅 succeeded”收口为“所有可交付终态”；失败通知标题为 `<conn title> failed`，正文优先使用 `errorText`；stale run 回收失败也会按目标 conversation 回投；`test/conn-worker.test.ts` 覆盖普通失败与 `maxRunMs` 超时失败的持久化通知和实时广播。
- 对应入口：`src/workers/conn-worker.ts`、`test/conn-worker.test.ts`、`docs/runtime-assets-conn-feishu.md`

## 2026-04-21

### Conn 默认投递目标跟随当前会话
- 主题：把 `POST /v1/conns` 从“必须手填 `target.conversationId` 才知道结果发到哪”收口为“未传 `target` 时自动绑定服务端当前会话”，避免后台任务继续把结果投到历史示例里的固定会话上。
- 影响范围：
  - `src/routes/conns.ts` 新增创建时的默认目标解析；当请求未传 `target` 时，路由会向上游取 `currentConversationId` 并写成 `{ type: "conversation", conversationId }`，显式传入 `conversation` / `feishu_chat` / `feishu_user` 目标时保持原有行为不变。
  - `src/server.ts` 把 `AgentService.getConversationCatalog()` 暴露出来给 conn 路由读取当前会话，避免 conn 路由自己重复碰会话索引。
  - `test/server.test.ts` 新增回归测试，锁定“未传 `target` 默认跟随当前会话”的行为，并保留显式 `target` 与 `cron.timezone` / runtime id 的既有兼容性。
  - `src/config.ts`、`src/agent/conn-db.ts` 与 `docker-compose.yml` 给本地 Docker 新增 `CONN_DATABASE_PATH` + named volume `ugk-pi-conn-db` 口径，并在首次切换路径时自动从 legacy `.data/agent/conn/conn.sqlite` 迁移旧库，绕开 Docker Desktop bind mount 下多进程 SQLite 打开失败的问题。
  - `docker-compose.yml` 与 `docker-compose.prod.yml` 为 `ugk-pi-conn-worker` 显式关闭继承自镜像层的 HTTP `HEALTHCHECK`，避免后台 worker 因没有 `/healthz` 入口被误判成 `unhealthy`。
  - `README.md`、`docs/runtime-assets-conn-feishu.md` 同步更新接口口径，明确 `POST /v1/conns` 的默认目标规则。
- 对应入口：
  - [src/routes/conns.ts](/E:/AII/ugk-pi/src/routes/conns.ts)
  - [src/server.ts](/E:/AII/ugk-pi/src/server.ts)
  - [src/config.ts](/E:/AII/ugk-pi/src/config.ts)
  - [src/agent/conn-db.ts](/E:/AII/ugk-pi/src/agent/conn-db.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [test/conn-db.test.ts](/E:/AII/ugk-pi/test/conn-db.test.ts)
  - [docker-compose.yml](/E:/AII/ugk-pi/docker-compose.yml)
  - [docker-compose.prod.yml](/E:/AII/ugk-pi/docker-compose.prod.yml)
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

### Conn SQLite 并发写锁收口
- 主题：修复独立 `conn-worker` 执行后台任务时，写入 `conn_run_events` 偶发触发 `database is locked`，导致 run 卡在 `running` 的问题。
- 影响范围：
  - `src/agent/conn-db.ts` 在 SQLite 连接初始化时统一启用 `PRAGMA journal_mode = WAL`、`PRAGMA synchronous = NORMAL`、`PRAGMA foreign_keys = ON` 与 `PRAGMA busy_timeout = 5000`，把前台 API 和后台 worker 的多进程并发写入口径收成适合 Docker / Windows / macOS / Linux 共用的默认配置。
  - `test/conn-db.test.ts` 新增回归测试，锁定 `journal_mode=wal` 与 `busy_timeout=5000`，避免后续有人把数据库重新改回单写者心态。
- 对应入口：
  - [src/agent/conn-db.ts](/E:/AII/ugk-pi/src/agent/conn-db.ts)
  - [test/conn-db.test.ts](/E:/AII/ugk-pi/test/conn-db.test.ts)

### Conn Notification 正文只保留可见内容
- 主题：修复后台 conn 完成通知把 assistant `thinking` / `toolCall` 结构一并塞进 `resultText`，导致前台 notification 开头出现 JSON 垃圾的问题。
- 影响范围：
  - `src/agent/background-agent-runner.ts` 的结果提取逻辑改为只保留 assistant 的可见 `text` 内容；`thinking`、`toolCall` 等内部结构不再进入 `resultSummary` / `resultText`。
  - `test/background-agent-runner.test.ts` 新增结构化 assistant 内容回归测试，锁定后台 run 结果只能持久化用户可见正文。
- 对应入口：
  - [src/agent/background-agent-runner.ts](/E:/AII/ugk-pi/src/agent/background-agent-runner.ts)
  - [test/background-agent-runner.test.ts](/E:/AII/ugk-pi/test/background-agent-runner.test.ts)

### Conn Notification Playground 闭环
- 主题：把后台 conn notification 在 playground 里真正做成可追溯闭环，而不是只弹一条“任务完成”就算完事。
- 影响范围：
  - `src/ui/playground.ts` 新增 conn run 详情弹层、消息底部“查看后台任务过程”入口，以及 run 详情 / 事件接口拉取逻辑。
  - 前端历史快照现在会保留 notification 的 `source`、`sourceId`、`runId`，刷新后仍能继续打开 conn run 详情，不再出现“刚看到能点，刷新就失忆”的半残状态。
  - `src/agent/agent-service.ts` / `src/types/api.ts` 已把 notification 元数据透到 `GET /v1/chat/state` 的消息体里。
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [src/types/api.ts](/E:/AII/ugk-pi/src/types/api.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)

### Conn Cron 时区与运行时索引入口
- 主题：补齐 conn 创建链路里真正影响生产行为的两个缺口：`cron.timezone` 和 runtime profile/spec/skill/model policy 索引字段。
- 影响范围：
  - `src/agent/conn-store.ts` / `src/agent/conn-sqlite-store.ts` 现在支持 `cron.timezone`，并在落库时校验 IANA 时区；未显式传入时会固化当前运行环境的时区，避免“每天早上 9 点”跟着容器时区漂移。
  - `src/routes/conns.ts` 现已支持 `profileId`、`agentSpecId`、`skillSetId`、`modelPolicyId`、`upgradePolicy` 的创建 / 更新入参。
  - `README.md`、`docs/runtime-assets-conn-feishu.md`、`docs/traceability-map.md` 同步更新排查与接口口径。
- 对应入口：
  - [src/agent/conn-store.ts](/E:/AII/ugk-pi/src/agent/conn-store.ts)
  - [src/agent/conn-sqlite-store.ts](/E:/AII/ugk-pi/src/agent/conn-sqlite-store.ts)
  - [src/routes/conns.ts](/E:/AII/ugk-pi/src/routes/conns.ts)
  - [src/types/api.ts](/E:/AII/ugk-pi/src/types/api.ts)
  - [test/conn-store.test.ts](/E:/AII/ugk-pi/test/conn-store.test.ts)
  - [test/conn-sqlite-store.test.ts](/E:/AII/ugk-pi/test/conn-sqlite-store.test.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)

### Conn Run 查询 API
- 主题：补齐后台 conn run 的可观测 HTTP 接口，让前台和排障流程能读取 run 历史、单次详情、输出文件索引和过程事件。
- 影响范围：
  - `src/routes/conns.ts` 新增 `GET /v1/conns/:connId/runs`、`GET /v1/conns/:connId/runs/:runId`、`GET /v1/conns/:connId/runs/:runId/events`。
  - `src/types/api.ts` 新增 conn run list/detail/events/files 响应体类型。
  - run 详情和事件查询会校验 `run.connId`，run 不属于路径中的 conn 时返回 `404`。
  - `README.md` 与 `docs/runtime-assets-conn-feishu.md` 同步记录新接口。
- 对应入口：
  - [src/routes/conns.ts](/E:/AII/ugk-pi/src/routes/conns.ts)
  - [src/types/api.ts](/E:/AII/ugk-pi/src/types/api.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

### Conn 旧前台调度链路退场
- 主题：把旧的进程内 `ConnScheduler` / `ConnRunner` / JSON `ConnStore` 运行链路移除，正式切到“前台写 run，后台 worker 执行”的 conn 架构。
- 影响范围：
  - `src/server.ts` 不再创建或启动前台 `ConnScheduler`，默认使用 `ConnDatabase`、`ConnSqliteStore`、`ConnRunStore` 和 `ConversationNotificationStore`。
  - `src/routes/conns.ts` 的 `POST /v1/conns/:connId/run` 改为创建 `pending` run 并返回 `202`，不再同步调用前台 agent。
  - `src/workers/conn-worker.ts` 增加独立 CLI 入口；`package.json` 新增 `npm run worker:conn`；compose 新增无公网端口的 `ugk-pi-conn-worker` 服务，共用 `/app/.data/agent` 持久化目录。
  - 删除 `src/agent/conn-scheduler.ts` 与 `src/agent/conn-runner.ts`，`src/agent/conn-store.ts` 只保留 conn 类型和调度时间计算函数。
  - `docs/runtime-assets-conn-feishu.md`、`docs/traceability-map.md` 与 `AGENTS.md` 同步改为新的 SQLite / worker 排查入口。
- 对应入口：
  - [src/server.ts](/E:/AII/ugk-pi/src/server.ts)
  - [src/routes/conns.ts](/E:/AII/ugk-pi/src/routes/conns.ts)
  - [src/workers/conn-worker.ts](/E:/AII/ugk-pi/src/workers/conn-worker.ts)
  - [docker-compose.yml](/E:/AII/ugk-pi/docker-compose.yml)
  - [docker-compose.prod.yml](/E:/AII/ugk-pi/docker-compose.prod.yml)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [test/containerization.test.ts](/E:/AII/ugk-pi/test/containerization.test.ts)

### Conn 后台 agent 持久化地基
- 主题：为新的独立 `conn-worker` 架构落下第一批跨平台持久化地基；当前先新增基础设施，不切换现有前台 `/v1/conns` 运行链路。
- 影响范围：
  - 新增 `node:sqlite` 版 `ConnDatabase`，初始化 `conns`、`conn_runs`、`conn_run_events`、`conn_run_files`、`conversation_notifications` 等表；不引入 `better-sqlite3` / `sqlite3` 这类 native npm 依赖，降低 Windows / macOS / Linux 经 Docker 部署时的编译适配风险。
  - 新增 `ConnSqliteStore`，conn definition 开始具备 `profileId`、`agentSpecId`、`skillSetId`、`modelPolicyId`、`upgradePolicy` 等运行时索引字段，为后台 agent 按 ID 解析当前规范和 skills 做准备。
  - 新增 `ConnRunStore`，支持 pending/running/succeeded/failed run 记录、worker lease claim、lease 过期恢复领取、事件日志、输出文件索引，并在 run 完成后回写 conn 的 `lastRunAt` / `nextRunAt` / `lastRunId`。
  - 新增 `BackgroundWorkspaceManager`，每次 run 创建独立 `input/`、`work/`、`output/`、`logs/`、`session/` 和 `manifest.json`，并把 `assetRefs` 快照到 `input/`，避免复杂任务互相覆盖中间文件。
  - 新增 `BackgroundAgentProfileResolver`，按 `profileId / agentSpecId / skillSetId / modelPolicyId` 解析运行时 snapshot；默认 skill set version 由实际 skill 内容 hash 得出，便于追溯后台 run 当时用的是哪套能力。
  - 新增 `BackgroundAgentRunner`，后台 run 使用独立 session factory、独立 workspace 和 run event log；成功/失败都写回 `conn_runs`，不调用前台 `AgentService.chat()`。
  - 新增 `ConversationNotificationStore` 和 `ConnWorker`，worker tick 会把 due conn 变成 run、通过 lease 领取执行，成功后向目标 conversation 写入幂等 notification。
  - `AgentService.getConversationState()` 支持合并后台 notification 为 `kind=notification` 的前台消息，但 `getConversationHistory()` 仍只返回真实 pi session history，避免后台结果污染前台 LLM 上下文。
- 对应入口：
  - [src/agent/conn-db.ts](/E:/AII/ugk-pi/src/agent/conn-db.ts)
  - [src/agent/conn-sqlite-store.ts](/E:/AII/ugk-pi/src/agent/conn-sqlite-store.ts)
  - [src/agent/conn-run-store.ts](/E:/AII/ugk-pi/src/agent/conn-run-store.ts)
  - [src/agent/background-workspace.ts](/E:/AII/ugk-pi/src/agent/background-workspace.ts)
  - [src/agent/background-agent-profile.ts](/E:/AII/ugk-pi/src/agent/background-agent-profile.ts)
  - [src/agent/background-agent-runner.ts](/E:/AII/ugk-pi/src/agent/background-agent-runner.ts)
  - [src/agent/conversation-notification-store.ts](/E:/AII/ugk-pi/src/agent/conversation-notification-store.ts)
  - [src/workers/conn-worker.ts](/E:/AII/ugk-pi/src/workers/conn-worker.ts)
  - [test/conn-db.test.ts](/E:/AII/ugk-pi/test/conn-db.test.ts)
  - [test/conn-sqlite-store.test.ts](/E:/AII/ugk-pi/test/conn-sqlite-store.test.ts)
  - [test/conn-run-store.test.ts](/E:/AII/ugk-pi/test/conn-run-store.test.ts)
  - [test/background-workspace.test.ts](/E:/AII/ugk-pi/test/background-workspace.test.ts)
  - [test/background-agent-profile.test.ts](/E:/AII/ugk-pi/test/background-agent-profile.test.ts)
  - [test/background-agent-runner.test.ts](/E:/AII/ugk-pi/test/background-agent-runner.test.ts)
  - [test/conversation-notification-store.test.ts](/E:/AII/ugk-pi/test/conversation-notification-store.test.ts)
  - [test/conn-worker.test.ts](/E:/AII/ugk-pi/test/conn-worker.test.ts)

### 生产 agent 数据持久化挂载
- 主题：修复生产增量更新重建 `ugk-pi` 容器后，playground 历史会话、session 与资产索引不持久的问题。
- 影响范围：
  - `docker-compose.prod.yml` 为 app 容器新增 `${UGK_AGENT_DATA_DIR:-./.data/agent}:/app/.data/agent` bind mount，避免 `conversation-index.json`、`sessions/`、`asset-index.json`、`conn/` 等状态继续落在容器可写层。
  - `.env.example`、`docs/tencent-cloud-singapore-deploy.md` 与 `docs/server-ops-quick-reference.md` 补充 `UGK_AGENT_DATA_DIR` 口径，服务器应指向 `~/ugk-claw-shared/.data/agent`。
  - `AGENTS.md` 更新稳定事实：生产运行态外置不只包括 Chrome 登录态，还包括 agent 会话数据；更新后历史消失时先查 mount 和 compose env。
  - `test/containerization.test.ts` 增加回归断言，防止生产 compose 再丢 agent 数据挂载。
- 对应入口：
  - [docker-compose.prod.yml](/E:/AII/ugk-pi/docker-compose.prod.yml)
  - [.env.example](/E:/AII/ugk-pi/.env.example)
  - [test/containerization.test.ts](/E:/AII/ugk-pi/test/containerization.test.ts)
  - [docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)

### 近期改动文档补全
- 主题：把最近几轮 UI 与 runtime 修复补进接手文档，避免后续 agent 只看旧索引又走回头路。
- 影响范围：
  - `AGENTS.md` 补充 active transcript 底部滚动缓冲的稳定事实，明确不要把 `--transcript-bottom-scroll-buffer` 当成多余 padding 删除。
  - `docs/traceability-map.md` 在 playground 前端排查索引中补充“底部 composer 遮挡最后一条消息 / active transcript 滚动缓冲”场景。
  - `docs/web-access-browser-bridge.md` 更新时间改为 `2026-04-21`，并在关键文件里补充 `src/agent/browser-cleanup.ts` 与 `src/agent/agent-service.ts`。
- 对应入口：
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)
  - [docs/web-access-browser-bridge.md](/E:/AII/ugk-pi/docs/web-access-browser-bridge.md)

### Playground 对话底部滚动缓冲
- 主题：修复手机端对话最后一屏被底部 composer 遮挡、无法继续上拖查看的问题。
- 影响范围：
  - `src/ui/playground.ts` 新增 `--transcript-bottom-scroll-buffer`，并在 active 对话态给 `.transcript-current` 增加底部 padding；手机端按 `safe-area-inset-bottom` 放大缓冲。
  - `test/server.test.ts` 增加 `/playground` 回归断言，锁住滚动容器底部缓冲、`scroll-padding-bottom` 与手机端覆盖值。
  - `docs/playground-current.md` 同步记录 active transcript 底部滚动余量约束。
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 刷新后连续助手消息合并
- 主题：修复已完成任务刷新后，同一轮 assistant 处理过程从一个回复气泡散成多条“助手”气泡的问题。
- 影响范围：
  - `src/agent/agent-service.ts` 将连续的 assistant session messages 合并为一条 canonical history message，并让 `GET /v1/chat/state` 与 `GET /v1/chat/history` 使用同一套合并规则。
  - `test/agent-service.test.ts` 增加回归测试，覆盖一轮用户请求后连续多条 assistant 消息恢复为一条助手回复的场景。
  - `AGENTS.md` 与 `docs/playground-current.md` 同步记录刷新恢复口径：同一轮完成后的浏览器处理叙述和最终回答不能拆成多条气泡。
- 对应入口：
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Agent 任务结束自动清理 web-access 浏览器页面
- 主题：把服务器运行容器里的临时热改正式落回主仓库，修复 `web-access` 在 agent scope 下保留的浏览器页面不会随任务结束自动关闭的问题。
- 影响范围：
  - 新增 `src/agent/browser-cleanup.ts`，按 `CLAUDE_AGENT_ID` / `CLAUDE_HOOK_AGENT_ID` / `agent_id` 解析 agent scope，并调用 `POST /session/close-all?metaAgentScope=...` 清理该 scope 下的浏览器 target。
  - `src/agent/agent-service.ts` 在 `runChat` 的 `finally` 中 best-effort 调用 `closeBrowserTargetsForScope(undefined)`，正常完成、错误和中断都会进入清理；清理失败只 warn，不覆盖原任务结果。
  - `test/browser-cleanup.test.ts` 覆盖 scope 解析、无 scope 跳过、代理请求、代理失败和 proxy 配置错误不抛错；`test/agent-service.test.ts` 覆盖 chat 结束后触发 scoped cleanup。
  - `AGENTS.md`、`docs/web-access-browser-bridge.md`、`docs/traceability-map.md` 同步记录任务结束清理口径，并明确不要只在运行容器 `/app` 热改。
- 对应入口：
  - [src/agent/browser-cleanup.ts](/E:/AII/ugk-pi/src/agent/browser-cleanup.ts)
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [test/browser-cleanup.test.ts](/E:/AII/ugk-pi/test/browser-cleanup.test.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)
  - [docs/web-access-browser-bridge.md](/E:/AII/ugk-pi/docs/web-access-browser-bridge.md)

### Playground 手机历史抽屉右侧遮罩去模糊
- 主题：手机历史会话侧边栏展开后，右侧不再显示暗色毛玻璃背景，只保留透明点击遮罩用于关闭抽屉。
- 影响范围：
  - `src/ui/playground.ts` 将 `.mobile-drawer-backdrop` 改为 `background: transparent` 与 `backdrop-filter: none`，移除右侧区域的暗色和模糊效果。
  - `test/server.test.ts` 增加移动抽屉 backdrop 透明、无 blur 的回归断言。
  - `docs/playground-current.md` 同步更新手机历史会话抽屉遮罩口径。
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 手机侧边栏与输入框视觉收口
- 主题：把手机历史会话侧边栏条目圆角收为 `4px`，隐藏列表侧边滚动条，并让 composer 输入框 placeholder / 正文在单行状态下视觉居中。
- 影响范围：
  - `src/ui/playground.ts` 将 `.mobile-conversation-item` 从 `14px` 圆角改为 `4px`，与手机端统一矩形圆角口径一致。
  - `src/ui/playground.ts` 为 `.mobile-conversation-list` 增加 `scrollbar-width: none`、`-ms-overflow-style: none` 和 WebKit scrollbar 隐藏规则，保留纵向滚动但不显示侧边滑动条。
  - `src/ui/playground.ts` 将手机 active textarea 调整为 `44px` 高度下的 `12px 0` 对称 padding，landing textarea 调整为 `40px` 高度下的 `10px 0` padding，并同步 max-height 计算，避免 placeholder 和正文偏上。
  - `test/server.test.ts` 增加历史会话列表圆角、滚动条隐藏、textarea 对称 padding 与最大高度计算的回归断言。
  - `docs/playground-current.md` 同步更新手机侧边栏和输入框视觉口径。
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 消息复制 icon 视觉降噪
- 主题：把消息气泡底部的小型复制 icon 改成灰色裸 icon，不再显示按钮背景、边框或阴影。
- 影响范围：
  - `src/ui/playground.ts` 将 `.message-copy-button` 改为透明背景、`border: 0`、`box-shadow: none`，基础色收为灰色，并覆盖 hover / focus 状态，避免全局按钮样式重新冒出底色和边框。
  - `src/ui/playground.ts` 将复制 icon 伪元素的前景纸张背景改为透明，只保留灰色线条图形。
  - `test/server.test.ts` 增加复制按钮透明背景、无边框、无阴影、灰色 icon 和 hover / focus 覆盖的回归断言。
  - `docs/playground-current.md` 同步更新消息复制操作的真实 UI 口径。
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

## 2026-04-20

### Playground 消息复制按钮改为小型 icon
- 主题：把消息气泡底部的“复制正文”文字按钮收口成小型复制 icon，并让操作区纵向更贴近消息气泡。
- 影响范围：
  - `src/ui/playground.ts` 将 `.message-actions` 的顶部间距从 `10px` 收到 `4px`，减少消息气泡和复制操作之间的空档。
  - `src/ui/playground.ts` 将 `.message-copy-button` 改为 `26px` icon-only 按钮，手机端收为 `24px`；复制图形由 CSS 伪元素绘制。
  - `src/ui/playground.ts` 保留 `aria-label`、`title` 和 `.visually-hidden` 文本，复制成功 / 失败时更新无障碍提示，不再用可见文字撑开按钮。
  - `test/server.test.ts` 增加 icon-only 复制按钮、尺寸、间距和无障碍文本的回归断言。
  - `docs/playground-current.md` 同步更新消息复制操作的真实 UI 口径。
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 输入框 placeholder 中文化
- 主题：把 composer 输入框运行时覆盖的英文占位符 `Enter terminal command or query neural core...` 改为中文“和我聊聊吧”。
- 影响范围：
  - `src/ui/playground.ts` 同步更新 textarea HTML placeholder 和脚本初始化 placeholder，避免加载前后文案不一致。
  - `test/server.test.ts` 增加回归断言，防止英文调试口吻再次回流。
  - `docs/playground-current.md` 同步记录当前 placeholder 口径。
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 空态方块 UGK 与移动输入框纯色背景
- 主题：把手机空态中间的 `UGK` 标识从普通字母字符改成方块字符拼出的像素标识，并把移动端底部 composer 背景从渐变收成单层纯色。
- 影响范围：
  - `src/ui/playground.ts` 更新 idle transcript 伪元素内容，使用 `■` 方块字符组成 `UGK`。
  - `src/ui/playground.ts` 将 `max-width: 640px` 下普通 `.composer` 与 landing `.composer` 背景改为 `rgba(8, 10, 19, 0.98)`，移除这两处 `linear-gradient`。
  - `test/server.test.ts` 增加方块字符标识与移动端 composer 背景纯色的回归断言。
  - `docs/playground-current.md` 同步更新手机空态和底部 composer 背景口径。
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 输入框十行自适应与空态 UGK 标识
- 主题：把底部输入框从“最多两行且不好查看超出内容”的旧表现，改为随输入行数自适应增长，最多显示 10 行；超过 10 行后在 textarea 内部纵向滚动。同时移除手机空态中间的中文提示方块，改为像素字符 `UGK` 标识。
- 影响范围：
  - `src/ui/playground.ts` 为 composer textarea 增加 `--composer-textarea-max-lines: 10`，桌面、landing 与手机断点统一按行高 + padding 计算最大高度，并保留紧凑初始高度。
  - `src/ui/playground.ts` 新增 `syncComposerTextareaHeight()`，在输入、清空、草稿恢复和初始化时同步 textarea 实际高度；超过 10 行后切换为 `overflow-y: auto`，未超过时隐藏内部滚动条。
  - `src/ui/playground.ts` 将手机 idle transcript 的旧中文提示替换为 `UGK` 像素字符伪元素，使用等宽字体和 `white-space: pre` 保持字符图形。
  - `test/server.test.ts` 增加输入框 10 行自适应、内部滚动、landing/mobile 最大高度与空态 `UGK` 标识的回归断言。
  - `docs/playground-current.md` 同步更新当前输入框高度与手机空态展示口径。
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground active 输入区高度收口
- 主题：修复进入对话后 `#composer-drop-target.composer` 仍沿用偏高 textarea 高度，导致底部输入区在手机、窄屏和普通对话态下占据过多屏幕的问题。
- 影响范围：
  - `src/ui/playground.ts` 进一步收口 landing 空态的 `.shell[data-stage-mode="landing"] .composer`：padding 改为 `6px 8px 6px 10px`，textarea 固定 `40px`，发送 / 打断按钮最小高度改为 `40px`，避免底部输入面板继续按大块卡片展示。
  - Landing composer 外壳新增 `align-self: end`、`height: fit-content`、`max-height: 64px`，并让 `command-deck` 使用 `grid-auto-rows: max-content` / `align-content: end`，防止手机 grid 把 `section#composer-drop-target` 拉伸成接近半屏高度。
  - Landing 空态的 `command-deck` 间距、底部 margin 和 context usage 行高度同步压缩，减少输入框外围空间继续制造“底部很高”的视觉问题。
  - `src/ui/playground.ts` 将 active 对话态基础 `.composer` padding、间距和 textarea 高度整体收口；普通对话 textarea 从 `min-height: 128px` / `max-height: 28vh` 改为 `72px` / `18vh`，并禁用手动竖向 resize。
  - `max-width: 960px` 下 `.composer-side` 改为两列横排，避免发送 / 打断按钮掉到输入框下方继续撑高底部区域。
  - `max-width: 640px` 下为普通 `.composer`、`.composer-main`、`.composer-header`、`.composer textarea` 和 `.composer-side` 增加更紧凑约束；active 对话态不再只吃桌面基础高度。
  - 手机端 active 对话态 textarea 最小高度收口为 `44px`、最大高度收口为 `96px`，并禁用手动竖向 resize，避免输入区继续挤压 transcript。
  - `test/server.test.ts` 增加回归断言，固定默认和手机端 active composer 的紧凑 CSS 入口，防止后续只修 landing 空态或只修单一断点。
  - `docs/playground-current.md` 同步记录当前 active 输入区高度口径。
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 切换为单工人多会话模型
- 主题：把 `playground` 从固定 `agent:global` + reset 旧会话，切到“一个 agent、多条历史会话、一个全局当前会话”的模型；新会话是真正新建会话，旧会话保留为历史。
- 影响范围：
  - `src/agent/conversation-store.ts` 的会话索引升级为 `{ currentConversationId, conversations }`，并兼容旧的平铺索引格式。
  - `src/agent/agent-service.ts` 新增会话目录、新建会话、切换当前会话能力；运行中拒绝新建和切换，确保一个 agent 同时只在一条产线上工作。
  - `src/routes/chat.ts` 新增 `GET /v1/chat/conversations`、`POST /v1/chat/conversations`、`POST /v1/chat/current`，`src/types/api.ts` 同步新增响应体类型。
  - `src/ui/playground.ts` 启动时先同步服务端当前会话；`新会话` 改为创建并激活新会话；手机端品牌区新增历史会话抽屉，点击历史项后切换全局当前会话；前端创建会话的 JSON POST 明确发送 `{}` body，避免 Fastify 把空 JSON 请求拦成 `FST_ERR_CTP_EMPTY_JSON_BODY`。
  - `test/conversation-store.test.ts`、`test/agent-service.test.ts`、`test/server.test.ts` 覆盖新索引结构、单工人运行约束、会话目录接口和前端入口脚本。
  - `AGENTS.md`、`README.md`、`docs/playground-current.md`、`docs/traceability-map.md` 同步移除固定 `agent:global` 与 `POST /v1/chat/reset` 作为新会话主路径的旧口径。
- 对应入口：
  - [src/agent/conversation-store.ts](/E:/AII/ugk-pi/src/agent/conversation-store.ts)
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/conversation-store.test.ts](/E:/AII/ugk-pi/test/conversation-store.test.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 手机端顶部收口为品牌状态栏 + 溢出菜单
- 主题：把手机端顶部从常驻四按钮条收口成更薄的品牌状态栏，避免继续拿操作按钮堆满首屏高度；左侧恢复品牌识别，右侧只保留新会话和更多操作。
- 影响范围：
  - `src/ui/playground.ts` 的手机端顶部结构改为 `logo + UGK Claw + 新会话按钮 + 更多按钮`，并新增右上角溢出菜单承载 `技能 / 文件 / 文件库`
  - 手机端样式从旧的 `mobile-action-strip` 收口到 `mobile-topbar` / `mobile-overflow-menu`，把交互高度压回约 `48px` 的紧凑状态栏
  - `test/server.test.ts` 更新 `/playground` 页面断言，明确手机端真实结构是紧凑状态栏 + overflow actions，不再是四按钮常驻条
  - `public/ugk-claw-mobile-logo.png` 新增手机端品牌 logo 静态资源，避免把图片路径继续塞进内联代码里乱飞
  - `AGENTS.md`、`docs/playground-current.md`、`docs/traceability-map.md` 同步移除旧的“四按钮条”口径，改成当前真实约束
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [public/ugk-claw-mobile-logo.png](/E:/AII/ugk-pi/public/ugk-claw-mobile-logo.png)
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### Playground 新会话改为服务端真重置
- 主题：修复点击 `新会话` 后只在前端清 DOM、插入本地提示气泡，结果刷新又被 `/v1/chat/state` 的真实历史打回去的问题。
- 影响范围：
  - `src/routes/chat.ts` 新增 `POST /v1/chat/reset`，由后端负责清空指定会话的 canonical state。
  - `src/agent/agent-service.ts` 新增 `resetConversation()`；空闲时删除会话映射，运行中则返回 `reason: "running"`，避免把还在执行的 active run 硬抹掉。
  - `src/agent/conversation-store.ts` 新增删除会话索引能力，让 `agent:global` 的新会话真正落到服务端状态，而不是仅靠前端本地假动作。
  - `src/ui/playground.ts` 的 `新会话` 按钮改为调用 `/v1/chat/reset` 后再按清空后的 `/v1/chat/state` 重绘；移除刷新后会消失的本地“当前启用新会话”提示气泡。
  - `test/agent-service.test.ts`、`test/server.test.ts` 增加回归断言，覆盖服务端 reset 和前端入口脚本。
  - `AGENTS.md`、`README.md`、`docs/traceability-map.md`、`docs/playground-current.md` 同步更新新会话语义与接口口径。
- 对应入口：
  - [src/agent/conversation-store.ts](/E:/AII/ugk-pi/src/agent/conversation-store.ts)
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)

### Playground 统一 agent 状态渲染
- 主题：把刷新、多浏览器和运行中任务展示收口到后端 canonical conversation state，避免前端继续把 history、status、events、localStorage 和 DOM 指针拼成多套状态。
- 影响范围：
  - `src/types/api.ts` 新增 `ConversationStateResponseBody`、`ChatActiveRunBody`、`ChatProcessBody` 等状态协议，明确 `messages + activeRun` 的统一渲染结构。
  - `src/agent/agent-service.ts` 在 active run 内维护可渲染 `view` 快照，随 `run_started`、`text_delta`、工具事件、队列、`done`、`interrupted`、`error` 更新同一份状态。
  - `src/routes/chat.ts` 新增 `GET /v1/chat/state`，返回全局会话历史、当前运行态、active assistant 正文、过程区、队列和上下文占用；旧 `/history`、`/status`、`/events` 保留兼容。
  - `src/ui/playground.ts` 刷新恢复改为优先消费 `/v1/chat/state` 并通过 `renderConversationState()` 渲染；本地 `process` 快照恢复和写回逻辑移除，SSE 只继续更新同一个 active assistant 气泡。
  - `test/agent-service.test.ts` 与 `test/server.test.ts` 增加 canonical state、路由和前端入口断言，防止同一 run 再被拆成多条助手过程消息。
  - `AGENTS.md`、`README.md`、`docs/traceability-map.md`、`docs/playground-current.md` 同步更新刷新恢复、运行态和 context usage 口径。
- 对应入口：
  - [src/types/api.ts](/E:/AII/ugk-pi/src/types/api.ts)
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 多前端终态一致性收口
- 主题：把 `error` / `interrupted` 也收进 canonical conversation state，顺手修掉断流恢复误报失败和重复 prompt 被观察页吞掉的边界问题，别再让不同前端各看各的平行宇宙。
- 影响范围：
  - `src/agent/agent-service.ts` 新增 terminal run snapshot；active run 结束后会把 `error` / `interrupted` 终态短期保留给刷新页和观察页，不再随着 `activeRuns` 清理一起蒸发。
  - `src/agent/agent-service.ts` 在 provider 失败时会先发 canonical `error` 事件，再抛给主流路由；主 `/v1/chat/stream` 和 `/v1/chat/events` 终于看到的是同一份失败语义，不再靠路由层偷偷补一条只有当前页能看到的 SSE。
  - `src/routes/chat.ts` 的 `/v1/chat/events` 不再把“当前已经不在运行”硬翻译成 `error` 事件；这类情况直接收流，让前端优先信 `/v1/chat/state` 的最终状态。
  - `src/ui/playground.ts` 断流恢复会先比较 canonical state 是否已经推进到终态；如果任务其实已经正常收口，就不再误报“流被中断 / 网络错误”。
  - `src/agent/agent-service.ts` 在生成 `messages + activeRun` 视图时会剔除尾部那条与 `activeRun.input.message` 重复的历史 user message，避免连续两轮都发“继续”时观察页把当前输入吞掉。
  - `src/types/api.ts` 给 `error` 事件补上 `conversationId`，让前端在失败收口时也能回源同步上下文占用和历史。
  - `test/agent-service.test.ts`、`test/server.test.ts` 增加回归断言，覆盖 canonical error 终态、interrupt 终态语义、重复 prompt 观察页渲染，以及刷新恢复时不误报失败的页面脚本入口。
- 对应入口：
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)
  - [src/types/api.ts](/E:/AII/ugk-pi/src/types/api.ts)
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 历史恢复过滤内部 prompt 协议
- 主题：修复刷新或重新打开 playground 后，从后端 session 恢复的用户历史消息会暴露 `<asset_reference_protocol>`、`<file_response_protocol>` 等内部 prompt 注入段的问题。
- 影响范围：
  - `src/agent/file-artifacts.ts` 新增内部 prompt 上下文剥离逻辑，统一移除 `<user_assets>`、`<asset_reference_protocol>`、`<file_response_protocol>` 这些只应给模型看的协议段。
  - `src/agent/agent-service.ts` 在 `GET /v1/chat/history` 还原用户消息时应用剥离逻辑，保留真实用户原文，不影响助手回复、工具过程和实际发送给模型的增强 prompt。
  - `test/agent-service.test.ts` 增加回归测试，覆盖“session 里存的是增强 prompt，但历史接口只返回用户原文”的场景。
  - `docs/playground-current.md` 同步记录历史恢复口径，避免后续把内部协议泄漏误认为正常历史内容。
- 对应入口：
  - [src/agent/file-artifacts.ts](/E:/AII/ugk-pi/src/agent/file-artifacts.ts)
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 历史阅读时不强制滚底
- 主题：修复 playground 在最新对话流式更新时无条件自动滚到底部，导致用户上滑查阅历史被打断的问题。
- 影响范围：
  - `src/ui/playground.ts` 新增 transcript 跟随状态，只有用户停留在底部附近时才自动跟随 `text_delta`、loading 和过程日志更新。
  - 用户离开底部阅读历史时显示“回到底部”按钮，点击后强制回到底部并恢复自动跟随。
  - 初次恢复本地 / 服务端历史仍会强制定位到底部，避免打开页面时停在旧消息中段。
  - 补强前端验收口径：改完 `playground` 后不仅要跑测试，还要重启 `ugk-pi` 并确认 `3000/playground` 实际返回了新 HTML / JS 标记，避免拿旧页面误测。
  - `test/server.test.ts` 增加页面断言，固定滚动跟随阈值、按钮入口和事件绑定。
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 全局 agent 会话与断线续订
- 主题：把 playground 从“每个浏览器各自持有本地 conversationId / 本地历史”收口为固定全局 agent 会话 `agent:global`，并修复手机前后台切换导致 `/v1/chat/stream` 断线后页面停止更新的问题。
- 影响范围：
  - `src/ui/playground.ts` 固定使用 `agent:global`，`conversation-id` 只展示全局 ID，不再从浏览器 `localStorage` 读取设备私有会话身份。
  - 新增 `GET /v1/chat/history`，由 `AgentService` 从 pi session messages 还原全局会话历史；新浏览器 / 新设备打开 playground 会先用本地缓存快速渲染，再从后端同步真实 agent 历史。
  - 当前任务运行中如果主 `/v1/chat/stream` 因手机后台、页面恢复或网络短断提前结束，前端会重新查询 `/v1/chat/status`；只要后端仍在 running，就切到 `/v1/chat/events` 继续订阅，不再把这种浏览器生命周期断线显示成任务失败。
  - `visibilitychange`、`pageshow` 和 `online` 会触发运行态 / 历史重查，让页面重新回到真实 agent 状态。
  - `test/server.test.ts` 增加全局会话、history 接口和 stream 断线续订的回归断言。
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [src/types/api.ts](/E:/AII/ugk-pi/src/types/api.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### 本地 artifact 链接避免二次包裹
- 主题：修复 agent 回复里的 `/v1/local-file?path=...` 链接被用户可见文本重写器再次包裹，生成 `path=http://.../v1/local-file?path=...` 后打不开的问题。
- 影响范围：
  - `src/agent/file-artifacts.ts` 在重写 `/app/public/...`、`/app/runtime/...` 和 `file:///app/...` 时，会识别当前匹配是否已经位于 `/v1/local-file` 的 `path` 查询参数里，避免二次重写。
  - `src/routes/files.ts` 对历史上已经生成的双层 `/v1/local-file` URL 做兼容拆包，拆出内层真实 artifact 路径后仍按 `public/`、`runtime/` 白名单校验和服务。
  - `test/file-artifacts.test.ts` 增加“已翻译 local-file URL 不再二次包裹”的回归用例；`test/server.test.ts` 增加“双层 local-file URL 仍能打开”的回归用例。
  - `docs/runtime-assets-conn-feishu.md` 同步记录本地 artifact 链接重写与双层链接兜底口径。
- 对应入口：
  - [src/agent/file-artifacts.ts](/E:/AII/ugk-pi/src/agent/file-artifacts.ts)
  - [src/routes/files.ts](/E:/AII/ugk-pi/src/routes/files.ts)
  - [test/file-artifacts.test.ts](/E:/AII/ugk-pi/test/file-artifacts.test.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

### Playground Markdown 渲染库化
- 主题：把 agent 回复 Markdown 从项目内手写解析器迁到 `marked`，避免表格、分割线等标准 Markdown 继续靠临时正则补洞。
- 影响范围：
  - `package.json` 新增 `marked` 依赖，`src/ui/playground.ts` 的 `renderPlaygroundMarkdown()` 改为使用 `marked` 的 GFM 渲染能力。
  - playground 浏览器端内联 `marked` 的 UMD 版本，避免单文件 HTML 前端在运行时依赖外部 CDN 或 Node import。
  - 仍然覆盖安全边界：原始 HTML 会被转义，链接只允许 `http/https`，并继续加 `target="_blank"` 与 `rel="noreferrer noopener"`。
  - playground 消息内容新增表格样式，表头、单元格、横向滚动和边框层次跟当前深色消息气泡保持一致；表格由外层滚动容器控制最大宽度，窄表按内容宽度展示，不再强制撑满消息气泡。
  - `test/server.test.ts` 增加“段落 + pipe table + `---`”回归断言，固定表格必须输出 `<table>` / `<thead>` / `<tbody>`，分割线必须输出 `<hr>`，并防止分隔行裸露。
  - `docs/playground-current.md` 同步记录当前 Markdown 渲染口径。
- 对应入口：
  - [package.json](/E:/AII/ugk-pi/package.json)
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### 生产运行态外置到 shared 目录
- 主题：把腾讯云服务器上的 `.env`、`.data/chrome-sidecar` 和生产日志从代码目录继续剥离到 `~/ugk-claw-shared/`，让 Git 工作目录和运行态彻底分家。
- 影响范围：
  - `docker-compose.prod.yml` 改为支持通过 `UGK_APP_ENV_FILE`、`UGK_APP_LOG_DIR`、`UGK_NGINX_LOG_DIR`、`UGK_BROWSER_CONFIG_DIR` 从 shared 目录注入生产运行态路径
  - `.env.example` 补齐这些路径变量的默认值，避免后续只会盯着仓库内相对路径发呆
  - `README.md`、`AGENTS.md`、`docs/traceability-map.md`、`docs/tencent-cloud-singapore-deploy.md` 同步更新 shared 目录口径和生产命令
  - 腾讯云服务器已实际完成迁移验证：`healthz` 与 `playground` 均返回 `200`，`ugk-pi` / `nginx` / `chrome-sidecar` 的生产挂载已切到 `~/ugk-claw-shared/`
  - 旧 repo 内遗留的 `logs/` 已归档到 `~/ugk-claw-shared/backups/repo-logs-from-repo-20260420-112034`
- 对应入口：
  - [docker-compose.prod.yml](/E:/AII/ugk-pi/docker-compose.prod.yml)
  - [.env.example](/E:/AII/ugk-pi/.env.example)
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)
  - [docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)

### Chrome sidecar 自举收口
- 主题：修复 `ugk-pi-browser` 容器启动后只有 GUI 壳子、却不会自动拉起带 `--remote-debugging-port=9222` 的 Chrome 进程，导致 direct CDP 默认链路空转的问题。
- 影响范围：
  - 新增 `scripts/ensure-sidecar-chrome.sh`，让浏览器容器在 healthcheck 中自检并按需拉起 Chrome CDP
  - `docker-compose.yml` 与 `docker-compose.prod.yml` 把该脚本挂进 `ugk-pi-browser`，并要求 `ugk-pi-browser-cdp`、`ugk-pi` 等到浏览器健康后再继续启动
  - `test/containerization.test.ts` 增加对 sidecar 自举脚本、挂载路径和 `service_healthy` 依赖条件的回归断言
- 对应入口：
  - [scripts/ensure-sidecar-chrome.sh](/E:/AII/ugk-pi/scripts/ensure-sidecar-chrome.sh)
  - [docker-compose.yml](/E:/AII/ugk-pi/docker-compose.yml)
  - [docker-compose.prod.yml](/E:/AII/ugk-pi/docker-compose.prod.yml)
  - [test/containerization.test.ts](/E:/AII/ugk-pi/test/containerization.test.ts)

### 服务器运维速查页
- 主题：把腾讯云新加坡服务器最常用的更新、验收、日志、SSH tunnel、运行态位置与回滚命令压成一页速查，避免每次都在长 runbook 里考古。
- 影响范围：
  - 新增 `docs/server-ops-quick-reference.md`，只保留高频操作，不重复铺陈历史背景
  - `README.md`、`AGENTS.md`、`docs/traceability-map.md`、`docs/tencent-cloud-singapore-deploy.md` 同步挂出速查页入口，形成“速查页 -> 长 runbook”的文档梯度
- 对应入口：
  - [docs/server-ops-quick-reference.md](/E:/AII/ugk-pi/docs/server-ops-quick-reference.md)
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)
  - [docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)

### Sidecar GUI 与 CDP 统一 profile
- 主题：修复 sidecar GUI 手点打开的浏览器仍走默认 desktop launcher，导致它和 agent/CDP 控制的 Chrome 分别落到不同 profile、看起来像“登录态全没了”的问题。
- 影响范围：
  - `scripts/ensure-sidecar-chrome.sh` 现在会在容器内生成 `ugk-sidecar-chrome` launcher，并把 `google-chrome.desktop` 与 `com.google.Chrome.desktop` 的 `Exec=` 改写到同一个 `chrome-profile-sidecar`
  - GUI 手点浏览器与 direct CDP 启动的 Chrome 现在共用 `WEB_ACCESS_BROWSER_PROFILE_DIR=/config/chrome-profile-sidecar`
  - `test/containerization.test.ts` 增加对 launcher 名称、desktop patch 和统一 `--user-data-dir` 的回归断言
- 对应入口：
  - [scripts/ensure-sidecar-chrome.sh](/E:/AII/ugk-pi/scripts/ensure-sidecar-chrome.sh)
  - [test/containerization.test.ts](/E:/AII/ugk-pi/test/containerization.test.ts)

### Sidecar 登录态持久化口径补强
- 主题：把“为什么正常更新不该把 sidecar 登录态洗掉”写成明确 runbook，而不是继续靠口头传说维持秩序。
- 影响范围：
  - `AGENTS.md` 明确：生产 sidecar 登录态挂在 `~/ugk-claw-shared/.data/chrome-sidecar`，且 GUI 与 direct CDP 共用同一套 `chrome-profile-sidecar`；更新后如果又像两套登录态，先查 launcher 与浏览器容器版本。
  - `docs/server-ops-quick-reference.md` 新增 sidecar 登录态备份命令，以及更新后针对 `9222`、desktop launcher、`chrome-profile-sidecar` 进程的三段式验收。
  - `docs/tencent-cloud-singapore-deploy.md` 同步补上登录态备份、验收和浏览器栈强制重建口径，避免后续 `/init` 又把“刷新 GUI 看起来没登录”误判成 shared 目录被清空。
  - `docs/traceability-map.md` 在 web-access 场景下补了 sidecar 登录态异常的追溯入口，后续 `/init` 不用再在多份文档里瞎游泳。
- 对应入口：
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [docs/server-ops-quick-reference.md](/E:/AII/ugk-pi/docs/server-ops-quick-reference.md)
  - [docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### 腾讯云服务器迁移到 GitHub 工作目录
- 主题：把腾讯云新加坡服务器的主部署目录从 tar 解包目录迁到 GitHub 工作目录，结束“本地打包 tar -> 服务器解包”作为默认主流程的阶段。
- 影响范围：
  - 服务器当前主部署目录改为 `~/ugk-claw-repo`，`origin` 指向 `https://github.com/mhgd3250905/ugk-claw-personal.git`
  - 生产容器实际 bind source 已切到 `~/ugk-claw-repo`：`runtime/skills-user` 与 `.data/chrome-sidecar`
  - 原 `~/ugk-pi-claw` 与两个历史目录保留为回滚兜底，不再是默认更新入口
  - 服务器实测通过：`/healthz` 返回 `200`、`playground` 返回 `200`、`python3 --version` 正常、`check-deps.mjs` 返回 `host-browser: ok`
  - `README.md`、`AGENTS.md`、`docs/traceability-map.md`、`docs/tencent-cloud-singapore-deploy.md` 同步更新接手和部署口径，避免后续 `/init` 继续按旧 tar 目录理解
- 对应入口：
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)
  - [docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)

### GitHub 主仓库切换与仓库边界收口
- 主题：把代码主仓库切到 GitHub，并先收紧 `.gitignore` 与部署文档口径，避免后续服务器迁移还没开始，主仓库已经被本地运行产物污染。
- 影响范围：
  - `.gitignore` 新增本地调试目录、部署 tar 包、运行时截图 / 调试 HTML、临时输出目录等低争议 ignore 规则，先把明显不该入库的产物挡在 Git 之外
  - `README.md`、`AGENTS.md`、`docs/traceability-map.md` 同步声明 GitHub 已是代码事实源，并明确 `.env`、`.data/`、运行时报告、部署包不属于主仓库
  - `docs/tencent-cloud-singapore-deploy.md` 从“Gitee / tar 为主”调整为“GitHub 为主、tar 为服务器过渡方案”，为后续把服务器迁成 Git 工作目录铺路
- 对应入口：
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)
  - [docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)
  - [.gitignore](/E:/AII/ugk-pi/.gitignore)

### Playground 手机端展示层重写
- 主题：不再继续拿桌面端布局硬压手机，而是在保留现有会话、文件、技能、发送等逻辑的前提下，把手机端展示层整体重写成真正可用的移动聊天页。
- 影响范围：
  - `src/ui/playground.ts` 的手机断点样式整体收口为“顶部紧凑头部 + 四按钮操作条 + 全高 transcript + 底部 composer”三段式，不再让桌面 `landing` hero 占掉首屏空间；手机端 `transcript-pane` 额外去掉边框并收成全透明
  - 手机端当前可见界面的圆角统一压到 `4px`，不再混用 `12px / 14px / 16px`
  - 手机端底部发送区的 `send` / `interrupt` 控制改成纯 icon：发送使用居中的向上箭头 icon，打断使用白色方形中断 icon，不再显示“发 / 停”文字，同时彻底切断桌面端按钮背景、边框、阴影和默认外观在手机端的继承；当前两个 icon 调整为 `28px`，避免把按钮本体撑大；`interrupt` 在禁用态仍保留占位，只做变淡处理，不再直接隐藏
  - 手机端直接隐藏 `landing-screen` 与拖拽上传壳子，已选文件 / 资产改成横向滚动 strip，把有限高度还给对话内容
  - 手机端 `composer`、发送 / 打断按钮、消息气泡、字号、留白全部按触屏阅读与单手点击重新收口；桌面端现有布局不改
  - 手机端额外收紧富文本代码块：让外层 `.code-block` 退成透明壳子，代码区域本身取消叠加半透明背景，只保留排版层次；工具条不再整条展示，只保留右上角透明背景的纯图标复制按钮，不显示文字 label；助手消息里的 `code` 背景也强制透明，并让长代码行在块内换行，避免把消息气泡横向撑爆
  - `docs/playground-current.md` 更新为新的手机端真实口径，明确这次是“移动展示层重写”，不是继续缝补适配
  - `README.md`、`AGENTS.md`、`docs/traceability-map.md` 同步补齐后续 `/init` 接手提醒，明确手机端已经独立收口，不要再按桌面端缩略版理解
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

## 2026-04-19

### Playground 新会话历史保留、代码块渲染与手机端菜单收口
- 主题：把 `playground` 里最影响真实使用的三个交互问题一次收口，并单独给手机 Web 做不污染桌面端的适配。
- 影响范围：
  - `src/ui/playground.ts` 修复 markdown 在“普通文本 + fenced code block”场景下把 `CODEBLOCK0` 占位符漏到页面的问题，保证技能结构这类回复能正常显示代码块
  - 点击“新会话”前，会先把当前页 transcript 归档到滚动区顶部的“历史会话”区块，不再一键把当前可见历史直接清空
  - 发送消息或向运行中会话追加消息后，composer 会立即清空；如果请求在真正进入后端前失败，会把草稿恢复回来，避免用户误以为已发出却又丢内容
  - 手机端新增顶部菜单，接管 `新会话 / 查看技能 / 选择文件 / 项目文件库` 四个操作；桌面端原有侧边操作保持不动
  - `test/server.test.ts` 增加回归断言，覆盖代码块渲染、新会话归档、立即清空输入框以及手机端菜单入口
  - `docs/playground-current.md` 同步补齐当前口径，避免后续再按旧版“点新会话就清空页面历史”来理解
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 手机端从折叠菜单改回常驻四按钮条
- 主题：撤掉手机端顶部菜单方案，改成更直接的四按钮常驻操作条，把空间还给对话区。
- 影响范围：
  - `src/ui/playground.ts` 删除手机端 `menu button + panel` 逻辑，改成顶部常驻 `新会话 / 技能 / 文件 / 文件库` 四按钮条
  - 手机端布局重新收口为“顶部快捷操作 / 中间 transcript / 底部 composer”，不再为了展开菜单额外占用交互成本
  - `test/server.test.ts` 更新断言，明确手机端是 action strip，不是折叠菜单
  - `docs/playground-current.md` 更新当前手机端真实口径
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### 云服务器更新方式确认规则
- 主题：把“服务器更新前必须先确认增量更新还是整目录替换”上升到项目最高规则和部署 runbook，避免后续 agent 默认整目录替换把服务器本地状态一起覆盖。
- 影响范围：
  - `AGENTS.md` 的最高准则新增部署确认规则：云服务器更新前必须先问清是增量更新还是整目录替换，默认倾向增量更新。
  - `docs/tencent-cloud-singapore-deploy.md` 的更新部署流程前置这条硬规则，明确在未获确认前不要默认执行整目录替换。
  - 这条规则的直接目标是保护服务器上的 `runtime/skills-user/`、`runtime/agents-user/`、`.data/` 以及其他不在仓库里的本地状态。
- 对应入口：
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)

### `/init` 接手入口补强
- 主题：把后续 agent `/init` 最容易踩的云端接手前提前置到主入口文档，避免每次重新考古“服务器是不是 Git 仓库”和“什么时候该 build 镜像”。
- 影响范围：
  - `AGENTS.md` 的快速接手场景前置 `docs/web-access-browser-bridge.md` 与 `docs/tencent-cloud-singapore-deploy.md`，并明确云端入口、tar 解包目录属性和运行环境变更必须 `up --build -d`。
  - `README.md` 的快速开始补充“什么时候只 `restart`、什么时候必须 `up --build -d`”的判断口径，减少后续把环境层变更误当成普通热重启。
  - `docs/traceability-map.md` 的快速接手场景追加云端目录不是 Git 仓库的提醒，防止 `/init` 之后又在服务器里直接跑 `git archive` / `git pull`。
- 对应入口：
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### 云服务器更新部署流程补强
- 主题：把本次 `python3` 环境修复上线后的真实云端更新操作补进部署 runbook，明确本机打包、服务器替换、必须重建镜像和验证顺序。
- 影响范围：
  - `docs/tencent-cloud-singapore-deploy.md` 的“后续更新部署流程”补充说明：服务器 `~/ugk-pi-claw` 是 tar 解包目录，不是 Git 仓库，不能在服务器里执行 `git archive` / `git pull`。
  - 明确运行环境变更必须执行 `docker compose -f docker-compose.prod.yml up --build -d`，只 `restart` 不会让旧镜像获得新依赖。
  - 记录本次云端实测结果：`ugk-pi` healthy、`python3 --version -> Python 3.11.2`、`/healthz -> HTTP/1.1 200 OK`、`check-deps.mjs -> host-browser ok + proxy ready`。
  - 固化后续更新验收口径：容器健康、健康检查、运行环境命令、以及 web-access sidecar readiness 必须按变更范围逐项验证。
- 对应入口：
  - [docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)

### 容器 Python3 运行环境补齐
- 主题：修复容器内缺少 `python3`，以及 sidecar Chrome 重启 helper 依赖浏览器容器 Python 导致 `python is required to clear Chrome restore state` 的问题。
- 影响范围：
  - `Dockerfile` 的基础工具安装列表新增 `python3`，让 app / agent 容器可以直接运行用户技能里的 Python 脚本。
  - `scripts/sidecar-chrome.mjs` 不再进入 `ugk-pi-browser` 容器查找 `python3` / `python`；改为由 Node helper 读取并写回 Chrome profile JSON，避免第三方 Chrome sidecar 镜像缺 Python 时重启失败。
  - `test/containerization.test.ts` 增加回归断言，固定 app 镜像必须包含 `python3`，并防止 sidecar helper 再次依赖浏览器容器内 Python。
  - `AGENTS.md`、`README.md`、`docs/web-access-browser-bridge.md`、`docs/tencent-cloud-singapore-deploy.md` 同步更新运行口径和线上验证命令。
- 对应入口：
  - [Dockerfile](/E:/AII/ugk-pi/Dockerfile)
  - [scripts/sidecar-chrome.mjs](/E:/AII/ugk-pi/scripts/sidecar-chrome.mjs)
  - [test/containerization.test.ts](/E:/AII/ugk-pi/test/containerization.test.ts)
  - [docs/web-access-browser-bridge.md](/E:/AII/ugk-pi/docs/web-access-browser-bridge.md)
  - [docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)

### 腾讯云新加坡部署 Runbook 落地
- 主题：把本次腾讯云新加坡 CVM 从选型、初始化、Docker 安装、代码传输、`.env`、生产 compose 启动、Chrome sidecar 登录、线上故障修复到后续更新发布的全过程沉淀为可追溯部署文档。
- 影响范围：
  - 新增 `docs/tencent-cloud-singapore-deploy.md`，记录当前云端实例 `43.156.19.100`、`4 核 8G`、`5Mbps`、Ubuntu `24.04.4 LTS`、`docker-compose.prod.yml`、公网 `3000`、SSH tunnel 访问 sidecar GUI 等事实。
  - `AGENTS.md` 增加云端部署 runbook 线索，明确后续接手时不要开放公网 `3901`，域名或 HTTPS 变更必须同步服务器 `.env` 与部署文档。
  - `README.md` 的文档导航补充部署 runbook 入口，避免只有 agent 接手文档知道这件事，普通入口却找不到。
  - `docs/traceability-map.md` 在快速接手和容器部署场景中加入部署 runbook，后续排查云端更新、回滚、SSH tunnel 时可以直接定位。
  - 文档记录本次 Gitee 新加坡访问慢、zip 半截下载、`crypto.randomUUID()` 在公网 HTTP 下不可用等真实踩坑，以及推荐的本地 `git archive` 打包上传更新流程。
- 对应入口：
  - [docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### Playground HTTP 部署 ID 生成兼容
- 主题：修复公网 `http://IP:3000/playground` 下浏览器缺少 `crypto.randomUUID()` 导致页面初始化失败、无法发送消息的问题。
- 影响范围：
  - `src/ui/playground.ts` 新增 `createBrowserId()` / `createConversationId()`，优先使用 `crypto.randomUUID()`，再退回 `crypto.getRandomValues()`，最后退回时间戳加随机数。
  - 替换 playground 内会话 ID、历史消息 ID、文件展示 ID 的裸 `crypto.randomUUID()` 调用，避免非 HTTPS 部署直接炸前端。
  - `test/server.test.ts` 增加回归断言，防止后续又直接依赖 secure-context-only API。
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)

### 阶段版本文档收口
- 主题：把 Docker Chrome sidecar 阶段成果补进 `/init` 最容易读取的入口文档，避免新会话继续从旧宿主 IPC 口径出发。
- 影响范围：
  - `README.md` 新增阶段快照，明确 `web-access` 主链路已经切到 `direct_cdp -> Docker Chrome sidecar`。
  - `AGENTS.md` 新增当前阶段快照，固定 sidecar GUI、登录态目录、URL 变量分工和标准验证命令。
  - `docs/traceability-map.md` 的快速接手场景前置 `docs/web-access-browser-bridge.md`，并强调 `requestHostBrowser()` 是历史命名。
  - 清理 README 中残留的“web-access 宿主浏览器桥接”说法，避免后续 `/init` 又把默认路径理解成 Windows IPC。
- 对应入口：
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)
  - [docs/web-access-browser-bridge.md](/E:/AII/ugk-pi/docs/web-access-browser-bridge.md)

### Docker Chrome sidecar Restore Pages 清理
- 主题：修复 sidecar Chrome 非正常退出后左上角反复出现 `Restore Pages?` 气泡，遮挡手动登录和页面操作的问题。
- 影响范围：
  - `scripts/sidecar-chrome.mjs` 的 `start` / `restart` 流程现在会在启动前清理 `Singleton*` 锁文件，并把 Chrome profile 中的 `exited_cleanly` / `exit_type` 写回正常退出状态。
  - sidecar Chrome 启动参数增加 `--hide-crash-restore-bubble`，避免残留崩溃恢复气泡继续挡住 GUI。
  - `README.md`、`docs/web-access-browser-bridge.md`、`runtime/skills-user/web-access/SKILL.md` 同步说明：遇到该弹窗时使用 `npm run docker:chrome:restart`，不会清理登录 cookies。
  - `docker-compose.yml` 和 `docker-compose.prod.yml` 固定 `SELKIES_USE_BROWSER_CURSORS=true`，让手动 GUI 操作用浏览器本地光标，避免远程桌面 cursor theme 变成问号。
  - sidecar Chrome 统一通过 `DISPLAY=:0` 和 `--ozone-platform=x11` 启动，避免 Chrome 菜单、权限气泡、账号弹窗等顶层 UI 落到 Wayland popup surface 后无法点击。
  - `test/containerization.test.ts` 增加回归断言，防止 helper 后续移除 Restore Pages 清理逻辑。
- 对应入口：
  - [scripts/sidecar-chrome.mjs](/E:/AII/ugk-pi/scripts/sidecar-chrome.mjs)
  - [docker-compose.yml](/E:/AII/ugk-pi/docker-compose.yml)
  - [docker-compose.prod.yml](/E:/AII/ugk-pi/docker-compose.prod.yml)
  - [test/containerization.test.ts](/E:/AII/ugk-pi/test/containerization.test.ts)
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [docs/web-access-browser-bridge.md](/E:/AII/ugk-pi/docs/web-access-browser-bridge.md)
  - [runtime/skills-user/web-access/SKILL.md](/E:/AII/ugk-pi/runtime/skills-user/web-access/SKILL.md)

### Agent Web-Access Sidecar Operationalization

- 主题：把已经验证可用的 `web-access -> direct_cdp -> Docker Chrome sidecar` 链路收口成正式运行口径，而不是继续靠手工临场命令。
- 影响范围：
  - `package.json` 新增 `npm run docker:chrome:check`、`npm run docker:chrome:status`、`npm run docker:chrome:open`。
  - `scripts/sidecar-chrome.mjs` 支持 `check`、`status`、`open`，其中 `check` 会验证 Chrome CDP、app 到 sidecar CDP、以及 `check-deps.mjs` 代理 readiness。
  - `open` 只打印 GUI URL，不擅自启动宿主 GUI app；Linux 云服务器上应通过 SSH tunnel 或受保护反向代理访问。
  - `README.md`、`docs/web-access-browser-bridge.md`、`runtime/skills-user/web-access/SKILL.md` 同步写明 Docker 场景优先走 sidecar direct_cdp。
  - `test/containerization.test.ts` 增加脚本入口与 helper action 断言，防止后续回退成“能手动跑一次，但没有标准检查入口”的半成品。
- 对应入口：
  - [scripts/sidecar-chrome.mjs](/E:/AII/ugk-pi/scripts/sidecar-chrome.mjs)
  - [package.json](/E:/AII/ugk-pi/package.json)
  - [runtime/skills-user/web-access/SKILL.md](/E:/AII/ugk-pi/runtime/skills-user/web-access/SKILL.md)
  - [docs/web-access-browser-bridge.md](/E:/AII/ugk-pi/docs/web-access-browser-bridge.md)
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [test/containerization.test.ts](/E:/AII/ugk-pi/test/containerization.test.ts)

### Web-Access Legacy IPC Cleanup And Documentation Pass

- 主题：对 sidecar 接入后的 `web-access` 技能、旧宿主 IPC 残留和文档口径做一次系统性收口，避免 agent 后续又被旧说明带回 Windows IPC。
- 影响范围：
  - `runtime/skills-user/web-access/SKILL.md` 重写为 sidecar-first 运行说明，明确 `Docker Chrome sidecar` 是 primary path，`Windows host IPC` 只是 legacy fallback。
  - `runtime/skills-user/x-search-latest/SKILL.md`、`ins-search-latest`、`linkedin-search-latest`、`tiktok-search-latest` 同步说明 `check-deps.mjs` 的 `host-browser: ok` 在 sidecar 模式下代表 direct CDP backend 可用，不再引导 Docker 用户启动 Windows IPC。
  - `runtime/skills-user/web-access/scripts/x-search-runner.mjs` 与 `linkedin-search-runner.mjs` 移除未使用的 IPC 常量，减少误导性旧代码痕迹。
  - `docs/web-access-browser-bridge.md` 重写为正式运行手册，覆盖主链路、legacy fallback、URL 视角、local artifact、登录态、截图流、云服务器安全暴露和排障顺序。
  - `AGENTS.md`、`README.md`、`docs/runtime-assets-conn-feishu.md`、`docs/traceability-map.md` 同步更新当前稳定事实。
  - `test/web-access-host-bridge.test.ts` 和 `test/x-search-latest-skill.test.ts` 增加回归断言，防止 direct CDP 模式再次先碰 IPC，或技能文档再次把 Docker 用户引向旧 IPC bridge。
- 对应入口：
  - [runtime/skills-user/web-access/SKILL.md](/E:/AII/ugk-pi/runtime/skills-user/web-access/SKILL.md)
  - [docs/web-access-browser-bridge.md](/E:/AII/ugk-pi/docs/web-access-browser-bridge.md)
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [test/web-access-host-bridge.test.ts](/E:/AII/ugk-pi/test/web-access-host-bridge.test.ts)
  - [test/x-search-latest-skill.test.ts](/E:/AII/ugk-pi/test/x-search-latest-skill.test.ts)

### Sidecar Local Artifact URL Split

- 主题：修复 sidecar Chrome 打开 `http://127.0.0.1:3000/v1/local-file?...` 时打到浏览器容器自身 nginx、返回 404 的问题。
- 影响范围：
  - `runtime/skills-user/web-access/scripts/local-cdp-browser.mjs` 将本地 artifact 解析为浏览器可访问的 `WEB_ACCESS_BROWSER_PUBLIC_BASE_URL`，而不是复用用户可见的 `PUBLIC_BASE_URL`。
  - 对已经生成的宿主可见同源 URL，例如 `http://127.0.0.1:3000/v1/local-file?...`，浏览器自动化会在打开前改写成 sidecar 可访问的 `http://ugk-pi:3000/...`。
  - `runtime/screenshot.mjs` 支持传入 `browserBaseUrl`，截图脚本和 web-access 共用同一套 URL 解析规则。
  - `docker-compose.yml`、`docker-compose.prod.yml`、`.env.example` 新增 `WEB_ACCESS_BROWSER_PUBLIC_BASE_URL=http://ugk-pi:3000`。
  - `README.md`、`docs/web-access-browser-bridge.md`、`runtime/skills-user/web-access/SKILL.md` 同步说明：`PUBLIC_BASE_URL` 给用户，`WEB_ACCESS_BROWSER_PUBLIC_BASE_URL` 给 CDP 控制的 sidecar Chrome。
- 对应入口：
  - [runtime/skills-user/web-access/scripts/local-cdp-browser.mjs](/E:/AII/ugk-pi/runtime/skills-user/web-access/scripts/local-cdp-browser.mjs)
  - [runtime/screenshot.mjs](/E:/AII/ugk-pi/runtime/screenshot.mjs)
  - [docker-compose.yml](/E:/AII/ugk-pi/docker-compose.yml)
  - [docker-compose.prod.yml](/E:/AII/ugk-pi/docker-compose.prod.yml)
  - [.env.example](/E:/AII/ugk-pi/.env.example)
  - [test/local-cdp-browser.test.ts](/E:/AII/ugk-pi/test/local-cdp-browser.test.ts)
  - [test/runtime-screenshot.test.ts](/E:/AII/ugk-pi/test/runtime-screenshot.test.ts)
  - [test/containerization.test.ts](/E:/AII/ugk-pi/test/containerization.test.ts)

### Docker Chrome sidecar 直连模式
- 主题：为 Docker / Linux 场景补一条不依赖 Windows 宿主 IPC 的浏览器路径，让 `web-access` 可以直接连可视化 Chrome sidecar 并复用持久登录态。
- 影响范围：
  - `docker-compose.yml` 与 `docker-compose.prod.yml` 新增 `ugk-pi-browser` 服务，默认提供 `https://127.0.0.1:3901/` 登录入口；同时补一个 `ugk-pi-browser-cdp` relay，把 sidecar 内部回环地址上的 `9222` 暴露给 compose 服务网络，宿主 GUI 端口可通过 `WEB_ACCESS_BROWSER_GUI_PORT` 覆盖
  - `ugk-pi` 容器默认注入 `WEB_ACCESS_BROWSER_PROVIDER=direct_cdp`、`WEB_ACCESS_CDP_HOST=172.31.250.10`、`WEB_ACCESS_CDP_PORT=9223`，避免 Chrome DevTools HTTP 接口拒绝服务名 Host 头
  - `host-bridge.mjs` 新增直连模式，sidecar 场景下不再先写 IPC 请求再等超时
  - `check-deps.mjs`、`README.md`、`docs/web-access-browser-bridge.md`、`runtime/skills-user/web-access/SKILL.md` 同步补齐 sidecar 登录与排障口径
  - 新增回归断言，防止 compose 配置和直连逻辑回退
- 对应入口：
  - [docker-compose.yml](/E:/AII/ugk-pi/docker-compose.yml)
  - [docker-compose.prod.yml](/E:/AII/ugk-pi/docker-compose.prod.yml)
  - [runtime/skills-user/web-access/scripts/host-bridge.mjs](/E:/AII/ugk-pi/runtime/skills-user/web-access/scripts/host-bridge.mjs)
  - [runtime/skills-user/web-access/scripts/check-deps.mjs](/E:/AII/ugk-pi/runtime/skills-user/web-access/scripts/check-deps.mjs)
  - [runtime/skills-user/web-access/SKILL.md](/E:/AII/ugk-pi/runtime/skills-user/web-access/SKILL.md)
  - [docs/web-access-browser-bridge.md](/E:/AII/ugk-pi/docs/web-access-browser-bridge.md)
  - [test/web-access-host-bridge.test.ts](/E:/AII/ugk-pi/test/web-access-host-bridge.test.ts)
  - [test/containerization.test.ts](/E:/AII/ugk-pi/test/containerization.test.ts)

### Docker 开发镜像补齐 Git
- 主题：把容器内缺失 `git` 的环境短板收口到镜像层，避免每次需要查看仓库状态或执行只读 git 命令时都靠宿主机兜底或临时手工安装。
- 影响范围：
  - `Dockerfile` 现在会在构建阶段通过 `apt-get` 正式安装 `git`
  - `README.md` 同步补充当前开发镜像内置 `git`、`curl` 和 `ca-certificates` 的运行口径
  - `AGENTS.md` 的稳定事实改为明确说明镜像已内置 `git`，避免后续接手的人继续把容器缺 git 当成既定事实
  - `test/containerization.test.ts` 的基础镜像断言同步更新为新的安装清单，避免测试继续固化旧口径
- 对应入口：
  - [Dockerfile](/E:/AII/ugk-pi/Dockerfile)
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [test/containerization.test.ts](/E:/AII/ugk-pi/test/containerization.test.ts)

### Web-access 本地报告出口统一
- 主题：修复同一条浏览器链路里仍有脚本偷偷回退到 `file://`，导致“第一次成功、第二次又把容器路径塞给宿主浏览器”的反复故障。
- 影响范围：
  - `runtime/screenshot-mobile.mjs` 改为直接复用 `runtime/screenshot.mjs` 的统一 URL 解析与截图逻辑，不再单独拼接 `file://`
  - `docker-compose.yml` 固定注入 `PUBLIC_BASE_URL=http://127.0.0.1:3000`，让运行时脚本和文档出口使用同一宿主地址
  - `runtime/skills-user/web-access/SKILL.md` 明确规定：凡是给用户打开的本地报告，一律输出 HTTP URL 或 `send_file`，禁止再吐 `file:///app/...`
  - 新增回归断言，防止移动截图脚本和 web-access 技能说明再次回退
- 对应入口：
  - [runtime/screenshot-mobile.mjs](/E:/AII/ugk-pi/runtime/screenshot-mobile.mjs)
  - [runtime/screenshot.mjs](/E:/AII/ugk-pi/runtime/screenshot.mjs)
  - [runtime/skills-user/web-access/SKILL.md](/E:/AII/ugk-pi/runtime/skills-user/web-access/SKILL.md)
  - [docker-compose.yml](/E:/AII/ugk-pi/docker-compose.yml)
  - [test/runtime-screenshot.test.ts](/E:/AII/ugk-pi/test/runtime-screenshot.test.ts)
  - [test/x-search-latest-skill.test.ts](/E:/AII/ugk-pi/test/x-search-latest-skill.test.ts)

### Agent 文件交付提示协议收口
- 主题：把“报告生成后该给什么地址、什么时候该发文件”收口到全局 prompt 协议，避免 agent 继续靠上下文运气输出错误交付方式。
- 影响范围：
  - `buildPromptWithAssetContext()` 追加的 `<file_response_protocol>` 现在明确要求：浏览器预览一律返回宿主可访问的 HTTP URL，禁止返回 `file:///app/...`
  - 对项目内已生成的真实文件，优先要求 agent 使用 `send_file`
  - `ugk-file` 降级为小型文本文件的兜底协议，不再当成默认文件交付方式
  - 新增回归测试，防止后续把这层全局约束删回去
- 对应入口：
  - [src/agent/file-artifacts.ts](/E:/AII/ugk-pi/src/agent/file-artifacts.ts)
  - [test/file-artifacts.test.ts](/E:/AII/ugk-pi/test/file-artifacts.test.ts)

### Runtime 报告 HTTP 发布收口
- 主题：修复 `runtime/` 报告仍被当成 `file:///app/...` 容器路径交给用户打开，导致宿主浏览器报 `ERR_FILE_NOT_FOUND` 的问题。
- 影响范围：
  - 新增 `GET /runtime/:fileName`，专门服务 `runtime/` 根目录下的安全报告文件，和 `public/` 根文件服务分开收口。
  - `runtime/screenshot.mjs` 不再把本地 HTML 报告强行拼成 `file://`，而是自动把 `public/` / `runtime/` 本地路径转换成可访问的本地 HTTP URL。
  - 对外口径同步固定：宿主浏览器不能直接打开容器内 `file:///app/...`；要么给 HTTP URL，要么走 `send_file`。
  - 新增回归断言，覆盖 `runtime/report-medtrum-v2.html` 的 HTTP 访问和截图脚本 URL 解析。
- 对应入口：
  - [src/routes/static.ts](/E:/AII/ugk-pi/src/routes/static.ts)
  - [runtime/screenshot.mjs](/E:/AII/ugk-pi/runtime/screenshot.mjs)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [test/runtime-screenshot.test.ts](/E:/AII/ugk-pi/test/runtime-screenshot.test.ts)
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [README.md](/E:/AII/ugk-pi/README.md)

### 文件卡片预览与下载分流
- 主题：修复截图等文件点击后容易落入“无法访问您的文件”提示的问题，把预览和下载链路拆开处理。
- 影响范围：
  - `/v1/files/:fileId` 新增 `download=1` 强制下载参数；安全可预览文件默认走 `inline`，显式下载才走 `attachment`。
  - playground 文件卡片新增“打开”入口，图片/PDF/纯文本等安全类型可直接新标签预览；“下载”继续保留，但改走强制下载 URL。
  - 预览白名单只覆盖相对安全的静态类型；`html`、`svg`、`js` 等可能执行脚本的内容不做同源直接预览，避免把文件预览改成 XSS 入口。
  - 新增回归断言，覆盖图片默认 inline 和 `?download=1` 强制 attachment 两条行为。
- 对应入口：
  - [src/routes/files.ts](/E:/AII/ugk-pi/src/routes/files.ts)
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)

### Agent `send_file` 文件发送工具
- 主题：新增正式的 agent 发文件通道，避免继续把图片、报告等文件用 base64 或 ````ugk-file```` 原始块塞进聊天正文。
- 影响范围：
  - 新增项目级 `send_file` extension：agent 可把项目根目录内已生成的本地文件注册成统一资产，并返回可下载文件元数据。
  - `send_file` 会校验文件必须位于项目根目录内，拒绝路径穿越和项目外路径；文件名会做安全化处理，MIME 会按常见扩展名推断。
  - `AssetStore` 新增 Buffer 文件保存能力，图片、PDF、压缩包等二进制产物不再需要先转成文本协议。
  - `AgentService` 会从 `tool_execution_end` 的 `send_file` 工具结果中提取 `details.file`，合并进最终 `ChatResult.files` 和流式 `done.files`。
  - playground 不需要新增 UI 分支，继续复用现有文件下载卡片；这才像个文件交付系统，不是把聊天框当垃圾桶。
  - 文档同步记录 `send_file` 的设计、数据流、限制和排查入口。
- 对应入口：
  - [.pi/extensions/send-file.ts](/E:/AII/ugk-pi/.pi/extensions/send-file.ts)
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [src/agent/asset-store.ts](/E:/AII/ugk-pi/src/agent/asset-store.ts)
  - [docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)
  - [test/send-file-extension.test.ts](/E:/AII/ugk-pi/test/send-file-extension.test.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)

### Playground 文件型回复正文收口
- 主题：修复 agent 只返回 `ugk-file` 文件块时，playground 仍把流式阶段收到的 base64 / fenced block 留在助手正文里的问题。
- 影响范围：
  - `done` 事件现在会在 `event.text` 是空字符串时也覆盖当前流式正文，确保后端已经抽离为 `files` 的内容不会继续显示在消息气泡里。
  - 文件型回复仍通过 `files` 渲染为下载卡片；正文为空时只显示文件发送结果，不再泄漏 `ugk-file` 原始协议块。
  - 新增回归断言，防止以后把判断写回 `event.text && ...` 这种会漏掉空字符串的形式。
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)

### Web-access 本地浏览器自动拉起
- 主题：修复宿主浏览器关闭后，IPC 仍返回 `chrome_cdp_unreachable` 导致 web-access 不再尝试拉起 Chrome 的问题
- 影响范围：
  - `requestHostBrowser` 在 IPC 有响应但报告 Chrome/CDP 不可达时，会改走 `LocalCdpBrowser` fallback
  - 默认 IPC 目录从容器不可共享的 `/workspace/ipc` 收口到项目共享的 `.data/browser-ipc`；容器内对应 `/app/.data/browser-ipc`
  - 新增宿主 IPC bridge daemon，负责消费容器写入的 browser IPC request，并在收到请求时用宿主侧指定 Chrome/profile 自动拉起 CDP 浏览器
  - 当共享 IPC 目录中存在 host bridge ready 文件时，`status` 检查会把 IPC 等待时间从 1 秒放宽到 30 秒，避免把“宿主正在自动启动 Chrome”误判成浏览器不可用
  - `LocalCdpBrowser` 既有的 `ensureBrowser -> startBrowser` 逻辑会负责启动带 `--remote-debugging-port` 的托管 Chrome profile；Windows 下不再默认尝试 Edge，除非显式设置 `WEB_ACCESS_ALLOW_EDGE=1`
  - 宿主侧启动脚本 `scripts/start-web-access-browser.ps1` 改为启动 host bridge daemon，并默认使用 `.data/web-access-chrome-profile` 作为持久登录态目录
  - `check-deps.mjs` 遇到容器内 `local_browser_executable_not_found` 或 CDP 启动超时时，会输出可执行的宿主启动命令，不再直接甩一段 Node stack
  - 普通浏览器命令如 `new_target`、`list_targets` 等收到 `chrome_cdp_unreachable` / CDP 超时类错误时，也会重试 local fallback，而不只是在 IPC 完全无响应时 fallback
  - `web-access` 技能说明同步更新：只有 fallback 也失败时才报告浏览器不可用，并且脚本命令改为容器内 `/app/runtime/skills-user/...` 路径
  - `x-search-latest` 技能说明同样改为在容器内直接使用 `/app/runtime/skills-user/...` 脚本路径，避免 `$CLAUDE_SKILL_DIR` 为空时拼出 `/web-access/...` 这类无效路径
  - 新增专题文档记录完整设计、根因、验证命令、常见故障和排障顺序，避免后续继续把 profile、IPC、CDP、X 登录态混成一锅粥
- 对应入口：
  - [docs/web-access-browser-bridge.md](/E:/AII/ugk-pi/docs/web-access-browser-bridge.md)
  - [runtime/skills-user/web-access/scripts/host-bridge.mjs](/E:/AII/ugk-pi/runtime/skills-user/web-access/scripts/host-bridge.mjs)
  - [runtime/skills-user/web-access/scripts/host-browser-bridge-daemon.mjs](/E:/AII/ugk-pi/runtime/skills-user/web-access/scripts/host-browser-bridge-daemon.mjs)
  - [runtime/skills-user/web-access/scripts/check-deps.mjs](/E:/AII/ugk-pi/runtime/skills-user/web-access/scripts/check-deps.mjs)
  - [runtime/skills-user/web-access/scripts/local-cdp-browser.mjs](/E:/AII/ugk-pi/runtime/skills-user/web-access/scripts/local-cdp-browser.mjs)
  - [runtime/skills-user/web-access/SKILL.md](/E:/AII/ugk-pi/runtime/skills-user/web-access/SKILL.md)
  - [runtime/skills-user/x-search-latest/SKILL.md](/E:/AII/ugk-pi/runtime/skills-user/x-search-latest/SKILL.md)
  - [scripts/start-web-access-browser.ps1](/E:/AII/ugk-pi/scripts/start-web-access-browser.ps1)
  - [test/web-access-host-bridge.test.ts](/E:/AII/ugk-pi/test/web-access-host-bridge.test.ts)
  - [test/x-search-latest-skill.test.ts](/E:/AII/ugk-pi/test/x-search-latest-skill.test.ts)

### Public 根静态文件路由正规化
- 主题：把临时硬编码的 X API 报告静态路由收口为安全的 `public/` 根文件服务
- 影响范围：
  - 新增 `GET /:fileName` 静态文件入口，仅服务 `public/` 根目录下的普通文件，不递归目录、不允许隐藏文件或路径穿越
  - `x-api-report-card.html`、`x-api-report.html`、`x-api-report.png`、`x-api-report-full.png` 等报告产物可以通过 HTTP URL 访问，宿主浏览器不需要再尝试容器内 `file://` 路径
  - 静态响应按扩展名设置基础 `content-type`，并使用 `no-store` 避免截图调试时看到旧页面
  - 页面级截图仍应使用 HTTP 地址，例如 `http://127.0.0.1:3000/x-api-report-card.html`；CDP 截图超时属于浏览器自动化链路问题，不应靠 `file:///app/...` 绕路
- 对应入口：
  - [src/routes/static.ts](/E:/AII/ugk-pi/src/routes/static.ts)
  - [src/server.ts](/E:/AII/ugk-pi/src/server.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [docs/change-log.md](/E:/AII/ugk-pi/docs/change-log.md)

### Playground 错误消息样式收口
- 主题：修复网络 / 服务端错误仍生成旧 `message error` 气泡、没有使用 agent 回复样式的问题
- 影响范围：
  - transcript 消息视觉类型收敛为用户气泡和助手气泡两类，`system` / `error` 等非用户语义统一渲染为助手视觉样式，并继续通过 `data-message-kind` 保留真实语义
  - 移除旧 `.message.error` 居中布局和移动端选择器，避免错误消息绕过当前 agent 回复样式
  - `/v1/chat/stream` 请求拒绝和网络异常不再追加 `appendTranscriptMessage("error", ...)`，统一收口到顶部错误横幅与当前助手气泡的过程区
  - 页面回归断言新增对旧错误气泡入口和旧 `.message.error` 样式的反向检查，同时修正一个依赖旧错误样式误命中的 transcript 对齐断言
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)
  - [docs/change-log.md](/E:/AII/ugk-pi/docs/change-log.md)

### Init 接手文档同步运行态重连口径
- 主题：把当前运行态重连能力同步到下次 `/init` 最容易读取的入口文档，避免新会话只看到旧的“流式 / 打断”口径
- 影响范围：
  - `AGENTS.md` 的聊天场景索引新增 `GET /v1/chat/status` 与 `GET /v1/chat/events`，稳定事实补充“当前正在运行”文案和 active run 事件缓冲边界
  - `README.md` 的能力概览、接口速查和验证结果补齐运行态查询、事件重连以及 `76 / 76` 测试口径
  - `docs/traceability-map.md` 增加刷新后 active run 状态映射、事件缓冲和 `/v1/chat/events` 重连追溯点
  - `docs/playground-current.md` 清理旧乱码小节，补成明确的运行态与 loading 约束
- 对应入口：
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)
  - [docs/change-log.md](/E:/AII/ugk-pi/docs/change-log.md)

### Playground 当前运行态事件重连
- 主题：修复刷新后恢复出的当前运行任务只显示旧快照、不会继续更新的问题，并移除“上一轮仍在运行”这类误导文案
- 影响范围：
  - `AgentService` 的 active run 增加内存事件缓冲和 `subscribeRunEvents` 订阅能力，刷新后的 web 观察者可以重新接入同一个真实 agent run
  - 新增 `GET /v1/chat/events` SSE 入口，用于按 `conversationId` 订阅当前正在运行任务的事件回放和后续更新
  - playground 恢复运行态时会继续连接 `/v1/chat/events`，把 `text_delta`、工具事件、完成、打断和错误继续渲染到同一个助手气泡
  - 恢复态文案统一改为“当前任务正在运行 / 当前正在运行 / 当前任务已结束”，不再把真实仍在运行的 agent run 说成“上一轮”
  - 当前缓冲只覆盖同一服务进程内的 active run；跨服务重启的完整回放仍需要持久化 run event log
- 对应入口：
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 刷新断线网络错误过滤
- 主题：修复运行中刷新页面后，历史里出现“网络 / network error”错误气泡的问题
- 影响范围：
  - 页面 `beforeunload` / `pagehide` 会标记当前 web 观察连接正在卸载
  - 卸载期间 `/v1/chat/stream` 断开产生的 `network error` 不再写入 transcript，也不再持久化成会话历史
  - 恢复历史时会过滤旧的“网络 / network error”暂态错误气泡，避免已经写脏的本地历史继续污染界面
  - 真正的运行态仍以 `/v1/chat/status` 映射后端 agent 状态为准，web 刷新不应该自己编造失败结论
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)

### SSE 断线不再杀掉 Agent 运行态
- 主题：修复刷新页面后正在运行的上一轮任务从状态接口消失的问题
- 影响范围：
  - `AgentService` 事件投递改为 best-effort，SSE 客户端断开或事件回调抛错不再中断真实 agent run
  - `/v1/chat/stream` 写入已关闭响应时会安全忽略，避免浏览器刷新把后端运行态误杀
  - 新增回归测试，覆盖事件消费者抛出 `client closed` 时 `streamChat` 仍能完成并持久化会话文件
  - 刷新后 `/v1/chat/status` 才能继续看到同一个 `conversationId` 的 running 状态，前端恢复气泡和过程日志才有真实依据
- 对应入口：
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)

### Playground 运行过程日志刷新恢复
- 主题：让刷新前已经收到的 Agent 过程日志随会话历史恢复，避免运行中刷新后只剩任务摘要和 loading
- 影响范围：
  - 助手消息历史新增 `process` 快照字段，保存思考过程日志、当前动作、状态类型和完成状态
  - 过程日志追加、当前动作变更、过程收口时会同步写入本地会话历史
  - 刷新后如果会话仍在运行，playground 会优先复用最近的助手气泡，并把过程日志卡片恢复为运行态
  - 当前只恢复刷新前浏览器已经收到的过程日志；刷新期间页面断线后新产生的事件仍需要后端事件回放能力，别指望前端通灵
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 刷新运行态与打断反馈收口
- 主题：修复刷新后恢复到“上一轮仍在运行”时缺少上一轮任务正文，以及点击打断后旧 loading 气泡仍显示运行中的问题
- 影响范围：
  - playground 恢复运行中会话时，会从本地历史中提取最近一条用户消息，并写入助手气泡正文，避免只剩一个空的“上一轮仍在运行”
  - `/v1/chat/interrupt` 返回打断成功后，当前助手 loading 气泡会收口为“本轮已中断”，并释放前端 loading 状态
  - 如果打断时后端已无运行任务，前端会将残留 loading 收口为“上一轮已结束”，不再继续误导用户
  - 页面断言同步覆盖恢复态任务摘要与打断后的 loading 收口
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground ?????????????
- ????????????????????????????????? `Conversation ... is already running` ????
- ?????
  - ?? `GET /v1/chat/status`????????????????
  - playground ?????????????????????? loading ????
  - ????????????????????? `/v1/chat/queue`????????? stream
  - ???????????????????????????????
- ?????
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
### Playground ??? loading ????
- ??????????????????? loading ?????????????????????
- ?????
  - ??????????????? loading ?????? `text_delta` ??????
  - loading ????? `run_started`????????????? / ?? / ????????
  - ????????????????????? loading ????
  - ????????? loading ???????????
- ?????
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)
### Playground 深空主题收口
- 主题：将 playground 的整体氛围从偏蓝电子夜景收口为更深的宇宙深空主题
- 影响范围：
  - 全局背景改为近黑深空底色，并加入暗紫星云与冷白星尘层次，页面纵深更明显
  - 主强调色从亮蓝改为偏冷白的星光色，避免操作按钮、高亮边框和装饰线条整体发蓝
  - landing 区域的输入面板、悬浮控制、引用按钮和拖拽态一起同步降蓝，避免背景改深了但组件还在泛蓝
  - 补充页面断言，覆盖新的深空配色与旧蓝色退场
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 会话历史恢复与正文复制
- 主题：为 playground 补上当前会话的本地历史恢复、上滚加载更多、新会话提示气泡，以及消息正文复制按钮
- 影响范围：
  - transcript 现在会按 `conversationId` 持久化最近消息，刷新页面后优先恢复当前会话最近历史，不再每次刷新都变成白板
  - 对话区顶部新增“加载更多历史”兜底入口，同时在滚动到顶部时自动继续加载更早消息
  - 点击“全新的记忆”后，会立即插入一条助手样式气泡，明确提示当前已启用的新会话和对应会话 ID
  - 所有消息气泡底部统一增加“复制正文”按钮，复制范围只包含该条消息正文
  - 同步补齐页面断言，覆盖历史恢复脚本、新会话提示和复制按钮
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 对话区底部动态避让
- 主题：将 `landing` 模式下 transcript 区域的底部留白从固定值改为跟随 `command-deck` 实际高度动态同步
- 影响范围：
  - 解决待发送文件 / 已选资产过多时，`command-deck` 变高并与对话区底部重叠的问题
  - `stream-layout` 的底部避让改为按 `chat-stage` 底部到 `command-deck` 顶部的真实距离计算，避免遗漏 padding / margin 带来的视觉重叠
  - `landing` 模式下 transcript 容器高度被约束在可用空间内，内容过多时应转为滚动而不是继续压到 `command-deck` 上
  - 页面缩放、文件增删、资产增删后，对话区底部避让会一起更新
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 控制类错误提示收口

- 主题：将 `not_running`、`abort_not_supported` 等运行态控制错误统一收口到顶部横幅提示
- 影响范围：
  - `/v1/chat/queue` 与 `/v1/chat/interrupt` 的拒绝信息不再写进底部过程流，避免和对话气泡重叠
  - 错误横幅改为顶部悬浮通知层，不再作为主内容流中的普通块级元素跟随 landing 会话布局下沉到底部
  - 错误横幅视觉收口为无边框 `4px` 圆角通知条，并新增右侧关闭按钮
  - 修正错误横幅默认显隐逻辑，避免刷新页面后空的横幅壳子常驻顶部
  - 错误横幅默认增加 `hidden` 语义开关，不再只依赖 CSS 显隐，降低旧样式或缓存导致空壳可见的风险
  - 增加 `.error-banner[hidden] { display: none !important; }` 兜底规则，防止显隐逻辑再次被普通样式覆盖
  - 运行态 reason 码转为可读文案，减少原始错误码直接暴露
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 用户消息可读性修正

- 主题：保留用户消息气泡靠右，但将正文文本恢复为标准左对齐
- 影响范围：
  - 修正 playground 中用户长文本消息全部右对齐导致的阅读负担
  - 同步更新页面断言与当前 UI 文档口径，避免后续把错误表现继续当成设计
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### 文档系统重构

- 主题：压缩 `AGENTS.md`，建立渐进式披露文档结构
- 影响范围：
  - `AGENTS.md` 只保留最高准则、全局规则、固定运行口径和场景索引
  - 新增追溯与专题文档承接细节
- 对应入口：
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)
  - [docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

### README 收敛

- 主题：README 改为入口说明文档，移除重复和过时描述
- 影响范围：
  - 保留项目定位、运行方式、接口速查、文档导航
  - 移除冗长历史碎片和重复说明
- 对应入口：
  - [README.md](/E:/AII/ugk-pi/README.md)

### 文档同步纪律固化

- 主题：将“改动后必须同步文档并留痕”提升为全局规则
- 影响范围：
  - 后续 agent 在实现行为变更、运行口径变更、接口变更、文档结构变更后，必须同步更新文档并写入本文件
- 对应入口：
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [docs/change-log.md](/E:/AII/ugk-pi/docs/change-log.md)
# 2026-04-19 Addendum

## Local Artifact Bridge And Download Header Fix

- 主题：把“内部 file 路径可用、外部浏览器自动桥接”做成运行时能力，而不是继续靠提示词限制 agent；同时修复中文文件名触发 `content-disposition` 非法头，导致打开/下载 0B 的硬 bug。
- 影响范围：
  - `runtime/skills-user/web-access/scripts/local-cdp-browser.mjs` 现在会把 `/app/...`、`file:///app/...`、`public/...`、`runtime/...` 这类本地 artifact 输入自动桥接到 `GET /v1/local-file?path=...`
  - `runtime/screenshot.mjs` 复用同一套本地 artifact URL 解析，不再单独维护一份路径转换逻辑
  - `src/routes/files.ts` 新增 `GET /v1/local-file`，统一服务 `public/` / `runtime/` 本地 artifact 的浏览器打开场景
  - `src/routes/files.ts` 的 `content-disposition` 改为 `filename` + `filename*` 双写法，中文文件名下载恢复正常
  - `src/agent/file-artifacts.ts` 与 `runtime/skills-user/web-access/SKILL.md` 更新为：内部允许 file 路径，用户交付再走 HTTP URL 或 `send_file`
- 对应入口：
  - [runtime/skills-user/web-access/scripts/local-cdp-browser.mjs](/E:/AII/ugk-pi/runtime/skills-user/web-access/scripts/local-cdp-browser.mjs)
  - [runtime/screenshot.mjs](/E:/AII/ugk-pi/runtime/screenshot.mjs)
  - [src/routes/files.ts](/E:/AII/ugk-pi/src/routes/files.ts)
  - [src/agent/file-artifacts.ts](/E:/AII/ugk-pi/src/agent/file-artifacts.ts)
  - [runtime/skills-user/web-access/SKILL.md](/E:/AII/ugk-pi/runtime/skills-user/web-access/SKILL.md)
  - [test/local-cdp-browser.test.ts](/E:/AII/ugk-pi/test/local-cdp-browser.test.ts)
  - [test/runtime-screenshot.test.ts](/E:/AII/ugk-pi/test/runtime-screenshot.test.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [test/file-artifacts.test.ts](/E:/AII/ugk-pi/test/file-artifacts.test.ts)
  - [test/x-search-latest-skill.test.ts](/E:/AII/ugk-pi/test/x-search-latest-skill.test.ts)

## Assistant Text Local Artifact Rewrite

- 主题：把“内部本地 file 路径可以继续用”和“用户可见文本不能把宿主浏览器带进沟里”彻底拆开；运行时现在负责重写用户可见消息里的容器本地 artifact 路径。
- 影响范围：
  - `src/agent/file-artifacts.ts` 新增用户可见文本重写逻辑，会把 `/app/public/...`、`/app/runtime/...`、`file:///app/...` 改写为 `GET /v1/local-file?path=...`
  - `src/agent/agent-service.ts` 在最终正文、流式 `text_delta`、以及工具过程输出里统一应用这层重写，不再依赖 agent 自己记住什么地址能给宿主打开
  - 保持内部工具链不变：浏览器自动化和本地 artifact 处理仍然可以继续使用原始 `/app/...` / `file:///app/...`
- 对应入口：
  - [src/agent/file-artifacts.ts](/E:/AII/ugk-pi/src/agent/file-artifacts.ts)
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [test/file-artifacts.test.ts](/E:/AII/ugk-pi/test/file-artifacts.test.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)
## 2026-04-19 Documentation Consolidation

### 文档口径整理：本地文件桥接与用户交付

- 主题：把最近围绕本地 artifact、`send_file`、`/v1/local-file`、web-access 浏览器桥接的口径重新收成主文档，清理 README 和专题文档里残留的旧说法。
- 影响范围：
  - `README.md` 重写为当前稳定入口文档，明确区分“agent 内部允许 file 路径”和“用户可见地址必须可打开”
  - `docs/traceability-map.md` 重写为按场景追溯入口，补齐文件交付、`/v1/local-file`、web-access 与截图链路
  - `docs/runtime-assets-conn-feishu.md` 重写资产/附件/`send_file`/本地 artifact 桥接口径
  - `docs/web-access-browser-bridge.md` 重写浏览器桥接、专用 profile、本地文件桥接与排障顺序
  - `docs/change-log.md` 追加本条记录，避免后续 `/init` 还被旧口径误导
- 对应入口：
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)
  - [docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)
  - [docs/web-access-browser-bridge.md](/E:/AII/ugk-pi/docs/web-access-browser-bridge.md)
  - [docs/change-log.md](/E:/AII/ugk-pi/docs/change-log.md)

## 2026-04-19 Sidecar Profile Consolidation

- 主题：把 Docker Chrome sidecar 的 profile 路径收口成唯一配置，避免人工登录和自动启动分别落到不同目录，搞出一次能登、重启失忆的假稳定。
- 影响范围：
  - `docker-compose.yml` 与 `docker-compose.prod.yml` 统一使用 `WEB_ACCESS_BROWSER_PROFILE_DIR`
  - 默认 sidecar profile 路径固定为 `${WEB_ACCESS_BROWSER_PROFILE_DIR:-/config/chrome-profile-sidecar}`
  - `.env.example`、`README.md`、`docs/web-access-browser-bridge.md`、`runtime/skills-user/web-access/SKILL.md` 同步说明 sidecar 只应保留一份正式持久 profile
  - `test/containerization.test.ts` 增加对 profile 配置键的断言，防止后续回退到多路径
- 对应入口：
  - [docker-compose.yml](/E:/AII/ugk-pi/docker-compose.yml)
  - [docker-compose.prod.yml](/E:/AII/ugk-pi/docker-compose.prod.yml)
  - [.env.example](/E:/AII/ugk-pi/.env.example)
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [docs/web-access-browser-bridge.md](/E:/AII/ugk-pi/docs/web-access-browser-bridge.md)
  - [runtime/skills-user/web-access/SKILL.md](/E:/AII/ugk-pi/runtime/skills-user/web-access/SKILL.md)
  - [test/containerization.test.ts](/E:/AII/ugk-pi/test/containerization.test.ts)

## 2026-04-19 Sidecar Chrome Start And Restart Helper

- 主题：补一个明确的 sidecar Chrome 启动/重启入口，别再靠现场手搓 `docker compose exec` 长命令救火。
- 影响范围：
  - 新增 `scripts/sidecar-chrome.mjs`，统一负责清理残留锁、用正确 Wayland 环境拉起 Chrome、重启 relay，并验证 app 到 sidecar 的 CDP 链路
  - `package.json` 新增 `npm run docker:chrome:start` 与 `npm run docker:chrome:restart`
  - `check-deps.mjs` 在 direct sidecar 模式失败时会直接提示使用新命令
  - `README.md`、`docs/web-access-browser-bridge.md`、`runtime/skills-user/web-access/SKILL.md` 同步记录新入口
- 对应入口：
  - [scripts/sidecar-chrome.mjs](/E:/AII/ugk-pi/scripts/sidecar-chrome.mjs)
  - [package.json](/E:/AII/ugk-pi/package.json)
  - [runtime/skills-user/web-access/scripts/check-deps.mjs](/E:/AII/ugk-pi/runtime/skills-user/web-access/scripts/check-deps.mjs)
  - [README.md](/E:/AII/ugk-pi/README.md)
  - [docs/web-access-browser-bridge.md](/E:/AII/ugk-pi/docs/web-access-browser-bridge.md)
  - [runtime/skills-user/web-access/SKILL.md](/E:/AII/ugk-pi/runtime/skills-user/web-access/SKILL.md)
## 2026-04-20 Playground Context Usage Indicator

- 主题：为 `playground` 增加位于对话区和输入框之间、右侧对齐的小圆环上下文提示，并把当前会话的上下文估算结果暴露到 `GET /v1/chat/status`
- 影响范围：
  - `src/agent/context-usage.ts` 新增会话上下文估算逻辑，优先复用最近一次 assistant `usage`，并补上 trailing messages / 输入附件 / 资产的粗估 token
  - `src/agent/agent-session-factory.ts` 暴露项目默认 provider / model / context window / reserve budget，避免前端凭空脑补上下文上限
  - `src/agent/agent-service.ts` 的 `getRunStatus` 现在会返回 `contextUsage`，即使当前没有 active run，也会基于已存 session 估算会话占用
  - `src/types/api.ts`、`src/routes/chat.ts` 同步把 `ChatStatusResponseBody` 收口为 `conversationId + running + contextUsage`
  - `src/ui/playground.ts` 在对话区和输入框之间新增独立的小圆环进度提示，圆环只显示百分比，风险色跟随 `safe / caution / warning / danger`
  - 桌面 Web 和手机端都使用同一位置规则：在输入框外部、右侧与输入区域对齐
  - 桌面端 hover / focus 展示详情浮层，手机端点击圆环打开底部详情弹窗
  - `playground` 前端会把本地草稿、待发附件、已选资产叠加到后端基线，占用文案明确标成估算，不再装成 provider 精确统计
- 对应入口：
  - [src/agent/context-usage.ts](/E:/AII/ugk-pi/src/agent/context-usage.ts)
  - [src/agent/agent-session-factory.ts](/E:/AII/ugk-pi/src/agent/agent-session-factory.ts)
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)
  - [src/types/api.ts](/E:/AII/ugk-pi/src/types/api.ts)
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/agent-session-factory.test.ts](/E:/AII/ugk-pi/test/agent-session-factory.test.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Conn 实时广播与 Playground 在线提示
- 主题：把后台 conn 结果从“只能靠刷新或查库发现”收口为“先持久化，再向在线页面实时广播”，补齐前后台之间的在线提醒层。
- 影响范围：
  - `src/routes/notifications.ts` 新增 `GET /v1/notifications/stream` SSE 订阅入口，以及 `POST /v1/internal/notifications/broadcast` 内部广播入口。
  - `src/agent/notification-hub.ts` 新增前台 server 进程内的轻量广播中心，用来把 worker 发来的 notification 扇出给所有在线页面。
  - `src/workers/conn-worker.ts` 在写入 `conversation_notifications` 之后，会 best-effort 调用内部广播接口；广播失败只记 warning，不影响 run 最终状态。
  - `src/ui/playground.ts` 新增实时 SSE 订阅、右上角轻提示、断线重连，以及“当前会话收到广播后静默刷新历史与 run 状态”的前端逻辑。
  - `docker-compose.yml` 与 `docker-compose.prod.yml` 给 `ugk-pi-conn-worker` 显式注入 `NOTIFICATION_BROADCAST_URL=http://ugk-pi:3000/v1/internal/notifications/broadcast`，避免容器内 `127.0.0.1` 指回 worker 自己。
  - `test/server.test.ts`、`test/conn-worker.test.ts`、`test/notification-hub.test.ts`、`test/containerization.test.ts` 补齐回归断言，锁住广播接口、worker 广播行为、前台订阅脚本和 compose 环境变量。
- 对应入口：
  - [src/routes/notifications.ts](/E:/AII/ugk-pi/src/routes/notifications.ts)
  - [src/agent/notification-hub.ts](/E:/AII/ugk-pi/src/agent/notification-hub.ts)
  - [src/workers/conn-worker.ts](/E:/AII/ugk-pi/src/workers/conn-worker.ts)
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [docker-compose.yml](/E:/AII/ugk-pi/docker-compose.yml)
  - [docker-compose.prod.yml](/E:/AII/ugk-pi/docker-compose.prod.yml)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [test/conn-worker.test.ts](/E:/AII/ugk-pi/test/conn-worker.test.ts)
  - [test/notification-hub.test.ts](/E:/AII/ugk-pi/test/notification-hub.test.ts)
  - [test/containerization.test.ts](/E:/AII/ugk-pi/test/containerization.test.ts)
### Playground 实时广播提示层级修复
- 日期：2026-04-21
- 主题：修复 `/playground` 右上角实时广播 toast 被固定层遮挡的问题。
- 影响范围：将 `src/ui/playground.ts` 中 `.notification-live-region` 的层级提升到所有现有 fixed overlay 之上，确保 SSE 已送达且 toast 已插入 DOM 时用户能实际看见提示。
- 对应入口：`src/ui/playground.ts`、`docs/playground-current.md`

### Conn Worker 真并发收口
- 日期：2026-04-21
- 主题：把 `ConnWorker` 的 `maxConcurrency` 从串行假并发修成真正的单进程内并发执行，并给 compose 默认注入 3 路并发。
- 影响范围：`src/workers/conn-worker.ts` 现在会先 claim 多条 due run 再并行执行；`docker-compose.yml`、`docker-compose.prod.yml` 与 `.env.example` 新增 `CONN_WORKER_MAX_CONCURRENCY` 口径；`test/conn-worker.test.ts`、`test/containerization.test.ts` 补齐回归。
- 对应入口：`src/workers/conn-worker.ts`、`docker-compose.yml`、`docker-compose.prod.yml`、`.env.example`、`test/conn-worker.test.ts`、`test/containerization.test.ts`

### Conn run heartbeat 收口
- 日期：2026-04-21
- 主题：为运行中的 conn run 增加 heartbeat，周期性刷新 `updatedAt` 与 `leaseUntil`，避免长任务在详情页里看起来像卡死。
- 影响范围：`src/agent/conn-run-store.ts` 新增 `heartbeatRun()`；`src/workers/conn-worker.ts` 在执行期间启动/停止 lease heartbeat；`test/conn-run-store.test.ts` 与 `test/conn-worker.test.ts` 补齐回归。
- 对应入口：`src/agent/conn-run-store.ts`、`src/workers/conn-worker.ts`、`test/conn-run-store.test.ts`、`test/conn-worker.test.ts`

### Conn stale run 回收收口
- 日期：2026-04-21
- 主题：worker 在 claim 新任务前先回收 lease 已过期的 `running` run，把它们标记为失败并补 `run_stale` 事件，不再静默重领旧 run。
- 影响范围：`src/workers/conn-worker.ts` 新增 stale sweep；`src/agent/conn-run-store.ts` 新增 `listStaleRuns()`；`test/conn-worker.test.ts` 补齐 stale 回收回归。
- 对应入口：`src/workers/conn-worker.ts`、`src/agent/conn-run-store.ts`、`test/conn-worker.test.ts`

### Playground 展示 conn run lease / stale 信息
- 日期：2026-04-21
- 主题：把 conn run 的 lease 生命周期状态从“后端自己知道”收口到前台弹层可见，避免用户只看到结果摘要却不知道任务是不是还活着。
- 影响范围：`src/types/api.ts` 与 `src/routes/conns.ts` 现在对外返回 `leaseOwner`、`leaseUntil`；`src/ui/playground.ts` 的后台任务过程弹层新增 `claimed / started / updated / lease owner / lease until` 与 health 文案展示；`test/server.test.ts` 锁定新字段回归。
- 对应入口：`src/types/api.ts`、`src/routes/conns.ts`、`src/ui/playground.ts`、`test/server.test.ts`、`docs/runtime-assets-conn-feishu.md`、`docs/playground-current.md`

### 会话目录合并后台通知摘要
- 日期：2026-04-21
- 主题：修复 `GET /v1/chat/conversations` 只看旧会话快照、忽略后台 notification 的问题，避免正文已经有结果但左侧列表仍显示空摘要和旧排序。
- 影响范围：`src/agent/agent-service.ts` 在生成 conversation catalog 时会合并 notification 的 `preview / messageCount / updatedAt` 并重新排序；`test/agent-service.test.ts` 补齐目录摘要、计数与排序回归；`docs/playground-current.md` 同步更新前台口径。
- 对应入口：`src/agent/agent-service.ts`、`test/agent-service.test.ts`、`docs/playground-current.md`

### Conn maxRunMs 超时闸门
- 日期：2026-04-22
- 主题：为后台 `conn` 增加可配置的 `maxRunMs`，让超长任务在 worker 侧被真实中止并失败留痕，而不是无限挂着占坑。
- 影响范围：`src/agent/conn-store.ts`、`src/agent/conn-sqlite-store.ts`、`src/agent/conn-db.ts` 为 `conn` 定义、SQLite 存储与 schema 迁移新增 `maxRunMs`；`src/routes/conns.ts` 与 `src/types/api.ts` 开放读写接口字段；`src/workers/conn-worker.ts` 与 `src/agent/background-agent-runner.ts` 打通超时中止、`run_timed_out` 事件与失败收口；测试覆盖落在 `test/conn-db.test.ts`、`test/conn-sqlite-store.test.ts`、`test/background-agent-runner.test.ts`、`test/conn-worker.test.ts`、`test/server.test.ts`。
- 对应入口：`src/agent/conn-store.ts`、`src/agent/conn-sqlite-store.ts`、`src/agent/conn-db.ts`、`src/routes/conns.ts`、`src/types/api.ts`、`src/workers/conn-worker.ts`、`src/agent/background-agent-runner.ts`、`docs/runtime-assets-conn-feishu.md`

### Playground 标识 conn 超时失败
- 日期：2026-04-22
- 主题：让后台任务过程弹层把 `maxRunMs` 超时失败显示为 `failed / timed out`，不要和普通失败混成一类。
- 影响范围：`src/ui/playground.ts` 新增超时识别逻辑，优先读取 `run_timed_out` 事件，兜底匹配 `errorText` 中的 `exceeded maxRunMs`；`test/server.test.ts` 锁定 `/playground` 脚本标记；`docs/playground-current.md` 同步说明展示口径。
- 对应入口：`src/ui/playground.ts`、`test/server.test.ts`、`docs/playground-current.md`
 
### Playground Conn 管理面
- 日期：2026-04-22
- 主题：在 `playground` 增加后台任务管理入口，让用户不用离开页面就能查看 conn 列表、暂停/恢复调度、手动入队一次运行，并打开最近 run 详情。
- 影响范围：
  - `src/ui/playground.ts` 新增桌面端 `后台任务` 入口、手机端溢出菜单入口、`conn-manager-dialog` 弹层、`GET /v1/conns` 列表读取、`GET /v1/conns/:connId/runs` 最近 run 读取、`POST /v1/conns/:connId/run` 手动执行、`POST /v1/conns/:connId/pause|resume` 状态切换。
  - 前台 agent 运行中不禁用 conn 管理入口，保持后台调度和前台对话解耦。
  - `test/server.test.ts` 锁定页面 HTML / 嵌入脚本中必须存在 conn 管理入口和真实 API 调用链。
  - `docs/playground-current.md` 与 `docs/runtime-assets-conn-feishu.md` 同步记录新入口和排障口径。
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)
  - [docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

### Agent Activity 全局活动时间线
- 日期：2026-04-22
- 主题：新增跨会话的 Agent Activity 时间线，让后台 conn 结果不再只藏在目标 conversation 里；当前会话 transcript 继续作为上下文真源，全局活动只做观察和追溯。
- 影响范围：
  - `src/agent/conn-db.ts` 新增 `agent_activity_items` schema、索引和表初始化。
  - `src/agent/agent-activity-store.ts` 新增全局活动 store，支持创建、去重、列表、读取和已读标记。
  - `src/workers/conn-worker.ts` 对所有终态 conn run best-effort 写入全局 activity；conversation 目标继续写 `conversation_notifications`，成功、失败、超时结果都会留痕。
  - `src/routes/activity.ts` 新增 `GET /v1/activity` 与 `POST /v1/activity/:activityId/read`。
  - `src/server.ts` 注册 activity store 和路由，`src/types/api.ts` 补齐 API 类型。
  - `src/ui/playground.ts` 新增桌面端与手机端 `全局活动` 入口、activity 弹层、`/v1/activity?limit=50` 拉取、广播后刷新，以及从 activity 条目跳转既有 conn run 详情弹层。
  - `test/agent-activity-store.test.ts`、`test/conn-db.test.ts`、`test/conn-worker.test.ts`、`test/server.test.ts` 补齐回归。
  - `docs/runtime-assets-conn-feishu.md`、`docs/playground-current.md`、`docs/traceability-map.md` 同步新的读模型、API 和前端入口。
- 对应入口：
  - [src/agent/agent-activity-store.ts](/E:/AII/ugk-pi/src/agent/agent-activity-store.ts)
  - [src/routes/activity.ts](/E:/AII/ugk-pi/src/routes/activity.ts)
  - [src/workers/conn-worker.ts](/E:/AII/ugk-pi/src/workers/conn-worker.ts)
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/agent-activity-store.test.ts](/E:/AII/ugk-pi/test/agent-activity-store.test.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
### Conn 固定时间规则补齐具体时间入口
- 日期：2026-04-22
- 主题：这是当天中途那版“固定时间规则”交互的补丁记录；它解决的是当时 `每天固定时间 / 工作日固定时间 / 每周固定时间` 那套设计里的联动显示问题。
- 影响范围：这套固定时间规则后来已整体退场，被更晚的三种调度模式替代，所以这条记录只保留历史背景，不再代表当前页面结构。
- 对应入口：`src/ui/playground.ts`、`test/server.test.ts`、`docs/playground-current.md`
### Conn 调度表单收口成三种模式
- 日期：2026-04-22
- 主题：按最新产品口径把后台任务调度区简化成 `定时执行 / 间隔执行 / 每日执行` 三种，删除原先那堆 `每天早上 / 每小时 / 工作日 / 每周 / Conn 定时表达式` 的前台选择分支。
- 影响范围：`src/ui/playground.ts` 只保留三种调度模式及对应字段，并继续映射到后端 `once / interval / cron`；`test/server.test.ts` 更新页面断言；`docs/playground-current.md` 与 `docs/runtime-assets-conn-feishu.md` 同步新的用户口径。
- 对应入口：`src/ui/playground.ts`、`test/server.test.ts`、`docs/playground-current.md`、`docs/runtime-assets-conn-feishu.md`

### Playground 统一会话同步 ownership
- 日期：2026-04-22
- 主题：把 `playground` 会话历史恢复和运行态同步统一收口到 request generation ownership，避免旧会话回包或同会话旧请求晚回时把当前 transcript 冲脏。
- 影响范围：
  - `src/ui/playground.ts` 新增 `conversationSyncGeneration / conversationSyncRequestId / conversationAppliedSyncRequestId`，并统一通过 `invalidateConversationSyncOwnership()`、`issueConversationSyncToken()`、`isConversationSyncTokenCurrent()`、`shouldApplyConversationState()` 管住 `/v1/chat/state` 的落地资格。
  - `src/ui/playground-conversations-controller.ts` 在切换会话前先停止当前 run event stream，再失效旧会话 sync ownership，避免新旧会话并发同步互相污染。
  - `test/server.test.ts` 更新 `/playground` 页面断言，锁定新的 sync token 契约和 `renderConversationState(conversationState, syncToken)` 入口。
  - `docs/playground-current.md` 同步当前前端对会话同步 ownership 的真实口径。
- 对应入口：`src/ui/playground.ts`、`src/ui/playground-conversations-controller.ts`、`test/server.test.ts`、`docs/playground-current.md`

### Playground 拆分 stream lifecycle controller
- 日期：2026-04-22
- 主题：把 `playground` 的通知广播 SSE、active run 事件流、断线恢复，以及 `send / queue / interrupt` 主链路从 `src/ui/playground.ts` 拆到独立 `playground-stream-controller.ts`，避免主文件继续兼任事件泵站。
- 影响范围：
  - `src/ui/playground-stream-controller.ts` 新增 `bindPlaygroundStreamController()`，承接 `connectNotificationStream()`、`attachActiveRunEventStream()`、`recoverRunningStreamAfterDisconnect()`、`readEventStream()`、`handleStreamEvent()`、`sendMessage()`、`queueActiveMessage()`、`interruptRun()` 等流式运行时入口。
  - `src/ui/playground.ts` 只保留 canonical state、会话恢复、DOM refs 和页面组装；旧的 stream lifecycle 函数从主文件移除，改为注入新 controller。
  - `test/server.test.ts` 新增 `/playground` 页面断言，锁定 `bindPlaygroundStreamController()` 注入和关键 stream runtime 入口。
  - `docs/playground-current.md`、`docs/traceability-map.md` 同步新的前端边界和排查入口。
- 对应入口：`src/ui/playground-stream-controller.ts`、`src/ui/playground.ts`、`test/server.test.ts`、`docs/playground-current.md`、`docs/traceability-map.md`
### 任务消息页替代会话绑定后台结果
- 日期：2026-04-23
- 主题：把后台任务结果从“绑定目标会话”的旧模型收口为独立 `任务消息` 页面，并把 `playground` 任务消息逻辑从主拼装文件里拆到独立模块。
- 影响范围：`src/ui/playground-task-inbox.ts` 新增任务消息页视图、未读徽标、列表加载、已读回写和消息动作；`src/ui/playground.ts` 顶栏入口与主视图切换改成 `chat|tasks` 双视图装配；`src/ui/playground-stream-controller.ts` 收到广播后只刷新任务消息列表和未读摘要，不再把后台结果并回当前会话；`src/ui/playground-conn-activity-controller.ts` 恢复并收口 conn 编辑器时间选择初始化，同时把默认目标固定成 `task_inbox`；`src/routes/conns.ts`、`src/workers/conn-worker.ts`、`src/agent/agent-service.ts`、`src/server.ts` 继续清理旧的会话通知绑定链路；`test/server.test.ts`、`test/conn-worker.test.ts`、`test/agent-service.test.ts` 同步更新断言，改为围绕 `activity + task inbox` 验证。
- 对应入口：[src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)、[src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)、[src/ui/playground-stream-controller.ts](/E:/AII/ugk-pi/src/ui/playground-stream-controller.ts)、[src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)、[src/routes/conns.ts](/E:/AII/ugk-pi/src/routes/conns.ts)、[src/workers/conn-worker.ts](/E:/AII/ugk-pi/src/workers/conn-worker.ts)、[src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)、[src/server.ts](/E:/AII/ugk-pi/src/server.ts)、[test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)、[test/conn-worker.test.ts](/E:/AII/ugk-pi/test/conn-worker.test.ts)、[test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)、[docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)、[docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)
### 任务消息未读交互收口
- 日期：2026-04-23
- 主题：把任务消息页的未读策略从“进入页面自动批量已读”改成“按条已读 + 显式全部已读”
- 影响范围：
  - `src/agent/agent-activity-store.ts` 新增 `markAllRead()`，允许批量写入 `read_at`
  - `src/routes/activity.ts` 新增 `POST /v1/activity/read-all`
  - `src/types/api.ts` 补充批量已读响应类型
  - `src/ui/playground-task-inbox.ts` 去掉 `markVisibleTaskInboxItemsRead`，改成未读红点、单条已读和显式 `全部已读`
  - `test/agent-activity-store.test.ts`、`test/server.test.ts` 补齐批量已读与任务消息页断言
  - `docs/playground-current.md`、`docs/runtime-assets-conn-feishu.md` 同步当前交互口径
- 对应入口：
  - [src/agent/agent-activity-store.ts](/E:/AII/ugk-pi/src/agent/agent-activity-store.ts)
  - [src/routes/activity.ts](/E:/AII/ugk-pi/src/routes/activity.ts)
  - [src/types/api.ts](/E:/AII/ugk-pi/src/types/api.ts)
  - [src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)
  - [test/agent-activity-store.test.ts](/E:/AII/ugk-pi/test/agent-activity-store.test.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)
  - [docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

### Playground 空闲旧会话状态读取提速
- 日期：2026-04-24
- 主题：把空闲旧会话的状态 / 历史 / token 使用量读取从完整 agent runtime 初始化中解耦，避免切换旧会话或新建会话时被 session open、skills reload 和 resource loader 创建拖到秒级。
- 影响范围：
  - `src/agent/agent-session-factory.ts` 新增 `readSessionMessages()` 读模型入口，默认 factory 直接解析 session JSONL 中的 `message` 事件，并兼容容器内 `/app/...` session 路径到项目根目录的映射。
  - `src/agent/agent-service.ts` 的 `getRunStatus()`、`getConversationHistory()`、`getConversationState()` 优先使用轻量消息读取；只有 active run 或真正发送 / 续跑 agent 时才使用完整 session runtime。
  - `test/agent-service.test.ts` 锁定空闲旧会话读取不得调用 `createSession()`；`test/agent-session-factory.test.ts` 锁定默认 JSONL 读取行为。
  - `docs/playground-current.md` 同步当前会话切换性能口径，明确旧会话查看路径不能初始化完整 agent。
- 对应入口：
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [src/agent/agent-session-factory.ts](/E:/AII/ugk-pi/src/agent/agent-session-factory.ts)
  - [test/agent-service.test.ts](/E:/AII/ugk-pi/test/agent-service.test.ts)
  - [test/agent-session-factory.test.ts](/E:/AII/ugk-pi/test/agent-session-factory.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 用户体验债大扫除计划
- 日期：2026-04-24
- 主题：对会话切换、状态读取、技能列表、后台任务管理器、会话索引、transcript 渲染、任务消息和资产详情等用户可感知慢路径做系统审计，整理 P0/P1 体验债执行计划。
- 影响范围：本次只新增规划文档，不改业务源码；由于 `.codex/plans/` 被 Windows ACL 拒绝写入，计划暂落在项目可写的 `docs/plans/`。
- 对应入口：
  - [docs/plans/2026-04-24-playground-ux-debt-cleanup.md](/E:/AII/ugk-pi/docs/plans/2026-04-24-playground-ux-debt-cleanup.md)

### Playground 手机端 loading 气泡层级优化
- 日期：2026-04-24
- 主题：按手机端操作体验把 active run 状态摘要移出助手气泡，改成气泡上方的浅灰单行状态；运行日志 loading 按钮移动到 `助手` 标签右侧，手机端只保留动态点。
- 影响范围：
  - `src/ui/playground-transcript-renderer.ts` 调整 active assistant 状态 DOM 挂载位置，摘要作为 `.message-body` 外的 `.assistant-status-shell`，运行日志触发按钮插入 `.message-meta strong` 后方。
  - `src/ui/playground.ts` 补充 mobile 断点样式，弱化状态摘要，压缩标签旁 loading 按钮，并保持不同状态的颜色类同步。
  - `test/server.test.ts` 增加页面结构与手机端样式断言。
  - `docs/playground-current.md` 同步当前手机端 active run 展示口径。
- 对应入口：
  - [src/ui/playground-transcript-renderer.ts](/E:/AII/ugk-pi/src/ui/playground-transcript-renderer.ts)
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 首帧空白气泡与滚底修复
- 日期：2026-04-24
- 主题：修复 active run 刚开始时空 `.message-body` 显示成空白助手气泡的问题，并让新助手状态第一次出现时主动滚到底部。
- 影响范围：
  - `src/ui/playground.ts` 隐藏只有空 `.message-content` 的助手气泡主体，避免 loading 阶段出现空白块。
  - `src/ui/playground-transcript-renderer.ts` 标记状态 shell 是否为本次新建，只有从无到有的首帧状态强制滚底；后续过程更新继续尊重用户阅读历史时的滚动位置。
  - `test/server.test.ts` 增加页面断言，锁定空主体隐藏和首帧强制滚底契约。
  - `docs/playground-current.md` 同步当前手机端 active run 体验口径。
- 对应入口：
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [src/ui/playground-transcript-renderer.ts](/E:/AII/ugk-pi/src/ui/playground-transcript-renderer.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 手机端工作页视觉重设计
- 日期：2026-04-24
- 主题：把手机端文件库、后台任务管理、后台任务创建 / 编辑、任务消息和上下文详情统一收口成 UGK Claw 深色工作页风格，去掉半透明弹窗和贴底抽屉的混乱层级。
- 影响范围：
  - `src/ui/playground-assets.ts` 将手机端文件库、`conn-manager-dialog` 和 `conn-editor-dialog` 改为全屏 `100dvh` 工作页，使用 `#01030a / #060711 / #0b0c18` 主题分层，强化 sticky 工具栏、实心卡片和整宽操作按钮。
  - `src/ui/playground-task-inbox.ts` 将手机端任务消息页改为实心工作页，头部和结果卡片不再透明漂浮。
  - `src/ui/playground.ts` 将手机端上下文详情改为顶部不透明信息面板，并移除 `conn-editor-panel` 的全局圆角强制覆盖。
  - `test/server.test.ts` 更新 `/playground` 移动端页面断言，锁定文件库 / 后台任务 / 创建任务 / 任务消息 / 上下文详情的新视觉约束。
  - `DESIGN.md` 增加移动工作页、工作页头部、工作页卡片和上下文面板组件令牌。
  - `docs/playground-current.md` 同步当前真实交互口径。
- 对应入口：
  - [src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)
  - [src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)
  - [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [DESIGN.md](/E:/AII/ugk-pi/DESIGN.md)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 移动工作页顶栏操作回归
- 日期：2026-04-25
- 主题：按手机端真实操作习惯，把文件库、后台任务、后台任务创建 / 编辑和任务消息页的 `回到对话` 文字按钮改成左侧返回箭头，并把刷新、新建、保存、筛选、全部已读等页面动作放回顶栏右侧。
- 影响范围：
  - `src/ui/playground-assets.ts` 将文件库头部改为左侧返回箭头 + `可复用资产` 标题，右侧保留 `刷新文件库`，并删除旧的 `mobile-work-page-actions` 二层工具栏样式。
  - `src/ui/playground-conn-activity.ts` 将后台任务管理页右侧恢复为 `新建任务 / 刷新列表`，将后台任务创建 / 编辑页右侧恢复为 `保存 / 取消`。
  - `src/ui/playground-task-inbox.ts` 将任务消息页右侧恢复为 `未读 / 全部 / 全部已读 / 刷新`，并删除旧的 `task-inbox-controls` 二层工具栏。
  - `test/server.test.ts` 锁定四类页面的新 DOM 结构，禁止再出现可见 `回到对话` close button 或旧工具栏容器。
  - `DESIGN.md` 与 `docs/playground-current.md` 同步当前顶栏规则。
- 对应入口：
  - [src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)
  - [src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)
  - [src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [DESIGN.md](/E:/AII/ugk-pi/DESIGN.md)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 后台任务目标预览乱码修复
- 日期：2026-04-24
- 主题：修复新建后台任务页 `conn-editor-target-preview` 中投递目标说明显示为 `????` 的问题。
- 影响范围：
  - `src/ui/playground-conn-activity-controller.ts` 恢复投递目标输入提示、目标预览、空目标错误和目标摘要的中文文案。
  - `test/server.test.ts` 增加页面断言，锁定 `任务消息`、飞书目标 fallback 文案，并禁止目标预览继续写入 `????`。
  - `docs/playground-current.md` 同步目标预览中文展示口径。
- 对应入口：
  - [src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)

### Playground 非对话页统一顶部状态栏
- 日期：2026-04-24
- 主题：让手机端文件库、后台任务、后台任务创建 / 编辑和任务消息页都使用统一 `topbar` 状态栏，并把右侧动作收口成唯一的 `回到对话`。
- 影响范围：
  - `src/ui/playground-assets.ts` 将文件库头部改为 `topbar asset-modal-head mobile-work-topbar`，刷新动作下沉到 `asset-modal-page-actions`。
  - `src/ui/playground-conn-activity.ts` 将后台任务管理和创建 / 编辑页头部改为统一 `topbar`；`新建任务 / 刷新列表` 下沉到 `conn-manager-primary-actions`，`保存 / 取消` 下沉到 `conn-editor-page-actions`。
  - `src/ui/playground-task-inbox.ts` 将任务消息页头部改为统一 `topbar`，筛选、全部已读和刷新下沉到 `task-inbox-controls`。
  - `src/ui/playground-assets.ts` 补充 `mobile-work-topbar` 和 `mobile-work-page-actions` 移动端样式，避免复用全局 `topbar` 时被桌面布局污染。
  - `test/server.test.ts` 增加页面结构和移动端样式断言，锁定非对话页 topbar 右侧只能是 `回到对话`。
  - `DESIGN.md`、`docs/playground-current.md` 同步当前视觉口径。
- 对应入口：
  - [src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)
  - [src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)
  - [src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)
  - [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
  - [DESIGN.md](/E:/AII/ugk-pi/DESIGN.md)
  - [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)
### Agent conversation state page 构建收口
- 日期：2026-04-26
- 主题：把 `AgentService.getConversationState()` 中的 canonical history 分页、active / terminal run view 合并和 `historyPage` meta 构造收口到 `src/agent/agent-conversation-state.ts`。
- 影响范围：
  - `src/agent/agent-conversation-state.ts` 新增 `buildConversationStatePage()`，统一处理 `sessionMessages` 分页、`persistedTurnCoverage` 页内偏移、`viewMessages` 合成和 `hasMoreBeforeWindow` 合并。
  - `src/agent/agent-service.ts` 的 `getConversationState()` 保留 state context 读取、context usage 计算、terminal run 选择和响应外壳组装，不再直接维护分页细节。
  - `test/agent-conversation-state.test.ts` 补充状态页构建测试，覆盖分页 meta、active run 去重和 terminal run fallback。
  - `AGENTS.md`、`docs/traceability-map.md` 同步聊天 / 状态恢复排查入口。
- 对应入口：
  - [src/agent/agent-conversation-state.ts](/E:/AII/ugk-pi/src/agent/agent-conversation-state.ts)
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [test/agent-conversation-state.test.ts](/E:/AII/ugk-pi/test/agent-conversation-state.test.ts)
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### Agent session event adapter 收口
- 日期：2026-04-26
- 主题：把 `AgentService.runChat()` 内部监听原始 session event 的 switch 拆到 `src/agent/agent-session-event-adapter.ts`，让 run 编排不再直接负责原始事件翻译、文本累积和 `send_file` 收集。
- 影响范围：
  - `src/agent/agent-session-event-adapter.ts` 新增 `createAgentSessionEventAdapter()`，统一把 `message_update`、`tool_execution_*`、`queue_update` 转成 `ChatStreamEvent`，并维护 `rawText` 与 `sentFiles`。
  - `src/agent/agent-service.ts` 的 `runChat()` 改为订阅 adapter，继续负责 active run 生命周期、prompt 执行、持久化与 cleanup。
  - `test/agent-session-event-adapter.test.ts` 补充文本 delta、本地路径改写、工具事件、队列事件、`send_file` 收集和无效事件忽略测试。
  - `AGENTS.md`、`docs/traceability-map.md` 同步聊天 / 流式排查入口。
- 对应入口：
  - [src/agent/agent-session-event-adapter.ts](/E:/AII/ugk-pi/src/agent/agent-session-event-adapter.ts)
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [test/agent-session-event-adapter.test.ts](/E:/AII/ugk-pi/test/agent-session-event-adapter.test.ts)
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### Agent run event 投递收口
- 日期：2026-04-26
- 主题：把 `AgentService` 内部的 best-effort stream event 投递策略收口到 `src/agent/agent-run-events.ts`，让事件克隆、终态判断和投递容错集中在同一领域 helper。
- 影响范围：
  - `src/agent/agent-run-events.ts` 新增 `ChatStreamEventSink` 与 `deliverChatStreamEvent()`，继续保持 SSE / observer sink 抛错时不影响 agent run 的语义。
  - `src/agent/agent-service.ts` 移除本地 `emitEvent()` 私有方法，文本增量、事件回放和 subscriber 分发统一调用 `deliverChatStreamEvent()`。
  - `test/agent-run-events.test.ts` 补充 clone 深拷贝、终态判断和 best-effort 投递测试。
- 对应入口：
  - [src/agent/agent-run-events.ts](/E:/AII/ugk-pi/src/agent/agent-run-events.ts)
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [test/agent-run-events.test.ts](/E:/AII/ugk-pi/test/agent-run-events.test.ts)

### Agent run result 构建收口
- 日期：2026-04-26
- 主题：把 `AgentService.runChat()` 里的最终文本、输出文件、`send_file` 合并、本地 artifact 链接改写和 `done` 事件构造收口到独立 helper，降低核心运行编排函数的职责密度。
- 影响范围：
  - `src/agent/agent-run-result.ts` 新增 `buildAgentRunResult()` 与 `buildDoneChatStreamEvent()`，统一处理 assistant 最终文本兜底、`ugk-file` 提取保存、`send_file` 文件合并和用户可见本地路径重写。
  - `src/agent/agent-service.ts` 的 `runChat()` 改为调用 run result helper，保留 session 执行、事件分发、持久化和 cleanup 编排职责。
  - `test/agent-run-result.test.ts` 补充 run result 聚焦测试，覆盖 inline file、`send_file`、本地路径改写、最终 assistant message 兜底和 done event 可选字段。
  - `AGENTS.md`、`docs/traceability-map.md` 同步 agent 核心排查入口。
- 对应入口：
  - [src/agent/agent-run-result.ts](/E:/AII/ugk-pi/src/agent/agent-run-result.ts)
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [test/agent-run-result.test.ts](/E:/AII/ugk-pi/test/agent-run-result.test.ts)
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)

### Agent active run view 投影收口
- 日期：2026-04-26
- 主题：把 `ChatStreamEvent` 到 active run view 的投影逻辑从 `AgentService` 私有方法收口到 `src/agent/agent-active-run-view.ts`，让 service 只负责运行编排和事件分发。
- 影响范围：
  - `src/agent/agent-active-run-view.ts` 新增 `applyChatStreamEventToActiveRunView()`，统一维护文本增量、工具过程、队列状态和终态事件对 active run view 的影响。
  - `src/agent/agent-service.ts` 移除本地投影 switch，`emitRunEvent()` 改为调用 active run view helper，事件缓冲和订阅分发行为不变。
  - `test/agent-active-run-view.test.ts` 补充投影测试，覆盖文本增量、队列更新和完成态。
- 对应入口：
  - [src/agent/agent-active-run-view.ts](/E:/AII/ugk-pi/src/agent/agent-active-run-view.ts)
  - [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
  - [test/agent-active-run-view.test.ts](/E:/AII/ugk-pi/test/agent-active-run-view.test.ts)

### Chat SSE 工具拆分
- 日期：2026-04-26
- 主题：把聊天路由里的 Server-Sent Events 写入、关闭和终态判断从 `src/routes/chat.ts` 拆到 `src/routes/chat-sse.ts`，避免路由入口继续混入底层响应写入细节。
- 影响范围：
  - `src/routes/chat-sse.ts` 新增 `configureSseResponse()`、`writeSseEvent()`、`endSseResponse()`、`isTerminalChatStreamEvent()`，保持原有 SSE headers、`data: <json>\n\n` 帧格式、关闭响应保护和写入异常吞吐行为。
  - `src/routes/chat.ts` 改为复用 SSE 工具，`GET /v1/chat/events` 与 `POST /v1/chat/stream` 的外部行为不变。
  - `test/chat-sse.test.ts` 补充 SSE 输出、关闭保护、异常吞吐和终态事件识别测试。
  - `AGENTS.md`、`docs/traceability-map.md` 同步聊天 / 流式排查入口。
- 对应入口：
  - [src/routes/chat-sse.ts](/E:/AII/ugk-pi/src/routes/chat-sse.ts)
  - [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)
  - [test/chat-sse.test.ts](/E:/AII/ugk-pi/test/chat-sse.test.ts)
  - [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
  - [docs/traceability-map.md](/E:/AII/ugk-pi/docs/traceability-map.md)
### Feishu 控制命令状态查询与真实新会话
- 日期：2026-04-29
- 主题：新增飞书 `/status` 控制命令，并把飞书 `/new` 收口为真正调用主服务新建当前 Web 会话。
- 影响范围：
  - `src/integrations/feishu/service.ts` 在飞书入站服务层拦截 `/status` 和 `/new`，控制命令不再进入普通 agent prompt。
  - `/status` 返回当前 Web 会话 ID、运行状态、上下文占用、active run 当前输入和当前输出摘要，方便飞书侧知道 Web 正在干嘛。
  - `/new` 调用 `createConversation()`，成功后 Web 刷新会跟随新的服务端当前会话；当前有 active run 时明确拒绝新建。
  - `src/integrations/feishu/http-agent-gateway.ts` 补齐 `GET /v1/chat/state` 和 `POST /v1/chat/conversations` 调用。
  - `test/feishu-service.test.ts`、`test/feishu-http-agent-gateway.test.ts` 增加控制命令覆盖。
- 对应入口：
  - [src/integrations/feishu/service.ts](/E:/AII/ugk-pi/src/integrations/feishu/service.ts)
  - [src/integrations/feishu/http-agent-gateway.ts](/E:/AII/ugk-pi/src/integrations/feishu/http-agent-gateway.ts)
  - [test/feishu-service.test.ts](/E:/AII/ugk-pi/test/feishu-service.test.ts)
  - [test/feishu-http-agent-gateway.test.ts](/E:/AII/ugk-pi/test/feishu-http-agent-gateway.test.ts)

### 后台任务全局通知镜像到飞书
- 日期：2026-04-29
- 主题：后台 `conn` 任务完成、失败或取消后，除继续写入任务消息页和 Web 通知外，可选镜像一份到飞书。
- 影响范围：
  - `src/workers/conn-worker.ts` 新增 optional `activityNotifier`，在 activity 写入和 Web broadcast 后 best-effort 投递飞书；失败只 warn，不影响任务终态。
  - 新增 `FEISHU_ACTIVITY_CHAT_IDS`，用于投递到固定飞书群聊或私聊 `chat_id`。
  - 新增 `FEISHU_ACTIVITY_OPEN_IDS`，用于直接投递到用户机器人私聊。
  - `docker-compose.yml` 的 `ugk-pi-conn-worker` 读取 `.env`，本地 compose 也能拿到飞书配置。
- 对应入口：
  - [src/workers/conn-worker.ts](/E:/AII/ugk-pi/src/workers/conn-worker.ts)
  - [test/conn-worker.test.ts](/E:/AII/ugk-pi/test/conn-worker.test.ts)

### Feishu WebSocket 订阅与 HTTP webhook 移除
- 日期：2026-04-29
- 主题：把飞书入站从主服务 HTTP webhook 改为独立 WebSocket worker，飞书继续作为 Web 当前会话的外挂收发窗口。
- 影响范围：
  - `src/server.ts` 不再注册 `POST /v1/integrations/feishu/events`，主服务只保留 playground、聊天、资产、conn 和通知等原有 HTTP API。
  - `src/workers/feishu-worker.ts` 新增飞书长连接 worker，使用 `@larksuiteoapi/node-sdk` 的 `WSClient` / `EventDispatcher` 订阅 `im.message.receive_v1`。
  - `src/integrations/feishu/http-agent-gateway.ts` 新增 HTTP gateway，worker 通过主服务 `/v1/chat*` API 调同一个 `AgentService`，避免飞书侧起第二个前台 agent。
  - `src/integrations/feishu/ws-subscription.ts` 新增 SDK 封装；出站消息、附件下载和结果文件回传继续复用现有飞书模块。
  - `docker-compose.yml`、`docker-compose.prod.yml` 新增 `ugk-pi-feishu-worker` 服务；`package.json` 新增 `worker:feishu`。
  - `.env.example` 补齐 `FEISHU_ENABLED`、`FEISHU_SUBSCRIPTION_MODE=ws`、`FEISHU_VERIFICATION_TOKEN`、`FEISHU_ENCRYPT_KEY`、`FEISHU_AGENT_BASE_URL`。
- 对应入口：
  - [src/workers/feishu-worker.ts](/E:/AII/ugk-pi/src/workers/feishu-worker.ts)
  - [src/integrations/feishu/ws-subscription.ts](/E:/AII/ugk-pi/src/integrations/feishu/ws-subscription.ts)
  - [src/integrations/feishu/http-agent-gateway.ts](/E:/AII/ugk-pi/src/integrations/feishu/http-agent-gateway.ts)
  - [test/feishu-ws-subscription.test.ts](/E:/AII/ugk-pi/test/feishu-ws-subscription.test.ts)
  - [test/feishu-http-agent-gateway.test.ts](/E:/AII/ugk-pi/test/feishu-http-agent-gateway.test.ts)
