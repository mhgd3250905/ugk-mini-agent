import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BackgroundAgentProfileResolver } from "../src/agent/background-agent-profile.js";
import { createStoredAgentProfile } from "../src/agent/agent-profile-catalog.js";
import { createAgentMcpServer } from "../src/agent/mcp-server-catalog.js";

async function createProjectRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "ugk-pi-background-profile-"));
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
			compaction: {
				reserveTokens: 8192,
			},
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
					models: [
						{
							id: "test-model",
							contextWindow: 100000,
							maxTokens: 12000,
						},
					],
				},
			],
		}),
		"utf8",
	);
	return root;
}

test("BackgroundAgentProfileResolver resolves the built-in default profile from runtime ids", async () => {
	const projectRoot = await createProjectRoot();
	const resolver = new BackgroundAgentProfileResolver({ projectRoot });

	const snapshot = await resolver.resolve({
		profileId: "background.default",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		upgradePolicy: "latest",
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	assert.equal(snapshot.profileId, "background.default");
	assert.equal(snapshot.agentSpecId, "agent.default");
	assert.equal(snapshot.skillSetId, "skills.default");
	assert.equal(snapshot.modelPolicyId, "model.default");
	assert.equal(snapshot.upgradePolicy, "latest");
	assert.equal(snapshot.provider, "test-provider");
	assert.equal(snapshot.model, "test-model");
	assert.equal(snapshot.resolvedAt, "2026-04-21T10:00:00.000Z");
	assert.deepEqual(
		snapshot.skills.map((skill) => skill.name),
		["skill-a", "skill-b"],
	);
	assert.ok(snapshot.skillSetVersion.length >= 12);
	assert.ok(snapshot.skills.every((skill) => skill.version.length >= 12));
});

test("BackgroundAgentProfileResolver resolves file registry ids when present", async () => {
	const projectRoot = await createProjectRoot();
	const registryDir = join(projectRoot, ".pi", "background-agent");
	await mkdir(registryDir, { recursive: true });
	await writeFile(
		join(registryDir, "profiles.json"),
		JSON.stringify({
			profiles: [
				{
					id: "background.research",
					version: "2026-04-21",
					agentSpecId: "agent.research",
					skillSetId: "skills.research",
					modelPolicyId: "model.research",
				},
			],
		}),
		"utf8",
	);
	await writeFile(
		join(registryDir, "agent-specs.json"),
		JSON.stringify({
			agentSpecs: [{ id: "agent.research", version: "v7" }],
		}),
		"utf8",
	);
	await writeFile(
		join(registryDir, "skill-sets.json"),
		JSON.stringify({
			skillSets: [
				{
					id: "skills.research",
					version: "v3",
					skillPaths: [join(projectRoot, ".pi", "skills")],
				},
			],
		}),
		"utf8",
	);
	await writeFile(
		join(registryDir, "model-policies.json"),
		JSON.stringify({
			modelPolicies: [
				{
					id: "model.research",
					version: "v2",
					provider: "override-provider",
					model: "override-model",
				},
			],
		}),
		"utf8",
	);
	const resolver = new BackgroundAgentProfileResolver({ projectRoot });

	const snapshot = await resolver.resolve({
		profileId: "background.research",
		agentSpecId: "agent.research",
		skillSetId: "skills.research",
		modelPolicyId: "model.research",
		upgradePolicy: "pinned",
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	assert.equal(snapshot.profileVersion, "2026-04-21");
	assert.equal(snapshot.agentSpecVersion, "v7");
	assert.equal(snapshot.skillSetVersion, "v3");
	assert.equal(snapshot.modelPolicyVersion, "v2");
	assert.equal(snapshot.provider, "override-provider");
	assert.equal(snapshot.model, "override-model");
	assert.deepEqual(
		snapshot.skills.map((skill) => skill.name),
		["skill-a"],
	);
});

test("BackgroundAgentProfileResolver lets a conn override the default or policy model", async () => {
	const projectRoot = await createProjectRoot();
	const resolver = new BackgroundAgentProfileResolver({ projectRoot });

	const snapshot = await resolver.resolve({
		profileId: "background.default",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		modelProvider: "xiaomi-mimo-cn",
		modelId: "mimo-v2.5-pro",
		upgradePolicy: "latest",
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	assert.equal(snapshot.provider, "xiaomi-mimo-cn");
	assert.equal(snapshot.model, "mimo-v2.5-pro");
});

test("BackgroundAgentProfileResolver omits removed browser bindings", async () => {
	const projectRoot = await createProjectRoot();
	await createStoredAgentProfile(projectRoot, {
		agentId: "zhihu-helper",
		name: "知乎助手",
		description: "知乎登录态任务。",
	});
	const resolver = new BackgroundAgentProfileResolver({ projectRoot });

	const snapshot = await resolver.resolve({
		profileId: "zhihu-helper",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		upgradePolicy: "latest",
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	assert.equal(snapshot.agentId, "zhihu-helper");
	assert.equal("defaultBrowserId" in snapshot, false);
});

test("BackgroundAgentProfileResolver carries enabled MCP servers for the selected Playground agent", async () => {
	const projectRoot = await createProjectRoot();
	await createStoredAgentProfile(projectRoot, {
		agentId: "ocr",
		name: "OCR",
		description: "OCR agent.",
	});
	await createAgentMcpServer(projectRoot, "ocr", {
		serverId: "qr-ocr",
		name: "QR OCR",
		enabled: true,
		transport: { type: "stdio", command: "python", args: ["ocr.py"] },
		timeoutMs: 120000,
	});
	await createAgentMcpServer(projectRoot, "ocr", {
		serverId: "disabled-ocr",
		name: "Disabled OCR",
		enabled: false,
		transport: { type: "stdio", command: "python", args: ["disabled.py"] },
		timeoutMs: 120000,
	});
	const resolver = new BackgroundAgentProfileResolver({ projectRoot });

	const snapshot = await resolver.resolve({
		profileId: "ocr",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		upgradePolicy: "latest",
		now: new Date("2026-04-21T10:00:00.000Z"),
	});

	assert.deepEqual(snapshot.mcpServers?.map((server) => server.serverId), ["qr-ocr"]);
});

test("BackgroundAgentProfileResolver falls back to the main agent when a non-default profile is missing", async () => {
	const projectRoot = await createProjectRoot();
	const resolver = new BackgroundAgentProfileResolver({ projectRoot });

	const snapshot = await resolver.resolve({
		profileId: "background.missing",
		agentSpecId: "agent.default",
		skillSetId: "skills.default",
		modelPolicyId: "model.default",
		upgradePolicy: "latest",
	});

	assert.equal(snapshot.requestedAgentId, "background.missing");
	assert.equal(snapshot.agentId, "main");
	assert.equal(snapshot.fallbackUsed, true);
	assert.equal(snapshot.fallbackReason, "profile_not_found");
	assert.deepEqual(
		snapshot.skills.map((skill) => skill.name),
		["skill-a", "skill-b"],
	);
});
