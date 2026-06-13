import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SKILL_PATH = join(import.meta.dirname, "../.pi/skills/team-task-creator/SKILL.md");
const CONTRACT_REFERENCE_PATH = join(
	import.meta.dirname,
	"../.pi/skills/team-task-creator/references/task-contracts.md",
);

async function readSkill(): Promise<string> {
	return readFile(SKILL_PATH, "utf8");
}

async function readContractReference(): Promise<string> {
	return readFile(CONTRACT_REFERENCE_PATH, "utf8");
}

async function readSkillBundle(): Promise<string> {
	return `${await readSkill()}\n${await readContractReference()}`;
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
	assert.match(frontmatter.description!, /Discovery|multi-source|多来源/i);
	assert.match(frontmatter.description!, /worklist|split-task|分片任务/i);
	assert.match(frontmatter.description!, /do not use|Do not use|不要用于/i);
});

test("team-task-creator skill uses progressive disclosure instead of stuffing contracts into SKILL.md", async () => {
	const skill = await readSkill();
	const lineCount = skill.split(/\r?\n/).length;
	assert.ok(lineCount < 250, `expected lean SKILL body, got ${lineCount} lines`);
	assert.match(skill, /Progressive Disclosure/);
	assert.match(skill, /references\/task-contracts\.md/);
	assert.match(skill, /Read `references\/task-contracts\.md`[\s\S]*before showing any full JSON preview/i);
	assert.match(skill, /Conversation Posture/);
	assert.match(skill, /Workflow/);
	assert.match(skill, /Verification/);
	assert.doesNotMatch(skill, /README\.md|INSTALLATION_GUIDE|QUICK_REFERENCE|CHANGELOG/i);
});

