import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { prepareBrowserBoundBashEnvironment } from "../src/browser/browser-bound-bash.js";
import {
	createDefaultAgentSessionFactory,
	createProjectSettingsManager,
	createSkillRestrictedResourceLoader,
	getDefaultAllowedSkillPaths,
	getDefaultRuntimeAgentRulesPath,
	getDefaultSystemSkillPath,
	getDefaultUserSkillPath,
	getProjectModelsPath,
	resolveProjectDefaultModelContext,
	resolveProjectDefaultSessionModel,
} from "../src/agent/agent-session-factory.js";
import type { AgentMcpServerConfig } from "../src/agent/mcp-server-catalog.js";

async function createMinimalRuntimeProjectRoot(prefix: string): Promise<string> {
	const projectRoot = await mkdtemp(join(tmpdir(), prefix));
	await mkdir(join(projectRoot, ".pi"), { recursive: true });
	await mkdir(join(projectRoot, ".data", "agent"), { recursive: true });
	await mkdir(join(projectRoot, "runtime", "pi-agent"), { recursive: true });
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		JSON.stringify({
			defaultProvider: "test-provider",
			defaultModel: "test-model",
		}),
		"utf8",
	);
	await writeFile(
		join(projectRoot, "runtime", "pi-agent", "models.json"),
		JSON.stringify({
			providers: {},
		}),
		"utf8",
	);
	await writeFile(
		join(projectRoot, ".data", "agent", "model-providers.json"),
		JSON.stringify({
			providers: {
				"test-provider": {
					baseUrl: "https://example.test",
					api: "anthropic-messages",
					apiKey: "TEST_API_KEY",
					models: [{ id: "test-model", contextWindow: 100000, maxTokens: 12000 }],
				},
			},
		}),
		"utf8",
	);
	return projectRoot;
}

function mcpServer(overrides: Partial<AgentMcpServerConfig> = {}): AgentMcpServerConfig {
	return {
		serverId: "qr-ocr",
		name: "QR OCR",
		enabled: true,
		transport: { type: "stdio", command: "python", args: ["ocr.py"] },
		timeoutMs: 120000,
		createdAt: "2026-06-13T00:00:00.000Z",
		updatedAt: "2026-06-13T00:00:00.000Z",
		...overrides,
	};
}

function getSessionTool(session: unknown, name: string) {
	const candidate = session as { getToolDefinition?: (toolName: string) => unknown };
	return candidate.getToolDefinition?.(name) as
		| {
				name: string;
				execute: (
					toolCallId: string,
					params: Record<string, unknown>,
					signal: AbortSignal | undefined,
					onUpdate: undefined,
					ctx: { cwd: string },
				) => Promise<{ content: Array<{ type: string; text?: string }> }>;
		  }
		| undefined;
}

test("default session factory injects MCP proxy tool when the selected agent has enabled MCP servers", async () => {
	const projectRoot = await createMinimalRuntimeProjectRoot("ugk-pi-session-mcp-");
	const sessionDir = join(projectRoot, ".data", "agent", "sessions");
	const factory = createDefaultAgentSessionFactory({
		projectRoot,
		sessionDir,
		mcpAgentId: "ocr",
		mcpServers: [mcpServer()],
	});

	const session = await factory.createSession({ conversationId: "conv_1" });
	const tool = getSessionTool(session, "mcp");

	assert.ok(tool);
	const result = await tool.execute(
		"call-1",
		{ action: "list_servers" },
		undefined,
		undefined,
		{ cwd: projectRoot },
	);
	assert.deepEqual(JSON.parse(result.content[0]?.text ?? "{}"), {
		ok: true,
		agentId: "ocr",
		servers: [
			{
				serverId: "qr-ocr",
				name: "QR OCR",
				transportType: "stdio",
			},
		],
	});
});

