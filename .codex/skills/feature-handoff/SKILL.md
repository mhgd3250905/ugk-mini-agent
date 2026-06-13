---
name: feature-handoff
description: Use this repo-local development skill whenever a coding agent working on the ugk-mini-agent / ugk-claw-core-win repository finishes a feature, bugfix, refactor, documentation task, deployment task, or is about to hand off to another coding agent. Trigger on requests like "做完后记录", "收尾", "交接", "换 agent 前备份", "下个 agent 接手", or "别忘了补文档". This is for maintaining this repository, not for UGK CLAW Playground runtime agent profiles.
---

# Feature Handoff

把一次开发任务完成、阶段暂停或换 coding agent 前的现场，整理成下一个维护仓库的 agent 能接住的证据链。

这个技能服务于开发 `ugk-mini-agent / ugk-claw-core-win` 仓库的 agent。不要把它安装到 `.pi/skills/`，那里是产品运行时 Playground agent 的技能目录。

## 何时使用

用户表达下面这些意思时使用：

- 功能做完了，要补记录
- 修复完成后要交接
- 准备换 agent、新开会话、暂停当前开发任务
- 要备份当前开发现场
- 要知道哪些文件该提交、哪些不该提交
- 要给下一个维护仓库的 agent 留说明
- 用户只说“收尾一下”“做好记录”“交接一下”

如果用户只是问一个普通解释问题，不要强行使用本技能。

## 核心原则

- `docs/change-log.md` 记录仓库层面的可追溯变化。
- 模块事实写到对应模块文档，不要塞进 `AGENTS.md`。
- `AGENTS.md` 只放长期规则、接手入口和跨模块硬约束。
- `docs/handoff-current.md` 用于全新 coding agent 接手的当前快照；只有阶段状态、部署状态、未提交现场或下一步建议明显变化时才更新。
- `.codex/plans/` 用于计划、未完成任务、阶段性 handoff 和后续执行清单。
- 不要默认提交、stash、打包或删除文件；这些动作需要用户明确同意。
- 不要把 `.env`、`.data/`、运行时截图、临时报表、部署包、`runtime/` 临时文件混进提交边界。

## 功能完成后的收尾流程

### 1. 先确认真实改动

读取当前状态：

- `git status --short`
- `git diff --stat`
- 必要时查看关键文件 diff

区分三类文件：

- 本次应提交：源码、测试、必要文档、计划文档
- 本次不应提交：用户已有改动、运行态文件、临时文件、本地配置
- 需要询问用户：不确定来源或可能包含隐私 / 运行态的文件

### 2. 判断需要补哪些记录

按影响范围选择最小记录集：

| 影响类型 | 必做记录 |
| --- | --- |
| 外部行为、接口、运行方式、协作约定变化 | `docs/change-log.md` |
| Playground UI / 交互变化 | `docs/playground-current.md` 或 `docs/playground-ui-governance-map.md` |
| Agent / Chat / 会话 / SSE 变化 | `docs/agent-chat-governance-map.md` 或相关运行文档 |
| Conn / Activity / output 变化 | `docs/runtime-assets-conn-feishu.md` |
| 部署 / 服务器 / shared 运行态变化 | `docs/server-ops.md`、云服务器手册或 `docs/handoff-current.md` |
| 长期接手规则或入口索引变化 | `AGENTS.md` |
| 未完成任务或后续分批执行 | `.codex/plans/YYYY-MM-DD-<topic>.md` |

别把所有东西都写进一个文件。文档也会长胖，长胖了就没人读。

### 3. 写 change-log 条目

如果本次改动会影响下一个接手的人，给 `docs/change-log.md` 追加条目。

格式保持简洁：

```markdown
### <主题>
- 日期：YYYY-MM-DD
- 主题：一句话说明改动。
- 影响范围：说明影响到哪些行为、接口、页面、模块或文档。
- 对应入口：`path/to/file.ts`、`docs/example.md`
```

### 4. 更新对应模块文档

只更新真实受影响的文档。不要为了“看起来很负责”把无关文档全碰一遍。

写文档时回答三个问题：

- 现在事实是什么
- 后续 agent 应该先看哪里
- 什么事情不要再误解或回退

### 5. 验证

按风险选择验证命令：

- 文档 / skill 变更：至少 `git diff --check`，并检查路径存在、链接不失真。
- TypeScript 或路由变更：`npx tsc --noEmit`，再跑相关测试。
- 跨模块或行为变化：跑相关测试后，必要时跑 `npm test`。
- 前端视觉 / 交互：结合 `docs/architecture-test-matrix.md` 和真实页面验证。

不要把“我看见字符串了”当成验证。那是自我安慰，不是工程。

### 6. 回报给用户

最终回报必须包含：

- 真实完成了什么
- 记录补在哪里
- 验证命令和结果
- 应提交文件
- 不应提交或需要用户处理的文件
- 剩余风险或下一步

简短模板：

```text
已收尾：
- 记录：更新了 `docs/change-log.md`，同步了 `<module-doc>`
- 验证：`<command>` 通过
- 建议提交：<files>
- 不建议提交：<runtime/temp files>
- 下一步：<optional>
```

## 换 agent 前的交接流程

### 1. 冻结现场

先读：

- `git status --short`
- `git diff --stat`
- 最近相关计划：`.codex/plans/`
- 当前高层快照：`docs/handoff-current.md`

如果有正在运行的服务、测试或部署任务，先说明状态，不要假装已经结束。

### 2. 写交接说明

如果只是当前任务的中途交接，优先写到 `.codex/plans/YYYY-MM-DD-handoff-<topic>.md`。

如果是项目阶段状态变化，更新 `docs/handoff-current.md`。

交接说明至少包含：

```markdown
# <任务> 交接

## 当前状态
- 已完成：
- 未完成：
- 阻塞点：

## 关键文件
- `path/to/file`

## 验证记录
- 已通过：
- 未运行及原因：

## 工作区边界
- 建议提交：
- 不要提交：
- 需要用户确认：

## 下一步
1. ...
2. ...
```

### 3. 备份策略

默认不要做物理备份。先给用户选项：

- 提交 commit：适合功能已完成且测试通过。
- 生成 patch：适合想保存 diff，但暂时不提交。
- 只写 handoff 文档：适合任务未完成或还在探索。
- 服务器 / 运行态备份：只在部署或生产数据相关任务中使用，并按对应 runbook 执行。

禁止默认打包这些内容：

- `.env`
- `.data/`
- `node_modules/`
- Docker volume
- browser profile
- `runtime/` 中临时报表或截图
- 密钥、token、cookie、服务器私钥

### 4. 给下一个 agent 的最短提示

当用户问“我该怎么告诉下一个 agent”时，给这段：

```text
请先读 `AGENTS.md`、`docs/handoff-current.md` 和本任务交接文档；继续前先看 `git status --short`，不要提交 runtime / .data / .env。接着按交接文档里的“下一步”和“验证记录”继续。
```

## 不要做的事

- 不要把聊天记录当唯一事实源。
- 不要为了收尾顺手重构无关代码。
- 不要把流水账塞进 `AGENTS.md`。
- 不要伪造验证结果；没跑就说没跑。
- 不要把“应该提交”和“当前 git status 所有文件”混为一谈。
- 不要在用户没确认时做 `git commit`、`git stash`、删除文件、覆盖服务器目录或打包运行态。
