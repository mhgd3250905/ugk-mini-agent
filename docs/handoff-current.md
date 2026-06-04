# 当前交接快照

更新时间：`2026-06-04`

这份文档只记录当前接手所需事实。历史流水账不要塞回来；需要追溯旧阶段时用 Git 历史、专题文档和 `docs/change-log.md`。若本文件与当前用户提示、`git status` 或真实运行结果冲突，以后者为准。

## 当前维护边界

- 当前维护对象：Team Console / Canvas Task / runtime `/team-task` 创建与 Discovery 运行路径。
- 不维护：主 `/playground` UI 重做、云服务器部署推送、无关 `.pi/skills/**`、运行时 public 产物。
- 固定 Team Console 本地入口：`http://127.0.0.1:5174/`。
- 固定主后端入口：`http://127.0.0.1:3000`。
- Team Console Live API 通过 `5174` 同源代理访问 `/v1`、`/playground`、`/assets`、`/runtime`、`/vendor`。

## 接手先读

常规 Team Console / Canvas Task / Discovery 接手只读这些：

1. `AGENTS.md`
2. `docs/handoff-current.md`
3. `apps/team-console/README.md`
4. `docs/team-runtime.md`
5. `docs/team-console-refresh-performance-plan.md`
6. `.pi/skills/team-task-creator/SKILL.md`
7. `src/team/types.ts`
8. `src/team/task-run-service.ts`
9. `src/team/run-workspace.ts`
10. 相关测试：`test/team-task-run-process.test.ts`、`test/team-task-run-routes.test.ts`、`test/team-task-routes.test.ts`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/src/tests/app-run-observer.test.tsx`

## 当前 Git 现场

- 分支：`main`。
- 当前分支状态以 `git status --short --branch` 为准；本轮 Team Console / Canvas Task / Discovery 架构清理已收口。
- 最终源码基线：`bd0a28f Narrow task dependency store task reader`。
- 当前本地 ahead 提交包含 Team Console refresh performance Step 1-6、Discovery dispatch auto-run overlap、Team Task 模板/clone/API/UI group、Canvas Task adaptive timeout、Team Console run history 和本轮 architecture cleanup commits。
- 本轮默认不提交 `.codex/config.toml`、`.codex/plans/**`、`.omo/`、`github-trending.txt`、runtime/public 报告产物或截图；Step 19/20 的 `.codex/plans/**` report 只是本地审查证据。
- 未跟踪 runtime/public 产物禁止提交：`public/developer-forum-sources-report.html`、`public/forum-sources-report.html`、`public/medtrum-view/`。

继续工作前先执行：

```bash
git status --short --branch
git log -5 --oneline
git diff --stat
git diff --cached --stat
git log --oneline origin/main..HEAD
```

## 当前已完成事实

- Team Console refresh performance Step 1-6 已完成：active root run / observer 分层 summary、Discovery scoped refresh、引用稳定合并、root/generated summary `since` contract、root-summary warm cache / run summary index、Discovery 阶段可见性、边 dispatch 边 generated child auto-run。
- Discovery runtime 已收口：root gating 等待 dispatch、generated child 终态和 aggregation；root cancel 级联取消 generated child；aggregation 写 `discovery-aggregation.json`；typed downstream 优先消费 aggregation。
- Discovery dispatch / generated auto-run pipeline 当前语义：Discovery accepted result 写出 `discovery-result.json` 后，单 dispatcher producer 顺序把 raw item 转成 generated Task 并 enqueue；generated run queue consumer 固定 3 并发运行 child。设计上限是 1 个 dispatcher + 3 个 generated child runs，不做 dispatcher 并发。
- Discovery dispatcher parser 已兼容真实模型常见 schema drift：若模型把完整 `outputContract` / `acceptance` 错放到 `workUnit.input` 或 `workUnit.input.outputContract`，parser 会归位并继续创建 generated Task；仍拒绝缺失字段、item mismatch、forbidden fields 和 invalid JSON。`discoveryDispatch[].createdAt` 现在逐 outcome 记录真实落盘时间。
- Team Task 模板链路已收口：Task 可带 `templateConfig.parameters`，本体可直接运行，`templateState.currentBindings` 保存当前参数，run `source.templateBindings` 保存当次快照，clone API 仍保留但不再是模板参数运行主路径。
- Team Console 画布已支持共享 layout、UI-only Group、Task run history 分支、Discovery generated child 菜单/编辑/运行记录入口、silent refresh 和画布恢复 loading 收口。
- Canvas Task 独立 run 已使用 adaptive idle timeout + hard cap，工具完成和 public output 文件变化刷新 idle，普通文本/thinking 不续命。
- Canvas Task detached active run 已收口：主服务重启或后台执行链路丢失后，Team routes 注册会重启 detached `queued` run，并将 detached `running` run 标记为 failed，避免无执行者的 run 长时间假运行。
- 本轮收尾 architecture cleanup 已完成并验证。关键 Module / Interface 包括 `DiscoveryRunLifecycle`、`TeamConsoleSummaryReadModel`、Team Console live refresh state / Discovery refresh / generated detail policy / Discovery subscription helpers、`CanvasTaskAttemptWorkspace`、`CanvasTaskRunWorkspace`、`CanvasTaskRunTaskStore`、Discovery lifecycle dependency Interfaces、summary read-model dependency Interfaces、live refresh API adapter types、child execution workspace Interfaces、`TaskAttemptLifecycleWorkspace`、`TeamRunDetailWorkspaceReader`、task/source/dependency connection store reader Interfaces。
- Step 19 已审查 `TeamOrchestrator` / `RunWorkspace`：`TeamOrchestrator` 当前依赖 20 个 workspace 方法，直接加 20-method `TeamOrchestratorWorkspace = Pick<RunWorkspace, ...>` 只是浅 Interface，不增加有意义的 Depth / Seam。当前建议停止本轮架构清理；若未来继续，单独规划高风险 Discovery result assembly / aggregation Module。

## 真实 UI / 运行验证事实

- Discovery root Task `task_c70580219a00` 的真实 run `run_614c9ccdb9f8` 已完成：root 发现 17 items，dispatcher/upsert 17 个 active generated Task，0 blocked，固定 3 并发 auto-run pool 启动 17/17 generated child run，最终 12 succeeded / 5 failed，root 最后写出 `discovery-aggregation.json`。
- 模板 Task `task_ae82bc41efad` 通过 Team Console 参数面板运行，keyword 为 `Minimax M3是不是很糟糕`；run `run_83673cbd8acc` 的 `plan.json` 中 `{{keyword}}` 出现 0 次，绑定后的 keyword 出现 6 次，证明 runtime 参数绑定链路有效。
- 已观察到 generated child 失败主要来自 worker timeout、模型数据检查拦截和 checker 抓出的 hallucination，不是 root aggregation 或 Team Console refresh contract 问题。

## 最新验证

- Team architecture cleanup Step 20 final validation：
  - `npm test`：2063 tests，2061 passed，2 skipped，0 failed。
  - `npm --prefix apps\team-console run test -- --run src\tests\team-api.test.ts src\tests\app-live-data.test.tsx src\tests\app-run-observer.test.tsx`：194 passed。
  - `npm --prefix apps\team-console run build`：passed；仍有既有 Vite chunk size warning。
  - `npx tsc --noEmit`：passed。
  - `git diff --check`：passed。
- 更早的分步验证不要继续复制到本文件；需要追溯用 `docs/change-log.md` 或 Git 历史。

## 未完成 / 风险

- Team Console refresh/API 主线已收口到当前可用版本；下一轮性能工作应先基于真实 FRP / 大量 run 观测定位慢点，再决定继续压缩 payload、减少轮询或做视窗化渲染。
- Discovery Step 6 已缓解“全部 dispatch 后才 auto-run”的等待，但 dispatcher 仍是逐 item 顺序调用模型、generated child auto-run 固定 3 并发；大量 item、源站可达性和每 item dispatcher 成本仍可能拖慢真实 run。
- 真实 Discovery child 失败集中在 worker timeout、模型内容检查拦截和 checker hallucination 判定；优先改 Task 范围、checker acceptance 和源站可达性说明，不要急着改 root aggregation。
- 下游“JSON 数据生成 HTML 报告”Task 的 checker timeout 需要后续单独优化；这不是 Discovery aggregation bug。
- deterministic validator 当前不做 URL 可达性通用机制；可达性要求应先写进具体 Task checker acceptance。

## 禁止事项

- 不 push；用户测试和确认后再决定。
- 不提交 `.env`、`.data/`、runtime/public 报告产物、截图、部署包、备份目录。
- 不提交 `.codex/plans/**`，除非用户明确要求。
- 不改主 `/playground` 产品 UI，除非用户明确要求。
- 不新增 backend endpoint 来绕过 Discovery 创建或 aggregation。
- 不手工 POST API 当作真实用户测试主路径。
- 不把 generated child 塞进 root tasks / root canvas。
- 不碰无关 `.pi/skills/**`；只有用户明确要求 `/team-task` skill 优化时才改 `.pi/skills/team-task-creator/SKILL.md`。

## 下一步判断

- Team Console 刷新性能：先观测真实慢点，再规划下一步，不要凭感觉继续堆 endpoint。
- Discovery runtime 行为：若要 deterministic / bulk dispatcher，另起 runtime 设计，不和 Team Console refresh 混提交。
- `/team-task` 体验：改 `.pi/skills/team-task-creator/SKILL.md` 和 skill 测试。
- Team Console UI：改 `apps/team-console/src/app/**` 和对应 Vitest。
- runtime 行为：改 `src/team/**` 和 `test/team-task-run-process.test.ts`。
- checker/output contract：优先改 Task contract / checker acceptance，不急着加通用 validator。
