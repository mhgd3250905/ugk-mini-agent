import { describe, it, expect } from "vitest";
import {
  buildDiscoveryChannelSetLookup,
  buildDiscoveryChannelSetSelectionSummary,
  type DiscoveryChannelSetLookupInput,
} from "../app/discovery-channel-set-view-model";
import type { TeamDiscoveryChannelSet, TeamWorkUnitDefinition, TeamRunState } from "../api/team-types";

const mockWorkUnit: TeamWorkUnitDefinition = {
  title: "Mock Task",
  input: { text: "mock input" },
  outputContract: { text: "mock output" },
  acceptance: { rules: [] },
  workerAgentId: "agent_worker",
  checkerAgentId: "agent_checker",
};

const makeChannelSet = (overrides: Partial<TeamDiscoveryChannelSet> & { channelSetId: string }): TeamDiscoveryChannelSet => ({
  schemaVersion: "team/discovery-channel-set-1",
  sourceDiscoveryTaskId: "discovery_root_1",
  title: overrides.title ?? "Test Set",
  items: overrides.items ?? [],
  archived: false,
  createdAt: "2026-06-09T00:00:00Z",
  updatedAt: "2026-06-09T00:00:00Z",
  ...overrides,
});

const makeDiscoveryRunSource = (discoveryChannelSetId: string): Pick<TeamRunState, "source">["source"] => ({
  type: "canvas-task",
  taskId: "discovery_root_1",
  discoveryChannelSetId,
});

describe("buildDiscoveryChannelSetLookup", () => {
  it("resolves selected, active, and default channel sets", () => {
    const selectedSet = makeChannelSet({ channelSetId: "cs_selected", title: "Selected" });
    const activeSet = makeChannelSet({
      channelSetId: "cs_active",
      title: "Active",
      items: [
        { generatedTaskId: "gen_a", sourceItemId: "item_a", title: "A", itemPayload: {}, workUnitSnapshot: mockWorkUnit, workUnitMode: "managed" },
        { generatedTaskId: "gen_b", sourceItemId: "item_b", title: "B", itemPayload: {}, workUnitSnapshot: mockWorkUnit, workUnitMode: "managed" },
      ],
    });
    const defaultSet = makeChannelSet({ channelSetId: "cs_default", title: "Default" });

    const input: DiscoveryChannelSetLookupInput = {
      task: { taskId: "root_1", discoveryRunPolicy: { mode: "channel_set", channelSetId: "cs_default" } },
      activeDiscoveryRun: { source: makeDiscoveryRunSource("cs_active") },
      selectedChannelSetId: "cs_selected",
      channelSets: [selectedSet, activeSet, defaultSet],
      channelSetTitle: "My Title",
      channelSetLoading: true,
      channelSetSaving: false,
      runPolicySaving: true,
    };

    const result = buildDiscoveryChannelSetLookup(input);

    expect(result.selectedChannelSet).toBe(selectedSet);
    expect(result.activeChannelSet).toBe(activeSet);
    expect(result.defaultChannelSet).toBe(defaultSet);
    expect(result.activeChannelTaskIdSet).toEqual(new Set(["gen_a", "gen_b"]));
    expect(result.activeRunUsesChannelSet).toBe(true);
    expect(result.title).toBe("My Title");
    expect(result.loading).toBe(true);
    expect(result.saving).toBe(false);
    expect(result.runPolicySaving).toBe(true);
  });

  it("preserves missing ids while returning null channel-set objects", () => {
    const input: DiscoveryChannelSetLookupInput = {
      task: { taskId: "root_1", discoveryRunPolicy: { mode: "channel_set", channelSetId: "cs_default_missing" } },
      activeDiscoveryRun: { source: makeDiscoveryRunSource("cs_missing") },
      selectedChannelSetId: "cs_also_missing",
      channelSets: [],
      channelSetTitle: "",
      channelSetLoading: false,
      channelSetSaving: false,
      runPolicySaving: false,
    };

    const result = buildDiscoveryChannelSetLookup(input);

    expect(result.selectedChannelSetId).toBe("cs_also_missing");
    expect(result.selectedChannelSet).toBeNull();
    expect(result.activeChannelSetId).toBe("cs_missing");
    expect(result.activeChannelSet).toBeNull();
    expect(result.defaultChannelSetId).toBe("cs_default_missing");
    expect(result.defaultChannelSet).toBeNull();
    expect(result.activeRunUsesChannelSet).toBe(true);
    expect(result.activeChannelTaskIdSet).toEqual(new Set());
  });
});

describe("buildDiscoveryChannelSetSelectionSummary", () => {
  it("summarizes active generated selection", () => {
    const activeGeneratedTaskIds = ["a", "b"];
    const selectedTaskIdSet = new Set(["a", "stale"]);

    const result = buildDiscoveryChannelSetSelectionSummary(activeGeneratedTaskIds, selectedTaskIdSet);

    expect(result.selectedActiveGeneratedTaskCount).toBe(1);
    expect(result.allActiveGeneratedTasksSelected).toBe(false);
  });

  it("marks all selected when every active generated task is selected", () => {
    const activeGeneratedTaskIds = ["a", "b"];
    const selectedTaskIdSet = new Set(["a", "b"]);

    const result = buildDiscoveryChannelSetSelectionSummary(activeGeneratedTaskIds, selectedTaskIdSet);

    expect(result.selectedActiveGeneratedTaskCount).toBe(2);
    expect(result.allActiveGeneratedTasksSelected).toBe(true);
  });

  it("returns false for allActiveGeneratedTasksSelected when no active generated tasks", () => {
    const activeGeneratedTaskIds: string[] = [];
    const selectedTaskIdSet = new Set(["a"]);

    const result = buildDiscoveryChannelSetSelectionSummary(activeGeneratedTaskIds, selectedTaskIdSet);

    expect(result.selectedActiveGeneratedTaskCount).toBe(0);
    expect(result.allActiveGeneratedTasksSelected).toBe(false);
  });
});
