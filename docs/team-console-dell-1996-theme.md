# Team Console Dell 1996 主题

## 状态

- 开发分支：`local/dell-1996-team-console-theme`
- 当前实现基线：以该开发分支最新本地提交为准
- 集成状态：已完成本地开发与验证，Draft PR [#8](https://github.com/mhgd3250905/ugk-claw-personal/pull/8) 已创建
- 作用范围：`apps/team-console`
- 默认主题影响：无。Dell 1996 通过独立视觉主题开关启用

## 目标

Dell 1996 是 Team Console 的独立完整浅色视觉主题，不是对默认主题的覆盖。设计方向是保留 1990 年代桌面软件的硬边框、低圆角、像素感阴影与衬线排版，同时保证现代画布的信息层级和可读性。

核心约束：

1. 所有规则必须限定在 `[data-visual-theme="dell-1996"]` 下。
2. 默认视觉主题和 Team Runtime 数据行为不得改变。
3. 复古感不能以低对比、混浊配色或不可读选中态为代价。
4. 阴影只表达鼠标悬浮，不表达静态状态或点击选中。
5. 内部信息块不滥用阴影、灯带和额外装饰。

## 启用与持久化

工具栏中的视觉主题按钮在 `默认样式` 与 `Dell 1996` 之间切换。

- DOM 属性：`data-visual-theme="dell-1996"`
- 持久化键：`ugk-team-console:visual-theme:v1`
- 启用 Dell 1996 时，有效 `data-theme` 固定为 `light`
- Dell 1996 下明暗切换按钮禁用
- 用户保存的默认主题明暗偏好不会被改写；切回默认样式后自动恢复
- 默认视觉主题继续完整支持浅色和深色模式
- 主题切换只改变样式，不改变 Task、Run、布局或 API 数据

主要实现位置：

- `apps/team-console/src/app/App.tsx`
- `apps/team-console/src/graph/ExecutionMap.tsx`
- `apps/team-console/src/graph/execution-map-dell-1996.css`
- `apps/team-console/src/tests/app-static-contracts.test.ts`

## 已完成范围

### 画布与节点

- 画布使用硬边框、规则网格和 Dell 1996 专属浅色 palette。
- Agent、Task、Discovery、Source、Group、菜单和分支面板均已适配。
- 所有卡片常规状态和选中状态不显示阴影。
- 只有鼠标悬浮在外层节点或外层分支面板时才显示硬阴影。
- 主节点悬浮时上移 `2px`，阴影与位移同步出现。
- 选中节点不使用虚线框，不替换卡片底色，不改变内部文字颜色。
- 内部 Agent 行、过程块和文件行不显示悬浮阴影。

### Task 类型灯带

主 Task 卡片左侧灯带表达 Task 类型，不表达运行状态：

| 类型 | Dell 1996 |
| --- | --- |
| Agent | `#356F9F` |
| 普通 Task | `#B23A48` |
| Discovery | `#007F9E` |

运行状态继续由卡片右上角状态标签表达，避免类型与状态共用同一视觉通道。

### 运行观察

- Worker 和 Checker 过程区域使用完整 `2px` 边框。
- 过程区域不显示左侧灯带、竖线或圆点。
- 删除竖线后，过程区和文件区左内边距统一收敛到 `12px`。
- Worker、Checker 过程卡片不显示悬浮阴影。
- 独立文件详情节点在悬浮时显示外层硬阴影。

### 文件输出

Worker 输出、Checker 输出和 Accepted Result 使用统一规则：

- 四边完整 `2px` 边框
- 不使用左侧类型色条
- 常规、选中和悬浮状态均无阴影
- 文件名标签保留内部细边框，用于区分名称与路径

## 交互规则

| 元素 | 常规 | 选中 | 悬浮 |
| --- | --- | --- | --- |
| 主节点 | 无阴影 | 无阴影，不换底色 | 上浮并显示 `4px` 硬阴影 |
| 外层分支面板 | 无阴影 | 无阴影 | 显示外层硬阴影 |
| 过程卡片 | 完整边框，无阴影 | 不适用 | 无阴影 |
| 文件输出行 | 完整边框，无阴影 | 无阴影 | 无阴影 |
| 独立文件详情 | 完整边框，无阴影 | 无阴影 | 显示外层硬阴影 |

当新增节点或子节点时，应先判断它是“画布节点/外层分支”还是“内部信息块”。只有前者允许悬浮阴影。

## 本地验证

启动 Docker 本地服务：

```bash
docker compose up -d ugk-pi ugk-pi-team-console
```

访问：

```text
http://localhost:5174/
```

自动验证：

```bash
npm --prefix apps/team-console run test -- src/tests/app.test.tsx src/tests/app-static-contracts.test.ts
npm run team-console:build
```

浏览器检查：

1. 切换 `默认样式` / `Dell 1996`，确认默认主题未受影响。
2. 在默认深色模式下启用 Dell 1996，确认立即切换为浅色且明暗按钮禁用。
3. 切回默认样式，确认恢复之前保存的深色模式。
4. 悬浮普通 Task 与 Discovery，确认只有当前卡片上浮并出现阴影。
5. 点击节点，确认选中态无虚线框、无静态阴影、文字清晰。
6. 展开 Task 菜单、运行记录、运行观察、Leader 对话和文件详情。
7. 确认 Worker/Checker 过程区域只有完整边框。
8. 确认 Worker/Checker/Accepted Result 文件输出全部为完整边框且无悬浮阴影。

## 未完成项

- Topbar 视觉层级仍需重新设计。目前深色整条背景较重，按钮边框密集，筛选、操作和全局设置分组不够清晰。
- Dell 1996 不提供深色变体；这是明确的主题边界，不是待补功能。
- 后续新增 Team Console 节点或面板时，需要补充 Dell 1996 覆盖和静态契约测试。
- Topbar 后续优化不阻塞当前 Dell 1996 主题提交，可在独立迭代中继续处理。

## Git 约定

- 每轮可验证的 UI 调整使用本地小提交保存。
- 只提交 Dell 1996 主题相关文件，不混入工作区内其他未跟踪文件。
- PR 仅用于团队 review，不直接合并到 `main`。
