import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AgentService } from "../agent/agent-service.js";
import type { AgentServiceRegistry } from "../agent/agent-service-registry.js";
import { AgentMcpClientManager } from "../agent/mcp-client-manager.js";
import {
	createAgentMcpServer,
	deleteAgentMcpServer,
	AgentMcpCatalogError,
	listAgentMcpServers,
	updateAgentMcpServer,
	type AgentMcpServerConfig,
	type CreateAgentMcpServerInput,
	type UpdateAgentMcpServerInput,
} from "../agent/mcp-server-catalog.js";
import { getAppConfig } from "../config.js";
import { getActiveTeamProfileLocks } from "../team/config-locks.js";
import { resolveScopedAgentServiceOrSend, sendUnknownAgent } from "./agent-route-utils.js";
import { sendBadRequest, sendConflict, sendForbidden, sendInternalError, sendNotImplemented, sendNotFound } from "./http-errors.js";

export interface AgentMcpRouteDependencies {
	projectRoot?: string;
	agentServiceRegistry?: AgentServiceRegistry<AgentService>;
	agentTemplateRegistry?: { invalidate(profileId?: string): void };
	clientManager?: Pick<AgentMcpClientManager, "testServer" | "listTools" | "callTool"> & { close?: () => Promise<void> };
	teamProfileLockProvider?: () => Promise<Set<string>>;
}

interface AgentMcpRouteParams {
	agentId?: string;
	serverId?: string;
}

export function registerAgentMcpRoutes(app: FastifyInstance, deps: AgentMcpRouteDependencies): void {
	const clientManager = deps.clientManager ?? new AgentMcpClientManager();
	app.addHook("onClose", async () => {
		await clientManager.close?.();
	});

	app.get(
		"/v1/agents/:agentId/mcp/servers",
		async (
			request: FastifyRequest<{ Params: AgentMcpRouteParams }>,
			reply,
		): Promise<{ agentId: string; servers: AgentMcpServerConfig[] } | FastifyReply> => {
			if (!resolveLocalRequest(reply, request)) {
				return reply;
			}
			const context = resolveReadContext(deps, reply, request.params.agentId);
			if (!context) {
				return reply;
			}
			try {
				return await listAgentMcpServers(context.projectRoot, context.agentId);
			} catch (error) {
				return sendRouteError(reply, error);
			}
		},
	);

	app.post(
		"/v1/agents/:agentId/mcp/servers",
		async (
			request: FastifyRequest<{ Params: AgentMcpRouteParams; Body: CreateAgentMcpServerInput }>,
			reply,
		): Promise<{ server: AgentMcpServerConfig } | FastifyReply> => {
			if (!resolveLocalRequest(reply, request)) {
				return reply;
			}
			const context = await resolveWriteContext(deps, reply, request.params.agentId);
			if (!context) {
				return reply;
			}
			try {
				const server = await createAgentMcpServer(context.projectRoot, context.agentId, request.body ?? {});
				deps.agentTemplateRegistry?.invalidate(context.agentId);
				return { server };
			} catch (error) {
				return sendRouteError(reply, error);
			}
		},
	);

	app.patch(
		"/v1/agents/:agentId/mcp/servers/:serverId",
		async (
			request: FastifyRequest<{ Params: AgentMcpRouteParams; Body: UpdateAgentMcpServerInput }>,
			reply,
		): Promise<{ server: AgentMcpServerConfig } | FastifyReply> => {
			if (!resolveLocalRequest(reply, request)) {
				return reply;
			}
			const context = await resolveWriteContext(deps, reply, request.params.agentId);
			if (!context) {
				return reply;
			}
			try {
				const server = await updateAgentMcpServer(
					context.projectRoot,
					context.agentId,
					request.params.serverId ?? "",
					request.body ?? {},
				);
				deps.agentTemplateRegistry?.invalidate(context.agentId);
				return { server };
			} catch (error) {
				return sendRouteError(reply, error);
			}
		},
	);

	app.delete(
		"/v1/agents/:agentId/mcp/servers/:serverId",
		async (
			request: FastifyRequest<{ Params: AgentMcpRouteParams }>,
			reply,
		): Promise<{ deleted: true; agentId: string; serverId: string } | FastifyReply> => {
			if (!resolveLocalRequest(reply, request)) {
				return reply;
			}
			const context = await resolveWriteContext(deps, reply, request.params.agentId);
			if (!context) {
				return reply;
			}
			try {
				const result = await deleteAgentMcpServer(context.projectRoot, context.agentId, request.params.serverId ?? "");
				deps.agentTemplateRegistry?.invalidate(context.agentId);
				return result;
			} catch (error) {
				return sendRouteError(reply, error);
			}
		},
	);

	app.post(
		"/v1/agents/:agentId/mcp/servers/:serverId/test",
		async (
			request: FastifyRequest<{ Params: AgentMcpRouteParams }>,
			reply,
		): Promise<{ result: Awaited<ReturnType<AgentMcpClientManager["testServer"]>> } | FastifyReply> => {
			if (!resolveLocalRequest(reply, request)) {
				return reply;
			}
			const context = await resolveWriteContext(deps, reply, request.params.agentId);
			if (!context) {
				return reply;
			}
			try {
				const server = await findAgentMcpServer(context.projectRoot, context.agentId, request.params.serverId);
				const result = await clientManager.testServer(server, undefined);
				const safeError = result.error ? redactSensitiveMessage(result.error) : undefined;
				await updateAgentMcpServer(context.projectRoot, context.agentId, server.serverId, {
					lastTestedAt: new Date().toISOString(),
					lastError: result.ok ? undefined : safeError,
					cachedTools: result.tools,
				});
				return { result: { ...result, ...(safeError ? { error: safeError } : {}) } };
			} catch (error) {
				return sendRouteError(reply, error);
			}
		},
	);

	app.get(
		"/v1/agents/:agentId/mcp/servers/:serverId/tools",
		async (
			request: FastifyRequest<{ Params: AgentMcpRouteParams }>,
			reply,
		): Promise<{ agentId: string; serverId: string; tools: unknown[]; source: "cache" | "live" } | FastifyReply> => {
			if (!resolveLocalRequest(reply, request)) {
				return reply;
			}
			const context = resolveReadContext(deps, reply, request.params.agentId);
			if (!context) {
				return reply;
			}
			try {
				const server = await findAgentMcpServer(context.projectRoot, context.agentId, request.params.serverId);
				if (server.cachedTools?.length) {
					return { agentId: context.agentId, serverId: server.serverId, tools: server.cachedTools, source: "cache" };
				}
				const writeContext = await resolveWriteContext(deps, reply, request.params.agentId);
				if (!writeContext) {
					return reply;
				}
				const liveServer = await findAgentMcpServer(writeContext.projectRoot, writeContext.agentId, request.params.serverId);
				const tools = await clientManager.listTools(liveServer, undefined);
				await updateAgentMcpServer(writeContext.projectRoot, writeContext.agentId, liveServer.serverId, {
					lastTestedAt: new Date().toISOString(),
					lastError: undefined,
					cachedTools: tools,
				});
				return { agentId: writeContext.agentId, serverId: liveServer.serverId, tools, source: "live" };
			} catch (error) {
				return sendRouteError(reply, error);
			}
		},
	);
}

