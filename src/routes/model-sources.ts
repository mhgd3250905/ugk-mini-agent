import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AgentService } from "../agent/agent-service.js";
import { DEFAULT_AGENT_ID } from "../agent/agent-profile.js";
import { updateStoredAgentProfile } from "../agent/agent-profile-catalog.js";
import type { AgentServiceRegistry, AgentSummary } from "../agent/agent-service-registry.js";
import type { AgentTemplateRegistry } from "../agent/agent-template-registry.js";
import type { ConnDefinition } from "../agent/conn-store.js";
import {
	saveDefaultModelConfig,
	type ModelConfigModelBody,
	type ModelConfigProviderBody,
	type ModelConfigSelection,
	type ModelConfigStore,
	type ModelSelectionValidator,
} from "../agent/model-config.js";
import {
	createFileModelProviderStore,
	type CustomModelProviderInput,
	type ModelProviderStore,
} from "../agent/model-provider-store.js";
import { sendBadRequest, sendConflict, sendInternalError, sendNotFound, sendNotImplemented } from "./http-errors.js";

type ModelSourceUsageKind = "global" | "agent" | "conn";

interface ModelSourceProviderBody extends ModelConfigProviderBody {
	source: "bundled" | "custom";
}

interface ModelSourceUsageBody {
	kind: ModelSourceUsageKind;
	id: string;
	label: string;
	provider: string;
	model: string;
	inherited: boolean;
	inheritedFrom?: "global_default" | "background_profile";
	editable: boolean;
	status?: "active" | "paused" | "completed";
	error?: string;
}

interface ModelSourcesResponseBody {
	current: ModelConfigSelection;
	providers: ModelSourceProviderBody[];
	usages: ModelSourceUsageBody[];
}

interface ConnStoreLike {
	list(): Promise<ConnDefinition[]>;
	get(connId: string): Promise<ConnDefinition | undefined>;
	update(connId: string, patch: Partial<Pick<ConnDefinition, "modelProvider" | "modelId">>): Promise<ConnDefinition | undefined>;
}

export interface ModelSourceRouteOptions {
	projectRoot: string;
	modelConfigStore: ModelConfigStore;
	modelSelectionValidator: ModelSelectionValidator;
	modelProviderStore?: ModelProviderStore;
	agentServiceRegistry?: AgentServiceRegistry<AgentService>;
	agentTemplateRegistry?: AgentTemplateRegistry;
	connStore?: ConnStoreLike;
}

interface AgentConversationCatalogLike {
	conversations?: Array<{ running?: boolean }>;
}

export function registerModelSourceRoutes(app: FastifyInstance, options: ModelSourceRouteOptions): void {
	const modelProviderStore = options.modelProviderStore ?? createFileModelProviderStore(options.projectRoot);

	app.get("/v1/model-sources", async (_request, reply): Promise<ModelSourcesResponseBody | FastifyReply> => {
		try {
			const [config, customProviders, conns] = await Promise.all([
				options.modelConfigStore.getConfig(),
				modelProviderStore.listCustomProviders(),
				options.connStore?.list() ?? Promise.resolve([]),
			]);
			const customProviderIds = new Set(Object.keys(customProviders));
			return {
				current: config.current,
				providers: config.providers.map((provider) => ({
					...provider,
					source: customProviderIds.has(provider.id) ? "custom" : "bundled",
				})),
				usages: [
					presentGlobalUsage(config.current),
					...presentAgentUsages(options.agentServiceRegistry?.list() ?? [], config.current),
					...(await presentConnUsages(conns, config.current, options.agentTemplateRegistry)),
				],
			};
		} catch (error) {
			return sendInternalError(reply, error);
		}
	});

	app.post(
		"/v1/model-sources/providers",
		async (
			request: FastifyRequest<{ Body: Record<string, unknown> }>,
			reply,
		): Promise<{ provider: { id: string } & Omit<ModelSourceProviderBody, "source" | "auth"> } | FastifyReply> => {
			const parsed = parseProviderInput(request.body ?? {});
			if (parsed.error) {
				return sendBadRequest(reply, parsed.error);
			}
			try {
				const provider = await modelProviderStore.createProvider(parsed.value!);
				return reply.status(201).send({ provider });
			} catch (error) {
				return sendBadRequest(reply, error instanceof Error ? error.message : "Unable to create model provider.");
			}
		},
	);

	app.patch(
		"/v1/model-sources/usages/:usageKind/:usageId",
		async (
			request: FastifyRequest<{
				Params: { usageKind?: string; usageId?: string };
				Body: Partial<ModelConfigSelection>;
			}>,
			reply,
		): Promise<{ usage: { kind: ModelSourceUsageKind; id: string; current: ModelConfigSelection; inherited: false } } | FastifyReply> => {
			const kind = parseUsageKind(request.params?.usageKind);
			const usageId = String(request.params?.usageId ?? "").trim();
			if (!kind || !usageId) {
				return sendBadRequest(reply, "Unknown model source usage target.");
			}
			const selection = parseModelSelection(request.body ?? {});
			if (selection.error) {
				return sendBadRequest(reply, selection.error);
			}
			const validationResponse = await validateModelSelectionOrSend(reply, options.modelConfigStore, options.modelSelectionValidator, selection.value!);
			if (validationResponse) {
				return validationResponse;
			}

			try {
				if (kind === "global") {
					return await updateGlobalUsage(reply, usageId, options, selection.value!);
				}
				if (kind === "agent") {
					return await updateAgentUsage(reply, usageId, options, selection.value!);
				}
				return await updateConnUsage(reply, usageId, options, selection.value!);
			} catch (error) {
				return sendInternalError(reply, error);
			}
		},
	);
}

