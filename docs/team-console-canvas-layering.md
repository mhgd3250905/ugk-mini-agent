# Team Console Canvas Layering

这份文档定义 Team Console / Execution Atlas 的画布层级规范。它不是单次 UI 调色记录，而是后续维护画布元素、连线、Group、展开面板、选中态和拖拽态时必须遵守的 z 轴合同。

## 目标

- Group 只表达范围和容器，永远位于业务节点与业务连线之下。
- Task / Agent / Source 节点与其业务连线属于同一语义层；节点卡片可以略高于自己的线，但不能和 Group 背景竞争层级。
- 子级越深，整组上下文越靠上，包括子级节点、子级连线、子级面板和子级操作控件。
- 被点击、选中、展开、拖拽或正在操作的上下文必须整体抬升，而不是只抬单个卡片。
- 层级值必须由一个画布层级模块集中命名，不再散落魔法数字。

## 当前结构审计

| 区域 | 当前入口 | 当前层级来源 | 问题 |
| --- | --- | --- | --- |
| 画布容器 | `AtlasCanvasShell.tsx` 的 `.execution-map-container` | `execution-map-scroll` 使用 `transform` 形成 stage stacking context | stage 内外层级容易混用，toolbar / overlay / world 没有共享命名 |
| 工具栏 | `.execution-map-toolbar` | `z-index: 4` | 与画布内部 `4/5/6` 数值语义冲突 |
| 框选矩形 | `.execution-map-selection-rect` | `z-index: 18` | 比 branch 高，但没有说明为什么低于 maximized overlay |
| SVG 连线层 | `.execution-map-links` | DOM 在节点层之前，未设置 z-index | 依赖 DOM 顺序；无法表达“子级连线高于父级节点/Group”的语义 |
| 业务连线 | `.emap-link-*` | SVG 内部 DOM 顺序 | task/source/dependency/branch/evidence 全在同一 SVG 平面，缺少按 depth/selection 分层 |
| 连线 hit area | `.emap-link-hit-area` | SVG path，透明 stroke | 与可见线同层，交互按钮另放 HTML 层 |
| 连线切断按钮 | `.emap-link-cut-button` | `z-index: 5`，在 `.execution-map-nodes` 内 | 数值高于普通节点但低于 branch，语义不清；应属于 focused connector control |
| 普通节点 | `.emap-node` | absolute，未显式 z-index | 依赖 DOM 顺序；selected 只改视觉，不改变层级 |
| Atlas 多选节点 | `.emap-node.is-atlas-selected` | 只改样式，不改 z-index | 多个 Task/branch 重叠时，选中节点不会自然浮到最上 |
| 运行证据节点 | `.emap-evidence-node` | absolute，未显式 z-index | 跟普通节点同层，靠 selected task 的 render 顺序自然后置 |
| artifact preview | `.emap-artifact-preview` | `z-index: 2` | 局部高于证据节点，但与 Group/card/branch 数值无统一语义 |
| Task Group 展开背景 | `.emap-task-group-frame` | `z-index: 0` | 正确方向是下层，但和 link SVG/节点层没有正式合同；空 Group 会升到 `2` |
| Task Group 折叠卡 | `.emap-task-group-card` | `z-index: 2` | 折叠后是实体卡片，语义应接近普通节点，而不是 Group 背景 |
| Task Group 成员 chip | `.emap-task-group-member-chip` | `z-index: 2` | 局部控件层，未和 group frame 的背景层分离 |
| Agent branch | `.emap-agent-branch-shell` | `z-index: 12`，`contain: layout paint style` | contain 会建立独立绘制边界；hover 时 Dell override 升到 `30`，和全局 overlay 冲突 |
| Task branch | `.emap-task-branch-shell` | `z-index: 11`，`transform: translateZ(0)` | transform 建立 stacking context；不同 task branch 没有按 active/selected 调整层级 |
| Task child panel | `.emap-task-child-branch-shell` | `z-index: 12`，`contain: layout paint style` | 子面板与 agent branch 同层；没有 depth 递增策略 |
| Discovery generated card | `.discovery-generated-card` | 内部 `is-action-menu-open` 升到 `12` | 这是 panel 内部层级，不应直接借用画布层级数值 |
| Root dock | `.emap-root-dock` | `z-index: 5` | 属于 shell overlay，不应和 link cut / node 控件竞争同一编号 |
| Root trash | `.emap-root-trash` | `z-index: 6` | 只在拖拽时出现，应属于 drag affordance 层 |
| Dock flight | `.emap-root-dock-flight` | `z-index: 100` | 属于 transient animation，合理高于画布，但应命名 |
| Maximized branch | `.emap-maximized-branch-shell` | `z-index: 28` | fixed overlay，但低于 Dell hover `30` 的普通 branch；这是明显冲突 |
| Archive modal | `.root-archive-modal-overlay` | `z-index: 1000` | app modal 最高，合理，但应在跨模块层级表中保留 |

