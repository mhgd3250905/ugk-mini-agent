import test from "node:test";
import assert from "node:assert/strict";
import { renderAgentsPage } from "../src/ui/agents-page.js";

test("Agent management page renders MCP management affordances", () => {
	const page = renderAgentsPage();

	assert.match(page, /MCP/);
	assert.match(page, /mcpByAgentId:\s*\{\}/);
	assert.match(page, /mcpLoadedByAgentId:\s*\{\}/);
	assert.match(page, /\/v1\/agents\//);
	assert.match(page, /\/mcp\/servers/);
	assert.match(page, /新增 MCP/);
	assert.match(page, /查看 MCP/);
	assert.match(page, /测试连接/);
	assert.match(page, /查看工具/);
	assert.match(page, /id="mcp-env"/);
	assert.match(page, /每行一个 KEY=VALUE/);
	assert.match(page, /mcpSaving:\s*false/);
	assert.match(page, /function parseMcpEnv/);
	assert.match(page, /if \(state\.mcpSaving \|\| state\.mcpTestingServerId\) return/);
	assert.match(page, /function renderMcpPanel\(agent\)/);
	assert.match(page, /function handleCreateMcpServer\(\)/);
});

test("Agent management page emits runtime JavaScript that splits MCP args on real newlines", () => {
	const page = renderAgentsPage();

	assert.match(page, /argsText\.split\(\/\\r\?\\n\/\)/);
	assert.doesNotMatch(page, /argsText\.split\(\/\\\\r\?\\\\n\/\)/);
});

test("Agent management page renders HTTP transport affordances for MCP servers", () => {
	const page = renderAgentsPage();

	// Transport type selector with stdio + http options.
	assert.match(page, /id="mcp-transport-type"/);
	assert.match(page, /<option value="stdio"/);
	assert.match(page, /<option value="http"/);
	// HTTP fields container + URL + headers inputs.
	assert.match(page, /id="mcp-http-fields"/);
	assert.match(page, /id="mcp-url"/);
	assert.match(page, /id="mcp-headers"/);
	assert.match(page, /Authorization: Bearer/);
	// Headers parser helper exists in the emitted JS.
	assert.match(page, /function parseMcpHeaders/);
	// Transport switching toggles field visibility.
	assert.match(page, /mcp-transport-type/);
});
