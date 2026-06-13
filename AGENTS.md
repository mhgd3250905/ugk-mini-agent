# ugk-claw-core-win Agent Guide

## 沟通

- 默认使用简体中文回复用户。
- 命令、代码、路径、日志和报错保持原始语言。

## 项目定位

`ugk-claw-core-win` 是 Windows 本机部署版 UGK CLAW Core。

默认能力：

- Fastify 主服务、Playground、REST/SSE API
- Agent 会话、历史、profile、模型源
- 文件、资产、artifact 交付
- Conn worker 与 Conn SQLite
- Team Console / Canvas Task runtime
- Team worker

扩展能力通过用户技能安装。默认用户技能目录为 `runtime/skills-user/`。

## 默认运行

- 主服务：`http://127.0.0.1:8888`
- Team Console / Canvas：`http://127.0.0.1:9999`
- 预检：`npm run native:doctor`
- 启动：`npm run native:start`

`native:start` 启动主服务、Team Console、Team worker 和 Conn worker，并把日志写入 `logs/native/`。

## 关键文件

- 服务入口：`src/server.ts`
- 配置：`src/config.ts`
- Agent 服务：`src/agent/agent-service.ts`
- Session 工厂：`src/agent/agent-session-factory.ts`
- Conn worker：`src/workers/conn-worker.ts`
- Team worker：`src/workers/team-worker.ts`
- Team Console：`apps/team-console/`
- Windows runtime config：`scripts/native-runtime-config.mjs`
- Windows doctor：`scripts/native-doctor-core.mjs`
- Windows supervisor：`scripts/native-supervisor.mjs`
- Windows 运行文档：`docs/native-windows-core.md`

## 开发规则

- 修改范围保持聚焦，代码风格跟随现有实现。
- 优先使用现有 helper、route pattern 和测试风格。
- 搜索使用 `rg` / `rg --files`。
- 手工编辑使用 `apply_patch`。
- Agent profile 操作走 API 或 catalog helper。
- `.env.native`、`.data/`、`logs/`、生成报告和本地密钥属于运行态数据。

## 验证

Windows Core 相关改动至少运行：

```powershell
node --test --test-concurrency=1 --import tsx test\native-*.test.ts
npx tsc --noEmit
git diff --check
```

涉及主服务、Conn、Team 或 UI 的改动，补跑对应测试文件。
