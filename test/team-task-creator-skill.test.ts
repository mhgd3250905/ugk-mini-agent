import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SKILL_PATH = join(import.meta.dirname, "../.pi/skills/team-task-creator/SKILL.md");

async function readSkill(): Promise<string> {
	return readFile(SKILL_PATH, "utf8");
}

test("team-task-creator skill requires explicit /team-task activation keyword", async () => {
	const skill = await readSkill();
	assert.match(skill, /\/team-task/);
	assert.match(skill, /MUST activate[\s\S]*\/team-task/);
	assert.match(skill, /MUST NOT activate automatically/);
	assert.match(skill, /可以用 `\/team-task/);
});

test("team-task-creator skill requires checking Agent catalog before choosing roles", async () => {
	const skill = await readSkill();
	assert.match(skill, /GET\s+\/v1\/agents/);
	assert.match(skill, /leaderAgentId/);
	assert.match(skill, /workerAgentId/);
	assert.match(skill, /checkerAgentId/);
	assert.match(skill, /current.*Agent|当前.*Agent/i);
});

test("team-task-creator skill previews full Task JSON and waits for user confirmation", async () => {
	const skill = await readSkill();
	assert.match(skill, /full Task JSON|完整 Task JSON|完整的 Task JSON/i);
	assert.match(skill, /preview|预览/i);
	assert.match(skill, /confirm|确认/i);
	assert.match(skill, /before calling|before.*API|先.*确认/i);
});

test("team-task-creator skill documents Task create and update APIs", async () => {
	const skill = await readSkill();
	assert.match(skill, /POST\s+\/v1\/team\/tasks/);
	assert.match(skill, /PATCH\s+\/v1\/team\/tasks\/:taskId/);
	assert.match(skill, /GET\s+\/v1\/team\/tasks/);
	assert.match(skill, /GET\s+\/v1\/team\/tasks\/:taskId/);
});

test("team-task-creator skill prohibits runs, direct .data writes, and Agent profile changes", async () => {
	const skill = await readSkill();
	assert.match(skill, /MUST NOT|must not|禁止|不得/);
	assert.match(skill, /POST\s+\/v1\/team\/plans\/:planId\/runs/);
	assert.match(skill, /\.data\/team/);
	assert.match(skill, /Agent profile|agent profile/);
	assert.match(skill, /model|browser binding|技能安装|install/i);
});

test("team-task-creator skill defines Task as canvas node containing one WorkUnit", async () => {
	const skill = await readSkill();
	assert.match(skill, /Task[\s\S]*canvas|画布/);
	assert.match(skill, /Task[\s\S]*WorkUnit|WorkUnit[\s\S]*Task/);
	assert.match(skill, /Plan tasks\.length === 1|single-task Plan|单任务 Plan/);
});

test("team-task-creator skill warns that same worker and checker weakens independent acceptance", async () => {
	const skill = await readSkill();
	assert.match(skill, /workerAgentId === checkerAgentId|worker.*checker.*same|同 Agent 自检/);
	assert.match(skill, /削弱验收独立性|weakens independent acceptance/);
});
