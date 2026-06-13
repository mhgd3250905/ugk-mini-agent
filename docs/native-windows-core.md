# UGK Mini Agent for Windows — 深度技术参考

← 返回 [README.md](../README.md)

本文档聚焦 Windows 本机运行时的环境推导、进程拓扑和扩展点。安装、启动和页面入口见 [README.md](../README.md)。

## 进程拓扑

普通用户优先使用仓库根目录的 `UGK-Mini-Agent-Launcher.cmd`。需要修改端口时，使用 `UGK-Mini-Agent-Set-Port.cmd`。

启动器会：

- 读取当前 `.env.native` 端口；`Set-Port` 入口允许输入新端口。
- 持久化 `HOST`、`PORT`、`PUBLIC_BASE_URL` 到 `.env.native`。
- 检测所选端口的监听进程；如被旧服务占用，会自动结束占用进程。
- 使用 `scripts/native-supervisor.mjs` 拉起 native 运行时，避免误用 `npm run start` 导致模型配置回退。

调试时可直接运行：

```powershell
node scripts\native-launcher.mjs --port 9999 --dry-run
```

`npm run native:start` 通过 `scripts/native-supervisor.mjs` 启动 3 个进程：

| 进程 | 入口 | 职责 |
| --- | --- | --- |
| `ugk-mini-agent-server` | `src/server.ts` | Fastify 主服务：Playground、REST/SSE API、Team Console 静态资源 |
| `ugk-mini-agent-team-worker` | `src/workers/team-worker.ts` | 轮询 `.data/team/` 中的 run state，执行 Canvas Task |
| `ugk-mini-agent-conn-worker` | `src/workers/conn-worker.ts` | 领取并执行 Conn 后台/定时/周期任务 |

启动前自动执行 `npm run team-console:build` 构建 Canvas 前端到 `apps/team-console/dist/`。日志写入 `UGK_LOG_DIR`（默认 `logs/native/`），每个进程独立日志文件。

## 环境变量推导链

配置优先级（高 → 低）：进程环境变量 > `.env.native` > `loadDefaultNativeEnvSync()`。

| 变量 | 默认值 | 来源 | 说明 |
| --- | --- | --- | --- |
| `HOST` | `127.0.0.1` | `.env.native` | 监听地址 |
| `PORT` | `8888` | `.env.native` | 主服务端口 |
| `PUBLIC_BASE_URL` | `http://$HOST:$PORT` | 自动推导 | 对外基础 URL，支持显式覆盖 |
| `UGK_DATA_DIR` | `.data` | config | 运行数据根目录 |
| `UGK_LOG_DIR` | `logs/native` | supervisor | Supervisor 日志目录 |
| `UGK_TOOLS_DIR` | `$UGK_DATA_DIR/tools` | config | 本地工具缓存 |
| `TEAM_RUNTIME_ENABLED` | `true` | `.env.native` | Team runtime 开关 |
| `TEAM_USE_MOCK_RUNNER` | `false` | 环境变量 | Team mock runner（仅测试） |
| `UGK_MODEL_SETTINGS_PATH` | `$UGK_DATA_DIR/agent/model-settings.json` | config | 运行时模型选择文件 |

配置推导核心代码：`scripts/native-runtime-config.mjs` → `buildNativeRuntimeConfig()`。

## 目录覆盖

所有运行态目录可通过环境变量重定向：

```
UGK_DATA_DIR=.data          → 会话、资产、Conn SQLite、模型设置
  ├── agent/                 → 会话、资产、Conn SQLite
  │   ├── model-settings.json
  │   └── model-providers.json
  │   └── mcp/servers.json     → main Agent 的 MCP server 配置
  ├── agents/                → 自定义 agent profile
  │   └── <agentId>/user-skills/  → per-agent 技能
  │   └── <agentId>/mcp/servers.json  → per-agent MCP server 配置
  ├── team/                  → Canvas Task run state
  ├── tools/                 → 本地工具缓存（UGK_TOOLS_DIR）
  └── audit/                 → 审计日志

UGK_LOG_DIR=logs/native      → supervisor 日志（每进程独立文件）
```

