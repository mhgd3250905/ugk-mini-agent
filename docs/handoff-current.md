# 当前交接快照

更新时间：`2026-06-11`

这份文档只记录当前接手所需事实。历史流水账不要塞回来；需要追溯旧阶段时用 Git 历史、专题文档和 `docs/change-log.md`。若本文件与当前用户提示、`git status` 或真实运行结果冲突，以后者为准。

## 当前维护边界

- 当前维护对象：Team Console / Canvas Task / Conn `team_group` / Discovery，以及本轮已收口的主 `/playground` Chat UI polish。
- 本轮新增维护对象：API 源管理入口 `/playground/model-sources` 与模型 provider runtime overlay；主 `/playground` Chat 已完成视觉收口，后续没有明确用户要求时不要继续扩展重做。
- 当前新增治理对象：代码库大文件风险治理 / 模块化优化。当前优先阶段是先拆最危险的超级测试文件；测试拆分阶段约 95%，整体大文件治理约 57%。后续仍需继续治理剩余 1000+ 行测试文件、Team Console/CSS 超大文件、`App.tsx`、`ExecutionMap.tsx` 和 `playground-styles.ts` 等。
- 当前执行方式：每个拆分小步由 subagent 负责实施，主会话只做独立审核、验证、精确 stage/commit 和文档落地。subagent 不允许 stage/commit。
- 不维护：无关 `.pi/skills/**` runtime skill、运行时 public 产物、`.data`。
- 固定 Team Console 本地入口：`http://127.0.0.1:5174/`。
- 固定主后端入口：`http://127.0.0.1:3000`。
- Team Console Live API 通过 `5174` 同源代理访问 `/v1`、`/playground`、`/assets`、`/runtime`、`/vendor`。

## 接手先读

1. `AGENTS.md`
2. `docs/handoff-current.md`
3. `docs/change-log.md`
4. `apps/team-console/README.md`
5. `docs/team-runtime.md`
6. `docs/runtime-assets-conn-feishu.md`
7. `docs/docker-local-ops.md`

## 当前 Git 现场

- 当前分支：`main`。
- 本轮 Git 保存范围：Team Task 模板参数 `inputType` 合同、Team Console / Discovery / Group 命名链路、Task Leader mini/full iframe 对齐、主 `/playground` Chat 视觉 polish、相关测试和文档；以及正在推进的代码库大文件治理测试拆分提交。
- 截至本快照，最新代码拆分提交为 `8f2155c9 Split discovery dispatcher rerun tests`。本地 ahead 数会随文档提交继续增加，远端同步状态仍以实时 `git status --short --branch` 和 `git log --oneline origin/main..HEAD` 为准。
- `origin`：GitHub `https://github.com/mhgd3250905/ugk-claw-personal.git`。
- `gitee`：`https://gitee.com/ksheng3250905/ugk-pi-claw.git`。
- 不要提交这些本地未跟踪物件：`.codex/plans/2026-06-07-discovery-channel-set.md`、`.codex/plans/2026-06-08-api-source-management.md`、`docs/windows-native-runtime-feasibility.md`、`Find_Old_Google_Root_Key_Source.md`、`Google_Root_Cert_Update_Report.md`、`public/chat-background-reference.html`、`public/rsa-root-cert-report.html`、runtime 数据、截图、报告、临时文件。

继续工作前先执行：

```powershell
git status --short --branch
git log -5 --oneline
git diff --stat
git diff --cached --stat
git log --oneline origin/main..HEAD
```

## 当前已完成事实

