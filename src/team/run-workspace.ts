import type {
	AttemptLifecyclePhase,
	AttemptStatus,
	TaskDecompositionRecord,
	TaskExpansionRecord,
	TeamAttemptCheckerSummary,
	TeamAttemptMetadata,
	TeamAttemptRoleProcess,
	TeamAttemptWatcherSummary,
	TeamAttemptWorkerSummary,
	TeamDiscoveryResultRecord,
	TeamPlan,
	TeamRunState,
	TeamTask,
} from "./types.js";
import { RunArtifactStore } from "./run-workspace-artifacts.js";
import { RunAttemptStore } from "./run-workspace-attempts.js";
import { RunRecordStore } from "./run-workspace-records.js";
import { RunStateStore } from "./run-workspace-state.js";

export class RunWorkspace {
	readonly state: RunStateStore;
	readonly attempts: RunAttemptStore;
	readonly artifacts: RunArtifactStore;
	readonly records: RunRecordStore;
	readonly events: RunStateStore["events"];

	constructor(rootDir: string) {
		this.state = new RunStateStore(rootDir);
		this.attempts = new RunAttemptStore(rootDir);
		this.artifacts = new RunArtifactStore(rootDir);
		this.records = new RunRecordStore(rootDir, this.state);
		this.events = this.state.events;
	}

	async createRun(plan: TeamPlan, teamUnitId: string, options?: { maxRunDurationMinutes?: number }): Promise<TeamRunState> {
		return this.state.createRun(plan, teamUnitId, options);
	}

	async createRunWithAdmission(
		plan: TeamPlan,
		teamUnitId: string,
		maxConcurrentRuns: number,
		options?: { maxRunDurationMinutes?: number },
	): Promise<TeamRunState> {
		return this.state.createRunWithAdmission(plan, teamUnitId, maxConcurrentRuns, options);
	}

	async getState(runId: string): Promise<TeamRunState | null> {
		return this.state.getState(runId);
	}

	async saveState(state: TeamRunState): Promise<void> {
		await this.state.saveState(state);
	}

	async patchState(runId: string, mutator: (state: TeamRunState) => void | Promise<void>): Promise<TeamRunState> {
		return this.state.patchState(runId, mutator);
	}

	async claimNextRunnableRun(ownerId: string, leaseTtlMs: number): Promise<TeamRunState | null> {
		return this.state.claimNextRunnableRun(ownerId, leaseTtlMs);
	}

	async claimRun(runId: string, ownerId: string, leaseTtlMs: number): Promise<TeamRunState | null> {
		return this.state.claimRun(runId, ownerId, leaseTtlMs);
	}

	async heartbeatRunLease(runId: string, ownerId: string, leaseTtlMs: number): Promise<boolean> {
		return this.state.heartbeatRunLease(runId, ownerId, leaseTtlMs);
	}

	async releaseRunLease(runId: string, ownerId: string): Promise<void> {
		await this.state.releaseRunLease(runId, ownerId);
	}

	async clearRunLease(runId: string): Promise<void> {
		await this.state.clearRunLease(runId);
	}

	async listStates(): Promise<TeamRunState[]> {
		return this.state.listStates();
	}

	async deleteRun(runId: string): Promise<void> {
		await this.state.deleteRun(runId);
	}

	async createAttempt(runId: string, taskId: string): Promise<{ attemptId: string; attemptRoot: string }> {
		return this.attempts.createAttempt(runId, taskId);
	}

	async updateAttemptStatus(runId: string, taskId: string, attemptId: string, status: string): Promise<void> {
		await this.attempts.updateAttemptStatus(runId, taskId, attemptId, status);
	}

	async updateAttemptPhase(runId: string, taskId: string, attemptId: string, phase: AttemptLifecyclePhase): Promise<void> {
		await this.attempts.updateAttemptPhase(runId, taskId, attemptId, phase);
	}

	async recordAttemptWorkerOutput(runId: string, taskId: string, attemptId: string, summary: TeamAttemptWorkerSummary): Promise<void> {
		await this.attempts.recordAttemptWorkerOutput(runId, taskId, attemptId, summary);
	}

	async recordAttemptCheckerResult(runId: string, taskId: string, attemptId: string, summary: TeamAttemptCheckerSummary): Promise<void> {
		await this.attempts.recordAttemptCheckerResult(runId, taskId, attemptId, summary);
	}

