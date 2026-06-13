# Playground UI 治理地图

日期：`2026-05-06`

这份文档服务于架构治理批次 C。目标不是立刻拆 `playground-styles.ts` 或 `playground.ts`，而是先把当前 UI 真源、模块边界、可优化点和禁区钉住。否则所谓“整理架构”很容易变成搬代码取悦自己，最后功能炸了还不知道是谁点的火。

## 当前结论

- `src/ui/playground.ts` 是 Playground 页面脚本装配层：导入各 controller / renderer / dialog / styles，并通过 `renderPlaygroundPage()` 输出最终页面。
- `src/ui/playground-page-shell.ts` 是静态 DOM shell 真源：桌面 topbar、移动 topbar、左侧会话 rail、`#chat-stage`、`#command-deck` 和各弹层挂载点都在这里。
- `src/ui/playground-styles.ts` 是共享样式聚合层：基础 shell、chat stage、desktop workspace、mobile breakpoint 和各 feature 样式片段都从这里合成。
- `src/ui/playground-workspace-controller.ts` 是桌面工作区切换唯一入口：`workspaceMode`、`chatStage.dataset.workspaceMode`、`.workspace-contained` 挂载和 topbar 按钮激活态都归它管。
- 业务状态不归 workspace 壳层接管：文件库、后台任务、Agent 管理、任务消息仍分别使用自己的 open state、加载函数和渲染函数。

## 真源边界

| 领域 | 当前真源 | 边界说明 |
| --- | --- | --- |
| 页面 HTML shell | `src/ui/playground-page-shell.ts` | 负责稳定 DOM id、主要区域、全局弹层挂载点；不放业务加载逻辑。 |
| 页面脚本装配 | `src/ui/playground.ts` | 负责 DOM refs、状态对象、controller script 注入、初始化顺序；不再继续堆独立业务实现。 |
| 基础视觉系统 | `DESIGN.md`、`src/ui/playground-styles.ts` | token、圆角、深浅主题语义、shell / transcript / composer 布局由这里约束。 |
| 浅色主题覆盖 | `src/ui/playground-theme-controller.ts` | 输出 theme controller 与 light theme 样式覆盖；新增深色组件时必须评估 light mode 映射。 |
| 桌面 workspace 壳层 | `src/ui/playground-workspace-controller.ts` | 只做 chat/assets/conn/agents/task 视图壳切换，不替代各 feature controller。 |
| 文件库 | `src/ui/playground-assets.ts`、`src/ui/playground-assets-controller.ts` | HTML/dialog/styles 与资产 API / 列表渲染归该领域。 |
| 后台任务 | `src/ui/playground-conn-activity.ts`、`src/ui/playground-conn-activity-controller.ts` | conn manager、run detail、相关 dialog 和脚本归该领域。 |
| Agent 管理 | `src/ui/playground-agent-manager.ts` | Agent 操作台、规则文件视图、技能视图和 profile 操作归该领域。 |
| 任务消息 | `src/ui/playground-task-inbox.ts` | 任务消息面板、列表、状态和对应样式归该领域。 |
| 会话 / transcript | `src/ui/playground-conversations-controller.ts`、`src/ui/playground-conversation-*.ts`、`src/ui/playground-transcript-renderer.ts` | 会话目录、state hydrate、历史补页、消息 DOM patch 和 markdown 渲染归该组。 |

## 样式治理口径

`playground-styles.ts` 现在不只是“一个很大的 CSS 字符串”。它同时承担了三类责任：

1. 全局布局与 token：`:root`、`.shell`、`.topbar`、`.chat-stage`、`.command-deck`、transcript 和 composer。
2. 桌面 workspace 适配：`data-workspace-mode="assets|conn|agents|task"`、`.workspace-contained` 以及 workspace 内 header / body 的桌面化规则。
3. 聚合 feature 样式：asset、task inbox、conn activity、theme light 覆盖等片段。

后续优化时优先遵守这些规则：

