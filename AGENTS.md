This file provides the highest-level working rules for AI coding agents in this repository.

# ugk-pi Agent Guide

## 0. 渐进式披露阅读顺序

`AGENTS.md` 是接手索引，不是让 agent 一口气背完的小说。先按任务类型读最小集合，再按场景索引展开：

- 普通代码 / 文档修改：先读 `1-4`、`8.1`、`8.3`，再按第 `6` 节场景索引打开对应文件。
- 架构治理 / 重构评估：先读 `docs/architecture-governance-guide.md`，再按它指向的治理地图和测试矩阵展开。
- 功能完成 / 换 coding agent 前收尾：先读 `.codex/skills/feature-handoff/SKILL.md`，再补记录、验证结果、提交边界和交接说明。
- 云服务器增量更新：只读 `3.1` 的生产状态边界、`8.2`，然后进入 `docs/server-ops.md`；需要命令速查再看 `docs/server-ops-quick-reference.md`，只有迁移、回滚或异常排障才展开单云长手册。
- 本地 Docker 启动 / 重建 / 端口 / 运行态排障：先读 `docs/docker-local-ops.md`，再决定 `restart`、`up --build`、处理 orphan nginx 或检查 SQLite。
- Playground 前端修改：先读 `docs/playground-current.md` 和 `DESIGN.md`，再看第 `6.C` 场景文件；手机端不要按桌面压缩版推断。
- conn / Feishu / 后台任务：先看第 `6.G` 场景文件和 `docs/runtime-assets-conn-feishu.md`，不要先翻部署手册。
- Agent profile / 自定义 Agent：先看第 `6.F` 场景，运行态以 API 和 `/app/.data/agents` 挂载为准，不要手写 `profiles.json`。

### 0.1 本文件维护规则

`AGENTS.md` 是维护本仓库的高层接手契约，不是更新流水账。以后按这套规则办：

- **允许写入：** 沟通准则、行为准则、项目边界、当前稳定运行事实、固定运行口径、关键路径、场景索引、文档分层、编辑 / 部署 / 验证硬规则。
- **禁止写入：** 单次 UI 微调、发布流水账、排障过程、详细测试矩阵、长篇模块设计、已经有专门文档承载的细节。
- **细节去处：**
  - 架构治理：`docs/architecture-governance-guide.md`
  - 更新记录：`docs/change-log.md`
  - 开发任务收尾 / 换 agent 交接：`.codex/skills/feature-handoff/SKILL.md`
  - Playground 当前 UI：`docs/playground-current.md`
  - Conn / Activity / Feishu：`docs/runtime-assets-conn-feishu.md`
  - 本地 Docker / 运行态防踩坑：`docs/docker-local-ops.md`
  - 生产部署：`docs/server-ops.md` 和对应云手册
  - 按场景找代码：`docs/traceability-map.md`
- **新增规则门槛：** 只有跨多次任务、影响后续 agent 行为、或会造成高风险误操作的规则，才进 `AGENTS.md`。
- **过期规则处理：** 如果某条事实变成历史事实，迁到对应专题文档或 `docs/change-log.md`，不要继续堆在本文件里。

## 1. 通信准则

- 默认使用简体中文回复；只有用户明确要求英文时才切换。
- 命令、代码、日志、报错保持原始语言；其余解释用中文。

## 2. 行为准则

以下四条准则源自 Andrej Karpathy 对 LLM 编码常见陷阱的观察。
旨在减少 AI 编程 agent 的高频翻车行为。

**权衡说明：** 这些准则偏向谨慎优先于速度。
对于简单任务（修复 typo、显而易见的一行改动），用常识判断，不需要每次都全量执行。

### 2.1 先想再写 — Think Before Coding

**不要假设。不要隐藏困惑。展示权衡。**

实现之前：

- **明确说出你的假设。** 如果不确定，问。
- **如果存在多种解读方向，列出来** — 不要自己悄悄选一个。
- **如果有更简单的方案，说出来。** 该反对的时候要反对。
- **如果某件事不清楚，停下来。** 指出困惑点，提问。

> *"模型会替你做出错误假设，然后直接沿着它跑下去而不检查。它们不管理自己的困惑，不寻求澄清，不暴露不一致，不呈现权衡，在该反对的时候不反对。"* — Andrej Karpathy

### 2.2 简洁优先 — Simplicity First

**解决问题的代码量最少。不写投机性的扩展。**

- **不做需求以外的功能。**
- **不为只用一次的场景做抽象。**
- **不加没人要的"灵活性"或"可配置性"。**
- **不为不可能的路径写错误处理。**
- **如果写了 200 行但 50 行能搞定，重写。**