test("prepareBrowserBoundBashEnvironment pins curl web-access calls to the run browser", async () => {
	const workspaceRoot = await mkdtemp(join(tmpdir(), "ugk-pi-browser-bound-bash-"));

	const env = await prepareBrowserBoundBashEnvironment({
		workspaceRoot,
		browserId: "chrome-02",
		browserScope: "conn-1",
		env: {
			PATH: "/usr/bin",
			UGK_BROWSER_INSTANCES_JSON: JSON.stringify([
				{ browserId: "chrome-01", cdpHost: "172.31.250.11", cdpPort: 9223 },
				{ browserId: "chrome-02", cdpHost: "172.31.250.12", cdpPort: 9223 },
			]),
		} as NodeJS.ProcessEnv,
	});

	assert.equal(env.CLAUDE_AGENT_ID, "conn-1");
	assert.equal(env.CLAUDE_HOOK_AGENT_ID, "conn-1");
	assert.equal(env.agent_id, "conn-1");
	assert.equal(env.UGK_REQUIRE_SCOPED_BROWSER_PROXY, "true");
	assert.equal(env.WEB_ACCESS_BROWSER_ID, "chrome-02");
	assert.equal(env.UGK_DEFAULT_BROWSER_ID, "chrome-02");
	assert.equal(env.WEB_ACCESS_CDP_HOST, "172.31.250.12");
	assert.equal(env.WEB_ACCESS_CDP_PORT, "9223");
	assert.deepEqual(JSON.parse(env.UGK_BROWSER_INSTANCES_JSON), [
		{ browserId: "chrome-02", cdpHost: "172.31.250.12", cdpPort: 9223 },
	]);
	assert.match(env.PATH, new RegExp(`^${join(workspaceRoot, ".data", "browser-bin").replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}`));

	const wrapperScriptPath = process.platform === "win32"
		? join(workspaceRoot, ".data", "browser-bin", "curl-browser-binding.mjs")
		: join(workspaceRoot, ".data", "browser-bin", "curl");
	const wrapper = await readFile(wrapperScriptPath, "utf8");
	assert.match(wrapper, /127\\\.0\\\.0\\\.1\|localhost/);
	assert.match(wrapper, /metaAgentScope/);
	assert.doesNotMatch(wrapper, /metaBrowserId/);
	assert.doesNotMatch(wrapper, /WEB_ACCESS_BROWSER_ID/);
});

test("createSkillRestrictedResourceLoader only loads skills from the allowed paths", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-session-factory-"));
	const allowedSkillDir = join(projectRoot, ".pi", "skills", "allowed-skill");
	const blockedSkillDir = join(projectRoot, "skills", "blocked-skill");

	await mkdir(allowedSkillDir, { recursive: true });
	await mkdir(blockedSkillDir, { recursive: true });
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		JSON.stringify({
			skills: ["../skills"],
		}),
		"utf8",
	);
	await writeFile(
		join(allowedSkillDir, "SKILL.md"),
		"---\nname: allowed-skill\ndescription: skill from the allowed whitelist path\n---\n",
		"utf8",
	);
	await writeFile(
		join(blockedSkillDir, "SKILL.md"),
		"---\nname: blocked-skill\ndescription: skill from a blocked path\n---\n",
		"utf8",
	);

	const loader = createSkillRestrictedResourceLoader({
		projectRoot,
		allowedSkillPaths: [join(projectRoot, ".pi", "skills")],
	});

	await loader.reload();

	assert.deepEqual(
		loader.getSkills().skills.map((skill) => skill.name),
		["allowed-skill"],
	);
});

test("project whitelist exposes the vendored superpowers meta skill and workflow skills", async () => {
	const loader = createSkillRestrictedResourceLoader({
		projectRoot: process.cwd(),
		allowedSkillPaths: getDefaultAllowedSkillPaths(process.cwd()),
	});

	await loader.reload();

	const skillNames = new Set(loader.getSkills().skills.map((skill) => skill.name));

	assert.equal(skillNames.has("project-planning"), true);
	assert.equal(skillNames.has("using-superpowers"), true);
	assert.equal(skillNames.has("brainstorming"), true);
	assert.equal(skillNames.has("test-driven-development"), true);
	assert.equal(skillNames.has("systematic-debugging"), true);
	assert.equal(skillNames.has("subagent-usage"), true);
});

