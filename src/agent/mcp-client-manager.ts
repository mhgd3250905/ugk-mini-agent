import {
	Client,
	StdioClientTransport,
	StreamableHTTPClientTransport,
	getDefaultEnvironment,
	type CallToolResult,
	type RequestOptions,
	SdkError,
	SdkErrorCode,
	type StdioServerParameters,
	type Tool,
	type Transport,
} from "@modelcontextprotocol/client";
import { redactMcpSensitiveMessage } from "./mcp-redaction.js";
import type { AgentMcpServerConfig, AgentMcpToolSummary } from "./mcp-server-catalog.js";

export interface AgentMcpServerTestResult {
	ok: boolean;
	serverId: string;
	tools: AgentMcpToolSummary[];
	error?: string;
}

export interface AgentMcpCallResult {
	isError: boolean;
	content: unknown[];
	text: string;
}

interface ConnectedMcpClient {
	client: Client;
	transport: Transport;
}

export class AgentMcpClientManager {
	private readonly activeTransports = new Set<Transport>();

	async testServer(server: AgentMcpServerConfig, signal?: AbortSignal): Promise<AgentMcpServerTestResult> {
		try {
			const tools = await this.listTools(server, signal);
			return { ok: true, serverId: server.serverId, tools };
		} catch (error) {
			return {
				ok: false,
				serverId: server.serverId,
				tools: [],
				error: redactTransportError(server, error).message,
			};
		}
	}

	async listTools(server: AgentMcpServerConfig, signal?: AbortSignal): Promise<AgentMcpToolSummary[]> {
		return await this.withClient(server, async ({ client }) => {
			const result = await withTimeout(
				server,
				client.listTools(undefined, buildRequestOptions(server, signal)),
				signal,
			);
			return result.tools.map(presentTool);
		}, signal);
	}

	async callTool(
		server: AgentMcpServerConfig,
		toolName: string,
		args: Record<string, unknown>,
		signal?: AbortSignal,
	): Promise<AgentMcpCallResult> {
		return await this.withClient(server, async ({ client }) => {
			const result = await withTimeout(
				server,
				client.callTool({ name: toolName, arguments: args }, buildRequestOptions(server, signal)),
				signal,
			);
			return presentCallToolResult(result);
		}, signal);
	}

	async close(): Promise<void> {
		const transports = Array.from(this.activeTransports);
		this.activeTransports.clear();
		await Promise.all(transports.map((transport) => closeTransport(transport)));
	}

	private async withClient<T>(
		server: AgentMcpServerConfig,
		operation: (connected: ConnectedMcpClient) => Promise<T>,
		signal?: AbortSignal,
	): Promise<T> {
		const connected = await this.connect(server, signal);
		try {
			return await operation(connected);
		} catch (error) {
			throw redactTransportError(server, error);
		} finally {
			this.activeTransports.delete(connected.transport);
			await closeTransport(connected.transport);
		}
	}

	private async connect(server: AgentMcpServerConfig, signal?: AbortSignal): Promise<ConnectedMcpClient> {
		const client = new Client({ name: "ugk-mini-agent", version: "1.0.0" });
		const transport = createTransportForServer(server);
		this.activeTransports.add(transport);
		try {
			await withTimeout(server, client.connect(transport, buildRequestOptions(server, signal)), signal);
			return { client, transport };
		} catch (error) {
			this.activeTransports.delete(transport);
			await closeTransport(transport);
			throw redactTransportError(server, error);
		}
	}
}

function createTransportForServer(server: AgentMcpServerConfig): Transport {
	if (server.transport.type === "stdio") {
		return new StdioClientTransport(buildStdioServerParameters(server));
	}
	if (server.transport.type === "http") {
		const headers = server.transport.headers ?? {};
		return new StreamableHTTPClientTransport(new URL(server.transport.url), {
			requestInit: { headers },
		});
	}
	// Defensive: catalog validation should prevent reaching here.
	throw new Error(`Unsupported MCP transport for server ${server.serverId}`);
}

