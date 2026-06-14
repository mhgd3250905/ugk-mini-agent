# Team Task Default Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `team-worker`, `team-checker`, and `team-dispatcher` as built-in Team Task Agent profiles, with dedicated runtime rules, preinstalled `http-access`, and Team Task creation defaults.

**Architecture:** Extend the existing default Agent profile system instead of writing local `.data` records. Runtime initialization will create each Team Agent directory, write role-specific `AGENTS.md` only when missing, and copy `.pi/skills/http-access` into each Team Agent system skill root only when absent. Team Task factory and creator docs will default worker/checker/dispatcher roles to these profiles while preserving explicit caller overrides.

**Tech Stack:** TypeScript, Node.js `node:test`, existing Agent profile catalog/bootstrap, existing Team Task factory, markdown skill docs.

---

### Task 1: Add Built-In Team Agent Profile IDs

**Files:**
- Modify: `src/agent/agent-profile.ts`
- Test: `test/agent-profile.test.ts`

- [ ] **Step 1: Write failing tests**

Add assertions to `test/agent-profile.test.ts` in the default profile test:

```ts
const teamWorker = resolveAgentProfile(profiles, "team-worker");
const teamChecker = resolveAgentProfile(profiles, "team-checker");
const teamDispatcher = resolveAgentProfile(profiles, "team-dispatcher");

assert.ok(teamWorker);
assert.ok(teamChecker);
assert.ok(teamDispatcher);
assert.equal(teamWorker.dataDir, join(projectRoot, ".data", "agents", "team-worker"));
assert.equal(teamChecker.runtimeAgentRulesPath, join(projectRoot, ".data", "agents", "team-checker", "AGENTS.md"));
assert.deepEqual(teamDispatcher.allowedSkillPaths, [
	join(projectRoot, ".data", "agents", "team-dispatcher", "pi", "skills"),
	join(projectRoot, ".data", "agents", "team-dispatcher", "user-skills"),
]);
```

Add a custom override test:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\agent-profile.test.ts
```

Expected: FAIL because the new ids are missing.

- [ ] **Step 3: Implement default Team profile ids**

In `src/agent/agent-profile.ts`, add constants:

```ts
export const TEAM_WORKER_AGENT_ID = "team-worker";
export const TEAM_CHECKER_AGENT_ID = "team-checker";
export const TEAM_DISPATCHER_AGENT_ID = "team-dispatcher";
export const TEAM_TASK_AGENT_IDS = [
	TEAM_WORKER_AGENT_ID,
	TEAM_CHECKER_AGENT_ID,
	TEAM_DISPATCHER_AGENT_ID,
] as const;
```

Update `createDefaultAgentProfiles` so `seen` starts with all built-in ids and built-in summaries can be overridden by `customProfiles.find(...)`:

```ts
const seen = new Set([DEFAULT_AGENT_ID, SEARCH_AGENT_ID, ...TEAM_TASK_AGENT_IDS]);
const builtinSummaries = [
	searchProfileSummary,
	customProfiles.find((profile) => profile.agentId === TEAM_WORKER_AGENT_ID) ?? {
		agentId: TEAM_WORKER_AGENT_ID,
		name: "Team Worker Agent",
		description: "用于 Team Canvas Task 执行任务、读取输入并产出可验收结果的专职 agent。",
	},
	customProfiles.find((profile) => profile.agentId === TEAM_CHECKER_AGENT_ID) ?? {
		agentId: TEAM_CHECKER_AGENT_ID,
		name: "Team Checker Agent",
		description: "用于 Team Canvas Task 独立验收 worker 输出、判断是否满足契约和验收规则的专职 agent。",
	},
	customProfiles.find((profile) => profile.agentId === TEAM_DISPATCHER_AGENT_ID) ?? {
		agentId: TEAM_DISPATCHER_AGENT_ID,
		name: "Team Dispatcher Agent",
		description: "用于 Discovery Task 分发发现 item、生成 child Task 语义补丁的专职 agent。",
	},
];
```

Return `createAgentProfileFromSummary(projectRoot, ...)` for all built-in summaries after `main`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\agent-profile.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/agent/agent-profile.ts test/agent-profile.test.ts
git commit -m "feat: add team task default agent profiles"
```

### Task 2: Add Role-Specific Runtime Rules and `http-access`

