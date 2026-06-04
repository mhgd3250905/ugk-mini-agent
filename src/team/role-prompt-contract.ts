import type { CheckerInput, CheckerOutput, WatcherInput, WatcherOutput, FinalizerInput, DecomposerInput, DecomposerOutput, DiscoveryDispatchInput, DiscoveryDispatchOutput, DiscoveryDispatchSemanticPatch, DiscoveryDispatchWorkUnitDraft } from "./role-runner.js";
import type { TeamTask, TeamPlan, TeamTaskDecomposerMode, TeamTaskSourceItem } from "./types.js";

type WithoutRuntimeContext<T> = T extends unknown ? Omit<T, "runtimeContext"> : never;
type DiscoveryDispatchParsedOutput = WithoutRuntimeContext<DiscoveryDispatchOutput>;
type DiscoveryDispatchSemanticPatchParsedOutput =
	| { ok: true; itemId: string; patch: DiscoveryDispatchSemanticPatch }
	| { ok: false; itemId: string; error: string; rawContent?: string };

function getEffectiveSourceItem(task: TeamTask): TeamTaskSourceItem | null {
	if (!task.generated) return null;
	if (task.sourceItem) return task.sourceItem;
	if (task.sourceItemId) return { id: task.sourceItemId, data: { id: task.sourceItemId } };
	return null;
}

function buildSourceItemIdentityBlock(task: TeamTask): string {
	const item = getEffectiveSourceItem(task);
	if (!item) return "";
	const displayFields: string[] = [`- item.id: ${item.id}`];
	const title = item.data.title ?? item.data.name ?? item.data.label;
	if (typeof title === "string") {
		displayFields.push(`- item.title: ${title}`);
	}
	return `

## 当前 for_each item 身份（最高优先级）
${displayFields.join("\n")}

只能处理这个 item。任何参考资料、历史文件、全局清单、编号表如果与当前 item 冲突，必须以当前 item 为准。不得改成其他 item。

完整 item 数据：
\`\`\`json
${JSON.stringify(item.data, null, 2)}
\`\`\`
`;
}

function buildCheckerSourceItemBlock(task: TeamTask): string {
	const base = buildSourceItemIdentityBlock(task);
	if (!base) return "";
	return `${base}
如果 worker 输出处理了错误的 item（item.id 或 item.title 不匹配当前 item），必须 verdict 为 "fail"。
`;
}

function buildWatcherSourceItemBlock(task: TeamTask): string {
	const item = getEffectiveSourceItem(task);
	if (!item) return "";
	const displayFields: string[] = [`- item.id: ${item.id}`];
	const title = item.data.title ?? item.data.name ?? item.data.label;
	if (typeof title === "string") {
		displayFields.push(`- item.title: ${title}`);
	}
	return `

## 当前 for_each item 身份（最高优先级）
${displayFields.join("\n")}

任务描述：${task.input.text}

如果 worker 输出处理了错误的 item，不得认可（不得 accept_task）。如果确认 item 不匹配，decision 必须为 "confirm_failed" 或 "request_revision"。
`;
}

export function buildWorkerPrompt(task: TeamTask, acceptanceRules: string[], feedback?: string): string {
	let prompt = `你是一个执行 Agent（worker）。请完成以下任务。

## 任务
标题：${task.title}
描述：${task.input.text}
${task.input.payload ? `\n附加数据：\n\`\`\`json\n${JSON.stringify(task.input.payload, null, 2)}\n\`\`\`` : ""}

## 验收标准
${acceptanceRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}

## 输出要求
- 自由输出你的工作结果（markdown 格式）
- 私有中间文件放在当前工作目录
- 需要交付给用户或让 checker 访问验证的文件，必须写入环境变量 ARTIFACT_PUBLIC_DIR 指向的目录
- 如果 ARTIFACT_PUBLIC_BASE_URL 存在，对外可访问链接必须基于它拼接，不要启动临时本地 HTTP server，也不要输出 localhost 临时端口
${feedback ? `\n## 上次反馈（请针对反馈修改）\n${feedback}` : ""}`;
	prompt += buildOutputContractBlock(task);
	prompt += buildSourceItemIdentityBlock(task);
	return prompt;
}

function buildOutputContractBlock(task: TeamTask): string {
	if (task.type === "discovery" && task.discovery?.outputKey) {
		return `

