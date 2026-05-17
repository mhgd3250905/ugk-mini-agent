import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TeamRoleRunner, ProfileAwareTeamRoleRunner, WorkerInput, WorkerOutput, CheckerInput, CheckerOutput, WatcherInput, WatcherOutput, FinalizerInput, FinalizerOutput, DecomposerInput, DecomposerOutput } from "./role-runner.js";
import type { TeamTask, TeamPlan, TeamRoleRuntimeContext, TeamTaskDecomposerMode } from "./types.js";
import type { BackgroundAgentSessionFactory } from "../agent/background-agent-runner.js";
import { BackgroundAgentProfileResolver } from "../agent/background-agent-profile.js";
import type { ResolvedBackgroundAgentSnapshot, BackgroundAgentProfileRef } from "../agent/background-agent-profile.js";
import { ProjectBackgroundSessionFactory } from "../agent/background-agent-session-factory.js";
import { findLastAssistantMessage, assertAssistantMessageSucceeded } from "../agent/agent-run-result.js";
import { stringifyVisibleAssistantContent } from "../agent/background-agent-runner.js";
import { createBrowserCleanupScope, runWithScopedAgentEnvironment } from "../agent/agent-run-scope.js";
import { runWithBackgroundWorkspaceContext } from "../agent/background-workspace-context.js";
import type { AgentSessionLike } from "../agent/agent-session-factory.js";

export interface AgentProfileRoleRunnerOptions {
	projectRoot: string;
	teamDataDir: string;
	workerProfileId: string;
	checkerProfileId: string;
	watcherProfileId: string;
	finalizerProfileId: string;
	decomposerProfileId?: string;
	profileResolver?: BackgroundAgentProfileResolver;
	sessionFactory?: BackgroundAgentSessionFactory;
	defaultBrowserId?: string;
	setBrowserScopeRoute?: (scope: string, browserId: string | undefined) => Promise<void>;
	closeBrowserTargetsForScope?: (scope: string, options?: { browserId?: string }) => Promise<void>;
}

function buildDefaultRef(profileId: string): BackgroundAgentProfileRef {
	return {
		profileId,
		agentSpecId: "team-default",
		skillSetId: "team-default",
		modelPolicyId: "team-default",
		upgradePolicy: "latest",
	};
}

function buildWorkerPrompt(task: TeamTask, acceptanceRules: string[], feedback?: string): string {
	let prompt = `你是一个执行 Agent（worker）。请完成以下任务。

## 任务
标题：${task.title}
描述：${task.input.text}
${task.input.payload ? `\n附加数据：\n\`\`\`json\n${JSON.stringify(task.input.payload, null, 2)}\n\`\`\`` : ""}

## 验收标准
${acceptanceRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}

## 输出要求
- 自由输出你的工作结果（markdown 格式）
- 产出的文件放在当前工作目录
${feedback ? `\n## 上次反馈（请针对反馈修改）\n${feedback}` : ""}`;

	return prompt;
}

function buildCheckerPrompt(task: TeamTask, acceptanceRules: string[], workerOutput: string): string {
	return `你是一个验收 Agent（checker）。请评审 worker 的输出。

## 任务
标题：${task.title}
描述：${task.input.text}

## 验收标准
${acceptanceRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}

## Worker 输出
${workerOutput}

## 输出要求
只输出一个 JSON object，不要输出其他任何内容（不要输出 markdown、解释文字或代码围栏）。

JSON 格式：
- 如果通过：{"verdict":"pass","reason":"通过原因","resultContent":"最终验收内容"}
- 如果需要修改：{"verdict":"revise","reason":"需要修改的原因","feedback":"具体修改建议"}
- 如果失败：{"verdict":"fail","reason":"失败原因","resultContent":"失败说明"}

约束：
- 顶层必须是 JSON object
- verdict 只能是 "pass"、"revise" 或 "fail"（小写）
- reason 必须是 string
- resultContent / feedback 如存在必须是 string
- 字符串中的双引号必须转义为 \\"
- 不要在 JSON 前后添加任何文字`;
}

function buildWatcherPrompt(task: TeamTask, workUnitStatus: "passed" | "failed", resultRef: string | null, errorSummary: string | null): string {
	return `你是一个复盘 Agent（watcher）。请审核当前任务的工作结果。

