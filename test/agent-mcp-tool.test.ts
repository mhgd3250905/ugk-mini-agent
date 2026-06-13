import test from "node:test";
import assert from "node:assert/strict";
import type { AgentMcpCallResult } from "../src/agent/mcp-client-manager.js";
import { createAgentMcpProxyTool } from "../src/agent/mcp-tool.js";
import type { AgentMcpServerConfig, AgentMcpToolSummary } from "../src/agent/mcp-server-catalog.js";

function mcpServer(overrides: Partial<AgentMcpServerConfig> = {}): AgentMcpServerConfig {
	return {
		serverId: "qr-ocr",
		name: "QR OCR",
		description: "本机 OCR MCP server",
		enabled: true,
		transport: {
			type: "stdio",
			command: "python",
			args: ["ocr_mcp_server.py"],
		},
		timeoutMs: 120000,
		createdAt: "2026-06-13T00:00:00.000Z",
		updatedAt: "2026-06-13T00:00:00.000Z",
		...overrides,
	};
}

function textContent(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content.map((item) => item.text ?? "").join("\n");
}

function parseJsonResult(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
	return JSON.parse(textContent(result)) as Record<string, unknown>;
}

test("createAgentMcpProxyTool returns undefined when the agent has no enabled MCP servers", () => {
	assert.equal(createAgentMcpProxyTool({ agentId: "main", servers: [] }), undefined);
	assert.equal(createAgentMcpProxyTool({ agentId: "main", servers: [mcpServer({ enabled: false })] }), undefined);
});

test("agent MCP proxy lists only enabled servers for the selected agent", async () => {
	const tool = createAgentMcpProxyTool({
		agentId: "ocr",
		servers: [
			mcpServer(),
			mcpServer({ serverId: "disabled", name: "Disabled", enabled: false }),
		],
	});
	assert.ok(tool);

	const result = await tool.execute(
		"call-1",
		{ action: "list_servers" },
		undefined,
		undefined,
		{ cwd: process.cwd() } as never,
	);

	assert.deepEqual(parseJsonResult(result), {
		ok: true,
		agentId: "ocr",
		servers: [
			{
				serverId: "qr-ocr",
				name: "QR OCR",
				description: "本机 OCR MCP server",
				transportType: "stdio",
			},
		],
	});
	assert.equal(result.details.action, "list_servers");
});

test("agent MCP proxy lists tools through the selected server", async () => {
	const calls: Array<{ serverId: string }> = [];
	const tools: AgentMcpToolSummary[] = [
		{
			name: "ocr_recognize",
			description: "识别图片二维码",
			inputSchema: { type: "object", properties: { image_path: { type: "string" } } },
		},
	];
	const tool = createAgentMcpProxyTool({
		agentId: "ocr",
		servers: [mcpServer()],
		clientManager: {
			async listTools(server: AgentMcpServerConfig) {
				calls.push({ serverId: server.serverId });
				return tools;
			},
			async callTool(): Promise<AgentMcpCallResult> {
				throw new Error("unexpected call");
			},
		},
	});
	assert.ok(tool);

	const result = await tool.execute(
		"call-2",
		{ action: "list_tools", serverId: "qr-ocr" },
		undefined,
		undefined,
		{ cwd: process.cwd() } as never,
	);

	assert.deepEqual(calls, [{ serverId: "qr-ocr" }]);
	assert.deepEqual(parseJsonResult(result), {
		ok: true,
		agentId: "ocr",
		serverId: "qr-ocr",
		tools,
	});
	assert.equal(result.details.action, "list_tools");
});

test("agent MCP proxy calls a tool without stringifying JSON argument values", async () => {
	const calls: Array<{ serverId: string; toolName: string; args: Record<string, unknown> }> = [];
	const tool = createAgentMcpProxyTool({
		agentId: "ocr",
		servers: [mcpServer()],
		clientManager: {
			async listTools(): Promise<AgentMcpToolSummary[]> {
				throw new Error("unexpected list");
			},
			async callTool(
				server: AgentMcpServerConfig,
				toolName: string,
				args: Record<string, unknown>,
			): Promise<AgentMcpCallResult> {
				calls.push({ serverId: server.serverId, toolName, args });
				return {
					isError: false,
					content: [{ type: "text", text: "decoded text" }],
					text: "decoded text",
				};
			},
		},
	});
	assert.ok(tool);

	const args = {
		image_path: "sample.png",
		retry: 2,
		strict: true,
		options: { languages: ["zh", "en"] },
	};
	const result = await tool.execute(
		"call-3",
		{ action: "call_tool", serverId: "qr-ocr", toolName: "ocr_recognize", arguments: args },
		undefined,
		undefined,
		{ cwd: process.cwd() } as never,
	);

	assert.deepEqual(calls, [{ serverId: "qr-ocr", toolName: "ocr_recognize", args }]);
	assert.deepEqual(parseJsonResult(result), {
		ok: true,
		agentId: "ocr",
		serverId: "qr-ocr",
		toolName: "ocr_recognize",
		result: {
			isError: false,
			content: [{ type: "text", text: "decoded text" }],
			text: "decoded text",
		},
	});
	assert.equal(result.details.action, "call_tool");
});

test("agent MCP proxy rejects unknown or disabled servers", async () => {
	const tool = createAgentMcpProxyTool({
		agentId: "ocr",
		servers: [mcpServer()],
	});
	assert.ok(tool);

	await assert.rejects(
		tool.execute(
			"call-4",
			{ action: "list_tools", serverId: "missing" },
			undefined,
			undefined,
			{ cwd: process.cwd() } as never,
		),
		/MCP server missing is not enabled for agent ocr/,
	);
});