## 本地依赖

| 依赖 | 要求 | 检查方式 |
| --- | --- | --- |
| Node.js | 22+ | `native:doctor` 检查版本 |
| Git Bash | `Git\bin\bash.exe` | `native:doctor` 排斥 WSL shim |
| Python | 3.11 或 3.12 | `scripts/runtime-deps.mjs` 定位 |
| 服务端口 | 可用 | `native:doctor` 检查端口占用 |

预检命令：`npm run native:doctor`（源码：`scripts/native-doctor-core.mjs`）。

## 进程环境隔离

Supervisor 为子进程构建最小化环境：

- 保留系统路径：`SystemRoot`、`ComSpec`、`PATH`、`TEMP`、`USERPROFILE` 等。
- 透传密钥类变量：匹配 `/(?:API_KEY|TOKEN|SECRET|AUTH|PASSWORD)$/i`。
- 预置 `UGK_TOOLS_DIR/git/bin` 到 `PATH` 前部。
- 不继承完整 shell 环境，避免污染。

## Agent 级 MCP

MCP server 是 Agent profile 的运行态扩展，和 Skill 一样按 Agent 隔离：

- `main` Agent：`.data/agent/mcp/servers.json`
- 自定义 Agent：`.data/agents/<agentId>/mcp/servers.json`
- Chat、Conn 和 Team Task 使用某个 Agent profile 时，只注入该 profile 已启用的 MCP server。

管理入口在 `/playground/agents` 的 MCP 面板。API 入口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET/POST` | `/v1/agents/:agentId/mcp/servers` | 列表 / 新增 |
| `PATCH/DELETE` | `/v1/agents/:agentId/mcp/servers/:serverId` | 更新 / 删除 |
| `POST` | `/v1/agents/:agentId/mcp/servers/:serverId/test` | 测试连接并缓存工具 |
| `GET` | `/v1/agents/:agentId/mcp/servers/:serverId/tools` | 查看工具列表 |

MCP 管理 API 只接受本机请求。stdio MCP server 可以启动本机命令；`HOST=0.0.0.0` 或反向代理场景必须先加认证和访问控制，不能把 MCP 管理入口裸露给 LAN 或公网客户端。

当前版本支持 stdio MCP server。示例配置：

```json
{
  "serverId": "local-tool",
  "name": "Local Tool",
  "enabled": true,
  "transport": {
    "type": "stdio",
    "command": "<path-to-runtime>",
    "args": ["<path-to-server-script>"],
    "cwd": "<path-to-server-project>"
  },
  "timeoutMs": 120000
}
```

本地命令、脚本路径、工作目录和密钥只属于运行态配置，不要提交到仓库。OCR/QR 这类模型型 MCP server 可能首次启动较慢，应调大 `timeoutMs`。GPU DLL 注入、模型预加载和启动预检应由 MCP 项目自己的启动入口处理，UGK 只配置这个入口：

```json
{
  "serverId": "local-ocr",
  "name": "Local OCR",
  "enabled": true,
  "transport": {
    "type": "stdio",
    "command": "<path-to-ocr-mcp-project>\\run_mcp.cmd",
    "args": [],
    "cwd": "<path-to-ocr-mcp-project>"
  },
  "timeoutMs": 300000
}
```

## LAN / 反向代理

默认绑定 `127.0.0.1`。对外暴露时：

```ini
# .env.native
HOST=0.0.0.0
PUBLIC_BASE_URL=https://your-domain.example
```

`PUBLIC_BASE_URL` 影响 artifact 链接、SSE 回调和前端资源引用。

MCP 管理入口不会接受非本机请求。如果需要跨机器管理 Agent profile，请在反向代理层加认证后再显式设计远程管理通道，不要直接暴露 `/v1/agents/:agentId/mcp/servers`。

## 验证

```powershell
node --test --test-concurrency=1 --import tsx test\native-*.test.ts
npx tsc --noEmit
git diff --check
```
