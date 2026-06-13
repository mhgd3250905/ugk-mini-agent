import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { renameWithTransientRetry } from "../file-system.js";
import { resolveAgentProfile } from "./agent-profile.js";
import { loadAgentProfilesSync } from "./agent-profile-catalog.js";

export interface AgentMcpStdioTransport {
	type: "stdio";
	command: string;
	args: string[];
	cwd?: string;
	env?: Record<string, string>;
}

export interface AgentMcpToolSummary {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
}

export interface AgentMcpServerConfig {
	serverId: string;
	name: string;
	description?: string;
	enabled: boolean;
	transport: AgentMcpStdioTransport;
	timeoutMs: number;
	createdAt: string;
	updatedAt: string;
	lastTestedAt?: string;
	lastError?: string;
	cachedTools?: AgentMcpToolSummary[];
}

export interface CreateAgentMcpServerInput {
	serverId?: unknown;
	name?: unknown;
	description?: unknown;
	enabled?: unknown;
	transport?: unknown;
	timeoutMs?: unknown;
}

export interface UpdateAgentMcpServerInput {
	name?: unknown;
	description?: unknown;
	enabled?: unknown;
	transport?: unknown;
	timeoutMs?: unknown;
	lastTestedAt?: unknown;
	lastError?: unknown;
	cachedTools?: unknown;
}

interface StoredAgentMcpServers {
	schemaVersion?: string;
	servers?: unknown;
}

const MCP_CATALOG_SCHEMA_VERSION = "agent/mcp-servers-1";
const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 600_000;

export type AgentMcpCatalogErrorKind = "conflict" | "not_found" | "validation";

export class AgentMcpCatalogError extends Error {
	constructor(
		readonly kind: AgentMcpCatalogErrorKind,
		message: string,
	) {
		super(message);
		this.name = "AgentMcpCatalogError";
	}
}

export async function listAgentMcpServers(
	projectRoot: string,
	agentId: string,
): Promise<{ agentId: string; servers: AgentMcpServerConfig[] }> {
	const catalogPath = resolveAgentMcpCatalogPath(projectRoot, agentId);
	const servers = await readAgentMcpServers(catalogPath);
	return { agentId, servers };
}

export async function listEnabledAgentMcpServers(
	projectRoot: string,
	agentId: string,
): Promise<AgentMcpServerConfig[]> {
	const { servers } = await listAgentMcpServers(projectRoot, agentId);
	return servers.filter((server) => server.enabled);
}

export async function createAgentMcpServer(
	projectRoot: string,
	agentId: string,
	input: CreateAgentMcpServerInput,
	now: Date = new Date(),
): Promise<AgentMcpServerConfig> {
	const catalogPath = resolveAgentMcpCatalogPath(projectRoot, agentId);
	const current = await readAgentMcpServers(catalogPath);
	const created = normalizeCreateInput(input, now);
	if (current.some((server) => server.serverId === created.serverId)) {
		throw new AgentMcpCatalogError("conflict", `MCP server ${created.serverId} already exists`);
	}
	await writeAgentMcpServers(catalogPath, [...current, created]);
	return created;
}

export async function updateAgentMcpServer(
	projectRoot: string,
	agentId: string,
	serverId: string,
	input: UpdateAgentMcpServerInput,
	now: Date = new Date(),
): Promise<AgentMcpServerConfig> {
	const normalizedServerId = normalizeServerId(serverId);
	const catalogPath = resolveAgentMcpCatalogPath(projectRoot, agentId);
	const current = await readAgentMcpServers(catalogPath);
	const index = current.findIndex((server) => server.serverId === normalizedServerId);
	if (index < 0) {
		throw new AgentMcpCatalogError("not_found", `MCP server ${normalizedServerId} does not exist`);
	}
	const updated = normalizeUpdateInput(current[index]!, input, now);
	const next = [...current];
	next[index] = updated;
	await writeAgentMcpServers(catalogPath, next);
	return updated;
}

export async function deleteAgentMcpServer(
	projectRoot: string,
	agentId: string,
	serverId: string,
): Promise<{ deleted: true; agentId: string; serverId: string }> {
	const normalizedServerId = normalizeServerId(serverId);
	const catalogPath = resolveAgentMcpCatalogPath(projectRoot, agentId);
	const current = await readAgentMcpServers(catalogPath);
	if (!current.some((server) => server.serverId === normalizedServerId)) {
		throw new AgentMcpCatalogError("not_found", `MCP server ${normalizedServerId} does not exist`);
	}
	await writeAgentMcpServers(catalogPath, current.filter((server) => server.serverId !== normalizedServerId));
	return { deleted: true, agentId, serverId: normalizedServerId };
}

