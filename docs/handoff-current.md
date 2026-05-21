# 当前交接快照

更新时间：`2026-05-21`

这份文档给新接手 `ugk-pi / UGK CLAW` 的同事或 coding agent 看。它只记录当前事实和接手入口，历史流水账看 `docs/change-log.md`。不要靠聊天记录拼现状，聊天记录容易把旧架构、临时计划和当前事实搅成一锅粥。

## 给新接手者的第一条消息

可以直接把下面这段发给同事：

```text
请接手 `E:\AII\ugk-pi`。你维护的是 ugk-pi 代码仓库，不是产品运行时 Playground agent。

开始前先读 `AGENTS.md`、`docs/handoff-current.md`、`docs/team-runtime.md`、`docs/traceability-map.md` 和 `docs/change-log.md`。如果继续 Team Runtime，重点看 `docs/team-runtime.md` 的文件清单和 `docs/traceability-map.md` 的 `J. Team Runtime v2` 场景索引。

开始前执行 `git status --short --branch`、`git log -1 --oneline` 和 `git remote -v`。当前 Team natural language Plan draft 收口点是 `79db4ef docs(team): fix plan draft handoff docs`；Team architecture v1 收口点是 `c3c15c7 refactor(team): extract role prompt contract`。不要提交 `.env`、`.data/`、runtime 临时产物、public 报告、截图、本地研究脚本或未明确归档的 `.codex/plans/*`。

本地开发默认用 Docker：`docker compose up -d` 或 `docker compose restart ugk-pi`。固定入口是 `http://127.0.0.1:3000/playground`，健康检查是 `http://127.0.0.1:3000/healthz`。服务器发布默认走增量更新；腾讯云拉 GitHub `origin/main`，阿里云拉 Gitee `gitee/main`。不要整目录覆盖，不要删除 shared 运行态。
```

## 当前状态

- 当前分支：`main`
- 当前 Team natural language Plan draft 功能收口点：`79db4ef docs(team): fix plan draft handoff docs`
- 当前 Team natural language Plan draft 已完成：模板 / API / `/playground/team` 自然语言草案 UI / 文档口径已收口
- 当前 Team architecture Step 1-8 已完成并通过总验收
- 当前工作区边界：
  - `79db4ef` 后只允许本轮收口同步修改 `docs/handoff-current.md`
  - `.codex/plans/*` 是仓库文档目录，但本轮未跟踪的 Team natural language plan draft 计划文件保持不动，除非用户明确要求归档
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

## 2026-05-21 Team natural language Plan draft 收口

本轮完成 Team Plan draft 的自然语言草案链路，但没有引入新 scheduler、DAG、queue、lease 或 run execution mode，也没有改 TeamOrchestrator / worker / workspace / runner。

### Plan draft 功能链路 5 个提交

1. `68a2410 feat(team): add deterministic plan draft templates`
2. `30da32f feat(team): expose plan draft api`
3. `1a3e74d feat(team): add natural language plan draft ui`
4. `1da04cc docs(team): document natural language plan drafts`
5. `79db4ef docs(team): fix plan draft handoff docs`

### 已完成范围

- `src/team/plan-draft.ts`：新增纯模板 registry 和确定性薄 heuristic router；当前 supported 模板为 `single_agent` / `parallel_research`，planned 模板为 `coding_fix` / `deep_research_with_review`。
- `src/team/routes.ts`：新增 `GET /v1/team/plan-templates` 与 `POST /v1/team/plan-drafts`；draft endpoint 只生成可检查的 Plan create payload，不持久化 Plan、不创建 Run、不修改 `runCount`。
- `/playground/team`：Plan modal 新增「自然语言草案」模式；用户先生成草案并预览 JSON，确认后才提交 `POST /v1/team/plans`，不会自动启动 run。
- 文档：`docs/team-runtime.md`、`docs/playground-current.md`、`docs/traceability-map.md`、`docs/change-log.md` 已同步当前口径；TeamTemplate / v0.1 不再作为当前主入口。

### 当前验证记录

2026-05-21 收口同步已通过：

- `npm run test:team`：839 pass / 0 fail / 2 skip
- `npm test`：1598 pass / 0 fail / 2 skip
- `npx tsc --noEmit`：clean
- `git diff --check`：clean

### 未跟踪项

以下文件 / 目录是本轮开始前已有或运行态产物，保持未跟踪且未提交：

- `.codex/plans/2026-05-21-team-natural-language-plan-drafts-plan.md`
- `curate_news.py`
- `curate_news_v2.py`
- `curate_news_v3.py`
- `public/agent-search-report.html`
- `public/github-trending-report.html`
- `public/medtrum-news-2026-report.html`
- `public/medtrum-social-report.html`
- `public/medtrum-view/`
- `public/ruflo-research-report.html`
- `runtime/agent-search/`
- `runtime/medtrum-news-2026/`
- `runtime/ruflo-research/`

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
4. `src/team/plan-draft.ts`
5. `src/team/orchestrator.ts`
6. `src/team/child-execution.ts`
7. `src/team/task-attempt-runner.ts`
8. `src/team/run-workspace.ts`
9. `src/team/run-workspace-state.ts`
10. `src/team/run-workspace-attempts.ts`
11. `src/team/run-workspace-artifacts.ts`
12. `src/team/run-workspace-records.ts`
13. `src/team/run-presenter.ts`
14. `src/team/plan-store.ts`
15. `src/team/plan-validation.ts`
16. `src/team/agent-profile-role-runner.ts`
17. `src/team/role-prompt-contract.ts`
18. `src/team/task-expansion-planner.ts`
19. `src/ui/team-page.ts`
20. `src/ui/team-page-helpers.ts`
21. `src/ui/team-run-detail-behavior.ts`
22. `.pi/skills/team-plan-creator/SKILL.md`

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

当前不要开新功能。先等用户确认是否同步远端；确认后再把 `main` 推到 GitHub `origin/main` 和 Gitee `gitee/main`。之后如果继续做产品能力，优先小步推进：

1. **远端同步**
   - 等用户确认后再 push；不要擅自同步 `origin/main` 或 `gitee/main`。
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
