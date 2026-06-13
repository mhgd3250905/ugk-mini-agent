import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDefaultAgentProfiles } from "../src/agent/agent-profile.js";
import { createStoredAgentProfile } from "../src/agent/agent-profile-catalog.js";
import type { AgentService } from "../src/agent/agent-service.js";
import { AgentServiceRegistry } from "../src/agent/agent-service-registry.js";
import { AgentTemplateRegistry } from "../src/agent/agent-template-registry.js";
import type { ConnDefinition } from "../src/agent/conn-store.js";
import { createFileModelConfigStore, type ModelSelectionValidator } from "../src/agent/model-config.js";
import { createFileModelProviderStore } from "../src/agent/model-provider-store.js";
import { registerModelSourceRoutes } from "../src/routes/model-sources.js";

const alwaysOkValidator: ModelSelectionValidator = async () => ({ ok: true });

async function createProjectRoot(t: test.TestContext): Promise<string> {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-model-sources-route-"));
	const customProvidersPath = join(projectRoot, ".data", "agent", "model-providers.json");
	const previousProviderPath = process.env.UGK_MODEL_PROVIDERS_PATH;
	process.env.UGK_MODEL_PROVIDERS_PATH = customProvidersPath;
	t.after(() => {
		if (previousProviderPath === undefined) {
			delete process.env.UGK_MODEL_PROVIDERS_PATH;
		} else {
			process.env.UGK_MODEL_PROVIDERS_PATH = previousProviderPath;
		}
	});
	await mkdir(join(projectRoot, "runtime", "pi-agent"), { recursive: true });
	await mkdir(join(projectRoot, ".pi"), { recursive: true });
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		JSON.stringify({ defaultProvider: "deepseek", defaultModel: "deepseek-v4-pro" }, null, 2),
		"utf8",
	);
	await writeFile(
		join(projectRoot, "runtime", "pi-agent", "models.json"),
		JSON.stringify({
			providers: {
				deepseek: {
					name: "DeepSeek",
					vendor: "deepseek",
					region: "cn",
					priority: 10,
					baseUrl: "https://deepseek.example/anthropic",
					api: "anthropic-messages",
					apiKey: "DEEPSEEK_API_KEY",
					models: [{ id: "deepseek-v4-pro", contextWindow: 128000 }],
				},
				"zhipu-glm": {
					name: "Zhipu GLM",
					vendor: "zhipu",
					region: "cn",
					priority: 20,
					baseUrl: "https://glm.example/anthropic",
					api: "anthropic-messages",
					apiKey: "ZHIPU_API_KEY",
					models: [{ id: "glm-5.1", contextWindow: 128000 }],
				},
			},
		}),
		"utf8",
	);
	return projectRoot;
}

function createScopedAgentService(agentId: string, running = false): AgentService {
	return {
		getAgentRunStatus: () =>
			running
				? { agentId, status: "busy", activeConversationId: `manual:${agentId}`, activeSince: new Date(0).toISOString() }
				: { agentId, status: "idle" },
		getConversationCatalog: async () => ({
			currentConversationId: `manual:${agentId}`,
			conversations: [
				{
					conversationId: `manual:${agentId}`,
					title: `${agentId} title`,
					preview: "",
					messageCount: 0,
					createdAt: new Date(0).toISOString(),
					updatedAt: new Date(0).toISOString(),
					running,
				},
			],
		}),
	} as unknown as AgentService;
}

function createRegistry(projectRoot: string, runningAgents = new Set<string>()): AgentServiceRegistry<AgentService> {
	return new AgentServiceRegistry({
		profiles: createDefaultAgentProfiles(projectRoot),
		createService: (profile) => createScopedAgentService(profile.agentId, runningAgents.has(profile.agentId)),
	});
}

function createConn(overrides: Partial<ConnDefinition> = {}): ConnDefinition {
	return {
		connId: "conn_report",
		title: "每日报告",
		prompt: "整理信息",
		target: { type: "task_inbox" },
		schedule: { kind: "interval", everyMs: 3600000 },
		execution: { type: "agent_prompt" },
		assetRefs: [],
		profileId: "background.default",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		upgradePolicy: "latest",
		status: "active",
		createdAt: new Date(0).toISOString(),
		updatedAt: new Date(0).toISOString(),
		...overrides,
	};
}

