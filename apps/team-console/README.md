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

默认使用 Mock fixture 数据。顶部可切换 Live API 模式（需后端运行）。

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

## 架构

- `src/app/` — App shell、状态管理、数据源切换
- `src/api/` — Team API 类型定义和 adapter
- `src/fixtures/` — Mock fixture 数据
- `src/graph/` — Execution Map model、layout、React 组件
- `src/shared/` — 通用工具函数
- `src/features/` — 功能模块占位（后续迭代）

## 当前边界

- 仍是独立 preview，不替换 `/playground/team`
- 不调用 manual disposition、rerun、pause/resume/cancel API
- 不读取 attempt 文件内容
- 不支持拖拽、缩放、框选或编辑 Plan
- Execution Map 只做展示与 task 详情选择；大量子任务会折叠为 summary node，并按隐藏子任务状态汇总显示
