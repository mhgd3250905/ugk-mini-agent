# Team Console

Team Console 是 UGK Mini Agent 的 Canvas 前端。它提供 Execution Atlas 画布、Agent 分支、Task/WorkUnit 管理、Discovery 子画布、Source 节点、Typed Task 连接、Control dependency、Group run 和 Canvas Task run 观察器。

默认入口：

- Team Console / Canvas：`http://127.0.0.1:9999`
- 主服务 / API / Playground：`http://127.0.0.1:8888`

## 运行方式

根目录 `native:start` 会同时启动主服务、Team Console、Team worker 和 Conn worker：

```bash
npm run native:start
```

手动开发 Team Console：

```bash
npm --prefix apps/team-console install
npm --prefix apps/team-console run dev
```

Team Console 默认通过 Vite server 代理主服务接口。代理目标是：

```bash
TEAM_CONSOLE_API_TARGET=http://127.0.0.1:8888
```

如主服务运行在其他端口，可在启动 Vite 前覆盖 `TEAM_CONSOLE_API_TARGET`。

## 测试与构建

```bash
npm --prefix apps/team-console run test
npm --prefix apps/team-console run build
```

根目录快捷命令：

```bash
npm run team-console:dev
npm run team-console:build
npm run team-console:test
```

## 数据源

Team Console 支持 Mock fixture 与 Live API 两种数据源。

Mock fixture 用于离线 UI 验证，覆盖顺序 run、Discovery run、任务拆分 run、失败 run、大量子任务 run、跳过任务 run 和脱敏真实 run snapshot。

Live API 模式会请求主服务接口，包括：

- Agent catalog 与状态：`GET /v1/agents`、`GET /v1/agents/status`
- Task catalog：`GET /v1/team/tasks`
- Task run：`POST /v1/team/tasks/:taskId/runs`、`GET /v1/team/task-runs/:runId`
- Run history：`GET /v1/team/tasks/:taskId/run-history`
- Task connection：`GET /v1/team/task-connections`、`POST /v1/team/task-connections`
- Control dependency：`GET /v1/team/task-dependencies`、`POST /v1/team/task-dependencies`
- Source node：`GET /v1/team/source-nodes`、`POST /v1/team/source-nodes`
- Group：`GET /v1/team/task-groups`、`POST /v1/team/task-groups`
- Discovery generated tasks：`GET /v1/team/tasks/:taskId/generated-tasks`
- Artifact preview：`GET /v1/team/task-runs/:runId/artifacts/:roleKey/:role/*`

## 画布能力

Execution Atlas 是主视图。根节点包含 Agent、Task 和 Source，支持拖拽、框选、Dock 收纳、垃圾桶清理、分类过滤、滚轮缩放和画布平移。

Agent 节点展开后通过同源 iframe 打开主 `/playground`：

```text
/playground?view=chat&agentId=<agentId>&embed=team-console
```

Task 节点提供运行、编辑、Leader 对话和运行记录入口。Canvas Task run 由后端执行 WorkUnit 的 worker/checker 流程，同一 Task 同时只允许一个 active run，不同 Task 可并行运行。

Discovery root Task 可以生成 child Tasks。子画布展示 generated child catalog、运行状态、dispatch diagnostics、渠道集保存与复用、generated WorkUnit reset 和 child archive。

Source 节点用于管理可复用输入材料。Source connection 与 typed Task connection 共同进入画布连接层。

Group frame 用于组织多个 Task，并可触发 Group run。Group 展示态保存在浏览器 UI state，Group definition 以后端返回为准。

## 状态持久化

Team Console 的浏览器状态只保存 UI 引用：

- viewport
- 节点坐标
- 展开的分支
- Dock 收纳状态
- segmented filter
- loaded run selection
- Group 展示态

Task、Source、Group、Task run 和 Agent profile 的权威数据来自主服务 API。

## 文件与 Artifact

Canvas Task role session 会收到：

- `ARTIFACT_PUBLIC_DIR`
- `ARTIFACT_PUBLIC_BASE_URL`

交付给用户或 checker 访问的 HTML、报告和附件应写入 public output 目录，并使用 `/v1/team/task-runs/:runId/artifacts/:roleKey/:role/...` 形式的稳定链接。

Run observer 可预览 attempt 文件。Markdown 使用安全渲染，JSON 使用 pretty print，HTML 通过 sandbox iframe 展示。

## 代码结构

- `src/app/`：App shell、状态管理、数据源切换
- `src/api/`：Team API 类型和 adapter
- `src/fixtures/`：Mock fixture
- `src/graph/`：Execution Map model、layout、组件和样式
- `src/shared/`：共享工具
- `src/features/`：功能模块
