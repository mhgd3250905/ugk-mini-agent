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

本地开发时，Live API 依赖 Vite dev server 的 `/v1/team` 和 `/v1/agents` 代理。Agent 卡片状态复用主项目 `GET /v1/agents/status`，显示真实空闲 / 运行中状态；`/v1/assets` proxy 仍保留给 API adapter regression，但当前 Agent 分支卡片本身不再直接调用 asset API。默认代理目标是主 `ugk-pi` 服务：

```bash
http://127.0.0.1:3000
```

所以使用 Live API preview 或 Agent 分支 iframe 前，需要先确保主服务已经运行在 `http://127.0.0.1:3000`。如主服务不在默认端口，可用 `TEAM_CONSOLE_API_TARGET` 覆盖代理目标；Vite 会把同一个目标暴露给前端 iframe URL：

```bash
TEAM_CONSOLE_API_TARGET=http://127.0.0.1:3100 npm run dev
```

Team Console shell 的 Live API 模式会真实请求：

- `GET /v1/agents`
- `GET /v1/agents/status`
- `GET /v1/team/tasks`
- `GET /v1/team/plans`
- `GET /v1/team/runs`
- `GET /v1/team/runs/:runId`
- `GET /v1/team/runs/:runId/tasks/:taskId/attempts`
- `GET /v1/team/runs/:runId/tasks/:taskId/attempts/:attemptId/files/:fileName`

Agent 分支卡片不经 Vite proxy 打开 `/playground`，而是直接把 iframe 指向主服务的 `/playground?view=chat&agentId=<agentId>&embed=team-console`。主 `/playground` 负责读取 `agentId` URL hint、切到对应 Agent 并继续处理自己的路由、对话、文件库、后台任务等行为；`embed=team-console` 会把 iframe 顶部 Agent 标签固定为只读标识，关闭 hover 切换菜单和点击跳转，避免 iframe 内 Agent 切换污染其他分支或主页面的 active Agent 选择。

Live API 模式默认进入干净的 `Agent workspace`，不会在刷新或重新进入时自动渲染历史 run。需要查看运行图时，点击顶部 live 运行图切换条里的“最新 Run”，页面会按 `createdAt` 选择最新 run，再用该 run 的 `planId` 匹配 plan 后渲染执行图。请求失败会在页面顶部显示错误，不会继续展示旧 mock 数据。

## Agent Atlas MVP

Team Console preview 现在把 Agent 节点放进同一张 Execution Atlas 画布，不再额外打开独立 Agent Canvas。默认 Mock 入口是干净的 `Agent workspace`，不显示旧 demo run；需要验证运行图时再切换到“顺序 run”等 fixture。

Mock 模式使用 deterministic Agent fixture，可把主 Agent、搜索 Agent 等真实主项目 Agent profile 概念加入 Atlas；同一个 `agentId` 在同一画布内只能加入一次，已加入项会在选择器里禁用。Agent 节点复用 Execution Atlas 的网格、节点样式、pan/zoom 和“重置视图”工具，并把 `GET /v1/agents/status` 的真实状态投到卡片状态条和状态 pill 上：空闲为绿色静态条，运行中为暖橘红脉冲条，状态读取失败时显示“状态未知”。普通画布态可拖拽 Agent 卡片；Live API 下已添加 Agent 与拖动后的画布位置会写入浏览器 `localStorage`，刷新后恢复；这只保存 Team Console 画布引用位置，不修改真实 Agent profile。Agent 或分支节点向右拖动时只改变画布内世界坐标，不允许撑开外层页面宽度或带动画布 pan。

单击 Agent 节点会展开一个 Agent 分支卡片，而不是进入特殊 Focus 视窗。普通 Execution Atlas 节点层、其他 Agent、runtime nodes、links、evidence 和添加 / 缩放工具都会继续显示；点击同一 Agent 节点会收起该分支，点击另一个 Agent 节点会把分支切换到对应 `agentId`。分支卡片按上层浮窗处理，不再为了避让周围节点自动右移；允许覆盖其他节点，用户可拖动画布或拖动分支标题栏调整位置，并可从右下角调整分支宽高。分支位置使用画布世界坐标，允许拖过原点上方或左侧；拖动分支标题栏不会带动画布平移。Agent 到分支的连接线会按分支相对位置从最近边出线，避免分支拖到下方后仍从右侧硬连。