test("default allowed skill paths include both system and user skill directories", () => {
	const projectRoot = "E:/AII/ugk-pi";

	assert.deepEqual(getDefaultAllowedSkillPaths(projectRoot), [
		getDefaultSystemSkillPath(projectRoot),
		getDefaultUserSkillPath(projectRoot),
	]);
});

test("skill whitelist can load both system and user-installed skill directories", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-dual-skill-loader-"));
	const systemSkillDir = join(projectRoot, ".pi", "skills", "system-skill");
	const userSkillDir = join(projectRoot, "runtime", "skills-user", "user-skill");

	await mkdir(systemSkillDir, { recursive: true });
	await mkdir(userSkillDir, { recursive: true });
	await writeFile(
		join(systemSkillDir, "SKILL.md"),
		"---\nname: system-skill\ndescription: bundled system skill\n---\n",
		"utf8",
	);
	await writeFile(
		join(userSkillDir, "SKILL.md"),
		"---\nname: user-skill\ndescription: user installed skill\n---\n",
		"utf8",
	);

	const loader = createSkillRestrictedResourceLoader({
		projectRoot,
		allowedSkillPaths: getDefaultAllowedSkillPaths(projectRoot),
	});

	await loader.reload();

	assert.deepEqual(
		loader.getSkills().skills.map((skill) => skill.name).sort(),
		["system-skill", "user-skill"],
	);
});

test("resource loader uses runtime AGENTS rules instead of project root AGENTS.md", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-runtime-agents-"));
	const runtimeRulesPath = getDefaultRuntimeAgentRulesPath(projectRoot);
	await mkdir(join(projectRoot, ".data", "agent"), { recursive: true });
	await writeFile(join(projectRoot, "AGENTS.md"), "# Project rules\n\nDo not leak into runtime agents.\n", "utf8");
	await writeFile(runtimeRulesPath, "# Runtime Rules\n\n- Prefer persisted local rules.\n", "utf8");

	const loader = createSkillRestrictedResourceLoader({
		projectRoot,
		allowedSkillPaths: [join(projectRoot, ".pi", "skills")],
		runtimeAgentRulesPath: runtimeRulesPath,
	});

	await loader.reload();

	const files = loader.getAgentsFiles().agentsFiles;
	const runtimeRules = files.find((file) => file.path === runtimeRulesPath);
	assert.equal(files.some((file) => file.path === join(projectRoot, "AGENTS.md")), false);
	assert.equal(files.length, 1);
	assert.equal(runtimeRules?.content, "# Runtime Rules\n\n- Prefer persisted local rules.\n");
});

test("default session factory caches available skills between unchanged fingerprints", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-skill-cache-"));
	const sessionDir = join(projectRoot, ".data", "sessions");
	const skillDir = join(projectRoot, ".pi", "skills", "cached-skill");
	await mkdir(skillDir, { recursive: true });
	await mkdir(sessionDir, { recursive: true });
	await writeFile(
		join(skillDir, "SKILL.md"),
		"---\nname: cached-skill\ndescription: cached skill\n---\n",
		"utf8",
	);

	const factory = createDefaultAgentSessionFactory({
		projectRoot,
		sessionDir,
		allowedSkillPaths: [join(projectRoot, ".pi", "skills")],
	});

	const first = await factory.getAvailableSkills?.();
	const second = await factory.getAvailableSkills?.();

	assert.equal(first?.source, "fresh");
	assert.equal(second?.source, "cache");
	assert.equal(second?.cachedAt, first?.cachedAt);
	assert.deepEqual(
		second?.skills.map((skill) => skill.name),
		["cached-skill"],
	);
});