async function createApp(t: test.TestContext, input: {
	projectRoot: string;
	agentServiceRegistry?: AgentServiceRegistry<AgentService>;
	conns?: ConnDefinition[];
}) {
	const app = Fastify({ logger: false });
	t.after(() => {
		void app.close();
	});
	const conns = input.conns ?? [];
	registerModelSourceRoutes(app, {
		projectRoot: input.projectRoot,
		modelConfigStore: createFileModelConfigStore(input.projectRoot),
		modelSelectionValidator: alwaysOkValidator,
		modelProviderStore: createFileModelProviderStore(input.projectRoot),
		agentServiceRegistry: input.agentServiceRegistry ?? createRegistry(input.projectRoot),
		agentTemplateRegistry: new AgentTemplateRegistry({ projectRoot: input.projectRoot }),
		connStore: {
			list: async () => conns,
			get: async (connId: string) => conns.find((conn) => conn.connId === connId),
			update: async (connId: string, patch: Partial<ConnDefinition>) => {
				const index = conns.findIndex((conn) => conn.connId === connId);
				if (index < 0) {
					return undefined;
				}
				conns[index] = { ...conns[index], ...patch, updatedAt: new Date(1).toISOString() };
				return conns[index];
			},
		},
	});
	return app;
}

async function seedDeepseekAndZhipu(projectRoot: string): Promise<void> {
	const providerStore = createFileModelProviderStore(projectRoot);
	await providerStore.createProvider({
		id: "deepseek",
		name: "DeepSeek",
		vendor: "deepseek",
		region: "cn",
		baseUrl: "https://deepseek.example/anthropic",
		api: "anthropic-messages",
		apiKey: "sk-deepseek",
		models: [{ id: "deepseek-v4-pro", contextWindow: 128000 }],
	});
	await providerStore.createProvider({
		id: "zhipu-glm",
		name: "Zhipu GLM",
		vendor: "zhipu",
		region: "cn",
		baseUrl: "https://glm.example/anthropic",
		api: "anthropic-messages",
		apiKey: "sk-zhipu",
		models: [{ id: "glm-5.1", contextWindow: 128000 }],
	});
}

test("GET /v1/model-sources lists providers and effective usage bindings", async (t) => {
	const projectRoot = await createProjectRoot(t);
	await seedDeepseekAndZhipu(projectRoot);
	const registry = createRegistry(projectRoot);
	const profile = await createStoredAgentProfile(projectRoot, {
		agentId: "research",
		name: "研究 Agent",
		description: "用于研究。",
		defaultModelProvider: "zhipu-glm",
		defaultModelId: "glm-5.1",
	});
	registry.add(profile);
	const app = await createApp(t, {
		projectRoot,
		agentServiceRegistry: registry,
		conns: [createConn(), createConn({ connId: "conn_explicit", title: "显式任务", modelProvider: "zhipu-glm", modelId: "glm-5.1" })],
	});

	const response = await app.inject({ method: "GET", url: "/v1/model-sources" });

	assert.equal(response.statusCode, 200);
	const body = response.json();
	assert.deepEqual(body.current, { provider: "deepseek", model: "deepseek-v4-pro" });
	assert.ok(body.providers.every((provider: { source: string }) => provider.source === "custom"));
	assert.ok(body.providers.some((provider: { id: string; source: string }) => provider.id === "deepseek" && provider.source === "custom"));
	const mainUsage = body.usages.find((usage: { kind: string; id: string }) => usage.kind === "agent" && usage.id === "main");
	assert.equal(mainUsage.inherited, true);
	assert.equal(mainUsage.editable, false);
	assert.equal(mainUsage.provider, "deepseek");
	const researchUsage = body.usages.find((usage: { kind: string; id: string }) => usage.kind === "agent" && usage.id === "research");
	assert.equal(researchUsage.inherited, false);
	assert.equal(researchUsage.provider, "zhipu-glm");
	const connInherited = body.usages.find((usage: { kind: string; id: string }) => usage.kind === "conn" && usage.id === "conn_report");
	assert.equal(connInherited.inherited, true);
	assert.equal(connInherited.provider, "deepseek");
	const connExplicit = body.usages.find((usage: { kind: string; id: string }) => usage.kind === "conn" && usage.id === "conn_explicit");
	assert.equal(connExplicit.inherited, false);
	assert.equal(connExplicit.provider, "zhipu-glm");
});

test("GET /v1/model-sources starts with no providers before users add API sources", async (t) => {
	const projectRoot = await createProjectRoot(t);
	const app = await createApp(t, { projectRoot });

	const response = await app.inject({ method: "GET", url: "/v1/model-sources" });

	assert.equal(response.statusCode, 200);
	assert.deepEqual(response.json().providers, []);
});

