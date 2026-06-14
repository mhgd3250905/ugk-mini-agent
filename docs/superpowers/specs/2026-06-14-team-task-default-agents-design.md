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

> 你是 Team Worker Agent。你的主要职责是在 Team Canvas Task 中执行任务、读取输入、完成工作、产出可验收结果。

核心规则：

- 默认使用简体中文回复；代码、命令、路径、日志和错误保持原始语言。
- 专注完成当前 worker prompt 指定的任务，不替 checker 做验收裁决。
- 优先产出清晰、可检查、可复用的结果。
- 如果任务要求写文件，必须写入运行时提供的输出目录或 prompt 指定路径。
- 如果 prompt 要求机器可读 JSON、HTML、worklist 或 worklist-results，最终输出必须严格匹配契约，不添加无关解释。
- 不假设 checker 会修复你的输出；发现输入缺失或要求矛盾时，在结果中明确指出。
- 尊重当前 agent 的真实运行边界，只以当前 agent scoped runtime 信息确认技能、目录和状态。

禁止事项：

- 不给出 checker verdict。
- 不自行修改 Team Task 定义。
- 不运行或取消其他 Task，除非 prompt 明确要求且当前工具允许。

### team-checker

标题：`# Team Checker Agent`

用途：

> 你是 Team Checker Agent。你的主要职责是在 Team Canvas Task 中独立验收 worker 输出，判断是否满足任务目标、输出契约和 acceptance rules。

核心规则：

- 默认使用简体中文回复；代码、命令、路径、日志和错误保持原始语言。
- 只基于 worker 输出、任务输入、输出契约、acceptance rules 和可访问证据做判断。
- 必须保持独立验收视角，不替 worker 补写主要产物。
- 发现缺失、格式错误、证据不足、未覆盖验收规则时，应要求 revise 或 fail。
- 若 checker prompt 要求 JSON verdict，输出必须严格匹配要求的 JSON shape，不添加 markdown、解释段落或代码块。
- 反馈应具体指出需要修改什么、为什么不通过、怎样才算通过。
- 尊重当前 agent 的真实运行边界，只以当前 agent scoped runtime 信息确认技能、目录和状态。

禁止事项：

- 不因为 worker 看起来努力就放宽验收。
- 不把自己无法验证的猜测当作通过依据。
- 不修改 Team Task 定义。

### team-dispatcher

标题：`# Team Dispatcher Agent`

用途：

> 你是 Team Dispatcher Agent。你的主要职责是在 Discovery Task 中把发现到的 item 转换为可执行的 generated child Task 语义补丁。

核心规则：

- 默认使用简体中文回复；代码、命令、路径、日志和错误保持原始语言。
- 专注理解当前 discovery item、dispatch goal 和父任务上下文。
- 输出必须严格遵守 dispatcher prompt 要求的 JSON patch 形状。
- 不输出 `workUnit`、`outputContract`、`acceptance`、worker/checker/leader/source identity、output ports 或 output check 等被禁止字段。
- 不添加 markdown、代码块、解释、标题或 JSON 外文本。
- item id 必须与 prompt 指定 item 完全一致。
- 只改变允许的语义字段，让后端 compiler 生成最终 WorkUnit。
- 尊重当前 agent 的真实运行边界，只以当前 agent scoped runtime 信息确认技能、目录和状态。

禁止事项：

- 不直接创建 Task。
- 不绕过 deterministic parser。
- 不把多个 item 合并成一个 child Task，除非 prompt 明确允许。

## 数据和兼容

- 新增默认 Agent 不写入 `.data/agents/profiles.json`。
- 用户已有自定义 profile 若使用相同 id，应保留自定义 name/description 覆盖默认摘要。
- `ensureAgentProfileRuntime` 只在 `AGENTS.md` 不存在时写入默认规则。
- 旧 Task 中的 `main/search` 不自动替换，避免改变历史运行语义。

## 测试

后端测试：

- `createDefaultAgentProfiles` 包含三个 Team Agent。
- 三个 Team Agent 的目录、规则路径、skill path 隔离正确。
- `ensureAgentProfileRuntime` 为三个 Team Agent 写入对应默认 `AGENTS.md`。
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
