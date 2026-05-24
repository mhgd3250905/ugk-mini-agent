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

本地开发时，Live API 依赖 Vite dev server 的 `/v1/team`、`/v1/agents` 和 `/v1/assets` 代理。默认代理目标是主 `ugk-pi` 服务：

```bash
http://127.0.0.1:3000
```

所以使用 Live API preview 前，需要先确保主服务已经运行在 `http://127.0.0.1:3000`。如主服务不在默认端口，可用 `TEAM_CONSOLE_API_TARGET` 覆盖代理目标：

```bash
TEAM_CONSOLE_API_TARGET=http://127.0.0.1:3100 npm run dev
```

Live API 模式会真实请求：

- `GET /v1/agents`
- `POST /v1/agents/:agentId/chat/conversations`
- `GET /v1/agents/:agentId/chat/conversations`
- `POST /v1/agents/:agentId/chat/current`
- `GET /v1/agents/:agentId/chat/state`
- `GET /v1/agents/:agentId/chat/history`
- `GET /v1/agents/:agentId/chat/status`
- `POST /v1/agents/:agentId/chat/stream`
- `POST /v1/agents/:agentId/chat/queue`
- `POST /v1/agents/:agentId/chat/interrupt`
- `GET /v1/assets`
- `POST /v1/assets/upload`
- `GET /v1/team/plans`
- `GET /v1/team/runs`
- `GET /v1/team/runs/:runId`
- `GET /v1/team/runs/:runId/tasks/:taskId/attempts`
- `GET /v1/team/runs/:runId/tasks/:taskId/attempts/:attemptId/files/:fileName`

当前 preview 没有 live run picker；它会按 `createdAt` 选择最新 run，再用该 run 的 `planId` 匹配 plan 后渲染执行图。请求失败会在页面顶部显示错误，不会继续展示旧 mock 数据。

## Agent Atlas MVP

Team Console preview 现在把 Agent 节点放进同一张 Execution Atlas 画布，不再额外打开独立 Agent Canvas。默认 Mock 入口是干净的 `Agent workspace`，不显示旧 demo run；需要验证运行图时再切换到“顺序 run”等 fixture。

Mock 模式使用 deterministic Agent fixture，可把主 Agent、搜索 Agent 等真实主项目 Agent profile 概念加入 Atlas；同一个 `agentId` 在同一画布内只能加入一次，已加入项会在选择器里禁用。Agent 节点复用 Execution Atlas 的网格、节点样式、pan/zoom 和“重置视图”工具。普通画布态可拖拽 Agent 卡片；拖拽只改变 Team Console 画布引用位置，不修改真实 Agent profile，也暂不持久化。

单击 Agent 节点会进入 Focus Mode。Focus Mode 是特殊 Agent 对话界面，不再继续显示普通 Execution Atlas 节点层：其他 Agent、runtime nodes、links、evidence 和添加 / 缩放工具都会隐藏，只保留当前锁定 Agent 卡片和下方大对话工作区。Focus 只能通过“收起”退出，退出后恢复进入 Focus 前的 viewport 和普通画布节点层。

Focus 对话区对齐主 `/playground` 当前 Agent 对话首页的视觉语言：Focus 顶部保留新会话、文件库和上下文使用量入口，但不显示 Agent switcher 或 Agent 切换按钮，因为当前 Agent 已由画布卡片决定；暂不显示后台任务和 Team Runtime 入口，避免在 Agent 对话场景里扩散额外工作台功能。下半区使用 transcript + composer 结构，消息按 user 右侧输入回声 / assistant 左侧 raised surface 分层，底部 composer 是一个控制面，并且不显示 `Shift+Enter 换行` 这类轻量 chat panel 提示。Live 模式复用 scoped Agent chat：进入 Focus 会读取 conversation catalog，通过 `GET /v1/agents/:agentId/chat/state` 恢复当前 `conversationId` 的可渲染 history；后续历史分页边界沿用 `GET /v1/agents/:agentId/chat/history`。发送使用 `POST /v1/agents/:agentId/chat/stream`，处理 `run_started`、`text_delta`、`done`、`error`、`interrupted` 与 `queue_updated`，运行中再次发送会走 `POST /v1/agents/:agentId/chat/queue`，打断走 `POST /v1/agents/:agentId/chat/interrupt`。文件上传与文件库在 Live 模式接 `/v1/assets`，上传会携带已有 `conversationId`；只选择文件不输入文本时会补默认请求文案，避免向真实 chat 接口发送空 `message`。Mock 模式走同一 UI 状态机和 deterministic stream fixture。当前不做 Agent clone、instance、profile overlay、画布局部技能安装、WorkUnit 节点或 Plan 编排，也不恢复后台任务 / Team Runtime 按钮、移动端专项或 artifact preview。

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
