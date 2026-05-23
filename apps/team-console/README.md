# Team Console

独立 Team Runtime 执行图预览前端。与主项目 `/playground/team` 隔离，不影响现有生产入口。

## 安装

```bash
npm install
```

## 启动开发

```bash
npm run dev
# 访问 http://127.0.0.1:5174
```

## 测试

```bash
npm test              # vitest run
npm run build         # tsc + vite build
```

## 根项目快捷命令

```bash
npm run team-console:dev    # 启动开发
npm run team-console:build  # 构建
npm run team-console:test   # 测试
```

## 数据源

默认使用 Mock fixture 数据。顶部可切换 Live API 模式。

本地开发时，Live API 依赖 Vite dev server 的 `/v1/team` 代理。默认代理目标是主 `ugk-pi` 服务：

```bash
http://127.0.0.1:3000
```

所以使用 Live API preview 前，需要先确保主服务已经运行在 `http://127.0.0.1:3000`。如主服务不在默认端口，可用 `TEAM_CONSOLE_API_TARGET` 覆盖代理目标：

```bash
TEAM_CONSOLE_API_TARGET=http://127.0.0.1:3100 npm run dev
```

Live API 模式会真实请求：

- `GET /v1/team/plans`
- `GET /v1/team/runs`
- `GET /v1/team/runs/:runId`

当前 preview 没有 live run picker；它会按 `createdAt` 选择最新 run，再用该 run 的 `planId` 匹配 plan 后渲染执行图。请求失败会在页面顶部显示错误，不会继续展示旧 mock 数据。

Mock fixture 覆盖以下场景：

- 顺序 run
- Discovery + ForEach 动态 run
- Decomposition split run
- 失败 run
- 含未归属子任务 run
- 大量子任务 run（10 个子任务）
- 含跳过任务 run

## Execution Map 视觉设计

纵向流式执行图，根节点在顶部，主任务沿左侧 spine 向下排列，子任务分支到右侧。

### 节点样式

- 每个节点有 4px 左侧状态色条（running=蓝色脉冲、succeeded=绿色、failed=红色、paused=黄色、dimmed=灰色半透明）
- 选中节点有 accent 色发光边框；chain-selected（从根到选中节点的路径）使用 `color-mix` 半透明混合
- 失败节点有红色边框渐变和错误首行文本
- 折叠节点使用虚线边框，orphan 节点使用点线边框
- `data-kind` 属性支持按节点类型做 CSS 选择器

### 连接线

- Spine（根→主任务→主任务）：center-to-center 三次贝塞尔曲线
- Branch（主任务→子任务）：L 形直角折线
- 选中链路的连接线高亮为 accent 色

### 折叠行为

超过 `CHILD_COLLAPSE_THRESHOLD`(6) 个子任务时折叠为摘要节点，摘要状态按隐藏子任务聚合计算。

### 响应式

`@media (max-width: 720px)` 时连接线隐藏，节点改为纵向堆叠。

## 架构

- `src/app/` — App shell、状态管理、数据源切换
- `src/api/` — Team API 类型定义和 adapter
- `src/fixtures/` — Mock fixture 数据
- `src/graph/` — Execution Map model、layout、React 组件、CSS
- `src/shared/` — 通用工具函数
- `src/features/` — 功能模块占位（后续迭代）

## 当前边界

- 仍是独立 preview，不替换 `/playground/team`
- 不调用 manual disposition、rerun、pause/resume/cancel API
- 不读取 attempt 文件内容
- 不支持拖拽、缩放、框选或编辑 Plan
- Execution Map 只做展示与 task 详情选择；大量子任务会折叠为 summary node，并按隐藏子任务状态汇总显示
