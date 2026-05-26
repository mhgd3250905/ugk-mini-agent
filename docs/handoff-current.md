# 当前交接快照

更新时间：`2026-05-26`

这份文档给新接手 `ugk-pi / UGK CLAW` 的 coding agent 看。它只记录当前稳定事实和接手入口；历史流水账看 `docs/change-log.md`。不要靠聊天记录拼现状，聊天上下文太肥时最容易把旧计划当新任务，挺蠢，也挺危险。

## 给新会话的第一条消息

可以直接把下面这段发给新的 coding agent：

```text
请接手 `E:\AII\ugk-pi`。你维护的是 ugk-pi 代码仓库，不是产品运行时 Playground agent。

开始前先读 `AGENTS.md`、`docs/handoff-current.md`、`docs/playground-current.md`、`docs/change-log.md`、`docs/traceability-map.md` 和 `DESIGN.md`。如果任务涉及 Chat / Agents / Conn 性能优化，直接看 `.codex/plans/2026-05-22-playground-chat-performance-handoff.md`、`.codex/plans/2026-05-22-playground-agents-performance-handoff.md`、`.codex/plans/2026-05-22-playground-conn-performance-handoff.md`。如果任务涉及 Qwen 思考流、GLM-5.1 上下文或模型源展示，先看 `docs/model-providers.md`、`docs/playground-current.md` 的 `2026-05-23` 条目和 `src/agent/agent-session-event-adapter.ts`。如果任务涉及 Team Console Task / WorkUnit redesign，先切到 `E:\AII\ugk-pi\.worktrees\team-console-workunit-redesign`，读 `apps/team-console/README.md`、`docs/team-runtime.md`、`docs/playground-current.md` 和 `docs/change-log.md`；这是独立 Team Console React/Vite worktree，不是产品运行时 Playground agent，也不是 `.pi/skills` runtime skill。不要提交 `.codex/plans/*`、`.codex/skills/new-chat/`、`.env`、`.data`、runtime 产物、temp 文件或未知 `.pi/skills/*/skills-lock.json`。

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

## 2026-05-26 Team Console Task / WorkUnit 提交快照

当前 Team Console Task 功能雏形已经在独立 worktree 收口：

- Worktree：`E:\AII\ugk-pi\.worktrees\team-console-workunit-redesign`
- 分支：`codex/team-console-workunit-redesign`
- 最新提交：`98c3148 fix(team-console): unify connector source sockets`
- 近期 UI 收口提交：`6e96e9b fix(team-console): smooth node connector curves`、`3b9a0a4 fix(team-console): refine node connector curves`、`2c83f3a feat(team-console): polish run observer connectors`
- Typed Task Chain V1 提交：`a8a9584 feat(team-console): add typed task chain v1`
- 本轮提交包含 Typed Task Chain V1 源码 / 测试 / 文档，以及 Run observer 聚合面板、连接曲线和 source socket 视觉收口；提交后 tracked 工作区应保持干净。`.codex/plans/*` 和 `.codex/skills/new-chat/` 仍是本地协作文件，按边界不要提交。

当前已完成：

- Team Console 已支持 Task 创建入口、浅编辑、软删除、Leader 对话 iframe、Task run 启动 / 停止和 Run observer。
- Task run observer 已聚合为单个 `run-observer` 大面板：内部顺序为 worker 过程、worker 输出文件、checker 过程、checker 输出文件、result 文件；点击文件行仍展开右侧文件详情节点。
- Worker / Checker 过程节点消费 `attempt.roleProcesses.worker/checker`；有 `assistantText.content` 时优先显示 Agent 自述 / 推理文本，保留换行、中文断句、最多 5 行、单行 200 字符截断；不再渲染下半区 tool / method 调用明细，完整 attempt metadata 仍由后端保留。
- 文件节点紧凑展示 Agent 名、文件名和路径；点击文件节点展开右侧详情节点，支持 JSON pretty print、安全 Markdown 渲染和文本 fallback。
- Task 操作树支持层级拖动：拖 Task 根节点带动菜单和已展开子树；拖菜单带动 observer 子节点；拖过程节点只移动自身；拖文件节点带动其文件详情；拖文件详情叶子节点只移动自身。
- 运行中 observer 已收掉高频视觉噪音：不显示空文件占位、`正在刷新...`、`最后刷新`，active poll 瞬时失败不插红色错误节点；拖动 / resize 期间暂停 Task branch / child panel auto-height measurement，降低轮询刷新导致的卡顿和闪烁。
- 连接线已统一为 right-middle -> left-middle 的单条连续 cubic；出线端统一显示吸附在卡片右边缘的半圆 source socket，target 端不再显示圆环或圆点。Task connection 使用绿色 socket，Agent 分支偏青色，Task 分支和二级面板偏金色。
- Typed Task Chain V1 已建立最小积木契约：WorkUnit 可声明 `inputPorts` / `outputPorts`，连接数据为 `fromTaskId/fromOutputPortId -> toTaskId/toInputPortId`，后端校验 `output.type === input.type`、非重复、非自连接、非环。
- Team Console Task 卡片会展示 typed ports；点击 output port 后只能连到同类型 input port，连接成功后画布渲染 Task connection path。
- 上游 Canvas Task run 成功并通过 checker 后，后端会把 `accepted-result.md` 封装成 typed artifact，并作为 `boundInputs` 自动启动下游 Task run；下游 run 的 `source.triggeredBy` 记录来源 connection / upstream run。
- Live API 兼容仍指向旧 Docker 主服务的开发现场：`GET /v1/team/task-connections` 404 时前端当作空连接列表，避免 Agent / Task catalog 和“创建 Task”入口被打挂；但真正连线和自动下游触发仍需要当前 worktree 后端或已集成该 endpoint 的服务。
- V1 边界保持克制：不做任意复杂自由画布编排、条件分支、循环、真实 TTS 或 SSE；第一条真实验收链路是“搜集内容 Task 输出 `md` -> HTML 制作 Task 输入 `md`、输出 `html`”。

验证记录：

上一个已提交快照验证：

- `npm --prefix apps/team-console run test`：325 passed
- `npm --prefix apps/team-console run build`：通过
- `npx tsc --noEmit`：通过
- `git diff --check`：通过
- touched files EOL：`i/lf w/lf`
- 浏览器冒烟：`http://127.0.0.1:5174/` mock Task run 中 Worker / Checker 自述分行显示，过程节点不再显示下半区 tool / method 调用明细，console 无 error / warn

本轮 Typed Task Chain V1 验证：

- `node --test --import tsx test/team-task-store.test.ts test/team-task-routes.test.ts test/team-task-run-routes.test.ts`：20 passed
- `npm --prefix apps/team-console run test`：329 passed
- `npm --prefix apps/team-console run build`：通过
- `npx tsc --noEmit`：通过
- `git diff --check`：通过
- 浏览器冒烟：`http://127.0.0.1:5174/` mock 模式可见 Task typed port chip（`输出 Markdown 报告 md`）；当前 mock fixture 只有一个 output port Task，不生成 connection path；console 无应用错误 / warn，仅 `favicon.ico` 404。

本轮 Run 状态合并到 Task 菜单验证：

- `npm --prefix apps/team-console run test`：331 passed
- `npm --prefix apps/team-console run build`：通过
- `npx tsc --noEmit`：通过
- `git diff --check`：通过
- 浏览器冒烟：`http://127.0.0.1:5174/` Live API 当前 Task run 中，`.task-run-summary` 展示运行状态、阶段、耗时、Attempts、进度消息和 run id；`.emap-observer-status-node` 为 0；Worker / Checker 过程节点仍存在；拖动 Worker 过程节点后位置更新；console 无 error / warn。

本轮 Run observer 聚合、连接曲线和 source socket 收口验证：

- `npm --prefix apps/team-console run test`：341 passed
- `npm --prefix apps/team-console run build`：通过
- `git diff --check`：通过
- touched files EOL：`i/lf w/lf`
- 浏览器 DOM 验证：`http://127.0.0.1:5174/` title 为 `Team Console`；旧 `.emap-connector-anchor-ring` / `.emap-connector-anchor-dot` 数量为 0；Typed Task connection 和 Task 菜单连接均渲染 `.emap-connector-source-socket`；Task connection socket 路径形如 `M560,520 A6,6 0 0 1 560,532`，Task 菜单 socket 路径形如 `M560,298 A6,6 0 0 1 560,310`。

集成注意：

- Docker 主服务 / 主 checkout 已有后端提交 `65e4de8 feat(team): expose task role assistant text`，会通过 attempts API 暴露 `roleProcesses.*.assistantText`。
- 当前 Team Console worktree 的 HEAD 仍未包含 `65e4de8`；Live API 若连接未包含该后端提交的服务，会 fallback 到 current action / narration，不报错但不会显示新自述字段。
- 最终集成前需要安全并入 `65e4de8` 或确认部署环境后端已包含该提交；不要在当前有未提交文档改动时盲目 merge / rebase / reset。

推荐下一步：

1. 继续真实 Task run / typed chain 验收时，重点看 `TaskA 输出 md -> TaskB 输入 md` 的端到端耗时和下游 run 发现链路；UI 连接线和 observer 聚合视觉本轮先收口，不要继续无边界打磨。
2. 集成前审 `git log --oneline HEAD..65e4de8` 和 `git show --stat 65e4de8`，确认后端分叉文件后再合。
3. SSE 观察流仍是后续后端能力；当前 Run observer 仍是轮询版，不要在前端硬造假实时流。

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
- 只有通过当前 task/attempt 匹配、且文件名存在于 attempt metadata `files` 白名单里的 file-backed artifact card 会渲染为可点击 `button` 并调用 `readAttemptFile()`；Fallback Error / Attempt / Progress evidence 是静态卡片，不会伪造可预览文件。
- 桌面 Execution Atlas 支持鼠标滚轮缩放、背景拖拽平移和中文工具按钮“放大 / 缩小 / 重置视图”。移动端本轮只做最小烟测，不做深度设计，`720px` 以下保持纵向流并隐藏自定义 pan/zoom 工具条。
- Evidence / preview 高度测量已改为 `offsetHeight` 优先、`scrollHeight` fallback，不再把 CSS scale 后的 `getBoundingClientRect().height` 写回 layout；滚轮缩放使用原生 non-passive `wheel` listener，避免缩放后点击节点触发 React `Maximum update depth exceeded` 白屏。
- Mock fixtures 已加入脱敏真实 run snapshot：`plan_real_snap_001` / `run_real_snap_001`，用于验证真实 completed_with_failures 数据、for_each 子任务、长错误、API 错误、resultRef、ghost result 和最终汇报。
- Mock fixtures 已加入脱敏真实 run snapshot 2：`plan_real_success_foreach_001` / `run_real_success_foreach_001`，16 个任务（3 主任务 + 13 for_each 子任务）全部成功，用于验证折叠/展开交互和大量子任务布局。
- 已删除旧固定右侧任务详情组件 `apps/team-console/src/graph/ExecutionTaskDetail.tsx`；不要再按右侧栏方案继续设计。
- Collapsed summary 节点已支持展开/收起：点击 "+ N 个子任务" 展开全部子任务，展开后末尾显示"收起"按钮，再次点击收起。展开/收起时布局同步更新。
- for_each 父任务 evidence 规则：有 visible children（子任务数 ≤ `CHILD_COLLAPSE_THRESHOLD`(6) 或已展开）时不显示 evidence；无 visible children 时显示当前任务自身的结果 / 错误 / 进度。

最近验证：

- `npm --prefix apps/team-console run test`：164 passed
- `npm --prefix apps/team-console run build`：通过
- `git diff --check`：通过
- Chrome 桌面浏览器验证：`真实 run snapshot 2` 展开 13 个子任务后，滚轮缩放到 110%，点击“搜索引擎官方免费 API”不白屏，Worker / Checker / Watcher / Result evidence 正常显示，继续点击“最终结果”可打开二级预览。
- 控制台未捕获 `Maximum update depth exceeded`、passive wheel warning、"文件不在当前 attempt metadata 中"或"文件引用不属于当前任务"。

当前提交边界：

- 应提交的 tracked 改动集中在 `apps/team-console/**`、`apps/team-console/README.md`、`docs/team-runtime.md`、`docs/change-log.md`、`docs/handoff-current.md`。
- 不要提交未跟踪计划文件：`.codex/plans/*.md`。
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