**Files:**
- Modify: `src/agent/agent-profile-bootstrap.ts`
- Test: `test/agent-profile-bootstrap.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that call `ensureAgentProfileRuntime` for the three Team Agent ids and assert:

```ts
assert.match(await readFile(teamWorker.runtimeAgentRulesPath, "utf8"), /# Team Worker Agent/);
assert.match(await readFile(teamChecker.runtimeAgentRulesPath, "utf8"), /# Team Checker Agent/);
assert.match(await readFile(teamDispatcher.runtimeAgentRulesPath, "utf8"), /# Team Dispatcher Agent/);
```

Create source skill before runtime initialization:

```ts
await mkdir(join(projectRoot, ".pi", "skills", "http-access"), { recursive: true });
await writeFile(join(projectRoot, ".pi", "skills", "http-access", "SKILL.md"), "---\nname: http-access\n---\n", "utf8");
```

Assert copied skill:

```ts
const copied = await readFile(join(teamWorker.allowedSkillPaths[0]!, "http-access", "SKILL.md"), "utf8");
assert.match(copied, /name: http-access/);
```

Assert no overwrite:

```ts
await writeFile(join(teamChecker.allowedSkillPaths[0]!, "http-access", "SKILL.md"), "custom", "utf8");
await ensureAgentProfileRuntime(teamChecker);
assert.equal(await readFile(join(teamChecker.allowedSkillPaths[0]!, "http-access", "SKILL.md"), "utf8"), "custom");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\agent-profile-bootstrap.test.ts
```

Expected: FAIL because Team-specific rules and `http-access` copy do not exist yet.

- [ ] **Step 3: Implement runtime rules and copy logic**

In `src/agent/agent-profile-bootstrap.ts`, import Team ids and `cp`:

```ts
import { cp, mkdir, writeFile } from "node:fs/promises";
import { DEFAULT_AGENT_ID, SEARCH_AGENT_ID, TEAM_CHECKER_AGENT_ID, TEAM_DISPATCHER_AGENT_ID, TEAM_TASK_AGENT_IDS, TEAM_WORKER_AGENT_ID, type AgentProfile } from "./agent-profile.js";
```

Add constants for `TEAM_WORKER_AGENT_DEFAULT_RULES`, `TEAM_CHECKER_AGENT_DEFAULT_RULES`, and `TEAM_DISPATCHER_AGENT_DEFAULT_RULES` using the text from the spec.

Add helper:

```ts
function createTeamAgentDefaultRules(profile: AgentProfile): string | undefined {
	if (profile.agentId === TEAM_WORKER_AGENT_ID) return TEAM_WORKER_AGENT_DEFAULT_RULES;
	if (profile.agentId === TEAM_CHECKER_AGENT_ID) return TEAM_CHECKER_AGENT_DEFAULT_RULES;
	if (profile.agentId === TEAM_DISPATCHER_AGENT_ID) return TEAM_DISPATCHER_AGENT_DEFAULT_RULES;
	return undefined;
}
```

Update `createAgentDefaultRules` to return Team-specific rules before the generic Search-derived rules.

Add async and sync `http-access` installers:

```ts
async function copyHttpAccessSkillIfMissing(profile: AgentProfile): Promise<void> {
	if (!TEAM_TASK_AGENT_IDS.includes(profile.agentId as typeof TEAM_TASK_AGENT_IDS[number])) return;
	const targetRoot = profile.allowedSkillPaths[0];
	if (!targetRoot) return;
	const sourceDir = join(dirname(dirname(profile.dataDir)), ".pi", "skills", "http-access");
	const targetDir = join(targetRoot, "http-access");
	if (existsSync(targetDir) || !existsSync(join(sourceDir, "SKILL.md"))) return;
	await mkdir(targetRoot, { recursive: true });
	await cp(sourceDir, targetDir, { recursive: true, force: false, errorOnExist: true });
}
```

Call this helper after `DEFAULT_AGENT_SYSTEM_SKILLS` are written for non-main profiles. Add a sync equivalent for `ensureAgentProfileRuntimeSync`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\agent-profile-bootstrap.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/agent/agent-profile-bootstrap.ts test/agent-profile-bootstrap.test.ts
git commit -m "feat: bootstrap team task agent runtimes"
```

### Task 3: Default Team Task Factory Roles

**Files:**
- Modify: `src/team/task-factory.ts`
- Test: `test/team-task-factory.test.ts`

- [ ] **Step 1: Write failing tests**

Change the test context:

```ts
const context = { availableAgentIds: new Set(["main", "http", "team-checker-agent", "team-worker", "team-checker", "team-dispatcher"]) };
```

Add a test for omitted roles:

```ts
test("task factory defaults Team Task roles to built-in team agents", () => {
	const result = buildTeamTaskFactoryPayload({
		kind: "normal",
		title: "默认职责任务",
		inputText: "处理输入。",
		outputContractText: "输出结果。",
		acceptanceRules: ["结果完整。"],
	}, context);

	assert.equal(result.payload.leaderAgentId, "main");
	assert.equal(result.payload.workUnit.workerAgentId, "team-worker");
	assert.equal(result.payload.workUnit.checkerAgentId, "team-checker");
});
```

Add split-task default assertions:

```ts
assert.equal(result.payload.splitTaskSpec?.generatedWorkerAgentId, "team-worker");
assert.equal(result.payload.splitTaskSpec?.generatedCheckerAgentId, "team-checker");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\team-task-factory.test.ts
```

Expected: FAIL because role fields are required.

- [ ] **Step 3: Implement role defaults**

In `src/team/task-factory.ts`, import ids:

```ts
import { DEFAULT_AGENT_ID, TEAM_CHECKER_AGENT_ID, TEAM_WORKER_AGENT_ID } from "../agent/agent-profile.js";
```

Make base fields optional:

```ts
interface TaskFactoryBaseSpec {
	title: string;
	leaderAgentId?: string;
	workerAgentId?: string;
	checkerAgentId?: string;
	status?: TaskFactoryStatus;
}
```

Add helpers:

```ts
function defaultLeaderAgentId(value: string | undefined): string {
	return assertNonEmpty(value ?? DEFAULT_AGENT_ID, "leaderAgentId");
}
function defaultWorkerAgentId(value: string | undefined): string {
	return assertNonEmpty(value ?? TEAM_WORKER_AGENT_ID, "workerAgentId");
}
function defaultCheckerAgentId(value: string | undefined): string {
	return assertNonEmpty(value ?? TEAM_CHECKER_AGENT_ID, "checkerAgentId");
}
```

Use these helpers in normal, worklist producer, and split-task payload builders. Keep explicit caller values taking precedence.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\team-task-factory.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/team/task-factory.ts test/team-task-factory.test.ts
git commit -m "feat: default team task factory roles"
```

### Task 4: Update `/team-task` Skill Defaults

**Files:**
- Modify: `.pi/skills/team-task-creator/SKILL.md`
- Modify: `.pi/skills/team-task-creator/references/task-contracts.md`
- Test: `test/team-task-creator-skill.test.ts`

- [ ] **Step 1: Write failing tests**

Add assertions:

```ts
assert.match(skill, /team-worker/);
assert.match(skill, /team-checker/);
assert.match(skill, /team-dispatcher/);
assert.match(skill, /http-access/);
assert.match(skill, /fallback|退回|不存在/);
```

Add reference assertions:

```ts
assert.match(reference, /workerAgentId[\s\S]*team-worker/);
assert.match(reference, /checkerAgentId[\s\S]*team-checker/);
assert.match(reference, /dispatcherAgentId[\s\S]*team-dispatcher/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\team-task-creator-skill.test.ts
```

Expected: FAIL because docs still use older examples.

- [ ] **Step 3: Update skill docs**

In `SKILL.md`, extend the Agent role instruction:

```md
Default Team Task roles:

- Prefer `team-worker` for workerAgentId.
- Prefer `team-checker` for checkerAgentId.
- Prefer `team-dispatcher` for Discovery `dispatcherAgentId`.
- Prefer `team-worker/team-checker` for generated child Task worker/checker.
- These Team Agents are expected to have `http-access` preinstalled.
- If any preferred Team Agent is not present in `GET /v1/agents`, fall back to active Agent catalog choices and explain the fallback before preview.
```

Update `task-contracts.md` examples to use `team-worker`, `team-checker`, and `team-dispatcher`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node --test --test-concurrency=1 --import tsx test\team-task-creator-skill.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add .pi/skills/team-task-creator/SKILL.md .pi/skills/team-task-creator/references/task-contracts.md test/team-task-creator-skill.test.ts
git commit -m "docs: default team task creator roles"
```

### Task 5: Full Verification

**Files:**
- Verify only

- [ ] **Step 1: Run focused test suite**

```powershell
node --test --test-concurrency=1 --import tsx test\agent-profile.test.ts test\agent-profile-bootstrap.test.ts test\team-task-factory.test.ts test\team-task-creator-skill.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run type check**

```powershell
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run diff whitespace check**

```powershell
git diff --check
```

Expected: no output and exit 0.

- [ ] **Step 4: Inspect git status**

```powershell
git status --short --branch
```

Expected: only pre-existing unrelated local files remain uncommitted.
