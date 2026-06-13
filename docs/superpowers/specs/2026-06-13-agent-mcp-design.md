# Agent Scoped MCP Design

## 背景

UGK Mini Agent 当前基于 `@mariozechner/pi-coding-agent@0.70.6`，底仓没有内置 MCP。Pi 官方文档明确把 MCP 视为可通过 extension/custom tool 扩展的能力，而不是核心内建能力。项目已经在 `ProjectBackgroundSessionFactory` 里通过 `customTools` 给后台 agent session 注入工具，因此 MCP 应以项目侧模块接入，不 fork pi-coding-agent。

MCP 官方协议把应用分为 Host、Client、Server 三层。我们的主服务是 Host，每个 agent session 拥有自己的 MCP Client 连接，外部或本地 MCP server 提供 tools/resources/prompts。MCP 官方传输包含 stdio 与 Streamable HTTP；本项目第一版优先支持 stdio，覆盖 Windows 本机部署与用户本地 server。

用户本地示例 `E:\AII\ugk-qr-scan` 是 Python FastMCP server，暴露 `ocr_recognize` 工具。协议测试确认它可以通过 stdio `tools/list` 返回工具 schema，且工具参数 schema 为 `{ "params": OCRInput }`，因此调用层必须保留 JSON 原生参数结构，不能拍平或转成字符串。

参考来源：

- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- MCP transport spec: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
- MCP specification: https://modelcontextprotocol.io/specification/2025-03-26
- Pi docs: https://pi.dev/
- Pi MCP Adapter design notes: https://nicobailon-pi-mcp-adapter.mintlify.app/introduction

## 目标

第一版目标是让 MCP 像 skill 一样属于 agent profile：

- Agent 管理台可以为每个 agent 独立增删改查 MCP server。
- Chat、Conn worker、Team worker 使用某个 agent profile 时，只注入该 agent 的 MCP server。
- 不同 agent 的 MCP 配置、状态和工具列表彼此隔离。
- MCP 调用能够正常运行，至少支持本地 stdio server 的 `tools/list` 与 `tools/call`。
- MCP 调用必须有 timeout、取消和进程清理，避免卡死主服务、conn worker 或 team worker。
- 设计保持解耦，MCP catalog、client manager、proxy tool、route、UI 各自职责清晰。

## 非目标

第一版不做这些能力：

- 不把每个 MCP tool 直接注册为模型可见工具。
- 不实现 OAuth。
- 不实现 config import。
- 不把 resources/prompts 注入 agent 上下文。
- 不把 MCP server 做成全局共享默认能力。
- 不做远程多租户权限模型；当前仍是 Windows 本机部署。

这些能力可作为后续 P1/P2 增强。

## 推荐方案

采用单个 `mcp` 代理工具，而不是直接注册所有 MCP tools。

原因：

- Pi 的上下文策略偏向精简。多个 MCP server 的 tool schema 会迅速膨胀上下文。
- 代理工具可以按需 `list_tools`、`describe_tool`、`call_tool`，保持模型上下文稳定。
- 代理工具天然支持 agent scoped server 过滤，不会把其他 agent 的 MCP 暴露给当前 session。
- 代理工具可以统一做 timeout、错误格式化、进程清理和审计事件。

## 数据模型

每个 agent profile 拥有一个 MCP catalog 文件：

```text
.data/agents/<agentId>/mcp/servers.json
```

`main` agent 为兼容现有主 agent 数据目录，使用：

```text
.data/agent/mcp/servers.json
```

文件结构：

```json
{
  "schemaVersion": "agent/mcp-servers-1",
  "servers": [
    {
      "serverId": "qr-ocr",
      "name": "QR/OCR MCP",
      "description": "本机 PaddleOCR MCP server",
      "enabled": true,
      "transport": {
        "type": "stdio",
        "command": "E:\\AII\\ugk-qr-scan\\venv\\Scripts\\python.exe",
        "args": ["E:\\AII\\ugk-qr-scan\\ocr_mcp_server.py"],
        "cwd": "E:\\AII\\ugk-qr-scan",
        "env": {}
      },
      "timeoutMs": 180000,
      "createdAt": "2026-06-13T00:00:00.000Z",
      "updatedAt": "2026-06-13T00:00:00.000Z"
    }
  ]
}
```

规则：

- `serverId` 使用 `^[a-z][a-z0-9-]{0,62}$`。
- `name` 必填，最多 80 字符。
- `description` 可选，最多 500 字符。
- `transport.type` 第一版只允许 `stdio`。
- `command` 必填，不写入项目默认值；UI 由用户输入。
- `args` 为字符串数组，保持顺序。
- `cwd` 可选；如果填写，必须是绝对路径。
- `env` 可选，第一版按本机运行态明文保存变量名和值；不要填写长期密钥，后续可扩展 secret reference。
- `timeoutMs` 默认 120000，允许 1000 到 600000。

## API

新增 route 文件 `src/routes/agent-mcp.ts`，所有 API 都是 agent scoped。

```text
GET    /v1/agents/:agentId/mcp/servers
POST   /v1/agents/:agentId/mcp/servers
PATCH  /v1/agents/:agentId/mcp/servers/:serverId
DELETE /v1/agents/:agentId/mcp/servers/:serverId
POST   /v1/agents/:agentId/mcp/servers/:serverId/test
GET    /v1/agents/:agentId/mcp/servers/:serverId/tools
```

响应原则：

- 未知 agent 返回 404，不回退到 main。
- agent 被 active Team run 锁住时，变更类 API 返回 409。
- agent 有 running conversation 时，变更类 API 返回 409，避免 session 中途变更工具边界。
- `test` 会启动 MCP server、initialize、list tools，然后关闭连接和子进程。
- `tools` 可优先使用缓存；无缓存时连接 server 获取工具列表并写入 cache。