test("POST /v1/model-sources/providers creates runtime custom provider with a local API key", async (t) => {
	const projectRoot = await createProjectRoot(t);
	const app = await createApp(t, { projectRoot });

	const created = await app.inject({
		method: "POST",
		url: "/v1/model-sources/providers",
		payload: {
			id: "custom-openai",
			name: "Custom OpenAI",
			vendor: "custom",
			region: "global",
			baseUrl: "https://openai.example/anthropic",
			api: "anthropic-messages",
			apiKey: "sk-custom-openai",
			models: [{ id: "gpt-custom", name: "GPT Custom", contextWindow: 200000 }],
		},
	});
	const listed = await app.inject({ method: "GET", url: "/v1/model-sources" });

	assert.equal(created.statusCode, 201);
	assert.equal(created.json().provider.id, "custom-openai");
	assert.equal(created.json().provider.apiKey, undefined);
	const custom = listed.json().providers.find((provider: { id: string }) => provider.id === "custom-openai");
	assert.equal(custom.source, "custom");
	assert.equal(custom.auth.configured, true);
	assert.equal(custom.auth.source, "literal");
	assert.equal(custom.models[0].id, "gpt-custom");
});

test("POST /v1/model-sources/providers promotes the first custom provider when the default is unknown", async (t) => {
	const projectRoot = await createProjectRoot(t);
	await createFileModelConfigStore(projectRoot).setDefault({ provider: "unknown", model: "unknown" });
	const app = await createApp(t, { projectRoot });

	const created = await app.inject({
		method: "POST",
		url: "/v1/model-sources/providers",
		payload: {
			id: "custom-openai",
			name: "Custom OpenAI",
			vendor: "custom",
			region: "global",
			baseUrl: "https://openai.example/anthropic",
			api: "anthropic-messages",
			apiKey: "sk-custom-openai",
			models: [{ id: "gpt-custom", name: "GPT Custom", contextWindow: 200000 }],
		},
	});
	const listed = await app.inject({ method: "GET", url: "/v1/model-sources" });

	assert.equal(created.statusCode, 201);
	assert.deepEqual(listed.json().current, { provider: "custom-openai", model: "gpt-custom" });
	const globalUsage = listed.json().usages.find((usage: { kind: string; id: string }) => usage.kind === "global" && usage.id === "default");
	assert.equal(globalUsage.provider, "custom-openai");
	assert.equal(globalUsage.model, "gpt-custom");
});

test("PATCH /v1/model-sources/usages updates global, agent, and conn bindings", async (t) => {
	const projectRoot = await createProjectRoot(t);
	await seedDeepseekAndZhipu(projectRoot);
	const registry = createRegistry(projectRoot);
	const profile = await createStoredAgentProfile(projectRoot, {
		agentId: "research",
		name: "研究 Agent",
		description: "用于研究。",
	});
	registry.add(profile);
	const conns = [createConn()];
	const app = await createApp(t, { projectRoot, agentServiceRegistry: registry, conns });

	const global = await app.inject({
		method: "PATCH",
		url: "/v1/model-sources/usages/global/default",
		payload: { provider: "zhipu-glm", model: "glm-5.1" },
	});
	const agent = await app.inject({
		method: "PATCH",
		url: "/v1/model-sources/usages/agent/research",
		payload: { provider: "deepseek", model: "deepseek-v4-pro" },
	});
	const conn = await app.inject({
		method: "PATCH",
		url: "/v1/model-sources/usages/conn/conn_report",
		payload: { provider: "zhipu-glm", model: "glm-5.1" },
	});

	assert.equal(global.statusCode, 200);
	assert.deepEqual(global.json().usage.current, { provider: "zhipu-glm", model: "glm-5.1" });
	assert.equal(agent.statusCode, 200);
	assert.equal(registry.getProfile("research")?.defaultModelProvider, "deepseek");
	assert.equal(conn.statusCode, 200);
	assert.equal(conns[0].modelProvider, "zhipu-glm");
	assert.equal(conns[0].modelId, "glm-5.1");
});

test("PATCH /v1/model-sources/usages rejects running agent binding changes", async (t) => {
	const projectRoot = await createProjectRoot(t);
	await seedDeepseekAndZhipu(projectRoot);
	const registry = createRegistry(projectRoot, new Set(["search"]));
	const app = await createApp(t, { projectRoot, agentServiceRegistry: registry });

	const response = await app.inject({
		method: "PATCH",
		url: "/v1/model-sources/usages/agent/search",
		payload: { provider: "zhipu-glm", model: "glm-5.1" },
	});

	assert.equal(response.statusCode, 409);
	assert.match(response.json().error.message, /running/i);
});
