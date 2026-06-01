import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renameWithTransientRetry } from "../file-system.js";
import { generateRunId } from "./ids.js";
import { progressMessages } from "./progress.js";
import { RunStateEvents } from "./run-state-events.js";
import type { TeamPlan, TeamRunState, TeamTaskState } from "./types.js";

function initialTaskStates(plan: TeamPlan): Record<string, TeamTaskState> {
	const states: Record<string, TeamTaskState> = {};
	const timestamp = new Date().toISOString();
	for (const task of plan.tasks) {
		states[task.id] = {
			status: "pending",
			attemptCount: 0,
			activeAttemptId: null,
			resultRef: null,
			errorSummary: null,
			progress: { phase: "pending", message: progressMessages.pending, updatedAt: timestamp },
		};
	}
	return states;
}

const now = () => new Date().toISOString();
const ADMISSION_LOCK_TIMEOUT_MS = 30_000;
const ADMISSION_LOCK_RETRY_INTERVAL_MS = 10;

function leaseExpiresAt(ttlMs: number): string {
	return new Date(Date.now() + ttlMs).toISOString();
}

function isLeaseExpired(state: TeamRunState): boolean {
	return !state.lease || new Date(state.lease.expiresAt).getTime() <= Date.now();
}

export class RunStateStore {
	readonly events = new RunStateEvents();
	private static readonly ACTIVE_STATUSES = new Set(["queued", "running", "paused"]);

	constructor(private readonly rootDir: string) {}

	async createRun(plan: TeamPlan, teamUnitId: string, options?: { maxRunDurationMinutes?: number }): Promise<TeamRunState> {
		const runId = generateRunId();
		const timestamp = now();
		const runDir = join(this.rootDir, "runs", runId);

		await mkdir(runDir, { recursive: true });
		await writeFile(join(runDir, "plan.json"), JSON.stringify(plan, null, 2), "utf8");

		const state: TeamRunState = {
			schemaVersion: "team/state-1",
			runId,
			planId: plan.planId,
			teamUnitId,
			status: "queued",
			createdAt: timestamp,
			queuedAt: timestamp,
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
				skippedTasks: 0,
			},
			pauseReason: null,
			lastError: null,
			finalizerRuntimeContext: null,
			lease: null,
			...(options?.maxRunDurationMinutes != null ? { maxRunDurationMinutes: options.maxRunDurationMinutes } : {}),
			updatedAt: timestamp,
		};

		await this.saveState(state);
		return state;
	}

	async createRunWithAdmission(
		plan: TeamPlan,
		teamUnitId: string,
		maxConcurrentRuns: number,
		options?: { maxRunDurationMinutes?: number },
	): Promise<TeamRunState> {
		const effectiveLimit = Math.max(1, Math.floor(maxConcurrentRuns || 1));
		return this.withAdmissionLock(async () => {
			const states = await this.listStates();
			const activeCount = states.filter(s => RunStateStore.ACTIVE_STATUSES.has(s.status)).length;
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
			await this.writeStateFile(state);
			this.events.notify(state);
		});
	}

	async patchState(runId: string, mutator: (state: TeamRunState) => void | Promise<void>): Promise<TeamRunState> {
		return this.withStateWriteLock(runId, async () => {
			const state = await this.getState(runId);
			if (!state) throw new Error(`run not found: ${runId}`);
			const before = state.updatedAt;
			await mutator(state);
			if (state.updatedAt === before) {
				let ts = now();
				if (ts === before) {
					const d = new Date(before);
					d.setMilliseconds(d.getMilliseconds() + 1);
					ts = d.toISOString();
				}
				state.updatedAt = ts;
			}
			await this.writeStateFile(state);
			this.events.notify(state);
			return state;
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

	async deleteRun(runId: string): Promise<void> {
		await rm(join(this.rootDir, "runs", runId), { recursive: true, force: true });
	}

	private async writeStateFile(state: TeamRunState): Promise<void> {
		const filePath = join(this.rootDir, "runs", state.runId, "state.json");
		const tmp = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
		try {
			await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
			await renameWithTransientRetry(tmp, filePath);
		} finally {
			await rm(tmp, { force: true }).catch(() => {});
		}
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

	private async readJson<T>(filePath: string): Promise<T | null> {
		try {
			const data = await readFile(filePath, "utf8");
			return JSON.parse(data) as T;
		} catch {
			return null;
		}
	}
}