function buildStdioServerParameters(server: AgentMcpServerConfig): StdioServerParameters {
	const transport = server.transport;
	if (transport.type !== "stdio") {
		// Unreachable: caller guards on transport.type.
		throw new Error(`Expected stdio transport for server ${server.serverId}`);
	}
	return {
		command: transport.command,
		args: transport.args,
		...(transport.cwd ? { cwd: transport.cwd } : {}),
		env: {
			...getDefaultEnvironment(),
			...(transport.env ?? {}),
		},
		stderr: "pipe",
	};
}

function buildRequestOptions(server: AgentMcpServerConfig, signal?: AbortSignal): RequestOptions {
	return {
		timeout: server.timeoutMs,
		maxTotalTimeout: server.timeoutMs,
		...(signal ? { signal } : {}),
	};
}

/**
 * Sanitize errors before they reach the API/UI. HTTP MCP servers may carry
 * Bearer tokens or other secrets in their `headers`; transport-level fetch
 * errors can echo request headers back. Replace anything that looks like a
 * credential in the message with `[redacted]`, and never include header values.
 */
function redactTransportError(server: AgentMcpServerConfig, error: unknown): Error {
	const rawMessage = error instanceof Error ? error.message : String(error);
	const redacted = redactMcpSensitiveMessage(rawMessage);
	// Avoid stacking the "MCP server <id>:" prefix if this error was already
	// sanitized by an outer redactTransportError call.
	const prefix = `MCP server ${server.serverId}: `;
	if (redacted.startsWith(prefix)) {
		return new Error(redacted);
	}
	return new Error(prefix + redacted);
}

async function withTimeout<T>(
	server: AgentMcpServerConfig,
	promise: Promise<T>,
	signal?: AbortSignal,
): Promise<T> {
	if (signal?.aborted) {
		throw abortReason(signal);
	}
	let timeout: NodeJS.Timeout | undefined;
	let abortListener: (() => void) | undefined;
	const timeoutPromise = new Promise<never>((_resolve, reject) => {
		timeout = setTimeout(() => {
			reject(new Error(`MCP server ${server.serverId} timed out after ${server.timeoutMs}ms`));
		}, server.timeoutMs);
	});
	const abortPromise = signal
		? new Promise<never>((_resolve, reject) => {
				const onAbort = () => reject(abortReason(signal));
				signal.addEventListener("abort", onAbort, { once: true });
				abortListener = () => signal.removeEventListener("abort", onAbort);
			})
		: undefined;
	try {
		return await Promise.race(abortPromise ? [promise, timeoutPromise, abortPromise] : [promise, timeoutPromise]);
	} catch (error) {
		if (error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout) {
			throw new Error(`MCP server ${server.serverId} timed out after ${server.timeoutMs}ms`);
		}
		throw error;
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
		abortListener?.();
	}
}

function abortReason(signal: AbortSignal): Error {
	return signal.reason instanceof Error
		? signal.reason
		: new Error(typeof signal.reason === "string" ? signal.reason : "MCP operation aborted");
}

async function closeTransport(transport: Transport): Promise<void> {
	try {
		await transport.close();
	} catch {
		// Closing is best-effort; callers should see the original operation error.
	}
}

function presentTool(tool: Tool): AgentMcpToolSummary {
	return {
		name: tool.name,
		...(tool.description ? { description: tool.description } : {}),
		...(tool.inputSchema && typeof tool.inputSchema === "object" ? { inputSchema: tool.inputSchema as Record<string, unknown> } : {}),
	};
}

function presentCallToolResult(result: CallToolResult): AgentMcpCallResult {
	const content = Array.isArray(result.content) ? result.content : [];
	const text = content
		.map((item) => {
			if (item && typeof item === "object" && (item as { type?: unknown }).type === "text") {
				return String((item as { text?: unknown }).text ?? "");
			}
			return "";
		})
		.filter(Boolean)
		.join("\n");
	return {
		isError: result.isError === true,
		content,
		text,
	};
}
