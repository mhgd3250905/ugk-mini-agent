import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultAgentProfiles, resolveAgentProfile } from "../src/agent/agent-profile.js";
import { ensureAgentProfileRuntime } from "../src/agent/agent-profile-bootstrap.js";

test("ensureAgentProfileRuntime creates private directories and default rules", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-agent-profile-"));
	const profile = resolveAgentProfile(createDefaultAgentProfiles(projectRoot), "search");
	assert.ok(profile);

	await ensureAgentProfileRuntime(profile);

	const content = await readFile(profile.runtimeAgentRulesPath, "utf8");
	assert.match(content, /# Search Agent/);
	assert.match(content, /默认使用简体中文交流/);
	assert.match(content, /不把猜测当事实/);
	assert.match(content, /系统技能目录和用户技能目录/);
	assert.match(content, /这不限制你的行动能力/);
	assert.match(content, /其他 agent 的上下文、技能、记忆和运行状态/);
	assert.match(content, /尊重用户已有改动/);
	assert.match(content, /Karpathy Guidelines/);
	assert.match(content, /These guidelines bias toward caution over speed/);
	assert.match(content, /Don't assume\. Don't hide confusion\. Surface tradeoffs\./);
	assert.match(content, /Minimum code that solves the problem\. Nothing speculative\./);
	assert.match(content, /Touch only what you must\. Clean up only your own mess\./);
	assert.match(content, /Every changed line should trace directly to the user's request/);
	assert.match(content, /Define success criteria\. Loop until verified\./);
	assert.match(content, /Write a test that reproduces it, then make it pass/);
	assert.match(content, /These guidelines are working if/);
	assert.match(content, /GET \/v1\/agents\/search\/debug\/skills/);
	assert.match(content, /当前搜索 Agent 没有加载技能/);
	assert.match(content, /禁止从主 Agent、项目文档、历史记忆、仓库目录名或你以为存在的技能列表中推断技能/);
	const systemSkills = await readdir(profile.allowedSkillPaths[0]!);
	const agentSkillOps = await readFile(join(profile.allowedSkillPaths[0]!, "agent-skill-ops", "SKILL.md"), "utf8");
	const agentRuntimeOps = await readFile(join(profile.allowedSkillPaths[0]!, "agent-runtime-ops", "SKILL.md"), "utf8");
	const agentFilesystemOps = await readFile(join(profile.allowedSkillPaths[0]!, "agent-filesystem-ops", "SKILL.md"), "utf8");
	assert.ok(systemSkills.includes("agent-skill-ops"));
	assert.ok(systemSkills.includes("agent-runtime-ops"));
	assert.ok(systemSkills.includes("agent-filesystem-ops"));
	assert.match(agentSkillOps, /name: agent-skill-ops/);
	assert.match(agentSkillOps, /pi\/skills/);
	assert.match(agentSkillOps, /user-skills/);
	assert.match(agentRuntimeOps, /name: agent-runtime-ops/);
	assert.match(agentRuntimeOps, /当前 agent 的真实运行时状态/);
	assert.match(agentFilesystemOps, /name: agent-filesystem-ops/);
	assert.match(agentFilesystemOps, /破坏性操作/);
	await writeFile(join(profile.sessionsDir, ".probe"), "ok", "utf8");
	await writeFile(join(profile.workspaceDir, ".probe"), "ok", "utf8");
	await writeFile(join(profile.allowedSkillPaths[0]!, ".probe"), "ok", "utf8");
	await writeFile(join(profile.allowedSkillPaths[1]!, ".probe"), "ok", "utf8");
});

test("ensureAgentProfileRuntime creates Team Task agent rules and preinstalls http-access", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-agent-profile-"));
	await mkdir(join(projectRoot, ".pi", "skills", "http-access"), { recursive: true });
	await writeFile(join(projectRoot, ".pi", "skills", "http-access", "SKILL.md"), "---\nname: http-access\n---\n", "utf8");
	const profiles = createDefaultAgentProfiles(projectRoot);
	const teamWorker = resolveAgentProfile(profiles, "team-worker");
	const teamChecker = resolveAgentProfile(profiles, "team-checker");
	const teamDispatcher = resolveAgentProfile(profiles, "team-dispatcher");
	assert.ok(teamWorker);
	assert.ok(teamChecker);
	assert.ok(teamDispatcher);

	await ensureAgentProfileRuntime(teamWorker);
	await ensureAgentProfileRuntime(teamChecker);
	await ensureAgentProfileRuntime(teamDispatcher);

	const workerRules = await readFile(teamWorker.runtimeAgentRulesPath, "utf8");
	const checkerRules = await readFile(teamChecker.runtimeAgentRulesPath, "utf8");
	const dispatcherRules = await readFile(teamDispatcher.runtimeAgentRulesPath, "utf8");
	assert.match(workerRules, /# Team Worker Agent/);
	assert.match(workerRules, /不替 checker 做验收裁决/);
	assert.match(workerRules, /http-access/);
	assert.match(checkerRules, /# Team Checker Agent/);
	assert.match(checkerRules, /独立验收 worker 输出/);
	assert.match(checkerRules, /JSON verdict/);
	assert.match(dispatcherRules, /# Team Dispatcher Agent/);
	assert.match(dispatcherRules, /Discovery Task/);
	assert.match(dispatcherRules, /JSON patch/);

	for (const profile of [teamWorker, teamChecker, teamDispatcher]) {
		const copied = await readFile(join(profile.allowedSkillPaths[0]!, "http-access", "SKILL.md"), "utf8");
		assert.match(copied, /name: http-access/);
	}
});

test("ensureAgentProfileRuntime does not overwrite Team Task agent http-access", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-agent-profile-"));
	await mkdir(join(projectRoot, ".pi", "skills", "http-access"), { recursive: true });
	await writeFile(join(projectRoot, ".pi", "skills", "http-access", "SKILL.md"), "---\nname: http-access\n---\n", "utf8");
	const teamChecker = resolveAgentProfile(createDefaultAgentProfiles(projectRoot), "team-checker");
	assert.ok(teamChecker);
	await ensureAgentProfileRuntime(teamChecker);
	const targetSkill = join(teamChecker.allowedSkillPaths[0]!, "http-access", "SKILL.md");
	await writeFile(targetSkill, "custom", "utf8");

	await ensureAgentProfileRuntime(teamChecker);

	assert.equal(await readFile(targetSkill, "utf8"), "custom");
});

test("ensureAgentProfileRuntime does not overwrite an existing rules file", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-agent-profile-"));
	const profile = resolveAgentProfile(createDefaultAgentProfiles(projectRoot), "search");
	assert.ok(profile);
	await ensureAgentProfileRuntime(profile);
	await writeFile(profile.runtimeAgentRulesPath, "custom rules", "utf8");

	await ensureAgentProfileRuntime(profile);

	assert.equal(await readFile(profile.runtimeAgentRulesPath, "utf8"), "custom rules");
});

test("ensureAgentProfileRuntime creates main runtime rules without using project AGENTS.md", async () => {
	const projectRoot = await mkdtemp(join(tmpdir(), "ugk-agent-profile-"));
	const profile = resolveAgentProfile(createDefaultAgentProfiles(projectRoot), "main");
	assert.ok(profile);
	await writeFile(join(projectRoot, "AGENTS.md"), "# Project Rules\n\nRepository maintenance only.\n", "utf8");

	await ensureAgentProfileRuntime(profile);

	const content = await readFile(profile.runtimeAgentRulesPath, "utf8");
	assert.match(content, /# Main Agent/);
	assert.match(content, /仓库根目录的项目维护 AGENTS\.md/);
	assert.match(content, /Karpathy Guidelines/);
	assert.match(content, /Don't assume\. Don't hide confusion\. Surface tradeoffs\./);
	assert.match(content, /Every changed line should trace directly to the user's request/);
	assert.doesNotMatch(content, /Repository maintenance only/);
});
