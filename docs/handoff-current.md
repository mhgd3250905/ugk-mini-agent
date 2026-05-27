# 当前交接快照

更新时间：`2026-05-27`

这份文档给新接手 `ugk-pi / UGK CLAW` 的 coding agent 看。它只记录当前稳定事实和接手入口；历史流水账看 `docs/change-log.md`。不要靠聊天记录拼现状，聊天上下文太肥时最容易把旧计划当新任务，挺蠢，也挺危险。

## 给新会话的第一条消息

可以直接把下面这段发给新的 coding agent：

```text
请接手 `E:\AII\ugk-pi`。你维护的是 ugk-pi 代码仓库，不是产品运行时 Playground agent，也不是 `.pi/skills` runtime skill。

开始前先读 `AGENTS.md`、`docs/handoff-current.md`、`docs/playground-current.md`、`docs/change-log.md`、`docs/traceability-map.md` 和 `DESIGN.md`。如果任务涉及 Chat / Agents / Conn 性能优化，直接看 `.codex/plans/2026-05-22-playground-chat-performance-handoff.md`、`.codex/plans/2026-05-22-playground-agents-performance-handoff.md`、`.codex/plans/2026-05-22-playground-conn-performance-handoff.md`。如果任务涉及 Qwen 思考流、GLM-5.1 上下文或模型源展示，先看 `docs/model-providers.md`、`docs/playground-current.md` 的 `2026-05-23` 条目和 `src/agent/agent-session-event-adapter.ts`。如果任务涉及 Team Console Task / WorkUnit，直接在 `E:\AII\ugk-pi` 的 `main` 上继续，读 `apps/team-console/README.md`、`docs/team-runtime.md`、`apps/team-console/src/app/App.tsx`、`apps/team-console/src/graph/ExecutionMap.tsx` 和 `apps/team-console/src/tests/app.test.tsx`；旧 worktree `E:\AII\ugk-pi\.worktrees\team-console-workunit-redesign` 已告一段落，不再作为后续开发入口。不要提交 `.codex/plans/*`、`.env`、`.data`、runtime 产物、temp 文件或未知 `.pi/skills/*/skills-lock.json`。

开始前执行 `git status --short --branch`、`git log -1 --oneline`、`git show -s --format="%h %s" stable/playground-performance-2026-05-22`、`git log --oneline stable/playground-performance-2026-05-22..HEAD` 和 `git remote -v`。当前稳定产品基线 tag 是 `stable/playground-performance-2026-05-22`，指向 `f0aa1fd docs(playground): preserve performance handoffs`，已推送到 GitHub `origin` 和 Gitee `gitee`。后续是否继续开发、规划、部署，要先按用户新任务判断，不要擅自加功能。

本地开发默认用 Docker：`docker compose up -d` 或 `docker compose restart ugk-pi`。固定产品入口是 `http://127.0.0.1:3000/playground`，Team Console 开发入口是 `http://127.0.0.1:5174/`，通过 Vite 同源代理转发 `/v1`、`/playground`、`/assets`、`/runtime`、`/vendor` 到真实 Docker 后端 `http://127.0.0.1:3000`；远程 FRP 访问 `5174` 时不要把 iframe 默认 base 写成 `127.0.0.1:3000`。不要开 `3100` 之类临时后端。不要提交 `.env`、`.data/`、runtime 临时产物、public 报告、截图、浏览器 profile、部署包或未明确归档的临时文件。
```

## 当前稳定基线

- 稳定 tag：`stable/playground-performance-2026-05-22`
- tag 指向：`f0aa1fd docs(playground): preserve performance handoffs`
- GitHub：`origin` -> `https://github.com/mhgd3250905/ugk-claw-personal.git`
- Gitee：`gitee` -> `https://gitee.com/ksheng3250905/ugk-pi-claw.git`
- 打 tag 时 `origin/main` 和 `gitee/main` 已同步到 `f0aa1fd`；后续如果 `main` 晚于 tag，先检查是否只是交接文档提交
- 本地工作区在打 tag / 推送后已清理未跟踪运行产物；新会话仍必须先执行 `git status --short --branch`