**自问：** 资深工程师会说这太复杂了吗？如果会，简化。

> *"它们特别喜欢过度复杂化代码和 API，膨胀抽象层，不清理死代码……用 1000 行实现一个臃肿的结构，而 100 行就够了。"* — Andrej Karpathy

### 2.3 外科手术式修改 — Surgical Changes

**只动你必须动的。只清理你自己留下的烂摊子。**

修改已有代码时：

- **不要顺手"改进"旁边的代码、注释或格式。**
- **不要重构没坏的东西。**
- **匹配现有风格**，哪怕你更喜欢另一种写法。
- **如果看到无关的死代码，提一句** — 不要删它。

当你的改动制造了孤儿代码：

- **删除你的改动导致不再使用的 import/变量/函数。**
- **不要删除已有的死代码，除非被要求。**

**检验标准：** 每一行改动都应能直接追溯到用户的请求。

> *"它们仍然会不充分理解就顺手改掉/删掉旁边的注释和代码，即使跟当前任务正交。"* — Andrej Karpathy

### 2.4 目标驱动执行 — Goal-Driven Execution

**定义成功标准。循环验证直到达标。**

把命令式任务转化为可验证的目标：

| 以前这么写 | 改成这样 |
|-----------|---------|
| "加校验" | "写无效输入的测试用例，然后让它通过" |
| "修 Bug" | "写一个能复现它的测试，然后让它通过" |
| "重构 X" | "确保重构前后测试都通过" |

多步骤任务给出简要计划：

```
1. [步骤] → 验证：[检查项]
2. [步骤] → 验证：[检查项]
3. [步骤] → 验证：[检查项]
```

**强有力的成功标准**让 LLM 能自主循环验证。
**模糊的标准**（"让它能工作"）需要不断澄清。

> *"LLM 在达到特定目标这件事上异常擅长……不要告诉它做什么，给它成功标准，看它自己跑。"
> — Andrej Karpathy*

### 2.5 效果验证

如果以下现象出现，说明这些准则在生效：

- **Diff 中的无关变更减少** — 只出现用户要求的改动
- **因过度复杂化导致的重写减少** — 第一次就写出简洁代码
- **澄清性问题出现在实现之前** — 而不是犯错之后
- **干净、精简的 PR** — 没有顺手重构或"顺便改进"

---

原仓库：https://github.com/forrestchang/andrej-karpathy-skills
原始出处：https://x.com/karpathy/status/2015883857489522876

---

## 3. 项目边界

- 这是基于 `pi-coding-agent` 的自定义 HTTP agent 原型，不是完整业务平台。
- 当前阶段优先目标：
  - 跑通并稳定 agent runtime
  - 稳定会话机制
  - 稳定 HTTP 接口
  - 稳定 playground
  - 为飞书 / Slack / 企业微信等 IM 接入预留形态
- 在用户没有给出明确业务能力前，不要擅自初始化数据库、业务框架或大型前端工程体系。

### 3.1 当前阶段快照

