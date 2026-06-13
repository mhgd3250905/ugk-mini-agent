# Agent Scoped MCP Todo

## Phase 0: Stable Baseline

- [x] Push current Windows native route-entry update.
- [x] Tag stable baseline as `stable/windows-native-core-2026-06-13`.

## Phase 1: Design and Planning

- [x] Inspect current agent profile, skill, conn, team, and session factory boundaries.
- [x] Inspect local MCP example at `E:\AII\ugk-qr-scan`.
- [x] Verify local FastMCP can expose `ocr_recognize` through protocol `tools/list`.
- [x] Review official MCP protocol and TypeScript SDK direction.
- [x] Review pi-coding-agent MCP stance and custom tool extension path.
- [x] Choose first-version architecture: single `mcp` proxy tool with agent scoped server catalog.
- [x] Write design spec: `docs/superpowers/specs/2026-06-13-agent-mcp-design.md`.
- [x] Write implementation plan: `docs/superpowers/plans/2026-06-13-agent-mcp.md`.

## Phase 2: Backend Foundation

- [ ] Add `mcpCatalogPath` to `AgentProfile`.
- [ ] Add agent scoped MCP catalog module.
- [ ] Add catalog tests for CRUD, normalization, and isolation.
- [ ] Add official MCP client dependency.
- [ ] Add stdio MCP client manager.
- [ ] Add client manager tests for list/call/timeout/cleanup.
- [ ] Add `mcp` proxy tool.
- [ ] Add proxy tool tests.

## Phase 3: Runtime Integration

- [ ] Add enabled MCP servers to `AgentTemplate` and `ResolvedBackgroundAgentSnapshot`.
- [ ] Include MCP server config in snapshot signature.
- [ ] Inject `mcp` proxy tool into foreground Chat sessions.
- [ ] Inject `mcp` proxy tool into Conn background sessions.
- [ ] Inject `mcp` proxy tool into Team role sessions.
- [ ] Add tests proving different agent profiles receive isolated MCP lists.

## Phase 4: API and UI

- [ ] Add scoped MCP API routes under `/v1/agents/:agentId/mcp/servers`.
- [ ] Add route tests for CRUD, unknown agent, locks, test connection, and tools list.
- [ ] Register routes in `src/server.ts`.
- [ ] Add MCP management panel to `/playground/agents`.
- [ ] Add UI static tests for MCP panel and API wiring.

## Phase 5: Documentation and Verification

- [ ] Document MCP setup in README and Windows native docs.
- [ ] Validate local `ugk-qr-scan` server through Agent 管理台.
- [ ] Validate agent can call `ocr_recognize` through the `mcp` proxy tool.
- [ ] Run targeted MCP tests.
- [ ] Run agent/chat/conn/team regression tests.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `git diff --check`.
- [ ] Confirm no local MCP path is hardcoded in runtime defaults.

## Phase 6: Release

- [ ] Commit each implementation phase with focused messages.
- [ ] Push implementation to remote.
- [ ] After user validation, tag stable MCP version.
