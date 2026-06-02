import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SKILL_PATH = join(import.meta.dirname, "../.pi/skills/team-task-creator/SKILL.md");

async function readSkill(): Promise<string> {
	return readFile(SKILL_PATH, "utf8");
}

function readFrontmatter(skill: string): Record<string, string> {
	const match = /^---\n([\s\S]*?)\n---/.exec(skill);
	assert.ok(match, "skill must start with YAML frontmatter");
	const result: Record<string, string> = {};
	for (const line of match[1]!.split("\n")) {
		const separatorIndex = line.indexOf(":");
		assert.notEqual(separatorIndex, -1, `frontmatter line must be key: value: ${line}`);
		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();
		result[key] = value;
	}
	return result;
}

test("team-task-creator skill follows skill-creator frontmatter guidance", async () => {
	const skill = await readSkill();
	const frontmatter = readFrontmatter(skill);
	assert.deepEqual(Object.keys(frontmatter).sort(), ["description", "name"]);
	assert.equal(frontmatter.name, "team-task-creator");
	assert.ok(frontmatter.description);
	assert.ok(frontmatter.description!.length <= 1024);
	assert.match(frontmatter.description!, /design advisor|设计向导|创建向导/i);
	assert.match(frontmatter.description!, /\/team-task/);
	assert.match(frontmatter.description!, /natural-language|自然语言|plain-language/i);
	assert.match(frontmatter.description!, /Discovery|multi-platform|multi-source|多平台|多来源/i);
	assert.match(frontmatter.description!, /do not use|Do not use|不要用于/i);
});

test("team-task-creator skill keeps core instructions in one concise SKILL body", async () => {
	const skill = await readSkill();
	const lineCount = skill.split(/\r?\n/).length;
	assert.ok(lineCount < 500, `expected skill to stay under 500 lines, got ${lineCount}`);
	assert.doesNotMatch(skill, /README\.md|INSTALLATION_GUIDE|QUICK_REFERENCE|CHANGELOG/i);
	assert.match(skill, /Guided Task Design Advisor/);
	assert.match(skill, /Workflow/);
	assert.match(skill, /Verification/);
});