- 截至 `2026-04-19`，本阶段已经把 `web-access` 主链路收口到 Docker Chrome sidecar；后续 `/init` 不要再默认按 Windows 宿主 IPC 理解。
- 当前代码主仓库已经切到 GitHub：`https://github.com/mhgd3250905/ugk-claw-personal.git`；腾讯云新加坡服务器主部署目录为 `~/ugk-claw-repo`，阿里云 ECS 主部署目录为 `/root/ugk-claw-repo`，两边现在都是 Git 工作目录。两台服务器均已配置 `origin` GitHub 和 `gitee` remote；腾讯云增量发布默认拉 `origin`，阿里云增量发布默认拉 `gitee`，不要再把 tar 包搬运当成长期主流程。
- 截至 `2026-05-11 19:35 +08:00`，腾讯云和阿里云生产均已通过 `npm run server:ops -- <cloud> deploy` + `verify` 增量更新到本轮 Conn 未读徽章修复，功能锚点为 `efb0de7 Align conn unread badge with run counts`；如后续只有文档收尾提交，服务器实际 HEAD 以 `git log -1 --oneline` 为准。本轮详情看 `docs/handoff-current.md`、`docs/playground-current.md` 和双云部署手册，不要把发布流水账塞回本文件。
- 默认浏览器链路是 `WEB_ACCESS_BROWSER_PROVIDER=direct_cdp` -> `http://172.31.250.10:9223` -> Docker Chrome sidecar。
- agent 任务结束时，`AgentService` 会通过 `src/agent/browser-cleanup.ts` 按 `CLAUDE_AGENT_ID` / `CLAUDE_HOOK_AGENT_ID` / `agent_id` 清理本轮 `web-access` scope 下保留的浏览器页面；不要只在运行容器 `/app` 里热改，否则重建镜像会直接丢修复。
- sidecar GUI 登录入口是 `https://127.0.0.1:3901/`，登录态持久目录是 `.data/chrome-sidecar`。
- sidecar 文件选择 / CDP 上传使用独立共享 upload 桥：agent/app 侧写 `/app/.data/browser-upload/<file>`，sidecar Chrome 侧选择 `/config/upload/<file>`，宿主目录由 `UGK_BROWSER_UPLOAD_DIR` 指向；不要把整个 Chrome profile 当上传交换区。
- 当前生产更新默认不能洗掉三类状态：sidecar 登录态挂在 `~/ugk-claw-shared/.data/chrome-sidecar`，主 Agent 会话 / session / 资产 / conn 数据挂在 `~/ugk-claw-shared/.data/agent` 并映射到容器 `/app/.data/agent`，自定义 agent profile 挂在 `~/ugk-claw-shared/.data/agents` 并映射到容器 `/app/.data/agents`；如果更新后历史会话或自定义 Agent 消失，先查 `docker inspect ugk-pi-claw-ugk-pi-1` 的 mounts、`UGK_AGENT_DATA_DIR` 和 `UGK_AGENTS_DATA_DIR`，别又让容器可写层背锅。
- 用户可见链接使用 `PUBLIC_BASE_URL`；sidecar 自动化打开本地 artifact 使用 `WEB_ACCESS_BROWSER_PUBLIC_BASE_URL`，本地 compose 默认是 `http://ugk-pi:3000`。
- 运行中的 agent 对用户输出服务入口、playground 或本地文件预览链接时，必须以当前容器 `PUBLIC_BASE_URL` 为准；只有用户明确询问双云部署事实时才同时列出腾讯云 / 阿里云公网入口。阿里云环境不要主动提腾讯云公网地址，腾讯云环境也不要主动提阿里云公网地址，别把部署手册里的备用事实当默认回复模板。
- 腾讯云新加坡 CVM 的正式部署记录在 `docs/tencent-cloud-singapore-deploy.md`，公网入口是 `http://43.156.19.100:3000/playground`；阿里云 ECS 的正式部署记录在 `docs/aliyun-ecs-deploy.md`，公网入口是 `http://101.37.209.54:3000/playground`。两边 sidecar GUI 都只能走 SSH tunnel，不要开放公网 `3901`。
- Windows host IPC fallback 仍保留，但只用于 legacy 本机调试和紧急排障。
- 本阶段标准验证命令是 `npm test` 与 `npm run docker:chrome:check`。
- `playground` 手机端已经单独重写成移动聊天页；后续 `/init` 如果接手前端，不要把手机端继续按桌面端压缩版理解，先看 `docs/playground-current.md`。

## 4. 固定运行口径

- 固定本地入口：`http://127.0.0.1:3000/playground`
- 健康检查：`http://127.0.0.1:3000/healthz`
- 默认开发方式：`docker compose up -d`
- 本地 Docker 启动、重建、端口 3000、orphan nginx、运行态目录和 SQLite 排障先看 `docs/docker-local-ops.md`；不要把本地 compose、生产 compose 和旧 nginx 入口混用。
- 代码已挂载到容器 `/app`，多数改动后只需要：
  - `docker compose restart ugk-pi`
- agent 内部可以继续使用 `/app/...` 或 `file:///app/...` 这类本地 artifact 路径做浏览器操作；运行时会按浏览器所在网络自动桥接成 HTTP：
  - 用户可见链接走 `PUBLIC_BASE_URL`
  - Docker Chrome sidecar 自动化走 `WEB_ACCESS_BROWSER_PUBLIC_BASE_URL`
- 如果是要直接交付文件而不是浏览器预览，优先走 `send_file`
- 如果页面还是旧 HTML：
  - 先运行 `npm run docker:doctor`，确认 `127.0.0.1:3000` 没有被宿主机 `node.exe` 或其他非 Docker 进程单独监听；Windows 会优先命中更具体的 loopback 监听，导致浏览器打到影子服务而不是 Docker `ugk-pi`
  - 先重启 `ugk-pi`
  - 再确认 `http://127.0.0.1:3000/playground` 实际返回了本轮新增的 HTML / JS 标记
  - 再强刷浏览器
  - 不要第一反应去开 `3101`、`3102` 之类临时端口
- 临时端口只允许短时排障；排障结束必须回到 `3000` 做最终验证。

## 5. 关键路径

