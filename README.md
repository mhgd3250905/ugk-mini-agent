# UGK Mini Agent

UGK Mini Agent 是一个面向 Windows、macOS 和 Linux 本机部署的轻量 Agent Runtime。基于 Fastify + Node.js 多进程架构，提供 Agent 对话、Canvas Task 编排、Conn 后台任务和可扩展技能系统。

---

## 文档导航

| 文档 | 说明 |
| --- | --- |
| **README.md**（本文件） | 项目全景文档 |
| [AGENTS.md](AGENTS.md) | AI Agent 协作指南（沟通规则、关键文件、验证命令） |
| [CLAUDE.md](CLAUDE.md) | Claude Code 引导入口 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 开发贡献指南（分支策略、代码风格、PR 流程） |
| [docs/native-windows-core.md](docs/native-windows-core.md) | Windows 本机运行深度参考 |
| [docs/native-macos.md](docs/native-macos.md) | macOS 本机安装与启动 |
| [docs/native-linux.md](docs/native-linux.md) | Linux 本机安装与启动 |
| [docs/architecture-governance-guide.md](docs/architecture-governance-guide.md) | 架构治理接手指南 |
| [docs/architecture-test-matrix.md](docs/architecture-test-matrix.md) | 验证矩阵（按改动范围索引） |
| [docs/team-runtime.md](docs/team-runtime.md) | Team Runtime 技术文档 |
| [docs/playground-current.md](docs/playground-current.md) | Playground UI 文档 |
| [DESIGN.md](DESIGN.md) | UI 设计系统令牌 |

---

## 目录