Agent 分支卡片内部是主项目 `/playground` 的 iframe，URL 形如 `/playground?view=chat&agentId=main&embed=team-console`。Team Console 不再维护本地 transcript + composer、不再复制 scoped chat stream/state/history/queue/interrupt/file library；这些真实行为全部交还给主 `/playground`。主 `/playground` 读取 `agentId` URL hint 后进入对应 Agent，因此主 Agent 卡片打开主 Agent 对话，搜索 Agent 卡片打开搜索 Agent 对话；`embed=team-console` 会锁定 iframe 顶部 Agent 标签，关闭 hover 切换菜单和点击跳转，同时不写入主页面共用的 active-agent localStorage，避免一个分支或主页面的手动切换污染其他 Agent 分支。iframe 内的主项目路由跳转继续由主项目自己处理。当前仍不做 Agent clone、instance、profile overlay、画布局部技能安装、WorkUnit 节点或 Plan 编排，也不恢复 Team Runtime 按钮、移动端专项或 artifact preview。

## Task / WorkUnit 画布准备

Task 内部包含一个 WorkUnit。Team Console preview 现在从 `GET /v1/team/tasks` 读取 Task catalog，Mock fixture 也提供 deterministic Task / WorkUnit 数据；Task 不是单任务 Plan，也不会从 iframe 聊天文本里临时拼出来。Task 卡片会展示 `leaderAgentId`、`workerAgentId` 和 `checkerAgentId` 对应的 Agent 名称，让用户在 Atlas 里先看清谁负责澄清、谁负责执行、谁负责验收。

点击 Task 卡片会展开 leader Agent 的主 `/playground` iframe 分支，URL 形如 `/playground?view=chat&agentId=<leaderAgentId>&embed=team-console&teamTaskId=<taskId>`。`teamTaskId=<taskId>` 只是给主 `/playground` 和未来 `/team-task` 流程的上下文 hint；Team Console 不解析 iframe 聊天文本创建或更新 Task，不启动 Task run，也不实现 worker/checker 执行链路。

Live API 模式下 Task 卡片拖动位置会写入浏览器 `localStorage` 并在刷新后恢复，但只保存 `taskId` 和画布坐标，不保存 WorkUnit 内容、`leaderAgentId`、`workerAgentId` 或 `checkerAgentId`。Task 定义始终以后端 `GET /v1/team/tasks` 返回为准；当前前端只做画布展示和 leader 分支打开。

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

### 连接线

- Spine（根→主任务→主任务）：center-to-center 三次贝塞尔曲线
- Branch（主任务→子任务）：L 形直角折线
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

桌面端 evidence / preview card 使用 absolute 定位在 selected node 右侧，并由 dashed SVG link 连接。桌面画布支持鼠标滚轮缩放、背景拖拽平移，以及“放大 / 缩小 / 重置视图”工具按钮；这些只是本地 UI 状态，不持久化。Evidence / preview 的布局高度测量以 transform-independent 的 `offsetHeight` 为准，避免 CSS scale 后把 `getBoundingClientRect().height` 写回 layout 造成测量反馈循环；滚轮缩放使用原生 non-passive `wheel` listener。移动端 `720px` 以下 evidence / preview card 改为 normal flow，同级插入在 selected node 正下方，保持 8px gap 和无横向 overflow。

### 折叠行为

超过 `CHILD_COLLAPSE_THRESHOLD`(6) 个子任务时折叠为摘要节点，摘要状态按隐藏子任务聚合计算。点击摘要节点可展开全部子任务；展开后末尾显示"收起"按钮，再次点击收起。展开/收起时布局同步更新。

### 响应式

`@media (max-width: 720px)` 时连接线隐藏，节点改为纵向堆叠，并禁用自定义 pan/zoom 工具条。本轮没有做移动端 toolbar / 添加入口专项修复，也没有做移动端深度设计，只做不明显横向炸版的最小烟测。

## 架构

- `src/app/` — App shell、状态管理、数据源切换
- `src/api/` — Team API 类型定义和 adapter
- `src/fixtures/` — Mock fixture 数据
- `src/graph/` — Execution Map model、layout、React 组件、CSS
- `src/shared/` — 通用工具函数
- `src/features/` — 功能模块占位（后续迭代）

## 当前边界

- 仍是独立 preview，不替换 `/playground/team`
- 不调用 manual disposition、rerun、pause/resume/cancel API
- 只通过现有只读 API 读取 attempt metadata 和 attempt file，不新增写操作
- Agent Atlas 只引用已有 Agent catalog，不创建或修改主项目 Agent profile
- 不支持框选、节点创建、minimap、持久化视图或编辑 Plan；Agent 卡片拖拽只是本地画布引用位置调整
- Execution Atlas 只做执行图展示、task evidence 选择、artifact 预览和桌面 pan/zoom；大量子任务会折叠为 summary node，并按隐藏子任务状态汇总显示；折叠节点可展开/收起
