# 近期功能与 Git 版本审阅报告

## 结论

当前可给同事审核的主线版本是：

```text
branch: main
remote: origin/main
commit: d7f99619
tag: stable/agent-mcp-2026-06-13
remote: https://github.com/mhgd3250905/ugk-mini-agent.git
```

该版本已完成两个主要阶段：

1. Windows 本机部署配置化收口。
2. Agent 级 MCP 管理、调用和运行时注入。

当前工作区所在分支是：

```text
branch: docs/optimize-readme-and-guides
HEAD: 6d342fdd
```

该分支是文档优化分支，没有包含 `main` 上 `d7f99619` 的完整 MCP 主线提交。审核功能实现时，应以 `main` / `stable/agent-mcp-2026-06-13` 为准。

## 版本线

### 稳定基线一：Windows Native Core

```text
tag: stable/windows-native-core-2026-06-13
commit: 48300278
subject: Use relative routes for root entry points
```

用途：

- 作为 Windows 本机部署配置化收口后的稳定基线。
- 根页面、README 和静态入口改为相对路由，不再要求用户记固定端口。

### 稳定基线二：Agent MCP

```text
tag: stable/agent-mcp-2026-06-13
commit: d7f99619
subject: Mark MCP implementation pushed
```

用途：

- 作为 Agent 级 MCP 管理能力完成后的稳定版本。
- 已推送到 `origin/main`。

## 近期主线提交

从 `stable/windows-native-core-2026-06-13` 到 `stable/agent-mcp-2026-06-13` 的主线提交如下：

```text
d7f99619 Mark MCP implementation pushed
61eb03d1 Document agent scoped MCP setup
005c09c3 Use configured base URL in artifact rewrite tests
3cdad737 Honor MCP server request timeouts
07a48edb Use route-based entry docs and root links
6ab50b7b Add MCP management to agent console
8b969ae1 Add agent MCP management API
0e4bf92b Inject agent MCP proxy into sessions
120ac2bb Add MCP proxy tool
99b5361d Use relative routes in entry docs
9641206c Add MCP stdio client manager
43663659 Add agent scoped MCP catalog
b0945477 Plan agent scoped MCP support
```

## 已实现功能

### 1. Windows 本机部署配置化收口

状态：已进入 `main`，已作为 `stable/windows-native-core-2026-06-13` 基线。

主要变化：

- Windows 本机部署改为配置驱动。
- 主服务、Team Console / Canvas 统一通过主服务路由访问。
- 根页面和 README 使用相对路由跳转，避免页面写死 `8888`、`9999` 等端口。
- `native:doctor`、`native:start` 以 `.env.native` / `.env.native.example` 为配置来源。
- agent 行为相关文档和技能说明清理固定公网地址、固定本机路径、固定端口口径。

重点审核文件：

```text
README.md
.env.native.example
docs/native-windows-core.md
src/config.ts
src/server.ts
src/ui/public-site.ts
scripts/native-doctor*.mjs
scripts/native-supervisor.mjs
scripts/native-runtime-config.mjs
```

### 2. Agent 作用域 MCP Catalog

状态：已进入 `main`。

主要变化：

- MCP server 配置归属到 Agent profile。
- 支持全局默认 MCP catalog 和单 Agent MCP catalog。
- MCP server 配置包括 server id、名称、命令、参数、cwd、timeout、enabled 等字段。
- 不把用户本机 OCR 路径写死到运行时默认值。

重点审核文件：

```text
src/agent/mcp-server-catalog.ts
src/agent/agent-profile.ts
test/agent-mcp-catalog.test.ts
test/agent-profile.test.ts
```

### 3. Stdio MCP Client Manager

状态：已进入 `main`。

主要变化：

- 新增基于官方 MCP SDK 的 stdio client manager。
- 支持 `tools/list` 和 `tools/call`。
- 支持 server 级 timeout。
- 支持进程清理和调用失败隔离。

重点审核文件：

```text
src/agent/mcp-client-manager.ts
test/agent-mcp-client-manager.test.ts
test/fixtures/mcp-stdio-server.mjs
```

### 4. Agent 内置 `mcp` 代理工具

状态：已进入 `main`。

主要变化：

- 新增 Agent 可调用的 `mcp` proxy tool。
- Agent 不直接暴露任意 MCP 工具，而是通过统一 `mcp` 工具代理调用。
- 支持按 server id 列工具、调用工具、返回错误信息。

重点审核文件：

```text
src/agent/mcp-tool.ts
test/agent-mcp-tool.test.ts
```

### 5. Chat / Conn / Team 运行时注入

状态：已进入 `main`。

主要变化：

- Agent session factory 会根据当前 Agent profile 注入 MCP proxy tool。
- Foreground Chat、Conn background session、Team role session 使用对应 profile 的 MCP 配置。
- Agent template snapshot 纳入 MCP 配置，避免运行时 profile 变化无法感知。

重点审核文件：