注意：远端 Git 已更新不等于生产服务器已部署。服务器更新仍要按 `docs/server-ops.md` 的增量流程执行，不能把 push 当上线。

## 2026-05-27 Team Console merge 后主线快照

Team Console Task / WorkUnit redesign 已通过 PR #1 合入 `main`：

- 主目录：`E:\AII\ugk-pi`
- 当前主线提交：`ed3414b feat(team-console): integrate Task WorkUnit redesign`
- `main` 与 `origin/main`：`0 / 0`
- 后续 Team Console 开发默认从主目录 `main` 继续，不再切回旧 feature worktree。
- Docker 后端 `3000` 应使用主目录挂载到容器 `/app`；Team Console Vite `5174` 应从 `E:\AII\ugk-pi\apps\team-console` 启动并代理到 `http://127.0.0.1:3000`。Team Console iframe 默认使用同源 `/playground?...`，Vite 再代理到后端；只有显式设置 `VITE_TEAM_CONSOLE_PLAYGROUND_BASE_URL` 时才用独立公网后端 origin。
- 用户本地产物 `E:\AII\ugk-pi\ugk-skills-hub\` 必须保留，不要移动或删除；它已加入本机 `.git/info/exclude`，不属于提交边界。
- 主目录里有合并前备份：`backup/main-pre-team-console-sync-2026-05-27` 指向 `9a764bb`，`stash@{0}` 是同步 main 前的 dirty 备份。不要随手丢弃这些备份。

最近主线验证：

- `npm run test:team`：966 pass / 2 skip / 0 fail
- `npm --prefix apps/team-console run test`：370 passed
- `npm --prefix apps/team-console run build`：通过
- `npx tsc --noEmit`：通过
- `git diff --check`：通过
- Docker `http://127.0.0.1:3000/healthz` 和 `http://127.0.0.1:3000/v1/team/healthz` 正常；`5174` 代理 `3000` 正常；`3100` 无监听。

本轮 Team Console 远程 `5174` 修复现场：

- 根因：Team Console 曾把 Vite 服务端代理目标 `TEAM_CONSOLE_API_TARGET=http://127.0.0.1:3000` 注入前端并作为 Agent / Leader iframe base URL；远程浏览器通过 `http://139.196.23.72:5174/` 打开时会误连用户自己机器的 `127.0.0.1:3000`。
- 已改：`apps/team-console/src/app/App.tsx` 默认生成相对 `/playground?...` iframe URL；`apps/team-console/vite.config.ts` 代理 `/v1`、`/playground`、`/assets`、`/runtime`、`/vendor` 和 playground logo 静态资源；`TEAM_CONSOLE_API_TARGET` 不再暴露到 `import.meta.env`。
- 当前 `5174` 已重启，监听 PID：`159668`；`3100` 无监听。
- 远程验证：`http://139.196.23.72:5174/playground?view=chat&agentId=main&embed=team-console` 返回主 `/playground` HTML（`<title>UGK Claw</title>`）；`http://139.196.23.72:5174/src/app/App.tsx` 中不再包含 `VITE_TEAM_CONSOLE_API_TARGET` 或 `http://127.0.0.1:3000`；`http://139.196.23.72:5174/v1/model-config` 正常返回。
- 已跑验证：`npm --prefix apps/team-console run test`（370 passed）、`npm --prefix apps/team-console run build`、`npx tsc --noEmit`、`git diff --check`。

## 2026-05-27 Team Console Task / WorkUnit 历史 worktree 快照

Team Console Task / WorkUnit redesign 的独立 worktree 已告一段落，仅作为历史现场保留：

- Worktree：`E:\AII\ugk-pi\.worktrees\team-console-workunit-redesign`
- 分支：`codex/team-console-workunit-redesign`
- 最新提交：`e77fc1f docs(team-console): document canvas task run admission scope`
- 当前 tracked feature diff 已收口；如果 `git status --short` 仍显示 tracked dirty，先确认是否为新的用户改动或未提交交接记录。
- 当前 untracked 仍有 `.codex/plans/*`、`.codex/skills/new-chat/`、`tmp-team-console-right-stack.png`；这些是本地协作 / 旧现场，除非用户明确要求，不要提交或删除。

