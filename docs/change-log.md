# 更新记录

更新时间：`2026-06-14`

本文件只保留当前 Windows Core 版本之后的高层变更记录。迁移前的旧项目名、Docker 部署、独立 Team Console dev server、旧端口和容器路径相关流水已从本文移除；需要考古时使用 Git 历史：

```powershell
git log -- docs/change-log.md
git show <commit>:docs/change-log.md
```

## 记录规则

- 只记录影响外部行为、运行方式、接口、文档结构或协作约定的变更。
- 单条记录写清日期、主题、影响范围、对应入口和关键验证。
- 不记录长命令输出、临时排障过程、一次性 UI 微调直播和旧环境运行笔记。
- 当前运行事实以 `README.md`、`.env.native.example`、平台 native 文档和真实代码为准。

## 2026-06-14 - Git 克隆版网页更新器

- **主题**: 新增 `/playground/update`，面向 Git 克隆部署提供网页检查更新、`git pull --ff-only origin main` 和依赖安装入口。
- **影响范围**: `src/system/clone-updater.ts`、`src/routes/system-update.ts`、`src/ui/update-page.ts`、`src/routes/playground.ts`、`src/server.ts`、`README.md`。
- **行为说明**: 本地代码改动会阻止自动更新；`.data/`、`logs/`、`node_modules/`、`.env.native` 等运行态产物会保留；更新完成后需要重启服务。
- **安全要求**: 更新接口会执行 `git` 和 `npm`，公网部署必须依赖反向代理、云防火墙、IP 白名单或上游认证控制访问。
- **验证建议**: `node --test --test-concurrency=1 --import tsx test\clone-updater.test.ts test\system-update-routes.test.ts test\system-update-page.test.ts test\server.test.ts`、`npx tsc --noEmit`、`git diff --check`。

## 2026-06-14 - MCP 管理支持公网部署场景

- **主题**: 移除 Agent MCP 管理 API 的本机来源限制，使公网部署、局域网部署和反向代理入口可以直接添加、更新、测试 MCP server。
- **影响范围**: `src/routes/agent-mcp.ts`、`test/agent-mcp-routes.test.ts`、`README.md`、`docs/native-windows-core.md`。
- **安全要求**: MCP 配置可能包含本机命令、路径、headers 和 Bearer token；公网部署必须依赖反向代理、云防火墙、IP 白名单或上游认证控制访问。
- **验证建议**: `node --test --test-concurrency=1 --import tsx test\agent-mcp-routes.test.ts`、`npx tsc --noEmit`、`git diff --check`。

## 2026-06-14 - Agent MCP 支持 HTTP transport

- **主题**: Agent 级 MCP catalog 新增远程 HTTP transport，不再要求用户为公网 MCP（如远程 OCR）写本地 stdio bridge。stdio 行为完全保留。
- **影响范围**: `src/agent/mcp-server-catalog.ts`（transport union + 校验）、`src/agent/mcp-client-manager.ts`（StreamableHTTPClientTransport + 错误脱敏）、`src/types/api.ts`（body union）、`src/ui/agents-page.ts`（transport 选择 + URL/headers UI）、`src/routes/agent-mcp.ts`（test/错误响应脱敏兜底）、`test/fixtures/mcp-http-server.mjs`（新增 HTTP fixture）。
- **配置入口**: `/playground/agents` 的 MCP 面板，Transport 选择 `http` 后填写 URL + Headers + timeoutMs；运行态文件仍为 `.data/agent/mcp/servers.json` 与 `.data/agents/<agentId>/mcp/servers.json`。
- **安全要求**: headers 是敏感运行态配置，仓库示例一律用 `<token>` 占位；client 与 route 层在错误响应里把疑似 Bearer token / 长 base64 串替换为 `[redacted]`；HTTP transport 默认明文，生产建议 HTTPS 或反向代理 + IP 白名单 + token 轮换。
- **对应文档**: `docs/native-windows-core.md` 的 Agent MCP 章节已补充 stdio / http 双 transport 示例与安全要求。
- **验证记录**: `node --test --test-concurrency=1 --import tsx test\agent-mcp-catalog.test.ts test\agent-mcp-client-manager.test.ts test\agent-mcp-routes.test.ts test\agent-mcp-page-ui.test.ts test\agent-mcp-tool.test.ts`（41 用例全绿）、`npx tsc --noEmit`、`git diff --check`。

## 2026-06-14 - macOS/Linux native runtime 入口

- **主题**: 新增 macOS/Linux 本机部署入口，README 改为平台选择器；Windows 仍是当前稳定基线。
- **影响范围**: native doctor 平台检测、POSIX 端口清理、macOS/Linux 启动器、平台 npm scripts、macOS/Linux 独立安装文档和 native runtime 治理文档。
- **对应入口**: `UGK-Mini-Agent-Launcher.command`、`UGK-Mini-Agent-Launcher.sh`、`UGK-Mini-Agent-Set-Port.command`、`UGK-Mini-Agent-Set-Port.sh`、`docs/native-macos.md`、`docs/native-linux.md`。
- **验证建议**: `node --test --test-concurrency=1 --import tsx test\native-*.test.ts test\project-guard.test.ts`、`npx tsc --noEmit`、`git diff --check`；macOS/Linux 仍需真机执行对应平台 doctor 和 launcher。

