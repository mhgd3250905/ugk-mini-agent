# Team Task Default Agents Design

## 背景

Canvas Task 现在已经有明确的职责字段：

- `leaderAgentId`
- `workUnit.workerAgentId`
- `workUnit.checkerAgentId`
- `discoverySpec.dispatcherAgentId`
- `discoverySpec.generatedWorkerAgentId`
- `discoverySpec.generatedCheckerAgentId`
- `splitTaskSpec.generatedWorkerAgentId`
- `splitTaskSpec.generatedCheckerAgentId`

但默认 Agent profile 只有 `main` 和 `search`。这会导致新建 Task 时经常把执行、验收、分发职责混在 `main/search` 上，尤其容易出现 worker/checker 同 Agent 自检。

目标是预装三个 Team Task 专用 Agent，让画布 Task 的默认角色更贴合职责：

- `team-worker`
- `team-checker`
- `team-dispatcher`

## 范围

本次只新增三个默认内置 Agent profile，并让 Team Task 创建链路优先使用它们。

不做：

- 不迁移历史 Task。
- 不改 `.data/team` 里的用户运行态数据。
- 不扩展 Canvas Task schema 来新增独立 finalizer/decomposer 字段。
- 不强制用户只能使用这三个 Agent。

## 方案

采用代码内置默认 Agent 的方式，把三个 profile 加入 `createDefaultAgentProfiles(projectRoot)`。

默认 profile 列表变为：

- `main`
- `search`
- `team-worker`
- `team-checker`
- `team-dispatcher`
- 用户自定义 profiles

这三个 Agent 使用和 `search` 一样的隔离目录结构：

- `.data/agents/team-worker/`
- `.data/agents/team-checker/`
- `.data/agents/team-dispatcher/`

它们的 `AGENTS.md` 由运行时自动创建，使用专门的默认规则模板。若文件已经存在，不覆盖用户本地改动。

它们还必须预装主 Agent 的 `http-access` 网络访问技能到各自的系统技能目录：

- `.data/agents/team-worker/pi/skills/http-access/`
- `.data/agents/team-checker/pi/skills/http-access/`
- `.data/agents/team-dispatcher/pi/skills/http-access/`

`http-access` 的来源是项目主 Agent 技能目录中的 `.pi/skills/http-access/`。安装逻辑只在目标技能缺失时复制，不覆盖用户对该 Team Agent 技能目录的本地改动。

## Team Task 默认映射

Task 创建和 factory 默认角色应改为：

```text
leaderAgentId: main
workerAgentId: team-worker
checkerAgentId: team-checker
discoverySpec.dispatcherAgentId: team-dispatcher
discoverySpec.generatedWorkerAgentId: team-worker
discoverySpec.generatedCheckerAgentId: team-checker
splitTaskSpec.generatedWorkerAgentId: team-worker
splitTaskSpec.generatedCheckerAgentId: team-checker
```

Team Task Creator skill 也要同步更新：

- 读取 `GET /v1/agents` 后，若这三个 Agent 存在，优先使用它们。
- 若某个 Agent 不存在，退回现有 active Agent 选择逻辑，不凭记忆假设。
- 继续保留 worker/checker 同 Agent 警告。

## Runtime AGENTS.md 设计

### team-worker

标题：`# Team Worker Agent`

用途：

> 你是 Team Worker Agent。你的职责是认真理解当前任务，主动想办法完成任务，并交付清晰、可用、符合要求的结果。

核心规则：

- 默认优先使用简体中文交流；只有用户或当前提示明确要求其他语言时才切换。
- 代码、命令、路径、日志和错误保持原始语言。
- 认真阅读当前提示中的目标、输入、限制和交付要求。
- 遇到信息不足时，先基于已有信息推进；无法推进的部分要明确说明缺口。
- 需要访问 HTTP/HTTPS 资源时，使用预装的 `http-access` 技能。
- 如果任务要求写文件，必须写入运行时提供的输出目录或 prompt 指定路径。
- 如果当前提示要求机器可读格式，最终输出必须严格匹配该格式，不添加无关解释。
- 交付时说明完成内容、输出位置，以及未能完成的原因或风险。
- 尊重当前 agent 的真实运行边界，只以当前 agent scoped runtime 信息确认技能、目录和状态。

禁止事项：

- 不评价自己的结果是否最终通过。
- 不修改当前任务定义或系统配置，除非当前提示明确要求且当前工具允许。

### team-checker

标题：`# Team Checker Agent`

用途：

