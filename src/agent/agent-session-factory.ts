import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { open, readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
	AuthStorage,
	createAgentSession,
	createBashToolDefinition,
	DefaultResourceLoader,
	ModelRegistry,
	SessionManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { prepareBrowserBoundBashEnvironment } from "../browser/browser-bound-bash.js";
import { buildRuntimeDependencyEnvironment } from "./runtime-dependencies.js";
import {
	parseJsonSettingsObject,
	readJsonScalarSetting,
	readNestedJsonScalarSetting,
} from "./settings-json.js";
import { getEffectiveProjectModelsPath } from "./model-provider-store.js";

export interface TextDeltaAssistantEventLike {
	type: "text_delta";
	delta: string;
}

export interface AssistantMessageEventLike {
	type: string;
	delta?: string;
}

export interface MessageUpdateEventLike {
	type: "message_update";
	assistantMessageEvent: TextDeltaAssistantEventLike | AssistantMessageEventLike;
}

export interface ToolExecutionStartEventLike {
	type: "tool_execution_start";
	toolCallId: string;
	toolName: string;
	args?: unknown;
}

export interface ToolExecutionUpdateEventLike {
	type: "tool_execution_update";
	toolCallId: string;
	toolName: string;
	args?: unknown;
	partialResult?: unknown;
}

export interface ToolExecutionEndEventLike {
	type: "tool_execution_end";
	toolCallId: string;
	toolName: string;
	result?: unknown;
	isError: boolean;
}

export interface QueueUpdateEventLike {
	type: "queue_update";
	steering: readonly string[];
	followUp: readonly string[];
}

export type AgentSessionEventLike =
	| MessageUpdateEventLike
	| ToolExecutionStartEventLike
	| ToolExecutionUpdateEventLike
	| ToolExecutionEndEventLike
	| QueueUpdateEventLike;

export type RawAgentSessionEventLike = AgentSessionEventLike | { type: string; [key: string]: unknown };

export interface PromptOptionsLike {
	streamingBehavior?: "steer" | "followUp";
}

export interface AgentSessionLike {
	sessionFile?: string;
	messages?: AgentSessionMessageLike[];
	subscribe(listener: (event: RawAgentSessionEventLike) => void): () => void;
	prompt(message: string, options?: PromptOptionsLike): Promise<void>;
	steer?(message: string): Promise<void>;
	followUp?(message: string): Promise<void>;
	abort?(): Promise<void>;
	clearQueue?(): { steering: string[]; followUp: string[] };
}

export interface AgentSessionMessageLike {
	role: string;
	content?: unknown;
	stopReason?: string;
	errorMessage?: string;
	timestamp?: number | string;
	usage?: {
		totalTokens?: number;
		input?: number;
		output?: number;
		cacheRead?: number;
		cacheWrite?: number;
	};
	command?: string;
	output?: string;
	summary?: string;
}

export interface AgentSessionFactory {
	createSession(input: { browserId?: string; browserScope?: string; conversationId: string; sessionFile?: string }): Promise<AgentSessionLike>;
	readSessionMessages?(sessionFile: string): Promise<AgentSessionMessageLike[] | undefined>;
	readRecentSessionMessages?(
		sessionFile: string,
		input: RecentSessionMessagesInput,
	): Promise<RecentSessionMessagesResult | undefined>;
	getAvailableSkills?(): Promise<RuntimeSkillListResult>;
	getSkillFingerprint?(): Promise<string | undefined>;
	getDefaultModelContext?(): ProjectDefaultModelContext;
}

export interface RecentSessionMessagesInput {
	limit: number;
	includeContextUsageAnchor?: boolean;
	chunkSizeBytes?: number;
}

export interface RecentSessionMessagesResult {
	messages: AgentSessionMessageLike[];
	contextMessages: AgentSessionMessageLike[];
	messageIndexOffset: number;
	reachedStart: boolean;
}

export interface RuntimeSkillInfo {
	name: string;
	path?: string;
}

export interface RuntimeSkillListResult {
	skills: RuntimeSkillInfo[];
	source: "fresh" | "cache";
	cachedAt: string;
}

export interface DefaultAgentSessionFactoryOptions {
	projectRoot: string;
	sessionDir: string;
	agentDir?: string;
	allowedSkillPaths?: string[];
	runtimeAgentRulesPath?: string;
	defaultModelProvider?: string;
	defaultModelId?: string;
	disabledSkillNames?: string[];
}

export interface ProjectDefaultModelContext {
	provider: string;
	model: string;
	contextWindow: number;
	maxResponseTokens: number;
	reserveTokens: number;
}

export function getDefaultSystemSkillPath(projectRoot: string): string {
	return join(projectRoot, ".pi", "skills");
}

export function getDefaultUserSkillPath(projectRoot: string): string {
	return join(projectRoot, "runtime", "skills-user");
}

export function getProjectAgentDirPath(projectRoot: string): string {
	return join(projectRoot, "runtime", "pi-agent");
}

export function getProjectModelsPath(projectRoot: string): string {
	return join(getProjectAgentDirPath(projectRoot), "models.json");
}

export function getBundledProjectSettingsPath(projectRoot: string): string {
	return join(projectRoot, ".pi", "settings.json");
}

export function getProjectSettingsPath(projectRoot: string): string {
	const runtimeSettingsPath = process.env.UGK_MODEL_SETTINGS_PATH?.trim();
	return runtimeSettingsPath || getBundledProjectSettingsPath(projectRoot);
}

export function readProjectSettingsContent(projectRoot: string): string | undefined {
	const settingsPath = getProjectSettingsPath(projectRoot);
	try {
		return readFileSyncUtf8(settingsPath);
	} catch {
		// Runtime settings are user state. If they do not exist yet, seed reads from bundled defaults.
	}

	const bundledPath = getBundledProjectSettingsPath(projectRoot);
	if (settingsPath === bundledPath) {
		return undefined;
	}

	try {
		return readFileSyncUtf8(bundledPath);
	} catch {
		return undefined;
	}
}

export function getDefaultAllowedSkillPaths(projectRoot: string): string[] {
	return [getDefaultSystemSkillPath(projectRoot), getDefaultUserSkillPath(projectRoot)];
}

export function createSkillRestrictedResourceLoader(options: {
	projectRoot: string;
	agentDir?: string;
	allowedSkillPaths: string[];
	runtimeAgentRulesPath?: string;
}): DefaultResourceLoader {
	const runtimeAgentRulesPath = options.runtimeAgentRulesPath;
	const agentDir = options.agentDir ?? getProjectAgentDirPath(options.projectRoot);
	return new DefaultResourceLoader({
		cwd: options.projectRoot,
		agentDir,
		noSkills: true,
		additionalSkillPaths: options.allowedSkillPaths,
				agentsFilesOverride: runtimeAgentRulesPath
			? (_current: { agentsFiles: Array<{ path: string; content: string }> }) => {
					const content = readOptionalRuntimeAgentRules(runtimeAgentRulesPath);
					if (!content) {
						return {
							agentsFiles: [],
						};
					}
					return {
						agentsFiles: [
							{
								path: runtimeAgentRulesPath,
								content,
							},
						],
					};
				}
			: undefined,
	});
}

export function createSkillFilteredResourceLoader(options: {
	projectRoot: string;
	agentDir?: string;
	allowedSkillPaths: string[];
	runtimeAgentRulesPath?: string;
	disabledSkillNames?: string[];
}): DefaultResourceLoader {
	const loader = createSkillRestrictedResourceLoader(options);
	const disabledSet = new Set(
		(options.disabledSkillNames ?? [])
			.map((name) => String(name || "").trim())
			.filter(Boolean),
	);
	if (disabledSet.size === 0) {
		return loader;
	}
	const originalGetSkills = loader.getSkills.bind(loader);
	(loader as DefaultResourceLoader & { getSkills: DefaultResourceLoader["getSkills"] }).getSkills = () => {
		const result = originalGetSkills();
		return {
			...result,
			skills: result.skills.filter((skill) => !disabledSet.has(skill.name)),
		};
	};
	return loader;
}

export function getDefaultRuntimeAgentRulesPath(projectRoot: string): string {
	return join(projectRoot, ".data", "agent", "AGENTS.md");
}

export function getLegacyDefaultRuntimeAgentRulesPath(projectRoot: string): string {
	return join(projectRoot, ".data", "agent", "AGENTS.local.md");
}

function readOptionalRuntimeAgentRules(filePath: string): string | undefined {
	try {
		const content = readFileSyncUtf8(filePath);
		return content.trim().length > 0 ? content : undefined;
	} catch {
		return undefined;
	}
}

async function collectSkillFiles(rootPath: string): Promise<string[]> {
	try {
		const entries = await readdir(rootPath, { withFileTypes: true });
		const files = await Promise.all(
			entries.map(async (entry) => {
				const nextPath = join(rootPath, entry.name);
				if (entry.isDirectory()) {
					return await collectSkillFiles(nextPath);
				}
				return entry.isFile() && entry.name === "SKILL.md" ? [nextPath] : [];
			}),
		);
		return files.flat();
	} catch (error) {
		if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

async function buildSkillFingerprint(allowedSkillPaths: string[], disabledSkillNames: string[] = []): Promise<string> {
	const hash = createHash("sha256");
	hash.update(JSON.stringify([...allowedSkillPaths].sort()));
	hash.update(JSON.stringify([...disabledSkillNames].sort()));

	for (const rootPath of allowedSkillPaths) {
		const skillFiles = (await collectSkillFiles(rootPath)).sort();
		for (const skillFile of skillFiles) {
			hash.update(`${relative(rootPath, skillFile)}\n`);
			hash.update(await readFile(skillFile, "utf8"));
			hash.update("\n---\n");
		}
	}

	return hash.digest("hex");
}

export function resolveProjectDefaultModelContext(projectRoot: string): ProjectDefaultModelContext {
	const fallback: ProjectDefaultModelContext = {
		provider: "unknown",
		model: "unknown",
		contextWindow: 128000,
		maxResponseTokens: 16384,
		reserveTokens: 16384,
	};

	const settingsContent = readProjectSettingsContent(projectRoot);
	if (!settingsContent) {
		return fallback;
	}

	const provider = readJsonScalarSetting(settingsContent, "defaultProvider") ?? fallback.provider;
	const model = readJsonScalarSetting(settingsContent, "defaultModel") ?? fallback.model;
	const reserveTokens = Number(readNestedJsonScalarSetting(settingsContent, "reserveTokens") ?? fallback.reserveTokens);

	const registry = ModelRegistry.create(AuthStorage.create(), getEffectiveProjectModelsPath(projectRoot));
	const resolvedModel = registry.find(provider, model);
	if (!resolvedModel) {
		return {
			...fallback,
			provider,
			model,
			reserveTokens: Number.isFinite(reserveTokens) ? reserveTokens : fallback.reserveTokens,
		};
	}

	return {
		provider: resolvedModel.provider,
		model: resolvedModel.id,
		contextWindow: resolvedModel.contextWindow,
		maxResponseTokens: resolvedModel.maxTokens,
		reserveTokens: Number.isFinite(reserveTokens) ? reserveTokens : fallback.reserveTokens,
	};
}

export function createProjectSettingsManager(projectRoot: string): SettingsManager {
	const settingsContent = readProjectSettingsContent(projectRoot);
	if (!settingsContent) {
		return SettingsManager.inMemory({});
	}

	return SettingsManager.inMemory(parseJsonSettingsObject(settingsContent));
}

export function resolveProjectDefaultSessionModel(projectRoot: string, modelRegistry: ModelRegistry) {
	const defaultModel = resolveProjectDefaultModelContext(projectRoot);
	if (defaultModel.provider === "unknown" || defaultModel.model === "unknown") {
		return undefined;
	}
	return modelRegistry.find(defaultModel.provider, defaultModel.model);
}

export function resolveAgentDefaultSessionModel(
	projectRoot: string,
	modelRegistry: ModelRegistry,
	input?: { provider?: string; model?: string },
) {
	if (input?.provider && input?.model) {
		return modelRegistry.find(input.provider, input.model) ?? resolveProjectDefaultSessionModel(projectRoot, modelRegistry);
	}
	return resolveProjectDefaultSessionModel(projectRoot, modelRegistry);
}

export function resolveAgentDefaultModelContext(
	projectRoot: string,
	input?: { provider?: string; model?: string },
): ProjectDefaultModelContext {
	if (!input?.provider || !input?.model) {
		return resolveProjectDefaultModelContext(projectRoot);
	}

	const projectFallback = resolveProjectDefaultModelContext(projectRoot);
	const registry = ModelRegistry.create(AuthStorage.create(), getEffectiveProjectModelsPath(projectRoot));
	const resolvedModel = registry.find(input.provider, input.model);
	if (!resolvedModel) {
		return projectFallback;
	}

	return {
		provider: resolvedModel.provider,
		model: resolvedModel.id,
		contextWindow: resolvedModel.contextWindow,
		maxResponseTokens: resolvedModel.maxTokens,
		reserveTokens: projectFallback.reserveTokens,
	};
}

function readFileSyncUtf8(filePath: string): string {
	return readFileSync(filePath, "utf8");
}

async function readSessionMessagesFromJsonl(sessionFile: string, projectRoot: string): Promise<AgentSessionMessageLike[]> {
	const sessionPath = normalizeSessionFilePath(sessionFile, projectRoot);
	const content = await readFile(sessionPath, "utf8");
	return parseSessionMessageLines(content.split(/\r?\n/));
}

async function readRecentSessionMessagesFromJsonl(
	sessionFile: string,
	projectRoot: string,
	input: RecentSessionMessagesInput,
): Promise<RecentSessionMessagesResult> {
	const sessionPath = normalizeSessionFilePath(sessionFile, projectRoot);
	const limit = normalizeRecentSessionMessageLimit(input.limit);
	const chunkSizeBytes = normalizeRecentSessionChunkSize(input.chunkSizeBytes);
	const handle = await open(sessionPath, "r");

	try {
		const stat = await handle.stat();
		let position = stat.size;
		let carry = "";
		let lines: string[] = [];
		let reachedStart = stat.size === 0;
		let firstCompleteLineOffset = stat.size;

		while (position > 0) {
			const readSize = Math.min(chunkSizeBytes, position);
			position -= readSize;
			const buffer = Buffer.allocUnsafe(readSize);
			const { bytesRead } = await handle.read(buffer, 0, readSize, position);
			const chunk = buffer.subarray(0, bytesRead).toString("utf8");
			const combined = chunk + carry;
			const splitLines = combined.split(/\r?\n/);

			if (position > 0) {
				const newlineMatch = /\r?\n/.exec(combined);
				carry = splitLines.shift() ?? "";
				if (newlineMatch && splitLines.length > 0) {
					firstCompleteLineOffset = position + Buffer.byteLength(combined.slice(0, newlineMatch.index + newlineMatch[0].length), "utf8");
				}
			} else {
				carry = "";
				reachedStart = true;
				firstCompleteLineOffset = 0;
			}

			lines = splitLines.concat(lines);
			const parsedMessages = parseSessionMessageLines(lines);
			if (
				parsedMessages.length >= limit &&
				(!input.includeContextUsageAnchor || findLastUsableAssistantUsageIndex(parsedMessages) >= 0)
			) {
				const messageIndexOffset = await countSessionMessageEventsBeforeOffset(handle, firstCompleteLineOffset);
				return buildRecentSessionMessagesResult(parsedMessages, {
					limit,
					messageIndexOffset,
					reachedStart,
					includeContextUsageAnchor: Boolean(input.includeContextUsageAnchor),
				});
			}
		}

		const parsedMessages = parseSessionMessageLines(lines);
		return buildRecentSessionMessagesResult(parsedMessages, {
			limit,
			messageIndexOffset: 0,
			reachedStart: true,
			includeContextUsageAnchor: Boolean(input.includeContextUsageAnchor),
		});
	} finally {
		await handle.close();
	}
}

function buildRecentSessionMessagesResult(
	parsedMessages: AgentSessionMessageLike[],
	input: {
		limit: number;
		messageIndexOffset: number;
		reachedStart: boolean;
		includeContextUsageAnchor: boolean;
	},
): RecentSessionMessagesResult {
	const messages = parsedMessages.slice(-input.limit);
	const usageAnchorIndex = input.includeContextUsageAnchor ? findLastUsableAssistantUsageIndex(parsedMessages) : -1;
	return {
		messages,
		contextMessages: usageAnchorIndex >= 0 ? parsedMessages.slice(usageAnchorIndex) : messages,
		messageIndexOffset: input.messageIndexOffset + Math.max(0, parsedMessages.length - messages.length),
		reachedStart: input.reachedStart,
	};
}

function parseSessionMessageLines(lines: readonly string[]): AgentSessionMessageLike[] {
	const messages: AgentSessionMessageLike[] = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}

		let event: {
			type?: string;
			timestamp?: string;
			message?: AgentSessionMessageLike;
		};
		try {
			event = JSON.parse(trimmed) as typeof event;
		} catch {
			continue;
		}

		if (event.type !== "message" || !event.message || typeof event.message.role !== "string") {
			continue;
		}
		messages.push({
			...event.message,
			timestamp: event.message.timestamp ?? event.timestamp,
		});
	}
	return messages;
}

async function countSessionMessageEventsBeforeOffset(
	handle: Awaited<ReturnType<typeof open>>,
	byteLimit: number,
): Promise<number> {
	if (byteLimit <= 0) {
		return 0;
	}

	const chunkSizeBytes = 64 * 1024;
	let position = 0;
	let carry = "";
	let count = 0;

	while (position < byteLimit) {
		const readSize = Math.min(chunkSizeBytes, byteLimit - position);
		const buffer = Buffer.allocUnsafe(readSize);
		const { bytesRead } = await handle.read(buffer, 0, readSize, position);
		if (bytesRead <= 0) {
			break;
		}

		position += bytesRead;
		const combined = carry + buffer.subarray(0, bytesRead).toString("utf8");
		const lines = combined.split(/\r?\n/);
		carry = lines.pop() ?? "";
		count += countSessionMessageEventLines(lines);
	}

	if (carry.trim()) {
		count += countSessionMessageEventLines([carry]);
	}
	return count;
}

function countSessionMessageEventLines(lines: readonly string[]): number {
	return lines.reduce((count, line) => count + (/"type"\s*:\s*"message"/.test(line) ? 1 : 0), 0);
}

function findLastUsableAssistantUsageIndex(messages: readonly AgentSessionMessageLike[]): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message.role !== "assistant" || !message.usage) {
			continue;
		}
		if (message.stopReason === "aborted" || message.stopReason === "error") {
			continue;
		}
		return index;
	}
	return -1;
}

