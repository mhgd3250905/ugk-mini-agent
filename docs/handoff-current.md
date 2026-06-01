# 当前交接快照

更新时间：`2026-06-01`

这份文档只记录当前接手所需事实。历史流水账不要塞回来；需要追溯旧阶段时用 Git 历史和专题文档。若本文件与当前用户提示、`git status` 或真实运行结果冲突，以后者为准。

## 当前维护边界

- 当前维护对象：Team Console / Canvas Task / runtime `/team-task` 创建与 Discovery 运行路径。
- 不维护：主 `/playground` UI 重做、云服务器部署推送、无关 `.pi/skills/**`、运行时 public 产物。
- 固定 Team Console 本地入口：`http://127.0.0.1:5174/`。
- 固定主后端入口：`http://127.0.0.1:3000`。
- Team Console Live API 通过 `5174` 同源代理访问 `/v1`、`/playground`、`/assets`、`/runtime`、`/vendor`。

## 接手先读

常规接手只读这些，不要全文吞旧日志：

1. `AGENTS.md`
2. `docs/handoff-current.md`
3. `apps/team-console/README.md`
4. `docs/team-runtime.md`
5. `.pi/skills/team-task-creator/SKILL.md`
6. `src/team/types.ts`
7. `src/team/task-run-service.ts`
8. `src/team/run-workspace.ts`
9. `src/team/run-workspace-attempts.ts`
10. 相关测试：`test/team-task-creator-skill.test.ts`、`test/team-task-run-process.test.ts`、`apps/team-console/src/tests/app-live-data.test.tsx`、`apps/team-console/src/tests/app-run-observer.test.tsx`

`docs/change-log.md` 现在只保留近期窗口。需要旧事实时用：

```bash
git log -- docs/change-log.md
git show <commit>:docs/change-log.md
git log -- <path>
```

## 文档生命周期规则

别再把文档当垃圾桶。当前规则：

- `docs/handoff-current.md` 只放当前接手事实，目标不超过 150 行；新一轮交接直接替换旧快照。
- `docs/change-log.md` 只放近期窗口，目标不超过 500 行或最近 30 天；稳定旧记录靠 Git 追溯。
- `AGENTS.md` 只放跨任务长期规则、场景索引和硬边界；单次排障、验证流水账、旧事实不要塞进去。
- `.codex/plans/` 只保留未执行、待确认或仍有复用价值的计划；已完成计划应删除、压缩进交接，或提升为专题文档。
- 专题文档承载稳定机制，不承载过程直播；超过约 1000 行时先考虑拆成索引和子文档。

## 当前 Git 现场

接手时已确认：

- 分支：`main`
- 远程状态：`main...origin/main [ahead 8]`
- 最新提交：`cf7c8fa fix(fs): retry transient atomic file replacements`
- 无 staged changes。
- 当前 tracked 修改集中在 Team Console / Discovery runtime / Task artifact contract / docs / tests；以 `git status --short` 为准。
- 未跟踪 runtime/public 产物禁止提交：
  - `public/developer-forum-sources-report.html`
  - `public/forum-sources-report.html`
  - `public/medtrum-view/`

继续工作前仍要重新执行：

```bash
git status --short --branch
git log -5 --oneline
git diff --stat
git diff --cached --stat
git remote -v
git log --oneline origin/main..HEAD
```

## 当前已完成事实

- `/team-task` skill 已改成通用 Task 设计向导，支持外行用户自然语言创建普通 Task 或 Discovery Task。
- Discovery root run 已修正：root 不再在 generated child 运行中提前完成；取消 root 会级联取消本轮 generated child；子画布 active child 置顶。
- Discovery aggregation 已实现：generated child 全部终态后，root attempt 写 `discovery-aggregation.json`。
- typed downstream 优先接 `discovery-aggregation.json`，不再优先消费 root `discovery-result.json`。
- Run observer 已支持 `.md` 文件内容为 JSON 时按 JSON pretty print 展示。
- terminal run 没有可展示 attempt 文件时，文案不再误导用户等待“刚启动后补齐”。
- Discovery 子画布只展示当前 root run 对应的 generated child run；新 root 运行期间不会继续露出上一轮 child 的旧完成状态，active child 置顶，终态 child 按完成时间倒序。
- Team Console 后台刷新已区分 silent refresh；active run 终态刷新、打开 Discovery 子画布和延迟 catalog refresh 不再抢占工具栏“刷新 Task”按钮加载态。
- Canvas Task run 会记录 `source.publicBaseUrl`；`PUBLIC_BASE_URL=auto` 表示按当前请求 host/proto 或本地端口自动推导公开 base URL。
- Team role session 注入 `ARTIFACT_PUBLIC_DIR` 和 `ARTIFACT_PUBLIC_BASE_URL`；需要交付的报告/HTML 应写到 public output 目录，并通过 `/v1/team/task-runs/:runId/artifacts/:roleKey/:role/...` 稳定访问。