- 服务入口：`src/server.ts`
- 聊天路由：`src/routes/chat.ts`，请求解析：`src/routes/chat-route-parsers.ts`，SSE 输出工具：`src/routes/chat-sse.ts`
- Agent profile 管理路由：`src/routes/agent-profiles.ts`（`/v1/agents*` 元操作、技能开关、规则文件、默认 browser/model 绑定）；`src/routes/chat.ts` 仍负责注册它，并承载 main/scoped chat 路由
- playground 路由：`src/routes/playground.ts`
- 静态报告路由：`src/routes/static.ts`
- 文件 / 资产路由：`src/routes/files.ts`，文件路由工具：`src/routes/file-route-utils.ts`
- 任务消息路由：`src/routes/activity.ts`，任务消息路由工具：`src/routes/activity-route-utils.ts`
- 实时通知路由：`src/routes/notifications.ts`，实时通知路由工具：`src/routes/notification-route-utils.ts`
- playground UI：`src/ui/playground.ts`，页面静态 shell：`src/ui/playground-page-shell.ts`，共享基础样式：`src/ui/playground-styles.ts`，上下文用量控制器：`src/ui/playground-context-usage-controller.ts`，active run 归一化：`src/ui/playground-active-run-normalizer.ts`，会话 API 控制器：`src/ui/playground-conversation-api-controller.ts`，会话同步 ownership：`src/ui/playground-conversation-sync-controller.ts`，canonical state 渲染：`src/ui/playground-conversation-state-controller.ts`，本地历史存储：`src/ui/playground-conversation-history-store.ts`，历史分页控制器：`src/ui/playground-history-pagination-controller.ts`，过程/技能控制器：`src/ui/playground-process-controller.ts`，状态控制器：`src/ui/playground-status-controller.ts`，确认弹窗控制器：`src/ui/playground-confirm-dialog-controller.ts`，通知 toast 控制器：`src/ui/playground-notification-controller.ts`，弹层焦点 helper：`src/ui/playground-panel-focus-controller.ts`，Agent 操作台控制器：`src/ui/playground-agent-manager.ts`，工作区模式控制器：`src/ui/playground-workspace-controller.ts`，Chrome 工作台：`src/ui/playground-browser-workbench.ts`
- Agent 管理独立页面：`src/ui/agents-page.ts`
- playground 设计系统：`DESIGN.md`，变更视觉 token / 组件口径后运行 `npm run design:lint`
- agent 服务核心：`src/agent/agent-service.ts`，conversation catalog helper：`src/agent/agent-conversation-catalog.ts`，conversation command helper：`src/agent/agent-conversation-commands.ts`，conversation context helper：`src/agent/agent-conversation-context.ts`，conversation session helper：`src/agent/agent-conversation-session.ts`，conversation state helper：`src/agent/agent-conversation-state.ts`，terminal run helper：`src/agent/agent-terminal-run.ts`，queue message helper：`src/agent/agent-queue-message.ts`，prompt asset helper：`src/agent/agent-prompt-assets.ts`，run scope helper：`src/agent/agent-run-scope.ts`，run result helper：`src/agent/agent-run-result.ts`，session event adapter：`src/agent/agent-session-event-adapter.ts`，conversation history helper：`src/agent/agent-conversation-history.ts`，process text helper：`src/agent/agent-process-text.ts`，active run 视图 helper：`src/agent/agent-active-run-view.ts`，session event 守卫：`src/agent/agent-session-event-guards.ts`
- web-access 任务结束清理：`src/agent/browser-cleanup.ts`
- session 工厂：`src/agent/agent-session-factory.ts`
- 资产库：`src/agent/asset-store.ts`
- 文件交付协议：`src/agent/file-artifacts.ts`
- 文件交付历史挂载与 `send_file` 结果合并：`src/agent/agent-file-history.ts`
- agent 发文件工具：`.pi/extensions/send-file.ts`
- conn：`src/agent/conn-store.ts`、`src/agent/conn-db.ts`、`src/agent/conn-sqlite-store.ts`、`src/agent/conn-run-store.ts`、`src/workers/conn-worker.ts`
- artifact 交付：`src/agent/artifact-contract.ts`、`src/agent/artifact-validation.ts`、`src/agent/artifact-repair-loop.ts`、`src/routes/artifacts.ts`
- 飞书：`src/integrations/feishu/`
- 项目级配置：`.pi/settings.json`
- 项目级 prompts：`.pi/prompts/`
- 项目级 skills：`.pi/skills/`
- 用户 skills：本地开发为 `runtime/skills-user/`；生产通过 `UGK_RUNTIME_SKILLS_USER_DIR` 外置到 shared 持久目录后再挂到容器 `/app/runtime/skills-user/`
- 报告截图脚本：`runtime/screenshot.mjs`
- 移动报告截图脚本：`runtime/screenshot-mobile.mjs`
- web-access 浏览器桥接：`docs/web-access-browser-bridge.md`
- 本地 Docker / 运行态防踩坑：`docs/docker-local-ops.md`
- 服务器运维唯一入口：`docs/server-ops.md`
- 腾讯云新加坡部署运行手册：`docs/tencent-cloud-singapore-deploy.md`
- 阿里云 ECS 部署运行手册：`docs/aliyun-ecs-deploy.md`
- agent profile 元操作技能：`.pi/skills/agent-profile-ops/SKILL.md`
- agent profile catalog：`.data/agents/profiles.json`
- 项目级 subagent：`.pi/agents/`
- 用户 subagent：`runtime/agents-user/`
- 项目级 `pi` agent：`runtime/pi-agent/`

