# 当前交接快照

更新时间：`2026-05-23`

这份文档给新接手 `ugk-pi / UGK CLAW` 的 coding agent 看。它只记录当前稳定事实和接手入口；历史流水账看 `docs/change-log.md`。不要靠聊天记录拼现状，聊天上下文太肥时最容易把旧计划当新任务，挺蠢，也挺危险。

## 给新会话的第一条消息

可以直接把下面这段发给新的 coding agent：

```text
请接手 `E:\AII\ugk-pi`。你维护的是 ugk-pi 代码仓库，不是产品运行时 Playground agent。

开始前先读 `AGENTS.md`、`docs/handoff-current.md`、`docs/playground-current.md`、`docs/change-log.md`、`docs/traceability-map.md` 和 `DESIGN.md`。如果任务涉及 Chat / Agents / Conn 性能优化，直接看 `.codex/plans/2026-05-22-playground-chat-performance-handoff.md`、`.codex/plans/2026-05-22-playground-agents-performance-handoff.md`、`.codex/plans/2026-05-22-playground-conn-performance-handoff.md`。如果任务涉及 Qwen 思考流、GLM-5.1 上下文或模型源展示，先看 `docs/model-providers.md`、`docs/playground-current.md` 的 `2026-05-23` 条目和 `src/agent/agent-session-event-adapter.ts`。如果任务涉及 Team Console 独立前端分支，先切到 `E:\AII\ugk-pi\.worktrees\team-console-ui`，读 `apps/team-console/README.md` 和 `docs/team-runtime.md`，不要改 `/playground/team`、`src/team/**`、`src/routes/**`、`src/ui/**` 或 Live API 行为。

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

## 2026-05-23 Qwen 思考流与 GLM-5.1 上下文修复

当前事实：

- Ali CodePlan 的 `qwen3.7-max` 会在正式 `text_delta` 之前持续输出 `thinking_delta` / `thinking_start` / `thinking_end`。
- Chat session adapter 不再吞掉 thinking 阶段事件；它会转换为 `{ type: "heartbeat", phase: "reasoning" }`，让前端保持“正在推理”状态，但不会把 thinking 内容拼进最终回答。
- run events 会克隆 `heartbeat`，聊天路由会把 `text_delta` 和 `heartbeat` 一起从 run log 分页噪声里过滤掉，避免长推理刷爆运行记录。
- 前端 stream controller 收到 reasoning heartbeat 后只更新加载状态，不改 `streamingText`。
- Ali CodePlan 的 `glm-5.1` 模型元数据已按智谱官方文档修正为 `contextWindow: 200000`、`maxTokens: 128000`；模型源事实看 `runtime/pi-agent/models.json`、`docs/model-providers.md` 和 `/v1/model-config`。

关键入口：

- `src/agent/agent-session-event-adapter.ts`
- `src/agent/agent-run-events.ts`
- `src/routes/chat.ts`
- `src/ui/playground-stream-controller.ts`
- `runtime/pi-agent/models.json`
- `docs/model-providers.md`
- `docs/playground-current.md`

## 2026-05-23 Team Console 独立前端分支快照

当前事实：

- Team Console 分支在 `E:\AII\ugk-pi\.worktrees\team-console-ui`，分支名 `codex/team-console-ui`，这是独立 React + Vite + TypeScript preview，不替换 `/playground/team`。
- 禁区仍然有效：不要改 `src/team/**`、`src/routes/**`、`src/ui/**`，不要改 Team Runtime 后端或 Live API 行为。
- 当前 UI 已从固定侧栏 / 节点内详情堆叠收口为 Execution Atlas：点击 task 后 selected node 保持紧凑，结果 / 错误 / 尝试 / 进度以 evidence card 分支从任务节点长出。
- Evidence / artifact / preview card 是 `.execution-map-nodes` 的直接子节点，不是 selected task 的 descendant；桌面端 absolute 定位在右侧并通过 dashed SVG link 连接，移动端作为 selected task 后一个 sibling 流式堆叠。
- 选中 task 后，Team Console 会用现有只读 API 读取真实 `TeamAttemptMetadata`，从 worker/checker/watcher/result refs 渲染 Worker 输出、Checker 验收、Watcher 复盘和最终 / 失败 / 发现结果 artifact card；点击 artifact card 会读取真实 attempt file 并展开二级预览节点，文本转义、JSON pretty print、HTML sandbox iframe。
- 桌面 Execution Atlas 支持鼠标滚轮缩放、背景拖拽平移和中文工具按钮“放大 / 缩小 / 重置视图”。移动端本轮只做最小烟测，不做深度设计，`720px` 以下保持纵向流并隐藏自定义 pan/zoom 工具条。
- Mock fixtures 已加入脱敏真实 run snapshot：`plan_real_snap_001` / `run_real_snap_001`，用于验证真实 completed_with_failures 数据、for_each 子任务、长错误、API 错误、resultRef、ghost result 和最终汇报。
- Mock fixtures 已加入脱敏真实 run snapshot 2：`plan_real_success_foreach_001` / `run_real_success_foreach_001`，16 个任务（3 主任务 + 13 for_each 子任务）全部成功，用于验证折叠/展开交互和大量子任务布局。
- 已删除旧固定右侧任务详情组件 `apps/team-console/src/graph/ExecutionTaskDetail.tsx`；不要再按右侧栏方案继续设计。
- Collapsed summary 节点已支持展开/收起：点击 "+ N 个子任务" 展开全部子任务，展开后末尾显示"收起"按钮，再次点击收起。展开/收起时布局同步更新。
- for_each 父任务 evidence 规则：有 visible children（子任务数 ≤ `CHILD_COLLAPSE_THRESHOLD`(6) 或已展开）时不显示 evidence；无 visible children 时显示当前任务自身的结果 / 错误 / 进度。

最近验证：

- `npm --prefix apps/team-console run test`：155 passed
- `npm --prefix apps/team-console run build`：通过
- `git diff --check`：通过
- 1281px 桌面浏览器验证：`搜索 知乎` 的 4 张 evidence card 位于 selected node 右侧，4 条 evidence link 可见，无节点重叠，无横向 overflow。
- 375px 浏览器验证：`搜索 知乎`、`按平台搜索`、`汇总报告` 的 first evidence 都紧跟 selected node，gap 8px，`evidenceFollowsSelected=true`，无横向 overflow。

当前提交边界：

- 应提交的 tracked 改动集中在 `apps/team-console/**`、`docs/team-runtime.md`、`docs/change-log.md`、`docs/handoff-current.md`。
- 不要提交未跟踪计划文件：`.codex/plans/2026-05-23-team-console-decoupled-ui-plan.md`、`.codex/plans/2026-05-23-team-console-ui-review-fix-plan.md`、`.codex/plans/2026-05-23-team-run-detail-visual-map-redesign-plan.md`。
- 不要提交未跟踪截图：`screenshot-*.png`。

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

- `node --test --import tsx test/agent-session-event-adapter.test.ts test/agent-run-events.test.ts test/agent-session-factory.test.ts test/model-config.test.ts`：40/40
- `node --test --import tsx test/server.test.ts`：162/162
- `npx tsc --noEmit`：clean
- `npm test`：1701 pass / 0 fail / 2 skip
- `npm run docker:chrome:check`：通过
- `GET http://127.0.0.1:3000/healthz`：`{"ok":true}`
- `GET http://127.0.0.1:3000/v1/model-config`：`glm-5.1` 返回 `contextWindow: 200000` / `maxTokens: 128000`

上一轮性能收口后已通过：

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