test("default session factory refreshes cached skills when the fingerprint changes", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-skill-cache-invalidate-"));
	const sessionDir = join(projectRoot, ".data", "sessions");
	const skillsRoot = join(projectRoot, ".pi", "skills");
	const firstSkillDir = join(skillsRoot, "first-skill");
	const secondSkillDir = join(skillsRoot, "second-skill");
	await mkdir(firstSkillDir, { recursive: true });
	await mkdir(sessionDir, { recursive: true });
	await writeFile(
		join(firstSkillDir, "SKILL.md"),
		"---\nname: first-skill\ndescription: first skill\n---\n",
		"utf8",
	);

	const factory = createDefaultAgentSessionFactory({
		projectRoot,
		sessionDir,
		allowedSkillPaths: [skillsRoot],
	});

	const first = await factory.getAvailableSkills?.();
	await mkdir(secondSkillDir, { recursive: true });
	await writeFile(
		join(secondSkillDir, "SKILL.md"),
		"---\nname: second-skill\ndescription: second skill\n---\n",
		"utf8",
	);
	const second = await factory.getAvailableSkills?.();

	assert.equal(first?.source, "fresh");
	assert.equal(second?.source, "fresh");
	assert.notEqual(second?.cachedAt, first?.cachedAt);
	assert.deepEqual(
		second?.skills.map((skill) => skill.name).sort(),
		["first-skill", "second-skill"],
	);
});

test("project models.json exposes the checked-in Zhipu GLM provider", () => {
	const registry = ModelRegistry.create(AuthStorage.create(), getProjectModelsPath(process.cwd()));
	const model = registry.find("zhipu-glm", "glm-5.1");

	assert.notEqual(model, undefined);
	assert.equal(model?.provider, "zhipu-glm");
	assert.equal(model?.id, "glm-5.1");
});

test("project models.json exposes the checked-in DeepSeek provider", () => {
	const registry = ModelRegistry.create(AuthStorage.create(), getProjectModelsPath(process.cwd()));
	const proModel = registry.find("deepseek", "deepseek-v4-pro");
	const flashModel = registry.find("deepseek", "deepseek-v4-flash");

	assert.notEqual(proModel, undefined);
	assert.equal(proModel?.provider, "deepseek");
	assert.equal(proModel?.id, "deepseek-v4-pro");
	assert.equal(proModel?.contextWindow, 1000000);
	assert.equal(proModel?.maxTokens, 384000);
	assert.notEqual(flashModel, undefined);
	assert.equal(flashModel?.provider, "deepseek");
	assert.equal(flashModel?.id, "deepseek-v4-flash");
	assert.equal(flashModel?.contextWindow, 1000000);
	assert.equal(flashModel?.maxTokens, 384000);
});

test("project models.json exposes the checked-in Xiaomi MiMo Anthropic-compatible providers", () => {
	const registry = ModelRegistry.create(AuthStorage.create(), getProjectModelsPath(process.cwd()));

	for (const provider of ["xiaomi-mimo-cn", "xiaomi-mimo-sgp", "xiaomi-mimo-ams"]) {
		const model = registry.find(provider, "mimo-v2.5-pro");
		assert.notEqual(model, undefined);
		assert.equal(model?.provider, provider);
		assert.equal(model?.id, "mimo-v2.5-pro");
	}
});

