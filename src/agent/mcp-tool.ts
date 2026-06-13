import { defineTool, type ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";
import { AgentMcpClientManager, type AgentMcpCallResult } from "./mcp-client-manager.js";
import type { AgentMcpServerConfig, AgentMcpToolSummary } from "./mcp-server-catalog.js";

const mcpToolParameters = Type.Object({
	action: Type.Union([Type.Literal("list_servers"), Type.Literal("list_tools"), Type.Literal("call_tool")]),
	serverId: Type.Optional(Type.String()),
	toolName: Type.Optional(Type.String()),
	arguments: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

type McpToolParams = Static<typeof mcpToolParameters>;

export interface AgentMcpProxyToolInput {
	agentId: string;
	servers: AgentMcpServerConfig[];
	clientManager?: Pick<AgentMcpClientManager, "listTools" | "callTool">;
}

interface McpToolDetails {
	action: McpToolParams["action"];
	agentId: string;
	serverId?: string;
	toolName?: string;
}

type McpToolDefinition = ToolDefinition<typeof mcpToolParameters, McpToolDetails>;

export function createAgentMcpProxyTool(input: AgentMcpProxyToolInput): McpToolDefinition | undefined {
	const servers = input.servers.filter((server) => server.enabled);
	if (servers.length === 0) {
		return undefined;
	}

	const clientManager = input.clientManager ?? new AgentMcpClientManager();
	const serversById = new Map(servers.map((server) => [server.serverId, server]));

	return defineTool({
		name: "mcp",
		label: "MCP",
		description:
			"Use MCP servers enabled for the current agent profile. Actions: list_servers, list_tools, call_tool.",
		promptSnippet: "mcp: list and call tools from MCP servers enabled for this agent profile.",
		promptGuidelines: [
			"Use mcp list_servers before calling an unfamiliar MCP server.",
			"Use mcp list_tools to inspect a server before calling one of its tools.",
			"Pass MCP tool arguments as native JSON values; do not stringify booleans, numbers, objects, or arrays.",
		],
		parameters: mcpToolParameters,
		async execute(_toolCallId, params, signal) {
			if (params.action === "list_servers") {
				return jsonResult(
					{
						ok: true,
						agentId: input.agentId,
						servers: servers.map(presentServer),
					},
					{ action: params.action, agentId: input.agentId },
				);
			}

			const server = requireServer(input.agentId, serversById, params.serverId);
			if (params.action === "list_tools") {
				const tools = await clientManager.listTools(server, signal);
				return jsonResult(
					{
						ok: true,
						agentId: input.agentId,
						serverId: server.serverId,
						tools,
					},
					{ action: params.action, agentId: input.agentId, serverId: server.serverId },
				);
			}

			const toolName = requireToolName(params.toolName);
			const result = await clientManager.callTool(server, toolName, params.arguments ?? {}, signal);
			return jsonResult(
				{
					ok: true,
					agentId: input.agentId,
					serverId: server.serverId,
					toolName,
					result: presentCallResult(result),
				},
				{ action: params.action, agentId: input.agentId, serverId: server.serverId, toolName },
			);
		},
	});
}

function presentServer(server: AgentMcpServerConfig): {
	serverId: string;
	name: string;
	description?: string;
	transportType: AgentMcpServerConfig["transport"]["type"];
} {
	return {
		serverId: server.serverId,
		name: server.name,
		...(server.description ? { description: server.description } : {}),
		transportType: server.transport.type,
	};
}

function requireServer(
	agentId: string,
	serversById: ReadonlyMap<string, AgentMcpServerConfig>,
	serverId: string | undefined,
): AgentMcpServerConfig {
	if (!serverId?.trim()) {
		throw new Error("MCP serverId is required");
	}
	const server = serversById.get(serverId.trim());
	if (!server) {
		throw new Error(`MCP server ${serverId} is not enabled for agent ${agentId}`);
	}
	return server;
}

function requireToolName(toolName: string | undefined): string {
	const trimmed = toolName?.trim();
	if (!trimmed) {
		throw new Error("MCP toolName is required");
	}
	return trimmed;
}

function presentCallResult(result: AgentMcpCallResult): AgentMcpCallResult {
	return {
		isError: result.isError,
		content: result.content,
		text: result.text,
	};
}

function jsonResult(payload: unknown, details: McpToolDetails) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
		details,
	};
}