test("team-task-creator contract reference is directly linked and structured for on-demand loading", async () => {
	const skill = await readSkill();
	const reference = await readContractReference();
	assert.match(skill, /references\/task-contracts\.md/);
	assert.match(reference, /# Team Task Contracts Reference/);
	assert.match(reference, /## Contents/);
	assert.match(reference, /Task factory/);
	assert.match(reference, /Common Task Payload/);
	assert.match(reference, /Template Parameters/);
	assert.match(reference, /Typed Ports/);
	assert.match(reference, /Discovery Root/);
	assert.match(reference, /Worklist Producer/);
	assert.match(reference, /Split-task Root/);
	assert.ok(reference.split(/\r?\n/).length < 300, "reference should stay navigable");
});

test("team-task-creator routes common creation through the Task factory", async () => {
	const skill = await readSkill();
	const reference = await readContractReference();
	assert.match(skill, /Task factory CLI|Task factory/i);
	assert.match(skill, /npm run team:task-factory/);
	assert.match(skill, /normal, worklist producer, or split-task creation/);
	assert.match(skill, /do not bypass the factory/i);
	assert.match(reference, /npm run team:task-factory -- --spec task-spec\.json/);
	assert.match(reference, /Factory errors are correction signals/);
	assert.match(reference, /worklist-producer/);
	assert.match(reference, /split-task/);
});

test("team-task-creator activates for natural-language Task creation but not run/debug work", async () => {
	const skill = await readSkill();
	assert.match(skill, /\/team-task/);
	assert.match(skill, /create or update|创建|更新/i);
	assert.match(skill, /Team Console Task|WorkUnit|任务卡片/);
	assert.match(skill, /natural-language|plain-language|自然语言/i);
	assert.match(skill, /Do not activate[\s\S]*(run|observe|debug|运行|调试)/i);
	assert.match(skill, /可以用 `\/team-task/);
});

test("team-task-creator centers non-expert conversation and hides jargon until preview", async () => {
	const skill = await readSkill();
	assert.match(skill, /non-expert|外行|rough goal|模糊/i);
	assert.match(skill, /business language|业务语言|plain-language|人话/i);
	assert.match(skill, /Do not ask[\s\S]*canvasKind/);
	assert.match(skill, /Do not ask[\s\S]*inputPorts/);
	assert.match(skill, /Do not ask[\s\S]*templateConfig/);
	assert.match(skill, /Do not ask[\s\S]*splitTaskSpec/);
	assert.match(skill, /Own the recommendation/);
	assert.match(skill, /1-3 targeted questions|1-3.*question|少量/i);
});

test("team-task-creator chooses task shape before collecting fields", async () => {
	const skill = await readSkill();
	assert.match(skill, /Evaluate the shape before collecting fields/);
	assert.match(skill, /Do not ask the user to choose between technical task types/);
	assert.match(skill, /normal Task/);
	assert.match(skill, /template Task/);
	assert.match(skill, /Discovery/);
	assert.match(skill, /worklist producer/);
	assert.match(skill, /split-task/);
	assert.match(skill, /downstream normal Task/);
	assert.match(skill, /recommend/i);
	assert.match(skill, /why|为什么|explain/i);
});

test("team-task-creator distinguishes unknown discovery from known large upstream data", async () => {
	const skill = await readSkill();
	assert.match(skill, /调研多个渠道|多个渠道|多个平台/);
	assert.match(skill, /先找一批对象再逐个分析/);
	assert.match(skill, /usually means Discovery/);
	assert.match(skill, /上游已经给了大 JSON|历史结果|文件/);
	assert.match(skill, /worklist producer \+ split-task/);
	assert.match(skill, /整理清单 Task -> 分片处理 Task -> 汇总报告 Task/);
});

test("team-task-creator separates worklist artifact shape from runtime handoff", async () => {
	const skill = await readSkill();
	assert.match(skill, /artifact shape from runtime handoff/i);
	assert.match(skill, /team\/worklist-1/);
	assert.match(skill, /machine-readable output reference/i);
	assert.match(skill, /not a prose summary/i);
});

test("team-task-creator asks business questions for templates and delivery tasks", async () => {
	const skill = await readSkill();
	assert.match(skill, /recipient|收件人/i);
	assert.match(skill, /subject|邮件标题/i);
	assert.match(skill, /body source|正文来源/i);
	assert.match(skill, /Internally map[\s\S]*template parameters[\s\S]*ports/i);
});

test("team-task-creator requires active Agent catalog before choosing roles", async () => {
	const skill = await readSkill();
	assert.match(skill, /GET\s+\/v1\/agents/);
	assert.match(skill, /active Agent/);
	assert.match(skill, /Do not guess Agent ids from memory/);
	assert.match(skill, /workerAgentId === checkerAgentId|same-Agent self-checking|同 Agent 自检/);
});

test("team-task-creator previews full JSON and waits for confirmation before writes", async () => {
	const skill = await readSkill();
	assert.match(skill, /full JSON preview/i);
	assert.match(skill, /Wait for explicit confirmation/i);
	assert.match(skill, /POST\s+\/v1\/team\/tasks/);
	assert.match(skill, /PATCH\s+\/v1\/team\/tasks\/:taskId/);
	assert.match(skill, /No write before user confirmation/);
});

test("team-task-creator supports safe updates without converting canvas kind by patch", async () => {
	const skill = await readSkill();
	assert.match(skill, /GET\s+\/v1\/team\/tasks/);
	assert.match(skill, /GET\s+\/v1\/team\/tasks\/:taskId/);
	assert.match(skill, /Preserve existing ports/);
	assert.match(skill, /changing a port id or type may break downstream connections/);
	assert.match(skill, /Preserve `canvasKind`/);
	assert.match(skill, /cannot be converted into Discovery or split-task by PATCH/);
});

test("team-task-creator prohibits runs, direct data writes, and generated child payloads", async () => {
	const skill = await readSkill();
	assert.match(skill, /No direct `\.data\/team` file writes/);
	assert.match(skill, /No Task run, Team Run, Plan run/);
	assert.match(skill, /worker\/checker chain/);
	assert.match(skill, /Agent profile edit/);
	assert.match(skill, /model change|browser binding change/);
	assert.match(skill, /No generated child Tasks in public create\/update payloads/);
	assert.match(skill, /No `generatedSource`/);
});

test("team-task-creator contract reference defines common Task and typed ports", async () => {
	const bundle = await readSkillBundle();
	assert.match(bundle, /Task[\s\S]*WorkUnit|WorkUnit[\s\S]*Task/);
	assert.match(bundle, /inputPorts/);
	assert.match(bundle, /outputPorts/);
	assert.match(bundle, /empty|\[\]/i);
	assert.match(bundle, /md/);
	assert.match(bundle, /html/);
	assert.match(bundle, /worklist-results/);
	assert.match(bundle, /Port shape/);
});

test("team-task-creator contract reference defines template parameters and clone API", async () => {
	const reference = await readContractReference();
	assert.match(reference, /templateConfig/);
	assert.match(reference, /team\/task-template-1/);
	assert.match(reference, /inputType/);
	assert.match(reference, /email_list/);
	assert.match(reference, /select[\s\S]*options|options[\s\S]*select/);
	assert.match(reference, /recipients[\s\S]*\{\{recipients\}\}/);
	assert.match(reference, /subject[\s\S]*\{\{subject\}\}/);
	assert.match(reference, /POST\s+\/v1\/team\/tasks\/:taskId\/clone/);
	assert.match(reference, /templateBindings/);
});

test("team-task-creator contract reference defines Discovery creation through existing Task API", async () => {
	const reference = await readContractReference();
	assert.match(reference, /Discovery Root/);
	assert.match(reference, /canvasKind[\s\S]*["`]discovery["`]/);
	assert.match(reference, /discoverySpec/);
	assert.match(reference, /team\/discovery-spec-1/);
	assert.match(reference, /outputKey/);
	assert.match(reference, /requiredItemFields[\s\S]*id/);
	assert.match(reference, /itemIdField[\s\S]*id/);
	assert.match(reference, /autoRun[\s\S]*enabled[\s\S]*true[\s\S]*concurrency[\s\S]*3/);
	assert.match(reference, /POST\s+\/v1\/team\/tasks/);
	assert.match(reference, /do not add a backend endpoint/i);
	assert.match(reference, /generatedSource[\s\S]*(must not|不得|不能)/i);
});

test("team-task-creator contract reference validates Discovery roles without platform hard-coding", async () => {
	const reference = await readContractReference();
	assert.match(reference, /dispatcherAgentId/);
	assert.match(reference, /generatedWorkerAgentId/);
	assert.match(reference, /generatedCheckerAgentId/);
	assert.match(reference, /must be active Agents/);
	assert.doesNotMatch(reference, /Vultr|Hetzner|TikTok|Qwen 3\.7 Max|Reddit|HuggingFace/i);
});

test("team-task-creator contract reference defines worklist producer Task creation", async () => {
	const reference = await readContractReference();
	assert.match(reference, /Worklist Producer/);
	assert.match(reference, /team\/worklist-1/);
	assert.match(reference, /worklistId/);
	assert.match(reference, /items/);
	assert.match(reference, /outputPorts[\s\S]*worklist/);
	assert.match(reference, /outputCheck[\s\S]*worklist/);
	assert.match(reference, /no missing items|no duplicates/i);
	assert.match(reference, /output\/worklist\.json/);
	assert.match(reference, /\{"outputPath":"output\/worklist\.json"\}/);
	assert.match(reference, /runtime handoff|final message|机器可解析|machine-readable/i);
});

test("team-task-creator contract reference defines split-task root creation", async () => {
	const reference = await readContractReference();
	assert.match(reference, /Split-task Root/);
	assert.match(reference, /canvasKind[\s\S]*["`]split-task["`]/);
	assert.match(reference, /splitTaskSpec/);
	assert.match(reference, /team\/split-task-spec-1/);
	assert.match(reference, /worklist-results/);
	assert.match(reference, /worklist_results/);
	assert.match(reference, /generatedWorkerAgentId/);
	assert.match(reference, /generatedCheckerAgentId/);
	assert.match(reference, /collectPolicy[\s\S]*requireFullCoverage/);
	assert.match(reference, /POST\s+\/v1\/team\/tasks/);
});

test("team-task-creator verification path stays focused on creation/update contracts", async () => {
	const skill = await readSkill();
	assert.match(skill, /http:\/\/127\.0\.0\.1:9999\//);
	assert.match(skill, /Live API/);
	assert.match(skill, /iframe conversation/);
	assert.match(skill, /\/team-task/);
	assert.match(skill, /Generated children appear after a future run/);
	assert.match(skill, /run quality[\s\S]*outside this skill/i);
});