## 任务
标题：${task.title}

## 工作单元结果
状态：${workUnitStatus === "passed" ? "通过" : "失败"}
${errorSummary ? `错误：${errorSummary}` : ""}

## 输出要求
只输出一个 JSON object，不要输出其他任何内容（不要输出 markdown、解释文字或代码围栏）。

JSON 格式：
- 如果认可结果：{"decision":"accept_task","reason":"认可原因"}
- 如果确认失败：{"decision":"confirm_failed","reason":"确认失败原因"}
- 如果需要重新执行：{"decision":"request_revision","reason":"重新执行原因","revisionMode":"amend 或 redo","feedback":"给执行 Agent 的补充说明"}

约束：
- 顶层必须是 JSON object
- decision 只能是 "accept_task"、"confirm_failed" 或 "request_revision"（小写）
- reason 必须是 string
- revisionMode 只能是 "amend" 或 "redo"
- 字符串中的双引号必须转义为 \\"
- 不要在 JSON 前后添加任何文字`;
}

function buildFinalizerPrompt(plan: TeamPlan, taskResults: Array<{ taskId: string; status: "succeeded" | "failed"; resultRef: string | null; errorSummary: string | null; resultContent: string | null }>): string {
	const taskSummary = taskResults.map(r => {
		let line = `- ${r.taskId}: ${r.status === "succeeded" ? "成功" : "失败"}`;
		if (r.errorSummary) line += `（${r.errorSummary}）`;
		if (r.resultContent) line += `\n  产出：\n${r.resultContent}`;
		return line;
	}).join("\n");

	return `你是一个汇总 Agent（finalizer）。请根据任务执行结果生成最终报告。

## 计划目标
${plan.goal.text}

## 输出要求
${plan.outputContract.text}

## 任务结果
${taskSummary}

## 输出格式
用中文输出 markdown 格式的最终汇总报告，包括：
1. 总结
2. 已完成任务
3. 失败/未完成任务
4. 下次准备建议`;
}

function buildDecomposerPrompt(input: DecomposerInput): string {
	const policy = input.task.decomposer ?? { mode: "none" as const };
	return `你是一个任务拆分 Agent（decomposer）。请判断当前 Team task 是否需要拆成更小的可执行任务。

## 计划目标
${input.plan.goal.text}

## 当前任务
ID：${input.task.id}
标题：${input.task.title}
描述：${input.task.input.text}
${input.task.input.payload ? `\n附加数据：\n\`\`\`json\n${JSON.stringify(input.task.input.payload, null, 2)}\n\`\`\`` : ""}

## 验收标准
${input.task.acceptance.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}

## 拆分策略
mode：${policy.mode}
maxChildren：${input.maxChildren}

## 输出要求
只输出一个 JSON object，不要输出其他任何内容（不要输出 markdown、解释文字或代码围栏）。

JSON 格式：
- 不拆分：{"decision":"no_split","reason":"原因","children":[]}
- 拆分：{"decision":"split","reason":"原因","children":[{"id":"child_task_id","title":"子任务标题","input":{"text":"子任务描述"},"acceptance":{"rules":["验收标准"]},"decomposer":{"mode":"none"}}]}

