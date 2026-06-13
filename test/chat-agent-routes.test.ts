import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildServer } from "../src/server.js";
import { AgentServiceRegistry } from "../src/agent/agent-service-registry.js";
import { createDefaultAgentProfiles } from "../src/agent/agent-profile.js";
import type { AgentService } from "../src/agent/agent-service.js";

function createScopedAgentService(agentId: string, running = false): AgentService {
	return {
		getAgentRunStatus: () =>
			running
				? {
						agentId,
						status: "busy",
						activeConversationId: `manual:${agentId}`,
						activeSince: new Date(0).toISOString(),
					}
				: {
						agentId,
						status: "idle",
					},
		getAvailableSkills: async () => ({
			skills: [{ name: `${agentId}-skill` }],
			source: "fresh",
			cachedAt: new Date(0).toISOString(),
		}),
		getConversationCatalog: async () => ({
			currentConversationId: `manual:${agentId}`,
			conversations: [
				{
					conversationId: `manual:${agentId}`,
					title: `${agentId} title`,
					preview: `${agentId} preview`,
					messageCount: 0,
					createdAt: new Date(0).toISOString(),
					updatedAt: new Date(0).toISOString(),
					running,
				},
			],
		}),
		createConversation: async () => ({
			conversationId: `manual:${agentId}:new`,
			currentConversationId: `manual:${agentId}:new`,
			created: true,
		}),
	} as AgentService;
}

function createTestRegistry(): AgentServiceRegistry<AgentService> {
	return new AgentServiceRegistry({
		profiles: createDefaultAgentProfiles("E:/AII/ugk-pi"),
		createService: (profile) => createScopedAgentService(profile.agentId),
	});
}

function createTestRegistryForRoot(projectRoot: string, runningAgents = new Set<string>()): AgentServiceRegistry<AgentService> {
	return new AgentServiceRegistry({
		profiles: createDefaultAgentProfiles(projectRoot),
		createService: (profile) => createScopedAgentService(profile.agentId, runningAgents.has(profile.agentId)),
	});
}

test("agent-scoped debug skills use the requested agent service", async () => {
	const app = await buildServer({
		agentService: createScopedAgentService("main"),
		agentServiceRegistry: createTestRegistry(),
	});

	const legacyResponse = await app.inject({
		method: "GET",
		url: "/v1/debug/skills",
	});
	const searchResponse = await app.inject({
		method: "GET",
		url: "/v1/agents/search/debug/skills",
	});

	assert.equal(legacyResponse.statusCode, 200);
	assert.equal(searchResponse.statusCode, 200);
	assert.deepEqual(legacyResponse.json().skills, [{ name: "main-skill" }]);
	assert.deepEqual(searchResponse.json().skills, [{ name: "search-skill" }]);
});

test("GET /v1/agents/:agentId/rules reads the main runtime AGENTS.md", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-agent-route-"));
	const mainProfile = createDefaultAgentProfiles(projectRoot).find((profile) => profile.agentId === "main");
	assert.ok(mainProfile);
	await mkdir(dirname(mainProfile.runtimeAgentRulesPath), { recursive: true });
	await writeFile(join(projectRoot, "AGENTS.md"), "# Project rules\n\nDo not expose through main agent rules.\n", "utf8");
	await writeFile(mainProfile.runtimeAgentRulesPath, "# Main runtime rules\n\nAlways verify.\n", "utf8");
	const app = await buildServer({
		agentService: createScopedAgentService("main"),
		agentServiceRegistry: createTestRegistryForRoot(projectRoot),
		agentProfileProjectRoot: projectRoot,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/agents/main/rules",
	});

	assert.equal(response.statusCode, 200);
	assert.equal(response.json().agentId, "main");
	assert.equal(response.json().fileName, "AGENTS.md");
	assert.equal(response.json().exists, true);
	assert.equal(response.json().path, mainProfile.runtimeAgentRulesPath);
	assert.match(response.json().content, /Always verify/);
	assert.doesNotMatch(response.json().content, /Project rules/);
});

test("GET /v1/agents/:agentId/rules reads a custom agent AGENTS.md", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-agent-route-"));
	const searchProfile = createDefaultAgentProfiles(projectRoot).find((profile) => profile.agentId === "search");
	assert.ok(searchProfile);
	await mkdir(dirname(searchProfile.runtimeAgentRulesPath), { recursive: true });
	await writeFile(searchProfile.runtimeAgentRulesPath, "# Search rules\n\nUse scoped skills only.\n", "utf8");
	const app = await buildServer({
		agentService: createScopedAgentService("main"),
		agentServiceRegistry: createTestRegistryForRoot(projectRoot),
		agentProfileProjectRoot: projectRoot,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/agents/search/rules",
	});

	assert.equal(response.statusCode, 200);
	assert.equal(response.json().agentId, "search");
	assert.equal(response.json().exists, true);
	assert.match(response.json().content, /Use scoped skills only/);
});