test("project models.json exposes the checked-in Ali CodePlan Anthropic-compatible provider", () => {
	const registry = ModelRegistry.create(AuthStorage.create(), getProjectModelsPath(process.cwd()));
	const glmModel = registry.find("ali-codeplan", "glm-5.1");
	const kimiModel = registry.find("ali-codeplan", "kimi-k2.6");
	const deepseekModel = registry.find("ali-codeplan", "deepseek-v4-pro");
	const qwenModel = registry.find("ali-codeplan", "qwen3.7-max");

	assert.notEqual(glmModel, undefined);
	assert.equal(glmModel?.provider, "ali-codeplan");
	assert.equal(glmModel?.id, "glm-5.1");
	assert.equal(glmModel?.contextWindow, 200000);
	assert.equal(glmModel?.maxTokens, 128000);
	assert.notEqual(kimiModel, undefined);
	assert.equal(kimiModel?.provider, "ali-codeplan");
	assert.equal(kimiModel?.id, "kimi-k2.6");
	assert.equal(kimiModel?.contextWindow, 256000);
	assert.notEqual(deepseekModel, undefined);
	assert.equal(deepseekModel?.provider, "ali-codeplan");
	assert.equal(deepseekModel?.id, "deepseek-v4-pro");
	assert.equal(deepseekModel?.contextWindow, 1000000);
	assert.notEqual(qwenModel, undefined);
	assert.equal(qwenModel?.provider, "ali-codeplan");
	assert.equal(qwenModel?.id, "qwen3.7-max");
	assert.equal(qwenModel?.contextWindow, 1000000);
});

test("resolveProjectDefaultModelContext uses project defaults and reserve budget", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-default-context-"));
	await mkdir(join(projectRoot, ".pi"), { recursive: true });
	await mkdir(join(projectRoot, "runtime", "pi-agent"), { recursive: true });
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		JSON.stringify({
			defaultProvider: "zhipu-glm",
			defaultModel: "glm-5.1",
			compaction: { reserveTokens: 16384 },
		}),
		"utf8",
	);
	await writeFile(
		join(projectRoot, "runtime", "pi-agent", "models.json"),
		JSON.stringify({
			providers: {
				"zhipu-glm": {
					models: [{ id: "glm-5.1", contextWindow: 128000, maxTokens: 16384 }],
				},
			},
		}),
		"utf8",
	);

	const context = resolveProjectDefaultModelContext(projectRoot);

	assert.deepEqual(context, {
		provider: "zhipu-glm",
		model: "glm-5.1",
		contextWindow: 128000,
		maxResponseTokens: 16384,
		reserveTokens: 16384,
	});
});

test("resolveProjectDefaultModelContext prefers runtime model settings when configured", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-runtime-model-context-"));
	const runtimeSettingsPath = join(projectRoot, ".data", "agent", "model-settings.json");
	const previousSettingsPath = process.env.UGK_MODEL_SETTINGS_PATH;
	await mkdir(join(projectRoot, ".pi"), { recursive: true });
	await mkdir(join(projectRoot, ".data", "agent"), { recursive: true });
	await mkdir(join(projectRoot, "runtime", "pi-agent"), { recursive: true });
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		JSON.stringify({
			defaultProvider: "zhipu-glm",
			defaultModel: "glm-5.1",
			compaction: { reserveTokens: 16384 },
		}),
		"utf8",
	);
	await writeFile(
		runtimeSettingsPath,
		JSON.stringify({
			defaultProvider: "deepseek",
			defaultModel: "deepseek-v4-pro",
			compaction: { reserveTokens: 20000 },
		}),
		"utf8",
	);
	await writeFile(
		join(projectRoot, "runtime", "pi-agent", "models.json"),
		JSON.stringify({
			providers: {
				"zhipu-glm": {
					models: [{ id: "glm-5.1", contextWindow: 128000, maxTokens: 16384 }],
				},
				deepseek: {
					models: [{ id: "deepseek-v4-pro", contextWindow: 1000000, maxTokens: 384000 }],
				},
			},
		}),
		"utf8",
	);

	process.env.UGK_MODEL_SETTINGS_PATH = runtimeSettingsPath;
	try {
		const context = resolveProjectDefaultModelContext(projectRoot);
		const manager = createProjectSettingsManager(projectRoot);

		assert.equal(context.provider, "deepseek");
		assert.equal(context.model, "deepseek-v4-pro");
		assert.equal(context.contextWindow, 1000000);
		assert.equal(context.reserveTokens, 20000);
		assert.equal(manager.getDefaultProvider(), "deepseek");
		assert.equal(manager.getDefaultModel(), "deepseek-v4-pro");
	} finally {
		if (previousSettingsPath === undefined) {
			delete process.env.UGK_MODEL_SETTINGS_PATH;
		} else {
			process.env.UGK_MODEL_SETTINGS_PATH = previousSettingsPath;
		}
	}
});