## 机器可消费输出协议（必须满足）
- 最终可接受结果必须能被 runtime 机器解析，不只是人类可读总结。
- 输出必须包含 parseable JSON object，顶层 key 必须是 "${task.discovery.outputKey}"。
- "${task.discovery.outputKey}" 必须是 array。
- array 每一项必须是 object，且必须有稳定的非空 string 字段 "id"。
- 可以把 JSON 写入当前 run 范围内文件，但最终回答必须清楚引用该文件路径，例如 worker/vendors.json 或 worker/output/vendors.json。
`;
	}
	if (!task.outputCheck) return "";
	if (task.outputCheck.type === "html_fragment") {
		return `

## 机器可消费输出协议（必须满足）
- 最终可接受结果必须包含可验证的 HTML fragment。
- 不要输出完整 HTML 页面，除非任务明确要求。
${task.outputCheck.requiredSubstrings?.length ? `- fragment 必须包含这些标记：${task.outputCheck.requiredSubstrings.join(", ")}\n` : ""}${task.outputCheck.forbiddenTags?.length ? `- fragment 不得包含这些 page-level tags：${task.outputCheck.forbiddenTags.join(", ")}\n` : ""}`;
	}
	if (task.outputCheck.type === "json_items" || task.outputCheck.type === "json_object") {
		return `

## 机器可消费输出协议（必须满足）
- 最终可接受结果必须包含 parseable JSON。
${task.outputCheck.type === "json_items" && task.outputCheck.outputKey ? `- 顶层 key "${task.outputCheck.outputKey}" 必须是 array。\n` : ""}${task.outputCheck.requiredFields?.length ? `- 必须包含字段：${task.outputCheck.requiredFields.join(", ")}\n` : ""}`;
	}
	if (task.outputCheck.type === "file_exists") {
		return `

## 机器可消费输出协议（必须满足）
- 最终可接受结果必须生成并引用 run-scoped 文件${task.outputCheck.path ? `：${task.outputCheck.path}` : ""}。
`;
	}
	return "";
}

function buildValidationEvidenceBlock(validation: CheckerInput["outputValidation"] | WatcherInput["outputValidation"], role: "checker" | "watcher"): string {
	if (!validation) return "";
	const serialized = JSON.stringify(validation);
	const forbidden = role === "checker"
		? '如果 outputValidation.ok=false，verdict 不得为 "pass"；必须 fail 或 revise，并说明缺少机器可消费输出。'
		: '如果 outputValidation.ok=false，decision 不得为 "accept_task"；必须 confirm_failed 或 request_revision。';
	return `

## Runtime deterministic output validation
\`\`\`json
${serialized}
\`\`\`

${forbidden}
`;
}

export function buildCheckerPrompt(task: TeamTask, acceptanceRules: string[], workerOutput: string, outputValidation?: CheckerInput["outputValidation"]): string {
	const base = `你是一个验收 Agent（checker）。请评审 worker 的输出。

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
	return base + buildValidationEvidenceBlock(outputValidation, "checker") + buildCheckerSourceItemBlock(task);
}

export function buildWatcherPrompt(task: TeamTask, workUnitStatus: "passed" | "failed", resultRef: string | null, errorSummary: string | null, outputValidation?: WatcherInput["outputValidation"]): string {
	const base = `你是一个复盘 Agent（watcher）。请审核当前任务的工作结果。

## 任务
标题：${task.title}
${task.input.text ? `描述：${task.input.text}` : ""}

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
	return base + buildValidationEvidenceBlock(outputValidation, "watcher") + buildWatcherSourceItemBlock(task);
}

type FinalizerPromptTaskResult = FinalizerInput["taskResults"][number] & { resultContent: string | null };