	async recordAttemptWatcherResult(runId: string, taskId: string, attemptId: string, summary: TeamAttemptWatcherSummary): Promise<void> {
		await this.attempts.recordAttemptWatcherResult(runId, taskId, attemptId, summary);
	}

	async recordAttemptRoleProcess(runId: string, taskId: string, attemptId: string, process: TeamAttemptRoleProcess): Promise<void> {
		await this.attempts.recordAttemptRoleProcess(runId, taskId, attemptId, process);
	}

	async finishAttempt(
		runId: string,
		taskId: string,
		attemptId: string,
		input: {
			status: AttemptStatus;
			phase: AttemptLifecyclePhase;
			resultRef?: string | null;
			errorSummary?: string | null;
		},
	): Promise<void> {
		await this.attempts.finishAttempt(runId, taskId, attemptId, input);
	}

	async writeWorkerOutput(runId: string, taskId: string, attemptId: string, index: number, content: string): Promise<string> {
		return this.attempts.writeWorkerOutput(runId, taskId, attemptId, index, content);
	}

	async writeCheckerVerdict(runId: string, taskId: string, attemptId: string, index: number, verdict: unknown): Promise<string> {
		return this.attempts.writeCheckerVerdict(runId, taskId, attemptId, index, verdict);
	}

	async writeCheckerOutput(runId: string, taskId: string, attemptId: string, index: number, content: string): Promise<string> {
		return this.attempts.writeCheckerOutput(runId, taskId, attemptId, index, content);
	}

	async writeAcceptedResult(runId: string, taskId: string, attemptId: string, content: string): Promise<string> {
		return this.attempts.writeAcceptedResult(runId, taskId, attemptId, content);
	}

	async writeFailedResult(runId: string, taskId: string, attemptId: string, content: string): Promise<string> {
		return this.attempts.writeFailedResult(runId, taskId, attemptId, content);
	}

	async writeWatcherReview(runId: string, taskId: string, attemptId: string, review: unknown): Promise<string> {
		return this.attempts.writeWatcherReview(runId, taskId, attemptId, review);
	}

	async writeDiscoveryResult(runId: string, taskId: string, attemptId: string, record: TeamDiscoveryResultRecord): Promise<string> {
		return this.attempts.writeDiscoveryResult(runId, taskId, attemptId, record);
	}

	async readDiscoveryResult(runId: string, taskId: string, attemptId: string): Promise<TeamDiscoveryResultRecord | null> {
		return this.attempts.readDiscoveryResult(runId, taskId, attemptId);
	}

	async listAttempts(runId: string, taskId: string): Promise<Array<TeamAttemptMetadata & { files: string[] }>> {
		return this.attempts.listAttempts(runId, taskId);
	}

	async readAttemptFile(runId: string, taskId: string, attemptId: string, fileName: string): Promise<string | null> {
		return this.attempts.readAttemptFile(runId, taskId, attemptId, fileName);
	}

	async readAttemptRoleWorkspaceFile(runId: string, attemptId: string, role: "worker" | "checker" | "watcher", relativePath: string): Promise<{ content: string; normalizedRef: string } | null> {
		return this.attempts.readAttemptRoleWorkspaceFile(runId, attemptId, role, relativePath);
	}

	async writeFinalReport(runId: string, content: string): Promise<string> {
		return this.artifacts.writeFinalReport(runId, content);
	}

	async readFinalReport(runId: string): Promise<string | null> {
		return this.artifacts.readFinalReport(runId);
	}

	async removeFinalReport(runId: string): Promise<void> {
		await this.artifacts.removeFinalReport(runId);
	}

	async readRunScopedFile(runId: string, ref: string): Promise<string | null> {
		return this.artifacts.readRunScopedFile(runId, ref);
	}

	async writeExpansion(runId: string, record: TaskExpansionRecord): Promise<void> {
		await this.records.writeExpansion(runId, record);
	}

	async readExpansion(runId: string, parentTaskId: string): Promise<TaskExpansionRecord | null> {
		return this.records.readExpansion(runId, parentTaskId);
	}

	async writeDecomposition(runId: string, record: TaskDecompositionRecord): Promise<void> {
		await this.records.writeDecomposition(runId, record);
	}

	async readDecomposition(runId: string, parentTaskId: string): Promise<TaskDecompositionRecord | null> {
		return this.records.readDecomposition(runId, parentTaskId);
	}

	async appendChildTaskStates(runId: string, children: TeamTask[]): Promise<TeamRunState> {
		return this.records.appendChildTaskStates(runId, children);
	}
}
