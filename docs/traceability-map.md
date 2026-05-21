# 追溯地图

这份文档只回答一个问题：

“我现在碰到某类问题，先看哪几个文件最省命？”

## A. 快速接手项目

先看：

1. [AGENTS.md](/E:/AII/ugk-pi/AGENTS.md)
2. [README.md](/E:/AII/ugk-pi/README.md)
3. [docs/architecture-governance-guide.md](/E:/AII/ugk-pi/docs/architecture-governance-guide.md)
4. [docs/server-ops.md](/E:/AII/ugk-pi/docs/server-ops.md)
5. [docs/server-ops-quick-reference.md](/E:/AII/ugk-pi/docs/server-ops-quick-reference.md)
6. [docs/docker-local-ops.md](/E:/AII/ugk-pi/docs/docker-local-ops.md)
7. [docs/web-access-browser-bridge.md](/E:/AII/ugk-pi/docs/web-access-browser-bridge.md)
8. [docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)
9. [docs/aliyun-ecs-deploy.md](/E:/AII/ugk-pi/docs/aliyun-ecs-deploy.md)
10. [src/server.ts](/E:/AII/ugk-pi/src/server.ts)
11. [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)
12. [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
13. [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
14. [src/ui/playground-page-shell.ts](/E:/AII/ugk-pi/src/ui/playground-page-shell.ts)
15. [src/ui/playground-styles.ts](/E:/AII/ugk-pi/src/ui/playground-styles.ts)
16. [src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)
17. [src/ui/playground-assets-controller.ts](/E:/AII/ugk-pi/src/ui/playground-assets-controller.ts)
18. [src/ui/playground-context-usage-controller.ts](/E:/AII/ugk-pi/src/ui/playground-context-usage-controller.ts)
19. [src/ui/playground-conversations-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversations-controller.ts)
20. [src/ui/playground-layout-controller.ts](/E:/AII/ugk-pi/src/ui/playground-layout-controller.ts)
21. [src/ui/playground-transcript-renderer.ts](/E:/AII/ugk-pi/src/ui/playground-transcript-renderer.ts)
22. [src/ui/playground-markdown.ts](/E:/AII/ugk-pi/src/ui/playground-markdown.ts)
23. [src/ui/playground-stream-controller.ts](/E:/AII/ugk-pi/src/ui/playground-stream-controller.ts)
24. [src/ui/playground-mobile-shell-controller.ts](/E:/AII/ugk-pi/src/ui/playground-mobile-shell-controller.ts)
25. [src/ui/playground-active-run-normalizer.ts](/E:/AII/ugk-pi/src/ui/playground-active-run-normalizer.ts)
26. [src/ui/playground-conversation-api-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversation-api-controller.ts)
27. [src/ui/playground-conversation-sync-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversation-sync-controller.ts)
28. [src/ui/playground-conversation-state-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversation-state-controller.ts)
29. [src/ui/playground-conversation-history-store.ts](/E:/AII/ugk-pi/src/ui/playground-conversation-history-store.ts)
30. [src/ui/playground-history-pagination-controller.ts](/E:/AII/ugk-pi/src/ui/playground-history-pagination-controller.ts)
31. [src/ui/playground-process-controller.ts](/E:/AII/ugk-pi/src/ui/playground-process-controller.ts)
32. [src/ui/playground-status-controller.ts](/E:/AII/ugk-pi/src/ui/playground-status-controller.ts)
33. [src/ui/playground-confirm-dialog-controller.ts](/E:/AII/ugk-pi/src/ui/playground-confirm-dialog-controller.ts)
34. [src/ui/playground-notification-controller.ts](/E:/AII/ugk-pi/src/ui/playground-notification-controller.ts)
35. [src/ui/playground-panel-focus-controller.ts](/E:/AII/ugk-pi/src/ui/playground-panel-focus-controller.ts)
36. [src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)
37. [src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)
38. [src/ui/team-page.ts](/E:/AII/ugk-pi/src/ui/team-page.ts)

当前阶段先记住这句话：`web-access` 默认是 Docker Chrome sidecar，不是 Windows 宿主 IPC。后续看到 `requestHostBrowser()` 这个名字别被它骗了，它在 `direct_cdp` 模式下会直接连 sidecar。

本地 Docker 启动、重建、端口 `3000`、orphan nginx、SQLite 和技能加载排障先看 [docs/docker-local-ops.md](/E:/AII/ugk-pi/docs/docker-local-ops.md)。不要把本地 compose、生产 compose 和旧 nginx 入口混着用。

再记一句浏览器绑定红线：Agent / Conn 的 Chrome 绑定只能由用户在 Playground UI 手动设置。排查时看 `docs/playground-current.md`、`docs/web-access-browser-bridge.md`、`src/browser/browser-binding-policy.ts`、`src/routes/chat.ts`、`src/routes/conns.ts`、`src/browser/browser-bound-bash.ts` 和 `runtime/skills-user/web-access/scripts/local-cdp-browser.mjs`；不要恢复自然语言改浏览器，不要把 `browser-scope-routes.json` 当长期配置，不要让 Agent 通过 `metaBrowserId` 或环境里的完整浏览器清单绕到其他 Chrome。

再记一句：当前已开始引入“单进程多 agent profile”底座，第一版内置 `main` 与 `search`，后续自定义 agent 记录在 `.data/agents/profiles.json`。`GET /v1/agents` 是当前运行时注册可用列表；`profiles.json` 只代表用户创建记录，不是完整注册表，也不是创建 / 修复入口。禁止直接编辑 `profiles.json` 创建、恢复、归档或修复 agent；手写文件会绕过 `AgentServiceRegistry`，导致磁盘说存在、运行时列表看不到。`main` 继续走旧 `/v1/chat/*`，`search` 和后续 agent 走 `/v1/agents/:agentId/...`。排查技能串场、会话串场或创建 / 归档 agent 时先看 [src/agent/agent-profile.ts](/E:/AII/ugk-pi/src/agent/agent-profile.ts)、[src/agent/agent-profile-catalog.ts](/E:/AII/ugk-pi/src/agent/agent-profile-catalog.ts)、[src/agent/agent-service-registry.ts](/E:/AII/ugk-pi/src/agent/agent-service-registry.ts)、[src/routes/agent-profiles.ts](/E:/AII/ugk-pi/src/routes/agent-profiles.ts)、[src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)、[.pi/skills/agent-profile-ops/SKILL.md](/E:/AII/ugk-pi/.pi/skills/agent-profile-ops/SKILL.md) 和 [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)。

用户问“我有哪些 agent / 有哪些 agent / 当前有哪些 agent”时，默认指 `/v1/agents` 的 agent profile / 操作视窗，不是 `.pi/agents` 里的 legacy subagent。只有明确说 `subagent`、`scout/planner/worker/reviewer` 或“派发子任务”时才看 `.pi/agents`。

再记一句：当前代码主仓库已经切到 GitHub，服务器默认部署目录也已经迁到 `~/ugk-claw-repo`；旧的 `~/ugk-pi-claw` 只留给回滚和比对，别再把它当默认更新入口。

如果是云端 `/init`，再记一句：

- 腾讯云当前主目录是 `~/ugk-claw-repo`，shared 运行态目录是 `~/ugk-claw-shared`；旧的 `~/ugk-pi-claw` 只用于回滚和比对，别在错误目录里更新完了还以为自己部署成功。
- 阿里云 ECS 当前公网入口是 `http://101.37.209.54:3000/playground`，主目录是 `/root/ugk-claw-repo`，shared 目录是 `/root/ugk-claw-shared`；截至 `2026-04-29` 已迁移为 Git 工作目录，后续默认走 `git pull --ff-only`，不要再默认 archive 上传。
- 两台服务器的用户 skills 都属于 shared 运行态：腾讯云 `~/ugk-claw-shared/runtime/skills-user`，阿里云 `/root/ugk-claw-shared/runtime/skills-user`；排查技能丢失先看 `UGK_RUNTIME_SKILLS_USER_DIR` 和 `GET /v1/debug/skills`。排查运行态挂载、session、conn SQLite 和公开配置时看 `GET /v1/debug/runtime`。
- 如果这次 `/init` 还要接手 `playground` 前端，先读 [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)；当前手机端是单独重写的移动展示层，不要按桌面端缩略版理解
- 如果这次还要接着改 `playground` runtime，而不是只看当前 UI 口径，再补读 [docs/playground-runtime-refactor-summary-2026-04-22.md](/E:/AII/ugk-pi/docs/playground-runtime-refactor-summary-2026-04-22.md)；这轮 controller / renderer / sync ownership / stream lifecycle 是怎么收口的，都在那里，别重复考古
- 如果这次目标是直接发布或接线上盘，优先读 [docs/server-ops.md](/E:/AII/ugk-pi/docs/server-ops.md) 和 [docs/server-ops-quick-reference.md](/E:/AII/ugk-pi/docs/server-ops-quick-reference.md)；[docs/handoff-current.md](/E:/AII/ugk-pi/docs/handoff-current.md) 是当前接手摘要，但具体发布命令仍以 server ops 文档为准。

## B. 聊天、流式、追加消息、打断

先看：

1. [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)
2. [src/routes/chat-route-parsers.ts](/E:/AII/ugk-pi/src/routes/chat-route-parsers.ts)
3. [src/routes/chat-sse.ts](/E:/AII/ugk-pi/src/routes/chat-sse.ts)
4. [src/routes/http-errors.ts](/E:/AII/ugk-pi/src/routes/http-errors.ts)
5. [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
6. [src/agent/agent-conversation-catalog.ts](/E:/AII/ugk-pi/src/agent/agent-conversation-catalog.ts)
7. [src/agent/agent-conversation-commands.ts](/E:/AII/ugk-pi/src/agent/agent-conversation-commands.ts)
8. [src/agent/agent-conversation-context.ts](/E:/AII/ugk-pi/src/agent/agent-conversation-context.ts)
9. [src/agent/agent-conversation-session.ts](/E:/AII/ugk-pi/src/agent/agent-conversation-session.ts)
10. [src/agent/agent-conversation-state.ts](/E:/AII/ugk-pi/src/agent/agent-conversation-state.ts)
11. [src/agent/agent-terminal-run.ts](/E:/AII/ugk-pi/src/agent/agent-terminal-run.ts)
12. [src/agent/agent-queue-message.ts](/E:/AII/ugk-pi/src/agent/agent-queue-message.ts)
13. [src/agent/agent-prompt-assets.ts](/E:/AII/ugk-pi/src/agent/agent-prompt-assets.ts)
14. [src/agent/agent-run-scope.ts](/E:/AII/ugk-pi/src/agent/agent-run-scope.ts)
15. [src/agent/agent-run-result.ts](/E:/AII/ugk-pi/src/agent/agent-run-result.ts)
16. [src/agent/agent-session-event-adapter.ts](/E:/AII/ugk-pi/src/agent/agent-session-event-adapter.ts)
17. [src/agent/agent-conversation-history.ts](/E:/AII/ugk-pi/src/agent/agent-conversation-history.ts)
18. [src/agent/agent-process-text.ts](/E:/AII/ugk-pi/src/agent/agent-process-text.ts)
19. [src/agent/agent-active-run-view.ts](/E:/AII/ugk-pi/src/agent/agent-active-run-view.ts)
20. [src/agent/agent-session-event-guards.ts](/E:/AII/ugk-pi/src/agent/agent-session-event-guards.ts)
21. [src/agent/agent-run-events.ts](/E:/AII/ugk-pi/src/agent/agent-run-events.ts)
22. [src/agent/agent-session-factory.ts](/E:/AII/ugk-pi/src/agent/agent-session-factory.ts)
23. [src/types/api.ts](/E:/AII/ugk-pi/src/types/api.ts)

重点接口：

- `GET /v1/chat/status`
- `GET /v1/agents/status`
- `GET /v1/chat/state`
- `GET /v1/chat/events`
- `GET /v1/chat/conversations`
- `POST /v1/chat/conversations`
- `PATCH /v1/chat/conversations/:conversationId`
- `DELETE /v1/chat/conversations/:conversationId`
- `POST /v1/chat/current`
- `POST /v1/chat/reset`
- `POST /v1/chat`
- `POST /v1/chat/stream`
- `POST /v1/chat/queue`
- `POST /v1/chat/interrupt`

多 agent 并行排查时，先用 `GET /v1/agents/status` 看 agent profile 级 `idle / busy`；单个 conversation 的上下文用量和 running 状态仍看 `GET /v1/chat/status` 或 `GET /v1/agents/:agentId/chat/status`。同一 agent 忙时，非流式 chat 会返回 `409 AGENT_BUSY`；流式 chat 会在 SSE hijack 前做同样预检。

## C. Playground 页面、消息气泡、过程区

先看：

1. [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
2. [src/ui/playground-page-shell.ts](/E:/AII/ugk-pi/src/ui/playground-page-shell.ts)
3. [src/ui/playground-styles.ts](/E:/AII/ugk-pi/src/ui/playground-styles.ts)
4. [src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)
5. [src/ui/playground-assets-controller.ts](/E:/AII/ugk-pi/src/ui/playground-assets-controller.ts)
6. [src/ui/playground-context-usage-controller.ts](/E:/AII/ugk-pi/src/ui/playground-context-usage-controller.ts)
7. [src/ui/playground-conversations-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversations-controller.ts)
8. [src/ui/playground-layout-controller.ts](/E:/AII/ugk-pi/src/ui/playground-layout-controller.ts)
9. [src/ui/playground-transcript-renderer.ts](/E:/AII/ugk-pi/src/ui/playground-transcript-renderer.ts)
10. [src/ui/playground-markdown.ts](/E:/AII/ugk-pi/src/ui/playground-markdown.ts)
11. [src/ui/playground-stream-controller.ts](/E:/AII/ugk-pi/src/ui/playground-stream-controller.ts)
12. [src/ui/playground-mobile-shell-controller.ts](/E:/AII/ugk-pi/src/ui/playground-mobile-shell-controller.ts)
13. [src/ui/playground-active-run-normalizer.ts](/E:/AII/ugk-pi/src/ui/playground-active-run-normalizer.ts)
14. [src/ui/playground-conversation-api-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversation-api-controller.ts)
15. [src/ui/playground-conversation-sync-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversation-sync-controller.ts)
16. [src/ui/playground-conversation-state-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conversation-state-controller.ts)
17. [src/ui/playground-conversation-history-store.ts](/E:/AII/ugk-pi/src/ui/playground-conversation-history-store.ts)
18. [src/ui/playground-history-pagination-controller.ts](/E:/AII/ugk-pi/src/ui/playground-history-pagination-controller.ts)
19. [src/ui/playground-process-controller.ts](/E:/AII/ugk-pi/src/ui/playground-process-controller.ts)
20. [src/ui/playground-status-controller.ts](/E:/AII/ugk-pi/src/ui/playground-status-controller.ts)
21. [src/ui/playground-confirm-dialog-controller.ts](/E:/AII/ugk-pi/src/ui/playground-confirm-dialog-controller.ts)
22. [src/ui/playground-notification-controller.ts](/E:/AII/ugk-pi/src/ui/playground-notification-controller.ts)
23. [src/ui/playground-panel-focus-controller.ts](/E:/AII/ugk-pi/src/ui/playground-panel-focus-controller.ts)
24. [src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)
25. [src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)
26. [src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)
27. [src/ui/playground-agent-manager.ts](/E:/AII/ugk-pi/src/ui/playground-agent-manager.ts)
28. [src/ui/playground-workspace-controller.ts](/E:/AII/ugk-pi/src/ui/playground-workspace-controller.ts)
29. [src/ui/playground-browser-workbench.ts](/E:/AII/ugk-pi/src/ui/playground-browser-workbench.ts)
30. [src/ui/team-page.ts](/E:/AII/ugk-pi/src/ui/team-page.ts)
31. [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)
32. [test/team-page-ui.test.ts](/E:/AII/ugk-pi/test/team-page-ui.test.ts)
33. [docs/playground-current.md](/E:/AII/ugk-pi/docs/playground-current.md)
34. [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)
35. [docs/playground-runtime-refactor-summary-2026-04-22.md](/E:/AII/ugk-pi/docs/playground-runtime-refactor-summary-2026-04-22.md)

适用问题：

- 助手/用户消息样式
- 过程区与 loading 气泡
- markdown hydration、代码块 copy toolbar、复制正文按钮、历史恢复后的消息拼装；服务器端 markdown HTML 渲染看 `src/ui/playground-markdown.ts`，浏览器端 hydration 看 `src/ui/playground-transcript-renderer.ts`
- active run 和 process view 的前端数据归一化看 `src/ui/playground-active-run-normalizer.ts`
- 上下文用量进度环、token 估算、详情弹层和输入实时重算；运行时逻辑看 `src/ui/playground-context-usage-controller.ts`
- `/v1/chat/status`、`/v1/chat/state`、`/v1/chat/history` 的前端请求和响应兜底归一化看 `src/ui/playground-conversation-api-controller.ts`
- 上滑触顶加载更早历史、history loading 状态和 prepend 后滚动位置补偿看 `src/ui/playground-history-pagination-controller.ts`
- 顶部状态、loading 忙态、error banner、控制动作错误文案和 stage mode 切换看 `src/ui/playground-status-controller.ts`
- 文件卡片“打开 / 下载”；文件上传区、文件 chip、资产库弹窗静态片段先看 `src/ui/playground-assets.ts`，运行时上传、拖拽、复用和下载卡片逻辑看 `src/ui/playground-assets-controller.ts`
- 后台 conn 结果的“查看任务过程”入口；静态样式 / 弹窗 HTML 先看 `src/ui/playground-conn-activity.ts`，浏览器运行时逻辑看 `src/ui/playground-conn-activity-controller.ts`
- 任务消息页、跨会话 conn 结果观察、`/v1/activity` 读取；任务消息主体在 `src/ui/playground-task-inbox.ts`，后台 run 详情弹层仍复用 `src/ui/playground-conn-activity.ts` 和 `src/ui/playground-conn-activity-controller.ts`
- 删除会话、删除后台任务等二次确认弹窗的打开 / 关闭 / 默认文案 / tone 控制看 `src/ui/playground-confirm-dialog-controller.ts`
- 实时通知 toast 的事件规范化、时间格式化、live region 显隐和自动移除看 `src/ui/playground-notification-controller.ts`；SSE 连接生命周期仍看 `src/ui/playground-stream-controller.ts`
- 文件库、任务消息、后台任务、确认框等弹层的关闭前焦点释放和返回焦点恢复；共享 helper 看 `src/ui/playground-panel-focus-controller.ts`
- 刷新后运行态恢复
- 新会话创建、当前会话切换、刷新后跟随服务端当前会话
- 发送后立即清空输入框
- 手机端紧凑品牌状态栏、左侧历史会话抽屉、右上角溢出菜单、底部 icon 发送区
- 手机端代码块宽度、复制 icon 与透明壳层
- 底部 composer 遮挡最后一条消息、active transcript 滚动缓冲、最后一屏无法继续上拖
- composer 高度同步、回到底部按钮、用户上滑读历史时不抢滚动、`visibilitychange/pageshow/online` 恢复入口
- `/v1/chat/stream`、`/v1/chat/events`、`/v1/notifications/stream`、断线恢复、`send / queue / interrupt`

## D. 文件上传、资产复用、send_file、本地报告访问

先看：

1. [src/routes/files.ts](/E:/AII/ugk-pi/src/routes/files.ts)
2. [src/routes/file-route-utils.ts](/E:/AII/ugk-pi/src/routes/file-route-utils.ts)
3. [src/routes/static.ts](/E:/AII/ugk-pi/src/routes/static.ts)
4. [src/agent/asset-store.ts](/E:/AII/ugk-pi/src/agent/asset-store.ts)
5. [src/agent/agent-prompt-assets.ts](/E:/AII/ugk-pi/src/agent/agent-prompt-assets.ts)
6. [src/ui/playground-assets.ts](/E:/AII/ugk-pi/src/ui/playground-assets.ts)
7. [src/ui/playground-assets-controller.ts](/E:/AII/ugk-pi/src/ui/playground-assets-controller.ts)
8. [src/agent/file-artifacts.ts](/E:/AII/ugk-pi/src/agent/file-artifacts.ts)
9. [src/agent/agent-file-history.ts](/E:/AII/ugk-pi/src/agent/agent-file-history.ts)
10. [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)
11. [.pi/extensions/send-file.ts](/E:/AII/ugk-pi/.pi/extensions/send-file.ts)
12. [docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)

适用问题：
- 浏览器选择文件后没反应、上传接口返回 `413` 或 `400`
- 大文件不应该再被 base64 塞进 JSON body
- `conn` 编辑器上传新文件失败，或者上传后没有进入“附加资料”
- `send_file` 没出现在文件卡片里
- `send_file` 工具结果在流式 done、刷新恢复或历史消息里没有挂回文件卡片；解析和合并逻辑看 `src/agent/agent-file-history.ts`
- 图片/报告下载 0B
- 用户拿到的是容器 `file:///app/...`
- HTML / 图片已经生成，但浏览器打不开
- `/v1/local-file?path=...` 返回异常
- conn 长期公开文件应该走 `/v1/conns/:connId/public/...`，多个 conn 共建网站应该走 `/v1/sites/:siteId/...`

如果问题是“agent 内部想继续用 `file:///app/...`，但用户看到的地址必须能打开”，重点看：

- [src/agent/file-artifacts.ts](/E:/AII/ugk-pi/src/agent/file-artifacts.ts)
- [src/agent/agent-prompt-assets.ts](/E:/AII/ugk-pi/src/agent/agent-prompt-assets.ts)
- [src/agent/agent-service.ts](/E:/AII/ugk-pi/src/agent/agent-service.ts)

## E. 技能加载、真实技能清单、web-access

先看：

1. `GET /v1/debug/skills`
2. `GET /v1/agents/:agentId/debug/skills`
3. `GET /v1/debug/runtime`
4. [src/agent/agent-profile.ts](/E:/AII/ugk-pi/src/agent/agent-profile.ts)
5. [src/agent/agent-profile-bootstrap.ts](/E:/AII/ugk-pi/src/agent/agent-profile-bootstrap.ts)
6. [src/agent/agent-profile-catalog.ts](/E:/AII/ugk-pi/src/agent/agent-profile-catalog.ts)
7. [src/agent/agent-service-registry.ts](/E:/AII/ugk-pi/src/agent/agent-service-registry.ts)
8. [src/routes/agent-profiles.ts](/E:/AII/ugk-pi/src/routes/agent-profiles.ts)
9. [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)
10. [src/routes/runtime-debug.ts](/E:/AII/ugk-pi/src/routes/runtime-debug.ts)
11. [.pi/skills](/E:/AII/ugk-pi/.pi/skills)
12. [.pi/skills/agent-profile-ops/SKILL.md](/E:/AII/ugk-pi/.pi/skills/agent-profile-ops/SKILL.md)
13. [runtime/skills-user](/E:/AII/ugk-pi/runtime/skills-user)
14. [.data/agents/search/pi/skills](/E:/AII/ugk-pi/.data/agents/search/pi/skills)
15. [.data/agents/search/user-skills](/E:/AII/ugk-pi/.data/agents/search/user-skills)
16. [docs/web-access-browser-bridge.md](/E:/AII/ugk-pi/docs/web-access-browser-bridge.md)
17. [src/agent/browser-cleanup.ts](/E:/AII/ugk-pi/src/agent/browser-cleanup.ts)

技能管理接口：

- `GET /v1/agents/:agentId/skills`：返回已安装技能列表，含 enabled / required 状态。
- `PATCH /v1/agents/:agentId/skills/:skillName`：切换技能启用/关闭；运行中 conversation 返回 409。
- 排查 skill toggle 问题时看 `src/agent/agent-profile-catalog.ts`（deny-list 持久化）、`src/agent/agent-session-factory.ts`（filtered loader）、`src/routes/agent-profiles.ts`（管理路由注册）、`src/routes/chat.ts`（main/scoped chat 路由注册入口）、`src/ui/playground-agent-manager.ts`（Playground 内嵌开关）、[src/ui/agents-page.ts](/E:/AII/ugk-pi/src/ui/agents-page.ts)（独立 Agents 页开关）。

多 agent 口径：

- 旧 `GET /v1/debug/skills` 只代表 `main`。
- `search` 必须查 `GET /v1/agents/search/debug/skills`。
- 创建 agent 走 `POST /v1/agents`，归档 agent 走 `POST /v1/agents/:agentId/archive`；不要直接删除 `.data/agents/:agentId`，也不要直接编辑 `.data/agents/profiles.json`。如果出现 `POST /v1/agents` 提示重复但 `GET /v1/agents` 看不到，优先判断为磁盘 catalog 与进程内 registry 分裂，先通过 API 或重启服务收口，别继续手补 JSON。
- `search` 的 `allowedSkillPaths` 包含 `.data/agents/search/pi/skills` 和 `.data/agents/search/user-skills`，不能回退到主 Agent 的 `.pi/skills` 或 `runtime/skills-user`。如果 search 能看到 main-only skill，说明隔离被打穿，别靠 prompt 自觉糊弄过去。

如果问题跟以下内容有关，直接进 web-access 专题文档，不要在别的地方绕：

- host browser bridge
- Docker Chrome sidecar
- `WEB_ACCESS_BROWSER_PROVIDER=direct_cdp`
- `GET /v1/browsers`
- `UGK_BROWSER_INSTANCES_JSON`
- Agent / Conn 浏览器绑定 UI-only 边界
- `WEB_ACCESS_BROWSER_PUBLIC_BASE_URL`
- `POST /session/close-all?metaAgentScope=...`
- Chrome 持久 profile
- `local_browser_executable_not_found`
- `chrome_cdp_unreachable`
- `/x-search-latest:*`
- X 登录态

如果现象是“sidecar GUI 像没登录，但 agent 还能跑”或“更新后看起来像丢登录”，先看：

- [docs/server-ops-quick-reference.md](/E:/AII/ugk-pi/docs/server-ops-quick-reference.md)
- [docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)

重点核对 `9222/9223`、desktop launcher 是否指向 `ugk-sidecar-chrome`，以及进程是否仍然挂在 `chrome-profile-sidecar`；别一上来就脑补 shared 目录被清空。

## F. Subagent、项目级 prompt、防护

先看：

1. [.pi/extensions/subagent/index.ts](/E:/AII/ugk-pi/.pi/extensions/subagent/index.ts)
2. [.pi/extensions/subagent/agents.ts](/E:/AII/ugk-pi/.pi/extensions/subagent/agents.ts)
3. [.pi/extensions/project-guard.ts](/E:/AII/ugk-pi/.pi/extensions/project-guard.ts)
4. [.pi/agents](/E:/AII/ugk-pi/.pi/agents)
5. [runtime/agents-user](/E:/AII/ugk-pi/runtime/agents-user)
6. [.pi/prompts](/E:/AII/ugk-pi/.pi/prompts)

## G. Conn / Feishu 集成

先看：

1. [src/routes/conns.ts](/E:/AII/ugk-pi/src/routes/conns.ts)
2. [src/routes/conn-route-parsers.ts](/E:/AII/ugk-pi/src/routes/conn-route-parsers.ts)
3. [src/routes/conn-route-presenters.ts](/E:/AII/ugk-pi/src/routes/conn-route-presenters.ts)
4. [src/routes/activity.ts](/E:/AII/ugk-pi/src/routes/activity.ts)
5. [src/routes/activity-route-utils.ts](/E:/AII/ugk-pi/src/routes/activity-route-utils.ts)
6. [src/routes/feishu-settings.ts](/E:/AII/ugk-pi/src/routes/feishu-settings.ts)
7. [src/agent/conn-store.ts](/E:/AII/ugk-pi/src/agent/conn-store.ts)
8. [src/agent/conn-db.ts](/E:/AII/ugk-pi/src/agent/conn-db.ts)
9. [src/agent/conn-sqlite-store.ts](/E:/AII/ugk-pi/src/agent/conn-sqlite-store.ts)
10. [src/agent/conn-run-store.ts](/E:/AII/ugk-pi/src/agent/conn-run-store.ts)
11. [src/agent/agent-activity-store.ts](/E:/AII/ugk-pi/src/agent/agent-activity-store.ts)
12. [src/agent/background-agent-runner.ts](/E:/AII/ugk-pi/src/agent/background-agent-runner.ts)
13. [src/workers/conn-worker.ts](/E:/AII/ugk-pi/src/workers/conn-worker.ts)
14. [src/workers/feishu-worker.ts](/E:/AII/ugk-pi/src/workers/feishu-worker.ts)
15. [src/integrations/feishu/service.ts](/E:/AII/ugk-pi/src/integrations/feishu/service.ts)
16. [src/integrations/feishu/settings-store.ts](/E:/AII/ugk-pi/src/integrations/feishu/settings-store.ts)
17. [src/integrations/feishu/conversation-map-store.ts](/E:/AII/ugk-pi/src/integrations/feishu/conversation-map-store.ts)
18. [src/integrations/feishu/message-parser.ts](/E:/AII/ugk-pi/src/integrations/feishu/message-parser.ts)
19. [test/feishu-message-parser.test.ts](/E:/AII/ugk-pi/test/feishu-message-parser.test.ts)
20. [docs/runtime-assets-conn-feishu.md](/E:/AII/ugk-pi/docs/runtime-assets-conn-feishu.md)
21. [src/ui/playground-conn-activity.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity.ts)
22. [src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)
23. [src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)
24. [src/agent/artifact-contract.ts](/E:/AII/ugk-pi/src/agent/artifact-contract.ts)
25. [src/agent/artifact-validation.ts](/E:/AII/ugk-pi/src/agent/artifact-validation.ts)
26. [src/agent/artifact-repair-loop.ts](/E:/AII/ugk-pi/src/agent/artifact-repair-loop.ts)
27. [src/routes/artifacts.ts](/E:/AII/ugk-pi/src/routes/artifacts.ts)

## H. 容器、部署、健康检查、截图

先看：

1. [Dockerfile](/E:/AII/ugk-pi/Dockerfile)
2. [docker-compose.yml](/E:/AII/ugk-pi/docker-compose.yml)
3. [docker-compose.prod.yml](/E:/AII/ugk-pi/docker-compose.prod.yml)
4. [docs/server-ops-quick-reference.md](/E:/AII/ugk-pi/docs/server-ops-quick-reference.md)
5. [docs/tencent-cloud-singapore-deploy.md](/E:/AII/ugk-pi/docs/tencent-cloud-singapore-deploy.md)
6. [docs/aliyun-ecs-deploy.md](/E:/AII/ugk-pi/docs/aliyun-ecs-deploy.md)
7. [docs/server-ops.md](/E:/AII/ugk-pi/docs/server-ops.md)
8. [src/server.ts](/E:/AII/ugk-pi/src/server.ts)
9. [src/routes/runtime-debug.ts](/E:/AII/ugk-pi/src/routes/runtime-debug.ts)
10. [src/routes/static.ts](/E:/AII/ugk-pi/src/routes/static.ts)
11. [src/routes/files.ts](/E:/AII/ugk-pi/src/routes/files.ts)
12. [runtime/screenshot.mjs](/E:/AII/ugk-pi/runtime/screenshot.mjs)
13. [runtime/screenshot-mobile.mjs](/E:/AII/ugk-pi/runtime/screenshot-mobile.mjs)

适用问题：

- `healthz` 不通
- 腾讯云新加坡服务器更新部署、回滚或 SSH tunnel 不通
- 阿里云 ECS Git 增量更新、Docker 镜像拉取慢或 3000 安全组不通；archive 只作为双远端不可用时的兜底历史方案
- 静态 HTML / PNG 路由不通
- 截图脚本又回退到 `file://`
- `PUBLIC_BASE_URL` 不对
- sidecar Chrome 打开本地 HTML 时访问到 `127.0.0.1:3000` 造成 404
- `WEB_ACCESS_BROWSER_PUBLIC_BASE_URL` 没有指向 `http://ugk-pi:3000`
- `/v1/debug/runtime` 返回 `ok=false` 或列出 failed check

## I. Realtime Notification Broadcast

先看：
1. [src/routes/notifications.ts](/E:/AII/ugk-pi/src/routes/notifications.ts)
2. [src/routes/notification-route-utils.ts](/E:/AII/ugk-pi/src/routes/notification-route-utils.ts)
3. [src/routes/activity.ts](/E:/AII/ugk-pi/src/routes/activity.ts)
4. [src/routes/activity-route-utils.ts](/E:/AII/ugk-pi/src/routes/activity-route-utils.ts)
5. [src/agent/notification-hub.ts](/E:/AII/ugk-pi/src/agent/notification-hub.ts)
6. [src/agent/agent-activity-store.ts](/E:/AII/ugk-pi/src/agent/agent-activity-store.ts)
7. [src/workers/conn-worker.ts](/E:/AII/ugk-pi/src/workers/conn-worker.ts)
8. [src/ui/playground.ts](/E:/AII/ugk-pi/src/ui/playground.ts)
9. [src/ui/playground-stream-controller.ts](/E:/AII/ugk-pi/src/ui/playground-stream-controller.ts)
10. [src/ui/playground-conn-activity-controller.ts](/E:/AII/ugk-pi/src/ui/playground-conn-activity-controller.ts)
11. [src/ui/playground-task-inbox.ts](/E:/AII/ugk-pi/src/ui/playground-task-inbox.ts)
12. [test/notification-hub.test.ts](/E:/AII/ugk-pi/test/notification-hub.test.ts)
13. [test/server.test.ts](/E:/AII/ugk-pi/test/server.test.ts)

适用问题：
- conn 任务明明跑完了，但在线页面不弹实时提示
- worker 广播地址在 Docker 里打到了自己
- SSE 断线后页面不重连
- 当前会话和非当前会话的提示表现不一致
- conn 结果已经完成，但切换会话后只能靠任务消息页找到

## J. Team Runtime v2

先看：

1. [docs/team-runtime.md](/E:/AII/ugk-pi/docs/team-runtime.md)
2. [src/team/types.ts](/E:/AII/ugk-pi/src/team/types.ts)
3. [src/team/routes.ts](/E:/AII/ugk-pi/src/team/routes.ts)
4. [src/team/plan-draft.ts](/E:/AII/ugk-pi/src/team/plan-draft.ts)
5. [src/team/plan-validation.ts](/E:/AII/ugk-pi/src/team/plan-validation.ts)
6. [src/team/orchestrator.ts](/E:/AII/ugk-pi/src/team/orchestrator.ts)
7. [src/team/child-execution.ts](/E:/AII/ugk-pi/src/team/child-execution.ts)
8. [src/team/task-attempt-runner.ts](/E:/AII/ugk-pi/src/team/task-attempt-runner.ts)
9. [src/team/run-workspace.ts](/E:/AII/ugk-pi/src/team/run-workspace.ts)
10. [src/team/run-presenter.ts](/E:/AII/ugk-pi/src/team/run-presenter.ts)
11. [src/ui/team-page.ts](/E:/AII/ugk-pi/src/ui/team-page.ts)
12. [src/ui/team-page-helpers.ts](/E:/AII/ugk-pi/src/ui/team-page-helpers.ts)
13. [test/team-plan-draft.test.ts](/E:/AII/ugk-pi/test/team-plan-draft.test.ts)
14. [test/team-routes.test.ts](/E:/AII/ugk-pi/test/team-routes.test.ts)
15. [test/team-page-ui.test.ts](/E:/AII/ugk-pi/test/team-page-ui.test.ts)

适用问题：

- Plan draft / 自然语言草案生成：`GET /v1/team/plan-templates`、`POST /v1/team/plan-drafts`
- Plan / TeamUnit / Run API：创建 Plan、绑定 TeamUnit、queued run、pause / resume / cancel / rerun
- `discovery` / `for_each` / `decomposer` / outputCheck 的 Plan schema 和运行时行为
- `/playground/team` 创建普通计划、动态计划、自然语言草案，以及查看 run detail / attempts / final report
- run detail API 的 `taskDefinitions`、动态子任务、拆分子任务和 UI 时间线展示
- TeamTemplate / v0.1 域名调查历史只看 [docs/team-runtime.md](/E:/AII/ugk-pi/docs/team-runtime.md) 文末归档章节，不再作为当前主入口

## E2. Agent 管理独立页面

先看：

1. [src/ui/agents-page.ts](/E:/AII/ugk-pi/src/ui/agents-page.ts)
2. [src/ui/standalone-page-shared.ts](/E:/AII/ugk-pi/src/ui/standalone-page-shared.ts)
3. [src/ui/playground-agent-manager.ts](/E:/AII/ugk-pi/src/ui/playground-agent-manager.ts)
4. [src/routes/chat.ts](/E:/AII/ugk-pi/src/routes/chat.ts)
5. [src/agent/agent-profile.ts](/E:/AII/ugk-pi/src/agent/agent-profile.ts)
6. [src/agent/agent-profile-catalog.ts](/E:/AII/ugk-pi/src/agent/agent-profile-catalog.ts)

适用问题：

- Agent 列表、inline 编辑、浏览器绑定下拉
- Per-agent 技能启用/关闭开关、必需技能锁定
- Per-agent 默认模型选择器
- Agent 创建、归档、删除
- 独立页面浅色主题

## G2. Conn 独立工作台页面

先看：

1. [src/ui/conn-page.ts](/E:/AII/ugk-pi/src/ui/conn-page.ts)
2. [src/ui/conn-page-css.ts](/E:/AII/ugk-pi/src/ui/conn-page-css.ts)
3. [src/ui/conn-page-js.ts](/E:/AII/ugk-pi/src/ui/conn-page-js.ts)
4. [src/ui/standalone-page-shared.ts](/E:/AII/ugk-pi/src/ui/standalone-page-shared.ts)
5. [src/ui/playground-transcript-renderer.ts](/E:/AII/ugk-pi/src/ui/playground-transcript-renderer.ts)
6. [src/agent/conn-run-store.ts](/E:/AII/ugk-pi/src/agent/conn-run-store.ts)
7. [src/agent/conn-db.ts](/E:/AII/ugk-pi/src/agent/conn-db.ts)
8. [src/routes/conns.ts](/E:/AII/ugk-pi/src/routes/conns.ts)
9. [src/routes/conn-route-presenters.ts](/E:/AII/ugk-pi/src/routes/conn-route-presenters.ts)

适用问题：

- conn 页面未读 stat card / 列表徽章 / 时间线红点不显示或不更新
- `read_at` 字段、`POST .../runs/:runId/read` 标记已读不生效
- Markdown 渲染（共享 `renderMessageMarkdown`）渲染异常
- Conn 页面布局、卡片背景、徽章样式等 UI 问题
- "新建任务"按钮不清除选中状态
- Playground 桌面端 conn 管理按钮徽章或新标签页打开异常
