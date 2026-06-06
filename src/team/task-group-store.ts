import { randomUUID } from "node:crypto";
import { JsonCollectionStore } from "./json-collection-store.js";
import type { TaskConnectionStore } from "./task-connection-store.js";
import type { TaskDependencyStore } from "./task-dependency-store.js";
import type { TaskStore } from "./task-store.js";
import type { ResolvedTeamTaskGroup, TeamTaskGroup, TeamTaskGroupValidationIssue } from "./types.js";

export interface TaskGroupStoreListOptions {
	includeArchived?: boolean;
}

export interface CreateTeamTaskGroupInput {
	title: string;
	taskIds: string[];
}

export interface UpdateTeamTaskGroupInput {
	title?: string;
	taskIds?: string[];
}

type TaskGroupStoreTaskReader = Pick<TaskStore, "get">;
type TaskGroupStoreConnectionReader = Pick<TaskConnectionStore, "listResolved">;
type TaskGroupStoreDependencyReader = Pick<TaskDependencyStore, "listResolved">;

const now = () => new Date().toISOString();
const generateTaskGroupId = () => `group_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

export class TaskGroupStore {
	private readonly collection: JsonCollectionStore<TeamTaskGroup>;

	constructor(
		rootDir: string,
		private readonly taskStore: TaskGroupStoreTaskReader,
		private readonly connectionStore: TaskGroupStoreConnectionReader,
		private readonly dependencyStore: TaskGroupStoreDependencyReader,
	) {
		this.collection = new JsonCollectionStore<TeamTaskGroup>({
			rootDir,
			fileName: "task-groups.json",
			schemaVersion: "team/task-group-1",
			lockDirName: ".task-groups.lock",
			errorLabel: "task group store",
		});
	}

	async list(options: TaskGroupStoreListOptions = {}): Promise<TeamTaskGroup[]> {
		const groups = await this.collection.readAll();
		return groups
			.map(group => normalizeStoredGroup(group))
			.filter(group => options.includeArchived || !group.archived)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	async get(groupId: string): Promise<TeamTaskGroup | null> {
		const groups = await this.collection.readAll();
		return groups.map(group => normalizeStoredGroup(group)).find(group => group.groupId === groupId) ?? null;
	}

	async create(input: CreateTeamTaskGroupInput): Promise<ResolvedTeamTaskGroup> {
		const title = normalizeTitle(input.title);
		const taskIds = normalizeTaskIds(input.taskIds);
		const timestamp = now();
		const group: TeamTaskGroup = {
			schemaVersion: "team/task-group-1",
			groupId: generateTaskGroupId(),
			title,
			taskIds,
			archived: false,
			createdAt: timestamp,
			updatedAt: timestamp,
		};
		const resolved = await this.resolve(group);
		return this.collection.withMutationLock(async () => {
			const groups = await this.collection.readAll();
			await this.collection.writeAll([...groups.map(existing => normalizeStoredGroup(existing)), group]);
			return resolved;
		});
	}

	async update(groupId: string, patch: UpdateTeamTaskGroupInput): Promise<ResolvedTeamTaskGroup> {
		return this.collection.withMutationLock(async () => {
			const groups = (await this.collection.readAll()).map(group => normalizeStoredGroup(group));
			const index = groups.findIndex(group => group.groupId === groupId);
			if (index < 0) throw new Error(`task group not found: ${groupId}`);
			const existing = groups[index]!;
			const updated: TeamTaskGroup = {
				...existing,
				...(Object.hasOwn(patch, "title") ? { title: normalizeTitle(patch.title) } : {}),
				...(Object.hasOwn(patch, "taskIds") ? { taskIds: normalizeTaskIds(patch.taskIds) } : {}),
				updatedAt: now(),
			};
			const resolved = await this.resolve(updated);
			groups[index] = updated;
			await this.collection.writeAll(groups);
			return resolved;
		});
	}

	async archive(groupId: string): Promise<TeamTaskGroup> {
		return this.collection.withMutationLock(async () => {
			const groups = (await this.collection.readAll()).map(group => normalizeStoredGroup(group));
			const index = groups.findIndex(group => group.groupId === groupId);
			if (index < 0) throw new Error(`task group not found: ${groupId}`);
			const existing = groups[index]!;
			const archived: TeamTaskGroup = {
				...existing,
				archived: true,
				updatedAt: now(),
			};
			groups[index] = archived;
			await this.collection.writeAll(groups);
			return archived;
		});
	}

	async resolve(group: TeamTaskGroup): Promise<ResolvedTeamTaskGroup> {
		const normalized = normalizeStoredGroup(group);
		const errors: TeamTaskGroupValidationIssue[] = [];
		const groupTaskIds = new Set(normalized.taskIds);
		for (const taskId of normalized.taskIds) {
			const task = await this.taskStore.get(taskId);
			if (!task) {
				errors.push({
					code: "task_not_found",
					message: `Task not found: ${taskId}`,
					taskId,
				});
				continue;
			}
			if (task.archived) {
				errors.push({
					code: "task_archived",
					message: `Task is archived: ${taskId}`,
					taskId,
				});
			}
			if (task.generatedSource) {
				errors.push({
					code: "generated_task_not_supported",
					message: `Generated child Task is not supported in a Group: ${taskId}`,
					taskId,
				});
			}
		}

		const incomingInternal = new Set<string>();
		for (const connection of await this.connectionStore.listResolved()) {
			if (connection.status !== "active") continue;
			const fromInGroup = groupTaskIds.has(connection.fromTaskId);
			const toInGroup = groupTaskIds.has(connection.toTaskId);
			if (fromInGroup && toInGroup) {
				incomingInternal.add(connection.toTaskId);
				continue;
			}
			if (!fromInGroup && toInGroup) {
				errors.push({
					code: "external_incoming_task_edge",
					message: `Group outside task ${connection.fromTaskId} connects to Group task ${connection.toTaskId}`,
					taskId: connection.toTaskId,
					connectionId: connection.connectionId,
				});
			}
			if (fromInGroup && !toInGroup) {
				errors.push({
					code: "external_outgoing_task_edge",
					message: `Group task ${connection.fromTaskId} connects to outside task ${connection.toTaskId}`,
					taskId: connection.fromTaskId,
					connectionId: connection.connectionId,
				});
			}
		}

		for (const dependency of await this.dependencyStore.listResolved()) {
			if (dependency.status !== "active") continue;
			const fromInGroup = groupTaskIds.has(dependency.fromTaskId);
			const toInGroup = groupTaskIds.has(dependency.toTaskId);
			if (fromInGroup && toInGroup) {
				incomingInternal.add(dependency.toTaskId);
				continue;
			}
			if (!fromInGroup && toInGroup) {
				errors.push({
					code: "external_incoming_task_edge",
					message: `Group outside task ${dependency.fromTaskId} has a control dependency to Group task ${dependency.toTaskId}`,
					taskId: dependency.toTaskId,
					dependencyId: dependency.dependencyId,
				});
			}
			if (fromInGroup && !toInGroup) {
				errors.push({
					code: "external_outgoing_task_edge",
					message: `Group task ${dependency.fromTaskId} has a control dependency to outside task ${dependency.toTaskId}`,
					taskId: dependency.fromTaskId,
					dependencyId: dependency.dependencyId,
				});
			}
		}

		const headTaskIds = normalized.taskIds.filter(taskId => !incomingInternal.has(taskId));
		if (headTaskIds.length === 0) {
			errors.push({
				code: "no_head_task",
				message: "Group must have at least one head Task",
			});
		}

		return {
			...normalized,
			status: errors.length === 0 ? "valid" : "invalid",
			headTaskIds,
			validation: { errors },
		};
	}
}

function normalizeStoredGroup(group: TeamTaskGroup): TeamTaskGroup {
	return {
		...group,
		title: typeof group.title === "string" ? group.title : "",
		taskIds: normalizeStoredTaskIds(group.taskIds),
		archived: group.archived ?? false,
	};
}

function normalizeTitle(value: unknown): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error("title must be a non-empty string");
	}
	return value.trim();
}

function normalizeTaskIds(value: unknown): string[] {
	if (!Array.isArray(value)) {
		throw new Error("taskIds must be an array");
	}
	const taskIds: string[] = [];
	const seen = new Set<string>();
	for (const raw of value) {
		if (typeof raw !== "string") {
			throw new Error("taskIds entries must be non-empty strings");
		}
		const taskId = raw.trim();
		if (!taskId) {
			throw new Error("taskIds entries must be non-empty strings");
		}
		if (seen.has(taskId)) continue;
		seen.add(taskId);
		taskIds.push(taskId);
	}
	return taskIds;
}

function normalizeStoredTaskIds(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const taskIds: string[] = [];
	const seen = new Set<string>();
	for (const raw of value) {
		if (typeof raw !== "string") continue;
		const taskId = raw.trim();
		if (!taskId || seen.has(taskId)) continue;
		seen.add(taskId);
		taskIds.push(taskId);
	}
	return taskIds;
}