test("GET /playground/agents/:agentId/rules opens the runtime AGENTS.md as Markdown", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-agent-route-"));
	const searchProfile = createDefaultAgentProfiles(projectRoot).find((profile) => profile.agentId === "search");
	assert.ok(searchProfile);
	await mkdir(dirname(searchProfile.runtimeAgentRulesPath), { recursive: true });
	await writeFile(join(projectRoot, "AGENTS.md"), "# Project rules\n\nDo not expose through standalone rules link.\n", "utf8");
	await writeFile(searchProfile.runtimeAgentRulesPath, "# Search rules\n\nUse scoped skills only.\n", "utf8");
	const app = await buildServer({
		agentService: createScopedAgentService("main"),
		agentServiceRegistry: createTestRegistryForRoot(projectRoot),
		agentProfileProjectRoot: projectRoot,
	});

	const response = await app.inject({
		method: "GET",
		url: "/playground/agents/search/rules",
	});

	assert.equal(response.statusCode, 200);
	assert.match(response.headers["content-type"] as string, /text\/markdown/);
	assert.match(response.body, /Use scoped skills only/);
	assert.doesNotMatch(response.body, /Project rules/);
});

test("PATCH /v1/agents/:agentId/rules saves a custom agent AGENTS.md", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-agent-route-"));
	const searchProfile = createDefaultAgentProfiles(projectRoot).find((profile) => profile.agentId === "search");
	assert.ok(searchProfile);
	const app = await buildServer({
		agentService: createScopedAgentService("main"),
		agentServiceRegistry: createTestRegistryForRoot(projectRoot),
		agentProfileProjectRoot: projectRoot,
	});

	const response = await app.inject({
		method: "PATCH",
		url: "/v1/agents/search/rules",
		payload: {
			content: "# Updated search rules\n\nOnly use scoped skills.\n",
		},
	});
	const written = await readFile(searchProfile.runtimeAgentRulesPath, "utf8");

	assert.equal(response.statusCode, 200);
	assert.equal(response.json().agentId, "search");
	assert.equal(response.json().exists, true);
	assert.equal(response.json().content, "# Updated search rules\n\nOnly use scoped skills.\n");
	assert.equal(written, "# Updated search rules\n\nOnly use scoped skills.\n");
});

test("unknown agent-scoped routes do not fall back to main", async () => {
	const app = await buildServer({
		agentService: createScopedAgentService("main"),
		agentServiceRegistry: createTestRegistry(),
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/agents/missing/debug/skills",
	});

	assert.equal(response.statusCode, 404);
	assert.match(response.json().error.message, /missing/);
});

test("agent-scoped conversations are served from the requested agent service", async () => {
	const app = await buildServer({
		agentService: createScopedAgentService("main"),
		agentServiceRegistry: createTestRegistry(),
	});

	const searchCatalog = await app.inject({
		method: "GET",
		url: "/v1/agents/search/chat/conversations",
	});
	const created = await app.inject({
		method: "POST",
		url: "/v1/agents/search/chat/conversations",
	});

	assert.equal(searchCatalog.statusCode, 200);
	assert.equal(searchCatalog.json().currentConversationId, "manual:search");
	assert.equal(created.statusCode, 200);
	assert.equal(created.json().conversationId, "manual:search:new");
});

test("GET /v1/agents/status returns all agent run statuses", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-agent-route-"));
	const app = await buildServer({
		agentService: createScopedAgentService("main"),
		agentServiceRegistry: createTestRegistryForRoot(projectRoot, new Set(["search"])),
		agentProfileProjectRoot: projectRoot,
	});

	const response = await app.inject({
		method: "GET",
		url: "/v1/agents/status",
	});

	assert.equal(response.statusCode, 200);
	assert.deepEqual(
		response.json().agents.map((agent: { agentId: string; status: string }) => ({
			agentId: agent.agentId,
			status: agent.status,
		})),
		[
			{ agentId: "main", status: "idle" },
			{ agentId: "search", status: "idle" },
		],
	);

	await app.inject({
		method: "GET",
		url: "/v1/agents/search/debug/skills",
	});
	const afterSearchCreated = await app.inject({
		method: "GET",
		url: "/v1/agents/status",
	});
	const searchStatus = afterSearchCreated
		.json()
		.agents.find((agent: { agentId: string }) => agent.agentId === "search");
	assert.equal(searchStatus.status, "busy");
	assert.equal(searchStatus.activeConversationId, "manual:search");
});