export function buildFinalizerPrompt(plan: TeamPlan, taskResults: FinalizerPromptTaskResult[], runSummary?: { totalTasks: number; succeededTasks: number; failedTasks: number; cancelledTasks: number; skippedTasks: number }): string {
	const statusLabel = (s: string) => s === "succeeded" ? "成功" : s === "skipped" ? "跳过" : s === "cancelled" ? "取消" : "失败";

	const taskSummary = taskResults.map(r => {
		let line = `- ${r.taskId}: ${statusLabel(r.status)}`;
		if (r.errorSummary) line += `（错误：${r.errorSummary}）`;
		if (r.previousErrorSummary) line += `\n  原始错误（跳过前）：${r.previousErrorSummary}`;
		if (r.resultContent) line += `\n  产出：\n${r.resultContent}`;
		return line;
	}).join("\n");

	let authoritativeBlock = "";
	if (runSummary) {
		authoritativeBlock = `
## 权威运行汇总（不得修改）
总任务数：${runSummary.totalTasks}
- 成功：${runSummary.succeededTasks}
- 失败：${runSummary.failedTasks}
- 取消：${runSummary.cancelledTasks}
- 跳过：${runSummary.skippedTasks}

以上计数来自运行时状态，是权威数据。你不得重新计算或改写这些数字。报告中引用任务计数时必须使用上方数字。

`;
	}

	return `你是一个汇总 Agent（finalizer）。请根据任务执行结果生成最终报告。
${authoritativeBlock}
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
3. 跳过的任务（如有，与失败任务分开列出）
4. 失败/未完成任务
5. 限制与警告（如有）

## 重要规则
- 任务计数必须与上方"权威运行汇总"完全一致（如提供了该汇总）。不得自行重新计算。
- 跳过的任务不得归入"失败/未完成"。
- 如果某个成功任务提到了外部数据源限制（如 API 需要登录、只有部分数据可用），应将其列入"限制与警告"，但仍归入"已完成"。
- 只有运行时状态为 failed 或 cancelled 的任务才能出现在"失败/未完成"部分。`;
}

