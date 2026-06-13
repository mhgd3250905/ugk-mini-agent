# ugk-claw-core-win Agent Guide

> 项目全景文档见 [README.md](README.md)。本文件只记录 AI Agent 协作规则。

## 沟通

- 默认使用简体中文回复用户。
- 命令、代码、路径、日志和报错保持原始语言。

## 关键文件

| 职责 | 路径 |
| --- | --- |
| 服务入口 | `src/server.ts` |
| 配置 | `src/config.ts` |
| Agent 服务 | `src/agent/agent-service.ts` |
| Session 工厂 | `src/agent/agent-session-factory.ts` |
| Conn worker | `src/workers/conn-worker.ts` |
| Team worker | `src/workers/team-worker.ts` |
| Team Console | `apps/team-console/` |
| Runtime config | `scripts/native-runtime-config.mjs` |
| Doctor | `scripts/native-doctor-core.mjs` |
| Supervisor | `scripts/native-supervisor.mjs` |
| 运行文档 | `docs/native-windows-core.md` |
| 验证矩阵 | `docs/architecture-test-matrix.md` |
| 治理指南 | `docs/architecture-governance-guide.md` |

## 开发规则

- 修改范围保持聚焦，代码风格跟随现有实现。
- 优先使用现有 helper、route pattern 和测试风格。
- 搜索使用 `rg` / `rg --files`。
- 手工编辑使用 `apply_patch`。
- Agent profile 操作走 API 或 catalog helper。
- `.env.native`、`.data/`、`logs/`、生成报告和本地密钥属于运行态数据，不提交。

## 验证

Windows Core 相关改动至少运行：

```powershell
node --test --test-concurrency=1 --import tsx test\native-*.test.ts
npx tsc --noEmit
git diff --check
```

涉及主服务、Conn、Team 或 UI 的改动，按改动范围对照 [docs/architecture-test-matrix.md](docs/architecture-test-matrix.md) 补跑对应测试。