## 6. 场景索引

### A 场景：快速接手项目

先看这些文件，别一上来全仓乱翻：

1. `AGENTS.md`
2. `README.md`
3. `docs/traceability-map.md`
4. `docs/web-access-browser-bridge.md`
5. `docs/tencent-cloud-singapore-deploy.md`
6. `docs/aliyun-ecs-deploy.md`
7. `src/server.ts`
8. `src/routes/chat.ts`
9. `src/agent/agent-service.ts`
10. `src/agent/agent-session-factory.ts`
11. `src/ui/playground.ts`
12. `src/ui/playground-page-shell.ts`
13. `src/ui/playground-styles.ts`
14. `src/ui/playground-active-run-normalizer.ts`
15. `src/ui/playground-conversation-api-controller.ts`
16. `src/ui/playground-conversation-history-store.ts`
17. `src/ui/playground-history-pagination-controller.ts`
18. `src/ui/playground-confirm-dialog-controller.ts`
19. `src/ui/playground-notification-controller.ts`
20. `src/ui/playground-status-controller.ts`

如果这次 `/init` 的目标是接手云服务器，而不是本机开发，先记住三件事：

- 腾讯云正式入口是 `http://43.156.19.100:3000/playground`；阿里云正式入口是 `http://101.37.209.54:3000/playground`。这两条只用于云服务器接手和双云排障；普通运行回复、文件预览链接和 playground 链接必须优先使用当前环境的 `PUBLIC_BASE_URL`，不要默认把两边公网入口一起甩给用户。
- 腾讯云当前主部署目录是 `~/ugk-claw-repo`，已经是 GitHub 工作目录；旧的 `~/ugk-pi-claw` 与 `~/ugk-pi-claw-prev-*` 只保留给回滚和比对，不是默认更新入口。
- 阿里云当前主部署目录是 `/root/ugk-claw-repo`，已迁移为 Git 工作目录；旧的 archive 目录 `/root/ugk-claw-repo-pre-git-*` 只用于回滚和比对，不是默认更新入口。
- 两台服务器都已经配置 `origin` GitHub 和 `gitee` remote；常规发布默认走 Git fast-forward，不要再默认打包上传。服务器增量更新优先使用 `npm run server:ops -- <tencent|aliyun> <preflight|deploy|verify>`；脚本会按目标选择拉取远端：腾讯云 `origin`，阿里云 `gitee`。读文档按 `docs/server-ops.md` -> `docs/server-ops-quick-reference.md` -> 单云长手册的顺序渐进披露。
- 发布验收不要只看 `/healthz`。需要确认运行态挂载、session、skills、conn SQLite 和公开 URL / browser provider 时查 `GET /v1/debug/runtime`；服务器脚本已经把它纳入硬闸门。
- 腾讯云增量更新锚点：`ssh ugk-claw-prod` / `~/ugk-claw-repo` / `~/ugk-claw-shared` / `http://43.156.19.100:3000/healthz`。阿里云增量更新锚点：`root@101.37.209.54` / `/root/ugk-claw-repo` / `/root/ugk-claw-shared` / `http://101.37.209.54:3000/healthz`。
- 增量更新禁区：不要 `git reset --hard`，不要整目录覆盖，不要删除 shared 运行态，不要提交 `.env`、key、tar 包、runtime 报告或服务器 `.data`，不要在服务器 `git status --short` 非空时继续 pull；先备份/保全现场，再决定怎么收口。
- 只要改到 `Dockerfile`、系统依赖或运行环境，服务器必须执行 `docker compose -f docker-compose.prod.yml up --build -d`，不要只 `restart`。

如果这次 `/init` 还要接手 `playground` 前端，再记住两件事：

