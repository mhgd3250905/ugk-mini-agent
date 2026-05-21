# 当前交接快照

更新时间：`2026-05-21`

这份文档给新接手 `ugk-pi / UGK CLAW` 的同事或 coding agent 看。它只记录当前事实和接手入口，历史流水账看 `docs/change-log.md`。不要靠聊天记录拼现状，聊天记录容易把旧架构、临时计划和当前事实搅成一锅粥。

## 给新接手者的第一条消息

可以直接把下面这段发给同事：

```text
请接手 `E:\AII\ugk-pi`。你维护的是 ugk-pi 代码仓库，不是产品运行时 Playground agent。

开始前先读 `AGENTS.md`、`docs/handoff-current.md`、`docs/team-runtime.md` 和 `docs/change-log.md`。如果继续 Team Runtime，重点看 `docs/team-runtime.md` 的文件清单，以及 `.codex/plans/2026-05-21-team-architecture-optimization-index.md`。

开始前执行 `git status --short --branch`、`git log -1 --oneline` 和 `git remote -v`。当前 Team architecture v1 收口点是 `c3c15c7 refactor(team): extract role prompt contract`；后续可能还有文档收尾 commit。不要提交 `.env`、`.data/`、runtime 临时产物、public 报告、截图或本地研究脚本。

本地开发默认用 Docker：`docker compose up -d` 或 `docker compose restart ugk-pi`。固定入口是 `http://127.0.0.1:3000/playground`，健康检查是 `http://127.0.0.1:3000/healthz`。服务器发布默认走增量更新；腾讯云拉 GitHub `origin/main`，阿里云拉 Gitee `gitee/main`。不要整目录覆盖，不要删除 shared 运行态。
```

## 当前状态

- 当前分支：`main`
- 当前功能收口点：`c3c15c7 refactor(team): extract role prompt contract`
- 当前 Team architecture Step 1-8 已完成并通过总验收
- 当前工作区边界：
  - tracked 工作区应保持干净
  - `.codex/plans/*` 是仓库文档目录，可以提交明确的计划 / handoff 文档
  - `runtime/*`、`public/*` 报告、`.data/`、`.env`、截图、临时研究脚本不要提交
- 当前远端：
  - GitHub：`origin` -> `https://github.com/mhgd3250905/ugk-claw-personal.git`
  - Gitee：`gitee` -> `https://gitee.com/ksheng3250905/ugk-pi-claw.git`

## 2026-05-21 Team Runtime 收口

本阶段完成两条主线：

1. **Team `for_each.parallel` v1**：支持固定容量并行池、child 安全状态写入、pause/resume/cancel/rerun、partial success 父任务语义、force rerun 成功后自动清标记。
2. **Team architecture cleanup Step 1-8**：把 Team 模块从一个过重 orchestrator 和混杂 helper，拆成更清楚的可测边界。

### 已完成的结构拆分

- `src/team/child-execution.ts`：expanded child sequential / parallel 执行拓扑、固定并发池、fatal drain、parent 聚合。
- `src/team/task-attempt-runner.ts`：单个 task 的 worker -> checker -> watcher attempt 生命周期。
- `src/team/plan-validation.ts`：Plan create/update schema policy。
- `src/team/run-workspace-state.ts`：run state、admission、lease、`patchState`、state event。
- `src/team/run-workspace-attempts.ts`：attempt metadata、role workspace 文件、discovery-result。
- `src/team/run-workspace-artifacts.ts`：final report 与 run-scoped 文件读取。
- `src/team/run-workspace-records.ts`：expansion / decomposition records 与 generated child state append。
- `src/team/run-presenter.ts`：`GET /v1/team/runs/:runId` 的 run detail response shaping。
- `src/team/role-prompt-contract.ts`：worker/checker/watcher/finalizer/decomposer prompt builder、JSONish parser、output normalizer。
- `src/ui/team-run-detail-behavior.ts`：Team run detail 滚动快照、anchor 查找、滚动恢复。

`src/team/orchestrator.ts` 现在保留 run lifecycle、task ordering、dynamic expansion、controlled decomposition、finalizer 组合，不再直接承载 child topology、attempt lifecycle、plan validation、workspace storage、route presenter 或 prompt contract。

### 验证记录

2026-05-21 总验收已通过：

- `npm run test:team`：821 pass / 0 fail / 2 skip
- `npm test`：1580 pass / 0 fail / 2 skip
- `npx tsc --noEmit`：clean
- `git diff --check`：clean
- `git diff --check 961074d..HEAD`：clean
- Team architecture 触达文件均为 `i/lf w/lf`

`npm test` 中可能看到 browser cleanup 的 `fetch failed` 日志；测试通过时这是无真实浏览器清理端点的环境噪声，不是失败信号。

## 关键文件

Team Runtime：

1. `docs/team-runtime.md`
2. `src/team/types.ts`
3. `src/team/routes.ts`
4. `src/team/orchestrator.ts`
5. `src/team/child-execution.ts`
6. `src/team/task-attempt-runner.ts`
7. `src/team/run-workspace.ts`
8. `src/team/run-workspace-state.ts`
9. `src/team/run-workspace-attempts.ts`
10. `src/team/run-workspace-artifacts.ts`
11. `src/team/run-workspace-records.ts`
12. `src/team/plan-store.ts`
13. `src/team/plan-validation.ts`
14. `src/team/agent-profile-role-runner.ts`
15. `src/team/role-prompt-contract.ts`
16. `src/team/task-expansion-planner.ts`
17. `src/ui/team-page.ts`
18. `src/ui/team-run-detail-behavior.ts`
19. `.pi/skills/team-plan-creator/SKILL.md`

本地运行 / 部署：

1. `docs/docker-local-ops.md`
2. `docs/server-ops.md`
3. `docs/server-ops-quick-reference.md`
4. `docs/tencent-cloud-singapore-deploy.md`
5. `docs/aliyun-ecs-deploy.md`
6. `docker-compose.yml`
7. `docker-compose.prod.yml`

Playground / Agent / Conn：

1. `docs/playground-current.md`
2. `DESIGN.md`
3. `docs/runtime-assets-conn-feishu.md`
4. `src/routes/chat.ts`
5. `src/agent/agent-service.ts`
6. `src/routes/agent-profiles.ts`
7. `src/routes/conns.ts`

## 当前关键事实

- 本地固定入口：`http://127.0.0.1:3000/playground`
- 本地健康检查：`http://127.0.0.1:3000/healthz`
- 默认本地启动：`docker compose up -d`
- 常规代码改动后优先：`docker compose restart ugk-pi`
- Team worker 改动后：`docker compose restart ugk-pi-team-worker`
- 涉及 Dockerfile、系统依赖或 compose 结构时才 `up --build -d`
- 双云默认发布方式是增量更新，腾讯云拉 `origin/main`，阿里云拉 `gitee/main`
- Agent profile 运行时列表以 `GET /v1/agents` 为准；不要手写 `.data/agents/profiles.json`
- 模型源当前事实看 `docs/model-providers.md` 和 `/v1/model-config`
- Chrome sidecar 登录态在 shared 运行态目录，不能被部署流程洗掉
- `TEAM_RUNTIME_ENABLED=true` 才会注册 Team 路由和启动 worker
- Team worker 是独立容器 `ugk-pi-team-worker`，与主服务器 `ugk-pi` 分开重启
- 所有 `.js` 扩展名 import 是 ESM 规范，不是笔误

## 暂时不要做

- 不要继续无目标拆 Team 模块；Step 1-8 已经把主要边界收口，继续拆会收益变低、风险变高。
- 不要把 `for_each.parallel` 塞回动态展开逻辑里；执行拓扑和 item 展开必须保持分离。
- 不要让 `role-prompt-contract.ts` 依赖 filesystem、session、browser、Fastify 或 server。
- 不要把 `.pi/skills/` 当开发协作技能目录；产品运行时 skill 和 `.codex/skills/` 不是一回事。
- 不要把手机端 Playground 当桌面端压缩版改。
- 不要动 `references/pi-mono/`，那是参考镜像，不是业务源码。
- 不要提交 `.env`、`.data/`、runtime 临时产物、public 报告、截图、部署包或浏览器 profile。

## 推荐下一步

优先回到产品能力，而不是继续重构：

1. **Team execution template / heuristic router**
   - 显式模板：`single_agent`、`parallel_research`、`coding_fix`、`deep_research_with_review`
   - 先做 P1 `parallel_research`，不要一上来重写完整 DAG scheduler。
2. **Team plan 创建体验**
   - 让自然语言更稳定映射到 discovery / for_each sequential / for_each parallel / decomposer。
3. **测试并发 SQLite lock 小治理**
   - 已有 `npm run test:team` 串行规避；如果要优化，只做测试 harness 层，不碰业务逻辑。
4. **真实运行 UX**
   - 继续增强 run 审计、失败恢复、attempt 查看、rerun 决策可视化。

## 发布提醒

本地 push 到 GitHub/Gitee 不等于生产已部署。服务器更新仍按：

```powershell
npm run server:ops -- tencent preflight
npm run server:ops -- tencent deploy
npm run server:ops -- tencent verify

npm run server:ops -- aliyun preflight
npm run server:ops -- aliyun deploy
npm run server:ops -- aliyun verify
```

发布禁区：

- 不要 `git reset --hard`
- 不要整目录覆盖服务器仓库
- 不要删除或重建 shared 运行态
- 不要执行 `docker compose down -v`
- 不要把本地 Chrome profile 复制到服务器
- 不要提交 `.env`、token、cookie、`.data/`、部署包、runtime 临时文件
