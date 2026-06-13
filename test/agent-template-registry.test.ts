import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentTemplateRegistry } from "../src/agent/agent-template-registry.js";
import { createStoredAgentProfile } from "../src/agent/agent-profile-catalog.js";
import { createAgentMcpServer } from "../src/agent/mcp-server-catalog.js";

async function createProjectRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-agent-template-"));
	await mkdir(join(root, ".pi", "skills", "skill-a"), { recursive: true });
	await mkdir(join(root, "runtime", "skills-user", "skill-b"), { recursive: true });
	await mkdir(join(root, ".pi"), { recursive: true });
	await writeFile(join(root, ".pi", "skills", "skill-a", "SKILL.md"), "# Skill A\n\nUse for A.", "utf8");
	await writeFile(join(root, "runtime", "skills-user", "skill-b", "SKILL.md"), "# Skill B\n\nUse for B.", "utf8");
	await writeFile(
		join(root, ".pi", "settings.json"),
		JSON.stringify({
			defaultProvider: "test-provider",
			defaultModel: "test-model",
		}),
		"utf8",
	);
	await mkdir(join(root, "runtime", "pi-agent"), { recursive: true });
	await writeFile(
		join(root, "runtime", "pi-agent", "models.json"),
		JSON.stringify({
			providers: [
				{
					id: "test-provider",
					models: [{ id: "test-model", contextWindow: 100000, maxTokens: 12000 }],
				},
			],
		}),
		"utf8",
	);
	return root;
}

test("AgentTemplateRegistry reuses unchanged templates and refreshes when skills change", async () => {
	const projectRoot = await createProjectRoot();
	const registry = new AgentTemplateRegistry({ projectRoot });
	const ref = {
		profileId: "main",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		upgradePolicy: "latest" as const,
		now: new Date("2026-05-09T00:00:00.000Z"),
	};

	const first = await registry.getTemplate(ref);
	const second = await registry.getTemplate(ref);

	assert.equal(second, first);
	assert.equal(first.profileId, "main");
	assert.deepEqual(first.skills.map((skill) => skill.name), ["skill-a", "skill-b"]);

	await mkdir(join(projectRoot, ".pi", "skills", "skill-c"), { recursive: true });
	await writeFile(join(projectRoot, ".pi", "skills", "skill-c", "SKILL.md"), "# Skill C\n\nUse for C.", "utf8");
	const refreshed = await registry.getTemplate(ref);

	assert.notEqual(refreshed, first);
	assert.deepEqual(refreshed.skills.map((skill) => skill.name), ["skill-a", "skill-b", "skill-c"]);
	assert.notEqual(refreshed.version, first.version);
});

test("AgentTemplateRegistry does not split templates by run-level overrides", async () => {
	const projectRoot = await createProjectRoot();
	const registry = new AgentTemplateRegistry({ projectRoot });
	const baseRef = {
		profileId: "main",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		upgradePolicy: "latest" as const,
	};

	const first = await registry.getTemplate(baseRef);
	const second = await registry.getTemplate({
		...baseRef,
		modelProvider: "another-provider",
		modelId: "another-model",
		upgradePolicy: "pinned",
	});

	assert.equal(second, first);
});

test("AgentTemplateRegistry atomically keeps the old template when a rebuild fails", async () => {
	const projectRoot = await createProjectRoot();
	const registry = new AgentTemplateRegistry({ projectRoot });
	const ref = {
		profileId: "main",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		upgradePolicy: "latest" as const,
	};
	const first = await registry.getTemplate(ref);

	await mkdir(join(projectRoot, ".data", "agents"), { recursive: true });
	await writeFile(join(projectRoot, ".data", "agents", "profiles.json"), "{broken json", "utf8");
	const second = await registry.getTemplate(ref);

	assert.equal(second, first);
});

test("AgentTemplateRegistry builds Playground agent templates with default browser", async () => {
	const projectRoot = await createProjectRoot();
	await createStoredAgentProfile(projectRoot, {
		agentId: "zhihu-helper",
		name: "知乎助手",
		description: "知乎登录态任务。",
		defaultBrowserId: "chrome-01",
	});
	const registry = new AgentTemplateRegistry({ projectRoot });

	const template = await registry.getTemplate({
		profileId: "zhihu-helper",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		upgradePolicy: "latest",
		now: new Date("2026-05-09T00:00:00.000Z"),
	});

	assert.equal(template.agentId, "zhihu-helper");
	assert.equal(template.agentName, "知乎助手");
	assert.equal(template.defaultBrowserId, "chrome-01");
	assert.equal(template.source, "playground");
});

test("AgentTemplateRegistry refreshes Playground templates when agent MCP servers change", async () => {
	const projectRoot = await createProjectRoot();
	await createStoredAgentProfile(projectRoot, {
		agentId: "ocr",
		name: "OCR",
		description: "OCR agent.",
	});
	const registry = new AgentTemplateRegistry({ projectRoot });
	const ref = {
		profileId: "ocr",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		upgradePolicy: "latest" as const,
		now: new Date("2026-05-09T00:00:00.000Z"),
	};

	const first = await registry.getTemplate(ref);
	await createAgentMcpServer(projectRoot, "ocr", {
		serverId: "qr-ocr",
		name: "QR OCR",
		enabled: true,
		transport: { type: "stdio", command: "python", args: ["ocr.py"] },
		timeoutMs: 120000,
	});
	const refreshed = await registry.getTemplate(ref);

	assert.notEqual(refreshed, first);
	assert.notEqual(refreshed.version, first.version);
	assert.deepEqual(refreshed.mcpServers?.map((server) => server.serverId), ["qr-ocr"]);
});