- 大文件治理测试拆分当前批次已完成并本地提交到 Step93。近期提交包括 `e61e8e19 Split playground conversation history route test` 到 `8f2155c9 Split discovery dispatcher rerun tests`，覆盖 playground route shell、Team orchestrator dynamic/decomposition、ConnWorker lifecycle 和 Discovery dispatcher rerun 等测试拆分。每步均按 focused tests、combined tests、`npx tsc --noEmit`、`npm run code:size -- --limit 45`、`git diff --check` 验证；涉及 Team Console 的步骤另跑对应 Vitest/build。
- 后续继续拆分时，先用 `npm run code:size -- --limit 45` 和当前 diff 判断下一块，优先按“同文件、同主题、低耦合连续块”一次移动 2-9 个测试；遇到依赖交织再退回更小块。不要把 `.codex/plans/**`、报告 Markdown/HTML、runtime 产物或 public 报告文件纳入提交。
- Team Task 模板参数已支持 typed input contract。`templateConfig.parameters[].inputType` 支持 `text`、`textarea`、`email`、`email_list`、`number`、`select`；旧模板缺字段按 `text` 兼容读取。运行和保存时绑定快照仍保持 `Record<string,string>`，但后端会校验邮箱、邮箱列表、数字和下拉选项，`email_list` 支持逗号、分号和换行分隔后归一化。
- Team Console 模板参数面板和复制面板会按 `inputType` 渲染控件：`textarea` 用多行输入，`select` 用下拉，`email` / `number` 使用对应 HTML input 类型，`email_list` 提交前归一化。`task_8dc366711f37` 这类可填写参数 Task 可直接通过 UI 测试。
- Team Console Task 操作菜单里的“对话 Leader”已和普通 Agent 对话分支对齐：普通 Task Leader 子面板 iframe 使用 `embedMode=mini`，最大化 overlay 使用 `embedMode=full`。Task child panel 支持 `maximizedPanel`，避免小窗和最大化共用同一份 iframe URL。
- `/team-task` skill 已补充自然语言设计引导：用户不需要知道 `templateConfig`、`inputType`、`inputPorts` 等内部字段；skill 必须用业务语言询问收件人、邮件标题、邮件正文来源等，再自行映射为模板参数和 typed ports。
- API 源管理工作台已实现：`/playground/model-sources` 可查看 bundled/custom provider、查看全局默认 / Agent profile / Conn 的有效使用绑定，并在同页修改可编辑对象绑定的 provider/model。
- `/playground/agents` 与 `/playground/conn` 已切换到共享 `ops-workbench` 视觉系统，和 `/playground/model-sources` 保持同一套管理工作台密度、色彩 token、卡片/列表/详情布局和轻量背景。旧 cockpit 动画背景不再作为这两个管理页的主题入口。
- `/playground/conn` 移动端列表/详情切换已修复：选择任务时显式隐藏列表并显示详情，点击详情返回按钮时恢复列表，不再出现列表和详情同时隐藏。
- 自定义 API 源新增合同已实现：`POST /v1/model-sources/providers` 写入运行态 `.data/agent/model-providers.json` 或 `UGK_MODEL_PROVIDERS_PATH`，只接受 `apiKeyEnvVar`，拒绝明文 `apiKey`。`.data/agent/effective-models.json` 是合并派生 registry，不要提交。
- 使用绑定修改合同已实现：`PATCH /v1/model-sources/usages/global/default` 修改全局默认；`agent/:agentId` 修改自定义 Agent 默认模型，`main` 主 Agent 跟随全局默认且不可作为独立 Agent 修改，运行中 Agent 会拒绝切换；`conn/:connId` 修改 Conn 显式模型绑定。
- 模型解析链路已改为读取 bundled + runtime custom 合并 registry：`/v1/model-config`、Agent session factory 和 background agent session factory 都能识别运行态新增 provider。
- Discovery root Task 已支持渠道集复用。用户可在 Team Console Discovery 子画布勾选 active generated child Tasks，保存为渠道集；渠道集保存 generated child 的 discovery item payload、WorkUnit snapshot 和来源 trace，不保存 run output。
- 新增 `GET /v1/team/tasks/:taskId/discovery-channel-sets`、`POST /v1/team/tasks/:taskId/discovery-channel-sets`、`PATCH /v1/team/tasks/:taskId/discovery-channel-sets/:channelSetId` 和 `POST /v1/team/tasks/:taskId/discovery-channel-sets/:channelSetId/archive`。持久文件为 `.data/team/discovery-channel-sets.json`。
- `POST /v1/team/tasks/:taskId/runs` 新增可选 `discoveryChannelSetId`。Discovery root 使用同源未归档渠道集运行时，会跳过 root rediscovery/dispatcher，写出标准 `discovery-result.json` / `discovery-aggregation.json`，并按既有 auto-run 语义启动保存的 generated child runs。
- Team Console 子画布新增“渠道集”面板：显示选择数量、名称输入、保存/清空、已保存渠道集列表、使用渠道集和归档操作。generated child card 左上角有渠道选择 checkbox，选中态使用 `is-channel-selected` / `data-generated-channel-selected`。
- Team Console Discovery 子画布 `generated Task 网格` 已新增“全选有效项 / 取消全选”。该操作只选择 active generated Tasks，不会把 `stale hidden` 旧项带入渠道集；标题栏另显示 `selected X/Y`。
- Team Console 已保存渠道集支持选中查看：点击渠道集名称区域会把该集合标为 selected，名称输入切到集合标题，并自动勾选下方 generated Task 网格中属于该集合的 items；`使用渠道集` 仍是独立运行动作。
- Team Console 已保存渠道集支持原地编辑和另存：选中集合后，修改名称或 generated Task checkbox 不会取消 selected；主按钮切为“更新渠道集”，提交走 `PATCH /v1/team/tasks/:taskId/discovery-channel-sets/:channelSetId` 更新原集合。选中集合时还会显示“另存为新集合”，用当前名称和勾选项走 `POST` 新建一套渠道集，避免想新建时只能更新原集合。未选中已有集合时仍按原逻辑“保存渠道集”新建；“清空选择”会退出编辑态。
- Discovery root Task 已支持持久默认运行策略 `discoveryRunPolicy`。缺省或 `{ mode: "rediscover" }` 表示正常重新发现；`{ mode: "channel_set", channelSetId }` 表示后续 root run 默认使用该渠道集。策略保存在 Discovery 根任务上，因此直接运行、GroupRun 和 Conn 定时触发的 GroupRun 都会继承；`POST /v1/team/tasks/:taskId/runs` 显式传入 `discoveryChannelSetId` 仍优先。
- Team Console Discovery 子画布渠道集面板新增“默认运行”状态。保存的渠道集可点击 `设为默认`，当前默认渠道集显示 `默认运行` 并高亮；面板可点击 `恢复正常运行` 切回 rediscovery。`使用渠道集` 仍是立即运行一次，不等于修改默认策略。
- Team Console Discovery 子画布已修复渠道集 run 状态投影：当 Discovery root run 带 `source.discoveryChannelSetId` 时，generated child card 按 child run 的 `triggeredBy.discoveryRunId` 显示本轮状态，不再被旧 `generatedSource.latestDiscoveryRunId` 过滤掉；网格 `queued` 计数只统计真正 queued 的卡片，不再把未参与本轮渠道集 run 的 idle channels 全部算作 queued。
- Team Task Group 后端持久 contract 已完成。Group definition 允许保存 empty/invalid membership；read model 通过 `ResolvedTeamTaskGroup.status/headTaskIds/validation.errors` 表达语义状态。
- Team Task GroupRun 后端 contract 已完成。GroupRun start 才硬拒绝 empty/invalid Group，返回 400 `invalid task group`；active guard 仍返回 409。GroupRun 保存 `definitionSnapshot`，刷新/取消优先使用 snapshot membership。
- GroupRun 完成态已按 Group 内真实 Task 流水线聚合。Discovery generated child run 保留诊断和取消用途，但不再一票否决主 GroupRun 终态。
- Team Console Live backend Group 创建、归档、展示态和 membership 编辑已完成。Live Group 不会因 `taskIds=[]` 或成员节点不可见而消失；支持添加当前选中 Task、移除成员、显示 `0 Tasks`；empty/invalid Group 的运行按钮禁用并展示后端 validation message。
- Team Console 展开的 Live backend Group frame 已支持“命名”固定 Group definition。改名复用 `PATCH /v1/team/task-groups/:groupId` 的 `title` 字段，不新增 GroupRun 级别别名；已上锁 Group 不允许改名，Conn editor 和 `/playground/conn` 继续读取同一个后端 Group title。
- Team Console Group 顶部成员控制带已返修：非空展开 Group 的控制带不再覆盖 Task card，未提升 Group frame z-index，也未改 Task node pointer-events。
- Team Console 展开 backend Group 的成员 chip 已改为按 Group 内任务链分行：优先用 `ResolvedTeamTaskGroup.headTaskIds`，每个 head 一行，并沿 active internal `TeamTaskConnection` 顺着 downstream Task 展示；不要再按视觉 y 坐标、x 坐标或原始 `taskIds` 顺序理解。
- Team Console 展开 Group frame 已完成窄屏 polish：最小宽度优先保证操作按钮显示，`1 Task` 使用单数，底部参数区域有上方留白，`groupId` 使用类似 Task id 的可点击复制 chip。
- Team Console 运行记录已改成时间线列表：仅保留开始时间、状态、执行时间，以及 `装载记录` / `标为最佳` / `归档记录` 三个操作。`runId`、结果产物、触发来源、已装载/最佳/归档徽标与 note 不再作为可见内容展示，只保留必要 `data-*` 状态给交互和测试。
- Team Console 运行观察右上角只显示输入来源标记：`手动上游输入` 或 `自然运行流入`。不再展示 `connectionId`、upstream run、artifact、fileRef 等内部账本字段。
- Discovery 子画布 generated Task 打开的运行历史面板已重新锚定到对应子画布 panel，不再从上一级 root Task 菜单引线；`ExecutionMap` panel DOM 暴露 `data-panel-source-id` 用于回归验证。
- Discovery 子画布打开时，root Task 菜单里的“运行记录”不再挂到子画布下一级；点击后会关闭 Discovery 子画布，并把 Discovery root Task 运行记录作为同级 Task child panel 展开。generated card 点击运行记录仍保留在子画布下一级，并使用 `generated-run-history-*` 布局 id，避免和 root `run-history-*` 混用拖拽位置。
- Team Console run history 条目已恢复运行观察展开：运行记录卡片整卡可点击选中/展开 observer，行内 `装载记录` / `标为最佳` / `归档记录` 会阻止冒泡，不会误打开 observer。Discovery root 最近运行 observer、root run history observer、generated run history observer 使用不同 panel id，避免拖拽位置串用。
- Team Console run history 深色 selected 行已收口：操作按钮保持暗色表面，不再被浅色 selected button 样式覆盖。run observer 外层 `.emap-run-observer-panel` 不再做大滚动，保持 `max-height: none` / `overflow: visible`；Worker / Checker 过程区仍保持固定高度与内部滚动。
- Team Console Agent 卡片展开已改成 mini/full 两阶段对话。普通画布分支 iframe 使用 `embedMode=mini`，只展示新会话、上下文用量、消息区和输入框；新会话固定左侧，上下文用量固定右侧，API 源不再单独占位；新会话 tooltip 在 mini 内左对齐弹出，不被 iframe 左边缘裁切。最大化 overlay 使用 `embedMode=full`，恢复完整 Playground。Agent/Leader iframe 已加 `clipboard-write; clipboard-read` 权限，嵌入气泡“复制正文”按钮会调用 `navigator.clipboard.writeText(...)`。
- Team Console Task 编辑面板深色模式下 Agent select option 已显式使用暗色背景和亮色文字，避免原生下拉白底浅字。
- Team Console Task 运行记录面板已改为轻量分页：首屏只请求 3 条 summary + total，点击“加载更多”再按 3 条追加；`/v1/team/tasks/:taskId/run-history` 新增 `hasMore`，并改用 run state index summary 路径，避免 history 列表读取完整 run state 后再截断。运行记录列表浅色/深色 scrollbar 已使用主题样式，不再退回系统白色滚动条。
- Team Console 根 Task 节点 selected 视觉焦点已与 Task branch stack 解耦。节点阴影现在跟随“最后点击的 Task”，不再跟随“最后仍展开的 Task 分支”；A/B/A 场景中第三次点击 A 会收起 A 的 Task 操作面板，但 A 仍保持 selected，B 的展开面板可继续存在。
- Team Console Task 最近运行 / 运行观察子面板已允许向画布原点上方拖动。Task child panel 布局不再把用户拖拽产生的负 `y` override 钳到 `0`；`x` 轴现有非负限制保持不变。
- Team Console 根节点筛选已整合数量统计：`ALL`、`Agent`、`Task`、`Source` 四个筛选项直接显示数量，独立统计块已移除；`Task` 筛选只显示 Task，Source 走独立筛选。
- Team Console Dock 已区分 Group 成员 Task 和根级 Task。Group 内 Task 拖到底部 Dock 区域不会触发收纳；展开 Group 可点击“收纳”把整个 Group 收入 Dock，Dock 中以 Group 对象展示并可恢复，不会把 Group 成员拆成独立 Dock Task。
- Mock 工作区初始化会合并 Discovery catalog 返回的 root/generated run summary，Dock 和画布状态能显示最新 run status，不再退回静态 Task `ready`。
- Team Console 初始加载流畅性已优化：Live hydration 不再触发无意义首次 layout PATCH，restore loading 最短显示时间收敛到 160ms，loading skeleton 切换到 workspace 时不再产生明显 layout shift。
- Team typed artifact 下游交付已改为 file-first：typed connection 触发 worker 前，runtime 会把每个上游 typed artifact 的完整文件复制到当前 worker attempt `work/bound-inputs/`，prompt 只保留预览和追溯信息，不再把 30KB 截断内容当“唯一上游数据来源”。超限 artifact 会标记 `contentTruncated` 和 `originalContentLength`。
- Conn 后端 `execution.type = "team_group"` 已完成。`team_group` Conn 保存为 `execution: { type: "team_group", groupId }`，不写进 `target.type`，也不要求 prompt。
- Conn worker 可调度 Team GroupRun。空 body POST 不携带 `content-type: application/json`，避免 Fastify 在 route 前返回 `400 Bad Request`。
- Conn worker 对 `team_group` start failure 已补齐诊断：non-2xx/non-409 GroupRun start 会让 ConnRun `failed`，并写入 `resolvedSnapshot.executionType="team_group"`、`groupId`、`groupRunStartStatus`、`groupRunStartError`。409 active guard 仍是 `succeeded` skipped。
- `/playground/conn` 新界面和旧 `/playground` Conn manager 都能展示 Team Group run detail。即使没有 `groupRunId`，只要 snapshot 有 `groupId` 或 start failure 字段，就显示 Team Group block、Group JSON、start status/error；GroupRun JSON 只在有 `groupRunId` 时显示。
- Conn editor 仍禁止保存 invalid/empty Group：选项显示 `（不可运行）` 且 disabled，保存 guard 仍提示 `请先选择可运行的 Team Group`。

