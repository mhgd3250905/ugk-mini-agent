import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renameWithTransientRetry } from "../file-system.js";
import { generateTaskId } from "./ids.js";
import type { TeamCanvasTask, TeamCanvasTaskStatus, TeamDiscoverySpec, TeamTaskTemplateConfig, TeamWorkUnitDefinition } from "./types.js";
import {
	type CreateTeamCanvasTaskInput,
	type TaskValidationContext,
	type UpdateTeamCanvasTaskInput,
	validateCreateTaskInput,
	validateTaskUpdateInput,
} from "./task-validation.js";

export interface TaskStoreListOptions {
	includeArchived?: boolean;
	includeGenerated?: boolean;
}

export interface TaskStoreOptions {
	getAgentIds?: () => Iterable<string>;
}

export interface UpsertGeneratedTaskFromDiscoveryInput {
	sourceDiscoveryTaskId: string;
	sourceItemId: string;
	itemPayload: Record<string, unknown>;
	latestDiscoveryRunId: string;
	latestDiscoveryAttemptId: string;
	latestDiscoveredAt: string;
	leaderAgentId: string;
	generatedWorkerAgentId: string;
	generatedCheckerAgentId: string;
	workUnit: Omit<TeamWorkUnitDefinition, "workerAgentId" | "checkerAgentId">;
}

export interface CloneTeamCanvasTaskInput {
	title?: string;
	templateBindings?: Record<string, string>;
}

function cloneWorkUnit(workUnit: TeamWorkUnitDefinition): TeamWorkUnitDefinition {
	return JSON.parse(JSON.stringify(workUnit)) as TeamWorkUnitDefinition;
}

function cloneDiscoverySpec(discoverySpec: TeamDiscoverySpec | undefined): TeamDiscoverySpec | undefined {
	return discoverySpec ? JSON.parse(JSON.stringify(discoverySpec)) as TeamDiscoverySpec : undefined;
}

function cloneTemplateConfig(templateConfig: TeamTaskTemplateConfig | undefined): TeamTaskTemplateConfig | undefined {
	return templateConfig ? JSON.parse(JSON.stringify(templateConfig)) as TeamTaskTemplateConfig : undefined;
}

function replaceTemplatePlaceholders(value: string, bindings: Record<string, string>): string {
	return value.replace(/\{\{([A-Za-z][A-Za-z0-9_-]{0,63})\}\}/g, (match, key: string) => {
		return bindings[key] ?? match;
	});
}

function applyBindingsToWorkUnit(workUnit: TeamWorkUnitDefinition, bindings: Record<string, string>): TeamWorkUnitDefinition {
	return {
		...workUnit,
		title: replaceTemplatePlaceholders(workUnit.title, bindings),
		input: { text: replaceTemplatePlaceholders(workUnit.input.text, bindings) },
		outputContract: { text: replaceTemplatePlaceholders(workUnit.outputContract.text, bindings) },
		acceptance: { rules: workUnit.acceptance.rules.map(rule => replaceTemplatePlaceholders(rule, bindings)) },
	};
}

function applyBindingsToDiscoverySpec(discoverySpec: TeamDiscoverySpec | undefined, bindings: Record<string, string>): TeamDiscoverySpec | undefined {
	if (!discoverySpec) return undefined;
	return {
		...discoverySpec,
		discoveryGoal: replaceTemplatePlaceholders(discoverySpec.discoveryGoal, bindings),
		dispatchGoal: replaceTemplatePlaceholders(discoverySpec.dispatchGoal, bindings),
	};
}

function buildTemplateBindings(
	templateConfig: TeamTaskTemplateConfig,
	inputBindings: Record<string, string> | undefined,
): Record<string, string> {
	const raw = inputBindings ?? {};
	const bindings: Record<string, string> = {};
	for (const parameter of templateConfig.parameters) {
		const rawValue = raw[parameter.id] ?? parameter.defaultValue;
		if (typeof rawValue !== "string" || !rawValue.trim()) {
			if (parameter.required !== false) {
				throw new Error(`template binding is required: ${parameter.id}`);
			}
			continue;
		}
		bindings[parameter.id] = rawValue.trim();
	}
	return bindings;
}

export class TaskStore {
	constructor(
		private readonly rootDir: string,
		private readonly options: TaskStoreOptions = {},
	) {}

	async create(input: CreateTeamCanvasTaskInput): Promise<TeamCanvasTask> {
		validateCreateTaskInput(input, this.validationContext());
		const now = new Date().toISOString();
		const task: TeamCanvasTask = {
			taskId: generateTaskId(),
			title: input.title,
			leaderAgentId: input.leaderAgentId,
			workUnit: input.workUnit,
			...(input.canvasKind ? { canvasKind: input.canvasKind } : {}),
			...(input.discoverySpec ? { discoverySpec: input.discoverySpec } : {}),
			...(input.generatedSource ? { generatedSource: input.generatedSource } : {}),
			...(input.templateConfig ? { templateConfig: input.templateConfig } : {}),
			...(input.templateInstance ? { templateInstance: input.templateInstance } : {}),
			status: input.status ?? "drafting",
			createdAt: now,
			updatedAt: now,
			...(input.createdByAgentId ? { createdByAgentId: input.createdByAgentId } : {}),
			archived: false,
		};
		await this.write(task);
		return task;
	}

