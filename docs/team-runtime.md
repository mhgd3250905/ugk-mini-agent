# Team Runtime

Team Runtime 是 UGK Mini Agent 的 Canvas Task 执行层。它由主服务 API、Team worker、Team 数据目录和 Team Console 前端共同组成。

默认入口：

- Team Console / Canvas：`http://127.0.0.1:8888/playground/team`
- 主服务 / API：`http://127.0.0.1:8888`

## 运行进程

`npm run native:start` 会启动：

- `ugk-mini-agent-server`
- `ugk-mini-agent-team-worker`
- `ugk-mini-agent-conn-worker`

Team Console 由 `npm run team-console:build` 构建为静态资源，并通过主服务 `/playground/team` 路由提供。

Team worker 轮询 `.data/team/` 中的 run state，执行 Canvas Task、Group run、Discovery generated child 和 split-task generated child。

## 数据目录

- `.data/team/tasks/`：Task catalog
- `.data/team/task-runs/`：Canvas Task run state、attempt、artifact
- `.data/team/task-connections.json`：typed Task connection
- `.data/team/task-dependencies.json`：control dependency
- `.data/team/source-nodes.json`：Source catalog
- `.data/team/task-groups.json`：Group definition

这些目录属于本机运行态数据，不进入版本库。

## Task 模型

Task 包含：

- `taskId`
- `title`
- `canvasKind`
- `leaderAgentId`
- `workerAgentId`
- `checkerAgentId`
- `workUnit`
- `inputPorts`
- `outputPorts`
- `templateConfig`
- `templateState`

普通 Task 执行 WorkUnit 的 worker/checker 流程。Discovery Task 负责发现候选项并生成 child Tasks。Split Task 负责把标准 worklist 拆成 generated child Tasks 并汇总 worklist-results。

## Run 入口

常用 API：

- `GET /v1/team/tasks`
- `POST /v1/team/tasks`
- `PATCH /v1/team/tasks/:taskId`
- `POST /v1/team/tasks/:taskId/archive`
- `POST /v1/team/tasks/:taskId/runs`
- `GET /v1/team/task-runs/:runId`
- `GET /v1/team/task-runs/:runId?view=summary&taskId=:taskId`
- `GET /v1/team/task-runs/:runId?view=process-summary&taskId=:taskId`
- `POST /v1/team/task-runs/:runId/cancel`

同一 Task 同时只允许一个 active run。不同 Task 可以并行运行。

## 连接

Typed Task connection 表达上游 output port 到下游 input port 的数据传递。Control dependency 表达一个 Task 成功后触发另一个 Task，不传递 typed artifact。

常用 API：

- `GET /v1/team/task-connections`
- `POST /v1/team/task-connections`
- `DELETE /v1/team/task-connections/:connectionId`
- `GET /v1/team/task-dependencies`
- `POST /v1/team/task-dependencies`
- `DELETE /v1/team/task-dependencies/:dependencyId`

## Group

Group 是多个 Task 的后端 definition。Team Console 只保存 Group 的展示态，权威 membership 来自主服务 API。

常用 API：

- `GET /v1/team/task-groups`
- `POST /v1/team/task-groups`
- `PATCH /v1/team/task-groups/:groupId`
- `POST /v1/team/task-groups/:groupId/archive`
- `POST /v1/team/task-groups/:groupId/runs`
- `GET /v1/team/task-group-runs/:groupRunId`
- `POST /v1/team/task-group-runs/:groupRunId/cancel`

## Artifact

Canvas Task role session 会收到：

- `ARTIFACT_PUBLIC_DIR`
- `ARTIFACT_PUBLIC_BASE_URL`

需要交付给用户或 checker 的文件写入 public output 目录，并用 `/v1/team/task-runs/:runId/artifacts/:roleKey/:role/...` 形式访问。

## 验证

Team Runtime 相关改动至少运行：

```powershell
node --test --test-concurrency=1 --import tsx test\team-*.test.ts
npm --prefix apps/team-console run test
npm --prefix apps/team-console run build
npx tsc --noEmit
```