function presentGlobalUsage(selection: ModelConfigSelection): ModelSourceUsageBody {
	return {
		kind: "global",
		id: "default",
		label: "全局默认",
		provider: selection.provider,
		model: selection.model,
		inherited: false,
		editable: true,
	};
}

function presentAgentUsages(agents: AgentSummary[], globalSelection: ModelConfigSelection): ModelSourceUsageBody[] {
	return agents.map((agent) => {
		const hasExplicitModel = Boolean(agent.defaultModelProvider && agent.defaultModelId);
		return {
			kind: "agent",
			id: agent.agentId,
			label: agent.name,
			provider: hasExplicitModel ? agent.defaultModelProvider! : globalSelection.provider,
			model: hasExplicitModel ? agent.defaultModelId! : globalSelection.model,
			inherited: !hasExplicitModel,
			...(hasExplicitModel ? {} : { inheritedFrom: "global_default" as const }),
			editable: agent.agentId !== DEFAULT_AGENT_ID,
		};
	});
}

async function presentConnUsages(
	conns: ConnDefinition[],
	globalSelection: ModelConfigSelection,
	agentTemplateRegistry: AgentTemplateRegistry | undefined,
): Promise<ModelSourceUsageBody[]> {
	return await Promise.all(conns.map(async (conn) => {
		const hasExplicitModel = Boolean(conn.modelProvider && conn.modelId);
		if (hasExplicitModel) {
			return {
				kind: "conn",
				id: conn.connId,
				label: conn.title,
				provider: conn.modelProvider!,
				model: conn.modelId!,
				inherited: false,
				editable: true,
				status: conn.status,
			};
		}

		try {
			const template = agentTemplateRegistry
				? await agentTemplateRegistry.getTemplate({
						profileId: conn.profileId ?? "background.default",
						agentSpecId: conn.agentSpecId ?? "agent.default",
						skillSetId: conn.skillSetId ?? "skills.default",
						modelPolicyId: conn.modelPolicyId ?? "model.default",
						...(conn.modelProvider ? { modelProvider: conn.modelProvider } : {}),
						...(conn.modelId ? { modelId: conn.modelId } : {}),
						upgradePolicy: conn.upgradePolicy ?? "latest",
					})
				: undefined;
			return {
				kind: "conn",
				id: conn.connId,
				label: conn.title,
				provider: template?.provider ?? globalSelection.provider,
				model: template?.model ?? globalSelection.model,
				inherited: true,
				inheritedFrom: "background_profile",
				editable: true,
				status: conn.status,
			};
		} catch (error) {
			return {
				kind: "conn",
				id: conn.connId,
				label: conn.title,
				provider: globalSelection.provider,
				model: globalSelection.model,
				inherited: true,
				inheritedFrom: "background_profile",
				editable: true,
				status: conn.status,
				error: error instanceof Error ? error.message : "Unable to resolve inherited model.",
			};
		}
	}));
}

function parseProviderInput(body: Record<string, unknown>): { value?: CustomModelProviderInput; error?: string } {
	if (!body || typeof body !== "object") {
		return { error: "Request body must be an object." };
	}
	if (Object.hasOwn(body, "apiKey")) {
		return { error: "Literal apiKey is not accepted. Use apiKeyEnvVar and configure the key in the runtime environment." };
	}
	return {
		value: {
			id: readStringField(body.id),
			name: readOptionalStringField(body.name),
			vendor: readOptionalStringField(body.vendor),
			region: readOptionalStringField(body.region),
			priority: readOptionalNumberField(body.priority),
			baseUrl: readStringField(body.baseUrl),
			api: readStringField(body.api) as "anthropic-messages",
			apiKeyEnvVar: readStringField(body.apiKeyEnvVar),
			authHeader: typeof body.authHeader === "boolean" ? body.authHeader : undefined,
			models: Array.isArray(body.models)
				? body.models.map((model) => {
						const record = model && typeof model === "object" ? model as Record<string, unknown> : {};
						return {
							id: readStringField(record.id),
							name: readOptionalStringField(record.name),
							contextWindow: readOptionalNumberField(record.contextWindow),
							maxTokens: readOptionalNumberField(record.maxTokens),
						};
					})
				: [],
		},
	};
}

