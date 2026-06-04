import type { TeamTask, TeamPlan, TeamRoleRuntimeContext, TeamOutputValidationResult } from "./types.js";
import type { RawAgentSessionEventLike } from "../agent/agent-session-factory.js";

export interface WorkerInput {
	runId: string;
	task: TeamTask;
	attemptId: string;
	workDir: string;
	outputDir: string;
	artifactPublicDir?: string;
	artifactPublicBaseUrl?: string;
	acceptanceRules: string[];
	feedback?: string;
	signal?: AbortSignal;
	onSessionEvent?: (event: RawAgentSessionEventLike) => void;
}

export interface WorkerOutput {
	content: string;
	artifactRefs: string[];
	runtimeContext?: TeamRoleRuntimeContext;
}

export interface CheckerInput {
	runId: string;
	task: TeamTask;
	attemptId: string;
	workerOutputRef: string;
	artifactPublicDir?: string;
	artifactPublicBaseUrl?: string;
	acceptanceRules: string[];
	outputValidation?: TeamOutputValidationResult;
	signal?: AbortSignal;
	onSessionEvent?: (event: RawAgentSessionEventLike) => void;
}

export interface CheckerOutput {
	verdict: "pass" | "revise" | "fail";
	reason: string;
	feedback?: string;
	resultContent?: string;
	runtimeContext?: TeamRoleRuntimeContext;
}

export interface WatcherInput {
	runId: string;
	task: TeamTask;
	attemptId: string;
	workUnitStatus: "passed" | "failed";
	resultRef: string | null;
	errorSummary: string | null;
	artifactPublicDir?: string;
	artifactPublicBaseUrl?: string;
	outputValidation?: TeamOutputValidationResult;
	signal?: AbortSignal;
}

export interface WatcherOutput {
	decision: "accept_task" | "confirm_failed" | "request_revision";
	reason: string;
	revisionMode?: "amend" | "redo";
	feedback?: string;
	runtimeContext?: TeamRoleRuntimeContext;
}

export interface FinalizerInput {
	runId: string;
	plan: TeamPlan;
	runSummary?: { totalTasks: number; succeededTasks: number; failedTasks: number; cancelledTasks: number; skippedTasks: number };
	taskResults: Array<{ taskId: string; status: "succeeded" | "failed" | "cancelled" | "skipped"; resultRef: string | null; errorSummary: string | null; previousErrorSummary?: string | null; manualDisposition?: string }>;
	artifactPublicDir?: string;
	artifactPublicBaseUrl?: string;
	signal?: AbortSignal;
}

export interface FinalizerOutput {
	finalReport: string;
	runtimeContext?: TeamRoleRuntimeContext;
}

export interface DecomposerInput {
	runId: string;
	plan: TeamPlan;
	task: TeamTask;
	maxChildren: number;
	artifactPublicDir?: string;
	artifactPublicBaseUrl?: string;
	signal?: AbortSignal;
}

export interface DecomposerOutput {
	decision: "split" | "no_split";
	reason: string;
	children?: TeamTask[];
	runtimeContext?: TeamRoleRuntimeContext;
}

export interface DiscoveryDispatchInput {
	runId: string;
	discoveryTaskId: string;
	discoveryTaskTitle: string;
	discoveryGoal: string;
	dispatchGoal: string;
	outputKey: string;
	itemId: string;
	itemPayload: Record<string, unknown>;
	requiredItemFields: string[];
	recommendedItemFields?: string[];
	generatedWorkerAgentId?: string;
	generatedCheckerAgentId?: string;
	artifactPublicDir?: string;
	artifactPublicBaseUrl?: string;
	signal?: AbortSignal;
}

export interface DiscoveryDispatchWorkUnitDraft {
	title: string;
	input: { text: string };
	outputContract: { text: string };
	acceptance: { rules: string[] };
}

export interface DiscoveryDispatchSemanticPatch {
	itemId: string;
	title: string;
	workerInstruction: string;
	itemAcceptanceHints?: string[];
	outputContractHint?: string;
}

export type DiscoveryDispatchOutput =
	| { ok: true; itemId: string; workUnit: DiscoveryDispatchWorkUnitDraft; runtimeContext?: TeamRoleRuntimeContext }
	| { ok: false; itemId: string; error: string; rawContent?: string; runtimeContext?: TeamRoleRuntimeContext };