test("POST /v1/agents creates a persisted custom agent profile", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-agent-route-"));
	const registry = createTestRegistryForRoot(projectRoot);
	const app = await buildServer({
		agentService: createScopedAgentService("main"),
		agentServiceRegistry: registry,
		agentProfileProjectRoot: projectRoot,
	});

	const created = await app.inject({
		method: "POST",
		url: "/v1/agents",
		payload: {
			agentId: "research",
			name: "研究 Agent",
			description: "用于资料研究。",
		},
	});
	const listed = await app.inject({
		method: "GET",
		url: "/v1/agents",
	});

	assert.equal(created.statusCode, 200);
	assert.equal(created.json().agent.agentId, "research");
	assert.ok(listed.json().agents.some((agent: { agentId: string }) => agent.agentId === "research"));
});

test("POST /v1/agents copies requested initial system skills from main agent", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-agent-route-"));
	await mkdir(join(projectRoot, ".pi", "skills", "web-access"), { recursive: true });
	await writeFile(join(projectRoot, ".pi", "skills", "web-access", "SKILL.md"), "# web-access\n", "utf8");
	const registry = createTestRegistryForRoot(projectRoot);
	const app = await buildServer({
		agentService: createScopedAgentService("main"),
		agentServiceRegistry: registry,
		agentProfileProjectRoot: projectRoot,
	});

	const created = await app.inject({
		method: "POST",
		url: "/v1/agents",
		payload: {
			agentId: "research",
			name: "研究 Agent",
			description: "用于资料研究。",
			initialSystemSkillNames: ["web-access"],
		},
	});
	const copied = await readFile(
		join(projectRoot, ".data", "agents", "research", "pi", "skills", "web-access", "SKILL.md"),
		"utf8",
	);

	assert.equal(created.statusCode, 200);
	assert.equal(copied, "# web-access\n");
});

test("PATCH /v1/agents/:agentId updates a custom agent profile summary", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-agent-route-"));
	const registry = createTestRegistryForRoot(projectRoot);
	const app = await buildServer({
		agentService: createScopedAgentService("main"),
		agentServiceRegistry: registry,
		agentProfileProjectRoot: projectRoot,
	});
	await app.inject({
		method: "POST",
		url: "/v1/agents",
		payload: {
			agentId: "research",
			name: "研究 Agent",
			description: "用于资料研究。",
		},
	});

	const updated = await app.inject({
		method: "PATCH",
		url: "/v1/agents/research",
		payload: {
			name: "资料 Agent",
			description: "用于资料查证和整理。",
		},
	});
	const listed = await app.inject({
		method: "GET",
		url: "/v1/agents",
	});

	assert.equal(updated.statusCode, 200);
	assert.deepEqual(updated.json().agent, {
		agentId: "research",
		name: "资料 Agent",
		description: "用于资料查证和整理。",
	});
	assert.ok(
		listed
			.json()
			.agents.some(
				(agent: { agentId: string; name: string; description: string }) =>
					agent.agentId === "research" &&
					agent.name === "资料 Agent" &&
					agent.description === "用于资料查证和整理。",
			),
	);
});

test("agent profile mutations invalidate background agent templates", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-agent-route-"));
	await mkdir(join(projectRoot, ".pi", "skills", "web-access"), { recursive: true });
	await writeFile(join(projectRoot, ".pi", "skills", "web-access", "SKILL.md"), "# web-access\n", "utf8");
	const registry = createTestRegistryForRoot(projectRoot);
	const invalidated: Array<string | undefined> = [];
	const app = await buildServer({
		agentService: createScopedAgentService("main"),
		agentServiceRegistry: registry,
		agentProfileProjectRoot: projectRoot,
		agentTemplateRegistry: {
			invalidate(profileId?: string) {
				invalidated.push(profileId);
			},
		} as never,
	});

	await app.inject({
		method: "POST",
		url: "/v1/agents",
		payload: {
			agentId: "research",
			name: "研究 Agent",
			description: "用于资料研究。",
		},
	});
	await app.inject({
		method: "PATCH",
		url: "/v1/agents/research",
		payload: {
			name: "资料 Agent",
		},
	});
	await app.inject({
		method: "POST",
		url: "/v1/agents/research/skills",
		payload: {
			skillName: "web-access",
		},
	});
	await app.inject({
		method: "DELETE",
		url: "/v1/agents/research/skills/web-access",
	});
	await app.inject({
		method: "PATCH",
		url: "/v1/agents/research/rules",
		payload: {
			content: "# Research rules\n",
		},
	});

	assert.deepEqual(invalidated, ["research", "research", "research", "research", "research"]);
});