## 真实 UI 验证事实

- 用户从 Team Console Live API 重新运行 `task_c70580219a00`。
- 新 root run：`run_87395c3f9132`。
- root 发现阶段产出 14 个 item。
- generated child 全部终态后 root 才 `completed`。
- generated child 结果：11 succeeded，3 failed。
- 失败项：`reddit-claudecode`、`github-aider`、`v2ex-search`，原因均为 `worker timeout`。
- root attempt 成功写出 `discovery-aggregation.json`。
- 下游 HTML 报告 Task 新 run：`run_78d423dfeaeb`。
- 下游 bound input artifact 的 `fileRef` 已确认为 `tasks/task_c70580219a00/attempts/attempt_69f8999ffe0b/discovery-aggregation.json`。
- 下游 worker 已基于 aggregation 生成 HTML 报告。
- 主后端稳定文件链接可访问：`http://127.0.0.1:3000/v1/files/7cae52ab-c3cd-4cd4-aef3-b38e7c6ccbbd`。
- 下游最终失败原因是 `checker timeout`，不是 aggregation 或下游输入错误。

## 已验证命令

- `node --test --import tsx test\team-task-run-process.test.ts`：35 passed。
- `node --test --import tsx test\team-task-run-routes.test.ts`：12 passed。
- `node --test --import tsx test\team-agent-profile-runner.test.ts`：60 passed。
- `npm --prefix apps\team-console run test -- --run src\tests\app-live-data.test.tsx`：53 passed。
- `npm --prefix apps\team-console run test -- --run src\tests\app-run-observer.test.tsx`：18 passed。
- `npx tsc --noEmit`：passed。
- `git diff --check`：passed。
- `npm test`：2011 tests，2009 passed，2 skipped，0 failed。
- Docker 服务已重启过，`/healthz` 正常。

## 未完成 / 风险

- 下游“JSON 数据生成 HTML 报告”Task 的 checker timeout 需要后续优化；这不是 Discovery aggregation bug。
- 旧 run 或旧 worker 输出里可能仍同时提到临时 `localhost:9001` 和 `/v1/files/...`；新 Task role prompt / env 已要求使用 `ARTIFACT_PUBLIC_BASE_URL`，但具体报告 Task 的 checker 仍需要按 acceptance 验证可访问性。
- deterministic validator 当前不做 URL 可达性通用机制；可达性要求应由用户创建 Task 时写入 checker acceptance，只有高频复用再考虑可选 `outputCheck`。

## 禁止事项

- 不 push；用户测试和确认后再决定。
- 不提交 `.env`、`.data/`、runtime/public 报告产物、截图、部署包、备份目录。
- 不提交 `.codex/plans/*`，除非用户明确要求。
- 不改主 `/playground` 产品 UI，除非用户明确要求。
- 不新增 backend endpoint 来绕过 Discovery 创建或 aggregation。
- 不手工 POST API 当作真实用户测试主路径。
- 不把 generated child 塞进 root tasks / root canvas。
- 不碰无关 `.pi/skills/**`；只有用户明确要求 `/team-task` skill 优化时才改 `.pi/skills/team-task-creator/SKILL.md`。

## 下一步判断

等待用户说明新的优化项，再判断落点：

- `/team-task` 体验：改 `.pi/skills/team-task-creator/SKILL.md` 和 skill 测试。
- Team Console UI：改 `apps/team-console/src/app/**` 和对应 vitest。
- runtime 行为：改 `src/team/**` 和 `test/team-task-run-process.test.ts`。
- checker/output contract：优先改 Task contract / checker acceptance；不要急着加通用 validator。
- 文档收口：保持短文档，旧事实进 Git 历史，不再堆长快照。