	async list(options: TaskStoreListOptions = {}): Promise<TeamCanvasTask[]> {
		const tasksDir = join(this.rootDir, "tasks");
		try {
			const { readdir } = await import("node:fs/promises");
			const files = await readdir(tasksDir);
			const tasks: TeamCanvasTask[] = [];
			for (const file of files) {
				if (!file.endsWith(".json")) continue;
				const data = await this.readJson<TeamCanvasTask>(join(tasksDir, file));
				if (!data) continue;
				const task = this.normalize(data);
				if (!options.includeArchived && task.archived) continue;
				if (!options.includeGenerated && task.generatedSource) continue;
				tasks.push(task);
			}
			return tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		} catch {
			return [];
		}
	}

	async get(taskId: string): Promise<TeamCanvasTask | null> {
		const data = await this.readJson<TeamCanvasTask>(join(this.rootDir, "tasks", `${taskId}.json`));
		return data ? this.normalize(data) : null;
	}

	async update(taskId: string, patch: UpdateTeamCanvasTaskInput): Promise<TeamCanvasTask> {
		const existing = await this.get(taskId);
		if (!existing) throw new Error(`task not found: ${taskId}`);
		validateTaskUpdateInput(existing, patch, this.validationContext());
		const updated: TeamCanvasTask = {
			...existing,
			...patch,
			updatedAt: new Date().toISOString(),
		};
		if (existing.generatedSource && patch.workUnit !== undefined) {
			updated.generatedSource = { ...existing.generatedSource, workUnitMode: "customized" };
		}
		await this.write(updated);
		return updated;
	}

	async clone(taskId: string, input: CloneTeamCanvasTaskInput = {}): Promise<TeamCanvasTask> {
		const source = await this.get(taskId);
		if (!source) throw new Error(`task not found: ${taskId}`);
		if (source.generatedSource) {
			throw new Error("generated Task cannot be cloned through this route");
		}
		if (source.archived) {
			throw new Error("archived task cannot be cloned");
		}
		const templateConfig = cloneTemplateConfig(source.templateConfig);
		const bindings = templateConfig ? buildTemplateBindings(templateConfig, input.templateBindings) : {};
		const workUnit = applyBindingsToWorkUnit(cloneWorkUnit(source.workUnit), bindings);
		const discoverySpec = applyBindingsToDiscoverySpec(cloneDiscoverySpec(source.discoverySpec), bindings);
		const rawTitle = input.title?.trim();
		const title = rawTitle
			? replaceTemplatePlaceholders(rawTitle, bindings)
			: replaceTemplatePlaceholders(source.title, bindings);
		return await this.create({
			title,
			leaderAgentId: source.leaderAgentId,
			workUnit,
			...(source.canvasKind ? { canvasKind: source.canvasKind } : {}),
			...(discoverySpec ? { discoverySpec } : {}),
			...(templateConfig
				? {
					templateInstance: {
						schemaVersion: "team/task-template-instance-1",
						sourceTaskId: source.taskId,
						bindings,
					},
				}
				: {}),
			status: source.status === "ready" ? "ready" : "drafting",
			...(source.createdByAgentId ? { createdByAgentId: source.createdByAgentId } : {}),
		});
	}

	async listGeneratedForDiscoveryTask(discoveryTaskId: string, options: TaskStoreListOptions = {}): Promise<TeamCanvasTask[]> {
		const tasks = await this.list({ ...options, includeGenerated: true });
		return tasks.filter(task => task.generatedSource?.sourceDiscoveryTaskId === discoveryTaskId);
	}