- 手机端当前不是桌面端压缩版，而是独立收口过的移动展示层；先看 `docs/playground-current.md`，别上来就按桌面布局推断手机样式。
- 手机端近期高频改动集中在 `src/ui/playground-styles.ts` 的移动断点、`src/ui/playground.ts` 的页面装配、`test/server.test.ts` 的页面断言，以及 `docs/playground-current.md` 的真实口径。

### B 场景：查聊天、会话、流式、打断

- `GET /v1/chat/state`
- `GET /v1/chat/status`
- `GET /v1/chat/events`
- `GET /v1/chat/conversations`
- `POST /v1/chat/conversations`
- `POST /v1/chat/current`
- `POST /v1/chat/reset`
- `src/routes/chat.ts`
- `src/routes/chat-sse.ts`
- `src/routes/chat-route-parsers.ts`
- `src/agent/agent-service.ts`
- `src/agent/agent-session-factory.ts`
- `src/types/api.ts`

### C 场景：查 playground 页面、消息气泡、思考过程、品牌和文件展示

- `src/ui/playground.ts`
- `src/ui/playground-page-shell.ts`
- `src/ui/playground-styles.ts`
- `src/ui/playground-active-run-normalizer.ts`
- `src/ui/playground-conversation-api-controller.ts`
- `src/ui/playground-conversation-sync-controller.ts`
- `src/ui/playground-conversation-state-controller.ts`
- `src/ui/playground-conversation-history-store.ts`
- `src/ui/playground-history-pagination-controller.ts`
- `src/ui/playground-process-controller.ts`
- `src/ui/playground-status-controller.ts`
- `src/ui/playground-confirm-dialog-controller.ts`
- `src/ui/playground-notification-controller.ts`
- `src/ui/playground-panel-focus-controller.ts`
- `test/server.test.ts`
- `docs/playground-current.md`

### D 场景：查上传文件、资产复用、`assetRefs`、`ugk-file`、`send_file`

- `src/routes/files.ts`
- `src/agent/asset-store.ts`
- `src/agent/agent-prompt-assets.ts`
- `src/agent/file-artifacts.ts`
- `src/agent/agent-file-history.ts`
- `.pi/extensions/send-file.ts`
- `docs/runtime-assets-conn-feishu.md`

### E 场景：查技能加载、查看技能、运行时真实技能清单

- `GET /v1/debug/skills`
- `GET /v1/debug/runtime`
- `src/routes/chat.ts`
- `src/routes/runtime-debug.ts`
- `.pi/skills/`
- `runtime/skills-user/`
- `docs/web-access-browser-bridge.md`（查 web-access / x-search-latest / 浏览器登录态时先看这里）

### F 场景：查 agent profile、subagent、prompt 工作流、项目级防护

用户问“我有哪些 agent / 有哪些 agent / 当前有哪些 agent”时，默认先理解为当前 Playground 的独立 agent profile / 操作视窗，必须查：

- `GET /v1/agents`
- `POST /v1/agents/:agentId/skills`
- `DELETE /v1/agents/:agentId/skills/:skillName`
- `.pi/skills/agent-profile-ops/SKILL.md`
- `src/agent/agent-profile.ts`
- `src/agent/agent-profile-catalog.ts`
- `src/agent/agent-service-registry.ts`
- `src/routes/agent-profiles.ts`
- `src/routes/chat.ts`

判断 agent 是否当前注册可用，以 `GET /v1/agents` 为准；`.data/agents/profiles.json` 只记录用户创建的自定义 agent，不是完整运行时注册表。`main` 和默认 `search` 可能来自代码内置 profile，不能因为 `profiles.json` 没有记录就说它未注册。

禁止直接编辑 `.data/agents/profiles.json` 来创建、恢复、归档或修复 agent profile。这个文件只是持久化 catalog，不是操作接口；手写它会绕过进程内 `AgentServiceRegistry`，造成 `POST /v1/agents` 因磁盘记录报重复、但 `GET /v1/agents` 因运行时 registry 未加载而看不到的分裂。创建走 `POST /v1/agents`，归档走 `POST /v1/agents/:agentId/archive`，技能变更走 `/v1/agents/:agentId/skills`；如果线上已经手改过文件，先说明分裂原因，再通过 API 收口或重启 `ugk-pi` 重新加载，不要继续补 JSON。

只有用户明确说 `subagent`、`.pi/agents`、`scout/planner/worker/reviewer` 或“派发子任务”时，才进入 legacy subagent 文件：

- `.pi/extensions/subagent/index.ts`
- `.pi/extensions/subagent/agents.ts`
- `.pi/extensions/project-guard.ts`
- `.pi/agents/`
- `runtime/agents-user/`
- `.pi/prompts/`

