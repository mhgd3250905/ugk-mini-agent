# 架构验证矩阵

更新时间：`2026-06-13`

本矩阵只保留 Windows Core 当前有效的验证入口。迁移前的容器编排、旧端口和独立 Team Console dev server 验证口径已移除。

## Windows Core 基线

```powershell
node --test --test-concurrency=1 --import tsx test\native-*.test.ts
npx tsc --noEmit
git diff --check
```

## 配置 / 启动脚本

适用：`src/config.ts`、`scripts/native-*.mjs`、`.env.native.example`。

```powershell
node --test --test-concurrency=1 --import tsx test\native-*.test.ts test\config.test.ts
npx tsc --noEmit
git diff --check
```

## 主服务 / 路由

适用：`src/server.ts`、`src/routes/*`。

```powershell
node --test --test-concurrency=1 --import tsx test\server.test.ts
npx tsc --noEmit
git diff --check
```

按改动范围补跑对应 route focused tests。

## Agent / Assets / Browser

适用：`src/agent/*`、`src/browser/*`、`.pi/skills/*`。

```powershell
node --test --test-concurrency=1 --import tsx test\file-artifacts.test.ts test\browser-registry.test.ts test\agent-profile-ops-skill.test.ts test\background-agent-runner.test.ts
npx tsc --noEmit
git diff --check
```

## Team Runtime

适用：`src/team/*`、`src/workers/team-worker.ts`、Team routes。

```powershell
node --test --test-concurrency=1 --import tsx test\team-*.test.ts
npx tsc --noEmit
git diff --check
```

大型 Team 改动应按实际文件补跑更窄的 focused tests，避免只依赖全量慢跑结果。

## Team Console / Canvas

适用：`apps/team-console/*`。

```powershell
npm --prefix apps/team-console test -- --run
npm --prefix apps/team-console run build
npx tsc --noEmit
git diff --check
```

运行验证默认打开：

```text
$BASE_URL/playground/team
```

## Conn Worker

适用：`src/workers/conn-worker.ts`、`src/agent/conn-*`、`src/routes/conns.ts`。

```powershell
node --test --test-concurrency=1 --import tsx test\conn-*.test.ts
npx tsc --noEmit
git diff --check
```

## 文档 / 协作口径

适用：`README.md`、`docs/*`、`.env.native.example`、`.pi/skills/*`。

```powershell
node --test --test-concurrency=1 --import tsx test\project-guard.test.ts
git diff --check
```

必要时按当前任务关心的旧部署口径补充 `rg` 复扫；扫描范围优先覆盖 `README.md`、`docs/`、`.env.native.example`、`.pi/skills/` 和 `.codex/skills/`。
