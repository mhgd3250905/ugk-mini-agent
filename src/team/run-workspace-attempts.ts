import path from "node:path";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateAttemptId } from "./ids.js";
import type {
	AttemptLifecyclePhase,
	AttemptStatus,
	TeamAttemptCheckerSummary,
	TeamAttemptMetadata,
	TeamAttemptRoleProcess,
	TeamAttemptWatcherSummary,
	TeamAttemptWorkerSummary,
	TeamDiscoveryResultRecord,
	TeamTaskDeliveryOutcome,
} from "./types.js";

const now = () => new Date().toISOString();

export class RunAttemptStore {
	constructor(private readonly rootDir: string) {}

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

	async recordAttemptWorkerOutput(runId: string, taskId: string, attemptId: string, summary: TeamAttemptWorkerSummary): Promise<void> {
		await this.mutateAttempt(runId, taskId, attemptId, (attempt) => {
			attempt.worker.push(summary);
			attempt.updatedAt = now();
			return attempt;
		});
	}

	async recordAttemptCheckerResult(runId: string, taskId: string, attemptId: string, summary: TeamAttemptCheckerSummary): Promise<void> {
		await this.mutateAttempt(runId, taskId, attemptId, (attempt) => {
			attempt.checker.push(summary);
			attempt.updatedAt = now();
			return attempt;
		});
	}

	async recordAttemptWatcherResult(runId: string, taskId: string, attemptId: string, summary: TeamAttemptWatcherSummary): Promise<void> {
		await this.mutateAttempt(runId, taskId, attemptId, (attempt) => {
			attempt.watcher = summary;
			attempt.updatedAt = now();
			return attempt;
		});
	}

	async recordAttemptRoleProcess(runId: string, taskId: string, attemptId: string, process: TeamAttemptRoleProcess): Promise<void> {
		await this.mutateAttempt(runId, taskId, attemptId, (attempt) => {
			attempt.roleProcesses = {
				...(attempt.roleProcesses ?? {}),
				[process.role]: process,
			};
			attempt.updatedAt = now();
			return attempt;
		});
	}