test("resolveProjectDefaultSessionModel returns the current project default model", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-default-session-model-"));
	await mkdir(join(projectRoot, ".pi"), { recursive: true });
	await mkdir(join(projectRoot, "runtime", "pi-agent"), { recursive: true });
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		JSON.stringify({
			defaultProvider: "deepseek",
			defaultModel: "deepseek-v4-flash",
		}),
		"utf8",
	);
	await writeFile(
		join(projectRoot, "runtime", "pi-agent", "models.json"),
		JSON.stringify({
			providers: {
				deepseek: {
					models: [
						{ id: "deepseek-v4-pro" },
						{ id: "deepseek-v4-flash" },
					],
				},
			},
		}),
		"utf8",
	);

	const registry = ModelRegistry.create(AuthStorage.create(), getProjectModelsPath(projectRoot));
	const model = resolveProjectDefaultSessionModel(projectRoot, registry);

	assert.equal(model?.provider, "deepseek");
	assert.equal(model?.id, "deepseek-v4-flash");
});

test("resolveProjectDefaultModelContext ignores commented default model settings", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-default-context-comments-"));
	await mkdir(join(projectRoot, ".pi"), { recursive: true });
	await mkdir(join(projectRoot, "runtime", "pi-agent"), { recursive: true });
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		[
			"{",
			'  // "defaultProvider": "deepseek-anthropic",',
			'  // "defaultModel": "deepseek-v4-flash",',
			'  "defaultModel": "glm-5.1"',
			"}",
		].join("\n"),
		"utf8",
	);
	await writeFile(
		join(projectRoot, "runtime", "pi-agent", "models.json"),
		JSON.stringify({
			providers: {
				"zhipu-glm": {
					models: [{ id: "glm-5.1", contextWindow: 128000, maxTokens: 16384 }],
				},
				deepseek: {
					models: [{ id: "deepseek-v4-pro", contextWindow: 1000000, maxTokens: 384000 }],
				},
			},
		}),
		"utf8",
	);

	const context = resolveProjectDefaultModelContext(projectRoot);

	assert.equal(context.provider, "unknown");
	assert.equal(context.model, "glm-5.1");
});

test("createProjectSettingsManager reads project defaults from commented JSON settings", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-session-factory-"));
	await mkdir(join(projectRoot, ".pi"), { recursive: true });
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		[
			"{",
			'  // "defaultProvider": "deepseek",',
			'  "defaultProvider": "zhipu-glm",',
			'  "defaultModel": "glm-5.1",',
			'  "defaultThinkingLevel": "medium"',
			"}",
		].join("\n"),
		"utf8",
	);

	const manager = createProjectSettingsManager(projectRoot);

	assert.equal(manager.getDefaultProvider(), "zhipu-glm");
	assert.equal(manager.getDefaultModel(), "glm-5.1");
	assert.equal(manager.getDefaultThinkingLevel(), "medium");
});

test("resolveProjectDefaultModelContext ignores nested default model settings", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-default-context-nested-"));
	await mkdir(join(projectRoot, ".pi"), { recursive: true });
	await mkdir(join(projectRoot, "runtime", "pi-agent"), { recursive: true });
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		JSON.stringify({
			defaultProvider: "zhipu-glm",
			defaultModel: "glm-5.1",
			nested: {
				defaultProvider: "deepseek",
				defaultModel: "deepseek-v4-pro",
			},
			compaction: { reserveTokens: 20000 },
		}),
		"utf8",
	);
	await writeFile(
		join(projectRoot, "runtime", "pi-agent", "models.json"),
		JSON.stringify({
			providers: {
				"zhipu-glm": {
					models: [{ id: "glm-5.1", contextWindow: 128000, maxTokens: 16384 }],
				},
				deepseek: {
					models: [{ id: "deepseek-v4-pro", contextWindow: 1000000, maxTokens: 384000 }],
				},
			},
		}),
		"utf8",
	);

	const context = resolveProjectDefaultModelContext(projectRoot);

	assert.equal(context.provider, "zhipu-glm");
	assert.equal(context.model, "glm-5.1");
	assert.equal(context.reserveTokens, 20000);
});