function resolveLocalRequest(reply: FastifyReply, request: FastifyRequest): true | undefined {
	const address = request.ip || request.socket.remoteAddress || "";
	if (isLocalAddress(address)) {
		return true;
	}
	sendForbidden(reply, "MCP management is available to local requests only.");
	return undefined;
}

function isLocalAddress(address: string): boolean {
	const normalized = address.trim().toLowerCase();
	return normalized === "127.0.0.1"
		|| normalized === "::1"
		|| normalized === "::ffff:127.0.0.1"
		|| normalized === "localhost";
}

function resolveReadContext(
	deps: AgentMcpRouteDependencies,
	reply: FastifyReply,
	agentId: string | undefined,
): { projectRoot: string; agentId: string } | undefined {
	if (!deps.projectRoot || !agentId) {
		sendUnknownAgent(reply, agentId);
		return undefined;
	}
	if (deps.agentServiceRegistry && !deps.agentServiceRegistry.getProfile(agentId)) {
		sendUnknownAgent(reply, agentId);
		return undefined;
	}
	return { projectRoot: deps.projectRoot, agentId };
}

async function resolveWriteContext(
	deps: AgentMcpRouteDependencies,
	reply: FastifyReply,
	agentId: string | undefined,
): Promise<{ projectRoot: string; agentId: string } | undefined> {
	const context = resolveReadContext(deps, reply, agentId);
	if (!context) {
		return undefined;
	}
	const lockedProfileIds = deps.teamProfileLockProvider
		? await deps.teamProfileLockProvider()
		: await getActiveTeamProfileLocks(getAppConfig(context.projectRoot).teamDataDir);
	if (lockedProfileIds.has(context.agentId)) {
		sendConflict(reply, `Agent ${context.agentId} is locked by an active Team run.`);
		return undefined;
	}
	const service = resolveScopedAgentServiceOrSend(deps.agentServiceRegistry, reply, context.agentId);
	if (!service) {
		return undefined;
	}
	const catalog = await service.getConversationCatalog();
	if (catalog.conversations.some((conversation) => conversation.running)) {
		sendConflict(reply, `Agent ${context.agentId} has a running conversation. Stop it before changing MCP servers.`);
		return undefined;
	}
	return context;
}

async function findAgentMcpServer(
	projectRoot: string,
	agentId: string,
	serverId: string | undefined,
): Promise<AgentMcpServerConfig> {
	const { servers } = await listAgentMcpServers(projectRoot, agentId);
	const server = servers.find((entry) => entry.serverId === serverId);
	if (!server) {
		throw new AgentMcpCatalogError("not_found", `MCP server ${serverId ?? ""} does not exist`);
	}
	return server;
}

function sendRouteError(reply: FastifyReply, error: unknown): FastifyReply {
	const rawMessage = error instanceof Error ? error.message : String(error);
	// MCP transports may carry Bearer tokens in headers; never echo those back.
	const message = redactSensitiveMessage(rawMessage);
	if (error instanceof AgentMcpCatalogError) {
		if (error.kind === "conflict") {
			return sendConflict(reply, message);
		}
		if (error.kind === "not_found") {
			return sendNotFound(reply, message);
		}
		return sendBadRequest(reply, message);
	}
	if (/Unknown agentId:/.test(message)) {
		return sendNotFound(reply, message);
	}
	if (/does not exist/.test(message)) {
		return sendNotFound(reply, message);
	}
	if (/not available/.test(message)) {
		return sendNotImplemented(reply, message);
	}
	return sendInternalError(reply, error);
}

/**
 * Strip anything that looks like a credential from a message before it is sent
 * to the API/UI. Catalog and client-manager errors should already avoid echoing
 * headers, but this is a defensive last-mile filter for any path that forwards
 * raw error messages (4xx bodies).
 */
function redactSensitiveMessage(message: string): string {
	return message
		.replace(/(bearer|basic|token|apikey|api-key|authorization)\s*[:=]?\s*[^\s,;"]+/gi, "$1 [redacted]")
		.replace(/\b[A-Za-z0-9+/=_-]{32,}\b/g, "[redacted]");
}
