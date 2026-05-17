import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { join } from "node:path";
import type { TeamPlan, TeamProgress, TeamRunState, TeamTaskState, TeamAttemptMetadata, AttemptStatus, AttemptLifecyclePhase, TeamTask, TaskExpansionRecord, TaskDecompositionRecord } from "./types.js";
import { generateRunId, generateAttemptId } from "./ids.js";
import { progressMessages } from "./progress.js";
import { RunStateEvents } from "./run-state-events.js";

function initialTaskStates(plan: TeamPlan): Record<string, TeamTaskState> {
	const states: Record<string, TeamTaskState> = {};
	const now = new Date().toISOString();
	for (const task of plan.tasks) {
		states[task.id] = {
			status: "pending",
			attemptCount: 0,
			activeAttemptId: null,
			resultRef: null,
			errorSummary: null,
			progress: { phase: "pending", message: progressMessages.pending, updatedAt: now },
		};
	}
	return states;
}

const now = () => new Date().toISOString();
const ADMISSION_LOCK_TIMEOUT_MS = 10_000;
const ADMISSION_LOCK_RETRY_INTERVAL_MS = 10;

function leaseExpiresAt(ttlMs: number): string {
	return new Date(Date.now() + ttlMs).toISOString();
}

function isLeaseExpired(state: TeamRunState): boolean {
	return !state.lease || new Date(state.lease.expiresAt).getTime() <= Date.now();
}

function taskRecordFileName(taskId: string): string {
	return `${encodeURIComponent(taskId)}.json`;
}

export class RunWorkspace {
	readonly events = new RunStateEvents();

	constructor(private readonly rootDir: string) {}

	async createRun(plan: TeamPlan, teamUnitId: string, options?: { maxRunDurationMinutes?: number }): Promise<TeamRunState> {
		const runId = generateRunId();
		const now = new Date().toISOString();
		const runDir = join(this.rootDir, "runs", runId);

		await mkdir(runDir, { recursive: true });

		await writeFile(join(runDir, "plan.json"), JSON.stringify(plan, null, 2), "utf8");

		const state: TeamRunState = {
			schemaVersion: "team/state-1",
			runId,
			planId: plan.planId,
			teamUnitId,
			status: "queued",
			createdAt: now,
			queuedAt: now,
			startedAt: null,
			finishedAt: null,
			activeElapsedMs: 0,
			currentTaskId: null,
			taskStates: initialTaskStates(plan),
			summary: {
				totalTasks: plan.tasks.length,
				succeededTasks: 0,
				failedTasks: 0,
				cancelledTasks: 0,
			},
			pauseReason: null,
			lastError: null,
			finalizerRuntimeContext: null,
			lease: null,
			...(options?.maxRunDurationMinutes != null ? { maxRunDurationMinutes: options.maxRunDurationMinutes } : {}),
			updatedAt: now,
		};

		await this.saveState(state);
		return state;
	}

	private static readonly ACTIVE_STATUSES = new Set(["queued", "running", "paused"]);

	async createRunWithAdmission(
		plan: TeamPlan,
		teamUnitId: string,
		maxConcurrentRuns: number,
		options?: { maxRunDurationMinutes?: number },
	): Promise<TeamRunState> {
		const effectiveLimit = Math.max(1, Math.floor(maxConcurrentRuns || 1));
		return this.withAdmissionLock(async () => {
			const states = await this.listStates();
			const activeCount = states.filter(s => RunWorkspace.ACTIVE_STATUSES.has(s.status)).length;
			if (activeCount >= effectiveLimit) {
				throw new Error("active run limit reached");
			}

			return this.createRun(plan, teamUnitId, options);
		});
	}

