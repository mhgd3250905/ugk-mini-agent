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
	const teamWorker = resolveAgentProfile(profiles, "team-worker");
	const teamChecker = resolveAgentProfile(profiles, "team-checker");
	const teamDispatcher = resolveAgentProfile(profiles, "team-dispatcher");

	assert.ok(main);
	assert.ok(search);
	assert.ok(teamWorker);
	assert.ok(teamChecker);
	assert.ok(teamDispatcher);

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

	assert.equal(teamWorker.dataDir, join(projectRoot, ".data", "agents", "team-worker"));
	assert.equal(teamWorker.sessionsDir, join(projectRoot, ".data", "agents", "team-worker", "sessions"));
	assert.equal(teamWorker.conversationIndexPath, join(projectRoot, ".data", "agents", "team-worker", "conversation-index.json"));
	assert.equal(teamWorker.agentDir, join(projectRoot, ".data", "agents", "team-worker", "pi-agent"));
	assert.equal(teamWorker.runtimeAgentRulesPath, join(projectRoot, ".data", "agents", "team-worker", "AGENTS.md"));
	assert.deepEqual(teamWorker.allowedSkillPaths, [
		join(projectRoot, ".data", "agents", "team-worker", "pi", "skills"),
		join(projectRoot, ".data", "agents", "team-worker", "user-skills"),
	]);
	assert.equal(teamChecker.runtimeAgentRulesPath, join(projectRoot, ".data", "agents", "team-checker", "AGENTS.md"));
	assert.deepEqual(teamDispatcher.allowedSkillPaths, [
		join(projectRoot, ".data", "agents", "team-dispatcher", "pi", "skills"),
		join(projectRoot, ".data", "agents", "team-dispatcher", "user-skills"),
	]);
});

test("resolveAgentProfile rejects unknown or malformed agent ids", () => {
	const profiles = createDefaultAgentProfiles("E:/AII/ugk-pi");

	assert.equal(resolveAgentProfile(profiles, "missing"), undefined);
	assert.equal(resolveAgentProfile(profiles, ""), undefined);
	assert.equal(resolveAgentProfile(profiles, "../main"), undefined);
});

test("custom summaries can override built-in team agent display text", () => {
	const projectRoot = "E:/AII/ugk-pi";
	const profiles = createDefaultAgentProfiles(projectRoot, [
		{ agentId: "team-worker", name: "自定义执行 Agent", description: "自定义执行说明。" },
	]);
	const teamWorker = resolveAgentProfile(profiles, "team-worker");

	assert.ok(teamWorker);
	assert.equal(teamWorker.name, "自定义执行 Agent");
	assert.equal(teamWorker.description, "自定义执行说明。");
});
