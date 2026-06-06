# 当前交接快照

更新时间：`2026-06-06`

这份文档只记录当前接手所需事实。历史流水账不要塞回来；需要追溯旧阶段时用 Git 历史、专题文档和 `docs/change-log.md`。若本文件与当前用户提示、`git status` 或真实运行结果冲突，以后者为准。

## 当前维护边界

- 当前维护对象：Team Console / Canvas Task / Conn `team_group` / Discovery。
- 不维护：主 `/playground` 产品 UI 重做、无关 `.pi/skills/**` runtime skill、运行时 public 产物、`.data`。
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

- 本轮功能提交已保存到本地 `main`；继续前以 `git status --short --branch` 和 `git log -5 --oneline` 为准。
- 当前关键提交：
  - `3453215 Group member chips by task chains`
  - `cb46d43 Align Team Group member chips with node rows`
  - `0e77122 Polish Team Group frame layout`
  - `ef4356d Fix Team Group member chip overlap`
  - `69e6d78 Update Team Group handoff snapshot`
- `origin`：GitHub `https://github.com/mhgd3250905/ugk-claw-personal.git`。
- `gitee`：`https://gitee.com/ksheng3250905/ugk-pi-claw.git`，本轮未同步。
- 截至本快照，`main...origin/main` 已对齐，`git log --oneline origin/main..HEAD` 为空；tracked 工作区干净，staged 为空。
- 不要提交这些本地未跟踪物件：`.codex/config.toml`、既有 `.codex/plans/**`、`.omo/`、`github-trending.txt`、`public/**`、`eoflow*.html`、`cupid.js`、`solve_cupid.mjs`、runtime 数据、截图、报告、临时文件。

继续工作前先执行：

```powershell
git status --short --branch
git log -5 --oneline
git diff --stat
git diff --cached --stat
git log --oneline origin/main..HEAD
```

## 当前已完成事实

- Team Task Group 后端持久 contract 已完成。Group definition 允许保存 empty/invalid membership；read model 通过 `ResolvedTeamTaskGroup.status/headTaskIds/validation.errors` 表达语义状态。
- Team Task GroupRun 后端 contract 已完成。GroupRun start 才硬拒绝 empty/invalid Group，返回 400 `invalid task group`；active guard 仍返回 409。GroupRun 保存 `definitionSnapshot`，刷新/取消优先使用 snapshot membership。
- GroupRun 完成态已按 Group 内真实 Task 流水线聚合。Discovery generated child run 保留诊断和取消用途，但不再一票否决主 GroupRun 终态。
- Team Console Live backend Group 创建、归档、展示态和 membership 编辑已完成。Live Group 不会因 `taskIds=[]` 或成员节点不可见而消失；支持添加当前选中 Task、移除成员、显示 `0 Tasks`；empty/invalid Group 的运行按钮禁用并展示后端 validation message。
- Team Console Group 顶部成员控制带已返修：非空展开 Group 的控制带不再覆盖 Task card，未提升 Group frame z-index，也未改 Task node pointer-events。
- Team Console 展开 backend Group 的成员 chip 已改为按 Group 内任务链分行：优先用 `ResolvedTeamTaskGroup.headTaskIds`，每个 head 一行，并沿 active internal `TeamTaskConnection` 顺着 downstream Task 展示；不要再按视觉 y 坐标、x 坐标或原始 `taskIds` 顺序理解。
- Team Console 展开 Group frame 已完成窄屏 polish：最小宽度优先保证操作按钮显示，`1 Task` 使用单数，底部参数区域有上方留白，`groupId` 使用类似 Task id 的可点击复制 chip。
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

## 本轮最终验证

- `npx tsx --test test/team-task-group-routes.test.ts test/team-task-group-run-routes.test.ts`：31/31 pass。
- `npx tsx --test test/conn-team-group-runner.test.ts test/server.test.ts`：174/174 pass。
- `npm --prefix apps/team-console test -- --run src/tests/app-connections.test.tsx src/tests/team-api.test.ts`：143/143 pass。
- `npm --prefix apps/team-console test -- --run src/tests/app-static-contracts.test.ts`：28/28 pass。
- `npm --prefix apps/team-console run build`：pass；仅既有 Vite chunk size warning。
- `npx tsc --noEmit`：pass。
- `git diff --check`：pass。
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