已完成并提交：

- `1ecf7c6`：Team Console Live API 工具栏接入“文本输出 / 文件输出” Source 节点；文本 source 输出 `string`，文件 source 按扩展名推断 `md` / `json` / `html` / `string` / `file`。
- Source 节点作为独立根节点渲染在 Execution Atlas，可拖动、框选、收纳到左侧 Hub，并可连接到同类型 Task input port；本地只保存 source 节点坐标和 Hub 收纳 id，不保存 source 内容。
- Agent 对话分支、Task Leader 对话分支和 observer 文件详情面板支持标题栏双击最大化 / 还原，保留原标题栏拖动和右下角 resize。
- `ef0b718` / `1e50232` / `b40bf2f` / `db4a29d`：补齐 Agent / Task / Source 根卡清理入口；Task 和 Source 走软归档，Agent 只移出 Team Console 画布；归档失败保留节点和错误 banner；README 引号字符修复已单独收口。
- `540239e`：修复 Task 根节点归档失败时误清空确认状态的问题；`archiveTask()` 返回 boolean，失败时确认按钮仍保留。
- `5758218`：Leader 对话分支显示“当前 Task 上下文”只读文本和复制按钮，方便复制到 Leader 会话里修改 Task 规则；Team Console 仍不解析 iframe 聊天文本。
- `d0e35dd` / `0668d14` / `1fb9f25`：锁定 Task run 并发边界：不同 Task 可并行；同一 Task 同时只允许一个 active run；active run 轮询按 `taskId + runId` 独立收口，最后一个提交消除了并发测试的 React act warning。
- `88e757c` / `dfded62` / `a3aaab8` / `2d1a217`：锁定 typed Task output fan-out：同一个 output port 可连接到多个不同下游 Task 的同类型 input port；上游 accepted result 会独立分发给每个下游；单个下游失败不阻塞其他下游或回滚上游；文档明确不做 merge / wait-all / 条件分支 / 同 target 多 input bundling。
- `da702a2`：后端路由测试把 downstream bound input 收窄为 Task artifact，明确防止 Task-to-Task typed chain 被 canvas source artifact 混淆。
- 文档已同步：`docs/change-log.md`、`docs/team-runtime.md`、`apps/team-console/README.md`。

验证记录：

- `npm --prefix apps/team-console run test`：370 passed
- `npm --prefix apps/team-console run build`：通过
- `npx tsc --noEmit`：通过
- `git diff --check` / `git diff --cached --check`：通过
- `node --test --import tsx test\team-task-routes.test.ts`：17 passed
- `node --test --import tsx test\team-task-run-process.test.ts`：13 passed
- `node --test --import tsx test\team-task-run-routes.test.ts`：10 passed
- 浏览器真实 `http://127.0.0.1:5174/` 代理 Docker main `http://127.0.0.1:3000` 验证过 Source 创建、文件 md 推断、Source→Task 连接、Hub 收纳恢复、Agent 分支双击最大化 / 还原、文件详情双击最大化 / 还原；验证期间创建的临时 source / connection 已清理。
- Root archive、Leader context copy、Task run concurrency 和 fan-out 最近几轮浏览器自动验证受 Chrome profile / dev server 可用性影响未全部重跑；对应路径已有前端 / 后端回归测试覆盖。

已撤销的需求：

- 用户撤回“`string` input port 作为关键词参数槽”的特化设计。
- 后续不要实现：`string` 必填、缺少 `string` source 时阻止运行、同一 `string` input 自动替换旧 source、`team-task-creator` 自动生成 `query:string`。
- 保留通用能力即可：text source 输出 `string`，如果 Task 自身有同类型 input，可按普通 typed source 连接；`string` 不再有关键词 / 参数槽特殊语义。

推荐下一步：