test("resolveProjectDefaultModelContext does not use nested defaults when top-level settings are missing", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-default-context-nested-only-"));
	await mkdir(join(projectRoot, ".pi"), { recursive: true });
	await mkdir(join(projectRoot, "runtime", "pi-agent"), { recursive: true });
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		JSON.stringify({
			nested: {
				defaultProvider: "deepseek",
				defaultModel: "deepseek-v4-pro",
			},
			compaction: { reserveTokens: 20000 },
		}),
		"utf8",
	);
	await writeFile(
		join(projectRoot, "runtime", "pi-agent", "models.json"),
		JSON.stringify({
			providers: {
				deepseek: {
					models: [{ id: "deepseek-v4-pro", contextWindow: 1000000, maxTokens: 384000 }],
				},
			},
		}),
		"utf8",
	);

	const context = resolveProjectDefaultModelContext(projectRoot);

	assert.equal(context.provider, "unknown");
	assert.equal(context.model, "unknown");
	assert.equal(context.reserveTokens, 20000);
});

test("default session factory reflects model context changes after default model switches", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-model-context-refresh-"));
	const sessionDir = join(projectRoot, ".data", "agent", "sessions");
	await mkdir(join(projectRoot, ".pi"), { recursive: true });
	await mkdir(join(projectRoot, "runtime", "pi-agent"), { recursive: true });
	await mkdir(sessionDir, { recursive: true });
	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		JSON.stringify({
			defaultProvider: "zhipu-glm",
			defaultModel: "glm-5.1",
			compaction: { reserveTokens: 16384 },
		}),
		"utf8",
	);
	await writeFile(
		join(projectRoot, "runtime", "pi-agent", "models.json"),
		JSON.stringify({
			providers: {
				"zhipu-glm": {
					baseUrl: "https://open.bigmodel.cn/api/anthropic",
					api: "anthropic-messages",
					apiKey: "ZHIPU_GLM_API_KEY",
					authHeader: true,
					models: [
						{
							id: "glm-5.1",
							name: "GLM-5.1",
							reasoning: true,
							input: ["text"],
							contextWindow: 128000,
							maxTokens: 16384,
						},
					],
				},
				deepseek: {
					baseUrl: "https://api.deepseek.com",
					api: "openai-completions",
					apiKey: "DEEPSEEK_API_KEY",
					models: [
						{
							id: "deepseek-v4-pro",
							name: "DeepSeek V4 Pro",
							reasoning: true,
							input: ["text"],
							contextWindow: 1000000,
							maxTokens: 384000,
						},
					],
				},
			},
		}),
		"utf8",
	);
	const factory = createDefaultAgentSessionFactory({ projectRoot, sessionDir });

	assert.equal(factory.getDefaultModelContext?.().contextWindow, 128000);

	await writeFile(
		join(projectRoot, ".pi", "settings.json"),
		JSON.stringify({
			defaultProvider: "deepseek",
			defaultModel: "deepseek-v4-pro",
			compaction: { reserveTokens: 16384 },
		}),
		"utf8",
	);

	const updatedContext = factory.getDefaultModelContext?.();
	assert.equal(updatedContext?.provider, "deepseek");
	assert.equal(updatedContext?.model, "deepseek-v4-pro");
	assert.equal(updatedContext?.contextWindow, 1000000);
	assert.equal(updatedContext?.maxResponseTokens, 384000);
});