function normalizeRecentSessionMessageLimit(limit: number): number {
	if (!Number.isFinite(limit)) {
		return 1;
	}
	return Math.max(1, Math.floor(limit));
}

function normalizeRecentSessionChunkSize(chunkSizeBytes: number | undefined): number {
	if (typeof chunkSizeBytes !== "number" || !Number.isFinite(chunkSizeBytes)) {
		return 64 * 1024;
	}
	return Math.max(1024, Math.floor(chunkSizeBytes));
}

function normalizeSessionFilePath(sessionFile: string, projectRoot: string): string {
	const normalizedProjectRoot = projectRoot.replace(/\\/g, "/");
	if (sessionFile === "/app") {
		return normalizedProjectRoot;
	}
	if (sessionFile.startsWith("/app/")) {
		return `${normalizedProjectRoot}${sessionFile.slice("/app".length)}`;
	}
	return sessionFile;
}

export function createDefaultAgentSessionFactory(
	options: DefaultAgentSessionFactoryOptions,
): AgentSessionFactory {
	const allowedSkillPaths = options.allowedSkillPaths ?? getDefaultAllowedSkillPaths(options.projectRoot);
		const disabledSkillNames = options.disabledSkillNames ?? [];
	const runtimeAgentRulesPath = options.runtimeAgentRulesPath ?? getDefaultRuntimeAgentRulesPath(options.projectRoot);
	let cachedSkillList: { fingerprint: string; skills: RuntimeSkillInfo[]; cachedAt: string; checkedAtMs: number } | null = null;
	let lastSkillCacheTimestampMs = 0;

	function nextSkillCacheTimestamp(): string {
		const now = Date.now();
		lastSkillCacheTimestampMs = Math.max(now, lastSkillCacheTimestampMs + 1);
		return new Date(lastSkillCacheTimestampMs).toISOString();
	}

	async function loadSkills(): Promise<RuntimeSkillInfo[]> {
		const resourceLoader = createSkillFilteredResourceLoader({
			projectRoot: options.projectRoot,
			agentDir: options.agentDir,
			allowedSkillPaths,
			runtimeAgentRulesPath,
			disabledSkillNames,
		});
		await resourceLoader.reload();
		const result = await resourceLoader.getSkills();
		return result.skills
			.map((skill) => ({
				name: skill.name,
				path: "path" in skill && typeof skill.path === "string" ? skill.path : undefined,
			}))
			.sort((left, right) => left.name.localeCompare(right.name));
	}

	async function getAvailableSkills(): Promise<RuntimeSkillListResult> {
		const fingerprint = await buildSkillFingerprint(allowedSkillPaths, disabledSkillNames);
		const now = Date.now();
		if (cachedSkillList?.fingerprint === fingerprint && now - cachedSkillList.checkedAtMs < 30_000) {
			cachedSkillList.checkedAtMs = now;
			return {
				skills: cachedSkillList.skills.map((skill) => ({ ...skill })),
				source: "cache",
				cachedAt: cachedSkillList.cachedAt,
			};
		}

		const skills = await loadSkills();
		const cachedAt = nextSkillCacheTimestamp();
		cachedSkillList = {
			fingerprint,
			skills: skills.map((skill) => ({ ...skill })),
			cachedAt,
			checkedAtMs: now,
		};
		return {
			skills,
			source: "fresh",
			cachedAt,
		};
	}

	return {
		async createSession(input) {
			const sessionManager = input.sessionFile
				? SessionManager.open(input.sessionFile, options.sessionDir)
				: SessionManager.create(options.projectRoot, options.sessionDir);
			const authStorage = AuthStorage.create();
			const modelRegistry = ModelRegistry.create(authStorage, getEffectiveProjectModelsPath(options.projectRoot));
			const resourceLoader = createSkillFilteredResourceLoader({
				projectRoot: options.projectRoot,
				agentDir: options.agentDir,
				allowedSkillPaths,
				runtimeAgentRulesPath,
				disabledSkillNames,
			});

			await resourceLoader.reload();
			const settingsManager = createProjectSettingsManager(options.projectRoot);
			const runtimeDependencyEnv = buildRuntimeDependencyEnvironment(options.projectRoot);
			const browserEnv = await prepareBrowserBoundBashEnvironment({
				workspaceRoot: options.projectRoot,
				browserId: input.browserId,
				browserScope: input.browserScope,
				env: { ...process.env, ...runtimeDependencyEnv },
			});

			const { session } = await createAgentSession({
				cwd: options.projectRoot,
				agentDir: options.agentDir,
				authStorage,
				customTools: [
					createBashToolDefinition(options.projectRoot, {
						commandPrefix: settingsManager.getShellCommandPrefix(),
						shellPath: settingsManager.getShellPath(),
						spawnHook: (context) => ({
							...context,
							env: {
								...context.env,
								...runtimeDependencyEnv,
								...browserEnv,
							},
						}),
					}) as never,
				],
				modelRegistry,
				model: resolveAgentDefaultSessionModel(options.projectRoot, modelRegistry, {
					provider: options.defaultModelProvider,
					model: options.defaultModelId,
				}),
				settingsManager,
				sessionManager,
				resourceLoader,
			});

			return session;
		},
		async readSessionMessages(sessionFile) {
			return await readSessionMessagesFromJsonl(sessionFile, options.projectRoot);
		},
		async readRecentSessionMessages(sessionFile, input) {
			return await readRecentSessionMessagesFromJsonl(sessionFile, options.projectRoot, input);
		},
		async getAvailableSkills() {
			return await getAvailableSkills();
		},
		async getSkillFingerprint() {
			return await buildSkillFingerprint(allowedSkillPaths);
		},
		getDefaultModelContext() {
			return resolveAgentDefaultModelContext(options.projectRoot, {
				provider: options.defaultModelProvider,
				model: options.defaultModelId,
			});
		},
	};
}
