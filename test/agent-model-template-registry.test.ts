import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentTemplateRegistry } from "../src/agent/agent-template-registry.js";
import { createStoredAgentProfile } from "../src/agent/agent-profile-catalog.js";

async function createProjectRootWithModelSettings(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-agent-tmpl-model-"));
	await mkdir(join(root, ".pi", "skills"), { recursive: true });
	await mkdir(join(root, ".pi"), { recursive: true });
	await mkdir(join(root, "runtime", "pi-agent"), { recursive: true });
	await mkdir(join(root, ".data", "agent"), { recursive: true });
	await writeFile(
		join(root, ".pi", "settings.json"),
		JSON.stringify({
			defaultProvider: "global-provider",
			defaultModel: "global-model",
		}),
		"utf8",
	);
	await writeFile(
		join(root, "runtime", "pi-agent", "models.json"),
		JSON.stringify({ providers: {} }),
		"utf8",
	);
	await writeFile(
		join(root, ".data", "agent", "model-providers.json"),
		JSON.stringify({
			providers: {
				"global-provider": {
					name: "global-provider",
					api: "anthropic-messages",
					baseUrl: "https://example.invalid",
					apiKey: "TEST_API_KEY",
					models: [{ id: "global-model", contextWindow: 64000, maxTokens: 4096 }],
				},
				"agent-provider": {
					name: "agent-provider",
					api: "anthropic-messages",
					baseUrl: "https://example.invalid",
					apiKey: "TEST_API_KEY",
					models: [{ id: "agent-model", contextWindow: 128000, maxTokens: 8192 }],
				},
			},
		}),
		"utf8",
	);
	return root;
}

test("AgentTemplateRegistry uses agent-specific model when profile has defaultModelProvider/defaultModelId", async () => {
	const projectRoot = await createProjectRootWithModelSettings();
	await createStoredAgentProfile(projectRoot, {
		agentId: "coder",
		name: "编码 Agent",
		description: "用于编码。",
		defaultModelProvider: "agent-provider",
		defaultModelId: "agent-model",
	});
	const registry = new AgentTemplateRegistry({ projectRoot });

	const template = await registry.getTemplate({
		profileId: "coder",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		upgradePolicy: "latest",
		now: new Date("2026-05-12T00:00:00.000Z"),
	});

	assert.equal(template.provider, "agent-provider");
	assert.equal(template.model, "agent-model");
	assert.equal(template.source, "playground");
});

test("AgentTemplateRegistry falls back to project global model when agent has no model fields", async () => {
	const projectRoot = await createProjectRootWithModelSettings();
	await createStoredAgentProfile(projectRoot, {
		agentId: "plain",
		name: "普通 Agent",
		description: "无模型配置。",
	});
	const registry = new AgentTemplateRegistry({ projectRoot });

	const template = await registry.getTemplate({
		profileId: "plain",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		upgradePolicy: "latest",
		now: new Date("2026-05-12T00:00:00.000Z"),
	});

	assert.equal(template.provider, "global-provider");
	assert.equal(template.model, "global-model");
});

test("AgentTemplateRegistry invalidates template when agent model fields change", async () => {
	const projectRoot = await createProjectRootWithModelSettings();
	await createStoredAgentProfile(projectRoot, {
		agentId: "coder",
		name: "编码 Agent",
		description: "用于编码。",
		defaultModelProvider: "agent-provider",
		defaultModelId: "agent-model",
	});
	const registry = new AgentTemplateRegistry({ projectRoot });
	const ref = {
		profileId: "coder",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		upgradePolicy: "latest" as const,
	};

	const first = await registry.getTemplate(ref);
	assert.equal(first.provider, "agent-provider");

	const { updateStoredAgentProfile } = await import("../src/agent/agent-profile-catalog.js");
	await updateStoredAgentProfile(projectRoot, "coder", {
		name: "编码 Agent",
		description: "用于编码。",
		defaultModelProvider: "global-provider",
		defaultModelId: "global-model",
	});
	registry.invalidate("coder");

	const second = await registry.getTemplate(ref);
	assert.equal(second.provider, "global-provider");
	assert.equal(second.model, "global-model");
	assert.notEqual(second.version, first.version);
});