	async getState(runId: string): Promise<TeamRunState | null> {
		const filePath = join(this.rootDir, "runs", runId, "state.json");
		for (let attempt = 0; attempt < 3; attempt++) {
			const state = await this.readJson<TeamRunState>(filePath);
			if (state) return state;
			if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 5));
		}
		return null;
	}

	async saveState(state: TeamRunState): Promise<void> {
		await this.withStateWriteLock(state.runId, async () => {
			const filePath = join(this.rootDir, "runs", state.runId, "state.json");
			const tmp = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
			try {
				await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
				await rename(tmp, filePath);
			} finally {
				await rm(tmp, { force: true }).catch(() => {});
			}
			this.events.notify(state);
		});
	}

	async claimNextRunnableRun(ownerId: string, leaseTtlMs: number): Promise<TeamRunState | null> {
		const states = await this.listStates();
		const candidates = states.filter(state =>
			state.status === "queued" ||
			(state.status === "running" && isLeaseExpired(state)),
		);
		for (const candidate of candidates) {
			const claimed = await this.claimRun(candidate.runId, ownerId, leaseTtlMs);
			if (claimed) return claimed;
		}
		return null;
	}

	async claimRun(runId: string, ownerId: string, leaseTtlMs: number): Promise<TeamRunState | null> {
		return this.withRunLock(runId, async () => {
			const state = await this.getState(runId);
			if (!state) return null;
			if (state.status === "queued" || (state.status === "running" && isLeaseExpired(state))) {
				const timestamp = now();
				state.status = "running";
				state.startedAt = state.startedAt ?? timestamp;
				state.lease = {
					ownerId,
					acquiredAt: timestamp,
					heartbeatAt: timestamp,
					expiresAt: leaseExpiresAt(leaseTtlMs),
				};
				state.updatedAt = timestamp;
				await this.saveState(state);
				return state;
			}
			return null;
		});
	}

	async heartbeatRunLease(runId: string, ownerId: string, leaseTtlMs: number): Promise<boolean> {
		return this.withRunLock(runId, async () => {
			const state = await this.getState(runId);
			if (!state || state.lease?.ownerId !== ownerId) return false;
			if (state.status !== "running") return false;
			const timestamp = now();
			state.lease.heartbeatAt = timestamp;
			state.lease.expiresAt = leaseExpiresAt(leaseTtlMs);
			state.updatedAt = timestamp;
			await this.saveState(state);
			return true;
		});
	}

	async releaseRunLease(runId: string, ownerId: string): Promise<void> {
		await this.withRunLock(runId, async () => {
			const state = await this.getState(runId);
			if (!state || state.lease?.ownerId !== ownerId) return;
			state.lease = null;
			state.updatedAt = now();
			await this.saveState(state);
		});
	}

	async clearRunLease(runId: string): Promise<void> {
		await this.withRunLock(runId, async () => {
			const state = await this.getState(runId);
			if (!state || !state.lease) return;
			state.lease = null;
			state.updatedAt = now();
			await this.saveState(state);
		});
	}

	async listStates(): Promise<TeamRunState[]> {
		const runsDir = join(this.rootDir, "runs");
		try {
			const { readdir } = await import("node:fs/promises");
			const dirs = await readdir(runsDir);
			const states: TeamRunState[] = [];
			for (const d of dirs) {
				const s = await this.getState(d);
				if (s && s.schemaVersion === "team/state-1") states.push(s);
			}
			return states.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		} catch {
			return [];
		}
	}

	async createAttempt(runId: string, taskId: string): Promise<{ attemptId: string; attemptRoot: string }> {
		const attemptId = generateAttemptId();
		const attemptRoot = join(this.rootDir, "runs", runId, "tasks", taskId, "attempts", attemptId);
		await mkdir(join(attemptRoot, "work"), { recursive: true });
		await mkdir(join(attemptRoot, "output"), { recursive: true });
		const metadata: TeamAttemptMetadata = {
			attemptId,
			taskId,
			status: "running",
			phase: "created",
			createdAt: now(),
			updatedAt: now(),
			finishedAt: null,
			worker: [],
			checker: [],
			watcher: null,
			resultRef: null,
			errorSummary: null,
		};
		await writeFile(join(attemptRoot, "attempt.json"), JSON.stringify(metadata, null, 2), "utf8");
		return { attemptId, attemptRoot };
	}

	async updateAttemptStatus(runId: string, taskId: string, attemptId: string, status: string): Promise<void> {
		await this.mutateAttempt(runId, taskId, attemptId, (attempt) => {
			attempt.status = status as AttemptStatus;
			attempt.updatedAt = now();
			return attempt;
		});
	}

	async updateAttemptPhase(runId: string, taskId: string, attemptId: string, phase: AttemptLifecyclePhase): Promise<void> {
		await this.mutateAttempt(runId, taskId, attemptId, (attempt) => {
			attempt.phase = phase;
			attempt.updatedAt = now();
			return attempt;
		});
	}

	async recordAttemptWorkerOutput(
		runId: string, taskId: string, attemptId: string,
		summary: import("./types.js").TeamAttemptWorkerSummary,
	): Promise<void> {
		await this.mutateAttempt(runId, taskId, attemptId, (attempt) => {
			attempt.worker.push(summary);
			attempt.updatedAt = now();
			return attempt;
		});
	}

	async recordAttemptCheckerResult(
		runId: string, taskId: string, attemptId: string,
		summary: import("./types.js").TeamAttemptCheckerSummary,
	): Promise<void> {
		await this.mutateAttempt(runId, taskId, attemptId, (attempt) => {
			attempt.checker.push(summary);
			attempt.updatedAt = now();
			return attempt;
		});
	}

	async recordAttemptWatcherResult(
		runId: string, taskId: string, attemptId: string,
		summary: import("./types.js").TeamAttemptWatcherSummary,
	): Promise<void> {
		await this.mutateAttempt(runId, taskId, attemptId, (attempt) => {
			attempt.watcher = summary;
			attempt.updatedAt = now();
			return attempt;
		});
	}

	async finishAttempt(
		runId: string, taskId: string, attemptId: string,
		input: {
			status: AttemptStatus;
			phase: AttemptLifecyclePhase;
			resultRef?: string | null;
			errorSummary?: string | null;
		},
	): Promise<void> {
		await this.mutateAttempt(runId, taskId, attemptId, (attempt) => {
			attempt.status = input.status;
			attempt.phase = input.phase;
			if (input.resultRef !== undefined) attempt.resultRef = input.resultRef;
			if (input.errorSummary !== undefined) attempt.errorSummary = input.errorSummary;
			attempt.finishedAt = now();
			attempt.updatedAt = now();
			return attempt;
		});
	}

	async writeWorkerOutput(runId: string, taskId: string, attemptId: string, index: number, content: string): Promise<string> {
		const fileName = `worker-output-${String(index).padStart(3, "0")}.md`;
		await this.writeAttemptFile(runId, taskId, attemptId, fileName, content);
		return `tasks/${taskId}/attempts/${attemptId}/${fileName}`;
	}

	async writeCheckerVerdict(runId: string, taskId: string, attemptId: string, index: number, verdict: unknown): Promise<string> {
		const fileName = `checker-verdict-${String(index).padStart(3, "0")}.json`;
		await this.writeAttemptFile(runId, taskId, attemptId, fileName, JSON.stringify(verdict, null, 2));
		return `tasks/${taskId}/attempts/${attemptId}/${fileName}`;
	}

	async writeCheckerOutput(runId: string, taskId: string, attemptId: string, index: number, content: string): Promise<string> {
		const fileName = `checker-output-${String(index).padStart(3, "0")}.md`;
		await this.writeAttemptFile(runId, taskId, attemptId, fileName, content);
		return `tasks/${taskId}/attempts/${attemptId}/${fileName}`;
	}

	async writeAcceptedResult(runId: string, taskId: string, attemptId: string, content: string): Promise<string> {
		await this.writeAttemptFile(runId, taskId, attemptId, "accepted-result.md", content);
		return `tasks/${taskId}/attempts/${attemptId}/accepted-result.md`;
	}

	async writeFailedResult(runId: string, taskId: string, attemptId: string, content: string): Promise<string> {
		await this.writeAttemptFile(runId, taskId, attemptId, "failed-result.md", content);
		return `tasks/${taskId}/attempts/${attemptId}/failed-result.md`;
	}

	async writeWatcherReview(runId: string, taskId: string, attemptId: string, review: unknown): Promise<string> {
		await this.writeAttemptFile(runId, taskId, attemptId, "watcher-review.json", JSON.stringify(review, null, 2));
		return `tasks/${taskId}/attempts/${attemptId}/watcher-review.json`;
	}

	async writeFinalReport(runId: string, content: string): Promise<string> {
		const filePath = join(this.rootDir, "runs", runId, "final-report.md");
		await writeFile(filePath, content, "utf8");
		return "final-report.md";
	}

	async deleteRun(runId: string): Promise<void> {
		const runDir = join(this.rootDir, "runs", runId);
		await rm(runDir, { recursive: true, force: true });
	}

	async writeExpansion(runId: string, record: TaskExpansionRecord): Promise<void> {
		const dir = join(this.rootDir, "runs", runId, "expansions");
		await mkdir(dir, { recursive: true });
		const filePath = join(dir, taskRecordFileName(record.parentTaskId));
		const tmp = filePath + ".tmp";
		await writeFile(tmp, JSON.stringify(record, null, 2), "utf8");
		await rename(tmp, filePath);
	}

	async readExpansion(runId: string, parentTaskId: string): Promise<TaskExpansionRecord | null> {
		return this.readJson<TaskExpansionRecord>(join(this.rootDir, "runs", runId, "expansions", taskRecordFileName(parentTaskId)));
	}

	async writeDecomposition(runId: string, record: TaskDecompositionRecord): Promise<void> {
		const dir = join(this.rootDir, "runs", runId, "decompositions");
		await mkdir(dir, { recursive: true });
		const filePath = join(dir, taskRecordFileName(record.parentTaskId));
		const tmp = filePath + ".tmp";
		await writeFile(tmp, JSON.stringify(record, null, 2), "utf8");
		await rename(tmp, filePath);
	}

	async readDecomposition(runId: string, parentTaskId: string): Promise<TaskDecompositionRecord | null> {
		return this.readJson<TaskDecompositionRecord>(join(this.rootDir, "runs", runId, "decompositions", taskRecordFileName(parentTaskId)));
	}

	async appendChildTaskStates(runId: string, children: TeamTask[]): Promise<TeamRunState> {
		const state = await this.getState(runId);
		if (!state) throw new Error(`run not found: ${runId}`);
		const ts = new Date().toISOString();
		for (const child of children) {
			if (state.taskStates[child.id]) continue;
			state.taskStates[child.id] = {
				status: "pending",
				attemptCount: 0,
				activeAttemptId: null,
				resultRef: null,
				errorSummary: null,
				progress: { phase: "pending", message: progressMessages.pending, updatedAt: ts },
			};
		}
		state.summary.totalTasks = Object.keys(state.taskStates).length;
		state.updatedAt = ts;
		await this.saveState(state);
		return state;
	}

	private async withAdmissionLock<T>(fn: () => Promise<T>): Promise<T> {
		const runsDir = join(this.rootDir, "runs");
		await mkdir(runsDir, { recursive: true });
		const lockDir = join(runsDir, ".admission.lock");
		const deadline = Date.now() + ADMISSION_LOCK_TIMEOUT_MS;
		while (Date.now() < deadline) {
			try {
				await mkdir(lockDir);
				try {
					return await fn();
				} finally {
					await rm(lockDir, { recursive: true, force: true });
				}
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (code !== "EEXIST" && code !== "EPERM") throw error;
				await new Promise(resolve => setTimeout(resolve, ADMISSION_LOCK_RETRY_INTERVAL_MS));
			}
		}
		throw new Error("admission lock busy");
	}

	private async withRunLock<T>(runId: string, fn: () => Promise<T>): Promise<T> {
		const lockDir = join(this.rootDir, "runs", runId, ".lock");
		for (let attempt = 0; attempt < 20; attempt++) {
			try {
				await mkdir(lockDir);
				try {
					return await fn();
				} finally {
					await rm(lockDir, { recursive: true, force: true });
				}
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (code !== "EEXIST") throw error;
				await new Promise(resolve => setTimeout(resolve, 10));
			}
		}
		throw new Error(`run lock busy: ${runId}`);
	}

	private async withStateWriteLock<T>(runId: string, fn: () => Promise<T>): Promise<T> {
		const runDir = join(this.rootDir, "runs", runId);
		await mkdir(runDir, { recursive: true });
		const lockDir = join(runDir, ".state.lock");
		for (let attempt = 0; attempt < 100; attempt++) {
			try {
				await mkdir(lockDir);
				try {
					return await fn();
				} finally {
					await rm(lockDir, { recursive: true, force: true });
				}
			} catch (error) {
				const code = (error as NodeJS.ErrnoException).code;
				if (code !== "EEXIST" && code !== "EPERM") throw error;
				await new Promise(resolve => setTimeout(resolve, 10));
			}
		}
		throw new Error(`state write lock busy: ${runId}`);
	}
	async listAttempts(runId: string, taskId: string): Promise<Array<TeamAttemptMetadata & { files: string[] }>> {
		const attemptsDir = join(this.rootDir, "runs", runId, "tasks", taskId, "attempts");
		let dirs: string[];
		try { dirs = await readdir(attemptsDir); } catch { return []; }
		const results: Array<TeamAttemptMetadata & { files: string[] }> = [];
		for (const d of dirs) {
			const raw = await this.readJson<Record<string, unknown>>(join(attemptsDir, d, "attempt.json"));
			let files: string[] = [];
			try { files = (await readdir(join(attemptsDir, d))).filter(f => f !== "attempt.json" && f !== "work" && f !== "output"); } catch { /* empty */ }
			results.push({ ...this.normalizeAttempt(raw ?? {}, d, taskId), files });
		}
		return results;
	}

	async readAttemptFile(runId: string, taskId: string, attemptId: string, fileName: string): Promise<string | null> {
		if (/[^a-zA-Z0-9._-]/.test(fileName) || fileName.includes("..")) return null;
		if (/[^a-zA-Z0-9_-]/.test(attemptId) || attemptId.includes("..")) return null;
		if (/[^a-zA-Z0-9_-]/.test(taskId) || taskId.includes("..")) return null;
		const filePath = join(this.rootDir, "runs", runId, "tasks", taskId, "attempts", attemptId, fileName);
		const runRoot = join(this.rootDir, "runs", runId);
		const resolved = path.resolve(filePath);
		const root = path.resolve(runRoot);
		if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
		try { return await readFile(filePath, "utf8"); } catch { return null; }
	}

	async readRunScopedFile(runId: string, ref: string): Promise<string | null> {
		if (/[^a-zA-Z0-9_-]/.test(runId) || runId.includes("..")) return null;
		const runRoot = join(this.rootDir, "runs", runId);
		const normalized = ref.trim().replace(/^["'`]+|["'`,.;:，。；：）)]+$/g, "").replace(/\\/g, "/");
		const appPrefix = `/app/.data/team/runs/${runId}/`;
		const runsPrefix = `runs/${runId}/`;
		let relative: string | null = null;
		if (normalized.startsWith(appPrefix)) {
			relative = normalized.slice(appPrefix.length);
		} else if (normalized.startsWith(runsPrefix)) {
			relative = normalized.slice(runsPrefix.length);
		} else if (!normalized.startsWith("/") && !/^[a-zA-Z]:\//.test(normalized)) {
			relative = normalized;
		}
		if (!relative || relative.includes("..")) return null;
		const filePath = join(runRoot, ...relative.split("/").filter(Boolean));
		const resolved = path.resolve(filePath);
		const root = path.resolve(runRoot);
		if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
		try { return await readFile(filePath, "utf8"); } catch { return null; }
	}

	private async writeAttemptFile(runId: string, taskId: string, attemptId: string, fileName: string, content: string): Promise<void> {
		const dir = join(this.rootDir, "runs", runId, "tasks", taskId, "attempts", attemptId);
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, fileName), content, "utf8");
	}

	private normalizeAttempt(raw: Record<string, unknown>, fallbackAttemptId: string, fallbackTaskId: string): TeamAttemptMetadata {
		const validStatuses: AttemptStatus[] = ["running", "succeeded", "failed", "interrupted", "cancelled"];
		const rawStatus = raw.status as string | undefined;
		const status: AttemptStatus = validStatuses.includes(rawStatus as AttemptStatus) ? (rawStatus as AttemptStatus) : "running";
		const phaseFallback: AttemptLifecyclePhase = status === "running" ? "created" : status;
		const rawPhase = raw.phase as string | undefined;
		const validPhases: AttemptLifecyclePhase[] = [
			"created", "worker_running", "worker_completed", "checker_reviewing", "checker_passed",
			"checker_revising", "checker_failed", "watcher_reviewing", "watcher_accepted",
			"watcher_revision_requested", "watcher_confirmed_failed", "succeeded", "failed", "interrupted", "cancelled",
		];
		const phase: AttemptLifecyclePhase = validPhases.includes(rawPhase as AttemptLifecyclePhase) ? (rawPhase as AttemptLifecyclePhase) : phaseFallback;
		const createdAt = (raw.createdAt as string) || "";
		const updatedAt = (raw.updatedAt as string) || createdAt;
		return {
			attemptId: (raw.attemptId as string) || fallbackAttemptId,
			taskId: (raw.taskId as string) || fallbackTaskId,
			status,
			phase,
			createdAt,
			updatedAt,
			finishedAt: (raw.finishedAt as string | null) ?? null,
			worker: Array.isArray(raw.worker) ? raw.worker as TeamAttemptMetadata["worker"] : [],
			checker: Array.isArray(raw.checker) ? raw.checker as TeamAttemptMetadata["checker"] : [],
			watcher: raw.watcher && typeof raw.watcher === "object" && !Array.isArray(raw.watcher) ? raw.watcher as TeamAttemptMetadata["watcher"] : null,
			resultRef: (raw.resultRef as string | null) ?? null,
			errorSummary: (raw.errorSummary as string | null) ?? null,
		};
	}

	private async mutateAttempt(
		runId: string,
		taskId: string,
		attemptId: string,
		mutate: (attempt: TeamAttemptMetadata) => TeamAttemptMetadata,
	): Promise<void> {
		const attemptFile = join(this.rootDir, "runs", runId, "tasks", taskId, "attempts", attemptId, "attempt.json");
		const raw = await this.readJson<Record<string, unknown>>(attemptFile);
		if (!raw) return;
		const normalized = this.normalizeAttempt(raw, attemptId, taskId);
		const result = mutate(normalized);
		await writeFile(attemptFile, JSON.stringify(result, null, 2), "utf8");
	}

	private async readJson<T>(filePath: string): Promise<T | null> {
		try {
			const data = await readFile(filePath, "utf8");
			return JSON.parse(data) as T;
		} catch {
			return null;
		}
	}
}