```text
src/agent/agent-session-factory.ts
src/agent/background-agent-session-factory.ts
src/agent/background-agent-profile.ts
src/agent/agent-template-registry.ts
src/server.ts
test/agent-session-factory.test.ts
test/background-agent-session-factory.test.ts
test/background-agent-profile.test.ts
test/agent-template-registry.test.ts
```

### 6. MCP 管理 API

状态：已进入 `main`。

主要变化：

- 新增 Agent 作用域 MCP REST API。
- 路由形态：

```text
/v1/agents/:agentId/mcp/servers
```

- 支持 MCP server CRUD。
- 支持 test connection。
- 支持 tools list。
- 已在 `src/server.ts` 注册路由。

重点审核文件：

```text
src/routes/agent-mcp.ts
src/types/api.ts
src/server.ts
test/agent-mcp-routes.test.ts
```

### 7. Agent 管理台 MCP 面板

状态：已进入 `main`。

主要变化：

- `/playground/agents` 新增 MCP 管理面板。
- 支持新增、刷新、保存 MCP server 配置。
- 支持查看 Agent 隔离 MCP 配置。
- 支持测试连接和查看工具列表。

重点审核文件：

```text
src/ui/agents-page.ts
test/agent-mcp-page-ui.test.ts
```

### 8. 文档与入口更新

状态：已进入 `main`。

主要变化：

- README 补充 Agent MCP 使用说明。
- Windows Native 文档补充 MCP 配置方式。
- `docs/change-log.md` 新增 Agent 级 MCP 管理记录。
- 根页面和 README 链接改为路由跳转，不引导用户指定固定端口。

重点审核文件：

```text
README.md
docs/native-windows-core.md
docs/change-log.md
src/ui/public-site.ts
docs/plans/2026-06-13-agent-mcp-todo.md
```

## 验证记录

主线计划文件 `main:docs/plans/2026-06-13-agent-mcp-todo.md` 记录以下验证项已完成：

```text
Validate local ugk-qr-scan server through stdio MCP using the preloaded OCR startup command.
Validate agent can call ocr_recognize through the mcp proxy tool path.
Run targeted MCP tests.
Run agent/chat/conn/team regression tests.
Run npx tsc --noEmit.
Run git diff --check.
Confirm no local MCP path is hardcoded in runtime defaults.
```

建议同事复核时重新执行：

```powershell
node --test --test-concurrency=1 --import tsx test\agent-mcp-catalog.test.ts test\agent-mcp-client-manager.test.ts test\agent-mcp-tool.test.ts test\agent-mcp-routes.test.ts test\agent-mcp-page-ui.test.ts
node --test --test-concurrency=1 --import tsx test\agent-session-factory.test.ts test\background-agent-session-factory.test.ts test\background-agent-profile.test.ts test\agent-template-registry.test.ts
npx tsc --noEmit
git diff --check
```

Windows 本机部署复核建议：

```powershell
npm install
npm --prefix apps/team-console install
npm run native:doctor
npm run native:start
```

启动后通过根页面路由进入：

```text
/
/playground
/playground/team
/playground/agents
```

## 当前工作区注意事项

当前工作区不在 `main`，而在：

```text
docs/optimize-readme-and-guides
```

该分支相比 `main` 额外有：

```text
6d342fdd docs: Optimize README, guides, and add CONTRIBUTING
```

该提交主要是文档优化：

```text
AGENTS.md
CLAUDE.md
CONTRIBUTING.md
README.md
docs/architecture-governance-guide.md
docs/native-windows-core.md
docs/traceability-map.md
test/project-guard.test.ts
```

当前工作区还有未提交文档：

```text
docs/plans/2026-06-13-ocr-mcp-runtime-requirements.md
docs/plans/2026-06-13-recent-feature-git-review-report.md
```

其中 OCR MCP runtime requirements 是给 OCR MCP 同事处理 GPU runtime 自包含启动问题的需求文档，不属于 UGK 主线 MCP 功能实现本身。

## 审核重点

建议同事重点看以下问题：

1. Agent MCP 配置是否严格按 Agent profile 隔离。
2. `mcp` proxy tool 是否避免越权调用未启用 server。
3. stdio MCP 子进程 timeout、cleanup、stderr/stdout 分离是否足够稳。
4. Team / Conn / foreground Chat 是否都通过同一套 profile snapshot 获取 MCP 配置。
5. README 和页面入口是否仍存在固定端口、固定本机路径、固定公网地址误导。
6. `.data/`、`.env.native`、本地 OCR 路径是否没有被写入默认 runtime。
7. MCP UI 是否只是配置入口，不承担第三方服务 GPU runtime 修复职责。

## 已知后续事项

1. OCR MCP 的 Paddle GPU DLL 问题应由 OCR MCP 项目提供自包含 launcher 解决，详见：

```text
docs/plans/2026-06-13-ocr-mcp-runtime-requirements.md
```

2. 当前 `docs/optimize-readme-and-guides` 分支和 `main` 有分叉；如果要继续基于最新功能开发，建议先切回 `main` 或把文档分支按需 rebase/merge 到 `main`。

3. 如果同事审核的是功能实现，请直接审核 `main` / `stable/agent-mcp-2026-06-13`，不要以当前文档分支为准。