function resolveAgentMcpCatalogPath(projectRoot: string, agentId: string): string {
	const profile = resolveAgentProfile(loadAgentProfilesSync(projectRoot), agentId);
	if (!profile) {
		throw new AgentMcpCatalogError("not_found", `Unknown agentId: ${agentId}`);
	}
	return profile.mcpCatalogPath;
}

async function readAgentMcpServers(catalogPath: string): Promise<AgentMcpServerConfig[]> {
	try {
		const parsed = JSON.parse(await readFile(catalogPath, "utf8")) as StoredAgentMcpServers;
		const rawServers = Array.isArray(parsed.servers) ? parsed.servers : [];
		return rawServers.map(normalizeStoredServer).sort(compareServerId);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

async function writeAgentMcpServers(catalogPath: string, servers: AgentMcpServerConfig[]): Promise<void> {
	const catalogDir = dirname(catalogPath);
	const tempPath = join(catalogDir, `.${basename(catalogPath)}.${process.pid}.${process.hrtime.bigint()}.tmp`);
	await mkdir(catalogDir, { recursive: true });
	try {
		await writeFile(
			tempPath,
			JSON.stringify({ schemaVersion: MCP_CATALOG_SCHEMA_VERSION, servers: servers.sort(compareServerId) }, null, 2) + "\n",
			"utf8",
		);
		await renameWithTransientRetry(tempPath, catalogPath);
	} catch (error) {
		if (existsSync(tempPath)) {
			await unlink(tempPath).catch(() => undefined);
		}
		throw error;
	}
}

function compareServerId(a: AgentMcpServerConfig, b: AgentMcpServerConfig): number {
	return a.serverId.localeCompare(b.serverId);
}

function normalizeStoredServer(value: unknown): AgentMcpServerConfig {
	const raw = value as Record<string, unknown>;
	const createdAt = normalizeOptionalString(raw.createdAt) || new Date(0).toISOString();
	const updatedAt = normalizeOptionalString(raw.updatedAt) || createdAt;
	return {
		serverId: normalizeServerId(raw.serverId),
		name: normalizeName(raw.name),
		...(normalizeOptionalString(raw.description) ? { description: normalizeOptionalString(raw.description) } : {}),
		enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
		transport: normalizeStdioTransport(raw.transport),
		timeoutMs: normalizeTimeoutMs(raw.timeoutMs),
		createdAt,
		updatedAt,
		...(normalizeOptionalString(raw.lastTestedAt) ? { lastTestedAt: normalizeOptionalString(raw.lastTestedAt) } : {}),
		...(normalizeOptionalString(raw.lastError) ? { lastError: normalizeOptionalString(raw.lastError) } : {}),
		...(Array.isArray(raw.cachedTools) ? { cachedTools: normalizeCachedTools(raw.cachedTools) } : {}),
	};
}

function normalizeCreateInput(input: CreateAgentMcpServerInput, now: Date): AgentMcpServerConfig {
	const timestamp = now.toISOString();
	const description = normalizeOptionalString(input.description);
	return {
		serverId: normalizeServerId(input.serverId),
		name: normalizeName(input.name),
		...(description ? { description } : {}),
		enabled: typeof input.enabled === "boolean" ? input.enabled : true,
		transport: normalizeStdioTransport(input.transport),
		timeoutMs: normalizeTimeoutMs(input.timeoutMs),
		createdAt: timestamp,
		updatedAt: timestamp,
	};
}

function normalizeUpdateInput(
	current: AgentMcpServerConfig,
	input: UpdateAgentMcpServerInput,
	now: Date,
): AgentMcpServerConfig {
	const description = Object.hasOwn(input, "description")
		? normalizeOptionalString(input.description)
		: current.description;
	const lastTestedAt = Object.hasOwn(input, "lastTestedAt")
		? normalizeOptionalString(input.lastTestedAt)
		: current.lastTestedAt;
	const lastError = Object.hasOwn(input, "lastError")
		? normalizeOptionalString(input.lastError)
		: current.lastError;
	const cachedTools = Object.hasOwn(input, "cachedTools")
		? normalizeCachedTools(input.cachedTools)
		: current.cachedTools;
	return {
		...current,
		...(Object.hasOwn(input, "name") ? { name: normalizeName(input.name) } : {}),
		...(description ? { description } : {}),
		...(!description ? { description: undefined } : {}),
		...(Object.hasOwn(input, "enabled") ? { enabled: normalizeEnabled(input.enabled) } : {}),
		...(Object.hasOwn(input, "transport") ? { transport: normalizeStdioTransport(input.transport) } : {}),
		...(Object.hasOwn(input, "timeoutMs") ? { timeoutMs: normalizeTimeoutMs(input.timeoutMs) } : {}),
		updatedAt: now.toISOString(),
		...(lastTestedAt ? { lastTestedAt } : {}),
		...(lastError ? { lastError } : {}),
		...(cachedTools ? { cachedTools } : {}),
	};
}

function normalizeServerId(value: unknown): string {
	const normalized = String(value || "").trim();
	if (!/^[a-z][a-z0-9-]{0,62}$/.test(normalized)) {
		throw new AgentMcpCatalogError("validation", "serverId must start with a lowercase letter and contain only lowercase letters, digits, or hyphens");
	}
	return normalized;
}

function normalizeName(value: unknown): string {
	const normalized = String(value || "").trim();
	if (!normalized) {
		throw new AgentMcpCatalogError("validation", "name is required");
	}
	if (normalized.length > 80) {
		throw new AgentMcpCatalogError("validation", "name must be 80 characters or less");
	}
	return normalized;
}

function normalizeOptionalString(value: unknown): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	const normalized = String(value).trim();
	return normalized || undefined;
}

function normalizeEnabled(value: unknown): boolean {
	if (typeof value !== "boolean") {
		throw new AgentMcpCatalogError("validation", "enabled must be a boolean");
	}
	return value;
}

function normalizeTimeoutMs(value: unknown): number {
	const timeout = value === undefined || value === null || value === ""
		? DEFAULT_TIMEOUT_MS
		: Number(value);
	if (!Number.isInteger(timeout) || timeout < MIN_TIMEOUT_MS || timeout > MAX_TIMEOUT_MS) {
		throw new AgentMcpCatalogError("validation", "timeoutMs must be between 1000 and 600000");
	}
	return timeout;
}

function normalizeStdioTransport(value: unknown): AgentMcpStdioTransport {
	if (!value || typeof value !== "object") {
		throw new AgentMcpCatalogError("validation", "transport is required");
	}
	const raw = value as Record<string, unknown>;
	if (raw.type !== "stdio") {
		throw new AgentMcpCatalogError("validation", "transport.type must be stdio");
	}
	const command = String(raw.command || "").trim();
	if (!command) {
		throw new AgentMcpCatalogError("validation", "transport.command is required");
	}
	const args = Array.isArray(raw.args) ? raw.args.map((arg) => String(arg)) : [];
	const cwd = normalizeOptionalString(raw.cwd);
	if (cwd && !isAbsolute(cwd)) {
		throw new AgentMcpCatalogError("validation", "transport.cwd must be an absolute path");
	}
	const env = normalizeEnv(raw.env);
	return {
		type: "stdio",
		command,
		args,
		...(cwd ? { cwd } : {}),
		...(env ? { env } : {}),
	};
}

function normalizeEnv(value: unknown): Record<string, string> | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (typeof value !== "object" || Array.isArray(value)) {
		throw new AgentMcpCatalogError("validation", "transport.env must be an object");
	}
	const env: Record<string, string> = {};
	for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
		const name = key.trim();
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
			throw new AgentMcpCatalogError("validation", `invalid env name: ${key}`);
		}
		env[name] = String(rawValue ?? "");
	}
	return Object.keys(env).length > 0 ? env : undefined;
}

function normalizeCachedTools(value: unknown): AgentMcpToolSummary[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const tools = value
		.map((entry) => {
			if (!entry || typeof entry !== "object") {
				return undefined;
			}
			const raw = entry as Record<string, unknown>;
			const name = normalizeOptionalString(raw.name);
			if (!name) {
				return undefined;
			}
			const description = normalizeOptionalString(raw.description);
			return {
				name,
				...(description ? { description } : {}),
				...(raw.inputSchema && typeof raw.inputSchema === "object" && !Array.isArray(raw.inputSchema)
					? { inputSchema: raw.inputSchema as Record<string, unknown> }
					: {}),
			};
		})
		.filter((entry): entry is AgentMcpToolSummary => Boolean(entry));
	return tools.length > 0 ? tools : undefined;
}
