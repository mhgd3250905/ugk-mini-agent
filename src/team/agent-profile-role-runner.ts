import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TeamRoleRunner, ProfileAwareTeamRoleRunner, WorkerInput, WorkerOutput, CheckerInput, CheckerOutput, WatcherInput, WatcherOutput, FinalizerInput, FinalizerOutput, DecomposerInput, DecomposerOutput, DiscoveryDispatchInput, DiscoveryDispatchOutput } from "./role-runner.js";
import type { TeamRoleRuntimeContext } from "./types.js";
import { buildWorkerPrompt, buildCheckerPrompt, buildWatcherPrompt, buildFinalizerPrompt, buildDecomposerPrompt, buildDiscoveryDispatchPrompt, parseCheckerRoleOutput, parseWatcherRoleOutput, parseDecomposerRoleOutput, parseDiscoveryDispatchSemanticPatch } from "./role-prompt-contract.js";
import { compileDiscoveryDispatchWorkUnit } from "./discovery-dispatch-workunit-compiler.js";
import type { BackgroundAgentSessionFactory } from "../agent/background-agent-runner.js";
import { BackgroundAgentProfileResolver } from "../agent/background-agent-profile.js";
import type { ResolvedBackgroundAgentSnapshot, BackgroundAgentProfileRef } from "../agent/background-agent-profile.js";
import { ProjectBackgroundSessionFactory } from "../agent/background-agent-session-factory.js";
import { findLastAssistantMessage, assertAssistantMessageSucceeded } from "../agent/agent-run-result.js";
import { stringifyVisibleAssistantContent } from "../agent/background-agent-runner.js";
import { createBrowserCleanupScope, runWithScopedAgentEnvironment } from "../agent/agent-run-scope.js";
import { runWithBackgroundWorkspaceContext } from "../agent/background-workspace-context.js";
import type { AgentSessionLike } from "../agent/agent-session-factory.js";
import type { RawAgentSessionEventLike } from "../agent/agent-session-factory.js";