- 可以把高度内聚、已存在独立模块的 feature 样式继续下沉到对应 `get*Styles()`，例如 task inbox 或 asset modal 的纯组件规则。
- 暂时不要把 `.shell`、`.chat-stage`、`.command-deck`、transcript 宽度、mobile breakpoint 和 workspace 壳层规则拆散；这些规则彼此强耦合，乱拆只会让回归定位更痛。
- 新增浅色主题行为时必须查 `src/ui/playground-theme-controller.ts`，不能只在深色基础样式里补一条看起来舒服的颜色。
- 新增移动端工作页时先读 `docs/playground-current.md`：手机端是独立 full-page work surface，不是桌面 workspace 的缩小版。
- 桌面 workspace 的关闭入口由 topbar 左侧按钮统一表达；各面板不要再加自己的桌面 `x` 关闭按钮。

## 禁止回退

- 不要在资产库、后台任务、Agent 管理或任务消息 controller 里直接散写 `chatStage.dataset.workspaceMode`。
- 不要让 `workspaceMode` 接管 `state.assetModalOpen`、`state.connManagerOpen`、`state.agentManagerOpen`、`state.taskInboxOpen` 等业务状态。
- 不要把 `conn-editor-dialog`、`conn-run-details-dialog`、确认弹窗、上下文详情、模型设置或飞书设置塞进主 workspace；它们仍是二级 modal。
- 不要把移动端文件库 / 后台任务 / Agent 管理 / 任务消息改成桌面 `.workspace-contained` 的移动版本。
- 不要为了“文件变小”强拆 `playground-styles.ts`。文件行数不是架构问题，边界不清才是。
- 不要把 `runtime/playground/` 的外部化文件当源码真源；正式修复仍回到 `src/ui/`。

## 候选优化队列

### P0：保持观测，不动行为

- 保留 `test/server.test.ts` 对 `GET /playground` 的集成烟测，尤其是 shell、路由、runtime asset 和关键 DOM id。
- UI 局部治理时至少跑：
  - `git diff --check`
  - `node --test --import tsx test/playground-page-shell.test.ts test/playground-styles.test.ts`
  - 涉及装配或页面入口时补 `node --test --import tsx test/server.test.ts --test-name-pattern "GET /playground"`

### P1：低风险整理

- 给新增 UI 功能优先建立对应独立 `playground-*-controller.ts` 或 `get*Styles()`，避免继续塞进 `playground.ts` 尾部。
- 将纯 feature 样式的新增规则放到对应模块的 style function 中，再由 `playground-styles.ts` 聚合。
- 为 workspace 壳层新增最小单测，覆盖 `data-workspace-mode` 字符串、`.workspace-contained` 规则和 mobile reset，不急着改运行时代码。

### P2：需要代码改动前再次确认

- 评估 `playground-styles.ts` 中 workspace header 规则是否能拆成 `playground-workspace-styles.ts`。前提是测试先覆盖 desktop assets/task/agent/conn workspace 的关键选择器。
- 评估 `playground.ts` 的 assembler 初始化顺序是否能拆出更小的 registry。前提是不能改变 controller script 注入顺序和现有 `renderPlaygroundPage()` 输出。
- 评估 `test/server.test.ts` 中纯 CSS 字符串断言迁移到更聚焦的 UI 单测。集成烟测必须保留，不能把路由级保护拆空。

## 变更风险提示

| 改动类型 | 风险 | 最小验证 |
| --- | --- | --- |
| 改 `playground-page-shell.ts` | DOM id / 挂载点变化导致 controller 找不到节点 | `test/playground-page-shell.test.ts` + `GET /playground` 相关 server 测试 |
| 改 `playground-styles.ts` | 桌面 workspace、移动端 full-page、浅色主题相互污染 | `test/playground-styles.test.ts` + 视具体范围跑 `design:lint` |
| 改 `playground-workspace-controller.ts` | 面板切换、会话切换、运行中状态可能互相覆盖 | 加 workspace controller 聚焦测试，再跑 `GET /playground` 烟测 |
| 改 feature controller | 可能绕过原加载函数或状态真源 | 对应 `test/playground-*-controller.test.ts` + 相关 server 集成烟测 |
| 改 theme controller | 浅色主题文字 / 面板对比失效 | 相关 UI 单测 + `npm run design:lint` |

## 下一步建议

批次 C 到这里先停在文档治理，不做源码拆分。下一批如果继续推进，建议进入批次 D：`Conn / Activity / Legacy` 观测治理，先把旧兼容路径和后台任务数据流的“保留原因”写清楚。等 UI 再有实际改动需求时，再按本治理地图做小步代码整理。
