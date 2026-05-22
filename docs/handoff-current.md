# 当前交接快照

更新时间：`2026-05-22`

这份文档给新接手 `ugk-pi / UGK CLAW` 的 coding agent 看。它只记录当前稳定事实和接手入口；历史流水账看 `docs/change-log.md`。不要靠聊天记录拼现状，聊天上下文太肥时最容易把旧计划当新任务，挺蠢，也挺危险。

## 给新会话的第一条消息

可以直接把下面这段发给新的 coding agent：

```text
请接手 `E:\AII\ugk-pi`。你维护的是 ugk-pi 代码仓库，不是产品运行时 Playground agent。

开始前先读 `AGENTS.md`、`docs/handoff-current.md`、`docs/playground-current.md`、`docs/change-log.md`、`docs/traceability-map.md` 和 `DESIGN.md`。如果任务涉及 Chat / Agents / Conn 性能优化，直接看 `.codex/plans/2026-05-22-playground-chat-performance-handoff.md`、`.codex/plans/2026-05-22-playground-agents-performance-handoff.md`、`.codex/plans/2026-05-22-playground-conn-performance-handoff.md`。

开始前执行 `git status --short --branch`、`git log -1 --oneline`、`git show -s --format="%h %s" stable/playground-performance-2026-05-22`、`git log --oneline stable/playground-performance-2026-05-22..HEAD` 和 `git remote -v`。当前稳定产品基线 tag 是 `stable/playground-performance-2026-05-22`，指向 `f0aa1fd docs(playground): preserve performance handoffs`，已推送到 GitHub `origin` 和 Gitee `gitee`。后续是否继续开发、规划、部署，要先按用户新任务判断，不要擅自加功能。

本地开发默认用 Docker：`docker compose up -d` 或 `docker compose restart ugk-pi`。固定入口是 `http://127.0.0.1:3000/playground`，健康检查是 `http://127.0.0.1:3000/healthz`。不要提交 `.env`、`.data/`、runtime 临时产物、public 报告、截图、浏览器 profile、部署包或未明确归档的临时文件。
```

## 当前稳定基线

- 稳定 tag：`stable/playground-performance-2026-05-22`
- tag 指向：`f0aa1fd docs(playground): preserve performance handoffs`
- GitHub：`origin` -> `https://github.com/mhgd3250905/ugk-claw-personal.git`
- Gitee：`gitee` -> `https://gitee.com/ksheng3250905/ugk-pi-claw.git`
- 打 tag 时 `origin/main` 和 `gitee/main` 已同步到 `f0aa1fd`；后续如果 `main` 晚于 tag，先检查是否只是交接文档提交
- 本地工作区在打 tag / 推送后已清理未跟踪运行产物；新会话仍必须先执行 `git status --short --branch`

注意：远端 Git 已更新不等于生产服务器已部署。服务器更新仍要按 `docs/server-ops.md` 的增量流程执行，不能把 push 当上线。

## 2026-05-22 Playground 性能收口

本阶段完成三条性能主线：Chat、Agents、Conn。细节不要塞回本文件，按 handoff 文档追：

- Chat：`.codex/plans/2026-05-22-playground-chat-performance-handoff.md`
- Agents：`.codex/plans/2026-05-22-playground-agents-performance-handoff.md`
- Conn：`.codex/plans/2026-05-22-playground-conn-performance-handoff.md`

### Chat 已完成

核心提交：

- `9c95ac8 perf(playground): avoid hidden duplicate conversation list rendering`
- `4d32d42 perf(playground): virtualize conversation list rows`
- `d867465 fix(playground): repair conversation virtual scrolling`
- `f31842e perf(playground): coalesce conversation catalog refreshes`
- `8b1c5ee perf(playground): defer non-chat panel data loading`
- `3c9b99f perf(playground): delegate conversation row events`
- `e6d05e3 docs(playground): document chat performance refinements`

当前事实：

- 会话列表虚拟滚动，桌面 row pitch `60px`，移动 row pitch `100px`
- 桌面和移动不再同时渲染隐藏重复列表
- 会话目录刷新 500ms 合并，发送消息不再做不必要的预检 catalog sync
- 文件库、任务消息、Conn 等非聊天面板延迟到打开或显式刷新时加载
- 会话行交互改为事件委托，减少每行监听器

### Agents 已完成

核心提交：

- `9b9a36b perf(agents): reuse main skills on initial load`
- `d6f2a58 perf(agents): lazy render selected skills`
- `592ec45 perf(agents): cache scoped skills per agent`
- `08d248b perf(agents): defer editor support catalogs`
- `a503086 perf(agents): render agent detail in stable sections`
- `4de63b2 fix(agents): surface skills load failures`

当前事实：

- `/playground/agents` 首屏复用 main skills，不重复请求
- selected Agent skills 默认折叠，不首屏挂载全量技能行
- 每个 Agent 的 skills 有缓存和显式 loaded 状态
- skills 拉取失败会显示可重试错误，不再伪装成空列表
- browser / model 支撑目录延迟到 create/edit editor 打开时加载
- Agent detail 已拆成稳定 region，减少整块重绘