	async recordAttemptDeliveryOutcomes(runId: string, taskId: string, attemptId: string, outcomes: TeamTaskDeliveryOutcome[]): Promise<void> {
		if (outcomes.length === 0) return;
		await this.mutateAttempt(runId, taskId, attemptId, (attempt) => {
			attempt.downstreamDelivery = outcomes;
			attempt.updatedAt = now();
			return attempt;
		});
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

	async writeDiscoveryResult(runId: string, taskId: string, attemptId: string, record: TeamDiscoveryResultRecord): Promise<string> {
		await this.writeAttemptFile(runId, taskId, attemptId, "discovery-result.json", JSON.stringify(record, null, 2));
		return `tasks/${taskId}/attempts/${attemptId}/discovery-result.json`;
	}

	async readDiscoveryResult(runId: string, taskId: string, attemptId: string): Promise<TeamDiscoveryResultRecord | null> {
		const content = await this.readAttemptFile(runId, taskId, attemptId, "discovery-result.json");
		if (!content) return null;
		try {
			const parsed = JSON.parse(content);
			if (parsed && typeof parsed === "object" && parsed.schemaVersion === "team/discovery-result-1") {
				return parsed as TeamDiscoveryResultRecord;
			}
			return null;
		} catch {
			return null;
		}
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

	async readAttemptRoleWorkspaceFile(runId: string, attemptId: string, role: "worker" | "checker" | "watcher", relativePath: string): Promise<{ content: string; normalizedRef: string } | null> {
		if (/[^a-zA-Z0-9_-]/.test(runId) || runId.includes("..")) return null;
		if (/[^a-zA-Z0-9_-]/.test(attemptId) || attemptId.includes("..")) return null;
		const normalized = relativePath.trim().replace(/^["'`]+|["'`,.;:，。；：）)]+$/g, "").replace(/\\/g, "/");
		if (!normalized || normalized.includes("..") || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) return null;
		const workspaceRoot = join(this.rootDir, "runs", runId, "agent-workspaces", attemptId, role);
		const filePath = join(workspaceRoot, ...normalized.split("/").filter(Boolean));
		const resolved = path.resolve(filePath);
		const root = path.resolve(workspaceRoot);
		if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
		try {
			return {
				content: await readFile(filePath, "utf8"),
				normalizedRef: path.relative(join(this.rootDir, "runs", runId), resolved).replace(/\\/g, "/"),
			};
		} catch {
			return null;
		}
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
		const roleProcesses = this.normalizeRoleProcesses(raw.roleProcesses);
		const downstreamDelivery = this.normalizeDeliveryOutcomes(raw.downstreamDelivery);
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
			...(roleProcesses ? { roleProcesses } : {}),
			...(downstreamDelivery ? { downstreamDelivery } : {}),
		};
	}

	private normalizeRoleProcesses(raw: unknown): TeamAttemptMetadata["roleProcesses"] | undefined {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
		const processes = raw as Record<string, unknown>;
		const worker = this.normalizeRoleProcess("worker", processes.worker);
		const checker = this.normalizeRoleProcess("checker", processes.checker);
		if (!worker && !checker) return undefined;
		return {
			...(worker ? { worker } : {}),
			...(checker ? { checker } : {}),
		};
	}

	private normalizeRoleProcess(role: "worker" | "checker", raw: unknown): TeamAttemptRoleProcess | undefined {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
		const value = raw as Record<string, unknown>;
		const status = value.status;
		if (status !== "waiting" && status !== "running" && status !== "succeeded" && status !== "failed" && status !== "cancelled") {
			return undefined;
		}
		const assistantText = this.normalizeAssistantText(value.assistantText);
		return {
			role,
			profileId: typeof value.profileId === "string" ? value.profileId : "",
			status,
			startedAt: typeof value.startedAt === "string" ? value.startedAt : null,
			updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
			finishedAt: typeof value.finishedAt === "string" ? value.finishedAt : null,
			...(assistantText ? { assistantText } : {}),
			process: value.process && typeof value.process === "object" && !Array.isArray(value.process)
				? value.process as TeamAttemptRoleProcess["process"]
				: null,
		};
	}


	private normalizeDeliveryOutcomes(raw: unknown): TeamTaskDeliveryOutcome[] | undefined {
		if (!Array.isArray(raw) || raw.length === 0) return undefined;
		const validStatuses = new Set(["delivered", "skipped", "failed"]);
		const outcomes: TeamTaskDeliveryOutcome[] = [];
		for (const item of raw) {
			if (!item || typeof item !== "object" || Array.isArray(item)) continue;
			const value = item as Record<string, unknown>;
			const status = value.status;
			if (typeof status !== "string" || !validStatuses.has(status)) continue;
			const edgeKind = value.edgeKind;
			if (edgeKind === "control-dependency") {
				const dependencyId = value.dependencyId;
				const toTaskId = value.toTaskId;
				const createdAt = value.createdAt;
				if (typeof dependencyId !== "string" || typeof toTaskId !== "string" || typeof createdAt !== "string") continue;
				const outcome: import("./types.js").TeamTaskControlDependencyDeliveryOutcome = {
					edgeKind: "control-dependency",
					dependencyId,
					toTaskId,
					status: status as import("./types.js").TeamTaskDeliveryOutcomeStatus,
					createdAt,
				};
				if (typeof value.staleReason === "string") outcome.staleReason = value.staleReason as import("./types.js").TaskDependencyStaleReason;
				if (typeof value.downstreamRunId === "string") outcome.downstreamRunId = value.downstreamRunId;
				if (typeof value.error === "string") outcome.error = value.error;
				outcomes.push(outcome);
				continue;
			}
			const connectionId = value.connectionId;
			const toTaskId = value.toTaskId;
			const toInputPortId = value.toInputPortId;
			const createdAt = value.createdAt;
			if (typeof connectionId !== "string" || typeof toTaskId !== "string" || typeof toInputPortId !== "string" || typeof createdAt !== "string") continue;
			const outcome: import("./types.js").TeamTaskTypedConnectionDeliveryOutcome = {
				connectionId,
				toTaskId,
				toInputPortId,
				status: status as import("./types.js").TeamTaskDeliveryOutcomeStatus,
				createdAt,
			};
			if (typeof value.staleReason === "string") outcome.staleReason = value.staleReason as import("./types.js").TaskConnectionStaleReason;
			if (typeof value.downstreamRunId === "string") outcome.downstreamRunId = value.downstreamRunId;
			if (typeof value.error === "string") outcome.error = value.error;
			outcomes.push(outcome);
		}
		return outcomes.length > 0 ? outcomes : undefined;
	}

	private normalizeAssistantText(raw: unknown): TeamAttemptRoleProcess["assistantText"] | undefined {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
		const value = raw as Record<string, unknown>;
		if (typeof value.content !== "string" || typeof value.updatedAt !== "string") return undefined;
		return {
			content: value.content,
			updatedAt: value.updatedAt,
		};
	}

	private async mutateAttempt(runId: string, taskId: string, attemptId: string, mutate: (attempt: TeamAttemptMetadata) => TeamAttemptMetadata): Promise<void> {
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
