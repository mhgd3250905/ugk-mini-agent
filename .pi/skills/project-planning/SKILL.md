---
name: project-planning
description: 用于 ugk-pi 项目的快速上手、/init、方案收敛和实施前规划。适用于需要先搞清楚项目现状、边界、目录职责、运行方式和后续执行顺序的任务。
---

# Project Planning

## 何时使用

当任务处于下面这些场景时使用本技能：

- 新 agent 第一次接手当前项目
- 用户执行 `/init` 或要求“先了解项目”
- 需求还在收敛，暂时不该直接改代码
- 需要在实现前先澄清边界、目录职责、运行方式和风险
- 需要输出计划文档、实施顺序或验收路径

## 首先读取

优先读取这些文件，不要一上来乱翻整个仓库：

- `AGENTS.md`
- `README.md`
- `.codex/plans/` 下最新相关计划
- `src/server.ts`
- `src/agent/agent-service.ts`
- `src/agent/agent-session-factory.ts`
- `src/routes/chat.ts`
- `src/ui/playground.ts`
- `references/pi-mono/packages/coding-agent/README.md`
- `references/pi-mono/packages/coding-agent/docs/settings.md`
- `references/pi-mono/AGENTS.md`

如果用户问“当前有哪些技能”或“某个 skill 是否生效”，优先看：

- `GET /v1/debug/skills`

不要把模型自述当成事实源。

## 当前项目的默认认知

在没有更新信息前，先按下面这些事实理解项目：

- 这是一个基于 `pi-coding-agent` 的自定义 HTTP agent 原型，不是完整业务产品
- 当前主线是：`自定义 agent + HTTP API + playground + 后续 IM 接入`
- 核心入口：
  - `GET /healthz`
  - `GET /playground`
  - `GET /v1/debug/skills`
  - `POST /v1/chat`
  - `POST /v1/chat/stream`
- 核心代码：
  - `src/server.ts`
  - `src/agent/`
  - `src/routes/`
  - `src/ui/playground.ts`
- 参考镜像：
  - `references/pi-mono/`
  - 这是参考资料，不是业务代码目录
- 系统技能目录：
  - `.pi/skills`
- 用户技能目录：
  - `runtime/skills-user`
- 用户新装 skill 写进 `runtime/skills-user` 后，下一条消息即可生效
- 本机开发使用 Windows Core 运行命令

## 工作流

### 1. 先判断任务性质

先判断这次任务属于哪类：

- 纯理解项目
- 方案规划
- 文档/技能更新
- 代码实现
- 容器/运行时排障

如果只是 `/init`、方案对齐或项目理解，不要一上来改业务代码。

### 2. 先形成最小项目心智模型

至少要搞清楚这些问题：

- 这个项目当前已经能跑什么
- 这个项目明确还没做什么
- 哪些目录是业务代码，哪些目录只是参考或运行时数据
- 当前推荐运行方式是什么
- 当前 skill 体系怎么分层
- 验证该看哪些接口、哪些命令、哪些日志

### 3. 输出结果时要说人话

给用户的总结至少应包含：

- 当前项目是什么
- 已完成能力
- 当前边界
- 关键目录和入口
- 推荐下一步

如果用户要执行计划，再补：

- 目标
- 非目标
- 风险
- 实施顺序
- 验证方式

### 4. 需要正式计划时落地到文件

如果任务明显是多步骤实施，不要只在聊天里空口白话，写到：

- `.codex/plans/YYYY-MM-DD-<topic>.md`

计划文档里至少写清：

- 背景
- 目标
- 非目标
- 实施步骤
- 风险与回滚
- 验证方式

## 本项目的高频坑

- 不要修改 `references/pi-mono/`，除非用户明确要求同步参考镜像
- 不要把“模型说自己会什么 skill”当真，先看 `/v1/debug/skills`
- 不要把开发容器和生产容器混为一谈
- 不要把用户 skill 装到别的目录，正确位置是 `runtime/skills-user`
- 不要假设 Windows 下热更新永远可靠，必要时重启开发容器
- 不要把当前原型吹成完整平台，项目还在基础设施阶段

## 输出风格

- 先给项目现状，再给关键文件，再给建议动作
- 结论要直接，不要装懂，不要空泛
- 如果发现用户理解有偏差，直接指出来