export interface AgentProfileRoleRunnerOptions {
	projectRoot: string;
	teamDataDir: string;
	workerProfileId: string;
	checkerProfileId: string;
	watcherProfileId: string;
	finalizerProfileId: string;
	decomposerProfileId?: string;
	dispatcherProfileId?: string;
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

function buildDiscoveryDispatcherRoleKey(discoveryTaskId: string, itemId: string): string {
	const sanitize = (value: string) => {
		const normalized = value.replace(/[^A-Za-z0-9_.-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
		return (normalized || "unknown").slice(0, 80);
	};
	return `dispatch_${sanitize(discoveryTaskId)}_${sanitize(itemId)}`.slice(0, 180);
}

const DISCOVERY_DISPATCH_REPAIR_RAW_CONTENT_MAX_CHARS = 8_000;

function buildDiscoveryDispatchRepairPrompt(input: DiscoveryDispatchInput, error: string, rawContent: string | undefined): string {
	const clippedRaw = (rawContent ?? "").slice(0, DISCOVERY_DISPATCH_REPAIR_RAW_CONTENT_MAX_CHARS);
	return `${buildDiscoveryDispatchPrompt(input)}

## Previous output was rejected
error: ${error}

Your previous output was not accepted by the deterministic JSON parser.
Rewrite the semantic patch for exact itemId "${input.itemId}".

Rules for this repair attempt:
- Output only one JSON object.
- The first non-whitespace character must be "{".
- The last non-whitespace character must be "}".
- Do not output markdown, code fences, explanations, headings, or any text outside the JSON object.
- Do not output workUnit, outputContract, acceptance, worker/checker/leader/source identity, outputPorts, or outputCheck.

Previous output:
<previous_output>
${clippedRaw}
</previous_output>`;
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

	setProfileIds(profiles: { workerProfileId: string; checkerProfileId: string; watcherProfileId: string; finalizerProfileId: string; decomposerProfileId: string; dispatcherProfileId?: string }): void {
		this.options.workerProfileId = profiles.workerProfileId;
		this.options.checkerProfileId = profiles.checkerProfileId;
		this.options.watcherProfileId = profiles.watcherProfileId;
		this.options.finalizerProfileId = profiles.finalizerProfileId;
		this.options.decomposerProfileId = profiles.decomposerProfileId;
		if (profiles.dispatcherProfileId !== undefined) {
			this.options.dispatcherProfileId = profiles.dispatcherProfileId;
		}
	}

	async runWorker(input: WorkerInput): Promise<WorkerOutput> {
		const snapshot = await this.resolveProfile(this.options.workerProfileId);
		const workspace = await this.createRoleWorkspace(input.runId, input.attemptId, "worker");
		const prompt = buildWorkerPrompt(input.task, input.acceptanceRules, input.feedback);

		const sessionResult = await this.runSession(snapshot, this.options.workerProfileId, input.runId, workspace, prompt, input.signal, { role: "worker", roleKey: input.attemptId, artifactPublicBaseUrl: input.artifactPublicBaseUrl }, input.onSessionEvent);

		return { content: sessionResult.content, artifactRefs: [], runtimeContext: sessionResult.runtimeContext };
	}

	async runChecker(input: CheckerInput): Promise<CheckerOutput> {
		const snapshot = await this.resolveProfile(this.options.checkerProfileId);
		const workspace = await this.createRoleWorkspace(input.runId, input.attemptId, "checker");
		const workerOutput = await readRefContent(this.options.teamDataDir, input.runId, input.workerOutputRef);
		const prompt = buildCheckerPrompt(input.task, input.acceptanceRules, workerOutput, input.outputValidation);

		const sessionResult = await this.runSession(snapshot, this.options.checkerProfileId, input.runId, workspace, prompt, input.signal, { role: "checker", roleKey: input.attemptId, artifactPublicBaseUrl: input.artifactPublicBaseUrl }, input.onSessionEvent);
		const content = sessionResult.content;

		return { ...parseCheckerRoleOutput(content), runtimeContext: sessionResult.runtimeContext };
	}

	async runWatcher(input: WatcherInput): Promise<WatcherOutput> {
		const snapshot = await this.resolveProfile(this.options.watcherProfileId);
		const workspace = await this.createRoleWorkspace(input.runId, input.attemptId, "watcher");
		const prompt = buildWatcherPrompt(input.task, input.workUnitStatus, input.resultRef, input.errorSummary, input.outputValidation);

		const sessionResult = await this.runSession(snapshot, this.options.watcherProfileId, input.runId, workspace, prompt, input.signal, { role: "watcher", roleKey: input.attemptId, artifactPublicBaseUrl: input.artifactPublicBaseUrl });
		const content = sessionResult.content;

		return { ...parseWatcherRoleOutput(content), runtimeContext: sessionResult.runtimeContext };
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

		const prompt = buildFinalizerPrompt(input.plan, taskResultsWithContent, input.runSummary);

		const sessionResult = await this.runSession(snapshot, this.options.finalizerProfileId, input.runId, workspace, prompt, input.signal, { role: "finalizer", roleKey: "finalizer", artifactPublicBaseUrl: input.artifactPublicBaseUrl });

		return { finalReport: sessionResult.content, runtimeContext: sessionResult.runtimeContext };
	}

	async runDecomposer(input: DecomposerInput): Promise<DecomposerOutput> {
		const requestedProfileId = this.options.decomposerProfileId ?? this.options.workerProfileId;
		const snapshot = await this.resolveProfile(requestedProfileId);
		const roleKey = `decompose_${input.task.id}`;
		const workspace = await this.createRoleWorkspace(input.runId, roleKey, "decomposer");
		const prompt = buildDecomposerPrompt(input);

		const sessionResult = await this.runSession(snapshot, requestedProfileId, input.runId, workspace, prompt, input.signal, { role: "decomposer", roleKey, artifactPublicBaseUrl: input.artifactPublicBaseUrl });
		const content = sessionResult.content;

		return { ...parseDecomposerRoleOutput(content, input.maxChildren), runtimeContext: sessionResult.runtimeContext };
	}

	async runDiscoveryDispatcher(input: DiscoveryDispatchInput): Promise<DiscoveryDispatchOutput> {
		const requestedProfileId = this.options.dispatcherProfileId ?? this.options.decomposerProfileId ?? this.options.workerProfileId;
		const snapshot = await this.resolveProfile(requestedProfileId);
		const roleKey = buildDiscoveryDispatcherRoleKey(input.discoveryTaskId, input.itemId);
		const role = "discovery-dispatcher";
		const workspace = await this.createRoleWorkspace(input.runId, roleKey, role);
		const prompt = buildDiscoveryDispatchPrompt(input);

		const sessionResult = await this.runSession(snapshot, requestedProfileId, input.runId, workspace, prompt, input.signal, { role, roleKey, artifactPublicBaseUrl: input.artifactPublicBaseUrl });
		const content = sessionResult.content;
		const parsed = parseDiscoveryDispatchSemanticPatch(content, input.itemId);

		if (parsed.ok) {
			return {
				ok: true,
				itemId: parsed.itemId,
				workUnit: compileDiscoveryDispatchWorkUnit(input, parsed.patch),
				runtimeContext: sessionResult.runtimeContext,
			};
		}
		const repairPrompt = buildDiscoveryDispatchRepairPrompt(input, parsed.error, parsed.rawContent);
		const repairSessionResult = await this.runSession(snapshot, requestedProfileId, input.runId, workspace, repairPrompt, input.signal, { role, roleKey, artifactPublicBaseUrl: input.artifactPublicBaseUrl });
		const repaired = parseDiscoveryDispatchSemanticPatch(repairSessionResult.content, input.itemId);
		if (repaired.ok) {
			return {
				ok: true,
				itemId: repaired.itemId,
				workUnit: compileDiscoveryDispatchWorkUnit(input, repaired.patch),
				runtimeContext: repairSessionResult.runtimeContext,
			};
		}
		return { ...repaired, runtimeContext: repairSessionResult.runtimeContext };
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
		roleContext: { role: string; roleKey: string; artifactPublicBaseUrl?: string },
		onSessionEvent?: (event: RawAgentSessionEventLike) => void,
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
		let unsubscribe: (() => void) | undefined;

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
			unsubscribe = onSessionEvent ? session.subscribe(onSessionEvent) : undefined;

			const wsEnv: Record<string, string | undefined> = {
				OUTPUT_DIR: workspace.outputDir,
				WORK_DIR: workspace.workDir,
				INPUT_DIR: workspace.workDir,
				LOGS_DIR: workspace.outputDir,
				ARTIFACT_PUBLIC_DIR: workspace.outputDir,
				ARTIFACT_PUBLIC_BASE_URL: roleContext.artifactPublicBaseUrl,
			};

			await runWithScopedAgentEnvironment(browserCleanupScope, async () => {
				await runWithBackgroundWorkspaceContext(wsEnv, () => promptWithAbort(session!, prompt, signal));
			});
		} finally {
			unsubscribe?.();
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
