# ugk-mini-agent

UGK Mini Agent 是一个面向 Windows 本机部署的轻量 agent runtime。

默认运行形态是本机 Node.js 多进程：主服务、Team worker 和 Conn worker。Team Console 会构建为主服务静态页面，用户技能目录默认保持为空，按部署需要自行安装扩展技能。

## 环境要求

- Windows 10/11
- Node.js 22 或更新版本
- Git for Windows，包含 `Git\bin\bash.exe`
- Python 3.11 或 3.12

## 默认入口

入口以 `.env.native` / `.env.native.example` 中的 `PUBLIC_BASE_URL`、`HOST`、`PORT` 为准：

- 主服务 / API / Playground：`$BASE_URL`
- Team Console / Canvas：`$BASE_URL/playground/team`

## 安装与启动

```powershell
npm install
npm --prefix apps/team-console install
npm run native:doctor
npm run native:start
```

`npm run native:start` 会启动：

- `ugk-mini-agent-server`
- `ugk-mini-agent-team-worker`
- `ugk-mini-agent-conn-worker`

启动主服务前会自动执行 `npm run team-console:build`，把 Canvas 前端构建到主服务路由下。

日志写入 `logs/native/`。

首次启动后访问 `$BASE_URL/playground/model-sources` 新增 API 源。初始运行态不预置任何 provider 或 API key。

## 用户技能

默认用户技能目录是 `runtime/skills-user/`，初始只保留 `.gitkeep`。

浏览器自动化、网页检索、企业 IM 等能力按部署场景作为扩展技能安装到 `runtime/skills-user/` 或指定 agent profile 的技能目录。

## 常用命令

```powershell
npm run native:doctor
npm run native:start
npm test
npx tsc --noEmit
npm run team-console:test
```

## 本地数据

运行态数据默认写入 `.data/`：

- `.data/agent`：会话、资产、Conn SQLite、模型设置
- `.data/agents`：自定义 agent profile
- `.data/team`：Team / Canvas run state

可通过 `UGK_DATA_DIR`、`UGK_LOG_DIR`、`UGK_TOOLS_DIR` 覆盖数据、日志和本地工具缓存目录；不设置时使用项目内默认路径。

本地配置、运行数据、日志、生成报告和模型密钥不进入版本库。