## 目标层级表

所有值只表达相对顺序。实现时可以使用 CSS custom properties 或 TypeScript 常量生成 class / style，但不得再直接散落裸数字。

| Token | 建议值 | 归属 | 元素 | 规则 |
| --- | ---: | --- | --- | --- |
| `canvas.background` | 0 | shell | grid / canvas background | 最底层，不接收业务交互 |
| `canvas.group.background` | 10 | world | 展开的 `.emap-task-group-frame` | 只承载范围、标题、Group 控件底板；不得盖住业务连线 |
| `canvas.group.empty` | 20 | world | 空 Group frame | 空 Group 没有成员节点，可作为可操作实体，但仍低于普通节点 |
| `canvas.connector.base` | 30 | world | 父级 / 普通业务连线 | 高于 Group，低于普通节点 |
| `canvas.node.base` | 40 | world | Task / Agent / Source / 折叠 Group card | 普通业务实体层 |
| `canvas.evidence.base` | 45 | world | evidence node | 只跟随 selected task 出现，略高于普通节点 |
| `canvas.connector.childBase` | 50 | world | 一级展开 branch / child connector | 子级上下文整体高于父级普通节点 |
| `canvas.panel.childBase` | 60 | world | 一级 task branch / agent branch / child panel | 子级面板实体层 |
| `canvas.connector.depthStep` | 10 | world | 深层子级 connector | 每深入一层，connector 增加一个 step |
| `canvas.panel.depthStep` | 10 | world | 深层子级 panel/node | 每深入一层，panel/node 增加一个 step |
| `canvas.context.active` | 200 | world | 当前点击、聚焦、选中、展开上下文 | 抬升整组上下文，包括节点、连线、panel、局部控件 |
| `canvas.context.dragging` | 300 | world | 正在拖拽的节点 / Group / panel | 拖拽对象及其 ghost/preview 最高，避免被其他展开层遮挡 |
| `canvas.control.connector` | 350 | world | link cut buttons / connector sockets that accept input | 高于 active context，但低于 shell overlay |
| `shell.selectionRect` | 500 | shell | 框选矩形 | 高于 world，低于 toolbar / dock；不参与 world depth |
| `shell.toolbar` | 600 | shell | toolbar | 固定在画布操作层 |
| `shell.rootDock` | 650 | shell | root dock | 高于 toolbar 附近的 world 内容，但低于 drag affordance |
| `shell.dragAffordance` | 700 | shell | root trash / drop target | 拖拽时的命中提示 |
| `shell.transientFlight` | 800 | shell | dock restore/minimize flight | 短时动画层，高于所有普通 shell |
| `shell.maximized` | 900 | shell | maximized branch shell | 最大化面板必须高于普通 hover/selected world |
| `app.modal` | 1000 | app | root archive modal / future modal | 全应用阻断式浮层 |

## 上下文分组规则

画布不应只给单个 DOM 节点设置 z-index。任何用户认为“这是同一件事”的对象，都应该进入同一个 layer group。

| 上下文 | 包含元素 | 抬升触发 | 目标行为 |
| --- | --- | --- | --- |
| Base task context | Task card、输入输出端口、dependency handle、与该 task 直接相连的业务连线 | 默认 | 节点略高于线，线高于 Group |
| Selected task context | selected task、selected chain link、evidence nodes、artifact preview、相关 cut buttons | 点击 task 或打开 task 详情 | 整组高于未选中 task / branch |
| Atlas multi-select context | 多选中的 task/source/agent 及其直接连接 | 框选或多选 | 多选对象应高于未选中对象，且拖拽时整体进入 dragging |
| Expanded branch context | task action menu、run history、observer panel、edit panel、generated subcanvas、它们的连接线 | 打开 branch/panel | 子级 depth 越深越高；同 depth 由最近激活者最高 |
| Active panel context | 最近点击或聚焦的 branch/panel | pointer down / focus within | 该 panel 及其 connector 浮到同类 panel 顶部 |
| Group context | group frame、group title/header/buttons、member chips、collapsed group card | 创建/展开/折叠/拖拽 group | 展开 frame 在背景层；折叠 card 是实体节点层；locked 不改变层级 |
| Dragging context | 正在拖拽的 root node、group、branch panel、dock flight | pointer drag | 被拖拽对象绝对最高，drop target 显示在 shell drag 层 |