test("POST and DELETE /v1/agents/:agentId/skills manage custom agent skill copies", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-agent-route-"));
	await mkdir(join(projectRoot, ".pi", "skills", "web-access"), { recursive: true });
	await writeFile(join(projectRoot, ".pi", "skills", "web-access", "SKILL.md"), "# web-access\n", "utf8");
	const registry = createTestRegistryForRoot(projectRoot);
	const app = await buildServer({
		agentService: createScopedAgentService("main"),
		agentServiceRegistry: registry,
		agentProfileProjectRoot: projectRoot,
	});
	await app.inject({
		method: "POST",
		url: "/v1/agents",
		payload: {
			agentId: "research",
			name: "研究 Agent",
			description: "用于资料研究。",
		},
	});

	const installed = await app.inject({
		method: "POST",
		url: "/v1/agents/research/skills",
		payload: {
			skillName: "web-access",
		},
	});
	const copied = await readFile(
		join(projectRoot, ".data", "agents", "research", "user-skills", "web-access", "SKILL.md"),
		"utf8",
	);
	const removed = await app.inject({
		method: "DELETE",
		url: "/v1/agents/research/skills/web-access",
	});

	assert.equal(installed.statusCode, 200);
	assert.equal(installed.json().agentId, "research");
	assert.equal(installed.json().skillName, "web-access");
	assert.equal(copied, "# web-access\n");
	assert.equal(removed.statusCode, 200);
	assert.equal(removed.json().removed, true);
});

test("POST /v1/agents/:agentId/skills/:skillName/refresh overwrites a custom agent skill from main", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-agent-route-"));
	const mainSkillDir = join(projectRoot, ".pi", "skills", "web-access");
	await mkdir(mainSkillDir, { recursive: true });
	await writeFile(join(mainSkillDir, "SKILL.md"), "# web-access v1\n", "utf8");
	const registry = createTestRegistryForRoot(projectRoot);
	const app = await buildServer({
		agentService: createScopedAgentService("main"),
		agentServiceRegistry: registry,
		agentProfileProjectRoot: projectRoot,
	});
	await app.inject({
		method: "POST",
		url: "/v1/agents",
		payload: {
			agentId: "research",
			name: "研究 Agent",
			description: "用于资料研究。",
		},
	});
	await app.inject({
		method: "POST",
		url: "/v1/agents/research/skills",
		payload: {
			skillName: "web-access",
		},
	});
	const copiedSkillDir = join(projectRoot, ".data", "agents", "research", "user-skills", "web-access");
	await writeFile(join(mainSkillDir, "SKILL.md"), "# web-access v2\n", "utf8");
	await writeFile(join(copiedSkillDir, "stale.txt"), "old", "utf8");

	const refreshed = await app.inject({
		method: "POST",
		url: "/v1/agents/research/skills/web-access/refresh",
	});

	assert.equal(refreshed.statusCode, 200);
	assert.equal(refreshed.json().agentId, "research");
	assert.equal(refreshed.json().skillName, "web-access");
	assert.equal(await readFile(join(copiedSkillDir, "SKILL.md"), "utf8"), "# web-access v2\n");
	await assert.rejects(() => readFile(join(copiedSkillDir, "stale.txt"), "utf8"), /ENOENT/);
});

test("agent skill management rejects main and missing main skills", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-agent-route-"));
	const registry = createTestRegistryForRoot(projectRoot);
	const app = await buildServer({
		agentService: createScopedAgentService("main"),
		agentServiceRegistry: registry,
		agentProfileProjectRoot: projectRoot,
	});
	await app.inject({
		method: "POST",
		url: "/v1/agents",
		payload: {
			agentId: "research",
			name: "研究 Agent",
			description: "用于资料研究。",
		},
	});

	const missing = await app.inject({
		method: "POST",
		url: "/v1/agents/research/skills",
		payload: {
			skillName: "missing-skill",
		},
	});
	const main = await app.inject({
		method: "POST",
		url: "/v1/agents/main/skills",
		payload: {
			skillName: "missing-skill",
		},
	});

	assert.equal(missing.statusCode, 400);
	assert.match(missing.json().error.message, /main agent does not have skill missing-skill/);
	assert.equal(main.statusCode, 400);
	assert.match(main.json().error.message, /main agent skills cannot be managed/);
});

test("POST /v1/agents/:agentId/archive rejects main and running agents", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-pi-agent-route-"));
	const runningRegistry = createTestRegistryForRoot(projectRoot, new Set(["search"]));
	const app = await buildServer({
		agentService: createScopedAgentService("main"),
		agentServiceRegistry: runningRegistry,
		agentProfileProjectRoot: projectRoot,
	});

	const main = await app.inject({
		method: "POST",
		url: "/v1/agents/main/archive",
	});
	const search = await app.inject({
		method: "POST",
		url: "/v1/agents/search/archive",
	});

	assert.equal(main.statusCode, 400);
	assert.equal(search.statusCode, 409);
});
