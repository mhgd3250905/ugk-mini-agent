# 贡献指南

感谢参与 UGK Mini Agent 开发。请在开始前阅读 [README.md](README.md) 了解项目全貌，阅读 [docs/architecture-governance-guide.md](docs/architecture-governance-guide.md) 了解模块边界和禁区。

## 环境准备

详见 [README.md](README.md#环境要求) 环境要求与安装步骤。

首次配置：

```powershell
npm install
npm --prefix apps/team-console install
npm run native:doctor
```

## 分支策略

| 前缀 | 用途 | 示例 |
| --- | --- | --- |
| `feature/` | 新功能 | `feature/mcp-proxy` |
| `docs/` | 文档优化 | `docs/optimize-readme-and-guides` |
| `fix/` | Bug 修复 | `fix/conn-worker-leak` |
| `hotfix/` | 紧急修复 | `hotfix/sse-disconnect` |
| `refactor/` | 重构（不改变外部行为） | `refactor/chat-route-helpers` |

从 `main` 切出分支，完成后创建 PR 合回 `main`。

## 代码风格

- **跟随现有实现**：无 lint 配置，以周边代码为准。
- **TypeScript 严格模式**：所有 `.ts` 文件必须通过 `npx tsc --noEmit`。
- **ESM**：项目使用 `"type": "module"`，`import` 使用 `.js` 扩展名。
- **命名**：文件用 `kebab-case`，类型/类用 `PascalCase`，变量/函数用 `camelCase`。
- **不添加注释**，除非用户明确要求。

## 提交规范

```
<type>: <subject>

[optional body]
```

| type | 说明 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档变更 |
| `refactor` | 重构（不改外部行为） |
| `test` | 测试相关 |
| `chore` | 构建/工具/配置 |

示例：`feat: Add MCP proxy tool`、`fix: Prevent duplicate loading bubbles`、`docs: Update README with API index`

## 测试要求

按改动范围运行对应测试（完整矩阵见 [docs/architecture-test-matrix.md](docs/architecture-test-matrix.md)）：

| 改动范围 | 最小验证 |
| --- | --- |
| 配置/启动脚本 | `test\native-*.test.ts` + `tsc --noEmit` |
| 主服务/路由 | `test\server.test.ts` + 相关 route focused tests |
| Agent/Assets | `test\agent-*.test.ts` + `test\file-artifacts.test.ts` |
| Team Runtime | `test\team-*.test.ts` |
| Team Console UI | `npm --prefix apps/team-console test -- --run` + `build` |
| Conn Worker | `test\conn-*.test.ts` |
| 文档/口径 | `test\project-guard.test.ts` |

提交前必跑：

```powershell
npx tsc --noEmit
git diff --check
```

## PR 提交前检查清单

- [ ] 代码通过 `npx tsc --noEmit`
- [ ] `git diff --check` 无空白错误
- [ ] 按改动范围运行了对应测试
- [ ] 没有提交运行态数据（`.env.native`、`.data/`、`logs/`、截图、报告、密钥）
- [ ] 没有引入硬编码端口、路径或主机名（可通过 env/config 覆盖）
- [ ] 影响外部用户首次部署的改动已同步更新 `README.md` 和 `.env.native.example`
- [ ] 影响 Team Console 的改动入口仍为 `/playground/team` 同源

## 禁区

以下来自 [docs/architecture-governance-guide.md](docs/architecture-governance-guide.md)：

- 不恢复旧独立控制台端口、旧主服务端口或独立 Vite dev server。
- 不写死本机仓库路径、用户目录、容器目录、root 目录或 home shorthand。
- 不要求外部用户安装 Docker 才能使用 Windows Core 默认路径。
- 不手写运行态 JSON 绕过 API 或 catalog helper。
- 不提交 `.data/`、`logs/`、截图、报告、临时 HTML 或本地密钥。

## 文档更新规则

改动影响以下任一方面时，必须同步更新对应文档：

| 影响面 | 必须更新 |
| --- | --- |
| 外部行为、接口、运行方式 | `README.md` |
| 环境变量、端口、目录结构 | `README.md` + `.env.native.example` + `docs/native-windows-core.md` |
| 模块边界、架构决策 | `docs/architecture-governance-guide.md` |
| 测试入口 | `docs/architecture-test-matrix.md` |
| Agent 协作约定 | `AGENTS.md` |
