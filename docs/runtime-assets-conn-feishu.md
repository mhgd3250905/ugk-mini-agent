# Runtime / Assets / Conn

更新时间：`2026-06-13`

本文记录 Windows Core 当前仍有效的运行态资产、文件交付和 Conn 约定。旧 Docker、Feishu worker、公网回调、旧端口、容器路径和固定本机仓库路径说明已移除；这些内容不再作为外部用户从 0 到 1 部署的指引。

## 当前运行态目录

- 数据目录默认：仓库内 `.data/`，可用 `UGK_DATA_DIR` 覆盖。
- 日志目录默认：仓库内 `logs/`，可用 `UGK_LOG_DIR` 覆盖。
- 便携工具目录默认：仓库内 `runtime/tools/`，可用 `UGK_TOOLS_DIR` 覆盖。
- 模型设置默认从 `UGK_DATA_DIR` 派生，可用 `UGK_MODEL_SETTINGS_PATH` 覆盖。

## 文件与资产

- 用户上传走 `POST /v1/assets/upload`。
- 资产元数据走 `GET /v1/assets`、`DELETE /v1/assets/:assetId`。
- agent 产物优先通过 `send_file` 或 artifact public 目录交付。
- 用户可见链接不应暴露本机绝对路径、`file://`、临时目录或容器路径。

关键入口：

- `src/agent/asset-store.ts`
- `src/agent/file-artifacts.ts`
- `src/agent/agent-file-history.ts`
- `src/routes/files.ts`
- `.pi/extensions/send-file.ts`

## Artifact 交付协议

`src/agent/file-artifacts.ts` 会向 agent 注入产物交付协议：

- 正式产物写入 `ARTIFACT_PUBLIC_DIR`。
- 用户可打开链接使用 `ARTIFACT_PUBLIC_BASE_URL`。
- `send_file` 用于真实文件交付。
- legacy container 路径只作为兼容输入尽量改写，不是新任务推荐路径。

## Conn 运行约定

- Conn worker 负责后台 run 领取、执行、输出索引和通知 best-effort。
- Conn 输出应写入本轮 output 目录，并通过 `/v1/conns/.../output/...` 或相应公开路由访问。
- Conn 私有状态写入运行态数据目录，不写入项目源码目录。
- 不要把通知失败升级成后台 run 失败，除非业务合同明确要求。

关键入口：

- `src/workers/conn-worker.ts`
- `src/agent/background-agent-runner.ts`
- `src/agent/conn-store.ts`
- `src/agent/conn-sqlite-store.ts`
- `src/routes/conns.ts`

## Feishu 状态

Feishu 相关能力不属于当前 Windows Core 默认从 0 到 1 部署路径。若后续恢复为可选扩展，应新增独立扩展文档，并明确所需配置、禁用默认值、验证命令和失败降级策略。