约束：
- 顶层必须是 JSON object
- "decision":"split|no_split"
- reason 必须是 string
- no_split 时 children 必须为空数组或省略
- split 时 children 必须是数组，长度不能超过 maxChildren
- child.id / child.title / child.input.text 必须是非空 string
- child.acceptance.rules 必须是非空 string 数组
- child.decomposer.mode 只能是 "none"、"leaf" 或 "propagate"
- 字符串中的双引号必须转义为 \\"
- 不要在 JSON 前后添加任何文字`;
}

function parseJsonResponse<T>(text: string): T {
	// Fast path: entire text is JSON after stripping fences
	const stripped = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
	try {
		return JSON.parse(stripped) as T;
	} catch {
		// Fall through to extraction
	}

	// Extract fenced ```json ... ``` block
	const fenceMatch = text.match(/```json\s*\n([\s\S]*?)\n\s*```/);
	if (fenceMatch) {
		return JSON.parse(fenceMatch[1].trim()) as T;
	}

	// Extract first balanced { ... } from text
	const firstBrace = text.indexOf("{");
	if (firstBrace !== -1) {
		let depth = 0;
		for (let i = firstBrace; i < text.length; i++) {
			if (text[i] === "{") depth++;
			else if (text[i] === "}") depth--;
			if (depth === 0) {
				return JSON.parse(text.slice(firstBrace, i + 1)) as T;
			}
		}
	}

	throw new Error(`no JSON found in response: ${text.slice(0, 100)}`);
}

function extractJsonishField(text: string, field: string): string | undefined {
	const startToken = `"${field}"`;
	const start = text.indexOf(startToken);
	if (start === -1) return undefined;
	const colon = text.indexOf(":", start + startToken.length);
	if (colon === -1) return undefined;
	const firstQuote = text.indexOf('"', colon + 1);
	if (firstQuote === -1) return undefined;

	const nextField = text.slice(firstQuote + 1).match(/",\s*"([A-Za-z][A-Za-z0-9_]*)"\s*:/);
	if (nextField?.index !== undefined) {
		return text.slice(firstQuote + 1, firstQuote + 1 + nextField.index);
	}
	const lastQuote = text.lastIndexOf('"');
	if (lastQuote > firstQuote) {
		return text.slice(firstQuote + 1, lastQuote);
	}
	return undefined;
}

function unescapeJsonishString(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	try {
		return JSON.parse(`"${value.replace(/(^|[^\\])"/g, '$1\\"')}"`) as string;
	} catch {
		return value;
	}
}

function parseCheckerJsonish(text: string): CheckerJsonOutput | null {
	const verdict = text.match(/"verdict"\s*:\s*"(pass|revise|fail)"/)?.[1] as CheckerJsonOutput["verdict"] | undefined;
	if (!verdict) return null;
	return {
		verdict,
		reason: unescapeJsonishString(extractJsonishField(text, "reason")) ?? "",
		feedback: unescapeJsonishString(extractJsonishField(text, "feedback")),
		resultContent: unescapeJsonishString(extractJsonishField(text, "resultContent")),
	};
}

function parseWatcherJsonish(text: string): WatcherJsonOutput | null {
	const decision = text.match(/"decision"\s*:\s*"(accept_task|confirm_failed|request_revision)"/)?.[1] as WatcherJsonOutput["decision"] | undefined;
	if (!decision) return null;
	const revisionMode = text.match(/"revisionMode"\s*:\s*"(amend|redo)"/)?.[1] as WatcherJsonOutput["revisionMode"] | undefined;
	return {
		decision,
		reason: unescapeJsonishString(extractJsonishField(text, "reason")) ?? "",
		revisionMode,
		feedback: unescapeJsonishString(extractJsonishField(text, "feedback")),
	};
}

interface CheckerJsonOutput {
	verdict: "pass" | "revise" | "fail";
	reason: string;
	feedback?: string;
	resultContent?: string;
}

interface WatcherJsonOutput {
	decision: "accept_task" | "confirm_failed" | "request_revision";
	reason: string;
	revisionMode?: "amend" | "redo";
	feedback?: string;
}

interface DecomposerJsonOutput {
	decision: "split" | "no_split";
	reason: string;
	children?: unknown[];
}

const VALID_CHECKER_VERDICTS = new Set<string>(["pass", "revise", "fail"]);
const VALID_WATCHER_DECISIONS = new Set<string>(["accept_task", "confirm_failed", "request_revision"]);
const VALID_REVISION_MODES = new Set<string>(["amend", "redo"]);
const VALID_DECOMPOSER_DECISIONS = new Set<string>(["split", "no_split"]);
const VALID_DECOMPOSER_MODES = new Set<string>(["none", "leaf", "propagate"]);
const MAX_DECOMPOSER_CHILDREN = 20;