1. 新会话先确认用户的新目标，不要继续推进已撤销的 `string` 参数特化计划。
2. 若继续做前端 UI，保持在 `apps/team-console/**`、`docs/team-runtime.md`、`apps/team-console/README.md`、`docs/change-log.md` 范围内；不改主 `/playground`，不改 `.pi/skills` runtime skill。
3. 只有用户明确要求后端 typed Task chain 行为变更时才动 `src/team/**`；普通 UI / 测试 / 文档需求不要顺手改 runtime。
4. 如果后续讨论“多个 upstream 合并到同一个 input”或“同一个 target Task 多 input 同时绑定”，先做需求设计，不要把它和已完成的 fan-out 混成一个功能。

## 2026-05-26 Team Console Task / WorkUnit 提交快照（最终稳定版）

当前 Team Console Task 功能已在独立 worktree 完成收口和最终测试稳定化：

- Worktree：`E:\AII\ugk-pi\.worktrees\team-console-workunit-redesign`
- 分支：`codex/team-console-workunit-redesign`
- 最新提交：以 `git log -1 --oneline` 为准；当前分支已完成 Team Console Task / WorkUnit redesign 收口和最终测试稳定化。
- `.codex/plans/*` 和 `.codex/skills/new-chat/` 仍是本地协作文件，按边界不要提交。

已完成的强化工作（按提交倒序）：

- 路由测试固定 sleep 移除：`archived task rejects` 测试 409 后直接查询 downstream（无 run 产生无需等待）；`stale downstream` 测试用 `waitForAttemptDelivery()` 等待真实 delivery loop 完成后再断言。
- Real Typed Chain Acceptance：验收矩阵全部闭合 — TaskA accepted result → typed artifact（`sourceAttemptId`/`sourceOutputPortId`）→ TaskB auto-start → 下游发现 → downstreamDelivery outcome（`delivered`）→ timing fields → Plan run 隔离。
- Typed Artifact Handoff 模块：隔离 artifact handoff 逻辑和测试，稳定断言避免 background delivery cleanup race。
- Downstream Delivery Outcomes：记录 `delivered`/`skipped`/`failed` 三种下游投递结果，stale connection 记录 `staleReason`。
- Typed Chain Rule 模块：集中 typed task chain 校验规则。
- Connection Persistence Hardening：收紧 task connection 变更锁。
- Stale Connection Lifecycle：完整覆盖 stale port type mismatch / archived task 拒绝 / stale 下游不影响上游成功。
- Typed Artifact Prompt Contract Hardening：`formatBoundInputsForPrompt()` 输出完整追溯 metadata + `BEGIN_TYPED_ARTIFACT_CONTENT` / `END_TYPED_ARTIFACT_CONTENT` 内容块。

功能能力（与上一版一致，无新增功能）：

- Team Console 已支持 Task 创建入口、浅编辑、软删除、Leader 对话 iframe、Task run 启动 / 停止和 Run observer。
- Typed Task Chain V1：WorkUnit 声明 `inputPorts` / `outputPorts`，连接校验 `output.type === input.type`、非重复、非自连接、非环；上游 run 成功后自动触发下游。
- Task run observer 聚合面板、层级拖动、连接曲线和 source socket 视觉收口。
- V1 边界保持克制：不做任意复杂画布编排、条件分支、循环、SSE。

最终验证记录：

- route test（`test/team-task-run-routes.test.ts`）：8 passed
- backend full gate（8 个 team test 文件）：117 passed
- frontend test（`apps/team-console`）：346 passed
- frontend build（`apps/team-console`）：通过
- `npx tsc --noEmit`：通过
- `git diff --check`：通过
- touched files EOL：`i/lf w/lf`
- 计划规范差异：`triggeredBy` 类型不含 `fromOutputPortId`，output port 通过 `connectionId` 追溯，不影响功能正确性

推荐下一步：

1. 此分支已完成最终测试稳定化。下一个 agent 应聚焦最终 review / 集成 / PR 或用户指定的后续任务，不要继续无边界 UI 打磨或功能扩展。
2. 若后续集成后端提交，先做逐提交 `git show` / patch-id 审计，确认不会回退 `TaskConnectionStore`、typed port contract、accepted artifact 自动下游触发和相关测试。
3. SSE 观察流仍是后续后端能力；当前 Run observer 仍是轮询版本，不要在前端硬造假实时流。

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