	async upsertGeneratedTaskFromDiscovery(input: UpsertGeneratedTaskFromDiscoveryInput): Promise<{ task: TeamCanvasTask; created: boolean; workUnitUpdated: boolean }> {
		if (typeof input.workUnit?.title !== "string" || !input.workUnit.title.trim()) {
			throw new Error("task title is required");
		}
		const latestManagedWorkUnit = cloneWorkUnit({
			...input.workUnit,
			workerAgentId: input.generatedWorkerAgentId,
			checkerAgentId: input.generatedCheckerAgentId,
		});
		const generatedSource = {
			schemaVersion: "team/generated-task-source-1" as const,
			sourceDiscoveryTaskId: input.sourceDiscoveryTaskId,
			sourceItemId: input.sourceItemId,
			itemStatus: "active" as const,
			itemPayload: input.itemPayload,
			latestDiscoveryRunId: input.latestDiscoveryRunId,
			latestDiscoveryAttemptId: input.latestDiscoveryAttemptId,
			latestDiscoveredAt: input.latestDiscoveredAt,
			workUnitMode: "managed" as const,
			latestManagedWorkUnit,
		};
		const workUnit = cloneWorkUnit(latestManagedWorkUnit);
		const existing = (await this.listGeneratedForDiscoveryTask(input.sourceDiscoveryTaskId, { includeArchived: true }))
			.find(task => task.generatedSource?.sourceItemId === input.sourceItemId);
		if (existing?.archived) {
			throw new Error(`archived generated task conflict for discovery item: ${input.sourceDiscoveryTaskId}/${input.sourceItemId}`);
		}
		if (!existing) {
			const task = await this.create({
				title: input.workUnit.title,
				leaderAgentId: input.leaderAgentId,
				workUnit,
				generatedSource,
				status: "ready",
			});
			return { task, created: true, workUnitUpdated: true };
		}

		const workUnitUpdated = existing.generatedSource?.workUnitMode === "managed";
		const updated: TeamCanvasTask = {
			...existing,
			...(workUnitUpdated ? { title: input.workUnit.title, workUnit } : {}),
			generatedSource: {
				...existing.generatedSource!,
				itemStatus: "active",
				itemPayload: input.itemPayload,
				latestDiscoveryRunId: input.latestDiscoveryRunId,
				latestDiscoveryAttemptId: input.latestDiscoveryAttemptId,
				latestDiscoveredAt: input.latestDiscoveredAt,
				latestManagedWorkUnit,
			},
			updatedAt: new Date().toISOString(),
		};
		validateCreateTaskInput(updated, this.validationContext());
		await this.write(updated);
		return { task: updated, created: false, workUnitUpdated };
	}

	async resetGeneratedTaskWorkUnit(taskId: string): Promise<TeamCanvasTask> {
		const existing = await this.get(taskId);
		if (!existing) throw new Error(`task not found: ${taskId}`);
		if (!existing.generatedSource) {
			throw new Error("generated WorkUnit reset requires a generated task");
		}
		if (existing.archived) {
			throw new Error("archived generated task cannot reset WorkUnit");
		}
		const latestManagedWorkUnit = existing.generatedSource.latestManagedWorkUnit;
		if (!latestManagedWorkUnit) {
			throw new Error("latest managed WorkUnit snapshot is missing");
		}
		const workUnit = cloneWorkUnit(latestManagedWorkUnit);
		const updated: TeamCanvasTask = {
			...existing,
			title: workUnit.title,
			workUnit,
			generatedSource: {
				...existing.generatedSource,
				workUnitMode: "managed",
				latestManagedWorkUnit: cloneWorkUnit(latestManagedWorkUnit),
			},
			updatedAt: new Date().toISOString(),
		};
		validateCreateTaskInput(updated, this.validationContext());
		await this.write(updated);
		return updated;
	}

	async markGeneratedTasksStaleForDiscovery(
		discoveryTaskId: string,
		activeSourceItemIds: ReadonlySet<string>,
		input: { latestDiscoveryRunId: string; latestDiscoveryAttemptId: string; latestDiscoveredAt: string },
	): Promise<TeamCanvasTask[]> {
		const generated = await this.listGeneratedForDiscoveryTask(discoveryTaskId);
		const staleTasks: TeamCanvasTask[] = [];
		for (const task of generated) {
			const source = task.generatedSource;
			if (!source || activeSourceItemIds.has(source.sourceItemId)) continue;
			const updated: TeamCanvasTask = {
				...task,
				generatedSource: {
					...source,
					itemStatus: "stale",
					latestDiscoveryRunId: input.latestDiscoveryRunId,
					latestDiscoveryAttemptId: input.latestDiscoveryAttemptId,
					latestDiscoveredAt: input.latestDiscoveredAt,
				},
				updatedAt: new Date().toISOString(),
			};
			await this.write(updated);
			staleTasks.push(updated);
		}
		return staleTasks;
	}

	async archive(taskId: string): Promise<TeamCanvasTask> {
		const existing = await this.get(taskId);
		if (!existing) throw new Error(`task not found: ${taskId}`);
		if (existing.archived) throw new Error(`already archived: ${taskId}`);
		const updated: TeamCanvasTask = {
			...existing,
			status: "archived",
			archived: true,
			updatedAt: new Date().toISOString(),
		};
		await this.write(updated);
		return updated;
	}

	private validationContext(): TaskValidationContext {
		const ids = this.options.getAgentIds?.();
		return ids ? { availableAgentIds: new Set(ids) } : {};
	}

	private normalize(task: TeamCanvasTask): TeamCanvasTask {
		const status = (task.status ?? "drafting") as TeamCanvasTaskStatus;
		return {
			...task,
			status,
			archived: task.archived ?? false,
		};
	}

	private async write(task: TeamCanvasTask): Promise<void> {
		const tasksDir = join(this.rootDir, "tasks");
		await mkdir(tasksDir, { recursive: true });
		const filePath = join(tasksDir, `${task.taskId}.json`);
		const tmp = filePath + ".tmp";
		await writeFile(tmp, JSON.stringify(task, null, 2), "utf8");
		await renameWithTransientRetry(tmp, filePath);
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