function normalizeCheckerOutput(parsed: unknown): CheckerOutput | null {
	if (!parsed || typeof parsed !== "object") return null;
	const obj = parsed as Record<string, unknown>;
	const rawVerdict = typeof obj.verdict === "string" ? obj.verdict : "";
	if (!VALID_CHECKER_VERDICTS.has(rawVerdict)) return null;
	const verdict = rawVerdict as CheckerOutput["verdict"];
	const reason = typeof obj.reason === "string" ? obj.reason : "";
	const feedback = typeof obj.feedback === "string" ? obj.feedback : undefined;
	const resultContent = typeof obj.resultContent === "string" ? obj.resultContent : undefined;
	if (verdict === "revise" && !feedback) {
		return { verdict, reason, feedback: "checker requested revision", resultContent };
	}
	return { verdict, reason, feedback, resultContent };
}

function normalizeWatcherOutput(parsed: unknown): WatcherOutput | null {
	if (!parsed || typeof parsed !== "object") return null;
	const obj = parsed as Record<string, unknown>;
	const rawDecision = typeof obj.decision === "string" ? obj.decision : "";
	if (!VALID_WATCHER_DECISIONS.has(rawDecision)) return null;
	const decision = rawDecision as WatcherOutput["decision"];
	const reason = typeof obj.reason === "string" ? obj.reason : "";
	const rawRevisionMode = typeof obj.revisionMode === "string" ? obj.revisionMode : undefined;
	const revisionMode = rawRevisionMode && VALID_REVISION_MODES.has(rawRevisionMode) ? rawRevisionMode as "amend" | "redo" : undefined;
	const feedback = typeof obj.feedback === "string" ? obj.feedback : undefined;
	if (decision === "request_revision" && !feedback) {
		return { decision, reason, revisionMode, feedback: "watcher requested revision" };
	}
	return { decision, reason, revisionMode, feedback };
}

function normalizeDecomposerTask(raw: unknown): TeamTask | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const obj = raw as Record<string, unknown>;
	if (typeof obj.id !== "string" || !obj.id.trim()) return null;
	if (typeof obj.title !== "string" || !obj.title.trim()) return null;
	const input = obj.input as { text?: unknown; payload?: unknown } | undefined;
	if (!input || typeof input !== "object" || typeof input.text !== "string" || !input.text.trim()) return null;
	const acceptance = obj.acceptance as { rules?: unknown } | undefined;
	if (!acceptance || !Array.isArray(acceptance.rules) || acceptance.rules.length === 0 || !acceptance.rules.every(rule => typeof rule === "string" && rule.trim())) return null;
	const rawType = typeof obj.type === "string" ? obj.type : undefined;
	if (rawType && rawType !== "normal") return null;
	const rawDecomposer = obj.decomposer as { mode?: unknown; maxChildren?: unknown } | undefined;
	let decomposer: TeamTask["decomposer"] | undefined;
	if (rawDecomposer !== undefined) {
		if (!rawDecomposer || typeof rawDecomposer !== "object" || typeof rawDecomposer.mode !== "string" || !VALID_DECOMPOSER_MODES.has(rawDecomposer.mode)) return null;
		if (rawDecomposer.maxChildren !== undefined && (typeof rawDecomposer.maxChildren !== "number" || !Number.isInteger(rawDecomposer.maxChildren) || rawDecomposer.maxChildren < 1 || rawDecomposer.maxChildren > MAX_DECOMPOSER_CHILDREN)) return null;
		decomposer = {
			mode: rawDecomposer.mode as TeamTaskDecomposerMode,
			...(rawDecomposer.maxChildren !== undefined ? { maxChildren: rawDecomposer.maxChildren as number } : {}),
		};
	}
	return {
		id: obj.id,
		...(rawType ? { type: rawType as TeamTask["type"] } : {}),
		title: obj.title,
		input: {
			text: input.text,
			...(input.payload && typeof input.payload === "object" && !Array.isArray(input.payload) ? { payload: input.payload as Record<string, unknown> } : {}),
		},
		acceptance: { rules: acceptance.rules as string[] },
		...(decomposer ? { decomposer } : {}),
	};
}