### G 场景：查 conn / Feishu 集成

- `src/routes/conns.ts`
- `src/routes/conn-route-presenters.ts`
- `src/routes/feishu-settings.ts`
- `src/agent/conn-store.ts`
- `src/agent/conn-db.ts`
- `src/agent/conn-sqlite-store.ts`
- `src/agent/conn-run-store.ts`
- `src/agent/artifact-contract.ts`
- `src/agent/artifact-validation.ts`
- `src/agent/artifact-repair-loop.ts`
- `src/routes/artifacts.ts`
- `src/workers/conn-worker.ts`
- `src/workers/feishu-worker.ts`
- `src/integrations/feishu/`
- `docs/runtime-assets-conn-feishu.md`

### H 场景：查容器、部署、健康检查、基础工具

- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `scripts/server-ops.mjs`
- `deploy/nginx/default.conf`
- `docs/server-ops.md`
- `docs/tencent-cloud-singapore-deploy.md`
- `scripts/docker-health.mjs`
- `src/routes/static.ts`
- `runtime/screenshot.mjs`
- `runtime/screenshot-mobile.mjs`

## 7. 文档分层

- `AGENTS.md`
  - 只放行为准则、项目边界与阶段快照、固定运行口径、关键路径、场景索引、文档分层和项目运行规范
- `docs/docker-local-ops.md`
  - 本地 Docker 启动 / 重建 / 端口 3000 / orphan nginx / SQLite / 运行态目录 / 技能加载排障口径
- `README.md`
  - 对外入口、运行方式、能力概览、文档导航
- `docs/traceability-map.md`
  - 追溯地图：按场景告诉你该先看哪些文件
- `docs/architecture-governance-guide.md`
  - 架构治理与后续 agent 接手总入口；决定是否重构、先读哪些治理地图、跑哪些验证时先看它
- `docs/change-log.md`
  - 统一更新记录；行为变更、接口变更、运行口径变更、文档结构变更都要留痕
- `.codex/skills/`
  - 维护本仓库的 coding agent 使用的开发协作技能；不要和产品运行时 `.pi/skills/` 混用
- `docs/playground-current.md`
  - 当前 playground 的真实交互与 UI 约束
- `docs/model-providers.md`
  - 智谱 GLM、DeepSeek、小米三类模型源的 provider、region、key 环境变量和展示顺序
- `DESIGN.md`
  - 当前 playground 的视觉 identity / token / 组件口径；用于辅助 agent 做前端设计决策
- `docs/runtime-assets-conn-feishu.md`
  - 资产、附件、`conn`、飞书接入的运行说明
- `docs/server-ops-quick-reference.md`
  - 生产服务器高频运维动作速查；只看更新、验收、日志、SSH tunnel 和回滚
- `docs/tencent-cloud-singapore-deploy.md`
  - 腾讯云新加坡 CVM 的部署事实、`.env` 口径、更新发布流程、SSH tunnel、验证命令和踩坑记录
- `docs/aliyun-ecs-deploy.md`
  - 阿里云 ECS 的部署事实、Git 更新流程、Gitee 默认拉取、`.env` 口径、安全组、验证命令和踩坑记录

## 8. 项目运行规范

### 8.1 编辑策略

- 先读现有文件，再动手；优先编辑已有文件，不要无意义新建。
- 文件编辑要先选对策略：精确替换只用于小范围、唯一、非重叠文本；`oldText` 必须尽量短但足够唯一，不要塞整段 HTML / Markdown / 模板做大块匹配。
- 同一文件多处独立小改动应一次性提交多个非重叠替换；相邻或同块改动先合并成一个小块，不要连续多次赌同一片上下文。
- 精确替换连续失败 2 次后必须停下来重新读取目标片段和行号，改用更小锚点、结构化解析 / 格式化脚本，或在完整读过且文件较小、结构简单时重写全文；禁止第三次继续靠猜 oldText 硬怼。
- 小文件全文重写不是默认捷径。只有确认文件已完整读取、内容可控、改动范围密集且不会覆盖用户并发修改时才使用；否则优先精确小补丁。
- 先判断任务性质：
  - 文档 / 规划任务：优先改文档，不要顺手碰源码。
  - 实现 / 修复任务：先看真实入口和调用链，再落代码。
- 缺少上下文但需要规划时，先写 `.codex/plans/`，执行前等用户确认。

### 8.2 部署策略

