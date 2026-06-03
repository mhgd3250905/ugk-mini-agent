import type { TeamCanvasTask } from "../api/team-types";
import { discoveryRootTasks } from "./team-console-discovery-refresh";

export type DiscoverySubscriptionState = {
  loadedTaskIds: ReadonlySet<string>;
  loadingTaskIds: ReadonlySet<string>;
  generatedCatalogVersionByTaskId: Readonly<Record<string, string | null>>;
  generatedRunSummaryVersionByTaskId: Readonly<Record<string, string | null>>;
};

export type DiscoverySubscriptionPruneResult = DiscoverySubscriptionState & {
  shouldClearTimers: boolean;
};

export function selectOpenDiscoveryRootIds(
  rootTasks: TeamCanvasTask[],
  openDiscoveryTaskIds: string[],
): string[] {
  const discoveryRootIdSet = new Set(discoveryRootTasks(rootTasks).map((task) => task.taskId));
  return openDiscoveryTaskIds.filter((taskId) => discoveryRootIdSet.has(taskId));
}

export function selectDiscoveryCatalogTaskIdsToLoad(input: {
  rootTasks: TeamCanvasTask[];
  openDiscoveryTaskIds: string[];
  loadedTaskIds: ReadonlySet<string>;
  loadingTaskIds: ReadonlySet<string>;
}): string[] {
  const openRootIds = selectOpenDiscoveryRootIds(input.rootTasks, input.openDiscoveryTaskIds);
  return openRootIds.filter(
    (id) => !input.loadedTaskIds.has(id) && !input.loadingTaskIds.has(id),
  );
}

export function pruneDiscoverySubscriptionStateForOpenIds(
  state: DiscoverySubscriptionState,
  openDiscoveryTaskIds: string[],
): DiscoverySubscriptionPruneResult {
  const openSet = new Set(openDiscoveryTaskIds);

  const loadedTaskIds = new Set<string>();
  for (const taskId of state.loadedTaskIds) {
    if (openSet.has(taskId)) loadedTaskIds.add(taskId);
  }

  const loadingTaskIds = new Set<string>();
  for (const taskId of state.loadingTaskIds) {
    if (openSet.has(taskId)) loadingTaskIds.add(taskId);
  }

  const generatedCatalogVersionByTaskId: Record<string, string | null> = {};
  for (const [taskId, version] of Object.entries(state.generatedCatalogVersionByTaskId)) {
    if (openSet.has(taskId)) generatedCatalogVersionByTaskId[taskId] = version;
  }

  const generatedRunSummaryVersionByTaskId: Record<string, string | null> = {};
  for (const [taskId, version] of Object.entries(state.generatedRunSummaryVersionByTaskId)) {
    if (openSet.has(taskId)) generatedRunSummaryVersionByTaskId[taskId] = version;
  }

  return {
    loadedTaskIds,
    loadingTaskIds,
    generatedCatalogVersionByTaskId,
    generatedRunSummaryVersionByTaskId,
    shouldClearTimers: openDiscoveryTaskIds.length === 0,
  };
}