- [平台指南](#平台指南)
- [共同运行方式](#共同运行方式)
- [页面入口](#页面入口)
- [架构总览](#架构总览)
- [API 端点索引](#api-端点索引)
- [开发与调试](#开发与调试)
- [技能扩展系统](#技能扩展系统)
- [项目结构](#项目结构)
- [本地数据](#本地数据)
- [常用命令速查](#常用命令速查)

---

## 平台指南

| Platform | Guide | Launcher |
| --- | --- | --- |
| Windows 10/11 | [Windows native guide](docs/native-windows-core.md) | `UGK-Mini-Agent-Launcher.cmd` |
| macOS | [macOS native guide](docs/native-macos.md) | `UGK-Mini-Agent-Launcher.command` |
| Linux | [Linux native guide](docs/native-linux.md) | `UGK-Mini-Agent-Launcher.sh` |

Windows 是当前稳定基线。macOS 和 Linux 使用各自的 doctor、launcher 和文档入口；底层服务、Team worker、Conn worker 和运行态目录保持同一套 native runtime。

## 共同运行方式

各平台首次 clone 后按上表进入对应指南安装依赖并执行平台 doctor。默认启动命令分别是：

| 平台 | Doctor | 启动 |
| --- | --- | --- |
| Windows | `npm run native:doctor` 或 `npm run native:doctor:win` | `npm run native:start` |
| macOS | `npm run native:doctor:mac` | `npm run native:start:mac` |
| Linux | `npm run native:doctor:linux` | `npm run native:start:linux` |

native 启动命令会启动以下进程：

| 进程 | 职责 |
| --- | --- |
| `ugk-mini-agent-server` | Fastify 主服务：Playground、REST/SSE API、Agent 会话、文件交付 |
| `ugk-mini-agent-team-worker` | Team / Canvas Task runtime worker |
| `ugk-mini-agent-conn-worker` | Conn 后台任务 worker |

启动主服务前会自动执行 `npm run team-console:build`，将 Canvas 前端构建为静态资源由主服务路由提供。日志写入 `logs/native/`。

首次启动后，访问根页面的"配置 API 源"或直接打开 `/playground/model-sources` 添加 API 源。初始运行态不预置任何 provider 或 API key。

## 页面入口

`npm run native:start` 会在终端打印当前服务地址（即 `$BASE_URL`，默认由 `.env.native` 的 `PUBLIC_BASE_URL` 决定）。通过页面按钮即可跳转，无需记忆固定端口：

| 入口 | 路由 | 说明 |
| --- | --- | --- |
| 根页面 | `/` | 导航首页 |
| Chat 工作台 | `/playground` | Agent 对话主界面 |
| Team Console / Canvas | `/playground/team` | 多任务画布编排 |
| API 源配置 | `/playground/model-sources` | 模型 provider 管理 |
| Agents 管理 | `/playground/agents` | Agent profile 管理 |
| 后台任务 | `/playground/conn` | Conn 任务消息页 |

## 架构总览

```
┌──────────────────────────────────────────────────────┐
│                    主服务 (Fastify)                    │
│                    src/server.ts                      │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────────┐ │
│  │ Playground│  │ REST API │  │   Team Console SPA  │ │
│  │   UI     │  │  /v1/*   │  │  /playground/team   │ │
│  └──────────┘  └──────────┘  └─────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Agent Service Layer                 │ │
│  │  Session · Profile Registry · Model Config      │ │
│  │  Asset Store · Conversation Store · Conn SQLite │ │
│  └─────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────┤
│                    Workers (独立进程)                   │
│  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │   Team Worker    │  │     Conn Worker          │  │
│  │ Canvas Task 执行  │  │ 后台/定时/周期任务执行    │  │
│  └──────────────────┘  └──────────────────────────┘  │
├──────────────────────────────────────────────────────┤
│                   扩展能力层                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Project     │  │ User Skills  │  │ Per-Agent   │  │
│  │ Skills      │  │ runtime/     │  │ Skills      │  │
│  │ .pi/skills/ │  │ skills-user/ │  │ .data/      │  │
│  └─────────────┘  └──────────────┘  └─────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 核心模块职责

| 模块 | 路径 | 职责 |
| --- | --- | --- |
| 服务入口 | `src/server.ts` | 依赖创建、路由注册、组合根 |
| 配置 | `src/config.ts` | 运行配置解析、路径解析 |
| Agent 服务 | `src/agent/agent-service.ts` | 会话管理、对话编排、run 生命周期 |
| Session 工厂 | `src/agent/agent-session-factory.ts` | pi-coding-agent 会话构建 |
| Profile 注册 | `src/agent/agent-service-registry.ts` | 多 Agent profile 注册与管理 |
| 模型配置 | `src/agent/model-config.ts` | 模型选择与验证 |
| Team/Canvas | `src/team/` | 多步骤任务编排（Task、Group、Run、Connection） |
| 路由层 | `src/routes/` | HTTP 参数解析、状态码、响应体 |
| Conn 后台 | `src/workers/conn-worker.ts` | 后台/定时任务领取与执行 |
| Team worker | `src/workers/team-worker.ts` | Canvas Task runtime 执行 |
| Team Console 前端 | `apps/team-console/` | Canvas SPA（React） |
| Native 脚本 | `scripts/native-*.mjs` | 本机运行时环境拼装、预检、进程管理 |

## API 端点索引

所有 API 以 `/v1` 为前缀。Chat 相关路由同时支持全局 `/v1/chat/*` 和 Agent 作用域 `/v1/agents/:agentId/chat/*` 两套并行路径。

### Chat / 对话

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/v1/chat/stream` | 流式对话（SSE） |
| `POST` | `/v1/chat` | 同步对话 |
| `POST` | `/v1/chat/queue` | 排队对话 |
| `POST` | `/v1/chat/interrupt` | 中断对话 |
| `POST` | `/v1/chat/reset` | 重置会话 |
| `GET` | `/v1/chat/state` | 会话状态 |
| `GET` | `/v1/chat/status` | 运行状态 |
| `GET` | `/v1/chat/history` | 对话历史 |
| `GET` | `/v1/chat/events` | 对话事件 SSE 流 |
| `GET/POST/DELETE/PATCH` | `/v1/chat/conversations` | 会话 CRUD |

Agent 作用域路径：将 `/v1/chat` 替换为 `/v1/agents/:agentId/chat`。

### Agent Profile

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/v1/agents` | Agent 列表 |
| `GET` | `/v1/agents/status` | 运行状态 |
| `POST` | `/v1/agents` | 创建 Agent |
| `PATCH` | `/v1/agents/:agentId` | 更新 Agent |
| `POST` | `/v1/agents/:agentId/archive` | 归档 Agent |
| `GET/POST/DELETE/PATCH` | `/v1/agents/:agentId/skills` | 技能管理 |
| `GET/POST/PATCH/DELETE` | `/v1/agents/:agentId/mcp/servers` | MCP server 管理 |
| `POST` | `/v1/agents/:agentId/mcp/servers/:serverId/test` | 测试 MCP 连接 |
| `GET` | `/v1/agents/:agentId/mcp/servers/:serverId/tools` | 查看 MCP 工具 |
| `GET/PATCH` | `/v1/agents/:agentId/rules` | 规则文件 |

### Team / Canvas

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET/POST` | `/v1/team/tasks` | Task 管理 |
| `POST` | `/v1/team/tasks/:taskId/runs` | 启动 Task run |
| `GET` | `/v1/team/task-runs/:runId` | Run 详情 |
| `POST` | `/v1/team/task-runs/:runId/cancel` | 取消 Run |
| `GET/POST/DELETE` | `/v1/team/task-connections` | Typed 连接管理 |
| `GET/POST/DELETE` | `/v1/team/task-dependencies` | Control 依赖管理 |
| `GET/POST` | `/v1/team/task-groups` | Group 管理 |
| `POST` | `/v1/team/task-groups/:groupId/runs` | 启动 Group run |
| `GET/POST` | `/v1/team/source-nodes` | Source 节点管理 |
| `GET/POST` | `/v1/team/plans` | 计划管理 |
| `GET` | `/v1/team/runs/:runId/events` | 运行事件 SSE 流 |
| `GET` | `/v1/team/runs/:runId/final-report` | 最终报告 |

完整 Team API 列表见 [docs/team-runtime.md](docs/team-runtime.md)。

### Conn / 后台任务

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET/POST` | `/v1/conns` | Conn 实例管理 |
| `POST` | `/v1/conns/:connId/run` | 触发运行 |
| `POST` | `/v1/conns/:connId/pause` | 暂停 |
| `POST` | `/v1/conns/:connId/resume` | 恢复 |
| `GET` | `/v1/conns/:connId/runs` | 运行列表 |
| `GET` | `/v1/conns/:connId/runs/:runId/events` | 运行事件 SSE |
| `GET` | `/v1/conns/:connId/runs/:runId/artifacts/*` | Artifact 文件 |

### 文件 / 资产

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/v1/assets` | 资产列表 |
| `POST` | `/v1/assets/upload` | 上传资产（multipart） |
| `GET` | `/v1/files/:fileId` | 按 ID 获取文件 |
| `GET` | `/v1/local-file?path=...` | 读取本地文件 |

### 模型源 / 通知 / 活动

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET/POST` | `/v1/model-sources` | 模型源管理 |
| `GET` | `/v1/model-config` | 当前模型配置 |
| `PUT` | `/v1/model-config/default` | 设置默认模型 |
| `GET` | `/v1/notifications/stream` | 通知 SSE 流 |
| `GET` | `/v1/activity` | 活动列表 |

## 开发与调试

### 开发模式

```powershell
npm run dev
```

使用 `tsx watch` 热重载主服务。Team Console 前端开发见 `apps/team-console/`。

### 日志

```powershell
# 查看 native 运行日志
Get-Content logs/native/ugk-mini-agent-server.log -Tail 50 -Wait
Get-Content logs/native/ugk-mini-agent-team-worker.log -Tail 50 -Wait
Get-Content logs/native/ugk-mini-agent-conn-worker.log -Tail 50 -Wait
```

### 运行时调试

| 端点 | 说明 |
| --- | --- |
| `GET /v1/debug/runtime` | 运行时信息 |
| `GET /v1/debug/skills` | 全局技能列表 |
| `GET /v1/agents/:agentId/debug/skills` | Agent 作用域技能列表 |
| `GET /healthz` | 健康检查 |

### 环境配置

核心配置通过 `.env.native` 管理（从 `.env.native.example` 复制）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 监听地址 |
| `PORT` | `8888` | 服务端口 |
| `PUBLIC_BASE_URL` | `http://127.0.0.1:$PORT` | 对外基础 URL |
| `UGK_DATA_DIR` | `.data` | 运行数据根目录 |
| `UGK_LOG_DIR` | `logs/native` | 日志目录 |
| `UGK_TOOLS_DIR` | `.data/tools` | 工具缓存目录 |
| `TEAM_RUNTIME_ENABLED` | `true` | Team runtime 开关 |

深入配置参考见对应平台指南：[Windows](docs/native-windows-core.md)、[macOS](docs/native-macos.md)、[Linux](docs/native-linux.md)。

## 技能扩展系统

UGK Mini Agent 支持三层技能目录，优先级从高到低：

| 层级 | 目录 | 说明 |
| --- | --- | --- |
| Per-Agent | `.data/agents/<agentId>/user-skills/` | 特定 Agent 专属技能 |
| User | `runtime/skills-user/` | 全局共享用户技能（默认空） |
| Project | `.pi/skills/` | 项目内置技能 |

默认用户技能目录初始只有 `.gitkeep`。网页检索、企业 IM 等能力按部署场景作为扩展技能安装。

## Agent 级 MCP

MCP server 和 Skill 一样属于 Agent profile。不同 Agent 的 MCP 配置独立存储；Chat、Conn 和 Team Task 使用某个 Agent profile 时，只会注入该 profile 已启用的 MCP server。

| Agent | MCP 配置位置 |
| --- | --- |
| `main` | `.data/agent/mcp/servers.json` |
| 自定义 Agent | `.data/agents/<agentId>/mcp/servers.json` |

在根页面进入“管理 Agent”，或打开 `/playground/agents`，在对应 Agent 的 MCP 面板中新增、编辑、禁用、删除、测试连接和查看工具。当前版本支持 stdio MCP server；本地命令、脚本路径、工作目录和密钥只写入运行态 `.data/`，不要提交到版本库。

MCP 管理 API 只接受本机请求。stdio MCP server 可以启动本机命令；如果把服务绑定到 `HOST=0.0.0.0` 或放到反向代理后面，必须先加认证和访问控制，不能把 MCP 管理入口裸露给 LAN 或公网客户端。

本地 OCR/QR 这类启动较慢的 MCP server 建议把 `timeoutMs` 设为较大的值。模型、GPU DLL、预加载等运行时细节应由 MCP 项目自己的启动入口封装；UGK 只配置该入口，例如：

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

## 项目结构

```
ugk-mini-agent/
├── src/
│   ├── server.ts              # 服务入口，组合根
│   ├── config.ts              # 运行配置
│   ├── agent/                 # Agent 服务层（会话/资产/模型/Conn）
│   ├── routes/                # HTTP 路由层（25 个模块）
│   ├── team/                  # Team/Canvas Task runtime（62 个模块）
│   ├── ui/                    # Playground 前端 UI
│   └── workers/               # 后台 worker（conn-worker, team-worker）
├── apps/
│   └── team-console/          # Team Console React SPA
├── scripts/
│   ├── native-runtime-config.mjs  # Native runtime 配置
│   ├── native-doctor-core.mjs     # 环境预检
│   ├── native-supervisor.mjs      # 多进程管理
│   └── native-env.mjs            # .env.native 加载器
├── test/                      # 测试文件
├── docs/                      # 文档
├── runtime/skills-user/       # 用户技能目录（默认空）
├── public/                    # 静态资源
├── .pi/skills/                # 项目内置技能
└── .env.native.example        # 环境配置模板
```

## 本地数据

运行态数据默认写入 `.data/`：

| 目录 | 内容 |
| --- | --- |
| `.data/agent/` | 会话、资产、Conn SQLite、模型设置 |
| `.data/agents/` | 自定义 agent profile |
| `.data/team/` | Team / Canvas run state |

可通过 `UGK_DATA_DIR`、`UGK_LOG_DIR`、`UGK_TOOLS_DIR` 覆盖；不设置时使用项目内默认路径。

本地配置、运行数据、日志、生成报告和模型密钥**不进入版本库**。

## 常用命令速查

```powershell
# 运行（Windows 稳定基线）
npm run native:doctor          # 环境预检
npm run native:start           # 启动全部服务

# 运行（macOS / Linux）
npm run native:doctor:mac
npm run native:start:mac
npm run native:doctor:linux
npm run native:start:linux

# 开发
npm run dev                    # 热重载主服务
npm run team-console:build     # 构建 Canvas 前端

# 测试
npm test                       # 全量测试
npx tsc --noEmit               # 类型检查
npm run team-console:test      # Team Console 测试

# Worker 单独运行
npm run worker:team            # Team worker
npm run worker:conn            # Conn worker
```

按改动范围查找最小验证命令，见 [docs/architecture-test-matrix.md](docs/architecture-test-matrix.md)。

---
---

# English

UGK Mini Agent is a lightweight Agent Runtime designed for Windows, macOS, and Linux native deployment. Built on Fastify + Node.js multi-process architecture, it provides Agent chat, Canvas Task orchestration, Conn background tasks, and an extensible skills system.

## Platform Guides

| Platform | Guide | Launcher |
| --- | --- | --- |
| Windows 10/11 | [Windows native guide](docs/native-windows-core.md) | `UGK-Mini-Agent-Launcher.cmd` |
| macOS | [macOS native guide](docs/native-macos.md) | `UGK-Mini-Agent-Launcher.command` |
| Linux | [Linux native guide](docs/native-linux.md) | `UGK-Mini-Agent-Launcher.sh` |

Windows is the current stable baseline. macOS and Linux use their own doctor commands, launchers, and setup docs while sharing the same server, Team worker, Conn worker, and native runtime layout.

## Shared Runtime Startup

```powershell
npm run native:doctor          # Windows
npm run native:start           # Windows
npm run native:doctor:mac      # macOS
npm run native:start:mac       # macOS
npm run native:doctor:linux    # Linux
npm run native:start:linux     # Linux
```

The native startup command launches these processes:

| Process | Responsibility |
| --- | --- |
| `ugk-mini-agent-server` | Fastify main service: Playground, REST/SSE API, Agent sessions, file delivery |
| `ugk-mini-agent-team-worker` | Team / Canvas Task runtime worker |
| `ugk-mini-agent-conn-worker` | Conn background task worker |

Before starting the server, the supervisor runs `npm run team-console:build` to build the Canvas frontend as static assets served by the main service. Logs are written to `logs/native/`.

After first startup, visit the root page and click "Configure API Sources" or open `/playground/model-sources` to add your API source. A fresh runtime starts with no model providers.

## Page Entry Points

`npm run native:start` prints the service URL (`$BASE_URL`, determined by `PUBLIC_BASE_URL` in `.env.native`). Navigate via on-page buttons—no need to memorize ports:

| Entry | Route | Description |
| --- | --- | --- |
| Root | `/` | Navigation home |
| Chat workspace | `/playground` | Main Agent chat interface |
| Team Console / Canvas | `/playground/team` | Multi-task canvas orchestration |
| API Sources | `/playground/model-sources` | Model provider management |
| Agents | `/playground/agents` | Agent profile management |
| Background Tasks | `/playground/conn` | Conn task inbox |

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                 Main Service (Fastify)                │
│                    src/server.ts                      │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────────┐ │
│  │ Playground│  │ REST API │  │   Team Console SPA  │ │
│  │   UI     │  │  /v1/*   │  │  /playground/team   │ │
│  └──────────┘  └──────────┘  └─────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Agent Service Layer                 │ │
│  │  Session · Profile Registry · Model Config      │ │
│  │  Asset Store · Conversation Store · Conn SQLite │ │
│  └─────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────┤
│                  Workers (separate processes)         │
│  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │   Team Worker    │  │     Conn Worker          │  │
│  │ Canvas Task exec │  │ Background/scheduled exec│  │
│  └──────────────────┘  └──────────────────────────┘  │
├──────────────────────────────────────────────────────┤
│                   Extension Layer                     │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Project     │  │ User Skills  │  │ Per-Agent   │  │
│  │ Skills      │  │ runtime/     │  │ Skills      │  │
│  │ .pi/skills/ │  │ skills-user/ │  │ .data/      │  │
│  └─────────────┘  └──────────────┘  └─────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Core Modules

| Module | Path | Responsibility |
| --- | --- | --- |
| Server entry | `src/server.ts` | Dependency assembly, route registration, composition root |
| Config | `src/config.ts` | Runtime config parsing |
| Agent Service | `src/agent/agent-service.ts` | Session management, chat orchestration, run lifecycle |
| Session Factory | `src/agent/agent-session-factory.ts` | pi-coding-agent session construction |
| Profile Registry | `src/agent/agent-service-registry.ts` | Multi-agent profile registration |
| Model Config | `src/agent/model-config.ts` | Model selection and validation |
| Team/Canvas | `src/team/` | Multi-step task orchestration (Task, Group, Run, Connection) |
| Routes | `src/routes/` | HTTP parameter parsing, status codes, response bodies |
| Conn Worker | `src/workers/conn-worker.ts` | Background/scheduled task pickup and execution |
| Team Worker | `src/workers/team-worker.ts` | Canvas Task runtime execution |
| Team Console | `apps/team-console/` | Canvas SPA (React) |
| Native Scripts | `scripts/native-*.mjs` | Native runtime env assembly, doctor, supervisor |

## API Endpoint Index

All APIs are prefixed with `/v1`. Chat routes support both global `/v1/chat/*` and agent-scoped `/v1/agents/:agentId/chat/*` paths.

### Chat / Conversation

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/v1/chat/stream` | Streaming chat (SSE) |
| `POST` | `/v1/chat` | Synchronous chat |
| `POST` | `/v1/chat/queue` | Queue message |
| `POST` | `/v1/chat/interrupt` | Interrupt current run |
| `POST` | `/v1/chat/reset` | Reset session |
| `GET` | `/v1/chat/state` | Session state |
| `GET` | `/v1/chat/status` | Run status |
| `GET` | `/v1/chat/history` | Chat history |
| `GET` | `/v1/chat/events` | Chat events SSE stream |
| `GET/POST/DELETE/PATCH` | `/v1/chat/conversations` | Conversation CRUD |

Agent-scoped path: replace `/v1/chat` with `/v1/agents/:agentId/chat`.

### Agent Profiles

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/v1/agents` | List agents |
| `GET` | `/v1/agents/status` | Runtime status |
| `POST` | `/v1/agents` | Create agent |
| `PATCH` | `/v1/agents/:agentId` | Update agent |
| `POST` | `/v1/agents/:agentId/archive` | Archive agent |
| `GET/POST/DELETE/PATCH` | `/v1/agents/:agentId/skills` | Skill management |
| `GET/POST/PATCH/DELETE` | `/v1/agents/:agentId/mcp/servers` | MCP server management |
| `POST` | `/v1/agents/:agentId/mcp/servers/:serverId/test` | Test MCP connection |
| `GET` | `/v1/agents/:agentId/mcp/servers/:serverId/tools` | Inspect MCP tools |
| `GET/PATCH` | `/v1/agents/:agentId/rules` | Rules file |

### Team / Canvas

| Method | Path | Description |
| --- | --- | --- |
| `GET/POST` | `/v1/team/tasks` | Task management |
| `POST` | `/v1/team/tasks/:taskId/runs` | Start task run |
| `GET` | `/v1/team/task-runs/:runId` | Run details |
| `POST` | `/v1/team/task-runs/:runId/cancel` | Cancel run |
| `GET/POST/DELETE` | `/v1/team/task-connections` | Typed connection management |
| `GET/POST/DELETE` | `/v1/team/task-dependencies` | Control dependency management |
| `GET/POST` | `/v1/team/task-groups` | Group management |
| `POST` | `/v1/team/task-groups/:groupId/runs` | Start group run |
| `GET/POST` | `/v1/team/source-nodes` | Source node management |
| `GET/POST` | `/v1/team/plans` | Plan management |
| `GET` | `/v1/team/runs/:runId/events` | Run events SSE stream |
| `GET` | `/v1/team/runs/:runId/final-report` | Final report |

Full Team API list: [docs/team-runtime.md](docs/team-runtime.md).

### Conn / Background Tasks

| Method | Path | Description |
| --- | --- | --- |
| `GET/POST` | `/v1/conns` | Conn instance management |
| `POST` | `/v1/conns/:connId/run` | Trigger run |
| `POST` | `/v1/conns/:connId/pause` | Pause |
| `POST` | `/v1/conns/:connId/resume` | Resume |
| `GET` | `/v1/conns/:connId/runs` | Run list |
| `GET` | `/v1/conns/:connId/runs/:runId/events` | Run events SSE |
| `GET` | `/v1/conns/:connId/runs/:runId/artifacts/*` | Artifact files |

### Files / Assets

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/v1/assets` | Asset list |
| `POST` | `/v1/assets/upload` | Upload asset (multipart) |
| `GET` | `/v1/files/:fileId` | Get file by ID |
| `GET` | `/v1/local-file?path=...` | Read local file |

### Model Sources / Notifications / Activity

| Method | Path | Description |
| --- | --- | --- |
| `GET/POST` | `/v1/model-sources` | Model source management |
| `GET` | `/v1/model-config` | Current model config |
| `PUT` | `/v1/model-config/default` | Set default model |
| `GET` | `/v1/notifications/stream` | Notification SSE stream |
| `GET` | `/v1/activity` | Activity list |

## Development & Debugging

### Development Mode

```powershell
npm run dev
```

Uses `tsx watch` for hot-reloading the main service. For Team Console frontend development, see `apps/team-console/`.

### Logs

```powershell
# Tail native runtime logs
Get-Content logs/native/ugk-mini-agent-server.log -Tail 50 -Wait
Get-Content logs/native/ugk-mini-agent-team-worker.log -Tail 50 -Wait
Get-Content logs/native/ugk-mini-agent-conn-worker.log -Tail 50 -Wait
```

### Runtime Debug Endpoints

| Endpoint | Description |
| --- | --- |
| `GET /v1/debug/runtime` | Runtime info |
| `GET /v1/debug/skills` | Global skills list |
| `GET /v1/agents/:agentId/debug/skills` | Agent-scoped skills list |
| `GET /healthz` | Health check |

### Environment Configuration

Core configuration is managed via `.env.native` (copy from `.env.native.example`):

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Listen address |
| `PORT` | `8888` | Service port |
| `PUBLIC_BASE_URL` | `http://127.0.0.1:$PORT` | External base URL |
| `UGK_DATA_DIR` | `.data` | Runtime data root |
| `UGK_LOG_DIR` | `logs/native` | Log directory |
| `UGK_TOOLS_DIR` | `.data/tools` | Tool cache directory |
| `TEAM_RUNTIME_ENABLED` | `true` | Team runtime toggle |

For in-depth configuration, see the platform guide: [Windows](docs/native-windows-core.md), [macOS](docs/native-macos.md), or [Linux](docs/native-linux.md).

## Skills Extension System

UGK Mini Agent supports a three-tier skill directory hierarchy, highest priority first:

| Tier | Directory | Description |
| --- | --- | --- |
| Per-Agent | `.data/agents/<agentId>/user-skills/` | Agent-specific skills |
| User | `runtime/skills-user/` | Shared user skills (empty by default) |
| Project | `.pi/skills/` | Built-in project skills |

The default user skill directory starts with only `.gitkeep`. Web search, IM integrations, and any external automation are installed as deployment-specific skills.

## Agent-Scoped MCP

MCP servers belong to an Agent profile, just like Skills. Each Agent has isolated MCP configuration; Chat, Conn, and Team Task sessions that use an Agent profile receive only that profile's enabled MCP servers.

| Agent | MCP config path |
| --- | --- |
| `main` | `.data/agent/mcp/servers.json` |
| Custom Agent | `.data/agents/<agentId>/mcp/servers.json` |

Use the root page "Agents" entry or open `/playground/agents`, then manage MCP servers from the selected Agent's MCP panel. The first version supports stdio MCP servers. Local commands, script paths, working directories, and secrets are runtime configuration stored under `.data/`; do not commit them.

The MCP management API accepts local requests only. A stdio MCP server can start local commands; if the service is bound to `HOST=0.0.0.0` or placed behind a reverse proxy, put authentication and access control in front of it before exposing MCP management to LAN or internet clients.

For slow local OCR/QR MCP servers, set a larger `timeoutMs`. Model, GPU DLL, and preload details should be hidden behind the MCP project's own launcher; UGK only points at that launcher:

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

## Project Structure

```
ugk-mini-agent/
├── src/
│   ├── server.ts              # Server entry, composition root
│   ├── config.ts              # Runtime config
│   ├── agent/                 # Agent service layer (sessions/assets/models/Conn)
│   ├── routes/                # HTTP route layer (25 modules)
│   ├── team/                  # Team/Canvas Task runtime (62 modules)
│   ├── ui/                    # Playground frontend UI
│   └── workers/               # Background workers (conn-worker, team-worker)
├── apps/
│   └── team-console/          # Team Console React SPA
├── scripts/
│   ├── native-runtime-config.mjs  # Native runtime config
│   ├── native-doctor-core.mjs     # Environment doctor
│   ├── native-supervisor.mjs      # Multi-process supervisor
│   └── native-env.mjs            # .env.native loader
├── test/                      # Test files
├── docs/                      # Documentation
├── runtime/skills-user/       # User skills directory (empty by default)
├── public/                    # Static assets
├── .pi/skills/                # Built-in project skills
└── .env.native.example        # Environment config template
```

## Local Data

Runtime data is written to `.data/` by default:

| Directory | Contents |
| --- | --- |
| `.data/agent/` | Sessions, assets, Conn SQLite, model settings |
| `.data/agents/` | Custom agent profiles |
| `.data/team/` | Team / Canvas run state |

Override with `UGK_DATA_DIR`, `UGK_LOG_DIR`, `UGK_TOOLS_DIR`; defaults to in-project paths when unset.

Local configuration, runtime data, logs, generated reports, and model keys are **not version-controlled**.

## Command Reference

```powershell
# Running (Windows stable baseline)
npm run native:doctor          # Environment pre-check
npm run native:start           # Start all services

# Running (macOS / Linux)
npm run native:doctor:mac
npm run native:start:mac
npm run native:doctor:linux
npm run native:start:linux

# Development
npm run dev                    # Hot-reload main service
npm run team-console:build     # Build Canvas frontend

# Testing
npm test                       # Full test suite
npx tsc --noEmit               # Type check
npm run team-console:test      # Team Console tests

# Standalone workers
npm run worker:team            # Team worker
npm run worker:conn            # Conn worker
```

For minimum verification commands by change scope, see [docs/architecture-test-matrix.md](docs/architecture-test-matrix.md).