## 当前运行态

- 用户已有每天早上 4 点的 Conn：`b1d7cc3c-4784-42ef-b0b4-e9cdcc0a0b04`。
- 当前相关 Group：`group_68c7cb331d7b`。
- 截至本次收口只读验证，`/v1/team/task-groups` 返回该 Group 为 `status="valid"`，共 7 个 Task，`headTaskIds=["task_ec690cdc8bd4","task_99e064aea8e3"]`。
- 5174 Live 画布已验证该 Group 展开后显示 2 条成员链：
  - `task_ec690cdc8bd4` -> `task_977d44da2fb9` -> `task_e1846fa41c83` -> `task_8dc366711f37`
  - `task_99e064aea8e3` -> `task_d4b860b66d3c` -> `task_2191fd7de5de`
- `/playground/conn` 新界面此前只读验证确认 invalid Group option 会显示 `不可运行` 且 disabled；当前 Group 已被用户调整为 valid，后续 Conn 新建/选择以实时 API 为准。
- 不要手工 POST API 干预这条真实用户链路，除非用户明确要求取消/重跑。
- 2026-06-07 真实回归验证：用户手动对 `task_977d44da2fb9` 装载上游 Discovery run `run_fad1b2520fac` 后启动下游，得到 `run_403121ab8f10`。该 run 已 `completed/succeeded`，worker 读取了 `tasks/task_977d44da2fb9/attempts/attempt_0472a49317ac/work/bound-inputs/01-artifact_e450cf2b3925-discovery-aggregation.json`，完整输入 `itemsLength=48`、`succeeded=46`、`failed=2`，输出 `agent-workspaces/attempt_0472a49317ac/worker/output/structured-report.json`。
- 2026-06-07 渠道集真实运行验证：用户保存的 `测试集合1` 为 `channel_set_e8a707c669e2`，包含 `task_2210950f4d83` 和 `task_86481d61ebe4` 两个 generated channels。用户点击“使用渠道集”后启动 root run `run_09b7bf5a1644`，该 run 已 `completed` 且 `source.discoveryChannelSetId="channel_set_e8a707c669e2"`；对应 child run 为 `run_94ee1ed1b857`（failed，模型返回 `InvalidParameter` content filter）和 `run_73e5f5a33646`（completed）。