## 运行集成

`BackgroundAgentProfileResolver` 构建 snapshot 时读取当前 agent 的 MCP catalog，并写入：

```ts
mcpServers: Array<{
  serverId: string;
  name: string;
  description?: string;
  enabled: boolean;
  transport: { type: "stdio"; command: string; args: string[]; cwd?: string; env?: Record<string, string> };
  timeoutMs: number;
}>
```

`ProjectBackgroundSessionFactory` 根据 snapshot 创建 `mcp` custom tool：

- snapshot 没有 enabled MCP server 时不注入 `mcp` 工具。
- snapshot 有 enabled MCP server 时注入一个代理工具。
- tool prompt snippet 明确：先 `list_tools`，再按工具 schema 原样传 `arguments`。

Chat 手动会话也应通过 agent profile 的 session factory 注入同一 MCP tool，保证 Chat、Conn、Team 行为一致。

## MCP 代理工具

工具名：`mcp`

参数：

```json
{
  "action": "list_servers",
  "serverId": "qr-ocr",
  "toolName": "ocr_recognize",
  "arguments": {}
}
```

约束：

- `list_servers` 不需要 `serverId`。
- `list_tools` 需要 `serverId`。
- `call_tool` 需要 `serverId`、`toolName` 和 `arguments`。
- `arguments` 必须原样传给 MCP server，不做字符串化。

返回：

- 成功返回 JSON 文本，包含 `ok: true`、server、tools 或 content。
- MCP tool content 可能包含 text/image/resource；第一版保留原始 content 数组，并为 text content 提供 `text` 聚合。
- 失败返回 JSON 文本，包含 `ok: false`、`error`、`serverId`、`toolName`。

## Client Manager

新增 `src/agent/mcp-client-manager.ts`。

职责：

- 根据 server config 创建 MCP client。
- 支持 stdio transport。
- 按 agentId/serverId 管理连接。
- 支持 `listTools`、`callTool`、`testServer`。
- 支持 timeout 和 abort signal。
- 调用结束后更新 `lastSeenAt`、`lastError`、tool cache。
- close 时确保 stdio 子进程退出。

生命周期：

- 第一版采用 per call 连接，调用结束关闭。这样最稳，避免 OCR 这类长时 server 残留。
- 后续 P1 可改成 lazy keep-alive + idle timeout。

## 管理界面

在 `src/ui/agents-page.ts` 的 Agent 详情页增加 MCP 面板，与 Skill 面板并列：

- 折叠态显示 MCP server 数量和启用数量。
- 展开后显示 server 列表。
- 每个 server 显示名称、ID、启用状态、transport、command 摘要、最近错误。
- 支持新增、编辑、删除、启用/禁用、测试连接、查看工具列表。
- 新增/编辑表单字段：
  - Server ID
  - 名称
  - 描述
  - 启用
  - Command
  - Args，每行一个参数
  - CWD
  - Timeout ms

UI 不预置 `E:\AII\ugk-qr-scan`，但文档提供本机验证示例。

## 测试策略

后端单测：

- `test/agent-mcp-catalog.test.ts`
  - CRUD
  - agent 隔离
  - malformed serverId 拒绝
  - main/custom agent catalog path
  - enabled filtering
- `test/agent-mcp-routes.test.ts`
  - scoped routes
  - unknown agent 404
  - active team lock 409
  - running conversation 409
  - test endpoint 成功与失败
- `test/agent-mcp-client-manager.test.ts`
  - mock stdio MCP server list/call
  - 参数保持 boolean/number/object
  - timeout
  - cleanup
- `test/agent-mcp-tool.test.ts`
  - list_servers/list_tools/call_tool
  - disabled server 不暴露
  - unknown server/tool 错误格式
- `test/background-agent-profile.test.ts`
  - snapshot 带入 agent scoped MCP server
  - 不同 agent 隔离
- `test/background-agent-session-factory.test.ts`
  - 有 MCP server 时注入 `mcp`
  - 无 MCP server 时不注入

前端静态测试：

- `test/agents-page-routes.test.ts` 或新增 `test/agent-mcp-page-ui.test.ts`
  - `/playground/agents` 包含 MCP 管理区域文案和 API 路径。

本机集成验证：

```powershell
npm run native:doctor
npm run native:start
```

在 Agent 管理台添加 stdio server：

```text
serverId: qr-ocr
command: E:\AII\ugk-qr-scan\venv\Scripts\python.exe
args:
E:\AII\ugk-qr-scan\ocr_mcp_server.py
cwd: E:\AII\ugk-qr-scan
timeoutMs: 300000
```

测试连接应列出 `ocr_recognize`。调用时参数应使用：

```json
{
  "params": {
    "image_path": "E:\\AII\\ugk-qr-scan\\测试图片.png",
    "lang": "ch",
    "border": 30
  }
}
```

## 风险与处理

- OCR MCP 调用时间长：第一版提供 server/call timeout，UI 显示测试进行中与失败原因。
- Windows stdio 子进程残留：client manager 必须在 success/error/timeout 路径 close transport。
- 参数 schema 复杂：第一版不做 UI schema 表单生成，只展示 JSON schema 和 JSON 参数输入。
- secret 泄露：第一版 `env` 明文保存仅适合本机；文档标注不要填真实长期密钥，P1 做 secret reference。
- tool schema 上下文膨胀：采用单代理工具，不直接注册所有 MCP tools。

## 设计自检

- 没有把 MCP 做成全局能力，满足 agent 隔离要求。
- 没有 fork pi-coding-agent，符合底仓扩展模型。
- 第一版只实现 stdio tools，范围足够小，可测试。
- UI、API、catalog、runtime 分层明确。
- 本地示例路径只出现在验证说明，不作为代码默认值。
