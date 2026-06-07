import { randomUUID } from "node:crypto";
import { JsonCollectionStore } from "./json-collection-store.js";
import type { TaskStore } from "./task-store.js";
import type { TeamCanvasTask, TeamDiscoveryChannelSet, TeamDiscoveryChannelSetItem, TeamWorkUnitDefinition } from "./types.js";

export interface DiscoveryChannelSetListOptions {
	includeArchived?: boolean;
}

export interface CreateDiscoveryChannelSetInput {
	title: string;
	generatedTaskIds: string[];
}

export interface UpdateDiscoveryChannelSetInput {
	title?: string;
	generatedTaskIds?: string[];
}

type DiscoveryChannelSetTaskReader = Pick<TaskStore, "get">;

const now = () => new Date().toISOString();
const generateDiscoveryChannelSetId = () => `channel_set_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

function cloneWorkUnit(workUnit: TeamWorkUnitDefinition): TeamWorkUnitDefinition {
	return JSON.parse(JSON.stringify(workUnit)) as TeamWorkUnitDefinition;
}

export class DiscoveryChannelSetStore {
	private readonly collection: JsonCollectionStore<TeamDiscoveryChannelSet>;

	constructor(
		rootDir: string,
		private readonly taskStore: DiscoveryChannelSetTaskReader,
	) {
		this.collection = new JsonCollectionStore<TeamDiscoveryChannelSet>({
			rootDir,
			fileName: "discovery-channel-sets.json",
			schemaVersion: "team/discovery-channel-set-1",
			lockDirName: ".discovery-channel-sets.lock",
			errorLabel: "discovery channel set store",
		});
	}

	async listForDiscoveryTask(discoveryTaskId: string, options: DiscoveryChannelSetListOptions = {}): Promise<TeamDiscoveryChannelSet[]> {
		const channelSets = await this.collection.readAll();
		return channelSets
			.map(set => normalizeStoredChannelSet(set))
			.filter(set => set.sourceDiscoveryTaskId === discoveryTaskId)
			.filter(set => options.includeArchived || !set.archived)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	async get(channelSetId: string): Promise<TeamDiscoveryChannelSet | null> {
		const channelSets = await this.collection.readAll();
		return channelSets.map(set => normalizeStoredChannelSet(set)).find(set => set.channelSetId === channelSetId) ?? null;
	}

	async create(sourceDiscoveryTaskId: string, input: CreateDiscoveryChannelSetInput): Promise<TeamDiscoveryChannelSet> {
		const discoveryTask = await this.requireDiscoveryRootTask(sourceDiscoveryTaskId);
		const title = normalizeTitle(input.title);
		const items = await this.buildItems(discoveryTask, input.generatedTaskIds);
		const timestamp = now();
		const channelSet: TeamDiscoveryChannelSet = {
			schemaVersion: "team/discovery-channel-set-1",
			channelSetId: generateDiscoveryChannelSetId(),
			sourceDiscoveryTaskId: discoveryTask.taskId,
			title,
			items,
			archived: false,
			createdAt: timestamp,
			updatedAt: timestamp,
		};
		return this.collection.withMutationLock(async () => {
			const existing = (await this.collection.readAll()).map(set => normalizeStoredChannelSet(set));
			await this.collection.writeAll([...existing, channelSet]);
			return channelSet;
		});
	}

	async update(sourceDiscoveryTaskId: string, channelSetId: string, patch: UpdateDiscoveryChannelSetInput): Promise<TeamDiscoveryChannelSet> {
		const discoveryTask = await this.requireDiscoveryRootTask(sourceDiscoveryTaskId);
		return this.collection.withMutationLock(async () => {
			const channelSets = (await this.collection.readAll()).map(set => normalizeStoredChannelSet(set));
			const index = channelSets.findIndex(set => set.channelSetId === channelSetId && set.sourceDiscoveryTaskId === sourceDiscoveryTaskId);
			if (index < 0) throw new Error(`discovery channel set not found: ${channelSetId}`);
			const existing = channelSets[index]!;
			const updated: TeamDiscoveryChannelSet = {
				...existing,
				...(Object.hasOwn(patch, "title") ? { title: normalizeTitle(patch.title) } : {}),
				...(Object.hasOwn(patch, "generatedTaskIds") ? { items: await this.buildItems(discoveryTask, patch.generatedTaskIds) } : {}),
				updatedAt: now(),
			};
			channelSets[index] = updated;
			await this.collection.writeAll(channelSets);
			return updated;
		});
	}

	async archive(sourceDiscoveryTaskId: string, channelSetId: string): Promise<TeamDiscoveryChannelSet> {
		return this.collection.withMutationLock(async () => {
			const channelSets = (await this.collection.readAll()).map(set => normalizeStoredChannelSet(set));
			const index = channelSets.findIndex(set => set.channelSetId === channelSetId && set.sourceDiscoveryTaskId === sourceDiscoveryTaskId);
			if (index < 0) throw new Error(`discovery channel set not found: ${channelSetId}`);
			const archived: TeamDiscoveryChannelSet = {
				...channelSets[index]!,
				archived: true,
				updatedAt: now(),
			};
			channelSets[index] = archived;
			await this.collection.writeAll(channelSets);
			return archived;
		});
	}

	private async requireDiscoveryRootTask(taskId: string): Promise<TeamCanvasTask> {
		const task = await this.taskStore.get(taskId);
		if (!task) throw new Error(`task not found: ${taskId}`);
		if (task.archived) throw new Error("archived Discovery task cannot own a channel set");
		if (task.canvasKind !== "discovery" || task.generatedSource) {
			throw new Error("Discovery channel set requires a Discovery root task");
		}
		return task;
	}

	private async buildItems(discoveryTask: TeamCanvasTask, value: unknown): Promise<TeamDiscoveryChannelSetItem[]> {
		const generatedTaskIds = normalizeGeneratedTaskIds(value);
		const items: TeamDiscoveryChannelSetItem[] = [];
		for (const generatedTaskId of generatedTaskIds) {
			const generatedTask = await this.taskStore.get(generatedTaskId);
			if (!generatedTask) throw new Error(`generated task not found: ${generatedTaskId}`);
			if (generatedTask.archived) throw new Error(`archived generated task cannot be used in channel set: ${generatedTaskId}`);
			const source = generatedTask.generatedSource;
			if (!source) throw new Error(`task is not a generated Discovery item: ${generatedTaskId}`);
			if (source.sourceDiscoveryTaskId !== discoveryTask.taskId) {
				throw new Error(`generated task ${generatedTaskId} does not belong to Discovery task ${discoveryTask.taskId}`);
			}
			if (!source.sourceItemId.trim()) throw new Error(`generated task source item id is missing: ${generatedTaskId}`);
			const workUnitSnapshot = cloneWorkUnit(
				source.workUnitMode === "managed" && source.latestManagedWorkUnit
					? source.latestManagedWorkUnit
					: generatedTask.workUnit,
			);
			items.push({
				generatedTaskId,
				sourceItemId: source.sourceItemId,
				title: generatedTask.title,
				itemPayload: cloneRecord(source.itemPayload),
				workUnitSnapshot,
				workUnitMode: source.workUnitMode,
				...(source.latestDiscoveryRunId ? { latestDiscoveryRunId: source.latestDiscoveryRunId } : {}),
				...(source.latestDiscoveryAttemptId ? { latestDiscoveryAttemptId: source.latestDiscoveryAttemptId } : {}),
				...(source.latestDiscoveredAt ? { latestDiscoveredAt: source.latestDiscoveredAt } : {}),
			});
		}
		return items;
	}
}

function normalizeStoredChannelSet(channelSet: TeamDiscoveryChannelSet): TeamDiscoveryChannelSet {
	return {
		...channelSet,
		title: typeof channelSet.title === "string" ? channelSet.title : "",
		items: Array.isArray(channelSet.items) ? channelSet.items.map(normalizeStoredItem).filter(Boolean) as TeamDiscoveryChannelSetItem[] : [],
		archived: channelSet.archived ?? false,
	};
}

function normalizeStoredItem(item: TeamDiscoveryChannelSetItem): TeamDiscoveryChannelSetItem | null {
	if (!item || typeof item !== "object") return null;
	if (typeof item.generatedTaskId !== "string" || !item.generatedTaskId.trim()) return null;
	if (typeof item.sourceItemId !== "string" || !item.sourceItemId.trim()) return null;
	if (!item.workUnitSnapshot || typeof item.workUnitSnapshot !== "object") return null;
	return {
		...item,
		title: typeof item.title === "string" ? item.title : item.sourceItemId,
		itemPayload: cloneRecord(item.itemPayload),
		workUnitMode: item.workUnitMode === "customized" ? "customized" : "managed",
		workUnitSnapshot: cloneWorkUnit(item.workUnitSnapshot),
	};
}

function normalizeTitle(value: unknown): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error("title must be a non-empty string");
	}
	return value.trim();
}

function normalizeGeneratedTaskIds(value: unknown): string[] {
	if (!Array.isArray(value)) {
		throw new Error("generatedTaskIds must be an array");
	}
	const ids: string[] = [];
	const seen = new Set<string>();
	for (const raw of value) {
		if (typeof raw !== "string" || !raw.trim()) {
			throw new Error("generatedTaskIds entries must be non-empty strings");
		}
		const id = raw.trim();
		if (seen.has(id)) continue;
		seen.add(id);
		ids.push(id);
	}
	if (ids.length === 0) {
		throw new Error("generatedTaskIds must contain at least one generated task");
	}
	return ids;
}

function cloneRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? JSON.parse(JSON.stringify(value)) as Record<string, unknown>
		: {};
}
