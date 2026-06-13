# Playground

Playground 是 UGK Mini Agent 的主对话界面，随主服务运行在当前 `$BASE_URL` 下：

```text
$BASE_URL/playground
```

## 当前能力

- Agent 对话、流式输出、打断、续跑和队列消息
- 多会话历史、最近窗口恢复和向上补页
- Agent profile 管理、模型源选择和上下文用量查看
- 文件上传、文件库、asset 引用和 `send_file` 文件交付
- Conn 后台任务管理和任务消息页
- Team Console 入口

用户技能目录默认为空。网页检索和企业 IM 通过用户技能或外部扩展按需安装。

## UI 结构

- `src/routes/playground.ts`：路由入口
- `src/ui/playground-page-shell.ts`：页面 shell
- `src/ui/playground.ts`：前端主脚本装配
- `src/ui/playground-styles.ts`：核心样式
- `src/ui/playground-conversation-*`：会话和历史同步
- `src/ui/playground-agent-manager.ts`：Agent 管理
- `src/ui/playground-conn-activity*`：Conn 和任务消息

## 会话

会话权威状态来自主服务：

- `GET /v1/chat/state`
- `GET /v1/chat/history`
- `GET /v1/chat/status`
- `GET /v1/chat/conversations`
- `POST /v1/chat/conversations`
- `POST /v1/chat/current`

前端使用 ownership token 和 `AbortController` 控制异步回包落地资格。会话切换、新建和历史补页都以当前 conversation id 为准。

## 文件与资产

上传文件进入当前消息。已入库资产通过文件库复用，发送给 agent 时作为 `assetRefs` 进入 prompt asset resolver。

本地 artifact 路径会按主服务公开入口转换为 HTTP 链接。用户可见链接使用当前 `PUBLIC_BASE_URL` 或请求 host 推导值。

## Conn

Conn 是后台定时 / 周期 / 延迟执行能力。Windows Core 默认投递目标是任务消息页：

```json
{ "type": "task_inbox" }
```

Conn 可以执行普通 agent prompt，也可以执行后端已有 Team Group：

```json
{ "type": "team_group", "groupId": "..." }
```

## Team Console

Team Console 固定入口：

```text
$BASE_URL/playground/team
```

Playground 只提供入口和 Agent iframe 支撑，Canvas Task 的具体画布交互见 `apps/team-console/README.md` 和 `docs/team-runtime.md`。

## 验证

Playground 相关改动至少运行：

```powershell
node --test --test-concurrency=1 --import tsx test\server.test.ts test\playground-*.test.ts
npx tsc --noEmit
git diff --check
```
