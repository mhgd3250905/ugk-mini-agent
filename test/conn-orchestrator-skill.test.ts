import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SKILL_PATH = ".pi/skills/conn-orchestrator/SKILL.md";

test("conn-orchestrator keeps browser configuration manual while allowing execution agent selection", async () => {
	const skill = await readFile(SKILL_PATH, "utf8");

	assert.match(skill, /profileId/);
	assert.match(skill, /GET \/v1\/agents/);
	assert.match(skill, /只影响后续 run/);
	assert.match(skill, /不影响正在运行中的任务/);
	assert.match(skill, /请确认是否执行/);
	assert.match(skill, /Conn 不再支持浏览器绑定配置/);
	assert.match(skill, /该能力已从当前版本移除/);
	assert.match(skill, /Playground 的 Conn 编辑界面手动设置/);
	assert.doesNotMatch(skill, /GET \/v1\/browsers/);
	assert.doesNotMatch(skill, /Browser Binding Change Request/);
	assert.doesNotMatch(skill, /browserId: null/);
});