## 本轮最终验证

- Task edit Agent select dark popup contrast 验证：
  - `npm --prefix apps/team-console test -- --run src/tests/app-static-contracts.test.ts`：32/32 pass。
  - `npx tsc --noEmit`：pass。
  - `git diff --check`：pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - 本地服务已重启：`ugk-pi-team-console` healthy。Browser `http://127.0.0.1:5174/` 确认页面已加载 `[data-theme="dark"] .task-edit-field select option` 暗色规则和 `color-scheme: dark`。
- Discovery active generated select-all 验证：
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx src/tests/app-static-contracts.test.ts`：123/123 pass。
  - `npx tsc --noEmit`：pass。
  - `git diff --check`：pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - 本地服务已重启：`ugk-pi-team-console` healthy，`http://127.0.0.1:5174/` 返回 200。Browser 在示例 Discovery 子画布验证：`generated Task 网格` 显示 `全选有效项` 和 `selected 0/1`；点击后变为 `取消全选`、`selected 1/1`，只选中 active generated card；再次点击恢复 `selected 0/1`。
- Team Group definition naming 验证：
  - `npm --prefix apps/team-console test -- --run src/tests/app-connections.test.tsx src/tests/app-static-contracts.test.ts src/tests/team-api.test.ts`：178/178 pass。
  - `npx tsc --noEmit`：pass。
  - `git diff --check`：pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - 本地服务已重启：`ugk-pi-team-console` healthy，`http://127.0.0.1:5174/` 返回 200。Browser 刷新 `http://127.0.0.1:5174/` 后，展开 Group frame 显示 `命名 Group 1`；点击后出现 `Group 名称 Group 1` 输入框、`保存` 和 `取消`，取消后编辑态收起。
