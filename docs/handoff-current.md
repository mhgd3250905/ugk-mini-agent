# 当前交接快照

更新时间：`2026-06-13`

这份文档只保留当前接手所需事实。历史流水、旧计划和旧部署排障记录不要再塞回本文；需要追溯时使用 Git 历史或专题源码测试。

## 当前部署口径

- 项目名：`ugk-mini-agent` / Windows 本机部署版 `ugk-claw-core-win`。
- 默认入口：`$BASE_URL`，由 `.env.native` / `.env.native.example` 的 `PUBLIC_BASE_URL`、`HOST`、`PORT` 推导。
- Team Console / Canvas：`$BASE_URL/playground/team`。
- 默认不依赖旧独立控制台端口、独立 Vite dev server、容器编排或容器路径。
- 运行态目录默认在仓库内，可通过 `UGK_DATA_DIR`、`UGK_LOG_DIR`、`UGK_TOOLS_DIR` 覆盖。

## 接手先读

1. `AGENTS.md`
2. `README.md`
3. `.env.native.example`
4. `docs/native-windows-core.md`
5. `docs/team-runtime.md`
6. `docs/runtime-assets-conn-feishu.md`

## 关键入口

- 服务入口：`src/server.ts`
- 配置入口：`src/config.ts`
- Windows runtime config：`scripts/native-runtime-config.mjs`
- Windows doctor：`scripts/native-doctor-core.mjs`
- Windows supervisor：`scripts/native-supervisor.mjs`
- Team Console：`apps/team-console/`
- Team runtime：`src/team/`
- Conn worker：`src/workers/conn-worker.ts`

## 当前验证基线

Windows Core 相关改动至少运行：

```powershell
node --test --test-concurrency=1 --import tsx test\native-*.test.ts
npx tsc --noEmit
git diff --check
```

涉及 Team Console、Conn、Browser 或 UI 的改动，补跑对应 focused tests。实际命令以改动范围和当前失败上下文为准。