function normalizeDecomposerOutput(parsed: unknown, maxChildren: number): DecomposerOutput | null {
	if (!parsed || typeof parsed !== "object") return null;
	const obj = parsed as Record<string, unknown>;
	const rawDecision = typeof obj.decision === "string" ? obj.decision : "";
	if (!VALID_DECOMPOSER_DECISIONS.has(rawDecision)) return null;
	const decision = rawDecision as DecomposerOutput["decision"];
	const reason = typeof obj.reason === "string" ? obj.reason : "";
	if (decision === "no_split") return { decision, reason, children: [] };
	if (!Array.isArray(obj.children) || obj.children.length === 0 || obj.children.length > maxChildren) return null;
	const children = obj.children.map(normalizeDecomposerTask);
	if (children.some(child => child === null)) return null;
	return { decision, reason, children: children as TeamTask[] };
}

function sanitizeScopePart(value: string): string {
	return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildTeamBrowserScope(input: { runId: string; role: string; roleKey: string; profileId?: string }): string {
	return [
		"team",
		sanitizeScopePart(input.runId),
		sanitizeScopePart(input.role),
		sanitizeScopePart(input.roleKey),
		sanitizeScopePart(input.profileId ?? "unknown"),
	].join(":");
}

async function readRefContent(teamDataDir: string, runId: string, ref: string): Promise<string> {
	try {
		return await readFile(join(teamDataDir, "runs", runId, ref), "utf8");
	} catch {
		return ref;
	}
}

async function promptWithAbort(session: AgentSessionLike, prompt: string, signal?: AbortSignal): Promise<void> {
	if (!signal) {
		await session.prompt(prompt);
		return;
	}
	if (signal.aborted) {
		await session.abort?.();
		throw signal.reason instanceof Error ? signal.reason : new Error(typeof signal.reason === "string" ? signal.reason : "Team role session aborted");
	}
	let removeAbortListener = (): undefined => undefined;
	const aborted = new Promise<never>((_resolve, reject) => {
		const onAbort = () => {
			void session.abort?.();
			reject(signal.reason instanceof Error ? signal.reason : new Error(typeof signal.reason === "string" ? signal.reason : "Team role session aborted"));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		removeAbortListener = () => { signal.removeEventListener("abort", onAbort); return undefined; };
	});
	try {
		await Promise.race([session.prompt(prompt), aborted]);
	} finally {
		removeAbortListener();
	}
}

export class AgentProfileRoleRunner implements ProfileAwareTeamRoleRunner {
	private readonly options: AgentProfileRoleRunnerOptions;
	private readonly sessionFactory: BackgroundAgentSessionFactory;
	private readonly profileResolver: BackgroundAgentProfileResolver;

	constructor(options: AgentProfileRoleRunnerOptions) {
		this.options = options;
		this.sessionFactory = options.sessionFactory ?? new ProjectBackgroundSessionFactory(options.projectRoot);
		this.profileResolver = options.profileResolver ?? new BackgroundAgentProfileResolver({ projectRoot: options.projectRoot });
	}

	setProfileIds(profiles: { workerProfileId: string; checkerProfileId: string; watcherProfileId: string; finalizerProfileId: string; decomposerProfileId: string }): void {
		this.options.workerProfileId = profiles.workerProfileId;
		this.options.checkerProfileId = profiles.checkerProfileId;
		this.options.watcherProfileId = profiles.watcherProfileId;
		this.options.finalizerProfileId = profiles.finalizerProfileId;
		this.options.decomposerProfileId = profiles.decomposerProfileId;
	}

	async runWorker(input: WorkerInput): Promise<WorkerOutput> {
		const snapshot = await this.resolveProfile(this.options.workerProfileId);
		const workspace = await this.createRoleWorkspace(input.runId, input.attemptId, "worker");
		const prompt = buildWorkerPrompt(input.task, input.acceptanceRules, input.feedback);

		const sessionResult = await this.runSession(snapshot, this.options.workerProfileId, input.runId, workspace, prompt, input.signal, { role: "worker", roleKey: input.attemptId });

		return { content: sessionResult.content, artifactRefs: [], runtimeContext: sessionResult.runtimeContext };
	}

	async runChecker(input: CheckerInput): Promise<CheckerOutput> {
		const snapshot = await this.resolveProfile(this.options.checkerProfileId);
		const workspace = await this.createRoleWorkspace(input.runId, input.attemptId, "checker");
		const workerOutput = await readRefContent(this.options.teamDataDir, input.runId, input.workerOutputRef);
		const prompt = buildCheckerPrompt(input.task, input.acceptanceRules, workerOutput);

		const sessionResult = await this.runSession(snapshot, this.options.checkerProfileId, input.runId, workspace, prompt, input.signal, { role: "checker", roleKey: input.attemptId });
		const content = sessionResult.content;

		try {
			const parsed = parseJsonResponse<CheckerJsonOutput>(content);
			const normalized = normalizeCheckerOutput(parsed);
			if (normalized) return { ...normalized, runtimeContext: sessionResult.runtimeContext };
			return { verdict: "fail", reason: "checker output parse error: invalid verdict", resultContent: content, runtimeContext: sessionResult.runtimeContext };
		} catch {
			const parsed = parseCheckerJsonish(content);
			if (parsed) {
				const normalized = normalizeCheckerOutput(parsed);
				if (normalized) return { ...normalized, runtimeContext: sessionResult.runtimeContext };
			}
			return { verdict: "fail", reason: "checker output parse error", resultContent: content, runtimeContext: sessionResult.runtimeContext };
		}
	}

	async runWatcher(input: WatcherInput): Promise<WatcherOutput> {
		const snapshot = await this.resolveProfile(this.options.watcherProfileId);
		const workspace = await this.createRoleWorkspace(input.runId, input.attemptId, "watcher");
		const prompt = buildWatcherPrompt(input.task, input.workUnitStatus, input.resultRef, input.errorSummary);

		const sessionResult = await this.runSession(snapshot, this.options.watcherProfileId, input.runId, workspace, prompt, input.signal, { role: "watcher", roleKey: input.attemptId });
		const content = sessionResult.content;

		try {
			const parsed = parseJsonResponse<WatcherJsonOutput>(content);
			const normalized = normalizeWatcherOutput(parsed);
			if (normalized) return { ...normalized, runtimeContext: sessionResult.runtimeContext };
			return { decision: "confirm_failed", reason: "watcher output parse error: invalid decision", runtimeContext: sessionResult.runtimeContext };
		} catch {
			const parsed = parseWatcherJsonish(content);
			if (parsed) {
				const normalized = normalizeWatcherOutput(parsed);
				if (normalized) return { ...normalized, runtimeContext: sessionResult.runtimeContext };
			}
			return { decision: "confirm_failed", reason: "watcher output parse error", runtimeContext: sessionResult.runtimeContext };
		}
	}

	async runFinalizer(input: FinalizerInput): Promise<FinalizerOutput> {
		const snapshot = await this.resolveProfile(this.options.finalizerProfileId);
		const workspace = await this.createRoleWorkspace(input.runId, "finalizer", "finalizer");

		const taskResultsWithContent = await Promise.all(input.taskResults.map(async r => {
			let resultContent: string | null = null;
			if (r.resultRef) {
				resultContent = await readRefContent(this.options.teamDataDir, input.runId, r.resultRef);
			}
			return { ...r, resultContent };
		}));

		const prompt = buildFinalizerPrompt(input.plan, taskResultsWithContent);

		const sessionResult = await this.runSession(snapshot, this.options.finalizerProfileId, input.runId, workspace, prompt, input.signal, { role: "finalizer", roleKey: "finalizer" });

		return { finalReport: sessionResult.content, runtimeContext: sessionResult.runtimeContext };
	}

	async runDecomposer(input: DecomposerInput): Promise<DecomposerOutput> {
		const requestedProfileId = this.options.decomposerProfileId ?? this.options.workerProfileId;
		const snapshot = await this.resolveProfile(requestedProfileId);
		const roleKey = `decompose_${input.task.id}`;
		const workspace = await this.createRoleWorkspace(input.runId, roleKey, "decomposer");
		const prompt = buildDecomposerPrompt(input);

		const sessionResult = await this.runSession(snapshot, requestedProfileId, input.runId, workspace, prompt, input.signal, { role: "decomposer", roleKey });
		const content = sessionResult.content;

		try {
			const parsed = parseJsonResponse<DecomposerJsonOutput>(content);
			const normalized = normalizeDecomposerOutput(parsed, input.maxChildren);
			if (normalized) return { ...normalized, runtimeContext: sessionResult.runtimeContext };
			return { decision: "no_split", reason: "decomposer output parse error: invalid schema", children: [], runtimeContext: sessionResult.runtimeContext };
		} catch {
			return { decision: "no_split", reason: "decomposer output parse error", children: [], runtimeContext: sessionResult.runtimeContext };
		}
	}

	private async resolveProfile(profileId: string): Promise<ResolvedBackgroundAgentSnapshot> {
		return this.profileResolver.resolve(buildDefaultRef(profileId));
	}

	private async createRoleWorkspace(runId: string, roleKey: string, role: string) {
		const workspaceRoot = join(this.options.teamDataDir, "runs", runId, "agent-workspaces", roleKey, role);
		const workDir = join(workspaceRoot, "work");
		const outputDir = join(workspaceRoot, "output");
		const sessionDir = join(workspaceRoot, "session");
		await mkdir(workDir, { recursive: true });
		await mkdir(outputDir, { recursive: true });
		await mkdir(sessionDir, { recursive: true });
		return { rootPath: workspaceRoot, workDir, outputDir, sessionDir };
	}

	private async runSession(
		snapshot: ResolvedBackgroundAgentSnapshot,
		requestedProfileId: string,
		runId: string,
		workspace: { rootPath: string; workDir: string; outputDir: string; sessionDir: string },
		prompt: string,
		signal: AbortSignal | undefined,
		roleContext: { role: string; roleKey: string },
	): Promise<{ content: string; runtimeContext: TeamRoleRuntimeContext }> {
		const browserId = snapshot.defaultBrowserId ?? this.options.defaultBrowserId;
		const browserScope = buildTeamBrowserScope({
			runId,
			role: roleContext.role,
			roleKey: roleContext.roleKey,
			profileId: snapshot.profileId,
		});
		const browserCleanupScope = browserId ? createBrowserCleanupScope(browserScope, browserId) : browserScope;
		const runtimeContext: TeamRoleRuntimeContext = {
			requestedProfileId,
			resolvedProfileId: snapshot.profileId,
			fallbackUsed: snapshot.fallbackUsed === true,
			...(snapshot.fallbackReason ? { fallbackReason: snapshot.fallbackReason } : {}),
			browserId: browserId ?? null,
			browserScope: browserCleanupScope,
		};
		const setBrowserScopeRoute = this.options.setBrowserScopeRoute;
		const closeBrowserTargetsForScope = this.options.closeBrowserTargetsForScope;

		let session: AgentSessionLike | undefined;

		try {
			await setBrowserScopeRoute?.(browserCleanupScope, browserId);
			session = await this.sessionFactory.createSession({
				runId,
				connId: `team-${runId}`,
				workspace: {
					rootPath: workspace.rootPath,
					inputDir: workspace.workDir,
					workDir: workspace.workDir,
					outputDir: workspace.outputDir,
					logsDir: workspace.outputDir,
					sessionDir: workspace.sessionDir,
					sharedDir: workspace.workDir,
					publicDir: workspace.outputDir,
					artifactPublicDir: workspace.outputDir,
					manifestPath: join(workspace.rootPath, "manifest.json"),
				},
				snapshot,
				browserId,
				browserScope: browserCleanupScope,
			});

			const wsEnv: Record<string, string | undefined> = {
				OUTPUT_DIR: workspace.outputDir,
				WORK_DIR: workspace.workDir,
				INPUT_DIR: workspace.workDir,
				LOGS_DIR: workspace.outputDir,
			};

			await runWithScopedAgentEnvironment(browserCleanupScope, async () => {
				await runWithBackgroundWorkspaceContext(wsEnv, () => promptWithAbort(session!, prompt, signal));
			});
		} finally {
			try {
				await closeBrowserTargetsForScope?.(browserCleanupScope, browserId ? { browserId } : undefined).catch(() => {});
			} finally {
				await setBrowserScopeRoute?.(browserCleanupScope, undefined).catch(() => {});
			}
		}

		if (!session) {
			throw new Error("failed to create team role session");
		}
		const lastMsg = findLastAssistantMessage(session.messages ?? []);
		assertAssistantMessageSucceeded(lastMsg);

		return { content: stringifyVisibleAssistantContent(lastMsg?.content ?? ""), runtimeContext };
	}
}
