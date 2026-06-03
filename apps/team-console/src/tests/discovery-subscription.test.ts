import { describe, it, expect } from "vitest";
import type { TeamCanvasTask } from "../api/team-types";
import {
  selectOpenDiscoveryRootIds,
  selectDiscoveryCatalogTaskIdsToLoad,
  pruneDiscoverySubscriptionStateForOpenIds,
} from "../app/team-console-discovery-subscription";
import type { DiscoverySubscriptionState } from "../app/team-console-discovery-subscription";

function discoveryTask(taskId: string): TeamCanvasTask {
  return {
    taskId,
    canvasKind: "discovery",
    title: `Discovery ${taskId}`,
    leaderAgentId: "main",
    status: "ready",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    archived: false,
    workUnit: {
      title: `Discovery ${taskId}`,
      input: { text: "discover" },
      outputContract: { text: "output" },
      acceptance: { rules: ["ok"] },
      workerAgentId: "main",
      checkerAgentId: "main",
    },
  };
}

function normalTask(taskId: string): TeamCanvasTask {
  return {
    taskId,
    title: `Task ${taskId}`,
    leaderAgentId: "main",
    status: "ready",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    archived: false,
    workUnit: {
      title: `Task ${taskId}`,
      input: { text: "work" },
      outputContract: { text: "output" },
      acceptance: { rules: ["ok"] },
      workerAgentId: "main",
      checkerAgentId: "main",
    },
  };
}

function generatedTask(taskId: string, discoveryTaskId: string): TeamCanvasTask {
  return {
    taskId,
    title: `Generated ${taskId}`,
    leaderAgentId: "main",
    status: "ready",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    archived: false,
    generatedSource: {
      schemaVersion: "team/generated-task-source-1",
      sourceDiscoveryTaskId: discoveryTaskId,
      sourceItemId: taskId,
      itemStatus: "active",
      itemPayload: {},
      workUnitMode: "managed",
    },
    workUnit: {
      title: `Generated ${taskId}`,
      input: { text: "work" },
      outputContract: { text: "output" },
      acceptance: { rules: ["ok"] },
      workerAgentId: "main",
      checkerAgentId: "main",
    },
  };
}

describe("selectOpenDiscoveryRootIds", () => {
  it("returns only open root Discovery task IDs", () => {
    const d1 = discoveryTask("disc-1");
    const d2 = discoveryTask("disc-2");
    const tasks = [normalTask("task-a"), d1, d2, generatedTask("gen-1", "disc-1")];
    const result = selectOpenDiscoveryRootIds(tasks, ["disc-1", "disc-2"]);
    expect(result).toEqual(["disc-1", "disc-2"]);
  });

  it("ignores normal task IDs", () => {
    const tasks = [normalTask("task-a"), discoveryTask("disc-1")];
    const result = selectOpenDiscoveryRootIds(tasks, ["task-a", "disc-1"]);
    expect(result).toEqual(["disc-1"]);
  });

  it("ignores generated child IDs even if listed as open", () => {
    const tasks = [discoveryTask("disc-1"), generatedTask("gen-1", "disc-1")];
    const result = selectOpenDiscoveryRootIds(tasks, ["gen-1", "disc-1"]);
    expect(result).toEqual(["disc-1"]);
  });

  it("returns empty when no open IDs match Discovery roots", () => {
    const tasks = [discoveryTask("disc-1")];
    const result = selectOpenDiscoveryRootIds(tasks, ["unknown-id"]);
    expect(result).toEqual([]);
  });

  it("preserves open ID order", () => {
    const d2 = discoveryTask("disc-2");
    const d1 = discoveryTask("disc-1");
    const tasks = [d2, d1];
    const result = selectOpenDiscoveryRootIds(tasks, ["disc-2", "disc-1"]);
    expect(result).toEqual(["disc-2", "disc-1"]);
  });
});

describe("selectDiscoveryCatalogTaskIdsToLoad", () => {
  it("excludes already loaded IDs", () => {
    const tasks = [discoveryTask("disc-1"), discoveryTask("disc-2")];
    const result = selectDiscoveryCatalogTaskIdsToLoad({
      rootTasks: tasks,
      openDiscoveryTaskIds: ["disc-1", "disc-2"],
      loadedTaskIds: new Set(["disc-1"]),
      loadingTaskIds: new Set(),
    });
    expect(result).toEqual(["disc-2"]);
  });

  it("excludes currently loading IDs", () => {
    const tasks = [discoveryTask("disc-1"), discoveryTask("disc-2")];
    const result = selectDiscoveryCatalogTaskIdsToLoad({
      rootTasks: tasks,
      openDiscoveryTaskIds: ["disc-1", "disc-2"],
      loadedTaskIds: new Set(),
      loadingTaskIds: new Set(["disc-1"]),
    });
    expect(result).toEqual(["disc-2"]);
  });

  it("excludes both loaded and loading IDs", () => {
    const tasks = [discoveryTask("disc-1"), discoveryTask("disc-2"), discoveryTask("disc-3")];
    const result = selectDiscoveryCatalogTaskIdsToLoad({
      rootTasks: tasks,
      openDiscoveryTaskIds: ["disc-1", "disc-2", "disc-3"],
      loadedTaskIds: new Set(["disc-1"]),
      loadingTaskIds: new Set(["disc-2"]),
    });
    expect(result).toEqual(["disc-3"]);
  });

  it("preserves open ID order for eligible IDs", () => {
    const tasks = [discoveryTask("disc-3"), discoveryTask("disc-1"), discoveryTask("disc-2")];
    const result = selectDiscoveryCatalogTaskIdsToLoad({
      rootTasks: tasks,
      openDiscoveryTaskIds: ["disc-3", "disc-1", "disc-2"],
      loadedTaskIds: new Set(["disc-3"]),
      loadingTaskIds: new Set(),
    });
    expect(result).toEqual(["disc-1", "disc-2"]);
  });

  it("returns empty when all are loaded or loading", () => {
    const tasks = [discoveryTask("disc-1")];
    const result = selectDiscoveryCatalogTaskIdsToLoad({
      rootTasks: tasks,
      openDiscoveryTaskIds: ["disc-1"],
      loadedTaskIds: new Set(["disc-1"]),
      loadingTaskIds: new Set(),
    });
    expect(result).toEqual([]);
  });
});

