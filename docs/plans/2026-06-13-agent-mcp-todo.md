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

- [x] Add `mcpCatalogPath` to `AgentProfile`.
- [x] Add agent scoped MCP catalog module.
- [x] Add catalog tests for CRUD, normalization, and isolation.
- [x] Add official MCP client dependency.
- [x] Add stdio MCP client manager.
- [x] Add client manager tests for list/call/timeout/cleanup.
- [x] Add `mcp` proxy tool.
- [x] Add proxy tool tests.

## Phase 3: Runtime Integration

- [x] Add enabled MCP servers to `AgentTemplate` and `ResolvedBackgroundAgentSnapshot`.
- [x] Include MCP server config in snapshot signature.
- [x] Inject `mcp` proxy tool into foreground Chat sessions.
- [x] Inject `mcp` proxy tool into Conn background sessions.
- [x] Inject `mcp` proxy tool into Team role sessions.
- [x] Add tests proving different agent profiles receive isolated MCP lists.

## Phase 4: API and UI

- [x] Add scoped MCP API routes under `/v1/agents/:agentId/mcp/servers`.
- [x] Add route tests for CRUD, unknown agent, locks, test connection, and tools list.
- [x] Register routes in `src/server.ts`.
- [x] Add MCP management panel to `/playground/agents`.
- [x] Add UI static tests for MCP panel and API wiring.

## Phase 5: Documentation and Verification

- [x] Document MCP setup in README and Windows native docs.
- [x] Validate local `ugk-qr-scan` server through stdio MCP using the preloaded OCR startup command.
- [x] Validate agent can call `ocr_recognize` through the `mcp` proxy tool path.
- [x] Run targeted MCP tests.
- [x] Run agent/chat/conn/team regression tests.
- [x] Run `npx tsc --noEmit`.
- [x] Run `git diff --check`.
- [x] Confirm no local MCP path is hardcoded in runtime defaults.

## Phase 6: Release

- [x] Commit each implementation phase with focused messages.
- [ ] Push implementation to remote.
- [ ] After user validation, tag stable MCP version.