- 涉及云服务器更新部署时，必须先向用户确认本次是"增量更新"还是"整目录替换"；在用户明确确认前，不要默认执行整目录替换。默认倾向是增量更新，不要擅自把服务器本地状态、已安装 skills、`.data` 和运行目录一起洗掉。
- 不要臆造 `pi` 的配置、技能、provider、行为；涉及这类事实时必须查：
  - `references/pi-mono/packages/coding-agent/README.md`
  - `references/pi-mono/packages/coding-agent/docs/settings.md`
  - `references/pi-mono/AGENTS.md`
  - `GET /v1/debug/skills`
  - `GET /v1/debug/runtime`
- `references/pi-mono/` 是官方参考镜像，不是业务源码目录；除非用户明确要求，不要改它。

### 8.3 验证义务

- 不要把"代码里出现了某段字符串"当作修复完成；要验证真实入口、真实状态、真实行为。
- 任何影响外部行为、运行方式、接口、文档结构或协作约定的改动，必须在同一轮同步更新文档系统，不能等"之后有空再补"。
- 每次这类改动完成后，都要追加更新记录到 `docs/change-log.md`，至少写清：
  - 日期
  - 改动主题
  - 影响范围
  - 对应源码或文档入口
- 前端任务统一遵守：
  - 先锁定用户点名的真实 DOM / 组件 / 状态
  - 先查约束链，再改样式或脚本
  - 优先删除冲突旧逻辑，再新增修复
  - 连续两次补丁没打中根因时，停止缝补，改做整体收口
- 前端任务回报只说三件事：
  - 我认定的真实需求
  - 真正生效的约束源改在哪里
  - 我如何验证这次改动不是假修复
- 运行时 / API 改动至少验证：
  - 代码真源
  - 实际接口或页面入口
  - 类型检查 / 测试
  - 服务重启后的最终结果
- 纯文档任务至少验证：
  - 目录和链接不失真
  - 描述与当前代码 / 运行事实一致
  - 旧说法已从主文档移除

### 8.4 运行事实

- 代码仓库和运行态目录必须分离：`.env`、`.data/`、部署包、运行时截图 / HTML 报告、本地临时输出都不属于 Git 主仓库内容。
- 用户可见文件和本地 artifact 统一通过文件交付协议处理：真实文件优先 `send_file`，浏览器预览走宿主可访问 HTTP，本地 `/app/...` / `file:///app/...` 不直接暴露给用户。细节见 `docs/runtime-assets-conn-feishu.md`。
- `web-access` 默认真实浏览器链路走 Docker Chrome sidecar：`WEB_ACCESS_BROWSER_PROVIDER=direct_cdp` -> Docker Chrome CDP；Windows host IPC fallback 只用于 legacy 本机调试和紧急排障。细节见 `docs/web-access-browser-bridge.md`。
- Playground 当前 UI、消息、composer、工作区、浅色主题和手机端行为以 `docs/playground-current.md` 与 `docs/playground-ui-governance-map.md` 为准；不要把 UI 细节继续塞回本节。
- Playground 多会话和运行态恢复以服务端 canonical state 为准：`GET /v1/chat/conversations` 管当前会话目录，`GET /v1/chat/state` 管可渲染状态，`GET /v1/chat/events` 管 active run 增量续订。本节只保留原则，具体实现看 `docs/agent-chat-governance-map.md`。
- Agent profile 的运行时注册列表以 `GET /v1/agents` 为准；创建、归档、技能变更必须走 API。`.data/agents/profiles.json` 只是持久化 catalog，不是操作入口。
- 仓库根 `AGENTS.md` 只给维护本项目代码的 coding agent 使用；Playground 主 Agent 和其他 agent profile 使用运行态规则文件 `/app/.data/agent/AGENTS.md` 或 `/app/.data/agents/<agentId>/AGENTS.md`。
- `conn` 后台任务默认投递到任务消息；`workspace/output/` 是持久产物标准出口，`/app/public` 只保留兼容收编，不恢复为主输出目录。每个 conn workspace 包含六个目录：input、work、output、logs、session、artifact-public；启用 artifact 交付时 `ARTIFACT_PUBLIC_DIR` 指向 `artifact-public/`，post-execution 自动校验和修复。细节见 `docs/conn-activity-legacy-governance-map.md`。
- 生产部署必须保留 shared 运行态：Chrome profile、agent session / assets / conn 数据、自定义 agent profile、用户 skills 都不能被代码更新洗掉。具体路径和验收以 `docs/server-ops.md` 及对应云手册为准。
- Docker 镜像基础工具、浏览器 sidecar、公开 URL、模型源和双云部署事实如果变化，应更新对应专题文档和 `docs/change-log.md`，不要把变更流水账塞进本文件。