- Team Task Leader mini chat 验证：
  - `npm --prefix apps/team-console test -- --run src/tests/app-task-leader.test.tsx src/tests/app-branch-windowing.test.tsx`：23/23 pass。
  - `npx tsc --noEmit`：pass。
  - `git diff --check`：pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - Browser `http://127.0.0.1:5174/`：重启 `ugk-pi-team-console` 并硬刷新后，Task 操作菜单“对话 Leader”小窗 iframe URL 为 `embedMode=mini`；点击“最大化对话分支”后 overlay iframe URL 为 `embedMode=full`。
- Team Task typed template parameters 验证：
  - `node --test --test-concurrency=1 --import tsx test/team-task-store.test.ts test/team-task-routes.test.ts test/team-task-run-process.test.ts test/team-task-creator-skill.test.ts`：157/157 pass。
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx src/tests/team-api.test.ts src/tests/app-static-contracts.test.ts`：231/231 pass。
  - `npx tsc --noEmit`：pass。
  - `git diff --check`：pass。
  - 本地服务已重启：`ugk-pi` healthy，`ugk-pi-team-console` healthy，`ugk-pi-team-worker` 已重启；`http://127.0.0.1:3000/healthz` 返回 `{"ok":true}`，`http://127.0.0.1:5174/` 返回 200，`GET /v1/team/tasks` 返回 200。
- Agents / Conn workbench refresh 验证：
  - `node --test --import tsx --test-name-pattern "standalone conn page follows the ops workbench visual system|standalone conn page keeps mobile list-detail navigation visible|standalone agents page follows the ops workbench visual system|GET /playground/agents|GET /playground/conn" test/server.test.ts`：24/24 pass。
  - `npx tsc --noEmit`：pass。
  - `git diff --check`：pass。
  - 重启标准 `ugk-pi` 后，`http://127.0.0.1:3000/healthz`、`/playground/agents`、`/playground/conn` 均返回 200，两个页面 HTML 均包含 `data-standalone-theme="ops-workbench"`。
  - Browser 实测：`/playground/agents` 桌面端显示 4 个统计卡、11 个 Agent、详情面板；移动端列表/详情正向切换和返回列表正常。`/playground/conn` 桌面端显示 5 个统计卡、10 个任务、详情面板；移动端任务列表进入详情和返回列表正常。两页 console 无 error/warn。
- API 源管理验证：
  - `node --test --import tsx test/model-sources-routes.test.ts test/model-sources-page.test.ts`：5/5 pass。
  - `node --test --import tsx test/model-provider-store.test.ts test/model-config.test.ts test/agent-session-factory.test.ts test/model-sources-routes.test.ts test/model-sources-page.test.ts`：42/42 pass。
  - `npx tsc --noEmit`：pass。
  - `git diff --check`：pass。
  - Browser `http://127.0.0.1:3000/playground/model-sources`：重启标准 `ugk-pi` 后页面加载正常，统计显示 6 个 provider / 22 个使用对象；控制台无 error/warn；左侧搜索框与 provider 列表无重叠；新增 API 源弹层只暴露 `API Key Env Var`，未提供明文 key 输入框。未提交表单，未修改真实运行态 provider 或对象绑定。