export interface TeamRoleRunner {
	runWorker(input: WorkerInput): Promise<WorkerOutput>;
	runChecker(input: CheckerInput): Promise<CheckerOutput>;
	runWatcher(input: WatcherInput): Promise<WatcherOutput>;
	runFinalizer(input: FinalizerInput): Promise<FinalizerOutput>;
	runDecomposer(input: DecomposerInput): Promise<DecomposerOutput>;
	runDiscoveryDispatcher?(input: DiscoveryDispatchInput): Promise<DiscoveryDispatchOutput>;
}

export interface ProfileAwareTeamRoleRunner extends TeamRoleRunner {
	setProfileIds(profiles: { workerProfileId: string; checkerProfileId: string; watcherProfileId: string; finalizerProfileId: string; decomposerProfileId: string; dispatcherProfileId?: string }): void;
}

export interface MockRoleRunnerConfig {
	workerOutputs?: string[];
	checkerOutputs?: CheckerOutput[];
	watcherOutputs?: WatcherOutput[];
	decomposerOutputs?: DecomposerOutput[];
	discoveryDispatchOutputs?: DiscoveryDispatchOutput[];
	finalReport?: string;
}

export class MockRoleRunner implements TeamRoleRunner {
	private workerCallIndex = 0;
	private checkerCallIndex = 0;
	private watcherCallIndex = 0;
	private decomposerCallIndex = 0;
	private discoveryDispatcherCallIndex = 0;
	private readonly workerOutputs: string[];
	private readonly checkerOutputs: CheckerOutput[];
	private readonly watcherOutputs: WatcherOutput[];
	private readonly decomposerOutputs: DecomposerOutput[];
	private readonly discoveryDispatchOutputs: DiscoveryDispatchOutput[];
	private readonly finalReportContent: string;

	constructor(config: MockRoleRunnerConfig = {}) {
		this.workerOutputs = config.workerOutputs ?? [];
		this.checkerOutputs = config.checkerOutputs ?? [];
		this.watcherOutputs = config.watcherOutputs ?? [];
		this.decomposerOutputs = config.decomposerOutputs ?? [];
		this.discoveryDispatchOutputs = config.discoveryDispatchOutputs ?? [];
		this.finalReportContent = config.finalReport ?? "# 最终汇总\n\n全部任务已完成。";
	}

	async runWorker(input: WorkerInput): Promise<WorkerOutput> {
		const content = this.workerOutputs[this.workerCallIndex] ?? `任务 ${input.task.id} 已完成`;
		this.workerCallIndex++;
		return { content, artifactRefs: [] };
	}

	async runChecker(_input: CheckerInput): Promise<CheckerOutput> {
		const output = this.checkerOutputs[this.checkerCallIndex] ?? { verdict: "pass" as const, reason: "ok", resultContent: "accepted result" };
		this.checkerCallIndex++;
		return output;
	}

	async runWatcher(_input: WatcherInput): Promise<WatcherOutput> {
		const output = this.watcherOutputs[this.watcherCallIndex] ?? { decision: "accept_task" as const, reason: "ok" };
		this.watcherCallIndex++;
		return output;
	}

	async runFinalizer(input: FinalizerInput): Promise<FinalizerOutput> {
		const lines = input.taskResults.map(r => `- ${r.taskId}: ${r.status}`);
		const report = `${this.finalReportContent}\n\n${lines.join("\n")}`;
		return { finalReport: report };
	}

	async runDecomposer(_input: DecomposerInput): Promise<DecomposerOutput> {
		const output = this.decomposerOutputs[this.decomposerCallIndex] ?? { decision: "no_split" as const, reason: "mock decomposer no split", children: [] };
		this.decomposerCallIndex++;
		return output;
	}

	async runDiscoveryDispatcher(input: DiscoveryDispatchInput): Promise<DiscoveryDispatchOutput> {
		const output = this.discoveryDispatchOutputs[this.discoveryDispatcherCallIndex] ?? {
			ok: true as const,
			itemId: input.itemId,
			workUnit: {
				title: `Dispatch discovery item ${input.itemId}`,
				input: { text: `Process discovery item ${input.itemId} from ${input.discoveryTaskTitle}.` },
				outputContract: { text: `Return a concise result for discovery item ${input.itemId}.` },
				acceptance: { rules: [`Result addresses discovery item ${input.itemId}.`] },
			},
		};
		this.discoveryDispatcherCallIndex++;
		return output;
	}

	reset(): void {
		this.workerCallIndex = 0;
		this.checkerCallIndex = 0;
		this.watcherCallIndex = 0;
		this.decomposerCallIndex = 0;
		this.discoveryDispatcherCallIndex = 0;
	}
}