function parseModelSelection(body: Partial<ModelConfigSelection>): { value?: ModelConfigSelection; error?: string } {
	const provider = typeof body.provider === "string" ? body.provider.trim() : "";
	const model = typeof body.model === "string" ? body.model.trim() : "";
	if (!provider) {
		return { error: 'Field "provider" must be a non-empty string' };
	}
	if (!model) {
		return { error: 'Field "model" must be a non-empty string' };
	}
	return { value: { provider, model } };
}

async function validateModelSelectionOrSend(
	reply: FastifyReply,
	store: ModelConfigStore,
	validator: ModelSelectionValidator,
	selection: ModelConfigSelection,
): Promise<FastifyReply | undefined> {
	if (!(await store.hasModel(selection))) {
		return sendBadRequest(reply, `Model not found: ${selection.provider}/${selection.model}`);
	}
	const validation = await validator(selection);
	if (!validation.ok) {
		return sendBadRequest(reply, validation.message);
	}
	return undefined;
}

async function updateGlobalUsage(
	reply: FastifyReply,
	usageId: string,
	options: ModelSourceRouteOptions,
	selection: ModelConfigSelection,
): Promise<{ usage: { kind: "global"; id: string; current: ModelConfigSelection; inherited: false } } | FastifyReply> {
	if (usageId !== "default") {
		return sendNotFound(reply, `Unknown global model source usage: ${usageId}`);
	}
	const result = await saveDefaultModelConfig(options.modelConfigStore, options.modelSelectionValidator, selection);
	if (!result.ok) {
		return sendBadRequest(reply, result.message);
	}
	options.agentTemplateRegistry?.invalidate();
	return { usage: { kind: "global", id: usageId, current: selection, inherited: false } };
}

async function updateAgentUsage(
	reply: FastifyReply,
	agentId: string,
	options: ModelSourceRouteOptions,
	selection: ModelConfigSelection,
): Promise<{ usage: { kind: "agent"; id: string; current: ModelConfigSelection; inherited: false } } | FastifyReply> {
	if (!options.agentServiceRegistry) {
		return sendNotImplemented(reply, "Agent service registry is not available.");
	}
	if (agentId === DEFAULT_AGENT_ID) {
		return sendConflict(reply, "Main agent uses the global default model. Change the global default instead.");
	}
	const currentProfile = options.agentServiceRegistry.getProfile(agentId);
	if (!currentProfile) {
		return sendNotFound(reply, `Unknown agent: ${agentId}`);
	}
	const service = options.agentServiceRegistry.get(agentId);
	if (service) {
		const catalog = await service.getConversationCatalog() as AgentConversationCatalogLike;
		if (catalog.conversations?.some((conversation) => conversation.running)) {
			return sendConflict(reply, `Agent ${agentId} has a running conversation. Stop the current run before changing its default model.`);
		}
	}
	const profile = await updateStoredAgentProfile(options.projectRoot, agentId, {
		defaultModelProvider: selection.provider,
		defaultModelId: selection.model,
	});
	options.agentServiceRegistry.updateProfile(profile);
	options.agentTemplateRegistry?.invalidate(profile.agentId);
	return { usage: { kind: "agent", id: agentId, current: selection, inherited: false } };
}

async function updateConnUsage(
	reply: FastifyReply,
	connId: string,
	options: ModelSourceRouteOptions,
	selection: ModelConfigSelection,
): Promise<{ usage: { kind: "conn"; id: string; current: ModelConfigSelection; inherited: false } } | FastifyReply> {
	if (!options.connStore) {
		return sendNotImplemented(reply, "Conn store is not available.");
	}
	const existing = await options.connStore.get(connId);
	if (!existing) {
		return sendNotFound(reply, `Unknown conn: ${connId}`);
	}
	const updated = await options.connStore.update(connId, {
		modelProvider: selection.provider,
		modelId: selection.model,
	});
	if (!updated) {
		return sendNotFound(reply, `Unknown conn: ${connId}`);
	}
	return { usage: { kind: "conn", id: connId, current: selection, inherited: false } };
}

function parseUsageKind(value: string | undefined): ModelSourceUsageKind | undefined {
	if (value === "global" || value === "agent" || value === "conn") {
		return value;
	}
	return undefined;
}

function readStringField(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function readOptionalStringField(value: unknown): string | undefined {
	const text = readStringField(value);
	return text || undefined;
}

function readOptionalNumberField(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