test("default session factory reads persisted messages from session jsonl without loading a runtime session", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-session-messages-"));
	const sessionDir = join(projectRoot, ".data", "agent", "sessions");
	const sessionFile = join(sessionDir, "historic.jsonl");
	await mkdir(sessionDir, { recursive: true });
	await mkdir(join(projectRoot, "runtime", "pi-agent"), { recursive: true });
	await writeFile(
		join(projectRoot, "runtime", "pi-agent", "models.json"),
		JSON.stringify({ providers: [] }),
		"utf8",
	);
	await writeFile(
		sessionFile,
		[
			JSON.stringify({ type: "session", version: 3 }),
			"{bad json that should be ignored",
			JSON.stringify({
				type: "message",
				timestamp: "2026-04-24T01:00:00.000Z",
				message: {
					role: "user",
					content: [{ type: "text", text: "hello" }],
				},
			}),
			JSON.stringify({
				type: "message",
				timestamp: "2026-04-24T01:00:02.000Z",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "world" }],
					usage: { totalTokens: 42 },
				},
			}),
		].join("\n"),
		"utf8",
	);
	const factory = createDefaultAgentSessionFactory({ projectRoot, sessionDir });

	const messages = await factory.readSessionMessages?.(sessionFile);

	assert.deepEqual(messages, [
		{
			role: "user",
			content: [{ type: "text", text: "hello" }],
			timestamp: "2026-04-24T01:00:00.000Z",
		},
		{
			role: "assistant",
			content: [{ type: "text", text: "world" }],
			usage: { totalTokens: 42 },
			timestamp: "2026-04-24T01:00:02.000Z",
		},
	]);
});

test("default session factory reads a recent message window without parsing the whole jsonl", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-session-recent-"));
	const sessionDir = join(projectRoot, ".data", "agent", "sessions");
	const sessionFile = join(sessionDir, "long.jsonl");
	await mkdir(sessionDir, { recursive: true });
	await mkdir(join(projectRoot, "runtime", "pi-agent"), { recursive: true });
	await writeFile(
		join(projectRoot, "runtime", "pi-agent", "models.json"),
		JSON.stringify({ providers: [] }),
		"utf8",
	);

	const oldMessages = Array.from({ length: 120 }, (_, index) =>
		JSON.stringify({
			type: "message",
			timestamp: `2026-04-24T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
			message: {
				role: "user",
				content: [{ type: "text", text: `old ${index + 1}` }],
			},
		}),
	);
	await writeFile(
		sessionFile,
		[
			"{bad json that should stay outside the recent scan",
			...oldMessages,
			"{bad json inside the scanned tail",
			JSON.stringify({
				type: "message",
				timestamp: "2026-04-24T01:00:00.000Z",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "usage anchor" }],
					stopReason: "stop",
					usage: { totalTokens: 4096 },
				},
			}),
			JSON.stringify({
				type: "message",
				timestamp: "2026-04-24T01:00:01.000Z",
				message: {
					role: "user",
					content: [{ type: "text", text: "recent question" }],
				},
			}),
			JSON.stringify({
				type: "message",
				timestamp: "2026-04-24T01:00:02.000Z",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "recent answer" }],
				},
			}),
		].join("\n"),
		"utf8",
	);
	const factory = createDefaultAgentSessionFactory({ projectRoot, sessionDir });

	const recent = await factory.readRecentSessionMessages?.(sessionFile, {
		limit: 2,
		includeContextUsageAnchor: true,
		chunkSizeBytes: 1024,
	});

	assert.equal(recent?.reachedStart, false);
	assert.equal(recent?.messageIndexOffset, 121);
	assert.deepEqual(
		recent?.messages.map((message) => message.content),
		[
			[{ type: "text", text: "recent question" }],
			[{ type: "text", text: "recent answer" }],
		],
	);
	assert.deepEqual(
		recent?.contextMessages.map((message) => message.content),
		[
			[{ type: "text", text: "usage anchor" }],
			[{ type: "text", text: "recent question" }],
			[{ type: "text", text: "recent answer" }],
		],
	);
});
