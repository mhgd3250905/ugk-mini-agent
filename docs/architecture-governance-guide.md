# 架构治理接手指南

更新时间：`2026-06-13`

这份文档是当前 Windows Core 仓库的治理入口。旧版 Docker、云服务器、独立 Team Console dev server 和历史审计流水已清理；当前事实以代码、测试、`README.md`、`.env.native.example` 和 `docs/native-windows-core.md` 为准。

## 先读顺序

| 任务 | 先读 |
| --- | --- |
| 全新接手 | `AGENTS.md`、`README.md`、`.env.native.example`、`docs/native-windows-core.md` |
| Windows 本机部署 | `docs/native-windows-core.md`、`scripts/native-runtime-config.mjs`、`scripts/native-doctor-core.mjs` |
| Team Console / Canvas | `docs/team-runtime.md`、`apps/team-console/README.md` |
| Playground UI | `docs/playground-current.md`、`docs/playground-ui-governance-map.md` |
| Chat / Agent | `docs/agent-chat-governance-map.md`、`src/routes/chat.ts`、`src/agent/agent-service.ts` |
| Conn / Assets | `docs/runtime-assets-conn-feishu.md`、`src/workers/conn-worker.ts`、`src/routes/conns.ts` |
| 验证矩阵 | `docs/architecture-test-matrix.md` |

## 模块边界速查

| 模块 | 应该负责 | 不应该负责 |
| --- | --- | --- |
| `src/server.ts` | 依赖创建、路由注册、组合根 | 业务状态机和运行细节 |
| `src/config.ts` | 运行配置解析、可覆盖默认值 | 固定用户目录或固定部署机路径 |
| `scripts/native-runtime-config.mjs` | Windows native runtime 环境拼装 | 写死端口、工具路径或数据目录 |
| `src/routes/*` | HTTP 参数解析、状态码、响应体、调用 service | 长生命周期编排 |
| `src/agent/*` | Agent 会话、资产、历史、profile、模型解析 | UI 细节 |
| `src/workers/*` | 后台 worker 领取和执行 | 前台页面状态 |
| `apps/team-console/` | Team Console / Canvas UI | 依赖独立固定端口运行 |

## 修改前检查清单

1. 这次改动属于文档、route、service、worker、UI、部署还是运行态？
2. 是否引入端口、主机名、目录、工具路径或公网地址？如果是，必须能通过 env/config 覆盖。
3. 是否影响外部用户 clone 后首次部署？如果影响，同步更新 `README.md`、`.env.native.example` 或 `docs/native-windows-core.md`。
4. 是否影响 Team Console / Canvas？默认入口应保持 `/playground/team` 同源。
5. 是否触碰运行态目录？`.env.native`、`.data/`、`logs/`、runtime 产物和密钥不要提交。
6. 对应最小验证是什么？先查 `docs/architecture-test-matrix.md`。

## 禁区

- 不要恢复旧独立控制台端口、旧主服务端口或独立 Vite dev server 作为部署前提。
- 不要写死本机仓库路径、用户目录、容器目录、root 目录或 home shorthand。
- 不要让外部用户必须安装 Docker 才能使用 Windows Core 默认路径。
- 不要手写运行态 JSON 绕过 API 或 catalog helper。
- 不要把 `.data/`、`logs/`、截图、报告、临时 HTML 或本地密钥纳入提交。