## 模块边界建议

后续实现应新增一个小模块，而不是继续把 z-index 写进多个 CSS 文件。

| 文件 | 职责 |
| --- | --- |
| `apps/team-console/src/graph/atlas-layering.ts` | 定义 layer token、depth 计算、active context 类型、DOM data attribute 生成 helper |
| `apps/team-console/src/graph/execution-map-layering.css` | 唯一承载画布层级 CSS custom properties 和通用 `[data-layer-*]` 规则 |
| `apps/team-console/src/graph/ExecutionMap.tsx` | 只负责把元素归类到 layer context，不直接写裸 z-index |
| `apps/team-console/src/graph/AtlasCanvasShell.tsx` | 只负责 shell 层：toolbar、selection rect、overlay slot，不管理 world depth |
| `apps/team-console/src/graph/execution-map-*.css` | 保留视觉样式；不得新增裸 z-index，必须引用 layer token |
| `apps/team-console/src/tests/execution-map-layering.test.tsx` | 覆盖层级合同：Group 在下、线高于 Group、节点高于线、子级和 selected context 能抬升 |
| `apps/team-console/src/tests/app-static-contracts.test.ts` | 静态防回归：禁止在画布 CSS 中新增未登记的裸 z-index |

## 实现原则

1. `z-index` 只在 positioned element 上生效；任何 `transform`、`filter`、`opacity < 1`、`contain: paint` 都可能创建新的 stacking context。新增层级规则必须同时审查这些属性。
2. SVG 内部 path 的 z 轴只能靠 DOM 顺序或拆分 SVG layer 表达。若要支持“子级 connector 高于父级节点”，必须把 connectors 拆成多层 SVG 或把相关 link 与 context 分组渲染。
3. `selected` / `is-atlas-selected` 不只是样式态；它们必须驱动画布上下文层级。
4. `hover` 只能临时提升同一局部上下文，不得超过 maximized / modal / shell overlay。
5. Group 背景可以半透明作为视觉优化，但不是层级架构的主解决方案。

## 第一批优化需求草案

| 优先级 | 需求 | 验收标准 |
| --- | --- | --- |
| P0 | 建立 layer token 模块并替换画布裸 z-index | `execution-map*.css` 中画布相关 z-index 只引用 token；静态测试能拦截新增裸数字 |
| P0 | Group frame 永远低于业务 connector 与 node | Dell/default/dark 主题下，Group 背景不会覆盖节点连线；不依赖透明背景才能看见线 |
| P0 | selected / active context 整体抬升 | 多个展开 task/panel 重叠时，最近点击的上下文整体在上方 |
| P1 | 子级 depth 分层 | 一级/二级/更深子面板及其连接线按 depth 递增，不会被父级 task 或父级 connector 压住 |
| P1 | SVG link 分层重构 | base connector、selected connector、child connector 拆分为可排序 layer，不再全塞同一 SVG 平面 |
| P2 | 主题视觉微调 | 在层级合同成立后，再决定 Dell Group 是否保持实色、半透明或仅在 selected/hover 时变化 |

## 推荐落地顺序

1. 先写静态测试，证明当前存在裸 z-index 和层级合同缺失。
2. 新增 `atlas-layering.ts` 与 `execution-map-layering.css`，只迁移 token，不改变视觉。
3. 把 Group / node / shell overlay 的 z-index 改为 token。
4. 引入 active context 状态：最近 pointer down/focus 的 node/panel/group 更新 active layer key。
5. 重构 connector 渲染，把 base / child / selected connector 分层输出。
6. 做 Dell Group 背景最终视觉决策；此时可以选择半透明，但它只是审美选择，不再承担可见性兜底。