### Conn 已完成

核心提交：

- `60df2a8 perf(conn): defer editor support catalogs`
- `abfd561 perf(conn): defer initial run history loading`
- `ea91ee0 perf(conn): paginate standalone run history`
- `b00ee1b fix(conn): clear loaded run state after read-all`
- `4a7688b perf(conn): narrow realtime refresh scope`
- `701ff3a perf(conn): render targeted task updates`
- `b60b0ed ux(conn): add bounded run history loading states`

当前事实：

- `/playground/conn` 首屏只请求 `GET /v1/conns`
- editor 支撑目录延迟加载并缓存
- 自动选中第一条 conn 不再拉 full run history
- run history 用户显式点击后才请求 `limit=10`
- `GET /v1/conns/:connId/runs` 支持 `limit` / `before` 分页，同时保持无 query 的旧完整响应
- conn notification 只做窄刷新并合并 burst
- pause/resume/delete/run/read-all 使用局部渲染
- run history 有 loading / empty / error retry / has-more / loading-more 状态

## 最近验证记录

本阶段收口后已通过：

- `node --test --import tsx test/conn-page-ui.test.ts`：20/20
- `node --test --import tsx test/server.test.ts`：160/160
- `npx tsc --noEmit`：clean
- `npm run docker:doctor`：端口 3000 无宿主 shadow listener
- `npm test`：1690 pass / 0 fail / 2 skip

`npm test` 中可能看到 browser cleanup 的 `fetch failed` 日志；测试通过时这是无真实浏览器清理端点的环境噪声，不是失败信号。

## 接手时先看哪些文件

通用入口：

1. `AGENTS.md`
2. `docs/handoff-current.md`
3. `docs/playground-current.md`
4. `docs/change-log.md`
5. `docs/traceability-map.md`
6. `DESIGN.md`

性能收口记录：

1. `.codex/plans/2026-05-22-playground-chat-performance-handoff.md`
2. `.codex/plans/2026-05-22-playground-agents-performance-handoff.md`
3. `.codex/plans/2026-05-22-playground-conn-performance-handoff.md`

主要代码入口：

1. `src/ui/playground.ts`
2. `src/ui/playground-conversations-controller.ts`
3. `src/ui/agents-page.ts`
4. `src/ui/conn-page-js.ts`
5. `src/ui/conn-page-css.ts`
6. `src/routes/conns.ts`
7. `src/routes/agent-profiles.ts`
8. `src/routes/chat.ts`

## 当前关键事实

- 本地固定入口：`http://127.0.0.1:3000/playground`
- 本地健康检查：`http://127.0.0.1:3000/healthz`
- 默认本地启动：`docker compose up -d`
- 常规代码改动后优先：`docker compose restart ugk-pi`
- 如果页面还是旧内容，先跑 `npm run docker:doctor`，不要开临时宿主 Node 服务绕路
- 双云默认发布方式是增量更新：腾讯云拉 `origin/main`，阿里云拉 `gitee/main`
- Agent profile 运行时列表以 `GET /v1/agents` 为准，不要手写 `.data/agents/profiles.json`
- 模型源当前事实看 `docs/model-providers.md` 和 `/v1/model-config`
- Chrome sidecar 登录态在 shared 运行态目录，不能被部署流程洗掉

## 暂时不要做

- 不要把当前稳定 tag 移动或覆盖；需要新稳定点就打新 tag
- 不要把 push 当生产部署
- 不要无任务目标继续“优化性能”，这词很容易变成到处乱拆
- 不要提交 `.env`、`.data/`、runtime 临时产物、public 报告、截图、部署包或浏览器 profile
- 不要动 `references/pi-mono/`，那是参考镜像，不是业务源码
- 不要把手机端 Playground 当桌面端压缩版改
- 不要直接编辑 `.data/agents/profiles.json`

## 推荐下一步

新会话工作还没确定时，先做一轮轻量接手：

1. 执行 `git status --short --branch`
2. 执行 `git log -1 --oneline`
3. 确认当前任务类型：规划 / 文档 / 前端 / API / 部署 / 排障
4. 按 `docs/traceability-map.md` 找最小代码入口
5. 如果只是规划，不要动源码；如果要实现，先写可验证成功标准

如果用户要求部署，先读：

1. `docs/server-ops.md`
2. `docs/server-ops-quick-reference.md`
3. `docs/tencent-cloud-singapore-deploy.md`
4. `docs/aliyun-ecs-deploy.md`

发布禁区：

- 不要 `git reset --hard`
- 不要整目录覆盖服务器仓库
- 不要删除或重建 shared 运行态
- 不要执行 `docker compose down -v`
- 不要提交 `.env`、token、cookie、`.data/`、部署包、runtime 临时文件
