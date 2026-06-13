# CDP/browser 功能面移除 — Review 反馈报告

**审核对象**：commit `8963c9bc` "Remove legacy CDP browser surface"，分支 `codex/remove-cdp-browser-surface`
**对照报告**：`docs/plans/2026-06-13-cdp-browser-surface-removal-review.md`
**审核日期**：2026-06-13
**审核方式**：只读（git show / rg / 文件核查），未做任何代码修改

---

## 总体结论

**服务端核心 `src/` 的移除干净、正确、一致，质量高**；但存在 **一处真实遗漏**（`apps/team-console/` 前端契约漂移）、**一处防回归测试覆盖不足**，以及一个**非阻塞的 migration 决策点**。原 review 报告因扫描命令遗漏了 `apps/` 目录，导致遗漏未被发现，"0 命中"结论对前端不成立。

| 维度 | 评价 |
|---|---|
| 服务端 `src/` 移除 | ✅ 干净，0 残留 0 断引用 |
| 数据持久化层 | ✅ schema/migration/store 三处一致 |
| DTO / 路由 / profile | ✅ 彻底移除 |
| 改名一致性（`createAgentRunScope`）| ✅ 定义与 3 个调用点全部同步 |
| `apps/team-console/` 前端 | ❌ **遗漏**，正面 CDP/browser 语义残留 |
| 防回归测试 | ⚠️ 有效但覆盖盲区大 |
| review 报告本身 | ⚠️ 扫描范围不全，结论失实 |

---

## ✅ 做对的部分（已逐项核实）

1. **`src/` 运行态 0 残留**：`src/browser/` 目录 git tracked 文件为 0，无任何 `import ...browser-...` 悬空引用。
2. **改名零成本零风险**：`createBrowserCleanupScope → createAgentRunScope` 仅函数名变更，函数体逐字未变；3 个调用点（`agent-service.ts:599`、`background-agent-runner.ts:60`、`agent-profile-role-runner.ts:309`）签名全部匹配，测试 `agent-run-scope.test.ts` 同步更新。
3. **数据层三处一致**：schema（`conn-db.ts:242-268` 无 `browser_id` 列）、migration（原 `<8` 添加列的块已删）、store（INSERT 占位符 22→21，`rowToConnDefinition` 等读写全部移除）。无"删列但 migration 仍写"的不一致。
4. **DTO/路由/profile 彻底清空**：`defaultBrowserId`/`browserId`/`browserScope` 在整个 `src/` 下 **0 命中**；`src/types/api.ts` 连 `BrowserInstanceBody` 等 6 个响应类型整体删除，`QueueMessageResponseBody.reason` 从 `"not_running" | "browser_changed"` 收窄为 `"not_running"`。
5. **`test/` 命中均为负向断言**：11 处 `doesNotMatch` / `equal(... in ..., false)`，符合报告声称的"非 CDP 语义/负向测试"。
6. **被删文件无相互悬空引用**：删除的 7 个测试文件彼此独立 import，删除安全。

---

## ❌ 发现的问题

### 问题 1（主要 / 必须处理）：`apps/team-console/` 前端未被清理 — API 契约漂移

原报告（`cdp-browser-surface-removal-review.md:48`）扫描命令为 `.pi src README.md docs runtime`，**排除了 `apps/`**，因此漏掉 team-console。这里保留的是**正面（非负向、非注释）的 CDP/browser 语义**，会持续与已移除的服务端契约背离：

**(a) 类型定义仍声明已删除字段**
- `apps/team-console/src/api/team-types.ts:65-66` — `TeamRoleRuntimeContext { browserId: string | null; browserScope: string }`
- `:990` — `AgentSummary.defaultBrowserId?`
- `:1040` — `AgentChatStreamRequest.browserId?`
- `:1055` — `AgentQueueMessageRequest.browserId?`

**(b) 向已删除的服务端字段发请求（死流量 / stale payload）**
- `apps/team-console/src/api/team-api.ts:1235` — `queueAgentMessage` body `...(request.browserId ? { browserId } : {})`
- `team-api.ts:1260` — `streamAgentMessage` body 同上
- 服务端解析器 `src/routes/chat-route-parsers.ts` 已不接收 `browserId`，字段被**静默丢弃**，不报错但永远无效。

**(c) UI 永远显示误导标签（dead branch）**
- `apps/team-console/src/graph/ExecutionMap.tsx:479-484`
```ts
function formatAgentBinding(agent: AgentSummary): string {
  const model = ...;
  const browser = agent.defaultBrowserId ? `browser ${agent.defaultBrowserId}` : "browser default";
  return `${model} · ${browser}`;   // 服务端不再发 defaultBrowserId → 永远显示 "browser default"
}
```

**(d) fixtures 与服务端契约持续漂移**
- `apps/team-console/src/fixtures/team-fixtures.ts:852`（`defaultBrowserId: "default"`）、`:1473-1474,1488-1489`（`browserScope`）
- 测试 fixtures 同样硬编码：`apps/team-console/src/tests/app-live-data-helpers.tsx:98-99,113-114`、`app-run-observer-file-detail.test.tsx:42-43,57-58`

