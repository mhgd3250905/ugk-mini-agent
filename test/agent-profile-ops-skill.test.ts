import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import { loadDefaultNativeEnv } from "../src/native-default-env.js";

const SKILL_PATH = ".pi/skills/agent-profile-ops/SKILL.md";
const SCRIPT_PATH = ".pi/skills/agent-profile-ops/scripts/agent_profile_ops.mjs";
const execFileAsync = promisify(execFile);

test("agent-profile-ops forbids manual profile catalog edits", async () => {
	const skill = await readFile(SKILL_PATH, "utf8");

	assert.match(skill, /禁止直接编辑 `\.data\/agents\/profiles\.json`/);
	assert.match(skill, /POST \/v1\/agents/);
	assert.match(skill, /GET \/v1\/agents/);
	assert.match(skill, /AgentServiceRegistry/);
	assert.match(skill, /磁盘 catalog 与运行时 registry 分裂/);
});

test("agent-profile-ops requires API routes for profile mutations", async () => {
	const skill = await readFile(SKILL_PATH, "utf8");

	assert.match(skill, /创建走 `POST \/v1\/agents`/);
	assert.match(skill, /归档走 `POST \/v1\/agents\/:agentId\/archive`/);
	assert.match(skill, /技能变更走对应 skills API/);
	assert.doesNotMatch(skill, /手动写入 profiles\.json/);
});

test("agent-profile-ops documents explicit Playground agent switching without text matching", async () => {
	const skill = await readFile(SKILL_PATH, "utf8");

	assert.match(skill, /window\.ugkPlaygroundAgentOps\.switchAgent/);
	assert.match(skill, /listAgents\(\)/);
	assert.match(skill, /getCurrentAgentId\(\)/);
	assert.match(skill, /不要实现“切换\/切到\/进入 \+ 名称”的文本匹配拦截/);
	assert.match(skill, /不要写前端自然语言关键词匹配/);
});

test("agent-profile-ops documents unified dispatch for profiles and legacy subagents", async () => {
	const skill = await readFile(SKILL_PATH, "utf8");

	assert.match(skill, /agent_profile_ops\.mjs dispatch --agent <agent> --message <task>/);
	assert.match(skill, /agentProfiles/);
	assert.match(skill, /legacySubagents/);
	assert.match(skill, /POST \/v1\/agents\/:agentId\/chat/);
	assert.match(skill, /search-engine 不是 subagent，所以不能派发/);
	assert.match(skill, /统一 dispatch 作为 agent profile 代办任务/);
});

test("agent-profile-ops keeps browser configuration out of agent-visible operations", async () => {
	const skill = await readFile(SKILL_PATH, "utf8");
	const script = await readFile(SCRIPT_PATH, "utf8");

	assert.match(skill, /浏览器配置只允许用户在 Playground UI 中手动设置/);
	assert.match(skill, /不得查询浏览器清单/);
	assert.doesNotMatch(skill, /GET \/v1\/browsers/);
	assert.doesNotMatch(skill, /defaultBrowserId/);
	assert.doesNotMatch(skill, /Browser Binding Change Request/);
	assert.doesNotMatch(script, /set-browser/);
	assert.doesNotMatch(script, /clear-browser/);
	assert.doesNotMatch(script, /\/v1\/browsers/);
});

test("agent profile ops dispatch dry-run resolves agent profiles before legacy subagents", async () => {
	const { stdout } = await execFileAsync(
		process.execPath,
		[
			SCRIPT_PATH,
			"dispatch",
			"--agent",
			"search-engine",
			"--message",
			"搜索 medtrum",
			"--dry-run",
			"--agents-json",
			JSON.stringify({
				agents: [
					{ agentId: "search-engine", name: "搜索引擎", description: "专职搜索" },
				],
			}),
			"--legacy-json",
			JSON.stringify([{ agentId: "search-engine", name: "legacy search-engine" }]),
		],
		{
			cwd: process.cwd(),
			windowsHide: true,
		},
	);
	const payload = JSON.parse(stdout);

	assert.equal(payload.targetType, "agent-profile");
	assert.equal(payload.targetId, "search-engine");
	assert.equal(payload.endpoint, "POST /v1/agents/:agentId/chat");
	assert.equal(payload.payload.message, "搜索 medtrum");
});

test("agent profile ops dispatch dry-run resolves legacy subagents explicitly", async () => {
	const { stdout } = await execFileAsync(
		process.execPath,
		[
			SCRIPT_PATH,
			"dispatch",
			"--agent",
			"scout",
			"--message",
			"检查这个实现",
			"--dry-run",
			"--agents-json",
			JSON.stringify({ agents: [] }),
			"--legacy-json",
			JSON.stringify([{ agentId: "scout", name: "scout", description: "read-only explorer" }]),
		],
		{
			cwd: process.cwd(),
			windowsHide: true,
		},
	);
	const payload = JSON.parse(stdout);

	assert.equal(payload.targetType, "legacy-subagent");
	assert.equal(payload.targetId, "scout");
	assert.equal(payload.status, "dry-run");
});

test("agent profile ops current command falls back to the native default public base URL", async () => {
	const { stdout } = await execFileAsync(process.execPath, [SCRIPT_PATH, "current"], {
		cwd: process.cwd(),
		windowsHide: true,
		env: {
			...process.env,
			PORT: "",
			PUBLIC_BASE_URL: "",
			UGK_INTERNAL_BASE_URL: "",
		},
	});
	const payload = JSON.parse(stdout) as { baseUrl: string };

	assert.equal(payload.baseUrl, loadDefaultNativeEnv().PUBLIC_BASE_URL);
});