test("team-task-creator skill activates for explicit natural-language Task creation intent", async () => {
	const skill = await readSkill();
	assert.match(skill, /\/team-task/);
	assert.match(skill, /MUST activate[\s\S]*(create|创建|update|更新)[\s\S]*(Team Console Task|Task|WorkUnit)/i);
	assert.match(skill, /natural-language|自然语言/i);
	assert.match(skill, /MUST NOT activate[\s\S]*(run|运行|progress|状态|观察|debug|调试)/i);
	assert.match(skill, /可以用 `\/team-task/);
});

test("team-task-creator skill requires typed Task ports in every preview", async () => {
	const skill = await readSkill();
	assert.match(skill, /inputPorts/);
	assert.match(skill, /outputPorts/);
	assert.match(skill, /typed ports|类型化端口|IN\/OUT/i);
	assert.match(skill, /empty array|\[\]|空数组/i);
	assert.match(skill, /md|markdown/i);
	assert.match(skill, /html/i);
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
	assert.match(skill, /inputPorts[\s\S]*outputPorts|outputPorts[\s\S]*inputPorts/);
});

test("team-task-creator skill supports template Task creation with fillable parameters", async () => {
	const skill = await readSkill();
	assert.match(skill, /template Task|模板 Task|模板任务/i);
	assert.match(skill, /关键词先空出来|后续填写|fillable parameter|template parameter|模板参数/i);
	assert.match(skill, /templateConfig/);
	assert.match(skill, /team\/task-template-1/);
	assert.match(skill, /\{\{keyword\}\}/);
	assert.match(skill, /parameters[\s\S]*id[\s\S]*label/);
	assert.match(skill, /POST\s+\/v1\/team\/tasks/);
});

test("team-task-creator skill distinguishes template creation from cloning or running", async () => {
	const skill = await readSkill();
	assert.match(skill, /POST\s+\/v1\/team\/tasks\/:taskId\/clone/);
	assert.match(skill, /templateBindings/);
	assert.match(skill, /clone|复制|实例化/i);
	assert.match(skill, /must not start|不得启动|不要启动/i);
	assert.match(skill, /full Task JSON|完整 Task JSON|完整的 Task JSON/i);
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

test("team-task-creator skill supports Discovery Task creation through the existing Task API", async () => {
	const skill = await readSkill();
	assert.match(skill, /Discovery Task|Discovery root Task|canvasKind.*discovery/i);
	assert.match(skill, /canvasKind[\s\S]*["`]discovery["`]/);
	assert.match(skill, /discoverySpec/);
	assert.match(skill, /POST\s+\/v1\/team\/tasks/);
	assert.match(skill, /do not add|不要新增|不新增[\s\S]*(backend endpoint|后端 endpoint|endpoint)/i);
	assert.match(skill, /generatedSource[\s\S]*(must not|不得|不能|MUST NOT)/i);
});

test("team-task-creator skill requires a complete Discovery JSON preview before API writes", async () => {
	const skill = await readSkill();
	assert.match(skill, /Discovery[\s\S]*(full Task JSON|完整 Task JSON|完整的 Task JSON)/i);
	assert.match(skill, /discoverySpec[\s\S]*schemaVersion[\s\S]*team\/discovery-spec-1/);
	assert.match(skill, /outputKey/);
	assert.match(skill, /requiredItemFields[\s\S]*id/);
	assert.match(skill, /itemIdField[\s\S]*id/);
	assert.match(skill, /autoRun[\s\S]*enabled[\s\S]*true[\s\S]*concurrency[\s\S]*3/);
	assert.match(skill, /confirm|确认/i);
});

test("team-task-creator skill validates Discovery role agents from catalog without platform hard-coding", async () => {
	const skill = await readSkill();
	assert.match(skill, /GET\s+\/v1\/agents/);
	assert.match(skill, /dispatcherAgentId/);
	assert.match(skill, /generatedWorkerAgentId/);
	assert.match(skill, /generatedCheckerAgentId/);
	assert.match(skill, /active Agent|active.*catalog|活跃 Agent|Agent catalog/i);
	assert.match(skill, /do not hard-code|不要写死|不得写死/i);
	assert.doesNotMatch(skill, /Vultr|Hetzner|TikTok/i);
});

test("team-task-creator skill guides real Team Console Discovery verification", async () => {
	const skill = await readSkill();
	assert.match(skill, /http:\/\/127\.0\.0\.1:5174\//);
	assert.match(skill, /Live API/);
	assert.match(skill, /创建 Task/);
	assert.match(skill, /generated child|generated Task|子画布/i);
	assert.match(skill, /archive|归档/i);
});

test("team-task-creator skill infers Discovery from multi-source research intent", async () => {
	const skill = await readSkill();
	assert.match(skill, /multi-platform|multi-source|多平台|多来源|多个平台/i);
	assert.match(skill, /user feedback|用户反馈|评价/i);
	assert.match(skill, /default to Discovery|优先按 Discovery|默认按 Discovery/i);
	assert.match(skill, /community|社区/i);
	assert.match(skill, /code hosting|代码托管/i);
	assert.match(skill, /model hosting|模型托管/i);
});

test("team-task-creator skill does not require users to author Discovery schema details", async () => {
	const skill = await readSkill();
	assert.match(skill, /do not ask the user to write|不要要求用户编写|用户不需要/i);
	assert.match(skill, /canvasKind|discoverySpec|outputKey/);
	assert.match(skill, /translate|转换|补齐|derive|推导/i);
	assert.match(skill, /one or two|最多.*2|最多.*两个|minimal questions|少量追问/i);
});

test("team-task-creator skill switches an active normal Task draft to Discovery when requested", async () => {
	const skill = await readSkill();
	assert.match(skill, /during normal Task drafting|普通 Task 草案|中途/i);
	assert.match(skill, /switch to Discovery|改成 Discovery|转为 Discovery/i);
	assert.match(skill, /do not ask.*what Discovery means|不要反问.*Discovery.*是什么|不要问.*discovery.*机制/i);
	assert.match(skill, /generated child|子任务|子 Task/i);
});

test("team-task-creator skill acts as a guided Task design advisor for non-expert users", async () => {
	const skill = await readSkill();
	assert.match(skill, /design advisor|设计向导|创建向导/i);
	assert.match(skill, /non-expert|外行|用户不知道/i);
	assert.match(skill, /do not ask the user to choose.*normal.*Discovery|不要让用户.*选择.*普通 Task.*Discovery/i);
	assert.match(skill, /recommend|推荐/i);
	assert.match(skill, /rationale|reason|理由|为什么/i);
});

test("team-task-creator skill evaluates task form before collecting fields", async () => {
	const skill = await readSkill();
	assert.match(skill, /evaluate.*task form|判断任务形态|任务形式判断/i);
	assert.match(skill, /normal Task|普通 Task/i);
	assert.match(skill, /Discovery/i);
	assert.match(skill, /before.*collecting fields|先.*字段|先.*参数/i);
	assert.match(skill, /better option|更好的选择|更适合/i);
});

test("team-task-creator skill turns fuzzy user intent into a precise task contract", async () => {
	const skill = await readSkill();
	assert.match(skill, /fuzzy intent|模糊.*意图|口语化/i);
	assert.match(skill, /precise.*goal|精确.*目标|可执行目标/i);
	assert.match(skill, /scope|范围/i);
	assert.match(skill, /deliverable|输出物|输出格式/i);
	assert.match(skill, /acceptance|验收/i);
	assert.match(skill, /targeted clarifying questions|少量.*追问|针对性追问/i);
});

test("team-task-creator skill recommends Discovery for generic multi-source feedback before confirming parameters", async () => {
	const skill = await readSkill();
	assert.match(skill, /generic multi-source feedback example|通用.*多来源|某个产品或模型/i);
	assert.match(skill, /recommend.*Discovery|推荐.*Discovery|更适合.*Discovery/i);
	assert.match(skill, /root[\s\S]*(discover|发现|规范化)[\s\S]*(platform|source|平台|来源)/i);
	assert.match(skill, /generated child[\s\S]*(platform|平台|source|来源)/i);
	assert.match(skill, /not present.*normal Task confirmation table|不要先给.*普通 Task.*确认表|不要.*普通 Task.*字段表/i);
	assert.match(skill, /not a patch for any specific product|不是.*具体|specific product/i);
	assert.doesNotMatch(skill, /Qwen 3\.7 Max|Reddit|HuggingFace/i);
});