- Discovery channel set 本轮验证：
  - Discovery root 默认运行策略验证：新增后端回归覆盖 `PATCH /v1/team/tasks/:taskId` 保存 `discoveryRunPolicy` 后，无参数 `POST /v1/team/tasks/:taskId/runs` 会自动写入 `source.discoveryChannelSetId`；新增 GroupRun 回归覆盖 `POST /v1/team/task-groups/:groupId/runs` 从 Discovery 根任务继承默认渠道集策略。
  - Team Console 默认运行策略验证：新增前端回归覆盖点击保存渠道集的 `设为默认` 会发 `PATCH /v1/team/tasks/:taskId`，payload 为 `{ discoveryRunPolicy: { mode: "channel_set", channelSetId } }`；点击 `恢复正常运行` 会保存 `{ mode: "rediscover" }` 并恢复 UI。
  - `node --test --import tsx test/team-discovery-channel-set-routes.test.ts`：4/4 pass。
  - `node --test --import tsx test/team-task-group-run-routes.test.ts`：18/18 pass。
  - `node --test --import tsx test/team-task-run-process.test.ts`：53/53 pass。
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx src/tests/team-api.test.ts src/tests/app-static-contracts.test.ts`：230/230 pass。
  - `npx tsc --noEmit`：pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - `git diff --check`：pass。
  - Browser `http://127.0.0.1:5174/` Live API：重启 `ugk-pi-team-console` 后硬刷新，真实 `task_ec690cdc8bd4` Discovery 子画布渠道集面板显示 `默认运行：正常重新发现`；保存的 `有效渠道0607` 渠道集行显示 `设为默认运行`、`使用渠道集`、`归档`。未点击 `设为默认运行`，未修改真实任务默认运行策略。
  - 渠道集编辑修复验证：新增回归覆盖点击已保存渠道集后，继续修改 checkbox 和名称时 selected row 不被清掉，主按钮显示“更新渠道集”，提交发 `PATCH /v1/team/tasks/:taskId/discovery-channel-sets/:channelSetId`，且不会发重复 `POST`。
  - 渠道集另存修复验证：新增回归覆盖选中已有集合后，修改名称和 checkbox，再点击“另存为新集合”会发 `POST /v1/team/tasks/:taskId/discovery-channel-sets`，不会发 `PATCH` 更新原集合；新集合会加入列表。
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx -t "updates the selected live Discovery channel set"`：1/1 pass。
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx -t "saves the selected live Discovery channel set edits as a new set"`：1/1 pass。
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx src/tests/team-api.test.ts src/tests/app-static-contracts.test.ts`：229/229 pass。
  - `npx tsc --noEmit`：pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - Browser `http://127.0.0.1:5174/` Live API：重启 `ugk-pi-team-console` 后点击真实 `测试集合1` 的“选中渠道集”，确认面板显示名称输入为 `测试集合1`、主按钮为 `更新渠道集`，并额外显示 `另存为新集合`；未点击“更新渠道集”或“另存为新集合”，未修改真实渠道集持久数据。上一轮验证也确认临时增删 checkbox 后 row 仍 `data-discovery-channel-set-selected="true"` / `is-selected`。
  - 渠道集选中查看修复验证：新增回归覆盖点击已保存渠道集后，row 暴露 `data-discovery-channel-set-selected="true"`，名称输入切到集合标题，下方 generated card checkbox 自动切换为该集合 items；切换另一个集合会同步切换勾选。
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx -t "selects a saved Discovery channel set"`：1/1 pass。
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx src/tests/app-static-contracts.test.ts`：119/119 pass。
  - `npx tsc --noEmit`：pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - `git diff --check`：pass。
  - Browser `http://127.0.0.1:5174/` Live API：重启 `ugk-pi-team-console` 后点击真实 `测试集合1` 的“选中渠道集”按钮，确认 row class 为 `is-selected`，`data-discovery-channel-set-selected="true"`，名称输入为 `测试集合1`，`task_86481d61ebe4` 和 `task_2210950f4d83` 两张 generated card 均 `data-generated-channel-selected="true"` / checkbox `aria-checked="true"`；未点击“使用渠道集”，未启动新 run。
  - 渠道集 run visibility 修复验证：新增回归先红后绿覆盖 `source.discoveryChannelSetId` 的 root run 复用旧 generated catalog 时，子画布仍能按 `triggeredBy.discoveryRunId` 显示本轮 generated child run；普通新 Discovery root run 隐藏旧 child run 的保护用例仍通过。
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx -t "channel-set generated child runs|clears stale generated child run status"`：2/2 pass。
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx src/tests/app-static-contracts.test.ts`：118/118 pass。
  - `npx tsc --noEmit`：pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - `git diff --check`：pass。
  - Browser `http://127.0.0.1:5174/` Live API：重启 `ugk-pi-team-console` 后打开 `task_ec690cdc8bd4` Discovery 子画布，真实页面网格显示 `0 running · 0 queued · 45 done · 3 failed · 70 stale hidden`；前两张卡为渠道集里的 JAMA/BMJ channels，分别 `data-generated-visual-state="done"` / `"failed"` 且 `data-generated-run-scope="current"`。
  - `node --test --test-concurrency=1 --import tsx test/team-discovery-channel-set-routes.test.ts test/team-task-run-process.test.ts test/team-task-run-routes.test.ts`：组合运行 97/98 pass，唯一失败为 Windows 临时目录清理 `ENOTEMPTY ...\task-runs\runs`；随后单独重跑 `node --test --test-concurrency=1 --import tsx test/team-task-run-process.test.ts`：53/53 pass，确认不是行为断言失败。
  - `npm --prefix apps/team-console test -- --run src/tests/team-api.test.ts src/tests/app-live-data.test.tsx src/tests/app-static-contracts.test.ts src/tests/app-run-observer.test.tsx`：264/264 pass。
  - `npx tsc --noEmit`：pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - `git diff --check`：pass。
  - Browser `http://127.0.0.1:5174/`：重启 `ugk-pi-team-console` 后在 mock Discovery 子画布确认渠道集面板、名称输入、保存/清空按钮和 generated child 选择 checkbox 渲染；勾选 `核查 Vultr 公开证据` 后面板从 `0 selected` 变为 `1 selected`，保存/清空按钮解除禁用。未切到 Live API，未改真实用户链路。
