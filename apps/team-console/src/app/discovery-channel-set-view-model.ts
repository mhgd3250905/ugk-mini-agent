import type { TeamDiscoveryChannelSet, TeamDiscoveryRunPolicy, TeamRunState } from "../api/team-types";

export interface DiscoveryChannelSetLookupInput {
  task: { taskId: string; discoveryRunPolicy?: TeamDiscoveryRunPolicy };
  activeDiscoveryRun: Pick<TeamRunState, "source"> | null;
  selectedChannelSetId: string | null;
  channelSets: TeamDiscoveryChannelSet[];
  channelSetTitle: string;
  channelSetLoading: boolean;
  channelSetSaving: boolean;
  runPolicySaving: boolean;
}

export interface DiscoveryChannelSetLookup {
  selectedChannelSetId: string | null;
  selectedChannelSet: TeamDiscoveryChannelSet | null;
  activeChannelSetId: string | null;
  activeChannelSet: TeamDiscoveryChannelSet | null;
  defaultChannelSetId: string | null;
  defaultChannelSet: TeamDiscoveryChannelSet | null;
  activeChannelTaskIdSet: Set<string>;
  activeRunUsesChannelSet: boolean;
  title: string;
  loading: boolean;
  saving: boolean;
  runPolicySaving: boolean;
}

export interface DiscoveryChannelSetSelectionSummary {
  selectedActiveGeneratedTaskCount: number;
  allActiveGeneratedTasksSelected: boolean;
}

function findChannelSetById(channelSets: TeamDiscoveryChannelSet[], id: string | null): TeamDiscoveryChannelSet | null {
  if (!id) return null;
  return channelSets.find((cs) => cs.channelSetId === id) ?? null;
}

export function buildDiscoveryChannelSetLookup(input: DiscoveryChannelSetLookupInput): DiscoveryChannelSetLookup {
  const { task, activeDiscoveryRun, selectedChannelSetId, channelSets, channelSetTitle, channelSetLoading, channelSetSaving, runPolicySaving } = input;

  const activeChannelSetId = activeDiscoveryRun?.source?.discoveryChannelSetId ?? null;
  const activeChannelSet = findChannelSetById(channelSets, activeChannelSetId);
  const defaultChannelSetId = task.discoveryRunPolicy?.mode === "channel_set"
    ? task.discoveryRunPolicy.channelSetId
    : null;
  const defaultChannelSet = findChannelSetById(channelSets, defaultChannelSetId);
  const selectedChannelSet = findChannelSetById(channelSets, selectedChannelSetId);
  const activeChannelTaskIdSet = new Set(
    activeChannelSet?.items.map((item) => item.generatedTaskId) ?? [],
  );

  return {
    selectedChannelSetId,
    selectedChannelSet,
    activeChannelSetId,
    activeChannelSet,
    defaultChannelSetId,
    defaultChannelSet,
    activeChannelTaskIdSet,
    activeRunUsesChannelSet: Boolean(activeChannelSetId),
    title: channelSetTitle,
    loading: channelSetLoading,
    saving: channelSetSaving,
    runPolicySaving,
  };
}

export function buildDiscoveryChannelSetSelectionSummary(
  activeGeneratedTaskIds: string[],
  selectedTaskIdSet: Set<string>,
): DiscoveryChannelSetSelectionSummary {
  const selectedActiveGeneratedTaskCount = activeGeneratedTaskIds.filter((id) => selectedTaskIdSet.has(id)).length;
  const allActiveGeneratedTasksSelected = activeGeneratedTaskIds.length > 0
    && selectedActiveGeneratedTaskCount === activeGeneratedTaskIds.length;
  return { selectedActiveGeneratedTaskCount, allActiveGeneratedTasksSelected };
}