describe("pruneDiscoverySubscriptionStateForOpenIds", () => {
  function makeState(overrides?: Partial<DiscoverySubscriptionState>): DiscoverySubscriptionState {
    return {
      loadedTaskIds: new Set(overrides?.loadedTaskIds ?? []),
      loadingTaskIds: new Set(overrides?.loadingTaskIds ?? []),
      generatedCatalogVersionByTaskId: overrides?.generatedCatalogVersionByTaskId ?? {},
      generatedRunSummaryVersionByTaskId: overrides?.generatedRunSummaryVersionByTaskId ?? {},
    };
  }

  it("removes closed IDs from loaded set", () => {
    const state = makeState({ loadedTaskIds: new Set(["disc-1", "disc-2"]) });
    const result = pruneDiscoverySubscriptionStateForOpenIds(state, ["disc-1"]);
    expect([...result.loadedTaskIds]).toEqual(["disc-1"]);
  });

  it("removes closed IDs from loading set", () => {
    const state = makeState({ loadingTaskIds: new Set(["disc-1", "disc-2"]) });
    const result = pruneDiscoverySubscriptionStateForOpenIds(state, ["disc-2"]);
    expect([...result.loadingTaskIds]).toEqual(["disc-2"]);
  });

  it("deletes generated catalog cursor for closed IDs", () => {
    const state = makeState({
      generatedCatalogVersionByTaskId: {
        "disc-1": "v1",
        "disc-2": "v2",
      },
    });
    const result = pruneDiscoverySubscriptionStateForOpenIds(state, ["disc-1"]);
    expect(result.generatedCatalogVersionByTaskId).toEqual({ "disc-1": "v1" });
  });

  it("deletes generated run summary cursor for closed IDs", () => {
    const state = makeState({
      generatedRunSummaryVersionByTaskId: {
        "disc-1": "r1",
        "disc-2": "r2",
      },
    });
    const result = pruneDiscoverySubscriptionStateForOpenIds(state, ["disc-1"]);
    expect(result.generatedRunSummaryVersionByTaskId).toEqual({ "disc-1": "r1" });
  });

  it("does not mutate input state", () => {
    const originalLoaded = new Set(["disc-1", "disc-2"]);
    const originalLoading = new Set(["disc-3"]);
    const originalCatalogVersion = { "disc-1": "v1", "disc-2": "v2" };
    const originalRunVersion = { "disc-1": "r1" };
    const state = makeState({
      loadedTaskIds: originalLoaded,
      loadingTaskIds: originalLoading,
      generatedCatalogVersionByTaskId: originalCatalogVersion,
      generatedRunSummaryVersionByTaskId: originalRunVersion,
    });
    pruneDiscoverySubscriptionStateForOpenIds(state, ["disc-1"]);
    expect([...originalLoaded]).toEqual(["disc-1", "disc-2"]);
    expect([...originalLoading]).toEqual(["disc-3"]);
    expect(originalCatalogVersion).toEqual({ "disc-1": "v1", "disc-2": "v2" });
    expect(originalRunVersion).toEqual({ "disc-1": "r1" });
  });

  it("sets shouldClearTimers true when no subcanvas is open", () => {
    const state = makeState({
      loadedTaskIds: new Set(["disc-1"]),
      generatedCatalogVersionByTaskId: { "disc-1": "v1" },
    });
    const result = pruneDiscoverySubscriptionStateForOpenIds(state, []);
    expect(result.shouldClearTimers).toBe(true);
  });

  it("sets shouldClearTimers false when subcanvases remain open", () => {
    const state = makeState({
      loadedTaskIds: new Set(["disc-1"]),
    });
    const result = pruneDiscoverySubscriptionStateForOpenIds(state, ["disc-1"]);
    expect(result.shouldClearTimers).toBe(false);
  });

  it("prunes all state when open list becomes empty", () => {
    const state = makeState({
      loadedTaskIds: new Set(["disc-1", "disc-2"]),
      loadingTaskIds: new Set(["disc-3"]),
      generatedCatalogVersionByTaskId: { "disc-1": "v1", "disc-2": "v2" },
      generatedRunSummaryVersionByTaskId: { "disc-1": "r1" },
    });
    const result = pruneDiscoverySubscriptionStateForOpenIds(state, []);
    expect([...result.loadedTaskIds]).toEqual([]);
    expect([...result.loadingTaskIds]).toEqual([]);
    expect(result.generatedCatalogVersionByTaskId).toEqual({});
    expect(result.generatedRunSummaryVersionByTaskId).toEqual({});
    expect(result.shouldClearTimers).toBe(true);
  });
});