- Typed artifact file-first handoff 修复验证：
  - `npx tsx --test test/team-task-artifact-handoff.test.ts`：15/15 pass。
  - `npx tsx --test test/team-task-run-process.test.ts`：52/52 pass。
  - `npm run test:team`：1255 pass，2 skip，0 fail。
  - `npx tsc --noEmit`：pass。
  - `git diff --check`：pass。
  - 真实 run `run_403121ab8f10`：确认 plan 使用 `BEGIN_TYPED_ARTIFACT_PREVIEW`，不含旧 `BEGIN_TYPED_ARTIFACT_CONTENT` 和“唯一上游数据来源”；物化文件为完整 48 渠道，最终 task succeeded。
- Discovery root 运行记录 panel 层级修复验证：
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx -t "opens Discovery root run history as a sibling panel|opens and closes generated Task run history"`：2/2 pass。
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx -t "runs a mock generated Task and opens its observer and file detail"`：pass；覆盖 generated history 整卡点击展开 observer，且行内操作按钮不会误触发 observer。
  - `npm --prefix apps/team-console test -- --run src/tests/app-static-contracts.test.ts src/tests/app-live-data.test.tsx src/tests/app-run-observer.test.tsx`：153/153 pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - `npx tsc --noEmit`：pass。
  - `git diff --check`：pass。
  - Browser `http://127.0.0.1:5174/`：确认 `ugk-pi-team-console` 重启后 `/src/app/App.tsx` 包含 `data-run-observer-card-action`、`stopPropagation`、`toggleRunHistoryObserver`；`/src/app/app.css` 包含 `max-height: none`、`overflow: visible`、暗色 selected action 背景标记。深色模式 computed style 确认 observer 外层 `max-height: none` / `overflow-y: visible` 且 `scrollHeight === clientHeight`，selected action 背景为 `rgba(8, 14, 24, 0.78)`。
- Agent branch mini/full chat embed 验证：
  - `npm --prefix apps/team-console test -- --run src/tests/app-mock-branches.test.tsx src/tests/app-branch-windowing.test.tsx src/tests/app-task-leader.test.tsx src/tests/app-live-data.test.tsx`：116/116 pass。
  - `node --test --test-concurrency=1 --import tsx test/playground-agent-switch.test.ts`：6/6 pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - `npx tsc --noEmit`：pass。
  - `git diff --check`：pass。
  - Browser `http://127.0.0.1:5174/`：普通 Agent 分支 iframe 为 `embedMode=mini`、`allow="clipboard-write; clipboard-read"`、`#shell[data-team-console-embed="mini"]`；mini 中历史列表/API 源 rail 隐藏，新会话左置、上下文右置且不重叠，消息区/输入框可见。新会话 tooltip hover 后 `::after left=0px`、`opacity=1`、`transform` 归零，不再被左边缘裁切。最大化 overlay iframe 为 `embedMode=full` 且完整 Playground 入口恢复。嵌入气泡“复制正文”按钮实测调用 `navigator.clipboard.writeText(...)`；iframe focus 后原生 `navigator.clipboard.writeText(...)` 返回 ok。
- Team Console run history 轻量分页验证：
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx src/tests/app-run-observer.test.tsx src/tests/app-static-contracts.test.ts`：154/154 pass。
  - `node --test --test-concurrency=1 --import tsx test/team-task-run-routes.test.ts`：42/42 pass。
  - `npx tsc --noEmit`：pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - `git diff --check`：pass。
  - Browser `http://127.0.0.1:5174/`：重启 `ugk-pi-team-console` 后确认运行记录面板可打开，`.emap-run-history-list` 已加载浅色/深色主题 scrollbar 规则。
  - 本地 runtime：已重启 `ugk-pi` 让 `/v1/team/tasks/:taskId/run-history` 的 summary 读取与 `hasMore` 生效；`/healthz` 返回 `{"ok":true}`。真实 API 抽查 `task_ec690cdc8bd4` 的 `run-history?limit=3&offset=0` 返回 `total=6`、`limit=3`、`hasMore=true`、`runs=3`。
- Team Console Task 节点 selected 视觉焦点验证：
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx -t "last clicked Task"`：1/1 pass；先红后绿覆盖 A/B/A 第三次点击 A 收起分支但 A 仍 selected。
  - `npm --prefix apps/team-console test -- --run src/tests/app-live-data.test.tsx src/tests/app-static-contracts.test.ts`：116/116 pass。
  - `npm --prefix apps/team-console test -- --run src/tests/app-static-contracts.test.ts`：32/32 pass。
  - `npx tsc --noEmit`：pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - `git diff --check`：pass。
  - Browser `http://127.0.0.1:5174/`：重启 `ugk-pi-team-console` 并硬刷新后，干净状态 A/B/A 实测确认：A 首次点击 selected 且打开 A panel；点击 B 后 B selected、A 取消且两个 panel 可同时存在；再次点击 A 后 A panel 收起但 A 保持 selected，B 取消 selected 且 B panel 保持展开。
