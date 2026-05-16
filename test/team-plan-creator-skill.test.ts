import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SKILL_PATH = join(import.meta.dirname, "../.pi/skills/team-plan-creator/SKILL.md");

async function readSkill(): Promise<string> {
	return readFile(SKILL_PATH, "utf8");
}

test("team-plan-creator skill does not contain positive steps to start a Run", async () => {
	const skill = await readSkill();
	// The skill should not contain instructions to create a run as a workflow step
	// It may reference the API path in prohibition context
	const positivePatterns = [
		/step.*:\s*.*create.*run/i,
		/step.*:\s*.*start.*run/i,
		/workflow.*step.*run/i,
	];
	for (const pattern of positivePatterns) {
		assert.doesNotMatch(skill, pattern, `skill should not contain positive run creation step matching ${pattern}`);
	}
});

test("team-plan-creator skill explicitly prohibits POST /v1/team/plans/:planId/runs", async () => {
	const skill = await readSkill();
	assert.match(skill, /POST\s+\/v1\/team\/plans\/:planId\/runs/);
	assert.match(skill, /MUST NOT|must not|禁止/);
});

test("team-plan-creator skill requires previewing Plan JSON before creation", async () => {
	const skill = await readSkill();
	assert.match(skill, /preview/i);
	assert.match(skill, /confirm/i);
});

test("team-plan-creator skill requires acceptance rules to be verifiable", async () => {
	const skill = await readSkill();
	assert.match(skill, /verifiable|可验证/);
	assert.match(skill, /acceptance/);
});

test("team-plan-creator skill requires asking user for goal and deliverable", async () => {
	const skill = await readSkill();
	assert.match(skill, /goal|目标/i);
	assert.match(skill, /deliverable|交付/);
	assert.match(skill, /ask|问/);
});

test("team-plan-creator skill requires checking existing resources before creating", async () => {
	const skill = await readSkill();
	assert.match(skill, /GET\s+\/v1\/team\/team-units/);
	assert.match(skill, /GET\s+\/v1\/team\/plans/);
	assert.match(skill, /existing|已有/);
});

test("team-plan-creator skill prefers reusing existing TeamUnit", async () => {
	const skill = await readSkill();
	assert.match(skill, /reuse|复用/);
});

test("team-plan-creator skill does not allow direct .data/team editing", async () => {
	const skill = await readSkill();
	assert.match(skill, /\.data\/team/);
	assert.match(skill, /MUST NOT|must not|禁止|do not|不允许/);
});

test("team-plan-creator skill requires explicit /team-plan activation keyword", async () => {
	const skill = await readSkill();
	assert.match(skill, /\/team-plan/);
	assert.match(skill, /MUST activate[\s\S]*\/team-plan/);
	assert.match(skill, /MUST NOT activate automatically/);
});

test("team-plan-creator skill does not auto-activate on casual team plan mentions", async () => {
	const skill = await readSkill();
	assert.match(skill, /merely mentions "team plan"/);
	assert.match(skill, /团队计划/);
	assert.match(skill, /ask whether they want to start with "\/team-plan"/);
});

test("team-plan-creator skill documents discovery task type", async () => {
	const skill = await readSkill();
	assert.match(skill, /discovery/);
	assert.match(skill, /outputKey/);
});

test("team-plan-creator skill documents for_each task type", async () => {
	const skill = await readSkill();
	assert.match(skill, /for_each/);
	assert.match(skill, /itemsFrom/);
	assert.match(skill, /taskTemplate/);
});

test("team-plan-creator skill documents template placeholders", async () => {
	const skill = await readSkill();
	assert.match(skill, /\{\{item\.id\}\}/);
	assert.match(skill, /\{\{item\.title\}\}/);
});

test("team-plan-creator skill documents sequential mode requirement", async () => {
	const skill = await readSkill();
	assert.match(skill, /sequential/);
});

test("team-plan-creator skill recommends discovery+for_each for unknown item counts", async () => {
	const skill = await readSkill();
	assert.match(skill, /not known at plan creation time|unknown.*number/i);
});

test("P16-T4: skill prohibits guessing static task counts for unknown item sets", async () => {
	const skill = await readSkill();
	assert.match(skill, /do not guess|must not guess|禁止猜测|不要猜测/i);
});

test("P16-T4: skill requires discovery output to contain stable item ids", async () => {
	const skill = await readSkill();
	assert.match(skill, /stable.*id|stable.*non-empty.*id/i);
});

test("P16-T4: skill dynamic example is generic not domain-specific", async () => {
	const skill = await readSkill();
	assert.doesNotMatch(skill, /乔峰|Qiao Feng|qiaofeng/i);
});