**影响**：不产生编译错误（team-console 独立 `package.json` + 手写类型，各自 `tsc` 通过），但造成 ①死网络流量、②误导性 UI 标签、③测试与服务端契约背离——恰是本次移除要消除的"契约不一致"。

**建议**：本 PR 一并清理 `team-types.ts`（4 处字段）、`team-api.ts:1235,1260`、`ExecutionMap.tsx:479-484` 及相关 fixtures；或在 review 文档中**显式声明 team-console 留待后续并登记为待办**。

---

### 问题 2（应处理）：`test/no-cdp-surface.test.ts` 防回归覆盖盲区

当前实现（`test/no-cdp-surface.test.ts`）只对 **20 个硬编码文件** 检查 **8 个 pattern**，防护力偏弱：

- **未覆盖数据层**：`conn-db.ts`、`conn-sqlite-store.ts`、`conn-store.ts` 不在 `checkedFiles` 中 → 有人把 `browser_id` 列加回 schema，此测试**发现不了**。
- **未覆盖路由层**：`routes/conns.ts`、`chat.ts`、`agent-profiles.ts`、`conn-route-parsers.ts`、`chat-route-parsers.ts` 缺失。
- **未覆盖 profile 层**：`agent-profile.ts`、`agent-profile-catalog.ts`、`agent-template-registry.ts` 缺失。
- **pattern 集偏窄**：仅 `\bCDP\b`、`WEB_ACCESS_CDP`、`CDP_PROXY`、`browser-cleanup`、`closeBrowserTargetsForScope`、`/v1/browsers`、`playground-browser-workbench`、`prepareBrowserBoundBashEnvironment`；**缺** `defaultBrowserId`、`browserScope`、`browser_id`、`validateBrowserId`、`BrowserRegistry`、`browser-binding` 等关键标识符。

**后果**：测试只防"CDP/browser 作为独立模块重新挂回入口"，防不了"在已有路由 handler / DTO 内部悄悄加回 browser 字段"。

**建议**：扩充 `checkedFiles`（加入上述数据层/路由层/profile 层文件）+ 扩充 `forbiddenPatterns`。

---

### 问题 3（非阻塞 / 设计决策）：migration version 8 空洞

- `conn-db.ts:121` 仍执行 `PRAGMA user_version = 11`，migration 分支从 `<7` 直接跳到 `<9`，留下 version 8 空洞。
- 已升级到 user_version=8 的旧库会保留一个 `browser_id` **死列**（不再被任何 SQL 读写），属安全死列。
- review 报告"确认 Conn schema 不再恢复 `browser_id`"这句**不完整**——严格说，新库不再创建该列，但旧库的列不会被清理。

**影响**：无功能问题。原报告已声明"开发中无历史包袱"决策，可接受。如要彻底清理，可在 migration 补 `ALTER TABLE conns DROP COLUMN browser_id`（SQLite ≥3.35）。

---

## Review 报告本身的缺陷

原报告（`cdp-browser-surface-removal-review.md`）存在以下不足：

1. **扫描范围不全**：命令 `.pi src README.md docs runtime` 排除了 `apps/`，导致问题 1 的 team-console 残留未被发现，"核心生产入口 0 命中"结论**对前端失实**。
2. **"Review 重点建议"4 项全部聚焦服务端**（`/v1/browsers`、Agent/Conn/Team 运行配置、Conn schema、防回归测试），未提及 team-console 前端契约。
3. **migration version 8 空洞未记录**，"schema 不再恢复 browser_id"表述不完整。

---

## 修复优先级建议

| 优先级 | 项 | 工作量 |
|---|---|---|
| **P0** | 问题 1：清理 team-console 残留（types/api/UI/fixtures） | 中，需同步改前后端契约 |
| **P1** | 问题 2：加强 `no-cdp-surface.test.ts`（扩文件 + 扩 pattern） | 小 |
| **P2** | 问题 3：补 `DROP COLUMN` migration（可选）| 小 |
| — | 修正 review 报告本身（补 apps/ 扫描说明 + version 8 记录）| 小 |

---

## 补充说明

仓库中的另外两份文档（`2026-06-13-mcp-code-review-report.md` 与 `2026-06-13-mcp-main-review.md`）是**独立的 MCP 功能审查**（针对 `src/routes/agent-mcp.ts` 等 MCP 管理 API），与本次 CDP/browser 移除**无交集**，未纳入本次审核。

注：那份 MCP 审查里仍有 **NEW-P0-1 未修复**（`agents-page.ts:1883` 的 args 正则 `/\\r?\\n/` 双重转义 bug，多行参数无法分割），如需复审 MCP 那条线可另行安排。

本次审核为只读，未对任何源码做修改；仅新增本反馈文档。