## 2026-06-13 - CDP/browser 功能面清理

- **主题**: 移除开发期遗留 CDP/browser 功能面，Windows Core 当前不再内置浏览器注册表、CDP 控制路由、浏览器绑定 bash、browser scope cleanup、Agent/Conn/Team browser binding 配置。
- **影响范围**: `/v1/browsers` API、`src/browser/*`、Playground browser workbench、Agent profile `defaultBrowserId`、Conn `browserId` / `browser_id`、Team/Background agent browser scope 注入、`apps/team-console` 前端契约和展示、相关 `.pi/skills` 和运行文档。
- **对应入口**: `src/server.ts`、`src/agent/*`、`src/routes/*`、`src/ui/*`、`src/types/api.ts`、`docs/plans/2026-06-13-cdp-browser-surface-removal-review.md`。
- **验证记录**: 精确旧关键词扫描 0 命中；`node --test --test-concurrency=1 --import tsx test\no-cdp-surface.test.ts`、Agent/Conn/UI/Team focused suites、`npx tsc --noEmit`、`git diff --check` 均通过。

## 2026-06-13 - Agent 级 MCP 管理

- **主题**: 新增 Agent 作用域 MCP server 管理和运行时注入。MCP server 和 Skill 一样属于 Agent profile，Chat、Conn 和 Team Task 使用某个 Agent profile 时只获得该 profile 已启用的 MCP。
- **影响范围**: Agent profile 运行态目录、Agent 管理台、`/v1/agents/:agentId/mcp/servers` API、前台/后台 Agent session 工厂、Team/Conn profile 执行链路。
- **配置入口**: `/playground/agents` 的 MCP 面板，运行态文件 `.data/agent/mcp/servers.json` 和 `.data/agents/<agentId>/mcp/servers.json`。
- **验证建议**: `node --test --test-concurrency=1 --import tsx test\agent-mcp-catalog.test.ts test\agent-mcp-client-manager.test.ts test\agent-mcp-tool.test.ts test\agent-mcp-routes.test.ts test\agent-mcp-page-ui.test.ts`、`npx tsc --noEmit`、在 Agent 管理台测试本地 stdio MCP server。

## 2026-06-13 - OCR MCP 自包含入口复验

- **主题**: 本地 OCR MCP 改为通过项目自带 `run_mcp.cmd` 启动，UGK 侧只配置 command、cwd、空 args 和较长 timeout，不再在 UGK 配置中拼接 PaddleOCR 预加载命令。
- **影响范围**: Agent MCP 文档示例、Windows 本机运行说明、OCR MCP runtime 需求记录；本机 `main` Agent 的 `.data/agent/mcp/servers.json` 已写入运行态配置但不提交。
- **对应入口**: `README.md`、`docs/native-windows-core.md`、`docs/plans/2026-06-13-ocr-mcp-runtime-requirements.md`。
- **验证记录**: `AgentMcpClientManager.testServer()` 返回 `ok: true` 且列出 `ocr_recognize`；`AgentMcpClientManager.callTool()` 调用本地图像返回 `isError: false`。

## 2026-06-13 - MCP review hardening

- **主题**: 收口 MCP 管理面的 review 风险：5xx 错误不回显底层路径、catalog 写操作按文件串行化、UI 支持 env 编辑并避免保存/测试重入。
- **影响范围**: `/v1/agents/:agentId/mcp/servers` API、Agent MCP catalog、Agent 管理台 MCP 面板、通用错误响应和 MCP 安全文档。
- **对应入口**: `src/routes/agent-mcp.ts`、`src/agent/mcp-server-catalog.ts`、`src/ui/agents-page.ts`、`src/routes/http-errors.ts`、`README.md`、`docs/native-windows-core.md`。
- **验证记录**: `node --test --test-concurrency=1 --import tsx test\agent-mcp-catalog.test.ts test\agent-mcp-client-manager.test.ts test\agent-mcp-tool.test.ts test\agent-mcp-routes.test.ts test\agent-mcp-page-ui.test.ts`、`npx tsc --noEmit`、`git diff --check`。

## 2026-06-13 - Windows Core 配置化收口

- **主题**: 清理旧版部署口径，Windows 本机部署默认单端口由 `.env.native` / `.env.native.example` 驱动，Team Console / Canvas 通过主服务 `/playground/team` 同源提供。
- **影响范围**: README、native runtime 配置、doctor/supervisor、artifact 交付、Browser 默认实例、`.pi/skills` 中会影响 agent 行为的本地地址说明。
- **配置入口**: `.env.native.example`、`UGK_DATA_DIR`、`UGK_LOG_DIR`、`UGK_TOOLS_DIR`、`PUBLIC_BASE_URL`、`HOST`、`PORT`。
- **验证建议**: `npm run native:doctor`、`npm run native:start`、打开 `$BASE_URL/playground/team`。