export function buildDecomposerPrompt(input: DecomposerInput): string {
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

const LEGACY_DISCOVERY_DISPATCH_FORBIDDEN_FIELDS = [
	"workerAgentId",
	"checkerAgentId",
	"leaderAgentId",
	"generatedWorkerAgentId",
	"generatedCheckerAgentId",
	"canvasKind",
	"discoverySpec",
	"generatedSource",
	"sourceDiscoveryTaskId",
	"sourceItemId",
	"itemPayload",
	"itemStatus",
	"workUnitMode",
	"outputPorts",
	"outputCheck",
];

const DISCOVERY_DISPATCH_SEMANTIC_PATCH_FORBIDDEN_FIELDS = [
	"workUnit",
	"outputContract",
	"acceptance",
	...LEGACY_DISCOVERY_DISPATCH_FORBIDDEN_FIELDS,
];

export function buildDiscoveryDispatchPrompt(input: DiscoveryDispatchInput): string {
	const recommended = input.recommendedItemFields ?? [];
	const generatedAgentContext = [
		input.generatedWorkerAgentId ? `- default generated worker profile id（仅上下文，不得输出）：${input.generatedWorkerAgentId}` : "",
		input.generatedCheckerAgentId ? `- default generated checker profile id（仅上下文，不得输出）：${input.generatedCheckerAgentId}` : "",
	].filter(Boolean).join("\n");
	return `你是一个 Discovery dispatcher。请为一个已验证的 Discovery item 输出语义补丁。你只负责描述这个 item 的具体处理语义；最终 WorkUnit 结构由本地 deterministic compiler 生成。

## Discovery task
- discoveryTaskId: ${input.discoveryTaskId}
- title: ${input.discoveryTaskTitle}

## Discovery goal
${input.discoveryGoal}

## Dispatch goal
${input.dispatchGoal}

## Item schema guidance
- outputKey: ${input.outputKey}
- requiredItemFields: ${input.requiredItemFields.join(", ")}
- recommendedItemFields: ${recommended.join(", ")}
- exact itemId: ${input.itemId}
${generatedAgentContext ? `\n## Default generated agent context\n${generatedAgentContext}` : ""}

## Full item payload JSON (input context; do not copy this block as output)
${JSON.stringify(input.itemPayload, null, 2)}

## Output requirements
只输出一个严格 JSON object，不要输出 markdown、解释文字或代码围栏。
- 输出内容 trim 后第一个字符必须是 "{"，最后一个字符必须是 "}"。
- 不要使用 markdown 代码围栏。

Semantic patch JSON object shape:
{
  "itemId": "${input.itemId}",
  "title": "Short generated task title",
  "workerInstruction": "Specific instruction for the worker about this exact item only",
  "itemAcceptanceHints": ["Optional item-specific acceptance hint"],
  "outputContractHint": "Optional item-specific output focus"
}

Hard constraints:
- itemId 必须精确等于 "${input.itemId}"。
- title 和 workerInstruction 必须是非空 string。
- itemAcceptanceHints 如存在，只能是 string[]，只写这个 item 特有的验收提示。
- outputContractHint 如存在，只能是非空 string，只写这个 item 特有的输出重点。
- 不得输出完整 WorkUnit、outputContract、acceptance、worker/checker/leader/source identity 字段。
- 禁止字段：${DISCOVERY_DISPATCH_SEMANTIC_PATCH_FORBIDDEN_FIELDS.join(", ")}。`;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function findForbiddenDiscoveryDispatchField(value: unknown, forbiddenFields: readonly string[]): string | null {
	if (Array.isArray(value)) {
		for (const item of value) {
			const found = findForbiddenDiscoveryDispatchField(item, forbiddenFields);
			if (found) return found;
		}
		return null;
	}
	if (!isPlainObject(value)) return null;
	for (const key of Object.keys(value)) {
		if (forbiddenFields.includes(key)) return key;
		const found = findForbiddenDiscoveryDispatchField(value[key], forbiddenFields);
		if (found) return found;
	}
	return null;
}

const VALID_CHECKER_VERDICTS = new Set<string>(["pass", "revise", "fail"]);
const VALID_WATCHER_DECISIONS = new Set<string>(["accept_task", "confirm_failed", "request_revision"]);
const VALID_REVISION_MODES = new Set<string>(["amend", "redo"]);
const VALID_DECOMPOSER_DECISIONS = new Set<string>(["split", "no_split"]);
const VALID_DECOMPOSER_MODES = new Set<string>(["none", "leaf", "propagate"]);
const MAX_DECOMPOSER_CHILDREN = 20;

function normalizeCheckerOutput(parsed: unknown): Omit<CheckerOutput, "runtimeContext"> | null {
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

function normalizeWatcherOutput(parsed: unknown): Omit<WatcherOutput, "runtimeContext"> | null {
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

function normalizeDecomposerOutput(parsed: unknown, maxChildren: number): Omit<DecomposerOutput, "runtimeContext"> | null {
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

function parseDiscoveryDispatchError(expectedItemId: string, error: string, rawContent: string): DiscoveryDispatchParsedOutput {
	return { ok: false, itemId: expectedItemId, error, rawContent };
}

function normalizeDiscoveryDispatchObjectField(value: unknown): Record<string, unknown> | null {
	if (isPlainObject(value)) return value;
	if (typeof value === "string" && value.trim()) return { text: value };
	return null;
}

function normalizeDiscoveryDispatchOutput(parsed: unknown, expectedItemId: string, rawContent: string): DiscoveryDispatchParsedOutput {
	if (!isPlainObject(parsed)) {
		return parseDiscoveryDispatchError(expectedItemId, "discovery dispatcher output parse error: top-level value must be an object", rawContent);
	}
	const forbidden = findForbiddenDiscoveryDispatchField(parsed, LEGACY_DISCOVERY_DISPATCH_FORBIDDEN_FIELDS);
	if (forbidden) {
		return parseDiscoveryDispatchError(expectedItemId, `discovery dispatcher output includes forbidden field: ${forbidden}`, rawContent);
	}
	if (typeof parsed.itemId !== "string" || !parsed.itemId.trim()) {
		return parseDiscoveryDispatchError(expectedItemId, "discovery dispatcher output parse error: itemId must be a non-empty string", rawContent);
	}
	if (parsed.itemId !== expectedItemId) {
		return parseDiscoveryDispatchError(expectedItemId, `discovery dispatcher item mismatch: expected ${expectedItemId}, got ${parsed.itemId}`, rawContent);
	}
	if (!isPlainObject(parsed.workUnit)) {
		return parseDiscoveryDispatchError(expectedItemId, "discovery dispatcher output parse error: workUnit must be an object", rawContent);
	}
	const workUnit = parsed.workUnit;
	const input = workUnit.input;
	const outputContract = workUnit.outputContract;
	const acceptance = workUnit.acceptance;
	if (typeof workUnit.title !== "string" || !workUnit.title.trim()) {
		return parseDiscoveryDispatchError(expectedItemId, "discovery dispatcher output parse error: workUnit.title must be a non-empty string", rawContent);
	}
	if (!isPlainObject(input) || typeof input.text !== "string" || !input.text.trim()) {
		return parseDiscoveryDispatchError(expectedItemId, "discovery dispatcher output parse error: workUnit.input.text must be a non-empty string", rawContent);
	}
	const normalizedOutputContract = normalizeDiscoveryDispatchObjectField(outputContract)
		?? normalizeDiscoveryDispatchObjectField(input.outputContract);
	const normalizedAcceptance = isPlainObject(acceptance)
		? acceptance
		: isPlainObject(input.acceptance)
			? input.acceptance
			: isPlainObject(normalizedOutputContract?.acceptance)
				? normalizedOutputContract.acceptance
				: null;
	if (!normalizedOutputContract || typeof normalizedOutputContract.text !== "string" || !normalizedOutputContract.text.trim()) {
		return parseDiscoveryDispatchError(expectedItemId, "discovery dispatcher output parse error: workUnit.outputContract.text must be a non-empty string", rawContent);
	}
	if (!normalizedAcceptance || !Array.isArray(normalizedAcceptance.rules) || normalizedAcceptance.rules.length === 0 || !normalizedAcceptance.rules.every(rule => typeof rule === "string" && rule.trim())) {
		return parseDiscoveryDispatchError(expectedItemId, "discovery dispatcher output parse error: workUnit.acceptance.rules must be a non-empty string array", rawContent);
	}
	const draft: DiscoveryDispatchWorkUnitDraft = {
		title: workUnit.title,
		input: { text: input.text },
		outputContract: { text: normalizedOutputContract.text },
		acceptance: { rules: normalizedAcceptance.rules as string[] },
	};
	return { ok: true, itemId: expectedItemId, workUnit: draft };
}

function parseDiscoveryDispatchSemanticPatchError(expectedItemId: string, error: string, rawContent: string): DiscoveryDispatchSemanticPatchParsedOutput {
	return { ok: false, itemId: expectedItemId, error, rawContent };
}

function normalizeDiscoveryDispatchSemanticPatch(parsed: unknown, expectedItemId: string, rawContent: string): DiscoveryDispatchSemanticPatchParsedOutput {
	if (!isPlainObject(parsed)) {
		return parseDiscoveryDispatchSemanticPatchError(expectedItemId, "discovery dispatcher semantic patch parse error: top-level value must be an object", rawContent);
	}
	const forbidden = findForbiddenDiscoveryDispatchField(parsed, DISCOVERY_DISPATCH_SEMANTIC_PATCH_FORBIDDEN_FIELDS);
	if (forbidden) {
		return parseDiscoveryDispatchSemanticPatchError(expectedItemId, `discovery dispatcher semantic patch includes forbidden field: ${forbidden}`, rawContent);
	}
	if (typeof parsed.itemId !== "string" || !parsed.itemId.trim()) {
		return parseDiscoveryDispatchSemanticPatchError(expectedItemId, "discovery dispatcher semantic patch parse error: itemId must be a non-empty string", rawContent);
	}
	if (parsed.itemId !== expectedItemId) {
		return parseDiscoveryDispatchSemanticPatchError(expectedItemId, `discovery dispatcher item mismatch: expected ${expectedItemId}, got ${parsed.itemId}`, rawContent);
	}
	if (typeof parsed.title !== "string" || !parsed.title.trim()) {
		return parseDiscoveryDispatchSemanticPatchError(expectedItemId, "discovery dispatcher semantic patch parse error: title must be a non-empty string", rawContent);
	}
	if (typeof parsed.workerInstruction !== "string" || !parsed.workerInstruction.trim()) {
		return parseDiscoveryDispatchSemanticPatchError(expectedItemId, "discovery dispatcher semantic patch parse error: workerInstruction must be a non-empty string", rawContent);
	}
	let itemAcceptanceHints: string[] | undefined;
	if (parsed.itemAcceptanceHints !== undefined) {
		if (!Array.isArray(parsed.itemAcceptanceHints)) {
			return parseDiscoveryDispatchSemanticPatchError(expectedItemId, "discovery dispatcher semantic patch parse error: itemAcceptanceHints must be a string array", rawContent);
		}
		if (!parsed.itemAcceptanceHints.every(hint => typeof hint === "string")) {
			return parseDiscoveryDispatchSemanticPatchError(expectedItemId, "discovery dispatcher semantic patch parse error: itemAcceptanceHints must contain only strings", rawContent);
		}
		const normalizedHints = parsed.itemAcceptanceHints.map(hint => hint.trim()).filter(Boolean);
		if (normalizedHints.length > 0) {
			itemAcceptanceHints = normalizedHints;
		}
	}
	let outputContractHint: string | undefined;
	if (parsed.outputContractHint !== undefined) {
		if (typeof parsed.outputContractHint !== "string" || !parsed.outputContractHint.trim()) {
			return parseDiscoveryDispatchSemanticPatchError(expectedItemId, "discovery dispatcher semantic patch parse error: outputContractHint must be a non-empty string", rawContent);
		}
		outputContractHint = parsed.outputContractHint.trim();
	}
	return {
		ok: true,
		itemId: expectedItemId,
		patch: {
			itemId: expectedItemId,
			title: parsed.title.trim(),
			workerInstruction: parsed.workerInstruction.trim(),
			...(itemAcceptanceHints ? { itemAcceptanceHints } : {}),
			...(outputContractHint ? { outputContractHint } : {}),
		},
	};
}

export function parseCheckerRoleOutput(content: string): Omit<CheckerOutput, "runtimeContext"> {
	try {
		const parsed = parseJsonResponse<CheckerJsonOutput>(content);
		const normalized = normalizeCheckerOutput(parsed);
		if (normalized) return normalized;
		return { verdict: "fail", reason: "checker output parse error: invalid verdict", resultContent: content };
	} catch {
		const parsed = parseCheckerJsonish(content);
		if (parsed) {
			const normalized = normalizeCheckerOutput(parsed);
			if (normalized) return normalized;
		}
		return { verdict: "fail", reason: "checker output parse error", resultContent: content };
	}
}

export function parseWatcherRoleOutput(content: string): Omit<WatcherOutput, "runtimeContext"> {
	try {
		const parsed = parseJsonResponse<WatcherJsonOutput>(content);
		const normalized = normalizeWatcherOutput(parsed);
		if (normalized) return normalized;
		return { decision: "confirm_failed", reason: "watcher output parse error: invalid decision" };
	} catch {
		const parsed = parseWatcherJsonish(content);
		if (parsed) {
			const normalized = normalizeWatcherOutput(parsed);
			if (normalized) return normalized;
		}
		return { decision: "confirm_failed", reason: "watcher output parse error" };
	}
}

export function parseDecomposerRoleOutput(content: string, maxChildren: number): Omit<DecomposerOutput, "runtimeContext"> {
	try {
		const parsed = parseJsonResponse<DecomposerJsonOutput>(content);
		const normalized = normalizeDecomposerOutput(parsed, maxChildren);
		if (normalized) return normalized;
		return { decision: "no_split", reason: "decomposer output parse error: invalid schema", children: [] };
	} catch {
		return { decision: "no_split", reason: "decomposer output parse error", children: [] };
	}
}

function normalizeDiscoveryDispatchSemanticPatchJsonContent(content: string): string {
	const trimmed = content.trim();
	const singleFenceMatch = trimmed.match(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/);
	if (singleFenceMatch) {
		return singleFenceMatch[1].trim();
	}
	return trimmed;
}

export function parseDiscoveryDispatchSemanticPatch(content: string, expectedItemId: string): DiscoveryDispatchSemanticPatchParsedOutput {
	try {
		const parsed = JSON.parse(normalizeDiscoveryDispatchSemanticPatchJsonContent(content)) as unknown;
		return normalizeDiscoveryDispatchSemanticPatch(parsed, expectedItemId, content);
	} catch {
		return parseDiscoveryDispatchSemanticPatchError(expectedItemId, "discovery dispatcher semantic patch parse error: invalid JSON", content);
	}
}

export function parseDiscoveryDispatchRoleOutput(content: string, expectedItemId: string): DiscoveryDispatchParsedOutput {
	try {
		const parsed = parseJsonResponse<unknown>(content);
		return normalizeDiscoveryDispatchOutput(parsed, expectedItemId, content);
	} catch {
		return parseDiscoveryDispatchError(expectedItemId, "discovery dispatcher output parse error: invalid JSON", content);
	}
}
