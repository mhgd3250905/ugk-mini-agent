import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
	createDefaultAgentProfiles,
	resolveAgentProfile,
} from "../src/agent/agent-profile.js";

test("default agent profiles keep main on legacy paths and isolate search paths", () => {
	const projectRoot = "E:/AII/ugk-pi";
	const profiles = createDefaultAgentProfiles(projectRoot);
	const main = resolveAgentProfile(profiles, "main");
	const search = resolveAgentProfile(profiles, "search");

	assert.ok(main);
	assert.ok(search);

	assert.equal(main.dataDir, join(projectRoot, ".data", "agent"));
	assert.equal(main.sessionsDir, join(projectRoot, ".data", "agent", "sessions"));
	assert.equal(main.conversationIndexPath, join(projectRoot, ".data", "agent", "conversation-index.json"));
	assert.equal(main.runtimeAgentRulesPath, join(projectRoot, ".data", "agent", "AGENTS.md"));
	assert.equal(main.mcpCatalogPath, join(projectRoot, ".data", "agent", "mcp", "servers.json"));
	assert.deepEqual(main.allowedSkillPaths, [
		join(projectRoot, ".pi", "skills"),
		join(projectRoot, "runtime", "skills-user"),
	]);

	assert.equal(search.dataDir, join(projectRoot, ".data", "agents", "search"));
	assert.equal(search.sessionsDir, join(projectRoot, ".data", "agents", "search", "sessions"));
	assert.equal(search.conversationIndexPath, join(projectRoot, ".data", "agents", "search", "conversation-index.json"));
	assert.equal(search.agentDir, join(projectRoot, ".data", "agents", "search", "pi-agent"));
	assert.equal(search.runtimeAgentRulesPath, join(projectRoot, ".data", "agents", "search", "AGENTS.md"));
	assert.equal(search.mcpCatalogPath, join(projectRoot, ".data", "agents", "search", "mcp", "servers.json"));
	assert.equal(search.workspaceDir, join(projectRoot, ".data", "agents", "search", "workspace"));
	assert.deepEqual(search.allowedSkillPaths, [
		join(projectRoot, ".data", "agents", "search", "pi", "skills"),
		join(projectRoot, ".data", "agents", "search", "user-skills"),
	]);

	assert.notEqual(search.sessionsDir, main.sessionsDir);
	assert.notEqual(search.conversationIndexPath, main.conversationIndexPath);
	assert.notEqual(search.agentDir, main.agentDir);
	assert.notEqual(search.runtimeAgentRulesPath, main.runtimeAgentRulesPath);
	assert.ok(!search.allowedSkillPaths.includes(join(projectRoot, ".pi", "skills")));
	assert.ok(!search.allowedSkillPaths.includes(join(projectRoot, "runtime", "skills-user")));
});

test("resolveAgentProfile rejects unknown or malformed agent ids", () => {
	const profiles = createDefaultAgentProfiles("E:/AII/ugk-pi");

	assert.equal(resolveAgentProfile(profiles, "missing"), undefined);
	assert.equal(resolveAgentProfile(profiles, ""), undefined);
	assert.equal(resolveAgentProfile(profiles, "../main"), undefined);
});