- `npx tsx --test test/team-task-group-routes.test.ts test/team-task-group-run-routes.test.ts`：31/31 pass。
- `npx tsx --test test/conn-team-group-runner.test.ts test/server.test.ts`：174/174 pass。
- `npm --prefix apps/team-console test -- --run src/tests/app-connections.test.tsx src/tests/team-api.test.ts`：143/143 pass。
- `npm --prefix apps/team-console test -- --run src/tests/app-static-contracts.test.ts`：28/28 pass。
- `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
- `npx tsc --noEmit`：pass。
- `git diff --check`：pass。
- 本轮 run history / observer UI 收口后验证：
  - `npm --prefix apps/team-console test -- --run src/tests/app-run-observer.test.tsx src/tests/app-live-data.test.tsx src/tests/app-static-contracts.test.ts`：149/149 pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - `npx tsc --noEmit`：pass。
  - `git diff --check`：pass。
  - Browser `http://127.0.0.1:5174/`：真实页面确认运行记录为时间线布局，状态不截断、按钮不溢出；generated Task 运行历史 panel 的 `data-panel-source-id` 等于对应 Discovery 子画布 panel 的 `data-panel-id`。
- 本轮 Group Dock / toolbar consolidation 验证：
  - `npm --prefix apps/team-console test -- --run src/tests/app.test.tsx src/tests/app-live-data.test.tsx src/tests/app-run-observer.test.tsx src/tests/app-root-dock.test.tsx src/tests/app-connections.test.tsx src/tests/app-static-contracts.test.ts`：214/214 pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - `npx tsc --noEmit`：pass。
  - Browser `http://127.0.0.1:5174/`：重启 `ugk-pi-team-console` 后确认根筛选为 `ALL17` / `Agent2` / `Task15` / `Source0`，独立 `.agent-atlas-stats` 已消失；展开 Group 有“收纳”按钮，`Group 1` 收纳后以 Group 对象进入 Dock，恢复后 Group frame 和成员 Task 回到画布。
- 本轮 Team Console 加载流畅性验证：
  - `npm --prefix apps/team-console test -- --run src/tests/app.test.tsx src/tests/app-live-data.test.tsx src/tests/app-run-observer.test.tsx src/tests/app-root-dock.test.tsx src/tests/app-connections.test.tsx src/tests/app-canvas-state.test.tsx src/tests/app-static-contracts.test.ts src/tests/task-group-projection.test.ts src/tests/task-group-member-rows.test.ts`：230/230 pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - `npx tsc --noEmit`：pass。
  - `git diff --check`：pass。
  - Browser `http://127.0.0.1:5174/`：PerformanceObserver 确认初始加载 CLS 为 `0.00`，初始网络只有 GET，无首次 layout PATCH。
- 本轮 run observer 上拖修复验证：
  - `npm --prefix apps/team-console test -- --run src/tests/app-run-observer-interactions.test.tsx -t "drags an observer process panel and updates connector"`：pass；回归断言覆盖 `top < 0`。
  - `npm --prefix apps/team-console test -- --run src/tests/app-run-observer-interactions.test.tsx src/tests/app-run-observer.test.tsx src/tests/execution-map-ui.test.tsx`：179/179 pass。
  - `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
  - `npx tsc --noEmit`：pass。
  - `git diff --check`：pass。
  - 用户真实页面测试确认通过。
  - 备注：`npm --prefix apps/team-console test -- --run src/tests/app-task-branches.test.tsx` 当前有 6 个旧失败，失败点为等待 Task 节点 `data-task-run-status="completed"` 但实际仍是 `none`；本轮未改该文件，也未把这类测试债并入上拖修复。
- Browser `/playground/conn`：新界面 invalid Group option 显示 `不可运行` 且 disabled，未保存、未 POST/PATCH。
- Browser `http://127.0.0.1:5174/`：展开 `group_68c7cb331d7b` 后成员 chip 为 2 行，顺序按两个 `headTaskIds` 的 downstream 链路排列；未点击按钮、未 PATCH membership。

## 已知运行口径

- 如果 `5174` 显示旧 UI，先查 `http://127.0.0.1:5174/src/graph/ExecutionMap.tsx` 是否包含 `onToggleTaskGroupLock`、`lockedTaskGroupNodeIdSet`、`data-task-group-locked`。
- 如果宿主/容器 `/app` 是新源码但 `5174` 返回旧模块，只执行 `docker compose restart ugk-pi-team-console` 并硬刷新浏览器；不要重启主 `ugk-pi`，不要开临时端口。
- 改 `src/workers/team-group-conn-runner.ts` 后，真实验证前需要 `docker compose up -d --build ugk-pi-conn-worker`；只 restart 可能还在跑旧镜像。
- Team Console Vite build 的 chunk size warning 是既有非阻塞 warning。

## 下一步候选

- 若用户继续产品化 Group 编辑，下一步可以做：Group 内部 head 选择/重排、empty Group 创建后的引导、Group 级跳转到 Conn run diagnostics。
- 若用户继续 Conn 方向，优先只读观察真实 `team_group` Conn run 状态；不要为制造失败样本手工改用户 Group 或手工 POST run。
- `origin/main` 如已推送，后续再决定是否同步 `gitee`；本轮默认不推 `gitee`。

## 禁止事项

- 不提交 `.env`、`.data/`、runtime/public 报告产物、截图、部署包、备份目录。
- 不提交 `.codex/plans/**`，除非用户明确要求。
- 不改主 `/playground` 产品 UI，除非用户明确要求。
- 不改 `.pi/skills/**` runtime skill，除非用户明确要求。
- 不新增 backend endpoint 来绕过 typed connection / run-context / GroupRun 合同。
- 不手工 POST API 当作真实用户测试主路径。
- 不把 generated child 塞进 root tasks / root canvas。
