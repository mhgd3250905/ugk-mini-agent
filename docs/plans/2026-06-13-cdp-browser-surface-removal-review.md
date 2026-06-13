# CDP/browser 功能面清理 review 报告

日期：2026-06-13

## 结论

本轮已移除开发期遗留 CDP/browser 功能面。当前 Windows Core 不再内置浏览器实例注册、CDP 控制、`/v1/browsers` 路由、browser workbench、Agent/Conn/Team browser binding、browser scope cleanup 或相关运行时环境注入。

## 清理范围

- 删除服务端浏览器模块：`src/browser/*`。
- 删除浏览器路由与注册：`src/routes/browsers.ts`、`src/server.ts` 中的 browser registry/control/audit/scope route 注册。
- 删除 Agent run browser cleanup：`src/agent/browser-cleanup.ts`，并将 run scope 收敛为通用 `createAgentRunScope()`。
- 删除 browser-bound bash 与 CDP route cache 相关注入。
- 移除 Agent profile / template / API 中的 `defaultBrowserId`。
- 移除 Chat / Conn / Team 请求、运行态和 UI 中的 `browserId` / `browserScope`。
- 移除 Conn SQLite schema 和 migration 中的 `browser_id`。
- 移除 Playground browser workbench、Agent 默认浏览器编辑器、Conn 任务级浏览器选择器、Team runtime browser 展示。
- 移除 `apps/team-console` 前端类型、请求 payload、UI 标签、fixtures/tests 中的 browser binding 字段。
- 同步 `.pi/skills`、README、native 文档、Playground 文档、架构测试矩阵和当前 handoff。
- 删除或改写 CDP/browser 专属测试，新增 `test/no-cdp-surface.test.ts` 防回归。

## 删除文件

- `src/agent/browser-cleanup.ts`
- `src/browser/browser-binding-audit-log.ts`
- `src/browser/browser-binding-policy.ts`
- `src/browser/browser-bound-bash.ts`
- `src/browser/browser-control.ts`
- `src/browser/browser-instance.ts`
- `src/browser/browser-registry.ts`
- `src/browser/browser-scope-routes.ts`
- `src/browser/browser-target-usage.ts`
- `src/routes/browsers.ts`
- `src/ui/playground-browser-workbench.ts`
- `test/browser-cleanup.test.ts`
- `test/browser-registry.test.ts`
- `test/browser-routes.test.ts`
- `test/browser-scope-routes.test.ts`
- `test/chat-agent-browser-routes.test.ts`
- `test/team-agent-profile-runner-browser-binding.test.ts`
- `test/team-agent-profile-runner-browser-context.test.ts`

## 扫描结果

核心生产入口精确旧关键词扫描 0 命中。命令排除本 review 报告、feedback 和 change-log 这类记录文档，避免把说明文字当成运行面残留：

```powershell
rg -n "browserId|defaultBrowserId|browserScope|browser-registry|browser-scope-routes|browser-bound-bash|closeBrowserTargetsForScope|setBrowserScopeRoute|BrowserRegistry|/v1/browsers|WEB_ACCESS|CDP|x-ugk-browser|browser_changed|connEditorBrowserId|editor-browser-id|conn-editor-browser-id|playground-browser|browserWorkbench|browser automation|UGK_BROWSER_SCOPE_ROUTE_CACHE_PATH|agent-manager-list-browser" apps .pi src README.md docs runtime --glob '!docs/plans/**' --glob '!docs/change-log.md'
```

剩余 `browser` 字符串属于非 CDP 语义或负向测试，例如浏览器端 Markdown 渲染、网页刷新、非 HTTPS 浏览器兼容、`Browser-safe` DTO 注释，以及测试中的 `doesNotMatch()` 防回归断言。

## 验证记录

- `npx tsc --noEmit`：通过。
- `git diff --check`：通过。
- `node --test --test-concurrency=1 --import tsx test\no-cdp-surface.test.ts`：1/1 通过。
- Agent / background / artifact focused suite：98/98 通过。
- Conn / Playground / runtime focused suite：134/134 通过。
- Team focused suite：242/242 通过。
- `npm --prefix apps/team-console run build`：通过。
- `npm --prefix apps/team-console test -- --maxWorkers=1 --minWorkers=1`：52 个文件、754/754 通过。

## Review 重点建议

- 确认 `/v1/browsers` 和 CDP control surface 已不再从 `src/server.ts` 暴露。
- 确认 Agent / Conn / Team 的运行配置不再接受或持久化 browser binding 字段。
- 确认 `apps/team-console` 前端类型、请求 payload、UI 标签和 fixtures 不再声明 browser binding 字段。
- 确认 Conn schema 不再恢复 `browser_id`，符合“开发中无历史包袱”的决策。
- 确认 `test/no-cdp-surface.test.ts` 覆盖核心生产入口，避免后续误把 CDP/browser 面加回。

## 不在本轮范围

- 普通网页浏览器兼容逻辑没有移除，例如 Playground 前端脚本、Markdown 浏览器端渲染、页面刷新后的 SSE 恢复。
- 外部 Web 自动化能力未内置；如后续需要，应走显式安装的用户 skill 或 MCP server，而不是恢复 CDP/browser 核心功能面。
