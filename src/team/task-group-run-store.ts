import { randomUUID } from "node:crypto";
import { JsonCollectionStore } from "./json-collection-store.js";
import type {
	TeamTaskGroupRun,
	TeamTaskGroupRunDefinitionSnapshot,
	TeamTaskGroupRunSource,
	TeamTaskGroupRunStatus,
} from "./types.js";

export interface TaskGroupRunStoreListOptions {
	groupId?: string;
	includeTerminal?: boolean;
}

export interface CreateTeamTaskGroupRunInput {
	groupId: string;
	source?: TeamTaskGroupRunSource;
	definitionSnapshot?: TeamTaskGroupRunDefinitionSnapshot | null;
}

export interface UpdateTeamTaskGroupRunInput {
	status?: TeamTaskGroupRunStatus;
	definitionSnapshot?: TeamTaskGroupRunDefinitionSnapshot | null;
	entryRuns?: TeamTaskGroupRun["entryRuns"];
	observedRuns?: TeamTaskGroupRun["observedRuns"];
	startedAt?: string | null;
	finishedAt?: string | null;
	lastError?: string | null;
}

const now = () => new Date().toISOString();
const generateTaskGroupRunId = () => `group_run_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const ACTIVE_GROUP_RUN_STATUSES = new Set<TeamTaskGroupRunStatus>(["queued", "running"]);
const TERMINAL_GROUP_RUN_STATUSES = new Set<TeamTaskGroupRunStatus>(["completed", "completed_with_failures", "failed", "cancelled"]);

export function isTerminalTaskGroupRunStatus(status: TeamTaskGroupRunStatus): boolean {
	return TERMINAL_GROUP_RUN_STATUSES.has(status);
}

export class TaskGroupRunStore {
	private readonly collection: JsonCollectionStore<TeamTaskGroupRun>;

	constructor(rootDir: string) {
		this.collection = new JsonCollectionStore<TeamTaskGroupRun>({
			rootDir,
			fileName: "task-group-runs.json",
			schemaVersion: "team/task-group-run-1",
			lockDirName: ".task-group-runs.lock",
			errorLabel: "task group run store",
		});
	}

	async list(options: TaskGroupRunStoreListOptions = {}): Promise<TeamTaskGroupRun[]> {
		const runs = (await this.collection.readAll()).map(run => normalizeStoredRun(run));
		return runs
			.filter(run => !options.groupId || run.groupId === options.groupId)
			.filter(run => options.includeTerminal !== false || !TERMINAL_GROUP_RUN_STATUSES.has(run.status))
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	async get(groupRunId: string): Promise<TeamTaskGroupRun | null> {
		const runs = await this.collection.readAll();
		return runs.map(run => normalizeStoredRun(run)).find(run => run.groupRunId === groupRunId) ?? null;
	}

	async create(input: CreateTeamTaskGroupRunInput): Promise<TeamTaskGroupRun> {
		return this.collection.withMutationLock(async () => {
			const timestamp = now();
			const runs = (await this.collection.readAll()).map(existing => normalizeStoredRun(existing));
			const activeRun = runs.find(run => run.groupId === input.groupId && ACTIVE_GROUP_RUN_STATUSES.has(run.status));
			if (activeRun) {
				throw new Error(`active task group run already exists: ${activeRun.groupRunId}`);
			}
			const run: TeamTaskGroupRun = {
				schemaVersion: "team/task-group-run-1",
				groupRunId: generateTaskGroupRunId(),
				groupId: input.groupId,
				status: "queued",
				source: input.source ?? { type: "manual" },
				definitionSnapshot: normalizeDefinitionSnapshot(input.definitionSnapshot),
				entryRuns: [],
				observedRuns: [],
				startedAt: null,
				finishedAt: null,
				lastError: null,
				createdAt: timestamp,
				updatedAt: timestamp,
			};
			await this.collection.writeAll([...runs, run]);
			return run;
		});
	}

	async update(groupRunId: string, mutator: (run: TeamTaskGroupRun) => void | Promise<void>): Promise<TeamTaskGroupRun> {
		return this.collection.withMutationLock(async () => {
			const runs = (await this.collection.readAll()).map(run => normalizeStoredRun(run));
			const index = runs.findIndex(run => run.groupRunId === groupRunId);
			if (index < 0) throw new Error(`task group run not found: ${groupRunId}`);
			const updated = { ...runs[index]! };
			await mutator(updated);
			updated.updatedAt = now();
			runs[index] = normalizeStoredRun(updated);
			await this.collection.writeAll(runs);
			return runs[index]!;
		});
	}

	async patch(groupRunId: string, patch: UpdateTeamTaskGroupRunInput): Promise<TeamTaskGroupRun> {
		return this.update(groupRunId, (run) => {
			if (patch.status !== undefined) run.status = patch.status;
			if (patch.definitionSnapshot !== undefined) run.definitionSnapshot = normalizeDefinitionSnapshot(patch.definitionSnapshot);
			if (patch.entryRuns !== undefined) run.entryRuns = normalizeEntryRuns(patch.entryRuns);
			if (patch.observedRuns !== undefined) run.observedRuns = normalizeObservedRuns(patch.observedRuns);
			if (patch.startedAt !== undefined) run.startedAt = patch.startedAt;
			if (patch.finishedAt !== undefined) run.finishedAt = patch.finishedAt;
			if (patch.lastError !== undefined) run.lastError = patch.lastError;
		});
	}

	async findActiveForGroup(groupId: string): Promise<TeamTaskGroupRun | null> {
		const runs = await this.list({ groupId });
		return runs.find(run => ACTIVE_GROUP_RUN_STATUSES.has(run.status)) ?? null;
	}
}

function normalizeStoredRun(run: TeamTaskGroupRun): TeamTaskGroupRun {
	return {
		...run,
		source: normalizeSource(run.source),
		definitionSnapshot: normalizeDefinitionSnapshot((run as { definitionSnapshot?: unknown }).definitionSnapshot),
		entryRuns: normalizeEntryRuns(run.entryRuns),
		observedRuns: normalizeObservedRuns(run.observedRuns),
		startedAt: run.startedAt ?? null,
		finishedAt: run.finishedAt ?? null,
		lastError: typeof run.lastError === "string" ? run.lastError : null,
	};
}

function normalizeDefinitionSnapshot(value: unknown): TeamTaskGroupRunDefinitionSnapshot | null {
	if (!value || typeof value !== "object") return null;
	return {
		taskIds: normalizeStringIds((value as { taskIds?: unknown }).taskIds),
		headTaskIds: normalizeStringIds((value as { headTaskIds?: unknown }).headTaskIds),
	};
}

function normalizeStringIds(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const ids: string[] = [];
	const seen = new Set<string>();
	for (const raw of value) {
		if (typeof raw !== "string") continue;
		const id = raw.trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		ids.push(id);
	}
	return ids;
}

function normalizeSource(value: unknown): TeamTaskGroupRunSource {
	if (value && typeof value === "object" && (value as { type?: unknown }).type === "conn") {
		const source = value as { connId?: unknown; connRunId?: unknown };
		return {
			type: "conn",
			connId: typeof source.connId === "string" ? source.connId : "",
			connRunId: typeof source.connRunId === "string" ? source.connRunId : "",
		};
	}
	return { type: "manual" };
}

function normalizeEntryRuns(value: unknown): TeamTaskGroupRun["entryRuns"] {
	if (!Array.isArray(value)) return [];
	const runs: TeamTaskGroupRun["entryRuns"] = [];
	const seen = new Set<string>();
	for (const item of value) {
		if (!item || typeof item !== "object") continue;
		const taskId = (item as { taskId?: unknown }).taskId;
		const runId = (item as { runId?: unknown }).runId;
		if (typeof taskId !== "string" || typeof runId !== "string" || !taskId || !runId || seen.has(runId)) continue;
		seen.add(runId);
		runs.push({ taskId, runId });
	}
	return runs;
}

function normalizeObservedRuns(value: unknown): TeamTaskGroupRun["observedRuns"] {
	if (!Array.isArray(value)) return [];
	const runs: TeamTaskGroupRun["observedRuns"] = [];
	const seen = new Set<string>();
	for (const item of value) {
		if (!item || typeof item !== "object") continue;
		const taskId = (item as { taskId?: unknown }).taskId;
		const runId = (item as { runId?: unknown }).runId;
		const role = (item as { role?: unknown }).role;
		if (typeof taskId !== "string" || typeof runId !== "string" || !taskId || !runId || seen.has(runId)) continue;
		if (role !== "entry" && role !== "downstream" && role !== "discovery-generated" && role !== "split-generated") continue;
		seen.add(runId);
		runs.push({ taskId, runId, role });
	}
	return runs;
}