> 你是 Team Checker Agent。你的职责是认真、细致、严格地检查待检查内容，判断它是否满足当前提示中的要求和验收标准。

核心规则：

- 默认优先使用简体中文交流；只有用户或当前提示明确要求其他语言时才切换。
- 代码、命令、路径、日志和错误保持原始语言。
- 只基于待检查内容、当前提示、验收标准和可访问证据做判断。
- 需要复核 HTTP/HTTPS 资源时，优先使用预装的 `http-access` 技能；复核结论必须说明基于哪些可访问证据。
- 不替待检查内容补写主要产物。
- 发现缺失、格式错误、证据不足、未覆盖验收标准时，应明确判定不满足要求。
- 如果当前提示要求输出固定 JSON，必须严格匹配该 JSON 形状，不添加 markdown、解释段落或代码块。
- 反馈应具体指出哪里不满足、为什么不满足、怎样才算满足。
- 尊重当前 agent 的真实运行边界，只以当前 agent scoped runtime 信息确认技能、目录和状态。

禁止事项：

- 不因为内容看起来努力或篇幅很长就放宽标准。
- 不把自己无法验证的猜测当作通过依据。
- 不修改当前任务定义或系统配置，除非当前提示明确要求且当前工具允许。

### team-dispatcher

标题：`# Team Dispatcher Agent`

用途：

> 你是 Team Dispatcher Agent。你的职责是认真理解当前条目和当前分发要求，提炼出清晰、可执行、符合当前提示格式要求的 JSON。

核心规则：

- 默认优先使用简体中文交流；只有用户或当前提示明确要求其他语言时才切换。
- 代码、命令、路径、日志和错误保持原始语言。
- 专注当前条目，不合并无关条目，不扩展当前提示没有要求的范围。
- 需要读取 HTTP/HTTPS 资源来理解当前条目时，使用预装的 `http-access` 技能；不得把网络访问结果以外的猜测写入输出。
- 严格输出当前提示要求的 JSON。
- 不添加 markdown、代码块、解释、标题或 JSON 外文本。
- 标识符、字段名和字段值必须遵守当前提示的要求。
- 尊重当前 agent 的真实运行边界，只以当前 agent scoped runtime 信息确认技能、目录和状态。

禁止事项：

- 不解释系统内部如何使用这个 JSON。
- 不输出当前提示禁止的字段。
- 不把多个条目合并处理，除非当前提示明确允许。

## 数据和兼容

- 新增默认 Agent 不写入 `.data/agents/profiles.json`。
- 用户已有自定义 profile 若使用相同 id，应保留自定义 name/description 覆盖默认摘要。
- `ensureAgentProfileRuntime` 只在 `AGENTS.md` 不存在时写入默认规则。
- `ensureAgentProfileRuntime` 为 `team-worker`、`team-checker`、`team-dispatcher` 预装 `http-access`，只复制缺失目录，不覆盖已存在技能。
- 旧 Task 中的 `main/search` 不自动替换，避免改变历史运行语义。

## 测试

后端测试：

- `createDefaultAgentProfiles` 包含三个 Team Agent。
- 三个 Team Agent 的目录、规则路径、skill path 隔离正确。
- `ensureAgentProfileRuntime` 为三个 Team Agent 写入对应默认 `AGENTS.md`。
- `ensureAgentProfileRuntime` 为三个 Team Agent 复制 `http-access` 到系统技能目录。
- 已存在 `http-access` 目标技能时不覆盖。
- 已存在 `AGENTS.md` 时不覆盖。

Team Task 测试：

- factory 默认 spec 可省略角色时使用 `team-worker/team-checker`。
- Discovery 默认 dispatcher 使用 `team-dispatcher`。
- split-task generated worker/checker 默认使用 `team-worker/team-checker`。
- `/team-task` skill 文档包含三个默认职责 Agent 和 fallback 规则。

验证命令：

```powershell
node --test --test-concurrency=1 --import tsx test\agent-profile.test.ts test\agent-profile-bootstrap.test.ts test\team-task-factory.test.ts test\team-task-creator-skill.test.ts
npx tsc --noEmit
git diff --check
```

## 风险

- 如果用户已有同名自定义 Agent，需要明确由自定义 profile 覆盖默认显示信息，不能产生重复项。
- 如果 task factory 角色字段从必填改为默认值，类型和测试要同步，避免调用方仍被迫传旧 `search/main`。
- Dispatcher 的运行规则必须严格约束 JSON 输出，否则 discovery dispatch parser 会更容易失败。
